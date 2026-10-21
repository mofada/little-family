export interface FamilyMember {
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
  isClaimed: boolean;
}

export interface FamilyStats {
  totalMembers: number;
  todayBirthdays: number;
  upcomingBirthdays: number;
}
