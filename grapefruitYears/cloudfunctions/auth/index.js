// cloudfunctions/auth/index.js
// 账号云函数：邮箱注册 / 登录 / 资料 / 改密码
// 密码用 scrypt + 每个用户独立随机盐，只在云端处理，客户端拿不到任何哈希。
// 身份识别用微信 openid：注册或登录成功后把当前 openid 记进 user.openids，
// 之后的请求靠 openid 认人，不需要自己发 token。
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const USERS = 'users'
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/

function newSalt() {
  return crypto.randomBytes(16).toString('hex')
}

function hash(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex')
}

function samePassword(password, user) {
  const a = Buffer.from(hash(password, user.salt), 'hex')
  const b = Buffer.from(String(user.hash), 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// 管理员密钥来自云函数环境变量 ADMIN_KEY，不写进代码、也不下发到客户端
function adminKeyOk(input) {
  const expect = String(process.env.ADMIN_KEY || '')
  if (!expect) return { ok: false, error: '云函数还没配置 ADMIN_KEY 环境变量' }
  if (expect.length < 16) return { ok: false, error: 'ADMIN_KEY 太短，请设置至少 16 位的随机串' }
  const a = crypto.createHash('sha256').update(String(input || '')).digest()
  const b = crypto.createHash('sha256').update(expect).digest()
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, error: '管理员密钥不正确' }
  return { ok: true }
}

function tempPassword() {
  // 去掉容易看错的 0/O/1/l/I
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = crypto.randomBytes(12)
  for (let i = 0; i < 12; i++) out += chars[bytes[i] % chars.length]
  return out
}

function normEmail(email) {
  return String(email || '').trim().toLowerCase()
}

// 返回给客户端的字段：不含 salt / hash / openids
function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    nickName: user.nickName,
    avatar: user.avatar || '',
    pro: !!user.pro,
    inbox: user.inbox || 0
  }
}

async function findByEmail(email) {
  const res = await db.collection(USERS).where({ email: email }).limit(1).get()
  return res.data[0] || null
}

async function findByOpenid(openid) {
  const res = await db.collection(USERS).where({ openids: openid }).limit(1).get()
  return res.data[0] || null
}

async function register(event, openid) {
  const email = normEmail(event.email)
  const password = String(event.password || '')
  if (!EMAIL_RE.test(email)) return { ok: false, error: '请输入正确的邮箱地址' }
  if (password.length < 6) return { ok: false, error: '密码至少 6 位' }
  if (event.confirm !== undefined && password !== String(event.confirm)) {
    return { ok: false, error: '两次输入的密码不一致' }
  }
  if (await findByEmail(email)) return { ok: false, error: '该邮箱已注册，直接登录吧' }

  const salt = newSalt()
  const nickName = (event.nickName && String(event.nickName).trim()) || email.split('@')[0]
  const doc = {
    email: email,
    nickName: nickName,
    salt: salt,
    hash: hash(password, salt),
    avatar: '',
    pro: false,
    inbox: 1,
    openids: openid ? [openid] : [],
    createdAt: db.serverDate(),
    lastLoginAt: db.serverDate()
  }
  const added = await db.collection(USERS).add({ data: doc })
  doc._id = added._id
  return { ok: true, user: publicUser(doc) }
}

async function login(event, openid) {
  const email = normEmail(event.email)
  const password = String(event.password || '')
  if (!EMAIL_RE.test(email)) return { ok: false, error: '请输入正确的邮箱地址' }
  const user = await findByEmail(email)
  if (!user) return { ok: false, error: '该邮箱还没有注册' }
  if (!samePassword(password, user)) return { ok: false, error: '密码不正确' }

  await db.collection(USERS).doc(user._id).update({
    data: { openids: _.addToSet(openid), lastLoginAt: db.serverDate() }
  })
  return { ok: true, user: publicUser(user) }
}

async function me(openid) {
  const user = await findByOpenid(openid)
  return { ok: true, user: user ? publicUser(user) : null }
}

async function logout(openid) {
  const user = await findByOpenid(openid)
  if (user) {
    await db.collection(USERS).doc(user._id).update({ data: { openids: _.pull(openid) } })
  }
  return { ok: true }
}

async function updateProfile(event, openid) {
  const user = await findByOpenid(openid)
  if (!user) return { ok: false, error: '请先登录' }
  const patch = {}
  if (event.nickName !== undefined) {
    const name = String(event.nickName).trim()
    if (!name) return { ok: false, error: '昵称不能为空' }
    patch.nickName = name.slice(0, 20)
  }
  if (event.avatar !== undefined) patch.avatar = String(event.avatar)
  if (event.pro !== undefined) patch.pro = !!event.pro
  if (event.inbox !== undefined) patch.inbox = Number(event.inbox) || 0
  if (!Object.keys(patch).length) return { ok: false, error: '没有需要更新的内容' }

  await db.collection(USERS).doc(user._id).update({ data: patch })
  return { ok: true, user: publicUser(Object.assign({}, user, patch)) }
}

async function changePassword(event, openid) {
  const user = await findByOpenid(openid)
  if (!user) return { ok: false, error: '请先登录' }
  if (!samePassword(String(event.oldPassword || ''), user)) return { ok: false, error: '原密码不正确' }
  const next = String(event.newPassword || '')
  if (next.length < 6) return { ok: false, error: '新密码至少 6 位' }
  const salt = newSalt()
  await db.collection(USERS).doc(user._id).update({
    data: { salt: salt, hash: hash(next, salt) }
  })
  return { ok: true }
}

// 管理员重置密码：用于用户忘记密码，保留昵称/头像/会员状态
// 只能带正确 ADMIN_KEY 调用，不依赖 openid（方便在云开发控制台的「云端测试」里直接调）
async function adminResetPassword(event) {
  const guard = adminKeyOk(event.adminKey)
  if (!guard.ok) return guard

  const email = normEmail(event.email)
  if (!EMAIL_RE.test(email)) return { ok: false, error: '请输入正确的邮箱地址' }
  const user = await findByEmail(email)
  if (!user) return { ok: false, error: '该邮箱还没有注册' }

  const password = event.newPassword ? String(event.newPassword) : tempPassword()
  if (password.length < 6) return { ok: false, error: '新密码至少 6 位' }

  const salt = newSalt()
  await db.collection(USERS).doc(user._id).update({
    data: {
      salt: salt,
      hash: hash(password, salt),
      // 重置后强制所有设备重新登录
      openids: [],
      passwordResetAt: db.serverDate()
    }
  })
  return {
    ok: true,
    email: user.email,
    password: password,
    generated: !event.newPassword,
    message: '已重置，把这个密码给用户，登录后请让 TA 到 设置 → 修改密码 改掉'
  }
}

exports.main = async function (event) {
  // 管理员操作走密钥校验，不需要 openid
  if (event.action === 'adminResetPassword') {
    try {
      return await adminResetPassword(event)
    } catch (err) {
      return { ok: false, error: '服务异常：' + String((err && err.errMsg) || (err && err.message) || err) }
    }
  }

  const openid = cloud.getWXContext().OPENID
  if (!openid) return { ok: false, error: '拿不到微信身份，请在小程序内调用' }
  try {
    switch (event.action) {
      case 'register': return await register(event, openid)
      case 'login': return await login(event, openid)
      case 'me': return await me(openid)
      case 'logout': return await logout(openid)
      case 'updateProfile': return await updateProfile(event, openid)
      case 'changePassword': return await changePassword(event, openid)
      default: return { ok: false, error: '未知操作：' + event.action }
    }
  } catch (err) {
    // 集合不存在时给出可操作的提示
    const msg = String((err && err.errMsg) || (err && err.message) || err)
    if (msg.indexOf('collection not exists') >= 0 || msg.indexOf('database collection not exists') >= 0) {
      return { ok: false, error: '云数据库还没有 users 集合，请先在云开发控制台创建' }
    }
    return { ok: false, error: '服务异常：' + msg }
  }
}
