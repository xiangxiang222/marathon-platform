export function contentDate(value) {
  if (!value) return '';
  const timestamp=Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp+8*3600000).toISOString().slice(0,10) : '';
}
