import type { CardData, PlayerState } from '../../types';

/**
 * 【側面アタック】でシグニのいない相手シグニゾーンを攻撃したとき、「正面にあるかのように」
 * 対戦相手へダメージを与えられるか（`ARTS_ATTACK_EMPTY_ZONE_AS_FRONT`・`WX16-021` 驚天動地）。
 *
 * ⚠**必ず2箇所から同じ関数を呼ぶこと**＝(1) アタック先ボタンの生成（既定は**空ゾーンを提示しない**）
 *   (2) `resolvePendingSigniBattleFor` の「側面アタックで対象ゾーンが空＝何も起こらない」分岐。
 *   片方だけ直すと「押せるのに何も起きない」か「効果が有効なのに押せない」のどちらかになる。
 *
 * ⚠**クラス判定は `CardClass` の部分一致**（`奏械：英知` のように区切り付きで入るため）。
 *   フラグが空文字ならクラス不問（原文にクラス限定が無い将来カード用）。
 */
export function sideAttackEmptyZoneDealsDamage(
  attackerState: PlayerState,
  attackerNum: string | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  const cls = attackerState.side_attack_empty_zone_damage_class;
  if (cls === undefined) return false;
  if (cls === '') return true;
  if (!attackerNum) return false;
  const card = cardMap.get(attackerNum) ?? cardMap.get(attackerNum.split('#')[0]);
  return (card?.CardClass ?? '').includes(cls);
}
