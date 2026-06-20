/**
 * testBanishSubstitute.ts
 * F-3 BANISH_SUBSTITUTE collectBanishSubstitutes のヘッドレス検証（純関数部分）。
 *   - 犠牲型（STUB）: WX12-024 / WXEX2-60 / WX20-055 / WXDi-CP01-032
 *   - コスト払い型（action.type BANISH_SUBSTITUTE）: WX10-033(手札スペル捨て) / WX11-029(下スペルトラッシュ)
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

function makeState(signi: (string[] | null)[], hand: string[] = []): PlayerState {
  return { deck: [], lrig_deck: [], hand, life_cloth: [], trash: [], lrig_trash: [], energy: [], coins: 0,
    field: { lrig: [], signi } } as unknown as PlayerState;
}
const op = makeState([null, null, null]);
const SPELL = 'WD01-015';

let failed = 0;
function assert(label: string, cond: boolean) { if (!cond) failed++; console.log(`${cond ? '✅' : '❌'} ${label}`); }
const sac = (opts: ReturnType<typeof collectBanishSubstitutes>) => opts.filter(o => o.kind === 'sacrifice') as Array<{ kind: 'sacrifice'; sacrificeNum: string }>;
const pay = (opts: ReturnType<typeof collectBanishSubstitutes>) => opts.filter(o => o.kind === 'pay_cost') as Array<{ kind: 'pay_cost'; costType: string; amount: number }>;

// ── 犠牲型 ──
{
  const st = makeState([['WX12-024'], ['WD03-009'], ['WD01-009']]);
  const o = collectBanishSubstitutes(st, op, false, cardMap, effectsMap, 'WX12-024');
  assert('WX12-024: 犠牲オプション=電機のみ1件', sac(o).length === 1 && sac(o)[0].sacrificeNum === 'WD03-009');
}
{
  const st = makeState([['WX15-032'], ['WX20-055'], null]);
  assert('WX20-055: ライズvictimで自己犠牲1件', sac(collectBanishSubstitutes(st, op, false, cardMap, effectsMap, 'WX15-032')).length === 1);
  const st2 = makeState([['WD01-009'], ['WX20-055'], null]);
  assert('WX20-055: 非ライズvictimは0件', collectBanishSubstitutes(st2, op, false, cardMap, effectsMap, 'WD01-009').length === 0);
}
{
  const st = makeState([['WXDi-CP01-032'], ['WD01-009'], null]);
  assert('CP01-032: 相手ターンで他シグニ守る1件', collectBanishSubstitutes(st, op, false, cardMap, effectsMap, 'WD01-009').length === 1);
  assert('CP01-032: 自分ターンは0件', collectBanishSubstitutes(st, op, true, cardMap, effectsMap, 'WD01-009').length === 0);
}

// ── コスト払い型: WX10-033（手札からスペル1枚捨て・自身限定 thisCardOnly）──
{
  const stWithSpell = makeState([['WX10-033'], null, null], [SPELL]);
  const o = collectBanishSubstitutes(stWithSpell, op, false, cardMap, effectsMap, 'WX10-033');
  assert('WX10-033: 手札スペルありでpay_cost(discardSpell:1)', pay(o).length === 1 && pay(o)[0].costType === 'discardSpell' && pay(o)[0].amount === 1);
  const stNoSpell = makeState([['WX10-033'], null, null], []);
  assert('WX10-033: 手札スペルなしで0件', collectBanishSubstitutes(stNoSpell, op, false, cardMap, effectsMap, 'WX10-033').length === 0);
  // thisCardOnly: victim が別シグニなら対象外
  const stOther = makeState([['WX10-033'], ['WD01-009'], null], [SPELL]);
  assert('WX10-033: 別シグニvictimは0件（thisCardOnly）', collectBanishSubstitutes(stOther, op, false, cardMap, effectsMap, 'WD01-009').length === 0);
}

// ── コスト払い型: WX11-029（下からスペル2枚トラッシュ・任意の自シグニ）──
{
  // スタック [SPELL, SPELL, WX11-029] = 下に2枚のスペル
  const st = makeState([[SPELL, SPELL, 'WX11-029'], ['WD01-009'], null]);
  const o1 = collectBanishSubstitutes(st, op, false, cardMap, effectsMap, 'WD01-009'); // 別の味方がvictim
  assert('WX11-029: 任意の味方victimでpay_cost(trashStackSpell:2)', pay(o1).length === 1 && pay(o1)[0].amount === 2);
  // 下スペルが1枚しかない → 0件
  const st2 = makeState([[SPELL, 'WX11-029'], ['WD01-009'], null]);
  assert('WX11-029: 下スペル不足で0件', collectBanishSubstitutes(st2, op, false, cardMap, effectsMap, 'WD01-009').length === 0);
}

console.log(failed === 0 ? '\n全テスト通過' : `\n${failed}件失敗`);
process.exit(failed === 0 ? 0 : 1);
