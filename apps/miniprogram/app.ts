import { ensureFamilyData } from './services/familyStore'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    void ensureFamilyData().catch(() => {
      // 页面会展示具体的网络错误，启动阶段不重复打扰用户。
    })
  },
})
