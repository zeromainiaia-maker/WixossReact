import { deployCountCap } from '../../../engine/deployLimit';
import type { ExecCtx } from '../../../engine/effectExecutor';
import { collectLifeCrashPreventions } from '../../../engine/lifeCrashGate';
import { collectGrantedFromUnderSigni } from '../../../engine/effectEngine';
import { getCardNum } from '../../../engine/effectExecutor';
import { collectSuppressedSigniTriggerNums, type TrigCtx } from '../../../engine/triggerCollect';
import type { BattleStateRow, CardData, PlayerState, TurnPhase } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import { generateUUID, InstanceMap } from '../battleUtils';

/**
 * 🆕**効果解決の「材料」を画面なしで作る2本**（§5.7 `S-5c` の下ごしらえ・2026-09-18）。
 *
 * ■ なぜ要るか＝`stackResolve.ts`／`boardDiffTriggers.ts` は純関数化したが、その `deps` に
 *   **画面のクロージャ**（`mkTrigCtx`／`fillDeployCaps`）が残っていた＝ヘッドレス（`S-5`）から呼ぶには
 *   `BattleScreen` を描かないと材料が作れない、という逆転が残っていた。
 * ⚠**中身は `BattleScreen` から逐語で移設**（引数も順序も変えていない）＝人間の対戦経路も同じ関数を通る。
 */

/** `triggerCollect` へ渡す文脈（旧 `BattleScreen.mkTrigCtx`）。 */
export function makeTrigCtx(p: {
  bs: BattleStateRow;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  effectivePowers: Map<string, number>;
  /** この client のプレイヤーID。 */
  userId: string;
}): TrigCtx {
  const { bs } = p;
  return {
    hostId: bs.host_id, guestId: bs.guest_id, meId: p.userId, activeUserId: bs.active_user_id ?? null,
    turnPhase: bs.turn_phase, effectsMap: p.effectsMap, cardMap: p.cardMap,
    effectivePowers: p.effectivePowers, genId: generateUUID,
    suppressedSigniTriggerNums: collectSuppressedSigniTriggerNums(bs.host_state, bs.guest_state),
  };
}

/**
 * `ExecCtx` へ**配置数制限**と**ライフクラッシュ防止**の宣言を埋める関数を作る（旧 `BattleScreen.fillDeployCaps`）。
 * 🔴どちらも**盤面の走査が要る宣言**なので engine 側に置けない＝埋め忘れると当該カードが丸ごと無効になる
 *   （§5.3 `O-66`＝`WX19-046-E2` / `WD13-010-E1`①）。⚠`isOwnerTurn` を決めてから呼ぶこと。
 */
export function makeFillDeployCaps(p: {
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
}): (c: ExecCtx) => ExecCtx {
  const { cardMap: battleCardMap, effectsMap } = p;
  return (c: ExecCtx): ExecCtx => {
    c.deployCountCapSelf = deployCountCap({
      placingState: c.ownerState, opponentState: c.otherState,
      cardMap: battleCardMap, effectsMap, isPlacingOwnerTurn: c.isOwnerTurn,
    });
    c.deployCountCapOpponent = deployCountCap({
      placingState: c.otherState, opponentState: c.ownerState,
      cardMap: battleCardMap, effectsMap,
      isPlacingOwnerTurn: c.isOwnerTurn === undefined ? undefined : !c.isOwnerTurn,
    });
    c.lifeCrashPreventionsSelf = collectLifeCrashPreventions(
      c.ownerState, c.otherState, c.isOwnerTurn ?? false, battleCardMap, effectsMap);
    c.lifeCrashPreventionsOpponent = collectLifeCrashPreventions(
      c.otherState, c.ownerState, c.isOwnerTurn === undefined ? false : !c.isOwnerTurn, battleCardMap, effectsMap);
    return c;
  };
}

/**
 * **遷移先フェイズを基準にした `TrigCtx`**（旧 `BattleScreen.mkTrigCtxForPhase`・§5.3 `O-72`・2026-09-18 に逐語で移設）。
 * 🔴`effectsMap` は遷移「前」のフェイズで組まれている＝`DURING_*` 限定の下カード付与だけ遷移先で組み直す。
 */
export function makeTrigCtxForPhase(p: {
  bs: BattleStateRow;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  trigCtx: () => TrigCtx;
}) {
  const { bs, effectsMap, cardMap: battleCardMap } = p;
  const mkTrigCtx = p.trigCtx;
  return (phase: TurnPhase, myS: PlayerState, opS: PlayerState, myIsActive: boolean): TrigCtx => {
    const base = mkTrigCtx();
    if (phase === bs.turn_phase) return base;
    const augMap = new InstanceMap<CardEffect[]>(effectsMap);
    const merged = [
      ...collectGrantedFromUnderSigni(myS, opS, myIsActive, augMap, battleCardMap, phase),
      ...collectGrantedFromUnderSigni(opS, myS, !myIsActive, augMap, battleCardMap, phase),
    ];
    for (const [num, extra] of merged) {
      const cur = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
      const seen = new Set(cur.map(e => e.effectId));
      const add = extra.filter(e => !seen.has(e.effectId));
      if (add.length > 0) augMap.set(num, [...cur, ...add]);
    }
    return { ...base, turnPhase: phase, effectsMap: augMap };
  };
}
