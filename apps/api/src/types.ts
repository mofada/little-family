import type { Request } from 'express'

export type FamilyRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface AuthUser {
  id: string
  openid: string
}

export interface AuthenticatedRequest extends Request {
  authUser: AuthUser
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'REQUEST_ERROR',
  ) {
    super(message)
  }
}
