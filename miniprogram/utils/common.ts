export const formatDate = (date: Date): string => {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const w = weekdays[date.getDay()]
  return `${y}年${m}月${d}日 周${w}`
}

export const formatTime = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth()+1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export const copyToClipboard = (text: string, successMsg = '已复制'): void => {
  wx.setClipboardData({
    data: text,
    success: () => {
      wx.showToast({ title: successMsg, icon: 'success', duration: 1500 })
    },
  })
}
