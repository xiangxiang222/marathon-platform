const { request } = require('../../utils/request');
const { parseGuide } = require('../../utils/guide-md');
const RIGHTS = ['original', 'authorized', 'link'];
const STATUSES = ['', 'draft', 'published', 'archived'];
const LABELS = { draft: '草稿', published: '已发布', archived: '已下架' };
function blank(source) { return { title: '', summary: '', body: '', source: source || '', sourceUrl: '', rights: 'original', category: 'club', status: 'draft' }; }
function token() { const app = getApp(); return app && app.globalData ? app.globalData.token || '' : ''; }
Page({
  data: { loading: true, allowed: false, club: null, draft: blank(), rows: [], message: '', success: '', saving: false, listLoading: false, page: 1, pages: 1, total: 0, rightsIndex: 0, rightsNames: ['原创文章', '授权转载', '公众号 / 原文推荐'], filterIndex: 0, statusNames: ['全部内容', '草稿', '已发布', '已下架'], preview: false, previewBlocks: [], statusLabel: '草稿' },
  onLoad(query) {
    this.clubId = String(query.club || query.clubId || query.id || '');
    this.setData({ clubId: this.clubId });
    this.disposed = false; this.epoch = 0; this.permissionTicket = 0; this.listTicket = 0; this.editTicket = 0; this.accountToken = token();
    if (typeof wx.hideShareMenu === 'function') wx.hideShareMenu();
  },
  onShow() {
    if (token() !== this.accountToken) this.invalidate('登录账号已变化，请重新确认发布权限。');
    this.accountToken = token();
    if (!this.accountToken) { this.invalidate('请先登录，再管理跑团资讯。'); this.setData({ loading: false }); return; }
    this.checkPermission();
  },
  onUnload() { this.disposed = true; this.epoch++; },
  scope() { return { epoch: this.epoch, token: this.accountToken }; },
  current(scope) { return !this.disposed && scope.epoch === this.epoch && scope.token === token(); },
  invalidate(message) {
    this.epoch = (this.epoch || 0) + 1; this.listTicket = (this.listTicket || 0) + 1; this.editTicket = (this.editTicket || 0) + 1;
    this.setData({ allowed: false, club: null, draft: blank(), rows: [], message: message || '', success: '', saving: false, listLoading: false, page: 1, pages: 1, total: 0, preview: false, previewBlocks: [], rightsIndex: 0, statusLabel: '草稿' });
  },
  async checkPermission() {
    const scope = this.scope(), ticket = ++this.permissionTicket;
    this.setData({ loading: true });
    try {
      const data = await request('/clubs/' + encodeURIComponent(this.clubId));
      if (!this.current(scope) || ticket !== this.permissionTicket) return;
      if (!data.club || !data.club.staff) { this.invalidate('仅本跑团团长与管理员可以发布资讯。'); return; }
      this.setData({ allowed: true, club: data.club, message: '', ...(!this.data.draft.source && !this.data.draft.id ? { 'draft.source': data.club.name } : {}) });
      await this.loadRows();
    } catch (err) { if (this.current(scope) && ticket === this.permissionTicket) this.invalidate(err.message); }
    finally { if (!this.disposed && ticket === this.permissionTicket) this.setData({ loading: false }); }
  },
  async loadRows() {
    if (!this.data.allowed) return;
    const scope = this.scope(), ticket = ++this.listTicket;
    this.setData({ listLoading: true });
    try {
      const data = await request('/clubs/' + encodeURIComponent(this.clubId) + '/content/articles?page=' + this.data.page + '&pageSize=12&status=' + STATUSES[this.data.filterIndex]);
      if (!this.current(scope) || ticket !== this.listTicket) return;
      this.setData({ rows: (data.articles || []).map(row => ({ ...row, statusLabel: LABELS[row.status] || row.status, dateLabel: String(row.updatedAt || '').slice(0, 10) })), page: data.page || 1, pages: data.pages || 1, total: data.total || 0 });
    } catch (err) { if (this.current(scope) && ticket === this.listTicket) { if (err.status === 401 || err.status === 403) this.invalidate(err.message); else this.setData({ message: err.message }); } }
    finally { if (this.current(scope) && ticket === this.listTicket) this.setData({ listLoading: false }); }
  },
  input(e) {
    if (this.data.saving || !this.data.allowed) return;
    const key = e.currentTarget.dataset.field;
    if (['title', 'summary', 'body', 'source', 'sourceUrl'].includes(key)) this.setData({ ['draft.' + key]: String(e.detail.value || ''), success: '' });
  },
  rightsChanged(e) { const n = Number(e.detail.value); if (this.data.saving || !RIGHTS[n]) return; this.setData({ rightsIndex: n, 'draft.rights': RIGHTS[n], preview: false, previewBlocks: [] }); },
  filterChanged(e) { if (this.data.saving) return; this.setData({ filterIndex: Number(e.detail.value) || 0, page: 1 }); this.loadRows(); },
  reset() { if (this.data.saving || !this.data.allowed) return; this.editTicket++; this.setData({ draft: blank(this.data.club && this.data.club.name), rightsIndex: 0, preview: false, previewBlocks: [], statusLabel: '草稿', message: '', success: '' }); },
  async edit(e) {
    if (this.data.saving || !this.data.allowed) return;
    const id = Number(e.currentTarget.dataset.id); if (!Number.isSafeInteger(id) || id < 1) return;
    const scope = this.scope(), ticket = ++this.editTicket;
    this.setData({ message: '', success: '' });
    try {
      const data = await request('/clubs/' + encodeURIComponent(this.clubId) + '/content/articles/' + id);
      if (!this.current(scope) || ticket !== this.editTicket) return;
      this.setDraft(data.article);
      if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    } catch (err) { if (this.current(scope) && ticket === this.editTicket) { if (err.status === 401 || err.status === 403) this.invalidate(err.message); else this.setData({ message: err.message }); } }
  },
  setDraft(article) { this.setData({ draft: { ...article }, rightsIndex: Math.max(0, RIGHTS.indexOf(article.rights)), statusLabel: LABELS[article.status] || article.status, preview: false, previewBlocks: [] }); },
  togglePreview() { if (!this.data.allowed) return; this.setData({ preview: !this.data.preview, previewBlocks: parseGuide(this.data.draft.rights === 'link' ? '' : this.data.draft.body) }); },
  async save(e) {
    if (this.data.saving || !this.data.allowed) return;
    const status = e.currentTarget.dataset.status;
    if (!['draft', 'published', 'archived'].includes(status)) return;
    const draft = this.data.draft;
    if (!draft.title.trim()) { this.setData({ message: '请先填写标题。' }); return; }
    const scope = this.scope();
    if (!this.current(scope)) { this.invalidate('登录账号已变化，请重新打开发布页。'); return; }
    this.editTicket++; this.setData({ saving: true, message: '', success: '' });
    try {
      const data = await request('/clubs/' + encodeURIComponent(this.clubId) + '/content/articles' + (draft.id ? '/' + draft.id : ''), draft.id ? 'PUT' : 'POST', { ...draft, status, category: 'club', clubId: Number(this.clubId), body: draft.rights === 'link' ? '' : draft.body });
      if (!this.current(scope)) return;
      this.setDraft(data.article);
      this.setData({ success: status === 'published' ? '已发布到跑团资讯与跑圈资讯。' : status === 'draft' ? '草稿已保存，仅管理人员可见。' : '内容已下架，可编辑后重新发布。', saving: false });
      await this.loadRows();
    } catch (err) { if (this.current(scope)) { if (err.status === 401 || err.status === 403) this.invalidate(err.message); else this.setData({ message: err.message }); } }
    finally { if (this.current(scope)) this.setData({ saving: false }); }
  },
  prevPage() { if (this.data.page > 1 && !this.data.listLoading && !this.data.saving) { this.setData({ page: this.data.page - 1 }); this.loadRows(); } },
  nextPage() { if (this.data.page < this.data.pages && !this.data.listLoading && !this.data.saving) { this.setData({ page: this.data.page + 1 }); this.loadRows(); } },
  retry() { if (!this.data.saving) this.onShow(); }
});
