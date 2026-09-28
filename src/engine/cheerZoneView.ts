import type { PlayerState } from '../types';

/**
 * チアゾーンの読み手（§5.3 `O-538`）＝**import を持たない**小さなモジュール（`effectEngine` 等から循環なしで読める）。
 * 実体・移動は `cheerZone.ts`（こちらを再 export する）。
 */
export const CHEER_GIRL = 'チアガール';

/** チアゾーンのシグニ（いなければ `null`）。旧形式（`free_zone`＋「チアガール」の印）も読む。 */
export function cheerCardOf(state: PlayerState): string | null {
  if (state.field.cheer) return state.field.cheer;
  return (state.field.free_zone ?? []).find(n => state.keyword_grants?.[n]?.includes(CHEER_GIRL)) ?? null;
}

/**
 * 🆕§5.3 `O-538` 段階3＝**「場のシグニ」（位置を問わない集合）の重なり一覧**＝シグニゾーン3つ＋チアゾーン。
 * 🔑ルールの軸＝チアゾーンは**「場」に含まれるが「シグニゾーン」ではない**。⇒
 *   ・**ゾーン番号を使わずに回す走査**（【常】の発生源を集める・「あなたのシグニ」を数える／対象に取る）はこれを通す
 *   ・**ゾーン番号を使う走査**（正面・隣・「シグニゾーン」）は `field.signi` のまま（チアゾーンを含めない）
 * ⚠チアゾーンが空なら**元の配列そのもの**を返す（現状の挙動は変わらない）。末尾に足すので添字 0〜2 はシグニゾーンのまま。
 */
export function fieldSigniStacks(state: PlayerState): (string[] | null)[] {
  const cheer = cheerCardOf(state);
  return cheer ? [...state.field.signi, [cheer]] : state.field.signi;
}
