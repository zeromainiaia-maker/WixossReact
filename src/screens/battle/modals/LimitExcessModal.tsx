// リミット超過のルール処理（§5.3 `O-532`・RULES.md `R-44`/`R-48`）で、持ち主が落とす1体を選ぶモーダル。
// 🔑**選ぶのは1体ずつ**＝落としたら funnel が測り直してもう一度問う（公式ルールの「1体ずつ選んで」）。
// ⚠**キャンセルは無い**＝ルール処理なので選ばない自由が無い（閉じても盤面が超過なら即座に出し直される）。
import { createPortal } from 'react-dom';
import { C } from '../../../components/BoardComponents';
import type { BattleModalCtx } from './types';
import type { LimitExcessPlan } from '../limitExcess';

interface LimitExcessModalProps {
  ctx: BattleModalCtx;
  plan: LimitExcessPlan | null;
  onPick: (zoneIndex: number) => void;
}

export function LimitExcessModal(p: LimitExcessModalProps) {
  const { my, loading, battleCardMap } = p.ctx;
  const plan = p.plan;
  if (!plan || plan.excess <= 0) return null;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 3600,
      backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
        padding: '24px 20px', width: 'min(88vw, 340px)', textAlign: 'center',
        display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0 }}>リミット超過</p>
        <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
          レベル合計 {plan.total} / リミット {plan.limit === Infinity ? '∞' : plan.limit}
          （あと{plan.excess}下げる）。トラッシュに置くシグニを1体選んでください。
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {plan.candidateZones.map(zi => {
            const top = (my.field.signi[zi] ?? []).at(-1) ?? null;
            const card = top ? battleCardMap.get(top) : null;
            return (
              <button key={zi} data-testid={`limit-excess-zone-${zi}`}
                onClick={() => !loading && p.onPick(zi)}
                disabled={loading}
                style={{ flex: 1, padding: '10px 4px', borderRadius: 8, border: C.borderUI,
                  backgroundColor: C.bgButton, color: C.text, fontSize: 12,
                  cursor: loading ? 'default' : 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                {card ? (
                  <img src={card.ImgURL} alt={card.CardName}
                    style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4 }}
                    onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                ) : (
                  <div style={{ width: 44, height: 62, backgroundColor: C.bgCardEmpty, borderRadius: 4, border: C.borderEmpty }} />
                )}
                <span>ゾーン{zi + 1}</span>
                <span style={{ fontSize: 10, color: C.textDim }}>Lv{plan.levels.get(zi) ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
