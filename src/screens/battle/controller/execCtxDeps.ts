import { deployCountCap } from '../../../engine/deployLimit';
import type { ExecCtx } from '../../../engine/effectExecutor';
import { collectLifeCrashPreventions } from '../../../engine/lifeCrashGate';
import { collectSuppressedSigniTriggerNums, type TrigCtx } from '../../../engine/triggerCollect';
import type { BattleStateRow, CardData } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import { generateUUID } from '../battleUtils';

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
