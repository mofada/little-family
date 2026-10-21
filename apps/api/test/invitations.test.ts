import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'little-family-invitations-'))
process.env.NODE_ENV = 'development'
process.env.ALLOW_DEV_LOGIN = 'true'
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'test.db')

const main = async (): Promise<void> => {
  const { app } = await import('../src/app')
  const { db } = await import('../src/db')
  let server: Server | undefined
  try {
    server = await new Promise<Server>(resolve => {
      const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer))
    })
    const address = server.address()
    assert(address && typeof address !== 'string')
    const baseUrl = `http://127.0.0.1:${address.port}`

    const request = async <T>(
      pathname: string,
      options: RequestInit = {},
      expectedStatus = 200,
    ): Promise<T> => {
      const response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers: { 'content-type': 'application/json', ...options.headers },
      })
      const body = response.status === 204 ? null : await response.json()
      assert.equal(response.status, expectedStatus, JSON.stringify(body))
      return body as T
    }

    const login = async (devOpenid: string): Promise<string> => {
      const result = await request<{ token: string }>('/api/auth/wechat', {
        method: 'POST',
        body: JSON.stringify({ devOpenid }),
      })
      return result.token
    }
    const authorized = (token: string, method = 'GET', body?: unknown): RequestInit => ({
      method,
      headers: { authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const ownerToken = await login('invitation-owner')
    const familyResult = await request<{ family: { id: string } }>('/api/families', authorized(
      ownerToken,
      'POST',
      { name: '邀请测试家庭', description: '' },
    ), 201)
    const familyId = familyResult.family.id
    const invitation = await request<{
      invitationId: string
      code: string
      maxUses: number
    }>(`/api/families/${familyId}/invitations`, authorized(ownerToken, 'POST', {
      role: 'editor', maxUses: 2, expiresInHours: 1,
    }), 201)
    assert.ok(invitation.invitationId)

    const preview = await request<{
      familyName: string
      remainingUses: number
    }>(`/api/invitations/${encodeURIComponent(invitation.code)}/preview`)
    assert.equal(preview.familyName, '邀请测试家庭')
    assert.equal(preview.remainingUses, 2)

    const guestToken = await login('invitation-guest')
    await request(`/api/invitations/${encodeURIComponent(invitation.code)}/accept`, authorized(
      guestToken,
      'POST',
    ))
    const previewAfterJoin = await request<{ remainingUses: number }>(
      `/api/invitations/${encodeURIComponent(invitation.code)}/preview`,
    )
    assert.equal(previewAfterJoin.remainingUses, 1)

    const joinSummary = await request<{ recentCount: number; lastJoinedAt: string | null }>(
      `/api/families/${familyId}/joins/summary`,
      authorized(ownerToken),
    )
    assert.equal(joinSummary.recentCount, 1)
    assert.ok(joinSummary.lastJoinedAt)

    await request(`/api/families/${familyId}/invitations/${invitation.invitationId}`, authorized(
      ownerToken,
      'DELETE',
    ), 204)
    await request(`/api/invitations/${encodeURIComponent(invitation.code)}/preview`, {}, 404)

    console.log('✓ 邀请支持免登录预览、加入、剩余名额统计与作废')
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server?.close(error => error ? reject(error) : resolve()))
    db.close()
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
