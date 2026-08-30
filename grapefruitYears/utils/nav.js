// utils/nav.js 页面跳转封装
// navigateTo 失败时微信只在控制台打印，界面上「点了没反应」很难查，
// 这里统一给出 toast，并在页面栈过深时退化成 redirectTo。
function go(url) {
  if (!url) return
  wx.navigateTo({
    url: url,
    fail: function (err) {
      const msg = String((err && err.errMsg) || err)
      const deep = (getCurrentPages() || []).length >= 10 || msg.indexOf('limit') >= 0
      if (deep) {
        wx.redirectTo({
          url: url,
          fail: function () {
            wx.showToast({ title: '页面层级过深，请先返回', icon: 'none' })
          }
        })
        return
      }
      wx.showToast({ title: '打开失败：' + msg, icon: 'none', duration: 3000 })
      console.error('[nav] navigateTo 失败', url, err)
    }
  })
}

module.exports = { go }
