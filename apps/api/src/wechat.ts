import { AppError } from './types'
import { config } from './config'
import { BIRTHDAY_TEMPLATE } from './birthdayTemplate'

interface WechatSessionResponse {
  openid?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

interface WechatAccessTokenResponse {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

interface WechatWebLoginResponse {
  access_token?: string
  openid?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

export interface WechatSendResult {
  errcode: number
  errmsg: string
}

let accessTokenCache: { token: string; expiresAt: number } | null = null

const getWechatAccessToken = async (): Promise<string> => {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) return accessTokenCache.token
  if (!config.wechatAppId || !config.wechatAppSecret) {
    throw new AppError(503, '服务端尚未配置微信凭证', 'WECHAT_NOT_CONFIGURED')
  }
  const response = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credential',
      appid: config.wechatAppId,
      secret: config.wechatAppSecret,
      force_refresh: false,
    }),
  })
  if (!response.ok) throw new AppError(502, '微信凭证服务暂时不可用', 'WECHAT_UNAVAILABLE')
  const body = await response.json() as WechatAccessTokenResponse
  if (!body.access_token) {
    throw new AppError(502, body.errmsg ?? '获取微信凭证失败', `WECHAT_${body.errcode ?? 'ERROR'}`)
  }
  accessTokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + Math.max((body.expires_in ?? 7200) - 300, 60) * 1000,
  }
  return body.access_token
}

export const sendBirthdaySubscribeMessage = async (
  openid: string,
  memberNames: string,
  localDateLabel: string,
): Promise<WechatSendResult> => {
  const accessToken = await getWechatAccessToken()
  const data: Record<string, { value: string }> = {
    [BIRTHDAY_TEMPLATE.fields.name]: { value: memberNames.slice(0, 20) },
    [BIRTHDAY_TEMPLATE.fields.date]: { value: localDateLabel },
    [BIRTHDAY_TEMPLATE.fields.remark]: { value: '今天生日，记得送上祝福' },
  }
  const response = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        touser: openid,
        template_id: BIRTHDAY_TEMPLATE.id,
        page: BIRTHDAY_TEMPLATE.page,
        miniprogram_state: config.allowDevLogin ? 'developer' : 'formal',
        lang: 'zh_CN',
        data,
      }),
    },
  )
  if (!response.ok) throw new AppError(502, '微信消息服务暂时不可用', 'WECHAT_UNAVAILABLE')
  return response.json() as Promise<WechatSendResult>
}

export const exchangeWechatCode = async (code: string): Promise<{ openid: string; unionid?: string }> => {
  if (!config.wechatAppId || !config.wechatAppSecret) {
    throw new AppError(503, '服务端尚未配置微信登录', 'WECHAT_NOT_CONFIGURED')
  }

  const query = new URLSearchParams({
    appid: config.wechatAppId,
    secret: config.wechatAppSecret,
    js_code: code,
    grant_type: 'authorization_code',
  })
  const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${query}`)
  if (!response.ok) throw new AppError(502, '微信登录服务暂时不可用', 'WECHAT_UNAVAILABLE')
  const body = await response.json() as WechatSessionResponse
  if (!body.openid) {
    throw new AppError(401, body.errmsg ?? '微信登录凭证无效', `WECHAT_${body.errcode ?? 'ERROR'}`)
  }
  return { openid: body.openid, unionid: body.unionid }
}

export const exchangeWechatWebsiteCode = async (
  code: string,
): Promise<{ openid: string; unionid?: string }> => {
  if (!config.wechatOpenAppId || !config.wechatOpenAppSecret) {
    throw new AppError(503, '服务端尚未配置微信开放平台网站应用', 'WECHAT_WEB_NOT_CONFIGURED')
  }
  const query = new URLSearchParams({
    appid: config.wechatOpenAppId,
    secret: config.wechatOpenAppSecret,
    code,
    grant_type: 'authorization_code',
  })
  const response = await fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?${query}`)
  if (!response.ok) throw new AppError(502, '微信扫码登录服务暂时不可用', 'WECHAT_UNAVAILABLE')
  const body = await response.json() as WechatWebLoginResponse
  if (!body.openid || !body.access_token) {
    throw new AppError(401, body.errmsg ?? '微信扫码登录凭证无效', `WECHAT_${body.errcode ?? 'ERROR'}`)
  }
  return { openid: body.openid, unionid: body.unionid }
}
