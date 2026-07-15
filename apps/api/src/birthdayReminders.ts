import { randomUUID } from 'node:crypto'
import { config } from './config'
import { db, transaction } from './db'
import { sendBirthdaySubscribeMessage } from './wechat'
import { getBeijingClock, type BeijingClock } from './birthdayClock'
import { BIRTHDAY_TEMPLATE } from './birthdayTemplate'

interface SubscriberRow {
  family_id: string
  user_id: string
  openid: string
}

const birthdayNames = (familyId: string, clock: BeijingClock): string[] => {
  const rows = db.prepare(`
    SELECT name FROM members
    WHERE family_id = ? AND (
      (birthday_type = 'solar' AND birth_month = ? AND birth_day = ?)
      OR
      (birthday_type = 'lunar' AND birth_month = ? AND birth_day = ? AND is_leap_month = ?)
    )
    ORDER BY created_at
  `).all(
    familyId,
    clock.month, clock.day,
    clock.lunarMonth, clock.lunarDay, clock.lunarLeap ? 1 : 0,
  ) as unknown as Array<{ name: string }>
  return rows.map(row => row.name)
}

export const runBirthdayReminderJob = async (date = new Date()): Promise<number> => {
  if (!config.wechatAppId || !config.wechatAppSecret) return 0
  const clock = getBeijingClock(date)
  const subscribers = db.prepare(`
    SELECT DISTINCT grants.family_id, grants.user_id, users.openid
    FROM birthday_subscription_grants AS grants
    JOIN users ON users.id = grants.user_id
    WHERE grants.status = 'active' AND grants.template_id = ?
  `).all(BIRTHDAY_TEMPLATE.id) as unknown as SubscriberRow[]

  let sentCount = 0
  for (const subscriber of subscribers) {
    const names = birthdayNames(subscriber.family_id, clock)
    if (names.length === 0) continue
    const memberNames = names.join('、').slice(0, 20)
    const deliveryId = randomUUID()
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO birthday_reminder_deliveries
        (id, family_id, user_id, local_date, member_names, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(deliveryId, subscriber.family_id, subscriber.user_id, clock.localDate, memberNames, new Date().toISOString())
    if (Number(inserted.changes) === 0) continue

    const grant = db.prepare(`
      SELECT id FROM birthday_subscription_grants
      WHERE family_id = ? AND user_id = ? AND template_id = ? AND status = 'active'
      ORDER BY granted_at LIMIT 1
    `).get(subscriber.family_id, subscriber.user_id, BIRTHDAY_TEMPLATE.id) as { id: string } | undefined
    if (!grant) {
      db.prepare('DELETE FROM birthday_reminder_deliveries WHERE id = ?').run(deliveryId)
      continue
    }

    try {
      const result = await sendBirthdaySubscribeMessage(subscriber.openid, memberNames, clock.dateLabel)
      if (result.errcode !== 0) {
        transaction(() => {
          db.prepare("UPDATE birthday_reminder_deliveries SET status = 'failed', error_message = ? WHERE id = ?")
            .run(`${result.errcode}: ${result.errmsg}`, deliveryId)
          db.prepare("UPDATE birthday_subscription_grants SET status = 'failed', consumed_at = ? WHERE id = ?")
            .run(new Date().toISOString(), grant.id)
        })
        continue
      }
      transaction(() => {
        const timestamp = new Date().toISOString()
        db.prepare("UPDATE birthday_reminder_deliveries SET status = 'sent', sent_at = ? WHERE id = ?")
          .run(timestamp, deliveryId)
        if (BIRTHDAY_TEMPLATE.subscriptionMode === 'once') {
          db.prepare("UPDATE birthday_subscription_grants SET status = 'consumed', consumed_at = ? WHERE id = ?")
            .run(timestamp, grant.id)
        }
      })
      sentCount += 1
    } catch (error) {
      // 网络级错误不消耗授权，删除占位以便下一分钟重试。
      db.prepare('DELETE FROM birthday_reminder_deliveries WHERE id = ?').run(deliveryId)
      console.error('Birthday reminder delivery failed', error)
    }
  }
  return sentCount
}

let running = false
let lastMinute = ''

export const startBirthdayReminderScheduler = (): void => {
  const tick = async () => {
    const clock = getBeijingClock()
    const minuteKey = `${clock.localDate}-${clock.hour}-${clock.minute}`
    if (clock.hour !== 8 || minuteKey === lastMinute || running) return
    lastMinute = minuteKey
    running = true
    try {
      const sent = await runBirthdayReminderJob()
      console.log(`Birthday reminder job completed: ${sent} message(s) sent`)
    } finally {
      running = false
    }
  }
  void tick()
  const timer = setInterval(() => { void tick() }, 60_000)
  timer.unref()
}
