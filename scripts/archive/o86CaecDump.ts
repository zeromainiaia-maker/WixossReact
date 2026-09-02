/**
 * §5.3 `O-86`（UI コスト層の payload 化）の **A/B ダンプ**＝`computeArtsEffectiveCost` の出力を
 * 全カード × 盤面/文脈マトリクスで書き出し、regex 撤去の**前後で突き合わせて不一致0を実証する**ための道具。
 * 第7〜9バッチで使い、**この項目の標準手順**になったので歴史記録として残す（実行しなくてよい）。
 *
 *   使い方（リポジトリ直下に置き直して）:
 *     npx tsx o86CaecDump.ts before.json
 *     git stash push -- src public/data && npx tsx o86CaecDump.ts base.json && git stash pop
 *     （2本の JSON をカード×セルで差分する）
 *
 * 🔴**踏んだ罠＝`mergeManualEffects` を掛けてはいけない。** アプリ（`App.tsx`）は live JSON を
 *   そのまま読む。ここで manual を重ねると、`buildEffectsJson` が**収穫マージの後から重ねている**
 *   印字コスト payload（`costReplacement` ほか）が manual の古い `cost` で上書きされ、
 *   **新しい payload が1枚も効かない状態を「挙動不変」と誤って報告する**（第9バッチで実際に踏んだ）。
 */
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { computeArtsEffectiveCost, costScalingOf, costReplacementOf } from '../../src/screens/battle/costs';
import type { CardData, PlayerState } from '../../src/types';
import type { CardEffect } from '../../src/types/effects';

const root = '.';
const out = process.argv[2];
const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const effectsMap = new Map<string, CardEffect[]>();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const j = JSON.parse(fs.readFileSync(join(root, 'public/data', f), 'utf-8'));
  for (const [id, effs] of Object.entries(j)) effectsMap.set(id, effs as CardEffect[]);
}
// 🔴**`mergeManualEffects` を掛けない**＝アプリ（`App.tsx`）は live JSON をそのまま読む。
//   ここで manual を重ねると、`buildEffectsJson` が**マージの後から重ねている**印字コスト payload
//   （`costReplacement` ほか）が manual の古い `cost` で上書きされ、**計測が丸ごと空振りする**。

// ── プール（規則が要求する属性を1枚ずつ代表させる）──
const SEISEI = 'WD04-009', SEIRA = 'WD02-009', ARM = 'WD01-009', WEAPON = 'WX01-039';
const BLUE_DENKI = 'WD03-009', BLACK_DENKI = 'WX12-024', BIGPOW = 'WX01-053', SMALLPOW = 'WD01-013';
const AKUMA = 'WD05-009', RYU = 'WX04-031';
const BLUE_ARTS = 'WD03-007', BLACK_ARTS = 'WD05-006', RED_ARTS = 'WD02-006';
const LRIG = 'WD01-001';
const mkField = (signi: (string | null)[]): PlayerState['field'] => ({
  lrig: [LRIG], signi: signi.map(s => (s ? [s] : null)) as (string[] | null)[],
}) as PlayerState['field'];

type Scene = {
  field: PlayerState['field']; trash: string[]; lrig_trash: string[];
  life: number; hand: number; energy: number; lrigLevel: number;
  oppLife: number; oppHand: number; oppEnergy: number; oppTrash: number; oppLrigTrash: string[];
  oppBanished: number; lrigName: string; oppColor: string;
};
const FIELDS: (string | null)[][] = [
  [null, null, null],
  [SEISEI, null, null],
  [SEIRA, null, null],
  [ARM, null, null],
  [WEAPON, null, null],
  [ARM, WEAPON, null],
  [BLUE_DENKI, null, null],
  [BLACK_DENKI, null, null],
  [BLUE_DENKI, BLACK_DENKI, null],
  [BIGPOW, null, null],
  [SMALLPOW, null, null],
  [AKUMA, RYU, BIGPOW],
];
const TRASHES: string[][] = [
  [],
  Array(6).fill(AKUMA),
  Array(5).fill(RYU),
  [...Array(10).fill(AKUMA), ...Array(10).fill(RYU)],
];
const LRIG_TRASHES: string[][] = [
  [], [BLUE_ARTS], [BLACK_ARTS], [BLUE_ARTS, BLACK_ARTS], [RED_ARTS, RED_ARTS, RED_ARTS],
];
const scenes: Scene[] = [];
for (const f of FIELDS) for (const lt of LRIG_TRASHES) {
  const i = scenes.length;
  const t = TRASHES[i % TRASHES.length];
  scenes.push({
    field: mkField(f), trash: t, lrig_trash: lt,
    life: [0, 2, 5][i % 3], hand: [0, 3, 7][(i + 1) % 3], energy: [0, 4, 8][(i + 2) % 3],
    lrigLevel: i % 6,
    oppLife: [4, 2, 0][i % 3], oppHand: [5, 3, 0][(i + 1) % 3], oppEnergy: [6, 4, 0][(i + 2) % 3],
    oppTrash: [0, 4, 9][i % 3], oppLrigTrash: LRIG_TRASHES[i % LRIG_TRASHES.length],
    oppBanished: i % 2, lrigName: ['満月の巫女　タマヨリヒメ', '花代', '緑子'][i % 3],
    oppColor: ['', '赤', '青', '緑', '黒', '白'][i % 6],
  });
}
const CTX = [] as { bet: boolean; paid: boolean; arts: boolean; spells: number; thr: number }[];
for (const bet of [false, true]) for (const paid of [false, true]) for (const arts of [false, true]) for (const spells of [0, 1, 2]) for (const thr of [0, 1]) CTX.push({ bet, paid, arts, spells, thr });

const filler = (n: number, seed: string) => Array.from({ length: n }, (_, i) => (i % 2 ? seed : SMALLPOW));
const result: Record<string, string[]> = {};
let calls = 0;
// 🔑候補＝出力が印刷コストから動きうるカード＝**原文に「コスト」を含む**か**コスト payload を持つ**。
//   それ以外は 4通りだけの健全性確認（印刷コストのまま動かないことの確認）。
const PAYLOAD_KEYS = ['costScaling', 'costReplacement', 'optionalDiscardCost', 'conditionalEnergyReduction'];
for (const [cardNum, card] of cardMap) {
  if (!card.EffectText && !card.Cost) continue;
  const cs = costScalingOf(cardNum, effectsMap);
  const cr = costReplacementOf(cardNum, effectsMap);
  const js = JSON.stringify(effectsMap.get(cardNum) ?? []);
  const isCandidate = (card.EffectText ?? '').includes('コスト') || PAYLOAD_KEYS.some(k => js.includes(`"${k}"`));
  const useScenes = isCandidate ? scenes : scenes.slice(0, 2);
  const useCtx = isCandidate ? CTX : CTX.slice(0, 2);
  const row: string[] = [];
  for (const s of useScenes) {
    const my = {
      life_cloth: filler(s.life, BIGPOW), hand: filler(s.hand, ARM), field: s.field,
      trash: s.trash, lrig_trash: s.lrig_trash, energy: filler(s.energy, SEIRA),
    };
    for (const c of useCtx) {
      const opp = {
        turn_arts_used: c.arts, actions_done: Array(c.spells).fill('USE_SPELL'),
        field: mkField([SMALLPOW, null, null]), life_cloth: filler(s.oppLife, BIGPOW),
        coins: 2, abilities_removed: [], hand: filler(s.oppHand, ARM),
        energy: filler(s.oppEnergy, SEIRA), trash: filler(s.oppTrash, AKUMA),
        lrig_trash: s.oppLrigTrash, signi_banished_this_turn: s.oppBanished,
      };
      row.push(computeArtsEffectiveCost(
        card, my, s.lrigName, s.oppColor, s.lrigLevel, cardMap, [s.lrigName],
        c.thr > 0 ? [{ minTotalCost: 0, color: '無', reduction: c.thr }] : [],
        { oppState: opp, cardCostReplacements: [], isBetting: c.bet, paidOptionalDiscard: c.paid },
        cs, cr));
      calls++;
    }
  }
  result[cardNum] = row;
}
fs.writeFileSync(out, JSON.stringify(result), 'utf-8');
console.log(`[dump] ${Object.keys(result).length}カード / ${scenes.length}盤面 × ${CTX.length}文脈 = ${calls} 通り → ${out}`);
