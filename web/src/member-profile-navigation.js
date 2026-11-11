// Keep profile links and their return destination inside the same application.
export function memberReturnTo(value, clubId) {
  const fallback = '/clubs/' + encodeURIComponent(String(clubId));
  if (typeof value !== 'string' || value.length > 2400 || /[\\\u0000-\u0020\u007f]/.test(value) || !value.startsWith('/') || value.startsWith('//')) return fallback;
  try {
    const url = new URL(value, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid') return fallback;
    const club = String(clubId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const insideClub = new RegExp('^/clubs/' + club + '(?:/(?:activities/\\d+(?:/(?:album|signup))?|calls/\\d+|internals/\\d+|meetups/\\d+))?$').test(url.pathname);
    if (!insideClub && !/^\/races\/[A-Za-z0-9_-]+$/.test(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
export function memberProfileLink(clubId, userId, { tab = 'info', range = 'month', date = '', returnTo = '' } = {}) {
  const query = { profileTab: tab, range };
  if (date) query.date = date;
  query.returnTo = memberReturnTo(returnTo, clubId);
  return { path: '/clubs/' + encodeURIComponent(String(clubId)) + '/members/' + encodeURIComponent(String(userId)), query };
}
