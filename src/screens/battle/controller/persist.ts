// Stage3 骨組み①：battle_states への I/O を1点に集約する永続化チョークポイント。
//
// 現状 BattleScreen.tsx には `supabase.from('battle_states').update(update).eq('room_id', roomId)`
// が114箇所インライン散在している。純粋バトルコントローラ（reduceBattle）が計算した
// パッチ（Partial<BattleStateRow>）を、この1関数経由でのみ DB へ書き込む形へ寄せることで、
// 「状態遷移の計算（純粋）」と「永続化（副作用）」を分離する seam を作る。
//
// ⚠移行はインクリメンタル：既存のインライン書き込みを1箇所ずつ commit() へ置換していく。
//   置換は挙動同値（同じ update を同じ where で書くだけ）なので型検査で安全に進められる。
import { useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import type { BattleStateRow } from '../../../types';

/** supabase のエラー形（.message を保持）。 */
type DbError = { message: string } | null;

/** battle_states への読み書きを roomId 固定で集約するハンドル。 */
export interface BattlePersist {
  /** パッチを1回で書き込む（純粋 reducer の出力をそのまま渡す）。 */
  commit: (patch: Partial<BattleStateRow>) => PromiseLike<{ error: DbError }>;
  /** 最新の盤面を取得する（初期ロード・再同期用）。 */
  fetchState: () => PromiseLike<{ data: BattleStateRow | null; error: DbError }>;
  /** 対戦を破棄する（退出・リセット用）。 */
  remove: () => PromiseLike<{ error: DbError }>;
}

/** roomId に束ねた battle_states 永続化チョークポイント。 */
export function useBattlePersist(roomId: string): BattlePersist {
  const commit = useCallback(
    (patch: Partial<BattleStateRow>) =>
      supabase.from('battle_states').update(patch).eq('room_id', roomId),
    [roomId],
  );
  const fetchState = useCallback(
    () =>
      supabase
        .from('battle_states')
        .select('*')
        .eq('room_id', roomId)
        .single() as unknown as PromiseLike<{ data: BattleStateRow | null; error: unknown }>,
    [roomId],
  );
  const remove = useCallback(
    () => supabase.from('battle_states').delete().eq('room_id', roomId),
    [roomId],
  );
  return { commit, fetchState, remove };
}
