require('./setup-env');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/index');
const { getDb } = require('../src/db');
const API = '/marathon/api';
const admin = { Authorization:'Bearer content-test-admin' };
const payload = extra => ({ title:'资讯中心接口专用文章',summary:'测试摘要',body:'这是一段已核实的资讯正文。',source:'平台编辑',category:'industry',status:'draft',rights:'original',...extra });
test('independent content has draft, publication, schedule, archive and source boundaries', async () => {
  process.env.ADMIN_TOKEN = 'content-test-admin';
  const base = API + '/admin/content/articles';
  assert.equal((await request(app).post(base).send(payload())).status,401);
  const created = await request(app).post(base).set(admin).send(payload());
  assert.equal(created.status,200,JSON.stringify(created.body));
  const id = created.body.article.id;
  try {
    assert.equal((await request(app).get(API + '/content/articles/' + id)).status,404);
    let r = await request(app).put(base + '/' + id).set(admin).send({status:'published',publishedAt:'2099-01-01'});
    assert.equal(r.status,200,JSON.stringify(r.body));
    assert.equal((await request(app).get(API + '/content/articles/' + id)).status,404);
    r = await request(app).put(base + '/' + id).set(admin).send({publishedAt:'2020-01-01'});
    assert.equal(r.status,200);
    assert.equal((await request(app).get(API + '/content/articles/' + id)).body.article.body,'这是一段已核实的资讯正文。');
    const list = await request(app).get(API + '/content/articles?category=industry&q=接口专用&page=1&pageSize=1');
    assert.equal(list.body.articles[0].id,id);
    assert.equal(list.body.pageSize,1);
    assert.equal(list.body.articles[0].body,undefined);
    assert.equal((await request(app).get(API + '/content/articles?q=%25')).body.articles.some(row => row.id === id),false);
    assert.equal((await request(app).put(base + '/' + id).set(admin).send({sourceUrl:'javascript:alert(1)'})).status,400);
    assert.equal((await request(app).put(base + '/' + id).set(admin).send({rights:'link',sourceUrl:'https://mp.weixin.qq.com/s/abc'})).status,400);
    r = await request(app).put(base + '/' + id).set(admin).send({rights:'link',body:'',sourceUrl:'https://mp.weixin.qq.com/s/abc'});
    assert.equal(r.status,200);
    assert.equal(r.body.article.body,'');
    assert.equal((await request(app).put(base + '/' + id).set(admin).send({publishedAt:'2026-02-30'})).status,400);
    assert.equal((await request(app).delete(base + '/' + id).set(admin)).status,200);
    assert.equal((await request(app).get(API + '/content/articles/' + id)).status,404);
    assert.equal((await request(app).get(base + '/' + id).set(admin)).body.article.status,'archived');
  } finally { getDb().prepare('DELETE FROM content_articles WHERE id=?').run(id); }
});
test('club publication requires current local owner or manager and cannot cross clubs', async () => {
  process.env.ADMIN_TOKEN = 'content-test-admin';
  const db = getDb(), stamp = new Date().toISOString();
  const user = token => Number(db.prepare('INSERT INTO users(nickname,token,created_at) VALUES(?,?,?)').run(token,token,stamp).lastInsertRowid);
  const owner=user('content-owner'), member=user('content-member'), manager=user('content-manager');
  const club = Number(db.prepare("INSERT INTO clubs(name,code,owner_id,created_at,city,public_status) VALUES('资讯测试团','CONTENT1',?,?,'北京','active')").run(owner,stamp).lastInsertRowid);
  const other = Number(db.prepare("INSERT INTO clubs(name,code,owner_id,created_at,city,public_status) VALUES('其他资讯测试团','CONTENT2',?,?,'北京','active')").run(member,stamp).lastInsertRowid);
  db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'member')").run(club,member,stamp);
  db.prepare("INSERT INTO club_members(club_id,user_id,joined_at,role) VALUES(?,?,?,'manager')").run(club,manager,stamp);
  const base = API + '/clubs/' + club + '/content/articles', auth=t=>({Authorization:'Bearer '+t});
  try {
    assert.equal((await request(app).get(base)).status,401);
    assert.equal((await request(app).post(base).set(auth('content-member')).send(payload({category:'club',clubId:club}))).status,403);
    assert.equal((await request(app).post(base).set(auth('content-owner')).send(payload({category:'club',clubId:other}))).status,400);
    const made = await request(app).post(base).set(auth('content-owner')).send(payload({category:'club',clubId:club,status:'published',featured:true}));
    assert.equal(made.status,200,JSON.stringify(made.body));
    assert.equal(made.body.article.featured,false, 'club editors cannot choose global featured placement');
    const id = made.body.article.id;
    assert.equal((await request(app).get(base + '/' + id).set(auth('content-manager'))).body.article.body,'这是一段已核实的资讯正文。');
    const otherBase = API + '/clubs/' + other + '/content/articles/' + id;
    assert.equal((await request(app).put(otherBase).set(auth('content-member')).send({title:'跨团篡改'})).status,404);
    assert.equal((await request(app).delete(otherBase).set(auth('content-member'))).status,404);
    assert.equal((await request(app).get(API + '/content/articles?clubId=' + club)).body.articles.length,1);
    db.prepare("UPDATE clubs SET public_status='restricted' WHERE id=?").run(club);
    assert.equal((await request(app).get(API + '/content/articles/' + id)).status,404);
    assert.equal((await request(app).put(base + '/' + id).set(auth('content-owner')).send({title:'仍试图发布'})).status,403);
    assert.equal((await request(app).put(base + '/' + id).set(auth('content-manager')).send({status:'draft'})).status,200);
    db.prepare("UPDATE club_members SET role='member' WHERE club_id=? AND user_id=?").run(club,manager);
    assert.equal((await request(app).get(base).set(auth('content-manager'))).status,403);
  } finally {
    db.prepare('DELETE FROM content_articles WHERE club_id IN (?,?)').run(club,other);
    db.prepare('DELETE FROM club_members WHERE club_id IN (?,?)').run(club,other);
    db.prepare('DELETE FROM clubs WHERE id IN (?,?)').run(club,other);
    db.prepare('DELETE FROM users WHERE id IN (?,?,?)').run(owner,member,manager);
  }
});
test('profile API remains public, filters genders, bounds pagination and preserves source metadata', async () => {
  const r = await request(app).get(API + '/content/profiles?type=athlete&gender=women&page=1&pageSize=2');
  assert.equal(r.status,200);
  assert.ok(r.body.profiles.length <= 2);
  assert.ok(r.body.profiles.every(p => p.type === 'athlete' && p.gender === 'women'));
  if (r.body.profiles.length) {
    const p = r.body.profiles[0];
    const detail = await request(app).get(API + '/content/profiles/' + p.id);
    assert.equal(detail.body.profile.id,p.id);
    assert.ok(Array.isArray(detail.body.profile.sources));
    assert.ok(detail.body.meta.rankingNotice);
  }
  assert.equal((await request(app).get(API + '/content/profiles/absent-profile')).status,404);
});

test('curated article imports preserve operator edits and withdrawals when repeated', () => {
  const { importStarters } = require('../../scripts/import-content-starters.cjs');
  const db = getDb(), title = '初始资讯导入幂等验收';
  const data = [payload({ title, sourceUrl:'https://worldathletics.org/', publishedAt:'2026-01-01' })];
  try {
    assert.equal(importStarters(db,data).inserted,1);
    const row = db.prepare('SELECT * FROM content_articles WHERE title=?').get(title);
    db.prepare("UPDATE content_articles SET title='运营修改后的标题',status='archived' WHERE id=?").run(row.id);
    assert.deepEqual(importStarters(db,data),{inserted:0,skipped:1});
    const kept = db.prepare('SELECT title,status FROM content_articles WHERE id=?').get(row.id);
    assert.deepEqual(kept,{title:'运营修改后的标题',status:'archived'});
  } finally { db.prepare("DELETE FROM content_articles WHERE title IN (?, '运营修改后的标题')").run(title); }
});
