import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'little-family-invitations-'))
process.env.NODE_ENV = 'development'
process.env.ALLOW_DEV_LOGIN = 'true'
process.env.DATABASE_PATH = path.join(temporaryDirectory, 'test.db')
process.env.DEEPSEEK_API_KEY = 'integration-test-key'

const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init): Promise<Response> => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url
  if (url === 'https://api.deepseek.com/chat/completions') {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>
    }
    const userMessage = body.messages.find(message => message.role === 'user')
    const payload = JSON.parse(userMessage?.content ?? '{"targets":[]}') as {
      targets: Array<{ id: string; relation: string | null }>
    }
    const labels = Object.fromEntries(payload.targets.map(target => [
      target.id,
      target.relation ? '测试亲属' : '亲友',
    ]))
    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(labels) } }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return originalFetch(input, init)
}

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
    const firstMember = await request<{ memberId: string }>(
      `/api/families/${familyId}/members`,
      authorized(ownerToken, 'POST', {
        name: '成员甲', relation: '爸爸', birthYear: null, gender: 'male',
        birthdayType: null, birthMonth: null, birthDay: null,
      }),
      201,
    )
    await request(`/api/families/${familyId}/members`, authorized(ownerToken, 'POST', {
      name: '成员乙', relation: '妈妈', birthYear: null, gender: 'female',
      birthdayType: null, birthMonth: null, birthDay: null,
    }), 201)
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
    const unlinkedSnapshot = await request<{
      members: Array<{ id: string; relation: string }>
    }>(`/api/families/${familyId}/snapshot`, authorized(guestToken))
    assert.deepEqual(unlinkedSnapshot.members.map(member => member.relation), ['亲友', '亲友'])

    await request(`/api/families/${familyId}/me`, authorized(guestToken, 'PATCH', {
      memberId: firstMember.memberId,
    }), 202)
    const linkRequests = await request<{ requests: Array<{ id: string }> }>(
      `/api/families/${familyId}/member-link-requests`,
      authorized(ownerToken),
    )
    assert.equal(linkRequests.requests.length, 1)
    await request(
      `/api/families/${familyId}/member-link-requests/${linkRequests.requests[0].id}`,
      authorized(ownerToken, 'PATCH', { status: 'approved' }),
    )
    const linkedSnapshot = await request<{
      family: { linkedMemberId: string | null }
      members: Array<{ id: string; relation: string }>
    }>(`/api/families/${familyId}/snapshot`, authorized(guestToken))
    assert.equal(linkedSnapshot.family.linkedMemberId, firstMember.memberId)
    assert.equal(linkedSnapshot.members.find(member => member.id === firstMember.memberId)?.relation, '自己')
    assert.equal(linkedSnapshot.members.find(member => member.id !== firstMember.memberId)?.relation, '亲友')

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

    console.log('✓ 邀请加入使用通用称呼，认领审批后刷新用户视角，并支持名额统计与作废')
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server?.close(error => error ? reject(error) : resolve()))
    db.close()
    globalThis.fetch = originalFetch
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
