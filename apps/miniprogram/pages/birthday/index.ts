import {
  familyMembers, getTodayBirthdays, getDaysUntilBirthday, getNextBirthdayDate,
  getMemberColor
} from '../../utils/familyData'
import { generateAndCopyBirthdayWish } from '../../utils/birthdayWish'
import { ensureFamilyData } from '../../services/familyStore'
import { getBirthdaySubscriptionConfig } from '../../services/api'
import { requestBirthdaySubscription } from '../../utils/subscription'

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
    familyId: '',
    subscriptionConfigured: false,
    activeGrantCount: 0,
    subscriptionMode: 'once' as 'once' | 'long_term',
    subscribing: false,
    showModal: false,
    selectedMemberJson: '',
  },
  lifetimes: {
    attached() {
      this.buildList()
    }
  },
  pageLifetimes: {
    show() {
      this.buildList()
    }
  },
  methods: {
    async buildList() {
      try {
        const snapshot = await ensureFamilyData()
        const familyId = snapshot?.family.id ?? ''
        this.setData({ familyId })
        if (familyId) {
          try {
            const subscription = await getBirthdaySubscriptionConfig(familyId)
            this.setData({
              subscriptionConfigured: subscription.configured,
              activeGrantCount: subscription.activeGrantCount,
              subscriptionMode: subscription.subscriptionMode,
            })
          } catch {
            this.setData({ subscriptionConfigured: false, activeGrantCount: 0 })
          }
        }
      const { keyword, filterType } = this.data
      const kw = keyword.trim().toLowerCase()

      const filtered = familyMembers.filter(m => {
        if (!m.birthdayType || m.birthMonth === null || m.birthDay === null) return false
        if (filterType !== 'all' && m.birthdayType !== filterType) return false
        if (kw && !m.name.toLowerCase().includes(kw) && !m.relation.includes(kw)) return false
        return true
      })

      const today = getTodayBirthdays()
      const todayIds = new Set(today.map(m => m.id))

      const toRow = (m: typeof familyMembers[0]): MemberRow => {
        const daysUntil = getDaysUntilBirthday(m) ?? 0
        return {
          id: m.id,
          memberJson: JSON.stringify(m),
          name: m.name,
          relation: m.relation,
          color: getMemberColor(m),
          daysUntil,
          isBirthday: todayIds.has(m.id),
          isUrgent: daysUntil > 0 && daysUntil <= 7,
          birthdayType: m.birthdayType ?? 'solar',
          birthMonth: m.birthMonth ?? 1,
          birthDay: m.birthDay ?? 1,
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
        if (!date) return
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
            .sort((a, b) => (getNextBirthdayDate(a, now)?.getTime() ?? 0) - (getNextBirthdayDate(b, now)?.getTime() ?? 0))
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

    async generateWish(e: WechatMiniprogram.TouchEvent) {
      const id = (e.currentTarget.dataset as { id: string }).id
      const member = familyMembers.find(m => m.id === id)
      if (member && this.data.familyId) await generateAndCopyBirthdayWish(this.data.familyId, member)
    },

    async subscribeBirthdayReminder() {
      if (!this.data.familyId || this.data.subscribing) return
      this.setData({ subscribing: true })
      try {
        const config = await requestBirthdaySubscription(this.data.familyId)
        this.setData({
          activeGrantCount: config.activeGrantCount,
          subscriptionConfigured: config.configured,
          subscriptionMode: config.subscriptionMode,
        })
        wx.showToast({ title: '订阅成功', icon: 'success' })
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '订阅失败', icon: 'none' })
      } finally {
        this.setData({ subscribing: false })
      }
    },

    onModalClose() {
      this.setData({ showModal: false, selectedMemberJson: '' })
    },
  }
})
