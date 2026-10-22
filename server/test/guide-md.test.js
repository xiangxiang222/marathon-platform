const test = require("node:test");
const assert = require("node:assert/strict");
const { parseGuide } = require("../../miniprogram/utils/guide-md");

test("guide text keeps markdown heading levels", () => {
  const blocks = parseGuide(
    ["# 竞赛规程", "", "## 一、报名", "正文一段。", "### 时间", "- 全程 200 元", "- **半程** 100 元", "#### 补充", "1. 先到先得", "2、抽签"].join("\n")
  );
  assert.deepEqual(
    blocks.map((item) => item.kind),
    ["h1", "h2", "p", "h3", "li", "li", "h4", "oli", "oli"]
  );
  assert.equal(blocks[0].runs[0].text, "竞赛规程");
  assert.equal(blocks[1].runs[0].text, "一、报名");
  assert.equal(blocks[4].mark, "• ");
  assert.equal(blocks[5].runs[0].strong, true);
  assert.equal(blocks[5].runs[0].text, "半程");
  assert.equal(blocks[7].mark, "1. ");
  assert.equal(blocks[8].mark, "2. ");
  assert.equal(blocks[8].runs[0].text, "抽签");
});

test("plain guide lines stay paragraphs and links keep the label", () => {
  const blocks = parseGuide("沿滨河公园环湖。\n详见 [官网](https://example.com/race)。\n```\n不要把围栏当正文\n```");
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].kind, "p");
  assert.equal(blocks[1].runs.map((item) => item.text).join(""), "详见 官网。");
  assert.equal(blocks[2].runs[0].text, "不要把围栏当正文");
});

test("the page parser matches the mini program parser", async () => {
  const web = await import("../../web/src/guide-md.js");
  const sample = "# 竞赛规程\n\n## 一、报名\n正文\n- **半程** 100 元\n2、抽签\n详见 [官网](https://example.com/race)。";
  assert.deepEqual(web.parseGuide(sample), parseGuide(sample));
});
