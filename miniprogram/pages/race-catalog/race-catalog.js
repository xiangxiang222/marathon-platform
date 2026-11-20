const { request } = require('../../utils/request');
const { landmarkSrc } = require('../../utils/race-landmarks');
function certification(v) { return v && v.label ? v.label + (v.year ? ' · ' + v.year : '') : '待核实'; }
Page({
  data: { q: '', wa: '', caa: '', waOptions: ['全部标牌'], caaOptions: ['全部认证'], waIndex: 0, caaIndex: 0, races: [], loading: true, message: '', selectionNote: '' },
  onLoad(query) { this._seq = 0; this._disposed = false; this.setData({ q: query.q || '', wa: query.wa || '', caa: query.caa || '' }); this.load(); },
  onUnload() { this._disposed = true; this._seq++; },
  onQ(e) { this.setData({ q: e.detail.value }); },
  pickWa(e) { const index = Number(e.detail.value); this.setData({ waIndex: index, wa: index ? this.data.waOptions[index] : '' }); this.load(); },
  pickCaa(e) { const index = Number(e.detail.value); this.setData({ caaIndex: index, caa: index ? this.data.caaOptions[index] : '' }); this.load(); },
  clear() { this.setData({ q: '', wa: '', caa: '', waIndex: 0, caaIndex: 0 }); this.load(); },
  load() { const seq = ++this._seq; this.setData({ loading: true, message: '' }); return request('/race-catalog?q=' + encodeURIComponent(this.data.q.trim()) + '&wa=' + encodeURIComponent(this.data.wa) + '&caa=' + encodeURIComponent(this.data.caa)).then(d => { if (this._disposed || seq !== this._seq) return; const races=Array.isArray(d.races)?d.races:[],options=d.filterOptions||{};const waOptions=['全部标牌',...new Set([...(options.worldAthletics||this.data.waOptions.slice(1)),...races.map(r=>r.worldAthletics&&r.worldAthletics.label),this.data.wa].filter(Boolean))],caaOptions=['全部认证',...new Set([...(options.caa||this.data.caaOptions.slice(1)),...races.map(r=>r.caa&&r.caa.label),this.data.caa].filter(Boolean))]; this.setData({ waOptions,caaOptions,waIndex:Math.max(0,waOptions.indexOf(this.data.wa)),caaIndex:Math.max(0,caaOptions.indexOf(this.data.caa)),races: races.map(r => ({ ...r, archiveUrl:'/pages/race-archive/race-archive?id='+encodeURIComponent(r.id)+['q','wa','caa'].filter(key=>this.data[key]).map(key=>'&'+key+'='+encodeURIComponent(this.data[key])).join(''), landmarkSrc: landmarkSrc(r.id), waLabel: certification(r.worldAthletics), caaLabel: certification(r.caa), archiveCount: Array.isArray(r.years) ? r.years.length : 0 })), selectionNote: d.selectionNote || '', loading: false }); }).catch(e => { if (!this._disposed && seq === this._seq) this.setData({ message: e.message || '赛事档案暂时无法加载', loading: false }); }); },
  onShareAppMessage() { return { title: '赛事档案 · 认识你的下一场马拉松', path: '/pages/race-catalog/race-catalog' }; }
});
