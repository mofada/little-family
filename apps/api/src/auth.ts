import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { NextFunction, Response } from 'express'
import { db } from './db'
import { config } from './config'
import { AppError, type AuthenticatedRequest, type AuthUser, type FamilyRole } from './types'

export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex')

export const createSession = (userId: string): { token: string; expiresAt: string } => {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + config.sessionDays * 86400000).toISOString()
  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), userId, sha256(token), expiresAt, new Date().toISOString())
  return { token, expiresAt }
}

type WechatProvider = 'miniprogram' | 'website'

interface UserRow {
  id: string
  openid: string
  nickname: string | null
  avatar_url: string | null
}

export const resolveWechatUser = (
  provider: WechatProvider,
  identity: { openid: string; unionid?: string },
): UserRow => {
  const timestamp = new Date().toISOString()
  const existingIdentity = db.prepare(`
    SELECT users.id, users.openid, users.nickname, users.avatar_url
    FROM wechat_identities JOIN users ON users.id = wechat_identities.user_id
    WHERE wechat_identities.provider = ? AND wechat_identities.openid = ?
  `).get(provider, identity.openid) as UserRow | undefined

  let user = existingIdentity
  if (!user && identity.unionid) {
    user = db.prepare(`
      SELECT users.id, users.openid, users.nickname, users.avatar_url
      FROM wechat_identities JOIN users ON users.id = wechat_identities.user_id
      WHERE wechat_identities.unionid = ? ORDER BY wechat_identities.created_at LIMIT 1
    `).get(identity.unionid) as UserRow | undefined
  }
  if (!user && provider === 'miniprogram') {
    user = db.prepare('SELECT id, openid, nickname, avatar_url FROM users WHERE openid = ?')
      .get(identity.openid) as UserRow | undefined
  }
  if (!user) {
    const id = randomUUID()
    const canonicalOpenid = provider === 'miniprogram' ? identity.openid : `website:${identity.openid}`
    db.prepare(`
      INSERT INTO users (id, openid, unionid, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    `).run(id, canonicalOpenid, identity.unionid ?? null, timestamp, timestamp)
    user = { id, openid: canonicalOpenid, nickname: null, avatar_url: null }
  }

  db.prepare(`
    INSERT INTO wechat_identities (
      id, user_id, provider, openid, unionid, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, openid) DO UPDATE SET
      unionid = COALESCE(excluded.unionid, wechat_identities.unionid),
      updated_at = excluded.updated_at
  `).run(
    randomUUID(), user.id, provider, identity.openid, identity.unionid ?? null,
    timestamp, timestamp,
  )

  if (provider === 'miniprogram' && user.openid !== identity.openid) {
    db.prepare('UPDATE users SET openid = ?, unionid = COALESCE(?, unionid), updated_at = ? WHERE id = ?')
      .run(identity.openid, identity.unionid ?? null, timestamp, user.id)
    user.openid = identity.openid
  } else if (identity.unionid) {
    db.prepare('UPDATE users SET unionid = ?, updated_at = ? WHERE id = ?')
      .run(identity.unionid, timestamp, user.id)
  }
  return user
}

export const requireAuth = (request: AuthenticatedRequest, _response: Response, next: NextFunction): void => {
  const authorization = request.header('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return next(new AppError(401, '请先登录', 'UNAUTHENTICATED'))

  const row = db.prepare(`
    SELECT users.id, users.openid
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(sha256(token), new Date().toISOString()) as AuthUser | undefined

  if (!row) return next(new AppError(401, '登录状态已失效', 'SESSION_EXPIRED'))
  request.authUser = row
  next()
}

const roleLevel: Record<FamilyRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
}

export const requireFamilyRole = (
  userId: string,
  familyId: string,
  minimum: FamilyRole,
): FamilyRole => {
  const row = db.prepare(
    'SELECT role FROM family_users WHERE family_id = ? AND user_id = ?',
  ).get(familyId, userId) as { role: FamilyRole } | undefined

  if (!row) throw new AppError(403, '你不属于这个家庭', 'FAMILY_FORBIDDEN')
  if (roleLevel[row.role] < roleLevel[minimum]) {
    throw new AppError(403, '当前家庭角色无权执行此操作', 'ROLE_FORBIDDEN')
  }
  return row.role
}
