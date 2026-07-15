import { config } from './config'
import { AppError } from './types'

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string | null } }>
}

export const generateBirthdayWish = async (prompt: string): Promise<string> => {
  if (!config.deepseekApiKey) {
    throw new AppError(503, '生日祝福生成服务尚未配置', 'BIRTHDAY_WISH_DISABLED')
  }

  let response: globalThis.Response
  try {
    response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.deepseekModel,
        messages: [
          { role: 'system', content: '你擅长写自然、温暖的中文家庭生日祝福。只输出可直接发送的祝福文案，不要解释。' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300,
        stream: false,
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new AppError(502, '生日祝福生成失败', 'BIRTHDAY_WISH_GENERATION_FAILED')
  }

  if (!response.ok) {
    throw new AppError(502, '生日祝福生成失败', 'BIRTHDAY_WISH_GENERATION_FAILED')
  }

  let result: DeepSeekResponse
  try {
    result = await response.json() as DeepSeekResponse
  } catch {
    throw new AppError(502, '生日祝福生成失败', 'BIRTHDAY_WISH_GENERATION_FAILED')
  }
  const wish = result.choices?.[0]?.message?.content?.trim()
  if (!wish) {
    throw new AppError(502, '生日祝福生成失败', 'BIRTHDAY_WISH_GENERATION_FAILED')
  }
  return wish
}
