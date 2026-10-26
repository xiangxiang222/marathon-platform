const test = require("node:test");
const assert = require("node:assert/strict");
const { inChannel, presentRace } = require("../src/races");

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
