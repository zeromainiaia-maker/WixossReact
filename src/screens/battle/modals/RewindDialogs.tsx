// 「手を戻す」の同意ダイアログ2種（2026-09-23 ユーザー要望）。
//
// 🔑**なぜ `zIndex` を終了ダイアログと同じ 9999 にするか**＝この機能が必要になる場面は
//   「ラグで盤面が壊れて操作できない」＝**他のモーダルが出たまま押せない**局面なので、
//   バグ報告の導線（`SystemOverlays` → `EndConfirmModal`）と同じ最前面に出す必要がある。
// ⚠**申請は部屋に1つ**（`battle_states.rewind_request`）＝2つ同時に走らせない。
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { RewindRequest } from '../../../types';

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999,
  backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const panel: React.CSSProperties = {
  backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
  padding: '24px 20px', width: 'min(92vw, 340px)', textAlign: 'center',
};
const btn = (extra: React.CSSProperties): React.CSSProperties => ({
  padding: '10px 0', borderRadius: 8, fontSize: 14, cursor: 'pointer',
  border: C.borderUI, backgroundColor: 'transparent', color: C.textDim, ...extra,
});

/** 相手から「N手目に戻したい」と申請が来たときに出す（同意／拒否）。 */
export function RewindConsentDialog(p: {
  req: RewindRequest | null;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  if (!p.req) return null;
  return createPortal(
    <div style={overlay}>
      <div style={panel} data-testid="rewind-consent">
        <p style={{ color: C.text, fontSize: 16, fontWeight: 'bold', margin: '0 0 8px' }}>
          相手が「{p.req.logNo}手目に戻す」ことを求めています
        </p>
        {/* 🔑**何に同意するのかを読めるようにする**＝手番号だけだと相手の言い値になる。 */}
        <p style={{ color: C.textDim, fontSize: 12, margin: '0 0 6px', wordBreak: 'break-all' }}>
          {p.req.logNo}手目: {p.req.text || '（ログ本文なし）'}
        </p>
        <p style={{ color: C.textDimmer, fontSize: 11, margin: '0 0 18px' }}>
          同意すると、両者の盤面がその時点に戻ります（ログは残ります）
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button data-testid="rewind-decline" onClick={p.onDecline} disabled={p.busy}
            style={btn({ flex: 1 })}>断る</button>
          <button data-testid="rewind-accept" onClick={p.onAccept} disabled={p.busy}
            style={btn({ flex: 1, border: 'none', backgroundColor: p.busy ? C.disabled : C.success, color: C.text, fontWeight: 'bold' })}>
            {p.busy ? '戻しています...' : '同意して戻す'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 自分が出した申請の待機／拒否の通知。 */
export function RewindWaitDialog(p: {
  req: RewindRequest | null;
  onCancel: () => void;
}) {
  if (!p.req) return null;
  const declined = p.req.status === 'DECLINED';
  return createPortal(
    <div style={overlay}>
      <div style={panel} data-testid="rewind-wait">
        <p style={{ color: C.text, fontSize: 16, fontWeight: 'bold', margin: '0 0 8px' }}>
          {declined ? '相手に断られました' : '相手の同意を待っています…'}
        </p>
        <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 18px' }}>
          {p.req.logNo}手目: {p.req.text || '（ログ本文なし）'}
        </p>
        <button data-testid="rewind-cancel" onClick={p.onCancel}
          style={btn({ width: '100%' })}>{declined ? '閉じる' : '取り消す'}</button>
      </div>
    </div>,
    document.body,
  );
}
