import { useMemo, useState } from "react";
import { Calendar, LoaderCircle, Search, Sparkles, X } from "lucide-react";
import {
  familyMembers,
  getDaysUntilBirthday,
  getTodayBirthdays,
  getUpcomingBirthdays,
} from "../data/familyData";
import type { FamilyMember } from "../types/family";
import MemberDetailModal from "../components/MemberDetailModal";
import { useFamily } from "../context/FamilyContext";
import { generateBirthdayWish } from "../services/api";
import { MemberManagePanel } from "./ProfilePage";

const memberColor = (member: FamilyMember) =>
  member.gender === "male" ? "#4f7fbf" : member.gender === "female" ? "#d47586" : "#8b817d";

export default function BirthdayPage() {
  const { snapshot } = useFamily();
  const [selected, setSelected] = useState<FamilyMember | null>(null);
  const [filter, setFilter] = useState<"all" | "lunar" | "solar">("all");
  const [search, setSearch] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const snapshotMembers = snapshot?.members;
  const todayBirthdays = useMemo(() => getTodayBirthdays(), [snapshotMembers]);
  const upcomingBirthdays = useMemo(() => getUpcomingBirthdays(30), [snapshotMembers]);
  const todayIds = useMemo(() => new Set(todayBirthdays.map((m) => m.id)), [todayBirthdays]);
  const upcomingIds = useMemo<Map<string, number>>(
    () => new Map(upcomingBirthdays.flatMap((member) => {
      const days = getDaysUntilBirthday(member);
      return days === null ? [] : [[member.id, days] as const];
    })),
    [upcomingBirthdays],
  );

  const searchedMembers = useMemo(() => {
    const sourceMembers = familyMembers.filter((member) => {
      const hasBirthday = Boolean(member.birthdayType && member.birthMonth !== null && member.birthDay !== null);
      return hasBirthday && (filter === "all" || member.birthdayType === filter);
    });
    const keyword = search.trim().toLowerCase();
    if (!keyword) return sourceMembers;
    return sourceMembers.filter((member) => {
      const text = [member.name, member.nickName, member.relation, member.familyName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(keyword);
    });
  }, [filter, search, snapshotMembers]);

  const handleGenerate = async (member: FamilyMember) => {
    if (!snapshot || !todayIds.has(member.id) || generatingId) return;
    setGeneratingId(member.id);
    setActionMessage("");
    try {
      const wish = await generateBirthdayWish(snapshot.family.id, member.id);
      await navigator.clipboard.writeText(wish);
      setActionMessage(`已生成并复制 ${member.name} 的生日祝福`);
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "生日祝福生成失败");
    } finally {
      setGeneratingId(null);
      window.setTimeout(() => setActionMessage(""), 2500);
    }
  };

  const renderBirthdayBadge = (member: FamilyMember) => {
    const daysLeft = upcomingIds.get(member.id);
    if (todayIds.has(member.id)) {
      return <span className="hidden md:inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-500">今天</span>;
    }
    if (daysLeft === undefined) return null;
    const urgent = daysLeft <= 7;
    return (
      <span
        className="hidden md:inline-flex px-2.5 py-1 rounded-full text-xs font-bold"
        style={{ background: urgent ? "#fef3c7" : "#f3f4f6", color: urgent ? "#d97706" : "#6b7280" }}
      >
        {daysLeft}天后
      </span>
    );
  };

  const renderBirthdayAction = (member: FamilyMember) => {
    if (!todayIds.has(member.id)) return null;
    return (
      <button
        onClick={() => void handleGenerate(member)}
        disabled={generatingId !== null}
        className="rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-50 flex items-center gap-1"
        style={{ background: `linear-gradient(135deg, ${memberColor(member)}, ${memberColor(member)}cc)` }}
      >
        {generatingId === member.id ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}
        <span className="hidden sm:inline">{generatingId === member.id ? "生成中" : "祝福"}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#f7f3ef]">
      <div className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 md:px-8 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-black text-[#2d1f1a]">🎂 生日提醒</h1>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="px-2.5 py-1 bg-red-50 text-red-500 font-bold rounded-full">今日 {todayBirthdays.length}</span>
              <span className="px-2.5 py-1 bg-amber-50 text-amber-500 font-bold rounded-full">近30天 {upcomingBirthdays.length}</span>
            </div>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索姓名、称呼、家族…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#d4756a]/30"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2" title="清空搜索">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Calendar className="w-4 h-4 text-gray-400 self-center flex-shrink-0" />
            {(["all", "lunar", "solar"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                style={{ background: filter === type ? "#d4756a" : "#f3f4f6", color: filter === type ? "#fff" : "#6b7280" }}
              >
                {type === "all" ? "全部" : type === "lunar" ? "🌙 农历" : "☀️ 阳历"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#2d1f1a] text-white text-sm px-5 py-2.5 rounded-full shadow-xl">
          {actionMessage}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-5">
        <MemberManagePanel
          title="全年生日一览"
          subtitle={`${searchedMembers.length} 位已记录生日的成员，可直接维护资料和本人关联`}
          members={searchedMembers}
          showStats={false}
          showSearch={false}
          groupByBirthdayMonth
          emptyText="没有找到匹配的生日成员"
          rowBadge={renderBirthdayBadge}
          rowExtraAction={renderBirthdayAction}
          onMemberSelect={setSelected}
        />
      </div>

      {selected && <MemberDetailModal member={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
