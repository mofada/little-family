import { acceptInvitation } from '../../services/api'
import { ensureFamilyData, invalidateFamilyData } from '../../services/familyStore'

Component({
  data: {
    code: '',
    accepting: false,
    errorMessage: '',
  },
  methods: {
    onLoad(options: Record<string, string | undefined>) {
      const code = options.code?.trim() ?? ''
      this.setData({
        code,
        errorMessage: code ? '' : '邀请链接不完整，请让亲人重新发送邀请',
      })
    },

    async acceptInvite() {
      if (!this.data.code || this.data.accepting) return
      this.setData({ accepting: true, errorMessage: '' })
      try {
        await acceptInvitation(this.data.code)
        invalidateFamilyData()
        await ensureFamilyData(true)
        wx.showModal({
          title: '加入成功',
          content: '现在可以和亲人一起记录家庭成员与重要时光了。',
          showCancel: false,
          success: () => { wx.switchTab({ url: '/pages/home/index' }) },
        })
      } catch (error) {
        this.setData({
          errorMessage: error instanceof Error ? error.message : '加入失败，请稍后重试',
        })
      } finally {
        this.setData({ accepting: false })
      }
    },

    goHome() {
      wx.switchTab({ url: '/pages/home/index' })
    },
  },
})
