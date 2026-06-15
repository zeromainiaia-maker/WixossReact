// 「：」コスト修正スクリプト
// 実行: node scripts/fixColonCosts.mjs
import { readFileSync, writeFileSync } from 'fs';

const FILES = {
  WX:     'public/data/effects_WX.json',
  WXK:    'public/data/effects_WXK.json',
  WXDi:   'public/data/effects_WXDi.json',
  WX2426: 'public/data/effects_WX24_26.json',
  misc:   'public/data/effects_misc.json',
};

// ファイルをロード
const dbs = {};
for (const [k, path] of Object.entries(FILES)) {
  dbs[k] = JSON.parse(readFileSync(path, 'utf-8'));
}

// effectIdを元にファイルとカード番号を特定して効果を更新するヘルパー
function updateEffect(db, cardNum, effectId, patch) {
  if (!db[cardNum]) { console.warn(`  NOT FOUND: ${cardNum} in db`); return false; }
  const effList = db[cardNum];
  const idx = effList.findIndex(e => e.effectId === effectId);
  if (idx < 0) { console.warn(`  NOT FOUND effectId: ${effectId}`); return false; }
  effList[idx] = { ...effList[idx], ...patch };
  if (patch.cost !== undefined && patch.cost !== null) {
    effList[idx].cost = { ...(effList[idx].cost ?? {}), ...patch.cost };
  }
  console.log(`  Updated: ${effectId}`);
  return true;
}

// ===== Group A: trash_self (16件) =====
console.log('\n=== Group A: trash_self (シグニ) ===');
const trashSelfCards = {
  // effects_WX.json
  WX: [
    ['WX04-072', 'WX04-072-E1'],
    ['WX11-068', 'WX11-068-E1'],
    ['WX11-069', 'WX11-069-E1'],
    ['WX11-071', 'WX11-071-E1'],
    ['WX13-059', 'WX13-059-E1'],
    ['WX13-095', 'WX13-095-E1'],
    ['WX17-062', 'WX17-062-E1'],
    ['WX17-078', 'WX17-078-E1'],
    ['WX17-079', 'WX17-079-E1'],
    ['WX17-080', 'WX17-080-E1'],
    ['WX18-046', 'WX18-046-E1'],
  ],
  WXK: [
    ['WXK09-090', 'WXK09-090-E1'],
    ['WXK09-094', 'WXK09-094-E1'],
  ],
  WXDi: [
    ['WXDi-P04-069', 'WXDi-P04-069-E1'],
    ['WXDi-P07-079', 'WXDi-P07-079-E1'],
  ],
  misc: [
    ['SPDi01-132', 'SPDi01-132-E1'],
  ],
};

for (const [dbKey, pairs] of Object.entries(trashSelfCards)) {
  const db = dbs[dbKey];
  for (const [cardNum, effectId] of pairs) {
    updateEffect(db, cardNum, effectId, { cost: { trash_self: true } });
  }
}

// WXDi-P04-069-E2: 既存のエナコストに trash_self を追加
console.log('\n=== WXDi-P04-069-E2: energy + trash_self ===');
{
  const db = dbs.WXDi;
  const cardNum = 'WXDi-P04-069';
  if (db[cardNum]) {
    const idx = db[cardNum].findIndex(e => e.effectId === 'WXDi-P04-069-E2');
    if (idx >= 0) {
      db[cardNum][idx].cost = { ...(db[cardNum][idx].cost ?? {}), trash_self: true };
      console.log('  Updated: WXDi-P04-069-E2 + trash_self');
    }
  }
}

// ===== Group B: WX25-P3-100 (trash_self + energyTrash) =====
console.log('\n=== Group B: WX25-P3-100 ===');
{
  // WX25-P3-100はeffects_WX24_26.jsonにある
  const db = dbs.WX2426;
  const cardNum = 'WX25-P3-100';
  if (db[cardNum]) {
    const idx = db[cardNum].findIndex(e => e.effectId === 'WX25-P3-100-E1');
    if (idx >= 0) {
      db[cardNum][idx].cost = {
        ...(db[cardNum][idx].cost ?? {}),
        trash_self: true,
        energyTrash: { count: 2, filter: { story: '毒牙' } },
      };
      console.log('  Updated: WX25-P3-100-E1 + trash_self + energyTrash');
    } else {
      console.warn('  NOT FOUND: WX25-P3-100-E1');
    }
  } else {
    console.warn('  NOT FOUND card: WX25-P3-100');
  }
}

// ===== Group C: charmTrash =====
console.log('\n=== Group C: charmTrash ===');

// WX04-021 (ルリグ): E1(チャーム1枚,once_per_turn), E2(チャーム2枚,once_per_turn), E3(チャーム3枚)
{
  const db = dbs.WX;
  const cardNum = 'WX04-021';
  if (db[cardNum]) {
    const e1 = db[cardNum].findIndex(e => e.effectId === 'WX04-021-E1');
    if (e1 >= 0) { db[cardNum][e1].cost = { charmTrash: 1 }; db[cardNum][e1].usageLimit = 'once_per_turn'; console.log('  Updated: WX04-021-E1'); }
    const e2 = db[cardNum].findIndex(e => e.effectId === 'WX04-021-E2');
    if (e2 >= 0) { db[cardNum][e2].cost = { charmTrash: 2 }; db[cardNum][e2].usageLimit = 'once_per_turn'; console.log('  Updated: WX04-021-E2'); }
    const e3 = db[cardNum].findIndex(e => e.effectId === 'WX04-021-E3');
    if (e3 >= 0) { db[cardNum][e3].cost = { charmTrash: 3 }; console.log('  Updated: WX04-021-E3'); }
  }
}

// WXK07-046-E1 (シグニ: チャーム1枚, once_per_turn, ATフェイズ)
{
  const db = dbs.WXK;
  const cardNum = 'WXK07-046';
  if (db[cardNum]) {
    const idx = db[cardNum].findIndex(e => e.effectId === 'WXK07-046-E1');
    if (idx >= 0) {
      db[cardNum][idx].cost = { charmTrash: 1 };
      db[cardNum][idx].usageLimit = 'once_per_turn';
      console.log('  Updated: WXK07-046-E1');
    }
  }
}

// WXK10-082-E1 (シグニ: チャーム1枚以上 - 最小1枚として設定)
// ※ 可変コストのため正確なモデル化は困難。最小値charmTrash:1で暫定対応
{
  const db = dbs.WXK;
  const cardNum = 'WXK10-082';
  if (db[cardNum]) {
    const idx = db[cardNum].findIndex(e => e.effectId === 'WXK10-082-E1');
    if (idx >= 0) {
      db[cardNum][idx].cost = { charmTrash: 1 };
      db[cardNum][idx].usageLimit = 'once_per_turn';
      console.log('  Updated: WXK10-082-E1 (暫定: charmTrash:1, 可変コストは未対応)');
    }
  }
}

// ===== Group D: removeOppVirus =====
console.log('\n=== Group D: removeOppVirus ===');

// WXEX1-24-E1 (ルリグ: ウィルス1つ除去, once_per_turn)
{
  const db = dbs.WX;
  const cardNum = 'WXEX1-24';
  if (db[cardNum]) {
    const idx = db[cardNum].findIndex(e => e.effectId === 'WXEX1-24-E1');
    if (idx >= 0) {
      db[cardNum][idx].cost = { removeOppVirus: 1 };
      db[cardNum][idx].usageLimit = 'once_per_turn';
      console.log('  Updated: WXEX1-24-E1');
    }
  }
}

// WXDi-P07-038-E1 (アシストルリグ: ウィルス1つ除去, once_per_turn)
{
  const db = dbs.WXDi;
  const cardNum = 'WXDi-P07-038';
  if (db[cardNum]) {
    const idx = db[cardNum].findIndex(e => e.effectId === 'WXDi-P07-038-E1');
    if (idx >= 0) {
      db[cardNum][idx].cost = { removeOppVirus: 1 };
      db[cardNum][idx].usageLimit = 'once_per_turn';
      console.log('  Updated: WXDi-P07-038-E1');
    }
  }
}

// ===== 保存 =====
console.log('\n=== Saving files ===');
for (const [k, path] of Object.entries(FILES)) {
  writeFileSync(path, JSON.stringify(dbs[k], null, 2), 'utf-8');
  console.log(`  Saved: ${path}`);
}

console.log('\nDone!');
