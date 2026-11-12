/* Restrict the current Page-handler reader fixture to this service-owned route. */
const fixture = require('../../scripts/reading-pages-mini-fixture.cjs');
module.exports = { ...fixture, cases: fixture.cases.filter(row => row.route === 'pages/news/editor') };
