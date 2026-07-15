import {
  familyMembers, getTodayBirthdays, getUpcomingBirthdays,
  getDaysUntilBirthday, getFamilyBranches, buildBirthdayPrompt, getFamilyColor
} from '../../utils/familyData'
import { copyToClipboard } from '../../utils/common'
import { ensureFamilyData } from '../../services/familyStore'

interface BirthdayItem {
  id: string
  memberJson: string
  name: string
  relation: string
  familyName: string
  color: string
  daysUntil: number
  isUrgent: boolean
  birthdayType: string
  birthMonth: number
  birthDay: number
  isLeapMonth: boolean
}

Component({
  data: {
    statsTotal: familyMembers.length,
    statsFamilies: 0,
    statsTodayCount: 0,
    statsUpcoming: 0,
    todayBirthdays: [] as BirthdayItem[],
    upcomingBirthdays: [] as BirthdayItem[],
    showModal: false,
    selectedMemberJson: '',
    loading: true,
    needsFamily: false,
  },
  lifetimes: {
    attached() { this.loadData() }
  },
  pageLifetimes: {
    show() {
      this.loadData()
    }
  },
  methods: {
    async loadData() {
      try {
        const snapshot = await ensureFamilyData(true)
        if (!snapshot) {
          this.setData({
            loading: false, needsFamily: true, statsTotal: 0, statsFamilies: 0,
            statsTodayCount: 0, statsUpcoming: 0, todayBirthdays: [], upcomingBirthdays: [],
          })
          return
        }
      const today = getTodayBirthdays()
      const upcoming = getUpcomingBirthdays(30)
      const branches = getFamilyBranches()

      const mapItem = (m: typeof familyMembers[0], days: number): BirthdayItem => ({
        id: m.id,
        memberJson: JSON.stringify(m),
        name: m.name,
        relation: m.relation,
        familyName: m.familyName,
        color: getFamilyColor(m.familyName),
        daysUntil: days,
        isUrgent: days > 0 && days <= 7,
        birthdayType: m.birthdayType,
        birthMonth: m.birthMonth,
        birthDay: m.birthDay,
        isLeapMonth: m.isLeapMonth ?? false,
      })

      this.setData({
        loading: false,
        needsFamily: false,
        statsTotal: familyMembers.length,
        statsFamilies: branches.length,
        statsTodayCount: today.length,
        statsUpcoming: upcoming.length,
        todayBirthdays: today.map(m => mapItem(m, 0)),
        upcomingBirthdays: upcoming.map(m => mapItem(m, getDaysUntilBirthday(m))),
      })
      } catch (error) {
        this.setData({ loading: false })
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
      }
    },

    onMemberSelect(e: WechatMiniprogram.CustomEvent) {
      const { member } = e.detail
      this.setData({ showModal: true, selectedMemberJson: JSON.stringify(member) })
    },

    onModalClose() {
      this.setData({ showModal: false, selectedMemberJson: '' })
    },

    copyTodayPrompt(e: WechatMiniprogram.TouchEvent) {
      const idx = (e.currentTarget.dataset as { index: number }).index
      const item = this.data.todayBirthdays[idx]
      if (!item) return
      const member = familyMembers.find(m => m.id === item.id)
      if (member) copyToClipboard(buildBirthdayPrompt(member), '✅ 已复制祝福Prompt')
    },

    goPage(e: WechatMiniprogram.TouchEvent) {
      const path = (e.currentTarget.dataset as { path: string }).path
      wx.switchTab({ url: path })
    },

    goFamilyManage() {
      wx.navigateTo({ url: '/pages/family-manage/index' })
    },
  }
})
