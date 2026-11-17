// Rich collection records share the existing TEXT column with the editable guide.
// Keeping the record in a versioned trailer avoids a database migration and lets
// older/manual guides remain readable and editable.
const MARKER = /\n?<!-- race-details:v1\n([\s\S]*?)\n-->\s*$/;
const GUIDE_TEXT_MAX = 2000000;
const LABELS = { open: '报名中', closed: '报名已截止', sold_out: '报名已满', not_open: '报名未开始', cancelled: '赛事已取消', invalid: '报名入口已失效', unknown: '' };

// Rich details are assembled from official text, manually checked tables and
// optional OCR notes. Keep the saved trailer intact, but normalize the copy
// sent to clients so a repeated OCR block cannot show up twice. The comparison
// deliberately ignores source URLs: the same verified row may cite more than
// one official page, while different fees or group fields remain distinct.
function normalizeCopy(value) {
  return String(value == null ? '' : value)
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function withoutSources(value) {
  if (Array.isArray(value)) return value.map(withoutSources);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    if (key !== 'sourceUrl') out[key] = withoutSources(value[key]);
    return out;
  }, {});
}

function fingerprint(value) {
  return JSON.stringify(withoutSources(value));
}

function uniqueRows(rows, keyOf) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keyOf(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return details;
  const visible = { ...details };
  if (Array.isArray(details.sections)) {
    visible.sections = uniqueRows(details.sections.map((section) => ({
      ...section,
      title: normalizeCopy(section && section.title),
      text: normalizeCopy(section && section.text)
    })).filter((section) => section.title || section.text), (section) =>
      section.title + '\n' + section.text);
  }
  if (Array.isArray(details.groups)) {
    visible.groups = uniqueRows(details.groups.map((group) => {
      if (!group || typeof group !== 'object') return group;
      const next = { ...group };
      if (next.name != null) next.name = normalizeCopy(next.name);
      if (next.label != null) next.label = normalizeCopy(next.label);
      if (Array.isArray(next.fees)) {
        next.fees = uniqueRows(next.fees, fingerprint);
      }
      return next;
    }).filter((group) => group && typeof group === 'object'), fingerprint);
  }
  if (Array.isArray(details.media)) {
    visible.media = uniqueRows(details.media.filter((item) => item && typeof item === 'object').map((item) => ({
      ...item,
      caption: item.caption == null ? item.caption : normalizeCopy(item.caption)
    })), (item) => item.sheetId != null ? 'sheet:' + item.sheetId : fingerprint(item));
  }
  if (Array.isArray(details.warnings)) {
    visible.warnings = uniqueRows(details.warnings.map(normalizeCopy).filter(Boolean), (warning) => warning);
  }
  return visible;
}

function publicGuideText(guide) {
  const sections = guide.details?.sections;
  if (!Array.isArray(sections) || guide.details?.audit?.preservedEditorialGuide) return guide.text;
  const assemble = rows => rows.map(section => '## ' + section.title + '\n\n' + section.text).join('\n\n');
  // Only regenerate prose that is exactly the saved generated chapter body.
  // An editor's independent text always takes precedence over its old trailer.
  return guide.text === assemble(sections) ? assemble(normalizeDetails(guide.details).sections) : guide.text;
}

function readDetails(value) {
  const source = String(value || '');
  const match = MARKER.exec(source);
  if (!match) return { text: source, details: null };
  try {
    const details = JSON.parse(match[1]);
    if (!details || details.version !== 1 || typeof details !== 'object' || Array.isArray(details)) return { text: source, details: null };
    return { text: source.slice(0, match.index).trimEnd(), details };
  } catch (_) { return { text: source, details: null }; }
}

function writeDetails(text, details) {
  const prose = readDetails(text).text.trimEnd();
  if (!details) return prose;
  // Escape the comment terminator even inside third-party source text.
  const json = JSON.stringify({ ...details, version: 1 }).replace(/-->/g, '--\\u003e');
  const value = prose + '\n\n<!-- race-details:v1\n' + json + '\n-->';
  if (value.length > GUIDE_TEXT_MAX) throw new Error('赛事图文资料超过可保存长度，请分离原始附件后重试；正文未截断');
  return value;
}

function mergeGuideText(next, previous) {
  const current = readDetails(previous);
  const incoming = readDetails(next);
  if (incoming.details || !current.details) return String(next || '');
  const details = { ...current.details };
  // An editor's replacement prose takes precedence over collected chapters.
  if (incoming.text !== current.text) {
    details.sections = [];
    details.audit = { ...(details.audit || {}), preservedEditorialGuide: true };
  }
  return writeDetails(incoming.text, details);
}

function registrationOf(row, details, now = new Date()) {
  const record = details?.registration || {};
  let status = record.verified === true && Object.hasOwn(LABELS, record.status) ? record.status : 'unknown';
  const prose = readDetails(row.guide_text || row.guideText).text;
  if (/^赛事已取消[。\s]/.test(prose)) status = 'cancelled';
  const generalDeadline = !/早鸟|精英|优惠/.test(row.deadline_name || row.deadlineName || '') ? row.deadline : '';
  const deadline = record.verified === true && record.closesAt || generalDeadline;
  const opensAt = row.reg_start || row.regStart || record.opensAt;
  const time = (s, end) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(s + (end ? 'T23:59:59+08:00' : 'T00:00:00+08:00')) : Date.parse(s);
  if (!['cancelled', 'invalid', 'sold_out', 'closed'].includes(status)) {
    if (deadline && time(deadline, true) <= now.getTime()) status = 'closed';
    else if (opensAt && time(opensAt, false) > now.getTime()) status = 'not_open';
    else if (deadline && time(deadline, true) > now.getTime()) status = 'open';
  }
  return { status, label: LABELS[status] || '' };
}

function publicDetails(details) {
  if (!details) return null;
  // Source URLs and raw OCR diagnostics remain in the saved audit record.
  const normalized = normalizeDetails(details);
  const { sources, audit, warnings, ...visible } = normalized;
  if (visible.registration) {
    const { sourceUrl, ...registration } = visible.registration;
    visible.registration = registration;
  }
  if (Array.isArray(visible.groups)) visible.groups = visible.groups.map(group => {
    const { sourceUrl, ...fields } = group;
    if (Array.isArray(fields.fees)) fields.fees = fields.fees.map(({ sourceUrl, ...fee }) => fee);
    return fields;
  });
  if (Array.isArray(visible.sections)) visible.sections = visible.sections.map(({ title, text }) => ({ title, text }));
  if (Array.isArray(visible.media)) visible.media = visible.media.filter(item => item.sheetId).map(({ sheetId, kind, caption }) => ({ sheetId, kind, caption }));
  return visible;
}

module.exports = { GUIDE_TEXT_MAX, readDetails, writeDetails, mergeGuideText, registrationOf, publicDetails, publicGuideText, normalizeDetails };
