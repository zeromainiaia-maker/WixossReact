// 対戦開始前のセットアップ画面（じゃんけん・ルリグ配置・マリガン）＝BattleScreen から切り出した（2026-10-24）。
//   ⚠本文は画面にあったものをそのまま移した（props を同じ名前で受け取る）。CPU のセットアップ（`cpuSetupAction`）と
//   じゃんけんの自動解決（画面の useEffect）は画面側に残した＝ここは人間の画面と、人間が押したときの処理だけ。
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../supabaseClient';
import type { BattleStateRow, CardData, PlayerState } from '../../types';
import { C } from '../../components/BoardComponents';
import { JANKEN_LABEL, setupWrap, primaryBtn } from './uiConstants';
import { jankenWinner } from './battleUtils';
import { reduceBattle } from './controller/battleController';
import type { BattlePersist } from './controller/persist';
import type { useBattleSession } from './hooks/useBattleSession';
import { MulliganCard } from './MulliganCard';
import { applyMulligan } from './mulligan';
import { deckLrigSetupProblem, lrigRolesOfRow, DECK_LRIG_SETUP_PROBLEM_JA } from '../../utils/deckLrigSetup';

export interface SetupPhaseViewProps {
  bs: BattleStateRow;
  isHost: boolean;
  user: User;
  loading: boolean;
  setLoading: (v: boolean) => void;
  persist: Pick<BattlePersist, 'commit'>;
  roomId: string;
  transitioningRef: MutableRefObject<boolean>;
  /** じゃんけんの自動解決（画面の useEffect）が予約した手の組＝クリック経路が二重に解決しないために見る（`V-284`）。 */
  jankenResolveRef: MutableRefObject<string | null>;
  myDeckData: ReturnType<typeof useBattleSession>['myDeckData'];
  battleCardMap: Map<string, CardData>;
  battleCards: CardData[];
  mulliganSelected: Set<number>;
  setMulliganSelected: Dispatch<SetStateAction<Set<number>>>;
  showSetupLeaveConfirm: boolean;
  setShowSetupLeaveConfirm: (v: boolean) => void;
  handleSetupLeave: () => Promise<void>;
}

export function SetupPhaseView({ bs, isHost, user, loading, setLoading, persist, roomId, transitioningRef, jankenResolveRef, myDeckData, battleCardMap, battleCards, mulliganSelected, setMulliganSelected, showSetupLeaveConfirm, setShowSetupLeaveConfirm, handleSetupLeave }: SetupPhaseViewProps) {
const setupLeaveBtn = (
  <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 6 }}>
    <button
      onClick={() => window.location.reload()}
      style={{
        padding: '5px 12px', borderRadius: 6, border: '1px solid #444',
        backgroundColor: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer',
      }}
    >
      ↺
    </button>
    <button
      onClick={() => setShowSetupLeaveConfirm(true)}
      style={{
        padding: '5px 12px', borderRadius: 6, border: '1px solid #444',
        backgroundColor: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer',
      }}
    >
      終了
    </button>
  </div>
);

const setupLeaveConfirmModal = showSetupLeaveConfirm && (
  <div style={{
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999,
  }}>
    <div style={{
      backgroundColor: '#1a1a2e', border: '1px solid #444', borderRadius: 10,
      padding: '28px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16,
    }}>
      <p style={{ color: '#ccc', margin: 0, fontSize: 15 }}>ルームを削除して終了しますか？</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button onClick={handleSetupLeave}
          style={{ padding: '8px 28px', borderRadius: 6, border: 'none', backgroundColor: '#c0392b', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 'bold' }}>
          終了する
        </button>
        <button onClick={() => setShowSetupLeaveConfirm(false)}
          style={{ padding: '8px 28px', borderRadius: 6, border: '1px solid #444', backgroundColor: 'transparent', color: '#aaa', fontSize: 14, cursor: 'pointer' }}>
          キャンセル
        </button>
      </div>
    </div>
  </div>
);


  // ① じゃんけん
  if (bs.setup_phase === 'JAN_KEN') {
    const myJanken = isHost ? bs.host_janken : bs.guest_janken;
    const opJanken = isHost ? bs.guest_janken : bs.host_janken;

    const handleJanken = async (choice: string) => {
      if (loading || myJanken) return;
      setLoading(true);
      try {
        await persist.commit(reduceBattle(bs, { type: 'SUBMIT_JANKEN', isHost, pick: choice }));

        const { data: fresh } = await supabase
          .from('battle_states').select('host_janken, guest_janken')
          .eq('room_id', roomId).single();

        // ⚠🆕§5.1 `V-284`＝**上の effect が同じ解決を予約していたら二重に commit しない**
        //   （あいこの直後に CPU が選び直した手を、古いパッチで消してしまう）。
        if (fresh?.host_janken && fresh?.guest_janken && !transitioningRef.current && !jankenResolveRef.current) {
          transitioningRef.current = true;
          const winner = jankenWinner(fresh.host_janken, fresh.guest_janken, bs.host_id, bs.guest_id);
          const transUpdate = reduceBattle(bs, { type: 'RESOLVE_JANKEN', winnerId: winner });
          await new Promise(resolve => setTimeout(resolve, 1800));
          await persist.commit(transUpdate);
          transitioningRef.current = false;
        }
      } finally {
        setLoading(false);
      }
    };

    if (myJanken && opJanken) {
      const hostChoice = isHost ? myJanken : opJanken;
      const guestChoice = isHost ? opJanken : myJanken;
      const winner = jankenWinner(hostChoice, guestChoice, bs.host_id, bs.guest_id);
      const iWon = winner === user.id;
      return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>じゃんけん結果</h2>
          <p style={{ margin: 0 }}>あなた: {JANKEN_LABEL[myJanken]}   相手: {JANKEN_LABEL[opJanken]}</p>
          {winner ? (
            <>
              <p style={{ color: iWon ? C.success : C.danger, fontSize: 24, fontWeight: 'bold', margin: 0 }}>
                {iWon ? '勝ち！先攻です' : '負け…後攻です'}
              </p>
              <p style={{ color: C.textFaint, fontSize: 13, margin: '8px 0 0' }}>次のフェイズへ移行中...</p>
            </>
          ) : (
            <>
              <p style={{ color: C.aiko, fontSize: 28, fontWeight: 'bold', margin: 0 }}>あいこ！</p>
              <p style={{ color: C.textDim, fontSize: 14, margin: '8px 0 0' }}>もう一度選んでください...</p>
            </>
          )}
          {setupLeaveBtn}
        </div></>
      );
    }

    if (myJanken) return (
      <>{setupLeaveConfirmModal}<div style={setupWrap}>
        <h2 style={{ color: C.text, margin: 0 }}>じゃんけん</h2>
        <p style={{ color: C.success }}>あなた: {JANKEN_LABEL[myJanken]}</p>
        <p style={{ color: C.textFaint }}>相手の選択を待っています...</p>
        {setupLeaveBtn}
      </div></>
    );

    return (
      <>{setupLeaveConfirmModal}<div style={setupWrap}>
        <h2 style={{ color: C.text, margin: 0 }}>じゃんけんで先攻後攻を決めます</h2>
        <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>出す手を選んでください</p>
        <div style={{ display: 'flex', gap: 16 }}>
          {(['GU', 'CHOKI', 'PA'] as const).map(c => (
            <button key={c} onClick={() => handleJanken(c)} disabled={loading}
              style={{ ...primaryBtn, fontSize: 20, padding: '20px 28px' }}>
              {JANKEN_LABEL[c]}
            </button>
          ))}
        </div>
        {setupLeaveBtn}
      </div></>
    );
  }

  // ② ルリグ選択
  if (bs.setup_phase === 'LRIG_SELECT') {
    const mySelected = isHost ? bs.host_lrig_selected : bs.guest_lrig_selected;

    if (mySelected) return (
      <>{setupLeaveConfirmModal}<div style={setupWrap}>
        <h2 style={{ color: C.text, margin: 0 }}>ルリグ配置完了</h2>
        <p style={{ color: C.success }}>相手の準備を待っています...</p>
        <p style={{ color: C.textDim, fontSize: 13 }}>配置: {battleCardMap.get(mySelected)?.CardName ?? mySelected}</p>
        {setupLeaveBtn}
      </div></>
    );

    if (!myDeckData) return <div style={setupWrap}><p>デッキ読み込み中...</p></div>;

    // 🆕2026-09-17＝**選択画面は廃止**＝デッキ編成の指定どおりに自動で置く（`lrigAutoPlace` の effect）。
    //   ここに来るのは「置いている最中」か「デッキの指定が対戦に出せない形」だけ。
    const setupProblem = deckLrigSetupProblem({ ...lrigRolesOfRow(myDeckData), lrigDeck: myDeckData.lrig_deck }, battleCardMap);
    return (
      <>{setupLeaveConfirmModal}<div style={setupWrap}>
        {setupProblem ? (
          <>
            <h2 style={{ color: C.text, margin: 0 }}>ルリグを配置できません</h2>
            <p style={{ color: '#f44', margin: 0 }}>{DECK_LRIG_SETUP_PROBLEM_JA[setupProblem]}。デッキ編成の「ルリグ」タブで指定してください。</p>
          </>
        ) : (
          <h2 style={{ color: C.text, margin: 0 }}>ルリグを配置しています...</h2>
        )}
        {setupLeaveBtn}
      </div></>
    );
  }

  // ③ マリガン（カード画像で選択）
  if (bs.setup_phase === 'MULLIGAN') {
    const myState: PlayerState = isHost ? bs.host_state : bs.guest_state;
    const myDone = isHost ? bs.host_mulligan_done : bs.guest_mulligan_done;
    const iAmFirst = bs.first_player_id === user.id;

    if (myDone) return (
      <>{setupLeaveConfirmModal}<div style={setupWrap}>
        <h2 style={{ color: C.text, margin: 0 }}>マリガン完了</h2>
        <p style={{ color: iAmFirst ? C.accent : C.textAlt, fontWeight: 'bold', fontSize: 18, margin: 0 }}>
          {iAmFirst ? '先攻です' : '後攻です'}
        </p>
        <p style={{ color: C.textFaint }}>相手の確認を待っています...</p>
        {setupLeaveBtn}
      </div></>
    );

    const toggleCard = (i: number) => setMulliganSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });

    const handleConfirm = async () => {
      if (loading) return;
      setLoading(true);
      try {
        // §5.6 `C-4`＝引き直しとライフ設置は `applyMulligan` の1本（CPU も同じ関数を通る）。
        const newState: PlayerState = applyMulligan(myState, mulliganSelected);
        await persist.commit(reduceBattle(bs, { type: 'COMPLETE_MULLIGAN', isHost, state: newState }));

        // 最新状態を取得して両者が完了しているか確認
        const { data: fresh } = await supabase
          .from('battle_states')
          .select('host_mulligan_done, guest_mulligan_done, first_player_id')
          .eq('room_id', roomId)
          .single();

        if (fresh?.host_mulligan_done && fresh?.guest_mulligan_done) {
          // 両者完了 → 自分が直接 PLAYING へ遷移させる（両プレイヤーとも送信して確実に反映）
          await persist.commit(reduceBattle(bs, { type: 'START_PLAYING', activeUserId: fresh.first_player_id as string }));
        }
      } finally {
        setLoading(false);
      }
    };

    return (
      <>{setupLeaveConfirmModal}<div style={{ ...setupWrap, justifyContent: 'flex-start', paddingTop: 32, overflowY: 'auto' }}>
        <h2 style={{ color: C.text, margin: 0, flexShrink: 0 }}>マリガン</h2>
        <p style={{ color: iAmFirst ? C.accent : C.textAlt, fontWeight: 'bold', margin: 0, flexShrink: 0 }}>
          {iAmFirst ? '先攻' : '後攻'}
        </p>
        <p style={{ color: C.textDim, margin: 0, fontSize: 12, textAlign: 'center', flexShrink: 0 }}>
          タップで選択（戻す）/ 長押しで拡大
        </p>
        {/* カード画像グリッド */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', flexShrink: 0 }}>
          {myState.hand.map((cardNum, i) => (
            <MulliganCard
              key={i}
              cardNum={cardNum}
              cards={battleCards}
              selected={mulliganSelected.has(i)}
              onToggle={() => toggleCard(i)}
            />
          ))}
        </div>
        {mulliganSelected.size > 0 && (
          <p style={{ color: '#f44', fontSize: 12, margin: 0, flexShrink: 0 }}>
            {mulliganSelected.size}枚を戻して引き直します
          </p>
        )}
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          {mulliganSelected.size > 0 ? (
            <button onClick={handleConfirm} disabled={loading}
              style={{ ...primaryBtn, backgroundColor: C.dangerDark }}>
              {mulliganSelected.size}枚引き直す
            </button>
          ) : (
            <button onClick={handleConfirm} disabled={loading} style={primaryBtn}>
              このままでOK
            </button>
          )}
        </div>
        {setupLeaveBtn}
      </div></>
    );
  }
  return null;
}
