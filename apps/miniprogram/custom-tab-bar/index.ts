Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/index',     text: '首页',  icon: '/assets/tabbar/home.png',     activeIcon: '/assets/tabbar/home-active.png' },
      { pagePath: '/pages/tree/index',     text: '图谱',  icon: '/assets/tabbar/tree.png',     activeIcon: '/assets/tabbar/tree-active.png' },
      { pagePath: '/pages/timeline/index', text: '时间轴', icon: '/assets/tabbar/timeline.png', activeIcon: '/assets/tabbar/timeline-active.png' },
      { pagePath: '/pages/birthday/index', text: '生日',  icon: '/assets/tabbar/birthday.png', activeIcon: '/assets/tabbar/birthday-active.png' },
      { pagePath: '/pages/profile/index',  text: '我的',  icon: '/assets/tabbar/profile.png',  activeIcon: '/assets/tabbar/profile-active.png' },
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
