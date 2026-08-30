// pages/index/index.js 今日 · 时间投资计划
const app = getApp()
const store = require('../../utils/store.js')
const nav = require('../../utils/nav.js')
const util = require('../../utils/util.js')

const MODE_TEXT = { timer: '专注计时', manual: '手动记录', demo: '示例数据' }

function buildRange(n) {
  const out = []
  for (let i = 0; i < n; i++) out.push(i)
  return out
}

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    capsuleRight: 96,
    weekAnchor: '',
    selectedDate: '',
    selectedText: '',
    week: [],
    projects: [],
    records: [],
    dayText: '0m',
    dayCount: 0,
    hourRange: buildRange(13),
    minuteRange: buildRange(60),
    manualShow: false,
    manualProjectId: '',
    manualProjectName: '',
    manualValue: [0, 30],
    manualNote: '',
    loggedIn: false
  },

  onLoad() {
    const today = util.todayKey()
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
      capsuleRight: app.globalData.capsuleRight,
      weekAnchor: today,
      selectedDate: today
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
      this.getTabBar().refreshBadge()
    }
    this.refresh()
  },

  onHide() {
    // 切走时收起弹窗，避免回来时停在半开状态
    if (this.data.manualShow) this.setData({ manualShow: false })
  },

  refresh() {
    const anchor = util.parseKey(this.data.weekAnchor)
    const week = util.weekOf(anchor).map(function (d) {
      return Object.assign({}, d, { seconds: store.sumSeconds(store.recordsOfDate(d.key)) })
    })

    const dayRecords = store.recordsOfDate(this.data.selectedDate)
    const projectMap = {}
    store.getProjects().forEach(function (p) { projectMap[p.id] = p })

    // 大项目卡片：今日时长含小项目，小项目跟在下面
    const todayOf = function (ids) {
      return store.sumSeconds(dayRecords.filter(function (r) {
        return ids.indexOf(r.projectId) >= 0
      }))
    }
    const projects = store.getRootProjects().map(function (p) {
      const family = store.familyIds(p.id)
      const today = todayOf(family)
      const children = store.getChildren(p.id).map(function (c) {
        const kidToday = todayOf(store.familyIds(c.id))
        return {
          id: c.id,
          name: c.name,
          icon: c.icon,
          color: c.color,
          todaySeconds: kidToday,
          todayText: kidToday > 0 ? util.cn(kidToday) : ''
        }
      })
      return {
        id: p.id,
        name: p.name,
        icon: p.icon,
        color: p.color,
        todaySeconds: today,
        todayText: today > 0 ? util.cn(today) : '',
        children: children
      }
    })

    const records = dayRecords.map(function (r) {
      const p = projectMap[r.projectId] || { name: '已删除项目', icon: '❔' }
      return Object.assign({}, r, {
        name: p.name,
        icon: p.icon,
        timeText: util.timeText(r.startAt),
        durText: util.human(r.seconds),
        modeText: MODE_TEXT[r.mode] || '记录'
      })
    })

    const sel = util.parseKey(this.data.selectedDate)
    this.setData({
      loggedIn: store.isLoggedIn(),
      week: week,
      projects: projects,
      records: records,
      dayCount: dayRecords.length,
      dayText: util.human(store.sumSeconds(dayRecords)),
      selectedText: (sel.getMonth() + 1) + '月' + sel.getDate() + '日 ' + util.WEEK_LABELS[sel.getDay()]
    })
  },

  pickDay(e) {
    this.setData({ selectedDate: e.currentTarget.dataset.key }, this.refresh)
  },

  prevWeek() {
    const d = util.addDays(util.parseKey(this.data.weekAnchor), -7)
    this.setData({ weekAnchor: util.dateKey(d), selectedDate: util.dateKey(d) }, this.refresh)
  },

  nextWeek() {
    const d = util.addDays(util.parseKey(this.data.weekAnchor), 7)
    this.setData({ weekAnchor: util.dateKey(d), selectedDate: util.dateKey(d) }, this.refresh)
  },

  goRegister() {
    nav.go('/pages/auth/auth?mode=register')
  },

  goProjects() {
    wx.switchTab({ url: '/pages/projects/projects' })
  },

  goStats() {
    wx.switchTab({ url: '/pages/stats/stats' })
  },

  addProject() {
    nav.go('/pages/project-edit/project-edit')
  },

  openProject(e) {
    nav.go('/pages/project-detail/project-detail?id=' + e.currentTarget.dataset.id)
  },

  // ＋ 号：开始专注 / 手动记录
  quickAdd(e) {
    const id = e.currentTarget.dataset.id
    const project = store.getProject(id)
    if (!project) return
    const that = this
    wx.showActionSheet({
      itemList: ['开始专注计时', '手动记录时间'],
      success: function (res) {
        if (res.tapIndex === 0) that.startFocusFor(id)
        else that.openManualFor(project)
      }
    })
  },

  startFocusFor(id) {
    app.globalData.pendingProjectId = id
    wx.switchTab({ url: '/pages/focus/focus' })
  },

  openManualFor(project) {
    this.setData({
      manualShow: true,
      manualProjectId: project.id,
      manualProjectName: project.name,
      manualValue: [0, 30],
      manualNote: ''
    })
  },

  closeManual() {
    this.setData({ manualShow: false })
  },

  onManualChange(e) {
    this.setData({ manualValue: e.detail.value })
  },

  onNoteInput(e) {
    this.setData({ manualNote: e.detail.value })
  },

  saveManual() {
    const v = this.data.manualValue
    const seconds = (this.data.hourRange[v[0]] || 0) * 3600 + (this.data.minuteRange[v[1]] || 0) * 60
    if (seconds <= 0) {
      wx.showToast({ title: '时长要大于 0', icon: 'none' })
      return
    }
    const sel = util.parseKey(this.data.selectedDate)
    const now = new Date()
    sel.setHours(now.getHours(), now.getMinutes(), 0, 0)
    store.addRecord({
      projectId: this.data.manualProjectId,
      seconds: seconds,
      startAt: sel.getTime(),
      note: this.data.manualNote,
      mode: 'manual'
    })
    this.setData({ manualShow: false })
    wx.showToast({ title: '已记录 ' + util.human(seconds), icon: 'none' })
    this.refresh()
  },

  removeRecord(e) {
    const id = e.currentTarget.dataset.id
    const that = this
    wx.showModal({
      title: '删除这条记录？',
      success: function (res) {
        if (res.confirm) {
          store.deleteRecord(id)
          that.refresh()
        }
      }
    })
  }
})
