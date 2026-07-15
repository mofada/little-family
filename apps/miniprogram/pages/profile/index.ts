import {
  familyMembers, getMemberColor, calculateAge, getDaysUntilBirthday, findRelationPath
} from '../../utils/familyData'
import { ensureFamilyData } from '../../services/familyStore'

interface MeData {
  id: string
  name: string
  relation: string
  color: string
  birthYear: number | null
  age: number | null
  gender: string
  birthdayType: string | null
  birthMonth: number | null
  birthDay: number | null
  isLeapMonth: boolean
  daysUntilBirthday: number | null
  memberJson: string
}

interface RelativeItem {
  id: string
  name: string
  relation: string
  color: string
  gender: string
  memberJson: string
}

interface MemberOption {
  id: string
  name: string
  relation: string
}

interface PathStep {
  name: string
  relation: string
  color: string
}

Component({
  data: {
    me: null as MeData | null,
    parents: [] as RelativeItem[],
    spouse: null as RelativeItem | null,
    siblings: [] as RelativeItem[],
    children: [] as RelativeItem[],
    statsTotal: familyMembers.length,
    birthdayRecorded: 0,
    relationRecorded: 0,
    completeness: 0,
    // 关系查询
    memberOptions: [] as MemberOption[],
    fromMemberId: '',
    fromMemberIdx: -1,
    toMemberId: '',
    toMemberIdx: -1,
    relationPath: [] as PathStep[],
    pathFound: false,
    pathSearched: false,
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
      try {
      const snapshot = await ensureFamilyData()
      if (!snapshot || familyMembers.length === 0) {
        this.setData({ me: null, parents: [], spouse: null, siblings: [], children: [], statsTotal: 0 })
        return
      }
      const linkedId = snapshot.family.linkedMemberId
      const me = familyMembers.find(m => m.id === linkedId)
        ?? familyMembers.find(m => m.relation === '我自己')
        ?? familyMembers[0]
      const meDays = getDaysUntilBirthday(me)

      const meData: MeData = {
        id: me.id,
        name: me.name,
        relation: me.relation,
        color: getMemberColor(me),
        birthYear: me.birthYear,
        age: calculateAge(me.birthYear),
        gender: me.gender,
        birthdayType: me.birthdayType,
        birthMonth: me.birthMonth,
        birthDay: me.birthDay,
        isLeapMonth: me.isLeapMonth ?? false,
        daysUntilBirthday: meDays,
        memberJson: JSON.stringify(me),
      }

      // Parents
      const parents: RelativeItem[] = me.parentIds
        .map(parentId => familyMembers.find(m => m.id === parentId))
        .filter((m): m is typeof familyMembers[0] => !!m)
        .map(m => ({
          id: m.id,
          name: m.name,
          relation: m.relation,
          color: getMemberColor(m),
          gender: m.gender,
          memberJson: JSON.stringify(m),
        }))

      // Spouse
      const spouseRaw = me.spouseId ? familyMembers.find(m => m.id === me.spouseId) : undefined
      const spouse: RelativeItem | null = spouseRaw
        ? {
            id: spouseRaw.id,
            name: spouseRaw.name,
            relation: spouseRaw.relation,
            color: getMemberColor(spouseRaw),
            gender: spouseRaw.gender,
            memberJson: JSON.stringify(spouseRaw),
          }
        : null

      // Siblings (same parent, not me)
      const siblings: RelativeItem[] = familyMembers
        .filter(m => m.id !== me.id && m.parentIds.some(parentId => me.parentIds.includes(parentId)))
        .map(m => ({
          id: m.id,
          name: m.name,
          relation: m.relation,
          color: getMemberColor(m),
          gender: m.gender,
          memberJson: JSON.stringify(m),
        }))

      // Children
      const children: RelativeItem[] = familyMembers
        .filter(m => m.parentIds.includes(me.id) || (me.spouseId !== null && m.parentIds.includes(me.spouseId)))
        .map(m => ({
          id: m.id,
          name: m.name,
          relation: m.relation,
          color: getMemberColor(m),
          gender: m.gender,
          memberJson: JSON.stringify(m),
        }))

      const birthdayRecorded = familyMembers.filter(m => m.birthdayType && m.birthMonth !== null && m.birthDay !== null).length
      const relationRecorded = familyMembers.filter(m => m.parentIds.length > 0 || m.spouseId !== null).length
      const completeFields = birthdayRecorded + relationRecorded
      const completeness = familyMembers.length > 0
        ? Math.round(completeFields / (familyMembers.length * 2) * 100)
        : 0

      // Member options for picker
      const memberOptions = familyMembers.map(m => ({
        id: m.id,
        name: `${m.name}（${m.relation}）`,
        relation: m.relation,
      }))
      const fromIdx = memberOptions.findIndex(o => o.id === me.id)

      this.setData({
        me: meData,
        parents,
        spouse,
        siblings,
        children,
        statsTotal: familyMembers.length,
        birthdayRecorded,
        relationRecorded,
        completeness,
        memberOptions,
        fromMemberId: me.id,
        fromMemberIdx: fromIdx,
        toMemberIdx: -1,
      })
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
      }
    },

    onFromChange(e: WechatMiniprogram.PickerChange) {
      const idx = Number(e.detail.value)
      const opts = this.data.memberOptions
      this.setData({ fromMemberId: opts[idx].id, fromMemberIdx: idx, pathSearched: false })
    },

    onToChange(e: WechatMiniprogram.PickerChange) {
      const idx = Number(e.detail.value)
      const opts = this.data.memberOptions
      this.setData({ toMemberId: opts[idx].id, toMemberIdx: idx, pathSearched: false })
    },

    findPath() {
      const { fromMemberId, toMemberId } = this.data
      if (!fromMemberId || !toMemberId) {
        wx.showToast({ title: '请选择两位成员', icon: 'none' })
        return
      }
      if (fromMemberId === toMemberId) {
        wx.showToast({ title: '请选择不同成员', icon: 'none' })
        return
      }
      const path = findRelationPath(fromMemberId, toMemberId)
      const relationPath: PathStep[] = path.map(m => ({
        name: m.name,
        relation: m.relation,
        color: getMemberColor(m),
      }))
      this.setData({
        relationPath,
        pathFound: path.length > 0,
        pathSearched: true,
      })
    },

    onMemberTap(e: WechatMiniprogram.TouchEvent) {
      const json = (e.currentTarget.dataset as { json: string }).json
      this.setData({ showModal: true, selectedMemberJson: json })
    },

    onModalClose() {
      this.setData({ showModal: false, selectedMemberJson: '' })
    },

    manageFamily() {
      wx.navigateTo({ url: '/pages/family-manage/index' })
    },
  }
})
