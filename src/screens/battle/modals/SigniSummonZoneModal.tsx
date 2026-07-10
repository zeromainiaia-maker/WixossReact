// シグニ召喚ゾーン選択モーダル。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { getCardNum } from '../../../engine/effectExecutor';
import { getRiseFilter, matchesRiseFilter } from '../../../engine/execUtils';
import { collectForcePlaceFrontZones, collectDeployCountLimit } from '../../../engine/effectEngine';
import { C } from '../../../components/BoardComponents';
import { parsePowerVal } from '../battleUtils';
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
                const signiPower = parsePowerVal(summonCard?.Power);
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
                // DEPLOY_RESTRICT: signi_deploy_power_limit が設定されている場合
                const overPowerLimit = my.signi_deploy_power_limit !== undefined && signiPower >= my.signi_deploy_power_limit;
                // DEPLOY_RESTRICT（配置数制限）: フラグ（このターン）＋相手場の CONT レゾナ の小さい方が場のシグニ数以下なら新規配置不可
                const contCountCap = collectDeployCountLimit(op, my, battleCardMap, effectsMap, !isMyTurn);
                const countCap = my.signi_deploy_count_limit !== undefined
                  ? (contCountCap !== undefined ? Math.min(my.signi_deploy_count_limit, contCountCap) : my.signi_deploy_count_limit)
                  : contCountCap;
                const overCountLimit = !pendingRiseFilter && countCap !== undefined
                  && my.field.signi.filter(s => s && s.length > 0).length >= countCap;
                const isDisabled = loading || overLimit || overPowerLimit || overCountLimit || forcedBlocked ||
                  (pendingRiseFilter ? !riseConditionMet : isOccupied);
                return (
                  <button key={zi} data-testid={`summon-zone-${zi}`}
                    onClick={() => !isDisabled && handleSummonSigni(pendingSigniSummon.handIndex, zi)}
                    disabled={isDisabled}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 8,
                      border: (pendingRiseFilter ? !riseConditionMet : isOccupied) ? `1px solid ${C.textFaint}` : (overLimit || overPowerLimit || overCountLimit) ? `1px solid ${C.danger}` : C.borderUI,
                      backgroundColor: isDisabled ? C.disabled : C.bgButton,
                      color: isDisabled ? C.textFaint : C.text,
                      fontSize: 13, cursor: isDisabled ? 'default' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}>
                    <span>ゾーン{zi + 1}{pendingRiseFilter ? (riseConditionMet ? ' (ライズ可)' : ' (条件不一致)') : (forcedBlocked ? ' (正面強制)' : isOccupied ? ' (使用中)' : '')}</span>
                    <span style={{ fontSize: 11, color: (pendingRiseFilter ? !riseConditionMet : isOccupied) ? C.textFaint : (overLimit || overPowerLimit || overCountLimit) ? C.danger : C.textDim }}>
                      {pendingRiseFilter ? (riseConditionMet ? 'ライズ' : '—') : (forcedBlocked ? '正面のみ' : isOccupied ? '—' : overCountLimit ? '配置数制限' : overPowerLimit ? 'パワー制限' : overLimit ? 'リミット超過' : `${afterTotal}/${lrigLimit === Infinity ? '∞' : lrigLimit}`)}
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
