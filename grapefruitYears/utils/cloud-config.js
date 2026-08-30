// 云开发环境配置
// 环境 ID 在：微信开发者工具 → 云开发 → 设置 → 环境 ID（形如 xxx-1a2b3c）
// 只有一个环境时也可以留空，SDK 会用默认环境。
module.exports = {
  env: 'cloud1-d7gbfd34lf91a47e8',
  // 账号云函数名，与 cloudfunctions/auth 目录同名
  authFunction: 'auth',
  // 同步云函数名，与 cloudfunctions/sync 目录同名
  syncFunction: 'sync'
}
