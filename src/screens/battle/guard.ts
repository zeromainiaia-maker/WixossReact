import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import { getCardNum } from '../../engine/execUtils';

/** 現在の所有者盤面で、手札のカードを【ガード】として使用できるかを判定する。 */
export function canCardGuard(
  cardNum: string,
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, CardEffect[]>,
): boolean {
  const baseCardNum = getCardNum(cardNum);
  if (cardMap.get(baseCardNum)?.Guard !== '1') return false;

  const guardLoss = (effectsMap.get(baseCardNum) ?? []).find(effect =>
    effect.effectType === 'CONTINUOUS' &&
    effect.action.type === 'STUB' &&
    effect.action.id === 'GUARD_LOSS_UNLESS_LRIG'
  );
  if (!guardLoss || guardLoss.action.type !== 'STUB') return true;

  const requiredClass = (guardLoss.action as StubAction).lrigClass;
  if (!requiredClass) return true;

  const centerLrigNum = ownerState.field.lrig.at(-1);
  const centerLrigClass = centerLrigNum
    ? cardMap.get(getCardNum(centerLrigNum))?.CardClass ?? ''
    : '';
  return centerLrigClass.includes(requiredClass);
}

/**
 * 「〈レベル限定〉のシグニで【ガード】ができない」を `blocked_actions` / CONTINUOUS の actionId 集合から解いて、
 * 「そのレベルのカードでガードできないか」を答える述語にする（§6.4 O-41・2026-08-22）。
 *
 * 🔴**この限定を落とすと素の `GUARD`（＝ガードそのものができない）と同じ挙動になり、原文より遥かに強い
 *   過剰実行に化ける**。live 実測で6効果がその状態だった（`WD15-010` `WDK05-T09` `WX18-039` `WX10-009`
 *   `WX19-054` `WXEX2-01`）。
 *
 * 語彙は actionId の**文字列**で持つ。`blocked_actions`（`string[]`）も CONTINUOUS 側の
 * `ContinuousBlockResult.forSelf`（`Set<string>`）も文字列の経路なので、`BlockActionAction` に型フィールドを
 * 足しても常在（【常】）側には届かない。
 *   - `GUARD_MAX_LV<n>`      ＝レベル n **以下**（従来からある形）
 *   - `GUARD_LV<n>[_<m>…]`   ＝そのレベル**ちょうど**／列挙（`GUARD_LV2_3` ＝レベル２とレベル３）
 * ⚠**2つを1つの regex で拾わない**＝「以下」と「ちょうど」が混ざって過剰・過小の両方に化ける。
 * ⚠**終端アンカーを打たない**＝`execBlockAction` は `until:'NEXT_TURN'` のとき `:NEXT_TURN` を付けて積む。
 * ⚠レベルを持たないガードカードは呼び出し側の慣例どおり `-1` で渡る＝「n 以下」には従来どおり掛かる
 *   （ここで挙動を変えると O-41 と無関係の退化になる）。
 *
 * 実行時にしかレベルが決まらない `GUARD_LV_DECLARED` / `GUARD_LV_LAST_DOWNED` は**ここには来ない**＝
 * `execBlockAction` が宣言値／直前ダウン札のレベルを解決して `declared_guard_restrict_levels` に積む。
 */
export function makeGuardLevelBlocker(actionIds: Iterable<string>): (level: number) => boolean {
  let maxLevel = -1;
  const exactLevels = new Set<number>();
  for (const id of actionIds) {
    const asMax = id.match(/^GUARD_MAX_LV(\d+)/);
    if (asMax) { maxLevel = Math.max(maxLevel, parseInt(asMax[1])); continue; }
    const asExact = id.match(/^GUARD_LV(\d+(?:_\d+)*)/);
    if (asExact) for (const n of asExact[1].split('_')) exactLevels.add(parseInt(n));
  }
  return (level: number) => (maxLevel >= 0 && level <= maxLevel) || exactLevels.has(level);
}
