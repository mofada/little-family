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
