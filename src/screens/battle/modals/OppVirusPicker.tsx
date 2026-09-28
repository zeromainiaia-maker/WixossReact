import type { CardData, PlayerState } from '../../../types';
import { getCardNum } from '../../../engine/effectExecutor';
import { C } from '../../../components/BoardComponents';

/**
 * 🆕2026-09-29（バグ報告 08499934）＝コスト「対戦相手の場にある【ウィルス】N つを取り除く」で**どのゾーンから取り除くか**を選ぶ欄。
 * 旧実装は全経路が「左のゾーンから自動」だった＝どのシグニの感染を外すかで結果が変わるのに選べなかった。
 * `value` はゾーン番号の列（同じゾーンを複数回＝そこから複数個）。表示は `oppVirusChoiceNeeded` が真のときだけ。
 * ⚠支払いは `payRemoveOppVirus(op, count, value)`（数が合わなければ左から）＝この部品は選ぶだけ。
 */
export function OppVirusPicker(p: {
  op: PlayerState; count: number; cardMap: Map<string, CardData>;
  value: number[]; onChange: (next: number[]) => void;
}) {
  const virus = p.op.field.signi_virus ?? [0, 0, 0];
  const ok = p.value.length === p.count;
  return (
    <>
      <p style={{ color: ok ? C.text : C.warn, fontSize: 12, margin: 0 }}>
        取り除く【ウィルス】を選択: {p.value.length} / {p.count}（同じゾーンを複数回選べます・もう一度押すと外す）
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[0, 1, 2].map(zi => {
          const have = virus[zi] ?? 0;
          if (have === 0) return null;
          const picked = p.value.filter(z => z === zi).length;
          const top = p.op.field.signi[zi]?.at(-1);
          const name = top ? (p.cardMap.get(getCardNum(top))?.CardName ?? top) : '（シグニなし）';
          const canAdd = picked < have && p.value.length < p.count;
          return (
            <button key={zi} data-testid={`opp-virus-zone-${zi}`}
              onClick={() => {
                if (canAdd) { p.onChange([...p.value, zi]); return; }
                if (picked > 0) { const i = p.value.lastIndexOf(zi); p.onChange(p.value.filter((_, k) => k !== i)); }
              }}
              style={{ padding: '6px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: C.text,
                border: picked > 0 ? '2px solid #ff9800' : C.borderCard,
                backgroundColor: picked > 0 ? 'rgba(255,152,0,0.15)' : C.bgButton }}>
              相手のゾーン{zi + 1}：{name}<br />【ウィルス】{have}個{picked > 0 ? `（${picked}個 取り除く）` : ''}
            </button>
          );
        })}
      </div>
    </>
  );
}
