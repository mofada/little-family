import { randomBytes, randomUUID } from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { ZodError } from 'zod'
import { config } from './config'
import { db, transaction } from './db'
import { createSession, requireAuth, requireFamilyRole, resolveWechatUser, sha256 } from './auth'
import { exchangeWechatCode, exchangeWechatWebsiteCode } from './wechat'
import {
  birthdaySubscriptionSchema, birthdayWishRequestSchema, familySchema, invitationSchema,
  legacyFamilyImportSchema, linkMemberSchema, loginSchema, memberLinkRequestDecisionSchema, memberSchema,
  wechatWebLoginSchema, webLoginSchema,
} from './schemas'
import { AppError, type AuthenticatedRequest, type FamilyRole } from './types'
import { BIRTHDAY_TEMPLATE } from './birthdayTemplate'
import { getBeijingClock } from './birthdayClock'
import { runBirthdayReminderJob } from './birthdayReminders'
import { generateBirthdayWish, generateKinshipLabels, type KinshipLabelRequest } from './deepseek'
import { buildBirthdayWishPrompt } from './birthdayWishPrompt'

const now = (): string => new Date().toISOString()

const birthdayWishRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

const birthdayReminderTestRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

const webLoginRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

const wechatWebLoginRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

const invitationPreviewRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 30,
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

const logKinship = (event: string, detail: Record<string, unknown>, level: 'info' | 'error' = 'info'): void => {
  const logger = level === 'error' ? console.error : console.info
  logger('[kinship]', JSON.stringify({ event, ...detail }))
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
  is_claimed?: number
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

interface RelationshipRow {
  id: string
  from_member_id: string
  to_member_id: string
  type: 'parent' | 'spouse'
}

interface KinshipLabelRow {
  to_member_id: string
  label: string
}

const FALLBACK_KINSHIP_LABEL = '亲友'
const sanitizeKinshipLabel = (label: string): string =>
  label.trim().replace(/[`“”"'，。,.;；:：\s]/g, '').slice(0, 20)

const memberBirthdayForAi = (member: MemberRow) => {
  if (member.birth_year === null && member.birthday_type === null
    && member.birth_month === null && member.birth_day === null) return null
  return {
    calendar: member.birthday_type,
    year: member.birth_year,
    month: member.birth_month,
    day: member.birth_day,
    isLeapMonth: member.is_leap_month === 1,
  }
}

type AiBirthday = ReturnType<typeof memberBirthdayForAi>
type AiPathStep = {
  memberId: string
  relation: string
  gender: MemberRow['gender']
  birthday: AiBirthday
}

const parentRelationForAi = (member: MemberRow): string =>
  member.gender === 'male' ? '爸爸' : member.gender === 'female' ? '妈妈' : '父母'

const childRelationForAi = (member: MemberRow): string =>
  member.gender === 'male' ? '儿子' : member.gender === 'female' ? '女儿' : '子女'

const spouseRelationForAi = (member: MemberRow): string =>
  member.gender === 'male' ? '丈夫' : member.gender === 'female' ? '妻子' : '配偶'

const compareBirthdaysForAi = (
  target: AiBirthday,
  reference: AiBirthday,
): 'older' | 'younger' | 'same-birthday' | 'unknown' => {
  if (target?.year == null || reference?.year == null) return 'unknown'
  if (target.year !== reference.year) return target.year < reference.year ? 'older' : 'younger'
  if (target.calendar !== reference.calendar
    || target.month == null || target.day == null
    || reference.month == null || reference.day == null) return 'unknown'
  const targetOrder = target.month * 100 + target.day + (target.isLeapMonth ? 0.5 : 0)
  const referenceOrder = reference.month * 100 + reference.day + (reference.isLeapMonth ? 0.5 : 0)
  if (targetOrder === referenceOrder) return 'same-birthday'
  return targetOrder < referenceOrder ? 'older' : 'younger'
}

const buildKinshipContextPaths = (
  viewerMemberId: string,
  members: MemberRow[],
  relationships: RelationshipRow[],
): Map<string, AiPathStep[]> => {
  const memberById = new Map(members.map(member => [member.id, member]))
  const neighbors = new Map<string, Array<{ member: MemberRow; relation: string }>>()
  members.forEach(member => neighbors.set(member.id, []))
  relationships.forEach(relationship => {
    const fromMember = memberById.get(relationship.from_member_id)
    const toMember = memberById.get(relationship.to_member_id)
    if (!fromMember || !toMember) return
    if (relationship.type === 'parent') {
      neighbors.get(toMember.id)?.push({ member: fromMember, relation: parentRelationForAi(fromMember) })
      neighbors.get(fromMember.id)?.push({ member: toMember, relation: childRelationForAi(toMember) })
      return
    }
    neighbors.get(fromMember.id)?.push({ member: toMember, relation: spouseRelationForAi(toMember) })
    neighbors.get(toMember.id)?.push({ member: fromMember, relation: spouseRelationForAi(fromMember) })
  })

  const paths = new Map<string, AiPathStep[]>()
  paths.set(viewerMemberId, [])
  const queue = [viewerMemberId]
  while (queue.length > 0) {
    const currentId = queue.shift()!
    const currentPath = paths.get(currentId)!
    for (const neighbor of neighbors.get(currentId) ?? []) {
      if (paths.has(neighbor.member.id)) continue
      paths.set(neighbor.member.id, [...currentPath, {
        memberId: neighbor.member.id,
        relation: neighbor.relation,
        gender: neighbor.member.gender,
        birthday: memberBirthdayForAi(neighbor.member),
      }])
      queue.push(neighbor.member.id)
    }
  }
  return paths
}

export const buildKinshipLabelRequest = (
  viewerMemberId: string,
  members: MemberRow[],
  relationships: RelationshipRow[],
): KinshipLabelRequest => {
  const viewer = members.find(member => member.id === viewerMemberId)
  if (!viewer) throw new AppError(400, '当前关联成员不存在', 'LINKED_MEMBER_NOT_FOUND')
  const viewerBirthday = memberBirthdayForAi(viewer)
  const contextPaths = buildKinshipContextPaths(viewerMemberId, members, relationships)

  const relationText = (path: AiPathStep[]): string => {
    let generation = 0
    const previous = [{ generation: 0, label: '我', birthday: viewerBirthday }]
    return path.map(step => {
      if (['爸爸', '妈妈', '父母'].includes(step.relation)) generation -= 1
      if (['儿子', '女儿', '子女'].includes(step.relation)) generation += 1
      let relation = step.relation
      if (['儿子', '女儿', '子女'].includes(step.relation)) {
        const reference = [...previous].reverse().find(item => item.generation === generation)
        if (reference) {
          const comparison = compareBirthdaysForAi(step.birthday, reference.birthday)
          const comparisonText = comparison === 'older' ? '年长'
            : comparison === 'younger' ? '年幼'
              : comparison === 'same-birthday' ? '同龄'
                : '长幼未知'
          relation += `（比${reference.label}${comparisonText}）`
        }
      }
      previous.push({ generation, label: step.relation, birthday: step.birthday })
      return relation
    }).join('的')
  }

  return {
    targets: members.filter(member => member.id !== viewerMemberId).map(member => {
      const path = contextPaths.get(member.id) ?? null
      return {
        id: member.id,
        relation: path ? relationText(path) : null,
      }
    }),
  }
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

const clearFamilyKinshipLabels = (familyId: string): void => {
  db.prepare('DELETE FROM kinship_labels WHERE family_id = ?').run(familyId)
}

const fallbackKinshipLabel = (viewerMemberId: string | null | undefined, member: MemberRow): string => {
  if (viewerMemberId && member.id === viewerMemberId) return '自己'
  return FALLBACK_KINSHIP_LABEL
}

const loadKinshipLabels = async (
  familyId: string,
  viewerMemberId: string | null | undefined,
  members: MemberRow[],
): Promise<Map<string, string>> => {
  const labels = new Map<string, string>()
  const memberIds = new Set(members.map(member => member.id))
  if (!viewerMemberId || !memberIds.has(viewerMemberId)) return labels
  labels.set(viewerMemberId, '自己')

  const cachedRows = db.prepare(`
    SELECT to_member_id, label FROM kinship_labels
    WHERE family_id = ? AND from_member_id = ?
  `).all(familyId, viewerMemberId) as unknown as KinshipLabelRow[]
  cachedRows.forEach(row => {
    const label = sanitizeKinshipLabel(row.label)
    if (memberIds.has(row.to_member_id) && label) labels.set(row.to_member_id, label)
  })

  return labels
}

const refreshKinshipLabels = async (
  familyId: string,
  viewerMemberId: string | null | undefined,
  members: MemberRow[],
  relationships: RelationshipRow[],
): Promise<Map<string, string>> => {
  const labels = new Map<string, string>()
  const memberIds = new Set(members.map(member => member.id))
  if (!viewerMemberId || !memberIds.has(viewerMemberId)) {
    throw new AppError(400, '请先在家庭管理中把成员设为我', 'LINKED_MEMBER_REQUIRED')
  }
  labels.set(viewerMemberId, '自己')
  const targetMembers = members.filter(member => member.id !== viewerMemberId)
  let generatedLabels = new Map<string, string>()
  if (targetMembers.length > 0) {
    generatedLabels = await generateKinshipLabels(buildKinshipLabelRequest(viewerMemberId, members, relationships))
  }

  const timestamp = now()
  db.prepare('DELETE FROM kinship_labels WHERE family_id = ? AND from_member_id = ?')
    .run(familyId, viewerMemberId)
  const upsert = db.prepare(`
    INSERT INTO kinship_labels
      (id, family_id, from_member_id, to_member_id, label, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(family_id, from_member_id, to_member_id)
    DO UPDATE SET label = excluded.label, source = excluded.source, updated_at = excluded.updated_at
  `)
  targetMembers.forEach(member => {
    const generated = generatedLabels.get(member.id)
    const generatedLabel = generated ? sanitizeKinshipLabel(generated) : ''
    const label = generatedLabel || fallbackKinshipLabel(viewerMemberId, member)
    labels.set(member.id, label)
    upsert.run(
      randomUUID(),
      familyId,
      viewerMemberId,
      member.id,
      label,
      generatedLabel ? 'deepseek' : 'heuristic',
      timestamp,
      timestamp,
    )
  })

  return labels
}

const refreshLinkedMemberKinshipLabels = async (
  familyId: string,
  linkedMemberId: string,
  trigger: 'direct_link' | 'link_approval',
): Promise<boolean> => {
  const startedAt = Date.now()
  const members = db.prepare(`
    SELECT id, name, nickname, relation_label, birth_year,
           gender, birthday_type, birth_month, birth_day, is_leap_month, created_at
    FROM members WHERE family_id = ?
  `).all(familyId) as unknown as MemberRow[]
  const relationships = db.prepare(`
    SELECT id, from_member_id, to_member_id, type
    FROM relationships WHERE family_id = ?
  `).all(familyId) as unknown as RelationshipRow[]

  try {
    await refreshKinshipLabels(familyId, linkedMemberId, members, relationships)
    logKinship('automatic_refresh_succeeded', {
      trigger,
      familyIdSuffix: familyId.slice(-8),
      linkedMemberIdSuffix: linkedMemberId.slice(-8),
      durationMs: Date.now() - startedAt,
    })
    return true
  } catch (error) {
    logKinship('automatic_refresh_failed', {
      trigger,
      familyIdSuffix: familyId.slice(-8),
      linkedMemberIdSuffix: linkedMemberId.slice(-8),
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }, 'error')
    return false
  }
}

const getSnapshot = async (familyId: string, viewerMemberId?: string | null) => {
  const members = db.prepare(`
    SELECT members.id, members.name, members.nickname, members.relation_label, members.birth_year,
           members.gender, members.birthday_type, members.birth_month, members.birth_day,
           members.is_leap_month, members.created_at,
           EXISTS (
             SELECT 1 FROM family_users
             WHERE family_users.family_id = members.family_id
               AND family_users.linked_member_id = members.id
           ) AS is_claimed
    FROM members WHERE members.family_id = ?
  `).all(familyId) as unknown as MemberRow[]
  const relationships = db.prepare(`
    SELECT id, from_member_id, to_member_id, type
    FROM relationships WHERE family_id = ?
  `).all(familyId) as unknown as RelationshipRow[]
  const generations = inferGenerations(members.map(member => member.id), relationships)
  const kinshipLabels = await loadKinshipLabels(familyId, viewerMemberId, members)
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
        relation: kinshipLabels.get(member.id) ?? fallbackKinshipLabel(viewerMemberId, member),
        birthYear: member.birth_year,
        gender: member.gender,
        birthdayType: member.birthday_type,
        birthMonth: member.birth_month,
        birthDay: member.birth_day,
        isLeapMonth: member.is_leap_month === 1,
        isClaimed: member.is_claimed === 1,
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

const assertMemberNotLinkedByOtherUser = (familyId: string, memberId: string, userId: string): void => {
  const linked = db.prepare(`
    SELECT user_id FROM family_users
    WHERE family_id = ? AND linked_member_id = ? AND user_id <> ?
  `).get(familyId, memberId, userId)
  if (linked) throw new AppError(409, '该成员已被其他账号关联', 'MEMBER_ALREADY_LINKED')
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

  const user = resolveWechatUser('miniprogram', identity)
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

app.post('/api/auth/web', webLoginRateLimit, (request, response) => {
  const input = webLoginSchema.parse(request.body)
  const codeHash = sha256(input.code)
  const timestamp = now()
  const session = transaction(() => {
    const loginCode = db.prepare(`
      SELECT id, user_id FROM web_login_codes
      WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
    `).get(codeHash, timestamp) as { id: string; user_id: string } | undefined
    if (!loginCode) {
      throw new AppError(401, '登录码不存在、已使用或已过期', 'WEB_LOGIN_CODE_INVALID')
    }
    db.prepare('UPDATE web_login_codes SET used_at = ? WHERE id = ?').run(timestamp, loginCode.id)
    return createSession(loginCode.user_id)
  })
  response.json(session)
})

app.post('/api/auth/wechat-web/url', wechatWebLoginRateLimit, (_request, response) => {
  if (!config.wechatOpenAppId || !config.wechatOpenAppSecret || !config.wechatOpenRedirectUri) {
    response.json({ configured: false })
    return
  }
  const state = randomBytes(24).toString('base64url')
  const timestamp = now()
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
  transaction(() => {
    db.prepare('DELETE FROM wechat_web_oauth_states WHERE expires_at <= ?').run(timestamp)
    db.prepare(`
      INSERT INTO wechat_web_oauth_states (id, state_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), sha256(state), expiresAt, timestamp)
  })
  const query = new URLSearchParams({
    appid: config.wechatOpenAppId,
    redirect_uri: config.wechatOpenRedirectUri,
    response_type: 'code',
    scope: 'snsapi_login',
    state,
  })
  response.json({
    configured: true,
    authorizeUrl: `https://open.weixin.qq.com/connect/qrconnect?${query}#wechat_redirect`,
  })
})

app.post('/api/auth/wechat-web', wechatWebLoginRateLimit, async (request, response) => {
  const input = wechatWebLoginSchema.parse(request.body)
  const timestamp = now()
  const oauthState = db.prepare(`
    SELECT id FROM wechat_web_oauth_states
    WHERE state_hash = ? AND used_at IS NULL AND expires_at > ?
  `).get(sha256(input.state), timestamp) as { id: string } | undefined
  if (!oauthState) {
    throw new AppError(401, '微信登录请求已过期，请重新扫码', 'WECHAT_WEB_STATE_INVALID')
  }
  const consumed = db.prepare(`
    UPDATE wechat_web_oauth_states SET used_at = ? WHERE id = ? AND used_at IS NULL
  `).run(timestamp, oauthState.id)
  if (Number(consumed.changes) !== 1) {
    throw new AppError(401, '微信登录请求已使用，请重新扫码', 'WECHAT_WEB_STATE_INVALID')
  }
  const identity = await exchangeWechatWebsiteCode(input.code)
  const user = resolveWechatUser('website', identity)
  response.json(createSession(user.id))
})

app.get('/api/invitations/:code/preview', invitationPreviewRateLimit, (request, response) => {
  const timestamp = now()
  const invitation = db.prepare(`
    SELECT families.name AS familyName, invitations.role,
           invitations.max_uses AS maxUses, invitations.used_count AS usedCount,
           invitations.expires_at AS expiresAt, invitations.revoked_at AS revokedAt
    FROM invitations
    JOIN families ON families.id = invitations.family_id
    WHERE invitations.code_hash = ?
  `).get(sha256(routeParam(request, 'code'))) as {
    familyName: string
    role: FamilyRole
    maxUses: number
    usedCount: number
    expiresAt: string
    revokedAt: string | null
  } | undefined
  if (!invitation || invitation.revokedAt || invitation.expiresAt <= timestamp
    || invitation.usedCount >= invitation.maxUses) {
    throw new AppError(404, '邀请码不存在或已失效', 'INVITATION_INVALID')
  }
  response.json({
    familyName: invitation.familyName,
    role: invitation.role,
    remainingUses: invitation.maxUses - invitation.usedCount,
    expiresAt: invitation.expiresAt,
  })
})

app.use('/api', requireAuth as never)

app.post('/api/auth/web-login-code', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const code = randomBytes(6).toString('hex').toUpperCase()
  const timestamp = now()
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
  transaction(() => {
    db.prepare(`
      DELETE FROM web_login_codes
      WHERE expires_at <= ? AND created_at < ?
    `).run(timestamp, new Date(Date.now() - 7 * 86400000).toISOString())
    db.prepare(`
      UPDATE web_login_codes SET used_at = ?
      WHERE user_id = ? AND used_at IS NULL
    `).run(timestamp, authUser.id)
    db.prepare(`
      INSERT INTO web_login_codes (id, user_id, code_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), authUser.id, sha256(code), expiresAt, timestamp)
  })
  response.status(201).json({ code, expiresAt })
})

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

app.get('/api/families/:familyId/snapshot', async (request: Request, response) => {
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
  const linkedMemberId = (family as { linkedMemberId?: string | null } | undefined)?.linkedMemberId
  response.json({ family: { ...family as object, role }, ...await getSnapshot(familyId, linkedMemberId) })
})

app.post('/api/families/:familyId/kinship-labels/refresh', async (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const role = requireFamilyRole(authUser.id, familyId, 'viewer')
  const startedAt = Date.now()
  const family = db.prepare(`
    SELECT families.id, families.name, families.description,
           family_users.linked_member_id AS linkedMemberId,
           (SELECT COUNT(*) FROM members WHERE members.family_id = families.id) AS memberCount
    FROM families JOIN family_users ON family_users.family_id = families.id
    WHERE families.id = ? AND family_users.user_id = ?
  `).get(familyId, authUser.id)
  const linkedMemberId = (family as { linkedMemberId?: string | null } | undefined)?.linkedMemberId
  const members = db.prepare(`
    SELECT id, name, nickname, relation_label, birth_year,
           gender, birthday_type, birth_month, birth_day, is_leap_month, created_at
    FROM members WHERE family_id = ?
  `).all(familyId) as unknown as MemberRow[]
  const relationships = db.prepare(`
    SELECT id, from_member_id, to_member_id, type
    FROM relationships WHERE family_id = ?
  `).all(familyId) as unknown as RelationshipRow[]
  logKinship('refresh_requested', {
    familyIdSuffix: familyId.slice(-8),
    authUserIdSuffix: authUser.id.slice(-8),
    linkedMemberIdSuffix: linkedMemberId?.slice(-8) ?? null,
    hasLinkedMember: Boolean(linkedMemberId),
    memberCount: members.length,
    targetCount: linkedMemberId ? Math.max(0, members.length - 1) : 0,
    relationshipCount: relationships.length,
  })
  try {
    await refreshKinshipLabels(familyId, linkedMemberId, members, relationships)
    const snapshot = await getSnapshot(familyId, linkedMemberId)
    logKinship('refresh_succeeded', {
      familyIdSuffix: familyId.slice(-8),
      authUserIdSuffix: authUser.id.slice(-8),
      durationMs: Date.now() - startedAt,
    })
    response.json({ family: { ...family as object, role }, ...snapshot })
  } catch (error) {
    logKinship('refresh_failed', {
      familyIdSuffix: familyId.slice(-8),
      authUserIdSuffix: authUser.id.slice(-8),
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }, 'error')
    throw error
  }
})

app.patch('/api/families/:familyId/me', async (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const role = requireFamilyRole(authUser.id, familyId, 'viewer')
  const input = linkMemberSchema.parse(request.body)
  if (!input.memberId) {
    db.prepare(`
      UPDATE family_users SET linked_member_id = ? WHERE family_id = ? AND user_id = ?
    `).run(null, familyId, authUser.id)
    response.json({ linkedMemberId: null, status: 'approved' })
    return
  }
  assertMemberInFamily(input.memberId, familyId)
  assertMemberNotLinkedByOtherUser(familyId, input.memberId, authUser.id)
  if (role !== 'owner' && role !== 'admin') {
    const timestamp = now()
    const existing = db.prepare(`
      SELECT id FROM member_link_requests
      WHERE family_id = ? AND user_id = ? AND status = 'pending'
    `).get(familyId, authUser.id) as { id: string } | undefined
    if (existing) {
      db.prepare(`
        UPDATE member_link_requests SET member_id = ?, updated_at = ?
        WHERE id = ?
      `).run(input.memberId, timestamp, existing.id)
    } else {
      db.prepare(`
        INSERT INTO member_link_requests (
          id, family_id, user_id, member_id, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `).run(randomUUID(), familyId, authUser.id, input.memberId, timestamp, timestamp)
    }
    audit(familyId, authUser.id, 'request_link', 'member', input.memberId)
    response.status(202).json({ linkedMemberId: null, status: 'pending' })
    return
  }
  db.prepare(`
    UPDATE family_users SET linked_member_id = ? WHERE family_id = ? AND user_id = ?
  `).run(input.memberId, familyId, authUser.id)
  const kinshipRefreshed = await refreshLinkedMemberKinshipLabels(familyId, input.memberId, 'direct_link')
  response.json({ linkedMemberId: input.memberId, status: 'approved', kinshipRefreshed })
})

app.get('/api/families/:familyId/member-link-requests', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  requireFamilyRole(authUser.id, familyId, 'admin')
  const requests = db.prepare(`
    SELECT member_link_requests.id,
           member_link_requests.user_id AS userId,
           member_link_requests.member_id AS memberId,
           members.name AS memberName,
           members.nickname AS memberNickName,
           users.nickname AS userName,
           member_link_requests.created_at AS createdAt
    FROM member_link_requests
    JOIN members ON members.id = member_link_requests.member_id
    JOIN users ON users.id = member_link_requests.user_id
    WHERE member_link_requests.family_id = ? AND member_link_requests.status = 'pending'
    ORDER BY member_link_requests.created_at ASC
  `).all(familyId)
  response.json({ requests })
})

app.patch('/api/families/:familyId/member-link-requests/:requestId', async (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const requestId = routeParam(request, 'requestId')
  requireFamilyRole(authUser.id, familyId, 'admin')
  const input = memberLinkRequestDecisionSchema.parse(request.body)
  const pending = db.prepare(`
    SELECT id, user_id AS userId, member_id AS memberId
    FROM member_link_requests
    WHERE id = ? AND family_id = ? AND status = 'pending'
  `).get(requestId, familyId) as { id: string; userId: string; memberId: string } | undefined
  if (!pending) throw new AppError(404, '认领申请不存在或已处理', 'LINK_REQUEST_NOT_FOUND')
  if (input.status === 'approved') assertMemberNotLinkedByOtherUser(familyId, pending.memberId, pending.userId)
  const timestamp = now()
  transaction(() => {
    db.prepare(`
      UPDATE member_link_requests
      SET status = ?, decided_by = ?, decided_at = ?, updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(input.status, authUser.id, timestamp, timestamp, requestId, familyId)
    if (input.status === 'approved') {
      db.prepare(`
        UPDATE family_users SET linked_member_id = ? WHERE family_id = ? AND user_id = ?
      `).run(pending.memberId, familyId, pending.userId)
    }
    audit(familyId, authUser.id, input.status === 'approved' ? 'approve_link' : 'reject_link', 'member', pending.memberId, { userId: pending.userId })
  })
  const kinshipRefreshed = input.status === 'approved'
    ? await refreshLinkedMemberKinshipLabels(familyId, pending.memberId, 'link_approval')
    : false
  response.json({ status: input.status, kinshipRefreshed })
})

app.delete('/api/families/:familyId/me', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const role = requireFamilyRole(authUser.id, familyId, 'viewer')
  if (role === 'owner') {
    throw new AppError(400, '家庭所有者不能直接退出家庭', 'OWNER_CANNOT_LEAVE')
  }
  db.prepare('DELETE FROM family_users WHERE family_id = ? AND user_id = ?').run(familyId, authUser.id)
  audit(familyId, authUser.id, 'leave', 'family', familyId)
  response.status(204).send()
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

app.post(
  '/api/families/:familyId/birthday-reminders/test',
  birthdayReminderTestRateLimit,
  async (request: Request, response) => {
    const { authUser } = request as AuthenticatedRequest
    const familyId = routeParam(request, 'familyId')
    requireFamilyRole(authUser.id, familyId, 'owner')
    if (!config.wechatAppId || !config.wechatAppSecret) {
      throw new AppError(503, '生日提醒服务尚未启用', 'BIRTHDAY_REMINDER_DISABLED')
    }
    const clock = getBeijingClock()
    const sentCount = await runBirthdayReminderJob(new Date(), familyId, true)
    audit(familyId, authUser.id, 'test_push', 'birthday_reminder', clock.localDate, { sentCount })
    response.json({
      familyId,
      localDate: clock.localDate,
      forced: true,
      sentCount,
    })
  },
)

app.post('/api/families/:familyId/members/:memberId/birthday-wish', birthdayWishRateLimit, async (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const memberId = routeParam(request, 'memberId')
  requireFamilyRole(authUser.id, familyId, 'viewer')
  const input = birthdayWishRequestSchema.parse(request.body ?? {})
  const member = db.prepare(`
    SELECT id, name, nickname, relation_label, birth_year,
           gender, birthday_type, birth_month, birth_day, is_leap_month, created_at
    FROM members WHERE id = ? AND family_id = ?
  `).get(memberId, familyId) as unknown as MemberRow | undefined
  if (!member) throw new AppError(404, '家庭成员不存在', 'MEMBER_NOT_FOUND')
  if (!isBirthdayToday(member)) {
    throw new AppError(400, '仅可在成员生日当天生成祝福', 'NOT_MEMBER_BIRTHDAY')
  }
  const currentUser = db.prepare(`
    SELECT linked_member_id AS linkedMemberId FROM family_users WHERE family_id = ? AND user_id = ?
  `).get(familyId, authUser.id) as { linkedMemberId?: string | null } | undefined
  const members = db.prepare(`
    SELECT id, name, gender, birth_year, relation_label FROM members WHERE family_id = ?
  `).all(familyId) as unknown as MemberRow[]
  const kinshipLabels = await loadKinshipLabels(familyId, currentUser?.linkedMemberId, members)
  const relationLabel = kinshipLabels.get(memberId) ?? fallbackKinshipLabel(currentUser?.linkedMemberId, member)
  const birthdayWish = buildBirthdayWishPrompt(
    member,
    relationLabel,
    getBeijingClock().year,
    undefined,
    input.previousWishes,
  )
  const wish = await generateBirthdayWish(birthdayWish.prompt, birthdayWish.age)
  response.json({ wish })
})

app.post('/api/families/:familyId/members', async (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  requireFamilyRole(authUser.id, familyId, 'viewer')
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
      '', input.birthYear, input.gender, input.birthdayType, input.birthMonth,
      input.birthDay, input.isLeapMonth ? 1 : 0, authUser.id, timestamp, timestamp,
    )
    replaceMemberRelationships(familyId, memberId, input.parentIds, input.spouseId, authUser.id)
    syncFamilyGenerations(familyId)
    clearFamilyKinshipLabels(familyId)
    db.prepare('UPDATE families SET updated_at = ? WHERE id = ?').run(timestamp, familyId)
    audit(familyId, authUser.id, 'create', 'member', memberId, { name: input.name })
  })
  const linkedMemberId = db.prepare(`
    SELECT linked_member_id AS linkedMemberId FROM family_users WHERE family_id = ? AND user_id = ?
  `).get(familyId, authUser.id) as { linkedMemberId?: string | null } | undefined
  response.status(201).json({ memberId, ...await getSnapshot(familyId, linkedMemberId?.linkedMemberId) })
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
    clearFamilyKinshipLabels(familyId)
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

app.patch('/api/families/:familyId/members/:memberId', async (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const memberId = routeParam(request, 'memberId')
  const role = requireFamilyRole(authUser.id, familyId, 'viewer')
  assertMemberInFamily(memberId, familyId)
  if (role !== 'owner') {
    const currentUser = db.prepare(`
      SELECT linked_member_id AS linkedMemberId FROM family_users WHERE family_id = ? AND user_id = ?
    `).get(familyId, authUser.id) as { linkedMemberId?: string | null } | undefined
    if (currentUser?.linkedMemberId !== memberId) {
      throw new AppError(403, '只能编辑自己的成员资料', 'MEMBER_EDIT_SELF_ONLY')
    }
  }
  const input = memberSchema.parse(request.body)
  const timestamp = now()
  transaction(() => {
    db.prepare(`
      UPDATE members SET name = ?, nickname = ?, relation_label = ?,
        birth_year = ?, gender = ?, birthday_type = ?, birth_month = ?, birth_day = ?,
        is_leap_month = ?, updated_at = ? WHERE id = ? AND family_id = ?
    `).run(
      input.name, input.nickName ?? null, '',
      input.birthYear, input.gender, input.birthdayType, input.birthMonth, input.birthDay,
      input.isLeapMonth ? 1 : 0, timestamp, memberId, familyId,
    )
    replaceMemberRelationships(familyId, memberId, input.parentIds, input.spouseId, authUser.id)
    syncFamilyGenerations(familyId)
    clearFamilyKinshipLabels(familyId)
    db.prepare('UPDATE families SET updated_at = ? WHERE id = ?').run(timestamp, familyId)
    audit(familyId, authUser.id, 'update', 'member', memberId, { name: input.name })
  })
  const linkedMemberId = db.prepare(`
    SELECT linked_member_id AS linkedMemberId FROM family_users WHERE family_id = ? AND user_id = ?
  `).get(familyId, authUser.id) as { linkedMemberId?: string | null } | undefined
  response.json({ ...await getSnapshot(familyId, linkedMemberId?.linkedMemberId) })
})

app.delete('/api/families/:familyId/members/:memberId', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const memberId = routeParam(request, 'memberId')
  requireFamilyRole(authUser.id, familyId, 'owner')
  assertMemberInFamily(memberId, familyId)
  transaction(() => {
    db.prepare('UPDATE family_users SET linked_member_id = NULL WHERE linked_member_id = ?').run(memberId)
    db.prepare('DELETE FROM members WHERE id = ? AND family_id = ?').run(memberId, familyId)
    syncFamilyGenerations(familyId)
    clearFamilyKinshipLabels(familyId)
    db.prepare('UPDATE families SET updated_at = ? WHERE id = ?').run(now(), familyId)
    audit(familyId, authUser.id, 'delete', 'member', memberId)
  })
  response.status(204).send()
})

app.post('/api/families/:familyId/invitations', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  requireFamilyRole(authUser.id, familyId, 'owner')
  const input = invitationSchema.parse(request.body)
  const invitationId = randomUUID()
  const code = randomBytes(9).toString('base64url')
  const expiresAt = new Date(Date.now() + input.expiresInHours * 3600000).toISOString()
  db.prepare(`
    INSERT INTO invitations
      (id, family_id, code_hash, role, max_uses, expires_at, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(invitationId, familyId, sha256(code), input.role, input.maxUses, expiresAt, authUser.id, now())
  audit(familyId, authUser.id, 'create', 'invitation', invitationId, { role: input.role, expiresAt })
  response.status(201).json({ invitationId, code, expiresAt, role: input.role, maxUses: input.maxUses })
})

app.delete('/api/families/:familyId/invitations/:invitationId', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  const invitationId = routeParam(request, 'invitationId')
  requireFamilyRole(authUser.id, familyId, 'owner')
  const revokedAt = now()
  const result = db.prepare(`
    UPDATE invitations SET revoked_at = ?
    WHERE id = ? AND family_id = ? AND revoked_at IS NULL
  `).run(revokedAt, invitationId, familyId)
  if (Number(result.changes) !== 1) {
    throw new AppError(404, '邀请不存在或已经作废', 'INVITATION_NOT_FOUND')
  }
  audit(familyId, authUser.id, 'revoke', 'invitation', invitationId)
  response.status(204).send()
})

app.get('/api/families/:familyId/joins/summary', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const familyId = routeParam(request, 'familyId')
  requireFamilyRole(authUser.id, familyId, 'viewer')
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const summary = db.prepare(`
    SELECT COUNT(*) AS recentCount, MAX(family_users.joined_at) AS lastJoinedAt
    FROM family_users
    JOIN families ON families.id = family_users.family_id
    WHERE family_users.family_id = ?
      AND family_users.user_id <> families.owner_user_id
      AND family_users.joined_at >= ?
  `).get(familyId, since) as { recentCount: number; lastJoinedAt: string | null }
  response.json(summary)
})

app.post('/api/invitations/:code/accept', (request: Request, response) => {
  const { authUser } = request as AuthenticatedRequest
  const invitation = db.prepare(`
    SELECT id, family_id, role, max_uses, used_count, expires_at, revoked_at
    FROM invitations WHERE code_hash = ?
  `).get(sha256(routeParam(request, 'code'))) as unknown as {
    id: string; family_id: string; role: FamilyRole; max_uses: number; used_count: number
    expires_at: string; revoked_at: string | null
  } | undefined
  if (!invitation || invitation.revoked_at || invitation.expires_at <= now()
    || invitation.used_count >= invitation.max_uses) {
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
