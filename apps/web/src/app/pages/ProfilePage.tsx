import { useState, useMemo } from "react";
import { ChevronRight, Heart, Users, GitBranch, Search } from "lucide-react";
import { familyMembers, calculateAge, getDaysUntilBirthday } from "../data/familyData";
import { FamilyMember } from "../types/family";
import MemberDetailModal from "../components/MemberDetailModal";

// ─── palette ──────────────────────────────────────────────────────────
const FAMILY_PALETTE: Record<string, string> = {
  莫家: "#3b82f6", 彭家: "#16a34a", 唐家: "#f97316", 周家: "#9333ea",
  田家: "#0d9488", 曾家: "#ca8a04", 何家: "#dc2626", 肖家: "#4f46e5",
  任家: "#db2777", 谢家: "#d97706",
};
const fc = (fam: string) => FAMILY_PALETTE[fam] ?? "#a8866c";

// ─── BFS relation finder ──────────────────────────────────────────────
function findRelationPath(fromId: string, toId: string): FamilyMember[] | null {
  if (fromId === toId) return [];
  const getNeighbors = (id: string): string[] => {
    const m = familyMembers.find((m) => m.id === id);
    if (!m) return [];
    const n: string[] = [];
    if (m.parentId) n.push(m.parentId);
    if (m.spouseId) n.push(m.spouseId);
    familyMembers.filter((c) => c.parentId === id).forEach((c) => n.push(c.id));
    return n;
  };
  const visited = new Set<string>([fromId]);
  const queue: { id: string; path: string[] }[] = [{ id: fromId, path: [fromId] }];
  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    for (const nid of getNeighbors(id)) {
      if (visited.has(nid)) continue;
      visited.add(nid);
      const np = [...path, nid];
      if (nid === toId) return np.map((pid) => familyMembers.find((m) => m.id === pid)!);
      queue.push({ id: nid, path: np });
    }
  }
  return null;
}

function describeRelation(path: FamilyMember[]): string {
  if (path.length < 2) return "同一个人";
  const from = path[0];
  const to = path[path.length - 1];
  if (path.length === 2) {
    if (from.spouseId === to.id) return `${to.name} 是 ${from.name} 的配偶`;
    if (from.parentId === to.id) return `${to.name} 是 ${from.name} 的父/母`;
    if (to.parentId === from.id) return `${to.name} 是 ${from.name} 的子/女`;
  }
  if (path.length === 3) {
    const mid = path[1];
    if (from.parentId === mid.id && mid.spouseId === to.id) return `${to.name} 是 ${from.name} 的父/母`;
    if (mid.parentId === from.id && to.parentId === from.id) return `${to.name} 是 ${from.name} 的兄弟/姐妹`;
    if (mid.parentId === from.id && to.spouseId === mid.id) return `${to.name} 是 ${from.name} 的儿媳/女婿`;
    if (from.parentId === mid.id && to.parentId === mid.id) return `${to.name} 是 ${from.name} 的兄弟/姐妹`;
  }
  return `从 ${from.name} 到 ${to.name} 相差 ${path.length - 1} 步关系`;
}

const GEN_LABELS = ["一", "二", "三", "四", "五"];

// ─── main page ────────────────────────────────────────────────────────
export default function ProfilePage() {
  const [memberA, setMemberA] = useState<string>("");
  const [memberB, setMemberB] = useState<string>("");
  const [relationResult, setRelationResult] = useState<string>("");
  const [relationPath, setRelationPath] = useState<FamilyMember[]>([]);
  const [detailMember, setDetailMember] = useState<FamilyMember | null>(null);

  const me = useMemo(() => familyMembers.find(m => m.name === "莫发达"), []);
  const myColor = fc(me?.familyName ?? "莫家");
  const daysLeft = me ? getDaysUntilBirthday(me) : 0;

  const spouse = useMemo(() => me?.spouseId ? familyMembers.find(m => m.id === me.spouseId) : null, [me]);
  const parents = useMemo(() => familyMembers.filter(m => m.id === me?.parentId || (me?.parentId && m.spouseId === me.parentId && m.parentId === null)), [me]);
  const siblings = useMemo(() => familyMembers.filter(m => m.parentId === me?.parentId && m.id !== me?.id && me?.parentId !== null), [me]);
  const children = useMemo(() => familyMembers.filter(m => m.parentId === me?.id || m.parentId === me?.spouseId), [me]);
  const familyBranches = useMemo(() => [...new Set(familyMembers.map(m => m.familyName))].filter(Boolean), []);

  const findRelation = () => {
    if (!memberA || !memberB) return;
    if (memberA === memberB) { setRelationResult("同一个人"); setRelationPath([]); return; }
    const path = findRelationPath(memberA, memberB);
    if (!path) { setRelationResult("未找到关系路径"); setRelationPath([]); }
    else { setRelationResult(describeRelation(path)); setRelationPath(path); }
  };

  return (
    <div className="min-h-screen bg-[#f7f3ef]">
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, #1a0f0c 0%, ${myColor}99 60%, ${myColor} 100%)` }}>
        <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
          <defs><pattern id="pdots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1" fill="white" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#pdots)" />
        </svg>
        <div className="absolute -bottom-10 -right-10 w-48 h-48 rounded-full opacity-15" style={{ background: myColor }} />
        <div className="relative max-w-5xl mx-auto px-4 md:px-8 pt-8 pb-8">
          <div className="flex items-center gap-5 mb-5">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-5xl flex-shrink-0 shadow-xl" style={{ background: `${myColor}35`, border: `3px solid ${myColor}80` }}>👨</div>
            <div className="flex-1 min-w-0">
              <p className="text-white/50 text-xs mb-0.5">家族图谱 · 当前用户</p>
              <h1 className="text-3xl font-black text-white leading-tight">{me?.name ?? "用户"}</h1>
              <div className="flex flex-wrap gap-2 mt-2">
                {[me?.relation, me?.familyName, me?.generation ? `第${GEN_LABELS[me.generation - 1] ?? me.generation}代` : null, me?.birthYear ? `${calculateAge(me.birthYear)}岁` : null]
                  .filter(Boolean).map((tag, i) => (
                    <span key={i} className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: "rgba(255,255,255,0.18)", color: "#fff" }}>{tag}</span>
                  ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
            <span className="text-2xl">{daysLeft === 0 ? "🎂" : "🎈"}</span>
            <div>
              <p className="text-white font-bold text-sm">{daysLeft === 0 ? "🎉 今天是你的生日！" : `距离下次生日还有 ${daysLeft} 天`}</p>
              <p className="text-white/50 text-xs">农历{me?.birthMonth}月{me?.birthDay}日</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-5">
        <section>
          <div className="flex items-center gap-2 mb-3"><span className="text-lg">🏠</span><h2 className="font-black text-[#2d1f1a]">直系家人</h2></div>
          {[{ label: "父母", members: parents, emoji: "👴👵" }, { label: "配偶", members: spouse ? [spouse] : [], emoji: "💑" }, { label: "兄弟姐妹", members: siblings, emoji: "👫" }, { label: "子女", members: children, emoji: "👶" }]
            .filter(g => g.members.length > 0).map((g) => (
              <div key={g.label} className="mb-3">
                <p className="text-xs font-bold text-gray-400 mb-2">{g.emoji} {g.label}（{g.members.length}人）</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {g.members.map((m) => {
                    const c = fc(m.familyName);
                    return (
                      <button key={m.id} onClick={() => setDetailMember(m)} className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 border border-gray-100 hover:shadow-md transition-shadow text-left group">
                        <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl flex-shrink-0" style={{ background: `${c}18` }}>{m.gender === "male" ? "👨" : "👩"}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-[#2d1f1a]">{m.name}</span>
                            {m.nickName && <span className="text-xs text-gray-400">「{m.nickName}」</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">{m.relation}</span>
                            {m.birthYear && <span className="text-xs text-gray-400">{calculateAge(m.birthYear)}岁</span>}
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: `${c}18`, color: c }}>{m.familyName}</span>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3"><span className="text-lg">🔍</span><h2 className="font-black text-[#2d1f1a]">关系查询</h2></div>
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-bold text-gray-400 mb-1.5 block">成员 A</label>
                <div className="relative">
                  <select value={memberA} onChange={(e) => setMemberA(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/30">
                    <option value="">请选择…</option>
                    {familyMembers.map(m => <option key={m.id} value={m.id}>{m.name}（{m.relation}）</option>)}
                  </select>
                  <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-400 mb-1.5 block">成员 B</label>
                <div className="relative">
                  <select value={memberB} onChange={(e) => setMemberB(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/30">
                    <option value="">请选择…</option>
                    {familyMembers.map(m => <option key={m.id} value={m.id}>{m.name}（{m.relation}）</option>)}
                  </select>
                  <ChevronRight size={14} className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
            <button onClick={findRelation} disabled={!memberA || !memberB} className="w-full py-3 rounded-2xl text-white font-bold text-sm transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg, #6b9d8a, #3b7d6a)" }}>
              <Search size={15} className="inline mr-2" />查询关系链路
            </button>
            {relationResult && (
              <div className="mt-4 rounded-2xl p-4" style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0" }}>
                <div className="flex items-start gap-2 mb-2">
                  <Heart size={14} className="text-[#d4756a] mt-0.5 flex-shrink-0" />
                  <p className="text-sm font-semibold text-[#2d1f1a]">{relationResult}</p>
                </div>
                {relationPath.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1 mt-3">
                    {relationPath.map((m, i) => {
                      const c = fc(m.familyName);
                      return (
                        <span key={m.id} className="flex items-center gap-1">
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: `${c}18`, color: c, border: `1px solid ${c}40` }}>{m.name}</span>
                          {i < relationPath.length - 1 && <ChevronRight size={12} className="text-gray-400" />}
                        </span>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">共 {Math.max(0, relationPath.length - 1)} 步关系</p>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3"><span className="text-lg">📊</span><h2 className="font-black text-[#2d1f1a]">家族概览</h2></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "总成员", value: familyMembers.length, emoji: "👥", color: "#3b82f6" },
              { label: "家族分支", value: familyBranches.length, emoji: "🏠", color: "#16a34a" },
              { label: "代数", value: Math.max(...familyMembers.map(m => m.generation)), emoji: "🌳", color: "#f97316" },
              { label: "我的代", value: `第${GEN_LABELS[(me?.generation ?? 3) - 1]}代`, emoji: "⭐", color: myColor },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl p-4 flex flex-col items-center gap-1.5 border border-gray-100">
                <span className="text-2xl">{s.emoji}</span>
                <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3"><span className="text-lg">🏠</span><h2 className="font-black text-[#2d1f1a]">家族分支</h2></div>
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {familyBranches.map((b) => {
                const c = fc(b);
                const count = familyMembers.filter(m => m.familyName === b).length;
                const isMyFamily = b === me?.familyName;
                return (
                  <div key={b} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: isMyFamily ? `${c}18` : "#f9fafb", border: isMyFamily ? `1.5px solid ${c}50` : "1.5px solid transparent" }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${c}25` }}>
                      <GitBranch size={14} style={{ color: c }} />
                    </div>
                    <div className="min-w-0"><p className="text-sm font-bold" style={{ color: c }}>{b}</p><p className="text-xs text-gray-400">{count} 人</p></div>
                    {isMyFamily && <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: c, color: "#fff" }}>我</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl mb-2">🌳</p>
          <p className="font-black text-[#2d1f1a] mb-0.5">家族图谱</p>
          <p className="text-xs text-gray-400">v1.0.0 · 记录家人，珍藏温暖</p>
          <div className="flex items-center justify-center gap-1.5 mt-3">
            <Users size={11} className="text-gray-300" />
            <p className="text-[11px] text-gray-400">Made with ❤️ for family</p>
          </div>
        </div>
        <div className="h-2" />
      </div>

      {detailMember && <MemberDetailModal member={detailMember} onClose={() => setDetailMember(null)} />}
    </div>
  );
}
