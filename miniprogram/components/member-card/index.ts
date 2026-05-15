const PALETTE: Record<string, string> = {
  莫家: "#3b82f6", 彭家: "#16a34a", 唐家: "#f97316", 周家: "#9333ea",
  田家: "#0d9488", 曾家: "#ca8a04", 何家: "#dc2626", 肖家: "#4f46e5",
  任家: "#db2777", 谢家: "#d97706", 白家: "#a8866c", 卢家: "#64748b",
}

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

Component({
  properties: {
    memberJson: { type: String, value: '' },
    isBirthday: { type: Boolean, value: false },
    isHighlight: { type: Boolean, value: false },
    isDim: { type: Boolean, value: false },
  },
  data: {
    member: null as MemberData | null,
    color: '#a8866c',
    age: null as number | null,
    isMe: false,
    avatarEmoji: '👤',
  },
  observers: {
    memberJson(json: string) {
      if (!json) return
      try {
        const m: MemberData = JSON.parse(json)
        const color = PALETTE[m.familyName] ?? '#a8866c'
        const age = m.birthYear ? new Date().getFullYear() - m.birthYear : null
        this.setData({
          member: m,
          color,
          age,
          isMe: m.name === '莫发达',
          avatarEmoji: m.gender === 'male' ? '👨' : '👩',
        })
      } catch {
        // ignore parse error
      }
    }
  },
  methods: {
    onTap() {
      const { member } = this.data
      if (member) {
        this.triggerEvent('select', { member })
      }
    }
  }
})
