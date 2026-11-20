const ids = new Set([
  'beijing', 'shanghai', 'xiamen', 'wuxi', 'wuhan', 'guangzhou', 'chongqing',
  'dongying', 'hengshuihu', 'xian', 'taiyuan', 'changsha', 'chengdu',
  'dalian', 'lanzhou', 'shenzhen', 'hangzhou',
]);

export function landmarkUrl(id) {
  return ids.has(id) ? import.meta.env.BASE_URL + 'images/race-landmarks/' + id + '.svg' : '';
}
