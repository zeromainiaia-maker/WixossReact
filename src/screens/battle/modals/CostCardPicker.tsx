import type { CardData } from '../../../types';
import { getCardNum } from '../../../engine/effectExecutor';
import { C } from '../../../components/BoardComponents';

/**
 * 🆕2026-09-29（報告 08499934 の同型）＝コストで「どの札を」置くかを選ぶ汎用の欄（【チャーム】／【アクセ】をトラッシュに置く）。
 * 旧実装は左のゾーン（先頭）から自動だった。`value` は選んだ cardNum の列（重複なし・`count` 枚ちょうどで確定）。
 * 表示は `ownCostChoiceNeeded` が真のときだけ＝候補が必要数以下なら選ぶ余地が無い。
 */
export function CostCardPicker(p: {
  label: string; candidates: string[]; count: number; cardMap: Map<string, CardData>;
  value: string[]; onChange: (next: string[]) => void; testIdPrefix: string;
}) {
  const ok = p.value.length === p.count;
  return (
    <>
      <p style={{ color: ok ? C.text : C.warn, fontSize: 12, margin: 0 }}>
        {p.label}: {p.value.length} / {p.count}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {p.candidates.map((n, i) => {
          const c = p.cardMap.get(getCardNum(n));
          const isSel = p.value.includes(n);
          return (
            <div key={n} data-testid={`${p.testIdPrefix}-${i}`} title={c?.CardName ?? n}
              onClick={() => {
                if (isSel) { p.onChange(p.value.filter(x => x !== n)); return; }
                if (p.value.length < p.count) p.onChange([...p.value, n]);
              }}
              onContextMenu={e => e.preventDefault()}
              style={{ position: 'relative', width: 52, height: 73, borderRadius: 4, flexShrink: 0, cursor: 'pointer', overflow: 'hidden',
                border: isSel ? '2px solid #ff9800' : C.borderCard }}>
              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, fontSize: 7, color: C.textFaint }}>{n}</div>}
              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
