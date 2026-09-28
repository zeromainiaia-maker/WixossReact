import type { PlayerState } from '../types';
import { removeFromField } from './execUtils';

/**
 * チアゾーン（§5.3 `O-538` 段階1・2026-09-29）。
 *
 * 🔑**公式ルール**（タカラトミー「チアゾーン」word_125）＝チアゾーンは公開領域で**「場」に含まれるがシグニゾーンではない**。
 *   1体まで。直接場に出せず「このシグニをチアガールにする」でだけ移る（移ったときの【出】は発動しない）。
 * 🔑**置き場は `field.cheer`（1枚）＋ `field.cheer_down`**＝`field.signi` の4番目にはしない（空きゾーン探索・正面の計算が拾う）／
 *   `free_zone`（バリアトークンの置き場）にも同居させない。
 * ⚠旧実装（〜v0.594）は `free_zone` へ移して `keyword_grants` に「チアガール」の印を付けていた＝`cheerCardOf` はその形も読む（進行中の対戦の互換）。
 */
export const CHEER_GIRL = 'チアガール';

/** チアゾーンのシグニ（いなければ `null`）。旧形式（`free_zone`＋印）も読む。 */
export function cheerCardOf(state: PlayerState): string | null {
  if (state.field.cheer) return state.field.cheer;
  return (state.field.free_zone ?? []).find(n => state.keyword_grants?.[n]?.includes(CHEER_GIRL)) ?? null;
}

/**
 * 「このシグニをチアガールにする」＝シグニゾーンのシグニをチアゾーンへ移す。**チアゾーンが埋まっていれば移さない**（1体まで）＝`null`。
 * ⚠シグニゾーンから抜くのは場を離れる処理と同じ `removeFromField`（下に重なったカード・付いていた札はルール処理でトラッシュ）＝
 *   チアゾーンへの移動は「場を離れる」ではないので、呼び出し側は離場の誘発を起こさない。
 */
export function moveToCheerZone(state: PlayerState, cardNum: string): PlayerState | null {
  if (cheerCardOf(state)) return null;
  const zi = state.field.signi.findIndex(stack => stack?.at(-1) === cardNum);
  if (zi < 0) return null;
  const wasDown = state.field.signi_down?.[zi] ?? false;
  const removed = removeFromField(cardNum, state);
  return { ...removed, field: { ...removed.field, cheer: cardNum, cheer_down: wasDown } };
}

/**
 * 🆕§5.3 `O-538` 段階2＝**シグニの【起】の入口で使う「ゾーン番号」**。チアゾーンは `field.signi` の添字ではないので、
 * 提示ゲート（`listActivatableSigniEffects`）・CPU の候補列挙には**この番号でチアゾーンを渡す**（シグニゾーンは 0〜2）。
 * ⚠`field.signi[CHEER_ZONE]` は常に `undefined`＝ゾーン番号で盤面を読む箇所は `signiStackAt`／`isZoneDown` を通す。
 */
export const CHEER_ZONE = 3;

/** ゾーン番号（0〜2＝シグニゾーン／`CHEER_ZONE`＝チアゾーン）にあるシグニの重なり。 */
export function signiStackAt(state: PlayerState, zoneIndex: number): string[] | null {
  if (zoneIndex === CHEER_ZONE) { const c = cheerCardOf(state); return c ? [c] : null; }
  return state.field.signi[zoneIndex] ?? null;
}

/** ゾーン番号のシグニがダウン状態か。 */
export function isZoneDown(state: PlayerState, zoneIndex: number): boolean {
  if (zoneIndex === CHEER_ZONE) return !!state.field.cheer_down;
  return state.field.signi_down?.[zoneIndex] ?? false;
}
