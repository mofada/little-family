import {
  familyMembers, getTodayBirthdays, getDaysUntilBirthday, getNextBirthdayDate,
  calculateAge, getTodayLunarLabel
} from '../../utils/familyData'
import { ensureFamilyData, invalidateFamilyData } from '../../services/familyStore'
import { getBirthdaySubscriptionConfig, linkCurrentUser, type BirthdaySubscriptionConfig } from '../../services/api'
import { requestBirthdaySubscription } from '../../utils/subscription'
import type { FamilyMember } from '../../types/family'

interface BirthdayWishModalInstance {
  open(familyId: string, member: FamilyMember): void
}

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
  isBirthday: boolean
  isUrgent: boolean
  isLinked: boolean
  canEdit: boolean
  selfActionLabel: string
  birthdayLabel: string
  nextBirthdayDay: string
  nextBirthdayWeekday: string
  countdownLabel: string
  avatarText: string
  todayMeta: string
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

Component({
  data: {
    loading: true,
    error: '',
    keyword: '',
    filterType: 'all' as 'all' | 'lunar' | 'solar',
    dateMeta: '',
    dayNumber: '',
    dayOfYear: 0,
    familyName: '',
    memberCount: 0,
    todayState: '',
    todayMembers: [] as MemberRow[],
    monthSections: [] as MonthSection[],
    noBirthdayMembers: [] as MemberRow[],
    pendingExpanded: false,
    familyId: '',
    linkedMemberId: '',
    canAddMember: false,
    manageHint: '',
    emptyTitle: '',
    emptyDesc: '',
    emptyAction: '',
    reminderEnabled: false,
    reminderStatus: '',
    reminderAction: '',
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
      if (this.data.familyId) void this.loadSubscription(this.data.familyId)
    }
  },
  methods: {
    async buildList() {
      try {
        const snapshot = await ensureFamilyData()
        const familyId = snapshot?.family.id ?? ''
        const activeRole = snapshot?.family.role ?? ''
        const linkedMemberId = snapshot?.family.linkedMemberId ?? ''
        const familyChanged = familyId !== this.data.familyId

        this.setData({
          familyId,
          linkedMemberId,
          canAddMember: activeRole === 'owner',
          manageHint: !familyId || activeRole === 'owner'
            ? ''
            : (linkedMemberId
              ? '成员信息由家庭所有者统一维护，你可以编辑与自己关联的成员'
              : '成员信息由家庭所有者统一维护'),
        })
        if (familyChanged) void this.loadSubscription(familyId)

        const { keyword, filterType } = this.data
        const kw = keyword.trim().toLowerCase()
        const filtering = Boolean(kw) || filterType !== 'all'

        const matchesKeyword = (m: typeof familyMembers[0]) =>
          !kw || m.name.toLowerCase().includes(kw) || m.relation.includes(kw)

        const filtered = familyMembers.filter(m => {
          if (!m.birthdayType || m.birthMonth === null || m.birthDay === null) return false
          if (filterType !== 'all' && m.birthdayType !== filterType) return false
          if (!matchesKeyword(m)) return false
          return true
        })

        const now = new Date()
        const dateMeta = [WEEKDAYS[now.getDay()], getTodayLunarLabel(now)].filter(Boolean).join(' · ')
        const dayNumber = String(now.getDate()).padStart(2, '0')
        const dayOfYear = Math.floor(
          (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
            - Date.UTC(now.getFullYear(), 0, 0)) / 86400000
        )

        const today = getTodayBirthdays()
        const todayIds = new Set(today.map(m => m.id))

        const toRow = (m: typeof familyMembers[0]): MemberRow => {
          const daysUntil = getDaysUntilBirthday(m, now) ?? 0
          const nextBirthday = getNextBirthdayDate(m, now)
          const hasBirthday = Boolean(m.birthdayType) && m.birthMonth !== null && m.birthDay !== null
          const calendarLabel = m.birthdayType === 'lunar'
            ? (m.isLeapMonth ? '农历闰' : '农历')
            : '阳历'
          const birthdayLabel = hasBirthday
            ? `${calendarLabel}${m.birthMonth}月${m.birthDay}日`
            : '生日待补充'
          const age = calculateAge(m.birthYear)
          return {
            id: m.id,
            memberJson: JSON.stringify(m),
            name: m.name,
            relation: m.relation,
            isBirthday: todayIds.has(m.id),
            isUrgent: daysUntil > 0 && daysUntil <= 7,
            isLinked: linkedMemberId === m.id,
            canEdit: activeRole === 'owner' || linkedMemberId === m.id,
            selfActionLabel: activeRole === 'owner' || activeRole === 'admin' ? '设为我' : '申请认领',
            birthdayLabel,
            nextBirthdayDay: nextBirthday ? String(nextBirthday.getDate()).padStart(2, '0') : '--',
            nextBirthdayWeekday: nextBirthday ? WEEKDAYS[nextBirthday.getDay()] : '',
            countdownLabel: daysUntil === 0 ? '就是今天' : daysUntil === 1 ? '明天' : `${daysUntil} 天后`,
            avatarText: m.name.slice(-1),
            todayMeta: [m.relation, birthdayLabel, age ? `${age} 岁` : ''].filter(Boolean).join(' · '),
          }
        }

        const todayMembers = today
          .filter(m => {
            if (filterType !== 'all' && m.birthdayType !== filterType) return false
            if (!matchesKeyword(m)) return false
            return true
          })
          .map(toRow)

        const noBirthdayMembers = filterType === 'all'
          ? familyMembers
            .filter(m => (!m.birthdayType || m.birthMonth === null || m.birthDay === null) && matchesKeyword(m))
            .map(toRow)
          : []

        // 按下一次生日的公历月份分组，确保农历生日也按真实先后顺序展示。
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

        this.setData({
          dateMeta,
          dayNumber,
          dayOfYear,
          familyName: snapshot?.family.name ?? '',
          memberCount: familyMembers.length,
          todayState: `今天 · ${todayMembers.length} 位生日`,
          todayMembers,
          monthSections: sections,
          noBirthdayMembers,
          emptyTitle: filtering ? '没有找到相关成员' : '还没有家人资料',
          emptyDesc: filtering
            ? '换个姓名或生日类型试试'
            : !familyId
              ? '先创建一个家庭，或让家人邀请你加入'
              : activeRole === 'owner'
                ? '点上方「添加」，先录入第一位家人'
                : '等家庭所有者录入家人资料',
          emptyAction: !familyId
            ? '去家庭管理'
            : activeRole === 'owner' && familyMembers.length === 0
              ? '添加第一位家人'
              : '',
          loading: false,
          error: '',
        })
      } catch (error) {
        this.setData({
          loading: false,
          error: '网络不稳定或服务暂时不可用，请稍后再试',
        })
      }
    },

    retry() {
      this.setData({ loading: true, error: '' })
      void this.buildList()
    },

    goFamilyManage() {
      wx.navigateTo({ url: '/pages/family-manage/index' })
    },

    onEmptyAction() {
      if (!this.data.familyId) {
        this.goFamilyManage()
        return
      }
      if (this.data.canAddMember) this.startAddMember()
    },

    async loadSubscription(familyId: string) {
      if (!familyId) {
        this.setData({ reminderEnabled: false, reminderStatus: '', reminderAction: '' })
        return
      }
      try {
        const config = await getBirthdaySubscriptionConfig(familyId)
        if (familyId !== this.data.familyId) return
        this.applySubscription(config)
      } catch {
        if (familyId !== this.data.familyId) return
        this.setData({
          reminderEnabled: false,
          reminderStatus: '提醒状态暂时读不到',
          reminderAction: '',
        })
      }
    },

    applySubscription(config: BirthdaySubscriptionConfig) {
      const enabled = config.configured && config.activeGrantCount > 0
      this.setData({
        reminderEnabled: enabled,
        reminderStatus: !config.configured
          ? '生日提醒暂未开放'
          : enabled
            ? `提醒已开启 · 还可提醒 ${config.activeGrantCount} 次`
            : '提醒未开启 · 开启后 8 点推送',
        reminderAction: !config.configured
          ? ''
          : enabled
            ? (config.subscriptionMode === 'once' ? '再订一次' : '')
            : '开启提醒',
      })
    },

    onSearch(e: WechatMiniprogram.Input) {
      this.setData({ keyword: e.detail.value }, () => { void this.buildList() })
    },

    clearSearch() {
      this.setData({ keyword: '' }, () => { void this.buildList() })
    },

    setFilter(e: WechatMiniprogram.TouchEvent) {
      const type = (e.currentTarget.dataset as { type: 'all' | 'lunar' | 'solar' }).type
      this.setData({ filterType: type }, () => { void this.buildList() })
    },

    onMemberTap(e: WechatMiniprogram.TouchEvent) {
      const json = (e.currentTarget.dataset as { json: string }).json
      this.setData({ showModal: true, selectedMemberJson: json })
    },

    startAddMember() {
      if (!this.data.canAddMember) {
        wx.showToast({ title: '仅家庭所有者可添加成员', icon: 'none' })
        return
      }
      wx.removeStorageSync('little-family:editing-member')
      wx.navigateTo({ url: '/pages/member-edit/index' })
    },

    editMember(e: WechatMiniprogram.TouchEvent) {
      const { json, canEdit } = e.currentTarget.dataset as { json: string; canEdit: boolean | string }
      if (canEdit !== true && canEdit !== 'true') {
        wx.showToast({ title: '仅家庭所有者或本人可编辑', icon: 'none' })
        return
      }
      wx.setStorageSync('little-family:editing-member', json)
      wx.navigateTo({ url: '/pages/member-edit/index' })
    },

    async setAsMe(e: WechatMiniprogram.TouchEvent) {
      const { id } = e.currentTarget.dataset as { id: string }
      if (!id || !this.data.familyId || this.data.linkedMemberId === id) return
      try {
        const result = await linkCurrentUser(this.data.familyId, id)
        invalidateFamilyData()
        await this.buildList()
        wx.showToast({
          title: result.status === 'pending' ? '已提交审批' : '已设为我',
          icon: 'success',
        })
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '设置失败', icon: 'none' })
      }
    },

    async generateWish(e: WechatMiniprogram.TouchEvent) {
      const id = (e.currentTarget.dataset as { id: string }).id
      const member = familyMembers.find(m => m.id === id)
      if (!member || !this.data.familyId) return
      const modal = this.selectComponent('#birthday-wish-modal') as unknown as BirthdayWishModalInstance
      modal?.open(this.data.familyId, member)
    },

    async subscribeBirthdayReminder() {
      if (!this.data.familyId || this.data.subscribing) return
      this.setData({ subscribing: true })
      try {
        const config = await requestBirthdaySubscription(this.data.familyId)
        this.applySubscription(config)
        wx.showToast({ title: '订阅成功', icon: 'success' })
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '订阅失败', icon: 'none' })
      } finally {
        this.setData({ subscribing: false })
      }
    },

    togglePending() {
      this.setData({ pendingExpanded: !this.data.pendingExpanded })
    },

    onModalClose() {
      this.setData({ showModal: false, selectedMemberJson: '' })
    },
  }
})
