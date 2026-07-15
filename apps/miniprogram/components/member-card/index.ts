interface MemberData {
  id: string
  parentIds: string[]
  spouseId: string | null
  name: string
  nickName?: string
  relation: string
  birthYear: number | null
  gender: "male" | "female" | "unknown"
  birthdayType: "solar" | "lunar" | null
  birthMonth: number | null
  birthDay: number | null
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
        const color = m.gender === 'male' ? '#4f7fbf' : m.gender === 'female' ? '#d47586' : '#8b817d'
        const age = m.birthYear ? new Date().getFullYear() - m.birthYear : null
        this.setData({
          member: m,
          color,
          age,
          isMe: m.relation === '我自己',
          avatarEmoji: m.gender === 'male' ? '👨' : m.gender === 'female' ? '👩' : '👤',
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
