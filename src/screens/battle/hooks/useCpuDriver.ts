// CPU 戦の CPU の起動（セットアップ・ターン）と見張り＝BattleScreen から切り出した（2026-10-24）。
//   CPU が何をするか（`cpuSetupAction` / `cpuTurnAction`）は画面側で組んで `cpuSetupRef` / `cpuTurnRef` に入れる＝
//   ここは「いつ起動するか・重ねないか・止まったら読み直すか」だけを持つ。判定は `cpuDriver.ts` の純関数（golden で固定）。
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { BattleStateRow } from '../../../types';
import type { BattlePersist } from '../controller/persist';
import { CPU_ACTION_DELAY } from '../battleUtils';
import { cpuBattleKey, lastCommitArrived, cpuShouldAct, cpuWaitingForHuman, cpuWatchdogShouldCheck, sameBattleForCpu } from '../cpuDriver';
import { normalizeBattleRow } from './useBattleSync';

export function useCpuDriver({ bs, bsRef, setBs, persist, isCpuBattle, cpuDeckData, pendingCommitsRef, lastCommitUpdatedAtRef }: {
  bs: BattleStateRow | null;
  bsRef: MutableRefObject<BattleStateRow | null>;
  setBs: (row: BattleStateRow | null) => void;
  persist: Pick<BattlePersist, 'fetchState'>;
  isCpuBattle: boolean;
  /** CPU のデッキ（読み込み済みかだけを見る）。 */
  cpuDeckData: object | null;
  pendingCommitsRef: MutableRefObject<number>;
  lastCommitUpdatedAtRef: MutableRefObject<string>;
}) {
  const cpuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cpuTurnRef                = useRef<(() => Promise<void>) | null>(null); // CPU自動行動
  const cpuSetupRef               = useRef<(() => Promise<void>) | null>(null); // CPUセットアップ自動行動

  // ── CPU 対戦：セットアップ自動行動 ──────────────────────────
  // 🔴🆕2026-10-23（ユーザー報告＝「バージョンアップ後の初回だけ、じゃんけんが『相手の選択を待っています』で止まる」）
  //   ＝CPU が手を出す機会は**盤面を読んだ直後の1回だけ**だった＝その書き込みが届かない／通知を取りこぼすと
  //   （キャッシュが空で接続の立ち上がりが遅い初回）、人間が手を出しても CPU は出し直さず永久に待つ。
  //   ⇒ **人間の手（`host_janken`）が入ったら、CPU の手がまだ見えていなければ出し直す**（依存に足した）。
  //   出し直しは同じ欄（`guest_janken`）の上書きなので、DB に既に手があっても害は無い（通知が来て画面が進む）。
  useEffect(() => {
    if (!bs || !isCpuBattle || bs.global_phase !== 'SETUP') return;
    if (bs.setup_phase === 'JAN_KEN'     && bs.guest_janken)        return;
    if (bs.setup_phase === 'LRIG_SELECT' && bs.guest_lrig_selected) return;
    if (bs.setup_phase === 'MULLIGAN'    && bs.guest_mulligan_done) return;
    if (bs.setup_phase === 'LRIG_SELECT' && !cpuDeckData)           return;
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    cpuTimerRef.current = setTimeout(() => { cpuSetupRef.current?.(); }, CPU_ACTION_DELAY);
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
  }, [isCpuBattle, bs?.setup_phase, bs?.host_janken, bs?.guest_janken, bs?.guest_lrig_selected, bs?.guest_mulligan_done, cpuDeckData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CPU 対戦：ターン自動行動 ──────────────────────────────────
  // 🔴🆕§5.1 `V-247`（2026-09-17）＝**CPU の起動を3点で守る**（判定は `cpuDriver.ts`）。
  //   ①**依存は盤面の更新そのもの（`bs`）**＝旧実装は依存を手で選んでいた（ルリグのトップ・行動履歴の長さ …）。
  //     選ばれていない値だけを動かす行動（CPU のライズ＝手札と場／アシストグロウ＝アシストの枠／`cpu_used_card_nums_this_turn`）の後は
  //     **依存が動かず二度と起動しない**＝永久停止（過去にも `v78CpuGrowsButSkipsOnPlayWithoutCoin` で同じ形を1本ずつ足していた）。
  //   ②**実行中は重ねない**＝ENERGY のように「書く → 900ms 待つ → 次を書く」行動は、待っている間に1段目の通知で再起動し、
  //     **古い盤面で同じ分岐をもう1回**走らせうる（GROW への遷移・開始時トリガーの二重収集）。
  //   ③**止まったら DB を読み直す**（見張り）＝Realtime の取りこぼし／行動中に届いた通知の破棄で止まった盤面を、
  //     ローカルと DB が違えば反映・同じなら再実行で再開する。⚠**読み直さずに再実行しない**（古い盤面で二重に動く）。
  const cpuRunningRef = useRef(false);
  const cpuDroppedRef = useRef(false);
  /** 通知待ちで起動を捨てた＝**盤面の中身が変わらない更新**が届いたときにも起動し直す（鍵が動かないので通常の起動が来ない）。 */
  const cpuWaitingEchoRef = useRef(false);
  const cpuLastBsChangeAtRef = useRef(Date.now());
  const cpuLastRunEndAtRef = useRef(0);
  const cpuResyncRef = useRef<((reason: string) => Promise<void>) | null>(null);
  // ⚠依存は**ログを除いた盤面の中身**（`cpuBattleKey`）＝ログの追記だけでタイマーをリセットしない。
  const cpuKey = useMemo(() => cpuBattleKey(bs), [bs]);
  useEffect(() => { cpuLastBsChangeAtRef.current = Date.now(); }, [cpuKey]);
  const runCpuTurn = useCallback(async (force = false) => {
    if (cpuRunningRef.current) { cpuDroppedRef.current = true; return; }
    // 🔴**最後の書き込みの通知がまだ届いていない盤面では走らない**（`force`＝見張りが DB と照合済みのときだけ免除）。
    //   1回の実行が「シグニ配置を書く → 待つ → 使用済みの印を書く → アシストグロウを書く」と続くと、
    //   先の書き込みの通知で次の実行が始まり、**後の書き込みが届いていない盤面で同じアシストグロウをもう一度選んでいた**
    //   （機構デッキの通し対戦で3戦とも再現＝「[CPU] アシストグロウ」のログが2行続いた）。
    //   届けば盤面の鍵が変わって起動が積まれ直すので、ここで捨ててよい（届かなければ見張りが読み直す）。
    if (!force && !lastCommitArrived({
      pendingCommits: pendingCommitsRef.current, localUpdatedAt: bsRef.current?.updated_at, lastCommitUpdatedAt: lastCommitUpdatedAtRef.current,
    })) { cpuWaitingEchoRef.current = true; return; }
    cpuRunningRef.current = true;
    cpuDroppedRef.current = false;
    try {
      await cpuTurnRef.current?.();
    } catch (e) {
      console.error('[CPU] 行動中に例外', e);
    } finally {
      cpuRunningRef.current = false;
      cpuLastRunEndAtRef.current = Date.now();
      // 実行中に届いた起動を捨てた＝その通知が「最後の書き込みの通知」だと、もう起動が来ない。読み直して確かめる。
      if (cpuDroppedRef.current) {
        cpuDroppedRef.current = false;
        setTimeout(() => { void cpuResyncRef.current?.('実行中の起動を破棄'); }, CPU_ACTION_DELAY * 2);
      }
    }
  }, [bsRef, pendingCommitsRef, lastCommitUpdatedAtRef]);   // ref は不変＝依存に足しても再生成しない
  // 通知待ちで起動を捨てた後、盤面の中身が変わらない更新（ログ追記など）で届いた場合も起動し直す。
  useEffect(() => {
    if (!cpuWaitingEchoRef.current || !isCpuBattle || !cpuShouldAct(bs)) return;
    if (!lastCommitArrived({ pendingCommits: pendingCommitsRef.current, localUpdatedAt: bs?.updated_at, lastCommitUpdatedAt: lastCommitUpdatedAtRef.current })) return;
    cpuWaitingEchoRef.current = false;
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    cpuTimerRef.current = setTimeout(() => { void runCpuTurn(); }, CPU_ACTION_DELAY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs, isCpuBattle, runCpuTurn]);
  cpuResyncRef.current = async (reason: string) => {
    if (cpuRunningRef.current) return;
    const { data } = await persist.fetchState();
    const local = bsRef.current;
    if (!data || !local) return;
    const fresh = normalizeBattleRow(data as BattleStateRow);
    if (!sameBattleForCpu(local, fresh)) {
      console.warn(`[CPU watchdog] ${reason}: 盤面を DB から読み直して反映（phase=${fresh.turn_phase}）`);
      setBs(fresh);
      return;
    }
    if (!cpuShouldAct(fresh) || cpuWaitingForHuman(fresh)) return;
    console.warn(`[CPU watchdog] ${reason}: 盤面が動かないので CPU を再実行（phase=${fresh.turn_phase} turn=${fresh.turn_count}）`);
    void runCpuTurn(true);
  };
  useEffect(() => {
    if (!isCpuBattle || !cpuShouldAct(bs)) return;
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    cpuTimerRef.current = setTimeout(() => { void runCpuTurn(); }, CPU_ACTION_DELAY);
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCpuBattle, cpuKey, runCpuTurn]);
  // 見張り（2秒ごと）。⚠人間の応答待ち（`cpuWaitingForHuman`）では**再実行しない**（`cpuResyncRef` が DB の行で判定する）。
  // 🔴🆕2026-09-20＝**応答待ちでも読み直しだけはする**。旧＝応答待ちの盤面では見張りそのものを止めていた＝
  //   人間が【ガードしない】を押した後の通知（クラッシュ→チェックゾーン）を取りこぼすと、画面は「ルリグに攻撃された！」のまま
  //   **ライフバースト確認を覆い続け、二度と DB を読まない**（実機 `verifyFullMatch.mjs cpu` の T2 で手詰まり＝DB はライフ5・画面は6）。
  useEffect(() => {
    if (!isCpuBattle) return;
    const id = setInterval(() => {
      const cur = bsRef.current;
      if (!cpuWatchdogShouldCheck({
        shouldAct: cpuShouldAct(cur),
        running: cpuRunningRef.current, now: Date.now(),
        lastBsChangeAt: cpuLastBsChangeAtRef.current, lastRunEndAt: cpuLastRunEndAtRef.current,
      })) return;
      cpuLastBsChangeAtRef.current = Date.now();   // 読み直しの連打を防ぐ
      void cpuResyncRef.current?.('盤面が一定時間動かない');
    }, 2000);
    return () => clearInterval(id);
  }, [isCpuBattle, bsRef]);

  return { cpuTurnRef, cpuSetupRef, cpuRunningRef };
}
