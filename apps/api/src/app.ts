import { randomBytes, randomUUID } from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { ZodError } from 'zod'
import { config } from './config'
import { db, transaction } from './db'
import { createSession, requireAuth, requireFamilyRole, sha256 } from './auth'
import { exchangeWechatCode } from './wechat'
import { familySchema, invitationSchema, linkMemberSchema, loginSchema, memberSchema } from './schemas'
import { AppError, type AuthenticatedRequest, type FamilyRole } from './types'

const now = (): string => new Date().toISOString()

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
  branch_name: string
  generation: number
  name: string
  nickname: string | null
  relation_label: string
  birth_year: number | null
  gender: 'male' | 'female'
  birthday_type: 'solar' | 'lunar'
  birth_month: number
  birth_day: number
  is_leap_month: number
}

interface RelationshipRow {
  id: string
  from_member_id: string
  to_member_id: string
  type: 'parent' | 'spouse'
}

const getSnapshot = (familyId: string) => {
  const members = db.prepare(`
    SELECT id, branch_name, generation, name, nickname, relation_label, birth_year,
           gender, birthday_type, birth_month, birth_day, is_leap_month
    FROM members WHERE family_id = ? ORDER BY generation, created_at
  `).all(familyId) as unknown as MemberRow[]
  const relationships = db.prepare(`
    SELECT id, from_member_id, to_member_id, type
    FROM relationships WHERE family_id = ?
  `).all(familyId) as unknown as RelationshipRow[]

  return {
    members: members.map(member => {
      const parent = relationships.find(item => item.type === 'parent' && item.to_member_id === member.id)
      const spouse = relationships.find(item =>
        item.type === 'spouse' &&
        (item.from_member_id === member.id || item.to_member_id === member.id))
      const spouseId = spouse
        ? (spouse.from_member_id === member.id ? spouse.to_member_id : spouse.from_member_id)
        : null
      return {
        id: member.id,
        parentId: parent?.from_member_id ?? null,
        spouseId,
        familyName: member.branch_name,
        generation: member.generation,
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

const replaceSimpleRelationships = (
  familyId: string,
  memberId: string,
  parentId: string | null | undefined,
  spouseId: string | null | undefined,
  userId: string,
): void => {
  if (parentId !== undefined) {
    db.prepare("DELETE FROM relationships WHERE family_id = ? AND to_member_id = ? AND type = 'parent'")
      .run(familyId, memberId)
    if (parentId) {
      assertMemberInFamily(parentId, familyId)
      db.prepare(`
        INSERT INTO relationships (id, family_id, from_member_id, to_member_id, type, created_by, created_at)
        VALUES (?, ?, ?, ?, 'parent', ?, ?)
      `).run(randomUUID(), familyId, parentId, memberId, userId, now())
    }
  }

  if (spouseId !== undefined) {
    db.prepare(`
      DELETE FROM relationships
      WHERE family_id = ? AND type = 'spouse' AND (from_member_id = ? OR to_member_id = ?)
    `).run(familyId, memberId, memberId)
    if (spouseId) {
      assertMemberInFamily(spouseId, familyId)
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
        id, family_id, branch_name, generation, name, nickname, relation_label,
        birth_year, gender, birthday_type, birth_month, birth_day, is_leap_month,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memberId, familyId, input.branchName, input.generation, input.name, input.nickName ?? null,
      input.relation, input.birthYear, input.gender, input.birthdayType, input.birthMonth,
      input.birthDay, input.isLeapMonth ? 1 : 0, authUser.id, timestamp, timestamp,
    )
    replaceSimpleRelationships(familyId, memberId, input.parentId, input.spouseId, authUser.id)
    db.prepare('UPDATE families SET updated_at = ? WHERE id = ?').run(timestamp, familyId)
    audit(familyId, authUser.id, 'create', 'member', memberId, { name: input.name })
  })
  response.status(201).json({ memberId, ...getSnapshot(familyId) })
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
      UPDATE members SET branch_name = ?, generation = ?, name = ?, nickname = ?, relation_label = ?,
        birth_year = ?, gender = ?, birthday_type = ?, birth_month = ?, birth_day = ?,
        is_leap_month = ?, updated_at = ? WHERE id = ? AND family_id = ?
    `).run(
      input.branchName, input.generation, input.name, input.nickName ?? null, input.relation,
      input.birthYear, input.gender, input.birthdayType, input.birthMonth, input.birthDay,
      input.isLeapMonth ? 1 : 0, timestamp, memberId, familyId,
    )
    replaceSimpleRelationships(familyId, memberId, input.parentId, input.spouseId, authUser.id)
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
    db.prepare(`
      INSERT OR IGNORE INTO family_users (family_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)
    `).run(invitation.family_id, authUser.id, invitation.role, now())
    db.prepare('UPDATE invitations SET used_count = used_count + 1 WHERE id = ?').run(invitation.id)
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
