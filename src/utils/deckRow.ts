import type { Deck } from '../types';
import { normalizeCpuDeckPlan } from '../screens/battle/cpuDeckPlan';
import { DECK_FORMATS, type DeckFormat } from './deckFormat';

/** `decks` テーブルの1行（クライアントが読む列だけ）。 */
export interface DeckRow {
  id: string;
  user_id?: string;
  name: string;
  main_deck: string[] | null;
  lrig_deck: string[] | null;
  thumbnail_card_num?: string | null;
  sort_order?: number | null;
  art_overrides?: Record<string, string> | null;
  center_lrig?: string | null;
  assist_lrig_l?: string | null;
  assist_lrig_r?: string | null;
  deck_kind?: string | null;
  /** 🆕デッキフォーマット。⚠**null は「未設定」**＝読み側で中身から推定する（`effectiveDeckFormat`）。 */
  deck_format?: string | null;
  cpu_plan?: unknown;
}

/** DB の行 → `Deck`（App の自分のデッキ一覧と、マッチングの CPU デッキ一覧で共用）。 */
export const deckFromRow = (d: DeckRow): Deck => ({
  id: d.id,
  userId: d.user_id,
  name: d.name,
  mainDeck: d.main_deck ?? [],
  lrigDeck: d.lrig_deck ?? [],
  thumbnailCardNum: d.thumbnail_card_num ?? undefined,
  sortOrder: d.sort_order ?? 0,
  artOverrides: d.art_overrides ?? {},
  centerLrig: d.center_lrig ?? null,
  assistLrigL: d.assist_lrig_l ?? null,
  assistLrigR: d.assist_lrig_r ?? null,
  kind: d.deck_kind === 'cpu' ? 'cpu' : 'player',
  format: normalizeDeckFormat(d.deck_format),
  cpuPlan: normalizeCpuDeckPlan(d.cpu_plan),
});

/** DB の文字列 → `DeckFormat`。⚠知らない値・null は **`undefined`（未設定）** に倒す（勝手に制限を掛けない）。 */
export const normalizeDeckFormat = (v: unknown): DeckFormat | undefined =>
  DECK_FORMATS.find(f => f === v);
