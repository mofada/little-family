import 'dotenv/config'
import path from 'node:path'

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const config = {
  port: numberFromEnv(process.env.PORT, 3000),
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH ?? './data/little-family.db'),
  wechatAppId: process.env.WECHAT_APP_ID ?? '',
  wechatAppSecret: process.env.WECHAT_APP_SECRET ?? '',
  wechatOpenAppId: process.env.WECHAT_OPEN_APP_ID ?? '',
  wechatOpenAppSecret: process.env.WECHAT_OPEN_APP_SECRET ?? '',
  wechatOpenRedirectUri: process.env.WECHAT_OPEN_REDIRECT_URI ?? '',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
  sessionDays: numberFromEnv(process.env.SESSION_DAYS, 30),
  allowDevLogin: process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_LOGIN === 'true',
}
