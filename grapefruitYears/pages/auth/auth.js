// pages/auth/auth.js 邮箱注册 / 登录
const app = getApp()
const account = require('../../utils/account.js')

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    isRegister: true,
    showPwd: false,
    agree: false,
    loading: false,
    error: '',
    form: { email: '', nickName: '', password: '', confirm: '' }
  },

  onLoad(query) {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
      isRegister: !query || query.mode !== 'login'
    })
  },

  onEmail(e) {
    this.setData({ 'form.email': e.detail.value, error: '' })
  },

  onNick(e) {
    this.setData({ 'form.nickName': e.detail.value })
  },

  onPassword(e) {
    this.setData({ 'form.password': e.detail.value, error: '' })
  },

  onConfirm(e) {
    this.setData({ 'form.confirm': e.detail.value, error: '' })
  },

  toggleEye() {
    this.setData({ showPwd: !this.data.showPwd })
  },

  toggleAgree() {
    this.setData({ agree: !this.data.agree })
  },

  switchMode() {
    this.setData({ isRegister: !this.data.isRegister, error: '' })
  },

  forgot() {
    wx.showModal({
      title: '忘记密码',
      content: '当前版本还没有邮件服务，暂不支持自助重置。可以联系管理员在云开发控制台协助处理。',
      showCancel: false
    })
  },

  submit() {
    if (this.data.loading) return
    const form = this.data.form
    if (this.data.isRegister && !this.data.agree) {
      this.setData({ error: '请先勾选同意用户协议与隐私政策' })
      return
    }

    const isRegister = this.data.isRegister
    const that = this
    this.setData({ loading: true, error: '' })
    wx.showLoading({ title: isRegister ? '注册中…' : '登录中…', mask: true })

    const task = isRegister
      ? account.register({
        email: form.email,
        password: form.password,
        confirm: form.confirm,
        nickName: form.nickName
      })
      : account.login({ email: form.email, password: form.password })

    task.then(function (res) {
      if (!res.ok) {
        wx.hideLoading()
        that.setData({ loading: false, error: res.error })
        return
      }
      // 登录成功：把本机数据并到云端，再把云端数据拉下来
      wx.showLoading({ title: '同步数据…', mask: true })
      account.mergeAfterLogin().then(function (out) {
        wx.hideLoading()
        that.setData({ loading: false })
        const who = isRegister ? '注册成功' : '登录成功'

        // 同步失败必须让用户看到，否则会误以为数据已经上云
        if (!out || !out.ok) {
          wx.showModal({
            title: who + '，但数据同步失败',
            content: (out && out.error ? out.error : '未知原因')
              + '\n\n项目和记录暂时只保存在本机。可到 我的 → 设置 → 同步诊断 查看详情。',
            showCancel: false,
            success: function () { wx.navigateBack() }
          })
          return
        }

        const up = (out.pushed.projects || 0) + (out.pushed.records || 0)
        const down = out.applied || 0
        wx.showToast({
          title: who + (up || down ? '，已同步 ↑' + up + ' ↓' + down : '，数据已是最新'),
          icon: 'none',
          duration: 2000
        })
        setTimeout(function () { wx.navigateBack() }, 900)
      })
    })
  },

  back() {
    wx.navigateBack()
  }
})
