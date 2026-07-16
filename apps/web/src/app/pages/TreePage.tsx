import { useState, useMemo } from "react";
import { Filter, Search, X, Cake } from "lucide-react";
import {
  familyMembers,
  calculateAge,
  getTodayBirthdays,
  getFamilyBranches,
} from "../data/familyData";
import { FamilyMember } from "../types/family";
import MemberDetailModal from "../components/MemberDetailModal";

// ─── Layout constants ──────────────────────────────────────────────────
const CW = 88;    // card width
const CH = 110;   // card height
const CG = 12;    // gap between couple cards
const UG = 36;    // gap between sibling units
const GH = 160;   // vertical stride per generation
const PL = 50;    // left padding (space for gen label)
const PT = 20;    // top padding

// ─── Family color palette ──────────────────────────────────────────────
const PALETTE: Record<string, string> = {
  莫家: "#3b82f6",
  彭家: "#16a34a",
  唐家: "#f97316",
  周家: "#9333ea",
  田家: "#0d9488",
  曾家: "#ca8a04",
  何家: "#dc2626",
  肖家: "#4f46e5",
  任家: "#db2777",
  谢家: "#d97706",
};
const getColor = (familyName: string) => PALETTE[familyName] ?? "#a8866c";

// ─── Unit type (primary member + optional spouse) ──────────────────────
interface Unit {
  id: string;
  primary: FamilyMember;
  spouse: FamilyMember | null;
  gen: number;
  x: number;
  y: number;
  unitW: number;
  cx: number; // horizontal center of the whole unit
}

// ─── Layout builder ────────────────────────────────────────────────────
function buildLayout(members: FamilyMember[]) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const used = new Set<string>();
  const units: Unit[] = [];
  const uOf = new Map<string, Unit>(); // memberId → its Unit

  // Build units (couples or singles), sorted by generation so spouses found correctly
  for (const m of [...members].sort((a, b) => a.generation - b.generation)) {
    if (used.has(m.id)) continue;
    used.add(m.id);

    const sp = m.spouseId ? (byId.get(m.spouseId) ?? null) : null;
    let primary = m,
      spouse = sp;

    if (sp) {
      used.add(sp.id);
      // Ensure primary is the one with a parentId (the "tree" member)
      if (!m.parentId && sp.parentId) {
        primary = sp;
        spouse = m;
      }
    }

    const unitW = spouse ? CW * 2 + CG : CW;
    const u: Unit = {
      id: primary.id,
      primary,
      spouse,
      gen: primary.generation,
      x: 0,
      y: 0,
      unitW,
      cx: 0,
    };
    units.push(u);
    uOf.set(primary.id, u);
    if (spouse) uOf.set(spouse.id, u);
  }

  const parentOf = (u: Unit): Unit | null =>
    u.primary.parentId ? (uOf.get(u.primary.parentId) ?? null) : null;

  // Group by generation
  const genMap = new Map<number, Unit[]>();
  for (const u of units) {
    if (!genMap.has(u.gen)) genMap.set(u.gen, []);
    genMap.get(u.gen)!.push(u);
  }

  const maxGen = Math.max(...units.map((u) => u.gen));

  // Position each generation row
  for (let gen = 1; gen <= maxGen; gen++) {
    const row = (genMap.get(gen) ?? []).slice();
    row.forEach((u) => {
      u.y = (gen - 1) * GH + PT;
    });
    // Sort siblings together by parent center
    row.sort(
      (a, b) =>
        (parentOf(a)?.cx ?? Infinity) - (parentOf(b)?.cx ?? Infinity)
    );

    let nextX = PL;
    let i = 0;
    while (i < row.length) {
      const pu = parentOf(row[i]);
      // Collect contiguous siblings sharing same parent
      const sibs: Unit[] = [];
      let j = i;
      while (j < row.length && parentOf(row[j]) === pu) {
        sibs.push(row[j]);
        j++;
      }
      const groupW =
        sibs.reduce((s, u) => s + u.unitW, 0) + UG * (sibs.length - 1);
      const idealCX = pu ? pu.cx : nextX + groupW / 2;
      let x = Math.max(nextX, idealCX - groupW / 2);
      for (const u of sibs) {
        u.x = x;
        u.cx = x + u.unitW / 2;
        x += u.unitW + UG;
      }
      nextX = x;
      i = j;
    }
  }

  // Build bezier connection data [x1,y1, x2,y2]
  const conns: Array<[number, number, number, number]> = [];
  for (const u of units) {
    const pu = parentOf(u);
    if (pu) conns.push([pu.cx, pu.y + CH, u.cx, u.y]);
  }

  const canvasW = Math.max(500, ...units.map((u) => u.x + u.unitW)) + 40;
  const canvasH = maxGen * GH + PT * 2;

  return { units, conns, canvasW, canvasH, genMap, maxGen };
}

// ─── Individual member card ────────────────────────────────────────────
function MCard({
  m,
  x,
  y,
  isBday,
  dim,
  glow,
  onSelect,
}: {
  m: FamilyMember;
  x: number;
  y: number;
  isBday: boolean;
  dim: boolean;
  glow: boolean;
  onSelect: (m: FamilyMember) => void;
}) {
  const c = getColor(m.familyName);
  const isMe = m.name === "莫发达";
  const age = calculateAge(m.birthYear);
  const ageText = age === null ? "-岁" : `${age}岁`;

  const borderColor = isMe ? "#d4756a" : glow ? "#facc15" : c;
  const boxShadow = glow
    ? `0 0 0 3px rgba(250,204,21,.55), 0 5px 16px rgba(0,0,0,.15)`
    : isBday
    ? `0 0 0 3px rgba(251,191,36,.35), 0 3px 12px rgba(0,0,0,.1)`
    : `0 2px 8px rgba(0,0,0,.08)`;

  return (
    <div style={{ position: "absolute", left: x, top: y, width: CW, minHeight: CH }}>
      <button
        onClick={() => onSelect(m)}
        style={{
          width: "100%",
          minHeight: CH,
          borderRadius: 14,
          border: `2.5px solid ${borderColor}`,
          boxShadow,
          opacity: dim ? 0.15 : 1,
          background: `linear-gradient(145deg, ${c}18, #ffffff)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          padding: "8px 5px",
          cursor: "pointer",
          position: "relative",
          transition: "transform 0.15s, opacity 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform =
            "translateY(-3px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform =
            "translateY(0)";
        }}
      >
        {isBday && (
          <div
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              background: "#fbbf24",
              borderRadius: "50%",
              padding: 4,
              display: "flex",
              boxShadow: "0 1px 4px rgba(0,0,0,.2)",
            }}
          >
            <Cake size={9} color="white" />
          </div>
        )}
        {isMe && (
          <div
            style={{
              position: "absolute",
              top: -6,
              left: -6,
              background: "#d4756a",
              borderRadius: "50%",
              width: 14,
              height: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 8,
              color: "#fff",
            }}
          >
            我
          </div>
        )}
        {/* Avatar emoji */}
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: `${c}20`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 17,
          }}
        >
          {m.gender === "male" ? "👨" : "👩"}
        </div>
        {/* Name */}
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#1a0f0c",
            lineHeight: 1.2,
            textAlign: "center",
            maxWidth: CW - 10,
            wordBreak: "break-all",
            margin: 0,
          }}
        >
          {m.name}
        </p>
        {/*{m.nickName && (*/}
        {/*  <p style={{ fontSize: 9, color: "#9b7b74", lineHeight: 1, margin: 0 }}>*/}
        {/*    &ldquo;{m.nickName}&rdquo;*/}
        {/*  </p>*/}
        {/*)}*/}
        {/* Relation label */}
        <p
          style={{
            fontSize: 10,
            color: "#6b5751",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {m.relation}
        </p>
        {/* Age */}
        <p style={{ fontSize: 9, color: "#a08070", margin: 0 }}>{ageText}</p>
        {/* Family tag */}
        <div
          style={{
            background: `${c}1a`,
            color: c,
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 8px",
            borderRadius: 100,
          }}
        >
          {m.familyName}
        </div>
      </button>
    </div>
  );
}

// ─── Main page component ───────────────────────────────────────────────
const GEN_LABELS = ["一", "二", "三", "四", "五", "六"];

export default function TreePage() {
  const [selected, setSelected] = useState<FamilyMember | null>(null);
  const [filter, setFilter] = useState("全部");
  const [search, setSearch] = useState("");

  const todayIds = useMemo(
    () => new Set(getTodayBirthdays().map((m) => m.id)),
    []
  );
  const branches = useMemo(() => ["全部", ...getFamilyBranches()], []);

  const filtered = useMemo(() => {
    if (filter === "全部") return familyMembers;
    const pri = familyMembers.filter((m) => m.familyName === filter);
    const spIds = new Set(pri.flatMap((m) => (m.spouseId ? [m.spouseId] : [])));
    const sp = familyMembers.filter(
      (m) => spIds.has(m.id) && !pri.includes(m)
    );
    return [...pri, ...sp];
  }, [filter]);

  const layout = useMemo(() => buildLayout(filtered), [filtered]);

  const hits = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return new Set(
      familyMembers
        .filter(
          (m) =>
            m.name.includes(q) ||
            m.relation.includes(q) ||
            (m.nickName ?? "").toLowerCase().includes(q)
        )
        .map((m) => m.id)
    );
  }, [search]);

  const { units, conns, canvasW, canvasH, genMap } = layout;

  return (
    <div
      className="flex flex-col"
      style={{ height: "100dvh", overflow: "hidden" }}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="bg-white shadow-sm z-30 flex-shrink-0">
        <div className="px-4 md:px-8 py-3">
          <h1
            className="text-lg mb-2"
            style={{ fontWeight: 700, color: "#3d2f2a" }}
          >
            家族关系图谱
          </h1>

          {/* Search bar */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索成员姓名、昵称、关系…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#d4756a]/30"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>

          {/* Family filter chips */}
          <div
            className="flex items-center gap-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
            <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            {branches.map((b) => (
              <button
                key={b}
                onClick={() => setFilter(b)}
                className="px-3 py-1 rounded-full text-xs whitespace-nowrap transition-all"
                style={{
                  background:
                    filter === b ? (PALETTE[b] ?? "#d4756a") : "#f3f4f6",
                  color: filter === b ? "#fff" : "#374151",
                  fontWeight: filter === b ? 700 : 400,
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Search status bar */}
        {hits !== null && (
          <div
            className="px-4 py-1.5 text-xs border-t border-gray-100"
            style={{
              color: hits.size > 0 ? "#ca8a04" : "#6b7280",
              background: hits.size > 0 ? "#fefce8" : "#f9fafb",
            }}
          >
            {hits.size > 0
              ? `找到 ${hits.size} 位成员，已高亮显示`
              : "未找到匹配成员"}
          </div>
        )}
      </div>

      {/* ── Canvas (scrollable) ───────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-gradient-to-b from-[#faf8f5] to-[#f0ebe4]">
        <div
          style={{
            position: "relative",
            width: canvasW,
            height: canvasH,
            minWidth: "100%",
          }}
        >
          {/* Generation labels (left side, vertical text) */}
          {Array.from(genMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([gen, row]) => {
              const rowY = row[0]?.y ?? (gen - 1) * GH + PT;
              return (
                <div
                  key={gen}
                  style={{
                    position: "absolute",
                    left: 6,
                    top: rowY,
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      writingMode: "vertical-lr",
                      background: "linear-gradient(180deg,#a8866c,#d4a76a)",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "6px 3px",
                      borderRadius: 8,
                      boxShadow: "0 1px 4px rgba(0,0,0,.12)",
                      height: CH,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      letterSpacing: 1,
                    }}
                  >
                    第{GEN_LABELS[gen - 1] ?? gen}代
                  </div>
                </div>
              );
            })}

          {/* SVG bezier connections */}
          <svg
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              overflow: "visible",
            }}
            width={canvasW}
            height={canvasH}
          >
            <defs>
              <marker
                id="dot"
                viewBox="0 0 6 6"
                refX="3"
                refY="3"
                markerWidth="5"
                markerHeight="5"
              >
                <circle cx="3" cy="3" r="2" fill="#c9a882" opacity="0.7" />
              </marker>
            </defs>
            {conns.map(([x1, y1, x2, y2], i) => {
              const my = (y1 + y2) / 2;
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
                  fill="none"
                  stroke="#c9a882"
                  strokeWidth={1.8}
                  opacity={0.5}
                  markerEnd="url(#dot)"
                />
              );
            })}
          </svg>

          {/* Member cards */}
          {units.map((u) => (
            <div key={u.id}>
              <MCard
                m={u.primary}
                x={u.x}
                y={u.y}
                isBday={todayIds.has(u.primary.id)}
                dim={hits !== null && !hits.has(u.primary.id)}
                glow={hits?.has(u.primary.id) ?? false}
                onSelect={setSelected}
              />
              {u.spouse && (
                <>
                  <MCard
                    m={u.spouse}
                    x={u.x + CW + CG}
                    y={u.y}
                    isBday={todayIds.has(u.spouse.id)}
                    dim={hits !== null && !hits.has(u.spouse.id)}
                    glow={hits?.has(u.spouse.id) ?? false}
                    onSelect={setSelected}
                  />
                  {/* Heart connector between spouses */}
                  <div
                    style={{
                      position: "absolute",
                      left: u.x + CW,
                      top: u.y + CH / 2 - 9,
                      width: CG,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      pointerEvents: "none",
                    }}
                  >
                    ❤️
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Legend bar ────────────────────────────────────────────── */}
      <div className="bg-white/90 border-t border-gray-100 px-4 md:px-8 py-2 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-xs font-semibold text-gray-400">家族色谱</span>
          {Object.entries(PALETTE)
            .filter(([fam]) => familyMembers.some((m) => m.familyName === fam))
            .map(([fam, c]) => (
              <div key={fam} className="flex items-center gap-1">
                <div
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: c,
                  }}
                />
                <span className="text-xs text-gray-600">{fam}</span>
              </div>
            ))}
          <div className="border-l border-gray-200 pl-3 flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Cake size={10} color="#fbbf24" />
              <span className="text-xs text-gray-500">今日生日</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                style={{
                  display: "inline-block",
                  width: 9,
                  height: 9,
                  borderRadius: 3,
                  border: "2px solid #d4756a",
                }}
              />
              <span className="text-xs text-gray-500">我自己</span>
            </div>
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 10 }}>❤️</span>
              <span className="text-xs text-gray-500">配偶</span>
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <MemberDetailModal member={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
