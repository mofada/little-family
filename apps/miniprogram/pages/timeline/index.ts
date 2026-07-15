import { familyMembers, getFamilyColor, calculateAge } from '../../utils/familyData'
import { ensureFamilyData } from '../../services/familyStore'

interface TimelineEvent {
  id: string
  memberJson: string
  name: string
  relation: string
  familyName: string
  color: string
  birthYear: number
  age: number | null
  gender: string
  birthdayType: string
  birthMonth: number
  birthDay: number
  isLeapMonth: boolean
}

interface DecadeGroup {
  decade: string
  decadeLabel: string
  events: TimelineEvent[]
}

Component({
  data: {
    totalEvents: 0,
    yearSpan: 0,
    decadeCount: 0,
    decadeGroups: [] as DecadeGroup[],
    showModal: false,
    selectedMemberJson: '',
  },
  lifetimes: {
    attached() { this.buildTimeline() }
  },
  pageLifetimes: {
    show() {
      this.buildTimeline()
    }
  },
  methods: {
    async buildTimeline() {
      try {
        await ensureFamilyData(true)
      const withYear = familyMembers
        .filter(m => m.birthYear !== null)
        .sort((a, b) => (a.birthYear ?? 0) - (b.birthYear ?? 0))

      const totalEvents = withYear.length
      const years = withYear.map(m => m.birthYear ?? 0)
      const yearSpan = years.length > 0 ? (years[years.length - 1] - years[0]) : 0

      // Group by decade
      const decadeMap = new Map<number, TimelineEvent[]>()
      for (const m of withYear) {
        const decade = Math.floor((m.birthYear ?? 0) / 10) * 10
        if (!decadeMap.has(decade)) decadeMap.set(decade, [])
        decadeMap.get(decade)!.push({
          id: m.id,
          memberJson: JSON.stringify(m),
          name: m.name,
          relation: m.relation,
          familyName: m.familyName,
          color: getFamilyColor(m.familyName),
          birthYear: m.birthYear ?? 0,
          age: calculateAge(m.birthYear),
          gender: m.gender,
          birthdayType: m.birthdayType,
          birthMonth: m.birthMonth,
          birthDay: m.birthDay,
          isLeapMonth: m.isLeapMonth ?? false,
        })
      }

      const sortedDecades = Array.from(decadeMap.keys()).sort((a, b) => a - b)
      const decadeGroups: DecadeGroup[] = sortedDecades.map(d => ({
        decade: `${d}`,
        decadeLabel: `${d}年代`,
        events: decadeMap.get(d)!,
      }))

      this.setData({
        totalEvents,
        yearSpan,
        decadeCount: sortedDecades.length,
        decadeGroups,
      })
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
      }
    },

    onEventTap(e: WechatMiniprogram.TouchEvent) {
      const json = (e.currentTarget.dataset as { json: string }).json
      this.setData({ showModal: true, selectedMemberJson: json })
    },

    onModalClose() {
      this.setData({ showModal: false, selectedMemberJson: '' })
    },
  }
})
