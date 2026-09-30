// 相手の効果が始まったことの告知（2026-10-01 ユーザー要望）。判定は `../effectAnnounce.ts`。ここは描画だけ。
// ⚠画面は塞がない（pointerEvents:none）＝操作の邪魔をしない。待機の帯（top:8）と重ならない位置に出す。
// 🔴**選択ダイアログ（zIndex 4000〜4650）より上に出す**＝告知が要るのはまさにダイアログが急に出た瞬間。
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';

export function EffectAnnounceToast({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return createPortal(
    <div data-testid="effect-announce-toast"
      style={{ position: 'fixed', top: 44, left: '50%', transform: 'translateX(-50%)', zIndex: 4700,
        maxWidth: 'calc(100vw - 32px)', display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'none' }}>
      {lines.map((l, i) => (
        <div key={`${i}-${l}`}
          style={{ padding: '6px 12px', borderRadius: 8, backgroundColor: 'rgba(60,20,20,0.9)',
            border: '1px solid #ff9a8a', color: C.text, fontSize: 12, fontWeight: 'bold',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {l}
        </div>
      ))}
    </div>,
    document.body,
  );
}
