// pages/stats/stats.js 我的统计（多维度）
const app = getApp()
const store = require('../../utils/store.js')
const nav = require('../../utils/nav.js')
const util = require('../../utils/util.js')

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    capsuleRight: 96,
    ov: { count: 0, totalHours: '0', weeklyHours: '0', last7Hours: '0' },
    months: [],
    monster: {},
    monsterScale: [0, 2, 4, 6, 8, 10, 12],
    achv: { list: [], unlocked: 0 },
    trend: 'days',
    trendTabs: [
      { key: 'days', text: '最近 7 天' },
      { key: 'weeks', text: '每周投入' },
      { key: 'months', text: '每月投入' },
      { key: 'years', text: '每年投入' }
    ],
    series: [],
    trendSummary: '',
    daily: {},
    dailyDate: '',
    schedule: [],
    scheduleDays: 7,
    scope: 'all',
    scopeTabs: [
      { key: 'all', text: '全部' },
      { key: 'year', text: '年' },
      { key: 'month', text: '月' },
      { key: 'week', text: '周' },
      { key: 'custom', text: '自定义' }
    ],
    customFrom: '',
    customTo: '',
    dist: { rows: [], dayCount: 0, totalHours: '0' }
  },

  onLoad() {
    const today = util.todayKey()
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
      capsuleRight: app.globalData.capsuleRight,
      dailyDate: today,
      customFrom: util.dateKey(util.addDays(new Date(), -29)),
      customTo: today
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    this.refresh()
  },

  refresh() {
    const ov = store.overview()
    this.setData({
      ov: {
        count: ov.count,
        totalHours: util.hours(ov.totalSeconds),
        weeklyHours: util.hours(ov.weeklySeconds),
        last7Hours: util.hours(ov.last7Seconds)
      },
      months: this.buildMonths(),
      monster: store.monster(),
      achv: store.achievements()
    })
    this.buildSeries()
    this.buildDaily()
    this.buildSchedule()
    this.buildDist()
  },

  /* ---------------- 每日统计 ---------------- */

  // 由各段拼出环形图的 conic-gradient
  // 用未取整的秒数算角度，最后一段强制收到 100%，避免四舍五入留下缝隙
  donutGradient(segments) {
    if (!segments.length) return '#eceef0'
    if (segments.length === 1) return segments[0].color
    const total = segments.reduce(function (n, s) { return n + (s.seconds || 0) }, 0)
    if (!total) return '#eceef0'
    let acc = 0
    const last = segments.length - 1
    const parts = segments.map(function (s, i) {
      const from = acc
      acc = i === last ? 100 : acc + (s.seconds / total) * 100
      return s.color + ' ' + from.toFixed(2) + '% ' + acc.toFixed(2) + '%'
    })
    return 'conic-gradient(' + parts.join(', ') + ')'
  },

  // 把记录按所属项目聚合成环形图的段
  segmentsOf(records) {
    const map = {}
    const projects = {}
    store.getProjects().forEach(function (p) { projects[p.id] = p })
    records.forEach(function (r) {
      map[r.projectId] = (map[r.projectId] || 0) + (r.seconds || 0)
    })
    const total = store.sumSeconds(records)
    return Object.keys(map).map(function (id) {
      const p = projects[id] || { name: '已删除项目', icon: '❔', color: '#c8ccd0' }
      return {
        id: id,
        name: p.name,
        icon: p.icon,
        color: p.color,
        seconds: map[id],
        hours: util.hours(map[id]),
        percent: total ? Math.round((map[id] / total) * 100) : 0
      }
    }).sort(function (a, b) { return b.seconds - a.seconds })
  },

  // 一条记录在 24 小时轴上的位置
  timelineMarks(records) {
    return records.map(function (r) {
      const d = new Date(r.startAt)
      const start = d.getHours() + d.getMinutes() / 60
      return {
        id: r.id,
        left: Math.max(0, Math.min(100, (start / 24) * 100)),
        width: Math.max(0.8, Math.min(100, ((r.seconds || 0) / 3600 / 24) * 100)),
        color: r.color
      }
    })
  },

  withColor(records) {
    const projects = {}
    store.getProjects().forEach(function (p) { projects[p.id] = p })
    return records.map(function (r) {
      const p = projects[r.projectId]
      return Object.assign({}, r, { color: (p && p.color) || '#c8ccd0' })
    })
  },

  buildDaily() {
    const key = this.data.dailyDate
    const records = this.withColor(store.recordsOfDate(key))
    const segments = this.segmentsOf(records)
    const d = util.parseKey(key)
    this.setData({
      daily: {
        dateText: util.pad(d.getMonth() + 1) + '月' + util.pad(d.getDate()) + '日',
        isToday: key === util.todayKey(),
        totalHours: util.hours(store.sumSeconds(records)),
        segments: segments,
        gradient: this.donutGradient(segments),
        topChip: segments[0] ? segments[0].name + ' ' + segments[0].hours + 'h' : '',
        bottomChip: segments[1] ? segments[1].name + ' ' + segments[1].hours + 'h' : '',
        timeline: this.timelineMarks(records)
      }
    })
  },

  prevDay() {
    const d = util.addDays(util.parseKey(this.data.dailyDate), -1)
    this.setData({ dailyDate: util.dateKey(d) }, this.buildDaily)
  },

  nextDay() {
    if (this.data.daily.isToday) return
    const d = util.addDays(util.parseKey(this.data.dailyDate), 1)
    this.setData({ dailyDate: util.dateKey(d) }, this.buildDaily)
  },

  /* ---------------- 专注时间表 ---------------- */

  buildSchedule() {
    const that = this
    const days = this.data.scheduleDays
    const out = []
    for (let i = 0; i < days; i++) {
      const d = util.addDays(new Date(), -i)
      const key = util.dateKey(d)
      const records = that.withColor(store.recordsOfDate(key))
      out.push({
        key: key,
        label: (d.getMonth() + 1) + '.' + d.getDate(),
        marks: that.timelineMarks(records)
      })
    }
    this.setData({ schedule: out })
  },

  toggleSchedule() {
    this.setData({ scheduleDays: this.data.scheduleDays === 7 ? 30 : 7 }, this.buildSchedule)
  },

  // 近 3 个月的每日投入热力条
  buildMonths() {
    const out = []
    const now = new Date()
    for (let i = 2; i >= 0; i--) {
      const first = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
      const days = []
      for (let d = 1; d <= daysInMonth; d++) {
        const key = util.dateKey(new Date(first.getFullYear(), first.getMonth(), d))
        const seconds = store.sumSeconds(store.recordsOfDate(key))
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
    let raw = []
    let summary = ''
    if (this.data.trend === 'days') {
      raw = store.lastDays(7)
      summary = '最近 7 天共投入 ' + util.hours(store.sumSeconds(raw)) + ' 小时'
    } else if (this.data.trend === 'weeks') {
      raw = store.lastWeeks(8)
      summary = '最近 8 周共投入 ' + util.hours(store.sumSeconds(raw)) + ' 小时'
    } else if (this.data.trend === 'months') {
      raw = store.lastMonths(6)
      summary = '最近 6 个月共投入 ' + util.hours(store.sumSeconds(raw)) + ' 小时'
    } else {
      raw = store.lastYears(10)
      summary = '10 年时间规划视图 · 累计 ' + util.hours(store.sumSeconds(raw)) + ' 小时'
    }
    const max = raw.reduce(function (m, i) { return Math.max(m, i.seconds) }, 0)
    const series = raw.map(function (i) {
      return {
        key: i.key,
        label: i.label,
        text: i.seconds > 0 ? util.human(i.seconds) : '',
        height: max ? Math.max(3, Math.round((i.seconds / max) * 100)) : 0
      }
    })
    this.setData({ series: series, trendSummary: summary })
  },

  /* ---------------- 投入时间分布 ---------------- */

  rangeOf(scope) {
    const now = new Date()
    if (scope === 'year') {
      return { from: now.getFullYear() + '-01-01', to: util.todayKey(), label: '本年总投入' }
    }
    if (scope === 'month') {
      return { from: util.monthKey(now) + '-01', to: util.todayKey(), label: '本月总投入' }
    }
    if (scope === 'week') {
      const start = util.startOfWeek(now)
      return { from: util.dateKey(start), to: util.dateKey(util.addDays(start, 6)), label: '本周总投入' }
    }
    if (scope === 'custom') {
      return { from: this.data.customFrom, to: this.data.customTo, label: '区间总投入' }
    }
    return { from: '0000-00-00', to: '9999-99-99', label: '累计总投入' }
  },

  buildDist() {
    const range = this.rangeOf(this.data.scope)
    const records = store.getRecords().filter(function (r) {
      return r.date >= range.from && r.date <= range.to
    })
    const total = store.sumSeconds(records)
    const byProject = store.secondsByProject(records)
    const days = {}
    records.forEach(function (r) { days[r.date] = true })

    const rows = store.getRootProjects().map(function (p) {
      const family = store.familyIds(p.id)
      const seconds = family.reduce(function (acc, id) { return acc + (byProject[id] || 0) }, 0)
      const children = store.getChildren(p.id)
      let kids = []
      if (children.length) {
        // 主项目自身的直接投入也作为一行，占比相对于这一族
        kids = [{ id: p.id + '_self', name: p.name, icon: p.icon, color: p.color, seconds: byProject[p.id] || 0 }]
          .concat(children.map(function (c) {
            const cs = store.familyIds(c.id).reduce(function (acc, id) { return acc + (byProject[id] || 0) }, 0)
            return { id: c.id, name: c.name, icon: c.icon, color: c.color, seconds: cs }
          }))
          .map(function (k) {
            return Object.assign({}, k, {
              hours: util.hours(k.seconds),
              percent: seconds ? Math.round((k.seconds / seconds) * 100) : 0
            })
          })
      }
      return {
        id: p.id,
        name: p.name,
        icon: p.icon,
        color: p.color,
        seconds: seconds,
        hours: util.hours(seconds),
        percent: total ? Math.round((seconds / total) * 100) : 0,
        children: kids
      }
    }).filter(function (r) { return r.seconds > 0 })
      .sort(function (a, b) { return b.seconds - a.seconds })

    this.setData({
      dist: {
        rows: rows,
        dayCount: Object.keys(days).length,
        totalHours: util.hours(total),
        centerLabel: range.label,
        gradient: this.donutGradient(rows),
        topChip: rows[0] ? rows[0].name + ' ' + rows[0].hours + 'h' : '',
        bottomChip: rows[1] ? rows[1].name + ' ' + rows[1].hours + 'h' : ''
      }
    })
  },

  onFrom(e) {
    this.setData({ customFrom: e.detail.value, scope: 'custom' }, this.buildDist)
  },

  onTo(e) {
    this.setData({ customTo: e.detail.value, scope: 'custom' }, this.buildDist)
  },

  openProject(e) {
    nav.go('/pages/project-detail/project-detail?id=' + e.currentTarget.dataset.id)
  },

  switchTrend(e) {
    this.setData({ trend: e.currentTarget.dataset.key }, this.buildSeries)
  },

  switchScope(e) {
    this.setData({ scope: e.currentTarget.dataset.key }, this.buildDist)
  },

  showReport() {
    nav.go('/pages/report/report')
  },

  onShareAppMessage() {
    const ov = store.overview()
    return {
      title: '我在「岁月」已经投入了 ' + util.hours(ov.totalSeconds) + ' 小时',
      path: '/pages/index/index'
    }
  }
})
