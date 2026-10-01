import type { CardData, PlayerState } from '../types';
import type { CardEffect } from '../types/effects';
import { planLimitExcess } from '../screens/battle/limitExcess';
import { declaredSigniOverride } from '../screens/battle/growLogic';

/**
 * **配置リミット制限**（公式ルール Limit／[RULES.md](../../docs/RULES.md) `R-48`）＝
 * **場のシグニのレベル合計がリミットを超えるなら、そのシグニは場に出せない**（効果で出す場合も同じ）。
 *
 * 🔴2026-10-01 バグ報告 `131184e7`（ユーザー指摘「そもそもリミットを超える場合は場に出すときに選択できないはず」）＝
 *   効果の「場に出す」はレベル（`placeLevelGate`）しか見ておらず、**リミットを超えるシグニを選べて場に出せていた**
 *   （CPU が《バイオ・ハザード》で Lv4 を出し Lv4×3＝12 ＞ リミット11）。出た後のルール処理（`R-44`）で落とす
 *   設計だったが、それは**リミットが後から下がった**ときのためのもの＝出す時点で超えるなら出せないのが正。
 * 🔑**出た後のルール処理（`planLimitExcess`）と同じ式で数える**＝ズレると「出せたのに落とされる」／「出せないのに
 *   落とされない」の理不尽になる（`placeLevelGate` と同じ方針）。チアゾーンのシグニはリミットを消費しない。
 * ⚠**fail-open**＝センタールリグが読めない／リミットが ∞／シグニでない札は**通す**（UI の決定を塞ぐ判定なので、
 *   外すと合法な効果が打てない＝ソフトロックになる側）。
 */
export function signiPlaceableByLimit(p: {
  cardId: string;
  placing: PlayerState;
  opponent: PlayerState;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]> | undefined;
  isPlacingOwnerTurn?: boolean;
  /**
   * **事前計算したリミット**（`ExecCtx.lrigLimitSelf/Opponent`＝`makeFillDeployCaps` が載せる）。
   * 🔴実機の `ExecCtx` には `effectsMap` がほとんど入っていない＝それだけに頼るとこのゲートは**実機で丸ごと素通り**する
   *   （`deployCountCapSelf` と同じ罠）。`effectsMap` が無いときはこれと**場の印字レベルの合計**で判定する
   *   （合計はその場で数える＝2枚続けて出す効果は2枚目で止まる）。
   */
  limit?: number;
}): boolean {
  const { cardId, placing, opponent, cardMap, effectsMap } = p;
  const base = cardId.includes('#') ? cardId.slice(0, cardId.indexOf('#')) : cardId;
  const card = cardMap.get(cardId) ?? cardMap.get(base);
  const type = card?.Type ?? '';
  if (!card || !(type.includes('シグニ') || type.includes('レゾナ'))) return true;
  if (!placing.field.lrig.at(-1)) return true;
  const levelOf = (id: string): number => {
    const c = cardMap.get(id) ?? cardMap.get(id.includes('#') ? id.slice(0, id.indexOf('#')) : id);
    if (declaredSigniOverride(placing, c?.CardName).levelZero) return 0;
    const lv = parseInt(c?.Level ?? '', 10);
    return Number.isFinite(lv) ? lv : 0;
  };
  let total: number, limit: number;
  if (effectsMap) {
    const plan = planLimitExcess({ owner: placing, opponent, cardMap, effectsMap, isOwnerTurn: p.isPlacingOwnerTurn ?? false });
    total = plan.total; limit = plan.limit;
  } else if (typeof p.limit === 'number') {
    total = placing.field.signi.reduce((sum, st) => sum + (st?.at(-1) ? levelOf(st.at(-1)!) : 0), 0);
    limit = p.limit;
  } else {
    return true;
  }
  if (!Number.isFinite(limit)) return true;
  return total + levelOf(cardId) <= limit;
}
