import assert from "node:assert/strict";
import { callCsv, clubRaceCsv, renderResultPoster } from "../../web/src/result-poster.js";

const rows = Array.from({ length: 360 }, (_, index) => ({ place: index + 1, nickname: index === 0 ? "=HYPERLINK(\"x\")" : "跑者" + index, clock: "3:40:00", tag: index === 0 ? "PB" : "", staffFilled: false }));
let canvas;
globalThis.document = {
  createElement(name) {
    assert.equal(name, "canvas");
    const ctx = {
      measureText: (text) => ({ width: String(text).length * 14 }),
      fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}
    };
    canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: () => "data:image/png;base64,fixture" };
    return canvas;
  }
};
const call = { title: "城市马拉松", raceDate: "2026-11-18", summary: "本场 PB 1 人", groups: [{ label: "全马", rows }] };
assert.equal(renderResultPoster(call), "data:image/png;base64,fixture");
assert.ok(canvas.height < 32768);
const csv = callCsv(call);
assert.ok(csv.startsWith("\ufeff\"比赛\""));
assert.ok(csv.includes("'=HYPERLINK"));
assert.equal(csv.split("\r\n").length, 361);
const clubCsv = clubRaceCsv([{ race: { name: "杭州马拉松", raceDate: "2026-11-18", city: "杭州", distanceLabels: ["半马"] }, marks: [{ userId: 1, nickname: "小鹿", status: "中签", clock: "1:42:00", pb: true }], results: [{ userId: 1, nickname: "小鹿", distanceLabel: "半马", clock: "1:42:00", pb: true }, { userId: 2, nickname: "=2+2", distanceLabel: "全马", clock: "3:20:00", pb: false }] }]);
assert.ok(clubCsv.includes("杭州马拉松"));
assert.ok(clubCsv.includes("'=2+2"));
assert.equal(clubCsv.split("\r\n").length, 3);
console.log(JSON.stringify({ passed: true, checks: ["poster with long but bounded canvas", "all result rows included in CSV", "club export includes marked runners and results", "spreadsheet formula prefix escaped"] }, null, 2));
