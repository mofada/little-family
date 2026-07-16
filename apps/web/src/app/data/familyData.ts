import { Lunar, Solar } from "lunar-javascript";
import type { ApiFamilyMember, FamilyMember } from "../types/family";

// 页面继续共享稳定数组引用，但内容只来自当前登录用户的 API 快照。
export const familyMembers: FamilyMember[] = [];

export const replaceFamilyMembers = (members: ApiFamilyMember[], familyName: string): void => {
  familyMembers.splice(0, familyMembers.length, ...members.map((member) => ({
    ...member,
    familyName,
    parentId: member.parentIds[0] ?? null,
  })));
};

export const clearFamilyMembers = (): void => {
  familyMembers.splice(0, familyMembers.length);
};

const getLunarBirthdayAsSolar = (
  month: number,
  day: number,
  lunarYear: number,
  isLeapMonth = false,
): Date => {
  const lunarMonth = isLeapMonth ? -month : month;
  try {
    const solar = Lunar.fromYmd(lunarYear, lunarMonth, day).getSolar();
    return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
  } catch {
    const solar = Lunar.fromYmd(lunarYear, month, day).getSolar();
    return new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay());
  }
};

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const dayDiff = (from: Date, to: Date): number =>
  Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
    - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86_400_000);

export const getNextBirthdayDate = (member: FamilyMember, now = new Date()): Date | null => {
  if (!member.birthdayType || member.birthMonth === null || member.birthDay === null) return null;
  const today = startOfDay(now);
  const year = today.getFullYear();
  if (member.birthdayType === "solar") {
    const thisYear = new Date(year, member.birthMonth - 1, member.birthDay);
    return thisYear >= today ? thisYear : new Date(year + 1, member.birthMonth - 1, member.birthDay);
  }
  return [year - 1, year, year + 1, year + 2]
    .map((lunarYear) => getLunarBirthdayAsSolar(
      member.birthMonth!, member.birthDay!, lunarYear, member.isLeapMonth,
    ))
    .filter((date) => date >= today)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
};

export const getDaysUntilBirthday = (member: FamilyMember, now = new Date()): number | null => {
  const nextBirthday = getNextBirthdayDate(member, now);
  return nextBirthday ? dayDiff(startOfDay(now), nextBirthday) : null;
};

export const getTodayBirthdays = (): FamilyMember[] => {
  const today = startOfDay(new Date());
  const lunar = Solar.fromDate(today).getLunar();
  return familyMembers.filter((member) => {
    if (!member.birthdayType || member.birthMonth === null || member.birthDay === null) return false;
    if (member.birthdayType === "solar") {
      return member.birthMonth === today.getMonth() + 1 && member.birthDay === today.getDate();
    }
    const memberMonth = member.isLeapMonth ? -member.birthMonth : member.birthMonth;
    return memberMonth === lunar.getMonth() && member.birthDay === lunar.getDay();
  });
};

export const getUpcomingBirthdays = (days = 30): FamilyMember[] =>
  familyMembers
    .filter((member) => {
      const remaining = getDaysUntilBirthday(member);
      return remaining !== null && remaining > 0 && remaining <= days;
    })
    .sort((a, b) => (getDaysUntilBirthday(a) ?? Infinity) - (getDaysUntilBirthday(b) ?? Infinity));

export const calculateAge = (birthYear: number | null): number | null =>
  birthYear ? new Date().getFullYear() - birthYear : null;

export const getMembersByGeneration = (): Map<number, FamilyMember[]> => {
  const grouped = new Map<number, FamilyMember[]>();
  familyMembers.forEach((member) => {
    const items = grouped.get(member.generation) ?? [];
    items.push(member);
    grouped.set(member.generation, items);
  });
  return grouped;
};

export const getFamilyBranches = (): string[] =>
  [...new Set(familyMembers.map((member) => member.familyName))];

export const buildBirthdayPrompt = (member: FamilyMember): string => `请模仿中国家庭微信群生日祝福风格生成文案。
要求：
- 温馨自然，不要太正式
- 适合发亲戚群，带 emoji
- 可以带微信表情：[蛋糕][庆祝][玫瑰]
- 不同年龄层语气不同

生日的人：
姓名：${member.name}${member.nickName ? `（${member.nickName}）` : ""}
称呼：${member.relation || "家人"}
性别：${member.gender === "male" ? "男" : member.gender === "female" ? "女" : "未知"}
年龄：${calculateAge(member.birthYear) ?? "未知"}岁
生日：${member.birthdayType && member.birthMonth !== null && member.birthDay !== null
    ? `${member.birthdayType === "lunar" ? `农历${member.isLeapMonth ? "闰" : ""}` : "阳历"}${member.birthMonth}月${member.birthDay}日`
    : "未记录"}`;

export const findRelationPath = (fromId: string, toId: string): FamilyMember[] => {
  if (fromId === toId) return [];
  const byId = new Map(familyMembers.map((member) => [member.id, member]));
  const queue: string[][] = [[fromId]];
  const visited = new Set([fromId]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = byId.get(path[path.length - 1]);
    if (!current) continue;
    const neighbors = new Set<string>(current.parentIds);
    if (current.spouseId) neighbors.add(current.spouseId);
    familyMembers.filter((member) => member.parentIds.includes(current.id))
      .forEach((member) => neighbors.add(member.id));
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      const next = [...path, neighbor];
      if (neighbor === toId) return next.map((id) => byId.get(id)!).filter(Boolean);
      visited.add(neighbor);
      queue.push(next);
    }
  }
  return [];
};
