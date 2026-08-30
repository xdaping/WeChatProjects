// pages/focus/focus.js 专注计时（正计时 / 倒计时）
const app = getApp()
const store = require('../../utils/store.js')
const nav = require('../../utils/nav.js')
const util = require('../../utils/util.js')

const AMBIENTS = ['海浪', '雨声', '篝火', '咖啡馆', '白噪音', '关闭']
const END_SOUND = { long: '长震动', short: '短震动', off: '关闭' }
const END_SOUND_KEYS = ['long', 'short', 'off']

function range(n) {
  const out = []
  for (let i = 0; i < n; i++) out.push(i)
  return out
}

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    capsuleRight: 96,
    projects: [],
    currentId: '',
    currentName: '选择项目',
    currentIcon: '🏆',
    ringColor: '#ffffff',
    mode: 'down',
    durValue: [1, 0],
    hourRange: range(11),
    minuteRange: range(60),
    quick: [],
    running: false,
    paused: false,
    percent: 0,
    clockText: '00:00:00',
    elapsedText: '0s',
    targetText: '',
    ambient: '',
    futureDays: 0,
    // 高级设置
    advShow: false,
    keepScreenOn: false,
    endSound: 'long',
    endSoundText: '长震动',
    quickOn: true,
    quickMinutes: [10, 20, 30, 45, 60],
    hourlyTip: false,
    hourlyDone: 0
  },

  onLoad() {
    const settings = store.getSettings()
    const now = new Date()
    const endOfYear = new Date(now.getFullYear(), 11, 31)
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
      capsuleRight: app.globalData.capsuleRight,
      ambient: settings.ambient || '',
      // 默认关闭：不接管屏幕，熄屏时间跟随手机设置
      keepScreenOn: settings.keepScreenOn === true,
      endSound: settings.endSound || 'long',
      endSoundText: END_SOUND[settings.endSound || 'long'],
      quickOn: settings.quickOn !== false,
      quickMinutes: settings.quickMinutes || [10, 20, 30, 45, 60],
      hourlyTip: settings.hourlyTip === true,
      futureDays: Math.max(0, Math.ceil((endOfYear - now) / 86400000))
    })
    this.buildQuick()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.setData({ projects: store.getProjects() })

    const pending = app.globalData.pendingProjectId
    if (pending) {
      app.globalData.pendingProjectId = ''
      this.selectProjectById(pending)
    } else if (!this.data.currentId) {
      const first = this.data.projects[0]
      if (first) this.selectProjectById(first.id)
    }

    const timer = store.getTimer()
    if (timer) this.attachTimer(timer)
    else this.tick()
    this.applyScreen(!!timer)
  },

  onHide() {
    this.clearTick()
    // 离开专注页就把屏幕交还给系统
    wx.setKeepScreenOn({ keepScreenOn: false })
  },

  onUnload() {
    this.clearTick()
  },

  selectProjectById(id) {
    const p = store.getProject(id)
    if (!p) return
    this.setData({
      currentId: p.id,
      currentName: p.name,
      currentIcon: p.icon,
      ringColor: '#ffffff'
    })
  },

  // 主项目在前，小项目跟在各自父项目后面并缩进
  projectList() {
    const roots = store.getRootProjects()
    const out = []
    roots.forEach(function (p) {
      out.push({ id: p.id, label: p.icon + ' ' + p.name })
      store.getChildren(p.id).forEach(function (c) {
        out.push({ id: c.id, label: '　└ ' + c.icon + ' ' + c.name })
      })
    })
    return out
  },

  chooseProject() {
    const projects = this.projectList()
    if (!projects.length) {
      wx.showModal({
        title: '还没有项目',
        content: '先去创建一个项目吧',
        success: function (res) {
          if (res.confirm) nav.go('/pages/project-edit/project-edit')
        }
      })
      return
    }
    const that = this
    wx.showActionSheet({
      itemList: projects.map(function (p) { return p.label }),
      success: function (res) {
        that.selectProjectById(projects[res.tapIndex].id)
      }
    })
  },

  setMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode })
  },

  onDurChange(e) {
    this.setData({ durValue: e.detail.value })
  },

  targetSeconds() {
    if (this.data.mode === 'up') return 0
    const v = this.data.durValue
    return (this.data.hourRange[v[0]] || 0) * 3600 + (this.data.minuteRange[v[1]] || 0) * 60
  },

  start() {
    const target = this.targetSeconds()
    if (this.data.mode === 'down' && target <= 0) {
      wx.showToast({ title: '请选择倒计时时长', icon: 'none' })
      return
    }
    this.launch(this.data.mode, target)
  },

  buildQuick() {
    const list = (this.data.quickMinutes || []).map(function (m) {
      const minutes = Number(m) || 0
      return {
        minutes: minutes,
        text: minutes >= 60 && minutes % 60 === 0 ? (minutes / 60) + ' 小时' : minutes + ' 分钟'
      }
    }).filter(function (i) { return i.minutes > 0 })
    this.setData({ quick: list })
  },

  quickStart(e) {
    const minutes = Number(e.currentTarget.dataset.minutes)
    this.setData({ mode: 'down', durValue: [Math.floor(minutes / 60), minutes % 60] })
    this.launch('down', minutes * 60)
  },

  launch(mode, target) {
    if (!this.data.currentId) {
      this.chooseProject()
      return
    }
    this.setData({ hourlyDone: 0 })
    const timer = store.setTimer({
      projectId: this.data.currentId,
      mode: mode,
      target: target,
      startAt: Date.now(),
      accumulated: 0,
      paused: false
    })
    this.applyScreen(true)
    this.attachTimer(timer)
  },

  // 只有开关打开且正在计时才请求保持亮屏；其余情况一律交还给系统
  applyScreen(running) {
    wx.setKeepScreenOn({ keepScreenOn: !!(running && this.data.keepScreenOn) })
  },

  attachTimer(timer) {
    this.selectProjectById(timer.projectId)
    this.setData({
      running: true,
      mode: timer.mode,
      paused: !!timer.paused,
      targetText: timer.target ? util.human(timer.target) : ''
    })
    this.clearTick()
    this.tick()
    this.interval = setInterval(this.tick.bind(this), 1000)
  },

  clearTick() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  },

  tick() {
    const timer = store.getTimer()
    if (!timer) {
      this.clearTick()
      this.setData({ running: false, percent: 0, clockText: '00:00:00' })
      return
    }
    const elapsed = store.timerElapsed(timer)
    this.checkHourly(elapsed)
    if (timer.mode === 'down') {
      const left = Math.max(0, timer.target - elapsed)
      this.setData({
        running: true,
        paused: !!timer.paused,
        clockText: util.clock(left),
        elapsedText: util.human(elapsed),
        percent: timer.target ? Math.min(100, Math.round((elapsed / timer.target) * 100)) : 0
      })
      if (left <= 0) this.complete()
    } else {
      this.setData({
        running: true,
        paused: !!timer.paused,
        clockText: util.clock(elapsed),
        elapsedText: util.human(elapsed),
        percent: Math.min(100, Math.round(((elapsed % 3600) / 3600) * 100))
      })
    }
  },

  // 每专注满一小时提示一次（仅前台有效）
  checkHourly(elapsed) {
    if (!this.data.hourlyTip) return
    const hours = Math.floor(elapsed / 3600)
    if (hours > this.data.hourlyDone) {
      this.setData({ hourlyDone: hours })
      if (hours > 0) {
        wx.vibrateShort({ type: 'medium' })
        wx.showToast({ title: '已经专注 ' + hours + ' 小时了', icon: 'none' })
      }
    }
  },

  togglePause() {
    const timer = store.getTimer()
    if (!timer) return
    if (timer.paused) {
      timer.paused = false
      timer.startAt = Date.now()
    } else {
      timer.accumulated = store.timerElapsed(timer)
      timer.paused = true
    }
    store.setTimer(timer)
    this.setData({ paused: timer.paused })
    this.tick()
  },

  complete() {
    const timer = store.getTimer()
    if (!timer) return
    this.clearTick()
    const seconds = timer.mode === 'down' ? timer.target : store.timerElapsed(timer)
    store.setTimer(null)
    this.applyScreen(false)
    this.endFeedback()
    this.save(seconds, '专注完成，已记录 ')
  },

  // 结束提示：小程序在后台不执行代码，所以只在回到页面时触发
  endFeedback() {
    if (this.data.endSound === 'long') wx.vibrateLong()
    else if (this.data.endSound === 'short') wx.vibrateShort({ type: 'medium' })
  },

  finish() {
    const timer = store.getTimer()
    if (!timer) return
    const seconds = store.timerElapsed(timer)
    if (seconds < 10) {
      wx.showToast({ title: '不足 10 秒，未记录', icon: 'none' })
      this.giveUp(true)
      return
    }
    this.clearTick()
    store.setTimer(null)
    this.applyScreen(false)
    this.save(seconds, '已记录 ')
  },

  save(seconds, prefix) {
    store.addRecord({
      projectId: this.data.currentId,
      seconds: seconds,
      startAt: Date.now() - seconds * 1000,
      mode: 'timer'
    })
    this.setData({ running: false, percent: 0, clockText: '00:00:00' })
    wx.showToast({ title: prefix + util.human(seconds), icon: 'none' })
  },

  giveUp(silent) {
    const that = this
    const drop = function () {
      that.clearTick()
      store.setTimer(null)
      that.applyScreen(false)
      that.setData({ running: false, percent: 0, clockText: '00:00:00' })
    }
    if (silent === true) {
      drop()
      return
    }
    wx.showModal({
      title: '放弃本次专注？',
      content: '本次时长不会被记录',
      confirmColor: '#ff3b30',
      success: function (res) {
        if (res.confirm) drop()
      }
    })
  },

  chooseAmbient() {
    const that = this
    wx.showActionSheet({
      itemList: AMBIENTS,
      success: function (res) {
        const value = AMBIENTS[res.tapIndex] === '关闭' ? '' : AMBIENTS[res.tapIndex]
        that.setData({ ambient: value })
        store.saveSettings({ ambient: value })
      }
    })
  },

  openAdv() {
    this.setData({ advShow: true })
  },

  closeAdv() {
    this.setData({ advShow: false })
  },

  toggleScreen() {
    const next = !this.data.keepScreenOn
    this.setData({ keepScreenOn: next })
    store.saveSettings({ keepScreenOn: next })
    this.applyScreen(this.data.running)
    wx.showToast({
      title: next ? '专注期间保持亮屏' : '熄屏跟随系统设置',
      icon: 'none'
    })
  },

  pickEndSound() {
    const that = this
    wx.showActionSheet({
      itemList: END_SOUND_KEYS.map(function (k) { return END_SOUND[k] }),
      success: function (res) {
        const key = END_SOUND_KEYS[res.tapIndex]
        that.setData({ endSound: key, endSoundText: END_SOUND[key] })
        store.saveSettings({ endSound: key })
        if (key !== 'off') that.endFeedback()
      }
    })
  },

  toggleEndSound() {
    const next = this.data.endSound === 'off' ? 'long' : 'off'
    this.setData({ endSound: next, endSoundText: END_SOUND[next] })
    store.saveSettings({ endSound: next })
  },

  toggleQuick() {
    const next = !this.data.quickOn
    this.setData({ quickOn: next })
    store.saveSettings({ quickOn: next })
  },

  editQuick() {
    const that = this
    wx.showModal({
      title: '快速启动的时长',
      editable: true,
      placeholderText: '分钟数，用逗号分隔，如 10,20,30,45,60',
      content: this.data.quickMinutes.join(','),
      success: function (res) {
        if (!res.confirm) return
        const list = String(res.content || '').split(/[,，\s]+/)
          .map(function (v) { return Math.floor(Number(v)) })
          .filter(function (v) { return v > 0 && v <= 600 })
          .slice(0, 6)
        if (!list.length) {
          wx.showToast({ title: '请填写有效的分钟数', icon: 'none' })
          return
        }
        that.setData({ quickMinutes: list, quickOn: true })
        store.saveSettings({ quickMinutes: list, quickOn: true })
        that.buildQuick()
      }
    })
  },

  toggleHourly() {
    const next = !this.data.hourlyTip
    this.setData({ hourlyTip: next })
    store.saveSettings({ hourlyTip: next })
  },

  // 小程序没有接管系统的权限，这里只做说明
  blockApps() {
    wx.showModal({
      title: '禁用手机 App',
      content: '小程序无法接管系统，做不到屏蔽其他 App。建议开启手机自带的「专注模式 / 免打扰」再来计时。',
      showCancel: false
    })
  },

  goPro() {
    wx.showToast({ title: '敬请期待', icon: 'none' })
  },

  goStats() {
    wx.switchTab({ url: '/pages/stats/stats' })
  }
})
