import { familyMembers, calculateAge, getDaysUntilBirthday, buildBirthdayPrompt, getFamilyColor } from '../../utils/familyData'
import { copyToClipboard } from '../../utils/common'

interface MemberData {
  id: string
  parentId: string | null
  spouseId: string | null
  familyName: string
  generation: number
  name: string
  nickName?: string
  relation: string
  birthYear: number | null
  gender: "male" | "female"
  birthdayType: "solar" | "lunar"
  birthMonth: number
  birthDay: number
}

interface RelativeMember {
  id: string
  name: string
  relation: string
  familyName: string
  gender: "male" | "female"
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
    daysUntil: 0,
    color: '#a8866c',
    avatarEmoji: '👤',
    isBirthday: false,
    genderBg: '',
  },
  observers: {
    memberJson(json: string) {
      if (!json) return
      try {
        const m: MemberData = JSON.parse(json)
        const color = getFamilyColor(m.familyName)
        const age = calculateAge(m.birthYear)
        const daysUntil = getDaysUntilBirthday(m)

        // 找父母
        const directParent = familyMembers.find(x => x.id === m.parentId)
        const otherParent = directParent?.spouseId
          ? familyMembers.find(x => x.id === directParent.spouseId)
          : undefined
        const parents: RelativeMember[] = [directParent, otherParent]
          .filter((x): x is MemberData => !!x)
          .map(x => ({ id: x.id, name: x.name, relation: x.relation, familyName: x.familyName, gender: x.gender }))

        // 找配偶
        const spouseRaw = m.spouseId ? familyMembers.find(x => x.id === m.spouseId) : undefined
        const spouse: RelativeMember | null = spouseRaw
          ? { id: spouseRaw.id, name: spouseRaw.name, relation: spouseRaw.relation, familyName: spouseRaw.familyName, gender: spouseRaw.gender }
          : null

        // 找子女
        const children: RelativeMember[] = familyMembers
          .filter(x => x.parentId === m.id || (m.spouseId !== null && x.parentId === m.spouseId))
          .map(x => ({ id: x.id, name: x.name, relation: x.relation, familyName: x.familyName, gender: x.gender }))

        this.setData({
          member: m,
          parents,
          spouse,
          children,
          age,
          daysUntil,
          color,
          avatarEmoji: m.gender === 'male' ? '👨' : '👩',
          isBirthday: daysUntil === 0,
          genderBg: m.gender === 'male'
            ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)'
            : 'linear-gradient(135deg, #fce7f3, #fbcfe8)',
        })
      } catch {
        // ignore
      }
    }
  },
  methods: {
    onClose() {
      this.triggerEvent('close')
    },
    onMaskTap() {
      this.triggerEvent('close')
    },
    onContentTap(e: WechatMiniprogram.TouchEvent) {
      // 阻止冒泡到遮罩
      void e
    },
    copyPrompt() {
      const { member } = this.data
      if (!member) return
      const prompt = buildBirthdayPrompt(member)
      copyToClipboard(prompt, '✅ 已复制祝福Prompt')
    }
  }
})
