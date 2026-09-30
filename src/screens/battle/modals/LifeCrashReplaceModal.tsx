// ダメージ置換の選択（被害側＝「あなたがダメージを受ける場合、代わりに〜してもよい」・§5.3 `O-414`）。
// ⚠**ライフを1枚も割る前に**問う（funnel＝`screens/battle/lifeCrashReplace.ts`）。決定は
//   `PlayerState.life_crash_replace_choice` に刻まれ、消費地点2つ（シグニアタック／ルリグアタック）が読む。
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';
import { sourceCardCaption } from '../effectSourceInfo';

interface LifeCrashReplaceModalProps {
  ctx: BattleModalCtx;
  handleLifeCrashReplaceChoice: (optionIndex: number | null) => void;
}

export function LifeCrashReplaceModal(p: LifeCrashReplaceModalProps) {
  const { my, loading, battleCardMap } = p.ctx;
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
              {my.pending_life_crash_replace.options.map((opt, i) => {
                // 🆕2026-10-01＝どのカードの効果で置換できるのかを添える（効果の選択肢の出所表示）。
                const caption = sourceCardCaption(opt.sourceCardNum, battleCardMap);
                return (
                <button key={i} onClick={() => handleLifeCrashReplaceChoice(i)} disabled={loading}
                  style={{ padding: '11px 0', borderRadius: 8, border: 'none', backgroundColor: '#e53935',
                    color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: loading ? 'default' : 'pointer' }}>
                  {opt.label}
                  {caption && <span data-testid="option-source-caption" style={{ display: 'block', fontSize: 11, fontWeight: 'normal', opacity: 0.85, marginTop: 2 }}>{caption}</span>}
                </button>
                );
              })}
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
