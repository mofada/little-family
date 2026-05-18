import {
  familyMembers, getFamilyColor, calculateAge, getDaysUntilBirthday,
  getFamilyBranches, findRelationPath
} from '../../utils/familyData'
import {
  requestFamilySubscribe,
  openSubscribeSettingPanel,
  getConfiguredSubscribeTemplateIds,
} from '../../utils/subscription'

interface MeData {
  id: string
  name: string
  relation: string
  familyName: string
  color: string
  birthYear: number | null
  age: number | null
  gender: string
  birthdayType: string
  birthMonth: number
  birthDay: number
  daysUntilBirthday: number
  memberJson: string
}

interface RelativeItem {
  id: string
  name: string
  relation: string
  familyName: string
  color: string
  gender: string
  memberJson: string
}

interface BranchItem {
  name: string
  color: string
  count: number
}

interface MemberOption {
  id: string
  name: string
  relation: string
}

interface PathStep {
  name: string
  relation: string
  familyName: string
  color: string
}

Component({
  data: {
    me: null as MeData | null,
    parents: [] as RelativeItem[],
    spouse: null as RelativeItem | null,
    siblings: [] as RelativeItem[],
    children: [] as RelativeItem[],
    statsTotal: 47,
    statsFamilies: 0,
    statsBranches: [] as BranchItem[],
    // 关系查询
    memberOptions: [] as MemberOption[],
    fromMemberId: '',
    fromMemberIdx: -1,
    toMemberId: '',
    toMemberIdx: -1,
    relationPath: [] as PathStep[],
    pathFound: false,
    pathSearched: false,
    subscribeTemplateCount: 0,
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
    loadData() {
      const me = familyMembers.find(m => m.id === '121')!
      const meDays = getDaysUntilBirthday(me)

      const meData: MeData = {
        id: me.id,
        name: me.name,
        relation: me.relation,
        familyName: me.familyName,
        color: getFamilyColor(me.familyName),
        birthYear: me.birthYear,
        age: calculateAge(me.birthYear),
        gender: me.gender,
        birthdayType: me.birthdayType,
        birthMonth: me.birthMonth,
        birthDay: me.birthDay,
        daysUntilBirthday: meDays,
        memberJson: JSON.stringify(me),
      }

      // Parents
      const directParent = familyMembers.find(m => m.id === me.parentId)
      const otherParent = directParent?.spouseId
        ? familyMembers.find(m => m.id === directParent.spouseId)
        : undefined
      const parents: RelativeItem[] = [directParent, otherParent]
        .filter((m): m is typeof familyMembers[0] => !!m)
        .map(m => ({
          id: m.id,
          name: m.name,
          relation: m.relation,
          familyName: m.familyName,
          color: getFamilyColor(m.familyName),
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
            familyName: spouseRaw.familyName,
            color: getFamilyColor(spouseRaw.familyName),
            gender: spouseRaw.gender,
            memberJson: JSON.stringify(spouseRaw),
          }
        : null

      // Siblings (same parent, not me)
      const siblings: RelativeItem[] = familyMembers
        .filter(m => m.parentId === me.parentId && m.id !== me.id && me.parentId !== null)
        .map(m => ({
          id: m.id,
          name: m.name,
          relation: m.relation,
          familyName: m.familyName,
          color: getFamilyColor(m.familyName),
          gender: m.gender,
          memberJson: JSON.stringify(m),
        }))

      // Children
      const children: RelativeItem[] = familyMembers
        .filter(m => m.parentId === me.id || (me.spouseId !== null && m.parentId === me.spouseId))
        .map(m => ({
          id: m.id,
          name: m.name,
          relation: m.relation,
          familyName: m.familyName,
          color: getFamilyColor(m.familyName),
          gender: m.gender,
          memberJson: JSON.stringify(m),
        }))

      // Family stats
      const branches = getFamilyBranches()
      const branchMap = new Map<string, number>()
      familyMembers.forEach(m => {
        branchMap.set(m.familyName, (branchMap.get(m.familyName) ?? 0) + 1)
      })
      const statsBranches: BranchItem[] = branches.map(name => ({
        name,
        color: getFamilyColor(name),
        count: branchMap.get(name) ?? 0,
      })).sort((a, b) => b.count - a.count)

      // Member options for picker
      const memberOptions = familyMembers.map(m => ({
        id: m.id,
        name: `${m.name}（${m.relation}）`,
        relation: m.relation,
      }))
      const fromIdx = memberOptions.findIndex(o => o.id === '121')

      this.setData({
        me: meData,
        parents,
        spouse,
        siblings,
        children,
        statsFamilies: branches.length,
        statsBranches,
        memberOptions,
        fromMemberId: '121',
        fromMemberIdx: fromIdx,
        toMemberIdx: -1,
        subscribeTemplateCount: getConfiguredSubscribeTemplateIds().length,
      })
    },

    subscribeNow() {
      void requestFamilySubscribe({ scene: 'profile-page' })
    },

    openSubscribeSettings() {
      openSubscribeSettingPanel()
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
        familyName: m.familyName,
        color: getFamilyColor(m.familyName),
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
  }
})
