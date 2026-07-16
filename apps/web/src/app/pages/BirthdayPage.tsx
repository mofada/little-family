import { useState, useMemo } from "react";
import { Calendar, Cake, LoaderCircle, Search, Sparkles, X } from "lucide-react";
import {
  familyMembers,
  getTodayBirthdays,
  getUpcomingBirthdays,
  calculateAge,
  getDaysUntilBirthday,
} from "../data/familyData";
import { FamilyMember } from "../types/family";
import MemberDetailModal from "../components/MemberDetailModal";
import { useFamily } from "../context/FamilyContext";
import { generateBirthdayWish } from "../services/api";
import { MemberManagePanel } from "./ProfilePage";

// ─── palette ──────────────────────────────────────────────────────────
const memberColor = (member: FamilyMember) => member.gender === "male" ? "#4f7fbf" : member.gender === "female" ? "#d47586" : "#8b817d";

const MONTH_NAMES = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];
const MONTH_BG = [
  "#fce7f3","#fee2e2","#ffedd5","#fef9c3","#d1fae5","#cffafe",
  "#e0f2fe","#ede9fe","#fce7f3","#fef3c7","#f0fdf4","#e0e7ff",
];
const MONTH_ACCENT = [
  "#db2777","#dc2626","#ea580c","#ca8a04","#059669","#0891b2",
  "#0284c7","#7c3aed","#db2777","#d97706","#16a34a","#4f46e5",
];

// ─── single member row ────────────────────────────────────────────────
function MemberRow({
  member,
  badge,
  onSelect,
  onGenerate,
  generating,
}: {
  member: FamilyMember;
  badge?: React.ReactNode;
  onSelect: () => void;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  const c = memberColor(member);
  return (
    <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 border border-gray-100 hover:shadow-md transition-shadow group">
      {/* avatar */}
      <button
        onClick={onSelect}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: `${c}18` }}
        >
          {member.gender === "male" ? "👨" : "👩"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-[#2d1f1a] text-sm">{member.name}</span>
            {member.nickName && (
              <span className="text-gray-400 text-xs">「{member.nickName}」</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-500">{member.relation}</span>
            {member.birthYear && (
              <span className="text-xs text-gray-400">{calculateAge(member.birthYear)}岁</span>
            )}
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: `${c}18`, color: c }}
            >
              {member.familyName}
            </span>
            <span className="text-xs text-gray-400">
              {member.birthdayType === "lunar" ? "农历" : "阳历"}
              {member.birthMonth}月{member.birthDay}日
            </span>
          </div>
        </div>
      </button>

      {/* right side */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {badge}
        {onGenerate && (
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${c}, ${c}cc)` }}
          >
            {generating ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {generating ? "生成中" : "生成祝福"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── month section ────────────────────────────────────────────────────
function MonthSection({
  month,
  members,
  todayIds,
  upcomingIds,
  onSelect,
  onGenerate,
  generatingId,
}: {
  month: number;
  members: FamilyMember[];
  todayIds: Set<string>;
  upcomingIds: Map<string, number>;
  onSelect: (m: FamilyMember) => void;
  onGenerate: (m: FamilyMember) => void;
  generatingId: string | null;
}) {
  const bg = MONTH_BG[(month - 1) % 12];
  const accent = MONTH_ACCENT[(month - 1) % 12];
  const sorted = [...members].sort((a, b) => (a.birthDay ?? 0) - (b.birthDay ?? 0));

  return (
    <div className="rounded-3xl overflow-hidden" style={{ background: bg }}>
      {/* month header */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-2xl flex items-center justify-center text-white text-sm font-black"
            style={{ background: accent }}
          >
            {month}
          </div>
          <div>
            <p className="font-black text-sm" style={{ color: accent }}>
              {MONTH_NAMES[month - 1]}
            </p>
            <p className="text-xs text-gray-400">{members.length} 位成员</p>
          </div>
        </div>
        <div className="flex gap-1">
          {sorted.slice(0, 4).map((m) => (
            <div
              key={m.id}
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
              style={{ background: `${memberColor(m)}25` }}
            >
              {m.gender === "male" ? "👦" : "👧"}
            </div>
          ))}
          {members.length > 4 && (
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] text-gray-500 font-bold">
              +{members.length - 4}
            </div>
          )}
        </div>
      </div>

      {/* member rows */}
      <div className="px-3 pb-3 space-y-2">
        {sorted.map((m) => {
          const isToday = todayIds.has(m.id);
          const daysLeft = upcomingIds.get(m.id);
          const urgent = daysLeft !== undefined && daysLeft <= 7;
          const badge = isToday ? (
            <span
              className="px-2.5 py-1 rounded-full text-xs font-bold"
              style={{ background: "#fef2f2", color: "#dc2626" }}
            >
              🎂 今天
            </span>
          ) : daysLeft !== undefined ? (
            <span
              className="px-2.5 py-1 rounded-full text-xs font-bold"
              style={{
                background: urgent ? "#fef3c7" : "#f3f4f6",
                color: urgent ? "#d97706" : "#6b7280",
              }}
            >
              {daysLeft}天后
            </span>
          ) : undefined;

          return (
            <MemberRow
              key={m.id}
              member={m}
              badge={badge}
              onSelect={() => onSelect(m)}
              onGenerate={isToday ? () => onGenerate(m) : undefined}
              generating={generatingId === m.id}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────

const GEN_LABELS = ["一", "二", "三", "四", "五", "六"];

export default function BirthdayPage() {
  const { snapshot } = useFamily();
  const [selected, setSelected] = useState<FamilyMember | null>(null);
  const [filter, setFilter] = useState<"all" | "lunar" | "solar">("all");
  const [search, setSearch] = useState("");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const todayBirthdays = useMemo(() => getTodayBirthdays(), []);
  const upcomingBirthdays = useMemo(() => getUpcomingBirthdays(30), []);

  const todayIds = useMemo(
    () => new Set(todayBirthdays.map((m) => m.id)),
    [todayBirthdays]
  );
  const upcomingIds = useMemo<Map<string, number>>(
    () => new Map(upcomingBirthdays.flatMap((m) => {
      const days = getDaysUntilBirthday(m);
      return days === null ? [] : [[m.id, days] as const];
    })),
    [upcomingBirthdays]
  );

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

  const sourceMembers = useMemo(
    () =>
      filter === "all" ? familyMembers : familyMembers.filter((m) => m.birthdayType === filter),
    [filter]
  );

  const searchedMembers = useMemo(() => {
    if (!search.trim()) return sourceMembers;
    const q = search.toLowerCase();
    return sourceMembers.filter(
      (m) =>
        m.name.includes(q) ||
        (m.nickName ?? "").toLowerCase().includes(q) ||
        m.relation.includes(q) ||
        m.familyName.includes(q)
    );
  }, [sourceMembers, search]);

  const membersByMonth = useMemo(() => {
    const map: Record<number, FamilyMember[]> = {};
    for (const m of searchedMembers) {
      if (m.birthMonth === null) continue;
      if (!map[m.birthMonth]) map[m.birthMonth] = [];
      map[m.birthMonth].push(m);
    }
    return map;
  }, [searchedMembers]);

  const currentMonth = new Date().getMonth() + 1;

  return (
    <div className="min-h-screen bg-[#f7f3ef]">
      <div className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 md:px-8 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-black text-[#2d1f1a]">🎂 生日提醒</h1>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="px-2.5 py-1 bg-red-50 text-red-500 font-bold rounded-full">
                今日 {todayBirthdays.length}
              </span>
              <span className="px-2.5 py-1 bg-amber-50 text-amber-500 font-bold rounded-full">
                近30天 {upcomingBirthdays.length}
              </span>
            </div>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索姓名、称呼、家族…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#d4756a]/30"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Calendar className="w-4 h-4 text-gray-400 self-center flex-shrink-0" />
            {(["all", "lunar", "solar"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                style={{ background: filter === t ? "#d4756a" : "#f3f4f6", color: filter === t ? "#fff" : "#6b7280" }}
              >
                {t === "all" ? "全部" : t === "lunar" ? "🌙 农历" : "☀️ 阳历"}
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

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-5 space-y-5">
        <MemberManagePanel />

        {todayBirthdays.length > 0 && !search && (
          <section>
            <div
              className="rounded-3xl overflow-hidden"
              style={{ background: "linear-gradient(135deg, #fde8e8 0%, #fff5f0 100%)", border: "1.5px solid #fca5a5" }}
            >
              <div className="px-5 py-4 flex items-center gap-3 border-b border-red-100">
                <div className="w-10 h-10 bg-red-100 rounded-2xl flex items-center justify-center text-xl">🎉</div>
                <div>
                  <p className="font-black text-[#dc2626]">今日寿星</p>
                  <p className="text-xs text-gray-400">
                    {new Date().getMonth() + 1}月{new Date().getDate()}日 · {todayBirthdays.length}位家人今天生日
                  </p>
                </div>
              </div>
              <div className="px-3 py-3 space-y-2">
                {todayBirthdays.map((m) => (
                  <div
                    key={m.id}
                    className="bg-white rounded-2xl px-4 py-4 flex items-center gap-4 hover:shadow-md transition-shadow group"
                    style={{ border: "1.5px solid #fecaca" }}
                  >
                    <button onClick={() => setSelected(m)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0" style={{ background: `${memberColor(m)}18` }}>
                        {m.gender === "male" ? "👨" : "👩"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg font-black text-[#2d1f1a]">{m.name}</span>
                          {m.nickName && <span className="text-gray-400 text-sm">「{m.nickName}」</span>}
                        </div>
                        <p className="text-sm text-gray-500">
                          {m.relation}{calculateAge(m.birthYear) ? ` · ${calculateAge(m.birthYear)}岁` : ""} ·{" "}
                          {m.birthdayType === "lunar" ? "农历" : "阳历"}{m.birthMonth}月{m.birthDay}日
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => void handleGenerate(m)}
                      disabled={generatingId !== null}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
                      style={{ background: `linear-gradient(135deg, ${memberColor(m)}, ${memberColor(m)}cc)`, color: "#fff" }}
                    >
                      {generatingId === m.id ? <LoaderCircle size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {generatingId === m.id ? "生成中" : "生成祝福"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {search ? (
          <section>
            <p className="text-sm text-gray-500 mb-3">
              找到 <span className="font-bold text-[#2d1f1a]">{searchedMembers.length}</span> 位成员
            </p>
            {searchedMembers.length > 0 ? (
              <div className="space-y-2">
                {searchedMembers
                  .sort((a, b) => (a.birthMonth ?? 0) - (b.birthMonth ?? 0) || (a.birthDay ?? 0) - (b.birthDay ?? 0))
                  .map((m) => {
                    const isToday = todayIds.has(m.id);
                    const daysLeft = upcomingIds.get(m.id);
                    const urgent = daysLeft !== undefined && daysLeft <= 7;
                    const badge = isToday ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-500">🎂 今天</span>
                    ) : daysLeft !== undefined ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: urgent ? "#fef3c7" : "#f3f4f6", color: urgent ? "#d97706" : "#6b7280" }}>
                        {daysLeft}天后
                      </span>
                    ) : undefined;
                    return (
                      <MemberRow
                        key={m.id}
                        member={m}
                        badge={badge}
                        onSelect={() => setSelected(m)}
                        onGenerate={isToday ? () => void handleGenerate(m) : undefined}
                        generating={generatingId === m.id}
                      />
                    );
                  })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-3">🔍</p>
                <p className="text-sm">未找到匹配成员</p>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-[#2d1f1a]">📅 全年生日一览</span>
              <span className="text-xs text-gray-400">{searchedMembers.length} 位成员</span>
            </div>
            {Object.keys(membersByMonth)
              .map(Number)
              .sort((a, b) => ((a - currentMonth + 12) % 12) - ((b - currentMonth + 12) % 12))
              .map((month) => (
                <MonthSection
                  key={month}
                  month={month}
                  members={membersByMonth[month]}
                  todayIds={todayIds}
                  upcomingIds={upcomingIds}
                  onSelect={setSelected}
                  onGenerate={(member) => void handleGenerate(member)}
                  generatingId={generatingId}
                />
              ))}
          </section>
        )}
      </div>

      {selected && (
        <MemberDetailModal member={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
