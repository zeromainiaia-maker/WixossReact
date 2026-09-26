import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import { canSelfPlay } from '../../engine/effectEngine';
import { getCardNum } from '../../engine/effectExecutor';
import type { ArtsPayerCtx } from './artsUseGate';
import { canUseArtsCondition, isPieceCardType } from './battleUtils';
import {
  applySpecificCardCostReduction, canAffordEnergyCostWithSubstitutes, coinPayableFor, colorlessPayableColorsOf,
  computeArtsEffectiveCost, costReplacementOf, costScalingOf, keyPlaceCoinCostOf,
} from './costs';
import { energyPoolCardNums } from './energyPaySource';

/**
 * キーを場に出す／ピースを使う**提示ゲート**（§5.6 `C-7`・2026-09-17）。
 *
 * 🔴**なぜ抜き出したか**＝判定は `BattleScreen` のルリグデッキのカードアクション（JSX 直書き）にしか無く、
 *   コストの式は `KeyUseModal` に、コインの請求は `executeKeyPiece` に**別々に写経されていた**＝
 *   CPU が同じ判定を使えない（§5.6.3 規律1）うえ、3地点が食い違っていた：
 *   ①**請求するコイン**＝提示とモーダルは `keyPlaceCoinCostOf`（「センタールリグが＜にじさんじ＞なら《コイン×0》」）、
 *     実行は**印刷コインを直読み**＝一覧では「0枚」と出たキーで手持ちのコインを取られていた（`WXK10-015`/`WXK11-012`）。
 *   ②**コインの使用制限**（`coin_use_restriction`＝「コインはスペルとシグニにしか使えない」）はモーダルだけが見ていた
 *     ＝一覧には「キーにセット」が出るのに押すと決定が灰色のまま。
 * ⇒ **提示・モーダル・実行・CPU の4地点がこの1本を通る。**
 */

export interface KeyPieceUseGateInput {
  /** 判定するカード（`キー` / `ピース` 系）。 */
  card: CardData;
  my: PlayerState;
  op: PlayerState;
  /** `my` がターンプレイヤーか。 */
  isMyTurn: boolean;
  turnPhase: string;
  cards: CardData[];
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  /**
   * `SELF_PLAY_RESTRICT`（「このキーは〜の場合にしか新たに場に出せない」）を読む効果マップ。
   * ⚠人間 UI は付与を含まない `baseEffectsMap` で読んでいた＝省略時は `effectsMap`。
   */
  selfPlayEffectsMap?: Map<string, CardEffect[]>;
  payer: ArtsPayerCtx;
  effectivePowers?: Map<string, number>;
}

export interface KeyPieceCost {
  /** 請求するコイン（`SELF_PLACE_COIN_COST` の置換込み）。 */
  coinNeeded: number;
  /** 請求するエナ（EffectText 由来の条件つき軽減・カード名指定の軽減の適用後）。 */
  effectiveCost: string;
}

export interface KeyPieceUseCheck extends KeyPieceCost {
  usable: boolean;
  isPiece: boolean;
  /** フェイズ・Timing・キーの置き場の空き・`SELF_PLAY_RESTRICT`・ピースの体数ルールを満たすか（支払いと使用条件は含まない）。 */
  placeable: boolean;
  /** コイン（使用制限を含む）とエナの両方を払えるか。 */
  affordable: boolean;
  /** `【使用条件】`（【チーム】・ルリグ3体など）を満たすか。 */
  conditionOk: boolean;
}

/** 「何枚でも場に出せる」【常】（`UNLIMITED_KEYS`）をセンタールリグが持つか。 */
export function hasUnlimitedKeys(my: PlayerState, effectsMap: Map<string, CardEffect[]>): boolean {
  return my.field.lrig.some(ln =>
    (effectsMap.get(ln) ?? []).some(e =>
      e.effectType === 'CONTINUOUS'
      && (e.action as StubAction)?.type === 'STUB'
      && (e.action as StubAction)?.id === 'UNLIMITED_KEYS'));
}

/** キーを置ける上限（`UNLIMITED_KEYS` なら無制限・`key_place_limit`＝「N枚まで」＝§5.3 `O-200`）。 */
export function keyCapacityOf(my: PlayerState, effectsMap: Map<string, CardEffect[]>): number {
  return hasUnlimitedKeys(my, effectsMap) ? Infinity : Math.max(1, my.key_place_limit ?? 1);
}

/** いま場にあるキーの枚数。 */
export function keysOnFieldOf(my: PlayerState): number {
  return (my.field.key_piece ? 1 : 0) + (my.field.key_piece_extra?.length ?? 0);
}

/** 場のルリグの体数（センター＋アシスト左右）。 */
export function lrigsOnFieldOf(my: PlayerState): number {
  return (my.field.lrig.length > 0 ? 1 : 0)
    + ((my.field.assist_lrig_l?.length ?? 0) > 0 ? 1 : 0)
    + ((my.field.assist_lrig_r?.length ?? 0) > 0 ? 1 : 0);
}

/**
 * 🆕**ピースの体数ルール**（§5.6 `C-7`・2026-09-17）＝「ピースはあなたの場にルリグが３体いると使用できる」
 * （ピース116枚の多くに注釈として印刷されている）。
 * 🔴**旧実装はどこにも無かった**（parser の `WXDi-P16-TK01` の項に「ルール自体が engine 未実装」と明記）＝
 *   センタールリグ1体のデッキでもピースが使えていた。
 * ⚠緩和＝`STUB{PIECE_IGNORES_LRIG_COUNT_RULE}`（「このピースはあなたの場にルリグが３体いなくても使用できる」）。
 */
export const PIECE_REQUIRED_LRIG_COUNT = 3;

export function pieceIgnoresLrigCountRule(cardNum: string, effectsMap: Map<string, CardEffect[]>): boolean {
  return (effectsMap.get(getCardNum(cardNum)) ?? []).some(e =>
    e.effectType === 'ACTIVATED' && JSON.stringify(e.action ?? {}).includes('"PIECE_IGNORES_LRIG_COUNT_RULE"'));
}

export function pieceLrigCountOk(card: CardData, my: PlayerState, effectsMap: Map<string, CardEffect[]>): boolean {
  return !isPieceCardType(card.Type)
    || lrigsOnFieldOf(my) >= PIECE_REQUIRED_LRIG_COUNT
    || pieceIgnoresLrigCountRule(card.CardNum, effectsMap);
}

/**
 * キー／ピースの**実効コスト**（提示・`KeyUseModal`・実行・CPU が共有する1本）。
 * ⚠ピースにも EffectText 由来の条件つき軽減がある（`WXDi-P16-003`〜`007`＝「場に〔色〕のルリグが2体以上いるかぎり、
 *   1体につき《色×1》減る」）＝`computeArtsEffectiveCost` を通す。
 */
export function keyPieceCostOf(p: Pick<KeyPieceUseGateInput, 'card' | 'my' | 'op' | 'cardMap' | 'effectsMap'> & {
  payer: Pick<ArtsPayerCtx, 'lrigNameAliases' | 'specificCardCostReductions'>;
}): KeyPieceCost {
  const { card, my, op, cardMap, effectsMap, payer } = p;
  const myLrig = cardMap.get(my.field.lrig.at(-1) ?? '');
  const effCost = computeArtsEffectiveCost(
    card, my, myLrig?.CardName, cardMap.get(op.field.lrig.at(-1) ?? '')?.Color ?? '',
    myLrig ? parseInt(myLrig.Level ?? '0') : 0, cardMap, payer.lrigNameAliases, undefined,
    { oppState: op, cardCostReplacements: my.card_cost_replacements }, costScalingOf(card.CardNum, effectsMap),
    costReplacementOf(card.CardNum, effectsMap),
  );
  return {
    coinNeeded: keyPlaceCoinCostOf(card, effectsMap, my, op, cardMap),
    // §5.3 `O-259` 第2バッチ＝カード名指定の《無》軽減（常設＋**このターンだけ**の予約）。
    effectiveCost: applySpecificCardCostReduction(effCost, card.CardName, payer.specificCardCostReductions),
  };
}

/** キー／ピースをいま使えるか（人間のカードアクションと CPU が同じ関数を見る）。 */
export function checkKeyPieceUse(p: KeyPieceUseGateInput): KeyPieceUseCheck {
  const { card, my, op, isMyTurn, turnPhase: phase, cards, cardMap, effectsMap, payer } = p;
  const isPiece = isPieceCardType(card.Type);
  const cost = keyPieceCostOf(p);
  const none = { ...cost, usable: false, isPiece, placeable: false, affordable: false, conditionOk: false };
  if (card.Type !== 'キー' && !isPiece) return none;
  // 🔴**ピースはキーゾーンを占有しない**（§3 (cxxiii)・続き475g）＝キーの枠でピースを絞らない。
  if (!isPiece && keysOnFieldOf(my) >= keyCapacityOf(my, effectsMap)) return none;
  // 🔴**CSV の空欄は `'-'`**（空文字ではない）＝`!timing` で判定すると全80枚のキーが出せなかった（§5.3 `O-200`）。
  const timingRaw = card.Timing ?? '';
  const timing = timingRaw === '-' ? '' : timingRaw;
  // §5.3 `O-290`＝キーの配置でも `SELF_PLAY_RESTRICT` を見る（この時点でカードはまだルリグデッキにある）。
  const selfPlaceOk = canSelfPlay((p.selfPlayEffectsMap ?? effectsMap).get(card.CardNum), my, op, cardMap);
  const phaseOk =
    (phase === 'MAIN' && isMyTurn && (timing.includes('メインフェイズ') || !timing)) ||
    (phase === 'GROW' && isMyTurn && timing.includes('グロウフェイズ')) ||
    // CSV Timing が「アタックフェイズ」のピース14枚（メイン+アタック11／アタックのみ3）。
    (isPiece && isMyTurn && timing.includes('アタックフェイズ')
      && (phase === 'ATTACK_SIGNI' || phase === 'ATTACK_LRIG' || phase === 'ATTACK_ARTS')) ||
    // 🆕2026-09-26（ルール＝ユーザー確認）＝使用タイミングにアタックフェイズがあるものは、相手ターンの相手のアーツステップでも使える。
    (isPiece && !isMyTurn && timing.includes('アタックフェイズ') && phase === 'ATTACK_ARTS_OP');
  const placeable = selfPlaceOk && phaseOk && pieceLrigCountOk(card, my, effectsMap);
  const affordable = my.coins >= cost.coinNeeded
    // §5.3 `O-245`＝キー／ピースは `coin_use_restriction` の対象（旧実装はモーダルだけが見ていた）。
    && (cost.coinNeeded === 0 || coinPayableFor(my, isPiece ? 'piece' : 'key'))
    && canAffordEnergyCostWithSubstitutes({
      poolNums: energyPoolCardNums(payer.energyPayPool), cards, baseCost: cost.effectiveCost,
      keywordGrants: my.keyword_grants, allMulti: payer.enaAllMulti, stripped: payer.enaMultiStripped,
      colorlessOverrides: payer.colorlessOverrides, colorSubs: payer.colorSubs,
      // 《無》コストの許可色（`PR-K048`＝「《無》コストは白か赤か青でしか支払えない」）。
      colorlessPayableColors: colorlessPayableColorsOf(card.CardNum, effectsMap),
      wholeSubstitutes: payer.wholeEnergySubstitutes,
    });
  const conditionOk = canUseArtsCondition(
    effectsMap.get(card.CardNum) ?? [], my, op, cardMap, card.CardNum, phase, isMyTurn, p.effectivePowers);
  return { ...cost, usable: placeable && affordable && conditionOk, isPiece, placeable, affordable, conditionOk };
}

/** ルリグデッキ順に、いま使えるキー／ピースを列挙する（同名カードは最初の1枚だけ）。 */
export function listUsableKeyPieces(p: Omit<KeyPieceUseGateInput, 'card'>): { card: CardData; check: KeyPieceUseCheck }[] {
  const out: { card: CardData; check: KeyPieceUseCheck }[] = [];
  const seen = new Set<string>();
  for (const id of p.my.lrig_deck) {
    const num = getCardNum(id);
    if (seen.has(num)) continue;
    seen.add(num);
    const card = p.cardMap.get(num);
    if (!card || (card.Type !== 'キー' && !isPieceCardType(card.Type))) continue;
    const check = checkKeyPieceUse({ ...p, card });
    if (check.usable) out.push({ card, check });
  }
  return out;
}
