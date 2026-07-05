/**
 * testLayerGrant.ts
 * 【レイヤー】の GRANT_FIELD_SIGNI_ABILITY 実装のヘッドレス検証。
 *
 * 検証シナリオ:
 *   自分の場: コナキ(怪異 P7000, レイヤー+2000) / カラカサ(怪異 P2000, レイヤー+1000) / オートバイ(乗機 P3000)
 *   期待値:   コナキ 7000+2000+1000=10000 / カラカサ 2000+2000+1000=5000 / オートバイ 3000(変化なし)
 *
 * 実行: npx tsx scripts/testLayerGrant.ts
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { collectGrantedFromLayer, calcFieldPowers } from '../src/engine/effectEngine';
import type { CardEffect } from '../src/types/effects';
import type { CardData, PlayerState } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ─── カードデータ読み込み ───
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

// ─── effects JSON 読み込み ───
const effectsMap = new Map<string, CardEffect[]>();
for (const fname of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const json = JSON.parse(readFileSync(join(root, 'public/data', fname), 'utf-8'));
  for (const [id, effs] of Object.entries(json)) effectsMap.set(id, effs as CardEffect[]);
}

// ─── 最小 PlayerState ───
function makeState(signi: (string[] | null)[]): PlayerState {
  return {
    deck: [], lrig_deck: [], hand: [], life_cloth: [], trash: [], lrig_trash: [],
    energy: [], coins: 0,
    field: { lrig: [], signi },
  } as PlayerState;
}

let failed = 0;
function assertEq(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} ${label}: actual=${actual} expected=${expected}`);
}

// ═══ シナリオ1: コナキ+カラカサ+オートバイ ═══
console.log('── シナリオ1: レイヤー2枚（コナキ+2000 / カラカサ+1000）+ 非怪異 ──');
{
  const my = makeState([['WX16-049'], ['WX16-052'], ['WXK01-048']]);
  const op = makeState([null, null, null]);

  const grants = collectGrantedFromLayer(my, op, true, effectsMap, cardMap);
  assertEq('コナキへの付与能力数（2ソース×各1）', grants.get('WX16-049')?.length ?? 0, 2);
  assertEq('カラカサへの付与能力数', grants.get('WX16-052')?.length ?? 0, 2);
  assertEq('オートバイ（非怪異）への付与なし', grants.get('WXK01-048')?.length ?? 0, 0);

  // 付与を反映した augmented マップでパワー計算
  const augMap = new Map(effectsMap);
  for (const [num, extra] of grants) augMap.set(num, [...(augMap.get(num) ?? []), ...extra]);
  const powers = calcFieldPowers(my, op, true, augMap, cardMap);
  assertEq('コナキのパワー (7000+3000)', powers.get('WX16-049'), 10000);
  assertEq('カラカサのパワー (2000+3000)', powers.get('WX16-052'), 5000);
  assertEq('オートバイのパワー (3000のまま)', powers.get('WXK01-048'), 3000);
}

// ═══ シナリオ2: レイヤーカードが場を離れたら付与が消える ═══
console.log('── シナリオ2: コナキ不在（カラカサのみ） ──');
{
  const my = makeState([null, ['WX16-052'], ['WXK01-048']]);
  const op = makeState([null, null, null]);
  const grants = collectGrantedFromLayer(my, op, true, effectsMap, cardMap);
  assertEq('カラカサへの付与能力数（自身のみ）', grants.get('WX16-052')?.length ?? 0, 1);

  const augMap = new Map(effectsMap);
  for (const [num, extra] of grants) augMap.set(num, [...(augMap.get(num) ?? []), ...extra]);
  const powers = calcFieldPowers(my, op, true, augMap, cardMap);
  assertEq('カラカサのパワー (2000+1000)', powers.get('WX16-052'), 3000);
}

// ═══ シナリオ3: 相手の怪異シグニには付与されない（「あなたの」限定） ═══
console.log('── シナリオ3: 相手側に怪異がいても付与されない ──');
{
  const my = makeState([['WX16-049'], null, null]);
  const op = makeState([['WX16-052'], null, null]);
  const myGrants = collectGrantedFromLayer(my, op, true, effectsMap, cardMap);
  const opGrants = collectGrantedFromLayer(op, my, false, effectsMap, cardMap);
  assertEq('自分コナキへの付与（自身のみ）', myGrants.get('WX16-049')?.length ?? 0, 1);
  assertEq('自分側マップに相手カラカサは含まれない', myGrants.has('WX16-052'), false);
  assertEq('相手カラカサは相手側ソース（カラカサ自身）のみ', opGrants.get('WX16-052')?.length ?? 0, 1);
}

// ═══ シナリオ4: 付与能力の中身（タマモゼン: シャドウ／ドワフ: 起動） ═══
console.log('── シナリオ4: 非パワー系の付与内容 ──');
{
  const my = makeState([['WX21-022'], ['WX17-051'], null]);
  const op = makeState([null, null, null]);
  const grants = collectGrantedFromLayer(my, op, true, effectsMap, cardMap);
  const tamamoGrants = grants.get('WX21-022') ?? [];
  assertEq('タマモゼンへの付与能力数（2ソース）', tamamoGrants.length, 2);
  const hasShadow = tamamoGrants.some(e => JSON.stringify(e.action).includes('シャドウ'));
  assertEq('シャドウ付与能力が含まれる', hasShadow, true);
  const hasActivated = tamamoGrants.some(e => e.effectType === 'ACTIVATED');
  assertEq('ドワフの【起】能力が含まれる', hasActivated, true);
}

console.log(failed === 0 ? '\n✅ 全テスト成功' : `\n❌ ${failed}件失敗`);
process.exit(failed === 0 ? 0 : 1);
