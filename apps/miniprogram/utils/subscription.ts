const SUBSCRIBE_TEMPLATE_IDS = {
  // 在微信公众平台 -> 订阅消息中复制模板ID后填入。
  birthday: 'OhV_kgQpH3QTbt54oLP5qFDJzOtlehLzP1D2jhLYktA',
  anniversary: '4Hd2RmOKkWxhOzvP_ZTIKYaCiCorerofM0yPpydIdRg',
}

export interface SubscribeRequestOptions {
  scene: 'birthday-page' | 'profile-page' | 'member-modal'
  memberName?: string
}

export interface SubscribeRequestResult {
  configured: boolean
  templateIds: string[]
  acceptedIds: string[]
  rejectedIds: string[]
  bannedIds: string[]
}

const uniq = (arr: string[]) => Array.from(new Set(arr))

export const getConfiguredSubscribeTemplateIds = (): string[] => {
  const ids = Object.values(SUBSCRIBE_TEMPLATE_IDS)
    .map((id) => id.trim())
    .filter(Boolean)
  return uniq(ids)
}

export const isSubscribeTemplateConfigured = (): boolean => getConfiguredSubscribeTemplateIds().length > 0

export const openSubscribeSettingPanel = (): void => {
  wx.openSetting({
    withSubscriptions: true,
    success: () => {
      wx.showToast({ title: '已打开消息设置', icon: 'none' })
    },
    fail: () => {
      wx.showToast({ title: '打开设置失败', icon: 'none' })
    },
  })
}

const parseSubscribeResult = (
  templateIds: string[],
  result: WechatMiniprogram.RequestSubscribeMessageSuccessCallbackResult,
): SubscribeRequestResult => {
  const acceptedIds: string[] = []
  const rejectedIds: string[] = []
  const bannedIds: string[] = []

  for (const id of templateIds) {
    const status = result[id]
    if (status === 'accept') {
      acceptedIds.push(id)
      continue
    }
    if (status === 'ban') {
      bannedIds.push(id)
      continue
    }
    if (status === 'reject') {
      rejectedIds.push(id)
    }
  }

  return {
    configured: templateIds.length > 0,
    templateIds,
    acceptedIds,
    rejectedIds,
    bannedIds,
  }
}

export const requestFamilySubscribe = (
  options: SubscribeRequestOptions,
): Promise<SubscribeRequestResult> => {
  const templateIds = getConfiguredSubscribeTemplateIds()
  if (templateIds.length === 0) {
    wx.showModal({
      title: '未配置模板ID',
      content: '请先在 utils/subscription.ts 中填写模板ID，再发起订阅。',
      showCancel: false,
    })
    return Promise.resolve({
      configured: false,
      templateIds: [],
      acceptedIds: [],
      rejectedIds: [],
      bannedIds: [],
    })
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: templateIds,
      success: (res) => {
        const parsed = parseSubscribeResult(templateIds, res)

        if (parsed.acceptedIds.length > 0) {
          const title = options.memberName
            ? `已订阅 ${options.memberName} 的提醒`
            : '订阅成功'
          wx.showToast({ title, icon: 'success' })
        } else if (parsed.bannedIds.length > 0) {
          wx.showModal({
            title: '消息已被关闭',
            content: '请到右上角设置中打开“接收订阅消息”后重试。',
            showCancel: false,
          })
        } else {
          wx.showToast({ title: '未授权订阅', icon: 'none' })
        }

        resolve(parsed)
      },
      fail: () => {
        wx.showToast({ title: '订阅请求失败', icon: 'none' })
        resolve({
          configured: true,
          templateIds,
          acceptedIds: [],
          rejectedIds: templateIds,
          bannedIds: [],
        })
      },
    })
  })
}
