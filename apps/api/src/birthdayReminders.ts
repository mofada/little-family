import { randomUUID } from 'node:crypto'
import { config } from './config'
import { db, transaction } from './db'
import { sendBirthdaySubscribeMessage } from './wechat'
import { getBeijingClock, type BeijingClock } from './birthdayClock'
import { BIRTHDAY_TEMPLATE } from './birthdayTemplate'

interface SubscriberRow {
  user_id: string
  openid: string
}

interface BirthdayFamilyRow {
  family_id: string
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

const birthdayFamilyIds = (clock: BeijingClock): string[] => {
  const rows = db.prepare(`
    SELECT DISTINCT family_id FROM members
    WHERE
      (birthday_type = 'solar' AND birth_month = ? AND birth_day = ?)
      OR
      (birthday_type = 'lunar' AND birth_month = ? AND birth_day = ? AND is_leap_month = ?)
  `).all(
    clock.month, clock.day,
    clock.lunarMonth, clock.lunarDay, clock.lunarLeap ? 1 : 0,
  ) as unknown as BirthdayFamilyRow[]
  return rows.map(row => row.family_id)
}

const familySubscribers = (
  familyId: string,
  localDate: string,
  includeDelivered: boolean,
): SubscriberRow[] => db.prepare(`
  SELECT DISTINCT
    grants.user_id,
    COALESCE(
      (
        SELECT identities.openid
        FROM wechat_identities AS identities
        WHERE identities.user_id = grants.user_id
          AND identities.provider = 'miniprogram'
        ORDER BY identities.updated_at DESC
        LIMIT 1
      ),
      CASE WHEN users.openid NOT LIKE 'website:%' THEN users.openid END
    ) AS openid
  FROM birthday_subscription_grants AS grants
  JOIN users ON users.id = grants.user_id
  JOIN family_users AS memberships
    ON memberships.family_id = grants.family_id AND memberships.user_id = grants.user_id
  WHERE grants.family_id = ?
    AND grants.status = 'active'
    AND grants.template_id = ?
    AND (
      ? = 1
      OR NOT EXISTS (
        SELECT 1 FROM birthday_reminder_deliveries AS deliveries
        WHERE deliveries.family_id = grants.family_id
          AND deliveries.user_id = grants.user_id
          AND deliveries.local_date = ?
      )
    )
    AND COALESCE(
      (
        SELECT identities.openid
        FROM wechat_identities AS identities
        WHERE identities.user_id = grants.user_id
          AND identities.provider = 'miniprogram'
        ORDER BY identities.updated_at DESC
        LIMIT 1
      ),
      CASE WHEN users.openid NOT LIKE 'website:%' THEN users.openid END
    ) IS NOT NULL
`).all(
  familyId,
  BIRTHDAY_TEMPLATE.id,
  includeDelivered ? 1 : 0,
  localDate,
) as unknown as SubscriberRow[]

export const runBirthdayReminderJob = async (
  date = new Date(),
  targetFamilyId?: string,
  force = false,
): Promise<number> => {
  if (!config.wechatAppId || !config.wechatAppSecret) return 0
  const clock = getBeijingClock(date)

  let sentCount = 0
  const familyIds = targetFamilyId
    ? birthdayFamilyIds(clock).filter(familyId => familyId === targetFamilyId)
    : birthdayFamilyIds(clock)
  for (const familyId of familyIds) {
    const names = birthdayNames(familyId, clock)
    const memberNames = names.join('、').slice(0, 20)
    const subscribers = familySubscribers(familyId, clock.localDate, force)
    if (subscribers.length === 0) continue
    console.log('Birthday reminder recipients resolved', {
      familyId,
      localDate: clock.localDate,
      memberNames,
      subscriberCount: subscribers.length,
      userIds: subscribers.map(subscriber => subscriber.user_id),
    })
    for (const subscriber of subscribers) {
      const createdAt = new Date().toISOString()
      let deliveryId: string = randomUUID()
      if (force) {
        const existing = db.prepare(`
          SELECT id FROM birthday_reminder_deliveries
          WHERE family_id = ? AND user_id = ? AND local_date = ?
        `).get(familyId, subscriber.user_id, clock.localDate) as { id: string } | undefined
        if (existing) {
          deliveryId = existing.id
          const reset = db.prepare(`
            UPDATE birthday_reminder_deliveries
            SET member_names = ?, status = 'pending', error_message = NULL,
                created_at = ?, sent_at = NULL
            WHERE id = ? AND status <> 'pending'
          `).run(memberNames, createdAt, deliveryId)
          if (Number(reset.changes) === 0) continue
        } else {
          const inserted = db.prepare(`
            INSERT OR IGNORE INTO birthday_reminder_deliveries
              (id, family_id, user_id, local_date, member_names, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?)
          `).run(deliveryId, familyId, subscriber.user_id, clock.localDate, memberNames, createdAt)
          if (Number(inserted.changes) === 0) continue
        }
      } else {
        const inserted = db.prepare(`
          INSERT OR IGNORE INTO birthday_reminder_deliveries
            (id, family_id, user_id, local_date, member_names, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'pending', ?)
        `).run(deliveryId, familyId, subscriber.user_id, clock.localDate, memberNames, createdAt)
        if (Number(inserted.changes) === 0) continue
      }

      const grant = db.prepare(`
        SELECT id FROM birthday_subscription_grants
        WHERE family_id = ? AND user_id = ? AND template_id = ? AND status = 'active'
        ORDER BY granted_at LIMIT 1
      `).get(familyId, subscriber.user_id, BIRTHDAY_TEMPLATE.id) as { id: string } | undefined
      if (!grant) {
        db.prepare('DELETE FROM birthday_reminder_deliveries WHERE id = ?').run(deliveryId)
        continue
      }

      try {
        const result = await sendBirthdaySubscribeMessage(subscriber.openid, memberNames, clock.dateLabel)
        if (result.errcode !== 0) {
          console.error('Birthday reminder rejected by WeChat', {
            familyId,
            userId: subscriber.user_id,
            errcode: result.errcode,
            errmsg: result.errmsg,
          })
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
        console.log('Birthday reminder sent', {
          familyId,
          userId: subscriber.user_id,
        })
      } catch (error) {
        // 网络级错误不消耗授权，删除占位以便下一分钟重试。
        db.prepare('DELETE FROM birthday_reminder_deliveries WHERE id = ?').run(deliveryId)
        console.error('Birthday reminder delivery failed', {
          familyId,
          userId: subscriber.user_id,
          error,
        })
      }
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
      if (sent > 0) {
        console.log(`Birthday reminder job completed: ${sent} message(s) sent`)
      }
    } catch (error) {
      console.error('Birthday reminder job failed', error)
    } finally {
      running = false
    }
  }
  void tick()
  const timer = setInterval(() => { void tick() }, 60_000)
  timer.unref()
}
