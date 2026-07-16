import { useState } from "react";
import { useNavigate } from "react-router";
import { Bell, Cake, Clock, Users, GitBranch, Sparkles, LoaderCircle, ChevronRight, Heart } from "lucide-react";
import {
  familyMembers,
  getTodayBirthdays,
  getUpcomingBirthdays,
  calculateAge,
  getFamilyBranches,
  getDaysUntilBirthday,
} from "../data/familyData";
import MemberDetailModal from "../components/MemberDetailModal";
import { FamilyMember } from "../types/family";
import { useFamily } from "../context/FamilyContext";
import { generateBirthdayWish } from "../services/api";

// ─── palette copied from TreePage ─────────────────────────────────────
const FAMILY_PALETTE: Record<string, string> = {
  莫家: "#3b82f6", 彭家: "#16a34a", 唐家: "#f97316", 周家: "#9333ea",
  田家: "#0d9488", 曾家: "#ca8a04", 何家: "#dc2626", 肖家: "#4f46e5",
  任家: "#db2777", 谢家: "#d97706",
};
const fc = (fam: string) => FAMILY_PALETTE[fam] ?? "#a8866c";
const memberColor = (member: FamilyMember) => member.gender === "male" ? "#4f7fbf" : member.gender === "female" ? "#d47586" : "#8b817d";

// ─── date helpers ──────────────────────────────────────────────────────
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
function formatDate(d: Date) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日  周${WEEKDAYS[d.getDay()]}`;
}

// ─── stat card ────────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  accent,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: string;
  bg: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: bg }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: `${accent}22` }}
      >
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl leading-none" style={{ fontWeight: 800, color: accent }}>
        {value}
      </p>
    </div>
  );
}

// ─── nav shortcut card ────────────────────────────────────────────────
function NavCard({
  icon,
  label,
  desc,
  gradient,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  gradient: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl p-5 text-left flex flex-col gap-2 transition-transform hover:-translate-y-0.5 active:scale-95"
      style={{ background: gradient }}
    >
      <div className="w-10 h-10 bg-white/30 rounded-xl flex items-center justify-center text-white">
        {icon}
      </div>
      <p className="text-sm text-white/90 font-bold leading-tight">{label}</p>
      <p className="text-xs text-white/65">{desc}</p>
    </button>
  );
}

// ─── birthday celebration card ────────────────────────────────────────
function BirthdayCard({
  member,
  onGenerate,
  generating,
  onView,
}: {
  member: FamilyMember;
  onGenerate: () => void;
  generating: boolean;
  onView: () => void;
}) {
  const age = calculateAge(member.birthYear);
  const color = memberColor(member);
  return (
    <div
      className="rounded-2xl overflow-hidden shadow-lg"
      style={{
        background: `linear-gradient(135deg, ${color}18, ${color}08)`,
        border: `1.5px solid ${color}35`,
      }}
    >
      {/* top stripe */}
      <div
        className="h-1.5 w-full"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }}
      />
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div
            className="text-4xl w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}18` }}
          >
            🎂
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xl font-bold" style={{ color: "#2d1f1a" }}>
                {member.name}
              </span>
              {member.nickName && (
                <span className="text-xs text-gray-400">「{member.nickName}」</span>
              )}
              <span
                className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: `${color}20`, color }}
              >
                {member.relation}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {member.familyName} · {age ? `${age} 岁` : ""}
              {" · "}
              {member.birthdayType === "lunar" ? "农历" : "阳历"}
              {member.birthMonth}月{member.birthDay}日
            </p>
          </div>
          <div className="text-3xl select-none">🎉</div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={onView}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: `${color}18`,
              color,
              border: `1.5px solid ${color}40`,
            }}
          >
            <Users size={14} /> 查看详情
          </button>
          <button
            onClick={onGenerate}
            disabled={generating}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
          >
            {generating ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {generating ? "生成中" : "生成生日祝福"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── upcoming item ────────────────────────────────────────────────────
function UpcomingItem({
  member,
  onClick,
}: {
  member: FamilyMember;
  onClick: () => void;
}) {
  const days = getDaysUntilBirthday(member);
  const color = memberColor(member);
  const urgent = days !== null && days <= 7;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100 hover:shadow-md transition-shadow text-left"
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0"
        style={{ background: `${color}18` }}
      >
        {member.gender === "male" ? "👨" : "👩"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#2d1f1a] truncate">
          {member.name}
          {member.nickName && (
            <span className="text-gray-400 text-xs font-normal ml-1">
              {member.nickName}
            </span>
          )}
        </p>
        <p className="text-xs text-gray-400">
          {member.relation} ·{" "}
          {member.birthdayType === "lunar" ? "农历" : "阳历"}
          {member.birthMonth}月{member.birthDay}日
        </p>
      </div>
      <div
        className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold"
        style={{
          background: urgent ? "#fef3c7" : `${color}18`,
          color: urgent ? "#d97706" : color,
        }}
      >
        {days === null ? "未录生日" : days === 0 ? "🎂 今天" : `${days} 天后`}
      </div>
    </button>
  );
}

// ─── main component ────────────────────────────────────────────────────
export default function HomePage() {
  const { snapshot } = useFamily();
  const navigate = useNavigate();
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const todayBirthdays = getTodayBirthdays();
  const upcomingBirthdays = getUpcomingBirthdays(30);
  const familyBranches = getFamilyBranches();
  const today = new Date();

  const handleGenerateWish = async (member: FamilyMember) => {
    if (!snapshot || getDaysUntilBirthday(member) !== 0 || generatingId) return;
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

  return (
    <div className="min-h-screen bg-[#f7f3ef]">

      {/* ── Hero Banner ─────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #3d2f2a 0%, #6b4c3b 45%, #a8866c 100%)",
        }}
      >
        {/* SVG texture overlay */}
        <svg
          className="absolute inset-0 w-full h-full opacity-10"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Decorative circles */}
        <div
          className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10"
          style={{ background: "#d4756a" }}
        />
        <div
          className="absolute bottom-0 left-1/4 w-32 h-32 rounded-full opacity-10"
          style={{ background: "#d4a76a" }}
        />

        <div className="relative max-w-5xl mx-auto px-4 md:px-8 pt-8 pb-10">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-white/50 text-xs mb-1">{formatDate(today)}</p>
              <h1 className="text-4xl font-black text-white tracking-tight leading-tight">
                {snapshot?.family.name}<br />
                <span style={{ color: "#e8c4a8" }}>家族图谱</span>
              </h1>
              <p className="text-white/55 text-sm mt-2">记录每一位家人，传承每一段故事</p>
            </div>

            <button
              className="relative mt-1"
              onClick={() => navigate("/birthday")}
            >
              <div className="w-11 h-11 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
                <Bell className="w-5 h-5 text-white" />
              </div>
              {(todayBirthdays.length + upcomingBirthdays.filter(m => (getDaysUntilBirthday(m) ?? Infinity) <= 7).length) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#d4756a] text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow">
                  {todayBirthdays.length + upcomingBirthdays.filter(m => (getDaysUntilBirthday(m) ?? Infinity) <= 7).length}
                </span>
              )}
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "成员", value: familyMembers.length, emoji: "👥" },
              { label: "代际", value: Math.max(0, ...familyMembers.map(member => member.generation)), emoji: "🌳" },
              { label: "今日", value: todayBirthdays.length, emoji: "🎂" },
              { label: "近30天", value: upcomingBirthdays.length, emoji: "📅" },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white/12 backdrop-blur-sm rounded-2xl p-3 flex flex-col items-center border border-white/15"
              >
                <span className="text-xl leading-none mb-1">{s.emoji}</span>
                <p className="text-white font-black text-xl leading-none">{s.value}</p>
                <p className="text-white/50 text-[10px] mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Current family pill */}
          <div className="flex flex-wrap gap-1.5 mt-4">
            {familyBranches.map((b) => (
              <span
                key={b}
                className="px-2.5 py-1 rounded-full text-xs font-medium"
                style={{
                  background: `${fc(b)}30`,
                  color: "#fff",
                  border: `1px solid ${fc(b)}55`,
                }}
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── main content ─────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-6">

        {/* Today's birthdays */}
        {todayBirthdays.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🎉</span>
              <h2 className="font-bold text-[#2d1f1a]">今日生日</h2>
            </div>
            <div className="space-y-3">
              {todayBirthdays.map((m) => (
                <BirthdayCard
                  key={m.id}
                  member={m}
                  onGenerate={() => void handleGenerateWish(m)}
                  generating={generatingId === m.id}
                  onView={() => setSelectedMember(m)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Quick Nav */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🧭</span>
            <h2 className="font-bold text-[#2d1f1a]">快速入口</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NavCard
              icon={<GitBranch size={20} />}
              label="家族图谱"
              desc="可视化关系树"
              gradient="linear-gradient(135deg,#a8866c,#d4a76a)"
              onClick={() => navigate("/tree")}
            />
            <NavCard
              icon={<Cake size={20} />}
              label="生日提醒"
              desc="不错过每个生日"
              gradient="linear-gradient(135deg,#d4756a,#e8957a)"
              onClick={() => navigate("/birthday")}
            />
            <NavCard
              icon={<Clock size={20} />}
              label="家族时间轴"
              desc="重要时刻记录"
              gradient="linear-gradient(135deg,#6b9d8a,#89b8a8)"
              onClick={() => navigate("/timeline")}
            />
            <NavCard
              icon={<Users size={20} />}
              label="查亲戚关系"
              desc="找出关系链路"
              gradient="linear-gradient(135deg,#7c6bc9,#9d8fe8)"
              onClick={() => navigate("/profile")}
            />
          </div>
        </section>

        {/* AI Assistant */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">✨</span>
            <h2 className="font-bold text-[#2d1f1a]">AI 生日助手</h2>
          </div>
          <div
            className="rounded-2xl p-5 border"
            style={{
              background: "linear-gradient(135deg,#f0fdf4,#f7fef9)",
              borderColor: "#bbf7d0",
            }}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#16a34a]/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-[#16a34a]" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-[#14532d] mb-1">生日祝福文案生成</p>
                <p className="text-sm text-gray-500 mb-3">
                  根据年龄、关系自动生成微信群风格的生日祝福，支持 emoji 和表情包。
                </p>

                {todayBirthdays.length > 0 ? (
                  <div className="bg-white rounded-xl p-3 text-xs text-gray-600 font-mono mb-3 border border-green-100 max-h-36 overflow-auto">
                    <pre className="whitespace-pre-wrap">{`姓名：${todayBirthdays[0].name}  称呼：${todayBirthdays[0].relation}
性别：${todayBirthdays[0].gender === "male" ? "男" : "女"}  年龄：${calculateAge(todayBirthdays[0].birthYear) ?? "未知"}岁
请生成温馨微信群生日祝福，带 emoji，适合家族群 🎂`}</pre>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl p-3 text-xs text-gray-400 mb-3 border border-green-100">
                    今日暂无生日，生日当天才会显示祝福生成按钮。
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => navigate("/birthday")}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-green-200 rounded-xl text-sm font-medium text-[#16a34a] hover:bg-green-50 transition-colors whitespace-nowrap"
                  >
                    全部生日 <ChevronRight size={14} />
                  </button>
                  {todayBirthdays.length > 0 && (
                    <button
                      onClick={() => void handleGenerateWish(todayBirthdays[0])}
                      disabled={generatingId !== null}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#16a34a] text-white rounded-xl text-sm font-medium hover:bg-[#15803d] transition-colors whitespace-nowrap"
                    >
                      {generatingId === todayBirthdays[0].id ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {generatingId === todayBirthdays[0].id ? "生成中" : "生成生日祝福"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming Birthdays */}
        {upcomingBirthdays.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📅</span>
                <h2 className="font-bold text-[#2d1f1a]">即将过生日</h2>
                <span className="px-2 py-0.5 bg-[#d4a76a]/15 text-[#a8866c] text-xs font-semibold rounded-full">
                  30 天内
                </span>
              </div>
              {upcomingBirthdays.length > 6 && (
                <button
                  onClick={() => navigate("/birthday")}
                  className="flex items-center gap-1 text-sm text-[#6b9d8a] font-medium"
                >
                  全部 <ChevronRight size={15} />
                </button>
              )}
            </div>
            <div className="space-y-2">
              {upcomingBirthdays.slice(0, 6).map((m) => (
                <UpcomingItem key={m.id} member={m} onClick={() => setSelectedMember(m)} />
              ))}
            </div>
          </section>
        )}

        {/* Family completeness visual grid */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🏠</span>
            <h2 className="font-bold text-[#2d1f1a]">家庭资料</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "已录生日", count: familyMembers.filter(member => member.birthdayType).length, color: "#d4756a" },
              { label: "已建关系", count: familyMembers.filter(member => member.parentIds.length || member.spouseId).length, color: "#6b9d8a" },
              { label: "当前用户", count: snapshot?.family.linkedMemberId ? 1 : 0, color: "#a8866c" },
            ].map(({ label, count, color }) => {
              return (
                <button
                  key={label}
                  onClick={() => navigate(label === "当前用户" ? "/profile" : "/tree")}
                  className="rounded-2xl p-3 flex flex-col items-center gap-1.5 border transition-all hover:shadow-md active:scale-95"
                  style={{
                    background: `${color}0e`,
                    borderColor: `${color}30`,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}25` }}
                  >
                    <Heart size={14} style={{ color }} />
                  </div>
                  <p className="text-xs font-bold" style={{ color }}>
                    {label}
                  </p>
                  <p className="text-[10px] text-gray-400">{count} 人</p>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {actionMessage && <div className="fixed left-1/2 bottom-20 md:bottom-6 -translate-x-1/2 z-40 rounded-full bg-[#2d1f1a] px-4 py-2 text-sm text-white shadow-xl">{actionMessage}</div>}

      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}
