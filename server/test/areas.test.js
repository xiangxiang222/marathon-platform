const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

test("race places settle onto the province, city and county lists", async () => {
  const { countiesOf, settleRegion } = await import(pathToFileURL(path.join(__dirname, "../../web/src/areas.js")).href);
  assert.deepEqual(settleRegion("山东省", "济宁市", ""), { province: "山东", city: "济宁", district: "" });
  assert.ok(countiesOf("山东", "济宁").includes("任城区"));
  assert.ok(countiesOf("重庆", "重庆").includes("忠县"));
  assert.deepEqual(settleRegion("北京", "北京", "朝阳区").district, "朝阳区");
});
