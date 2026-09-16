import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import { getCardNum } from '../../engine/execUtils';
import { collectOppExtraGuardFromHand, collectOppGuardExtraColorlessCost } from '../../engine/effectEngine';

/** 現在の所有者盤面で、手札のカードを【ガード】として使用できるかを判定する。 */
export function canCardGuard(
  cardNum: string,
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, CardEffect[]>,
): boolean {
  const baseCardNum = getCardNum(cardNum);
  if (cardMap.get(baseCardNum)?.Guard !== '1') return false;

  const guardLoss = (effectsMap.get(baseCardNum) ?? []).find(effect =>
    effect.effectType === 'CONTINUOUS' &&
    effect.action.type === 'STUB' &&
    effect.action.id === 'GUARD_LOSS_UNLESS_LRIG'
  );
  if (!guardLoss || guardLoss.action.type !== 'STUB') return true;

  const requiredClass = (guardLoss.action as StubAction).lrigClass;
  if (!requiredClass) return true;

  const centerLrigNum = ownerState.field.lrig.at(-1);
  const centerLrigClass = centerLrigNum
    ? cardMap.get(getCardNum(centerLrigNum))?.CardClass ?? ''
    : '';
  return centerLrigClass.includes(requiredClass);
}

/** クラス限定の代替ガード（手札またはエナ）の候補。UI と支払いで同じ判定を使う。 */
export function guardAlternativeClassCandidates(
  ownerState: PlayerState, signiClass: string, cardMap: Map<string, CardData>,
): { handIndices: number[]; energyNums: string[] } {
  const matches = (num: string): boolean => {
    const card = cardMap.get(getCardNum(num));
    return card?.Type === 'シグニ' && (card.CardClass ?? '').includes(signiClass);
  };
  return {
    handIndices: ownerState.hand.map((num, i) => matches(num) ? i : -1).filter(i => i >= 0),
    energyNums: ownerState.energy.filter(matches),
  };
}

/**
 * 「〈レベル限定〉のシグニで【ガード】ができない」を `blocked_actions` / CONTINUOUS の actionId 集合から解いて、
 * 「そのレベルのカードでガードできないか」を答える述語にする（§6.4 O-41・2026-08-22）。
 *
 * 🔴**この限定を落とすと素の `GUARD`（＝ガードそのものができない）と同じ挙動になり、原文より遥かに強い
 *   過剰実行に化ける**。live 実測で6効果がその状態だった（`WD15-010` `WDK05-T09` `WX18-039` `WX10-009`
 *   `WX19-054` `WXEX2-01`）。
 *
 * 語彙は actionId の**文字列**で持つ。`blocked_actions`（`string[]`）も CONTINUOUS 側の
 * `ContinuousBlockResult.forSelf`（`Set<string>`）も文字列の経路なので、`BlockActionAction` に型フィールドを
 * 足しても常在（【常】）側には届かない。
 *   - `GUARD_MAX_LV<n>`      ＝レベル n **以下**（従来からある形）
 *   - `GUARD_LV<n>[_<m>…]`   ＝そのレベル**ちょうど**／列挙（`GUARD_LV2_3` ＝レベル２とレベル３）
 * ⚠**2つを1つの regex で拾わない**＝「以下」と「ちょうど」が混ざって過剰・過小の両方に化ける。
 * ⚠**終端アンカーを打たない**＝`execBlockAction` は `until:'NEXT_TURN'` のとき `:NEXT_TURN` を付けて積む。
 * ⚠レベルを持たないガードカードは呼び出し側の慣例どおり `-1` で渡る＝「n 以下」には従来どおり掛かる
 *   （ここで挙動を変えると O-41 と無関係の退化になる）。
 *
 * 実行時にしかレベルが決まらない `GUARD_LV_DECLARED` / `GUARD_LV_LAST_DOWNED` は**ここには来ない**＝
 * `execBlockAction` が宣言値／直前ダウン札のレベルを解決して `declared_guard_restrict_levels` に積む。
 */
export function makeGuardLevelBlocker(actionIds: Iterable<string>): (level: number) => boolean {
  let maxLevel = -1;
  const exactLevels = new Set<number>();
  for (const id of actionIds) {
    const asMax = id.match(/^GUARD_MAX_LV(\d+)/);
    if (asMax) { maxLevel = Math.max(maxLevel, parseInt(asMax[1])); continue; }
    const asExact = id.match(/^GUARD_LV(\d+(?:_\d+)*)/);
    if (asExact) for (const n of asExact[1].split('_')) exactLevels.add(parseInt(n));
  }
  return (level: number) => (maxLevel >= 0 && level <= maxLevel) || exactLevels.has(level);
}

/** `guardableHandIndices` の入力（防御側＝ガードする側の視点）。 */
export interface GuardableHandInput {
  /** ガードする側（ルリグにアタックされている側）。 */
  responder: PlayerState;
  /** アタックしている側。 */
  attacker: PlayerState;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  /** 防御側に掛かっている CONTINUOUS の行動禁止（`calcContinuousBlockedActions(...).forSelf`）。 */
  contBlockedForSelf: Iterable<string>;
  /** 防御側の「手札の＜クラス＞シグニは《ガードアイコン》を持つ」（`collectHandGuardIconClasses`）。 */
  handGuardClasses: string[];
}

/**
 * 【ガード】に使える**手札の添字**（§5.6 `C-2`・2026-09-17）。
 *
 * 🔑**可否の唯一の権威**＝人間のダイアログ（`GuardResponseDialog`）と CPU（`cpuGuard.ts`）が**同じ関数**を見る。
 *   旧実装はこの判定が JSX の中に直書きされており、CPU は「ガードしない」固定だった＝**CPU がガードする経路が一度も踏まれていない**。
 *   ⚠写経すると「人間には出ないのに CPU は使える」型の無言のズレになる（§5.6.3 規律1）。
 *
 * 見る軸＝①ガードそのものの禁止（`prevent_opp_guard`／`BLOCK_ACTION{GUARD}`）②追加コスト（《無》不足／追加ガードカード不足）
 *   ③カードごとの《ガードアイコン》（付与・クラス付与・任意カード可を含む）④レベル限定の禁止（`GUARD_MAX_LV`／`GUARD_LV`／宣言レベル）。
 * ⚠**代替ガード（エナのクラス指定トラッシュ・コラボ・手札N枚）はここに含めない**＝ボタンが別で、実行関数も別。
 */
export function guardableHandIndices(p: GuardableHandInput): number[] {
  const { responder: my, attacker: op, cardMap, effectsMap } = p;
  const blockedSelf = new Set(p.contBlockedForSelf);
  const guardBlockedByLevel = makeGuardLevelBlocker([...(my.blocked_actions ?? []), ...blockedSelf]);
  const guardBlockedOutright = (my.blocked_actions ?? []).includes('GUARD') || blockedSelf.has('GUARD');
  if (op.prevent_opp_guard === true || guardBlockedOutright) return [];
  // ⚠ガードは常に相手ターン中＝防御側は非ターンプレイヤー（`performGuardResponse` と同じ `true`）。
  const extraColorless = collectOppGuardExtraColorlessCost(op, my, cardMap, effectsMap, true);
  if (my.energy.length < extraColorless) return [];
  const guardCardCountInHand = my.hand.filter(cn => canCardGuard(cn, my, cardMap, effectsMap)).length;
  if (collectOppExtraGuardFromHand(op, cardMap, effectsMap) && guardCardCountInHand < 2) return [];
  const declaredRestrictLv = op.declared_guard_restrict_level;
  const declaredRestrictLvs = op.declared_guard_restrict_levels ?? [];
  const out: number[] = [];
  my.hand.forEach((num, i) => {
    const card = cardMap.get(getCardNum(num));
    if (!my.optional_discard_guard_enabled) {
      const classGuardable = p.handGuardClasses.length > 0 && card?.Type === 'シグニ'
        && p.handGuardClasses.some(cls => card?.CardClass?.includes(cls));
      const isGuardable = canCardGuard(num, my, cardMap, effectsMap)
        || (my.hand_signi_guard_enabled && card?.Type === 'シグニ') || classGuardable;
      if (!isGuardable) return;
      const guardLevel = parseInt(card?.Level ?? '-1');
      if (guardBlockedByLevel(guardLevel)) return;
      if (declaredRestrictLv !== undefined && guardLevel === declaredRestrictLv) return;
      if (declaredRestrictLvs.includes(guardLevel)) return;
    }
    out.push(i);
  });
  return out;
}
