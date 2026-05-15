interface IAppOption {
  globalData: Record<string, unknown>
}

App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 家族图谱应用启动
  },
})