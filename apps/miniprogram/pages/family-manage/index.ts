import {
  acceptInvitation, createFamily, createInvitation, deleteMember,
  getActiveFamilyId, linkCurrentUser, listFamilies, type FamilySummary,
} from '../../services/api'
import { ensureFamilyData, invalidateFamilyData, switchFamily } from '../../services/familyStore'

interface MemberItem {
  id: string
  name: string
  relation: string
  branchName: string
  memberJson: string
}

Component({
  data: {
    loading: true,
    families: [] as FamilySummary[],
    familyIndex: -1,
    activeFamilyId: '',
    activeFamilyName: '',
    activeRole: '' as FamilySummary['role'] | '',
    canEdit: false,
    canInvite: false,
    linkedMemberId: '',
    members: [] as MemberItem[],
    newFamilyName: '',
    inviteCode: '',
    joinCode: '',
  },
  lifetimes: {
    attached() { void this.loadData() },
  },
  pageLifetimes: {
    show() { void this.loadData() },
  },
  methods: {
    async loadData() {
      try {
        const families = await listFamilies()
        const activeId = getActiveFamilyId()
        const familyIndex = families.findIndex(item => item.id === activeId)
        const activeFamily = families[familyIndex]
        const snapshot = activeFamily ? await ensureFamilyData(true) : null
        const members = (snapshot?.members ?? []).map(member => ({
          id: member.id,
          name: member.name,
          relation: member.relation,
          branchName: member.familyName,
          memberJson: JSON.stringify(member),
        }))
        const role = activeFamily?.role ?? ''
        this.setData({
          loading: false,
          families,
          familyIndex,
          activeFamilyId: activeFamily?.id ?? '',
          activeFamilyName: activeFamily?.name ?? '',
          activeRole: role,
          canEdit: role === 'owner' || role === 'admin' || role === 'editor',
          canInvite: role === 'owner' || role === 'admin',
          linkedMemberId: activeFamily?.linkedMemberId ?? snapshot?.family.linkedMemberId ?? '',
          members,
        })
      } catch (error) {
        this.setData({ loading: false })
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
      }
    },

    onFamilyNameInput(e: WechatMiniprogram.Input) {
      this.setData({ newFamilyName: e.detail.value })
    },

    async createFamily() {
      const name = this.data.newFamilyName.trim()
      if (!name) {
        wx.showToast({ title: '请输入家庭名称', icon: 'none' })
        return
      }
      try {
        await createFamily(name)
        invalidateFamilyData()
        this.setData({ newFamilyName: '' })
        await this.loadData()
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '创建失败', icon: 'none' })
      }
    },

    async onFamilyChange(e: WechatMiniprogram.PickerChange) {
      const family = this.data.families[Number(e.detail.value)]
      if (!family) return
      try {
        await switchFamily(family)
        await this.loadData()
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '切换失败', icon: 'none' })
      }
    },

    startAdd() {
      wx.removeStorageSync('little-family:editing-member')
      wx.navigateTo({ url: '/pages/member-edit/index' })
    },

    editMember(e: WechatMiniprogram.TouchEvent) {
      wx.setStorageSync('little-family:editing-member', (e.currentTarget.dataset as { json: string }).json)
      wx.navigateTo({ url: '/pages/member-edit/index' })
    },

    async setAsMe(e: WechatMiniprogram.TouchEvent) {
      const memberId = (e.currentTarget.dataset as { id: string }).id
      try {
        await linkCurrentUser(this.data.activeFamilyId, memberId)
        await this.loadData()
        wx.showToast({ title: '已设为我', icon: 'success' })
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '设置失败', icon: 'none' })
      }
    },

    removeMember(e: WechatMiniprogram.TouchEvent) {
      const { id, name } = e.currentTarget.dataset as { id: string; name: string }
      wx.showModal({
        title: `删除 ${name}？`,
        content: '相关亲缘关系也会一并删除，此操作无法撤销。',
        success: async result => {
          if (!result.confirm) return
          try {
            await deleteMember(this.data.activeFamilyId, id)
            invalidateFamilyData()
            await this.loadData()
          } catch (error) {
            wx.showToast({ title: error instanceof Error ? error.message : '删除失败', icon: 'none' })
          }
        },
      })
    },

    async generateInvite() {
      try {
        const result = await createInvitation(this.data.activeFamilyId)
        this.setData({ inviteCode: result.code })
        wx.setClipboardData({ data: result.code })
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '生成失败', icon: 'none' })
      }
    },

    onJoinCodeInput(e: WechatMiniprogram.Input) {
      this.setData({ joinCode: e.detail.value })
    },

    async joinFamily() {
      const code = this.data.joinCode.trim()
      if (!code) {
        wx.showToast({ title: '请输入邀请码', icon: 'none' })
        return
      }
      try {
        await acceptInvitation(code)
        invalidateFamilyData()
        this.setData({ joinCode: '' })
        await this.loadData()
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '加入失败', icon: 'none' })
      }
    },
  },
})
