import { useEffect, useState } from "react";
import {
  AlertCircle, Cake, Check, ChevronRight, GitBranch, Heart, Link2, LogOut, Pencil, Plus, Save, Search,
  ShieldCheck, Trash2, UserRoundCheck, Users, X,
} from "lucide-react";
import { familyMembers, calculateAge, getDaysUntilBirthday } from "../data/familyData";
import { FamilyMember } from "../types/family";
import MemberDetailModal from "../components/MemberDetailModal";
import { useFamily } from "../context/FamilyContext";
import type { MemberInput } from "../services/api";

const memberColor = (member: FamilyMember) => member.gender === "male" ? "#4f7fbf" : member.gender === "female" ? "#d47586" : "#8b817d";

// ─── BFS relation finder ──────────────────────────────────────────────
function findRelationPath(fromId: string, toId: string): FamilyMember[] | null {
  if (fromId === toId) return [];
  const getNeighbors = (id: string): string[] => {
    const m = familyMembers.find((m) => m.id === id);
    if (!m) return [];
    const n: string[] = [];
    n.push(...m.parentIds);
    if (m.spouseId) n.push(m.spouseId);
    familyMembers.filter((c) => c.parentIds.includes(id)).forEach((c) => n.push(c.id));
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
    if (from.parentIds.includes(to.id)) return `${to.name} 是 ${from.name} 的父/母`;
    if (to.parentIds.includes(from.id)) return `${to.name} 是 ${from.name} 的子/女`;
  }
  if (path.length === 3) {
    const mid = path[1];
    if (from.parentIds.includes(mid.id) && mid.spouseId === to.id) return `${to.name} 是 ${from.name} 的父/母`;
    if (mid.parentIds.includes(from.id) && to.parentIds.includes(from.id)) return `${to.name} 是 ${from.name} 的兄弟/姐妹`;
    if (mid.parentIds.includes(from.id) && to.spouseId === mid.id) return `${to.name} 是 ${from.name} 的儿媳/女婿`;
    if (from.parentIds.includes(mid.id) && to.parentIds.includes(mid.id)) return `${to.name} 是 ${from.name} 的兄弟/姐妹`;
  }
  return `从 ${from.name} 到 ${to.name} 相差 ${path.length - 1} 步关系`;
}

const GEN_LABELS = ["一", "二", "三", "四", "五"];

const emptyMemberForm = (): MemberInput => ({
  name: "",
  nickName: "",
  relation: "",
  birthYear: null,
  gender: "unknown",
  birthdayType: null,
  birthMonth: null,
  birthDay: null,
  isLeapMonth: false,
  parentIds: [],
  spouseId: null,
});

export function MemberManagePanel() {
  const { snapshot, saveFamilyMember, deleteFamilyMember, setLinkedMember } = useFamily();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MemberInput>(emptyMemberForm);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = snapshot?.family.role === "owner";
  const canAdd = Boolean(snapshot);
  const linkedMemberId = snapshot?.family.linkedMemberId ?? null;

  useEffect(() => {
    if (!canAdd) {
      setEditingId(null);
      setForm(emptyMemberForm());
      setFormOpen(false);
    }
  }, [canAdd]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyMemberForm());
    setFormOpen(true);
    setMessage("");
  };

  const startEdit = (member: FamilyMember) => {
    if (!isOwner && linkedMemberId !== member.id) return;
    setEditingId(member.id);
    setForm({
      name: member.name,
      nickName: member.nickName ?? "",
      relation: "",
      birthYear: member.birthYear,
      gender: member.gender,
      birthdayType: member.birthdayType,
      birthMonth: member.birthMonth,
      birthDay: member.birthDay,
      isLeapMonth: member.isLeapMonth ?? false,
      parentIds: member.parentIds,
      spouseId: member.spouseId,
    });
    setFormOpen(true);
    setMessage("");
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyMemberForm());
    setFormOpen(false);
  };

  const setField = <K extends keyof MemberInput>(field: K, value: MemberInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const setBirthdayType = (value: MemberInput["birthdayType"]) => {
    setForm((current) => ({
      ...current,
      birthdayType: value,
      birthMonth: value ? current.birthMonth : null,
      birthDay: value ? current.birthDay : null,
      isLeapMonth: value === "lunar" ? current.isLeapMonth : false,
    }));
  };

  const submit = async () => {
    const name = form.name.trim();
    const nickName = form.nickName?.trim() || null;
    if (!name) {
      setMessage("姓名不能为空");
      return;
    }
    const parentIds = form.parentIds ?? [];
    if (parentIds.length !== new Set(parentIds).size) {
      setMessage("父亲和母亲不能是同一人");
      return;
    }
    if (form.spouseId && parentIds.includes(form.spouseId)) {
      setMessage("配偶不能同时设为父母");
      return;
    }
    if (form.birthdayType && (!form.birthMonth || !form.birthDay)) {
      setMessage("请补全生日的月份和日期");
      return;
    }
    if (!form.birthdayType && (form.birthMonth || form.birthDay)) {
      setMessage("请先选择生日类型");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await saveFamilyMember({
        ...form,
        name,
        nickName,
        relation: "",
        parentIds,
        spouseId: form.spouseId || null,
        isLeapMonth: form.birthdayType === "lunar" ? Boolean(form.isLeapMonth) : false,
      }, editingId ?? undefined);
      resetForm();
      setMessage("已保存成员资料");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (member: FamilyMember) => {
    if (!window.confirm(`删除 ${member.name}？相关亲缘关系也会一并删除。`)) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteFamilyMember(member.id);
      if (editingId === member.id) resetForm();
      setMessage("已删除成员");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const linkMember = async (memberId: string) => {
    setBusy(true);
    setMessage("");
    try {
      await setLinkedMember(linkedMemberId === memberId ? null : memberId);
      setMessage(linkedMemberId === memberId ? "已取消本人关联" : "已更新本人关联");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "关联失败");
    } finally {
      setBusy(false);
    }
  };

  const relationOptions = familyMembers.filter((member) => member.id !== editingId);
  const memberById = new Map(familyMembers.map((member) => [member.id, member]));
  const parentOne = form.parentIds?.[0] ?? "";
  const parentTwo = form.parentIds?.[1] ?? "";
  const setParent = (index: 0 | 1, id: string) => {
    const next = [...(form.parentIds ?? [])];
    next[index] = id;
    setField("parentIds", next.filter(Boolean));
  };
  const membersWithMeta = familyMembers
    .map((member) => ({
      member,
      parents: member.parentIds.map((id) => memberById.get(id)).filter((item): item is FamilyMember => Boolean(item)),
      spouse: member.spouseId ? memberById.get(member.spouseId) ?? null : null,
      hasBirthday: Boolean(member.birthdayType && member.birthMonth !== null && member.birthDay !== null),
      isLinked: linkedMemberId === member.id,
    }))
    .sort((a, b) => Number(b.isLinked) - Number(a.isLinked) || a.member.name.localeCompare(b.member.name, "zh-Hans-CN"));
  const filteredMembers = membersWithMeta.filter(({ member, parents, spouse }) => {
    const text = [member.name, member.nickName, member.relation, ...parents.map((parent) => parent.name), spouse?.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });
  const birthdayCount = familyMembers.filter((member) => member.birthdayType && member.birthMonth !== null && member.birthDay !== null).length;
  const relationCount = familyMembers.filter((member) => member.parentIds.length > 0 || member.spouseId).length;
  const editingName = editingId ? familyMembers.find((member) => member.id === editingId)?.name : null;
  const inputClass = "w-full rounded-2xl bg-[#f7f3ef] border border-[#eadfd8] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#6b9d8a]/20";
  const labelClass = "text-xs font-bold text-gray-400 mb-1.5 block";

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2"><Users size={18} className="text-[#6b9d8a]" /><h2 className="font-black text-[#2d1f1a]">成员管理</h2></div>
        {canAdd && (
          <button onClick={openCreate} className="rounded-xl bg-[#d4756a] text-white px-3 py-2 text-xs font-bold flex items-center gap-1">
            <Plus size={14} />新增
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: "成员", value: familyMembers.length, icon: Users, color: "#3b82f6" },
          { label: "生日", value: birthdayCount, icon: Cake, color: "#d4756a" },
          { label: "关系", value: relationCount, icon: Link2, color: "#6b9d8a" },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-2xl border border-gray-100 px-3 py-3">
            <item.icon size={16} style={{ color: item.color }} />
            <p className="mt-2 text-xl font-black" style={{ color: item.color }}>{item.value}</p>
            <p className="text-xs text-gray-400">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-3 mb-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、称呼或关系" className="w-full rounded-2xl bg-[#f7f3ef] border border-[#eadfd8] pl-9 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#6b9d8a]/20" />
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {filteredMembers.map(({ member, parents, spouse, hasBirthday, isLinked }) => (
          <div key={member.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg bg-[#f7f3ef]">{member.gender === "male" ? "👨" : member.gender === "female" ? "👩" : "👤"}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-bold text-sm text-[#2d1f1a] truncate">{member.name}</p>
                {isLinked && <span className="px-2 py-0.5 rounded-full bg-[#6b9d8a]/10 text-[#3b7d6a] text-[10px] font-bold flex-shrink-0">我</span>}
              </div>
              <p className="text-xs text-gray-400 truncate">
                {member.relation || "未设置称呼"} · {hasBirthday ? `${member.birthdayType === "lunar" ? "农历" : "阳历"}${member.birthMonth}月${member.birthDay}日` : "生日未录"}
              </p>
              {(parents.length > 0 || spouse) && (
                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                  {parents.length > 0 ? `父母：${parents.map((parent) => parent.name).join("、")}` : ""}
                  {parents.length > 0 && spouse ? " · " : ""}
                  {spouse ? `配偶：${spouse.name}` : ""}
                </p>
              )}
            </div>
            <button onClick={() => void linkMember(member.id)} disabled={busy} className={`rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1 disabled:opacity-50 ${isLinked ? "bg-[#6b9d8a] text-white" : "bg-[#f7f3ef] text-[#8a6b5d]"}`}>
              {isLinked ? <Check size={13} /> : <UserRoundCheck size={13} />}{isLinked ? "本人" : "关联"}
            </button>
            {(isOwner || isLinked) && (
              <button onClick={() => startEdit(member)} className="rounded-xl bg-[#f7f3ef] p-2 text-[#6b7d88]" title="编辑"><Pencil size={15} /></button>
            )}
            {isOwner && (
              <>
                <button onClick={() => void remove(member)} className="rounded-xl bg-[#fff1f1] p-2 text-[#b91c1c]" title="删除"><Trash2 size={15} /></button>
              </>
            )}
          </div>
        ))}
        {filteredMembers.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">没有找到匹配的成员</p>}
      </div>
      {message && (
        <div className="mt-3 rounded-2xl bg-white border border-[#eadfd8] px-4 py-3 text-xs text-[#8a5f5a] flex items-center gap-2">
          <AlertCircle size={14} className="flex-shrink-0" />{message}
        </div>
      )}
      {!isOwner && (
        <p className="mt-2 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
          <ShieldCheck size={13} />你可以新增成员，并编辑已关联为“我”的资料
        </p>
      )}
      {canAdd && formOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/45 px-0 md:px-4 animate-in fade-in">
          <div className="w-full md:max-w-3xl bg-white rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[88vh] overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <div>
                <p className="font-bold text-[#2d1f1a]">{editingId ? `编辑 ${editingName ?? "成员"}` : "新增成员"}</p>
                <p className="text-xs text-gray-400 mt-0.5">姓名必填，其他资料可稍后补充</p>
              </div>
              <button onClick={resetForm} className="rounded-xl bg-[#f7f3ef] p-2 text-gray-500" title="关闭"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(88vh-132px)]">
              <div>
                <div className="flex items-center gap-2 mb-3"><UserRoundCheck size={16} className="text-[#6b9d8a]" /><p className="text-sm font-black text-[#2d1f1a]">基础资料</p></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className={labelClass}>姓名</label><input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="例如：莫小满" className={inputClass} /></div>
                  <div><label className={labelClass}>昵称</label><input value={form.nickName ?? ""} onChange={(event) => setField("nickName", event.target.value)} placeholder="可选" className={inputClass} /></div>
                  <div><label className={labelClass}>性别</label><select value={form.gender} onChange={(event) => setField("gender", event.target.value as MemberInput["gender"])} className={inputClass}>
                    <option value="unknown">未设置</option>
                    <option value="male">男</option>
                    <option value="female">女</option>
                  </select></div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3"><Cake size={16} className="text-[#d4756a]" /><p className="text-sm font-black text-[#2d1f1a]">生日</p></div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div><label className={labelClass}>出生年份</label><input value={form.birthYear ?? ""} onChange={(event) => setField("birthYear", event.target.value ? Number(event.target.value) : null)} placeholder="可选" type="number" className={inputClass} /></div>
                  <div><label className={labelClass}>生日类型</label><select value={form.birthdayType ?? ""} onChange={(event) => setBirthdayType(event.target.value ? event.target.value as MemberInput["birthdayType"] : null)} className={inputClass}>
                    <option value="">未记录</option>
                    <option value="solar">阳历</option>
                    <option value="lunar">农历</option>
                  </select></div>
                  <div><label className={labelClass}>月份</label><input value={form.birthMonth ?? ""} onChange={(event) => setField("birthMonth", event.target.value ? Number(event.target.value) : null)} placeholder="1-12" type="number" min={1} max={12} disabled={!form.birthdayType} className={`${inputClass} disabled:opacity-50`} /></div>
                  <div><label className={labelClass}>日期</label><input value={form.birthDay ?? ""} onChange={(event) => setField("birthDay", event.target.value ? Number(event.target.value) : null)} placeholder="1-31" type="number" min={1} max={31} disabled={!form.birthdayType} className={`${inputClass} disabled:opacity-50`} /></div>
                </div>
                {form.birthdayType === "lunar" && (
                  <label className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-[#f7f3ef] border border-[#eadfd8] px-4 py-3 text-sm text-[#2d1f1a]">
                    <input type="checkbox" checked={Boolean(form.isLeapMonth)} onChange={(event) => setField("isLeapMonth", event.target.checked)} />
                    闰月生日
                  </label>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3"><GitBranch size={16} className="text-[#a8866c]" /><p className="text-sm font-black text-[#2d1f1a]">亲缘关系</p></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><label className={labelClass}>父母 1</label><select value={parentOne} onChange={(event) => setParent(0, event.target.value)} className={inputClass}>
                    <option value="">未设置</option>
                    {relationOptions.map((member) => <option key={member.id} value={member.id}>{member.name}（{member.relation || "成员"}）</option>)}
                  </select></div>
                  <div><label className={labelClass}>父母 2</label><select value={parentTwo} onChange={(event) => setParent(1, event.target.value)} className={inputClass}>
                    <option value="">未设置</option>
                    {relationOptions.map((member) => <option key={member.id} value={member.id}>{member.name}（{member.relation || "成员"}）</option>)}
                  </select></div>
                  <div><label className={labelClass}>配偶</label><select value={form.spouseId ?? ""} onChange={(event) => setField("spouseId", event.target.value || null)} className={inputClass}>
                    <option value="">未设置</option>
                    {relationOptions.map((member) => <option key={member.id} value={member.id}>{member.name}（{member.relation || "成员"}）</option>)}
                  </select></div>
                </div>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-2 p-4 border-t border-gray-100 bg-white">
              <button onClick={() => void submit()} disabled={busy} className="flex-1 rounded-2xl bg-[#3b7d6a] text-white py-3 text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"><Save size={16} />保存成员</button>
              <button onClick={resetForm} disabled={busy} className="rounded-2xl bg-[#f7f3ef] text-[#8a6b5d] px-5 py-3 text-sm font-bold disabled:opacity-50">取消</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── main page ────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { snapshot, families, switchFamily, signOut } = useFamily();
  const [memberA, setMemberA] = useState<string>("");
  const [memberB, setMemberB] = useState<string>("");
  const [relationResult, setRelationResult] = useState<string>("");
  const [relationPath, setRelationPath] = useState<FamilyMember[]>([]);
  const [detailMember, setDetailMember] = useState<FamilyMember | null>(null);

  const me = familyMembers.find(m => m.id === snapshot?.family.linkedMemberId) ?? null;
  const myColor = me?.gender === "female" ? "#d47586" : me?.gender === "male" ? "#4f7fbf" : "#a8866c";
  const daysLeft = me ? getDaysUntilBirthday(me) : null;

  const spouse = me?.spouseId ? familyMembers.find(m => m.id === me.spouseId) ?? null : null;
  const parents = me ? me.parentIds.map(id => familyMembers.find(m => m.id === id)).filter((member): member is FamilyMember => Boolean(member)) : [];
  const siblings = me ? familyMembers.filter(m => m.id !== me.id && m.parentIds.some(id => me.parentIds.includes(id))) : [];
  const children = me ? familyMembers.filter(m => m.parentIds.includes(me.id) || Boolean(me.spouseId && m.parentIds.includes(me.spouseId))) : [];
  const birthdayRecorded = familyMembers.filter(m => m.birthdayType && m.birthMonth !== null && m.birthDay !== null).length;
  const relationshipRecorded = familyMembers.filter(m => m.parentIds.length > 0 || m.spouseId).length;

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
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-5xl flex-shrink-0 shadow-xl" style={{ background: `${myColor}35`, border: `3px solid ${myColor}80` }}>{me?.gender === "female" ? "👩" : me?.gender === "male" ? "👨" : "👤"}</div>
            <div className="flex-1 min-w-0">
              <p className="text-white/50 text-xs mb-0.5">家族图谱 · 当前用户</p>
              <h1 className="text-3xl font-black text-white leading-tight">{me?.name ?? "尚未关联成员"}</h1>
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
              <p className="text-white font-bold text-sm">{!me ? "请在小程序家庭管理中将成员设为我" : daysLeft === null ? "还没有记录你的生日" : daysLeft === 0 ? "🎉 今天是你的生日！" : `距离下次生日还有 ${daysLeft} 天`}</p>
              {me?.birthdayType && <p className="text-white/50 text-xs">{me.birthdayType === "lunar" ? "农历" : "阳历"}{me.birthMonth}月{me.birthDay}日</p>}
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
                    const c = memberColor(m);
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
                      const c = memberColor(m);
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
              { label: "已录生日", value: birthdayRecorded, emoji: "🎂", color: "#16a34a" },
              { label: "已建关系", value: relationshipRecorded, emoji: "🌳", color: "#f97316" },
              { label: "家庭角色", value: snapshot?.family.role === "owner" ? "所有者" : snapshot?.family.role === "admin" ? "管理员" : snapshot?.family.role === "editor" ? "可编辑" : "只读", emoji: "⭐", color: myColor },
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
          <div className="flex items-center gap-2 mb-3"><span className="text-lg">🏠</span><h2 className="font-black text-[#2d1f1a]">当前家庭</h2></div>
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#a8866c]/10"><GitBranch size={18} className="text-[#a8866c]" /></div>
              <div className="flex-1"><p className="font-bold text-[#2d1f1a]">{snapshot?.family.name}</p><p className="text-xs text-gray-400">{snapshot?.family.description || `${familyMembers.length} 位家庭成员`}</p></div>
              {families.length > 1 && <select value={snapshot?.family.id} onChange={(event) => void switchFamily(event.target.value)} className="rounded-xl bg-[#f7f3ef] border border-[#eadfd8] px-3 py-2 text-sm">{families.map(family => <option key={family.id} value={family.id}>{family.name}</option>)}</select>}
            </div>
            <button onClick={() => void signOut()} className="mt-4 w-full rounded-2xl border border-[#eadfd8] py-3 text-sm font-bold text-gray-500 flex items-center justify-center gap-2"><LogOut size={16} />退出网页版</button>
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
