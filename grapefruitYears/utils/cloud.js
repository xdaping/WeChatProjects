// utils/cloud.js 云开发调用封装
const config = require('./cloud-config.js')

let inited = false

function ensureInit() {
  if (!wx.cloud) {
    return { ok: false, error: '当前基础库不支持云开发，请升级微信开发者工具/微信版本' }
  }
  if (!inited) {
    try {
      wx.cloud.init({
        env: config.env || undefined,
        traceUser: true
      })
      inited = true
    } catch (e) {
      return { ok: false, error: '云开发初始化失败：' + ((e && e.message) || e) }
    }
  }
  return { ok: true }
}

// 统一调用云函数，永远 resolve 出 { ok, ... }，调用方不用 try/catch
function call(name, action, data) {
  const ready = ensureInit()
  if (!ready.ok) return Promise.resolve(ready)

  return new Promise(function (resolve) {
    wx.cloud.callFunction({
      name: name,
      data: Object.assign({ action: action }, data || {}),
      success: function (res) {
        const out = res && res.result
        if (!out || typeof out.ok !== 'boolean') {
          resolve({ ok: false, error: '云函数返回异常，请检查 ' + name + ' 云函数是否已部署' })
          return
        }
        resolve(out)
      },
      fail: function (err) {
        const msg = String((err && err.errMsg) || err)
        if (msg.indexOf('FunctionName') >= 0 || msg.indexOf('not found') >= 0 || msg.indexOf('404') >= 0) {
          resolve({ ok: false, error: name + ' 云函数还没上传部署，请在 cloudfunctions/' + name + ' 上右键上传' })
          return
        }
        if (msg.indexOf('env') >= 0 || msg.indexOf('environment') >= 0) {
          resolve({ ok: false, error: '云开发环境未配置，请在 utils/cloud-config.js 填写环境 ID' })
          return
        }
        resolve({ ok: false, error: '网络或云函数调用失败：' + msg })
      }
    })
  })
}

function callAuth(action, data) {
  return call(config.authFunction, action, data)
}

function callSync(action, data) {
  return call(config.syncFunction, action, data)
}

module.exports = {
  ensureInit,
  call,
  callAuth,
  callSync
}
