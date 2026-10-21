import { generateBirthdayWish } from '../../services/api'
import type { FamilyMember } from '../../types/family'

Component({
  data: {
    show: false,
    generating: false,
    wish: '',
    error: '',
    familyId: '',
    member: null as FamilyMember | null,
    memberName: '',
    generationId: 0,
    wishHistory: [] as string[],
  },
  methods: {
    open(familyId: string, member: FamilyMember) {
      const generationId = this.data.generationId + 1
      this.setData({
        show: true,
        generating: true,
        wish: '',
        error: '',
        familyId,
        member,
        memberName: member.name,
        generationId,
        wishHistory: [],
      })
      void this.loadWish(generationId)
    },
    async loadWish(generationId?: number) {
      const { familyId, member, wishHistory } = this.data
      if (!familyId || !member) return
      const requestId = generationId ?? this.data.generationId + 1
      if (generationId === undefined) {
        this.setData({ generationId: requestId, generating: true, error: '' })
      }
      try {
        const wish = await generateBirthdayWish(familyId, member.id, wishHistory)
        if (!this.data.show || this.data.generationId !== requestId) return
        const nextHistory = [wish, ...this.data.wishHistory.filter(item => item !== wish)].slice(0, 3)
        this.setData({ wish, wishHistory: nextHistory, generating: false, error: '' })
      } catch (error) {
        if (!this.data.show || this.data.generationId !== requestId) return
        this.setData({
          generating: false,
          error: error instanceof Error ? error.message : '祝福生成失败，请稍后重试',
        })
      }
    },
    regenerate() {
      if (this.data.generating) return
      void this.loadWish()
    },
    copyWish() {
      const { wish, generating } = this.data
      if (!wish || generating) return
      wx.setClipboardData({
        data: wish,
        success: () => {
          wx.showToast({ title: '祝福已复制', icon: 'success' })
        },
        fail: () => {
          wx.showToast({ title: '复制失败，请长按祝福文字复制', icon: 'none' })
        },
      })
    },
    close() {
      this.setData({ show: false, generationId: this.data.generationId + 1 })
    },
    onMaskTap() {
      this.close()
    },
    onContentTap() {
      // 阻止点击弹层内容时关闭弹窗
    },
  },
})
