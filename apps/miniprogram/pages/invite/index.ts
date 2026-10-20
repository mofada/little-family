import { acceptInvitation, previewInvitation, type InvitationPreview } from '../../services/api'
import { invalidateFamilyData } from '../../services/familyStore'

const expiryLabel = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} 前`
}

Component({
  data: {
    code: '',
    loading: true,
    preview: null as InvitationPreview | null,
    familyInitial: '',
    expiresLabel: '',
    errorMessage: '',
    accepting: false,
    joinedName: '',
  },
  methods: {
    onLoad(options: Record<string, string | undefined>) {
      const code = options.code?.trim() ?? ''
      if (!code) {
        this.setData({ loading: false, errorMessage: '邀请链接不完整，请让家人重新发一个' })
        return
      }
      this.setData({ code })
      void this.loadPreview()
    },

    async loadPreview() {
      if (!this.data.code) return
      this.setData({ loading: true, errorMessage: '' })
      try {
        const preview = await previewInvitation(this.data.code)
        this.setData({
          loading: false,
          preview,
          familyInitial: preview.familyName.trim().slice(0, 1) || '家',
          expiresLabel: expiryLabel(preview.expiresAt),
        })
      } catch {
        this.setData({
          loading: false,
          preview: null,
          errorMessage: '这个邀请已失效或名额已用完，请让家人重新发一个',
        })
      }
    },

    async acceptInvite() {
      const preview = this.data.preview
      if (!this.data.code || !preview || this.data.accepting) return
      this.setData({ accepting: true, errorMessage: '' })
      try {
        await acceptInvitation(this.data.code)
        invalidateFamilyData()
        this.setData({ preview: null, joinedName: preview.familyName })
      } catch (error) {
        this.setData({ errorMessage: error instanceof Error ? error.message : '加入失败，请稍后重试' })
      } finally {
        this.setData({ accepting: false })
      }
    },

    goHome() {
      wx.switchTab({ url: '/pages/home/index' })
    },
  },
})
