import type { BattleStateRow, CardData, PlayerState, StackEntry } from '../../../types';
import { liveEffectsOf } from '../../../engine/triggerCollect';
import type { CardEffect } from '../../../types/effects';
import { calcFieldPowers } from '../../../engine/effectEngine';
import { evalUseCondition } from '../../../engine/effectExecutor';
import { grantedStoreWatchers } from '../../../engine/grantedStore';
import { mainPhaseGateOkFor } from '../../../engine/triggerCollect';
import { reserveGrantedAutoUsage } from '../grantedAuto';
import { generateUUID } from '../battleUtils';

/** 前回観測した盤面（エナの中身とシグニのパワー）。 */
export interface EnergyPowerSnapshot { energy: { host: string[]; guest: string[] }; powers: Map<string, number> }

/**
 * 🆕2026-10-21＝**「エナゾーンにカードが置かれたとき」（`ON_ENERGY_CHARGE`）／「パワーがN以上になったとき」（`ON_POWER_THRESHOLD`）**を、
 * 前回の盤面との差分で集める（旧 `BattleScreen` の見張りの中身をそのまま移した・React 非依存）。
 * 🔴なぜ移したか＝ヘッドレス（自己対戦・CPU観戦）には画面の見張りが無く、この2種類の【自】が**一度も発動しなかった**。
 * ⚠`prev` が無い（初回）なら何も集めない＝呼び出し側は `current` を次の `prev` にする。
 */
export function collectEnergyPowerTriggers(p: {
  bs: BattleStateRow; prev: EnergyPowerSnapshot | null;
  effectsMap: Map<string, CardEffect[]>; cardMap: Map<string, CardData>;
}): { entries: StackEntry[]; autoUsedByKey: Record<'host' | 'guest', string[]>; current: EnergyPowerSnapshot } {
  const { bs, effectsMap, cardMap } = p;
  const hostState = bs.host_state, guestState = bs.guest_state;
  const hostIsActive = bs.active_user_id === bs.host_id;
  // 各シグニを「その持ち主視点」で計算したパワー（ターン依存修正を正しく反映）
  const hostPowers  = calcFieldPowers(hostState, guestState, hostIsActive,  effectsMap, cardMap, bs.turn_phase);
  const guestPowers = calcFieldPowers(guestState, hostState, !hostIsActive, effectsMap, cardMap, bs.turn_phase);
  const curPowers = new Map<string, number>([...hostPowers, ...guestPowers]);
  const current: EnergyPowerSnapshot = { energy: { host: [...hostState.energy], guest: [...guestState.energy] }, powers: curPowers };
  const entries: StackEntry[] = [];
  const autoUsedByKey: Record<'host' | 'guest', string[]> = { host: [], guest: [] };
  if (!p.prev) return { entries, autoUsedByKey, current };
  const prevEnergy = p.prev.energy;
  const prevPowers = p.prev.powers;
  const sides: Array<{ key: 'host' | 'guest'; st: PlayerState; op: PlayerState; ownerId: string; prevE: string[] }> = [
    { key: 'host',  st: hostState,  op: guestState, ownerId: bs.host_id,  prevE: prevEnergy.host },
    { key: 'guest', st: guestState, op: hostState,  ownerId: bs.guest_id, prevE: prevEnergy.guest },
  ];
  for (const { key, st, op, ownerId, prevE } of sides) {
    const isOwnerActiveTurn = ownerId === bs.active_user_id;
    // ON_ENERGY_CHARGE: エナがちょうど1枚増えたとき（差分の新規カードが1枚）
    const addedToEnergy = st.energy.filter(n => !prevE.includes(n));
    // センタールリグの付与ストア（effectsMap 非搭載）の ON_ENERGY_CHARGE watcher（SPDi43-13-E2＝
    // 「ターン終了時まで、このルリグは『【自】あなたのエナゾーンにカードが置かれたとき…』を得る」）。
    // 下の走査は場のシグニしか見ないため、ルリグ host の付与能力は付与ストアから別途収集する。
    // 🔴《ターン1回/2回》の予約は**付与 watcher と印刷シグニの両方**で行う（タスク12(cxx)）。
    //   ⚠この useEffect は entries を積むだけで `actions_done` へ書き戻していなかったため、
    //     印刷シグニ側は**エナチャージのたびに撃てた**（ON_ENERGY_CHARGE 6効果／ON_POWER_THRESHOLD 3効果）。
    //     予約 ID は下の commit で `actions_done` へ書き戻す＝他コレクタと同じ規約。
    const ecLrigTop = st.field.lrig.at(-1);
    if (ecLrigTop && addedToEnergy.length === 1) {
      for (const w of grantedStoreWatchers(st, 'ON_ENERGY_CHARGE', ['self', 'any_ally', 'any'])) {
        const eff = w.effect;
        if (eff.triggerCondition?.movedSelf) continue;
        if (eff.triggerCondition?.byOwnEffect || eff.triggerCondition?.byOpponentEffect || eff.triggerCondition?.byEffect) continue;
        // 🆕`O-64`：「〈あなた〉のメインフェイズの間／以外で」＝この watcher は collector ではないので
        //   `mainPhaseGateOk` を通らない。**フェイズ語彙を1つも見ていなかった**ので素の版を直接呼ぶ。
        if (!mainPhaseGateOkFor(eff, bs.turn_phase, bs.active_user_id ?? undefined, ownerId)) continue;
        if (eff.condition?.type === 'IS_MY_TURN' && !isOwnerActiveTurn) continue;
        if (eff.condition && eff.condition.type !== 'IS_MY_TURN'
            && !evalUseCondition(eff.condition, st, op, cardMap, ecLrigTop, bs.turn_phase, curPowers)) continue;
        if (!reserveGrantedAutoUsage(st, eff, autoUsedByKey[key])) continue;
        entries.push({ id: generateUUID(), playerId: ownerId, cardNum: ecLrigTop, effectId: eff.effectId,
          label: `${cardMap.get(ecLrigTop)?.CardName ?? ecLrigTop} の【自】効果（エナチャージ時・付与能力）`, effect: eff });
      }
    }
    // ON_POWER_THRESHOLD / ON_ENERGY_CHARGE は場のシグニを走査
    for (let zi = 0; zi < st.field.signi.length; zi++) {
      const topNum = st.field.signi[zi]?.at(-1);
      if (!topNum) continue;
      for (const eff of liveEffectsOf(effectsMap, topNum, st)) {
        if (eff.effectType !== 'AUTO') continue;
        if (eff.timing?.includes('ON_ENERGY_CHARGE') && addedToEnergy.length === 1) {
          if (eff.triggerCondition?.movedSelf) continue;
          if (eff.triggerCondition?.byOwnEffect || eff.triggerCondition?.byOpponentEffect || eff.triggerCondition?.byEffect) continue;
          if (!mainPhaseGateOkFor(eff, bs.turn_phase, bs.active_user_id ?? undefined, ownerId)) continue;   // `O-64`
          // 「あなたのターンの間」= IS_MY_TURN（evalでは常にtrueのため、ここで自ターン判定）
          if (eff.condition?.type === 'IS_MY_TURN' && !isOwnerActiveTurn) continue;
          if (eff.condition && eff.condition.type !== 'IS_MY_TURN'
              && !evalUseCondition(eff.condition, st, op, cardMap, topNum, bs.turn_phase, curPowers)) continue;
          if (!reserveGrantedAutoUsage(st, eff, autoUsedByKey[key])) continue;   // タスク12(cxx)
          entries.push({ id: generateUUID(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
            label: `${cardMap.get(topNum)?.CardName ?? topNum} の【自】効果（エナチャージ時）`, effect: eff });
        }
        if (eff.timing?.includes('ON_POWER_THRESHOLD')) {
          // 🆕`O-64`：「あなたのメインフェイズの間、このシグニのパワーがN以上になったとき」
          //   （`WX18-077-E1`／`WX18-078-E1`）。この枝は `triggerCondition` を1つも見ていなかった＝
          //   相手ターン・相手メインフェイズでも発火していた。
          if (!mainPhaseGateOkFor(eff, bs.turn_phase, bs.active_user_id ?? undefined, ownerId)) continue;
          const threshold = eff.condition?.type === 'SELF_POWER_GTE' ? eff.condition.value : Infinity;
          const curP  = curPowers.get(topNum) ?? 0;
          const prevP = prevPowers.get(topNum);
          const wasBelow = prevP === undefined || prevP < threshold;
          if (curP >= threshold && wasBelow) {
            if (!reserveGrantedAutoUsage(st, eff, autoUsedByKey[key])) continue;   // タスク12(cxx)
            entries.push({ id: generateUUID(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
              label: `${cardMap.get(topNum)?.CardName ?? topNum} の【自】効果（パワー${threshold}到達時）`, effect: eff });
          }
        }
      }
    }
  }
  return { entries, autoUsedByKey, current };
}
