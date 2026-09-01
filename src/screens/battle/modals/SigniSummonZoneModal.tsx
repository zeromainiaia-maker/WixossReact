// シグニ召喚ゾーン選択モーダル。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { getCardNum } from '../../../engine/effectExecutor';
import { getRiseFilter, matchesRiseFilter } from '../../../engine/execUtils';
import { collectForcePlaceFrontZones } from '../../../engine/effectEngine';
import { deployLimitBlockReason } from '../../../engine/deployLimit';
import { C } from '../../../components/BoardComponents';
import { findSigniZoneBlock, resolveSigniZonePlacement } from '../signiZoneBlock';
import type { BattleModalCtx } from './types';

interface SigniSummonZoneModalProps {
  ctx: BattleModalCtx;
  pendingSigniSummon: { cardNum: string; handIndex: number } | null;
  setPendingSigniSummon: Dispatch<SetStateAction<{ cardNum: string; handIndex: number } | null>>;
  fieldSigniTotal: number;
  lrigLimit: number;
  handleSummonSigni: (handIndex: number, zoneIndex: number) => void;
}

export function SigniSummonZoneModal(p: SigniSummonZoneModalProps) {
  const { my, op, isMyTurn, loading, battleCardMap, effectsMap } = p.ctx;
  const { pendingSigniSummon, setPendingSigniSummon, fieldSigniTotal, lrigLimit, handleSummonSigni } = p;
  return (
    <>
      {pendingSigniSummon && createPortal(
        <div onClick={() => setPendingSigniSummon(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '24px 20px', width: 'min(80vw, 300px)', textAlign: 'center',
            }}>
            <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: '0 0 4px' }}>
              召喚先のゾーンを選択
            </p>
            {(() => {
              const summonCard = battleCardMap.get(pendingSigniSummon.cardNum);
              const signiLevel = parseInt(summonCard?.Level ?? '0') || 0;
              return (
                <p style={{ color: C.textDim, fontSize: 12, margin: '0 0 14px' }}>
                  Lv.{signiLevel}　リミット: {fieldSigniTotal}/{lrigLimit === Infinity ? '∞' : lrigLimit}
                </p>
              );
            })()}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {([0, 1, 2] as const).map(zi => {
                const summonCard = battleCardMap.get(pendingSigniSummon.cardNum);
                const signiLevel = parseInt(summonCard?.Level ?? '0') || 0;
                const zoneStack = my.field.signi[zi] ?? [];
                const isOccupied = zoneStack.length > 0;
                const pendingRiseFilter = summonCard ? getRiseFilter(summonCard.EffectText ?? '') : null;
                // FORCE_PLACE_FRONT: 相手の該当シグニの正面ゾーンのみ配置可（正面が空いている場合のみ強制）
                const forcedFrontSummon = collectForcePlaceFrontZones(op, my, battleCardMap, effectsMap, !isMyTurn);
                const forcedBlocked = !pendingRiseFilter && forcedFrontSummon.size > 0 && !forcedFrontSummon.has(zi);
                // ライズカード: 条件を満たす占有ゾーンのみ有効
                const riseConditionMet = pendingRiseFilter
                  ? (isOccupied && matchesRiseFilter(getCardNum(zoneStack.at(-1)!), pendingRiseFilter, battleCardMap))
                  : false;
                // ライズ: 既存シグニの分を引いて新シグニ分を加算
                const existingTopLevel = pendingRiseFilter && isOccupied
                  ? parseInt(battleCardMap.get(getCardNum(zoneStack.at(-1)!))?.Level ?? '0') || 0
                  : 0;
                const afterTotal = fieldSigniTotal - existingTopLevel + signiLevel;
                const overLimit = afterTotal > lrigLimit;
                // DEPLOY_RESTRICT（配置パワー制限／配置数制限）は `engine/deployLimit.ts` に一本化
                // （通常召喚UI・このモーダル・CPU召喚・engine の効果配置が同じ関数を呼ぶ＝続き405）。
                const deployBlock = deployLimitBlockReason({
                  placingState: my, opponentState: op, cardNum: pendingSigniSummon.cardNum,
                  cardMap: battleCardMap, effectsMap, isPlacingOwnerTurn: isMyTurn,
                  onExistingStack: !!pendingRiseFilter,
                  placementSource: 'normal_summon',
                  // 🆕§5.3 `O-94`②＝ゾーン＋レベルの配置禁止もこの funnel で受ける。
                  zoneIndex: zi,
                });
                const overPowerLimit = deployBlock === 'POWER_LIMIT';
                const overCountLimit = deployBlock === 'COUNT_LIMIT';
                // 🆕`ZONE_LEVEL_RESTRICT`＝そのゾーンだけ置けない（他ゾーンは置ける）＝ボタン単位で落とす。
                //   ⚠旧はこのモーダルに判定が無く、押せてしまってから `handleSummonSigni` が黙って弾いていた。
                const zoneLevelBlocked = deployBlock === 'ZONE_LEVEL_RESTRICT';
                // BLOCK_OPP_ZONE_PLACEMENT / REMOVE_SIGNI_ZONE（タスク12(lxi) 第10波）:
                // 「新たに配置できない」ゾーン。《無》×N の支払い回避つきはエナが足りれば選べる（払って配置）。
                const zoneBlock = pendingRiseFilter ? undefined : findSigniZoneBlock(my, zi);
                const zoneBlockCost = zoneBlock?.colorless ?? 0;
                const zoneBlocked = !!zoneBlock && !resolveSigniZonePlacement(my, zi).allowed;
                const isDisabled = loading || overLimit || overPowerLimit || overCountLimit || forcedBlocked || zoneBlocked || zoneLevelBlocked ||
                  (pendingRiseFilter ? !riseConditionMet : isOccupied);
                return (
                  <button key={zi} data-testid={`summon-zone-${zi}`}
                    onClick={() => !isDisabled && handleSummonSigni(pendingSigniSummon.handIndex, zi)}
                    disabled={isDisabled}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 8,
                      border: (pendingRiseFilter ? !riseConditionMet : isOccupied) ? `1px solid ${C.textFaint}` : (overLimit || overPowerLimit || overCountLimit || zoneBlocked || zoneLevelBlocked) ? `1px solid ${C.danger}` : C.borderUI,
                      backgroundColor: isDisabled ? C.disabled : C.bgButton,
                      color: isDisabled ? C.textFaint : C.text,
                      fontSize: 13, cursor: isDisabled ? 'default' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}>
                    <span>ゾーン{zi + 1}{pendingRiseFilter ? (riseConditionMet ? ' (ライズ可)' : ' (条件不一致)') : (zoneBlocked ? ' (配置禁止)' : forcedBlocked ? ' (正面強制)' : isOccupied ? ' (使用中)' : '')}</span>
                    <span style={{ fontSize: 11, color: (pendingRiseFilter ? !riseConditionMet : isOccupied) ? C.textFaint : (overLimit || overPowerLimit || overCountLimit || zoneBlocked) ? C.danger : C.textDim }}>
                      {pendingRiseFilter ? (riseConditionMet ? 'ライズ' : '—') : (zoneBlocked ? (zoneBlockCost > 0 ? `《無》×${zoneBlockCost}不足` : '配置禁止') : forcedBlocked ? '正面のみ' : isOccupied ? '—' : overCountLimit ? '配置数制限' : overPowerLimit ? 'パワー制限' : overLimit ? 'リミット超過' : zoneBlockCost > 0 ? `《無》×${zoneBlockCost}を支払う` : `${afterTotal}/${lrigLimit === Infinity ? '∞' : lrigLimit}`)}
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setPendingSigniSummon(null)}
              style={{
                marginTop: 12, padding: '8px 20px', borderRadius: 8, border: C.borderUI,
                backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13,
              }}>
              キャンセル
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
