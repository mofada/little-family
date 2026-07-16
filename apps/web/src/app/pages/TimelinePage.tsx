import { useState, useMemo } from "react";
import { familyMembers } from "../data/familyData";
import { FamilyMember } from "../types/family";
import MemberDetailModal from "../components/MemberDetailModal";
import { useFamily } from "../context/FamilyContext";

// ─── palette ──────────────────────────────────────────────────────────
const fc = (member: FamilyMember) => member.gender === "male" ? "#4f7fbf" : member.gender === "female" ? "#d47586" : "#8b817d";

// decade color bands cycling through warm palette
const DECADE_COLORS = [
  { bg: "#fdf4ff", accent: "#9333ea", stripe: "#e9d5ff" },
  { bg: "#fff7ed", accent: "#ea580c", stripe: "#fed7aa" },
  { bg: "#f0fdf4", accent: "#16a34a", stripe: "#bbf7d0" },
  { bg: "#eff6ff", accent: "#2563eb", stripe: "#bfdbfe" },
  { bg: "#fef9c3", accent: "#ca8a04", stripe: "#fde68a" },
  { bg: "#fdf2f8", accent: "#db2777", stripe: "#fbcfe8" },
  { bg: "#f0fdfa", accent: "#0d9488", stripe: "#99f6e4" },
];

interface TimelineEvent {
  year: number;
  member: FamilyMember;
}

export default function TimelinePage() {
  const { snapshot } = useFamily();
  const [selected, setSelected] = useState<FamilyMember | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const events = useMemo<TimelineEvent[]>(
    () =>
      familyMembers
        .filter((m) => m.birthYear)
        .map((m) => ({ year: m.birthYear!, member: m }))
        .sort((a, b) => a.year - b.year),
    []
  );

  const byDecade = useMemo(() => {
    const map: Record<number, TimelineEvent[]> = {};
    for (const e of events) {
      const d = Math.floor(e.year / 10) * 10;
      if (!map[d]) map[d] = [];
      map[d].push(e);
    }
    return map;
  }, [events]);

  const decades = useMemo(
    () => Object.keys(byDecade).map(Number).sort((a, b) => a - b),
    [byDecade]
  );

  const minYear = events[0]?.year ?? 1930;
  const maxYear = events[events.length - 1]?.year ?? 2026;
  const span = maxYear - minYear;

  return (
    <div className="min-h-screen bg-[#f7f3ef]">
      {/* ── Hero header ─────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1e1408 0%, #4a3020 50%, #7a5535 100%)",
        }}
      >
        {/* subtle dot grid */}
        <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
        {/* glowing orb */}
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full opacity-15" style={{ background: "#d4a76a" }} />

        <div className="relative max-w-5xl mx-auto px-4 md:px-8 py-8">
          <p className="text-white/40 text-xs mb-1 font-mono">FAMILY CHRONICLE</p>
          <h1 className="text-4xl font-black text-white leading-tight mb-1">
            家族<span style={{ color: "#e8c49a" }}>时间轴</span>
          </h1>
          <p className="text-white/50 text-sm mb-6">记录每一位家人来到这世界的时刻</p>

          {/* stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "记录事件", value: events.length, emoji: "📌" },
              { label: "跨越年份", value: span, emoji: "⏳" },
              { label: "历经年代", value: decades.length, emoji: "🗓" },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 flex flex-col items-center border border-white/15"
              >
                <span className="text-xl mb-1">{s.emoji}</span>
                <p className="text-white font-black text-2xl leading-none">{s.value}</p>
                <p className="text-white/45 text-[11px] mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* mini progress bar showing time span */}
          <div className="mt-5">
            <div className="flex justify-between text-white/35 text-[10px] font-mono mb-1">
              <span>{minYear}</span>
              <span>{maxYear}</span>
            </div>
            <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
              {events.map((e) => {
                const pct = ((e.year - minYear) / (span || 1)) * 100;
                const c = fc(e.member);
                return (
                  <div
                    key={e.member.id}
                    className="absolute top-0 w-1.5 h-full rounded-full"
                    style={{ left: `${pct}%`, background: c, opacity: 0.7 }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── timeline body ────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        <div className="relative">
          {/* vertical spine */}
          <div
            className="absolute left-5 top-0 bottom-0 w-0.5 rounded-full"
            style={{ background: "linear-gradient(to bottom, #d4a76a, #6b9d8a, #a8866c)" }}
          />

          <div className="space-y-10">
            {decades.map((decade, di) => {
              const theme = DECADE_COLORS[di % DECADE_COLORS.length];
              const evts = byDecade[decade];

              return (
                <div key={decade}>
                  {/* decade node */}
                  <div className="flex items-center gap-4 mb-5">
                    <div
                      className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg"
                      style={{
                        background: theme.accent,
                        boxShadow: `0 0 0 4px ${theme.stripe}, 0 4px 12px ${theme.accent}55`,
                      }}
                    >
                      <span className="text-white text-xs font-black leading-none">
                        {String(decade).slice(2)}s
                      </span>
                    </div>
                    <div
                      className="flex-1 flex items-center gap-3 px-4 py-2 rounded-2xl"
                      style={{ background: theme.bg }}
                    >
                      <span className="font-black text-sm" style={{ color: theme.accent }}>
                        {decade} 年代
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: `${theme.accent}20`, color: theme.accent }}
                      >
                        {evts.length} 人出生
                      </span>
                    </div>
                  </div>

                  {/* event cards */}
                  <div className="ml-14 space-y-3">
                    {evts.map((ev) => {
                      const c = fc(ev.member);
                      const isMe = ev.member.id === snapshot?.family.linkedMemberId;
                      const isHovered = hoveredId === ev.member.id;

                      return (
                        <div key={ev.member.id} className="relative flex items-start gap-0">
                          {/* connector dot + line */}
                          <div className="absolute -left-9 top-5 flex items-center">
                            <div
                              className="w-3 h-3 rounded-full border-2 border-white shadow flex-shrink-0"
                              style={{ background: c }}
                            />
                            <div
                              className="w-6 h-px"
                              style={{ background: `${c}60` }}
                            />
                          </div>

                          <button
                            onClick={() => setSelected(ev.member)}
                            onMouseEnter={() => setHoveredId(ev.member.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            className="w-full text-left rounded-2xl overflow-hidden transition-all"
                            style={{
                              border: isMe
                                ? `2px solid #d4756a`
                                : isHovered
                                ? `2px solid ${c}`
                                : "2px solid transparent",
                              boxShadow: isHovered
                                ? `0 6px 24px ${c}30`
                                : "0 2px 8px rgba(0,0,0,.06)",
                              transform: isHovered ? "translateY(-1px)" : "none",
                            }}
                          >
                            {/* left accent stripe */}
                            <div className="flex">
                              <div className="w-1 flex-shrink-0" style={{ background: c }} />

                              <div className="flex-1 bg-white px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  {/* year badge */}
                                  <div
                                    className="flex-shrink-0 w-14 text-center py-2 rounded-xl"
                                    style={{ background: `${c}12` }}
                                  >
                                    <p className="text-[10px] font-bold" style={{ color: c }}>
                                      出生
                                    </p>
                                    <p className="text-lg font-black leading-tight" style={{ color: c }}>
                                      {String(ev.year).slice(2)}
                                    </p>
                                    <p className="text-[9px] text-gray-400">{ev.year}</p>
                                  </div>

                                  {/* info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                      <span className="font-black text-[#2d1f1a]">
                                        {ev.member.name}
                                      </span>
                                      {ev.member.nickName && (
                                        <span className="text-gray-400 text-xs">
                                          「{ev.member.nickName}」
                                        </span>
                                      )}
                                      {isMe && (
                                        <span className="px-1.5 py-0.5 bg-[#d4756a] text-white text-[9px] font-bold rounded-full">
                                          我
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs text-gray-500">
                                        {ev.member.relation}
                                      </span>
                                      <span
                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                        style={{ background: `${c}18`, color: c }}
                                      >
                                        {ev.member.familyName}
                                      </span>
                                      <span className="text-xs text-gray-400">
                                        {ev.member.gender === "male" ? "男" : "女"}
                                      </span>
                                    </div>
                                  </div>

                                  {/* avatar */}
                                  <div
                                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                                    style={{ background: `${c}15` }}
                                  >
                                    {ev.member.gender === "male" ? "👨" : "👩"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* bottom cap */}
          <div className="flex items-center gap-3 mt-10 ml-0">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-lg shadow"
              style={{ background: "linear-gradient(135deg, #d4a76a, #a8866c)" }}
            >
              🌱
            </div>
            <p className="text-sm text-gray-400 italic">故事还在继续…</p>
          </div>
        </div>
      </div>

      {/* ── family legend ─────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 pb-8">
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">成员记录</p>
          <div className="flex flex-wrap gap-3">
            {[["男性", "male", "#4f7fbf"], ["女性", "female", "#d47586"], ["未设置", "unknown", "#8b817d"]]
              .map(([label, gender, color]) => {
                const cnt = familyMembers.filter((m) => m.gender === gender && m.birthYear).length;
                return (
                  <div key={gender} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                    <span className="text-xs text-gray-600">{label}</span>
                    <span className="text-[10px] text-gray-400">{cnt}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {selected && (
        <MemberDetailModal member={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
