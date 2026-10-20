import { config } from './config'
import { AppError } from './types'

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
    gender: 'male' | 'female' | 'unknown'
    birthday: {
      calendar: 'solar' | 'lunar' | null
      year: number | null
      month: number | null
      day: number | null
      isLeapMonth: boolean
    } | null
  }
  targets: Array<{
    id: string
    gender: 'male' | 'female' | 'unknown'
    birthday: KinshipLabelRequest['viewer']['birthday']
    relation: string | null
    path: Array<{
      memberId: string
      relation: string
      gender: 'male' | 'female' | 'unknown'
      birthday: KinshipLabelRequest['viewer']['birthday']
    }> | null
    ageComparisons: Array<{
      comparedWithMemberId: string
      result: 'older' | 'younger' | 'same-birthday' | 'unknown'
    }>
  }>
}

const KINSHIP_LABEL_TIMEOUT_MS = 120_000

const kinshipSystemPrompt = [
  '你是中文亲属称谓专家。',
  '输入已经按每位目标成员组装好 viewer 到 target 的关系链，你只需根据 targets 生成 viewer 对每位 target 的称呼。',
  'target.relation 是可直接阅读的关系链，例如“爸爸的爸爸”。target.path 列出链上每一步的成员、关系、性别和生日。',
  'target.ageComparisons 是 target 与 viewer 或关系链上其他成员的出生先后比较：older 表示 target 年长，younger 表示 target 年幼，unknown 表示缺少年份或无法比较。',
  'relation 或 path 为 null 时返回“亲友”。不要自行改写或猜测输入的关系链。',
  '只返回 JSON 对象，key 是 target id，value 是 viewer 对该 target 的称呼。',
  '最终回答必须写在 message.content 中，不能只输出推理内容。',
  '称呼必须使用规范、正式的书面称谓，例如：兄、弟、姐、妹、伯父、叔父、姑母、舅父、舅母、姨母、婶母、堂兄、表姐、连襟、妯娌。',
  '仅直系亲属保留家庭常用称呼：爸爸、妈妈、爷爷、奶奶、外公、外婆。',
  '需要区分长幼时必须比较关系中相关两人的 birthday：先比年，再比月日，较早出生者年长。只要其中一人没有年份，就对该目标返回“亲友”；同年但缺少月日、或生日完全相同时也返回“亲友”，不得猜测。',
  '表哥、堂哥、表姐、堂姐的子女不能称为弟弟或妹妹，应称表侄、表侄女、堂侄、堂侄女等下一辈称呼。',
  '不要输出带斜杠、“或”、“的”的不确定或描述性称呼；无法确定时只返回“亲友”。',
  '不要输出解释、Markdown 或代码块。',
].join('\n')

const kinshipMaxTokens = (targetCount: number): number =>
  Math.min(4000, Math.max(1200, targetCount * 100))

const kinshipRequestSummary = (input: KinshipLabelRequest): Record<string, unknown> => ({
  viewerMemberId: input.viewer.id,
  targetCount: input.targets.length,
  missingPathCount: input.targets.filter(target => !target.path).length,
  missingBirthYearCount: input.targets.filter(target => target.birthday?.year == null).length,
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
