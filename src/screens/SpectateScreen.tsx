import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import type { BattleStateRow, CardData, Deck, GameLog } from '../types';
import { C, HandCards, PlayerField } from '../components/BoardComponents';
import { CPU_PLAYER_ID } from './battle/battleUtils';
import { normalizeCpuDeckPlan, pruneCpuDeckPlan } from './battle/cpuDeckPlan';
import { currentRng, mulberry32, random, setRng } from '../engine/rng';
import { PHASE_LABEL } from './battle/uiConstants';
import { createHeadlessMatch } from './battle/controller/headlessMatch';
import { buildHeadlessRow, type HeadlessDeck } from './battle/controller/headlessSetup';
import { buildBaseEffectsMap, buildBattleMaterials } from './battle/controller/battleMaterials';
import { buildBugReport } from './battle/bugReport';
import { EndReportDialog } from './battle/modals/EndConfirmModal';
import { CpuDeckPickerBody, CpuDeckPickerTabs, useCpuDeckPicker } from './deck/CpuDeckPicker';
import { deckLrigSetupProblem } from '../utils/deckLrigSetup';
import { deckFromRow, type DeckRow } from '../utils/deckRow';
import { buildVariantNumIndex } from '../utils/cardSearch';
import {
  SPECTATE_ACTIVE_KEY, SPECTATE_FRAME_KEY, clearSpectateRecording, loadSpectateRecording, saveSpectateRecording,
} from '../utils/spectateStore';
import { BUILD_ID } from '../version';
import { spectateLogLabel } from './battle/spectateLog';

/**
 * 🆕**CPU 観戦**（2026-09-22）＝CPU 同士の1試合を**先に丸ごと計算**し、1手ごとの盤面を記録して
 * **コマ送り・巻き戻し・自動再生**で見せる。バグ探しと CPU の強化に使う（ユーザー要望）。
 *
 * ■ 対戦の中身は自己対戦（`scripts/headlessSelfPlay.ts`）と同じ `createHeadlessMatch` ＋ `buildHeadlessRow`＝
 *   **ここで見える試合と、自己対戦で測った試合は同じ関数から出る**（画面側に2つ目の CPU を書かない）。
 * ■ デッキの選び方は CPU対戦と同じ部品（`deck/CpuDeckPicker.tsx`）＝A（下）→ B（上）の順に選ぶ。
 * ■ 「1手」＝**ログが1行以上増えた `step()`**（ログの出ない内部の段＝整列・ルール処理の空振りは次の手へ畳む）。
 * ■ **報告**＝対戦と同じ「最前面の終了ボタン → 終了確認 → バグを報告」（`EndReportDialog`）。表示中の手の盤面を送る。
 * ■ **リロード復帰**＝記録は IndexedDB（`utils/spectateStore.ts`）・「観戦中」と手の位置は `sessionStorage`。
 * 🔑**乱数は seed 固定で回す**（計算中だけ差し替えて戻す）＝報告の `seed` と山から同じ試合を再計算できる。
 * ⚠計算はメインスレッド＝毎ステップ `setTimeout(0)` で譲って進捗を描く（1試合 数十秒かかることがある）。
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
  seed: number;
  /** 先攻の決め方（`random` は seed の乱数で決まる）＝再計算に要る（`scripts/replaySpectateReport.ts`）。 */
  firstMode?: 'random' | 'A' | 'B';
  /** 報告の `room_id`（観戦ごとの uuid＝報告を試合単位で束ねる）。 */
  sessionId: string;
}

const isPlayable = (d: Deck, cardMap: Map<string, CardData>) =>
  d.mainDeck.length === 40 && deckLrigSetupProblem(d, cardMap) === null;

const toHeadlessDeck = (d: Deck): HeadlessDeck => ({
  lrigDeck: d.lrigDeck, mainDeck: d.mainDeck,
  roles: { centerLrig: d.centerLrig ?? null, assistLrigL: d.assistLrigL ?? null, assistLrigR: d.assistLrigR ?? null },
  plan: pruneCpuDeckPlan(normalizeCpuDeckPlan(d.cpuPlan), [...d.mainDeck, ...d.lrigDeck]),
});

const safeSession = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* 復帰できないだけ */ } },
  del: (k: string) => { try { sessionStorage.removeItem(k); } catch { /* 同上 */ } },
};

/** 最前面の ↺・終了（対戦の `SystemOverlays` と同じ置き方＝画面が固まっても押せる）。 */
function TopButtons({ onEnd }: { onEnd: () => void }) {
  const style: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 4, border: '1px solid #444', backgroundColor: 'rgba(0,0,0,0.55)',
    color: '#666', cursor: 'pointer', fontSize: 11, backdropFilter: 'blur(4px)',
  };
  return createPortal(
    <div style={{ position: 'fixed', top: 6, right: 8, zIndex: 9998, display: 'flex', gap: 6 }}>
      <button onClick={() => window.location.reload()} style={style}>↺</button>
      <button data-testid="spectate-end" onClick={onEnd} style={style}>終了</button>
    </div>,
    document.body,
  );
}

export default function SpectateScreen({ decks, cards, variantCards = [], folderThumbnails, myUserId, onBack }: {
  /** 自分のデッキ（CPU デッキを含む）。 */
  decks: Deck[];
  /** バトル用の全カード（トークン込み）。 */
  cards: CardData[];
  variantCards?: CardData[];
  folderThumbnails: Record<string, string>;
  myUserId: string;
  onBack: () => void;
}) {
  const cardMap = useMemo(() => new Map(cards.map(c => [c.CardNum, c] as const)), [cards]);
  const variantNumIndex = useMemo(() => buildVariantNumIndex(variantCards), [variantCards]);
  // CPU デッキは公開分も並ぶ（`MatchmakingScreen` と同じ引き方）＝自分のデッキと id で合わせる。
  const [fetchedCpuDecks, setFetchedCpuDecks] = useState<Deck[]>([]);
  useEffect(() => {
    supabase.from('decks').select('*').eq('deck_kind', 'cpu').order('sort_order', { ascending: true })
      .then(({ data }) => { if (data) setFetchedCpuDecks((data as DeckRow[]).map(deckFromRow)); });
  }, []);
  const validCpuDecks = useMemo(() => {
    const byId = new Map<string, Deck>();
    for (const d of [...decks.filter(x => x.kind === 'cpu'), ...fetchedCpuDecks]) byId.set(d.id, d);
    return [...byId.values()].filter(d => isPlayable(d, cardMap));
  }, [decks, fetchedCpuDecks, cardMap]);
  const pickerA = useCpuDeckPicker(validCpuDecks, cardMap, variantNumIndex);
  const pickerB = useCpuDeckPicker(validCpuDecks, cardMap, variantNumIndex);

  const [step, setStep] = useState<'A' | 'B' | 'CONFIRM'>('A');
  const [first, setFirst] = useState<'random' | 'A' | 'B'>('random');
  const [progress, setProgress] = useState<{ steps: number; turn: number } | null>(null);
  const [rec, setRec] = useState<Recording | null>(null);
  const [restoring, setRestoring] = useState(() => safeSession.get(SPECTATE_FRAME_KEY) !== null);
  const [initialFrame, setInitialFrame] = useState(0);
  const [showEnd, setShowEnd] = useState(false);
  const cancelRef = useRef(false);

  // 観戦画面にいる印（リロードで App がここへ戻す）。
  useEffect(() => { safeSession.set(SPECTATE_ACTIVE_KEY, '1'); }, []);
  useEffect(() => () => { cancelRef.current = true; }, []);

  // リロード復帰＝再生中だった記録を IndexedDB から読む。
  useEffect(() => {
    if (!restoring) return;
    let alive = true;
    loadSpectateRecording<Recording>()
      .then(r => {
        if (!alive) return;
        if (r) { setInitialFrame(Math.min(r.frames.length - 1, Number(safeSession.get(SPECTATE_FRAME_KEY)) || 0)); setRec(r); }
        setRestoring(false);
      })
      .catch(() => { if (alive) setRestoring(false); });
    return () => { alive = false; };
  }, [restoring]);

  const leave = () => {
    cancelRef.current = true;
    safeSession.del(SPECTATE_ACTIVE_KEY); safeSession.del(SPECTATE_FRAME_KEY);
    clearSpectateRecording().catch(() => {});
    onBack();
  };

  const start = async () => {
    const a = pickerA.resolve(), b = pickerB.resolve();
    if (!a || !b) return;
    cancelRef.current = false;
    setRec(null);
    setProgress({ steps: 0, turn: 1 });
    const seed = Math.floor(random() * 2 ** 31);
    // 🔑計算中だけ seed 固定の乱数へ差し替える（終わったら必ず戻す＝この後の実対戦を決定論にしない）。
    const prevRng = currentRng();
    setRng(mulberry32(seed));
    // 対戦で使うカードだけに絞る（全カードを渡すと材料の組み立てが1手ごとに重くなる）＋トークンは常に載せる。
    const used = new Set([...a.mainDeck, ...a.lrigDeck, ...b.mainDeck, ...b.lrigDeck]);
    const battleCards = cards.filter(c => used.has(c.CardNum) || /-TK/.test(c.CardNum));
    const battleCardMap = new Map(battleCards.map(c => [c.CardNum, c] as const));
    const firstIsA = first === 'random' ? random() < 0.5 : first === 'A';
    let frames: Frame[] = [];
    let logs: string[] = [];
    let end: Recording['end'] = 'cap';
    let error: string | undefined;
    try {
      const setup = buildHeadlessRow({
        seats: { host: toHeadlessDeck(a), guest: toHeadlessDeck(b) },
        hostId: SPECTATE_HOST_ID, firstPlayerId: firstIsA ? SPECTATE_HOST_ID : CPU_PLAYER_ID,
        cardMap: battleCardMap, roomId: 'spectate',
      });
      const m = createHeadlessMatch(setup.row, {
        cards: battleCards, initialLogs: setup.logs,
        cpuPlans: { host: toHeadlessDeck(a).plan, guest: toHeadlessDeck(b).plan },
      });
      // 🆕2026-09-22＝**表示用のログは [A]/[B] 付き**（`spectateLog.ts`＝両席とも `[CPU]` で出るので誰の行動か読めなかった）。
      logs = [
        ...setup.seatLogs.host.map(l => spectateLogLabel(l, 'host')),
        ...setup.seatLogs.guest.map(l => spectateLogLabel(l, 'guest')),
      ];
      frames = [{ row: m.row(), logCount: logs.length, newLogs: [...logs] }];
      for (let i = 0; i < MAX_STEPS; i++) {
        if (cancelRef.current) return;
        const kind = await m.step();
        const last = frames[frames.length - 1];
        const r = m.row();
        const added = m.logs.slice(logs.length).map(l => spectateLogLabel(l, m.lastActor()));
        logs.push(...added);
        if (added.length > 0 || kind === 'finished') {
          frames.push({ row: r, logCount: logs.length, newLogs: added });
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
    } finally {
      setRng(prevRng);
    }
    setProgress(null);
    if (frames.length === 0) { setRec(null); return; }
    const recording: Recording = {
      frames, logs: [...logs], end, error, nameA: a.name, nameB: b.name, seed, firstMode: first, sessionId: crypto.randomUUID(),
    };
    safeSession.set(SPECTATE_FRAME_KEY, '0');
    saveSpectateRecording(recording).catch(e => console.warn('[観戦] 記録の保存に失敗（リロードで戻れません）', e));
    setInitialFrame(0);
    setRec(recording);
  };

  if (restoring) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#fff', backgroundColor: C.bgApp }}>観戦の記録を読み込み中…</div>;
  }

  if (rec) {
    return (
      <Replay rec={rec} cards={cards} initialFrame={initialFrame}
        onClose={() => { safeSession.del(SPECTATE_FRAME_KEY); clearSpectateRecording().catch(() => {}); setRec(null); setStep('CONFIRM'); }}
        onLeave={leave} />
    );
  }

  const primaryBtn: React.CSSProperties = {
    flex: 1.2, padding: '14px 0', borderRadius: 8, border: 'none', backgroundColor: '#28a745',
    color: '#fff', fontSize: 15, fontWeight: 'bold', cursor: 'pointer',
  };
  const ghostBtn: React.CSSProperties = {
    flex: 1, padding: '14px 0', borderRadius: 8, border: '1px solid #333', backgroundColor: 'transparent',
    color: '#aaa', fontSize: 15, cursor: 'pointer',
  };
  const endDialog = (
    <>
      <TopButtons onEnd={() => setShowEnd(true)} />
      <EndReportDialog
        open={showEnd} onClose={() => setShowEnd(false)} onEnd={leave}
        title="観戦を終了しますか？" note="計算中の対戦は失われます" continueLabel="観戦"
      />
    </>
  );

  if (step === 'A' || step === 'B') {
    const picker = step === 'A' ? pickerA : pickerB;
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0f', color: '#ccc' }}>
        {endDialog}
        <div style={{ padding: '20px 20px 0', borderBottom: '1px solid #222' }}>
          <h2 style={{ color: '#fff', margin: '0 0 8px', paddingRight: 90 }}>
            {step === 'A' ? 'CPU A（下）のデッキを選択' : 'CPU B（上）のデッキを選択'}
          </h2>
          <CpuDeckPickerTabs picker={picker} />
        </div>
        <CpuDeckPickerBody picker={picker} cardMap={cardMap} folderThumbnails={folderThumbnails} myUserId={myUserId} />
        {picker.summary && (
          <p data-testid="spectate-pick-summary" style={{ margin: '0 16px', fontSize: 12, color: '#4ade80' }}>{picker.summary}</p>
        )}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #222', display: 'flex', gap: 10 }}>
          <button style={ghostBtn} onClick={() => (step === 'A' ? leave() : setStep('A'))}>戻る</button>
          <button data-testid="spectate-next-step" style={{ ...primaryBtn, opacity: picker.canStart ? 1 : 0.4 }} disabled={!picker.canStart}
            onClick={() => setStep(step === 'A' ? 'B' : 'CONFIRM')}>次へ</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0a0a0f', color: '#ccc' }}>
      {endDialog}
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #222' }}>
        <h2 style={{ color: '#fff', margin: 0, paddingRight: 90 }}>CPU観戦</h2>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([['A（下）', pickerA, 'A'], ['B（上）', pickerB, 'B']] as const).map(([label, pk, s]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid #222', borderRadius: 8, backgroundColor: '#111' }}>
              <span style={{ color: '#888', fontSize: 12, width: 52 }}>CPU {label}</span>
              <span style={{ flex: 1, color: '#fff', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pk.summary}</span>
              <button onClick={() => setStep(s)} disabled={!!progress} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #333', background: 'transparent', color: '#aaa', fontSize: 12 }}>変更</button>
            </div>
          ))}
          <p style={{ color: C.textAlt, fontSize: 13, margin: '8px 0 0' }}>先攻</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['random', 'A', 'B'] as const).map(f => (
              <button key={f} onClick={() => setFirst(f)} disabled={!!progress} style={{
                flex: 1, padding: 10, borderRadius: 6, fontSize: 14,
                border: first === f ? `2px solid ${C.accent}` : C.borderUI,
                backgroundColor: first === f ? C.bgButton : 'transparent', color: C.text,
              }}>{f === 'random' ? 'ランダム' : `CPU ${f}`}</button>
            ))}
          </div>
          <p style={{ color: C.textDim, fontSize: 12, margin: '4px 0 0' }}>1試合を先に計算してから、1手ずつ再生します（数十秒かかります）。</p>
        </div>
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid #222', display: 'flex', gap: 10 }}>
        {progress ? (
          <button style={ghostBtn} onClick={() => { cancelRef.current = true; setProgress(null); }}>中止</button>
        ) : (
          <button style={ghostBtn} onClick={() => setStep('B')}>戻る</button>
        )}
        <button data-testid="spectate-start" onClick={start} disabled={!!progress || !pickerA.canStart || !pickerB.canStart}
          style={{ ...primaryBtn, backgroundColor: progress ? C.disabled : '#28a745' }}>
          {progress ? `計算中… ${progress.steps}手（T${progress.turn}）` : '対戦を計算して観戦'}
        </button>
      </div>
    </div>
  );
}

/** 「この手」の欄の行数（固定）。 */
const FRAME_LINES = 3;
/** その手のログを固定行数へ収める（4行以上は最後の行を「…ほか N 行」にする）。 */
function frameLines(lines: readonly string[]): { text: string; more?: boolean }[] {
  if (lines.length <= FRAME_LINES) return lines.map(text => ({ text }));
  const shown = lines.slice(0, FRAME_LINES - 1).map(text => ({ text }));
  return [...shown, { text: `…ほか${lines.length - shown.length}行（下のログ欄）`, more: true }];
}

const SPEEDS = [
  { label: '0.5秒', ms: 500 },
  { label: '1秒', ms: 1000 },
  { label: '2秒', ms: 2000 },
];

function Replay({ rec, cards, initialFrame, onClose, onLeave }: {
  rec: Recording; cards: CardData[]; initialFrame: number; onClose: () => void; onLeave: () => void;
}) {
  const [idx, setIdx] = useState(initialFrame);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);
  const [showHands, setShowHands] = useState(true);
  const [showEnd, setShowEnd] = useState(false);
  const last = rec.frames.length - 1;
  const frame = rec.frames[idx];
  const bs = frame.row;

  // 手の位置を覚える（リロードでここから再開）。
  useEffect(() => { safeSession.set(SPECTATE_FRAME_KEY, String(idx)); }, [idx]);

  // 自動再生（最後の手で止まる）。報告ダイアログを開いている間は止める。
  useEffect(() => {
    if (!playing || showEnd) return;
    const t = setTimeout(() => {
      if (idx >= last) { setPlaying(false); return; }
      setIdx(i => Math.min(last, i + 1));
    }, speed);
    return () => clearTimeout(t);
  }, [playing, idx, last, speed, showEnd]);

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

  // キーボード（← → で1手・スペースで再生/停止）。ダイアログ中は効かせない（コメント入力の邪魔をしない）。
  useEffect(() => {
    if (showEnd) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { setPlaying(false); setIdx(i => Math.min(last, i + 1)); }
      else if (e.key === 'ArrowLeft') { setPlaying(false); setIdx(i => Math.max(0, i - 1)); }
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, showEnd]);

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

  /** 表示中の手の盤面で報告の行を組む（ログはこの手まで・観戦の情報を添える）。 */
  const buildReport = (tag: Parameters<typeof buildBugReport>[0]['tag'], comment: string) => {
    const gameLogs: GameLog[] = rec.logs.slice(0, frame.logCount).map(action => ({ timestamp: '', user_id: '', action }));
    const extra = rec.end !== 'finished' && idx === last ? `［計算の終わり方: ${rec.end}${rec.error ? ` ${rec.error.split('\n')[0]}` : ''}］` : '';
    const row = buildBugReport({
      bs: { ...bs, room_id: rec.sessionId, game_logs: gameLogs }, myUserId: bs.host_id, tag,
      comment: `[CPU観戦 ${idx}/${last}手目] ${comment}${extra}`.trim(), appVersion: BUILD_ID,
    });
    return {
      ...row,
      snapshot: { ...row.snapshot, spectate: { deckA: rec.nameA, deckB: rec.nameB, frame: idx, totalFrames: last, seed: rec.seed, firstMode: rec.firstMode } },
    };
  };

  const btn: React.CSSProperties = {
    flex: 1, padding: '10px 0', borderRadius: 6, border: C.borderUIMid, backgroundColor: C.bgButton,
    color: C.text, fontSize: 15, cursor: 'pointer',
  };
  const step = (d: number) => { setPlaying(false); setIdx(i => Math.max(0, Math.min(last, i + d))); };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bgApp, color: C.text, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <TopButtons onEnd={() => { setPlaying(false); setShowEnd(true); }} />
      <EndReportDialog
        open={showEnd} onClose={() => setShowEnd(false)} onEnd={onLeave}
        title="観戦を終了しますか？" note="記録した対戦は失われます" continueLabel="観戦"
        buildReport={buildReport}
        sentNote={`${idx}/${last}手目（T${bs.turn_count} / ${bs.turn_phase}）の盤面を保存しました`}
      />
      <div style={{ width: '100%', maxWidth: 520, padding: '6px 8px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* 見出し（右上は最前面の ↺・終了が重なるので空ける） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, paddingRight: 96, height: 26 }}>
          <button onClick={onClose} style={{ background: 'none', border: C.borderUI, color: C.textDimmer, borderRadius: 4, padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>別の対戦</button>
          <span style={{ color: C.textAlt, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            T{bs.turn_count}・{PHASE_LABEL[bs.turn_phase] ?? bs.turn_phase}・手番 {bs.active_user_id === bs.host_id ? 'A' : bs.active_user_id === bs.guest_id ? 'B' : '-'}
          </span>
        </div>

        {/* B（上） */}
        {/* ⚠ライフは盤面に出ている（ユーザー指摘）＝ここはどちらが B かだけ。1行固定（折り返すと盤面がガタつく）。 */}
        <div style={{ fontSize: 11, color: C.textDim, height: 16, lineHeight: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>B「{rec.nameB}」</div>
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
        <div style={{ fontSize: 11, color: C.textDim, height: 16, lineHeight: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>A「{rec.nameA}」</div>

        {/* この手 */}
        {/* 🆕2026-09-22＝**3行で固定**（ユーザー指摘＝2行・3行と変わると、進めるたびに下の操作ボタンがガタつく）。
            長い行は「…」で切り、4行以上は2行＋「…ほか N 行」（全文は下のログ欄）。決着の表示は見出しの行に置く。 */}
        <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 6, padding: '6px 8px', fontSize: 12, lineHeight: '18px' }}>
          <div style={{ display: 'flex', gap: 8, height: 18, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <span style={{ color: C.accentLight, flexShrink: 0 }}>{idx} / {last} 手目</span>
            {endNote && <span style={{ color: rec.end === 'finished' ? C.success : C.warn, fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis' }}>{endNote}</span>}
          </div>
          <div data-testid="spectate-frame-lines" style={{ height: 18 * FRAME_LINES }}>
            {frameLines(frame.newLogs).map((l, i) => (
              <div key={i} style={{ color: l.more ? C.textDim : C.textSub, height: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.text}</div>
            ))}
          </div>
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
          {/* 計算中の例外は最後の手でだけ、ログ欄の末尾に出す（「この手」の欄の高さを変えない）。 */}
          {endNote && rec.error && <pre style={{ color: C.danger, fontSize: 10, whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{rec.error.slice(0, 600)}</pre>}
        </div>
      </div>
    </div>
  );
}
