import { randomBytes, randomUUID } from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { ZodError } from 'zod'
import { config } from './config'
import { db, transaction } from './db'
import { createSession, requireAuth, requireFamilyRole, sha256 } from './auth'
import { exchangeWechatCode } from './wechat'
import {
  birthdaySubscriptionSchema, familySchema, invitationSchema,
  legacyFamilyImportSchema, linkMemberSchema, loginSchema, memberSchema,
} from './schemas'
import { AppError, type AuthenticatedRequest, type FamilyRole } from './types'
import { BIRTHDAY_TEMPLATE } from './birthdayTemplate'
import { getBeijingClock } from './birthdayClock'
import { generateBirthdayWish } from './deepseek'

const now = (): string => new Date().toISOString()

const birthdayWishRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

const routeParam = (request: Request, name: string): string => {
  const value = request.params[name]
  if (typeof value !== 'string') throw new AppError(400, `缺少路径参数 ${name}`)
  return value
}

const audit = (
  familyId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: Record<string, unknown> = {},
): void => {
  db.prepare(`
    INSERT INTO audit_logs (id, family_id, user_id, action, entity_type, entity_id, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), familyId, userId, action, entityType, entityId, JSON.stringify(detail), now())
}

interface MemberRow {
  id: string
  name: string
  nickname: string | null
  relation_label: string
  birth_year: number | null
  gender: 'male' | 'female' | 'unknown'
  birthday_type: 'solar' | 'lunar' | null
  birth_month: number | null
  birth_day: number | null
  is_leap_month: number
  created_at: string
}

const isBirthdayToday = (member: MemberRow): boolean => {
  const clock = getBeijingClock()
  if (member.birthday_type === 'solar') {
    return member.birth_month === clock.month && member.birth_day === clock.day
  }
  if (member.birthday_type === 'lunar') {
    return member.birth_month === clock.lunarMonth && member.birth_day === clock.lunarDay
      && (member.is_leap_month === 1) === clock.lunarLeap
  }
  return false
}

const buildBirthdayPrompt = (member: MemberRow): string => {
  const age = member.birth_year ? getBeijingClock().year - member.birth_year : null
  return `请模仿中国家庭微信群生日祝福风格生成文案。
要求：
- 温馨自然
- 不要太正式
- 适合发亲戚群
- 带 emoji
- 可以带微信表情：[蛋糕][庆祝][玫瑰]
- 不同年龄层语气不同

生日的人：
姓名：${member.name}${member.nickname ? `（${member.nickname}）` : ''}
称呼：${member.relation_label}
性别：${member.gender === 'male' ? '男' : '女'}
年龄：${age !== null ? `${age}岁` : '未知'}
生日：${member.birthday_type === 'lunar' ? `农历${member.is_leap_month ? '闰' : ''}` : '阳历'}${member.birth_month}月${member.birth_day}日`
}

interface RelationshipRow {
  id: string
  from_member_id: string
  to_member_id: string
  type: 'parent' | 'spouse'
}

const inferGenerations = (
  memberIds: string[],
  relationships: RelationshipRow[],
): Map<string, number> => {
  const memberSet = new Set(memberIds)
  const neighbors = new Map<string, Array<{ id: string; offset: number }>>()
  memberIds.forEach(id => neighbors.set(id, []))

  relationships.forEach(relationship => {
    if (!memberSet.has(relationship.from_member_id) || !memberSet.has(relationship.to_member_id)) return
    const offset = relationship.type === 'parent' ? 1 : 0
    neighbors.get(relationship.from_member_id)?.push({ id: relationship.to_member_id, offset })
    neighbors.get(relationship.to_member_id)?.push({ id: relationship.from_member_id, offset: -offset })
  })

  const inferred = new Map<string, number>()
  memberIds.forEach(startId => {
    if (inferred.has(startId)) return

    const component: string[] = [startId]
    const queue: string[] = [startId]
    inferred.set(startId, 0)

    while (queue.length > 0) {
      const currentId = queue.shift()!
      const currentGeneration = inferred.get(currentId)!
      for (const neighbor of neighbors.get(currentId) ?? []) {
        const expected = currentGeneration + neighbor.offset
        const existing = inferred.get(neighbor.id)
        if (existing !== undefined && existing !== expected) {
          throw new AppError(400, '家庭关系存在代际矛盾，请检查父母或配偶关系', 'INVALID_GENERATION_RELATIONSHIP')
        }
        if (existing === undefined) {
          inferred.set(neighbor.id, expected)
          component.push(neighbor.id)
          queue.push(neighbor.id)
        }
      }
    }

    const minGeneration = Math.min(...component.map(id => inferred.get(id)!))
    component.forEach(id => inferred.set(id, inferred.get(id)! - minGeneration + 1))
    if (component.some(id => inferred.get(id)! > 20)) {
      throw new AppError(400, '家庭关系超过 20 代，请检查父母关系', 'GENERATION_LIMIT_EXCEEDED')
    }
  })

  return inferred
}

const syncFamilyGenerations = (familyId: string): void => {
  const memberIds = db.prepare('SELECT id FROM members WHERE family_id = ?')
    .all(familyId) as unknown as Array<{ id: string }>
  const relationships = db.prepare(`
    SELECT id, from_member_id, to_member_id, type
    FROM relationships WHERE family_id = ?
  `).all(familyId) as unknown as RelationshipRow[]
  const generations = inferGenerations(memberIds.map(member => member.id), relationships)
  const updateGeneration = db.prepare('UPDATE members SET generation = ? WHERE id = ? AND family_id = ?')
  generations.forEach((generation, memberId) => {
    updateGeneration.run(generation, memberId, familyId)
  })
}

const getSnapshot = (familyId: string) => {
  const members = db.prepare(`
    SELECT id, name, nickname, relation_label, birth_year,
           gender, birthday_type, birth_month, birth_day, is_leap_month, created_at
    FROM members WHERE family_id = ?
  `).all(familyId) as unknown as MemberRow[]
  const relationships = db.prepare(`
    SELECT id, from_member_id, to_member_id, type
    FROM relationships WHERE family_id = ?
  `).all(familyId) as unknown as RelationshipRow[]
  const generations = inferGenerations(members.map(member => member.id), relationships)
  members.sort((a, b) => (generations.get(a.id)! - generations.get(b.id)!) || a.created_at.localeCompare(b.created_at))

  return {
    members: members.map(member => {
      const parentIds = relationships
        .filter(item => item.type === 'parent' && item.to_member_id === member.id)
        .map(item => item.from_member_id)
      const spouse = relationships.find(item =>
        item.type === 'spouse' &&
        (item.from_member_id === member.id || item.to_member_id === member.id))
      const spouseId = spouse
        ? (spouse.from_member_id === member.id ? spouse.to_member_id : spouse.from_member_id)
        : null
      return {
        id: member.id,
        parentIds,
        spouseId,
        generation: generations.get(member.id) ?? 1,
        name: member.name,
        nickName: member.nickname ?? undefined,
        relation: member.relation_label,
        birthYear: member.birth_year,
        gender: member.gender,
        birthdayType: member.birthday_type,
        birthMonth: member.birth_month,
        birthDay: member.birth_day,
        isLeapMonth: member.is_leap_month === 1,
      }
    }),
    relationships: relationships.map(item => ({
      id: item.id,
      fromMemberId: item.from_member_id,
      toMemberId: item.to_member_id,
      type: item.type,
    })),
  }
}

const assertMemberInFamily = (memberId: string, familyId: string): void => {
  const found = db.prepare('SELECT 1 FROM members WHERE id = ? AND family_id = ?').get(memberId, familyId)
  if (!found) throw new AppError(400, '关联成员不存在或不属于当前家庭', 'INVALID_RELATED_MEMBER')
}

const replaceMemberRelationships = (
  familyId: string,
  memberId: string,
  parentIds: string[],
  spouseId: string | null | undefined,
  userId: string,
): void => {
  if (parentIds.includes(memberId)) {
    throw new AppError(400, '成员不能设为自己的父母', 'INVALID_RELATED_MEMBER')
  }
  db.prepare("DELETE FROM relationships WHERE family_id = ? AND to_member_id = ? AND type = 'parent'")
    .run(familyId, memberId)
  parentIds.forEach(parentId => {
    if (parentId === memberId) {
      throw new AppError(400, '成员不能设为自己的父母', 'INVALID_RELATED_MEMBER')
    }
    assertMemberInFamily(parentId, familyId)
    db.prepare(`
      INSERT INTO relationships (id, family_id, from_member_id, to_member_id, type, created_by, created_at)
      VALUES (?, ?, ?, ?, 'parent', ?, ?)
    `).run(randomUUID(), familyId, parentId, memberId, userId, now())
  })

  if (spouseId !== undefined) {
    if (spouseId === memberId) {
      throw new AppError(400, '成员不能设为自己的配偶', 'INVALID_RELATED_MEMBER')
    }
    if (spouseId) {
      assertMemberInFamily(spouseId, familyId)
      const occupied = db.prepare(`
        SELECT 1 FROM relationships
        WHERE family_id = ? AND type = 'spouse'
          AND (from_member_id = ? OR to_member_id = ?)
          AND from_member_id <> ? AND to_member_id <> ?
      `).get(familyId, spouseId, spouseId, memberId, memberId)
      if (occupied) throw new AppError(400, '所选成员已有配偶，请先解除原关系', 'SPOUSE_ALREADY_LINKED')
    }
    db.prepare(`
      DELETE FROM relationships
      WHERE family_id = ? AND type = 'spouse' AND (from_member_id = ? OR to_member_id = ?)
    `).run(familyId, memberId, memberId)
    if (spouseId) {
      const [fromId, toId] = [memberId, spouseId].sort()
      db.prepare(`
        INSERT OR IGNORE INTO relationships
          (id, family_id, from_member_id, to_member_id, type, created_by, created_at)
        VALUES (?, ?, ?, ?, 'spouse', ?, ?)
      `).run(randomUUID(), familyId, fromId, toId, userId, now())
    }
  }
}

export const app = express()
app.set('trust proxy', 1)
app.use(helmet())
app.use(express.json({ limit: '256kb' }))
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }))

app.get('/health', (_request, response) => {
  response.json({ ok: true, time: now() })
})

app.post('/api/auth/wechat', async (request, response) => {
  const input = loginSchema.parse(request.body)
  let identity: { openid: string; unionid?: string }
  if ('devOpenid' in input && input.devOpenid) {
    if (!config.allowDevLogin) throw new AppError(403, '本地登录未启用', 'DEV_LOGIN_DISABLED')
    identity = { openid: `dev:${input.devOpenid}` }
  } else if ('code' in input && input.code) {
    identity = await exchangeWechatCode(input.code)
  } else {
    throw new AppError(400, '缺少登录凭证')
  }

  const timestamp = now()
  let user = db.prepare('SELECT id, openid, nickname, avatar_url FROM users WHERE openid = ?')
    .get(identity.openid) as { id: string; openid: string; nickname: string | null; avatar_url: string | null } | undefined
  if (!user) {
    const id = randomUUID()
    db.prepare(`
      INSERT INTO users (id, openid, unionid, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    `).run(id, identity.openid, identity.unionid ?? null, timestamp, timestamp)
    user = { id, openid: identity.openid, nickname: null, avatar_url: null }
  }
  const session = createSession(user.id)
  const families = db.prepare(`
    SELECT families.id, families.name, families.description, family_users.role
    FROM family_users JOIN families ON families.id = family_users.family_id
    WHERE family_users.user_id = ? ORDER BY families.updated_at DESC
  `).all(user.id)
  response.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: { id: user.id, nickname: user.nickname, avatarUrl: user.avatar_url },
    families,
  })
})

app.use('/api', requireAuth as never)

app.delete('/api/auth/session', (request: Request, response) => {
  const authorization = request.header('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
  response.status(204).send()
})

app.get('/api/families', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const families = db.prepare(`
    SELECT families.id, families.name, families.description, family_users.role,
           family_users.linked_member_id AS linkedMemberId,
           (SELECT COUNT(*) FROM members WHERE members.family_id = families.id) AS memberCount
    FROM family_users JOIN families ON families.id = family_users.family_id
    WHERE family_users.user_id = ? ORDER BY families.updated_at DESC
  `).all(authUser.id)
  response.json({ families })
})

app.post('/api/families', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const input = familySchema.parse(request.body)
  const familyId = randomUUID()
  const timestamp = now()
  transaction(() => {
    db.prepare(`
      INSERT INTO families (id, name, description, owner_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(familyId, input.name, input.description, authUser.id, timestamp, timestamp)
    db.prepare(`
      INSERT INTO family_users (family_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)
    `).run(familyId, authUser.id, timestamp)
    audit(familyId, authUser.id, 'create', 'family', familyId)
  })
  response.status(201).json({ family: { id: familyId, ...input, role: 'owner', memberCount: 0 } })
})

app.get('/api/families/:familyId/snapshot', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const role = requireFamilyRole(authUser.id, familyId, 'viewer')
  const family = db.prepare(`
    SELECT families.id, families.name, families.description,
           family_users.linked_member_id AS linkedMemberId,
           (SELECT COUNT(*) FROM members WHERE members.family_id = families.id) AS memberCount
    FROM families JOIN family_users ON family_users.family_id = families.id
    WHERE families.id = ? AND family_users.user_id = ?
  `).get(familyId, authUser.id)
  response.json({ family: { ...family as object, role }, ...getSnapshot(familyId) })
})

app.patch('/api/families/:familyId/me', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  requireFamilyRole(authUser.id, familyId, 'viewer')
  const input = linkMemberSchema.parse(request.body)
  if (input.memberId) assertMemberInFamily(input.memberId, familyId)
  db.prepare(`
    UPDATE family_users SET linked_member_id = ? WHERE family_id = ? AND user_id = ?
  `).run(input.memberId, familyId, authUser.id)
  response.json({ linkedMemberId: input.memberId })
})

app.get('/api/families/:familyId/birthday-subscriptions/config', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  requireFamilyRole(authUser.id, familyId, 'viewer')
  const row = db.prepare(`
    SELECT COUNT(*) AS count FROM birthday_subscription_grants
    WHERE family_id = ? AND user_id = ? AND template_id = ? AND status = 'active'
  `).get(familyId, authUser.id, BIRTHDAY_TEMPLATE.id) as { count: number }
  response.json({
    configured: !!config.wechatAppId && !!config.wechatAppSecret,
    templateId: BIRTHDAY_TEMPLATE.id,
    activeGrantCount: row.count,
    sendTime: '08:00',
    timeZone: 'Asia/Shanghai',
    subscriptionMode: BIRTHDAY_TEMPLATE.subscriptionMode,
  })
})

app.post('/api/families/:familyId/birthday-subscriptions', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  requireFamilyRole(authUser.id, familyId, 'viewer')
  if (!config.wechatAppId || !config.wechatAppSecret) {
    throw new AppError(503, '生日提醒服务尚未启用', 'BIRTHDAY_REMINDER_DISABLED')
  }
  const input = birthdaySubscriptionSchema.parse(request.body)
  if (input.templateId !== BIRTHDAY_TEMPLATE.id) {
    throw new AppError(400, '订阅模板与服务端配置不一致', 'INVALID_SUBSCRIPTION_TEMPLATE')
  }
  const grantId = randomUUID()
  db.prepare(`
    INSERT INTO birthday_subscription_grants
      (id, family_id, user_id, template_id, status, granted_at)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).run(grantId, familyId, authUser.id, input.templateId, now())
  audit(familyId, authUser.id, 'grant', 'birthday_subscription', grantId)
  response.status(201).json({ grantId })
})

app.post('/api/families/:familyId/members/:memberId/birthday-wish', birthdayWishRateLimit, async (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const memberId = routeParam(request, 'memberId')
  requireFamilyRole(authUser.id, familyId, 'viewer')
  const member = db.prepare(`
    SELECT id, name, nickname, relation_label, birth_year,
           gender, birthday_type, birth_month, birth_day, is_leap_month, created_at
    FROM members WHERE id = ? AND family_id = ?
  `).get(memberId, familyId) as unknown as MemberRow | undefined
  if (!member) throw new AppError(404, '家庭成员不存在', 'MEMBER_NOT_FOUND')
  if (!isBirthdayToday(member)) {
    throw new AppError(400, '仅可在成员生日当天生成祝福', 'NOT_MEMBER_BIRTHDAY')
  }
  const wish = await generateBirthdayWish(buildBirthdayPrompt(member))
  response.json({ wish })
})

app.post('/api/families/:familyId/members', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  requireFamilyRole(authUser.id, familyId, 'editor')
  const input = memberSchema.parse(request.body)
  const memberId = randomUUID()
  const timestamp = now()
  transaction(() => {
    db.prepare(`
      INSERT INTO members (
        id, family_id, generation, name, nickname, relation_label,
        birth_year, gender, birthday_type, birth_month, birth_day, is_leap_month,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memberId, familyId, 1, input.name, input.nickName ?? null,
      input.relation, input.birthYear, input.gender, input.birthdayType, input.birthMonth,
      input.birthDay, input.isLeapMonth ? 1 : 0, authUser.id, timestamp, timestamp,
    )
    replaceMemberRelationships(familyId, memberId, input.parentIds, input.spouseId, authUser.id)
    syncFamilyGenerations(familyId)
    db.prepare('UPDATE families SET updated_at = ? WHERE id = ?').run(timestamp, familyId)
    audit(familyId, authUser.id, 'create', 'member', memberId, { name: input.name })
  })
  response.status(201).json({ memberId, ...getSnapshot(familyId) })
})

app.post('/api/families/:familyId/import-legacy', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  requireFamilyRole(authUser.id, familyId, 'owner')
  const input = legacyFamilyImportSchema.parse(request.body)
  const timestamp = now()
  const idMap = new Map(input.members.map(member => [member.id, randomUUID()]))

  transaction(() => {
    const existing = db.prepare('SELECT COUNT(*) AS count FROM members WHERE family_id = ?')
      .get(familyId) as { count: number }
    if (existing.count > 0) {
      throw new AppError(409, '仅可向空家庭导入旧数据', 'FAMILY_NOT_EMPTY')
    }

    const insertMember = db.prepare(`
      INSERT INTO members (
        id, family_id, generation, name, nickname, relation_label,
        birth_year, gender, birthday_type, birth_month, birth_day, is_leap_month,
        created_by, created_at, updated_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    input.members.forEach(member => {
      insertMember.run(
        idMap.get(member.id)!, familyId, member.name, member.nickName ?? null, member.relation,
        member.birthYear, member.gender, member.birthdayType, member.birthMonth, member.birthDay,
        member.isLeapMonth ? 1 : 0, authUser.id, timestamp, timestamp,
      )
    })

    const insertRelationship = db.prepare(`
      INSERT INTO relationships
        (id, family_id, from_member_id, to_member_id, type, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    input.members.forEach(member => {
      if (member.parentId) {
        insertRelationship.run(
          randomUUID(), familyId, idMap.get(member.parentId)!, idMap.get(member.id)!,
          'parent', authUser.id, timestamp,
        )
      }
    })

    const importedSpouses = new Set<string>()
    input.members.forEach(member => {
      if (!member.spouseId) return
      const legacyPair = [member.id, member.spouseId].sort()
      const pairKey = legacyPair.join('\u0000')
      if (importedSpouses.has(pairKey)) return
      importedSpouses.add(pairKey)
      const memberPair = legacyPair.map(legacyId => idMap.get(legacyId)!).sort()
      insertRelationship.run(
        randomUUID(), familyId, memberPair[0], memberPair[1],
        'spouse', authUser.id, timestamp,
      )
    })

    syncFamilyGenerations(familyId)
    if (input.linkedLegacyId) {
      db.prepare(`
        UPDATE family_users SET linked_member_id = ? WHERE family_id = ? AND user_id = ?
      `).run(idMap.get(input.linkedLegacyId)!, familyId, authUser.id)
    }
    db.prepare('UPDATE families SET updated_at = ? WHERE id = ?').run(timestamp, familyId)
    audit(familyId, authUser.id, 'import', 'family', familyId, { memberCount: input.members.length })
  })

  response.status(201).json({
    memberCount: input.members.length,
    linkedMemberId: input.linkedLegacyId ? idMap.get(input.linkedLegacyId) : null,
  })
})

app.patch('/api/families/:familyId/members/:memberId', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const memberId = routeParam(request, 'memberId')
  requireFamilyRole(authUser.id, familyId, 'editor')
  assertMemberInFamily(memberId, familyId)
  const input = memberSchema.parse(request.body)
  const timestamp = now()
  transaction(() => {
    db.prepare(`
      UPDATE members SET name = ?, nickname = ?, relation_label = ?,
        birth_year = ?, gender = ?, birthday_type = ?, birth_month = ?, birth_day = ?,
        is_leap_month = ?, updated_at = ? WHERE id = ? AND family_id = ?
    `).run(
      input.name, input.nickName ?? null, input.relation,
      input.birthYear, input.gender, input.birthdayType, input.birthMonth, input.birthDay,
      input.isLeapMonth ? 1 : 0, timestamp, memberId, familyId,
    )
    replaceMemberRelationships(familyId, memberId, input.parentIds, input.spouseId, authUser.id)
    syncFamilyGenerations(familyId)
    db.prepare('UPDATE families SET updated_at = ? WHERE id = ?').run(timestamp, familyId)
    audit(familyId, authUser.id, 'update', 'member', memberId, { name: input.name })
  })
  response.json({ ...getSnapshot(familyId) })
})

app.delete('/api/families/:familyId/members/:memberId', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const memberId = routeParam(request, 'memberId')
  requireFamilyRole(authUser.id, familyId, 'editor')
  assertMemberInFamily(memberId, familyId)
  transaction(() => {
    db.prepare('UPDATE family_users SET linked_member_id = NULL WHERE linked_member_id = ?').run(memberId)
    db.prepare('DELETE FROM members WHERE id = ? AND family_id = ?').run(memberId, familyId)
    syncFamilyGenerations(familyId)
    db.prepare('UPDATE families SET updated_at = ? WHERE id = ?').run(now(), familyId)
    audit(familyId, authUser.id, 'delete', 'member', memberId)
  })
  response.status(204).send()
})

app.post('/api/families/:familyId/invitations', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  requireFamilyRole(authUser.id, familyId, 'admin')
  const input = invitationSchema.parse(request.body)
  const code = randomBytes(9).toString('base64url')
  const expiresAt = new Date(Date.now() + input.expiresInHours * 3600000).toISOString()
  db.prepare(`
    INSERT INTO invitations
      (id, family_id, code_hash, role, max_uses, expires_at, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), familyId, sha256(code), input.role, input.maxUses, expiresAt, authUser.id, now())
  audit(familyId, authUser.id, 'create', 'invitation', familyId, { role: input.role, expiresAt })
  response.status(201).json({ code, expiresAt, role: input.role, maxUses: input.maxUses })
})

app.post('/api/invitations/:code/accept', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const invitation = db.prepare(`
    SELECT id, family_id, role, max_uses, used_count, expires_at FROM invitations WHERE code_hash = ?
  `).get(sha256(routeParam(request, 'code'))) as unknown as {
    id: string; family_id: string; role: FamilyRole; max_uses: number; used_count: number; expires_at: string
  } | undefined
  if (!invitation || invitation.expires_at <= now() || invitation.used_count >= invitation.max_uses) {
    throw new AppError(404, '邀请码不存在或已失效', 'INVITATION_INVALID')
  }
  transaction(() => {
    const joined = db.prepare(`
      INSERT OR IGNORE INTO family_users (family_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)
    `).run(invitation.family_id, authUser.id, invitation.role, now())
    if (Number(joined.changes) > 0) {
      db.prepare('UPDATE invitations SET used_count = used_count + 1 WHERE id = ?').run(invitation.id)
    }
    audit(invitation.family_id, authUser.id, 'accept', 'invitation', invitation.id)
  })
  response.json({ familyId: invitation.family_id })
})

app.use((request, _response, next) => {
  next(new AppError(404, `接口不存在：${request.method} ${request.path}`, 'NOT_FOUND'))
})

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: '提交的数据格式不正确', details: error.flatten() },
    })
    return
  }
  if (error instanceof AppError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } })
    return
  }
  console.error(error)
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } })
})
