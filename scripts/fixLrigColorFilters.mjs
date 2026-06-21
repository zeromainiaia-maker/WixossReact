/**
 * センタールリグの色を参照するカードのフィルタを修正するスクリプト
 *
 * colorMatchesLrig: true  → 自分のセンタールリグと共通色を持つ
 * colorNotMatchesLrig: true → 自分のセンタールリグと共通色を持たない
 */

import fs from 'fs';

// --- 設定 ---
// カード番号 → {effectId, path[]} のマッピング
// path は JSON の中のフィルタへのパス（配列インデックスや 'steps','choices' など）
// 修正タイプ:
//   'matchesLrig'    → colorMatchesLrig: true を追加
//   'notMatchesLrig' → colorNotMatchesLrig: true を追加

const FIXES = [
  // ── effects_WX.json ──────────────────────────────────────────────────────
  // WX04-026-E1: TRANSFER_TO_HAND > TRASH_CARD.filter
  { file: 'effects_WX', card: 'WX04-026', eid: 'WX04-026-E1', type: 'matchesLrig',
    locate: e => e.action?.source?.filter },

  // WX06-015-E1: TRANSFER_TO_HAND > TRASH_CARD.filter (スペル)
  { file: 'effects_WX', card: 'WX06-015', eid: 'WX06-015-E1', type: 'matchesLrig',
    locate: e => e.action?.source?.filter },

  // WX15-029-E1: SEQUENCE.steps[0] = TRANSFER_TO_HAND > TRASH_CARD.filter
  { file: 'effects_WX', card: 'WX15-029', eid: 'WX15-029-E1', type: 'matchesLrig',
    locate: e => e.action?.steps?.[0]?.source?.filter },

  // WX17-Re14-E1: CHOOSE.choices[1].action.steps[1].source.filter
  { file: 'effects_WX', card: 'WX17-Re14', eid: 'WX17-Re14-E1', type: 'matchesLrig',
    locate: e => e.action?.choices?.[1]?.action?.steps?.[1]?.source?.filter },

  // WX19-004-E1: SEQUENCE.steps[1].choices[1].action.source.filter (ADD_TO_FIELD)
  { file: 'effects_WX', card: 'WX19-004', eid: 'WX19-004-E1', type: 'matchesLrig',
    locate: e => e.action?.steps?.[1]?.choices?.[1]?.action?.source?.filter },

  // WX20-020-E1: SEQUENCE.steps[0].choices[3].action.source.filter (ADD_TO_FIELD)
  { file: 'effects_WX', card: 'WX20-020', eid: 'WX20-020-E1', type: 'matchesLrig',
    locate: e => e.action?.steps?.[0]?.choices?.[3]?.action?.source?.filter },

  // WX20-047-CB-E1: TRANSFER_TO_HAND > TRASH_CARD.filter
  { file: 'effects_WX', card: 'WX20-047-CB', eid: 'WX20-047-CB-E1', type: 'matchesLrig',
    locate: e => e.action?.source?.filter },

  // WX21-035-E1: SEQUENCE.steps[2].choices[0].action.target
  // "相手エナゾーンのセンタールリグと共通色を持たないカード1枚をトラッシュ"
  { file: 'effects_WX', card: 'WX21-035', eid: 'WX21-035-E1', type: 'notMatchesLrig',
    locate: e => e.action?.steps?.[2]?.choices?.[0]?.action?.target },

  // ── effects_WXK.json ─────────────────────────────────────────────────────
  // WXK02-029-E1: CHOOSE.choices[1].action.steps[0].source.filter
  { file: 'effects_WXK', card: 'WXK02-029', eid: 'WXK02-029-E1', type: 'matchesLrig',
    locate: e => e.action?.choices?.[1]?.action?.steps?.[0]?.source?.filter },

  // ── effects_misc.json ────────────────────────────────────────────────────
  // WDK01-010-E1: SEQUENCE.steps[0].source.filter (up to 3 signi)
  { file: 'effects_misc', card: 'WDK01-010', eid: 'WDK01-010-E1', type: 'matchesLrig',
    locate: e => e.action?.steps?.[0]?.source?.filter },

  // WDK06-C09-E2: TRANSFER_TO_HAND > TRASH_CARD.filter
  { file: 'effects_misc', card: 'WDK06-C09', eid: 'WDK06-C09-E2', type: 'matchesLrig',
    locate: e => e.action?.source?.filter },

  // WDK13-009-E1: SEARCH.filter
  { file: 'effects_misc', card: 'WDK13-009', eid: 'WDK13-009-E1', type: 'matchesLrig',
    locate: e => e.action },

  // SP27-016-E1: CHOOSE.choices[0].action.filter (SEARCH, empty filter)
  { file: 'effects_misc', card: 'SP27-016', eid: 'SP27-016-E1', type: 'matchesLrig',
    locate: e => e.action?.choices?.[0]?.action },

  // PR-457-E2: SEARCH.filter
  { file: 'effects_misc', card: 'PR-457', eid: 'PR-457-E2', type: 'matchesLrig',
    locate: e => e.action },

  // PR-K064-E1: CHOOSE.choices[0].action.filter (SEARCH)
  { file: 'effects_misc', card: 'PR-K064', eid: 'PR-K064-E1', type: 'matchesLrig',
    locate: e => e.action?.choices?.[0]?.action },
];

const DIR = 'public/data';

function applyFix(obj, type) {
  if (!obj) return false;
  // SEARCH / ADD_TO_FIELD actions: filter is action-level property
  if (obj.type === 'SEARCH' || obj.type === 'ADD_TO_FIELD') {
    if (!obj.filter) obj.filter = {};
    if (type === 'matchesLrig') obj.filter.colorMatchesLrig = true;
    else obj.filter.colorNotMatchesLrig = true;
    return true;
  }
  // ENERGY_CARD / SIGNI target (TRASH target for WX21-035)
  if (obj.type === 'ENERGY_CARD' || obj.type === 'SIGNI') {
    if (!obj.filter) obj.filter = {};
    if (type === 'matchesLrig') obj.filter.colorMatchesLrig = true;
    else obj.filter.colorNotMatchesLrig = true;
    return true;
  }
  // Otherwise obj IS the filter
  if (type === 'matchesLrig') obj.colorMatchesLrig = true;
  else obj.colorNotMatchesLrig = true;
  return true;
}

let totalFixed = 0;

for (const fix of FIXES) {
  const path = `${DIR}/${fix.file}.json`;
  const db = JSON.parse(fs.readFileSync(path, 'utf-8'));
  const effects = db[fix.card];
  if (!effects) { console.warn(`[SKIP] ${fix.card} not in ${fix.file}`); continue; }
  const effect = effects.find(e => e.effectId === fix.eid);
  if (!effect) { console.warn(`[SKIP] ${fix.eid} not found in ${fix.card}`); continue; }
  const target = fix.locate(effect);
  if (!target) { console.warn(`[SKIP] locate() returned null for ${fix.eid}`); continue; }
  const ok = applyFix(target, fix.type);
  if (ok) {
    console.log(`[FIX] ${fix.eid} → ${fix.type}`);
    totalFixed++;
  }
  fs.writeFileSync(path, JSON.stringify(db), 'utf-8');
}

console.log(`\n合計 ${totalFixed} 件修正完了`);
