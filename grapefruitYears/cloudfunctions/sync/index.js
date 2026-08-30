// cloudfunctions/sync/index.js
// 项目与时间记录的云同步：push 上传本地改动，pull 拉取云端改动。
// 冲突策略：同一条数据比较 updatedAt，谁新用谁的（last-write-wins）。
// 身份：靠微信 openid 找到 users 里的账号，用它的 _id 作为 userId 隔离数据。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const USERS = 'users'
const COLLECTIONS = { projects: 'projects', records: 'records' }
const PAGE = 500
const MAX_PUSH = 2000

function pickProject(item) {
  return {
    cid: String(item.id),
    parentId: item.parentId || '',
    name: String(item.name || '').slice(0, 60),
    icon: item.icon || '',
    color: item.color || '',
    targetHours: Number(item.targetHours) || 0,
    remindOn: !!item.remindOn,
    remindAt: item.remindAt || '',
    archived: !!item.archived,
    seed: !!item.seed,
    createdAt: Number(item.createdAt) || 0,
    updatedAt: Number(item.updatedAt) || 0,
    deleted: !!item.deleted
  }
}

function pickRecord(item) {
  return {
    cid: String(item.id),
    projectCid: String(item.projectId || ''),
    seconds: Math.max(0, Math.floor(Number(item.seconds) || 0)),
    startAt: Number(item.startAt) || 0,
    date: String(item.date || ''),
    note: String(item.note || '').slice(0, 200),
    mode: item.mode || 'manual',
    updatedAt: Number(item.updatedAt) || 0,
    deleted: !!item.deleted
  }
}

// 云端字段还原成客户端结构
function toClientProject(doc) {
  return {
    id: doc.cid,
    parentId: doc.parentId || '',
    name: doc.name,
    icon: doc.icon,
    color: doc.color,
    targetHours: doc.targetHours,
    remindOn: doc.remindOn,
    remindAt: doc.remindAt,
    archived: doc.archived,
    seed: doc.seed,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deleted: doc.deleted
  }
}

function toClientRecord(doc) {
  return {
    id: doc.cid,
    projectId: doc.projectCid,
    seconds: doc.seconds,
    startAt: doc.startAt,
    date: doc.date,
    note: doc.note,
    mode: doc.mode,
    updatedAt: doc.updatedAt,
    deleted: doc.deleted
  }
}

async function currentUserId(openid) {
  const res = await db.collection(USERS).where({ openids: openid }).limit(1).get()
  const user = res.data[0]
  return user ? user._id : ''
}

// upsert：已存在则比较 updatedAt，新的才覆盖。
// 分批并发，避免逐条串行把云函数超时耗光。
const CONCURRENCY = 10

async function upsertOne(collection, userId, item) {
  const found = await db.collection(collection)
    .where({ userId: userId, cid: item.cid }).limit(1).get()
  const exist = found.data[0]
  if (!exist) {
    await db.collection(collection).add({ data: Object.assign({ userId: userId }, item) })
    return 'written'
  }
  if ((item.updatedAt || 0) > (exist.updatedAt || 0)) {
    await db.collection(collection).doc(exist._id).update({ data: item })
    return 'written'
  }
  return 'skipped'
}

async function upsertAll(collection, userId, items) {
  let written = 0
  let skipped = 0
  const valid = items.filter(function (i) { return i && i.cid })
  skipped += items.length - valid.length

  for (let i = 0; i < valid.length; i += CONCURRENCY) {
    const batch = valid.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(function (item) {
      return upsertOne(collection, userId, item)
    }))
    results.forEach(function (r) {
      if (r === 'written') written++
      else skipped++
    })
  }
  return { written: written, skipped: skipped }
}

async function pullAll(collection, userId, since) {
  const out = []
  let skip = 0
  for (;;) {
    const res = await db.collection(collection)
      .where({ userId: userId, updatedAt: _.gt(Number(since) || 0) })
      .orderBy('updatedAt', 'asc')
      .skip(skip)
      .limit(PAGE)
      .get()
    out.push.apply(out, res.data)
    if (res.data.length < PAGE) break
    skip += PAGE
    if (skip >= 20000) break
  }
  return out
}

exports.main = async function (event) {
  const openid = cloud.getWXContext().OPENID
  if (!openid) return { ok: false, error: '拿不到微信身份，请在小程序内调用' }

  try {
    const userId = await currentUserId(openid)
    if (!userId) return { ok: false, error: '请先登录岁月 ID 再同步', needLogin: true }

    if (event.action === 'push') {
      const projects = (event.projects || []).slice(0, MAX_PUSH).map(pickProject)
      const records = (event.records || []).slice(0, MAX_PUSH).map(pickRecord)
      const p = await upsertAll(COLLECTIONS.projects, userId, projects)
      const r = await upsertAll(COLLECTIONS.records, userId, records)
      return {
        ok: true,
        pushed: { projects: p.written, records: r.written },
        skipped: { projects: p.skipped, records: r.skipped },
        serverNow: Date.now()
      }
    }

    if (event.action === 'pull') {
      const since = Number(event.since) || 0
      const projects = await pullAll(COLLECTIONS.projects, userId, since)
      const records = await pullAll(COLLECTIONS.records, userId, since)
      return {
        ok: true,
        projects: projects.map(toClientProject),
        records: records.map(toClientRecord),
        serverNow: Date.now()
      }
    }

    if (event.action === 'summary') {
      const p = await db.collection(COLLECTIONS.projects).where({ userId: userId, deleted: false }).count()
      const r = await db.collection(COLLECTIONS.records).where({ userId: userId, deleted: false }).count()
      const pAll = await db.collection(COLLECTIONS.projects).where({ userId: userId }).count()
      const rAll = await db.collection(COLLECTIONS.records).where({ userId: userId }).count()
      return {
        ok: true,
        userId: userId,
        projects: p.total,
        records: r.total,
        projectsAll: pAll.total,
        recordsAll: rAll.total,
        serverNow: Date.now()
      }
    }

    return { ok: false, error: '未知操作：' + event.action }
  } catch (err) {
    const msg = String((err && err.errMsg) || (err && err.message) || err)
    if (msg.indexOf('collection not exists') >= 0) {
      return { ok: false, error: '云数据库缺少 projects / records 集合，请先在云开发控制台创建' }
    }
    return { ok: false, error: '同步失败：' + msg }
  }
}
