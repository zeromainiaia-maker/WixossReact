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
// 🆕2026-09-22＝**CPU観戦（`SpectateScreen`）も同じダイアログを使う**＝本体を `EndReportDialog` に出した
//   （対戦の画面は `EndConfirmModal` がそれを包むだけ）。観戦は盤面の行が DB に無いので、
//   報告の行は呼び出し側が組む（`buildReport`）。
import { useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import { BUG_TAGS, buildBugReport, type BugReportRow, type BugTagId } from '../bugReport';
import { supabase } from '../../../supabaseClient';
import { BUILD_ID } from '../../../version';
import type { BattleModalCtx } from './types';

interface EndConfirmModalProps {
  ctx: BattleModalCtx;
  showEndConfirm: boolean;
  setShowEndConfirm: Dispatch<SetStateAction<boolean>>;
  handleEnd: () => void;
  /** 🆕「手を戻す」（2026-09-23）。SQL 未適用の環境では `undefined`＝ボタンごと出ない。 */
  rewind?: RewindEntry;
}

export function EndConfirmModal(p: EndConfirmModalProps) {
  const { loading, bs, user } = p.ctx;
  return (
    <EndReportDialog
      open={p.showEndConfirm}
      onClose={() => p.setShowEndConfirm(false)}
      onEnd={p.handleEnd}
      loading={loading}
      buildReport={(tag, comment) => buildBugReport({ bs, myUserId: user.id, tag, comment, appVersion: BUILD_ID })}
      sentNote={`ターン${bs.turn_count} / ${bs.turn_phase} の盤面を保存しました`}
      rewind={p.rewind}
    />
  );
}

/**
 * 🆕**「手を戻す」の入口**（2026-09-23）。
 * 🔑**ここに同居させる理由はバグ報告と同じ**＝必要になるのは「盤面が壊れて操作できない」局面なので、
 *   最前面（`zIndex 9999`）に出るこのダイアログからしか押せない。
 */
export interface RewindEntry {
  /** いまの手数（＝入力できる上限）。 */
  logCount: number;
  /** 入力を検証する純関数（`battle/rewind.ts` の `resolveRewindTarget`）。 */
  resolve: (input: string) => { ok: true; logNo: number; stateNo: number; text: string } | { ok: false; reason: string };
  /** 申請を送る（CPU 対戦は同意を挟まずその場で戻る）。失敗したら理由を返す。 */
  request: (t: { logNo: number; stateNo: number; text: string }) => Promise<string | null>;
  /** 相手の同意が要るか（CPU 対戦は不要）。 */
  needsConsent: boolean;
}

type View = 'confirm' | 'report' | 'sent' | 'rewind';

/** 終了確認＋バグ報告のダイアログ本体（対戦・観戦で共有）。 */
export function EndReportDialog(p: {
  open: boolean;
  onClose: () => void;
  onEnd: () => void;
  loading?: boolean;
  /** 送る行を組む（押した瞬間の盤面で組む＝呼び出し側がいまの盤面を持っている）。省略時は報告ボタンを出さない（盤面が無い画面）。 */
  buildReport?: (tag: BugTagId, comment: string) => BugReportRow;
  /** 送信後の一言（どの局面を保存したか）。 */
  sentNote?: string;
  title?: string;
  note?: string;
  continueLabel?: string;
  /** 🆕「手を戻す」（対戦画面だけ。観戦・SQL 未適用では `undefined`）。 */
  rewind?: RewindEntry;
}) {
  const { open, loading = false } = p;
  const [view, setView] = useState<View>('confirm');
  const [tag, setTag] = useState<BugTagId | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [rewindInput, setRewindInput] = useState('');
  const [rewindError, setRewindError] = useState<string | null>(null);
  const continueLabel = p.continueLabel ?? '対戦';

  const close = () => {
    p.onClose();
    // ⚠**閉じたら必ず初期状態へ戻す**＝戻さないと次に開いたとき前回の入力が残り、
    //   「別の場面の報告に前のコメントが付く」事故になる。
    setView('confirm'); setTag(null); setComment(''); setSendError(null);
    setRewindInput(''); setRewindError(null);
  };

  const target = p.rewind && rewindInput.trim() !== '' ? p.rewind.resolve(rewindInput) : null;
  const sendRewind = async () => {
    if (!p.rewind || sending) return;
    const t = p.rewind.resolve(rewindInput);
    if (!t.ok) { setRewindError(t.reason); return; }
    setSending(true); setRewindError(null);
    const err = await p.rewind.request(t);
    setSending(false);
    // 🔴**失敗を黙って飲まない**（バグ報告と同じ規律）＝送れていないのに閉じると「同意待ち」が永久に来ない。
    if (err) { setRewindError(err); return; }
    close();
  };

  const send = async () => {
    if (!tag || sending || !p.buildReport) return;
    setSending(true); setSendError(null);
    const row = p.buildReport(tag, comment);
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
      {open && createPortal(
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
                {p.title ?? '対戦を終了しますか？'}
              </p>
              <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 18px' }}>
                {p.note ?? 'ルームが削除され、対戦データは失われます'}
              </p>
              {/* 🔑報告は単独行・終了系ボタンから離す（誤爆防止）。 */}
              {p.buildReport && <button
                data-testid="bugreport-open"
                onClick={() => setView('report')}
                style={{ ...btn({ width: '100%', marginBottom: 18, borderColor: '#3a6ea5', color: '#9ec5ef' }) }}
              >
                バグを報告（{continueLabel}は続きます）
              </button>}
              {/* 🆕**手を戻す**＝報告と同じく単独行・終了系ボタンから離す（誤爆防止）。 */}
              {p.rewind && <button
                data-testid="rewind-open"
                onClick={() => setView('rewind')}
                style={{ ...btn({ width: '100%', marginBottom: 18, borderColor: '#8a6d3b', color: '#e3c078' }) }}
              >
                手を戻す（{continueLabel}は続きます）
              </button>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={close} style={btn({ flex: 1 })}>キャンセル</button>
                <button
                  data-testid="endconfirm-end"
                  onClick={p.onEnd}
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

            {view === 'rewind' && p.rewind && (<>
              <p style={{ color: C.text, fontSize: 15, fontWeight: 'bold', margin: '0 0 4px' }}>
                何手目に戻しますか？
              </p>
              {/* 🔑**番号はログの行頭に出ている数字**＝画面で読んでいる単位のまま入れられるようにする。 */}
              <p style={{ color: C.textDimmer, fontSize: 11, margin: '0 0 14px' }}>
                ログの行頭の番号を入れてください（1〜{p.rewind.logCount}）。
                {p.rewind.needsConsent ? '相手が同意すると、その時点の盤面に完全に戻ります。' : 'その時点の盤面に完全に戻ります。'}
              </p>
              <input
                data-testid="rewind-input"
                value={rewindInput}
                inputMode="numeric"
                onChange={e => { setRewindInput(e.target.value); setRewindError(null); }}
                placeholder="例: 128"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '9px 10px', marginBottom: 10,
                  borderRadius: 8, border: C.borderUI, backgroundColor: '#15151f', color: C.text, fontSize: 13,
                  textAlign: 'center',
                }}
              />
              {/* 入力しながら「その手が何だったか」を見せる＝番号の取り違えをここで止める。 */}
              {target && (
                <p data-testid="rewind-preview" style={{
                  color: target.ok ? C.textDim : '#ff6b6b', fontSize: 11, margin: '0 0 10px', wordBreak: 'break-all',
                }}>
                  {target.ok ? `${target.logNo}手目: ${target.text}` : target.reason}
                </p>
              )}
              {rewindError && (
                <p style={{ color: '#ff6b6b', fontSize: 12, margin: '0 0 10px', wordBreak: 'break-all' }}>
                  {rewindError}
                </p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setView('confirm'); setRewindError(null); }} style={btn({ flex: 1 })}>戻る</button>
                <button
                  data-testid="rewind-send"
                  onClick={sendRewind}
                  disabled={sending || !target?.ok}
                  style={btn({
                    flex: 1, border: 'none',
                    backgroundColor: (sending || !target?.ok) ? C.disabled : C.success,
                    color: C.text, fontWeight: 'bold', cursor: (sending || !target?.ok) ? 'default' : 'pointer',
                  })}
                >
                  {sending ? '送信中...' : p.rewind.needsConsent ? '相手に確認' : 'この手に戻す'}
                </button>
              </div>
            </>)}

            {view === 'sent' && (<>
              <p style={{ color: C.text, fontSize: 16, fontWeight: 'bold', margin: '0 0 8px' }}>
                報告しました
              </p>
              <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 18px' }}>
                {p.sentNote}
              </p>
              <button
                data-testid="bugreport-back-to-game"
                onClick={close}
                style={btn({ width: '100%', border: 'none', backgroundColor: C.success, color: C.text, fontWeight: 'bold' })}
              >
                {continueLabel}に戻る
              </button>
            </>)}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
