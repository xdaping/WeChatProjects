// utils/util.js 时间与格式化工具

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function dateKey(date) {
  const d = date instanceof Date ? date : new Date(date)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function parseKey(key) {
  const p = String(key).split('-')
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
}

function todayKey() {
  return dateKey(new Date())
}

function addDays(date, n) {
  const d = new Date(date.getTime())
  d.setDate(d.getDate() + n)
  return d
}

// 周一为一周起点
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() === 0 ? 7 : d.getDay()
  return addDays(d, 1 - day)
}

function weekOf(date) {
  const start = startOfWeek(date)
  const list = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i)
    list.push({
      key: dateKey(d),
      day: d.getDate(),
      label: WEEK_LABELS[d.getDay()],
      future: d.getTime() > new Date().getTime() && dateKey(d) !== todayKey()
    })
  }
  return list
}

function monthKey(date) {
  const d = date instanceof Date ? date : parseKey(date)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1)
}

// 12345 秒 -> { h, m, s }
function split(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}

// 计时器展示 01:05:09
function clock(seconds) {
  const t = split(seconds)
  return pad(t.h) + ':' + pad(t.m) + ':' + pad(t.s)
}

// 人类可读 1h20m / 45m / 30s
function human(seconds) {
  const t = split(seconds)
  if (t.h > 0) return t.h + 'h' + (t.m > 0 ? t.m + 'm' : '')
  if (t.m > 0) return t.m + 'm'
  return t.s + 's'
}

// 小时数（保留 1 位，去掉多余的 .0）
function hours(seconds, digits) {
  const n = (seconds || 0) / 3600
  const fixed = n.toFixed(digits === undefined ? 1 : digits)
  return fixed.replace(/\.0$/, '')
}

// 中文时长：1 小时 20 分钟 / 5 分钟 / 30 秒
function cn(seconds) {
  const t = split(seconds)
  if (t.h > 0) return t.h + ' 小时' + (t.m > 0 ? ' ' + t.m + ' 分钟' : '')
  if (t.m > 0) return t.m + ' 分钟'
  return t.s + ' 秒'
}

function timeText(ts) {
  const d = new Date(ts)
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function dateText(ts) {
  const d = new Date(ts)
  return (d.getMonth() + 1) + '月' + d.getDate() + '日'
}

module.exports = {
  WEEK_LABELS,
  pad,
  dateKey,
  parseKey,
  todayKey,
  addDays,
  startOfWeek,
  weekOf,
  monthKey,
  split,
  clock,
  human,
  cn,
  hours,
  timeText,
  dateText
}
