/**
 * testFieldShadow.ts
 * WXDi-P15-058-E1（GRANT_FIELD_SHADOW）のヘッドレス検証。
 * 「同じシグニゾーンに【ゲート】があるあなたのシグニは【シャドウ（スペル）】を得る」が
 * own_gate_zones のシグニのみスペル効果の対象から除外されることを確認する。
 *
 * 実行: npx tsx scripts/testFieldShadow.ts
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { getFieldGrantedShadowScopes, evaluateShadowScope } from '../src/utils/keywords';
import type { CardEffect } from '../src/types/effects';
import type { CardData, PlayerState } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const cardMap = new Map<string, CardData>();
const csvFiles = [
  ...Array.from({ length: 10 }, (_, i) => `CardData_Sheet${i + 1}.csv`),
  'CardData_TK.csv',
];
for (const fname of csvFiles) {
  const p = join(root, 'public/data', fname);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) {
    const id = r.CardNum?.trim();
    if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData);
  }
}

// effects を CardData に合成（ランタイムと同じく card.effects を参照可能に）
for (const fname of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const json = JSON.parse(readFileSync(join(root, 'public/data', fname), 'utf-8'));
  for (const [id, effs] of Object.entries(json)) {
    const c = cardMap.get(id);
    if (c) (c as CardData & { effects: CardEffect[] }).effects = effs as CardEffect[];
  }
}

function makeState(signi: (string[] | null)[], ownGate: number[]): PlayerState {
  return {
    deck: [], lrig_deck: [], hand: [], life_cloth: [], trash: [], lrig_trash: [],
    energy: [], coins: 0, own_gate_zones: ownGate,
    field: { lrig: [], signi },
  } as unknown as PlayerState;
}

let failed = 0;
function assert(label: string, cond: boolean) {
  if (!cond) failed++;
  console.log(`${cond ? '✅' : '❌'} ${label}`);
}

// 自場: zone0=P15-058本体(ゲートあり), zone1=別シグニ(ゲートなし), zone2=別シグニ(ゲートあり)
const other = makeState([['WXDi-P15-058'], ['WXDi-P15-059'], ['WXDi-P15-060']], [0, 2]);

// スペルカード（source）をシャドウ判定に使う。適当なスペルを探す。
const spellCard = [...cardMap.values()].find(c => c.Type === 'スペル');
const signiSource = [...cardMap.values()].find(c => c.Type === 'シグニ');
console.log('spell source:', spellCard?.CardNum, spellCard?.Type, '/ signi source:', signiSource?.CardNum, signiSource?.Type);

function protectedFromSpell(cardNum: string, source: CardData | undefined): boolean {
  const scopes = getFieldGrantedShadowScopes(cardNum, other, cardMap);
  return scopes.some(s => evaluateShadowScope(s, source, cardNum, other, cardMap));
}

// ゲートゾーン(0,2)のシグニはスペル効果から保護される
assert('zone0(ゲートあり) はスペルから保護', protectedFromSpell('WXDi-P15-058', spellCard));
assert('zone2(ゲートあり) はスペルから保護', protectedFromSpell('WXDi-P15-060', spellCard));
// ゲートのないゾーン1は保護されない
assert('zone1(ゲートなし) は保護されない', !protectedFromSpell('WXDi-P15-059', spellCard));
// シグニ効果（スペルでない）からは保護されない（シャドウ（スペル）スコープ）
assert('ゲートゾーンでもシグニ効果からは保護されない', !protectedFromSpell('WXDi-P15-058', signiSource));

// ゲートが無い盤面ではどのシグニも保護されない
const noGate = makeState([['WXDi-P15-058'], ['WXDi-P15-059'], null], []);
const scopesNoGate = getFieldGrantedShadowScopes('WXDi-P15-058', noGate, cardMap);
assert('ゲート未設置なら保護スコープ0', scopesNoGate.length === 0);

console.log(failed === 0 ? '\n全テスト通過' : `\n${failed}件失敗`);
process.exit(failed === 0 ? 0 : 1);
