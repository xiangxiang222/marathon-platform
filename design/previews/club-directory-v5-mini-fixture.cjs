/* Current Page/WXML/WXSS source mirrors, including enlarged text; not device evidence. */
'use strict';
const original = require('./club-entry-v4-mini-fixture.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = async () => { await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); };
module.exports = {
  cases: [...original.cases, { route:'pages/clubs/clubs', scenario:'large-text' }],
  async prepare(route, initial, scenario) {
    if(scenario !== 'large-text') return original.prepare(route, initial, scenario);
    const {page} = original.instance(); page.onShow(); await tick();
    page.onMineQuery({detail:{value:'#109'}});
    const data=clone(page.data); page.onUnload();
    return {data,components:{},css:'.club-name{font-size:18px!important}.my-club-meta{font-size:14px!important}'};
  },
  async audit(context) {
    const {page,scenario}=context;
    const errors=scenario === 'large-text' ? [] : await original.audit(context);
    const visual=await page.evaluate(() => {
      const quick=document.querySelector('.club-quick-actions navigator');
      const inner=quick?.querySelector('span');
      const action=document.querySelector('.result-action');
      const hero=document.querySelector('.club-hero'), workbench=document.querySelector('.club-services');
      const heroStyle=getComputedStyle(hero);
      const stops=[...heroStyle.backgroundImage.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)].map(match=>match.slice(1,4).map(Number));
      const title=heroStyle.color.match(/\d+/g).slice(0,3).map(Number);
      return {stops,title,card:getComputedStyle(workbench).backgroundColor,targetWidth:quick?.getBoundingClientRect().width,targetHeight:quick?.getBoundingClientRect().height,border:inner&&getComputedStyle(inner).borderTopWidth,actionBackground:action&&getComputedStyle(action).backgroundColor};
    });
    if(visual.stops.length < 2 || visual.stops.some(stop => Math.min(...stop) < 200) || Math.max(...visual.title) >= 130 || visual.card !== 'rgb(255, 255, 255)')errors.push('The hero must use pale lavender and dark text with a white service card');
    if(visual.targetWidth && (visual.targetWidth<44 || visual.targetHeight<44 || visual.border !== '1px'))errors.push('Quick actions require bounded secondary controls and 44px tap targets');
    if(visual.actionBackground && visual.actionBackground !== 'rgba(0, 0, 0, 0)')errors.push('Result navigation must not become a large filled button');
    if(scenario === 'large-text' && await page.locator('.my-club').count() !== 1)errors.push('Long-name enlarged-text fixture must search the complete membership list');
    if(scenario === 'guest' && (await page.locator('.club-services a.club-primary').textContent()) !== '登录查看我的跑团')errors.push('The guest service CTA must be a navigation link to sign-in');
    const targets = await page.locator('.club-services button,.club-primary,.city-apply,.result-action').evaluateAll(items => items.map(el => el.getBoundingClientRect().toJSON()));
    if(targets.some(box => box.width < 44 || box.height < 44))errors.push('Directory primary, filter and result controls need 44px hit areas');
    return errors;
  }
};
