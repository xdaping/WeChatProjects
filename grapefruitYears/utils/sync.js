// utils/sync.js 项目与记录的云同步
// 策略：本地优先。未登录时数据只在本机；登录后双向合并（同一条比 updatedAt，谁新用谁的），
// 本地独有的会上传，云端独有的会拉下来 —— 也就是「登录后合并上传」。
const cloud = require('./cloud.js')
const store = require('./store.js')

const DEBOUNCE = 4000
// 时间戳边界留 1 秒重叠：同一毫秒内的写入不会被漏掉，
// 重复上传/拉取是幂等的（云端按 updatedAt 判断，不会覆盖新数据）
const OVERLAP = 1000
let syncing = false
let pending = false
let timer = null
let lastResult = null

function enabled() {
  return store.isLoggedIn()
}

function summary() {
  const mark = store.syncMark()
  return {
    loggedIn: enabled(),
    syncAt: mark.syncAt,
    syncing: syncing,
    last: lastResult
  }
}

// 数据一变就排一次同步（合并短时间内的多次改动）
function schedule(reason) {
  if (!enabled()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(function () {
    timer = null
    run(reason || 'change')
  }, DEBOUNCE)
}

function hook() {
  store.setChangeHook(function (kind) {
    schedule('change:' + kind)
  })
}

// 立即同步；并发调用会合并成一次
function run(reason) {
  if (!enabled()) {
    return Promise.resolve({ ok: false, error: '未登录，数据只保存在本机', needLogin: true })
  }
  if (syncing) {
    pending = true
    return Promise.resolve({ ok: true, merged: true })
  }
  syncing = true

  const startedAt = Date.now()
  const mark = store.syncMark()
  const outgoing = store.dirty(Math.max(0, mark.syncAt - OVERLAP))

  const push = (outgoing.projects.length || outgoing.records.length)
    ? cloud.callSync('push', { projects: outgoing.projects, records: outgoing.records })
    : Promise.resolve({ ok: true, pushed: { projects: 0, records: 0 } })

  return push.then(function (pushed) {
    if (!pushed.ok) return pushed
    const since = Math.max(0, mark.pullMax - OVERLAP)
    return cloud.callSync('pull', { since: since }).then(function (pulled) {
      if (!pulled.ok) return pulled

      const applied = store.applyRemote({
        projects: pulled.projects || [],
        records: pulled.records || []
      })

      // 云端已有项目时，清掉本地那几个没动过的示例项目
      let dropped = 0
      if ((pulled.projects || []).some(function (p) { return !p.deleted })) {
        dropped = store.dropUntouchedSeeds()
      }

      store.setSyncMark({
        syncAt: startedAt,
        pullMax: Math.max(mark.pullMax, applied.maxUpdated || 0)
      })

      return {
        ok: true,
        reason: reason || 'manual',
        pushed: pushed.pushed || { projects: 0, records: 0 },
        pulled: {
          projects: (pulled.projects || []).length,
          records: (pulled.records || []).length
        },
        applied: applied.changed,
        dropped: dropped,
        at: startedAt
      }
    })
  }).catch(function (err) {
    return { ok: false, error: '同步异常：' + String((err && err.message) || err) }
  }).then(function (result) {
    syncing = false
    lastResult = result
    if (result && result.needLogin) store.setSyncMark({ syncAt: 0, pullMax: 0 })
    if (pending) {
      pending = false
      schedule('pending')
    }
    return result
  })
}

// 登录/注册成功后调用：把本机数据并上去，再把云端数据拉下来
function mergeAfterLogin() {
  // 全量重扫本地数据（syncAt 归零），确保未登录期间记的东西都会上传
  store.setSyncMark({ syncAt: 0, pullMax: 0 })
  return run('login')
}

// 退出登录：停止同步，本地数据保留
function stop() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  store.setSyncMark({ syncAt: 0, pullMax: 0 })
}

// 同步自检：一步步报告卡在哪
function diagnose() {
  const local = {
    projects: store.getProjects().length,
    records: store.getRecords().length
  }
  const mark = store.syncMark()
  const lines = []
  lines.push('登录状态：' + (enabled() ? '已登录 ' + (store.getMe() || {}).email : '未登录（数据只在本机）'))
  lines.push('本机：' + local.projects + ' 个项目 / ' + local.records + ' 条记录')
  lines.push('上次同步：' + (mark.syncAt ? new Date(mark.syncAt).toLocaleString() : '从未成功'))

  if (!enabled()) {
    return Promise.resolve({ ok: false, text: lines.join('\n') + '\n\n请先登录，登录后才会同步。' })
  }

  return cloud.callSync('summary', {}).then(function (res) {
    if (!res.ok) {
      lines.push('云端：调用失败 —— ' + res.error)
      return { ok: false, text: lines.join('\n') }
    }
    lines.push('云端：' + res.projects + ' 个项目 / ' + res.records + ' 条记录'
      + '（含已删除 ' + res.projectsAll + '/' + res.recordsAll + '）')
    const healthy = res.records >= local.records && res.projects >= local.projects
    lines.push(healthy ? '状态：正常，本机数据都在云端' : '状态：云端条数少于本机，点「立即同步」补传')
    return { ok: true, text: lines.join('\n'), cloud: res, local: local }
  })
}

module.exports = {
  diagnose,
  enabled,
  summary,
  hook,
  schedule,
  run,
  mergeAfterLogin,
  stop
}
