import type { CardData, PlayerState, StackEntry, TurnPhase } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import { evalUseCondition, getCardNum } from '../../../engine/effectExecutor';
import { fieldSigniStacks } from '../../../engine/cheerZoneView';
import { acceCardsAt } from '../../../utils/acce';
import { generateUUID } from '../battleUtils';

/**
 * 🆕2026-10-21＝**【アクセ】が付いた直後の【自】**（`ON_ACCE`＝アクセされたとき／`ON_ACCE_ATTACH`＝ルリグ・アクセ自身）を集める。
 * 旧 `BattleScreen.checkAndFireOnAcceTriggersForOwner` の中身をそのまま移した（React 非依存）。
 * 🔴なぜ移したか＝画面の見張り（`acce_just_done`）は**画面を見ている人の state かつその人のターン**しか処理せず、
 *   **CPU がアクセを付けたときの【自】は実機の CPU 戦でも一度も発動しなかった**（印も残り続けた）。CPU の手番処理からも同じ1本を呼ぶ。
 * @returns 積む項目と、《ターン1回》で使った効果 id（`actions_done` へ書き戻す）
 */
export function collectOnAcceTriggers(p: {
  state: PlayerState; op: PlayerState; acceHostCardNum: string; ownerId: string;
  effectsMap: Map<string, CardEffect[]>; cardMap: Map<string, CardData>; turnPhase: TurnPhase | null | undefined;
  effectivePowers?: Map<string, number>;
}): { entries: StackEntry[]; usedIds: string[] } {
  const { state, op, acceHostCardNum, ownerId, effectsMap, cardMap, effectivePowers } = p;
  const turnPhase = (p.turnPhase ?? 'MAIN') as string;
    const triggerEntries: StackEntry[] = [];
    // 🆕2026-08-31 続き748＝**いま付いた【アクセ】カード**（スタック末尾）。原文「**それが**レベル２以下の
    //   【アクセ】の場合」（`WXK05-065-E1`）を `TRIGGER_SOURCE_MATCHES` が読むためにトリガー元として運ぶ。
    // 🆕§5.3 `O-540`＝付け先がチアゾーンのシグニなら添字3（置き場は `signi_acce[3]`）。
    const acceHostZoneIdx = fieldSigniStacks(state).findIndex(sg => sg?.at(-1) === acceHostCardNum);
    const acceCardNum = acceHostZoneIdx >= 0 ? acceCardsAt(state.field, acceHostZoneIdx).at(-1) : undefined;
    const usedOncePerTurnIdsAcce: string[] = [];
    // 《ターン1回》《ターン2回》の使用制限（actions_done ＋ 本収集内で積んだ分の両方を数える）。
    const acceLimitOk = (eff: CardEffect): boolean => {
      const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
      if (max === Infinity) return true;
      const used = (state.actions_done ?? []).filter(id => id === eff.effectId).length
        + usedOncePerTurnIdsAcce.filter(id => id === eff.effectId).length;
      if (used >= max) return false;
      usedOncePerTurnIdsAcce.push(eff.effectId);
      return true;
    };
    for (const stack of fieldSigniStacks(state)) {   // 🆕`O-540`＝チアゾーンのシグニも【自】の持ち主
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO') continue;
        if (!eff.timing?.includes('ON_ACCE')) continue;
        const acceScope = eff.triggerScope ?? 'self';
        if (acceScope === 'self' && topNum !== acceHostCardNum) continue;
        if (eff.condition && !evalUseCondition(eff.condition, state, op, cardMap, topNum, turnPhase, effectivePowers)) continue;
        if (!acceLimitOk(eff)) continue;
        const card = cardMap.get(topNum);
        triggerEntries.push({
          id: generateUUID(),
          playerId: ownerId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${card?.CardName ?? topNum}【自】${eff.timing?.[0] ?? 'ON_ACCE'}`,
          effect: eff,
          // 🆕2026-08-31 続き748＝**付いた【アクセ】そのもの**をトリガー元として運ぶ。
          //   原文「**それが**レベル２以下の【アクセ】の場合」（`WXK05-065-E1`）は `TRIGGER_SOURCE_MATCHES` が読む。
          triggeringCardNum: acceCardNum,
        });
      }
    }
    // ホストシグニ自体のON_ACCE効果は上記でキャッチされる
    // また「あなたのシグニ１体がアクセされたとき」系のWX15-059等

    // ON_ACCE_ATTACH（ルリグ）: 「あなたのシグニ１体に【アクセ】が付いたとき」（WXK04-003 オーバークロック）
    const myLrigAcce = state.field.lrig.at(-1);
    if (myLrigAcce) {
      for (const eff of (effectsMap.get(myLrigAcce) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ACCE_ATTACH')) continue;
        if (eff.usageLimit === 'once_per_turn' &&
            ((state.actions_done?.includes(eff.effectId)) || usedOncePerTurnIdsAcce.includes(eff.effectId))) continue;
        if (eff.usageLimit === 'once_per_turn') usedOncePerTurnIdsAcce.push(eff.effectId);
        triggerEntries.push({
          id: generateUUID(),
          playerId: ownerId,
          cardNum: myLrigAcce,
          effectId: eff.effectId,
          label: `${cardMap.get(myLrigAcce)?.CardName ?? myLrigAcce}【自】アクセ装着時`,
          effect: eff,
        });
      }
    }
    // ON_ACCE_ATTACH（アクセカード自身）: 「このカードが【アクセ】としてシグニに付いたとき」（SPK01-11 ラズベリー）
    const hostZoneAcce = fieldSigniStacks(state).findIndex(s => s?.at(-1) === acceHostCardNum);   // 🆕`O-540`
    const attachedAcceNum = hostZoneAcce >= 0 ? acceCardsAt(state.field, hostZoneAcce).at(-1) : null;
    if (attachedAcceNum) {
      for (const eff of (effectsMap.get(attachedAcceNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ACCE_ATTACH')) continue;
        // host シグニのレベル/クラス条件（WXK05-041=Lv4以上／WX17-076-E2=Lv2以下／WX17-033-E4=＜調理＞）
        const acceTc = eff.triggerCondition;
        if (acceTc?.accedHostMinLevel || acceTc?.accedHostMaxLevel) {
          const hostLv = parseInt((cardMap.get(acceHostCardNum) ?? cardMap.get(getCardNum(acceHostCardNum)))?.Level ?? '0', 10);
          if (isNaN(hostLv)) continue;
          if (acceTc.accedHostMinLevel && hostLv < acceTc.accedHostMinLevel) continue;
          if (acceTc.accedHostMaxLevel && hostLv > acceTc.accedHostMaxLevel) continue;
        }
        if (acceTc?.accedHostStory) {
          const hostCls = cardMap.get(getCardNum(acceHostCardNum))?.CardClass ?? '';
          if (!hostCls.includes(acceTc.accedHostStory)) continue;
        }
        if (eff.usageLimit === 'once_per_turn' &&
            ((state.actions_done?.includes(eff.effectId)) || usedOncePerTurnIdsAcce.includes(eff.effectId))) continue;
        if (eff.usageLimit === 'once_per_turn') usedOncePerTurnIdsAcce.push(eff.effectId);
        triggerEntries.push({
          id: generateUUID(),
          playerId: ownerId,
          cardNum: attachedAcceNum,
          effectId: eff.effectId,
          label: `${cardMap.get(attachedAcceNum)?.CardName ?? attachedAcceNum}【自】アクセ装着時`,
          effect: eff,
        });
      }
    }
  return { entries: triggerEntries, usedIds: usedOncePerTurnIdsAcce };
}
