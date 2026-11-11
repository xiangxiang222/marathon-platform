const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const canonical = fs.readFileSync(path.join(root, 'miniprogram/utils/achievement-model.js'), 'utf8');
const target = path.join(root, 'web/src/achievement-model.js');
const mirror = canonical.replace('// Canonical pure poster data model. The Web ESM mirror is generated from this file.', '// Generated from miniprogram/utils/achievement-model.js by scripts/sync-achievement-model.cjs.').replace(/^module\.exports = (\{[^\n]+\});$/m, 'export $1;');
if (mirror === canonical) throw Error('Canonical achievement model export was not recognized');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== mirror) throw Error('Achievement model ESM mirror is stale');
  console.log('Achievement model mirror matches canonical source.');
} else { fs.writeFileSync(target, mirror); console.log('Synchronized achievement model CJS / ESM.'); }
