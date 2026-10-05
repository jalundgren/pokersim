"use strict";

const CONFIG = {
  maxGamesPerSet: 100000,
  maxTotalGames: 1000000,
  secondsPerGame: 5,
  ladderMin: 1,
  ladderMax: 4,
};

const MODES = {
  0: ["No Ladder", "Bet the same number of credits every hand, regardless of the previous result."],
  1: ["Loss Ladder", "Start at 1 credit, move up after each loss to 4, then reset to 1 after a win."],
  2: ["Win Ladder", "Start at 1 credit, move up after each win to 4, then reset to 1 after a loss."],
  3: ["D'Alembert Ladder", "Start at 1 credit, move up after a loss and down after a win, staying between 1 and 4."],
  4: ["Aggressive Win Ladder", "Start at 1 credit and advance 1 → 2 → 4 after wins, resetting after any loss."],
  5: ["Aggressive Loss Ladder", "Start at 1 credit and advance 1 → 2 → 4 after losses, resetting after any win."],
};

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";
const RANK_VALUE = Object.fromEntries([...RANKS].map((rank, i) => [rank, i + 2]));
const DECK = [...RANKS].flatMap(rank => [...SUITS].map(suit => rank + suit));
const CATEGORY_ORDER = ["royal_flush", "straight_flush", "four_aces", "four_2_3_4", "four_5_k", "full_house", "flush", "straight", "three_kind", "two_pair", "jacks_or_better", "nothing"];
const PAYTABLE = {
  royal_flush: [250, 500, 750, 1000, 4000], straight_flush: [50, 100, 150, 200, 250],
  four_aces: [80, 160, 240, 320, 400], four_2_3_4: [40, 80, 120, 160, 200],
  four_5_k: [25, 50, 75, 100, 125], full_house: [8, 16, 24, 32, 40],
  flush: [5, 10, 15, 20, 25], straight: [4, 8, 12, 16, 20],
  three_kind: [3, 6, 9, 12, 15], two_pair: [2, 4, 6, 8, 10],
  jacks_or_better: [1, 2, 3, 4, 5], nothing: [0, 0, 0, 0, 0],
};
const STRAIGHT_WINDOWS = ["A2345", "23456", "34567", "45678", "56789", "6789T", "789TJ", "89TJQ", "9TJQK", "TJQKA"].map(x => new Set(x));

const $ = id => document.getElementById(id);
const form = $("sim-form");
let cancelRequested = false;
let lastChartHistory = null;

function combinations(items, count) {
  const output = [];
  function build(start, chosen) {
    if (chosen.length === count) { output.push(chosen.slice()); return; }
    for (let i = start; i <= items.length - (count - chosen.length); i++) {
      chosen.push(items[i]); build(i + 1, chosen); chosen.pop();
    }
  }
  build(0, []);
  return output;
}

function countsOf(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

function handCategory(hand) {
  const values = hand.map(card => RANK_VALUE[card[0]]).sort((a, b) => a - b);
  const counts = countsOf(values);
  const groups = Object.values(counts).sort((a, b) => b - a);
  const flush = new Set(hand.map(card => card[1])).size === 1;
  const unique = [...new Set(values)].sort((a, b) => a - b);
  const straight = unique.length === 5 && (unique[4] - unique[0] === 4 || unique.join() === "2,3,4,5,14");
  if (flush && new Set(values).size === 5 && [10, 11, 12, 13, 14].every(v => values.includes(v))) return "royal_flush";
  if (flush && straight) return "straight_flush";
  if (groups[0] === 4) {
    const quad = Number(Object.keys(counts).find(key => counts[key] === 4));
    return quad === 14 ? "four_aces" : [2, 3, 4].includes(quad) ? "four_2_3_4" : "four_5_k";
  }
  if (groups.join() === "3,2") return "full_house";
  if (flush) return "flush";
  if (straight) return "straight";
  if (groups[0] === 3) return "three_kind";
  if (groups[0] === 2 && groups[1] === 2) return "two_pair";
  if (groups[0] === 2 && Object.keys(counts).some(rank => Number(rank) >= 11 && counts[rank] === 2)) return "jacks_or_better";
  return "nothing";
}

function sameSet(a, b) { return a.size === b.size && [...a].every(x => b.has(x)); }
function subset(a, b) { return a.size < b.size && [...a].every(x => b.has(x)); }

function findPattern(hand, ranks, suited = null) {
  const wanted = new Set(ranks);
  for (const indices of combinations([0, 1, 2, 3, 4], wanted.size)) {
    const cards = indices.map(i => hand[i]);
    if (!sameSet(new Set(cards.map(card => card[0])), wanted)) continue;
    const allSuited = new Set(cards.map(card => card[1])).size === 1;
    if (suited === true && !allSuited) continue;
    if (suited === false && allSuited) continue;
    return indices;
  }
  return null;
}

function fourToStraightFlush(hand, noGap) {
  for (const indices of combinations([0, 1, 2, 3, 4], 4)) {
    const cards = indices.map(i => hand[i]);
    if (new Set(cards.map(card => card[1])).size !== 1) continue;
    const ranks = new Set(cards.map(card => card[0]));
    if (!STRAIGHT_WINDOWS.some(window => subset(ranks, window))) continue;
    const values = [...ranks].map(rank => rank === "A" ? 1 : RANK_VALUE[rank]).sort((a, b) => a - b);
    if ((values[3] - values[0] === 3) === noGap) return indices;
  }
  return null;
}

function firstPattern(hand, patterns, suited = null) {
  for (const pattern of patterns) { const found = findPattern(hand, pattern, suited); if (found) return found; }
  return null;
}

function chooseHold(hand, credit = 5) {
  if (hand.length !== 5 || new Set(hand).size !== 5 || !hand.every(card => DECK.includes(card))) throw new Error("Hand must contain five distinct cards.");
  if (credit < 1 || credit > 5) throw new Error("Credit must be between 1 and 5.");
  const category = handCategory(hand);
  const all = [0, 1, 2, 3, 4];
  const counts = countsOf(hand.map(card => card[0]));
  if (["royal_flush", "straight_flush"].includes(category)) return all;
  if (["four_aces", "four_2_3_4", "four_5_k"].includes(category)) {
    const quad = Object.keys(counts).find(rank => counts[rank] === 4); return all.filter(i => hand[i][0] === quad);
  }
  for (const indices of combinations(all, 4)) {
    const cards = indices.map(i => hand[i]);
    if (new Set(cards.map(c => c[1])).size === 1 && subset(new Set(cards.map(c => c[0])), new Set("TJQKA"))) return indices;
  }
  if (category === "full_house") return all;
  if (counts.A === 3) return all.filter(i => hand[i][0] === "A");
  if (category === "flush") return all;
  if (category === "three_kind") { const trip = Object.keys(counts).find(r => counts[r] === 3); return all.filter(i => hand[i][0] === trip); }
  if (category === "straight") return all;
  let found = fourToStraightFlush(hand, true); if (found) return found;
  if (category === "two_pair") return all.filter(i => counts[hand[i][0]] === 2);
  found = fourToStraightFlush(hand, false); if (found) return found;
  const highPair = [..."JQKA"].find(rank => counts[rank] === 2); if (highPair) return all.filter(i => hand[i][0] === highPair);
  for (const indices of combinations(all, 3)) {
    const cards = indices.map(i => hand[i]);
    if (new Set(cards.map(c => c[1])).size === 1 && subset(new Set(cards.map(c => c[0])), new Set("TJQKA"))) return indices;
  }
  for (const suit of SUITS) { const indices = all.filter(i => hand[i][1] === suit); if (indices.length === 4) return indices; }
  found = findPattern(hand, "TJQK"); if (found) return found;
  const lowPair = [...RANKS.slice(0, 9)].find(rank => counts[rank] === 2); if (lowPair) return all.filter(i => hand[i][0] === lowPair);
  const ordered = [
    [["9TJQ", "89TJ"], null], [["9JQ"], true], [["9TJ"], true], [["2345", "3456", "4567", "5678", "6789", "789T"], null],
    [["JQ"], true], [["JQKA"], null], [["8JQ", "9QK", "9JK"], true], [["89J", "8TJ"], true],
    [["JK", "QK"], true], [["JA", "QA", "KA"], true], [["345", "456", "567", "678", "789", "89T"], true],
    [["9JQK", "TJQA", "TJKA", "TQKA"], null],
  ];
  for (const [patterns, suited] of ordered) { found = firstPattern(hand, patterns, suited); if (found) return found; }
  const remaining = [
    [["JQK"], null], [["JQ"], false], [["TJ"], true], [["A23", "A24", "A25", "A34", "A35", "A45", "78J", "79J", "7TJ", "89Q", "8TQ", "9TK"], true],
    [["JK", "QK"], false], [["JA", "QA", "KA"], false], [["A"], null],
    [["234", "235", "245", "346", "356", "457", "467", "568", "578", "679", "689", "78T", "79T"], true],
    [["J"], null], [["TQ"], true], [["Q"], null], [["K"], null], [["TK"], true],
    [["236", "246", "256", "347", "357", "367", "458", "468", "478", "569", "579", "589", "67T", "68T", "69T"], true],
  ];
  for (const [patterns, suited] of remaining) { found = firstPattern(hand, patterns, suited); if (found) return found; }
  return [];
}

function nextCredit(mode, category, credit) {
  if (mode === 0) return credit;
  const won = category !== "nothing";
  if (mode === 1) return won ? 1 : Math.min(credit + 1, 4);
  if (mode === 2) return won ? Math.min(credit + 1, 4) : 1;
  if (mode === 3) return won ? Math.max(credit - 1, 1) : Math.min(credit + 1, 4);
  if (mode === 4) return won ? Math.min(credit * 2, 4) : 1;
  return won ? 1 : Math.min(credit * 2, 4);
}

function makeRng(seed) {
  let state = (Number(seed) >>> 0) || 0x6d2b79f5;
  return () => { state = (state + 0x6D2B79F5) | 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function shuffledDeck(rng) {
  const deck = DECK.slice();
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

function emptyCounts(keys) { return Object.fromEntries(keys.map(key => [key, 0])); }
function yieldFrame() { return new Promise(resolve => setTimeout(resolve, 0)); }

async function runExperiment(params, onProgress = () => {}) {
  validateParams(params);
  const masterRng = makeRng(params.seed);
  const categoryTotals = emptyCounts(CATEGORY_ORDER);
  const creditTotals = emptyCounts([1, 2, 3, 4, 5]);
  const outcomeTotals = {};
  const historyTotals = new Float64Array(params.games + 1);
  let totalGames = 0, totalBet = 0, totalReturned = 0, totalEnding = 0;
  let totalIncreases = 0, totalDecreases = 0, totalResets = 0, totalEndingCredit = 0;
  let operations = 0;

  for (let setIndex = 0; setIndex < params.sets; setIndex++) {
    const setSeed = Math.floor(masterRng() * 4294967296);
    const rng = makeRng(setSeed);
    const categories = emptyCounts(CATEGORY_ORDER);
    const levels = emptyCounts([1, 2, 3, 4, 5]);
    const history = [params.bankrollStart];
    let bankroll = params.bankrollStart, gamesPlayed = 0, setBet = 0, setReturned = 0;
    let ladderCredit = 1, increases = 0, decreases = 0, resets = 0, stopReason = "game count completed";

    for (let game = 0; game < params.games; game++) {
      const gameCredit = params.mode === 0 ? params.credit : ladderCredit;
      const bet = params.denom * gameCredit;
      if (bankroll < bet) { stopReason = `insufficient balance for next ${money(bet)} bet`; break; }
      const deck = shuffledDeck(rng);
      const hand = deck.slice(0, 5);
      const held = chooseHold(hand, gameCredit);
      const finalHand = held.map(i => hand[i]).concat(deck.slice(5, 5 + 5 - held.length));
      const category = handCategory(finalHand);
      const payout = PAYTABLE[category][gameCredit - 1] * params.denom;
      categories[category]++; levels[gameCredit]++; gamesPlayed++; setBet += bet; setReturned += payout;
      bankroll += payout - bet; history.push(bankroll);
      if (params.mode !== 0) {
        const next = nextCredit(params.mode, category, ladderCredit);
        increases += Number(next > ladderCredit); decreases += Number(next < ladderCredit);
        resets += Number([1, 2, 4, 5].includes(params.mode) && next === 1 && ladderCredit !== 1);
        ladderCredit = next;
      }
      if (bankroll >= params.bankrollWalk) { stopReason = "walk-away balance reached"; break; }
      if (bankroll <= params.bankrollMin) { stopReason = "minimum balance reached"; break; }
      if (++operations % 500 === 0) {
        if (cancelRequested) throw new Error("Simulation cancelled.");
        onProgress(setIndex, game + 1); await yieldFrame();
      }
    }

    totalGames += gamesPlayed; totalBet += setBet; totalReturned += setReturned; totalEnding += bankroll;
    totalIncreases += increases; totalDecreases += decreases; totalResets += resets;
    totalEndingCredit += params.mode === 0 ? params.credit : ladderCredit;
    CATEGORY_ORDER.forEach(key => categoryTotals[key] += categories[key]);
    [1, 2, 3, 4, 5].forEach(key => creditTotals[key] += levels[key]);
    outcomeTotals[stopReason] = (outcomeTotals[stopReason] || 0) + 1;
    const ending = history[history.length - 1];
    for (let i = 0; i <= params.games; i++) historyTotals[i] += i < history.length ? history[i] : ending;
    onProgress(setIndex + 1, 0); await yieldFrame();
  }

  const divisor = params.sets;
  return {
    ...params,
    averageGames: totalGames / divisor, averageBet: totalBet / divisor,
    averageReturned: totalReturned / divisor, averageNet: (totalReturned - totalBet) / divisor,
    averageEnding: totalEnding / divisor,
    averageCategories: Object.fromEntries(CATEGORY_ORDER.map(key => [key, categoryTotals[key] / divisor])),
    averageCredits: Object.fromEntries([1, 2, 3, 4, 5].map(key => [key, creditTotals[key] / divisor])),
    averageHistory: Array.from(historyTotals, value => value / divisor), outcomes: outcomeTotals,
    averageIncreases: totalIncreases / divisor, averageDecreases: totalDecreases / divisor,
    averageResets: totalResets / divisor, averageEndingCredit: totalEndingCredit / divisor,
    averageWins: (totalGames - categoryTotals.nothing) / divisor,
  };
}

function validateParams(p) {
  const integers = [[p.games, "Games per set"], [p.sets, "Number of sets"], [p.credit, "Credits"]];
  for (const [value, label] of integers) if (!Number.isInteger(value)) throw new Error(`${label} must be a whole number.`);
  if (p.games < 1) throw new Error("Games per set must be at least 1.");
  if (p.games > CONFIG.maxGamesPerSet) throw new Error(`Games per set cannot exceed ${CONFIG.maxGamesPerSet.toLocaleString()}.`);
  if (p.sets < 1) throw new Error("Number of sets must be at least 1.");
  if (p.games * p.sets > CONFIG.maxTotalGames) throw new Error(`Games × sets cannot exceed ${CONFIG.maxTotalGames.toLocaleString()} total hands.`);
  if (p.credit < 1 || p.credit > 5) throw new Error("Credits must be between 1 and 5.");
  if (!(p.denom > 0)) throw new Error("Denomination must be greater than zero.");
  if (!(p.bankrollStart > 0)) throw new Error("Starting bankroll must be greater than zero.");
  if (!(p.bankrollMin >= 0 && p.bankrollMin < p.bankrollStart)) throw new Error("Minimum bankroll must be between zero and the starting bankroll.");
  if (!(p.bankrollWalk > p.bankrollStart)) throw new Error("Walk-away bankroll must exceed the starting bankroll.");
}

function readParams(overrides = {}) {
  const seedText = overrides.seed ?? $("seed").value.trim();
  let seed;
  if (seedText === "" || seedText == null) { const values = new Uint32Array(1); crypto.getRandomValues(values); seed = values[0]; }
  else if (/^\d+$/.test(String(seedText))) seed = Number(BigInt(seedText) & 0xffffffffn);
  else throw new Error("Seed must be a non-negative whole number.");
  return {
    games: Number(overrides.games ?? $("games").value), sets: Number(overrides.sets ?? $("sets").value),
    mode: Number(overrides.mode ?? $("mode").value), credit: Number(overrides.credit ?? $("credit").value),
    denom: Number(overrides.denom ?? $("denom").value), seed,
    bankrollStart: Number(overrides.bankrollStart ?? $("bankroll-start").value),
    bankrollWalk: Number(overrides.bankrollWalk ?? $("bankroll-walk").value),
    bankrollMin: Number(overrides.bankrollMin ?? $("bankroll-min").value),
  };
}

function money(value) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }
function number(value, digits = 2) { return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
function percent(value, digits = 3) { return `${(value * 100).toFixed(digits)}%`; }
function titleCategory(key) { return key.split("_").map(word => word[0].toUpperCase() + word.slice(1)).join(" "); }

function renderTable(target, rows) {
  target.innerHTML = rows.map(([label, value, rate]) => `<div class="data-row"><span>${label}</span><span>${value}</span><span>${rate}</span></div>`).join("");
}

function renderResults(r) {
  $("results").hidden = false;
  $("result-context").textContent = `${r.sets.toLocaleString()} ${r.sets === 1 ? "set" : "sets"} · seed ${r.seed}`;
  const netClass = r.averageNet >= 0 ? "positive" : "negative";
  const stats = [
    ["Avg. games", number(r.averageGames)], ["Avg. ending", money(r.averageEnding)],
    ["Avg. total bet", money(r.averageBet)], ["Avg. returned", money(r.averageReturned)],
    ["Avg. net", `${r.averageNet >= 0 ? "+" : "−"}${money(Math.abs(r.averageNet))}`, netClass],
    ["Return", percent(r.averageReturned / r.averageBet)],
  ];
  $("stat-grid").innerHTML = stats.map(([label, value, cls = ""]) => `<div class="stat ${cls}"><span>${label}</span><strong>${value}</strong></div>`).join("");
  $("chart-title").textContent = r.sets === 1 ? "Bankroll by hand" : `Average bankroll across ${r.sets.toLocaleString()} sets`;
  $("chart-legend").innerHTML = `<span></span>${r.sets === 1 ? "Balance" : "Average balance"}`;
  renderTable($("credit-table"), [1, 2, 3, 4, 5].map(level => [`Level ${level}`, number(r.averageCredits[level]), percent(r.averageCredits[level] / r.averageGames, 4)]));
  renderTable($("category-table"), CATEGORY_ORDER.map(key => [titleCategory(key), number(r.averageCategories[key]), percent(r.averageCategories[key] / r.averageGames, 4)]));
  renderTable($("outcome-table"), Object.entries(r.outcomes).map(([key, count]) => [key, count.toLocaleString(), percent(count / r.sets, 2)]));
  $("report-output").textContent = textReport(r);
  lastChartHistory = r.averageHistory; drawChart(lastChartHistory);
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

function textReport(r) {
  const lines = [
    `Sets:              ${r.sets.toLocaleString()}`, `Games per set:      up to ${r.games.toLocaleString()}`,
    `Avg games played: ${number(r.averageGames)}`, `RNG seed:           ${r.seed}`,
    `Betting mode:      ${r.mode} - ${MODES[r.mode][0]}`, `Denomination:       ${money(r.denom)}`,
  ];
  if (r.mode === 0) lines.push(`Credit per game:    ${r.credit}`, `Bet per game:       ${money(r.denom * r.credit)}`);
  lines.push(`Avg total bet:      ${money(r.averageBet)}`, `Avg total returned: ${money(r.averageReturned)}`,
    `Avg net:            ${money(r.averageNet)}`, `Return:             ${percent(r.averageReturned / r.averageBet)}`,
    `Avg winning hands: ${number(r.averageWins)} (${percent(r.averageWins / r.averageGames, 4)})`, "", "Bankroll:",
    `  Starting balance: ${money(r.bankrollStart)}`, `  Ending balance:   ${money(r.averageEnding)}`, "", "Set outcomes:");
  Object.entries(r.outcomes).forEach(([reason, count]) => lines.push(`  ${reason}: ${count} (${percent(count / r.sets, 2)})`));
  lines.push("", "Average credit levels:");
  [1, 2, 3, 4, 5].forEach(level => lines.push(`  Level ${level}: ${number(r.averageCredits[level])} (${percent(r.averageCredits[level] / r.averageGames, 4)})`));
  if (r.mode !== 0) lines.push(`  Credit increases: ${number(r.averageIncreases)}`, `  Credit decreases: ${number(r.averageDecreases)}`, `  Resets to level 1: ${number(r.averageResets)}`, `  Ending level: ${number(r.averageEndingCredit)}`);
  lines.push("", "Average results:");
  CATEGORY_ORDER.forEach(key => lines.push(`  ${titleCategory(key).padEnd(18)} ${number(r.averageCategories[key]).padStart(10)}  ${percent(r.averageCategories[key] / r.averageGames, 4).padStart(10)}`));
  return lines.join("\n");
}

function drawChart(history) {
  if (!history?.length) return;
  const canvas = $("bankroll-chart"), rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height, pad = { left: 72, right: 18, top: 18, bottom: 40 };
  const plotW = w - pad.left - pad.right, plotH = h - pad.top - pad.bottom;
  let low = Infinity, high = -Infinity;
  for (const value of history) { if (value < low) low = value; if (value > high) high = value; }
  if (high === low) { high += 1; low -= 1; }
  ctx.font = "12px Inter, system-ui"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + plotH * i / 4, value = high - (high - low) * i / 4;
    ctx.strokeStyle = "#1e373d"; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    ctx.fillStyle = "#81918f"; ctx.textAlign = "right"; ctx.fillText(money(value), pad.left - 10, y + 4);
  }
  ctx.textAlign = "center"; ctx.fillStyle = "#81918f"; ctx.fillText("Hand 0", pad.left, h - 12); ctx.fillText(`Hand ${(history.length - 1).toLocaleString()}`, w - pad.right, h - 12);
  const maxPoints = Math.max(200, Math.floor(plotW * 2)), step = Math.max(1, Math.ceil(history.length / maxPoints));
  const points = []; for (let i = 0; i < history.length; i += step) points.push([i, history[i]]); if (points.at(-1)[0] !== history.length - 1) points.push([history.length - 1, history.at(-1)]);
  const xy = ([i, value]) => [pad.left + i / (history.length - 1 || 1) * plotW, pad.top + (high - value) / (high - low) * plotH];
  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH); gradient.addColorStop(0, "#efc56b55"); gradient.addColorStop(1, "#efc56b00");
  ctx.beginPath(); points.forEach((point, i) => { const [x, y] = xy(point); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.lineTo(w - pad.right, pad.top + plotH); ctx.lineTo(pad.left, pad.top + plotH); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath(); points.forEach((point, i) => { const [x, y] = xy(point); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.strokeStyle = "#efc56b"; ctx.lineWidth = 2.25; ctx.lineJoin = "round"; ctx.stroke();
}

async function executeSimulation(params) {
  cancelRequested = false; $("error").hidden = true; $("run-button").disabled = true; $("cancel-button").hidden = false;
  try {
    const result = await runExperiment(params, (set, hand) => { $("progress").textContent = `Set ${Math.min(set + (hand ? 1 : 0), params.sets).toLocaleString()} of ${params.sets.toLocaleString()}${hand ? ` · hand ${hand.toLocaleString()}` : ""}`; });
    renderResults(result); $("progress").textContent = "Complete"; return result;
  } catch (error) {
    $("error").textContent = error.message || String(error); $("error").hidden = false; $("progress").textContent = ""; throw error;
  } finally { $("run-button").disabled = false; $("cancel-button").hidden = true; }
}

form.addEventListener("submit", async event => { event.preventDefault(); try { await executeSimulation(readParams()); } catch (_) {} });
$("cancel-button").addEventListener("click", () => { cancelRequested = true; $("progress").textContent = "Cancelling…"; });
$("mode").addEventListener("change", updateModeCard);
["bankroll-start", "bankroll-walk"].forEach(id => $(id).addEventListener("input", updateModeCard));
window.addEventListener("resize", () => { if (lastChartHistory) drawChart(lastChartHistory); });

function updateModeCard() {
  const mode = Number($("mode").value); $("mode-title").textContent = MODES[mode][0]; $("mode-description").textContent = MODES[mode][1];
  $("credit").disabled = mode !== 0; $("credit-note").textContent = mode === 0 ? "Used only in No Ladder mode." : "This ladder controls the credit level.";
  const start = Number($("bankroll-start").value || 0), walk = Number($("bankroll-walk").value || 0); $("bankroll-rule").textContent = `${money(start)} → ${money(walk)}`;
}

function registerWebMcp() {
  const context = document.modelContext; if (!context?.registerTool) return;
  try {
    context.registerTool({
      name: "run_bonus_poker_simulation", title: "Run Bonus Poker simulation",
      description: "Configure and run the visible 8/5 Bonus Poker simulation, then display its report and bankroll chart.",
      inputSchema: { type: "object", properties: {
        games: { type: "integer", minimum: 1, maximum: 100000 }, sets: { type: "integer", minimum: 1 },
        mode: { type: "integer", minimum: 0, maximum: 5 }, credit: { type: "integer", minimum: 1, maximum: 5 },
        denom: { type: "number", exclusiveMinimum: 0 }, seed: { type: "integer", minimum: 0 },
        bankrollStart: { type: "number", exclusiveMinimum: 0 }, bankrollWalk: { type: "number", exclusiveMinimum: 0 }, bankrollMin: { type: "number", minimum: 0 },
      }, required: ["games", "sets", "mode", "credit", "denom", "bankrollStart", "bankrollWalk", "bankrollMin"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const params = readParams(input); Object.entries(input).forEach(([key, value]) => {
          const ids = { bankrollStart: "bankroll-start", bankrollWalk: "bankroll-walk", bankrollMin: "bankroll-min" };
          const node = $(ids[key] || key); if (node) node.value = value;
        }); updateModeCard(); const result = await executeSimulation(params);
        return { sets: result.sets, averageGames: result.averageGames, averageEndingBankroll: result.averageEnding, averageNet: result.averageNet, returnPercent: result.averageReturned / result.averageBet * 100 };
      },
    });
  } catch (error) { console.warn("WebMCP registration unavailable", error); }
}

updateModeCard(); registerWebMcp();
