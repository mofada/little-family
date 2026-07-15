import { Solar, Lunar } from 'lunar-javascript'
import { FamilyMember } from '../types/family'

// 家庭数据只从登录用户有权访问的后端快照加载，客户端不再内置真实资料。
export const familyMembers: FamilyMember[] = []

// 保持数组引用稳定，远端快照加载后原地替换，供现有页面和组件共享。
export const replaceFamilyMembers = (members: FamilyMember[]): void => {
  familyMembers.splice(0, familyMembers.length, ...members)
}

// 家族颜色映射
export const FAMILY_PALETTE: Record<string, string> = {
  莫家: "#3b82f6", 彭家: "#16a34a", 唐家: "#f97316", 周家: "#9333ea",
  田家: "#0d9488", 曾家: "#ca8a04", 何家: "#dc2626", 肖家: "#4f46e5",
  任家: "#db2777", 谢家: "#d97706", 白家: "#a8866c", 卢家: "#64748b",
}

export const getFamilyColor = (familyName: string): string =>
  FAMILY_PALETTE[familyName] ?? "#a8866c"

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
export const getNextBirthdayDate = (member: FamilyMember, now = new Date()): Date => {
  const today = startOfDay(now)
  const year = today.getFullYear()

  if (member.birthdayType === "solar") {
    const thisYear = new Date(year, member.birthMonth - 1, member.birthDay)
    return thisYear >= today
      ? thisYear
      : new Date(year + 1, member.birthMonth - 1, member.birthDay)
  }

  const candidates = [year - 1, year, year + 1, year + 2]
    .map(lunarYear => getLunarBirthdayAsSolar(
      member.isLeapMonth ? -member.birthMonth : member.birthMonth,
      member.birthDay,
      lunarYear,
    ))
    .filter(date => date >= today)
    .sort((a, b) => a.getTime() - b.getTime())

  return candidates[0]
}

// 获取距今生日天数（0=今天，正数=还剩几天，循环到明年）
export const getDaysUntilBirthday = (member: FamilyMember, now = new Date()): number =>
  calendarDayDiff(startOfDay(now), getNextBirthdayDate(member, now))

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
    if (member.birthdayType === "lunar") {
      const memberMonth = member.isLeapMonth ? -member.birthMonth : member.birthMonth
      return memberMonth === lunarMonth && member.birthDay === lunarDay
    } else {
      return member.birthMonth === solarMonth && member.birthDay === solarDay
    }
  })
}

// 未来N天生日（不含今天）
export const getUpcomingBirthdays = (days = 30): FamilyMember[] => {
  return familyMembers
    .filter(member => {
      const d = getDaysUntilBirthday(member)
      return d > 0 && d <= days
    })
    .sort((a, b) => getDaysUntilBirthday(a) - getDaysUntilBirthday(b))
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

// 获取所有家族分支
export const getFamilyBranches = (): string[] => {
  const branches = new Set(familyMembers.map(m => m.familyName))
  return Array.from(branches)
}

// 按月份获取成员
export const getMembersByMonth = (): Map<number, FamilyMember[]> => {
  const map = new Map<number, FamilyMember[]>()
  for (let i = 1; i <= 12; i++) map.set(i, [])
  familyMembers.forEach(m => {
    const list = map.get(m.birthMonth)
    if (list) list.push(m)
  })
  return map
}

// 构建生日祝福 Prompt
export const buildBirthdayPrompt = (member: FamilyMember): string => {
  const age = calculateAge(member.birthYear)
  return `请模仿中国家庭微信群生日祝福风格生成文案。
要求：
- 温馨自然
- 不要太正式
- 适合发亲戚群
- 带 emoji
- 可以带微信表情：[蛋糕][庆祝][玫瑰]
- 不同年龄层语气不同

生日的人：
姓名：${member.name}${member.nickName ? `（${member.nickName}）` : ""}
称呼：${member.relation}
性别：${member.gender === "male" ? "男" : "女"}
年龄：${age !== null ? `${age}岁` : "未知"}
生日：${member.birthdayType === "lunar" ? `农历${member.isLeapMonth ? "闰" : ""}` : "阳历"}${member.birthMonth}月${member.birthDay}日`
}

// BFS 查找关系路径
export const findRelationPath = (fromId: string, toId: string): FamilyMember[] => {
  if (fromId === toId) return []
  const byId = new Map(familyMembers.map(m => [m.id, m]))

  const getNeighbors = (id: string): string[] => {
    const m = byId.get(id)
    if (!m) return []
    const neighbors: string[] = []
    if (m.parentId) neighbors.push(m.parentId)
    if (m.spouseId) neighbors.push(m.spouseId)
    familyMembers.filter(x => x.parentId === id).forEach(x => neighbors.push(x.id))
    const parent = m.parentId ? byId.get(m.parentId) : undefined
    if (parent?.spouseId && parent.spouseId !== id) neighbors.push(parent.spouseId)
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
