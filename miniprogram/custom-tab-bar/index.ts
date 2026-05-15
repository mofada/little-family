Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/index',     text: '首页',  icon: '🏠', activeIcon: '🏡' },
      { pagePath: '/pages/tree/index',     text: '图谱',  icon: '🌳', activeIcon: '🌲' },
      { pagePath: '/pages/birthday/index', text: '生日',  icon: '🎂', activeIcon: '🎉' },
      { pagePath: '/pages/timeline/index', text: '时间轴', icon: '📅', activeIcon: '🗓' },
      { pagePath: '/pages/profile/index',  text: '我的',  icon: '👤', activeIcon: '👨' },
    ]
  },
  methods: {
    switchTab(e: WechatMiniprogram.TouchEvent) {
      const idx = (e.currentTarget.dataset as { index: number }).index
      const item = this.data.list[idx]
      wx.switchTab({ url: item.pagePath })
      this.setData({ selected: idx })
    }
  }
})
