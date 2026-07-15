import { generateBirthdayWish } from '../services/api'
import { FamilyMember } from '../types/family'
import { buildBirthdayPrompt } from './familyData'
import { copyToClipboard } from './common'

export const generateAndCopyBirthdayWish = async (
  familyId: string,
  member: FamilyMember,
): Promise<void> => {
  wx.showLoading({ title: '正在生成祝福…', mask: true })
  try {
    const wish = await generateBirthdayWish(familyId, member.id)
    wx.hideLoading()
    copyToClipboard(wish, '生日祝福已复制')
  } catch {
    wx.hideLoading()
    copyToClipboard(buildBirthdayPrompt(member), '生成失败，已复制提示词')
  }
}
