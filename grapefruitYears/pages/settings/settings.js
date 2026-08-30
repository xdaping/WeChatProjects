// pages/settings/settings.js
const app = getApp()
const store = require('../../utils/store.js')
const nav = require('../../utils/nav.js')
const account = require('../../utils/account.js')
const sync = require('../../utils/sync.js')
const util = require('../../utils/util.js')

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    settings: {},
    projects: [],
    profile: {},
    syncText: '未开启'
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight
    })
  },

  onShow() {
    this.setData({
      settings: store.getSettings(),
      projects: store.getProjects(),
      profile: store.getProfile()
    })
    this.refreshSync()
  },

  onRemind(e) {
    this.setData({ settings: store.saveSettings({ remindOn: e.detail.value }) })
  },

  onRemindTime(e) {
    this.setData({ settings: store.saveSettings({ remindAt: e.detail.value }) })
  },

  refreshSync() {
    const info = sync.summary()
    let text = '未登录'
    if (info.loggedIn) {
      text = info.syncAt
        ? '上次 ' + util.dateText(info.syncAt) + ' ' + util.timeText(info.syncAt)
        : '尚未同步'
    }
    this.setData({ syncText: info.syncing ? '同步中…' : text })
  },

  syncNow() {
    const that = this
    if (!store.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }
    wx.showLoading({ title: '同步中…', mask: true })
    sync.run('manual').then(function (res) {
      wx.hideLoading()
      that.refreshSync()
      if (!res.ok) {
        wx.showToast({ title: res.error || '同步失败', icon: 'none', duration: 2500 })
        return
      }
      const up = (res.pushed.projects || 0) + (res.pushed.records || 0)
      wx.showToast({ title: '已同步 ↑' + up + ' ↓' + (res.applied || 0), icon: 'none' })
    })
  },

  diagnose() {
    wx.showLoading({ title: '检查中…', mask: true })
    sync.diagnose().then(function (out) {
      wx.hideLoading()
      wx.showModal({
        title: out.ok ? '同步正常' : '同步有问题',
        content: out.text,
        showCancel: false
      })
    })
  },

  goRegister() {
    nav.go('/pages/auth/auth?mode=register')
  },

  goLogin() {
    nav.go('/pages/auth/auth?mode=login')
  },

  changePassword() {
    const that = this
    wx.showModal({
      title: '修改密码',
      editable: true,
      placeholderText: '请输入原密码',
      success: function (res) {
        if (!res.confirm) return
        const oldPwd = res.content
        wx.showModal({
          title: '设置新密码',
          editable: true,
          placeholderText: '至少 6 位',
          success: function (r2) {
            if (!r2.confirm) return
            wx.showLoading({ title: '提交中…', mask: true })
            account.changePassword(oldPwd, r2.content).then(function (out) {
              wx.hideLoading()
              wx.showToast({ title: out.ok ? '密码已更新' : out.error, icon: 'none' })
              if (out.ok) that.onShow()
            })
          }
        })
      }
    })
  },

  logout() {
    const that = this
    wx.showModal({
      title: '退出登录',
      content: '本机的项目与记录会保留',
      success: function (res) {
        if (res.confirm) {
          account.logout().then(function () {
            that.onShow()
            wx.showToast({ title: '已退出', icon: 'none' })
          })
        }
      }
    })
  },

  onKeepScreen(e) {
    this.setData({ settings: store.saveSettings({ keepScreenOn: e.detail.value }) })
  },

  editProject(e) {
    nav.go('/pages/project-edit/project-edit?id=' + e.currentTarget.dataset.id)
  },

  seedDemo() {
    const that = this
    wx.showModal({
      title: '载入示例数据',
      content: '会为现有项目生成近 90 天的记录，方便查看统计效果',
      success: function (res) {
        if (res.confirm) {
          const n = store.seedDemoRecords()
          wx.showToast({ title: '已生成 ' + n + ' 条记录', icon: 'none' })
          that.onShow()
        }
      }
    })
  },

  exportData() {
    wx.setClipboardData({
      data: JSON.stringify(store.exportData()),
      success: function () {
        wx.showToast({ title: '已复制到剪贴板', icon: 'none' })
      }
    })
  },

  clearAll() {
    const that = this
    wx.showModal({
      title: '清空所有数据',
      content: store.isLoggedIn()
        ? '本机与云端的项目、记录都会删除，且无法恢复'
        : '项目与记录将全部删除，且无法恢复',
      confirmColor: '#ff3b30',
      success: function (res) {
        if (res.confirm) {
          store.clearAll()
          if (store.isLoggedIn()) {
            sync.run('clear').then(function () { that.onShow() })
          }
          wx.showToast({ title: '已清空', icon: 'none' })
          that.onShow()
        }
      }
    })
  },

  back() {
    wx.navigateBack()
  }
})
