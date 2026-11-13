const { request } = require('../../utils/request');
function certification(v) { return v && v.label ? v.label + (v.year ? ' · ' + v.year : '') : '待核实'; }
Page({
  data: { q: '', wa: '', caa: '', waOptions: ['全部标牌', '白金标', '金标'], caaOptions: ['全部认证', 'A 类赛事'], waIndex: 0, caaIndex: 0, races: [], loading: true, message: '', selectionNote: '' },
  onLoad(query) { this._seq = 0; this._disposed = false; const waIndex = ['白金标', '金标'].indexOf(query.wa) + 1, caaIndex = query.caa === 'A类' ? 1 : 0; this.setData({ q: query.q || '', wa: waIndex ? query.wa : '', caa: caaIndex ? 'A类' : '', waIndex, caaIndex }); this.load(); },
  onUnload() { this._disposed = true; this._seq++; },
  onQ(e) { this.setData({ q: e.detail.value }); },
  pickWa(e) { const index = Number(e.detail.value); this.setData({ waIndex: index, wa: index ? this.data.waOptions[index] : '' }); this.load(); },
  pickCaa(e) { const index = Number(e.detail.value); this.setData({ caaIndex: index, caa: index ? 'A类' : '' }); this.load(); },
  clear() { this.setData({ q: '', wa: '', caa: '', waIndex: 0, caaIndex: 0 }); this.load(); },
  load() { const seq = ++this._seq; this.setData({ loading: true, message: '' }); return request('/race-catalog?q=' + encodeURIComponent(this.data.q.trim()) + '&wa=' + encodeURIComponent(this.data.wa) + '&caa=' + encodeURIComponent(this.data.caa)).then(d => { if (this._disposed || seq !== this._seq) return; this.setData({ races: (d.races || []).map(r => ({ ...r, waLabel: certification(r.worldAthletics), caaLabel: certification(r.caa) })), selectionNote: d.selectionNote || '', loading: false }); }).catch(e => { if (!this._disposed && seq === this._seq) this.setData({ message: e.message || '赛事档案暂时无法加载', loading: false }); }); },
  onShareAppMessage() { return { title: '赛事档案 · 认识你的下一场马拉松', path: '/pages/race-catalog/race-catalog' }; }
});
