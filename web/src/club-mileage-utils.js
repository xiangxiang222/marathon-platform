// Calendar navigation uses Beijing wall dates and never the browser timezone.
export function beijingDay() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}
export function validMileageDate(value, fallback = beijingDay()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9998-12-31') return fallback;
  const instant = Date.parse(value + 'T12:00:00Z');
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value ? value : fallback;
}
function periodKey(range, date) {
  if (range === 'all') return '';
  if (range === 'year') return date.slice(0, 4);
  if (range === 'month') return date.slice(0, 7);
  if (range === 'week') {
    const value = new Date(date + 'T12:00:00Z');
    value.setUTCDate(value.getUTCDate() + 1 - (value.getUTCDay() || 7));
    return value.toISOString().slice(0, 10);
  }
  return date;
}
export function canAdvanceMileage(range, date, today = beijingDay()) {
  return range !== 'all' && periodKey(range, validMileageDate(date, today)) < periodKey(range, today);
}
export function moveMileageDate(range, date, direction, today = beijingDay()) {
  const value = new Date(validMileageDate(date, today) + 'T12:00:00Z');
  if (range === 'day') value.setUTCDate(value.getUTCDate() + direction);
  else if (range === 'week') value.setUTCDate(value.getUTCDate() + direction * 7);
  else if (range === 'month') { value.setUTCDate(1); value.setUTCMonth(value.getUTCMonth() + direction); }
  else if (range === 'year') { value.setUTCMonth(0, 1); value.setUTCFullYear(value.getUTCFullYear() + direction); }
  const result = value.toISOString().slice(0, 10);
  return result < '1900-01-01' ? '1900-01-01' : result > today ? today : result;
}
