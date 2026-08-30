// pages/project-detail/project-detail.js 项目详情
const app = getApp()
const store = require('../../utils/store.js')
const nav = require('../../utils/nav.js')
const util = require('../../utils/util.js')

const MODE_TEXT = { timer: '专注计时', manual: '手动记录', demo: '示例数据' }

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
    id: '',
    project: {},
    stats: {},
    months: [],
    children: [],
    milestones: [],
    planOpen: false,
    trend: 'days',
    trendTabs: [
      { key: 'days', text: '每日投入' },
      { key: 'weeks', text: '每周投入' },
      { key: 'months', text: '每月投入' },
      { key: 'years', text: '每年投入' }
    ],
    series: [],
    hasData: false,
    trendSummary: '',
    recent: [],
    hourRange: range(13),
    minuteRange: range(60),
    manualShow: false,
    manualTargetId: '',
    manualName: '',
    manualValue: [0, 30],
    manualNote: ''
  },

  onLoad(query) {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
      capsuleRight: app.globalData.capsuleRight,
      id: (query && query.id) || ''
    })
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const project = store.getProject(this.data.id)
    if (!project) {
      wx.showToast({ title: '项目不存在', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 800)
      return
    }
    const st = store.projectStats(project.id)
    const target = (project.targetHours || 0) * 3600
    const nameMap = {}
    store.getProjects().forEach(function (p) { nameMap[p.id] = p })

    const children = store.getChildren(project.id).filter(function (c) { return c && c.id }).map(function (c) {
      return Object.assign({}, c, {
        totalHours: util.hours(store.projectStats(c.id).totalSeconds)
      })
    })

    const recent = st.records.slice(0, 8).map(function (r) {
      const p = nameMap[r.projectId] || { name: project.name }
      return Object.assign({}, r, {
        projectName: p.name,
        dateText: util.dateText(r.startAt),
        timeText: util.timeText(r.startAt),
        durText: util.human(r.seconds),
        modeText: MODE_TEXT[r.mode] || '记录'
      })
    })

    this.setData({
      project: project,
      stats: {
        totalHours: util.hours(st.totalSeconds),
        dayCount: st.dayCount,
        weeklyHours: util.hours(st.weeklySeconds),
        last7Hours: util.hours(st.last7Seconds),
        milestoneNeed: st.milestone.reached ? '0' : util.hours(st.milestone.needHours * 3600),
        milestoneTarget: st.milestone.target,
        targetPercent: target ? Math.min(100, Math.round((st.totalSeconds / target) * 1000) / 10) : 0,
        etaText: this.etaText(st.totalSeconds, target)
      },
      children: children,
      milestones: this.buildMilestones(st.totalSeconds),
      months: this.buildMonths(st.records),
      recent: recent
    })
    this.buildSeries()
  },

  etaText(total, target) {
    if (!target) return '还没有设定目标小时，点右上角可以设置'
    if (total >= target) return '目标已达成 🎉'
    const weeks = store.lastWeeks(8, store.projectRecords(this.data.id)).filter(function (w) { return w.seconds > 0 })
    if (!weeks.length) return '开始记录后可预估达成时间'
    const perWeek = store.sumSeconds(weeks) / weeks.length
    const needWeeks = (target - total) / perWeek
    return needWeeks > 104
      ? '按最近的速度，预计 ' + (needWeeks / 52).toFixed(1) + ' 年达成'
      : '按最近的速度，预计 ' + Math.ceil(needWeeks) + ' 周达成'
  },

  buildMilestones(total) {
    const hours = total / 3600
    return store.MILESTONES.map(function (h) {
      return {
        hours: h,
        done: hours >= h,
        needText: util.hours((h - hours) * 3600) + 'h'
      }
    })
  },

  // 近 3 个月的每日投入
  buildMonths(records) {
    const map = {}
    records.forEach(function (r) { map[r.date] = (map[r.date] || 0) + (r.seconds || 0) })
    const out = []
    const now = new Date()
    for (let i = 2; i >= 0; i--) {
      const first = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const total = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
      const days = []
      for (let d = 1; d <= total; d++) {
        const key = util.dateKey(new Date(first.getFullYear(), first.getMonth(), d))
        const seconds = map[key] || 0
        let level = 0
        if (seconds > 0) level = 1
        if (seconds >= 1800) level = 2
        if (seconds >= 3600) level = 3
        if (seconds >= 7200) level = 4
        days.push({ key: key, level: level })
      }
      out.push({ key: util.monthKey(first), label: (first.getMonth() + 1) + '月', days: days })
    }
    return out
  },

  buildSeries() {
    const records = store.projectRecords(this.data.id)
    let raw = []
    let summary = ''
    if (this.data.trend === 'days') {
      raw = store.lastDays(7, records)
      summary = '今日投入总计 ' + util.hours(store.sumSeconds(raw.slice(-1))) + ' 小时'
    } else if (this.data.trend === 'weeks') {
      raw = store.lastWeeks(8, records)
      summary = '最近 8 周共投入 ' + util.hours(store.sumSeconds(raw)) + ' 小时'
    } else if (this.data.trend === 'months') {
      raw = store.lastMonths(6, records)
      summary = '最近 6 个月共投入 ' + util.hours(store.sumSeconds(raw)) + ' 小时'
    } else {
      raw = store.lastYears(10, records)
      summary = '10 年规划视图 · 累计 ' + util.hours(store.sumSeconds(raw)) + ' 小时'
    }
    const max = raw.reduce(function (m, i) { return Math.max(m, i.seconds) }, 0)
    this.setData({
      series: raw.map(function (i) {
        return {
          key: i.key,
          label: i.label,
          text: i.seconds > 0 ? util.human(i.seconds) : '',
          height: max ? Math.max(3, Math.round((i.seconds / max) * 100)) : 0
        }
      }),
      hasData: max > 0,
      trendSummary: summary
    })
  },

  switchTrend(e) {
    this.setData({ trend: e.currentTarget.dataset.key }, this.buildSeries)
  },

  togglePlan() {
    this.setData({ planOpen: !this.data.planOpen })
  },

  edit() {
    nav.go('/pages/project-edit/project-edit?id=' + this.data.id)
  },

  addChild() {
    nav.go('/pages/project-edit/project-edit?parentId=' + this.data.id)
  },

  openChild(e) {
    nav.go('/pages/project-detail/project-detail?id=' + e.currentTarget.dataset.id)
  },

  startFocus() {
    app.globalData.pendingProjectId = this.data.id
    wx.switchTab({ url: '/pages/focus/focus' })
  },

  openManual() {
    this.setData({
      manualShow: true,
      manualTargetId: this.data.id,
      manualName: this.data.project.name,
      manualValue: [0, 30],
      manualNote: ''
    })
  },

  // 有小项目时可以选择记到哪一个
  pickTarget() {
    const list = [this.data.project].concat(this.data.children)
    const that = this
    wx.showActionSheet({
      itemList: list.map(function (p) { return p.icon + ' ' + p.name }),
      success: function (res) {
        const p = list[res.tapIndex]
        that.setData({ manualTargetId: p.id, manualName: p.name })
      }
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
    store.addRecord({
      projectId: this.data.manualTargetId || this.data.id,
      seconds: seconds,
      startAt: Date.now(),
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
  },

  archive() {
    const that = this
    const name = this.data.project.name
    const hasChildren = this.data.children.length
    wx.showModal({
      title: '归档「' + name + '」',
      content: hasChildren
        ? '连同 ' + hasChildren + ' 个小项目一起归档，记录会保留，可在项目页恢复'
        : '归档后不在项目列表显示，记录会保留，可在项目页恢复',
      success: function (res) {
        if (res.confirm) {
          store.archiveProject(that.data.id, true)
          wx.showToast({ title: '已归档', icon: 'none' })
          setTimeout(function () { wx.navigateBack() }, 600)
        }
      }
    })
  },

  back() {
    wx.navigateBack()
  },

  onShareAppMessage() {
    return {
      title: '我在「岁月」的' + this.data.project.name + '已经投入 ' + this.data.stats.totalHours + ' 小时',
      path: '/pages/index/index'
    }
  }
})
