import {
  familyMembers, getTodayBirthdays, getDaysUntilBirthday,
  buildBirthdayPrompt, getFamilyColor
} from '../../utils/familyData'
import { copyToClipboard } from '../../utils/common'
import {
  requestFamilySubscribe,
  openSubscribeSettingPanel,
  getConfiguredSubscribeTemplateIds,
} from '../../utils/subscription'

interface MonthSection {
  label: string
  monthKey: string
  members: MemberRow[]
}

interface MemberRow {
  id: string
  memberJson: string
  name: string
  relation: string
  familyName: string
  color: string
  daysUntil: number
  isBirthday: boolean
  isUrgent: boolean
  birthdayType: string
  birthMonth: number
  birthDay: number
}

Component({
  data: {
    keyword: '',
    filterType: 'all' as 'all' | 'lunar' | 'solar',
    todayMembers: [] as MemberRow[],
    monthSections: [] as MonthSection[],
    subscribeTemplateCount: 0,
    showModal: false,
    selectedMemberJson: '',
  },
  lifetimes: {
    attached() {
      this.buildList()
      this.refreshSubscribeState()
    }
  },
  pageLifetimes: {
    show() {
      this.buildList()
      this.refreshSubscribeState()
    }
  },
  methods: {
    refreshSubscribeState() {
      const ids = getConfiguredSubscribeTemplateIds()
      this.setData({ subscribeTemplateCount: ids.length })
    },

    buildList() {
      const { keyword, filterType } = this.data
      const kw = keyword.trim().toLowerCase()

      const filtered = familyMembers.filter(m => {
        if (filterType !== 'all' && m.birthdayType !== filterType) return false
        if (kw && !m.name.toLowerCase().includes(kw) && !m.relation.includes(kw)) return false
        return true
      })

      const today = getTodayBirthdays()
      const todayIds = new Set(today.map(m => m.id))

      const toRow = (m: typeof familyMembers[0]): MemberRow => {
        const daysUntil = getDaysUntilBirthday(m)
        return {
          id: m.id,
          memberJson: JSON.stringify(m),
          name: m.name,
          relation: m.relation,
          familyName: m.familyName,
          color: getFamilyColor(m.familyName),
          daysUntil,
          isBirthday: todayIds.has(m.id),
          isUrgent: daysUntil > 0 && daysUntil <= 7,
          birthdayType: m.birthdayType,
          birthMonth: m.birthMonth,
          birthDay: m.birthDay,
        }
      }

      const todayMembers = today
        .filter(m => {
          if (filterType !== 'all' && m.birthdayType !== filterType) return false
          if (kw && !m.name.toLowerCase().includes(kw)) return false
          return true
        })
        .map(toRow)

      // Build 13 months from current month
      const now = new Date()
      const curMonth = now.getMonth() + 1 // 1-12
      const sections: MonthSection[] = []
      for (let i = 0; i < 13; i++) {
        const month = ((curMonth - 1 + i) % 12) + 1
        const members = filtered
          .filter(m => m.birthMonth === month)
          .sort((a, b) => a.birthDay - b.birthDay)
          .map(toRow)
        if (members.length > 0) {
          sections.push({
            label: `${month}月`,
            monthKey: `${month}`,
            members,
          })
        }
      }

      this.setData({ todayMembers, monthSections: sections })
    },

    onSearch(e: WechatMiniprogram.Input) {
      this.setData({ keyword: e.detail.value }, () => this.buildList())
    },

    setFilter(e: WechatMiniprogram.TouchEvent) {
      const type = (e.currentTarget.dataset as { type: 'all' | 'lunar' | 'solar' }).type
      this.setData({ filterType: type }, () => this.buildList())
    },

    onMemberTap(e: WechatMiniprogram.TouchEvent) {
      const json = (e.currentTarget.dataset as { json: string }).json
      this.setData({ showModal: true, selectedMemberJson: json })
    },

    copyPrompt(e: WechatMiniprogram.TouchEvent) {
      const id = (e.currentTarget.dataset as { id: string }).id
      const member = familyMembers.find(m => m.id === id)
      if (member) copyToClipboard(buildBirthdayPrompt(member), '✅ 已复制祝福Prompt')
    },

    subscribeNow() {
      void requestFamilySubscribe({ scene: 'birthday-page' })
    },

    openSubscribeSettings() {
      openSubscribeSettingPanel()
    },

    onModalClose() {
      this.setData({ showModal: false, selectedMemberJson: '' })
    },
  }
})
