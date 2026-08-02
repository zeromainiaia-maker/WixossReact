// 使用時の任意支払いによるコスト軽減の支払いUI（タスク12(lxxxv)）。
// スペル（`SpellCastModal`）とアーツ（`ArtsModal`）で同じ部品を使う＝支払い元が5種あるので、
// どちらか片方に書くと必ず片方だけ直る／片方だけ壊れる。
import { C } from '../../../components/BoardComponents';
import type { CardData } from '../../../types';
import { getCardNum } from '../../../engine/effectExecutor';
import type { UseCostCandidate, UseTimeCostSpec } from '../useTimeCost';

const SOURCE_LABEL: Record<UseTimeCostSpec['source'], string> = {
  hand: '手札から捨てる',
  signi_down: '場のシグニをダウンする',
  lrig_deck_arts: 'ルリグデッキのアーツをルリグトラッシュに置く',
  life_cloth: 'ライフクロスをトラッシュに置く',
  key: '場のキーをルリグトラッシュに置く',
};

interface Props {
  spec: UseTimeCostSpec;
  candidates: UseCostCandidate[];
  selected: Set<string>;
  setSelected: (updater: (prev: Set<string>) => Set<string>) => void;
  /** 支払い枚数が変わるとエナ要求枚数も変わるので、呼び出し側で選択済みエナを白紙に戻す。 */
  onChange: () => void;
  cardMap: Map<string, CardData>;
  /** 支払い前→支払い後のコスト表示（呼び出し側が `applyUseTimeCostReduction` で算出）。 */
  costBefore: string;
  costAfter: string;
  /** 固定形（`perUnit:false`）で枚数が足りていない＝軽減されない選択。 */
  incomplete: boolean;
}

export function UseCostPaymentPanel(p: Props) {
  const { spec, candidates, selected, setSelected, onChange, cardMap, costBefore, costAfter, incomplete } = p;
  const cap = Math.min(spec.max, candidates.length);
  const reduceText = spec.reduction.map(r => `《${r.color}》×${r.count}`).join('');
  const paid = selected.size > 0 && !incomplete;
  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < cap) next.add(key);
      return next;
    });
    onChange();
  };
  return (
    <div style={{ padding: '8px 10px', borderRadius: 8,
      border: paid ? '2px solid #66dd88' : C.borderUI,
      backgroundColor: paid ? 'rgba(40,150,80,0.15)' : C.bgButton,
      display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ color: paid ? '#88ffaa' : C.text, fontSize: 12, margin: 0 }}>
        使用時の任意支払い（{SOURCE_LABEL[spec.source]}）：
        {spec.perUnit ? `1枚につき ${reduceText} 減る` : `支払うと ${reduceText} 減る`}
      </p>
      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
        選択: {selected.size} / {cap === Infinity ? candidates.length : cap}枚
        {' '}／ コスト: {paid ? <><s style={{ color: C.textFaint }}>{costBefore || 'なし'}</s> → {costAfter}</> : (costBefore || 'なし')}
      </p>
      {spec.source === 'life_cloth' ? (
        // ライフクロスは裏向き＝どの1枚かに意味がない。枚数だけを選ばせる。
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => { setSelected(() => new Set()); onChange(); }}
            disabled={selected.size === 0}
            style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
              backgroundColor: 'transparent', color: C.textDim, fontSize: 12,
              cursor: selected.size === 0 ? 'default' : 'pointer' }}>
            支払わない
          </button>
          <button onClick={() => { setSelected(() => new Set(candidates.slice(0, cap).map(c => c.key))); onChange(); }}
            disabled={candidates.length === 0 || selected.size >= cap}
            style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
              backgroundColor: selected.size >= cap ? 'rgba(40,150,80,0.2)' : 'transparent',
              color: candidates.length === 0 ? C.textFaint : C.text, fontSize: 12,
              cursor: candidates.length === 0 || selected.size >= cap ? 'default' : 'pointer' }}>
            ライフクロス{cap}枚を支払う
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 160 }}>
          {candidates.map(cand => {
            const c = cardMap.get(getCardNum(cand.cardNum));
            const isSel = selected.has(cand.key);
            return (
              <div key={cand.key} data-testid={`usecost-${cand.key}`}
                onClick={() => toggle(cand.key)}
                style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                  border: isSel ? '2px solid #66dd88' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                {c
                  ? <img src={c.ImgURL} alt={c.CardName} draggable={false}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                  : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 7, color: C.textFaint }}>{cand.cardNum}</span>
                    </div>
                }
                {isSel && (
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(40,150,80,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                  </div>
                )}
              </div>
            );
          })}
          {candidates.length === 0 && (
            <span style={{ color: C.textFaint, fontSize: 11 }}>支払える候補がありません（支払わずに使用できます）</span>
          )}
        </div>
      )}
      {incomplete && (
        <p style={{ color: C.warn, fontSize: 10, margin: 0 }}>
          {spec.max}枚そろっていません（このままでは軽減されません／支払わずに使用もできます）
        </p>
      )}
    </div>
  );
}
