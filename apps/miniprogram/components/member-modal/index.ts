import { familyMembers, calculateAge, getDaysUntilBirthday, buildBirthdayPrompt, getMemberColor } from '../../utils/familyData'
import { copyToClipboard } from '../../utils/common'

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
  relation: string
  gender: "male" | "female" | "unknown"
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
        const color = getMemberColor(m)
        const age = calculateAge(m.birthYear)
        const daysUntil = getDaysUntilBirthday(m)

        // 找父母
        const parents: RelativeMember[] = m.parentIds
          .map(parentId => familyMembers.find(x => x.id === parentId))
          .filter((x): x is MemberData => !!x)
          .map(x => ({ id: x.id, name: x.name, relation: x.relation, gender: x.gender }))

        // 找配偶
        const spouseRaw = m.spouseId ? familyMembers.find(x => x.id === m.spouseId) : undefined
        const spouse: RelativeMember | null = spouseRaw
          ? { id: spouseRaw.id, name: spouseRaw.name, relation: spouseRaw.relation, gender: spouseRaw.gender }
          : null

        // 找子女
        const children: RelativeMember[] = familyMembers
          .filter(x => x.parentIds.includes(m.id) || (m.spouseId !== null && x.parentIds.includes(m.spouseId)))
          .map(x => ({ id: x.id, name: x.name, relation: x.relation, gender: x.gender }))

        this.setData({
          member: m,
          parents,
          spouse,
          children,
          age,
          daysUntil,
          color,
          avatarEmoji: m.gender === 'male' ? '👨' : m.gender === 'female' ? '👩' : '👤',
          isBirthday: daysUntil === 0,
          genderBg: m.gender === 'male'
            ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)'
            : m.gender === 'female'
              ? 'linear-gradient(135deg, #fce7f3, #fbcfe8)'
              : 'linear-gradient(135deg, #eee9e5, #ddd5cf)',
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
