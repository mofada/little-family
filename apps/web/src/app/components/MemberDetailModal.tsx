import { useState } from "react";
import { X, Cake, Users, MapPin, Sparkles, GitBranch, LoaderCircle } from "lucide-react";
import { FamilyMember } from "../types/family";
import { familyMembers, calculateAge, getDaysUntilBirthday } from "../data/familyData";
import { useFamily } from "../context/FamilyContext";
import { generateBirthdayWish } from "../services/api";

interface MemberDetailModalProps {
  member: FamilyMember;
  onClose: () => void;
}

export default function MemberDetailModal({ member, onClose }: MemberDetailModalProps) {
  const { snapshot } = useFamily();
  const [generating, setGenerating] = useState(false);
  const [wish, setWish] = useState("");
  const [actionError, setActionError] = useState("");
  const parents = member.parentIds
    .map((parentId) => familyMembers.find(m => m.id === parentId))
    .filter((parent): parent is FamilyMember => Boolean(parent));

  const spouse = familyMembers.find(m => m.id === member.spouseId);
  const children = familyMembers.filter(m =>
    m.parentIds.includes(member.id) || (member.spouseId !== null && m.parentIds.includes(member.spouseId))
  );

  const daysUntil = getDaysUntilBirthday(member);

  const handleGenerateWish = async () => {
    if (!snapshot || daysUntil !== 0) return;
    setGenerating(true);
    setActionError("");
    try {
      const generatedWish = await generateBirthdayWish(snapshot.family.id, member.id);
      setWish(generatedWish);
      await navigator.clipboard.writeText(generatedWish);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 animate-in fade-in">
      <div className="w-full max-w-lg bg-white rounded-t-3xl md:rounded-3xl shadow-2xl animate-in slide-in-from-bottom md:slide-in-from-bottom-0 duration-300 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-[#d4756a]/10 via-[#e8c4b8]/10 to-[#a8b5b2]/10 px-6 py-6 rounded-t-3xl">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white rounded-full shadow-md hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>

          <div className="flex items-start gap-4">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-lg ${
              member.gender === "male"
                ? "bg-gradient-to-br from-blue-100 to-blue-200"
                : "bg-gradient-to-br from-pink-100 to-pink-200"
            }`}>
              {member.gender === "male" ? "👨" : "👩"}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-2xl" style={{ fontWeight: 600, color: '#3d2f2a' }}>
                  {member.name}
                </h2>
                {member.nickName && (
                  <span className="px-2 py-1 bg-white/80 rounded-full text-sm text-gray-600">
                    {member.nickName}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-1">{member.relation}</p>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  member.gender === "male"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-pink-100 text-pink-700"
                }`}>
                  {member.familyName}
                </span>
                <span className="px-2 py-0.5 bg-white/80 rounded-full text-xs text-gray-700">
                  第{member.generation}代
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 max-h-[60vh] overflow-y-auto">
          {/* Basic Info */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 bg-[#d4756a]/10 rounded-full flex items-center justify-center">
                <Cake className="w-5 h-5 text-[#d4756a]" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500">生日</p>
                <p className="text-sm" style={{ fontWeight: 500, color: '#3d2f2a' }}>
                  {member.birthYear ? `${member.birthYear}年 ` : ""}
                  {member.birthdayType && member.birthMonth !== null && member.birthDay !== null
                    ? `${member.birthdayType === "lunar" ? `农历${member.isLeapMonth ? "闰" : ""}` : "阳历"} ${member.birthMonth}月${member.birthDay}日`
                    : "未记录"}
                </p>
              </div>
              {daysUntil === 0 ? (
                <span className="px-2 py-1 bg-[#d4756a]/10 rounded-full text-xs flex-shrink-0" style={{ color: '#d4756a', fontWeight: 600 }}>🎂 今天</span>
              ) : daysUntil !== null ? (
                <span className="px-2 py-1 bg-[#d4a76a]/10 rounded-full text-xs flex-shrink-0" style={{ color: '#d4a76a', fontWeight: 600 }}>还剩 {daysUntil} 天</span>
              ) : null}
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 bg-[#6b9d8a]/10 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-[#6b9d8a]" />
              </div>
              <div>
                <p className="text-xs text-gray-500">年龄</p>
                <p className="text-sm" style={{ fontWeight: 500, color: '#3d2f2a' }}>
                  {member.birthYear ? `${calculateAge(member.birthYear)} 岁` : "未知"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 bg-[#a8866c]/10 rounded-full flex items-center justify-center">
                <MapPin className="w-5 h-5 text-[#a8866c]" />
              </div>
              <div>
                <p className="text-xs text-gray-500">所属家族</p>
                <p className="text-sm" style={{ fontWeight: 500, color: '#3d2f2a' }}>
                  {member.familyName}
                </p>
              </div>
            </div>
          </div>

          {/* Family Relations */}
          {(parents.length > 0 || spouse || children.length > 0) && (
            <div className="mb-6">
              <h3 className="flex items-center gap-2 mb-3" style={{ fontWeight: 600, color: '#3d2f2a' }}>
                <GitBranch className="w-5 h-5 text-[#6b9d8a]" />
                家庭关系
              </h3>

              <div className="space-y-2">
                {parents.length > 0 && (
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500 mb-2">父母</p>
                    <div className="flex flex-wrap gap-2">
                      {parents.map(parent => (
                        <span key={parent.id} className="px-3 py-1 bg-white rounded-full text-sm" style={{ color: '#3d2f2a' }}>
                          {parent.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {spouse && (
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500 mb-2">配偶</p>
                    <span className="px-3 py-1 bg-white rounded-full text-sm" style={{ color: '#3d2f2a' }}>
                      {spouse.name}
                    </span>
                  </div>
                )}

                {children.length > 0 && (
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500 mb-2">子女</p>
                    <div className="flex flex-wrap gap-2">
                      {children.map(child => (
                        <span key={child.id} className="px-3 py-1 bg-white rounded-full text-sm" style={{ color: '#3d2f2a' }}>
                          {child.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          {daysUntil === 0 && (
            <div className="space-y-2">
              {wish && (
                <div className="rounded-2xl bg-[#f0fdf4] border border-[#bbf7d0] p-4 text-sm text-[#315f4f] leading-6">
                  {wish}
                  <p className="mt-2 text-xs text-[#6b9d8a]">已复制到剪贴板</p>
                </div>
              )}
              {actionError && <p className="text-sm text-[#c0564b]">{actionError}</p>}
              <button
                onClick={() => void handleGenerateWish()}
                disabled={generating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#6b9d8a] text-white rounded-xl transition-colors hover:bg-[#5a8a77] disabled:opacity-45 disabled:cursor-not-allowed"
                style={{ fontWeight: 600 }}
              >
                {generating ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {generating ? "正在生成" : "生成生日祝福"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
