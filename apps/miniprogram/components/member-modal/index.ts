import {
  familyMembers, calculateAge, getDaysUntilBirthday, getMemberColor
} from '../../utils/familyData'
import { getCurrentSnapshot } from '../../services/familyStore'
import type { FamilyMember } from '../../types/family'

interface MemberData {
  id: string
  parentIds: string[]
  spouseId: string | null
  generation: number
  name: string
  nickName?: string
  relation: string
  birthYear: number | null
  gender: "male" | "female" | "unknown"
  birthdayType: "solar" | "lunar" | null
  birthMonth: number | null
  birthDay: number | null
  isLeapMonth?: boolean
}

interface RelativeMember {
  id: string
  name: string
}

interface BirthdayWishModalInstance {
  open(familyId: string, member: FamilyMember): void
}

const genderText = (gender: MemberData['gender']): string => {
  if (gender === 'male') return '男'
  if (gender === 'female') return '女'
  return '未记录'
}

Component({
  properties: {
    show: { type: Boolean, value: false },
    memberJson: { type: String, value: '' },
  },
  data: {
    member: null as MemberData | null,
    parents: [] as RelativeMember[],
    spouse: null as RelativeMember | null,
    children: [] as RelativeMember[],
    age: null as number | null,
    daysUntil: null as number | null,
    color: '#a99c96',
    avatarText: '家',
    isBirthday: false,
    isMe: false,
    canEdit: false,
    hasRelatives: false,
    birthdayText: '',
    genderText: '',
    metaLine: '',
  },
  observers: {
    memberJson(json: string) {
      if (!json) return
      try {
        const member: MemberData = JSON.parse(json)
        const snapshot = getCurrentSnapshot()
        const linkedMemberId = snapshot?.family.linkedMemberId ?? ''
        const role = snapshot?.family.role ?? ''

        const parents: RelativeMember[] = member.parentIds
          .map(parentId => familyMembers.find(item => item.id === parentId))
          .filter((item): item is MemberData => Boolean(item))
          .map(item => ({ id: item.id, name: item.name }))

        const spouseRaw = member.spouseId
          ? familyMembers.find(item => item.id === member.spouseId)
          : undefined
        const spouse: RelativeMember | null = spouseRaw
          ? { id: spouseRaw.id, name: spouseRaw.name }
          : null

        const children: RelativeMember[] = familyMembers
          .filter(item => item.parentIds.includes(member.id)
            || (member.spouseId !== null && item.parentIds.includes(member.spouseId)))
          .map(item => ({ id: item.id, name: item.name }))

        const age = calculateAge(member.birthYear)
        const daysUntil = getDaysUntilBirthday(member)
        const isMe = linkedMemberId === member.id

        const calendar = member.birthdayType === 'lunar'
          ? (member.isLeapMonth ? '农历闰' : '农历')
          : '阳历'
        const hasBirthday = Boolean(member.birthdayType) && member.birthMonth !== null && member.birthDay !== null
        const birthdayText = hasBirthday
          ? `${member.birthYear ? `${member.birthYear}年 ` : ''}${calendar}${member.birthMonth}月${member.birthDay}日`
          : '生日待补充'

        const metaParts = [isMe ? '我' : member.relation, age === null ? '年龄待补' : `${age} 岁`]

        this.setData({
          member,
          parents,
          spouse,
          children,
          age,
          daysUntil,
          color: getMemberColor(member),
          avatarText: member.name.trim().slice(-1) || '家',
          isBirthday: daysUntil === 0,
          isMe,
          canEdit: role === 'owner' || isMe,
          hasRelatives: parents.length > 0 || spouse !== null || children.length > 0,
          birthdayText,
          genderText: genderText(member.gender),
          metaLine: metaParts.filter(Boolean).join(' · '),
        })
      } catch {
        // 非法 memberJson 时保持上一次内容，避免弹窗闪空
      }
    },
  },
  methods: {
    onClose() {
      this.triggerEvent('close')
    },
    onMaskTap() {
      this.triggerEvent('close')
    },
    onContentTap() {
      // 阻止冒泡到遮罩
    },
    generateWish() {
      const { member } = this.data
      const familyId = getCurrentSnapshot()?.family.id
      if (!member || !familyId || !this.data.isBirthday) return
      const modal = this.selectComponent('#birthday-wish-modal') as unknown as BirthdayWishModalInstance
      modal?.open(familyId, member)
    },
    editMember() {
      const { member } = this.data
      if (!member || !this.data.canEdit) return
      wx.setStorageSync('little-family:editing-member', JSON.stringify(member))
      this.triggerEvent('close')
      wx.navigateTo({ url: '/pages/member-edit/index' })
    },
  },
})
