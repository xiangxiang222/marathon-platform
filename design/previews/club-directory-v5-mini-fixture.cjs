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
      return {light:!!document.querySelector('.page-header-light'),background:getComputedStyle(document.body).backgroundColor,targetWidth:quick?.getBoundingClientRect().width,targetHeight:quick?.getBoundingClientRect().height,border:inner&&getComputedStyle(inner).borderTopWidth,actionBackground:action&&getComputedStyle(action).backgroundColor};
    });
    if(!visual.light || visual.background !== 'rgb(246, 245, 242)')errors.push('Directory must use a warm light header and page');
    if(visual.targetWidth && (visual.targetWidth<44 || visual.targetHeight<44 || visual.border !== '1px'))errors.push('Quick actions require bounded secondary controls and 44px tap targets');
    if(visual.actionBackground && visual.actionBackground !== 'rgba(0, 0, 0, 0)')errors.push('Result navigation must not become a large filled button');
    if(scenario === 'large-text' && await page.locator('.my-club').count() !== 1)errors.push('Long-name enlarged-text fixture must search the complete membership list');
    return errors;
  }
};
