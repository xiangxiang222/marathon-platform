// Rich collection records share the existing TEXT column with the editable guide.
// Keeping the record in a versioned trailer avoids a database migration and lets
// older/manual guides remain readable and editable.
const MARKER = /\n?<!-- race-details:v1\n([\s\S]*?)\n-->\s*$/;
const GUIDE_TEXT_MAX = 2000000;
const LABELS = { open: '报名中', closed: '报名已截止', sold_out: '报名已满', not_open: '报名未开始', cancelled: '赛事已取消', invalid: '报名入口已失效', unknown: '' };

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
  const { sources, audit, warnings, ...visible } = details;
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

module.exports = { GUIDE_TEXT_MAX, readDetails, writeDetails, mergeGuideText, registrationOf, publicDetails };
