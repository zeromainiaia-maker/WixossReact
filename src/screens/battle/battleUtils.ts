// バトル画面の汎用ヘルパー（ID採番・シャッフル・リフレッシュ/ドロー・じゃんけん等）。BattleScreen.tsx から Stage 0 で抽出。
import type { PlayerState } from '../../types';
import { getCardNum } from '../../engine/effectExecutor';

// CPU専用プレイヤーID（MatchmakingScreenと共有）
export const CPU_PLAYER_ID = '00000000-0000-0000-0000-000000000001';
export const CPU_ACTION_DELAY = 900; // CPU行動の遅延ms（オンライン感を出す）

export function generateUUID(): string {
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

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// インスタンスIDを意識したMap：CardNum#N のキーに対して自動的にCardNum部分で検索する
export class InstanceMap<V> extends Map<string, V> {
  // instanceId キーが存在すれば優先（付与能力用）、なければ CardNum にフォールバック
  override get(id: string): V | undefined {
    if (super.has(id)) return super.get(id);
    return super.get(getCardNum(id));
  }
  override has(id: string): boolean { return super.has(id) || super.has(getCardNum(id)); }
}

// デッキのカード配列にインスタンスIDを付与する（WD03-009 → WD03-009#1, WD03-009#2, ...）
// Power「∞」はInfinity扱い（parseIntだとNaN→0になり∞シグニがパワー0として扱われてしまう）
export function parsePowerVal(s: string | undefined): number {
  return s === '∞' ? Infinity : (parseInt(s ?? '0', 10) || 0);
}

export function assignInstanceIds(cards: string[]): string[] {
  const counts: Record<string, number> = {};
  return cards.map(cn => {
    counts[cn] = (counts[cn] ?? 0) + 1;
    return `${cn}#${counts[cn]}`;
  });
}

// CPUゲスト側用：ホストと衝突しないよう #g1, #g2... で採番
export function assignGuestInstanceIds(cards: string[]): string[] {
  const counts: Record<string, number> = {};
  return cards.map(cn => {
    counts[cn] = (counts[cn] ?? 0) + 1;
    return `${cn}#g${counts[cn]}`;
  });
}

// リフレッシュ: トラッシュ全枚数をデッキに加えシャッフル。ライフがあれば一番上をトラッシュへ（バーストなし）。
// ルール：トラッシュが空の場合はリフレッシュしない（保留）。発動時はリフレッシュ回数を加算する。
export function applyRefresh(state: PlayerState, preventLifeToTrash = false): PlayerState {
  if (state.trash.length === 0) return state; // トラッシュ空＝リフレッシュ保留（行わない）
  const newDeck = shuffle([...state.trash]);
  const topLife = (!preventLifeToTrash && state.life_cloth.length > 0) ? state.life_cloth[state.life_cloth.length - 1] : null;
  return {
    ...state,
    deck:       newDeck,
    trash:      preventLifeToTrash ? state.trash : (topLife ? [topLife] : []),
    life_cloth: (!preventLifeToTrash && topLife) ? state.life_cloth.slice(0, -1) : state.life_cloth,
    refresh_count_this_turn: (state.refresh_count_this_turn ?? 0) + 1,
  };
}

// ドロー処理（リフレッシュ対応）。
// デッキ枚数が不足、またはドローでデッキがちょうど0枚になった場合: リフレッシュする（トラッシュが空なら保留）。
export function drawCards(state: PlayerState, count: number, preventLifeToTrash = false): PlayerState {
  if (count <= 0) return state;
  const canDraw = Math.min(count, state.deck.length);
  const drew: PlayerState = {
    ...state,
    hand: [...state.hand, ...state.deck.slice(0, canDraw)],
    deck: state.deck.slice(canDraw),
  };
  // デッキが0枚になったらリフレッシュ（過剰ドロー時も、ちょうど0枚になった時も）
  return drew.deck.length === 0 ? applyRefresh(drew, preventLifeToTrash) : drew;
}

export function jankenWinner(h: string, g: string, hostId: string, guestId: string): string | null {
  if (h === g) return null;
  if (
    (h === 'GU' && g === 'CHOKI') ||
    (h === 'CHOKI' && g === 'PA') ||
    (h === 'PA' && g === 'GU')
  ) return hostId;
  return guestId;
}


export const toHalfWidth = (s: string) =>
  s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));

