import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const values = {
  games: "10", sets: "1", mode: "0", "pay-table": "8/5", credit: "5", denom: "1", seed: "42",
  "rtp-target": "98.0", "rtp-strength": "1.0",
  "bankroll-start": "1000", "bankroll-walk": "1300", "bankroll-min": "1",
};
const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    value: values[id] ?? "", checked: false, type: id === "rebuy" ? "checkbox" : "text", hidden: false, disabled: false, textContent: "", innerHTML: "",
    addEventListener() {}, scrollIntoView() {}, getBoundingClientRect() { return { width: 900, height: 360 }; },
  });
  return nodes.get(id);
}
const context = vm.createContext({
  console, crypto: webcrypto, setTimeout, clearTimeout, Intl, BigInt,
  document: { getElementById: node, modelContext: undefined },
  window: { addEventListener() {}, devicePixelRatio: 1 },
});
let source = fs.readFileSync(new URL("./dist/app.js", import.meta.url), "utf8");
const resultStyles = fs.readFileSync(new URL("./dist/results-layout.css", import.meta.url), "utf8");
assert.match(resultStyles, /minmax\(min\(100%, 180px\), 1fr\)/);
assert.match(resultStyles, /white-space: nowrap/);
source += "\nglobalThis.testApi = { handCategory, chooseHold, nextCredit, rtpCorrectionProbability, runExperiment, readParams, formatPlayTime, money, percent, PAYTABLES };";
vm.runInContext(source, context);
const { handCategory, chooseHold, nextCredit, rtpCorrectionProbability, runExperiment, readParams, formatPlayTime, money, percent, PAYTABLES } = context.testApi;

const categories = {
  royal_flush: ["Ts", "Js", "Qs", "Ks", "As"], straight_flush: ["5h", "6h", "7h", "8h", "9h"],
  four_aces: ["Ac", "Ad", "Ah", "As", "2c"], four_2_3_4: ["3c", "3d", "3h", "3s", "Kc"],
  four_5_k: ["Kc", "Kd", "Kh", "Ks", "Ac"], full_house: ["Tc", "Td", "Th", "2s", "2c"],
  flush: ["2c", "5c", "8c", "Jc", "Kc"], straight: ["Ac", "2d", "3h", "4s", "5c"],
  three_kind: ["7c", "7d", "7h", "2s", "Kc"], two_pair: ["7c", "7d", "2h", "2s", "Kc"],
  jacks_or_better: ["Qc", "Qd", "2h", "7s", "9c"], nothing: ["2c", "5d", "8h", "Ts", "Kc"],
};
for (const [expected, hand] of Object.entries(categories)) assert.equal(handCategory(hand), expected);
assert.deepEqual([...chooseHold(["Ts", "Js", "Qs", "Ks", "As"])], [0, 1, 2, 3, 4]);
assert.deepEqual([...chooseHold(["Ts", "Js", "Qs", "Ks", "2s"])], [0, 1, 2, 3]);
assert.deepEqual([...chooseHold(["2c", "2d", "8h", "Ts", "Kc"])], [0, 1]);
assert.deepEqual([...chooseHold(["9s", "Js", "Qs", "2c", "4d"])], [1, 2]);
assert.deepEqual([...chooseHold(["9s", "Qs", "Ks", "2c", "4d"])], [1, 2]);
assert.deepEqual([...chooseHold(["As", "2s", "3s", "8c", "9d"])], [0]);
assert.deepEqual([...chooseHold(["3s", "4s", "6s", "5d", "Kh"])], [0, 1, 2, 3]);
assert.deepEqual([...chooseHold(["3s", "5s", "7s", "Kd", "Tc"])], [3]);
assert.deepEqual([...chooseHold(["3s", "5s", "7s", "9d", "Tc"])], [0, 1, 2]);
assert.deepEqual([...chooseHold(["Jc", "Qd", "2h", "7s", "9c"])], [0]);
assert.equal(nextCredit(1, "nothing", 4), 5);
assert.equal(nextCredit(1, "nothing", 5), 5);
assert.equal(nextCredit(2, "two_pair", 4), 5);
assert.equal(nextCredit(3, "two_pair", 5), 4);
assert.equal(nextCredit(4, "two_pair", 4), 5);
assert.equal(nextCredit(5, "nothing", 4), 5);
assert.equal(formatPlayTime(2000), "2h 47m");
assert.equal(formatPlayTime(10), "0h 1m");
assert.equal(money(1234.56), "$1,235");
assert.equal(percent(0.9916081, 1), "99.2%");
assert.deepEqual([...PAYTABLES["8/5"].full_house], [8, 16, 24, 32, 40]);
assert.deepEqual([...PAYTABLES["7/5"].full_house], [7, 14, 21, 28, 35]);
assert.deepEqual([...PAYTABLES["6/5"].full_house], [6, 12, 18, 24, 30]);
assert.equal(readParams().rtpTarget, 98);
assert.equal(readParams().rtpStrength, 1);
assert.equal(rtpCorrectionProbability(10, 100, 1, 1), 0.01);
assert.equal(rtpCorrectionProbability(10, 100, 1, 4), 0.005);
assert.equal(rtpCorrectionProbability(10, 100, 0, 1), 0);
const params = { games: 10, sets: 2, mode: 0, payTable: "8/5", credit: 1, denom: 1, seed: 42, rtpTarget: 99.2, rtpStrength: 1, bankrollStart: 1000, bankrollWalk: 1300, bankrollMin: 1, rebuy: false };
const first = await runExperiment(params);
const second = await runExperiment(params);
assert.equal(first.averageBet, 10);
assert.equal(first.averageWager, 1);
assert.equal(first.rtp, first.averageReturned / first.averageBet);
assert.ok(first.averageCorrectionProbability >= 0);
assert.equal(first.averageFavorableAdjustments + first.averageUnfavorableAdjustments, 0);
assert.deepEqual(first.averageCategories, second.averageCategories);
assert.equal(first.averageHistory.length, 11);
const randomLowTarget = await runExperiment({ ...params, games: 100, sets: 1, rtpTarget: 0, rtpStrength: 0 });
const randomHighTarget = await runExperiment({ ...params, games: 100, sets: 1, rtpTarget: 100, rtpStrength: 0 });
assert.equal(randomLowTarget.averageReturned, randomHighTarget.averageReturned);
assert.deepEqual(randomLowTarget.averageCategories, randomHighTarget.averageCategories);
assert.equal(randomLowTarget.averageCorrectionProbability, 0);
assert.equal(randomLowTarget.averageFavorableAdjustments + randomLowTarget.averageUnfavorableAdjustments, 0);
const controlled = await runExperiment({
  ...params, games: 5000, sets: 1, rtpTarget: 100, rtpStrength: 25,
  bankrollStart: 1000000, bankrollWalk: 2000000, bankrollMin: 0,
});
assert.ok(controlled.averageCorrectionProbability > 0);
assert.ok(controlled.averageFavorableAdjustments + controlled.averageUnfavorableAdjustments > 0);
await assert.rejects(runExperiment({ ...params, rtpStrength: 25.1 }), /between 0% and 25%/);
const fixedFive = await runExperiment({ ...params, sets: 1, credit: 5 });
assert.equal(fixedFive.averageWager, 5);
const rebuyRun = await runExperiment({
  ...params, games: 20, sets: 1, seed: 42, bankrollStart: 10,
  bankrollWalk: 100, bankrollMin: 9.99, rebuy: true,
});
assert.ok(rebuyRun.averageRebuys > 0);
assert.equal(rebuyRun.averageRebuyDollars,
  rebuyRun.averageRebuys * rebuyRun.bankrollStart);
assert.equal(rebuyRun.averageNet, rebuyRun.averageReturned - rebuyRun.averageBet);
console.log("Browser simulator checks passed");
