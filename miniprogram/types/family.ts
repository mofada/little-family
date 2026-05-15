export interface FamilyMember {
  id: string;
  parentId: string | null;
  spouseId: string | null;
  familyName: string;
  generation: number;
  name: string;
  nickName?: string;
  relation: string;
  birthYear: number | null;
  gender: "male" | "female";
  birthdayType: "solar" | "lunar";
  birthMonth: number;
  birthDay: number;
}

export interface FamilyStats {
  totalMembers: number;
  familyBranches: string[];
  todayBirthdays: number;
  upcomingBirthdays: number;
}
