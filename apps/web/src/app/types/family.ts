export type FamilyRole = "owner" | "admin" | "editor" | "viewer";

export interface ApiFamilyMember {
  id: string;
  parentIds: string[];
  spouseId: string | null;
  generation: number;
  name: string;
  nickName?: string;
  relation: string;
  birthYear: number | null;
  gender: "male" | "female" | "unknown";
  birthdayType: "solar" | "lunar" | null;
  birthMonth: number | null;
  birthDay: number | null;
  isLeapMonth?: boolean;
}

// 页面沿用原设计稿的 familyName / parentId 展示入口；两者由快照适配得到，
// 不会作为家族分支或亲缘真值写回服务端。
export interface FamilyMember extends ApiFamilyMember {
  familyName: string;
  parentId: string | null;
}

export interface FamilySummary {
  id: string;
  name: string;
  description: string;
  role: FamilyRole;
  linkedMemberId?: string | null;
  memberCount: number;
}

export interface FamilySnapshot {
  family: FamilySummary;
  members: ApiFamilyMember[];
  relationships: Array<{
    id: string;
    fromMemberId: string;
    toMemberId: string;
    type: "parent" | "spouse";
  }>;
}

export interface FamilyStats {
  totalMembers: number;
  todayBirthdays: number;
  upcomingBirthdays: number;
}
