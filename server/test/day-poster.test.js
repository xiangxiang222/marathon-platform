const test = require("node:test");
const assert = require("node:assert/strict");
const { posterFacts, raceLine } = require("../../miniprogram/utils/day-poster");

test("a day poster names the weekday and keeps the race on one line", () => {
  const facts = posterFacts("2026-10-25");
  assert.equal(facts.month, "十月");
  assert.equal(facts.day, "25");
  assert.equal(facts.weekday, "星期日");
  assert.equal(
    raceLine({ city: "普洱市", distanceLabels: ["半程马拉松"], regStatus: "报名时间未公布" }),
    "普洱市  ·  半程马拉松  ·  报名时间未公布"
  );
  assert.equal(raceLine({ city: "杭州", kindLabels: ["越野"], regStatus: "待开赛" }), "杭州  ·  越野  ·  待开赛");
});
