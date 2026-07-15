import { AppError } from './types'
import { config } from './config'

interface WechatSessionResponse {
  openid?: string
  unionid?: string
  errcode?: number
  errmsg?: string
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
