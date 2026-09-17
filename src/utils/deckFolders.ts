import type { CardData, Deck } from '../types';
import { randomInt } from '../engine/rng';

/**
 * 🆕**デッキのフォルダ分け（センタールリグのルリグタイプ別）とデッキの種類**（2026-09-17 ユーザー決定）。
 *
 * - **フォルダはセンタールリグのルリグタイプで自動に決まる**（手で作る・名前を付けるフォルダではない）。
 *   🔑センターは「デッキ編成で指定した Lv0」（`utils/deckLrigSetup.ts`）＝指定が無いデッキは「未設定」。
 * - **複合タイプ（`花代/ユヅキ`）は複合名のフォルダ1つ**（両方のフォルダに出さない＝ユーザー決定）。
 * - **デッキの種類**＝`player`（自分が対戦で使う）／`cpu`（CPU が使う）。**混ぜない**。
 *   CPU デッキも全プレイヤーが自分用に作れる。リリース時は管理者の CPU デッキを全員に公開する
 *   （DB の行ポリシーで足す＝クライアントは `deck_kind=cpu` を引くだけで、見える行が増える）。
 */
export type DeckKind = 'player' | 'cpu';

export const DECK_KIND_JA: Record<DeckKind, string> = { player: '自分のデッキ', cpu: 'CPUデッキ' };

/** センター未指定（またはカードが見つからない）デッキのフォルダ名。 */
export const UNSET_FOLDER = '未設定';

export const deckKindOf = (deck: Pick<Deck, 'kind'>): DeckKind => (deck.kind === 'cpu' ? 'cpu' : 'player');

/** デッキのフォルダ名＝センタールリグのルリグタイプ（`CardClass`）。複合タイプは `/` で正規化した複合名のまま。 */
export function deckFolderOf(deck: Pick<Deck, 'centerLrig'>, cardMap: Map<string, CardData>): string {
  const center = deck.centerLrig ? cardMap.get(deck.centerLrig) : undefined;
  const types = (center?.CardClass ?? '').split(/[/／]/).map(s => s.trim()).filter(Boolean);
  return types.length > 0 ? types.join('/') : UNSET_FOLDER;
}

export interface DeckFolder<T> {
  name: string;
  decks: T[];
}

/**
 * フォルダごとにまとめる。フォルダは名前順（「未設定」は最後）、フォルダ内は元の並び（`sort_order`）を保つ。
 */
export function groupDecksByFolder<T extends Pick<Deck, 'centerLrig'>>(
  decks: T[],
  cardMap: Map<string, CardData>,
): DeckFolder<T>[] {
  const byName = new Map<string, T[]>();
  for (const d of decks) {
    const name = deckFolderOf(d, cardMap);
    const list = byName.get(name) ?? [];
    list.push(d);
    byName.set(name, list);
  }
  return [...byName.entries()]
    .sort(([a], [b]) => (a === UNSET_FOLDER ? 1 : b === UNSET_FOLDER ? -1 : a.localeCompare(b, 'ja')))
    .map(([name, list]) => ({ name, decks: list }));
}

/**
 * フォルダ内の並べ替えを、全体の並び（`sort_order` の連番）へ書き戻す。
 * 🔑**他のフォルダ・他の種類のデッキの相対順は動かさない**＝このフォルダが占めていた位置に、新しい順で詰め直す。
 */
export function applyFolderReorder<T extends { id: string }>(all: T[], reorderedInFolder: T[]): T[] {
  const ids = new Set(reorderedInFolder.map(d => d.id));
  const queue = [...reorderedInFolder];
  return all.map(d => (ids.has(d.id) ? queue.shift()! : d));
}

/** ランダムモード＝候補から1つ選ぶ（乱数は `engine/rng` の seam を通す）。候補が空なら null。 */
export function pickRandomDeck<T>(candidates: T[]): T | null {
  return candidates.length > 0 ? candidates[randomInt(candidates.length)] : null;
}

/**
 * 🆕フォルダのサムネイル設定のキー（`deck_folders` テーブルの `(deck_kind, folder_name)`＝持ち主は行ポリシーで本人に絞る）。
 */
export const folderThumbKey = (kind: DeckKind, folderName: string): string => `${kind}|${folderName}`;

/**
 * フォルダの表紙にするカード＝**設定したサムネイル**（カードが見つかるとき）→ 無ければ先頭デッキのセンタールリグ → デッキのサムネイル。
 */
export function folderFaceCard(
  folder: DeckFolder<Pick<Deck, 'centerLrig' | 'thumbnailCardNum'>>,
  cardMap: Map<string, CardData>,
  thumbnailCardNum?: string | null,
): CardData | undefined {
  const chosen = thumbnailCardNum ? cardMap.get(thumbnailCardNum) : undefined;
  if (chosen) return chosen;
  return folder.decks.map(d => cardMap.get(d.centerLrig ?? '') ?? cardMap.get(d.thumbnailCardNum ?? '')).find(Boolean);
}

/** フォルダのサムネイル候補＝そのフォルダのデッキに入っているカード（重複なし・デッキ順）。 */
export function folderThumbnailCandidates(
  folder: DeckFolder<Pick<Deck, 'mainDeck' | 'lrigDeck'>>,
  cardMap: Map<string, CardData>,
): CardData[] {
  const nums = [...new Set(folder.decks.flatMap(d => [...d.lrigDeck, ...d.mainDeck]))];
  return nums.map(n => cardMap.get(n)).filter((c): c is CardData => !!c);
}
