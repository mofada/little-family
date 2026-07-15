import {
  getBirthdaySubscriptionConfig,
  registerBirthdaySubscription,
  type BirthdaySubscriptionConfig,
} from '../services/api'

export const requestBirthdaySubscription = async (
  familyId: string,
): Promise<BirthdaySubscriptionConfig> => {
  const config = await getBirthdaySubscriptionConfig(familyId)
  if (!config.configured || !config.templateId) {
    throw new Error('生日提醒服务尚未配置')
  }
  const result = await new Promise<WechatMiniprogram.RequestSubscribeMessageSuccessCallbackResult>((resolve, reject) => {
    wx.requestSubscribeMessage({
      tmplIds: [config.templateId],
      success: resolve,
      fail: reject,
    })
  })
  if (result[config.templateId] !== 'accept') {
    throw new Error(result[config.templateId] === 'ban' ? '请先在小程序设置中开启订阅消息' : '未同意生日提醒订阅')
  }
  await registerBirthdaySubscription(familyId, config.templateId)
  return getBirthdaySubscriptionConfig(familyId)
}
