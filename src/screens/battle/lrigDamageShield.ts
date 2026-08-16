import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import { checkActiveCondition } from '../../engine/effectEngine';
import { hasActivePreventDamageWindow } from './battleUtils';

const baseCardNum = (id: string): string => id.split('#')[0];

/**
 * 「あなたは対戦相手の（レベルN以下の）ルリグによってダメージを受けない」の**唯一の判定点**
 * （§6.4 O-3 続き492）。
 *
 * 🔑**「回数無制限の防御」は消費型（バリア／`prevent_next_damage`／置換ミル）より先に判定する**＝
 * 後ろに置くと、無制限に防げる状況でも限りある資源が先に減る（従来 CONTINUOUS 版がここに居た）。
 *
 * ⚠🔴**走査軸はシグニだけでは足りない**＝従来の判定は `defender.field.signi` しか見ておらず、
 * **ルリグ本体／アシスト／キーに載った【常】が丸ごと無視**されていた
 * （`WXK03-001-E1`＝「あなたの手札が０枚であるかぎり、あなたはルリグによってダメージを受けない」は
 * ルリグ自身の【常】なので**一度も効かなかった**）。
 *
 * ⚠**レベル限定（`PREVENT_LOW_LEVEL_LRIG_DAMAGE`＝`WXK11-012-E2`「レベル２以下のルリグによって」）は
 * アタックしてきたルリグのレベルで判定する**＝限定を落とすと全ルリグのダメージを無効にする過剰効果になる。
 */
export function isLrigDamagePrevented(args: Parameters<typeof resolveLrigDamageShield>[0]): boolean {
  return resolveLrigDamageShield(args).prevented;
}

/**
 * 上と同じ判定に、**「1回防いだらこの能力を失う」宣言の effectId** を添えて返す
 * （§6.4 O-10・続き507＝`WXK01-002-E1`「代わりにダメージを受けず、ターン終了時まで、この能力を失う」）。
 *
 * ⚠**防いだ側は返ってきた `loseEffectId` を必ず `lost_ability_effect_ids_this_turn` へ書くこと**。
 *   書かないと同じターンに何度でも防ぐ＝原文が1回に絞った意味が消える（`PREVENT_LRIG_DAMAGE` の
 *   既定は「回数無制限」なので、書き忘れると**無限バリア**になる）。
 */
export function resolveLrigDamageShield(args: {
  /** ダメージを受ける側（防御側）。 */
  defender: PlayerState;
  /** アタックしている側。`activeCondition` の相手視点に使う。 */
  attacker: PlayerState;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  /** 実際にアタックしたルリグ（アシストを含む）。レベル限定の判定に使う。 */
  attackingLrigNum?: string;
}): { prevented: boolean; loseEffectId?: string } {
  const { defender, attacker, cardMap, effectsMap, attackingLrigNum } = args;
  // 期間つきウィンドウ（`PREVENT_DAMAGE{scope:'LRIG'}`）＝「このターン」「次のターンの間」
  // 「次のあなたのメインフェイズまで」を1本で表す。
  if (hasActivePreventDamageWindow(defender, 'LRIG')) return { prevented: true };
  const lostThisTurn = defender.lost_ability_effect_ids_this_turn ?? [];

  const attackerLevel = attackingLrigNum
    ? parseInt(cardMap.get(baseCardNum(attackingLrigNum))?.Level ?? '', 10)
    : NaN;

  for (const num of shieldSources(defender)) {
    for (const eff of (effectsMap.get(num) ?? effectsMap.get(baseCardNum(num)) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.action.type !== 'STUB') continue;
      const id = (eff.action as StubAction).id;
      if (id !== 'PREVENT_LRIG_DAMAGE' && id !== 'PREVENT_LOW_LEVEL_LRIG_DAMAGE') continue;
      // ⚠防御側は常に非ターンプレイヤー（ルリグアタックは相手のターン中）＝`isOwnerTurn=false`。
      if (!checkActiveCondition(eff.activeCondition, defender, attacker, false, cardMap, num)) continue;
      if (id === 'PREVENT_LOW_LEVEL_LRIG_DAMAGE') {
        // ⚠上限は宣言の `value` から読む（parser が落としていると全レベルに効く過剰効果になる）。
        const maxLevel = typeof (eff.action as StubAction).value === 'number'
          ? (eff.action as StubAction).value as number : undefined;
        if (maxLevel === undefined || isNaN(attackerLevel) || attackerLevel > maxLevel) continue;
      }
      return true;
    }
  }
  return false;
}

/** 【常】の宣言元になりうる自分の場のカード（シグニ／センタールリグ／アシスト／キー）。 */
function shieldSources(state: PlayerState): string[] {
  return [
    ...state.field.signi.flatMap(stack => (stack?.at(-1) ? [stack.at(-1)!] : [])),
    ...(state.field.lrig.at(-1) ? [state.field.lrig.at(-1)!] : []),
    ...(state.field.assist_lrig_l?.at(-1) ? [state.field.assist_lrig_l.at(-1)!] : []),
    ...(state.field.assist_lrig_r?.at(-1) ? [state.field.assist_lrig_r.at(-1)!] : []),
    ...(state.field.key_piece ? [state.field.key_piece] : []),
  ];
}
