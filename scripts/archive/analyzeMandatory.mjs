/**
 * analyzeMandatory.mjs
 * checkAllEffects.mjs の MANDATORY_SUSPICIOUS 検出カードを分類する。
 *  - SKIPPABLE: 主要アクションに optional:true / upToCount:true / CHOOSE があり実行時に辞退可能
 *  - NEEDS_FIX: 強制実行されるアクションのみで「してもよい」が表現されていない
 * 各カードの CSV テキストと JSON アクション概要を出力する。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"' && inQ) inQ = false;
    else if (c === '"') inQ = true;
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

function loadCSV(filename) {
  const lines = fs.readFileSync(path.join(root, 'public/data', filename), 'utf8').replace(/^﻿/, '').replace(/\r/g, '').split('\n');
  const h = splitCSVLine(lines[0]);
  const get = (row, col) => row[h.indexOf(col)] || '';
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const row = splitCSVLine(lines[i]);
    const id = get(row, 'CardNum');
    if (!id) continue;
    map[id] = { name: get(row, 'CardName'), eff: get(row, 'EffectText'), burst: get(row, 'BurstText') };
  }
  return map;
}

const FILES = [
  { json: 'effects_misc.json', csvs: ['CardData_Sheet5.csv', 'CardData_Sheet6.csv', 'CardData_Variants.csv'] },
  { json: 'effects_WX.json', csvs: ['CardData_Sheet1.csv', 'CardData_Sheet2.csv'] },
  { json: 'effects_WX24_26.json', csvs: ['CardData_Sheet9.csv', 'CardData_Sheet10.csv'] },
  { json: 'effects_WXDi.json', csvs: ['CardData_Sheet7.csv', 'CardData_Sheet8.csv'] },
  { json: 'effects_WXK.json', csvs: ['CardData_Sheet4.csv'] },
];

function flatActions(a) {
  if (!a) return [];
  if (a.type === 'SEQUENCE') return [a, ...(a.steps || []).flatMap(flatActions)];
  if (a.type === 'CONDITIONAL') return [a, ...flatActions(a.then), ...flatActions(a.else)];
  if (a.type === 'CHOOSE') return [a, ...(a.choices || []).flatMap(c => flatActions(c.action))];
  if (a.type === 'CHOOSE_N_FROM_LIST') return [a, ...(a.choices || []).flatMap(c => flatActions(c.action))];
  return [a];
}

// アクション概要文字列
function actSummary(a) {
  if (!a) return 'null';
  const parts = [a.type];
  if (a.optional) parts.push('opt');
  if (a.target?.upToCount) parts.push('upTo');
  if (a.type === 'SEQUENCE') return `SEQ[${(a.steps || []).map(actSummary).join(' → ')}]`;
  if (a.type === 'CONDITIONAL') return `IF(${a.condition?.type})[${actSummary(a.then)}]ELSE[${actSummary(a.else)}]`;
  if (a.type === 'CHOOSE') return `CHOOSE[${(a.choices || []).map(c => actSummary(c.action)).join(' | ')}]`;
  return parts.join(':');
}

// 効果が実行時に辞退可能かを判定
// CHOOSE はスキップ選択肢があるとは限らないため辞退可能とみなさない
function isSkippable(action) {
  const acts = flatActions(action);
  // STUB は手動解決なので辞退可能扱い
  if (acts.some(a => a.type === 'STUB' || a.type === 'UNKNOWN')) return true;
  // 最初の実行アクション（SEQUENCE/CONDITIONAL以外）が optional/upToCount なら辞退可能
  const real = acts.filter(a => !['SEQUENCE', 'CONDITIONAL'].includes(a.type));
  if (real.length === 0) return true;
  const first = real[0];
  if (first.optional === true) return true;
  if (first.target?.upToCount === true) return true;
  if (first.type === 'OPTIONAL_COST') return true;
  // SEARCH/REVEAL_AND_PICK 系は maxCount で任意（0枚選択可）
  if (['SEARCH'].includes(first.type)) return true;
  return false;
}

const results = { SKIPPABLE: [], NEEDS_FIX: [] };

for (const { json, csvs } of FILES) {
  const csv = {};
  for (const f of csvs) Object.assign(csv, loadCSV(f));
  const effects = JSON.parse(fs.readFileSync(path.join(root, 'public/data', json), 'utf8'));

  for (const [cardId, efList] of Object.entries(effects)) {
    const c = csv[cardId];
    if (!c) continue;
    const eff = c.eff;
    if (!eff) continue;

    // checkAllEffects.mjs と同じ MANDATORY_SUSPICIOUS 検出条件
    const effForOptCheck = eff
      .replace(/（[^）]*）/g, '')
      .replace(/「[^」]*してもよい[^」]*」/g, '');
    if (!/してもよい/.test(effForOptCheck)) continue;

    const allActs = efList.flatMap(ef => flatActions(ef.action));
    if (allActs.some(a => a.type === 'STUB' || a.type === 'UNKNOWN')) continue;

    const nonActivated = efList.filter(ef => ef.effectType !== 'ACTIVATED' && ef.effectType !== 'LIFE_BURST');
    const allMandatory = nonActivated.length > 0 && nonActivated.every(ef => ef.mandatory === true);
    if (!allMandatory) continue;

    // してもよい を含む効果テキストに対応しそうな AUTO/CONTINUOUS 効果を分類
    const skippable = nonActivated.every(ef => isSkippable(ef.action));
    const entry = {
      json, cardId, name: c.name,
      csv: eff,
      effects: nonActivated.map(ef => `${ef.effectType}${ef.timing ? '(' + ef.timing.join(',') + ')' : ''}: ${actSummary(ef.action)}`),
    };
    results[skippable ? 'SKIPPABLE' : 'NEEDS_FIX'].push(entry);
  }
}

for (const [k, list] of Object.entries(results)) {
  console.log(`\n========== ${k} (${list.length}件) ==========`);
  for (const e of list) {
    console.log(`\n[${e.json}] ${e.cardId} ${e.name}`);
    console.log(`  CSV: ${e.csv.substring(0, 160)}`);
    for (const s of e.effects) console.log(`  JSON: ${s}`);
  }
}
console.log(`\n合計: SKIPPABLE=${results.SKIPPABLE.length} NEEDS_FIX=${results.NEEDS_FIX.length}`);
