const test = require("node:test");
const assert = require("node:assert/strict");
const { inChannel, presentRace, summarizeMarks } = require("../src/races");

test("race summaries describe finish outcomes separately from pending participation", () => {
  assert.equal(summarizeMarks({ 完赛: 2 }), "2 人完赛");
  assert.equal(summarizeMarks({ 已报名: 1, 完赛: 2, 未完赛: 1, 弃赛: 1 }), "1 人已报名，2 人完赛，1 人未完赛，1 人弃赛");
  assert.equal(summarizeMarks({ 想跑: 2 }), "2 人想跑");
});

test("race track type and participation format are independent browsing dimensions", () => {
  const cases = [
    { race: { kind: "road", meet: "offline" }, matches: ["road", "offline"] },
    { race: { kind: "trail", meet: "offline" }, matches: ["trail", "offline"] },
    { race: { kind: "road", meet: "online" }, matches: ["road", "online"] },
    { race: { kind: "trail", meet: "online" }, matches: ["trail", "online"] }
  ];
  for (const { race, matches } of cases) {
    for (const channel of ["road", "trail", "online", "offline"]) {
      assert.equal(inChannel(race, channel), matches.includes(channel), JSON.stringify({ race, channel }));
    }
    assert.equal(inChannel(race, ""), true);
    assert.equal(inChannel(race, "unsupported"), false);
  }
});

test("an unmarked race remains offline and an explicit online race remains online", () => {
  const source = { id: "format-test", name: "赛事", city: "北京", province: "北京", distances: "half", raceDate: "2099-01-01", deadline: "" };
  const offline = presentRace({ ...source, kinds: "trail" }, new Date("2026-10-27T00:00:00Z"));
  assert.equal(offline.kind, "trail");
  assert.equal(offline.meet, "offline");
  assert.equal(inChannel(offline, "offline"), true);
  assert.equal(inChannel(offline, "road"), false);
  const online = presentRace({ ...source, meet: "online" }, new Date("2026-10-27T00:00:00Z"));
  assert.equal(online.kind, "road");
  assert.equal(online.meet, "online");
  assert.equal(inChannel(online, "road"), true);
  assert.equal(inChannel(online, "online"), true);
  assert.equal(inChannel(online, "offline"), false);
});

test("missing registration data does not claim an official announcement state", () => {
  const race = presentRace({ id: "missing", name: "待录入", distances: "half", raceDate: "2027-03-21", deadline: "" }, new Date("2026-11-16T12:00:00Z"));
  assert.equal(race.regStatus, "报名时间未录入");
  assert.equal(race.deadlineLabel, "报名时间未录入");
  assert.equal(race.open, false);
});

test("registration starts at the beginning of a recorded China date and at the exact timestamp when supplied", () => {
  const row = { id: "scheduled", name: "分阶段", distances: "full", raceDate: "2027-03-21", regStart: "2026-11-17", deadline: "2026-11-20" };
  const before = presentRace(row, new Date("2026-11-16T15:59:59Z"));
  assert.equal(before.regStatus, "未开始");
  assert.equal(before.open, false);
  const started = presentRace(row, new Date("2026-11-16T16:00:00Z"));
  assert.equal(started.regStatus, "报名中");
  assert.equal(started.open, true);
  assert.equal(presentRace({ ...row, regStart: "2026-11-17T10:00:00+08:00" }, new Date("2026-11-17T01:59:59Z")).open, false);
  assert.equal(presentRace({ ...row, regStart: "2026-11-17T10:00:00+08:00" }, new Date("2026-11-17T02:00:00Z")).open, true);
});
