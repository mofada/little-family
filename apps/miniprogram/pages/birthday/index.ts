import {
  familyMembers, getTodayBirthdays, getDaysUntilBirthday, getNextBirthdayDate,
  buildBirthdayPrompt, getFamilyColor
} from '../../utils/familyData'
import { copyToClipboard } from '../../utils/common'
import {
  requestFamilySubscribe,
  openSubscribeSettingPanel,
  getConfiguredSubscribeTemplateIds,
} from '../../utils/subscription'
import { ensureFamilyData } from '../../services/familyStore'

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
  isLeapMonth: boolean
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

    async buildList() {
      try {
        await ensureFamilyData(true)
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
          isLeapMonth: m.isLeapMonth ?? false,
        }
      }

      const todayMembers = today
        .filter(m => {
          if (filterType !== 'all' && m.birthdayType !== filterType) return false
          if (kw && !m.name.toLowerCase().includes(kw)) return false
          return true
        })
        .map(toRow)

      // 按下一次生日的公历月份分组，确保农历生日也按真实先后顺序展示。
      const now = new Date()
      const sectionMap = new Map<string, { date: Date; members: typeof filtered }>()
      filtered.forEach(member => {
        const date = getNextBirthdayDate(member, now)
        const key = `${date.getFullYear()}-${date.getMonth() + 1}`
        const existing = sectionMap.get(key)
        if (existing) {
          existing.members.push(member)
        } else {
          sectionMap.set(key, { date, members: [member] })
        }
      })

      const sections: MonthSection[] = Array.from(sectionMap.entries())
        .sort(([, a], [, b]) => a.date.getTime() - b.date.getTime())
        .map(([monthKey, section]) => ({
          label: `${section.date.getFullYear()}年${section.date.getMonth() + 1}月`,
          monthKey,
          members: section.members
            .sort((a, b) => getNextBirthdayDate(a, now).getTime() - getNextBirthdayDate(b, now).getTime())
            .map(toRow),
        }))

      this.setData({ todayMembers, monthSections: sections })
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
      }
    },

    onSearch(e: WechatMiniprogram.Input) {
      this.setData({ keyword: e.detail.value }, () => { void this.buildList() })
    },

    setFilter(e: WechatMiniprogram.TouchEvent) {
      const type = (e.currentTarget.dataset as { type: 'all' | 'lunar' | 'solar' }).type
      this.setData({ filterType: type }, () => { void this.buildList() })
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
