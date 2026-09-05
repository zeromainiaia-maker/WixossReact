// バトル画面の汎用ヘルパー（ID採番・シャッフル・リフレッシュ/ドロー・じゃんけん等）。BattleScreen.tsx から Stage 0 で抽出。
import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { getCardNum } from '../../engine/effectExecutor';
import { evalUseCondition } from '../../engine/execUtils';
import { applyRefreshState } from '../../engine/refresh';

/**
 * カードの `Type` が「ピース」かどうか（**完全一致で判定しない**）。
 * 🔴**2026-09-05・`V-158` の実機で発覚**＝CSV の `Type` にはピースの派生が3値ある
 *   （`'ピース'` 116枚 ／ **`'ピース/クラフト'` 1枚**＝`WXDi-P16-TK01` ／ **`'リレーピース'` 2枚**）のに、
 *   使用の提示ゲートも実行経路も `=== 'ピース'` の**完全一致**だった＝**その3枚は一度も
 *   「ピースを使用」を提示されない恒久 no-op**（`WXDi-P16-009/010/011` の【起】が生成する
 *   クラフトのピースがまさにこれで、**生成はできるが永久に使えない**）。
 * 🔑**アーツ側は最初から `'アーツ/クラフト'` を並記していた**（`BattleScreen.tsx` の提示ゲート・
 *   `artsUseGate.ts`）＝**同じ穴の片側だけが塞がっていた**。派生型を増やすときはここ1箇所を直す。
 */
export const isPieceCardType = (type?: string | null): boolean =>
  type === 'ピース' || type === 'ピース/クラフト' || type === 'リレーピース';

// CPU専用プレイヤーID（MatchmakingScreenと共有）
export const CPU_PLAYER_ID = '00000000-0000-0000-0000-000000000001';
/** Evaluate an ARTS ACTIVATED use condition identically at discovery and execution time. */
export function canUseArtsCondition(
  effects: readonly CardEffect[],
  ownerState: PlayerState,
  oppState: PlayerState,
  cardMap: Map<string, CardData>,
  sourceCardNum: string,
  currentPhase: string,
  effectivePowers?: Map<string, number>,
): boolean {
  const effect = effects.find(e => e.effectType === 'ACTIVATED');
  return !effect?.condition
    || evalUseCondition(effect.condition, ownerState, oppState, cardMap, sourceCardNum, currentPhase, effectivePowers);
}
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

/**
 * キー【起】能力（getKeyPieceActions）の timing↔phase 照合（Opusタスク12 (li)）。
 * 従来 getKeyPieceActions は timing を無視して「アクションが撃てる phase なら全 ACTIVATED を surface」していた過剰な緩さで、
 * MAIN 専用（timing:['MAIN']）がアタックフェイズにも、《アタックフェイズアイコン》専用（timing:['ATTACK_ARTS']）がメインにも
 * 出ていた。シグニ【起】(getMySigniZoneActions) と同型の照合に揃える：
 *  - MAIN フェイズ → timing に 'MAIN' を含む
 *  - アタックフェイズ各ステップ（ATTACK_ARTS / ATTACK_ARTS_OP / ATTACK_SIGNI / ATTACK_LRIG）→ timing に 'ATTACK_ARTS'（or 'ATTACK'）を含む
 * 例外：'SPELL_CUTIN' はカットイン専用 phase が engine に無く、現状は通常 phase 内で撃つしかないため、
 * timing に 'SPELL_CUTIN' を含む効果はどの phase でも surface する（従来アクセスを維持＝退化ゼロ）。
 * timing 未設定（キー ACTIVATED では実データ0件）は保守的に許容する。
 */
export function keyActivatedTimingMatchesPhase(
  timing: readonly string[] | undefined,
  phase: string,
): boolean {
  if (!timing || timing.length === 0) return true;
  if (timing.includes('SPELL_CUTIN')) return true;
  if (phase === 'MAIN') return timing.includes('MAIN');
  return timing.includes('ATTACK_ARTS') || timing.includes('ATTACK');
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
  return applyRefreshState(state, preventLifeToTrash);
}

/** センタールリグ本来の【起】だけを、実際のルリグゾーンから拾う。 */
export function collectCenterLrigActivatedEffects(
  state: PlayerState,
  effectsMap: Map<string, CardEffect[]>,
  timing: 'MAIN' | 'ATTACK_ARTS',
): CardEffect[] {
  const centerLrig = state.field.lrig.at(-1);
  if (!centerLrig) return [];
  return (effectsMap.get(centerLrig) ?? []).filter(effect =>
    effect.effectType === 'ACTIVATED' && effect.timing?.includes(timing),
  );
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


// PREVENT_DAMAGE ウィンドウのグローバルターン境界処理（両 PlayerState に適用）。
// NEXT_TURN_START は発動ターン中は消費側が無視する予約。境界で NEXT_TURN_END へ昇格し、
// 続く1ターンを丸ごとカバーした次の境界で消滅する。MY_TURN_END は「このターン」なので消滅する。
export function advancePreventDamageWindows(
  windows: PlayerState['prevent_damage_windows'],
): PlayerState['prevent_damage_windows'] {
  const next = (windows ?? [])
    .filter(w => w.expires === 'NEXT_TURN_START' || w.expires === 'MY_NEXT_MAIN_PHASE')
    // ⚠`MY_NEXT_MAIN_PHASE` は**ターン境界では消えない**（失効は自分が次にメインフェイズへ入る1点）＝
    //   ここで昇格させず、そのまま持ち越す（§6.4 O-3 続き492）。
    .map(w => w.expires === 'NEXT_TURN_START' ? { ...w, expires: 'NEXT_TURN_END' as const } : w);
  return next.length > 0 ? next : undefined;
}

/** Reserved NEXT_TURN_START windows are inert until the turn boundary promotes them. */
export function hasActivePreventDamageWindow(
  state: PlayerState,
  scope: 'ALL' | 'LRIG',
): boolean {
  return (state.prevent_damage_windows ?? []).some(w =>
    w.expires !== 'NEXT_TURN_START' && (w.scope === 'ALL' || w.scope === scope));
}

/** 単体選択されたシグニに対する「パワー0以下による消滅だけ」バニッシュ先変更。 */
export function isSelectedPowerZeroBanishRedirect(opponent: PlayerState, cardNum: string): boolean {
  return opponent.banish_redirect_power0_target_nums?.includes(cardNum) === true;
}

/** 単体対象の BANISH_REDIRECT が、いまバニッシュされる個体に適用されるか。 */
export function isSelectedBanishRedirect(opponent: PlayerState, cardNum: string): boolean {
  return opponent.banish_redirect_target_nums?.includes(cardNum) === true;
}

/** 単体対象かつ「バトルによって」限定の BANISH_REDIRECT。効果経路では使用しない。 */
export function isSelectedBattleBanishRedirect(opponent: PlayerState, cardNum: string): boolean {
  return opponent.banish_redirect_battle_target_nums?.includes(cardNum) === true;
}
