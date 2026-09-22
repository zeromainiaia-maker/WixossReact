import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { BattleStateRow, CardData, Deck } from '../types';
import { C, HandCards, PlayerField } from '../components/BoardComponents';
import { CPU_PLAYER_ID } from './battle/battleUtils';
import { normalizeCpuDeckPlan, pruneCpuDeckPlan } from './battle/cpuDeckPlan';
import { random } from '../engine/rng';
import { PHASE_LABEL } from './battle/uiConstants';
import { createHeadlessMatch } from './battle/controller/headlessMatch';
import { buildHeadlessRow, type HeadlessDeck } from './battle/controller/headlessSetup';
import { buildBaseEffectsMap, buildBattleMaterials } from './battle/controller/battleMaterials';
import { deckLrigSetupProblem } from '../utils/deckLrigSetup';
import { deckFromRow, type DeckRow } from '../utils/deckRow';

/**
 * 🆕**CPU 観戦**（2026-09-22）＝CPU 同士の1試合を**先に丸ごと計算**し、1手ごとの盤面を記録して
 * **コマ送り・巻き戻し・自動再生**で見せる。
 *
 * ■ 対戦の中身は自己対戦（`scripts/headlessSelfPlay.ts`）と同じ `createHeadlessMatch` ＋ `buildHeadlessRow`＝
 *   **ここで見える試合と、自己対戦で測った試合は同じ関数から出る**（画面側に2つ目の CPU を書かない）。
 * ■ 「1手」＝**ログが1行以上増えた `step()`**（ログの出ない内部の段＝整列・ルール処理の空振りは次の手へ畳む）。
 * ⚠計算はメインスレッドで回す＝数手ごとに `setTimeout(0)` で譲って進捗を描く（1試合 数十秒かかることがある）。
 * ⚠乱数は既定の seam（`engine/rng`）のまま＝`setRngSeed` を呼ぶと、この後の実対戦まで決定論になる。
 */

const SPECTATE_HOST_ID = 'spectate-host';
const MAX_STEPS = 4000;

interface Frame {
  row: BattleStateRow;
  /** この手までに積まれたログの行数。 */
  logCount: number;
  /** この手で増えたログ（見出し）。 */
  newLogs: string[];
}

interface Recording {
  frames: Frame[];
  logs: string[];
  end: 'finished' | 'idle' | 'cap' | 'error';
  error?: string;
  nameA: string;
  nameB: string;
}

const isPlayable = (d: Deck, cardMap: Map<string, CardData>) =>
  d.mainDeck.length === 40 && deckLrigSetupProblem(d, cardMap) === null;

const toHeadlessDeck = (d: Deck): HeadlessDeck => ({
  lrigDeck: d.lrigDeck, mainDeck: d.mainDeck,
  roles: { centerLrig: d.centerLrig ?? null, assistLrigL: d.assistLrigL ?? null, assistLrigR: d.assistLrigR ?? null },
  plan: pruneCpuDeckPlan(normalizeCpuDeckPlan(d.cpuPlan), [...d.mainDeck, ...d.lrigDeck]),
});

export default function SpectateScreen({ decks, cards, onBack }: {
  /** 自分のデッキ（`player`／`cpu` の両方）。 */
  decks: Deck[];
  /** バトル用の全カード（トークン込み）。 */
  cards: CardData[];
  onBack: () => void;
}) {
  const cardMap = useMemo(() => new Map(cards.map(c => [c.CardNum, c] as const)), [cards]);
  // CPU デッキは他人の公開分も並ぶ（`MatchmakingScreen` と同じ引き方）＝自分のデッキと id で合わせる。
  const [cpuDecks, setCpuDecks] = useState<Deck[]>([]);
  useEffect(() => {
    supabase.from('decks').select('*').eq('deck_kind', 'cpu').order('sort_order', { ascending: true })
      .then(({ data }) => { if (data) setCpuDecks((data as DeckRow[]).map(deckFromRow)); });
  }, []);
  const playable = useMemo(() => {
    const byId = new Map<string, Deck>();
    for (const d of [...decks, ...cpuDecks]) byId.set(d.id, d);
    return [...byId.values()].filter(d => isPlayable(d, cardMap));
  }, [decks, cpuDecks, cardMap]);

  const [deckAId, setDeckAId] = useState('');
  const [deckBId, setDeckBId] = useState('');
  const [first, setFirst] = useState<'random' | 'A' | 'B'>('random');
  const [progress, setProgress] = useState<{ steps: number; turn: number } | null>(null);
  const [rec, setRec] = useState<Recording | null>(null);
  const cancelRef = useRef(false);

  const start = async () => {
    const a = playable.find(d => d.id === deckAId), b = playable.find(d => d.id === deckBId);
    if (!a || !b) return;
    cancelRef.current = false;
    setRec(null);
    setProgress({ steps: 0, turn: 1 });
    // 対戦で使うカードだけに絞る（全カードを渡すと材料の組み立てが1手ごとに重くなる）＋トークンは常に載せる。
    const used = new Set([...a.mainDeck, ...a.lrigDeck, ...b.mainDeck, ...b.lrigDeck]);
    const battleCards = cards.filter(c => used.has(c.CardNum) || /-TK/.test(c.CardNum));
    const battleCardMap = new Map(battleCards.map(c => [c.CardNum, c] as const));
    const firstIsA = first === 'random' ? random() < 0.5 : first === 'A';
    const setup = buildHeadlessRow({
      seats: { host: toHeadlessDeck(a), guest: toHeadlessDeck(b) },
      hostId: SPECTATE_HOST_ID, firstPlayerId: firstIsA ? SPECTATE_HOST_ID : CPU_PLAYER_ID,
      cardMap: battleCardMap, roomId: 'spectate',
    });
    const m = createHeadlessMatch(setup.row, {
      cards: battleCards, initialLogs: setup.logs,
      cpuPlans: { host: toHeadlessDeck(a).plan, guest: toHeadlessDeck(b).plan },
    });
    const frames: Frame[] = [{ row: m.row(), logCount: m.logs.length, newLogs: [...m.logs] }];
    let end: Recording['end'] = 'cap';
    let error: string | undefined;
    try {
      for (let i = 0; i < MAX_STEPS; i++) {
        if (cancelRef.current) return;
        const kind = await m.step();
        const last = frames[frames.length - 1];
        const r = m.row();
        if (m.logs.length > last.logCount || kind === 'finished') {
          frames.push({ row: r, logCount: m.logs.length, newLogs: m.logs.slice(last.logCount) });
        } else {
          // ログの出ない段は直前の手へ畳む（盤面だけ最新にする）。
          frames[frames.length - 1] = { ...last, row: r };
        }
        if (kind === 'finished') { end = 'finished'; break; }
        if (kind === 'idle') { end = 'idle'; break; }
        // 1ステップ≒100ms かかるので毎回譲る（譲りのコストは数ms）＝計算中も「中止」が押せる。
        setProgress({ steps: frames.length, turn: r.turn_count });
        await new Promise(res => setTimeout(res, 0));
      }
    } catch (e) {
      end = 'error';
      error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
      console.error('[観戦] 対戦の計算中に例外', e);
    }
    setProgress(null);
    setRec({ frames, logs: [...m.logs], end, error, nameA: a.name, nameB: b.name });
  };

  useEffect(() => () => { cancelRef.current = true; }, []);

  if (rec) return <Replay rec={rec} cards={cards} onClose={() => setRec(null)} onBack={onBack} />;

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: 10, borderRadius: 6, backgroundColor: C.bgButtonDark, color: C.text,
    border: C.borderUIMid, fontSize: 14,
  };
  const label: React.CSSProperties = { color: C.textAlt, fontSize: 13, margin: '14px 0 6px' };
  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bgSetup, color: C.text, padding: '20px 16px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => { cancelRef.current = true; onBack(); }} style={{ background: 'none', border: C.borderUI, color: C.textDimmer, borderRadius: 4, padding: '6px 14px', fontSize: 12 }}>← 戻る</button>
        <h2 style={{ margin: '16px 0 4px' }}>CPU観戦</h2>
        <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>CPU 同士の1試合を先に計算してから、1手ずつ再生します。</p>
        {playable.length === 0 ? (
          <p style={{ color: C.warn, marginTop: 20 }}>対戦に使えるデッキがありません（メイン40枚・センタールリグ指定が必要）。</p>
        ) : (
          <>
            <p style={label}>CPU A（下）のデッキ</p>
            <select data-testid="spectate-deck-a" value={deckAId} onChange={e => setDeckAId(e.target.value)} style={selectStyle} disabled={!!progress}>
              <option value="">選択してください</option>
              {playable.map(d => <option key={d.id} value={d.id}>{d.kind === 'cpu' ? '[CPU] ' : ''}{d.name}</option>)}
            </select>
            <p style={label}>CPU B（上）のデッキ</p>
            <select data-testid="spectate-deck-b" value={deckBId} onChange={e => setDeckBId(e.target.value)} style={selectStyle} disabled={!!progress}>
              <option value="">選択してください</option>
              {playable.map(d => <option key={d.id} value={d.id}>{d.kind === 'cpu' ? '[CPU] ' : ''}{d.name}</option>)}
            </select>
            <p style={label}>先攻</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['random', 'A', 'B'] as const).map(f => (
                <button key={f} onClick={() => setFirst(f)} disabled={!!progress} style={{
                  flex: 1, padding: 10, borderRadius: 6, fontSize: 14,
                  border: first === f ? `2px solid ${C.accent}` : C.borderUI,
                  backgroundColor: first === f ? C.bgButton : 'transparent', color: C.text,
                }}>{f === 'random' ? 'ランダム' : `CPU ${f}`}</button>
              ))}
            </div>
            <button data-testid="spectate-start" onClick={start} disabled={!deckAId || !deckBId || !!progress} style={{
              width: '100%', marginTop: 24, padding: 16, borderRadius: 8, border: 'none', fontSize: 16, fontWeight: 'bold',
              backgroundColor: !deckAId || !deckBId || progress ? C.disabled : C.success, color: C.text,
            }}>
              {progress ? `計算中… ${progress.steps}手（T${progress.turn}）` : '対戦を計算して観戦'}
            </button>
            {progress && (
              <button onClick={() => { cancelRef.current = true; setProgress(null); }} style={{
                width: '100%', marginTop: 8, padding: 10, borderRadius: 8, border: C.borderUI, background: 'transparent', color: C.textAlt,
              }}>中止</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const SPEEDS = [
  { label: '0.5秒', ms: 500 },
  { label: '1秒', ms: 1000 },
  { label: '2秒', ms: 2000 },
];

function Replay({ rec, cards, onClose, onBack }: { rec: Recording; cards: CardData[]; onClose: () => void; onBack: () => void }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);
  const [showHands, setShowHands] = useState(true);
  const last = rec.frames.length - 1;
  const frame = rec.frames[idx];
  const bs = frame.row;

  // 自動再生（最後の手で止まる）。
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (idx >= last) { setPlaying(false); return; }
      setIdx(i => Math.min(last, i + 1));
    }, speed);
    return () => clearTimeout(t);
  }, [playing, idx, last, speed]);

  // 表示用のパワー（【常】込み）。静的な効果表は1回だけ組む。
  const usedCards = useMemo(() => {
    const r0 = rec.frames[0].row;
    const ids = new Set<string>();
    const collect = (v: unknown) => {
      if (typeof v === 'string') ids.add(v.split('#')[0]);
      else if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === 'object') Object.values(v).forEach(collect);
    };
    collect(r0.host_state); collect(r0.guest_state);
    return cards.filter(c => ids.has(c.CardNum) || /-TK/.test(c.CardNum));
  }, [rec, cards]);
  const baseEffectsMap = useMemo(() => buildBaseEffectsMap(usedCards), [usedCards]);
  const effectivePowers = useMemo(() => {
    try {
      return buildBattleMaterials({ bs, cards: usedCards, userId: bs.host_id, baseEffectsMap }).effectivePowers;
    } catch { return undefined; }
  }, [bs, usedCards, baseEffectsMap]);

  // キーボード（← → で1手・スペースで再生/停止）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { setPlaying(false); setIdx(i => Math.min(last, i + 1)); }
      else if (e.key === 'ArrowLeft') { setPlaying(false); setIdx(i => Math.max(0, i - 1)); }
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [idx]);

  const nameOf = (id: string | null | undefined) =>
    id === bs.host_id ? `A「${rec.nameA}」` : id === bs.guest_id ? `B「${rec.nameB}」` : '-';
  const winner = bs.winner_id ? nameOf(bs.winner_id) : null;
  const endNote = idx === last && (
    rec.end === 'finished' ? `決着：${winner ?? '?'} の勝ち`
      : rec.end === 'idle' ? '⚠ 盤面が進まなくなったため停止しました'
        : rec.end === 'cap' ? `⚠ ${MAX_STEPS}手で打ち切りました`
          : '⚠ 計算中に例外が起きたため停止しました'
  );

  const btn: React.CSSProperties = {
    flex: 1, padding: '10px 0', borderRadius: 6, border: C.borderUIMid, backgroundColor: C.bgButton,
    color: C.text, fontSize: 15, cursor: 'pointer',
  };
  const step = (d: number) => { setPlaying(false); setIdx(i => Math.max(0, Math.min(last, i + d))); };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bgApp, color: C.text, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 520, padding: '6px 8px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* 見出し */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: C.borderUI, color: C.textDimmer, borderRadius: 4, padding: '4px 10px', fontSize: 12 }}>← 終了</button>
          <button onClick={onClose} style={{ background: 'none', border: C.borderUI, color: C.textDimmer, borderRadius: 4, padding: '4px 10px', fontSize: 12 }}>別の対戦</button>
          <span style={{ marginLeft: 'auto', color: C.textAlt }}>
            T{bs.turn_count}・{PHASE_LABEL[bs.turn_phase] ?? bs.turn_phase}・手番 {nameOf(bs.active_user_id)}
          </span>
        </div>

        {/* B（上） */}
        <div style={{ fontSize: 11, color: C.textDim }}>B「{rec.nameB}」 ライフ {bs.guest_state.life_cloth.length}</div>
        {showHands && <HandCards cardNums={bs.guest_state.hand} cards={cards} />}
        <div style={{ border: C.borderPanel, borderRadius: 6, padding: '4px 6px', backgroundColor: C.bgOpponent }}>
          <PlayerField state={bs.guest_state} cards={cards} isMe={false} effectivePowers={effectivePowers} />
        </div>
        <div style={{ height: 2, background: 'linear-gradient(to right, transparent, #007bff33, transparent)' }} />
        {/* A（下） */}
        <div style={{ border: C.borderSelf, borderRadius: 6, padding: '4px 6px', backgroundColor: C.bgSelf }}>
          <PlayerField state={bs.host_state} cards={cards} isMe={true} effectivePowers={effectivePowers} />
          {showHands && <HandCards cardNums={bs.host_state.hand} cards={cards} />}
        </div>
        <div style={{ fontSize: 11, color: C.textDim }}>A「{rec.nameA}」 ライフ {bs.host_state.life_cloth.length}</div>

        {/* この手 */}
        <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 6, padding: '6px 8px', fontSize: 12, minHeight: 36 }}>
          <div style={{ color: C.accentLight, marginBottom: 2 }}>{idx} / {last} 手目</div>
          {frame.newLogs.slice(0, 6).map((l, i) => <div key={i} style={{ color: C.textSub }}>{l}</div>)}
          {frame.newLogs.length > 6 && <div style={{ color: C.textDim }}>…ほか{frame.newLogs.length - 6}行</div>}
          {endNote && <div style={{ color: rec.end === 'finished' ? C.success : C.warn, marginTop: 4, fontWeight: 'bold' }}>{endNote}</div>}
          {endNote && rec.error && <pre style={{ color: C.danger, fontSize: 10, whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{rec.error.slice(0, 600)}</pre>}
        </div>

        {/* 操作 */}
        <input type="range" min={0} max={last} value={idx} onChange={e => { setPlaying(false); setIdx(Number(e.target.value)); }} style={{ width: '100%' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={btn} onClick={() => step(-idx)} title="最初へ">⏮</button>
          <button style={btn} data-testid="spectate-prev" onClick={() => step(-1)} title="1手戻る">◀</button>
          <button style={{ ...btn, backgroundColor: playing ? C.dangerEnd : C.accent }} data-testid="spectate-play"
            onClick={() => { if (idx >= last) setIdx(0); setPlaying(p => !p); }}>{playing ? '⏸' : '▶'}</button>
          <button style={btn} data-testid="spectate-next" onClick={() => step(1)} title="1手進む">▶|</button>
          <button style={btn} onClick={() => step(last - idx)} title="最後へ">⏭</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: C.textAlt }}>
          <span>再生速度</span>
          {SPEEDS.map(s => (
            <button key={s.ms} onClick={() => setSpeed(s.ms)} style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 12, color: C.text,
              border: speed === s.ms ? `1px solid ${C.accent}` : C.borderUI,
              backgroundColor: speed === s.ms ? C.bgButton : 'transparent',
            }}>{s.label}</button>
          ))}
          <label style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={showHands} onChange={e => setShowHands(e.target.checked)} />手札を表示
          </label>
        </div>

        {/* ログ（この手まで） */}
        <div ref={logRef} style={{ maxHeight: 180, overflowY: 'auto', backgroundColor: C.bgBar, border: C.borderPanel, borderRadius: 6, padding: '4px 8px', fontSize: 11, lineHeight: 1.5 }}>
          {rec.logs.slice(0, frame.logCount).map((l, i) => (
            <div key={i} style={{ color: i >= frame.logCount - frame.newLogs.length ? C.textSub : C.textDimmer }}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
