/**
 * decompileEffects.ts
 * effects_*.json の構造化効果を「日本語の自然言語っぽい文」へ逆翻訳し、
 * CardData CSV の原文（EffectText/BurstText）と並べて表示する検証補助ツール。
 *
 * 目的: パーサー/手修正の結果が原文と食い違っていないかを目視レビューしやすくする。
 *   - 逆翻訳は「JSONが宣言している内容」を素直に和文化したもの（近似・STUBはそのまま明示）。
 *   - 一致＝正しさの保証ではないが、不一致は要確認のシグナルになる。
 *
 * 使い方:
 *   npx tsx scripts/decompileEffects.ts WX12-024 WX20-055      # 指定カード
 *   npx tsx scripts/decompileEffects.ts --manual               # manualEffects 登録カードのみ
 *   npx tsx scripts/decompileEffects.ts --grep ゲート          # 原文に語を含むカード
 *   npx tsx scripts/decompileEffects.ts --sheets               # 全シートを docs/decompile_sheet<N>.txt へ直接書き出し
 *     （UTF-8 でファイル直書き＝シェルの > を使わない。PowerShell の > が UTF-16 を書いて
 *       下流の genReviewRepr/groupSimilar/groupBySentence を壊す事故を構造的に防ぐ。
 *       下流までまとめて回すなら npm run regen）
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import type { CardData } from '../src/types';
import { mergeManualEffects, MANUAL_EFFECTS } from '../src/data/manualEffects';
import { parseUseTimeCostReduction } from '../src/screens/battle/useTimeCost';
import { decodeLancerKeyword } from '../src/utils/keywords';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Eff = any;
type Action = any;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── データ読み込み ──
const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const effectsMap = new Map<string, Eff[]>();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const j = JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8'));
  for (const [id, effs] of Object.entries(j)) effectsMap.set(id, effs as Eff[]);
}
// manualEffects をマージ（runtime の buildEffectsMap と同じ effects を逆翻訳に反映する）
{
  const ids = new Set<string>([...effectsMap.keys(), ...Object.keys(MANUAL_EFFECTS)]);
  for (const id of ids) {
    const merged = mergeManualEffects(id, (effectsMap.get(id) ?? []) as never[]);
    if (merged.length > 0) effectsMap.set(id, merged as Eff[]);
  }
}

// ── STUBS.md から STUB id → 説明 マップを構築（逆翻訳で id ではなく説明文を出すため）──
const stubDescMap = new Map<string, string>();
{
  const p = join(root, 'docs/STUBS.md');
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf-8').split('\n')) {
      // 表の行: | `STUB_ID` | 件数 | カード数 | 代表カード | 説明 |
      const m = line.match(/^\|\s*`([^`]+)`\s*\|[^|]*\|[^|]*\|[^|]*\|(.*)\|\s*$/);
      if (!m) continue;
      const id = m[1].trim();
      const desc = m[2].trim();
      if (id && desc) stubDescMap.set(id, desc);
    }
  }
}

// ── 部品の和文化 ──
// 現在和文化中のカードの原文（STUB等で原文からパラメータを補完する用。出力ループでカードごとに設定）
let currentCardText = '';
let currentCardName = '';
// restoreLeadDuration 用に、いま和文化中の効果に対応する原文セクション（本文 or バースト）だけを保持する。
// カード全体（currentCardText）だと本文とバーストで同キーワードを別 duration で付与するカード（WX05-034＝本文
// 「ターン終了時まで…【ダブルクラッシュ】」／バースト「このターンと次のターンの間…【ダブルクラッシュ】」）で
// 期間句を取り違えるため、効果ごとに本文／バーストへ絞る（出力ループで effectId により設定）。
let currentEffectText = '';

// §5b Opusタスク(A)：付与系 action の action内 duration が curated JSON で落ちている（PERMANENT/未設定）場合に、
// 原文の該当付与文へ期間句（ターン終了時まで／次の相手のターン終了時まで）があれば注記を復元する。
// 原文をカードの「。／改行」区切り文に分け、付与を表すアンカー（例：【ダブルクラッシュ】…得る、能力を失い）を含む文に
// 限って期間句を探すため、同カードの別効果の期間句を誤って流用しない（文スコープ＋本文/バーストスコープ）。engine/JSON 不変。
// 母集団＝docs/_duration_lead_population.txt（抽出 scripts/archive/extractDurationLeadPopulation.mjs）。
function restoreLeadDuration(anchor: RegExp): string {
  const scope = currentEffectText || currentCardText;
  for (const sent of scope.split(/[。\n]/)) {
    if (!anchor.test(sent)) continue;
    if (/次の(?:対戦相手|相手)の?ターン終了時まで/.test(sent)) return '（次の相手ターン終了時まで）';
    if (/ターン終了時まで/.test(sent)) return '（ターン終了時まで）';
  }
  return '';
}
const ownerJa = (o?: string) => o === 'opponent' ? '対戦相手の' : o === 'self' ? 'あなたの' : '';
const opJa = (op?: string) => ({ gte: '以上', lte: '以下', gt: 'より多く', lt: '未満', eq: 'である', neq: 'ではない' } as Record<string, string>)[op ?? ''] ?? (op ?? '');
// 数量条件を「〜場合」の直前に置ける述語へする。単純な「ある」後置は
// eq→「であるある」、lte→「以下ある」になるため operator ごとに閉じる。
const countPredicateJa = (op?: string) => ({
  gte: '以上ある',
  lte: '以下である',
  gt: 'より多い',
  lt: '未満である',
  eq: 'である',
  neq: 'ではない',
} as Record<string, string>)[op ?? ''] ?? (op ?? '');
// タスク12(liii)「それのレベル１につき」族＝対象シグニのレベルが枚数になる動的値
const LEVEL_REFS = ['last_processed_level', 'stored_target_level'];
const numJa = (n: any) => typeof n === 'object'
  ? (LEVEL_REFS.includes(n?.$ref) ? 'それのレベルと同じ数の'
    : n?.$ref === 'last_processed_count' ? 'この方法で処理した枚数と同じ数の'
    : n?.$ref === 'cards_drawn_this_attack_phase' ? 'このアタックフェイズ中に引いた枚数と同じ数の'
    // 🆕2026-08-31 続き748＝「このターンにあなたの〈filter〉のシグニがクラッシュした相手ライフ1枚につき」。
    : n?.$ref === 'left_field_under_count' ? 'このシグニの下にあったカードの枚数と同じ数'
    : n?.$ref === 'life_crashed_by_signi_this_turn'
      ? `このターンにあなたの${n.filter ? filterJa(n.filter) : ''}シグニがクラッシュした対戦相手のライフクロスの枚数と同じ数`
    : '[参照値]')
  : String(n);

// anyOf（OR フィルタ）＝下位フィルタごとに名詞まで出して「AかB」に組む。
// 下位ごとに cardType が違う（「スペルか＜原子＞のシグニ」）ため、filterJa の接頭辞だけでは表せない。
function anyOfJa(list: any[]): string {
  return list.map((s: any) => `${filterJa(s)}${([] as string[]).concat(s.cardType ?? []).join('か') || 'カード'}`).join('か');
}

function countFromZoneJa(spec: any): string {
  const zone = ({ field: '場', hand: '手札', energy: 'エナゾーン', trash: 'トラッシュ', lrig_trash: 'ルリグトラッシュ', deck: 'デッキ', acce: '【アクセ】', charm: '場の【チャーム】', trap: '【トラップ】', under: 'このシグニの下', check: 'チェックゾーン' } as Record<string, string>)[spec?.zone] ?? spec?.zone;
  const noun = spec?.filter
    ? `${filterJa(spec.filter)}${([] as string[]).concat(spec.filter.cardType ?? []).join('か') || 'カード'}`
    : 'カード';
  const owner = ownerJa(spec?.owner);
  const base = spec?.zone === 'deck' ? `${owner}デッキの枚数`
    : spec?.zone === 'charm' ? `${owner}場にある【チャーム】の枚数`
    // `under`＝効果元スタックの下段（§5.3 `O-141`）。所有者は効果元で決まるので owner を出さない。
    : spec?.zone === 'under' ? `${zone}にある${noun}の枚数`
    : `${owner}${zone}にある${noun}の枚数`;
  return `${base}${spec?.unitSize ? `÷${spec.unitSize}` : ''}${spec?.per && spec.per !== 1 ? `×${spec.per}` : ''}`;
}

function countFromZonePerJa(spec: any, suffix: string, upTo = false): string {
  const unit = spec?.unitSize ?? 1;
  const per = spec?.per ?? 1;
  // 🆕`field`＝場のシグニを数える形（`WX07-027-BURST`「あなたの＜原子＞のシグニ1体につき」）。
  //   ⚠従来この zone は表になく `${spec.zone}にあるカード` へ落ちて **`fieldにあるカード` と生の英語**が出ていた。
  //   フィルタ（＜原子＞等）も描かないと「場のカード全部」に見えるので `filterJa` を通す。
  const filJa = spec?.filter ? filterJa(spec.filter) : '';
  const subject = spec?.zone === 'deck' ? `${ownerJa(spec.owner)}デッキの枚数`
    : spec?.zone === 'charm' ? `${ownerJa(spec.owner)}場にある【チャーム】`
    : spec?.zone === 'field' ? `${ownerJa(spec.owner)}場にある${filJa}${([] as string[]).concat(spec.filter?.cardType ?? []).join('か') || 'カード'}`
    : spec?.zone === 'under' ? `このシグニの下にある${filJa}${([] as string[]).concat(spec.filter?.cardType ?? []).join('か') || 'カード'}`
    : `${ownerJa(spec.owner)}${filJa}${({ acce: '【アクセ】', trash: 'トラッシュにあるカード' } as Record<string, string>)[spec?.zone] ?? `${spec?.zone}にあるカード`}`;
  const counterJa = spec?.zone === 'field' && spec?.filter?.cardType === 'シグニ' ? '体' : '枚';
  return `${subject}${unit}${counterJa}につき${per}${suffix}${upTo ? 'まで' : ''}`;
}

/** `NumberOrRef.$ref` の日本語（§5.3 `O-87`＝`REPEAT.countRef` の逆翻訳用。未知の ref は生 id を出す）。 */
function refCountJa(ref: string): string {
  const m: Record<string, string> = {
    last_processed_count: 'この方法で処理したカード1枚',
    last_processed_level_sum: 'この方法で処理したカードのレベル合計1',
    bet_coins_paid: 'ベットした《コイン》1枚',
  };
  return m[ref] ?? `［${ref}］`;
}

function lastProcessedCountJa(spec: any): string {
  const noun = spec && spec !== true
    ? `${filterJa(spec)}${([] as string[]).concat(spec.cardType ?? []).join('か') || 'カード'}`
    : 'カード';
  return `この方法で処理した${noun}の枚数`;
}

function filterJa(f?: any): string {
  if (!f) return '';
  const parts: string[] = [];
  if (f.anyOf) parts.push(`${anyOfJa(f.anyOf)}である`);
  if (f.thisCardOnly) parts.push('このシグニ自身');
  if (f.excludeSelf) parts.push('他の');
  if (f.frontOfSelf) parts.push('このシグニの正面の');
  if (f.adjacentToSelf) parts.push('このシグニの隣にある');
  if (f.frontOfGateZone) parts.push('【ゲート】の正面の');
  if (f.inGateZone) parts.push('同じゾーンに【ゲート】がある');
  if (f.centerZoneOnly) parts.push('中央ゾーンの');
  if (f.zoneSide) parts.push(f.zoneSide === 'left' ? '左ゾーンの' : '右ゾーンの');
  if (f.isFrozen) parts.push('凍結状態の');
  if (f.isPuppet) parts.push('傀儡状態の');
  if (f.attackedThisTurn) parts.push('このターンにアタックした');
  // 🆕いま宣言中のアタッカー限定（`attackedThisTurn` とは別軸＝バトル未解決の1体だけ）。
  if (f.isAttacking) parts.push('アタックしている');
  if (f.color) {
    const colors = ([] as string[]).concat(f.color);
    parts.push(colors.length === 1 && colors[0] === '無' ? '無色の' : `《${colors.join('・')}》の`);
  }
  if (f.colorExclude) parts.push(`《${[].concat(f.colorExclude).join('・')}》以外の`);
  if (f.cardClass) parts.push(`＜${[].concat(f.cardClass).join('・')}＞の`);
  if (f.cardClassExclude) parts.push(`＜${[].concat(f.cardClassExclude).join('・')}＞ではない`);
  if (f.story) parts.push(`＜${[].concat(f.story).join('・')}＞の`);
  if (f.cardName) parts.push(`《${f.cardName}》`);
  // 🆕`cardNum`＝カード番号での自己限定（`WX18-036-E3`「**このシグニを**あなたの手札から場に出す」＝
  //   `HAND_CARD` 分岐は `thisCardOnly` を読まないので番号で書く／2026-08-30 §5.2 Sheet2 バッチ6）。
  //   描かないと「手札の任意のシグニ」と逆翻訳が同じ文になり、原文照合で差が見えない。
  if (f.cardNum) parts.push(`カード番号${f.cardNum}の`);
  if (f.excludeCardName) parts.push(`《${f.excludeCardName}》以外の`);
  if (f.cardNames) parts.push(`《${f.cardNames.join('》《')}》のいずれか`);
  if (typeof f.level === 'number') parts.push(`レベル${f.level}の`);
  else if (f.level?.max != null) parts.push(`レベル${f.level.max}以下の`);
  else if (f.level?.min != null) parts.push(`レベル${f.level.min}以上の`);
  if (f.levelEqualsVar === 'field_trash_level') parts.push('この方法でトラッシュしたシグニと同じレベルの');
  else if (f.levelEqualsVar === 'charm_trash_count') parts.push('トラッシュしたチャーム枚数と同じレベルの');
  else if (f.levelEqualsVar === 'cost_hand_to_energy_level') parts.push('この方法でエナゾーンに置いたシグニと同じレベルの');
  else if (f.levelEqualsVar === 'cost_energy_trash_level_sum') parts.push('この方法でトラッシュに置いたシグニのレベルの合計と同じレベルの');
  if (f.levelEqDiscardLevelSum) parts.push('捨てたカードのレベル合計と同じレベルの');
  if (f.levelRange?.max != null) parts.push(`レベル${f.levelRange.max}以下の`);
  if (f.levelRange?.min != null) parts.push(`レベル${f.levelRange.min}以上の`);
  if (f.powerLteRevealedSigniLevelSum != null) parts.push(`パワーが「この方法で公開したシグニのレベルの合計×${f.powerLteRevealedSigniLevelSum}」以下の`);
  if (f.powerLteZoneCount) parts.push(`パワーが「${countFromZoneJa(f.powerLteZoneCount)}」以下の`);
  if (f.powerLteLastProcessedCount != null) parts.push(`パワーが「この方法で処理したカードの枚数×${f.powerLteLastProcessedCount}」以下の`);
  if (f.levelLteZoneCount) parts.push(`${countFromZoneJa(f.levelLteZoneCount)}以下のレベルを持つ`);
  if (f.powerRange?.max != null) parts.push(`パワー${f.powerRange.max}以下の`);
  if (f.powerRange?.min != null) parts.push(`パワー${f.powerRange.min}以上の`);
  if (f.costMin != null && f.costMax != null && f.costMin === f.costMax) parts.push(`コストの合計が${f.costMax}の`);
  else {
    if (f.costMax != null) parts.push(`コストの合計が${f.costMax}以下の`);
    if (f.costMin != null) parts.push(`コストの合計が${f.costMin}以上の`);
  }
  if (f.powerLteSelf) parts.push('このシグニのパワー以下の');
  if (f.powerEqSelf) parts.push('このシグニと同じパワーの');
  if (f.powerLteSelfHalf) parts.push('このシグニのパワーの半分以下の');
  if (f.powerLtSelf) parts.push('このシグニよりパワーの低い');
  if (f.powerGtSelf) parts.push('このシグニよりパワーの高い');
  if (f.levelLtSelf) parts.push('このシグニより低いレベルを持つ');
  if (f.levelGtSelf) parts.push('このシグニよりレベルの高い');
  if (f.powerLtAnyAlly) parts.push('あなたのいずれかのシグニよりパワーの低い');
  if (f.powerLtPrinted) parts.push('表記されているパワーよりパワーの低い');
  if (f.powerGtPrinted) parts.push('表記されているパワーよりパワーの高い');
  if (f.powerDiffersFromPrinted) parts.push('表記されているパワーと異なるパワーの');
  if (f.noRecollectIcon) parts.push('《リコレクトアイコン》を持たない');
  if (f.powerLtTrigger) parts.push('そのシグニよりパワーの低い');
  if (f.powerLteTrigger) parts.push('そのシグニのパワー以下の');
  if (f.powerEqTrigger) parts.push('そのシグニと同じパワーの');
  if (f.classMatchesAnyFieldSigni) parts.push('あなたの場のいずれかのシグニと共通するクラスを持つ');
  if (f.levelLtTrigger) parts.push('そのシグニより低いレベルを持つ');
  if (f.levelEqTrigger) parts.push('そのシグニと同じレベルの');
  if (f.levelGtTrigger) parts.push('そのシグニより高いレベルを持つ');
  if (f.levelLtOppLrig) parts.push('対戦相手のセンタールリグより低いレベルを持つ');
  if (f.superlative) parts.push(`最も${f.superlative.key === 'level' ? 'レベル' : 'パワー'}の${f.superlative.dir === 'max' ? '高い' : '低い'}`);
  if (f.powerLteLastProcessed) parts.push('直前に処理したシグニのパワー以下の');
  if (f.powerLtLastProcessed) parts.push('（その後）そのシグニよりパワーの低い');
  if (f.levelLteHandDiff) parts.push('あなたと対戦相手の手札の枚数の差以下のレベルを持つ');
  if (f.levelLteLastProcessed) parts.push('この方法で処理したシグニのレベル以下の');
  if (f.levelLtLastProcessed) parts.push('（その後）そのシグニより低いレベルを持つ');
  if (f.levelLtTriggerSource) parts.push('そのシグニより低いレベルを持つ');
  if (f.levelGtLastProcessed) parts.push('（その後）それよりレベルの高い');
  if (f.levelEqLastProcessed) parts.push('直前にこの方法で処理したカードと同じレベルの');
  if (f.levelEqFacedownRevealed) parts.push('この方法で公開したカードと同じレベルの');

  if (f.levelEqLastDownedLrig) parts.push('この方法でダウンしたルリグと同じレベルの');
  if (f.nameEqLastProcessed) parts.push('直前にこの方法で処理したカードと同じ名前の');
  if (f.levelEqLastProcessedCount) parts.push(`${lastProcessedCountJa(f.levelEqLastProcessedCount)}と同じレベルの`);
  if (f.levelLteLastProcessedCount) parts.push(`${lastProcessedCountJa(f.levelLteLastProcessedCount)}以下のレベルを持つ`);
  if (f.levelEqLastProcessedLevelSum) parts.push('この方法で処理したカードのレベル合計と同じレベルの');
  if (f.levelEqLrig === 'self') parts.push('あなたのセンタールリグと同じレベルの');
  if (f.levelEqLrig === 'opponent') parts.push('対戦相手のセンタールリグと同じレベルの');
  if (f.levelLteDiscardSigni) parts.push('この方法で捨てたシグニのレベル以下の');
  if (f.levelLtDiscardSigni) parts.push('この方法で捨てたシグニより低いレベルを持つ');
  if (f.levelEqDiscardSigniOffset !== undefined) parts.push(`この方法で捨てたシグニよりレベルが${f.levelEqDiscardSigniOffset}つ高い`);
  if (f.classMatchesDiscardSigni) parts.push('この方法で捨てたシグニと共通するクラスを持つ');
  if (f.hasGuard) parts.push('《ガードアイコン》を持つ');
  if (f.noGuard) parts.push('《ガードアイコン》を持たない');
  if (f.noAbilities) parts.push('能力を持たない'); // §5d パターンA（描画が無いと原文照合で脱落に見える）
  if (f.hasRiseIcon) parts.push('《ライズアイコン》を持つ');
  if (f.noRiseIcon) parts.push('《ライズアイコン》を持たない');
  if (f.hasCrossIcon) parts.push('《クロスアイコン》を持つ');
  if (f.nonColorless) parts.push('無色ではない');
  if (f.excludeResona) parts.push('レゾナではない');
  if (f.isDisona) parts.push('《ディソナアイコン》を持つ');
  if (f.hasLifeBurst === true) parts.push('【ライフバースト】を持つ');
  if (f.hasLifeBurst === false) parts.push('【ライフバースト】を持たない');
  if (f.levelParity) parts.push(f.levelParity === 'odd' ? 'レベルが奇数の' : 'レベルが偶数の');
  if (f.commonClass) parts.push('共通するクラスを持つ');
  if (f.hasIcon) parts.push(`《${f.hasIcon}アイコン》を持つ`);
  if (f.isDown) parts.push('ダウン状態の');
  if (f.isUp) parts.push('アップ状態の');
  if (f.isDrive) parts.push('ドライブ状態の');
  if (f.isFrozen) parts.push('凍結状態の');
  if (f.isAwakened) parts.push('覚醒状態の');
  if (f.crossState) parts.push('クロス状態の');
  if (f.hasCharm) parts.push('チャームのある');
  if (f.hasAcce) parts.push('アクセのある');
  if (f.hasSoul) parts.push('【ソウル】が付いている');
  if (f.hasUnderCards) parts.push('下にカードがある');
  if (f.hasAttachedOrUnder) parts.push('カードが付いているか下にカードがある');
  if (f.hasOnPlayAbility) parts.push('【出】能力を持つ');
  if (f.levelEqLastProcessedPlus != null) parts.push(`それよりレベルが${f.levelEqLastProcessedPlus}つ大きい`);
  if (f.powerLtAcceHost) parts.push('これにアクセされているシグニよりパワーの低い');
  if (f.nameEqTriggerSource) parts.push('そのカードと同じ名前の');
  if (f.colorNotMatchesSource) parts.push('このシグニと共通する色を持たない');
  if (f.frontOfAllyWithSoul) parts.push('【ソウル】が付いているあなたのシグニの正面の');
  if (f.infected) parts.push('感染状態の');
  if (f.colorMatchesLrig) parts.push('センタールリグと共通色の');
  if (f.colorNotMatchesLrig) parts.push('センタールリグと共通色でない');
  if (f.colorMatchesAnyLrig) parts.push('場のルリグと共通色の');
  if (f.colorMatchesNonCenterLrig) parts.push('センタールリグ以外のルリグと共通色の');
  // 宣言参照（タスク12(xlvi)(c)）。未実装だと逆翻訳が黙って条件を落とし、
  // 「宣言したクラスを持つシグニ」が単なる「シグニ」に見えてしまう。
  if (f.levelEqDeclaredNumber) parts.push('宣言した数字と同じレベルを持つ');
  if (f.classEqDeclaredClass) parts.push('宣言したクラスを持つ');
  // 🆕クロス条件に名前が挙がっているカード（落とすと「任意のシグニ」に読める）。
  if (f.nameInCrossConditionOfLastProcessed) parts.push('それのクロス条件に含まれる');
  // 🆕限定条件（Restriction 列）の一致。落とすと「任意のカード」に読める。
  if (f.restrictionMatchesCenterLrig) parts.push('限定条件にあなたのセンタールリグのルリグタイプを持つ');
  else if (f.restrictionContains) parts.push(`限定条件に「${f.restrictionContains}」を持つ`);
  // 🆕インスタンス履歴フィルタ（このターンに手札から捨てた札だけ）。落とすと逆翻訳から限定が消える。
  if (f.discardedFromHandThisTurn) parts.push('このターンに手札から捨てた');
  if (f.nameEqDeclaredName) parts.push('宣言したカード名の');
  if (f.colorMatchesLastProcessed) parts.push('この方法で処理したカードと共通する色を持つ');
  // 🆕2026-08-30 §5.2 カード単位バッチ第3回＝**逆翻訳が黙って落としていた3語彙**を追加した。
  // 速いレーンの検証は「逆翻訳を目視」なので、ここに無い語彙は**直したのに直って見えない／
  // 落ちているのに落ちて見えない**（`colorMatchesTriggerSource` は第2回で新設した当日から欠けていた）。
  if (f.colorMatchesTriggerSource) parts.push('そのカードと共通する色を持つ');
  if (f.colorMatchesSourceCard) parts.push('このカード自身と共通する色を持つ');
  if (f.nameMatchesAnyFieldSigni) parts.push('場のシグニのいずれかと同じ名前の');
  if (f.nameMatchesAnyTrashCard) parts.push(`同名カードが${f.nameMatchesAnyTrashCard === 'opponent' ? '対戦相手' : 'あなた'}のトラッシュにある`);
  if (f.colorMatchesLastDownedLrig) parts.push('この方法でダウンしたルリグと共通する色を持つ');
  if (f.colorMatchesUnderCards) parts.push('このシグニの下にあるカードと共通する色を持つ');
  if (f.colorMatchesCostTrashed) parts.push('このコストでトラッシュに置いたカードと共通する色を持つ');
  if (f.keyword) parts.push(`${[].concat(f.keyword).map((k: string) => `【${k}】`).join('か')}を持つ`);
  return [...new Set(parts)].join('');
}

function selectionGroupsJa(groups?: Array<{ filter?: any; count: number }>, counter = '枚'): string {
  if (!groups?.length) return '';
  return groups.map(group => {
    const cardType = group.filter?.cardType;
    const noun = cardType ? ([] as string[]).concat(cardType).join('か') : 'カード';
    return `${filterJa(group.filter)}${noun}${group.count}${counter}`;
  }).join('と');
}

// transferGroups は群ごとの filter しか持たないため、移動元ゾーンは source から前置きする
// （落とすと逆翻訳から「あなたのトラッシュから」が消えて、どこから回収するのか読めなくなる）
const TRANSFER_ZONE_JA: Record<string, string> = {
  TRASH_CARD: 'トラッシュから', ENERGY_CARD: 'エナゾーンから',
  DECK_CARD: 'デッキから', LRIG_TRASH_CARD: 'ルリグトラッシュから',
};
function transferGroupZoneJa(src?: any): string {
  const zone = src?.type ? TRANSFER_ZONE_JA[src.type] : undefined;
  return zone ? `${ownerJa(src.owner)}${zone}` : '';
}

function targetJa(t?: any, unit = 'シグニ', exSelf = false): string {
  if (!t) return '';
  // excludeSelf は filter の外（target 直下・action 直下）にも置かれるため、ここで filter にマージして「他の」を出す
  if ((exSelf || t.excludeSelf) && !t.filter?.excludeSelf) t = { ...t, filter: { ...(t.filter || {}), excludeSelf: true } };
  // isTriggerSource: トリガー元（「アタックしたそのシグニ」等）→ 主語省略で「その〜」
  if (t.filter?.isTriggerSource) {
    const lvMax = t.filter.levelRange?.max ?? (typeof t.filter.level === 'object' ? t.filter.level?.max : undefined);
    return lvMax !== undefined ? `そのレベル${lvMax}以下の${unit}` : `その${unit}`;
  }
  // thisCardOnly: このシグニ自身に限定 → 主語・数詞を省略して「このシグニ」
  if (t.filter?.thisCardOnly) {
    return 'このシグニ';
  }
  if (t.zoneSource === 'designated') {
    return `指定されたシグニゾーンにある${filterJa(t.filter)}${unit}`;
  }
  // owner='any': count='ALL' は「すべてのシグニ」（両者・主語省略）、単体選択は「自分または対戦相手の」（どちらも選べる）
  const own = t.owner === 'any' ? (t.count === 'ALL' ? '' : '自分または対戦相手の') : ownerJa(t.owner);
  // 領域カード（手札/トラッシュ/エナ/デッキ等）はフィルタの cardType を名詞に反映（無ければ「カード」）
  const loc = t.type === 'HAND_CARD' ? '(手札)' : t.type === 'TRASH_CARD' ? '(トラッシュ)'
    : t.type === 'ENERGY_CARD' ? '(エナ)' : t.type === 'DECK_CARD' ? '(デッキ)'
    : t.type === 'LRIG_TRASH_CARD' ? '(ルリグトラッシュ)' : t.type === 'LIFE_CLOTH_CARD' ? '(ライフ)'
    // 🆕チェックゾーン（§5.3 `O-143`）＝ここを書かないと逆翻訳でゾーンが消えて「カードを手札に加える」になる。
    : t.type === 'CHECK_CARD' ? '(チェックゾーン)' : '';
  let u: string;
  if (t.type === 'LRIG') u = 'ルリグ';
  else if (t.type === 'CENTER_LRIG_OR_SIGNI') u = t.count === 'ALL' ? 'ルリグとシグニ' : 'センタールリグかシグニ';
  // 場のキー（§6.4 O-17）。数詞は下の `counter` が `loc` 無し＝「体」になるので、ここで「枚」へ寄せる。
  else if (t.type === 'KEY') u = 'キー';
  else if (t.type === 'PLAYER') u = '';
  else if (loc) {
    const ct = t.filter?.cardType;
    u = (ct ? ([] as string[]).concat(ct).join('か') : 'カード') + loc;
  } else if (t.filter?.isResona || t.filter?.cardType === 'レゾナ') u = 'レゾナ';
  else u = unit; // SIGNI 等
  // パワー合計上限つき「M体まで」または「好きな数」
  if (t.totalPowerMax !== undefined) {
    const mPick = typeof t.count === 'number' ? `${t.count}体まで` : '好きな数';
    return `${own}${filterJa(t.filter)}${u}をパワーの合計が${t.totalPowerMax}以下になるように${mPick}`.trim();
  }
  // レベル合計上限つき「M体まで」（「レベルの合計がN以下になるようにM体まで」）
  if (t.totalLevelMax !== undefined) {
    const mPick = typeof t.count === 'number' ? `${t.count}体まで` : '好きな数';
    return `${own}${filterJa(t.filter)}${u}をレベルの合計が${t.totalLevelMax}以下になるように${mPick}`.trim();
  }
  const counter = (loc || t.type === 'KEY') ? '枚' : '体';
  if (t.selectionConstraint?.groups?.length) {
    return `${own}${selectionGroupsJa(t.selectionConstraint.groups, counter)}${loc}`.trim();
  }
  const setConstraint = t.selectionConstraint?.totalLevelExact !== undefined ? `レベルの合計が${t.selectionConstraint.totalLevelExact}になるように`
    : t.selectionConstraint?.totalLevelExactRef?.$ref === 'last_processed_count' ? 'レベルの合計がこの方法で処理した枚数と同じになるように'
    : t.selectionConstraint?.totalLevelMax !== undefined ? `レベルの合計が${t.selectionConstraint.totalLevelMax}以下になるように`
    // 🆕**2026-08-31 続き752**＝実行時解決の上限（`totalLevelMaxRef`）も描く。落とすと「無制限に好きな数」と
    //   同じ文になり、上限が入ったことが原文照合に映らない（`WXDi-P00-012-E1`）。
    : t.selectionConstraint?.totalLevelMaxRef?.$ref === 'opp_lrig_level' ? 'レベルの合計が対戦相手のセンタールリグのレベル以下になるように'
    : t.selectionConstraint?.totalLevelMaxRef?.$ref === 'last_processed_count' ? 'レベルの合計がこの方法で処理した枚数以下になるように'
    : t.selectionConstraint?.sharedColor === 'all' ? 'それぞれ共通する色を持つ'
    : t.selectionConstraint?.sharedColor === 'none' ? 'それぞれ共通する色を持たない'
    : t.selectionConstraint?.distinct === 'costSum' ? 'それぞれコストの合計が異なる'
    : t.selectionConstraint?.distinct ? `それぞれ${t.selectionConstraint.distinct === 'level' ? 'レベル' : t.selectionConstraint.distinct === 'name' ? '名前' : 'クラス'}の異なる`
    // 🆕2026-08-30＝`same`（選択集合の**全カードで同一**の軸）を描いていなかった＝
    //   「共通するレベルを持つ2体」が**ただの2体**に見えて原文照合で気付けなかった（`WXK11-042-E2`）。
    //   ⚠`distinct` の**逆**なので訳語を取り違えないこと。
    : t.selectionConstraint?.same ? `共通する${t.selectionConstraint.same === 'level' ? 'レベル' : t.selectionConstraint.same === 'name' ? '名前' : t.selectionConstraint.same === 'power' ? 'パワー' : 'クラス'}を持つ`
    : '';
  // 動的数：盤面/ゾーンの枚数（`countFromZone`）＝「あなたの＜原子＞のシグニ1体につき1体まで」
  //   （2026-08-28 Sheet1 バッチ・`WX07-027-BURST`）。⚠描かないと「1体まで」に見え、
  //   **上限が盤面で決まることが原文照合で消える**（engine は `resolveCountRef` で実数を使う）。
  if (t.countFromZone) {
    const perJa = countFromZonePerJa(t.countFromZone, counter, !!t.upToCount);
    return `${own}${setConstraint}${filterJa(t.filter)}${u}を${perJa}`.trim();
  }
  // 動的数：直前にトラッシュした枚数（「トラッシュに置いたシグニ1体につき」）
  if (typeof t.count === 'object' && t.count?.$ref === 'last_processed_count') {
    return `${own}${filterJa(t.filter)}${u}をこの方法で処理した枚数と同じ数だけ`.trim();
  }
  if (typeof t.count === 'object' && t.count?.$ref === 'cards_drawn_this_attack_phase') {
    return `${own}${filterJa(t.filter)}${u}をこのアタックフェイズ中に引いたカードの枚数まで`.trim();
  }
  if (t.addLastProcessedCount) {
    return `${own}${filterJa(t.filter)}${u}をこの方法で処理した枚数に${t.count}を加えた数`.trim();
  }
  // 動的数：対象シグニのレベル（タスク12(liii)「それのレベル１につき１枚」）
  if (typeof t.count === 'object' && LEVEL_REFS.includes(t.count?.$ref)) {
    return `${own}${filterJa(t.filter)}${u}をそれのレベル1につき1${counter}`.trim();
  }
  // 「好きな数」（count:'ALL' + upToCount）
  if (t.count === 'ALL' && t.upToCount) {
    if (setConstraint) return `${own}${filterJa(t.filter)}${u}を${setConstraint}好きな数`.trim();
    return `${own}好きな数の${filterJa(t.filter)}${u}`.trim();
  }
  const cnt = t.count === 'ALL' ? 'すべての' : '';
  // 🆕**`count` は `{$ref:…}` にもなる**（続き742-2）＝素で埋め込むと `[object Object]枚` と出て
  //   逆翻訳の目視検証（速いレーンの唯一の検証手段）が効かなくなる。参照名を日本語へ開く。
  const cntRefJa = (n: unknown): string => {
    if (typeof n === 'number') return String(n);
    const ref = (n as { $ref?: string } | null)?.$ref;
    return ref === 'center_lrig_level' ? 'あなたのセンタールリグのレベルと同じ数'
      : ref === 'last_processed_count' ? 'この方法で処理した枚数と同じ数'
      : ref === 'last_processed_level_sum' ? 'この方法で処理したレベル合計と同じ数'
      : ref ? `〈${ref}〉` : String(n);
  };
  const cntSuf = t.count === 'ALL' ? '' : `${cntRefJa(t.count)}${t.upToCount ? counter + 'まで' : counter}`;
  const blind = t.blind ? '（見ないで）' : '';
  return `${own}${cnt}${setConstraint}${filterJa(t.filter)}${u}${cntSuf ? cntSuf : ''}${blind}`.trim();
}

function constraintJa(c?: import('../src/types/effects').SelectionConstraint): string {
  if (c?.totalLevelExact !== undefined) return `レベルの合計が${c.totalLevelExact}になるように`;
  if (c?.totalLevelExactRef?.$ref === 'last_processed_count') return 'レベルの合計がこの方法で処理した枚数と同じになるように';
  if (c?.totalLevelMax !== undefined) return `レベルの合計が${c.totalLevelMax}以下になるように`;
  // 🆕**2026-08-31 続き752**＝実行時解決の上限（`totalLevelMaxRef`）も描く。
  //   落とすと「無制限に好きな数」と同じ文になり、上限が入ったことが原文照合に映らない（`WXDi-P00-012-E1`）。
  if (c?.totalLevelMaxRef?.$ref === 'opp_lrig_level') return 'レベルの合計が対戦相手のセンタールリグのレベル以下になるように';
  if (c?.totalLevelMaxRef?.$ref === 'last_processed_count') return 'レベルの合計がこの方法で処理した枚数以下になるように';
  if (c?.sharedColor === 'all') return '共通する色を持つ';
  if (c?.sharedColor === 'none') return '共通する色を持たない';
  if (c?.distinct === 'class') return '共通するクラスを持たない';
  if (c?.distinct === 'level') return 'それぞれレベルの異なる';
  if (c?.distinct === 'name') return 'それぞれ名前の異なる';
  return '';
}

function costScalingSigniJa(filter?: any): string {
  if (!filter) return 'シグニ';
  const classes = Array.isArray(filter.cardClass) ? filter.cardClass : filter.cardClass ? [filter.cardClass] : [];
  const classJa = classes.length ? `${classes.map((c: string) => `＜${c}＞`).join('か')}の` : '';
  const colorJa = filter.color ? `${([].concat(filter.color) as string[]).join('か')}の` : '';
  const nameJa = filter.cardName ? `カード名に《${filter.cardName}》を含む` : '';
  const exactNameJa = filter.cardNames?.length === 1 ? `《${filter.cardNames[0]}》` : '';
  const stateJa = filter.hasAcce ? 'アクセされている'
    : filter.hasSoul ? '【ソウル】が付いている'
    : filter.hasUnderCards ? '下にカードがある'
    : filter.hasAttachedOrUnder ? 'カードが付いているか下にカードがある'
    : filter.isFrozen ? '凍結状態の'
    : filter.noAbilities ? '能力を持たない'
    : '';
  return `${stateJa}${classJa}${colorJa}${nameJa}${exactNameJa}シグニ`;
}

function costScalingCountJa(count: any, per: number): string {
  const own = count.owner === 'opponent' ? '対戦相手の' : 'あなたの';
  if (count.kind === 'lrigLevel') return `${own}センタールリグのレベル${per}`;
  if (count.kind === 'coins') return `${own}コイン${per}枚`;
  if (count.kind === 'charm') return `${own}場にある【チャーム】${per}枚`;
  if (count.kind === 'virus') return `${own}場にある【ウィルス】${per}つ`;
  if (count.kind === 'fieldLrig') {
    const color = count.filter?.color ? `${([].concat(count.filter.color) as string[]).join('か')}の` : '';
    return `${own}場にいる${color}ルリグ${per}体`;
  }
  if (count.zone === 'life_cloth') return `${own}ライフクロス${per}枚`;
  if (count.zone === 'hand') return `${own}手札${per}枚`;
  if (count.zone === 'field') return `${own}場にある${costScalingSigniJa(count.filter)}${per}体`;
  if (count.zone === 'energy') return `${own}エナゾーンにある${costScalingSigniJa(count.filter)}${per}枚`;
  if (count.zone === 'lrig_trash') {
    const noun = count.filter?.cardType === 'アーツ' ? 'アーツ' : 'カード';
    return `${own}ルリグトラッシュにある${noun}${per}枚`;
  }
  const noun = count.filter?.cardNames?.length === 1 && !count.filter.cardType
    ? `《${count.filter.cardNames[0]}》`
    : count.filter ? costScalingSigniJa(count.filter) : 'カード';
  return `${own}トラッシュにある${noun}${per}枚`;
}

function costScalingJa(terms: any[]): string {
  const body = terms.map((term, index) => {
    const counts = term.counts.map((count: any) => costScalingCountJa(count, term.per)).join('か');
    const amount = term.amount.map((e: any) => `《${e.color}×${e.count}》`).join('');
    const last = index === terms.length - 1;
    const verb = term.direction === 'increase' ? (last ? '増える' : '増え') : (last ? '減る' : '減り');
    return `${counts}につき${amount}${verb}`;
  }).join('、');
  const gated = terms.find(term => term.minCount !== undefined);
  const gateCount = gated?.counts?.length === 1 && gated.counts[0]?.kind === 'fieldLrig'
    ? `${costScalingCountJa(gated.counts[0], gated.minCount)}以上いるかぎり、`
    : '';
  return `${gateCount}このカードの使用コストは${body}`;
}

function costJa(c?: any): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.energy) parts.push(c.energy.map((e: any) => `《${e.color}×${e.count}》`).join(''));
  // O-119: JSON payload から描く。本文 regex へ戻すと payload 欠落を逆翻訳が隠す。
  if (c.costScaling?.length) parts.push(costScalingJa(c.costScaling));
  // 🆕`exceedColors`（`WX10-001`「エクシード１（白のカード）」）＝描かないと色指定なしと同じ文になり、
  //   engine は区別しているのに原文照合では見えない偽陰性になる。
  if (c.exceed != null) parts.push(`エクシード${c.exceed}${c.exceedColors?.length ? `（${c.exceedColors.join('と')}のカード）` : ''}`);
  if (c.down_self) parts.push('《ダウン》');
  if (c.trash_self) parts.push('このシグニを場からトラッシュに置く');
  if (c.discard != null) {
    if (Array.isArray(c.discardFilter?.story)) {
      parts.push(`手札から${c.discardFilter.story.map((story: string) => `＜${story}＞`).join('か')}のシグニを合計${c.discard}枚捨てる`);
    } else {
      const noun = typeof c.discardFilter?.cardType === 'string' ? c.discardFilter.cardType : 'カード';
      parts.push(c.discardFilter ? `手札から${filterJa(c.discardFilter)}${noun}${c.discard}枚を捨てる` : `手札${c.discard}枚を捨てる`);
    }
  }
  // 🆕§5.3 `O-108`＝`selectionConstraint`（「それぞれ名前の異なる」）を描く。描かないと制約なしと同じ文になり、
  //   engine は区別しているのに原文照合では見えない偽陰性になる（`exceedColors` と同じ理由）。
  if (c.handDiscardSigni) parts.push(`手札から${constraintJa(c.handDiscardSigni.selectionConstraint)}${filterJa(c.handDiscardSigni)}シグニ${c.handDiscardSigni.count}枚を捨てる`);
  if (c.handToEnergy) parts.push(`手札から${filterJa(c.handToEnergy.filter)}シグニ${c.handToEnergy.count}枚をエナゾーンに置く`);
  if (c.handToUnderSelf) parts.push(`手札から${constraintJa(c.handToUnderSelf.selectionConstraint)}${filterJa(c.handToUnderSelf.filter)}カード${c.handToUnderSelf.count}枚をこのシグニの下に置く`);
  // ⚠`filterJa` は cardType を描かない（呼び出し側が名詞を足す規約）。ここが名詞を落としていたため
  //   「手札から《白》の**を**1枚捨てる」と読めない逆翻訳になっていた（続き377k・discardGroups は
  //   シグニ／スペルが混ざる形もある＝群ごとの cardType を使う）。
  if (c.discardGroups) parts.push(c.discardGroups.map((g: any) => `手札から${filterJa(g.filter)}${g.filter?.cardType ?? 'カード'}を${g.count}枚捨てる`).join('＋'));
  if (c.coin != null) parts.push(`コイン${c.coin}`);
  if (c.beat_signi != null) {
    const beat = typeof c.beat_signi === 'number' ? { count: c.beat_signi } : c.beat_signi;
    const excluded = beat.excludeSelf
      ? `《${currentCardName || 'このカードと同じ名前'}》以外の`
      : '';
    parts.push(`${excluded}シグニ${beat.count}体を【ビート】にする`);
  }
  if (c.beat_signi_from_trash) parts.push(`トラッシュから${filterJa(c.beat_signi_from_trash.filter)}シグニ${c.beat_signi_from_trash.count}枚を【ビート】にする`);
  if (c.energyTrash) parts.push(`エナゾーンから${constraintJa(c.energyTrash.selectionConstraint)}${filterJa(c.energyTrash.filter)}カード${c.energyTrash.count}枚をトラッシュに置く`);
  if (c.charmTrash != null) parts.push(`場の【チャーム】${c.charmTrash}枚をトラッシュ`);
  if (c.charmTrashVariable) parts.push('場の【チャーム】を好きな枚数トラッシュ');
  if (c.fieldTrash) parts.push(`場から${c.fieldTrash.excludeSelf ? '他の' : ''}${filterJa(c.fieldTrash.filter)}シグニ${c.fieldTrash.count}体をトラッシュ`);
  if (c.fieldTrashGroups) parts.push(`場から${c.fieldTrashGroups.map((g: any) => `${filterJa(g.filter)}シグニ${g.count}体`).join('と')}をトラッシュ`);
  // fieldBanish: 行き先はエナゾーン＝「トラッシュ」と書き分ける（§5.3 `O-67`）。
  if (c.fieldBanish) parts.push(`${c.fieldBanish.excludeSelf ? '他の' : ''}${filterJa(c.fieldBanish.filter)}シグニ${c.fieldBanish.count}体をバニッシュ`);
  if (c.fieldToLrigTrash) {
    const unit = c.fieldToLrigTrash.filter?.cardType === 'レゾナ' ? 'レゾナ' : 'カード';
    parts.push(`場から${filterJa(c.fieldToLrigTrash.filter)}${unit}${c.fieldToLrigTrash.count}体をルリグトラッシュに置く`);
  }
  if (c.fieldDown) parts.push(`場の${filterJa(c.fieldDown.filter)}シグニ${c.fieldDown.count}体をダウン`);
  // 従来 costJa が lrigDown を知らず、逆翻訳がコストを丸ごと落としていた（続き218）
  if (c.lrigDown) parts.push(`アップ状態の${c.lrigDown.level !== undefined ? `レベル${c.lrigDown.level}の` : ''}${c.lrigDown.centerOnly ? 'センター' : ''}ルリグ${c.lrigDown.count}体をダウンする`);
  if (c.lrigDownVariable) parts.push('アップ状態のルリグを好きな数ダウンする');
  if (c.trashArtsFromLrigDeck) parts.push(`ルリグデッキから${c.trashArtsFromLrigDeck.color ? c.trashArtsFromLrigDeck.color + 'の' : ''}アーツ${c.trashArtsFromLrigDeck.count}枚をルリグトラッシュに置く`);
  if (c.deckTrash != null) parts.push(`デッキの上からカードを${c.deckTrash}枚トラッシュに置く`);
  // 🆕§5.3 `O-201`＝出さないと `コスト:{...}` と生JSONが漏れる（`census:stubs` C群と同じ「表示の穴」）。
  if (c.trashToDeckBottom) parts.push(`トラッシュから${filterJa(c.trashToDeckBottom.filter)}カード${c.trashToDeckBottom.count}枚をデッキの一番下に置く`);
  if (c.underSelfTrash != null) {
    const kind = c.underSelfTrash.filter?.cardType === 'スペル'
      ? 'スペル'
      : c.underSelfTrash.selectionConstraint?.same === 'name' ? '同名のカード' : 'カード';
    parts.push(`このシグニの下から${kind}${c.underSelfTrash.count}枚をトラッシュに置く`);
  }
  if (c.underAnySigniTrash) parts.push(`あなたのシグニの下からカードを合計${c.underAnySigniTrash.count}枚トラッシュに置く`);
  if (c.removeOppVirus != null) parts.push(`対戦相手の場の【ウィルス】${c.removeOppVirus}個を取り除く`);
  // §3タスク6 C: 能力スコープの任意コスト代替（WX07-027-E2）。宣言のみで engine 未実装だが原文を保つ。
  if (c.costSubstitute) {
    const cs = c.costSubstitute;
    const d = cs.discardFromHand;
    parts.push(`《${cs.originalCost.color}》を支払う際、代わりに手札から${filterJa(d?.filter)}シグニを${d?.count ?? 1}枚捨ててもよい`);
  }
  // 「〈盤面条件〉の場合、この能力の発動コストは《X×N》減る」（§6.4 O-35・続き530）。
  // action ではなく cost 側に載る修飾なので、ここで描かないと原文の1文が逆翻訳から丸ごと消える。
  if (c.conditionalEnergyReduction) {
    const cr = c.conditionalEnergyReduction;
    parts.push(`（${condJa(cr.condition)}場合、この能力の発動コストは${cr.energy.map((e: any) => `《${e.color}×${e.count}》`).join('')}減る）`);
  }
  // ── 🆕**残りのコスト語彙を全数埋める**（§5.3 `O-46` の検証で発見）─────────────────────────
  // 🔴**未対応キーは「黙って消える」か、全キーが未対応なら `コスト:{...}` と生JSONを漏らす。**
  //   実測＝live のコストキーのうち **22種が costJa に無く、生JSON漏れが42効果以上**あった
  //   （`trash_key` だけで42件・`WXK04-025-CB-E2` は `コスト:{"trash_key":true,"energyTrashAll":true}` と出ていた）。
  // ⚠**新しいコストキーを `EffectCost` に足したらここにも1行足す**（さもないと逆翻訳が計器として嘘をつく＝§4.3）。
  if (c.trash_key) parts.push('このキーを場からルリグトラッシュに置く');
  if (c.discardAll) parts.push('手札をすべて捨てる');
  if (c.discardSelfFromHand) parts.push('手札からこのカードを捨てる');
  if (c.discardUpTo != null) parts.push(`手札を${c.discardUpTo}枚まで捨てる`);
  if (c.discardVariable) parts.push(`手札から${filterJa(c.discardVariable.filter)}カードを${c.discardVariable.min}枚以上捨てる`);
  if (c.handBottomDeck != null) parts.push(`手札を${c.handBottomDeck}枚デッキの一番下に置く`);
  if (c.handExileSelf) parts.push('手札にあるこのカードをゲームから除外する');
  if (c.fieldExileSelf) parts.push('場にあるこのシグニをゲームから除外する');
  if (c.bounceSelf) parts.push('このシグニを場から手札に戻す');
  if (c.energyTrashAll) parts.push('エナゾーンにあるすべてのカードをトラッシュに置く');
  if (c.energyTrashColorAll) parts.push(`エナゾーンからすべての${c.energyTrashColorAll}のカードをトラッシュに置く`);
  if (c.energyTrashSelf) parts.push('エナゾーンからこのカードをトラッシュに置く');
  if (c.energyTrashGroups) parts.push(`エナゾーンから${c.energyTrashGroups.map((g: any) => `${filterJa(g.filter)}カード${g.count}枚`).join('と')}をトラッシュに置く`);
  if (c.life_crash != null) parts.push(`ライフクロス${c.life_crash}枚をクラッシュする`);
  if (c.lifeTrash != null) parts.push(`ライフクロス${c.lifeTrash}枚をトラッシュに置く`);
  if (c.lifeToHand != null) parts.push(`ライフクロス${c.lifeToHand}枚を手札に加える`);
  if (c.trashExile) {
    parts.push(c.trashExile.self
      ? 'トラッシュにあるこのカードをゲームから除外する'
      : `トラッシュにある${c.trashExile.selectionConstraint?.distinct === 'name' ? 'それぞれ名前の異なる' : ''}${filterJa(c.trashExile.filter)}${([] as string[]).concat(c.trashExile.filter?.cardType ?? []).join('か') || 'カード'}${c.trashExile.count ?? 1}枚をゲームから除外する`);
  }
  if (c.exileLrigFromLrigDeck) parts.push(`ルリグデッキにある${c.exileLrigFromLrigDeck.story ? `＜${c.exileLrigFromLrigDeck.story}＞の` : ''}ルリグ${c.exileLrigFromLrigDeck.count}枚をゲームから除外する`);
  if (c.selfPowerDown != null) parts.push(`このシグニのパワーを${c.selfPowerDown}減らす`);
  if (c.selfToDeckBottom) parts.push('このシグニをデッキの一番下に置く');
  if (c.banish_self) parts.push('このシグニをバニッシュする');
  if (c.acceTrash != null) parts.push(`あなたの【アクセ】${c.acceTrash}枚をトラッシュに置く`);
  if (c.chargeCounterRemove != null) parts.push(`この上からカウンター${c.chargeCounterRemove}つを取り除く`);
  if (c.trapToHand != null) parts.push(`あなたの【トラップ】${c.trapToHand}枚を手札に加える`);
  // `none:true`＝**コストなしの任意効果**（発動するかの確認だけ）。他のキーと同時には立たない。
  if (c.none && parts.length === 0) parts.push('コストなし');
  if (parts.length === 0) return `コスト:${JSON.stringify(c)}`;
  return parts.join('＋');
}

/** `DURING_PHASE.phases` がアタックフェイズ4実値をすべて含むか（＝原文「アタックフェイズの間」）。 */
function isAllAttackPhases(phases?: string[]): boolean {
  const need = ['ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'];
  return !!phases && need.every(p => phases.includes(p));
}

function condJa(c?: any): string {
  if (!c) return '';
  switch (c.type) {
    case 'AND': {
      // WX24-P4-026「1枚が白で、もう1枚が赤か青か緑か黒」＝2枚の割り当て条件を
      // 「白≥1 かつ 他色≥1 かつ 有色ちょうど2枚」の3本で表す（多色シグニが色フィルタ2本を
      // 1枚で満たすため、色を独立に数える形では原文と一致しない）。逆翻訳では原文へ畳む。
      const [a, b, d] = c.conditions ?? [];
      const isLpm = (x: any, op: string, v: number, color: unknown) =>
        x?.type === 'LAST_PROCESSED_MATCHES' && (x.operator ?? 'gte') === op && (x.value ?? x.minCount) === v
        && JSON.stringify(x.filter?.color) === JSON.stringify(color);
      if (c.conditions?.length === 3
          && isLpm(a, 'gte', 1, '白')
          && isLpm(b, 'gte', 1, ['赤', '青', '緑', '黒'])
          && isLpm(d, 'eq', 2, ['白', '赤', '青', '緑', '黒'])) {
        return 'この方法で手札に加えたカード1枚が白で、もう1枚が赤か青か緑か黒';
      }
      return c.conditions.map(condJa).filter(Boolean).join('かつ');
    }
    case 'SAME_ZONE_HAS_GATE': return '同じシグニゾーンに【ゲート】がある';
    case 'SAME_ZONE_HAS_SEED': return '同じシグニゾーンに【シード】がある';
    // ⚠**「アタックした」を落とさない**（2026-08-30 Claude 検証）＝
    //   「このターンにシグニが4回以上」だけだと**何が4回なのか**が読めず、原文照合で差が見えない。
    case 'ATTACK_ORDINAL_THIS_TURN':
      return `このターンに${c.signiOnly ? 'シグニが' : 'ルリグかシグニが'}${numJa(c.value)}回${opJa(c.operator)}アタックしていた`;
    case 'FIELD_HAS_GATE': return `${ownerJa(c.owner)}場に【ゲート】がある`;
    case 'TURN_OWNER': return c.owner === 'opponent' ? '対戦相手のターンの間' : '自分のターンの間';
    // §6.3「正面」サブ機構(d): 効果元シグニの正面（2-zi）を条件にする型。
    case 'FRONT_SIGNI': {
      const fc = c as { filter?: TargetFilter; compareToSelf?: { key: 'level' | 'power'; operator: string } };
      if (fc.compareToSelf) {
        const keyJa = fc.compareToSelf.key === 'level' ? 'レベル' : 'パワー';
        if (fc.compareToSelf.operator === 'eq') return `このシグニの${keyJa}が正面のシグニと同じであるかぎり`;
        return `このシグニより${keyJa}の${fc.compareToSelf.operator === 'gt' ? '高い' : '低い'}シグニがこの正面にあるかぎり`;
      }
      const st = fc.filter?.isFrozen ? '凍結状態の' : fc.filter?.isDown ? 'ダウン状態の' : fc.filter?.isUp ? 'アップ状態の' : '';
      return `このシグニの正面に${st}${filterJa({ ...fc.filter, isFrozen: undefined, isDown: undefined, isUp: undefined })}シグニがあるかぎり`;
    }
    case 'DURING_ATTACK_PHASE': return `${c.owner === 'self' ? 'あなたの' : c.owner === 'opponent' ? '対戦相手の' : ''}アタックフェイズの間`;
    // 🆕§5.3 `O-65`：`DURING_ATTACK_PHASE` の対（【常】のメインフェイズ限定）。
    case 'DURING_MAIN_PHASE': return `${c.owner === 'self' ? 'あなたの' : c.owner === 'opponent' ? '対戦相手の' : ''}メインフェイズの間`;
    case 'FIELD_COUNT': return `${ownerJa(c.owner)}場の${c.filter ? filterJa(c.filter) : ''}シグニが${numJa(c.value)}体${countPredicateJa(c.operator)}`;
    case 'DECK_COUNT': return `${ownerJa(c.owner)}デッキが${numJa(c.value)}枚${opJa(c.operator)}`;
    case 'DECK_COUNT_FILTER': return `${ownerJa(c.owner)}デッキに${filterJa(c.filter)}${c.filter?.cardType ?? 'カード'}が${numJa(c.value)}枚${countPredicateJa(c.operator)}`;
    case 'HAND_COUNT': return c.owner === 'any'
      ? `いずれかのプレイヤーの手札が${numJa(c.value)}枚${countPredicateJa(c.operator)}`
      : `${ownerJa(c.owner)}手札が${numJa(c.value)}枚${countPredicateJa(c.operator)}`;
    case 'HAND_COUNT_FILTER': return `${ownerJa(c.owner)}手札に${c.distinctName ? '名前の異なる' : ''}${filterJa(c.filter)}カードが${numJa(c.value)}枚${countPredicateJa(c.operator)}`;
    case 'LIFE_COUNT': return `${ownerJa(c.owner)}ライフが${numJa(c.value)}${opJa(c.operator)}`;
    case 'LIFE_CRASHED_THIS_TURN': return `このターンに${ownerJa(c.owner)}ライフが${numJa(c.value)}枚${opJa(c.operator)}クラッシュされていた場合`;
    case 'ENERGY_COUNT': return `${ownerJa(c.owner)}エナが${numJa(c.value)}${opJa(c.operator)}`;
    case 'ENERGY_COUNT_FILTER': return c.distinctClasses
      ? `${ownerJa(c.owner)}エナゾーンにあるシグニが持つクラスが合計${numJa(c.value)}種類${opJa(c.operator)}`
      : c.distinctColor
      ? `${ownerJa(c.owner)}エナゾーンにあるカードの色が${numJa(c.value)}種類${opJa(c.operator)}`
      : `${ownerJa(c.owner)}エナゾーンに${c.distinctName ? '名前の異なる' : ''}${filterJa(c.filter)}${typeof c.filter?.cardType === 'string' ? c.filter.cardType : 'カード'}が${numJa(c.value)}枚${opJa(c.operator)}ある`;
    // 「エナゾーンにレベルA～Bの＜X＞のシグニがそれぞれN枚以上ある場合」（§5c・従来は英語ID漏れ）
    case 'ENERGY_EACH_LEVEL_FILTER_GTE': {
      const lv = (c.levels ?? []) as number[];
      const band = lv.length > 1 && lv[lv.length - 1] - lv[0] === lv.length - 1
        ? `レベル${numJa(lv[0])}～${numJa(lv[lv.length - 1])}` : `レベル${lv.map(numJa).join('と')}`;
      return `${ownerJa(c.owner)}エナゾーンに${band}の${filterJa(c.filter)}${typeof c.filter?.cardType === 'string' ? c.filter.cardType : 'カード'}がそれぞれ${numJa(c.minEach)}枚以上ある`;
    }
    case 'ENERGY_HAS_COLOR': return `${ownerJa(c.owner)}エナゾーンに${(c.colors || []).map((col: string) => `《${col}》のカード`).join('と')}がある`;
    case 'LRIG_NAME_CONTAINS': return `${ownerJa(c.owner)}センタールリグ名が「${c.name}」を含む`;
    case 'LRIG_COLOR': return `${ownerJa(c.owner)}センタールリグが${c.color}`;
    case 'LRIG_LEVEL': return `${ownerJa(c.owner)}センタールリグがレベル${numJa(c.value)}${opJa(c.operator)}`;
    case 'FIELD_CLASS_COUNT': return `${ownerJa(c.owner)}場に＜${c.story}＞が${numJa(c.value)}体${countPredicateJa(c.operator)}`;
    case 'LRIG_TEAM_COUNT': return `${ownerJa(c.owner)}場に＜${c.team}＞のルリグが${numJa(c.value)}体${opJa(c.operator)}`;
    case 'FIELD_LEVEL_SUM': {
      const target = c.target === 'lrig'
        ? (c.lrigRole === 'assist' ? 'アシストルリグ' : c.lrigRole === 'center' ? 'センタールリグ' : 'ルリグ')
        : 'シグニ';
      const metric = c.metric === 'power' ? 'パワー' : 'レベル';
      const subject = `${ownerJa(c.owner)}場にある${target}の${metric}の合計`;
      if (c.parity) return `${subject}が${c.parity === 'odd' ? '奇数' : '偶数'}`;
      return c.compareTo === 'opponent'
        ? `${subject}が対戦相手の場にある${target}の${metric}の合計${opJa(c.operator)}`
        : `${subject}が${numJa(c.value)}${opJa(c.operator)}`;
    }
    case 'TRASH_HAS_CARD':
      if (c.distinctClasses)
        return `${ownerJa(c.owner)}トラッシュにあるシグニが持つクラスが合計${numJa(c.minCount ?? 1)}種類以上ある`;
      // 「トラッシュにカード名に《X》を含むカードがある」（WX20-065）
      if (c.filter?.cardName)
        return `${ownerJa(c.owner)}トラッシュにカード名に《${c.filter.cardName}》を含む${c.filter?.cardType ?? 'カード'}が${c.minCount && c.minCount > 1 ? numJa(c.minCount) + '枚以上' : ''}ある`;
      return `${ownerJa(c.owner)}トラッシュに${c.distinctName ? 'それぞれ名前の異なる' : ''}${filterJa(c.filter)}${c.filter?.cardType ?? 'カード'}が${c.minCount && c.minCount > 1 ? numJa(c.minCount) + (c.distinctName ? '種類以上' : '枚以上') : ''}ある`;
    case 'SIGNI_RETURNED_TO_HAND_THIS_TURN': return c.minCount && c.minCount > 1 ? `このターンにシグニが${numJa(c.minCount)}体以上場から手札に戻っていた` : 'このターンにシグニが場から手札に戻っていた';
    case 'ARTS_USED_THIS_TURN': {
      const artsCondition = c as { color?: string; minCount?: number; exactCount?: number };
      // exactCount＝「N枚目のアーツだった場合」＝**ちょうどN枚目**（minCount の「N回以上」とは別物）。
      if (artsCondition.exactCount !== undefined) return `それがこのターンに${c.owner === 'opponent' ? '対戦相手' : 'あなた'}が使用した${numJa(artsCondition.exactCount)}枚目のアーツだった`;
      return `このターンに${c.owner === 'opponent' ? '対戦相手' : 'あなた'}が${artsCondition.color ? `${artsCondition.color}の` : ''}アーツを${(artsCondition.minCount ?? 1) > 1 ? `${numJa(artsCondition.minCount!)}回以上` : ''}使用していた`;
    }
    case 'SPELL_USED_THIS_TURN':
      // exactCount＝「N枚目のスペルだった場合」＝**ちょうどN枚目**（minCount の「N枚以上」とは別物）。
      if (c.exactCount !== undefined) return `それがこのターンに${c.owner === 'opponent' ? '対戦相手' : 'あなた'}が使用した${numJa(c.exactCount)}枚目のスペルだった`;
      return `このターンに${c.owner === 'opponent' ? '対戦相手' : 'あなた'}がスペルを${c.minCount && c.minCount > 1 ? `${numJa(c.minCount)}枚以上` : ''}使用していた`;
    case 'TRASH_COUNT': return `${ownerJa(c.owner)}トラッシュにカードが${numJa(c.value)}枚${opJa(c.operator)}`;
    case 'LAST_PROCESSED_HAS_BURST': return `そのカードが【ライフバースト】を${c.negate ? '持たない' : '持つ'}`;
    case 'LAST_PROCESSED_HAS_TYPE': return `この方法でトラッシュに置いたカードの中に${c.cardType}がある`;
    case 'LAST_PROCESSED_LEVEL_EQ_FRONT_SIGNI': return 'それがこのシグニの正面のシグニとレベルが同じ';
    case 'LAST_PROCESSED_SHARE_COLOR': return 'それらがそれぞれ共通する色を持つ';
    case 'FIELD_LRIGS_SHARE_COLOR': return `${ownerJa(c.owner)}場に共通する色を持つルリグが${numJa(c.minCount)}体以上いる`;
    case 'HAS_CARD_IN_FIELD':
      // 🔴**`negate` を表示していなかった**（2026-08-30 実測）＝JSON は「**ない**場合」なのに
      //   逆翻訳が「いるなら」と**真逆**に出ていた。速いレーンの検証は逆翻訳の目視なので致命的。
      //   ⚠この節は分岐が多いので、**先頭で否定形を1本に畳む**（各枝に付け足すと必ず漏れる）。
      if (c.negate) {
        const inner = condJa({ ...c, negate: undefined });
        return inner.endsWith('いる') ? `${inner.slice(0, -2)}いない`
          : inner.endsWith('ある') ? `${inner.slice(0, -2)}ない` : `${inner}ではない`;
      }
      // 「場に《X》がいる」（X はルリグ名等の特定カード名）＝名前のみのフィルタは「シグニ」を付けない
      if (c.filter?.cardName && !c.filter?.cardType && !c.filter?.story && !c.filter?.color)
        return `${ownerJa(c.owner)}場に《${c.filter.cardName}》がいる`;
      // 「場にレベルN以上のルリグがいる」（ルリグゾーン走査・WX24-P4-061/068）
      // ⚠ cardType は配列形もある（`['ルリグ','アシストルリグ']`＝アシストを含めてルリグとして数える形。
      //   続き385 の WXDi-P00-002-E1）。文字列比較だけだと既定の「シグニ」枝へ落ちて逆翻訳が嘘になる。
      if (Array.isArray(c.filter?.cardType)
        ? c.filter!.cardType.every((t: string) => t.includes('ルリグ'))
        : c.filter?.cardType === 'ルリグ') {
        const lrigFilter = Array.isArray(c.filter?.color)
          ? c.filter.color.map((color: string) => `《${color}》`).join('か') + 'の'
          : filterJa(c.filter);
        const lrigCount = c.minCount && c.minCount > 1 ? `${numJa(c.minCount)}体以上` : '';
        return `${ownerJa(c.owner)}場に${lrigFilter}ルリグが${lrigCount}いる`;
      }
      if (c.filter?.cardType === 'キー')
        return `${ownerJa(c.owner)}場にキーがある`;
      if (c.distinctColors)
        return `${ownerJa(c.owner)}場にある${c.excludeSelf ? '他の' : ''}${filterJa(c.filter)}シグニが持つ色が合計${numJa(c.minCount ?? 1)}種類以上ある`;
      if (c.distinctClasses)
        return `${ownerJa(c.owner)}場にあるシグニが持つクラスが${c.excludeClasses?.length ? c.excludeClasses.map((x: string) => `＜${x}＞`).join('と') + 'を除いて' : ''}合計${numJa(c.minCount ?? 1)}種類以上ある`;
      if (c.distinctLevels && c.distinctPhraseJa === 'kinds')
        return `${ownerJa(c.owner)}場にあるシグニが持つレベルが合計${numJa(c.minCount ?? 1)}種類以上ある`;
      // 「場にカード名に《X》を含むシグニがいる」（WX20-076）
      if (c.filter?.cardName && c.filter?.cardType === 'シグニ')
        return `${ownerJa(c.owner)}場にカード名に《${c.filter.cardName}》を含むシグニがいる`;
      // distinctPhraseJa:'kinds' は同じ述語（名前の異なる数）の別語形「＜C＞のシグニがN種類以上ある」＝
      // 原文どおりに戻す（既定の「それぞれ名前の異なる〜がN体いる」形＝WX12-Re01 と意味は同一）
      if (c.distinctNames && c.distinctPhraseJa === 'kinds')
        return `${ownerJa(c.owner)}場に${filterJa(c.filter)}シグニが${numJa(c.minCount ?? 1)}種類以上ある`;
      // ⚠**`distinctLevels` を描く**（段2 第42バッチ）＝engine（execUtils:1836）は「一致シグニの**レベルの種類数**」を
      //   minCount と比べているのに逆翻訳は体数条件に丸めており、`WXK08-027-E1`「あなたの場にそれぞれレベルの
      //   異なるシグニが３体ある場合」が**ただの3体以上**に見えて原文照合で気づけなかった。
      return `${ownerJa(c.owner)}場に${c.excludeSelf ? '他の' : ''}${c.distinctNames ? 'それぞれ名前の異なる' : ''}${c.distinctLevels ? 'それぞれレベルの異なる' : ''}${filterJa(c.filter)}${(c.filter?.isResona || c.filter?.cardType === 'レゾナ') ? 'レゾナ' : 'シグニ'}が${c.minCount && c.minCount > 1 ? numJa(c.minCount) + '体以上' : ''}いる`;
    // 🆕minCount（2026-08-31・`WX20-040-E2`）＝「N枚以上」まで描く（逆翻訳は必ず JSON のフィールドから描く）。
    case 'HAS_TRAP_IN_FIELD': return `${ownerJa(c.owner)}場に【トラップ】が${(c.minCount ?? 1) > 1 ? `${c.minCount}枚以上` : ''}${c.negate ? 'ない' : 'ある'}`;
    case 'HAS_KEY_IN_FIELD': return c.operator && c.value !== undefined
      ? `${ownerJa(c.owner)}場にキーが${numJa(c.value)}枚${opJa(c.operator)}`
      : `${ownerJa(c.owner)}場にキーがある`;
    case 'ENERGY_HAS_CARD': return `${ownerJa(c.owner)}エナゾーンに${filterJa(c.filter)}${c.filter?.cardType === 'シグニ' ? 'シグニ' : 'カード'}が${c.minCount && c.minCount > 1 ? numJa(c.minCount) + '枚以上' : ''}ある`;
    case 'PAID_ADDITIONAL_COST': return '（コストを支払った場合）';
    case 'CARDS_DRAWN_BY_EFFECT': return `このターン効果で${numJa(c.value)}枚${opJa(c.operator)}引いた`;
    case 'COINS_PAID_THIS_TURN': return `このターンに${c.owner === 'opponent' ? '対戦相手' : 'あなた'}が《コイン》を合計${numJa(c.value)}枚${opJa(c.operator)}支払っていた`;
    case 'HAND_TRASHED_BY_OPP':   return `このターンに対戦相手の効果によってあなたの手札からカードが${numJa(c.value)}枚以上トラッシュに移動していた`;
    case 'ENERGY_TRASHED_BY_OPP': return `このターンに対戦相手の効果によってあなたのエナゾーンからカードが${numJa(c.value)}枚以上トラッシュに移動していた`;
    case 'IS_MY_TURN': return '自分のターンの間';
    case 'IS_OPPONENT_TURN': return '対戦相手のターンの間';
    case 'IS_BETTING': return c.minCoins != null
      ? `あなたが《コイン》${c.minCoins}枚以上ベットしてい${c.negate ? 'なかった' : 'た'}`
      : `あなたがベットしてい${c.negate ? 'なかった' : 'た'}`;
    case 'DECK_TOP_MATCHES': return `${ownerJa(c.owner)}デッキの一番上が${filterJa(c.filter)}${typeof c.filter?.cardType === 'string' ? c.filter.cardType : 'カード'}`;
    case 'DECK_TOP_SHARES_COLOR_WITH_LRIG': return `${ownerJa(c.owner)}場にそのカードと共通する色を持つルリグがいる`;
    case 'THIS_CARD_PLACED_BY_CLASS': return c.cardClass
      ? `このシグニが＜${c.cardClass}＞のシグニの効果によって場に出ていた`
      : c.sourceCardTypes?.length
        ? `このシグニが${c.sourceCardTypes.join('か')}の効果によって場に出ていた`
        : 'このターンにあなたの効果によってこのシグニが場に出ていた';
    case 'THIS_CARD_FROM_DECK': return 'このシグニがデッキから場に出ていた';
    case 'OR': return c.conditions.map(condJa).join('か');
    case 'LAST_PROCESSED_SHARES_COLOR_WITH_LRIG': return `それが${ownerJa(c.owner)}センタールリグと共通する色を持つ`;
    case 'FIELD_SIGNI_ALL_DISTINCT_CLASS': return `${ownerJa(c.owner)}場にあるすべてのシグニがそれぞれ共通するクラスを持たない`;
    case 'LAST_PROCESSED_COUNT_GTE': {
      if (c.verbJa === '__internal__') return '';
      if (c.negate && c.verbJa === '捨てた') return `この方法で手札を${numJa(c.value)}枚捨てなかった`;
      if (c.negate && c.verbJa === 'チャームをトラッシュに置いた') return `この方法で【チャーム】${numJa(c.value)}枚がトラッシュに置かれなかった`;
      if (c.negate && c.verbJa === '手札に加えた') return `この方法でカードを${numJa(c.value)}枚も手札に加えていない`;
      if (c.verbJa === 'このシグニをバニッシュしていた') return 'この効果でこのシグニをバニッシュしていた';
      return `この方法でカードを${numJa(c.value)}枚${c.omitGteJa ? '' : '以上'}${c.verbJa ?? '処理した'}`;
    }
    case 'LAST_PROCESSED_SIGNI_LEVEL_PARITY_DIFFERS_FROM_DECLARED':
      return 'この方法で公開されたシグニのレベルが宣言と異なる';
    case 'LRIG_STORY': return `${ownerJa(c.owner)}センタールリグが＜${c.story}＞`;
    case 'LRIG_LEVEL_EQ_OPP': return '自分と対戦相手のセンタールリグのレベルが同じ';
    case 'LRIG_LEVEL_CMP_OPP': return `自分のセンタールリグのレベルが対戦相手のセンタールリグ${c.operator === 'lt' ? 'より低い' : c.operator === 'lte' ? '以下' : c.operator === 'gt' ? 'より高い' : '以上'}`;
    case 'LRIG_TRASH_COUNT': {
      const rawCardType = c.cardType ?? c.filter?.cardType;
      const cardType = Array.isArray(rawCardType)
        ? (rawCardType.includes('ルリグ') && rawCardType.includes('アシストルリグ') ? 'ルリグ' : rawCardType.join('または'))
        : (rawCardType ?? 'カード');
      return `ルリグトラッシュに${filterJa(c.filter)}${cardType}が${numJa(c.value)}枚${opJa(c.operator)}`;
    }
    case 'SUBSCRIBER_COUNT': return `登録者数が${numJa(c.value)}万${opJa(c.operator)}`;
    case 'CHARM_COUNT': return `${ownerJa(c.owner)}場の【チャーム】が${numJa(c.value)}枚${opJa(c.operator)}`;
    // ⚠チーム名を名指ししない形（「場にいるルリグN体が**同じチーム**の場合」）。`LRIG_TEAM_COUNT` と違い team を持たない。
    case 'LRIG_ANY_TEAM_COUNT': return `${ownerJa(c.owner)}場にいるルリグ${numJa(c.value)}体が同じチーム`;
    // §5.3 `O-81`：「この方法で（シグニを）公開したとき」＝離脱で裏向き付けカードが公開されたか。
    case 'FACEDOWN_REVEALED_JUST': return `この方法で${filterJa(c.filter)}${c.filter?.cardType ?? 'カード'}を公開した`;
    case 'SELF_POWER_GTE': return `このシグニのパワーが${numJa(c.value)}${opJa(c.operator ?? 'gte')}`;
    // タスク12(cxvii)：実効レベル（動的レベル込み）の閾値。`condJa` は Condition と ActiveCondition の
    // **両方**を1つの switch で描くので、同名の型は**ここ1箇所だけ**に書く（二重 case は lint error）。
    case 'SELF_LEVEL_THRESHOLD': return `このシグニのレベルが${numJa(c.value)}${opJa(c.operator)}`;
    case 'THIS_CARD_FROM_TRASH': return 'このシグニがトラッシュから場に出た';
    case 'FIELD_SIGNI_POWER_COUNT': return `${ownerJa(c.owner)}場にパワー${c.minPower}以上のシグニが${numJa(c.value)}体${opJa(c.operator)}`;
    case 'LIFE_COMPARE_OPP': {
      const value = c.value ?? 0;
      if (value < 0 && c.operator === 'lte') return `自分のライフクロスが対戦相手より${numJa(-value)}枚以上少ない`;
      if (value > 0 && c.operator === 'gte') return `自分のライフクロスが対戦相手より${numJa(value)}枚以上多い`;
      if (value === 0 && c.operator === 'eq') return '自分と対戦相手のライフクロスの枚数が同じ';
      return `自分のライフクロスが対戦相手${opJa(c.operator)}`;
    }
    case 'HAND_COMPARE_OPP': return `自分の手札が対戦相手${opJa(c.operator)}`;
    case 'ENERGY_COMPARE_OPP': return `自分のエナが対戦相手${opJa(c.operator)}`;
    // 🆕別ゾーンどうしの枚数比較（2026-08-30 §5.2 カード単位バッチ第3回）。
    case 'ZONE_COUNT_COMPARE': {
      const zoneJa: Record<string, string> = { hand: '手札', energy: 'エナ', trash: 'トラッシュ', deck: 'デッキ', field: '場', lrig_trash: 'ルリグトラッシュ', check: 'チェックゾーン' };
      const side = (z: { zone: string; owner: string }) => `${z.owner === 'opponent' ? '対戦相手' : '自分'}の${zoneJa[z.zone] ?? z.zone}の枚数`;
      // offset＝右辺の下駄（「対戦相手より2体以上少ない」＝ left <= right-2）。落とすと逆翻訳から差が消える。
      const off = (c as { offset?: number }).offset ?? 0;
      const rightJa = off === 0 ? side(c.right) : `${side(c.right)}より${numJa(Math.abs(off))}${off < 0 ? '少ない数' : '多い数'}`;
      if (c.operator === 'eq') return `${side(c.left)}と${rightJa}が同じ`;
      return `${side(c.left)}が${rightJa}${countPredicateJa(c.operator)}`;
    }
    case 'EFFECTIVE_LRIG_LIMIT_GTE': return `このルリグのリミットが${numJa(c.value)}以上`;
    case 'DURING_PHASE': {
      // アタックフェイズの4実値がそろっていれば「アタック」1語に畳む（列挙のまま出すと読めない）
      if (isAllAttackPhases(c.phases)) return 'アタックフェイズの間';
      // ⚠`ATTACK_SIGNI_OP` は `TurnPhase` に存在しない値＝条件が常に false になる死語だった（唯一の産出元 WX05-013-E2 は
      //   timing:'ON_OPP_SIGNI_ATTACK' へ移した。Opusタスク12(cx)）。復活させないようマップからも外す。
      const phaseJaMap: Record<string, string> = { MAIN: 'メイン', ATTACK: 'アタック' };
      return `${(c.phases || []).map((p: string) => phaseJaMap[p] ?? p).join('/')}フェイズの間`;
    }
    case 'OPP_SIGNI_ATTACKING': return '対戦相手のシグニ１体がアタックしている';
    case 'THIS_CARD_IN_LOCATION': return `このカードが${c.location}にある`;
    case 'THIS_CARD_IN_CENTER_ZONE': return 'このシグニが中央ゾーンにある';
    case 'THIS_CARD_IS_DOWN': return 'このシグニがダウンしている';
    case 'THIS_CARD_IS_UP': return 'このシグニがアップ状態';
    case 'CENTER_LRIG_IS_UP': return 'あなたのセンタールリグがアップ状態';
    case 'THIS_CARD_IS_ARMORED': return 'このシグニが血晶武装状態';
    case 'THIS_CARD_IS_AWAKENED': return 'このシグニが覚醒状態';
    case 'ALL_FIELD_SIGNI_MATCH': {
      const cls = c.filter?.isFrozen ? '凍結状態'
        : c.filter?.isPuppet ? '傀儡状態'
        : c.filter?.isDisona ? '《ディソナアイコン》'
        : c.filter?.story ? `＜${c.filter.story}＞`
        : c.filter?.cardName ? `《${c.filter.cardName}》`
        : filterJa(c.filter);
      return `${ownerJa(c.owner)}場にあるすべてのシグニが${cls}`;
    }
    case 'THIS_CARD_IS_ACCED': return c.minCount && c.minCount > 1
      ? `このシグニにカードが${numJa(c.minCount)}枚以上アクセされている`
      : 'このシグニに【アクセ】が付いている';
    case 'SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE': {
      const who = c.owner === 'opponent' ? '対戦相手' : 'あなた';
      const cls = c.filter?.story ? `＜${c.filter.story}＞の` : '';
      return `そのアタックフェイズの間に${who}の${cls}シグニが場を離れていた`;
    }
    case 'THIS_CARD_HAS_ATTACHED': return `このシグニにカードが${(c.minCount ?? 1) > 1 ? `${c.minCount}枚以上` : ''}付いている`;
    case 'ZONE_SUM_COUNT': {
      const zonesJa = c.zones.map(z => countFromZoneJa(z)).join('と');
      return `${zonesJa}の合計が${numJa(c.value)}${opJa(c.operator)}`;
    }
    case 'CENTER_LRIG_ATTACKED_THIS_TURN': return `このターン${c.owner === 'opponent' ? '対戦相手の' : 'あなたの'}センタールリグがアタックしてい${c.negate ? 'なかった' : 'た'}`;
    case 'THIS_CARD_HAS_UNDER': {
      const n = (c.minCount ?? 1) > 1 ? `${numJa(c.minCount!)}枚以上` : '';
      const subj = c.subject === 'lrig' ? 'このルリグ' : 'このシグニ';
      return c.filter
        ? `${subj}の下に${filterJa(c.filter)}${c.filter?.cardType === 'シグニ' ? 'シグニ' : 'カード'}が${n}${c.negate ? '無い' : 'ある'}`
        : `${subj}の下にカードが${n}${c.negate ? '無い' : 'ある'}`;
    }
    case 'FIELD_ATTACHED_COUNT': {
      const who = c.owner === 'any' ? '' : c.owner === 'opponent' ? '対戦相手の' : 'あなたの';
      const kind = c.include ?? 'both';
      const what = kind === 'attached' ? '場のシグニに付いているカード'
        : kind === 'under' ? '場のシグニの下にあるカード'
          : kind === 'soul' ? '場の【ソウル】'
            : kind === 'zone' ? 'シグニゾーンにあるカード'
              : '場のシグニに付いているカードとシグニの下にあるカードの合計';
      // ⚠語尾に「ある」を付ける＝呼び出し側が `${cond}場合` / `${cond}なら` を続けるので、
      //   これが無いと「…が1枚以上場合」という壊れた文になる。
      return `${who}${what}が${numJa(c.value)}枚${opJa(c.operator)}ある`;
    }
    case 'IS_DRIVE_STATE': return 'このシグニがドライブ状態';
    case 'TURN_HAND_DISCARD_GTE': return `このターン${c.owner === 'opponent' ? '対戦相手が' : ''}手札を${numJa(c.value)}枚以上捨てている`;
    case 'SIGNI_BANISHED_THIS_TURN': return `このターン${c.owner === 'opponent' ? '対戦相手の' : 'あなたの'}シグニが${numJa(c.minCount ?? 1)}体以上バニッシュされていた`;
    // 🆕`filter` を描かないと「＜ブルアカ＞の」限定が逆翻訳から消える（2026-08-31 続き748）。
    case 'SELF_DECK_TO_TRASH_THIS_TURN': return `このターン${c.owner === 'opponent' ? '対戦相手の' : 'あなたの'}デッキから${c.filter ? filterJa(c.filter) : ''}カードが${numJa(c.minCount ?? 1)}枚以上トラッシュに置かれていた`;
    // 🆕2026-08-31 続き748＝公開領域／由来ゾーン。JSON にあるのに逆翻訳へ出ないと「条件が落ちた」ように読める。
    case 'PUBLIC_ZONE_MATCH': {
      // ⚠`filterJa` は cardType を描かないので名詞はここで足す（「シグニであるカード」が原文の言い方）。
      const nounPZ = (f?: any) => ([] as string[]).concat(f?.cardType ?? []).join('か') || 'カード';
      return c.mode === 'all'
        ? `あなたの公開領域にある${filterJa(c.subjectFilter)}${nounPZ(c.subjectFilter)}がすべて${filterJa(c.filter)}${nounPZ(c.filter)}である`
        : `${c.owner === 'opponent' ? '対戦相手' : 'あなた'}の公開領域に${filterJa(c.subjectFilter)}${filterJa(c.filter)}${nounPZ(c.subjectFilter)}が${numJa(c.minCount ?? 1)}枚以上ある`;
    }
    case 'THIS_CARD_FROM_ZONE_THIS_TURN': return `このターンにこのシグニが${(c.zones ?? []).map((z: string) => ({ hand: '手札', deck: 'デッキ', trash: 'トラッシュ', energy: 'エナゾーン' } as Record<string, string>)[z] ?? z).join('か')}から場に出ていた`;
    case 'TRIGGER_SOURCE_MATCHES': return `それが${filterJa(c.filter)}カードである`;
    case 'HAND_DISCARDED_THIS_TURN': return `このターン${c.owner === 'opponent' ? '対戦相手が' : 'あなたが'}手札から${c.filter ? filterJa(c.filter) : ''}カードを${numJa(c.minCount ?? 1)}枚以上捨てていた`;
    // ── §3 タスク6「代わりに」B1残
    case 'THIS_CARD_UPPED_FROM_DOWN_THIS_TURN': return 'このターンにこのシグニが効果によってダウン状態からアップしていた';
    case 'OPP_CARDS_MOVED_TO_DECK_THIS_TURN': return `このターンに対戦相手のカードがあなたの効果によって${numJa((c as { value: number }).value)}枚以上デッキに移動していた`;
    case 'SELF_DECK_TO_ENERGY_THIS_TURN': return `このターンにあなたのデッキからカードが${numJa((c as { value: number }).value)}枚以上エナゾーンに移動していた`;
    case 'SELECTED_COLOR': return `${(c as { color: string }).color}を選んだ`;
    // 🆕§5.3 `O-143`＝チェックゾーンの枚数（`field.check` ＋ `field.check_rest` の合計）。
    // 🆕filter＝「チェックゾーンにあるスペルが」のようにカード種別で絞る（落とすと逆翻訳から限定が消える）。
    case 'CHECK_ZONE_COUNT': return `${ownerJa(c.owner)}チェックゾーンにある${filterJa(c.filter)}カードが${numJa(c.value)}枚${opJa(c.operator)}`;
    case 'BEAT_ZONE_COUNT': return `${c.thisWay ? 'この方法で' : ''}あなたの【ビート】が${numJa(c.value)}枚${c.operator === 'lte' ? '以下' : c.operator === 'eq' ? 'になった' : opJa(c.operator)}`;
    case 'COST_TRASHED_PUPPET': return 'この能力のコストで傀儡状態のシグニをトラッシュに置いた';
    case 'COST_DISCARDED_SIGNI_LEVEL': return `このコストでレベル${numJa((c as { level: number }).level)}のシグニを捨てた`;
    case 'COST_TRASHED_MATCHES': {
      // §3タスク6 C: 「このコストで<filter>を捨てた／トラッシュに置いた」
      const cm = c as { filter?: TargetFilter; verbJa?: 'discard' | 'trash'; minCount?: number; distinctColors?: boolean };
      // minCount（§6.4 O-35）＝枚数閾値形「この方法でカードをN枚以上トラッシュに置いた」。
      // filter が空＝カード種別を問わないので「シグニ」を付けない（付けると原文と別物になる）。
      if (cm.minCount !== undefined) {
        if (cm.distinctColors) return `この方法でトラッシュに置いたカードが持つ色が合計${numJa(cm.minCount)}種類以上ある`;
        return `この方法で${filterJa(cm.filter)}カードを${numJa(cm.minCount)}枚以上トラッシュに置いた`;
      }
      return `このコストで${filterJa(cm.filter)}${cm.filter?.cardType === 'スペル' ? 'スペル' : 'シグニ'}を${cm.verbJa === 'trash' ? 'トラッシュに置いた' : '捨てた'}`;
    }
    case 'ACTIVATED_DISCARD_COUNT_GTE': return `直前の起動コストで${numJa(c.value)}枚以上捨てた`;
    case 'OPP_LIFE_CRASH_EVENT_GTE': return `相手ライフを同時に${numJa(c.value)}枚以上クラッシュした`;
    case 'HAS_BOND': return `${c.cardName ? '「' + c.cardName + '」' : 'このカード'}との絆を獲得している`;
    case 'OPPONENT_NOT_PAID': return '対戦相手が任意コストを支払わなかった';
    case 'SELF_OPTIONAL_EFFECT_TAKEN': return '自分が任意効果を実行した';
    case 'NOT_PLAYED_NON_DISSONA_SPELL_THIS_TURN': return 'このターン《ディソナ》以外のスペルを使用していない';
    case 'LAST_PROCESSED_LEVEL_SUM': return `直前に処理したシグニのレベル合計が${numJa(c.value)}${opJa(c.operator)}`;
    case 'TRASHED_DISTINCT_LEVELS_GTE': return c.allSameLevel
      ? 'この方法でトラッシュに置かれたシグニのレベルがすべて同じ'
      : c.allSigniDistinct
        ? 'この方法でトラッシュに置かれたすべてのカードの中に同じレベルを持つシグニがない'
        : `この方法でそれぞれレベルの異なるシグニが${numJa(c.count)}体トラッシュに置かれた`;
    case 'TRASHED_STORY_COUNT_GTE': return `この方法で${numJa(c.count)}体の＜${c.story}＞のシグニがトラッシュに置かれた`;
    case 'LAST_PROCESSED_POWER_GTE': return `直前に選んだシグニのパワー${c.addDelta ? `（+${c.addDelta}後）` : ''}が${numJa(c.value)}以上`;
    // §5.3 `O-166`＝「**この効果によって**それのパワーが０以下になった場合」＝パワー減少の did-it ゲート。
    // ⚠上の GTE と基準が違う（あちらは POWER_MODIFY 適用**前**＋`addDelta`、こちらは `temp_power_mods` 込みの**適用後**）
    // ので、訳し分けて「この効果によって」を明示する。
    case 'LAST_PROCESSED_POWER_LTE':
      return c.value === 0
        ? 'この効果によってそれのパワーが0以下になった'
        : `この効果によってそれのパワーが${numJa(c.value)}以下になった`;
    case 'LAST_PROCESSED_MATCHES': {
      const value = c.value ?? c.minCount ?? 1;
      const op = c.operator ?? 'gte';
      const threshold = `${numJa(value)}${c.distinctName ? '種類' : '枚'}${op === 'gte' ? '以上' : op === 'lte' ? '以下' : ''}`;
      if (c.requiredCardNames) return `この方法で${c.requiredCardNames.map((n: string) => `《${n}》`).join('と')}を${c.verbJa ?? '処理した'}`;
      if (c.requiredDistinctColors) {
        const slots = c.requiredDistinctColors.map((slot: string | string[]) => Array.isArray(slot) ? slot.join('か') : slot);
        return `この方法で${c.verbJa ?? '処理した'}カードの1枚が${slots[0]}で、もう1枚が${slots[1]}（別々のカード）`;
      }
      if (c.shareClass) return op === 'lt' && value === 2
        ? `この方法で${c.verbJa ?? '処理された'}カードが共通するクラスを持たない`
        : `この方法で共通するクラスを持つカード${numJa(value)}枚を${c.verbJa ?? '処理した'}`;
      if (c.shareLevel) return `この方法で共通するレベルを持つシグニが${numJa(value)}枚以上処理された`;
      if (c.levelLteCenterLrig) return `この方法であなたのセンタールリグのレベル以下のシグニが${c.verbJa ?? '処理された'}`;
      if (c.verbJa === '公開された' && value === 1 && op === 'gte' && c.filter?.cardType === 'シグニ') {
        const revealedNoun = c.filter.hasCrossIcon ? '《クロスアイコン》を持つシグニ'
          : Array.isArray(c.filter.cardClass) ? `${c.filter.cardClass.map((s: string) => `＜${s}＞`).join('か')}のシグニ`
          : c.filter.cardClass ? `＜${c.filter.cardClass}＞のシグニ`
          : `${filterJa(c.filter)}シグニ`;
        return `この方法で公開されたカードが${revealedNoun}である`;
      }
      if (c.verbJa === '手札に加えた' && c.filter?.color && c.filter?.cardType === 'シグニ') return `この方法で${[].concat(c.filter.color).join('か')}のシグニを手札に加えた`;
      if (c.verbJa) {
        const subject = c.filter?.hasIcon ? `《${c.filter.hasIcon}アイコン》を持つカード`
          : c.filter?.color && c.filter?.story && c.filter?.cardType === 'シグニ'
            ? `${[].concat(c.filter.color).join('か')}の${[].concat(c.filter.story).map((s: string) => `＜${s}＞`).join('か')}のシグニ`
          : c.filter?.color && c.filter?.cardType === 'シグニ' ? `${[].concat(c.filter.color).join('か')}のシグニ`
          : Array.isArray(c.filter?.story) && c.filter?.cardType === 'シグニ' ? `${c.filter.story.map((s: string) => `＜${s}＞`).join('か')}のシグニ`
          : c.filter?.cardType === 'スペル' ? 'スペル'
          : `${filterJa(c.filter)}${c.filter?.cardType === 'シグニ' ? 'シグニ' : 'カード'}`;
        if (c.verbJa === '捨てた') return `この方法で${subject}を${threshold}捨てた`;
        return `この方法で${subject}が${threshold}${c.verbJa}`;
      }
      return `この方法で${filterJa(c.filter)}${c.filter?.isResona ? 'レゾナ' : (c.filter?.cardType ?? 'カード') === 'シグニ' ? 'シグニ' : (c.filter?.cardType ?? 'カード')}を${threshold}${c.verbJa ?? '処理した'}`;
    }
    case 'LAST_PROCESSED_ALL_MATCH': return `この方法で処理したカードがすべて${filterJa(c.filter)}${(c.filter?.cardType ?? 'カード') === 'シグニ' ? 'シグニ' : (c.filter?.cardType ?? 'カード')}`;
    case 'ENERGY_TRASH_COLOR_COUNT_GTE': return `この方法で指定色のカードが${numJa(c.value)}枚以上トラッシュに置かれた`;
    case 'BEAT_CONDITION': return `あなたの【ビート】が${c.condText ?? ''}`;
    case 'COND_STUB': return `[条件STUB:${c.raw ?? ''}]`;
    // ── ActiveCondition（CONTINUOUS の activeCondition）系 ──
    case 'COUNT_THRESHOLD': {
      const loc = ({ hand: '手札', trash: 'トラッシュ', energy: 'エナ', deck: 'デッキ', life_cloth: 'ライフ', lrig_deck: 'ルリグデッキ', lrig_trash: 'ルリグトラッシュ' } as Record<string, string>)[c.location] ?? c.location;
      return c.color
        ? `${ownerJa(c.owner)}${loc}に${c.color}のカードが${numJa(c.value)}枚${opJa(c.operator)}`
        : `${ownerJa(c.owner)}${loc}が${numJa(c.value)}枚${opJa(c.operator)}`;
    }
    case 'SELF_POWER_THRESHOLD': return `このシグニのパワーが${numJa(c.value)}${opJa(c.operator)}`;
    case 'FRONT_SIGNI_POWER': return `このシグニの正面のシグニのパワーが${numJa(c.value)}${opJa(c.operator)}`;
    case 'ENERGY_COLOR_TYPES': return `${ownerJa(c.owner)}エナゾーンにあるカードが持つ色が${numJa(c.value)}種類${opJa(c.operator)}`;
    // diff = 自分 − 相手（符号付き）。gte／gt は「自分が相手より多い」側、lt／lte value=0 は「少ない」側。
    case 'HAND_DIFF':
      if (c.value === 0 && c.operator === 'lt') return 'あなたの手札が対戦相手より少ない';
      if (c.value === 0 && c.operator === 'gt') return 'あなたの手札が対戦相手より多い';
      if (c.value === 0 && c.operator === 'gte') return 'あなたの手札の枚数が対戦相手の手札の枚数以上';
      // 🔑**負の value は「対戦相手のほうが多い」を表す**（diff = 自分 − 相手）。
      // 素直に `${value}枚${op}多い` と書くと **「-5枚以下多い」** という無意味な日本語になり、
      // 原文（「対戦相手の手札があなたより５枚以上多い場合」）と一致しているのに**ズレて見える**。
      // 次の意味照合監査を誤誘導するので、主語を入れ替えて正の枚数で描く（2026-08-22・段2 第7バッチ）。
      if (c.value < 0 && (c.operator === 'lte' || c.operator === 'lt')) {
        return `対戦相手の手札があなたより${numJa(-c.value)}枚${c.operator === 'lte' ? '以上' : 'より多く'}多い`;
      }
      return `あなたの手札が対戦相手より${numJa(c.value)}枚${opJa(c.operator)}多い`;
    case 'ENA_DIFF': return `あなたのエナが対戦相手より${numJa(c.value)}枚${opJa(c.operator)}多い`;
    // ── §5b「逆翻訳の英語ID漏れ0」の残テール（2026-08-07 §5c 消化のついでに一括意味文化）──
    case 'ALL_SELF_SIGNI_DOWN': return 'あなたのすべてのシグニがダウン状態';
    case 'ANY_PLAYER_REFRESHED_THIS_TURN': return 'このターンにいずれかのプレイヤーがリフレッシュしていた';
    // 🆕回数つき（`lte 1`＝「このターンで最初のリフレッシュ」）。
    case 'REFRESH_COUNT_THIS_TURN': return c.operator === 'lte' && c.value === 1
      ? `それが${ownerJa(c.owner)}このターンで最初のリフレッシュ`
      : `${ownerJa(c.owner)}このターンのリフレッシュ回数が${numJa(c.value)}回${opJa(c.operator)}`;
    case 'CENTER_LRIG_NOT_GROWN_THIS_TURN': return `このターンに${ownerJa(c.owner)}センタールリグがグロウしていない`;
    case 'FIELD_LRIG_COLOR_COUNT': return `${ownerJa(c.owner)}場のルリグが${c.minLrigs ? `${numJa(c.minLrigs)}体以上いて、` : ''}持つ色が${numJa(c.value)}種類${opJa(c.operator)}`;
    case 'FIELD_LRIGS_HAVE_COLORS': return `${ownerJa(c.owner)}場に${(c.colors || []).join('と')}のルリグがいる`;
    case 'IS_BOOSTING': return 'このアーツでブースト（追加エナ）を支払っていた';
    case 'IS_SELF_DOWN': return 'このシグニがダウン状態';
    case 'LAST_LOOK_TRASHED_MATCHES': return `この方法でトラッシュに置いたカードに${filterJa(c.filter)}カードが${numJa(c.minCount ?? 1)}枚以上ある`;
    case 'LAST_PROCESSED_HAS_NO_ABILITIES': return 'この方法で処理したカードが能力を持たない';
    case 'LIFE_CRASHED_LAST_TURN': return `前のターンに${ownerJa(c.owner)}ライフクロスが${numJa(c.value)}枚${opJa(c.operator)}クラッシュされていた`;
    case 'LRIG_DECK_COUNT': return `${ownerJa(c.owner)}ルリグデッキが${numJa(c.value)}枚${opJa(c.operator)}`;
    case 'NO_COMMON_COLOR_AMONG_FIELD_SIGNI': return c.count === undefined
      ? `${ownerJa(c.owner ?? 'self')}場にあるシグニがそれぞれ共通する色を持たない`
      : `${ownerJa(c.owner ?? 'self')}場にそれぞれ共通する色を持たないシグニが${numJa(c.count)}体ある`;
    case 'NO_OTHER_ARTS_USED_THIS_TURN': return `このターンに《${c.exceptCardName}》以外のアーツを使用していない`;
    case 'THIS_CARD_FROM_NON_HAND_THIS_TURN': return 'このターンにこのシグニが手札以外の領域から場に出ていた';
    case 'EICHI_LEVEL_SUM': return `英知（＜英知＞シグニのレベル合計）が${numJa(c.value)}${opJa(c.operator)}`;
    case 'VIRUS_COUNT': return `${ownerJa(c.owner)}場の【ウィルス】が${numJa(c.value)}${opJa(c.operator)}`;
    case 'SELF_HAS_KEYWORD': return `${c.subject === 'center_lrig' ? 'あなたのセンタールリグ' : 'このシグニ'}が【${c.keyword}】を持っている`;
    case 'IS_SELF_ARMORED': return 'このシグニが血晶武装状態';
    case 'IS_SELF_ACCED': return c.cardName ? `このシグニが《${c.cardName}》にアクセされている` : 'このシグニに【アクセ】が付いている';
    case 'IS_SELF_SOUL_ATTACHED': return 'このシグニに【ソウル】が付いている';
    case 'IS_SELF_ACCE_CARD': return 'このカードが【アクセ】として付いている';
    case 'IS_SELF_CHARMED': return 'このシグニに【チャーム】が付いている';
    case 'IS_SELF_AWAKENED': return 'このシグニが覚醒状態';
    case 'IS_SELF_IN_CENTER_ZONE': return 'このシグニが中央ゾーンにある';
    case 'IS_SELF_IN_SIDE_ZONE':
      return `このシグニが${c.side === 'either' ? '左か右' : c.side === 'left' ? '左' : '右'}のシグニゾーンにある`;
    default: return `[条件:${c.type}]`;
  }
}

function rearrangeSigniJa(a: any): string {
  if (!a.swap) return `${targetJa(a.target)}を好きなように配置し直す${a.optional ? '（してもよい）' : ''}`;
  if (a.swapBetweenTargets) {
    return `${targetJa(a.target)}を対象とし、それらの場所を入れ替える${a.optional ? '（してもよい）' : ''}`;
  }
  if (a.swapSourceLocation && a.swapSourceTarget) {
    const src = a.swapSourceTarget;
    const zone = a.swapSourceLocation === 'trash' ? 'トラッシュ' : 'エナゾーン';
    const count = `${numJa(src.count ?? 1)}枚${src.upToCount ? 'まで' : ''}`;
    const relationalLevel = a.target?.filter?.levelEqLastProcessed ? 'それと同じレベルの' : '';
    const sourceText = `${ownerJa(src.owner)}${zone}から${relationalLevel}${filterJa(src.filter)}シグニ${count}`;
    const fieldTarget = a.target?.filter?.levelEqLastProcessed
      ? { ...a.target, filter: { ...a.target.filter, levelEqLastProcessed: undefined } }
      : a.target;
    const fieldText = a.targetsBattleAttacker
      ? 'そのあなたのシグニ'
      : a.target?.filter?.thisCardOnly ? '場にあるこのシグニ' : targetJa(fieldTarget);
    const body = a.swapIfSameLevel
      ? `${fieldText}と、${sourceText}を対象とし、それらのレベルが同じ場合、それらの場所を入れ替える`
      : `${fieldText}と、${sourceText}を対象とし、それらの場所を入れ替える`;
    return `${body}${a.suppressOnPlay ? '。この方法で場に出たシグニの【出】能力は発動しない' : ''}`;
  }
  return `${targetJa(a.target)}とこのシグニの場所を入れ替える${a.optional ? '（してもよい）' : ''}`;
}

function actionJa(a?: Action, effectType?: string): string {
  if (!a) return '';
  switch (a.type) {
    // 🆕`maxCount`＝原文のドロー上限（§5.3 `O-162`）。出さないと「最大N枚まで」が逆翻訳から消える。
    case 'DRAW': return (a.maxCount !== undefined ? `（最大${a.maxCount}枚まで）` : '') + (a.untilHandCount !== undefined
      ? `${ownerJa(a.owner)}手札が${a.untilHandCount}枚より少ない場合、その差の分だけカードを引く`
      // ⚠`unitSize` の有無で分岐しない＝「〈X〉のシグニ**１体につき**1枚引く」は `unitSize` を持たない
      //   （既定1）ので、旧実装では `countFromZone` ごと描かれず**固定1枚**に見えていた（`WXEX2-34-E1`）。
      : a.countFromZone
      ? `${countFromZonePerJa(a.countFromZone, '枚')}カードを引く`
      : a.perLastProcessedLevel
      ? `${ownerJa(a.owner)}そのシグニのレベル1につきカードを${numJa(a.count)}枚引く`
      // `addLastProcessedCount`＝「この方法で処理した枚数だけ」（§6.4 O-9(a)）。
      // ⚠出さないと `count:0` が「カードを0枚引く」と描かれ、**何も引かない**逆翻訳になる。
      : a.addLastProcessedCount
      ? `${ownerJa(a.owner)}この方法で処理したカード1枚につきカードを1枚引く${(a.count ?? 0) > 0 ? `（さらに${numJa(a.count)}枚）` : ''}`
      : a.count?.$ref === 'last_processed_count'
      ? 'この方法で処理したカードの枚数と同じ数だけカードを引く'
      : `${ownerJa(a.owner)}カードを${numJa(a.count)}枚引く`);
    case 'GAIN_COIN': return `${ownerJa(a.owner)}コインを${numJa(a.count ?? 1)}枚得る`;
    case 'DRAW_PER_FIELD_COUNT': return `${ownerJa(a.countOwner)}場の${filterJa(a.countFilter)}シグニ1体につきカードを${a.drawPerUnit}枚引く`;
    case 'DRAW_PER_LRIG_LEVEL': return `${a.lrigOwner === 'opponent' ? '対戦相手' : 'あなた'}のセンタールリグのレベル1につきカードを${a.drawPerLevel}枚引く`;
    case 'ENERGY_CHARGE_PER_LRIG_LEVEL': return `${a.lrigOwner === 'opponent' ? '対戦相手' : 'あなた'}のセンタールリグのレベル1につき【エナチャージ${a.chargePerLevel}】をする`;
    case 'ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT': return `${ownerJa(a.countOwner)}場の${filterJa(a.countFilter)}シグニ1体につきデッキの一番上のカードを${a.chargePerUnit}枚エナゾーンに置く`;
    case 'BANISH': return a.targetsStored ? 'それをバニッシュする' : a.opponentSelects
      ? `対戦相手は自分の${filterJa(a.target?.filter)}シグニ${a.target?.count === 'ALL' ? 'すべて' : `${a.target?.count ?? 1}体`}を選んでバニッシュする`
      : `${targetJa(a.target)}をバニッシュする${a.optional ? '（してもよい）' : ''}`;
    // 🆕**2026-08-31 続き752**＝`targetsLastProcessed`（「**それ**を手札に戻す」）を描く。
    //   落とすと「別のシグニを選べる」実装と同じ文になり、過剰実行が原文照合に映らない（`WX25-P1-002-E1`）。
    case 'BOUNCE': return `${a.targetsLastProcessed ? 'それ（直前に処理したシグニ）' : targetJa(a.target)}を手札に戻す${a.optional ? '（してもよい）' : ''}${a.opponentSelects && a.target?.owner === 'opponent' ? '（相手が選ぶ）' : ''}`;
    case 'SEND_TO_ENERGY': return `${targetJa(a.target)}をエナゾーンに置く${a.opponentSelects && a.target?.owner === 'opponent' ? '（相手が選ぶ）' : ''}${a.optional ? '（してもよい）' : ''}`;
    // ATTACH_ACCE: シグニを別シグニの【アクセ】にする。fromHand=手札から（デコレ）／省略時=エナゾーンから（アクセクラフト）
    case 'ATTACH_ACCE': {
      const srcJaAA = a.fromHand ? '手札' : 'エナゾーン';
      const acceFilJaAA = a.signiFilter ? filterJa(a.signiFilter) : '';
      const hostFilJaAA = a.targetFilter ? filterJa(a.targetFilter) : '';
      // 🆕repeatWhilePossible＝「好きな枚数を好きな数のシグニの【アクセ】にする」（落とすと1×1に読める）。
      const cntJaAA = a.repeatWhilePossible ? ['好きな枚数の', '好きな数の'] : ['', ''];
      const tailAA = a.repeatWhilePossible ? '' : '1枚を、あなたの場の';
      if (a.repeatWhilePossible) {
        return `${srcJaAA}から${cntJaAA[0]}${acceFilJaAA}シグニを、あなたの場の${cntJaAA[1]}${hostFilJaAA}シグニの【アクセ】にする${a.optional ? '（してもよい）' : ''}`;
      }
      void tailAA;
      return `${srcJaAA}から${acceFilJaAA}シグニ1枚を、あなたの場の${hostFilJaAA}シグニ1体の【アクセ】にする`;
    }
    case 'FIELD_SIGNI_TO_ACCE': {
      const srcFilJaFSA = a.sourceFilter ? filterJa(a.sourceFilter) : '';
      const hostFilJaFSA = a.targetFilter ? filterJa(a.targetFilter) : '';
      return `場の${srcFilJaFSA}シグニ1体を、他の${hostFilJaFSA}シグニ1体の【アクセ】にする`;
    }
    // BLOOD_CRYSTAL_ARMOR: シグニ1体を血晶武装する（指定領域から同名カードをそのシグニの下に置き血晶武装状態にする）
    case 'BLOOD_CRYSTAL_ARMOR': {
      const zoneJaBCA: Record<string, string> = { hand: '手札', trash: 'トラッシュ', deck: 'デッキ', energy: 'エナゾーン' };
      const srcBCA = (Array.isArray(a.source) ? a.source : [a.source]).map((s: string) => zoneJaBCA[s] ?? s).filter(Boolean).join('／') || '手札';
      const tgtBCA = a.target ? targetJa(a.target, 'シグニ') : 'あなたのシグニ1体';
      return `${tgtBCA}を血晶武装［${srcBCA}］する（${srcBCA}からそれと同名のカード${a.count ?? 1}枚をそのシグニの下に置き、血晶武装状態にする）`;
    }
    case 'TRASH': {
      const t = a.target;
      const u = t?.type === 'HAND_CARD' ? '手札' : t?.type === 'ENERGY_CARD' ? 'エナ' : t?.type === 'DECK_CARD' ? 'デッキの上からカード' : '';
      // targetsTriggerSource:「そのシグニ」= トリガー元シグニ（タスク12(lxi) 第3波）
      if (t?.type === 'SIGNI' && a.targetsTriggerSource) return 'それ（トリガー元シグニ）をトラッシュに置く';
      if (t?.type === 'SIGNI') return `${targetJa(t)}をトラッシュに置く${a.opponentSelects && t?.owner === 'opponent' ? '（相手が選ぶ）' : ''}${a.optional ? '（してもよい）' : ''}`;
      if (t?.type === 'ENERGY_CARD' && t?.owner === 'opponent' && t?.filter?.isTriggerSource) return 'そのカードをトラッシュに置く';
      if (t?.type === 'ENERGY_CARD' && t.selectionConstraint?.groups?.length) {
        return `${ownerJa(t.owner)}エナゾーンから${selectionGroupsJa(t.selectionConstraint.groups)}をトラッシュに置く`;
      }
      // untilHandCount:「手札がN枚になるように捨てる」＝固定枚数ではなく実行時の差（タスク12(lxiv)②）
      if (t?.type === 'HAND_CARD' && a.untilHandCount !== undefined) {
        return `${ownerJa(t.owner)}手札が${a.untilHandCount}枚になるようにカードを捨てる`;
      }
      if (t?.type === 'HAND_CARD' && t.owner === 'self' && t.count === 'ALL') {
        // 🔴フィルタつき（「手札から＜凶蟲＞のシグニを好きな枚数捨てる」`WX19-Re18-E1`）を
        //   「手札を好きな枚数捨てる」と描くと**クラス限定が逆翻訳から消える**（§5.3 `O-60` 第13バッチで検出）。
        if (t.upToCount) return `あなたは${filterJa(t.filter)}手札を好きな枚数捨てる`;
        return `あなたの手札をすべて捨てる${a.optional ? '（してもよい）' : ''}`;
      }
      if (t?.type === 'ENERGY_CARD' && t.owner === 'self' && t.count === 'ALL' && a.optional) {
        return 'あなたのエナゾーンにあるすべてのカードをトラッシュに置く（してもよい）';
      }
      // 手札/エナの「誰が選ぶか」を明示（見ないでランダム / 自分が見て選ぶ / 相手が選ぶ）。
      // count:'ALL'（すべて捨てる）は選択の余地がないため明示しない。
      const who = t?.count === 'ALL'
        ? ''
        : a.opponentSelects && t?.owner === 'opponent'
        ? '（相手が選ぶ）'
        : t?.type === 'HAND_CARD' && t?.owner === 'opponent'
        ? (t.blind ? '（見ないでランダム）' : t.actingPlayerSelects ? '（自分が見て選ぶ）' : '（相手が選ぶ）')
        : '';
      const cnt = t?.count === 'ALL' ? (t?.upToCount ? '好きな枚数' : 'すべて')
        : (typeof t?.count === 'object' && LEVEL_REFS.includes(t?.count?.$ref)) ? 'それのレベル1につき1枚'
        : (typeof t?.count === 'object' && t?.count?.$ref === 'last_processed_count')
          ? `この方法で処理した${t.count.filter ? `${filterJa(t.count.filter)}カード` : 'カード'}と同じ枚数`
        : `${numJa(t?.count)}枚${t?.upToCount ? 'まで' : ''}`;
      return `${ownerJa(t?.owner)}${filterJa(t?.filter)}${u}を${cnt}トラッシュに置く${t?.thisCardOnly ? '（このカード）' : ''}${who}${a.optional ? '（してもよい）' : ''}`;
    }
    case 'POWER_MODIFY': {
      // aboveSelf は「このカードの上にある[＜X＞の/《名》/色の]シグニ」＝ホスト宛（owner 接頭辞は出さない）。
      const aboveRest = a.target?.filter?.aboveSelf ? { ...a.target.filter, aboveSelf: undefined } : undefined;
      const pmSubj = a.targetsTriggerSource ? 'それ（トリガー元シグニ）' : (a.targetsLastProcessed || a.targetsStored) ? 'それ' : a.target?.filter?.acceHost ? 'これにアクセされているシグニ' : a.target?.filter?.aboveSelf ? `このカードの上にある${filterJa(aboveRest)}${a.target.filter.cardName ? '' : 'シグニ'}` : a.target?.filter?.thisCardOnly ? 'このシグニ' : targetJa(a.target, 'シグニ', a.excludeSelf);
      if (a.deltaFromOppPowerDecrease) return `${pmSubj}のパワーを減った値と同じだけ＋する`;
      // 🆕`splitTotal`（§5.3 `O-140`）＝delta は**1体あたりではなく総量**なので「合わせて」と描く。
      //   ⚠これを落とすと「対象それぞれに満額」に読めてしまい、まさに旧 engine の過剰実行と同じ嘘になる。
      if (a.splitTotal) {
        // ⚠**枚数は書かない**（「好きな数」が枚数そのもの）＝`targetJa` を通すと `1体まで` が混ざる。
        const spOwner = a.target?.owner === 'opponent' ? '対戦相手の' : a.target?.owner === 'self' ? 'あなたの' : '';
        const spNoun = `${filterJa(a.target?.filter ?? {})}${a.target?.filter?.cardType ?? 'シグニ'}`;
        return `${spOwner}${spNoun}を好きな数対象とし、それらのパワーを合わせて`
          + `${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta)}する（${a.splitTotal.unit ?? 1000}単位で割り振る）`;
      }
      const pmDuration = a.duration === 'NEXT_TURN'
        ? a.appliesThisTurn
          // 「このターン＋次の対戦相手のターン」＝原文の「次のあなたのターンまで」（§6.4 O-16(a)）。
          // 相手ターン限定であることを落とすと「このターンと次のターンの間」に見えて別の期間になる。
          ? a.nextTurnOwner === 'opponent'
            ? '（このターンと次の対戦相手のターンの間）'
            : '（このターンと次のターンの間）'
          : a.nextTurnOwner === 'opponent'
            ? '（次の対戦相手のターンの間）'
            : '（次のターンの間）'
        : a.duration === 'UNTIL_NEXT_OWN_TURN_END' ? '（次のあなたのターン終了時まで）'
        : a.duration === 'UNTIL_OPP_TURN_END' ? '（次の相手ターン終了時まで）'
        : a.duration === 'UNTIL_END_OF_TURN' ? '（ターン終了時まで）' : '';
      // deltaPerLastProcessedCount: 倍率は「この方法で（直前ステップで）処理した枚数」（タスク12(lx)②）。
      // 🆕§5.3 `O-80` 第1バッチ（2026-08-26）＝**何を数えるかは `perLastProcessed` から描く**。
      //   旧実装は「この方法で**捨てた手札**1枚につき」と決め打ちで、`＜悪魔＞のシグニ`／`黒のカード`／
      //   `レベルの合計` を数える効果でも同じ嘘の文を出していた。
      if (a.deltaPerLastProcessedCount) {
        const plp = a.perLastProcessed;
        const plpF = plp?.filter;
        const plpNoun = `${plpF?.color ? `${plpF.color}の` : ''}${plpF?.story ? `＜${plpF.story}＞の` : ''}`
          + `${plpF?.levelParity ? `レベルが${plpF.levelParity === 'odd' ? '奇数' : '偶数'}の` : ''}${plpF?.cardType ?? 'カード'}`;
        // 🆕`power_sum`＝「〜の**パワーと同じだけ**」（§5.3 `O-142`）＝「N枚につき」ではなく倍率そのもの。
        //   ⚠ここを既定の「1枚につき－1する」に落とすと、逆翻訳が**原文とまったく違う嘘**になる。
        if (plp?.unit === 'power_sum') {
          return `${pmSubj}のパワーをこの方法で処理した${plpNoun}のパワーと同じだけ${a.delta >= 0 ? '＋' : '－'}する${pmDuration}`;
        }
        const plpUnit = plp?.unit === 'level_sum' ? 'のレベルの合計1' : `${plp?.divisor ?? 1}枚`;
        return `${pmSubj}のパワーをこの方法で処理した${plpNoun}${plpUnit}につき${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta)}する${pmDuration}`;
      }
      if (a.deltaFromZone) {
        const z = a.deltaFromZone;
        const d = z.per ?? 0;
        const filter = z.filter ?? {};
        const noun = `${z.distinctBy === 'level' ? 'それぞれレベルの異なる' : ''}${filterJa(filter)}${filter.cardType ?? 'カード'}`;
        // 🆕`under`＝効果元シグニの下段（§5.3 `O-141`）。所有者は効果元で決まるので owner を出さない。
        //   ⚠ここを既定の `${z.zone}にある` に落とすと逆翻訳に**生の英語 `under`** が出る（census:stubs C群と同じ穴）。
        const location = z.zone === 'trash' ? 'トラッシュにある'
          : z.zone === 'under' ? 'このシグニの下にある'
          // 🆕§5.3 `O-143`＝チェックゾーン。ここを既定に落とすと逆翻訳に生の英語 `check` が出る。
          : z.zone === 'check' ? 'チェックゾーンにある'
          : `${z.zone}にある`;
        const ownerPrefix = z.zone === 'under' ? '' : ownerJa(z.owner);
        const cap = z.maxCount === undefined ? '' : `（この効果は${z.maxCount}枚までしか適用されない）`;
        // 🆕`sumBy:'power'`＝枚数比例ではなく**下段のパワー総和**と同じだけ増減する（§5.3 `O-141`）。
        if (z.sumBy === 'power') {
          return `${pmSubj}のパワーを${ownerPrefix}${location}すべての${noun}のパワーの合計と同じだけ${d >= 0 ? '＋' : '－'}する${pmDuration}${cap}`;
        }
        return `${pmSubj}のパワーを${ownerPrefix}${location}${noun}${z.unitSize ?? 1}枚につき${d >= 0 ? '＋' : '－'}${Math.abs(d)}する${pmDuration}${cap}`;
      }
      // deltaPerTargetLevel: 倍率は「対象シグニ自身のレベル」＝delta はレベル1あたりの単価（§6.4 O-16(a)）
      if (a.deltaPerTargetLevel) {
        return `${pmSubj}のパワーをそのシグニのレベル1につき${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta)}する${pmDuration}`;
      }
      return `${pmSubj}のパワーを${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta)}する${pmDuration}`;
    }
    case 'POWER_SET': {
      // CONTINUOUS の POWER_SET で count≠ALL は engine 上「このシグニのみ」に解決される（effectEngine 参照）
      const thisOnly = effectType === 'CONTINUOUS' && a.target?.count !== 'ALL'
        && (a.target?.owner === 'self' || a.target?.owner === 'any');
      const tgt = thisOnly ? 'このシグニの基本パワー' : `${targetJa(a.target)}のパワー`;
      const dur = a.duration === 'UNTIL_END_OF_TURN' ? 'ターン終了時まで、' : '';
      return `${dur}${tgt}を${a.value}にする`;
    }
    case 'POWER_MODIFY_PER_HAND_COUNT': {
      const dHand = a.deltaPerCard ?? a.delta ?? 0;
      const countHand = a.subtractHandOwner
        ? `${ownerJa(a.handOwner)}手札と${ownerJa(a.subtractHandOwner)}手札の差`
        : `${ownerJa(a.handOwner)}手札`;
      return `${a.target?.filter?.thisCardOnly ? 'このシグニ' : targetJa(a.target)}のパワーを${countHand}${a.unitSize ?? 1}枚につき${dHand >= 0 ? '＋' : '－'}${Math.abs(dHand)}する`;
    }
    case 'FREEZE': return `${targetJa(a.target)}を${a.down ? 'ダウンして凍結する' : '凍結する'}`;  // down:true のときのみダウンも行う
    case 'DOWN': return `${targetJa(a.target)}をダウンする${a.optional ? '（してもよい）' : ''}`;
    case 'PREVENT_NEXT_DAMAGE':
      if (a.millAtTurnEndPerPrevented) return `このターン、次の${a.count ?? 1}回のダメージを受けず、防いだ回数だけ「ターン終了時、デッキの上からカードを${a.millAtTurnEndPerPrevented}枚トラッシュに置く。」を得る`;
      if (a.sourceLevelLtLastProcessed) return `このターン、次にあなたがそれより低いレベルを持つ対戦相手のシグニによってダメージを受ける場合、代わりにダメージを受けない`;
      // ⚠ダメージ源の値限定（`damageSource` と同じ「逆翻訳の忠実化用」規約）。出さないと
      //   「どんなダメージでも防ぐ」as-written に読めてしまう。
      if (a.sourcePowerLte !== undefined || a.sourceLevelLte !== undefined) {
        const lim = a.sourcePowerLte !== undefined ? `パワー${a.sourcePowerLte}以下` : `レベル${a.sourceLevelLte}以下`;
        return `このターン、あなたは対戦相手の${lim}のシグニによってダメージを受けない`;
      }
      return a.damageSource
        ? `このターン、次にあなたが${a.damageSource === 'lrig' ? 'ルリグ' : 'シグニ'}によってダメージを受ける場合、代わりにダメージを受けない`
        : `このターン、次の${a.count ?? 1}回のダメージを受けない`;
    case 'REPLACE_NEXT_DAMAGE_WITH_MILL':
      return `このターン、次にあなたが${a.damageSource ? (a.damageSource === 'lrig' ? 'ルリグ' : 'シグニ') + 'によって' : ''}ダメージを受ける場合、代わりにあなたのデッキの上からカードを${a.millCount}枚トラッシュに置く`;
    case 'LIFE_CRASH_REPLACE': {
      const src = a.damageSource ? `対戦相手の${a.damageSource === 'lrig' ? 'ルリグ' : 'シグニ'}${a.byAttack ? 'のアタック' : ''}によって` : '';
      // ⚠語尾は活用が変わる（「置く」/「置いてもよい」・「クラッシュする」/「クラッシュしてもよい」）＝
      //   `${…}てもよい` と素朴に繋ぐと「置くてもよい」になる。
      // 🆕`pay_cost`（§5.3 `O-202`）＝支払い方を全部出す（出さないと「代わりに」だけの空文になる）。
      const payJa = (a.payOptions ?? []).map(o =>
        o.assistLrigDown
          ? `あなたの${o.assistLrigDown.minLevel !== undefined ? `レベル${o.assistLrigDown.minLevel}以上の` : ''}アップ状態のアシストルリグ${o.assistLrigDown.count}体をダウンする`
          : o.handDiscard ? `手札を${o.handDiscard}枚捨てる`
          : o.energyTrash ? `エナゾーンからカードを${o.energyTrash}枚トラッシュに置く`
          : `${(o.costColors ?? []).map(c => `《${c}》`).join('')}を支払う`,
      ).join('か');
      const what = a.replaceKind === 'mill'
        ? `あなたのデッキの上からカードを${a.count}枚トラッシュに${a.optional ? '置いてもよい' : '置く'}`
        : a.replaceKind === 'pay_cost'
        ? `${payJa}${a.optional ? '（してもよい）' : ''}`
        : `対戦相手のライフクロス${a.count}枚を${a.optional ? 'クラッシュしてもよい' : 'クラッシュする'}`;
      // 🔴`pay_cost` の原文は「ライフクロスがクラッシュされる場合」ではなく「**ダメージを受ける**場合」。
      const trigger = a.replaceKind === 'pay_cost'
        ? `あなたが${src}ダメージを受ける場合` : `あなたのライフクロスが${src}クラッシュされる場合`;
      return `このターン、${a.once ? '次に' : ''}${trigger}、代わりに${what}`;
    }
    case 'EXILE':
      if (a.target?.type === 'HAND_CARD' && a.target?.count !== 'ALL') {
        const owner = a.target.owner === 'opponent' ? '対戦相手の' : 'あなたの';
        return `${owner}手札を${a.blind ? '見ないで' : '見て'}${numJa(a.target.count)}枚選び、ゲームから除外する`;
      }
      return `${targetJa(a.target)}をゲームから除外する`;
    // `targetsStored`＝先行の対象宣言で固定した集合（§6.4 O-8(b)「この方法で移動したシグニ」）。
    // ⚠出さないと「好きな数のダウン状態のシグニをアップする」＝**盤面全体から選べる**逆翻訳になる。
    case 'UP': return `${a.targetsBattleAttacker ? 'そのアタックしているシグニ' : a.targetsTriggerSource ? 'それ（トリガー元シグニ）' : a.targetsStored ? `この方法で処理した${targetJa(a.target)}` : targetJa(a.target)}をアップする`;
    case 'ENERGY_CHARGE': {
      // target 形式（デッキ/トラッシュ/手札/場のカードをエナゾーンへ）。全カードが target 形式
      if (a.target?.type === 'DECK_CARD') return `${ownerJa(a.target.owner)}デッキの上から${numJa(a.target.count)}枚をエナゾーンに置く`;
      if (a.target) return `${targetJa(a.target)}を対象とし、それらをエナゾーンに置く`;
      return `${ownerJa(a.owner)}デッキから${numJa(a.count)}枚エナチャージする`;
    }
    case 'ENERGY_CHARGE_FROM_DECK':
      // ⚠`unitSize` の有無で分岐しない（DRAW と同じ理由＝既定1の「1体につき」が描かれず固定1回に見えた）。
      if (a.countFromZone)
        return `${countFromZonePerJa(a.countFromZone, '回')}【エナチャージ1】をする`;
      if (typeof a.count === 'object' && LEVEL_REFS.includes(a.count?.$ref))
        return `それのレベル1につき${ownerJa(a.owner)}デッキの上から1枚をエナゾーンに置く`;
      return `${ownerJa(a.owner)}デッキの上から${numJa(a.count)}枚をエナゾーンに置く`;
    case 'ADD_TO_LIFE': {
      // 枚数（`last_processed_count` は「この方法でトラッシュに置いた1体につき」）
      const nAL = (typeof a.count === 'object' && a.count?.$ref === 'last_processed_count')
        ? 'トラッシュに置いたシグニ1体につき1' : numJa(a.count);
      const toAL = `${ownerJa(a.owner)}ライフクロスに加える`;
      // ⚠出所を描き分けないと**逆翻訳が常に「デッキの一番上」**になり、fromTrash/fromField を
      //   直しても逆翻訳シートが緑のまま＝計器が穴を映さない（PLAN §3「逆翻訳を直したらエンジンもセット」の逆向き）。
      if (a.fromField) return `${targetJa(a.target ?? { type: 'SIGNI', owner: a.owner, count: a.count })}を場から${toAL}`;
      if (a.fromTrash) return `${ownerJa(a.owner)}トラッシュから${filterJa(a.filter)}${a.filter?.cardType === 'シグニ' ? 'シグニ' : 'カード'}${nAL}枚を${a.opponentSelects ? '対戦相手が選び' : '選び'}${toAL}`;
      if (a.fromHand) return `手札を${nAL}枚選んで${toAL}`;
      if (a.fromSearch) return `デッキから探したカードを${toAL}`;
      if (a.fromBottom) return `${ownerJa(a.owner)}デッキの一番下から${nAL}枚を${toAL}`;
      // fromEnergy＝「このシグニをエナゾーンからライフクロスに加える」（thisCardOnly は自分自身固定）
      if (a.fromEnergy) return a.filter?.thisCardOnly
        ? `このシグニをエナゾーンから${toAL}`
        : `${ownerJa(a.owner)}エナゾーンから${filterJa(a.filter)}カード${nAL}枚を${a.opponentSelects ? '対戦相手が選び' : '選び'}${toAL}`;
      return `${ownerJa(a.owner)}デッキの${a.fromTop ? '一番上' : ''}から${nAL}枚を${toAL}`;
    }
    case 'ADD_TO_FIELD': {
      const supAF = a.suppressOnPlay ? '。その【出】能力は発動しない' : '';
      if (a.source?.type === 'HAND_CARD' && a.source.owner === 'opponent'
          && a.owner === 'opponent' && a.opponentSelectsZone) {
        const sourceFilter = a.source.filter ?? {};
        const nonColorless = sourceFilter.nonColorless ? '無色ではない' : '';
        const restFilter = filterJa({ ...sourceFilter, nonColorless: undefined });
        const noun = sourceFilter.cardType === 'シグニ' ? 'シグニ' : 'カード';
        const count = typeof a.source.count === 'number' ? a.source.count : 1;
        return `対戦相手の手札を見て${nonColorless}${restFilter}${noun}${count}枚を選び、対戦相手はそれを${a.asDown ? 'ダウン状態で' : ''}場に出す${supAF}`;
      }
      if (a.source?.fromLeftFieldUnder)
        return `トラッシュにある、このシグニの下にあったシグニ1枚を${a.asDown ? 'ダウン状態で' : ''}場に出す${supAF}`;
      // 「このシグニをトラッシュから場に出す」自己蘇生（thisCardOnly source）
      if (a.source?.filter?.thisCardOnly && a.source?.type === 'TRASH_CARD')
        return `このシグニをトラッシュから${a.asDown ? 'ダウン状態で' : ''}場に出す${a.optional ? '（してもよい）' : ''}${supAF}`;
      if (a.targetsTriggerSource && a.source?.type === 'ENERGY_CARD')
        return `エナゾーンからそのシグニを${a.asDown ? 'ダウン状態で' : ''}場に出す${a.optional ? '（してもよい）' : ''}${supAF}`;
      // 「このシグニをエナゾーンから場に出す」自己蘇生（thisCardOnly source・TRASH_CARD 版と同型）
      if (a.source?.filter?.thisCardOnly && a.source?.type === 'ENERGY_CARD')
        return `このシグニをエナゾーンから${a.asDown ? 'ダウン状態で' : ''}場に出す${a.optional ? '（してもよい）' : ''}${supAF}`;
      return (a.source ? `${targetJa(a.source)}をコストを支払わず${a.asDown ? 'ダウン状態で' : 'に'}場に出す${a.optional ? '（してもよい）' : ''}` : (a.cardName ? `クラフト/トークンの《${a.cardName}》を場に出す` : '直前に選んだカードを場に出す')) + supAF;
    }
    case 'BLOCK_ACTION': {
      if (a.actionId === 'ON_PLAY_ABILITY') {
        if (a.suppressSigniOnPlayThisTurn) return 'このターン、あなたのシグニの【出】能力は発動しない';
        if (a.target?.type === 'SIGNI' && a.target?.owner === 'opponent') {
          const max = typeof a.target.filter?.level === 'object' ? a.target.filter.level.max : undefined;
          return `対戦相手の${max !== undefined ? `レベル${max}以下の` : ''}シグニの【出】能力は発動しない`;
        }
        return 'その【出】能力は発動しない';
      }
      if (a.actionId === 'FORCE_PLACE_FRONT') return '対戦相手がシグニを配置する場合、可能ならばこのシグニの正面に配置しなければならない';
      if (a.actionId === 'ATTACK' && a.attackCost?.fieldTrash) {
        const n = a.attackCost.fieldTrash.count;
        const duration = a.until === 'END_OF_TURN' ? 'ターン終了時まで、' : '';
        return `${targetJa(a.target)}を対象とし、${duration}それらは「【常】：あなたの他のシグニ${n}体を場からトラッシュに置かないかぎりアタックできない。」を得る`;
      }
      // 🆕bothPlayers＝ターンの持ち主を問わず「そのステップ自体を飛ばす」（`WXDi-P09-031-E1`）。
      const ownerWord = a.bothPlayers ? '両プレイヤー'
        : a.target?.owner === 'opponent' ? '対戦相手' : a.target?.owner === 'self' ? 'あなた' : '';
      const untilPre = a.until === 'END_OF_TURN' ? 'このターン、'
        : a.until === 'NEXT_TURN' ? `次の${a.target?.owner === 'opponent' ? '対戦相手の' : 'あなたの'}ターンの間、`
        : a.until === 'END_OF_ATTACK' ? 'そのアタックの間、' : '';
      // 完成文型（主語/肯定否定が特殊＝テンプレートを使わず直接返す）。許可系（〜できる）含む。
      const fullMap: Record<string, string> = {
        IGNORE_LRIG_TYPE: 'このルリグにグロウするためのルリグタイプは無視される',
        ACCE_LIMIT_2: 'このシグニには２枚まで【アクセ】を付けることができる',
        ACCE_LIMIT_99: 'このシグニには好きな枚数の【アクセ】を付けることができる',
        ENERGY_PHASE: `${ownerWord}は自分のエナフェイズをスキップする`,
        SET_LEVEL_1: `${untilPre}対象のシグニの基本レベルを１にする`,
        NEGATE_NEXT_SIGNI_ATTACK: `${untilPre}次に対戦相手のシグニがアタックしたとき、そのアタックを無効にする`,
      };
      if (fullMap[a.actionId]) return fullMap[a.actionId];
      // 制限文型（主語＝owner±シグニ、述語＝「〜できない」）
      const predMap: Record<string, string> = {
        ATTACK: 'アタックできない',
        GUARD: 'ガードできない',
        GROW: 'グロウできない',
        USE_SPELL: 'スペルを使用できない',
        USE_ARTS: 'アーツを使用できない',
        ARTS_AND_SPELL: 'アーツとスペルを使用できない',
        USE_ARTS_EXCEPT_OPP_TURN: '対戦相手のターン以外でアーツを使用できない',
        SIGNI_ACTIVATED_ABILITY: '場にあるシグニの【起】能力を使用できない',
        GUARD_LV_DECLARED: '宣言された数字と同じレベルのシグニで【ガード】ができない',
        GUARD_LV_LAST_DOWNED: 'この方法でダウンしたシグニと同じレベルのシグニで【ガード】ができない',
        DRAW_LIMIT_1: 'ドローフェイズにカードを１枚しか引くことができない',
        DRAW_OR_ADD_OUTSIDE_GROW_DRAW_PHASE_OWN_TURN: '自分のターンの間、グロウフェイズとドローフェイズ以外でカードを引いたりカードを手札に加えることができない',
        DRAW_OR_ADD_TO_HAND_BY_EFFECT: '自分の効果によって、カードを引いたりカードを手札に加えることができない',
        ARTS_LIMIT_1: '各ターンに一度しかアーツを使用できない',
        USE_SPELL_COST_0: 'コストの合計が０のスペルを使用できない',
        PLAY_SIGNI_POWER_12000_OR_MORE: '手札からパワー12000以上のシグニを場に出せない',
        PLAY_SIGNI_NOT_FROM_HAND: '自身の効果によって手札以外からシグニを場に出せない',
        SIGNI_ATTACK_STEP: 'シグニでアタックできない',
        SIGNI_ATTACK_PHASE: 'シグニでアタックできない',
        LRIG_ATTACK_STEP: 'ルリグでアタックできない',
        SELF_SIGNI_TRASH: 'カードの効果を除き、自分でシグニを場からトラッシュに置けない（リムーブできない）',
        DRAW: 'カードを引けない',
        ENERGY: 'エナチャージできない',
        USE_ACT: '【起】能力を使用できない',
        USE_LRIG_ACT: 'ルリグの【起】能力を使用できない',
        PAY_ENERGY_COST: '１以上のエナコストを支払えない',
        SIGNI_ATTACK: 'シグニでアタックできない',
        // §6.4 O-3（続き491）: フェイズスキップ機構（`PHASE_SKIP_BLOCK_IDS`）の語彙。
        // ⚠`ENERGY`（エナチャージ封じ）と `ENERGY_PHASE`（フェイズごとスキップ）は別物。
        ENERGY_PHASE: 'エナフェイズをスキップする',
        MAIN_PHASE: 'メインフェイズをスキップする',
        ATTACK_PHASE: 'アタックフェイズをスキップする',
      };
      // §6.4 O-41: レベル限定つきガード禁止は id が可変（`GUARD_MAX_LV<n>` ＝n以下／`GUARD_LV<n>[_<m>…]` ＝
      // そのレベルちょうど・列挙）なので predMap では表せない。⚠**表を増やす方式に戻さないこと**＝
      // 表に無いレベルが出た瞬間に生の英語 id（`「GUARD_LV3」を行えない`）が逆翻訳へ漏れる。
      const toFullWidth = (n: string) => n.replace(/\d/g, d => String.fromCharCode(d.charCodeAt(0) + 0xFEE0));
      const guardMaxLv = a.actionId.match(/^GUARD_MAX_LV(\d+)$/);
      const guardExactLv = a.actionId.match(/^GUARD_LV(\d+(?:_\d+)*)$/);
      const guardPred = guardMaxLv
        ? `レベル${toFullWidth(guardMaxLv[1])}以下のシグニで【ガード】ができない`
        : guardExactLv
        ? `${guardExactLv[1].split('_').map(n => `レベル${toFullWidth(n)}`).join('と')}のシグニで【ガード】ができない`
        : undefined;
      const pred = guardPred ?? predMap[a.actionId] ?? `「${a.actionId}」を行えない`;
      // §6.4 O-16: ゾーン限定（`zoneSource:'designated'`）を落とすと**「相手のシグニは全部アタックできない」
      // と同じ文**になり、逆翻訳がゾーン継続と全体禁止を区別できない（engine を直しても計器に映らない）。
      const subj = a.target?.type === 'SIGNI'
        ? (a.target?.zoneSource === 'designated'
            ? `${ownerWord ? ownerWord + 'の' : ''}指定されたシグニゾーンにある${filterJa(a.target?.filter)}シグニ`
            : `${ownerWord ? ownerWord + 'の' : ''}${filterJa(a.target?.filter)}シグニ`)
        : (ownerWord || 'すべてのプレイヤー');
      return `${untilPre}${subj}は${pred}`;
    }
    case 'LOOK_AND_REORDER': {
      const src = a.source?.owner === 'opponent' ? '対戦相手の' : 'あなたの';
      const loc = a.source?.location === 'hand' ? '手札'
        : a.source?.location === 'life_cloth' ? 'ライフクロス' : 'デッキの上';
      const cntJa = a.count === 99 ? '' : `${numJa(a.count)}枚${a.upToCount ? 'まで' : ''}`;
      if (a.shuffle && a.destination?.location === 'deck' && a.destination.position === 'bottom') {
        return `${src}${loc}から${cntJa}を公開し、公開したカードをシャッフルしてデッキの一番下に置く`;
      }
      if (a.destination?.position === 'split_top_bottom') {
        return `${src}${loc}${cntJa}を見て、好きな枚数を好きな順番でデッキの一番上に置き、残りを好きな順番でデッキの一番下に置く`;
      }
      // destination（行き先）を原文どおり描画する。reorder＝「好きな順番で〜に置く/戻す」。
      const dest = a.destination;
      const destJa = dest?.location === 'deck'
        ? (dest.position === 'bottom' ? '好きな順番でデッキの一番下に置く'
         : dest.position === 'top' ? '好きな順番でデッキの一番上に戻す'
         : '好きな順番でデッキに戻す')
        : dest?.location === 'life_cloth' ? '好きな順番でライフクロスの上に置く'
        : '';
      // canTrash＝「不要なカードをトラッシュに置き、残りを〜」（trashして残りを行き先へ）。
      if (a.reorder && destJa) {
        const trashJa = a.canTrash ? 'その中から不要なカードをトラッシュに置き、残りを' : '';
        return `${src}${loc}から${cntJa}を見て、${trashJa}${destJa}`;
      }
      // 🆕§5.3 `O-60` 第8バッチ（2026-08-26）＝**行き先が元のゾーンと違うのに `reorder` が無い**形
      //   ＝並べ替えではなく**移動**。ここを描かないと `WXDi-D04-010-E1`②
      //   「ライフクロスの一番上のカードをデッキに加えてシャッフルする」が
      //   **「ライフクロス1枚を見る」**になり、**移した事実が逆翻訳から消える**。
      if (!a.reorder && dest && (dest.location !== a.source?.location || dest.owner !== a.source?.owner)) {
        const destMoveJa = dest.location === 'deck'
          ? (a.shuffle ? 'デッキに加えてシャッフルする'
            : dest.position === 'bottom' ? 'デッキの一番下に置く' : 'デッキの一番上に置く')
          : dest.location === 'life_cloth' ? 'ライフクロスの一番上に置く'
          : dest.location === 'hand' ? '手札に加える'
          : '';
        if (destMoveJa) return `${src}${loc}の上から${cntJa}を${destMoveJa}`;
      }
      // reorder無し／行き先不明＝見るだけ（canTrash は補助注記）。
      // ⚠`private:false` は原文「**公開する**」＝相手にも見せる。「見る」と書くと非公開と読めるので区別する。
      if (!a.reorder && a.private === false) {
        return `${src}${loc}${cntJa}を公開する${a.canTrash ? '（不要札はトラッシュに置いてもよい）' : ''}`;
      }
      return `${src}${loc}${cntJa}を見る${a.canTrash ? '（不要札はトラッシュに置いてもよい）' : ''}`;
    }
    case 'MILL':
      if (a.useDeclaredCount) return `${ownerJa(a.owner)}デッキの上から宣言した数字に等しい枚数のカードをトラッシュに置く`;
      if (a.countIsLastProcessedLevelSum) return `この方法で${a.lastProcessedLevelVerbJa ?? '場に出たシグニ'}のレベル1につき${ownerJa(a.owner)}デッキの上からカードを1枚トラッシュに置く`;
      if (a.countPlusLastDownedLrigLevelSum) return `${ownerJa(a.owner)}デッキの上からこの方法でダウンしたルリグのレベルの合計に${numJa(a.count)}を加えた枚数のカードをトラッシュに置く`;
      // optional＝原文「〜トラッシュに置いてもよい」（続き417 で任意デッキミルをここへ寄せた）
      return `${ownerJa(a.owner)}デッキの${a.fromBottom ? '下' : '上'}から${numJa(a.count)}枚トラッシュに置${a.optional ? 'いてもよい' : 'く'}`;
    case 'LIFE_CRASH': return a.triggerBurst === false
      ? `${ownerJa(a.owner)}ライフクロスを${numJa(a.count)}枚トラッシュに置く（バースト不発）${a.conditional ? '（そうした場合）' : ''}`
      : `${ownerJa(a.owner)}ライフクロスを${numJa(a.count)}枚クラッシュ${a.optional ? 'してもよい' : 'する'}${a.conditional ? '（そうした場合）' : ''}`;
    // ⚠群の filter は `filterJa` に描かせる（`O-188` 第4バッチ・2026-09-01）。
    //   自前の noun 組み立てでは cardType と color しか出ず、クラス・レベル・アイコン・
    //   《ガードアイコン》を持たない・宣言クラスが**逆翻訳から丸ごと消えて原文照合が効かなくなる**。
    case 'TRANSFER_TO_HAND': return a.transferGroups?.length
      ? `${transferGroupZoneJa(a.source)}${a.transferGroups.map((g: any) => {
          const noun = g.filter?.cardType === 'スペル' ? 'スペル'
            : g.filter?.cardType === 'シグニ' ? 'シグニ' : 'カード';
          return `${filterJa(g.filter)}${noun}${g.count}枚まで`;
        }).join('と')}対象とし、それらを手札に加える`
      : a.source?.fromLeftFieldUnder
      ? 'トラッシュにある、このシグニの下にあったシグニ1枚を手札に加える'
      // 「このシグニをエナゾーンから手札に加える」自己回収（thisCardOnly source）。⚠出所を描かないと
      //   `targetJa` が「このシグニを手札に加える」としか書かず、**エナから拾う話だと読めない**
      //   （`ADD_TO_FIELD`／`ADD_TO_LIFE` の同型分岐と揃える＝§5.3 O-54）。
      : (a.source?.type === 'DECK_CARD' && a.source?.fromTop === true)
      ? `あなたのデッキの一番上のカードを手札に加える`
      : (a.source?.filter?.thisCardOnly && a.source?.type === 'ENERGY_CARD')
      ? `このシグニをエナゾーンから手札に加える${a.source?.upToCount ? '（してもよい）' : ''}`
      : `${targetJa(a.source)}を手札に加える`;
    case 'TRANSFER_TO_DECK': {
      const opt = a.optional ? '（してもよい）' : '';
      if (a.destination === 'lrig_deck') return `${targetJa(a.source)}をルリグデッキに戻す${opt}`;
      // 🆕orderChosenBy＝「置く順番は対戦相手が決める」（落とすと engine の内部順で積まれると読める）。
      const chooser = a.orderChosenBy === 'opponent' ? '（置く順番は対戦相手が決める）'
        : a.opponentSelects && a.source?.owner === 'opponent' ? '（相手が選ぶ）' : '';
      return a.shuffle
        ? `${targetJa(a.source)}をデッキに加えてシャッフルする${chooser}${opt}`
        : `${targetJa(a.source)}をデッキの${a.position === 'bottom' ? '一番下' : a.position === 'second' ? '上から二番目' : a.position === 'third' ? '上から三番目' : '上'}に置く${chooser}${opt}`;
    }
    case 'ADD_CRAFT_TO_LRIG_DECK':
      return `${ownerJa(a.owner)}ルリグデッキに《${a.cardName}》${numJa(a.count)}枚を加える`;
    case 'SET_CARD_COST_REPLACEMENT':
      return `このゲームの間、${ownerJa(a.owner)}《${a.cardName}》の使用コストは${a.cost.map(c => `《${c.color}×${c.count}》`).join('')}になる`;
    case 'PLACE_LRIGS_UNDER_CENTER':
      return `${ownerJa(a.owner)}ルリグトラッシュからすべてのルリグをこのカードの下に置く`;
    case 'ADD_TO_HAND': return `${targetJa(a.target)}を手札に加える`;
    case 'SEARCH': {
      // cardType フィルタを名詞に反映（「カード」だとスペルも引けるように誤読されるため）
      const ct = a.filter?.cardType;
      const noun = ct ? ([] as string[]).concat(ct).join('か') : 'カード';
      // デッキ全体サーチ後にシャッフルを跨いで選択札を top/second へ予約配置する形。
      // 通常の SEARCH 逆翻訳（「処理する」）へ落とすと、今回の主目的である行き先が見えなくなる。
      const directDeck = a.then?.type === 'TRANSFER_TO_DECK' && a.then.source?.type === 'DECK_CARD'
        ? a.then : undefined;
      const deckChoices = a.then?.type === 'CHOOSE'
        ? (a.then.choices ?? []).map((c: any) => c.action)
          .filter((x: any) => x?.type === 'TRANSFER_TO_DECK' && x.source?.type === 'DECK_CARD')
        : [];
      if (a.from?.location === 'deck' && a.afterSearch?.type === 'SHUFFLE_DECK'
          && (directDeck || deckChoices.length === (a.then?.choices?.length ?? -1))) {
        const owner = a.from?.owner === 'opponent' ? '対戦相手の' : 'あなたの';
        const picked = noun === 'シグニ' ? 'そのシグニ' : 'そのカード';
        const chooseSecond = deckChoices.some((x: any) => x.position === 'second');
        const destination = chooseSecond ? 'デッキの上から一番目か二番目' : 'デッキの一番上';
        const subject = `${owner}デッキから${filterJa(a.filter)}${noun}１枚`;
        if (a.upToTarget) {
          return `${subject}を探してもよい。そうした場合、デッキをシャッフルし、${picked}を${a.revealPicked ? '公開し' : ''}${destination}に置く`;
        }
        return a.revealPicked
          ? `${subject}を探して公開する。デッキをシャッフルし、${picked}を${destination}に置く`
          : `${subject}を探す。その後、デッキをシャッフルし、${picked}を${destination}に置く`;
      }
      // then（SEQUENCE）に REVEAL/ADD_TO_HAND があれば「公開し手札に加える」を反映
      const thenSteps = a.then?.type === 'SEQUENCE' ? (a.then.steps ?? []) : (a.then ? [a.then] : []);
      const reveal = thenSteps.some((s: any) => s?.type === 'REVEAL') ? '公開し' : '';
      const dest = a.handOrField ? (a.handOrFieldAsDown ? '手札に加えるかダウン状態で場に出す' : '手札に加えるか場に出す')
        : thenSteps.some((s: any) => s?.type === 'ADD_TO_HAND') ? '手札に加える'
        // 🆕**2026-08-31 続き752**＝`asDown`（ダウン状態で場に出す）を描く。落とすとアップ配置と同じ文になり、
        //   「そのターン殴れるか」という実害の差が原文照合から消える（`PR-387-E1` の finding が実際に残っていた）。
        : thenSteps.some((s: any) => s?.type === 'ADD_TO_FIELD')
          ? (thenSteps.some((s: any) => s?.type === 'ADD_TO_FIELD' && s.asDown) ? 'ダウン状態で場に出す' : '場に出す')
        : thenSteps.some((s: any) => s?.type === 'TRASH') ? 'トラッシュに置く'
        : thenSteps.some((s: any) => s?.type === 'ADD_TO_ENERGY' || s?.type === 'ENERGY_CHARGE') ? 'エナゾーンに置く'
        : '処理する';
      if (a.selectionConstraint?.groups?.length) {
        const source = a.from?.location === 'trash' ? `${ownerJa(a.from?.owner)}トラッシュから` : `${ownerJa(a.from?.owner)}デッキから`;
        return `${source}${selectionGroupsJa(a.selectionConstraint.groups)}を探して${reveal}${dest}${a.afterSearch ? '（その後シャッフル）' : ''}`;
      }
      if (a.maxCount?.$ref === 'last_processed_count' && /捨てたカード[１1]枚につき/.test(currentCardText)) {
        return `捨てたカード１枚につき${ownerJa(a.from?.owner)}デッキから${filterJa(a.filter)}${noun}１枚を探して${reveal}${dest}${a.afterSearch ? '（その後シャッフル）' : ''}`;
      }
      const maxJa = typeof a.maxCount === 'object'
        ? (a.maxCount?.$ref === 'last_processed_count'
          ? (a.from?.location === 'trash'
            ? 'この方法でバニッシュ／トラッシュした数と同じ枚数までの'
            : 'この方法でバニッシュ／トラッシュした数と同じ枚数の')
          : '')
        : (a.maxCount ? a.maxCount + '枚まで' : '');
      // 動的な直前処理枚数でトラッシュを探す形（WXEX2-07-E3）は、デッキ検索と誤表示しない。
      const sourceJa = a.maxCount?.$ref === 'last_processed_count' && a.from?.location === 'trash'
        ? `${ownerJa(a.from?.owner)}トラッシュから`
        : `${ownerJa(a.from?.owner)}デッキから`;
      return `${sourceJa}${maxJa}${constraintJa(a.selectionConstraint)}${filterJa(a.filter)}${noun}を探して${reveal}${dest}${a.afterSearch ? '（その後シャッフル）' : ''}`;
    }
    case 'GRANT_KEYWORD': {
      const lancerScope = typeof a.keyword === 'string' ? decodeLancerKeyword(a.keyword) : null;
      const kw = lancerScope?.powerLte !== undefined
        ? `ランサー（パワー${lancerScope.powerLte}以下のシグニ）`
        : a.keyword;
      const kwBase = typeof a.keyword === 'string' ? a.keyword.replace(/^ランサー:.*/, 'ランサー') : String(a.keyword ?? '');
      const durJa = a.duration === 'UNTIL_END_OF_TURN' ? '（ターン終了時まで）'
        : a.duration === 'NEXT_TURN'
          ? a.appliesThisTurn
            ? '（このターンと次のターンの間）'
            : a.nextTurnOwner === 'opponent'
              ? '（次の対戦相手のターンの間）'
              : '（次のターンの間）'
        : a.duration === 'UNTIL_NEXT_OWN_TURN_END' ? '（次のあなたのターン終了時まで）'
        : a.duration === 'UNTIL_OPP_TURN_END' ? '（次の相手ターン終了時まで）'
        : a.duration === 'PERMANENT' ? ''
        // action内 duration が curated JSON で落ちている場合、原文の該当付与文から期間注記を復元（§5b・タスクA）。
        // 【${kwBase}[^】]*】＝【アサシン（パワー3000以下のシグニ）】等の括弧付きキーワード変種も拾う。
        : restoreLeadDuration(new RegExp(`【${kwBase}[^】]*】[^。]*?(?:得る|持つ)`));
      // 🆕`target.type:'PLAYER'`＝**プレイヤー自身が得る**（`WXDi-P12-050-E1`「対戦相手は【みこみこ親衛隊】1つを得る」）。
      //   シグニ宛の文と混ぜると「誰がコストを払うか」が読めなくなる。
      if (a.target?.type === 'PLAYER') {
        return `${a.target.owner === 'opponent' ? '対戦相手' : 'あなた'}は【${kw}】1つを得る${durJa}`;
      }
      // thisCardOnly: このシグニ自身が持つキーワード（「このシグニは【X】を持つ」）
      if (a.target?.filter?.thisCardOnly) return `このシグニは【${kw}】を持つ${durJa}`;
      // targetsLastProcessed:「それ」= 直前に選択/処理したシグニへ付与
      if (a.targetsLastProcessed) return `それは【${kw}】を得る${durJa}`;
      // targetsStored:「それ」= 先行の `SELECT_TARGET_ONLY → STORE_LAST_PROCESSED_TARGETS` で固定した同一対象。
      // ⚠これを書かないと「〈対象〉1体を対象とする。そして〈対象〉1体に【A】を与える。そして〈対象〉1体に【B】を与える」
      //   と**3回別々に選ぶ**ように読めてしまい、逆翻訳が原文（「それは【A】と【B】を得る」）から離れる。
      if (a.targetsStored) return `それは【${kw}】を得る${durJa}`;
      // targetsTriggerSource:「それ（トリガー元シグニ）」へ付与
      if (a.targetsTriggerSource) return `それ（トリガー元シグニ）は【${kw}】を得る${durJa}`;
      if (a.fieldCondition?.type === 'FRONT_SIGNI_HAS_CHARM') {
        return `${targetJa(a.target)}は、その正面のシグニに【チャーム】が付いているかぎり【${kw}】を得る${durJa}`;
      }
      // 🆕2026-08-31 続き749＝「その正面のシグニのパワーがN以上であるかぎり」（`WD15-007-E1`）。
      if (a.fieldCondition?.type === 'FRONT_SIGNI_POWER_GTE') {
        return `${targetJa(a.target)}は、その正面のシグニのパワーが${a.fieldCondition.value}以上であるかぎり【${kw}】を得る${durJa}`;
      }
      return `${targetJa(a.target)}に【${kw}】を与える${durJa}`;
    }
    case 'GRANT_EFFECT': {
      const durJaGE = a.duration === 'UNTIL_END_OF_TURN' ? '（ターン終了時まで）'
        : a.duration === 'NEXT_TURN' ? '（次のあなたのターンの間）'
        : a.duration === 'UNTIL_NEXT_OWN_TURN_END' ? '（次のあなたのターン終了時まで）'
        : a.duration === 'UNTIL_NEXT_OWN_TURN_END' ? '（次のあなたのターン終了時まで）'
        : a.duration === 'UNTIL_OPP_TURN_END' ? '（次の相手ターン終了時まで）' : '';
      const subjGE = a.targetsLastProcessed ? 'それ'
        // thisCardOnly の主語はホストの種別で変わる（§6.4 O-25 で LRIG 自己付与が parser から出るようになった）
        : a.target?.filter?.thisCardOnly ? (a.target?.type === 'LRIG' ? 'このルリグ' : 'このシグニ')
        : targetJa(a.target);
      const bodyGE0 = a.effect ? effJa(a.effect) : (a.rawText ?? '');
      // levelLtSelf/levelGtSelf（「自身より低い/高いレベル」）は付与先の種別で読みが変わる＝engine は host 基準で解決
      //   （effectEngine.ts の resolveDynamicFilter が「このシグニ/このルリグ」を host で判定）。ルリグ付与文脈では
      //   filterJa の既定「このシグニより」を「このルリグより」に読み替える（WXEX2-25-E3）。
      const bodyGE = a.target?.type === 'LRIG'
        ? bodyGE0.replace(/このシグニより(低い|高い)レベル/g, 'このルリグより$1レベル')
        : bodyGE0;
      return `${subjGE}は『${bodyGE}』を得る${durJaGE}`;
    }
    case 'REVEAL_DECK_TOP': return `${ownerJa(a.owner)}デッキの上からカードを${numJa(a.count)}枚公開する`;
    case 'TRASH_REVEALED': return '公開したカードをトラッシュに置く';
    case 'INSTALL_DELAYED_TRIGGER': {
      // 「このターン、…したとき、…」遅延条件トリガーの設置（B3）
      // ON_REFRESH（WX11-024）：「対戦相手が次にリフレッシュをした場合、その後で…」
      if (a.trigger?.timing === 'ON_REFRESH') {
        const whoIDT = a.trigger?.refreshedOwner === 'opponent' ? '対戦相手'
          : a.trigger?.refreshedOwner === 'self' ? 'あなた' : 'いずれかのプレイヤー';
        const effIDT = a.effect?.type === 'FORCE_END_TURN' ? 'このターンを終了する' : actionJa(a.effect);
        return `このターン、${whoIDT}が次にリフレッシュをした場合、その後で${effIDT}`;
      }
      // 🆕ON_BANISH（2026-09-01 続き760・`WX15-006-E1`）＝「このターン、あなたのシグニ1体が
      //   （あなたの効果以外によって）バニッシュされたとき、…」。原因の除外を落とすと
      //   「自分で落としても得をする」形に読める。
      if (a.trigger?.timing === 'ON_BANISH') {
        const durIDT = a.duration === 'THIS_ATTACK_PHASE' ? 'このアタックフェイズの間' : a.duration === 'NEXT_TURN' ? '次のターンの間' : 'このターン';
        const causeIDT = a.trigger.notByOwnEffect ? 'あなたの効果以外によって' : '';
        const filJa = filterJa(a.trigger.triggerFilter ?? {});
        return `${durIDT}、あなたの${filJa}シグニ1体が${causeIDT}バニッシュされたとき、${actionJa(a.effect)}`;
      }
      if (a.trigger?.timing === 'ON_LEAVE_FIELD') {
        const whoIDT = a.trigger.leftOwner === 'opponent' ? '対戦相手の'
          : a.trigger.leftOwner === 'any' ? 'いずれかのプレイヤーの' : 'あなたの';
        const triggerFilterJa = filterJa(a.trigger.triggerFilter ?? {});
        const durationIDT = a.duration === 'THIS_ATTACK_PHASE' ? 'このアタックフェイズの間' : a.duration === 'NEXT_TURN' ? '次のターンの間' : 'このターン';
        return `${durationIDT}、${whoIDT}${triggerFilterJa}シグニ1体が場を離れたとき、${actionJa(a.effect)}`;
      }
      // ON_ATTACK_SIGNI（タスク12(lxi) 第8波・WXK05-009-E2）：設置者は防御側＝主語は「対戦相手のシグニ」。
      if (a.trigger?.timing === 'ON_ATTACK_SIGNI') {
        const durIDT = a.duration === 'THIS_ATTACK_PHASE' ? 'このアタックフェイズの間' : a.duration === 'NEXT_TURN' ? '次のターンの間' : 'このターン';
        const whoIDT = a.trigger.attackerOwner === 'self' ? 'あなたの' : '対戦相手の';
        // 🆕アタッカーのカード条件（2026-08-31 続き747・`WX25-CP1-085-E1`「あなたの**黒の＜ブルアカ＞の**シグニ
        //   1体がアタックしたとき」）。JSON に載っているのに逆翻訳へ出ないと「主語の限定が落ちた」ように読める。
        const attackerFilterJa = filterJa(a.trigger.attackerFilter ?? {});
        const onceIDT = a.once ? '次に' : '';
        // 🆕§5.3 `O-181`（2026-09-02）＝「**そのアタック終了時に**」（`WX14-018-E4`）。
        //   🔴落とすと「アタック宣言時に発火」と同じ文になり、**アタック自体を消していた旧実装と区別できない**。
        const atEndIDT = a.trigger.attackEnd ? 'そのアタック終了時に' : '';
        return `${durIDT}、${onceIDT}${whoIDT}${attackerFilterJa}シグニがアタックしたとき、${atEndIDT}${actionJa(a.effect)}`;
      }
      // ON_SIGNI_BANISH_BATTLE（タスク12(lxi) 第7波・WX24-P4-011-E3）：遅延トリガーは**プレイヤー**に
      // 設置されるので主語は「あなたのシグニ」＝timingJa の「このシグニが…」（シグニ自身の【自】用）は使えない。
      if (a.trigger?.timing === 'ON_SIGNI_BANISH_BATTLE') {
        const durIDT = a.duration === 'THIS_ATTACK_PHASE' ? 'このアタックフェイズの間' : a.duration === 'NEXT_TURN' ? '次のターンの間' : 'このターン';
        const nextIDT = a.once ? '次に' : '';
        return `${durIDT}、${nextIDT}あなたの${filterJa(a.trigger.banisherFilter ?? {})}シグニがバトルによってシグニ1体をバニッシュしたとき、${actionJa(a.effect)}`;
      }
      // 🆕2026-08-31 続き749＝汎用 timing の遅延（ドロー／手札を捨てた／手札から公開した）。
      //   `timingJa` のフォールバックだと「このシグニが…」になり主語が効果元へすり替わるので専用文にする。
      if (a.trigger?.timing === 'ON_DRAW' || a.trigger?.timing === 'ON_HAND_DISCARDED'
        || a.trigger?.timing === 'ON_REVEALED_FROM_HAND') {
        const durG = a.duration === 'THIS_ATTACK_PHASE' ? 'このアタックフェイズの間' : a.duration === 'NEXT_TURN' ? '次のターンの間' : 'このターン';
        const filG = a.trigger.triggerFilter ? filterJa(a.trigger.triggerFilter) : '';
        const evG = a.trigger.timing === 'ON_DRAW' ? 'あなたがカードを1枚引いたとき'
          : a.trigger.timing === 'ON_HAND_DISCARDED' ? `対戦相手が${filG}手札を1枚捨てたとき`
          : `あなたが手札から${filG}カードを1枚以上公開したとき`;
        return `${durG}、${evG}、${actionJa(a.effect)}`;
      }
      // 🆕ON_PLAY 遅延（2026-08-31 続き748・`WXDi-P09-010-E3`）。`timingJa` のフォールバックだと
      //   「このシグニが場に出たとき」になり、**主語が効果元自身にすり替わる**ので専用文にする。
      if (a.trigger?.timing === 'ON_PLAY') {
        const durIDT = a.duration === 'THIS_ATTACK_PHASE' ? 'このアタックフェイズの間' : a.duration === 'NEXT_TURN' ? '次のターンの間' : 'このターン';
        const byEff = a.trigger.placedByEffect ? '効果によって' : '';
        return `${durIDT}、あなたの${filterJa(a.trigger.triggerFilter ?? {})}シグニ1体が${byEff}場に出たとき、${actionJa(a.effect)}`;
      }
      // 🆕§5.3 `O-73`（2026-08-26）＝`WX24-P3-030-E2`。`timingJa` のフォールバックだと
      //   「あなたか対戦相手のデッキから…」になり、**原文の「あなたの効果１つによって」が消える**ので専用文にする。
      if (a.trigger?.timing === 'ON_CARD_MILLED_FROM_DECK') {
        const whoIDT = a.trigger.milledDeckOwner === 'opponent' ? '対戦相手の'
          : a.trigger.milledDeckOwner === 'any' ? 'あなたか対戦相手の' : 'あなたの';
        const minIDT = a.trigger.milledMinCount ?? 1;
        return `このターン、あなたの効果1つによって${whoIDT}デッキからカードが合計${minIDT}枚以上トラッシュに置かれたとき、${actionJa(a.effect)}`;
      }
      const cf = a.trigger?.crasherFilter;
      const subjIDT = cf
        ? `あなたの${cf.color ? [].concat(cf.color).join('・') + 'の' : ''}${cf.story ? '＜' + [].concat(cf.story).join('・') + '＞の' : ''}${cf.cardClass ? '＜' + [].concat(cf.cardClass).join('・') + '＞の' : ''}シグニが`
        : '';
      const trigJaIDT = a.trigger?.timing === 'ON_OPP_LIFE_CRASHED'
        ? '対戦相手のライフクロス1枚をクラッシュしたとき'
        : (timingJa[a.trigger?.timing] ?? a.trigger?.timing ?? '');
      return `このターン、${subjIDT}${trigJaIDT}、${actionJa(a.effect)}`;
    }
    case 'REMOVE_ABILITIES': {
      // action内 until が curated JSON で落ちている場合、原文の「能力を失い/失う」文から期間注記を復元（§5b・タスクA）
      // §6.4 O-3: `NEXT_TURN` / `UNTIL_OPP_TURN_END` を描かないと **PERMANENT と同じ文**になり、
      //   期間が違う3つの JSON を逆翻訳が区別できない（＝engine を直しても計器に映らない偽陰性）。
      const durRA = a.until === 'UNTIL_END_OF_TURN' ? '（ターン終了時まで）'
        : a.until === 'NEXT_TURN' ? '（次のターンの間）'
        : a.until === 'UNTIL_NEXT_OWN_TURN_END' ? '（次のあなたのターン終了時まで）'
        : a.until === 'UNTIL_OPP_TURN_END' ? '（次の対戦相手のターン終了時まで）'
        : restoreLeadDuration(/能力を(?:失い|失う|得られない)/);
      if (a.keywords?.length) {
        return `${targetJa(a.target)}は${a.keywords.map((keyword: string) => `【${keyword}】`).join('')}を失い、新たに得られない${durRA}`;
      }
      // §6.3「正面」サブ機構(b)(e): filter.frontOfSelf は原文が「このシグニの正面のシグニ」＝owner 接頭辞を出さない。
      // abilityTypes は「【出】能力は発動しない」等の種別限定（WXK11-029-E1）。
      if (a.target?.filter?.frontOfSelf) {
        const kinds: string[] | undefined = a.abilityTypes;
        return kinds?.length
          ? `このシグニの正面のシグニの${kinds.map((k: string) => `【${k}】`).join('')}能力は発動しない`
          : `このシグニの正面のシグニは能力を失い、新たに得られない${durRA}`;
      }
      const subjRA = a.targetsTriggerSource ? 'それ（トリガー元シグニ）' : a.target?.thisCardOnly ? 'このシグニ' : targetJa(a.target);
      // 🆕§5.3 `O-130`＝「**効果によって得ている**能力を失う」。落とすと全能力喪失と同じ文になり、
      //   **印刷能力まで消していた旧実装と区別できない**（＝直しても計器に映らない）。
      if (a.grantedOnly) {
        return `${subjRA}は効果によって得ている能力を失う${durRA}`;
      }
      // 🆕**2026-08-31 続き752**＝`abilityTypes`（【常】能力だけを失う 等）を**汎用枝でも**描く。
      //   🔴従来は `filter.frontOfSelf` 枝にしか描画が無く、そこを通らない効果では
      //   「全能力を失う」と同じ文になっていた＝**過剰実行と正しい実装が逆翻訳で区別できない**
      //   （`WX25-P2-055-E2` の finding が実際にここで残っていた）。
      if (a.abilityTypes?.length && !a.keywords?.length) {
        return `${subjRA}は${(a.abilityTypes as string[]).map(k => `【${k}】`).join('')}能力を失い、新たに得られない${durRA}`;
      }
      // alsoKeys: 「場にある**キーと**シグニ」＝シグニに加えてそのプレイヤーの全キーも失う（§6.4 O-16(b)）。
      // 落とすと「シグニだけ」に見えて、キー側の実装が入ったことが計器に映らない。
      // allZones: 場だけでなく手札／エナ／トラッシュも対象（§6.4 O-17）。落とすと場限定と同じ文になり、
      // 領域を跨いだことが計器に映らない。
      if (a.target?.allZones) {
        return `${ownerJa(a.target?.owner)}手札と場とエナゾーンとトラッシュにある${filterJa(a.target?.filter)}シグニは能力を失い、新たに得られない${durRA}`;
      }
      // 🆕extraZones: 足すゾーンを明示した形（「場とトラッシュにある」）。落とすと場限定に見える。
      if (a.target?.extraZones?.length) {
        const zoneJaRA: Record<string, string> = { hand: '手札', energy: 'エナゾーン', trash: 'トラッシュ' };
        const zonesRA = ['場', ...a.target.extraZones.map((z: string) => zoneJaRA[z] ?? z)].join('と');
        return `${ownerJa(a.target?.owner)}${zonesRA}にある${filterJa(a.target?.filter)}シグニは能力を失い、新たに得られない${durRA}`;
      }
      if (a.alsoKeys) {
        return `${ownerJa(a.target?.owner)}場にあるすべてのキーと${filterJa(a.target?.filter)}シグニは能力を失い、新たに得られない${durRA}`;
      }
      // alsoCenterLrig: 「**センタールリグと**すべてのシグニ」（段2 第45バッチ）。落とすとシグニだけに見えて、
      // ルリグ側（`lrig_abilities_disabled`）が効いていることが計器に映らない。
      if (a.alsoCenterLrig) {
        return `${ownerJa(a.target?.owner)}センタールリグとすべての${filterJa(a.target?.filter)}シグニは能力を失い、新たに得られない${durRA}`;
      }
      return `${subjRA}は能力を失い、新たに得られない${a.frontOfSelf ? '（正面）' : ''}${durRA}`;
    }
    case 'GRANT_PROTECTION': {
      // CONTINUOUS の self/any count≠ALL（filter/subjectFilterなし）は engine 上「このシグニのみ」に解決される
      const protThisOnly = effectType === 'CONTINUOUS' && !a.subjectFilter && a.target
        && a.target.count !== 'ALL' && !a.target.filter
        && (a.target.owner === 'self' || a.target.owner === 'any');
      const subjOwnerJa = a.subjectFilter ? ownerJa(a.subjectOwner ?? 'self') : '';
      const subjNoun = a.subjectFilter?.cardType === 'レゾナ' ? 'レゾナ' : 'シグニ';
      // subjectFilter も target も無い CONTINUOUS ＝ engine（`collectEffectImmuneSigni` の
      // `else { immune.add(sourceNum) }`）が**発生源シグニ自身だけ**を守る形。主語なしで
      // 「シグニは…」と書くと場の全シグニと読めてしまうので「このシグニ」と明示する（タスク12(cxiii)）。
      const protSelfOnly = effectType === 'CONTINUOUS' && !a.subjectFilter && !a.target;
      // targetsTriggerSource:「それ（トリガー元シグニ）」＝出現条件の支払いで場に出たレゾナ等（`WX14-049`）。
      // ⚠他の action（POWER_MODIFY / UP / GRANT_KEYWORD…）は既に表示していたが**ここだけ抜けており**、
      //   `target` を素で読んで「あなたのシグニ1体」と書いていた＝**対象が広く見える誤読**を生む。
      const subject = a.targetsTriggerSource ? 'それ（トリガー元シグニ）'
        : protThisOnly || protSelfOnly ? 'このシグニ'
        : a.target ? targetJa(a.target) : subjOwnerJa + filterJa(a.subjectFilter) + subjNoun;
      const protectionDurationJa = effectType !== 'CONTINUOUS'
        ? a.duration === 'UNTIL_END_OF_TURN' ? 'ターン終了時まで、'
          : a.duration === 'UNTIL_NEXT_OWN_TURN_END' ? '次のあなたのターン終了時まで、'
          : a.duration === 'UNTIL_NEXT_OWN_TURN_END' ? '次のあなたのターン終了時まで、'
        : a.duration === 'UNTIL_OPP_TURN_END' ? '次の対戦相手のターン終了時まで、' : ''
        : '';
      // 🆕`duringOppTurn`＝「対戦相手のターンの間」だけ有効（落とすと永続耐性に読める）。
      const oppTurnJa = a.duringOppTurn ? '対戦相手のターンの間、' : '';
      const timedProtection = (body: string): string => `${oppTurnJa}${protectionDurationJa}${body}`;
      if (a.sourceEffectType === 'LIFE_BURST') return timedProtection(`${subject}は${ownerJa(a.sourceOwner)}ライフバーストの効果を受けない`);
      if (a.fromAll && a.exceptSource) {
        const exceptOwner = ownerJa(a.exceptSource.sourceOwner);
        return timedProtection(`${subject}は${exceptOwner}${a.exceptSource.sourceType}以外からの効果を受けない`);
      }
      // 例外なしの fromAll＝「〜の効果を受けない」。`from` が空なので下の軸トークン分岐へ落ちると
      // 軸リストが空になり **「対戦相手の効果によってない」** という壊れた文になっていた（3効果）。
      if (a.fromAll) return timedProtection(`${subject}は${ownerJa(a.sourceOwner)}効果を受けない`);
      const fromArr: string[] = a.from ?? [];
      const srcTypes = ['ルリグ', 'シグニ', 'スペル', 'アーツ'];
      const srcTokens = fromArr.filter(f => srcTypes.includes(f));
      // sourceCostMin:「コストの合計がN以上の、アーツとスペルの効果を受けない」（WX15-031）
      const costMinJa = a.sourceCostMin !== undefined ? `コストの合計が${a.sourceCostMin}以上の、` : '';
      // sourceFilter.costMax:「コストの合計がN以下の対戦相手のアーツの効果を受けない」。
      // 発生源カードを matchesFilter する実装と同じ制約を描き、無制限アーツ耐性との偽同一を防ぐ。
      const srcCostMax = (a.sourceFilter as { costMax?: number } | undefined)?.costMax;
      const costMaxJa = srcCostMax !== undefined ? `コストの合計が${srcCostMax}以下の` : '';
      // sourceFilter の**レベル上限**（「対戦相手のレベルN以下のシグニの効果を受けない」WXK10-035）。
      // これを描かないと、レベル1以下版とレベル2以下版が逆翻訳で**同じ文**になり
      // 「engine は区別しているのに原文照合では見えない」偽陰性になる（タスク12(cxiii)）。
      const srcLvMax = (a.sourceFilter as { level?: { max?: number } } | undefined)?.level?.max;
      const srcLvJa = srcLvMax !== undefined ? `レベル${srcLvMax}以下の` : '';
      // 🆕`sourceSharedColorWithSelf`＝「**自身と共通する色を持つ**対戦相手のシグニの効果を受けない」
      //   （`WX11-032`）。描かないと**全相手シグニからの無条件保護**と逆翻訳が同じ文になり、
      //   engine は区別しているのに原文照合では見えない偽陰性になる。
      const sharedColorJa = a.sourceSharedColorWithSelf ? '自身と共通する色を持つ' : '';
      // 🆕`sourceFilter.powerRange`＝「対戦相手の**パワー15000以上の**シグニの効果を受けない」
      //   （`WX16-024-LAYER-E1`・2026-08-30 §5.2 Sheet2 バッチ6）。描かないと**全相手シグニからの
      //   無条件保護**と同じ文になり、engine は区別しているのに原文照合では見えない偽陰性になる
      //   （`srcLvJa` / `sharedColorJa` と同じ理由）。⚠engine 側は**印刷パワー**で判定する近似。
      const srcPw = (a.sourceFilter as { powerRange?: { min?: number; max?: number } } | undefined)?.powerRange;
      const srcPwJa = srcPw?.min !== undefined ? `パワー${srcPw.min}以上の`
        : srcPw?.max !== undefined ? `パワー${srcPw.max}以下の` : '';
      // ソース種別（ルリグ/シグニ等）の効果耐性 →「対戦相手の、ルリグとシグニの効果を受けない」
      if (srcTokens.length > 0) {
        if (costMaxJa) return timedProtection(`${subject}は${costMaxJa}${ownerJa(a.sourceOwner)}${srcTokens.join('と')}の効果を受けない`);
        if (sharedColorJa) return timedProtection(`${subject}は${sharedColorJa}${ownerJa(a.sourceOwner)}${srcTokens.join('と')}の効果を受けない`);
        if (srcPwJa) return timedProtection(`${subject}は${ownerJa(a.sourceOwner)}${srcPwJa}${srcTokens.join('と')}の効果を受けない`);
        return timedProtection(`${subject}は${ownerJa(a.sourceOwner)}${costMinJa || (srcLvJa ? '' : '、')}${srcLvJa}${srcTokens.join('と')}の効果を受けない`);
      }
      if (fromArr.includes('any')) {
        // 🆕`sourceFilter.color`＝「対戦相手の**白の**カードの効果を受けない」（`WX08-005-E2`）。
        //   描かないと**あらゆる効果への耐性**と同じ文になり、engine は区別しているのに
        //   原文照合では見えない偽陰性になる（`srcLvJa` / `sharedColorJa` と同じ理由）。
        const srcColor = (a.sourceFilter as { color?: string | string[] } | undefined)?.color;
        const srcColorJa = srcColor ? `${([] as string[]).concat(srcColor as never).join('か')}のカードの` : '';
        return timedProtection(`${subject}は${ownerJa(a.sourceOwner)}${srcColorJa}効果を受けない`);
      }
      // 軸トークン（BANISH/BOUNCE/DOWN）→「対戦相手の効果によってバニッシュされない」等。
      // bySourceType/bySourceLevel は発生源の複数種別と表記レベル制限を両方描く。
      const axisJa: Record<string, string> = { BANISH: 'バニッシュされ', BOUNCE: '手札に戻され', DOWN: 'ダウンし', FREEZE: '凍結され', POWER_MODIFY: 'パワーを増減され' };
      const axes = fromArr.filter(f => axisJa[f] !== undefined || !srcTypes.includes(f)).map(f => axisJa[f] ?? (f + 'され'));
      const byTypes: string[] = a.bySourceType
        ? (Array.isArray(a.bySourceType) ? a.bySourceType : [a.bySourceType])
        : [];
      const byLevel = a.bySourceLevel as number | { min?: number; max?: number } | undefined;
      let byLevelJa = '';
      if (typeof byLevel === 'number') byLevelJa = `レベル${byLevel}の`;
      else if (byLevel?.min !== undefined && byLevel.max !== undefined && byLevel.min === byLevel.max) byLevelJa = `レベル${byLevel.min}の`;
      else if (byLevel?.min !== undefined && byLevel.max !== undefined) byLevelJa = `レベル${byLevel.min}以上${byLevel.max}以下の、`;
      else if (byLevel?.min !== undefined) byLevelJa = `レベル${byLevel.min}以上の、`;
      else if (byLevel?.max !== undefined) byLevelJa = `レベル${byLevel.max}以下の、`;
      const srcQ = byTypes.length > 0
        ? `${byLevelJa}${byTypes.join('と')}の`
        : byLevelJa ? `${byLevelJa}カードの` : '';
      return `${protectionDurationJa}${subject}は${ownerJa(a.sourceOwner)}${srcQ}効果によって${axes.join('・')}ない`;
    }
    case 'GRANT_FIELD_SHADOW': return `${filterJa(a.filter)}${ownerJa(a.targetOwner)}シグニは【${a.keyword}】を得る`;
    case 'GRANT_FIELD_SIGNI_ABILITY': return a.thisCardOnly
      ? `このシグニは『${(a.abilities || []).map(effJa).join(' / ')}』を得る`
      : `${ownerJa(a.targetOwner)}${filterJa(a.filter)}シグニは『${(a.abilities || []).map(effJa).join(' / ')}』を得る`;
    case 'GRANT_SOUL_HOST_ABILITY': return `このカードが【ソウル】として付いている${filterJa(a.filter)}シグニは『${(a.abilities || []).map(effJa).join(' / ')}』を得る`;
    case 'SEQUENCE': {
      if (!a.steps || a.steps.length === 0) return '何もしない';
      // 対象12件の追加コスト2形。内部では OPTIONAL_COST と PAID_ADDITIONAL_COST を
      // 分けて持つが、逆翻訳は原文の「この方法で支払った/捨てた場合」に戻す。
      // 「〈コスト〉を支払わないかぎり、X」（§6.4 O-30）＝機構は任意コストと同じだが原文の語順が逆。
      // ⚠汎用の「支払ってもよい。そして（コストを支払った場合）なら、何もしない、そうでなければ X」に
      //   潰すと原文照合が通らない（意味は合っていても文が別物）。
      if (a.steps.length === 2 && a.steps[0]?.type === 'STUB' && a.steps[0].id === 'OPTIONAL_COST'
          && a.steps[0].unlessPay === true
          && a.steps[1]?.type === 'CONDITIONAL' && a.steps[1].condition?.type === 'PAID_ADDITIONAL_COST'
          && a.steps[1].else) {
        // 🆕2026-08-31＝**支払い軸は `costColors` だけではない**（`fieldTrash` / `handDiscard` /
        //   `energyTrash` / `costText`）。色だけを見ていたので、それ以外だと**空文字**になり
        //   「を支払わないかぎり、…」という主語なしの文が出ていた（`WX24-P1-048-E3`）。
        const oc = a.steps[0];
        const colorsJa = (oc.costColors ?? []).map((c: string) => `《${c}》`).join('');
        const ft = oc.fieldTrash;
        const costJa = colorsJa ? `${colorsJa}を支払わ`
          : ft ? `あなたの${ft.excludeSelf ? '他の' : ''}${filterJa(ft.filter ?? {})}シグニ${numJa(ft.count)}体を場からトラッシュに置か`
          : oc.handDiscard ? `手札を${numJa(oc.handDiscard.count)}枚捨て`
          : oc.energyTrash ? `エナゾーンからカードを${numJa(oc.energyTrash.count)}枚トラッシュに置か`
          : oc.costText ? `${oc.costText}を行わ`
          : 'コストを支払わ';
        return `${costJa}ないかぎり、${actionJa(a.steps[1].else)}`;
      }
      if (a.steps.length === 2 && a.steps[0]?.type === 'STUB' && a.steps[0].id === 'OPTIONAL_COST'
          && a.steps[1]?.type === 'CONDITIONAL' && a.steps[1].condition?.type === 'PAID_ADDITIONAL_COST') {
        const cost = actionJa(a.steps[0]);
        const paidThen = a.steps[1].then;
        if (a.steps[0].costText?.includes('幻水マレガビ') && paidThen?.type === 'SEQUENCE'
            && paidThen.steps?.[0]?.type === 'TRASH' && paidThen.steps?.[1]) {
          return `${cost}。その後、この方法で《幻水マレガビ》を捨てた場合、${actionJa(paidThen.steps[1])}`;
        }
        if ((a.steps[0].costColors ?? []).join('') === '赤') {
          return `${cost}。その後、この方法で《赤》を支払った場合、${actionJa(paidThen)}`;
        }
      }
      if (a.steps.length === 2 && a.steps[0]?.type === 'STUB' && a.steps[0]?.id === 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST'
          && a.steps[1]?.type === 'CONDITIONAL' && a.steps[1]?.condition?.type === 'IS_MY_TURN'
          && a.steps[1]?.then?.type === 'BANISH') {
        return `${actionJa(a.steps[0])}。そうした場合、それをバニッシュする`;
      }
      // 裏向き化を任意にする形。OPTIONAL_ACTIVATE は制御用なので、逆翻訳では
      // 後続の「裏向きにする」へ「てもよい」を戻して原文の1文として描く。
      if (a.steps.length === 3 && a.steps[0]?.type === 'STUB' && a.steps[0]?.id === 'OPTIONAL_ACTIVATE'
          && a.steps[1]?.type === 'STUB' && a.steps[1].id === 'SIGNI_FLIP_FACEDOWN'
          && a.steps[1].faceDownTarget?.upToCount
          && a.steps[2]?.type === 'STUB' && a.steps[2].id === 'FLIP_FACE_DOWN_SIGNI') {
        return `${actionJa(a.steps[1]).replace(/にする$/, 'にしてもよい')}。${actionJa(a.steps[2])}`;
      }
      // DO_THREE_THINGS が先頭のSEQUENCEは、その1STUBが原文「N つを行う。①②③」全体を表現し、
      // 後続 step は parser の冗長な再パース（②③の consequence を重複描画）なので先頭のみ描画する。
      if (a.steps[0]?.type === 'STUB' && a.steps[0]?.id === 'DO_THREE_THINGS') {
        return actionJa(a.steps[0]);
      }
      // 空文字ステップ（engine が no-op スキップする説明テキスト系STUB等）は結合から除外する。
      const pairs = a.steps.map((s: any) => ({ step: s, part: actionJa(s, effectType) as string })).filter((p: any) => p.part !== '');
      if (pairs.length === 0) return '何もしない';
      return pairs.reduce((acc: string, { step, part }: any, i: number) => {
        if (i === 0) return part;
        // IS_MY_TURN の CONDITIONAL は「そうした場合」で始まるので「そして」は不要
        if (step?.condition?.type === 'IS_MY_TURN' || part.startsWith('そうした場合')) {
          // OPPONENT_PAY_OPTIONAL 直後の then は「支払わ**なかった**場合に実行」（executor:2339 の skip 枝）
          // ＝「そうした場合」では意味が反転するため「そうしなかった場合」に置き換える
          // ⚠`thenOnPay`（§6.4・続き425）が立っている STUB は**極性が逆**＝「支払ったら実行」なので
          //   原文どおり「そうした場合」のまま出す（反転すると逆翻訳が原文照合の役に立たなくなる）。
          const prevQ = pairs[i - 1]?.step as { type?: string; id?: string; thenOnPay?: boolean } | undefined;
          if (prevQ?.type === 'STUB' && prevQ?.id === 'OPPONENT_PAY_OPTIONAL' && !prevQ.thenOnPay && part.startsWith('そうした場合、')) {
            return acc + '。そうしなかった場合、' + part.slice('そうした場合、'.length);
          }
          return acc + '。' + part;
        }
        return acc + '。そして' + part;
      }, '');
    }
    case 'REPEAT': {
      // §5.3 `O-87`＝回数が動的（`countRef`）なら回数の出どころを日本語で出す。
      // ⚠固定値 `count` をそのまま描くと **0 と表示されて「1度も行わない」に読めてしまう**
      //   （payload では 0 がプレースホルダ）。
      const timesJa = (a as { countRef?: { $ref?: string } }).countRef
        ? `${refCountJa((a as { countRef?: { $ref?: string } }).countRef!.$ref ?? '')}につき1回`
        : `${numJa(a.count)}回`;
      return `以下を${timesJa}行う。「${actionJa(a.action)}。」`;
    }
    // §5.3 `O-87`＝色の選択（選んだ色は `SELECTED_COLOR` 条件が読む）。
    case 'SELECT_COLOR':
      return a.from === 'last_processed'
        ? 'この方法で処理したカード1枚につき、そのカードに含まれる色1つを選択する'
        : `あなたのエナゾーンにあるカードが持つ色から最大${numJa(a.count ?? 1)}色まで選ぶ`;
    case 'PREVENT_REFRESH':
      return 'このターンと次のターンの間、あなたはリフレッシュできない';
    case 'CHOOSE': {
      // 原文「以下の[N]つから[M]つ（まで）を選ぶ。①…②…」に合わせる（N=from_count）。区切りは規約の「 / 」。
      // choice.condition＝「あなたの場に〜がある場合、」等の選択肢自体の選択可否ゲート（続き105・execChoose の available 判定に対応）。
      const chOpts = (a.choices || []).map((c: any) => {
        const body = actionJa(c.action);
        if (c.condition?.type === 'TURN_OWNER') {
          return `${c.condition.owner === 'opponent' ? '対戦相手' : 'あなた'}のターンの場合、${body}`;
        }
        return c.condition ? `${condJa(c.condition)}場合、${body}` : body;
      }).filter((s: string) => s !== '');
      const totalCh = a.from_count ?? (a.choices?.length ?? chOpts.length);
      const cntCh = a.countChoose?.countFromZone
        ? `${countFromZonePerJa(a.countChoose.countFromZone, 'つ', a.countChoose.upTo)}選ぶ`
        : a.countChoose
        ? `${numJa(a.countChoose.count)}つ${a.countChoose.upTo ? 'まで' : 'を'}選ぶ`
        : a.upTo ? `${numJa(a.choose_count)}つまで選ぶ` : `${numJa(a.choose_count)}つを選ぶ`;
      // betChoose＝「あなたがベットしていた場合、代わりにKつ(まで)選ぶ」の択一（engine が is_betting で choose_count 上書き）。
      const betCh = a.betChoose
        ? `。あなたがベットしていた場合、代わりに${numJa(a.betChoose.thenChooseCount)}つ${a.betChoose.thenUpTo ? 'まで' : ''}選ぶ`
        : '';
      // recollectArts＝「《リコレクトアイコン》［N枚以上］代わりにKつ(まで)選ぶ」（engine が excludeSource 付き
      // ルリグトラッシュのアーツ枚数で choose_count を上書き）。§3タスク6 E＝**機構は実装済みなのに逆翻訳が
      // 丸ごと落としており原文照合できず census 高シグナルに残っていた**（betChoose と同型なので並べて出す）。
      const recoCh = a.recollectArts
        ? `。《リコレクトアイコン》［${a.recollectArts.minArts}枚以上］代わりに${numJa(a.recollectArts.thenChooseCount)}つ${a.recollectArts.thenUpTo ? 'まで' : ''}選ぶ`
        : '';
      // conditionChoose＝「〈盤面条件〉の場合、代わりにKつ(まで)選ぶ」（§6.4 O-11）。
      // ⚠betChoose/recollectArts と同型＝**書かないと原文照合で「代わりに」節が消えて見える**。
      const condCh = a.conditionChoose
        ? `。${condJa(a.conditionChoose.condition)}なら代わりに${numJa(a.conditionChoose.thenChooseCount)}つ${a.conditionChoose.thenUpTo ? 'まで' : ''}選ぶ`
        : '';
      // 🔴**誰が選ぶか**を書かないと原文照合できない（§5.3 `O-60` 第14バッチ）＝「対戦相手は以下の2つから
      //   1つを選び、あなたはそれを行う」は**選ぶ主体が相手**であることが効果の要点。
      //   `opponentResponds` を落とすと「あなたが選ぶ」と読めてしまい、逆翻訳が原文と真逆になる。
      const chooserCh = a.opponentResponds ? '対戦相手は' : '';
      // 🆕noRepeat＝「まだ選んでいないもの」（このゲーム中に選んだ選択肢は二度と選べない）。
      //   落とすと毎回同じ選択肢を取れる強い効果に読める（`WXDi-P11-003`）。
      const noRepCh = a.noRepeat ? 'まだ選んでいないもの' : '';
      return `${chooserCh}以下の${numJa(totalCh)}つから${noRepCh}${cntCh}${betCh}${recoCh}${condCh}【${chOpts.join(' / ')}】`;
    }
    case 'CONDITIONAL': {
      // IS_MY_TURN は「そうした場合」マーカーとして使われる
      if (a.condition?.type === 'IS_MY_TURN') {
        return `そうした場合、${actionJa(a.then)}`;
      }
      if (a.condition?.type === 'TURN_OWNER') {
        const prefix = `${a.condition.owner === 'opponent' ? '対戦相手' : 'あなた'}のターンの場合、`;
        return `${prefix}${actionJa(a.then)}${a.else ? `、そうでなければ${actionJa(a.else)}` : ''}`;
      }
      if (a.condition?.type === 'LAST_PROCESSED_COUNT_GTE' && a.then?.type === 'STUB'
          && a.then.id === 'DRAW_DISCARD_COUNT_PLUS_N') {
        const body = actionJa(a.then).replace(/^この方法でカードを[０-９\d]*枚以上捨てた場合、/, '');
        return `${condJa(a.condition)}なら、${body}`;
      }
      if (a.condition?.type === 'ENERGY_COUNT' && a.condition.owner === 'opponent'
          && a.then?.type === 'TRASH' && a.then.target?.type === 'ENERGY_CARD') {
        const n = numJa(a.condition.value);
        if (a.then.target?.filter?.isTriggerSource) {
          return `対戦相手のエナゾーンにカードが${n}枚以上あり、このターンにこの能力でカードをトラッシュに置いていない場合、そのカードをトラッシュに置く`;
        }
        return `そこに${n}枚以上のカードがある場合、あなたはそこから対象のカード１枚をトラッシュに置く`;
      }
      return `${condJa(a.condition)}なら、${actionJa(a.then)}${a.else ? `、そうでなければ${actionJa(a.else)}` : ''}`;
    }
    case 'BANISH_SUBSTITUTE': {
      const sc = a.substituteCost ?? {};
      // cost は「て形」で終える（「トラッシュに置いて」等）→ 末尾に「もよい」を付ける
      const cost = sc.discardSpell ? `手札からスペルを${sc.discardSpell}枚捨てて`
        : sc.trashStackSpell ? `このシグニの下からスペル${sc.trashStackSpell}枚をトラッシュに置いて`
        : sc.powerReduction ? `このシグニのパワーを－${sc.powerReduction}して`
        : sc.lifeCrash ? `あなたのライフクロス${sc.lifeCrash}枚をクラッシュして` : '';
      // trigger.filter.thisCardOnly＝「このシグニが」（targetJa は「あなたのシグニ1体」に落ちるため個別に出す）
      const subj = a.trigger?.filter?.thisCardOnly ? 'このシグニ' : targetJa(a.trigger);
      return `${subj}がバニッシュされる場合、代わりに${cost}もよい`;
    }
    case 'LOOK_PICK_CHAIN': {
      // 🆕`gateZoneOnly`＝「【ゲート】があるあなたのシグニゾーンに出し」（落とすと空きゾーンならどこでもよいと読める）。
      const destVerb = (t: string, gate?: boolean) => t === 'field' && gate ? '【ゲート】があるあなたのシグニゾーンに出し'
        : t === 'hand' ? '手札に加え' : t === 'energy' ? 'エナゾーンに置き' : t === 'field' ? '場に出し' : t === 'beat' ? '【ビート】にし' : t === 'deck_top' ? 'デッキの一番上に戻し' : t === 'trap' ? '【トラップ】としてシグニゾーンに設置し' : t === 'seed' ? '【シード】としてシグニゾーンに出し' : t === 'magic_box' ? '【マジックボックス】としてシグニゾーンに設置し' : t === 'under' ? 'このシグニの下に置き' : 'トラッシュに置き';
      const stageJa = (s: any) => `${s.sharesClassWithPrev ? 'そのシグニと共通するクラスを持つ' : ''}${s.notSharesClassWithPrev ? 'そのシグニと共通するクラスを持たない' : ''}${filterJa(s.filter)}${s.pickNoun ?? 'シグニ'}を${s.pickCount === 'ALL' ? (s.pickUpTo ? '好きな枚数' : 'すべて') : `${numJa(s.pickCount)}枚${s.pickUpTo ? 'まで' : ''}`}${destVerb(s.then, s.gateZoneOnly)}`;
      // ⚠ location を先に見る（従来 energy が既定の「デッキの一番下」に化けていた＝WX24-P4-022-E2）
      const remJa = a.remainder?.location === 'trash' ? '残りをトラッシュに置く'
        : a.remainder?.location === 'energy' ? '残りをエナゾーンに置く'
        : a.remainder?.location === 'hand' ? '残りを手札に加える'
        // §5.3 `O-51`（2026-08-29）＝**「好きな順番で」は payload（`remainder.reorder`）から描く**。
        //   🔴旧実装は bottom の既定文に「好きな順番で」を**常に**入れ、top には**決して**入れなかった＝
        //     原文が「残りをデッキの一番下に置く」（順序の指定なし）でも「好きな順番で」と嘘をつき、
        //     逆に「残りを好きな順番でデッキの一番上に戻す」は指定が消えていた。どちらも逆翻訳の偽情報。
        : a.remainder?.position === 'top'
          ? (a.remainder?.reorder ? '残りを好きな順番でデッキの一番上に戻す' : '残りをデッキの上に戻す')
        : a.remainder?.shuffle ? '残りをシャッフルしてデッキの一番下に置く'
        : a.remainder?.reorder ? '残りを好きな順番でデッキの一番下に置く'
        : '残りをデッキの一番下に置く';
      const supLPC = (a.stages || []).some((s: any) => s.then === 'field' && s.suppressOnPlay) ? '。その【出】能力は発動しない' : '';
      // §6.4 O-2: `opponentResponds` を落とすと「相手のデッキを**自分が**見て選ぶ」と同じ文になる（偽陰性）。
      const pickerLPC = a.opponentResponds ? '対戦相手はその中から' : 'その中から';
      return `${ownerJa(a.owner)}デッキの上からカードを${numJa(a.revealCount)}枚見る。${pickerLPC}${(a.stages || []).map(stageJa).join('、')}、${remJa}${supLPC}`;
    }
    case 'REVEAL_AND_PICK': {
      const rapOwner = a.owner ?? a.from?.owner;
      const rapCnt = a.revealCount ?? a.count;
      const rapFilter = a.filter ?? a.pickFilter;
      const pickN = a.pickCount === 'ALL' ? (a.pickUpTo ? '好きな枚数' : 'すべて') : `${numJa(a.pickCount ?? 1)}枚${a.pickUpTo ? 'まで' : ''}`;
      // anyOf 単独なら「スペルか＜原子＞のシグニ」がそのまま名詞句になる＝pickNoun を後置しない
      const filterStr = rapFilter?.anyOf && Object.keys(rapFilter).length === 1
        ? anyOfJa(rapFilter.anyOf)
        : rapFilter ? filterJa(rapFilter) + (a.pickNoun ?? 'シグニ') : 'カード';
      // 選んだ複数枚どうしの相互差異（「その中からそれぞれレベルの異なるシグニを４枚まで」WXK08-027-E2）。
      // ⚠旧実装は `TargetFilter.eachDistinct*`（engine に消費が無い死にキー）を描いていた＝段2 第42バッチで正準形へ。
      const rapConstraint = constraintJa(a.selectionConstraint);
      const revealJa = rapCnt?.$ref === 'last_processed_level'
        ? `${ownerJa(rapOwner)}デッキの上からこの方法でトラッシュに置いたシグニのレベルと同じ枚数のカードを見て`
        : rapCnt?.$ref === 'last_processed_count'
          ? `${ownerJa(rapOwner)}デッキの上からこの方法で処理したカードと同じ枚数のカードを公開し`
        : rapCnt?.$ref === 'center_lrig_level'
          ? `${ownerJa(rapOwner)}デッキの上からあなたのセンタールリグのレベルと同じ枚数のカードを公開し`
        : a.from === 'deck_bottom'
          ? `${ownerJa(rapOwner)}デッキの一番下のカードを公開し`
          : `${ownerJa(rapOwner)}デッキ${rapCnt ? '上' + numJa(rapCnt) + '枚' : ''}を公開し`;
      // 残り（remainder）の行き先
      const rem = a.remainder;
      // remainder.shuffle（「残りをシャッフルしてデッキの一番下に置く」PR-434）を落とさない
      const remShuf = rem?.shuffle ? 'シャッフルして' : '';
      const remJa = !rem ? ''
        : rem.location === 'trash' ? `、残りを${remShuf}トラッシュに置く`
        : rem.location === 'deck'
          // split_top_bottom＝ピックのあとに残りを上下へ振り分ける（タスク12(lix)）。落とすと分割が見えない。
          // §5.3 `O-51`＝`reorder` が立っていれば「好きな順番で」を出す（payload から描く）。
          ? (rem.position === 'split_top_bottom' ? '、好きな枚数を好きな順番でデッキの一番下に置き、残りを好きな順番でデッキの一番上に戻す'
             : rem.position === 'bottom' ? `、残りを${remShuf}${rem.reorder ? '好きな順番で' : ''}デッキの一番下に置く`
             : `、残りを${remShuf}${rem.reorder ? '好きな順番で' : ''}デッキの${rem.reorder ? '一番上に戻す' : '上に戻す'}`)
          : '、残りを戻す';
      if ((a.pickCount ?? 1) === 0 && rem?.location === 'deck' && rem.position === 'bottom') {
        return `${ownerJa(rapOwner)}デッキの上からカードを${numJa(rapCnt)}枚公開し、公開したカードを${rem.shuffle ? 'シャッフルして' : ''}デッキの一番下に置く`;
      }
      // 配置系（公開カードを手札/場/エナ/トラッシュ等へ）＝「その中から[filter]を[pickN][動詞]」
      const placeVerb =
        a.handOrField ? (a.handOrFieldAsDown ? '手札に加えるかダウン状態で場に出す' : '手札に加えるか場に出す')
        : a.handOrEnergy ? '手札に加えるかエナゾーンに置く'
        : (a.then?.type === 'ADD_TO_HAND' || a.then?.type === 'TRANSFER_TO_HAND') ? '手札に加える'
        : a.then?.type === 'ADD_TO_FIELD'
          ? `${a.then.asDown ? 'ダウン状態で' : ''}場に出${a.pickUpTo ? 'してもよい' : 'す'}`
        // ENERGY_CHARGE{DECK_CARD} は「選んだ公開札をエナゾーンへ」＝ADD_TO_ENERGY と同義の配置動詞。
        // 落とすと下の「それが〜の場合」枝に流れ、原文にない条件文へ化けて見える（WX13-054）。
        : (a.then?.type === 'ADD_TO_ENERGY'
           || (a.then?.type === 'ENERGY_CHARGE' && a.then?.target?.type === 'DECK_CARD')) ? 'エナゾーンに置く'
        : a.then?.type === 'TRASH' ? 'トラッシュに置く'
        : a.then?.type === 'BANISH' ? 'バニッシュする'
        : !a.then ? (a.pickTo === 'field' ? '場に出す' : a.pickTo === 'hand' ? '手札に加える' : null)
        : null;
      if (placeVerb) {
        if (a.from === 'deck_bottom' && a.then?.type === 'ADD_TO_FIELD'
            && a.pickCount === 1 && a.pickUpTo === true && rem?.location === 'trash') {
          return `${revealJa}、そのカードを場に出すかトラッシュに置く`;
        }
        const suppress = a.then?.type === 'ADD_TO_FIELD' && a.then?.suppressOnPlay
          ? '。それらのシグニの【出】能力は発動しない' : '';
        // §6.4 O-2: 選ぶ主体を明示する。`owner` だけを描くと `opponentResponds` の有無で
        // 逆翻訳が同じ文になり、「相手のデッキを**自分が**覗く」との区別が消える（偽陰性）。
        return `${revealJa}、${a.opponentResponds ? '対戦相手はその中から' : 'その中から'}${rapConstraint}${filterStr}を${pickN}${placeVerb}${remJa}${suppress}`;
      }
      // 別効果系（公開カードが条件）＝「それが[filter]の場合、[then]」。1枚公開時は残り句を省く（原文も省く）。
      if (a.then) {
        const condRem = (rapCnt && rapCnt > 1) ? remJa : '';
        const otherwise = a.elseAction ? `。そうでない場合、${actionJa(a.elseAction)}` : '';
        return `${revealJa}、それが${filterStr}の場合、${actionJa(a.then)}${otherwise}${condRem}`;
      }
      return `${revealJa}、その中から${rapConstraint}${filterStr}を${pickN}処理する${remJa}`;
    }
    case 'REARRANGE_SIGNI': return rearrangeSigniJa(a);
    case 'CHARM_PROTECTION':
      return `あなたの${filterJa(a.signiFilter)}シグニ1体がバニッシュされる場合、代わりにそのシグニに付いている【チャーム】1枚をトラッシュに置いて${a.optional ? 'もよい' : '置く'}`;
    // §5.3 `O-81`：手札のカードをシグニに**裏向きで付ける**（【チャーム】ではない）。
    case 'ATTACH_FACEDOWN_FROM_HAND': {
      const toJaAF = a.to?.filter?.thisCardOnly ? 'このシグニ'
        : `${ownerJa(a.to?.owner)}${filterJa(a.to?.filter)}シグニ${typeof a.to?.count === 'number' ? a.to.count : 1}体`;
      // 「そのシグニが場を離れる場合、追加で…公開し手札に戻す」は `removeFromField` が担う**この付与の性質**
      // （別ステップではない）＝括弧で明示しないと、逆翻訳シート上では原文3文のうち1文しか映らない。
      return `${toJaAF}を対象とし、それにあなたの手札から${filterJa(a.handFilter)}カード${a.count ?? 1}枚を裏向きで付ける`
        + `（付けたカードはそのシグニが場を離れる際に公開され手札に戻る）`;
    }
    case 'ATTACH_CHARM': {
      // TRASH_CARD + thisCardOnly:「このカードを【チャーム】にする」（効果元自身。WX04-102）
      const thisCardCharm = a.charm?.type === 'TRASH_CARD' && a.charm.filter?.thisCardOnly;
      // 枚数・体数は**複数ペア**を表す（続き377n の engine 拡張と対で入れる）。逆翻訳が1枚/1体のままだと
      // 「JSON は直っているのに逆翻訳は直っていない」乖離＝計器の偽陰性になる。
      const cntJa = (c: unknown, unit: string, upTo?: boolean): string =>
        c === 'ALL' ? '好きな数' : `${typeof c === 'number' ? c : 1}${unit}${upTo ? 'まで' : ''}`;
      const charmCntJa = cntJa(a.charm?.count, '枚', a.charm?.upToCount);
      const toCntJa = cntJa(a.to?.count, '体', a.to?.upToCount);
      const charmJa = thisCardCharm ? 'このカード'
        : a.charm?.type === 'DECK_CARD' ? `${ownerJa(a.charm?.owner)}デッキの上からカード${charmCntJa}`
        : a.charm?.type === 'TRASH_CARD' ? `${ownerJa(a.charm?.owner)}トラッシュから${filterJa(a.charm.filter)}カード${charmCntJa}`
        : a.charm?.type === 'HAND_CARD' ? `${ownerJa(a.charm?.owner)}手札から${filterJa(a.charm.filter)}カード${charmCntJa}`
        // 🆕場のシグニ自身をチャームに変える形（`WXEX1-28-E1`）。「カード」と描くと出所が読めない。
        : a.charm?.type === 'SIGNI' ? `${ownerJa(a.charm?.owner)}${filterJa(a.charm?.filter)}シグニ${cntJa(a.charm?.count, '体', a.charm?.upToCount)}`
        : `${ownerJa(a.charm?.owner)}カード`;
      // 「好きな数」は数詞ではなく修飾語なので**名詞の前**に置く（「シグニ好きな数の」は日本語にならない）。
      const toJa = a.to?.filter?.thisCardOnly ? 'このシグニ'
        : a.to?.filter?.isTriggerSource ? 'そのシグニ（場に出たシグニ）'
        : a.to?.count === 'ALL' ? `${ownerJa(a.to?.owner)}好きな数の${filterJa(a.to?.filter)}シグニ`
        : `${ownerJa(a.to?.owner)}${filterJa(a.to?.filter)}シグニ${toCntJa}`;
      return `${charmJa}を${a.toOther ? '他の' : ''}${toJa}の【チャーム】にする${a.optional ? '（してもよい）' : ''}`;
    }
    case 'SET_BASE_LEVEL': {
      const thisOnlySBL = a.target?.count !== 'ALL' && (a.target?.owner === 'self' || !a.target?.owner);
      return `${a.until === 'END_OF_TURN' ? 'ターン終了時まで、' : ''}${thisOnlySBL ? 'このシグニ' : targetJa(a.target)}の基本レベルを${a.value}にする`;
    }
    case 'REVEAL_UNTIL': {
      const stop = a.stopCondition;
      const f = stop?.filter;
      const signiJa = f?.levelEqDeclaredNumber && f?.story
        ? `宣言した数字と同じレベルを持つ＜${f.story}＞のシグニ`
        : typeof f?.level === 'number' && f?.story
          ? `レベル${f.level}の＜${f.story}＞のシグニ`
          : `${filterJa(f)}シグニ`;
      const stopJa = stop?.kind === 'levelSum'
        ? `公開されたシグニのレベルの合計が${stop.threshold}以上になるまで`
        : stop?.kind === 'declaredName'
          ? '宣言したカードがめくれるまで'
          : `${signiJa}が${stop?.count === 1 ? '' : `${stop?.count}枚`}めくれるまで`;
      const revealJa = `${ownerJa(a.owner)}デッキを上から${stopJa}公開${a.optional ? 'してもよい' : 'する'}`;
      const restJa = a.restDestination === 'trash' ? 'トラッシュに置く'
        : a.restDestination === 'deck_bottom_shuffled' ? 'シャッフルしてデッキの一番下に置く'
        : a.restDestination === 'deck_bottom' ? 'デッキの一番下に置く'
        : a.restDestination === 'hand' ? '手札に加える' : '場に出す';
      if (!a.hit) return `${revealJa}。公開したカードを${restJa}`;
      const hitFilter = a.hit.filter;
      const hitNoun = hitFilter?.nameEqDeclaredName ? 'そのシグニ'
        : hitFilter?.levelEqDeclaredNumber ? 'それ'
        : a.hit.count === 'ALL' ? (stop?.kind === 'signiCount' && stop.count === 1 ? 'そのシグニ' : 'それら')
        : `${filterJa(hitFilter)}シグニを${a.hit.count}枚${a.hit.upToCount ? 'まで' : ''}`;
      const hitVerb = a.hit.handOrField ? '手札に加えるか場に出し'
        : a.hit.destination === 'hand' ? '手札に加え'
        : a.hit.destination === 'field' ? '場に出し'
        : a.hit.destination === 'trash' ? 'トラッシュに置き'
        : a.hit.destination === 'deck_bottom_shuffled' ? 'シャッフルしてデッキの一番下に置き'
        : 'デッキの一番下に置き';
      const lead = a.hit.count === 'ALL' || hitFilter?.nameEqDeclaredName || hitFilter?.levelEqDeclaredNumber
        ? `${hitNoun}を${hitVerb}` : `その中から${hitNoun}${hitVerb}`;
      return `${revealJa}。${lead}、残りを${restJa}${a.hit.suppressOnPlay ? '。この方法で場に出たシグニの【出】能力は発動しない' : ''}`;
    }
    case 'REVEAL_UNTIL_TO_HAND': {
      const restJa = a.restDest === 'trash' ? '残りをトラッシュに置く'
        : a.restDest === 'deck_bottom_shuffled' ? '公開した他のカードをシャッフルしてデッキの一番下に置く'
        : '公開した他のカードをデッキの一番下に置く';
      return `${ownerJa(a.owner)}デッキを上から${a.revealClass ? `＜${a.revealClass}＞の` : ''}シグニがめくれるまで公開し、そのシグニを手札に加える。そして${restJa}`;
    }
    case 'REVEAL_UNTIL_TO_FIELD':
      return `${ownerJa(a.owner)}デッキを上から${a.revealClass ? `＜${a.revealClass}＞の` : ''}シグニがめくれるまで公開し、そのシグニを場に出し、残りをトラッシュに置く（場に出せないシグニはトラッシュへ）。これを${a.repeat}回繰り返す${a.suppressOnPlay ? '。その【出】能力は発動しない' : ''}`;
    // attackingOnly＝「**アタックしている**シグニ1体を対象」＝候補はいま宣言中のアタッカー（進行中のアタックを落とす）。
    // 無指定は「このターン次にアタックしたとき無効」＝事前登録型で、対象は場の全シグニ（別の意味なので書き分ける）。
    case 'NEGATE_ATTACK': return `${a.attackingOnly ? `${ownerJa(a.target?.owner)}アタックしているシグニ${numJa(a.target?.count ?? 1)}体を対象とし` : a.target?.type === 'CENTER_LRIG_OR_SIGNI' ? `${ownerJa(a.target.owner)}ルリグかシグニ${a.target.count}${a.target.upToCount ? '体まで' : '体'}を対象とし、このターン${typeof a.target.count === 'number' && a.target.count > 1 ? 'それらがそれぞれ次に' : 'それが'}アタックしたとき` : 'そのアタックがあったとき'}${a.escapeDiscard ? `、${a.target?.owner === 'opponent' ? '対戦相手' : 'あなた'}が手札を${a.escapeDiscard}枚捨てないかぎり` : ''}${a.attackingOnly ? '、それの' : 'その'}アタックを無効にする`;
    case 'COUNTER_SPELL': return `スペル${a.maxCost != null ? '（コスト' + a.maxCost + '以下）' : ''}の効果を打ち消す`;
    case 'SHUFFLE_DECK': return `${ownerJa(a.owner)}デッキをシャッフルする`;
    case 'EQUALIZE_ENERGY': return `${a.owner ? ownerJa(a.owner) : '各プレイヤーの'}エナゾーンのカードが${a.targetCount}枚になるようにトラッシュに置く`;
    // ⚠所有者は `target.owner` ではなく `targetOwner`（型は ForceSigniAttackAction）。
    //   従来は `a.target?.owner` を見ていて常に空＝「誰のシグニが強制されるのか」が逆翻訳から落ちていた。
    case 'FORCE_SIGNI_ATTACK':
      return `${a.duration === 'NEXT_TURN' ? `次の${a.targetOwner === 'opponent' ? '対戦相手の' : 'あなたの'}ターンの間、` : ''}${ownerJa(a.targetOwner)}${a.infectedOnly ? '感染状態の' : ''}シグニは可能ならばアタックしなければならない`;
    case 'COST_REDUCTION': {
      const red = Array.isArray(a.reduction) && a.reduction.length > 0
        ? a.reduction.map((e: any) => `《${e.color}×${e.count}》`).join('')
        : 'コスト';
      const costKind = a.isGrowCost ? 'グロウコスト' : 'コスト';
      const tgt = `${a.color ? a.color + 'の' : ''}${a.targetCardType ?? 'カード'}`;
      // 「次に使用する1枚だけ」の一時軽減（スペル＝WX10-073／アーツ＝【チェイン】）は、場の常在軽減と
      // 意味が違う（engine も next_*_cost_reduction に積む1回きりの状態）。逆翻訳でも区別する。
      if (!a.isGrowCost && a.duration === 'UNTIL_END_OF_TURN' && (a.targetCardType === 'アーツ' || a.targetCardType === 'スペル')) {
        return `このターン、あなたが次に${tgt}を使用する場合、それの使用コストは${red}減る`;
      }
      return `あなたが使用する${tgt}の${costKind}は${red}減る`;
    }
    case 'GROW_FREE': return a.levelFilter === 'same'
      ? 'あなたのセンタールリグと同じレベルのルリグ1枚をルリグデッキからグロウコストを支払わずグロウする'
      : 'コストを支払わずにグロウする';
    case 'RETURN_ASSIST_LRIG_TO_DECK':
      if (a.team && a.level !== undefined) {
        return `あなたの＜${a.team}＞のレベル${a.level}のルリグ1体を対象とし、それをルリグデッキに戻す（下のカードは場に残す）`;
      }
      return '《アタックフェイズアイコン》を持たずグロウコストが《無×0》ではないあなたのアシストルリグ1体を対象とし、それをルリグデッキに戻す';
    case 'MUTUAL_DISCARD_AND_DRAW': return a.drawMax
      ? 'あなたと対戦相手は手札をすべて捨て、捨てられた枚数のうち最も大きい数に等しい枚数を双方が引く'
      : 'あなたと対戦相手は手札をすべて捨てる';
    case 'MOVE_TO_ENERGY':
    case 'TRANSFER_TO_ENERGY': return `${targetJa(a.source ?? a.target)}をエナゾーンに置く`;
    case 'REMOVE_CHARM': return `${ownerJa(a.targetOwner)}シグニのチャームを${a.count === 'ALL' ? 'すべて' : a.count}外す`;
    case 'POWER_MODIFY_PER_TRASH_COUNT': {
      // 「対象のパワーを〈trashOwner〉のトラッシュにある〈countFilter〉シグニ〈unitSize〉枚につき±Nする」
      const d = a.deltaPerUnit ?? 0;
      const unit = a.unitSize ?? 1;
      const cf = filterJa(a.countFilter);
      const who = a.trashOwner === 'both' ? '各プレイヤーの' : ownerJa(a.trashOwner);
      // 数える対象は countFilter.cardType で決まる（cardType 無し＝「カード」／スペル等はその語）
      const ct = a.countFilter?.cardType;
      const noun = ct == null ? 'カード' : ([] as string[]).concat(ct).join('か');
      const per = a.countByVariety ? `${noun}の種類${unit > 1 ? `${unit}` : '1'}つ` : `${noun}${unit > 1 ? `${unit}` : '1'}枚`;
      return `${targetJa(a.target, 'シグニ', a.excludeSelf)}のパワーを${who}トラッシュにある${cf}${per}につき${d >= 0 ? '＋' : '－'}${Math.abs(d)}する`;
    }
    case 'POWER_MODIFY_PER_LIFE_COUNT': {
      const d = a.deltaPerLife ?? a.deltaPerUnit ?? 0;
      return `${targetJa(a.target, 'シグニ')}のパワーを${ownerJa(a.lifeOwner)}ライフクロス1枚につき${d >= 0 ? '＋' : '－'}${Math.abs(d)}する`;
    }
    case 'POWER_MODIFY_PER_STACK': {
      const d = a.deltaPerCard ?? a.deltaPerUnit ?? 0;
      return `${targetJa(a.target, 'シグニ')}のパワーをこのシグニの下にあるカード1枚につき${d >= 0 ? '＋' : '－'}${Math.abs(d)}する`;
    }
    case 'POWER_MODIFY_PER_FIELD': {
      // 「対象のパワーを〈countOwner〉の場の〈countFilter〉シグニ1体につき±Nする」
      const d = a.deltaPerUnit ?? a.delta ?? 0;
      const cf = filterJa(a.countFilter);
      const countTypes = ([] as string[]).concat(a.countFilter?.cardType ?? []);
      const countUnit = countTypes.some(t => t === 'ルリグ' || t === 'アシストルリグ') ? 'ルリグ' : 'シグニ';
      const durationPMF = a.duration === 'UNTIL_NEXT_OWN_TURN_END' ? '次のあなたのターン終了時まで、'
        : a.duration === 'UNTIL_NEXT_OWN_TURN_END' ? '次のあなたのターン終了時まで、'
        : a.duration === 'UNTIL_OPP_TURN_END' ? '次の対戦相手のターン終了時まで、'
        : a.duration === 'UNTIL_END_OF_TURN' ? 'ターン終了時まで、' : '';
      return `${durationPMF}${targetJa(a.target, 'シグニ')}のパワーを${ownerJa(a.countOwner)}場の${a.excludeSelf ? '他の' : ''}${cf}${countUnit}1体につき${d >= 0 ? '＋' : '－'}${Math.abs(d)}する`;
    }
    case 'POWER_MODIFY_PER_LEVEL_SUM': {
      // 「対象のパワーを〈countOwner〉の場の〈countFilter〉シグニのレベル1につき±Nする」
      // excludeSelf は対象（target）ではなくカウント対象（場の他シグニ）にかかる → countFilter 側に「他の」を出す
      // CONTINUOUS は engine 上「このシグニのみ」に解決される（effectEngine 参照）
      const d = a.deltaPerLevel ?? 0;
      const cf = filterJa({ ...a.countFilter, excludeSelf: a.excludeSelf || a.countFilter?.excludeSelf });
      const thisOnly = effectType === 'CONTINUOUS' && a.target?.count !== 'ALL'
        && (a.target?.owner === 'self' || a.target?.owner === 'any');
      const tgt = thisOnly ? 'このシグニ' : targetJa(a.target, 'シグニ');
      return `${tgt}のパワーを${ownerJa(a.countOwner)}場の${cf}シグニのレベル1につき${d >= 0 ? '＋' : '－'}${Math.abs(d)}する`;
    }
    case 'POWER_MODIFY_PER_LRIG_LEVEL':
    case 'POWER_MODIFY_PER_ENERGY':
    case 'POWER_MODIFY_PER_CHARM':
    case 'POWER_MODIFY_PER_DECK_COUNT':
    case 'POWER_MODIFY_PER_ENERGY_COLOR':
    case 'POWER_MODIFY_PER_OWN_COLOR':
    case 'POWER_MODIFY_PER_VIRUS_COUNT': {
      const perJaMap: Record<string, string> = {
        POWER_MODIFY_PER_LRIG_LEVEL: 'センタールリグのレベル',
        POWER_MODIFY_PER_ENERGY: 'エナゾーンのカード枚数',
        POWER_MODIFY_PER_CHARM: '【チャーム】の枚数',
        POWER_MODIFY_PER_DECK_COUNT: 'デッキの枚数',
        POWER_MODIFY_PER_ENERGY_COLOR: 'エナゾーンの色の種類数',
        POWER_MODIFY_PER_OWN_COLOR: '自身が持つ色の種類数',
        POWER_MODIFY_PER_VIRUS_COUNT: '【ウィルス】の数',
      };
      // POWER_MODIFY_PER_CHARM で「この方法でトラッシュに置いた」変種は原文どおりに描く
      const per = (a.type === 'POWER_MODIFY_PER_CHARM' && a.sourceLocation === 'trashed_this_effect')
        ? 'この方法でトラッシュに置いた【チャーム】の枚数'
        : (a.type === 'POWER_MODIFY_PER_LRIG_LEVEL' && a.useLastDownedLrigLevelSum)
          ? 'この方法でダウンしたルリグのレベルの合計'
        : (a.type === 'POWER_MODIFY_PER_LRIG_LEVEL' && a.sumFieldLrigLevels)
          ? '場にいるルリグのレベルの合計'
        : (perJaMap[a.type] ?? a.type.replace('POWER_MODIFY_PER_', '') + '数');
      const d = a.deltaPerUnit ?? a.deltaPerLevel ?? a.deltaPerLife ?? a.deltaPerCharm ?? a.deltaPerCard ?? a.deltaPerVirus ?? a.delta ?? a.deltaPerColor ?? 0;
      // count!=='ALL' かつ self/any =「このシグニ」（常時自己強化）
      const thisOnlyPC = a.target?.count !== 'ALL' && (a.target?.owner === 'self' || a.target?.owner === 'any');
      const tgtPC = thisOnlyPC ? 'このシグニ' : targetJa(a.target);
      return `${tgtPC}のパワーを${per}に応じて${d >= 0 ? '＋' : '－'}${Math.abs(d)}ずつ変更する`;
    }
    case 'PLAY_FREE': {
      const srcLoc: Record<string, string> = {
        lrig_deck: 'ルリグデッキ', hand: '手札',
        opp_hand: '対戦相手の手札', opp_trash: '対戦相手のトラッシュ',
        trash: 'あなたのトラッシュ',
      };
      const from = typeof a.source === 'string' ? (srcLoc[a.source] ?? a.source) : targetJa(a.source ?? a.target);
      const noun = a.filter?.cardType ? ([] as string[]).concat(a.filter.cardType).join('か') : 'カード';
      const timingClause = a.useTimingIncludes ? `使用タイミングに《${a.useTimingIncludes}アイコン》を含む` : '';
      const dynamicCostLim = a.costThresholdFromPaidCount
        ? `コストの合計が「この方法で${a.costThresholdFromPaidCount.source === 'discard' ? '捨てたカード' : 'トラッシュに置いたカード'}の枚数${a.costThresholdFromPaidCount.plus ? `＋${a.costThresholdFromPaidCount.plus}` : ''}」以下の`
        : '';
      const costLim = dynamicCostLim || (a.costThreshold != null ? `コストの合計が${a.costThreshold}以下の` : '');
      const restr = a.ignoreRestrictions ? '（限定条件を無視して）' : '';
      // 🆕`ignoreCost:false`＝原文の「（コストは支払う）」＝**踏み倒しではない**。
      //   従来は無条件に「コストを支払わずに」と描いており、逆翻訳だけを見ると差が読めなかった。
      const payJa = a.ignoreCost === false ? 'コストを支払って使用する' : 'コストを支払わずに使用する';
      // 🆕targetsLastProcessed＝「その〜」＝直前に処理したカード自身（落とすと別カードを使えるように読める）。
      const thatOne = a.targetsLastProcessed ? 'この方法で処理した' : '';
      return `${from}から${timingClause}${thatOne}${costLim}${filterJa(a.filter)}${noun}1枚を${restr}${payJa}`;
    }
    case 'PLAY_FREE_FROM_TRASH': {
      const fromPFT = a.filter?.cardType === 'アーツ' ? 'ルリグトラッシュ' : 'トラッシュ';
      const nounPFT = a.filter?.cardType ? ([] as string[]).concat(a.filter.cardType).join('か') : 'カード';
      return `${fromPFT}からコストの合計が${a.costThreshold}以下の${filterJa(a.filter)}${nounPFT}${a.maxCount ?? 1}枚をコストを支払わずに使用する`;
    }
    case 'BANISH_REDIRECT': {
      // bySource＝バニッシュ元の限定（続き217）。無いと「常時・全バニッシュ」に読めてしまう。
      const src = a.bySource === 'battle_with_this' ? 'このシグニとのバトルによって'
        : a.bySource === 'by_this' ? (a.byEffectOnly ? 'このシグニの効果によって' : 'このシグニによって') : '';
      // 🆕consumeOnce＝「次に1回だけ」（§5.3 `O-210`）。無いと「このターン中は何体でも」に読めてしまう。
      const once = a.consumeOnce ? '次に' : '';
      // whenPowerZero＝バニッシュされる側の限定（続き218）。無いと「全バニッシュ」に読めてしまう。
      const p0 = a.whenPowerZero ? 'パワーが0以下の' : '';
      // 属性限定（タスク12(xliv)(a)）＝被バニッシュシグニの絞り込み。無いと「全バニッシュ」に読めてしまう。
      const brf = a.target?.filter ?? {};
      const attr = [
        brf.isFrozen ? '凍結状態の' : '',
        brf.infected ? '感染状態の' : '',
        brf.hasCharm ? '【チャーム】が付いている' : '',
        (brf.level && typeof brf.level === 'object' && brf.level.max !== undefined) ? `レベル${brf.level.max}以下の`
          : (typeof brf.level === 'number' ? `レベル${brf.level}の` : ''),
      ].join('');
      return a.redirectTo === 'exile'
        ? `このターン、${p0}対戦相手の${attr}シグニが${src}バニッシュされる場合、エナゾーンに置かれる代わりにゲームから除外される`
        : src || p0 || attr
          ? `${once}${p0}対戦相手の${attr}シグニが${src}バニッシュされる場合のバニッシュ先をトラッシュに変更する`
          : '対戦相手のシグニのバニッシュ先をトラッシュに変更する';
    }
    case 'COST_INCREASE': {
      const inc = Array.isArray(a.amount) && a.amount.length > 0
        ? a.amount.map((e: any) => `《${e.color}×${e.count}》`).join('')
        : 'コスト';
      const when = a.duration === 'NEXT_OPP_TURN' ? '次の対戦相手のターンの間、'
        : a.duration === 'UNTIL_END_OF_TURN' ? 'このターン、' : '';
      const whoCI = a.targetOwner === 'opponent' ? '対戦相手' : 'あなた';
      // 🆕2026-08-31 続き749＝比例（「〈ゾーン〉の〈filter〉1体につき」）。載せないと逆翻訳が固定値に見える。
      // ⚠`countFromZonePerJa` は「…1体につき1」まで出すので、後ろに《無×1》が続くと数が重複する。
      //   ここでは**単位量の「1」を落として**「…1体につき《無×1》増える」と読ませる。
      const perCI = a.amountFromZone ? countFromZonePerJa(a.amountFromZone, '', false).replace(/1$/, '') : '';
      return `${when}${whoCI}が使用する${a.targetCardType ?? 'カード'}のコストは${perCI}${inc}増える`;
    }
    case 'PREVENT_DAMAGE': {
      // 期間（このターン／次のターンの間／次のあなたのメインフェイズまで）と
      // 範囲（あらゆるダメージ／ルリグアタックのみ）を原文どおり出す
      const whoPD = a.owner === 'opponent' ? '対戦相手' : 'あなた';
      const periodPD = a.untilNextMainPhase ? '次のあなたのメインフェイズまで、'
        : a.until === 'NEXT_TURN' ? '次の対戦相手のターンの間、'
          : a.until === 'END_OF_ATTACK' ? 'そのアタックで' : 'このターン、';
      if ((a.scope ?? (a.until === 'NEXT_TURN' ? 'LRIG' : 'ALL')) === 'LRIG')
        return `${periodPD}${whoPD}は対戦相手のルリグによってダメージを受けない`;
      return `${periodPD}${whoPD}はダメージを受けない`;
    }
    case 'ZONE_MOVE_IMMUNITY': {
      const zonesJa = a.zones.map((z: string) => (z === 'hand' ? '手札' : 'エナゾーン')).join('と');
      const periodJa = a.turns >= 2 ? 'このターンと次のターンの間、' : 'このターン、';
      return `${periodJa}対戦相手の効果によって${a.owner === 'opponent' ? '対戦相手' : 'あなた'}の${zonesJa}にあるカードは移動しない`;
    }
    case 'SET_LRIG_BASE_LIMIT':
      return `${a.untilNextMainPhase ? '次のあなたのメインフェイズまで、' : ''}${a.owner === 'opponent' ? '対戦相手' : 'あなた'}のルリグの基本リミットは${a.value}になる`;
    case 'RESERVE_DRAW_PHASE_REPLACEMENT':
      return `${a.owner === 'opponent' ? '対戦相手' : 'あなた'}が次のドローフェイズにカードを${a.fromCount}枚引く場合、代わりに${a.toCount}枚引く`;
    case 'SIGNI_ATTACK_BAN': {
      // 「このターン、対戦相手は〈条件〉のシグニでアタックできない」（§6.4 O-3）
      const whoAB = a.owner === 'opponent' ? '対戦相手' : 'あなた';
      const scopeAB = a.levelFromDeclaredNumber ? '宣言された数字と同じレベルの'
        : a.levelFromLastProcessed ? 'そのカードと同じレベルの'
        : a.powerDiffersFromPrinted ? '表記されているパワーと異なるパワーの'
        : '';
      if (a.targetsStored) {
        // ⚠支払い軸は《無》だけではない（`unlessPayHandDiscard` を見ないと《無》×0 と描いてしまう）。
        // 🆕**回避コストが1つも無いときは支払い節そのものを描かない**＝旧実装は `?? 0` に落ちて
        //   「《無》×0を支払わないかぎり」＝**タダで回避できる**という嘘の逆翻訳になっていた（`WXK05-052-E1`）。
        // 🆕期間（`turns:2`＝次のターンの間）も出す（下の一般枝と同じ規約）。
        const payAB = a.unlessPayHandDiscard ? `${whoAB}が手札を${a.unlessPayHandDiscard}枚捨てないかぎり`
          : a.unlessPayColorless ? `${whoAB}が《無》×${a.unlessPayColorless}を支払わないかぎり`
            : '';
        return `${a.turns === 2 ? '次のターンの間、' : 'このターン、'}${payAB}それはアタックできない`
          + (a.unlessPayHandDiscard ? '（アタックするごとに捨てる）' : '');
      }
      // 「選んだシグニ以外のシグニでアタックできない」（§6.4 O-3）＝`targetsStored` の逆向き。
      if (a.exceptTargetsStored) return `このターン、${whoAB}は選んだシグニ以外のシグニでアタックできない`;
      if (a.unlessPayHandDiscard) {
        return `このターン、${whoAB}は手札を${a.unlessPayHandDiscard}枚捨てないかぎり${scopeAB}シグニでアタックできない（アタックするごとに捨てる）`;
      }
      // ⚠期間（`turns:2`＝次の対戦相手のターン）まで出す（§6.4 O-4）。
      return `${a.turns === 2 ? '次の対戦相手のターンの間、' : 'このターン、'}${whoAB}は${scopeAB}シグニでアタックできない`
        + (a.unlessPayColorless ? `（《無》×${a.unlessPayColorless}を支払えばアタックできる）` : '');
    }
    case 'SIGNI_DEPLOY_BAN': {
      // 「このターンと次のターンの間、対戦相手は〈条件〉のシグニを新たに場に出せない」（§6.4 O-3）
      const whoDB = a.owner === 'opponent' ? '対戦相手' : 'あなた';
      const whenDB = (a.turns ?? 1) >= 2 ? 'このターンと次のターンの間' : 'このターン';
      const scopeDB = a.namesFromTargets ? 'それと同じ名前の'
        : a.bySource === 'signi_or_spell_effect' ? '自分の、シグニとスペルの効果によって'
        : '';
      return `${whenDB}、${whoDB}は${scopeDB}シグニを新たに場に出せない`;
    }
    case 'ADD_EXTRA_ATTACK_PHASE': {
      // 「（このターンの最初の／次の）アタックフェイズの後に、追加のアタックフェイズを加える」（§6.4 O-3）
      const nEAP = (a.count ?? 1) > 1 ? `${a.count}回` : '';
      const headEAP = `次のアタックフェイズの後に、追加のアタックフェイズを${nEAP}加える`;
      // ⚠`onStart` を落とすと「加えるだけ」と同じ文になり、開始時本文の脱落が逆翻訳に映らない。
      return a.onStart
        ? `${headEAP}。この方法で加えたアタックフェイズの開始時、${actionJa(a.onStart)}`
        : headEAP;
    }
    case 'DELAY_TO_NEXT_OPP_ATTACK_PHASE':
      // 「次の対戦相手のアタックフェイズ開始時、〈本文〉」（§6.4 O-3）
      // ⚠本文を落とすと「予約した」だけの文になり、遅延本体の脱落が逆翻訳に映らない。
      return `次の対戦相手のアタックフェイズ開始時、${actionJa(a.action)}`;
    case 'DELAY_TO_NEXT_OPP_TURN_END':
      // 「次の対戦相手のターン終了時、〈本文〉」（§6.4 O-3・上の兄弟）
      return `次の対戦相手のターン終了時、${actionJa(a.action)}`;
    case 'DELAY_TO_NEXT_OWN_TURN_END':
      // 「次のあなたのターン終了時、〈本文〉」（§6.4 O-4）
      return `次のあなたのターン終了時、${actionJa(a.action)}`;
    case 'REVEAL_BOTH_DECK_TOPS':
      // ⚠比較の帰結まで出す（片方だけだと「必ず起きる」との違いが逆翻訳に映らない）。
      return 'あなたと対戦相手は自分のデッキの一番上を公開し、そのカードをデッキの一番下に置く。'
        + `どちらも【ライフバースト】を持っているかどちらも持っていない場合、${actionJa(a.matchAction)}`;
    case 'DECLARE_DECK_TOP_ICON':
      return `対戦相手は${a.deckOwner === 'opponent' ? '対戦相手' : 'あなた'}のデッキの一番上のカードが`
        + `《${a.icon}アイコン》を持つか持たないかを宣言する。デッキの一番上を公開する。`
        + `宣言が外れた場合、${actionJa(a.onWrongAction)}`;
    case 'PLACE_FACEDOWN_LRIG_ZONE': {
      const nPF = a.count ?? 1;
      const whoPF = a.owner === 'opponent' ? '対戦相手' : 'あなた';
      return a.source === 'deck_top'
        ? 'あなたのデッキの一番上を見て、そのカードを裏向きでルリグゾーンに置く'
        : `${whoPF}の手札からカードを${a.all ? 'すべて' : `${nPF}枚${a.upToCount ? 'まで' : ''}`}裏向きでルリグゾーンに置く`;
    }
    case 'REVEAL_FACEDOWN_LRIG_ZONE': return 'そのカードを表向きにしてトラッシュに置く';
    case 'RETURN_FACEDOWN_LRIG_ZONE_TO_HAND':
      return `裏向きでルリグゾーンに置いたカードを${a.owner === 'opponent' ? '対戦相手の' : ''}手札に加える`;
    case 'DECLARE_CARD_NAME_LOCK': {
      const whoD = a.declarer === 'opponent' ? '対戦相手' : 'あなた';
      const whoT = a.lockedPlayer === 'opponent' ? '対戦相手' : 'あなた';
      const spanD = a.until === 'NEXT_TURN' ? `次の${whoT}のターンの間、` : 'このターン、';
      return `${whoD}は${a.cardType}のカード名1つを宣言する。${spanD}${whoT}は宣言したカード名`
        + (a.mode === 'whitelist' ? `以外の${a.cardType}を使用できない` : `の${a.cardType}を使用できない`);
    }
    case 'GAIN_LRIG_TYPE': {
      const spanGL = a.turns === 'GAME' ? 'このゲームの間、'
        : a.turns === 2 ? '次の対戦相手のターン終了時まで、'
        : 'ターン終了時まで、';
      return `${spanGL}${a.owner === 'opponent' ? '対戦相手' : 'あなた'}のセンタールリグは対戦相手のセンタールリグのルリグタイプを追加で得る`;
    }
    case 'FIELD_SIGNI_TO_CHECK_ZONE':
      // ⚠往復を1アクションに畳んであるので**戻す側まで出す**（片方だけだと脱落が逆翻訳に映らない）。
      return `${targetJa(a.target)}をチェックゾーンに置き、その後それらを場に出す`;
    case 'LEVEL_MODIFY': {
      // 🆕§5.3 `O-142`＝「それのレベルをこの方法で公開されたシグニの**レベルと同じだけ**－する」。
      if (a.deltaPerLastProcessedCount) {
        const lmF = a.perLastProcessed?.filter;
        const lmNoun = `${lmF?.color ? `${lmF.color}の` : ''}${lmF?.story ? `＜${lmF.story}＞の` : ''}${lmF?.cardType ?? 'カード'}`;
        return `${targetJa(a.target)}のレベルをこの方法で処理した${lmNoun}のレベルと同じだけ${a.delta >= 0 ? '＋' : '－'}する`;
      }
      // 🆕aboveSelf＝「このカードの上にあるシグニ」（スタック下のクラフト等がホストへ効く形）。
      //   POWER_MODIFY と同じ規約で主語を出す（`targetJa` だと「あなたのシグニ1体」に化ける）。
      if (a.target?.filter?.aboveSelf) {
        const lmAboveRest = { ...a.target.filter, aboveSelf: undefined };
        return `このカードの上にある${filterJa(lmAboveRest)}${a.target.filter.cardName ? '' : 'シグニ'}のレベルを${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta ?? 0)}する`;
      }
      return `${targetJa(a.target)}のレベルを${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta ?? 0)}する`;
    }
    // 🆕デッキトップとライフクロスの入れ替え（`WX19-061-E1`）。
    case 'SWAP_DECK_TOP_AND_LIFE':
      return `${ownerJa(a.owner)}デッキの一番上と${ownerJa(a.owner)}ライフクロス1枚を入れ替える${a.optional ? '（してもよい）' : ''}`;
    // 🆕ルリグデッキからキーを場に出す（`WDK03-001-E1`）。
    case 'PLACE_KEY_FROM_LRIG_DECK':
      // 🆕カード名なし＝「キー1枚を場に出す」（選ばせる）／`payPrintedCost`＝そのキーの印刷コストを払う（§5.3 `O-200`）。
      return `${ownerJa(a.owner)}ルリグデッキから${a.payPrintedCost ? 'コストを支払って' : ''}${a.cardName ? `《${a.cardName}》` : 'キー'}1枚を場に出す`
        + (a.coinReduction ? `（そのコストは《コイン×${a.coinReduction}》減る）` : '');
    case 'FORCE_END_TURN': return 'ターンを終了する';
    case 'POWER_MULTIPLY': return `${targetJa(a.target)}のパワーを${a.factor ?? ''}倍にする`;
    case 'POWER_FLIP': return `${targetJa(a.target)}のパワーの増減を反転する`;
    case 'POWER_MODIFY_BY_TARGET_LEVEL': {
      const dTL = a.deltaPerLevel ?? 0;
      return `${targetJa(a.target)}のパワーをそれのレベル1につき${dTL >= 0 ? '＋' : '－'}${Math.abs(dTL)}する`;
    }
    case 'POWER_MODIFY_PER_TRASHED_LEVEL': {
      const dTr = a.deltaPerLevel ?? 0;
      return `${targetJa(a.target)}のパワーをこの方法でトラッシュに置いたシグニのレベル1につき${dTr >= 0 ? '＋' : '－'}${Math.abs(dTr)}する`;
    }
    case 'PLACE_UNDER_SIGNI': {
      // source は文字列の領域指定（deck_top/trash/energy/hand）＋ count ＋ 任意 filter
      const puLoc: Record<string, string> = { deck_top: 'あなたのデッキの上から', trash: 'あなたのトラッシュから', energy: 'あなたのエナゾーンから', hand: 'あなたの手札から' };
      const puFrom = puLoc[a.source] ?? `${a.source}から`;
      const puNoun = a.filter?.cardType && !Array.isArray(a.filter.cardType) ? a.filter.cardType : 'カード';
      const puCnt = a.count != null ? `${a.count}枚${a.upToCount ? 'まで' : ''}` : '';
      // 「《A》1枚と《B》1枚」＝群ごとの配分（§5.3 O-45）。cardNames の「いずれか」表記では
      // 「同名2枚でもよい」に読めてしまうので、groups があるときはそちらを優先して出す。
      if (a.selectionConstraint?.groups?.length) {
        return `${puFrom}${selectionGroupsJa(a.selectionConstraint.groups)}をこのシグニの下に置く`;
      }
      // 選んだ複数枚どうしの相互差異（「共通する色を持たない…２枚まで」WX21-024-E1）。段2 第42バッチ。
      return `${puFrom}${constraintJa(a.selectionConstraint)}${a.filter ? filterJa(a.filter) : ''}${puNoun}を${puCnt}このシグニの下に置く`;
    }
    case 'TAKE_FROM_UNDER_SIGNI': {
      // 🔴**枚数・`upToCount`・destination・`fromThis` を必ず出す**（PLAN §3 follow-up①・Opusタスク12 (cli)）。
      //   旧実装は 'このシグニの下のカードを取る' の固定文で、`count:1` と `count:9,upToCount:true` が
      //   **同じ文字列**になっていた＝過剰実行（9枚まで払える誤 parse）が逆翻訳にも同型★にも一度も映らなかった。
      const tuFrom = a.fromThis ? 'このシグニの下から' : 'あなたのシグニの下から';
      const tuNoun = a.filter?.cardType && !Array.isArray(a.filter.cardType) ? a.filter.cardType : 'カード';
      const tuCnt = a.count != null ? `${a.count}枚${a.upToCount ? 'まで' : ''}` : '';
      const tuDest: Record<string, string> = { hand: '手札に加える', energy: 'エナゾーンに置く', trash: 'トラッシュに置く' };
      return `${tuFrom}${a.filter ? filterJa(a.filter) : ''}${tuNoun}を${tuCnt}${tuDest[a.destination] ?? `${a.destination}へ置く`}`;
    }
    case 'STACK_SPELL': return 'トラッシュからスペルをこのカードの下に置く';
    case 'REVEAL': {
      // ⚠**「手札を全部見せる」と「手札から条件つきで好きな枚数見せる」は別物**（段2 第42バッチ）＝
      //   filter 付きの count:'ALL' まで無条件公開に丸めると、`WXK10-081-E2`「それぞれ名前の異なる
      //   ＜水獣＞のシグニを好きな枚数公開する」が**手札全公開**に見えて原文照合で気づけない。
      if (a.source?.type === 'HAND_CARD' && a.source.count === 'ALL' && !a.source.filter) return `${ownerJa(a.source.owner)}手札を公開する${a.optional ? '（してもよい）' : ''}`;
      if (a.source?.type === 'HAND_CARD') {
        // 「N枚まで」（upToCount）と選んだ複数枚どうしの相互差異（selectionConstraint）を落とさない。
        if (a.source.selectionConstraint?.groups?.length) {
          return `${ownerJa(a.source.owner)}手札から${selectionGroupsJa(a.source.selectionConstraint.groups)}を公開する${a.optional ? '（してもよい）' : ''}`;
        }
        const revCnt = a.source.count === 'ALL' ? 'を好きな枚数' : `${a.source.count ?? 1}枚${a.source.upToCount ? 'まで' : ''}を`;
        // §5.3 `O-76` 第2バッチ（2026-08-29）＝**名詞は payload から describe する**。
        //   🔴旧実装は `cardType` を無視して常に「シグニ」と書いており、
        //   `WXDi-P04-045-E1`「手札から**スペル**2枚を公開してもよい」が「シグニ2枚」と嘘をついていた。
        const revNoun = typeof a.source.filter?.cardType === 'string' ? a.source.filter.cardType : 'シグニ';
        return `${ownerJa(a.source.owner)}手札から${constraintJa(a.source.selectionConstraint)}${filterJa(a.source.filter)}${revNoun}${revCnt}公開する${a.optional ? '（してもよい）' : ''}`;
      }
      return `${ownerJa(a.owner)}デッキの上を公開する`;
    }
    case 'GRANT_LRIG_ABILITY': {
      if (a.abilities?.length === 1 && a.abilities[0]?.consumeOnTrigger
          && a.abilities[0]?.timing?.includes('ON_ATTACK_LRIG')) {
        const nextAction = a.abilities[0].action;
        const body = nextAction.type === 'UP' ? 'このルリグをアップする' : actionJa(nextAction);
        return `このターン、次にこのルリグがアタックしたとき、${body}`;
      }
      const glaInner = (a.abilities || []).map(effJa).join(' / ') || a.rawText || '';
      // ⚠**省略時の既定（ターン終了時まで）も明示する**（§6.4 O-25・続き538）＝engine は duration 省略の
      //   付与を `lrig_granted_auto_effects`（ターン終了で落ちるストア）へ積むので、無表記だと
      //   **恒久付与に見えて**原文照合で期間のズレを見つけられない（続き536 の targetedCenter 枝と同じ軸）。
      const glaDuration = a.permanent ? 'このゲームの間、'
        : a.duration === 'UNTIL_NEXT_OWN_TURN_END' ? '次のあなたのターン終了時まで、'
        : a.duration === 'UNTIL_OPP_TURN_END' ? '次の対戦相手のターン終了時まで、'
        : 'ターン終了時まで、';
      // targetedCenter＝「センタールリグ１体を対象とし」表記変種（WX25-P1-001系。engine挙動は既定と同一）
      const glaOwner = a.targetOwner === 'opponent' ? '対戦相手の' : 'あなたの';
      // ⚠**`duration` を読む**（§6.4 O-27・続き536）＝従来は `targetedCenter` の枝だけ
      //   「ターン終了時まで」を決め打ちしており、`UNTIL_OPP_TURN_END` の付与が**1ターン短く見えて**いた
      //   ＝原文照合で期間のズレを見つけられない（engine と逆翻訳の乖離）。
      if (a.targetedCenter) {
        const glaSpan = a.permanent ? 'このゲームの間'
          : a.duration === 'UNTIL_NEXT_OWN_TURN_END' ? '次のあなたのターン終了時まで'
          : a.duration === 'UNTIL_OPP_TURN_END' ? '次の対戦相手のターン終了時まで'
          : 'ターン終了時まで';
        return `${glaOwner}センタールリグ１体を対象とし、${glaSpan}、それは以下の能力を得る。『${glaInner}』`;
      }
      return `${glaDuration}${glaOwner}センタールリグは『${glaInner}』を得る`;
    }
    case 'GRANT_PLAYER_ABILITY':
      return `このゲームの間、あなたは以下の能力を得る。『${(a.abilities || []).map(effJa).join(' / ') || a.rawText || ''}』`;
    case 'DRAW_PHASE_REPLACEMENT':
      return `あなたがドローフェイズにカードを${a.fromCount}枚引く場合、代わりに${a.toCount}枚引く`;
    case 'AWAKEN_SIGNI': return a.targetsLastProcessed ? 'それは覚醒する' : 'このシグニを覚醒状態にする';
    case 'GAIN_BOND': return a.source === 'declared'
      ? 'あなたのデッキからカード1枚を選び、そのカード名との絆を獲得する'
      : '直前に見つけたカード名との絆を獲得する';
    case 'GROW_COST_REDUCTION': {
      const redJa = `グロウコストを${costJa({ energy: a.reduction })}減らす`;
      if (a.perCount) {
        const f = a.perCount.filter;
        const subj = f.cardName
          ? `カード名に《${f.cardName}》を含むカード`
          : `${f.story ? `＜${f.story}＞の` : ''}${f.cardType === 'シグニ' ? 'シグニ' : 'カード'}`;
        return `あなたのトラッシュにある${subj}${a.perCount.count}枚につき、あなたの次の${redJa}`;
      }
      // 🆕§5.3 `O-180`＝一過性のアシストグロウ限定（次の1回だけ）。
      if (a.nextAssistGrowOnly) {
        const ign = a.ignoreLrigType ? 'グロウするためのルリグタイプは無視され、' : '';
        return `このターン、あなたのルリグが次にアシストルリグにグロウする場合、${ign}${redJa}`;
      }
      return `あなたの次の${redJa}`;
    }
    case 'LRIG_LIMIT_MODIFY': {
      // 🔑`NEXT_TURN` の実体は **`pending_lrig_limit_mod` → 次のターンの GROW→MAIN 遷移で `lrig_limit_mod` へ**
      //   （`lrig_limit_mod` はターン開始時リセット）＝原文の「次の〈そのプレイヤーの〉メインフェイズの間」そのもの。
      //   逆翻訳が「次のターンの間」だと**アタックフェイズも含む**ように読め、意味照合で偽の不一致を生む（2026-08-31 続き759）。
      const untilLLM = a.until === 'END_OF_TURN' ? '（ターン終了時まで）' : a.until === 'NEXT_TURN' ? '（次のメインフェイズの間）' : '';
      return `${ownerJa(a.owner)}センタールリグのリミットを${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta)}する${untilLLM}`;
    }
    case 'DISCARD_BOTH': return `あなたと対戦相手はそれぞれ手札を${a.count}枚捨てる`;
    case 'RECOLLECT_GATE': return `（リコレクト：ルリグトラッシュのアーツが${a.minArts}枚以上ある場合のみ以下を行う）`;
    case 'GRANT_ACCE_HOST_ABILITY': {
      const hostGAH = a.filter ? filterJa(a.filter) : '';
      const absGAH = (a.abilities || []).map(effJa).join(' / ');
      return `これに【アクセ】されている${hostGAH}シグニは『${absGAH}』を得る${a.byChoice ? '（装着時に1つ選ぶ）' : ''}`;
    }
    case 'PLACE_VIRUS': {
      const zonesPV = a.zoneCount === 'ALL' ? 'すべてのシグニゾーン' : `${a.zoneCount}つのシグニゾーン${a.upToZoneCount ? 'まで' : ''}`;
      if (a.fillToTotal !== undefined) return `${ownerJa(a.targetOwner)}場の【ウィルス】の合計が${a.fillToTotal}つになるように【ウィルス】を置く`;
      const pwPV = a.powerDeltaOnZone !== undefined ? `（そのゾーンのシグニのパワーを${a.powerDeltaOnZone >= 0 ? '＋' : '－'}${Math.abs(a.powerDeltaOnZone)}）` : '';
      return `${ownerJa(a.targetOwner)}${zonesPV}に【ウィルス】を${a.virusCount > 1 ? `${a.virusCount}つずつ` : ''}置く${pwPV}`;
    }
    case 'POWER_MODIFY_BY_SOURCE': {
      const tgt = a.target?.filter?.thisCardOnly ? 'このシグニ' : targetJa(a.target);
      const unit = a.basis === 'level' ? 'このシグニのレベル1' : 'このシグニのパワーと同じ値';
      return `${tgt}のパワーを${unit}につき${a.multiplier >= 0 ? '＋' : '－'}${Math.abs(a.multiplier)}する`;
    }
    case 'LOOK_AT_DECK_AND_LIFE': return `${ownerJa(a.targetOwner)}デッキの上${a.mode === 'both' ? 'とライフクロスの上' : 'かライフクロスの上'}を見る`;
    // ⚠カード名限定（`filter.cardName`）は「《名前》シグニ」と重ねると原文とズレるので名詞を落とす。
    case 'GRANT_SIGNI_ABOVE_ABILITY': return a.filter?.cardName
      ? `このカードの上の《${a.filter.cardName}》は『${(a.abilities || []).map(effJa).join(' / ')}』を得る`
      : `このカードの上の${filterJa(a.filter)}シグニは『${(a.abilities || []).map(effJa).join(' / ')}』を得る`;
    case 'NAME_BAN': return `このゲームの間、${a.targetSelf ? 'あなた' : '対戦相手'}は同名のカードを使用できない`;
    case 'BLOCK_CARD_USE': return `このターン、対戦相手は《${a.cardName}》を使用できない`;
    case 'COST_SUBSTITUTE': {
      // substituteCost.banish_self＝「代わりにあなたのエナゾーンからこのシグニをトラッシュに置く」（原文の言い回し）。
      // 旧実装は costJa が拾えず `コスト:{"banish_self":true}` と生JSONを漏らしていた（§5b の英語/JSON漏れ）。
      const subJa = (a.substituteCost as { banish_self?: boolean })?.banish_self
        ? 'あなたのエナゾーンからこのシグニをトラッシュに置いて'
        : `${costJa(a.substituteCost)}を支払って`;
      return `あなたが${costJa({ energy: a.originalCost })}を支払う際、代わりに${subJa}${a.optional ? 'もよい' : ''}`;
    }
    case 'VARIABLE_DISCARD_AND_DRAW': return `${ownerJa(a.owner)}手札を好きな枚数捨て、その枚数${a.drawBonus ? `＋${a.drawBonus}枚` : '分'}カードを引く`;
    case 'SELF_TRASH_PREVENT': return 'あなたは自分の効果ではこのシグニをトラッシュに置けない';
    case 'REVEAL_UNTIL_BANISH_SAME_LEVEL': return `＜${a.revealClass}＞のシグニがめくれるまでデッキの上を公開し、それと同じレベルの${ownerJa(a.banishOwner)}シグニ1体をバニッシュする（公開したカードはデッキの一番下に置く）`;
    case 'ENERGY_CHARGE_BY_FIELD_COUNT': return `${ownerJa(a.owner)}場のシグニの数${a.bonus ? `＋${a.bonus}` : ''}枚をデッキの上からエナゾーンに置く`;
    case 'COLOR_INHERIT': return `${ownerJa(a.owner)}エナゾーンのカードの色を、このシグニの色として追加で得る`;
    case 'FORCE_FRONT_SIGNI_ATTACK': return 'このシグニの正面のシグニは、可能ならアタックしなければならない';
    case 'UNKNOWN': return `【未実装/UNKNOWN：${a.text ?? a.raw ?? ''}】`;
    case 'STUB': {
      if (a.id === 'MULTI_ACCE_LIMIT') return a.value === 'ALL'
        ? 'このシグニには好きな枚数の【アクセ】を付けることができる'
        : `このシグニには${numJa(typeof a.value === 'number' ? a.value : 2)}枚まで【アクセ】を付けることができる`;
      if (a.id === 'TRASH_SELF_ACCE_ALL') return 'このシグニに付いている【アクセ】をすべてトラッシュに置く';
      // §6.4 O-35（続き530）＝**コストを払って**トラッシュのスペルを使う（`USE_SPELL_FROM_TRASH` は払わない別物）。
      if (a.id === 'USE_SPELL_FROM_TRASH_PAYING_COST') {
        return `あなたのトラッシュから${filterJa(a.selectTarget?.filter)}スペル1枚を対象とし、それを使用してもよい`;
      }
      if (a.id === 'UNKNOWN_NESTED' && a.text) return `[未実装:${a.text}]`;
      // §6.4 A群・続き427 で実装済み（`screens/battle/assistLrigAttack.ts` ＋ `performLrigAttack(slot)`）。
      // ⚠レベルは `count` ではなく `minLevel`（`count` だと「N体まで」と誤読される）。
      if (a.id === 'ASSIST_LRIG_ATTACK_THIS_TURN') return `このターン、あなたはレベル${a.minLevel ?? a.count ?? 1}以上のアシストルリグでアタックできる`;
      if (a.id === 'DEFERRED_CHECK_ZONE_FLIP_FREE_GROW') return 'このターンにセンタールリグがグロウしていない場合、チェックゾーンのこのカードを裏返し、指定ルリグへグロウコストを支払わずにグロウする（未実装）';
      if (a.id === 'LIFE_TO_ENERGY') return `${ownerJa(a.owner)}ライフクロス1枚をエナゾーンに置く`;
      if (a.id === 'ENERGY_TO_HAND_ON_DECK') return 'このカードをエナゾーンから手札に加えてもよい';
      // 相手センタールリグ色による基本コスト軽減（支払い時 computeArtsEffectiveCost が適用＝実装済み）
      if (a.id === 'CONDITIONAL_CARD_COST_BY_OPP_LRIG') {
        return '相手センタールリグ色が条件を満たす場合は基本コストを軽減（支払い時に自動適用）';
      }
      if (a.id === 'PREVENT_DAMAGE_FROM_OPP_EFFECTS') return 'あなたは対戦相手の効果によってダメージを受けない';
      if (a.id === 'GUARD_ALT_HAND_REPLACE') return `あなたが【ガード】する際、《ガードアイコン》を持つカードを1枚捨てる代わりに手札を${a.count ?? 1}枚捨ててもよい`;
      if (a.id === 'HOLOGRAPH_REVEAL_REPLACE') return 'ホログラフの効果によってあなたのデッキの一番上を公開する場合、代わりにあなたはデッキの上からカードを3枚見て、それらを好きな順番でデッキの上に戻してからデッキの一番上を公開する';
      if (a.id === 'EFFECT_LEAVE_PREVENT_LOSE_LRIG_ABILITY') return 'あなたのクロス状態のシグニ1体が対戦相手の効果によって場を離れる場合、代わりにこのルリグはこの能力を失う';
      // 英知条件でのレベル読み替え（実装済み＝collectAttackPhaseLevelOverrides→eichi_level_options）。
      // 旧ラベルは STUBS.md 由来の「ダメージ特殊」で、内容と無関係な誤表示だった。
      if (a.id === 'ATTACK_PHASE_LEVEL_OVERRIDE') return '【英知】条件の判定でこのシグニのレベルを原文どおりの複数値として扱う';
      // アーツ/スペルの使用コスト改変句（ARTS_COST_REDUCTION_BY_EFFECT/BY_CENTER_LRIG）。
      // 軽減/増加量は支払い時に computeArtsEffectiveCost が原文 EffectText を再パースして算出する
      // ため JSON には数値が無い。逆翻訳は原文の「…使用コストは…減る/増える/になる」文を復元する。
      // 🆕§5.3 `O-60` 第8バッチ（2026-08-26）＝`CONDITIONAL_ARTS_COST` は **payload から描く**
      //   （原文 regex の再パースに頼らない）。payload が無い宣言だけが下の全文フォールバックへ落ちる。
      if (a.id === 'CONDITIONAL_ARTS_COST' && a.artsCostCond) {
        const acc = a.artsCostCond;
        if (acc.kind === 'opp_center_lrig_color') {
          return `対戦相手のセンタールリグが${(acc.colors ?? []).join('か')}の場合、このアーツの使用コストが変わる（支払い時に自動適用）`;
        }
        if (acc.kind === 'center_lrig_level') {
          const oppPart = acc.oppLevel !== undefined
            ? `で、対戦相手のセンタールリグのレベルが${acc.oppLevel}${acc.oppOp ?? '以上'}`
            : '';
          return `あなたのセンタールリグのレベルが${acc.level}${acc.op ?? '以上'}${oppPart}の場合、このアーツの使用コストが変わる（支払い時に自動適用）`;
        }
        return `あなたのライフクロスが${acc.level}枚${acc.op ?? '以下'}の場合、このアーツの使用コストが変わる（支払い時に自動適用）`;
      }
      if (a.id === 'ARTS_COST_REDUCTION_BY_EFFECT' || a.id === 'ARTS_COST_REDUCTION_BY_CENTER_LRIG' || a.id === 'CONDITIONAL_ARTS_COST') {
        const costSents = currentCardText.split('。')
          .map(s => s.trim())
          .filter(s => /使用コスト/.test(s) && /(減る|減り|増える|増え[、]|になる)/.test(s));
        // タスク12(lxxxv)：支払いステップを action から落とした31枚は、支払い文が action に無い。
        // 逆翻訳で「支払いが消えた」と読めてしまうので、**使用時に払う**ことを明示して復元する
        // （実際の支払いUIは `src/screens/battle/useTimeCost.ts` ＋ SpellCastModal / ArtsModal）。
        if (costSents.length > 0 && parseUseTimeCostReduction(currentCardText)) {
          const paySent = currentCardText.split('。').map(s => s.trim())
            .find(s => /を使用する際/.test(s));
          if (paySent) return `（使用時に支払う）${paySent}。${costSents.join('。')}`;
        }
        if (costSents.length > 0) return costSents.join('。');
        // 抽出不能（コスト色無視/エナコスト代替/グロウコスト/ライフ枚数条件等の別記述）は従来マーカーにフォールバック
      }
      // A2残4枚の誤パース是正で導入（虚偽の付与STUBの置換・原文を正直に表す）
      if (a.id === 'PLAY_MILLED_SIGNI_DELAYED_TRASH') return 'この方法でトラッシュに置かれたそのシグニを場に出す（ターン終了時、そのシグニを場からトラッシュに置く）';
      // §6.4「エナ支払い元の一本化」で実装済み（消費＝`screens/battle/energyPaySource.ts`）。
      if (a.id === 'UNDER_CARD_AS_ENERGY_COST') {
        const spec = a.underCardAsEnergyCost;
        const phase = spec?.duringMyAttackPhase ? 'あなたのアタックフェイズの間、' : '';
        const limit = spec?.perTurnLimit != null ? `（この方法で1ターンに${spec.perTurnLimit}つまで）` : '';
        return `${phase}このシグニの下のカードをエナゾーンにあるかのようにトラッシュに置いてエナコストを支払える${limit}`;
      }
      if (a.id === 'DEFERRED_FLIP_SELF_FACE_DOWN_UP') return 'このシグニを裏向きにし、表向きにする';
      // WXDi-P10-034: デッキ上N枚を見て1枚を裏向きでシグニゾーンに置き、残りをデッキ下→次の自メインフェイズ開始時に表向き分岐
      if (a.id === 'LOOK_PLACE_FACEDOWN_DELAYED') {
        const cnt = typeof a.count === 'number' ? a.count : 4;
        const bonus = typeof a.value === 'number' ? a.value : (parseInt(String(a.value ?? '5000'), 10) || 5000);
        return `デッキの上から${cnt}枚を見て、1枚を裏向きでシグニゾーンに置き、残りを好きな順番でデッキの一番下に置く。次のあなたのメインフェイズ開始時、そのカードを表向きにしてもよい（そうした場合、場にあるかぎりパワー＋${bonus}／しなかった場合、手札に加える）`;
      }
      // N回目までアタック自動無効化（WX10-018/WX17-006/SP27-016）＝engine は原文の「一度目か二度目」等を
      // 実行時に読み取る（execStubPart3）。逆翻訳は原文の該当文をそのまま抽出して描画。
      if (a.id === 'NEGATE_NTH_ATTACK') {
        const nm = currentCardText.match(/この(?:ターン|ゲーム)[^。]*?度目[^。]*?アタックを無効にする/);
        if (nm) return nm[0];
      }
      // ガード喪失条件（WX12-025/034/036）＝ルリグ名がカードごとに異なるため原文から該当文を抽出
      if (a.id === 'GUARD_LOSS_UNLESS_LRIG') {
        const gl = currentCardText.match(/あなたのセンタールリグが＜[^＞]+＞でないかぎり、手札にあるこのシグニは【ガード】を失う/);
        if (gl) return gl[0];
      }
      // 付与引用（「…」の能力を得る）＝原文から引用能力を抽出して描画（テキスト検出型）。
      // 本物の付与カード（原文に「【自/常/起/出】…」を得る がある）は引用能力を表示、誤パース等で引用が無い場合は従来フォールバック。
      if (a.id === 'GRANT_QUOTED_AUTO_ABILITY' || a.id === 'GRANT_QUOTED_ABILITY') {
        const gm = currentCardText.match(/(ターン終了時まで、|このゲームの間、|次の対戦相手のターン終了時まで、)?(この(?:ルリグ|シグニ)|これ[^「『。]{0,20}?|あなたの[^「『。]{0,20}?)は[「『]([\s\S]+?)[」』]を得る/);
        if (gm && /【(?:自|常|起|出)/.test(gm[3])) {
          const dur = gm[1] ?? '';
          const subj = gm[2];
          const inner = gm[3].replace(/\s+/g, '');
          return `${dur}${subj}は「${inner}」を得る`;
        }
        // 後置型「…は（以下の能力を）得る。『…』」（引用が「得る」の後）
        const gm2 = currentCardText.match(/(それ|この(?:ルリグ|シグニ)|あなたの[^「『。]{0,30}?)は[^「『。]{0,12}以下の能力を得る。?(?:（[^）]*）)?\s*[「『]([\s\S]+?)[」』]/);
        if (gm2 && /【(?:自|常|起|出)/.test(gm2[2])) {
          const inner = gm2[2].replace(/\s+/g, '');
          return `${gm2[1]}は以下の能力を得る「${inner}」`;
        }
        // 引用が見つからない（誤パース／引用無し）＝従来フォールバック
        return '[STUB:引用された能力を付与する（原文参照）]';
      }
      if (a.id === 'GRANT_ABILITY_INNER_TEXT') return 'このカードに記載された継続能力を付与する（テキスト検出型。原文参照）';
      if (a.id === 'GUARD_EXTRA_COST_BY_OPP' || a.id === 'OPP_GUARD_COST_COLORLESS') return '対戦相手が【ガード】する際に追加コスト（無色エナ）を要求する';
      if (a.id === 'LEVEL_REFERENCE_OVERRIDE' || a.id === 'LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT') return 'レベル参照を上書きする（テキスト記載のレベルとして扱う）';
      if (a.id === 'POWER_MOD_BY_HAND_COUNT') return '手札N枚につき対戦相手のシグニのパワーを±する（テキスト記載の値）';
      // 🆕§5.3 `O-60` 第5バッチ（2026-08-26）＝**寿命を payload から描く**
      //   （旧表示「対戦相手の場のシグニ数に応じて…」は engine の regex の話で、**原文と無関係**だった）。
      if (a.id === 'DOUBLE_POWER_MINUS') {
        const dpm = (a as { doublePowerMinus?: { duration: string; sourceSigniOnly?: boolean } }).doublePowerMinus;
        if (dpm) {
          const who = dpm.sourceSigniOnly ? 'あなたのシグニの効果' : 'あなたの効果';
          const when = dpm.duration === 'this_turn' ? 'このターン、' : '';
          return `${when}${who}によって対戦相手のシグニのパワーが－される場合、代わりに2倍－される`;
        }
        return '【※ペイロード欠落】2倍マイナスの寿命が未指定（engine は何もしない）';
      }
      if (a.id === 'BANISH_TO_LRIG_TRASH_INSTEAD') return 'このカードがバニッシュされる場合、代わりにルリグトラッシュに置く';
      if (a.id === 'DECLARE_COLOR') return '色（白/赤/青/緑/黒）を1つ宣言する';
      if (a.id === 'REPLACE_NEXT_OPP_REFRESH_MILL_LRIG') return '次に対戦相手が行うリフレッシュを「トラッシュをすべてデッキに加えてシャッフルし、ルリグデッキからカード1枚をルリグトラッシュに置く」に置き換える';
      if (a.id === 'TRASH_SIGNI_TO_BEAT') return a.value === 'WXK08-029'
        ? 'あなたのトラッシュから＜悪魔＞のシグニ1枚を対象とし、それを【ビート】にする'
        : 'トラッシュからシグニを【ビート】にする';
      if (a.id === 'INTERNAL_MOVE_TO_BEAT') return '直前に選んだシグニを【ビート】にする';
      if (a.id === 'TRASH_ALL_SIGNI_AND_KEY') return '対象プレイヤーのシグニすべてとキーをトラッシュ／ルリグトラッシュに置く';
      if (a.id === 'SPELL_COST_REDUCTION_BY_TRASH_COUNT' || a.id === 'SPECIFIC_CARD_COST_REDUCE') return 'トラッシュ枚数等に応じてスペル／特定カードの使用コストを軽減する';
      if (a.id === 'SIGNI_CANT_BOUNCE_FROM_FIELD') return 'このシグニは場から手札に戻らない';
      if (a.id === 'SUPPRESS_GAIN_ABILITY') return 'このターン、あなたのシグニは新たに能力を得られない';
      if (a.id === 'PREVENT_SIGNI_ABILITY_LOSS_BY_OPP') {
        // 保護対象の色（白/赤など）はカードで異なる＝原文から抽出して一致させる。
        const cm = currentCardText.match(/あなたの他の(?:(?:白|赤|青|緑|黒|無色)の)?シグニは対戦相手の効果によって能力を失わない/);
        return cm ? cm[0] : 'あなたの他のシグニは対戦相手の効果によって能力を失わない';
      }
      if (a.id === 'PREVENT_POWER_MINUS_BY_OPP') return '対戦相手の効果によって、このシグニのパワーは－（マイナス）されない';
      if (a.id === 'NEGATE_ATTACK_ON_TRIGGER') return 'そのアタックを無効にしてもよい';
      if (a.id === 'CHOOSE_SAME_OPTION_TWICE' || a.id === 'CHOOSE_SAME_OPTION_MULTIPLE') return '同じ選択肢を複数回選ぶ';
      if (a.id === 'INHERIT_OPP_LRIG_TYPE') return '対戦相手のセンタールリグのルリグタイプを得る';
      if (a.id === 'MULTI_ZONE_ATTACK') return '複数のシグニゾーンに対してアタックできる（アタック範囲の特殊ルール）';
      if (a.id === 'SET_ACCE_CHOICE') return '【アクセ】装着時に付与する能力を1つ選ぶ';
      if (a.id === 'GRANT_LEAVE_PLACE_PENDING') return 'シグニが場を離れたときに発動する配置能力を付与する（機構未実装・近似）';
      if (a.id === 'PLACE_LIMIT_UPPER') return 'あなたのルリグゾーンに【リミットアッパー】1つを置く';
      if (a.id === 'STEAL_OPP_TRASH_PUPPET') {
        const pp = (a as { puppetParams?: { count?: number; optional?: boolean; levelLteTrigger?: boolean; filter?: any } }).puppetParams;
        if (pp) {
          const n = pp.count ?? 1;
          // 静的な絞り込み（「レベル３以下の」「＜美巧＞ではない」）＝2026-08-18 §5d-0 (i) で配線。
          // ⚠逆翻訳に出さないと原文照合で絞り込みの脱落を検出できない（PLAN 教訓⑩）。
          const lvl = pp.levelLteTrigger ? 'そのシグニのレベル以下の' : filterJa(pp.filter);
          const opt = pp.optional ? '出してもよい' : '出す';
          return `対戦相手のトラッシュから${lvl}シグニ${n}枚を対象とし、それを傀儡状態であなたの場に${opt}（離場時は持ち主のトラッシュへ）`;
        }
        return '対戦相手のトラッシュからシグニを傀儡状態であなたの場に出す（ベット時2枚／非ベット1枚。離場時は持ち主のトラッシュへ）';
      }
      if (a.id === 'DISRUPT_OPP_LRIG_UNDER_BY_TYPE') return '対戦相手のセンタールリグの下のカードを最大2枚、あなたのルリグデッキから同じルリグタイプのルリグ2枚をルリグトラッシュに置いてもよい。そうした場合、それらをルリグトラッシュに置く';
      if (a.id === 'DEFERRED_GRANT_UNTAP_ON_ATTACK_TO_TEAM_LRIG') return 'あなたの＜さんばか＞のルリグ1体に「【自】《ターン1回》：このルリグがアタックしたとき、このルリグをアップする」を付与する（ターン終了時まで）※ルリグ対象grant未配線';
      if (a.id === 'FREE_GROW_NEXT_TURN') return '次のあなたのターンの間、あなたのグロウコストは《無×0》になる（実質フリーグロウ）';
      if (a.id === 'GROW_COST_ZERO') return 'あなたのグロウコストは《無×0》になる（実質フリーグロウ）';
      if (a.id === 'POWER_DOUBLE_ALL') return 'ターン終了時まで、あなたのすべてのシグニのパワーを2倍にする';
      if (a.id === 'BANISH_REDIRECT_POWER0_TRASH') return 'このターン、パワーが0以下のシグニがバニッシュされる場合、エナゾーンの代わりにトラッシュに置かれる';
      // WX24-P4-016-E3（タスク12(xxiii)残・engine未実装の正直STUB＝旧GRANT_KEYWORD幻覚の是正）
      if (a.id === 'DEFERRED_ATTACK_NEGATE_IMMUNITY_SELF') return 'このターン、あなたの効果によってシグニのアタックは無効にならない';
      if (a.id === 'MAGIC_BOX_FLIP_GRANT_ASSASSIN_DC') return 'このターンのアタックフェイズの間、効果によってあなたの【マジックボックス】１つが表向きになったとき、あなたのシグニ１体を対象とし、ターン終了時まで、それは【アサシン】か【ダブルクラッシュ】を得る';
      if (a.id === 'DOUBLE_POWER_MINUS_THIS_TURN') return 'このターン、あなたのシグニの効果で対戦相手のシグニのパワーが－される場合、代わりに2倍－される';
      // DISCARD_OR_PENALTY: 原文から「＜クラス＞/種別のカードを1枚捨てないかぎり手札をN枚捨てる」を復元
      if (a.id === 'DISCARD_OR_PENALTY') {
        const toHWdop = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const clsM = currentCardText.match(/手札から[<＜]([^>＞]+)[>＞]のシグニを１枚捨てないかぎり/);
        const typeM = !clsM ? currentCardText.match(/手札から(スペル|シグニ|アーツ)を１枚捨てないかぎり/) : null;
        const penM = currentCardText.match(/かぎり手札を([２-９\d]+)枚捨てる/);
        const n = penM ? parseInt(toHWdop(penM[1])) : 2;
        const subj = clsM ? `手札から＜${clsM[1]}＞のシグニを1枚` : typeM ? `手札から${typeM[1]}を1枚` : '手札から指定カードを1枚';
        return `あなたは${subj}捨てないかぎり手札を${n}枚捨てる`;
      }
      // OPTIONAL_COST 系: 「《色》を支払ってもよい」（effectExecutor が直後の CONDITIONAL(IS_MY_TURN) と結合して
      // 「支払う→効果発動 / スキップ」を生成する標準パターン。後続の「そうした場合、…」が効果本体）
      // OPTIONAL_TRASH_ENERGY_CLASS: エナゾーンから＜X＞のシグニN枚をトラッシュに置く任意コスト。
      // クラス/枚数はJSONに無く EffectText から解釈する（engine と同じ）ので原文から復元する。
      if (a.id === 'OPTIONAL_TRASH_ENERGY_CLASS') {
        // 「エナゾーンから＜X＞の(シグニ|カード)N枚をトラッシュ」句を優先マッチ（同カード内の別記述＝
        // 「エナから＜X＞のシグニ1枚を選び場に出す」等を誤マッチしないため。WX25-CP1-006 の②誤マッチ修正）。
        // 取れなければ従来の緩いマッチにフォールバック。種別(シグニ/カード)も原文どおり反映する。
        const m = currentCardText.match(/エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(シグニ|カード)([０-９\d]+)枚を?トラッシュ/)
          || currentCardText.match(/エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(シグニ|カード)([０-９\d]+)枚/);
        const cls = m?.[1] ? `＜${m[1]}＞の` : '';
        const kind = m?.[2] || 'シグニ';
        const n = m?.[3] ? numJa(parseInt(m[3].replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)))) : '1';
        return `あなたのエナゾーンから${cls}${kind}${n}枚をトラッシュに置いてもよい`;
      }
      // OPTIONAL_TRASH_SELF: 「このシグニを場からトラッシュに置いてもよい」（任意の自己犠牲。兄弟 CONDITIONAL が「そうした場合」）。
      if (a.id === 'OPTIONAL_TRASH_SELF') return 'このシグニを場からトラッシュに置いてもよい';
      // BANISH_SUBSTITUTE (F-3 犠牲型): 身代わりバニッシュ。pattern/クラス/ライズ条件/相手ターン限定を原文どおり復元。
      if (a.id === 'BANISH_SUBSTITUTE' && a.banishSubstitute) {
        const bs = a.banishSubstitute;
        const oppTurn = bs.oppTurnOnly ? '対戦相手のターンの間、' : '';
        if (bs.pattern === 'self_sacrifice_other') {
          const cls = bs.sacrificeClass ? `＜${bs.sacrificeClass}＞の` : '';
          return `${oppTurn}このシグニがバニッシュされる場合、代わりにあなたの他の${cls}シグニ１体をバニッシュしてもよい`;
        }
        if (bs.pattern === 'protect_other_sacrifice_self') {
          const vf = bs.victimFilter === 'riseIcon' ? '《ライズアイコン》を持つ' : '';
          const other = bs.victimFilter === 'riseIcon' ? '' : '他の';
          return `${oppTurn}${vf}あなたの${other}シグニ１体がバニッシュされる場合、代わりにこのシグニをバニッシュしてもよい`;
        }
      }
      // BATTLE_BANISH_PREVENT_LOSE_ABILITY（§3タスク6 D・置換ルール）: バニッシュ防止＋能力喪失。
      //   「対戦相手のターンの間」は activeCondition（TURN_OWNER opponent）側で前置されるためここには含めない。
      // EFFECT_LEAVE_REPLACE_BANISH（§3タスク6 D・§6.3 機構待ち）: 非バニッシュ場離れ→バニッシュへの置換。
      if (a.id === 'EFFECT_LEAVE_REPLACE_BANISH' && a.leaveReplaceBanish) {
        const cls = a.leaveReplaceBanish.story ? `＜${a.leaveReplaceBanish.story}＞の` : '';
        return `あなたの${cls}シグニが対戦相手の効果によって場を離れる場合、その移動がバニッシュによるものでないなら、代わりにそのシグニをバニッシュしてもよい`;
      }
      if (a.id === 'BATTLE_BANISH_PREVENT_LOSE_ABILITY' && a.banishPrevent) {
        const subj = a.banishPrevent.story ? `あなたの＜${a.banishPrevent.story}＞のシグニ１体` : 'このシグニ';
        return `${subj}がバニッシュされる場合、代わりにバニッシュされず、ターン終了時まで、この能力を失う`;
      }
      // GRANT_TO_PLACED_SIGNI: 「この方法で場に出たシグニは…を得る」（value に原文を保持）。
      if (a.id === 'GRANT_TO_PLACED_SIGNI') return a.value ?? 'この方法で場に出たシグニは能力を得る';
      // CONDITIONAL_MULTI_CHOOSE_BY_CENTER（系）: 「以下のNつからMつ選ぶ①②③④」を実行時パースで実装する
      // STUB。decompiler は JSON に選択肢を持たないため、原文の選択肢をそのまま反映する（＝engine 挙動と一致）。
      if (a.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER' || a.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE') {
        const pm = currentCardText.match(/以下の([０-９\d]+)つから([０-９\d]+)つ(まで)?選ぶ/);
        const totalN = pm ? pm[1] : '';
        const pick = pm ? pm[2] : '1';
        const made = pm && pm[3] ? 'まで' : '';
        const enh = currentCardText.match(/代わりに([０-９\d]+)つ(?:まで)?選ぶ/);
        const segs = [...currentCardText.matchAll(/[①-⑨]([^①-⑨]*)/g)]
          .map(x => x[1].replace(/\s+/g, ' ').trim().replace(/(?:。|\s|-)+$/, ''));
        if (segs.length >= 2) return `以下の${totalN || segs.length}つから${pick}つ${made}${enh ? `（条件達成で${enh[1]}つまで）` : ''}選ぶ【${segs.join(' / ')}】`;
      }
      // OPTIONAL_DISCARD_HAND_CLASS: 手札から＜X＞のシグニN枚を任意で捨てる（クラス/枚数は EffectText から復元）
      if (a.id === 'OPTIONAL_DISCARD_HAND_CLASS') {
        const m = currentCardText.match(/手札から(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)を?([０-９\d]+)枚/);
        const cls = m?.[1] ? `＜${m[1]}＞の` : '';
        const n = m?.[2] ? numJa(parseInt(m[2].replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)))) : '1';
        return `あなたの手札から${cls}シグニ${n}枚を捨ててもよい`;
      }
      // OPPONENT_PAY_OPTIONAL: 対戦相手の任意コスト支払い（兄弟 CONDITIONAL(IS_MY_TURN) が
      // 「そうしなかった場合」の本体＝SEQUENCE 描画側でラベルを反転する）
      if (a.id === 'OPPONENT_PAY_OPTIONAL') {
        // 回避手段は複数を併記できる（エナ支払い／手札捨て〔色制約可〕／自分のエナをトラッシュ）。
        // ⚠従来は1つしか描画せず、併記型やタスク12(lxi) 第2波の新しい回避手段が逆翻訳から
        //   無言で消えていた（原文照合で気づけなくなるため全部出す）。
        // 併記は「AするかBしてもよい」＝末尾だけ て形にする（全部 て形にすると「捨ててか」になる）
        const optsOPO: { dict: string; te: string }[] = [];
        const costJaOPO = (a.costColors ?? []).map((c: string) => `《${c}》`).join('');
        if (costJaOPO) optsOPO.push({ dict: `${costJaOPO}を支払う`, te: `${costJaOPO}を支払って` });
        if (a.opponentHandDiscard !== undefined) {
          const colOPO = a.opponentHandDiscardFilter?.color;
          const nounOPO = colOPO ? `${colOPO === '無' ? '無色' : colOPO}のカード` : '手札';
          const bodyOPO = a.opponentHandDiscard === 'ALL' ? `${nounOPO}をすべて` : `${nounOPO}を${a.opponentHandDiscard}枚`;
          optsOPO.push({ dict: `${bodyOPO}捨てる`, te: `${bodyOPO}捨てて` });
        }
        // 可変枚数の手札捨て（§6.4 O-9(a)）＝「N枚**まで**」。出さないと固定枚数と見分けが付かない。
        if (a.opponentHandDiscardUpTo !== undefined) {
          const colUp = a.opponentHandDiscardFilter?.color;
          const nounUp = colUp ? `${colUp === '無' ? '無色' : colUp}のカード` : '手札';
          const bodyUp = `${nounUp}を${a.opponentHandDiscardUpTo}枚まで`;
          optsOPO.push({ dict: `${bodyUp}捨てる`, te: `${bodyUp}捨てて` });
        }
        if (a.opponentEnergyTrash !== undefined) {
          const bodyOPO = a.opponentEnergyTrash === 'ALL'
            ? 'エナゾーンのすべてのカードを' : `エナゾーンからカードを${a.opponentEnergyTrash}枚`;
          optsOPO.push({ dict: `${bodyOPO}トラッシュに置く`, te: `${bodyOPO}トラッシュに置いて` });
        }
        if (a.opponentSigniTrash !== undefined) {
          const bodyOPO = `自分のシグニを${a.opponentSigniTrash}体`;
          optsOPO.push({ dict: `${bodyOPO}場からトラッシュに置く`, te: `${bodyOPO}場からトラッシュに置いて` });
        }
        if (a.opponentSigniToDeckTop !== undefined) {
          const bodyOPO = `自分のシグニを${a.opponentSigniToDeckTop}体`;
          optsOPO.push({ dict: `${bodyOPO}デッキの一番上に置く`, te: `${bodyOPO}デッキの一番上に置いて` });
        }
        // 手札＋エナを跨ぐ合計N枚（タスク12(lxi) 第11波・`WXK06-067-E1`）
        if (a.opponentHandOrEnergyToDeckTop !== undefined) {
          const bodyOPO = `エナゾーンのカードと手札を合計${a.opponentHandOrEnergyToDeckTop}枚`;
          optsOPO.push({ dict: `${bodyOPO}デッキの一番上に置く`, te: `${bodyOPO}デッキの一番上に置いて` });
        }
        // 可変《無》コスト（タスク12(lxi) 第8波）＝枚数が実行時の盤面で決まる
        if (a.opponentPayColorlessPerSigniAttack) {
          const bodyOPO = 'このターンにシグニがアタックした回数1回につき《無》を';
          optsOPO.push({ dict: `${bodyOPO}支払う`, te: `${bodyOPO}支払って` });
        }
        if (optsOPO.length === 0) return '対戦相手はコストを支払ってもよい';
        const headOPO = optsOPO.slice(0, -1).map(o => o.dict + 'か、').join('');
        return `対戦相手は${headOPO}${optsOPO[optsOPO.length - 1].te}もよい`;
      }
      // SELECT_TARGET_ONLY: 盤面を変えない対象宣言（タスク12(liii)「〜１体を対象とし、」）
      if (a.id === 'SELECT_TARGET_ONLY') {
        return `${a.selectTarget ? targetJa(a.selectTarget) : '対象'}を対象とする`;
      }
      if (a.id === 'OPTIONAL_COST' || a.id === 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST') {
        // costText（エナ色以外の任意コスト句）が明示されていれば原文どおり描画（A3）
        if (a.costText) return a.costText;
        // 🆕§5.3 `O-59`（2026-09-02）＝排他的な支払い枝（`additionalCostChoices`）を描く。
        //   🔴旧はここへ落ちて「**コストを支払ってもよい**」に潰れており、**何を払うと何が起きるかが
        //   1文字も出ていなかった**（`WX21-025-TRAP` の「＜トリック＞2枚捨てるか《青》《青》」）。
        if (Array.isArray(a.additionalCostChoices) && a.additionalCostChoices.length > 0) {
          const branches = (a.additionalCostChoices as Array<{ costColors?: string[];
            handDiscard?: { count: number; filter?: Record<string, unknown> }; action?: unknown }>).map(ch => {
            const pay = ch.handDiscard
              ? `手札から${filterJa(ch.handDiscard.filter ?? {})}カードを${numJa(ch.handDiscard.count)}枚捨てる`
              : (ch.costColors ?? []).map(c => `《${c}》`).join('') || 'コストを支払う';
            return `${pay}→${actionJa(ch.action as never)}`;
          });
          const unpaid = a.unpaidAction ? `／支払わない場合は${actionJa(a.unpaidAction)}` : '';
          return `以下のいずれかを支払ってもよい【${branches.join(' ／ ')}】${unpaid}`;
        }
        // タスク12(liii): 対象のレベルが倍率になる任意コスト
        if (a.costColorsPerTargetLevel) {
          const unit = a.costColorsPerTargetLevel.map((c: string) => `《${c}》`).join('');
          return `それのレベル1につき${unit}を支払ってもよい`;
        }
        if (a.costColorsPerTargetLevelSum) {
          const unit = a.costColorsPerTargetLevelSum.map((c: string) => `《${c}》`).join('');
          return `それらのレベルの合計1につき${unit}を支払ってもよい`;
        }
        if (a.handDiscardCountFromTargetLevel) {
          const f = a.handDiscardFilter ? filterJa(a.handDiscardFilter) : '';
          return `それのレベル1につき手札から${f}カードを1枚捨ててもよい`;
        }
        if (a.energyTrashCountFromTargetLevel) {
          const same = a.energyTrashSameLevelAsTarget ? 'それと同じレベルの' : '';
          const noun = a.energyTrash?.filter?.cardType ?? 'カード';
          const f = a.energyTrash?.filter ? `${filterJa(a.energyTrash.filter)}${noun}` : 'カード';
          return `それのレベル1につきあなたのエナゾーンから${same}${f}1枚をトラッシュに置いてもよい`;
        }
        // コストスロットは「青|黒」（青か黒のいずれか）形式を許容 → 「《青》か《黒》」
        const costJaOC = (a.costColors ?? []).map((c: string) => c.split('|').map((x: string) => `《${x}》`).join('か')).join('')
          + (a.coinCost ? `《コイン》×${a.coinCost}` : '');
        const headOC = a.id === 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST' ? '対戦相手のシグニ１体を対象とし、' : '';
        // 手札捨てコスト（続き416）。従来は spec を見ずに「コストを支払ってもよい」へ潰れており、
        // 原文の枚数・クラス指定が逆翻訳から丸ごと消えていた（handDiscard を持つ既存 MANUAL も同様）。
        // シグニの下からトラッシュする任意コスト（`fromThis`＝このシグニの下から）
        // キー払いの任意コスト（§6.4 O-3・`WDK06-R09-E1`）＝出さないと「コストを支払ってもよい」に潰れる。
        if (a.trashOwnKey) {
          return `${headOC}このキーを場からルリグトラッシュに置いてもよい`;
        }
        // 自身をエナゾーンへ置く任意コスト（§6.4 O-7）＝出さないと「コストを支払ってもよい」に潰れる。
        if (a.selfToEnergy) {
          return `${headOC}場にあるこのシグニをエナゾーンに置いてもよい`;
        }
        // 自身をトラッシュへ置く任意コスト（§6.4 O-26・続き535）＝`selfToEnergy` の行き先違い。
        // ⚠**エナ色と束ねた1つのコスト**なので原文どおり連用形で繋ぐ（出さないと逆翻訳が
        //   「《無》を支払ってもよい」だけになり、**シグニ1体を失う対価が原文照合で見えない**）。
        // ⚠`selfTrash` ＋ `handDiscard` の束ね（`WX20-069-E1`）は上の `costText` が先に返す。
        if (a.selfTrash) {
          return costJaOC
            ? `${headOC}このシグニを場からトラッシュに置き${costJaOC}を支払ってもよい`
            : `${headOC}このシグニを場からトラッシュに置いてもよい`;
        }
        // O-190 第2バッチ：トラッシュ除外＋色支払いを1つの複合任意コストとして描く。
        // payload から描き、原文全文を regex で再利用しない（逆翻訳が実装の検査になるようにする）。
        if (a.trashExile) {
          const fTX = a.trashExile.filter ? filterJa(a.trashExile.filter) : '';
          const nounTX = ([] as string[]).concat(a.trashExile.filter?.cardType ?? 'カード').join('か');
          const whereTX = a.trashExile.owner === 'any' ? 'いずれかのトラッシュから対象の' : 'あなたのトラッシュにある';
          return `${headOC}${whereTX}${fTX}${nounTX}${a.trashExile.count}枚をゲームから除外し${costJaOC ? `${costJaOC}を支払っ` : ''}てもよい`;
        }
        // O-190 第2バッチ：【トラップ】ゾーンの支払い。excludeSource が原文の「他の」を担う。
        if (a.fieldTrapTrash) {
          const otherFT = a.fieldTrapTrash.excludeSource ? '他の' : '';
          return `${headOC}あなたの場にある${otherFT}【トラップ】${a.fieldTrapTrash.count}枚をトラッシュに置き${costJaOC ? `、${costJaOC}を支払っ` : ''}てもよい`;
        }
        if (a.underAnySigniTrash) {
          const whereUA = a.underAnySigniTrash.fromThis ? 'このシグニの下から' : 'あなたのシグニの下から';
          // 絞り込み（「赤のシグニ1枚」等）も出す＝出さないと逆翻訳でコストの範囲が判定できない（続き421）
          const fUA = a.underAnySigniTrash.filter ? filterJa(a.underAnySigniTrash.filter) : '';
          const nounUA = ([] as string[]).concat(a.underAnySigniTrash.filter?.cardType ?? 'カード').join('か');
          return `${headOC}${whereUA}${fUA}${nounUA}を${a.underAnySigniTrash.count}枚トラッシュに置いてもよい`;
        }
        // エナゾーンからトラッシュする任意コスト（続き421）。従来は spec を見ずに
        // 「コストを支払ってもよい」へ潰れており、**どのカードを何枚払うのかが逆翻訳から消えて**いた
        // ＝原文照合でコスト取り違え（幻の手札コスト）を見つけられない状態だった。
        if (a.energyTrash) {
          const fET = a.energyTrash.filter ? filterJa(a.energyTrash.filter) : '';
          const nounET = ([] as string[]).concat(a.energyTrash.filter?.cardType ?? 'カード').join('か');
          // 選択制約（「共通するクラスを持たない」等）も出す＝出さないと原文照合で制約の有無が判定できない
          const scET = a.energyTrash.selectionConstraint;
          const cET = scET?.totalLevelExact !== undefined ? `レベルの合計が${scET.totalLevelExact}になるように`
            : scET?.totalLevelMax !== undefined ? `レベルの合計が${scET.totalLevelMax}以下になるように`
            : scET?.sharedColor === 'none' ? 'それぞれ共通する色を持たない'
            : scET?.sharedColor === 'all' ? 'それぞれ共通する色を持つ'
            : scET?.distinct ? `それぞれ${scET.distinct === 'level' ? 'レベル' : scET.distinct === 'name' ? '名前' : 'クラス'}の異なる`
            : '';
          const countET = a.energyTrash.count === 'ALL' ? '好きな枚数' : `${a.energyTrash.count}枚`;
          return `${headOC}あなたのエナゾーンから${cET}${fET}${nounET}を${countET}トラッシュに置いてもよい`;
        }
        if (a.handReveal) {
          const fHR = a.handReveal.filter ? filterJa(a.handReveal.filter) : '';
          const nounHR = ([] as string[]).concat(a.handReveal.filter?.cardType ?? 'カード').join('か');
          const scHR = a.handReveal.selectionConstraint;
          const cHR = scHR?.distinct === 'name' ? 'それぞれ名前の異なる'
            : scHR?.distinct === 'level' ? 'それぞれレベルの異なる'
            : scHR?.distinct === 'class' ? 'それぞれクラスの異なる' : '';
          return `${headOC}${costJaOC ? `${costJaOC}を支払い、` : ''}手札から${cHR}${fHR}${nounHR}を${a.handReveal.count}枚公開してもよい`;
        }
        // 自分のアップ状態シグニをダウンする任意コスト（続き417 新設 fieldDown）
        if (a.fieldDown) {
          const fFD = a.fieldDown.filter ? filterJa({ ...a.fieldDown.filter, cardType: undefined, isUp: undefined }) : '';
          const bodyFD = `あなたのアップ状態の${fFD}シグニ${a.fieldDown.count}体をダウンし`;
          return `${headOC}${bodyFD}${costJaOC ? `${costJaOC}を支払っ` : ''}てもよい`;
        }
        if (a.handDiscard) {
          const fHD = a.handDiscard.filter ? filterJa(a.handDiscard.filter) : '';
          // filterJa は名詞（シグニ/カード）を含まないので cardType から補う
          const nounHD = ([] as string[]).concat(a.handDiscard.filter?.cardType ?? 'カード').join('か');
          const countHD = a.handDiscard.count === 'ALL' ? '好きな枚数' : `${a.handDiscard.count}枚`;
          const bodyHD = `手札から${constraintJa(a.handDiscard.selectionConstraint)}${fHD}${nounHD}を${countHD}捨て`;
          return `${headOC}${costJaOC ? `${costJaOC}を支払い` : ''}${bodyHD}てもよい`;
        }
        return `${headOC}${costJaOC || 'コスト'}を支払ってもよい`;
      }
      const burstExtra = a.id === 'GRANT_ALL_ZONE_LIFEBURST'
        ? `（全領域のカードに【ライフバースト】付与${a.burstAdditive ? '・既存バーストにも追加' : ''}${a.burstFilter ? '・対象' + filterJa(a.burstFilter) : ''}${a.burstAction ? '・効果=' + actionJa(a.burstAction) : ''}）`
        : '';
      const extra = `${burstExtra}${a.banishSubstitute ? ' ' + JSON.stringify(a.banishSubstitute) : ''}${a.costColors ? ' コスト' + a.costColors.join('') : ''}`;
      const allFieldLimitM = a.id.match(/^LIMIT_ALL_FIELD_(\d+)$/);
      if (allFieldLimitM) return `[STUB:すべてのプレイヤーはシグニを${allFieldLimitM[1]}体しか場に出せない（超過分はトラッシュ）${extra}]`;
      // COPY_LRIG_TRASH_ACTIVATED / INHERIT_LRIG_TRASH_ABILITIES: ルリグトラッシュのルリグの【起】能力を継承（BattleScreen のルリグメニューで実装済み）
      if (a.id === 'COPY_LRIG_TRASH_ACTIVATED' || a.id === 'INHERIT_LRIG_TRASH_ABILITIES') {
        return 'このルリグはあなたのルリグトラッシュにあるルリグの【起】能力を持つ';
      }
      // CHANGE_ALL_SIGNI_COLOR_TO_BLACK / FORCE_COLOR_BLACK: エナゾーン以外のシグニは黒になる（effectEngine collectFieldSigniExtraColors で実装済み）
      if (a.id === 'CHANGE_ALL_SIGNI_COLOR_TO_BLACK' || a.id === 'FORCE_COLOR_BLACK') {
        return 'エナゾーン以外の領域にあるシグニは黒になる';
      }
      // IGNORE_LRIG_RESTRICTION_ARTS: あなたが使用するアーツとスペルの限定条件は無視される（BattleScreen meetsRestriction で実装済み）
      if (a.id === 'IGNORE_LRIG_RESTRICTION_ARTS') {
        return 'あなたが使用するアーツとスペルの限定条件は無視される';
      }
      // LRIG_UNDER_TO_TRASH: センタールリグの下からN枚をルリグトラッシュへ（エクシード相当のゲート。置けない場合は以降スキップ）
      if (a.id === 'LRIG_UNDER_TO_TRASH') {
        return `あなたのセンタールリグの下からカード${a.value ?? '?'}枚をルリグトラッシュに置く（置けた場合のみ次へ）`;
      }
      // GAIN_SUBSCRIBER_COUNT: 登録者数をN万人得る（valueに万人の数値）
      if (a.id === 'GAIN_SUBSCRIBER_COUNT') {
        return a.value != null ? `登録者数を${a.value}万人得る` : '登録者数を得る';
      }
      // ADD_CARD_TO_LRIG_DECK_HIDDEN: 公開した候補レゾナのどちらか1枚を裏向きでルリグデッキへ（G039）
      if (a.id === 'ADD_CARD_TO_LRIG_DECK_HIDDEN') {
        return '原文の候補レゾナのどちらか1枚を裏向きでルリグデッキに加える（ゲーム外から生成）';
      }
      // DECLARE_NUMBER: 数字宣言（CHOOSE UIで1〜5を選択。declared_guard_restrict_level に保存＝実装済み）
      if (a.id === 'DRAW_AT_TURN_END') return `このターン終了時、あなたのカードを${a.value ?? 1}枚引く（このシグニが場になくても引く）`;
      if (a.id === 'DECLARE_NUMBER') return '数字1つを宣言する';
      // DECLARE_NUMBER_PLAIN: ガード制限を伴わない汎用の数字宣言（タスク12(xlvi)(c)）
      if (a.id === 'DECLARE_NUMBER_PLAIN') return a.numberChoices?.length
        ? `${[1, 2, 3, 4, 5].filter((n: number) => !a.numberChoices.includes(n)).join('・')}以外の数字1つを宣言する`
        : '数字1つを宣言する';
      // DECLARE_PARITY_OPPONENT: 対戦相手が偶数/奇数を宣言する（declared_number に偶=0/奇=1。タスク12(l) WDK04-006）
      if (a.id === 'DECLARE_PARITY_OPPONENT') return '対戦相手は偶数か奇数かを宣言する';
      // DECK_TOP_CHECK_LEVEL_HAND: デッキトップ公開→宣言レベルのシグニなら手札へ（execStubPart2 で実装済み）
      if (a.id === 'DECK_TOP_CHECK_LEVEL_HAND') {
        return 'あなたのデッキの一番上を公開し、それが宣言した数字と同じレベルを持つシグニである場合、それを手札に加える';
      }
      // 【トラップ】設置/操作 STUB群（B1）。engine は signi_traps ゾーン＋execStubPart2 で実装済み。
      // decompiler を原文の【トラップ】語彙で描画（原文クラスタ抽出＋canonicalフォールバック）。
      if (a.id === 'PLACE_TRAP_FROM_REVEALED') {
        const m = currentCardText.match(/その中から[^。]*?【トラップ】として[^。]*?設置[^。]*?(?:よい|する)/);
        return m ? m[0] : 'その中からカードを【トラップ】としてあなたのシグニゾーンに設置する';
      }
      if (a.id === 'PLACE_TRAP_OPTIONAL' || a.id === 'SET_HAND_CARD_AS_TRAP') {
        // 🔴出所は **JSON の `trapSource` から描く**（§5.3 `O-55`）。従来はカード全文 regex で
        //   原文をそのまま切り出していたため、**JSON が出所を持っていなくても逆翻訳だけは正しく見え**、
        //   計器が穴を映さなかった（§6.4 O-20 の全文 regex 読みと同じ落とし穴）。
        const ts = (a as { trapSource?: string }).trapSource;
        // §5.3 `O-87`＝任意/強制も **payload から描く**（原文「設置する」を「してもよい」と書くと嘘になる）。
        const optJa = (a as { trapPlaceOptional?: boolean }).trapPlaceOptional === false ? 'する' : 'してもよい';
        if (ts === 'energy_self') return `このシグニをエナゾーンから【トラップ】としてあなたのシグニゾーンに設置${optJa}`;
        if (ts === 'looked') return `そのカードを【トラップ】としてあなたのシグニゾーンに設置${optJa}`;
        if (ts === 'looked_or_hand') return `そのカードか、あなたの手札1枚を【トラップ】としてあなたのシグニゾーンに設置${optJa}`;
        return `あなたの手札から1枚を【トラップ】としてあなたのシグニゾーンに設置${optJa}`;
      }
      if (a.id === 'ACTIVATE_TRAP' || a.id === 'ACTIVATE_TRAP_IN_FIELD') {
        const m = currentCardText.match(/あなたの【トラップ】[^。]*?表向きに[^。]*?(?:発動[^。]*?(?:させる|する)|シグニにする)/);
        return m ? m[0] : 'あなたの【トラップ】1つを対象とし、それを表向きにし《トラップアイコン》を発動させる';
      }
      // 🆕§5.3 `O-60` 第7バッチ（2026-08-26）＝**枚数を payload から描く**。
      // 🔴旧実装は**カード全文を regex で切り出して原文をそのまま貼っていた**ので、
      //   JSON が枚数を1つも持っていなくても逆翻訳シートは緑だった（§4.3 の「計器が嘘をつく」形）。
      if (a.id === 'TRAP_TO_HAND') {
        const tth = (a as { trapToHand?: { count: number | 'ALL'; upTo?: boolean; alsoSigniFilter?: any } }).trapToHand;
        if (tth) {
          // §5.3 `O-87`＝同じ選択プールに混ぜる場のシグニも payload から描く（落とすと原文の半分が消える）。
          const alsoJa = tth.alsoSigniFilter ? `と${filterJa(tth.alsoSigniFilter)}シグニ` : '';
          if (tth.count === 'ALL') return `あなたの【トラップ】${alsoJa}を好きな数対象とし、それらを場から手札に加える`;
          return `あなたの【トラップ】${alsoJa}を${numJa(tth.count)}つ${tth.upTo ? 'まで' : ''}対象とし、それを手札に加える`;
        }
        return '【※ペイロード欠落】手札に加える【トラップ】の枚数が未指定（engine は何もしない）';
      }
      if (a.id === 'SET_OPP_SIGNI_AS_TRAP') {
        const m = currentCardText.match(/対戦相手のシグニ[^。]*?【トラップ】として[^。]*?設置[^。]*?(?:よい|する)/);
        return m ? m[0] : '対戦相手のシグニ1体を対象とし、それを【トラップ】としてそのシグニゾーンに設置する';
      }
      if (a.id === 'TRAP_TO_SIGNI_IF_ZONE_EMPTY') {
        const m = currentCardText.match(/この【トラップ】[^。]*?シグニがない場合[^。]*?シグニにする/);
        return m ? m[0] : 'この【トラップ】と同じシグニゾーンにシグニがない場合、この【トラップ】を表向きにしてシグニにする';
      }
      if (a.id === 'TRAP_OP' || a.id === 'TRAP_OPERATION') {
        // O-56: **JSONの文単位ペイロードだけ**から描く。カード全文を切り出すと、別能力やLBの語で
        // executorの誤分岐が起きていても逆翻訳だけ正しく見える偽陰性になる。
        if (a.trapOp === 'set') {
          const count = a.count ?? 1;
          const countJa = `${count}枚${a.upToCount ? 'まで' : ''}`;
          const fixed = a.trapFixedZone === 'previous' ? 'それがあったシグニゾーン'
            : a.trapFixedZone === 'source' ? 'そのシグニゾーン'
            : 'あなたのシグニゾーン';
          const base = a.trapSource === 'hand'
            ? `あなたの手札からカードを${countJa}【トラップ】として${fixed}に設置する`
            : a.trapSource === 'field_signi'
              ? `対戦相手のシグニ${count}体を【トラップ】として${fixed}に設置する`
              : a.trapSource === 'looked'
                ? `その中からカード${countJa}を【トラップ】として${fixed}に設置する`
                : `あなたのデッキの上からカードを${count}枚見て${a.upToCount ? '好きな枚数' : countJa}を【トラップ】として${fixed}に設置する`;
          if (a.trapRemainder === 'trash') return `${base}、残りをトラッシュに置く`;
          if (a.trapRemainder === 'hand') return `${base}か、残りを手札に加える`;
          if (a.trapRemainder === 'deck_top') return `${base}、残りをデッキの一番上に置く`;
          if (a.trapRemainder === 'deck_bottom') return `${base}、残りをデッキの一番下に置く`;
          return base;
        }
        if (a.trapOp === 'trash') {
          // 🆕§5.3 `O-59`（2026-09-02）＝「**その**【トラップ】」＝トリガー元と同じゾーンの1つだけ。
          //   🔴落とすと「あなたの【トラップ】1つ」と同じ文になり、**先頭から落としていた旧実装と区別できない**。
          if (a.trapZoneOfTriggerSource) return 'そのシグニゾーンにある【トラップ】をトラッシュに置く';
          return `あなたの【トラップ】${a.count ?? 1}つをトラッシュに置く`;
        }
        if (a.trapOp === 'activate') return a.trapSource === 'field_signi'
          ? `あなたの${a.trapFilter?.story ? `＜${a.trapFilter.story}＞の` : ''}シグニ1体の《トラップアイコン》を発動させる（そのシグニは場に留まる）`
          : 'あなたの【トラップ】1つを表向きにし《トラップアイコン》を発動させる';
        if (a.trapOp === 'rearrange') return 'あなたのすべての【トラップ】を好きなように配置し直す（※並べ替え対話は未実装）';
        if (a.trapOp === 'to_check') {
          const source = a.trapSource === 'trash' ? 'そのシグニをトラッシュから'
            : a.trapSource === 'deck_top' ? 'あなたのデッキの一番上のカードを'
            : 'その中からカード1枚を';
          return `${source}チェックゾーンに置${a.upToCount ? 'いてもよい' : 'く'}${a.trapRemainder === 'hand' ? '、残りを手札に加える' : ''}`;
        }
        if (a.trapOp === 'from_check') return 'そのカードをチェックゾーンからトラッシュに置く';
        if (a.trapOp === 'under_signi') return `このスペルをチェックゾーンから${a.trapHostNames?.length ? a.trapHostNames.map(n => `《${n}》`).join('か') : 'あなたのシグニ'}1体の下に置いてもよい`;
        if (a.trapOp === 'activate_check_burst') return 'チェックゾーンに置いたカードのライフバーストを発動する';
        if (a.trapOp === 'burst_as_check') return 'それのライフバーストをチェックゾーンにあるかのように発動させてもよい';
        if (a.trapOp === 'gain_trap_ability') return 'このカードは対象カードのトラップ能力を得て、その能力を発動する（※能力コピーは未実装）';
        return '【トラップ】操作（trapOp判別子欠落）';
      }
      // engine が no-op スキップする説明テキスト系STUB（execStubPart1.ts と同一）は逆翻訳でも描画しない（空文字）。
      // SEQUENCE/CHOOSE 結合側で空文字ステップを除外する。
      if (a.id === 'RULE_REMINDER_TEXT' || a.id === 'USE_CONDITION_TEXT' || a.id === 'UNLIMITED_KEYS') return '';
      // 内部簿記ステップ（原文に対応する語が無い）は逆翻訳では無音にする
      if (a.id === 'STORE_LAST_PROCESSED_TARGETS' || a.id === 'INTERNAL_NOOP') return '';
      // 敗北/ルリグダメージ防止系STUB（engine実装済み＝prevent_defeat/prevent_lrig_damage フラグ）を原文の意味文で描画。
      // 生STUB（id露出）や `[STUB:〜フラグ]` を逆翻訳語彙に置換（条件・限定は周辺の activeCondition/CHOOSE 側で描画）。
      const preventDmgMap: Record<string, string> = {
        PREVENT_DEFEAT: 'このターン、あなたはゲームに敗北しない',
        PREVENT_DEFEAT_THIS_TURN: 'このターン、あなたはゲームに敗北しない',
        PREVENT_DEFEAT_UNTIL_NEXT_TURN: '次の対戦相手のターン終了時まで、あなたはゲームに敗北しない',
        PREVENT_LRIG_DAMAGE: 'あなたは対戦相手のルリグによってダメージを受けない',
        PREVENT_LRIG_DAMAGE_THIS_TURN: 'このターン、あなたは対戦相手のルリグによってダメージを受けない',
        PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN: '次のターンの間、あなたは対戦相手のルリグによってダメージを受けない',
        // ⚠レベル上限は宣言の `value` に載っている（続き492）＝固定文にすると限定の脱落を見逃す。
        PREVENT_LOW_LEVEL_LRIG_DAMAGE: `あなたは対戦相手のレベル${a.value ?? '?'}以下のルリグによってダメージを受けない`,
        PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP: '対戦相手の効果によって、あなたはダメージを受けず、あなたのライフクロスは他の領域に移動しない',
      };
      if (preventDmgMap[a.id]) return preventDmgMap[a.id];
      // 保護系STUB（対戦相手の効果によって〜されない・engine実装済み）の原文意味文。条件/duration は周辺の activeCondition 側で描画。
      const preventProtectMap: Record<string, string> = {
        PREVENT_ABILITY_CHANGE_BY_OPP: 'あなたの＜古代兵器＞のシグニは対戦相手の効果によって、能力を失わず新たに能力を得られない',
        PREVENT_ABILITY_GAIN_BY_OPP: 'このシグニは対戦相手の効果によって新たに能力を得られない',
        PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP: 'あなたの他のシグニのパワーは対戦相手の効果によって－（マイナス）されない',
        PREVENT_BOUNCE_AND_DOWN_BY_OPP: 'このシグニは対戦相手の効果によって、手札に戻らずダウンしない',
        PREVENT_INFECTED_SIGNI_ACTIVATE: '対戦相手は感染状態のシグニの【起】能力を使用できない',
        PREVENT_LIFE_REFRESH_TRASH: 'あなたのライフクロスはリフレッシュによってトラッシュに移動しない',
        // §6.4 O-37（続き543）＝引用能力の置換3形。⚠支払い方は `damageReplaceByCost.options` に
        //   載っているが、ここでは総称で出す（原文の並びは live JSON を見る）。
        DAMAGE_REPLACE_BY_COST: 'あなたがダメージを受ける場合、代わりにコストを支払ってもよい',
        REFRESH_LIFE_MOVE_REPLACE_LOSE_ABILITY: 'あなたのライフクロスがリフレッシュによってトラッシュに移動する場合、代わりにこのルリグはこの能力を失う',
        PREVENT_NON_FIELD_MOVE_BY_OPP: '場以外のあなたの領域にあるカードは、クラッシュ以外の対戦相手の効果によって他の領域に移動しない',
        PREVENT_ZONE_MOVE_BY_OPP: '対戦相手の効果によって、あなたの手札／エナゾーンにあるカードはトラッシュに移動しない',
        // §6.4 O-3 続き493 の明示 defer＝「次の対戦相手のターン終了時、〜」の**遅延本体**（予約機構が未実装）。
        DEFERRED_NEXT_OPP_TURN_END_BODY: '［未実装：次の対戦相手のターン終了時に行う本文の予約］',
        PREVENT_OPP_POWER_PLUS: '対戦相手の【常】能力の効果によって、シグニのパワーは＋（プラス）されない',
        PREVENT_OPP_SIGNI_ABILITY_GAIN: '対戦相手のシグニは、対戦相手の効果によって新たに能力を得られない',
        PREVENT_SELF_MOVE_BY_OPP: 'このシグニは対戦相手の効果によって場から他の領域に移動しない',
        PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH: '対戦相手の効果はバニッシュ以外でこのシグニを場から移動させない',
        PREVENT_SIGNI_DOWN_BY_OPP: 'このターン、あなたのシグニは対戦相手の効果によってダウンしない',
        PREVENT_SIGNI_DOWN_BY_OPP_ALL: 'あなたの他のシグニは対戦相手の効果によってダウンしない',
        // 🆕§5.3 `O-65`：フェイズ限定は `activeCondition`（《あなたのアタックフェイズの間》）が描くので、
        //   ここから外した（従来は同じ句が2回出ていた）。
        PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH: '対戦相手の効果はバニッシュ以外であなたの＜宇宙＞のシグニを場から移動させない',
        PREVENT_OWN_ARTS_USE: 'このターン、あなたはアーツを使用できない',
        PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN: '次の対戦相手のターンの間、あなたが最初にダメージを受ける場合、代わりにダメージを受けない',
      };
      if (preventProtectMap[a.id]) return preventProtectMap[a.id];
      // 行動制限系STUB（CONTINUOUS「対戦相手は〜できない」・engine認識済み）の原文意味文。
      // 「あなた/対戦相手のターンの間」は activeCondition(TURN_OWNER) が別途前置描画するので本体のみ。
      const blockContinuousMap: Record<string, string> = {
        BLOCK_ALL_OPP_ACTIVATE_ABILITY: '対戦相手はすべての領域にあるシグニの【起】能力を使用できない',
        BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT: '対戦相手は自分のシグニの効果によってシグニを新たに場に出せない',
        BLOCK_OPP_DECK_TO_ENERGY: '対戦相手は自分の効果によってカードをデッキからエナゾーンに移動できない',
        BLOCK_COLORLESS_PLAY: 'あなたは無色のシグニを場に出せず、無色のスペルを使用できない',
        BLOCK_FRONT_SIGNI_ATTACK: '対戦相手は《無》を支払わないかぎり、このシグニの正面にあるシグニでアタックできない',
        BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT: '対戦相手はコストの合計が場にある【チャーム】の数以下のスペルを使用できない',
        BLOCK_NON_WHITE_SPELL: 'すべてのプレイヤーは白ではないスペルを使用できない',
        BLOCK_OPP_ENCORE_AND_BET: '対戦相手はアンコールとベットをできない',
      };
      if (blockContinuousMap[a.id]) return blockContinuousMap[a.id];
      // 能力/色 継承系STUB（CONTINUOUS・activeCondition なし・engine実装済み）の原文意味文。各1枚＝原文の該当文を丸写し。
      const grantUnderMap: Record<string, string> = {
        GRANT_UNDER_LRIG_ACTIVATE_ABILITY: 'このルリグはこのカードの下にあるルリグの【起】能力を持つ',
        GRANT_UNDER_LRIG_AUTO_ABILITY: 'このルリグはこのカードの下にあるルリグの【自】能力を持つ',
        GRANT_UNDER_SIGNI_ALL_ABILITIES: 'このシグニはこのカードの下にある《荒ぶる海洋 §ポセイドナ§》以外の＜天使＞のシグニの【常】と【自】と【起】の能力と、限定条件を得る',
        GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE: 'このシグニはこのカードの下にあるレベル３以下の黒の＜ウェポン＞のシグニの【自】能力を得る',   // `O-65`：フェイズ限定は activeCondition 側が描く
        GRANT_UNDER_SIGNI_CONSTANT_ABILITY: 'このシグニはこのカードの下にあるシグニの【常】の【英知】能力を得る',
        INHERIT_UNDER_SIGNI_COLOR: 'このシグニはこのカードの下にある＜天使＞のシグニが持つ色を得る',
        GAIN_LRIG_COLOR: 'このシグニはあなたの場にいるルリグが持つ色を得る',
        GAIN_ADDITIONAL_LRIG_TYPE: 'あなたのセンタールリグが＜タウィル＞か＜ウムル＞であるかぎり、それは追加で＜タウィル/ウムル＞を得る',
      };
      if (grantUnderMap[a.id]) return grantUnderMap[a.id];
      // 色変化系STUB（CONTINUOUS・activeCondition なし・engine実装済み・action STUB は各1枚）の原文意味文。
      const colorChangeMap: Record<string, string> = {
        CARDS_OUTSIDE_ENERGY_BECOME_WHITE: 'エナゾーン以外の領域にあるカードは白になる',
        ENERGY_NON_COLORLESS_ALL_COLORS: 'あなたのエナゾーンにある無色ではないカードはすべての色を持つ',
        CENTER_LRIG_COLOR_CHANGE_BLACK: 'あなたのセンタールリグは黒になる',
      };
      if (colorChangeMap[a.id]) return colorChangeMap[a.id];
      // カード名コピー系（COPY_LRIG_NAME_ABILITY・WX24-P4-011〜025/WX25-P3-028）＝
      // 「このルリグはルリグトラッシュにあるレベルNの＜X＞と同じカード名としても扱い、そのルリグの【自】能力を得る」。
      // ＜X＞のクラス・レベルはカードごとに異なるため currentCardText から原文文を抽出。
      if (a.id === 'COPY_LRIG_NAME_ABILITY') {
        const m = currentCardText.match(/このルリグはあなたのルリグトラッシュにある[^。]*?と同じカード名としても扱い[^。]*?能力を得る/);
        if (m) return m[0];
      }
      // シグニゾーン指定（DESIGNATE_SIGNI_ZONE・engine実装済み）＝「（シグニのない）（対戦相手の）シグニゾーン１つを指定する」。
      // 「シグニのない」「対戦相手の」前置はカードごとに異なるため currentCardText から抽出。
      if (a.id === 'DESIGNATE_SIGNI_ZONE') {
        // §6.4 O-16: **どちらのゾーンを何個**指定したかは JSON の `owner` / `count` が持つ
        // （＝`designated_zones` の保存先と個数）。原文抜粋だけを返すと `owner:'self'` と既定（相手）、
        // 1ゾーンと2ゾーンが同じ文になり、逆翻訳が区別できない（＝engine を直しても計器に映らない）。
        const ownerJaDSZ = a.owner === 'self' ? 'あなたの' : '対戦相手の';
        const countDSZ = typeof a.count === 'number' && a.count > 1 ? a.count : 1;
        // 語順が2通り＝「シグニゾーン１つを指定する」／「シグニゾーンを２つまで指定し」。
        const m = currentCardText.match(/(?:シグニのない)?(?:対戦相手の)?シグニゾーン(?:[０-９\d]+つを指定する|を[０-９\d]+つ(?:まで)?指定(?:する|し))/);
        // 原文が連用形（「指定し、」）でも逆翻訳は文として閉じる。
        if (m) {
          const bodyDSZ = m[0].replace(/指定し$/, '指定する');
          return /(?:あなた|対戦相手)の/.test(bodyDSZ) ? bodyDSZ : `${ownerJaDSZ}${bodyDSZ}`;
        }
        return `${ownerJaDSZ}シグニゾーンを${numJa(countDSZ)}つ${countDSZ > 1 ? 'まで' : ''}指定する`;
      }
      // 一時レゾナの返却（RETURN_SUMMONED_RESONA_AT_TURN_END・§6.4 続き433）。
      if (a.id === 'RETURN_SUMMONED_RESONA_AT_TURN_END') return 'ターン終了時、この方法で場に出したレゾナをルリグデッキに戻す';
      // レゾナ場出し（SUMMON_RESONA_FROM_LRIG_DECK・engine実装済み）＝
      // 「あなたのルリグデッキから（…の）レゾナ（N枚）を（その）出現条件を無視して場に出す」。
      // レゾナの条件（レベル/色/クラス/枚数）はカードごとに異なるため currentCardText から抽出。
      if (a.id === 'SUMMON_RESONA_FROM_LRIG_DECK') {
        const m = currentCardText.match(/あなたのルリグデッキから[^。：]*?レゾナ[^。：]*?出現条件を無視して場に出す/);
        if (m) return m[0];
      }
      // 歌のカケラ使用（SONG_FRAGMENT・engine実装済み）＝コスト句は別途描画され、本体は
      // 「このルリグ/シグニはそのカードの【歌のカケラ】を使用する」。currentCardText から抽出。
      if (a.id === 'SONG_FRAGMENT') {
        const m = currentCardText.match(/この(?:ルリグ|シグニ)はそのカードの【歌のカケラ】を使用する/);
        if (m) return m[0];
        return 'このルリグはそのカードの【歌のカケラ】を使用する';
      }
      // アップシグニをダウン（DOWN_UP_SIGNI_AND_CHOOSE・engine実装済み）＝コスト軽減素材として
      // 「あなたのアップ状態の＜クラス＞（か＜クラス＞）/色のシグニを好きな数/N体までダウンしてもよい」。
      // クラス/色/枚数はカードごとに異なるため currentCardText から抽出。
      if (a.id === 'DOWN_UP_SIGNI_AND_CHOOSE') {
        const m = currentCardText.match(/(?:あなたの)?アップ状態の[^。]*?のシグニを[^。]*?ダウン(?:してもよい|する)/);
        if (m) return m[0];
        return 'あなたのアップ状態のシグニを好きな数ダウンしてもよい';
      }
      // ターン終了時トラッシュ（TRASH_AT_TURN_END・engine実装済み）＝この方法で場に出したシグニを
      // 「ターン終了時、それ（ら）を場からトラッシュに置く」。単複はカードごとに異なるため currentCardText から抽出。
      if (a.id === 'TRASH_AT_TURN_END') {
        const m = currentCardText.match(/ターン終了時、それ[らも]?を(?:場から)?トラッシュに置く/);
        if (m) return m[0];
        return 'ターン終了時、それを場からトラッシュに置く';
      }
      // ターン終了時エナトラッシュ（TRASH_ENERGY_AT_TURN_END・engine実装済み・§6.4 O-3）＝
      // 「ターン終了時、それらをあなたのエナゾーンからトラッシュに置く」。
      if (a.id === 'TRASH_ENERGY_AT_TURN_END') {
        return 'ターン終了時、それらをあなたのエナゾーンからトラッシュに置く';
      }
      // 色選択（CHOOSE_COLOR_FROM_LIST・engine実装済み）＝「エナゾーンにあるカードが持つ色から最大N色まで選ぶ」
      // または「白、赤、青、黒からNつを選ぶ」。表現がカードごとに異なるため currentCardText から抽出。
      if (a.id === 'CHOOSE_COLOR_FROM_LIST') {
        const m = currentCardText.match(/(?:あなたの)?エナゾーン[^。]*?色から[^。]*?選ぶ|[白赤青緑黒](?:、[白赤青緑黒])+から[^。]*?選ぶ/);
        if (m) return m[0];
        return '色を選ぶ';
      }
      // クラフトをルリグデッキへ（CRAFT_TO_LRIG_DECK/ADD_CRAFT_TO_LRIG_DECK・engine実装済み）＝
      // 「クラフトの《X》N枚をルリグデッキに加える」または「クラフトからN種類を…公開しルリグデッキに加える」。
      // クラフト名/枚数はカードごとに異なるため currentCardText から抽出。
      if (a.id === 'CRAFT_TO_LRIG_DECK' || a.id === 'ADD_CRAFT_TO_LRIG_DECK') {
        const m = currentCardText.match(/クラフト(?:の《[^》]*》|から)[^。]*?ルリグデッキに加える/);
        if (m) return m[0];
        return 'クラフトをルリグデッキに加える';
      }
      // サーバントZERO化（*_SERVANT_ZERO 系4id・engine実装済み）＝
      // 「（ターン終了時まで、）対戦相手の（すべての）シグニ（N体）を《サーバント ＺＥＲＯ》にする」。
      // 対象数/範囲/語順がカードごとに異なるため currentCardText から抽出（ベットコスト前置は除外）。
      if (a.id === 'SIGNI_SERVANT_ZERO' || a.id === 'MAKE_SERVANT_ZERO' ||
          a.id === 'MAKE_MULTI_SERVANT_ZERO' || a.id === 'ALL_OPP_SIGNI_SERVANT_ZERO') {
        const m = currentCardText.match(/(?:ターン終了時まで、)?対戦相手の(?:すべての)?シグニ[^。]*?《サーバント[　\s]*ＺＥＲＯ》にする/);
        if (m) return m[0];
        return 'ターン終了時まで、対戦相手のシグニを《サーバント　ＺＥＲＯ》にする';
      }
      // シード開花（SEED_BLOOM/SEED_BLOOM_OPTIONAL・engine実装済み）。
      // 🆕**payload から描く**（§5.3 `O-60` 第9バッチ・2026-08-29）＝旧実装は `currentCardText` から
      //   【シード】を含む開花クレーズを**切り出して**いたので、**JSON が枚数も対象も持っていなくても
      //   逆翻訳シートは原文どおりに見えた**（`O-55` と同じ「計器が嘘をつく」形）。
      if (a.id === 'SEED_BLOOM' || a.id === 'SEED_BLOOM_OPTIONAL') {
        // ⚠`bounceOccupant`（開花の置換）まで描く＝落とすと「居座るシグニを手札に戻す」の脱落が逆翻訳に映らない。
        const bounceSB = a.bounceOccupant ? '。そのシグニゾーンにシグニがある場合、代わりにそのシグニを手札に戻してから開花する' : '';
        const tailSB = a.id === 'SEED_BLOOM_OPTIONAL' ? '開花してもよい' : '開花する';
        if (a.seedTargetSelf) return 'この【シード】を' + tailSB + bounceSB;
        const countSB = a.seedCount === 'any' ? 'を好きな枚数' : '１枚';
        return 'あなたの【シード】' + countSB + 'を対象とし、それを' + tailSB + bounceSB;
      }
      // 公開からシード設置（PLACE_SEED_FROM_REVEALED・engine実装済み）＝LOOK/シャッフルは別描画され、
      // 本体は「その中からカードN枚を【シード】としてあなたのシグニゾーンに出す（してもよい）」。currentCardText から抽出。
      if (a.id === 'PLACE_SEED_FROM_REVEALED') {
        const m = currentCardText.match(/その中から[^。]*?【シード】として[^。]*?出(?:してもよい|す)/);
        if (m) return m[0];
        return 'その中からカードを【シード】としてあなたのシグニゾーンに出す';
      }
      // バリア獲得（GAIN_LRIG_BARRIER・engine実装済み）＝「【ルリグバリア】/【シグニバリア】N つを得る」。
      // バリア種別/個数がカードごとに異なるため currentCardText から抽出。
      if (a.id === 'GAIN_LRIG_BARRIER' || a.id === 'GAIN_SIGNI_BARRIER') {
        // 種別は stub 側が持っているので、まず**自分の種別**の原文断片を探す。
        // 「【シグニバリア】１つと【ルリグバリア】１つを得る」（WXDi-P12-001）は片方に「つを得る」が
        // 続かないため、種別を問わない旧 regex だと両方の stub が【ルリグバリア】と表示されていた。
        const kind = a.id === 'GAIN_SIGNI_BARRIER' ? 'シグニ' : 'ルリグ';
        const own = currentCardText.match(new RegExp(`【${kind}バリア】[０-９\\d]*つ(?:を得る)?`));
        if (own) return own[0].endsWith('を得る') ? own[0] : `${own[0]}を得る`;
        const m = currentCardText.match(/【(?:ルリグ|シグニ)バリア】[０-９\d]*つを得る/);
        if (m) return m[0];
        return `【${kind}バリア】１つを得る`;
      }
      // バリア喪失（LOSE_SIGNI_BARRIER/LOSE_LRIG_BARRIER・engine実装済み）＝「対戦相手は【○バリア】１つを失う」（WX24-P1-043）
      if (a.id === 'LOSE_SIGNI_BARRIER' || a.id === 'LOSE_LRIG_BARRIER') {
        const kw = a.id === 'LOSE_SIGNI_BARRIER' ? 'シグニバリア' : 'ルリグバリア';
        const n = (a as { count?: number }).count;
        return `対戦相手は【${kw}】${numJa(n ?? 1)}つを失う`;
      }
      // 全領域で色を失う（LOSE_COLOR_ALL_ZONES・CONTINUOUS・engine実装済み）＝
      // 「（あなたの場に＜X＞のルリグがN体いないかぎり、）このカードはすべての領域で色を失う」。
      // 条件は 【常】に前置描画されないため条件ごと currentCardText から抽出。
      if (a.id === 'LOSE_COLOR_ALL_ZONES') {
        const m = currentCardText.match(/(?:あなたの場に[^。]*?いないかぎり、)?このカードはすべての領域で色を失う/);
        if (m) return m[0];
        return 'このカードはすべての領域で色を失う';
      }
      // マジックボックスを開く（OPEN_MAGIC_BOX・engine実装済み）＝後続のバニッシュ等は別描画、本体は
      // 「（このシグニと同じシグニゾーンにある）【マジックボックス】N つを表向きにしトラッシュに置く（いてもよい）」。currentCardText から抽出。
      if (a.id === 'OPEN_MAGIC_BOX') {
        const m = currentCardText.match(/(?:このシグニと同じシグニゾーンにある)?【マジックボックス】[^。]*?表向きにしトラッシュに置(?:いてもよい|く)/);
        if (m) return m[0];
        return '【マジックボックス】１つを表向きにしトラッシュに置く';
      }
      // 相手トラッシュから使用（CAST_FROM_OPP_TRASH・engine実装済み）＝
      // 「対戦相手の（ルリグ）トラッシュから（アーツ/スペル）N枚を対象とし、…使用する（してもよい）」。
      // 使用先/条件はカードごとに異なるため currentCardText から抽出。非マッチ（別構造カード）は
      // フォールスルーして従来表示のまま（誤文を入れない）。
      if (a.id === 'CAST_FROM_OPP_TRASH') {
        const m = currentCardText.match(/対戦相手の(?:ルリグ)?トラッシュから[^。]*?使用(?:してもよい|する)/);
        if (m) return m[0];
      }
      // アクセにする（ACCE_FROM_HAND・engine実装済み）＝原文の表現は多様（エナ/手札/トラッシュ由来・
      // 対象数可変）だが共通末尾「…の【アクセ】にする」の文を currentCardText から抽出（1文＝1ACCE・句は。で区切られ
      // LOOK等の別アクションと重複しない）。非マッチはフォールスルーして従来表示のまま（誤文を入れない）。
      if (a.id === 'ACCE_FROM_HAND' || a.id === 'MULTI_ACCE_FROM_HAND') {
        const m = currentCardText.match(/[^。]*?の【アクセ】にする/);
        if (m) return m[0].replace(/^【[^】]*】[^：。]*：/, '');
      }
      // 複数処理をまとめて行う（DO_THREE_THINGS・engine実装済み＝原文の①②③④を動的パースして実行）＝
      // 「（以下の）N つを行う。①…②…③…（④…）」全体を currentCardText から抽出（。を跨ぐので末尾まで）。
      // BurstText の "-" 連結は末尾 replace で除去。SEQUENCE 先頭に来る場合は SEQUENCE 側で本STUBのみ描画。
      if (a.id === 'DO_THREE_THINGS') {
        const m = currentCardText.match(/以下の[０-９\d一二三四]+つを行う[\s\S]*/);
        if (m) return m[0].replace(/\s*-\s*$/, '').trim();
      }
      // LOCK_OPP_TRASH_MOVE（タスク12(lxxiii) で実働化）＝相手の次ターンのメイン／アタックフェイズの間、
      // 相手は自分のトラッシュのカードを自分の効果で動かせない。第9波では宣言 STUB（no-op）だったので
      // 「（未実装）」を前置していたが、engine 実装済みになったので外した。
      if (a.id === 'LOCK_OPP_TRASH_MOVE') {
        return '次の対戦相手のメインフェイズとアタックフェイズの間、対戦相手のトラッシュにあるカードは対戦相手の効果によって他の領域に移動しない';
      }
      // 手札上限増加（HAND_SIZE_INCREASE・engine実装済み）＝「あなたの手札の枚数の上限はN増える。（X枚からY枚になる）」。
      if (a.id === 'HAND_SIZE_INCREASE') {
        const m = currentCardText.match(/あなたの手札の枚数の上限は[０-９\d]*増える(?:。（[０-９\d]+枚から[０-９\d]+枚になる）)?/);
        if (m) return m[0];
      }
      // 相手手札上限減少（REDUCE_OPP_HAND_LIMIT・engine実装済み）＝「対戦相手の手札の上限はN減る」。
      if (a.id === 'REDUCE_OPP_HAND_LIMIT') {
        const m = currentCardText.match(/対戦相手の手札の上限は[０-９\d]*減る/);
        if (m) return m[0];
      }
      // ウィルス除去（REMOVE_VIRUS・engine実装済み）。
      // 🆕**payload から描く**（§5.3 `O-60` 第11バッチ）＝それまでは `[STUB:ウイルス除去：テキストを解析して…]`
      //   というハンドラのコメントがそのまま出ていた＝**逆翻訳シートを見ても「何個取り除くか」が分からない**。
      if (a.id === 'REMOVE_VIRUS') {
        const cntRV = a.virusCount === 'all' ? 'すべて'
          : a.virusCount === 'any' ? '好きな数'
          : `${a.virusCount ?? 1}つ`;
        return `対戦相手の場にある【ウィルス】を${cntRV}${a.virusOptional ? '取り除いてもよい' : '取り除く'}`;
      }
      // 追加ターン（GAIN_EXTRA_TURN・engine実装済み）。
      // 🆕**payload から描く**（§5.3 `O-60` 第10バッチ）＝旧実装は `currentCardText` から切り出していたので、
      //   **JSON が「誰が得るか」を持っていなくても逆翻訳シートは原文どおりに見えた**。
      if (a.id === 'GAIN_EXTRA_TURN') {
        return (a.extraTurnOwner === 'opponent' ? '対戦相手' : 'あなた') + 'はこのターンの次に、追加の１ターンを得る';
      }
      // 数字宣言してミル（DECLARE_NUMBER/DECLARE_NUMBER_RANGE・engine実装済み）＝
      // 「X～Yの数字１つを宣言する。（あなた/対戦相手の）デッキの上から（カードを）宣言した数字に等しい枚数…トラッシュに置く」。
      if (a.id === 'DECLARE_NUMBER' || a.id === 'DECLARE_NUMBER_RANGE') {
        if (a.decompileDeclarationOnly) {
          const declaration = currentCardText.match(/[０-９\d]+～[０-９\d]+の数字１つを宣言する/);
          if (declaration) return declaration[0];
        }
        const m = currentCardText.match(/[０-９\d]+～[０-９\d]+の数字１つを宣言する。[^。]*?宣言した数字に等しい枚数[^。]*?トラッシュに置く/);
        if (m) return m[0];
      }
      // 指定ゾーンへの新規配置禁止（BLOCK_OPP_ZONE_PLACEMENT・engine実装済み・タスク12(lxi) 第10波）。
      // 期間と《無》の支払い回避は parser がフィールドへ読み取るので、原文抽出ではなく**フィールドから
      // 組み立てて**逆翻訳する（＝parse が期間とコストを取れているかが原文照合で見える）。
      if (a.id === 'BLOCK_OPP_ZONE_PLACEMENT') {
        const spanBZP = a.zoneBlockThisTurn && a.zoneBlockNextTurn ? 'このターンと次のターンの間'
          : a.zoneBlockNextTurn ? '次のターンの間' : 'このターン';
        const payBZP = a.zoneBlockColorless ? `《無》×${a.zoneBlockColorless}を支払わないかぎり` : '';
        // ゾーンの供給源（タスク12(lxxvi)）＝取り違えると別ゾーンを禁止するので逆翻訳でも書き分ける。
        const zoneBZP = a.zoneBlockSource === 'vacated' ? 'それがあった'
          : a.zoneBlockSource === 'virus' ? '【ウィルス】がある' : '指定された';
        return `${spanBZP}、対戦相手は${payBZP}${zoneBZP}シグニゾーンにシグニを新たに配置できない`;
      }
      // シグニゾーンを消す（REMOVE_SIGNI_ZONE・engine実装済み）＝「（ターン終了時まで、）対戦相手のシグニゾーンN つを消す」。
      if (a.id === 'REMOVE_SIGNI_ZONE') {
        const m = currentCardText.match(/(?:ターン終了時まで、)?対戦相手のシグニゾーン[０-９\d]*つを消す/);
        if (m) return m[0];
      }
      // 効果の適用上限（EFFECT_LIMIT・engine実装済み・パワー修正等の注記）＝「この効果はN枚までしか適用されない」。
      if (a.id === 'EFFECT_LIMIT') {
        const m = currentCardText.match(/この効果は[０-９\d]+枚までしか適用されない/);
        if (m) return m[0];
      }
      // 2倍マイナス（DOUBLE_OWN_POWER_MINUS・engine実装済み）＝「（対象とし、）このターン、あなたの効果によってそれのパワーが－（マイナス）される場合、代わりに２倍－（マイナス）される」。
      if (a.id === 'DOUBLE_OWN_POWER_MINUS') {
        const m = currentCardText.match(/(?:対戦相手のシグニ[０-９\d]*体を対象とし、)?このターン、あなたの効果によってそれのパワーが－（マイナス）される場合、代わりに２倍－（マイナス）される/);
        if (m) return m[0];
      }
      // クラス変更（CLASS_CHANGE・engine実装済み）＝「シグニN体を対象とし、ターン終了時まで、それはクラスを失い、＜X＞を得る」。
      // fallback＝「ターン終了時まで、…（すべての…シグニ／それ）はクラスを失い、（＜X＞／宣言されたクラス）を得る」。
      if (a.id === 'CLASS_CHANGE') {
        const m = currentCardText.match(/シグニ[０-９\d]*体を対象とし、ターン終了時まで、それはクラスを失い、＜[^＞]+＞を得る/)
          ?? currentCardText.match(/ターン終了時まで、[^。]*?クラスを失い、(?:＜[^＞]+＞|宣言されたクラス)を得る/);
        if (m) return m[0];
      }
      // 場依存の使用コスト減（CONDITIONAL_COST_REDUCTION_BY_FIELD・engine実装済み）＝「あなたの場に…がある場合、このスペルの使用コストは…減る」。
      if (a.id === 'CONDITIONAL_COST_REDUCTION_BY_FIELD') {
        const m = currentCardText.match(/あなたの場に[^。]*?使用コストは[^。]*?減る/);
        if (m) return m[0];
      }
      // 全領域ライフバースト付与（GRANT_ALL_ZONE_LIFEBURST・engine実装済み）＝「あなたのすべての領域にある（…の）カードは【ライフバースト】…を持つ」。
      if (a.id === 'GRANT_ALL_ZONE_LIFEBURST') {
        const m = currentCardText.match(/あなたのすべての領域にある[^。]*?【ライフバースト】[^。]*?を持つ/);
        if (m) return m[0];
      }
      // アタッカー正面へ配置（MOVE_TO_ATTACKER_FRONT・engine実装済み）＝「（正面にシグニがない場合、）このシグニをアタックした（その）シグニの正面に配置してもよい」。
      if (a.id === 'MOVE_TO_ATTACKER_FRONT') {
        const m = currentCardText.match(/(?:[^。]*?正面にシグニがない場合、)?このシグニをアタックした(?:その)?シグニの正面に配置してもよい/);
        if (m) return m[0];
      }
      // コラボライバー（COLLAB・engine実装済み）＝【常】は「【ガード】する際…コラボしてもよい」（ガード代替）、
      // それ以外は「コラボライバーN人を呼ぶ」。同一カードに両方あるため effectType で分岐。
      if (a.id === 'COLLAB') {
        if (effectType === 'CONTINUOUS') {
          const mc = currentCardText.match(/あなたが【ガード】する際、[^。]*?コラボしてもよい/);
          if (mc) return mc[0];
        }
        const m = currentCardText.match(/コラボライバー[０-９\d一二三四]*人を呼ぶ/);
        if (m) return m[0];
      }
      // スペルを無償・限定無視で使用（PLAY_SPELL_FREE_IGNORE_RESTRICTION・engine実装済み）＝
      // 「（あなたの手札/対戦相手のトラッシュ/いずれかのプレイヤーのトラッシュ）から…スペル…コストを支払わずに限定条件を無視して使用する」。
      if (a.id === 'PLAY_SPELL_FREE_IGNORE_RESTRICTION') {
        const m = currentCardText.match(/(?:あなたの手札|対戦相手のトラッシュ|いずれかのプレイヤーのトラッシュ)から[^。]*?スペル[^。]*?限定条件を無視して使用する/);
        if (m) return m[0];
      }
      // 相手が選んで実行（OPP_*・standalone型・engine実装済み）＝「対戦相手は以下のN つから１つを選び、（あなた/対戦相手）はそれを行う。①…②…」。
      // 次の効果マーカー【 の手前まで抽出。宣言当てゲーム型（別構造）は非マッチでフォールスルー。
      if (a.id === 'OPP_DECLARE_CHOICE' || a.id === 'OPP_CHOOSE_EFFECT' || a.id === 'OPP_CHOOSES_FOR_YOU') {
        const m = currentCardText.match(/対戦相手は以下の[０-９\d一二三四]+つから[０-９\d一二]つを選び[^【]*/);
        if (m) return m[0].replace(/\s*-\s*$/, '').trim();
      }
      // 効果を繰り返す（REPEAT_EFFECT・engine実装済み）＝「あなたはこの効果をあとN回まで繰り返してもよい（。（合計で最大M回まで行える）」。
      if (a.id === 'REPEAT_EFFECT') {
        const m = currentCardText.match(/あなたはこの効果をあと[０-９\d]+回まで繰り返してもよい(?:。（[^）]*）)?/);
        if (m) return m[0];
      }
      // チャームなければ自トラッシュ（SELF_TRASH_IF_NO_OPP_CHARM・engine実装済み）＝「対戦相手の場に【チャーム】がない場合、このシグニをトラッシュに置く」。
      if (a.id === 'SELF_TRASH_IF_NO_OPP_CHARM') {
        const m = currentCardText.match(/対戦相手の場に【チャーム】がない場合、このシグニをトラッシュに置く/);
        if (m) return m[0];
      }
      // アクセをエナへ（ACCE_TO_ENERGY/PLACE_ACCE_SIGNI_TO_ENERGY・engine実装済み）＝「あなたの手札から《アクセアイコン》を持つシグニをN枚までエナゾーンに置く」。
      if (a.id === 'ACCE_TO_ENERGY' || a.id === 'PLACE_ACCE_SIGNI_TO_ENERGY') {
        const m = currentCardText.match(/あなたの手札から《アクセアイコン》を持つシグニを[０-９\d]*枚まで(?:あなたの)?エナゾーンに置く/);
        if (m) return m[0];
      }
      // 捨てた枚数+Nドロー（DRAW_DISCARD_COUNT_PLUS_N・engine実装済み）＝「この方法でカードをN枚以上捨てた場合、捨てた枚数にMを加えた枚数のカードを引く」。
      if (a.id === 'DRAW_DISCARD_COUNT_PLUS_N') {
        const m = currentCardText.match(/この方法でカードを[０-９\d]*枚以上捨てた場合、捨てた枚数に[０-９\d]*を加えた枚数のカードを引く/);
        if (m) return m[0];
      }
      // ライド（CENTER_LRIG_RIDES_ON_SIGNI・engine実装済み）＝「【ライド】（ターン終了時まで、このルリグは…に乗る。…ドライブ状態のルリグはアタックできない）」。
      if (a.id === 'CENTER_LRIG_RIDES_ON_SIGNI') {
        const m = currentCardText.match(/【ライド】（[\s\S]*?アタックできない）/);
        if (m) return m[0];
      }
      // 手札をシグニの下に（HAND_CARDS_UNDER_SIGNI・engine実装済み）＝「あなたの手札からカードをN枚までこのシグニの下に置く」。
      if (a.id === 'HAND_CARDS_UNDER_SIGNI') {
        const m = currentCardText.match(/あなたの手札からカードを[０-９\d]*枚まで(?:この)?シグニの下に置く/);
        if (m) return m[0];
      }
      // クラス宣言（DECLARE_CLASS・engine実装済み）＝「クラスN つを宣言する」（後続の探索は別描画）。
      if (a.id === 'DECLARE_CLASS') {
        // 候補列挙つき（「＜精像＞か＜精武＞か…から1つを宣言する」PR-431・タスク12(xlvi)(c)）
        if (a.declareOptions?.length) return `${a.declareOptions.map((c: string) => `＜${c}＞`).join('か')}から1つを宣言する`;
        const m = currentCardText.match(/クラス[０-９\d一]*つを宣言する/);
        if (m) return m[0];
      }
      // ゲート設置（PLACE_OWN_GATE・engine実装済み）＝「あなたのシグニゾーンN つに【ゲート】M つを置く」。
      if (a.id === 'PLACE_OWN_GATE') {
        const m = currentCardText.match(/あなたのシグニゾーン[０-９\d]*つに【ゲート】[０-９\d]*つを置く/);
        if (m) return m[0];
      }
      // デッキトップ公開しアタッカー配置（REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI・engine実装済み）。
      if (a.id === 'REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI') {
        const m = currentCardText.match(/あなたのデッキの一番上を公開する。それがシグニの場合、それをアタックしているシグニとしてダウン状態で場に出す/);
        if (m) return m[0];
      }
      // 対象を自身へ強制（FORCE_TARGET_SELF・engine実装済み）＝「（対戦相手のターンの間、）対戦相手は、…対象を選ぶ際、可能ならばこのシグニを対象とする」。
      if (a.id === 'FORCE_TARGET_SELF') {
        const m = currentCardText.match(/(?:対戦相手のターンの間、)?対戦相手は、[^。]*?対象を選ぶ際、可能ならばこのシグニを対象とする/);
        if (m) return m[0];
      }
      // 手札1枚選ぶ（CHOOSE_HAND_CARD・engine実装済み）＝「あなたの手札をN枚選ぶ」（後続の宣言当ては別描画）。
      if (a.id === 'CHOOSE_HAND_CARD') {
        const m = currentCardText.match(/あなたの手札を[０-９\d一]*枚選ぶ/);
        if (m) return m[0];
      }
      // 相手マルチエナ剥奪（REMOVE_OPP_MULTI_ENA/_ONLY・engine実装済み）＝「対戦相手のエナゾーンにあるカードは【マルチエナ】を失う（い、新たに得られない）」。
      if (a.id === 'REMOVE_OPP_MULTI_ENA' || a.id === 'REMOVE_OPP_MULTI_ENA_ONLY') {
        const m = currentCardText.match(/対戦相手のエナゾーンにあるカードは【マルチエナ】を失(?:い、新たに得られない|う)/);
        if (m) return m[0];
      }
      // 相手手札を見て選び公開（REVEAL_OPP_HAND_CARD・engine実装済み）＝「対戦相手の手札をN枚見ないで選び、（対戦相手はそのカードを公開する/公開させる）」。
      if (a.id === 'REVEAL_OPP_HAND_CARD') {
        const m = currentCardText.match(/対戦相手の手札を[０-９\d一]*枚見ないで選び、(?:対戦相手はそのカードを公開する|公開させる)/);
        if (m) return m[0];
      }
      // レイヤー能力付与（LAYER_ABILITY_COPY・engine実装済み）＝「【レイヤー】あなたの＜X＞のシグニは《レイヤーアイコン》の能力を得る」。
      if (a.id === 'LAYER_ABILITY_COPY') {
        const m = currentCardText.match(/【レイヤー】あなたの[^。]*?シグニは《レイヤーアイコン》の能力を得る/);
        if (m) return m[0];
      }
      // ルリグがシグニから降りる（CENTER_LRIG_DISMOUNT・engine実装済み）＝「あなたのセンタールリグN体を対象とし、それはすべてのシグニから降りてもよい」。
      if (a.id === 'CENTER_LRIG_DISMOUNT') {
        const m = currentCardText.match(/あなたのセンタールリグ[０-９\d一]*体を対象とし、それはすべてのシグニから降りてもよい/);
        if (m) return m[0];
      }
      // 相手アタック回数制限（LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE・engine実装済み）
      // ＝「（このターン、／次のあなたのターンまで、）対戦相手は…しかアタックできない」を原文抽出（3カードで語順・範囲が異なるため currentCardText 由来）。
      if (a.id === 'LIMIT_OPP_SIGNI_ATTACKS_ONCE' || a.id === 'OPP_SIGNI_ONE_ATTACK_TOTAL' || a.id === 'LIMIT_OPP_ATTACK_ONCE') {
        const m = currentCardText.match(/(?:このターン、|次のあなたのターンまで、)?対戦相手[^。]*?しかアタックできない/);
        if (m) return m[0];
      }
      // 相手が公開する系（OPP_REVEAL_HAND_AND_LRIG_DECK / OPP_REVEAL_LRIG_DECK / OPP_REVEAL_TOP_AND_HAND・engine実装済み）
      // ＝3枚で公開元（手札＋ルリグデッキ／ルリグデッキ／デッキトップ＋手札）が異なるため currentCardText から原文抽出。
      if (a.id === 'OPP_REVEAL_HAND_AND_LRIG_DECK' || a.id === 'OPP_REVEAL_LRIG_DECK' || a.id === 'OPP_REVEAL_TOP_AND_HAND') {
        const m = currentCardText.match(/対戦相手は[^。]*公開する。(?:（[^）]*）)?/);
        if (m) return m[0];
      }
      // ライフバースト二度発動（LIFE_BURST_DOUBLE）＝「（このターン、）（次に）あなたのライフバーストが発動する場合、代わりにそのライフバーストは二度発動する」を原文抽出。
      if (a.id === 'LIFE_BURST_DOUBLE') {
        const m = currentCardText.match(/このターン、(?:次に)?あなたのライフバーストが発動する場合、代わりにそのライフバーストは二度発動する/);
        if (m) return m[0];
      }
      // ルリグが乗機シグニに乗る（RIDE_ON）＝「ターン終了時まで、…センタールリグ…は…＜乗機＞のシグニ…に乗ってもよい」を原文抽出。
      if (a.id === 'RIDE_ON') {
        const m = currentCardText.match(/ターン終了時まで、[^。]*?センタールリグ[^。]*?乗ってもよい/);
        if (m) return m[0];
        // 🆕**キーワード `【ライド】` から生成した `-RIDE` 効果**（2026-08-31 §5.2）＝原文には
        //   「センタールリグ…乗ってもよい」という本文が無い（注釈は `（…）` で書かれている）ので
        //   上の抽出は空振りする。**生の英語 ID を出さない**ため定型文へ落とす（`census:stubs` C群）。
        return 'ターン終了時まで、このルリグはあなたの＜乗機＞のシグニ1体に乗る（ドライブ状態になる）';
      }
      // 相手ドロー制限（OPP_DRAW_LIMIT）＝「（次の対戦相手の／その）ドローフェイズの間…対戦相手はカードを合計N枚までしか引けない」を原文抽出。
      if (a.id === 'OPP_DRAW_LIMIT') {
        const m = currentCardText.match(/(?:次の対戦相手の|その)?(?:ターンの)?ドローフェイズの間[に、]?対戦相手はカードを合計[０-９\d一二三]+枚までしか引けない/);
        if (m) return m[0];
      }
      // トラッシュしたカードからピック（PICK_FROM_TRASHED_CARDS）＝「この方法でトラッシュに置かれたカードの中から…対象とし、それ(ら)を手札に加える(か場に出す)」を原文抽出。
      if (a.id === 'PICK_FROM_TRASHED_CARDS') {
        const m = currentCardText.match(/この方法でトラッシュに置かれたカードの中から[^。]*?対象とし、それら?を手札に加える(?:か場に出す)?/);
        if (m) return m[0];
        // 🆕原文が「その後、…**それを**トラッシュから場に出す」形（`WXK07-106-E1`）だと上の regex に
        //   当たらない＝**ペイロードから組み立てる**（カード全文 regex 頼みは §5.3 `O-60` の死角）。
        const tp = a.trashedPick;
        if (tp) {
          const destJa = tp.dest === 'energy' ? 'エナゾーンに置く'
            : tp.dest === 'field' ? '場に出す'
              : tp.dest === 'hand_or_field' ? '手札に加えるか場に出す' : '手札に加える';
          return `この方法でトラッシュに置いたカードの中から${filterJa(tp.filter)}${numJa(tp.count)}枚${tp.upTo ? 'まで' : ''}を${destJa}`;
        }
      }
      // 場出し制限（DEPLOY_RESTRICT）＝「…新たに(場に)出せない(。（補足）)」をカード別に原文抽出（先頭の【】：は timing 側で描画済のため除外）。
      if (a.id === 'DEPLOY_RESTRICT') {
        // 配置数制限：「(このターン、)対戦相手はシグニをN体までしか場に出(せない/すことができない)(。（補足＝トラッシュ処理）)」
        const mc = currentCardText.match(/(?:このターン、)?対戦相手は[^。：]*?シグニを[０-９\d]+体までしか[^。]*?場に出(?:せない|すことができない)(?:。（[^）]*）)?/);
        if (mc) return mc[0];
        const m = currentCardText.match(/[^。：]*新たに[^。]*出せない(?:。（[^）]*）)?/);
        if (m) return m[0];
      }
      // 相手シグニのアタックパワー制限（OPP_SIGNI_ATTACK_POWER_RESTRICT）＝「このターン、対戦相手はパワーがN以下のシグニでアタックできない」を原文抽出。
      if (a.id === 'OPP_SIGNI_ATTACK_POWER_RESTRICT') {
        const m = currentCardText.match(/このターン、対戦相手はパワーが[０-９\d]+以下のシグニでアタックできない/);
        if (m) return m[0];
      }
      // コイン使用先制限（COIN_USE_RESTRICTION）＝「このゲームの間、あなたは《コインアイコン》をスペルとシグニにしか支払えない」を原文抽出。
      if (a.id === 'COIN_USE_RESTRICTION') {
        const m = currentCardText.match(/このゲームの間、あなたは《コインアイコン》をスペルとシグニにしか支払えない/);
        if (m) return m[0];
      }
      // 相手が色を宣言（OPP_DECLARE_COLOR）＝「対戦相手は色N つを宣言する」を原文抽出（宣言色によるトラッシュ処理は後続の別効果側で描画）。
      if (a.id === 'OPP_DECLARE_COLOR') {
        const m = currentCardText.match(/対戦相手は色[０-９\d一]つを宣言する/);
        if (m) return m[0];
      }
      // 自シグニの下にカードを置く（HAND_CARDS_UNDER_SIGNI / PLACE_SIGNI_UNDER_SELF_OPT）＝カード別（手札から／場のシグニ）に「…をこのシグニの下に置いてもよい」を原文抽出。
      if (a.id === 'HAND_CARDS_UNDER_SIGNI' || a.id === 'PLACE_SIGNI_UNDER_SELF_OPT') {
        const m = currentCardText.match(/あなたの[^。]*?をこのシグニの下に置いてもよい(?:。（[^）]*）)?/);
        if (m) return m[0];
      }
      // 相手メインフェイズのリミット減（OPP_MAIN_PHASE_LIMIT_DOWN）＝「次の対戦相手のメインフェイズの間、対戦相手のセンタールリグのリミットを－Nする」を原文抽出。
      if (a.id === 'OPP_MAIN_PHASE_LIMIT_DOWN') {
        const m = currentCardText.match(/次の対戦相手のメインフェイズの間、対戦相手のセンタールリグのリミットを－[０-９\d一二三]+する/);
        if (m) return m[0];
      }
      // 相手シグニのアタックにコスト（OPP_SIGNI_ATTACK_COST）＝「ターン終了時まで、対戦相手のすべてのシグニは「【常】：あなたが《無》…を支払わないかぎりアタックできない。」を得る」を原文抽出。
      if (a.id === 'OPP_SIGNI_ATTACK_COST') {
        const m = currentCardText.match(/ターン終了時まで、対戦相手のすべてのシグニは「【常】：あなたが《無》(?:《無》)*を支払わないかぎりアタックできない。」を得る/);
        if (m) return m[0];
      }
      // 対象シグニのパワーを基本パワーにコピー（COPY_TARGET_POWER）＝「シグニN体を対象とし、（次の対戦相手の）ターン終了時まで、このシグニの基本パワーはそれのパワーと同じ値になる」を原文抽出。
      if (a.id === 'COPY_TARGET_POWER') {
        const m = currentCardText.match(/シグニ[０-９\d一]体を対象とし、(?:次の対戦相手の)?ターン終了時まで、このシグニの基本パワーはそれのパワーと同じ値になる/);
        if (m) return m[0];
      }
      // 場・エナのシグニが色を追加取得（FIELD_ENERGY_SIGNI_GAIN_COLOR・CONTINUOUS）＝「あなたの、場とエナゾーンにある…シグニは追加で…を得る」を原文抽出。
      if (a.id === 'FIELD_ENERGY_SIGNI_GAIN_COLOR') {
        const m = currentCardText.match(/あなたの、場とエナゾーンにある[^。]*?シグニは追加で[^。]*?を得る/);
        if (m) return m[0];
      }
      // 次の相手アップフェイズにアップさせない（UPKEEP_OR_NO_UP）＝「次の対戦相手のアップフェイズに、対戦相手が…支払わないかぎり、対戦相手のセンタールリグはアップしない」を原文抽出。
      if (a.id === 'UPKEEP_OR_NO_UP') {
        const m = currentCardText.match(/次の対戦相手のアップフェイズに、対戦相手が[^。]*?支払わないかぎり、対戦相手のセンタールリグはアップしない/);
        if (m) return m[0];
      }
      // ベット機構（BET_MECHANIC）＝この STUB がアクション全体を占める（構造化なし）ので「ベット―」以降の全文を原文抽出。
      // §5b Z-2（PLAN.md）。engine 側は §6.3 の機構待ちに登録済み・ここは表現のみ。
      if (a.id === 'BET_MECHANIC') {
        const m = currentCardText.match(/ベット―[\s\S]*/);
        if (m) return m[0];
      }
      // すべての領域でクラス扱い（TREAT_AS_CLASS_ALL_ZONES）＝「このカードはすべての領域で＜X＞として扱う」を原文抽出
      // （collectTreatAsClassAllZones が同じ正規表現でクラス名を実行時に読み取るため、抽出パターンを合わせてある）。
      if (a.id === 'TREAT_AS_CLASS_ALL_ZONES') {
        const m = currentCardText.match(/このカードはすべての領域で＜.+?＞として扱う/);
        if (m) return m[0];
      }
      // ベット時の代替効果（BET_ALTERNATIVE／BET_CONDITION）＝「あなたがベットしていた場合、…。」の一文を原文抽出
      // （BET_ALTERNATIVEは「代わりに」を伴う言い回し、BET_CONDITIONは「Xの代わりにYまで」等の言い回し＝どちらも
      // 「あなたがベットしていた場合、」で始まり最初の句点までが該当文。直後の（補足）括弧があれば含める）。
      if (a.id === 'BET_ALTERNATIVE' || a.id === 'BET_CONDITION') {
        // 末尾の句点は含めない（呼び出し側のSEQUENCE結合が付与する慣例＝他STUBの原文抽出と同じ）。
        // ただし直後に（補足）括弧が続く場合は句点ごと含めて残す（PLACE_MAGIC_BOX 等と同じ扱い）。
        const m = currentCardText.match(/あなたがベットしていた場合、[^。]*(?:。（[^）]*）)?/);
        if (m) return m[0];
      }
      // 能力なしならトラッシュ（ABILITY_CHECK_ELSE_TRASH）＝「それが能力を持たない場合、代わりにそれをトラッシュに置く」を原文抽出。
      if (a.id === 'ABILITY_CHECK_ELSE_TRASH') {
        const m = currentCardText.match(/それが能力を持たない場合、代わりにそれをトラッシュに置く/);
        if (m) return m[0];
      }
      // ダウンしたシグニのパワーを加算（POWER_COPY_FROM_DOWNED）＝「ターン終了時まで、このシグニのパワーをこの方法でダウンしたシグニのパワーと同じだけ＋（プラス）する」を原文抽出。
      if (a.id === 'POWER_COPY_FROM_DOWNED') {
        const m = currentCardText.match(/ターン終了時まで、このシグニのパワーをこの方法でダウンしたシグニのパワーと同じだけ＋（プラス）する/);
        if (m) return m[0];
      }
      // トラッシュからアクセ付与（ACCE_FROM_TRASH）＝「あなたのトラッシュから…を対象とし、それをこのシグニの【アクセ】にする」を原文抽出。
      if (a.id === 'ACCE_FROM_TRASH' || a.id === 'NAMED_SIGNI_ACCE_FROM_TRASH') {
        const m = currentCardText.match(/あなたのトラッシュから[^。]*?を対象とし、それをこのシグニの【アクセ】にする/);
        if (m) return m[0];
      }
      // シグニをトラッシュのシグニと同名化（COPY_SIGNI）＝「ターン終了時まで、対象のあなたのシグニN体はあなたのトラッシュにある対象のシグニN枚と同じカードになる」を原文抽出。
      if (a.id === 'COPY_SIGNI') {
        const m = currentCardText.match(/ターン終了時まで、対象のあなたのシグニ[０-９\d一]体はあなたのトラッシュにある対象のシグニ[０-９\d一]枚と同じカードになる/);
        if (m) return m[0];
      }
      // マジックボックス設置（PLACE_MAGIC_BOX）＝「そのカードを【マジックボックス】としてあなたのシグニゾーンに設置してもよい(。（補足）)」を原文抽出。
      if (a.id === 'PLACE_MAGIC_BOX') {
        const m = currentCardText.match(/そのカードを【マジックボックス】としてあなたのシグニゾーンに設置してもよい(?:。（[^）]*）)?/);
        if (m) return m[0];
      }
      // 引用能力付与（GRANT_QUOTED_ACTIVATE_ABILITY＝引用【起】／SIGNI_GRANT_QUOTED_CONSTANT_ABILITY＝引用【常】）
      // ＝「…は「【起】/【常】：…」を得る(。（補足）)」を原文抽出。主語は直近の。／：以降、引用内は「」を得る の最初の閉じまで。
      if (a.id === 'GRANT_QUOTED_ACTIVATE_ABILITY' || a.id === 'SIGNI_GRANT_QUOTED_CONSTANT_ABILITY') {
        // 印刷済み【使用条件】が本文へ直結するピースでは、条件側の「あなたの場に…」から
        // 抽出を始めると condition と本体が二重表示になる。対象シグニ句を優先アンカーにする。
        const m = currentCardText.match(/あなたの(?!場に)[^。「」]*?シグニ[^。「」]*?(?:は|それ(?:ら)?は)「[\s\S]+?」を得る(?:。（[^）]*）)?/)
          ?? currentCardText.match(/[^。：]*?は「[\s\S]+?」を得る(?:。（[^）]*）)?/);
        if (m) return m[0];
      }
      if (a.id === 'SIGNI_FLIP_FACEDOWN' && a.faceDownTarget) {
        if (a.faceDownTarget.delayUntilTurnEnd && a.faceDownTarget.returnTiming === 'NEXT_OPP_ATTACK_PHASE_START') {
          return 'このターン終了時、あなたのすべてのシグニを裏向きにする。次の対戦相手のアタックフェイズ開始時、この方法で裏向きにしたシグニを、同じ場所にシグニがない場合、表向きにする';
        }
        if (a.faceDownTarget.frontOfSelf && a.faceDownTarget.owner === 'opponent') {
          return 'このシグニの正面のシグニ１体を対象とし、それを裏向きにする';
        }
        if (a.faceDownTarget.owner === 'self') {
          const count = a.faceDownTarget.count === 'ALL' ? 'すべての' : `${numJa(a.faceDownTarget.count)}体${a.faceDownTarget.upToCount ? 'まで' : ''}`;
          return `あなたのシグニを${count}対象とし、それらを裏向きにする`;
        }
      }
      // 任意ルリグデッキ除外＋シグニアタックステップ封じ（WXK11-001②）＝閾値・枚数は構造から復元する
      // （固定文にすると parser が別の数値を載せたときに黙って嘘をつく）。
      if (a.id === 'EXILE_ARTS_FROM_LRIG_DECK_SKIP_SIGNI_STEP') {
        const exSpec = (a as { exileArtsFromLrigDeck?: { count: number; minTotalCost?: number } }).exileArtsFromLrigDeck;
        if (exSpec) {
          return `あなたのルリグデッキにあるコストの合計が${numJa(exSpec.minTotalCost ?? 0)}以上のアーツ${numJa(exSpec.count)}枚をゲームから除外してもよい。そうした場合、このターン、シグニアタックステップをスキップする`;
        }
      }
      // 🆕§5.3 `O-66`（2026-08-25）＝ライフクラッシュ防止／回数制限は**構造から復元する**
      //   （上の `EXILE_ARTS_FROM_LRIG_DECK_SKIP_SIGNI_STEP` と同じ理由＝固定文にすると
      //   parser が別の軸・別の枚数を載せたときに逆翻訳が黙って嘘をつき、原文照合の計器が死ぬ）。
      //   軸は3つ＝全面防止／「ダメージ以外」限定／1ターンあたりの上限。
      if (a.id === 'LIFE_CRASH_PREVENTION') {
        const lcp = (a as { lifeCrashPrevention?: {
          scope: string; maxPerTurn?: number; protects: string; whileFewerLifeThanOpponent?: boolean;
        } }).lifeCrashPrevention;
        if (lcp) {
          const whose = lcp.protects === 'each_player' ? '各プレイヤーの' : 'あなたの';
          const unless = lcp.whileFewerLifeThanOpponent ? 'あなたのライフクロスが対戦相手より少ないかぎり、' : '';
          if (lcp.maxPerTurn !== undefined) {
            return `${whose}ライフクロスは1ターンに${numJa(lcp.maxPerTurn)}枚までしかクラッシュされない`;
          }
          const except = lcp.scope === 'EXCEPT_DAMAGE' ? 'ダメージ以外によっては' : '';
          return `${unless}${whose}ライフクロスは${except}クラッシュされない`;
        }
      }
      // 🆕§5.3 `O-60` 第1バッチ（2026-08-26）＝「見る／公開する」も**構造から復元する**。
      // 🔴従来はハンドラ先頭コメントの固定文（「対戦相手のライフクロスの上から1枚…」）を出していたので、
      //   **engine が実際にはどのゾーンを覗くかと無関係**だった＝相手の手札を見る効果でも「ライフクロス」と
      //   書き、原文照合の計器が緑のまま通っていた（§4.3「逆翻訳は必ず JSON のフィールドから描く」）。
      if (a.id === 'LOOK_OPP_LIFE_TOP') {
        const lz = (a as { lookZone?: { zone: string; count: number | 'ALL' } }).lookZone;
        if (lz) {
          const where = lz.zone === 'opp_hand' ? '対戦相手の手札'
            : lz.zone === 'opp_deck_top' ? '対戦相手のデッキの上'
              : lz.zone === 'self_life' ? 'あなたのライフクロスの上' : '対戦相手のライフクロスの上';
          if (lz.count === 'ALL') return `${where}をすべて見る`;
          return `${where}から${numJa(lz.count)}枚を見る`;
        }
        // ペイロード欠落＝engine は何も見ない（fail-closed）。表示でも隠さない。
        return '【※ペイロード欠落】見る対象が未指定（engine は何もしない）';
      }
      // 🆕§5.3 `O-60` 第2バッチ（2026-08-26）＝`LRIG_UNDER_CARD_OP` も**構造から復元する**
      //   （旧表示「ルリグデッキ下操作（多パターン）」は**どの操作をするかを1文字も伝えない**うえ、
      //     実際には live 17効果のうち2効果しかその操作をしていなかった）。
      if (a.id === 'LRIG_UNDER_CARD_OP') {
        const uc = (a as { underCardOp?: { op: string; filter?: Record<string, unknown> } }).underCardOp;
        if (uc) {
          if (uc.op === 'self_to_energy') return 'このシグニをエナゾーンに置く';
          if (uc.op === 'trash_all_under_self') return 'このシグニの下にあるすべてのカードをトラッシュに置く';
          const cond = uc.filter ? filterJa(uc.filter as never) : '';
          return `あなたのエナゾーンから${cond}シグニ1枚をデッキの一番上に置く`;
        }
        return '【※ペイロード欠落】操作が未指定（engine は何もしない）';
      }
      // 🆕§5.3 `O-60` 第3バッチ（2026-08-26）＝ルリグ名コピーも**構造から復元する**
      //   （どのストーリーの何レベルを、どの種別の能力ごと得るかは payload にしか無い）。
      if (a.id === 'COPY_LRIG_NAME_ABILITY') {
        const lnc = (a as { lrigNameCopy?: { story: string; level?: number; kinds: string[] } }).lrigNameCopy;
        if (lnc) {
          const lv = lnc.level !== undefined ? `レベル${numJa(lnc.level)}の` : '';
          const kinds = lnc.kinds.map(k => (k === 'AUTO' ? '【自】' : '【常】')).join('と');
          const gain = kinds ? `、そのルリグの${kinds}能力を得る` : '';
          return `このルリグはあなたのルリグトラッシュにある${lv}＜${lnc.story}＞と同じカード名としても扱う${gain}`;
        }
        return '【※ペイロード欠落】コピー元が未指定（engine は何もしない）';
      }
      // 🆕§5.3 `O-60` 第4バッチ（2026-08-26）＝配置制限も**構造から復元する**（上限・主語は payload にしかない）。
      if (a.id === 'DEPLOY_RESTRICT') {
        const dr = (a as { deployRestrict?: { kind: string; cap?: number; subject?: string; powerGte?: number; extraTurnReservation?: boolean } }).deployRestrict;
        if (dr) {
          if (dr.kind === 'count') {
            const who = dr.subject === 'both' ? 'すべてのプレイヤー' : dr.subject === 'self' ? 'あなた' : '対戦相手';
            const when = dr.extraTurnReservation ? '（追加ターンの間）' : '';
            return `${who}はシグニを${numJa(dr.cap ?? 0)}体までしか場に出せない${when}`;
          }
          if (dr.kind === 'power_gte') return `対戦相手はパワー${dr.powerGte ?? 0}以上のシグニを新たに場に出せない`;
        }
        return '【※ペイロード欠落】配置制限の形が未指定（engine は何もしない）';
      }
      // 🆕§5.3 `O-94`②（2026-09-02）＝ゾーン＋レベルの配置禁止も**構造から復元する**
      //   （旧はペイロードが無く、engine 側の `return 3` とゾーン1のハードコードが逆翻訳に1文字も出なかった）。
      if (a.id === 'OPP_ZONE_PLACEMENT_RESTRICT') {
        const zp = (a as { zonePlacementRestrict?: { zones: number[]; minLevel: number } }).zonePlacementRestrict;
        if (!zp) return '【※ペイロード欠落】ゾーン配置制限の対象ゾーン／レベルが未指定（engine は何もしない）';
        const zoneJa = zp.zones.map(z => (z === 0 ? '左' : z === 1 ? '中央' : '右')).join('と');
        return `対戦相手は${zoneJa}のシグニゾーンにレベル${numJa(zp.minLevel)}以上のシグニを新たに配置できない`;
      }
      // 🆕§5.3 `O-60` 第6バッチ（2026-08-26）＝「シグニの下に置く」も**構造から復元する**
      //   （旧表示の固定文「シグニの下にカードを置く」は**何を置くのかを1文字も伝えない**うえ、
      //     実際には【チャーム】の効果まで同じ文で描いていた）。
      if (a.id === 'PLACE_CARD_UNDER_SIGNI') {
        const pu = (a as { placeUnder?: { mode: string; craftName?: string } }).placeUnder;
        if (pu) {
          if (pu.mode === 'craft') return `クラフトの《${pu.craftName ?? '?'}》1つをこのシグニの下に置く`;
          if (pu.mode === 'self_under_other') return 'このシグニをあなたの他のシグニ1体の下に置く';
          if (pu.mode === 'charm_facedown') return '【未実装】あなたのシグニ1体を対象とし、それに手札からカード1枚を【チャーム】として裏向きで付ける';
          return '直前に処理したカードをこのシグニの下に置く';
        }
        return '【※ペイロード欠落】置くものが未指定（engine は何もしない）';
      }
      // その他の単発 STUB（engine実装/認識済み・action STUB は各1枚）の原文意味文。
      // activeCondition(TURN_OWNER/英知 等)を持つものは条件が別途前置描画されるため本体のみ。
      const miscStubMap: Record<string, string> = {
        // 🆕§5.3 `O-84`（2026-09-02）＝「条件を満たす場合、このアーツは追加で《X アイコン》を持つ」。
        //   条件は effect の `activeCondition` 側に載る（この文は「何を足すか」だけを言う）。
        //   消費＝`screens/battle/artsUseGate.ts` の `collectExtraUseTimings`。
        EXTRA_USE_TIMING: 'このカードは追加で使用タイミングを持つ',
        // 🆕§5.3 `O-203`（2026-09-02）＝参照側（`fieldCandidates`）が Type を差し替えて読む。
        TREAT_SELF_AS_RESONA: 'このシグニをレゾナとしても扱う',
        // §5.3 `O-76`／`O-77` 第2バッチ（2026-08-29）＝2つの catch-all から分離した15文型。
        //   ⚠**原文の帰結まで書く**＝保留と同時に「そうした場合」のゲートごと落としているので、
        //     ここに書かないと何が未実装なのか逆翻訳から読めない。
        DEFERRED_OPP_BLIND_PICK_MY_HAND_DISCARD:
          '【未実装】対戦相手はあなたの手札を2枚見ないで選び、あなたはそれらを捨てる',
        DEFERRED_OPP_BLIND_PICK_MY_LRIG_DECK:
          '【未実装】対戦相手は手札を公開する。対戦相手はあなたのルリグデッキからカード1枚を見ないで選び、あなたはそれを公開する',
        DEFERRED_OPP_BLIND_PICK_MY_HAND_REVEAL:
          '【未実装】対戦相手はあなたの手札を1枚見ないで選び、あなたはそれを公開する（それが＜悪魔＞かレベル3以上のシグニの場合、ターン終了時まで【ランサー】を得る）',
        DEFERRED_SELF_TRASH_TO_DECK_BOTTOM:
          '【未実装】このカードをトラッシュからデッキの一番下に置く',
        DEFERRED_EACH_PLAYER_REVEAL_HAND:
          '【未実装】各プレイヤーは手札からカードを1枚公開する（その後、公開されたシグニ2枚のレベルの差以下のシグニを場に出す）',
        DEFERRED_OPP_DECK_BOTTOM_MILL_THEN_NAME_BANISH:
          '【未実装】対戦相手はデッキの一番下のカードをトラッシュに置く（その後、そのカードと同じカード名の対戦相手のシグニ1体をバニッシュする）',
        DEFERRED_CHECK_ZONE_TO_HAND:
          '【未実装】あなたのチェックゾーンから《ガードアイコン》を持たないカードを1枚まで対象とし、それを手札に加える',
        DEFERRED_LOOK_OWN_LIFE_TOP_OPTIONAL_CRASH:
          '【未実装】あなたのライフクロスの一番上を見る。その後、それをクラッシュしてもよい',
        DEFERRED_SELF_BECOME_ACCE_OF_PLAYED_SIGNI:
          '【未実装】このシグニを、場に出たあなたのシグニの【アクセ】にしてもよい',
        DEFERRED_OPTIONAL_SELF_MILL_THEN_LEVEL_MILL:
          '【未実装】あなたのデッキの一番上のカードをトラッシュに置いてもよい（この方法でトラッシュに置かれたシグニのレベル1につき対戦相手のデッキの上から1枚トラッシュに置く）',
        DEFERRED_OPP_DECK_TOP_REVEAL_TO_BOTTOM:
          '【未実装】対戦相手はデッキの一番上を公開する。あなたはそれを対戦相手のデッキの一番下に置いてもよい',
        DEFERRED_MOVE_OPP_SIGNI_TO_OTHER_ZONE:
          '【未実装】対戦相手のシグニ1体を対象とし、それを他のシグニゾーン1つに配置する',
        DEFERRED_SWAP_OPP_LIFE_TOP_AND_DECK_TOP:
          '【未実装】対戦相手のライフクロスの一番上のカードと、対戦相手のデッキの一番上のカードを入れ替えてもよい',
        DEFERRED_PLACE_LOOKED_CARD_UNDER_SIGNI:
          '【未実装】見たカードの中から1枚を対象のシグニの下に置く（残りはデッキの一番下）',
        DEFERRED_OPP_HAND_TO_CHECK_ZONE_UNTIL_END:
          '【未実装】対戦相手は手札を1枚チェックゾーンに置く（このターン終了時、対戦相手はそれを手札に戻す）',
        // §5.3 `O-77`（2026-08-29）＝`LRIG_UNDER_CARD_OP` の catch-all から分離した3文型。
        //   ⚠**原文の帰結（「そうした場合、〜」）まで書く**＝改名と同時に did-it ゲートごと落としているので、
        //     ここに書かないと「何が実装されていないのか」が逆翻訳から読めなくなる。
        DEFERRED_TRASH_UNDER_DISTINCT_LEVELS:
          '【未実装】このシグニの下からそれぞれレベルの異なるシグニ3枚をトラッシュに置いてもよい（そうした場合、ターン終了時まで【アサシン】を得る）',
        DEFERRED_LIFE_TOP_TO_DECK_SHUFFLE:
          '【未実装】そのカードをデッキに加えてシャッフルしてもよい（そうした場合、デッキの一番上のカードをライフクロスに加える）',
        DEFERRED_OPP_TRASH_TO_DECK_THEN_REARRANGE:
          '【未実装】対戦相手のトラッシュから対象のカード1枚をデッキの一番下に置く（そうした場合、対象のシグニ1体を他のシグニゾーンに配置してもよい）',
        // §5.3 O-80 第2バッチ: POWER_MOD_PER_COUNT へ誤流入していたが、既存 engine に受け皿が無い2文型。
        DEFERRED_OPP_LRIG_LEVEL_MODIFY: '【未実装】ターン終了時まで、対象の対戦相手のルリグ1体のレベルを－1する',
        DEFERRED_SELF_SIGNI_COLOR_TO_DECLARED: '【未実装】色1つを宣言し、ターン終了時まで、このシグニは色を失い、宣言した色を得る',
        // 🆕§5.3 `O-60` 第8バッチ（2026-08-26）＝旧 `CONDITIONAL_ARTS_COST` の catch-all から分離した4文型。
        //   **どれもコストの話を1文字もしていない**ので、id を意味に合わせて honest にした（§5.3 `O-82`）。
        DEFERRED_CONDITIONAL_GROW_BY_LRIG_LEVEL: '【未実装】あなたのセンタールリグのレベルが対戦相手より低い場合、あなたのセンタールリグをグロウしてもよい',
        // 🆕§5.3 `O-83`＝実装済み（engine は予約・実グロウは BattleScreen の `executeGrow`＝コストを払う）。
        GROW_BY_EFFECT: 'あなたのセンタールリグをグロウしてもよい（グロウコストを支払う）',
        GROW_BY_EFFECT_SUPPRESS_ON_PLAY: 'この方法でグロウしたルリグの【出】能力は発動しない',
        DEFERRED_UNPARSED_CENTER_LRIG_LEVEL_CLAUSE: '【未実装】「あなたのセンタールリグのレベルが〜の場合」の条件節',
        DEFERRED_CONDITIONAL_EXTRA_USE_TIMING: '【未実装】条件を満たす場合、このアーツは追加で《アタックフェイズアイコン》を持つ（使用できるタイミングが増える）',
        DEFERRED_UNPARSED_LIFE_CLOTH_CLAUSE: '【未実装】「あなたのライフクロスが〜の場合」「あなたのライフクロスの一番上〜」の未解析節',
        DEFERRED_FIELD_COUNT_ALT_TRASH: '【未実装】あなたの場にシグニがN体ある場合、代わりにカードを〜トラッシュに置く（置換）',
        // §6.4 O-28（続き503）＝キーワード名だが engine に消費が無いもの＝明示 defer。
        DEFERRED_CONVERT_ENERGY_COLOR: '【未実装】【コンバート《色》】（エナコストを支払う際、このカードはその色として支払える）',
        DEFERRED_ATTACK_WHILE_DOWN: '【未実装】このシグニはダウン状態でもアタックできる',
        DEFERRED_LEAVE_FIELD_REPLACE_WITH_DOWN: '【未実装】このシグニが対戦相手の効果によって場を離れる場合、代わりにこの能力を失い、このシグニをダウンする',
        // 🆕§5.3 `O-66`（2026-08-25）で実装（`O-65` の明示 defer を解体）。**通常は上の payload 復元が描く**＝
        //   ここへ落ちるのは `lifeCrashPrevention` を持たない宣言だけで、そのとき消費側は宣言ごと無視する
        //   （fail-closed）。**「防いでいるように見えて実際は何もしない」ことを表示でも隠さない。**
        LIFE_CRASH_PREVENTION: '【※ペイロード欠落】ライフクロスのクラッシュ防止（消費側は無視する＝効果なし）',
        // §6.4 O-32（続き501）
        PLACE_TRASH_SIGNI_FACING_SAME_POWER: 'あなたのトラッシュから対戦相手の場にあるシグニ１体と同じパワーのシグニを１枚まで対象とし、それをその対戦相手のシグニの正面のシグニゾーンに出す',
        // ⚠engine 本体は §6.4 O-32 で撤去済み（正準形は `REPEAT`）。残るのは `WX22-016-E1` の
        //   「このアーツの効果を一度繰り返す」1件だけで、§6.4 O-29 の機構待ち＝**未実装**であることを表示する。
        REPEAT_N_TIMES: '【未実装】この効果を繰り返す（反復の正準形は REPEAT。§6.4 O-29 待ち）',
        REPEAT_EFFECT: '【未実装】この効果を繰り返す（反復の正準形は REPEAT。§6.4 O-29 待ち）',
        // §6.4 O-34（続き500）＝明示 defer 5件を解体して実装した機構。生 id を漏らさない。
        STRIP_ATTACHED_AND_UNDER: 'それに付いているすべてのカードと、下に置かれているすべてのカードをトラッシュに置く',
        USE_SEARCHED_SPELL_OR_TRASH: 'それをコストを支払わずに使用するかトラッシュに置く',
        DECK_SIGNI_LEVEL_OVERRIDE_ALL: 'このターン、あなたのデッキにあるシグニのレベルは指定値になる',
        PER_OWN_LRIG_COLOR_SCALE: 'あなたの場にいる指定色のルリグ１体につき、以下を繰り返す',
        DECLARED_ICON_HAND_DISCARD_BANISH: '対戦相手のシグニ１体を対象とし、あなたの手札を１枚選んでもよい。そうした場合、対戦相手がアイコンを１つ宣言し、あなたはその選んだカードを捨て、そのカードが宣言されたアイコンを持たない場合、それをバニッシュする',
        // §6.4 O-3（続き491）＝ターン/メインフェイズのスキップ（どちらも engine 実装済み）。
        SKIP_NEXT_TURN: '次のあなたのターンをスキップする',
        SKIP_MAIN_PHASE: 'このメインフェイズを終了する',
        // 「〜してもよい」の任意性そのものを表す制御 STUB（effectExecutor Pattern⑤）。
        // 生 id が逆翻訳に漏れると原文照合で「何が任意なのか」が読めない（続き422）。
        OPTIONAL_ACTIVATE: '次の効果を行ってもよい（行わない場合、以降は実行しない）',
        // §6.4 O-22(b)＝ミルと「繰り返してもよい」を1つに畳み込んだ STUB（`WX12-037-E2`）。
        // ペイロードが無い場合だけのフォールバック（枚数と名前を持つ通常形は下の個別分岐が描画する）。
        MILL_EACH_REPEAT_ON_NAME: '各プレイヤーは自分のデッキの上からカードをトラッシュに置く（指定名を含むカードが落ちたら繰り返してもよい）',
        // 明示 defer（§6.4・続き424）＝「この方法で他のシグニゾーンに移動したシグニをアップしてもよい」。
        // `resumeRearrangeSigni` は移動したシグニ（rearrMoved）を既に把握しているが、
        // 「どれをアップするか」を選ぶインタラクションが無いため未実装のまま明示保留。
        DEFERRED_UP_REARRANGED_MOVED_SIGNI: '【未実装】この方法で他のシグニゾーンに移動したシグニをアップしてもよい',
        // 明示 defer（§6.4・続き425）＝「各アタックフェイズ開始時、裏向きのそれと同じ場所にシグニがない場合、
        // 対戦相手は〈コスト〉を支払ってもよい。そうした場合、それを表向きにする」＝**繰り返す遅延ゲート**。
        FACEDOWN_RELEASE_BY_OPP_PAYMENT: '各アタックフェイズ開始時、裏向きのそれと同じ場所にシグニがない場合、対戦相手はコストを支払ってもよい。そうした場合、それを表向きにする',
        // 明示 defer（§6.4 O-3・続き459）＝parser の**未パース節の受け皿**。旧 id `LRIG_GROW_RESTRICT`
        // （＝原文と無関係な「グロウ制限」）に相乗りしていたため、`census:stubs` が「実装あり」と誤分類し
        // 真 no-op が計器から消えていた。日本語表示にして逆翻訳でも「何が落ちているか」が読めるようにする。
        EXILE_CRAFTS_RESET_ZONES_AND_DRAW: '各プレイヤーは自分の手札とシグニゾーンとエナゾーンとトラッシュにあるすべてのクラフトをゲームから除外し、残りをすべてデッキに加えてシャッフルし、カードを引く',
        DEFERRED_UNPARSED_THIS_TURN_OPP_CLAUSE: '【未実装】「このターン、対戦相手は…」の制限節（アタック制限・支払い条件など）',
        // 明示 defer（§6.4 O-3）＝上の受け皿から**機構ごとに切り出した**残り3件。
        // ⚠1つの受け皿に混ぜると census:stubs から「何が残っているか」が読めない（続き459 と同じ理由）。
        DEFERRED_NON_FIELD_ZONE_MOVE_IMMUNITY: '【未実装】このターンと次のターンの間、場以外のあなたの領域にあるカードは対戦相手の効果によって他の領域に移動しない',
        DEFERRED_NEXT_OPP_TURN_MAIN_PHASE_SKIP: '【未実装】次の対戦相手のターン、メインフェイズをスキップする',
        DEFERRED_DECLARED_SPELL_NAME_LOCK: '【未実装】次の対戦相手のターンの間、対戦相手は宣言されたカード名のスペルを使用できない',
        DEFERRED_GAIN_OPP_LRIG_TYPE: '【未実装】次の対戦相手のターン終了時まで、あなたのセンタールリグは対戦相手のセンタールリグのルリグタイプを追加で得る',
        DEFERRED_ATTACK_TAX_HAND_DISCARD: '【未実装】このターン、対戦相手はアタックするごとに手札を捨てないかぎりシグニでアタックできない',
        DEFERRED_OPP_DECLARED_ARTS_NAME_LOCK: '【未実装】このターン、対戦相手は自分が宣言したカード名以外のアーツを使用できない',
        DEFERRED_OPP_CHOSEN_SIGNI_ATTACK_LOCK: '【未実装】このターン、対戦相手は自分で選んだシグニで強制アタックし、それら以外ではアタックできない',
        DEFERRED_UNPARSED_NEXT_OPP_TURN_CLAUSE: '【未実装】「次の対戦相手のターン…」の制限節',
        DEFERRED_UNPARSED_THIS_AND_NEXT_TURN_CLAUSE: '【未実装】「このターンと次のターンの間…」の制限節',
        DEFERRED_EXTRA_ATTACK_PHASE: '【未実装】追加のアタックフェイズを加える',
        DEFERRED_UNTIL_NEXT_MAIN_PHASE_CLAUSE: '【未実装】「次のあなたのメインフェイズまで」のリミット変更／ダメージ無効',
        DEFERRED_NEXT_OPP_ATTACK_PHASE_START: '【未実装】次の対戦相手のアタックフェイズ開始時に解決する遅延効果',
        DEFERRED_SELF_RESTRICT_THIS_TURN: '【未実装】このターン、あなたは他のシグニを場に出せない／エナコストを支払えない',
        DEFERRED_SKIP_NEXT_TURN: '【未実装】次のあなたのターンをスキップする',
        DEFERRED_ATTACKED_SIGNI_TARGET_BY_KEY_TRASH: '【未実装】このターンにアタックしたシグニを対象とし、このキーをルリグトラッシュに置いてもよい',
        SEED_BLOOM_BOUNCE_OCCUPANT: 'そのシグニゾーンにシグニがある場合、代わりにそのシグニを手札に戻してから開花する',
        FACE_DOWN_OPP_SIGNI: '対戦相手のシグニ１体を対象とし、それを裏向きにする',
        SIGNI_FLIP_FACEDOWN: '対象としたシグニを裏向きにする',
        FLIP_FACE_DOWN_SIGNI: 'このターン終了時、この方法で裏向きにしたシグニを、同じ場所にシグニがない場合、表向きにする',
        TRASH_IF_ZONE_OCCUPIED: '同じ場所にシグニがある場合、トラッシュに置く',
        WHITE_SIGNI_ABILITY_PROTECT: 'あなたの白のシグニは対戦相手の効果によって能力を失わない',
        SIGNI_PROTECT_MOVE_EXCEPT_ENERGY: 'このシグニは対戦相手の効果によって場からエナゾーン以外の領域に移動しない',
        RESTRICT_CHARMED_SIGNI_ACTIVATED: '対戦相手は【チャーム】が付いているシグニの【起】能力を使用できない',
        RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE: 'あなたの＜宇宙＞のレゾナ１体が対戦相手の効果によって場を離れる場合、代わりにこのシグニを場からトラッシュに置いてもよい',
        REPLACE_LEAVE_FIELD_WITH_TRASH_UNDER: '下にカードが１枚以上あるこのシグニが対戦相手の効果によって場を離れる場合、代わりにこのシグニの下からすべてのカードをトラッシュに置いてもよい',
        PLAY_EFFECT_TARGET_CLASS_CHANGE: 'このシグニの【出】能力で指定された領域にある対戦相手のシグニであるカードはクラスと色を失い、＜精元＞を得る',
        GROW_FROM_LEVEL0: 'レベル０のルリグからこのルリグにグロウできる',
        GROW_COST_SUBSTITUTE_TRASH_SIGNI: '《天啓の天恵 アン=フォース》のグロウコストとして《白》を支払う際、代わりにあなたのエナゾーンから＜美巧＞のシグニ１枚をトラッシュに置いてもよい',
        DYNAMIC_LEVEL_BY_ENERGY: 'このシグニのレベルはあなたのエナゾーンにあるカード５枚につき＋１され、このシグニのパワーはこのシグニのレベル１につき＋3000される',
        COOKING_BANISH_SUBSTITUTE: 'あなたの＜調理＞のシグニ１体がバニッシュされる場合、代わりにそのシグニに付いている【アクセ】１枚をトラッシュに置いてもよい',
        BANISH_SUBSTITUTE_RISE_STACK: 'このシグニがバニッシュされる場合、代わりにこのシグニの下からカード１枚をトラッシュに置く',
        ATTACK_COUNT_BY_POWER: '各ターン、このシグニは自身のパワー10000につき一度までしかアタックできない',
        // §6.4 O-10（続き507）で defer 解体した3宣言。
        ATTACK_WHILE_DOWN: 'このシグニはダウン状態でもアタックできる',
        EFFECT_LEAVE_PREVENT_LOSE_SELF_ABILITY: 'このシグニが対戦相手の効果によって場を離れる場合、代わりにこの能力を失う',
        CHARM_POWER_MINUS_MULTIPLIER: 'それに【チャーム】が付いている場合、このターン、あなたの効果によってそれのパワーが－される場合、代わりにN倍－される',
        ARTS_COST_REDUCTION_BY_COST_THRESHOLD: 'あなたがコストの合計が３以上のアーツを使用する場合、それの使用コストは《緑×1》減る',
        ALLOW_ATTACK_WHILE_DRIVE: 'このルリグはドライブ状態でもアタックできる',
        ADJACENT_ZONE_ATTACK: 'このシグニが正面にアタックする場合、このシグニは正面に加えてその隣のシグニゾーン１つにアタックしてもよい',
        ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI: 'あなたが《白》を支払う際、代わりにあなたのエナゾーンから＜美巧＞のシグニ１枚をトラッシュに置いてもよい',
        ENERGY_SUBSTITUTE_TRASH_KEY: 'あなたがエナコストを支払う際、このキーを場からルリグトラッシュに置くことで好きな色のエナ２つを支払える',
        PLAY_SPELL_FROM_HAND: 'あなたの手札からコストの合計が２～４の青か黒のスペル１枚を、そのコストを支払って使用する',
        PLAY_SPELL_FROM_HAND_FREE: 'あなたの手札からコストの合計が１以下の赤のスペル１枚をコストを支払わずに使用してもよい',
        USE_SPELL_FROM_TRASH: '対戦相手のトラッシュからスペル１枚を対象とし、それを使用する',
        ARTS_COLORLESS_MUST_PAY_CENTER_COLOR: 'このアーツの使用コストに含まれる《無》コストは、あなたのセンタールリグが持つ色でしか支払えない',
        BLACK_RISE_PLAY_STACK_FROM_TRASH: 'あなたのトラッシュからシグニ１枚を対象とし、それをそのシグニの下に置く',
        SIGNI_GRANT_CHOSEN_ABILITY: '以下の２つから１つを選ぶ。表記されているパワーよりパワーの高いあなたの＜電機＞のシグニ１体を対象とし、ターン終了時まで、それは選んだ能力を得る。①「【常】：対戦相手の効果によってダウンしない。」②「【常】：対戦相手の効果によって手札に戻らない。」',
        BANISH_ATTACKER_IF_WEAKER_THAN_FRONT: 'そのシグニのパワーがそのシグニの正面のシグニのパワーより低い場合、アタックしたそのシグニをバニッシュする',
        CONDITIONAL_GROW_AND_KEY_DISABLE: 'あなたのセンタールリグが対戦相手のセンタールリグのレベル以下の場合、あなたのセンタールリグはグロウする。ターン終了時まで、あなたのすべてのキーは能力を失う。（グロウコストは支払う）',
        INTERNAL_ARTS_RECYCLE_EXECUTE: '追加でこのカードをルリグデッキに戻す',
        LRIG_GRANT_MILL_PER_PREVENTED_DAMAGE: 'ターン終了時まで、このルリグは「【自】：ターン終了時、あなたのデッキの上からカードを５枚トラッシュに置く。」を得る（※engine未実装＝防御成功イベント待ち）',
        // §6.3 J-5（続き381）＝live 同期で初めてシートに露出した。STUBS.md の説明が英語なので日本語語彙を与える。
        MUGEN_Q_RESET_AND_FLIP: 'あなたの手札とエナゾーンとトラッシュにあるすべてのカードをデッキに加えてシャッフルし、このルリグ以外の、あなたのルリグデッキと場にあるすべてのカードをゲームから除外し、このルリグを裏向きにする',
        // §6.4 A群（STUB 仕分け計器）で engine 実装を入れたぶんの表示語彙。
        CANNOT_DEAL_DAMAGE_TO_OPPONENT: 'このシグニは対戦相手にダメージを与えない',
        // ⚠`PLAY_MILLED_SIGNI_DELAYED_TRASH` はここに書かない＝**上の :1591 に既に専用分岐がある**
        //   （二重に置くと到達不能な死語彙になる）。
        OPP_LRIG_DECK_TO_LRIG_TRASH: '対戦相手は自分のルリグデッキからカード１枚をルリグトラッシュに置く',
        // §6.4 O-35（続き530）＝公開したカードはデッキの一番上に残る（`REVEAL_BOTH_DECK_TOPS` は一番下へ回す別文型）。
        REVEAL_EACH_PLAYER_DECK_TOP: '各プレイヤーは自分のデッキの一番上のカードを公開する',
        // ライフバースト抑制の2 STUB。従来は STUBS.md のハンドラ直前コメント（実装語彙
        // 「対戦相手の suppress_life_burst フラグをセット」）がそのまま出ていた＝原文語彙に置き換える。
        // ⚠利用カードごとに主語が違う（「この効果で」「この方法で」「このシグニによって」）ので
        //   **主語を含めない共通の言い回し**にする。
        SUPPRESS_LIFE_BURST_ON_CRASH: 'この方法でクラッシュされたカードのライフバーストは発動しない',
        SUPPRESS_LIFE_BURST_ON_CARD: 'そのカードのライフバーストは発動しない',
        ARTS_ATTACK_EMPTY_ZONE_AS_FRONT: 'このターン、あなたの＜英知＞のシグニがシグニのない対戦相手のシグニゾーンにアタックする場合、代わりにそのアタックではそのシグニゾーンの正面にあるかのように対戦相手にダメージを与える',
        MAGIC_BOX_FLIP_GRANT_ASSASSIN_DC: 'このターンのアタックフェイズの間、効果によってあなたの【マジックボックス】１つが表向きになったとき、あなたのシグニ１体を対象とし、ターン終了時まで、それは【アサシン】か【ダブルクラッシュ】を得る',
        // §6.4 O-12（続き545）＝**ハンドラを持たない宣言型**（消費は engine の別経路）。
        // `genStubsMd.mjs` はハンドラ直前コメントしか拾えないので、この 9 種はここに日本語を置く。
        // ⚠**「STUB＝未実装」ではない**（`stub-means-implemented`）＝どれも engine 側に消費地点がある。
        // 消費地点＝`effectEngine.collectEnergyColorConversions`
        CONVERT_ENERGY_COLOR: 'このカードはエナゾーンにあるかぎり、指定された色のエナとして扱う',
        // 消費地点＝`effectEngine`（パワー修正の適用側で `powerModifyProtection` を読む）
        PREVENT_POWER_MODIFY_BY_OPP: '対戦相手の効果によって、対象のシグニのパワーは増減しない',
        // 消費地点＝`effectExecutor.applyEffectLeavePayToLoseSelfAbility`
        EFFECT_LEAVE_PAY_TO_LOSE_SELF_ABILITY: 'あなたのシグニ１体が対戦相手の効果によって場を離れる場合、コストを支払ってもよい。そうした場合、代わりにターン終了時まで、このシグニはこの能力を失う',
        // 消費地点＝`screens/battle/targetDodgeFlip.ts`（対象宣言の直後・適用の前）
        FLIP_SELF_ON_TARGETED: 'このシグニが対戦相手の、能力か効果の対象になったとき、このシグニを裏向きにしてから表向きにする（その効果の対象から外れる）',
        // 消費地点＝`screens/battle/mayuEncounter.ts`
        MAYU_ENCOUNTER_FLIP_AND_GROW: '手札をすべて捨てエナゾーンのすべてのカードをトラッシュに置き、このキーを反転してセンタールリグをグロウする',
        // 消費地点＝`effectEngine.collectOppTurnArtsCostReductions`
        OPP_TURN_ARTS_COST_REDUCTION_ONCE: 'あなたが対戦相手のターンにアーツを使用する場合、そのアーツの使用コストは減り、ターン終了時まで、この能力を失う',
        // 消費地点＝`effectExecutor` の任意コスト分岐（ルリグの下1枚をルリグトラッシュへ置いて支払う）
        OPTIONAL_LRIG_UNDER_COST: 'このルリグの下からカード１枚をルリグトラッシュに置いてもよい。そうした場合、以下を行う',
        // 消費地点＝`BattleScreen`（エナ支払い・エナ数え上げの2地点）
        STRIP_OPP_ENA_MULTI_ENA: '対戦相手のエナゾーンにあるカードは【マルチエナ】を失い、対戦相手の効果を受けない',
        // 消費地点＝`execUtils`（トラッシュのカードの能力・効果耐性の判定）
        TRASH_ABILITY_LOSS_AND_IMMUNITY: '対戦相手のトラッシュとルリグトラッシュにあるカードは能力を失い、効果を受けない',
      };
      // §6.4 O-12（続き545）＝`ENERGY_COLOR_SUBSTITUTE_<色>_OR_<色>_TO_<色>` は**色を id に焼き込んだ動的 id**。
      // ⚠`genStubsMd.mjs` のハンドラ抽出は `stub.id === '[A-Z0-9_]+'` なので**日本語入りの id は拾えない**＝
      //   固定キーの `miscStubMap` にも並べられない。id から色を読んで文を組む。
      {
        const subst = a.id.match(/^ENERGY_COLOR_SUBSTITUTE_(.)(?:_OR_(.))?_TO_(.)$/);
        if (subst) {
          const from = subst[2] ? `《${subst[1]}》か《${subst[2]}》` : `《${subst[1]}》`;
          return `あなたが${from}を支払う際、代わりに《${subst[3]}》を支払ってもよい`;
        }
      }
      // §6.4 O-22(b)：枚数と名前はペイロードにあるので原文どおりに描画する（固定文にしない）。
      if (a.id === 'MILL_EACH_REPEAT_ON_NAME' && a.millEachRepeatOnName) {
        const mer = a.millEachRepeatOnName;
        return `各プレイヤーは自分のデッキの上からカードを${mer.count}枚トラッシュに置く（この方法でトラッシュに置いたカードの中にカード名に《${mer.name}》を含むカードがある場合、この効果を繰り返してもよい）`;
      }
      // §6.4 O-10（続き507）：ダウンの有無・倍率は**ペイロードにある**ので原文どおりに描画する
      //   （固定文にすると `WX25-P3-055`（ダウンなし）と `WX25-P2-TK04`（ダウンあり）が同じ文になる）。
      if (a.id === 'EFFECT_LEAVE_PREVENT_LOSE_SELF_ABILITY') {
        return `このシグニが対戦相手の効果によって場を離れる場合、代わりにこの能力を失う${a.leaveLoseSelfAbility?.thenDown ? '。そうした場合、このシグニをダウンする' : ''}`;
      }
      if (a.id === 'CHARM_POWER_MINUS_MULTIPLIER') {
        return `それに【チャーム】が付いている場合、このターン、あなたの効果によってそれのパワーが－される場合、代わりに${typeof a.value === 'number' ? a.value : 3}倍－される`;
      }
      // 🆕守る対象がペイロードにある（§5.3 `O-202`）＝宣言型 STUB（ハンドラ無し・消費は離場置換 funnel）。
      if (a.id === 'EFFECT_LEAVE_REPLACE_WITH_DOWN_SELF') {
        const vf = a.leaveDownProtector?.victimFilter;
        return `あなたの${filterJa(vf)}シグニ1体が対戦相手の効果によって場を離れる場合、代わりにアップ状態のこのシグニをダウンしてもよい`;
      }
      // 🆕枚数がペイロードにある（§5.3 `O-200`）＝固定文にすると「2枚まで」が逆翻訳から消える。
      if (a.id === 'SET_KEY_PLACE_LIMIT') {
        return `このゲームの間、あなたはキーを${typeof a.value === 'number' ? a.value : 1}枚まで場に出すことができる`;
      }
      if (miscStubMap[a.id]) return miscStubMap[a.id];
      // STUBS.md に説明があれば id ではなく説明文を表示（無ければ id にフォールバック）
      // 説明文中の実装フロー注記（例:（SELECT→INTERNAL））は原文語彙でないため除去。
      const desc = stubDescMap.get(a.id)?.replace(/（[A-Z][A-Z0-9_]*(?:→[A-Z][A-Z0-9_]*)+）/g, '').trim();
      return desc ? `[STUB:${desc}${extra}]` : `[STUB:${a.id}${extra}]`;
    }
    case 'SELF_PLAY_RESTRICT': {
      // 自身出撃制限（Opusタスク12(xlix)）。原文（rawText）をそのまま描画するのが最も忠実。
      // ⚠**ただし `rawText` だけだと機械側のペイロードが落ちていても逆翻訳が正しく見える**
      //   （§5.3 `O-74`/`O-79` の前例＝`exceptSourceCardNames` が無いまま原文が出ていた）。
      //   配置元をカード名で限定する形は**捕捉できた名前を併記**して目視で分かるようにする。
      const exceptNames = a.exceptSourceCardNames?.length
        ? `（配置元限定: ${a.exceptSourceCardNames.map(n => `《${n}》`).join('か')}の効果のみ）` : '';
      if (a.rawText) return a.rawText + exceptNames;
      if (exceptNames) return `このシグニは新たに場に出すことができない${exceptNames}`;
      if (a.never) return 'このシグニは新たに場に出すことができない';
      if (a.condition) return `${condJa(a.condition)}場合にしかこのシグニは新たに場に出すことができない`;
      return 'このシグニは新たに場に出すことができない';
    }
    default: return `[アクション:${a.type}]`;
  }
}

const timingJa: Record<string, string> = {
  ON_PLAY: 'このシグニが場に出たとき', ON_ATTACK_SIGNI: 'このシグニがアタックしたとき',
  ON_ATTACK_LRIG: 'このルリグがアタックしたとき',
  ON_ACCE: 'このシグニに【アクセ】が付いたとき',
  ON_ACCE_TO_TRASH: '【アクセ】がトラッシュに置かれたとき',
  ON_MAGIC_BOX_FLIPPED: '【マジックボックス】が表向きになったとき',
  ON_COIN_GAINED: '《コインアイコン》を得たとき',
  ON_ABILITY_ACTIVATED: '能力が発動したとき',
  ON_ATTACK_PHASE_END: 'あなたのアタックフェイズ終了時',
  ON_ATTACK_END: 'このシグニがアタックしたアタック終了時',
  ON_SOUL_ATTACHED: 'このシグニに【ソウル】が付いたとき',
  ON_CARD_ATTACHED: 'このシグニにカードが付いたとき',
  ON_SELF_REVEAL_FROM_HAND: 'あなたが自分の効果によって手札からカードを公開したとき',
  ON_BANISH: 'このシグニがバニッシュされたとき', ON_TRASH: 'このカードがトラッシュに置かれたとき',
  ON_SIGNI_BANISH_OPPONENT: 'このシグニがバトルによって対戦相手のシグニをバニッシュしたとき',
  ON_SIGNI_BANISH_BATTLE: 'このシグニがバトルで対戦相手のシグニをバニッシュしたとき',
  ON_TURN_START: 'ターン開始時', ON_TURN_END: 'ターン終了時',
  ON_ATTACK_PHASE_START: 'あなたのアタックフェイズ開始時', ON_LIFE_CRASHED: 'あなたのライフがクラッシュされたとき',
  ON_SIGNI_CRASHED_LIFE_TOTAL: 'このシグニが１ターンにライフクロスを合計１枚以上クラッシュしたとき',
  ON_HAND_OR_ENERGY_LOST_BY_OPP: '対戦相手の効果１つによって、あなたの手札が１枚以上捨てられるかあなたのエナゾーンからカードが１枚以上トラッシュに置かれたとき',
  ON_GROW_PHASE_START: 'あなたのグロウフェイズ開始時',
  ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT: 'あなたが対戦相手のシグニのアタックを効果によって無効にしたとき',
  ON_MAIN_PHASE_START: 'あなたのメインフェイズ開始時',
  ON_OPP_LIFE_CRASHED: '対戦相手のライフがクラッシュされたとき', ON_SIGNI_BATTLE: 'このシグニがバトルしたとき',
  ON_SIGNI_DAMAGE: 'このシグニが相手にダメージを与えたとき', ON_LEAVE_FIELD: 'このカードが場を離れたとき',
  ON_HEAVEN: 'ヘブンヘブン（すべてのクロスシグニがダウン状態でアタックしたとき）',
  ON_SPELL_USE: 'あなたがスペルを使用したとき', ON_GUARD: 'あなたが【ガード】したとき',
  ON_ARTS_USE: 'あなたがアーツを使用したとき',
  ON_RISE: 'このシグニがライズされたとき',
  MAIN: '（メイン起動）', ATTACK: '（アタックフェイズ起動）', ATTACK_ARTS: '（アタックフェイズ起動）', ON_LIFE_BURST: '【ライフバースト】',
  ON_DRAW: 'あなたがカードを引いたとき',
  ON_ENERGY_CHARGE: 'あなたのエナゾーンにカード1枚が置かれたとき', ON_POWER_THRESHOLD: 'このシグニのパワーが閾値以上になったとき',
  SPELL_CUTIN: 'スペルカットイン', ON_OPP_SIGNI_ATTACK_DIRECT: '対戦相手のシグニが正面が空の状態でアタックしたとき',
  ON_OPP_SIGNI_ATTACK: '（対戦相手のシグニ１体がアタックしたときにしか使用できない）',
  ON_FRONT_SIGNI_ATTACK: 'このシグニの正面のシグニがアタックしたとき',
  ON_ZONE_MOVED: 'このシグニが効果によって他のシグニゾーンに移動したとき',
  ON_SIGNI_BECOMES_DRIVE: 'このシグニがドライブ状態になったとき',
  ON_SIGNI_DOWN: 'あなたのシグニ１体がダウン状態になったとき',
  ON_SIGNI_BECOMES_UP: 'あなたのシグニ１体がアップ状態になったとき',
  ON_BECOME_BEAT: 'このカードが【ビート】になったとき',
  ON_HAND_DISCARDED: 'ガードステップ以外であなたが手札を捨てたとき',
  ON_DISCARDED_AS_COST: 'このカードがシグニ能力のコストとして手札から捨てられたとき',
  ON_EXCEED_COST: 'このカードがエクシードのコストとしてルリグトラッシュに置かれたとき',
  ON_PLACED_UNDER_SIGNI: 'このカードがシグニの下に置かれたとき',
  ON_OPP_VIRUS_PLACED: '対戦相手の場に【ウィルス】が置かれたとき',
  ON_OPP_VIRUS_REMOVED: '対戦相手の場から【ウィルス】が取り除かれたとき',
  ON_OPP_VIRUS_CHANGED: '対戦相手の場に【ウィルス】が置かれるか取り除かれたとき',
  ON_ACCE_ATTACH: 'あなたのシグニ１体に【アクセ】が付いたとき',
  ON_CARD_MILLED_FROM_DECK: 'あなたか対戦相手のデッキからカードが1枚以上トラッシュに置かれたとき',
  ON_CARD_MOVED_TO_DECK: 'あなたか対戦相手のカードが効果によって1枚以上デッキに移動したとき',
  ON_HAND_ADDED: '効果によってカードがあなたの手札に移動したとき',
  ON_TRASH_CARD_ADDED: '効果によってあなたのトラッシュにカードが置かれたとき',
  ON_ENERGY_TO_FIELD: 'あなたのエナゾーンからシグニが場に出たとき',
  ON_LIFE_CLOTH_ADDED: 'あなたのライフクロスにカード１枚が加えられたとき',
  ON_OPP_ENERGY_ADDED: '対戦相手のエナゾーンにカード１枚が置かれたとき',
  ON_SIGNI_POWER_ZERO_OR_LESS: 'シグニのパワーが0以下になったとき',
  ON_SIGNI_FROZEN: 'シグニが凍結状態になったとき',
  ON_TARGETED: 'このシグニが対戦相手の能力か効果の対象になったとき',
  ON_DECK_SHUFFLED: 'あなたのデッキがシャッフルされたとき',
  ON_KEYWORD_GAINED: 'あなたの他のシグニが【アサシン】か【ランサー】か【ダブルクラッシュ】を得たとき',
  ON_LRIG_UNDER_MOVED: 'あなたのルリグの下からカード１枚が移動したとき',
  ON_LRIG_ATTACK_STEP_START: 'あなたのルリグアタックステップ開始時',
  ON_OPP_ARTS_USE: 'あなたのシグニが対戦相手のアーツの効果を受けたとき',
  ON_LRIG_GROW: 'あなたのルリグがグロウしたとき',
  ON_COIN_PAID: 'あなたが《コイン》を１枚以上支払ったとき',
  ON_MATERIAL_USED: 'このシグニに《改造素材》が使用されたとき',
  ON_SIGNI_BANISH_OPPONENT_BY_EFFECT: 'このシグニが効果によって対戦相手のシグニ１体をバニッシュしたとき',
  ON_ALLY_PLAY_OR_OPP_HAND_DISCARD: 'あなたの他のシグニ１体が場に出るか、あなたの効果によって対戦相手が手札を１枚捨てたとき',
  ON_BLOOM: 'このシグニが開花したとき',
  ON_REVEALED_FROM_HAND: 'このカードがあなたの効果によって手札から公開されたとき',
  ON_ENERGY_FROM_TRASH: 'このカードがトラッシュからエナゾーンに置かれたとき',
  ON_BLOOD_CRYSTAL_ARMOR: 'あなたのシグニが血晶武装状態になったとき',
  // TRAP_ICON は effectType 側で表示される。AUTO の ON_TRAP_ACTIVATE は通常のトリガー文を描画する。
  ON_TRAP_ACTIVATE: 'あなたの《トラップアイコン》が発動したとき',
  ON_TRAP_SET: 'あなたの【トラップ】が設置されたとき',
  ON_SONG_ACTIVATE: '',
};

// engine 未配線のトリガー（JSON/逆翻訳は揃っているがゲームでは発火しない）。
// 逆翻訳末尾に【※engine未配線】を付与し、偽陰性（健全に見えて未実装）を防ぐ。配線したら除去する。docs/TODO.md に記録。
// C1（2026-06-29）で配線済＝除外：ON_TARGETED（handleEffectInteraction→collectTargetedTriggers）・ON_LRIG_GROW（executeGrow/CPU→collectLrigGrowTriggers・センターグロウのみ）・ON_COIN_PAID（グロウ/起動/キー/出/アーツの各支払サイト→collectCoinPaidTriggers・スペルベットは未配線）・ON_LRIG_ATTACK_STEP_START（doPhaseAdvance ATTACK_SIGNI→ATTACK_LRIG→collectTurnTriggers・人間ターンのみ）。
// ON_KEYWORD_GAINED は WXDi-P04-035 用に COPY_ABILITY 実装＋配線済（2026-06-30）＝engineUnwiredTimings から除外（残り0）。
const engineUnwiredTimings = new Set<string>([]);

function effJa(e: Eff): string {
  // crossOnly（【クロス常】【クロス出】【クロス起】【クロス自】）: マーカーに「クロス」を冠する。
  // クロス条件文（「《X》の左」等）は effects JSON に無いため card の EffectText から補う。
  const crossPrefix = e.crossOnly ? 'クロス' : '';
  const kizunaPrefix = e.kizunaIcon ? '絆' : ''; // 【絆常】【絆自】【絆起】【絆出】
  const mk = `${kizunaPrefix}${crossPrefix}`;
  const specialType: Record<string, string> = { TRAP_ICON: '【トラップアイコン】', SONG_ICON: '【歌のカケラ】' };
  const typeMark = e.effectType === 'AUTO' ? `【${mk}自】` : e.effectType === 'CONTINUOUS' ? `【${mk}常】`
    : e.effectType === 'ACTIVATED' ? `【${mk}起】` : e.effectType === 'LIFE_BURST' ? '【LB】'
    : (specialType[e.effectType] ?? `【${e.effectType}】`);
  const crossCondText = e.crossOnly ? (currentCardText.match(/《クロスアイコン》([^【]+)/)?.[1]?.trim() ?? '') : '';
  const crossCond = crossCondText ? `${crossCondText}に置かれているかぎり ` : '';
  // triggerScope（any_ally/any_opp/any）+ triggerFilter を主語に反映（「このシグニが」→「あなたの赤のシグニが」等）
  const subjFilter = e.triggerFilter ? filterJa(e.triggerFilter) : '';
  const scopeSubj = e.triggerScope === 'any_ally' ? `あなたの${subjFilter}`
    : e.triggerScope === 'any_opp' ? `対戦相手の${subjFilter}`
    : e.triggerScope === 'any' ? `いずれかの${subjFilter}`
    : null;
  // トリガー主語の名詞（triggerFilter.cardType がレゾナ等ならその名詞。既定はシグニ。G148）
  const scopeNoun = e.triggerFilter?.cardType && !Array.isArray(e.triggerFilter.cardType) ? e.triggerFilter.cardType : 'シグニ';
  const trig = (e.timing || []).map((t: string) => {
    let s = timingJa[t] ?? t;
    // 🆕`handActivated`＝**手札にあるこのカードから起動する【起】**（`WX18-036-E3` ほか。
    //   2026-08-30 §5.2 Sheet2 バッチ6）。engine/UI は区別しているのに逆翻訳が描いておらず、
    //   「場のシグニの【起】」と同じ文になっていた＝原文照合で使用場所の差が見えない偽陰性。
    if (e.handActivated && (t === 'MAIN' || t === 'ATTACK' || t === 'ATTACK_ARTS' || t === 'SPELL_CUTIN')) {
      s = `${s}（手札から起動）`;
    }
    if (t === 'ON_OPP_LIFE_CRASHED' && e.triggerScope === 'self' && e.triggerFilter?.thisCardOnly) {
      const noun = /このルリグが[^。]{0,100}ライフ(?:クロス)?/.test(currentEffectText) ? 'ルリグ' : 'シグニ';
      s = `この${noun}が対戦相手のライフクロス1枚をクラッシュしたとき`;
    }
    if (t === 'ON_OPP_LIFE_CRASHED' && e.triggerScope === 'any_ally') {
      const colors = e.triggerFilter?.color === undefined ? ''
        : `${([] as unknown[]).concat(e.triggerFilter.color as unknown).join('か')}の`;
      const stories = e.triggerFilter?.story === undefined ? ''
        : `${([] as unknown[]).concat(e.triggerFilter.story as unknown).map(x => `＜${String(x)}＞`).join('か')}の`;
      s = `あなたの${e.triggerFilter?.excludeSelf ? '他の' : ''}${colors}${stories}シグニが対戦相手のライフクロス1枚をクラッシュしたとき`;
    }
    // 🆕**2026-08-31 §5.2 再照合**＝`triggerCondition.crashedByKeywords`（【ランサー】によるクラッシュ限定）を
    //   逆翻訳が描いていなかった。engine は `triggerCollect.ts:59` で **fail-closed** に消費しており
    //   golden も張ってあるのに、原文照合では「限定条件が無い」ようにしか見えず、
    //   意味照合の finding（`WX19-071-E1`）が**直っているのに OPEN のまま**残っていた。
    if (t === 'ON_OPP_LIFE_CRASHED' && Array.isArray(e.triggerCondition?.crashedByKeywords)) {
      const kwJa = (e.triggerCondition!.crashedByKeywords as string[]).map(k => `【${k}】`).join('か');
      s = s.includes('が対戦相手のライフクロス')
        ? s.replace('が対戦相手のライフクロス', `が${kwJa}によって対戦相手のライフクロス`)
        : s.replace('クラッシュ', `${kwJa}によってクラッシュ`);
    }
    if (t === 'ON_ATTACK_PHASE_START' && e.triggerScope === 'any') s = '各アタックフェイズ開始時';
    if (e.effectType === 'TRAP_ICON' && t === 'ON_TRAP_ACTIVATE') s = '';
    if (scopeSubj !== null && s.startsWith('このシグニ')) s = `${scopeSubj}${scopeNoun}${s.slice('このシグニ'.length)}`;
    // ON_TRASH/ON_LEAVE_FIELD 等「このカード」始まりも scope 主語に置換（any_opp→「対戦相手のシグニが…」）
    else if (scopeSubj !== null && s.startsWith('このカード')) s = `${scopeSubj}${scopeNoun}${s.slice('このカード'.length)}`;
    // ON_ATTACK_LRIG 等「このルリグ」始まりも scope 主語に置換（続き218j）。
    // ⚠名詞は scopeNoun（既定「シグニ」）ではなく **「ルリグ」固定**＝主語がルリグである timing のため。
    // これが無いと any_opp なのに「**この**ルリグがアタックしたとき」と描かれ、原文照合時に
    // 「自分のアタックで発火する」と誤読させる（実際は相手のルリグアタックで発火）。
    else if (scopeSubj !== null && s.startsWith('このルリグ')) s = `${scopeSubj}ルリグ${s.slice('このルリグ'.length)}`;
    // ON_LEAVE_FIELD の leftToZone:'hand'（「シグニ１体が場から手札に戻ったとき」WXK02-041）
    // ⚠従来は主語を決め打ちしており、**`any_ally`（原文「あなたの」）でも「シグニ１体が」と描いて
    //   限定を落としていた**（`WXK02-001-E1`／`WDK05-T11-E1`）＝原文照合でスコープが広く見える計器の穴。
    //   `any_opp` は下の跨サイドブロックが上書きするのでここでは扱わない。
    if (t === 'ON_LEAVE_FIELD' && e.triggerCondition?.leftToZone === 'hand') {
      s = `${e.triggerScope === 'any_ally' ? 'あなたの' : ''}シグニ１体が場から手札に戻ったとき`;
    }
    // leftToZone が配列（「手札に戻るかトラッシュに置かれたとき」WXDi-CP02-068-E1）＝行き先 OR を落とさない
    if (t === 'ON_LEAVE_FIELD' && Array.isArray(e.triggerCondition?.leftToZone)) {
      const zonesJa = (e.triggerCondition!.leftToZone as string[])
        .map(z => (z === 'hand' ? '手札に戻る' : 'トラッシュに置かれた')).join('か');
      s = `対戦相手のシグニ１体が${zonesJa}とき`;
    }
    // ON_LEAVE_FIELD 跨サイド any_opp（「あなたの効果によって対戦相手のシグニが場から手札に移動したとき」WXK11-049/WXDi-CP01-027）
    if (t === 'ON_LEAVE_FIELD' && e.triggerScope === 'any_opp' && e.triggerCondition?.byOwnEffect) {
      const ltzArr = e.triggerCondition?.leftToZone;
      const toJa = Array.isArray(ltzArr)
        ? ltzArr.map((z: string) => (z === 'hand' ? '手札に戻る' : 'トラッシュに置かれた')).join('か')
        : (ltzArr === 'hand' ? '場から手札に移動した' : '場を離れた');
      const turnJa = e.triggerCondition?.turnOwner === 'self' ? 'あなたのターンの間、' : '';
      s = `${turnJa}あなたの効果によって対戦相手のシグニ１体が${toJa}とき`;
    }
    // ON_LEAVE_FIELD any_ally＋byOpponentEffect（「あなたの＜X＞のシグニが対戦相手の効果によって場を離れたとき」WX19-026）
    if (t === 'ON_LEAVE_FIELD' && e.triggerScope === 'any_ally' && e.triggerCondition?.byOpponentEffect) {
      const fJa = e.triggerFilter ? filterJa(e.triggerFilter) : '';
      s = `あなたの${fJa}シグニ１体が対戦相手の効果によって場を離れたとき`;
    }
    // ON_LEAVE_FIELD self スコープ＋leftStateFilter（離脱直前の状態限定・「このシグニがアクセされていた場合」WX20-071）。
    //   engine は離脱直前 state で評価する（THIS_CARD_IS_ACCED は現在場を見るため離脱後 no-op）。逆翻訳では
    //   離脱トリガーの後ろに条件句を付す（従来 leftStateFilter は未描画＝原文照合で条件が欠けて見えていた）。
    if (t === 'ON_LEAVE_FIELD' && (e.triggerScope ?? 'self') === 'self' && e.triggerCondition?.leftStateFilter) {
      const lsf = e.triggerCondition.leftStateFilter as { hasAcce?: boolean; isFrozen?: boolean };
      const condJa = lsf.hasAcce ? '、このシグニがアクセされていた場合'
        : lsf.isFrozen ? '、このシグニが凍結状態だった場合' : '';
      if (condJa) s = `${s}${condJa}`;
    }
    // ON_LEAVE_FIELD any_ally ＋ leftStateFilter（状態修飾つき主語・2026-08-28 Sheet1 バッチ）。
    //   「あなたの**クロス状態の**シグニ１体が場を離れたとき」（`WX08-025-E2`）＝状態語を主語へ戻す。
    //   ⚠描かないと逆翻訳が「あなたのシグニが場を離れたとき」になり、**原文より広く見える**。
    if (t === 'ON_LEAVE_FIELD' && e.triggerScope === 'any_ally' && e.triggerCondition?.leftStateFilter
      && !e.triggerCondition?.byOpponentEffect) {
      const lsfA = e.triggerCondition.leftStateFilter as
        { crossState?: boolean; isFrozen?: boolean; isDown?: boolean; isUp?: boolean; hasAcce?: boolean };
      const stJa = lsfA.crossState ? 'クロス状態の' : lsfA.isFrozen ? '凍結状態の'
        : lsfA.isDown ? 'ダウン状態の' : lsfA.isUp ? 'アップ状態の' : lsfA.hasAcce ? 'アクセされている' : '';
      if (stJa) {
        const fJaA = e.triggerFilter ? filterJa(e.triggerFilter) : '';
        s = `あなたの${stJa}${fJaA}シグニ１体が場を離れたとき`;
      }
    }
    // ON_HEAVEN の監視スコープ（2026-08-28 Sheet1 バッチ）＝「あなたの〔色の〕シグニが《ヘブン》したとき」。
    //   ⚠これが無いと `〔範囲:any_ally〕` という**生の英語ラベル**がシートに出るだけで、
    //     「誰がヘブンしたら発火するのか」が原文照合できない（`WX08-025-E3` の「赤の」も落ちる）。
    if (t === 'ON_HEAVEN' && (e.triggerScope === 'any_ally' || e.triggerScope === 'any')) {
      const fJaH = e.triggerFilter ? filterJa(e.triggerFilter) : '';
      const whoH = e.triggerScope === 'any' ? '' : 'あなたの';
      s = `${whoH}${fJaH}シグニが《ヘブン》したとき（ヘブンヘブン）`;
    }
    // ON_LEAVE_FIELD の「（あなた/対戦相手の）アタックフェイズの間、」前置き（WX21-004/WX21-027/WX24-P2-077/WX24-P4-070）。
    //   ⚠従来 ON_LEAVE_FIELD だけこの軸を描いておらず、engine は duringAttackPhase/turnOwner を3ループ全部で
    //     評価しているのに**逆翻訳シート上は無制限に発火するように見えていた**（原文照合で限定が欠けて見える）。
    //   turnOwner はこの前置きが「あなたの/対戦相手の」で言い尽くすので《自分ターン》マーカーは下で抑止する。
    if (t === 'ON_LEAVE_FIELD' && e.triggerCondition?.duringAttackPhase) {
      const whoJa = e.triggerCondition.turnOwner === 'self' ? 'あなたの'
        : e.triggerCondition.turnOwner === 'opponent' ? '対戦相手の' : '';
      s = `${whoJa}アタックフェイズの間、${s}`;
    }
    // ON_BANISH の「（対戦相手の）アタックフェイズの間、」前置き（WX18-002/WXEX1-18）。
    // scopeSubj 置換済みの主語（「あなたの遊具シグニがバニッシュされたとき」）に前置きを冠す。
    if (t === 'ON_BANISH' && e.triggerCondition?.duringAttackPhase) {
      const pref = e.triggerCondition?.turnOwner === 'opponent' ? '対戦相手のアタックフェイズの間、'
        : e.triggerCondition?.turnOwner === 'self' ? 'あなたのアタックフェイズの間、'
        : 'アタックフェイズの間、';
      s = `${pref}${s}`;
    }
    if (t === 'ON_BANISH' && e.triggerCondition?.duringMainPhase) {
      const pref = e.triggerCondition?.turnOwner === 'self' ? 'あなたのメインフェイズの間、' : 'メインフェイズの間、';
      s = `${pref}${s}`;
    }
    if (t === 'ON_BANISH' && e.triggerCondition?.banishedHadCharm) {
      s = `【チャーム】が付いている${s}`;
    }
    // 🆕§5.3 `O-62`：アクセ限定を描く（描かないと原文照合で「限定が無い」ように見える）。
    if (t === 'ON_BANISH' && e.triggerCondition?.banishedHadAcce) {
      s = `アクセされている${s}`;
    }
    if (t === 'ON_BANISH' && e.triggerCondition?.banishedFrontOfSelf) {
      s = 'このシグニの正面のシグニ1体がバニッシュされたとき';
    }
    if (t === 'ON_BANISH' && e.triggerCondition?.banishedLevelLtWatcher) {
      s = 'このシグニより低いレベルを持つあなたのシグニ1体がバニッシュされたとき';
    }
    if (t === 'ON_BANISH' && e.triggerCondition?.banishedFromCenterZone) {
      s = `${e.triggerCondition?.duringMainPhase ? 'あなたのメインフェイズの間、' : ''}対戦相手の中央のシグニゾーンにあるシグニがバニッシュされたとき`;
    }
    if (t === 'ON_BANISH' && e.triggerCondition?.banishedWasUp) {
      s = 'アップ状態のこのシグニがバニッシュされたとき';
    }
    if (t === 'ON_BANISH' && e.triggerCondition?.notWhileAttacking) {
      s = `${s}、このシグニがアタック中でない場合`;
    }
    // 🆕「バトル以外によって」（2026-08-31 §5.2）＝限定を逆翻訳に必ず出す（出さないと計器から消える）。
    if (t === 'ON_BANISH' && e.triggerCondition?.notByBattle) {
      s = `バトル以外によって${s}`;
    }
    if (t === 'ON_BANISH' && e.triggerCondition?.banishedSourceStory) {
      s = `あなたの＜${e.triggerCondition.banishedSourceStory}＞のシグニの効果によって${s}`;
    } else if (t === 'ON_BANISH' && e.triggerCondition?.banishedByOwnEffect) {
      s = `あなたの効果によって${s}`;
    } else if (t === 'ON_BANISH' && e.triggerCondition?.banishedNotByOwnEffect) {
      // 🆕§5.3 `O-62`：**否定形**。肯定形と同じ場所に描かないと逆翻訳から限定が消える。
      s = `あなたの効果以外によって${s}`;
    }
    if (t === 'ON_TARGETED' && e.triggerCondition?.targetedOrigins?.length) {
      const origins = e.triggerCondition.targetedOrigins;
      const originJa = origins.length === 2
          && origins.some((o: any) => o.sourceType === 'アシストルリグ')
          && origins.some((o: any) => o.effectType === 'LIFE_BURST')
        ? 'アシストルリグかライフバーストの能力か効果'
        : origins.map((o: any) => {
          if (o.sourceType === 'シグニ' && o.abilityTiming === 'ON_PLAY') return 'シグニの、【出】能力か【出】能力の効果';
          if (o.sourceType) return `${o.sourceType}の、能力か効果`;
          if (o.effectType === 'LIFE_BURST') return 'ライフバーストの能力か効果';
          return '能力か効果';
        }).join('か');
      const subj = (e.triggerScope ?? 'self') === 'self'
        ? 'このシグニ'
        : `あなたの${e.triggerFilter ? filterJa(e.triggerFilter) : ''}シグニ１体`;
      s = `${subj}が対戦相手の${originJa}の対象になったとき`;
    }
    // ON_SIGNI_DOWN / ON_SIGNI_BECOMES_UP（タスク16[C]機構①）: scope・filter・byEffect・フェイズ限定を描画。
    if (t === 'ON_SIGNI_DOWN' || t === 'ON_SIGNI_BECOMES_UP') {
      const duTc = e.triggerCondition;
      const stateJa = t === 'ON_SIGNI_DOWN' ? 'ダウン' : 'アップ';
      if (e.triggerFilter?.cardName) {
        s = `あなたの《${e.triggerFilter.cardName}》がダウンしたとき`;
      } else {
        const phaseJa = duTc?.duringAttackPhase ? 'アタックフェイズの間、' : '';
        const byEffJa = duTc?.byEffect ? '効果によって' : '';
        const sc = e.triggerScope ?? 'any_ally';
        const subjJa = sc === 'self' ? 'このシグニ'
          : sc === 'any' ? 'シグニ１体'
          : `あなたの${e.triggerFilter?.excludeSelf ? '他の' : ''}${e.triggerFilter?.story ? `＜${e.triggerFilter.story}＞の` : ''}${duTc?.upIncludesLrig ? 'センタールリグか' : ''}シグニ１体`;
        s = `${phaseJa}${subjJa}が${byEffJa}${stateJa}状態になったとき`;
      }
    }
    if (t === 'ON_ENERGY_CHARGE' && e.triggerCondition?.movedSelf) {
      const tc = e.triggerCondition;
      const zoneJa: Record<string, string> = { hand: '手札', deck: 'デッキ', field: '場' };
      const zones = (tc.fromZones ?? []).map((z: string) => zoneJa[z] ?? z).join('か');
      const phase = tc.duringAttackPhase ? 'アタックフェイズの間、' : '';
      const cause = tc.byLrigOrSigniEffect ? 'ルリグかシグニの効果によって' : '';
      s = `${phase}このカードが${cause}${zones}からエナゾーンに置かれたとき`;
    }
    if (t === 'ON_ENERGY_CHARGE' && !e.triggerCondition?.movedSelf
        && (e.triggerCondition?.byOwnEffect || e.triggerCondition?.byOpponentEffect || e.triggerCondition?.byEffect)) {
      const cause = e.triggerCondition.byOwnEffect ? 'あなたの効果によって'
        : e.triggerCondition.byOpponentEffect ? '対戦相手の効果によって' : '効果によって';
      s = `${cause}カード１枚があなたのエナゾーンに置かれたとき`;
    }
    // ON_TRASH 自己discard反応（「このカードが捨てられたとき」系・fromZones:['hand']＋原因限定）。
    // ⚠byOwnEffect は「場から」トラッシュ（fromZones:['field']・WX18-081 等6枚）でも使うため、
    //   field 起点は自己discard扱いにせず下の「あなたの効果によって場から」ブロックへ渡す。
    const isFieldOriginTrash = e.triggerCondition?.fromZones?.length === 1 && e.triggerCondition.fromZones[0] === 'field';
    if (t === 'ON_TRASH' && ((e.triggerCondition?.byOwnEffect && !isFieldOriginTrash) || e.triggerCondition?.trashSourceStory
        || (e.triggerCondition?.byOpponentEffect && e.triggerCondition?.fromZones?.length === 1 && e.triggerCondition.fromZones[0] === 'hand'))) {
      const sdTc = e.triggerCondition;
      const causeJa = sdTc?.trashSourceStory ? `あなたの＜${sdTc.trashSourceStory}＞のシグニの効果によって`
        : sdTc?.byOpponentEffect ? '対戦相手の効果によって'
        : sdTc?.byOwnEffect ? 'あなたの効果によって' : '';
      const turnJa = sdTc?.turnOwner === 'self' ? 'あなたのターンの間、' : sdTc?.turnOwner === 'opponent' ? '対戦相手のターンの間、' : '';
      const deckOnly = sdTc?.fromZones?.length === 1 && sdTc.fromZones[0] === 'deck';
      const phaseJa = sdTc?.duringMainPhase ? 'あなたのメインフェイズの間、' : turnJa;
      const handOnly = sdTc?.fromZones?.length === 1 && sdTc.fromZones[0] === 'hand';
      s = deckOnly
        ? `${phaseJa}このカードが${causeJa}デッキからトラッシュに置かれたとき`
        : handOnly
          ? `${phaseJa}このカードが${causeJa}手札からトラッシュに置かれたとき`
          : `${phaseJa}${causeJa}このカードが捨てられたとき`;
    }
    // ON_DRAW の限定軸（「アタックフェイズの間に」「あなたのターンの間、あなたの効果によって」WX11-030/WXK10-040）
    if (t === 'ON_DRAW' && (e.triggerScope ?? 'self') === 'self'
        && (e.triggerCondition?.duringAttackPhase || e.triggerCondition?.drawByDrawerOwnEffect)) {
      const drTc = e.triggerCondition;
      const turnJa = drTc?.turnOwner === 'self' ? 'あなたのターンの間、' : '';
      const phaseJa = drTc?.duringAttackPhase ? 'アタックフェイズの間に' : '';
      const ownJa = drTc?.drawByDrawerOwnEffect ? 'あなたの効果によって' : '';
      s = `${turnJa}${phaseJa}${ownJa}あなたがカードを１枚以上引いたとき`;
    }
    // ON_MAIN_PHASE_START の triggerScope:any_opp（「対戦相手のメインフェイズ開始時」WXDi-P00-034）
    if (t === 'ON_MAIN_PHASE_START' && e.triggerScope === 'any_opp') s = '対戦相手のメインフェイズ開始時';
    if (t === 'ON_GUARD' && e.triggerCondition?.lrigAttackGuarded) s = 'このルリグのアタックが【ガード】されたとき';
    // 🆕2026-08-31 続き749＝「そのアタック終了時、ダメージを与えていなかった場合」（`WX24-P3-055-E2`）。
    if (t === 'ON_GUARD' && e.triggerCondition?.lrigAttackNoDamage) s = 'ルリグ１体がアタックし、そのアタックがダメージを与えなかったとき';
    // ON_TURN_END/ON_TURN_START の triggerScope:any_opp（「対戦相手のターン終了/開始時」WX11-032/WX20-073 等）
    if ((t === 'ON_TURN_END' || t === 'ON_TURN_START') && e.triggerScope === 'any_opp') s = `対戦相手の${s}`;
    // ON_LRIG_GROW の主語（triggerScope/excludeSelf）を反映（any_opp＝対戦相手／excludeSelf＝他の）
    if (t === 'ON_LRIG_GROW') {
      s = e.triggerScope === 'any_opp' ? '対戦相手のルリグがグロウしたとき'
        : `あなたの${e.triggerFilter?.excludeSelf ? '他の' : ''}ルリグがグロウしたとき`;
    }
    // ON_MATERIAL_USED の主語を反映（materialUsedByPlayer＝あなたが使用／any_ally＝他のシグニに／既定＝このシグニに）
    if (t === 'ON_MATERIAL_USED') {
      s = e.triggerCondition?.materialUsedByPlayer ? 'あなたが《改造素材》を使用したとき'
        : e.triggerScope === 'any_ally' ? `あなたの${e.triggerFilter?.excludeSelf ? '他の' : ''}シグニ１体に《改造素材》が使用されたとき`
        : 'このシグニに《改造素材》が使用されたとき';
    }
    // ON_ALLY_PLAY_OR_OPP_HAND_DISCARD（複合ORトリガー WXDi-P11-064）：triggerFilter（他の＜天使＞の）を主語に反映
    if (t === 'ON_ALLY_PLAY_OR_OPP_HAND_DISCARD') {
      // 🆕**2026-08-31 続き752**＝「あなたのターンの間」を必ず書く。
      //   🔴この限定は **JSON ではなく collector 側**（`triggerCollect.ts:4984` の
      //   `if (controllerId !== ctx.activeUserId) return`）で強制されているので、
      //   逆翻訳が黙っていると**原文照合では「限定が落ちている」ようにしか見えない**
      //   （意味照合の finding `WXDi-P11-064-E1` が、直っているのに OPEN のまま残っていた）。
      //   §5.2 の `crashedByKeywords`（続き750）と同型の恒久偽陰性。
      s = `あなたのターンの間、あなたの${e.triggerFilter ? filterJa(e.triggerFilter) : ''}シグニ１体が場に出るか、あなたの効果によって対戦相手が手札を１枚捨てたとき`;
    }
    // ON_SPELL_USE は triggerFilter.color を使用スペルの色として反映（「あなたが緑のスペルを使用したとき」）
    if (t === 'ON_SPELL_USE' && e.triggerFilter?.color) s = `あなたが${[].concat(e.triggerFilter.color).join('・')}のスペルを使用したとき`;
    // ON_TRASH の発生源限定（fromZones）を反映（「このカードが手札かデッキからトラッシュに置かれたとき」）
    if (t === 'ON_TRASH' && e.triggerCondition?.fromZones && !e.triggerCondition?.trashSourceStory) {
      const zoneJa: Record<string, string> = { hand: '手札', deck: 'デッキ', energy: 'エナ', field: '場', under_signi: 'シグニの下' };
      const zones = e.triggerCondition.fromZones.map((z: string) => zoneJa[z] ?? z).join('か');
      s = s.replace('トラッシュに置かれたとき', `${zones}からトラッシュに置かれたとき`);
    }
    // ON_TRASH の「レゾナの出現条件のために」限定を反映
    if (t === 'ON_TRASH' && e.triggerCondition?.forResonaCondition) {
      s = 'レゾナの出現条件のために' + s.replace('トラッシュに置かれたとき', '場からトラッシュに置かれたとき');
    }
    // ON_TRASH の「効果によって」限定を反映（バトル・ルール処理では発火しない。G177）
    if (t === 'ON_TRASH' && e.triggerCondition?.byEffect) {
      s = s.includes('場からトラッシュに置かれたとき')
        ? s.replace('場からトラッシュに置かれたとき', '効果によって場からトラッシュに置かれたとき')
        : s.replace('トラッシュに置かれたとき', '効果によって場からトラッシュに置かれたとき');
    }
    // ON_TRASH の「あなたの効果によって」限定（相手効果・コスト・バトル・ルール処理では発火しない）
    if (t === 'ON_TRASH' && e.triggerCondition?.byOwnEffect) {
      s = s.includes('場からトラッシュに置かれたとき')
        ? s.replace('場からトラッシュに置かれたとき', 'あなたの効果によって場からトラッシュに置かれたとき')
        : s.replace('トラッシュに置かれたとき', 'あなたの効果によって場からトラッシュに置かれたとき');
    }
    // 原因主体＋移動元＋watcher scope を1文に戻す（個別の置換を重ねると「場から」を幻覚するため最後に組み直す）。
    if (t === 'ON_TRASH' && !e.triggerCondition?.trashSourceStory
        && (e.triggerCondition?.byOwnEffect || e.triggerCondition?.byOpponentEffect)) {
      const tc = e.triggerCondition;
      const cause = tc.byOwnEffect ? 'あなたの効果によって' : '対戦相手の効果によって';
      const scope = e.triggerScope ?? 'self';
      const subject = scope === 'any_ally'
        ? `あなたの${e.triggerFilter?.story ? `＜${e.triggerFilter.story}＞の` : ''}シグニ１枚が`
        : 'このカードが';
      const zoneJa: Record<string, string> = { hand: '手札', deck: 'デッキ', energy: 'エナゾーン', field: '場', under_signi: 'シグニの下' };
      const origin = tc.fromAnyZone ? 'いずれかの領域から'
        : tc.fromZones?.length ? `${tc.fromZones.map((z: string) => zoneJa[z] ?? z).join('か')}から` : '';
      const phase = tc.duringMainPhase ? 'あなたのメインフェイズの間、' : '';
      s = `${phase}${subject}${cause}${origin}トラッシュに置かれたとき`;
    }
    // ON_TRASH の「コストか効果によって〈ゾーン〉から」限定を反映（バトル・ルール処理では発火しない。G204）
    if (t === 'ON_TRASH' && e.triggerCondition?.fromFieldByCostOrEffect) {
      // fromZones/scope で組み立て済みの主語（self/any_ally/any_opp）を維持したまま原因句を差し込む。
      // self の原文だけは「このカード」ではなく「このシグニ」なので名詞も合わせる。
      // 🆕2026-08-30（§5.2 Sheet2 バッチ6）＝**出自ゾーンは「場」固定ではない**＝
      //   `WX18-062`/`WX22-027`/`WXK03-033` は「**シグニの下から**」で、旧実装は
      //   「シグニの下からコストか効果によって**場から**トラッシュに置かれたとき」という
      //   **原文に無いゾーンを足した二重表記**を出していた。既に組み立て済みのゾーン句へ原因句だけを挿す。
      s = s.replace(/^このカード/, 'このシグニ');
      const zoneCE = (e.triggerCondition.fromZones ?? []).includes('under_signi') ? 'シグニの下' : '場';
      s = s.includes(`${zoneCE}からトラッシュに置かれたとき`)
        ? s.replace(`${zoneCE}からトラッシュに置かれたとき`, `コストか効果によって${zoneCE}からトラッシュに置かれたとき`)
        : s.replace('トラッシュに置かれたとき', `コストか効果によって${zoneCE}からトラッシュに置かれたとき`);
    }
    // 🆕ON_TRASH の「（【起】能力の）コストとして場から」限定（効果・バトル・ルール処理では発火しない）。
    //   2026-08-30（§5.2 Sheet2 バッチ6）＝`fromFieldByCostOnly` は engine が読んでいるのに
    //   逆翻訳が1文字も描いていなかった＝**「置かれたら必ず発火」と読める偽陰性**（3枚）。
    if (t === 'ON_TRASH' && e.triggerCondition?.fromFieldByCostOnly) {
      s = s.includes('場からトラッシュに置かれたとき')
        ? s.replace('場からトラッシュに置かれたとき', 'コストとして場からトラッシュに置かれたとき')
        : s.replace('トラッシュに置かれたとき', 'コストとして場からトラッシュに置かれたとき');
    }
    // ON_TRASH の「コストかあなたの効果によって場から」限定（相手効果・バトル・ルール処理では発火しない）
    if (t === 'ON_TRASH' && e.triggerCondition?.fromFieldByCostOrOwnEffect) {
      s = s.replace(/^このカード/, 'このシグニ');
      s = s.includes('場からトラッシュに置かれたとき')
        ? s.replace('場からトラッシュに置かれたとき', 'コストかあなたの効果によって場からトラッシュに置かれたとき')
        : s.replace('トラッシュに置かれたとき', 'コストかあなたの効果によって場からトラッシュに置かれたとき');
    }
    // ON_PLAY の「効果によって」限定を反映（手札からの通常召喚では発火しない）
    if (t === 'ON_PLAY' && e.triggerCondition?.bySigniEffect) {
      s = s.replace('場に出たとき', 'シグニの効果によって場に出たとき');
    } else if (t === 'ON_PLAY' && e.triggerCondition?.byEffect) {
      s = s.replace('場に出たとき', '効果によって場に出たとき');
    }
    // ON_PLAY の「ダウン状態で」限定（G144「あなたのシグニがダウン状態で場に出たとき」）
    if (t === 'ON_PLAY' && e.triggerCondition?.placedDown) {
      s = s.replace('場に出たとき', 'ダウン状態で場に出たとき');
    }
    // ON_PLAY の「傀儡状態で」限定（WDK17-001「あなたの傀儡状態のシグニ１体が場に出たとき」）
    if (t === 'ON_PLAY' && e.triggerCondition?.placedPuppet) {
      s = s.replace('シグニが場に出たとき', '傀儡状態のシグニが場に出たとき');
    }
    // ON_PLAY の配置元限定（placedFromTrash は fromZones:['trash'] の後方互換）。
    if (t === 'ON_PLAY' && (e.triggerCondition?.placedFromTrash || e.triggerCondition?.fromZones?.length)) {
      const subj = (e.triggerScope === 'any_ally' || e.triggerScope === 'any')
        ? `あなたの${e.triggerFilter ? filterJa(e.triggerFilter) : ''}シグニ１体` : 'このシグニ';
      const zones = e.triggerCondition?.fromZones as string[] | undefined;
      const nonHand = ['deck', 'energy', 'field', 'under_signi', 'trash', 'lrig_deck', 'lrig_trash', 'life_cloth', 'excluded'];
      const origin = e.triggerCondition?.placedFromTrash || (zones?.length === 1 && zones[0] === 'trash')
        ? 'トラッシュから'
        : zones?.length === 1 && zones[0] === 'energy'
          ? 'エナゾーンから'
          : zones?.length === nonHand.length && nonHand.every(z => zones.includes(z)) && !zones.includes('hand')
            ? '手札以外の領域から'
            : `指定領域（${zones?.join('・') ?? '不明'}）から`;
      const byEffect = e.triggerCondition?.bySigniEffect ? 'シグニの効果によって'
        : e.triggerCondition?.byEffect ? '効果によって' : '';
      s = `${subj}が${byEffect}${origin}場に出たとき`;
    }
    // ON_DRAW の「あなたの場の＜story＞シグニの効果で」限定（WX20-026-E3）。ドローフェイズの通常ドローでは発火しない。
    if (t === 'ON_DRAW' && e.triggerCondition?.drawBySourceStory) {
      s = `あなたの場にある＜${e.triggerCondition.drawBySourceStory}＞のシグニの効果であなたがカードを１枚引いたとき`;
    }
    // ON_DRAW の「ドローフェイズ以外で引いたとき」限定（WXDi-D09-P19/WXDi-P05-062）
    if (t === 'ON_DRAW' && e.triggerCondition?.outsideDrawPhase) {
      s = 'ドローフェイズ以外であなたがカードを１枚引いたとき';
    }
    // ON_DRAW triggerScope:any_opp（対戦相手が引いたとき）＋位相/効果限定（WXDi-P04-038/WXDi-P15-091/WD22-029-G/PR-423）
    if (t === 'ON_DRAW' && e.triggerScope === 'any_opp') {
      const pr = e.triggerCondition?.drawPhaseRestriction;
      const phasePrefix = pr === 'main_attack' ? 'メインフェイズかアタックフェイズの間、'
        : pr === 'opp_attack' ? '対戦相手のアタックフェイズの間、' : '';
      const byEffect = e.triggerCondition?.drawByEffect ? '効果によって' : '';
      s = `${phasePrefix}対戦相手が${byEffect}カードを１枚引いたとき`;
    }
    // ON_RISE の「カード名に〜を含むシグニにライズされたとき」限定（WX20-056-E2）
    if (t === 'ON_RISE' && e.triggerCondition?.risedOntoNameContains) {
      s = `このシグニがカード名に《${e.triggerCondition.risedOntoNameContains}》を含むシグニにライズされたとき`;
    }
    // ON_PLAY placedFront（WXDi-P03-043「対戦相手のシグニ１体がこのシグニの正面に配置されたとき」／
    //   レベル filter 付き＝WX17-075-E1/WXDi-P02-083「このシグニの正面にレベルN以下のシグニ１体が出たとき」）
    if (t === 'ON_PLAY' && e.triggerCondition?.placedFront) {
      const tfLv = e.triggerFilter?.levelRange?.max
        ?? (typeof e.triggerFilter?.level === 'object' ? e.triggerFilter.level.max : undefined);
      s = tfLv !== undefined
        ? `このシグニの正面にレベル${tfLv}以下のシグニ１体が出たとき`
        : '対戦相手のシグニ１体がこのシグニの正面に配置されたとき';
    }
    // ON_PLAY frontLowerLevelThanSource（WX17-075「このシグニの正面にこのシグニより低いレベルを持つシグニが出たとき」）
    if (t === 'ON_PLAY' && e.triggerCondition?.frontLowerLevelThanSource) {
      s = 'このシグニの正面にこのシグニより低いレベルを持つシグニが出たとき';
    }
    // ON_PLAY placedOnTrapZone / placedOnGateZone（WX21-025/WXK10-044・タスク16[C]機構⑤）
    if (t === 'ON_PLAY' && e.triggerCondition?.placedOnTrapZone) {
      s = '対戦相手のシグニ１体が【トラップ】のあるシグニゾーンに出たとき';
    }
    if (t === 'ON_PLAY' && e.triggerCondition?.placedOnGateZone) {
      s = '対戦相手のシグニ１体が【ゲート】があるシグニゾーンに出たとき';
    }
    // 🆕2026-08-31 続き749＝「正面以外のシグニゾーンにアタックしたとき」（`WXEX2-71-E1`）。
    if (t === 'ON_ATTACK_SIGNI' && e.triggerCondition?.attackedNotFront) {
      const subjNF = e.triggerScope === 'any_ally' ? 'あなたのシグニ１体' : 'このシグニ';
      s = `${subjNF}が正面以外のシグニゾーンにアタックしたとき`;
    }
    // ON_SIGNI_BANISH_OPPONENT の banishedFilter/banishedNotFront（被バニッシュシグニの状態/位置限定・
    //   WX16-079/WXK02-054/WXEX2-76/WX17-032 等）。主語は triggerScope（self=このシグニ／any_ally=あなたのシグニ）。
    if (t === 'ON_SIGNI_BANISH_OPPONENT' && (e.triggerCondition?.banishedFilter || e.triggerCondition?.banishedNotFront)) {
      const bf = e.triggerCondition.banishedFilter;
      const stJa = bf?.isFrozen ? '凍結状態の' : bf?.infected ? '感染状態の' : '';
      const charmJa = bf?.hasCharm ? '【チャーム】が付いている' : '';
      const frontJa = e.triggerCondition.banishedNotFront ? '正面以外の' : '';
      const subjJa = e.triggerScope === 'any_ally' ? 'あなたのシグニ' : 'このシグニ';
      s = `${subjJa}がバトルによって${charmJa}${frontJa}対戦相手の${stJa}シグニをバニッシュしたとき`;
    }
    if (t === 'ON_SIGNI_BANISH_OPPONENT' && e.triggerScope === 'any_ally' && e.triggerFilter?.powerRange?.min !== undefined) {
      s = `あなたのパワー${e.triggerFilter.powerRange.min}以上のシグニが対戦相手のシグニ１体をバニッシュしたとき`;
    }
    // ON_ARTS_USE の triggerFilter.color（「あなたが緑のアーツを使用したとき」WXK01-043）
    if (t === 'ON_ARTS_USE' && e.triggerFilter?.color && !e.timing?.includes('ON_OPP_ARTS_USE')) {
      const acJa = Array.isArray(e.triggerFilter.color) ? e.triggerFilter.color.join('か') : e.triggerFilter.color;
      s = `あなたが${acJa}のアーツを使用したとき`;
    }
    // ON_EXCEED_COST「あなたがエクシードのコストを支払ったとき」変種（WXDi-P06-078）
    if (t === 'ON_EXCEED_COST' && e.triggerCondition?.exceedCostPaidByPlayer) {
      s = 'あなたがエクシードのコストを支払ったとき';
    }
    // ON_ACCE_ATTACH（アクセカード自身）: accedSelf または host レベル/クラス条件で「このカードが【アクセ】として…」を描画。
    //   （WXK05-040/SPK01-11「シグニに付いたとき」・WXK05-041「レベル4以上の…」・WX17-076「レベル2以下/3以上の＜調理＞の…」・WX17-033「＜調理＞の…」）
    //   accedSelf 無し＝ルリグ監視版（default「あなたのシグニ1体に【アクセ】が付いたとき」WXK04-003）。
    if (t === 'ON_ACCE_ATTACH' && (e.triggerCondition?.accedSelf || e.triggerCondition?.accedHostMinLevel || e.triggerCondition?.accedHostMaxLevel || e.triggerCondition?.accedHostStory)) {
      const tc = e.triggerCondition;
      const lvJa = tc.accedHostMinLevel ? `レベル${tc.accedHostMinLevel}以上の`
        : tc.accedHostMaxLevel ? `レベル${tc.accedHostMaxLevel}以下の` : '';
      const stJa = tc.accedHostStory ? `＜${tc.accedHostStory}＞の` : '';
      s = `このカードが【アクセ】として${lvJa}${stJa}シグニに付いたとき`;
    }
    // ON_SIGNI_BATTLE の triggerFilter（バトル相手のレベル/パワー条件・WX04-099/WX05-047/WXDi-P14-062）
    if (t === 'ON_SIGNI_BATTLE' && e.triggerFilter) {
      const tf = e.triggerFilter;
      const cond = tf.levelRange?.max !== undefined ? `レベル${tf.levelRange.max}以下の`
        : typeof tf.level === 'number' ? `レベル${tf.level}の`
        : tf.powerRange?.min !== undefined ? `パワー${tf.powerRange.min}以上の` : '';
      if (cond) s = `このシグニが対戦相手の${cond}シグニとバトルしたとき`;
    }
    // ON_PLAY の triggerFilter（クロス/ライズアイコン）を主語に反映（「あなたの《クロスアイコン》を持つシグニが場に出たとき」）
    if (t === 'ON_PLAY' && (e.triggerScope === 'any_ally' || e.triggerScope === 'any') && (e.triggerFilter?.hasCrossIcon || e.triggerFilter?.hasRiseIcon)) {
      const icon = e.triggerFilter.hasCrossIcon ? 'クロスアイコン' : 'ライズアイコン';
      s = `あなたの《${icon}》を持つシグニ１体が場に出たとき`;
    }
    // ON_CARD_MILLED_FROM_DECK の発生源デッキ・枚数限定（milledDeckOwner/milledMinCount）
    if (t === 'ON_CARD_MILLED_FROM_DECK') {
      const mo = e.triggerCondition?.milledDeckOwner ?? 'any';
      const mc = e.triggerCondition?.milledMinCount ?? 1;
      const who = mo === 'self' ? 'あなたの' : mo === 'opponent' ? '対戦相手の' : 'いずれかのプレイヤーの';
      const source = e.triggerCondition?.milledSourceStory
        ? `あなたの＜${e.triggerCondition.milledSourceStory}＞のシグニの効果によって`
        : e.triggerCondition?.byOwnEffect ? 'あなたの効果によって'
        : e.triggerCondition?.byOpponentEffect ? '対戦相手の効果によって'
        : e.triggerCondition?.byEffect ? '効果によって' : '';
      const milled = e.triggerCondition?.milledCardFilter;
      const noun = milled?.cardClass ? `＜${milled.cardClass}＞のシグニ` : milled?.cardType === 'シグニ' ? 'シグニ' : 'カード';
      s = `${source}${who}デッキから${noun}が${mc}枚以上トラッシュに置かれたとき`;
    }
    if (t === 'ON_REVEALED_FROM_HAND' && e.triggerCondition?.revealSourceStory) {
      s = `このカードがあなたの＜${e.triggerCondition.revealSourceStory}＞のシグニの効果によって手札から公開されたとき`;
    }
    // ON_CARD_MOVED_TO_DECK の宛先デッキ・枚数・発生源限定（movedToDeckOwner/MinCount/FromTrash）
    if (t === 'ON_CARD_MOVED_TO_DECK') {
      const vo = e.triggerCondition?.movedToDeckOwner ?? 'any';
      const vc = e.triggerCondition?.movedToDeckMinCount ?? 1;
      const fromTrash = e.triggerCondition?.movedToDeckFromTrash ?? false;
      const cause = e.triggerCondition?.byOwnEffect ? 'あなたの効果によって'
        : e.triggerCondition?.byOpponentEffect ? '対戦相手の効果によって'
        : e.triggerCondition?.byEffect ? '効果によって' : '';
      // 🆕`movedToDeckFromField`＝「**場から**」。描かないと由来限定なしと同じ文になり、
      //   engine は区別しているのに原文照合では見えない偽陰性になる（§5.3 `O-116`）。
      const fromField = e.triggerCondition?.movedToDeckFromField ?? false;
      if (vo === 'self' && fromTrash) s = `あなたのトラッシュからカードが${cause}${vc}枚以上デッキに移動したとき`;
      else if (vo === 'opponent' && fromField) s = `対戦相手のシグニが${cause}${vc}体以上場からデッキに移動したとき`;
      else if (vo === 'self' && fromField) s = `あなたのシグニが${cause}${vc}体以上場からデッキに移動したとき`;
      else if (vo === 'opponent') s = `対戦相手のカードが${cause}${vc}枚以上デッキに移動したとき`;
      else if (vo === 'self') s = `あなたのカードが${cause}${vc}枚以上デッキに移動したとき`;
      else s = `いずれかのプレイヤーのカードが${cause}${vc}枚以上デッキに移動したとき`;
    }
    // ON_HAND_ADDED（続き207）: handOwner/fromZones/movedSelf/excludeGrowPhase を描画。
    // ON_ENERGY_TO_FIELD 併記（WXDi-P11-007）＝「手札に加わるか場に出たとき」に1文でまとめ、場側は空にする。
    if (t === 'ON_HAND_ADDED') {
      const tc = e.triggerCondition;
      const orField = (e.timing ?? []).includes('ON_ENERGY_TO_FIELD');
      const haSubj = e.triggerFilter?.cardType === 'シグニ' ? 'シグニ' : 'カード';
      if (tc?.movedSelf) s = 'このシグニがあなたのエナゾーンから手札に移動したとき';
      else if (tc?.handOwner === 'opponent') s = `${tc?.excludeGrowPhase ? 'グロウフェイズ以外で' : ''}対戦相手の効果によってカードが１枚以上対戦相手の手札に移動したとき`;
      else if (tc?.fromZones?.includes('energy')) s = orField
        ? `あなたのエナゾーンから${haSubj}１枚が手札に加わるか場に出たとき`
        : `${haSubj}１枚があなたのエナゾーンから手札に移動したとき`;
    }
    if (t === 'ON_LIFE_CLOTH_ADDED' && e.triggerCondition?.turnOwner === 'self') {
      s = `あなたのターンの間、${s}`;
    }
    if (t === 'ON_OPP_ENERGY_ADDED' && e.condition?.type === 'DURING_PHASE'
        && (isAllAttackPhases(e.condition.phases) || e.condition.phases?.includes('ATTACK'))) {
      s = `アタックフェイズの間、${s}`;
    }
    if (t === 'ON_ENERGY_TO_FIELD' && (e.timing ?? []).includes('ON_HAND_ADDED')) s = '';
    // ON_SIGNI_POWER_ZERO_OR_LESS の triggerScope を主語に反映（any_opp=対戦相手/any_ally=あなた/self=このシグニ）
    if (t === 'ON_SIGNI_POWER_ZERO_OR_LESS') {
      const sc = e.triggerScope ?? 'any';
      const who = sc === 'any_opp' ? '対戦相手のシグニ' : sc === 'any_ally' ? 'あなたのシグニ' : sc === 'self' ? 'このシグニ' : 'シグニ';
      s = `${who}のパワーが0以下になったとき`;
    }
    // ON_OPP_POWER_DECREASED（毒牙・相手パワー減少時）（WX13-036/WXEX2-52）
    if (t === 'ON_OPP_POWER_DECREASED') {
      const cause = e.triggerCondition?.byOwnEffect ? 'あなたの効果によって'
        : e.triggerCondition?.byOpponentEffect ? '対戦相手の効果によって'
        : e.triggerCondition?.byEffect ? '効果によって' : '';
      s = `${cause}対戦相手のシグニのパワーが減ったとき`;
    }
    // ON_REFRESH（リフレッシュ時）の refreshedOwner を主語に反映（WXDi-P04-043）
    if (t === 'ON_REFRESH') {
      const ro = e.triggerCondition?.refreshedOwner ?? 'any';
      const who = ro === 'self' ? 'あなた' : ro === 'opponent' ? '対戦相手' : 'いずれかのプレイヤー';
      s = `${who}がリフレッシュしたとき`;
    }
    // ON_ENERGY_TO_TRASH（エナゾーン→トラッシュ）の energyTrashedOwner を主語に反映（WD15-015）
    if (t === 'ON_ENERGY_TO_TRASH') {
      const eo = e.triggerCondition?.energyTrashedOwner ?? 'any';
      const who = eo === 'self' ? 'あなたの' : eo === 'opponent' ? '対戦相手の' : 'いずれかのプレイヤーの';
      // energyLeftToAnyZone＝行き先を問わない変種（「他の領域に移動したとき」。WXDi-P06-038-E1）
      const cause = e.triggerCondition?.byOwnEffect ? 'あなたの効果によって'
        : e.triggerCondition?.byOpponentEffect ? '対戦相手の効果によって'
        : e.triggerCondition?.byEffect ? '効果によって' : '';
      s = e.triggerCondition?.energyLeftToAnyZone
        ? `${who}エナゾーンから効果によってカード１枚が他の領域に移動したとき`
        : `${cause}${who}エナゾーンからカードが１枚トラッシュに置かれたとき`;
    }
    if (t === 'ON_ZONE_MOVED') {
      const scope = e.triggerScope ?? 'self';
      const subject = scope === 'self' ? 'このシグニ'
        : scope === 'any_ally' ? 'あなたの場にあるシグニ１体'
        : scope === 'any_opp' ? '対戦相手の場にあるシグニ１体' : '場にあるシグニ１体';
      const cause = e.triggerCondition?.byOwnEffect ? 'あなたの効果によって'
        : e.triggerCondition?.byOpponentEffect ? '対戦相手の効果によって'
        : e.triggerCondition?.byEffect ? '効果によって' : '';
      s = `${subject}が${cause}他のシグニゾーンに移動したとき`;
    }
    // ON_SIGNI_CRASHED_LIFE_TOTAL の閾値（合計N枚以上）を反映
    if (t === 'ON_SIGNI_CRASHED_LIFE_TOTAL') {
      s = `このシグニが１ターンにライフクロスを合計${e.triggerCondition?.crashedTotalThisTurn ?? 1}枚以上クラッシュしたとき`;
    }
    // ON_CHARM_TO_TRASH（【チャーム】が場→トラッシュ）の triggerScope を主語に反映
    if (t === 'ON_CHARM_TO_TRASH') {
      const sc = e.triggerScope ?? 'any';
      const who = sc === 'any_ally' ? 'あなたの' : sc === 'any_opp' ? '対戦相手の' : '';
      s = `${who}【チャーム】１枚が場からいずれかのトラッシュに置かれたとき`;
    }
    // ON_ATTACK_END（§6.3 J-4）の「そのアタックによってダメージが与えられていない場合」を原文語彙へ戻す。
    if (t === 'ON_ATTACK_END' && e.triggerCondition?.attackDealtNoDamage) {
      s = 'このシグニがアタックしたアタック終了時、そのアタックによって対戦相手にダメージが与えられていない場合';
    }
    // 🆕§5.3 `O-181` 軸(b)（2026-09-02）＝「**アタックによって**対戦相手のライフクロスを1枚以上
    //   クラッシュしたとき、**そのアタック終了時**」（`WX25-CP1-012-E1`）。
    //   🔴落とすと「アタック終了時」だけの文になり、**クラッシュ限定が無かった旧実装と区別できない**。
    if (t === 'ON_ATTACK_END' && e.triggerCondition?.attackCrashedLife) {
      const whoAC = (e.triggerScope === 'any_ally' || e.triggerScope === 'any')
        ? 'あなたのルリグかシグニ' : 'このシグニ';
      s = `${whoAC}がアタックによって対戦相手のライフクロスを1枚以上クラッシュしたとき、そのアタック終了時`;
    }
    // ON_ABILITY_ACTIVATED（§6.3 J-1）の限定を原文語彙へ戻す（誰の／どの種別／【英知】限定／場のシグニ限定）。
    if (t === 'ON_ABILITY_ACTIVATED') {
      const tc = e.triggerCondition ?? {};
      const who = tc.activatedAbilityOwner === 'opponent' ? '対戦相手の' : tc.activatedAbilityOwner === 'self' ? 'あなたの' : '';
      const src = tc.activatedAbilityFromFieldSigni ? '場にあるシグニの' : '';
      const kind = tc.activatedAbilityKind === 'ON_PLAY' ? '【出】' : tc.activatedAbilityKind === 'AUTO' ? '【自】' : '';
      const eichi = tc.activatedAbilityEichi ? 'の【英知】' : '';
      s = `${who}${src}${kind}${eichi}能力が発動したとき`;
    }
    // ON_ACCE の triggerScope を主語に反映（self=このシグニに／any_ally=あなたのシグニ1体に）
    if (t === 'ON_ACCE' && (e.triggerScope === 'any_ally' || e.triggerScope === 'any')) {
      s = 'あなたのシグニ１体に【アクセ】が付いたとき';
    }
    // ON_OPP_ARTS_USE の主語（既定＝「効果を受けたとき」／any_opp＝「対戦相手が使用したとき」／
    //   ON_ARTS_USE と併記＝「あなたか対戦相手が使用したとき」WX16-003＝1文にまとめる＝ON_ARTS_USE 側は空にする）
    if (t === 'ON_OPP_ARTS_USE') {
      if (e.timing?.includes('ON_ARTS_USE')) s = 'あなたか対戦相手がアーツを使用したとき';
      else if (e.triggerScope === 'any_opp') s = '対戦相手がアーツを使用したとき';
    }
    if (t === 'ON_ARTS_USE' && e.timing?.includes('ON_OPP_ARTS_USE')) s = '';
    // ON_SIGNI_FROZEN の triggerScope を主語に反映（any_opp=対戦相手/any_ally=あなた）
    if (t === 'ON_SIGNI_FROZEN') {
      const sc = e.triggerScope ?? 'any_opp';
      const who = sc === 'any_opp' ? '対戦相手のシグニ' : sc === 'any_ally' ? 'あなたのシグニ' : sc === 'self' ? 'このシグニ' : 'シグニ';
      s = `${who}が凍結状態になったとき`;
    }
    // ON_HAND_DISCARDED の triggerFilter（捨て札のクラス限定）を反映（「手札から＜宝石＞のシグニを捨てたとき」）
    if (t === 'ON_HAND_DISCARDED' && e.triggerFilter && (e.triggerFilter.story || e.triggerFilter.cardClass)) {
      const cls = e.triggerFilter.story ?? e.triggerFilter.cardClass;
      const clsStr = Array.isArray(cls) ? cls.join('か') : cls;
      s = `あなたが手札から＜${clsStr}＞のカードを捨てたとき`;
    }
    // ON_HAND_DISCARDED の triggerFilter.isDisona（「《ディソナアイコン》のカードを捨てたとき」WXDi-P12-048/071）
    if (t === 'ON_HAND_DISCARDED' && e.triggerFilter?.isDisona) {
      s = 'あなたが《ディソナアイコン》のカードを１枚捨てたとき';
    }
    // ON_HAND_DISCARDED の triggerFilter.noGuard（「《ガードアイコン》を持たないカードを1枚捨てたとき」
    // WX24-P2-051-E1）。捨て札の限定を落とすと原文照合できない（isDisona と同型）。
    if (t === 'ON_HAND_DISCARDED' && e.triggerFilter?.noGuard) {
      s = 'コストか効果によってあなたが《ガードアイコン》を持たないカードを１枚捨てたとき';
    }
    // ON_HAND_DISCARDED の triggerScope:'any'（「いずれかのプレイヤーが」WXK09-038）を主語に反映
    if (t === 'ON_HAND_DISCARDED' && e.triggerScope === 'any') {
      s = s.replace('あなたが手札を捨てたとき', 'いずれかのプレイヤーが手札を捨てたとき');
    }
    // ON_HAND_DISCARDED の triggerScope:'any_opp'（「あなたの効果によって対戦相手が手札を捨てたとき」
    //   WXDi-P04-063/WX09-028 等・続き175）を主語に反映。「ガードステップ以外で」前置は落とす（相手の捨て札）。
    if (t === 'ON_HAND_DISCARDED' && e.triggerScope === 'any_opp') {
      s = 'あなたの効果によって対戦相手が手札を捨てたとき';
    }
    // byOwnEffect（「あなたが**自分の効果によって**カードをN枚以上捨てたとき」WXDi-D09-P16-E2）を主語に反映。
    // コスト捨て／相手効果による捨てでは発火しない原因限定なので、逆翻訳から落とすと原文照合できない。
    if (t === 'ON_HAND_DISCARDED' && e.triggerCondition?.byOwnEffect) {
      s = 'あなたが自分の効果によって手札を捨てたとき';
    }
    return s;
  }).filter(Boolean).join('/');
  // 主語に反映できなかった scope のみマーカー表示
  const scope = (e.triggerScope && e.triggerScope !== 'self' && !(e.timing || []).includes('ON_HAND_DISCARDED') && !(e.timing || []).includes('ON_SIGNI_POWER_ZERO_OR_LESS') && !(e.timing || []).includes('ON_SIGNI_FROZEN') && !(e.timing || []).includes('ON_CHARM_TO_TRASH') && !(e.timing || []).includes('ON_DRAW') && !(e.timing || []).includes('ON_MAIN_PHASE_START') && !(e.timing || []).includes('ON_ATTACK_PHASE_START') && !(e.timing || []).includes('ON_TURN_END') && !(e.timing || []).includes('ON_TURN_START') && !(e.timing || []).includes('ON_LRIG_GROW') && !(e.timing || []).includes('ON_OPP_ARTS_USE') && !(e.timing || []).includes('ON_OPP_LIFE_CRASHED') && !(e.timing || []).includes('ON_HEAVEN') && (scopeSubj === null || !(e.timing || []).some((t: string) => { const tj = timingJa[t] ?? ''; return tj.startsWith('このシグニ') || tj.startsWith('このカード'); }))) ? `〔範囲:${e.triggerScope}〕` : '';
  // 「〜の間」（ターン条件）は「場合、」を付けず「、」のみ。それ以外は「〜場合、」
  const condStr = e.condition ? condJa(e.condition) : '';
  const timingOwnsCondition = (e.timing || []).includes('ON_OPP_ENERGY_ADDED') && e.condition?.type === 'DURING_PHASE';
  const cond = !timingOwnsCondition && condStr ? (condStr.endsWith('間') ? `${condStr}、` : `${condStr}${/(状態|以上|以下|枚)$/.test(condStr) ? 'の' : ''}場合、`) : '';
  // 「〜かぎり」：述語（い形容詞「い」/動詞「る」終わり）はそのまま、名詞終わりは「である」を補う
  const acJa = e.activeCondition ? condJa(e.activeCondition) : '';
  // 「〜の間」で終わる活性条件（アタックフェイズ/ターンの間）は「〜かぎり」を付けず前置きとして描く
  // 既に「〜かぎり」で終わる活性条件（FRONT_SIGNI 等が節ごと生成する型）は二重付与しない。
  const actCond = e.activeCondition
    ? (acJa.endsWith('間') || acJa.endsWith('かぎり') ? `《${acJa}》` : `《${acJa}${/[いるた]$/.test(acJa) ? '' : 'である'}かぎり》`)
    : '';
  // 🆕**`costUnparsed`＝原文のコストを表現できなかった印**（§5.3 `O-46`・live 12効果）。
  // 🔴これを描かないと**逆翻訳が「無条件で発動する効果」に見える**が、実際は提示自体が止まっていて
  //   1度も発動しない（`signiActivateGate` ／ `triggerCollect` が `costUnparsed` を弾く）＝
  //   **原文照合でも census でも「合っている／過剰」のどちらにも見えない死角**になる（§4.3）。
  // ⚠**文言は「JSON の事実」だけにする**＝トップレベル効果は提示・収集の両方で弾かれる
  //   （`signiActivateGate` / `lrigActivateGate` / `triggerCollect` が `costUnparsed` を見る）が、
  //   **`GRANT_*.abilities[]` の入れ子**にも同じ印が載るため「発動しない」と断定すると過剰主張になる。
  const cost = e.costUnparsed
    ? '〈※コスト未表現（原文のコスト句を parser が解釈できていない）〉'
    : e.cost ? `〈${costJa(e.cost)}〉` : '';
  const limit = e.usageLimit && e.usageLimit !== 'unlimited' && !(e.timing || []).includes('ON_OPP_ENERGY_ADDED') ? `《${e.usageLimit}》` : '';
  // 🆕**§5.3 `O-64`：フェイズ主限定（`duringMainPhase`／`outsideMainPhase`／`duringAttackPhase`）の共通マーカー。**
  // 従来この軸は **timing ごとの分岐が個別に `trig` へ埋め込む**形しか無く、規則を書いていない timing
  // （ON_PLAY／ON_HAND_DISCARDED／ON_POWER_THRESHOLD／ON_LIFE_CRASHED …）では**逆翻訳から丸ごと消えて**いた
  // ＝JSON にゲートが載っているのにシートは「無条件」に見える（§4.3＝逆翻訳は必ず JSON から描く）。
  // ⚠**timing 別分岐が既に描いているときは二重表記になる**ので、`trig` に既出なら描かない。
  const phaseOwnerJa = e.triggerCondition?.turnOwner === 'opponent' ? '対戦相手の' : 'あなたの';
  const phaseJaMark = e.triggerCondition?.duringMainPhase ? 'あなたのメインフェイズの間、'
    : e.triggerCondition?.outsideMainPhase ? 'あなたのメインフェイズ以外で'
    : e.triggerCondition?.duringAttackPhase ? `${phaseOwnerJa}アタックフェイズの間、`
    : '';
  const phaseMark = (phaseJaMark && !trig.includes('フェイズの間') && !trig.includes('フェイズ以外')) ? phaseJaMark : '';
  // 《自分ターン》/《相手ターン》: AUTO のターン限定発火マーカー（triggerCondition.turnOwner）。
  // ON_BANISH の duringAttackPhase 併用時は「（対戦相手の）アタックフェイズの間、」前置きが同義のため二重表記を抑止。
  // ⚠`O-64` の `phaseMark` が「対戦相手の…フェイズの間、」を描いたときも同義なので同じく抑止する。
  const suppressTurnMark = (((e.timing || []).includes('ON_BANISH') || (e.timing || []).includes('ON_LEAVE_FIELD'))
      && (e.triggerCondition?.duringAttackPhase || e.triggerCondition?.duringMainPhase))
    || phaseMark !== '';
  const turnMark = (e.triggerCondition?.turnOwner && !suppressTurnMark && !(e.timing || []).includes('ON_LIFE_CLOTH_ADDED'))
    ? (e.triggerCondition.turnOwner === 'self' ? '《自分ターン》' : '《相手ターン》') : '';
  const body = actionJa(e.action, e.effectType);
  // ON_MATERIAL_USED は改造素材機構（Step1-3b）で全変種配線済＝engineUnwiredTimings から除外済。
  const unwired = (e.timing || []).some((t: string) => engineUnwiredTimings.has(t)) ? '【※engine未配線】' : '';
  return `${crossCond}${typeMark}${turnMark}${actCond}${trig ? phaseMark + trig + '：' : ''}${scope}${limit}${cost}${cond}${body}${unwired}`;
}

// ── 対象カードの決定 ──
// CardData_Sheet<N>.csv の全カードを CSV 順で対象にする（引数長制限回避）
function sheetTargets(n: string): string[] {
  const p = join(root, 'public/data', `CardData_Sheet${n}.csv`);
  const text = readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return data.map(r => r.CardNum?.trim()).filter((x): x is string => !!x);
}

const args = process.argv.slice(2);

// --sheets: 全シートを docs/decompile_sheet<N>.txt へ UTF-8 直書き（シェルのリダイレクト不要）
if (args[0] === '--sheets') {
  const nums = readdirSync(join(root, 'public/data'))
    .map(f => f.match(/^CardData_Sheet(\d+)\.csv$/)?.[1])
    .filter((x): x is string => !!x)
    .sort((a, b) => Number(a) - Number(b));
  for (const n of nums) {
    const t = sheetTargets(n);
    writeFileSync(join(root, 'docs', `decompile_sheet${n}.txt`), renderCards(t), 'utf-8');
    console.log(`docs/decompile_sheet${n}.txt … ${t.length}枚`);
  }
  console.log(`全${nums.length}シート再生成（UTF-8直書き）。下流は npm run regen が一括で回す。`);
  process.exit(0);
}

let targets: string[] = [];
if (args.includes('--manual')) {
  // manualEffects.ts に登場するカード番号を抽出
  const src = readFileSync(join(root, 'src/data/manualEffects.ts'), 'utf-8');
  targets = [...src.matchAll(/'([A-Z0-9]+-[A-Za-z0-9-]+)':\s*\[/g)].map(m => m[1]);
} else if (args[0] === '--sheet') {
  targets = sheetTargets(args[1] ?? '1');
} else if (args[0] === '--file') {
  // 改行/空白区切りのカード番号ファイル
  targets = readFileSync(args[1], 'utf-8').split(/\s+/).map(s => s.trim()).filter(Boolean);
} else if (args[0] === '--grep') {
  const kw = args[1] ?? '';
  for (const [id, c] of cardMap) {
    if (((c.EffectText ?? '') + (c.BurstText ?? '')).includes(kw) && effectsMap.has(id)) targets.push(id);
  }
} else {
  targets = args;
}
if (targets.length === 0) {
  console.log('使い方: npx tsx scripts/decompileEffects.ts <CardNum...> | --manual | --grep <語> | --sheet <N> | --sheets | --file <path>');
  process.exit(0);
}

// ── 出力（stdout 出力と --sheets のファイル直書きで共用。1 push = 旧 console.log 1行） ──
function renderCards(ids: string[]): string {
  const out: string[] = [];
  for (const id of ids) {
    const card = cardMap.get(id);
    const effs = effectsMap.get(id);
    out.push('\n' + '='.repeat(78));
    out.push(`${id}  ${card?.CardName ?? '(名称不明)'}  [${card?.Type ?? '?'} ${card?.CardClass ?? ''}]`);
    out.push('-'.repeat(78));
    out.push('【原文 EffectText】');
    out.push('  ' + (card?.EffectText ?? '(なし)').replace(/。/g, '。\n  '));
    if (card?.BurstText && card.BurstText !== '-') {
      out.push('【原文 BurstText】');
      out.push('  ' + card.BurstText.replace(/。/g, '。\n  '));
    }
    out.push('\n【JSON 逆翻訳】');
    if (!effs) { out.push('  (effects.json に登録なし)'); continue; }
    currentCardText = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
    currentCardName = card?.CardName ?? '';
    // グロウ条件（EffectText の【グロウ】〜【 を runtime checkGrowCondition が評価。JSON効果には含まれないため別途表示）
    const growCondM = (card?.EffectText ?? '').match(/【グロウ】([^【]*)/);
    if (growCondM && growCondM[1].trim()) {
      out.push(`  【グロウ条件】${growCondM[1].trim()}（runtime checkGrowCondition で評価）`);
    }
    for (const e of effs) {
      // restoreLeadDuration の探索範囲を当該効果の原文セクションに絞る（BURST は BurstText・他は EffectText）。
      currentEffectText = /BURST/.test(e.effectId) ? (card?.BurstText ?? '') : (card?.EffectText ?? '');
      out.push(`  ${e.effectId}: ${effJa(e)}`);
    }
    currentEffectText = '';
    currentCardName = '';
  }
  out.push('\n' + '='.repeat(78));
  out.push(`${ids.length}枚を表示。逆翻訳は JSON 宣言の和文化（近似/STUBは明示）。原文との食い違いは要確認シグナル。`);
  return out.join('\n') + '\n';
}

process.stdout.write(renderCards(targets));
