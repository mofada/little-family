import { API_BASE_URL } from '../config'
import { FamilyMember } from '../types/family'

const TOKEN_KEY = 'little-family:token'
const ACTIVE_FAMILY_KEY = 'little-family:active-family-id'

export interface FamilySummary {
  id: string
  name: string
  description: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  linkedMemberId?: string | null
  memberCount: number
}

export interface FamilySnapshot {
  family: FamilySummary
  members: FamilyMember[]
  relationships: Array<{
    id: string
    fromMemberId: string
    toMemberId: string
    type: 'parent' | 'spouse'
  }>
}

export interface MemberInput {
  name: string
  nickName?: string | null
  relation: string
  birthYear: number | null
  gender: 'male' | 'female' | 'unknown'
  birthdayType: 'solar' | 'lunar' | null
  birthMonth: number | null
  birthDay: number | null
  isLeapMonth?: boolean
  parentIds?: string[]
  spouseId?: string | null
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

const loginCode = (): Promise<string> => new Promise((resolve, reject) => {
  wx.login({
    success: result => result.code ? resolve(result.code) : reject(new Error('微信登录未返回凭证')),
    fail: reject,
  })
})

const request = <T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  data?: unknown,
  authenticated = true,
): Promise<T> => new Promise((resolve, reject) => {
  const token = wx.getStorageSync(TOKEN_KEY) as string
  wx.request({
    url: `${API_BASE_URL}${path}`,
    // 项目内置的旧版微信类型尚未列出 PATCH，但运行时基础库支持该方法。
    method: method as never,
    data: data as WechatMiniprogram.IAnyObject | undefined,
    header: authenticated && token ? { Authorization: `Bearer ${token}` } : {},
    success: response => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        resolve(response.data as unknown as T)
        return
      }
      if (response.statusCode === 401) wx.removeStorageSync(TOKEN_KEY)
      const body = response.data as ApiErrorBody
      reject(new Error(body.error?.message ?? `请求失败（${response.statusCode}）`))
    },
    fail: error => reject(new Error(error.errMsg || '无法连接服务器')),
  })
})

let authPromise: Promise<void> | null = null

export const ensureAuth = (): Promise<void> => {
  if (wx.getStorageSync(TOKEN_KEY)) return Promise.resolve()
  if (!authPromise) {
    authPromise = loginCode()
      .then(code => request<{ token: string }>('/api/auth/wechat', 'POST', { code }, false))
      .then(result => { wx.setStorageSync(TOKEN_KEY, result.token) })
      .finally(() => { authPromise = null })
  }
  return authPromise
}

export const listFamilies = async (): Promise<FamilySummary[]> => {
  await ensureAuth()
  const result = await request<{ families: FamilySummary[] }>('/api/families')
  return result.families
}

export const getActiveFamilyId = (): string => wx.getStorageSync(ACTIVE_FAMILY_KEY) as string

export const setActiveFamilyId = (familyId: string): void => {
  wx.setStorageSync(ACTIVE_FAMILY_KEY, familyId)
}

export const createFamily = async (name: string, description = ''): Promise<FamilySummary> => {
  await ensureAuth()
  const result = await request<{ family: FamilySummary }>('/api/families', 'POST', { name, description })
  setActiveFamilyId(result.family.id)
  return result.family
}

export const fetchSnapshot = async (familyId: string): Promise<FamilySnapshot> => {
  await ensureAuth()
  return request<FamilySnapshot>(`/api/families/${familyId}/snapshot`)
}

export const saveMember = async (
  familyId: string,
  input: MemberInput,
  memberId?: string,
): Promise<void> => {
  await ensureAuth()
  const path = memberId
    ? `/api/families/${familyId}/members/${memberId}`
    : `/api/families/${familyId}/members`
  await request(path, memberId ? 'PATCH' : 'POST', input)
}

export const deleteMember = async (familyId: string, memberId: string): Promise<void> => {
  await ensureAuth()
  await request(`/api/families/${familyId}/members/${memberId}`, 'DELETE')
}

export const linkCurrentUser = async (familyId: string, memberId: string | null): Promise<void> => {
  await ensureAuth()
  await request(`/api/families/${familyId}/me`, 'PATCH', { memberId })
}

export const createInvitation = async (familyId: string): Promise<{ code: string; expiresAt: string }> => {
  await ensureAuth()
  return request(`/api/families/${familyId}/invitations`, 'POST', {
    role: 'editor', maxUses: 1, expiresInHours: 72,
  })
}

export const acceptInvitation = async (code: string): Promise<string> => {
  await ensureAuth()
  const result = await request<{ familyId: string }>(`/api/invitations/${encodeURIComponent(code)}/accept`, 'POST')
  setActiveFamilyId(result.familyId)
  return result.familyId
}

export interface BirthdaySubscriptionConfig {
  configured: boolean
  templateId: string
  activeGrantCount: number
  sendTime: string
  timeZone: string
  subscriptionMode: 'once' | 'long_term'
}

export const getBirthdaySubscriptionConfig = async (familyId: string): Promise<BirthdaySubscriptionConfig> => {
  await ensureAuth()
  return request(`/api/families/${familyId}/birthday-subscriptions/config`)
}

export const registerBirthdaySubscription = async (familyId: string, templateId: string): Promise<void> => {
  await ensureAuth()
  await request(`/api/families/${familyId}/birthday-subscriptions`, 'POST', { templateId })
}

export const generateBirthdayWish = async (familyId: string, memberId: string): Promise<string> => {
  await ensureAuth()
  const result = await request<{ wish: string }>(
    `/api/families/${familyId}/members/${memberId}/birthday-wish`,
    'POST',
  )
  return result.wish
}
