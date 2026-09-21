import { useState } from 'react';
import type { CardData, Deck } from '../../types';
import {
  CPU_COMBO_USES, CPU_COMBO_USE_LABELS, EMPTY_CPU_DECK_PLAN, pruneCpuDeckPlan,
  type CpuComboStep, type CpuComboUse, type CpuDeckPlan,
} from '../battle/cpuDeckPlan';

/**
 * 🆕**CPU の作戦**の編集（§5.7 `S-2`・CPU デッキだけ）＝キーカード・優先して出す札・コンボ。
 * 保存はデッキの更新（`onChange`）と同じ経路＝`decks.cpu_plan`。デッキに無いカードは保存時に外す（`pruneCpuDeckPlan`）。
 *
 * 🆕🔴**§5.7 `S-14`（2026-09-21）＝コンボに「使い方」を持たせた**＝1手ごとに
 * **出す／【起】で使う／アーツで撃つ／スペルで使う**を選ぶ（**2手に限らない**）。
 * 🔑**なぜ要るか（実測）**＝21デッキの作戦データを下書きしたら、**3件が「出す」だけでは書けなかった**
 * （`WD06` リュウグウの【起】／`WD08` ネビュラをトラッシュから【起】／`WD16` Ｆ・Ｍ・Ｓ の【起】→Ｇ・Ｌ・Ｋ）。
 * ⚠**旧形（A → B の2枚）で保存済みのコンボは「出す → 出す」として読める**（`normalizeCpuDeckPlan`）。
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
  /** 組み立て中のコンボ（「手を足す」で伸ばし、「コンボに追加」で確定する）。 */
  const [steps, setSteps] = useState<CpuComboStep[]>([]);
  const [num, setNum] = useState('');
  const [use, setUse] = useState<CpuComboUse>('deploy');
  const nameOf = (n: string) => cardMap.get(n)?.CardName ?? n;
  const stepLabel = (st: CpuComboStep) => `${nameOf(st.num)}（${CPU_COMBO_USE_LABELS[st.use]}）`;

  const save = (next: CpuDeckPlan) => onChange(pruneCpuDeckPlan(next, deckNums));
  const toggle = (key: 'keyCards' | 'priorityCards', n: string) => {
    const list = plan[key];
    save({ ...plan, [key]: list.includes(n) ? list.filter(x => x !== n) : [...list, n] });
  };
  /** 組み立て中のコンボに1手足す（⚠同じ「札×使い方」は足さない）。 */
  const addStep = () => {
    if (!num || steps.some(st => st.num === num && st.use === use)) return;
    setSteps([...steps, { num, use }]);
    setNum('');
  };
  const addCombo = () => {
    if (steps.length === 0) return;
    const key = (xs: readonly CpuComboStep[]) => xs.map(st => `${st.num}/${st.use}`).join('>');
    if (plan.combos.some(c => key(c.steps) === key(steps))) { setSteps([]); return; }
    save({ ...plan, combos: [...plan.combos, { steps }] });
    setSteps([]);
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
          <b style={{ color: '#7ddc7d' }}>コンボ</b>＝前の手が済むまで後の手は温存し、順番どおりに打つ
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
          <span style={{ color: '#7ddc7d', fontSize: 12, fontWeight: 'bold' }}>コンボ（順番に打つ手）</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select data-testid="cpu-plan-combo-card" value={num} onChange={e => setNum(e.target.value)} style={selectStyle}>
              <option value="">カードを選ぶ</option>
              {cards.map(c => <option key={c.CardNum} value={c.CardNum}>{c.CardName}</option>)}
            </select>
            <select data-testid="cpu-plan-combo-use" value={use} onChange={e => setUse(e.target.value as CpuComboUse)}
              style={{ ...selectStyle, flex: '0 0 130px' }}>
              {CPU_COMBO_USES.map(u => <option key={u} value={u}>{CPU_COMBO_USE_LABELS[u]}</option>)}
            </select>
            <button data-testid="cpu-plan-combo-step-add" onClick={addStep} disabled={!num}
              style={{ ...chip(!!num, '#2e6fb8'), padding: '6px 10px' }}>手を足す</button>
          </div>
          {steps.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7ddc7d' }}>
              <span data-testid="cpu-plan-combo-draft" style={{ flex: 1 }}>{steps.map(stepLabel).join(' → ')}</span>
              <button data-testid="cpu-plan-combo-add" onClick={addCombo} style={chip(true, '#2e8b2e')}>コンボに追加</button>
              <button onClick={() => setSteps([])} style={chip(false, '#000')}>取消</button>
            </div>
          )}
          {plan.combos.map(c => (
            <div key={c.steps.map(st => `${st.num}/${st.use}`).join('>')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#ddd' }}>
              <span style={{ flex: 1 }}>{c.steps.map(stepLabel).join(' → ')}</span>
              <button onClick={() => save({ ...plan, combos: plan.combos.filter(x => x !== c) })} style={chip(false, '#000')}>削除</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
