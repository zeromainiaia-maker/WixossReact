import { useMemo } from 'react';
import type { CardData } from '../../types';
import { STAT_COLORS, lrigDeckStats, mainDeckStats } from '../../utils/deckStats';

/** デッキ編成「デッキ内容」の「内訳」タブ（2026-10-23 ユーザー要望）。集計は `utils/deckStats.ts`。 */
export function DeckStatsPanel({ mainDeck, lrigDeck, cardMap }: {
  mainDeck: readonly string[];
  lrigDeck: readonly string[];
  cardMap: ReadonlyMap<string, CardData>;
}) {
  const main = useMemo(() => mainDeckStats(mainDeck, cardMap), [mainDeck, cardMap]);
  const lrig = useMemo(() => lrigDeckStats(lrigDeck, cardMap), [lrigDeck, cardMap]);
  const levelMax = Math.max(1, ...Object.values(main.signiLevels));
  const levels = ['0', '1', '2', '3', '4', '5'].filter(l => l !== '0' || (main.signiLevels['0'] ?? 0) > 0);
  const lrigLevels = Object.keys(lrig.lrigLevels).sort((a, b) => Number(a) - Number(b));

  return (
    <div data-testid="deck-stats" style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#333' }}>
      <section style={boxStyle}>
        <div style={titleStyle}>メインデッキ {main.total}枚</div>
        <div style={chipRowStyle}>
          <Chip label="シグニ" value={main.signi} />
          <Chip label="スペル" value={main.spell} />
          {main.other > 0 && <Chip label="その他" value={main.other} />}
          <Chip label="LB有" value={main.lifeBurst} />
          <Chip label="ガード" value={main.guard} testId="deck-stats-guard" />
        </div>
        <div style={subTitleStyle}>シグニのレベル</div>
        <div data-testid="deck-stats-levels" style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '84px' }}>
          {levels.map(l => {
            const n = main.signiLevels[l] ?? 0;
            return (
              <div key={l} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <span style={{ fontSize: '11px', color: '#555' }}>{n}</span>
                <div style={{ width: '100%', maxWidth: '36px', height: `${(n / levelMax) * 52}px`, minHeight: n > 0 ? '2px' : 0, backgroundColor: '#7a62c8', borderRadius: '3px 3px 0 0' }} />
                <span style={{ fontSize: '11px', color: '#777', marginTop: '2px' }}>Lv{l}</span>
              </div>
            );
          })}
        </div>
        <div style={subTitleStyle}>色（多色は1色ずつ数える）</div>
        <div style={chipRowStyle}>
          {STAT_COLORS.filter(c => (main.colors[c] ?? 0) > 0).map(c => <Chip key={c} label={c} value={main.colors[c]} />)}
        </div>
        {main.classes.length > 0 && <>
          <div style={subTitleStyle}>シグニのクラス</div>
          <div style={chipRowStyle}>
            {main.classes.slice(0, 8).map(([k, n]) => <Chip key={k} label={k} value={n} />)}
          </div>
        </>}
      </section>
      <section style={boxStyle}>
        <div style={titleStyle}>ルリグデッキ {lrig.total}枚</div>
        <div style={chipRowStyle}>
          {lrig.byType.map(([t, n]) => <Chip key={t} label={t} value={n} />)}
        </div>
        {lrigLevels.length > 0 && <>
          <div style={subTitleStyle}>ルリグのレベル</div>
          <div style={chipRowStyle}>
            {lrigLevels.map(l => <Chip key={l} label={`Lv${l}`} value={lrig.lrigLevels[l]} />)}
          </div>
        </>}
      </section>
    </div>
  );
}

function Chip({ label, value, testId }: { label: string; value: number; testId?: string }) {
  return (
    <span data-testid={testId} style={{ display: 'inline-flex', gap: '4px', alignItems: 'baseline', padding: '3px 8px', borderRadius: '12px', backgroundColor: '#ede8f5', color: '#4a3a80' }}>
      <span style={{ fontSize: '12px' }}>{label}</span>
      <b style={{ fontSize: '13px' }}>{value}</b>
    </span>
  );
}

const boxStyle: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #ddd6ee', borderRadius: '8px', padding: '10px' };
const titleStyle: React.CSSProperties = { fontWeight: 'bold', color: '#3a2a70', marginBottom: '6px' };
const subTitleStyle: React.CSSProperties = { fontSize: '11px', color: '#777', margin: '8px 0 4px' };
const chipRowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '6px' };
