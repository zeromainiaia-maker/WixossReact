// 対戦終了確認モーダル。BattleScreen.tsx から Stage 1 で抽出。
//
// 🆕🔴**§5.6 `C-0`（2026-09-16）＝ここに「バグを報告」を同居させる。**
//   🔑**なぜここか**＝`SystemOverlays` の終了ボタン（`zIndex 9998`・`document.body` への portal・
//     コメント「エラーで画面が固まっても操作できる」）から開くこのダイアログは `zIndex 9999` で、
//     **他のモーダル（4000台）より上**。**いちばん拾いたいのは「モーダルが出たまま押せない」型**なので、
//     報告導線はその性質を持つ場所に置かないと**肝心なときに使えない**。新しくボタンを足すと、
//     その性質をもう一度作り直してもう一度壊すことになる。
//   🔑**報告しても対戦は続く**＝終了ダイアログに同居させると「報告＝終了」になってしまい、
//     「変だったけど続けられる」型が報告されなくなる（＋赤い「終了する」の誤爆も招く）。
import { useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import { BUG_TAGS, buildBugReport, type BugTagId } from '../bugReport';
import { supabase } from '../../../supabaseClient';
import { BUILD_ID } from '../../../version';
import type { BattleModalCtx } from './types';

interface EndConfirmModalProps {
  ctx: BattleModalCtx;
  showEndConfirm: boolean;
  setShowEndConfirm: Dispatch<SetStateAction<boolean>>;
  handleEnd: () => void;
}

type View = 'confirm' | 'report' | 'sent';

export function EndConfirmModal(p: EndConfirmModalProps) {
  const { loading, bs, user } = p.ctx;
  const { showEndConfirm, setShowEndConfirm, handleEnd } = p;
  const [view, setView] = useState<View>('confirm');
  const [tag, setTag] = useState<BugTagId | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const close = () => {
    setShowEndConfirm(false);
    // ⚠**閉じたら必ず初期状態へ戻す**＝戻さないと次に開いたとき前回の入力が残り、
    //   「別の場面の報告に前のコメントが付く」事故になる。
    setView('confirm'); setTag(null); setComment(''); setSendError(null);
  };

  const send = async () => {
    if (!tag || sending) return;
    setSending(true); setSendError(null);
    const row = buildBugReport({ bs, myUserId: user.id, tag, comment, appVersion: BUILD_ID });
    const { error } = await supabase.from('bug_reports').insert([row]);
    setSending(false);
    // 🔴**失敗を黙って飲まない**＝送れていないのに送れたと見せると、報告が静かに消える。
    if (error) { setSendError(error.message); return; }
    setView('sent');
  };

  const btn = (extra: Record<string, string | number>) => ({
    padding: '10px 0', borderRadius: 8, fontSize: 14, cursor: 'pointer',
    border: C.borderUI, backgroundColor: 'transparent', color: C.textDim, ...extra,
  });

  return (
    <>
      {showEndConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(92vw, 340px)', maxHeight: '86vh', overflowY: 'auto',
            textAlign: 'center',
          }}>
            {view === 'confirm' && (<>
              <p style={{ color: C.text, fontSize: 16, fontWeight: 'bold', margin: '0 0 8px' }}>
                対戦を終了しますか？
              </p>
              <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 18px' }}>
                ルームが削除され、対戦データは失われます
              </p>
              {/* 🔑報告は単独行・終了系ボタンから離す（誤爆防止）。 */}
              <button
                data-testid="bugreport-open"
                onClick={() => setView('report')}
                style={{ ...btn({ width: '100%', marginBottom: 18, borderColor: '#3a6ea5', color: '#9ec5ef' }) }}
              >
                🐛 バグを報告（対戦は続きます）
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={close} style={btn({ flex: 1 })}>キャンセル</button>
                <button
                  onClick={handleEnd}
                  disabled={loading}
                  style={btn({
                    flex: 1, border: 'none', backgroundColor: loading ? C.disabled : C.dangerEnd,
                    color: C.text, fontWeight: 'bold', cursor: loading ? 'default' : 'pointer',
                  })}
                >
                  {loading ? '削除中...' : '終了する'}
                </button>
              </div>
            </>)}

            {view === 'report' && (<>
              <p style={{ color: C.text, fontSize: 15, fontWeight: 'bold', margin: '0 0 4px' }}>
                何が変でしたか？
              </p>
              <p style={{ color: C.textDimmer, fontSize: 11, margin: '0 0 14px' }}>
                いまの盤面とログが一緒に送られます
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {BUG_TAGS.map(t => (
                  <button
                    key={t.id}
                    data-testid={`bugreport-tag-${t.id}`}
                    onClick={() => setTag(t.id)}
                    style={btn({
                      width: '100%', fontSize: 13,
                      borderColor: tag === t.id ? '#4caf50' : '#333',
                      color: tag === t.id ? '#fff' : C.textDim,
                      backgroundColor: tag === t.id ? 'rgba(76,175,80,0.14)' : 'transparent',
                    })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* ⚠コメントは**任意**＝スマホで文章を打たせると報告されなくなる。 */}
              <input
                data-testid="bugreport-comment"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="一言（任意）"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '9px 10px', marginBottom: 14,
                  borderRadius: 8, border: C.borderUI, backgroundColor: '#15151f', color: C.text, fontSize: 13,
                }}
              />
              {sendError && (
                <p style={{ color: '#ff6b6b', fontSize: 12, margin: '0 0 10px', wordBreak: 'break-all' }}>
                  送信に失敗しました: {sendError}
                </p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setView('confirm')} style={btn({ flex: 1 })}>戻る</button>
                <button
                  data-testid="bugreport-send"
                  onClick={send}
                  disabled={!tag || sending}
                  style={btn({
                    flex: 1, border: 'none',
                    backgroundColor: (!tag || sending) ? C.disabled : C.success,
                    color: C.text, fontWeight: 'bold', cursor: (!tag || sending) ? 'default' : 'pointer',
                  })}
                >
                  {sending ? '送信中...' : '送信'}
                </button>
              </div>
            </>)}

            {view === 'sent' && (<>
              <p style={{ color: C.text, fontSize: 16, fontWeight: 'bold', margin: '0 0 8px' }}>
                報告しました
              </p>
              <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 18px' }}>
                ターン{bs.turn_count} / {bs.turn_phase} の盤面を保存しました
              </p>
              <button
                data-testid="bugreport-back-to-game"
                onClick={close}
                style={btn({ width: '100%', border: 'none', backgroundColor: C.success, color: C.text, fontWeight: 'bold' })}
              >
                対戦に戻る
              </button>
            </>)}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
