'use strict';
// Read-only acceptance against the actual deployed page and saved API data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const origin = process.env.RACE_LIVE_ORIGIN || 'https://togetherbetter.cn';
const out = process.env.RACE_RICH_OUTPUT || '/tmp/race-rich-live';
const report = { kind: 'Deployed web page and production API; Chrome mobile viewports, not a WeChat device or published mini program.', startedAt:new Date().toISOString(), passed:false, checks:[], errors:[] };
let browser;
async function json(url) { const r = await fetch(origin + url); assert.equal(r.status,200,url); return r.json(); }
(async () => {
  fs.mkdirSync(out,{recursive:true});
  const {race} = await json('/marathon/api/races/zuiku-96336');
  assert.equal(race.details.groups.length,4);
  const expected = [[49.93,2984,13,398],[24.8,1550,8,198],[13.5,816,5,98],[13.5,816,5,196]];
  race.details.groups.forEach((group,i) => {
    assert.equal(group.actualDistanceKm,expected[i][0]);
    assert.equal(group.ascentM,expected[i][1]);
    assert.equal(group.cutoffHours,expected[i][2]);
    assert.ok(group.fees.some(fee => fee.amount===expected[i][3]));
    assert.ok(group.eligibility);
  });
  assert.equal(race.details.registration.opensAt,'2026-09-15');
  assert.equal(race.details.registration.closesAt,'2026-11-10');
  assert.match(race.pickup,/11月20日/);
  assert.match(race.guideText,/强制装备/);
  assert.match(race.guideText,/退费|退款/);
  assert.equal(race.registrationStatus,'closed');
  assert.ok(race.routeSheets.length>=3);
  const sheets = [...race.guide,...race.routeSheets];
  for (const sheet of sheets) {
    const image = await fetch(origin+'/marathon/api/race-sheets/'+sheet.id);
    assert.equal(image.status,200); assert.match(image.headers.get('content-type'),/^image\//);
  }
  report.savedImagesVerified=sheets.length;
  const qr = await fetch(origin+race.signupQrUrl); assert.equal(qr.status,200);
  fs.writeFileSync(path.join(out,'dianjiang-signup-qr.png'),Buffer.from(await qr.arrayBuffer()));
  report.qrImage=path.join(out,'dianjiang-signup-qr.png');
  // Decode the saved PNG with an independent scanner as a separate check.
  report.expectedQrTarget='https://reg.zuicool.com/77675';
  const calendar = await json('/marathon/api/races?status=upcoming&page=1&pageSize=40');
  assert.ok(calendar.races.every(item=>!Object.hasOwn(item,'guideText')&&!Object.hasOwn(item,'details')));
  report.calendarBytes=Buffer.byteLength(JSON.stringify(calendar));
  assert.ok(report.calendarBytes<1024*1024);
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const page=await browser.newPage(); page.on('pageerror',error=>report.errors.push(error.message));
  for (const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.goto(origin+'/marathon/races/'+race.id,{waitUntil:'networkidle'});
    await page.locator('.race-group').last().waitFor();
    assert.equal(await page.locator('.race-group').count(),4);
    assert.match(await page.locator('.race-group').nth(3).innerText(),/亲子.*196/s);
    assert.match(await page.locator('.race-group').nth(2).innerText(),/实际里程\s*13.5公里/);
    assert.equal(await page.locator('.signup-entry img').count(),1);
    assert.equal(await page.locator('.signup-entry a,.signup-entry summary').count(),0);
    assert.match(await page.locator('.signup-entry').innerText(),/报名已截止/);
    await page.locator('.signup-qr-preview').click(); await page.locator('dialog[open]').waitFor();
    await page.getByRole('button',{name:'关闭图片预览',exact:true}).click();
    await page.screenshot({path:path.join(out,'live-info-'+width+'.png'),fullPage:true});
    await page.getByRole('tab',{name:'参赛指南',exact:true}).click();
    assert.ok(await page.locator('.guide-table').count()>0);
    for (const image of await page.locator('.guide-section img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(element=>element.decode());
      assert.ok(await image.evaluate(element=>element.naturalWidth>0));
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(out,'live-guide-'+width+'.png'),fullPage:true});
  }
  for (const id of ['zuiku-71615','zuiku-85293']) {
    const {race:cancelled}=await json('/marathon/api/races/'+id);
    assert.equal(cancelled.registrationStatus,'cancelled'); assert.equal(cancelled.signupQrAvailable,false);
    assert.equal((await fetch(origin+'/marathon/api/races/'+id+'/signup-qr')).status,404);
    await page.goto(origin+'/marathon/races/'+id,{waitUntil:'networkidle'});
    assert.equal(await page.locator('.signup-entry img').count(),0);
  }
  report.checks.push('Saved four options, fees, actual distances, climbs, cutoffs, dates, eligibility, pickup and guide chapters.', 'Every selected pilot image is served and decoded in the deployed page at 320/390px.', 'One QR preview and truthful closed status; actual cancelled events suppress registration QR.', 'Calendar avoids full rich documents and stays below 1 MiB for the first 40 items.');
  assert.deepEqual(report.errors,[]); report.passed=true;
})().catch(error=>{report.error=error.stack;process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();report.completedAt=new Date().toISOString();
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
});
