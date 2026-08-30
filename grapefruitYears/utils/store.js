// utils/store.js 本地数据层（wx.storage）

const util = require('./util.js')

const KEYS = {
  projects: 'ih_projects',
  records: 'ih_records',
  timer: 'ih_timer',
  settings: 'ih_settings',
  me: 'ih_me',
  inited: 'ih_inited',
  syncAt: 'ih_sync_at',
  pullMax: 'ih_pull_max'
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/

const ICONS = ['📖', '🎹', '💻', '🔤', '🏃', '🎨', '🧘', '✍️', '🎧', '🏀', '🧪', '📷', '🌱', '🍳', '🗣️', '🧩']
const COLORS = ['#007aff', '#ff7a45', '#34c759', '#af52de', '#ff375f', '#ffb300', '#00c2c7', '#5856d6']

// 孵化一只时空怪兽所需专注小时
const HATCH_HOURS = 12

// 项目里程碑（小时）
const MILESTONES = [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000]

function read(key, def) {
  try {
    const v = wx.getStorageSync(key)
    if (v === '' || v === null || v === undefined) return def
    return v
  } catch (e) {
    return def
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (e) {
    // ignore
  }
}

// 去掉值为 undefined 的键：Object.assign 会用 undefined 覆盖默认值，
// 曾导致新建项目把自动生成的 id 覆盖成 undefined
function compact(obj) {
  const out = {}
  Object.keys(obj || {}).forEach(function (k) {
    if (obj[k] !== undefined) out[k] = obj[k]
  })
  return out
}

// 数据变更钩子：由 utils/sync.js 注册，用来触发防抖同步
let changeHook = null

function setChangeHook(fn) {
  changeHook = fn
}

function notifyChange(kind) {
  if (typeof changeHook === 'function') {
    try { changeHook(kind) } catch (e) {}
  }
}

function now() {
  return Date.now()
}

function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/* ------------------------- 初始化 ------------------------- */

// 修复历史数据：给丢了 id 的项目补一个 id，并把挂空的记录接回去
function repair() {
  const list = read(KEYS.projects, [])
  const broken = []
  let touched = false
  const fixed = list.map(function (p) {
    let item = p
    if (item && !item.id) {
      item = Object.assign({}, item, { id: uid('p') })
      broken.push(item)
      touched = true
    }
    // 同步需要 updatedAt，老数据补一个
    if (item && !item.updatedAt) {
      item = Object.assign({}, item, { updatedAt: item.createdAt || now() })
      touched = true
    }
    return item
  })
  const records = read(KEYS.records, [])
  let recTouched = false
  const fixedRecords = records.map(function (r) {
    if (r && !r.updatedAt) {
      recTouched = true
      return Object.assign({}, r, { updatedAt: r.startAt || now() })
    }
    return r
  })
  if (recTouched) write(KEYS.records, fixedRecords)
  if (touched) write(KEYS.projects, fixed)
  if (!broken.length) return touched || recTouched

  write(KEYS.projects, fixed)
  // 只有恰好一个项目坏掉时，才敢把无主记录接给它；多个就不猜了
  if (broken.length === 1) {
    const records = read(KEYS.records, [])
    let touched = false
    const next = records.map(function (r) {
      if (r && !r.projectId) {
        touched = true
        return Object.assign({}, r, { projectId: broken[0].id })
      }
      return r
    })
    if (touched) write(KEYS.records, next)
  }
  return true
}

function bootstrap() {
  repair()
  if (read(KEYS.inited, false)) return
  const stamp = Date.now()
  const seeds = [
    { name: '背单词', icon: '🔤', color: COLORS[0], targetHours: 500 },
    { name: '练琴', icon: '🎹', color: COLORS[3], targetHours: 1000 },
    { name: '看书', icon: '📖', color: COLORS[2], targetHours: 2000 },
    { name: 'Coding', icon: '💻', color: COLORS[1], targetHours: 10000 }
  ]
  const projects = seeds.map(function (s, i) {
    return {
      id: uid('p'),
      name: s.name,
      icon: s.icon,
      color: s.color,
      targetHours: s.targetHours,
      remindOn: false,
      remindAt: '20:00',
      createdAt: stamp + i,
      updatedAt: stamp + i,
      archived: false,
      deleted: false,
      // 示例项目：没被动过就不上传，避免换设备后云端重复
      seed: true
    }
  })
  write(KEYS.projects, projects)
  write(KEYS.records, [])
  write(KEYS.settings, { remindOn: false, remindAt: '20:00', keepScreenOn: false, ambient: '',
    endSound: 'long', quickOn: true, quickMinutes: [10, 20, 30, 45, 60], hourlyTip: false })
  write(KEYS.inited, true)
}

/* ------------------------- 项目 ------------------------- */

function getProjects() {
  const list = read(KEYS.projects, [])
  // 必须有 id：没有 id 的脏数据会让 wx:key 失效、整页渲染报错
  return list.filter(function (p) { return p && p.id && !p.deleted && !p.archived })
}

// 只要主项目（没有父项目的）
function getRootProjects() {
  return getProjects().filter(function (p) { return !p.parentId })
}

// 某个项目的小项目
function getChildren(id) {
  return getProjects().filter(function (p) { return p.parentId === id })
}

function getArchivedProjects() {
  return read(KEYS.projects, []).filter(function (p) { return p && p.id && !p.deleted && p.archived })
}

// 项目自身 + 所有小项目的 id（含已归档的，归档/删除要连带处理）
function familyIds(id) {
  const all = read(KEYS.projects, []).filter(function (p) { return p && !p.deleted })
  const ids = [id]
  let grew = true
  while (grew) {
    grew = false
    all.forEach(function (p) {
      if (p.parentId && ids.indexOf(p.parentId) >= 0 && ids.indexOf(p.id) < 0) {
        ids.push(p.id)
        grew = true
      }
    })
  }
  return ids
}

// 项目（含小项目）的全部记录
function projectRecords(id) {
  const ids = familyIds(id)
  return getRecords().filter(function (r) { return ids.indexOf(r.projectId) >= 0 })
}

// 归档 / 取消归档，主项目连带小项目一起
function archiveProject(id, flag) {
  const archived = flag !== false
  const family = familyIds(id)
  const list = read(KEYS.projects, [])
  for (let i = 0; i < list.length; i++) {
    if (family.indexOf(list[i].id) >= 0) {
      list[i] = Object.assign({}, list[i], { archived: archived, updatedAt: now() })
    }
  }
  write(KEYS.projects, list)
  notifyChange('projects')
}

// 下一个里程碑
function nextMilestone(seconds) {
  const hours = (seconds || 0) / 3600
  for (let i = 0; i < MILESTONES.length; i++) {
    if (hours < MILESTONES[i]) {
      return { target: MILESTONES[i], needHours: MILESTONES[i] - hours, reached: false }
    }
  }
  const last = MILESTONES[MILESTONES.length - 1]
  return { target: last, needHours: 0, reached: true }
}

// 项目详情页用的一组指标
function projectStats(id) {
  const records = projectRecords(id)
  const total = sumSeconds(records)
  const days = {}
  records.forEach(function (r) { days[r.date] = true })
  const dayCount = Object.keys(days).length
  const first = records.length ? records[records.length - 1].date : ''
  const spanDays = first
    ? Math.max(1, Math.ceil((Date.now() - util.parseKey(first).getTime()) / 86400000))
    : 0
  const from = util.dateKey(util.addDays(new Date(), -6))
  const today = util.todayKey()
  return {
    totalSeconds: total,
    dayCount: dayCount,
    todaySeconds: sumSeconds(records.filter(function (r) { return r.date === today })),
    weeklySeconds: spanDays ? Math.round(total / Math.max(1, spanDays / 7)) : 0,
    last7Seconds: sumSeconds(records.filter(function (r) { return r.date >= from && r.date <= today })),
    milestone: nextMilestone(total),
    records: records
  }
}

function getProject(id) {
  const list = read(KEYS.projects, [])
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id && !list[i].deleted) return list[i]
  }
  return null
}

function saveProject(input) {
  const data = compact(input)
  const list = read(KEYS.projects, [])
  if (data.id) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === data.id) {
        list[i] = Object.assign({}, list[i], data, { updatedAt: now() })
        write(KEYS.projects, list)
        notifyChange('projects')
        return list[i]
      }
    }
  }
  const item = Object.assign({
    id: uid('p'),
    parentId: '',
    icon: ICONS[0],
    color: COLORS[0],
    targetHours: 100,
    remindOn: false,
    remindAt: '20:00',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archived: false,
    deleted: false
  }, data)
  item.updatedAt = now()
  list.push(item)
  write(KEYS.projects, list)
  notifyChange('projects')
  return item
}

// 删除保留墓碑（deleted + updatedAt），否则同步时删除无法传播到其他设备
function deleteProject(id) {
  const family = familyIds(id)
  const stamp = now()
  const list = read(KEYS.projects, []).map(function (p) {
    return family.indexOf(p.id) >= 0 ? Object.assign({}, p, { deleted: true, updatedAt: stamp }) : p
  })
  write(KEYS.projects, list)
  const records = read(KEYS.records, []).map(function (r) {
    return family.indexOf(r.projectId) >= 0 ? Object.assign({}, r, { deleted: true, updatedAt: stamp }) : r
  })
  write(KEYS.records, records)
  notifyChange('projects')
}

/* ------------------------- 记录 ------------------------- */

function getRecords() {
  const list = read(KEYS.records, [])
  return list.filter(function (r) { return r && r.id && !r.deleted })
    .sort(function (a, b) { return b.startAt - a.startAt })
}

function addRecord(record) {
  const list = read(KEYS.records, [])
  const item = Object.assign({
    id: uid('r'),
    projectId: '',
    seconds: 0,
    startAt: Date.now(),
    note: '',
    mode: 'manual',
    deleted: false
  }, compact(record))
  item.date = util.dateKey(item.startAt)
  item.updatedAt = now()
  list.push(item)
  write(KEYS.records, list)
  notifyChange('records')
  return item
}

function deleteRecord(id) {
  const stamp = now()
  write(KEYS.records, read(KEYS.records, []).map(function (r) {
    return r.id === id ? Object.assign({}, r, { deleted: true, updatedAt: stamp }) : r
  }))
  notifyChange('records')
}

function recordsOfDate(dateKey) {
  return getRecords().filter(function (r) { return r.date === dateKey })
}

function sumSeconds(records) {
  return records.reduce(function (acc, r) { return acc + (r.seconds || 0) }, 0)
}

// { projectId: seconds }
function secondsByProject(records) {
  const map = {}
  records.forEach(function (r) {
    map[r.projectId] = (map[r.projectId] || 0) + (r.seconds || 0)
  })
  return map
}

/* ------------------------- 计时器 ------------------------- */
// timer: { projectId, mode: 'up'|'down', target(秒), startAt, accumulated(秒), paused }

function getTimer() {
  return read(KEYS.timer, null)
}

function setTimer(timer) {
  if (!timer) {
    try { wx.removeStorageSync(KEYS.timer) } catch (e) {}
    return null
  }
  write(KEYS.timer, timer)
  return timer
}

function timerElapsed(timer) {
  if (!timer) return 0
  const running = timer.paused ? 0 : Math.floor((Date.now() - timer.startAt) / 1000)
  return Math.max(0, (timer.accumulated || 0) + running)
}


/* ------------------------- 同步（与云端合并） ------------------------- */

function syncMark() {
  return {
    syncAt: read(KEYS.syncAt, 0),
    pullMax: read(KEYS.pullMax, 0)
  }
}

function setSyncMark(patch) {
  if (patch.syncAt !== undefined) write(KEYS.syncAt, patch.syncAt)
  if (patch.pullMax !== undefined) write(KEYS.pullMax, patch.pullMax)
}

// 没被动过的示例项目（没记录、没编辑过）不上传，避免换设备后云端出现重复
function isUntouchedSeed(p, records) {
  if (!p || !p.seed) return false
  if (p.updatedAt && p.createdAt && p.updatedAt > p.createdAt) return false
  const family = familyIds(p.id)
  return !records.some(function (r) { return family.indexOf(r.projectId) >= 0 })
}

// 待上传的数据：updatedAt 比上次同步时间新的。
// 关键：还要保证引用完整 —— 待上传记录所属的项目、以及项目的上级项目，
// 即使自身没改动也必须一起上传，否则云端会出现「有记录没项目」的孤儿数据。
function dirty(since) {
  const mark = since === undefined ? read(KEYS.syncAt, 0) : since
  const allRecords = read(KEYS.records, [])
  const allProjects = read(KEYS.projects, []).filter(function (p) { return p && p.id })
  const liveRecords = allRecords.filter(function (r) { return !r.deleted })
  const byId = {}
  allProjects.forEach(function (p) { byId[p.id] = p })

  const records = allRecords.filter(function (r) {
    return r && r.id && (r.updatedAt || 0) > mark
  })

  const need = {}
  allProjects.forEach(function (p) {
    if (isUntouchedSeed(p, liveRecords)) return
    if ((p.updatedAt || 0) > mark) need[p.id] = true
  })
  // 带上待上传记录所属的项目
  records.forEach(function (r) {
    if (r.projectId && byId[r.projectId]) need[r.projectId] = true
  })
  // 带上所有上级项目
  Object.keys(need).forEach(function (id) {
    let cur = byId[id]
    let guard = 0
    while (cur && cur.parentId && byId[cur.parentId] && guard < 20) {
      need[cur.parentId] = true
      cur = byId[cur.parentId]
      guard++
    }
  })

  const projects = allProjects.filter(function (p) { return need[p.id] })
  return { projects: projects, records: records }
}

// 合并云端数据：同一条数据谁的 updatedAt 新就用谁的
function applyRemote(remote) {
  let changed = 0
  let maxUpdated = 0

  const mergeInto = function (key, incoming, idField) {
    if (!incoming || !incoming.length) return
    const list = read(key, [])
    const index = {}
    list.forEach(function (item, i) { if (item && item[idField]) index[item[idField]] = i })
    incoming.forEach(function (item) {
      if (!item || !item[idField]) return
      maxUpdated = Math.max(maxUpdated, item.updatedAt || 0)
      const at = index[item[idField]]
      if (at === undefined) {
        // 本地没有：墓碑就不用插了
        if (item.deleted) return
        list.push(item)
        index[item[idField]] = list.length - 1
        changed++
        return
      }
      const local = list[at]
      if ((item.updatedAt || 0) > (local.updatedAt || 0)) {
        list[at] = Object.assign({}, local, item)
        changed++
      }
    })
    write(key, list)
  }

  mergeInto(KEYS.projects, remote.projects, 'id')
  mergeInto(KEYS.records, remote.records, 'id')
  if (changed) {
    notifyChange('remote')
  }
  return { changed: changed, maxUpdated: maxUpdated }
}

// 云端已经有项目时，清掉本地没动过的示例项目
function dropUntouchedSeeds() {
  const records = read(KEYS.records, []).filter(function (r) { return !r.deleted })
  const list = read(KEYS.projects, [])
  const kept = list.filter(function (p) { return !isUntouchedSeed(p, records) })
  if (kept.length === list.length) return 0
  write(KEYS.projects, kept)
  notifyChange('projects')
  return list.length - kept.length
}

/* ------------------------- 设置 / 资料 ------------------------- */

function getSettings() {
  return read(KEYS.settings, { remindOn: false, remindAt: '20:00', keepScreenOn: false, ambient: '',
    endSound: 'long', quickOn: true, quickMinutes: [10, 20, 30, 45, 60], hourlyTip: false })
}

function saveSettings(patch) {
  const next = Object.assign(getSettings(), patch)
  write(KEYS.settings, next)
  return next
}

/* ------------------------- 账号（本地缓存） ------------------------- */
// 账号本体存在微信云开发的 users 集合里（见 cloudfunctions/auth）。
// 这里只缓存「当前登录用户」的公开字段，用于页面同步渲染；
// 真正的注册 / 登录 / 改资料走 utils/account.js 的异步接口。

function isEmail(email) {
  return EMAIL_RE.test(String(email || '').trim())
}

function getMe() {
  return read(KEYS.me, null)
}

function setMe(user) {
  if (!user) {
    try { wx.removeStorageSync(KEYS.me) } catch (e) {}
    return null
  }
  write(KEYS.me, user)
  return user
}

function isLoggedIn() {
  return !!getMe()
}

/* ------------------------- 资料 ------------------------- */

function getProfile() {
  const me = getMe()
  if (me) {
    return {
      loggedIn: true,
      id: me.id,
      email: me.email,
      nickName: me.nickName,
      handle: String(me.email || '').split('@')[0],
      avatar: me.avatar || '',
      pro: !!me.pro,
      inbox: me.inbox || 0
    }
  }
  return {
    loggedIn: false,
    id: '',
    email: '',
    nickName: '未登录',
    handle: 'guest',
    avatar: '',
    pro: false,
    inbox: 0
  }
}

// 只更新本地缓存（云端更新由 account.updateProfile 负责）
function saveProfile(patch) {
  const me = getMe()
  if (!me) return getProfile()
  setMe(Object.assign({}, me, patch))
  return getProfile()
}

/* ------------------------- 统计 ------------------------- */

function rangeSeconds(fromKey, toKey) {
  return getRecords().filter(function (r) {
    return r.date >= fromKey && r.date <= toKey
  })
}

function bucketByDate(records) {
  const map = {}
  ;(records || getRecords()).forEach(function (r) {
    map[r.date] = (map[r.date] || 0) + (r.seconds || 0)
  })
  return map
}

function lastDays(n, records) {
  const map = bucketByDate(records)
  const out = []
  const today = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = util.addDays(today, -i)
    const key = util.dateKey(d)
    out.push({
      key: key,
      label: util.WEEK_LABELS[d.getDay()],
      day: d.getDate(),
      seconds: map[key] || 0
    })
  }
  return out
}

function lastWeeks(n, records) {
  const map = bucketByDate(records)
  const out = []
  const base = util.startOfWeek(new Date())
  for (let i = n - 1; i >= 0; i--) {
    const start = util.addDays(base, -7 * i)
    let seconds = 0
    for (let d = 0; d < 7; d++) {
      seconds += map[util.dateKey(util.addDays(start, d))] || 0
    }
    out.push({
      key: util.dateKey(start),
      label: (start.getMonth() + 1) + '/' + start.getDate(),
      seconds: seconds
    })
  }
  return out
}

function sumByPrefix(map, prefix) {
  let seconds = 0
  Object.keys(map).forEach(function (k) {
    if (k.indexOf(prefix) === 0) seconds += map[k]
  })
  return seconds
}

function lastMonths(n, records) {
  const map = bucketByDate(records)
  const out = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({
      key: util.monthKey(d),
      label: (d.getMonth() + 1) + '月',
      seconds: sumByPrefix(map, util.monthKey(d))
    })
  }
  return out
}

// 支持长达 10 年的时间规划
function lastYears(n, records) {
  const map = bucketByDate(records)
  const out = []
  const year = new Date().getFullYear()
  for (let i = n - 1; i >= 0; i--) {
    const y = year - i
    out.push({ key: String(y), label: String(y).slice(2) + '年', seconds: sumByPrefix(map, String(y)) })
  }
  return out
}

function overview() {
  const records = getRecords()
  const total = sumSeconds(records)
  const days = records.length
    ? Math.max(1, Math.ceil((Date.now() - util.parseKey(records[records.length - 1].date).getTime()) / 86400000))
    : 0
  const weeks = days ? Math.max(1, days / 7) : 0
  return {
    count: records.length,
    totalSeconds: total,
    weeklySeconds: weeks ? Math.round(total / weeks) : 0,
    last7Seconds: sumSeconds(rangeSeconds(util.dateKey(util.addDays(new Date(), -6)), util.todayKey()))
  }
}

function monster() {
  const total = sumSeconds(getRecords())
  const hours = total / 3600
  return {
    hatched: Math.floor(hours / HATCH_HOURS),
    totalHours: util.hours(total),
    needHours: Math.max(0, (HATCH_HOURS - (hours % HATCH_HOURS))).toFixed(1).replace(/\.0$/, ''),
    progress: Math.min(100, Math.round(((hours % HATCH_HOURS) / HATCH_HOURS) * 100)),
    hatchHours: HATCH_HOURS
  }
}

function achievements() {
  const records = getRecords()
  const total = sumSeconds(records)
  const hours = total / 3600
  const dates = {}
  records.forEach(function (r) { dates[r.date] = true })
  const list = [
    { icon: '⏱', name: '第一次计时', done: records.length >= 1 },
    { icon: '🌱', name: '累计 1 小时', done: hours >= 1 },
    { icon: '🔥', name: '累计 10 小时', done: hours >= 10 },
    { icon: '💎', name: '累计 100 小时', done: hours >= 100 },
    { icon: '👑', name: '坚持 7 天', done: Object.keys(dates).length >= 7 }
  ]
  return { list: list, unlocked: list.filter(function (i) { return i.done }).length }
}

function exportData() {
  return {
    projects: read(KEYS.projects, []),
    records: read(KEYS.records, []),
    settings: getSettings(),
    exportedAt: Date.now()
  }
}

// 清空：所有项目与记录打上墓碑，这样登录状态下云端也会一起清掉
function clearAll() {
  const stamp = now()
  const tomb = function (item) {
    return Object.assign({}, item, { deleted: true, updatedAt: stamp })
  }
  write(KEYS.projects, read(KEYS.projects, []).map(tomb))
  write(KEYS.records, read(KEYS.records, []).map(tomb))
  ;[KEYS.timer, KEYS.settings, KEYS.inited].forEach(function (k) {
    try { wx.removeStorageSync(k) } catch (e) {}
  })
  bootstrap()
  notifyChange('clear')
}

// 生成一些示例记录，方便查看统计效果
function seedDemoRecords() {
  const projects = getProjects()
  if (!projects.length) return 0
  const list = read(KEYS.records, [])
  let added = 0
  for (let i = 0; i < 90; i++) {
    const day = util.addDays(new Date(), -i)
    const perDay = i % 3 === 0 ? 0 : 1 + (i % 2)
    for (let k = 0; k < perDay; k++) {
      const p = projects[(i + k) % projects.length]
      const minutes = 20 + ((i * 7 + k * 13) % 70)
      const startAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9 + k * 4, 0, 0).getTime()
      list.push({
        id: uid('r'),
        projectId: p.id,
        seconds: minutes * 60,
        startAt: startAt,
        date: util.dateKey(startAt),
        note: '',
        mode: 'demo'
      })
      added++
    }
  }
  write(KEYS.records, list)
  return added
}

module.exports = {
  KEYS,
  ICONS,
  COLORS,
  HATCH_HOURS,
  MILESTONES,
  bootstrap,
  repair,
  setChangeHook,
  syncMark,
  setSyncMark,
  dirty,
  applyRemote,
  dropUntouchedSeeds,
  getProjects,
  getRootProjects,
  getChildren,
  getArchivedProjects,
  familyIds,
  projectRecords,
  projectStats,
  nextMilestone,
  archiveProject,
  getProject,
  saveProject,
  deleteProject,
  getRecords,
  addRecord,
  deleteRecord,
  recordsOfDate,
  sumSeconds,
  secondsByProject,
  getTimer,
  setTimer,
  timerElapsed,
  getSettings,
  saveSettings,
  getProfile,
  saveProfile,
  isEmail,
  getMe,
  setMe,
  isLoggedIn,
  rangeSeconds,
  lastDays,
  lastWeeks,
  lastMonths,
  lastYears,
  overview,
  monster,
  achievements,
  exportData,
  clearAll,
  seedDemoRecords
}
