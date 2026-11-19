const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sniffMedia } = require('./runner-center');
const { mergeArchiveRecord } = require('./race-archive-schema');

const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_PAYLOAD = 2 * 1024 * 1024;
const STORED_IMAGE = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/;
const RACE_FIELDS = { name: 80, shortName: 30, city: 40, province: 40, tagline: 160, summary: 1200 };
const ROUTE_FIELDS = ['summary', 'summaryNote', 'project', 'start', 'finish', 'changes', 'versionId', 'versionTitle'];
const REGISTRATION_FIELDS = ['method', 'opens', 'closes', 'drawDate', 'fee', 'qualification', 'applicants', 'eligibleApplicants', 'lotteryPool', 'drawQuota', 'directQuota', 'lotteryRate', 'lotteryNote', 'note'];
const PARTICIPATION_FIELDS = ['planned', 'starters', 'finishers', 'finishRate', 'note'];

function error(message, status = 400) { return Object.assign(new Error(message), { status }); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw error(label + '格式不正确');
  return value;
}
function text(value, label, max = 6000) {
  if (value == null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') throw error(label + '须为文字');
  const result = String(value).trim();
  if (result.length > max) throw error(label + '不超过' + max + '字');
  return result;
}
function list(value, label, max = 100) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) throw error(label + '最多' + max + '项');
  return value;
}
function texts(value, label, max = 100) { return list(value, label, max).map(item => text(item, label, 2000)); }
function fields(value, names, label) {
  const input = object(value || {}, label);
  return Object.fromEntries(names.map(name => [name, text(input[name], label + name)]));
}
function year(value, label = '年份', optional = false) {
  const result = text(value, label, 4);
  if (optional && !result) return '';
  if (!/^(?:19|20|21)\d{2}$/.test(result)) throw error(label + '须为1900至2199的四位年份');
  return result;
}
function date(value, label, editionYear) {
  const result = text(value, label, 10);
  if (result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result + 'T00:00:00Z').toISOString().slice(0, 10) !== result || editionYear && !result.startsWith(editionYear + '-'))) throw error(label + '须为有效日期，且与年份一致');
  return result;
}
function installArchiveEditor(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS race_archive_edits (
    race_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS race_archive_images (
    file TEXT NOT NULL, race_id TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
    created_at TEXT NOT NULL, PRIMARY KEY(race_id, file)
  );`);
}
function readArchiveEdit(db, id) {
  // Lightweight callers in the mini-program acceptance harness provide only race lookups.
  if (!db || typeof db.exec !== 'function') return null;
  installArchiveEditor(db);
  const row = db.prepare('SELECT payload FROM race_archive_edits WHERE race_id = ?').get(id);
  return row ? JSON.parse(row.payload) : null;
}
function imageRoot() { return path.join(process.env.MARATHON_MEDIA || path.join(__dirname, '../data/media'), 'race-archives'); }
function imageUrl(base, id, file) { return base + '/api/race-archive-media/' + id + '/' + file; }
function confirmedRights() { return { status: 'admin-confirmed', title: '赛事档案后台上传图片', holder: '平台管理员', confirmedAt: new Date().toISOString() }; }

function validImage(buffer) {
  const image = sniffMedia(buffer, false);
  if (!image || buffer.length < 24) return null;
  if (image.ext === 'png') {
    let offset = 8, hasData = false, ended = false;
    while (offset + 12 <= buffer.length) {
      const size = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
      if (size > buffer.length - offset - 12) return null;
      if (type === 'IHDR' && (offset !== 8 || size !== 13 || !buffer.readUInt32BE(offset + 8) || !buffer.readUInt32BE(offset + 12) || buffer.readUInt32BE(offset + 8) > 30000 || buffer.readUInt32BE(offset + 12) > 30000)) return null;
      if (type === 'IDAT' && size > 0) hasData = true;
      offset += size + 12;
      if (type === 'IEND') { ended = size === 0 && offset === buffer.length; break; }
    }
    if (!ended || !hasData) return null;
  } else if (image.ext === 'jpg') {
    if (!buffer.subarray(-2).equals(Buffer.from([255, 217]))) return null;
    let offset = 2, frame = false;
    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 255) return null;
      const marker = buffer[offset + 1];
      if (marker === 218) break;
      if (marker === 255) { offset++; continue; }
      const size = buffer.readUInt16BE(offset + 2);
      if (size < 2 || offset + size + 2 > buffer.length) return null;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (size < 8 || !buffer.readUInt16BE(offset + 5) || !buffer.readUInt16BE(offset + 7)) return null;
        frame = true;
      }
      offset += size + 2;
    }
    if (!frame) return null;
  } else if (buffer.readUInt32LE(4) + 8 !== buffer.length || buffer.readUInt32LE(16) > buffer.length - 20) return null;
  return image;
}

function validateArchiveInput(body, current, db, id, base) {
  object(body, '赛事档案');
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_PAYLOAD) throw error('赛事档案内容不超过2MB', 413);
  const inputRace = object(body.race, '赛事基本信息'), input = object(body.archive, '赛事资料');
  if (input.hero != null) object(input.hero, '赛事封面');
  if (input.profile != null) object(input.profile, '赛事概况');
  const race = { ...current.race };
  for (const [key, limit] of Object.entries(RACE_FIELDS)) race[key] = text(inputRace[key] ?? race[key], key, limit);
  if (!race.name || !race.city) throw error('请填写赛事名称和城市');
  // Only rights already persisted by the server are trusted. Client-supplied
  // mediaRights cannot turn a newly attached image into a confirmed one.
  const confirmedUploads = new Map();
  const uploadPrefix = imageUrl(base, id, '');
  function rememberUpload(url, rights) {
    if (typeof url === 'string' && url.startsWith(uploadPrefix) && rights?.status === 'admin-confirmed' && rights.title && rights.holder && rights.confirmedAt && !confirmedUploads.has(url)) confirmedUploads.set(url, rights);
  }
  function rememberMedia(items) {
    for (const item of items || []) rememberUpload(item.url, item.mediaRights);
  }
  rememberUpload(current.archive.hero?.imageUrl, current.archive.hero?.mediaRights);
  for (const edition of current.archive.editions || []) {
    rememberUpload(edition.route?.mapUrl, edition.route?.mediaRights);
    rememberMedia(edition.route?.images);
    for (const item of edition.gear || []) {
      rememberUpload(item.imageUrl, item.mediaRights);
      rememberMedia(item.images);
    }
  }
  for (const album of current.archive.photoAlbums || []) rememberMedia(album.media);
  for (const section of ['stories', 'updates', 'news']) for (const article of current.archive[section] || []) rememberMedia(article.images);
  // A reused upload has one confirmation, regardless of how many sections use it.
  // Keep newly issued confirmations separate from the persisted trust map below.
  const newConfirmations = new Map();
  const imageEvidence = new Map();
  const collectEvidence = value => {
    if (Array.isArray(value)) return value.forEach(collectEvidence);
    if (!value || typeof value !== 'object') return;
    const url = value.url || value.imageUrl || value.mapUrl;
    if (typeof url === 'string' && url.startsWith(uploadPrefix) && value.mediaEvidence) {
      const prior = imageEvidence.get(url) || {};
      for (const key of ['title', 'holder', 'sourceUrl', 'licenseUrl', 'usageTerms', 'attribution']) {
        const entry = text(value.mediaEvidence[key], '图片使用依据', 2000);
        if (entry) prior[key] = entry;
      }
      for (const key of ['sourceUrl', 'licenseUrl']) if (prior[key] && !/^https?:\/\//.test(prior[key])) throw error('图片来源及许可链接须为有效网址');
      imageEvidence.set(url, prior);
    }
    for (const [key, child] of Object.entries(value)) if (key !== 'mediaRights') collectEvidence(child);
  };
  collectEvidence(input);
  const rightsFor = url => {
    if (confirmedUploads.has(url)) return { ...confirmedUploads.get(url), ...imageEvidence.get(url), status: 'admin-confirmed' };
    if (!newConfirmations.has(url)) newConfirmations.set(url, { ...confirmedRights(), ...imageEvidence.get(url) });
    return newConfirmations.get(url);
  };
  let needsMediaConfirmation = false;
  const sourceInput = input.sources ?? current.archive.sources ?? [];
  const sources = list(sourceInput, '资料来源', 500).map(source => {
    object(source, '资料来源');
    const result = fields(source, ['id', 'title', 'url', 'publisher', 'publishedAt', 'accessedAt', 'verifiedAt', 'publishedAtPrecision', 'note'], '来源');
    if (!result.id || !result.title || !result.publisher || !/^https?:\/\//.test(result.url)) throw error('来源须填写标识、标题、发布主体和有效原文链接');
    result.publishedAt = partialDate(result.publishedAt, '来源发布日期');
    result.accessedAt = date(result.accessedAt, '来源访问日期');
    result.verifiedAt = date(result.verifiedAt, '来源核验日期');
    result.applicableYears = texts(source.applicableYears, '适用年份').map(value => year(value));
    // Retain existing structured evidence/snapshots without accepting executable content.
    for (const key of ['evidence', 'snapshot']) if (source[key] != null) {
      if (JSON.stringify(source[key]).length > 12000) throw error('来源证据过长');
      result[key] = JSON.parse(JSON.stringify(source[key]));
    }
    return result;
  });
  if (new Set(sources.map(source => source.id)).size !== sources.length) throw error('来源标识不能重复');
  const knownRefs = new Set([...(current.race.sources || []), ...sources].map(item => item.id));
  const refs = value => texts(value, '资料标识').map(ref => { if (!knownRefs.has(ref)) throw error('找不到资料来源：' + ref); return ref; });
  const applicableYears = value => texts(value, '适用年份').map(value => year(value));
  function partialDate(value, label) {
    const result = text(value, label, 10);
    if (result && !/^(?:19|20|21)\d{2}(?:-(?:0[1-9]|1[0-2]))?(?:-(?:0[1-9]|[12]\d|3[01]))?$/.test(result)) throw error(label + '须为年份、月份或日期');
    if (result.length === 10) date(result, label);
    return result;
  }
  function time(value) {
    const result = text(value, '成绩', 10);
    if (!/^\d{1,2}:\d{2}:\d{2}$/.test(result) || result.split(':').slice(1).some(part => Number(part) >= 60)) throw error('成绩须按HH:MM:SS填写');
    return result;
  }
  function upload(value, label) {
    const url = text(value, label, 1000);
    if (!url) return '';
    const prefix = imageUrl(base, id, '');
    if (!url.startsWith(prefix)) throw error(label + '请使用本赛事后台上传的图片');
    const file = url.slice(prefix.length);
    if (!STORED_IMAGE.test(file) || !db.prepare('SELECT file FROM race_archive_images WHERE race_id = ? AND file = ?').get(id, file)) throw error(label + '图片不存在或不属于本赛事');
    if (!confirmedUploads.has(url)) needsMediaConfirmation = true;
    return url;
  }
  function legacyOrUpload(value, previous, label) {
    const url = text(value, label, 2000);
    if (!url) return '';
    if (previous && url === previous && !url.startsWith(uploadPrefix)) return url;
    return upload(url, label);
  }
  function media(value, label) {
    return list(value, label, 30).map(item => {
      object(item, label);
      const url = upload(item.url, label);
      if (!url) throw error(label + '请先上传图片');
      return { url, caption: text(item.caption, '图片说明', 240), mediaRights: rightsFor(url) };
    });
  }
  function articles(value, label, withDate = false) {
    return list(value, label, 150).map((item, index) => {
      object(item, label);
      const result = {
        id: text(item.id || label + '-' + (index + 1), '内容编号', 100),
        title: text(item.title, label + '标题', 160), body: text(item.body, label + '正文', 20000),
        summary: text(item.summary, '摘要', 1200), tag: text(item.tag, '内容标签', 40),
        editionYear: year(item.editionYear, '相关年份', true),
        images: media(item.images, '内容图片'), sourceIds: refs(item.sourceIds)
      };
      if (!result.title) throw error('请填写' + label + '标题');
      if (withDate || item.publishedAt) result.publishedAt = date(item.publishedAt, '发布日期');
      return result;
    });
  }
  const editions = list(input.editions, '年度资料', 100).map(item => {
    object(item, '年度资料');
    const y = year(item.year);
    const previous = current.archive.editions.find(edition => String(edition.year) === y) || {};
    const route = { ...fields(item.route, ROUTE_FIELDS, '赛道'), analysis: texts(item.route?.analysis, '赛道分析', 20), sourceIds: refs(item.route?.sourceIds) };
    route.mapUrl = legacyOrUpload(item.route?.mapUrl, previous.route?.mapUrl, '路线图');
    route.mapSourceUrl = previous.route?.mapSourceUrl || '';
    route.images = media(item.route?.images, '路线图片');
    route.mediaRights = route.mapUrl && route.mapUrl.startsWith(uploadPrefix) ? rightsFor(route.mapUrl) : previous.route?.mediaRights;
    const gear = list(item.gear, '赛事物品', 30).map((g, index) => {
      object(g, '赛事物品');
      const category = text(g.category, '物品分类', 40);
      const prior = (previous.gear || []).find(row => row.category === category && row.name === g.name)
        || (previous.gear || []).find(row => row.category === category) || {};
      if (!['参赛服', '奖牌', '参赛包', '完赛包'].includes(category)) throw error('请选择参赛服、奖牌、参赛包或完赛包');
      const image = legacyOrUpload(g.imageUrl, prior.imageUrl, '物品图片');
      return { category, name: text(g.name, '物品名称', 160), description: text(g.description, '物品介绍'),
        items: texts(g.items, '物品清单', 60), imageUrl: image, images: media(g.images, '物品图片组'), sourceIds: refs(g.sourceIds), sourceUrl: prior.sourceUrl || '',
        mediaRights: image && image.startsWith(uploadPrefix) ? rightsFor(image) : prior.mediaRights };
    });
    const logistics = Object.fromEntries([
      ['collection', ['time', 'place', 'requirements']], ['transport', ['start', 'finish', 'expo']],
      ['raceDay', ['startTime', 'timeLimit', 'bagDrop', 'aidStations', 'toilets', 'medical']]
    ].map(([key, names]) => [key, { ...fields(item.logistics?.[key], names, '参赛指南'), sourceIds: refs(item.logistics?.[key]?.sourceIds) }]));
    logistics.tips = list(item.logistics?.tips, '跑前提醒', 20).map(tip => { object(tip, '跑前提醒'); return { title: text(tip.title, '提醒标题', 160), body: text(tip.body, '提醒内容', 2000), kind: text(tip.kind, '提醒性质', 40), applicableYears: applicableYears(tip.applicableYears), sourceIds: refs(tip.sourceIds) }; });
    const results = list(item.results, '成绩记录', 100).map(row => {
      object(row, '成绩记录');
      const result = fields(row, ['group', 'athlete', 'time', 'timing'], '成绩');
      if (!result.group || !result.athlete || !result.time) throw error('成绩记录须填写组别、姓名和成绩');
      time(result.time);
      return { ...result, sourceIds: refs(row.sourceIds) };
    });
    const events = list(item.events, '比赛项目', 20).map(event => {
      object(event, '比赛项目');
      const result = { ...fields(event, ['project', 'fee'], '项目'), sourceIds: refs(event.sourceIds) };
      for (const key of ['distanceKm', 'plannedParticipants']) {
        const value = event[key];
        if (value == null || value === '') { result[key] = ''; continue; }
        if (!Number.isFinite(Number(value)) || Number(value) <= 0 || key === 'plannedParticipants' && !Number.isInteger(Number(value))) throw error('项目距离和计划人数须为有效正数');
        result[key] = Number(value);
      }
      return result;
    });
    const status = text(item.status, '举办状态', 40);
    if (status && !['completed', 'scheduled', 'cancelled', 'postponed'].includes(status)) throw error('举办状态不正确');
    return { year: y, editionId: text(item.editionId || id + '-' + y, '届次标识', 100), editionName: text(item.editionName, '当届名称', 160), editionNumber: text(item.editionNumber, '届数', 20), status, events,
      date: date(item.date, '比赛日期'), distance: text(item.distance, '比赛项目', 120), dateSourceIds: refs(item.dateSourceIds),
      route, registration: { ...fields(item.registration, REGISTRATION_FIELDS, '报名'), sourceIds: refs(item.registration?.sourceIds) },
      participation: { ...fields(item.participation, PARTICIPATION_FIELDS, '参赛完赛'), sourceIds: refs(item.participation?.sourceIds) }, results, gear, notes: texts(item.notes, '年度说明', 20), logistics };
  });
  if (new Set(editions.map(item => item.year)).size !== editions.length) throw error('同一年份只能保存一份年度资料');
  const heroImage = upload(input.hero?.imageUrl, '封面');
  const archive = {
    schemaVersion: 2, raceId: id, updatedAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10), intro: text(input.intro, '赛事简介', 12000), introSourceIds: refs(input.introSourceIds),
    profile: { foundingYear: year(input.profile?.foundingYear, '创办年份', true), foundingYearSourceIds: refs(input.profile?.foundingYearSourceIds), positioning: text(input.profile?.positioning, '赛事定位', 3000), positioningSourceIds: refs(input.profile?.positioningSourceIds), entryNotes: text(input.profile?.entryNotes, '报名特点', 6000), entrySourceIds: refs(input.profile?.entrySourceIds) },
    hero: { imageUrl: heroImage, alt: text(input.hero?.alt, '封面说明', 240), mediaRights: heroImage ? rightsFor(heroImage) : undefined },
    highlights: list(input.highlights, '赛事看点', 20).map(item => { object(item, '赛事看点'); return { title: text(item.title, '看点标题', 160), body: text(item.body, '看点介绍', 4000), applicableYears: applicableYears(item.applicableYears), sourceIds: refs(item.sourceIds) }; }),
    history: list(input.history, '赛事历史', 100).map(item => {
      object(item, '历史节点');
      const result = { ...fields(item, ['title', 'body', 'editionId', 'datePrecision'], '历史节点'), date: partialDate(item.date, '历史时间'), sourceIds: refs(item.sourceIds) };
      if (!result.title || !result.date || !result.sourceIds.length) throw error('历史节点须有时间、标题和来源');
      return result;
    }),
    records: list(input.records, '赛会纪录', 30).map(item => {
      object(item, '赛会纪录');
      const result = { ...fields(item, ['category', 'project', 'group', 'athlete', 'timing', 'editionId', 'verifiedThroughEditionId'], '纪录'), time: time(item.time), achievedAt: partialDate(item.achievedAt, '创造时间'), verifiedAt: date(item.verifiedAt, '核验日期'), sourceIds: refs(item.sourceIds) };
      if (!result.group || !result.athlete || !result.editionId || !result.sourceIds.length || !result.verifiedAt) throw error('纪录须有组别、姓名、创造届次、来源和核验日期');
      return result;
    }),
    gaps: list(input.gaps, '资料缺口', 100).map(item => ({ fields: texts(item.fields, '缺失字段'), reason: text(item.reason, '缺失说明', 4000) })),
    conflicts: list(input.conflicts, '资料冲突', 100).map(item => ({ ...fields(item, ['field', 'reason', 'resolution', 'body', 'title'], '冲突'), sourceIds: refs(item.sourceIds) })),
    editions, stories: articles(input.stories, '故事'), updates: articles(input.updates, '新鲜事', true), news: articles(input.news, '新闻', true),
    photoAlbums: list(input.photoAlbums, '年度相册', 100).map(item => { object(item, '年度相册'); return { id: text(item.id, '相册编号', 100), year: year(item.year), title: text(item.title, '相册标题', 160), media: media(item.media, '相册图片') }; }),
    routeGroups: list(input.routeGroups, '路线版本分组', 100).map(item => { object(item, '路线版本分组'); return { id: text(item.id, '版本编号', 100), title: text(item.title, '版本名称', 160),
      years: texts(item.years, '适用年份', 100).map(value => year(value)), note: text(item.note, '版本说明', 3000), match: ['exact', 'similar'].includes(item.match) ? item.match : 'similar' }; }),
    sources
  };
  if (needsMediaConfirmation && body.mediaConfirmed !== true) throw error('请确认已获得新增图片的展示许可');
  return { race, archive };
}

function boundedUpload(req) {
  return new Promise((resolve, reject) => {
    let size = 0, oversized = Number(req.get('content-length')) > MAX_IMAGE + 65536;
    const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > MAX_IMAGE + 65536) oversized = true; if (!oversized) chunks.push(chunk); });
    req.on('error', reject); req.on('aborted', () => reject(error('上传已中断')));
    req.on('end', () => oversized ? reject(error('图片不超过8MB', 413)) : resolve(Buffer.concat(chunks)));
  });
}
function mountArchiveEditor(app, { BASE, getDb, requireAdmin, oneUpload, baseline, listCatalog }) {
  const known = id => Boolean(baseline(id));
  app.get(BASE + '/api/admin/race-archives', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(listCatalog({}, getDb()));
  });
  app.get(BASE + '/api/admin/race-archives/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const current = baseline(req.params.id);
    if (!current) return res.status(404).json({ error: '没有这场赛事档案' });
    res.json(mergeArchiveRecord(current, readArchiveEdit(getDb(), req.params.id)));
  });
  app.put(BASE + '/api/admin/race-archives/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = req.params.id, initial = baseline(id);
    if (!initial) return res.status(404).json({ error: '没有这场赛事档案' });
    try {
      const db = getDb(); installArchiveEditor(db);
      const current = mergeArchiveRecord(initial, readArchiveEdit(db, id));
      const value = validateArchiveInput(req.body, current, db, id, BASE);
      db.prepare(`INSERT INTO race_archive_edits(race_id,payload,updated_at,updated_by) VALUES(?,?,?,?)
        ON CONFLICT(race_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
        .run(id, JSON.stringify(value), new Date().toISOString(), req.adminUser || 'admin');
      res.json({ ok: true, ...value });
    } catch (err) { if (!err.status) throw err; res.status(err.status).json({ error: err.message }); }
  });
  app.post(BASE + '/api/admin/race-archives/:id/images', async (req, res, next) => {
    if (!requireAdmin(req, res)) return;
    const id = req.params.id;
    if (!known(id)) return res.status(404).json({ error: '没有这场赛事档案' });
    try {
      const contentType = req.get('content-type') || '';
      if (!/^multipart\/form-data;/i.test(contentType)) throw error('请选择图片文件');
      const multipart = await boundedUpload(req);
      const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
      const marker = boundary && '--' + (boundary[1] || boundary[2]).trim();
      const parts = marker ? multipart.toString('latin1').split(marker).slice(1).filter(part => /\r\n\r\n/.test(part)) : [];
      if (parts.length !== 1 || !/filename="[^"]*"/.test(parts[0].split('\r\n\r\n')[0])) throw error('请每次上传一张图片');
      const buffer = oneUpload(multipart, contentType);
      if (!buffer || !buffer.length) throw error('请选择一张图片');
      if (buffer.length > MAX_IMAGE) throw error('图片不超过8MB', 413);
      const image = validImage(buffer);
      if (!image) throw error('请选择有效的JPG、PNG或WebP图片');
      const file = crypto.createHash('sha256').update(buffer).digest('hex') + '.' + image.ext;
      const root = path.join(imageRoot(), id); fs.mkdirSync(root, { recursive: true });
      try { fs.writeFileSync(path.join(root, file), buffer, { flag: 'wx' }); } catch (err) { if (err.code !== 'EEXIST') throw err; }
      const db = getDb(); installArchiveEditor(db);
      db.prepare('INSERT OR IGNORE INTO race_archive_images(file,race_id,mime,size,created_at) VALUES(?,?,?,?,?)').run(file, id, image.mime, buffer.length, new Date().toISOString());
      res.json({ url: imageUrl(BASE, id, file), mime: image.mime, size: buffer.length });
    } catch (err) { if (!err.status) return next(err); res.status(err.status).json({ error: err.message }); }
  });
  app.get(BASE + '/api/race-archive-media/:id/:file', (req, res) => {
    if (!known(req.params.id) || !STORED_IMAGE.test(req.params.file)) return res.status(404).end();
    const db = getDb(); installArchiveEditor(db);
    const row = db.prepare('SELECT mime FROM race_archive_images WHERE race_id = ? AND file = ?').get(req.params.id, req.params.file);
    const file = path.join(imageRoot(), req.params.id, req.params.file);
    if (!row || !fs.existsSync(file)) return res.status(404).end();
    res.set({ 'Content-Type': row.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.sendFile(file);
  });
}

module.exports = { mountArchiveEditor, readArchiveEdit, installArchiveEditor, validateArchiveInput, imageRoot, MAX_IMAGE, validImage };
