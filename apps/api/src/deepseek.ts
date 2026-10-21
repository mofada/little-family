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
  logDeepSeekInfo('request', config.isProduction
    ? { code: errorCode, timeoutMs, maxTokens, jsonResponse }
    : { code: errorCode, timeoutMs, body: requestBody })

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
  logDeepSeekInfo('response', config.isProduction
    ? {
        code: errorCode,
        status: response.status,
        statusText: response.statusText,
        responseSummary: summarizeDeepSeekResponse(responseText),
      }
    : {
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

const generatedLabelGender = (label: string): 'male' | 'female' | 'unknown' => {
  if (/(母|妈|奶奶|婆|姐|妹|女|妻)$/.test(label)) return 'female'
  if (/(父|爸|爷爷|公|哥|兄|弟|舅|伯|叔|夫|子|孙)$/.test(label)) return 'male'
  return 'unknown'
}

const relationTargetGender = (relation: string | null): 'male' | 'female' | 'unknown' => {
  if (!relation) return 'unknown'
  const plainRelation = relation.replace(/（[^）]*）/g, '')
  const target = plainRelation.split('的').at(-1)
  if (['爸爸', '儿子', '丈夫'].includes(target ?? '')) return 'male'
  if (['妈妈', '女儿', '妻子'].includes(target ?? '')) return 'female'
  return 'unknown'
}

const isGeneratedKinshipLabelValid = (
  target: KinshipLabelRequest['targets'][number],
  label: string,
): boolean => {
  if (!target.relation) return label === '亲友'
  if (/[\/或的]/.test(label)) return false
  if (label === '亲友') return true
  const targetGender = relationTargetGender(target.relation)
  const labelGender = generatedLabelGender(label)
  return targetGender === 'unknown' || labelGender === 'unknown' || targetGender === labelGender
}

const KINSHIP_LABEL_TIMEOUT_MS = 120_000

const kinshipSystemPrompt = [
  '你是中文亲属称谓专家。',
  '输入 targets，每项只有 id 和从当前用户出发的完整自然语言关系链 relation。',
  '沿 relation 推导到最后一人；辈分优先，括号中的同辈参照和长幼只用于区分同辈称呼，不能改变辈分。',
  '使用规范称谓并保留“堂”“表”等关系：亲兄弟姐妹用哥哥、弟弟、姐姐、妹妹；堂表亲仍用堂兄、表弟、表姐等。',
  '堂表亲的子女属于下一辈，应使用堂侄、表侄、堂侄女、表侄女等称呼。',
  'relation 为 null，或必要长幼未知、关系无法唯一确定时，返回“亲友”，不要猜测或输出多个称呼。',
  '只返回 JSON 对象：key 为 id，value 为称呼；不要解释、Markdown、斜杠、“或”或描述性短语。',
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
  for (let index = 0; index < input.targets.length; index += 4) {
    batches.push({ ...input, targets: input.targets.slice(index, index + 4) })
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
        if (!label || !isGeneratedKinshipLabelValid(target, label)) return
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
      throw error
    }
  }

  const missingTargetIds = input.targets
    .filter(target => !labels.has(target.id))
    .map(target => target.id)
  if (missingTargetIds.length > 0) {
    logDeepSeekDiagnostic('kinship_no_valid_labels', {
      code: 'KINSHIP_LABEL_GENERATION_FAILED',
      requestSummary: kinshipRequestSummary(input),
      missingTargetIdSuffixes: missingTargetIds.map(id => id.slice(-8)),
    })
    throw new AppError(502, '称呼生成失败', 'KINSHIP_LABEL_GENERATION_FAILED')
  }
  return labels
}
