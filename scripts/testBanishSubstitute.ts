/**
 * testBanishSubstitute.ts
 * F-3 BANISH_SUBSTITUTE collectBanishSubstitutes のヘッドレス検証（純関数部分）。
 * 実行: npx tsx scripts/testBanishSubstitute.ts
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { collectBanishSubstitutes } from '../src/engine/effectEngine';
import type { CardEffect } from '../src/types/effects';
import type { CardData, PlayerState } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const cardMap = new Map<string, CardData>();
for (const fname of [...Array.from({ length: 10 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', fname);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const effectsMap = new Map<string, CardEffect[]>();
for (const fname of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const json = JSON.parse(readFileSync(join(root, 'public/data', fname), 'utf-8'));
  for (const [id, effs] of Object.entries(json)) effectsMap.set(id, effs as CardEffect[]);
}

function makeState(signi: (string[] | null)[]): PlayerState {
  return { deck: [], lrig_deck: [], hand: [], life_cloth: [], trash: [], lrig_trash: [], energy: [], coins: 0,
    field: { lrig: [], signi } } as unknown as PlayerState;
}
const op = makeState([null, null, null]);

let failed = 0;
function assert(label: string, cond: boolean) { if (!cond) failed++; console.log(`${cond ? '✅' : '❌'} ${label}`); }

// 1) WX12-024（自己保護＝他の電機を犠牲）: victim=WX12-024、他電機=WD03-009/WD03-010、非電機=WD01-009
{
  const st = makeState([['WX12-024'], ['WD03-009'], ['WD01-009']]);
  const subs = collectBanishSubstitutes(st, op, false, cardMap, effectsMap, 'WX12-024');
  assert('WX12-024: 身代わり1件', subs.length === 1);
  assert('WX12-024: self_sacrifice_other', subs[0]?.pattern === 'self_sacrifice_other');
  assert('WX12-024: 犠牲候補=電機のみ(WD03-009)', JSON.stringify(subs[0]?.sacrificeCandidates) === JSON.stringify(['WD03-009']));
  // victim が別シグニ（自己保護なので発火しない）
  assert('WX12-024: victimが別カードなら0件', collectBanishSubstitutes(st, op, false, cardMap, effectsMap, 'WD03-009').length === 0);
  // 他電機がいない場合は候補0→0件
  const st2 = makeState([['WX12-024'], ['WD01-009'], null]);
  assert('WX12-024: 他電機なしなら0件', collectBanishSubstitutes(st2, op, false, cardMap, effectsMap, 'WX12-024').length === 0);
}

// 2) WXEX2-60（自己保護＝他のウェポンを犠牲）
{
  const st = makeState([['WXEX2-60'], ['WX01-039'], null]);
  const subs = collectBanishSubstitutes(st, op, false, cardMap, effectsMap, 'WXEX2-60');
  assert('WXEX2-60: ウェポン犠牲候補(WX01-039)', subs.length === 1 && subs[0].sacrificeCandidates[0] === 'WX01-039');
}

// 3) WX20-055（味方保護＝ライズシグニを守り自身を犠牲）: ライズ=WX15-032
{
  const st = makeState([['WX15-032'], ['WX20-055'], null]);
  const subsRise = collectBanishSubstitutes(st, op, false, cardMap, effectsMap, 'WX15-032');
  assert('WX20-055: ライズvictimで身代わり1件', subsRise.length === 1);
  assert('WX20-055: 犠牲=自身(WX20-055)', subsRise[0]?.sacrificeCandidates[0] === 'WX20-055');
  // 非ライズ victim は対象外
  const st2 = makeState([['WD01-009'], ['WX20-055'], null]);
  assert('WX20-055: 非ライズvictimは0件', collectBanishSubstitutes(st2, op, false, cardMap, effectsMap, 'WD01-009').length === 0);
}

// 4) WXDi-CP01-032（味方保護＝任意の他シグニ・相手ターン限定）
{
  const st = makeState([['WXDi-CP01-032'], ['WD01-009'], null]);
  // 相手ターン中（isOwnerTurn=false）→ 発火
  assert('CP01-032: 相手ターンで他シグニvictim=身代わり1件', collectBanishSubstitutes(st, op, false, cardMap, effectsMap, 'WD01-009').length === 1);
  // 自分ターン中（isOwnerTurn=true）→ oppTurnOnly で0件
  assert('CP01-032: 自分ターンは0件', collectBanishSubstitutes(st, op, true, cardMap, effectsMap, 'WD01-009').length === 0);
  // victim が自身（source）なら0件
  assert('CP01-032: victim=自身は0件', collectBanishSubstitutes(st, op, false, cardMap, effectsMap, 'WXDi-CP01-032').length === 0);
}

console.log(failed === 0 ? '\n全テスト通過' : `\n${failed}件失敗`);
process.exit(failed === 0 ? 0 : 1);
