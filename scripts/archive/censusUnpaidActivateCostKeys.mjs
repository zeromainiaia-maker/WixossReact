// 【起】のコストキーごとに「UI の実行経路（perform*）がそのキーを読んでいるか」を全数で出す。
// 🔴正規表現は使わない＝`\b` のエスケープが1段剥がれて**黙って何にも当たらない**規則になる
//   （CLAUDE.md の `census:deadstate` の罠と同型。実際この回も1度踏んだ）。文字列の包含だけで見る。
import fs from 'fs';

const eff = {};
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'])
  Object.assign(eff, JSON.parse(fs.readFileSync('public/data/' + f, 'utf8')));

const cards = new Map();
for (let i = 1; i <= 11; i++) {
  const p = `public/data/CardData_Sheet${i}.csv`;
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const head = lines[0].split(',');
  const iNum = head.indexOf('CardNum'), iType = head.indexOf('Type');
  for (const l of lines.slice(1)) { const c = l.split(','); if (c[iNum] && !cards.has(c[iNum])) cards.set(c[iNum], c[iType]); }
}

const CTX = { signi: new Map(), lrig: new Map() };
for (const [num, effs] of Object.entries(eff)) {
  const t = cards.get(num);
  const ctx = (t === 'シグニ' || t === 'レゾナ') ? 'signi' : t === 'ルリグ' ? 'lrig' : null;
  if (!ctx) continue;
  for (const e of effs) {
    if (e.effectType !== 'ACTIVATED' || !e.cost) continue;
    // 場のシグニ【起】として提示されないもの（入口がトラッシュ・手札・エナ）は分母から外す
    if (ctx === 'signi' && (e.trashActivated || e.energyActivated || e.handActivated || e.cost.discardSelfFromHand !== undefined)) continue;
    if (e.costUnparsed) continue;
    for (const k of Object.keys(e.cost)) {
      if (e.cost[k] === undefined) continue;
      const m = CTX[ctx].get(k) ?? { eff: 0, cards: new Set() };
      m.eff++; m.cards.add(num); CTX[ctx].set(k, m);
    }
  }
}

const files = [];
const walk = (d) => {
  for (const n of fs.readdirSync(d, { withFileTypes: true })) {
    const q = d + '/' + n.name;
    if (n.isDirectory()) walk(q);
    else if (n.name.endsWith('.ts') || n.name.endsWith('.tsx')) files.push([q, fs.readFileSync(q, 'utf8')]);
  }
};
walk('src/screens/battle');

// 「そのキーを読んでいる」＝`cost.<key>` か `cost?.<key>` が出るファイル（直後が識別子文字なら別キー）
const tail = (t, at, key) => {
  const c = t[at + key.length];
  return !(c && /[A-Za-z0-9_]/.test(c));
};
const readers = (key) => files.filter(([, t]) => {
  for (const pre of ['cost.', 'cost?.']) {
    let i = t.indexOf(pre + key);
    while (i >= 0) { if (tail(t, i + pre.length, key)) return true; i = t.indexOf(pre + key, i + 1); }
  }
  return false;
}).map(([q]) => q.replace('src/screens/battle/', ''));

for (const ctx of ['signi', 'lrig']) {
  const perform = ctx === 'signi'
    ? 'controller/performSigniActivated.ts' : 'controller/performLrigActivated.ts';
  console.log(`\n=== ${ctx}（実行経路 ${perform}）===`);
  let paid = 0, unpaid = 0;
  for (const [k, v] of [...CTX[ctx].entries()].sort((a, b) => b[1].eff - a[1].eff)) {
    const rs = readers(k);
    const inPerform = rs.includes(perform);
    const mark = inPerform ? '  ' : (rs.length > 0 ? '⚠ ' : '🔴');
    if (inPerform) paid += v.eff; else unpaid += v.eff;
    console.log(`${mark} ${k.padEnd(24)} 効果 ${String(v.eff).padStart(3)} / カード ${String(v.cards.size).padStart(3)}  読む場所: ${rs.slice(0, 3).join(' , ') || '(どこにも無い)'}  例: ${[...v.cards].slice(0, 2).join(',')}`);
  }
  console.log(`  → 実行経路が読むキーの効果 ${paid} / 読まないキーの効果 ${unpaid}`);
}
