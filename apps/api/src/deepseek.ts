import { config } from './config'
import { AppError } from './types'
import { normalizeBirthdayWishSpacing, removeBirthdayWishAge } from './birthdayWishPrompt'

interface DeepSeekResponse {
  choices?: Array<{
    finish_reason?: string | null
    message?: {
      content?: string | null
      reasoning_content?: string | null
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

const textPreview = (value: string, limit = 500): string =>
  value.replace(/\s+/g, ' ').trim().slice(0, limit)

const describeError = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

const sanitizeGeneratedLabel = (label: string): string =>
  label.trim().replace(/[`“”"'，。,.;；:：\s]/g, '').slice(0, 20)

const logDeepSeekDiagnostic = (event: string, detail: Record<string, unknown>): void => {
  console.error('[deepseek]', JSON.stringify({
    event,
    model: config.deepseekModel,
    ...detail,
  }))
}

const logDeepSeekInfo = (event: string, detail: Record<string, unknown>): void => {
  console.info('[deepseek]', JSON.stringify({
    event,
    model: config.deepseekModel,
    ...detail,
  }))
}

const summarizeDeepSeekResponse = (responseText: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(responseText) as DeepSeekResponse
    return {
      choiceCount: parsed.choices?.length ?? 0,
      choices: parsed.choices?.map(choice => ({
        finishReason: choice.finish_reason ?? null,
        contentLength: choice.message?.content?.length ?? 0,
        reasoningContentLength: choice.message?.reasoning_content?.length ?? 0,
      })) ?? [],
      usage: parsed.usage ?? null,
    }
  } catch {
    return { bodyPreview: textPreview(responseText, 200) }
  }
}

const callDeepSeek = async (
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  errorMessage: string,
  errorCode: string,
  timeoutMs = 15_000,
  jsonResponse = false,
): Promise<string> => {
  const requestBody = {
    model: config.deepseekModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    stream: false,
    thinking: { type: 'disabled' },
    ...(jsonResponse ? { response_format: { type: 'json_object' } } : {}),
  }
  logDeepSeekInfo('request', {
    code: errorCode,
    timeoutMs,
    body: requestBody,
  })

  let response: globalThis.Response
  try {
    response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    logDeepSeekDiagnostic('request_failed', {
      code: errorCode,
      error: describeError(error),
      maxTokens,
      timeoutMs,
      jsonResponse,
    })
    throw new AppError(502, errorMessage, errorCode)
  }

  if (!response.ok) {
    let body = ''
    try {
      body = await response.text()
    } catch (error) {
      body = `读取响应体失败：${describeError(error)}`
    }
    logDeepSeekDiagnostic('http_error', {
      code: errorCode,
      status: response.status,
      statusText: response.statusText,
      body,
      maxTokens,
      timeoutMs,
      jsonResponse,
    })
    throw new AppError(502, errorMessage, errorCode)
  }

  let responseText = ''
  try {
    responseText = await response.text()
  } catch (error) {
    logDeepSeekDiagnostic('read_body_failed', {
      code: errorCode,
      error: describeError(error),
      maxTokens,
      timeoutMs,
      jsonResponse,
    })
    throw new AppError(502, errorMessage, errorCode)
  }
  logDeepSeekInfo('response', {
    code: errorCode,
    status: response.status,
    statusText: response.statusText,
    body: responseText,
  })

  let result: DeepSeekResponse
  try {
    result = JSON.parse(responseText) as DeepSeekResponse
  } catch (error) {
    logDeepSeekDiagnostic('json_parse_failed', {
      code: errorCode,
      error: describeError(error),
      responseSummary: summarizeDeepSeekResponse(responseText),
      maxTokens,
      timeoutMs,
      jsonResponse,
    })
    throw new AppError(502, errorMessage, errorCode)
  }
  const content = result.choices?.[0]?.message?.content?.trim()
  if (!content) {
    logDeepSeekDiagnostic('empty_content', {
      code: errorCode,
      responseSummary: summarizeDeepSeekResponse(responseText),
      maxTokens,
      timeoutMs,
      jsonResponse,
    })
    throw new AppError(502, errorMessage, errorCode)
  }
  return content
}

export const birthdayWishSystemPrompt = [
  '你擅长写中国家族微信群里热闹、喜庆、有排面的生日祝福。',
  '输出要像家人会直接发在群里的多行短句：称呼醒目、祝福顺口、emoji 和微信表情丰富。',
  '可以使用四字吉利话和适度重复，但要同时遵守本次指定的开头、句式、主题和收尾组合，不能每次只替换姓名。',
  '输入若包含最近生成过的文案，必须主动避开相同开头、句式骨架和核心祝福组合。',
  '年龄只用于选择合适的语气，最终文案不得暴露年龄或出生年份。严格遵守篇幅、禁用句式和事实边界。',
  '只输出可以直接发送的祝福正文，保留换行，不要解释。',
].join('\n')

export const generateBirthdayWish = async (prompt: string, age: number | null): Promise<string> => {
  if (!config.deepseekApiKey) {
    throw new AppError(503, '生日祝福生成服务尚未配置', 'BIRTHDAY_WISH_DISABLED')
  }

  const wish = await callDeepSeek(
    birthdayWishSystemPrompt,
    prompt,
    300,
    '生日祝福生成失败',
    'BIRTHDAY_WISH_GENERATION_FAILED',
  )
  return normalizeBirthdayWishSpacing(removeBirthdayWishAge(wish, age))
}

export interface KinshipLabelRequest {
  targets: Array<{
    id: string
    relation: string | null
  }>
}

const KINSHIP_LABEL_TIMEOUT_MS = 120_000

const kinshipSystemPrompt = [
  '你是中文亲属称谓专家。',
  '输入已经按每位目标成员组装好从当前用户出发的关系链，你只需根据 targets 生成称呼。',
  'target 只包含 id 和 relation。relation 是可直接阅读的关系链，例如“爸爸的爸爸”或“爸爸的爸爸的儿子（比爸爸年长）”。',
  '括号内的“比我年长/年幼”或“比某位链上亲属年长/年幼”是后端已计算好的长幼信息，必须据此区分兄弟姐妹、伯父叔父等称呼。',
  '如果关系链标注“长幼未知”且该称呼必须区分长幼，返回“亲友”。relation 为 null 时也返回“亲友”。',
  '只返回 JSON 对象，key 是 target id，value 是 viewer 对该 target 的称呼。',
  '最终回答必须写在 message.content 中，不能只输出推理内容。',
  '称呼必须使用规范、正式的书面称谓，例如：兄、弟、姐、妹、伯父、叔父、姑母、舅父、舅母、姨母、婶母、堂兄、表姐、连襟、妯娌。',
  '同辈亲兄弟姐妹必须输出“兄、弟、姐、妹”，不要输出“哥哥、弟弟、姐姐、妹妹”。',
  '仅直系亲属保留家庭常用称呼：爸爸、妈妈、爷爷、奶奶、外公、外婆。',
  '表哥、堂哥、表姐、堂姐的子女不能称为弟弟或妹妹，应称表侄、表侄女、堂侄、堂侄女等下一辈称呼。',
  '不要输出带斜杠、“或”、“的”的不确定或描述性称呼；无法确定时只返回“亲友”。',
  '不要输出解释、Markdown 或代码块。',
].join('\n')

const kinshipMaxTokens = (targetCount: number): number =>
  Math.min(4000, Math.max(1200, targetCount * 100))

const kinshipRequestSummary = (input: KinshipLabelRequest): Record<string, unknown> => ({
  targetCount: input.targets.length,
  missingRelationCount: input.targets.filter(target => !target.relation).length,
  unknownAgeCount: input.targets.filter(target => target.relation?.includes('长幼未知')).length,
})

const kinshipBatches = (
  input: KinshipLabelRequest,
): KinshipLabelRequest[] => {
  const batches: KinshipLabelRequest[] = []
  for (let index = 0; index < input.targets.length; index += 1000) {
    batches.push({ ...input, targets: input.targets.slice(index, index + 1000) })
  }
  return batches
}

const parseJsonObject = (content: string): Record<string, unknown> => {
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch (error) {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) {
      logDeepSeekDiagnostic('kinship_json_object_not_found', {
        code: 'KINSHIP_LABEL_GENERATION_FAILED',
        error: describeError(error),
        contentPreview: textPreview(content),
      })
      throw new AppError(502, '称呼生成失败', 'KINSHIP_LABEL_GENERATION_FAILED')
    }
    try {
      return JSON.parse(match[0]) as Record<string, unknown>
    } catch (innerError) {
      logDeepSeekDiagnostic('kinship_json_object_parse_failed', {
        code: 'KINSHIP_LABEL_GENERATION_FAILED',
        error: describeError(innerError),
        contentPreview: textPreview(content),
        objectPreview: textPreview(match[0]),
      })
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

  const labels = new Map<string, string>()

  const batches = kinshipBatches(input)
  for (const [batchIndex, batch] of batches.entries()) {
    const maxTokens = kinshipMaxTokens(batch.targets.length)
    const startedAt = Date.now()
    logDeepSeekInfo('kinship_batch_request', {
      batchIndex: batchIndex + 1,
      batchCount: batches.length,
      ...kinshipRequestSummary(batch),
      maxTokens,
      timeoutMs: KINSHIP_LABEL_TIMEOUT_MS,
    })
    try {
      const content = await callDeepSeek(
        kinshipSystemPrompt,
        JSON.stringify(batch),
        maxTokens,
        '称呼生成失败',
        'KINSHIP_LABEL_GENERATION_FAILED',
        KINSHIP_LABEL_TIMEOUT_MS,
        true,
      )
      const parsed = parseJsonObject(content)
      batch.targets.forEach(target => {
        const value = parsed[target.id]
        if (typeof value !== 'string') return
        const label = sanitizeGeneratedLabel(value)
        if (!label) return
        labels.set(target.id, label)
      })
      logDeepSeekInfo('kinship_batch_success', {
        batchIndex: batchIndex + 1,
        batchCount: batches.length,
        targetCount: batch.targets.length,
        labelCount: batch.targets.filter(target => labels.has(target.id)).length,
        durationMs: Date.now() - startedAt,
      })
    } catch (error) {
      logDeepSeekDiagnostic('kinship_batch_failed', {
        code: 'KINSHIP_LABEL_GENERATION_FAILED',
        batchIndex: batchIndex + 1,
        batchCount: batches.length,
        targetCount: batch.targets.length,
        requestSummary: kinshipRequestSummary(batch),
        durationMs: Date.now() - startedAt,
        error: describeError(error),
      })
    }
  }

  if (labels.size === 0) {
    logDeepSeekDiagnostic('kinship_no_valid_labels', {
      code: 'KINSHIP_LABEL_GENERATION_FAILED',
      requestSummary: kinshipRequestSummary(input),
    })
    throw new AppError(502, '称呼生成失败', 'KINSHIP_LABEL_GENERATION_FAILED')
  }
  return labels
}
