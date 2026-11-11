// Isolated transport regression: responses are synthetic, no HTTP requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/utils/request.js'), 'utf8');

function fixture(response, failure) {
  const module = { exports: {} };
  const options = [];
  const app = { globalData: { baseUrl: 'https://fixture.invalid', token: 'synthetic-session' } };
  const sandbox = {
    module, getApp: () => app,
    require: name => {
      assert.equal(name, './avatar');
      return { networkAvatar: value => value, normalizeAvatars: value => value };
    },
    wx: { request: input => { options.push(input); failure ? input.fail(failure) : input.success(response); } }
  };
  vm.runInNewContext(source, sandbox, { filename: 'utils/request.js' });
  return { ...module.exports, options };
}

(async () => {
  const checks = [];
  for (const [name, status, data, expected, code] of [
    ['HTML route missing', 404, '<!doctype html><pre>Cannot GET /private/path</pre>', /HTTP 404/],
    ['JSON authorization message', 401, { error: '请先登录', code: 'AUTH_REQUIRED' }, /^请先登录$/, 'AUTH_REQUIRED'],
    ['Blank unauthorized response', 401, null, /登录/],
    ['Forbidden response', 403, {}, /权限/],
    ['Content removed', 404, {}, /不存在或已删除/],
    ['Optimistic edit conflict', 409, { error: '模板已更新', code: 'STALE_VERSION' }, /^模板已更新$/, 'STALE_VERSION'],
    ['Gateway HTML', 502, '<html>internal upstream address</html>', /服务暂时不可用/]
  ]) {
    const f = fixture({ statusCode: status, data });
    await assert.rejects(f.request('/clubs/13/activity-templates'), error => {
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.match(error.message, expected);
      assert.ok(!error.message.includes('<html') && !error.message.includes('Cannot GET'));
      return true;
    });
    assert.equal(f.options[0].header.Authorization, 'Bearer synthetic-session');
    checks.push(name);
  }
  const f = fixture({ statusCode: 200, data: { templates: [] } });
  assert.deepEqual(await f.request('/clubs/13/activity-templates'), { templates: [] });
  checks.push('Successful template response is preserved');
  await assert.rejects(fixture(null, { errMsg: 'request:fail timeout' }).request('/me'), /请求超时/);
  checks.push('Network timeout remains actionable');
  console.log(JSON.stringify({ passed: true, kind: 'Synthetic WeChat transport responses; no HTTP', checks }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
