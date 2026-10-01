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
  // 🆕§5.3 `O-542`(b)＝チアゾーンのシグニの下のカード（`cheer_under`）も重なりとして渡す＝「下のカード」を数える走査がそのまま追従する。
  return cheer ? [...state.field.signi, [...(state.field.cheer_under ?? []), cheer]] : state.field.signi;
}

/**
 * 🆕§5.3 `O-542`(b)（2026-10-01・ユーザー裁定）＝**場のシグニ（シグニゾーン／チアゾーン）の下にカードを置く**。
 * `cards` を `hostCardNum` の重なりの一番下へ（並びはそのまま）。`hostCardNum` が場にいなければ `null`。
 * 🔑「下に置く」の書き手は `field.signi[zi] = [札, ...重なり]` を各所で手書きしていた＝チアゾーンは `findIndex` が -1 で黙って何も起きない。
 *   ⇒ 置き先を**カード**で受けるハンドラはこれを通す（ゾーン番号で受けるハンドラは `placeUnderZone`）。
 * ⚠置く札を元の場所から抜くのは呼び出し側。
 */
export function placeUnderFieldSigni(state: PlayerState, hostCardNum: string, cards: string[]): PlayerState | null {
  const zi = state.field.signi.findIndex(st => st?.includes(hostCardNum));
  if (zi >= 0) return placeUnderZone(state, zi, cards);
  if (cheerCardOf(state) === hostCardNum || (state.field.cheer_under ?? []).includes(hostCardNum)) return placeUnderZone(state, 3, cards);
  return null;
}

/** `placeUnderFieldSigni` のゾーン番号版（0〜2＝シグニゾーン／3＝チアゾーン）。そのゾーンにシグニがいなければ `null`。 */
export function placeUnderZone(state: PlayerState, zoneIndex: number, cards: string[]): PlayerState | null {
  if (zoneIndex === 3) {
    if (!cheerCardOf(state)) return null;
    return { ...state, field: { ...state.field, cheer_under: [...cards, ...(state.field.cheer_under ?? [])] } };
  }
  const stack = state.field.signi[zoneIndex];
  if (!stack?.length) return null;
  const signi = [...state.field.signi] as (string[] | null)[];
  signi[zoneIndex] = [...cards, ...stack];
  return { ...state, field: { ...state.field, signi } };
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
