// ダメージ置換の選択（被害側＝「あなたがダメージを受ける場合、代わりに〜してもよい」・§5.3 `O-414`）。
// ⚠**ライフを1枚も割る前に**問う（funnel＝`screens/battle/lifeCrashReplace.ts`）。決定は
//   `PlayerState.life_crash_replace_choice` に刻まれ、消費地点2つ（シグニアタック／ルリグアタック）が読む。
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface LifeCrashReplaceModalProps {
  ctx: BattleModalCtx;
  handleLifeCrashReplaceChoice: (optionIndex: number | null) => void;
}

export function LifeCrashReplaceModal(p: LifeCrashReplaceModalProps) {
  const { my, loading } = p.ctx;
  const { handleLifeCrashReplaceChoice } = p;
  return (
    <>
      {my.pending_life_crash_replace && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4650,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(92vw, 360px)',
            display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
          }}>
            <p style={{ color: C.life, fontSize: 15, fontWeight: 'bold', margin: 0 }}>ダメージ置換</p>
            <p style={{ color: C.textSub, fontSize: 13, margin: 0 }}>
              ダメージを受けます。代わりに以下を行えます。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {my.pending_life_crash_replace.options.map((opt, i) => (
                <button key={i} onClick={() => handleLifeCrashReplaceChoice(i)} disabled={loading}
                  style={{ padding: '11px 0', borderRadius: 8, border: 'none', backgroundColor: '#e53935',
                    color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: loading ? 'default' : 'pointer' }}>
                  {opt.label}
                </button>
              ))}
              <button onClick={() => handleLifeCrashReplaceChoice(null)} disabled={loading}
                style={{ padding: '11px 0', borderRadius: 8, border: C.borderUI, backgroundColor: C.bgButton,
                  color: C.textSub, fontSize: 14, cursor: loading ? 'default' : 'pointer' }}>
                置換しない（ダメージを受ける）
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
