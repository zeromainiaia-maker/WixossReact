import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import type { User } from '@supabase/supabase-js';
import type { BattleStateRow, PlayerState, CardData, TurnPhase, PendingSpell, PendingEffect, StackEntry, EffectStack } from '../types';
import { buildEffectsMap } from '../data/effectParser';
import { calcFieldPowers, calcActiveCostMods, calcContinuousBlockedActions, checkActiveCondition, collectLrigGrantedEffects } from '../engine/effectEngine';
import { executeEffect, resumeSelectTarget, resumeSearch, resumeChoose, resumeLookAndReorder, removeFromField, getCardNum, type ExecCtx, type ExecResult } from '../engine/effectExecutor';
import { initStack, pushToStack, confirmTurnOrder, confirmOppOrder, shiftQueue, isReadyToResolve, isStackDone } from '../engine/effectStack';
import { hasKeyword, hasBanishResist } from '../utils/keywords';

interface Props {
  user: User;
  roomId: string;
  myDeckId: string;
  cards: CardData[];
  onBack: () => void;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // HTTP環境など crypto.randomUUID が使えない場合のフォールバック
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((b, i) =>
    ([4,6,8,10].includes(i) ? '-' : '') + b.toString(16).padStart(2, '0')
  ).join('');
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// インスタンスIDを意識したMap：CardNum#N のキーに対して自動的にCardNum部分で検索する
class InstanceMap<V> extends Map<string, V> {
  override get(id: string): V | undefined { return super.get(getCardNum(id)); }
  override has(id: string): boolean       { return super.has(getCardNum(id)); }
}

// デッキのカード配列にインスタンスIDを付与する（WD03-009 → WD03-009#1, WD03-009#2, ...）
function assignInstanceIds(cards: string[]): string[] {
  const counts: Record<string, number> = {};
  return cards.map(cn => {
    counts[cn] = (counts[cn] ?? 0) + 1;
    return `${cn}#${counts[cn]}`;
  });
}

// リフレッシュ: トラッシュ全枚数をデッキに加えシャッフル。ライフがあれば一番上をトラッシュへ（バーストなし）。
function applyRefresh(state: PlayerState): PlayerState {
  const newDeck = shuffle([...state.trash]);
  const topLife = state.life_cloth.length > 0 ? state.life_cloth[state.life_cloth.length - 1] : null;
  return {
    ...state,
    deck:       newDeck,
    trash:      topLife ? [topLife] : [],
    life_cloth: topLife ? state.life_cloth.slice(0, -1) : state.life_cloth,
  };
}

// ドロー処理（リフレッシュ対応）。
// デッキ枚数が不足した場合: 残り全枚数をドロー → リフレッシュ → そこで停止（追加ドローは行わない）。
function drawCards(state: PlayerState, count: number): PlayerState {
  if (count <= 0) return state;
  const canDraw = Math.min(count, state.deck.length);
  const drew: PlayerState = {
    ...state,
    hand: [...state.hand, ...state.deck.slice(0, canDraw)],
    deck: state.deck.slice(canDraw),
  };
  return canDraw < count ? applyRefresh(drew) : drew;
}

function jankenWinner(h: string, g: string, hostId: string, guestId: string): string | null {
  if (h === g) return null;
  if (
    (h === 'GU' && g === 'CHOKI') ||
    (h === 'CHOKI' && g === 'PA') ||
    (h === 'PA' && g === 'GU')
  ) return hostId;
  return guestId;
}

// ── テーマカラー（ここで配色を一括管理） ─────────────────────────────
// 値を変えると対応する UI の色がすべて変わります
const C = {
  // 背景
  bgApp:        '#050508',  // アプリ全体
  bgSetup:      '#0a0a0f',  // セットアップ画面
  bgBar:        '#0a0a0d',  // ステータスバー
  bgOpponent:   '#08080e',  // 相手フィールド
  bgSelf:       '#0b0d12',  // 自分フィールド
  bgModal:      '#0d0d14',  // 確認ダイアログ
  bgCard:       '#060d1a',  // カードスロット（カードあり）
  bgCardEmpty:  '#070707',  // カードスロット（空）
  bgButton:     '#1a1a2e',  // ボタン・選択肢
  bgButtonDark: '#111',     // 暗いボタン（閉じる等）
  bgBadge:      '#0a0f1a',  // タップ可能バッジ

  // ボーダー（完全な値）
  borderCard:        '1px solid #2a4a7a',   // カード枠（カードあり）
  borderEmpty:       '1px dashed #1a1a1a',  // カード枠（空）
  borderBadge:       '1px solid #1e3050',   // タップバッジ枠
  borderUI:          '1px solid #333',      // 汎用 UI 枠
  borderUIMid:       '1px solid #444',      // やや濃い UI 枠
  borderPanel:       '1px solid #141414',   // 相手フィールド枠
  borderSelf:        '1px solid #0a1a2e',   // 自分フィールド枠
  borderBar:         '1px solid #111',      // バー下線・ダークボタン枠
  borderBarBtn:      '1px solid #1a1a1a',   // ステータスバー「終了」ボタン枠
  borderMulligan:    '2px solid #333',      // マリガンカード（未選択）
  borderMulliganSel: '2px solid #f44336',   // マリガンカード（選択中）

  // テキスト
  text:         '#fff',     // 主テキスト
  textSub:      '#ddd',     // サブテキスト
  textMuted:    '#ccc',     // 控えめ
  textAlt:      '#aaa',     // 代替色（後攻など）
  textDim:      '#888',     // 薄いテキスト
  textDimmer:   '#666',     // さらに薄い（確認ダイアログ補足）
  textFaint:    '#555',     // かなり薄い
  textUiFaint:  '#444',     // UI 要素（カード番号など）
  textVeryFaint:'#333',     // ほぼ背景（ヒント等）
  textDimmost:  '#222',     // 最も薄いテキスト
  textGhost:    '#1e1e1e',  // ほぼ見えない（空スロットラベル）
  textBadge:    '#688cd2',  // タップバッジのラベル
  textStatDim:  '#adadad',  // 非タップバッジのラベル
  textOpLabel:  '#252525',  // 「相手」パネルラベル
  textMyLabel:  '#152030',  // 「自分」パネルラベル
  statDefault:  '#999',     // 数値バッジのデフォルト色
  disabled:     '#555',     // 無効状態のボタン背景

  // ゲーム状態アクセント
  accent:       '#007bff',  // メインアクセント（青）
  accentLight:  '#7ab8ff',  // 薄い青（手札数など）
  success:      '#4caf50',  // 成功・自分のターン・勝ち
  danger:       '#f44336',  // 危険・負け・選択中
  dangerDark:   '#e53935',  // 濃い赤（引き直しボタン）
  dangerEnd:    '#c0392b',  // 対戦終了ボタン
  life:         '#bb3333',  // ライフクロス
  coin:         '#cc8800',  // コイン（金色）
  aiko:         '#ffcc00',  // じゃんけんあいこ
} as const;

const toHalfWidth = (s: string) =>
  s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));

// グロウコストのパース: "《白》×１《赤》×２" → [{color:'白',count:1},{color:'赤',count:2}]
function parseGrowCost(raw: string): { color: string; count: number }[] {
  if (!raw || raw === 'なし' || raw === '-') return [];
  const result: { color: string; count: number }[] = [];
  for (const m of raw.matchAll(/《([^》]+)》×([０-９\d]+)/g)) {
    if (m[1] === 'コイン') continue; // コインはエナではない。parseCoinCostで別処理
    const count = parseInt(toHalfWidth(m[2]));
    if (count > 0) result.push({ color: m[1], count });
  }
  return result;
}

// EffectText から【グロウ】条件テキストを抽出（次の【】の手前まで）
function extractGrowCondition(effectText?: string): string | null {
  const m = effectText?.match(/【グロウ】([^【]*)/);
  return m ? m[1].trim() : null;
}

// 【グロウ】条件を評価する。認識できないテキスト（グロウ効果など）は true（条件なし）扱い
function checkGrowCondition(
  cond: string | null,
  myState: PlayerState,
  currentLrigName: string | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!cond) return true;

  // ライフクロスが○枚以下
  let m = cond.match(/あなたのライフクロスが([０-９\d]+)枚以下/);
  if (m) return myState.life_cloth.length <= parseInt(toHalfWidth(m[1]));

  // センタールリグがカード名に《X》を含む（CardClass が混在する遊月・肆などでも正確に判定）
  m = cond.match(/あなたのセンタールリグがカード名に《([^》]+)》を含む/);
  if (m) return !!(currentLrigName?.includes(m[1]));

  // トラッシュに○の色のカードが○枚以上ある
  m = cond.match(/あなたのトラッシュに([^\s]+?)のカードが([０-９\d]+)枚以上/);
  if (m) {
    const [, color, nStr] = m;
    const n = parseInt(toHalfWidth(nStr));
    const count = myState.trash.filter(num => cardMap.get(num)?.Color?.includes(color)).length;
    return count >= n;
  }

  // エナゾーンにあるカードが持つ色が○種類以上
  m = cond.match(/あなたのエナゾーンにあるカードが持つ色が([０-９\d]+)種類以上/);
  if (m) {
    const needed = parseInt(toHalfWidth(m[1]));
    const wixossColors = ['白', '赤', '青', '緑', '黒'];
    const colorSet = new Set<string>();
    for (const num of myState.energy) {
      const card = cardMap.get(num);
      for (const c of wixossColors) {
        if (card?.Color?.includes(c)) colorSet.add(c);
      }
    }
    return colorSet.size >= needed;
  }

  // 認識できないパターン（マユの「ルリグを公開し…」等のグロウ効果テキスト）→ 条件なし
  return true;
}

// ルリグのグロウ互換性チェック: CardClass に共通する名前（"/"区切り）が1つでもあれば true
function lrigClassesCompatible(fromClass: string, toClass: string): boolean {
  const fromSet = new Set(fromClass.split('/').map(s => s.trim()).filter(Boolean));
  return toClass.split('/').map(s => s.trim()).some(c => fromSet.has(c));
}

// カードの Restriction チェック: "-" または空なら常に使用可。
// それ以外は「〇〇限定」形式で、現在ルリグの CardClass（"/"区切り）に含まれる名前が
// Restriction 文字列中に存在すれば使用可。
// 例: Restriction="タマ限定", lrigClass="タマ" → true
//     Restriction="タマ限定", lrigClass="タマ/イオナ" → true
//     Restriction="タマ限定", lrigClass="花代" → false
function meetsRestriction(restriction: string, lrigClass: string): boolean {
  if (!restriction || restriction === '-') return true;
  return lrigClass.split('/').map(s => s.trim()).some(cls => restriction.includes(cls));
}


// マルチエナ判定:
// 1. allMulti（WX01-027/WX05-006のような「全エナにマルチエナ付与」効果がフィールドにある）
// 2. カード自身の CONTINUOUS GRANT_KEYWORD マルチエナ（count!='ALL' = 自身のみ）
// 3. EffectText に「：【マルチエナ】」パターン（effects.json 未登録カードへのフォールバック）
// 4. keyword_grants で動的付与された場合
function isMultiEna(cardNum: string, cards: CardData[], keywordGrants?: Record<string, string[]>, allMulti?: boolean): boolean {
  if (allMulti) return true;
  const card = cards.find(c => c.CardNum === getCardNum(cardNum));
  if (card) {
    if (card.effects?.some(e =>
      e.effectType === 'CONTINUOUS' &&
      e.action.type === 'GRANT_KEYWORD' &&
      (e.action as { keyword: string }).keyword === 'マルチエナ' &&
      (e.action as { target: { count: unknown } }).target?.count !== 'ALL'
    )) return true;
    // effects.json 未登録カード用フォールバック：
    // 「【常】：【マルチエナ】」形式（サーバント系）を EffectText から直接検出
    // WX01-027のような「【常】：あなたの〜は【マルチエナ】を持つ」は「：あ」で始まるため非一致
    if (card.EffectText?.includes('：【マルチエナ】')) return true;
  }
  return keywordGrants?.[cardNum]?.includes('マルチエナ') ?? false;
}

function canAffordGrowCost(energyNums: string[], cards: CardData[], growCost: string, keywordGrants?: Record<string, string[]>, allMulti?: boolean): boolean {
  const costs = parseGrowCost(growCost);
  if (costs.length === 0) return true;
  // 色指定コストを先に処理し、マルチエナをワイルドカードとして温存する
  const sorted = [...costs].sort((a, b) => (a.color === '無' ? 1 : 0) - (b.color === '無' ? 1 : 0));
  type P = { color: string; isWild: boolean };
  let pool: P[] = energyNums.map(n => {
    const c = cards.find(cd => cd.CardNum === getCardNum(n));
    return { color: c?.Color ?? '無', isWild: isMultiEna(n, cards, keywordGrants, allMulti) };
  });
  for (const { color, count } of sorted) {
    let needed = count;
    // まず通常カードで充当
    const rem: P[] = [];
    for (const p of pool) {
      if (needed > 0 && !p.isWild && (color === '無' || p.color === color)) needed--;
      else rem.push(p);
    }
    pool = rem;
    // 不足分をマルチエナで補う
    if (needed > 0) {
      const rem2: P[] = [];
      for (const p of pool) {
        if (needed > 0 && p.isWild) needed--;
        else rem2.push(p);
      }
      pool = rem2;
    }
    if (needed > 0) return false;
  }
  return true;
}

function parseCoinCost(costStr: string): number {
  if (!costStr) return 0;
  const toHalf = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
  for (const m of costStr.matchAll(/《コイン》×([０-９\d]+)/g)) return parseInt(toHalf(m[1])) || 0;
  return 0;
}

function parseBetCost(effectText: string): number {
  if (!effectText) return 0;
  const m = effectText.match(/ベット[―─]\s*((?:《コインアイコン》)+)/);
  if (!m) return 0;
  return (m[1].match(/《コインアイコン》/g) ?? []).length;
}

// アンコールコストをパース（エナコスト＋コイン枚数）
function parseEncoreCost(effectText: string): { energy: { color: string; count: number }[]; coins: number } | null {
  if (!effectText.startsWith('アンコール－')) return null;
  const afterDash = effectText.slice('アンコール－'.length);
  // 「（」か漢字テキストの直前まで（アイコン部分のみ）
  const beforeContent = afterDash.split(/[（。【]/)[0];
  const ENERGY_COLORS = new Set(['白', '赤', '青', '緑', '黒', '無']);
  const energy: { color: string; count: number }[] = [];
  let coins = 0;
  const re = /《([^》]+)》/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(beforeContent)) !== null) {
    if (m[1] === 'コインアイコン') { coins++; continue; }
    if (ENERGY_COLORS.has(m[1])) { energy.push({ color: m[1], count: 1 }); continue; }
    const inner = m[1].match(/^([白赤青緑黒無])×([０-９0-9]+)$/);
    if (inner) {
      const cnt = parseInt(inner[2].replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0x30 - 0xFEE0)));
      energy.push({ color: inner[1], count: isNaN(cnt) ? parseInt(inner[2]) : cnt });
    }
  }
  return (energy.length > 0 || coins > 0) ? { energy, coins } : null;
}

// コスト増加修正を考慮してエナを追加消費できるか確認
function canAffordWithExtraCost(
  energyNums: string[],
  cards: CardData[],
  baseCost: string,
  extraCosts: { color: string; count: number }[],
  keywordGrants?: Record<string, string[]>,
  allMulti?: boolean,
): boolean {
  if (extraCosts.length === 0) return canAffordGrowCost(energyNums, cards, baseCost, keywordGrants, allMulti);
  // 追加コスト分をプールから引いてから基本コストをチェック
  let pool = [...energyNums];
  for (const { color, count } of extraCosts) {
    let needed = count;
    const rem: string[] = [];
    for (const n of pool) {
      if (needed > 0) {
        const cd = cards.find(c => c.CardNum === getCardNum(n));
        const cardColor = cd?.Color ?? '無';
        if (color === '無' || cardColor.includes(color)) { needed--; continue; }
      }
      rem.push(n);
    }
    pool = rem;
    if (needed > 0) return false;
  }
  return canAffordGrowCost(pool, cards, baseCost, keywordGrants, allMulti);
}

const JANKEN_LABEL: Record<string, string> = { GU: 'グー✊', CHOKI: 'チョキ✌', PA: 'パー✋' };
const PHASE_LABEL: Record<string, string> = {
  UP: 'アップ', DRAW: 'ドロー', ENERGY: 'エナ', GROW: 'グロウ', MAIN: 'メイン',
  ATTACK_ARTS:    'アーツステップ(自分)',
  ATTACK_ARTS_OP: 'アーツステップ(相手)',
  ATTACK_SIGNI: 'シグニアタック', ATTACK_LRIG: 'ルリグアタック', END: 'エンド',
};

const PHASE_BTN: Record<TurnPhase, string> = {
  UP: 'ドローフェイズへ', DRAW: 'エナフェイズへ', ENERGY: 'グロウフェイズへ',
  GROW: 'メインフェイズへ', MAIN: 'アタックフェイズへ',
  ATTACK_ARTS:    'アーツ終了→相手へ',
  ATTACK_ARTS_OP: 'アーツ終了',
  ATTACK_SIGNI: 'ルリグアタックへ', ATTACK_LRIG: 'エンドフェイズへ', END: 'ターン終了',
};

const PHASE_NEXT: Record<TurnPhase, TurnPhase> = {
  UP: 'DRAW', DRAW: 'ENERGY', ENERGY: 'GROW', GROW: 'MAIN',
  MAIN: 'ATTACK_ARTS',
  ATTACK_ARTS: 'ATTACK_ARTS_OP', ATTACK_ARTS_OP: 'ATTACK_SIGNI',
  ATTACK_SIGNI: 'ATTACK_LRIG', ATTACK_LRIG: 'END', END: 'UP',
};

// 非ターンプレイヤーが進行ボタンを持つフェイズ
const NON_TURN_PLAYER_PHASES: TurnPhase[] = ['ATTACK_ARTS_OP'];

// 待機中メッセージ（自分がボタンを持たないフェイズ）
const WAITING_MSG: Partial<Record<TurnPhase, string>> = {
  ATTACK_ARTS_OP: '相手のアーツステップ待機中...',
};

const setupWrap: React.CSSProperties = {
  height: '100vh', display: 'flex', flexDirection: 'column',
  justifyContent: 'center', alignItems: 'center',
  backgroundColor: C.bgSetup, gap: 20, color: C.textMuted,
  padding: 24, boxSizing: 'border-box',
};

const primaryBtn: React.CSSProperties = {
  padding: '12px 32px', borderRadius: 8, border: 'none',
  backgroundColor: C.accent, color: C.text, fontSize: 15,
  fontWeight: 'bold', cursor: 'pointer',
};

// ─── フェイズアクション定義 ───────────────────────────────────────────
interface CardAction {
  label: string;
  color?: string;
  onClick: () => void;
}

// ─── カード拡大モーダル ─────────────────────────────────────────────
// createPortal で document.body 直下に描画し、親のスタッキングコンテキストから脱出させる
function CardModal({ card, onClose, actions }: { card: CardData; onClose: () => void; actions?: CardAction[] }) {
  return createPortal(
    <div
      onClick={onClose}
      onTouchEnd={e => { e.preventDefault(); onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        backgroundColor: 'rgba(0,0,0,0.95)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <img
        src={card.ImgURL} alt={card.CardName}
        style={{ maxWidth: '90vw', maxHeight: '62vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 0 40px #007bff44' }}
        onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
      />
      <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', marginTop: 14, textAlign: 'center' }}>{card.CardName}</p>
      <p style={{ color: C.textFaint, fontSize: 11, margin: '4px 0 0', textAlign: 'center' }}>
        {card.CardNum} / {card.Type}{card.Level ? ` Lv.${card.Level}` : ''} / {card.Color}
      </p>
      {actions && actions.length > 0 && (
        <div
          onClick={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
          {actions.map((act, i) => (
            <button key={i}
              onClick={() => { act.onClick(); onClose(); }}
              onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); act.onClick(); onClose(); }}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                backgroundColor: act.color ?? C.accent, color: C.text,
                fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
              }}>
              {act.label}
            </button>
          ))}
        </div>
      )}
      <p style={{ color: C.textVeryFaint, fontSize: 11, marginTop: 10 }}>タップして閉じる</p>
    </div>,
    document.body,
  );
}

// ─── CardStackModal: スタックカード拡大（スワイプで上下移動） ──────────
function CardStackModal({ stack, cards, onClose, actions }: {
  stack: string[];
  cards: CardData[];
  onClose: () => void;
  actions?: CardAction[];
}) {
  const [idx, setIdx] = useState(stack.length - 1);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const card = cards.find(c => c.CardNum === getCardNum(stack[idx]));
  const isTop = idx === stack.length - 1;
  const isBottom = idx === 0;
  const hasStack = stack.length > 1;

  const goDeeper  = () => setIdx(i => Math.max(0, i - 1));
  const goShallow = () => setIdx(i => Math.min(stack.length - 1, i + 1));

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    touchStart.current = null;
    if (dist < 12) { onClose(); return; }
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx < -40) goDeeper(); else if (dx > 40) goShallow();
    } else {
      if (dy > 40) goDeeper(); else if (dy < -40) goShallow();
    }
  };

  return createPortal(
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        backgroundColor: 'rgba(0,0,0,0.95)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 20, userSelect: 'none',
      }}
    >
      {hasStack && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }} onClick={e => e.stopPropagation()}>
          {[...stack].reverse().map((_, ri) => {
            const si = stack.length - 1 - ri;
            return (
              <div key={ri} onClick={e => { e.stopPropagation(); setIdx(si); }}
                style={{
                  width: 9, height: 9, borderRadius: '50%', cursor: 'pointer',
                  backgroundColor: si === idx ? C.accent : C.textVeryFaint,
                  border: si === idx ? '1px solid #7ab8ff' : '1px solid #222',
                }} />
            );
          })}
        </div>
      )}
      <div style={{ color: C.textFaint, fontSize: 10, marginBottom: 6, textAlign: 'center' }}>
        {isTop ? '最上層（アクティブ）' : isBottom ? '最下層' : `上から${stack.length - idx}枚目`}
        {hasStack && <span style={{ color: C.textVeryFaint, marginLeft: 8 }}>{idx + 1} / {stack.length}</span>}
      </div>
      {card ? (
        <img
          src={card.ImgURL} alt={card.CardName}
          onClick={e => e.stopPropagation()}
          style={{ maxWidth: '86vw', maxHeight: '66vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 0 40px #007bff44' }}
          onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
        />
      ) : (
        <div style={{ width: 200, height: 280, backgroundColor: C.bgButtonDark, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => e.stopPropagation()}>
          <span style={{ color: C.textUiFaint, fontSize: 12 }}>{stack[idx]}</span>
        </div>
      )}
      <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', marginTop: 12, textAlign: 'center' }}>
        {card?.CardName ?? stack[idx]}
      </p>
      <p style={{ color: C.textFaint, fontSize: 11, margin: '4px 0 0', textAlign: 'center' }}>
        {card?.CardNum} / {card?.Type}{card?.Level ? ` Lv.${card.Level}` : ''} / {card?.Color}
      </p>
      {actions && actions.length > 0 && (
        <div
          onClick={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
          style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
          {actions.map((act, i) => (
            <button key={i}
              onClick={() => { act.onClick(); onClose(); }}
              onTouchEnd={e => { e.preventDefault(); e.stopPropagation(); act.onClick(); onClose(); }}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none',
                backgroundColor: act.color ?? C.accent, color: C.text,
                fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
              {act.label}
            </button>
          ))}
        </div>
      )}
      <p style={{ color: C.textDimmost, fontSize: 10, marginTop: 12 }}>
        {hasStack ? 'スワイプで移動 / タップで閉じる' : 'タップして閉じる'}
      </p>
    </div>,
    document.body,
  );
}

// ─── CardSlot: フィールド用（長押しで拡大） ─────────────────────────
interface CardSlotProps {
  cardNum: string | null;
  cards: CardData[];
  width?: number;
  height?: number;
  label?: string;
  faceDown?: boolean;
  actions?: CardAction[];
}

function CardSlot({ cardNum, cards, width = 60, height = 84, label, faceDown, actions }: CardSlotProps) {
  const [enlarged, setEnlarged] = useState(false);
  const touchPos = useRef<{ x: number; y: number } | null>(null);
  const card = cardNum ? cards.find(c => c.CardNum === getCardNum(cardNum)) : null;

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    touchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchPos.current || !cardNum || faceDown) { touchPos.current = null; return; }
    const dx = e.changedTouches[0].clientX - touchPos.current.x;
    const dy = e.changedTouches[0].clientY - touchPos.current.y;
    touchPos.current = null;
    if (Math.sqrt(dx * dx + dy * dy) < 10) setEnlarged(true);
  };

  return (
    <>
      <div
        style={{
          width, height, flexShrink: 0, borderRadius: 4, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: cardNum ? C.borderCard : C.borderEmpty,
          backgroundColor: cardNum ? C.bgCard : C.bgCardEmpty,
          userSelect: 'none', touchAction: 'none',
          cursor: cardNum && !faceDown ? 'pointer' : 'default',
        }}
        onClick={() => { if (cardNum && !faceDown) setEnlarged(true); }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { touchPos.current = null; }}
      >
        {faceDown && cardNum ? (
          <img src="/Card_Black.jpg" alt="card back" draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block' }} />
        ) : card ? (
          <img src={card.ImgURL} alt={card.CardName} draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15'; }}
          />
        ) : (
          <span style={{ fontSize: 8, color: C.textGhost, textAlign: 'center', padding: 2, lineHeight: 1.3 }}>{label}</span>
        )}
      </div>
      {enlarged && card && <CardModal card={card} onClose={() => setEnlarged(false)} actions={actions} />}
    </>
  );
}

// ─── StackSlot: ルリグ・アシストルリグ用スタックスロット ─────────────
interface StackSlotProps {
  stack: string[];
  cards: CardData[];
  width?: number;
  height?: number;
  label?: string;
  faceDown?: boolean;
  actions?: CardAction[];
  isDown?: boolean;
  isFrozen?: boolean;
}

function StackSlot({ stack, cards, width = 60, height = 84, label, faceDown, actions, isDown = false, isFrozen = false }: StackSlotProps) {
  const [showModal, setShowModal] = useState(false);
  const touchPos = useRef<{ x: number; y: number } | null>(null);

  const topCard = stack.length > 0 ? stack[stack.length - 1] : null;
  const card = topCard ? cards.find(c => c.CardNum === getCardNum(topCard)) : null;

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    touchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchPos.current || !topCard || faceDown) { touchPos.current = null; return; }
    const dx = e.changedTouches[0].clientX - touchPos.current.x;
    const dy = e.changedTouches[0].clientY - touchPos.current.y;
    touchPos.current = null;
    if (Math.sqrt(dx * dx + dy * dy) < 10) setShowModal(true);
  };

  return (
    <>
      <div style={{ position: 'relative', width, flexShrink: 0 }}>
        <div
          style={{
            width, height, borderRadius: 4, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: topCard ? C.borderCard : C.borderEmpty,
            backgroundColor: topCard ? C.bgCard : C.bgCardEmpty,
            userSelect: 'none', touchAction: 'none',
            cursor: topCard && !faceDown ? 'pointer' : 'default',
          }}
          onClick={() => { if (topCard && !faceDown) setShowModal(true); }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => { touchPos.current = null; }}
        >
          {faceDown && topCard ? (
            <img src="/Card_Black.jpg" alt="card back" draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block' }} />
          ) : card ? (
            <img src={card.ImgURL} alt={card.CardName} draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block',
                ...(isDown ? { transform: 'rotate(90deg)' } : {}) }}
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15'; }}
            />
          ) : (
            <span style={{ fontSize: 8, color: C.textGhost, textAlign: 'center', padding: 2, lineHeight: 1.3 }}>{label}</span>
          )}
        </div>
        {stack.length > 1 && (
          <div style={{
            position: 'absolute', bottom: 2, right: 2,
            backgroundColor: C.accent, color: C.text,
            fontSize: 8, fontWeight: 'bold', borderRadius: 3,
            padding: '1px 3px', lineHeight: 1, pointerEvents: 'none',
          }}>
            ×{stack.length}
          </div>
        )}
        {isFrozen && (
          <div style={{
            position: 'absolute', bottom: 2, left: 0, right: 0,
            backgroundColor: 'rgba(100,180,255,0.88)', color: '#003366',
            fontSize: 8, fontWeight: 'bold', textAlign: 'center',
            pointerEvents: 'none', lineHeight: '13px',
          }}>
            凍結
          </div>
        )}
      </div>
      {showModal && topCard && (
        <CardStackModal stack={stack} cards={cards} onClose={() => setShowModal(false)} actions={actions} />
      )}
    </>
  );
}

// ─── StackedSigniSlot: シグニゾーン用スタックスロット ──────────────
const SIGNI_STACK_OFFSET = 4; // スタック1枚あたりのずらし量(px)

interface StackedSigniSlotProps {
  stack: string[] | null;
  cards: CardData[];
  width?: number;
  height?: number;
  label?: string;
  actions?: CardAction[];
  isDown?: boolean;
  isFrozen?: boolean;
  isAbilityRemoved?: boolean;
  effectivePowers?: Map<string, number>;
  charmCardNum?: string | null;
  acceCardNum?: string | null;
  virusCount?: number;
  isMe?: boolean;
}

function StackedSigniSlot({ stack, cards, width = 82, height = 82, label, actions, isDown = false, isFrozen = false, isAbilityRemoved = false, effectivePowers, charmCardNum, acceCardNum, virusCount = 0, isMe }: StackedSigniSlotProps) {
  const [showModal, setShowModal] = useState(false);
  const [showCharmModal, setShowCharmModal] = useState(false);
  const touchPos = useRef<{ x: number; y: number } | null>(null);

  const n = stack?.length ?? 0;
  const extraH = Math.max(0, n - 1) * SIGNI_STACK_OFFSET;

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    touchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (!touchPos.current || !n) { touchPos.current = null; return; }
    const dx = e.changedTouches[0].clientX - touchPos.current.x;
    const dy = e.changedTouches[0].clientY - touchPos.current.y;
    touchPos.current = null;
    if (Math.sqrt(dx * dx + dy * dy) < 10) setShowModal(true);
  };

  if (!n) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          width, height, flexShrink: 0, borderRadius: charmCardNum ? '4px 4px 0 0' : 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: C.borderEmpty, backgroundColor: C.bgCardEmpty,
        }}>
          <span style={{ fontSize: 8, color: C.textGhost, textAlign: 'center', padding: 2, lineHeight: 1.3 }}>{label}</span>
        </div>
        {charmCardNum && (
          <CharmPeek width={width} onTap={() => setShowCharmModal(true)} />
        )}
        {showCharmModal && charmCardNum && (
          <CharmModal cardNum={charmCardNum} cards={cards} isMe={!!isMe} onClose={() => setShowCharmModal(false)} />
        )}
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        style={{
          position: 'relative', width, height: height + extraH, flexShrink: 0,
          userSelect: 'none', touchAction: 'none', cursor: 'pointer',
          borderRadius: charmCardNum ? '4px 4px 0 0' : 4,
        }}
        onClick={() => { if (n) setShowModal(true); }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { touchPos.current = null; }}
      >
        {/* i=0=最下層, i=n-1=最上層(アクティブ)。最上層が最前面・最下端に表示 */}
        {stack!.map((cardNum, i) => {
          const card = cards.find(c => c.CardNum === getCardNum(cardNum));
          const top = (n - 1 - i) * SIGNI_STACK_OFFSET;
          const isTopCard = i === n - 1;
          const imgTransform = isDown && isTopCard ? 'rotate(90deg)' : undefined;
          return (
            <div key={i} style={{
              position: 'absolute', top, left: 0,
              width, height, borderRadius: 4, overflow: 'hidden',
              zIndex: i + 1,
              border: C.borderCard, backgroundColor: C.bgCard,
            }}>
              {card ? (
                <img src={card.ImgURL} alt={card.CardName} draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block',
                    ...(imgTransform ? { transform: imgTransform } : {}) }}
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15'; }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 8, color: C.textVeryFaint }}>{cardNum}</span>
                </div>
              )}
            </div>
          );
        })}
        {/* パワー表示（スタック最前面カード） */}
        {(() => {
          const topNum = stack![n - 1];
          const topCard = cards.find(c => c.CardNum === getCardNum(topNum));
          const basePow = topCard?.Power;
          if (!basePow || basePow === '-') return null;
          const effPow = effectivePowers?.get(topNum);
          const rawPow = effPow !== undefined ? effPow : parseInt(basePow, 10);
          const displayPow = Math.max(0, rawPow);
          const isBuffed = effPow !== undefined && effPow !== parseInt(basePow, 10);
          return (
            <div style={{
              position: 'absolute',
              bottom: extraH + 3,
              left: 0, right: 0,
              textAlign: 'center',
              zIndex: n + 1,
              pointerEvents: 'none',
              fontSize: 13,
              fontWeight: 'bold',
              color: isBuffed ? (effPow! > parseInt(basePow, 10) ? '#003300' : '#330000') : '#000000',
              lineHeight: 1,
              textShadow: [
                '-1px -1px 0 #fff', '1px -1px 0 #fff',
                '-1px  1px 0 #fff', '1px  1px 0 #fff',
                ' 0px -1px 0 #fff', '0px  1px 0 #fff',
                '-1px  0px 0 #fff', '1px  0px 0 #fff',
              ].join(', '),
            }}>
              {displayPow.toLocaleString()}
            </div>
          );
        })()}
        {n > 1 && (
          <div style={{
            position: 'absolute', top: extraH + 2, right: 2,
            backgroundColor: C.accent, color: C.text,
            fontSize: 8, fontWeight: 'bold', borderRadius: 3,
            padding: '1px 3px', lineHeight: 1, pointerEvents: 'none',
            zIndex: n + 2,
          }}>
            ×{n}
          </div>
        )}
        {isFrozen && (
          <div style={{
            position: 'absolute', bottom: extraH + 2, left: 0, right: 0,
            backgroundColor: 'rgba(100,180,255,0.88)', color: '#003366',
            fontSize: 8, fontWeight: 'bold', textAlign: 'center',
            pointerEvents: 'none', zIndex: n + 2, lineHeight: '13px',
          }}>
            凍結
          </div>
        )}
        {isAbilityRemoved && (
          <div style={{
            position: 'absolute', top: extraH + 2, left: 0, right: 0,
            backgroundColor: 'rgba(80,0,80,0.82)', color: '#ffaaff',
            fontSize: 7, fontWeight: 'bold', textAlign: 'center',
            pointerEvents: 'none', zIndex: n + 2, lineHeight: '13px',
          }}>
            能力消去
          </div>
        )}
        {virusCount > 0 && (
          <div style={{
            position: 'absolute', top: extraH + 2, right: 2,
            backgroundColor: 'rgba(180,0,0,0.88)', color: '#fff',
            fontSize: 8, fontWeight: 'bold', borderRadius: 3,
            padding: '1px 3px', lineHeight: 1, pointerEvents: 'none', zIndex: n + 3,
          }}>
            V
          </div>
        )}
        {acceCardNum && (
          <div style={{
            position: 'absolute', bottom: extraH + 2, right: 2,
            backgroundColor: 'rgba(0,120,60,0.9)', color: '#fff',
            fontSize: 7, fontWeight: 'bold', borderRadius: 3,
            padding: '1px 3px', lineHeight: 1, pointerEvents: 'none', zIndex: n + 3,
          }}>
            ACE
          </div>
        )}
      </div>
      {charmCardNum && (
        <CharmPeek width={width}
          onTap={() => setShowCharmModal(true)} />
      )}
      </div>
      {showModal && stack && (
        <CardStackModal stack={stack} cards={cards} onClose={() => setShowModal(false)} actions={actions} />
      )}
      {showCharmModal && charmCardNum && (
        <CharmModal cardNum={charmCardNum} cards={cards} isMe={!!isMe} onClose={() => setShowCharmModal(false)} />
      )}
    </>
  );
}

// ─── CharmPeek: チャームカードの覗き表示（シグニ下に裏向きで重ねる） ──
const CHARM_PEEK_H = 20;
function CharmPeek({ width, onTap }: { width: number; onTap: () => void; }) {
  const touchPos = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      style={{
        width, height: CHARM_PEEK_H, overflow: 'hidden', flexShrink: 0,
        cursor: 'pointer', borderRadius: '0 0 4px 4px',
        border: '1px solid rgba(100,150,255,0.35)', borderTop: 'none',
        touchAction: 'none', userSelect: 'none',
      }}
      onClick={onTap}
      onTouchStart={e => { e.preventDefault(); touchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={e => {
        e.preventDefault();
        if (!touchPos.current) return;
        const dx = e.changedTouches[0].clientX - touchPos.current.x;
        const dy = e.changedTouches[0].clientY - touchPos.current.y;
        touchPos.current = null;
        if (Math.sqrt(dx * dx + dy * dy) < 10) onTap();
      }}
      onTouchCancel={() => { touchPos.current = null; }}
    >
      <img
        src="/Card_Black.jpg"
        alt="charm"
        draggable={false}
        style={{ width: '100%', height: Math.round(width * 1.4), objectFit: 'cover', objectPosition: 'top',
          display: 'block', pointerEvents: 'none' }}
      />
    </div>
  );
}

// ─── CharmModal: チャームタップ時モーダル ──────────────────────────
function CharmModal({ cardNum, cards, isMe, onClose }: {
  cardNum: string; cards: CardData[]; isMe: boolean; onClose: () => void;
}) {
  const card = cards.find(c => c.CardNum === getCardNum(cardNum));
  if (isMe && card) return <CardModal card={card} onClose={onClose} />;
  return createPortal(
    <div
      onClick={onClose}
      onTouchEnd={e => { e.preventDefault(); onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 3000,
        backgroundColor: 'rgba(0,0,0,0.95)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <img src="/Card_Black.jpg" alt="charm back" draggable={false}
        style={{ maxWidth: '90vw', maxHeight: '62vh', objectFit: 'contain', borderRadius: 10 }} />
      <p style={{ color: C.textFaint, fontSize: 12, marginTop: 12 }}>チャーム（非公開）</p>
    </div>,
    document.body,
  );
}

// ─── MulliganCard: マリガン用（タップで選択、長押しで拡大） ────────
function MulliganCard({ cardNum, cards, selected, onToggle }: {
  cardNum: string;
  cards: CardData[];
  selected: boolean;
  onToggle: () => void;
}) {
  const [enlarged, setEnlarged] = useState(false);
  const longPressed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const card = cards.find(c => c.CardNum === getCardNum(cardNum));

  const handleStart = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setEnlarged(true);
      timer.current = null;
    }, 400);
  };
  const handleEnd = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      if (!longPressed.current) onToggle();
    }
  };
  const handleCancel = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  return (
    <>
      <div
        style={{
          width: 90, height: 126, position: 'relative', flexShrink: 0, borderRadius: 6,
          overflow: 'hidden', userSelect: 'none', touchAction: 'none', boxSizing: 'border-box',
          border: selected ? C.borderMulliganSel : C.borderMulligan,
          cursor: 'pointer',
        }}
        onMouseDown={handleStart} onMouseUp={handleEnd} onMouseLeave={handleCancel}
        onTouchStart={e => { e.preventDefault(); handleStart(); }}
        onTouchEnd={e => { e.preventDefault(); handleEnd(); }}
        onTouchCancel={handleCancel}
      >
        {card ? (
          <img src={card.ImgURL} alt={card.CardName} draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 9, color: C.textFaint, textAlign: 'center', padding: 4 }}>{cardNum}</span>
          </div>
        )}
        {selected && (
          <div style={{
            position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 'bold', color: C.text, textShadow: '0 1px 4px #000' }}>戻す</span>
          </div>
        )}
      </div>
      {enlarged && card && <CardModal card={card} onClose={() => setEnlarged(false)} />}
    </>
  );
}

// ─── 手札表示（枚数に応じてカードを重ねて1行に収める） ──────────────
function HandCards({ cardNums, cards, faceDown, getCardActions }: {
  cardNums: string[];
  cards: CardData[];
  faceDown?: boolean;
  getCardActions?: (cardNum: string, index: number) => CardAction[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setCw(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setCw(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardW = 50;
  const cardH = 70;
  const n = cardNums.length;

  // カード左端の間隔: 全カードが container 幅に収まるよう自動縮小、最大は cardW+4
  const spacing = n <= 1
    ? 0
    : Math.min(cardW + 4, cw > cardW ? (cw - cardW) / (n - 1) : 4);

  return (
    <div ref={containerRef} style={{ width: '100%', height: n > 0 ? cardH : 0, flexShrink: 0 }}>
      {n > 0 && (
        <div style={{ position: 'relative', height: cardH, width: '100%' }}>
          {cardNums.map((num, i) => (
            <div key={i} style={{ position: 'absolute', left: i * spacing, top: 0, zIndex: i }}>
              <CardSlot cardNum={num} cards={cards} width={cardW} height={cardH} faceDown={faceDown}
                actions={!faceDown && getCardActions ? getCardActions(num, i) : undefined} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 数値バッジ ──────────────────────────────────────────────────────
function Stat({ label, value, color = C.statDefault, onClick }: {
  label: string; value: number; color?: string; onClick?: () => void;
}) {
  return onClick ? (
    <div
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        padding: '5px 5px', borderRadius: 7,
        backgroundColor: C.bgBadge, border: C.borderBadge,
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 'bold', color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 8, color: C.textBadge, lineHeight: 1 }}>{label}</span>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '3px 4px' }}>
      <span style={{ fontSize: 13, fontWeight: 'bold', color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 8, color: C.textStatDim, lineHeight: 1 }}>{label}</span>
    </div>
  );
}

// ─── ZoneCardModal: ゾーンのカード一覧 ──────────────────────────────
function ZoneCardModal({ title, cardNums, cards, onClose, getCardActions }: {
  title: string;
  cardNums: string[];
  cards: CardData[];
  onClose: () => void;
  getCardActions?: (cardNum: string) => CardAction[];
}) {
  return createPortal(
    <div
      onClick={onClose}
      onTouchEnd={e => { e.preventDefault(); onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 2500,
        backgroundColor: 'rgba(0,0,0,0.93)',
        display: 'flex', flexDirection: 'column',
        padding: '14px 12px', boxSizing: 'border-box',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
        <span style={{ color: C.textSub, fontWeight: 'bold', fontSize: 15 }}>
          {title}
          <span style={{ color: C.textUiFaint, fontSize: 12, fontWeight: 'normal', marginLeft: 8 }}>{cardNums.length}枚</span>
        </span>
        <button onClick={onClose}
          style={{ padding: '5px 16px', borderRadius: 6, border: C.borderUI, backgroundColor: C.bgButtonDark, color: C.textDim, cursor: 'pointer', fontSize: 13 }}>
          閉じる
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {cardNums.length === 0 ? (
          <p style={{ color: C.textVeryFaint, textAlign: 'center', marginTop: 40, fontSize: 13 }}>カードなし</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {cardNums.map((num, i) => (
              <div key={i}
                onClick={e => e.stopPropagation()}
                onTouchEnd={e => e.stopPropagation()}>
                <CardSlot cardNum={num} cards={cards} width={62} height={87}
                  actions={getCardActions ? getCardActions(num) : undefined} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── プレイヤー盤面 ──────────────────────────────────────────────────
// 自分:  上段=シグニ×3(中央寄り)  下段=CHECK|AL|LRIG|AR|KEY
// 相手:  上段=KEY|AR|LRIG|AL|CHECK  下段=シグニ×3(中央寄り、左右反転)
// ※ signi[0] は所有者視点で「左端」なので、相手表示時は逆順にして
//   画面上の左右を正しく合わせる。他のゾーンも同様に反転する。
function PlayerField({ state, cards, isMe, getSigniZoneActions, getLrigDeckCardActions, getLrigFieldActions, getKeyPieceActions, getAssistLActions, getAssistRActions, getFreeZoneActions, closeZoneSignal, effectivePowers }: {
  state: PlayerState; cards: CardData[]; isMe: boolean;
  getSigniZoneActions?: (rawZoneIdx: number) => CardAction[];
  getLrigDeckCardActions?: (cardNum: string) => CardAction[];
  getLrigFieldActions?: () => CardAction[];
  getKeyPieceActions?: () => CardAction[];
  getAssistLActions?: () => CardAction[];
  getAssistRActions?: () => CardAction[];
  getFreeZoneActions?: (cardNum: string) => CardAction[];
  closeZoneSignal?: number;
  effectivePowers?: Map<string, number>;
}) {
  const [zoneModal, setZoneModal] = useState<{
    title: string; cardNums: string[]; isLrigDeck?: boolean; isFreeZone?: boolean;
  } | null>(null);

  useEffect(() => {
    if (closeZoneSignal) setZoneModal(null);
  }, [closeZoneSignal]);
  const signiW = 82, signiH = 82;
  const lowerW = 58, lowerH = 58;
  const lrigW  = 70, lrigH  = 70;

  const showZone = (title: string, cardNums: string[]) => setZoneModal({ title, cardNums });

  const statsRow = (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap', padding: '2px 0', alignItems: 'center' }}>
      <Stat label="手札"        value={state.hand.length} color="#7ab8ff" />
      <Stat label="デッキ"      value={state.deck.length} />
      {isMe
        ? <Stat label="ルリグDK" value={state.lrig_deck.length} onClick={() => setZoneModal({ title: 'ルリグデッキ', cardNums: state.lrig_deck, isLrigDeck: true })} />
        : <Stat label="ルリグDK" value={state.lrig_deck.length} />
      }
      <Stat label="ライフ"      value={state.life_cloth.length} color="#bb3333" />
      <Stat label="エナ"        value={state.energy.length}     onClick={() => showZone('エナゾーン', state.energy)} />
      <Stat label="トラッシュ"  value={state.trash.length}      onClick={() => showZone('トラッシュ', state.trash)} />
      <Stat label="Lトラッシュ" value={state.lrig_trash.length} onClick={() => showZone('ルリグトラッシュ', state.lrig_trash)} />
      <Stat label="コイン"      value={state.coins} color="#cc8800" />
    </div>
  );

  // 相手表示時はシグニ配列を左右反転
  const rawSigni = state.field.signi ?? [null, null, null];
  const displaySigni = isMe ? rawSigni : [...rawSigni].reverse();
  const freeZoneCards = state.field.free_zone ?? [];
  const freeZoneW = 52, freeZoneH = signiH;

  // フリーゾーンスロット（シグニ行の左端に配置）
  const freeZoneSlot = (
    <div
      onClick={() => freeZoneCards.length > 0 && setZoneModal({ title: 'フリーゾーン', cardNums: freeZoneCards, isFreeZone: isMe })}
      style={{
        width: freeZoneW, height: freeZoneH, borderRadius: 6, flexShrink: 0,
        border: freeZoneCards.length > 0 ? '1px solid #5599bb' : '1px dashed #334455',
        backgroundColor: freeZoneCards.length > 0 ? 'rgba(40,80,100,0.35)' : 'rgba(20,30,40,0.2)',
        cursor: freeZoneCards.length > 0 ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
      {freeZoneCards.length > 0 ? (
        <>
          <img
            src={cards.find(c => c.CardNum === getCardNum(freeZoneCards[freeZoneCards.length - 1]))?.ImgURL ?? ''}
            alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            {freeZoneCards.some(n => state.keyword_grants?.[n]?.includes('チアガール')) && (
              <div style={{ fontSize: 8, color: '#aaddff', fontWeight: 'bold', marginBottom: 2 }}>CHEER</div>
            )}
            <div style={{
              backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, padding: '1px 5px',
              fontSize: 11, color: '#fff', fontWeight: 'bold',
            }}>{freeZoneCards.length}</div>
          </div>
        </>
      ) : (
        <span style={{ fontSize: 8, color: '#334455', textAlign: 'center', lineHeight: 1.3 }}>FREE<br/>ZONE</span>
      )}
    </div>
  );

  const signiRow = (
    <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
      {freeZoneSlot}
      {displaySigni.map((s, i) => {
        // isMe=true のとき displayIndex = rawIndex、isMe=false のとき逆順
        const rawIdx = isMe ? i : (rawSigni.length - 1 - i);
        return (
          <StackedSigniSlot key={i} stack={s} cards={cards} width={signiW} height={signiH}
            label={`シグニ${i + 1}`}
            actions={getSigniZoneActions ? getSigniZoneActions(rawIdx) : undefined}
            isDown={state.field.signi_down?.[rawIdx] ?? false}
            isFrozen={state.field.signi_frozen?.[rawIdx] ?? false}
            isAbilityRemoved={s ? s.some(num => state.abilities_removed?.includes(num)) : false}
            effectivePowers={effectivePowers}
            charmCardNum={state.field.signi_charms?.[rawIdx] ?? null}
            acceCardNum={state.field.signi_acce?.[rawIdx] ?? null}
            virusCount={state.field.signi_virus?.[rawIdx] ?? 0}
            isMe={isMe} />
        );
      })}
      {/* バランス用スペーサー（フリーゾーン分） */}
      <div style={{ width: freeZoneW, flexShrink: 0 }} />
    </div>
  );

  // 下段5ゾーン。相手表示時は左右をまるごと反転する。
  const check     = state.field.check ?? null;
  const assist_l  = state.field.assist_lrig_l ?? [];
  const lrig      = state.field.lrig ?? [];
  const assist_r  = state.field.assist_lrig_r ?? [];
  const key_piece = state.field.key_piece ?? null;

  type Slot = { label: string; w: number; h: number; cardNum?: string | null; stack?: string[] };
  const lowerSlots: Slot[] = isMe
    ? [
        { cardNum: check,    label: 'CHECK',      w: lowerW, h: lowerH },
        { stack:   assist_l, label: 'アシスト左',  w: lowerW, h: lowerH },
        { stack:   lrig,     label: 'LRIG',        w: lrigW,  h: lrigH  },
        { stack:   assist_r, label: 'アシスト右',  w: lowerW, h: lowerH },
        { cardNum: key_piece,label: 'KEY',         w: lowerW, h: lowerH },
      ]
    : [
        { cardNum: key_piece,label: 'KEY',         w: lowerW, h: lowerH },
        { stack:   assist_r, label: 'アシスト右',  w: lowerW, h: lowerH },
        { stack:   lrig,     label: 'LRIG',        w: lrigW,  h: lrigH  },
        { stack:   assist_l, label: 'アシスト左',  w: lowerW, h: lowerH },
        { cardNum: check,    label: 'CHECK',       w: lowerW, h: lowerH },
      ];

  const lrig_down = state.field.lrig_down ?? false;

  const lowerRow = (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
      {lowerSlots.map((slot, i) =>
        slot.stack !== undefined
          ? <StackSlot
              key={i} stack={slot.stack} cards={cards} width={slot.w} height={slot.h} label={slot.label}
              actions={
                slot.label === 'LRIG'      && isMe && getLrigFieldActions ? getLrigFieldActions() :
                slot.label === 'アシスト左' && isMe && getAssistLActions  ? getAssistLActions()  :
                slot.label === 'アシスト右' && isMe && getAssistRActions  ? getAssistRActions()  :
                undefined
              }
              isDown={slot.label === 'LRIG' ? lrig_down : false}
              isFrozen={slot.label === 'LRIG' ? (state.field.lrig_frozen ?? false) : false}
            />
          : <CardSlot key={i} cardNum={slot.cardNum ?? null} cards={cards} width={slot.w} height={slot.h} label={slot.label}
              actions={slot.label === 'KEY' && isMe && getKeyPieceActions ? getKeyPieceActions() : undefined} />
      )}
    </div>
  );

  const content = isMe ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {signiRow}
      {lowerRow}
      {statsRow}
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {statsRow}
      {lowerRow}
      {signiRow}
    </div>
  );

  return (
    <>
      {content}
      {zoneModal && (
        <ZoneCardModal
          title={zoneModal.title}
          cardNums={zoneModal.isLrigDeck ? state.lrig_deck : zoneModal.cardNums}
          cards={cards}
          onClose={() => setZoneModal(null)}
          getCardActions={
            zoneModal.isLrigDeck ? getLrigDeckCardActions :
            zoneModal.isFreeZone  ? getFreeZoneActions :
            undefined
          }
        />
      )}
    </>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────
export default function BattleScreen({ user, roomId, myDeckId, cards, onBack }: Props) {
  const [bs, setBs] = useState<BattleStateRow | null>(null);
  const [myDeckData, setMyDeckData] = useState<{ main_deck: string[]; lrig_deck: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [mulliganSelected, setMulliganSelected] = useState<Set<number>>(new Set());
  const [pendingSigniSummon, setPendingSigniSummon] = useState<{ cardNum: string; handIndex: number } | null>(null);
  const [showEnergySkipConfirm, setShowEnergySkipConfirm] = useState(false);
  const [showGrowSkipConfirm, setShowGrowSkipConfirm] = useState(false);
  const [showGrowModal, setShowGrowModal] = useState(false);
  const [pendingGrowCard, setPendingGrowCard] = useState<CardData | null>(null);
  const [selectedGrowCost, setSelectedGrowCost] = useState<Set<number>>(new Set());
  const [showArtsModal, setShowArtsModal] = useState(false);
  const [pendingArtsCard, setPendingArtsCard] = useState<CardData | null>(null);
  const [selectedArtsCost, setSelectedArtsCost] = useState<Set<number>>(new Set());
  const [isBetting, setIsBetting] = useState(false);
  const [isEncore, setIsEncore] = useState(false);
  const [closeZoneSignal, setCloseZoneSignal] = useState(0);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedRemoveZones, setSelectedRemoveZones] = useState<Set<number>>(new Set());
  const [pendingSpellCast, setPendingSpellCast] = useState<{ cardNum: string; handIndex: number } | null>(null);
  const [selectedSpellCost, setSelectedSpellCost] = useState<Set<number>>(new Set());
  const [pendingCutinCard, setPendingCutinCard] = useState<CardData | null>(null);
  const [selectedCutinCost, setSelectedCutinCost] = useState<Set<number>>(new Set());
  // シグニ起動効果
  const [pendingSigniActivated, setPendingSigniActivated] = useState<{ cardNum: string; effect: import('../types/effects').CardEffect } | null>(null);
  const [selectedSigniActivatedCost, setSelectedSigniActivatedCost] = useState<Set<number>>(new Set());
  // キーピース
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [pendingKeyCard, setPendingKeyCard] = useState<CardData | null>(null);
  const [selectedKeyCost, setSelectedKeyCost] = useState<Set<number>>(new Set());
  const [pendingKeyActivated, setPendingKeyActivated] = useState<{ cardNum: string; effect: import('../types/effects').CardEffect } | null>(null);
  const [selectedKeyActivatedCost, setSelectedKeyActivatedCost] = useState<Set<number>>(new Set());
  // アシストルリグ
  const [showAssistGrowModal, setShowAssistGrowModal] = useState(false);
  const [pendingAssistGrowCard, setPendingAssistGrowCard] = useState<CardData | null>(null);
  const [pendingAssistSide, setPendingAssistSide] = useState<'l' | 'r' | null>(null);
  const [selectedAssistGrowCost, setSelectedAssistGrowCost] = useState<Set<number>>(new Set());
  const [pendingAssistActivated, setPendingAssistActivated] = useState<{ cardNum: string; effect: import('../types/effects').CardEffect } | null>(null);
  const [selectedAssistActivatedCost, setSelectedAssistActivatedCost] = useState<Set<number>>(new Set());
  // ルリグ付与能力（GRANT_LRIG_ABILITY）の発動
  const [pendingLrigGranted, setPendingLrigGranted] = useState<{ sourceCardNum: string; effect: import('../types/effects').CardEffect } | null>(null);
  const [selectedLrigGrantedCost, setSelectedLrigGrantedCost] = useState<Set<number>>(new Set());
  // ライフクロスクラッシュ時のカード拡大
  const [burstCardZoomed, setBurstCardZoomed] = useState(false);
  // 効果インタラクション：SELECT_TARGET / SEARCH / CHOOSE
  const [effectSelectedNums, setEffectSelectedNums] = useState<string[]>([]);
  // 効果スタック整列UI：自分の pending エントリの id を並べた配列
  const [stackOrderIds, setStackOrderIds] = useState<string[]>([]);
  // LOOK_AND_REORDER インタラクション：現在の並び順
  const [lookReorderOrder, setLookReorderOrder] = useState<string[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);
  const [battleLogs, setBattleLogs] = useState<import('../types').GameLog[]>([]);
  const logScrollRef = useRef<HTMLDivElement>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const prevTurnRef  = useRef<number | null>(null);
  // Realtime で受け取った game_logs をローカル state に同期
  const prevGameLogsLenRef = useRef<number>(0);
  // defer: true のログを main update 後に一括 flush するバッファ
  const pendingLogsRef = useRef<import('../types').GameLog[]>([]);
  useEffect(() => {
    const remote = bs?.game_logs ?? [];
    if (remote.length > prevGameLogsLenRef.current) {
      setBattleLogs(remote.slice(-200));
      prevGameLogsLenRef.current = remote.length;
    }
  }, [bs?.game_logs]);

  const appendBattleLogs = useCallback((entries: string[], opts?: { defer?: boolean }) => {
    if (entries.length === 0 || !user) return;
    const now = new Date().toISOString();
    const newLogs = entries.map(action => ({ timestamp: now, user_id: user.id, action }));
    // ローカルに即時反映
    setBattleLogs(prev => {
      const next = [...prev, ...newLogs].slice(-200);
      prevGameLogsLenRef.current = next.length;
      return next;
    });
    if (opts?.defer) {
      // DB 書き込みを pendingLogsRef にバッファ（main update 後に一括 flush）
      pendingLogsRef.current.push(...newLogs);
    } else {
      // DB に即時書き込んで相手に同期
      supabase.rpc('append_battle_logs', { p_room_id: roomId, p_logs: newLogs })
        .then(({ error }) => { if (error) console.error('[battle_log]', error.message); });
    }
  }, [roomId, user]);

  const flushBattleLogs = useCallback(async () => {
    if (pendingLogsRef.current.length === 0) return;
    const toFlush = [...pendingLogsRef.current];
    pendingLogsRef.current = [];
    const { error } = await supabase.rpc('append_battle_logs', { p_room_id: roomId, p_logs: toFlush });
    if (error) console.error('[battle_log]', error.message);
  }, [roomId]);

  const transitioningRef = useRef(false);
  const leavingRef = useRef(false);
  const stackProcessingRef        = useRef(false);  // resolveStackNext の多重実行防止
  const lastResolvedEntryIdRef    = useRef<string | null>(null); // 直前に処理したキュー先頭のID（DB伝播前の二重処理防止）
  const doPhaseAdvanceRef         = useRef<(() => Promise<void>) | null>(null);
  const triggerPendingCrashRef    = useRef<(() => Promise<void>) | null>(null);
  const resolveStackNextRef       = useRef<(() => Promise<void>) | null>(null);
  const checkPowerZeroBanishRef   = useRef<(() => Promise<void>) | null>(null);

  // フェーズ変化をバトルログに記録（アクティブプレイヤーのみDB書き込み）
  useEffect(() => {
    if (!bs) return;
    const phase = bs.turn_phase;
    const turn  = bs.turn_count;
    if (prevPhaseRef.current === phase && prevTurnRef.current === turn) return;
    if (prevPhaseRef.current !== null && bs.active_user_id === user.id) {
      const msg = phase === 'UP'
        ? `── T${turn} あなたのターン開始 ──`
        : `[あなた] ${PHASE_LABEL[phase] ?? phase}フェイズ`;
      appendBattleLogs([msg]);
    }
    prevPhaseRef.current = phase;
    prevTurnRef.current  = turn;
  }, [bs?.turn_phase, bs?.turn_count, bs?.active_user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.from('battle_states').select('*').eq('room_id', roomId).single()
      .then(({ data, error }) => {
        if (error) console.error('battle_states 取得エラー:', error.message);
        if (data) setBs(data as BattleStateRow);
      });

    supabase.from('decks').select('main_deck, lrig_deck').eq('id', myDeckId).single()
      .then(({ data }) => {
        if (data) setMyDeckData(data as { main_deck: string[]; lrig_deck: string[] });
      });

    const channel = supabase
      .channel(`battle-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'battle_states', filter: `room_id=eq.${roomId}`,
      }, (payload) => { setBs(payload.new as BattleStateRow); })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
      }, () => {
        if (!leavingRef.current) { leavingRef.current = true; onBack(); }
      })
      .subscribe((status) => {
        // 接続後に最新データを再取得（リロード時に Realtime が間に合わない場合の対策）
        if (status === 'SUBSCRIBED') {
          supabase.from('battle_states').select('*').eq('room_id', roomId).single()
            .then(({ data }) => { if (data) setBs(data as BattleStateRow); });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [roomId, myDeckId]);

  useEffect(() => {
    if (!bs) return;
    const isHost = user.id === bs.host_id;

    // じゃんけん結果処理（両プレイヤー共通：どちらか一方が実行）
    if (!transitioningRef.current && bs.setup_phase === 'JAN_KEN' && bs.host_janken && bs.guest_janken) {
      transitioningRef.current = true;
      const winner = jankenWinner(bs.host_janken, bs.guest_janken, bs.host_id, bs.guest_id);
      const update = winner
        ? { first_player_id: winner, setup_phase: 'LRIG_SELECT', host_janken: null as null, guest_janken: null as null }
        : { host_janken: null as null, guest_janken: null as null };
      const t = setTimeout(() => {
        supabase.from('battle_states').update(update).eq('room_id', roomId)
          .then(() => { transitioningRef.current = false; });
      }, 1800);
      return () => { clearTimeout(t); transitioningRef.current = false; };
    }

    // 以下はホストのみが担当するフェーズ遷移
    if (!isHost || transitioningRef.current) return;

    if (bs.setup_phase === 'LRIG_SELECT' && bs.host_lrig_selected && bs.guest_lrig_selected) {
      transitioningRef.current = true;
      supabase.from('battle_states').update({ setup_phase: 'MULLIGAN' }).eq('room_id', roomId)
        .then(() => { transitioningRef.current = false; });
      return () => { transitioningRef.current = false; };
    }
  }, [
    bs?.setup_phase,
    bs?.host_lrig_selected, bs?.guest_lrig_selected,
    bs?.host_janken, bs?.guest_janken,
  ]);

  // PLAYING 移行時に loading をリセット（マリガン確定後の loading=true をクリア）
  useEffect(() => {
    if (bs?.global_phase === 'PLAYING') setLoading(false);
  }, [bs?.global_phase]);

  // ── バトルに必要なカードだけを抽出（全1万枚+ を毎回スキャンしない） ────────────
  // 自分のデッキ + bs の全ゾーンにある CardNum を収集し、大本の cards から Map を作る。
  // 大本の cards 配列は一切変更しない。
  const battleCardNums = useMemo(() => {
    const nums = new Set<string>();
    // インスタンスID（CardNum#N）からCardNumを取り出して登録
    const addAll = (arr?: string[]) => arr?.forEach(n => nums.add(getCardNum(n)));
    const addState = (s: PlayerState) => {
      addAll(s.deck); addAll(s.lrig_deck); addAll(s.hand);
      addAll(s.life_cloth); addAll(s.trash); addAll(s.lrig_trash);
      addAll(s.energy); addAll(s.field.lrig);
      s.field.signi.forEach(stack => stack?.forEach(n => nums.add(n)));
      if (s.field.check) nums.add(s.field.check);
      if (s.field.key_piece) nums.add(s.field.key_piece);
      addAll(s.field.assist_lrig_l); addAll(s.field.assist_lrig_r);
      (s.field.signi_charms ?? []).forEach(n => n && nums.add(n));
      addAll(s.field.free_zone);
    };
    if (myDeckData) { addAll(myDeckData.main_deck); addAll(myDeckData.lrig_deck); }
    if (bs) { addState(bs.host_state); addState(bs.guest_state); }
    return nums;
  }, [myDeckData, bs]);

  const battleCardMap = useMemo(
    () => new InstanceMap(cards.filter(c => battleCardNums.has(c.CardNum)).map(c => [c.CardNum, c] as [string, CardData])),
    [cards, battleCardNums],
  );

  // サブコンポーネントや既存ヘルパーに渡す配列（最大〜100枚）
  const battleCards = useMemo(() => [...battleCardMap.values()], [battleCardMap]);

  // CONTINUOUS 効果マップ（バトル中の全カードを対象・InstanceMapでインスタンスIDを透過的に扱う）
  const effectsMap = useMemo(
    () => new InstanceMap(buildEffectsMap(battleCards)),
    [battleCards],
  );

  // フィールドシグニの有効パワー（CONTINUOUS 効果適用済み）
  const effectivePowers = useMemo(() => {
    if (!bs) return new Map<string, number>();
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return calcFieldPowers(myS, opS, myTurn, effectsMap, battleCardMap);
  }, [bs, effectsMap, battleCardMap, user.id]);

  // CONTINUOUS コスト修正（CostIncreaseAction 効果を集計）
  const activeCostMods = useMemo(() => {
    if (!bs) return { forMy: [], forOp: [] };
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return calcActiveCostMods(myS, opS, myTurn, effectsMap, battleCardMap);
  }, [bs, effectsMap, battleCardMap, user.id]);

  // フィールドのシグニ・キーピースが持つ GRANT_LRIG_ABILITY 効果でセンタールリグに付与された能力
  const grantedMyLrigEffects = useMemo(() => {
    if (!bs) return [];
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return collectLrigGrantedEffects(myS, opS, myTurn, effectsMap, battleCardMap);
  }, [bs, effectsMap, battleCardMap, user.id]);

  // フィールド（シグニ＋センタールリグ）にCONTINUOUS GRANT_KEYWORD マルチエナ（count:ALL）効果があるか
  // WX01-027（シグニ）・WX05-006（ルリグLv5）のような「全エナにマルチエナ付与」効果を検出
  const myEnaAllMulti = useMemo(() => {
    if (!bs) return false;
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const hasAllMultiEffect = (cardNum: string) =>
      (effectsMap.get(cardNum) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        e.action?.type === 'GRANT_KEYWORD' &&
        (e.action as { keyword: string }).keyword === 'マルチエナ' &&
        (e.action as { target: { count: unknown } }).target?.count === 'ALL'
      );
    // シグニゾーン
    if (myS.field.signi.some(stack => { const top = stack?.at(-1); return !!top && hasAllMultiEffect(top); })) return true;
    // センタールリグ
    const lrigTop = myS.field.lrig.at(-1);
    if (lrigTop && hasAllMultiEffect(lrigTop)) return true;
    return false;
  }, [bs, effectsMap, user.id]);

  // ── Rules of Hooks 対策：PLAYING セクション由来の hooks を if(!bs)/SETUP return より前に置く ──

  // CONTINUOUS BLOCK_ACTION 効果によるアクション禁止（フィールド常駐効果）
  const contBlocked = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return { forSelf: new Set<string>(), forOther: new Set<string>(), cannotAttackSigni: new Set<string>() };
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return calcContinuousBlockedActions(myS, opS, myTurn, effectsMap, battleCardMap);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs, effectsMap, battleCardMap, user.id]);

  // pending_effectが変わったらカード選択をリセット（別効果の選択状態が残らないように）
  useEffect(() => {
    setEffectSelectedNums([]);
    if (!bs?.pending_effect) return;
    const inter = bs.pending_effect.interaction;
    if (inter.type === 'LOOK_AND_REORDER') {
      setLookReorderOrder(prev => {
        const same = prev.length === inter.cards.length && prev.every((n, i) => n === inter.cards[i]);
        return same ? prev : [...inter.cards];
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.pending_effect]);

  // 効果スタック整列UI の更新
  useEffect(() => {
    if (!bs?.effect_stack || !user) { setStackOrderIds([]); return; }
    const stack = bs.effect_stack;
    const isTurnPlayer = bs.active_user_id === user.id;
    const myPending = isTurnPlayer ? stack.pendingTurn : stack.pendingOpp;
    const needOrder = isTurnPlayer ? !stack.orderTurnDone : !stack.orderOppDone;
    if (needOrder && myPending.length > 1) {
      setStackOrderIds(prev => {
        const prevSet = new Set(prev);
        const same = myPending.length === prev.length && myPending.every(e => prevSet.has(e.id));
        return same ? prev : myPending.map(e => e.id);
      });
    } else {
      setStackOrderIds([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack]);

  // キューが解決可能になったらターンプレイヤーが自動解決
  useEffect(() => {
    if (!bs || !user) return;
    const stack = bs.effect_stack;
    if (!stack) return;
    if (!isReadyToResolve(stack)) return;
    if (stack.queue.length === 0) return;
    if (bs.pending_effect) return;
    if (loading) return;
    if (bs.active_user_id !== user.id) return;
    // 相手のチェックゾーンにカードがある（バースト処理待ち）間はスタック解決を停止
    const isLocalHost = user.id === bs.host_id;
    const opStateForCheck = isLocalHost ? bs.guest_state : bs.host_state;
    if (opStateForCheck.field?.check) return;
    resolveStackNextRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, loading, bs?.host_state, bs?.guest_state]);

  // pending_life_crashes の自動消化
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;
    if (loading) return;
    const localIsHost = user.id === bs.host_id;
    const localMy = localIsHost ? bs.host_state : bs.guest_state;
    if (localMy.field?.check) return;
    if (!(localMy.pending_crashed_cards?.length ?? 0)) return;
    triggerPendingCrashRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, loading, bs?.host_state, bs?.guest_state, bs?.global_phase]);

  // パワー0以下シグニの自動バニッシュ
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;
    if (loading) return;
    if (bs.active_user_id !== user.id) return;
    checkPowerZeroBanishRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, loading, bs?.host_state, bs?.guest_state, bs?.global_phase, bs?.active_user_id]);

  // ON_TURN_END 解決後の自動フェーズ進行
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.turn_phase !== 'END') return;
    const localIsMyTurn = bs.active_user_id === user.id;
    if (!localIsMyTurn || loading) return;
    if (bs.effect_stack || bs.pending_effect) return;
    const localIsHost = user.id === bs.host_id;
    const localMy = localIsHost ? bs.host_state : bs.guest_state;
    if (!(localMy.actions_done?.includes('__TURN_END__'))) return;
    doPhaseAdvanceRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.turn_phase, bs?.effect_stack, bs?.pending_effect, loading, bs?.global_phase, bs?.active_user_id, bs?.host_state, bs?.guest_state]);

  if (!bs) return (
    <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: C.bgSetup, color: C.text }}>
      読み込み中...
    </div>
  );

  const isHost = user.id === bs.host_id;

  // ══════════════════════════════════════════
  // SETUP フェイズ
  // ══════════════════════════════════════════
  if (bs.global_phase === 'SETUP') {

    // ① じゃんけん
    if (bs.setup_phase === 'JAN_KEN') {
      const myJanken = isHost ? bs.host_janken : bs.guest_janken;
      const opJanken = isHost ? bs.guest_janken : bs.host_janken;

      const handleJanken = async (choice: string) => {
        if (loading || myJanken) return;
        setLoading(true);
        try {
          const myUpdate = isHost ? { host_janken: choice } : { guest_janken: choice };
          await supabase.from('battle_states').update(myUpdate).eq('room_id', roomId);

          const { data: fresh } = await supabase
            .from('battle_states').select('host_janken, guest_janken')
            .eq('room_id', roomId).single();

          if (fresh?.host_janken && fresh?.guest_janken && !transitioningRef.current) {
            transitioningRef.current = true;
            const winner = jankenWinner(fresh.host_janken, fresh.guest_janken, bs.host_id, bs.guest_id);
            const transUpdate: Partial<BattleStateRow> = winner
              ? { first_player_id: winner, setup_phase: 'LRIG_SELECT', host_janken: null, guest_janken: null }
              : { host_janken: null, guest_janken: null };
            await new Promise(resolve => setTimeout(resolve, 1800));
            await supabase.from('battle_states').update(transUpdate).eq('room_id', roomId);
            transitioningRef.current = false;
          }
        } finally {
          setLoading(false);
        }
      };

      if (myJanken && opJanken) {
        const hostChoice = isHost ? myJanken : opJanken;
        const guestChoice = isHost ? opJanken : myJanken;
        const winner = jankenWinner(hostChoice, guestChoice, bs.host_id, bs.guest_id);
        const iWon = winner === user.id;
        return (
          <div style={setupWrap}>
            <h2 style={{ color: C.text, margin: 0 }}>じゃんけん結果</h2>
            <p style={{ margin: 0 }}>あなた: {JANKEN_LABEL[myJanken]}   相手: {JANKEN_LABEL[opJanken]}</p>
            {winner ? (
              <>
                <p style={{ color: iWon ? C.success : C.danger, fontSize: 24, fontWeight: 'bold', margin: 0 }}>
                  {iWon ? '勝ち！先攻です' : '負け…後攻です'}
                </p>
                <p style={{ color: C.textFaint, fontSize: 13, margin: '8px 0 0' }}>次のフェイズへ移行中...</p>
              </>
            ) : (
              <>
                <p style={{ color: C.aiko, fontSize: 28, fontWeight: 'bold', margin: 0 }}>あいこ！</p>
                <p style={{ color: C.textDim, fontSize: 14, margin: '8px 0 0' }}>もう一度選んでください...</p>
              </>
            )}
          </div>
        );
      }

      if (myJanken) return (
        <div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>じゃんけん</h2>
          <p style={{ color: C.success }}>あなた: {JANKEN_LABEL[myJanken]}</p>
          <p style={{ color: C.textFaint }}>相手の選択を待っています...</p>
        </div>
      );

      return (
        <div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>じゃんけんで先攻後攻を決めます</h2>
          <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>出す手を選んでください</p>
          <div style={{ display: 'flex', gap: 16 }}>
            {(['GU', 'CHOKI', 'PA'] as const).map(c => (
              <button key={c} onClick={() => handleJanken(c)} disabled={loading}
                style={{ ...primaryBtn, fontSize: 20, padding: '20px 28px' }}>
                {JANKEN_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // ② ルリグ選択
    if (bs.setup_phase === 'LRIG_SELECT') {
      const mySelected = isHost ? bs.host_lrig_selected : bs.guest_lrig_selected;

      if (mySelected) return (
        <div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>ルリグ配置完了</h2>
          <p style={{ color: C.success }}>相手の準備を待っています...</p>
          <p style={{ color: C.textDim, fontSize: 13 }}>配置: {battleCardMap.get(mySelected)?.CardName ?? mySelected}</p>
        </div>
      );

      if (!myDeckData) return <div style={setupWrap}><p>デッキ読み込み中...</p></div>;

      const lv0Lrigs = myDeckData.lrig_deck
        .filter((num, i, arr) => arr.indexOf(num) === i)
        .map(num => battleCardMap.get(num))
        .filter((c): c is CardData => !!c && c.Type === 'ルリグ' && c.Level === '0');

      const handleSelectLrig = async (cardNum: string) => {
        if (loading) return;
        setLoading(true);
        // インスタンスIDを付与（シャッフル後のmainDeckとlrigDeck全体に連番を振る）
        const mainWithIds  = assignInstanceIds(shuffle(myDeckData.main_deck));
        const lrigWithIds  = assignInstanceIds(myDeckData.lrig_deck);
        // 選択されたルリグのインスタンスIDを取得
        const selOrigIdx   = myDeckData.lrig_deck.indexOf(cardNum);
        const selectedId   = selOrigIdx >= 0 ? lrigWithIds[selOrigIdx] : `${cardNum}#1`;
        const lrigDeckIds  = lrigWithIds.filter((_, i) => i !== selOrigIdx);
        const myState: PlayerState = {
          life_cloth: [], hand: mainWithIds.slice(0, 5), deck: mainWithIds.slice(5),
          lrig_deck: lrigDeckIds,
          trash: [], lrig_trash: [], energy: [], coins: 0,
          field: { lrig: [selectedId], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] },
        };
        const update = isHost
          ? { host_lrig_selected: cardNum, host_state: myState }
          : { guest_lrig_selected: cardNum, guest_state: myState };
        await supabase.from('battle_states').update(update).eq('room_id', roomId);
        setLoading(false);
      };

      return (
        <div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>センタールリグを配置</h2>
          <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>Lv0ルリグを選ぶとデッキをシャッフルして手札5枚を引きます</p>
          {lv0Lrigs.length === 0 ? (
            <p style={{ color: '#f44' }}>Lv0ルリグが見つかりません。デッキを確認してください。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', width: 300 }}>
              {lv0Lrigs.map(card => (
                <button key={card.CardNum} onClick={() => handleSelectLrig(card.CardNum)} disabled={loading}
                  style={{ padding: '12px 20px', borderRadius: 8, cursor: 'pointer', border: C.borderUIMid, backgroundColor: C.bgButton, color: C.text, fontSize: 14, textAlign: 'left' }}>
                  {card.CardName}
                  <span style={{ color: C.textFaint, fontSize: 11, marginLeft: 8 }}>{card.CardNum}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    // ③ マリガン（カード画像で選択）
    if (bs.setup_phase === 'MULLIGAN') {
      const myState: PlayerState = isHost ? bs.host_state : bs.guest_state;
      const myDone = isHost ? bs.host_mulligan_done : bs.guest_mulligan_done;
      const iAmFirst = bs.first_player_id === user.id;

      if (myDone) return (
        <div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>マリガン完了</h2>
          <p style={{ color: iAmFirst ? C.accent : C.textAlt, fontWeight: 'bold', fontSize: 18, margin: 0 }}>
            {iAmFirst ? '先攻です' : '後攻です'}
          </p>
          <p style={{ color: C.textFaint }}>相手の確認を待っています...</p>
        </div>
      );

      const toggleCard = (i: number) => setMulliganSelected(prev => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
      });

      const handleConfirm = async () => {
        if (loading) return;
        setLoading(true);
        try {
          let newHand = [...myState.hand];
          let newDeck = [...myState.deck];

          if (mulliganSelected.size > 0) {
            const returning = [...mulliganSelected].map(i => myState.hand[i]);
            const keeping = myState.hand.filter((_, i) => !mulliganSelected.has(i));
            newDeck = shuffle([...newDeck, ...returning]);
            newHand = [...keeping, ...newDeck.slice(0, returning.length)];
            newDeck = newDeck.slice(returning.length);
          }

          const newLifeCloth = newDeck.slice(0, 7);
          newDeck = newDeck.slice(7);

          const newState: PlayerState = { ...myState, hand: newHand, deck: newDeck, life_cloth: newLifeCloth };
          const update = isHost
            ? { host_state: newState, host_mulligan_done: true }
            : { guest_state: newState, guest_mulligan_done: true };
          await supabase.from('battle_states').update(update).eq('room_id', roomId);

          // 最新状態を取得して両者が完了しているか確認
          const { data: fresh } = await supabase
            .from('battle_states')
            .select('host_mulligan_done, guest_mulligan_done, first_player_id')
            .eq('room_id', roomId)
            .single();

          if (fresh?.host_mulligan_done && fresh?.guest_mulligan_done) {
            // 両者完了 → 自分が直接 PLAYING へ遷移させる（両プレイヤーとも送信して確実に反映）
            const playingUpdate = {
              global_phase: 'PLAYING' as const,
              setup_phase: null as null,
              active_user_id: fresh.first_player_id as string,
            };
            await supabase.from('battle_states').update(playingUpdate).eq('room_id', roomId);
          }
        } finally {
          setLoading(false);
        }
      };

      return (
        <div style={{ ...setupWrap, justifyContent: 'flex-start', paddingTop: 32, overflowY: 'auto' }}>
          <h2 style={{ color: C.text, margin: 0, flexShrink: 0 }}>マリガン</h2>
          <p style={{ color: iAmFirst ? C.accent : C.textAlt, fontWeight: 'bold', margin: 0, flexShrink: 0 }}>
            {iAmFirst ? '先攻' : '後攻'}
          </p>
          <p style={{ color: C.textDim, margin: 0, fontSize: 12, textAlign: 'center', flexShrink: 0 }}>
            タップで選択（戻す）/ 長押しで拡大
          </p>
          {/* カード画像グリッド */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', flexShrink: 0 }}>
            {myState.hand.map((cardNum, i) => (
              <MulliganCard
                key={i}
                cardNum={cardNum}
                cards={battleCards}
                selected={mulliganSelected.has(i)}
                onToggle={() => toggleCard(i)}
              />
            ))}
          </div>
          {mulliganSelected.size > 0 && (
            <p style={{ color: '#f44', fontSize: 12, margin: 0, flexShrink: 0 }}>
              {mulliganSelected.size}枚を戻して引き直します
            </p>
          )}
          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            {mulliganSelected.size > 0 ? (
              <button onClick={handleConfirm} disabled={loading}
                style={{ ...primaryBtn, backgroundColor: C.dangerDark }}>
                {mulliganSelected.size}枚引き直す
              </button>
            ) : (
              <button onClick={handleConfirm} disabled={loading} style={primaryBtn}>
                このままでOK
              </button>
            )}
          </div>
        </div>
      );
    }
  }

  // ══════════════════════════════════════════
  // PLAYING フェイズ
  // ══════════════════════════════════════════
  const my = isHost ? bs.host_state : bs.guest_state;
  const op = isHost ? bs.guest_state : bs.host_state;
  const isMyTurn = bs.active_user_id === user.id;
  // このフェイズの進行ボタンを自分が持つか
  const iControlThisPhase = NON_TURN_PLAYER_PHASES.includes(bs.turn_phase) ? !isMyTurn : isMyTurn;

  // blocked_actions（一時的封じ）＋ CONTINUOUS 効果の両方を考慮した禁止チェック
  const isActionBlocked = (actionId: string) =>
    (my.blocked_actions?.some(a => a === actionId) ?? false) || contBlocked.forSelf.has(actionId);

  // ドロー枚数（先攻1ターン目=1枚、それ以外=2枚）
  const drawCount = bs.turn_count === 1 && bs.active_user_id === bs.first_player_id ? 1 : 2;

  // ─── バニッシュ・ターントリガー ヘルパー ─────────────────────────────

  /**
   * バニッシュ前後の PlayerState を比較し、フィールドトップが変わってエナゾーンへ移動した
   * カードをバニッシュ済みとして返す。
   */
  const detectBanishedSigni = (before: PlayerState, after: PlayerState): string[] => {
    const result: string[] = [];
    for (let i = 0; i < 3; i++) {
      const beforeTop = (before.field.signi[i] ?? []).at(-1);
      const afterTop  = (after.field.signi[i] ?? []).at(-1);
      if (!beforeTop || beforeTop === afterTop) continue;
      if (after.energy.includes(beforeTop)) result.push(beforeTop);
    }
    return result;
  };

  /**
   * バニッシュされたシグニの ON_BANISH 効果 + フィールド上の全シグニのトリガーを収集する。
   * banishedPlayerId: バニッシュされたシグニのオーナーの userId (host_id or guest_id)。
   */
  const collectBanishTriggers = (
    banishedCardNum: string,
    banishedPlayerId: string,
    afterHostState: PlayerState,
    afterGuestState: PlayerState,
  ): StackEntry[] => {
    const entries: StackEntry[] = [];
    const opId = isHost ? bs.guest_id : bs.host_id;
    const myAfterState = isHost ? afterHostState : afterGuestState;
    const opAfterState = isHost ? afterGuestState : afterHostState;
    const banishedOwnerIsMe = banishedPlayerId === user.id;

    // 1. バニッシュされたカード自身の ON_BANISH 効果
    for (const eff of (effectsMap.get(banishedCardNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      const cardName = battleCardMap.get(banishedCardNum)?.CardName ?? banishedCardNum;
      entries.push({
        id: generateUUID(),
        playerId: banishedPlayerId,
        cardNum: banishedCardNum,
        effectId: eff.effectId,
        label: `${cardName} の【バニッシュ時】効果`,
        effect: eff,
      });
    }

    // 2. 自分フィールド上シグニのトリガー
    for (const stack of myAfterState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (banishedOwnerIsMe  && scope !== 'any_ally' && scope !== 'any') continue;
        if (!banishedOwnerIsMe && scope !== 'any_opp'  && scope !== 'any') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（バニッシュ時）`,
          effect: eff,
        });
      }
    }

    // 3. 相手フィールド上シグニのトリガー
    for (const stack of opAfterState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
        const scope = eff.triggerScope ?? 'self';
        // 相手視点：「自分の味方がバニッシュ」= !banishedOwnerIsMe
        if (!banishedOwnerIsMe && scope !== 'any_ally' && scope !== 'any') continue;
        if (banishedOwnerIsMe  && scope !== 'any_opp'  && scope !== 'any') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: opId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（バニッシュ時）`,
          effect: eff,
        });
      }
    }

    return entries;
  };

  /**
   * ターン開始時・終了時の AUTO 効果を収集する。
   * 自分のフィールドシグニ（'self' スコープ）+ ルリグ + 相手の any_opp/any も対象。
   */
  const collectTurnTriggers = (
    timing: 'ON_TURN_START' | 'ON_TURN_END',
    myState: PlayerState,
    opState: PlayerState,
  ): StackEntry[] => {
    const entries: StackEntry[] = [];
    const opId = isHost ? bs.guest_id : bs.host_id;
    const labelSuffix = timing === 'ON_TURN_START' ? 'ターン開始時' : 'ターン終了時';

    // 自分のフィールドシグニ（self = このターンプレイヤーのカード）
    for (const stack of myState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
        if ((eff.triggerScope ?? 'self') !== 'self') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（${labelSuffix}）`,
          effect: eff,
        });
      }
    }

    // 自分のルリグ
    const myLrigNum = myState.field.lrig.at(-1);
    if (myLrigNum) {
      for (const eff of (effectsMap.get(myLrigNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
        const cardName = battleCardMap.get(myLrigNum)?.CardName ?? myLrigNum;
        entries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: myLrigNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（${labelSuffix}）`,
          effect: eff,
        });
      }
    }

    // 相手フィールドシグニ（any_opp / any でこちらのターンにも反応するカード）
    for (const stack of opState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope !== 'any_opp' && scope !== 'any') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: opId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（${labelSuffix}）`,
          effect: eff,
        });
      }
    }

    return entries;
  };

  // フェイズ進行（実処理）
  const doPhaseAdvance = async () => {
    // いずれかのチェックゾーンにカードがある間はフェーズ移動不可
    if (my.field.check || op.field.check) return;
    setLoading(true);
    try {
      const phase = bs.turn_phase;
      const stateKey = isHost ? 'host_state' : 'guest_state';
      let newMyState = my;
      const update: Partial<BattleStateRow> = {};

      if (phase === 'UP') {
        // アップフェイズ開始時にすでにアップ済み（ENDフェイズで処理）。ドローして次へ。
        const drawBlocked = my.blocked_actions?.includes('DRAW') ?? false;
        newMyState = drawBlocked
          ? { ...my, actions_done: [] }
          : { ...drawCards(my, drawCount), actions_done: ['DRAW'] };
        update.turn_phase = 'DRAW';

        // ON_TURN_START トリガー収集（ドローと同時にスタック積み）
        const startEntries = collectTurnTriggers('ON_TURN_START', newMyState, op);
        if (startEntries.length > 0) {
          const turnPlayerId = bs.active_user_id ?? user.id;
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, startEntries)
            : initStack(turnPlayerId, startEntries);
        }
      } else if (phase === 'MAIN' && bs.turn_count === 1) {
        update.turn_phase = 'END';
      } else if (phase === 'END') {
        // ON_TURN_END トリガーをまだ収集していなければ先に解決する
        const turnEndMarked = my.actions_done?.includes('__TURN_END__');
        if (!turnEndMarked) {
          const endEntries = collectTurnTriggers('ON_TURN_END', my, op);
          if (endEntries.length > 0) {
            const markedMyState: PlayerState = {
              ...my,
              actions_done: [...(my.actions_done ?? []), '__TURN_END__'],
            };
            const turnPlayerId = bs.active_user_id ?? user.id;
            const existingStack = bs.effect_stack ?? null;
            const stack = existingStack
              ? pushToStack(existingStack, endEntries)
              : initStack(turnPlayerId, endEntries);
            await supabase.from('battle_states')
              .update({ [stateKey]: markedMyState, effect_stack: stack })
              .eq('room_id', roomId);
            return; // エフェクト解決後に自動で再度ターン終了処理を行う
          }
        }

        // 自分（ターン終了プレイヤー）のターン内一時状態をクリア
        newMyState = {
          ...my,
          temp_power_mods:    [],   // UNTIL_END_OF_TURN パワー修正をリセット
          keyword_grants:     {},   // ターン内付与キーワードをリセット
          blocked_actions:    [],   // ターン内封じ行動をリセット
          actions_done:       [],   // ターン内行動履歴をリセット
          pending_crashed_cards: [],  // ダブルクラッシュ残数をリセット
          must_attack_signi:  undefined,  // 強制攻撃フラグをリセット
          cost_modifiers: (my.cost_modifiers ?? []).filter(m => m.until !== 'END_OF_TURN'),
        };
        // 次のターンプレイヤー（相手）のカードをアップフェイズ開始時点でアップ処理する。
        // 凍結中はアップせず凍結を解除。それ以外のダウンカードはアップ。
        const opKey = isHost ? 'guest_state' : 'host_state';
        const opState = isHost ? bs.guest_state : bs.host_state;
        const curSigniDown   = opState.field.signi_down   ?? [false, false, false];
        const curSigniFrozen = opState.field.signi_frozen  ?? [false, false, false];
        const curLrigFrozen  = opState.field.lrig_frozen   ?? false;
        const newSigniDown = curSigniDown.map((down, i) => down && curSigniFrozen[i]) as boolean[];
        // ':NEXT_TURN' サフィックスのブロックを次のターン用に変換（サフィックス除去して残す）
        const convertedOpBlocked = (opState.blocked_actions ?? [])
          .filter(a => a.endsWith(':NEXT_TURN'))
          .map(a => a.replace(':NEXT_TURN', ''));
        update[opKey] = {
          ...opState,
          blocked_actions: convertedOpBlocked,
          field: {
            ...opState.field,
            signi_down:   newSigniDown,
            signi_frozen: [false, false, false],
            lrig_down:    (opState.field.lrig_down ?? false) && curLrigFrozen,
            lrig_frozen:  false,
          },
        };
        update.turn_phase = 'UP';
        update.active_user_id = (isHost ? bs.guest_id : bs.host_id) as string;
        update.turn_count = bs.turn_count + 1;
      } else {
        update.turn_phase = PHASE_NEXT[phase];
      }

      await supabase.from('battle_states')
        .update({ [stateKey]: newMyState, ...update })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // フェイズ進行（エナフェイズ・グロウフェイズ未使用時は確認ポップアップ）
  const handlePhaseAdvance = () => {
    if (!iControlThisPhase || loading) return;
    if (my.field.check || op.field.check) return; // チェックゾーンにカードがある間はブロック
    if (bs.turn_phase === 'ENERGY') {
      const used    = my.actions_done?.includes('ENERGY') ?? false;
      const blocked = my.blocked_actions?.includes('ENERGY') ?? false;
      if (!used && !blocked) {
        setShowEnergySkipConfirm(true);
        return;
      }
    }
    if (bs.turn_phase === 'GROW') {
      const grew    = my.actions_done?.includes('GROW') ?? false;
      const blocked = my.blocked_actions?.includes('GROW') ?? false;
      if (!grew && !blocked) {
        const hasAffordable = growCandidates.some(card => {
          const gCoin = parseCoinCost(card.GrowCost);
          return (gCoin === 0 || my.coins >= gCoin) &&
            canAffordGrowCost(my.energy, battleCards, card.GrowCost, my.keyword_grants, myEnaAllMulti);
        });
        if (hasAffordable) {
          setShowGrowSkipConfirm(true);
          return;
        }
      }
    }
    doPhaseAdvance();
  };

  // エナチャージ（手札のカードをエナゾーンへ）
  const handleEnergyChargeFromHand = async (handIndex: number) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    try {
      const cardNum = my.hand[handIndex];
      const name = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const newMyState: PlayerState = {
        ...my,
        hand: my.hand.filter((_, i) => i !== handIndex),
        energy: [...my.energy, cardNum],
        actions_done: [...(my.actions_done ?? []), 'ENERGY'],
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
      appendBattleLogs([`エナチャージ（${name}）`]);
    } finally {
      setLoading(false);
    }
  };

  // エナチャージ（シグニゾーンの最上層カードをエナゾーンへ）
  const handleEnergyChargeFromSigni = async (zoneIndex: number) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    try {
      const signiStack = my.field.signi[zoneIndex];
      if (!signiStack || signiStack.length === 0) return;
      const cardNum = signiStack[signiStack.length - 1];
      const name = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const newStack = signiStack.slice(0, -1);
      const newSigni = [...my.field.signi] as (string[] | null)[];
      newSigni[zoneIndex] = newStack.length > 0 ? newStack : null;
      const newMyState: PlayerState = {
        ...my,
        field: { ...my.field, signi: newSigni },
        energy: [...my.energy, cardNum],
        actions_done: [...(my.actions_done ?? []), 'ENERGY'],
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
      appendBattleLogs([`エナチャージ（${name}）`]);
    } finally {
      setLoading(false);
    }
  };

  // ===== 効果エンジン統合 =====

  // 効果タイプの表示ラベル
  const effectTypeLabel = (t: string) => {
    if (t === 'AUTO') return '【自】';
    if (t === 'ACTIVATED') return '【起】';
    if (t === 'LIFE_BURST') return '【ライフバースト】';
    return `【${t}】`;
  };

  // --- スタック操作 ---

  /**
   * カードの効果をスタックに積む。
   * effectTypes/timings でフィルタし、該当効果を StackEntry として追加。
   * extraUpdate でフィールド状態（召喚後など）を同時に保存できる。
   */
  const queueCardEffects = async (
    cardNum: string,
    effectTypes: ('AUTO' | 'ACTIVATED' | 'LIFE_BURST')[],
    timings: string[],
    startMyState: PlayerState,
    _startOpState: PlayerState,
    extraUpdate: Record<string, unknown> = {},
  ): Promise<boolean> => {
    const effects = effectsMap.get(cardNum) ?? [];
    const targets = effects.filter(e =>
      (effectTypes as string[]).includes(e.effectType) &&
      (timings.length === 0 || e.timing?.some(t => timings.includes(t)))
    );
    if (targets.length === 0) return false;

    const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
    const turnPlayerId = bs?.active_user_id ?? user.id;

    const entries: StackEntry[] = targets.map(eff => ({
      id: generateUUID(),
      playerId: user.id,
      cardNum,
      effectId: eff.effectId,
      label: `${cardName} の${effectTypeLabel(eff.effectType)}効果`,
      effect: eff,
    }));

    const existing = bs?.effect_stack ?? null;
    const stack: EffectStack = existing
      ? pushToStack(existing, entries)
      : initStack(turnPlayerId, entries);

    const myKey = isHost ? 'host_state' : 'guest_state';
    const { error } = await supabase.from('battle_states')
      .update({
        [myKey]: startMyState,
        effect_stack: stack,
        pending_effect: null,
        ...extraUpdate,
      })
      .eq('room_id', roomId);
    if (error) console.error('[queueCardEffects] DB error:', error);
    return true;
  };

  // --- スタック解決 ---

  /**
   * キューの先頭エントリを取り出して effectExecutor で実行し DB に保存する。
   * ターンプレイヤーが呼び出す（useEffect で監視）。
   */
  const resolveStackNext = async () => {
    if (!bs?.effect_stack || loading) return;
    const stack = bs.effect_stack;
    if (!isReadyToResolve(stack) || stack.queue.length === 0) return;
    if (stackProcessingRef.current) return;  // stale closure による多重実行を防ぐ
    // DB伝播前に setLoading(false) で useEffect が再発火しても同一エントリを二重処理しない
    if (stack.queue[0].id === lastResolvedEntryIdRef.current) return;
    stackProcessingRef.current = true;

    setLoading(true);
    try {
      const { entry, newStack } = shiftQueue(stack);
      if (!entry) {
        await supabase.from('battle_states')
          .update({ effect_stack: null })
          .eq('room_id', roomId);
        return;
      }

      lastResolvedEntryIdRef.current = entry.id;
      const ownerIsHost = entry.playerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === entry.playerId;
      const who = entry.playerId === user.id ? '自分' : '相手';
      appendBattleLogs([`[${who}] ${entry.label}`], { defer: true });
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: battleCardMap, logs: [], effectivePowers: ctxPowers, sourceCardNum: entry.cardNum };
      const result = executeEffect(entry.effect, ctx);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;

      const stackAfter = isStackDone(newStack) ? null : newStack;
      const update: Record<string, unknown> = {
        host_state: hostState,
        guest_state: guestState,
        effect_stack: stackAfter,
      };
      if (!result.done) {
        // opponentResponds=true の場合、相手プレイヤーがUIを操作する
        const oppId = ownerIsHost ? bs.guest_id : bs.host_id;
        const respondPlayerId = result.pending?.type === 'SELECT_TARGET' && result.pending.opponentResponds
          ? oppId : undefined;
        update.pending_effect = {
          sourcePlayerId: entry.playerId,
          ...(respondPlayerId ? { respondPlayerId } : {}),
          sourceCardNum: entry.cardNum,
          effectId: entry.effectId,
          interaction: result.pending,
        } satisfies PendingEffect;
        // インタラクション中はスタック（残キュー）を保持
        update.effect_stack = newStack;
      } else {
        update.pending_effect = null;

        // ON_BANISH: バニッシュされたシグニを検出してスタックに追加
        const hostBanished  = detectBanishedSigni(bs.host_state, hostState);
        const guestBanished = detectBanishedSigni(bs.guest_state, guestState);
        const banishEntries: StackEntry[] = [];
        for (const cardNum of hostBanished) {
          banishEntries.push(...collectBanishTriggers(cardNum, bs.host_id, hostState, guestState));
        }
        for (const cardNum of guestBanished) {
          banishEntries.push(...collectBanishTriggers(cardNum, bs.guest_id, hostState, guestState));
        }
        if (banishEntries.length > 0) {
          const baseStack = (update.effect_stack as typeof stackAfter) ?? null;
          update.effect_stack = baseStack
            ? pushToStack(baseStack, banishEntries)
            : initStack(stack.turnPlayerId, banishEntries);
        }

        // ON_OPP_ARTS_USE: 相手がアーツを使用した場合、自分側の ON_OPP_ARTS_USE トリガーを収集
        const entryCardType = battleCardMap.get(entry.cardNum)?.Type;
        if (entryCardType === 'アーツ' && entry.playerId !== user.id) {
          // 自分（user.id）の myState を決定
          const myStateForTrigger = ownerIsHost ? (isHost ? hostState : guestState) : (isHost ? guestState : hostState);
          const opStateForTrigger = ownerIsHost ? (isHost ? guestState : hostState) : (isHost ? hostState : guestState);
          const iAmHost = isHost;
          const myIsActive = bs.active_user_id === user.id;
          const artsTriggers = collectOppArtsUseTriggers(myStateForTrigger, opStateForTrigger, myIsActive);
          if (artsTriggers.length > 0) {
            const baseStack2 = (update.effect_stack as typeof stackAfter) ?? null;
            update.effect_stack = baseStack2
              ? pushToStack(baseStack2, artsTriggers)
              : initStack(iAmHost ? bs.host_id : bs.guest_id, artsTriggers);
          }
        }

        // FORCE_END_TURN: スタック・エフェクト解決後にターンを即座に終了する
        if (result.forceEndTurn) {
          const activeIsHost = bs.active_user_id === bs.host_id;
          const activeKey  = activeIsHost ? 'host_state'  : 'guest_state';
          const nextKey    = activeIsHost ? 'guest_state' : 'host_state';
          const activeState = activeIsHost ? hostState  : guestState;
          const nextState   = activeIsHost ? guestState : hostState;

          // アクティブプレイヤーの一時状態をクリア
          const clearedActive: typeof activeState = {
            ...activeState,
            temp_power_mods:    [],
            keyword_grants:     {},
            blocked_actions:    [],
            actions_done:       [],
            pending_life_crashes: 0,
            cost_modifiers: (activeState.cost_modifiers ?? []).filter((m: {until?: string}) => m.until !== 'END_OF_TURN'),
          };

          // 次のターンプレイヤー（相手）のシグニをアップ（凍結中はアップせず凍結解除）
          const signiDown   = nextState.field.signi_down   ?? [false, false, false];
          const sIgniFrozen = nextState.field.signi_frozen  ?? [false, false, false];
          const newSigniDown = signiDown.map((d: boolean, i: number) => d && sIgniFrozen[i]) as boolean[];
          const convertedBlocked = (nextState.blocked_actions ?? [])
            .filter((a: string) => a.endsWith(':NEXT_TURN'))
            .map((a: string) => a.replace(':NEXT_TURN', ''));
          const nextStateUpd = {
            ...nextState,
            blocked_actions: convertedBlocked,
            field: {
              ...nextState.field,
              signi_down:   newSigniDown,
              signi_frozen: [false, false, false] as [boolean, boolean, boolean],
              lrig_down:    (nextState.field.lrig_down ?? false) && (nextState.field.lrig_frozen ?? false),
              lrig_frozen:  false,
            },
          };

          Object.assign(update, {
            [activeKey]:     clearedActive,
            [nextKey]:       nextStateUpd,
            turn_phase:      'UP',
            active_user_id:  activeIsHost ? bs.guest_id : bs.host_id,
            turn_count:      bs.turn_count + 1,
            effect_stack:    null,
          });
          appendBattleLogs(['ターンが強制終了されました'], { defer: true });
        }
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      // main update が確定してから flush（先に RPC が届いて stale な effect_stack で再実行されるのを防ぐ）
      await flushBattleLogs();
    } finally {
      stackProcessingRef.current = false;
      setLoading(false);
    }
  };


  // --- 整列UI用ハンドラ ---

  /** 自分の未整列効果のID配列を引数として順序を確定する */
  const handleConfirmStackOrder = async (orderedIds: string[]) => {
    if (!bs?.effect_stack || loading) return;
    setLoading(true);
    try {
      const isTurnPlayer = bs.active_user_id === user.id;
      const stack = isTurnPlayer
        ? confirmTurnOrder(bs.effect_stack, orderedIds)
        : confirmOppOrder(bs.effect_stack, orderedIds);
      await supabase.from('battle_states')
        .update({ effect_stack: isStackDone(stack) ? null : stack })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // --- pending_effect インタラクション解決 ---

  const handleEffectInteraction = async (selectedOrChoiceId: string[]) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: battleCardMap, logs: [], effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum };
      const inter = pe.interaction;

      let result: ExecResult;
      if (inter.type === 'SELECT_TARGET') {
        result = resumeSelectTarget(selectedOrChoiceId, inter, ctx);
      } else if (inter.type === 'SEARCH') {
        result = resumeSearch(selectedOrChoiceId, inter, ctx);
      } else if (inter.type === 'CHOOSE') {
        result = resumeChoose(selectedOrChoiceId[0] ?? '', inter, ctx);
      } else if (inter.type === 'LOOK_AND_REORDER') {
        result = resumeLookAndReorder(selectedOrChoiceId, [], inter, ctx);
      } else {
        return;
      }
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState };
      if (!result.done) {
        // continuationが発生した場合、次のインタラクションは効果オーナーが応答する（respondPlayerIdをリセット）
        const nextOpponentResponds = result.pending?.type === 'SELECT_TARGET' && result.pending.opponentResponds;
        const nextRespondPlayerId = nextOpponentResponds ? pe.respondPlayerId : undefined;
        const { respondPlayerId: _drop, ...peBase } = pe;
        update.pending_effect = {
          ...peBase,
          ...(nextRespondPlayerId ? { respondPlayerId: nextRespondPlayerId } : {}),
          interaction: result.pending,
        } satisfies PendingEffect;
      } else {
        update.pending_effect = null;

        // ON_BANISH: バニッシュされたシグニを検出してスタックに追加
        const hostBanished  = detectBanishedSigni(bs.host_state, hostState);
        const guestBanished = detectBanishedSigni(bs.guest_state, guestState);
        const banishEntries: StackEntry[] = [];
        for (const cardNum of hostBanished) {
          banishEntries.push(...collectBanishTriggers(cardNum, bs.host_id, hostState, guestState));
        }
        for (const cardNum of guestBanished) {
          banishEntries.push(...collectBanishTriggers(cardNum, bs.guest_id, hostState, guestState));
        }
        if (banishEntries.length > 0) {
          const turnPlayerId = bs.active_user_id ?? user.id;
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, banishEntries)
            : initStack(turnPlayerId, banishEntries);
        } else {
          // インタラクション解決後にキューが空になったスタックをクリア
          const existingStack = bs.effect_stack ?? null;
          if (existingStack && isStackDone(existingStack)) {
            update.effect_stack = null;
          }
        }
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      await flushBattleLogs();
      setEffectSelectedNums([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * フィールド上の全シグニから、指定イベントに反応する AUTO 効果を収集して StackEntry[] を返す。
   * 召喚されたカード自身（triggerScope='self'）はここでは除き、queueCardEffects で別途処理する。
   */
  const collectFieldTriggers = (
    event: 'ON_PLAY' | 'ON_BANISH' | 'ON_ATTACK_SIGNI',
    triggeringCardNum: string,
    myState: PlayerState,
    opState: PlayerState,
  ): StackEntry[] => {
    const entries: StackEntry[] = [];
    const opId = isHost ? bs.guest_id : bs.host_id;

    // 自分のフィールド：'any_ally' または 'any' トリガー
    for (const stack of myState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      if (topNum === triggeringCardNum) continue; // 自身は除く（ON_PLAYは queueCardEffects で処理）
      const effects = effectsMap.get(topNum) ?? [];
      for (const eff of effects) {
        if (eff.effectType !== 'AUTO') continue;
        if (!eff.timing?.includes(event)) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope !== 'any_ally' && scope !== 'any') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（他のシグニ召喚時）`,
          effect: eff,
        });
      }
    }

    // 相手のフィールド：'any_opp' または 'any' トリガー（相手のシグニが自分の召喚に反応）
    for (const stack of opState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      const effects = effectsMap.get(topNum) ?? [];
      for (const eff of effects) {
        if (eff.effectType !== 'AUTO') continue;
        if (!eff.timing?.includes(event)) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope !== 'any' && scope !== 'any_opp') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: opId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（シグニ召喚時）`,
          effect: eff,
        });
      }
    }

    return entries;
  };

  /**
   * 相手がアーツを使用したとき、ON_OPP_ARTS_USE トリガーを持つ自分のシグニを収集する。
   * activeCondition（HAS_CARD_IN_FIELD 等）を満たす場合のみスタックに追加する。
   */
  const collectOppArtsUseTriggers = (
    myState: PlayerState,
    opState: PlayerState,
    isMyTurnNow: boolean,
  ): StackEntry[] => {
    const entries: StackEntry[] = [];
    for (const stack of myState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of effectsMap.get(topNum) ?? []) {
        if (eff.effectType !== 'AUTO') continue;
        if (!eff.timing?.includes('ON_OPP_ARTS_USE')) continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, myState, opState, isMyTurnNow, battleCardMap)) continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（相手アーツ使用時）`,
          effect: eff,
        });
      }
    }
    return entries;
  };

  // シグニ召喚（ゾーン選択後に実行）
  const handleSummonSigni = async (handIndex: number, zoneIndex: number) => {
    console.log('[handleSummonSigni] called', { handIndex, zoneIndex, isMyTurn, loading });
    if (!isMyTurn || loading) return;
    setLoading(true);
    setPendingSigniSummon(null);
    try {
      const cardNum = my.hand[handIndex];
      const existingStack = my.field.signi[zoneIndex] ?? [];
      const newSigni = [...my.field.signi] as (string[] | null)[];
      newSigni[zoneIndex] = [cardNum];
      // 入れ替え召喚時はそのゾーンのダウン・凍結・チャーム・アクセ・ウィルスをリセット
      const newSigniDown   = [...(my.field.signi_down   ?? [false, false, false])];
      const newSigniFrozen = [...(my.field.signi_frozen  ?? [false, false, false])];
      const newCharms      = [...(my.field.signi_charms  ?? [null, null, null])];
      const newAcce        = [...(my.field.signi_acce    ?? [null, null, null])];
      const newVirus       = [...(my.field.signi_virus   ?? [0, 0, 0])];
      newSigniDown[zoneIndex]   = false;
      newSigniFrozen[zoneIndex] = false;
      const zoneExtraTrash: string[] = [...existingStack];
      if (newCharms[zoneIndex]) { zoneExtraTrash.push(newCharms[zoneIndex]!); newCharms[zoneIndex] = null; }
      if (newAcce[zoneIndex])   { zoneExtraTrash.push(newAcce[zoneIndex]!);   newAcce[zoneIndex]   = null; }
      newVirus[zoneIndex] = 0;
      const placed: PlayerState = {
        ...my,
        hand: my.hand.filter((_, i) => i !== handIndex),
        field: {
          ...my.field,
          signi: newSigni,
          signi_down:   newSigniDown,
          signi_frozen: newSigniFrozen,
          signi_charms: newCharms,
          signi_acce:   newAcce,
          signi_virus:  newVirus as number[],
        },
        trash: [...my.trash, ...zoneExtraTrash],
      };

      // フィールド上の他のシグニの「他のシグニが出たとき」トリガーを収集
      const fieldEntries = collectFieldTriggers('ON_PLAY', cardNum, placed, op);

      // 召喚したカード自身の ON_PLAY 効果（mandatory=falseの任意効果は自動発動しない）
      const ownEffects = effectsMap.get(cardNum) ?? [];
      const ownOnPlay = ownEffects.filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        (e.triggerScope === undefined || e.triggerScope === 'self') &&
        e.mandatory !== false,
      );

      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      appendBattleLogs([`${cardName}を召喚`]);

      if (ownOnPlay.length === 0 && fieldEntries.length === 0) {
        // 効果なし：そのまま保存
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: placed }).eq('room_id', roomId);
        return;
      }

      // 自身の ON_PLAY エントリを StackEntry に変換
      const ownEntries: StackEntry[] = ownOnPlay.map(eff => ({
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: eff.effectId,
        label: `${cardName} の【出】/【自】効果`,
        effect: eff,
      }));

      // すべてをスタックに積む
      const allEntries = [...ownEntries, ...fieldEntries];
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existing = bs?.effect_stack ?? null;
      const stack = existing
        ? pushToStack(existing, allEntries)
        : initStack(turnPlayerId, allEntries);

      const stateKey = isHost ? 'host_state' : 'guest_state';
      const { error: summonErr } = await supabase.from('battle_states')
        .update({ [stateKey]: placed, effect_stack: stack, pending_effect: null })
        .eq('room_id', roomId);
      if (summonErr) console.error('[handleSummonSigni] DB error:', summonErr);
    } finally {
      setLoading(false);
    }
  };

  // グロウ
  const myLrig = my.field.lrig ?? [];
  const currentLrigNum = myLrig[myLrig.length - 1] ?? null;
  const currentLrig = currentLrigNum ? battleCardMap.get(currentLrigNum) ?? null : null;
  const currentLrigLevel = currentLrig ? parseInt(currentLrig.Level) || 0 : 0;

  const growCandidates = my.lrig_deck
    .filter((num, i, arr) => arr.indexOf(num) === i)
    .map(num => battleCardMap.get(num))
    .filter((c): c is CardData =>
      !!c &&
      c.Type === 'ルリグ' &&
      parseInt(c.Level) === currentLrigLevel + 1 &&
      // CardClass 互換チェック
      (!currentLrig || lrigClassesCompatible(currentLrig.CardClass, c.CardClass)) &&
      // 【グロウ】条件チェック（ライフクロス枚数・カード名・トラッシュ色数・エナ色種数）
      checkGrowCondition(extractGrowCondition(c.EffectText), my, currentLrig?.CardName, battleCardMap)
    );

  // ルリグのクラス（制限チェック共通）
  const lrigClass = currentLrig?.CardClass ?? '';

  // シグニ召喚: リミット計算（アシストルリグが各スロットに存在する場合+1ずつ）
  const lrigLimit = (parseInt(currentLrig?.Limit ?? '0') || 0)
    + ((my.field.assist_lrig_l ?? []).length > 0 ? 1 : 0)
    + ((my.field.assist_lrig_r ?? []).length > 0 ? 1 : 0);
  const fieldSigniTopLevels: number[] = my.field.signi.map(stack => {
    if (!stack || stack.length === 0) return 0;
    const top = battleCardMap.get(stack[stack.length - 1]);
    return parseInt(top?.Level ?? '0') || 0;
  });
  const fieldSigniTotal = fieldSigniTopLevels.reduce((s, l) => s + l, 0);


  // アーツ候補（自分の lrig_deck からアーツカード）
  const artsCandidates: CardData[] = my.lrig_deck
    .filter((num, i, arr) => arr.indexOf(num) === i)
    .map(num => battleCardMap.get(num))
    .filter((c): c is CardData => !!c && c.Type === 'アーツ');

  // スペルカットイン候補（自分の lrig_deck から、相手がスペル発動中のとき用）
  const cutinCandidates = my.lrig_deck
    .filter((num, i, arr) => arr.indexOf(num) === i)
    .map(num => battleCardMap.get(num))
    .filter((c): c is CardData =>
      !!c &&
      c.Timing.includes('スペルカットイン') &&
      meetsRestriction(c.Restriction, lrigClass)
    );

  const toggleGrowCostCard = (idx: number) => {
    setSelectedGrowCost(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const executeGrow = async (card: CardData, costIndices: Set<number>) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    setShowGrowModal(false);
    setPendingGrowCard(null);
    setSelectedGrowCost(new Set());
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const coinGain = parseInt(card.Coin) || 0;
      const growCoinCost = parseCoinCost(card.GrowCost);
      const newMyState: PlayerState = {
        ...my,
        lrig_deck: newLrigDeck,
        field: { ...my.field, lrig: [...my.field.lrig, instanceId] },
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        actions_done: [...(my.actions_done ?? []), 'GROW'],
        coins: Math.min(5, Math.max(0, my.coins - growCoinCost) + coinGain),
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
      const coinLog = coinGain > 0 ? `（コイン+${coinGain}）` : '';
      appendBattleLogs([`${card.CardName}にグロウ${coinLog}`]);
    } finally {
      setLoading(false);
    }
  };

  const toggleRemoveZone = (zi: number) => {
    setSelectedRemoveZones(prev => {
      const next = new Set(prev);
      if (next.has(zi)) next.delete(zi); else next.add(zi);
      return next;
    });
  };

  const handleRemove = async () => {
    if (!isMyTurn || loading || selectedRemoveZones.size === 0) return;
    setLoading(true);
    setShowRemoveModal(false);
    try {
      const newSigni = [...my.field.signi] as (string[] | null)[];
      let newTrash = [...my.trash];
      for (const zi of selectedRemoveZones) {
        newTrash = [...newTrash, ...(my.field.signi[zi] ?? [])];
        newSigni[zi] = null;
      }
      const newMyState: PlayerState = {
        ...my,
        field: { ...my.field, signi: newSigni },
        trash: newTrash,
        actions_done: [...(my.actions_done ?? []), 'REMOVE'],
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally {
      setLoading(false);
      setSelectedRemoveZones(new Set());
    }
  };

  const toggleArtsCostCard = (idx: number) => {
    setSelectedArtsCost(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const executeArts = async (card: CardData, costIndices: Set<number>, betting: boolean = false, encore: boolean = false) => {
    if (loading) return;
    if (isActionBlocked('USE_ARTS')) return;
    setLoading(true);
    setShowArtsModal(false);
    setPendingArtsCard(null);
    setSelectedArtsCost(new Set());
    setIsBetting(false);
    setIsEncore(false);
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const betCost = betting ? parseBetCost(card.EffectText ?? '') : 0;
      const encoreCoinCost = encore ? (parseEncoreCost(card.EffectText ?? '')?.coins ?? 0) : 0;
      const paid: PlayerState = {
        ...my,
        lrig_deck: encore
          ? [instanceId, ...newLrigDeck]    // アンコール：ルリグデッキ先頭に戻す
          : newLrigDeck,
        energy: newEnergy,
        lrig_trash: encore
          ? my.lrig_trash                   // アンコール：ルリグトラッシュに置かない
          : [...my.lrig_trash, instanceId],
        trash: [...my.trash, ...paidNums],
        coins: Math.max(0, my.coins - betCost - encoreCoinCost),
      };
      if (betting && betCost > 0) appendBattleLogs([`ベット：コイン${betCost}枚消費`]);
      if (encore) appendBattleLogs([`アンコール：${card.CardName}をルリグデッキに戻す`]);
      // アーツ効果を発火
      const fired = await queueCardEffects(instanceId, ['ACTIVATED'], [], paid, op);
      if (!fired) {
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: paid }).eq('room_id', roomId);
      }
      setCloseZoneSignal(s => s + 1);
    } finally {
      setLoading(false);
    }
  };

  // ── キーピース使用 ──
  const executeKeyPiece = async (card: CardData, costIndices: Set<number>) => {
    if (loading) return;
    setLoading(true);
    setShowKeyModal(false);
    setPendingKeyCard(null);
    setSelectedKeyCost(new Set());
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const coinCost = parseCoinCost(card.Cost) + parseCoinCost(card.GrowCost);
      const paid: PlayerState = {
        ...my,
        lrig_deck: newLrigDeck,
        field: { ...my.field, key_piece: instanceId },
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        coins: Math.max(0, my.coins - coinCost),
      };
      const fired = await queueCardEffects(instanceId, ['AUTO'], ['ON_PLAY'], paid, op);
      if (!fired) {
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: paid }).eq('room_id', roomId);
      }
      setCloseZoneSignal(s => s + 1);
    } finally {
      setLoading(false);
    }
  };

  // ── キーピース起動効果 ──
  const executeKeyActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>) => {
    if (loading) return;
    setLoading(true);
    setPendingKeyActivated(null);
    setSelectedKeyActivatedCost(new Set());
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const paid: PlayerState = {
        ...my,
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        actions_done: [...(my.actions_done ?? []), effect.effectId],
      };
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName} の【起】効果`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack ? pushToStack(existingStack, [entry]) : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ── アシストルリグ グロウ ──
  const executeAssistGrow = async (card: CardData, side: 'l' | 'r', costIndices: Set<number>) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    setShowAssistGrowModal(false);
    setPendingAssistGrowCard(null);
    setPendingAssistSide(null);
    setSelectedAssistGrowCost(new Set());
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const sideKey = side === 'l' ? 'assist_lrig_l' : 'assist_lrig_r';
      const currentStack = (side === 'l' ? my.field.assist_lrig_l : my.field.assist_lrig_r) ?? [];
      const assistCoinGain = parseInt(card.Coin) || 0;
      const newMyState: PlayerState = {
        ...my,
        lrig_deck: newLrigDeck,
        field: { ...my.field, [sideKey]: [...currentStack, instanceId] },
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        coins: Math.min(5, my.coins + assistCoinGain),
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ── アシストルリグ 起動効果 ──
  const executeAssistActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>) => {
    if (loading) return;
    setLoading(true);
    setPendingAssistActivated(null);
    setSelectedAssistActivatedCost(new Set());
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const paid: PlayerState = {
        ...my,
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        actions_done: [...(my.actions_done ?? []), effect.effectId],
      };
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName} の【起】効果`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack ? pushToStack(existingStack, [entry]) : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  const toggleSpellCostCard = (idx: number) => {
    setSelectedSpellCost(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // スペル発動: 手札から除いてコスト支払い → pending_spell をセット（カットイン待ち）
  const castSpell = async (card: CardData, costIndices: Set<number>, handIdx: number) => {
    if (!isMyTurn || loading) return;
    if (isActionBlocked('USE_SPELL')) return;
    setLoading(true);
    setPendingSpellCast(null);
    setSelectedSpellCost(new Set());
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const newMyState: PlayerState = {
        ...my,
        hand: my.hand.filter((_, i) => i !== handIdx),
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      // handからはインスタンスIDで正確な1枚を参照する
      const spell: PendingSpell = { caster_id: user.id, card_num: my.hand[handIdx] ?? card.CardNum };
      await supabase.from('battle_states')
        .update({ [stateKey]: newMyState, pending_spell: spell })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // スペルカットインをパス → スペル解決（スペル効果を発火）
  const handleCutinPass = async () => {
    if (!bs.pending_spell || loading) return;
    setLoading(true);
    setPendingCutinCard(null);
    setSelectedCutinCost(new Set());
    try {
      const { caster_id, card_num } = bs.pending_spell;
      const casterIsHost = caster_id === bs.host_id;
      const casterState = casterIsHost ? bs.host_state : bs.guest_state;
      const nonCasterState = casterIsHost ? bs.guest_state : bs.host_state;
      const resolved: PlayerState = { ...casterState, trash: [...casterState.trash, card_num] };

      // スペル効果を発火（casterがowner）
      const effects = effectsMap.get(card_num) ?? [];
      const spellEff = effects.find(e => e.effectType === 'ACTIVATED');
      if (!spellEff) {
        await supabase.from('battle_states')
          .update({
            [casterIsHost ? 'host_state' : 'guest_state']: resolved,
            pending_spell: null, pending_effect: null,
          })
          .eq('room_id', roomId);
        return;
      }

      const spellWho = caster_id === user.id ? '自分' : '相手';
      const spellName = battleCardMap.get(card_num)?.CardName ?? card_num;
      appendBattleLogs([`[${spellWho}] ${spellName}を使用`]);
      const spellPowers = calcFieldPowers(resolved, nonCasterState, bs.active_user_id === caster_id, effectsMap, battleCardMap);
      const ctx: ExecCtx = { ownerState: resolved, otherState: nonCasterState, cardMap: battleCardMap, logs: [], effectivePowers: spellPowers, sourceCardNum: card_num };
      const result = executeEffect(spellEff, ctx);
      if (result.logs.length > 0) appendBattleLogs(result.logs);
      const hostState  = casterIsHost ? result.ownerState : result.otherState;
      const guestState = casterIsHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState, pending_spell: null };
      if (!result.done) {
        update.pending_effect = { sourcePlayerId: caster_id, sourceCardNum: card_num, effectId: spellEff.effectId, interaction: result.pending } satisfies PendingEffect;
      } else {
        update.pending_effect = null;
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  const toggleCutinCostCard = (idx: number) => {
    setSelectedCutinCost(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // カットイン使用 → カットイン効果発火・スペルをトラッシュ（打ち消し）
  const handleCutinUse = async (cutinCard: CardData, costIndices: Set<number>) => {
    if (!bs.pending_spell || loading) return;
    setLoading(true);
    setPendingCutinCard(null);
    setSelectedCutinCost(new Set());
    try {
      const { caster_id, card_num } = bs.pending_spell;
      const casterIsHost = caster_id === bs.host_id;
      const casterState = casterIsHost ? bs.host_state : bs.guest_state;
      // スペルをトラッシュへ（打ち消し）
      const newCasterState: PlayerState = { ...casterState, trash: [...casterState.trash, card_num] };
      // カットインコスト支払い＆ルリグデッキから除去
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const lrigIdx = my.lrig_deck.findIndex(id => getCardNum(id) === cutinCard.CardNum);
      const cutinInstanceId = lrigIdx >= 0 ? my.lrig_deck[lrigIdx] : cutinCard.CardNum;
      const newLrigDeck = lrigIdx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, lrigIdx), ...my.lrig_deck.slice(lrigIdx + 1)];
      const cutinPaid: PlayerState = {
        ...my,
        lrig_deck: newLrigDeck,
        energy: newEnergy,
        lrig_trash: [...my.lrig_trash, cutinInstanceId],
        trash: [...my.trash, ...paidNums],
      };
      // カットイン効果発火（ownerState=me, otherState=caster）
      const effects = effectsMap.get(cutinInstanceId) ?? [];
      const cutinEff = effects.find(e => e.effectType === 'ACTIVATED');
      if (!cutinEff) {
        const myKey = isHost ? 'host_state' : 'guest_state';
        const casterKey = casterIsHost ? 'host_state' : 'guest_state';
        // myとcasterが同じキーになる場合の処理
        if (myKey === casterKey) {
          // 自分がcasterとはならない（カットインは非キャスター側）
          await supabase.from('battle_states')
            .update({ [myKey]: cutinPaid, pending_spell: null })
            .eq('room_id', roomId);
        } else {
          await supabase.from('battle_states')
            .update({ [myKey]: cutinPaid, [casterKey]: newCasterState, pending_spell: null })
            .eq('room_id', roomId);
        }
        return;
      }
      appendBattleLogs([`[自分] ${cutinCard.CardName}を使用（カットイン）`]);
      // ownerState=cutinPaid(me), otherState=newCasterState
      const cutinPowers = calcFieldPowers(cutinPaid, newCasterState, bs.active_user_id === user.id, effectsMap, battleCardMap);
      const ctx: ExecCtx = { ownerState: cutinPaid, otherState: newCasterState, cardMap: battleCardMap, logs: [], effectivePowers: cutinPowers, sourceCardNum: cutinInstanceId };
      const result = executeEffect(cutinEff, ctx);
      if (result.logs.length > 0) appendBattleLogs(result.logs);
      // myがhost/guestに応じてマッピング
      const hostState  = isHost ? result.ownerState : result.otherState;
      const guestState = isHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState, pending_spell: null };
      if (!result.done) {
        update.pending_effect = { sourcePlayerId: user.id, sourceCardNum: cutinCard.CardNum, effectId: cutinEff.effectId, interaction: result.pending } satisfies PendingEffect;
      } else {
        update.pending_effect = null;
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // フェイズ別・手札カードアクションを返す
  const getMyHandCardActions = (cardNum: string, handIndex: number): CardAction[] => {
    if (!isMyTurn || loading) return [];
    const actionList: CardAction[] = [];

    if (bs.turn_phase === 'ENERGY') {
      const used    = my.actions_done?.includes('ENERGY') ?? false;
      const blocked = my.blocked_actions?.includes('ENERGY') ?? false;
      if (!used && !blocked) {
        actionList.push({
          label: 'エナチャージ',
          color: C.accent,
          onClick: () => handleEnergyChargeFromHand(handIndex),
        });
      }
    }

    if (bs.turn_phase === 'MAIN') {
      const cardData = battleCardMap.get(cardNum);
      if (cardData?.Type === 'シグニ') {
        const signiLevel = parseInt(cardData.Level) || 0;
        // レベル制限: シグニLv ≤ ルリグLv
        const levelOk = signiLevel <= currentLrigLevel;
        // リミット制限: 空きゾーンに召喚後の合計レベルがリミット以内であること
        const canFitSomewhere = [0, 1, 2].some(zi => {
          const isEmpty = (my.field.signi[zi] ?? []).length === 0;
          return isEmpty && (fieldSigniTotal + signiLevel) <= lrigLimit;
        });
        // Restriction チェック
        const restrictionOk = meetsRestriction(cardData.Restriction, lrigClass);
        if (levelOk && canFitSomewhere && restrictionOk) {
          actionList.push({
            label: '召喚',
            color: C.success,
            onClick: () => setPendingSigniSummon({ cardNum, handIndex }),
          });
        }
      }
      if (cardData?.Type === 'スペル' && meetsRestriction(cardData.Restriction, lrigClass)) {
        // pending_spell がある間は新たにスペルを発動できない
        const spellBlocked = !!bs.pending_spell;
        if (!spellBlocked) {
          actionList.push({
            label: '発動',
            color: C.accent,
            onClick: () => { setPendingSpellCast({ cardNum, handIndex }); setSelectedSpellCost(new Set()); },
          });
        }
      }
    }

    return actionList;
  };

  // ルリグデッキのカードアクション（アーツ / キーピース / アシストルリグ）
  const getMyLrigDeckCardActions = (cardNum: string): CardAction[] => {
    if (loading) return [];
    const cardData = battleCardMap.get(cardNum);
    if (!cardData) return [];
    if (!meetsRestriction(cardData.Restriction, lrigClass)) return [];

    const phase = bs.turn_phase;
    const actions: CardAction[] = [];

    // ── アーツ ──
    if (cardData.Type === 'アーツ') {
      const canUse =
        !isActionBlocked('USE_ARTS') && (
          (phase === 'MAIN'           && isMyTurn  && cardData.Timing.includes('メインフェイズ'))  ||
          (phase === 'ATTACK_ARTS'    && isMyTurn  && cardData.Timing.includes('アタックフェイズ')) ||
          (phase === 'ATTACK_ARTS_OP' && !isMyTurn && cardData.Timing.includes('アタックフェイズ'))
        );
      const extraArtsCosts = activeCostMods.forMy
        .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
        .flatMap(m => m.amount);
      if (canUse && canAffordWithExtraCost(my.energy, battleCards, cardData.Cost, extraArtsCosts, my.keyword_grants, myEnaAllMulti)) {
        actions.push({
          label: '使用',
          color: C.coin,
          onClick: () => { setPendingArtsCard(cardData); setSelectedArtsCost(new Set()); setShowArtsModal(true); },
        });
      }
    }

    // ── キーピース ──
    if ((cardData.Type === 'キー' || cardData.Type === 'ピース') && !my.field.key_piece) {
      const timing = cardData.Timing ?? '';
      const canUse =
        (phase === 'MAIN' && isMyTurn && (timing.includes('メインフェイズ') || !timing)) ||
        (phase === 'GROW' && isMyTurn && timing.includes('グロウフェイズ'));
      const coinNeeded = parseCoinCost(cardData.Cost) + parseCoinCost(cardData.GrowCost);
      const canAfford = my.coins >= coinNeeded && canAffordGrowCost(my.energy, battleCards, cardData.Cost, my.keyword_grants, myEnaAllMulti);
      if (canUse && canAfford) {
        actions.push({
          label: 'キーにセット',
          color: '#cc8800',
          onClick: () => { setPendingKeyCard(cardData); setSelectedKeyCost(new Set()); setShowKeyModal(true); },
        });
      }
    }

    // ── アシストルリグ ──
    if (cardData.Type === 'アシストルリグ' && isMyTurn) {
      const canGrow = phase === 'MAIN' || phase === 'GROW' || phase === 'ATTACK_ARTS';
      if (canGrow && canAffordGrowCost(my.energy, battleCards, cardData.GrowCost, my.keyword_grants, myEnaAllMulti)) {
        const targetLevel = parseInt(cardData.Level) || 0;
        if (targetLevel <= currentLrigLevel) {
          // 左スロット
          const lStack = my.field.assist_lrig_l ?? [];
          const lTopLevel = lStack.length > 0
            ? (parseInt(battleCardMap.get(lStack[lStack.length - 1])?.Level ?? '') || 0)
            : -1;
          if (targetLevel === lTopLevel + 1) {
            actions.push({
              label: 'グロウ(左)',
              color: '#6644aa',
              onClick: () => { setPendingAssistGrowCard(cardData); setPendingAssistSide('l'); setSelectedAssistGrowCost(new Set()); setShowAssistGrowModal(true); },
            });
          }
          // 右スロット
          const rStack = my.field.assist_lrig_r ?? [];
          const rTopLevel = rStack.length > 0
            ? (parseInt(battleCardMap.get(rStack[rStack.length - 1])?.Level ?? '') || 0)
            : -1;
          if (targetLevel === rTopLevel + 1) {
            actions.push({
              label: 'グロウ(右)',
              color: '#6644aa',
              onClick: () => { setPendingAssistGrowCard(cardData); setPendingAssistSide('r'); setSelectedAssistGrowCost(new Set()); setShowAssistGrowModal(true); },
            });
          }
        }
      }
    }

    return actions;
  };

  // ライフクロスを1枚クラッシュし、チェック状態にする
  // returns null: ライフなし（即勝利判定が必要）、string: クラッシュしたカード番号
  const crashOneLife = (state: PlayerState): { newState: PlayerState; crashed: string | null } => {
    if (state.life_cloth.length === 0) return { newState: state, crashed: null };
    const crashed = state.life_cloth[state.life_cloth.length - 1];
    return {
      newState: {
        ...state,
        life_cloth: state.life_cloth.slice(0, -1),
        field: { ...state.field, check: crashed },
      },
      crashed,
    };
  };

  // シグニアタック処理（キーワード能力対応）
  const handleSigniAttack = async (zoneIndex: number) => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_SIGNI') return;
    if (op.field.check) return; // 相手のライフバースト処理待ち中はアタック不可
    setLoading(true);
    try {
      const myTopNum = (my.field.signi[zoneIndex] ?? []).at(-1);
      if (!myTopNum) return;

      const myCardName = battleCardMap.get(myTopNum)?.CardName ?? myTopNum;
      const opZoneIndex = 2 - zoneIndex; // 正面ゾーン（表示反転を考慮）
      const opStack = op.field.signi[opZoneIndex] ?? [];
      const opTopCardNum = opStack.length > 0 ? opStack[opStack.length - 1] : null;
      const opTopCard = opTopCardNum ? battleCardMap.get(opTopCardNum) : null;

      const myKey = isHost ? 'host_state' : 'guest_state';
      const opKey = isHost ? 'guest_state' : 'host_state';

      // 自分のシグニをダウン
      const newSigniDown = [...(my.field.signi_down ?? [false, false, false])];
      newSigniDown[zoneIndex] = true;
      let newMyState: PlayerState = { ...my, field: { ...my.field, signi_down: newSigniDown } };
      let newOpState = op;
      let banishedOpCardNum: string | null = null; // バニッシュされた相手シグニ

      // キーワード能力を確認
      const myGrants = my.keyword_grants;
      const isAssassin    = hasKeyword(myTopNum, 'アサシン',      battleCardMap, myGrants);
      const isLancer      = hasKeyword(myTopNum, 'ランサー',      battleCardMap, myGrants);
      const isDoubleCrush = hasKeyword(myTopNum, 'ダブルクラッシュ', battleCardMap, myGrants);

      // アサシン：正面シグニを無視してライフへ直接アタック
      const effectivelyEmpty = !opTopCardNum || isAssassin;

      if (!effectivelyEmpty && opTopCardNum && opTopCard) {
        // ─── 通常バトル（正面シグニあり・アサシンなし）───
        const opCardName = opTopCard.CardName ?? opTopCardNum;
        const myPower = effectivePowers.get(myTopNum)
          ?? (parseInt(battleCardMap.get(myTopNum)?.Power ?? '0') || 0);
        const opPower = effectivePowers.get(opTopCardNum)
          ?? (parseInt(opTopCard.Power ?? '0') || 0);
        appendBattleLogs([`${myCardName}（${myPower}）vs ${opCardName}（${opPower}）`]);

        if (myPower >= opPower) {
          // バトル勝利：相手シグニの処理
          const opCharms = op.field.signi_charms ?? [];
          const opCharm  = opCharms[opZoneIndex] ?? null;

          if (opCharm) {
            // チャームが付いている → チャームを除去（トラッシュへ）してシグニ生存
            const newCharms = [...opCharms];
            newCharms[opZoneIndex] = null;
            newOpState = {
              ...op,
              trash: [...op.trash, opCharm],
              field: { ...op.field, signi_charms: newCharms },
            };
            appendBattleLogs([`${opCardName}のチャームを除去（シグニ生存）`]);
          } else {
            // 通常バニッシュ → 相手エナへ（チャーム・アクセもトラッシュへ、ウィルスリセット）
            banishedOpCardNum = opTopCardNum;
            const newOpSigni = [...op.field.signi] as (string[] | null)[];
            newOpSigni[opZoneIndex] = null;
            const newOpDown   = [...(op.field.signi_down   ?? [false, false, false])];
            const newOpFrozen = [...(op.field.signi_frozen  ?? [false, false, false])];
            const newOpCharms = [...(op.field.signi_charms  ?? [null, null, null])];
            const newOpAcce   = [...(op.field.signi_acce    ?? [null, null, null])];
            const newOpVirus  = [...(op.field.signi_virus   ?? [0, 0, 0])];
            newOpDown[opZoneIndex]   = false;
            newOpFrozen[opZoneIndex] = false;
            const banishExtraTrash: string[] = [];
            if (newOpCharms[opZoneIndex]) { banishExtraTrash.push(newOpCharms[opZoneIndex]!); newOpCharms[opZoneIndex] = null; }
            if (newOpAcce[opZoneIndex])   { banishExtraTrash.push(newOpAcce[opZoneIndex]!);   newOpAcce[opZoneIndex]   = null; }
            newOpVirus[opZoneIndex] = 0;
            newOpState = {
              ...op,
              energy: [...op.energy, ...opStack],
              trash: banishExtraTrash.length > 0 ? [...op.trash, ...banishExtraTrash] : op.trash,
              field: {
                ...op.field,
                signi: newOpSigni,
                signi_down:   newOpDown,
                signi_frozen: newOpFrozen,
                signi_charms: newOpCharms,
                signi_acce:   newOpAcce,
                signi_virus:  newOpVirus as number[],
              },
            };
            appendBattleLogs([`${myCardName}が${opCardName}をバニッシュ`]);
          }

          // ランサー：バトル勝利後に追加でライフを1枚クラッシュ
          if (isLancer) {
            const { newState: afterCrash, crashed } = crashOneLife(newOpState);
            if (!crashed) {
              // ライフなし → 相手の敗北
              appendBattleLogs([`ランサー：相手のライフなし → 相手の敗北`]);
              await supabase.from('battle_states')
                .update({ [myKey]: newMyState, [opKey]: newOpState, global_phase: 'FINISHED', winner_id: user.id })
                .eq('room_id', roomId);
              return;
            }
            appendBattleLogs([`ランサー：ライフクロスをクラッシュ`]);
            newOpState = afterCrash;
          }
        } else {
          appendBattleLogs([`${myCardName}はバトルに敗北`]);
        }
      } else {
        // ─── ライフへのアタック（正面空 or アサシン）───
        const crashCount = isDoubleCrush ? 2 : 1;
        const attackLabel = isAssassin && opTopCardNum
          ? `${myCardName}（アサシン）がライフをクラッシュ`
          : `${myCardName}がライフをクラッシュ`;

        // 1枚目クラッシュ
        const { newState: afterFirst, crashed: firstCrashed } = crashOneLife(newOpState);
        if (!firstCrashed) {
          // ライフなし → 相手の敗北
          appendBattleLogs([`${myCardName}がアタック：相手のライフなし → 相手の敗北`]);
          await supabase.from('battle_states')
            .update({ [myKey]: newMyState, global_phase: 'FINISHED', winner_id: user.id })
            .eq('room_id', roomId);
          return;
        }
        appendBattleLogs([attackLabel]);
        newOpState = afterFirst;

        if (crashCount > 1 && newOpState.life_cloth.length > 0) {
          // 公式ルール「同時クラッシュ」: 2枚目もライフから先に取り出す
          const secondCard = newOpState.life_cloth[newOpState.life_cloth.length - 1];
          newOpState = {
            ...newOpState,
            life_cloth: newOpState.life_cloth.slice(0, -1),
            pending_crashed_cards: [...(newOpState.pending_crashed_cards ?? []), secondCard],
          };
          appendBattleLogs([`ダブルクラッシュ：2枚目（${battleCardMap.get(secondCard)?.CardName ?? secondCard}）を同時クラッシュ予約`]);
        }
      }

      // ON_ATTACK_SIGNI トリガー（アタックしたシグニ自身）
      const attackEntries: StackEntry[] = (effectsMap.get(myTopNum) ?? [])
        .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_SIGNI'))
        .map(e => ({
          id: generateUUID(),
          playerId: user.id,
          cardNum: myTopNum,
          effectId: e.effectId,
          label: `${battleCardMap.get(myTopNum)?.CardName ?? myTopNum} の【自】効果（シグニアタック時）`,
          effect: e,
        } satisfies StackEntry));

      // ON_BANISH トリガー（バニッシュされた相手シグニ + フィールドトリガー）
      const newHostState  = isHost ? newMyState : newOpState;
      const newGuestState = isHost ? newOpState : newMyState;
      const banishEntries = banishedOpCardNum
        ? collectBanishTriggers(
            banishedOpCardNum,
            isHost ? bs.guest_id : bs.host_id,
            newHostState,
            newGuestState,
          )
        : [];

      const allTriggers = [...attackEntries, ...banishEntries];
      if (allTriggers.length > 0) {
        const turnPlayerId = bs.active_user_id ?? user.id;
        const existingStack = bs.effect_stack ?? null;
        const stack = existingStack
          ? pushToStack(existingStack, allTriggers)
          : initStack(turnPlayerId, allTriggers);
        await supabase.from('battle_states')
          .update({ [myKey]: newMyState, [opKey]: newOpState, effect_stack: stack })
          .eq('room_id', roomId);
      } else {
        await supabase.from('battle_states')
          .update({ [myKey]: newMyState, [opKey]: newOpState })
          .eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
    }
  };

  // ルリグアタック: 自分のルリグをダウンし相手にガード応答を要求
  const handleLrigAttack = async () => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_LRIG') return;
    if (my.field.lrig_down) return; // すでに攻撃済み
    if (op.field.lrig_attacked) return; // ガード応答待ち中
    setLoading(true);
    try {
      const myKey = isHost ? 'host_state' : 'guest_state';
      const opKey = isHost ? 'guest_state' : 'host_state';
      const lrigName = battleCardMap.get(my.field.lrig.at(-1) ?? '')?.CardName ?? 'ルリグ';
      appendBattleLogs([`${lrigName}がアタック`]);
      const newMyState: PlayerState = { ...my, field: { ...my.field, lrig_down: true } };
      const newOpState: PlayerState = { ...op, field: { ...op.field, lrig_attacked: true } };
      await supabase.from('battle_states')
        .update({ [myKey]: newMyState, [opKey]: newOpState })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ダブルクラッシュ等による追加ライフクラッシュ（バースト後に自動発動）
  // 同時クラッシュで先にライフから取り出したカードを check にセットして処理する
  const triggerPendingCrash = async () => {
    const pendingCards = my.pending_crashed_cards ?? [];
    if (!pendingCards.length || my.field.check || loading) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const [nextCard, ...remaining] = pendingCards;
      const newMyState: PlayerState = {
        ...my,
        pending_crashed_cards: remaining,
        field: { ...my.field, check: nextCard },
      };
      const crashedName = battleCardMap.get(nextCard)?.CardName ?? nextCard;
      appendBattleLogs([`ダブルクラッシュ：ライフクロスをクラッシュ（${crashedName}）`]);
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // パワー0以下シグニの自動バニッシュ処理
  const checkAndBanishPowerZero = async () => {
    if (!bs || loading || bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;

    let hostState  = bs.host_state;
    let guestState = bs.guest_state;
    const isMyTurnLocal = bs.active_user_id === bs.host_id;
    const powers = calcFieldPowers(hostState, guestState, isMyTurnLocal, effectsMap, battleCardMap);
    let changed = false;
    const allTriggers: StackEntry[] = [];

    for (const ownerIsHost of [true, false]) {
      const ownerId = ownerIsHost ? bs.host_id : bs.guest_id;
      const ownerState = ownerIsHost ? hostState : guestState;
      const grants = ownerState.keyword_grants;

      for (const stack of ownerState.field.signi) {
        if (!stack?.length) continue;
        const topNum = stack[stack.length - 1];
        const power = powers.get(topNum) ?? parseInt(battleCardMap.get(topNum)?.Power ?? '0', 10);
        if (power > 0) continue;
        // バニッシュ耐性あり → 0のまま場に残る
        if (hasBanishResist(topNum, battleCardMap, grants)) continue;

        // バニッシュ実行（フィールドから除去 → オーナーのエナへ）
        const currentOwner = ownerIsHost ? hostState : guestState;
        const removed = removeFromField(topNum, currentOwner);
        const withEnergy: PlayerState = { ...removed, energy: [...removed.energy, topNum] };
        if (ownerIsHost) hostState = withEnergy; else guestState = withEnergy;
        changed = true;
        const banishedName = battleCardMap.get(topNum)?.CardName ?? topNum;
        appendBattleLogs([`${banishedName}はパワー0以下のためバニッシュ`]);

        // ON_BANISH トリガー収集
        const triggers = collectBanishTriggers(topNum, ownerId, hostState, guestState);
        allTriggers.push(...triggers);
      }
    }

    if (!changed) return;
    setLoading(true);
    try {
      let newStack = bs.effect_stack as EffectStack | null;
      if (allTriggers.length > 0) {
        newStack = initStack(bs.active_user_id!, allTriggers);
      }
      await supabase.from('battle_states').update({
        host_state: hostState,
        guest_state: guestState,
        ...(newStack !== bs.effect_stack ? { effect_stack: newStack } : {}),
      }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // refs を常に最新の関数インスタンスに同期（Rules of Hooks 対応）
  doPhaseAdvanceRef.current         = doPhaseAdvance;
  triggerPendingCrashRef.current    = triggerPendingCrash;
  resolveStackNextRef.current       = resolveStackNext;
  checkPowerZeroBanishRef.current   = checkAndBanishPowerZero;

  // ガード応答: handIndex=ガードカードのインデックス、null=ガードしない
  const handleGuardResponse = async (handIndex: number | null) => {
    if (!my.field.lrig_attacked || loading) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      let newMyState: PlayerState;
      if (handIndex !== null) {
        // ガードカードをトラッシュへ
        const cardNum = my.hand[handIndex];
        const guardCardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
        appendBattleLogs([`ガード（${guardCardName}）`]);
        newMyState = {
          ...my,
          hand: my.hand.filter((_, i) => i !== handIndex),
          trash: [...my.trash, cardNum],
          field: { ...my.field, lrig_attacked: false },
        };
      } else {
        // ガードしない → ライフクロスをクラッシュ
        if (my.life_cloth.length > 0) {
          const crashed = my.life_cloth[my.life_cloth.length - 1];
          const crashedName = battleCardMap.get(crashed)?.CardName ?? crashed;
          appendBattleLogs([`ルリグアタック：ライフクロスをクラッシュ（${crashedName}）`]);
          newMyState = {
            ...my,
            life_cloth: my.life_cloth.slice(0, -1),
            field: { ...my.field, lrig_attacked: false, check: crashed },
          };
        } else {
          // ライフクロス0枚 → 自分の敗北
          appendBattleLogs([`ルリグアタック：ライフなし → 敗北`]);
          const winnerId = isHost ? bs.guest_id : bs.host_id;
          const clearedMyState: PlayerState = { ...my, field: { ...my.field, lrig_attacked: false } };
          await supabase.from('battle_states')
            .update({ [stateKey]: clearedMyState, global_phase: 'FINISHED', winner_id: winnerId })
            .eq('room_id', roomId);
          return;
        }
      }
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ライフバースト確認後の処理
  const handleLifeBurstResponse = async (activate: boolean) => {
    if (!my.field.check || loading) return;
    setLoading(true);
    try {
      const cardNum = my.field.check;
      // チェックゾーンをクリアしてエナへ移動した状態を基点にする
      const baseState: PlayerState = {
        ...my,
        energy: [...my.energy, cardNum],
        field: { ...my.field, check: null },
      };
      if (!activate) {
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states')
          .update({ [stateKey]: baseState, pending_effect: null })
          .eq('room_id', roomId);
        return;
      }
      // LIFE_BURST効果を発火
      const fired = await queueCardEffects(cardNum, ['LIFE_BURST'], ['ON_LIFE_BURST'], baseState, op);
      if (!fired) {
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states')
          .update({ [stateKey]: baseState, pending_effect: null })
          .eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
    }
  };

  // シグニ起動効果を実行（コスト支払い後）
  const executeSigniActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>) => {
    if (loading) return;
    setLoading(true);
    setPendingSigniActivated(null);
    setSelectedSigniActivatedCost(new Set());
    try {
      // エナコストを支払う
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      // down_self コストの場合はそのゾーンをダウン
      const newSigniDown = [...(my.field.signi_down ?? [false, false, false])];
      if (effect.cost?.down_self) {
        const zoneIdx = my.field.signi.findIndex(s => s?.at(-1) === cardNum);
        if (zoneIdx >= 0) newSigniDown[zoneIdx] = true;
      }
      const paid: PlayerState = {
        ...my,
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        field: { ...my.field, signi_down: newSigniDown },
        actions_done: [...(my.actions_done ?? []), effect.effectId],
      };
      // 効果をスタックに積む
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName} の【起】効果`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, [entry])
        : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ルリグ付与能力（GRANT_LRIG_ABILITY）の発動：エクシードコスト＋エナコスト支払い
  const executeLrigGranted = async (effect: import('../types/effects').CardEffect, costIndices: Set<number>) => {
    if (loading) return;
    setLoading(true);
    setPendingLrigGranted(null);
    setSelectedLrigGrantedCost(new Set());
    try {
      // エクシードコスト：ルリグスタックの下からN枚をルリグトラッシュへ
      const exceedCost = effect.cost?.exceed ?? 0;
      let newLrig = [...my.field.lrig];
      let newLrigTrash = [...my.lrig_trash];
      if (exceedCost > 0 && newLrig.length > 1) {
        const exceedCards = newLrig.splice(0, Math.min(exceedCost, newLrig.length - 1));
        newLrigTrash = [...newLrigTrash, ...exceedCards];
      }
      // エナコスト支払い
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const paid: import('../types').PlayerState = {
        ...my,
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        field: { ...my.field, lrig: newLrig },
        lrig_trash: newLrigTrash,
        actions_done: [...(my.actions_done ?? []), effect.effectId],
      };
      const lrigTop = my.field.lrig.at(-1);
      const cardName = battleCardMap.get(lrigTop ?? '')?.CardName ?? 'ルリグ';
      const entry: import('../types').StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum: lrigTop ?? '',
        effectId: effect.effectId,
        label: `${cardName} の【起】付与効果`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, [entry])
        : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // シグニゾーンのカードアクション（エナチャージ / 起動 / アタック）
  const getMySigniZoneActions = (rawZoneIdx: number): CardAction[] => {
    if (!isMyTurn || loading) return [];
    const stack = my.field.signi[rawZoneIdx];

    if (bs.turn_phase === 'ENERGY') {
      const used    = my.actions_done?.includes('ENERGY') ?? false;
      const blocked = my.blocked_actions?.includes('ENERGY') ?? false;
      if (used || blocked) return [];
      if (!stack || stack.length === 0) return [];
      return [{ label: 'エナチャージ', color: C.accent, onClick: () => handleEnergyChargeFromSigni(rawZoneIdx) }];
    }

    if (bs.turn_phase === 'MAIN') {
      if (!stack || stack.length === 0) return [];
      const topNum = stack[stack.length - 1];
      const effects = effectsMap.get(topNum) ?? [];
      const activatable = effects.filter(e =>
        e.effectType === 'ACTIVATED' &&
        (e.timing === undefined || e.timing.includes('MAIN')) &&
        !(my.actions_done?.includes(e.effectId)) &&
        !(my.blocked_actions?.includes(e.effectId)),
      );
      if (activatable.length === 0) return [];
      return activatable.map(eff => {
        const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const costLabel = eff.cost
          ? [
              energyTotal > 0 ? `エナ${energyTotal}` : null,
              eff.cost.discard ? `手札${eff.cost.discard}枚トラッシュ` : null,
              eff.cost.down_self ? 'ダウン' : null,
            ].filter(Boolean).join('・') || 'コストなし'
          : 'コストなし';
        return {
          label: `【起】${costLabel}`,
          color: C.coin,
          onClick: () => {
            setPendingSigniActivated({ cardNum: topNum, effect: eff });
            setSelectedSigniActivatedCost(new Set());
          },
        };
      });
    }

    if (bs.turn_phase === 'ATTACK_SIGNI') {
      if (!stack || stack.length === 0) return []; // シグニなし
      if (my.field.signi_down?.[rawZoneIdx]) return []; // すでにダウン
      if (op.field.check) return []; // 相手のライフバースト処理待ち
      const topNum = stack[stack.length - 1];
      if (contBlocked.cannotAttackSigni.has(topNum)) return []; // アタック不可シグニ
      return [{ label: 'アタック', color: C.danger, onClick: () => handleSigniAttack(rawZoneIdx) }];
    }

    return [];
  };

  // ルリグゾーンのカードアクション（ルリグアタック）
  const getMyLrigFieldActions = (): CardAction[] => {
    if (!isMyTurn || loading) return [];
    if (my.field.lrig.length === 0) return [];

    // MAINフェイズ：付与された ACTIVATED 能力を表示
    if (bs.turn_phase === 'MAIN') {
      return grantedMyLrigEffects
        .filter(e =>
          e.effectType === 'ACTIVATED' &&
          !(my.actions_done?.includes(e.effectId)) &&
          !(my.blocked_actions?.includes(e.effectId)),
        )
        .map(eff => {
          const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
          const exceedCost = eff.cost?.exceed ?? 0;
          const costParts: string[] = [];
          if (exceedCost > 0) costParts.push(`エクシード${exceedCost}`);
          if (energyTotal > 0) costParts.push(`エナ${energyTotal}`);
          const costLabel = costParts.join('・') || 'コストなし';
          return {
            label: `【起】${costLabel}`,
            color: C.coin,
            onClick: () => {
              const lrigTop = my.field.lrig.at(-1) ?? '';
              setPendingLrigGranted({ sourceCardNum: lrigTop, effect: eff });
              setSelectedLrigGrantedCost(new Set());
            },
          };
        });
    }

    // ATTACK_LRIGフェイズ：ルリグアタック
    if (bs.turn_phase === 'ATTACK_LRIG') {
      if (my.field.lrig_down) return []; // 攻撃済み
      if (op.field.lrig_attacked) return []; // ガード応答待ち
      return [{ label: 'アタック', color: C.danger, onClick: handleLrigAttack }];
    }

    return [];
  };

  // ── キーピース フィールドアクション ──
  const getKeyPieceActions = (): CardAction[] => {
    if (!isMyTurn || loading || !my.field.key_piece) return [];
    const keyNum = my.field.key_piece;
    const phase = bs.turn_phase;
    const effects = effectsMap.get(keyNum) ?? [];
    const activatable = effects.filter(e =>
      e.effectType === 'ACTIVATED' &&
      !(my.actions_done?.includes(e.effectId)) &&
      !(my.blocked_actions?.includes(e.effectId)) &&
      (phase === 'MAIN' || phase === 'ATTACK_ARTS' || phase === 'ATTACK_ARTS_OP' || phase === 'ATTACK_SIGNI' || phase === 'ATTACK_LRIG'),
    );
    return activatable.map(eff => {
      const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
      const costLabel = eff.cost
        ? [energyTotal > 0 ? `エナ${energyTotal}` : null, eff.cost.discard ? `手札${eff.cost.discard}枚` : null]
            .filter(Boolean).join('・') || 'コストなし'
        : 'コストなし';
      return {
        label: `【起】${costLabel}`,
        color: C.coin,
        onClick: () => { setPendingKeyActivated({ cardNum: keyNum, effect: eff }); setSelectedKeyActivatedCost(new Set()); },
      };
    });
  };

  // ── アシストルリグ フィールドアクション ──
  const getAssistActions = (side: 'l' | 'r'): CardAction[] => {
    if (!isMyTurn || loading) return [];
    const stack = (side === 'l' ? my.field.assist_lrig_l : my.field.assist_lrig_r) ?? [];
    if (stack.length === 0) return [];
    const topNum = stack[stack.length - 1];
    const phase = bs.turn_phase;
    const effects = effectsMap.get(topNum) ?? [];
    const activatable = effects.filter(e =>
      e.effectType === 'ACTIVATED' &&
      !(my.actions_done?.includes(e.effectId)) &&
      !(my.blocked_actions?.includes(e.effectId)) &&
      (phase === 'MAIN' || phase === 'ATTACK_ARTS' || phase === 'ATTACK_ARTS_OP'),
    );
    return activatable.map(eff => {
      const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
      const costLabel = eff.cost
        ? [energyTotal > 0 ? `エナ${energyTotal}` : null, eff.cost.down_self ? 'ダウン' : null]
            .filter(Boolean).join('・') || 'コストなし'
        : 'コストなし';
      return {
        label: `【起】${costLabel}`,
        color: C.coin,
        onClick: () => { setPendingAssistActivated({ cardNum: topNum, effect: eff }); setSelectedAssistActivatedCost(new Set()); },
      };
    });
  };

  // フリーゾーンのカードアクション
  const getMyFreeZoneActions = (cardNum: string): CardAction[] => {
    if (!isMyTurn || loading) return [];
    const actions: CardAction[] = [];
    actions.push({
      label: '手札に戻す',
      color: C.textSub,
      onClick: async () => {
        const newFreeZone = (my.field.free_zone ?? []).filter(n => n !== cardNum);
        const newGrants = { ...(my.keyword_grants ?? {}) };
        delete newGrants[cardNum];
        const newMy: typeof my = {
          ...my,
          hand: [...my.hand, cardNum],
          keyword_grants: newGrants,
          field: { ...my.field, free_zone: newFreeZone },
        };
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: newMy }).eq('room_id', roomId);
        setCloseZoneSignal(s => s + 1);
      },
    });
    actions.push({
      label: 'トラッシュへ',
      color: C.danger,
      onClick: async () => {
        const newFreeZone = (my.field.free_zone ?? []).filter(n => n !== cardNum);
        const newGrants = { ...(my.keyword_grants ?? {}) };
        delete newGrants[cardNum];
        const newMy: typeof my = {
          ...my,
          trash: [...my.trash, cardNum],
          keyword_grants: newGrants,
          field: { ...my.field, free_zone: newFreeZone },
        };
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: newMy }).eq('room_id', roomId);
        setCloseZoneSignal(s => s + 1);
      },
    });
    return actions;
  };

  // 勝敗確定後の終了確認（両者が押したらルーム削除）
  const handleEndAck = async () => {
    if (loading) return;
    setLoading(true);
    const ackKey = isHost ? 'host_end_ack' : 'guest_end_ack';
    await supabase.from('battle_states').update({ [ackKey]: true }).eq('room_id', roomId);
    // 最新状態を取得して両者が押したか確認
    const { data } = await supabase
      .from('battle_states')
      .select('host_end_ack, guest_end_ack')
      .eq('room_id', roomId)
      .single();
    if (data?.host_end_ack && data?.guest_end_ack) {
      leavingRef.current = true;
      await supabase.from('battle_states').delete().eq('room_id', roomId);
      await supabase.from('rooms').delete().eq('id', roomId);
      onBack();
      return;
    }
    setLoading(false);
  };

  // 対戦終了（ルーム削除）
  const handleEnd = async () => {
    leavingRef.current = true;
    setLoading(true);
    await supabase.from('battle_states').delete().eq('room_id', roomId);
    await supabase.from('rooms').delete().eq('id', roomId);
    setLoading(false);
    setShowEndConfirm(false);
    onBack();
  };

  return (
    <div style={{ height: '100vh', backgroundColor: C.bgApp, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* 勝敗確定ポップアップ */}
      {bs.global_phase === 'FINISHED' && bs.winner_id && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 5000,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 16,
            padding: '40px 32px', width: 'min(88vw, 320px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
            textAlign: 'center',
          }}>
            {bs.winner_id === user.id ? (
              <>
                <p style={{ fontSize: 48, margin: 0 }}>🏆</p>
                <p style={{ color: '#ffd700', fontSize: 28, fontWeight: 'bold', margin: 0 }}>
                  勝利！
                </p>
                <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>
                  おめでとうございます！
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 48, margin: 0 }}>💀</p>
                <p style={{ color: C.danger, fontSize: 28, fontWeight: 'bold', margin: 0 }}>
                  敗北...
                </p>
                <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>
                  また挑戦しましょう！
                </p>
              </>
            )}
            {(() => {
              const myAck = isHost ? bs.host_end_ack : bs.guest_end_ack;
              const opAck = isHost ? bs.guest_end_ack : bs.host_end_ack;
              return (
                <>
                  {opAck && !myAck && (
                    <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
                      相手が終了を待っています
                    </p>
                  )}
                  <button
                    onClick={handleEndAck}
                    disabled={loading || myAck}
                    style={{
                      width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                      backgroundColor: myAck ? C.disabled : C.dangerEnd,
                      color: C.text, fontSize: 15, fontWeight: 'bold',
                      cursor: (loading || myAck) ? 'default' : 'pointer',
                    }}
                  >
                    {myAck ? '終了待機中...' : '対戦終了'}
                  </button>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* 終了確認モーダル */}
      {showEndConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '28px 24px', width: 'min(88vw, 320px)', textAlign: 'center',
          }}>
            <p style={{ color: C.text, fontSize: 16, fontWeight: 'bold', margin: '0 0 8px' }}>
              対戦を終了しますか？
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 24px' }}>
              ルームが削除され、対戦データは失われます
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowEndConfirm(false)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleEnd}
                disabled={loading}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: loading ? C.disabled : C.dangerEnd,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: loading ? 'default' : 'pointer',
                }}
              >
                {loading ? '削除中...' : '終了する'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* グロウ選択モーダル */}
      {showGrowModal && createPortal(
        <div onClick={() => { setShowGrowModal(false); setPendingGrowCard(null); setSelectedGrowCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>

            {!pendingGrowCard ? (
              /* ── Phase 1: グロウ先選択 ── */
              <>
                <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  グロウ先を選択
                </p>
                <p style={{ color: C.textDim, fontSize: 11, margin: 0, textAlign: 'center' }}>
                  現在 Lv.{currentLrigLevel} → Lv.{currentLrigLevel + 1}
                </p>
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {growCandidates.length === 0 ? (
                    <p style={{ color: C.textFaint, textAlign: 'center', margin: '12px 0' }}>候補なし</p>
                  ) : growCandidates.map(card => {
                    const growCoinNeeded = parseCoinCost(card.GrowCost);
                    const canAfford = (growCoinNeeded === 0 || my.coins >= growCoinNeeded) &&
                      canAffordGrowCost(my.energy, battleCards, card.GrowCost, my.keyword_grants, myEnaAllMulti);
                    const totalReq = parseGrowCost(card.GrowCost).reduce((s, c) => s + c.count, 0);
                    return (
                      <button key={card.CardNum}
                        onClick={() => {
                          if (!canAfford) return;
                          if (totalReq === 0) { executeGrow(card, new Set()); }
                          else { setPendingGrowCard(card); setSelectedGrowCost(new Set()); }
                        }}
                        disabled={loading || !canAfford}
                        style={{ display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                          backgroundColor: canAfford ? C.bgButton : C.bgButtonDark,
                          cursor: (loading || !canAfford) ? 'default' : 'pointer',
                          opacity: canAfford ? 1 : 0.5, textAlign: 'left' }}>
                        <img src={card.ImgURL} alt={card.CardName}
                          style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                        <div>
                          <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>
                            {card.CardName}
                          </p>
                          <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                            コスト: {card.GrowCost || 'なし'}
                          </p>
                          {(parseInt(card.Coin) || 0) > 0 && (
                            <p style={{ color: C.coin, fontSize: 10, margin: '2px 0 0' }}>
                              コイン+{card.Coin}枚
                            </p>
                          )}
                          {growCoinNeeded > 0 && (
                            <p style={{ color: C.coin, fontSize: 10, margin: '2px 0 0' }}>
                              コイン×{growCoinNeeded}（所持: {my.coins}）
                            </p>
                          )}
                          {!canAfford && (
                            <p style={{ color: C.danger, fontSize: 10, margin: '2px 0 0' }}>
                              {growCoinNeeded > 0 && my.coins < growCoinNeeded ? 'コイン不足' : 'エナ不足'}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { setShowGrowModal(false); setPendingGrowCard(null); setSelectedGrowCost(new Set()); }}
                  style={{ padding: '8px 0', borderRadius: 8, border: C.borderUI,
                    backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13 }}>
                  キャンセル（グロウしない）
                </button>
              </>
            ) : (() => {
              /* ── Phase 2: コスト支払いカード選択 ── */
              const costItems = parseGrowCost(pendingGrowCard.GrowCost);
              const totalReq = costItems.reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedGrowCost].map(i => my.energy[i]);
              const isValid = selectedGrowCost.size === totalReq &&
                canAffordGrowCost(selectedNums, battleCards, pendingGrowCard.GrowCost, my.keyword_grants, myEnaAllMulti);
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingGrowCard(null); setSelectedGrowCost(new Set()); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← 戻る
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      コストを選択
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={pendingGrowCard.ImgURL} alt={pendingGrowCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>
                        {pendingGrowCard.CardName}
                      </p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                        コスト: {pendingGrowCard.GrowCost}
                      </p>
                    </div>
                  </div>
                  <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                    エナから選択: {selectedGrowCost.size} / {totalReq}枚
                    {costItems.map((c, i) => (
                      <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                    ))}
                  </p>
                  <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {my.energy.length === 0 ? (
                      <p style={{ color: C.textFaint, fontSize: 12, margin: '8px 0' }}>エナがありません</p>
                    ) : my.energy.map((num, i) => {
                      const card = battleCardMap.get(num);
                      const isSel = selectedGrowCost.has(i);
                      const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                      return (
                        <div key={i} onClick={() => toggleGrowCostCard(i)}
                          style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                            overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                            border: isSel ? C.borderMulliganSel : isWild ? '1px solid #ffcc00' : C.borderCard }}>
                          {card ? (
                            <img src={card.ImgURL} alt={card.CardName} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 8, color: C.textFaint }}>{num}</span>
                            </div>
                          )}
                          {isWild && !isSel && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                              backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}>
                              <span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span>
                            </div>
                          )}
                          {isSel && (
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.45)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>✓</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => executeGrow(pendingGrowCard, selectedGrowCost)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? C.success : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    グロウ実行
                  </button>
                </>
              );
            })()}

          </div>
        </div>,
        document.body,
      )}

      {/* アーツ使用モーダル */}
      {showArtsModal && createPortal(
        <div onClick={() => { setShowArtsModal(false); setPendingArtsCard(null); setSelectedArtsCost(new Set()); setIsBetting(false); setIsEncore(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>

            {!pendingArtsCard ? (
              /* Phase 1: アーツ選択 */
              <>
                <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  アーツを選択
                </p>
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {artsCandidates.map(card => {
                    const extraArtsCosts = activeCostMods.forMy
                      .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                      .flatMap(m => m.amount);
                    const canAfford = canAffordWithExtraCost(my.energy, battleCards, card.Cost, extraArtsCosts, my.keyword_grants, myEnaAllMulti);
                    const totalReq = parseGrowCost(card.Cost).reduce((s, c) => s + c.count, 0);
                    const betCostAmt = parseBetCost(card.EffectText ?? '');
                    return (
                      <button key={card.CardNum}
                        onClick={() => {
                          if (!canAfford) return;
                          setIsBetting(false);
                          if (totalReq === 0) { executeArts(card, new Set()); }
                          else { setPendingArtsCard(card); setSelectedArtsCost(new Set()); }
                        }}
                        disabled={loading || !canAfford}
                        style={{ display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                          backgroundColor: canAfford ? C.bgButton : C.bgButtonDark,
                          cursor: (loading || !canAfford) ? 'default' : 'pointer',
                          opacity: canAfford ? 1 : 0.5, textAlign: 'left' }}>
                        <img src={card.ImgURL} alt={card.CardName}
                          style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                        <div>
                          <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>
                            {card.CardName}
                          </p>
                          <p style={{ color: C.textDim, fontSize: 11, margin: '0 0 2px' }}>
                            コスト: {card.Cost || 'なし'}
                          </p>
                          <p style={{ color: C.textFaint, fontSize: 10, margin: 0 }}>
                            {card.Timing}
                          </p>
                          {betCostAmt > 0 && (
                            <p style={{ color: C.coin, fontSize: 10, margin: '2px 0 0' }}>
                              ベット: コイン{betCostAmt}枚
                            </p>
                          )}
                          {(() => {
                            const encoreCost = parseEncoreCost(card.EffectText ?? '');
                            if (!encoreCost) return null;
                            const encoreEnaStr = encoreCost.energy.map(e => `《${e.color}》${e.count > 1 ? `×${e.count}` : ''}`).join('');
                            const encoreCoinStr = encoreCost.coins > 0 ? ` コイン${encoreCost.coins}枚` : '';
                            return (
                              <p style={{ color: '#88ddff', fontSize: 10, margin: '2px 0 0' }}>
                                アンコール: {encoreEnaStr}{encoreCoinStr}
                              </p>
                            );
                          })()}
                          {!canAfford && (
                            <p style={{ color: C.danger, fontSize: 10, margin: '2px 0 0' }}>エナ不足</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { setShowArtsModal(false); setPendingArtsCard(null); setSelectedArtsCost(new Set()); setIsBetting(false); }}
                  style={{ padding: '8px 0', borderRadius: 8, border: C.borderUI,
                    backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13 }}>
                  キャンセル
                </button>
              </>
            ) : (() => {
              /* Phase 2: コスト支払いカード選択 */
              const costItems = parseGrowCost(pendingArtsCard.Cost);
              const encoreCostForCard = parseEncoreCost(pendingArtsCard.EffectText ?? '');
              const encoreExtraEna: { color: string; count: number }[] = encoreCostForCard?.energy ?? [];
              const encoreExtraCostItems = encoreExtraEna.flatMap(e => Array(e.count).fill({ color: e.color, count: 1 }));
              const totalReq = costItems.reduce((s, c) => s + c.count, 0) +
                (isEncore ? encoreExtraEna.reduce((s, e) => s + e.count, 0) : 0);
              const selectedNums = [...selectedArtsCost].map(i => my.energy[i]);
              const extraArtsCosts = activeCostMods.forMy
                .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                .flatMap(m => m.amount);
              const combinedCostStr = isEncore && encoreCostForCard
                ? (pendingArtsCard.Cost ? pendingArtsCard.Cost + '+encore' : 'encore')
                : pendingArtsCard.Cost;
              const isValid = selectedArtsCost.size === totalReq &&
                canAffordWithExtraCost(selectedNums, battleCards, pendingArtsCard.Cost, extraArtsCosts, my.keyword_grants, myEnaAllMulti) &&
                (!isEncore || encoreExtraEna.every(req =>
                  selectedNums.filter(n => {
                    const c = battleCardMap.get(n);
                    return c?.Color === req.color || isMultiEna(n, battleCards, my.keyword_grants, myEnaAllMulti);
                  }).length >= req.count
                ));
              const betCostForCard = parseBetCost(pendingArtsCard.EffectText ?? '');
              const canBet = betCostForCard > 0 && my.coins >= betCostForCard;
              const canEncore = !!encoreCostForCard && (encoreCostForCard.coins === 0 || my.coins >= encoreCostForCard.coins);
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingArtsCard(null); setSelectedArtsCost(new Set()); setIsBetting(false); setIsEncore(false); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← 戻る
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      コストを選択
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={pendingArtsCard.ImgURL} alt={pendingArtsCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>
                        {pendingArtsCard.CardName}
                      </p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                        コスト: {pendingArtsCard.Cost}
                      </p>
                    </div>
                  </div>
                  {betCostForCard > 0 && (
                    <button
                      onClick={() => { if (canBet || isBetting) setIsBetting(b => !b); }}
                      disabled={!canBet && !isBetting}
                      style={{ padding: '8px 12px', borderRadius: 8,
                        border: isBetting ? `2px solid ${C.coin}` : C.borderUI,
                        backgroundColor: isBetting ? 'rgba(204,136,0,0.15)' : C.bgButton,
                        color: isBetting ? C.coin : (canBet ? C.text : C.textFaint),
                        cursor: (canBet || isBetting) ? 'pointer' : 'default',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>ベット（コイン{betCostForCard}枚追加消費）</span>
                      <span style={{ fontSize: 11, color: canBet ? C.coin : C.danger }}>
                        {isBetting ? 'ON' : 'OFF'} / 所持: {my.coins}枚
                      </span>
                    </button>
                  )}
                  {encoreCostForCard && (
                    <button
                      onClick={() => { if (canEncore || isEncore) setIsEncore(b => !b); }}
                      disabled={!canEncore && !isEncore}
                      style={{ padding: '8px 12px', borderRadius: 8,
                        border: isEncore ? '2px solid #88ddff' : C.borderUI,
                        backgroundColor: isEncore ? 'rgba(0,100,180,0.15)' : C.bgButton,
                        color: isEncore ? '#88ddff' : (canEncore ? C.text : C.textFaint),
                        cursor: (canEncore || isEncore) ? 'pointer' : 'default',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>アンコール（ルリグデッキに戻す）</span>
                      <span style={{ fontSize: 11 }}>
                        {isEncore ? 'ON' : 'OFF'}
                        {encoreCostForCard.coins > 0 && ` / コイン${encoreCostForCard.coins}枚`}
                      </span>
                    </button>
                  )}
                  <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                    エナから選択: {selectedArtsCost.size} / {totalReq}枚
                    {costItems.map((c, i) => (
                      <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                    ))}
                    {isEncore && encoreExtraEna.map((e, i) => (
                      <span key={`enc${i}`} style={{ marginLeft: 6, color: '#88ddff' }}>+({e.color}×{e.count})</span>
                    ))}
                  </p>
                  <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {my.energy.length === 0 ? (
                      <p style={{ color: C.textFaint, fontSize: 12, margin: '8px 0' }}>エナがありません</p>
                    ) : my.energy.map((num, i) => {
                      const card = battleCardMap.get(num);
                      const isSel = selectedArtsCost.has(i);
                      const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                      return (
                        <div key={i} onClick={() => toggleArtsCostCard(i)}
                          style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                            overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                            border: isSel ? C.borderMulliganSel : isWild ? '1px solid #ffcc00' : C.borderCard }}>
                          {card ? (
                            <img src={card.ImgURL} alt={card.CardName} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 8, color: C.textFaint }}>{num}</span>
                            </div>
                          )}
                          {isWild && !isSel && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                              backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}>
                              <span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span>
                            </div>
                          )}
                          {isSel && (
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.45)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>✓</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => executeArts(pendingArtsCard, selectedArtsCost, isBetting, isEncore)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? (isEncore ? '#3377bb' : C.coin) : C.disabled,
                      color: isValid ? (isEncore ? '#fff' : '#000') : C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    {isEncore ? 'アーツ使用（アンコール）' : isBetting ? 'アーツ使用（ベットあり）' : 'アーツ使用'}
                  </button>
                </>
              );
            })()}

          </div>
        </div>,
        document.body,
      )}

      {/* スペル発動コスト選択 */}
      {pendingSpellCast && createPortal(
        <div onClick={() => { setPendingSpellCast(null); setSelectedSpellCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const spellCard = battleCardMap.get(pendingSpellCast.cardNum);
              if (!spellCard) return null;
              const costItems = parseGrowCost(spellCard.Cost);
              const totalReq = costItems.reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedSpellCost].map(i => my.energy[i]);
              const extraSpellCosts = activeCostMods.forMy
                .filter(m => m.direction === 'increase' && m.targetCardType === 'スペル')
                .flatMap(m => m.amount);
              const isValid = totalReq === 0 ||
                (selectedSpellCost.size === totalReq &&
                  canAffordWithExtraCost(selectedNums, battleCards, spellCard.Cost, extraSpellCosts, my.keyword_grants, myEnaAllMulti));
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingSpellCast(null); setSelectedSpellCost(new Set()); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← キャンセル
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      スペル発動
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={spellCard.ImgURL} alt={spellCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>{spellCard.CardName}</p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>コスト: {spellCard.Cost || 'なし'}</p>
                    </div>
                  </div>
                  {totalReq > 0 && (
                    <>
                      <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        エナから選択: {selectedSpellCost.size} / {totalReq}枚
                        {costItems.map((c, i) => (
                          <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                        ))}
                      </p>
                      <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {my.energy.map((num, i) => {
                          const card = battleCardMap.get(num);
                          const isSel = selectedSpellCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i} onClick={() => toggleSpellCostCard(i)}
                              style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                                overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                                border: isSel ? C.borderMulliganSel : isWild ? '1px solid #ffcc00' : C.borderCard }}>
                              {card
                                ? <img src={card.ImgURL} alt={card.CardName} draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                                : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 8, color: C.textFaint }}>{num}</span>
                                  </div>
                              }
                              {isWild && !isSel && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                  backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}>
                                  <span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.45)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <button onClick={() => castSpell(spellCard, selectedSpellCost, pendingSpellCast.handIndex)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? C.accent : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    発動する
                  </button>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* スペルカットインポップアップ（相手のスペル発動中に表示） */}
      {bs.pending_spell && bs.pending_spell.caster_id !== user.id && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 20 }}>
          <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
            display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const spellCard = battleCardMap.get(bs.pending_spell.card_num);
              if (!pendingCutinCard) {
                return (
                  <>
                    <p style={{ color: C.danger, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                      スペルカットイン
                    </p>
                    <p style={{ color: C.textDim, fontSize: 12, margin: 0, textAlign: 'center' }}>
                      相手がスペルを発動しました
                    </p>
                    {spellCard && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                        backgroundColor: C.bgButton }}>
                        <img src={spellCard.ImgURL} alt={spellCard.CardName}
                          style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                        <div>
                          <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>{spellCard.CardName}</p>
                          <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>{spellCard.Timing}</p>
                        </div>
                      </div>
                    )}
                    {cutinCandidates.length > 0 && (
                      <>
                        <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>カットインカード:</p>
                        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {cutinCandidates.map(card => {
                            const extraArtsCosts = activeCostMods.forMy
                              .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                              .flatMap(m => m.amount);
                            const canAfford = canAffordWithExtraCost(my.energy, battleCards, card.Cost, extraArtsCosts, my.keyword_grants, myEnaAllMulti);
                            return (
                              <button key={card.CardNum}
                                onClick={() => { if (canAfford) { setPendingCutinCard(card); setSelectedCutinCost(new Set()); } }}
                                disabled={loading || !canAfford}
                                style={{ display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                                  backgroundColor: canAfford ? C.bgButton : C.bgButtonDark,
                                  cursor: (loading || !canAfford) ? 'default' : 'pointer',
                                  opacity: canAfford ? 1 : 0.5, textAlign: 'left' }}>
                                <img src={card.ImgURL} alt={card.CardName}
                                  style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                                <div>
                                  <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>{card.CardName}</p>
                                  <p style={{ color: C.textDim, fontSize: 11, margin: '0 0 2px' }}>コスト: {card.Cost || 'なし'}</p>
                                  {!canAfford && <p style={{ color: C.danger, fontSize: 10, margin: 0 }}>エナ不足</p>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <button onClick={handleCutinPass} disabled={loading}
                      style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                        backgroundColor: loading ? C.disabled : C.bgButton,
                        color: C.text, fontSize: 14, fontWeight: 'bold',
                        cursor: loading ? 'default' : 'pointer' }}>
                      {loading ? '処理中...' : 'パス（カットインしない）'}
                    </button>
                  </>
                );
              }
              /* カットインのコスト選択 */
              const costItems = parseGrowCost(pendingCutinCard.Cost);
              const totalReq = costItems.reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedCutinCost].map(i => my.energy[i]);
              const extraArtsCosts = activeCostMods.forMy
                .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                .flatMap(m => m.amount);
              const isValid = totalReq === 0 ||
                (selectedCutinCost.size === totalReq &&
                  canAffordWithExtraCost(selectedNums, battleCards, pendingCutinCard.Cost, extraArtsCosts, my.keyword_grants, myEnaAllMulti));
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingCutinCard(null); setSelectedCutinCost(new Set()); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← 戻る
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>カットインコスト選択</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={pendingCutinCard.ImgURL} alt={pendingCutinCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>{pendingCutinCard.CardName}</p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>コスト: {pendingCutinCard.Cost || 'なし'}</p>
                    </div>
                  </div>
                  {totalReq > 0 && (
                    <>
                      <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        エナから選択: {selectedCutinCost.size} / {totalReq}枚
                        {costItems.map((c, i) => (
                          <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                        ))}
                      </p>
                      <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {my.energy.map((num, i) => {
                          const card = battleCardMap.get(num);
                          const isSel = selectedCutinCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i} onClick={() => toggleCutinCostCard(i)}
                              style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                                overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                                border: isSel ? C.borderMulliganSel : isWild ? '1px solid #ffcc00' : C.borderCard }}>
                              {card
                                ? <img src={card.ImgURL} alt={card.CardName} draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                                : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 8, color: C.textFaint }}>{num}</span>
                                  </div>
                              }
                              {isWild && !isSel && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                  backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}>
                                  <span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.45)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <button onClick={() => handleCutinUse(pendingCutinCard, selectedCutinCost)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? C.danger : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    カットイン使用
                  </button>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* スペル発動待機中（発動側） */}
      {bs.pending_spell && bs.pending_spell.caster_id === user.id && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 3200,
          backgroundColor: 'rgba(0,0,0,0.70)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '28px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(() => {
              const spellCard = battleCardMap.get(bs.pending_spell.card_num);
              return (
                <>
                  {spellCard && (
                    <img src={spellCard.ImgURL} alt={spellCard.CardName}
                      style={{ width: 60, height: 84, objectFit: 'cover', borderRadius: 6, margin: '0 auto' }}
                      onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                  )}
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                    {spellCard?.CardName ?? 'スペル'} 発動中
                  </p>
                  <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
                    相手のカットイン応答を待っています...
                  </p>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* エナチャージスキップ確認 */}
      {showEnergySkipConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 320px)', textAlign: 'center',
          }}>
            <p style={{ color: C.text, fontSize: 15, fontWeight: 'bold', margin: '0 0 8px' }}>
              エナチャージを行いますか？
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 20px' }}>
              エナチャージを行わずグロウフェイズへ進みます
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowEnergySkipConfirm(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                戻る
              </button>
              <button onClick={() => { setShowEnergySkipConfirm(false); doPhaseAdvance(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: C.accent,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                このまま進む
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showGrowSkipConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)', textAlign: 'center',
          }}>
            <p style={{ color: C.accent, fontSize: 15, fontWeight: 'bold', margin: '0 0 6px' }}>
              グロウ可能なルリグがいます
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 12px' }}>
              {growCandidates
                .filter(c => canAffordGrowCost(my.energy, battleCards, c.GrowCost, my.keyword_grants, myEnaAllMulti))
                .map(c => c.CardName)
                .join('・')}
            </p>
            <p style={{ color: C.textDim, fontSize: 12, margin: '0 0 20px' }}>
              グロウせずにメインフェイズへ進みますか？
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowGrowSkipConfirm(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                戻る
              </button>
              <button onClick={() => { setShowGrowSkipConfirm(false); doPhaseAdvance(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: C.accent,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                このまま進む
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ライフバースト確認（自分のチェックゾーンにカードがある場合） */}
      {my.field.check && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4500,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 320px)',
            display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
          }}>
            {(() => {
              const checkCard = battleCardMap.get(my.field.check!);
              const hasBurst = checkCard?.LifeBurst === '1';
              return (
                <>
                  <p style={{ color: C.life, fontSize: 15, fontWeight: 'bold', margin: 0 }}>
                    ライフクロスクラッシュ
                  </p>
                  {checkCard ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <img src={checkCard.ImgURL} alt={checkCard.CardName}
                        onClick={() => setBurstCardZoomed(true)}
                        style={{ width: 80, height: 112, objectFit: 'cover', borderRadius: 6,
                          boxShadow: hasBurst ? `0 0 14px ${C.accent}` : 'none',
                          cursor: 'pointer' }}
                        onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                      <p style={{ color: C.textSub, fontSize: 13, fontWeight: 'bold', margin: 0 }}>
                        {checkCard.CardName}
                      </p>
                    </div>
                  ) : (
                    <div style={{ width: 80, height: 112, backgroundColor: C.bgButton,
                      borderRadius: 6, margin: '0 auto' }} />
                  )}
                  {hasBurst ? (
                    <>
                      <p style={{ color: C.accent, fontSize: 13, fontWeight: 'bold', margin: 0 }}>
                        ライフバーストあり
                      </p>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => handleLifeBurstResponse(true)}
                          disabled={loading}
                          style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: 'none',
                            backgroundColor: loading ? C.disabled : C.accent,
                            color: C.text, fontSize: 13, fontWeight: 'bold',
                            cursor: loading ? 'default' : 'pointer' }}>
                          ライフバースト発動
                        </button>
                        <button onClick={() => handleLifeBurstResponse(false)}
                          disabled={loading}
                          style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: C.borderUI,
                            backgroundColor: 'transparent',
                            color: C.textDim, fontSize: 13,
                            cursor: loading ? 'default' : 'pointer' }}>
                          スキップ
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p style={{ color: C.textFaint, fontSize: 12, margin: 0 }}>
                        ライフバーストなし
                      </p>
                      <button onClick={() => handleLifeBurstResponse(false)}
                        disabled={loading}
                        style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                          backgroundColor: loading ? C.disabled : C.bgButton,
                          color: C.text, fontSize: 13, fontWeight: 'bold',
                          cursor: loading ? 'default' : 'pointer' }}>
                        エナへ送る
                      </button>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ライフクロスクラッシュ カード拡大 */}
      {burstCardZoomed && my.field.check && (() => {
        const zCard = battleCardMap.get(my.field.check);
        if (!zCard) return null;
        return createPortal(
          <div
            onClick={() => setBurstCardZoomed(false)}
            onTouchEnd={e => { e.preventDefault(); setBurstCardZoomed(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 5000,
              backgroundColor: 'rgba(0,0,0,0.85)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <img src={zCard.ImgURL} alt={zCard.CardName} draggable={false}
              style={{ maxWidth: '80vw', maxHeight: '70vh', borderRadius: 10, objectFit: 'contain' }}
              onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
            <span style={{ color: C.textFaint, fontSize: 12 }}>タップで閉じる</span>
          </div>,
          document.body,
        );
      })()}

      {/* 相手のライフクロスクラッシュ確認（攻撃側・読み取り専用） */}
      {!my.field.check && op.field.check && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4400,
          backgroundColor: 'rgba(0,0,0,0.80)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 320px)',
            display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
          }}>
            {(() => {
              const checkCard = battleCardMap.get(op.field.check!);
              const hasBurst = checkCard?.LifeBurst === '1';
              return (
                <>
                  <p style={{ color: C.life, fontSize: 15, fontWeight: 'bold', margin: 0 }}>
                    相手のライフクロスクラッシュ
                  </p>
                  {checkCard ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <img src={checkCard.ImgURL} alt={checkCard.CardName}
                        style={{ width: 80, height: 112, objectFit: 'cover', borderRadius: 6,
                          boxShadow: hasBurst ? `0 0 14px ${C.accent}` : 'none' }}
                        onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                      <p style={{ color: C.textSub, fontSize: 13, fontWeight: 'bold', margin: 0 }}>
                        {checkCard.CardName}
                      </p>
                    </div>
                  ) : (
                    <div style={{ width: 80, height: 112, backgroundColor: C.bgButton, borderRadius: 6, margin: '0 auto' }} />
                  )}
                  <p style={{ color: hasBurst ? C.accent : C.textFaint, fontSize: 13, fontWeight: 'bold', margin: 0 }}>
                    {hasBurst ? 'ライフバーストあり' : 'ライフバーストなし'}
                  </p>
                  <p style={{ color: C.textGhost, fontSize: 11, margin: 0 }}>
                    相手の応答を待っています…
                  </p>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ガード応答ダイアログ（自分が攻撃されたとき） */}
      {my.field.lrig_attacked && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4500,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)',
            display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
          }}>
            <p style={{ color: C.danger, fontSize: 15, fontWeight: 'bold', margin: 0 }}>
              ルリグに攻撃された！
            </p>
            <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
              手札の「ガード」を持つカードをトラッシュに送り攻撃を防ぐか、ライフクロスをクラッシュします
            </p>
            {(() => {
              const guardBlockedMax = [...(my.blocked_actions ?? []), ...contBlocked.forSelf]
                .reduce((max, a) => {
                  const m = a.match(/^GUARD_MAX_LV(\d+)/);
                  return m ? Math.max(max, parseInt(m[1])) : max;
                }, -1);
              const guardCards = my.hand
                .map((num, i) => ({ num, i, card: battleCardMap.get(num) }))
                .filter(({ card }) => {
                  if (card?.Guard !== '1') return false;
                  if (guardBlockedMax >= 0 && parseInt(card.Level ?? '-1') <= guardBlockedMax) return false;
                  return true;
                });
              return guardCards.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: '40vh' }}>
                  {guardCards.map(({ num, i, card }) => (
                    <button key={i} onClick={() => handleGuardResponse(i)}
                      disabled={loading}
                      style={{ display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                        backgroundColor: loading ? C.disabled : C.bgButton,
                        cursor: loading ? 'default' : 'pointer', textAlign: 'left' }}>
                      {card && (
                        <img src={card.ImgURL} alt={card.CardName}
                          style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                      )}
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>
                          {card?.CardName ?? num}
                        </p>
                        <p style={{ color: C.accent, fontSize: 11, margin: 0 }}>ガードに使う（トラッシュへ）</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ color: C.textFaint, fontSize: 12, margin: 0 }}>
                  使用できるガードカードが手札にありません
                </p>
              );
            })()}
            <button onClick={() => handleGuardResponse(null)}
              disabled={loading}
              style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                backgroundColor: loading ? C.disabled : C.danger,
                color: C.text, fontSize: 14, fontWeight: 'bold',
                cursor: loading ? 'default' : 'pointer' }}>
              ガードしない（ライフクロスクラッシュ）
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* リムーブ選択モーダル */}
      {showRemoveModal && createPortal(
        <div onClick={() => setShowRemoveModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '24px 20px', width: 'min(88vw, 320px)', textAlign: 'center',
              display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0 }}>リムーブ</p>
            <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
              トラッシュに送るゾーンを選択（レゾナ不可）
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {([0, 1, 2] as const).map(zi => {
                const stack = my.field.signi[zi] ?? [];
                const topCardNum = stack[stack.length - 1] ?? null;
                const topCard = topCardNum ? battleCardMap.get(topCardNum) : null;
                const isEmpty = stack.length === 0;
                const isResona = topCard?.Type === 'レゾナ';
                const isDisabled = isEmpty || isResona;
                const isSel = selectedRemoveZones.has(zi);
                return (
                  <button key={zi}
                    onClick={() => { if (!isDisabled) toggleRemoveZone(zi); }}
                    disabled={isDisabled}
                    style={{
                      flex: 1, padding: '10px 4px', borderRadius: 8,
                      border: isSel ? `2px solid ${C.danger}` : isDisabled ? `1px solid #333` : C.borderUI,
                      backgroundColor: isSel ? 'rgba(244,67,54,0.2)' : isDisabled ? C.bgCardEmpty : C.bgButton,
                      color: isDisabled ? C.textFaint : C.text,
                      fontSize: 12, cursor: isDisabled ? 'default' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    }}>
                    {topCard ? (
                      <img src={topCard.ImgURL} alt={topCard.CardName}
                        style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4 }}
                        onError={e => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
                    ) : (
                      <div style={{ width: 44, height: 62, backgroundColor: C.bgCardEmpty,
                        borderRadius: 4, border: C.borderEmpty }} />
                    )}
                    <span>ゾーン{zi + 1}</span>
                    {isResona && <span style={{ fontSize: 10, color: C.danger }}>レゾナ</span>}
                    {isEmpty  && <span style={{ fontSize: 10, color: C.textFaint }}>空</span>}
                  </button>
                );
              })}
            </div>
            <button onClick={handleRemove}
              disabled={loading || selectedRemoveZones.size === 0}
              style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                backgroundColor: selectedRemoveZones.size > 0 ? '#8b4513' : C.disabled,
                color: C.text, fontSize: 14, fontWeight: 'bold',
                cursor: (loading || selectedRemoveZones.size === 0) ? 'default' : 'pointer' }}>
              {selectedRemoveZones.size > 0 ? `${selectedRemoveZones.size}枚をトラッシュへ` : 'ゾーンを選択してください'}
            </button>
            <button onClick={() => setShowRemoveModal(false)}
              style={{ padding: '8px 0', borderRadius: 8, border: C.borderUI,
                backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13 }}>
              キャンセル
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* シグニ召喚ゾーン選択 */}
      {pendingSigniSummon && createPortal(
        <div onClick={() => setPendingSigniSummon(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '24px 20px', width: 'min(80vw, 300px)', textAlign: 'center',
            }}>
            <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: '0 0 4px' }}>
              召喚先のゾーンを選択
            </p>
            {(() => {
              const summonCard = battleCardMap.get(pendingSigniSummon.cardNum);
              const signiLevel = parseInt(summonCard?.Level ?? '0') || 0;
              return (
                <p style={{ color: C.textDim, fontSize: 12, margin: '0 0 14px' }}>
                  Lv.{signiLevel}　リミット: {fieldSigniTotal}/{lrigLimit}
                </p>
              );
            })()}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {([0, 1, 2] as const).map(zi => {
                const summonCard = battleCardMap.get(pendingSigniSummon.cardNum);
                const signiLevel = parseInt(summonCard?.Level ?? '0') || 0;
                const isOccupied = (my.field.signi[zi] ?? []).length > 0;
                const afterTotal = fieldSigniTotal + signiLevel;
                const overLimit = afterTotal > lrigLimit;
                const isDisabled = loading || overLimit || isOccupied;
                return (
                  <button key={zi}
                    onClick={() => !isDisabled && handleSummonSigni(pendingSigniSummon.handIndex, zi)}
                    disabled={isDisabled}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 8,
                      border: isOccupied ? `1px solid ${C.textFaint}` : overLimit ? `1px solid ${C.danger}` : C.borderUI,
                      backgroundColor: isDisabled ? C.disabled : C.bgButton,
                      color: isDisabled ? C.textFaint : C.text,
                      fontSize: 13, cursor: isDisabled ? 'default' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}>
                    <span>ゾーン{zi + 1}{isOccupied ? ' (使用中)' : ''}</span>
                    <span style={{ fontSize: 11, color: isOccupied ? C.textFaint : overLimit ? C.danger : C.textDim }}>
                      {isOccupied ? '—' : overLimit ? 'リミット超過' : `${afterTotal}/${lrigLimit}`}
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setPendingSigniSummon(null)}
              style={{
                marginTop: 12, padding: '8px 20px', borderRadius: 8, border: C.borderUI,
                backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13,
              }}>
              キャンセル
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* 強制攻撃バナー */}
      {isMyTurn && my.must_attack_signi && bs.turn_phase === 'ATTACK_SIGNI' && (
        <div style={{ flexShrink: 0, backgroundColor: '#7a1a1a', padding: '4px 12px',
          fontSize: 11, color: '#ffaaaa', textAlign: 'center' }}>
          ⚠ あなたのシグニは可能ならばアタックしなければなりません
        </div>
      )}
      {!isMyTurn && op.must_attack_signi && bs.turn_phase === 'ATTACK_SIGNI' && (
        <div style={{ flexShrink: 0, backgroundColor: '#1a3a1a', padding: '4px 12px',
          fontSize: 11, color: '#aaffaa', textAlign: 'center' }}>
          対戦相手のシグニは可能ならばアタックしなければなりません
        </div>
      )}

      {/* ステータスバー */}
      <div style={{
        flexShrink: 0, backgroundColor: C.bgBar, borderBottom: C.borderBar,
        padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <span style={{ color: C.textMuted, fontWeight: 'bold', fontSize: 13 }}>T{bs.turn_count}</span>
        <span style={{ color: isMyTurn ? C.accent : C.textDim, fontSize: 12, fontWeight: 'bold' }}>
          {PHASE_LABEL[bs.turn_phase] ?? bs.turn_phase}
        </span>

        {/* GROWフェイズのグロウボタン */}
        {isMyTurn && bs.turn_phase === 'GROW' && (() => {
          const used    = my.actions_done?.includes('GROW') ?? false;
          const blocked = my.blocked_actions?.includes('GROW') ?? false;
          if (used || blocked || growCandidates.length === 0) return null;
          return (
            <button onClick={() => setShowGrowModal(true)} disabled={loading}
              style={{ padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 'bold',
                backgroundColor: C.success, color: C.text, cursor: loading ? 'default' : 'pointer' }}>
              グロウ
            </button>
          );
        })()}

        {iControlThisPhase ? (
          bs.turn_phase === 'ATTACK_LRIG' && op.field.lrig_attacked ? (
            <span style={{ fontSize: 11, color: C.textDim }}>ガード応答待ち...</span>
          ) : (
          <button
            onClick={handlePhaseAdvance}
            disabled={!!(bs.effect_stack || bs.pending_effect || loading)}
            style={{
              padding: '5px 16px', borderRadius: 5, border: 'none',
              backgroundColor: bs.turn_phase === 'END' ? C.dangerDark : C.accent,
              color: C.text, fontSize: 12, fontWeight: 'bold',
              cursor: 'pointer',
              visibility: (bs.effect_stack || bs.pending_effect || loading) ? 'hidden' : 'visible',
            }}
          >
            {PHASE_BTN[bs.turn_phase]}
          </button>
          )
        ) : (
          <span style={{ fontSize: 11, color: C.textDim }}>
            {WAITING_MSG[bs.turn_phase] ?? '相手のターン中...'}
          </span>
        )}

        {/* MAINフェイズのリムーブボタン */}
        {isMyTurn && bs.turn_phase === 'MAIN' && !(my.actions_done?.includes('REMOVE') ?? false) && (
          <button onClick={() => { setShowRemoveModal(true); setSelectedRemoveZones(new Set()); }}
            disabled={loading}
            style={{ padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 'bold',
              backgroundColor: '#8b4513', color: C.text, cursor: loading ? 'default' : 'pointer' }}>
            リムーブ
          </button>
        )}

        <button onClick={() => setShowEndConfirm(true)} style={{
          marginLeft: 'auto', padding: '3px 10px', borderRadius: 4,
          border: C.borderBarBtn, backgroundColor: 'transparent', color: C.textVeryFaint, cursor: 'pointer', fontSize: 11,
        }}>終了</button>
      </div>

      {/* 盤面エリア */}
      <div style={{ flex: 1, overflow: 'hidden', padding: 4, display: 'flex', flexDirection: 'column', gap: 3, boxSizing: 'border-box' }}>

        {/* バトルログ */}
        {battleLogs.length > 0 && (
          <div
            ref={logScrollRef}
            onClick={() => setLogExpanded(v => !v)}
            style={{
              flexShrink: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRadius: 5,
              padding: '3px 8px',
              cursor: 'pointer',
              overflow: 'hidden',
              maxHeight: logExpanded ? 200 : 38,
              overflowY: logExpanded ? 'auto' : 'hidden',
              border: '1px solid rgba(255,255,255,0.09)',
              transition: 'max-height 0.2s ease',
              position: 'relative',
            }}
          >
            {[...battleLogs].reverse().slice(0, logExpanded ? 60 : 2).map((log, i) => {
              const text = log.user_id !== user.id
                ? log.action.replace(/あなた/g, '\x00').replace(/相手/g, 'あなた').replace(/\x00/g, '相手')
                : log.action;
              return (
                <div key={i} style={{ fontSize: 10, color: i === 0 ? '#b8d4d4' : '#7a9a9a', lineHeight: '1.6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {text}
                </div>
              );
            })}
            <div style={{
              position: 'absolute', right: 6, top: '50%', transform: logExpanded ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
              fontSize: 8, color: 'rgba(255,255,255,0.3)', pointerEvents: 'none', transition: 'transform 0.2s',
            }}>▼</div>
          </div>
        )}

        {/* 相手盤面 */}
        <div style={{ border: C.borderPanel, borderRadius: 6, padding: '4px 6px', backgroundColor: C.bgOpponent }}>
          <HandCards cardNums={op.hand} cards={battleCards} faceDown />
          <PlayerField state={op} cards={battleCards} isMe={false} effectivePowers={effectivePowers} />
        </div>

        {/* 中央区切り */}
        <div style={{ height: 2, flexShrink: 0, background: 'linear-gradient(to right, transparent, #007bff33, transparent)' }} />

        {/* 自分の盤面 */}
        <div style={{ border: C.borderSelf, borderRadius: 6, padding: '4px 6px', backgroundColor: C.bgSelf }}>
          <PlayerField state={my} cards={battleCards} isMe={true} getSigniZoneActions={getMySigniZoneActions} getLrigDeckCardActions={getMyLrigDeckCardActions} getLrigFieldActions={getMyLrigFieldActions} getKeyPieceActions={getKeyPieceActions} getAssistLActions={() => getAssistActions('l')} getAssistRActions={() => getAssistActions('r')} getFreeZoneActions={getMyFreeZoneActions} closeZoneSignal={closeZoneSignal} effectivePowers={effectivePowers} />
          <HandCards cardNums={my.hand} cards={battleCards} getCardActions={getMyHandCardActions} />
        </div>
      </div>

      {/* ===== キーピース 使用モーダル ===== */}
      {showKeyModal && pendingKeyCard && createPortal(
        <div onClick={() => { setShowKeyModal(false); setPendingKeyCard(null); setSelectedKeyCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = pendingKeyCard;
              const coinNeeded = parseCoinCost(card.Cost) + parseCoinCost(card.GrowCost);
              const energyTotal = parseGrowCost(card.Cost).reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedKeyCost].map(i => my.energy[i]);
              const energyOk = energyTotal === 0 || (selectedKeyCost.size === energyTotal && canAffordGrowCost(selectedNums, battleCards, card.Cost, my.keyword_grants, myEnaAllMulti));
              const canAfford = energyOk && my.coins >= coinNeeded;
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    キーにセット
                  </p>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <img src={card.ImgURL} alt={card.CardName}
                      style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                      <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                        コスト: {[coinNeeded > 0 ? `コイン${coinNeeded}個` : null, energyTotal > 0 ? `エナ${energyTotal}枚` : null].filter(Boolean).join('・') || 'なし'}
                      </p>
                      {coinNeeded > 0 && <p style={{ color: my.coins >= coinNeeded ? C.coin : C.danger, fontSize: 11, margin: '2px 0 0' }}>手持ちコイン: {my.coins}</p>}
                    </div>
                  </div>
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>エナゾーンから選択: {selectedKeyCost.size} / {energyTotal}枚</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedKeyCost.has(i);
                          return (
                            <div key={i} onClick={() => setSelectedKeyCost(prev => { const next = new Set(prev); if (next.has(i)) { next.delete(i); return next; } if (next.size >= energyTotal) return prev; next.add(i); return next; })}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setShowKeyModal(false); setPendingKeyCard(null); setSelectedKeyCost(new Set()); }} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button onClick={() => executeKeyPiece(card, selectedKeyCost)} disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : '#cc8800',
                        color: C.text, fontSize: 14, fontWeight: 'bold', cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      セット
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== キーピース 起動効果モーダル ===== */}
      {pendingKeyActivated && createPortal(
        <div onClick={() => { setPendingKeyActivated(null); setSelectedKeyActivatedCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = battleCardMap.get(pendingKeyActivated.cardNum);
              const eff = pendingKeyActivated.effect;
              const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const costStr = (eff.cost?.energy ?? []).map(e => `${e.color}${e.count}`).join('') || '';
              const selectedNums = [...selectedKeyActivatedCost].map(i => my.energy[i]);
              const canAfford = energyTotal === 0 || (selectedKeyActivatedCost.size === energyTotal && canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti));
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>キー【起】効果を発動</p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName} style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>コスト: {energyTotal > 0 ? `エナ${energyTotal}枚` : 'なし'}</p>
                      </div>
                    </div>
                  )}
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>エナゾーンから選択: {selectedKeyActivatedCost.size} / {energyTotal}枚</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedKeyActivatedCost.has(i);
                          return (
                            <div key={i} onClick={() => setSelectedKeyActivatedCost(prev => { const next = new Set(prev); if (next.has(i)) { next.delete(i); return next; } if (next.size >= energyTotal) return prev; next.add(i); return next; })}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setPendingKeyActivated(null); setSelectedKeyActivatedCost(new Set()); }} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button onClick={() => executeKeyActivated(pendingKeyActivated.cardNum, eff, selectedKeyActivatedCost)} disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : C.success,
                        color: C.text, fontSize: 14, fontWeight: 'bold', cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      発動
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== アシストルリグ グロウモーダル ===== */}
      {showAssistGrowModal && pendingAssistGrowCard && pendingAssistSide && createPortal(
        <div onClick={() => { setShowAssistGrowModal(false); setPendingAssistGrowCard(null); setPendingAssistSide(null); setSelectedAssistGrowCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = pendingAssistGrowCard;
              const side = pendingAssistSide;
              const growCost = card.GrowCost;
              const energyTotal = parseGrowCost(growCost).reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedAssistGrowCost].map(i => my.energy[i]);
              const canAfford = energyTotal === 0
                ? true
                : selectedAssistGrowCost.size === energyTotal && canAffordGrowCost(selectedNums, battleCards, growCost, my.keyword_grants, myEnaAllMulti);
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    アシストグロウ（{side === 'l' ? '左' : '右'}）
                  </p>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <img src={card.ImgURL} alt={card.CardName} style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                      <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>Lv.{card.Level} / グロウコスト: {growCost || 'なし'}</p>
                    </div>
                  </div>
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>エナゾーンから選択: {selectedAssistGrowCost.size} / {energyTotal}枚</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedAssistGrowCost.has(i);
                          return (
                            <div key={i} onClick={() => setSelectedAssistGrowCost(prev => { const next = new Set(prev); if (next.has(i)) { next.delete(i); return next; } if (next.size >= energyTotal) return prev; next.add(i); return next; })}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setShowAssistGrowModal(false); setPendingAssistGrowCard(null); setPendingAssistSide(null); setSelectedAssistGrowCost(new Set()); }} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button onClick={() => executeAssistGrow(card, side, selectedAssistGrowCost)} disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : '#6644aa',
                        color: C.text, fontSize: 14, fontWeight: 'bold', cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      グロウ
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== アシストルリグ 起動効果モーダル ===== */}
      {pendingAssistActivated && createPortal(
        <div onClick={() => { setPendingAssistActivated(null); setSelectedAssistActivatedCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = battleCardMap.get(pendingAssistActivated.cardNum);
              const eff = pendingAssistActivated.effect;
              const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const costStr = (eff.cost?.energy ?? []).map(e => `${e.color}${e.count}`).join('') || '';
              const selectedNums = [...selectedAssistActivatedCost].map(i => my.energy[i]);
              const canAfford = energyTotal === 0 || (selectedAssistActivatedCost.size === energyTotal && canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti));
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>アシスト【起】効果を発動</p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName} style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>コスト: {energyTotal > 0 ? `エナ${energyTotal}枚` : 'なし'}</p>
                      </div>
                    </div>
                  )}
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>エナゾーンから選択: {selectedAssistActivatedCost.size} / {energyTotal}枚</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedAssistActivatedCost.has(i);
                          return (
                            <div key={i} onClick={() => setSelectedAssistActivatedCost(prev => { const next = new Set(prev); if (next.has(i)) { next.delete(i); return next; } if (next.size >= energyTotal) return prev; next.add(i); return next; })}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setPendingAssistActivated(null); setSelectedAssistActivatedCost(new Set()); }} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button onClick={() => executeAssistActivated(pendingAssistActivated.cardNum, eff, selectedAssistActivatedCost)} disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : C.success,
                        color: C.text, fontSize: 14, fontWeight: 'bold', cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      発動
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== シグニ起動効果 コスト支払いモーダル ===== */}
      {pendingSigniActivated && createPortal(
        <div
          onClick={() => { setPendingSigniActivated(null); setSelectedSigniActivatedCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* カード情報 */}
            {(() => {
              const card = battleCardMap.get(pendingSigniActivated.cardNum);
              const eff  = pendingSigniActivated.effect;
              const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const costStr = (eff.cost?.energy ?? []).map(e => `${e.color}${e.count}`).join('') || '';
              const selectedNums = [...selectedSigniActivatedCost].map(i => my.energy[i]);
              const canAfford = energyTotal === 0
                ? true
                : selectedSigniActivatedCost.size === energyTotal &&
                  canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti);

              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    【起】効果を発動
                  </p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName}
                        style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                          コスト: {[
                            energyTotal > 0 ? `エナ${energyTotal}枚` : null,
                            eff.cost?.discard ? `手札${eff.cost.discard}枚` : null,
                            eff.cost?.down_self ? 'このシグニをダウン' : null,
                          ].filter(Boolean).join('・') || 'なし'}
                        </p>
                      </div>
                    </div>
                  )}

                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        エナゾーンから選択: {selectedSigniActivatedCost.size} / {energyTotal}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedSigniActivatedCost.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedSigniActivatedCost(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= energyTotal) return prev;
                                next.add(i); return next;
                              })}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setPendingSigniActivated(null); setSelectedSigniActivatedCost(new Set()); }}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button
                      onClick={() => executeSigniActivated(pendingSigniActivated.cardNum, eff, selectedSigniActivatedCost)}
                      disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : C.success,
                        color: C.text, fontSize: 14, fontWeight: 'bold',
                        cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      発動
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== ルリグ付与能力（GRANT_LRIG_ABILITY）発動モーダル ===== */}
      {pendingLrigGranted && createPortal(
        <div
          onClick={() => { setPendingLrigGranted(null); setSelectedLrigGrantedCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const eff = pendingLrigGranted.effect;
              const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const exceedCost = eff.cost?.exceed ?? 0;
              const costStr = (eff.cost?.energy ?? []).map(e => `${e.color}${e.count}`).join('') || '';
              const selectedNums = [...selectedLrigGrantedCost].map(i => my.energy[i]);
              const canAffordEnergy = energyTotal === 0
                ? true
                : selectedLrigGrantedCost.size === energyTotal &&
                  canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti);
              const canAffordExceed = exceedCost === 0 || (my.field.lrig.length - 1) >= exceedCost;
              const canAfford = canAffordEnergy && canAffordExceed;
              const lrigTop = my.field.lrig.at(-1);
              const lrigCard = battleCardMap.get(lrigTop ?? '');

              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    ルリグ付与【起】効果を発動
                  </p>
                  {lrigCard && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={lrigCard.ImgURL} alt={lrigCard.CardName}
                        style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{lrigCard.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                          コスト: {[
                            exceedCost > 0 ? `エクシード${exceedCost}` : null,
                            energyTotal > 0 ? `エナ${energyTotal}枚` : null,
                          ].filter(Boolean).join('・') || 'なし'}
                        </p>
                        {exceedCost > 0 && !canAffordExceed && (
                          <p style={{ color: C.danger, fontSize: 11, margin: '4px 0 0' }}>
                            ルリグスタックが不足しています
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        エナゾーンから選択: {selectedLrigGrantedCost.size} / {energyTotal}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedLrigGrantedCost.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedLrigGrantedCost(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= energyTotal) return prev;
                                next.add(i); return next;
                              })}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setPendingLrigGranted(null); setSelectedLrigGrantedCost(new Set()); }}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button
                      onClick={() => executeLrigGranted(eff, selectedLrigGrantedCost)}
                      disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : C.success,
                        color: C.text, fontSize: 14, fontWeight: 'bold',
                        cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      発動
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== 効果スタック 整列モーダル ===== */}
      {(() => {
        if (!bs.effect_stack || !user) return null;
        const stack = bs.effect_stack;
        const isTurnPlayer = bs.active_user_id === user.id;
        const myPending = isTurnPlayer ? stack.pendingTurn : stack.pendingOpp;
        const needOrder = isTurnPlayer ? !stack.orderTurnDone : !stack.orderOppDone;
        if (!needOrder || myPending.length <= 1) return null;

        const ordered = stackOrderIds
          .map(id => myPending.find(e => e.id === id))
          .filter((e): e is NonNullable<typeof e> => !!e);

        const moveUp = (idx: number) => {
          if (idx === 0) return;
          const next = [...stackOrderIds];
          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
          setStackOrderIds(next);
        };
        const moveDown = (idx: number) => {
          if (idx >= stackOrderIds.length - 1) return;
          const next = [...stackOrderIds];
          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
          setStackOrderIds(next);
        };

        return createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 4100,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                padding: '20px 16px', width: 'min(95vw, 420px)',
                display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                効果の発動順序を決めてください
              </p>
              <p style={{ color: C.text, fontSize: 12, margin: 0, textAlign: 'center' }}>
                ↑↓ ボタンで順序を変更し「確定」を押してください
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ordered.map((entry, idx) => {
                  const card = battleCardMap.get(entry.cardNum);
                  return (
                    <div key={entry.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8,
                        backgroundColor: C.bgButton, borderRadius: 8, padding: '6px 10px' }}>
                      <span style={{ color: C.textFaint, fontSize: 12, minWidth: 20, textAlign: 'center' }}>
                        {idx + 1}
                      </span>
                      {card && (
                        <img src={card.ImgURL} alt={card.CardName} draggable={false}
                          style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                      )}
                      <span style={{ color: C.text, fontSize: 12, flex: 1 }}>{entry.label}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button onClick={() => moveUp(idx)} disabled={idx === 0 || loading}
                          style={{ padding: '2px 8px', borderRadius: 4, border: 'none',
                            backgroundColor: idx === 0 ? C.disabled : C.bgButton,
                            color: C.text, cursor: idx === 0 ? 'default' : 'pointer', fontSize: 12 }}>
                          ↑
                        </button>
                        <button onClick={() => moveDown(idx)} disabled={idx >= ordered.length - 1 || loading}
                          style={{ padding: '2px 8px', borderRadius: 4, border: 'none',
                            backgroundColor: idx >= ordered.length - 1 ? C.disabled : C.bgButton,
                            color: C.text, cursor: idx >= ordered.length - 1 ? 'default' : 'pointer', fontSize: 12 }}>
                          ↓
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => handleConfirmStackOrder(stackOrderIds)}
                disabled={loading}
                style={{ padding: '12px 0', borderRadius: 8, border: 'none',
                  backgroundColor: loading ? C.disabled : C.success,
                  color: C.text, fontSize: 14, fontWeight: 'bold',
                  cursor: loading ? 'default' : 'pointer' }}>
                発動順序を確定
              </button>
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* ===== 効果インタラクション モーダル ===== */}
      {(bs.pending_effect?.respondPlayerId ?? bs.pending_effect?.sourcePlayerId) === user.id && (() => {
        const pe = bs.pending_effect!;
        const inter = pe.interaction;
        const srcCard = battleCardMap.get(pe.sourceCardNum);

        // SELECT_TARGET / SEARCH 共通：カード選択ピッカー
        if (inter.type === 'SELECT_TARGET' || inter.type === 'SEARCH') {
          const candidates = inter.type === 'SELECT_TARGET' ? inter.candidates : inter.visibleCards;
          const maxPick = inter.type === 'SELECT_TARGET' ? inter.count : inter.maxPick;
          const label = inter.type === 'SELECT_TARGET'
            ? `対象を${maxPick}体選んでください`
            : `デッキから${maxPick}枚まで選んでください`;
          const canConfirm = inter.type === 'SELECT_TARGET'
            ? (inter.optional || effectSelectedNums.length >= maxPick)
            : effectSelectedNums.length <= maxPick;

          // フィールド対象の場合: 候補のゾーンインデックス（0→2）を再構築
          // candidates は zone 0→1→2 の順なので、フィールドを同順で走査してマッピングする
          const fieldZoneInfo: number[] = (() => {
            if (inter.type !== 'SELECT_TARGET') return [];
            const scope = inter.targetScope;
            if (scope !== 'opp_field' && scope !== 'self_field') return [];
            const fieldState = scope === 'opp_field' ? op : my;
            const result: number[] = [];
            let ci = 0;
            for (let zi = 0; zi < 3 && ci < candidates.length; zi++) {
              const topNum = fieldState.field.signi[zi]?.at(-1);
              if (!topNum) continue;
              if (candidates[ci] === topNum) { result.push(zi); ci++; }
            }
            return result;
          })();

          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
                  display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <p style={{ color: C.text, fontSize: 13, margin: 0, textAlign: 'center' }}>{label}</p>
                <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {candidates.map((rawId, idx) => {
                    // インスタンスID（CardNum#N）からCardNumを取り出して表示用データを取得
                    const cardNum = getCardNum(rawId);
                    const c = battleCardMap.get(cardNum);
                    // インデックス文字列で管理 → 同名カードでも個別に選択できる
                    const idxStr = String(idx);
                    const isSel = effectSelectedNums.includes(idxStr);
                    // フィールド対象の場合のゾーン番号（candidates[idx] = zone idx が対応）
                    const zoneIdx = fieldZoneInfo[idx];
                    return (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div
                          onClick={() => {
                            setEffectSelectedNums(prev => {
                              if (prev.includes(idxStr)) {
                                return prev.filter(x => x !== idxStr);
                              }
                              if (prev.length >= maxPick) return prev;
                              return [...prev, idxStr];
                            });
                          }}
                          style={{ position: 'relative', width: 60, height: 84, borderRadius: 4,
                            border: isSel ? '2px solid #f44336' : C.borderCard,
                            cursor: 'pointer', overflow: 'hidden', flexShrink: 0 }}>
                          {c ? (
                            <img src={c.ImgURL} alt={c.CardName} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 8, color: C.textFaint }}>{cardNum}</span>
                            </div>
                          )}
                          {isSel && (
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>✓</span>
                            </div>
                          )}
                        </div>
                        {zoneIdx !== undefined && (
                          <span style={{ fontSize: 9, color: '#9abcbc', lineHeight: 1 }}>
                            ゾーン{zoneIdx + 1}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {inter.type === 'SELECT_TARGET' && inter.optional && (
                    <button onClick={() => handleEffectInteraction([])}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      スキップ
                    </button>
                  )}
                  <button onClick={() => {
                    // インデックス文字列 → CardNum に変換してから渡す
                    const selectedNums = effectSelectedNums.map(i => candidates[parseInt(i, 10)] ?? i);
                    handleEffectInteraction(selectedNums);
                  }}
                    disabled={loading || !canConfirm}
                    style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                      backgroundColor: canConfirm ? C.success : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !canConfirm) ? 'default' : 'pointer' }}>
                    決定 ({effectSelectedNums.length}/{maxPick})
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          );
        }

        // CHOOSE：選択肢ボタン
        if (inter.type === 'CHOOSE') {
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(92vw, 360px)',
                  display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <p style={{ color: C.text, fontSize: 13, margin: 0, textAlign: 'center' }}>効果を選択してください</p>
                {inter.options.map(opt => (
                  <button key={opt.id}
                    disabled={loading || !opt.available}
                    onClick={() => handleEffectInteraction([opt.id])}
                    style={{ padding: '12px 0', borderRadius: 8, border: 'none',
                      backgroundColor: opt.available ? C.success : C.disabled,
                      color: C.text, fontSize: 13, fontWeight: 'bold',
                      cursor: (!opt.available || loading) ? 'default' : 'pointer' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          );
        }

        // LOOK_AND_REORDER：デッキトップのカードを見て並べ替え
        if (inter.type === 'LOOK_AND_REORDER') {
          const moveCard = (idx: number, dir: -1 | 1) => {
            const newOrder = [...lookReorderOrder];
            const swapIdx = idx + dir;
            if (swapIdx < 0 || swapIdx >= newOrder.length) return;
            [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
            setLookReorderOrder(newOrder);
          };
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(95vw, 400px)',
                  display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <p style={{ color: C.text, fontSize: 13, margin: 0, textAlign: 'center' }}>
                  カードを見て並べ替えてください（上がデッキトップ）
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lookReorderOrder.map((cardNum, i) => {
                    const c = battleCardMap.get(cardNum);
                    return (
                      <div key={cardNum} style={{ display: 'flex', alignItems: 'center', gap: 8,
                        backgroundColor: C.bgButton, borderRadius: 6, padding: '6px 8px' }}>
                        <span style={{ color: C.textDim, fontSize: 11, width: 16 }}>{i + 1}</span>
                        <img src={c?.ImgURL} alt={c?.CardName} draggable={false}
                          style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                          onError={e2 => { (e2.target as HTMLImageElement).style.opacity = '0.2'; }} />
                        <span style={{ color: C.textSub, fontSize: 12, flex: 1 }}>{c?.CardName ?? cardNum}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <button onClick={() => moveCard(i, -1)} disabled={i === 0}
                            style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4,
                              border: C.borderUI, backgroundColor: 'transparent',
                              color: i === 0 ? C.textDim : C.text, cursor: i === 0 ? 'default' : 'pointer' }}>↑</button>
                          <button onClick={() => moveCard(i, 1)} disabled={i === lookReorderOrder.length - 1}
                            style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4,
                              border: C.borderUI, backgroundColor: 'transparent',
                              color: i === lookReorderOrder.length - 1 ? C.textDim : C.text,
                              cursor: i === lookReorderOrder.length - 1 ? 'default' : 'pointer' }}>↓</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => { handleEffectInteraction(lookReorderOrder); setLookReorderOrder([]); }}
                  disabled={loading}
                  style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                    backgroundColor: loading ? C.disabled : C.success,
                    color: C.text, fontSize: 14, fontWeight: 'bold',
                    cursor: loading ? 'default' : 'pointer' }}>
                  決定
                </button>
              </div>
            </div>,
            document.body,
          );
        }

        return null;
      })()}

    </div>
  );
}
