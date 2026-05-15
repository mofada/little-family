import { Solar, Lunar } from 'lunar-javascript'
import { FamilyMember } from '../types/family'

export const familyMembers: FamilyMember[] = [
  // === 第1代 ===
  { id: "1", parentId: null, spouseId: null, familyName: "彭家", generation: 1, name: "唐贵娥", relation: "外婆", birthYear: 1933, gender: "female", birthdayType: "lunar", birthMonth: 10, birthDay: 3 },
  { id: "2", parentId: null, spouseId: "3", familyName: "莫家", generation: 1, name: "莫代圳", relation: "爷爷", birthYear: 1935, gender: "male", birthdayType: "lunar", birthMonth: 4, birthDay: 28 },
  { id: "3", parentId: null, spouseId: "2", familyName: "周家", generation: 1, name: "周顺椒", relation: "奶奶", birthYear: null, gender: "female", birthdayType: "lunar", birthMonth: 3, birthDay: 21 },
  // === 第2代 ===
  { id: "11", parentId: "1", spouseId: "12", familyName: "彭家", generation: 2, name: "彭前进", relation: "舅舅", birthYear: 1959, gender: "male", birthdayType: "lunar", birthMonth: 11, birthDay: 29 },
  { id: "12", parentId: null, spouseId: "11", familyName: "唐家", generation: 2, name: "唐小花", relation: "舅妈", birthYear: 1961, gender: "female", birthdayType: "lunar", birthMonth: 12, birthDay: 28 },
  { id: "13", parentId: null, spouseId: "14", familyName: "唐家", generation: 2, name: "唐社青", relation: "姨父", birthYear: 1958, gender: "male", birthdayType: "lunar", birthMonth: 1, birthDay: 26 },
  { id: "14", parentId: "1", spouseId: "13", familyName: "彭家", generation: 2, name: "彭红英", relation: "姨妈", birthYear: 1963, gender: "female", birthdayType: "lunar", birthMonth: 2, birthDay: 24 },
  { id: "15", parentId: "2", spouseId: "16", familyName: "莫家", generation: 2, name: "莫新付", relation: "爸爸", birthYear: 1970, gender: "male", birthdayType: "lunar", birthMonth: 1, birthDay: 13 },
  { id: "16", parentId: "1", spouseId: "15", familyName: "彭家", generation: 2, name: "彭四英", relation: "妈妈", birthYear: 1968, gender: "female", birthdayType: "lunar", birthMonth: 5, birthDay: 15 },
  { id: "17", parentId: null, spouseId: "18", familyName: "任家", generation: 2, name: "任共华", relation: "岳父", birthYear: 1967, gender: "male", birthdayType: "lunar", birthMonth: 12, birthDay: 19 },
  { id: "18", parentId: null, spouseId: "17", familyName: "白家", generation: 2, name: "白玉香", relation: "岳母", birthYear: 1968, gender: "female", birthdayType: "lunar", birthMonth: 8, birthDay: 22 },
  // === 第3代 ===
  { id: "111", parentId: "11", spouseId: "112", familyName: "彭家", generation: 3, name: "彭丽", relation: "姐姐", birthYear: 1983, gender: "female", birthdayType: "lunar", birthMonth: 8, birthDay: 20 },
  { id: "112", parentId: null, spouseId: "111", familyName: "田家", generation: 3, name: "田晓光", relation: "姐夫", birthYear: 1982, gender: "male", birthdayType: "lunar", birthMonth: 9, birthDay: 2 },
  { id: "113", parentId: "11", spouseId: "114", familyName: "彭家", generation: 3, name: "彭菲", relation: "姐姐", birthYear: 1984, gender: "female", birthdayType: "lunar", birthMonth: 11, birthDay: 23 },
  { id: "114", parentId: null, spouseId: "113", familyName: "曾家", generation: 3, name: "曾荣华", relation: "姐夫", birthYear: 1982, gender: "male", birthdayType: "lunar", birthMonth: 4, birthDay: 16 },
  { id: "115", parentId: "11", spouseId: null, familyName: "彭家", generation: 3, name: "彭攀", relation: "哥哥", birthYear: 1986, gender: "male", birthdayType: "lunar", birthMonth: 8, birthDay: 6 },
  { id: "116", parentId: "13", spouseId: "117", familyName: "唐家", generation: 3, name: "唐群群", relation: "姐姐", birthYear: 1984, gender: "female", birthdayType: "lunar", birthMonth: 10, birthDay: 26 },
  { id: "117", parentId: null, spouseId: "116", familyName: "何家", generation: 3, name: "何海丰", relation: "姐夫", birthYear: 1985, gender: "male", birthdayType: "lunar", birthMonth: 8, birthDay: 19 },
  { id: "118", parentId: "13", spouseId: null, familyName: "唐家", generation: 3, name: "唐方方", relation: "哥哥", birthYear: 1987, gender: "male", birthdayType: "lunar", birthMonth: 4, birthDay: 26 },
  { id: "119", parentId: "15", spouseId: "120", familyName: "莫家", generation: 3, name: "莫娟", relation: "姐姐", birthYear: 1990, gender: "female", birthdayType: "lunar", birthMonth: 7, birthDay: 16 },
  { id: "120", parentId: null, spouseId: "119", familyName: "肖家", generation: 3, name: "肖江红", relation: "姐夫", birthYear: 1988, gender: "male", birthdayType: "lunar", birthMonth: 8, birthDay: 15 },
  { id: "121", parentId: "15", spouseId: "122", familyName: "莫家", generation: 3, name: "莫发达", relation: "我自己", birthYear: 1997, gender: "male", birthdayType: "lunar", birthMonth: 3, birthDay: 28 },
  { id: "122", parentId: "17", spouseId: "121", familyName: "任家", generation: 3, name: "任婵", relation: "老婆", birthYear: 1998, gender: "female", birthdayType: "lunar", birthMonth: 5, birthDay: 3 },
  { id: "123", parentId: "15", spouseId: "124", familyName: "莫家", generation: 3, name: "莫秀", relation: "姐姐", birthYear: 1995, gender: "female", birthdayType: "lunar", birthMonth: 9, birthDay: 12 },
  { id: "124", parentId: null, spouseId: "123", familyName: "谢家", generation: 3, name: "谢海峰", relation: "姐夫", birthYear: 1993, gender: "male", birthdayType: "lunar", birthMonth: 6, birthDay: 26 },
  { id: "171", parentId: "17", spouseId: "172", familyName: "任家", generation: 3, name: "任丹", relation: "姐姐", birthYear: 1991, gender: "female", birthdayType: "lunar", birthMonth: 7, birthDay: 28 },
  { id: "172", parentId: null, spouseId: "171", familyName: "卢家", generation: 3, name: "卢强", relation: "姐夫", birthYear: 1992, gender: "male", birthdayType: "lunar", birthMonth: 7, birthDay: 28 },
  // === 第4代 ===
  { id: "1121", parentId: "112", spouseId: null, familyName: "田家", generation: 4, name: "田子鹏", relation: "侄子", birthYear: 2010, gender: "male", birthdayType: "lunar", birthMonth: 12, birthDay: 24 },
  { id: "1122", parentId: "112", spouseId: null, familyName: "田家", generation: 4, name: "田子程", relation: "侄子", birthYear: 2014, gender: "male", birthdayType: "lunar", birthMonth: 11, birthDay: 12 },
  { id: "1141", parentId: "114", spouseId: null, familyName: "曾家", generation: 4, name: "曾芷琪", relation: "侄女", birthYear: 2011, gender: "female", birthdayType: "lunar", birthMonth: 3, birthDay: 27 },
  { id: "1142", parentId: "114", spouseId: null, familyName: "曾家", generation: 4, name: "彭曾子玥", relation: "侄女", birthYear: 2018, gender: "female", birthdayType: "lunar", birthMonth: 11, birthDay: 16 },
  { id: "1151", parentId: "115", spouseId: null, familyName: "彭家", generation: 4, name: "彭梓珊", nickName: "跳跳", relation: "侄女", birthYear: 2013, gender: "female", birthdayType: "lunar", birthMonth: 9, birthDay: 20 },
  { id: "1171", parentId: "117", spouseId: null, familyName: "何家", generation: 4, name: "何诗怡", relation: "侄女", birthYear: 2008, gender: "female", birthdayType: "lunar", birthMonth: 10, birthDay: 22 },
  { id: "1172", parentId: "117", spouseId: null, familyName: "何家", generation: 4, name: "何诗语", relation: "侄女", birthYear: 2013, gender: "female", birthdayType: "lunar", birthMonth: 10, birthDay: 27 },
  { id: "1181", parentId: "118", spouseId: null, familyName: "唐家", generation: 4, name: "唐悦", nickName: "小悦", relation: "侄子", birthYear: 2016, gender: "male", birthdayType: "lunar", birthMonth: 4, birthDay: 21 },
  { id: "1182", parentId: "118", spouseId: null, familyName: "唐家", generation: 4, name: "唐小宝", nickName: "小宝", relation: "侄子", birthYear: 2019, gender: "male", birthdayType: "lunar", birthMonth: 10, birthDay: 29 },
  { id: "1201", parentId: "120", spouseId: null, familyName: "肖家", generation: 4, name: "肖子熙", nickName: "果果", relation: "侄子", birthYear: 2017, gender: "male", birthdayType: "solar", birthMonth: 7, birthDay: 27 },
  { id: "1202", parentId: "120", spouseId: null, familyName: "肖家", generation: 4, name: "肖锦宸", nickName: "希希", relation: "侄子", birthYear: 2026, gender: "male", birthdayType: "solar", birthMonth: 1, birthDay: 1 },
  { id: "1241", parentId: "124", spouseId: null, familyName: "谢家", generation: 4, name: "谢子怡", nickName: "团团", relation: "侄女", birthYear: 2023, gender: "female", birthdayType: "solar", birthMonth: 5, birthDay: 1 },
  { id: "1721", parentId: "171", spouseId: null, familyName: "卢家", generation: 4, name: "卢筱妍", relation: "侄女", birthYear: 2016, gender: "female", birthdayType: "solar", birthMonth: 6, birthDay: 29 },
  { id: "1722", parentId: "171", spouseId: null, familyName: "卢家", generation: 4, name: "卢筱湉", relation: "侄女", birthYear: 2021, gender: "female", birthdayType: "solar", birthMonth: 11, birthDay: 13 },
]

// 家族颜色映射
export const FAMILY_PALETTE: Record<string, string> = {
  莫家: "#3b82f6", 彭家: "#16a34a", 唐家: "#f97316", 周家: "#9333ea",
  田家: "#0d9488", 曾家: "#ca8a04", 何家: "#dc2626", 肖家: "#4f46e5",
  任家: "#db2777", 谢家: "#d97706", 白家: "#a8866c", 卢家: "#64748b",
}

export const getFamilyColor = (familyName: string): string =>
  FAMILY_PALETTE[familyName] ?? "#a8866c"

// 农历生日转指定年份公历日期
const getLunarBirthdayAsSolar = (lunarMonth: number, lunarDay: number, year: number): Date => {
  try {
    const lunar = Lunar.fromYmd(year, lunarMonth, lunarDay)
    const solar = lunar.getSolar()
    return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay())
  } catch {
    return new Date(year, lunarMonth - 1, lunarDay)
  }
}

// 获取距今生日天数（0=今天，正数=还剩几天，循环到明年）
export const getDaysUntilBirthday = (member: FamilyMember): number => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const year = today.getFullYear()

  let birthday: Date
  if (member.birthdayType === "solar") {
    birthday = new Date(year, member.birthMonth - 1, member.birthDay)
  } else {
    birthday = getLunarBirthdayAsSolar(member.birthMonth, member.birthDay, year)
  }

  let diff = Math.floor((birthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diff < 0) {
    if (member.birthdayType === "solar") {
      birthday = new Date(year + 1, member.birthMonth - 1, member.birthDay)
    } else {
      birthday = getLunarBirthdayAsSolar(member.birthMonth, member.birthDay, year + 1)
    }
    diff = Math.floor((birthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  return diff
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
    if (member.birthdayType === "lunar") {
      return member.birthMonth === lunarMonth && member.birthDay === lunarDay
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
生日：${member.birthdayType === "lunar" ? "农历" : "阳历"}${member.birthMonth}月${member.birthDay}日`
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
