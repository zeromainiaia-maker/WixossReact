import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import { calcContinuousBlockedActions, calcFieldPowers, checkActiveCondition, collectInfectedActivateBlockedSigni, isKizunaActive } from '../../engine/effectEngine';
import { evalUseCondition, getCardNum, matchesFilter } from '../../engine/effectExecutor';
import { countAcce } from '../../utils/acce';
import { fieldTrashGroupsAffordable, fieldTrashSelectableZones } from './fieldLimit';
import { payLrigDownCost } from './lrigDownCost';
import { canPayUnderSelfTrash } from './underAnySigniCost';
import { handDiscardSigniAffordable } from './costs';

/**
 * 場のシグニ【起】が**いま撃てるか**（提示の可否）を1か所で判定する純関数。
 *
 * ⚠**必ず人間のボタン生成と CPU の候補フィルタの両方から同じ関数を呼ぶこと**。
 * `signiAttackGate.ts` と同じ理由＝軸を写経すると「人間には見えないのに CPU は撃てる」
 * （またはその逆）という食い違いになり、ゲートにも census にも一切映らない。
 *
 * ⚠**「処理中」「自分のターンか」等の一過性UI条件はここに入れない**（呼び出し元の責務）。
 * ⚠**ここは「提示」の判定であって「支払い」ではない**（PLAN §3・続き546 教訓 (d)＝
 * 支払い地点と提示地点は別々に数える）。エナ等の実際の支払い可否は実行経路が見る。
 */
export interface SigniActivateGateInput {
  /** 【起】を撃つ側（＝シグニの持ち主）。 */
  my: PlayerState;
  /** その対戦相手。 */
  op: PlayerState;
  /** 判定するシグニのゾーン index（`my.field.signi` の添字）。 */
  zoneIndex: number;
  /**
   * 判定するフェイズ。`'MAIN'`＝無印【起】、`'ATTACK_ARTS'`＝《アタックフェイズアイコン》付き【起】。
   * それ以外のフェイズでは【起】自体が撃てないので呼ばない。
   */
  phase: 'MAIN' | 'ATTACK_ARTS';
  /** `my` がターンプレイヤーか（`activeCondition` の評価に渡す）。 */
  isMyTurn: boolean;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  /** 事前計算済みなら渡す（UI のメモ）。無ければ `my` 視点で計算する。 */
  effectivePowers?: Map<string, number>;
  /** 事前計算済みなら渡す（`calcContinuousBlockedActions(...).forSelf`）。無ければ `my` 視点で計算する。 */
  contBlockedSelf?: Set<string>;
}

/** ルリグデッキ除外コスト（`exileLrigFromLrigDeck`）を払えるか（§6.4 O-11・`PR-469`）。 */
function canPayExileLrigFromLrigDeck(eff: CardEffect, my: PlayerState, cardMap: Map<string, CardData>): boolean {
  const c = eff.cost?.exileLrigFromLrigDeck;
  if (!c) return true;
  const n = my.lrig_deck.filter(num => {
    const card = cardMap.get(getCardNum(num));
    if (!card) return false;
    if (!c.story) return true;
    return (card.CardClass ?? '').split(/[/／]/).map(x => x.trim()).includes(c.story);
  }).length;
  return n >= c.count;
}

/**
 * 指定ゾーンのシグニが**いま発動できる**【起】能力の一覧（空配列＝1つも撃てない）。
 * 効果の並びは `effectsMap` の定義順そのまま（呼び出し元が優先度を決める）。
 */
export function listActivatableSigniEffects(p: SigniActivateGateInput): CardEffect[] {
  const { my, op, zoneIndex, phase, isMyTurn, effectsMap, cardMap } = p;
  const stack = my.field.signi[zoneIndex];
  if (!stack || stack.length === 0) return [];
  const topNum = stack[stack.length - 1];
  // REMOVE_ABILITIES で能力を失っているシグニは【起】を発動できない（G085-E2 等）
  if (my.abilities_removed?.includes(topNum)) return [];
  const effects = effectsMap.get(topNum) ?? [];
  if (!effects.some(e => e.effectType === 'ACTIVATED')) return [];

  let powersCache = p.effectivePowers;
  const getPowers = () =>
    (powersCache ??= calcFieldPowers(my, op, isMyTurn, effectsMap, cardMap, phase));
  let blockedCache = p.contBlockedSelf;
  const getBlockedSelf = () =>
    (blockedCache ??= calcContinuousBlockedActions(my, op, isMyTurn, effectsMap, cardMap, getPowers()).forSelf);
  const isActionBlocked = (actionId: string) =>
    (my.blocked_actions?.some(a => a === actionId) ?? false) || getBlockedSelf().has(actionId);

  // PREVENT_INFECTED_SIGNI_ACTIVATE: 感染状態のシグニの起動能力をブロック
  const infectedBlocked = collectInfectedActivateBlockedSigni(my, op, cardMap, effectsMap, true);
  const isInfectedBlocked = infectedBlocked.includes(topNum);
  // RESTRICT_CHARMED_SIGNI_ACTIVATED: 相手フィールドにあれば、チャーム付きシグニの【起】能力を封じる
  const hasCharmInZone = (my.field.signi_charms?.[zoneIndex] ?? null) !== null;
  const isCharmActivateBlocked = hasCharmInZone && op.field.signi.some(s => {
    const top = s?.at(-1);
    return !!top && (effectsMap.get(top) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as StubAction).type === 'STUB' &&
      (eff.action as StubAction).id === 'RESTRICT_CHARMED_SIGNI_ACTIVATED'
    );
  });
  // down_self コストは、このシグニが既にダウンしていると支払えない
  const isAlreadyDown = my.field.signi_down?.[zoneIndex] ?? false;
  // discard コストは手札の枚数が足りないと支払えない
  const handCount = my.hand.length;
  // acceTrash コストは【アクセ】枚数が足りないと支払えない
  const acceCount = countAcce(my.field);
  // 【絆起】は発生源カード名との絆を獲得していなければ発動できない
  const kizunaOkHere = isKizunaActive(my, topNum, cardMap);

  return effects.filter(e =>
    e.effectType === 'ACTIVATED' &&
    (!e.kizunaIcon || kizunaOkHere) &&
    // メイン: timing未指定 or MAIN を含む。アタックフェイズ: ATTACK_ARTS を含む（《アタックフェイズアイコン》）。
    (phase === 'MAIN'
      ? (e.timing === undefined || e.timing.includes('MAIN'))
      : !!e.timing?.includes('ATTACK_ARTS')) &&
    !(e.cost?.acceTrash && acceCount < e.cost.acceTrash) &&
    // 🔴`costUnparsed`＝**原文のコストを表現できなかった**印（§6.4 O-11・続き532）。
    //   提示すると**コストを踏み倒して撃てる**ので、トリガー収集（`triggerCollect`）と同じく提示しない。
    !e.costUnparsed &&
    canPayExileLrigFromLrigDeck(e, my, cardMap) &&
    !(e.usageLimit === 'once_per_turn' && (my.actions_done ?? []).includes(e.effectId)) &&
    !(e.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === e.effectId).length >= 2) &&
    !(my.blocked_actions?.includes(e.effectId)) &&
    !(e.usageLimit === 'once_per_game' && my.game_actions_done?.includes(e.effectId)) &&
    !isActionBlocked('USE_ACT') &&
    !isInfectedBlocked &&
    !isCharmActivateBlocked &&
    !(e.cost?.down_self && isAlreadyDown) &&
    !(e.cost?.discard && handCount < e.cost.discard) &&
    // 🆕`handDiscardSigni`＝**中身の条件つき**手札捨てコスト（§5.3 `O-46`）。枚数だけでなく
    //   **色／＜クラス＞／レベルに合致する札**が必要数なければ支払えない（`WX21-043-E2` の＜毒牙＞等）。
    //   ⚠支払いUI（`SigniActivatedModal`）と**同じ判定関数**を使う＝写経すると片側だけ穴が空く。
    // 🆕§5.3 `O-108`＝「それぞれ名前の異なる」まで見る判定へ寄せた（`handDiscardSigniAffordable` の1本）。
    //   旧＝素の枚数比較だったので**同名4枚しか無くても提示**され、支払いも通っていた。
    !(e.cost?.handDiscardSigni && !handDiscardSigniAffordable(my.hand, e.cost.handDiscardSigni, cardMap)) &&
    !(e.cost?.underSelfTrash && !canPayUnderSelfTrash(
      my, zoneIndex, e.cost.underSelfTrash.count, cardMap,
      e.cost.underSelfTrash.filter, e.cost.underSelfTrash.selectionConstraint,
    )) &&
    // fieldTrash: 場からトラッシュ可能なシグニ（excludeSelf=自身を除く）が必要数いないと支払えない
    !(e.cost?.fieldTrash && [0, 1, 2].filter(zi => {
      const ftTop = my.field.signi[zi]?.at(-1);
      if (!ftTop) return false;
      if (e.cost!.fieldTrash!.excludeSelf && zi === zoneIndex) return false;
      return !e.cost!.fieldTrash!.filter || matchesFilter(cardMap.get(getCardNum(ftTop)), e.cost!.fieldTrash!.filter);
    }).length < e.cost.fieldTrash.count) &&
    // fieldBanish: バニッシュできるシグニ（excludeSelf=自身を除く）が必要数いないと支払えない（§5.3 `O-67`）。
    // ⚠行き先はエナゾーンだが**可否の軸は fieldTrash と同じ**（候補が必要数いるか）。
    !(e.cost?.fieldBanish && fieldTrashSelectableZones(e.cost.fieldBanish, my, cardMap, zoneIndex).length < e.cost.fieldBanish.count) &&
    // fieldTrashGroups: 各グループ（異クラス）を満たすシグニ構成が場にないと支払えない
    !(e.cost?.fieldTrashGroups && !fieldTrashGroupsAffordable(e.cost.fieldTrashGroups, my.field.signi, cardMap)) &&
    // beat_signi: 場にシグニがいないと【ビート】にできない（精密な不足は支払い時に判定）
    !(e.cost?.beat_signi && my.field.signi.filter(s => (s?.length ?? 0) > 0).length < 1) &&
    // fieldDown: アップ状態の該当シグニが必要数いないと支払えない
    !(e.cost?.fieldDown && [0, 1, 2].filter(zi => {
      const fdTop = my.field.signi[zi]?.at(-1);
      if (!fdTop) return false;
      if (my.field.signi_down?.[zi]) return false; // アップ状態のみ
      const { isUp: _iu, isDown: _id, ...fdCardFilter } = e.cost!.fieldDown!.filter ?? {};
      return matchesFilter(cardMap.get(getCardNum(fdTop)), fdCardFilter);
    }).length < e.cost.fieldDown.count) &&
    // lrigDown: アップ状態のルリグ（centerOnly / level 条件つき）が必要数いないと支払えない（タスク12(cviii)）
    !(e.cost?.lrigDown && payLrigDownCost(my, e.cost.lrigDown, cardMap) === null) &&
    (!e.activeCondition || checkActiveCondition(e.activeCondition, my, op, isMyTurn, cardMap, topNum, getPowers())) &&
    (!e.condition || evalUseCondition(e.condition, my, op, cardMap, topNum, phase, getPowers())),
  );
}
