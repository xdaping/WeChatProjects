// pages/profile/profile.js 个人账号
const app = getApp()
const store = require('../../utils/store.js')
const nav = require('../../utils/nav.js')
const account = require('../../utils/account.js')
const util = require('../../utils/util.js')

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    capsuleRight: 96,
    profile: {}
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
      capsuleRight: app.globalData.capsuleRight
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 })
      this.getTabBar().refreshBadge()
    }
    this.setData({ profile: store.getProfile() })
    this.syncFromCloud()
  },

  // 云端资料可能在别的设备改过，进页面同步一次
  syncFromCloud() {
    const that = this
    account.refresh().then(function (res) {
      that.setData({ profile: store.getProfile() })
      if (typeof that.getTabBar === 'function' && that.getTabBar()) {
        that.getTabBar().refreshBadge()
      }
      if (!res.ok && res.error) {
        wx.showToast({ title: res.error, icon: 'none', duration: 2500 })
      }
    })
  },

  goRegister() {
    nav.go('/pages/auth/auth?mode=register')
  },

  goLogin() {
    nav.go('/pages/auth/auth?mode=login')
  },

  // 未登录时统一提示注册
  requireLogin(action) {
    if (this.data.profile.loggedIn) return true
    wx.showModal({
      title: '还没有账号',
      content: '注册岁月 ID 后即可' + (action || '使用该功能') + '，用邮箱注册只需几秒',
      confirmText: '去注册',
      cancelText: '去登录',
      success: function (res) {
        nav.go('/pages/auth/auth?mode=' + (res.confirm ? 'register' : 'login'))
      }
    })
    return false
  },

  onChooseAvatar(e) {
    if (!this.requireLogin('设置头像')) return
    this.commit({ avatar: e.detail.avatarUrl })
  },

  // 统一提交到云端，失败回滚并提示
  commit(patch, okText) {
    const that = this
    account.updateProfile(patch).then(function (res) {
      that.setData({ profile: store.getProfile() })
      if (!res.ok) {
        wx.showToast({ title: res.error, icon: 'none' })
        return
      }
      if (okText) wx.showToast({ title: okText, icon: 'success' })
    })
    // 乐观更新：先按本地缓存刷新界面
    this.setData({ profile: store.getProfile() })
  },

  editName() {
    if (!this.requireLogin('修改昵称')) return
    const that = this
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: that.data.profile.nickName,
      success: function (res) {
        if (res.confirm && res.content && res.content.trim()) {
          that.commit({ nickName: res.content.trim() }, '昵称已更新')
        }
      }
    })
  },

  goSettings() {
    nav.go('/pages/settings/settings')
  },

  openInbox() {
    if (!this.requireLogin('查看收件箱')) return
    this.commit({ inbox: 0 })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().refreshBadge()
    }
    const ov = store.overview()
    wx.showModal({
      title: '收件箱',
      content: '欢迎使用「岁月」！\n你已累计投入 ' + util.hours(ov.totalSeconds) + ' 小时，继续保持 💪',
      showCancel: false
    })
  },

  sponsor() {
    wx.showModal({ title: '赞助开发者', content: '感谢你的支持，赞助通道即将开放', showCancel: false })
  },

  goProjects() {
    wx.switchTab({ url: '/pages/projects/projects' })
  },

  // 高级功能还没做，点击只提示敬请期待（不再本地开通）
  upgrade() {
    wx.showToast({ title: '敬请期待', icon: 'none' })
  },

  share() {
    wx.showToast({ title: '点击右上角可分享给好友', icon: 'none' })
  },

  onShareAppMessage() {
    return { title: '岁月 · 光阴计算，10000 小时成为专家', path: '/pages/index/index' }
  }
})
