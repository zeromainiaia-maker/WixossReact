/**
 * testGateContinuous.ts
 * F-4 近似精緻化（v0.400）のヘッドレス検証。
 *   - WXDi-P16-054-E1b: 同ゾーンゲート＋相手ターン中、相手効果でバニッシュされない（GRANT_PROTECTION）
 *   - WXDi-P15-057-E1b: 同ゾーンゲート＋相手ターン中、【シャドウ】を得る（activeCondition 付き GRANT_KEYWORD）
 *
 * 実行: npx tsx scripts/testGateContinuous.ts
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { collectBanishEffectProtectedSigni, checkActiveCondition } from '../src/engine/effectEngine';
import { decodeShadowKeyword, evaluateShadowScope } from '../src/utils/keywords';
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
  for (const [id, effs] of Object.entries(json)) {
    effectsMap.set(id, effs as CardEffect[]);
    const c = cardMap.get(id);
    if (c) (c as CardData & { effects: CardEffect[] }).effects = effs as CardEffect[];
  }
}

function makeState(signi: (string[] | null)[], ownGate: number[]): PlayerState {
  return {
    deck: [], lrig_deck: [], hand: [], life_cloth: [], trash: [], lrig_trash: [],
    energy: [], coins: 0, own_gate_zones: ownGate, actions_done: [],
    field: { lrig: [], signi },
  } as unknown as PlayerState;
}

let failed = 0;
function assert(label: string, cond: boolean) { if (!cond) failed++; console.log(`${cond ? '✅' : '❌'} ${label}`); }

// ── WXDi-P16-054-E1b: 相手効果バニッシュ耐性 ──
// state = P16-054 のコントローラー。isOwnerTurn=false で「相手ターン中」。zone0 にゲート。
{
  const me = makeState([['WXDi-P16-054'], null, null], [0]);
  const op = makeState([null, null, null], []);
  // 相手ターン中（isOwnerTurn=false）＋ゲートあり → 保護される
  const protOppTurn = collectBanishEffectProtectedSigni(me, op, false, effectsMap, cardMap);
  assert('P16-054: 相手ターン中＋ゲートで相手効果バニッシュ耐性', protOppTurn.has('WXDi-P16-054'));
  // 自分ターン中（isOwnerTurn=true）→ 保護されない
  const protMyTurn = collectBanishEffectProtectedSigni(me, op, true, effectsMap, cardMap);
  assert('P16-054: 自分ターン中は耐性なし', !protMyTurn.has('WXDi-P16-054'));
  // ゲートなし → 保護されない
  const meNoGate = makeState([['WXDi-P16-054'], null, null], []);
  const protNoGate = collectBanishEffectProtectedSigni(meNoGate, op, false, effectsMap, cardMap);
  assert('P16-054: ゲートなしは耐性なし', !protNoGate.has('WXDi-P16-054'));
}

// ── WXDi-P15-057-E1b: 相手ターン中シャドウ（activeCondition 付き GRANT_KEYWORD）──
// execUtils の hasCondShadow と同等のロジックで検証。
{
  const me = makeState([['WXDi-P15-057'], null, null], [0]); // P15-057 のコントローラー、zone0 ゲート
  const op = makeState([null, null, null], []);
  const spellCard = [...cardMap.values()].find(c => c.Type === 'スペル');

  function shadowActive(isOwnerTurn: boolean, ownGate: number[]): boolean {
    const st = makeState([['WXDi-P15-057'], null, null], ownGate);
    const card = cardMap.get('WXDi-P15-057');
    return (card?.effects ?? []).some(eff => {
      if (eff.effectType !== 'CONTINUOUS' || !eff.activeCondition) return false;
      if (eff.action.type !== 'GRANT_KEYWORD') return false;
      const scope = decodeShadowKeyword((eff.action as { keyword: string }).keyword);
      if (scope === null) return false;
      // st=シャドウ保持側(otherState相当), op=効果発動側(ownerState相当)
      if (!checkActiveCondition(eff.activeCondition, st, op, isOwnerTurn, cardMap, 'WXDi-P15-057')) return false;
      return evaluateShadowScope(scope, spellCard, 'WXDi-P15-057', st, cardMap);
    });
  }
  void me;
  // 相手ターン中（保持側からみて isOwnerTurn=false）＋ゲート → シャドウ有効
  assert('P15-057: 相手ターン中＋ゲートでシャドウ有効', shadowActive(false, [0]));
  // 自分ターン中 → シャドウ無効
  assert('P15-057: 自分ターン中はシャドウ無効', !shadowActive(true, [0]));
  // ゲートなし → シャドウ無効
  assert('P15-057: ゲートなしはシャドウ無効', !shadowActive(false, []));
}

console.log(failed === 0 ? '\n全テスト通過' : `\n${failed}件失敗`);
process.exit(failed === 0 ? 0 : 1);
