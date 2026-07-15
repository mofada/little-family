import { calculateAge, familyMembers, getMemberColor } from '../../utils/familyData'
import { ensureFamilyData } from '../../services/familyStore'
import type { FamilyMember } from '../../types/family'

type GenderFilter = 'all' | 'male' | 'female' | 'unknown'

interface TimelineEvent {
  id: string
  memberJson: string
  name: string
  avatarText: string
  relation: string
  color: string
  birthYear: number
  birthdayLabel: string
  ageLabel: string
  genderLabel: string
}

interface DecadeGroup {
  decade: number
  decadeLabel: string
  count: number
  events: TimelineEvent[]
}

const genderLabels: Record<FamilyMember['gender'], string> = {
  male: '男',
  female: '女',
  unknown: '未记录',
}

const getBirthdayLabel = (member: FamilyMember): string => {
  if (!member.birthdayType || member.birthMonth === null || member.birthDay === null) {
    return '仅记录出生年份'
  }
  const calendar = member.birthdayType === 'lunar'
    ? `农历${member.isLeapMonth ? '闰' : ''}`
    : '阳历'
  return `${calendar}${member.birthMonth}月${member.birthDay}日`
}

Component({
  data: {
    loading: true,
    needsFamily: false,
    keyword: '',
    genderFilter: 'all' as GenderFilter,
    totalMembers: 0,
    totalEvents: 0,
    hiddenCount: 0,
    yearSpan: 0,
    firstYear: null as number | null,
    lastYear: null as number | null,
    decadeGroups: [] as DecadeGroup[],
    showModal: false,
    selectedMemberJson: '',
  },

  lifetimes: {
    attached() {
      void this.buildTimeline()
    },
  },

  pageLifetimes: {
    show() {
      void this.buildTimeline()
    },
  },

  methods: {
    async buildTimeline() {
      try {
        const snapshot = await ensureFamilyData()
        if (!snapshot) {
          this.setData({
            loading: false,
            needsFamily: true,
            totalMembers: 0,
            totalEvents: 0,
            hiddenCount: 0,
            yearSpan: 0,
            firstYear: null,
            lastYear: null,
            decadeGroups: [],
          })
          return
        }

        const keyword = this.data.keyword.trim().toLowerCase()
        const genderFilter = this.data.genderFilter
        const membersWithYear = familyMembers.filter(member => member.birthYear !== null)
        const visibleMembers = membersWithYear
          .filter(member => {
            if (genderFilter !== 'all' && member.gender !== genderFilter) return false
            if (!keyword) return true
            return member.name.toLowerCase().includes(keyword)
              || member.relation.toLowerCase().includes(keyword)
              || String(member.birthYear).includes(keyword)
          })
          .sort((a, b) => {
            const yearDiff = (a.birthYear ?? 0) - (b.birthYear ?? 0)
            return yearDiff !== 0 ? yearDiff : a.name.localeCompare(b.name, 'zh-CN')
          })

        const allYears = membersWithYear
          .map(member => member.birthYear as number)
          .sort((a, b) => a - b)
        const firstYear = allYears[0] ?? null
        const lastYear = allYears[allYears.length - 1] ?? null
        const decadeMap = new Map<number, TimelineEvent[]>()

        visibleMembers.forEach(member => {
          const birthYear = member.birthYear as number
          const decade = Math.floor(birthYear / 10) * 10
          const events = decadeMap.get(decade) ?? []
          const age = calculateAge(member.birthYear)
          events.push({
            id: member.id,
            memberJson: JSON.stringify(member),
            name: member.name,
            avatarText: member.name.slice(-1),
            relation: member.relation || '家庭成员',
            color: getMemberColor(member),
            birthYear,
            birthdayLabel: getBirthdayLabel(member),
            ageLabel: age === null ? '年龄未知' : `${age}岁`,
            genderLabel: genderLabels[member.gender],
          })
          decadeMap.set(decade, events)
        })

        const decadeGroups = Array.from(decadeMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([decade, events]) => ({
            decade,
            decadeLabel: `${decade}年代`,
            count: events.length,
            events,
          }))

        this.setData({
          loading: false,
          needsFamily: false,
          totalMembers: familyMembers.length,
          totalEvents: visibleMembers.length,
          hiddenCount: familyMembers.length - membersWithYear.length,
          yearSpan: firstYear !== null && lastYear !== null ? lastYear - firstYear : 0,
          firstYear,
          lastYear,
          decadeGroups,
        })
      } catch (error) {
        this.setData({ loading: false })
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
      }
    },

    onSearch(e: WechatMiniprogram.Input) {
      this.setData({ keyword: e.detail.value }, () => { void this.buildTimeline() })
    },

    clearSearch() {
      this.setData({ keyword: '' }, () => { void this.buildTimeline() })
    },

    setGenderFilter(e: WechatMiniprogram.TouchEvent) {
      const genderFilter = (e.currentTarget.dataset as { gender: GenderFilter }).gender
      this.setData({ genderFilter }, () => { void this.buildTimeline() })
    },

    onEventTap(e: WechatMiniprogram.TouchEvent) {
      const memberJson = (e.currentTarget.dataset as { json: string }).json
      this.setData({ showModal: true, selectedMemberJson: memberJson })
    },

    onModalClose() {
      this.setData({ showModal: false, selectedMemberJson: '' })
    },

    goFamilyManage() {
      wx.navigateTo({ url: '/pages/family-manage/index' })
    },
  },
})
