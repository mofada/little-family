import { X, Cake, Users, MapPin, Copy, Sparkles, GitBranch } from "lucide-react";
import { FamilyMember } from "../types/family";
import { familyMembers, calculateAge, getDaysUntilBirthday } from "../data/familyData";

interface MemberDetailModalProps {
  member: FamilyMember;
  onClose: () => void;
}

export default function MemberDetailModal({ member, onClose }: MemberDetailModalProps) {
  // Find both parents: the direct parent + their spouse
  const directParent = familyMembers.find(m => m.id === member.parentId);
  const otherParent = directParent?.spouseId
    ? familyMembers.find(m => m.id === directParent.spouseId)
    : undefined;
  const parents = [directParent, otherParent].filter(Boolean) as FamilyMember[];

  const spouse = familyMembers.find(m => m.id === member.spouseId);
  const children = familyMembers.filter(m =>
    m.parentId === member.id || (member.spouseId !== null && m.parentId === member.spouseId)
  );

  const daysUntil = getDaysUntilBirthday(member);

  const handleCopyBirthdayPrompt = () => {
    const prompt = `请模仿中国家庭微信群生日祝福风格生成文案。
要求：
- 温馨自然
- 不要太正式
- 适合发亲戚群
- 带 emoji
- 可以带微信表情：[蛋糕][庆祝][玫瑰]
- 不同年龄层语气不同

生日的人：
姓名：${member.name}${member.nickName ? `（${member.nickName}）` : ""}
称呼：${member.relation}
性别：${member.gender === "male" ? "男" : "女"}
年龄：${calculateAge(member.birthYear) ?? "未知"}岁
生日：${member.birthdayType === "lunar" ? "农历" : "阳历"}${member.birthMonth}月${member.birthDay}日`;
    navigator.clipboard.writeText(prompt);
    alert("已复制 AI Prompt！粘贴到 ChatGPT / 文心一言即可生成祝福🎂");
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
                  {member.birthdayType === "lunar" ? "农历" : "阳历"} {member.birthMonth}月{member.birthDay}日
                </p>
              </div>
              {daysUntil === 0 ? (
                <span className="px-2 py-1 bg-[#d4756a]/10 rounded-full text-xs flex-shrink-0" style={{ color: '#d4756a', fontWeight: 600 }}>🎂 今天</span>
              ) : (
                <span className="px-2 py-1 bg-[#d4a76a]/10 rounded-full text-xs flex-shrink-0" style={{ color: '#d4a76a', fontWeight: 600 }}>还剩 {daysUntil} 天</span>
              )}
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
          <div className="space-y-2">
            <button
              onClick={handleCopyBirthdayPrompt}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#d4756a] text-white rounded-xl transition-colors hover:bg-[#c06659]"
              style={{ fontWeight: 600 }}
            >
              <Copy className="w-5 h-5" />
              复制生日祝福 Prompt
            </button>

            <button
              onClick={handleCopyBirthdayPrompt}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#6b9d8a] text-white rounded-xl transition-colors hover:bg-[#5a8a77]"
              style={{ fontWeight: 600 }}
            >
              <Sparkles className="w-5 h-5" />
              生成生日祝福
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
