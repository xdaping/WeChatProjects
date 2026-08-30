// pages/report/report.js 一周成绩单
const app = getApp()
const store = require('../../utils/store.js')
const util = require('../../utils/util.js')

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日']
const STAR_SECONDS = 7200      // 单日投入 ≥2 小时给星星
const MAX_BLOCKS = 20          // 进度条一格 = 1 小时
const SUMMARY_COLOR = '#3d9bff'

// ISO 周序号
function weekNumber(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() + 4 - day)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

function blocksOf(seconds) {
  const hours = seconds / 3600
  const out = []
  for (let i = 0; i < MAX_BLOCKS; i++) {
    const left = hours - i
    if (left >= 1) out.push(1)
    else if (left > 0) out.push(Math.max(0.35, Math.round(left * 100) / 100))
    else out.push(0)
  }
  return out
}

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    capsuleRight: 96,
    weekDays: WEEK_DAYS,
    anchor: '',
    weekLabel: '',
    isThisWeek: true,
    rows: [],
    invest: [],
    badges: []
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
      capsuleRight: app.globalData.capsuleRight,
      anchor: util.todayKey()
    })
    this.build()
  },

  prevWeek() {
    const d = util.addDays(util.parseKey(this.data.anchor), -7)
    this.setData({ anchor: util.dateKey(d) }, this.build)
  },

  nextWeek() {
    if (this.data.isThisWeek) return
    const d = util.addDays(util.parseKey(this.data.anchor), 7)
    this.setData({ anchor: util.dateKey(d) }, this.build)
  },

  build() {
    const anchor = util.parseKey(this.data.anchor)
    const start = util.startOfWeek(anchor)
    const days = []
    for (let i = 0; i < 7; i++) days.push(util.dateKey(util.addDays(start, i)))
    const end = days[6]

    const records = store.getRecords().filter(function (r) {
      return r.date >= days[0] && r.date <= end
    })

    // 每个大项目（含小项目）一行
    const rows = []
    const invest = []
    store.getRootProjects().forEach(function (p) {
      const family = store.familyIds(p.id)
      const own = records.filter(function (r) { return family.indexOf(r.projectId) >= 0 })
      const total = store.sumSeconds(own)
      if (total <= 0) return
      rows.push({
        name: p.name,
        icon: p.icon,
        color: p.color,
        total: total,
        days: days.map(function (key) {
          const seconds = store.sumSeconds(own.filter(function (r) { return r.date === key }))
          return { level: seconds >= STAR_SECONDS ? 2 : (seconds > 0 ? 1 : 0) }
        })
      })
      invest.push({
        name: p.name,
        icon: p.icon,
        color: p.color,
        total: total,
        hours: util.hours(total),
        blocks: blocksOf(total)
      })
    })
    rows.sort(function (a, b) { return b.total - a.total })
    invest.sort(function (a, b) { return b.total - a.total })

    // 「我的一周」汇总行
    const weekTotal = store.sumSeconds(records)
    const dayTotals = days.map(function (key) {
      return store.sumSeconds(records.filter(function (r) { return r.date === key }))
    })
    if (rows.length) {
      rows.push({
        name: '我的一周',
        icon: '🕐',
        color: SUMMARY_COLOR,
        summary: true,
        days: dayTotals.map(function (seconds) {
          return { level: seconds >= STAR_SECONDS ? 2 : (seconds > 0 ? 1 : 0) }
        })
      })
      invest.push({
        name: '本周总投入',
        icon: '🕐',
        color: SUMMARY_COLOR,
        summary: true,
        hours: util.hours(weekTotal),
        blocks: blocksOf(weekTotal)
      })
    }

    const s = util.parseKey(days[0])
    const e = util.parseKey(end)
    this.setData({
      rows: rows,
      invest: invest,
      isThisWeek: end >= util.todayKey(),
      weekLabel: s.getFullYear() + ' 第 ' + weekNumber(s) + ' 周   '
        + (s.getMonth() + 1) + '.' + s.getDate() + ' - ' + (e.getMonth() + 1) + '.' + e.getDate(),
      badges: this.buildBadges(dayTotals, weekTotal)
    })
  },

  buildBadges(dayTotals, weekTotal) {
    // 本周最长连续打卡
    let best = 0
    let run = 0
    dayTotals.forEach(function (seconds) {
      run = seconds > 0 ? run + 1 : 0
      if (run > best) best = run
    })
    // 到今天为止的连续打卡（跨周）
    let overall = 0
    for (let i = 0; i < 400; i++) {
      const key = util.dateKey(util.addDays(new Date(), -i))
      const seconds = store.sumSeconds(store.recordsOfDate(key))
      if (seconds > 0) overall++
      else if (i > 0) break
    }
    const hours = weekTotal / 3600
    const monster = store.monster()
    return [
      { value: 7, unit: 'days', got: best >= 7, shape: 'shield' },
      { value: 7, unit: 'days', sub: 'Overall', got: overall >= 7, shape: 'shield' },
      { value: 10, unit: 'hours', got: hours >= 10, shape: 'star' },
      { value: 20, unit: 'hours', got: hours >= 20, shape: 'cup' },
      { value: 3, unit: 'days', got: best >= 3, shape: 'shield' },
      { value: 3, unit: 'days', sub: 'Overall', got: overall >= 3, shape: 'shield' },
      { value: monster.hatched, unit: '怪兽', got: monster.hatched > 0, shape: 'egg' }
    ]
  },

  back() {
    wx.navigateBack()
  },

  onShareAppMessage() {
    const total = this.data.invest.length
      ? this.data.invest[this.data.invest.length - 1].hours
      : '0'
    return {
      title: '我的一周成绩单：共投入 ' + total + ' 小时',
      path: '/pages/index/index'
    }
  }
})
