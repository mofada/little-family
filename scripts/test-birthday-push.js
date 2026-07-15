/* eslint-disable no-console */
const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')

const TEMPLATE_ID = '4Hd2RmOKkWxhOzvP_ZTIKYaCiCorerofM0yPpydIdRg'
const ROOT_DIR = path.resolve(__dirname, '..')

const loadEnv = (file) => {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

loadEnv(path.join(ROOT_DIR, '.env'))
loadEnv(path.join(ROOT_DIR, 'apps', 'api', '.env'))

const appId = process.env.WECHAT_APP_ID
const appSecret = process.env.WECHAT_APP_SECRET
const openid = 'o7b9H3UwutDX10h_MDzMvy9eL_eI'
const memberName = (process.env.TEST_MEMBER_NAME || process.argv[3] || '家人').slice(0, 10)

if (!appId || !appSecret) {
  throw new Error('请先在 apps/api/.env 中配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET')
}
if (!openid) {
  throw new Error('请设置 TEST_WECHAT_OPENID，或运行：node test-birthday-push.js <openid> [称呼]')
}

const postJson = (url, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body)
  const request = https.request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(data),
    },
  }, response => {
    let raw = ''
    response.setEncoding('utf8')
    response.on('data', chunk => { raw += chunk })
    response.on('end', () => {
      try {
        const result = JSON.parse(raw)
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${raw}`))
          return
        }
        resolve(result)
      } catch (error) {
        reject(error)
      }
    })
  })
  request.on('error', reject)
  request.end(data)
})

const main = async () => {
  const tokenResult = await postJson('https://api.weixin.qq.com/cgi-bin/stable_token', {
    grant_type: 'client_credential',
    appid: appId,
    secret: appSecret,
    force_refresh: false,
  })
  if (!tokenResult.access_token) {
    throw new Error(`获取 access_token 失败：${tokenResult.errcode || ''} ${tokenResult.errmsg || ''}`)
  }

  const beijingDate = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).format(new Date())

  const result = await postJson(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(tokenResult.access_token)}`,
    {
      touser: openid,
      template_id: TEMPLATE_ID,
      page: 'pages/birthday/index',
      miniprogram_state: process.env.WECHAT_MINIPROGRAM_STATE
        || (process.env.NODE_ENV === 'production' ? 'formal' : 'developer'),
      lang: 'zh_CN',
      data: {
        name1: { value: memberName },
        thing6: { value: beijingDate },
        thing5: { value: '生日提醒测试发送成功' },
      },
    },
  )
  if (result.errcode !== 0) {
    throw new Error(`微信发送失败：${result.errcode} ${result.errmsg || ''}`)
  }

  console.log(`测试消息发送成功：${memberName}，${beijingDate}`)
  console.log('注意：本次微信一次性订阅授权已经被实际消耗。')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
