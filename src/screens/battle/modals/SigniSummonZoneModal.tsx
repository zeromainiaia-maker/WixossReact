// シグニ召喚ゾーン選択モーダル。BattleScreen.tsx から Stage 1 で抽出。
import { useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { getCardNum } from '../../../engine/effectExecutor';
import { getRiseRequirement, matchesRiseFilter, riseFieldTotal } from '../../../engine/execUtils';
import { collectForcePlaceFrontZones } from '../../../engine/effectEngine';
import { deployLimitBlockReason } from '../../../engine/deployLimit';
import { C } from '../../../components/BoardComponents';
import { findSigniZoneBlock, resolveSigniZonePlacement } from '../signiZoneBlock';
import { declaredSigniOverride } from '../growLogic';
import type { RiseFieldItem, RiseMaterialItem, RiseSelection } from '../riseSummon';
import {
  canPayRiseField, canPayRiseMaterials, riseFieldOptions, riseMaterialOptions,
  validateRiseField, validateRiseMaterials,
} from '../riseSummon';
import type { BattleModalCtx } from './types';

interface SigniSummonZoneModalProps {
  ctx: BattleModalCtx;
  pendingSigniSummon: { cardNum: string; handIndex: number } | null;
  setPendingSigniSummon: Dispatch<SetStateAction<{ cardNum: string; handIndex: number } | null>>;
  fieldSigniTotal: number;
  lrigLimit: number;
  handleSummonSigni: (handIndex: number, zoneIndex: number, resona?: undefined, riseSelection?: RiseSelection) => void;
}

export function SigniSummonZoneModal(p: SigniSummonZoneModalProps) {
  const { my, op, isMyTurn, loading, battleCardMap, effectsMap } = p.ctx;
  const { pendingSigniSummon, setPendingSigniSummon, fieldSigniTotal, lrigLimit, handleSummonSigni } = p;
  // 🆕§5.3 `O-147`（下位family B）＝材料つき【ライズ】の選択状態。
  //   ⚠**対象カードが変わったら必ず捨てる**（前のカードの添字を持ち越すと別のカードを払う）＝
  //     選択と一緒に「どの召喚に対する選択か」を持ち、キーが違えば空として読む
  //     （`useEffect` でリセットすると 1フレーム古い選択が見えるうえ cascading render になる）。
  const pendingKey = pendingSigniSummon ? `${pendingSigniSummon.cardNum}:${pendingSigniSummon.handIndex}` : '';
  const [selectionState, setSelectionState] = useState<{ key: string; sel: RiseSelection }>(
    { key: '', sel: { materials: [], fieldZones: [] } });
  const riseSelection = selectionState.key === pendingKey
    ? selectionState.sel : { materials: [], fieldZones: [] };
  const riseMaterials = riseSelection.materials;
  const riseFieldZones = riseSelection.fieldZones;
  const patchSelection = (next: Partial<RiseSelection>) =>
    setSelectionState({ key: pendingKey, sel: { ...riseSelection, ...next } });
  const summonCard = pendingSigniSummon ? battleCardMap.get(pendingSigniSummon.cardNum) : undefined;
  const riseReq = summonCard ? getRiseRequirement(summonCard.EffectText ?? '') : null;
  const riseMaterialSpecs = riseReq?.materials ?? [];
  // 🆕§5.3 `O-147`（下位family A）＝場のシグニを2体以上消費する形は「どのゾーンを潰すか」を先に選ばせる。
  const riseFieldGroups = riseReq?.base.kind === 'field' ? riseReq.base.groups : [];
  const riseFieldNeeded = riseReq ? riseFieldTotal(riseReq.base) : 0;
  const riseMultiField = riseFieldNeeded >= 2;
  // 材料・下敷きが足りなければ召喚そのものが成立しない（どちらもコストではなく**配置条件**）。
  const riseMaterialsAvailable = !riseReq || riseMaterialSpecs.length === 0
    || canPayRiseMaterials(my, riseReq, battleCardMap);
  const riseMaterialsReady = !riseReq || riseMaterialSpecs.length === 0
    || validateRiseMaterials(my, riseReq, riseMaterials, battleCardMap);
  const riseFieldAvailable = !riseReq || !riseMultiField || canPayRiseField(my, riseReq, battleCardMap);
  const riseFieldReady = !riseReq || !riseMultiField
    || validateRiseField(my, riseReq, riseFieldZones, battleCardMap);
  const zoneLabel = (z: RiseMaterialItem['zone']) => z === 'trash' ? 'トラッシュ' : 'エナゾーン';
  const materialKey = (i: RiseMaterialItem) => `${i.group}:${i.zone}:${i.index}`;
  const toggleMaterial = (item: RiseMaterialItem) => {
    const prev = riseMaterials;
    if (prev.some(s => materialKey(s) === materialKey(item))) {
      return patchSelection({ materials: prev.filter(s => materialKey(s) !== materialKey(item)) });
    }
    const limit = riseMaterialSpecs[item.group]?.count ?? 0;
    if (prev.filter(s => s.group === item.group).length >= limit) return;
    patchSelection({ materials: [...prev, item] });
  };
  // ⚠**同じゾーンを2つの枠に入れない**（`WX17-026` は「《ライズアイコン》1体と＜武勇＞2体」＝
  //   同じゾーンが両方の候補になりうる）。選び直しは「別の枠で選ばれていたら外してから入れる」。
  const toggleFieldZone = (item: RiseFieldItem) => {
    const prev = riseFieldZones;
    if (prev.some(f => f.zoneIndex === item.zoneIndex && f.group === item.group)) {
      return patchSelection({ fieldZones: prev.filter(f => f.zoneIndex !== item.zoneIndex) });
    }
    const limit = riseFieldGroups[item.group]?.count ?? 0;
    const others = prev.filter(f => f.zoneIndex !== item.zoneIndex);
    if (others.filter(f => f.group === item.group).length >= limit) return;
    patchSelection({ fieldZones: [...others, item] });
  };
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
              padding: '24px 20px',
              width: (riseMaterialSpecs.length > 0 || riseMultiField) ? 'min(92vw, 640px)' : 'min(80vw, 300px)',
              textAlign: 'center',
            }}>
            <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: '0 0 4px' }}>
              {riseMultiField ? '【ライズ】下敷きにするシグニと召喚先を選択'
                : riseMaterialSpecs.length > 0 ? '【ライズ】下に重ねるカードと召喚先を選択'
                  : '召喚先のゾーンを選択'}
            </p>
            {(() => {
              // 🆕🔴**§5.3 `O-226`（2026-09-04・`V-148` の実機で発覚）＝宣言したシグニは基本レベル0。**
              //   手札の「召喚」ゲートと `fieldSigniTopLevels` には読み手を入れたのに**このモーダルには無く**、
              //   `afterTotal = 0 + 4 > リミット2` で**3ゾーンとも disabled**＝
              //   **「召喚」は押せるのに1体も置けない**（提示だけ通って配置できない）状態だった。
              const signiLevel = declaredSigniOverride(my, summonCard?.CardName).levelZero
                ? 0 : (parseInt(summonCard?.Level ?? '0') || 0);
              return (
                <p style={{ color: C.textDim, fontSize: 12, margin: '0 0 14px' }}>
                  Lv.{signiLevel}　リミット: {fieldSigniTotal}/{lrigLimit === Infinity ? '∞' : lrigLimit}
                </p>
              );
            })()}
            {/* 🆕🔴§5.3 `O-147`（下位family A）＝場のシグニを2体以上消費する形は、
                「どのゾーンのシグニを下敷きにするか」を枠ごとに選ばせる。
                ⚠**配置先は必ずこの中の1ゾーン**（原文「どちらかのシグニがあるシグニゾーンに出す」）。 */}
            {riseMultiField && riseFieldGroups.map((group, gi) => {
              const options = riseFieldOptions(my, group, battleCardMap);
              return (
                <div key={`fg${gi}`} style={{ marginBottom: 10 }}>
                  <p style={{ color: C.textSub, fontSize: 12, margin: '6px 0' }}>
                    下敷きにするシグニ {gi + 1}枠目（{group.count}体）
                    　{riseFieldZones.filter(f => f.group === gi).length}/{group.count}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {options.length === 0 && (
                      <span style={{ color: C.danger, fontSize: 12 }}>条件を満たすシグニが場にありません</span>
                    )}
                    {options.map(zi => {
                      const chosen = riseFieldZones.some(f => f.zoneIndex === zi && f.group === gi);
                      const takenByOther = riseFieldZones.some(f => f.zoneIndex === zi && f.group !== gi);
                      const num = getCardNum((my.field.signi[zi] ?? []).at(-1) ?? '');
                      const card = battleCardMap.get(num);
                      return (
                        <button key={zi} data-testid={`rise-field-${gi}-${zi}`}
                          onClick={() => toggleFieldZone({ zoneIndex: zi, group: gi })}
                          style={{
                            padding: '7px 9px', borderRadius: 7, fontSize: 12,
                            border: chosen ? `2px solid ${C.accent}` : C.borderUI,
                            backgroundColor: chosen ? '#243b62' : C.bgButton,
                            color: takenByOther ? C.textFaint : C.text, cursor: 'pointer',
                          }}>
                          ゾーン{zi + 1}: Lv{card?.Level ?? '?'} {card?.CardName ?? num}
                          {takenByOther ? '（他の枠で選択中）' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {riseMultiField && riseReq?.base.kind === 'field'
              && (riseReq.base.distinctLevel || riseReq.base.distinctColor) && (
              <p style={{ color: C.textDim, fontSize: 11, margin: '0 0 10px' }}>
                {riseReq.base.distinctLevel ? '※ それぞれレベルが異なること' : ''}
                {riseReq.base.distinctColor ? '※ 互いに共通する色を持たないこと' : ''}
              </p>
            )}
            {/* 🆕§5.3 `O-147`＝材料つき【ライズ】は「下に重ねるカード」を枠ごと（枚数固定）に選ばせる。 */}
            {riseReq && riseMaterialSpecs.map((spec, group) => {
              const options = riseMaterialOptions(my, spec, battleCardMap);
              const src = spec.from === 'trash' ? my.trash : my.energy;
              return (
                <div key={group} style={{ marginBottom: 10 }}>
                  <p style={{ color: C.textSub, fontSize: 12, margin: '6px 0' }}>
                    {zoneLabel(spec.from)}から{spec.count}枚
                    {spec.distinctLevel ? '（それぞれレベルが異なること）' : ''}
                    　{riseMaterials.filter(s => s.group === group).length}/{spec.count}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxHeight: 132, overflowY: 'auto' }}>
                    {options.length === 0 && (
                      <span style={{ color: C.danger, fontSize: 12 }}>条件を満たすカードがありません</span>
                    )}
                    {options.map(index => {
                      const item: RiseMaterialItem = { zone: spec.from, index, group };
                      const chosen = riseMaterials.some(s => materialKey(s) === materialKey(item));
                      const num = getCardNum(src?.[index] ?? '');
                      const card = battleCardMap.get(num);
                      return (
                        <button key={index} data-testid={`rise-material-${group}-${index}`}
                          onClick={() => toggleMaterial(item)}
                          style={{
                            padding: '7px 9px', borderRadius: 7, fontSize: 12,
                            border: chosen ? `2px solid ${C.accent}` : C.borderUI,
                            backgroundColor: chosen ? '#243b62' : C.bgButton, color: C.text, cursor: 'pointer',
                          }}>
                          Lv{card?.Level ?? '?'} {card?.CardName ?? num}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {([0, 1, 2] as const).map(zi => {
                // 🆕§5.3 `O-226`＝宣言したシグニは基本レベル0（上の表示行と同じ規則を必ず使う）。
                const signiLevel = declaredSigniOverride(my, summonCard?.CardName).levelZero
                  ? 0 : (parseInt(summonCard?.Level ?? '0') || 0);
                const zoneStack = my.field.signi[zi] ?? [];
                const isOccupied = zoneStack.length > 0;
                // 🆕§5.3 `O-147`＝ライズの配置先は2種類（場のシグニの上／空きシグニゾーン）。
                //   ⚠**空きゾーン型でも「通常召喚」ではない**（材料を払わないと出せない）。
                const riseBase = riseReq?.base;
                const riseOnField = riseBase?.kind === 'field';
                const riseOnEmpty = riseBase?.kind === 'empty';
                // ライズカード: 条件を満たす占有ゾーン（場型）／空きゾーン（空き型）のみ有効。
                // 🆕**多ゾーン消費型は「下敷きに選んだゾーン」だけが配置先になれる**
                //   （原文「どちらかのシグニがあるシグニゾーンに出す」＝選んだ材料の外へは出せない）。
                const riseConditionMet = riseBase?.kind === 'field'
                  ? (riseMultiField
                    ? riseFieldZones.some(f => f.zoneIndex === zi)
                    : (isOccupied && matchesRiseFilter(getCardNum(zoneStack.at(-1)!), riseBase.groups[0].filter, battleCardMap)))
                  : riseOnEmpty ? !isOccupied : false;
                // FORCE_PLACE_FRONT: 相手の該当シグニの正面ゾーンのみ配置可（正面が空いている場合のみ強制）
                const forcedFrontSummon = collectForcePlaceFrontZones(op, my, battleCardMap, effectsMap, !isMyTurn);
                const forcedBlocked = !riseReq && forcedFrontSummon.size > 0 && !forcedFrontSummon.has(zi);
                // ライズ: 下敷きになるシグニの分を引いて新シグニ分を加算（空きゾーン型は引くものが無い）。
                // 🆕**多ゾーン消費型は選んだ全ゾーンのトップを引く**（3体潰して1体出すのでリミットは大きく空く）。
                const consumedZones = riseOnField
                  ? (riseMultiField ? riseFieldZones.map(f => f.zoneIndex) : (isOccupied ? [zi] : []))
                  : [];
                const existingTopLevel = consumedZones.reduce((sum, cz) => {
                  const top = (my.field.signi[cz] ?? []).at(-1);
                  return sum + (top ? (parseInt(battleCardMap.get(getCardNum(top))?.Level ?? '0') || 0) : 0);
                }, 0);
                const afterTotal = fieldSigniTotal - existingTopLevel + signiLevel;
                const overLimit = afterTotal > lrigLimit;
                // DEPLOY_RESTRICT（配置パワー制限／配置数制限）は `engine/deployLimit.ts` に一本化
                // （通常召喚UI・このモーダル・CPU召喚・engine の効果配置が同じ関数を呼ぶ＝続き405）。
                const deployBlock = deployLimitBlockReason({
                  placingState: my, opponentState: op, cardNum: pendingSigniSummon.cardNum,
                  cardMap: battleCardMap, effectsMap, isPlacingOwnerTurn: isMyTurn,
                  onExistingStack: riseOnField,
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
                // ⚠**空きゾーン型ライズは「新たに配置」なので対象**（場型ライズだけが上乗せ＝対象外）。
                const zoneBlock = riseOnField ? undefined : findSigniZoneBlock(my, zi);
                const zoneBlockCost = zoneBlock?.colorless ?? 0;
                const zoneBlocked = !!zoneBlock && !resolveSigniZonePlacement(my, zi).allowed;
                const isDisabled = loading || overLimit || overPowerLimit || overCountLimit || forcedBlocked || zoneBlocked || zoneLevelBlocked ||
                  (riseReq
                    ? (!riseConditionMet || !riseMaterialsAvailable || !riseMaterialsReady
                      || !riseFieldAvailable || !riseFieldReady)
                    : isOccupied);
                // 🆕多ゾーン消費型は「まだ下敷きを選んでいない」だけのゾーンを「条件不一致」と描かない
                //   （選べば配置先になれるので、灰色にすると選ぶ手が止まる）。
                const zoneUnusable = riseReq
                  ? (riseMultiField ? (!isOccupied && !riseConditionMet) : !riseConditionMet)
                  : isOccupied;
                return (
                  <button key={zi} data-testid={`summon-zone-${zi}`}
                    onClick={() => !isDisabled && handleSummonSigni(pendingSigniSummon.handIndex, zi, undefined, riseSelection)}
                    disabled={isDisabled}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 8,
                      border: zoneUnusable ? `1px solid ${C.textFaint}` : (overLimit || overPowerLimit || overCountLimit || zoneBlocked || zoneLevelBlocked) ? `1px solid ${C.danger}` : C.borderUI,
                      backgroundColor: isDisabled ? C.disabled : C.bgButton,
                      color: isDisabled ? C.textFaint : C.text,
                      fontSize: 13, cursor: isDisabled ? 'default' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}>
                    <span>ゾーン{zi + 1}{riseReq ? (riseConditionMet ? ' (ライズ可)' : riseMultiField ? ' (未選択)' : ' (条件不一致)') : (zoneBlocked ? ' (配置禁止)' : forcedBlocked ? ' (正面強制)' : isOccupied ? ' (使用中)' : '')}</span>
                    <span style={{ fontSize: 11, color: zoneUnusable ? C.textFaint : (overLimit || overPowerLimit || overCountLimit || zoneBlocked) ? C.danger : C.textDim }}>
                      {riseReq
                        ? (!riseFieldAvailable ? '下敷き不足'
                          : !riseConditionMet ? (riseMultiField ? '下敷きに選ぶ' : '—')
                            : !riseFieldReady ? '下敷きを選択'
                              : !riseMaterialsAvailable ? '材料不足'
                                : !riseMaterialsReady ? '材料を選択'
                                  : 'ライズ')
                        : (zoneBlocked ? (zoneBlockCost > 0 ? `《無》×${zoneBlockCost}不足` : '配置禁止') : forcedBlocked ? '正面のみ' : isOccupied ? '—' : overCountLimit ? '配置数制限' : overPowerLimit ? 'パワー制限' : overLimit ? 'リミット超過' : zoneBlockCost > 0 ? `《無》×${zoneBlockCost}を支払う` : `${afterTotal}/${lrigLimit === Infinity ? '∞' : lrigLimit}`)}
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
