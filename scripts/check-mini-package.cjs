'use strict';
// Raw runtime-source budget, with headroom for DevTools compilation overhead.
// This is not a substitute for the package size returned by a WeChat preview.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'miniprogram');
const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
const budget = 1536 * 1024;
const rules = config.packOptions || {};
function matches(file, rule) {
  const name = file.toLowerCase(), value = rule.value.toLowerCase().replace(/^\/+/, '');
  if (rule.type === 'suffix') return name.endsWith(value);
  if (rule.type === 'file') return name === value;
  if (rule.type === 'folder') return name === value || name.startsWith(value + '/');
  throw Error('Unsupported packaging rule: ' + rule.type);
}
function included(file) {
  if (/^project(?:\.private)?\.config\.json$/.test(file)) return false;
  return (rules.include || []).some(rule => matches(file, rule)) || !(rules.ignore || []).some(rule => matches(file, rule));
}
function files(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const name = prefix + entry.name;
    assert.ok(!entry.isSymbolicLink(), 'Unexpected package symlink: ' + name);
    if (entry.isDirectory()) return files(path.join(dir, entry.name), name + '/');
    return [{ name, bytes: fs.statSync(path.join(root, name)).size }];
  });
}
const all = files(root), runtime = all.filter(file => included(file.name));
const bytes = runtime.reduce((sum, file) => sum + file.bytes, 0);
const assets = new Set();
for (const file of runtime.filter(file => /\.(?:js|wxml|wxss|json)$/.test(file.name))) {
  const source = fs.readFileSync(path.join(root, file.name), 'utf8');
  for (const match of source.matchAll(/(?:\/)?images\/[\w/-]+\.(?:png|jpe?g|webp|svg)/g)) {
    const asset = match[0].replace(/^\//, '');
    assets.add(asset);
    assert.ok(fs.existsSync(path.join(root, asset)), file.name + ' references missing asset ' + asset);
    assert.ok(included(asset), file.name + ' references excluded asset ' + asset);
  }
}
// VIEWS/quickLinks contain full literal paths; their WXML binds item.icon.
for (const name of ['quick-calendar', 'quick-clubs', 'quick-news', 'quick-radar', 'art-shoe', 'club-create']) {
  assert.ok(assets.has('images/' + name + '.png'), 'Active illustration must remain packaged: ' + name);
}
for (const option of ['minified', 'minifyWXSS', 'minifyWXML']) {
  assert.equal(config.setting[option], true, 'Enable ' + option + ' to preserve package headroom');
}
assert.equal(config.setting.uploadWithSourceMap, false, 'Source maps must stay outside the runtime package');
assert.ok(bytes <= budget, `Mini runtime sources ${(bytes / 1024).toFixed(1)} KiB exceed ${budget / 1024} KiB budget; optimize assets before adding more`);
const report = {
  kind: 'Raw runtime-source budget; actual compiled size must be verified in DevTools',
  passed: true,
  sourceBytes: bytes,
  budgetBytes: budget,
  headroomToTwoMiB: 2 * 1024 * 1024 - bytes,
  packagedFiles: runtime.length,
  referencedImages: assets.size,
  excludedBytes: all.reduce((sum, file) => sum + file.bytes, 0) - bytes,
  excluded: all.filter(file => !included(file.name)),
};
console.log(JSON.stringify(report, null, 2));
