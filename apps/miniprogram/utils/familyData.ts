import { Solar, Lunar } from 'lunar-javascript'
import { FamilyMember } from '../types/family'

// 家庭数据只从登录用户有权访问的后端快照加载，客户端不再内置真实资料。
export const familyMembers: FamilyMember[] = []

// 保持数组引用稳定，远端快照加载后原地替换，供现有页面和组件共享。
export const replaceFamilyMembers = (members: FamilyMember[]): void => {
  familyMembers.splice(0, familyMembers.length, ...members)
}

export const getMemberColor = (member: Pick<FamilyMember, 'gender'>): string => {
  if (member.gender === 'male') return '#7a5c4e'
  if (member.gender === 'female') return '#b5564c'
  return '#a99c96'
}

// 农历生日转指定农历年份的公历日期
const getLunarBirthdayAsSolar = (lunarMonth: number, lunarDay: number, year: number): Date => {
  try {
    const lunar = Lunar.fromYmd(year, lunarMonth, lunarDay)
    const solar = lunar.getSolar()
    return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay())
  } catch {
    // 当年没有对应闰月时，MVP 按同月普通农历生日计算。
    try {
      const lunar = Lunar.fromYmd(year, Math.abs(lunarMonth), lunarDay)
      const solar = lunar.getSolar()
      return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay())
    } catch {
      return new Date(year, Math.abs(lunarMonth) - 1, lunarDay)
    }
  }
}

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const calendarDayDiff = (from: Date, to: Date): number => {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24))
}

// 获取下一次生日的公历日期。农历年与公历年并不完全重合，因此同时检查相邻农历年。
export const getNextBirthdayDate = (member: FamilyMember, now = new Date()): Date | null => {
  if (!member.birthdayType || member.birthMonth === null || member.birthDay === null) return null
  const birthMonth = member.birthMonth
  const birthDay = member.birthDay
  const today = startOfDay(now)
  const year = today.getFullYear()

  if (member.birthdayType === "solar") {
    const thisYear = new Date(year, birthMonth - 1, birthDay)
    return thisYear >= today
      ? thisYear
      : new Date(year + 1, birthMonth - 1, birthDay)
  }

  const candidates = [year - 1, year, year + 1, year + 2]
    .map(lunarYear => getLunarBirthdayAsSolar(
      member.isLeapMonth ? -birthMonth : birthMonth,
      birthDay,
      lunarYear,
    ))
    .filter(date => date >= today)
    .sort((a, b) => a.getTime() - b.getTime())

  return candidates[0]
}

// 获取距今生日天数（0=今天，正数=还剩几天，循环到明年）
export const getDaysUntilBirthday = (member: FamilyMember, now = new Date()): number | null => {
  const next = getNextBirthdayDate(member, now)
  return next ? calendarDayDiff(startOfDay(now), next) : null
}

// 今日生日成员
export const getTodayBirthdays = (): FamilyMember[] => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const solar = Solar.fromDate(today)
  const lunar = solar.getLunar()
  const lunarMonth = lunar.getMonth()
  const lunarDay = lunar.getDay()
  const solarMonth = today.getMonth() + 1
  const solarDay = today.getDate()

  return familyMembers.filter(member => {
    if (!member.birthdayType || member.birthMonth === null || member.birthDay === null) return false
    if (member.birthdayType === "lunar") {
      const memberMonth = member.isLeapMonth ? -member.birthMonth : member.birthMonth
      return memberMonth === lunarMonth && member.birthDay === lunarDay
    } else {
      return member.birthMonth === solarMonth && member.birthDay === solarDay
    }
  })
}

// 今日农历标签，用于首页日期头；闰月时带“闰”字，换算失败时不显示。
export const getTodayLunarLabel = (now = new Date()): string => {
  try {
    const lunar = Solar.fromDate(now).getLunar()
    const leap = lunar.getMonth() < 0 ? '闰' : ''
    return `农历${leap}${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`
  } catch {
    return ''
  }
}

// 未来N天生日（不含今天）
export const getUpcomingBirthdays = (days = 30): FamilyMember[] => {
  return familyMembers
    .filter(member => {
      const d = getDaysUntilBirthday(member)
      return d !== null && d > 0 && d <= days
    })
    .sort((a, b) => (getDaysUntilBirthday(a) ?? Infinity) - (getDaysUntilBirthday(b) ?? Infinity))
}

// 计算年龄
export const calculateAge = (birthYear: number | null): number | null => {
  if (!birthYear) return null
  return new Date().getFullYear() - birthYear
}

// 按代际分组
export const getMembersByGeneration = (): Map<number, FamilyMember[]> => {
  const grouped = new Map<number, FamilyMember[]>()
  familyMembers.forEach(member => {
    const gen = member.generation
    if (!grouped.has(gen)) grouped.set(gen, [])
    grouped.get(gen)!.push(member)
  })
  return grouped
}

// 按月份获取成员
export const getMembersByMonth = (): Map<number, FamilyMember[]> => {
  const map = new Map<number, FamilyMember[]>()
  for (let i = 1; i <= 12; i++) map.set(i, [])
  familyMembers.forEach(m => {
    if (m.birthMonth === null) return
    const list = map.get(m.birthMonth)
    if (list) list.push(m)
  })
  return map
}

// 构建生日祝福 Prompt
export const buildBirthdayPrompt = (member: FamilyMember): string => {
  const age = calculateAge(member.birthYear)
  return `请写一条可以直接发到家族微信群的生日祝福，风格要热闹、喜庆、有排面，不写成小作文。

要求：
- 使用3—6行短句，开头从“${member.relation || "家人"}”“${member.name}${member.relation || "家人"}”中选更自然的称呼，${member.nickName ? `带上“@${member.nickName}”` : "不要编造@昵称"}；也可以先放花体生日英文
- 必须写“生日快乐”，蛋糕可以连续放3—6个；整体使用8—16个 emoji 或微信表情
- 从 [蛋糕][庆祝][礼物][红包][發][福][太阳][烟花][爱心][加油] 中选2—6个，搭配两三组简短吉利话
- ${age === null ? '不要猜年龄，也不要写“年龄未知”' : `已提供的${age}岁只用于选择合适祝福词，正文不得出现年龄、出生年份或“几岁”`}
- 不编造@昵称、职业、性格、近况或共同回忆；不解释、不署名

生日的人：
姓名：${member.name}${member.nickName ? `（${member.nickName}）` : ""}
称呼：${member.relation}
群内@昵称：${member.nickName || "未记录，不要编造"}
性别：${member.gender === "male" ? "男" : "女"}
年龄：${age !== null ? `${age}岁` : "未记录"}
生日：${member.birthdayType && member.birthMonth !== null && member.birthDay !== null
    ? `${member.birthdayType === "lunar" ? `农历${member.isLeapMonth ? "闰" : ""}` : "阳历"}${member.birthMonth}月${member.birthDay}日`
    : "未记录"}`
}

// BFS 查找关系路径
export const findRelationPath = (fromId: string, toId: string): FamilyMember[] => {
  if (fromId === toId) return []
  const byId = new Map(familyMembers.map(m => [m.id, m]))

  const getNeighbors = (id: string): string[] => {
    const m = byId.get(id)
    if (!m) return []
    const neighbors: string[] = []
    neighbors.push(...m.parentIds)
    if (m.spouseId) neighbors.push(m.spouseId)
    familyMembers.filter(x => x.parentIds.includes(id)).forEach(x => neighbors.push(x.id))
    m.parentIds.forEach(parentId => {
      const parent = byId.get(parentId)
      if (parent?.spouseId && parent.spouseId !== id) neighbors.push(parent.spouseId)
    })
    return neighbors
  }

  const queue: string[][] = [[fromId]]
  const visited = new Set<string>([fromId])

  while (queue.length > 0) {
    const path = queue.shift()!
    const current = path[path.length - 1]
    for (const neighbor of getNeighbors(current)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        const newPath = [...path, neighbor]
        if (neighbor === toId) {
          return newPath.map(id => byId.get(id)!).filter(Boolean)
        }
        queue.push(newPath)
      }
    }
  }
  return []
}
