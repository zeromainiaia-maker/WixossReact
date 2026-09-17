import { useState } from 'react';
import type { CardData, Deck } from '../../types';
import {
  EMPTY_CPU_DECK_PLAN, pruneCpuDeckPlan, type CpuDeckPlan,
} from '../battle/cpuDeckPlan';

/**
 * 🆕**CPU の作戦**の編集（§5.7 `S-2`・CPU デッキだけ）＝キーカード・優先して出す札・コンボ（「A の後に B」）。
 * 保存はデッキの更新（`onChange`）と同じ経路＝`decks.cpu_plan`。デッキに無いカードは保存時に外す（`pruneCpuDeckPlan`）。
 */
export function CpuDeckPlanModal({ deck, cardMap, onChange, onClose }: {
  deck: Deck;
  cardMap: Map<string, CardData>;
  onChange: (plan: CpuDeckPlan) => void;
  onClose: () => void;
}) {
  const deckNums = [...new Set([...deck.lrigDeck, ...deck.mainDeck])];
  const plan = pruneCpuDeckPlan(deck.cpuPlan ?? EMPTY_CPU_DECK_PLAN, deckNums);
  const cards = deckNums.map(n => cardMap.get(n)).filter((c): c is CardData => !!c);
  const [first, setFirst] = useState('');
  const [then, setThen] = useState('');
  const nameOf = (num: string) => cardMap.get(num)?.CardName ?? num;

  const save = (next: CpuDeckPlan) => onChange(pruneCpuDeckPlan(next, deckNums));
  const toggle = (key: 'keyCards' | 'priorityCards', num: string) => {
    const list = plan[key];
    save({ ...plan, [key]: list.includes(num) ? list.filter(n => n !== num) : [...list, num] });
  };
  const addCombo = () => {
    if (!first || !then || first === then) return;
    if (plan.combos.some(c => c.first === first && c.then === then)) return;
    save({ ...plan, combos: [...plan.combos, { first, then }] });
    setFirst(''); setThen('');
  };

  const chip = (active: boolean, color: string): React.CSSProperties => ({
    border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
    backgroundColor: active ? color : '#2a2a40', color: active ? '#fff' : '#999',
  });
  const selectStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: 6, borderRadius: 6, backgroundColor: '#0f0f1f', color: '#fff', border: '1px solid #444', fontSize: 12 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div data-testid="cpu-plan-modal" onClick={e => e.stopPropagation()} style={{ backgroundColor: '#1a1a2e', borderRadius: 12, padding: 20, width: 'min(94vw, 560px)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid #444' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h3 style={{ color: '#fff', fontSize: 15, margin: 0 }}>🤖 CPU の作戦</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ color: '#aaa', fontSize: 11, margin: 0, lineHeight: 1.6 }}>
          <b style={{ color: '#ffb84d' }}>キー</b>＝エナに置かない・捨てない・マリガンで戻さない／
          <b style={{ color: '#4da3ff' }}>優先</b>＝先に場に出す／
          <b style={{ color: '#7ddc7d' }}>コンボ</b>＝A が場にいないあいだ B は温存し、A を先に出す
        </p>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 120 }}>
          {cards.map(c => (
            <div key={c.CardNum} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
              <span style={{ color: '#ddd', fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.CardName}<span style={{ color: '#666', fontSize: 10, marginLeft: 6 }}>{c.Type}{c.Level && c.Level !== '-' ? ` Lv${c.Level}` : ''}</span>
              </span>
              <button data-testid={`cpu-plan-key-${c.CardNum}`} onClick={() => toggle('keyCards', c.CardNum)} style={chip(plan.keyCards.includes(c.CardNum), '#c77a00')}>キー</button>
              <button data-testid={`cpu-plan-priority-${c.CardNum}`} onClick={() => toggle('priorityCards', c.CardNum)} style={chip(plan.priorityCards.includes(c.CardNum), '#1f6fcc')}>優先</button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #333', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: '#7ddc7d', fontSize: 12, fontWeight: 'bold' }}>コンボ（A の後に B）</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select data-testid="cpu-plan-combo-first" value={first} onChange={e => setFirst(e.target.value)} style={selectStyle}>
              <option value="">A（先に出す）</option>
              {cards.map(c => <option key={c.CardNum} value={c.CardNum}>{c.CardName}</option>)}
            </select>
            <span style={{ color: '#888' }}>→</span>
            <select data-testid="cpu-plan-combo-then" value={then} onChange={e => setThen(e.target.value)} style={selectStyle}>
              <option value="">B（後で使う）</option>
              {cards.map(c => <option key={c.CardNum} value={c.CardNum}>{c.CardName}</option>)}
            </select>
            <button data-testid="cpu-plan-combo-add" onClick={addCombo} disabled={!first || !then || first === then}
              style={{ ...chip(!!first && !!then && first !== then, '#2e8b2e'), padding: '6px 10px' }}>追加</button>
          </div>
          {plan.combos.map(c => (
            <div key={`${c.first}>${c.then}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#ddd' }}>
              <span style={{ flex: 1 }}>{nameOf(c.first)} → {nameOf(c.then)}</span>
              <button onClick={() => save({ ...plan, combos: plan.combos.filter(x => x !== c) })} style={chip(false, '#000')}>削除</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
