function safeUrl(value) { return /^https:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/i.test(String(value || '')); }
function officialUrl(value) { return /^https:\/\/mp\.weixin\.qq\.com\/(?:s(?:[/?]|$)|mp\/)/i.test(String(value || '')) && safeUrl(value); }
function openSource(url) {
  if (!safeUrl(url)) return;
  const copy = () => wx.setClipboardData({ data: url, success() { wx.showToast({ title: '原文链接已复制', icon: 'none' }); } });
  if (officialUrl(url) && typeof wx.openOfficialAccountArticle === 'function' && (!wx.canIUse || wx.canIUse('openOfficialAccountArticle'))) wx.openOfficialAccountArticle({ url, fail: copy });
  else copy();
}
function evidenceText(e) { if (typeof e === 'string') return e; return [e.date,e.event || e.eventName,e.target || e.runner || e.athlete,e.description || e.summary || e.evidence || e.note].filter(Boolean).join(' · '); }
function categoryName(v) { return ({ industry:'业界观察', club:'跑团来稿', stories:'跑者故事' })[v] || '跑圈资讯'; }
function decorate(row, index, page) { return { ...row, avatarLabel: String(row.name || '兔').slice(0,1), number: String(row.rank || ((page || 1)-1)*20+index+1).padStart(2,'0'), dateLabel: String(row.publishedAt || '').slice(0,10), categoryLabel: categoryName(row.category) }; }
module.exports = { safeUrl, officialUrl, openSource, evidenceText, categoryName, decorate };
