const images = {
  beijing: '/images/race-landmarks/beijing.png',
  shanghai: '/images/race-landmarks/shanghai.png',
  xiamen: '/images/race-landmarks/xiamen.png',
  wuxi: '/images/race-landmarks/wuxi.png',
  wuhan: '/images/race-landmarks/wuhan.png',
  guangzhou: '/images/race-landmarks/guangzhou.png',
  chongqing: '/images/race-landmarks/chongqing.png',
  dongying: '/images/race-landmarks/dongying.png',
  hengshuihu: '/images/race-landmarks/hengshuihu.png',
  xian: '/images/race-landmarks/xian.png',
  taiyuan: '/images/race-landmarks/taiyuan.png',
  changsha: '/images/race-landmarks/changsha.png',
  chengdu: '/images/race-landmarks/chengdu.png',
  dalian: '/images/race-landmarks/dalian.png',
  lanzhou: '/images/race-landmarks/lanzhou.png',
  shenzhen: '/images/race-landmarks/shenzhen.png',
  hangzhou: '/images/race-landmarks/hangzhou.png'
};

exports.landmarkSrc = id => Object.prototype.hasOwnProperty.call(images, id) ? images[id] : '';
