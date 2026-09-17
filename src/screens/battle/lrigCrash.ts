import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { collectContinuousGrantedKeywords } from '../../engine/effectEngine';
import { isKeywordAbilityRemoved } from '../../utils/keywords';

export interface LrigAttackCrashState {
  /** このルリグアタックが割るライフクロスの枚数（通常1／【ダブルクラッシュ】2／【トリプルクラッシュ】3）。 */
  crashCount: number;
  /** クラッシュの原因キーワード（`crash_cause` に刻む値。通常のダメージなら `undefined`）。 */
  cause?: 'ダブルクラッシュ' | 'トリプルクラッシュ';
}

/**
 * **ルリグアタックが割る枚数**（§5.6 `C-9`・台帳 [RULES.md](../../../docs/RULES.md) `R-06`）。
 *
 * 公式ルール（EN Double Crush／JP-042・117）＝【ダブルクラッシュ】は2枚・【トリプルクラッシュ】は3枚。
 * **複数得ても枚数は据え置き**で、**トリプルが優先**する。残りライフが足りなければあるだけ割り、
 * 足りないこと自体では勝たない（＝呼び出し側が `Math.min` する）。
 *
 * 🔴**2026-09-17 の棚卸しで発見した不一致**＝ルリグアタック解決の【トリプルクラッシュ】判定だけが
 *   `keyword_grants` しか見ておらず、**【ダブル】と違って CONTINUOUS 付与（`collectContinuousGrantedKeywords`）を
 *   読んでいなかった**＝【常】でトリプルを付与しても2枚しか割れない（しかも `crash_cause` が
 *   「ダブルクラッシュ」に化けるので、【トリプルクラッシュ】限定の札も誤って外れる）。
 *
 * 🔑**シグニ側は `getSigniAttackKeywordState` が同じ役目**＝こちらはルリグ（センター／アシスト）用。
 *   ⚠**写経しない**＝判定が2箇所（アタック解決／CPU のガード見積り）にあり、片方だけ直すと
 *     「CPU はトリプルと見て受けるのに、解決は2枚しか割らない」型の無言のズレになる。
 */
export function getLrigAttackCrashState(
  attackingLrigNum: string | null | undefined,
  attacker: PlayerState,
  defender: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, CardEffect[]>,
): LrigAttackCrashState {
  if (!attackingLrigNum) return { crashCount: 1 };
  // ⚠ルリグアタックは常に**攻撃側のターン**なので `isOwnerTurn` は true 固定（両方の呼び出し元と同じ）。
  const dynamic = collectContinuousGrantedKeywords(attacker, defender, true, effectsMap, cardMap);
  const keywords = [
    ...(attacker.keyword_grants?.[attackingLrigNum] ?? []),
    ...(attacker.keyword_grants_until_opp_turn?.[attackingLrigNum] ?? []),
    ...(dynamic[attackingLrigNum] ?? []),
  ].filter(keyword => !isKeywordAbilityRemoved(attackingLrigNum, keyword, attacker.keyword_abilities_removed));
  if (keywords.includes('トリプルクラッシュ')) return { crashCount: 3, cause: 'トリプルクラッシュ' };
  if (keywords.includes('ダブルクラッシュ')) return { crashCount: 2, cause: 'ダブルクラッシュ' };
  return { crashCount: 1 };
}
