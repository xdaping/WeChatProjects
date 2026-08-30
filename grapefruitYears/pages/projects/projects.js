// pages/projects/projects.js 我的项目
const app = getApp()
const store = require('../../utils/store.js')
const nav = require('../../utils/nav.js')
const util = require('../../utils/util.js')

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    capsuleRight: 96,
    projects: [],
    archivedCount: 0
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
      capsuleRight: app.globalData.capsuleRight
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.refresh()
  },

  refresh() {
    const projects = store.getRootProjects().map(function (p) {
      const st = store.projectStats(p.id)
      const target = (p.targetHours || 0) * 3600
      return Object.assign({}, p, {
        recordCount: st.records.length,
        childCount: store.getChildren(p.id).length,
        totalHours: util.hours(st.totalSeconds),
        reachedPercent: target ? Math.round((st.totalSeconds / target) * 100) : 0
      })
    })
    this.setData({
      projects: projects,
      archivedCount: store.getArchivedProjects().filter(function (p) { return !p.parentId }).length
    })
  },

  goIndex() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  addProject() {
    nav.go('/pages/project-edit/project-edit')
  },

  openProject(e) {
    nav.go('/pages/project-detail/project-detail?id=' + e.currentTarget.dataset.id)
  },

  editProject(e) {
    nav.go('/pages/project-edit/project-edit?id=' + e.currentTarget.dataset.id)
  },

  // 已归档项目：恢复或彻底删除
  openArchived() {
    const list = store.getArchivedProjects().filter(function (p) { return !p.parentId })
    if (!list.length) {
      wx.showToast({ title: '没有已归档项目', icon: 'none' })
      return
    }
    const that = this
    wx.showActionSheet({
      itemList: list.map(function (p) { return p.icon + ' ' + p.name }),
      success: function (res) {
        const project = list[res.tapIndex]
        wx.showModal({
          title: project.name,
          content: '恢复到项目列表，或彻底删除（记录一并删除）',
          confirmText: '恢复',
          cancelText: '彻底删除',
          success: function (r) {
            if (r.confirm) {
              store.archiveProject(project.id, false)
              wx.showToast({ title: '已恢复', icon: 'none' })
            } else if (r.cancel) {
              store.deleteProject(project.id)
              wx.showToast({ title: '已删除', icon: 'none' })
            }
            that.refresh()
          }
        })
      }
    })
  },

  moreProject(e) {
    const id = e.currentTarget.dataset.id
    const project = store.getProject(id)
    if (!project) return
    const that = this
    wx.showActionSheet({
      itemList: ['开始专注计时', '编辑项目', '添加小项目', '归档项目', '删除项目'],
      success: function (res) {
        if (res.tapIndex === 0) {
          app.globalData.pendingProjectId = id
          wx.switchTab({ url: '/pages/focus/focus' })
        } else if (res.tapIndex === 1) {
          nav.go('/pages/project-edit/project-edit?id=' + id)
        } else if (res.tapIndex === 2) {
          nav.go('/pages/project-edit/project-edit?parentId=' + id)
        } else if (res.tapIndex === 3) {
          wx.showModal({
            title: '归档「' + project.name + '」',
            content: '归档后不在列表显示，记录会保留，可在「已归档项目」里恢复',
            success: function (r) {
              if (r.confirm) {
                store.archiveProject(id, true)
                that.refresh()
                wx.showToast({ title: '已归档', icon: 'none' })
              }
            }
          })
        } else if (res.tapIndex === 4) {
          wx.showModal({
            title: '删除「' + project.name + '」',
            content: '该项目下的所有记录也会一并删除',
            confirmColor: '#ff3b30',
            success: function (r) {
              if (r.confirm) {
                store.deleteProject(id)
                that.refresh()
                wx.showToast({ title: '已删除', icon: 'none' })
              }
            }
          })
        }
      }
    })
  }
})
