/* Standalone creation WXML/WXSS mirrors; synthetic records, no transport/device claim. */
'use strict';
const directory = require('./club-entry-v4-mini-fixture.cjs');
const creationRoute = 'pages/club-create/club-create';
const modes = ['base', 'filled', 'duplicates', 'legacy', 'continued', 'guest', 'error', 'submitting'];
module.exports = {
  cases: [...['base', 'empty', 'guest'].map(scenario => ({ route:'pages/clubs/clubs', scenario })), ...modes.map(scenario => ({ route:creationRoute, scenario }))],
  async prepare(route, initial, scenario) {
    if (route !== creationRoute) return directory.prepare(route, initial, scenario);
    const data = { ...initial, ready: scenario !== 'guest', loading:false };
    if (['filled', 'duplicates', 'error', 'submitting'].includes(scenario)) Object.assign(data, { name:'杭州湖畔夜跑团', city:'杭州 · 西湖', intro:'每周三晚，一起绕湖慢跑。每个人都有自己的节奏。' });
    if (scenario === 'duplicates') data.duplicates = [{ id:106, name:'杭州湖畔夜跑团', cityLabel:'杭州 · 西湖', leader:'一起跑的朋友', verified:true }, { id:107, name:'长名称西湖周末长距离跑步训练俱乐部', cityLabel:'杭州', leader:'跑团负责人' }];
    if (['legacy', 'continued'].includes(scenario)) data.application = { id:12, name:'之前提交的西湖跑团' };
    if (scenario === 'continued') Object.assign(data, { name:data.application.name, applicationId:12, foundingMessage:'补充活动城市后，点击创建即确认开通这份旧申请。' });
    if (scenario === 'error') Object.assign(data, { foundingMessage:'网络连接暂不可用，请重试。', loadMessage:'暂时无法读取之前的申请，请重试。', duplicateMessage:'暂时无法检查同名，你仍可创建。' });
    if (scenario === 'submitting') data.creating = true;
    return { data, components:{}, css:'button{width:calc(100% - 32px)}' };
  },
  async audit(context) {
    const { page, route, scenario, width } = context;
    if (route !== creationRoute) return directory.audit(context);
    const errors = [];
    const formCount = await page.locator('.create-form').count();
    if (formCount !== (scenario === 'guest' ? 0 : 1)) errors.push('Creation form must require login');
    const fields = await page.locator('.create-input,.create-intro').count();
    if (fields !== (scenario === 'guest' ? 0 : 3)) errors.push('Name, city and introduction must render together');
    const primary = await page.locator('.primary').boundingBox();
    if (!primary || primary.height < 44 || primary.x < 15 || primary.x + primary.width > width - 15) errors.push('Primary action must stay within page gutters with a 44px touch target');
    if (scenario === 'duplicates' && await page.locator('.duplicate-row').count() !== 2) errors.push('Similar clubs must expose two compact records');
    if (scenario === 'legacy' && await page.locator('.legacy-application').count() !== 1) errors.push('Previous application must remain available');
    if (scenario === 'continued' && await page.locator('.legacy-application').count()) errors.push('Confirmed previous application should move into editable form');
    const controls = await page.evaluate(() => [...document.querySelectorAll('button')].map(el => ({ height:el.getBoundingClientRect().height, right:el.getBoundingClientRect().right, font:parseFloat(getComputedStyle(el).fontSize) })));
    if (controls.some(el => el.height < 44 || el.right > width || el.font < 12)) errors.push('Controls must preserve native bounds, font size and tap target');
    return errors;
  }
};
