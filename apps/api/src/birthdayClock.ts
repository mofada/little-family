const TIME_ZONE = 'Asia/Shanghai'

const partsRecord = (parts: Intl.DateTimeFormatPart[]): Record<string, string> =>
  Object.fromEntries(parts.map(part => [part.type, part.value]))

export interface BeijingClock {
  localDate: string
  dateLabel: string
  year: number
  month: number
  day: number
  hour: number
  minute: number
  lunarMonth: number
  lunarDay: number
  lunarLeap: boolean
}

export const getBeijingClock = (date = new Date()): BeijingClock => {
  const solar = partsRecord(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date))
  const lunar = partsRecord(new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
    timeZone: TIME_ZONE,
    month: 'numeric', day: 'numeric',
  }).formatToParts(date))
  const lunarMonthText = lunar.month ?? ''
  const year = Number(solar.year)
  const month = Number(solar.month)
  const day = Number(solar.day)
  return {
    localDate: `${solar.year}-${solar.month}-${solar.day}`,
    dateLabel: `${year}年${month}月${day}日`,
    year, month, day,
    hour: Number(solar.hour),
    minute: Number(solar.minute),
    lunarMonth: Number(lunarMonthText.match(/\d+/)?.[0] ?? 0),
    lunarDay: Number(lunar.day),
    lunarLeap: /bis|闰/i.test(lunarMonthText),
  }
}
