import { calculateAge, familyMembers } from '../../utils/familyData'
import { ensureFamilyData } from '../../services/familyStore'
import type { FamilyMember } from '../../types/family'

type MemberFilter = 'all' | 'missing'

interface TimelineEvent {
  id: string
  memberJson: string
  name: string
  relation: string
  yearLabel: string
  yearUnit: string
  birthdayLabel: string
  ageLabel: string
  genderLabel: string
}

interface TimelineGroup {
  id: string
  label: string
  count: number
  events: TimelineEvent[]
}

const genderLabels: Record<FamilyMember['gender'], string> = {
  male: '男',
  female: '女',
  unknown: '未记录',
}

const MISSING_YEAR_LABEL = '待补年份'

const getBirthdayLabel = (member: FamilyMember): string => {
  if (!member.birthdayType || member.birthMonth === null || member.birthDay === null) {
    return member.birthYear === null ? '出生年份待补' : '仅记录出生年份'
  }
  const calendar = member.birthdayType === 'lunar'
    ? `农历${member.isLeapMonth ? '闰' : ''}`
    : '阳历'
  return `${calendar}${member.birthMonth}月${member.birthDay}日`
}

const toEvent = (member: FamilyMember): TimelineEvent => {
  const age = calculateAge(member.birthYear)
  return {
    id: member.id,
    memberJson: JSON.stringify(member),
    name: member.name,
    relation: member.relation || '家庭成员',
    yearLabel: member.birthYear === null ? '—' : String(member.birthYear),
    yearUnit: member.birthYear === null ? '' : '年',
    birthdayLabel: getBirthdayLabel(member),
    ageLabel: age === null ? '年龄待补' : `${age}岁`,
    genderLabel: genderLabels[member.gender],
  }
}

// 空结果的文案要点明是哪个筛选条件造成的，避免把“筛选无结果”说成“没有数据”。
const buildEmptyCopy = (
  keyword: string,
  filter: MemberFilter,
  totalMembers: number,
  missingCount: number,
): { title: string; desc: string } => {
  if (totalMembers === 0) {
    return { title: '还没有家人', desc: '在家庭管理中添加成员，时间轴就会长出来' }
  }
  if (filter === 'missing') {
    if (missingCount === 0) {
      return { title: '没有缺出生年份的家人', desc: '年份都齐了，切回“全部”看时间轴' }
    }
    return keyword
      ? { title: `待补年份里没有“${keyword}”`, desc: '换个关键词，或切回“全部”' }
      : { title: '待补年份里没有结果', desc: '换个关键词试试' }
  }
  if (keyword) {
    return missingCount > 0
      ? { title: `没有找到“${keyword}”`, desc: '全部只排有出生年份的家人，试试“待补年份”' }
      : { title: `没有找到“${keyword}”`, desc: '换个姓名、关系或年份试试' }
  }
  return { title: '时间轴还是空的', desc: '在家庭管理里补上出生年份' }
}

Component({
  data: {
    loading: true,
    error: '',
    needsFamily: false,
    keyword: '',
    filter: 'all' as MemberFilter,
    hiddenCount: 0,
    summaryLabel: '',
    emptyTitle: '时间轴还是空的',
    emptyDesc: '在家庭管理里补上出生年份',
    familyName: '',
    memberCount: 0,
    dayOfYear: 0,
    groups: [] as TimelineGroup[],
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
      const now = new Date()
      const dayOfYear = Math.floor(
        (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
          - Date.UTC(now.getFullYear(), 0, 0)) / 86400000
      )
      try {
        const snapshot = await ensureFamilyData()
        if (!snapshot) {
          this.setData({
            loading: false,
            error: '',
            needsFamily: true,
            hiddenCount: 0,
            summaryLabel: '',
            familyName: '',
            memberCount: 0,
            dayOfYear,
            groups: [],
          })
          return
        }

        const keyword = this.data.keyword.trim()
        const needle = keyword.toLowerCase()
        const filter = this.data.filter
        const membersWithYear = familyMembers.filter(member => member.birthYear !== null)
        const membersWithoutYear = familyMembers.filter(member => member.birthYear === null)
        const matchesKeyword = (member: FamilyMember): boolean => {
          if (!needle) return true
          return member.name.toLowerCase().includes(needle)
            || member.relation.toLowerCase().includes(needle)
            || (member.birthYear !== null && String(member.birthYear).includes(needle))
        }

        const groups: TimelineGroup[] = []

        if (filter === 'all') {
          const visibleMembers = membersWithYear
            .filter(matchesKeyword)
            .sort((a, b) => {
              const yearDiff = (a.birthYear ?? 0) - (b.birthYear ?? 0)
              return yearDiff !== 0 ? yearDiff : a.name.localeCompare(b.name, 'zh-CN')
            })
          const decadeMap = new Map<number, TimelineEvent[]>()

          visibleMembers.forEach(member => {
            const birthYear = member.birthYear as number
            const decade = Math.floor(birthYear / 10) * 10
            const events = decadeMap.get(decade) ?? []
            events.push(toEvent(member))
            decadeMap.set(decade, events)
          })

          Array.from(decadeMap.entries())
            .sort(([a], [b]) => a - b)
            .forEach(([decade, events]) => {
              groups.push({
                id: String(decade),
                label: `${decade}年代`,
                count: events.length,
                events,
              })
            })
        } else {
          const visibleMembers = membersWithoutYear
            .filter(matchesKeyword)
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

          if (visibleMembers.length > 0) {
            groups.push({
              id: 'missing',
              label: MISSING_YEAR_LABEL,
              count: visibleMembers.length,
              events: visibleMembers.map(toEvent),
            })
          }
        }

        const years = membersWithYear.map(member => member.birthYear as number)
        const firstYear = years.length > 0 ? Math.min(...years) : null
        const lastYear = years.length > 0 ? Math.max(...years) : null
        const totalMembers = familyMembers.length
        const summaryLabel = keyword || filter !== 'all'
          ? ''
          : firstYear === null || lastYear === null
            ? ''
            : firstYear === lastYear
              ? `${firstYear} 年 · ${totalMembers} 位成员`
              : `${firstYear}—${lastYear} · 跨越 ${lastYear - firstYear} 年 · ${totalMembers} 位成员`
        const emptyCopy = buildEmptyCopy(keyword, filter, totalMembers, membersWithoutYear.length)

        this.setData({
          loading: false,
          error: '',
          needsFamily: false,
          hiddenCount: membersWithoutYear.length,
          summaryLabel,
          emptyTitle: emptyCopy.title,
          emptyDesc: emptyCopy.desc,
          familyName: snapshot.family.name,
          memberCount: familyMembers.length,
          dayOfYear,
          groups,
        })
      } catch (error) {
        this.setData({
          loading: false,
          error: '网络不稳定或服务暂时不可用，请稍后再试',
          groups: [],
          summaryLabel: '',
          hiddenCount: 0,
        })
      }
    },

    retry() {
      this.setData({ loading: true, error: '' })
      void this.buildTimeline()
    },

    onSearch(e: WechatMiniprogram.Input) {
      this.setData({ keyword: e.detail.value }, () => { void this.buildTimeline() })
    },

    clearSearch() {
      this.setData({ keyword: '' }, () => { void this.buildTimeline() })
    },

    setFilter(e: WechatMiniprogram.TouchEvent) {
      const { filter } = e.currentTarget.dataset as { filter?: MemberFilter }
      if ((filter !== 'all' && filter !== 'missing') || filter === this.data.filter) return
      this.setData({ filter }, () => { void this.buildTimeline() })
    },

    showMissing() {
      if (this.data.filter === 'missing' && this.data.keyword === '') return
      this.setData({ filter: 'missing', keyword: '' }, () => { void this.buildTimeline() })
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
