import { useState } from 'react';
import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { getCardNum } from '../../engine/execUtils';
import { lingeringEffectRows } from './lingeringEffectRows';

/**
 * 🆕2026-10-23＝**発動中の効果欄**（ログと相手の盤面の間）。中身は `lingeringEffectRows.ts`、記録は `lingeringEffects.ts`。
 * 畳んだ状態は件数と先頭1件だけ（盤面の高さを食わない）。タップで全件。カード名タップで拡大。
 */
export function LingeringEffectsPanel(p: {
  my: PlayerState; op: PlayerState;
  cardMap: Map<string, CardData>; effectsMap: Map<string, CardEffect[]>;
  onZoom: (card: CardData) => void;
}) {
  const [open, setOpen] = useState(false);
  const rows = lingeringEffectRows(p.my, p.op, p.cardMap, p.effectsMap);
  if (rows.length === 0) return null;
  const cardLink = (cardNum: string | undefined, name: string, key: string) => {
    const card = cardNum ? p.cardMap.get(getCardNum(cardNum)) : undefined;
    return card
      ? <span key={key} data-testid="lingering-card-link" onClick={e => { e.stopPropagation(); p.onZoom(card); }}
          style={{ color: '#ffd27a', textDecoration: 'underline dotted', cursor: 'zoom-in' }}>《{name}》</span>
      : <span key={key}>{name}</span>;
  };
  return (
    <div data-testid="lingering-effects" onClick={() => setOpen(v => !v)}
      style={{
        flexShrink: 0, backgroundColor: 'rgba(40,20,60,0.6)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer',
        border: '1px solid rgba(200,160,255,0.18)', maxHeight: open ? 220 : 38, overflowY: open ? 'auto' : 'hidden', position: 'relative',
      }}>
      <div style={{ fontSize: 10, color: '#c9b3ff', fontWeight: 'bold', lineHeight: '1.6' }}>発動中の効果（{rows.length}件）</div>
      {(open ? rows : rows.slice(0, 1)).map(r => (
        <div key={r.key} data-testid="lingering-effect-row"
          style={{ fontSize: 10, color: '#d8d0e8', lineHeight: '1.6', ...(open ? { marginBottom: 3 } : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }) }}>
          <span style={{ color: r.owner === 'あなた' ? '#8fd3ff' : '#ff9a9a', marginRight: 4 }}>[{r.owner}]</span>
          {cardLink(r.sourceCardNum, r.sourceName, 'src')}
          <span style={{ color: '#9a8fb0' }}> → </span>
          {r.targets.map((t, i) => <span key={i}>{i > 0 && '・'}{cardLink(t.cardNum, t.name, `t${i}`)}</span>)}
          {r.details.length > 0 && <span style={{ color: '#e8d8ff', marginLeft: 4 }}>「{r.details.join('・')}」</span>}
          {r.expiry && <span style={{ color: '#b0a070', marginLeft: 4 }}>（{r.expiry}）</span>}
          {open && r.abilityText && <div style={{ color: '#a89cc0', whiteSpace: 'normal', paddingLeft: 8 }}>{r.abilityText}</div>}
        </div>
      ))}
      <div style={{
        position: 'absolute', right: 6, top: 10, transform: open ? 'rotate(180deg)' : undefined,
        fontSize: 8, color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
      }}>▼</div>
    </div>
  );
}
