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

const normalizeKinshipLabel = (label: string): string => {
  const compact = label.trim().replace(/[，。,.；;：:\s]/g, '')
  if (!compact) return ''
  return compact
    .replace(/连襟/g, '姐夫')
    .replace(/妯娌/g, '嫂子')
    .replace(/^姻亲$/, '亲人')
    .slice(0, 20)
}

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
    gender: 'male' | 'female' | 'unknown'
    birthYear: number | null
  }
  targets: Array<{
    id: string
    gender: 'male' | 'female' | 'unknown'
    birthYear: number | null
    pathText: string | null
  }>
}

const KINSHIP_LABEL_BATCH_SIZE = 1000
const KINSHIP_LABEL_TIMEOUT_MS = 120_000

const kinshipSystemPrompt = [
  '你是中文亲属称谓专家。',
  '根据“当前用户到目标成员的关系链”生成“当前用户如何称呼目标成员”的简体中文称呼。',
  '输入是一个 JSON 对象：viewer 表示当前登录用户已关联的家庭成员，也就是称呼视角；targets 表示本次需要生成称呼的目标成员。',
  'viewer 字段说明：gender 是当前用户性别，birthYear 是当前用户出生年份。',
  'target 字段说明：id 是目标成员唯一标识，gender 是目标成员性别，birthYear 是目标成员出生年份，pathText 是从 viewer 出发到目标成员的中文关系链，例如“妈妈的妈妈的女儿的丈夫”。',
  'gender 为 male、female 或 unknown；birthYear 可能为 null。',
  '必须以 pathText 为主要依据推导称呼，不能只按年龄或列表顺序判断。',
  '如果某个 target 的 pathText 为 null 或空字符串，说明没有找到可用关系链，应返回“亲人”，不要猜测具体称呼。',
  '只返回 JSON 对象，key 是目标成员 id，value 是称呼。',
  '最终回答必须写在 message.content 中，不能只输出推理内容。',
  '称呼要短、自然、适合家庭小程序展示，例如：自己、爸爸、妈妈、哥哥、外甥女、表侄、奶奶、舅妈、姨父。',
  '同父母或同父/同母的兄弟姐妹，birthYear 更小表示年龄更大，应称哥哥/姐姐；birthYear 更大应称弟弟/妹妹。',
  '兄弟姐妹的配偶按哥哥/姐姐/弟弟/妹妹关系称嫂子、姐夫、弟妹、妹夫。',
  '表哥、堂哥、表姐、堂姐的子女不能称为弟弟或妹妹，应称表侄、表侄女、堂侄、堂侄女等下一辈称呼。',
  '如果需要区分哥哥/弟弟、姐姐/妹妹、姐夫/妹夫、嫂子/弟媳，必须优先根据成员 birthYear 判断年龄；birthYear 越小年龄越大。',
  '不要输出“姐夫/妹夫”“哥哥/弟弟”这类带斜杠的不确定称呼，除非确实缺少出生年份。',
  '配偶的亲兄弟姐妹直接按配偶视角称呼为哥哥、弟弟、姐姐、妹妹，不要加“妻子的”或“丈夫的”前缀。',
  '配偶的兄弟姐妹的配偶也按家庭日常称呼为姐夫、妹夫、嫂子、弟妹，不要加“妻子的”或“丈夫的”前缀。',
  '绝对不要输出“连襟”“妯娌”“姻亲”“内兄”“内弟”“襟兄”这类生僻或泛称；男性优先用姐夫、妹夫、哥哥、弟弟，女性优先用嫂子、弟妹、姐姐、妹妹。',
  '如果关系是妻子的姐妹的丈夫，应称姐夫或妹夫，不要称连襟。',
  '如果关系是丈夫的兄弟的妻子，应称嫂子或弟妹，不要称妯娌。',
  '不要输出解释、Markdown 或代码块。',
].join('\n')

const kinshipMaxTokens = (targetCount: number): number =>
  Math.min(4000, Math.max(1200, targetCount * 100))

const kinshipRequestSummary = (input: KinshipLabelRequest): Record<string, unknown> => ({
  viewerGender: input.viewer.gender,
  viewerBirthYear: input.viewer.birthYear,
  targetCount: input.targets.length,
  missingPathCount: input.targets.filter(target => !target.pathText).length,
  maxPathLength: input.targets.reduce((max, target) => Math.max(max, target.pathText?.length ?? 0), 0),
})

const kinshipBatches = (
  input: KinshipLabelRequest,
): KinshipLabelRequest[] => {
  const batches: KinshipLabelRequest[] = []
  for (let index = 0; index < input.targets.length; index += KINSHIP_LABEL_BATCH_SIZE) {
    batches.push({
      ...input,
      targets: input.targets.slice(index, index + KINSHIP_LABEL_BATCH_SIZE),
    })
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
        const label = normalizeKinshipLabel(value)
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
