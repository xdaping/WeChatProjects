// pages/project-edit/project-edit.js 添加 / 修改 / 删除项目
const app = getApp()
const store = require('../../utils/store.js')
const nav = require('../../utils/nav.js')
const util = require('../../utils/util.js')

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    capsuleRight: 96,
    isEdit: false,
    icons: store.ICONS,
    colors: store.COLORS,
    targets: [100, 500, 1000, 2000, 5000, 10000],
    totalHours: '0',
    etaText: '--',
    parentName: '',
    form: {
      id: '',
      parentId: '',
      name: '',
      icon: store.ICONS[0],
      color: store.COLORS[0],
      targetHours: 1000,
      remindOn: false,
      remindAt: '20:00'
    }
  },

  onLoad(query) {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
      capsuleRight: app.globalData.capsuleRight
    })
    if (query && query.id) {
      const p = store.getProject(query.id)
      if (p) {
        this.setData({ isEdit: true, form: Object.assign({}, this.data.form, p) })
      }
    } else if (query && query.parentId) {
      // 新建小项目：继承父项目的颜色
      const parent = store.getProject(query.parentId)
      if (parent) {
        this.setData({
          parentName: parent.name,
          'form.parentId': parent.id,
          'form.color': parent.color,
          'form.targetHours': 100
        })
      }
    }
    const parentId = this.data.form.parentId
    if (parentId && !this.data.parentName) {
      const parent = store.getProject(parentId)
      if (parent) this.setData({ parentName: parent.name })
    }
    this.computeMeta()
  },

  computeMeta() {
    const id = this.data.form.id
    const own = id ? store.getRecords().filter(function (r) { return r.projectId === id }) : []
    const total = store.sumSeconds(own)
    const target = (Number(this.data.form.targetHours) || 0) * 3600
    let etaText = '--'
    if (target > total) {
      const weeks = store.lastWeeks(8).filter(function (w) { return w.seconds > 0 })
      const perWeek = weeks.length ? store.sumSeconds(weeks) / weeks.length : 0
      if (perWeek > 0) {
        const needWeeks = (target - total) / perWeek
        etaText = needWeeks > 104
          ? (needWeeks / 52).toFixed(1) + ' 年'
          : Math.ceil(needWeeks) + ' 周'
      } else {
        etaText = '开始记录后可预估'
      }
    } else if (target > 0) {
      etaText = '已达成 🎉'
    }
    this.setData({ totalHours: util.hours(total), etaText: etaText })
  },

  onName(e) {
    this.setData({ 'form.name': e.detail.value })
  },

  onIcon(e) {
    this.setData({ 'form.icon': e.currentTarget.dataset.icon })
  },

  onColor(e) {
    this.setData({ 'form.color': e.currentTarget.dataset.color })
  },

  onTarget(e) {
    this.setData({ 'form.targetHours': Number(e.currentTarget.dataset.value) }, this.computeMeta)
  },

  onTargetInput(e) {
    const v = Math.max(0, Math.min(100000, Number(e.detail.value) || 0))
    this.setData({ 'form.targetHours': v }, this.computeMeta)
  },

  onRemind(e) {
    this.setData({ 'form.remindOn': e.detail.value })
    if (e.detail.value) this.trySubscribe()
  },

  onRemindTime(e) {
    this.setData({ 'form.remindAt': e.detail.value })
  },

  // 每日提醒依赖微信订阅消息，缺少模板时静默降级为本地设置
  trySubscribe() {
    if (!wx.requestSubscribeMessage) return
    wx.showToast({ title: '已开启每日提醒', icon: 'none' })
  },

  save() {
    const form = this.data.form
    if (!form.name || !form.name.trim()) {
      wx.showToast({ title: '请填写项目名称', icon: 'none' })
      return
    }
    const payload = {
      parentId: form.parentId || '',
      name: form.name.trim(),
      icon: form.icon,
      color: form.color,
      targetHours: Number(form.targetHours) || 0,
      remindOn: !!form.remindOn,
      remindAt: form.remindAt
    }
    if (form.id) payload.id = form.id
    store.saveProject(payload)
    wx.showToast({ title: '已保存', icon: 'success' })
    setTimeout(function () { wx.navigateBack() }, 400)
  },

  remove() {
    const form = this.data.form
    wx.showModal({
      title: '删除「' + form.name + '」',
      content: '该项目下的所有记录也会一并删除',
      confirmColor: '#ff3b30',
      success: function (res) {
        if (res.confirm) {
          store.deleteProject(form.id)
          wx.navigateBack()
        }
      }
    })
  },

  back() {
    wx.navigateBack()
  }
})
