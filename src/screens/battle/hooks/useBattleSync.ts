// 対戦の盤面（`battle_states` の1行）を DB と同期する層＝BattleScreen から切り出した（2026-10-24）。
//   持つもの＝盤面の state／書き込みの記録（`persist.commit` を包む）／Realtime の購読と前面復帰の張り直し／
//   通知の取りこぼしの見張り（セットアップ・自分の書き込み）。
//   ⚠CPU の見張り（`runCpuTurn` まわり）は CPU の起動と一体なので画面側に残した＝ここが返す ref を読む。
//   判定はすべて `cpuDriver.ts` の純関数（golden で固定）。ここは配線だけ。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../supabaseClient';
import type { BattleStateRow, PlayerState } from '../../../types';
import { useOnResume } from '../../../utils/resumeSync';
import { normalizeAcceSlots } from '../../../utils/acce';
import { useBattlePersist } from '../controller/persist';
import { lastCommitArrived, updatedAtKey, setupResyncDue, ownCommitResyncDue, fetchedRowIsNewer } from '../cpuDriver';

/**
 * 🔴**DB から来た行の `signi_acce` 旧形式（素の string）をここで一度だけ配列へ正す**（タスク12(cxxxiv)）。
 * `setBs` は「外部（fetch / Realtime）から状態が入ってくる唯一の入口」なので、ここを通せば
 * 以降の全消費地点（`acceCardsAt` を通らない生アクセスも含む）が配列だけを見る。
 * ⚠正規化が不要な行は**同一参照のまま返す**（毎 UPDATE で新オブジェクトを作ると再描画が増えるため）。
 */
export function normalizeBattleRow(row: BattleStateRow): BattleStateRow {
  let changed = false;
  const fix = (s: PlayerState): PlayerState => {
    const slots = s?.field?.signi_acce;
    if (!slots) return s;
    const next = normalizeAcceSlots(slots);
    if (next === slots) return s;
    changed = true;
    return { ...s, field: { ...s.field, signi_acce: next } };
  };
  const host = fix(row.host_state), guest = fix(row.guest_state);
  return changed ? { ...row, host_state: host, guest_state: guest } : row;
}

export function useBattleSync({ roomId, onRoomDeleted }: {
  roomId: string;
  /** 部屋（`rooms`）が消えた通知を受けたとき。 */
  onRoomDeleted: () => void;
}) {
  const [bs, setBsRaw] = useState<BattleStateRow | null>(null);
  const setBs = useCallback(
    (row: BattleStateRow | null) => setBsRaw(row ? normalizeBattleRow(row) : row), []);
  /** 非同期処理・タイマーから最新の盤面を読むための控え（毎レンダーで追従）。 */
  const bsRef = useRef(bs);
  bsRef.current = bs;
  const onRoomDeletedRef = useRef(onRoomDeleted);
  onRoomDeletedRef.current = onRoomDeleted;

  // Stage3 seam：battle_states 永続化チョークポイント（純粋 reduceBattle の出力を commit で書き込む）
  const persistRaw = useBattlePersist(roomId);
  // 🆕§5.1 `V-247`＝**処理中の書き込み数と、最後に書き込んだ行の `updated_at`**（CPU の二重実行を防ぐ＝`runCpuTurn` が見る）。
  //   ⚠書き込みはすべてここを通る＝人間の操作も含めて記録する（CPU の判定が人間の書き込みの通知も待つのは正しい）。
  const pendingCommitsRef = useRef(0);
  const lastCommitUpdatedAtRef = useRef('');
  const persist = useMemo(() => ({
    ...persistRaw,
    commit: async (patch: Parameters<typeof persistRaw.commit>[0]) => {
      pendingCommitsRef.current += 1;
      try {
        const res = await persistRaw.commit(patch);
        const ua = res.data?.[0]?.updated_at;
        if (ua && updatedAtKey(ua) > updatedAtKey(lastCommitUpdatedAtRef.current)) lastCommitUpdatedAtRef.current = ua;
        return res;
      } finally {
        pendingCommitsRef.current -= 1;
      }
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [persistRaw.commit, persistRaw.fetchState, persistRaw.remove]);
  /** 自分の書き込みが全部終わり、最後に書いた行の通知が手元の `bs` に届いているか（`cpuDriver.ts` `lastCommitArrived`）。 */
  const ownCommitsArrived = (row: BattleStateRow | null | undefined) => lastCommitArrived({
    pendingCommits: pendingCommitsRef.current, localUpdatedAt: row?.updated_at, lastCommitUpdatedAt: lastCommitUpdatedAtRef.current,
  });

  // 🆕2026-10-01（ユーザー要望）＝**アプリが前面に戻ったら DB から盤面を取り直し、リアルタイムの購読を張り直す**
  //   （`utils/resumeSync.ts`）。iPhone はホーム画面へ出るとページを止める＝裏にいる間の通知を取りこぼし、
  //   戻っても次の更新が来るまで古い盤面のままだった。⚠強制リロードはしない（ほかの画面の状態を消さない）。
  const [resumeTick, setResumeTick] = useState(0);
  useOnResume(() => {
    persist.fetchState().then(({ data }) => { if (data) setBs(data as BattleStateRow); });
    setResumeTick(t => t + 1);
  });

  useEffect(() => {
    // ⚠張り直しのたびに**別の名前**で作る＝同じ名前だと外した直後の古いチャンネルと取り違えうる。
    const channel = supabase
      .channel(`battle-${roomId}-${resumeTick}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'battle_states', filter: `room_id=eq.${roomId}`,
      }, (payload) => { setBs(payload.new as BattleStateRow); })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
      }, () => { onRoomDeletedRef.current(); })
      .subscribe((status) => {
        // 接続後に最新データを再取得（リロード時に Realtime が間に合わない場合の対策）
        if (status === 'SUBSCRIBED') {
          persist.fetchState()
            .then(({ data }) => { if (data) setBs(data as BattleStateRow); });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [roomId, resumeTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 通知の取りこぼしの見張り＝①セットアップ中に盤面が動かない（`setupResyncDue`）②自分の書き込みが画面に届かない（`ownCommitResyncDue`）
  //   ときに DB を読み直す（CPU 戦・PvP とも）。Realtime の起動し直しの途中の書き込みは通知されない（実測）。
  const setupLastChangeAtRef = useRef(Date.now());
  useEffect(() => { setupLastChangeAtRef.current = Date.now(); }, [bs?.updated_at]);
  useEffect(() => {
    const id = setInterval(async () => {
      const now = Date.now(), lastChangeAt = setupLastChangeAtRef.current;
      const setupDue = setupResyncDue({ globalPhase: bsRef.current?.global_phase, now, lastChangeAt });
      const ownDue = ownCommitResyncDue({
        pendingCommits: pendingCommitsRef.current, localUpdatedAt: bsRef.current?.updated_at,
        lastCommitUpdatedAt: lastCommitUpdatedAtRef.current, now, lastChangeAt,
      });
      if (!setupDue && !ownDue) return;
      setupLastChangeAtRef.current = now;   // 読み直しの連打を防ぐ
      const { data } = await persist.fetchState();
      if (data && fetchedRowIsNewer((data as BattleStateRow).updated_at, bsRef.current?.updated_at)) {
        console.warn(`[resync watchdog] ${ownDue ? '自分の書き込みが届かない' : 'セットアップが動かない'}: 盤面を DB から読み直して反映（${(data as BattleStateRow).global_phase}/${(data as BattleStateRow).setup_phase ?? (data as BattleStateRow).turn_phase}）`);
        setBs(data as BattleStateRow);
      }
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { bs, setBs, bsRef, persist, pendingCommitsRef, lastCommitUpdatedAtRef, ownCommitsArrived };
}
