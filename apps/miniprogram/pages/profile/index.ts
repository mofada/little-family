import {
  familyMembers, getMemberColor, calculateAge, getDaysUntilBirthday
} from '../../utils/familyData'
import {
  ensureFamilyData, refreshFamilyKinshipLabels, switchFamily
} from '../../services/familyStore'
import { listFamilies, getJoinSummary, type FamilySummary } from '../../services/api'
import { FamilyMember } from '../../types/family'

interface MeData {
  id: string
  name: string
  avatarText: string
  color: string
  meta: string
  birthdayLabel: string
  countdownLabel: string
  isBirthdayToday: boolean
}

interface KinGroup {
  key: string
  label: string
  members: RelativeChip[]
}

interface RelativeChip {
  id: string
  name: string
  group: string
  avatarText: string
  color: string
  memberJson: string
}

const SELF_RELATIONS = ['自己', '我自己']

const birthdayLabel = (member: FamilyMember): string => {
  if (!member.birthdayType || member.birthMonth === null || member.birthDay === null) return '生日未记'
  const calendar = member.birthdayType === 'lunar'
    ? (member.isLeapMonth ? '农历闰' : '农历')
    : '阳历'
  return `${calendar}${member.birthMonth}月${member.birthDay}日`
}

const toChip = (member: FamilyMember, group: string): RelativeChip => ({
  id: member.id,
  name: member.name,
  group,
  avatarText: member.name.slice(-1),
  color: getMemberColor(member),
  memberJson: JSON.stringify(member),
})

Component({
  data: {
    loading: true,
    hasFamily: false,
    me: null as MeData | null,
    kinGroups: [] as KinGroup[],
    familyId: '',
    familyName: '',
    memberCount: 0,
    dayOfYear: 0,
    linkedMemberId: '',
    families: [] as FamilySummary[],
    refreshingKinship: false,
    switchingFamily: false,
    hasNewJoins: false,
    showModal: false,
    selectedMemberJson: '',
  },
  lifetimes: {
    attached() { void this.loadData() }
  },
  pageLifetimes: {
    show() {
      void this.loadData()
    }
  },
  methods: {
    async loadData() {
      const now = new Date()
      const dayOfYear = Math.floor(
        (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
          - Date.UTC(now.getFullYear(), 0, 0)) / 86400000
      )
      try {
        const [snapshot, families] = await Promise.all([ensureFamilyData(), listFamilies()])
        if (!snapshot) {
          this.setData({
            loading: false,
            hasFamily: false,
            me: null,
            kinGroups: [],
            familyId: '',
            familyName: '',
            memberCount: 0,
            dayOfYear,
            linkedMemberId: '',
            families,
          })
          return
        }

        const familyId = snapshot.family.id
        void this.checkNewJoins(familyId)
        const linkedId = snapshot.family.linkedMemberId ?? ''

        if (familyMembers.length === 0) {
          this.setData({
            loading: false,
            hasFamily: true,
            me: null,
            kinGroups: [],
            familyId,
            familyName: snapshot.family.name,
            memberCount: 0,
            dayOfYear,
            linkedMemberId: linkedId,
            families,
          })
          return
        }

        const me = familyMembers.find(member => member.id === linkedId)
          ?? familyMembers.find(member => member.relation === '我自己')
          ?? familyMembers[0]

        const age = calculateAge(me.birthYear)
        const daysUntilBirthday = getDaysUntilBirthday(me)
        const relationText = me.relation && !SELF_RELATIONS.includes(me.relation)
          ? me.relation
          : snapshot.family.name

        const meData: MeData = {
          id: me.id,
          name: me.name,
          avatarText: me.name.slice(-1),
          color: getMemberColor(me),
          meta: [relationText, age === null ? '年龄未知' : `${age} 岁`].filter(Boolean).join(' · '),
          birthdayLabel: birthdayLabel(me),
          countdownLabel: daysUntilBirthday === null
            ? ''
            : (daysUntilBirthday === 0 ? '今天生日' : `还剩 ${daysUntilBirthday} 天`),
          isBirthdayToday: daysUntilBirthday === 0,
        }

        const parents = me.parentIds
          .map(parentId => familyMembers.find(member => member.id === parentId))
          .filter((member): member is FamilyMember => Boolean(member))

        const spouse = me.spouseId
          ? familyMembers.find(member => member.id === me.spouseId)
          : undefined

        const siblings = familyMembers.filter(member =>
          member.id !== me.id
          && member.parentIds.some(parentId => me.parentIds.includes(parentId)))

        const children = familyMembers.filter(member =>
          member.parentIds.includes(me.id)
          || (me.spouseId !== null && member.parentIds.includes(me.spouseId)))

        const kinGroups: KinGroup[] = [
          { key: 'parents', label: '父母', members: parents.map(member => toChip(member, '父母')) },
          { key: 'spouse', label: '配偶', members: spouse ? [toChip(spouse, '配偶')] : [] },
          { key: 'siblings', label: '兄弟姐妹', members: siblings.map(member => toChip(member, '兄弟姐妹')) },
          { key: 'children', label: '子女', members: children.map(member => toChip(member, '子女')) },
        ].filter(group => group.members.length > 0)

        this.setData({
          loading: false,
          hasFamily: true,
          me: meData,
          kinGroups,
          familyId,
          familyName: snapshot.family.name,
          memberCount: familyMembers.length,
          dayOfYear,
          linkedMemberId: linkedId,
          families,
        })
      } catch (error) {
        this.setData({ loading: false })
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
      }
    },

    // 有未读的“有人加入”时在设置入口上点一个红点；进入家庭管理即视为已读。
    async checkNewJoins(familyId: string) {
      if (!familyId) {
        this.setData({ hasNewJoins: false })
        return
      }
      try {
        const summary = await getJoinSummary(familyId)
        const seen = wx.getStorageSync(`little-family:joins-seen:${familyId}`) as string
        this.setData({
          hasNewJoins: Boolean(summary.lastJoinedAt && summary.lastJoinedAt !== seen),
        })
      } catch {
        this.setData({ hasNewJoins: false })
      }
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

    openFamilySwitcher() {
      const { families, familyId, switchingFamily } = this.data
      if (switchingFamily || families.length < 2) return
      // 微信操作面板最多展示 6 项，家庭更多时回到家庭管理页切换。
      if (families.length > 6) {
        wx.navigateTo({ url: '/pages/family-manage/index' })
        return
      }
      wx.showActionSheet({
        itemList: families.map(family => (family.id === familyId ? `${family.name}（当前）` : family.name)),
        success: result => { void this.switchToFamily(result.tapIndex) },
      })
    },

    async switchToFamily(index: number) {
      const family = this.data.families[index]
      if (!family || family.id === this.data.familyId) return
      this.setData({ switchingFamily: true })
      wx.showLoading({ title: '正在切换' })
      try {
        await switchFamily(family)
        await this.loadData()
        wx.hideLoading()
        wx.showToast({ title: `已切换到${family.name}`, icon: 'none' })
      } catch (error) {
        wx.hideLoading()
        wx.showToast({ title: error instanceof Error ? error.message : '切换失败', icon: 'none' })
      } finally {
        this.setData({ switchingFamily: false })
      }
    },

    async refreshKinship() {
      if (!this.data.familyId || this.data.refreshingKinship) return
      if (!this.data.linkedMemberId) {
        wx.showToast({ title: '请先在家庭管理中把成员设为我', icon: 'none' })
        return
      }
      this.setData({ refreshingKinship: true })
      wx.showLoading({ title: '刷新称呼中' })
      try {
        await refreshFamilyKinshipLabels()
        await this.loadData()
        wx.hideLoading()
        wx.showToast({ title: '称呼已刷新', icon: 'success' })
      } catch (error) {
        wx.hideLoading()
        wx.showToast({ title: error instanceof Error ? error.message : '刷新失败', icon: 'none' })
      } finally {
        this.setData({ refreshingKinship: false })
      }
    },
  }
})
