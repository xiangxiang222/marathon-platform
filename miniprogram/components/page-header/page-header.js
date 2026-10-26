Component({
  properties: {
    title: { type: String, value: "" },
    subtitle: { type: String, value: "" }
  },
  data: { statusBarHeight: 20, navHeight: 44, headerRight: 108 },
  lifetimes: {
    attached() { this.updateMetrics(); }
  },
  pageLifetimes: {
    resize() { this.updateMetrics(); }
  },
  methods: {
    updateMetrics() {
      let info = {};
      try {
        info = typeof wx.getWindowInfo === "function" ? wx.getWindowInfo() : wx.getSystemInfoSync();
      } catch (error) {
        try { info = wx.getSystemInfoSync(); } catch (ignored) {}
      }
      const rawHeight = Number(info.statusBarHeight);
      const statusBarHeight = Number.isFinite(rawHeight) && rawHeight >= 0 ? rawHeight : 20;
      const width = Number(info.windowWidth) || 375;
      let capsule;
      try { capsule = wx.getMenuButtonBoundingClientRect(); } catch (ignored) {}
      const valid = capsule && capsule.width > 0 && capsule.height > 0 && capsule.top >= statusBarHeight;
      this.setData({
        statusBarHeight,
        navHeight: valid ? Math.max(44, capsule.height + 2 * (capsule.top - statusBarHeight)) : 44,
        headerRight: valid ? capsule.width + Math.max(0, width - capsule.right) + 12 : 108
      });
    }
  }
});
