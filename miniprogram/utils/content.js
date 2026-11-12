function safeUrl(value) { return /^https:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/i.test(String(value || '')); }
function categoryName(v) { return ({ industry:'业界观察', club:'跑团来稿', stories:'跑者故事' })[v] || '跑圈资讯'; }
function contentDate(value) { if(!value)return '';const timestamp=Date.parse(value);return Number.isFinite(timestamp)?new Date(timestamp+8*3600000).toISOString().slice(0,10):''; }
function authorLabel(row) { return row.rights==='digest'?'跑圈编辑部':row.category==='club'&&row.rights==='original'?(row.authorName||row.author||row.clubName||row.source||''):''; }
function decorate(row, index, page) {
  const assignments = row.assignments || [], first = assignments[0] && assignments[0].raceName;
  return { ...row, authorLabel:authorLabel(row),raceBadges:(row.raceBadges||[]).map(b=>({...b,statusLabel:b.status==='provisional'?'入选公示':b.statusLabel||'已确认'})),verifiedPacerRacesLabel:(row.verifiedPacerRaceNames||[]).join('、'),avatarLabel: String(row.name || '兔').slice(0,1), number: row.editorialOrigin==='manual'&&!row.seasonRank&&!row.rank?'—':String(row.seasonRank || row.rank || ((page || 1)-1)*20+index+1).padStart(2,'0'), dateLabel: contentDate(row.publishedAt), categoryLabel: categoryName(row.category),
    pacerRaceLabel: first ? first + (assignments.length > 1 ? ' 等 ' + (row.raceCount || assignments.length) + ' 场赛事' : '') : row.role || '查看官方配速履历',
    pacerTarget: row.primaryTargetTime || (row.targetTimes || [])[0] || '查看履历' };
}
module.exports = { safeUrl, categoryName, decorate, contentDate, authorLabel };
