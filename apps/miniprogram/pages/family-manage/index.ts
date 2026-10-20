import {
  acceptInvitation, createFamily, createInvitation, createWebLoginCode,
  decideMemberLinkRequest, getActiveFamilyId, getJoinSummary, INVITE_MAX_USES, leaveFamily, listFamilies,
  listMemberLinkRequests, previewInvitation, revokeInvitation,
  type FamilySummary, type MemberLinkRequest,
} from '../../services/api'
import { invalidateFamilyData, switchFamily } from '../../services/familyStore'

const INVITE_CACHE_PREFIX = 'little-family:invite:'
const JOINS_SEEN_PREFIX = 'little-family:joins-seen:'

interface CachedInvite {
  invitationId: string
  code: string
  expiresAt: string
  remainingUses: number
}

const expiryLabel = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} 前`
}

const relativeLabel = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.round(hours / 24)} 天前`
}

Component({
  data: {
    loading: true,
    families: [] as FamilySummary[],
    familyIndex: -1,
    activeFamilyId: '',
    activeFamilyName: '',
    activeRole: '' as FamilySummary['role'] | '',
    activeRoleLabel: '',
    canEdit: false,
    canInvite: false,
    canApproveLink: false,
    linkedMemberId: '',
    linkRequests: [] as MemberLinkRequest[],
    newFamilyName: '',
    inviteInvitationId: '',
    inviteCode: '',
    inviteFamilyId: '',
    inviteRemaining: 0,
    inviteExpiresLabel: '',
    inviteMaxUses: INVITE_MAX_USES,
    inviteCopied: false,
    inviteError: '',
    generatingInvite: false,
    recentJoins: 0,
    lastJoinLabel: '',
    joinCode: '',
    webLoginCode: '',
    webLoginExpiresAt: '',
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
        const role = activeFamily?.role ?? ''
        const canApproveLink = role === 'owner' || role === 'admin'
        const linkRequests = activeFamily && canApproveLink
          ? await listMemberLinkRequests(activeFamily.id)
          : []
        this.setData({
          loading: false,
          families,
          familyIndex,
          activeFamilyId: activeFamily?.id ?? '',
          activeFamilyName: activeFamily?.name ?? '',
          activeRole: role,
          activeRoleLabel: role === 'owner' ? '所有者' : role === 'admin' ? '管理员' : role === 'editor' ? '可编辑' : role === 'viewer' ? '只读' : '',
          canEdit: role === 'owner',
          canInvite: role === 'owner',
          canApproveLink,
          linkedMemberId: activeFamily?.linkedMemberId ?? '',
          linkRequests,
        })
        if (activeFamily) {
          await Promise.all([
            role === 'owner' ? this.ensureInvite(activeFamily.id) : Promise.resolve(),
            this.loadJoinSummary(activeFamily.id),
          ])
        }
      } catch (error) {
        this.setData({ loading: false })
        wx.showToast({ title: error instanceof Error ? error.message : '加载失败', icon: 'none' })
      }
    },

    async loadJoinSummary(familyId: string) {
      try {
        const summary = await getJoinSummary(familyId)
        this.setData({
          recentJoins: summary.recentCount,
          lastJoinLabel: summary.lastJoinedAt ? relativeLabel(summary.lastJoinedAt) : '',
        })
        // 进入本页即视为已读，清掉「我的」页上的小红点。
        if (summary.lastJoinedAt) {
          wx.setStorageSync(`${JOINS_SEEN_PREFIX}${familyId}`, summary.lastJoinedAt)
        }
      } catch {
        this.setData({ recentJoins: 0, lastJoinLabel: '' })
      }
    },

    // 邀请码提前准备好，分享按钮才能一步可用；缓存按家庭隔离，过期即重建。
    readInviteCache(familyId: string): CachedInvite | null {
      const cached = wx.getStorageSync(`${INVITE_CACHE_PREFIX}${familyId}`) as CachedInvite | ''
      if (!cached || !cached.code) return null
      if (new Date(cached.expiresAt).getTime() <= Date.now()) return null
      return cached
    },

    writeInviteCache(familyId: string, invite: CachedInvite) {
      wx.setStorageSync(`${INVITE_CACHE_PREFIX}${familyId}`, invite)
    },

    clearInvite() {
      this.setData({
        inviteInvitationId: '',
        inviteCode: '',
        inviteFamilyId: '',
        inviteRemaining: 0,
        inviteExpiresLabel: '',
        inviteCopied: false,
      })
    },

    async ensureInvite(familyId: string) {
      if (this.data.generatingInvite) return
      if (this.data.inviteCode && this.data.inviteFamilyId === familyId) return
      const cached = this.readInviteCache(familyId)
      if (cached) {
        this.setData({
          inviteInvitationId: cached.invitationId ?? '',
          inviteCode: cached.code,
          inviteFamilyId: familyId,
          inviteRemaining: cached.remainingUses,
          inviteExpiresLabel: expiryLabel(cached.expiresAt),
          inviteError: '',
        })
        void this.refreshInviteRemaining(cached, familyId)
        return
      }
      await this.generateInvite(familyId)
    },

    // 剩余名额会随家人加入变化，回到本页时用预览接口校准；失效则直接换新码。
    async refreshInviteRemaining(cached: CachedInvite, familyId: string) {
      try {
        const preview = await previewInvitation(cached.code)
        const next: CachedInvite = {
          invitationId: cached.invitationId,
          code: cached.code,
          expiresAt: preview.expiresAt,
          remainingUses: preview.remainingUses,
        }
        this.writeInviteCache(familyId, next)
        this.setData({
          inviteRemaining: preview.remainingUses,
          inviteExpiresLabel: expiryLabel(preview.expiresAt),
        })
      } catch {
        wx.removeStorageSync(`${INVITE_CACHE_PREFIX}${familyId}`)
        this.clearInvite()
        await this.generateInvite(familyId)
      }
    },

    async generateInvite(targetFamilyId?: string) {
      const familyId = targetFamilyId || this.data.activeFamilyId
      if (!familyId || this.data.generatingInvite) return
      this.setData({ generatingInvite: true, inviteError: '' })
      try {
        const result = await createInvitation(familyId)
        const remaining = result.maxUses ?? INVITE_MAX_USES
        this.writeInviteCache(familyId, {
          invitationId: result.invitationId,
          code: result.code,
          expiresAt: result.expiresAt,
          remainingUses: remaining,
        })
        this.setData({
          inviteInvitationId: result.invitationId,
          inviteCode: result.code,
          inviteFamilyId: familyId,
          inviteRemaining: remaining,
          inviteExpiresLabel: expiryLabel(result.expiresAt),
          inviteCopied: false,
        })
      } catch (error) {
        this.setData({ inviteError: error instanceof Error ? error.message : '邀请准备失败' })
      } finally {
        this.setData({ generatingInvite: false })
      }
    },

    // 换一个：先作废旧码，再生成新码，避免旧链接继续有效。
    async regenerateInvite() {
      await this.revokeCurrentInvite({ silent: true })
      await this.generateInvite()
    },

    // 作废：不再生成新码，直到用户主动再点「生成邀请」。
    async revokeCurrentInvite(options?: { silent?: boolean }) {
      const familyId = this.data.activeFamilyId
      const invitationId = this.data.inviteInvitationId
      wx.removeStorageSync(`${INVITE_CACHE_PREFIX}${familyId}`)
      this.clearInvite()
      if (!invitationId) return
      try {
        await revokeInvitation(familyId, invitationId)
        if (!options?.silent) wx.showToast({ title: '邀请已作废', icon: 'success' })
      } catch (error) {
        if (!options?.silent) {
          wx.showToast({ title: error instanceof Error ? error.message : '作废失败', icon: 'none' })
        }
      }
    },

    copyInviteCode() {
      const code = this.data.inviteCode
      if (!code) return
      wx.setClipboardData({
        data: code,
        success: () => {
          this.setData({ inviteCopied: true })
          setTimeout(() => this.setData({ inviteCopied: false }), 1500)
        },
      })
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
        this.clearInvite()
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
        this.clearInvite()
        await this.loadData()
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '切换失败', icon: 'none' })
      }
    },

    async decideLinkRequest(e: WechatMiniprogram.TouchEvent) {
      const { id, status } = e.currentTarget.dataset as { id: string; status: 'approved' | 'rejected' }
      try {
        await decideMemberLinkRequest(this.data.activeFamilyId, id, status)
        invalidateFamilyData()
        await this.loadData()
        wx.showToast({ title: status === 'approved' ? '已通过' : '已拒绝', icon: 'success' })
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '处理失败', icon: 'none' })
      }
    },

    onShareAppMessage() {
      const code = this.data.inviteCode
      const current = code && this.data.inviteFamilyId === this.data.activeFamilyId
      if (!current) {
        return {
          title: '小家记 · 记录家人的温暖时光',
          path: '/pages/home/index',
        }
      }
      return {
        title: `${this.data.activeFamilyName} 邀请你一起记录家庭时光`,
        path: `/pages/invite/index?code=${encodeURIComponent(code)}`,
      }
    },

    async generateWebLoginCode() {
      try {
        const result = await createWebLoginCode()
        this.setData({
          webLoginCode: result.code,
          webLoginExpiresAt: result.expiresAt,
        })
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
        wx.showToast({ title: '已加入家庭', icon: 'success' })
      } catch (error) {
        wx.showToast({ title: error instanceof Error ? error.message : '加入失败', icon: 'none' })
      }
    },

    leaveCurrentFamily() {
      if (!this.data.activeFamilyId || this.data.activeRole === 'owner') return
      wx.showModal({
        title: `退出 ${this.data.activeFamilyName}？`,
        content: '退出后将无法继续查看这个家庭，除非再次通过邀请码加入。',
        success: async result => {
          if (!result.confirm) return
          try {
            await leaveFamily(this.data.activeFamilyId)
            invalidateFamilyData()
            this.clearInvite()
            await this.loadData()
            wx.showToast({ title: '已退出家庭', icon: 'success' })
          } catch (error) {
            wx.showToast({ title: error instanceof Error ? error.message : '退出失败', icon: 'none' })
          }
        },
      })
    },
  },
})
