import type { PendingEffect } from '../../types';
import { getCardNum } from '../../engine/execUtils';

/**
 * 効果解決の中断中に、通常ゾーンから一時的に外れて pending だけが保持するカードを返す。
 * SELECT_ZONE / SELECT_SIGNI_ZONE の cardNum をロード対象へ残さないと、再描画後の
 * effectsMap から配置予定カード自身の【出】などが脱落する。
 */
export function pendingEffectCardNums(pe: PendingEffect | null | undefined): string[] {
  if (!pe) return [];
  const inter = pe.interaction;
  if (!('cardNum' in inter) || typeof inter.cardNum !== 'string') return [];
  return [getCardNum(inter.cardNum)];
}
