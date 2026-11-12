const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseToplist, parsePerson, enrichAthlete, recentWindow, parseNewsSearch, parsePacerGroups, publicUrl, run } = require('./content-sync.cjs');
function result(id, mark='2:10:00', date='01 MAR 2026', nat='CHN') { return `<tr><td data-th="Rank">1</td><td data-th="Mark">${mark}</td><td data-th="Competitor"><a href="/athletes/athlete=${id}">Test RUNNER</a></td><td data-th="DOB">01 JAN 2000</td><td data-th="Nat"><img alt="${nat}"/>${nat}</td><td data-th="Pos">3</td><td data-th="Venue">Tokyo (JPN)</td><td data-th="Date">${date}</td></tr>`; }
test('season collection filters nationality, future dates and duplicate athlete results', () => {
  const rows=parseToplist(result('14913520')+result('14913520','2:11:00')+result('14913521','2:12:00','01 JAN 2027')+result('14913522','2:12:00','01 MAR 2026','JPN')+result('14913523','2:13:00'),{year:2026,gender:'men',day:'2026-11-12'});
  assert.equal(rows.length,2);assert.equal(rows[0].seasonBest,'2:10:00');assert.equal(rows[1].worldAthleticsId,'14913523');assert.equal(rows[0].birthDate,'2000-01-01');
  assert.throws(()=>parseToplist('<h1>100 Metres</h1>',{year:2026,gender:'men',day:'2026-11-12'}),/table/);
  assert.throws(()=>parseToplist(result('14913520','2:11:00')+result('14913521','2:10:00'),{year:2026,gender:'men',day:'2026-11-12'}),/unordered/);
});
test('athlete details must belong to the requested Chinese athlete', () => {
  const html='<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{competitor:{_id:14913520,basicData:{countryCode:'CHN'}}}}})+'</script>';
  assert.equal(parsePerson(html,'14913520')._id,14913520);assert.throws(()=>parsePerson(html,'14913521'),/identity/);
});
test('ten-day window uses Chinese calendar dates across year and leap-day boundaries', () => {
  assert.deepEqual(recentWindow(new Date('2026-11-12T01:00:00Z')),{start:'2026-11-03',end:'2026-11-12'});
  assert.deepEqual(recentWindow(new Date('2026-01-01T18:00:00Z')),{start:'2025-12-24',end:'2026-01-02'});
  assert.deepEqual(recentWindow(new Date('2024-03-01T01:00:00Z')),{start:'2024-02-21',end:'2024-03-01'});
});
test('publisher search supports unclosed list items while excluding unrelated marathon usages', () => {
  const item=(title,id,date)=>`<li class="image"><span lanmu1="https://sports.cctv.com/2026/11/10/ARTI${id}.shtml" lanmu2="search" lanmu3="web_normal"><a id="web_content_${id}" href="link_p.php">${title}</a></span><span>发布时间：${date}</span>`;
  const rows=parseNewsSearch(item('临沂<font>马拉松</font>落幕',1,'2026-11-10 12:00:00')+item('编程马拉松',2,'2026-11-10 11:00:00'));
  assert.equal(rows.length,1);assert.equal(rows[0].title,'临沂 马拉松 落幕');assert.equal(rows[0].publishedAt,'2026-11-10T12:00:00+08:00');
});
test('official table rowspan groups retain names without collecting identity-number fragments or PBs as target times', () => {
  const rows=parsePacerGroups('<table><tr><td rowspan="2">3小时10分（2人）</td><td>张三</td><td>男</td><td>123X</td><td>2小时30分钟01秒</td></tr><tr><td>李四</td><td>女</td><td>5678</td><td>2:40:00</td></tr><tr><td>4:00</td><td>王五</td><td>女</td></tr></table>');
  assert.equal(rows.length,2);assert.deepEqual(rows[0],{label:'3:10 完赛组',targetTime:'3:10',names:['张三','李四'],members:[{name:'张三',gender:'men',personalBest:'2:30:01'},{name:'李四',gender:'women',personalBest:'2:40:00'}]});assert.deepEqual(rows[1].names,['王五']);
  assert.ok(!JSON.stringify(rows).includes('123X'));assert.ok(!JSON.stringify(rows).includes('5678'));
});
test('routine season refresh preserves enriched biography when the person source is unavailable', () => {
  const old={name:'张三',biographySections:[{title:'大赛经历',body:'经过核实的运动员履历。'}],recentResults:[{result:'2:09:00'}]};
  const row={worldAthleticsId:'14913520',nameEn:'Test RUNNER',gender:'men',seasonBest:'2:10:00',seasonEventDate:'2026-03-01',seasonEventVenue:'Tokyo'};
  const result=enrichAthlete(row,old,undefined,0,{day:'2026-11-12',year:2026,source:'https://worldathletics.org/records/toplists/'});
  assert.deepEqual(result.biographySections.find(s=>s.title==='大赛经历'),old.biographySections[0]);assert.match(result.biographySections[0].body,/2:10:00/);assert.deepEqual(result.recentResults,old.recentResults);
});
test('an unavailable or partial ranking cannot replace the complete last-known snapshot', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'marathon-sync-test-'));
  const file=path.join(dir,'elite-athletes.json'), original=JSON.stringify({athletes:[{id:'last-good'}]});fs.writeFileSync(file,original);
  try { const report=await run({dir,only:'athletes',now:new Date('2026-11-12T00:00:00Z'),get:async()=>result('14913520')});assert.equal(report.ok,false);assert.equal(fs.readFileSync(file,'utf8'),original);assert.equal(fs.existsSync(path.join(dir,'.sync.lock')),false); }
  finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('collector rejects non-public and credential-bearing source URLs', () => {
  for(const url of ['http://example.com/','https://127.0.0.1/x','https://10.0.0.1/x','https://192.168.1.1/x','https://user:pass@example.com/','file:///etc/passwd'])assert.equal(publicUrl(url),'');
  assert.equal(publicUrl('https://sports.cctv.com/2026/'),'https://sports.cctv.com/2026/');
});
