import { config } from './config'
import { AppError } from './types'

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string | null } }>
}

const callDeepSeek = async (
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  errorMessage: string,
  errorCode: string,
): Promise<string> => {
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new AppError(502, errorMessage, errorCode)
  }

  if (!response.ok) {
    throw new AppError(502, errorMessage, errorCode)
  }

  let result: DeepSeekResponse
  try {
    result = await response.json() as DeepSeekResponse
  } catch {
    throw new AppError(502, errorMessage, errorCode)
  }
  const content = result.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new AppError(502, errorMessage, errorCode)
  }
  return content
}

export const generateBirthdayWish = async (prompt: string): Promise<string> => {
  if (!config.deepseekApiKey) {
    throw new AppError(503, '生日祝福生成服务尚未配置', 'BIRTHDAY_WISH_DISABLED')
  }

  return callDeepSeek(
    '你擅长写自然、温暖的中文家庭生日祝福。只输出可直接发送的祝福文案，不要解释。',
    prompt,
    300,
    '生日祝福生成失败',
    'BIRTHDAY_WISH_GENERATION_FAILED',
  )
}

export interface KinshipLabelRequest {
  viewer: {
    id: string
    name: string
    gender: 'male' | 'female' | 'unknown'
    birthYear: number | null
  }
  targets: Array<{
    id: string
    name: string
    gender: 'male' | 'female' | 'unknown'
    birthYear: number | null
    fallback: string
  }>
  members: Array<{
    id: string
    name: string
    gender: 'male' | 'female' | 'unknown'
    birthYear: number | null
  }>
  relationships: Array<{
    fromMemberId: string
    toMemberId: string
    type: 'parent' | 'spouse'
  }>
}

const parseJsonObject = (content: string): Record<string, unknown> => {
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new AppError(502, '称呼生成失败', 'KINSHIP_LABEL_GENERATION_FAILED')
    try {
      return JSON.parse(match[0]) as Record<string, unknown>
    } catch {
      throw new AppError(502, '称呼生成失败', 'KINSHIP_LABEL_GENERATION_FAILED')
    }
  }
}

export const generateKinshipLabels = async (
  input: KinshipLabelRequest,
): Promise<Map<string, string>> => {
  if (!config.deepseekApiKey) {
    throw new AppError(503, '称呼生成服务尚未配置', 'KINSHIP_LABEL_DISABLED')
  }

  const content = await callDeepSeek(
    [
      '你是中文亲属称谓专家。',
      '根据家庭成员、父母关系和配偶关系，生成“当前用户如何称呼目标成员”的简体中文称呼。',
      '只返回 JSON 对象，key 是目标成员 id，value 是称呼。',
      '称呼要短、自然、适合家庭小程序展示，例如：自己、爸爸、妈妈、哥哥、外甥女、表侄、妻子的外甥女、远亲、姻亲。',
      '不要输出解释、Markdown 或代码块。',
    ].join('\n'),
    JSON.stringify(input),
    Math.max(300, input.targets.length * 24),
    '称呼生成失败',
    'KINSHIP_LABEL_GENERATION_FAILED',
  )

  const parsed = parseJsonObject(content)
  const labels = new Map<string, string>()
  input.targets.forEach(target => {
    const value = parsed[target.id]
    if (typeof value !== 'string') return
    const label = value.trim().replace(/[，。,.；;：:\s]/g, '').slice(0, 20)
    if (label) labels.set(target.id, label)
  })
  if (labels.size === 0) {
    throw new AppError(502, '称呼生成失败', 'KINSHIP_LABEL_GENERATION_FAILED')
  }
  return labels
}
