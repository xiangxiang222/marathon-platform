const test=require('node:test');
const assert=require('node:assert/strict');
const mini=require('../miniprogram/utils/content');
test('web and mini show news dates in China, matching the ten-day collection window',async()=>{
  const web=await import('../web/src/content-date.js');
  for(const [input,expected] of [['2026-11-02T23:07:00.000Z','2026-11-03'],['2026-12-31T16:01:00Z','2027-01-01'],['2024-02-29T16:01:00Z','2024-03-01'],['2026-11-03T07:07:00+08:00','2026-11-03'],['2026-11-03','2026-11-03'],['',''],['invalid','']]){
    assert.equal(web.contentDate(input),expected);assert.equal(mini.contentDate(input),expected);
  }
  assert.equal(mini.decorate({publishedAt:'2026-11-02T23:07:00.000Z'},0,1).dateLabel,'2026-11-03');
});
