// F-3 身代わりバニッシュ選択（防御側＝自分のシグニがバニッシュされる場合の任意置換）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';

interface BanishSubstituteModalProps {
  ctx: BattleModalCtx;
  handleBanishSubstituteChoice: (optionIndex: number | null) => void;
}

export function BanishSubstituteModal(p: BanishSubstituteModalProps) {
  const { my, loading, battleCardMap } = p.ctx;
  const { handleBanishSubstituteChoice } = p;
  return (
    <>
      {my.pending_banish_substitute && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4600,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          {(() => {
            const pend = my.pending_banish_substitute!;
            const victimName = battleCardMap.get(pend.victimNum)?.CardName ?? pend.victimNum;
            return (
              <div style={{
                backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                padding: '24px 20px', width: 'min(92vw, 360px)',
                display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
              }}>
                <p style={{ color: C.life, fontSize: 15, fontWeight: 'bold', margin: 0 }}>身代わりバニッシュ</p>
                <p style={{ color: C.textSub, fontSize: 13, margin: 0 }}>
                  《{victimName}》がバニッシュされます。身代わりの方法を選べます。
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pend.options.map((opt, i) => {
                    const label = opt.kind === 'sacrifice'
                      ? `《${battleCardMap.get(opt.sacrificeNum)?.CardName ?? opt.sacrificeNum}》を代わりにバニッシュ`
                      : opt.costType === 'discardSpell'
                        ? `手札からスペル${opt.amount}枚を捨てて回避`
                        : `《${battleCardMap.get(opt.sourceNum)?.CardName ?? opt.sourceNum}》の下からスペル${opt.amount}枚をトラッシュして回避`;
                    return (
                      <button key={i} onClick={() => handleBanishSubstituteChoice(i)} disabled={loading}
                        style={{ padding: '11px 0', borderRadius: 8, border: 'none', backgroundColor: '#e53935',
                          color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: loading ? 'default' : 'pointer' }}>
                        {label}
                      </button>
                    );
                  })}
                  <button onClick={() => handleBanishSubstituteChoice(null)} disabled={loading}
                    style={{ padding: '11px 0', borderRadius: 8, border: C.borderUI, backgroundColor: C.bgButton,
                      color: C.textSub, fontSize: 14, cursor: loading ? 'default' : 'pointer' }}>
                    身代わりしない（{victimName}をバニッシュ）
                  </button>
                </div>
              </div>
            );
          })()}
        </div>,
        document.body,
      )}
    </>
  );
}
