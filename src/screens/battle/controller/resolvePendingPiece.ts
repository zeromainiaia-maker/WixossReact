import type { PlayerState } from '../../../types';
import { getCardNum } from '../../../engine/execUtils';
import { closeTeamPieceCutinWindow } from '../turnScopedState';
import { type PlayerStateKey, reduceBattle } from './battleController';
import { queueCardEffects } from './queueCardEffects';
import type { PerformCtx } from './performCtx';

/**
 * ピース応答窓を閉じて、使われたピースを解決する（§6.4 O-10・続き518）。
 *
 * 🆕**§5.6 `C-12`（2026-09-22）＝`BattleScreen.resolvePendingPiece`（41行）を逐語で移設**した。
 * 🔴**なぜ移設したか**＝ここは**応答側のクライアントが回す**唯一の口で、画面の中に閉じていたため
 *   **ヘッドレス（`S-5`／自己対戦）では no-op**だった＝**CPU がピース窓に応答すると窓が閉じずに止まる**。
 *   `C-12` で CPU がこの窓に応答できるようにしたので、**同じ1本を画面とヘッドレスの両方から呼ぶ**。
 *
 * ⚠**窓フラグは必ずここで落とす**（残すと「カットイン専用ピースが通常タイミングで撃てる」過剰実行に戻る）。
 * ⚠`countered` のときは**解決せずゲームから除外**する（原文「打ち消されたピースはゲームから除外される」）。
 * ⚠使う側の state は既に支払い済みで DB にある＝ここでは**現在の `ctx.bs` から読み直す**（再徴収しない）。
 */
export const resolvePendingPiece = async (c: PerformCtx): Promise<void> => {
  // ── 注入された材料を**画面と同じ名前**で取り出す（下の本体は画面から逐語で移設＝名前を変えない）──
  const { bs, cardMap: battleCardMap } = c;
  const persist = { commit: c.io.commit };
  const appendBattleLogs = c.io.appendLogs;

  const ps = bs.pending_spell;
  if (!ps || ps.kind !== 'piece') return;
  const casterIsHost = ps.caster_id === bs.host_id;
  const casterKey: PlayerStateKey = casterIsHost ? 'host_state' : 'guest_state';
  const oppKey: PlayerStateKey = casterIsHost ? 'guest_state' : 'host_state';
  const casterState = casterIsHost ? bs.host_state : bs.guest_state;
  const oppState = casterIsHost ? bs.guest_state : bs.host_state;
  const pieceName = battleCardMap.get(getCardNum(ps.card_num))?.CardName ?? ps.card_num;
  // 応答側の窓フラグを落とす（＝この1点が「窓を閉じる」の定義）。
  const oppClosed: PlayerState = closeTeamPieceCutinWindow(oppState);
  // 打ち消されたか＝`COUNTER_TEAM_PIECE_AND_EXILE` が使った側に立てたフラグ（⚠読んだら落とす）。
  if (casterState.piece_use_countered) {
    // 打ち消し＝ルリグトラッシュへ置いた自分自身を**除外**へ移す。
    const casterExiled: PlayerState = {
      ...casterState,
      piece_use_countered: undefined,
      lrig_trash: casterState.lrig_trash.filter(n => n !== ps.card_num),
      excluded: [...(casterState.excluded ?? []), ps.card_num],
    };
    appendBattleLogs([`${pieceName}の効果は打ち消され、ゲームから除外された`]);
    await persist.commit(reduceBattle(bs, {
      type: 'FINISH_SPELL', casterKey, casterState: casterExiled,
      other: { key: oppKey, state: oppClosed },
    }));
    return;
  }
  // パス＝通常どおり解決する（ピースは AUTO/ACTIVATED を積む＝`executeArts` のピース枝と同じ形）。
  await persist.commit(reduceBattle(bs, {
    type: 'FINISH_SPELL', casterKey, casterState,
    other: { key: oppKey, state: oppClosed },
  }));
  // ⚠**効果の持ち主は「ピースを使った側」**＝応答側のクライアントから解決するので `owner` を明示する
  //   （省略すると自分の state へ書いてしまう。スペル側の `handleCutinPass` が caster を跨ぐのと同じ形）。
  await queueCardEffects(ps.card_num, ['AUTO', 'ACTIVATED'],
    ['ON_PLAY', 'MAIN', 'ATTACK', 'SPELL_CUTIN'],
    casterState, oppClosed, { key: oppKey, state: oppClosed }, 1, [],
    { id: ps.caster_id, key: casterKey }, c);
};
