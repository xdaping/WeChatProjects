const store = require('../utils/store.js')

Component({
  data: {
    selected: 0,
    list: [
      { path: '/pages/index/index', icon: '🕐', text: '计划' },
      { path: '/pages/projects/projects', icon: '📋', text: '项目' },
      { path: '/pages/focus/focus', icon: '🏆', text: '专注', center: true },
      { path: '/pages/stats/stats', icon: '🥚', text: '统计' },
      { path: '/pages/profile/profile', icon: '👤', text: '我的' }
    ]
  },
  attached() {
    this.refreshBadge()
  },
  methods: {
    refreshBadge() {
      const inbox = store.getProfile().inbox
      const list = this.data.list.slice()
      list[4] = Object.assign({}, list[4], { dot: inbox > 0 ? inbox : '' })
      this.setData({ list: list })
    },
    onTap(e) {
      const path = e.currentTarget.dataset.path
      const index = Number(e.currentTarget.dataset.index)
      if (index === this.data.selected) return
      wx.switchTab({ url: path })
    }
  }
})
