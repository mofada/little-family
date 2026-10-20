import { familyMembers, getMemberColor, calculateAge } from '../../utils/familyData'
import { ensureFamilyData } from '../../services/familyStore'

type Member = typeof familyMembers[number]

interface PersonCard {
  id: string
  memberJson: string
  name: string
  relation: string
  meta: string
  ageLabel: string
  avatarText: string
  color: string
  background: string
  isMe: boolean
}

interface GenerationTab {
  generation: number
  label: string
  count: number
  active: boolean
}

Component({
  data: {
    keyword: '',
    totalCount: 0,
    generationCount: 0,
    familyName: '',
    memberCount: 0,
    dayOfYear: 0,
    currentMemberId: '',
    focusId: '',
    focus: null as PersonCard | null,
    focusMemberJson: '',
    parents: [] as PersonCard[],
    spouse: null as PersonCard | null,
    children: [] as PersonCard[],
    siblings: [] as PersonCard[],
    searchResults: [] as PersonCard[],
    generationTabs: [] as GenerationTab[],
    selectedGeneration: 0,
    generationMembers: [] as PersonCard[],
    showModal: false,
    selectedMemberJson: '',
  },

  lifetimes: {
    attached() {
      void this.refreshFamily()
    },
  },

  pageLifetimes: {
    show() {
      void this.refreshFamily()
    },
  },

  methods: {
    async refreshFamily() {
      const now = new Date()
      const dayOfYear = Math.floor(
        (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
          - Date.UTC(now.getFullYear(), 0, 0)) / 86400000
      )
      try {
        const snapshot = await ensureFamilyData()
        const currentMemberId = snapshot?.family.linkedMemberId
          ?? familyMembers.find(member => member.relation === '我自己')?.id
          ?? familyMembers[0]?.id
          ?? ''
        const previousFocusExists = familyMembers.some(member => member.id === this.data.focusId)
        const focusId = previousFocusExists ? this.data.focusId : currentMemberId
        const focusMember = familyMembers.find(member => member.id === focusId)
        this.setData({
          familyName: snapshot?.family.name ?? '',
          memberCount: familyMembers.length,
          dayOfYear,
          currentMemberId,
          focusId,
          selectedGeneration: focusMember?.generation ?? 0,
        }, () => this.buildView())
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
      }
    },

    toCard(member: Member): PersonCard {
      const color = getMemberColor(member)
      const age = calculateAge(member.birthYear)
      const details = [member.nickName, age === null ? '' : `${age}岁`].filter(Boolean)
      return {
        id: member.id,
        memberJson: JSON.stringify(member),
        name: member.name,
        relation: member.relation || '家人',
        meta: details.join(' · ') || '资料待完善',
        ageLabel: age === null ? '年龄待补' : `${age}岁`,
        avatarText: member.name.trim().slice(-1) || '家',
        color,
        background: `${color}16`,
        isMe: member.id === this.data.currentMemberId,
      }
    },

    buildView() {
      const memberById = new Map(familyMembers.map(member => [member.id, member]))
      const focusMember = memberById.get(this.data.focusId)
      const generations = [...new Set(familyMembers.map(member => member.generation))].sort((a, b) => a - b)
      const selectedGeneration = generations.includes(this.data.selectedGeneration)
        ? this.data.selectedGeneration
        : (focusMember?.generation ?? generations[0] ?? 0)
      const generationTabs = generations.map(generation => ({
        generation,
        label: `第 ${generation} 代`,
        count: familyMembers.filter(member => member.generation === generation).length,
        active: generation === selectedGeneration,
      }))

      if (!focusMember) {
        this.setData({
          totalCount: familyMembers.length,
          generationCount: generations.length,
          focus: null,
          parents: [],
          spouse: null,
          children: [],
          siblings: [],
          generationTabs,
          generationMembers: [],
        })
        return
      }

      const spouseMember = focusMember.spouseId ? memberById.get(focusMember.spouseId) : undefined
      const familyParentIds = new Set(focusMember.parentIds)
      const parents = focusMember.parentIds
        .map(parentId => memberById.get(parentId))
        .filter((member): member is Member => member !== undefined)
      const children = familyMembers.filter(member =>
        member.parentIds.includes(focusMember.id)
          || (!!spouseMember && member.parentIds.includes(spouseMember.id)))
      const siblings = familyMembers.filter(member =>
        member.id !== focusMember.id
          && member.id !== spouseMember?.id
          && member.parentIds.some(parentId => familyParentIds.has(parentId)))

      this.setData({
        totalCount: familyMembers.length,
        generationCount: generations.length,
        selectedGeneration,
        focus: this.toCard(focusMember),
        focusMemberJson: JSON.stringify(focusMember),
        parents: parents.map(member => this.toCard(member)),
        spouse: spouseMember ? this.toCard(spouseMember) : null,
        children: children.map(member => this.toCard(member)),
        siblings: siblings.map(member => this.toCard(member)),
        generationTabs,
        generationMembers: familyMembers
          .filter(member => member.generation === selectedGeneration)
          .map(member => this.toCard(member)),
      })
    },

    buildSearchResults(keyword: string) {
      const normalized = keyword.trim().toLowerCase()
      const searchResults = normalized
        ? familyMembers
            .filter(member => [member.name, member.nickName ?? '', member.relation]
              .join('|')
              .toLowerCase()
              .includes(normalized))
            .slice(0, 12)
            .map(member => this.toCard(member))
        : []
      this.setData({ searchResults })
    },

    onSearch(event: WechatMiniprogram.Input) {
      const keyword = event.detail.value
      this.setData({ keyword })
      this.buildSearchResults(keyword)
    },

    onClearSearch() {
      this.setData({ keyword: '', searchResults: [] })
    },

    onFocusMember(event: WechatMiniprogram.TouchEvent) {
      const id = (event.currentTarget.dataset as { id: string }).id
      const member = familyMembers.find(candidate => candidate.id === id)
      if (!member) return
      this.setData({
        focusId: id,
        selectedGeneration: member.generation,
        keyword: '',
        searchResults: [],
      }, () => this.buildView())
    },

    onBackToMe() {
      if (!this.data.currentMemberId) {
        wx.showToast({ title: '暂未关联家庭成员', icon: 'none' })
        return
      }
      const member = familyMembers.find(candidate => candidate.id === this.data.currentMemberId)
      this.setData({
        focusId: this.data.currentMemberId,
        selectedGeneration: member?.generation ?? this.data.selectedGeneration,
      }, () => this.buildView())
    },

    onSelectGeneration(event: WechatMiniprogram.TouchEvent) {
      const generation = Number((event.currentTarget.dataset as { generation: number }).generation)
      this.setData({ selectedGeneration: generation }, () => this.buildView())
    },

    onOpenFocusModal() {
      if (!this.data.focusMemberJson) return
      this.setData({ showModal: true, selectedMemberJson: this.data.focusMemberJson })
    },

    onModalClose() {
      this.setData({ showModal: false, selectedMemberJson: '' })
    },
  },
})
