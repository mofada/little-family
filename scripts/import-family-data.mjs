import fs from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'

const usage = `用法：
  LITTLE_FAMILY_TOKEN=登录令牌 npm run import:family -- \\
    --file <旧数据.json> --api <API地址> --family-id <家庭UUID> [--link-id <旧成员ID>]

说明：目标家庭必须为空，令牌对应用户必须是家庭所有者。`

const args = process.argv.slice(2)
const valueOf = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const file = valueOf('--file')
const api = valueOf('--api')?.replace(/\/$/, '')
const familyId = valueOf('--family-id')
const linkedLegacyId = valueOf('--link-id')
const token = process.env.LITTLE_FAMILY_TOKEN

const postJson = (urlText, payload, authorization) => new Promise((resolve, reject) => {
  const url = new URL(urlText)
  const transport = url.protocol === 'https:' ? https : http
  const requestBody = JSON.stringify(payload)
  const request = transport.request(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authorization}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody),
    },
  }, response => {
    const chunks = []
    response.on('data', chunk => chunks.push(chunk))
    response.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      let body = {}
      try {
        body = text ? JSON.parse(text) : {}
      } catch {
        body = {}
      }
      resolve({ status: response.statusCode ?? 0, body })
    })
  })
  request.on('error', reject)
  request.end(requestBody)
})

if (!file || !api || !familyId || !token) {
  console.error(usage)
  process.exitCode = 1
} else {
  const text = await fs.readFile(file, 'utf8')
  const members = JSON.parse(text)
  if (!Array.isArray(members)) throw new Error('导入文件顶层必须是成员数组')

  const response = await postJson(
    `${api}/api/families/${encodeURIComponent(familyId)}/import-legacy`,
    { members, linkedLegacyId },
    token,
  )
  if (response.status < 200 || response.status >= 300) {
    throw new Error(response.body?.error?.message ?? `导入失败（HTTP ${response.status}）`)
  }
  console.log(`导入完成：${response.body.memberCount} 位成员`)
  if (response.body.linkedMemberId) console.log(`当前用户已关联成员：${response.body.linkedMemberId}`)
}
