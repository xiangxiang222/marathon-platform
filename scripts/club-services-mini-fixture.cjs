/* Source-mirror fixtures for club member/service tabs, not WeChat device evidence. */
const fixture = require('../design/previews/club-mileage-test-fixture.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
module.exports = {
  cases: ['settings', 'settings-expanded', 'fees', 'fees-expanded', 'members'].map(scenario => ({ route: 'pages/club/club', scenario })),
  async prepare(route, initialData, scenario) {
    const current = fixture.miniFixture(route);
    current.instance.setData({ ...clone(initialData), activeTab: 'members', memberArea: scenario.startsWith('fees') ? 'fees' : scenario === 'members' ? 'all' : 'manage', club: { ...initialData.club, owner: true, staff: true }, relationshipOpen: false });
    if (scenario.endsWith('expanded')) current.instance.toggleForm(fixture.event({ form: scenario.startsWith('fees') ? 'fee' : 'group' }));
    return { data: current.instance.data, components: {}, css: '' };
  },
  async audit({ page, scenario }) {
    const errors = [];
    if (!scenario.startsWith('fees') && scenario !== 'members') {
      const entry = page.locator('.identity-setting');
      const metrics = await entry.evaluate(element => { const rect = element.getBoundingClientRect(); const title = element.querySelector('.section-title'); return { height: rect.height, titleSize: parseFloat(getComputedStyle(title).fontSize), color: getComputedStyle(title).color }; });
      if (metrics.height < 44 || metrics.titleSize !== 18) errors.push('Club settings row must retain 44px tap target and 18px section heading');
    }
    return errors;
  }
};
