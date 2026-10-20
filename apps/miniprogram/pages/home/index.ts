import {
  familyMembers, getTodayBirthdays, getUpcomingBirthdays, getDaysUntilBirthday,
  getNextBirthdayDate, calculateAge, getTodayLunarLabel
} from '../../utils/familyData'
import { generateAndCopyBirthdayWish } from '../../utils/birthdayWish'
import { ensureFamilyData } from '../../services/familyStore'
import { getBirthdaySubscriptionConfig } from '../../services/api'
import { FamilyMember } from '../../types/family'

interface TodayPerson {
  id: string
  memberJson: string
  name: string
  meta: string
  avatarText: string
}

interface UpcomingPerson {
  id: string
  memberJson: string
  name: string
  meta: string
  day: string
  month: string
  badge: string
  isUrgent: boolean
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const isLunar = (member: FamilyMember): boolean => member.birthdayType === 'lunar'

const birthdayLabel = (member: FamilyMember): string => {
  if (!member.birthMonth || !member.birthDay) return '生日待补充'
  const calendar = isLunar(member) ? (member.isLeapMonth ? '农历闰' : '农历') : '阳历'
  return `${calendar}${member.birthMonth}月${member.birthDay}日`
}

const daysBadge = (days: number): string => (days === 1 ? '明天' : `${days} 天后`)

const hasBirthday = (member: FamilyMember): boolean =>
  Boolean(member.birthdayType) && member.birthMonth !== null && member.birthDay !== null

Component({
  data: {
    loading: true,
    error: '',
    needsFamily: false,
    familyName: '',
    canManage: false,
    monthLabel: '',
    dayNumber: '',
    weekdayLabel: '',
    lunarLabel: '',
    todayState: '',
    todayPeople: [] as TodayPerson[],
    todayEmpty: true,
    noMembers: false,
    colophon: '',
    upcoming: [] as UpcomingPerson[],
    upcomingCount: 0,
    missingCount: 0,
    monthRemaining: 0,
    reminderConfigured: false,
    reminderEnabled: false,
    showModal: false,
    selectedMemberJson: '',
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
      const now = new Date()
      const monthLabel = `${now.getMonth() + 1}月`
      const dayNumber = String(now.getDate()).padStart(2, '0')
      const weekdayLabel = WEEKDAYS[now.getDay()]
      const lunarLabel = getTodayLunarLabel(now)
      const dayOfYear = Math.floor(
        (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
          - Date.UTC(now.getFullYear(), 0, 0)) / 86400000
      )

      try {
        const snapshot = await ensureFamilyData()
        if (!snapshot) {
          this.setData({
            loading: false,
            needsFamily: true,
            noMembers: false,
            monthLabel,
            dayNumber,
            weekdayLabel,
            lunarLabel,
          })
          return
        }

        const role = snapshot.family.role
        const todayMembers = getTodayBirthdays()
        const upcomingMembers = getUpcomingBirthdays(30)
        const missingCount = familyMembers.filter(member => !hasBirthday(member)).length
        const monthRemaining = familyMembers
          .filter(member => hasBirthday(member))
          .filter(member => {
            const days = getDaysUntilBirthday(member)
            const next = getNextBirthdayDate(member)
            return days !== null && days > 0 && next !== null
              && next.getFullYear() === now.getFullYear()
              && next.getMonth() === now.getMonth()
          }).length

        const todayPeople: TodayPerson[] = todayMembers.map(member => {
          const age = calculateAge(member.birthYear)
          return {
            id: member.id,
            memberJson: JSON.stringify(member),
            name: member.name,
            meta: [member.relation, birthdayLabel(member), age ? `${age} 岁` : ''].filter(Boolean).join(' · '),
            avatarText: member.name.trim().slice(-1) || '家',
          }
        })

        const upcoming: UpcomingPerson[] = upcomingMembers.map(member => {
          const days = getDaysUntilBirthday(member) ?? 0
          const next = getNextBirthdayDate(member)
          return {
            id: member.id,
            memberJson: JSON.stringify(member),
            name: member.name,
            meta: [member.relation, birthdayLabel(member)].filter(Boolean).join(' · '),
            day: next ? String(next.getDate()).padStart(2, '0') : '--',
            month: next ? `${next.getMonth() + 1}月` : '',
            badge: daysBadge(days),
            isUrgent: days > 0 && days <= 7,
          }
        })

        const noMembers = familyMembers.length === 0
        const todayState = noMembers
          ? '还没有家人'
          : todayPeople.length > 0
            ? `今天 · ${todayPeople.length} 位生日`
            : '今天没有生日'
        const colophon = `${snapshot.family.name} · ${familyMembers.length} 位家人 · 第 ${dayOfYear} 天`

        this.setData({
          loading: false,
          error: '',
          needsFamily: false,
          noMembers,
          familyName: snapshot.family.name,
          canManage: role === 'owner',
          monthLabel,
          dayNumber,
          weekdayLabel,
          lunarLabel,
          todayState,
          todayPeople,
          todayEmpty: todayPeople.length === 0,
          colophon,
          upcoming,
          upcomingCount: upcoming.length,
          missingCount,
          monthRemaining,
        })

        void this.loadReminder(snapshot.family.id)
      } catch (error) {
        this.setData({
          loading: false,
          error: (error instanceof Error ? error.message : '') || '家庭数据加载失败',
        })
      }
    },

    async loadReminder(familyId: string) {
      try {
        const config = await getBirthdaySubscriptionConfig(familyId)
        this.setData({
          reminderConfigured: config.configured,
          reminderEnabled: config.configured && config.activeGrantCount > 0,
        })
      } catch {
        this.setData({ reminderConfigured: false, reminderEnabled: false })
      }
    },

    retry() {
      this.setData({ loading: true, error: '' })
      this.loadData()
    },

    async generateWish(e: WechatMiniprogram.TouchEvent) {
      const { id } = e.currentTarget.dataset as { id: string }
      const member = familyMembers.find(item => item.id === id)
      if (!member) return
      const snapshot = await ensureFamilyData()
      if (!snapshot) return
      await generateAndCopyBirthdayWish(snapshot.family.id, member)
    },

    onMemberTap(e: WechatMiniprogram.TouchEvent) {
      const { json } = e.currentTarget.dataset as { json: string }
      if (!json) return
      this.setData({ showModal: true, selectedMemberJson: json })
    },

    onModalClose() {
      this.setData({ showModal: false, selectedMemberJson: '' })
    },

    goFamilyManage() {
      wx.navigateTo({ url: '/pages/family-manage/index' })
    },

    goBirthday() {
      wx.switchTab({ url: '/pages/birthday/index' })
    },
  }
})
