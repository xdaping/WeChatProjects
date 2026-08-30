// app.js
const store = require('./utils/store.js')
const cloud = require('./utils/cloud.js')
const sync = require('./utils/sync.js')

App({
  globalData: {
    statusBarHeight: 20,
    navBarHeight: 44,
    screenWidth: 375,
    // 胶囊按钮（··· ◉）左边到屏幕右侧的距离，自定义导航栏要给它留位
    capsuleRight: 96,
    cloudReady: false,
    cloudError: ''
  },
  onLaunch() {
    this.readSystemInfo()
    store.bootstrap()
    // 云开发用于账号（注册 / 登录），未配置时账号功能会给出明确提示
    const ready = cloud.ensureInit()
    this.globalData.cloudReady = ready.ok
    this.globalData.cloudError = ready.ok ? '' : ready.error

    // 数据变更后自动同步；已登录则启动时先同步一次
    sync.hook()
    if (sync.enabled()) sync.run('launch')
  },
  onShow() {
    // 从后台回到前台补一次同步
    if (sync.enabled()) sync.schedule('foreground')
  },

  readSystemInfo() {
    let info = {}
    try {
      info = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync()
    } catch (e) {
      info = {}
    }
    const statusBarHeight = info.statusBarHeight || 20
    const screenWidth = info.screenWidth || 375
    let navBarHeight = 44
    let capsuleRight = 96
    try {
      const rect = wx.getMenuButtonBoundingClientRect()
      if (rect && rect.height) {
        navBarHeight = (rect.top - statusBarHeight) * 2 + rect.height
        // 胶囊左边界到屏幕右边，再留 8px 空隙
        capsuleRight = Math.round(screenWidth - rect.left + 8)
      }
    } catch (e) {
      // 开发者工具早期调用可能失败，使用默认值
    }
    this.globalData.statusBarHeight = statusBarHeight
    this.globalData.navBarHeight = Math.round(navBarHeight)
    this.globalData.screenWidth = screenWidth
    this.globalData.capsuleRight = Math.max(96, capsuleRight)
  }
})
