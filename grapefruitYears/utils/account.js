// utils/account.js 账号：邮箱注册 / 登录（微信云开发）
// 所有方法都返回 Promise<{ ok, error?, user? }>，不会 reject。
const cloud = require('./cloud.js')
const store = require('./store.js')
const sync = require('./sync.js')

function fail(error) {
  return Promise.resolve({ ok: false, error: error })
}

function register(form) {
  const email = String((form && form.email) || '').trim()
  const password = String((form && form.password) || '')
  if (!store.isEmail(email)) return fail('请输入正确的邮箱地址')
  if (password.length < 6) return fail('密码至少 6 位')
  if (form.confirm !== undefined && password !== String(form.confirm)) return fail('两次输入的密码不一致')

  return cloud.callAuth('register', {
    email: email,
    password: password,
    confirm: form.confirm,
    nickName: form.nickName
  }).then(function (res) {
    if (res.ok && res.user) store.setMe(res.user)
    return res
  })
}

function login(form) {
  const email = String((form && form.email) || '').trim()
  const password = String((form && form.password) || '')
  if (!store.isEmail(email)) return fail('请输入正确的邮箱地址')
  if (!password) return fail('请输入密码')

  return cloud.callAuth('login', { email: email, password: password }).then(function (res) {
    if (res.ok && res.user) store.setMe(res.user)
    return res
  })
}

function logout() {
  sync.stop()
  store.setMe(null)
  // 本地先退出，云端解绑失败也不影响使用
  return cloud.callAuth('logout', {})
}

// 拉一次云端的最新资料；云端说没登录就清掉本地缓存
function refresh() {
  if (!store.isLoggedIn()) return Promise.resolve({ ok: true, user: null })
  return cloud.callAuth('me', {}).then(function (res) {
    if (res.ok) store.setMe(res.user || null)
    return res
  })
}

// 先改本地缓存让界面立刻响应，云端失败再回滚
function updateProfile(patch) {
  if (!store.isLoggedIn()) return fail('请先登录')
  const before = store.getMe()
  store.saveProfile(patch)
  return cloud.callAuth('updateProfile', patch).then(function (res) {
    if (res.ok && res.user) store.setMe(res.user)
    else store.setMe(before)
    return res
  })
}

function changePassword(oldPassword, newPassword) {
  if (!store.isLoggedIn()) return fail('请先登录')
  if (String(newPassword || '').length < 6) return fail('新密码至少 6 位')
  return cloud.callAuth('changePassword', {
    oldPassword: oldPassword,
    newPassword: newPassword
  })
}

// 登录/注册成功后把本机数据并到云端，再拉云端数据
function mergeAfterLogin() {
  return sync.mergeAfterLogin()
}

module.exports = {
  mergeAfterLogin,
  register,
  login,
  logout,
  refresh,
  updateProfile,
  changePassword
}
