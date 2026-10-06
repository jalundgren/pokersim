import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const values = {
  games: "10", sets: "1", mode: "0", credit: "5", denom: "1", seed: "42",
  "bankroll-start": "1000", "bankroll-walk": "1300", "bankroll-min": "1",
};
const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    value: values[id] ?? "", hidden: false, disabled: false, textContent: "", innerHTML: "",
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
source += "\nglobalThis.testApi = { handCategory, chooseHold, nextCredit, runExperiment };";
vm.runInContext(source, context);
const { handCategory, chooseHold, nextCredit, runExperiment } = context.testApi;

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
assert.equal(nextCredit(1, "nothing", 4), 5);
assert.equal(nextCredit(1, "nothing", 5), 5);
assert.equal(nextCredit(2, "two_pair", 4), 5);
assert.equal(nextCredit(3, "two_pair", 5), 4);
assert.equal(nextCredit(4, "two_pair", 4), 5);
assert.equal(nextCredit(5, "nothing", 4), 5);
const params = { games: 10, sets: 2, mode: 0, credit: 1, denom: 1, seed: 42, bankrollStart: 1000, bankrollWalk: 1300, bankrollMin: 1 };
const first = await runExperiment(params);
const second = await runExperiment(params);
assert.equal(first.averageBet, 10);
assert.deepEqual(first.averageCategories, second.averageCategories);
assert.equal(first.averageHistory.length, 11);
console.log("Browser simulator checks passed");
