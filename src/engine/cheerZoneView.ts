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

/**
 * 🆕§5.3 `O-538` 段階5＝**カード番号のシグニのダウン状態**（シグニゾーン／チアゾーン）。場にいなければ `null`。
 * 🔑ダウン・アップの効果は「`findIndex` でゾーン番号を探して `signi_down[zi]` を書く」形だった＝チアゾーンは -1 で黙って何も起きない。
 */
export function signiDownOf(state: PlayerState, cardNum: string): boolean | null {
  const zi = state.field.signi.findIndex(st => st?.at(-1) === cardNum);
  if (zi >= 0) return state.field.signi_down?.[zi] ?? false;
  if (cheerCardOf(state) === cardNum) return !!state.field.cheer_down;
  return null;
}

/** カード番号のシグニのダウン状態を書き換えた state（場にいなければ `null`）。 */
export function withSigniDown(state: PlayerState, cardNum: string, down: boolean): PlayerState | null {
  const zi = state.field.signi.findIndex(st => st?.at(-1) === cardNum);
  if (zi >= 0) {
    const next = [...(state.field.signi_down ?? [false, false, false])] as boolean[];
    next[zi] = down;
    return { ...state, field: { ...state.field, signi_down: next } };
  }
  if (cheerCardOf(state) === cardNum) return { ...state, field: { ...state.field, cheer_down: down } };
  return null;
}

/**
 * 🆕§5.3 `O-538` 段階5＝**ゾーン番号の凍結状態**（0〜2＝シグニゾーン／3＝チアゾーン）。
 * 🔑凍結は**ゾーンではなくシグニの状態**（チアゾーンで不可なのはウィルス・トラップ等「ゾーンに置くもの」）＝`cheer_frozen` を読む。
 *   `fieldSigniStacks` で回す走査はチアゾーンを添字3で渡すので、`signi_frozen?.[zi]` を直接読むとチアゾーンだけ常に「凍結なし」になる。
 */
export function isZoneFrozen(state: PlayerState, zoneIndex: number): boolean {
  if (zoneIndex === 3) return !!state.field.cheer_frozen;
  return state.field.signi_frozen?.[zoneIndex] ?? false;
}

/** 🆕§5.3 `O-538` 段階5＝**ゾーン番号のダウン状態**（0〜2＝シグニゾーン／3＝チアゾーン）。`isZoneFrozen` と同じ規約。 */
export function isZoneDownView(state: PlayerState, zoneIndex: number): boolean {
  if (zoneIndex === 3) return !!state.field.cheer_down;
  return state.field.signi_down?.[zoneIndex] ?? false;
}
