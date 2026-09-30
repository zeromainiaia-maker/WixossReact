// 効果の選択肢の共通見出し（2026-10-01 ユーザー要望）＝「どのカードの・どの能力か・誰が選ぶのか」。
// 判定は `../effectSourceInfo.ts`（純関数・golden で固定）。ここは描画だけ。
import { C } from '../../../components/BoardComponents';
import type { CardData, PendingEffect } from '../../../types';
import { effectSourceInfo } from '../effectSourceInfo';

interface Props {
  pe: Pick<PendingEffect, 'sourcePlayerId' | 'respondPlayerId' | 'sourceCardNum' | 'effectId'>;
  viewerId: string;
  cardMap: Map<string, CardData>;
  /** カード画像をタップしたときの拡大表示。 */
  onExpand?: (imgUrl: string | null) => void;
  /** 見出しの差し替え（`REVEAL_CARDS` の `title`・離場置換など）。出所の行はそのまま出す。 */
  title?: string;
}

export function EffectSourceHeader({ pe, viewerId, cardMap, onExpand, title }: Props) {
  const info = effectSourceInfo(pe, viewerId, cardMap);
  const ownerColor = info.owner === 'あなた' ? '#7fb8ff' : '#ff9a8a';
  return (
    <div data-testid="effect-source-header" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {title && (
        <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>{title}</p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {info.imgUrl && (
          <img src={info.imgUrl} alt="" draggable={false}
            onClick={() => onExpand?.(info.imgUrl ?? null)}
            style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0,
              border: `1px solid ${ownerColor}`, cursor: onExpand ? 'pointer' : 'default' }}
            onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span data-testid="effect-source-heading" style={{ color: ownerColor, fontSize: 13, fontWeight: 'bold' }}>{info.heading}</span>
          {info.respondNote && (
            <span data-testid="effect-source-note" style={{ color: C.text, fontSize: 12 }}>{info.respondNote}</span>
          )}
        </div>
      </div>
      {info.abilityText && (
        <div data-testid="effect-source-text"
          style={{ color: C.textSub, fontSize: 11, lineHeight: 1.5, textAlign: 'left',
            backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: '6px 8px', maxHeight: 96, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
          {info.abilityText}
        </div>
      )}
    </div>
  );
}
