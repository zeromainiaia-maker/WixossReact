// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import type { PlayerState, PendingInteractionDef, TargetScope } from '../types';
import { parseCardEffects } from '../data/effectParser';
import type {
  EffectAction,
  StubAction,
  Owner,
  DrawAction,
  BanishAction,
  BounceAction,
  PowerModifyAction,
  TrashAction,
  EnergyChargeAction,
  ShuffleDeckAction,
  TransferToHandAction,
  TransferToDeckAction,
  AddToFieldAction,
  DownAction,
  SequenceAction,
  ChooseAction,
  AttachAcceAction,
  AddToEnergyAction,
  AddToHandAction,
  PlaceUnderSourceSigniAction,
} from '../types/effects';
import type { ExecCtx, ExecResult } from './execUtils';
import {
  done, addLog, needsInteraction, ownerState, setOwnerState,
  removeFromField, getCardNum, fieldCandidates, selectOrInteract, shuffle, canPayOptionalCost,
} from './execUtils';
import { LRIG_ALL_NAMES_SENTINEL } from './effectEngine';

export function execStub(
  stub: StubAction,
  ctx: ExecCtx,
  exec: (action: EffectAction, ctx: ExecCtx) => ExecResult,
): ExecResult {
  if (stub.id === 'PREVENT_NEXT_DAMAGE') {
    const newOwner = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newOwner }, '縺薙・繧ｿ繝ｼ繝ｳ縲∵ｬ｡縺ｮ繝繝｡繝ｼ繧ｸ繧・蝗樒┌蜉ｹ'));
  }
  if (stub.id === 'NEGATE_ATTACK_ON_TRIGGER') {
    // 逋ｺ蜍穂ｸｭ縺ｮ繧｢繧ｿ繝・け繧堤┌蜉ｹ蛹・ prevent_next_damage 縺ｨ蜷梧ｧ倥・繝輔Λ繧ｰ縺ｧ霑台ｼｼ
    const newOwner = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newOwner }, '繧｢繧ｿ繝・け繧堤┌蜉ｹ縺ｫ縺吶ｋ'));
  }
  // 繧ｲ繝ｼ繝繝励Ξ繧､縺ｫ蠖ｱ髻ｿ縺励↑縺・ｪｬ譏弱ユ繧ｭ繧ｹ繝医・辟｡髻ｳ縺ｧ繧ｹ繧ｭ繝・・
  if (stub.id === 'RULE_REMINDER_TEXT' || stub.id === 'USE_CONDITION_TEXT') {
    return done(ctx);
  }
  // OPTIONAL_COST: 莉ｻ諢上さ繧ｹ繝茨ｼ・ffectExecutor縺ｮSEQUENCE繧､繝ｳ繧ｿ繝ｼ繧ｻ繝励ヨ蟇ｾ雎｡螟悶・繧ｨ繝・ず繧ｱ繝ｼ繧ｹ・・  // 荳ｻ縺ｪ338莉ｶ縺ｯeffectExecutor.ts縺郡TUB竊辰ONDITIONAL(IS_MY_TURN)繝代ち繝ｼ繝ｳ繧貞・逅・ｸ医∩
  // 縺薙％縺ｯSEQUENCE譛ｫ蟆ｾ繧・撼IS_MY_TURN繝代ち繝ｼ繝ｳ縺ｮ33莉ｶ縺ｻ縺ｩ繧呈球蠖・  if (stub.id === 'OPTIONAL_COST') {
    const costColorsOC = stub.costColors ?? [];
    const canAffordOC = costColorsOC.length === 0 || canPayOptionalCost(costColorsOC, ctx.ownerState, ctx.cardMap);
    const payLabelOC = costColorsOC.length > 0
      ? `逋ｺ蜍輔☆繧具ｼ・{costColorsOC.map(c => `縲・{c}縲義).join('')}・荏
      : '逋ｺ蜍輔☆繧・;
    const noopOC: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, '莉ｻ諢上さ繧ｹ繝茨ｼ夂匱蜍輔＠縺ｾ縺吶°・・), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'pay',  label: payLabelOC, action: noopOC as EffectAction, available: canAffordOC,
          ...(costColorsOC.length ? { costColors: costColorsOC } : {}) },
        { id: 'skip', label: '繧ｹ繧ｭ繝・・',  action: noopOC as EffectAction, available: true },
      ],
    });
  }
  // 莉悶・莉ｻ諢上さ繧ｹ繝育ｳｻ・・EQUENCE繝代ち繝ｼ繝ｳ螟悶・繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ・・  if (stub.id === 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST' || stub.id === 'OPTIONAL_TRASH_ENERGY_CLASS') {
    return done(addLog(ctx, `莉ｻ諢上さ繧ｹ繝茨ｼ・{stub.id}・壼ｾ檎ｶ壹せ繝・ャ繝励〒蜃ｦ逅・ｼ荏));
  }
  // 蟇ｾ謌ｦ逶ｸ謇倶ｻｻ諢上さ繧ｹ繝茨ｼ育嶌謇九↓CHOOSE繧呈署遉ｺ縺励∵髪謇輔≧縺ｨ繝輔Λ繧ｰ繧堤ｫ九※繧具ｼ・  if (stub.id === 'OPPONENT_PAY_OPTIONAL') {
    const costLen = stub.costColors?.length ?? 0;
    if (costLen === 0 || ctx.otherState.energy.length < costLen) {
      const newOwner = { ...ctx.ownerState, opponent_paid_optional_cost: false };
      return done(addLog({ ...ctx, ownerState: newOwner }, `蟇ｾ謌ｦ逶ｸ謇倶ｻｻ諢上さ繧ｹ繝茨ｼ壽髪謇穂ｸ榊庄・・{costLen}辟｡濶ｲ荳崎ｶｳ・荏));
    }
    const payAction: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_PAY_COST', value: costLen };
    const skipAction: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_SKIP_COST' };
    const opts = [
      { id: 'pay',  label: `謾ｯ謇輔≧・育┌ﾃ・{costLen}・荏, action: payAction  as EffectAction, available: true },
      { id: 'skip', label: '謾ｯ謇輔ｏ縺ｪ縺・,               action: skipAction as EffectAction, available: true },
    ];
    return needsInteraction(addLog(ctx, `蟇ｾ謌ｦ逶ｸ謇具ｼ壹顔┌ﾃ・{costLen}縲九ｒ謾ｯ謇輔＞縺ｾ縺吶°・歔), {
      type: 'CHOOSE', options: opts, count: 1, opponentResponds: true,
    });
  }
  if (stub.id === 'INTERNAL_OPP_PAY_COST') {
    const costLen = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const newOther = { ...ctx.otherState, energy: ctx.otherState.energy.slice(costLen) };
    const newOwner = { ...ctx.ownerState, opponent_paid_optional_cost: true };
    return done(addLog({ ...ctx, ownerState: newOwner, otherState: newOther },
      `蟇ｾ謌ｦ逶ｸ謇九′縲顔┌ﾃ・{costLen}縲九ｒ謾ｯ謇輔▲縺滂ｼ育ｵ先棡蜉ｹ譫懊せ繧ｭ繝・・・荏));
  }
  if (stub.id === 'INTERNAL_OPP_SKIP_COST') {
    const newOwner = { ...ctx.ownerState, opponent_paid_optional_cost: false };
    return done(addLog({ ...ctx, ownerState: newOwner }, '蟇ｾ謌ｦ逶ｸ謇九′謾ｯ謇輔ｏ縺ｪ縺・・邨先棡蜉ｹ譫懃匱蜍・));
  }
  // 繧｢繝ｼ繝・さ繧ｹ繝郁ｻｽ貂帙・繝ｼ繧ｫ繝ｼ・医さ繧ｹ繝医・BattleScreen菴ｿ逕ｨ譎ゅ↓邂怜・貂医∩・・  if (stub.id === 'ARTS_COST_REDUCTION_BY_EFFECT' || stub.id === 'ARTS_COST_REDUCTION_BY_CENTER_LRIG') {
    return done(ctx); // 繧ｳ繧ｹ繝医・謾ｯ謇輔＞譎らせ縺ｧ險育ｮ玲ｸ医∩縲√％縺薙〒縺ｯ菴輔ｂ縺励↑縺・  }
  // 謨ｰ蟄怜ｮ｣險・夂樟蝨ｨ縺ｯ繝ｩ繝ｳ繝繝蛟､縺ｧ莉｣逕ｨ
  if (stub.id === 'DECLARE_NUMBER') {
    // 螳｣險縺励◆謨ｰ蟄励ｒPlayerState縺ｫ菫晏ｭ倥☆繧鬼ET繧｢繧ｯ繧ｷ繝ｧ繝ｳ繧貞推驕ｸ謚櫁い縺ｫ
    const setAction = (n: number): StubAction => ({
      type: 'STUB', id: 'SET_DECLARED_NUMBER', value: n,
    });
    const options = [1, 2, 3, 4, 5].map(n => ({
      id: `num_${n}`, label: `${n}繧貞ｮ｣險`, action: setAction(n) as EffectAction, available: true,
    }));
    const pending: PendingInteractionDef = { type: 'CHOOSE', options, count: 1 };
    return needsInteraction(addLog(ctx, '謨ｰ蟄励ｒ螳｣險縺励※縺上□縺輔＞・・縲・・・), pending);
  }
  // DECLARE_NUMBER 縺ｮ螳｣險蛟､繧・PlayerState 縺ｫ譬ｼ邏・  if (stub.id === 'SET_DECLARED_NUMBER') {
    const val = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const newOwner = { ...ctx.ownerState, declared_guard_restrict_level: val };
    return done(addLog({ ...ctx, ownerState: newOwner }, `謨ｰ蟄励・{val}縲阪ｒ螳｣險・育嶌謇九・Lv${val}繧ｷ繧ｰ繝九〒繧ｬ繝ｼ繝我ｸ榊庄・荏));
  }
  // 繧ｫ繝ｼ繝牙錐螳｣險・域焔譛ｭ縺ｮ繧ｫ繝ｼ繝牙錐縺九ｉ驕ｸ謚橸ｼ・  if (stub.id === 'DECLARE_CARD_NAME') {
    const handNames = [...new Set(
      ctx.ownerState.hand.map(cn => ctx.cardMap.get(cn)?.CardName).filter(Boolean) as string[]
    )];
    if (handNames.length === 0) {
      const newOwnerDCN = { ...ctx.ownerState, declared_card_name: '繧ｷ繧ｰ繝・ };
      return done(addLog({ ...ctx, ownerState: newOwnerDCN }, '縲後す繧ｰ繝九阪ｒ螳｣險・域焔譛ｭ縺ｪ縺暦ｼ・));
    }
    const optsDCN = handNames.slice(0, 4).map(name => ({
      id: 'name_' + name,
      label: name,
      action: ({ type: 'STUB', id: 'INTERNAL_DECLARE_CARD_NAME', value: name } as StubAction) as EffectAction,
      available: true,
    }));
    const pendingDCN: PendingInteractionDef = { type: 'CHOOSE', options: optsDCN, count: 1 };
    return needsInteraction(addLog(ctx, '繧ｫ繝ｼ繝牙錐繧貞ｮ｣險・域焔譛ｭ縺ｮ繧ｫ繝ｼ繝牙錐縺九ｉ驕ｸ謚橸ｼ・), pendingDCN);
  }
  if (stub.id === 'INTERNAL_DECLARE_CARD_NAME') {
    const nameDCN = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const newOwnerIDCN = { ...ctx.ownerState, declared_card_name: nameDCN };
    return done(addLog({ ...ctx, ownerState: newOwnerIDCN }, `縲・{nameDCN}縲阪ｒ螳｣險`));
  }
  // 繧ｷ繧ｰ繝九・荳九↓繧ｫ繝ｼ繝峨ｒ鄂ｮ縺・  if (stub.id === 'PLACE_CARD_UNDER_SIGNI' || stub.id === 'STACK_SIGNI_UNDER') {
    const srcPCUS = ctx.sourceCardNum;
    const effPCUS = srcPCUS ? ctx.cardMap.get(srcPCUS) : undefined;
    const txtPCUS = effPCUS ? (effPCUS.EffectText ?? '') + ' ' + (effPCUS.BurstText ?? '') : '';
    // 縲後％縺ｮ繧ｷ繧ｰ繝九ｒ莉悶・繧ｷ繧ｰ繝九・荳九↓鄂ｮ縺上阪ヱ繧ｿ繝ｼ繝ｳ
    if (txtPCUS.match(/縺薙・繧ｷ繧ｰ繝九ｒ.+縺ｮ荳九↓鄂ｮ縺・) && srcPCUS) {
      const srcZonePCUS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcPCUS);
      if (srcZonePCUS < 0) return done(addLog(ctx, '縺薙・繧ｷ繧ｰ繝九′蝣ｴ縺ｫ縺・↑縺・));
      const candidatesPCUS = [0, 1, 2]
        .filter(zi => zi !== srcZonePCUS && ctx.ownerState.field.signi[zi]?.length)
        .map(zi => ctx.ownerState.field.signi[zi]!.at(-1)!)
        .filter(Boolean);
      if (candidatesPCUS.length === 0) return done(addLog(ctx, '驟咲ｽｮ蜈医す繧ｰ繝九↑縺・));
      const placeUnderStub: StubAction = { type: 'STUB', id: 'INTERNAL_PLACE_SELF_UNDER_SIGNI' };
      return selectOrInteract(candidatesPCUS, 1, false, 'self_field', placeUnderStub, undefined, ctx);
    }
    // 縲後ヨ繝ｩ繝・す繝･縺九ｉ繧ｫ繝ｼ繝峨ｒ縺薙・繧ｷ繧ｰ繝九・荳九↓鄂ｮ縺上阪ヱ繧ｿ繝ｼ繝ｳ・・astProcessedCards繧剃ｽｿ逕ｨ・・    if (ctx.lastProcessedCards && ctx.lastProcessedCards.length > 0 && srcPCUS) {
      const targetZonePCUS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcPCUS);
      if (targetZonePCUS < 0) return done(addLog(ctx, '縺薙・繧ｷ繧ｰ繝九′蝣ｴ縺ｫ縺・↑縺・));
      const newSigniPCUS = [...ctx.ownerState.field.signi] as (string[] | null)[];
      const currentStackPCUS = newSigniPCUS[targetZonePCUS] ?? [];
      newSigniPCUS[targetZonePCUS] = [...ctx.lastProcessedCards, ...currentStackPCUS];
      const newOwnerPCUS: PlayerState = {
        ...ctx.ownerState,
        trash: ctx.ownerState.trash.filter(cn => !ctx.lastProcessedCards!.includes(cn)),
        field: { ...ctx.ownerState.field, signi: newSigniPCUS },
      };
      return done(addLog({ ...ctx, ownerState: newOwnerPCUS },
        `${ctx.lastProcessedCards.length}譫壹ｒ${effPCUS?.CardName ?? srcPCUS}縺ｮ荳九↓驟咲ｽｮ`));
    }
    return done(addLog(ctx, '繧ｫ繝ｼ繝峨ｒ繧ｷ繧ｰ繝九・荳九↓鄂ｮ縺擾ｼ医せ繧ｭ繝・・・・));
  }
  // INTERNAL_PLACE_SELF_UNDER_SIGNI: 閾ｪ繧ｷ繧ｰ繝九ｒ驕ｸ謚槭す繧ｰ繝九・繧ｹ繧ｿ繝・け荳九↓遘ｻ蜍・  if (stub.id === 'INTERNAL_PLACE_SELF_UNDER_SIGNI') {
    const targetCnIPSUS = ctx.lastProcessedCards?.[0];
    const srcCnIPSUS = ctx.sourceCardNum;
    if (!targetCnIPSUS || !srcCnIPSUS) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺・));
    const srcZoneIPSUS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcCnIPSUS);
    const targetZoneIPSUS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === targetCnIPSUS);
    if (srcZoneIPSUS < 0 || targetZoneIPSUS < 0) return done(addLog(ctx, '繧ｾ繝ｼ繝ｳ迚ｹ螳壻ｸ榊庄'));
    const newSigniIPSUS = [...ctx.ownerState.field.signi] as (string[] | null)[];
    // sourceCardNum繧貞・繧ｾ繝ｼ繝ｳ縺九ｉ蜑企勁・医せ繧ｿ繝・け縺ｮ譛蠕後□縺大叙繧雁・縺呻ｼ・    const srcStackIPSUS = newSigniIPSUS[srcZoneIPSUS] ?? [];
    newSigniIPSUS[srcZoneIPSUS] = srcStackIPSUS.length > 1 ? srcStackIPSUS.slice(0, -1) : null;
    // target繧ｾ繝ｼ繝ｳ縺ｮ繧ｹ繧ｿ繝・け譛荳矩Κ縺ｫ霑ｽ蜉
    newSigniIPSUS[targetZoneIPSUS] = [srcCnIPSUS, ...(newSigniIPSUS[targetZoneIPSUS] ?? [])];
    const newOwnerIPSUS: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniIPSUS } };
    return done(addLog({ ...ctx, ownerState: newOwnerIPSUS },
      `${ctx.cardMap.get(srcCnIPSUS)?.CardName ?? srcCnIPSUS}繧・{ctx.cardMap.get(targetCnIPSUS)?.CardName ?? targetCnIPSUS}縺ｮ荳九↓驟咲ｽｮ`));
  }
  // 隕夐・繝｡繧ｫ繝九け繧ｹ・医Ν繝ｪ繧ｰ螟芽ｺｫ・・  if (stub.id === 'AWAKEN') {
    return done(addLog(ctx, '縲占ｦ夐・縲醍匱蜍包ｼ・attleScreen蛛ｴ蜃ｦ逅・ｼ・));
  }
  // BET_MECHANIC: 繧ｳ繧､繝ｳ繧呈ｶ郁ｲｻ縺励※繝吶ャ繝遺・蠑ｷ蛹夜∈謚橸ｼ遺蔵竭｡竭｢竭｣縺九ｉ2縺､縲√・繝・ヨ譎・縺､・・  if (stub.id === 'BET_MECHANIC') {
    const srcBET = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtBET = srcBET ? (srcBET.EffectText ?? '') + ' ' + (srcBET.BurstText ?? '') : '';
    const toHWBET = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 竭竭｡竭｢竭｣ 驕ｸ謚櫁い繧定ｧ｣譫・    const choicePatsBET = [
      { m: /竭([^竭｡竭｢竭｣]+)/, idx: 0 }, { m: /竭｡([^竭｢竭｣竭､]+)/, idx: 1 },
      { m: /竭｢([^竭｣竭､]+)/, idx: 2 }, { m: /竭｣([^竭､]+)/, idx: 3 },
    ];
    const parseChoiceBET = (txt: string): Array<{ id: string; label: string; action: EffectAction; available: boolean }> => {
      const opts: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
      for (const { m, idx } of choicePatsBET) {
        const mat = txt.match(m);
        if (!mat) continue;
        const ctxt = mat[1].replace(/縲・s*$/, '').trim();
        let act: EffectAction | null = null;
        if (ctxt.match(/繧ｫ繝ｼ繝峨ｒ[・・]譫壼ｼ輔￥/)) act = { type: 'DRAW', count: 1 } as DrawAction;
        if (!act && ctxt.match(/謇区惆繧端・・]譫壽昏縺ｦ繧・)) act = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as TrashAction;
        if (!act && ctxt.match(/蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝・*謇区惆縺ｫ謌ｻ縺・)) act = { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BounceAction;
        const pwBET = !act && ctxt.match(/繝代Ρ繝ｼ繧・[・・][・・・兔d]+)縺吶ｋ/);
        if (pwBET) act = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_OPP_ONE', value: parseInt(toHWBET(pwBET[1]).replace('・・,'-')) } as StubAction) as EffectAction;
        if (!act && ctxt.match(/蟇ｾ謌ｦ逶ｸ謇九・謇区惆繧端・・]譫壽昏縺ｦ繧・)) act = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as TrashAction;
        if (!act && ctxt.match(/繝繧ｦ繝ｳ縺吶ｋ/)) act = { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as DownAction;
        if (act) opts.push({ id: `bet_c${idx}`, label: `${'竭竭｡竭｢竭｣'[idx]}${ctxt.slice(0, 18)}...`, action: act, available: true });
      }
      return opts;
    };
    const optsBET = parseChoiceBET(txtBET);
    if (optsBET.length === 0) return done(addLog(ctx, '繝吶ャ繝茨ｼ磯∈謚櫁い隗｣譫蝉ｸ榊庄・・));
    // COIN_USE_RESTRICTION: 繧ｳ繧､繝ｳ繧偵せ繝壹Ν縺ｨ繧ｷ繧ｰ繝九↓縺励°菴ｿ縺医↑縺・ｴ蜷医√い繝ｼ繝ВET縺ｯ荳榊庄
    const coinRestricted = ctx.ownerState.coin_use_restriction === 'spell_signi_only';
    // NEGATE_COIN_ABILITY: 縺薙・繧ｿ繝ｼ繝ｳ閾ｪ蛻・・繧ｳ繧､繝ｳ閭ｽ蜉帙・菴ｿ縺医↑縺・    const coinNegated = ctx.ownerState.negate_coin_abilities === true;
    const hasCoins = ctx.ownerState.coins > 0 && !coinRestricted && !coinNegated;
    // 繧ｳ繧､繝ｳ縺後≠繧句ｴ蜷医・繝吶ャ繝磯∈謚槭ｒ謠千､ｺ
    if (hasCoins) {
      const noopBET: SequenceAction = { type: 'SEQUENCE', steps: [] };
      const betYesOpt = { id: 'bet_yes', label: `繝吶ャ繝医☆繧具ｼ医さ繧､繝ｳ豸郁ｲｻ繝ｻ4謚橸ｼ荏, action: ({ type: 'STUB', id: 'INTERNAL_BET_SHOW_4', value: txtBET } as StubAction) as EffectAction, available: true };
      const betNoOpt = { id: 'bet_no', label: '繝吶ャ繝医＠縺ｪ縺・ｼ・謚橸ｼ・, action: noopBET as EffectAction, available: true };
      const pendingBetQ: PendingInteractionDef = {
        type: 'CHOOSE', options: [betYesOpt, betNoOpt], count: 1,
        continuation: optsBET.length > 0 ? ({ type: 'CHOOSE', options: optsBET, count: Math.min(2, optsBET.length) } as unknown as EffectAction) : undefined,
      };
      return needsInteraction(addLog(ctx, '繝吶ャ繝医＠縺ｾ縺吶°・滂ｼ医さ繧､繝ｳ繧呈ｶ郁ｲｻ縺励※4謚樞・蠑ｷ蛹厄ｼ・), pendingBetQ);
    }
    // 繧ｳ繧､繝ｳ縺ｪ縺暦ｼ夐壼ｸｸ2謚・    return needsInteraction(addLog(ctx, '繝吶ャ繝茨ｼ医さ繧､繝ｳ縺ｪ縺暦ｼ俄・2謚・), {
      type: 'CHOOSE', options: optsBET, count: Math.min(2, optsBET.length),
    });
  }
  // INTERNAL_BET_SHOW_4: 繝吶ャ繝域凾縺ｫ4謚槭ｒ陦ｨ遉ｺ
  if (stub.id === 'INTERNAL_BET_SHOW_4') {
    const txtIBET = typeof stub.value === 'string' ? stub.value : '';
    const toHWIBET = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const choicePatsIBET = [
      { m: /竭([^竭｡竭｢竭｣]+)/, idx: 0 }, { m: /竭｡([^竭｢竭｣竭､]+)/, idx: 1 },
      { m: /竭｢([^竭｣竭､]+)/, idx: 2 }, { m: /竭｣([^竭､]+)/, idx: 3 },
    ];
    const optsIBET: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of choicePatsIBET) {
      const mat = txtIBET.match(m);
      if (!mat) continue;
      const ctxt = mat[1].replace(/縲・s*$/, '').trim();
      let act: EffectAction | null = null;
      if (ctxt.match(/繧ｫ繝ｼ繝峨ｒ[・・]譫壼ｼ輔￥/)) act = { type: 'DRAW', count: 1 } as DrawAction;
      if (!act && ctxt.match(/蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝・*謇区惆縺ｫ謌ｻ縺・)) act = { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BounceAction;
      const pwIBET = !act && ctxt.match(/繝代Ρ繝ｼ繧・[・・][・・・兔d]+)縺吶ｋ/);
      if (pwIBET) act = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_OPP_ONE', value: parseInt(toHWIBET(pwIBET[1]).replace('・・,'-')) } as StubAction) as EffectAction;
      if (!act && ctxt.match(/謇区惆繧端・・]譫壽昏縺ｦ繧弓蟇ｾ謌ｦ逶ｸ謇九・謇区惆繧端・・]譫壽昏縺ｦ繧・)) act = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as TrashAction;
      if (!act && ctxt.match(/繝繧ｦ繝ｳ縺吶ｋ/)) act = { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as DownAction;
      if (act) optsIBET.push({ id: `ibet_c${idx}`, label: `${'竭竭｡竭｢竭｣'[idx]}${ctxt.slice(0,18)}...`, action: act, available: true });
    }
    // 繧ｳ繧､繝ｳ繧・譫壽ｶ郁ｲｻ
    const newOwnerIBET = { ...ctx.ownerState, coins: Math.max(0, ctx.ownerState.coins - 1) };
    if (optsIBET.length === 0) return done(addLog({ ...ctx, ownerState: newOwnerIBET }, '繝吶ャ繝・謚橸ｼ郁ｧ｣譫蝉ｸ榊庄・・));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerIBET }, `繝吶ャ繝茨ｼ√さ繧､繝ｳ豸郁ｲｻ竊・謚杼), {
      type: 'CHOOSE', options: optsIBET, count: Math.min(4, optsIBET.length),
    });
  }
  // BET_ALTERNATIVE: 繝吶ャ繝亥ｼｷ蛹匁ｸ医∩縺ｪ縺ｮ縺ｧ繧ｹ繧ｭ繝・・・・ET_MECHANIC縺ｧ蜃ｦ逅・ｸ医∩・・  if (stub.id === 'BET_ALTERNATIVE' || stub.id === 'BET_CONDITION') {
    return done(addLog(ctx, '繝吶ャ繝亥ｼｷ蛹厄ｼ・ET_MECHANIC縺ｧ蜃ｦ逅・ｸ医∩・・));
  }
  // GRANT_QUOTED_ACTIVATE_ABILITY: 縲後占ｵｷ縲・..縲堺ｻ倅ｸ趣ｼ・ONTINUOUS縺ｯeffectEngine縺ｧ蜃ｦ逅・、UTO縺ｯ蜊ｳ譎りｨｭ螳夲ｼ・  if (stub.id === 'GRANT_QUOTED_ACTIVATE_ABILITY') {
    const srcGQAA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGQAA = srcGQAA ? (srcGQAA.EffectText ?? '') : '';
    // 縲後す繧ｰ繝九・繝ｬ繝吶Ν・代↓縺､縺搾ｼ康000縺吶ｋ縲阪ち繧､繝・竊・POWER_MODIFY_PER_LEVEL_SUM邉ｻ
    const perLevelM = txtGQAA.match(/繝ｬ繝吶Ν[・・]縺ｫ縺､縺・[・・][・・・兔d]+)/);
    if (perLevelM) {
      return done(addLog(ctx, `[GRANT_QUOTED_ACTIVATE_ABILITY: 襍ｷ蜍戊・蜉帑ｻ倅ｸ趣ｼ医Ξ繝吶Ν豈比ｾ九ヱ繝ｯ繝ｼ-・韻ONTINUOUS縺ｧ蜃ｦ逅・`));
    }
    // 縲鯉ｼ貞搾ｼ阪＆繧後ｋ縲阪ち繧､繝・竊・DOUBLE_OWN_POWER_MINUS莉倅ｸ・    if (txtGQAA.match(/莉｣繧上ｊ縺ｫ・貞搾ｼ・)) {
      return done(addLog(ctx, `[GRANT_QUOTED_ACTIVATE_ABILITY: 2蛟阪ヱ繝ｯ繝ｼ-襍ｷ蜍戊・蜉帑ｻ倅ｸ趣ｼ・ONTINUOUS縺ｧ蜃ｦ逅・ｼ云`));
    }
    // 縺昴・莉厄ｼ医Ο繧ｰ縺ｮ縺ｿ・・    const quotedActM = txtGQAA.match(/縲・縲占ｵｷ縲措^縲江{1,30})/);
    return done(addLog(ctx, `襍ｷ蜍戊・蜉帑ｻ倅ｸ趣ｼ壹・{quotedActM?.[1] ?? '?'}...縲港));
  }
  // 蠑慕畑隨ｦ莉倥″閭ｽ蜉帑ｻ倅ｸ趣ｼ医く繝ｼ繝ｯ繝ｼ繝・竊・keyword_grants縲∬､・粋閭ｽ蜉・竊・granted_effects・・  if (stub.id === 'GRANT_QUOTED_AUTO_ABILITY' || stub.id === 'GRANT_QUOTED_ABILITY' ||
      stub.id === 'GRANT_ABILITY_INNER_TEXT') {
    const srcGQ = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGQ = srcGQ ? (srcGQ.EffectText ?? '') + ' ' + (srcGQ.BurstText ?? '') : '';
    // 莉倅ｸ弱☆繧九く繝ｼ繝ｯ繝ｼ繝峨ｒ謚ｽ蜃ｺ・医Λ繝ｳ繧ｵ繝ｼ縲√ム繝悶Ν繧ｯ繝ｩ繝・す繝･遲会ｼ・    const knownKeywords = ['S繝ｩ繝ｳ繧ｵ繝ｼ', '繝ｩ繝ｳ繧ｵ繝ｼ', '繝繝悶Ν繧ｯ繝ｩ繝・す繝･', '雋ｫ騾・, '繝槭Ν繝√お繝・, '繧｢繧ｵ繧ｷ繝ｳ', '繝舌ル繝・す繝･辟｡蜉ｹ', '繝ｩ繧､繝輔ヰ繝ｼ繧ｹ繝育┌蜉ｹ', '蠖ｱ', '繝√Ε繝ｼ繝', '繧ｷ繝｣繝峨え', '繧ｬ繝ｼ繝峨い繧､繧ｳ繝ｳ', '繧｢繧ｿ繝・け縺ｧ縺阪↑縺・, '繝輔Μ繝ｼ繧ｺ', '繝峨Λ繧､繝・];
    // 蠑慕畑隨ｦ蜀・・繝・く繧ｹ繝医ｒ謚ｽ蜃ｺ
    const quotedM = txtGQ.match(/縲・[^縲江+)縲・?:縺ｮ閭ｽ蜉・?(?:繧貞ｾ励ｋ|縺ｨ縺励※謇ｱ縺・/) ?? txtGQ.match(/縲・[^縲曽+)縲代ｒ蠕励ｋ/);
    const quotedText = quotedM ? quotedM[1] : '';
    const grantedKws = knownKeywords.filter(kw => quotedText.includes(kw) || txtGQ.match(new RegExp(`縲・{kw}縲代ｒ蠕輿)));
    // 蟇ｾ雎｡繧ｷ繧ｰ繝九ｒ豎ｺ螳夲ｼ・ELECT_TARGET蠕後・lastProcessedCards縲√後％縺ｮ繧ｷ繧ｰ繝九坂・sourceCardNum縲∝・菴凪・蜈ｨ閾ｪ繧ｷ繧ｰ繝具ｼ・    const allM = txtGQ.match(/縺ゅ↑縺溘・繧ｷ繧ｰ繝九☆縺ｹ縺ｦ縺ｯ|縺ゅ↑縺溘・蝣ｴ縺ｫ縺ゅｋ縺吶∋縺ｦ縺ｮ繧ｷ繧ｰ繝・);
    const targetCardNums: string[] = ctx.lastProcessedCards && ctx.lastProcessedCards.length > 0
      ? ctx.lastProcessedCards
      : allM
        ? ctx.ownerState.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : [])
        : (ctx.sourceCardNum ? [ctx.sourceCardNum] : []);

    // 繧ｷ繝ｳ繝励Ν繧ｭ繝ｼ繝ｯ繝ｼ繝我ｻ倅ｸ・    if (grantedKws.length > 0 && targetCardNums.length > 0) {
      const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
      for (const cn of targetCardNums) {
        grants[cn] = [...new Set([...(grants[cn] ?? []), ...grantedKws])];
      }
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grants } },
        `${grantedKws.join('繝ｻ')}繧剃ｻ倅ｸ趣ｼ・{targetCardNums.length}菴難ｼ荏));
    }

    // 譌｢遏･縺ｮCONTINUOUS閭ｽ蜉帙ヱ繧ｿ繝ｼ繝ｳ繧・granted_effects 縺ｫ譬ｼ邏・    if (targetCardNums.length > 0 && quotedText) {
      // 縲悟ｯｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝九・蜉ｹ譫懊ｒ蜿励￠縺ｪ縺・坂・ GRANT_PROTECTION (CONTINUOUS)
      if (quotedText.includes('蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝九・蜉ｹ譫懊ｒ蜿励￠縺ｪ縺・)) {
        const grantedEff: import('../types/effects').CardEffect = {
          effectId: `granted-signi-protect-${Date.now()}`,
          effectType: 'CONTINUOUS',
          duration: 'UNTIL_END_OF_TURN',
          action: {
            type: 'GRANT_PROTECTION',
            from: ['繧ｷ繧ｰ繝・],
            sourceOwner: 'opponent',
            duration: 'UNTIL_END_OF_TURN',
          } as import('../types/effects').GrantProtectionAction,
        };
        const grantedMap = { ...(ctx.ownerState.granted_effects ?? {}) };
        for (const cn of targetCardNums) {
          grantedMap[cn] = [...(grantedMap[cn] ?? []), grantedEff];
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, granted_effects: grantedMap } },
          `逶ｸ謇九す繧ｰ繝句柑譫懆先ｧ繧剃ｻ倅ｸ趣ｼ・{targetCardNums.length}菴難ｼ荏));
      }
      // 縲悟ｯｾ謌ｦ逶ｸ謇九・蜉ｹ譫懊ｒ蜿励￠縺ｪ縺・搾ｼ医す繧ｰ繝九・繧ｹ繝壹Ν繝ｻ繧｢繝ｼ繝・☆縺ｹ縺ｦ・・      if (quotedText.match(/蟇ｾ謌ｦ逶ｸ謇九・(?:繧ｫ繝ｼ繝峨・)?蜉ｹ譫懊ｒ蜿励￠縺ｪ縺・)) {
        const grantedEff: import('../types/effects').CardEffect = {
          effectId: `granted-all-protect-${Date.now()}`,
          effectType: 'CONTINUOUS',
          duration: 'UNTIL_END_OF_TURN',
          action: {
            type: 'GRANT_PROTECTION',
            from: ['繧ｷ繧ｰ繝・, '繧ｹ繝壹Ν', '繧｢繝ｼ繝・],
            sourceOwner: 'opponent',
            duration: 'UNTIL_END_OF_TURN',
          } as import('../types/effects').GrantProtectionAction,
        };
        const grantedMap = { ...(ctx.ownerState.granted_effects ?? {}) };
        for (const cn of targetCardNums) {
          grantedMap[cn] = [...(grantedMap[cn] ?? []), grantedEff];
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, granted_effects: grantedMap } },
          `逶ｸ謇句柑譫懆先ｧ繧剃ｻ倅ｸ趣ｼ・{targetCardNums.length}菴難ｼ荏));
      }
    }

    if (quotedText) return done(addLog(ctx, `閭ｽ蜉帑ｻ倅ｸ趣ｼ壹・{quotedText.slice(0, 20)}...縲搾ｼ医Ο繧ｰ縺ｮ縺ｿ・荏));
    return done(addLog(ctx, '閭ｽ蜉帙ｒ莉倅ｸ趣ｼ・ffectEngine蜃ｦ逅・ｼ・));
  }
  // 繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ荳区桃菴懶ｼ亥､壹ヱ繧ｿ繝ｼ繝ｳ・・  if (stub.id === 'LRIG_UNDER_CARD_OP') {
    const srcLrig = ctx.sourceCardNum;
    const effLrigTxt = srcLrig ? (ctx.cardMap.get(srcLrig)?.EffectText ?? '') + ' ' + (ctx.cardMap.get(srcLrig)?.BurstText ?? '') : '';
    // 縲後お繝翫だ繝ｼ繝ｳ縺九ｉ繧ｷ繧ｰ繝九ｒ繝・ャ繧ｭ縺ｮ荳逡ｪ荳翫↓鄂ｮ縺上坂・ 繧ｨ繝岩・繝・ャ繧ｭ蜈磯ｭ
    if (effLrigTxt.match(/繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ.+繧ｷ繧ｰ繝・+繝・ャ繧ｭ縺ｮ荳逡ｪ荳翫↓鄂ｮ縺・※繧ゅｈ縺・) && ctx.ownerState.energy.length > 0) {
      const signiInEnergy = ctx.ownerState.energy.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
      if (signiInEnergy.length > 0) {
        const picked = signiInEnergy[0];
        const newOwner = {
          ...ctx.ownerState,
          energy: ctx.ownerState.energy.filter(cn => cn !== picked),
          deck: [picked, ...ctx.ownerState.deck],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(picked)?.CardName ?? picked}繧偵お繝翫°繧峨ョ繝・く荳翫∈`));
      }
      return done(addLog(ctx, '繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ繧ｷ繧ｰ繝九↑縺・));
    }
    // 縲後％縺ｮ繧ｷ繧ｰ繝九ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ鄂ｮ縺上坂・ 繝輔ぅ繝ｼ繝ｫ繝峨°繧峨お繝翫∈
    if ((effLrigTxt.match(/縺薙・繧ｷ繧ｰ繝九ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ鄂ｮ縺・※繧ゅｈ縺・) || effLrigTxt.match(/縺薙・繧ｷ繧ｰ繝九ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ鄂ｮ縺・)) && srcLrig) {
      const removed = removeFromField(srcLrig, ctx.ownerState);
      const newOwner = { ...removed, energy: [...removed.energy, srcLrig] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcLrig)?.CardName ?? srcLrig}繧偵お繝翫だ繝ｼ繝ｳ縺ｸ`));
    }
    // 縲後％縺ｮ繧ｷ繧ｰ繝九・荳九↓縺ゅｋ縺吶∋縺ｦ縺ｮ繧ｫ繝ｼ繝峨ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺上阪ヱ繧ｿ繝ｼ繝ｳ
    if (srcLrig) {
      for (const owner of ['self', 'opponent'] as const) {
        const st = ownerState(owner, ctx);
        for (let zi = 0; zi < 3; zi++) {
          const stack = st.field.signi[zi];
          if (!stack || stack.length < 2) continue;
          if (stack.at(-1) === srcLrig) {
            const underCards = stack.slice(0, -1);
            const newSigni = [...st.field.signi] as (string[] | null)[];
            newSigni[zi] = [srcLrig];
            const newS: PlayerState = {
              ...st,
              field: { ...st.field, signi: newSigni },
              trash: [...st.trash, ...underCards],
            };
            return done(addLog(setOwnerState(owner, newS, ctx), `繧ｷ繧ｰ繝倶ｸ・{underCards.length}譫壹ｒ繝医Λ繝・す繝･縺ｸ`));
          }
        }
      }
    }
    return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ荳九・繧ｫ繝ｼ繝画桃菴・));
  }
  // 繧｢繝ｳ繧ｳ繝ｼ繝ｫ繝｡繧ｫ繝九け繧ｹ・医Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺ｮ繧｢繝ｼ繝・ｒ繧ｳ繧ｹ繝医↑縺励〒菴ｿ逕ｨ・・  if (stub.id === 'ENCORE') {
    const artsEN = (ctx.ownerState.lrig_trash ?? [])
      .filter(cn => ctx.cardMap.get(cn)?.Type === '繧｢繝ｼ繝・);
    if (artsEN.length === 0) return done(addLog(ctx, '繧｢繝ｳ繧ｳ繝ｼ繝ｫ・壹Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ繧｢繝ｼ繝・↑縺・));
    const optsEN = artsEN.map(cn => ({
      id: cn,
      label: ctx.cardMap.get(cn)?.CardName ?? cn,
      action: ({ type: 'STUB', id: 'INTERNAL_ENCORE_USE', value: cn } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '繧｢繝ｳ繧ｳ繝ｼ繝ｫ・壻ｽｿ逕ｨ縺吶ｋ繧｢繝ｼ繝・ｒ驕ｸ謚・), { type: 'CHOOSE', options: optsEN, count: 1 });
  }
  // INTERNAL_ENCORE_USE: 驕ｸ謚槭＠縺溘い繝ｼ繝・ｒ繧ｳ繧ｹ繝医↑縺励〒螳溯｡・  if (stub.id === 'INTERNAL_ENCORE_USE') {
    const encoreCN = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const encoreCard = ctx.cardMap.get(encoreCN);
    if (!encoreCard) return done(addLog(ctx, '繧｢繝ｳ繧ｳ繝ｼ繝ｫ・壹き繝ｼ繝峨ョ繝ｼ繧ｿ縺ｪ縺・));
    const encoreEffs = parseCardEffects(encoreCard);
    const mainEncoreEff = encoreEffs.find(e => e.effectType === 'ACTIVATED');
    if (!mainEncoreEff) return done(addLog(ctx, `繧｢繝ｳ繧ｳ繝ｼ繝ｫ・・{encoreCard.CardName}縺ｫ襍ｷ蜍募柑譫懊↑縺輿));
    return exec(mainEncoreEff.action,
      addLog({ ...ctx, sourceCardNum: encoreCN }, `${encoreCard.CardName}繧偵い繝ｳ繧ｳ繝ｼ繝ｫ・医さ繧ｹ繝医↑縺暦ｼ荏));
  }
  // 蟇ｾ謌ｦ逶ｸ謇九・繝ｩ繧､繝輔け繝ｭ繧ｹ荳翫ｒ隕九ｋ・郁､・焚譫壹ヱ繧ｿ繝ｼ繝ｳ蟇ｾ蠢懶ｼ・  if (stub.id === 'LOOK_OPP_LIFE_TOP') {
    const srcLT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLT = srcLT ? (srcLT.EffectText ?? '') + ' ' + (srcLT.BurstText ?? '') : '';
    const toHWLT = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 縲悟ｯｾ謌ｦ逶ｸ謇九・謇区惆繧定ｦ九ｋ縲阪ヱ繧ｿ繝ｼ繝ｳ 竊・逶ｸ謇九・謇区惆譫壽焚繧偵Ο繧ｰ
    if (txtLT.match(/蟇ｾ謌ｦ逶ｸ謇九・謇区惆繧端・・・兔d]*譫・隕九ｋ/)) {
      const oppHand = ctx.otherState.hand.length;
      return done(addLog({ ...ctx, lastProcessedCards: ctx.otherState.hand }, `蟇ｾ謌ｦ逶ｸ謇九・謇区惆${oppHand}譫壹ｒ遒ｺ隱港));
    }
    const oppS = ownerState('opponent', ctx);
    // N譫夂｢ｺ隱阪ヱ繧ｿ繝ｼ繝ｳ
    const countM = txtLT.match(/繝ｩ繧､繝輔け繝ｭ繧ｹ縺ｮ荳・?:縺九ｉ)?([・・・兔d]+)譫・?:縺ｮ)?(?:繧ｫ繝ｼ繝峨ｒ)?(?:隕九ｋ|遒ｺ隱・/);
    const count = countM ? parseInt(toHWLT(countM[1])) : 1;
    const viewed = oppS.life_cloth.slice(Math.max(0, oppS.life_cloth.length - count));
    if (viewed.length === 0) return done(addLog(ctx, '蟇ｾ謌ｦ逶ｸ謇九・繝ｩ繧､繝輔け繝ｭ繧ｹ縺ｪ縺・));
    const names = viewed.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('縲・);
    return done(addLog({ ...ctx, lastProcessedCards: viewed }, `蟇ｾ謌ｦ逶ｸ謇九・繝ｩ繧､繝輔け繝ｭ繧ｹ荳・{viewed.length}譫壹ｒ遒ｺ隱搾ｼ・{names}`));
  }
  // 繝医Ξ繝ｼ繝会ｼ夊・繧ｷ繧ｰ繝・菴薙ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺阪∫嶌謇九す繧ｰ繝・菴薙ｒ繝舌ル繝・す繝･
  if (stub.id === 'TRADE_BANISH_SELF_SIGNI') {
    const selfSigni = ctx.ownerState.field.signi
      .map((stack, zi) => stack?.at(-1) ? { cn: stack.at(-1)!, zi } : null)
      .filter(Boolean) as { cn: string; zi: number }[];
    const oppSigni = fieldCandidates(ctx.otherState, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (selfSigni.length === 0 || oppSigni.length === 0) {
      return done(addLog(ctx, '繝医Ξ繝ｼ繝画擅莉ｶ譛ｪ驕費ｼ医す繧ｰ繝九↑縺暦ｼ・));
    }
    // 縺ｾ縺夊・蛻・す繧ｰ繝九ｒ驕ｸ繧薙〒繝医Λ繝・す繝･ 竊・continuation 縺ｧ逶ｸ謇九す繧ｰ繝九ｒ繝舌ル繝・す繝･
    const selfCands = selfSigni.map(s => s.cn);
    const trashSelfAction: TrashAction = {
      type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 },
    };
    const banishOppAction: BanishAction = {
      type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 },
    };
    return selectOrInteract(selfCands, 1, false, 'self_field', trashSelfAction, banishOppAction, ctx);
  }
  // 謇区惆繧呈昏縺ｦ縺ｦ蟇ｾ謌ｦ逶ｸ謇九す繧ｰ繝九ｒ蟇ｾ雎｡縺ｨ縺吶ｋ蜉ｹ譫懶ｼ医せ繧ｿ繝ｳ繝峨い繝ｭ繝ｳ譎ゑｼ壽焔譛ｭ1譫壽昏縺ｦ+逶ｸ謇九す繧ｰ繝九ｒlastProcessedCards縺ｸ・・  if (stub.id === 'TARGET_AND_DISCARD_HAND') {
    const oppCandsTADH = fieldCandidates(ctx.otherState, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (oppCandsTADH.length === 0 || ctx.ownerState.hand.length === 0)
      return done(addLog(ctx, '蟇ｾ謌ｦ逶ｸ謇九す繧ｰ繝九∪縺溘・謇区惆縺ｪ縺暦ｼ・ARGET_AND_DISCARD_HAND・・));
    // 謇区惆繧・譫夊・蜍墓昏縺ｦ・域忰蟆ｾ・俄・ 逶ｸ謇九す繧ｰ繝九ｒlastProcessedCards縺ｸ
    const discardedTADH = ctx.ownerState.hand[ctx.ownerState.hand.length - 1];
    const newOwnerTADH: PlayerState = {
      ...ctx.ownerState,
      hand: ctx.ownerState.hand.slice(0, -1),
      trash: [...ctx.ownerState.trash, discardedTADH],
    };
    const noopTADH: SequenceAction = { type: 'SEQUENCE', steps: [] };
    return selectOrInteract(oppCandsTADH, 1, false, 'opp_field', noopTADH as EffectAction, undefined,
      addLog({ ...ctx, ownerState: newOwnerTADH }, `謇区惆・・{ctx.cardMap.get(discardedTADH)?.CardName ?? discardedTADH}・峨ｒ謐ｨ縺ｦ蟇ｾ雎｡驕ｸ謚杼));
  }
  // 蜍慕噪繝代Ρ繝ｼ菫ｮ豁｣・・OUNT萓晏ｭ假ｼ・  if (stub.id === 'POWER_MOD_PER_COUNT') {
    const src = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const effText = src ? (src.EffectText ?? '') + ' ' + (src.BurstText ?? '') : '';
    const toHW = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const toSigned = (s: string) => parseInt(toHW(s).replace('・・, '-').replace('・・, '+'));
    // 繝代ち繝ｼ繝ｳ1: "N菴・譫壹↓縺､縺債ｱX" 竊・count ﾃ・deltaPerUnit
    const perM = effText.match(/([・・・兔d]+)[菴捺椢]?縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    // 繝代ち繝ｼ繝ｳ2: "繝ｬ繝吶Ν1縺ｫ縺､縺債ｱX" 竊・sum(level) ﾃ・deltaPerUnit
    const lvlM = !perM ? effText.match(/繝ｬ繝吶Ν([・・・兔d]+)縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/) : null;
    // 繝代ち繝ｼ繝ｳ3: "蜷郁ｨ医〒ﾂｱX" ・亥崋螳壼粋險亥､・・    const totalM = (!perM && !lvlM) ? effText.match(/蜷郁ｨ医〒([・搾ｼ犠[・・・兔d]+)/) : null;

    let totalDelta = 0;
    const processed = ctx.lastProcessedCards ?? [];

    if (perM) {
      const divisor = Math.max(1, parseInt(toHW(perM[1])));
      const deltaPerUnit = toSigned(perM[2]);
      totalDelta = Math.floor(processed.length / divisor) * deltaPerUnit;
    } else if (lvlM) {
      const unitLvl = Math.max(1, parseInt(toHW(lvlM[1])));
      const deltaPerLvl = toSigned(lvlM[2]);
      const sumLvl = processed.reduce((acc, cn) => {
        const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0');
        return acc + (isNaN(lv) ? 0 : lv);
      }, 0);
      totalDelta = Math.floor(sumLvl / unitLvl) * deltaPerLvl;
    } else if (totalM) {
      totalDelta = toSigned(totalM[1]);
    }

    // 繝峨Ο繝ｼ繝代ち繝ｼ繝ｳ: "譫壽焚縺ｫ+N繧貞刈縺医◆譫壽焚縺ｮ繧ｫ繝ｼ繝峨ｒ蠑輔￥"
    const drawM = effText.match(/譫壽焚縺ｫ([・・・兔d]+)繧貞刈縺医◆譫壽焚縺ｮ繧ｫ繝ｼ繝峨ｒ蠑輔￥/);
    if (drawM) {
      const bonus = parseInt(toHW(drawM[1]));
      const drawCount = processed.length + bonus;
      if (drawCount > 0) {
        const s = ctx.ownerState;
        const canDraw = Math.min(drawCount, s.deck.length);
        const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
        return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}譫壹ラ繝ｭ繝ｼ・育ｧｻ蜍・{processed.length}譫・${bonus}・荏));
      }
      return done(addLog(ctx, '繝峨Ο繝ｼ・育ｧｻ蜍墓椢謨ｰ+N・・));
    }

    // 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ: lastProcessedCards縺檎ｩｺ縺ｮ蝣ｴ蜷医↓繧ｲ繝ｼ繝迥ｶ諷九き繧ｦ繝ｳ繝医ｒ蜿ら・
    if (totalDelta === 0 && processed.length === 0) {
      const toSignedPMPC = (s: string) => parseInt(toHW(s).replace('・・,'+').replace('・・,'-'));
      // 謇区惆N譫壹↓縺､縺・      const handM = effText.match(/謇区惆([・・・兔d]*)譫壹↓縺､縺・[・・]?[・・][・・・兔d]+|[・・][・・・兔d]+)/);
      if (handM) {
        const div = parseInt(toHW(handM[1] || '1')) || 1;
        totalDelta = Math.floor(ctx.ownerState.hand.length / div) * toSignedPMPC(handM[2]);
      }
      // 繧ｨ繝翫だ繝ｼ繝ｳN譫壹↓縺､縺・      if (!totalDelta) {
        const enaM = effText.match(/繧ｨ繝翫だ繝ｼ繝ｳ(?:縺ｮ繧ｫ繝ｼ繝・?([・・・兔d]*)譫壹↓縺､縺・[・・]?[・・][・・・兔d]+|[・・][・・・兔d]+)/);
        if (enaM) {
          const div = parseInt(toHW(enaM[1] || '1')) || 1;
          totalDelta = Math.floor(ctx.ownerState.energy.length / div) * toSignedPMPC(enaM[2]);
        }
      }
      // 逋ｻ骭ｲ閠・焚N荳・ｺｺ縺ｫ縺､縺・      if (!totalDelta) {
        const subM = effText.match(/逋ｻ骭ｲ閠・焚([・・・兔d]*)荳・ｺｺ縺ｫ縺､縺・[・・]?[・・][・・・兔d]+|[・・][・・・兔d]+)/);
        if (subM) {
          const div = parseInt(toHW(subM[1] || '1')) || 1;
          totalDelta = Math.floor((ctx.ownerState.subscriber_count ?? 0) / div) * toSignedPMPC(subM[2]);
        }
      }
    }

    if (totalDelta !== 0) {
      // 豁｣繝・Ν繧ｿ・郁・繧ｷ繧ｰ繝九ヰ繝包ｼ・ "縺薙・繧ｷ繧ｰ繝・/"縺ゅ↑縺溘・繧ｷ繧ｰ繝・ 竊・繧ｽ繝ｼ繧ｹ繧ｷ繧ｰ繝九∈
      const targetsOwn = totalDelta > 0 && effText.match(/(?:縺ゅ↑縺溘・|縺薙・)繧ｷ繧ｰ繝・);
      if (targetsOwn && ctx.sourceCardNum) {
        const mods = [...(ctx.ownerState.temp_power_mods ?? [])];
        mods.push({ cardNum: ctx.sourceCardNum, delta: totalDelta });
        const newOwner = { ...ctx.ownerState, temp_power_mods: mods };
        return done(addLog({ ...ctx, ownerState: newOwner },
          `繧ｽ繝ｼ繧ｹ繧ｷ繧ｰ繝九・繝代Ρ繝ｼ+${totalDelta}・亥・逅・{processed.length}譫夲ｼ荏));
      }
      // 繝・ヵ繧ｩ繝ｫ繝・ 蜈ｨ逶ｸ謇九す繧ｰ繝九∈
      const mods = [...(ctx.otherState.temp_power_mods ?? [])];
      const oppField = ctx.otherState.field;
      for (let zi = 0; zi < 3; zi++) {
        const top = oppField.signi[zi]?.at(-1);
        if (top) mods.push({ cardNum: top, delta: totalDelta });
      }
      const newOther = { ...ctx.otherState, temp_power_mods: mods };
      return done(addLog({ ...ctx, otherState: newOther },
        `繝代Ρ繝ｼ${totalDelta > 0 ? '+' : ''}${totalDelta}・亥・逅・{processed.length}譫夲ｼ荏));
    }
    return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣・亥虚逧・き繧ｦ繝ｳ繝茨ｼ・));
  }
  if (stub.id === 'POWER_MOD_BY_HAND_COUNT') {
    const src2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txt2 = src2 ? (src2.EffectText ?? '') + ' ' + (src2.BurstText ?? '') : '';
    const toHW2 = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const m2 = txt2.match(/謇区惆([・・・兔d]+)譫壹↓縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (m2) {
      const divisor = Math.max(1, parseInt(toHW2(m2[1])));
      const delta = parseInt(toHW2(m2[2]).replace('・・, '-').replace('・・, '+'));
      const count = Math.floor(ctx.ownerState.hand.length / divisor);
      const totalDelta = count * delta;
      if (totalDelta !== 0) {
        const mods = [...(ctx.otherState.temp_power_mods ?? [])];
        const oppField = ctx.otherState.field;
        for (let zi = 0; zi < 3; zi++) {
          const top = oppField.signi[zi]?.at(-1);
          if (top) mods.push({ cardNum: top, delta: totalDelta });
        }
        const newOther = { ...ctx.otherState, temp_power_mods: mods };
        return done(addLog({ ...ctx, otherState: newOther },
          `繝代Ρ繝ｼ${totalDelta > 0 ? '+' : ''}${totalDelta}・域焔譛ｭ${ctx.ownerState.hand.length}譫夲ｼ荏));
      }
    }
    return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣・域焔譛ｭ譫壽焚・・));
  }
  if (stub.id === 'DOUBLE_POWER_MINUS' || stub.id === 'POWER_MOD_PER_OPPONENT_FIELD') {
    const srcPMO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMO = srcPMO ? (srcPMO.EffectText ?? '') + ' ' + (srcPMO.BurstText ?? '') : '';
    const toHWP = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 繝代ち繝ｼ繝ｳ: "蟇ｾ謌ｦ逶ｸ謇九・蝣ｴ縺ｫ縺ゅｋ繧ｷ繧ｰ繝・菴薙↓縺､縺・N" or "2蛟阪↓縺吶ｋ"
    const perM = txtPMO.match(/(?:繧ｷ繧ｰ繝弓菴・([・・・兔d]*)菴・縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    const doubleM = txtPMO.match(/繝代Ρ繝ｼ繧・[・・・兔d]+)蛟阪↓縺吶ｋ/);
    const oppCount = ctx.otherState.field.signi.filter(s => s && s.length > 0).length;
    if (perM) {
      const unitCount = parseInt(toHWP(perM[1] || '1')) || 1;
      const delta = parseInt(toHWP(perM[2]).replace('・・, '-').replace('・・, '+'));
      const totalDelta = Math.floor(oppCount / unitCount) * delta;
      if (totalDelta !== 0) {
        const mods = [...(ctx.ownerState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.ownerState.field.signi[zi]?.at(-1);
          if (top) mods.push({ cardNum: top, delta: totalDelta });
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: mods } },
          `繝代Ρ繝ｼ${totalDelta > 0 ? '+' : ''}${totalDelta}・育嶌謇九す繧ｰ繝・{oppCount}菴難ｼ荏));
      }
    } else if (doubleM) {
      return done(addLog(ctx, '繝代Ρ繝ｼ2蛟堺ｿｮ豁｣・医Ο繧ｰ縺ｮ縺ｿ・・));
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・育嶌謇・{oppCount}菴灘渕貅厄ｼ荏));
  }
  // 譚｡莉ｶ莉倥″繝代Ρ繝ｼ繝懊・繝翫せ
  if (stub.id === 'CONDITIONAL_POWER_BONUS') {
    const srcCB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCB = srcCB ? (srcCB.EffectText ?? '') + ' ' + (srcCB.BurstText ?? '') : '';
    const toHWC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const toSignedC = (s: string) => parseInt(toHWC(s).replace('・・, '-').replace('・・, '+'));
    // 蜈ｱ騾壹Θ繝ｼ繝・ぅ繝ｪ繝・ぅ・壼ｯｾ雎｡繧ｷ繧ｰ繝句・菴薙↓繝代Ρ繝ｼ菫ｮ豁｣繧帝←逕ｨ
    const applyPowerDelta = (delta: number, target: 'self' | 'opponent', reason: string): ExecResult => {
      if (delta === 0) return done(addLog(ctx, reason));
      const targetState = target === 'self' ? ctx.ownerState : ctx.otherState;
      const mods = [...(targetState.temp_power_mods ?? [])];
      for (let zi = 0; zi < 3; zi++) {
        const top = targetState.field.signi[zi]?.at(-1);
        if (top) mods.push({ cardNum: top, delta });
      }
      const newState = { ...targetState, temp_power_mods: mods };
      const newCtx = target === 'self'
        ? { ...ctx, ownerState: newState }
        : { ...ctx, otherState: newState };
      return done(addLog(newCtx, `繝代Ρ繝ｼ${delta > 0 ? '+' : ''}${delta}・・{reason}・荏));
    };
    // 繝代ち繝ｼ繝ｳ縲後％縺ｮ譁ｹ豕輔〒N譫壻ｻ･荳翫・蝣ｴ蜷医・ｱX縲搾ｼ・astProcessedCards菴ｿ逕ｨ・・    const cM = txtCB.match(/縺薙・譁ｹ豕輔〒.*?([・・・兔d]+)譫壻ｻ･荳・*?蝣ｴ蜷・*?([・搾ｼ犠[・・・兔d]+)(?:縺吶ｋ|縺輔ｌ繧・/s);
    if (cM) {
      const threshold = parseInt(toHWC(cM[1]));
      const delta = toSignedC(cM[2]);
      const processed = ctx.lastProcessedCards ?? [];
      if (processed.length >= threshold) return applyPowerDelta(delta, 'opponent', `譚｡莉ｶ驕疲・・・{processed.length}譫壺翁${threshold}・荏);
      return done(addLog(ctx, `譚｡莉ｶ譛ｪ驕費ｼ亥ｿ・ｦ・{threshold}譫壹∝・逅・{processed.length}譫夲ｼ荏));
    }
    // 繝代ち繝ｼ繝ｳ縲後≠縺ｪ縺溘・蝣ｴ縺ｫ繧ｷ繧ｰ繝九′N菴謎ｻ･荳翫≠繧句ｴ蜷医∽ｻ｣繧上ｊ縺ｫﾂｱX縲・    const fieldM = txtCB.match(/縺ゅ↑縺溘・蝣ｴ[縺ｫ縺ｮ](?:.*?)繧ｷ繧ｰ繝九′([・・・兔d]+)菴・?:莉･荳掛莉･荳翫≠繧・(?:.*?)蝣ｴ蜷・縲・ｼ珪(?:莉｣繧上ｊ縺ｫ)?([・搾ｼ犠[・・・兔d]+)/);
    if (fieldM) {
      const threshold = parseInt(toHWC(fieldM[1]));
      const delta = toSignedC(fieldM[2]);
      const ownCount = ctx.ownerState.field.signi.filter(s => s && s.length > 0).length;
      if (ownCount >= threshold) return applyPowerDelta(delta, 'opponent', `閾ｪ蝣ｴ${ownCount}菴凪翁${threshold}`);
      return done(addLog(ctx, `譚｡莉ｶ譛ｪ驕費ｼ郁・蝣ｴ${ownCount}菴・蠢・ｦ・{threshold}菴難ｼ荏));
    }
    // 繝代ち繝ｼ繝ｳ縲後≠縺ｪ縺溘・繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ繧ｫ繝ｼ繝峨′N譫壻ｻ･荳翫≠繧句ｴ蜷医・    const energyM = txtCB.match(/縺ゅ↑縺溘・繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ繧ｫ繝ｼ繝峨′([・・・兔d]+)譫壻ｻ･荳翫≠繧句ｴ蜷・*?([・搾ｼ犠[・・・兔d]+)/);
    if (energyM) {
      const threshold = parseInt(toHWC(energyM[1]));
      const delta = toSignedC(energyM[2]);
      if (ctx.ownerState.energy.length >= threshold) return applyPowerDelta(delta, 'opponent', `繧ｨ繝・{ctx.ownerState.energy.length}譫壺翁${threshold}`);
      return done(addLog(ctx, `譚｡莉ｶ譛ｪ驕費ｼ医お繝・{ctx.ownerState.energy.length}譫・蠢・ｦ・{threshold}譫夲ｼ荏));
    }
    // 繝代ち繝ｼ繝ｳ縲悟ｯｾ謌ｦ逶ｸ謇九・繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ繧ｫ繝ｼ繝峨′N譫壻ｻ･荳翫≠繧句ｴ蜷医・    const oppEnergyM = txtCB.match(/蟇ｾ謌ｦ逶ｸ謇九・繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ繧ｫ繝ｼ繝峨′([・・・兔d]+)譫壻ｻ･荳翫≠繧句ｴ蜷・*?([・搾ｼ犠[・・・兔d]+)/);
    if (oppEnergyM) {
      const threshold = parseInt(toHWC(oppEnergyM[1]));
      const delta = toSignedC(oppEnergyM[2]);
      if (ctx.otherState.energy.length >= threshold) return applyPowerDelta(delta, 'opponent', `逶ｸ謇九お繝・{ctx.otherState.energy.length}譫壺翁${threshold}`);
      return done(addLog(ctx, `譚｡莉ｶ譛ｪ驕費ｼ育嶌謇九お繝・{ctx.otherState.energy.length}譫・蠢・ｦ・{threshold}譫夲ｼ荏));
    }
    // 繝代ち繝ｼ繝ｳ縲後≠縺ｪ縺溘・謇区惆縺君譫壻ｻ･荳翫・蝣ｴ蜷医・    const handM = txtCB.match(/縺ゅ↑縺溘・謇区惆縺・[・・・兔d]+)譫壻ｻ･荳・?:縺ｮ蝣ｴ蜷・?.*?([・搾ｼ犠[・・・兔d]+)/);
    if (handM) {
      const threshold = parseInt(toHWC(handM[1]));
      const delta = toSignedC(handM[2]);
      if (ctx.ownerState.hand.length >= threshold) return applyPowerDelta(delta, 'opponent', `謇区惆${ctx.ownerState.hand.length}譫壺翁${threshold}`);
      return done(addLog(ctx, `譚｡莉ｶ譛ｪ驕費ｼ域焔譛ｭ${ctx.ownerState.hand.length}譫・蠢・ｦ・{threshold}譫夲ｼ荏));
    }
    // 繝代ち繝ｼ繝ｳ縲後≠縺ｪ縺溘・繝医Λ繝・す繝･縺ｫ繧ｫ繝ｼ繝牙錐縺ｫ縲懊ｒ蜷ｫ繧繧ｫ繝ｼ繝峨′縺ゅｋ蝣ｴ蜷医搾ｼ亥崋螳壹ヱ繝ｯ繝ｼ・・    const trashNameM = txtCB.match(/縺ゅ↑縺溘・繝医Λ繝・す繝･縺ｫ繧ｫ繝ｼ繝牙錐縺ｫ縲・([^縲犠+)縲・繧貞性繧繧ｫ繝ｼ繝峨′縺ゅｋ蝣ｴ蜷・*?([・搾ｼ犠[・・・兔d]+)/);
    if (trashNameM) {
      const cardName = trashNameM[1];
      const delta = toSignedC(trashNameM[2]);
      const found = ctx.ownerState.trash.some(cn => ctx.cardMap.get(cn)?.CardName?.includes(cardName));
      if (found) return applyPowerDelta(delta, 'opponent', `繝医Λ繝・す繝･縺ｫ${cardName}縺ゅｊ`);
      return done(addLog(ctx, `譚｡莉ｶ譛ｪ驕費ｼ医ヨ繝ｩ繝・す繝･縺ｫ${cardName}縺ｪ縺暦ｼ荏));
    }
    // 繝代ち繝ｼ繝ｳ縲後ヨ繝ｩ繝・す繝･縺ｫ縺ゅｋ・懊け繝ｩ繧ｹ・槭・繧ｫ繝ｼ繝丑譫壹↓縺､縺債ｱX縲・    const trashClassM = txtCB.match(/繝医Λ繝・す繝･縺ｫ縺ゅｋ・・[^・枉+)・槭・繧ｫ繝ｼ繝閏・・・兔d]*譫・縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (trashClassM) {
      const cls = trashClassM[1];
      const delta = toSignedC(trashClassM[2]);
      const count = ctx.ownerState.trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.CardClass?.includes(cls) || c?.CardName?.includes(cls);
      }).length;
      if (count > 0) {
        const totalDelta = count * delta;
        return applyPowerDelta(totalDelta, 'opponent', `繝医Λ繝・す繝･<${cls}>${count}譫堙・{delta}`);
      }
      return done(addLog(ctx, `譚｡莉ｶ譛ｪ驕費ｼ医ヨ繝ｩ繝・す繝･<${cls}>縺ｪ縺暦ｼ荏));
    }
    // 繝代ち繝ｼ繝ｳ縲悟ｴ縺ｫ莉悶・・懊け繝ｩ繧ｹ・槭・繧ｷ繧ｰ繝九′縺ゅｋ蝣ｴ蜷医・ｱX縲・    const fieldClassM = txtCB.match(/縺ゅ↑縺溘・蝣ｴ縺ｫ(?:莉悶・)?・・[^・枉+)・槭・繧ｷ繧ｰ繝九′縺ゅｋ蝣ｴ蜷・*?([・搾ｼ犠[・・・兔d]+)/);
    if (fieldClassM) {
      const cls = fieldClassM[1];
      const delta = toSignedC(fieldClassM[2]);
      const found = ctx.ownerState.field.signi.some((s) => {
        const top = s?.at(-1);
        if (!top || top === ctx.sourceCardNum) return false;
        const c = ctx.cardMap.get(top);
        return c?.CardClass?.includes(cls);
      });
      if (found) return applyPowerDelta(delta, 'self', `蝣ｴ縺ｫ<${cls}>縺ゅｊ`);
      return done(addLog(ctx, `譚｡莉ｶ譛ｪ驕費ｼ亥ｴ縺ｫ<${cls}>縺ｪ縺暦ｼ荏));
    }
    // 繝代ち繝ｼ繝ｳ縲後％縺ｮ繧ｷ繧ｰ繝九・繝代Ρ繝ｼ繧陳ｱX・郁・繧ｷ繧ｰ繝句ｼｷ蛹厄ｼ峨・    const selfPwM = txtCB.match(/縺薙・繧ｷ繧ｰ繝九・繝代Ρ繝ｼ繧・[・搾ｼ犠[・・・兔d]+)縺吶ｋ/);
    if (selfPwM && ctx.sourceCardNum) {
      const delta = toSignedC(selfPwM[1]);
      const mods = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: mods } },
        `${ctx.cardMap.get(ctx.sourceCardNum)?.CardName ?? ctx.sourceCardNum}繝代Ρ繝ｼ${delta > 0 ? '+' : ''}${delta}`));
    }
    return done(addLog(ctx, '譚｡莉ｶ莉倥″繝代Ρ繝ｼ菫ｮ豁｣'));
  }
  // 繧ｰ繝ｭ繧ｦ蛻ｶ髯撰ｼ壼ｯｾ謌ｦ逶ｸ謇九・ no_grow 繝輔Λ繧ｰ繧偵そ繝・ヨ
  if (stub.id === 'LRIG_GROW_RESTRICT') {
    // CONTINUOUS蜉ｹ譫懊・縺溘ａ縲。attleScreen縺ｮgrowCandidates繝輔ぅ繝ｫ繧ｿ繝ｪ繝ｳ繧ｰ縺ｧ濶ｲ蛻ｶ髯舌ｒ驕ｩ逕ｨ
    // ・・ffectText縺ｮ縲後％縺ｮ繝ｫ繝ｪ繧ｰ縺ｯ縲懊・繝ｫ繝ｪ繧ｰ縺ｫ縺励°繧ｰ繝ｭ繧ｦ縺ｧ縺阪↑縺・阪ｒBattleScreen蛛ｴ縺ｧ隗｣譫撰ｼ・    return done(addLog(ctx, '繧ｰ繝ｭ繧ｦ濶ｲ蛻ｶ髯撰ｼ・attleScreen蛛ｴ蜃ｦ逅・ｼ・));
  }
  // 繝ｩ繧､繝輔ヰ繝ｼ繧ｹ繝域椛蛻ｶ・壼ｯｾ謌ｦ逶ｸ謇九・ suppress_life_burst 繝輔Λ繧ｰ繧偵そ繝・ヨ
  if (stub.id === 'SUPPRESS_LIFE_BURST_ON_CRASH' || stub.id === 'SUPPRESS_LIFE_BURST_ON_CARD') {
    const newOther = { ...ctx.otherState, suppress_life_burst: true };
    return done(addLog({ ...ctx, otherState: newOther }, '縺薙・繧ｿ繝ｼ繝ｳ蟇ｾ謌ｦ逶ｸ謇九・繝ｩ繧､繝輔ヰ繝ｼ繧ｹ繝医・逋ｺ蜍輔＠縺ｪ縺・));
  }
  // 縺薙・繧ｿ繝ｼ繝ｳ縺ｮ繝ｫ繝ｪ繧ｰ繝繝｡繝ｼ繧ｸ辟｡蜉ｹ・嗤wnerState 縺ｫ prevent_lrig_damage 繝輔Λ繧ｰ繧偵そ繝・ヨ
  if (stub.id === 'PREVENT_LRIG_DAMAGE_THIS_TURN') {
    const newOwner = { ...ctx.ownerState, prevent_lrig_damage: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, '縺薙・繧ｿ繝ｼ繝ｳ閾ｪ蛻・∈縺ｮ繝ｫ繝ｪ繧ｰ繝繝｡繝ｼ繧ｸ繧堤┌蜉ｹ'));
  }
  // 謨怜圏辟｡蜉ｹ繝輔Λ繧ｰ
  if (stub.id === 'PREVENT_DEFEAT_THIS_TURN' || stub.id === 'PREVENT_DEFEAT_UNTIL_NEXT_TURN' || stub.id === 'PREVENT_DEFEAT') {
    const newOwner = { ...ctx.ownerState, prevent_defeat: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, '縺薙・繧ｿ繝ｼ繝ｳ謨怜圏辟｡蜉ｹ'));
  }
  // 繧ｵ繝悶せ繧ｯ繝ｩ繧､繝舌・繧ｫ繧ｦ繝ｳ繝・1
  if (stub.id === 'GAIN_SUBSCRIBER_COUNT') {
    const srcSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSC = srcSC ? (srcSC.EffectText ?? '') + ' ' + (srcSC.BurstText ?? '') : '';
    const toHWSC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mSC = txtSC.match(/逋ｻ骭ｲ閠・焚繧・[・・・兔d]+)荳・ｺｺ蠕励ｋ/);
    const gain = mSC ? parseInt(toHWSC(mSC[1])) : 1;
    const newCnt = (ctx.ownerState.subscriber_count ?? 0) + gain;
    const newOwner = { ...ctx.ownerState, subscriber_count: newCnt };
    return done(addLog({ ...ctx, ownerState: newOwner }, `逋ｻ骭ｲ閠・焚・・{gain}荳・ｺｺ・郁ｨ・{newCnt}荳・ｺｺ・荏));
  }
  // 繧ｦ繧､繝ｫ繧ｹ髯､蜴ｻ・壹ユ繧ｭ繧ｹ繝医ｒ隗｣譫舌＠縺ｦ驕ｩ蛻・↑謨ｰ縺ｮ繧ｦ繧､繝ｫ繧ｹ繧貞叙繧企勁縺・  if (stub.id === 'REMOVE_VIRUS') {
    const virusArr = ctx.otherState.field.signi_virus ?? [0, 0, 0];
    const totalVirus = virusArr.reduce((s, v) => s + v, 0);
    if (totalVirus === 0) return done(addLog(ctx, '繧ｦ繧､繝ｫ繧ｹ縺ｪ縺・));
    const srcRV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRV = srcRV ? (srcRV.EffectText ?? '') + ' ' + (srcRV.BurstText ?? '') : '';
    const toHWRV = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const removeAllRV = !!(txtRV.match(/縺吶∋縺ｦ縺ｮ縲舌え繧｣繝ｫ繧ｹ縲代ｒ蜿悶ｊ髯､縺・) || txtRV.match(/縺吶∋縺ｦ縺ｮ.*繧ｦ繧｣繝ｫ繧ｹ.*蜿悶ｊ髯､縺・));
    const cntMRV = txtRV.match(/縲舌え繧｣繝ｫ繧ｹ縲・[・・・兔d]+)縺､繧・蜿悶ｊ髯､縺・);
    const removeCount = removeAllRV ? totalVirus : (cntMRV ? Math.min(parseInt(toHWRV(cntMRV[1])), totalVirus) : totalVirus);
    const newVirus = [...virusArr];
    let removed = 0;
    for (let z = 0; z < 3 && removed < removeCount; z++) {
      const take = Math.min(newVirus[z], removeCount - removed);
      newVirus[z] -= take;
      removed += take;
    }
    const newOther = { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: newVirus } };
    return done(addLog({ ...ctx, otherState: newOther }, `繧ｦ繧､繝ｫ繧ｹ${removed}縺､繧貞叙繧企勁縺汁));
  }
  // INTERNAL_REMOVE_VIRUS_N: N蛟九え繧､繝ｫ繧ｹ繧帝勁蜴ｻ・・ffectExecutor縺ｮREMOVE_VIRUS+IS_MY_TURN繝上Φ繝峨Λ縺九ｉ菴ｿ逕ｨ・・  if (stub.id === 'INTERNAL_REMOVE_VIRUS_N') {
    const n = typeof stub.value === 'number' ? stub.value : 0;
    if (n === 0) return done(ctx);
    const virusArr = ctx.otherState.field.signi_virus ?? [0, 0, 0];
    const newVirus = [...virusArr];
    let removed = 0;
    for (let z = 0; z < 3 && removed < n; z++) {
      const take = Math.min(newVirus[z], n - removed);
      newVirus[z] -= take;
      removed += take;
    }
    const newOther = { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: newVirus } };
    return done(addLog({ ...ctx, otherState: newOther }, `繧ｦ繧､繝ｫ繧ｹ${removed}縺､繧貞叙繧企勁縺汁));
  }
  // INTERNAL_RV_BATCH_TRANSFER: N蛟九え繧､繝ｫ繧ｹ髯､蜴ｻ + 繝医Λ繝・す繝･縺九ｉ繧ｷ繧ｰ繝起譫壹ｒ謇区惆縺ｸ・・X15-028蝙具ｼ・  if (stub.id === 'INTERNAL_RV_BATCH_TRANSFER') {
    const n = typeof stub.value === 'number' ? stub.value : 0;
    if (n === 0) return done(addLog(ctx, '繧ｦ繧､繝ｫ繧ｹ蜿悶ｊ髯､縺九↑縺・));
    const virusArr = ctx.otherState.field.signi_virus ?? [0, 0, 0];
    const newVirus = [...virusArr];
    let removed = 0;
    for (let z = 0; z < 3 && removed < n; z++) {
      const take = Math.min(newVirus[z], n - removed);
      newVirus[z] -= take;
      removed += take;
    }
    const newCtx = addLog({ ...ctx, otherState: { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: newVirus } } },
      `繧ｦ繧､繝ｫ繧ｹ${removed}縺､繧貞叙繧企勁縺汁);
    // 繝医Λ繝・す繝･縺九ｉ鮟偵・繧ｷ繧ｰ繝九ｒN譫夐∈謚槭＠縺ｦ謇区惆縺ｸ・・ELECT_TARGET縺ｧ驕ｸ縺ｰ縺帙ｋ・・    const blackTrashCands = newCtx.ownerState.trash.filter(cn => {
      const c = newCtx.cardMap.get(cn);
      return c?.Type === '繧ｷ繧ｰ繝・ && (c.Color ?? '').includes('鮟・);
    });
    if (blackTrashCands.length === 0) return done(addLog(newCtx, '繝医Λ繝・す繝･縺ｫ鮟偵す繧ｰ繝九↑縺・));
    const pickN = Math.min(removed, blackTrashCands.length);
    const addHandAction: AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    return needsInteraction(addLog(newCtx, `繝医Λ繝・す繝･縺九ｉ鮟偵す繧ｰ繝・{pickN}譫壹ｒ謇区惆縺ｫ蜉縺医ｋ`), {
      type: 'SEARCH', visibleCards: blackTrashCands, maxPick: pickN,
      thenAction: addHandAction as EffectAction,
    });
  }
  // EXTRA_COST_REMOVE_VIRUS: 繧ｦ繧､繝ｫ繧ｹ繧剃ｻｻ諢乗焚蜿悶ｊ髯､縺・※縺九ｉN+1謚槭・蜉ｹ譫懊ｒ驕ｸ縺ｶ
  if (stub.id === 'EXTRA_COST_REMOVE_VIRUS') {
    const virusArrECRV = ctx.otherState.field.signi_virus ?? [0, 0, 0];
    const totalVirusECRV = virusArrECRV.reduce((s, v) => s + v, 0);
    const srcECRV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtECRV = srcECRV ? (srcECRV.EffectText ?? '') + ' ' + (srcECRV.BurstText ?? '') : '';
    const toHWECRV = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 譛螟ｧ蜿悶ｊ髯､縺肴焚繧定ｧ｣譫・    const maxRemoveM = txtECRV.match(/縲舌え繧｣繝ｫ繧ｹ縲代ｒ([・・・兔d]+)縺､縺ｾ縺ｧ蜿悶ｊ髯､|螂ｽ縺阪↑謨ｰ蜿悶ｊ髯､/);
    const maxRemoveECRV = maxRemoveM
      ? (maxRemoveM[1] ? parseInt(toHWECRV(maxRemoveM[1])) : totalVirusECRV)
      : totalVirusECRV;
    // 蜿悶ｊ髯､縺乗焚繧帝∈謚・(0 縺九ｉ min(max, totalVirus))
    const removeOptions: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (let n = 0; n <= Math.min(maxRemoveECRV, totalVirusECRV); n++) {
      removeOptions.push({
        id: `remove_${n}`,
        label: n === 0 ? '蜿悶ｊ髯､縺九↑縺・ : `繧ｦ繧､繝ｫ繧ｹ${n}縺､蜿悶ｊ髯､縺汁,
        action: ({ type: 'STUB', id: 'INTERNAL_ECRV_APPLY', value: n } as StubAction) as EffectAction,
        available: true,
      });
    }
    return needsInteraction(addLog(ctx, `繧ｦ繧､繝ｫ繧ｹ蜿悶ｊ髯､縺搾ｼ域怙螟ｧ${Math.min(maxRemoveECRV, totalVirusECRV)}・荏), {
      type: 'CHOOSE', options: removeOptions, count: 1,
    });
  }
  // INTERNAL_ECRV_APPLY: 繧ｦ繧､繝ｫ繧ｹN蛟矩勁蜴ｻ竊・N+1)謚槫柑譫懊ｒ驕ｸ縺ｶ
  if (stub.id === 'INTERNAL_ECRV_APPLY') {
    const removeN = typeof stub.value === 'number' ? stub.value : 0;
    // 繧ｦ繧､繝ｫ繧ｹ繧誰蛟矩勁蜴ｻ
    const newVirusECRV = [...(ctx.otherState.field.signi_virus ?? [0, 0, 0])];
    let removedECRV = 0;
    for (let zi = 0; zi < 3 && removedECRV < removeN; zi++) {
      const take = Math.min(newVirusECRV[zi], removeN - removedECRV);
      newVirusECRV[zi] -= take;
      removedECRV += take;
    }
    let ctxECRV: typeof ctx = { ...ctx, otherState: { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: newVirusECRV } } };
    if (removedECRV > 0) ctxECRV = addLog(ctxECRV as import('./execUtils').ExecCtx, `繧ｦ繧､繝ｫ繧ｹ${removedECRV}蛟矩勁蜴ｻ`) as typeof ctx;
    const chooseCount = removeN + 1;
    const srcECRV2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtECRV2 = srcECRV2 ? (srcECRV2.EffectText ?? '') + ' ' + (srcECRV2.BurstText ?? '') : '';
    const toHWECRV2 = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 竭竭｡竭｢竭｣縺ｮ蜉ｹ譫懊が繝励す繝ｧ繝ｳ繧定ｧ｣譫撰ｼ・ONDITIONAL_MULTI_CHOOSE_BY_CENTER縺ｨ蜷梧ｧ倥・繝ｭ繧ｸ繝・け・・    const ecrPatterns = [
      { m: /竭([^竭｡竭｢竭｣]+)/, idx: 0 }, { m: /竭｡([^竭｢竭｣竭､]+)/, idx: 1 },
      { m: /竭｢([^竭｣竭､]+)/, idx: 2 }, { m: /竭｣([^竭､]+)/, idx: 3 },
    ];
    const optsECRV: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of ecrPatterns) {
      const mat = txtECRV2.match(m);
      if (!mat) continue;
      const choiceTxtECRV = mat[1].replace(/縲・s*$/, '').trim();
      let choiceActECRV: EffectAction | null = null;
      if (choiceTxtECRV.match(/繝医Λ繝・す繝･縺九ｉ.*鮟・*繧ｷ繧ｰ繝・*謇区惆/)) {
        choiceActECRV = ({ type: 'STUB', id: 'SUMMON_FROM_TRASH_TO_HAND_BLACK' } as StubAction) as EffectAction;
      } else if (choiceTxtECRV.match(/繝代Ρ繝ｼ繧・[・・][・・・兔d]+)縺吶ｋ/)) {
        const delta = parseInt(toHWECRV2(choiceTxtECRV.match(/繝代Ρ繝ｼ繧・[・・][・・・兔d]+)縺吶ｋ/)![1]).replace('・・, '-'));
        choiceActECRV = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_OPP_ONE', value: delta } as StubAction) as EffectAction;
      } else if (choiceTxtECRV.match(/縺吶∋縺ｦ縺ｮ繧ｷ繧ｰ繝九・繝代Ρ繝ｼ繧・[・・][・・・兔d]+)/)) {
        const delta = parseInt(toHWECRV2(choiceTxtECRV.match(/縺吶∋縺ｦ縺ｮ繧ｷ繧ｰ繝九・繝代Ρ繝ｼ繧・[・・][・・・兔d]+)/)![1]).replace('・・, '-'));
        choiceActECRV = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_ALL_OPP', value: delta } as StubAction) as EffectAction;
      } else if (choiceTxtECRV.match(/繝医Λ繝・す繝･縺ｫ縺ゅｋ.*繧ｲ繝ｼ繝縺九ｉ髯､螟・)) {
        choiceActECRV = ({ type: 'STUB', id: 'INTERNAL_EXILE_OPP_TRASH' } as StubAction) as EffectAction;
      } else if (choiceTxtECRV.match(/繝・ャ繧ｭ縺ｮ荳翫°繧峨き繝ｼ繝峨ｒ([・・・兔d]+)譫壹ヨ繝ｩ繝・す繝･/)) {
        const cnt = parseInt(toHWECRV2(choiceTxtECRV.match(/繝・ャ繧ｭ縺ｮ荳翫°繧峨き繝ｼ繝峨ｒ([・・・兔d]+)譫壹ヨ繝ｩ繝・す繝･/)![1]));
        choiceActECRV = ({ type: 'STUB', id: 'INTERNAL_DECK_TRASH_BOTH', value: cnt } as StubAction) as EffectAction;
      }
      if (choiceActECRV) {
        optsECRV.push({
          id: `eff_${idx}`,
          label: `${['竭','竭｡','竭｢','竭｣'][idx]}${choiceTxtECRV.slice(0, 20)}...`,
          action: choiceActECRV,
          available: true,
        });
      }
    }
    if (optsECRV.length > 0) {
      return needsInteraction(addLog(ctxECRV, `蜉ｹ譫懊ｒ${chooseCount}縺､驕ｸ謚杼), {
        type: 'CHOOSE', options: optsECRV, count: Math.min(chooseCount, optsECRV.length),
      });
    }
    return done(addLog(ctxECRV, `繧ｦ繧､繝ｫ繧ｹ${removeN}蛟矩勁蜴ｻ竊貞柑譫・{chooseCount}謚橸ｼ郁ｧ｣譫蝉ｸ榊庄・荏));
  }
  // SUMMON_FROM_TRASH_TO_HAND_BLACK: 繝医Λ繝・す繝･縺九ｉ鮟偵す繧ｰ繝九ｒ謇区惆縺ｸ
  if (stub.id === 'SUMMON_FROM_TRASH_TO_HAND_BLACK') {
    const blackSigni = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === '繧ｷ繧ｰ繝・ && (c.Color ?? '').includes('鮟・);
    });
    if (blackSigni.length === 0) return done(addLog(ctx, '繝医Λ繝・す繝･縺ｫ鮟偵す繧ｰ繝九↑縺・));
    const addHAct: AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    return selectOrInteract(blackSigni, 1, false, 'self_trash', addHAct as EffectAction, undefined, ctx);
  }
  // INTERNAL_POWER_MOD_ALL_OPP: 蜈ｨ逶ｸ謇九す繧ｰ繝九∈縺ｮ繝代Ρ繝ｼ菫ｮ豁｣
  if (stub.id === 'INTERNAL_POWER_MOD_ALL_OPP') {
    const deltaIAPMA = typeof stub.value === 'number' ? stub.value : -2000;
    const modsIAPMA = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (top) modsIAPMA.push({ cardNum: top, delta: deltaIAPMA });
    }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIAPMA } },
      `蜈ｨ逶ｸ謇九す繧ｰ繝九ヱ繝ｯ繝ｼ${deltaIAPMA}`));
  }
  // INTERNAL_EXILE_OPP_TRASH: 逶ｸ謇九ヨ繝ｩ繝・す繝･縺ｮ繧ｫ繝ｼ繝峨ｒ繧ｲ繝ｼ繝縺九ｉ髯､螟厄ｼ・譫壹∪縺ｧ・・  if (stub.id === 'INTERNAL_EXILE_OPP_TRASH') {
    const oppTrashIEOT = ctx.otherState.trash;
    if (oppTrashIEOT.length === 0) return done(addLog(ctx, '逶ｸ謇九ヨ繝ｩ繝・す繝･縺ｫ繧ｫ繝ｼ繝峨↑縺・));
    const exileN = Math.min(2, oppTrashIEOT.length);
    const exiled = oppTrashIEOT.slice(0, exileN);
    const newOtherIEOT = { ...ctx.otherState, trash: oppTrashIEOT.slice(exileN) };
    return done(addLog({ ...ctx, otherState: newOtherIEOT },
      `逶ｸ謇九ヨ繝ｩ繝・す繝･縺九ｉ${exiled.length}譫壹ご繝ｼ繝髯､螟厄ｼ・{exiled.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ')}・荏));
  }
  // 繝・ャ繧ｭ繝医ャ繝励ｒ隕九※荳九↓鄂ｮ縺・※繧ゅｈ縺・  if (stub.id === 'TOP_TO_BOTTOM_OPTIONAL') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const topTTB = ctx.ownerState.deck[0];
    const topNameTTB = ctx.cardMap.get(topTTB)?.CardName ?? topTTB;
    const toBottomTTB: StubAction = { type: 'STUB', id: 'INTERNAL_TOP_TO_BOTTOM' };
    const skipTTB: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const pendingTTB: PendingInteractionDef = {
      type: 'CHOOSE',
      options: [
        { id: 'do', label: `${topNameTTB}繧偵ョ繝・く荳九∈`, action: toBottomTTB as EffectAction, available: true },
        { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: skipTTB as EffectAction, available: true },
      ],
      count: 1,
    };
    return needsInteraction(addLog(ctx, `繝・ャ繧ｭ繝医ャ繝暦ｼ・{topNameTTB}・医ョ繝・く荳九↓鄂ｮ縺・※繧ゅｈ縺・ｼ荏), pendingTTB);
  }
  if (stub.id === 'INTERNAL_TOP_TO_BOTTOM') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const topITTB = ctx.ownerState.deck[0];
    const newDeckITTB = [...ctx.ownerState.deck.slice(1), topITTB];
    const newOwnerITTB = { ...ctx.ownerState, deck: newDeckITTB };
    return done(addLog({ ...ctx, ownerState: newOwnerITTB },
      `${ctx.cardMap.get(topITTB)?.CardName ?? topITTB}繧偵ョ繝・く荳九∈`));
  }
  // 蜷・・繝ｬ繧､繝､繝ｼ縺後き繝ｼ繝峨ｒ1譫壼ｼ輔″謇区惆繧・譫壹ョ繝・く荳九↓鄂ｮ縺・  if (stub.id === 'DRAW_AND_PUT_HAND_TO_DECK_BOTTOM') {
    let newOwnerDAPH = { ...ctx.ownerState };
    let newOtherDAPH = { ...ctx.otherState };
    if (newOwnerDAPH.deck.length > 0) {
      newOwnerDAPH = { ...newOwnerDAPH, hand: [...newOwnerDAPH.hand, newOwnerDAPH.deck[0]], deck: newOwnerDAPH.deck.slice(1) };
    }
    if (newOtherDAPH.deck.length > 0) {
      newOtherDAPH = { ...newOtherDAPH, hand: [...newOtherDAPH.hand, newOtherDAPH.deck[0]], deck: newOtherDAPH.deck.slice(1) };
    }
    const ctxDrawnDAPH = { ...ctx, ownerState: newOwnerDAPH, otherState: newOtherDAPH };
    if (newOwnerDAPH.hand.length === 0) return done(addLog(ctxDrawnDAPH, '荳｡閠・ラ繝ｭ繝ｼ・域焔譛ｭ縺ｪ縺暦ｼ・));
    const noopDAPH: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contDAPH: StubAction = { type: 'STUB', id: 'INTERNAL_HAND_TO_DECK_BOTTOM' };
    const pendingDAPH: PendingInteractionDef = {
      type: 'SELECT_TARGET',
      candidates: newOwnerDAPH.hand,
      count: 1,
      optional: false,
      targetScope: 'self_hand',
      thenAction: noopDAPH as EffectAction,
      continuation: contDAPH as EffectAction,
    };
    return needsInteraction(addLog(ctxDrawnDAPH, '謇区惆繧・譫壹ョ繝・く縺ｮ荳逡ｪ荳九↓鄂ｮ縺・), pendingDAPH);
  }
  if (stub.id === 'INTERNAL_HAND_TO_DECK_BOTTOM') {
    const selectedHDB = ctx.lastProcessedCards ?? [];
    if (selectedHDB.length === 0) return done(addLog(ctx, '繧ｹ繧ｭ繝・・'));
    let newOwnerHDB = { ...ctx.ownerState };
    for (const cn of selectedHDB) {
      const hi = newOwnerHDB.hand.indexOf(cn);
      if (hi >= 0) {
        const newHand = [...newOwnerHDB.hand]; newHand.splice(hi, 1);
        newOwnerHDB = { ...newOwnerHDB, hand: newHand, deck: [...newOwnerHDB.deck, cn] };
      }
    }
    return done(addLog({ ...ctx, ownerState: newOwnerHDB }, `謇区惆${selectedHDB.length}譫壹ｒ繝・ャ繧ｭ荳九∈`));
  }
  // 蜷・・繝ｬ繧､繝､繝ｼ縺後き繝ｼ繝峨ｒ1譫壼ｼ輔″縲・譫壽昏縺ｦ繧・  if (stub.id === 'EACH_PLAYER_DRAW_DISCARD') {
    const toHWEPDD0 = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcEPDD0 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtEPDD0 = srcEPDD0 ? (srcEPDD0.EffectText ?? '') + ' ' + (srcEPDD0.BurstText ?? '') : '';
    const mDN = txtEPDD0.match(/([・・・兔d]+)譫壼ｼ輔￥/);
    const drawN = mDN ? parseInt(toHWEPDD0(mDN[1])) : 1;
    // 荳｡閠・ラ繝ｭ繝ｼ
    let newOwner = { ...ctx.ownerState };
    let newOther = { ...ctx.otherState };
    const ownDraw = Math.min(drawN, newOwner.deck.length);
    newOwner = { ...newOwner, hand: [...newOwner.hand, ...newOwner.deck.slice(0, ownDraw)], deck: newOwner.deck.slice(ownDraw) };
    const othDraw = Math.min(drawN, newOther.deck.length);
    newOther = { ...newOther, hand: [...newOther.hand, ...newOther.deck.slice(0, othDraw)], deck: newOther.deck.slice(othDraw) };
    const ctxDrawnEPDD0 = addLog({ ...ctx, ownerState: newOwner, otherState: newOther }, `荳｡閠・{drawN}譫壹ラ繝ｭ繝ｼ`);
    // 閾ｪ蛻・・謐ｨ縺ｦ・医う繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ・俄・ continuation 縺ｧ逶ｸ謇九・謐ｨ縺ｦ・・pponentResponds・・    if (newOwner.hand.length === 0) return done(ctxDrawnEPDD0);
    const oppDiscardEPDD0: PendingInteractionDef = {
      type: 'SELECT_TARGET',
      candidates: newOther.hand,
      count: 1,
      optional: false,
      targetScope: 'opp_hand',
      thenAction: ({ type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as TrashAction) as EffectAction,
      opponentResponds: true,
    };
    return selectOrInteract(
      newOwner.hand, 1, false, 'self_hand',
      ({ type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } } as TrashAction) as EffectAction,
      newOther.hand.length > 0 ? oppDiscardEPDD0 as EffectAction : undefined,
      ctxDrawnEPDD0,
    );
  }
  // 謇区惆縺九ｉ辟｡濶ｲ縺ｧ縺ｪ縺・き繝ｼ繝峨ｒ繧ｨ繝翫↓鄂ｮ縺・  if (stub.id === 'HAND_NONCOLORLESS_TO_ENERGY') {
    const nonColorless = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      const color = c?.Color ?? '';
      return color.length > 0 && color !== '辟｡';
    });
    if (nonColorless.length === 0) return done(addLog(ctx, '謇区惆縺ｫ譛芽牡繧ｫ繝ｼ繝峨↑縺・));
    const noopHNE: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contHNE: StubAction = { type: 'STUB', id: 'INTERNAL_HAND_TO_ENERGY' };
    const pendingHNE: PendingInteractionDef = {
      type: 'SELECT_TARGET',
      candidates: nonColorless,
      count: 1,
      optional: true,
      targetScope: 'self_hand',
      thenAction: noopHNE as EffectAction,
      continuation: contHNE as EffectAction,
    };
    return needsInteraction(addLog(ctx, '謇区惆縺九ｉ譛芽牡繧ｫ繝ｼ繝峨ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ鄂ｮ縺・※繧ゅｈ縺・), pendingHNE);
  }
  // 蟇ｾ謌ｦ逶ｸ謇九・繧ｨ繝翫だ繝ｼ繝ｳ縺碁明蛟､莉･荳翫・蝣ｴ蜷医・譫壹ヨ繝ｩ繝・す繝･縺ｫ
  if (stub.id === 'OPP_ENERGY_EXCESS_TRASH') {
    const srcOEE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOEE = srcOEE ? (srcOEE.EffectText ?? '') + ' ' + (srcOEE.BurstText ?? '') : '';
    const toHWOEE = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const threshMOEE = txtOEE.match(/繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ繧ｫ繝ｼ繝峨′([・・・兔d]+)譫壻ｻ･荳・);
    const threshOEE = threshMOEE ? parseInt(toHWOEE(threshMOEE[1])) : 5;
    if (ctx.otherState.energy.length < threshOEE) {
      return done(addLog(ctx, `逶ｸ謇九お繝・{ctx.otherState.energy.length}譫夲ｼ・{threshOEE}譫壽悴貅縲√せ繧ｭ繝・・・荏));
    }
    const noopOEE: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contOEE: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_ENERGY_TO_TRASH' };
    const pendingOEE: PendingInteractionDef = {
      type: 'SELECT_TARGET',
      candidates: ctx.otherState.energy,
      count: 1,
      optional: false,
      targetScope: 'opp_energy',
      thenAction: noopOEE as EffectAction,
      continuation: contOEE as EffectAction,
      opponentResponds: true,
    };
    return needsInteraction(addLog(ctx, `逶ｸ謇九お繝翫°繧・譫夐∈縺ｳ繝医Λ繝・す繝･縺ｸ・・{ctx.otherState.energy.length}譫夲ｼ荏), pendingOEE);
  }
  if (stub.id === 'INTERNAL_OPP_ENERGY_TO_TRASH') {
    const selectedOET = ctx.lastProcessedCards ?? [];
    if (selectedOET.length === 0) return done(addLog(ctx, '繧ｹ繧ｭ繝・・'));
    let newOther = { ...ctx.otherState };
    for (const cn of selectedOET) {
      const ei = newOther.energy.indexOf(cn);
      if (ei >= 0) {
        const newEnergy = [...newOther.energy]; newEnergy.splice(ei, 1);
        newOther = { ...newOther, energy: newEnergy, trash: [...newOther.trash, cn] };
      }
    }
    const namesOET = selectedOET.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
    return done(addLog({ ...ctx, otherState: newOther }, `${namesOET}繧堤嶌謇九お繝翫°繧峨ヨ繝ｩ繝・す繝･縺ｸ`));
  }
  // 繝輔ぅ繝ｼ繝ｫ繝峨↓莉悶・繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九′縺ｪ縺・ｴ蜷医∵焔譛ｭ繧呈昏縺ｦ繧・  if (stub.id === 'DISCARD_IF_NO_CLASS_SIGNI') {
    const srcDINC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDINC = srcDINC ? (srcDINC.EffectText ?? '') + ' ' + (srcDINC.BurstText ?? '') : '';
    const classMatchDINC = txtDINC.match(/莉悶・[<・彎([^>・枉+)[>・枉縺ｮ繧ｷ繧ｰ繝九′縺ｪ縺・ｴ蜷・);
    const targetClassDINC = classMatchDINC?.[1];
    // 繝輔ぅ繝ｼ繝ｫ繝峨↓閾ｪ蛻・ｻ･螟悶・繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九′縺ゅｋ縺九メ繧ｧ繝・け
    const hasOtherClassSigni = ctx.ownerState.field.signi.some(stack => {
      const top = stack?.at(-1);
      if (!top || top === ctx.sourceCardNum) return false;
      const c = ctx.cardMap.get(top);
      return c?.Type === '繧ｷ繧ｰ繝・ && (!targetClassDINC || c.CardClass?.includes(targetClassDINC));
    });
    if (hasOtherClassSigni) return done(addLog(ctx, `莉悶・${targetClassDINC ?? '繧ｯ繝ｩ繧ｹ'}繧ｷ繧ｰ繝九≠繧奇ｼ域昏縺ｦ繧ｹ繧ｭ繝・・・荏));
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '謇区惆縺ｪ縺・));
    const discardDINC: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 },
    };
    return selectOrInteract(ctx.ownerState.hand, 1, false, 'self_hand', discardDINC as EffectAction, undefined, ctx);
  }
  // 縺薙・繧ｿ繝ｼ繝ｳ縺ｫ縺薙・繧ｷ繧ｰ繝九′繧｢繧ｿ繝・け縺励※縺・◆蝣ｴ蜷医∵焔譛ｭ繧・譫壽昏縺ｦ繧・  if (stub.id === 'DISCARD_IF_ATTACKED_THIS_TURN') {
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '謇区惆縺ｪ縺暦ｼ域昏縺ｦ繧ｹ繧ｭ繝・・・・));
    const srcDAT = ctx.sourceCardNum;
    const didAttack = srcDAT ? (ctx.ownerState.attacked_signi_ids ?? []).includes(srcDAT) : false;
    if (!didAttack) return done(addLog(ctx, '繧｢繧ｿ繝・け縺ｪ縺暦ｼ域昏縺ｦ繧ｹ繧ｭ繝・・・・));
    const discardDAT: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 },
    };
    return selectOrInteract(ctx.ownerState.hand, 1, false, 'self_hand', discardDAT as EffectAction, undefined, ctx);
  }
  // 謇区惆縺九ｉ莉ｻ諢上〒繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ鄂ｮ縺・  if (stub.id === 'HAND_TO_ENERGY_OPTIONAL') {
    const srcHTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHTE = srcHTE ? (srcHTE.EffectText ?? '') + ' ' + (srcHTE.BurstText ?? '') : '';
    const toHWHTE = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxM = txtHTE.match(/謇区惆縺九ｉ(?:繧ｫ繝ｼ繝・?([・・・兔d]+)譫壹∪縺ｧ/);
    const maxHTE = maxM ? parseInt(toHWHTE(maxM[1])) : 1;
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '謇区惆縺ｪ縺暦ｼ医お繝贋ｻｻ諢冗ｽｮ縺阪せ繧ｭ繝・・・・));
    // thenAction: noop・・ULE_REMINDER_TEXT・・ continuation: INTERNAL_HAND_TO_ENERGY 縺ｧ繧ｨ繝顔ｧｻ蜍・    const noopHTE: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contHTE: StubAction = { type: 'STUB', id: 'INTERNAL_HAND_TO_ENERGY' };
    const pendingHTE: PendingInteractionDef = {
      type: 'SELECT_TARGET',
      candidates: ctx.ownerState.hand,
      count: maxHTE,
      optional: true,
      targetScope: 'self_hand',
      thenAction: noopHTE as EffectAction,
      continuation: contHTE as EffectAction,
    };
    return needsInteraction(addLog(ctx, '謇区惆縺九ｉ繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ鄂ｮ縺・※繧ゅｈ縺・), pendingHTE);
  }
  // INTERNAL: lastProcessedCards縺ｮ謇区惆繧ｫ繝ｼ繝峨ｒ繧ｨ繝翫∈遘ｻ蜍・  if (stub.id === 'INTERNAL_HAND_TO_ENERGY') {
    const selected = ctx.lastProcessedCards ?? [];
    let newOwnerHTE = { ...ctx.ownerState };
    for (const cn of selected) {
      const hi = newOwnerHTE.hand.indexOf(cn);
      if (hi >= 0) {
        const newHand = [...newOwnerHTE.hand];
        newHand.splice(hi, 1);
        newOwnerHTE = { ...newOwnerHTE, hand: newHand, energy: [...newOwnerHTE.energy, cn] };
      }
    }
    const names = selected.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
    return done(addLog({ ...ctx, ownerState: newOwnerHTE }, `${names || '縺ｪ縺・}繧偵お繝翫だ繝ｼ繝ｳ縺ｸ`));
  }
  // 逶ｸ謇九・謇区惆繧定ｦ九※繧ｹ繝壹Ν繧呈昏縺ｦ縺輔○繧・  if (stub.id === 'VIEW_AND_DISCARD_SPELL') {
    const srcVDS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtVDS = srcVDS ? (srcVDS.EffectText ?? '') + ' ' + (srcVDS.BurstText ?? '') : '';
    const toHWVDS = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 繧ｳ繧ｹ繝亥粋險・莉･荳九・繧ｹ繝壹Ν
    const costLimitM = txtVDS.match(/繧ｳ繧ｹ繝医・蜷郁ｨ医′([・・・兔d]+)莉･荳九・繧ｹ繝壹Ν/);
    const costLimit = costLimitM ? parseInt(toHWVDS(costLimitM[1])) : 99;
    const spellCands = ctx.otherState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== '繧ｹ繝壹Ν') return false;
      const cost = c.Cost ?? '';
      const colorCount = (cost.match(/[襍､髱堤ｷ鷹ｻ堤區辟｡]/g) ?? []).length;
      return colorCount <= costLimit;
    });
    if (spellCands.length === 0) return done(addLog(ctx, '逶ｸ謇区焔譛ｭ縺ｫ蟇ｾ雎｡繧ｹ繝壹Ν縺ｪ縺・));
    const maxM2 = txtVDS.match(/繧ｹ繝壹Ν([・・・兔d]+)譫・);
    const maxVDS = maxM2 ? parseInt(toHWVDS(maxM2[1])) : 1;
    const discardVDS: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 },
    };
    return selectOrInteract(spellCands, maxVDS, false, 'opp_hand', discardVDS as EffectAction, undefined, ctx);
  }
  // 閾ｪ繧ｷ繧ｰ繝九ｒ繝・ャ繧ｭ繝医ャ繝励↓鄂ｮ縺・  if (stub.id === 'SELF_TO_DECK_TOP') {
    const srcSTD = ctx.sourceCardNum;
    if (!srcSTD || !ctx.ownerState.field.signi.some(s => s?.at(-1) === srcSTD)) {
      return done(addLog(ctx, 'SELF_TO_DECK_TOP: 繝輔ぅ繝ｼ繝ｫ繝峨↓縺・↑縺・));
    }
    const removedSTD = removeFromField(srcSTD, ctx.ownerState);
    const newOwnerSTD = { ...removedSTD, deck: [srcSTD, ...removedSTD.deck] };
    return done(addLog({ ...ctx, ownerState: newOwnerSTD },
      `${ctx.cardMap.get(srcSTD)?.CardName ?? srcSTD}繧偵ョ繝・く繝医ャ繝励∈`));
  }
  // 逶ｸ謇九・繝医Λ繝・す繝･縺九ｉ繧ｫ繝ｼ繝峨ｒ繝・ャ繧ｭ繝医ャ繝励↓・医ｂ繧医＞・・  if (stub.id === 'OPP_TRASH_TO_DECK_TOP') {
    if (ctx.otherState.trash.length === 0) return done(addLog(ctx, '逶ｸ謇九ヨ繝ｩ繝・す繝･縺ｪ縺・));
    const noopOTT: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contOTT: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_TRASH_TO_DECK_TOP' };
    const pendingOTT: PendingInteractionDef = {
      type: 'SELECT_TARGET',
      candidates: ctx.otherState.trash,
      count: 1,
      optional: true,
      targetScope: 'opp_trash',
      thenAction: noopOTT as EffectAction,
      continuation: contOTT as EffectAction,
    };
    return needsInteraction(addLog(ctx, '逶ｸ謇九ヨ繝ｩ繝・す繝･縺ｮ繧ｫ繝ｼ繝峨ｒ繝・ャ繧ｭ荳翫↓鄂ｮ縺・※繧ゅｈ縺・), pendingOTT);
  }
  if (stub.id === 'INTERNAL_OPP_TRASH_TO_DECK_TOP') {
    const selectedOTT = ctx.lastProcessedCards ?? [];
    if (selectedOTT.length === 0) return done(addLog(ctx, '繧ｹ繧ｭ繝・・'));
    let newOther = { ...ctx.otherState };
    for (const cn of selectedOTT) {
      const ti = newOther.trash.indexOf(cn);
      if (ti >= 0) {
        const newTrash = [...newOther.trash]; newTrash.splice(ti, 1);
        newOther = { ...newOther, trash: newTrash, deck: [cn, ...newOther.deck] };
      }
    }
    const namesOTT = selectedOTT.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
    return done(addLog({ ...ctx, otherState: newOther }, `${namesOTT}繧堤嶌謇九ョ繝・く繝医ャ繝励∈`));
  }
  // 逶ｸ謇九・謇区惆繧偵ョ繝・く繝医ャ繝励↓鄂ｮ縺・  if (stub.id === 'OPP_HAND_TO_DECK_TOP') {
    const srcHDT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHDT = srcHDT ? (srcHDT.EffectText ?? '') + ' ' + (srcHDT.BurstText ?? '') : '';
    const toHWHDT = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMHDT = txtHDT.match(/謇区惆繧・[・・・兔d]+)譫・);
    const maxHDT = maxMHDT ? parseInt(toHWHDT(maxMHDT[1])) : 1;
    if (ctx.otherState.hand.length === 0) return done(addLog(ctx, '逶ｸ謇区焔譛ｭ縺ｪ縺・));
    const noopHDT: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contHDT: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_HAND_TO_DECK_TOP' };
    const pendingHDT: PendingInteractionDef = {
      type: 'SELECT_TARGET',
      candidates: ctx.otherState.hand,
      count: maxHDT,
      optional: false,
      targetScope: 'opp_hand',
      thenAction: noopHDT as EffectAction,
      continuation: contHDT as EffectAction,
      opponentResponds: true,
    };
    return needsInteraction(addLog(ctx, `逶ｸ謇九・謇区惆繧・{maxHDT}譫壹ョ繝・く繝医ャ繝励↓鄂ｮ縺汁), pendingHDT);
  }
  if (stub.id === 'INTERNAL_OPP_HAND_TO_DECK_TOP') {
    const selectedHDT = ctx.lastProcessedCards ?? [];
    if (selectedHDT.length === 0) return done(addLog(ctx, '繧ｹ繧ｭ繝・・'));
    let newOther = { ...ctx.otherState };
    for (const cn of selectedHDT) {
      const hi = newOther.hand.indexOf(cn);
      if (hi >= 0) {
        const newHand = [...newOther.hand]; newHand.splice(hi, 1);
        newOther = { ...newOther, hand: newHand, deck: [cn, ...newOther.deck] };
      }
    }
    return done(addLog({ ...ctx, otherState: newOther }, `逶ｸ謇区焔譛ｭ${selectedHDT.length}譫壹ｒ繝・ャ繧ｭ繝医ャ繝励∈`));
  }
  // UNKNOWN_NESTED: 閾ｪ繧ｷ繧ｰ繝九ｒ莉ｻ諢上〒繝医Λ繝・す繝･縺ｫ鄂ｮ縺擾ｼ医◎縺・＠縺溷ｴ蜷医↓蠕檎ｶ壼柑譫懊′逋ｺ蜍包ｼ・  if (stub.id === 'UNKNOWN_NESTED') {
    const srcUN = ctx.sourceCardNum;
    if (!srcUN || !ctx.ownerState.field.signi.some(s => s?.at(-1) === srcUN)) {
      const newOwner = { ...ctx.ownerState, self_optional_effect_taken: false };
      return done(addLog({ ...ctx, ownerState: newOwner }, 'UNKNOWN_NESTED: 繝輔ぅ繝ｼ繝ｫ繝峨↓繧ｽ繝ｼ繧ｹ縺ｪ縺・));
    }
    const trashSelf: StubAction = { type: 'STUB', id: 'INTERNAL_UNKNOWN_NESTED_TRASH' };
    const skipSelf: StubAction = { type: 'STUB', id: 'INTERNAL_UNKNOWN_NESTED_SKIP' };
    const optsUN = [
      { id: 'trash', label: '縺薙・繧ｷ繧ｰ繝九ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・, action: trashSelf as EffectAction, available: true },
      { id: 'skip',  label: '縺昴≧縺励↑縺・,                   action: skipSelf  as EffectAction, available: true },
    ];
    return needsInteraction(addLog(ctx, '縺薙・繧ｷ繧ｰ繝九ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺阪∪縺吶°・・), {
      type: 'CHOOSE', options: optsUN, count: 1,
    });
  }
  if (stub.id === 'INTERNAL_UNKNOWN_NESTED_TRASH') {
    const srcIUNT = ctx.sourceCardNum;
    if (!srcIUNT) return done(addLog(ctx, 'UNKNOWN_NESTED: 繧ｽ繝ｼ繧ｹ縺ｪ縺・));
    const removed = removeFromField(srcIUNT, ctx.ownerState);
    const newOwner = { ...removed, trash: [...removed.trash, srcIUNT], self_optional_effect_taken: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcIUNT)?.CardName ?? srcIUNT}繧偵ヨ繝ｩ繝・す繝･竊貞ｾ檎ｶ壼柑譫懃匱蜍描));
  }
  if (stub.id === 'INTERNAL_UNKNOWN_NESTED_SKIP') {
    const newOwner = { ...ctx.ownerState, self_optional_effect_taken: false };
    return done(addLog({ ...ctx, ownerState: newOwner }, '繝医Λ繝・す繝･縺励↑縺・・蠕檎ｶ壼柑譫懊せ繧ｭ繝・・'));
  }
  // 繧ｲ繝ｼ繝縺九ｉ髯､螟厄ｼ壹ヨ繝ｩ繝・す繝･縺ｫ縺ゅｋ閾ｪ繧ｷ繧ｰ繝九ｒ莉ｻ諢上〒髯､螟厄ｼ亥ｾ檎ｶ壼柑譫懈擅莉ｶ・・  if (stub.id === 'BANISH_FROM_GAME') {
    const src = ctx.sourceCardNum;
    if (!src) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, self_optional_effect_taken: false } },
        'BANISH_FROM_GAME: sourceCardNum縺ｪ縺・));
    }
    const inTrash = ctx.ownerState.trash.includes(src);
    if (!inTrash) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, self_optional_effect_taken: false } },
        `BANISH_FROM_GAME: ${ctx.cardMap.get(src)?.CardName ?? src}縺ｯ繝医Λ繝・す繝･縺ｫ縺ｪ縺Я));
    }
    const banishSelf: StubAction = { type: 'STUB', id: 'INTERNAL_BANISH_FROM_GAME_DO' };
    const skipBFG: StubAction  = { type: 'STUB', id: 'INTERNAL_BANISH_FROM_GAME_SKIP' };
    const optsBFG = [
      { id: 'banish', label: '繧ｲ繝ｼ繝縺九ｉ髯､螟悶☆繧・, action: banishSelf as EffectAction, available: true },
      { id: 'skip',   label: '縺昴≧縺励↑縺・,          action: skipBFG   as EffectAction, available: true },
    ];
    return needsInteraction(addLog(ctx, `${ctx.cardMap.get(src)?.CardName ?? src}繧偵ご繝ｼ繝縺九ｉ髯､螟悶＠縺ｾ縺吶°・歔), {
      type: 'CHOOSE', options: optsBFG, count: 1,
    });
  }
  if (stub.id === 'INTERNAL_BANISH_FROM_GAME_DO') {
    const srcIBFG = ctx.sourceCardNum;
    if (!srcIBFG) return done(ctx);
    const newOwner = {
      ...ctx.ownerState,
      trash: ctx.ownerState.trash.filter(c => c !== srcIBFG),
      self_optional_effect_taken: true,
    };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcIBFG)?.CardName ?? srcIBFG}繧偵ご繝ｼ繝縺九ｉ髯､螟問・蠕檎ｶ壼柑譫懃匱蜍描));
  }
  if (stub.id === 'INTERNAL_BANISH_FROM_GAME_SKIP') {
    const newOwner = { ...ctx.ownerState, self_optional_effect_taken: false };
    return done(addLog({ ...ctx, ownerState: newOwner }, '髯､螟悶＠縺ｪ縺・・蠕檎ｶ壼柑譫懊せ繧ｭ繝・・'));
  }
  // 蟇ｾ謌ｦ逶ｸ謇九′謇区惆繧・譫夐∈繧薙〒謐ｨ縺ｦ繧・  if (stub.id === 'OPP_CHOOSE_YOUR_HAND_DISCARD') {
    const cands = ctx.ownerState.hand;
    if (cands.length === 0) return done(addLog(ctx, '謇区惆縺ｪ縺暦ｼ・PP_CHOOSE_YOUR_HAND_DISCARD・・));
    const trashAction: TrashAction = {
      type: 'TRASH',
      target: { type: 'HAND_CARD', owner: 'self', count: 1, upToCount: false },
    };
    return selectOrInteract(cands, 1, false, 'self_hand', trashAction, undefined, ctx, true);
  }
  // 繝√ぉ繝・け繧ｾ繝ｼ繝ｳ縺九ｉ髯､螟厄ｼ壼ｯｾ謌ｦ逶ｸ謇九・繝√ぉ繝・け繧ｾ繝ｼ繝ｳ縺ｮ繧ｫ繝ｼ繝峨ｒ繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'EXILE_FROM_CHECK_ZONE') {
    const target = ctx.otherState.field.check ?? ctx.ownerState.field.check;
    if (target) {
      const cardName = ctx.cardMap.get(target)?.CardName ?? target;
      if (ctx.otherState.field.check) {
        const newOther = {
          ...ctx.otherState,
          trash: [...ctx.otherState.trash, target],
          field: { ...ctx.otherState.field, check: null },
        };
        return done(addLog({ ...ctx, otherState: newOther }, `繝√ぉ繝・け繧ｾ繝ｼ繝ｳ縺九ｉ髯､螟厄ｼ・{cardName}・荏));
      } else {
        const newOwner = {
          ...ctx.ownerState,
          trash: [...ctx.ownerState.trash, target],
          field: { ...ctx.ownerState.field, check: null },
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `繝√ぉ繝・け繧ｾ繝ｼ繝ｳ縺九ｉ髯､螟厄ｼ・{cardName}・荏));
      }
    }
    return done(addLog(ctx, '繝√ぉ繝・け繧ｾ繝ｼ繝ｳ縺ｫ繧ｫ繝ｼ繝峨↑縺・));
  }
  // 縺昴・莉悶だ繝ｼ繝ｳ/繝ｬ繝吶Ν/繝輔ぉ繧､繧ｺ蛻ｶ髯・  if (stub.id === 'LRIG_ZONE_RESTRICT' || stub.id === 'LRIG_LEVEL_RESTRICT' || stub.id === 'EXTRA_PHASE_RESTRICT') {
    return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ蛻ｶ髯仙柑譫懶ｼ医Ο繧ｰ縺ｮ縺ｿ・・));
  }
  // 繧ｫ繝ｼ繝牙錐繧ｳ繝斐・邉ｻ
  // COPY_LRIG_NAME_ABILITY: 繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｮ繝ｫ繝ｪ繧ｰ蜷・繧ｿ繧､繝励ｒ迴ｾ蝨ｨ縺ｮ繝ｫ繝ｪ繧ｰ縺ｫ霑ｽ蜉
  if (stub.id === 'COPY_LRIG_NAME_ABILITY') {
    const srcCLNA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCLNA = srcCLNA ? (srcCLNA.EffectText ?? '') + ' ' + (srcCLNA.BurstText ?? '') : '';
    // 縲後Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ縺ゅｋ繝ｬ繝吶ΝN縺ｮ・懊せ繝医・繝ｪ繝ｼ蜷搾ｼ槭→蜷後§繧ｫ繝ｼ繝牙錐縺ｨ縺励※繧よ桶縺・・    const aliasM = txtCLNA.match(/繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ縺ゅｋ(?:繝ｬ繝吶Ν[・・・兔d]+縺ｮ)?・・[^・枉+)・・?:縺ｮ繝ｫ繝ｪ繧ｰ)?縺ｨ蜷後§繧ｫ繝ｼ繝牙錐縺ｨ縺励※繧よ桶縺・);
    if (aliasM) {
      const storyName = aliasM[1];
      // 繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉ蟇ｾ雎｡繧ｹ繝医・繝ｪ繝ｼ縺ｮ繝ｫ繝ｪ繧ｰ繧呈爾縺・      const targetLrig = ctx.ownerState.lrig_trash.find(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.CardClass?.includes(storyName) || c?.Story?.includes(storyName) || c?.CardName?.includes(storyName);
      });
      const aliasName = targetLrig ? (ctx.cardMap.get(targetLrig)?.CardName ?? storyName) : storyName;
      const currentAliases = ctx.ownerState.lrig_name_aliases ?? [];
      if (!currentAliases.includes(aliasName)) {
        const newOwner = { ...ctx.ownerState, lrig_name_aliases: [...currentAliases, aliasName] };
        return done(addLog({ ...ctx, ownerState: newOwner }, `繝ｫ繝ｪ繧ｰ縺後・{aliasName}縲榊錐縺ｨ縺励※繧よ桶繧上ｌ繧義));
      }
      return done(addLog(ctx, `繝ｫ繝ｪ繧ｰ蜷阪お繧､繝ｪ繧｢繧ｹ・・{aliasName}・芽ｨｭ螳壽ｸ医∩`));
    }
    return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ蜷阪さ繝斐・・医ユ繧ｭ繧ｹ繝郁ｧ｣譫蝉ｸ榊庄・・));
  }
  // 譚｡莉ｶ莉倥″繧｢繝ｼ繝・さ繧ｹ繝茨ｼ医さ繧ｹ繝郁ｨ育ｮ励・computeArtsEffectiveCost縺ｧ蜃ｦ逅・ｸ医∩縲√％縺薙〒縺ｯ譚｡莉ｶ遒ｺ隱阪・縺ｿ・・  if (stub.id === 'CONDITIONAL_ARTS_COST') {
    const srcCAC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCAC = srcCAC ? (srcCAC.EffectText ?? '') + ' ' + (srcCAC.BurstText ?? '') : '';
    const toHWCAC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // Pattern 1: 蟇ｾ謌ｦ逶ｸ謇九・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ濶ｲ譚｡莉ｶ・医さ繧ｹ繝井ｸ頑嶌縺搾ｼ・    const oppColorMCAC = txtCAC.match(/蟇ｾ謌ｦ逶ｸ謇九・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺・.+?)縺ｮ蝣ｴ蜷・);
    if (oppColorMCAC) {
      const oppLrigCard = ctx.otherState.field.lrig.at(-1);
      const oppLrigColor = oppLrigCard ? (ctx.cardMap.get(oppLrigCard)?.Color ?? '') : '';
      const colors = oppColorMCAC[1].split(/縺弓縺ｨ/).map(c => c.trim()).filter(Boolean);
      const condMet = colors.some(c => oppLrigColor.includes(c));
      return done(addLog(ctx, `譚｡莉ｶ莉倥″繧｢繝ｼ繝・さ繧ｹ繝茨ｼ育嶌謇九Ν繝ｪ繧ｰ${colors.join('/')}・・{condMet ? '譚｡莉ｶ驕疲・繝ｻ蜑ｲ蠑暮←逕ｨ貂医∩' : '譛ｪ驕疲・'}・荏));
    }
    // Pattern 2: 閾ｪ蛻・・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ繝ｬ繝吶Ν譚｡莉ｶ
    const myLvMCAC = txtCAC.match(/(?:縺ゅ↑縺溘・)?繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ繝ｬ繝吶Ν縺・[・・・兔d]+)(莉･荳掛莉･荳・/);
    if (myLvMCAC) {
      const threshold = parseInt(toHWCAC(myLvMCAC[1]));
      const op = myLvMCAC[2];
      const myLrigCard = ctx.ownerState.field.lrig.at(-1);
      const myLevel = myLrigCard ? parseInt(ctx.cardMap.get(myLrigCard)?.Level ?? '0') : 0;
      const condMet = op === '莉･荳・ ? myLevel >= threshold : myLevel <= threshold;
      return done(addLog(ctx, `譚｡莉ｶ莉倥″繧｢繝ｼ繝・さ繧ｹ繝茨ｼ医そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰLv${myLevel}${op}${threshold}・・{condMet ? '譚｡莉ｶ驕疲・' : '譛ｪ驕疲・'}・荏));
    }
    return done(addLog(ctx, '譚｡莉ｶ莉倥″繧｢繝ｼ繝・さ繧ｹ繝茨ｼ育｢ｺ隱榊ｮ御ｺ・ｼ・));
  }
  // INTERNAL_OTEC_SELECT: 繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ迚ｹ螳壹け繝ｩ繧ｹ縺ｮ繧ｫ繝ｼ繝峨ｒ驕ｸ謚槭＠縺ｦ繝医Λ繝・す繝･/謇区惆縺ｸ
  if (stub.id === 'INTERNAL_OTEC_SELECT') {
    const paramsOTEC = String(stub.value ?? 'trash::1');
    const [destOTEC, reqClassOTEC, cntStrOTEC] = paramsOTEC.split(':');
    const pickCountOTEC = parseInt(cntStrOTEC || '1') || 1;
    const energyCandsOTEC = ctx.ownerState.energy.filter(cn => {
      if (!reqClassOTEC) return true;
      return (ctx.cardMap.get(cn)?.CardClass ?? '').includes(reqClassOTEC);
    });
    if (energyCandsOTEC.length === 0) return done(addLog(ctx, `繧ｨ繝翫↓${reqClassOTEC || '繧ｫ繝ｼ繝・}縺ｪ縺暦ｼ・NTERNAL_OTEC_SELECT・荏));
    const moveStubOTEC: StubAction = { type: 'STUB', id: 'INTERNAL_OTEC_MOVE_SELECTED', value: destOTEC };
    return needsInteraction(addLog(ctx, `繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ驕ｸ謚橸ｼ・{reqClassOTEC || '繧ｫ繝ｼ繝・}・荏), {
      type: 'SELECT_TARGET', candidates: energyCandsOTEC,
      count: Math.min(pickCountOTEC, energyCandsOTEC.length),
      optional: true, targetScope: 'self_energy',
      thenAction: moveStubOTEC as EffectAction,
    });
  }
  // INTERNAL_OTEC_MOVE_SELECTED: applyDirectAction縺ｮdefault邨檎罰縺ｧ蜻ｼ縺ｰ繧後〕astProcessedCards[0]繧堤ｧｻ蜍・  if (stub.id === 'INTERNAL_OTEC_MOVE_SELECTED') {
    const destMOTEC = String(stub.value ?? 'trash');
    const selectedCardOTEC = ctx.lastProcessedCards?.[0];
    if (!selectedCardOTEC) return done(addLog(ctx, 'INTERNAL_OTEC_MOVE_SELECTED: 蟇ｾ雎｡縺ｪ縺・));
    const newEnergyOTEC = ctx.ownerState.energy.filter(cn => cn !== selectedCardOTEC);
    const cardNameOTEC = ctx.cardMap.get(selectedCardOTEC)?.CardName ?? selectedCardOTEC;
    let newOwnerOTEC = { ...ctx.ownerState, energy: newEnergyOTEC };
    if (destMOTEC === 'hand') {
      newOwnerOTEC = { ...newOwnerOTEC, hand: [...newOwnerOTEC.hand, selectedCardOTEC] };
      return done(addLog({ ...ctx, ownerState: newOwnerOTEC }, `${cardNameOTEC}繧偵お繝翫°繧画焔譛ｭ縺ｸ`));
    }
    newOwnerOTEC = { ...newOwnerOTEC, trash: [...newOwnerOTEC.trash, selectedCardOTEC] };
    return done(addLog({ ...ctx, ownerState: newOwnerOTEC }, `${cardNameOTEC}繧偵お繝翫°繧峨ヨ繝ｩ繝・す繝･縺ｸ`));
  }
  if (stub.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE') {
    return done(addLog(ctx, '繧ｻ繝ｳ繧ｿ繝ｼ繝ｬ繝吶Ν蝓ｺ貅門､壽萱・医Ο繧ｰ縺ｮ縺ｿ・・));
  }
  // 螟ｧ驥上ヨ繝ｩ繝・す繝･: 逶ｸ謇九お繝雁・菴・逶ｸ謇九す繧ｰ繝句・菴薙√∪縺溘・繧ｷ繧ｰ繝・繧ｭ繝ｼ
  if (stub.id === 'MASS_TRASH') {
    // 逶ｸ謇九・繧ｨ繝翫だ繝ｼ繝ｳ蜈ｨ繧ｫ繝ｼ繝・+ 繝輔ぅ繝ｼ繝ｫ繝牙・繧ｷ繧ｰ繝九ｒ繝医Λ繝・す繝･
    const oppSigniAll = ctx.otherState.field.signi.flatMap(s => s ?? []);
    const oppEnaAll = [...ctx.otherState.energy];
    const newOtherField: PlayerState['field'] = {
      ...ctx.otherState.field,
      signi: [null, null, null],
    };
    const newOther: PlayerState = {
      ...ctx.otherState,
      energy: [],
      trash: [...ctx.otherState.trash, ...oppSigniAll, ...oppEnaAll],
      field: newOtherField,
    };
    return done(addLog({ ...ctx, otherState: newOther },
      `逶ｸ謇九お繝・{oppEnaAll.length}譫・繧ｷ繧ｰ繝・{oppSigniAll.length}菴薙ｒ繝医Λ繝・す繝･`));
  }
  if (stub.id === 'TRASH_ALL_SIGNI_AND_KEY') {
    // 閾ｪ蛻・・繧ｷ繧ｰ繝句・菴・+ 繧ｭ繝ｼ繧偵ヨ繝ｩ繝・す繝･/繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ
    const srcTAK = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTAK = srcTAK ? (srcTAK.EffectText ?? '') : '';
    const isSelfTarget = !txtTAK.match(/蟇ｾ謌ｦ逶ｸ謇・);
    const target = isSelfTarget ? 'self' : 'opponent';
    const st = ownerState(target, ctx);
    const signiAll = st.field.signi.flatMap(s => s ?? []);
    const keyCard = st.field.key_piece;
    const newField: PlayerState['field'] = { ...st.field, signi: [null, null, null], key_piece: null };
    const newSt: PlayerState = {
      ...st,
      trash: [...st.trash, ...signiAll],
      lrig_trash: keyCard ? [...st.lrig_trash, keyCard] : st.lrig_trash,
      field: newField,
    };
    return done(addLog(setOwnerState(target, newSt, ctx),
      `繧ｷ繧ｰ繝・{signiAll.length}菴・{keyCard ? '+繧ｭ繝ｼ' : ''}繧偵ヨ繝ｩ繝・す繝･縺ｸ`));
  }
  // 繝・ャ繧ｭ蜈ｬ髢九＠縺ｦ繧ｷ繧ｰ繝九ｒ蝣ｴ縺ｫ蜃ｺ縺・  if (stub.id === 'REVEAL_PICK_PLAY') {
    const srcRPP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRPP = srcRPP ? (srcRPP.EffectText ?? '') + ' ' + (srcRPP.BurstText ?? '') : '';
    // 縲舌す繝ｼ繝峨代→縺励※險ｭ鄂ｮ縺吶ｋ繝代ち繝ｼ繝ｳ・医後◎繧後ｒ縲舌す繝ｼ繝峨代→縺励※...縲咲ｭ会ｼ・    if (txtRPP.match(/縲舌す繝ｼ繝峨代→縺励※.*繧ｷ繧ｰ繝九だ繝ｼ繝ｳ縺ｫ蜃ｺ縺励※繧ゅｈ縺・) || txtRPP.match(/縲舌す繝ｼ繝峨代→縺励※.*繧ｷ繧ｰ繝九だ繝ｼ繝ｳ縺ｫ蜃ｺ縺吶°/)) {
      const topCardsRPPS = ctx.ownerState.deck.slice(0, 1);
      if (topCardsRPPS.length === 0) return done(addLog(ctx, 'REVEAL_PICK_PLAY(SEED): 繝・ャ繧ｭ縺ｪ縺・));
      return needsInteraction(addLog(ctx, '縲舌す繝ｼ繝峨代→縺励※險ｭ鄂ｮ縺吶ｋ繧ｫ繝ｼ繝峨ｒ驕ｸ謚橸ｼ井ｻｻ諢擾ｼ・), {
        type: 'SEARCH',
        visibleCards: topCardsRPPS,
        maxPick: 1,
        thenAction: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction,
        continuation: ({ type: 'STUB', id: 'INTERNAL_SEED_FROM_DECK' } as StubAction) as EffectAction,
      });
    }
    const toHWR = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealCountM = txtRPP.match(/繧ｫ繝ｼ繝峨ｒ([・・・兔d]+)譫・?:隕九ｋ|蜈ｬ髢九☆繧・/);
    const revealCount = revealCountM ? parseInt(toHWR(revealCountM[1])) : 5;
    const deckCards = ctx.ownerState.deck.slice(0, Math.min(revealCount, ctx.ownerState.deck.length));
    if (deckCards.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺暦ｼ・EVEAL_PICK_PLAY・・));
    // 蝣ｴ縺ｫ蜃ｺ縺帙ｋ繧ｷ繧ｰ繝九ｒ繝輔ぅ繝ｫ繧ｿ・育ｰ｡譏難ｼ壹後す繧ｰ繝九阪ち繧､繝暦ｼ・    const signiCards = deckCards.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
    const pickCount = txtRPP.match(/繧ｷ繧ｰ繝九ｒ([・・・兔d]+)譫壹∪縺ｧ蝣ｴ縺ｫ蜃ｺ縺・) ? parseInt(toHWR(RegExp.$1)) : 1;
    const addFieldAction: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
    const restToTrashAction: TrashAction = {
      type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 'ALL' },
    };
    const pending: PendingInteractionDef = {
      type: 'SEARCH',
      visibleCards: deckCards,
      maxPick: Math.min(pickCount, signiCards.length),
      thenAction: addFieldAction,
      restDest: 'trash',
      continuation: restToTrashAction,
    };
    // 繝・ャ繧ｭ縺九ｉ蜈ｬ髢九＠縺溷・繧帝勁蜴ｻ
    const newOwnerDeck = ctx.ownerState.deck.slice(deckCards.length);
    return needsInteraction(
      addLog({ ...ctx, ownerState: { ...ctx.ownerState, deck: newOwnerDeck } }, `繝・ャ繧ｭ荳・{deckCards.length}譫壼・髢具ｼ医す繧ｰ繝九ｒ蝣ｴ縺ｫ・荏),
      pending,
    );
  }
  // 繝・ャ繧ｭ縺九ｉ謗｢縺励※繧ゅｈ縺・ｼ・EVEAL_AND_PICK: 繧ｷ繧ｰ繝区､懃ｴ｢竊呈焔譛ｭor蝣ｴ・・  if (stub.id === 'REVEAL_AND_PICK') {
    const srcRAP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRAP = srcRAP ? (srcRAP.EffectText ?? '') + ' ' + (srcRAP.BurstText ?? '') : '';
    const toHWRAP = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const countM = txtRAP.match(/繧ｷ繧ｰ繝・[・・・兔d]+)譫壹ｒ謗｢縺励※/);
    const pickCount = countM ? parseInt(toHWRAP(countM[1])) : 1;
    // 繝・ャ繧ｭ蜈ｨ菴薙°繧峨す繧ｰ繝九・縺ｿ繧偵ヵ繧｣繝ｫ繧ｿ
    const signiInDeck = ctx.ownerState.deck.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
    if (signiInDeck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｫ繧ｷ繧ｰ繝九↑縺・));
    const toField = txtRAP.match(/蝣ｴ縺ｫ蜃ｺ縺・) && !txtRAP.match(/謇区惆縺ｫ蜉縺医ｋ/);
    const thenAction: EffectAction = toField
      ? { type: 'ADD_TO_FIELD', owner: 'self' } as AddToFieldAction
      : { type: 'ADD_TO_HAND', owner: 'self' } as AddToHandAction;
    const shuffleAction: ShuffleDeckAction = { type: 'SHUFFLE_DECK', owner: 'self' };
    const pending: PendingInteractionDef = {
      type: 'SEARCH',
      visibleCards: signiInDeck,
      maxPick: Math.min(pickCount, signiInDeck.length),
      thenAction,
      afterAction: shuffleAction,
    };
    return needsInteraction(addLog(ctx, `繝・ャ繧ｭ縺九ｉ繧ｷ繧ｰ繝九ｒ${pickCount}譫壹∪縺ｧ讀懃ｴ｢`), pending);
  }
  // 繝・ャ繧ｭ繧呈擅莉ｶ縺梧ｺ縺溘＆繧後ｋ縺ｾ縺ｧ蜈ｬ髢九☆繧・  if (stub.id === 'DECK_REVEAL_UNTIL' || stub.id === 'DECK_REVEAL_UNTIL_CLASS' || stub.id === 'OPP_DECK_REVEAL_UNTIL') {
    const isOpp = stub.id === 'OPP_DECK_REVEAL_UNTIL';
    const stateRU = isOpp ? ctx.otherState : ctx.ownerState;
    const srcRU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRU = srcRU ? (srcRU.EffectText ?? '') + ' ' + (srcRU.BurstText ?? '') : '';
    const toHWRU = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 蛛懈ｭ｢譚｡莉ｶ繧定ｧ｣譫・    const classM = txtRU.match(/・・[^・枉+)・槭・繧ｷ繧ｰ繝九′繧√￥繧後ｋ縺ｾ縺ｧ/);
    const targetClassRU = classM ? classM[1] : null;
    const lvM = txtRU.match(/繝ｬ繝吶Ν([・・・兔d]+)繧呈戟縺､/);
    const targetLvRU = lvM ? parseInt(toHWRU(lvM[1])) : null;
    const untilSigniRU = !!txtRU.match(/繧ｷ繧ｰ繝九′繧√￥繧後ｋ縺ｾ縺ｧ/);
    const untilNameRU = !!txtRU.match(/螳｣險縺励◆繧ｫ繝ｼ繝峨′繧√￥繧後ｋ縺ｾ縺ｧ|螳｣險縺励◆繧ｫ繝ｼ繝峨′蜈ｬ髢九＆繧後ｋ縺ｾ縺ｧ/);
    const declaredNameRU = ctx.ownerState.declared_card_name ?? null;
    const toTrashRestRU = !!txtRU.match(/谿九ｊ繧偵ヨ繝ｩ繝・す繝･縺ｫ鄂ｮ縺・);
    const toBottomRestRU = !!txtRU.match(/谿九ｊ.*繝・ャ繧ｭ縺ｮ荳逡ｪ荳・);
    // 繝・ャ繧ｭ繧貞・鬆ｭ縺九ｉ蜈ｬ髢九＠縺ｦ縺・￥
    const deckRU = [...stateRU.deck];
    const revealedRU: string[] = [];
    let hitCardRU: string | null = null;
    for (const cn of deckRU) {
      revealedRU.push(cn);
      const card = ctx.cardMap.get(cn);
      let stop = false;
      if (untilSigniRU && card?.Type === '繧ｷ繧ｰ繝・) {
        if (!targetClassRU || card?.CardClass?.includes(targetClassRU)) {
          if (!targetLvRU || parseInt(card?.Level ?? '0') === targetLvRU) stop = true;
        }
      }
      if (untilNameRU && declaredNameRU && card?.CardName === declaredNameRU) stop = true;
      if (!untilSigniRU && !untilNameRU) { break; } // 譚｡莉ｶ荳肴・・壼・鬆ｭ1譫・      if (stop) { hitCardRU = cn; break; }
    }
    const nonHitRU = revealedRU.filter(cn => cn !== hitCardRU);
    let newStateRU = { ...stateRU, deck: deckRU.filter(cn => !revealedRU.includes(cn)) };
    if (toTrashRestRU && nonHitRU.length > 0) newStateRU = { ...newStateRU, trash: [...newStateRU.trash, ...nonHitRU] };
    if (toBottomRestRU && nonHitRU.length > 0) newStateRU = { ...newStateRU, deck: [...newStateRU.deck, ...nonHitRU] };
    const newCtxRU = isOpp
      ? { ...ctx, otherState: newStateRU, lastProcessedCards: hitCardRU ? [hitCardRU] : [] }
      : { ...ctx, ownerState: newStateRU, lastProcessedCards: hitCardRU ? [hitCardRU] : [] };
    const hitNameRU = hitCardRU ? ctx.cardMap.get(hitCardRU)?.CardName ?? hitCardRU : '繝偵ャ繝医↑縺・;
    return done(addLog(newCtxRU, `繝・ャ繧ｭ蜈ｬ髢・${revealedRU.length}譫・竊・繝偵ャ繝・ ${hitNameRU}`));
  }
  // SONG_FRAGMENT: 繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ縲先ｭ後・繧ｫ繧ｱ繝ｩ縲第戟縺｡繧ｫ繝ｼ繝峨ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺阪√◎縺ｮ蜉ｹ譫懊ｒ逋ｺ蜍・  // 縲後％縺ｮ繝ｫ繝ｪ繧ｰ縺ｯ縺昴・繧ｫ繝ｼ繝峨・縲先ｭ後・繧ｫ繧ｱ繝ｩ縲代ｒ菴ｿ逕ｨ縺吶ｋ縲・ 繝ｫ繝ｪ繧ｰ蜉ｹ譫懊→縺励※謇ｱ縺・  if (stub.id === 'SONG_FRAGMENT') {
    const lrigCardNumSF = ctx.sourceCardNum; // 逋ｺ蜍募・繝ｫ繝ｪ繧ｰ
    const songCardsInEnergy = ctx.ownerState.energy.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.EffectText?.includes('縲先ｭ後・繧ｫ繧ｱ繝ｩ縲・);
    });
    if (songCardsInEnergy.length === 0) return done(addLog(ctx, '豁後・繧ｫ繧ｱ繝ｩ・壹お繝翫だ繝ｼ繝ｳ縺ｫ繧ｫ繝ｼ繝峨↑縺・));
    if (songCardsInEnergy.length > 1) {
      // 隍・焚縺ゅｋ蝣ｴ蜷医・SELECT_TARGET縺ｧ驕ｸ謚・竊・INTERNAL_SONG_FRAGMENT縺ｧ蜃ｦ逅・      const internalSF: StubAction = { type: 'STUB', id: 'INTERNAL_SONG_FRAGMENT', value: lrigCardNumSF };
      const pendingSF: PendingInteractionDef = {
        type: 'SELECT_TARGET',
        candidates: songCardsInEnergy,
        count: 1,
        optional: false,
        targetScope: 'self_energy',
        thenAction: internalSF as EffectAction,
      };
      return needsInteraction(addLog(ctx, '豁後・繧ｫ繧ｱ繝ｩ繧ｫ繝ｼ繝峨ｒ驕ｸ謚・), pendingSF);
    }
    const songCard = songCardsInEnergy[0];
    const songCardData = ctx.cardMap.get(songCard);
    const newOwnerSF: PlayerState = {
      ...ctx.ownerState,
      energy: ctx.ownerState.energy.filter(cn => cn !== songCard),
      trash: [...ctx.ownerState.trash, songCard],
    };
    const songEffects = parseCardEffects(songCardData!);
    const songEff = songEffects.find(e => e.effectType === 'SONG_ICON');
    if (songEff) {
      // sourceCardNum 繧偵Ν繝ｪ繧ｰ縺ｮCardNum縺ｫ險ｭ螳夲ｼ医Ν繝ｪ繧ｰ蜉ｹ譫懊→縺励※謇ｱ縺・◆繧・ｼ・      const songCtx = { ...ctx, ownerState: newOwnerSF, sourceCardNum: lrigCardNumSF };
      return exec(songEff.action, addLog(songCtx, `縲先ｭ後・繧ｫ繧ｱ繝ｩ縲醍匱蜍包ｼ・{songCardData?.CardName ?? songCard}・会ｼ壹Ν繝ｪ繧ｰ蜉ｹ譫懊→縺励※蜃ｦ逅・));
    }
    return done(addLog({ ...ctx, ownerState: newOwnerSF }, `豁後・繧ｫ繧ｱ繝ｩ・・{songCardData?.CardName ?? songCard}・会ｼ壼柑譫懊↑縺輿));
  }
  // INTERNAL_SONG_FRAGMENT: SELECT_TARGET縺ｧ驕ｸ謚槭＆繧後◆繧ｫ繝ｼ繝峨〒豁後・繧ｫ繧ｱ繝ｩ逋ｺ蜍・  if (stub.id === 'INTERNAL_SONG_FRAGMENT') {
    const selectedSF = ctx.lastProcessedCards?.[0];
    // stub.value 縺ｫ繝ｫ繝ｪ繧ｰCardNum縺梧ｼ邏阪＆繧後※縺・ｋ・・ONG_FRAGMENT縺九ｉ貂｡縺輔ｌ繧具ｼ・    const lrigCardNumISF = typeof stub.value === 'string' ? stub.value : ctx.sourceCardNum;
    if (!selectedSF) return done(addLog(ctx, 'INTERNAL_SONG_FRAGMENT: 驕ｸ謚槭↑縺・));
    const songCardDataISF = ctx.cardMap.get(selectedSF);
    const newOwnerISF: PlayerState = {
      ...ctx.ownerState,
      energy: ctx.ownerState.energy.filter(cn => cn !== selectedSF),
      trash: [...ctx.ownerState.trash, selectedSF],
    };
    const songEffsISF = parseCardEffects(songCardDataISF!);
    const songEffISF = songEffsISF.find(e => e.effectType === 'SONG_ICON');
    if (songEffISF) {
      // sourceCardNum 繧偵Ν繝ｪ繧ｰ縺ｮCardNum縺ｫ險ｭ螳夲ｼ医Ν繝ｪ繧ｰ蜉ｹ譫懊→縺励※謇ｱ縺・◆繧・ｼ・      const songCtxISF = { ...ctx, ownerState: newOwnerISF, sourceCardNum: lrigCardNumISF };
      return exec(songEffISF.action, addLog(songCtxISF, `縲先ｭ後・繧ｫ繧ｱ繝ｩ縲醍匱蜍包ｼ・{songCardDataISF?.CardName ?? selectedSF}・会ｼ壹Ν繝ｪ繧ｰ蜉ｹ譫懊→縺励※蜃ｦ逅・));
    }
    return done(addLog({ ...ctx, ownerState: newOwnerISF }, `豁後・繧ｫ繧ｱ繝ｩ・・{songCardDataISF?.CardName ?? selectedSF}・会ｼ壼柑譫懊↑縺輿));
  }
  // 繧ｲ繝ｼ繝蜈ｨ菴楢・蜉帑ｻ倅ｸ・  if (stub.id === 'GAIN_ABILITY_THIS_GAME') {
    const srcGA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGA = srcGA ? (srcGA.EffectText ?? '') + ' ' + (srcGA.BurstText ?? '') : '';
    let ctxGA = ctx;
    const logsGA: string[] = [];
    // 縲後≠縺ｪ縺溘・繧ｰ繝ｭ繧ｦ縺ｧ縺阪↑縺・搾ｼ医後％縺ｮ繧ｲ繝ｼ繝縺ｮ髢薙榊唱繧貞性繧隍・粋譁・ｂ蜷ｫ繧・・    if (txtGA.match(/縺ゅ↑縺溘・繧ｰ繝ｭ繧ｦ縺ｧ縺阪↑縺・)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, no_grow: true } };
      logsGA.push('繧ｰ繝ｭ繧ｦ荳榊庄・医％縺ｮ繧ｲ繝ｼ繝・・);
    }
    // 縲悟ｯｾ謌ｦ逶ｸ謇九・繧ｰ繝ｭ繧ｦ縺ｧ縺阪↑縺・・    if (txtGA.match(/蟇ｾ謌ｦ逶ｸ謇九・繧ｰ繝ｭ繧ｦ縺ｧ縺阪↑縺・)) {
      ctxGA = { ...ctxGA, otherState: { ...ctxGA.otherState, no_grow: true } };
      logsGA.push('逶ｸ謇九げ繝ｭ繧ｦ荳榊庄・医％縺ｮ繧ｲ繝ｼ繝・・);
    }
    // 縲後≠縺ｪ縺溘・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ縲舌ム繝悶Ν繧ｯ繝ｩ繝・す繝･縲代ｒ蠕励ｋ縲坂・ keyword_grants縺ｫ霑ｽ蜉
    if (txtGA.match(/繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ縲舌ム繝悶Ν繧ｯ繝ｩ繝・す繝･縲代ｒ蠕・)) {
      const centerGAcn = ctxGA.ownerState.field.lrig.at(-1);
      if (centerGAcn) {
        const grantsGA = { ...(ctxGA.ownerState.keyword_grants ?? {}) };
        grantsGA[centerGAcn] = [...new Set([...(grantsGA[centerGAcn] ?? []), '繝繝悶Ν繧ｯ繝ｩ繝・す繝･'])];
        ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, keyword_grants: grantsGA } };
        logsGA.push('繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｫ繝繝悶Ν繧ｯ繝ｩ繝・す繝･莉倅ｸ趣ｼ医％縺ｮ繧ｲ繝ｼ繝・・);
      }
    }
    // 縲後≠縺ｪ縺溘・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ縲舌Λ繝ｳ繧ｵ繝ｼ縲代ｒ蠕励ｋ縲・    if (txtGA.match(/繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ縲舌Λ繝ｳ繧ｵ繝ｼ縲代ｒ蠕・)) {
      const centerGAL = ctxGA.ownerState.field.lrig.at(-1);
      if (centerGAL) {
        const grantsGAL = { ...(ctxGA.ownerState.keyword_grants ?? {}) };
        grantsGAL[centerGAL] = [...new Set([...(grantsGAL[centerGAL] ?? []), '繝ｩ繝ｳ繧ｵ繝ｼ'])];
        ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, keyword_grants: grantsGAL } };
        logsGA.push('繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｫ繝ｩ繝ｳ繧ｵ繝ｼ莉倅ｸ趣ｼ医％縺ｮ繧ｲ繝ｼ繝・・);
      }
    }
    // 縲後％縺ｮ繧ｲ繝ｼ繝縺ｮ髢薙√≠縺ｪ縺溘・・槭ｒ菴ｿ逕ｨ縺ｧ縺阪↑縺・・    const blockMGA = txtGA.match(/縺薙・繧ｲ繝ｼ繝縺ｮ髢薙√≠縺ｪ縺溘・縲・[^縲犠+)縲九ｒ菴ｿ逕ｨ縺ｧ縺阪↑縺・);
    if (blockMGA) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, blocked_card_names: [...(ctxGA.ownerState.blocked_card_names ?? []), blockMGA[1]] } };
      logsGA.push(`縲・{blockMGA[1]}縲九・菴ｿ逕ｨ繧偵ヶ繝ｭ繝・け`);
    }
    if (logsGA.length > 0) return done(addLog(ctxGA, logsGA.join('繝ｻ')));
    return done(addLog(ctx, '縺薙・繧ｲ繝ｼ繝縺ｮ髢難ｼ夊・蜉帑ｻ倅ｸ趣ｼ医Ο繧ｰ縺ｮ縺ｿ・・));
  }
  // 繝｡繧､繝ｳ繝輔ぉ繧､繧ｺ邨ゆｺ・  if (stub.id === 'SKIP_MAIN_PHASE') {
    return done(addLog(ctx, '繝｡繧､繝ｳ繝輔ぉ繧､繧ｺ邨ゆｺ・ｼ・attleScreen蛛ｴ蜃ｦ逅・ｼ・));
  }
  // 繝ｩ繧､繝輔け繝ｭ繧ｹ縺ｮ荳逡ｪ荳翫ｒ謇区惆縺ｫ蜉縺医ｋ
  if (stub.id === 'CRASH_LIFE_TO_HAND') {
    const srcCLH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCLH = srcCLH ? (srcCLH.EffectText ?? '') + ' ' + (srcCLH.BurstText ?? '') : '';
    // 蟇ｾ雎｡繝励Ξ繧､繝､繝ｼ繧貞愛螳・    const isOpp = txtCLH.match(/蟇ｾ謌ｦ逶ｸ謇九・繝ｩ繧､繝輔け繝ｭ繧ｹ.*謇区惆縺ｫ蜉縺医ｋ/);
    const target = isOpp ? 'opponent' : 'self';
    const st = ownerState(target, ctx);
    if (st.life_cloth.length === 0) return done(addLog(ctx, '繝ｩ繧､繝輔け繝ｭ繧ｹ縺ｪ縺暦ｼ・RASH_LIFE_TO_HAND・・));
    const top = st.life_cloth[st.life_cloth.length - 1];
    const newSt: PlayerState = {
      ...st,
      life_cloth: st.life_cloth.slice(0, -1),
      hand: [...st.hand, top],
    };
    const name = ctx.cardMap.get(top)?.CardName ?? top;
    return done(addLog(setOwnerState(target, newSt, ctx), `繝ｩ繧､繝輔け繝ｭ繧ｹ荳奇ｼ・{name}・峨ｒ謇区惆縺ｸ`));
  }
  // 繧ｯ繝ｩ繧ｹ/濶ｲ螳｣險
  if (stub.id === 'DECLARE_CLASS') {
    return done(addLog(ctx, '繧ｯ繝ｩ繧ｹ螳｣險・医Ο繧ｰ縺ｮ縺ｿ・・));
  }
  if (stub.id === 'DECLARE_COLOR') {
    const colorsDC = ['逋ｽ', '襍､', '髱・, '邱・, '鮟・];
    const setColorDC = (c: string): StubAction => ({ type: 'STUB', id: 'INTERNAL_SET_DECLARED_COLOR', value: c });
    const optsDC = colorsDC.map(c => ({
      id: `color_${c}`, label: `${c}繧貞ｮ｣險`, action: setColorDC(c) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, '濶ｲ繧貞ｮ｣險縺励※縺上□縺輔＞・育區/襍､/髱・邱・鮟抵ｼ・), {
      type: 'CHOOSE', options: optsDC, count: 1,
    });
  }
  if (stub.id === 'INTERNAL_SET_DECLARED_COLOR') {
    const colorSDC = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const newOwnerSDC = { ...ctx.ownerState, declared_color: colorSDC };
    return done(addLog({ ...ctx, ownerState: newOwnerSDC }, `濶ｲ縲・{colorSDC}縲阪ｒ螳｣險`));
  }
  // 繧ｿ繝ｼ繧ｲ繝・ヨ驕ｸ謚槭・縺ｿ・・astProcessedCards 縺ｫ譬ｼ邏阪＠蠕檎ｶ壹せ繝・ャ繝励∈・・  if (stub.id === 'TARGET_ONLY') {
    const srcTO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTO = srcTO ? (srcTO.EffectText ?? '') + ' ' + (srcTO.BurstText ?? '') : '';
    // 繝・く繧ｹ繝医°繧芽・蛻・逶ｸ謇九←縺｡繧峨・繧ｷ繧ｰ繝九ｒ驕ｸ縺ｶ縺句愛譁ｭ
    const isOwnTO = (txtTO.includes('縺ゅ↑縺溘・繧ｷ繧ｰ繝・) || txtTO.includes('閾ｪ蛻・・繧ｷ繧ｰ繝・))
      && !txtTO.match(/蟇ｾ謌ｦ逶ｸ謇・{0,5}繧ｷ繧ｰ繝・);
    const stateTO = isOwnTO ? ctx.ownerState : ctx.otherState;
    const scopeTO: TargetScope = isOwnTO ? 'self_field' : 'opp_field';
    const candsTO = fieldCandidates(stateTO, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (candsTO.length === 0) return done(addLog(ctx, '蟇ｾ雎｡繧ｷ繧ｰ繝九↑縺暦ｼ・ARGET_ONLY・・));
    const noopTO: SequenceAction = { type: 'SEQUENCE', steps: [] };
    return selectOrInteract(candsTO, 1, false, scopeTO, noopTO as EffectAction, undefined, ctx);
  }
  // 繝・ャ繧ｭ荳劾譫壼・髢九＠縺ｦM譫壹ｒ謇区惆縺ｫ蜉縺域ｮ九ｊ繧偵ョ繝・く荳・繝医Λ繝・す繝･/繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ
  if (stub.id === 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM') {
    const params = (stub as StubAction & { revealPickParams?: { pickCount: number | 'ALL'; restDest: 'deck_bottom' | 'trash' | 'energy'; then: 'hand' | 'energy' } }).revealPickParams
      ?? { pickCount: 1, restDest: 'deck_bottom' as const, then: 'hand' as const };
    const effText = ctx.sourceCardNum
      ? (ctx.cardMap.get(ctx.sourceCardNum)?.EffectText ?? '') + ' ' + (ctx.cardMap.get(ctx.sourceCardNum)?.BurstText ?? '')
      : '';
    const toHW = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealM = effText.match(/繧ｫ繝ｼ繝峨ｒ([・・・兔d]+)譫・?:隕九ｋ|蜈ｬ髢九☆繧・/);
    const revealCount = revealM ? parseInt(toHW(revealM[1])) : 5;
    const deckCards = ctx.ownerState.deck.slice(0, Math.min(revealCount, ctx.ownerState.deck.length));
    if (deckCards.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺暦ｼ・EVEAL_PICK・・));
    const maxPick = params.pickCount === 'ALL' ? deckCards.length : (params.pickCount as number);
    const addHandAction: AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    const pending: PendingInteractionDef = {
      type: 'SEARCH',
      visibleCards: deckCards,
      maxPick,
      thenAction: addHandAction,
      restDest: params.restDest,
    };
    return needsInteraction(addLog(ctx, `繝・ャ繧ｭ荳・{deckCards.length}譫壼・髢具ｼ・{maxPick}譫壹∪縺ｧ謇区惆縺ｫ・荏), pending);
  }
  // 繧ｽ繧ｦ繝ｫ/繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ謫堺ｽ・  if (stub.id === 'SOUL_OP') {
    const srcSO = ctx.sourceCardNum;
    const effSOtxt = srcSO ? (ctx.cardMap.get(srcSO)?.EffectText ?? '') + ' ' + (ctx.cardMap.get(srcSO)?.BurstText ?? '') : '';
    const processed = ctx.lastProcessedCards ?? [];
    const toHWSO = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 縲後◎繧後ｒ繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ蜉縺医ｋ縲坂・ sourceCardNum繧値rig_deck縺ｸ
    if (effSOtxt.match(/縺昴ｌ繧偵Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ蜉縺医ｋ/) && srcSO) {
      const newOwner = { ...ctx.ownerState, lrig_trash: ctx.ownerState.lrig_trash.filter(n => n !== srcSO), lrig_deck: [...(ctx.ownerState.lrig_deck ?? []), srcSO] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcSO)?.CardName ?? srcSO}繧偵Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｸ`));
    }
    // 縲後◎繧後ｉ繧偵Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺上坂・ lastProcessedCards繧値rig_trash縺ｸ
    if ((effSOtxt.match(/縺昴ｌ繧峨ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・) || effSOtxt.match(/繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・)) && processed.length > 0) {
      const newOwner = { ...ctx.ownerState, lrig_trash: [...ctx.ownerState.lrig_trash, ...processed] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `${processed.length}譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ`));
    }
    // 縲後Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉ繧｢繝ｼ繝・ｒ繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ謌ｻ縺吶・    if (effSOtxt.match(/繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉ.*繧｢繝ｼ繝・*繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ蜉縺医ｋ/)) {
      const artsInLrigTrash = ctx.ownerState.lrig_trash.filter(cn => ctx.cardMap.get(cn)?.Type === '繧｢繝ｼ繝・);
      if (artsInLrigTrash.length > 0) {
        const toMove = artsInLrigTrash.slice(0, 1);
        const newOwner = {
          ...ctx.ownerState,
          lrig_trash: ctx.ownerState.lrig_trash.filter(cn => !toMove.includes(cn)),
          lrig_deck: [...(ctx.ownerState.lrig_deck ?? []), ...toMove],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(toMove[0])?.CardName ?? toMove[0]}繧偵Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｸ`));
      }
      return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ繧｢繝ｼ繝・↑縺・));
    }
    // 縲後％縺ｮ繧ｫ繝ｼ繝峨ｒ繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九↓鄂ｮ縺上坂・ sourceCardNum繧値rig_deck縺ｮ蜈磯ｭ・医Ν繝ｪ繧ｰ縺ｮ荳具ｼ峨∈
    if (effSOtxt.match(/縺薙・繧ｫ繝ｼ繝峨ｒ縺ゅ↑縺溘・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九↓鄂ｮ縺・) && srcSO) {
      // 繝ｫ繝ｪ繧ｰ縺ｮ荳・= lrig_deck 縺ｮ譛ｫ蟆ｾ・亥・鬆ｭ縺後ヨ繝・・・峨↓霑ｽ蜉
      const lrig_deck = ctx.ownerState.lrig_deck ?? [];
      // 謇区惆縺九ｉ蜿悶ｊ髯､縺・      const newHand = ctx.ownerState.hand.filter(cn => cn !== srcSO);
      const newOwner = { ...ctx.ownerState, hand: newHand, lrig_deck: [...lrig_deck, srcSO] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcSO)?.CardName ?? srcSO}繧偵Ν繝ｪ繧ｰ繝・ャ繧ｭ・医Ν繝ｪ繧ｰ荳具ｼ峨∈`));
    }
    // 縲後Ν繝ｪ繧ｰ繝・ャ繧ｭ縺九ｉN譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺上・    const lrigDeckTrashM = effSOtxt.match(/繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ(?:縺ｮ荳翫°繧・?([・・・兔d]+)譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ/);
    if (lrigDeckTrashM) {
      const count = parseInt(toHWSO(lrigDeckTrashM[1]));
      const lrig_deck = ctx.ownerState.lrig_deck ?? [];
      const toTrash = lrig_deck.slice(0, Math.min(count, lrig_deck.length));
      if (toTrash.length > 0) {
        const newOwner = {
          ...ctx.ownerState,
          lrig_deck: lrig_deck.slice(toTrash.length),
          lrig_trash: [...ctx.ownerState.lrig_trash, ...toTrash],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ荳・{toTrash.length}譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ`));
      }
      return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｪ縺・));
    }
    // 縲後％縺ｮ繝ｫ繝ｪ繧ｰ縺ｮ荳九°繧峨き繝ｼ繝会ｼ第椢繧偵す繧ｰ繝九・縲舌た繧ｦ繝ｫ縲代↓縺吶ｋ縲・    if (effSOtxt.match(/縺薙・繝ｫ繝ｪ繧ｰ縺ｮ荳九°繧峨き繝ｼ繝閏・・]譫壹ｒ縺昴ｌ縺ｮ縲舌た繧ｦ繝ｫ縲代↓縺吶ｋ/)) {
      const lrigStack = ctx.ownerState.field.lrig;
      const underCards = lrigStack.length > 1 ? lrigStack.slice(0, -1) : [];
      if (underCards.length === 0) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ縺ｮ荳九↓繧ｫ繝ｼ繝峨↑縺暦ｼ医た繧ｦ繝ｫ莉倅ｸ趣ｼ・));
      const selfSigniCands = [0, 1, 2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((c): c is string => !!c);
      if (selfSigniCands.length === 0) return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ莉倅ｸ主ｯｾ雎｡繧ｷ繧ｰ繝九↑縺・));
      // SELECT_TARGET縺ｧ蟇ｾ雎｡繧ｷ繧ｰ繝九ｒ驕ｸ謚槭＠縺ｦ縺九ｉ繧ｽ繧ｦ繝ｫ繧剃ｻ倅ｸ・      const soulCard = underCards[underCards.length - 1]; // 繝ｫ繝ｪ繧ｰ逶ｴ荳九・繧ｫ繝ｼ繝峨ｒ菴ｿ逕ｨ
      const attachSoulStub: StubAction = {
        type: 'STUB', id: 'INTERNAL_ATTACH_SOUL_FROM_LRIG', value: soulCard,
      };
      return selectOrInteract(selfSigniCands, 1, false, 'self_field', attachSoulStub, undefined, ctx);
    }
    // 縲後Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉ繝ｫ繝ｪ繧ｰ・第椢繧偵す繧ｰ繝九・縲舌た繧ｦ繝ｫ縲代↓縺吶ｋ縲・    if (effSOtxt.match(/繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉ繝ｫ繝ｪ繧ｰ[・・]譫壹ｒ縺昴ｌ縺ｮ縲舌た繧ｦ繝ｫ縲代↓縺吶ｋ/)) {
      const lrigInTrash = ctx.ownerState.lrig_trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.Type === '繝ｫ繝ｪ繧ｰ' || c?.Type === '繧｢繧ｷ繧ｹ繝医Ν繝ｪ繧ｰ';
      });
      if (lrigInTrash.length === 0) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ繝ｫ繝ｪ繧ｰ縺ｪ縺・));
      const selfSigniSoulCands = [0, 1, 2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((c): c is string => !!c);
      if (selfSigniSoulCands.length === 0) return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ莉倅ｸ主ｯｾ雎｡繧ｷ繧ｰ繝九↑縺・));
      // 縺ｾ縺壼ｯｾ雎｡繧ｷ繧ｰ繝九ｒ驕ｸ謚・竊・INTERNAL_CHOOSE_SOUL_LRIG 縺ｧ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉ驕ｸ謚・      const chooseSoulStub: StubAction = {
        type: 'STUB', id: 'INTERNAL_CHOOSE_SOUL_LRIG',
      };
      return selectOrInteract(selfSigniSoulCands, 1, false, 'self_field', chooseSoulStub, undefined, ctx);
    }
    // 縲後％縺ｮ繝ｫ繝ｪ繧ｰ縺ｮ荳九°繧峨き繝ｼ繝丑譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・※繧ゅｈ縺・搾ｼ井ｻｻ諢上・WXDi-P04/05/06-009邉ｻ・・    const lrigUnderOptM = effSOtxt.match(/縺薙・繝ｫ繝ｪ繧ｰ縺ｮ荳九°繧峨き繝ｼ繝・[・・・兔d]+)譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・※繧ゅｈ縺・);
    if (lrigUnderOptM) {
      const countLUO = parseInt(toHWSO(lrigUnderOptM[1]));
      const lrigStackLUO = ctx.ownerState.field.lrig;
      const underLUO = lrigStackLUO.length > 1 ? lrigStackLUO.slice(0, -1) : [];
      if (underLUO.length === 0) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ縺ｮ荳九↓繧ｫ繝ｼ繝峨↑縺・));
      const toConsumeLUO = underLUO.slice(-Math.min(countLUO, underLUO.length));
      const consumeActLUO = { type: 'STUB', id: 'INTERNAL_CONSUME_LRIG_UNDER', value: countLUO } as StubAction;
      const noopActLUO: SequenceAction = { type: 'SEQUENCE', steps: [] };
      const nameListLUO = toConsumeLUO.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
      return needsInteraction(addLog(ctx, `繝ｫ繝ｪ繧ｰ荳区ｶ郁ｲｻ・滂ｼ・{nameListLUO}・荏), {
        type: 'CHOOSE', count: 1,
        options: [
          { id: 'consume', label: `繝ｫ繝ｪ繧ｰ荳具ｼ・{nameListLUO}・峨ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ`, action: consumeActLUO as EffectAction, available: true },
          { id: 'skip',    label: '繧ｹ繧ｭ繝・・', action: noopActLUO as EffectAction, available: true },
        ],
      });
    }
    // 縲後そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九°繧峨き繝ｼ繝丑譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺上搾ｼ亥ｼｷ蛻ｶ繝ｻ蝗ｺ螳壽椢謨ｰ繝ｻWD22-016-UG/SPK06-05邉ｻ・・    const centerUnderFixedM = effSOtxt.match(/繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九°繧峨き繝ｼ繝・[・・・兔d]+)譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・);
    if (centerUnderFixedM) {
      const countCUF = parseInt(toHWSO(centerUnderFixedM[1]));
      const lrigStackCUF = ctx.ownerState.field.lrig;
      const underCUF = lrigStackCUF.length > 1 ? lrigStackCUF.slice(0, -1) : [];
      const toTrashCUF = underCUF.slice(-Math.min(countCUF, underCUF.length));
      if (toTrashCUF.length === 0) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ縺ｮ荳九↓繧ｫ繝ｼ繝峨↑縺暦ｼ亥崋螳壽ｶ郁ｲｻ・・));
      const remainCUF = underCUF.slice(0, underCUF.length - toTrashCUF.length);
      const newLrigCUF = [...remainCUF, lrigStackCUF[lrigStackCUF.length - 1]];
      const newOwnerCUF: PlayerState = {
        ...ctx.ownerState,
        field: { ...ctx.ownerState.field, lrig: newLrigCUF },
        lrig_trash: [...ctx.ownerState.lrig_trash, ...toTrashCUF],
      };
      return done(addLog({ ...ctx, ownerState: newOwnerCUF, lastProcessedCards: toTrashCUF },
        `繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ荳・{toTrashCUF.length}譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ`));
    }
    // 縲後Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉLvN縺ｮ繝ｫ繝ｪ繧ｰ繧偵そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九↓鄂ｮ縺・※繧ゅｈ縺・搾ｼ・X13-033邉ｻ・・    const fromTrashToUnderM = effSOtxt.match(/繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉ.*繝ｬ繝吶Ν([・・・兔d]+).*繝ｫ繝ｪ繧ｰ[・・]譫・*繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九↓鄂ｮ縺・※繧ゅｈ縺・);
    if (fromTrashToUnderM) {
      const targetLvFTU = parseInt(toHWSO(fromTrashToUnderM[1]));
      const centerTopFTU = ctx.ownerState.field.lrig.at(-1);
      const centerCardFTU = centerTopFTU ? ctx.cardMap.get(centerTopFTU) : undefined;
      const sameType = effSOtxt.includes('螳悟・縺ｫ蜷御ｸ縺ｮ繝ｫ繝ｪ繧ｰ繧ｿ繧､繝・);
      const candidatesFTU = ctx.ownerState.lrig_trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        if (!c) return false;
        if (parseInt(c.Level ?? '') !== targetLvFTU) return false;
        if (sameType && centerCardFTU) {
          return c.CardClass === centerCardFTU.CardClass || c.Story === centerCardFTU.Story;
        }
        return true;
      });
      if (candidatesFTU.length === 0) return done(addLog(ctx, `繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫLv${targetLvFTU}縺ｮ繝ｫ繝ｪ繧ｰ縺ｪ縺輿));
      const noopFTU: SequenceAction = { type: 'SEQUENCE', steps: [] };
      const opts = [
        ...candidatesFTU.map(cn => ({
          id: cn,
          label: `${ctx.cardMap.get(cn)?.CardName ?? cn}繧偵そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ荳九↓鄂ｮ縺汁,
          action: { type: 'STUB', id: 'INTERNAL_PLACE_LRIG_UNDER_CENTER', value: cn } as StubAction as EffectAction,
          available: true,
        })),
        { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: noopFTU as EffectAction, available: true },
      ];
      return needsInteraction(addLog(ctx, '繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ荳九↓鄂ｮ縺上Ν繝ｪ繧ｰ繧帝∈謚・), { type: 'CHOOSE', count: 1, options: opts });
    }
    // 縲後そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九°繧峨き繝ｼ繝峨ｒ螂ｽ縺阪↑譫壽焚蟇ｾ雎｡縺ｨ縺励√◎繧後ｉ繧偵Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺上・    if (effSOtxt.match(/繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九°繧峨き繝ｼ繝峨ｒ螂ｽ縺阪↑譫壽焚蟇ｾ雎｡縺ｨ縺・*繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・)) {
      const lrigStackSO = ctx.ownerState.field.lrig;
      const underCardsSO = lrigStackSO.length > 1 ? lrigStackSO.slice(0, -1) : [];
      if (underCardsSO.length === 0) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ縺ｮ荳九↓繧ｫ繝ｼ繝峨↑縺・));
      // 蜈ｨ繧ｫ繝ｼ繝峨ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ・育ｰ｡譏難ｼ壻ｻｻ諢乗椢謨ｰ竊貞・譫夲ｼ・      const newLrigSO2 = [lrigStackSO[lrigStackSO.length - 1]]; // 繝医ャ繝励・縺ｿ谿九☆
      const newOwnerSO2: PlayerState = {
        ...ctx.ownerState,
        field: { ...ctx.ownerState.field, lrig: newLrigSO2 },
        lrig_trash: [...ctx.ownerState.lrig_trash, ...underCardsSO],
      };
      return done(addLog({ ...ctx, ownerState: newOwnerSO2, lastProcessedCards: underCardsSO },
        `繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ荳・{underCardsSO.length}譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ`));
    }
    // 縲御ｻ悶・繝ｫ繝ｪ繧ｰ縺ｮ荳九↓縺ゅｋ縺吶∋縺ｦ縺ｮ繧ｫ繝ｼ繝峨ｒ縺薙・繝ｫ繝ｪ繧ｰ縺ｮ荳九↓鄂ｮ縺上搾ｼ医メ繝ｼ繝繝ｫ繝ｪ繧ｰ邨ｱ蜷茨ｼ・    if (effSOtxt.match(/莉悶・繝ｫ繝ｪ繧ｰ縺ｮ荳九↓縺ゅｋ縺吶∋縺ｦ縺ｮ繧ｫ繝ｼ繝峨ｒ縺薙・繝ｫ繝ｪ繧ｰ縺ｮ荳九↓鄂ｮ縺・)) {
      const assistLSO = ctx.ownerState.field.assist_lrig_l ?? [];
      const assistRSO = ctx.ownerState.field.assist_lrig_r ?? [];
      // 繧｢繧ｷ繧ｹ繝医Ν繝ｪ繧ｰ縺ｮ荳九・繧ｫ繝ｼ繝会ｼ医せ繧ｿ繝・け縺ｮ繝医ャ繝嶺ｻ･螟厄ｼ峨ｒ蜿朱寔
      const underLSO = assistLSO.length > 1 ? assistLSO.slice(0, -1) : [];
      const underRSO = assistRSO.length > 1 ? assistRSO.slice(0, -1) : [];
      const allUnderSO = [...underLSO, ...underRSO];
      if (allUnderSO.length === 0) return done(addLog(ctx, '莉悶Ν繝ｪ繧ｰ縺ｮ荳九↓繧ｫ繝ｼ繝峨↑縺・));
      // 繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ繧ｹ繧ｿ繝・け荳九↓霑ｽ蜉・亥商縺・き繝ｼ繝峨′蜈磯ｭ・・      const newLrigSO = [...allUnderSO, ...ctx.ownerState.field.lrig];
      // 繧｢繧ｷ繧ｹ繝医Ν繝ｪ繧ｰ縺ｮ繝医ャ繝励・縺ｿ谿九☆
      const newAssistLSO = assistLSO.length > 0 ? [assistLSO[assistLSO.length - 1]] : [];
      const newAssistRSO = assistRSO.length > 0 ? [assistRSO[assistRSO.length - 1]] : [];
      const newOwnerSO: PlayerState = {
        ...ctx.ownerState,
        field: { ...ctx.ownerState.field, lrig: newLrigSO, assist_lrig_l: newAssistLSO, assist_lrig_r: newAssistRSO },
      };
      return done(addLog({ ...ctx, ownerState: newOwnerSO }, `莉悶Ν繝ｪ繧ｰ荳・{allUnderSO.length}譫壹ｒ繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ荳九↓邨ｱ蜷・));
    }
    // 豎守畑繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ: 繧ｽ繝ｼ繧ｹ繧ｷ繧ｰ繝九・荳九↓繧ｽ繧ｦ繝ｫ縺後≠繧後・豸郁ｲｻ縺吶ｋ繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ繧呈署遉ｺ
    if (ctx.sourceCardNum) {
      const srcZoneSO2 = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum);
      const stackSO2 = srcZoneSO2 >= 0 ? ctx.ownerState.field.signi[srcZoneSO2] : null;
      if (stackSO2 && stackSO2.length >= 2) {
        const soulCardSO2 = stackSO2[0];
        const soulNameSO2 = ctx.cardMap.get(soulCardSO2)?.CardName ?? soulCardSO2;
        const consumeSO2: StubAction = { type: 'STUB', id: 'INTERNAL_CONSUME_SOUL' };
        const noopSO2: SequenceAction = { type: 'SEQUENCE', steps: [] };
        const pendingSO2: PendingInteractionDef = {
          type: 'CHOOSE', count: 1,
          options: [
            { id: 'consume', label: `繧ｽ繧ｦ繝ｫ・・{soulNameSO2}・峨ｒ菴ｿ逕ｨ`, action: consumeSO2 as EffectAction, available: true },
            { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: noopSO2 as EffectAction, available: true },
          ],
        };
        return needsInteraction(addLog(ctx, '繧ｽ繧ｦ繝ｫ繧剃ｽｿ逕ｨ縺励∪縺吶°・・), pendingSO2);
      }
    }
    return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ謫堺ｽ・));
  }
  // INTERNAL_CONSUME_SOUL: 繧ｽ繝ｼ繧ｹ繧ｷ繧ｰ繝九・荳九↓縺ゅｋ繧ｽ繧ｦ繝ｫ繧ｫ繝ｼ繝峨ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'INTERNAL_CONSUME_SOUL') {
    const srcICS = ctx.sourceCardNum;
    if (!srcICS) return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ豸郁ｲｻ・壹た繝ｼ繧ｹ縺ｪ縺・));
    const ziICS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcICS);
    if (ziICS < 0) return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ豸郁ｲｻ・壹す繧ｰ繝九′繝輔ぅ繝ｼ繝ｫ繝峨↓縺・↑縺・));
    const stackICS = ctx.ownerState.field.signi[ziICS];
    if (!stackICS || stackICS.length < 2) return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ豸郁ｲｻ・壹た繧ｦ繝ｫ縺ｪ縺・));
    const soulCardICS = stackICS[0];
    const newStackICS = stackICS.slice(1);
    const newSigniICS = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniICS[ziICS] = newStackICS;
    const newOwnerICS: PlayerState = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, signi: newSigniICS },
      lrig_trash: [...ctx.ownerState.lrig_trash, soulCardICS],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerICS },
      `繧ｽ繧ｦ繝ｫ・・{ctx.cardMap.get(soulCardICS)?.CardName ?? soulCardICS}・峨ｒ豸郁ｲｻ縺励※繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ`));
  }
  // INTERNAL_CONSUME_LRIG_UNDER: 繝ｫ繝ｪ繧ｰ縺ｮ荳九°繧丑譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ・・OUL_OP optional豸郁ｲｻ縺ｮ螳溯｡碁Κ・・  if (stub.id === 'INTERNAL_CONSUME_LRIG_UNDER') {
    const countICLU = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '1'));
    const lrigStackICLU = ctx.ownerState.field.lrig;
    if (lrigStackICLU.length <= 1) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ縺ｮ荳九↓繧ｫ繝ｼ繝峨↑縺・));
    const underICLU = lrigStackICLU.slice(0, -1);
    const toConsumeICLU = underICLU.slice(-Math.min(countICLU, underICLU.length));
    const remainICLU = underICLU.slice(0, underICLU.length - toConsumeICLU.length);
    const newLrigICLU = [...remainICLU, lrigStackICLU[lrigStackICLU.length - 1]];
    const newOwnerICLU: PlayerState = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, lrig: newLrigICLU },
      lrig_trash: [...ctx.ownerState.lrig_trash, ...toConsumeICLU],
    };
    const nameListICLU = toConsumeICLU.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
    return done(addLog({ ...ctx, ownerState: newOwnerICLU, lastProcessedCards: toConsumeICLU },
      `繝ｫ繝ｪ繧ｰ荳具ｼ・{nameListICLU}・峨ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ`));
  }
  // INTERNAL_PLACE_LRIG_UNDER_CENTER: 繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉ驕ｸ謚槭Ν繝ｪ繧ｰ繧偵そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ荳九↓驟咲ｽｮ
  if (stub.id === 'INTERNAL_PLACE_LRIG_UNDER_CENTER') {
    const cnIPLUC = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    if (!cnIPLUC) return done(addLog(ctx, '繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ荳矩・鄂ｮ・壹き繝ｼ繝峨↑縺・));
    const newLrigTrashIPLUC = ctx.ownerState.lrig_trash.filter(x => x !== cnIPLUC);
    const newLrigIPLUC = [cnIPLUC, ...ctx.ownerState.field.lrig]; // 譛荳九↓霑ｽ蜉
    const newOwnerIPLUC: PlayerState = {
      ...ctx.ownerState,
      lrig_trash: newLrigTrashIPLUC,
      field: { ...ctx.ownerState.field, lrig: newLrigIPLUC },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerIPLUC },
      `${ctx.cardMap.get(cnIPLUC)?.CardName ?? cnIPLUC}繧偵そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ荳九↓驟咲ｽｮ`));
  }
  // 繝・ャ繧ｭ繧定ｦ九※荳ｦ縺ｹ譖ｿ縺茨ｼ・TUB迚茨ｼ壼虚逧・ヱ繝ｼ繧ｹ・・  if (stub.id === 'LOOK_AND_REORDER') {
    const srcLOR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLOR = srcLOR ? (srcLOR.EffectText ?? '') + ' ' + (srcLOR.BurstText ?? '') : '';
    const toHWL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 縲梧ｮ九ｊ繧偵ョ繝・く縺ｫ蜉縺医※繧ｷ繝｣繝・ヵ繝ｫ縺吶ｋ縲坂・ lastProcessedCards繧偵ョ繝・く縺ｸ繧ｷ繝｣繝・ヵ繝ｫ
    if ((txtLOR.match(/谿九ｊ繧偵ョ繝・く縺ｫ蜉縺医※繧ｷ繝｣繝・ヵ繝ｫ縺吶ｋ/) || txtLOR.match(/^谿九ｊ繧偵ョ繝・く縺ｫ蜉縺医※繧ｷ繝｣繝・ヵ繝ｫ縺吶ｋ$/)) && ctx.lastProcessedCards && ctx.lastProcessedCards.length > 0) {
      const cards = ctx.lastProcessedCards;
      const newDeck = shuffle([...ctx.ownerState.deck, ...cards]);
      const newS: PlayerState = { ...ctx.ownerState, deck: newDeck };
      return done(addLog({ ...ctx, ownerState: newS }, `谿九ｊ${cards.length}譫壹ｒ繝・ャ繧ｭ縺ｫ謌ｻ縺励※繧ｷ繝｣繝・ヵ繝ｫ`));
    }
    // 縲後ョ繝・く荳翫°繧丑譫夊ｦ九ｋ縲坂・ LOOK_AND_REORDER 繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ
    const lookM = txtLOR.match(/繝・ャ繧ｭ縺ｮ荳・?:縺九ｉ)?繧ｫ繝ｼ繝峨ｒ?([・・・兔d]+)譫・?:繧・隕九ｋ|遒ｺ隱阪☆繧・/);
    if (lookM) {
      const count = parseInt(toHWL(lookM[1]));
      const visible = ctx.ownerState.deck.slice(0, Math.min(count, ctx.ownerState.deck.length));
      if (visible.length > 0) {
        const newS: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(visible.length) };
        return needsInteraction(
          addLog({ ...ctx, ownerState: newS }, `繝・ャ繧ｭ荳・{visible.length}譫壹ｒ遒ｺ隱港),
          { type: 'LOOK_AND_REORDER', cards: visible, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'top' },
        );
      }
    }
    return done(addLog(ctx, '繝・ャ繧ｭ繧定ｦ九※荳ｦ縺ｹ譖ｿ縺茨ｼ医せ繧ｭ繝・・・・));
  }
  // 繝・ャ繧ｭ荳翫ｒ繝ｩ繧､繝輔け繝ｭ繧ｹ縺ｫ蜉縺医ｋ
  if (stub.id === 'DECK_TOP_TO_LIFE') {
    const srcDTL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDTL = srcDTL ? (srcDTL.EffectText ?? '') + ' ' + (srcDTL.BurstText ?? '') : '';
    const toHWD = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 譫壽焚縺ｮ隗｣譫撰ｼ医ョ繝輔か繝ｫ繝・譫夲ｼ・    const cntM = txtDTL.match(/繝・ャ繧ｭ縺ｮ荳逡ｪ荳・?:縺九ｉ)?([・・・兔d]+)譫壹・繧ｫ繝ｼ繝峨ｒ繝ｩ繧､繝輔け繝ｭ繧ｹ縺ｫ/);
    const addCount = cntM ? parseInt(toHWD(cntM[1])) : 1;
    // 蟇ｾ雎｡繝励Ξ繧､繝､繝ｼ縺ｮ蛻､譁ｭ
    const oppPattern = /蟇ｾ謌ｦ逶ｸ謇九・繝・ャ繧ｭ縺ｮ荳逡ｪ荳翫・繧ｫ繝ｼ繝峨ｒ繝ｩ繧､繝輔け繝ｭ繧ｹ縺ｫ/;
    const owner = oppPattern.test(txtDTL) ? 'opponent' : 'self';
    const st = ownerState(owner, ctx);
    if (st.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺暦ｼ医Λ繧､繝戊ｿｽ蜉・・));
    const toAdd = st.deck.slice(0, Math.min(addCount, st.deck.length));
    const newS: PlayerState = {
      ...st,
      deck: st.deck.slice(toAdd.length),
      life_cloth: [...toAdd, ...st.life_cloth],
    };
    return done(addLog(setOwnerState(owner, newS, ctx), `繝・ャ繧ｭ荳・{toAdd.length}譫壹ｒ繝ｩ繧､繝輔け繝ｭ繧ｹ縺ｫ蜉縺医◆`));
  }
  // 繧ｫ繧ｦ繝ｳ繝亥渕貅悶ラ繝ｭ繝ｼ/繝代Ρ繝ｼ・・astProcessedCards縺ｮ譫壽焚縺縺代ラ繝ｭ繝ｼ or 繝代Ρ繝ｼ菫ｮ豁｣・・  if (stub.id === 'COUNT_BASED_DRAW_OR_POWER') {
    const srcCBDP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCBDP = srcCBDP ? (srcCBDP.EffectText ?? '') + ' ' + (srcCBDP.BurstText ?? '') : '';
    const toHWCBDP = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const processed = ctx.lastProcessedCards ?? [];
    const count = processed.length;
    // 縲梧昏縺ｦ縺滓椢謨ｰ縺ｮ繧ｫ繝ｼ繝峨ｒ蠑輔￥縲阪ヱ繧ｿ繝ｼ繝ｳ
    if (txtCBDP.match(/(?:謐ｨ縺ｦ縺毫鄂ｮ縺九ｌ縺毫繝繧ｦ繝ｳ縺励◆).*譫壽焚.*(?:蠑輔￥|繧ｫ繝ｼ繝峨ｒ蠑・/)) {
      const bonusM = txtCBDP.match(/譫壽焚縺ｫ([・・・兔d]+)繧貞刈縺医◆譫壽焚/);
      const bonus = bonusM ? parseInt(toHWCBDP(bonusM[1])) : 0;
      const drawCount = count + bonus;
      if (drawCount > 0) {
        const s = ctx.ownerState;
        const canDraw = Math.min(drawCount, s.deck.length);
        const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
        return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}譫壹ラ繝ｭ繝ｼ・亥・逅・{count}譫・{bonus > 0 ? `+${bonus}` : ''}・荏));
      }
      return done(addLog(ctx, '繝峨Ο繝ｼ0譫夲ｼ医き繧ｦ繝ｳ繝医↑縺暦ｼ・));
    }
    // 縲梧昏縺ｦ縺滓椢謨ｰ縺ｫ縺､縺阪ヱ繝ｯ繝ｼﾂｱN縲阪ヱ繧ｿ繝ｼ繝ｳ
    const perM = txtCBDP.match(/(?:謐ｨ縺ｦ縺毫鄂ｮ縺九ｌ縺・.*譫壽焚.*([・具ｼ江[・・・兔d]+)/);
    if (perM) {
      const delta = parseInt(toHWCBDP(perM[1]).replace('・・, '+').replace('・・, '-')) * count;
      if (delta !== 0) {
        const mods = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) mods.push({ cardNum: top, delta });
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: mods } },
          `繝代Ρ繝ｼ${delta > 0 ? '+' : ''}${delta}・亥・逅・{count}譫夲ｼ荏));
      }
    }
    // 繧ｹ繧ｿ繝ｳ繝峨い繝ｭ繝ｳ: 繧ｲ繝ｼ繝迥ｶ諷九き繧ｦ繝ｳ繝医・繝ｼ繧ｹ縺ｮ繝峨Ο繝ｼ/繝代Ρ繝ｼ
    if (count === 0) {
      const toSignedCBDP = (s: string) => parseInt(toHWCBDP(s).replace('・・,'+').replace('・・,'-'));
      // 縲梧焔譛ｭ繧誰譫壹∪縺ｧ謐ｨ縺ｦ繧具ｼ壽椢謨ｰ繝峨Ο繝ｼ or 譫壽焚縺ｮ繧ｷ繧ｰ繝九ヱ繝ｯ繝ｼ菫ｮ豁｣縲阪ヱ繧ｿ繝ｼ繝ｳ・医う繝ｳ繧ｿ繝ｩ繧ｯ繝・ぅ繝厄ｼ・      const discardCostMCBDP = txtCBDP.match(/謇区惆繧・[・・・兔d]+)譫壹∪縺ｧ謐ｨ縺ｦ繧・);
      if (discardCostMCBDP) {
        const maxDiscardCBDP = parseInt(toHWCBDP(discardCostMCBDP[1]));
        const handCardsCBDP = ctx.ownerState.hand;
        if (handCardsCBDP.length === 0) return done(addLog(ctx, '謇区惆縺ｪ縺暦ｼ域昏縺ｦ繧ｹ繧ｭ繝・・・・));
        const noopSCBDP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
        const contSCBDP: StubAction = { type: 'STUB', id: 'INTERNAL_CBDOP_AFTER_DISCARD' };
        const hasPwrDownCBDP = !!txtCBDP.match(/譫壽焚.*繝代Ρ繝ｼ|繝代Ρ繝ｼ.*譫壽焚/);
        const logMsgCBDP = hasPwrDownCBDP
          ? `謇区惆繧・{maxDiscardCBDP}譫壹∪縺ｧ謐ｨ縺ｦ縲√◎縺ｮ譫壽焚縺縺醍嶌謇九す繧ｰ繝九・繝代Ρ繝ｼ繧剃ｿｮ豁｣`
          : `謇区惆繧・{maxDiscardCBDP}譫壹∪縺ｧ謐ｨ縺ｦ縲√◎縺ｮ譫壽焚蠑輔￥`;
        return needsInteraction(addLog(ctx, logMsgCBDP), {
          type: 'SELECT_TARGET',
          candidates: handCardsCBDP,
          count: Math.min(maxDiscardCBDP, handCardsCBDP.length),
          optional: true,
          targetScope: 'self_hand',
          thenAction: noopSCBDP as EffectAction,
          continuation: contSCBDP as EffectAction,
        });
      }
      // "繧ｨ繝翫だ繝ｼ繝ｳ(?:縺ｮ繧ｫ繝ｼ繝・?N譫壹↓縺､縺・N譫・繧ｫ繝ｼ繝峨ｒ蠑輔￥"
      const enaDrawM = txtCBDP.match(/繧ｨ繝翫だ繝ｼ繝ｳ(?:縺ｮ繧ｫ繝ｼ繝・?([・・・兔d]*)譫壹↓縺､縺・?:繧ｫ繝ｼ繝峨ｒ)?([・・・兔d]*)譫・?:繝峨Ο繝ｼ|蠑輔￥)/);
      if (enaDrawM) {
        const div = parseInt(toHWCBDP(enaDrawM[1] || '1')) || 1;
        const drawPerDiv = parseInt(toHWCBDP(enaDrawM[2] || '1')) || 1;
        const drawCount = Math.floor(ctx.ownerState.energy.length / div) * drawPerDiv;
        if (drawCount > 0) {
          const s = ctx.ownerState;
          const canDraw = Math.min(drawCount, s.deck.length);
          const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
          return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}譫壹ラ繝ｭ繝ｼ・医お繝・{ctx.ownerState.energy.length}譫堙ｷ${div}・荏));
        }
        return done(addLog(ctx, '繧ｨ繝翫だ繝ｼ繝ｳ蝓ｺ貅悶ラ繝ｭ繝ｼ・・譫夲ｼ・));
      }
      // "謇区惆N譫壹↓縺､縺・N譫・繧ｫ繝ｼ繝峨ｒ蠑輔￥"
      const handDrawM = txtCBDP.match(/謇区惆([・・・兔d]*)譫壹↓縺､縺・?:繧ｫ繝ｼ繝峨ｒ)?([・・・兔d]*)譫・?:繝峨Ο繝ｼ|蠑輔￥)/);
      if (handDrawM) {
        const div = parseInt(toHWCBDP(handDrawM[1] || '1')) || 1;
        const drawPerDiv = parseInt(toHWCBDP(handDrawM[2] || '1')) || 1;
        const drawCount = Math.floor(ctx.ownerState.hand.length / div) * drawPerDiv;
        if (drawCount > 0) {
          const s = ctx.ownerState;
          const canDraw = Math.min(drawCount, s.deck.length);
          const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
          return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}譫壹ラ繝ｭ繝ｼ・域焔譛ｭ${ctx.ownerState.hand.length}譫堙ｷ${div}・荏));
        }
        return done(addLog(ctx, '謇区惆蝓ｺ貅悶ラ繝ｭ繝ｼ・・譫夲ｼ・));
      }
      // "逋ｻ骭ｲ閠・焚N荳・ｺｺ縺ｫ縺､縺・N譫・繧ｫ繝ｼ繝峨ｒ蠑輔￥"
      const subDrawM = txtCBDP.match(/逋ｻ骭ｲ閠・焚([・・・兔d]*)荳・ｺｺ縺ｫ縺､縺・?:繧ｫ繝ｼ繝峨ｒ)?([・・・兔d]*)譫・?:繝峨Ο繝ｼ|蠑輔￥)/);
      if (subDrawM) {
        const div = parseInt(toHWCBDP(subDrawM[1] || '1')) || 1;
        const drawPerDiv = parseInt(toHWCBDP(subDrawM[2] || '1')) || 1;
        const drawCount = Math.floor((ctx.ownerState.subscriber_count ?? 0) / div) * drawPerDiv;
        if (drawCount > 0) {
          const s = ctx.ownerState;
          const canDraw = Math.min(drawCount, s.deck.length);
          const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
          return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}譫壹ラ繝ｭ繝ｼ・育匳骭ｲ閠・焚${ctx.ownerState.subscriber_count ?? 0}荳・ｺｺﾃｷ${div}・荏));
        }
        return done(addLog(ctx, '逋ｻ骭ｲ閠・焚蝓ｺ貅悶ラ繝ｭ繝ｼ・・譫夲ｼ・));
      }
      // "繝輔ぅ繝ｼ繝ｫ繝峨・繧ｷ繧ｰ繝起菴薙↓縺､縺債ｱX"
      const fieldPwM = txtCBDP.match(/繝輔ぅ繝ｼ繝ｫ繝・*繧ｷ繧ｰ繝・[・・・兔d]*)菴薙↓縺､縺・[・具ｼ欺-・江[・・・兔d]+)/);
      if (fieldPwM) {
        const div = parseInt(toHWCBDP(fieldPwM[1] || '1')) || 1;
        const ownSigniCount = ctx.ownerState.field.signi.filter(s => s && s.length > 0).length;
        const delta = Math.floor(ownSigniCount / div) * toSignedCBDP(fieldPwM[2]);
        if (delta !== 0 && ctx.sourceCardNum) {
          const mods = [...(ctx.ownerState.temp_power_mods ?? [])];
          mods.push({ cardNum: ctx.sourceCardNum, delta });
          return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: mods } },
            `繧ｽ繝ｼ繧ｹ繧ｷ繧ｰ繝九ヱ繝ｯ繝ｼ${delta > 0 ? '+' : ''}${delta}・医ヵ繧｣繝ｼ繝ｫ繝・{ownSigniCount}菴難ｼ荏));
        }
      }
    }
    return done(addLog(ctx, `繧ｫ繧ｦ繝ｳ繝亥渕貅門柑譫懶ｼ亥・逅・{count}譫夲ｼ荏));
  }
  // INTERNAL: 謇区惆謐ｨ縺ｦ蠕後・蜉ｹ譫懶ｼ・OUNT_BASED_DRAW_OR_POWER 縺九ｉ邯咏ｶ夲ｼ・  if (stub.id === 'INTERNAL_CBDOP_AFTER_DISCARD') {
    const selectedICD = ctx.lastProcessedCards ?? [];
    const countICD = selectedICD.length;
    // 驕ｸ謚槭き繝ｼ繝峨ｒ謇区惆縺九ｉ繝医Λ繝・す繝･縺ｸ
    let newOwnerICD = { ...ctx.ownerState };
    for (const cn of selectedICD) {
      const hi = newOwnerICD.hand.indexOf(cn);
      if (hi >= 0) {
        const newH = [...newOwnerICD.hand]; newH.splice(hi, 1);
        newOwnerICD = { ...newOwnerICD, hand: newH, trash: [...newOwnerICD.trash, cn] };
      }
    }
    if (countICD === 0) return done(addLog({ ...ctx, ownerState: newOwnerICD }, '謐ｨ縺ｦ縺ｪ縺暦ｼ亥柑譫懊せ繧ｭ繝・・・・));
    const ctxICD = { ...ctx, ownerState: newOwnerICD };
    const srcICD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtICD = srcICD ? (srcICD.EffectText ?? '') + ' ' + (srcICD.BurstText ?? '') : '';
    const toHWICD = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 縲梧昏縺ｦ縺溘き繝ｼ繝峨・譫壽焚・医↓1繧貞刈縺医◆譫壽焚・峨き繝ｼ繝峨ｒ蠑輔￥縲・    if (txtICD.match(/謐ｨ縺ｦ縺溘き繝ｼ繝峨・譫壽焚|譫壽焚縺ｫ遲峨＠縺・椢謨ｰ.*蠑輔￥|譫壽焚縺ｮ繧ｫ繝ｼ繝峨ｒ蠑輔￥/)) {
      const bonusM = txtICD.match(/譫壽焚縺ｫ([・・・兔d]+)繧貞刈縺医◆譫壽焚/);
      const bonus = bonusM ? parseInt(toHWICD(bonusM[1])) : 0;
      const drawCount = countICD + bonus;
      const canDraw = Math.min(drawCount, ctxICD.ownerState.deck.length);
      const newS: PlayerState = {
        ...ctxICD.ownerState,
        hand: [...ctxICD.ownerState.hand, ...ctxICD.ownerState.deck.slice(0, canDraw)],
        deck: ctxICD.ownerState.deck.slice(canDraw),
      };
      return done(addLog({ ...ctxICD, ownerState: newS }, `謇区惆${countICD}譫壽昏縺ｦ竊・{drawCount}譫壹ラ繝ｭ繝ｼ`));
    }
    // 縲梧椢謨ｰ縺ｨ蜷後§謨ｰ縺ｮ逶ｸ謇九す繧ｰ繝九・繝代Ρ繝ｼ繧・N縲・    const pwrM = txtICD.match(/縺昴ｌ縺槭ｌ([・具ｼ江[・・・兔d]+)/);
    if (pwrM || txtICD.match(/譫壽焚.*繝代Ρ繝ｼ.*([・具ｼ江[・・・兔d]+)/)) {
      const rawDelta = pwrM
        ? pwrM[1]
        : (txtICD.match(/繝代Ρ繝ｼ.*([・具ｼ江[・・・兔d]+)/)?.[1] ?? '・・000');
      const delta = parseInt(toHWICD(rawDelta).replace('・・, '+').replace('・・, '-'));
      const oppSigniAll = ([0, 1, 2] as const)
        .map(i => ctxICD.otherState.field.signi[i]?.at(-1))
        .filter((cn): cn is string => !!cn);
      const targets = oppSigniAll.slice(0, countICD);
      if (targets.length === 0) return done(addLog(ctxICD, '繝代Ρ繝ｼ菫ｮ豁｣・夂嶌謇九す繧ｰ繝九↑縺・));
      const mods = [...(ctxICD.otherState.temp_power_mods ?? [])];
      for (const cn of targets) mods.push({ cardNum: cn, delta });
      return done(addLog(
        { ...ctxICD, otherState: { ...ctxICD.otherState, temp_power_mods: mods } },
        `謇区惆${countICD}譫壽昏縺ｦ竊堤嶌謇九す繧ｰ繝・{targets.length}菴薙↓繝代Ρ繝ｼ${delta}`,
      ));
    }
    return done(addLog(ctxICD, `謇区惆${countICD}譫壽昏縺ｦ・亥柑譫憺←逕ｨ荳肴・・荏));
  }
  // 繧｢繝ｼ繝・ｽｿ逕ｨ譎ゅ↓繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺九ｉ繧｢繝ｼ繝・ｒ莉ｻ諢上〒繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'ARTS_USE_DISCARD_LRIG_DECK') {
    const lrigDeck = ctx.ownerState.lrig_deck ?? [];
    const artsInDeck = lrigDeck.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== '繧｢繝ｼ繝・) return false;
      const effs = parseCardEffects(c);
      return !effs.some(e => e.effectType === 'CONTINUOUS' && e.action.type === 'STUB' && (e.action as StubAction).id === 'ARTS_IMMOVABLE');
    });
    if (artsInDeck.length === 0) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ繧｢繝ｼ繝・↑縺・));
    const noopAction: SequenceAction = { type: 'SEQUENCE', steps: [] };
    // 莉ｻ諢上↑縺ｮ縺ｧ繧ｹ繧ｭ繝・・驕ｸ謚櫁い繧よ署萓・    const options = [
      ...artsInDeck.slice(0, 3).map(cn => ({
        id: cn,
        label: `謐ｨ縺ｦ繧具ｼ・{ctx.cardMap.get(cn)?.CardName ?? cn}・荏,
        action: { type: 'STUB', id: 'INTERNAL_DISCARD_LRIG_DECK_ARTS', value: cn } as StubAction as EffectAction,
        available: true,
      })),
      { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: noopAction as EffectAction, available: true },
    ];
    const pending: PendingInteractionDef = { type: 'CHOOSE', options, count: 1 };
    return needsInteraction(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺九ｉ繧｢繝ｼ繝・ｒ謐ｨ縺ｦ縺ｾ縺吶°・・), pending);
  }
  // INTERNAL: 繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺九ｉ繧｢繝ｼ繝・ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ・・HOOSE縺ｮ邯壹″・・  if (stub.id === 'INTERNAL_DISCARD_LRIG_DECK_ARTS') {
    const cnArt = String(stub.value ?? '');
    if (!cnArt) return done(addLog(ctx, 'INTERNAL_DISCARD_LRIG_DECK_ARTS: value 縺ｪ縺・));
    const lrigDeck = ctx.ownerState.lrig_deck ?? [];
    const newDeck = lrigDeck.filter(cn => cn !== cnArt);
    const newOwner = { ...ctx.ownerState, lrig_deck: newDeck, lrig_trash: [...ctx.ownerState.lrig_trash, cnArt] };
    const artName = ctx.cardMap.get(cnArt)?.CardName ?? cnArt;
    return done(addLog({ ...ctx, ownerState: newOwner }, `${artName}繧偵Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ`));
  }
  // 謇区惆縺ｮ繧ｷ繧ｰ繝九↓繧ｬ繝ｼ繝峨い繧､繧ｳ繝ｳ繧剃ｻ倅ｸ趣ｼ医％縺ｮ繧ｿ繝ｼ繝ｳ・・  if (stub.id === 'GRANT_GUARD_ICON_HAND_SIGNI') {
    const newOwner = { ...ctx.ownerState, hand_signi_guard_enabled: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, '縺薙・繧ｿ繝ｼ繝ｳ謇区惆縺ｮ繧ｷ繧ｰ繝九・繧ｬ繝ｼ繝峨↓菴ｿ縺医ｋ'));
  }
  // 繝医Λ繝・す繝･縺九ｉ繧ｷ繧ｰ繝九ｒ繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝九・荳九↓鄂ｮ縺擾ｼ医Λ繧､繧ｺ陬懷・・・  if (stub.id === 'TRASH_SIGNI_UNDER_FIELD_SIGNI') {
    const srcCardT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtT = srcCardT ? (srcCardT.EffectText ?? '') + ' ' + (srcCardT.BurstText ?? '') : '';
    const toHWT = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 譫壽焚・・N譫壹∪縺ｧ" or 繝・ヵ繧ｩ繝ｫ繝・・・    const countMT = txtT.match(/繧ｷ繧ｰ繝・[・・・兔d]+)譫・?:縺ｾ縺ｧ)?繧貞ｯｾ雎｡縺ｨ縺・*縺ｮ荳九↓鄂ｮ縺・);
    const maxCountT = countMT ? parseInt(toHWT(countMT[1])) : 1;
    // 繝ｬ繝吶Ν荳企剞
    const lvMT = txtT.match(/繝ｬ繝吶Ν([・・・兔d]+)莉･荳九・/);
    const maxLvT = lvMT ? parseInt(toHWT(lvMT[1])) : 99;
    // 繧ｯ繝ｩ繧ｹ繝輔ぅ繝ｫ繧ｿ・茨ｼ弭・橸ｼ・    const classM = txtT.match(/・・[^・枉+)・槭・繧ｷ繧ｰ繝・*縺ｮ荳九↓鄂ｮ縺・);
    const reqClass = classM?.[1];
    // 濶ｲ繝輔ぅ繝ｫ繧ｿ
    const colorM = txtT.match(/縺ゅ↑縺溘・繝医Λ繝・す繝･縺九ｉ(逋ｽ|襍､|髱竹邱掃鮟・縺ｮ/);
    const reqColor = colorM?.[1];
    const trashSigniT = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (!c || c.Type !== '繧ｷ繧ｰ繝・) return false;
      if (parseInt(c.Level ?? '0') > maxLvT) return false;
      if (reqClass && !(c.CardClass ?? '').includes(reqClass)) return false;
      if (reqColor && !(c.Color ?? '').includes(reqColor)) return false;
      return true;
    });
    if (trashSigniT.length === 0) return done(addLog(ctx, '繝医Λ繝・す繝･縺ｫ繧ｷ繧ｰ繝九↑縺暦ｼ医す繧ｰ繝倶ｸ矩・鄂ｮ繧ｹ繧ｭ繝・・・・));
    const noopTSU: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contTSU: StubAction = { type: 'STUB', id: 'INTERNAL_TSU_CHOOSE_ZONE' };
    return needsInteraction(addLog(ctx, '繝医Λ繝・す繝･縺九ｉ繧ｷ繧ｰ繝九ｒ驕ｸ謚橸ｼ井ｸ九↓鄂ｮ縺擾ｼ・), {
      type: 'SELECT_TARGET', candidates: trashSigniT, count: Math.min(maxCountT, trashSigniT.length),
      optional: true, targetScope: 'self_trash',
      thenAction: noopTSU as EffectAction, continuation: contTSU as EffectAction,
    });
  }
  // INTERNAL_TSU_CHOOSE_ZONE: 驕ｸ謚槭ヨ繝ｩ繝・す繝･繧ｷ繧ｰ繝九ｒ縺ｩ縺ｮ繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝九・荳九↓鄂ｮ縺上°驕ｸ謚・  if (stub.id === 'INTERNAL_TSU_CHOOSE_ZONE') {
    const rawTrash = stub.value ? String(stub.value).split(',') : (ctx.lastProcessedCards ?? []);
    if (rawTrash.length === 0) return done(addLog(ctx, '繧ｭ繝｣繝ｳ繧ｻ繝ｫ・井ｸ狗ｽｮ縺阪せ繧ｭ繝・・・・));
    const [firstTrash, ...restTrash] = rawTrash;
    const srcTSU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTSU = srcTSU ? (srcTSU.EffectText ?? '') + ' ' + (srcTSU.BurstText ?? '') : '';
    // 驟咲ｽｮ蜈医け繝ｩ繧ｹ繝輔ぅ繝ｫ繧ｿ
    const fieldClassM = txtTSU.match(/蟇ｾ雎｡縺ｮ.*・・[^・枉+)・槭・繧ｷ繧ｰ繝・*菴・*縺ｮ荳九↓鄂ｮ縺楯・・[^・枉+)・槭・繧ｷ繧ｰ繝・*菴・*縺ｮ荳九↓鄂ｮ縺・);
    const reqFieldClass = fieldClassM?.[1] ?? fieldClassM?.[2];
    const fieldZones = [0, 1, 2].filter(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return false;
      if (reqFieldClass && !(ctx.cardMap.get(top)?.CardClass ?? '').includes(reqFieldClass)) return false;
      return true;
    });
    if (fieldZones.length === 0) return done(addLog(ctx, '蟇ｾ雎｡繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝九↑縺・));
    const opts = fieldZones.map(zi => {
      const top = ctx.ownerState.field.signi[zi]!.at(-1)!;
      const rest = restTrash.join(',');
      const encoded = rest ? `${firstTrash}:${zi}:${rest}` : `${firstTrash}:${zi}`;
      return {
        id: `zone_${zi}`,
        label: `${ctx.cardMap.get(top)?.CardName ?? top}縺ｮ荳具ｼ医だ繝ｼ繝ｳ${zi + 1}・荏,
        action: { type: 'STUB', id: 'INTERNAL_TSU_DO_PLACE', value: encoded } as StubAction as EffectAction,
        available: true,
      };
    });
    return needsInteraction(
      addLog(ctx, `${ctx.cardMap.get(firstTrash)?.CardName ?? firstTrash}繧偵←縺ｮ繧ｷ繧ｰ繝九・荳九↓鄂ｮ縺擾ｼ歔),
      { type: 'CHOOSE', options: opts, count: 1 },
    );
  }
  // INTERNAL_TSU_DO_PLACE: 繝医Λ繝・す繝･竊偵ヵ繧｣繝ｼ繝ｫ繝我ｸ矩・鄂ｮ螳溯｡後∵ｮ九ｊ縺後≠繧後・邯咏ｶ・  if (stub.id === 'INTERNAL_TSU_DO_PLACE') {
    const valStr = String(stub.value ?? '');
    const colonIdx = valStr.indexOf(':');
    const colonIdx2 = valStr.indexOf(':', colonIdx + 1);
    const trashCard = colonIdx >= 0 ? valStr.slice(0, colonIdx) : valStr;
    const zoneStr = colonIdx >= 0
      ? (colonIdx2 >= 0 ? valStr.slice(colonIdx + 1, colonIdx2) : valStr.slice(colonIdx + 1))
      : '';
    const restStr = colonIdx2 >= 0 ? valStr.slice(colonIdx2 + 1) : '';
    const zone = parseInt(zoneStr);
    if (!trashCard || isNaN(zone)) return done(addLog(ctx, '驟咲ｽｮ諠・ｱ縺ｪ縺・));
    const newTrashITP = ctx.ownerState.trash.filter(c => c !== trashCard);
    const newSigniITP = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniITP[zone] = [trashCard, ...(newSigniITP[zone] ?? [])];
    const newOwnerITP = { ...ctx.ownerState, trash: newTrashITP, field: { ...ctx.ownerState.field, signi: newSigniITP } };
    const ctxITP = addLog({ ...ctx, ownerState: newOwnerITP },
      `${ctx.cardMap.get(trashCard)?.CardName ?? trashCard}繧偵だ繝ｼ繝ｳ${zone + 1}縺ｮ繧ｷ繧ｰ繝九・荳九↓驟咲ｽｮ`);
    // 谿九ｊ縺ｮ繝医Λ繝・す繝･繧ｫ繝ｼ繝峨′縺ゅｌ縺ｰ谺｡縺ｮ驕ｸ謚槭∈
    if (restStr) {
      const nextStub: StubAction = { type: 'STUB', id: 'INTERNAL_TSU_CHOOSE_ZONE', value: restStr };
      return exec(nextStub as EffectAction, ctxITP);
    }
    return done(ctxITP);
  }
  // 繝ｫ繝ｪ繧ｰ繝ｪ繝溘ャ繝井ｿｮ豁｣・医お繝翫ヵ繧ｧ繧､繧ｺ邨ゆｺ・∪縺ｧ・・  if (stub.id === 'LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END') {
    const srcL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtL = srcL ? (srcL.EffectText ?? '') + ' ' + (srcL.BurstText ?? '') : '';
    const toHWL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    let newCtxL = ctx;
    const logs: string[] = [];
    // 閾ｪ蛻・・繝ｪ繝溘ャ繝亥､画峩・医後≠縺ｪ縺溘・...繝ｪ繝溘ャ繝医ｒ・起/・康縲阪∪縺溘・蜊倡ｴ斐↓縲後Μ繝溘ャ繝医ｒ縲搾ｼ・    const selfMinusM = txtL.match(/(?:縺ゅ↑縺溘・)?.*繝ｪ繝溘ャ繝医ｒ([・・])([・・・兔d]+)/);
    const selfPlusM = txtL.match(/(?:縺ゅ↑縺溘・)?.*繝ｪ繝溘ャ繝医ｒ([・・]?)([・・・兔d]+)(?:縺ｫ縺吶ｋ|蠅励ｄ縺處縺吶ｋ|縺・/);
    const selfPlusM2 = txtL.match(/(?:縺ゅ↑縺溘・)?.*繝ｪ繝溘ャ繝医ｒ・・[・・・兔d]+)/);
    // 逶ｸ謇九・繝ｪ繝溘ャ繝亥､画峩・医悟ｯｾ謌ｦ逶ｸ謇九・...繝ｪ繝溘ャ繝医ｒ縲搾ｼ・    const oppMinusM = txtL.match(/蟇ｾ謌ｦ逶ｸ謇・*繝ｪ繝溘ャ繝医ｒ([・・])([・・・兔d]+)/);
    const oppPlusM = txtL.match(/蟇ｾ謌ｦ逶ｸ謇・*繝ｪ繝溘ャ繝医ｒ・・[・・・兔d]+)/);
    // 閾ｪ蛻・・
    if (!oppMinusM && !oppPlusM) {
      let deltaOwn = 1;
      if (selfMinusM && !selfMinusM[0].includes('蟇ｾ謌ｦ逶ｸ謇・)) {
        deltaOwn = -parseInt(toHWL(selfMinusM[2]));
      } else if (selfPlusM && !selfPlusM[0].includes('蟇ｾ謌ｦ逶ｸ謇・)) {
        deltaOwn = parseInt(toHWL(selfPlusM[2]));
      } else if (selfPlusM2 && !selfPlusM2[0].includes('蟇ｾ謌ｦ逶ｸ謇・)) {
        deltaOwn = parseInt(toHWL(selfPlusM2[1]));
      }
      const newModOwn = (newCtxL.ownerState.lrig_limit_mod ?? 0) + deltaOwn;
      newCtxL = { ...newCtxL, ownerState: { ...newCtxL.ownerState, lrig_limit_mod: newModOwn } };
      logs.push(`閾ｪ繝ｪ繝溘ャ繝・{deltaOwn > 0 ? '+' : ''}${deltaOwn}`);
    }
    // 逶ｸ謇句・
    if (oppMinusM) {
      const deltaOpp = -parseInt(toHWL(oppMinusM[2]));
      const newModOpp = (newCtxL.otherState.lrig_limit_mod ?? 0) + deltaOpp;
      newCtxL = { ...newCtxL, otherState: { ...newCtxL.otherState, lrig_limit_mod: newModOpp } };
      logs.push(`逶ｸ謇九Μ繝溘ャ繝・{deltaOpp}`);
    } else if (oppPlusM) {
      const deltaOpp = parseInt(toHWL(oppPlusM[1]));
      const newModOpp = (newCtxL.otherState.lrig_limit_mod ?? 0) + deltaOpp;
      newCtxL = { ...newCtxL, otherState: { ...newCtxL.otherState, lrig_limit_mod: newModOpp } };
      logs.push(`逶ｸ謇九Μ繝溘ャ繝・${deltaOpp}`);
    }
    if (logs.length === 0) {
      // 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ: 繝ｪ繝溘ャ繝・1
      newCtxL = { ...newCtxL, ownerState: { ...newCtxL.ownerState, lrig_limit_mod: (newCtxL.ownerState.lrig_limit_mod ?? 0) + 1 } };
      logs.push('繝ｪ繝溘ャ繝・1・医ョ繝輔か繝ｫ繝茨ｼ・);
    }
    return done(addLog(newCtxL, `${logs.join(' / ')}・医お繝翫ヵ繧ｧ繧､繧ｺ邨ゆｺ・∪縺ｧ・荏));
  }
  // 謐ｨ縺ｦ縺滓椢謨ｰ蝓ｺ貅悶ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_BY_DISCARD_COUNT_HIGH') {
    const count = (ctx.lastProcessedCards ?? []).length;
    if (count === 0) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣・域昏縺ｦ縺・譫夲ｼ・));
    const srcPH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPH = srcPH ? (srcPH.EffectText ?? '') + ' ' + (srcPH.BurstText ?? '') : '';
    const toHWPH = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPH = txtPH.match(/譫壹↓縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    const deltaPerCard = mPH ? parseInt(toHWPH(mPH[1]).replace('・・, '-').replace('・・, '+')) : -3000;
    const totalDelta = deltaPerCard * count;
    const mods = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (top) mods.push({ cardNum: top, delta: totalDelta });
    }
    const newOther = { ...ctx.otherState, temp_power_mods: mods };
    return done(addLog({ ...ctx, otherState: newOther },
      `繝代Ρ繝ｼ${totalDelta}・・{count}譫壽昏縺ｦﾃ・{deltaPerCard}・荏));
  }
  // 繝・ャ繧ｭ荳・譫壹ｒ隕九※繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九ｒ繧ｨ繝翫∈縲∵ｮ九ｊ繧偵ョ繝・く荳翫∈
  if (stub.id === 'REVEAL_PICK_CLASS_TO_ENERGY') {
    const srcRPC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRPC = srcRPC ? (srcRPC.EffectText ?? '') + ' ' + (srcRPC.BurstText ?? '') : '';
    const classMatchRPC = txtRPC.match(/[<・彎([^>・枉+)[>・枉縺ｮ繧ｷ繧ｰ繝・*繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ鄂ｮ縺・);
    const targetClassRPC = classMatchRPC?.[1];
    const viewedRPC = (ctx.lastProcessedCards ?? []).length > 0 ? ctx.lastProcessedCards! : ctx.ownerState.deck.slice(0, 2);
    if (viewedRPC.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺暦ｼ・EVEAL_PICK_CLASS_TO_ENERGY・・));
    const toEnergyRPC = viewedRPC.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === '繧ｷ繧ｰ繝・ && (!targetClassRPC || c.CardClass?.includes(targetClassRPC));
    });
    const toTopRPC = viewedRPC.filter(cn => !toEnergyRPC.includes(cn));
    let newDeckRPC = [...ctx.ownerState.deck];
    for (const cn of [...toEnergyRPC, ...toTopRPC]) {
      const idx = newDeckRPC.indexOf(cn); if (idx >= 0) newDeckRPC.splice(idx, 1);
    }
    newDeckRPC = [...toTopRPC, ...newDeckRPC];
    const newOwnerRPC = { ...ctx.ownerState, deck: newDeckRPC, energy: [...ctx.ownerState.energy, ...toEnergyRPC] };
    const enamesRPC = toEnergyRPC.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
    return done(addLog({ ...ctx, ownerState: newOwnerRPC },
      `${enamesRPC || '縺ｪ縺・}繧偵お繝翫だ繝ｼ繝ｳ縺ｸ縲∵ｮ九ｊ${toTopRPC.length}譫壹ｒ繝・ャ繧ｭ荳翫∈`));
  }
  // 繧ｬ繝ｼ繝峨い繧､繧ｳ繝ｳ縺ｪ縺励き繝ｼ繝峨ｒ謐ｨ縺ｦ縺溘→縺阪√◎縺ｮ繧ｫ繝ｼ繝峨ｒ繧ｨ繝翫∈
  if (stub.id === 'NON_GUARD_DISCARD_TO_ENERGY') {
    const selected = ctx.lastProcessedCards ?? [];
    let newOwnerNGD = { ...ctx.ownerState };
    for (const cn of selected) {
      const c = ctx.cardMap.get(cn);
      const hasGuard = c?.Guard === '1' || c?.Guard === 'TRUE' || c?.Guard === 'true';
      if (!hasGuard) {
        const ti = newOwnerNGD.trash.indexOf(cn);
        if (ti >= 0) {
          const newTrash = [...newOwnerNGD.trash];
          newTrash.splice(ti, 1);
          newOwnerNGD = { ...newOwnerNGD, trash: newTrash, energy: [...newOwnerNGD.energy, cn] };
        }
      }
    }
    return done(addLog({ ...ctx, ownerState: newOwnerNGD }, '繧ｬ繝ｼ繝峨↑縺励き繝ｼ繝峨ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ'));
  }
  // 繝医Λ繝・す繝･縺ｫ鄂ｮ縺九ｌ縺溘き繝ｼ繝峨ｒ謇区惆縺九お繝翫↓
  if (stub.id === 'TRASHED_CARD_TO_HAND_OR_ENERGY') {
    // lastProcessedCards蜆ｪ蜈医√↑縺代ｌ縺ｰtrash譛ｫ蟆ｾ繧剃ｽｿ逕ｨ
    const targetTCTE = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetTCTE || !ctx.ownerState.trash.includes(targetTCTE)) {
      return done(addLog(ctx, '繝医Λ繝・す繝･縺ｫ繧ｫ繝ｼ繝峨↑縺暦ｼ・RASHED_CARD_TO_HAND_OR_ENERGY・・));
    }
    const cardNameTCTE = ctx.cardMap.get(targetTCTE)?.CardName ?? targetTCTE;
    const toHandTCTE: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_HAND' };
    const toEnaTCTE: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_ENERGY' };
    return needsInteraction(addLog(ctx, `${cardNameTCTE}繧呈焔譛ｭ縺九お繝翫だ繝ｼ繝ｳ縺ｸ`), {
      type: 'CHOOSE', count: 1, options: [
        { id: 'hand', label: '謇区惆縺ｫ蜉縺医ｋ', action: toHandTCTE as EffectAction, available: true },
        { id: 'energy', label: '繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ', action: toEnaTCTE as EffectAction, available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_TRASHED_TO_HAND') {
    const selected = ctx.lastProcessedCards ?? [];
    const target = selected[0];
    if (!target) return done(addLog(ctx, 'INTERNAL_TRASHED_TO_HAND: 蟇ｾ雎｡縺ｪ縺・));
    const ti = ctx.ownerState.trash.indexOf(target);
    if (ti < 0) return done(addLog(ctx, '蟇ｾ雎｡縺後ヨ繝ｩ繝・す繝･縺ｫ縺ｪ縺・));
    const newTrash = [...ctx.ownerState.trash]; newTrash.splice(ti, 1);
    const newOwner = { ...ctx.ownerState, trash: newTrash, hand: [...ctx.ownerState.hand, target] };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(target)?.CardName ?? target}繧呈焔譛ｭ縺ｫ`));
  }
  if (stub.id === 'INTERNAL_TRASHED_TO_ENERGY') {
    const selected = ctx.lastProcessedCards ?? [];
    const target = selected[0];
    if (!target) return done(addLog(ctx, 'INTERNAL_TRASHED_TO_ENERGY: 蟇ｾ雎｡縺ｪ縺・));
    const ti = ctx.ownerState.trash.indexOf(target);
    if (ti < 0) return done(addLog(ctx, '蟇ｾ雎｡縺後ヨ繝ｩ繝・す繝･縺ｫ縺ｪ縺・));
    const newTrash = [...ctx.ownerState.trash]; newTrash.splice(ti, 1);
    const newOwner = { ...ctx.ownerState, trash: newTrash, energy: [...ctx.ownerState.energy, target] };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(target)?.CardName ?? target}繧偵お繝翫だ繝ｼ繝ｳ縺ｫ`));
  }
  // 逶ｸ謇九す繧ｰ繝玖､・焚繧偵お繝翫↓鄂ｮ縺・  if (stub.id === 'MULTI_SIGNI_TO_ENERGY') {
    const srcMSE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMSE = srcMSE ? (srcMSE.EffectText ?? '') + ' ' + (srcMSE.BurstText ?? '') : '';
    const toHWMSE = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMMSE = txtMSE.match(/繧ｷ繧ｰ繝・[・・・兔d]+)菴薙∪縺ｧ/);
    const maxMSE = maxMMSE ? parseInt(toHWMSE(maxMMSE[1])) : 2;
    const oppCandsMSE = fieldCandidates(ctx.otherState, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (oppCandsMSE.length === 0) return done(addLog(ctx, '逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨↓繧ｷ繧ｰ繝九↑縺・));
    const toEnergyMSE: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_SIGNI_TO_ENERGY_EXEC' };
    return selectOrInteract(oppCandsMSE, maxMSE, false, 'opp_field', toEnergyMSE as EffectAction, undefined, ctx);
  }
  if (stub.id === 'INTERNAL_OPP_SIGNI_TO_ENERGY_EXEC') {
    const selectedIOSE = ctx.lastProcessedCards ?? [];
    if (selectedIOSE.length === 0) return done(addLog(ctx, '繧ｨ繝翫∈・亥ｯｾ雎｡縺ｪ縺暦ｼ・));
    let newOtherIOSE = ctx.otherState;
    let countIOSE = 0;
    for (const cn of selectedIOSE) {
      if (!newOtherIOSE.field.signi.some(s => s?.at(-1) === cn)) continue;
      const removedIOSE = removeFromField(cn, newOtherIOSE);
      newOtherIOSE = { ...removedIOSE, energy: [...removedIOSE.energy, cn] };
      countIOSE++;
    }
    const namesIOSE = selectedIOSE.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
    return done(addLog({ ...ctx, otherState: newOtherIOSE },
      countIOSE > 0 ? `${namesIOSE}竊堤嶌謇九お繝翫だ繝ｼ繝ｳ` : '繧ｨ繝翫∈・亥ｯｾ雎｡縺ｪ縺暦ｼ・));
  }
  // 逶ｸ謇九す繧ｰ繝九ｒ繝・ャ繧ｭ縺ｫ蜉縺医※繧ｷ繝｣繝・ヵ繝ｫ
  if (stub.id === 'OPP_SIGNI_TO_DECK_AND_SHUFFLE') {
    const oppCandsSDS = fieldCandidates(ctx.otherState, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (oppCandsSDS.length === 0) return done(addLog(ctx, '逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨↓繧ｷ繧ｰ繝九↑縺・));
    const noopSDS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contSDS: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_SIGNI_TO_DECK_SHUFFLE' };
    const pendingSDS: PendingInteractionDef = {
      type: 'SELECT_TARGET',
      candidates: oppCandsSDS,
      count: 1,
      optional: false,
      targetScope: 'opp_field',
      thenAction: noopSDS as EffectAction,
      continuation: contSDS as EffectAction,
    };
    return needsInteraction(addLog(ctx, '逶ｸ謇九す繧ｰ繝・菴薙ｒ繝・ャ繧ｭ縺ｫ蜉縺医※繧ｷ繝｣繝・ヵ繝ｫ'), pendingSDS);
  }
  if (stub.id === 'INTERNAL_OPP_SIGNI_TO_DECK_SHUFFLE') {
    const selected = ctx.lastProcessedCards ?? [];
    if (selected.length === 0) return done(addLog(ctx, '驕ｸ謚槭↑縺・));
    let newOther = { ...ctx.otherState };
    for (const cn of selected) {
      newOther = removeFromField(cn, newOther);
      const shuffled = [...newOther.deck, cn].sort(() => Math.random() - 0.5);
      newOther = { ...newOther, deck: shuffled };
    }
    const names = selected.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
    return done(addLog({ ...ctx, otherState: newOther }, `${names}繧偵ョ繝・く縺ｫ蜉縺医※繧ｷ繝｣繝・ヵ繝ｫ`));
  }
  // 謇区惆縺ｮ繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九ｒ螂ｽ縺阪↑譫壽焚蜈ｬ髢具ｼ亥・髢具ｼ抓ELECT_TARGET縲√ョ繝・く縺ｫ隗ｦ繧後↑縺・ｼ・  if (stub.id === 'REVEAL_CLASS_SIGNI_FROM_HAND') {
    const srcRev = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRev = srcRev ? (srcRev.EffectText ?? '') + ' ' + (srcRev.BurstText ?? '') : '';
    const classMatchRev = txtRev.match(/謇区惆縺九ｉ(?:縺昴ｌ縺槭ｌ蜷榊燕縺ｮ逡ｰ縺ｪ繧・?[<・彎([^>・枉+)[>・枉縺ｮ繧ｷ繧ｰ繝・);
    const targetClassRev = classMatchRev?.[1];
    const handCands = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== '繧ｷ繧ｰ繝・) return false;
      if (targetClassRev && !c.CardClass?.includes(targetClassRev)) return false;
      return true;
    });
    if (handCands.length === 0) return done(addLog(ctx, `謇区惆縺ｫ${targetClassRev ?? '繧ｯ繝ｩ繧ｹ'}繧ｷ繧ｰ繝九↑縺暦ｼ亥・髢九せ繧ｭ繝・・・荏));
    const noopAction: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(handCands, handCands.length, true, 'self_hand', noopAction as EffectAction, undefined, ctx);
  }
  // 蟇ｾ謌ｦ逶ｸ謇九′閾ｪ蛻・・繧ｷ繧ｰ繝九ｒ驕ｸ繧薙〒繧ｨ繝翫↓鄂ｮ縺・  if (stub.id === 'OPP_CHOOSE_OWN_SIGNI_TO_ENERGY') {
    const srcOCS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOCS = srcOCS ? (srcOCS.EffectText ?? '') + ' ' + (srcOCS.BurstText ?? '') : '';
    const toHWOCS = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const powerLimitM = txtOCS.match(/繝代Ρ繝ｼ([・・・兔d]+)莉･荳翫・繧ｷ繧ｰ繝・);
    const powerLimit = powerLimitM ? parseInt(toHWOCS(powerLimitM[1])) : 0;
    const oppCands = ctx.otherState.field.signi
      .map(s => s?.at(-1))
      .filter((cn): cn is string => {
        if (!cn) return false;
        const pw = ctx.effectivePowers?.get(cn) ?? parseInt(ctx.cardMap.get(cn)?.Power ?? '0');
        return pw >= powerLimit;
      });
    if (oppCands.length === 0) return done(addLog(ctx, '蟇ｾ雎｡繧ｷ繧ｰ繝九↑縺暦ｼ育嶌謇九お繝顔ｽｮ縺阪せ繧ｭ繝・・・・));
    // 逶ｸ謇九′繧ｷ繧ｰ繝九ｒ驕ｸ縺ｶ・・pponentResponds: true・俄・ INTERNAL_OPP_FIELD_TO_ENERGY 縺ｧ繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ遘ｻ蜍・    const moveToEnaAction: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_FIELD_TO_ENERGY' };
    const pendingOCS: PendingInteractionDef = {
      type: 'SELECT_TARGET',
      candidates: oppCands,
      count: 1,
      optional: false,
      targetScope: 'opp_field',
      thenAction: moveToEnaAction as EffectAction,
      opponentResponds: true,
    };
    return needsInteraction(addLog(ctx, `蟇ｾ謌ｦ逶ｸ謇九・繝代Ρ繝ｼ${powerLimit}莉･荳翫・繧ｷ繧ｰ繝・菴薙ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ鄂ｮ縺汁), pendingOCS);
  }
  // INTERNAL_OPP_FIELD_TO_ENERGY: lastProcessedCards[0]繧堤嶌謇九ヵ繧｣繝ｼ繝ｫ繝峨°繧峨お繝翫だ繝ｼ繝ｳ縺ｸ遘ｻ蜍・  if (stub.id === 'INTERNAL_OPP_FIELD_TO_ENERGY') {
    const targetIOFTE = ctx.lastProcessedCards?.[0];
    if (!targetIOFTE) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺暦ｼ・NTERNAL_OPP_FIELD_TO_ENERGY・・));
    const newSigniIOFTE = ctx.otherState.field.signi.map(stack => {
      if (!stack?.includes(targetIOFTE)) return stack;
      const filtered = stack.filter(c => c !== targetIOFTE);
      return filtered.length > 0 ? filtered : null;
    }) as (string[] | null)[];
    const newOtherIOFTE: PlayerState = {
      ...ctx.otherState,
      field: { ...ctx.otherState.field, signi: newSigniIOFTE },
      energy: [...ctx.otherState.energy, targetIOFTE],
    };
    return done(addLog({ ...ctx, otherState: newOtherIOFTE },
      `${ctx.cardMap.get(targetIOFTE)?.CardName ?? targetIOFTE}竊堤嶌謇九お繝翫だ繝ｼ繝ｳ縺ｸ`));
  }
  // 閾ｪ繧ｷ繧ｰ繝九ｒ莉悶・遨ｺ縺阪す繧ｰ繝九だ繝ｼ繝ｳ縺ｫ遘ｻ蜍包ｼ医＠縺ｦ繧ゅｈ縺・ｼ・  if (stub.id === 'MOVE_TO_OTHER_SIGNI_ZONE') {
    const srcMov = ctx.sourceCardNum;
    if (!srcMov) return done(addLog(ctx, '繧ｾ繝ｼ繝ｳ遘ｻ蜍包ｼ壹た繝ｼ繧ｹ繧ｫ繝ｼ繝峨↑縺・));
    const currentZone = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcMov);
    if (currentZone < 0) return done(addLog(ctx, '繧ｾ繝ｼ繝ｳ遘ｻ蜍包ｼ壹ヵ繧｣繝ｼ繝ｫ繝峨↓縺・↑縺・));
    const emptyZones = [0, 1, 2].filter(i =>
      i !== currentZone && (!ctx.ownerState.field.signi[i] || ctx.ownerState.field.signi[i]!.length === 0));
    if (emptyZones.length === 0) return done(addLog(ctx, '繧ｾ繝ｼ繝ｳ遘ｻ蜍包ｼ夂ｩｺ縺阪だ繝ｼ繝ｳ縺ｪ縺・));
    const moveOptions = emptyZones.map(zi => ({
      id: `zone_${zi}`,
      label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ遘ｻ蜍描,
      action: ({ type: 'STUB', id: 'INTERNAL_MOVE_TO_ZONE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    moveOptions.push({ id: 'skip', label: '繧ｹ繧ｭ繝・・',
      action: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction) as EffectAction,
      available: true });
    const pendingMov: PendingInteractionDef = { type: 'CHOOSE', options: moveOptions, count: 1 };
    return needsInteraction(addLog(ctx, '莉悶・繧ｷ繧ｰ繝九だ繝ｼ繝ｳ縺ｫ遘ｻ蜍輔＠縺ｦ繧ゅｈ縺・), pendingMov);
  }
  if (stub.id === 'INTERNAL_MOVE_TO_ZONE') {
    const srcZ = ctx.sourceCardNum;
    const targetZoneNum = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    if (!srcZ) return done(addLog(ctx, '繧ｾ繝ｼ繝ｳ遘ｻ蜍包ｼ壹た繝ｼ繧ｹ繧ｫ繝ｼ繝峨↑縺・));
    const curZone = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcZ);
    if (curZone < 0 || curZone === targetZoneNum) return done(addLog(ctx, '繧ｾ繝ｼ繝ｳ遘ｻ蜍包ｼ壹だ繝ｼ繝ｳ迚ｹ螳壻ｸ榊庄'));
    const newSigniMov = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const movedStack = [...(newSigniMov[curZone] ?? [])];
    newSigniMov[curZone] = null;
    newSigniMov[targetZoneNum] = movedStack;
    const copyArr = <T>(arr: T[] | undefined, def: T): T[] =>
      arr ? [...arr] : [def, def, def];
    const newDown   = copyArr(ctx.ownerState.field.signi_down, false);
    const newFrozen = copyArr(ctx.ownerState.field.signi_frozen, false);
    const newCharms = copyArr(ctx.ownerState.field.signi_charms as (null | string)[], null);
    const newAcce   = copyArr(ctx.ownerState.field.signi_acce as (null | string)[], null);
    const newVirus   = copyArr(ctx.ownerState.field.signi_virus, 0);
    const newChokkin = copyArr(ctx.ownerState.field.signi_chokkin, 0);
    [newDown[targetZoneNum], newFrozen[targetZoneNum], newCharms[targetZoneNum], newAcce[targetZoneNum], newVirus[targetZoneNum], newChokkin[targetZoneNum]] =
      [newDown[curZone], newFrozen[curZone], newCharms[curZone], newAcce[curZone], newVirus[curZone], newChokkin[curZone]];
    newDown[curZone] = false; newFrozen[curZone] = false;
    newCharms[curZone] = null; newAcce[curZone] = null; newVirus[curZone] = 0; newChokkin[curZone] = 0;
    const newFieldMov = {
      ...ctx.ownerState.field, signi: newSigniMov,
      signi_down: newDown as boolean[], signi_frozen: newFrozen as boolean[],
      signi_charms: newCharms, signi_acce: newAcce, signi_virus: newVirus, signi_chokkin: newChokkin,
    };
    let ctxMov = addLog({ ...ctx, ownerState: { ...ctx.ownerState, field: newFieldMov } },
      `${ctx.cardMap.get(srcZ)?.CardName ?? srcZ}繧偵だ繝ｼ繝ｳ${curZone + 1}竊偵だ繝ｼ繝ｳ${targetZoneNum + 1}縺ｫ遘ｻ蜍描);
    // 縲悟柑譫懊↓繧医▲縺ｦ遘ｻ蜍輔＠縺溘→縺阪√ヱ繝ｯ繝ｼ+N縲阪ユ繧ｭ繧ｹ繝医′縺ゅｌ縺ｰ蜊ｳ譎る←逕ｨ
    const movTxt = ctx.cardMap.get(srcZ)?.EffectText ?? '';
    const movPwrM = movTxt.match(/遘ｻ蜍輔＠縺溘→縺・*繝代Ρ繝ｼ繧抵ｼ・[・・・兔d]+)/);
    if (movPwrM) {
      const toHWMov = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const boost = parseInt(toHWMov(movPwrM[1]));
      const modsM = [...(ctxMov.ownerState.temp_power_mods ?? [])];
      modsM.push({ cardNum: srcZ, delta: boost });
      ctxMov = addLog({ ...ctxMov, ownerState: { ...ctxMov.ownerState, temp_power_mods: modsM } },
        `${ctx.cardMap.get(srcZ)?.CardName ?? srcZ}縺ｮ繝代Ρ繝ｼ+${boost}・医ち繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ・荏);
    }
    return done(ctxMov);
  }
  // 繧ｽ繧ｦ繝ｫ莉倅ｸ趣ｼ医Ν繝ｪ繧ｰ縺ｮ荳九き繝ｼ繝峨ｒ驕ｸ謚槭す繧ｰ繝九↓莉倅ｸ趣ｼ・  if (stub.id === 'INTERNAL_ATTACH_SOUL_FROM_LRIG') {
    const targetSigniAS = (ctx.lastProcessedCards ?? [])[0];
    const soulCardAS = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    if (!targetSigniAS || !soulCardAS) return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ莉倅ｸ趣ｼ壼ｯｾ雎｡縺ｾ縺溘・繧ｫ繝ｼ繝峨↑縺・));
    const zoneIdxAS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === targetSigniAS);
    if (zoneIdxAS < 0) return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ莉倅ｸ趣ｼ壼ｯｾ雎｡繧ｷ繧ｰ繝九′蝣ｴ縺ｫ縺ｪ縺・));
    // 繝ｫ繝ｪ繧ｰ逶ｴ荳九°繧牙叙繧雁・縺呻ｼ医せ繧ｿ繝・け縺ｮ2逡ｪ逶ｮ縺九ｉ譛ｫ蟆ｾ-1縲∽ｸ逡ｪ荳九・繧ｫ繝ｼ繝会ｼ・    const lrigStackAS = ctx.ownerState.field.lrig;
    const newLrigAS = lrigStackAS.filter(cn => cn !== soulCardAS);
    // 繧ｽ繧ｦ繝ｫ縺ｨ縺励※險ｭ螳・    const newSoulAS = [...(ctx.ownerState.field.signi_soul ?? [null, null, null])];
    // 譌｢蟄倥た繧ｦ繝ｫ縺後≠繧後・lrig_trash縺ｸ
    const prevSoulAS = newSoulAS[zoneIdxAS];
    newSoulAS[zoneIdxAS] = soulCardAS;
    const newOwnerAS: PlayerState = {
      ...ctx.ownerState,
      lrig_trash: prevSoulAS ? [...ctx.ownerState.lrig_trash, prevSoulAS] : ctx.ownerState.lrig_trash,
      field: { ...ctx.ownerState.field, lrig: newLrigAS, signi_soul: newSoulAS as (string | null)[] },
    };
    const signName = ctx.cardMap.get(targetSigniAS)?.CardName ?? targetSigniAS;
    const soulName = ctx.cardMap.get(soulCardAS)?.CardName ?? soulCardAS;
    return done(addLog({ ...ctx, ownerState: newOwnerAS }, `${soulName}繧・{signName}縺ｮ縲舌た繧ｦ繝ｫ縲代↓莉倅ｸ餐));
  }
  // 繧ｽ繧ｦ繝ｫ莉倅ｸ趣ｼ医Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉ繝ｫ繝ｪ繧ｰ繧帝∈謚槭す繧ｰ繝九↓莉倅ｸ趣ｼ・  if (stub.id === 'INTERNAL_CHOOSE_SOUL_LRIG') {
    const targetSigniCSL = (ctx.lastProcessedCards ?? [])[0];
    if (!targetSigniCSL) return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ莉倅ｸ趣ｼ医Ν繝ｪ繧ｰ繝医Λ繝・す繝･・会ｼ壼ｯｾ雎｡繧ｷ繧ｰ繝九↑縺・));
    const zoneIdxCSL = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === targetSigniCSL);
    if (zoneIdxCSL < 0) return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ莉倅ｸ趣ｼ壼ｯｾ雎｡繧ｷ繧ｰ繝九′蝣ｴ縺ｫ縺ｪ縺・));
    const lrigInTrashCSL = ctx.ownerState.lrig_trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === '繝ｫ繝ｪ繧ｰ' || c?.Type === '繧｢繧ｷ繧ｹ繝医Ν繝ｪ繧ｰ';
    });
    if (lrigInTrashCSL.length === 0) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ繝ｫ繝ｪ繧ｰ縺ｪ縺・));
    // SEARCH繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ縺ｧ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉ1譫夐∈謚・    const attachAfterSearch: StubAction = {
      type: 'STUB', id: 'INTERNAL_SET_SOUL_FROM_LRIG_TRASH_RESULT',
      value: targetSigniCSL,
    };
    const pendingCSL: PendingInteractionDef = {
      type: 'SEARCH',
      visibleCards: lrigInTrashCSL,
      maxPick: 1,
      thenAction: attachAfterSearch as EffectAction,
    };
    return needsInteraction(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺九ｉ繝ｫ繝ｪ繧ｰ繧帝∈謚橸ｼ医た繧ｦ繝ｫ莉倅ｸ趣ｼ・), pendingCSL);
  }
  // 繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･驕ｸ謚槫ｾ後た繧ｦ繝ｫ莉倅ｸ・  if (stub.id === 'INTERNAL_SET_SOUL_FROM_LRIG_TRASH_RESULT') {
    const targetSigniSFLTR = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const soulCardSFLTR = (ctx.lastProcessedCards ?? [])[0];
    if (!targetSigniSFLTR || !soulCardSFLTR) return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ莉倅ｸ守ｵ先棡・壼ｯｾ雎｡縺ｾ縺溘・繧ｫ繝ｼ繝峨↑縺・));
    const zoneIdxSFLTR = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === targetSigniSFLTR);
    if (zoneIdxSFLTR < 0) return done(addLog(ctx, '繧ｽ繧ｦ繝ｫ莉倅ｸ趣ｼ壼ｯｾ雎｡繧ｷ繧ｰ繝九′蝣ｴ縺ｫ縺ｪ縺・));
    const newLrigTrashSFLTR = ctx.ownerState.lrig_trash.filter(cn => cn !== soulCardSFLTR);
    const newSoulSFLTR = [...(ctx.ownerState.field.signi_soul ?? [null, null, null])];
    const prevSoulSFLTR = newSoulSFLTR[zoneIdxSFLTR];
    newSoulSFLTR[zoneIdxSFLTR] = soulCardSFLTR;
    const newOwnerSFLTR: PlayerState = {
      ...ctx.ownerState,
      lrig_trash: prevSoulSFLTR
        ? [...newLrigTrashSFLTR, prevSoulSFLTR]
        : newLrigTrashSFLTR,
      field: { ...ctx.ownerState.field, signi_soul: newSoulSFLTR as (string | null)[] },
    };
    const signNameSFLTR = ctx.cardMap.get(targetSigniSFLTR)?.CardName ?? targetSigniSFLTR;
    const soulNameSFLTR = ctx.cardMap.get(soulCardSFLTR)?.CardName ?? soulCardSFLTR;
    return done(addLog({ ...ctx, ownerState: newOwnerSFLTR }, `${soulNameSFLTR}繧・{signNameSFLTR}縺ｮ縲舌た繧ｦ繝ｫ縲代↓莉倅ｸ餐));
  }
  // 蜈ｬ髢九＠縺溘き繝ｼ繝画椢謨ｰ蝓ｺ貅悶ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_PER_REVEALED') {
    const revCount = (ctx.lastProcessedCards ?? []).length;
    if (revCount === 0) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣・壼・髢・譫・));
    const srcPR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPR = srcPR ? (srcPR.EffectText ?? '') + ' ' + (srcPR.BurstText ?? '') : '';
    const toHWPR = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPR = txtPR.match(/譫壹↓縺､縺・[・・][・・・兔d]+)/);
    const deltaPerCard = mPR ? parseInt(toHWPR(mPR[1]).replace('・・, '+').replace('+', '+')) : 1000;
    const totalDelta = deltaPerCard * revCount;
    const targetCnPR = ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)
      ? ctx.sourceCardNum
      : ctx.ownerState.field.signi.find(s => s && s.length > 0)?.at(-1);
    if (!targetCnPR) return done(addLog(ctx, `繝代Ρ繝ｼ${totalDelta > 0 ? '+' : ''}${totalDelta}・医ヵ繧｣繝ｼ繝ｫ繝峨↑縺暦ｼ荏));
    const mods = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: targetCnPR, delta: totalDelta }];
    const newOwner = { ...ctx.ownerState, temp_power_mods: mods };
    return done(addLog({ ...ctx, ownerState: newOwner },
      `${ctx.cardMap.get(targetCnPR)?.CardName ?? targetCnPR}繝代Ρ繝ｼ${totalDelta > 0 ? '+' : ''}${totalDelta}・・{revCount}譫壼・髢具ｼ荏));
  }
  // 縺薙・繧ｿ繝ｼ繝ｳ逶ｸ謇九・繧ｬ繝ｼ繝峨〒縺阪↑縺・ｼ医ぎ繝ｼ繝峨さ繧ｹ繝育┌濶ｲ迚・or 繧ｬ繝ｼ繝臥ｦ∵ｭ｢・・  if (stub.id === 'OPP_GUARD_COST_COLORLESS' || stub.id === 'PREVENT_OPP_GUARD_THIS_TURN') {
    const newOwner = { ...ctx.ownerState, prevent_opp_guard: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, '縺薙・繧ｿ繝ｼ繝ｳ蟇ｾ謌ｦ逶ｸ謇九・繧ｬ繝ｼ繝峨〒縺阪↑縺・));
  }
  // 繧ｭ繝ｼ・第椢繧剃ｻｻ諢上〒繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺擾ｼ郁ｿｽ蜉蜉ｹ譫懈擅莉ｶ・・  if (stub.id === 'TRASH_OWN_KEY_OPTIONAL') {
    const keyPiece = ctx.ownerState.field.key_piece;
    if (!keyPiece) return done(addLog(ctx, '繧ｭ繝ｼ縺ｪ縺暦ｼ郁ｿｽ蜉蜉ｹ譫懊せ繧ｭ繝・・・・));
    const keyName = ctx.cardMap.get(keyPiece)?.CardName ?? keyPiece;
    const trashKeyStub: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_OWN_KEY' };
    const skipStub: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const pendingKey: PendingInteractionDef = {
      type: 'CHOOSE',
      options: [
        { id: 'do', label: `${keyName}繧偵Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ・郁ｿｽ蜉蜉ｹ譫懶ｼ荏, action: trashKeyStub as EffectAction, available: true },
        { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: skipStub as EffectAction, available: true },
      ],
      count: 1,
    };
    return needsInteraction(addLog(ctx, `繧ｭ繝ｼ縲・{keyName}縲阪ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・※繧ゅｈ縺Я), pendingKey);
  }
  if (stub.id === 'INTERNAL_TRASH_OWN_KEY') {
    const key = ctx.ownerState.field.key_piece;
    if (!key) return done(addLog(ctx, '繧ｭ繝ｼ縺ｪ縺・));
    const newField = { ...ctx.ownerState.field, key_piece: null };
    const newOwner = {
      ...ctx.ownerState, field: newField,
      lrig_trash: [...ctx.ownerState.lrig_trash, key],
    };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(key)?.CardName ?? key}繧偵Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ`));
  }
  // 謇区惆縺九ｉ繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九ｒ莉ｻ諢乗椢謨ｰ謐ｨ縺ｦ繧・  if (stub.id === 'OPTIONAL_DISCARD_CLASS_SIGNI') {
    const srcODC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtODC = srcODC ? (srcODC.EffectText ?? '') + ' ' + (srcODC.BurstText ?? '') : '';
    const toHWODC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchODC = txtODC.match(/謇区惆縺九ｉ[<・彎([^>・枉+)[>・枉縺ｮ繧ｷ繧ｰ繝・);
    const targetClassODC = classMatchODC?.[1];
    const maxMODC = txtODC.match(/繧ｷ繧ｰ繝・[・・・兔d]+)譫壹∪縺ｧ/);
    const maxODC = maxMODC ? parseInt(toHWODC(maxMODC[1])) : 1;
    const handCands = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== '繧ｷ繧ｰ繝・) return false;
      if (targetClassODC && !c.CardClass?.includes(targetClassODC)) return false;
      return true;
    });
    if (handCands.length === 0) return done(addLog(ctx, `謇区惆縺ｫ${targetClassODC ?? '繧ｯ繝ｩ繧ｹ'}繧ｷ繧ｰ繝九↑縺暦ｼ井ｻｻ諢乗昏縺ｦ繧ｹ繧ｭ繝・・・荏));
    const discardActionODC: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 },
    };
    return selectOrInteract(handCands, maxODC, true, 'self_hand', discardActionODC as EffectAction, undefined, ctx);
  }
  // 謇区惆縺ｮ繧ｷ繧ｰ繝九ｒ縺薙・繧ｷ繧ｰ繝九・荳九↓鄂ｮ縺・  if (stub.id === 'HAND_SIGNI_UNDER_SIGNI') {
    const srcHSU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHSU = srcHSU ? (srcHSU.EffectText ?? '') + ' ' + (srcHSU.BurstText ?? '') : '';
    const toHWHSU = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMHSU = txtHSU.match(/謇区惆縺九ｉ.*繧ｷ繧ｰ繝・[・・・兔d]+)譫・);
    const maxHSU = maxMHSU ? parseInt(toHWHSU(maxMHSU[1])) : 1;
    const classMatchHSU = txtHSU.match(/謇区惆縺九ｉ[<・彎([^>・枉+)[>・枉縺ｮ繧ｷ繧ｰ繝・);
    const targetClassHSU = classMatchHSU?.[1];
    const handSigHSU = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== '繧ｷ繧ｰ繝・) return false;
      if (targetClassHSU && !c.CardClass?.includes(targetClassHSU)) return false;
      return true;
    });
    if (handSigHSU.length === 0) return done(addLog(ctx, '謇区惆縺ｫ繧ｷ繧ｰ繝九↑縺暦ｼ医す繧ｰ繝倶ｸ矩・鄂ｮ繧ｹ繧ｭ繝・・・・));
    const placeAction: PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'hand' };
    return selectOrInteract(handSigHSU, maxHSU, false, 'self_hand', placeAction as EffectAction, undefined, ctx);
  }
  // 謇区惆縺九ｉ繧ｫ繝ｼ繝峨ｒ縺薙・繧ｷ繧ｰ繝九・荳九↓鄂ｮ縺擾ｼ・AND_CARDS_UNDER_SIGNI / PLACE_SIGNI_UNDER_SELF_OPT・・  if (stub.id === 'HAND_CARDS_UNDER_SIGNI' || stub.id === 'PLACE_SIGNI_UNDER_SELF_OPT') {
    const srcHCU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHCU = srcHCU ? (srcHCU.EffectText ?? '') + ' ' + (srcHCU.BurstText ?? '') : '';
    const toHWHCU = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMHCU = txtHCU.match(/(?:謇区惆縺九ｉ)?繧ｫ繝ｼ繝・?:繧・?([・・・兔d]+)譫壹∪縺ｧ/);
    const maxHCU = maxMHCU ? parseInt(toHWHCU(maxMHCU[1])) : 1;
    const optHCU = stub.id === 'PLACE_SIGNI_UNDER_SELF_OPT' || txtHCU.includes('繧ゅｈ縺・);
    // 繝ｬ繝吶Ν莉･荳翫ヵ繧｣繝ｫ繧ｿ・・繝ｬ繝吶ΝN莉･荳・・峨∪縺溘・螳悟・荳閾ｴ繝輔ぅ繝ｫ繧ｿ・・繝ｬ繝吶ΝN"・・    const lvMinMHCU = txtHCU.match(/繝ｬ繝吶Ν([・・・兔d]+)莉･荳・);
    const lvExactMHCU = !lvMinMHCU && txtHCU.match(/繝ｬ繝吶Ν([・・・兔d]+)(?![莉･荳贋ｻ･荳欺d])/);
    const minLvHCU = lvMinMHCU ? parseInt(toHWHCU(lvMinMHCU[1])) : 0;
    const exactLvHCU = lvExactMHCU ? parseInt(toHWHCU(lvExactMHCU[1])) : -1;
    const levelOkHCU = (lv: number) => {
      if (exactLvHCU >= 0) return lv === exactLvHCU;
      if (minLvHCU > 0) return lv >= minLvHCU;
      return true;
    };
    // PLACE_SIGNI_UNDER_SELF_OPT 縺ｧ "謇区惆縺九ｉ" 縺ｮ譏守､ｺ縺後↑縺・ｴ蜷医・繝輔ぅ繝ｼ繝ｫ繝峨°繧・    const useFieldHCU = stub.id === 'PLACE_SIGNI_UNDER_SELF_OPT' && !txtHCU.includes('謇区惆');
    if (useFieldHCU) {
      const fieldCandsHCU = ctx.ownerState.field.signi.flatMap(stack => {
        const top = stack?.at(-1);
        if (!top || top === ctx.sourceCardNum) return [];
        const c = ctx.cardMap.get(top);
        if (!c) return [];
        return levelOkHCU(parseInt(c.Level ?? '0')) ? [top] : [];
      });
      if (fieldCandsHCU.length === 0) return done(addLog(ctx, '蟇ｾ雎｡繧ｷ繧ｰ繝九↑縺暦ｼ・LACE_SIGNI_UNDER_SELF_OPT・・));
      const placeFieldHCU: PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'field' };
      return selectOrInteract(fieldCandsHCU, maxHCU, optHCU, 'self_field', placeFieldHCU as EffectAction, undefined, ctx);
    }
    const handCandsHCU = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (!c) return false;
      return levelOkHCU(parseInt(c.Level ?? '0'));
    });
    if (handCandsHCU.length === 0) return done(addLog(ctx, '謇区惆縺ｪ縺暦ｼ医す繧ｰ繝倶ｸ矩・鄂ｮ繧ｹ繧ｭ繝・・・・));
    const placeActionHCU: PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'hand' };
    return selectOrInteract(handCandsHCU, maxHCU, optHCU, 'self_hand', placeActionHCU as EffectAction, undefined, ctx);
  }
  // 繧ｷ繧ｰ繝九・荳九・繧ｫ繝ｼ繝峨ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ鄂ｮ縺・  if (stub.id === 'UNDER_SIGNI_TO_ENERGY') {
    // SELECT_TARGET蠕後・蜃ｦ逅・ｼ嗟astProcessedCards縺ｫ繧ｫ繝ｼ繝峨′縺ゅｋ蝣ｴ蜷・    if (ctx.lastProcessedCards?.length) {
      const movedUTE = ctx.lastProcessedCards[0];
      const newSigniUTE2 = ctx.ownerState.field.signi.map(stack => {
        if (!stack?.includes(movedUTE)) return stack;
        const filtered = stack.filter(c => c !== movedUTE);
        return filtered.length > 0 ? filtered : null;
      }) as (string[] | null)[];
      const newOwnerUTE2 = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniUTE2 }, energy: [...ctx.ownerState.energy, movedUTE] };
      return done(addLog({ ...ctx, ownerState: newOwnerUTE2 },
        `${ctx.cardMap.get(movedUTE)?.CardName ?? movedUTE}繧偵お繝翫だ繝ｼ繝ｳ縺ｸ・医す繧ｰ繝倶ｸ九°繧会ｼ荏));
    }
    // 繧ｽ繝ｼ繧ｹ繧ｾ繝ｼ繝ｳ縺ｮ繧ｷ繧ｰ繝倶ｸ九き繝ｼ繝峨ｒ蜿朱寔
    const srcZoneUTE = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : ctx.ownerState.field.signi.findIndex(s => s && s.length > 1);
    if (srcZoneUTE < 0) return done(addLog(ctx, '繧ｷ繧ｰ繝九・荳九↓繧ｫ繝ｼ繝峨↑縺暦ｼ・NDER_SIGNI_TO_ENERGY・・));
    const stackUTE = ctx.ownerState.field.signi[srcZoneUTE] ?? [];
    const underCardsUTE = stackUTE.slice(0, -1); // 譛蜑埼擇莉･螟厄ｼ井ｸ九・繧ｫ繝ｼ繝臥ｾ､・・    if (underCardsUTE.length === 0) return done(addLog(ctx, '繧ｷ繧ｰ繝九・荳九↓繧ｫ繝ｼ繝峨↑縺・));
    if (underCardsUTE.length === 1) {
      // 1譫壹・縺ｿ竊堤峩謗･繧ｨ繝翫∈
      const movedUTE = underCardsUTE[0];
      const newStackUTE = stackUTE.filter(c => c !== movedUTE);
      const newSigniUTE = [...ctx.ownerState.field.signi] as (string[] | null)[];
      newSigniUTE[srcZoneUTE] = newStackUTE.length > 0 ? newStackUTE : null;
      const newOwnerUTE = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniUTE }, energy: [...ctx.ownerState.energy, movedUTE] };
      return done(addLog({ ...ctx, ownerState: newOwnerUTE },
        `${ctx.cardMap.get(movedUTE)?.CardName ?? movedUTE}繧偵お繝翫だ繝ｼ繝ｳ縺ｸ・医す繧ｰ繝倶ｸ九°繧会ｼ荏));
    }
    // 隍・焚譫壺・SELECT_TARGET
    const contUTE: StubAction = { type: 'STUB', id: 'UNDER_SIGNI_TO_ENERGY' };
    return needsInteraction(addLog(ctx, '繧ｷ繧ｰ繝倶ｸ九・繧ｫ繝ｼ繝峨ｒ驕ｸ謚橸ｼ医お繝翫だ繝ｼ繝ｳ縺ｸ・・), {
      type: 'SELECT_TARGET', candidates: underCardsUTE, count: 1, optional: false,
      targetScope: 'self_field', thenAction: contUTE as EffectAction,
    });
  }
  // 繝・ャ繧ｭ繝医ャ繝励ｒ蜈ｬ髢九＠縺ｦ繝ｬ繝吶Ν荳閾ｴ縺ｪ繧画焔譛ｭ縺ｫ蜉縺医ｋ
  if (stub.id === 'DECK_TOP_CHECK_LEVEL_HAND') {
    const declaredLv = ctx.ownerState.declared_guard_restrict_level;
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const topCard = ctx.ownerState.deck[0];
    const topData = ctx.cardMap.get(topCard);
    const topLv = parseInt(topData?.Level ?? '-1');
    if (declaredLv !== undefined && topData?.Type === '繧ｷ繧ｰ繝・ && topLv === declaredLv) {
      const newDeck = ctx.ownerState.deck.slice(1);
      const newOwner = { ...ctx.ownerState, deck: newDeck, hand: [...ctx.ownerState.hand, topCard] };
      return done(addLog({ ...ctx, ownerState: newOwner },
        `繝・ャ繧ｭ繝医ャ繝怜・髢具ｼ・{topData?.CardName ?? topCard}・・v${topLv}・俄・謇区惆`));
    }
    const name = topData?.CardName ?? topCard;
    const lv = topData?.Level ?? '?';
    // 荳閾ｴ縺励↑縺・ｴ蜷医・繝・ャ繧ｭ繝医ャ繝励↓謌ｻ縺呻ｼ育ｧｻ蜍輔↑縺暦ｼ・    return done(addLog(ctx, `繝・ャ繧ｭ繝医ャ繝怜・髢具ｼ・{name}・・v${lv}・俄・荳堺ｸ閾ｴ縲√ョ繝・く繝医ャ繝励↓謌ｻ縺兪));
  }
  // 逶ｸ謇九・謇区惆縺ｮ繧ｷ繧ｰ繝九ｒ隕九※謐ｨ縺ｦ縺輔○繧具ｼ亥ｮ｣險謨ｰ蟄励ヵ繧｣繝ｫ繧ｿ or 譛芽牡繝輔ぅ繝ｫ繧ｿ・・  if (stub.id === 'LOOK_OPP_HAND_DISCARD_SIGNI') {
    const declaredLvLOD = ctx.ownerState.declared_guard_restrict_level;
    const oppHandLOD = ctx.otherState.hand;
    const candsLOD = oppHandLOD.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== '繧ｷ繧ｰ繝・) return false;
      if (declaredLvLOD !== undefined) {
        return parseInt(c.Level ?? '-1') === declaredLvLOD;
      }
      const color = c?.Color ?? '';
      return color.length > 0 && color !== '辟｡';
    });
    if (candsLOD.length === 0) return done(addLog(ctx, '逶ｸ謇区焔譛ｭ縺ｫ蟇ｾ雎｡繧ｷ繧ｰ繝九↑縺暦ｼ・OOK_OPP_HAND_DISCARD_SIGNI・・));
    const discardLOD: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 },
    };
    return selectOrInteract(candsLOD, 1, false, 'opp_hand', discardLOD as EffectAction, undefined, ctx);
  }
  // 繝・ャ繧ｭ荳翫ｒ蜈ｬ髢九＠縲∝ｮ｣險縺励◆繝ｬ繝吶Ν縺ｮ繧ｷ繧ｰ繝九↑繧峨お繝翫だ繝ｼ繝ｳ縺ｸ
  if (stub.id === 'DECK_TOP_CHECK_LEVEL_ENERGY') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺暦ｼ・ECK_TOP_CHECK_LEVEL_ENERGY・・));
    const declaredLvDTE = ctx.ownerState.declared_guard_restrict_level;
    const topCardDTE = ctx.ownerState.deck[0];
    const topDataDTE = ctx.cardMap.get(topCardDTE);
    const topLvDTE = parseInt(topDataDTE?.Level ?? '-1');
    const topNameDTE = topDataDTE?.CardName ?? topCardDTE;
    if (topDataDTE?.Type === '繧ｷ繧ｰ繝・ && declaredLvDTE !== undefined && topLvDTE === declaredLvDTE) {
      const newDeckDTE = ctx.ownerState.deck.slice(1);
      const newOwnerDTE = { ...ctx.ownerState, deck: newDeckDTE, energy: [...ctx.ownerState.energy, topCardDTE] };
      return done(addLog({ ...ctx, ownerState: newOwnerDTE },
        `繝・ャ繧ｭ繝医ャ繝怜・髢具ｼ・{topNameDTE}・・v${topLvDTE}・俄・繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ`));
    }
    return done(addLog(ctx, `繝・ャ繧ｭ繝医ャ繝怜・髢具ｼ・{topNameDTE}・・v${topDataDTE?.Level ?? '?'}・俄・譚｡莉ｶ荳堺ｸ閾ｴ`));
  }
  // 繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｮ繧｢繝ｼ繝・椢謨ｰ縺ｫ蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣・亥ｯｾ雎｡1菴薙ｒ蜈医↓SELECT_TARGET縺ｧ驕ｸ縺ｶ・・  if (stub.id === 'POWER_MOD_BY_LRIG_TRASH_ARTS') {
    const srcPMLTA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMLTA = srcPMLTA ? (srcPMLTA.EffectText ?? '') + ' ' + (srcPMLTA.BurstText ?? '') : '';
    const toHWPMLTA = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const artsCountPMLTA = (ctx.ownerState.lrig_trash ?? []).filter(cn => ctx.cardMap.get(cn)?.Type === '繧｢繝ｼ繝・).length;
    const perMPMLTA = txtPMLTA.match(/繧｢繝ｼ繝・[・・・兔d]*)譫・縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (!perMPMLTA) return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・医Ν繝ｪ繧ｰ繝医Λ繝・す繝･繧｢繝ｼ繝・{artsCountPMLTA}譫夲ｼ荏));
    const divisorPMLTA = parseInt(toHWPMLTA(perMPMLTA[1] || '1')) || 1;
    const deltaPMLTA = parseInt(toHWPMLTA(perMPMLTA[2]).replace('・・, '-').replace('・・, '+'));
    const totalDeltaPMLTA = Math.floor(artsCountPMLTA / divisorPMLTA) * deltaPMLTA;
    // 蟇ｾ雎｡繧ｷ繧ｰ繝九′譛ｪ驕ｸ謚槭↑繧・SELECT_TARGET 縺ｧ逶ｸ謇九す繧ｰ繝九ｒ驕ｸ縺ｶ
    if (!ctx.lastProcessedCards?.length) {
      const oppCandsPMLTA = ctx.otherState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
      if (oppCandsPMLTA.length === 0) return done(addLog(ctx, '蟇ｾ雎｡逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・OWER_MOD_BY_LRIG_TRASH_ARTS・・));
      const contPMLTA: StubAction = { type: 'STUB', id: 'POWER_MOD_BY_LRIG_TRASH_ARTS' };
      return needsInteraction(addLog(ctx, '蟇ｾ雎｡繧ｷ繧ｰ繝九ｒ驕ｸ謚橸ｼ医Ν繝ｪ繧ｰ繝医Λ繝・す繝･繧｢繝ｼ繝・↓繧医ｋ繝代Ρ繝ｼ菫ｮ豁｣・・), {
        type: 'SELECT_TARGET', candidates: oppCandsPMLTA, count: 1, optional: false,
        targetScope: 'opp_field', thenAction: contPMLTA as EffectAction,
      });
    }
    const modsPMLTA = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of ctx.lastProcessedCards) modsPMLTA.push({ cardNum: cn, delta: totalDeltaPMLTA });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMLTA } },
      `繝代Ρ繝ｼ${totalDeltaPMLTA > 0 ? '+' : ''}${totalDeltaPMLTA}・医Ν繝ｪ繧ｰ繝医Λ繝・す繝･繧｢繝ｼ繝・{artsCountPMLTA}譫夲ｼ荏));
  }
  // 繝ｫ繝ｪ繧ｰ繝ｬ繝吶Ν縺ｫ蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣・育嶌謇九そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ繝ｬ繝吶Ν繧貞盾辣ｧ・・  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL') {
    const srcPMLV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMLV = srcPMLV ? (srcPMLV.EffectText ?? '') + ' ' + (srcPMLV.BurstText ?? '') : '';
    const toHWPMLV = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const oppLrigTop = ctx.otherState.field.lrig.at(-1);
    const oppLrigLv = parseInt(ctx.cardMap.get(oppLrigTop ?? '')?.Level ?? '0');
    const perMPMLV = txtPMLV.match(/繝ｬ繝吶Ν([・・・兔d]*)縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (perMPMLV) {
      const divisorPMLV = parseInt(toHWPMLV(perMPMLV[1] || '1')) || 1;
      const deltaPMLV = parseInt(toHWPMLV(perMPMLV[2]).replace('・・, '-').replace('・・, '+'));
      const totalDeltaPMLV = Math.floor(oppLrigLv / divisorPMLV) * deltaPMLV;
      if (totalDeltaPMLV !== 0) {
        const targetsPMLV = ctx.lastProcessedCards ?? [];
        const modsPMLV = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPMLV.length > 0) {
          for (const cn of targetsPMLV) modsPMLV.push({ cardNum: cn, delta: totalDeltaPMLV });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPMLV.push({ cardNum: top, delta: totalDeltaPMLV });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMLV } },
          `繝代Ρ繝ｼ${totalDeltaPMLV > 0 ? '+' : ''}${totalDeltaPMLV}・育嶌謇九Ν繝ｪ繧ｰLv${oppLrigLv}・荏));
      }
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・育嶌謇九Ν繝ｪ繧ｰLv${oppLrigLv}・荏));
  }
  // 繝ｫ繝ｪ繧ｰ繝ｬ繝吶Ν蜷郁ｨ医↓蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣・郁・蛻・・繝ｫ繝ｪ繧ｰ蜈ｨ菴薙・繝ｬ繝吶Ν蜷郁ｨ医ｒ蜿ら・・・  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL_SUM') {
    const srcPMLS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMLS = srcPMLS ? (srcPMLS.EffectText ?? '') + ' ' + (srcPMLS.BurstText ?? '') : '';
    const toHWPMLS = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const lrigLvSum = (ctx.ownerState.field.lrig ?? []).reduce((acc, cn) => {
      const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0');
      return acc + (isNaN(lv) ? 0 : lv);
    }, 0);
    const perMPMLS = txtPMLS.match(/繝ｬ繝吶Ν縺ｮ蜷郁ｨ・[・・・兔d]*)縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (perMPMLS) {
      const divisorPMLS = parseInt(toHWPMLS(perMPMLS[1] || '1')) || 1;
      const deltaPMLS = parseInt(toHWPMLS(perMPMLS[2]).replace('・・, '-').replace('・・, '+'));
      const totalDeltaPMLS = Math.floor(lrigLvSum / divisorPMLS) * deltaPMLS;
      if (totalDeltaPMLS !== 0) {
        // 閾ｪ繧ｷ繧ｰ繝具ｼ・ourceCardNum・峨↓驕ｩ逕ｨ縲√↑縺代ｌ縺ｰ蜈ｨ閾ｪ繧ｷ繧ｰ繝・        const selfTargetPMLS = ctx.sourceCardNum;
        const modsPMLS = [...(ctx.ownerState.temp_power_mods ?? [])];
        if (selfTargetPMLS && ctx.ownerState.field.signi.some(s => s?.at(-1) === selfTargetPMLS)) {
          modsPMLS.push({ cardNum: selfTargetPMLS, delta: totalDeltaPMLS });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.ownerState.field.signi[zi]?.at(-1);
            if (top) modsPMLS.push({ cardNum: top, delta: totalDeltaPMLS });
          }
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPMLS } },
          `繝代Ρ繝ｼ${totalDeltaPMLS > 0 ? '+' : ''}${totalDeltaPMLS}・医Ν繝ｪ繧ｰ繝ｬ繝吶Ν蜷郁ｨ・{lrigLvSum}・荏));
      }
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・医Ν繝ｪ繧ｰ繝ｬ繝吶Ν蜷郁ｨ・{lrigLvSum}・荏));
  }
  // 繝医Λ繝・す繝･縺ｮ迚ｹ螳壹け繝ｩ繧ｹ繧ｫ繝ｼ繝画椢謨ｰ縺ｫ蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_BY_TRASH_CLASS_COUNT') {
    const srcPMTCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMTCC = srcPMTCC ? (srcPMTCC.EffectText ?? '') + ' ' + (srcPMTCC.BurstText ?? '') : '';
    const toHWPMTCC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchPMTCC = txtPMTCC.match(/繝医Λ繝・す繝･縺ｫ縺ゅｋ[<・懊馨([^>・槭犠+)[>・楪ｻ]縺ｮ繧ｫ繝ｼ繝・[・・・兔d]*)譫・縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (classMatchPMTCC) {
      const targetClass = classMatchPMTCC[1];
      const divisorPMTCC = parseInt(toHWPMTCC(classMatchPMTCC[2] || '1')) || 1;
      const deltaPMTCC = parseInt(toHWPMTCC(classMatchPMTCC[3]).replace('・・, '-').replace('・・, '+'));
      const countPMTCC = ctx.ownerState.trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.CardClass?.includes(targetClass);
      }).length;
      const totalDeltaPMTCC = Math.floor(countPMTCC / divisorPMTCC) * deltaPMTCC;
      if (totalDeltaPMTCC !== 0) {
        const targetsPMTCC = ctx.lastProcessedCards ?? [];
        const modsPMTCC = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPMTCC.length > 0) {
          for (const cn of targetsPMTCC) modsPMTCC.push({ cardNum: cn, delta: totalDeltaPMTCC });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPMTCC.push({ cardNum: top, delta: totalDeltaPMTCC });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMTCC } },
          `繝代Ρ繝ｼ${totalDeltaPMTCC > 0 ? '+' : ''}${totalDeltaPMTCC}・医ヨ繝ｩ繝・す繝･${targetClass}ﾃ・{countPMTCC}譫夲ｼ荏));
      }
    }
    return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣・医ヨ繝ｩ繝・す繝･繧ｯ繝ｩ繧ｹ謨ｰ・・));
  }
  // 閾ｪ蝣ｴ繧ｷ繧ｰ繝九・濶ｲ縺ｮ遞ｮ鬘樊焚ﾃ妖elta 竊・1菴鍋嶌謇九す繧ｰ繝九ヱ繝ｯ繝ｼ菫ｮ豁｣・・ELECT_TARGET竊定・蟾ｱ蜀榊ｸｰ・・  if (stub.id === 'POWER_MOD_BY_COLOR_VARIETY') {
    const toHWPMCV = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const colorSetPMCV = new Set<string>();
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (top) {
        const colors = (ctx.cardMap.get(top)?.Color ?? '').split('/').map(c => c.trim()).filter(c => c && c !== '辟｡');
        for (const c of colors) colorSetPMCV.add(c);
      }
    }
    const varietyPMCV = colorSetPMCV.size;
    const srcPMCV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMCV = srcPMCV ? (srcPMCV.EffectText ?? '') + ' ' + (srcPMCV.BurstText ?? '') : '';
    const mPMCV = txtPMCV.match(/濶ｲ縺ｮ遞ｮ鬘・[・・・兔d]*)縺､縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    const divisorPMCV = mPMCV ? parseInt(toHWPMCV(mPMCV[1] || '1')) || 1 : 1;
    const deltaPMCV = mPMCV ? parseInt(toHWPMCV(mPMCV[2]).replace('・・, '-').replace('・・, '+')) : -3000;
    const totalDeltaPMCV = Math.floor(varietyPMCV / divisorPMCV) * deltaPMCV;
    // 譌｢縺ｫ繧ｿ繝ｼ繧ｲ繝・ヨ驕ｸ謚樊ｸ医∩縺ｪ繧蛾←逕ｨ
    const existPMCV = (ctx.lastProcessedCards ?? []).find(cn => ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (existPMCV) {
      const modsPMCV = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: existPMCV, delta: totalDeltaPMCV }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMCV } },
        `${ctx.cardMap.get(existPMCV)?.CardName ?? existPMCV}縺ｮ繝代Ρ繝ｼ${totalDeltaPMCV}・郁牡${varietyPMCV}遞ｮ・荏));
    }
    const oppCandsPMCV = fieldCandidates(ctx.otherState, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (oppCandsPMCV.length === 0) return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・OWER_MOD_BY_COLOR_VARIETY・・));
    const contPMCV: StubAction = { type: 'STUB', id: 'POWER_MOD_BY_COLOR_VARIETY' };
    const noopPMCV: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(oppCandsPMCV, 1, false, 'opp_field', noopPMCV as EffectAction, contPMCV as EffectAction, ctx);
  }
  // 閾ｪ蝣ｴ縺ｮ迚ｹ螳壹け繝ｩ繧ｹ繧ｷ繧ｰ繝九・繝ｬ繝吶Ν蜷郁ｨ医↓蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_BY_FIELD_CLASS_LEVEL') {
    const srcPMFCL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMFCL = srcPMFCL ? (srcPMFCL.EffectText ?? '') + ' ' + (srcPMFCL.BurstText ?? '') : '';
    const toHWPMFCL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchFCL = txtPMFCL.match(/[<・懊馨([^>・槭犠+)[>・楪ｻ]縺ｮ繧ｷ繧ｰ繝九・繝ｬ繝吶Ν繧貞粋險医＠縺滓焚縺縺・[・搾ｼ犠[・・・兔d]+)/);
    if (classMatchFCL) {
      const targetClassFCL = classMatchFCL[1];
      const deltaPerLvFCL = parseInt(toHWPMFCL(classMatchFCL[2]).replace('・・, '-').replace('・・, '+'));
      const lvSumFCL = [0, 1, 2].reduce((acc, zi) => {
        const top = ctx.ownerState.field.signi[zi]?.at(-1);
        if (!top) return acc;
        const c = ctx.cardMap.get(top);
        if (!c?.CardClass?.includes(targetClassFCL)) return acc;
        return acc + (parseInt(c.Level ?? '0') || 0);
      }, 0);
      const totalDeltaFCL = lvSumFCL * deltaPerLvFCL;
      if (totalDeltaFCL !== 0) {
        const targetsFCL = ctx.lastProcessedCards ?? [];
        const modsFCL = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsFCL.length > 0) {
          for (const cn of targetsFCL) modsFCL.push({ cardNum: cn, delta: totalDeltaFCL });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsFCL.push({ cardNum: top, delta: totalDeltaFCL });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsFCL } },
          `繝代Ρ繝ｼ${totalDeltaFCL > 0 ? '+' : ''}${totalDeltaFCL}・・{targetClassFCL}繝ｬ繝吶Ν蜷郁ｨ・{lvSumFCL}・荏));
      }
    }
    return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣・医ヵ繧｣繝ｼ繝ｫ繝峨け繝ｩ繧ｹ繝ｬ繝吶Ν・・));
  }
  // 繧ｷ繧ｰ繝倶ｸ九・繧ｫ繝ｼ繝画椢謨ｰﾃ妖elta 竊・2菴薙∪縺ｧ逶ｸ謇九す繧ｰ繝九ヱ繝ｯ繝ｼ菫ｮ豁｣・・ELECT竊棚NTERNAL・・  if (stub.id === 'POWER_MOD_BY_UNDER_COUNT') {
    const toHWPMUC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMUC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMUC = srcPMUC ? (srcPMUC.EffectText ?? '') + ' ' + (srcPMUC.BurstText ?? '') : '';
    const mPMUC = txtPMUC.match(/荳九↓縺ゅｋ繧ｫ繝ｼ繝・[・・・兔d]*)譫・縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (!mPMUC) return done(addLog(ctx, '隗｣譫仙､ｱ謨暦ｼ・OWER_MOD_BY_UNDER_COUNT・・));
    const maxMPMUC = txtPMUC.match(/繧ｷ繧ｰ繝・[・・・兔d]*)菴薙∪縺ｧ/);
    const maxTargetsPMUC = maxMPMUC ? parseInt(toHWPMUC(maxMPMUC[1])) : 2;
    const oppCandsPMUC = fieldCandidates(ctx.otherState, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (oppCandsPMUC.length === 0) return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・OWER_MOD_BY_UNDER_COUNT・・));
    const noopPMUC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contPMUC: StubAction = { type: 'STUB', id: 'INTERNAL_PMBUC_APPLY' };
    return selectOrInteract(oppCandsPMUC, Math.min(maxTargetsPMUC, oppCandsPMUC.length), false, 'opp_field', noopPMUC as EffectAction, contPMUC as EffectAction, ctx);
  }
  if (stub.id === 'INTERNAL_PMBUC_APPLY') {
    const selected = ctx.lastProcessedCards ?? [];
    if (selected.length === 0) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺暦ｼ・NTERNAL_PMBUC_APPLY・・));
    const toHWUC2 = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const src2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txt2 = src2 ? (src2.EffectText ?? '') + ' ' + (src2.BurstText ?? '') : '';
    const m2 = txt2.match(/荳九↓縺ゅｋ繧ｫ繝ｼ繝・[・・・兔d]*)譫・縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    const divisorUC2 = m2 ? parseInt(toHWUC2(m2[1] || '1')) || 1 : 1;
    const deltaUC2 = m2 ? parseInt(toHWUC2(m2[2]).replace('・・, '-').replace('・・, '+')) : -3000;
    const srcZoneUC2 = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const underCntUC2 = srcZoneUC2 >= 0 ? Math.max(0, (ctx.ownerState.field.signi[srcZoneUC2]?.length ?? 1) - 1) : 0;
    const totalDeltaUC2 = Math.floor(underCntUC2 / divisorUC2) * deltaUC2;
    const modsUC2 = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of selected) modsUC2.push({ cardNum: cn, delta: totalDeltaUC2 });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsUC2 } },
      `${selected.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ')}縺ｮ繝代Ρ繝ｼ${totalDeltaUC2}・井ｸ・{underCntUC2}譫夲ｼ荏));
  }
  // 繧ｷ繧ｰ繝九だ繝ｼ繝ｳ縺ｮ繧ｫ繝ｼ繝臥ｷ乗焚ﾃ妖elta 竊・1菴鍋嶌謇九す繧ｰ繝九ヱ繝ｯ繝ｼ菫ｮ豁｣・・ELECT_TARGET竊定・蟾ｱ蜀榊ｸｰ・・  if (stub.id === 'POWER_DOWN_BY_ZONE_CARD_COUNT') {
    const toHWPDZCC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPDZCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPDZCC = srcPDZCC ? (srcPDZCC.EffectText ?? '') + ' ' + (srcPDZCC.BurstText ?? '') : '';
    const mPDZCC = txtPDZCC.match(/繧ｷ繧ｰ繝九だ繝ｼ繝ｳ縺ｫ縺ゅｋ繧ｫ繝ｼ繝・[・・・兔d]*)譫・縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    const divisorPDZCC = mPDZCC ? parseInt(toHWPDZCC(mPDZCC[1] || '1')) || 1 : 1;
    const deltaPDZCC = mPDZCC ? parseInt(toHWPDZCC(mPDZCC[2]).replace('・・, '-').replace('・・, '+')) : -2000;
    const totalCardsPDZCC = ctx.ownerState.field.signi.reduce((acc, stack) => acc + (stack?.length ?? 0), 0);
    const totalDeltaPDZCC = Math.floor(totalCardsPDZCC / divisorPDZCC) * deltaPDZCC;
    const existPDZCC = (ctx.lastProcessedCards ?? []).find(cn => ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (existPDZCC) {
      const modsPDZCC = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: existPDZCC, delta: totalDeltaPDZCC }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPDZCC } },
        `${ctx.cardMap.get(existPDZCC)?.CardName ?? existPDZCC}縺ｮ繝代Ρ繝ｼ${totalDeltaPDZCC}・医だ繝ｼ繝ｳ${totalCardsPDZCC}譫夲ｼ荏));
    }
    const oppCandsPDZCC = fieldCandidates(ctx.otherState, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (oppCandsPDZCC.length === 0) return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・OWER_DOWN_BY_ZONE_CARD_COUNT・・));
    const contPDZCC: StubAction = { type: 'STUB', id: 'POWER_DOWN_BY_ZONE_CARD_COUNT' };
    const noopPDZCC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(oppCandsPDZCC, 1, false, 'opp_field', noopPDZCC as EffectAction, contPDZCC as EffectAction, ctx);
  }
  // 繝医Λ繝・す繝･縺ｫ鄂ｮ縺九ｌ縺溘す繧ｰ繝九・繝ｬ繝吶Ν縺ｫ蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣・・菴灘ｯｾ雎｡ or 蜈ｨ菴難ｼ・  if (stub.id === 'OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL') {
    const srcPDTL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPDTL = srcPDTL ? (srcPDTL.EffectText ?? '') + ' ' + (srcPDTL.BurstText ?? '') : '';
    const toHWPDTL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const perMPDTL = txtPDTL.match(/繝医Λ繝・す繝･縺ｫ鄂ｮ縺九ｌ縺・*?繧ｷ繧ｰ繝九・繝ｬ繝吶Ν([・・・兔d]*)縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    const trashedCards = ctx.lastProcessedCards ?? [];
    const lvSumTrashedPDTL = trashedCards.reduce((acc, cn) => {
      const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0');
      return acc + (isNaN(lv) ? 0 : lv);
    }, 0);
    if (perMPDTL && lvSumTrashedPDTL > 0) {
      const divisorPDTL = parseInt(toHWPDTL(perMPDTL[1] || '1')) || 1;
      const deltaPDTL = parseInt(toHWPDTL(perMPDTL[2]).replace('・・, '-').replace('・・, '+'));
      const totalDeltaPDTL = Math.floor(lvSumTrashedPDTL / divisorPDTL) * deltaPDTL;
      if (totalDeltaPDTL !== 0) {
        // 縲悟ｯｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝具ｼ台ｽ薙ｒ蟇ｾ雎｡縺ｨ縺励阪・蝣ｴ蜷・SELECT_TARGET 縺ｧ1菴馴∈謚・        const isSingleTarget = txtPDTL.includes('蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝具ｼ台ｽ薙ｒ蟇ｾ雎｡縺ｨ縺・);
        const oppCandsPDTL = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
        if (isSingleTarget && oppCandsPDTL.length > 0) {
          // pre-calculated delta 繧・continuation stub 縺ｮ value 縺ｫ蝓九ａ霎ｼ繧・・henAction=STUB 縺ｯ applyDirectAction 縺ｧ辟｡隕悶＆繧後ｋ縺溘ａ continuation 繧剃ｽｿ逕ｨ・・          const noopPDTL: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
          const applyPDTL: StubAction = { type: 'STUB', id: 'INTERNAL_APPLY_POWER_DELTA_OPP', value: totalDeltaPDTL };
          return selectOrInteract(oppCandsPDTL, 1, false, 'opp_field', noopPDTL as EffectAction, applyPDTL as EffectAction, ctx);
        }
        // 蜈ｨ菴灘ｯｾ雎｡: 蜈ｨ繧ｷ繧ｰ繝九↓驕ｩ逕ｨ
        const modsPDTL = [...(ctx.otherState.temp_power_mods ?? [])];
        for (const cn of oppCandsPDTL) modsPDTL.push({ cardNum: cn, delta: totalDeltaPDTL });
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPDTL } },
          `繝代Ρ繝ｼ${totalDeltaPDTL > 0 ? '+' : ''}${totalDeltaPDTL}・医ヨ繝ｩ繝・す繝･貂医∩Lv蜷郁ｨ・{lvSumTrashedPDTL}・荏));
      }
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・医ヨ繝ｩ繝・す繝･繧ｷ繧ｰ繝記v蜷郁ｨ・{lvSumTrashedPDTL}・荏));
  }
  // INTERNAL_APPLY_POWER_DELTA_OPP: SELECT_TARGET蠕後↓蟇ｾ雎｡繧ｷ繧ｰ繝九∈parent delta繧帝←逕ｨ
  if (stub.id === 'INTERNAL_APPLY_POWER_DELTA_OPP') {
    const deltaIAPDO = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const targetIAPDO = ctx.lastProcessedCards ?? [];
    if (targetIAPDO.length === 0 || deltaIAPDO === 0) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣: 蟇ｾ雎｡縺ｪ縺・));
    const modsIAPDO = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of targetIAPDO) modsIAPDO.push({ cardNum: cn, delta: deltaIAPDO });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIAPDO } },
      `繝代Ρ繝ｼ${deltaIAPDO > 0 ? '+' : ''}${deltaIAPDO}`));
  }
  // 繧｢繧ｿ繝・け縺励◆繧ｷ繧ｰ繝九・繝ｬ繝吶Ν縺ｫ蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_BY_ATTACKER_LEVEL') {
    const srcPMAL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMAL = srcPMAL ? (srcPMAL.EffectText ?? '') + ' ' + (srcPMAL.BurstText ?? '') : '';
    const toHWPMAL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const attackerLvPMAL = parseInt(toHWPMAL(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Level ?? '0')) || 0;
    const perMPMAL = txtPMAL.match(/繝ｬ繝吶Ν([・・・兔d]*)縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (!perMPMAL || attackerLvPMAL === 0) return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・医い繧ｿ繝・き繝ｼLv${attackerLvPMAL}・荏));
    const divisorPMAL = parseInt(toHWPMAL(perMPMAL[1] || '1')) || 1;
    const deltaPMAL = parseInt(toHWPMAL(perMPMAL[2]).replace('・・, '-').replace('・・, '+'));
    const totalDeltaPMAL = Math.floor(attackerLvPMAL / divisorPMAL) * deltaPMAL;
    // 蟇ｾ雎｡繧ｷ繧ｰ繝九′譛ｪ驕ｸ謚槭↑繧・SELECT_TARGET 縺ｧ逶ｸ謇九す繧ｰ繝九ｒ驕ｸ縺ｶ・医Ξ繝吶Ν螂・焚/蛛ｶ謨ｰ縺ｧ繝輔ぅ繝ｫ繧ｿ・・    if (!ctx.lastProcessedCards?.length) {
      const parityMPMAL = txtPMAL.match(/繝ｬ繝吶Ν縺・螂・焚|蛛ｶ謨ｰ)縺ｮ蟇ｾ謌ｦ逶ｸ謇・);
      const parityPMAL = parityMPMAL?.[1];
      const oppCandsPMAL = ctx.otherState.field.signi.flatMap(s => {
        const top = s?.at(-1);
        if (!top) return [];
        if (parityPMAL) {
          const lv = parseInt(toHWPMAL(ctx.cardMap.get(top)?.Level ?? '0')) || 0;
          if (parityPMAL === '螂・焚' && lv % 2 === 0) return [];
          if (parityPMAL === '蛛ｶ謨ｰ' && lv % 2 === 1) return [];
        }
        return [top];
      });
      if (oppCandsPMAL.length === 0) return done(addLog(ctx, '蟇ｾ雎｡逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・OWER_MOD_BY_ATTACKER_LEVEL・・));
      const contPMAL: StubAction = { type: 'STUB', id: 'POWER_MOD_BY_ATTACKER_LEVEL' };
      return needsInteraction(addLog(ctx, '蟇ｾ雎｡繧ｷ繧ｰ繝九ｒ驕ｸ謚橸ｼ医い繧ｿ繝・き繝ｼ繝ｬ繝吶Ν縺ｫ繧医ｋ繝代Ρ繝ｼ菫ｮ豁｣・・), {
        type: 'SELECT_TARGET', candidates: oppCandsPMAL, count: 1, optional: false,
        targetScope: 'opp_field', thenAction: contPMAL as EffectAction,
      });
    }
    const modsPMAL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of ctx.lastProcessedCards) modsPMAL.push({ cardNum: cn, delta: totalDeltaPMAL });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMAL } },
      `繝代Ρ繝ｼ${totalDeltaPMAL > 0 ? '+' : ''}${totalDeltaPMAL}・医い繧ｿ繝・き繝ｼLv${attackerLvPMAL}・荏));
  }
  // 蜈ｬ髢九＠縺溘す繧ｰ繝九・繝ｬ繝吶Ν縺ｫ蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣・・astProcessedCards菴ｿ逕ｨ・・  if (stub.id === 'POWER_MOD_PER_REVEALED_LEVEL') {
    const srcPMRL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMRL = srcPMRL ? (srcPMRL.EffectText ?? '') + ' ' + (srcPMRL.BurstText ?? '') : '';
    const toHWPMRL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealedPMRL = ctx.lastProcessedCards ?? [];
    const lvSumPMRL = revealedPMRL.reduce((acc, cn) => {
      const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0');
      return acc + (isNaN(lv) ? 0 : lv);
    }, 0);
    const perMPMRL = txtPMRL.match(/繧ｷ繧ｰ繝九・繝ｬ繝吶Ν([・・・兔d]*)縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (perMPMRL) {
      const divisorPMRL = parseInt(toHWPMRL(perMPMRL[1] || '1')) || 1;
      const deltaPMRL = parseInt(toHWPMRL(perMPMRL[2]).replace('・・, '-').replace('・・, '+'));
      const totalDeltaPMRL = Math.floor(lvSumPMRL / divisorPMRL) * deltaPMRL;
      if (totalDeltaPMRL !== 0) {
        const modsPMRL = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) modsPMRL.push({ cardNum: top, delta: totalDeltaPMRL });
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMRL } },
          `繝代Ρ繝ｼ${totalDeltaPMRL > 0 ? '+' : ''}${totalDeltaPMRL}・亥・髢九す繧ｰ繝記v${lvSumPMRL}・荏));
      }
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・亥・髢九す繧ｰ繝九Ξ繝吶Ν${lvSumPMRL}・荏));
  }
  // 隍・焚縺ｮ閾ｪ繧ｷ繧ｰ繝九↓繝代Ρ繝ｼ+5000・・ELECT_TARGET竊棚NTERNAL_POWER_UP_SELECTED・・  if (stub.id === 'MULTI_SIGNI_POWER_UP_5000') {
    const srcMSPU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMSPU = srcMSPU ? (srcMSPU.EffectText ?? '') + ' ' + (srcMSPU.BurstText ?? '') : '';
    const toHWMSPU = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchMSPU = txtMSPU.match(/縺ゅ↑縺溘・[<・懊馨([^>・楪ｻ]+)[>・楪ｻ]縺ｮ繧ｷ繧ｰ繝九ｒ([・・・兔d]*)菴薙∪縺ｧ/);
    const targetClassMSPU = classMatchMSPU?.[1];
    const maxCountMSPU = parseInt(toHWMSPU(classMatchMSPU?.[2] || '2')) || 2;
    const selfCandsMSPU = ctx.ownerState.field.signi
      .map(s => s?.at(-1))
      .filter((cn): cn is string => !!cn && (!targetClassMSPU || (ctx.cardMap.get(cn)?.CardClass ?? '').includes(targetClassMSPU)));
    if (selfCandsMSPU.length === 0) return done(addLog(ctx, '閾ｪ蝣ｴ縺ｫ蟇ｾ雎｡繧ｷ繧ｰ繝九↑縺暦ｼ・ULTI_SIGNI_POWER_UP_5000・・));
    const noopMSPU: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contMSPU: StubAction = { type: 'STUB', id: 'INTERNAL_POWER_UP_SELECTED' };
    return needsInteraction(addLog(ctx, `繧ｷ繧ｰ繝九ｒ${maxCountMSPU}菴薙∪縺ｧ驕ｸ謚橸ｼ医ヱ繝ｯ繝ｼ+5000・荏), {
      type: 'SELECT_TARGET', candidates: selfCandsMSPU, count: maxCountMSPU, optional: true,
      targetScope: 'self_field', thenAction: noopMSPU as EffectAction, continuation: contMSPU as EffectAction,
    });
  }
  // MULTI_SIGNI_POWER_UP_5000 縺ｮ蠕悟・逅・ｼ夐∈謚槭＠縺溯・繧ｷ繧ｰ繝九↓繝代Ρ繝ｼ+5000
  if (stub.id === 'INTERNAL_POWER_UP_SELECTED') {
    const selectedIPU = ctx.lastProcessedCards ?? [];
    if (selectedIPU.length === 0) return done(addLog(ctx, '縺ｪ縺暦ｼ・NTERNAL_POWER_UP_SELECTED・・));
    const srcIPU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtIPU = srcIPU ? (srcIPU.EffectText ?? '') + ' ' + (srcIPU.BurstText ?? '') : '';
    const toHWIPU = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const deltaIPU = (() => {
      const m = txtIPU.match(/縺昴ｌ繧峨・繝代Ρ繝ｼ繧偵◎繧後◇繧・[・具ｼ江[・・・兔d]+)/);
      return m ? parseInt(toHWIPU(m[1]).replace('・・, '+').replace('・・, '-')) : 5000;
    })();
    const modsIPU = [...(ctx.ownerState.temp_power_mods ?? [])];
    for (const cn of selectedIPU) modsIPU.push({ cardNum: cn, delta: deltaIPU });
    const namesIPU = selectedIPU.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsIPU } },
      `${namesIPU}縺ｮ繝代Ρ繝ｼ${deltaIPU > 0 ? '+' : ''}${deltaIPU}`));
  }
  // 繝医Λ繝・す繝･縺励◆繧ｷ繧ｰ繝九・繝ｬ繝吶Νﾃ・2000 竊・1菴鍋嶌謇九す繧ｰ繝九ヱ繝ｯ繝ｼ菫ｮ豁｣・・ELECT竊棚NTERNAL・・  if (stub.id === 'POWER_MOD_BY_TRASHED_SIGNI_LEVEL') {
    const lastTrashedPMTSL = ctx.ownerState.trash.at(-1) ?? '';
    const lvPMTSL = parseInt(ctx.cardMap.get(lastTrashedPMTSL)?.Level ?? '0') || 0;
    if (lvPMTSL === 0) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣・医ヨ繝ｩ繝・す繝･繧ｷ繧ｰ繝記v0・・));
    const oppCandsPMTSL = fieldCandidates(ctx.otherState, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (oppCandsPMTSL.length === 0) return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・OWER_MOD_BY_TRASHED_SIGNI_LEVEL・・));
    const noopPMTSL: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contPMTSL: StubAction = { type: 'STUB', id: 'INTERNAL_PMBTSL_APPLY' };
    return selectOrInteract(oppCandsPMTSL, 1, false, 'opp_field', noopPMTSL as EffectAction, contPMTSL as EffectAction, ctx);
  }
  if (stub.id === 'INTERNAL_PMBTSL_APPLY') {
    const selected = ctx.lastProcessedCards ?? [];
    if (selected.length === 0) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺暦ｼ・NTERNAL_PMBTSL_APPLY・・));
    const lastTrIPMTSL = ctx.ownerState.trash.at(-1) ?? '';
    const lvIPMTSL = parseInt(ctx.cardMap.get(lastTrIPMTSL)?.Level ?? '0') || 0;
    const deltaIPMTSL = -(lvIPMTSL * 2000);
    const modsIPMTSL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of selected) modsIPMTSL.push({ cardNum: cn, delta: deltaIPMTSL });
    const nameIPMTSL = ctx.cardMap.get(lastTrIPMTSL)?.CardName ?? lastTrIPMTSL;
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIPMTSL } },
      `${selected.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ')}縺ｮ繝代Ρ繝ｼ${deltaIPMTSL}・・{nameIPMTSL} Lv${lvIPMTSL}・荏));
  }
  // 閾ｪ繧ｷ繧ｰ繝九・繝代Ρ繝ｼ縺ｮ蜊雁・縺縺大・逶ｸ謇九す繧ｰ繝九ｒ繝代Ρ繝ｼ繝槭う繝翫せ
  if (stub.id === 'ALL_OPP_SIGNI_POWER_DOWN_HALF') {
    const selfPowerAOSPDH = ctx.effectivePowers?.get(ctx.sourceCardNum ?? '')
      ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Power ?? '0', 10);
    const halfPowerAOSPDH = Math.floor(selfPowerAOSPDH / 2);
    if (halfPowerAOSPDH > 0) {
      const modsAOSPDH = [...(ctx.otherState.temp_power_mods ?? [])];
      for (let zi = 0; zi < 3; zi++) {
        const top = ctx.otherState.field.signi[zi]?.at(-1);
        if (top) modsAOSPDH.push({ cardNum: top, delta: -halfPowerAOSPDH });
      }
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsAOSPDH } },
        `蜈ｨ逶ｸ謇九す繧ｰ繝九ヱ繝ｯ繝ｼ-${halfPowerAOSPDH}・郁・繝代Ρ繝ｼ${selfPowerAOSPDH}縺ｮ蜊雁・・荏));
    }
    return done(addLog(ctx, '蜈ｨ逶ｸ謇九す繧ｰ繝九ヱ繝ｯ繝ｼ蜊頑ｸ幢ｼ郁・繝代Ρ繝ｼ0・・));
  }
  // 繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ繧ｫ繝ｼ繝・譫夐∈繧薙〒繝医Λ繝・す繝･・・ELECT竊棚NTERNAL・・  if (stub.id === 'ENERGY_TO_TRASH') {
    const selfEnergyETT = ctx.ownerState.energy;
    if (selfEnergyETT.length === 0) return done(addLog(ctx, '繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ繧ｫ繝ｼ繝峨↑縺暦ｼ・NERGY_TO_TRASH・・));
    const noopETT: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contETT: StubAction = { type: 'STUB', id: 'INTERNAL_ENERGY_TO_TRASH' };
    return needsInteraction(addLog(ctx, '繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ繧ｫ繝ｼ繝峨ｒ驕ｸ謚橸ｼ医ヨ繝ｩ繝・す繝･縺ｸ・・), {
      type: 'SELECT_TARGET', candidates: selfEnergyETT, count: 1, optional: false,
      targetScope: 'self_energy', thenAction: noopETT as EffectAction, continuation: contETT as EffectAction,
    });
  }
  // ENERGY_TO_TRASH 縺ｮ蠕悟・逅・ｼ夐∈謚槭＠縺溘お繝翫き繝ｼ繝峨ｒ繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'INTERNAL_ENERGY_TO_TRASH') {
    const selectedETT = ctx.lastProcessedCards ?? [];
    if (selectedETT.length === 0) return done(addLog(ctx, '縺ｪ縺暦ｼ・NTERNAL_ENERGY_TO_TRASH・・));
    const newEnergyETT = ctx.ownerState.energy.filter(cn => !selectedETT.includes(cn));
    const newTrashETT = [...ctx.ownerState.trash, ...selectedETT];
    const newOwnerETT = { ...ctx.ownerState, energy: newEnergyETT, trash: newTrashETT };
    const nameETT = selectedETT.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
    return done(addLog({ ...ctx, ownerState: newOwnerETT }, `繧ｨ繝翫だ繝ｼ繝ｳ・・{nameETT}竊偵ヨ繝ｩ繝・す繝･`));
  }
  // 繝・ャ繧ｭ荳翫・繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九ｒ譛螟ｧ2譫夐∈繧薙〒繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ・・OOK_AND_REORDER蠕鯉ｼ・  if (stub.id === 'CLASS_SIGNI_TO_ENERGY') {
    const srcCSTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCSTE = srcCSTE ? (srcCSTE.EffectText ?? '') + ' ' + (srcCSTE.BurstText ?? '') : '';
    const toHWCSTE = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchCSTE = txtCSTE.match(/[<・懊馨([^>・槭犠+)[>・楪ｻ]縺ｮ繧ｷ繧ｰ繝・?:繧・[・・・兔d]*)譫壹∪縺ｧ|繧・[・・・兔d]*)菴薙∪縺ｧ)/);
    const targetClassCSTE = classMatchCSTE?.[1];
    const maxPickCSTE = parseInt(toHWCSTE(classMatchCSTE?.[2] ?? classMatchCSTE?.[3] ?? '2')) || 2;
    const topCardsCSTE = ctx.ownerState.deck.slice(0, 4);
    const filteredCSTE = topCardsCSTE.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== '繧ｷ繧ｰ繝・) return false;
      if (targetClassCSTE && !c.CardClass?.includes(targetClassCSTE)) return false;
      return true;
    });
    if (filteredCSTE.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ荳翫↓繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九↑縺暦ｼ・LASS_SIGNI_TO_ENERGY・・));
    const addToEnergyCSTE: AddToEnergyAction = { type: 'ADD_TO_ENERGY', owner: 'self' };
    return needsInteraction(addLog(ctx, `繝・ャ繧ｭ荳・譫壹°繧峨す繧ｰ繝九ｒ${maxPickCSTE}譫壹∪縺ｧ驕ｸ謚橸ｼ医お繝翫だ繝ｼ繝ｳ縺ｸ・荏), {
      type: 'SEARCH', visibleCards: filteredCSTE, maxPick: maxPickCSTE,
      thenAction: addToEnergyCSTE as EffectAction,
    });
  }
  // 蜈ｬ髢区椢謨ｰ・・astProcessedCards・峨↓蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_PER_REVEALED') {
    const srcPMPR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMPR = srcPMPR ? (srcPMPR.EffectText ?? '') + ' ' + (srcPMPR.BurstText ?? '') : '';
    const toHWPMPR = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealedCountPMPR = (ctx.lastProcessedCards ?? []).length;
    const perMPMPR = txtPMPR.match(/([・・・兔d]*)譫・縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (perMPMPR && revealedCountPMPR > 0) {
      const divisorPMPR = parseInt(toHWPMPR(perMPMPR[1] || '1')) || 1;
      const deltaPMPR = parseInt(toHWPMPR(perMPMPR[2]).replace('・・, '-').replace('・・, '+'));
      const totalDeltaPMPR = Math.floor(revealedCountPMPR / divisorPMPR) * deltaPMPR;
      if (totalDeltaPMPR !== 0) {
        const modsPMPR = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) modsPMPR.push({ cardNum: top, delta: totalDeltaPMPR });
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMPR } },
          `繝代Ρ繝ｼ${totalDeltaPMPR > 0 ? '+' : ''}${totalDeltaPMPR}・亥・髢・{revealedCountPMPR}譫夲ｼ荏));
      }
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・亥・髢・{revealedCountPMPR}譫夲ｼ荏));
  }
  // 閾ｪ蝣ｴ繝√Ε繝ｼ繝謨ｰ縺ｫ蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_BY_CHARM_COUNT') {
    const srcPBCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBCC = srcPBCC ? (srcPBCC.EffectText ?? '') + ' ' + (srcPBCC.BurstText ?? '') : '';
    const toHWPBCC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const charmCountPBCC = (ctx.ownerState.field.signi_charms ?? []).filter(c => c !== null && c !== undefined).length;
    const perMPBCC = txtPBCC.match(/繝√Ε繝ｼ繝([・・・兔d]*)(?:蛟弓譫・?縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (perMPBCC && charmCountPBCC > 0) {
      const divisorPBCC = parseInt(toHWPBCC(perMPBCC[1] || '1')) || 1;
      const deltaPBCC = parseInt(toHWPBCC(perMPBCC[2]).replace('・・, '-').replace('・・, '+'));
      const totalDeltaPBCC = Math.floor(charmCountPBCC / divisorPBCC) * deltaPBCC;
      if (totalDeltaPBCC !== 0) {
        const targetsPBCC = ctx.lastProcessedCards ?? [];
        const modsPBCC = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPBCC.length > 0) {
          for (const cn of targetsPBCC) modsPBCC.push({ cardNum: cn, delta: totalDeltaPBCC });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPBCC.push({ cardNum: top, delta: totalDeltaPBCC });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBCC } },
          `繝代Ρ繝ｼ${totalDeltaPBCC > 0 ? '+' : ''}${totalDeltaPBCC}・医メ繝｣繝ｼ繝${charmCountPBCC}蛟具ｼ荏));
      }
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・医メ繝｣繝ｼ繝${charmCountPBCC}蛟具ｼ荏));
  }
  // 繧ｨ繝翫だ繝ｼ繝ｳ縺ｮ濶ｲ縺ｮ遞ｮ鬘樊焚縺ｫ蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_BY_ENERGY_COLOR_VARIETY') {
    const srcPBECV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBECV = srcPBECV ? (srcPBECV.EffectText ?? '') + ' ' + (srcPBECV.BurstText ?? '') : '';
    const toHWPBECV = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const energyColorSetPBECV = new Set<string>();
    for (const cn of ctx.ownerState.energy) {
      const colors = (ctx.cardMap.get(cn)?.Color ?? '').split('/').map(c => c.trim()).filter(c => c && c !== '辟｡');
      for (const col of colors) energyColorSetPBECV.add(col);
    }
    const varietyPBECV = energyColorSetPBECV.size;
    const perMPBECV = txtPBECV.match(/繧ｨ繝翫だ繝ｼ繝ｳ.*?濶ｲ縺ｮ遞ｮ鬘・[・・・兔d]*)(?:濶ｲ|縺､)?縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (perMPBECV && varietyPBECV > 0) {
      const divisorPBECV = parseInt(toHWPBECV(perMPBECV[1] || '1')) || 1;
      const deltaPBECV = parseInt(toHWPBECV(perMPBECV[2]).replace('・・, '-').replace('・・, '+'));
      const totalDeltaPBECV = Math.floor(varietyPBECV / divisorPBECV) * deltaPBECV;
      if (totalDeltaPBECV !== 0) {
        const targetsPBECV = ctx.lastProcessedCards ?? [];
        const modsPBECV = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPBECV.length > 0) {
          for (const cn of targetsPBECV) modsPBECV.push({ cardNum: cn, delta: totalDeltaPBECV });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPBECV.push({ cardNum: top, delta: totalDeltaPBECV });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBECV } },
          `繝代Ρ繝ｼ${totalDeltaPBECV > 0 ? '+' : ''}${totalDeltaPBECV}・医お繝願牡遞ｮ鬘・{varietyPBECV}・荏));
      }
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・医お繝願牡遞ｮ鬘・{varietyPBECV}・荏));
  }
  // 閾ｪ蝣ｴ繝ｩ繧､繧ｺ繧ｷ繧ｰ繝区焚縺ｫ蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣・医せ繧ｿ繝・け2譫壻ｻ･荳翫・繧ｷ繧ｰ繝具ｼ・  if (stub.id === 'POWER_BY_RISE_SIGNI_COUNT') {
    const srcPBRSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBRSC = srcPBRSC ? (srcPBRSC.EffectText ?? '') + ' ' + (srcPBRSC.BurstText ?? '') : '';
    const toHWPBRSC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const riseCountPBRSC = ctx.ownerState.field.signi.filter(s => (s?.length ?? 0) >= 2).length;
    const perMPBRSC = txtPBRSC.match(/繝ｩ繧､繧ｺ繧ｷ繧ｰ繝・[・・・兔d]*)菴・縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (perMPBRSC && riseCountPBRSC > 0) {
      const divisorPBRSC = parseInt(toHWPBRSC(perMPBRSC[1] || '1')) || 1;
      const deltaPBRSC = parseInt(toHWPBRSC(perMPBRSC[2]).replace('・・, '-').replace('・・, '+'));
      const totalDeltaPBRSC = Math.floor(riseCountPBRSC / divisorPBRSC) * deltaPBRSC;
      if (totalDeltaPBRSC !== 0) {
        const targetsPBRSC = ctx.lastProcessedCards ?? [];
        const modsPBRSC = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPBRSC.length > 0) {
          for (const cn of targetsPBRSC) modsPBRSC.push({ cardNum: cn, delta: totalDeltaPBRSC });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPBRSC.push({ cardNum: top, delta: totalDeltaPBRSC });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBRSC } },
          `繝代Ρ繝ｼ${totalDeltaPBRSC > 0 ? '+' : ''}${totalDeltaPBRSC}・医Λ繧､繧ｺ繧ｷ繧ｰ繝・{riseCountPBRSC}菴難ｼ荏));
      }
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・医Λ繧､繧ｺ繧ｷ繧ｰ繝・{riseCountPBRSC}菴難ｼ荏));
  }
  // 逶ｸ謇句酔繧ｾ繝ｼ繝ｳ・亥燕・峨す繧ｰ繝九・繝ｬ繝吶Ν縺ｫ蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_BY_FRONT_LEVEL') {
    const srcPMFLL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMFLL = srcPMFLL ? (srcPMFLL.EffectText ?? '') + ' ' + (srcPMFLL.BurstText ?? '') : '';
    const toHWPMFLL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcZoneFLL = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnFLL = srcZoneFLL >= 0 ? ctx.otherState.field.signi[srcZoneFLL]?.at(-1) : undefined;
    const frontLvFLL = parseInt(ctx.cardMap.get(frontCnFLL ?? '')?.Level ?? '0') || 0;
    const perMPMFLL = txtPMFLL.match(/蜑・*?繧ｷ繧ｰ繝九・繝ｬ繝吶Ν([・・・兔d]*)縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (perMPMFLL && frontLvFLL > 0) {
      const divisorPMFLL = parseInt(toHWPMFLL(perMPMFLL[1] || '1')) || 1;
      const deltaPMFLL = parseInt(toHWPMFLL(perMPMFLL[2]).replace('・・, '-').replace('・・, '+'));
      const totalDeltaPMFLL = Math.floor(frontLvFLL / divisorPMFLL) * deltaPMFLL;
      if (totalDeltaPMFLL !== 0 && ctx.sourceCardNum) {
        const modsFLL = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMFLL }];
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsFLL } },
          `繝代Ρ繝ｼ${totalDeltaPMFLL > 0 ? '+' : ''}${totalDeltaPMFLL}・亥燕繧ｷ繧ｰ繝記v${frontLvFLL}・荏));
      }
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・亥燕繧ｷ繧ｰ繝記v${frontLvFLL}・荏));
  }
  // 逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨・繧ｦ繧､繝ｫ繧ｹ繧ｷ繧ｰ繝九・繝ｬ繝吶Ν蜷郁ｨ医↓蝓ｺ縺･縺上ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'INFECTED_SIGNI_POWER_DOWN_BY_LEVEL') {
    const srcISPDL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtISPDL = srcISPDL ? (srcISPDL.EffectText ?? '') + ' ' + (srcISPDL.BurstText ?? '') : '';
    const toHWISPDL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const virusLvSumISPDL = [0, 1, 2].reduce((acc, zi) => {
      if ((ctx.otherState.field.signi_virus?.[zi] ?? 0) === 0) return acc;
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      return acc + (parseInt(ctx.cardMap.get(top ?? '')?.Level ?? '0') || 0);
    }, 0);
    const perMISPDL = txtISPDL.match(/繧ｦ繧､繝ｫ繧ｹ.*?繧ｷ繧ｰ繝九・繝ｬ繝吶Ν([・・・兔d]*)縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    if (perMISPDL && virusLvSumISPDL > 0) {
      const divisorISPDL = parseInt(toHWISPDL(perMISPDL[1] || '1')) || 1;
      const deltaISPDL = parseInt(toHWISPDL(perMISPDL[2]).replace('・・, '-').replace('・・, '+'));
      const totalDeltaISPDL = Math.floor(virusLvSumISPDL / divisorISPDL) * deltaISPDL;
      if (totalDeltaISPDL !== 0) {
        const modsISPDL = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) modsISPDL.push({ cardNum: top, delta: totalDeltaISPDL });
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsISPDL } },
          `繝代Ρ繝ｼ${totalDeltaISPDL > 0 ? '+' : ''}${totalDeltaISPDL}・医え繧､繝ｫ繧ｹLv蜷郁ｨ・{virusLvSumISPDL}・荏));
      }
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣・医え繧､繝ｫ繧ｹ繧ｷ繧ｰ繝記v蜷郁ｨ・{virusLvSumISPDL}・荏));
  }
  // 閾ｪ繧ｷ繧ｰ繝九ヱ繝ｯ繝ｼ縺ｮ2蛟阪ｒ蜈ｨ逶ｸ謇九す繧ｰ繝九↓繝槭う繝翫せ
  // DOUBLE_OWN_POWER_MINUS: 蟇ｾ雎｡繧ｷ繧ｰ繝九∈縺ｮ閾ｪ蛻・柑譫懊ヱ繝ｯ繝ｼ-繧・蛟阪↓縺吶ｋ・・ELECT_TARGET + 繝輔Λ繧ｰ險ｭ鄂ｮ・・  if (stub.id === 'DOUBLE_OWN_POWER_MINUS') {
    const targetDOPM = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (!targetDOPM) {
      const oppSigniDOPM = [0,1,2]
        .map(zi => ctx.otherState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn);
      if (oppSigniDOPM.length === 0) return done(addLog(ctx, '2蛟阪ヱ繝ｯ繝ｼ-・夂嶌謇九す繧ｰ繝九↑縺・));
      const noopDOPM: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contDOPM: StubAction = { type: 'STUB', id: 'DOUBLE_OWN_POWER_MINUS' };
      return needsInteraction(addLog(ctx, '縺薙・繧ｿ繝ｼ繝ｳ閾ｪ蛻・柑譫懊〒繝代Ρ繝ｼ-繧・蛟阪↓縺吶ｋ繧ｷ繧ｰ繝九ｒ驕ｸ謚・), {
        type: 'SELECT_TARGET', candidates: oppSigniDOPM, count: 1, optional: false,
        targetScope: 'opp_field', thenAction: noopDOPM as EffectAction,
        continuation: contDOPM as EffectAction,
      });
    }
    const existingDOPM = ctx.ownerState.double_power_minus_targets ?? [];
    const newOwnerDOPM = { ...ctx.ownerState, double_power_minus_targets: [...new Set([...existingDOPM, targetDOPM])] };
    return done(addLog({ ...ctx, ownerState: newOwnerDOPM },
      `${ctx.cardMap.get(targetDOPM)?.CardName ?? targetDOPM}縺ｸ縺ｮ繝代Ρ繝ｼ-繧・蛟阪↓險ｭ螳啻));
  }
  // 蜈ｨ閾ｪ繧ｷ繧ｰ繝九・繝代Ρ繝ｼ繧・蛟阪↓縺吶ｋ・育樟蝨ｨ蛟､縺ｨ蜷碁㍼繧偵ョ繝ｫ繧ｿ霑ｽ蜉・・  if (stub.id === 'POWER_DOUBLE_ALL') {
    const modsPDA = [...(ctx.ownerState.temp_power_mods ?? [])];
    let boostedPDA = 0;
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) continue;
      const curPw = ctx.effectivePowers?.get(top) ?? parseInt(ctx.cardMap.get(top)?.Power ?? '0', 10);
      modsPDA.push({ cardNum: top, delta: curPw });
      boostedPDA++;
    }
    if (boostedPDA > 0)
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPDA } },
        `蜈ｨ閾ｪ繧ｷ繧ｰ繝九・繝代Ρ繝ｼﾃ・・・{boostedPDA}菴難ｼ荏));
    return done(addLog(ctx, '閾ｪ蝣ｴ縺ｫ繧ｷ繧ｰ繝九↑縺暦ｼ・OWER_DOUBLE_ALL・・));
  }
  // COPY_TARGET_POWER: 蟇ｾ雎｡繧ｷ繧ｰ繝九・繝代Ρ繝ｼ繧定・繧ｷ繧ｰ繝九・蝓ｺ譛ｬ繝代Ρ繝ｼ縺ｫ縺吶ｋ
  if (stub.id === 'COPY_TARGET_POWER') {
    const selfCnCTP = ctx.sourceCardNum;
    const targetCnCTP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn) ||
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (!selfCnCTP) return done(addLog(ctx, '繝代Ρ繝ｼ繧ｳ繝斐・荳榊庄・郁・繧ｷ繧ｰ繝九↑縺暦ｼ・));
    if (!targetCnCTP) {
      // 繧ｿ繝ｼ繧ｲ繝・ヨ譛ｪ驕ｸ謚・竊・SELECT_TARGET 縺励※縺九ｉCOPY_TARGET_POWER繧貞・螳溯｡・      const allFieldCTP = [
        ...[0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
        ...[0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
      ].filter(cn => cn !== selfCnCTP);
      if (allFieldCTP.length === 0) return done(addLog(ctx, '繧ｳ繝斐・蟇ｾ雎｡繧ｷ繧ｰ繝九↑縺・));
      const contCTP: StubAction = { type: 'STUB', id: 'COPY_TARGET_POWER' };
      const noopCTP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      return needsInteraction(addLog(ctx, '繝代Ρ繝ｼ繧偵さ繝斐・縺吶ｋ繧ｷ繧ｰ繝九ｒ驕ｸ謚・), {
        type: 'SELECT_TARGET', candidates: allFieldCTP, count: 1, optional: false,
        targetScope: 'self_field', thenAction: noopCTP as EffectAction,
        continuation: contCTP as EffectAction,
      });
    }
    const targetPwCTP = ctx.effectivePowers?.get(targetCnCTP) ?? parseInt(ctx.cardMap.get(targetCnCTP)?.Power ?? '0', 10);
    const selfPwCTP = ctx.effectivePowers?.get(selfCnCTP) ?? parseInt(ctx.cardMap.get(selfCnCTP)?.Power ?? '0', 10);
    const deltaCTP = targetPwCTP - selfPwCTP;
    const modsCTP = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: selfCnCTP, delta: deltaCTP }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsCTP } },
      `${ctx.cardMap.get(selfCnCTP)?.CardName ?? selfCnCTP}縺ｮ繝代Ρ繝ｼ繧・{targetPwCTP}縺ｫ繧ｳ繝斐・・・{ctx.cardMap.get(targetCnCTP)?.CardName ?? targetCnCTP}縺九ｉ・荏));
  }
  // 閾ｪ繝代Ρ繝ｼ縺ｫ蜷医ｏ縺帙※逶ｸ謇九す繧ｰ繝九・繝代Ρ繝ｼ繧定ｨｭ螳・  if (stub.id === 'SET_OPP_SIGNI_POWER_BY_SELF_POWER') {
    // 蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝・菴薙・繝代Ρ繝ｼ繧定・繧ｷ繧ｰ繝九・繝代Ρ繝ｼ縺ｨ蜷後§縺縺托ｼ阪☆繧・    const selfPwSOSP = ctx.effectivePowers?.get(ctx.sourceCardNum ?? '')
      ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Power ?? '0', 10);
    const targetSOSP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetSOSP) {
      const modsSOSP = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: targetSOSP, delta: -selfPwSOSP }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsSOSP } },
        `${ctx.cardMap.get(targetSOSP)?.CardName ?? targetSOSP}縺ｮ繝代Ρ繝ｼ繧・{selfPwSOSP}縺縺第ｸ帛ｰ疏));
    }
    const oppCandsSOSP = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    if (oppCandsSOSP.length === 0) return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・ET_OPP_SIGNI_POWER_BY_SELF_POWER・・));
    const applySOSP: StubAction = { type: 'STUB', id: 'SET_OPP_SIGNI_POWER_BY_SELF_POWER' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: oppCandsSOSP, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: applySOSP as EffectAction,
    });
  }
  // 繧ｯ繝ｩ繧ｹ縺悟・繧九∪縺ｧ繝・ャ繧ｭ荳翫°繧峨ヨ繝ｩ繝・す繝･縺ｫ鄂ｮ縺・  if (stub.id === 'DECK_MILL_UNTIL_CLASS') {
    const srcDMUC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDMUC = srcDMUC ? (srcDMUC.EffectText ?? '') + ' ' + (srcDMUC.BurstText ?? '') : '';
    const classMatchDMUC = txtDMUC.match(/[<・懊馨([^>・槭犠+)[>・楪ｻ].*?(?:縺悟・繧弓縺悟・迴ｾ|縺ｮ繧ｷ繧ｰ繝九′迴ｾ繧後ｋ)縺ｾ縺ｧ/);
    const targetClassDMUC = classMatchDMUC?.[1];
    let curDMUC = ctx;
    let milledDMUC = 0;
    while (curDMUC.ownerState.deck.length > 0) {
      const topDMUC = curDMUC.ownerState.deck[0];
      const topDataDMUC = curDMUC.cardMap.get(topDMUC);
      const newDeckDMUC = curDMUC.ownerState.deck.slice(1);
      const newTrashDMUC = [...curDMUC.ownerState.trash, topDMUC];
      curDMUC = { ...curDMUC, ownerState: { ...curDMUC.ownerState, deck: newDeckDMUC, trash: newTrashDMUC } };
      milledDMUC++;
      if (!targetClassDMUC || (topDataDMUC?.Type === '繧ｷ繧ｰ繝・ && topDataDMUC.CardClass?.includes(targetClassDMUC))) break;
    }
    return done(addLog(curDMUC, `繝・ャ繧ｭ荳・{milledDMUC}譫壹ｒ繝医Λ繝・す繝･・・{targetClassDMUC ?? '繧ｯ繝ｩ繧ｹ'}縺ｾ縺ｧ蜑翫ｊ・荏));
  }
  // 螳｣險縺励◆謨ｰ縺縺代ョ繝・く荳翫°繧峨ヨ繝ｩ繝・す繝･縺ｸ
  if (stub.id === 'DECK_TOP_DECLARED_NUM_TRASH') {
    const declaredNumDTDT = ctx.ownerState.declared_guard_restrict_level ?? 1;
    const topCardsDTDT = ctx.ownerState.deck.slice(0, declaredNumDTDT);
    if (topCardsDTDT.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺暦ｼ・ECK_TOP_DECLARED_NUM_TRASH・・));
    const newOwnerDTDT = {
      ...ctx.ownerState,
      deck: ctx.ownerState.deck.slice(declaredNumDTDT),
      trash: [...ctx.ownerState.trash, ...topCardsDTDT],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerDTDT },
      `繝・ャ繧ｭ荳・{topCardsDTDT.length}譫壺・繝医Λ繝・す繝･・亥ｮ｣險謨ｰ${declaredNumDTDT}・荏));
  }
  // 閾ｪ蝣ｴ繧ｷ繧ｰ繝九・繝ｬ繝吶Ν蜷郁ｨ域椢謨ｰ繧偵ョ繝・く荳翫°繧峨ヨ繝ｩ繝・す繝･
  if (stub.id === 'TRASH_FROM_DECK_PER_SIGNI_LEVEL') {
    const lvSumTFDPSL = [0, 1, 2].reduce((acc, zi) => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      return acc + (parseInt(ctx.cardMap.get(top ?? '')?.Level ?? '0') || 0);
    }, 0);
    if (lvSumTFDPSL === 0 || ctx.ownerState.deck.length === 0)
      return done(addLog(ctx, `繝・ャ繧ｭ繝医ャ繝励ヨ繝ｩ繝・す繝･荳榊庄・・v蜷郁ｨ・{lvSumTFDPSL}・荏));
    const trashCountTFDPSL = Math.min(lvSumTFDPSL, ctx.ownerState.deck.length);
    const newOwnerTFDPSL = {
      ...ctx.ownerState,
      deck: ctx.ownerState.deck.slice(trashCountTFDPSL),
      trash: [...ctx.ownerState.trash, ...ctx.ownerState.deck.slice(0, trashCountTFDPSL)],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerTFDPSL },
      `繝・ャ繧ｭ荳・{trashCountTFDPSL}譫壺・繝医Λ繝・す繝･・医す繧ｰ繝記v蜷郁ｨ・{lvSumTFDPSL}・荏));
  }
  // 繝√Ε繝ｼ繝謨ｰ縺縺代ラ繝ｭ繝ｼ
  if (stub.id === 'DRAW_BY_CHARM_COUNT') {
    const charmCountDBCC = (ctx.ownerState.field.signi_charms ?? []).filter(c => c !== null && c !== undefined).length;
    if (charmCountDBCC === 0) return done(addLog(ctx, '繝√Ε繝ｼ繝縺ｪ縺暦ｼ・RAW_BY_CHARM_COUNT・・));
    const drawCountDBCC = Math.min(charmCountDBCC, ctx.ownerState.deck.length);
    if (drawCountDBCC === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺暦ｼ・RAW_BY_CHARM_COUNT・・));
    const newOwnerDBCC = {
      ...ctx.ownerState,
      deck: ctx.ownerState.deck.slice(drawCountDBCC),
      hand: [...ctx.ownerState.hand, ...ctx.ownerState.deck.slice(0, drawCountDBCC)],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerDBCC }, `${drawCountDBCC}譫壹ラ繝ｭ繝ｼ・医メ繝｣繝ｼ繝${charmCountDBCC}蛟具ｼ荏));
  }
  // 隍・焚濶ｲ・・濶ｲ莉･荳奇ｼ峨・逶ｸ謇九す繧ｰ繝九ｒ繝舌ル繝・す繝･
  if (stub.id === 'BANISH_MULTI_COLOR_SIGNI') {
    let curBMCS = ctx;
    let banishedBMCS = 0;
    for (let zi = 0; zi < 3; zi++) {
      const top = curBMCS.otherState.field.signi[zi]?.at(-1);
      if (!top) continue;
      const colorsBMCS = (curBMCS.cardMap.get(top)?.Color ?? '').split('/').map(c => c.trim()).filter(Boolean);
      if (colorsBMCS.length < 2) continue;
      const removedBMCS = removeFromField(top, curBMCS.otherState);
      curBMCS = { ...curBMCS, otherState: { ...removedBMCS, energy: [...removedBMCS.energy, top] } };
      banishedBMCS++;
    }
    return done(addLog(curBMCS, banishedBMCS > 0
      ? `隍・焚濶ｲ繧ｷ繧ｰ繝・{banishedBMCS}菴薙ｒ繝舌ル繝・す繝･`
      : '隍・焚濶ｲ繧ｷ繧ｰ繝九↑縺暦ｼ・ANISH_MULTI_COLOR_SIGNI・・));
  }
  // 逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨す繧ｰ繝九→繧ｨ繝翫だ繝ｼ繝ｳ繧偵☆縺ｹ縺ｦ繝医Λ繝・す繝･
  if (stub.id === 'OPP_TRASH_FIELD_SIGNI_AND_ENERGY') {
    let newOtherOTFSAE = { ...ctx.otherState };
    for (let zi = 0; zi < 3; zi++) {
      const top = newOtherOTFSAE.field.signi[zi]?.at(-1);
      if (!top) continue;
      const removedOTFSAE = removeFromField(top, newOtherOTFSAE);
      newOtherOTFSAE = { ...removedOTFSAE, trash: [...removedOTFSAE.trash, top] };
    }
    const extraTrashOTFSAE = [...newOtherOTFSAE.energy];
    newOtherOTFSAE = { ...newOtherOTFSAE, energy: [], trash: [...newOtherOTFSAE.trash, ...extraTrashOTFSAE] };
    return done(addLog({ ...ctx, otherState: newOtherOTFSAE }, '逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨す繧ｰ繝九→繧ｨ繝翫だ繝ｼ繝ｳ繧偵☆縺ｹ縺ｦ繝医Λ繝・す繝･'));
  }
  // 閾ｪ繧ｷ繧ｰ繝九ｒ繝輔ぅ繝ｼ繝ｫ繝峨°繧蛾蝣ｴ縺輔○縺ｦ繝・ャ繧ｭ荳九∈
  if (stub.id === 'LEAVE_FIELD_TO_DECK_BOTTOM') {
    const srcCnLFDB = ctx.sourceCardNum;
    if (!srcCnLFDB || !ctx.ownerState.field.signi.some(s => s?.at(-1) === srcCnLFDB))
      return done(addLog(ctx, '蟇ｾ雎｡縺後ヵ繧｣繝ｼ繝ｫ繝峨↓縺・↑縺・ｼ・EAVE_FIELD_TO_DECK_BOTTOM・・));
    const removedLFDB = removeFromField(srcCnLFDB, ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: { ...removedLFDB, deck: [...removedLFDB.deck, srcCnLFDB] } },
      `${ctx.cardMap.get(srcCnLFDB)?.CardName ?? srcCnLFDB}繧偵ョ繝・く荳九∈`));
  }
  // 繝ｫ繝ｪ繧ｰ繝繝｡繝ｼ繧ｸ辟｡蜉ｹ繝輔Λ繧ｰ繧定ｨｭ螳・  if (stub.id === 'PREVENT_LRIG_DAMAGE' || stub.id === 'PREVENT_DAMAGE_UNTIL_OPP_TURN_END'
      || stub.id === 'PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_lrig_damage: true } },
      '縺薙・繧ｿ繝ｼ繝ｳ繝ｫ繝ｪ繧ｰ繝繝｡繝ｼ繧ｸ辟｡蜉ｹ'));
  }
  // 濶ｲ譚｡莉ｶ縺ｫ繧医ｋ繝ｩ繧､繝輔ヰ繝ｼ繧ｹ繝域椛蛻ｶ・育嶌謇九↓ suppress_life_burst 繝輔Λ繧ｰ・・  if (stub.id === 'SUPPRESS_LIFEBURST_COLOR_CONDITION') {
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, suppress_life_burst: true } },
      '繝ｩ繧､繝輔ヰ繝ｼ繧ｹ繝育匱蜍墓椛蛻ｶ・郁牡譚｡莉ｶ・・));
  }
  // 逶ｸ謇九お繝翫′謖・ｮ壽焚莉･荳翫・縺ｨ縺崎ｶ・℃蛻・ｒ繝医Λ繝・す繝･
  if (stub.id === 'OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL') {
    const srcOEOTC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOEOTC = srcOEOTC ? (srcOEOTC.EffectText ?? '') + ' ' + (srcOEOTC.BurstText ?? '') : '';
    const toHWOEOTC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMOEOTC = txtOEOTC.match(/繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ繧ｫ繝ｼ繝峨′([・・・兔d]*)譫・莉･荳・);
    const maxEnaOEOTC = maxMOEOTC ? (parseInt(toHWOEOTC(maxMOEOTC[1])) || 5) : 5;
    const oppEnaCountOEOTC = ctx.otherState.energy.length;
    if (oppEnaCountOEOTC >= maxEnaOEOTC) {
      // 譚｡莉ｶ驕疲・譎ゅ・蟶ｸ縺ｫ1譫夲ｼ域怙蠕・逶ｴ霑代↓鄂ｮ縺九ｌ縺溘き繝ｼ繝会ｼ峨ｒ繝医Λ繝・す繝･
      const trashedOEOTC = ctx.otherState.energy.slice(-1);
      const newOtherOEOTC = {
        ...ctx.otherState,
        energy: ctx.otherState.energy.slice(0, -1),
        trash: [...ctx.otherState.trash, ...trashedOEOTC],
      };
      return done(addLog({ ...ctx, otherState: newOtherOEOTC },
        `逶ｸ謇九お繝・譫壺・繝医Λ繝・す繝･・・{oppEnaCountOEOTC}譫壺翁${maxEnaOEOTC}・荏));
    }
    return done(addLog(ctx, `逶ｸ謇九お繝・{oppEnaCountOEOTC}譫夲ｼ域擅莉ｶ${maxEnaOEOTC}譫壻ｻ･荳奇ｼ壽悴驕費ｼ荏));
  }
  // 繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ繧ｫ繝ｼ繝峨ｒ謇区惆縺ｸ・・ELECT竊棚NTERNAL・・  if (stub.id === 'ENERGY_TO_HAND_ON_DECK') {
    const selfEnaETHOD = ctx.ownerState.energy;
    if (selfEnaETHOD.length === 0) return done(addLog(ctx, '繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ繧ｫ繝ｼ繝峨↑縺暦ｼ・NERGY_TO_HAND_ON_DECK・・));
    const noopETHOD: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contETHOD: StubAction = { type: 'STUB', id: 'INTERNAL_ENERGY_TO_HAND' };
    return needsInteraction(addLog(ctx, '繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ繧ｫ繝ｼ繝峨ｒ驕ｸ謚橸ｼ域焔譛ｭ縺ｸ・・), {
      type: 'SELECT_TARGET', candidates: selfEnaETHOD, count: 1, optional: false,
      targetScope: 'self_energy', thenAction: noopETHOD as EffectAction, continuation: contETHOD as EffectAction,
    });
  }
  // ENERGY_TO_HAND_ON_DECK 蠕悟・逅・ｼ夐∈謚槭お繝翫ｒ謇区惆縺ｸ
  if (stub.id === 'INTERNAL_ENERGY_TO_HAND') {
    const selectedETH = ctx.lastProcessedCards ?? [];
    if (selectedETH.length === 0) return done(addLog(ctx, '縺ｪ縺暦ｼ・NTERNAL_ENERGY_TO_HAND・・));
    const newOwnerETH = {
      ...ctx.ownerState,
      energy: ctx.ownerState.energy.filter(cn => !selectedETH.includes(cn)),
      hand: [...ctx.ownerState.hand, ...selectedETH],
    };
    const nameETH = selectedETH.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
    return done(addLog({ ...ctx, ownerState: newOwnerETH }, `繧ｨ繝翫だ繝ｼ繝ｳ・・{nameETH}竊呈焔譛ｭ`));
  }
  // 繧ｳ繧､繝ｳ迯ｲ蠕・謇区惆縺九ｉ謐ｨ縺ｦ・亥・鬆ｭN譫壹ｒ閾ｪ蜍墓昏縺ｦ・・  if (stub.id === 'GAIN_COIN_AND_DISCARD') {
    const srcGCAD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGCAD = srcGCAD ? (srcGCAD.EffectText ?? '') + ' ' + (srcGCAD.BurstText ?? '') : '';
    const toHWGCAD = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const coinMGCAD = txtGCAD.match(/繧ｳ繧､繝ｳ([・・・兔d]*)(?:譫・|蛟・)繧貞ｾ励ｋ/);
    const coinCountGCAD = coinMGCAD ? (parseInt(toHWGCAD(coinMGCAD[1] || '1')) || 1) : 1;
    const discardMGCAD = txtGCAD.match(/謇区惆繧・[・・・兔d]*)譫・(?:謐ｨ縺ｦ|繝医Λ繝・す繝･)/);
    const discardCountGCAD = discardMGCAD ? (parseInt(toHWGCAD(discardMGCAD[1] || '1')) || 1) : 1;
    // 繧ｳ繧､繝ｳ莉倅ｸ・    const ctxCoinGCAD = addLog({ ...ctx, ownerState: { ...ctx.ownerState, coins: (ctx.ownerState.coins ?? 0) + coinCountGCAD } }, `繧ｳ繧､繝ｳ+${coinCountGCAD}`);
    // 謇区惆縺後↑縺代ｌ縺ｰ縺昴・縺ｾ縺ｾ邨ゆｺ・    if (ctxCoinGCAD.ownerState.hand.length === 0) return done(ctxCoinGCAD);
    // 繧､繝ｳ繧ｿ繝ｩ繧ｯ繝・ぅ繝匁昏縺ｦ・・ELECT_TARGET・・    const actualDiscardGCAD = Math.min(discardCountGCAD, ctxCoinGCAD.ownerState.hand.length);
    const discardActionGCAD: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: actualDiscardGCAD } };
    return selectOrInteract(ctxCoinGCAD.ownerState.hand, actualDiscardGCAD, false, 'self_hand', discardActionGCAD as EffectAction, undefined, ctxCoinGCAD);
  }
  // 蟇ｾ雎｡繧ｷ繧ｰ繝九→閾ｪ繧ｷ繧ｰ繝九・荳｡譁ｹ縺ｫ繝代Ρ繝ｼ菫ｮ豁｣・郁・蝣ｴ繧ｷ繧ｰ繝九ｒ蟇ｾ雎｡縺ｨ縺吶ｋ・・  if (stub.id === 'POWER_MOD_TARGET_AND_SELF') {
    const srcPMTS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMTS = srcPMTS ? (srcPMTS.EffectText ?? '') + ' ' + (srcPMTS.BurstText ?? '') : '';
    const toHWPMTS = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const paramDeltaPMTS = typeof (stub as StubAction & { delta?: number }).delta === 'number'
      ? (stub as StubAction & { delta?: number }).delta!
      : undefined;
    const deltaMPMTS = !paramDeltaPMTS ? txtPMTS.match(/([・搾ｼ犠[・・・兔d]+)/) : null;
    if (paramDeltaPMTS === undefined && !deltaMPMTS) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣・亥ｯｾ雎｡+閾ｪ・・));
    const deltaPMTS = paramDeltaPMTS !== undefined
      ? paramDeltaPMTS
      : parseInt(toHWPMTS(deltaMPMTS![1]).replace('・・, '-').replace('・・, '+'));
    // lastProcessedCards 縺瑚・蝣ｴ繧ｷ繧ｰ繝具ｼ・rigger signi: 蝣ｴ縺ｫ蜃ｺ縺溘→縺搾ｼ俄・ 閾ｪ蝣ｴ縺ｫ驕ｩ逕ｨ
    const ownTargetsPMTS = (ctx.lastProcessedCards ?? []).filter(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    let newCtxPMTS = ctx;
    if (ownTargetsPMTS.length > 0) {
      const modsOwn = [...(newCtxPMTS.ownerState.temp_power_mods ?? [])];
      for (const cn of ownTargetsPMTS) modsOwn.push({ cardNum: cn, delta: deltaPMTS });
      newCtxPMTS = { ...newCtxPMTS, ownerState: { ...newCtxPMTS.ownerState, temp_power_mods: modsOwn } };
    }
    // 閾ｪ繧ｷ繧ｰ繝具ｼ・ourceCardNum・峨↓繧ょ酔繝・Ν繧ｿ
    if (ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)) {
      const modsSelf = [...(newCtxPMTS.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPMTS }];
      newCtxPMTS = { ...newCtxPMTS, ownerState: { ...newCtxPMTS.ownerState, temp_power_mods: modsSelf } };
    }
    return done(addLog(newCtxPMTS, `蟇ｾ雎｡+閾ｪ繧ｷ繧ｰ繝九ヱ繝ｯ繝ｼ${deltaPMTS > 0 ? '+' : ''}${deltaPMTS}`));
  }
  // 閾ｪ繧ｷ繧ｰ繝九・繝代Ρ繝ｼ縺ｫ遲峨＠縺冗嶌謇九す繧ｰ繝九・繝代Ρ繝ｼ繧定ｨｭ螳・  if (stub.id === 'POWER_EQUAL_TO_SELF_POWER') {
    const selfPwPETS = ctx.effectivePowers?.get(ctx.sourceCardNum ?? '')
      ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Power ?? '0', 10);
    const targets = ctx.lastProcessedCards?.length ? ctx.lastProcessedCards
      : [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    const modsPETS = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of targets) {
      const oppPwPETS = ctx.effectivePowers?.get(cn) ?? parseInt(ctx.cardMap.get(cn)?.Power ?? '0', 10);
      if (selfPwPETS !== oppPwPETS) modsPETS.push({ cardNum: cn, delta: selfPwPETS - oppPwPETS });
    }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPETS } },
      `逶ｸ謇九す繧ｰ繝九・繝代Ρ繝ｼ繧・{selfPwPETS}縺ｫ險ｭ螳啻));
  }
  // 蜑阪・繧ｷ繧ｰ繝九・繝代Ρ繝ｼ縺ｨ遲峨＠縺剰ｨｭ螳夲ｼ郁・繧ｷ繧ｰ繝九ｒ蜑阪す繧ｰ繝九・繝代Ρ繝ｼ縺ｫ・・  if (stub.id === 'POWER_EQUALS_FRONT_SIGNI') {
    const srcZonePEFS = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnPEFS = srcZonePEFS >= 0 ? ctx.otherState.field.signi[srcZonePEFS]?.at(-1) : undefined;
    if (!frontCnPEFS || !ctx.sourceCardNum) return done(addLog(ctx, '蜑阪す繧ｰ繝九↑縺暦ｼ・OWER_EQUALS_FRONT_SIGNI・・));
    const frontPwPEFS = ctx.effectivePowers?.get(frontCnPEFS) ?? parseInt(ctx.cardMap.get(frontCnPEFS)?.Power ?? '0', 10);
    const selfPwPEFS = ctx.effectivePowers?.get(ctx.sourceCardNum) ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum)?.Power ?? '0', 10);
    const deltaPEFS = frontPwPEFS - selfPwPEFS;
    if (deltaPEFS !== 0) {
      const modsPEFS = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPEFS }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPEFS } },
        `繝代Ρ繝ｼ繧貞燕繧ｷ繧ｰ繝九・${frontPwPEFS}縺ｫ險ｭ螳啻));
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ譌｢縺ｫ${frontPwPEFS}・亥燕繧ｷ繧ｰ繝九→蜷悟､・荏));
  }
  // 閾ｪ繝ｻ逶ｸ謇九・繧ｷ繧ｰ繝九Ξ繝吶Ν蜷郁ｨ域ｯ碑ｼ・ｼ郁・竕ｦ逶ｸ謇九・蝣ｴ蜷茨ｼ嘉・levelSum 竊・1菴鍋嶌謇九す繧ｰ繝九ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_BY_LEVEL_SUM_COMPARE') {
    const toHWPBLSC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const selfLvSumPBLSC = [0, 1, 2].reduce((acc, zi) =>
      acc + (parseInt(ctx.cardMap.get(ctx.ownerState.field.signi[zi]?.at(-1) ?? '')?.Level ?? '0') || 0), 0);
    const oppLvSumPBLSC = [0, 1, 2].reduce((acc, zi) =>
      acc + (parseInt(ctx.cardMap.get(ctx.otherState.field.signi[zi]?.at(-1) ?? '')?.Level ?? '0') || 0), 0);
    // 譚｡莉ｶ・夊・Lv蜷郁ｨ・竕ｦ 逶ｸ謇記v蜷郁ｨ茨ｼ井ｻ･荳具ｼ・    if (selfLvSumPBLSC > oppLvSumPBLSC) {
      return done(addLog(ctx, `繝代Ρ繝ｼ菫ｮ豁｣縺ｪ縺暦ｼ・v蜷郁ｨ茨ｼ夊・${selfLvSumPBLSC}・樒嶌謇・{oppLvSumPBLSC}・荏));
    }
    const srcPBLSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBLSC = srcPBLSC ? (srcPBLSC.EffectText ?? '') + ' ' + (srcPBLSC.BurstText ?? '') : '';
    const mPBLSC = txtPBLSC.match(/([・・・兔d]+)縺ｫ縺､縺・[・搾ｼ犠[・・・兔d]+)/);
    const divisorPBLSC = mPBLSC ? parseInt(toHWPBLSC(mPBLSC[1])) || 1 : 1;
    const deltaPerPBLSC = mPBLSC ? parseInt(toHWPBLSC(mPBLSC[2]).replace('・・, '-').replace('・・, '+')) : -1000;
    const totalDeltaPBLSC = Math.floor(selfLvSumPBLSC / divisorPBLSC) * deltaPerPBLSC;
    const existPBLSC = (ctx.lastProcessedCards ?? []).find(cn => ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (existPBLSC) {
      const modsPBLSC = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: existPBLSC, delta: totalDeltaPBLSC }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBLSC } },
        `${ctx.cardMap.get(existPBLSC)?.CardName ?? existPBLSC}縺ｮ繝代Ρ繝ｼ${totalDeltaPBLSC}・・v蜷郁ｨ・{selfLvSumPBLSC}竕ｦ${oppLvSumPBLSC}・荏));
    }
    const oppCandsPBLSC = fieldCandidates(ctx.otherState, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (oppCandsPBLSC.length === 0) return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・OWER_BY_LEVEL_SUM_COMPARE・・));
    const contPBLSC: StubAction = { type: 'STUB', id: 'POWER_BY_LEVEL_SUM_COMPARE' };
    const noopPBLSC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(oppCandsPBLSC, 1, false, 'opp_field', noopPBLSC as EffectAction, contPBLSC as EffectAction, ctx);
  }
  // 謐ｨ縺ｦ縺溘す繧ｰ繝九・繝代Ρ繝ｼ縺縺題・蝣ｴ繧ｷ繧ｰ繝・菴薙ｒ繝代Ρ繝ｼ繧｢繝・・・・ELECT閾ｪ蝣ｴ竊定・蟾ｱ蜀榊ｸｰ・・  if (stub.id === 'POWER_UP_BY_DISCARDED_SIGNI_POWER') {
    const trashedCnPUBDP = ctx.ownerState.trash.at(-1) ?? '';
    const trashedPwPUBDP = parseInt(ctx.cardMap.get(trashedCnPUBDP)?.Power ?? '0') || 0;
    if (trashedPwPUBDP <= 0) return done(addLog(ctx, `繝代Ρ繝ｼ繧｢繝・・荳榊庄・医ヨ繝ｩ繝・す繝･繧ｷ繧ｰ繝九ヱ繝ｯ繝ｼ${trashedPwPUBDP}・荏));
    // 閾ｪ蝣ｴ繧ｷ繧ｰ繝九′驕ｸ謚樊ｸ医∩縺ｪ繧蛾←逕ｨ
    const fieldTargetPUBDP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (fieldTargetPUBDP) {
      const modsPUBDP = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: fieldTargetPUBDP, delta: trashedPwPUBDP }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPUBDP } },
        `${ctx.cardMap.get(fieldTargetPUBDP)?.CardName ?? fieldTargetPUBDP}縺ｮ繝代Ρ繝ｼ+${trashedPwPUBDP}・域昏縺ｦ縺溘す繧ｰ繝九・繝代Ρ繝ｼ・荏));
    }
    // SELECT 1 own field signi
    const ownCandsPUBDP = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      return top ? [top] : [];
    });
    if (ownCandsPUBDP.length === 0) return done(addLog(ctx, '閾ｪ蝣ｴ縺ｫ繧ｷ繧ｰ繝九↑縺暦ｼ・OWER_UP_BY_DISCARDED_SIGNI_POWER・・));
    const contPUBDP: StubAction = { type: 'STUB', id: 'POWER_UP_BY_DISCARDED_SIGNI_POWER' };
    const noopPUBDP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(ownCandsPUBDP, 1, false, 'self_field', noopPUBDP as EffectAction, contPUBDP as EffectAction, ctx);
  }
  // 繧ｷ繝｣繝・ヵ繝ｫ蠕後↓蜈ｨ繧ｷ繧ｰ繝九・繝代Ρ繝ｼ繧貞濠貂・  if (stub.id === 'SHUFFLE_DECK_POWER_HALF') {
    const shuffledSDP = [...ctx.ownerState.deck].sort(() => Math.random() - 0.5);
    const modsSDHP = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (!top) continue;
      const curPw = ctx.effectivePowers?.get(top) ?? parseInt(ctx.cardMap.get(top)?.Power ?? '0', 10);
      modsSDHP.push({ cardNum: top, delta: -Math.floor(curPw / 2) });
    }
    return done(addLog(
      { ...ctx, ownerState: { ...ctx.ownerState, deck: shuffledSDP }, otherState: { ...ctx.otherState, temp_power_mods: modsSDHP } },
      `繝・ャ繧ｭ繧ｷ繝｣繝・ヵ繝ｫ竊貞・逶ｸ謇九す繧ｰ繝九ヱ繝ｯ繝ｼ蜊頑ｸ嫣));
  }
  // 蜈ｬ髢九＠縺溘す繧ｰ繝九ｒ繝輔ぅ繝ｼ繝ｫ繝峨↓蜃ｺ縺励∵ｮ九ｊ繧偵ヨ繝ｩ繝・す繝･
  if (stub.id === 'REVEALED_SIGNI_TO_FIELD_REST_TRASH') {
    const revealedRSTF = ctx.lastProcessedCards ?? [];
    if (revealedRSTF.length === 0) return done(addLog(ctx, '蜈ｬ髢九き繝ｼ繝峨↑縺暦ｼ・EVEALED_SIGNI_TO_FIELD_REST_TRASH・・));
    const signiRSTF = revealedRSTF.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
    const nonSigniRSTF = revealedRSTF.filter(cn => ctx.cardMap.get(cn)?.Type !== '繧ｷ繧ｰ繝・);
    let newOwnerRSTF = ctx.ownerState;
    // 繧ｷ繧ｰ繝九ｒ繝輔ぅ繝ｼ繝ｫ繝峨∈・育ｩｺ縺阪だ繝ｼ繝ｳ縺ｸ鬆・分縺ｫ驟咲ｽｮ・・    const fieldRSTF = [...newOwnerRSTF.field.signi] as (string[] | null)[];
    for (const cn of signiRSTF) {
      const emptyZoneRSTF = fieldRSTF.findIndex(z => !z || z.length === 0);
      if (emptyZoneRSTF >= 0) {
        fieldRSTF[emptyZoneRSTF] = [cn];
        const di = newOwnerRSTF.deck.indexOf(cn);
        if (di >= 0) {
          const newDeckRSTF = [...newOwnerRSTF.deck];
          newDeckRSTF.splice(di, 1);
          newOwnerRSTF = { ...newOwnerRSTF, deck: newDeckRSTF };
        }
      } else {
        nonSigniRSTF.push(cn);
      }
    }
    newOwnerRSTF = { ...newOwnerRSTF, field: { ...newOwnerRSTF.field, signi: fieldRSTF } };
    // 谿九ｊ繧偵ヨ繝ｩ繝・す繝･縺ｸ
    for (const cn of nonSigniRSTF) {
      const di = newOwnerRSTF.deck.indexOf(cn);
      if (di >= 0) {
        const newDeckRSTF = [...newOwnerRSTF.deck];
        newDeckRSTF.splice(di, 1);
        newOwnerRSTF = { ...newOwnerRSTF, deck: newDeckRSTF, trash: [...newOwnerRSTF.trash, cn] };
      }
    }
    return done(addLog({ ...ctx, ownerState: newOwnerRSTF },
      `蜈ｬ髢九す繧ｰ繝・{signiRSTF.length}菴凪・繝輔ぅ繝ｼ繝ｫ繝峨・撼繧ｷ繧ｰ繝・{nonSigniRSTF.length}譫壺・繝医Λ繝・す繝･`));
  }
  // 逶ｸ謇九す繧ｰ繝九ｒ繝・ャ繧ｭ縺ｮN逡ｪ逶ｮ縺ｫ謖ｿ蜈･
  if (stub.id === 'OPP_SIGNI_TO_DECK_NTH') {
    const targetOSTDN = (ctx.lastProcessedCards ?? [])[0];
    if (!targetOSTDN) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺暦ｼ・PP_SIGNI_TO_DECK_NTH・・));
    const srcOSTDN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOSTDN = srcOSTDN ? (srcOSTDN.EffectText ?? '') + ' ' + (srcOSTDN.BurstText ?? '') : '';
    const toHWOSTDN = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const nthMOSTDN = txtOSTDN.match(/繝・ャ繧ｭ縺ｮ荳翫°繧・[・・・兔d]*)逡ｪ逶ｮ/);
    const nthOSTDN = nthMOSTDN ? (parseInt(toHWOSTDN(nthMOSTDN[1])) - 1) : 0;
    const removedOSTDN = removeFromField(targetOSTDN, ctx.otherState);
    const newOtherDeckOSTDN = [...removedOSTDN.deck];
    newOtherDeckOSTDN.splice(Math.max(0, nthOSTDN), 0, targetOSTDN);
    return done(addLog({ ...ctx, otherState: { ...removedOSTDN, deck: newOtherDeckOSTDN } },
      `${ctx.cardMap.get(targetOSTDN)?.CardName ?? targetOSTDN}竊堤嶌謇九ョ繝・く荳翫°繧・{nthOSTDN + 1}逡ｪ逶ｮ`));
  }
  // 逶ｸ謇九す繧ｰ繝九′騾蝣ｴ譎ゅ↓繧ｨ繝翫〒縺ｯ縺ｪ縺上ヨ繝ｩ繝・す繝･縺ｸ・医ヵ繝ｩ繧ｰ險ｭ螳夲ｼ・  if (stub.id === 'OPP_SIGNI_LEAVE_TO_TRASH') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, banish_redirect: true } },
      '逶ｸ謇九す繧ｰ繝九・繝舌ル繝・す繝･蜈遺・繝医Λ繝・す繝･縺ｫ螟画峩'));
  }
  // 逶ｸ謇九ｈ繧頑焔譛ｭ縺悟ｰ代↑縺・ｴ蜷医∫嶌謇九・謇区惆繧偵ョ繝・く荳九∈
  if (stub.id === 'OPP_HAND_TO_DECK_BOTTOM_IF_LESS_HAND') {
    const selfHandCntOHTDB = ctx.ownerState.hand.length;
    const oppHandCntOHTDB = ctx.otherState.hand.length;
    const excessOHTDB = oppHandCntOHTDB - selfHandCntOHTDB;
    if (excessOHTDB <= 0) return done(addLog(ctx, `逶ｸ謇区焔譛ｭ${oppHandCntOHTDB}譫壺王閾ｪ謇区惆${selfHandCntOHTDB}譫夲ｼ域擅莉ｶ譛ｪ驕費ｼ荏));
    // 逶ｸ謇九・雜・℃譫壽焚蛻・ｒ驕ｸ謚槭＠縺ｦ繝・ャ繧ｭ荳九∈・・譫壹↑繧芽・蜍包ｼ・    if (excessOHTDB >= oppHandCntOHTDB) {
      // 蜈ｨ謇区惆竊偵ョ繝・く荳具ｼ郁ｶ・℃縺梧焔譛ｭ譫壽焚莉･荳翫・蝣ｴ蜷茨ｼ・      const newOtherOHTDB = { ...ctx.otherState, hand: [], deck: [...ctx.otherState.deck, ...ctx.otherState.hand] };
      return done(addLog({ ...ctx, otherState: newOtherOHTDB }, `逶ｸ謇区焔譛ｭ蜈ｨ${oppHandCntOHTDB}譫壺・繝・ャ繧ｭ荳義));
    }
    return needsInteraction(addLog(ctx, `逶ｸ謇九・謇区惆繧・{excessOHTDB}譫夐∈繧薙〒繝・ャ繧ｭ荳九↓鄂ｮ縺汁), {
      type: 'SELECT_TARGET',
      candidates: ctx.otherState.hand,
      count: excessOHTDB,
      optional: false,
      targetScope: 'opp_hand',
      opponentResponds: true,
      thenAction: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction) as EffectAction,
      continuation: ({ type: 'STUB', id: 'INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N: 驕ｸ謚槭＠縺溽嶌謇区焔譛ｭ繧偵ョ繝・く荳九∈
  if (stub.id === 'INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N') {
    const selectedIOHTDBN = ctx.lastProcessedCards ?? [];
    if (selectedIOHTDBN.length === 0) return done(addLog(ctx, '繧ｹ繧ｭ繝・・'));
    const newHandIOHTDBN = ctx.otherState.hand.filter(c => !selectedIOHTDBN.includes(c));
    const newOtherIOHTDBN = { ...ctx.otherState, hand: newHandIOHTDBN, deck: [...ctx.otherState.deck, ...selectedIOHTDBN] };
    return done(addLog({ ...ctx, otherState: newOtherIOHTDBN }, `逶ｸ謇区焔譛ｭ${selectedIOHTDBN.length}譫壺・繝・ャ繧ｭ荳義));
  }
  // 繝医Λ繝・す繝･縺九ｉ3繧ｾ繝ｼ繝ｳ縺ｸ蛻・・・・astProcessedCards竊貞推繧ｾ繝ｼ繝ｳ縺ｸ・・  // TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH: 繝医Λ繝・す繝･縺九ｉ3譫夐∈繧薙〒繧ｨ繝・謇区惆/繝・ャ繧ｭ荳九↓蛻・・
  if (stub.id === 'TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH') {
    if ((ctx.lastProcessedCards?.length ?? 0) >= 3) {
      const [toEna, toHand, toDeck] = ctx.lastProcessedCards!;
      let sTZDFT = ctx.ownerState;
      sTZDFT = { ...sTZDFT, trash: sTZDFT.trash.filter(c => c !== toEna && c !== toHand && c !== toDeck) };
      sTZDFT = { ...sTZDFT, energy: [...sTZDFT.energy, toEna], hand: [...sTZDFT.hand, toHand], deck: [...sTZDFT.deck, toDeck] };
      const nameTZDFT = [toEna, toHand, toDeck].map(c => ctx.cardMap.get(c)?.CardName ?? c).join('繝ｻ');
      return done(addLog({ ...ctx, ownerState: sTZDFT },
        `${nameTZDFT}竊偵お繝・謇区惆/繝・ャ繧ｭ荳義));
    }
    if (ctx.ownerState.trash.length < 3) {
      return done(addLog(ctx, '繝医Λ繝・す繝･縺・譫壽悴貅・・RIPLE_ZONE_DISTRIBUTE_FROM_TRASH・・));
    }
    const contTZDFT: StubAction = { type: 'STUB', id: 'TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH' };
    return needsInteraction(addLog(ctx, '繝医Λ繝・す繝･縺九ｉ3譫夐∈謚橸ｼ・譫夂岼竊偵お繝翫・2譫夂岼竊呈焔譛ｭ繝ｻ3譫夂岼竊偵ョ繝・く荳具ｼ・), {
      type: 'SELECT_TARGET', candidates: ctx.ownerState.trash, count: 3, optional: false,
      targetScope: 'self_trash', thenAction: contTZDFT as EffectAction,
    });
  }
  // 閾ｪ繝ｻ逶ｸ謇九ｒ荳｡譁ｹ繧ｨ繝翫∈・医だ繝ｼ繝ｳ莠､謠帷ｳｻ・・  if (stub.id === 'TRADE_SELF_AND_OPP_TO_ENERGY') {
    const selfCnTSAOTE = ctx.sourceCardNum;
    const oppTargetTSAOTE = (ctx.lastProcessedCards ?? [])[0];
    if (!selfCnTSAOTE) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺暦ｼ・RADE_SELF_AND_OPP_TO_ENERGY・・));
    let newOwnerTSAOTE = ctx.ownerState;
    if (ctx.ownerState.field.signi.some(s => s?.at(-1) === selfCnTSAOTE)) {
      const removedTSAOTE = removeFromField(selfCnTSAOTE, newOwnerTSAOTE);
      newOwnerTSAOTE = { ...removedTSAOTE, energy: [...removedTSAOTE.energy, selfCnTSAOTE] };
    }
    let newOtherTSAOTE = ctx.otherState;
    if (oppTargetTSAOTE && ctx.otherState.field.signi.some(s => s?.at(-1) === oppTargetTSAOTE)) {
      const removedOppTSAOTE = removeFromField(oppTargetTSAOTE, newOtherTSAOTE);
      newOtherTSAOTE = { ...removedOppTSAOTE, energy: [...removedOppTSAOTE.energy, oppTargetTSAOTE] };
    }
    return done(addLog({ ...ctx, ownerState: newOwnerTSAOTE, otherState: newOtherTSAOTE },
      `閾ｪ繝ｻ逶ｸ謇九す繧ｰ繝九ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ`));
  }
  // 閾ｪ繧ｷ繧ｰ繝九ｒ繝・ャ繧ｭ繝医ャ繝励∈・医ヵ繧｣繝ｼ繝ｫ繝峨°繧蛾蝣ｴ・・  if (stub.id === 'SELF_TO_DECK_TOP') {
    const selfCnSTDT = ctx.sourceCardNum;
    if (!selfCnSTDT || !ctx.ownerState.field.signi.some(s => s?.at(-1) === selfCnSTDT))
      return done(addLog(ctx, '蟇ｾ雎｡縺後ヵ繧｣繝ｼ繝ｫ繝峨↓縺・↑縺・ｼ・ELF_TO_DECK_TOP・・));
    const removedSTDT = removeFromField(selfCnSTDT, ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: { ...removedSTDT, deck: [selfCnSTDT, ...removedSTDT.deck] } },
      `${ctx.cardMap.get(selfCnSTDT)?.CardName ?? selfCnSTDT}繧偵ョ繝・く繝医ャ繝励∈`));
  }
  // 逶ｸ謇九す繧ｰ繝九ｒ繧ｲ繝ｼ繝医ｒ騾壹§縺ｦ繝・ャ繧ｭ縺ｸ・医ヰ繧ｦ繝ｳ繧ｹ・・  if (stub.id === 'OPP_SIGNI_TO_DECK_BY_GATE') {
    const targetOSTDBG = (ctx.lastProcessedCards ?? [])[0];
    if (!targetOSTDBG) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺暦ｼ・PP_SIGNI_TO_DECK_BY_GATE・・));
    const removedOSTDBG = removeFromField(targetOSTDBG, ctx.otherState);
    const newDeckOSTDBG = [...removedOSTDBG.deck, targetOSTDBG];
    return done(addLog({ ...ctx, otherState: { ...removedOSTDBG, deck: newDeckOSTDBG } },
      `${ctx.cardMap.get(targetOSTDBG)?.CardName ?? targetOSTDBG}竊堤嶌謇九ョ繝・く荳義));
  }
  // 繝・ャ繧ｭ荳翫・繧ｷ繧ｰ繝九ｒ繝輔ぅ繝ｼ繝ｫ繝峨∈・域怙蛻昴・繧ｷ繧ｰ繝九ｒ驟咲ｽｮ・・  if (stub.id === 'LOOK_TOP_SIGNI_TO_FIELD') {
    const topNLTSTF = 3;
    const topCardsLTSTF = ctx.ownerState.deck.slice(0, topNLTSTF);
    const firstSigniLTSTF = topCardsLTSTF.find(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
    if (!firstSigniLTSTF) return done(addLog(ctx, `繝・ャ繧ｭ荳・{topNLTSTF}譫壹↓繧ｷ繧ｰ繝九↑縺輿));
    const emptyZoneLTSTF = ctx.ownerState.field.signi.findIndex(z => !z || z.length === 0);
    if (emptyZoneLTSTF < 0) return done(addLog(ctx, '遨ｺ縺阪す繧ｰ繝九だ繝ｼ繝ｳ縺ｪ縺・));
    const newDeckLTSTF = ctx.ownerState.deck.filter(cn => cn !== firstSigniLTSTF);
    const newFieldLTSTF = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newFieldLTSTF[emptyZoneLTSTF] = [firstSigniLTSTF];
    // 谿九ｊ縺ｯ繝・ャ繧ｭ荳九∈・医ヨ繝ｩ繝・す繝･縺ｸ縺ｮ繝舌Μ繧｢繝ｳ繝茨ｼ・    const restLTSTF = topCardsLTSTF.filter(cn => cn !== firstSigniLTSTF);
    const restDeckLTSTF = newDeckLTSTF.filter(cn => !restLTSTF.includes(cn));
    const finalTrashLTSTF = [...ctx.ownerState.trash, ...restLTSTF];
    return done(addLog({ ...ctx, ownerState: {
      ...ctx.ownerState, deck: restDeckLTSTF, trash: finalTrashLTSTF,
      field: { ...ctx.ownerState.field, signi: newFieldLTSTF },
    }}, `繝・ャ繧ｭ荳翫°繧・{ctx.cardMap.get(firstSigniLTSTF)?.CardName ?? firstSigniLTSTF}竊偵ヵ繧｣繝ｼ繝ｫ繝荏));
  }
  // 霑ｽ蜉繧ｿ繝ｼ繝ｳ繧堤佐蠕暦ｼ医Ο繧ｰ縺ｮ縺ｿ縲√ご繝ｼ繝繧ｨ繝ｳ繧ｸ繝ｳ螳溯｣・′蠢・ｦ・ｼ・  // GAIN_EXTRA_TURN: 霑ｽ蜉繧ｿ繝ｼ繝ｳ繝輔Λ繧ｰ繧偵そ繝・ヨ・・attleScreen蛛ｴ縺ｧ繧ｿ繝ｼ繝ｳ邨ゆｺ・凾縺ｫ霑ｽ蜉繧ｿ繝ｼ繝ｳ繧剃ｻ倅ｸ趣ｼ・  if (stub.id === 'GAIN_EXTRA_TURN') {
    const newOwnerET = { ...ctx.ownerState, extra_turn: true };
    return done(addLog({ ...ctx, ownerState: newOwnerET }, '霑ｽ蜉繧ｿ繝ｼ繝ｳ繧堤佐蠕暦ｼ域ｬ｡縺ｮ繧ｿ繝ｼ繝ｳ邨ゆｺ・ｾ後↓繧ゅ≧1繧ｿ繝ｼ繝ｳ・・));
  }
  // 繧ｬ繝ｼ繝峨い繧､繧ｳ繝ｳ莉倅ｸ趣ｼ域焔譛ｭ縺ｮ繧ｷ繧ｰ繝九↓莉倅ｸ・ 繝輔Λ繧ｰ險ｭ螳夲ｼ・  if (stub.id === 'HAND_SIGNI_HAS_GUARD_ICON') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, hand_signi_guard_enabled: true } },
      '謇区惆縺ｮ繧ｷ繧ｰ繝九☆縺ｹ縺ｦ縺ｫ繧ｬ繝ｼ繝峨い繧､繧ｳ繝ｳ莉倅ｸ・));
  }
  // 繝輔ぅ繝ｼ繝ｫ繝峨・繧ｨ繝翫す繧ｰ繝九′濶ｲ繧堤佐蠕暦ｼ医Ο繧ｰ縺ｮ縺ｿ繝ｻ繧ｹ繧ｭ繝・・・・  if (stub.id === 'FIELD_ENERGY_SIGNI_GAIN_COLOR') {
    return done(addLog(ctx, '繧ｨ繝翫だ繝ｼ繝ｳ縺ｮ繧ｷ繧ｰ繝九′濶ｲ繧堤佐蠕暦ｼ医せ繧ｭ繝・・・・));
  }
  // 逶ｸ謇九′螳｣險縺励◆濶ｲ縺ｫ蠢懊§縺ｦ繧ｨ繝翫ｒ繝医Λ繝・す繝･・育嶌謇九・螳｣險縺悟ｿ・ｦ≫・繧ｹ繧ｭ繝・・・・  // DECLARE_COLOR_COND_ENERGY_TRASH: 濶ｲ繧貞ｮ｣險縺励√お繝翫°繧牙ｮ｣險濶ｲ縺ｮ繧ｫ繝ｼ繝峨ｒ莉ｻ諢上〒繝医Λ繝・す繝･
  if (stub.id === 'DECLARE_COLOR_COND_ENERGY_TRASH' || stub.id === 'OPP_DECLARE_COLOR_COND_ENERGY_TRASH') {
    if (ctx.ownerState.energy.length === 0) return done(addLog(ctx, '繧ｨ繝翫↑縺・));
    const noopDCCET: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    const setColorDCCET = (c: string): StubAction => ({ type: 'STUB', id: 'INTERNAL_DCCE_TRASH_COLOR', value: c });
    const colorOptsDCCET = ['逋ｽ', '襍､', '髱・, '邱・, '鮟・].map(c => ({
      id: `dcce_${c}`, label: `${c}繧貞ｮ｣險縺励※繧ｨ繝翫ヨ繝ｩ繝・す繝･`, action: setColorDCCET(c) as EffectAction, available: true,
    }));
    colorOptsDCCET.push({ id: 'dcce_skip', label: '縺励↑縺・, action: noopDCCET as EffectAction, available: true });
    return needsInteraction(addLog(ctx, '濶ｲ繧貞ｮ｣險縺励※繧ｨ繝翫ヨ繝ｩ繝・す繝･縺励∪縺吶°・・), {
      type: 'CHOOSE', options: colorOptsDCCET, count: 1,
    });
  }
  // INTERNAL_DCCE_TRASH_COLOR: 螳｣險濶ｲ縺ｮ繧ｨ繝・譫壹ｒ繝医Λ繝・す繝･
  if (stub.id === 'INTERNAL_DCCE_TRASH_COLOR') {
    const colorDCCE = typeof stub.value === 'string' ? stub.value : '';
    const matchingDCCE = ctx.ownerState.energy.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Color?.includes(colorDCCE) ?? false;
    });
    if (matchingDCCE.length === 0) return done(addLog(ctx, `${colorDCCE}繧ｨ繝翫↑縺輿));
    if (matchingDCCE.length === 1) {
      const cn = matchingDCCE[0];
      const newOwnerDCCE: PlayerState = { ...ctx.ownerState, energy: ctx.ownerState.energy.filter(c => c !== cn), trash: [...ctx.ownerState.trash, cn] };
      return done(addLog({ ...ctx, ownerState: newOwnerDCCE }, `${colorDCCE}繧ｨ繝岩・繝医Λ繝・す繝･`));
    }
    return selectOrInteract(matchingDCCE, 1, false, 'self_energy',
      ({ type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 1 } } as TrashAction) as EffectAction,
      undefined, addLog(ctx, `${colorDCCE}繧ｨ繝翫ｒ1譫夐∈繧薙〒繝医Λ繝・す繝･`));
  }
  // 繧ｨ繝翫・繧ｫ繝ｼ繝峨′謖・ｮ壹Ξ繝吶Ν蜷郁ｨ医ｒ雜・∴縺溘ｉ繝医Λ繝・す繝･
  if (stub.id === 'ENERGY_BY_LEVEL_SUM_LIMIT') {
    const srcEBLSL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtEBLSL = srcEBLSL ? (srcEBLSL.EffectText ?? '') + ' ' + (srcEBLSL.BurstText ?? '') : '';
    const toHWEBLSL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxLvMEBLSL = txtEBLSL.match(/繝ｬ繝吶Ν縺ｮ蜷郁ｨ医′([・・・兔d]*)繧定ｶ・∴/);
    const maxLvEBLSL = maxLvMEBLSL ? (parseInt(toHWEBLSL(maxLvMEBLSL[1])) || 10) : 10;
    const enaLvSumEBLSL = ctx.ownerState.energy.reduce((acc, cn) => {
      return acc + (parseInt(ctx.cardMap.get(cn)?.Level ?? '0') || 0);
    }, 0);
    if (enaLvSumEBLSL > maxLvEBLSL) {
      const excessEBLSL = enaLvSumEBLSL - maxLvEBLSL;
      // 譛ｫ蟆ｾ縺九ｉ excess 蛻・ｒ繝医Λ繝・す繝･・育ｰ｡譏灘ｮ溯｣・ｼ・      const trashCountEBLSL = ctx.ownerState.energy.slice().reverse().reduce((acc, cn) => {
        if (acc.total <= 0) return acc;
        const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0') || 0;
        return { total: acc.total - lv, cns: [...acc.cns, cn] };
      }, { total: excessEBLSL, cns: [] as string[] }).cns;
      const newOwnerEBLSL = {
        ...ctx.ownerState,
        energy: ctx.ownerState.energy.filter(cn => !trashCountEBLSL.includes(cn)),
        trash: [...ctx.ownerState.trash, ...trashCountEBLSL],
      };
      return done(addLog({ ...ctx, ownerState: newOwnerEBLSL },
        `繧ｨ繝貝v蜷郁ｨ・{enaLvSumEBLSL}竊剃ｸ企剞${maxLvEBLSL}雜・∴縲・{trashCountEBLSL.length}譫壹ヨ繝ｩ繝・す繝･`));
    }
    return done(addLog(ctx, `繧ｨ繝貝v蜷郁ｨ・{enaLvSumEBLSL}・井ｸ企剞${maxLvEBLSL}莉･蜀・ｼ荏));
  }
  // 逶ｸ謇九お繝翫・繧ｫ繝ｼ繝・譫壹ｒ濶ｲ譚｡莉ｶ縺ｧ繝医Λ繝・す繝･・育嶌謇九′驕ｸ謚樞・繧ｹ繧ｭ繝・・・・  if (stub.id === 'OPP_ENERGY_COLOR_CONDITION_TRASH') {
    // 逶ｸ謇九お繝翫°繧芽牡譚｡莉ｶ縺ｫ蜷医≧繧ｫ繝ｼ繝峨ｒ1譫夊・蜍輔ヨ繝ｩ繝・す繝･・域怙蠕後・1譫夲ｼ・    const srcOECCT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOECCT = srcOECCT ? (srcOECCT.EffectText ?? '') + ' ' + (srcOECCT.BurstText ?? '') : '';
    const colorMOECCT = txtOECCT.match(/([襍､髱堤ｷ鷹ｻ堤區辟｡])縺ｮ繧ｫ繝ｼ繝・);
    const targetColorOECCT = colorMOECCT?.[1];
    const targetCardOECCT = targetColorOECCT
      ? ctx.otherState.energy.find(cn => (ctx.cardMap.get(cn)?.Color ?? '').includes(targetColorOECCT))
      : ctx.otherState.energy.at(-1);
    if (!targetCardOECCT) return done(addLog(ctx, '蟇ｾ雎｡繧ｨ繝翫き繝ｼ繝峨↑縺暦ｼ・PP_ENERGY_COLOR_CONDITION_TRASH・・));
    const newOtherOECCT = {
      ...ctx.otherState,
      energy: ctx.otherState.energy.filter(cn => cn !== targetCardOECCT),
      trash: [...ctx.otherState.trash, targetCardOECCT],
    };
    return done(addLog({ ...ctx, otherState: newOtherOECCT },
      `逶ｸ謇九お繝奇ｼ・{ctx.cardMap.get(targetCardOECCT)?.CardName ?? targetCardOECCT}竊偵ヨ繝ｩ繝・す繝･`));
  }
  // TRASHED_CARD_TO_HAND_OR_ENERGY 竊・謇区惆驕ｸ謚槫ｾ悟・逅・  if (stub.id === 'INTERNAL_TRASH_TO_HAND') {
    const targetITTH = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetITTH) return done(ctx);
    const ti = ctx.ownerState.trash.indexOf(targetITTH);
    if (ti < 0) return done(ctx);
    const newTrashITTH = [...ctx.ownerState.trash]; newTrashITTH.splice(ti, 1);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashITTH, hand: [...ctx.ownerState.hand, targetITTH] } },
      `繝医Λ繝・す繝･・・{ctx.cardMap.get(targetITTH)?.CardName ?? targetITTH}竊呈焔譛ｭ`));
  }
  // TRASHED_CARD_TO_HAND_OR_ENERGY 竊・繧ｨ繝企∈謚槫ｾ悟・逅・  if (stub.id === 'INTERNAL_TRASH_TO_ENERGY') {
    const targetITTE = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetITTE) return done(ctx);
    const ti = ctx.ownerState.trash.indexOf(targetITTE);
    if (ti < 0) return done(ctx);
    const newTrashITTE = [...ctx.ownerState.trash]; newTrashITTE.splice(ti, 1);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashITTE, energy: [...ctx.ownerState.energy, targetITTE] } },
      `繝医Λ繝・す繝･・・{ctx.cardMap.get(targetITTE)?.CardName ?? targetITTE}竊偵お繝翫だ繝ｼ繝ｳ`));
  }
  // 隍・焚繧ｷ繧ｰ繝九ｒ繧ｨ繝翫∈・・astProcessedCards or 蜈ｨ閾ｪ繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝具ｼ・  if (stub.id === 'MULTI_SIGNI_TO_ENERGY') {
    const targetsMSTE = ctx.lastProcessedCards?.length
      ? ctx.lastProcessedCards
      : [0, 1, 2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    let newOwnerMSTE = ctx.ownerState;
    let countMSTE = 0;
    for (const cn of targetsMSTE) {
      if (!newOwnerMSTE.field.signi.some(s => s?.at(-1) === cn)) continue;
      const removedMSTE = removeFromField(cn, newOwnerMSTE);
      newOwnerMSTE = { ...removedMSTE, energy: [...removedMSTE.energy, cn] };
      countMSTE++;
    }
    return done(addLog({ ...ctx, ownerState: newOwnerMSTE },
      countMSTE > 0 ? `${countMSTE}菴薙・繧ｷ繧ｰ繝九ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ` : '繧ｷ繧ｰ繝九ｒ繧ｨ繝翫∈・亥ｯｾ雎｡縺ｪ縺暦ｼ・));
  }
  // 髱槭ぎ繝ｼ繝峨・謇区惆謐ｨ縺ｦ繧偵お繝翫だ繝ｼ繝ｳ縺ｸ
  if (stub.id === 'NON_GUARD_DISCARD_TO_ENERGY') {
    const lastDiscardedNGDE = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1) ?? '';
    if (!lastDiscardedNGDE) return done(addLog(ctx, '繧ｫ繝ｼ繝峨↑縺暦ｼ・ON_GUARD_DISCARD_TO_ENERGY・・));
    const isGuardNGDE = (ctx.cardMap.get(lastDiscardedNGDE)?.Guard ?? '') !== '';
    if (!isGuardNGDE) {
      // 繝医Λ繝・す繝･縺九ｉ繧ｨ繝翫∈遘ｻ蜍・      const ti = ctx.ownerState.trash.indexOf(lastDiscardedNGDE);
      if (ti >= 0) {
        const newTrashNGDE = [...ctx.ownerState.trash]; newTrashNGDE.splice(ti, 1);
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashNGDE, energy: [...ctx.ownerState.energy, lastDiscardedNGDE] } },
          `${ctx.cardMap.get(lastDiscardedNGDE)?.CardName ?? lastDiscardedNGDE}・磯撼繧ｬ繝ｼ繝会ｼ俄・繧ｨ繝翫だ繝ｼ繝ｳ`));
      }
    }
    return done(addLog(ctx, '繧ｬ繝ｼ繝峨き繝ｼ繝会ｼ・ON_GUARD_DISCARD_TO_ENERGY・・));
  }
  // 繧ｾ繝ｼ繝ｳ縺檎ｩｺ縺・※縺・ｋ縺ｨ縺阪ヨ繝ｩ繝・す繝･・域擅莉ｶ莉倥″・・  if (stub.id === 'TRASH_IF_ZONE_OCCUPIED') {
    const emptyZoneTIZO = ctx.ownerState.field.signi.findIndex(z => !z || z.length === 0);
    if (emptyZoneTIZO < 0 && ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)) {
      const removedTIZO = removeFromField(ctx.sourceCardNum, ctx.ownerState);
      return done(addLog({ ...ctx, ownerState: { ...removedTIZO, trash: [...removedTIZO.trash, ctx.sourceCardNum] } },
        `${ctx.cardMap.get(ctx.sourceCardNum)?.CardName ?? ctx.sourceCardNum}竊偵ヨ繝ｩ繝・す繝･・医だ繝ｼ繝ｳ貅譚ｯ・荏));
    }
    return done(addLog(ctx, '繧ｾ繝ｼ繝ｳ遨ｺ縺阪≠繧奇ｼ・RASH_IF_ZONE_OCCUPIED・・));
  }
  // 譚｡莉ｶ莉倥″繝医Λ繝・す繝･竊偵お繝奇ｼ医そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ蜷肴擅莉ｶ莉倥″・・  if (stub.id === 'CONDITIONAL_TRASH_TO_ENERGY') {
    const srcCTTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCTTE = srcCTTE ? (srcCTTE.EffectText ?? '') + ' ' + (srcCTTE.BurstText ?? '') : '';
    // 縲後そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺鯉ｼ弭・槭・蝣ｴ蜷医肴擅莉ｶ繝√ぉ繝・け
    const lrigCondM = txtCTTE.match(/縺ゅ↑縺溘・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺鯉ｼ・[^・枉+)・槭・蝣ｴ蜷・);
    if (lrigCondM) {
      const reqLrigClass = lrigCondM[1];
      const centerLrig = ctx.ownerState.field.lrig.at(-1);
      const lrigCard = centerLrig ? ctx.cardMap.get(centerLrig) : undefined;
      const lrigOk = lrigCard && ((lrigCard.Story ?? '').includes(reqLrigClass) || (lrigCard.CardClass ?? '').includes(reqLrigClass) || (lrigCard.CardName ?? '').includes(reqLrigClass));
      if (!lrigOk) return done(addLog(ctx, `繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺鯉ｼ・{reqLrigClass}・槭〒縺ｪ縺・ｼ域擅莉ｶ譛ｪ驕費ｼ荏));
    }
    const targetCTTE = ctx.sourceCardNum && ctx.ownerState.trash.includes(ctx.sourceCardNum)
      ? ctx.sourceCardNum
      : (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetCTTE) return done(addLog(ctx, '繝医Λ繝・す繝･縺ｫ繧ｫ繝ｼ繝峨↑縺暦ｼ・ONDITIONAL_TRASH_TO_ENERGY・・));
    const ti = ctx.ownerState.trash.indexOf(targetCTTE);
    if (ti < 0) return done(addLog(ctx, '蟇ｾ雎｡縺後ヨ繝ｩ繝・す繝･縺ｫ縺ｪ縺・));
    const newTrashCTTE = [...ctx.ownerState.trash]; newTrashCTTE.splice(ti, 1);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashCTTE, energy: [...ctx.ownerState.energy, targetCTTE] } },
      `繝医Λ繝・す繝･・・{ctx.cardMap.get(targetCTTE)?.CardName ?? targetCTTE}竊偵お繝翫だ繝ｼ繝ｳ`));
  }
  // 繝医Λ繝・す繝･縺九ｉ繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九ｒ謇区惆縺九お繝翫∈驕ｸ謚・  if (stub.id === 'TRASH_CLASS_TO_HAND_OR_ENERGY') {
    // 繝医Λ繝・す繝･縺九ｉ繧ｯ繝ｩ繧ｹ繧ｫ繝ｼ繝峨ｒ隍・焚驕ｸ謚・竊・1譫壹∪縺ｧ謇区惆縲∵ｮ九ｊ繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ
    const srcTCTHOE2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTCTHOE2 = srcTCTHOE2 ? (srcTCTHOE2.EffectText ?? '') + ' ' + (srcTCTHOE2.BurstText ?? '') : '';
    const toHWTCTHOE2 = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMTCTHOE2 = txtTCTHOE2.match(/・・[^・枉+)・・);
    const targetClassTCTHOE2 = classMTCTHOE2?.[1];
    const countMTCTHOE2 = txtTCTHOE2.match(/([・・・兔d]+)譫壹∪縺ｧ蟇ｾ雎｡/);
    const maxCountTCTHOE2 = countMTCTHOE2 ? parseInt(toHWTCTHOE2(countMTCTHOE2[1])) : 1;
    const candsTCTHOE2 = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return (!targetClassTCTHOE2 || (c?.CardClass ?? '').includes(targetClassTCTHOE2));
    });
    if (candsTCTHOE2.length === 0) return done(addLog(ctx, '繝医Λ繝・す繝･縺ｫ蟇ｾ雎｡縺ｪ縺暦ｼ・RASH_CLASS_TO_HAND_OR_ENERGY・・));
    const contTCTHOE2: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CLASS_SPLIT' };
    return needsInteraction(addLog(ctx, `繝医Λ繝・す繝･縺九ｉ${targetClassTCTHOE2 ?? '繧ｫ繝ｼ繝・}繧・{maxCountTCTHOE2}譫壹∪縺ｧ驕ｸ謚杼), {
      type: 'SELECT_TARGET', candidates: candsTCTHOE2, count: maxCountTCTHOE2, optional: false,
      targetScope: 'self_trash', thenAction: contTCTHOE2 as EffectAction,
    });
  }
  // INTERNAL_TRASH_CLASS_SPLIT: 驕ｸ謚槭き繝ｼ繝峨ｒ謇区惆・・譫夲ｼ会ｼ九お繝奇ｼ域ｮ九ｊ・峨↓謖ｯ繧雁・縺・  if (stub.id === 'INTERNAL_TRASH_CLASS_SPLIT') {
    const selectedITCS = ctx.lastProcessedCards ?? [];
    if (selectedITCS.length === 0) return done(ctx);
    let newOwnerITCS = ctx.ownerState;
    const remaining = [...newOwnerITCS.trash];
    const toProcess: string[] = [];
    for (const cn of selectedITCS) {
      const idx = remaining.indexOf(cn);
      if (idx >= 0) { remaining.splice(idx, 1); toProcess.push(cn); }
    }
    newOwnerITCS = { ...newOwnerITCS, trash: remaining };
    if (toProcess.length === 0) return done(addLog({ ...ctx, ownerState: newOwnerITCS }, '蟇ｾ雎｡繧ｫ繝ｼ繝峨↑縺・));
    // 1譫夂岼竊呈焔譛ｭ縲∵ｮ九ｊ竊偵お繝翫だ繝ｼ繝ｳ
    const [handCard, ...enaCards] = toProcess;
    newOwnerITCS = {
      ...newOwnerITCS,
      hand: [...newOwnerITCS.hand, handCard],
      energy: [...newOwnerITCS.energy, ...enaCards],
    };
    const names = [
      `${ctx.cardMap.get(handCard)?.CardName ?? handCard}竊呈焔譛ｭ`,
      ...enaCards.map(cn => `${ctx.cardMap.get(cn)?.CardName ?? cn}竊偵お繝柿),
    ].join('縲・);
    return done(addLog({ ...ctx, ownerState: newOwnerITCS }, names));
  }
  // 繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ繧ｫ繝ｼ繝峨ｒ霑ｽ蜉・磯撼繝ｫ繝ｪ繧ｰ繧偵Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ・・  if (stub.id === 'NON_LRIG_TO_LRIG_TRASH') {
    const target = (ctx.lastProcessedCards ?? [])[0];
    if (!target) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺暦ｼ・ON_LRIG_TO_LRIG_TRASH・・));
    // 繝輔ぅ繝ｼ繝ｫ繝峨∪縺溘・繝医Λ繝・す繝･縺九ｉ髯､蜴ｻ縺励※繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ
    let newOwnerNLTLT = ctx.ownerState;
    if (newOwnerNLTLT.field.signi.some(s => s?.at(-1) === target)) {
      newOwnerNLTLT = removeFromField(target, newOwnerNLTLT);
    } else {
      const ti = newOwnerNLTLT.trash.indexOf(target);
      if (ti >= 0) { const t = [...newOwnerNLTLT.trash]; t.splice(ti, 1); newOwnerNLTLT = { ...newOwnerNLTLT, trash: t }; }
    }
    newOwnerNLTLT = { ...newOwnerNLTLT, lrig_trash: [...newOwnerNLTLT.lrig_trash, target] };
    return done(addLog({ ...ctx, ownerState: newOwnerNLTLT },
      `${ctx.cardMap.get(target)?.CardName ?? target}竊偵Ν繝ｪ繧ｰ繝医Λ繝・す繝･`));
  }
  // 繝輔ぅ繝ｼ繝ｫ繝峨・蜈ｨ繧ｷ繧ｰ繝九・蜷榊燕縺御ｸ閾ｴ縺吶ｋ繧ｫ繝ｼ繝峨ｒ繧ｨ繝翫・繝輔ぅ繝ｼ繝ｫ繝峨°繧峨ヨ繝ｩ繝・す繝･
  if (stub.id === 'TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY') {
    const srcTABN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTABN = srcTABN ? (srcTABN.EffectText ?? '') + ' ' + (srcTABN.BurstText ?? '') : '';
    const nameMTABN = txtTABN.match(/縲・[^縲江+)縲・);
    const targetNameTABN = nameMTABN?.[1];
    if (!targetNameTABN) return done(addLog(ctx, '蟇ｾ雎｡蜷咲ｧｰ縺ｪ縺暦ｼ・RASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY・・));
    let newOtherTABN = ctx.otherState;
    // 逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨°繧・    for (let zi = 0; zi < 3; zi++) {
      const top = newOtherTABN.field.signi[zi]?.at(-1);
      if (!top || (ctx.cardMap.get(top)?.CardName ?? '') !== targetNameTABN) continue;
      const removedTABN = removeFromField(top, newOtherTABN);
      newOtherTABN = { ...removedTABN, trash: [...removedTABN.trash, top] };
    }
    // 逶ｸ謇九お繝翫°繧・    const enaToTrashTABN = newOtherTABN.energy.filter(cn => (ctx.cardMap.get(cn)?.CardName ?? '') === targetNameTABN);
    newOtherTABN = {
      ...newOtherTABN,
      energy: newOtherTABN.energy.filter(cn => (ctx.cardMap.get(cn)?.CardName ?? '') !== targetNameTABN),
      trash: [...newOtherTABN.trash, ...enaToTrashTABN],
    };
    return done(addLog({ ...ctx, otherState: newOtherTABN },
      `縲・{targetNameTABN}縲阪ｒ逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨・繧ｨ繝翫°繧峨ヨ繝ｩ繝・す繝･`));
  }
  // === 繝舌ャ繝・: 繝・ャ繧ｭ/謇区惆/繧ｨ繝頑桃菴・===
  // DRAW: N譫壹ラ繝ｭ繝ｼ
  if (stub.id === 'DRAW') {
    const srcDRW = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDRW = srcDRW ? (srcDRW.EffectText ?? '') + ' ' + (srcDRW.BurstText ?? '') : '';
    const toHWDRW = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mDRW = txtDRW.match(/繧ｫ繝ｼ繝峨ｒ([・・・兔d]+)譫壼ｼ輔￥/);
    const drawCountDRW = mDRW ? parseInt(toHWDRW(mDRW[1])) : 1;
    const sDRW = ctx.ownerState;
    const canDrawDRW = Math.min(drawCountDRW, sDRW.deck.length);
    const newSDRW: PlayerState = { ...sDRW, hand: [...sDRW.hand, ...sDRW.deck.slice(0, canDrawDRW)], deck: sDRW.deck.slice(canDrawDRW) };
    return done(addLog({ ...ctx, ownerState: newSDRW }, `${drawCountDRW}譫壹ラ繝ｭ繝ｼ`));
  }
  // DRAW_DISCARD_COUNT_PLUS_N: 謐ｨ縺ｦ縺滓椢謨ｰ+N繝峨Ο繝ｼ
  if (stub.id === 'DRAW_DISCARD_COUNT_PLUS_N') {
    const toHWDDCPN = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcDDCPN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDDCPN = srcDDCPN ? (srcDDCPN.EffectText ?? '') + ' ' + (srcDDCPN.BurstText ?? '') : '';
    const mDDCPN = txtDDCPN.match(/譫壽焚縺ｫ([・・・兔d]+)繧貞刈縺医◆/);
    const plusN = mDDCPN ? parseInt(toHWDDCPN(mDDCPN[1])) : 1;
    const discardCount = ctx.lastProcessedCards?.length ?? 0;
    const drawCount = discardCount + plusN;
    const sDDCPN = ctx.ownerState;
    const canDraw = Math.min(drawCount, sDDCPN.deck.length);
    const newSDDCPN: PlayerState = { ...sDDCPN, hand: [...sDDCPN.hand, ...sDDCPN.deck.slice(0, canDraw)], deck: sDDCPN.deck.slice(canDraw) };
    return done(addLog({ ...ctx, ownerState: newSDDCPN }, `謐ｨ縺ｦ${discardCount}譫・${plusN}竊・{canDraw}譫壹ラ繝ｭ繝ｼ`));
  }
  // LOOK_TOP_N / LOOK_TOP_SORT / LOOK_TOP_COLOR_SORT / LOOK_TOP_BY_LIFE_COUNT: 繝・ャ繧ｭ荳劾譫壹ｒ遒ｺ隱阪＠縺ｦ荳ｦ縺ｹ譖ｿ縺・  if (stub.id === 'LOOK_TOP_N' || stub.id === 'LOOK_TOP_SORT' || stub.id === 'LOOK_TOP_COLOR_SORT' || stub.id === 'LOOK_TOP_BY_LIFE_COUNT') {
    const srcLTN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTN = srcLTN ? (srcLTN.EffectText ?? '') + ' ' + (srcLTN.BurstText ?? '') : '';
    const toHWLTN = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    let countLTN = 3;
    if (stub.id === 'LOOK_TOP_BY_LIFE_COUNT') {
      countLTN = ctx.ownerState.life_cloth.length;
    } else {
      const mLTN = txtLTN.match(/繝・ャ繧ｭ(?:縺ｮ荳・?(?:縺九ｉ)?([・・・兔d]+)譫・);
      if (mLTN) countLTN = parseInt(toHWLTN(mLTN[1]));
    }
    const visLTN = ctx.ownerState.deck.slice(0, Math.min(countLTN, ctx.ownerState.deck.length));
    if (visLTN.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const newSLTN: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(visLTN.length) };
    return needsInteraction(
      addLog({ ...ctx, ownerState: newSLTN }, `繝・ャ繧ｭ荳・{visLTN.length}譫壹ｒ遒ｺ隱港),
      { type: 'LOOK_AND_REORDER', cards: visLTN, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'top' },
    );
  }
  // LOOK_TOP_ONE_RETURN_REST_BOTTOM: 繝・ャ繧ｭ荳劾譫壹ｒ遒ｺ隱阪＠1譫壹ｒ繝医ャ繝励・谿九ｊ繧偵ョ繝・く荳九↓
  if (stub.id === 'LOOK_TOP_ONE_RETURN_REST_BOTTOM') {
    const srcLTORB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTORB = srcLTORB ? (srcLTORB.EffectText ?? '') + ' ' + (srcLTORB.BurstText ?? '') : '';
    const toHWLTORB = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mLTORB = txtLTORB.match(/繝・ャ繧ｭ(?:縺ｮ荳・?(?:縺九ｉ)?([・・・兔d]+)譫・);
    const countLTORB = mLTORB ? parseInt(toHWLTORB(mLTORB[1])) : 2;
    const visLTORB = ctx.ownerState.deck.slice(0, Math.min(countLTORB, ctx.ownerState.deck.length));
    if (visLTORB.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const newSLTORB: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(visLTORB.length) };
    return needsInteraction(
      addLog({ ...ctx, ownerState: newSLTORB }, `繝・ャ繧ｭ荳・{visLTORB.length}譫壹ｒ遒ｺ隱搾ｼ・譫壹ｒ繝医ャ繝励∈繝ｻ谿九ｊ縺ｯ繝・ャ繧ｭ荳九∈・荏),
      { type: 'LOOK_AND_REORDER', cards: visLTORB, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'first_top_rest_bottom' },
    );
  }
  // LOOK_TOP_SPELLS_TO_HAND: 繝・ャ繧ｭ荳劾譫壹ｒ遒ｺ隱阪＠縺ｦ繧ｹ繝壹Ν繧呈焔譛ｭ縺ｸ繝ｻ谿九ｊ繧偵ョ繝・く縺ｸ
  if (stub.id === 'LOOK_TOP_SPELLS_TO_HAND') {
    const srcLTSH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTSH = srcLTSH ? (srcLTSH.EffectText ?? '') + ' ' + (srcLTSH.BurstText ?? '') : '';
    const toHWLTSH = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mLTSH = txtLTSH.match(/繝・ャ繧ｭ(?:縺ｮ荳・?(?:縺九ｉ)?([・・・兔d]+)譫・);
    const countLTSH = mLTSH ? parseInt(toHWLTSH(mLTSH[1])) : 3;
    const sLTSH = ctx.ownerState;
    const revealedLTSH = sLTSH.deck.slice(0, Math.min(countLTSH, sLTSH.deck.length));
    const spellsLTSH = revealedLTSH.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｹ繝壹Ν');
    const restLTSH = revealedLTSH.filter(cn => ctx.cardMap.get(cn)?.Type !== '繧ｹ繝壹Ν');
    const newSLTSH: PlayerState = {
      ...sLTSH,
      deck: [...restLTSH, ...sLTSH.deck.slice(revealedLTSH.length)],
      hand: [...sLTSH.hand, ...spellsLTSH],
    };
    return done(addLog({ ...ctx, ownerState: newSLTSH },
      `繝・ャ繧ｭ荳・{revealedLTSH.length}譫夂｢ｺ隱阪√せ繝壹Ν${spellsLTSH.length}譫壹ｒ謇区惆縺ｫ`));
  }
  // LIFE_TO_HAND_OPTIONAL: 繝ｩ繧､繝輔け繝ｭ繧ｹ1譫壹ｒ謇区惆縺ｫ蜉縺医ｋ
  if (stub.id === 'LIFE_TO_HAND_OPTIONAL') {
    const sLTH = ctx.ownerState;
    if (sLTH.life_cloth.length === 0) return done(addLog(ctx, '繝ｩ繧､繝輔け繝ｭ繧ｹ縺ｪ縺・));
    const doLTH: StubAction = { type: 'STUB', id: 'INTERNAL_LIFE_TO_HAND_DO' };
    const skipLTH: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, '繝ｩ繧､繝輔け繝ｭ繧ｹ1譫壹ｒ謇区惆縺ｫ蜉縺医※繧ゅｈ縺・), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'do',   label: '繝ｩ繧､繝輔け繝ｭ繧ｹ繧呈焔譛ｭ縺ｫ蜉縺医ｋ', action: doLTH   as EffectAction, available: true },
        { id: 'skip', label: '縺昴≧縺励↑縺・,                 action: skipLTH as EffectAction, available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_LIFE_TO_HAND_DO') {
    const sLTH = ctx.ownerState;
    if (sLTH.life_cloth.length === 0) return done(addLog(ctx, '繝ｩ繧､繝輔け繝ｭ繧ｹ縺ｪ縺・));
    const topLife = sLTH.life_cloth[0];
    const newSLTH: PlayerState = { ...sLTH, life_cloth: sLTH.life_cloth.slice(1), hand: [...sLTH.hand, topLife] };
    return done(addLog({ ...ctx, ownerState: newSLTH }, '繝ｩ繧､繝輔け繝ｭ繧ｹ1譫壹ｒ謇区惆縺ｫ蜉縺医◆'));
  }
  // HAND_NONCOLORLESS_TO_ENERGY: 謇区惆縺ｮ辟｡濶ｲ莉･螟悶き繝ｼ繝峨ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ
  if (stub.id === 'HAND_NONCOLORLESS_TO_ENERGY') {
    const sHNCE = ctx.ownerState;
    const nonColorlessHNCE = sHNCE.hand.filter(cn => { const c = ctx.cardMap.get(cn)?.Color ?? ''; return c !== '' && c !== '辟｡濶ｲ'; });
    const remainHNCE = sHNCE.hand.filter(cn => { const c = ctx.cardMap.get(cn)?.Color ?? ''; return c === '' || c === '辟｡濶ｲ'; });
    const newSHNCE: PlayerState = { ...sHNCE, hand: remainHNCE, energy: [...sHNCE.energy, ...nonColorlessHNCE] };
    return done(addLog({ ...ctx, ownerState: newSHNCE }, `謇区惆縺ｮ辟｡濶ｲ莉･螟・{nonColorlessHNCE.length}譫壹ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ`));
  }
  // OPP_TRASH_TO_DECK_TOP 縺ｯ line 1211 縺ｮ handler 縺ｧ蜃ｦ逅・ｸ医∩・・ead code 蜑企勁・・  // REMOVE_OPP_MULTI_ENA / REMOVE_OPP_MULTI_ENA_ONLY: 逶ｸ謇九・隍・焚濶ｲ繧ｨ繝翫ｒ繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'REMOVE_OPP_MULTI_ENA' || stub.id === 'REMOVE_OPP_MULTI_ENA_ONLY') {
    const sROME = ctx.otherState;
    const multiColorROME = sROME.energy.filter(cn => (ctx.cardMap.get(cn)?.Color ?? '').includes('/'));
    if (multiColorROME.length === 0) return done(addLog(ctx, '逶ｸ謇九・隍・焚濶ｲ繧ｨ繝翫↑縺・));
    const newSROME: PlayerState = {
      ...sROME,
      energy: sROME.energy.filter(cn => !(ctx.cardMap.get(cn)?.Color ?? '').includes('/')),
      trash: [...sROME.trash, ...multiColorROME],
    };
    return done(addLog({ ...ctx, otherState: newSROME }, `逶ｸ謇九・隍・焚濶ｲ繧ｨ繝・{multiColorROME.length}譫壹ｒ繝医Λ繝・す繝･縺ｸ`));
  }
  // BOTH_DISCARD_BY_CENTER_LEVEL: 荳｡閠・そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ繝ｬ繝吶Ν蛻・昏縺ｦ
  if (stub.id === 'BOTH_DISCARD_BY_CENTER_LEVEL') {
    const toHWBDCL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const getLevel = (state: PlayerState) => {
      const cn = state.field.lrig.at(-1);
      return cn ? parseInt(toHWBDCL(ctx.cardMap.get(cn)?.Level ?? '0')) || 0 : 0;
    };
    // 縲悟ｴ縺ｫ縺ゅｋ譛繧るｫ倥＞繝ｬ繝吶Ν繧呈戟縺､繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ繝ｬ繝吶Ν縲・ 荳｡閠・・繝ｫ繝ｪ繧ｰ繝ｬ繝吶Ν縺ｮ譛螟ｧ蛟､
    const centerLevelBDCL = Math.max(getLevel(ctx.ownerState), getLevel(ctx.otherState));
    const selfDiscardBDCL = Math.min(centerLevelBDCL, ctx.ownerState.hand.length);
    const otherDiscardBDCL = Math.min(centerLevelBDCL, ctx.otherState.hand.length);
    const newCtxBDCL: ExecCtx = {
      ...ctx,
      ownerState: { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(selfDiscardBDCL), trash: [...ctx.ownerState.trash, ...ctx.ownerState.hand.slice(0, selfDiscardBDCL)] },
      otherState: { ...ctx.otherState, hand: ctx.otherState.hand.slice(otherDiscardBDCL), trash: [...ctx.otherState.trash, ...ctx.otherState.hand.slice(0, otherDiscardBDCL)] },
    };
    return done(addLog(newCtxBDCL, `荳｡閠・そ繝ｳ繧ｿ繝ｼ繝ｬ繝吶Ν${centerLevelBDCL}譫壹★縺､謐ｨ縺ｦ`));
  }
  // TRASH_SIGNI_UNDER_FIELD_SIGNI: 閾ｪ蛻・ヵ繧｣繝ｼ繝ｫ繝峨す繧ｰ繝倶ｸ九・繧ｫ繝ｼ繝峨ｒ繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'TRASH_SIGNI_UNDER_FIELD_SIGNI') {
    let sTSUFS = ctx.ownerState;
    const underCardsTSUFS = sTSUFS.field.signi.flatMap(stack => stack && stack.length > 1 ? stack.slice(0, -1) : []);
    const newSigniTSUFS = sTSUFS.field.signi.map(stack => !stack || stack.length <= 1 ? stack : [stack.at(-1)!]) as (string[] | null)[];
    sTSUFS = { ...sTSUFS, field: { ...sTSUFS.field, signi: newSigniTSUFS }, trash: [...sTSUFS.trash, ...underCardsTSUFS] };
    return done(addLog({ ...ctx, ownerState: sTSUFS }, `繧ｷ繧ｰ繝倶ｸ・{underCardsTSUFS.length}譫壹ｒ繝医Λ繝・す繝･縺ｸ`));
  }
  // UNDER_SIGNI_TO_ENERGY: 繧ｷ繧ｰ繝倶ｸ九き繝ｼ繝峨ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ
  // UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: 繧ｽ繝ｼ繧ｹ繧ｷ繧ｰ繝九・荳九・繧ｫ繝ｼ繝峨ｒ蟇ｾ雎｡縺ｨ縺励√お繝翫↓蜷後け繝ｩ繧ｹ縺後↑縺代ｌ縺ｰ繧ｨ繝翫∈
  if (stub.id === 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS') {
    const srcUSTENC = ctx.sourceCardNum;
    if (!srcUSTENC) return done(addLog(ctx, 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: 繧ｽ繝ｼ繧ｹ縺ｪ縺・));
    const srcZoneUSTENC = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcUSTENC);
    if (srcZoneUSTENC < 0) return done(addLog(ctx, 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: 繧ｾ繝ｼ繝ｳ荳肴・'));
    const stackUSTENC = ctx.ownerState.field.signi[srcZoneUSTENC] ?? [];
    const underUSTENC = stackUSTENC.slice(0, -1);
    if (underUSTENC.length === 0) return done(addLog(ctx, '繧ｷ繧ｰ繝九・荳九↓繧ｫ繝ｼ繝峨↑縺暦ｼ・NDER_SIGNI_TO_ENERGY_IF_NO_CLASS・・));
    // 蜷еnder繧ｫ繝ｼ繝峨↓縺､縺・※縲√お繝翫だ繝ｼ繝ｳ縺ｫ蜷後け繝ｩ繧ｹ繧呈戟縺､繧ｷ繧ｰ繝九′縺ｪ縺・ｴ蜷医お繝翫∈
    const targetCnUSTENC = underUSTENC.find(cn => {
      const cnClass = ctx.cardMap.get(cn)?.CardClass ?? '';
      if (!cnClass) return false;
      const cnClasses = cnClass.split('/').map(s => s.trim()).filter(Boolean);
      return !ctx.ownerState.energy.some(enaCn => {
        const enaClass = ctx.cardMap.get(enaCn)?.CardClass ?? '';
        return cnClasses.some(cls => enaClass.includes(cls));
      });
    });
    if (!targetCnUSTENC) return done(addLog(ctx, '繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ蜷後け繝ｩ繧ｹ縺ゅｊ・・NDER_SIGNI_TO_ENERGY_IF_NO_CLASS・・));
    const newStackUSTENC = stackUSTENC.filter(c => c !== targetCnUSTENC);
    const newSigniUSTENC = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniUSTENC[srcZoneUSTENC] = newStackUSTENC.length > 0 ? newStackUSTENC : null;
    const newOwnerUSTENC = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, signi: newSigniUSTENC },
      energy: [...ctx.ownerState.energy, targetCnUSTENC],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerUSTENC },
      `${ctx.cardMap.get(targetCnUSTENC)?.CardName ?? targetCnUSTENC}竊偵お繝翫だ繝ｼ繝ｳ・亥酔繧ｯ繝ｩ繧ｹ縺ｪ縺暦ｼ荏));
  }
  // ADD_CARD_TO_LRIG_DECK / ADD_CARD_TO_LRIG_DECK_HIDDEN: lastProcessedCards 繧偵Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ蜉縺医ｋ
  if (stub.id === 'ADD_CARD_TO_LRIG_DECK' || stub.id === 'ADD_CARD_TO_LRIG_DECK_HIDDEN') {
    const cardsACLD = ctx.lastProcessedCards?.length ? ctx.lastProcessedCards : [];
    if (cardsACLD.length > 0) {
      let sACLD = ctx.ownerState;
      for (const cn of cardsACLD) {
        sACLD = {
          ...sACLD,
          hand: sACLD.hand.filter(c => c !== cn),
          trash: sACLD.trash.filter(c => c !== cn),
          lrig_deck: [...sACLD.lrig_deck, cn],
        };
      }
      return done(addLog({ ...ctx, ownerState: sACLD }, `${cardsACLD.length}譫壹ｒ繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ蜉縺医◆`));
    }
    // lastProcessedCards 縺ｪ縺暦ｼ壹ユ繧ｭ繧ｹ繝医°繧峨翫き繝ｼ繝牙錐縲九ｒ隗｣譫舌＠縺ｦ蛟呵｣懊ｒ蜿朱寔
    const srcACLD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtACLD = srcACLD ? (srcACLD.EffectText ?? '') + ' ' + (srcACLD.BurstText ?? '') : '';
    const nameMatchesACLD = [...txtACLD.matchAll(/縲・[^縲犠+)縲・g)].map(m => m[1]);
    if (nameMatchesACLD.length === 0) return done(addLog(ctx, '[ADD_CARD_TO_LRIG_DECK: 繧ｫ繝ｼ繝牙錐隗｣譫蝉ｸ榊庄]'));
    // 蜷・き繝ｼ繝牙錐縺ｫ蟇ｾ蠢懊☆繧九う繝ｳ繧ｹ繧ｿ繝ｳ繧ｹ繧・lrig_deck 竊・deck 竊・hand 竊・lrig_trash 縺ｮ鬆・〒謗｢縺・    const findInstance = (s: PlayerState, name: string): string | undefined => {
      const fromLrigDeck = s.lrig_deck.find(cn => ctx.cardMap.get(getCardNum(cn))?.CardName === name);
      if (fromLrigDeck) return fromLrigDeck;
      const fromDeck = s.deck.find(cn => ctx.cardMap.get(cn)?.CardName === name);
      if (fromDeck) return fromDeck;
      const fromHand = s.hand.find(cn => ctx.cardMap.get(cn)?.CardName === name);
      if (fromHand) return fromHand;
      return s.lrig_trash.find(cn => ctx.cardMap.get(getCardNum(cn))?.CardName === name);
    };
    const moveToLrigDeck = (s: PlayerState, inst: string): PlayerState => ({
      ...s,
      deck: s.deck.filter(c => c !== inst),
      hand: s.hand.filter(c => c !== inst),
      trash: s.trash.filter(c => c !== inst),
      lrig_trash: s.lrig_trash.filter(c => c !== inst),
      lrig_deck: s.lrig_deck.includes(inst) ? s.lrig_deck : [...s.lrig_deck, inst],
    });
    // HIDDEN 縺九▽ 2蛟呵｣懊≠繧句ｴ蜷茨ｼ咾HOOSE 繧呈署遉ｺ
    if (stub.id === 'ADD_CARD_TO_LRIG_DECK_HIDDEN' && nameMatchesACLD.length >= 2) {
      const instA = findInstance(ctx.ownerState, nameMatchesACLD[0]);
      const instB = findInstance(ctx.ownerState, nameMatchesACLD[1]);
      const opts = [
        ...(instA ? [{ id: 'acldh_a', label: nameMatchesACLD[0], action: ({ type: 'STUB', id: 'INTERNAL_ACLDH_APPLY', value: instA } as StubAction) as EffectAction, available: true }] : []),
        ...(instB ? [{ id: 'acldh_b', label: nameMatchesACLD[1], action: ({ type: 'STUB', id: 'INTERNAL_ACLDH_APPLY', value: instB } as StubAction) as EffectAction, available: true }] : []),
      ];
      if (opts.length === 0) return done(addLog(ctx, `[ADD_CARD_TO_LRIG_DECK_HIDDEN: 蟇ｾ雎｡縺ｪ縺余`));
      if (opts.length === 1) {
        const inst = (opts[0].action as StubAction).value as string;
        return done(addLog({ ...ctx, ownerState: moveToLrigDeck(ctx.ownerState, inst) }, `陬丞髄縺阪Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｸ: ${opts[0].label}`));
      }
      return needsInteraction(addLog(ctx, `縺ｩ縺｡繧峨ｒ陬丞髄縺阪〒繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ蜉縺医∪縺吶°・歔), {
        type: 'CHOOSE', count: 1, options: opts,
      });
    }
    // ADD_CARD_TO_LRIG_DECK・磯撼HIDDEN・峨∪縺溘・1蛟呵｣懶ｼ壼・縺ｦ霑ｽ蜉
    let sACLD2 = ctx.ownerState;
    let addedACLD = 0;
    for (const name of nameMatchesACLD) {
      const inst = findInstance(sACLD2, name);
      if (inst) {
        sACLD2 = moveToLrigDeck(sACLD2, inst);
        addedACLD++;
      }
    }
    return done(addLog({ ...ctx, ownerState: sACLD2 },
      `繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ${addedACLD}譫壼刈縺医◆・・{nameMatchesACLD.join('繝ｻ')}・荏));
  }
  // INTERNAL_ACLDH_APPLY: ADD_CARD_TO_LRIG_DECK_HIDDEN 縺ｮ驕ｸ謚槫ｾ悟・逅・  if (stub.id === 'INTERNAL_ACLDH_APPLY') {
    const inst = typeof stub.value === 'string' ? stub.value : '';
    if (!inst) return done(addLog(ctx, '[INTERNAL_ACLDH_APPLY: 繧､繝ｳ繧ｹ繧ｿ繝ｳ繧ｹ縺ｪ縺余'));
    const moveToLD = (s: PlayerState, id: string): PlayerState => ({
      ...s,
      deck: s.deck.filter(c => c !== id),
      hand: s.hand.filter(c => c !== id),
      trash: s.trash.filter(c => c !== id),
      lrig_trash: s.lrig_trash.filter(c => c !== id),
      lrig_deck: s.lrig_deck.includes(id) ? s.lrig_deck : [...s.lrig_deck, id],
    });
    const name = ctx.cardMap.get(getCardNum(inst))?.CardName ?? inst;
    return done(addLog({ ...ctx, ownerState: moveToLD(ctx.ownerState, inst) }, `陬丞髄縺阪Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｸ: ${name}`));
  }
  // PREVENT_LOW_LEVEL_LRIG_DAMAGE / PREVENT_DAMAGE_FROM_OPP_EFFECTS / PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP: 繝ｫ繝ｪ繧ｰ繝繝｡繝ｼ繧ｸ辟｡蜉ｹ繝輔Λ繧ｰ
  if (stub.id === 'PREVENT_LOW_LEVEL_LRIG_DAMAGE' || stub.id === 'PREVENT_DAMAGE_FROM_OPP_EFFECTS' || stub.id === 'PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP') {
    const newSPLLD: PlayerState = { ...ctx.ownerState, prevent_lrig_damage: true };
    return done(addLog({ ...ctx, ownerState: newSPLLD }, '繝ｫ繝ｪ繧ｰ繝繝｡繝ｼ繧ｸ辟｡蜉ｹ'));
  }
  // PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN: 逶ｸ謇九・谺｡繧ｿ繝ｼ繝ｳ譛蛻昴・繝繝｡繝ｼ繧ｸ繧堤┌蜉ｹ
  if (stub.id === 'PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN') {
    const newSPFDNOT: PlayerState = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newSPFDNOT }, '谺｡縺ｮ逶ｸ謇九ち繝ｼ繝ｳ譛蛻昴・繝繝｡繝ｼ繧ｸ繧堤┌蜉ｹ'));
  }
  // === 繝舌ャ繝・: 繧｢繧ｯ繧ｻ繝ｻ繝・ャ繧ｭ繝ｻ繝代Ρ繝ｼ陬懆ｶｳ ===
  // ACCE_TO_ENERGY / PLACE_ACCE_SIGNI_TO_ENERGY: 繧｢繧ｯ繧ｻ繧ｫ繝ｼ繝峨ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ
  if (stub.id === 'ACCE_TO_ENERGY' || stub.id === 'PLACE_ACCE_SIGNI_TO_ENERGY') {
    const sATE = ctx.ownerState;
    const acceCardsATE = (sATE.field.signi_acce ?? []).filter((c): c is string => c !== null);
    if (acceCardsATE.length === 0) return done(addLog(ctx, '繧｢繧ｯ繧ｻ縺ｪ縺・));
    const newSATE: PlayerState = {
      ...sATE,
      field: { ...sATE.field, signi_acce: [null, null, null] },
      energy: [...sATE.energy, ...acceCardsATE],
    };
    return done(addLog({ ...ctx, ownerState: newSATE }, `繧｢繧ｯ繧ｻ${acceCardsATE.length}譫壹ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ`));
  }
  // ACCE_BANISH_SELF_TRASH: 繧｢繧ｯ繧ｻ繧定・蛻・・繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'ACCE_BANISH_SELF_TRASH') {
    const sABST = ctx.ownerState;
    const acceCardsABST = (sABST.field.signi_acce ?? []).filter((c): c is string => c !== null);
    if (acceCardsABST.length === 0) return done(addLog(ctx, '繧｢繧ｯ繧ｻ縺ｪ縺・));
    const newSABST: PlayerState = {
      ...sABST,
      field: { ...sABST.field, signi_acce: [null, null, null] },
      trash: [...sABST.trash, ...acceCardsABST],
    };
    return done(addLog({ ...ctx, ownerState: newSABST }, `繧｢繧ｯ繧ｻ${acceCardsABST.length}譫壹ｒ繝医Λ繝・す繝･縺ｸ`));
  }
  // FROM_TRASH_TO_CENTER_ZONE: 繝医Λ繝・す繝･縺九ｉ繧ｫ繝ｼ繝峨ｒ荳ｭ螟ｮ繧ｷ繧ｰ繝九だ繝ｼ繝ｳ・・one[1]・峨↓蜃ｺ縺・  if (stub.id === 'FROM_TRASH_TO_CENTER_ZONE') {
    const cnFTCZ = ctx.sourceCardNum
      ? ctx.ownerState.trash.find(cn => cn === ctx.sourceCardNum)
      : (ctx.lastProcessedCards?.[0] ?? ctx.ownerState.trash.at(-1));
    if (!cnFTCZ) return done(addLog(ctx, '繝医Λ繝・す繝･縺ｫ繧ｫ繝ｼ繝峨↑縺暦ｼ・ROM_TRASH_TO_CENTER_ZONE・・));
    const sFTCZ = ctx.ownerState;
    const newTrashFTCZ = sFTCZ.trash.filter(c => c !== cnFTCZ);
    const newSigniFTCZ = [...sFTCZ.field.signi] as (string[] | null)[];
    // 荳ｭ螟ｮ繧ｾ繝ｼ繝ｳ(index=1)縺ｫ驟咲ｽｮ縲よ里蟄倥す繧ｰ繝九・繝舌ル繝・す繝･縺励※繧ｨ繝翫∈
    const existingFTCZ = newSigniFTCZ[1]?.at(-1);
    const newEnergyFTCZ = existingFTCZ ? [...sFTCZ.energy, existingFTCZ] : sFTCZ.energy;
    newSigniFTCZ[1] = [cnFTCZ];
    const newOwnerFTCZ: PlayerState = {
      ...sFTCZ,
      trash: newTrashFTCZ,
      energy: newEnergyFTCZ,
      field: { ...sFTCZ.field, signi: newSigniFTCZ },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerFTCZ },
      `${ctx.cardMap.get(cnFTCZ)?.CardName ?? cnFTCZ}繧偵ヨ繝ｩ繝・す繝･縺九ｉ荳ｭ螟ｮ繧ｾ繝ｼ繝ｳ・・one2・峨↓蜃ｺ縺兪));
  }
  // VIEW_AND_DISCARD_SPELL: 謇区惆縺九ｉ繧ｹ繝壹Ν繧帝∈繧薙〒繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'INTERNAL_TRASH_CARD') {
    const cnITC = ctx.lastProcessedCards?.[0];
    if (!cnITC) return done(ctx);
    const sITC = ctx.ownerState;
    const newSITC: PlayerState = { ...sITC, hand: sITC.hand.filter(c => c !== cnITC), trash: [...sITC.trash, cnITC] };
    return done(addLog({ ...ctx, ownerState: newSITC }, `${ctx.cardMap.get(cnITC)?.CardName ?? cnITC}繧偵ヨ繝ｩ繝・す繝･縺ｸ`));
  }
  // POWER_BY_ACCE_COUNT: 繧｢繧ｯ繧ｻ謨ｰﾃ妖elta繧偵ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_BY_ACCE_COUNT') {
    const srcPBAC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBAC = srcPBAC ? (srcPBAC.EffectText ?? '') + ' ' + (srcPBAC.BurstText ?? '') : '';
    const toHWPBAC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPBAC = txtPBAC.match(/([・・・・][・・・兔d]+)/);
    if (!mPBAC) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣蛟､隗｣譫仙､ｱ謨暦ｼ・OWER_BY_ACCE_COUNT・・));
    const singleDeltaPBAC = parseInt(toHWPBAC(mPBAC[1]).replace('・・, '+').replace('・・, '-'));
    const acceCountPBAC = (ctx.ownerState.field.signi_acce ?? []).filter(c => c !== null).length;
    const totalDeltaPBAC = singleDeltaPBAC * acceCountPBAC;
    if (totalDeltaPBAC === 0) return done(addLog(ctx, '繧｢繧ｯ繧ｻ縺ｪ縺暦ｼ・OWER_BY_ACCE_COUNT・・));
    const modsPBAC = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (top) modsPBAC.push({ cardNum: top, delta: totalDeltaPBAC });
    }
    const newSOPBAC: PlayerState = { ...ctx.otherState, temp_power_mods: modsPBAC };
    return done(addLog({ ...ctx, otherState: newSOPBAC },
      `繧｢繧ｯ繧ｻ${acceCountPBAC}譫堙・{singleDeltaPBAC}竊堤嶌謇九す繧ｰ繝九ヱ繝ｯ繝ｼ${totalDeltaPBAC}`));
  }
  // POWER_BY_CENTER_LRIG_TYPE_COUNT: 繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ繧ｿ繧､繝玲焚ﾃ妖elta繧偵ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_BY_CENTER_LRIG_TYPE_COUNT') {
    const srcPCLTC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPCLTC = srcPCLTC ? (srcPCLTC.EffectText ?? '') + ' ' + (srcPCLTC.BurstText ?? '') : '';
    const toHWPCLTC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPCLTC = txtPCLTC.match(/([・・・・][・・・兔d]+)/);
    if (!mPCLTC) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣蛟､隗｣譫仙､ｱ謨暦ｼ・OWER_BY_CENTER_LRIG_TYPE_COUNT・・));
    const singleDeltaPCLTC = parseInt(toHWPCLTC(mPCLTC[1]).replace('・・, '+').replace('・・, '-'));
    const centerNumPCLTC = ctx.ownerState.field.lrig.at(-1);
    const centerCardPCLTC = centerNumPCLTC ? ctx.cardMap.get(centerNumPCLTC) : undefined;
    const typesCountPCLTC = centerCardPCLTC ? (centerCardPCLTC.Team ?? '').split('/').filter(Boolean).length : 0;
    const totalDeltaPCLTC = singleDeltaPCLTC * typesCountPCLTC;
    if (totalDeltaPCLTC === 0) return done(addLog(ctx, '繧ｿ繧､繝励↑縺暦ｼ・OWER_BY_CENTER_LRIG_TYPE_COUNT・・));
    // 閾ｪ蛻・・繧ｷ繧ｰ繝九↓驕ｩ逕ｨ
    if (ctx.sourceCardNum) {
      const modsPCLTC = [...(ctx.ownerState.temp_power_mods ?? [])];
      modsPCLTC.push({ cardNum: ctx.sourceCardNum, delta: totalDeltaPCLTC });
      const newSOPCLTC: PlayerState = { ...ctx.ownerState, temp_power_mods: modsPCLTC };
      return done(addLog({ ...ctx, ownerState: newSOPCLTC },
        `繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ繧ｿ繧､繝・{typesCountPCLTC}遞ｮﾃ・{singleDeltaPCLTC}竊偵ヱ繝ｯ繝ｼ${totalDeltaPCLTC}`));
    }
    return done(addLog(ctx, `繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ繧ｿ繧､繝・{typesCountPCLTC}遞ｮﾃ・{singleDeltaPCLTC}・亥ｯｾ雎｡縺ｪ縺暦ｼ荏));
  }
  // DRAW_AND_PUT_HAND_TO_DECK_BOTTOM: 繝峨Ο繝ｼ縺励※謇区惆1譫壹ｒ繝・ャ繧ｭ荳九↓
  if (stub.id === 'DRAW_AND_PUT_HAND_TO_DECK_BOTTOM') {
    const srcDAPHTDB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDAPHTDB = srcDAPHTDB ? (srcDAPHTDB.EffectText ?? '') + ' ' + (srcDAPHTDB.BurstText ?? '') : '';
    const toHWDAPHTDB = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mDAPHTDB = txtDAPHTDB.match(/([・・・兔d]+)譫壼ｼ輔″/);
    const drawCntDAPHTDB = mDAPHTDB ? parseInt(toHWDAPHTDB(mDAPHTDB[1])) : 1;
    let sDAPHTDB = ctx.ownerState;
    const canDrawDAPHTDB = Math.min(drawCntDAPHTDB, sDAPHTDB.deck.length);
    sDAPHTDB = { ...sDAPHTDB, hand: [...sDAPHTDB.hand, ...sDAPHTDB.deck.slice(0, canDrawDAPHTDB)], deck: sDAPHTDB.deck.slice(canDrawDAPHTDB) };
    // 謇区惆縺九ｉ繝・ャ繧ｭ荳九↓鄂ｮ縺上き繝ｼ繝峨ｒ驕ｸ謚・    if (sDAPHTDB.hand.length > 0) {
      const putCard = sDAPHTDB.hand[0]; // 蜈磯ｭ繧定・蜍暮∈謚・      sDAPHTDB = { ...sDAPHTDB, hand: sDAPHTDB.hand.slice(1), deck: [...sDAPHTDB.deck, putCard] };
    }
    return done(addLog({ ...ctx, ownerState: sDAPHTDB }, `${canDrawDAPHTDB}譫壹ラ繝ｭ繝ｼ縲∵焔譛ｭ1譫壹ｒ繝・ャ繧ｭ荳九∈`));
  }
  // LRIG_LIMIT_MODIFY (STUB迚・: 繝ｫ繝ｪ繧ｰ繝ｪ繝溘ャ繝井ｿｮ豁｣
  if (stub.id === 'LRIG_LIMIT_MODIFY') {
    const srcLLM = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLLM = srcLLM ? (srcLLM.EffectText ?? '') + ' ' + (srcLLM.BurstText ?? '') : '';
    const toHWLLM = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mLLM = txtLLM.match(/繝ｪ繝溘ャ繝医ｒ?([・・・・]?[・・・兔d]+)/);
    if (!mLLM) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝ｪ繝溘ャ繝井ｿｮ豁｣蛟､隗｣譫仙､ｱ謨・));
    const deltaLLM = parseInt(toHWLLM(mLLM[1]).replace('・・, '+').replace('・・, '-'));
    const newSLLM: PlayerState = { ...ctx.ownerState, lrig_limit_mod: (ctx.ownerState.lrig_limit_mod ?? 0) + deltaLLM };
    return done(addLog({ ...ctx, ownerState: newSLLM }, `繝ｫ繝ｪ繧ｰ繝ｪ繝溘ャ繝・{deltaLLM > 0 ? '+' : ''}${deltaLLM}`));
  }
  // LRIG_TRASH_KEY_TO_CENTER_UNDER: 繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｮ繧ｭ繝ｼ繧偵そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九↓
  if (stub.id === 'LRIG_TRASH_KEY_TO_CENTER_UNDER') {
    const sLTKCU = ctx.ownerState;
    const keyCardLTKCU = sLTKCU.lrig_trash.find(cn => ctx.cardMap.get(cn)?.Type === '繧ｭ繝ｼ');
    if (!keyCardLTKCU) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ繧ｭ繝ｼ縺ｪ縺・));
    const newLrigDeckLTKCU = [...sLTKCU.field.lrig];
    if (newLrigDeckLTKCU.length > 0) {
      newLrigDeckLTKCU.splice(newLrigDeckLTKCU.length - 1, 0, keyCardLTKCU);
    } else {
      newLrigDeckLTKCU.push(keyCardLTKCU);
    }
    const newSLTKCU: PlayerState = {
      ...sLTKCU,
      lrig_trash: sLTKCU.lrig_trash.filter(c => c !== keyCardLTKCU),
      field: { ...sLTKCU.field, lrig: newLrigDeckLTKCU },
    };
    return done(addLog({ ...ctx, ownerState: newSLTKCU },
      `${ctx.cardMap.get(keyCardLTKCU)?.CardName ?? keyCardLTKCU}繧偵そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九↓`));
  }
  // === 繝舌ャ繝・: 繝代Ρ繝ｼ陬懆ｶｳ繝ｻ繧ｦ繧｣繝ｫ繧ｹ繝ｻ譚｡莉ｶ遘ｻ蜍・===
  // POWER_CAP: 繧ｷ繧ｰ繝九・繝代Ρ繝ｼ繧誰莉･荳九↓蛻ｶ髯・  if (stub.id === 'POWER_CAP') {
    const srcPC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPC = srcPC ? (srcPC.EffectText ?? '') + ' ' + (srcPC.BurstText ?? '') : '';
    const toHWPC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPC = txtPC.match(/繝代Ρ繝ｼ縺・([・・・兔d,・珪+)莉･荳・);
    if (!mPC || !ctx.sourceCardNum) return done(addLog(ctx, '繝代Ρ繝ｼ荳企剞隗｣譫仙､ｱ謨・));
    const capPC = parseInt(toHWPC(mPC[1]).replace(/[,・珪/g, ''));
    const currentPowerPC = ctx.effectivePowers?.get(ctx.sourceCardNum) ?? 0;
    if (currentPowerPC <= capPC) return done(addLog(ctx, `繝代Ρ繝ｼ荳企剞${capPC}莉･荳九・縺溘ａ菫ｮ豁｣縺ｪ縺輿));
    const deltaPC = capPC - currentPowerPC;
    const modsPC = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPC }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPC } },
      `繝代Ρ繝ｼ荳企剞${capPC}縺ｫ蛻ｶ髯撰ｼ・{deltaPC}・荏));
  }
  // POWER_COPY_FROM_DOWNED: 繝繧ｦ繝ｳ縺励◆繧ｷ繧ｰ繝九・繝代Ρ繝ｼ繧定・繧ｷ繧ｰ繝九↓蜉邂・  if (stub.id === 'POWER_COPY_FROM_DOWNED') {
    if (!ctx.sourceCardNum) return done(ctx);
    let targetPowerPCFD = 0;
    // 蜆ｪ蜈・ lastProcessedCards[0] (襍ｷ蜍輔さ繧ｹ繝医〒繝繧ｦ繝ｳ縺励◆閾ｪ繧ｷ繧ｰ繝・
    const costDownedPCFD = ctx.lastProcessedCards?.[0];
    if (costDownedPCFD) {
      targetPowerPCFD = ctx.effectivePowers?.get(costDownedPCFD) ?? (parseInt(ctx.cardMap.get(getCardNum(costDownedPCFD))?.Power ?? '0') || 0);
    }
    // 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ: 閾ｪ繝輔ぅ繝ｼ繝ｫ繝峨・繝繧ｦ繝ｳ繧ｷ繧ｰ繝・    if (!targetPowerPCFD) {
      for (let zi = 0; zi < 3; zi++) {
        if (ctx.ownerState.field.signi_down?.[zi]) {
          const dn = ctx.ownerState.field.signi[zi]?.at(-1);
          if (dn && dn !== ctx.sourceCardNum) { targetPowerPCFD = ctx.effectivePowers?.get(dn) ?? (parseInt(ctx.cardMap.get(getCardNum(dn))?.Power ?? '0') || 0); break; }
        }
      }
    }
    if (!targetPowerPCFD) return done(addLog(ctx, '繝繧ｦ繝ｳ繧ｷ繧ｰ繝九↑縺暦ｼ・OWER_COPY_FROM_DOWNED・・));
    const modsPCFD = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: targetPowerPCFD }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPCFD } },
      `繝繧ｦ繝ｳ繧ｷ繧ｰ繝九ヱ繝ｯ繝ｼ+${targetPowerPCFD}`));
  }
  // CHARM_CONDITIONAL_POWER: 繝√Ε繝ｼ繝縺後≠繧句ｴ蜷医ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'CHARM_CONDITIONAL_POWER') {
    if (!ctx.sourceCardNum) return done(ctx);
    const srcCCP = ctx.cardMap.get(ctx.sourceCardNum);
    const txtCCP = srcCCP ? (srcCCP.EffectText ?? '') + ' ' + (srcCCP.BurstText ?? '') : '';
    const toHWCCP = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mCCP = txtCCP.match(/([・・・・][・・・兔d]+)/);
    if (!mCCP) return done(addLog(ctx, '繝代Ρ繝ｼ蛟､隗｣譫仙､ｱ謨暦ｼ・HARM_CONDITIONAL_POWER・・));
    const deltaCCP = parseInt(toHWCCP(mCCP[1]).replace('・・, '+').replace('・・, '-'));
    let selfZoneCCP = -1;
    for (let zi = 0; zi < 3; zi++) {
      if (ctx.ownerState.field.signi[zi]?.at(-1) === ctx.sourceCardNum) { selfZoneCCP = zi; break; }
    }
    const hasCharmCCP = selfZoneCCP >= 0 && (ctx.ownerState.field.signi_charms?.[selfZoneCCP] ?? null) !== null;
    if (!hasCharmCCP) return done(addLog(ctx, '繝√Ε繝ｼ繝縺ｪ縺暦ｼ・HARM_CONDITIONAL_POWER・・));
    const modsCCP = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaCCP }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsCCP } },
      `繝√Ε繝ｼ繝縺ゅｊ竊偵ヱ繝ｯ繝ｼ${deltaCCP > 0 ? '+' : ''}${deltaCCP}`));
  }
  // POWER_BOOST_PER_SIGNI_WITH_ICON: 繧ｭ繝ｼ繝ｯ繝ｼ繝画戟縺｡繧ｷ繧ｰ繝・菴薙↓縺､縺阪ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_BOOST_PER_SIGNI_WITH_ICON') {
    const srcPBPSWI = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBPSWI = srcPBPSWI ? (srcPBPSWI.EffectText ?? '') + ' ' + (srcPBPSWI.BurstText ?? '') : '';
    const toHWPBPSWI = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mDeltaPBPSWI = txtPBPSWI.match(/([・・・・][・・・兔d]+)/);
    if (!mDeltaPBPSWI) return done(addLog(ctx, '繝代Ρ繝ｼ蛟､隗｣譫仙､ｱ謨暦ｼ・OWER_BOOST_PER_SIGNI_WITH_ICON・・));
    const singleDeltaPBPSWI = parseInt(toHWPBPSWI(mDeltaPBPSWI[1]).replace('・・, '+').replace('・・, '-'));
    // 繧ｭ繝ｼ繝ｯ繝ｼ繝芽・蜉帶戟縺｡繧ｷ繧ｰ繝九ｒ繧ｫ繧ｦ繝ｳ繝茨ｼ・eyword_grants 縺ｾ縺溘・ effectText 縺ｫ縲舌・代ヱ繧ｿ繝ｼ繝ｳ・・    let countPBPSWI = 0;
    const kwGrants = ctx.ownerState.keyword_grants ?? {};
    for (let zi = 0; zi < 3; zi++) {
      const cn = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!cn) continue;
      if (kwGrants[cn]?.length) countPBPSWI++;
      else if ((ctx.cardMap.get(cn)?.EffectText ?? '').includes('縲・)) countPBPSWI++;
    }
    const totalDeltaPBPSWI = singleDeltaPBPSWI * countPBPSWI;
    if (totalDeltaPBPSWI === 0) return done(addLog(ctx, '繧ｭ繝ｼ繝ｯ繝ｼ繝画戟縺｡繧ｷ繧ｰ繝九↑縺・));
    const modsPBPSWI = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (top) modsPBPSWI.push({ cardNum: top, delta: totalDeltaPBPSWI });
    }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBPSWI } },
      `繧ｭ繝ｼ繝ｯ繝ｼ繝画戟縺｡繧ｷ繧ｰ繝・{countPBPSWI}菴禿・{singleDeltaPBPSWI}竊堤嶌謇九ヱ繝ｯ繝ｼ${totalDeltaPBPSWI}`));
  }
  // POWER_MOD_MIRROR: 謐ｨ縺ｦ縺溘す繧ｰ繝九・繝代Ρ繝ｼ繧陳ｱ縺ｨ縺励※蟇ｾ雎｡縺ｫ驕ｩ逕ｨ
  // 繝ｻWXEX1-23譁・ц・・astProcessedCards縺ｫ逶ｸ謇九す繧ｰ繝具ｼ・ -(謐ｨ縺ｦ縺溘ヱ繝ｯ繝ｼ)繧堤嶌謇九す繧ｰ繝九∈
  // 繝ｻWXK06-049譁・ц・郁・蝣ｴ繧ｷ繧ｰ繝九′逋ｺ蜍墓ｺ撰ｼ・ +(謐ｨ縺ｦ縺溘ヱ繝ｯ繝ｼ)繧定・繧ｷ繧ｰ繝九∈
  if (stub.id === 'POWER_MOD_MIRROR') {
    const lastDiscardedPMM = ctx.ownerState.trash.at(-1);
    const discardedPwPMM = lastDiscardedPMM ? (parseInt(ctx.cardMap.get(lastDiscardedPMM)?.Power ?? '0') || 0) : 0;
    const oppTargetPMM = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (oppTargetPMM && discardedPwPMM > 0) {
      const modsPMM = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: oppTargetPMM, delta: -discardedPwPMM }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMM } },
        `${ctx.cardMap.get(oppTargetPMM)?.CardName ?? oppTargetPMM}縺ｮ繝代Ρ繝ｼ-${discardedPwPMM}・域昏縺ｦ縺溘す繧ｰ繝九・繝代Ρ繝ｼ・荏));
    }
    if (ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum) && discardedPwPMM > 0) {
      const modsSelfPMM = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: discardedPwPMM }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsSelfPMM } },
        `${ctx.cardMap.get(ctx.sourceCardNum)?.CardName ?? ctx.sourceCardNum}縺ｮ繝代Ρ繝ｼ+${discardedPwPMM}・域昏縺ｦ縺溘す繧ｰ繝九・繝代Ρ繝ｼ・荏));
    }
    return done(addLog(ctx, `繝代Ρ繝ｼ繝溘Λ繝ｼ・亥ｯｾ雎｡縺ｪ縺・/ 謐ｨ縺ｦ繝代Ρ繝ｼ${discardedPwPMM}・荏));
  }
  // PLACE_VIRUS_CENTER: 逶ｸ謇九・蜈ｨ繧ｷ繧ｰ繝九だ繝ｼ繝ｳ縺ｫ繧ｦ繧｣繝ｫ繧ｹ繧定ｨｭ鄂ｮ
  if (stub.id === 'PLACE_VIRUS_CENTER') {
    const sOtherPVC = ctx.otherState;
    const virusPVC = [...(sOtherPVC.field.signi_virus ?? [0, 0, 0])];
    for (let i = 0; i < 3; i++) { if (virusPVC[i] === 0 && sOtherPVC.field.signi[i]?.at(-1)) virusPVC[i] = 1; }
    const newSOtherPVC: PlayerState = { ...sOtherPVC, field: { ...sOtherPVC.field, signi_virus: virusPVC } };
    return done(addLog({ ...ctx, otherState: newSOtherPVC }, '逶ｸ謇句・繧ｷ繧ｰ繝九だ繝ｼ繝ｳ縺ｫ繧ｦ繧｣繝ｫ繧ｹ險ｭ鄂ｮ'));
  }
  // SELF_TRASH_IF_NO_OPP_VIRUS: 逶ｸ謇九↓繧ｦ繧｣繝ｫ繧ｹ縺後↑縺代ｌ縺ｰ閾ｪ繝医Λ繝・す繝･
  if (stub.id === 'SELF_TRASH_IF_NO_OPP_VIRUS') {
    const hasVirusSTINOV = (ctx.otherState.field.signi_virus ?? []).some(v => (v ?? 0) > 0);
    if (hasVirusSTINOV) return done(addLog(ctx, '逶ｸ謇九え繧｣繝ｫ繧ｹ縺ゅｊ・医ヨ繝ｩ繝・す繝･縺ｪ縺暦ｼ・));
    if (!ctx.sourceCardNum) return done(ctx);
    if (!ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum))
      return done(addLog(ctx, '繝輔ぅ繝ｼ繝ｫ繝峨↓縺・↑縺・ｼ・ELF_TRASH_IF_NO_OPP_VIRUS・・));
    const removedSTINOV = removeFromField(ctx.sourceCardNum, ctx.ownerState);
    const newSSTINOV: PlayerState = { ...removedSTINOV, trash: [...removedSTINOV.trash, ctx.sourceCardNum] };
    return done(addLog({ ...ctx, ownerState: newSSTINOV }, '逶ｸ謇九え繧｣繝ｫ繧ｹ縺ｪ縺冷・閾ｪ繝医Λ繝・す繝･'));
  }
  // NO_ABILITY_SIGNI_TO_DECK_BOTTOM: 閭ｽ蜉帙↑縺励す繧ｰ繝九ｒ繝・ャ繧ｭ荳九↓
  if (stub.id === 'NO_ABILITY_SIGNI_TO_DECK_BOTTOM') {
    if (!ctx.sourceCardNum) return done(ctx);
    const srcDataNASDB = ctx.cardMap.get(ctx.sourceCardNum);
    const hasAbility = !!(srcDataNASDB?.EffectText ?? srcDataNASDB?.BurstText);
    if (hasAbility) return done(addLog(ctx, '閭ｽ蜉帙≠繧翫・縺溘ａ繝・ャ繧ｭ荳狗ｧｻ蜍輔↑縺・));
    const removedNASDB = removeFromField(ctx.sourceCardNum, ctx.ownerState);
    const newSNASDB: PlayerState = { ...removedNASDB, deck: [...removedNASDB.deck, ctx.sourceCardNum] };
    return done(addLog({ ...ctx, ownerState: newSNASDB }, '閭ｽ蜉帙↑縺冷・繝・ャ繧ｭ荳・));
  }
  // FROZEN_SIGNI_TO_TRASH_ON_LEAVE: 蜃咲ｵ千憾諷九・繧ｷ繧ｰ繝九′騾蝣ｴ縺吶ｋ縺ｨ繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'FROZEN_SIGNI_TO_TRASH_ON_LEAVE') {
    // 蜃咲ｵ舌す繧ｰ繝九ｒ繝輔ぅ繝ｼ繝ｫ繝峨°繧峨ヨ繝ｩ繝・す繝･縺ｸ遘ｻ蜍・    let sFSTTOL = ctx.ownerState;
    const frozenSigni: string[] = [];
    for (let zi = 0; zi < 3; zi++) {
      if (sFSTTOL.field.signi_frozen?.[zi]) {
        const top = sFSTTOL.field.signi[zi]?.at(-1);
        if (top) frozenSigni.push(top);
      }
    }
    for (const cn of frozenSigni) {
      const removed = removeFromField(cn, sFSTTOL);
      sFSTTOL = { ...removed, trash: [...removed.trash, cn] };
    }
    return done(addLog({ ...ctx, ownerState: sFSTTOL }, `蜃咲ｵ舌す繧ｰ繝・{frozenSigni.length}譫壹ｒ繝医Λ繝・す繝･縺ｸ`));
  }
  // FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM: 蜃咲ｵ舌す繧ｰ繝九・繝舌ル繝・す繝･繧偵ョ繝・く荳九∈
  if (stub.id === 'FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM') {
    let sFSBTDB = ctx.ownerState;
    const frozenSigniFSBTDB: string[] = [];
    for (let zi = 0; zi < 3; zi++) {
      if (sFSBTDB.field.signi_frozen?.[zi]) {
        const top = sFSBTDB.field.signi[zi]?.at(-1);
        if (top) frozenSigniFSBTDB.push(top);
      }
    }
    for (const cn of frozenSigniFSBTDB) {
      const removed = removeFromField(cn, sFSBTDB);
      sFSBTDB = { ...removed, deck: [...removed.deck, cn] };
    }
    return done(addLog({ ...ctx, ownerState: sFSBTDB }, `蜃咲ｵ舌す繧ｰ繝・{frozenSigniFSBTDB.length}譫壹ｒ繝・ャ繧ｭ荳九∈`));
  }
  // ALL_OPP_SIGNI_SERVANT_ZERO / MAKE_SERVANT_ZERO / MAKE_MULTI_SERVANT_ZERO / SIGNI_SERVANT_ZERO:
  // 蟇ｾ雎｡繧ｷ繧ｰ繝九ｒ繧ｵ繝ｼ繝舌Φ繝・ERO・・XDi-P07-TK01-A: Lv1 邊ｾ蜈・辟｡濶ｲ 1000 閭ｽ蜉帙↑縺暦ｼ峨↓螟画鋤
  if (stub.id === 'ALL_OPP_SIGNI_SERVANT_ZERO' || stub.id === 'MAKE_SERVANT_ZERO' || stub.id === 'MAKE_MULTI_SERVANT_ZERO' || stub.id === 'SIGNI_SERVANT_ZERO') {
    const SERVANT_ZERO_NUM = 'WXDi-P07-TK01-A';
    // MAKE_SERVANT_ZERO / SIGNI_SERVANT_ZERO: 逶ｸ謇九す繧ｰ繝・菴薙ｒ驕ｸ謚・    if ((stub.id === 'MAKE_SERVANT_ZERO' || stub.id === 'SIGNI_SERVANT_ZERO') && !ctx.lastProcessedCards?.length) {
      const oppSigniMSZ = [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
      if (oppSigniMSZ.length === 0) return done(addLog(ctx, '逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨↓繧ｷ繧ｰ繝九↑縺暦ｼ・ERVANT_ZERO・・));
      const applyMSZ: StubAction = { type: 'STUB', id: stub.id };
      return selectOrInteract(oppSigniMSZ, 1, false, 'opp_field', applyMSZ as EffectAction, undefined, ctx);
    }
    const targets = ctx.lastProcessedCards?.length ? ctx.lastProcessedCards :
      [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
    if (targets.length === 0) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺暦ｼ・ERVANT_ZERO・・));
    // card_identity_overrides: instanceId 竊・'WXDi-P07-TK01-A' 縺ｫ險ｭ螳・    // battleCardMap縺後％繧後ｒ隗｣豎ｺ縺励｝ower=1000/class=邊ｾ蜈・color=辟｡/abilities=縺ｪ縺・縺碁←逕ｨ縺輔ｌ繧・    const identOverSZ = { ...(ctx.otherState.card_identity_overrides ?? {}) };
    for (const cn of targets) identOverSZ[cn] = SERVANT_ZERO_NUM;
    const newSOtherSZ: PlayerState = { ...ctx.otherState, card_identity_overrides: identOverSZ };
    return done(addLog({ ...ctx, otherState: newSOtherSZ }, `${targets.length}菴薙ｒ繧ｵ繝ｼ繝舌Φ繝・ERO・・XDi-P07-TK01-A・峨↓`));
  }
  // === 繝舌ャ繝・: 繝舌ル繝・す繝･繝ｻ繝医Λ繝・す繝･繝ｻ譚｡莉ｶ蜉ｹ譫・===
  // BANISH (STUB迚・: lastProcessedCards[0] 縺・sourceCardNum 繧偵ヰ繝九ャ繧ｷ繝･
  if (stub.id === 'BANISH') {
    const cnBAN = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnBAN) return done(addLog(ctx, '繝舌ル繝・す繝･蟇ｾ雎｡縺ｪ縺・));
    const foundOppBAN = ctx.otherState.field.signi.some(s => s?.at(-1) === cnBAN);
    if (foundOppBAN) {
      const removedBAN = removeFromField(cnBAN, ctx.otherState);
      const newSOtherBAN: PlayerState = { ...removedBAN, energy: [...removedBAN.energy, cnBAN] };
      return done(addLog({ ...ctx, otherState: newSOtherBAN }, `${ctx.cardMap.get(cnBAN)?.CardName ?? cnBAN}繧偵ヰ繝九ャ繧ｷ繝･`));
    }
    const foundSelfBAN = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnBAN);
    if (foundSelfBAN) {
      const removedBAN = removeFromField(cnBAN, ctx.ownerState);
      const newSBAN: PlayerState = { ...removedBAN, energy: [...removedBAN.energy, cnBAN] };
      return done(addLog({ ...ctx, ownerState: newSBAN }, `${ctx.cardMap.get(cnBAN)?.CardName ?? cnBAN}繧偵ヰ繝九ャ繧ｷ繝･`));
    }
    return done(addLog(ctx, `${ctx.cardMap.get(cnBAN)?.CardName ?? cnBAN}縺ｯ繝輔ぅ繝ｼ繝ｫ繝峨↓縺ｪ縺Я));
  }
  // TRASH (STUB迚・: lastProcessedCards[0] 縺・sourceCardNum 繧偵ヨ繝ｩ繝・す繝･縺ｸ
  if (stub.id === 'TRASH') {
    const cnTRS = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnTRS) return done(addLog(ctx, '繝医Λ繝・す繝･蟇ｾ雎｡縺ｪ縺・));
    // 閾ｪ繝輔ぅ繝ｼ繝ｫ繝・    if (ctx.ownerState.field.signi.some(s => s?.includes(cnTRS))) {
      const removedTRS = removeFromField(cnTRS, ctx.ownerState);
      return done(addLog({ ...ctx, ownerState: { ...removedTRS, trash: [...removedTRS.trash, cnTRS] } },
        `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}繧偵ヨ繝ｩ繝・す繝･縺ｸ`));
    }
    // 閾ｪ謇区惆
    if (ctx.ownerState.hand.includes(cnTRS)) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, hand: ctx.ownerState.hand.filter(c => c !== cnTRS), trash: [...ctx.ownerState.trash, cnTRS] } },
        `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}繧偵ヨ繝ｩ繝・す繝･縺ｸ`));
    }
    // 逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝・    if (ctx.otherState.field.signi.some(s => s?.includes(cnTRS))) {
      const removedTRS = removeFromField(cnTRS, ctx.otherState);
      return done(addLog({ ...ctx, otherState: { ...removedTRS, trash: [...removedTRS.trash, cnTRS] } },
        `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}繧偵ヨ繝ｩ繝・す繝･縺ｸ`));
    }
    return done(addLog(ctx, `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}・・RASH STUB・荏));
  }
  // BANISH_FROM_GAME: 繧ｲ繝ｼ繝縺九ｉ髯､螟厄ｼ医Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ・・  if (stub.id === 'BANISH_FROM_GAME') {
    const cnBFG = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnBFG) return done(addLog(ctx, '髯､螟門ｯｾ雎｡縺ｪ縺・));
    const foundOppBFG = ctx.otherState.field.signi.some(s => s?.at(-1) === cnBFG);
    const ownerBFG: 'self' | 'opponent' = foundOppBFG ? 'opponent' : 'self';
    const stBFG = ownerState(ownerBFG, ctx);
    const removedBFG = removeFromField(cnBFG, stBFG);
    const newSBFG: PlayerState = { ...removedBFG, lrig_trash: [...removedBFG.lrig_trash, cnBFG] };
    return done(addLog(setOwnerState(ownerBFG, newSBFG, ctx), `${ctx.cardMap.get(cnBFG)?.CardName ?? cnBFG}繧偵ご繝ｼ繝縺九ｉ髯､螟冒));
  }
  // TRASH_ALL_OPP_CARDS: 逶ｸ謇九お繝翫°繧牙錐蜑堺ｸ閾ｴ繧ｫ繝ｼ繝峨ｒ縺吶∋縺ｦ繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'TRASH_ALL_OPP_CARDS') {
    const srcTAOC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTAOC = srcTAOC ? (srcTAOC.EffectText ?? '') + ' ' + (srcTAOC.BurstText ?? '') : '';
    const nameMatchTAOC = txtTAOC.match(/縲・[^縲犠+)縲九ｒ蜷ｫ繧縺吶∋縺ｦ縺ｮ繧ｫ繝ｼ繝峨ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・);
    const targetNameTAOC = nameMatchTAOC?.[1];
    if (targetNameTAOC) {
      const toTrashTAOC = ctx.otherState.energy.filter(cn =>
        (ctx.cardMap.get(cn)?.CardName ?? '').includes(targetNameTAOC),
      );
      if (toTrashTAOC.length === 0) return done(addLog(ctx, `逶ｸ謇九お繝翫↓縲・{targetNameTAOC}縲阪↑縺輿));
      const newOtherTAOC: PlayerState = {
        ...ctx.otherState,
        energy: ctx.otherState.energy.filter(cn => !(ctx.cardMap.get(cn)?.CardName ?? '').includes(targetNameTAOC)),
        trash: [...ctx.otherState.trash, ...toTrashTAOC],
      };
      return done(addLog({ ...ctx, otherState: newOtherTAOC },
        `逶ｸ謇九お繝翫°繧峨・{targetNameTAOC}縲・{toTrashTAOC.length}譫壺・繝医Λ繝・す繝･`));
    }
    // 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ: 逶ｸ謇九・蜈ｨ繝輔ぅ繝ｼ繝ｫ繝・謇区惆繧偵ヨ繝ｩ繝・す繝･縺ｸ
    let sOppTAOC = ctx.otherState;
    const toTrashFbTAOC: string[] = [];
    const newSigniTAOC = sOppTAOC.field.signi.map(stack => {
      if (stack && stack.length > 0) { toTrashFbTAOC.push(...stack); return null; }
      return stack;
    }) as (string[] | null)[];
    toTrashFbTAOC.push(...sOppTAOC.hand);
    sOppTAOC = { ...sOppTAOC, field: { ...sOppTAOC.field, signi: newSigniTAOC }, hand: [], trash: [...sOppTAOC.trash, ...toTrashFbTAOC] };
    return done(addLog({ ...ctx, otherState: sOppTAOC }, `逶ｸ謇九・${toTrashFbTAOC.length}譫壹ｒ繝医Λ繝・す繝･縺ｸ`));
  }
  // ABILITY_CHECK_ELSE_TRASH: 閭ｽ蜉帙↑縺励↑繧芽・繝医Λ繝・す繝･
  if (stub.id === 'ABILITY_CHECK_ELSE_TRASH') {
    if (!ctx.sourceCardNum) return done(ctx);
    const srcDataACET = ctx.cardMap.get(ctx.sourceCardNum);
    const hasAbilityACET = !!(srcDataACET?.EffectText?.trim() || srcDataACET?.BurstText?.trim());
    if (hasAbilityACET) return done(addLog(ctx, '閭ｽ蜉帙≠繧翫・縺溘ａ繝医Λ繝・す繝･縺ｪ縺・));
    const removedACET = removeFromField(ctx.sourceCardNum, ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: { ...removedACET, trash: [...removedACET.trash, ctx.sourceCardNum] } }, '閭ｽ蜉帙↑縺冷・繝医Λ繝・す繝･'));
  }
  // OPTIONAL_DISCARD_CLASS_SIGNI: 繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九ｒ莉ｻ諢上〒謐ｨ縺ｦ繧・  if (stub.id === 'OPTIONAL_DISCARD_CLASS_SIGNI') {
    const srcODCS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtODCS = srcODCS ? (srcODCS.EffectText ?? '') + ' ' + (srcODCS.BurstText ?? '') : '';
    const classMatchODCS = txtODCS.match(/縲・[^縲曽+)縲・);
    const classFilterODCS = classMatchODCS?.[1];
    const candsODCS = ctx.ownerState.hand.filter(cn => {
      const card = ctx.cardMap.get(cn);
      if (card?.Type !== '繧ｷ繧ｰ繝・) return false;
      return !classFilterODCS || (card.CardClass ?? '').includes(classFilterODCS);
    });
    if (candsODCS.length === 0) return done(addLog(ctx, '蟇ｾ雎｡繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九↑縺暦ｼ井ｻｻ諢乗昏縺ｦ・・));
    const thenODCS: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsODCS, count: 1, optional: true,
      targetScope: 'self_hand', thenAction: thenODCS,
    });
  }
  // PICK_FROM_TRASHED_CARDS: 繝医Λ繝・す繝･繧ｫ繝ｼ繝峨°繧峨ヴ繝・け縺励※謇区惆縺ｸ
  if (stub.id === 'PICK_FROM_TRASHED_CARDS') {
    const trashPFTC = ctx.ownerState.trash;
    if (trashPFTC.length === 0) return done(addLog(ctx, '繝医Λ繝・す繝･縺ｪ縺・));
    const thenPFTC: TransferToHandAction = { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: trashPFTC, count: 1, optional: true,
      targetScope: 'self_trash', thenAction: thenPFTC,
    });
  }
  // CONDITIONAL_ADD_HAND: 繝輔ぅ繝ｼ繝ｫ繝峨↓繧ｷ繧ｰ繝九′縺ゅｌ縺ｰ謇区惆縺ｫ1譫夊ｿｽ蜉
  if (stub.id === 'CONDITIONAL_ADD_HAND') {
    const hasSigniCAH = ctx.ownerState.field.signi.some(s => s && s.length > 0);
    if (!hasSigniCAH) return done(addLog(ctx, '繝輔ぅ繝ｼ繝ｫ繝峨↓繧ｷ繧ｰ繝九↑縺暦ｼ域焔譛ｭ霑ｽ蜉縺ｪ縺暦ｼ・));
    const sCAH = ctx.ownerState;
    if (sCAH.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const drawnCAH = sCAH.deck[0];
    const newSCAH: PlayerState = { ...sCAH, deck: sCAH.deck.slice(1), hand: [...sCAH.hand, drawnCAH] };
    return done(addLog({ ...ctx, ownerState: newSCAH }, '譚｡莉ｶ驕疲・竊呈焔譛ｭ縺ｫ1譫夊ｿｽ蜉'));
  }
  // CONDITIONAL_DISCARD: 譚｡莉ｶ莉倥″謇区惆謐ｨ縺ｦ
  if (stub.id === 'CONDITIONAL_DISCARD') {
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '謇区惆縺ｪ縺暦ｼ域擅莉ｶ謐ｨ縺ｦ縺ｪ縺暦ｼ・));
    const thenCD: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: ctx.ownerState.hand, count: 1, optional: false,
      targetScope: 'self_hand', thenAction: thenCD,
    });
  }
  // PICK_FROM_TRASHED_CARDS 縺ｮ蠕悟濠 / CONDITIONAL_ALTERNATE_EFFECT: 莉｣譖ｿ蜉ｹ譫懶ｼ医せ繧ｭ繝・・・・  // TRASH_SPELL_FREE_USE_LIMIT: 繝医Λ繝・す繝･繧ｹ繝壹Ν辟｡譁吩ｽｿ逕ｨ蛻ｶ髯撰ｼ・og・・  // OPP_DECLARE_COLOR: 逶ｸ謇九′濶ｲ繧貞ｮ｣險・・og・・  // DISCARD_BY_POWER_MATCH: 謇区惆縺ｮ髱偵す繧ｰ繝九ｒ謐ｨ縺ｦ竊堤嶌謇区焔譛ｭ縺ｮ蜷後ヱ繝ｯ繝ｼ繧ｷ繧ｰ繝九ｒ謐ｨ縺ｦ縺輔○繧・  if (stub.id === 'DISCARD_BY_POWER_MATCH') {
    const toHWDBPM = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const discardedDBPM = (ctx.lastProcessedCards ?? []).find(cn => ctx.ownerState.hand.includes(cn));
    if (!discardedDBPM) {
      // Phase 1: SELECT_TARGET 謇区惆縺ｮ髱偵す繧ｰ繝具ｼ医さ繧ｹ繝茨ｼ・      const blueHandDBPM = ctx.ownerState.hand.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.Type === '繧ｷ繧ｰ繝・ && (c.Color ?? '').includes('髱・);
      });
      if (blueHandDBPM.length === 0) return done(addLog(ctx, '謇区惆縺ｫ髱偵す繧ｰ繝九↑縺暦ｼ・ISCARD_BY_POWER_MATCH・・));
      const noop: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const cont: StubAction = { type: 'STUB', id: 'DISCARD_BY_POWER_MATCH' };
      return needsInteraction(addLog(ctx, '謇区惆縺九ｉ髱偵す繧ｰ繝九ｒ驕ｸ謚橸ｼ域昏縺ｦ繧具ｼ・), {
        type: 'SELECT_TARGET', candidates: blueHandDBPM, count: 1, optional: false,
        targetScope: 'self_hand', thenAction: noop as EffectAction, continuation: cont as EffectAction,
      });
    }
    // Phase 2: 驕ｸ謚槭す繧ｰ繝九ｒ謐ｨ縺ｦ縲∝酔繝代Ρ繝ｼ縺ｮ逶ｸ謇区焔譛ｭ繧ｷ繧ｰ繝九ｒ謐ｨ縺ｦ縺輔○繧・    const discardedPwDBPM = parseInt(toHWDBPM(ctx.cardMap.get(discardedDBPM)?.Power ?? '0')) || 0;
    const newOwnerDBPM: PlayerState = {
      ...ctx.ownerState,
      hand: ctx.ownerState.hand.filter(cn => cn !== discardedDBPM),
      trash: [...ctx.ownerState.trash, discardedDBPM],
    };
    const matchingOppDBPM = ctx.otherState.hand.find(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === '繧ｷ繧ｰ繝・ && (parseInt(toHWDBPM(c.Power ?? '0')) || 0) === discardedPwDBPM;
    });
    if (matchingOppDBPM) {
      const newOtherDBPM: PlayerState = {
        ...ctx.otherState,
        hand: ctx.otherState.hand.filter(cn => cn !== matchingOppDBPM),
        trash: [...ctx.otherState.trash, matchingOppDBPM],
      };
      return done(addLog({ ...ctx, ownerState: newOwnerDBPM, otherState: newOtherDBPM },
        `${ctx.cardMap.get(discardedDBPM)?.CardName ?? discardedDBPM}繧呈昏縺ｦ縲∫嶌謇九・${ctx.cardMap.get(matchingOppDBPM)?.CardName ?? matchingOppDBPM}・医ヱ繝ｯ繝ｼ${discardedPwDBPM}・峨ｒ謐ｨ縺ｦ縺輔○繧義));
    }
    return done(addLog({ ...ctx, ownerState: newOwnerDBPM },
      `${ctx.cardMap.get(discardedDBPM)?.CardName ?? discardedDBPM}繧呈昏縺ｦ・育嶌謇区焔譛ｭ縺ｫ繝代Ρ繝ｼ${discardedPwDBPM}縺ｮ繧ｷ繧ｰ繝九↑縺暦ｼ荏));
  }
  // SELECT_NO_COMMON_COLOR / DISCARD_OR_PENALTY: log
  // === 繝舌ャ繝・: 繝代Ρ繝ｼ菫ｮ豁｣・医Ν繝ｪ繧ｰ繝ｻ繧ｫ繧ｦ繝ｳ繝育ｳｻ・・===
  // POWER_MOD_BY_LRIG_LEVEL: 繝ｫ繝ｪ繧ｰ繝ｬ繝吶Νﾃ妖elta繧堤嶌謇九す繧ｰ繝九↓驕ｩ逕ｨ
  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL') {
    const toHWPMBLL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const centerNumPMBLL = ctx.ownerState.field.lrig.at(-1);
    const centerCardPMBLL = centerNumPMBLL ? ctx.cardMap.get(centerNumPMBLL) : undefined;
    const lrigLevelPMBLL = centerCardPMBLL ? parseInt(toHWPMBLL(centerCardPMBLL.Level ?? '0')) || 0 : 0;
    const srcPMBLL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBLL = srcPMBLL ? (srcPMBLL.EffectText ?? '') + ' ' + (srcPMBLL.BurstText ?? '') : '';
    const mPMBLL = txtPMBLL.match(/([・・・・][・・・兔d]+)/);
    if (!mPMBLL) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣蛟､隗｣譫仙､ｱ謨暦ｼ・OWER_MOD_BY_LRIG_LEVEL・・));
    const singleDeltaPMBLL = parseInt(toHWPMBLL(mPMBLL[1]).replace('・・, '+').replace('・・, '-'));
    const totalDeltaPMBLL = singleDeltaPMBLL * lrigLevelPMBLL;
    const modsPMBLL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMBLL.push({ cardNum: top, delta: totalDeltaPMBLL }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMBLL } },
      `繝ｫ繝ｪ繧ｰLv${lrigLevelPMBLL}ﾃ・{singleDeltaPMBLL}竊堤嶌謇九す繧ｰ繝九ヱ繝ｯ繝ｼ${totalDeltaPMBLL}`));
  }
  // POWER_MOD_BY_LRIG_LEVEL_SUM: 蜈ｨ繝ｫ繝ｪ繧ｰ繝ｬ繝吶Ν蜷郁ｨ暗妖elta繧堤嶌謇九す繧ｰ繝九↓
  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL_SUM') {
    const toHWPMBLLS = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const lrigLevelSumPMBLLS = ctx.ownerState.field.lrig.reduce((sum, cn) => {
      return sum + (parseInt(toHWPMBLLS(ctx.cardMap.get(cn)?.Level ?? '0')) || 0);
    }, 0);
    const srcPMBLLS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBLLS = srcPMBLLS ? (srcPMBLLS.EffectText ?? '') + ' ' + (srcPMBLLS.BurstText ?? '') : '';
    const mPMBLLS = txtPMBLLS.match(/([・・・・][・・・兔d]+)/);
    if (!mPMBLLS) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣蛟､隗｣譫仙､ｱ謨暦ｼ・OWER_MOD_BY_LRIG_LEVEL_SUM・・));
    const singleDeltaPMBLLS = parseInt(toHWPMBLLS(mPMBLLS[1]).replace('・・, '+').replace('・・, '-'));
    const totalDeltaPMBLLS = singleDeltaPMBLLS * lrigLevelSumPMBLLS;
    const modsPMBLLS = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMBLLS.push({ cardNum: top, delta: totalDeltaPMBLLS }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMBLLS } },
      `蜈ｨ繝ｫ繝ｪ繧ｰLv蜷郁ｨ・{lrigLevelSumPMBLLS}ﾃ・{singleDeltaPMBLLS}竊堤嶌謇九す繧ｰ繝九ヱ繝ｯ繝ｼ${totalDeltaPMBLLS}`));
  }
  // POWER_MOD_BY_TRASH_CLASS_COUNT: 繝医Λ繝・す繝･縺ｮ迚ｹ螳壹け繝ｩ繧ｹ譫壽焚ﾃ妖elta繧偵ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_BY_TRASH_CLASS_COUNT') {
    const toHWPMBTCC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBTCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBTCC = srcPMBTCC ? (srcPMBTCC.EffectText ?? '') + ' ' + (srcPMBTCC.BurstText ?? '') : '';
    const classMatchPMBTCC = txtPMBTCC.match(/縲・[^縲曽+)縲・*?(?:縺ｮ)?(?:繧ｷ繧ｰ繝弓繧ｫ繝ｼ繝・.*?([・・・・][・・・兔d]+)/);
    if (!classMatchPMBTCC) return done(addLog(ctx, '繧ｯ繝ｩ繧ｹ/繝代Ρ繝ｼ蛟､隗｣譫仙､ｱ謨暦ｼ・OWER_MOD_BY_TRASH_CLASS_COUNT・・));
    const classNamePMBTCC = classMatchPMBTCC[1];
    const singleDeltaPMBTCC = parseInt(toHWPMBTCC(classMatchPMBTCC[2]).replace('・・, '+').replace('・・, '-'));
    const trashClassCountPMBTCC = ctx.ownerState.trash.filter(cn => (ctx.cardMap.get(cn)?.CardClass ?? '').includes(classNamePMBTCC)).length;
    const totalDeltaPMBTCC = singleDeltaPMBTCC * trashClassCountPMBTCC;
    if (ctx.sourceCardNum) {
      const modsOwnPMBTCC = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMBTCC }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsOwnPMBTCC } },
        `繝医Λ繝・す繝･縲・{classNamePMBTCC}縲・{trashClassCountPMBTCC}譫堙・{singleDeltaPMBTCC}竊偵ヱ繝ｯ繝ｼ${totalDeltaPMBTCC}`));
    }
    const modsOppPMBTCC = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsOppPMBTCC.push({ cardNum: top, delta: totalDeltaPMBTCC }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsOppPMBTCC } },
      `繝医Λ繝・す繝･縲・{classNamePMBTCC}縲・{trashClassCountPMBTCC}譫壺・逶ｸ謇九ヱ繝ｯ繝ｼ${totalDeltaPMBTCC}`));
  }
  // POWER_MOD_BY_UNDER_COUNT: 繧ｷ繧ｰ繝倶ｸ九・繧ｫ繝ｼ繝画椢謨ｰﾃ妖elta繧偵ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_BY_UNDER_COUNT') {
    const toHWPMBUC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBUC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBUC = srcPMBUC ? (srcPMBUC.EffectText ?? '') + ' ' + (srcPMBUC.BurstText ?? '') : '';
    const mPMBUC = txtPMBUC.match(/([・・・・][・・・兔d]+)/);
    if (!mPMBUC || !ctx.sourceCardNum) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣蛟､隗｣譫仙､ｱ謨暦ｼ・OWER_MOD_BY_UNDER_COUNT・・));
    const singleDeltaPMBUC = parseInt(toHWPMBUC(mPMBUC[1]).replace('・・, '+').replace('・・, '-'));
    let selfZonePMBUC = -1;
    for (let zi = 0; zi < 3; zi++) { if (ctx.ownerState.field.signi[zi]?.at(-1) === ctx.sourceCardNum) { selfZonePMBUC = zi; break; } }
    const underCountPMBUC = selfZonePMBUC >= 0 ? Math.max(0, (ctx.ownerState.field.signi[selfZonePMBUC]?.length ?? 1) - 1) : 0;
    const totalDeltaPMBUC = singleDeltaPMBUC * underCountPMBUC;
    const modsPMBUC = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMBUC }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPMBUC } },
      `繧ｷ繧ｰ繝倶ｸ・{underCountPMBUC}譫堙・{singleDeltaPMBUC}竊偵ヱ繝ｯ繝ｼ${totalDeltaPMBUC}`));
  }
  // POWER_MOD_BY_COLOR_VARIETY: 濶ｲ縺ｮ遞ｮ鬘樊焚ﾃ妖elta繧偵ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_BY_COLOR_VARIETY') {
    const toHWPMBCV = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBCV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBCV = srcPMBCV ? (srcPMBCV.EffectText ?? '') + ' ' + (srcPMBCV.BurstText ?? '') : '';
    const mPMBCV = txtPMBCV.match(/([・・・・][・・・兔d]+)/);
    if (!mPMBCV) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣蛟､隗｣譫仙､ｱ謨暦ｼ・OWER_MOD_BY_COLOR_VARIETY・・));
    const singleDeltaPMBCV = parseInt(toHWPMBCV(mPMBCV[1]).replace('・・, '+').replace('・・, '-'));
    // 閾ｪ蛻・・繧ｨ繝翫だ繝ｼ繝ｳ縺ｮ濶ｲ縺ｮ遞ｮ鬘橸ｼ・辟｡濶ｲ"莉･螟厄ｼ・    const colorsInEna = new Set<string>();
    for (const cn of ctx.ownerState.energy) {
      const col = ctx.cardMap.get(cn)?.Color ?? '';
      col.split('/').forEach(c => { if (c && c !== '辟｡濶ｲ') colorsInEna.add(c); });
    }
    const colorCountPMBCV = colorsInEna.size;
    const totalDeltaPMBCV = singleDeltaPMBCV * colorCountPMBCV;
    if (ctx.sourceCardNum) {
      const modsOwnPMBCV = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMBCV }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsOwnPMBCV } },
        `繧ｨ繝願牡${colorCountPMBCV}遞ｮﾃ・{singleDeltaPMBCV}竊偵ヱ繝ｯ繝ｼ${totalDeltaPMBCV}`));
    }
    const modsOppPMBCV = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsOppPMBCV.push({ cardNum: top, delta: totalDeltaPMBCV }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsOppPMBCV } },
      `繧ｨ繝願牡${colorCountPMBCV}遞ｮ竊堤嶌謇九す繧ｰ繝九ヱ繝ｯ繝ｼ${totalDeltaPMBCV}`));
  }
  // POWER_MOD_BY_DISCARD_COUNT_HIGH: 謐ｨ縺ｦ縺滓椢謨ｰ縺ｮ鬮倥＞譁ｹﾃ妖elta繧偵ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_BY_DISCARD_COUNT_HIGH') {
    const toHWPMBDCH = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBDCH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBDCH = srcPMBDCH ? (srcPMBDCH.EffectText ?? '') + ' ' + (srcPMBDCH.BurstText ?? '') : '';
    const mPMBDCH = txtPMBDCH.match(/([・・・・][・・・兔d]+)/);
    if (!mPMBDCH) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣蛟､隗｣譫仙､ｱ謨暦ｼ・OWER_MOD_BY_DISCARD_COUNT_HIGH・・));
    const singleDeltaPMBDCH = parseInt(toHWPMBDCH(mPMBDCH[1]).replace('・・, '+').replace('・・, '-'));
    const discardCountPMBDCH = ctx.lastProcessedCards?.length ?? 0;
    const totalDeltaPMBDCH = singleDeltaPMBDCH * discardCountPMBDCH;
    const modsPMBDCH = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMBDCH.push({ cardNum: top, delta: totalDeltaPMBDCH }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMBDCH } },
      `謐ｨ縺ｦ${discardCountPMBDCH}譫堙・{singleDeltaPMBDCH}竊堤嶌謇九ヱ繝ｯ繝ｼ${totalDeltaPMBDCH}`));
  }
  // === 繝舌ャ繝・: 繝ｫ繝ｪ繧ｰ繝ｻ譚｡莉ｶ繧ｵ繝ｼ繝√・驕ｸ謚樒ｳｻ ===
  // CRAFT_TO_LRIG_DECK / ADD_CRAFT_TO_LRIG_DECK: 繧ｯ繝ｩ繝輔ヨ繧偵Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｸ
  if (stub.id === 'CRAFT_TO_LRIG_DECK' || stub.id === 'ADD_CRAFT_TO_LRIG_DECK') {
    let cnCTLD = ctx.sourceCardNum ?? ctx.lastProcessedCards?.[0];
    if (!cnCTLD) {
      // 繝・く繧ｹ繝医°繧峨翫き繝ｼ繝牙錐縲九ｒ隗｣譫舌＠縺ｦlrig_trash竊断ield竊壇eck 縺九ｉ讀懃ｴ｢
      const srcCTLD2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
      const txtCTLD2 = srcCTLD2 ? (srcCTLD2.EffectText ?? '') : '';
      const nameMCTLD2 = txtCTLD2.match(/繧ｯ繝ｩ繝輔ヨ縺ｮ縲・[^縲犠+)縲・);
      const craftNameCTLD2 = nameMCTLD2 ? nameMCTLD2[1] : '';
      if (craftNameCTLD2) {
        const fromLrigTrash = ctx.ownerState.lrig_trash.find(cn => ctx.cardMap.get(cn)?.CardName === craftNameCTLD2);
        const fromField = ctx.ownerState.field.lrig.find(cn => ctx.cardMap.get(cn)?.CardName === craftNameCTLD2);
        cnCTLD = fromLrigTrash ?? fromField;
      }
      if (!cnCTLD) return done(addLog(ctx, `繧ｯ繝ｩ繝輔ヨ繧ｫ繝ｼ繝峨↑縺・{craftNameCTLD2 ? `・・{craftNameCTLD2}・荏 : ''}`));
    }
    let sCTLD = ctx.ownerState;
    sCTLD = {
      ...sCTLD,
      hand: sCTLD.hand.filter(c => c !== cnCTLD),
      trash: sCTLD.trash.filter(c => c !== cnCTLD),
      lrig_trash: sCTLD.lrig_trash.filter(c => c !== cnCTLD),
      field: { ...sCTLD.field, lrig: sCTLD.field.lrig.filter(c => c !== cnCTLD) },
      lrig_deck: [...sCTLD.lrig_deck, cnCTLD],
    };
    return done(addLog({ ...ctx, ownerState: sCTLD }, `${ctx.cardMap.get(cnCTLD)?.CardName ?? cnCTLD}繧偵Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ霑ｽ蜉`));
  }
  // PLACE_LRIG_FROM_DECK_ON_TOP: 繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺九ｉ繝ｫ繝ｪ繧ｰ繧偵ヵ繧｣繝ｼ繝ｫ繝峨∈
  if (stub.id === 'PLACE_LRIG_FROM_DECK_ON_TOP') {
    const sPLFDOT = ctx.ownerState;
    const topLrigPLFDOT = sPLFDOT.lrig_deck[0];
    if (!topLrigPLFDOT) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺ｪ縺・));
    const newSPLFDOT: PlayerState = {
      ...sPLFDOT,
      lrig_deck: sPLFDOT.lrig_deck.slice(1),
      field: { ...sPLFDOT.field, lrig: [...sPLFDOT.field.lrig, topLrigPLFDOT] },
    };
    return done(addLog({ ...ctx, ownerState: newSPLFDOT }, `${ctx.cardMap.get(topLrigPLFDOT)?.CardName ?? topLrigPLFDOT}繧偵ヵ繧｣繝ｼ繝ｫ繝峨∈`));
  }
  // LRIG_LIMIT_UP_AND_COLOR_GAIN: 繝ｫ繝ｪ繧ｰ繝ｪ繝溘ャ繝亥｢怜刈・・1・峨→濶ｲ迯ｲ蠕暦ｼ・og・・  if (stub.id === 'LRIG_LIMIT_UP_AND_COLOR_GAIN') {
    const newSLLUACG: PlayerState = { ...ctx.ownerState, lrig_limit_mod: (ctx.ownerState.lrig_limit_mod ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newSLLUACG }, '繝ｫ繝ｪ繧ｰ繝ｪ繝溘ャ繝・1・郁牡迯ｲ蠕励・繧ｨ繝ｳ繧ｸ繝ｳ蜃ｦ逅・ｼ・));
  }
  // CONDITIONAL_SEARCH_IF_FIELD: 繝輔ぅ繝ｼ繝ｫ繝峨↓繧ｷ繧ｰ繝九′縺ゅｋ蝣ｴ蜷医し繝ｼ繝・  if (stub.id === 'CONDITIONAL_SEARCH_IF_FIELD') {
    const hasSigniCSIF = ctx.ownerState.field.signi.some(s => s && s.length > 0);
    if (!hasSigniCSIF) return done(addLog(ctx, '繝輔ぅ繝ｼ繝ｫ繝峨↓繧ｷ繧ｰ繝九↑縺暦ｼ医し繝ｼ繝√↑縺暦ｼ・));
    // 繝・ャ繧ｭ荳・譫壹°繧峨す繧ｰ繝九ｒ驕ｸ謚・    const deckCSIF = ctx.ownerState.deck;
    if (deckCSIF.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const topCSIF = deckCSIF.slice(0, Math.min(3, deckCSIF.length));
    const signiTopCSIF = topCSIF.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
    if (signiTopCSIF.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ荳・譫壹↓繧ｷ繧ｰ繝九↑縺・));
    const newSCSIF: PlayerState = { ...ctx.ownerState, deck: deckCSIF.slice(topCSIF.length), hand: [...ctx.ownerState.hand, signiTopCSIF[0]] };
    return done(addLog({ ...ctx, ownerState: newSCSIF }, `繝輔ぅ繝ｼ繝ｫ繝峨≠繧岩・${ctx.cardMap.get(signiTopCSIF[0])?.CardName ?? signiTopCSIF[0]}繧呈焔譛ｭ縺ｸ`));
  }
  // CONDITIONAL_SEARCH_IF_RESONA: 繝輔ぅ繝ｼ繝ｫ繝峨↓繝ｬ繧ｾ繝翫′縺ゅｋ蝣ｴ蜷医し繝ｼ繝・  if (stub.id === 'CONDITIONAL_SEARCH_IF_RESONA') {
    const hasResonaCSIR = ctx.ownerState.field.signi.some(s => s && s.some(cn => ctx.cardMap.get(cn)?.Type === '繝ｬ繧ｾ繝・));
    if (!hasResonaCSIR) return done(addLog(ctx, '繝ｬ繧ｾ繝翫↑縺暦ｼ医し繝ｼ繝√↑縺暦ｼ・));
    const deckCSIR = ctx.ownerState.deck;
    if (deckCSIR.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const topCSIR = deckCSIR.slice(0, Math.min(5, deckCSIR.length));
    const signiCSIR = topCSIR.find(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
    if (!signiCSIR) return done(addLog(ctx, '繝・ャ繧ｭ荳・譫壹↓繧ｷ繧ｰ繝九↑縺・));
    const restCSIR = topCSIR.filter(cn => cn !== signiCSIR);
    const newSCSIR: PlayerState = { ...ctx.ownerState, deck: [...restCSIR, ...deckCSIR.slice(topCSIR.length)], hand: [...ctx.ownerState.hand, signiCSIR] };
    return done(addLog({ ...ctx, ownerState: newSCSIR }, `繝ｬ繧ｾ繝翫≠繧岩・${ctx.cardMap.get(signiCSIR)?.CardName ?? signiCSIR}繧呈焔譛ｭ縺ｸ`));
  }
  // CHOSEN_TO_ENERGY_OR_HAND: 驕ｸ繧薙□繧ｫ繝ｼ繝峨ｒ繧ｨ繝翫°謇区惆縺矩∈謚槭＠縺ｦ霑ｽ蜉
  if (stub.id === 'CHOSEN_TO_ENERGY_OR_HAND') {
    const cnCTEOH = ctx.lastProcessedCards?.[0];
    if (!cnCTEOH) return done(addLog(ctx, '蟇ｾ雎｡繧ｫ繝ｼ繝峨↑縺・));
    const toHandCTEOH: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_HAND' };
    const toEnaCTEOH: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_ENERGY' };
    return needsInteraction(ctx, {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'to_hand', label: '謇区惆縺ｫ蜉縺医ｋ', action: toHandCTEOH, available: true },
        { id: 'to_energy', label: '繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ', action: toEnaCTEOH, available: true },
      ],
    });
  }
  // OPP_ENERGY_OR_DISCARD_CONDITION: 逶ｸ謇九・繧ｨ繝翫だ繝ｼ繝ｳ縺九ヨ繝ｩ繝・す繝･縺矩∈謚・  if (stub.id === 'OPP_ENERGY_OR_DISCARD_CONDITION') {
    const toEnaOEODC: EnergyChargeAction = { type: 'ENERGY_CHARGE', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } };
    const toTrashOEODC: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } };
    return needsInteraction(ctx, {
      type: 'CHOOSE', count: 1, opponentResponds: true,
      options: [
        { id: 'energy', label: '繧ｨ繝翫°繧峨き繝ｼ繝峨ｒ鄂ｮ縺・, action: toEnaOEODC, available: ctx.otherState.energy.length > 0 },
        { id: 'discard', label: '謇区惆繧・譫壽昏縺ｦ繧・, action: toTrashOEODC, available: ctx.otherState.hand.length > 0 },
      ],
    });
  }
  // PLACE_SIGNI_UNDER_SIGNI: 繧ｷ繧ｰ繝九ｒ繧ｷ繧ｰ繝倶ｸ九↓險ｭ鄂ｮ・・astProcessed竊痴ourceCardNum縺ｮ繧ｾ繝ｼ繝ｳ荳具ｼ・  if (stub.id === 'PLACE_SIGNI_UNDER_SIGNI') {
    const cardToPlacePSUS = ctx.lastProcessedCards?.[0];
    if (!cardToPlacePSUS || !ctx.sourceCardNum) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺暦ｼ・LACE_SIGNI_UNDER_SIGNI・・));
    let selfZonePSUS = -1;
    for (let zi = 0; zi < 3; zi++) { if (ctx.ownerState.field.signi[zi]?.at(-1) === ctx.sourceCardNum) { selfZonePSUS = zi; break; } }
    if (selfZonePSUS < 0) return done(addLog(ctx, '繧ｾ繝ｼ繝ｳ荳肴・・・LACE_SIGNI_UNDER_SIGNI・・));
    let sPSUS = ctx.ownerState;
    sPSUS = { ...sPSUS, hand: sPSUS.hand.filter(c => c !== cardToPlacePSUS), trash: sPSUS.trash.filter(c => c !== cardToPlacePSUS) };
    const newSigniPSUS = sPSUS.field.signi.map((stack, i) => {
      if (i !== selfZonePSUS) return stack;
      return [cardToPlacePSUS, ...(stack ?? [])];
    }) as (string[] | null)[];
    sPSUS = { ...sPSUS, field: { ...sPSUS.field, signi: newSigniPSUS } };
    return done(addLog({ ...ctx, ownerState: sPSUS }, `${ctx.cardMap.get(cardToPlacePSUS)?.CardName ?? cardToPlacePSUS}繧偵す繧ｰ繝倶ｸ九↓險ｭ鄂ｮ`));
  }
  // CONDITIONAL_PER_TRASH: 繝医Λ繝・す繝･譫壽焚縺ｫ繧医ｋ譚｡莉ｶ・・譫壻ｻ･荳翫〒X・・  if (stub.id === 'CONDITIONAL_PER_TRASH') {
    const srcCPT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCPT = srcCPT ? (srcCPT.EffectText ?? '') + ' ' + (srcCPT.BurstText ?? '') : '';
    const toHWCPT = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mCPT = txtCPT.match(/繝医Λ繝・す繝･縺ｫ(?:繧ｫ繝ｼ繝峨′)?([・・・兔d]+)譫壻ｻ･荳・);
    const threshold = mCPT ? parseInt(toHWCPT(mCPT[1])) : 5;
    const trashCountCPT = ctx.ownerState.trash.length;
    if (trashCountCPT < threshold) return done(addLog(ctx, `繝医Λ繝・す繝･${trashCountCPT}譫夲ｼ磯明蛟､${threshold}譫壹↓譛ｪ驕費ｼ荏));
    // 譚｡莉ｶ驕疲・竊・譫壹ラ繝ｭ繝ｼ
    const sCPT = ctx.ownerState;
    if (sCPT.deck.length === 0) return done(addLog(ctx, `繝医Λ繝・す繝･譚｡莉ｶ驕疲・縺縺後ョ繝・く縺ｪ縺輿));
    const drawnCPT = sCPT.deck[0];
    return done(addLog({ ...ctx, ownerState: { ...sCPT, deck: sCPT.deck.slice(1), hand: [...sCPT.hand, drawnCPT] } },
      `繝医Λ繝・す繝･${trashCountCPT}譫壽擅莉ｶ驕疲・竊・譫壹ラ繝ｭ繝ｼ`));
  }
  // === 繝舌ャ繝・0: 蜈ｬ髢九・謇区惆繝ｻ逶ｸ謇区焔譛ｭ謫堺ｽ・===
  // LOOK_OPP_HAND_DISCARD_SIGNI: 逶ｸ謇九・謇区惆繧定ｦ九※繧ｷ繧ｰ繝・譫壹ｒ謐ｨ縺ｦ縺輔○繧・  if (stub.id === 'LOOK_OPP_HAND_DISCARD_SIGNI') {
    const signiInOppLOHDS = ctx.otherState.hand.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
    if (signiInOppLOHDS.length === 0) return done(addLog(ctx, '逶ｸ謇区焔譛ｭ縺ｫ繧ｷ繧ｰ繝九↑縺・));
    const thenLOHDS: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: signiInOppLOHDS, count: 1, optional: false,
      targetScope: 'opp_hand', thenAction: thenLOHDS,
    });
  }
  // REVEALED_CARD_COLOR_DISCARD: 蜈ｬ髢九き繝ｼ繝峨・濶ｲ縺ｨ蜷後§濶ｲ縺ｮ謇区惆繧ｫ繝ｼ繝峨ｒ謐ｨ縺ｦ繧・  if (stub.id === 'REVEALED_CARD_COLOR_DISCARD') {
    const revCardRCCD = ctx.lastProcessedCards?.[0];
    if (!revCardRCCD) return done(addLog(ctx, '蜈ｬ髢九き繝ｼ繝峨↑縺・));
    const revColorRCCD = ctx.cardMap.get(revCardRCCD)?.Color ?? '';
    if (!revColorRCCD) return done(addLog(ctx, '蜈ｬ髢九き繝ｼ繝峨・濶ｲ荳肴・'));
    const revColorsRCCD = revColorRCCD.split('/');
    const matchingRCCD = ctx.ownerState.hand.filter(cn => {
      const col = ctx.cardMap.get(cn)?.Color ?? '';
      return col.split('/').some(c => revColorsRCCD.includes(c));
    });
    if (matchingRCCD.length === 0) return done(addLog(ctx, `謇区惆縺ｫ${revColorRCCD}繧ｫ繝ｼ繝峨↑縺輿));
    const thenRCCD: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: matchingRCCD, count: 1, optional: false,
      targetScope: 'self_hand', thenAction: thenRCCD,
    });
  }
  // VIEW_AND_DISCARD_SPELL (STUB迚・: 謇区惆縺句ｴ縺ｮ繧ｫ繝ｼ繝峨ｒ隕九※繧ｹ繝壹Ν繧呈昏縺ｦ繧・竊・謇区惆縺九ｉ繧ｹ繝壹Ν繧・譫壽昏縺ｦ繧・  // (already implemented by batch 5 VIEW_AND_DISCARD_SPELL)
  // OPP_TRASH_TO_OPP_SIGNI_UNDER: 逶ｸ謇九ヨ繝ｩ繝・す繝･譛荳頑ｮｵ繧堤嶌謇九す繧ｰ繝倶ｸ九↓繧ｫ繝ｼ繝峨ｒ鄂ｮ縺・  if (stub.id === 'OPP_TRASH_TO_OPP_SIGNI_UNDER') {
    const sOTTOSU = ctx.otherState;
    if (sOTTOSU.trash.length === 0) return done(addLog(ctx, '逶ｸ謇九ヨ繝ｩ繝・す繝･縺ｪ縺・));
    const topTrashOTTOSU = sOTTOSU.trash.at(-1)!;
    // 繝医Λ繝・す繝･縺九ｉ繧ｫ繝ｼ繝峨ｒ蜿悶ｊ蜃ｺ縺励〕astProcessedCards縺ｫ菫晄戟
    const newTrashOTTOSU = sOTTOSU.trash.slice(0, -1);
    const ctx1OTTBSU = { ...ctx, otherState: { ...sOTTOSU, trash: newTrashOTTOSU }, lastProcessedCards: [topTrashOTTOSU] };
    const oppZonesOTTOSU = [0, 1, 2].filter(zi => sOTTOSU.field.signi[zi]?.at(-1));
    if (oppZonesOTTOSU.length === 0) return done(addLog(ctx1OTTBSU, '逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨↓繧ｷ繧ｰ繝九↑縺・));
    if (oppZonesOTTOSU.length === 1) {
      // 1菴薙・縺ｿ 竊・閾ｪ蜍墓ｱｺ螳・      return exec({ type: 'STUB', id: 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE', value: oppZonesOTTOSU[0] } as StubAction as EffectAction, ctx1OTTBSU);
    }
    // 隍・焚繧ｷ繧ｰ繝・竊・繧ｾ繝ｼ繝ｳ驕ｸ謚橸ｼ医が繝ｼ繝翫・蛛ｴ縺碁∈縺ｶ・・    const zoneOptsOTTOSU = oppZonesOTTOSU.map(zi => ({
      id: `ottbsu_zone_${zi}`,
      label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｮ繧ｷ繧ｰ繝九・荳九↓鄂ｮ縺汁,
      action: ({ type: 'STUB', id: 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx1OTTBSU, `${ctx.cardMap.get(topTrashOTTOSU)?.CardName ?? topTrashOTTOSU}・壹←縺ｮ繧ｷ繧ｰ繝九・荳九↓鄂ｮ縺擾ｼ歔), {
      type: 'CHOOSE', options: zoneOptsOTTOSU, count: 1,
    });
  }
  // INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE: stub.value=繧ｾ繝ｼ繝ｳ逡ｪ蜿ｷ縲〕astProcessedCards[0]=鄂ｮ縺上き繝ｼ繝・  if (stub.id === 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE') {
    const zoneIdxOTUSZ = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const cardToPlaceOTUSZ = ctx.lastProcessedCards?.[0] ?? null;
    if (!cardToPlaceOTUSZ) return done(addLog(ctx, 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE: 繧ｫ繝ｼ繝峨↑縺・));
    const newSigniOTUSZ = ctx.otherState.field.signi.map((stack, i) => {
      if (i !== zoneIdxOTUSZ) return stack;
      return [cardToPlaceOTUSZ, ...(stack ?? [])];
    }) as (string[] | null)[];
    const newOtherOTUSZ = { ...ctx.otherState, field: { ...ctx.otherState.field, signi: newSigniOTUSZ } };
    return done(addLog({ ...ctx, otherState: newOtherOTUSZ },
      `${ctx.cardMap.get(cardToPlaceOTUSZ)?.CardName ?? cardToPlaceOTUSZ}竊堤嶌謇九だ繝ｼ繝ｳ${zoneIdxOTUSZ + 1}縺ｮ繧ｷ繧ｰ繝倶ｸ九∈`));
  }
  // POWER_MOD_BY_FIELD_CLASS_LEVEL: 繝輔ぅ繝ｼ繝ｫ繝峨・繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九Ξ繝吶Ν蜷郁ｨ暗妖elta繧偵ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_BY_FIELD_CLASS_LEVEL') {
    const toHWPMBFCL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBFCL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBFCL = srcPMBFCL ? (srcPMBFCL.EffectText ?? '') + ' ' + (srcPMBFCL.BurstText ?? '') : '';
    const classMatchPMBFCL = txtPMBFCL.match(/縲・[^縲曽+)縲・);
    const classNamePMBFCL = classMatchPMBFCL?.[1] ?? '';
    const mDeltaPMBFCL = txtPMBFCL.match(/([・・・・][・・・兔d]+)/);
    if (!mDeltaPMBFCL) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣蛟､隗｣譫仙､ｱ謨暦ｼ・OWER_MOD_BY_FIELD_CLASS_LEVEL・・));
    const singleDeltaPMBFCL = parseInt(toHWPMBFCL(mDeltaPMBFCL[1]).replace('・・, '+').replace('・・, '-'));
    let levelSumPMBFCL = 0;
    for (let zi = 0; zi < 3; zi++) {
      const cn = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!cn) continue;
      const card = ctx.cardMap.get(cn);
      if (!classNamePMBFCL || (card?.CardClass ?? '').includes(classNamePMBFCL)) {
        levelSumPMBFCL += parseInt(toHWPMBFCL(card?.Level ?? '0')) || 0;
      }
    }
    const totalDeltaPMBFCL = singleDeltaPMBFCL * levelSumPMBFCL;
    if (ctx.sourceCardNum) {
      const modsOwnPMBFCL = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMBFCL }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsOwnPMBFCL } },
        `繝輔ぅ繝ｼ繝ｫ繝峨・{classNamePMBFCL}縲代Ξ繝吶Ν蜷郁ｨ・{levelSumPMBFCL}ﾃ・{singleDeltaPMBFCL}竊偵ヱ繝ｯ繝ｼ${totalDeltaPMBFCL}`));
    }
    const modsOppPMBFCL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsOppPMBFCL.push({ cardNum: top, delta: totalDeltaPMBFCL }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsOppPMBFCL } },
      `繝輔ぅ繝ｼ繝ｫ繝峨け繝ｩ繧ｹ繝ｬ繝吶Ν${levelSumPMBFCL}竊堤嶌謇九ヱ繝ｯ繝ｼ${totalDeltaPMBFCL}`));
  }
  // POWER_MOD_PER_REVEALED_LEVEL: 蜈ｬ髢九き繝ｼ繝峨・繝ｬ繝吶Ν蜷郁ｨ暗妖elta繧偵ヱ繝ｯ繝ｼ菫ｮ豁｣
  if (stub.id === 'POWER_MOD_PER_REVEALED_LEVEL') {
    const toHWPMPRL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMPRL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMPRL = srcPMPRL ? (srcPMPRL.EffectText ?? '') + ' ' + (srcPMPRL.BurstText ?? '') : '';
    const mPMPRL = txtPMPRL.match(/([・・・・][・・・兔d]+)/);
    if (!mPMPRL) return done(addLog(ctx, '繝代Ρ繝ｼ菫ｮ豁｣蛟､隗｣譫仙､ｱ謨暦ｼ・OWER_MOD_PER_REVEALED_LEVEL・・));
    const singleDeltaPMPRL = parseInt(toHWPMPRL(mPMPRL[1]).replace('・・, '+').replace('・・, '-'));
    const levelSumPMPRL = (ctx.lastProcessedCards ?? []).reduce((sum, cn) => {
      return sum + (parseInt(toHWPMPRL(ctx.cardMap.get(cn)?.Level ?? '0')) || 0);
    }, 0);
    const totalDeltaPMPRL = singleDeltaPMPRL * levelSumPMPRL;
    const modsPMPRL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMPRL.push({ cardNum: top, delta: totalDeltaPMPRL }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMPRL } },
      `蜈ｬ髢九Ξ繝吶Ν蜷郁ｨ・{levelSumPMPRL}ﾃ・{singleDeltaPMPRL}竊堤嶌謇九す繧ｰ繝九ヱ繝ｯ繝ｼ${totalDeltaPMPRL}`));
  }
  // === 繝舌ャ繝・8: 繧ｨ繝ｳ繧ｸ繝ｳ蠢・育ｳｻ ===
  // 繝医Λ繝・・邉ｻ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

  // PLACE_TRAP_OPTIONAL / SET_HAND_CARD_AS_TRAP: 謇区惆縺九ｉ繝医Λ繝・・險ｭ鄂ｮ
  if (stub.id === 'PLACE_TRAP_OPTIONAL' || stub.id === 'SET_HAND_CARD_AS_TRAP') {
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '繝医Λ繝・・險ｭ鄂ｮ・壽焔譛ｭ縺ｪ縺・));
    const zoneOptsPTO = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ險ｭ鄂ｮ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '繝医Λ繝・・縺ｫ縺吶ｋ繧ｫ繝ｼ繝峨ｒ驕ｸ謚・), {
      type: 'SELECT_TARGET',
      candidates: ctx.ownerState.hand,
      count: 1,
      optional: false,
      targetScope: 'self_hand',
      thenAction: ({ type: 'STUB', id: 'CHOOSE_TRAP_ZONE' } as StubAction) as EffectAction,
      continuation: ({ type: 'CHOOSE', choose_count: 1, from_count: 3, choices: zoneOptsPTO.map(o => ({ choiceId: o.id, label: o.label, action: o.action })) } as ChooseAction) as EffectAction,
    });
  }
  // CHOOSE_TRAP_ZONE: 驕ｸ謚樊ｸ医∩繧ｫ繝ｼ繝峨・繧ｾ繝ｼ繝ｳ驕ｸ謚・  if (stub.id === 'CHOOSE_TRAP_ZONE') {
    const zoneOptsCTZ = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ險ｭ鄂ｮ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '險ｭ鄂ｮ縺吶ｋ繧ｾ繝ｼ繝ｳ繧帝∈謚・), {
      type: 'CHOOSE', options: zoneOptsCTZ, count: 1,
    });
  }
  // INTERNAL_SET_TRAP: 繧ｾ繝ｼ繝ｳ逡ｪ蜿ｷ繧痴tub.value縺ｧ蜿励￠蜿悶ｊ繝医Λ繝・・險ｭ鄂ｮ
  if (stub.id === 'INTERNAL_SET_TRAP') {
    const zoneIdxIST = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const trapCardIST = ctx.lastProcessedCards?.[0] ?? null;
    if (!trapCardIST) return done(addLog(ctx, '繝医Λ繝・・險ｭ鄂ｮ・壼ｯｾ雎｡繧ｫ繝ｼ繝峨↑縺・));
    const currentTrapsIST = [...(ctx.ownerState.field.signi_traps ?? [null, null, null])] as (string | null)[];
    const newTrashIST = [...ctx.ownerState.trash];
    if (currentTrapsIST[zoneIdxIST]) newTrashIST.push(currentTrapsIST[zoneIdxIST]!);
    currentTrapsIST[zoneIdxIST] = trapCardIST;
    const newHandIST = ctx.ownerState.hand.filter(c => c !== trapCardIST);
    const newOwnerIST = { ...ctx.ownerState, hand: newHandIST, trash: newTrashIST, field: { ...ctx.ownerState.field, signi_traps: currentTrapsIST } };
    return done(addLog({ ...ctx, ownerState: newOwnerIST }, `繝医Λ繝・・險ｭ鄂ｮ: 繧ｾ繝ｼ繝ｳ${zoneIdxIST + 1}`));
  }
  // TRAP_TO_HAND: signi_traps縺ｮ繧ｫ繝ｼ繝峨ｒ謇区惆縺ｸ・亥・譫壹∪縺溘・驕ｸ謚橸ｼ・  if (stub.id === 'TRAP_TO_HAND') {
    const allTrapsTTH = (ctx.ownerState.field.signi_traps ?? [null, null, null]);
    const trapsToHandTTH = allTrapsTTH.filter(Boolean) as string[];
    if (trapsToHandTTH.length === 0) return done(addLog(ctx, '繝医Λ繝・・縺ｪ縺・));
    // 繝・く繧ｹ繝医〒譫壽焚蛻ｶ髯舌ｒ遒ｺ隱・    const srcTTH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTTH = srcTTH ? (srcTTH.EffectText ?? '') + ' ' + (srcTTH.BurstText ?? '') : '';
    const toHWTTH = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const cntMTTH = txtTTH.match(/縲舌ヨ繝ｩ繝・・縲代ｒ([・・・兔d]+)譫壹∪縺ｧ謇区惆縺ｫ蜉縺医ｋ/);
    const maxCountTTH = cntMTTH ? parseInt(toHWTTH(cntMTTH[1])) : trapsToHandTTH.length;
    // 縲君譫壹∪縺ｧ縲肴欠螳壹′縺ゅｊ隍・焚繝医Λ繝・・縺後≠繧句ｴ蜷医・驕ｸ謚朸I
    if (maxCountTTH < trapsToHandTTH.length && trapsToHandTTH.length > 1) {
      return needsInteraction(addLog(ctx, `謇区惆縺ｫ蜉縺医ｋ繝医Λ繝・・繧・{maxCountTTH}譫壹∪縺ｧ驕ｸ謚杼), {
        type: 'SELECT_TARGET',
        candidates: trapsToHandTTH,
        count: maxCountTTH,
        optional: true,
        targetScope: 'self_field',
        thenAction: ({ type: 'STUB', id: 'INTERNAL_TTH_APPLY' } as StubAction) as EffectAction,
      });
    }
    const takeTTH = trapsToHandTTH.slice(0, maxCountTTH);
    const newTrapsTTH = allTrapsTTH.map(t => (t && takeTTH.includes(t) ? null : t)) as (string | null)[];
    const newOwnerTTH = { ...ctx.ownerState, hand: [...ctx.ownerState.hand, ...takeTTH], field: { ...ctx.ownerState.field, signi_traps: newTrapsTTH } };
    return done(addLog({ ...ctx, ownerState: newOwnerTTH }, `繝医Λ繝・・${takeTTH.length}譫壹ｒ謇区惆縺ｸ`));
  }
  // INTERNAL_TTH_APPLY: TRAP_TO_HAND驕ｸ謚槫ｮ御ｺ・ｾ後・驕ｩ逕ｨ
  if (stub.id === 'INTERNAL_TTH_APPLY') {
    const selectedTTH = ctx.lastProcessedCards ?? [];
    if (selectedTTH.length === 0) return done(addLog(ctx, '繝医Λ繝・・譛ｪ驕ｸ謚・));
    const currentTrapsTTH = ctx.ownerState.field.signi_traps ?? [null, null, null];
    const newTrapsTTH2 = currentTrapsTTH.map(t => (t && selectedTTH.includes(t) ? null : t)) as (string | null)[];
    const newOwnerTTH2 = { ...ctx.ownerState, hand: [...ctx.ownerState.hand, ...selectedTTH], field: { ...ctx.ownerState.field, signi_traps: newTrapsTTH2 } };
    return done(addLog({ ...ctx, ownerState: newOwnerTTH2 }, `繝医Λ繝・・${selectedTTH.length}譫壹ｒ謇区惆縺ｸ`));
  }
  // ACTIVATE_TRAP / ACTIVATE_TRAP_IN_FIELD: 繝医Λ繝・・繧定｡ｨ蜷代″縺ｫ縺励※TRAP_ICON蜉ｹ譫懊ｒ逋ｺ蜍・  if (stub.id === 'ACTIVATE_TRAP' || stub.id === 'ACTIVATE_TRAP_IN_FIELD') {
    const trapsAT: (string | null)[] = ctx.ownerState.field.signi_traps ?? [null, null, null];
    // lastProcessedCards縺ｫ謖・ｮ壹′縺ゅｌ縺ｰ縺昴・繝医Λ繝・・繧貞━蜈医√↑縺代ｌ縺ｰ譛蛻昴・繝医Λ繝・・
    const selectedAT = ctx.lastProcessedCards?.[0];
    let firstTrapIdxAT = selectedAT ? trapsAT.findIndex(t => t === selectedAT) : -1;
    if (firstTrapIdxAT < 0) firstTrapIdxAT = trapsAT.findIndex((t: string | null) => t !== null);
    if (firstTrapIdxAT < 0) return done(addLog(ctx, '繝医Λ繝・・縺ｪ縺・));
    const trapCardAT = trapsAT[firstTrapIdxAT]!;
    const newTrapsAT = [...trapsAT] as (string | null)[];
    newTrapsAT[firstTrapIdxAT] = null;
    // 繝医Λ繝・・繧ｫ繝ｼ繝峨ｒ繝医Λ繝・す繝･縺ｸ遘ｻ蜍輔＠縺溽憾諷九ｒ蝓ｺ轤ｹ縺ｫ
    const newOwnerAT = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, trapCardAT], field: { ...ctx.ownerState.field, signi_traps: newTrapsAT } };
    const loggedCtxAT = addLog({ ...ctx, ownerState: newOwnerAT, sourceCardNum: trapCardAT }, `繝医Λ繝・・逋ｺ蜍・ 繧ｾ繝ｼ繝ｳ${firstTrapIdxAT + 1}・・{ctx.cardMap.get(trapCardAT)?.CardName ?? trapCardAT}・荏);
    // TRAP_ICON蜉ｹ譫懊ｒ隗｣譫舌＠縺ｦ螳溯｡・    const trapDataAT = ctx.cardMap.get(trapCardAT);
    if (trapDataAT) {
      const trapEffsAT = parseCardEffects(trapDataAT);
      const trapIconEffAT = trapEffsAT.find(e => e.effectType === 'TRAP_ICON');
      if (trapIconEffAT) return exec(trapIconEffAT.action, loggedCtxAT);
    }
    return done(loggedCtxAT);
  }
  // SET_OPP_SIGNI_AS_TRAP: 逶ｸ謇九・繧ｷ繧ｰ繝・菴薙ｒ繝医Λ繝・・縺ｨ縺励※險ｭ鄂ｮ
  if (stub.id === 'SET_OPP_SIGNI_AS_TRAP') {
    const oppSigniCandsSSOSAT = (ctx.otherState.field.signi.map((s, zi) => s?.at(-1) ? { instId: s.at(-1)!, zi } : null).filter(Boolean)) as Array<{ instId: string; zi: number }>;
    if (oppSigniCandsSSOSAT.length === 0) return done(addLog(ctx, 'SET_OPP_SIGNI_AS_TRAP: 逶ｸ謇九す繧ｰ繝九↑縺・));
    return needsInteraction(addLog(ctx, '逶ｸ謇九・繧ｷ繧ｰ繝九ｒ驕ｸ謚橸ｼ医ヨ繝ｩ繝・・蛹厄ｼ・), {
      type: 'SELECT_TARGET',
      candidates: oppSigniCandsSSOSAT.map(x => x.instId),
      count: 1,
      optional: false,
      targetScope: 'opp_field',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_OPP_SIGNI_TO_TRAP' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_OPP_SIGNI_TO_TRAP: 驕ｸ謚槭＠縺溽嶌謇九す繧ｰ繝九ｒ繝医Λ繝・・繧ｾ繝ｼ繝ｳ縺ｸ
  if (stub.id === 'INTERNAL_OPP_SIGNI_TO_TRAP') {
    const targetIOSTT = ctx.lastProcessedCards?.[0] ?? null;
    if (!targetIOSTT) return done(addLog(ctx, 'INTERNAL_OPP_SIGNI_TO_TRAP: 蟇ｾ雎｡縺ｪ縺・));
    let zoneIdxIOSTT = -1;
    for (let zi = 0; zi < 3; zi++) {
      if ((ctx.otherState.field.signi[zi] ?? []).includes(targetIOSTT)) { zoneIdxIOSTT = zi; break; }
    }
    if (zoneIdxIOSTT < 0) return done(addLog(ctx, 'INTERNAL_OPP_SIGNI_TO_TRAP: 繧ｾ繝ｼ繝ｳ迚ｹ螳壼､ｱ謨・));
    const newOppSigniIOSTT = [...ctx.otherState.field.signi] as (string[] | null)[];
    newOppSigniIOSTT[zoneIdxIOSTT] = null;
    const newOppTrapsIOSTT = [...(ctx.otherState.field.signi_traps ?? [null, null, null])] as (string | null)[];
    const newOppTrashIOSTT = [...ctx.otherState.trash];
    if (newOppTrapsIOSTT[zoneIdxIOSTT]) newOppTrashIOSTT.push(newOppTrapsIOSTT[zoneIdxIOSTT]!);
    newOppTrapsIOSTT[zoneIdxIOSTT] = targetIOSTT;
    const newOtherIOSTT = { ...ctx.otherState, trash: newOppTrashIOSTT, field: { ...ctx.otherState.field, signi: newOppSigniIOSTT, signi_traps: newOppTrapsIOSTT } };
    return done(addLog({ ...ctx, otherState: newOtherIOSTT }, `逶ｸ謇九す繧ｰ繝銀・繝医Λ繝・・: 繧ｾ繝ｼ繝ｳ${zoneIdxIOSTT + 1}`));
  }
  // TRAP_TO_SIGNI_IF_ZONE_EMPTY: 縺薙・繧ｫ繝ｼ繝峨・繧ｾ繝ｼ繝ｳ縺ｫ繧ｷ繧ｰ繝九′縺ｪ縺・ｴ蜷医《igni_traps[zone]竊痴igni[zone]
  if (stub.id === 'TRAP_TO_SIGNI_IF_ZONE_EMPTY') {
    const srcCardTTSIZE = ctx.sourceCardNum ?? null;
    if (!srcCardTTSIZE) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: sourceCardNum縺ｪ縺・));
    let zoneIdxTTSIZE = -1;
    for (let zi = 0; zi < 3; zi++) {
      const trapsArr = ctx.ownerState.field.signi_traps ?? [null, null, null];
      if (trapsArr[zi] === srcCardTTSIZE || (ctx.ownerState.field.signi[zi] ?? []).includes(srcCardTTSIZE)) {
        zoneIdxTTSIZE = zi; break;
      }
    }
    if (zoneIdxTTSIZE < 0) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: 繧ｾ繝ｼ繝ｳ迚ｹ螳壼､ｱ謨・));
    if (ctx.ownerState.field.signi[zoneIdxTTSIZE]?.length) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: 繧ｾ繝ｼ繝ｳ縺ｫ繧ｷ繧ｰ繝九≠繧・));
    const trapCardTTSIZE = (ctx.ownerState.field.signi_traps ?? [])[zoneIdxTTSIZE];
    if (!trapCardTTSIZE) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: 繝医Λ繝・・縺ｪ縺・));
    const newSigniTTSIZE = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniTTSIZE[zoneIdxTTSIZE] = [trapCardTTSIZE];
    const newTrapsTTSIZE = [...(ctx.ownerState.field.signi_traps ?? [null, null, null])] as (string | null)[];
    newTrapsTTSIZE[zoneIdxTTSIZE] = null;
    const newOwnerTTSIZE = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniTTSIZE, signi_traps: newTrapsTTSIZE } };
    return done(addLog({ ...ctx, ownerState: newOwnerTTSIZE }, `繝医Λ繝・・竊偵す繧ｰ繝・ 繧ｾ繝ｼ繝ｳ${zoneIdxTTSIZE + 1}`));
  }
  // PLACE_TRAP_FROM_REVEALED: 蜑阪・LOOK_AND_REORDER縺ｧ蜈ｬ髢九＆繧後◆繝・ャ繧ｭ荳劾譫壹°繧峨ヨ繝ｩ繝・・險ｭ鄂ｮ
  if (stub.id === 'PLACE_TRAP_FROM_REVEALED') {
    const srcPTFR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPTFR = srcPTFR ? (srcPTFR.EffectText ?? '') + ' ' + (srcPTFR.BurstText ?? '') : '';
    const toHWPTFR = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 蜈ｬ髢区椢謨ｰ繧偵ユ繧ｭ繧ｹ繝医°繧芽ｧ｣譫撰ｼ医ョ繝輔か繝ｫ繝・譫夲ｼ・    const cntMPTFR = txtPTFR.match(/繧ｫ繝ｼ繝峨ｒ([・・・兔d]+)譫夊ｦ九ｋ/);
    const revealCountPTFR = cntMPTFR ? parseInt(toHWPTFR(cntMPTFR[1])) : 2;
    // 繝・ャ繧ｭ荳翫°繧牙・髢九き繝ｼ繝峨ｒ蜿門ｾ・    const topCardsPTFR = ctx.ownerState.deck.slice(0, revealCountPTFR);
    if (topCardsPTFR.length === 0) return done(addLog(ctx, 'PLACE_TRAP_FROM_REVEALED: 繝・ャ繧ｭ縺ｪ縺・));
    // 蜈ｬ髢九き繝ｼ繝峨ｒ繝・ャ繧ｭ縺九ｉ髯､蜴ｻ縺励◆迥ｶ諷九〒SEARCH繧呈署遉ｺ
    const deckWithoutPTFR = ctx.ownerState.deck.slice(revealCountPTFR);
    const ctxPTFR = { ...ctx, ownerState: { ...ctx.ownerState, deck: deckWithoutPTFR } };
    const noopPTFR: SequenceAction = { type: 'SEQUENCE', steps: [] };
    const contPTFR: StubAction = { type: 'STUB', id: 'INTERNAL_PTFR_CHOOSE_ZONE' };
    return needsInteraction(
      addLog(ctxPTFR, `繝・ャ繧ｭ蜈ｬ髢・{topCardsPTFR.length}譫壹°繧峨ヨ繝ｩ繝・・繧帝∈謚橸ｼ井ｻｻ諢擾ｼ荏),
      {
        type: 'SEARCH', visibleCards: topCardsPTFR, maxPick: 1,
        thenAction: noopPTFR as EffectAction,
        continuation: contPTFR as EffectAction,
        restDest: 'deck_bottom',  // 譛ｪ驕ｸ謚槭き繝ｼ繝峨・繝・ャ繧ｭ荳九∈
      },
    );
  }
  // INTERNAL_PTFR_CHOOSE_ZONE: PLACE_TRAP_FROM_REVEALED逕ｨ縺ｮ繧ｾ繝ｼ繝ｳ驕ｸ謚・  if (stub.id === 'INTERNAL_PTFR_CHOOSE_ZONE') {
    const selectedPTFR = ctx.lastProcessedCards?.[0];
    if (!selectedPTFR) return done(addLog(ctx, '繝医Λ繝・・險ｭ鄂ｮ繧ｹ繧ｭ繝・・・磯∈謚槭↑縺暦ｼ・));
    const zoneOptsPTFR = [0, 1, 2].map(zi => ({
      id: `ptfr_zone_${zi}`,
      label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ繝医Λ繝・・險ｭ鄂ｮ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(
      addLog({ ...ctx, lastProcessedCards: [selectedPTFR] },
        `${ctx.cardMap.get(selectedPTFR)?.CardName ?? selectedPTFR}繧偵ヨ繝ｩ繝・・縺ｨ縺励※繧ｾ繝ｼ繝ｳ驕ｸ謚杼),
      { type: 'CHOOSE', options: zoneOptsPTFR, count: 1 },
    );
  }
  // TRAP_OP: 繧ｽ繝ｼ繧ｹ繧ｫ繝ｼ繝峨・繝・く繧ｹ繝医↓蠢懊§縺ｦ謫堺ｽ懷愛螳・  if (stub.id === 'TRAP_OP') {
    const srcTRAPOP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTRAPOP = srcTRAPOP ? (srcTRAPOP.EffectText ?? '') + ' ' + (srcTRAPOP.BurstText ?? '') : '';
    // 繝医Λ繝・・繧｢繧､繧ｳ繝ｳ逋ｺ蜍包ｼ哂CTIVATE_TRAP縺ｨ蜷御ｸ繝ｭ繧ｸ繝・け・・arseCardEffects邨檎罰縺ｧTRAP_ICON螳溯｡鯉ｼ・    if (txtTRAPOP.includes('繝医Λ繝・・繧｢繧､繧ｳ繝ｳ') && (txtTRAPOP.includes('逋ｺ蜍・) || txtTRAPOP.includes('逋ｺ蜍輔＆縺帙ｋ'))) {
      const trapsIconAT: (string | null)[] = ctx.ownerState.field.signi_traps ?? [null, null, null];
      const firstIdxIconAT = trapsIconAT.findIndex((t: string | null) => t !== null);
      if (firstIdxIconAT < 0) return done(addLog(ctx, '繝医Λ繝・・縺ｪ縺暦ｼ医ヨ繝ｩ繝・・繧｢繧､繧ｳ繝ｳ逋ｺ蜍包ｼ・));
      const trapCardIconAT = trapsIconAT[firstIdxIconAT]!;
      const newTrapsIconAT = [...trapsIconAT] as (string | null)[];
      newTrapsIconAT[firstIdxIconAT] = null;
      const newOwnerIconAT = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, trapCardIconAT], field: { ...ctx.ownerState.field, signi_traps: newTrapsIconAT } };
      const loggedIconAT = addLog({ ...ctx, ownerState: newOwnerIconAT, sourceCardNum: trapCardIconAT }, `繝医Λ繝・・繧｢繧､繧ｳ繝ｳ逋ｺ蜍・ ${ctx.cardMap.get(trapCardIconAT)?.CardName ?? trapCardIconAT}`);
      const trapDataIconAT = ctx.cardMap.get(trapCardIconAT);
      if (trapDataIconAT) {
        const trapEffsIconAT = parseCardEffects(trapDataIconAT);
        const trapIconEffAT = trapEffsIconAT.find(e => e.effectType === 'TRAP_ICON');
        if (trapIconEffAT) return exec(trapIconEffAT.action, loggedIconAT);
      }
      return done(loggedIconAT);
    }
    if (txtTRAPOP.includes('繝医Λ繝・す繝･縺ｫ鄂ｮ縺・) || txtTRAPOP.includes('繝医Λ繝・す繝･縺ｸ鄂ｮ縺・)) {
      const trapsTO: (string | null)[] = ctx.ownerState.field.signi_traps ?? [null, null, null];
      const firstIdxTO = trapsTO.findIndex((t: string | null) => t !== null);
      if (firstIdxTO < 0) return done(addLog(ctx, '繝医Λ繝・・縺ｪ縺・));
      const trapCardTO = trapsTO[firstIdxTO]!;
      const newTrapsTO = [...trapsTO] as (string | null)[];
      newTrapsTO[firstIdxTO] = null;
      const newOwnerTO = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, trapCardTO], field: { ...ctx.ownerState.field, signi_traps: newTrapsTO } };
      return done(addLog({ ...ctx, ownerState: newOwnerTO }, `繝医Λ繝・・繧偵ヨ繝ｩ繝・す繝･縺ｸ`));
    }
    if (txtTRAPOP.includes('謇区惆縺九ｉ') && (txtTRAPOP.includes('險ｭ鄂ｮ') || txtTRAPOP.includes('繝医Λ繝・・'))) {
      if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '繝医Λ繝・・險ｭ鄂ｮ・壽焔譛ｭ縺ｪ縺・));
      const zoneOptsTRAPOP = [0, 1, 2].map(zi => ({
        id: `zone_${zi}`,
        label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ險ｭ鄂ｮ`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, '繝医Λ繝・・縺ｫ縺吶ｋ繧ｫ繝ｼ繝峨ｒ驕ｸ謚・), {
        type: 'SELECT_TARGET',
        candidates: ctx.ownerState.hand,
        count: 1,
        optional: false,
        targetScope: 'self_hand',
        thenAction: ({ type: 'STUB', id: 'CHOOSE_TRAP_ZONE' } as StubAction) as EffectAction,
        continuation: ({ type: 'CHOOSE', choose_count: 1, from_count: 3, choices: zoneOptsTRAPOP.map(o => ({ choiceId: o.id, label: o.label, action: o.action })) } as ChooseAction) as EffectAction,
      });
    }
    // 縲後◎縺ｮ荳ｭ縺九ｉ縲阪ヱ繧ｿ繝ｼ繝ｳ: lastProcessedCards縺ｮ繧ｫ繝ｼ繝峨ｒ繝医Λ繝・・縺ｨ縺励※險ｭ鄂ｮ
    if (ctx.lastProcessedCards?.length) {
      const zoneOptsTRAPOP3 = [0, 1, 2].map(zi => ({
        id: `trapop3_zone_${zi}`,
        label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ繝医Λ繝・・險ｭ鄂ｮ`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, `${ctx.cardMap.get(ctx.lastProcessedCards[0])?.CardName ?? ctx.lastProcessedCards[0]}繧偵ヨ繝ｩ繝・・縺ｨ縺励※險ｭ鄂ｮ縺吶ｋ繧ｾ繝ｼ繝ｳ繧帝∈謚杼), {
        type: 'CHOOSE', options: zoneOptsTRAPOP3, count: 1,
      });
    }
    return done(addLog(ctx, '[繝医Λ繝・・謫堺ｽ彎'));
  }
  // TRAP_OPERATION: 繝医Λ繝・・/繝√ぉ繝・け繧ｾ繝ｼ繝ｳ謫堺ｽ懊・邨ｱ蜷医ワ繝ｳ繝峨Λ
  if (stub.id === 'TRAP_OPERATION') {
    const srcTRAPOPER = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTRAPOPER = srcTRAPOPER ? (srcTRAPOPER.EffectText ?? '') + ' ' + (srcTRAPOPER.BurstText ?? '') : '';
    // 繝√ぉ繝・け繧ｾ繝ｼ繝ｳ縺ｫ鄂ｮ縺・ lastProcessedCards[0] 繧・field.check 縺ｫ險ｭ鄂ｮ
    if (txtTRAPOPER.includes('繝√ぉ繝・け繧ｾ繝ｼ繝ｳ縺ｫ鄂ｮ') || txtTRAPOPER.includes('繝√ぉ繝・け繧ｾ繝ｼ繝ｳ縺ｸ')) {
      const cardToCheckTO = ctx.lastProcessedCards?.[0] ?? (ctx.ownerState.deck.length > 0 ? ctx.ownerState.deck[0] : null);
      if (!cardToCheckTO) return done(addLog(ctx, '[繝√ぉ繝・け繧ｾ繝ｼ繝ｳ・壼ｯｾ雎｡繧ｫ繝ｼ繝峨↑縺余'));
      const newDeckCKTO = ctx.ownerState.deck[0] === cardToCheckTO ? ctx.ownerState.deck.slice(1) : ctx.ownerState.deck;
      const newHandCKTO = ctx.ownerState.hand.filter(c => c !== cardToCheckTO);
      const newOwnerCKTO = { ...ctx.ownerState, deck: newDeckCKTO, hand: newHandCKTO, field: { ...ctx.ownerState.field, check: cardToCheckTO } };
      return done(addLog({ ...ctx, ownerState: newOwnerCKTO }, `${ctx.cardMap.get(cardToCheckTO)?.CardName ?? cardToCheckTO}繧偵メ繧ｧ繝・け繧ｾ繝ｼ繝ｳ縺ｸ`));
    }
    const cardToTrapTO = ctx.lastProcessedCards?.[0];
    if (cardToTrapTO) {
      // lastProcessedCards[0] 繧偵ヨ繝ｩ繝・・縺ｨ縺励※險ｭ鄂ｮ・医だ繝ｼ繝ｳ驕ｸ謚橸ｼ・      const zoneOptsTRAPOP = [0, 1, 2].map(zi => ({
        id: `trapop_zone_${zi}`,
        label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ繝医Λ繝・・險ｭ鄂ｮ`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(
        addLog({ ...ctx, lastProcessedCards: [cardToTrapTO] }, `${ctx.cardMap.get(cardToTrapTO)?.CardName ?? cardToTrapTO}繧偵ヨ繝ｩ繝・・縺ｨ縺励※險ｭ鄂ｮ`),
        { type: 'CHOOSE', options: zoneOptsTRAPOP, count: 1 }
      );
    }
    // lastProcessedCards縺ｪ縺暦ｼ壹ョ繝・く荳・譫壹ｒ謇区惆縺ｫ蜉縺医ｋ・医ョ繝・く荳顔｢ｺ隱榊ｾ後・繝医Λ繝・・險ｭ鄂ｮ縺悟､壹＞・・    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, '[繝医Λ繝・・謫堺ｽ懶ｼ壹ョ繝・く縺ｪ縺余'));
    const topCardTO = ctx.ownerState.deck[0];
    const newDeckTO = ctx.ownerState.deck.slice(1);
    const newOwnerTO = { ...ctx.ownerState, deck: newDeckTO };
    const zoneOptsTRAPOP2 = [0, 1, 2].map(zi => ({
      id: `trapop2_zone_${zi}`,
      label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ繝医Λ繝・・險ｭ鄂ｮ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    zoneOptsTRAPOP2.push({
      id: 'trapop2_skip', label: '繧ｹ繧ｭ繝・・・域焔譛ｭ縺ｫ蜉縺医ｋ・・,
      action: ({ type: 'ADD_TO_HAND', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } as unknown) as EffectAction,
      available: true,
    });
    return needsInteraction(
      addLog({ ...ctx, ownerState: newOwnerTO, lastProcessedCards: [topCardTO] },
        `繝・ャ繧ｭ荳・{ctx.cardMap.get(topCardTO)?.CardName ?? topCardTO}・壹ヨ繝ｩ繝・・險ｭ鄂ｮ・歔),
      { type: 'CHOOSE', options: zoneOptsTRAPOP2, count: 1 }
    );
  }
  // 笏笏笏 繧ｷ繝ｼ繝臥ｳｻ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
  // PLACE_SEED_FROM_REVEALED: 繝・ャ繧ｭ荳・譫壹ｒ隕九※1譫壹ｒ縲舌す繝ｼ繝峨代→縺励※險ｭ鄂ｮ
  if (stub.id === 'PLACE_SEED_FROM_REVEALED') {
    const topCardsPSFR = ctx.ownerState.deck.slice(0, 4);
    if (topCardsPSFR.length === 0) return done(addLog(ctx, 'PLACE_SEED_FROM_REVEALED: 繝・ャ繧ｭ縺ｪ縺・));
    return needsInteraction(addLog(ctx, '縲舌す繝ｼ繝峨代→縺励※險ｭ鄂ｮ縺吶ｋ繧ｫ繝ｼ繝峨ｒ驕ｸ謚橸ｼ井ｻｻ諢擾ｼ・), {
      type: 'SEARCH',
      visibleCards: topCardsPSFR,
      maxPick: 1,
      thenAction: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction,
      continuation: ({ type: 'STUB', id: 'INTERNAL_SEED_FROM_DECK' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_SEED_FROM_DECK: SEARCH縺ｧ驕ｸ謚槭＠縺溘き繝ｼ繝峨ｒ繝・ャ繧ｭ縺九ｉ蜿悶ｊ蜃ｺ縺励※繧ｾ繝ｼ繝ｳ驕ｸ謚・  if (stub.id === 'INTERNAL_SEED_FROM_DECK') {
    const pickedISD = ctx.lastProcessedCards?.[0];
    if (!pickedISD) return done(addLog(ctx, '繧ｷ繝ｼ繝芽ｨｭ鄂ｮ・壽悴驕ｸ謚・));
    const newDeckISD = ctx.ownerState.deck.filter(c => c !== pickedISD);
    const newOwnerISD = { ...ctx.ownerState, deck: newDeckISD };
    const zoneOptsISD = [0, 1, 2].map(zi => ({
      id: `seed_zone_${zi}`,
      label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ繧ｷ繝ｼ繝芽ｨｭ鄂ｮ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerISD }, '繧ｷ繝ｼ繝芽ｨｭ鄂ｮ繧ｾ繝ｼ繝ｳ繧帝∈謚・), {
      type: 'CHOOSE', options: zoneOptsISD, count: 1,
    });
  }
  // INTERNAL_SET_SEED: lastProcessedCards[0]繧呈欠螳壹だ繝ｼ繝ｳ縺ｫ繧ｷ繝ｼ繝芽ｨｭ鄂ｮ
  if (stub.id === 'INTERNAL_SET_SEED') {
    const zoneIdxISS = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const seedCardISS = ctx.lastProcessedCards?.[0] ?? null;
    if (!seedCardISS) return done(addLog(ctx, '繧ｷ繝ｼ繝芽ｨｭ鄂ｮ・壼ｯｾ雎｡繧ｫ繝ｼ繝峨↑縺・));
    const currentSeedsISS = [...(ctx.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
    const newTrashISS = [...ctx.ownerState.trash];
    if (currentSeedsISS[zoneIdxISS]) newTrashISS.push(currentSeedsISS[zoneIdxISS]!);
    currentSeedsISS[zoneIdxISS] = seedCardISS;
    // 謇区惆縺ｫ縺ゅｌ縺ｰ謇区惆縺九ｉ繧る勁蜴ｻ・域焔譛ｭ縺九ｉ險ｭ鄂ｮ縺吶ｋ繧ｱ繝ｼ繧ｹ・・    const newHandISS = ctx.ownerState.hand.filter(c => c !== seedCardISS);
    const newOwnerISS = { ...ctx.ownerState, hand: newHandISS, trash: newTrashISS, field: { ...ctx.ownerState.field, signi_seeds: currentSeedsISS } };
    return done(addLog({ ...ctx, ownerState: newOwnerISS }, `繧ｷ繝ｼ繝芽ｨｭ鄂ｮ: 繧ｾ繝ｼ繝ｳ${zoneIdxISS + 1}`));
  }
  // SEED_BLOOM: 繧ｷ繝ｼ繝・譫夲ｼ医∪縺溘・螂ｽ縺阪↑譫壽焚・峨ｒ髢玖干縺吶ｋ
  // SEED_BLOOM_OPTIONAL: 莉ｻ諢上〒繧ｷ繝ｼ繝・譫壹ｒ髢玖干縺吶ｋ
  if (stub.id === 'SEED_BLOOM' || stub.id === 'SEED_BLOOM_OPTIONAL') {
    const seedsSB = ctx.ownerState.field.signi_seeds ?? [null, null, null];
    const availableZonesSB = [0, 1, 2].filter(zi => seedsSB[zi] !== null);
    if (availableZonesSB.length === 0) return done(addLog(ctx, '繧ｷ繝ｼ繝蛾幕闃ｱ・壹す繝ｼ繝峨↑縺・));
    // 縲悟･ｽ縺阪↑譫壽焚縲榊・髢玖干繝代ち繝ｼ繝ｳ
    const srcSB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSB = srcSB ? (srcSB.EffectText ?? '') + ' ' + (srcSB.BurstText ?? '') : '';
    if (txtSB.includes('螂ｽ縺阪↑譫壽焚')) {
      let curSB = ctx;
      const bloomedCardsSB: string[] = [];
      for (const zi of [0, 1, 2]) {
        const s = (curSB.ownerState.field.signi_seeds ?? [null, null, null])[zi];
        if (!s) continue;
        if (curSB.ownerState.field.signi[zi]?.length) { curSB = addLog(curSB, `髢玖干・壹だ繝ｼ繝ｳ${zi + 1}繧ｷ繧ｰ繝九≠繧柿); continue; }
        const sd = curSB.cardMap.get(s);
        const newSeeds2 = [...(curSB.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
        newSeeds2[zi] = null;
        if (!sd || sd.Type !== '繧ｷ繧ｰ繝・) {
          curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, trash: [...curSB.ownerState.trash, s], field: { ...curSB.ownerState.field, signi_seeds: newSeeds2 } } }, `髢玖干・壹す繧ｰ繝倶ｻ･螟問・繝医Λ繝・す繝･`);
          continue;
        }
        const lrigInst2 = curSB.ownerState.field.lrig.at(-1);
        const lrigCard2 = lrigInst2 ? curSB.cardMap.get(lrigInst2) : null;
        const lrigLv2 = parseInt(lrigCard2?.Level ?? '0', 10);
        const signiLv2 = parseInt(sd.Level ?? '0', 10);
        if (signiLv2 > lrigLv2) {
          curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, trash: [...curSB.ownerState.trash, s], field: { ...curSB.ownerState.field, signi_seeds: newSeeds2 } } }, `髢玖干・・{sd.CardName}繝ｬ繝吶Ν雜・℃竊偵ヨ繝ｩ繝・す繝･`);
          continue;
        }
        const lrigLim2 = parseInt(lrigCard2?.Limit ?? '0', 10);
        let usedLim2 = 0;
        for (let zj = 0; zj < 3; zj++) { if (zj !== zi) { const top2 = curSB.ownerState.field.signi[zj]?.at(-1); if (top2) usedLim2 += parseInt(curSB.cardMap.get(top2)?.Level ?? '0', 10); } }
        if (usedLim2 + signiLv2 > lrigLim2) {
          curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, trash: [...curSB.ownerState.trash, s], field: { ...curSB.ownerState.field, signi_seeds: newSeeds2 } } }, `髢玖干・・{sd.CardName}繝ｪ繝溘ャ繝郁ｶ・℃竊偵ヨ繝ｩ繝・す繝･`);
          continue;
        }
        const newSig2 = [...curSB.ownerState.field.signi] as (string[] | null)[];
        newSig2[zi] = [s];
        bloomedCardsSB.push(s);
        curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, field: { ...curSB.ownerState.field, signi: newSig2, signi_seeds: newSeeds2 } } }, `髢玖干・・{sd.CardName}縺後だ繝ｼ繝ｳ${zi + 1}縺ｫ蜃ｺ縺歔);
      }
      const doneAllSB = done(curSB) as { done: true; ownerState: PlayerState; otherState: PlayerState; logs: string[] };
      return bloomedCardsSB.length > 0 ? { ...doneAllSB, lastProcessedCards: bloomedCardsSB } : doneAllSB;
    }
    const optional = stub.id === 'SEED_BLOOM_OPTIONAL';
    const zoneOptsSB = availableZonesSB.map(zi => {
      const seedName = ctx.cardMap.get(seedsSB[zi]!)?.CardName ?? seedsSB[zi]!;
      return {
        id: `bloom_zone_${zi}`,
        label: `繧ｾ繝ｼ繝ｳ${zi + 1}・・{seedName}・峨ｒ髢玖干`,
        action: ({ type: 'STUB', id: 'INTERNAL_BLOOM_SEED', value: zi } as StubAction) as EffectAction,
        available: true,
      };
    });
    if (optional) {
      zoneOptsSB.push({ id: 'bloom_skip', label: '繧ｹ繧ｭ繝・・', action: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction, available: true });
    }
    return needsInteraction(addLog(ctx, '髢玖干縺吶ｋ繧ｷ繝ｼ繝峨ｒ驕ｸ謚・), {
      type: 'CHOOSE', options: zoneOptsSB, count: 1,
    });
  }
  // INTERNAL_BLOOM_SEED: 謖・ｮ壹だ繝ｼ繝ｳ縺ｮ繧ｷ繝ｼ繝峨ｒ髢玖干縺吶ｋ
  if (stub.id === 'INTERNAL_BLOOM_SEED') {
    const zoneIdxIBS = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const seedCardIBS = (ctx.ownerState.field.signi_seeds ?? [null, null, null])[zoneIdxIBS];
    if (!seedCardIBS) return done(addLog(ctx, `髢玖干・壹だ繝ｼ繝ｳ${zoneIdxIBS + 1}縺ｫ繧ｷ繝ｼ繝峨↑縺輿));
    const newSeedsIBS = [...(ctx.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
    newSeedsIBS[zoneIdxIBS] = null;
    // 蜷後だ繝ｼ繝ｳ縺ｫ繧ｷ繧ｰ繝九′縺ゅｋ蝣ｴ蜷医・髢玖干縺励↑縺・    const signiStackIBS = ctx.ownerState.field.signi[zoneIdxIBS];
    if (signiStackIBS?.length) {
      const newOwnerSkip = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerSkip }, `髢玖干・壹だ繝ｼ繝ｳ${zoneIdxIBS + 1}縺ｫ繧ｷ繧ｰ繝九≠繧奇ｼ磯幕闃ｱ荳榊庄・荏));
    }
    const seedCardDataIBS = ctx.cardMap.get(seedCardIBS);
    // 繧ｷ繧ｰ繝倶ｻ･螟悶・繝医Λ繝・す繝･縺ｸ
    if (!seedCardDataIBS || seedCardDataIBS.Type !== '繧ｷ繧ｰ繝・) {
      const newOwnerIBS = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, seedCardIBS], field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerIBS }, `髢玖干・壹す繧ｰ繝九〒縺ｪ縺・◆繧√ヨ繝ｩ繝・す繝･縺ｸ`));
    }
    // 繝ｫ繝ｪ繧ｰ繝ｬ繝吶Ν繝√ぉ繝・け
    const lrigInstIBS = ctx.ownerState.field.lrig.at(-1);
    const lrigCardIBS = lrigInstIBS ? ctx.cardMap.get(lrigInstIBS) : null;
    const lrigLevelIBS = parseInt(lrigCardIBS?.Level ?? '0', 10);
    const signiLevelIBS = parseInt(seedCardDataIBS.Level ?? '0', 10);
    if (signiLevelIBS > lrigLevelIBS) {
      const newOwnerIBS = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, seedCardIBS], field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerIBS }, `髢玖干・・{seedCardDataIBS.CardName}繝ｬ繝吶Ν${signiLevelIBS}雜・℃縺ｧ繝医Λ繝・す繝･縺ｸ`));
    }
    // 繝ｪ繝溘ャ繝医メ繧ｧ繝・け・井ｻ悶だ繝ｼ繝ｳ縺ｮ繧ｷ繧ｰ繝九Ξ繝吶Ν蜷郁ｨ・+ 縺薙・繧ｷ繧ｰ繝九・繝ｬ繝吶Ν > 繝ｫ繝ｪ繧ｰ縺ｮ繝ｪ繝溘ャ繝茨ｼ・    const lrigLimitIBS = parseInt(lrigCardIBS?.Limit ?? '0', 10);
    let usedLimitIBS = 0;
    for (let zi = 0; zi < 3; zi++) {
      if (zi === zoneIdxIBS) continue;
      const topInstZI = ctx.ownerState.field.signi[zi]?.at(-1);
      if (topInstZI) usedLimitIBS += parseInt(ctx.cardMap.get(topInstZI)?.Level ?? '0', 10);
    }
    if (usedLimitIBS + signiLevelIBS > lrigLimitIBS) {
      const newOwnerIBS = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, seedCardIBS], field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerIBS }, `髢玖干・・{seedCardDataIBS.CardName}繝ｪ繝溘ャ繝郁ｶ・℃縺ｧ繝医Λ繝・す繝･縺ｸ`));
    }
    // 蝣ｴ縺ｫ蜃ｺ縺吶ＭastProcessedCards 縺ｫ繧ｻ繝・ヨ縺・BattleScreen 縺・ON_PLAY 蜉ｹ譫懊ｒ遨阪・
    const newSigniIBS = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniIBS[zoneIdxIBS] = [seedCardIBS];
    const newOwnerIBS = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniIBS, signi_seeds: newSeedsIBS } };
    const doneCtxIBS = addLog({ ...ctx, ownerState: newOwnerIBS }, `髢玖干・・{seedCardDataIBS.CardName}縺後だ繝ｼ繝ｳ${zoneIdxIBS + 1}縺ｫ蜃ｺ縺歔);
    return { ...(done(doneCtxIBS) as { done: true; ownerState: PlayerState; otherState: PlayerState; logs: string[] }), lastProcessedCards: [seedCardIBS] };
  }
  // SEED_HAND_AND_BLOOM_FROM_DECK_TOP: 繧ｷ繝ｼ繝・譫壹ｒ謇区惆縺ｫ蜉縺医√ョ繝・く荳翫ｒ繧ｷ繝ｼ繝芽ｨｭ鄂ｮ
  if (stub.id === 'SEED_HAND_AND_BLOOM_FROM_DECK_TOP') {
    const seedsSHAB = ctx.ownerState.field.signi_seeds ?? [null, null, null];
    const availSHAB = [0, 1, 2].filter(zi => seedsSHAB[zi] !== null);
    if (availSHAB.length === 0) return done(addLog(ctx, 'SEED_HAND_AND_BLOOM_FROM_DECK_TOP: 繧ｷ繝ｼ繝峨↑縺・));
    const optsSHAB = availSHAB.map(zi => {
      const seedName = ctx.cardMap.get(seedsSHAB[zi]!)?.CardName ?? seedsSHAB[zi]!;
      return {
        id: `shabfdt_${zi}`,
        label: `繧ｾ繝ｼ繝ｳ${zi + 1}・・{seedName}・峨ｒ謇区惆縺ｫ`,
        action: ({ type: 'STUB', id: 'INTERNAL_SEED_TO_HAND_THEN_DECK_TOP', value: zi } as StubAction) as EffectAction,
        available: true,
      };
    });
    return needsInteraction(addLog(ctx, '謇区惆縺ｫ蜉縺医ｋ繧ｷ繝ｼ繝峨ｒ驕ｸ謚・), {
      type: 'CHOOSE', options: optsSHAB, count: 1,
    });
  }
  // INTERNAL_SEED_TO_HAND_THEN_DECK_TOP: 謖・ｮ壹だ繝ｼ繝ｳ縺ｮ繧ｷ繝ｼ繝峨ｒ謇区惆縺ｫ蜉縺医※繝・ャ繧ｭ荳翫ｒ繧ｷ繝ｼ繝芽ｨｭ鄂ｮ
  if (stub.id === 'INTERNAL_SEED_TO_HAND_THEN_DECK_TOP') {
    const zoneIdxISTH = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const seedsISTH = [...(ctx.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
    const seedCardISTH = seedsISTH[zoneIdxISTH];
    if (!seedCardISTH) return done(addLog(ctx, 'INTERNAL_SEED_TO_HAND_THEN_DECK_TOP: 繧ｷ繝ｼ繝峨↑縺・));
    seedsISTH[zoneIdxISTH] = null;
    const newHandISTH = [...ctx.ownerState.hand, seedCardISTH];
    let newOwnerISTH = { ...ctx.ownerState, hand: newHandISTH, field: { ...ctx.ownerState.field, signi_seeds: seedsISTH } };
    if (newOwnerISTH.deck.length === 0) return done(addLog({ ...ctx, ownerState: newOwnerISTH }, `${ctx.cardMap.get(seedCardISTH)?.CardName}繧呈焔譛ｭ縺ｸ繝ｻ繝・ャ繧ｭ縺ｪ縺輿));
    const topCardISTH = newOwnerISTH.deck[0];
    const newDeckISTH = newOwnerISTH.deck.slice(1);
    newOwnerISTH = { ...newOwnerISTH, deck: newDeckISTH };
    const zoneOptsISTH = [0, 1, 2].map(zi => ({
      id: `isth_zone_${zi}`,
      label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ繧ｷ繝ｼ繝芽ｨｭ鄂ｮ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerISTH, lastProcessedCards: [topCardISTH] }, `繝・ャ繧ｭ荳・{ctx.cardMap.get(topCardISTH)?.CardName ?? topCardISTH}繧偵す繝ｼ繝芽ｨｭ鄂ｮ`), {
      type: 'CHOOSE', options: zoneOptsISTH, count: 1,
    });
  }
  // SEED_FLOWER_OP: 蛻･繧ｷ繝ｼ繝・譫壹ｒ髢玖干縺励※繝・ャ繧ｭ荳翫ｒ繧ｷ繝ｼ繝芽ｨｭ鄂ｮ・医Ζ繝槭Ξ繝ｳ繧ｲ邉ｻ・・  if (stub.id === 'SEED_FLOWER_OP') {
    const seedsSFO = ctx.ownerState.field.signi_seeds ?? [null, null, null];
    const availSFO = [0, 1, 2].filter(zi => seedsSFO[zi] !== null);
    if (availSFO.length === 0) return done(addLog(ctx, 'SEED_FLOWER_OP: 繧ｷ繝ｼ繝峨↑縺・));
    const optsSFO = availSFO.map(zi => {
      const seedName = ctx.cardMap.get(seedsSFO[zi]!)?.CardName ?? seedsSFO[zi]!;
      return {
        id: `sfo_zone_${zi}`,
        label: `繧ｾ繝ｼ繝ｳ${zi + 1}・・{seedName}・峨ｒ髢玖干`,
        // 髢玖干縺励※縺九ｉ繝・ャ繧ｭ荳翫ｒ繧ｷ繝ｼ繝芽ｨｭ鄂ｮ
        action: ({ type: 'SEQUENCE', steps: [
          { type: 'STUB', id: 'INTERNAL_BLOOM_SEED', value: zi } as StubAction,
          { type: 'STUB', id: 'INTERNAL_SEED_FROM_DECK_TOP_PLACE' } as StubAction,
        ] } as SequenceAction) as EffectAction,
        available: true,
      };
    });
    return needsInteraction(addLog(ctx, '髢玖干縺吶ｋ繧ｷ繝ｼ繝峨ｒ驕ｸ謚橸ｼ医Ζ繝槭Ξ繝ｳ繧ｲ蜉ｹ譫懶ｼ・), {
      type: 'CHOOSE', options: optsSFO, count: 1,
    });
  }
  // INTERNAL_SEED_FROM_DECK_TOP_PLACE: 繝・ャ繧ｭ荳・譫壹ｒ繧ｷ繝ｼ繝峨→縺励※險ｭ鄂ｮ
  if (stub.id === 'INTERNAL_SEED_FROM_DECK_TOP_PLACE') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'INTERNAL_SEED_FROM_DECK_TOP_PLACE: 繝・ャ繧ｭ縺ｪ縺・));
    const topCardSFDTP = ctx.ownerState.deck[0];
    const newDeckSFDTP = ctx.ownerState.deck.slice(1);
    const newOwnerSFDTP = { ...ctx.ownerState, deck: newDeckSFDTP };
    const zoneOptsSFDTP = [0, 1, 2].map(zi => ({
      id: `sfdtp_zone_${zi}`,
      label: `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ繧ｷ繝ｼ繝芽ｨｭ鄂ｮ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerSFDTP, lastProcessedCards: [topCardSFDTP] }, `繝・ャ繧ｭ荳・{ctx.cardMap.get(topCardSFDTP)?.CardName ?? topCardSFDTP}繧偵す繝ｼ繝芽ｨｭ鄂ｮ`), {
      type: 'CHOOSE', options: zoneOptsSFDTP, count: 1,
    });
  }
  // BLOOM_CHOOSE: 髢玖干縺励◆縺ｨ縺埼∈謚槫柑譫懶ｼ亥句挨蜉ｹ譫懊ユ繧ｭ繧ｹ繝井ｾ晏ｭ假ｼ・  if (stub.id === 'BLOOM_CHOOSE') {
    return done(addLog(ctx, `[髢玖干譎る∈謚槫柑譫・ ${ctx.sourceCardNum}]`));
  }
  // 陬丞髄縺咲ｳｻ・・ace_down_signi + abilities_removed 縺ｧ霑台ｼｼ螳溯｣・ｸ医∩・・  // REMOVE_SIGNI_ZONE: 蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝九だ繝ｼ繝ｳ繧・縺､蜑企勁
  if (stub.id === 'REMOVE_SIGNI_ZONE') {
    // 蟇ｾ謌ｦ逶ｸ謇九・繧ｾ繝ｼ繝ｳ驕ｸ謚橸ｼ・HOOSE繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ・・    const oppZoneOptionsRSZ = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `逶ｸ謇九だ繝ｼ繝ｳ${zi + 1}繧貞炎髯､`,
      action: ({ type: 'STUB', id: 'INTERNAL_REMOVE_SIGNI_ZONE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '蜑企勁縺吶ｋ蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝九だ繝ｼ繝ｳ繧帝∈謚・), {
      type: 'CHOOSE', options: oppZoneOptionsRSZ, count: 1,
    });
  }
  // INTERNAL_REMOVE_SIGNI_ZONE: 驕ｸ謚槭＠縺溘だ繝ｼ繝ｳ繧貞炎髯､縺励※繧ｷ繧ｰ繝九ｒ繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'INTERNAL_REMOVE_SIGNI_ZONE') {
    const zoneIdxIRSZ = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const oppStackIRSZ = ctx.otherState.field.signi[zoneIdxIRSZ] ?? [];
    // 縺昴・繧ｾ繝ｼ繝ｳ縺ｮ繧ｷ繧ｰ繝九ｒ縺吶∋縺ｦ繝医Λ繝・す繝･縺ｸ
    let newOtherIRSZ = ctx.otherState;
    for (const cn of oppStackIRSZ) {
      const removed = removeFromField(cn, newOtherIRSZ);
      newOtherIRSZ = { ...removed, trash: [...removed.trash, cn] };
    }
    // 繧ｾ繝ｼ繝ｳ繧堤┌蜉ｹ蛹・    const newDisabledIRSZ = [...(newOtherIRSZ.disabled_signi_zones ?? [])];
    if (!newDisabledIRSZ.includes(zoneIdxIRSZ)) newDisabledIRSZ.push(zoneIdxIRSZ);
    newOtherIRSZ = { ...newOtherIRSZ, disabled_signi_zones: newDisabledIRSZ };
    return done(addLog({ ...ctx, otherState: newOtherIRSZ },
      `逶ｸ謇九だ繝ｼ繝ｳ${zoneIdxIRSZ + 1}繧貞炎髯､・・{oppStackIRSZ.length}菴薙ヨ繝ｩ繝・す繝･・荏));
  }
  // DESIGNATE_SIGNI_ZONE: 逶ｸ謇九す繧ｰ繝九だ繝ｼ繝ｳ繧・縺､謖・ｮ壹☆繧・  if (stub.id === 'DESIGNATE_SIGNI_ZONE') {
    const zoneOptsDSZ = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `繧ｾ繝ｼ繝ｳ${zi + 1}繧呈欠螳啻,
      action: ({ type: 'STUB', id: 'INTERNAL_DESIGNATE_ZONE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '謖・ｮ壹☆繧狗嶌謇九す繧ｰ繝九だ繝ｼ繝ｳ繧帝∈謚・), {
      type: 'CHOOSE', options: zoneOptsDSZ, count: 1,
    });
  }
  // INTERNAL_DESIGNATE_ZONE: 驕ｸ謚槭＠縺溘だ繝ｼ繝ｳ繧堤嶌謇鬼tate縺ｫ菫晏ｭ・  if (stub.id === 'INTERNAL_DESIGNATE_ZONE') {
    const zoneIdxIDZ = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const newOtherIDZ = { ...ctx.otherState, designated_zone: zoneIdxIDZ };
    return done(addLog({ ...ctx, otherState: newOtherIDZ }, `逶ｸ謇九だ繝ｼ繝ｳ${zoneIdxIDZ + 1}繧呈欠螳啻));
  }
  // BLOCK_OPP_ZONE_PLACEMENT: 謖・ｮ壹だ繝ｼ繝ｳ縺ｸ縺ｮ驟咲ｽｮ繧堤ｦ∵ｭ｢・・isabled_signi_zones 縺ｫ霑ｽ蜉・・  if (stub.id === 'BLOCK_OPP_ZONE_PLACEMENT') {
    const zoneIdxBOZP = ctx.otherState.designated_zone ?? 0;
    const currentDisabledBOZP = [...(ctx.otherState.disabled_signi_zones ?? [])];
    if (!currentDisabledBOZP.includes(zoneIdxBOZP)) currentDisabledBOZP.push(zoneIdxBOZP);
    const newOtherBOZP = { ...ctx.otherState, disabled_signi_zones: currentDisabledBOZP };
    return done(addLog({ ...ctx, otherState: newOtherBOZP }, `逶ｸ謇九だ繝ｼ繝ｳ${zoneIdxBOZP + 1}縺ｸ縺ｮ繧ｷ繧ｰ繝矩・鄂ｮ繧堤ｦ∵ｭ｢`));
  }
  // 繧｢繝ｼ繝・擅莉ｶ邉ｻ・・ngine: 繧｢繝ｼ繝・ｽｿ逕ｨ譚｡莉ｶ譛ｪ螳溯｣・ｼ・  if (stub.id === 'ARTS_IMMOVABLE' || stub.id === 'ARTS_EXTRA_COST_CONDITION' || stub.id === 'ACCE_COST_REDUCTION') {
    return done(addLog(ctx, `[繧｢繝ｼ繝・繧｢繧ｯ繧ｻ繧ｳ繧ｹ繝・ ${stub.id}]`));
  }
  // ARTS_USE_DISCARD_COLOR_HAND: 謇区惆縺九ｉ迚ｹ螳夊牡縺ｮ繧ｫ繝ｼ繝峨ｒ莉ｻ諢蒐譫壹∪縺ｧ謐ｨ縺ｦ縲√さ繧ｹ繝郁ｻｽ貂幢ｼ・PTIONAL_DISCARD_CLASS_SIGNI 縺ｮ濶ｲ迚茨ｼ・  if (stub.id === 'ARTS_USE_DISCARD_COLOR_HAND') {
    const srcAUDCH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtAUDCH = srcAUDCH ? (srcAUDCH.EffectText ?? '') + ' ' + (srcAUDCH.BurstText ?? '') : '';
    const toHWAUDCH = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const colorMatchAUDCH = txtAUDCH.match(/謇区惆縺九ｉ(逋ｽ|襍､|髱竹邱掃鮟・縺ｮ繧ｫ繝ｼ繝峨ｒ/);
    const targetColor = colorMatchAUDCH?.[1];
    const maxMAUDCH = txtAUDCH.match(/繧ｫ繝ｼ繝峨ｒ([・・・兔d]+)譫壹∪縺ｧ謐ｨ縺ｦ繧・);
    const maxAUDCH = maxMAUDCH ? parseInt(toHWAUDCH(maxMAUDCH[1])) : 3;
    const candsAUDCH = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return !targetColor || (c?.Color ?? '').includes(targetColor);
    });
    if (candsAUDCH.length === 0) return done(addLog(ctx, `謇区惆縺ｫ${targetColor ?? ''}繧ｫ繝ｼ繝峨↑縺暦ｼ・RTS_USE_DISCARD_COLOR_HAND・荏));
    const discardAction: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };
    return selectOrInteract(candsAUDCH, maxAUDCH, true, 'self_hand', discardAction as EffectAction, undefined, ctx);
  }
  // PLAY_SPELL_FREE_IGNORE_RESTRICTION: 謇区惆縺ｮ繧ｹ繝壹Ν繧偵さ繧ｹ繝医↑縺励・髯仙ｮ壽擅莉ｶ辟｡隕悶〒菴ｿ逕ｨ
  if (stub.id === 'PLAY_SPELL_FREE_IGNORE_RESTRICTION') {
    const cnPSFIR = ctx.lastProcessedCards?.[0];
    if (!cnPSFIR) {
      // 譛ｪ驕ｸ謚橸ｼ壽焔譛ｭ縺ｮ繧ｹ繝壹Ν繧・SELECT_TARGET 縺ｧ驕ｸ縺ｶ
      const srcPSFIR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
      const txtPSFIR = srcPSFIR ? (srcPSFIR.EffectText ?? '') + ' ' + (srcPSFIR.BurstText ?? '') : '';
      const toHWPSFIR = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const costLimitMPSFIR = txtPSFIR.match(/繧ｳ繧ｹ繝医・蜷郁ｨ医′([・・・兔d]+)莉･荳・);
      const costLimitPSFIR = costLimitMPSFIR ? parseInt(toHWPSFIR(costLimitMPSFIR[1])) : Infinity;
      const spellCandsPSFIR = ctx.ownerState.hand.filter(cn => {
        const c = ctx.cardMap.get(cn);
        if (!c || c.Type !== '繧ｹ繝壹Ν') return false;
        if (costLimitPSFIR < Infinity) {
          const costArr = Array.isArray(c.Cost) ? c.Cost : [];
          const totalCost = typeof c.Cost === 'string' ? parseInt(c.Cost) || 0 : costArr.length;
          if (totalCost > costLimitPSFIR) return false;
        }
        return true;
      });
      if (spellCandsPSFIR.length === 0) return done(addLog(ctx, '[PLAY_SPELL_FREE_IGNORE_RESTRICTION: 謇区惆縺ｫ蟇ｾ雎｡繧ｹ繝壹Ν縺ｪ縺余'));
      const contPSFIR: StubAction = { type: 'STUB', id: 'PLAY_SPELL_FREE_IGNORE_RESTRICTION' };
      return needsInteraction(addLog(ctx, '謇区惆縺ｮ繧ｹ繝壹Ν繧帝∈謚橸ｼ医さ繧ｹ繝医↑縺励・髯仙ｮ壽擅莉ｶ辟｡隕厄ｼ・), {
        type: 'SELECT_TARGET', candidates: spellCandsPSFIR, count: 1, optional: false,
        targetScope: 'self_hand', thenAction: contPSFIR as EffectAction,
      });
    }
    // 驕ｸ謚樊ｸ医∩・夐∈繧薙□繧ｹ繝壹Ν繧偵ヨ繝ｩ繝・す繝･縺ｸ遘ｻ蜍輔＠縺ｦ蜉ｹ譫懷ｮ溯｡・    const cardPSFIR = ctx.cardMap.get(cnPSFIR);
    if (!cardPSFIR) return done(addLog(ctx, '[PLAY_SPELL_FREE_IGNORE_RESTRICTION: 繧ｫ繝ｼ繝峨ョ繝ｼ繧ｿ縺ｪ縺余'));
    const effectsPSFIR = parseCardEffects(cardPSFIR);
    const mainEffPSFIR = effectsPSFIR.find(e =>
      e.effectType === 'ACTIVATED' || (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY'))
    );
    if (!mainEffPSFIR) return done(addLog(ctx, `[PLAY_SPELL_FREE_IGNORE_RESTRICTION: ${cardPSFIR.CardName}蜉ｹ譫懊↑縺余`));
    const statePSFIR = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, cnPSFIR],
      hand: ctx.ownerState.hand.filter(c => c !== cnPSFIR),
    };
    return exec(mainEffPSFIR.action,
      addLog({ ...ctx, ownerState: statePSFIR, sourceCardNum: cnPSFIR, lastProcessedCards: [] },
        `${cardPSFIR.CardName}繧偵さ繧ｹ繝医↑縺励・髯仙ｮ壽擅莉ｶ辟｡隕悶〒菴ｿ逕ｨ`));
  }
  // 繝輔Μ繝ｼ繝励Ξ繧､邉ｻ・嗟astProcessedCards[0] 縺ｮ繧ｫ繝ｼ繝峨ｒ繧ｳ繧ｹ繝医↑縺励〒繝励Ξ繧､
  if (stub.id === 'PLAY_FREE' || stub.id === 'CAST_FROM_OPP_TRASH'
      || stub.id === 'PLAY_SPELL_FROM_HAND' || stub.id === 'PLAY_SPELL_FROM_HAND_FREE'
      || stub.id === 'USE_SPELL_FROM_TRASH' || stub.id === 'PLAY_EFFECT_TARGET_CLASS_CHANGE') {
    const cnPF = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnPF) return done(addLog(ctx, '[繝輔Μ繝ｼ繝励Ξ繧､: 蟇ｾ雎｡繧ｫ繝ｼ繝峨↑縺余'));
    const cardPF = ctx.cardMap.get(cnPF);
    if (!cardPF) return done(addLog(ctx, '[繝輔Μ繝ｼ繝励Ξ繧､: 繧ｫ繝ｼ繝峨ョ繝ｼ繧ｿ縺ｪ縺余'));
    const effectsPF = parseCardEffects(cardPF);
    // 繧ｹ繝壹Ν繝ｻ繧｢繝ｼ繝・・荳ｻ蜉ｹ譫懶ｼ・CTIVATED/AUTO・峨ｒ螳溯｡・    const mainEffPF = effectsPF.find(e =>
      e.effectType === 'ACTIVATED' ||
      (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY'))
    );
    if (mainEffPF) {
      const newCtxPF = { ...ctx, sourceCardNum: cnPF };
      // 繧ｫ繝ｼ繝峨ｒ繝医Λ繝・す繝･/菴ｿ逕ｨ貂医∩縺ｸ遘ｻ蜍輔＠縺ｦ縺九ｉ蜉ｹ譫懷ｮ溯｡・      let stateAfterPF = ctx.ownerState;
      let otherAfterPF = ctx.otherState;
      if (stub.id === 'CAST_FROM_OPP_TRASH') {
        // 逶ｸ謇九ヨ繝ｩ繝・す繝･縺九ｉ繧ｫ繝ｼ繝峨ｒ髯､蜴ｻ縺励※閾ｪ繝医Λ繝・す繝･縺ｸ・井ｽｿ逕ｨ蠕鯉ｼ・        otherAfterPF = { ...otherAfterPF, trash: otherAfterPF.trash.filter(c => c !== cnPF) };
        if (cardPF.Type === '繧ｹ繝壹Ν') {
          stateAfterPF = { ...stateAfterPF, trash: [...stateAfterPF.trash, cnPF] };
        }
      } else if (cardPF.Type === '繧ｹ繝壹Ν') {
        stateAfterPF = { ...stateAfterPF, trash: [...stateAfterPF.trash, cnPF], hand: stateAfterPF.hand.filter(c => c !== cnPF) };
      }
      const execCtxPF = { ...newCtxPF, ownerState: stateAfterPF, otherState: otherAfterPF };
      const resPF = exec(mainEffPF.action, addLog(execCtxPF, `${cardPF.CardName}繧偵さ繧ｹ繝医↑縺励〒菴ｿ逕ｨ`));
      return resPF;
    }
    // 繧ｷ繧ｰ繝九・蝣ｴ縺ｫ蜃ｺ縺・    if (cardPF.Type === '繧ｷ繧ｰ繝・) {
      const addPF: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
      return exec(addPF, { ...ctx, lastProcessedCards: [cnPF] });
    }
    return done(addLog(ctx, `[繝輔Μ繝ｼ繝励Ξ繧､: ${cardPF.CardName} (蜉ｹ譫懷ｮ溯｡御ｸ榊庄)]`));
  }
  // REACTIVE_POWER_UP: 縺ゅ↑縺溘・蜉ｹ譫懊〒逶ｸ謇九す繧ｰ繝九・繝代Ρ繝ｼ縺梧ｸ帙▲縺溘→縺阪√◎縺ｮ蛻・□縺題・繧ｷ繧ｰ繝九・繝代Ρ繝ｼ繧剃ｸ翫￡繧・  if (stub.id === 'REACTIVE_POWER_UP') {
    const srcRPU = ctx.sourceCardNum;
    if (!srcRPU) return done(addLog(ctx, '[REACTIVE_POWER_UP: 繧ｽ繝ｼ繧ｹ縺ｪ縺余'));
    // 逶ｸ謇九す繧ｰ繝九・ temp_power_mods 縺ｮ繝槭う繝翫せ蛻・ｒ蜷郁ｨ茨ｼ医％縺ｮ繧ｿ繝ｼ繝ｳ縺ｫ蜉縺医ｉ繧後◆蜈ｨ繝槭う繝翫せ・・    const oppMods = ctx.otherState.temp_power_mods ?? [];
    const totalMinus = oppMods.reduce((acc, m) => acc + (m.delta < 0 ? -m.delta : 0), 0);
    if (totalMinus <= 0) return done(addLog(ctx, '繝ｪ繧｢繧ｯ繝・ぅ繝悶ヱ繝ｯ繝ｼ繧｢繝・・・夂嶌謇九ヱ繝ｯ繝ｼ繝槭う繝翫せ縺ｪ縺・));
    const selfMods = [...(ctx.ownerState.temp_power_mods ?? [])];
    selfMods.push({ cardNum: srcRPU, delta: totalMinus });
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: selfMods } },
      `繝ｪ繧｢繧ｯ繝・ぅ繝悶ヱ繝ｯ繝ｼ繧｢繝・・・・${totalMinus}・育嶌謇九・繧､繝翫せ蜷郁ｨ亥・・荏));
  }
  // POWER_MOD_DISTRIBUTE: 蜷郁ｨ医ヱ繝ｯ繝ｼ繧帝∈謚槭す繧ｰ繝九↓蝮・ｭ蛾・蛻・ｼ郁・蝣ｴ繧ｷ繧ｰ繝区怙螟ｧ3菴難ｼ・  if (stub.id === 'POWER_MOD_DISTRIBUTE') {
    const toHWPMD = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMD = srcPMD ? (srcPMD.EffectText ?? '') + ' ' + (srcPMD.BurstText ?? '') : '';
    const mPMD = txtPMD.match(/蜷医ｏ縺帙※[・・]([・・・兔d]+)/);
    const totalBoostPMD = mPMD ? parseInt(toHWPMD(mPMD[1])) : 20000;
    const existOwnPMD = (ctx.lastProcessedCards ?? []).filter(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (existOwnPMD.length > 0) {
      const perSigniPMD = Math.floor(totalBoostPMD / existOwnPMD.length / 1000) * 1000;
      const modsPMD = [...(ctx.ownerState.temp_power_mods ?? [])];
      for (const cn of existOwnPMD) modsPMD.push({ cardNum: cn, delta: perSigniPMD });
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPMD } },
        `${existOwnPMD.length}菴薙↓+${perSigniPMD}縺壹▽・亥粋險・${totalBoostPMD}驟榊・・荏));
    }
    const ownCandsPMD = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      return top ? [top] : [];
    });
    if (ownCandsPMD.length === 0) return done(addLog(ctx, '閾ｪ蝣ｴ縺ｫ繧ｷ繧ｰ繝九↑縺暦ｼ・OWER_MOD_DISTRIBUTE・・));
    const contPMD: StubAction = { type: 'STUB', id: 'POWER_MOD_DISTRIBUTE' };
    const noopPMD: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(ownCandsPMD, Math.min(ownCandsPMD.length, 3), false, 'self_field', noopPMD as EffectAction, contPMD as EffectAction, ctx);
  }
  // POWER_MOD_ON_FRONT_PLACE: 豁｣髱｢縺ｫ驟咲ｽｮ縺輔ｌ縺溽嶌謇九す繧ｰ繝九↓莉ｻ諢上〒-3000
  if (stub.id === 'POWER_MOD_ON_FRONT_PLACE') {
    const srcZonePMOP = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnPMOP = srcZonePMOP >= 0 ? ctx.otherState.field.signi[srcZonePMOP]?.at(-1) : undefined;
    if (!frontCnPMOP) return done(addLog(ctx, '豁｣髱｢繧ｷ繧ｰ繝九↑縺暦ｼ・OWER_MOD_ON_FRONT_PLACE・・));
    const applyPMOP: StubAction = { type: 'STUB', id: 'INTERNAL_PMOP_APPLY' };
    const skipPMOP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, `${ctx.cardMap.get(frontCnPMOP)?.CardName ?? frontCnPMOP}縺ｮ繝代Ρ繝ｼ繧抵ｼ・000縺励※繧ゅｈ縺Я), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'do',   label: '・・000縺吶ｋ',  action: applyPMOP as EffectAction, available: true },
        { id: 'skip', label: '縺励↑縺・,       action: skipPMOP as EffectAction,  available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_PMOP_APPLY') {
    const srcZoneIPMOP = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnIPMOP = srcZoneIPMOP >= 0 ? ctx.otherState.field.signi[srcZoneIPMOP]?.at(-1) : undefined;
    if (!frontCnIPMOP) return done(addLog(ctx, '豁｣髱｢繧ｷ繧ｰ繝九↑縺暦ｼ・NTERNAL_PMOP_APPLY・・));
    const modsIPMOP = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: frontCnIPMOP, delta: -3000 }];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIPMOP } },
      `${ctx.cardMap.get(frontCnIPMOP)?.CardName ?? frontCnIPMOP}縺ｮ繝代Ρ繝ｼ-3000`));
  }
  // POWER_MOD_DOUBLE_DIFF: 蟇ｾ雎｡繧ｷ繧ｰ繝九・蝓ｺ譛ｬ繝代Ρ繝ｼ縺ｨ閾ｪ蛻・・蝓ｺ譛ｬ繝代Ρ繝ｼ縺ｨ縺ｮ蟾ｮ縺ｮ2蛟阪〒繝槭う繝翫せ
  if (stub.id === 'POWER_MOD_DOUBLE_DIFF') {
    const targetNum = ctx.lastProcessedCards?.[0];
    if (!targetNum) return done(addLog(ctx, 'POWER_MOD_DOUBLE_DIFF: 蟇ｾ雎｡縺ｪ縺・));
    const pSelf = parseInt(String(ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum)?.Power ?? '0' : '0')) || 0;
    const pTarget = parseInt(String(ctx.cardMap.get(targetNum)?.Power ?? '0')) || 0;
    if (pTarget <= pSelf) return done(addLog(ctx, `POWER_MOD_DOUBLE_DIFF: 蟇ｾ雎｡繝代Ρ繝ｼ${pTarget}竕ｦ閾ｪ繝代Ρ繝ｼ${pSelf}縲∝柑譫懊↑縺輿));
    const delta = -(pTarget - pSelf) * 2;
    const mods = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: targetNum, delta }];
    const newOther = { ...ctx.otherState, temp_power_mods: mods };
    return done(addLog({ ...ctx, otherState: newOther }, `${ctx.cardMap.get(targetNum)?.CardName ?? targetNum}繝代Ρ繝ｼ${delta}`));
  }
  // 隍・尅繝代Ρ繝ｼ菫ｮ豁｣・・ngine: 繧ｳ繝ｳ繝・く繧ｹ繝・驟咲ｽｮ諠・ｱ蠢・ｦ・ｼ・  // CONDITIONAL_ALT_POWER_BOOST: 譚｡莉ｶ謌千ｫ区凾縺ｫ莉｣繧上ｊ縺ｫ繝代Ρ繝ｼ菫ｮ豁｣・・UTO/ACTIVATED: temp_power_mods・・  if (stub.id === 'CONDITIONAL_ALT_POWER_BOOST') {
    if (!ctx.sourceCardNum) return done(addLog(ctx, 'CONDITIONAL_ALT_POWER_BOOST: sourceCardNum荳肴・'));
    const srcCAPB = ctx.cardMap.get(ctx.sourceCardNum);
    const txtCAPB = srcCAPB ? (srcCAPB.EffectText ?? '') + ' ' + (srcCAPB.BurstText ?? '') : '';
    const toHWCAPB = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPosCAPB = txtCAPB.match(/莉｣繧上ｊ縺ｫ[・・]([・・・兔d]+)/);
    const mNegCAPB = !mPosCAPB && txtCAPB.match(/莉｣繧上ｊ縺ｫ[・・]([・・・兔d]+)/);
    const deltaCAPB = mPosCAPB ? parseInt(toHWCAPB(mPosCAPB[1]))
      : mNegCAPB ? -parseInt(toHWCAPB(mNegCAPB[1])) : 0;
    if (deltaCAPB === 0) return done(addLog(ctx, 'CONDITIONAL_ALT_POWER_BOOST: 蛟､荳肴・'));
    const modsCAPB = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaCAPB }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsCAPB } },
      `莉｣譖ｿ繝代Ρ繝ｼ菫ｮ豁｣: ${deltaCAPB > 0 ? '+' : ''}${deltaCAPB}`));
  }
  // 繝ｬ繝吶Ν菫ｮ豁｣・・ngine: 繝吶・繧ｹ繝ｬ繝吶Ν螟画峩繧ｷ繧ｹ繝・Β譛ｪ螳溯｣・ｼ・  if (stub.id === 'LEVEL_MOD_PER_COUNT') {
    return done(addLog(ctx, '[LEVEL_MOD_PER_COUNT: effectEngine縺ｧ蜃ｦ逅・'));
  }
  // SET_LEVEL_RANGE: 閾ｪ繧ｷ繧ｰ繝・菴薙ｒ驕ｸ繧薙〒繝ｬ繝吶Ν1・・縺ｫ螟画峩・医ち繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ・・  if (stub.id === 'SET_LEVEL_RANGE') {
    const targetSLR = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetSLR) {
      // Phase 2: 繝ｬ繝吶Ν驕ｸ謚・      const optsSLR = [1,2,3,4].map(lv => ({
        id: `lv_${lv}`, label: `繝ｬ繝吶Ν${lv}縺ｫ縺吶ｋ`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_LEVEL_RANGE', value: `${targetSLR}:${lv}` } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, '繝ｬ繝吶Ν繧帝∈謚橸ｼ・・・・・), { type: 'CHOOSE', options: optsSLR, count: 1 });
    }
    // Phase 1: 蟇ｾ雎｡繧ｷ繧ｰ繝矩∈謚・    const ownSigniSLR = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    if (ownSigniSLR.length === 0) return done(addLog(ctx, '蟇ｾ雎｡繧ｷ繧ｰ繝九↑縺暦ｼ・ET_LEVEL_RANGE・・));
    const noop: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const cont: StubAction = { type: 'STUB', id: 'SET_LEVEL_RANGE' };
    return needsInteraction(addLog(ctx, '繝ｬ繝吶Ν繧貞､画峩縺吶ｋ繧ｷ繧ｰ繝九ｒ驕ｸ謚・), {
      type: 'SELECT_TARGET', candidates: ownSigniSLR, count: 1, optional: false,
      targetScope: 'self_field', thenAction: noop as EffectAction, continuation: cont as EffectAction,
    });
  }
  if (stub.id === 'INTERNAL_SET_LEVEL_RANGE') {
    const valISLR = typeof stub.value === 'string' ? stub.value : '';
    const [tgtISLR, lvStrISLR] = valISLR.split(':');
    const lvISLR = parseInt(lvStrISLR);
    if (!tgtISLR || isNaN(lvISLR)) return done(addLog(ctx, '蠑墓焚荳肴ｭ｣・・NTERNAL_SET_LEVEL_RANGE・・));
    const overridesISLR = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [tgtISLR]: lvISLR };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: overridesISLR } },
      `${ctx.cardMap.get(tgtISLR)?.CardName ?? tgtISLR}縺ｮ蝓ｺ譛ｬ繝ｬ繝吶Ν繧・{lvISLR}縺ｫ螟画峩`));
  }
  // PREVENT_ZONE_MOVE_BY_OPP: CONTINUOUS竊団ollectProtectedZones蜍慕噪險育ｮ・/ AUTO竊恥revent_opp_trash_from繝輔Λ繧ｰ險ｭ鄂ｮ
  if (stub.id === 'PREVENT_ZONE_MOVE_BY_OPP') {
    const srcPZM = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPZM = srcPZM ? (srcPZM.EffectText ?? '') : '';
    const zones: ('hand' | 'energy')[] = [];
    if (txtPZM.includes('繧ｨ繝翫だ繝ｼ繝ｳ') && txtPZM.includes('繝医Λ繝・す繝･縺ｫ遘ｻ蜍輔＠縺ｪ縺・)) zones.push('energy');
    if (txtPZM.includes('謇区惆') && txtPZM.includes('繝医Λ繝・す繝･縺ｫ遘ｻ蜍輔＠縺ｪ縺・)) zones.push('hand');
    if (zones.length === 0) return done(addLog(ctx, '[PREVENT_ZONE_MOVE_BY_OPP: CONTINUOUS縺ｧ蜍慕噪蜃ｦ逅・ｸｭ]'));
    const existing = ctx.ownerState.prevent_opp_trash_from ?? [];
    const merged = [...new Set([...existing, ...zones])] as ('hand' | 'energy')[];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_opp_trash_from: merged } },
      `逶ｸ謇句柑譫懊↓繧医ｋ繝医Λ繝・す繝･遘ｻ蜍慕ｦ∵ｭ｢險ｭ鄂ｮ: ${zones.join(',')}`));
  }
  // PREVENT_SIGNI_DOWN_BY_OPP_ALL / PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP: 逶ｸ謇九↓繧医ｋ繧ｷ繧ｰ繝九ム繧ｦ繝ｳ髦ｲ豁｢
  if (stub.id === 'PREVENT_SIGNI_DOWN_BY_OPP_ALL' || stub.id === 'PREVENT_SELF_DOWN_BY_OPP'
      || stub.id === 'PREVENT_BOUNCE_AND_DOWN_BY_OPP') {
    const newOwnerPSD: PlayerState = { ...ctx.ownerState, prevent_signi_down_by_opp: true };
    return done(addLog({ ...ctx, ownerState: newOwnerPSD }, '逶ｸ謇九・閾ｪ繧ｷ繧ｰ繝九ｒ繝繧ｦ繝ｳ縺ｧ縺阪↑縺・));
  }
  // OPP_SIGNI_ATTACK_POWER_RESTRICT: 逶ｸ謇九す繧ｰ繝九い繧ｿ繝・け譎ゅヱ繝ｯ繝ｼ蛻ｶ髯・  if (stub.id === 'OPP_SIGNI_ATTACK_POWER_RESTRICT') {
    const srcOSAPR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOSAPR = srcOSAPR ? (srcOSAPR.EffectText ?? '') + ' ' + (srcOSAPR.BurstText ?? '') : '';
    const toHWOSAPR = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const capM = txtOSAPR.match(/繝代Ρ繝ｼ縺・[・・・兔d]+)莉･荳九・繧ｷ繧ｰ繝九・/);
    const cap = capM ? parseInt(toHWOSAPR(capM[1])) : 12000;
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, opp_signi_attack_power_cap: cap } },
      `逶ｸ謇九す繧ｰ繝九い繧ｿ繝・け譎ゅヱ繝ｯ繝ｼ荳企剞: ${cap}`));
  }
  // SIGNI_FLIP_FACEDOWN: 閾ｪ繧ｷ繧ｰ繝具ｼ医∪縺溘・逶ｸ謇詰astProcessed・峨ｒ陬丞髄縺阪↓縺吶ｋ
  if (stub.id === 'SIGNI_FLIP_FACEDOWN') {
    const srcSFD = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!srcSFD) return done(addLog(ctx, '陬丞髄縺・ 繧ｽ繝ｼ繧ｹ縺ｪ縺・));
    // 閾ｪ繝輔ぅ繝ｼ繝ｫ繝峨↓縺・ｌ縺ｰ ownerState縲∫嶌謇九ヵ繧｣繝ｼ繝ｫ繝峨↓縺・ｌ縺ｰ otherState 縺ｫ霑ｽ蜉
    const inOwnerSFD = ctx.ownerState.field.signi.some(s => s?.includes(srcSFD));
    if (inOwnerSFD) {
      const newFaceSFD = [...new Set([...(ctx.ownerState.face_down_signi ?? []), srcSFD])];
      const newAbilSFD = [...new Set([...(ctx.ownerState.abilities_removed ?? []), srcSFD])];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, face_down_signi: newFaceSFD, abilities_removed: newAbilSFD } },
        `${ctx.cardMap.get(srcSFD)?.CardName ?? srcSFD}繧定｣丞髄縺阪↓`));
    }
    const newFaceOppSFD = [...new Set([...(ctx.otherState.face_down_signi ?? []), srcSFD])];
    const newAbilOppSFD = [...new Set([...(ctx.otherState.abilities_removed ?? []), srcSFD])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, face_down_signi: newFaceOppSFD, abilities_removed: newAbilOppSFD } },
      `${ctx.cardMap.get(srcSFD)?.CardName ?? srcSFD}繧定｣丞髄縺阪↓`));
  }
  // FLIP_FACE_DOWN_SIGNI: 陬丞髄縺阪す繧ｰ繝九ｒ陦ｨ蜷代″縺ｫ謌ｻ縺呻ｼ・縺薙・譁ｹ豕輔〒陬丞髄縺阪↓縺励◆繧ｷ繧ｰ繝九ｒ陦ｨ蜷代″縺ｫ縺吶ｋ"・・  if (stub.id === 'FLIP_FACE_DOWN_SIGNI') {
    const faceDownFBSFD = ctx.ownerState.face_down_signi ?? [];
    const oppFaceDownFBSFD = ctx.otherState.face_down_signi ?? [];
    if (faceDownFBSFD.length === 0 && oppFaceDownFBSFD.length === 0) {
      return done(addLog(ctx, '陬丞髄縺阪す繧ｰ繝九↑縺暦ｼ・lip-back荳崎ｦ・ｼ・));
    }
    let newOwnerFBSFD = ctx.ownerState;
    let newOtherFBSFD = ctx.otherState;
    if (faceDownFBSFD.length > 0) {
      newOwnerFBSFD = {
        ...newOwnerFBSFD,
        face_down_signi: [],
        abilities_removed: (newOwnerFBSFD.abilities_removed ?? []).filter(cn => !faceDownFBSFD.includes(cn)),
      };
    }
    if (oppFaceDownFBSFD.length > 0) {
      newOtherFBSFD = {
        ...newOtherFBSFD,
        face_down_signi: [],
        abilities_removed: (newOtherFBSFD.abilities_removed ?? []).filter(cn => !oppFaceDownFBSFD.includes(cn)),
      };
    }
    return done(addLog({ ...ctx, ownerState: newOwnerFBSFD, otherState: newOtherFBSFD },
      `陬丞髄縺阪す繧ｰ繝・{faceDownFBSFD.length + oppFaceDownFBSFD.length}菴薙ｒ陦ｨ蜷代″縺ｫ`));
  }
  // FACE_DOWN_OPP_SIGNI: 逶ｸ謇九す繧ｰ繝九ｒ蟇ｾ雎｡驕ｸ謚樞・陬丞髄縺阪↓縺吶ｋ
  if (stub.id === 'FACE_DOWN_OPP_SIGNI') {
    // lastProcessedCards縺梧里縺ｫ縺ゅｋ蝣ｴ蜷医・縺昴ｌ繧剃ｽｿ逕ｨ・井ｻ亡TUB縺九ｉ騾｣骼厄ｼ・    const preselectedFDOS = ctx.lastProcessedCards?.[0];
    if (preselectedFDOS && ctx.otherState.field.signi.some(s => s?.at(-1) === preselectedFDOS)) {
      const newFaceFDOS = [...new Set([...(ctx.otherState.face_down_signi ?? []), preselectedFDOS])];
      const newAbilFDOS = [...new Set([...(ctx.otherState.abilities_removed ?? []), preselectedFDOS])];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, face_down_signi: newFaceFDOS, abilities_removed: newAbilFDOS } },
        `${ctx.cardMap.get(preselectedFDOS)?.CardName ?? preselectedFDOS}繧定｣丞髄縺阪↓`));
    }
    // 逶ｸ謇九す繧ｰ繝九ｒ驕ｸ謚・    const candsFDOS = fieldCandidates(ctx.otherState, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (candsFDOS.length === 0) return done(addLog(ctx, '陬丞髄縺榊ｯｾ雎｡縺ｪ縺暦ｼ育嶌謇九ヵ繧｣繝ｼ繝ｫ繝臥ｩｺ・・));
    const applyFDOS: StubAction = { type: 'STUB', id: 'FACE_DOWN_OPP_SIGNI' };
    return selectOrInteract(candsFDOS, 1, false, 'opp_field', applyFDOS as EffectAction, undefined, ctx);
  }
  // 菫晁ｭｷ繝ｻ遘ｻ蜍暮亟豁｢邉ｻ・・ngine: 蜷・亟豁｢繝輔Λ繧ｰ繧ｷ繧ｹ繝・Β譛ｪ螳溯｣・ｼ・  if (stub.id === 'PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH'
      || stub.id === 'PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH' || stub.id === 'PREVENT_NON_FIELD_MOVE_BY_OPP'
      || stub.id === 'PREVENT_OPP_SIGNI_ABILITY_GAIN'
      || stub.id === 'PREVENT_SIGNI_ABILITY_LOSS_BY_OPP' || stub.id === 'PREVENT_POWER_MINUS_BY_OPP'
      || stub.id === 'PREVENT_OPP_POWER_PLUS' || stub.id === 'PREVENT_ABILITY_CHANGE_BY_OPP'
      || stub.id === 'PREVENT_SIGNI_DOWN_BY_OPP' || stub.id === 'SUPPRESS_GAIN_ABILITY'
      || stub.id === 'PREVENT_INFECTED_SIGNI_ACTIVATE'
      || stub.id === 'SIGNI_CANT_BOUNCE_FROM_FIELD'
      || stub.id === 'SIGNI_PROTECT_MOVE_EXCEPT_ENERGY') {
    return done(addLog(ctx, `[菫晁ｭｷ蜉ｹ譫・ ${stub.id}]`));
  }
  // PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE: 谺｡縺ｮ逶ｸ謇帰TK繝輔ぉ繧､繧ｺ髢句ｧ区凾縲√％縺ｮ繧ｷ繧ｰ繝九・繧｢繧ｿ繝・け荳榊庄
  if (stub.id === 'PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE') {
    const srcPAUOAP = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!srcPAUOAP) return done(addLog(ctx, 'PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE: 蟇ｾ雎｡縺ｪ縺・));
    // 蟇ｾ雎｡繧ｷ繧ｰ繝九・繧ｪ繝ｼ繝翫・蛛ｴ縺ｮblocked_actions縺ｫATTACK:{cardId}繧定ｿｽ蜉
    const inOwnerPAUOAP = ctx.ownerState.field.signi.some(s => s?.includes(srcPAUOAP));
    if (inOwnerPAUOAP) {
      const newBlockedPAUOAP = [...(ctx.ownerState.blocked_actions ?? []), `ATTACK:${srcPAUOAP}`];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, blocked_actions: newBlockedPAUOAP } },
        `${ctx.cardMap.get(srcPAUOAP)?.CardName ?? srcPAUOAP}縺ｯ谺｡縺ｮ逶ｸ謇帰TK繝輔ぉ繧､繧ｺ荳ｭ繧｢繧ｿ繝・け荳榊庄`));
    }
    const newBlockedOtherPAUOAP = [...(ctx.otherState.blocked_actions ?? []), `ATTACK:${srcPAUOAP}`];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedOtherPAUOAP } },
      `${ctx.cardMap.get(srcPAUOAP)?.CardName ?? srcPAUOAP}縺ｯ谺｡縺ｮ逶ｸ謇帰TK繝輔ぉ繧､繧ｺ荳ｭ繧｢繧ｿ繝・け荳榊庄`));
  }
  // PREVENT_TARGET_LRIG_ATTACK_THIS_TURN: 縺薙・繧ｿ繝ｼ繝ｳ蟇ｾ雎｡繝ｫ繝ｪ繧ｰ縺ｮ繧｢繧ｿ繝・け繧帝亟縺・  if (stub.id === 'PREVENT_TARGET_LRIG_ATTACK_THIS_TURN') {
    const tgtPTLAT = ctx.lastProcessedCards?.[0]
      ?? ctx.otherState.field.lrig.at(-1);
    if (!tgtPTLAT) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ繧｢繧ｿ繝・け髦ｲ豁｢: 蟇ｾ雎｡縺ｪ縺・));
    const newNegatedPTLAT = [...new Set([...(ctx.otherState.negated_attacks ?? []), tgtPTLAT])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, negated_attacks: newNegatedPTLAT } },
      `${ctx.cardMap.get(tgtPTLAT)?.CardName ?? tgtPTLAT}縺ｯ縺薙・繧ｿ繝ｼ繝ｳ繧｢繧ｿ繝・け縺ｧ縺阪↑縺Я));
  }
  // INTERNAL_GRANT_NO_ATTACK_LRIG: CHOOSE_SAME_OPTION_TWICE縺九ｉ蜻ｼ縺ｰ繧後ｋ蜀・Κ繝上Φ繝峨Λ
  // 逶ｸ謇九そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｫ繧｢繧ｿ繝・け荳榊庄・・egated_attacks・峨ｒ莉倅ｸ・  if (stub.id === 'INTERNAL_GRANT_NO_ATTACK_LRIG') {
    const lrigIGNAL = ctx.otherState.field.lrig.at(-1);
    if (!lrigIGNAL) return done(addLog(ctx, 'INTERNAL_GRANT_NO_ATTACK_LRIG: 繝ｫ繝ｪ繧ｰ縺ｪ縺・));
    const newNegIGNAL = [...new Set([...(ctx.otherState.negated_attacks ?? []), lrigIGNAL])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, negated_attacks: newNegIGNAL } },
      `${ctx.cardMap.get(lrigIGNAL)?.CardName ?? lrigIGNAL}縺ｯ縺薙・繧ｿ繝ｼ繝ｳ繧｢繧ｿ繝・け縺ｧ縺阪↑縺Я));
  }
  // BLOCK_OPP_ENCORE_AND_BET: 逶ｸ謇九・繧｢繝ｳ繧ｳ繝ｼ繝ｫ/繝吶ャ繝亥ｰ√§
  if (stub.id === 'BLOCK_OPP_ENCORE_AND_BET') {
    const newBlockedBOEB = [...(ctx.otherState.blocked_actions ?? []), 'ENCORE', 'BET'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBOEB } },
      '逶ｸ謇九・繧｢繝ｳ繧ｳ繝ｼ繝ｫ繝ｻ繝吶ャ繝医〒縺阪↑縺・));
  }
  // PREVENT_OWN_ARTS_USE: 閾ｪ蛻・・繧｢繝ｼ繝・ｽｿ逕ｨ蟆√§
  if (stub.id === 'PREVENT_OWN_ARTS_USE') {
    const newBlockedPOAU = [...(ctx.ownerState.blocked_actions ?? []), 'USE_ARTS'];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, blocked_actions: newBlockedPOAU } },
      '閾ｪ蛻・・繧｢繝ｼ繝・ｒ菴ｿ逕ｨ縺ｧ縺阪↑縺・));
  }
  // PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP: 蜈ｨ繧ｷ繧ｰ繝九・逶ｸ謇九ヱ繝ｯ繝ｼ繝槭う繝翫せ髦ｲ豁｢・・ffectEngine縺ｧ蜍慕噪蜃ｦ逅・ｼ・  if (stub.id === 'PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP') {
    return done(addLog(ctx, '[蜈ｨ繧ｷ繧ｰ繝九ヱ繝ｯ繝ｼ繝槭う繝翫せ髦ｲ豁｢: effectEngine縺ｧ蜍慕噪蜃ｦ逅・'));
  }
  // 繧ｰ繝ｭ繧ｦ繧ｳ繧ｹ繝亥､画峩・・ngine: 繧ｰ繝ｭ繧ｦ繧ｳ繧ｹ繝亥・逅・悴螳溯｣・ｼ・  if (stub.id === 'GROW_COST_ZERO' || stub.id === 'CONDITIONAL_FREE_GROW') {
    const newOwnerGCZ: PlayerState = { ...ctx.ownerState, free_grow_this_turn: true };
    return done(addLog({ ...ctx, ownerState: newOwnerGCZ }, '繧ｰ繝ｭ繧ｦ繧ｳ繧ｹ繝・・域ｬ｡縺ｮ繧ｰ繝ｭ繧ｦ縺ｯ辟｡譁呻ｼ・));
  }
  if (stub.id === 'GROW_COST_SUBSTITUTE_TRASH_SIGNI') {
    return done(addLog(ctx, '[繧ｰ繝ｭ繧ｦ繧ｳ繧ｹ繝井ｻ｣譖ｿ: GROW_COST_SUBSTITUTE_TRASH_SIGNI]'));
  }
  // 繧ｳ繧ｹ繝郁ｻｽ貂帷ｳｻ・・ngine: 繧ｳ繧ｹ繝郁ｨ育ｮ励す繧ｹ繝・Β譛ｪ螳溯｣・ｼ・  // CONDITIONAL_COST_REDUCTION_BY_FIELD: 繝輔ぅ繝ｼ繝ｫ繝画擅莉ｶ・医け繝ｩ繧ｹ/譫壽焚・峨〒繧ｳ繧ｹ繝郁ｻｽ貂帙メ繧ｧ繝・け
  if (stub.id === 'CONDITIONAL_COST_REDUCTION_BY_FIELD') {
    const srcCCRF = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCCRF = srcCCRF ? (srcCCRF.EffectText ?? '') + ' ' + (srcCCRF.BurstText ?? '') : '';
    // 繧ｯ繝ｩ繧ｹ譚｡莉ｶ・医鯉ｼ懊け繝ｩ繧ｹ1・槭→・懊け繝ｩ繧ｹ2・槭・繧ｷ繧ｰ繝九′縺ゅｋ蝣ｴ蜷医搾ｼ・    const classMatchesCCRF = [...txtCCRF.matchAll(/・・[^・枉+)・・g)].map(m => m[1]).slice(0, 3);
    if (classMatchesCCRF.length > 0) {
      const allPresentCCRF = classMatchesCCRF.every(cls =>
        ctx.ownerState.field.signi.some(s => {
          const top = s?.at(-1); return top && ctx.cardMap.get(top)?.CardClass?.includes(cls);
        })
      );
      return done(addLog(ctx, `繧ｳ繧ｹ繝郁ｻｽ貂帶擅莉ｶ[${classMatchesCCRF.join('+')}]: ${allPresentCCRF ? '譚｡莉ｶ驕疲・・医さ繧ｹ繝郁ｻｽ貂幃←逕ｨ・・ : '譚｡莉ｶ譛ｪ驕費ｼ磯壼ｸｸ繧ｳ繧ｹ繝茨ｼ・}`));
    }
    return done(addLog(ctx, '繧ｳ繧ｹ繝郁ｻｽ貂帶擅莉ｶ・域擅莉ｶ隗｣譫蝉ｸ榊庄・・));
  }
  // CONDITIONAL_CARD_COST_BY_OPP_LRIG: 蟇ｾ謌ｦ逶ｸ謇九・繝ｫ繝ｪ繧ｰ螻樊ｧ縺ｫ繧医ｋ繧ｳ繧ｹ繝亥､画峩繝√ぉ繝・け
  if (stub.id === 'CONDITIONAL_CARD_COST_BY_OPP_LRIG') {
    const srcCCOL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCCOL = srcCCOL ? (srcCCOL.EffectText ?? '') + ' ' + (srcCCOL.BurstText ?? '') : '';
    const condM = txtCCOL.match(/蟇ｾ謌ｦ逶ｸ謇九・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺・[襍､髱堤ｷ鷹ｻ堤區]+)縺ｮ蝣ｴ蜷・);
    if (condM) {
      const condColor = condM[1];
      const oppLrigCn = ctx.otherState.field.lrig.at(-1);
      const oppColor = oppLrigCn ? (ctx.cardMap.get(oppLrigCn)?.Color ?? '') : '';
      const met = oppColor.includes(condColor);
      return done(addLog(ctx, `繧ｳ繧ｹ繝亥､画峩譚｡莉ｶ・育嶌謇・{condColor}・・ ${met ? '譚｡莉ｶ驕疲・' : '譚｡莉ｶ譛ｪ驕・}`));
    }
    return done(addLog(ctx, '繧ｳ繧ｹ繝亥､画峩譚｡莉ｶ・医Ν繝ｪ繧ｰ螻樊ｧ隗｣譫蝉ｸ榊庄・・));
  }
  if (stub.id === 'SPELL_COST_REDUCTION_BY_TRASH_COUNT' || stub.id === 'SPECIFIC_CARD_COST_REDUCE'
      || stub.id === 'ARTS_COST_REDUCTION_BY_COST_THRESHOLD' || stub.id === 'REDUCE_PLAY_ABILITY_COST') {
    return done(addLog(ctx, `[繧ｳ繧ｹ繝郁ｻｽ貂・ ${stub.id}]`));
  }
  // 繧ｬ繝ｼ繝臥ｳｻ・・ngine: 繧ｬ繝ｼ繝峨さ繧ｹ繝亥・逅・悴螳溯｣・ｼ・  if (stub.id === 'GUARD_ALTERNATIVE_COST' || stub.id === 'EXTRA_GUARD_COST_FROM_HAND' || stub.id === 'OPTIONAL_TRADE_GUARD_SIGNI') {
    return done(addLog(ctx, `[繧ｬ繝ｼ繝峨さ繧ｹ繝・ ${stub.id}]`));
  }
  // 驕ｸ繧薙□繧ｭ繝ｼ繝ｯ繝ｼ繝・菫晁ｭｷ閭ｽ蜉帑ｻ倅ｸ趣ｼ医す繧ｰ繝句ｯｾ雎｡繝ｻSELECT_TARGET竊辰HOOSE繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ・・  if (stub.id === 'GRANT_CHOSEN_ABILITY' || stub.id === 'GRANT_CHOSEN_ABILITY_SELF'
      || stub.id === 'SIGNI_GRANT_CHOSEN_ABILITY') {
    const srcGCA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGCA = srcGCA ? (srcGCA.EffectText ?? '') + ' ' + (srcGCA.BurstText ?? '') : '';
    const toHWGCA = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 閾ｪ繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝九′蟇ｾ雎｡・・astProcessedCards縺ｫ蟇ｾ雎｡繧ｷ繧ｰ繝九ｒ險ｭ螳夲ｼ・    const targetFromLP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (!targetFromLP) {
      // SELECT_TARGET: 閾ｪ繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝九ｒ驕ｸ謚槭＠縺ｦ縺九ｉ閭ｽ蜉帑ｻ倅ｸ弱∈
      const fieldCandsGCA = [0,1,2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn);
      if (fieldCandsGCA.length === 0) return done(addLog(ctx, '閭ｽ蜉帑ｻ倅ｸ主ｯｾ雎｡縺ｪ縺暦ｼ郁・繧ｷ繧ｰ繝九↑縺暦ｼ・));
      const noopGCA: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contGCA: StubAction = { type: 'STUB', id: stub.id };
      return needsInteraction(addLog(ctx, '閭ｽ蜉帙ｒ莉倅ｸ弱☆繧九す繧ｰ繝九ｒ驕ｸ謚・), {
        type: 'SELECT_TARGET', candidates: fieldCandsGCA, count: 1, optional: false,
        targetScope: 'self_field', thenAction: noopGCA as EffectAction, continuation: contGCA as EffectAction,
      });
    }
    // 驕ｸ謚樊焚・・N 縺､驕ｸ縺ｶ" or 繝・ヵ繧ｩ繝ｫ繝・・・    const chooseCountGCA = (() => {
      const m = txtGCA.match(/([・・・・-9\d])縺､繧帝∈縺ｶ/);
      return m ? parseInt(toHWGCA(m[1])) : 1;
    })();
    // 繝・く繧ｹ繝医°繧蛾∈謚櫁い繧呈歓蜃ｺ・遺蔵竭｡竭｢竭｣竭､・・    const abilitiesGCA: Array<{ label: string; kw: string }> = [];
    const abilityPatterns: Array<[RegExp, string]> = [
      [/縲舌い繧ｵ繧ｷ繝ｳ縲・, '繧｢繧ｵ繧ｷ繝ｳ'],
      [/縲舌Λ繝ｳ繧ｵ繝ｼ縲・, '繝ｩ繝ｳ繧ｵ繝ｼ'],
      [/縲舌ム繝悶Ν繧ｯ繝ｩ繝・す繝･縲・, '繝繝悶Ν繧ｯ繝ｩ繝・す繝･'],
      [/縲舌す繝｣繝峨え縲・, '繧ｷ繝｣繝峨え'],
      [/縲舌・繝ｫ繝√お繝翫・, '繝槭Ν繝√お繝・],
      [/繝舌ル繝・す繝･縺輔ｌ縺ｪ縺・, '繝舌ル繝・す繝･荳榊庄'],
      [/繝繧ｦ繝ｳ縺励↑縺・, '繝繧ｦ繝ｳ荳榊庄'],
      [/謇区惆縺ｫ謌ｻ繧峨↑縺・, '繝舌え繝ｳ繧ｹ荳榊庄'],
    ];
    for (const [pat, kw] of abilityPatterns) {
      if (pat.test(txtGCA)) abilitiesGCA.push({ label: `縲・{kw}縲代ｒ莉倅ｸ餐, kw });
    }
    if (abilitiesGCA.length === 0) return done(addLog(ctx, `[閭ｽ蜉帑ｻ倅ｸ・ ${stub.id}]・郁・蜉幄ｧ｣譫蝉ｸ榊庄・荏));
    const optionsGCA = abilitiesGCA.map(({ label, kw }) => ({
      id: kw,
      label,
      action: ({ type: 'STUB', id: 'INTERNAL_GRANT_KEYWORD_TO_TARGET', value: `${targetFromLP}:${kw}` } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '莉倅ｸ弱☆繧玖・蜉帙ｒ驕ｸ謚・), { type: 'CHOOSE', options: optionsGCA, count: chooseCountGCA });
  }
  // INTERNAL_GRANT_KEYWORD_TO_TARGET: 驕ｸ謚槭＆繧後◆繧ｭ繝ｼ繝ｯ繝ｼ繝・菫晁ｭｷ閭ｽ蜉帙ｒ蟇ｾ雎｡繧ｷ繧ｰ繝九↓莉倅ｸ・  if (stub.id === 'INTERNAL_GRANT_KEYWORD_TO_TARGET') {
    const valIGKTT = typeof stub.value === 'string' ? stub.value : '';
    const [targetCnIGKTT, kwIGKTT] = valIGKTT.split(':');
    if (!targetCnIGKTT || !kwIGKTT) return done(addLog(ctx, '繧ｭ繝ｼ繝ｯ繝ｼ繝我ｻ倅ｸ主､ｱ謨暦ｼ亥ｼ墓焚荳肴ｭ｣・・));
    // keyword_grants 縺ｫ霑ｽ蜉・井ｿ晁ｭｷ邉ｻ繧ょ性繧・・    let newOwnerIGKTT = ctx.ownerState;
    const grantsIGKTT = { ...(newOwnerIGKTT.keyword_grants ?? {}) };
    grantsIGKTT[targetCnIGKTT] = [...new Set([...(grantsIGKTT[targetCnIGKTT] ?? []), kwIGKTT])];
    newOwnerIGKTT = { ...newOwnerIGKTT, keyword_grants: grantsIGKTT };
    // 菫晁ｭｷ邉ｻ縺ｯ蟆ら畑繝輔Λ繧ｰ繧りｨｭ螳・    if (kwIGKTT === '繝舌ル繝・す繝･荳榊庄') {
      // otherState.abilities_removed 縺九ｉ髯､螟・+ banish_redirect 逶ｸ蠖薙ヵ繝ｩ繧ｰ縺ｪ縺・竊・keyword_grants縺ｧ邂｡逅・    }
    return done(addLog({ ...ctx, ownerState: newOwnerIGKTT },
      `${ctx.cardMap.get(targetCnIGKTT)?.CardName ?? targetCnIGKTT}縺ｫ縲・{kwIGKTT}縲台ｻ倅ｸ餐));
  }
  // GRANT_CHOSEN_ABILITY_FROM_PLAY: 縲仙・縲代〒驕ｸ繧薙□閭ｽ蜉幢ｼ・eyword_grants險倬鹸貂医∩・峨ｒ蟶ｸ蝨ｨ縺ｧ蜿ら・
  // 縺薙・CONTINUOUS蜉ｹ譫懊・execStub縺ｧ縺ｯ縺ｪ縺銃ffectEngine蛛ｴ縺ｧkeyword_grants繧貞盾辣ｧ縺吶ｋ縺溘ａ縲√％縺薙〒縺ｯ菴輔ｂ縺励↑縺・  if (stub.id === 'GRANT_CHOSEN_ABILITY_FROM_PLAY') {
    // keyword_grants 縺ｫ蜷後き繝ｼ繝峨・莉倅ｸ取ｸ医∩繧ｭ繝ｼ繝ｯ繝ｼ繝峨′縺ゅｌ縺ｰ邯咏ｶ夲ｼ・ffectEngine縺ｧ蜍慕噪蜿ら・・・    return done(ctx);
  }
  // SIGNI_GRANT_QUOTED_CONSTANT_ABILITY: 蠑慕畑蟶ｸ蝨ｨ閭ｽ蜉帙ｒ閾ｪ繧ｷ繧ｰ繝九↓莉倅ｸ趣ｼ・ELECT_TARGET竊談eyword_grants・・  if (stub.id === 'SIGNI_GRANT_QUOTED_CONSTANT_ABILITY') {
    const srcSGQCA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSGQCA = srcSGQCA ? (srcSGQCA.EffectText ?? '') + ' ' + (srcSGQCA.BurstText ?? '') : '';
    const toHWSGQCA = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 莉倅ｸ弱☆繧九く繝ｼ繝ｯ繝ｼ繝峨ｒ蠑慕畑譁・°繧芽ｧ｣譫・    let kwSGQCA: string | null = null;
    if (txtSGQCA.includes('繧｢繧ｵ繧ｷ繝ｳ')) kwSGQCA = 'assassin';
    else if (txtSGQCA.includes('繧ｷ繝｣繝峨え')) kwSGQCA = 'shadow';
    else if (txtSGQCA.includes('繝ｩ繝ｳ繧ｵ繝ｼ')) kwSGQCA = 'lancer';
    else if (txtSGQCA.includes('繝繝悶Ν繧ｯ繝ｩ繝・す繝･')) kwSGQCA = 'double_crush';
    else if (txtSGQCA.includes('繧ｬ繝ｼ繝・)) kwSGQCA = 'guard';
    // 蟇ｾ雎｡繧ｷ繧ｰ繝区焚
    const countMSGQCA = txtSGQCA.match(/繧ｷ繧ｰ繝九ｒ([・・・兔d]+)菴薙∪縺ｧ/);
    const maxCntSGQCA = countMSGQCA ? parseInt(toHWSGQCA(countMSGQCA[1])) : 1;
    // 蟇ｾ雎｡驕ｸ謚樊ｸ医∩縺ｪ繧峨く繝ｼ繝ｯ繝ｼ繝峨ｒ莉倅ｸ・    if (ctx.lastProcessedCards?.length) {
      if (!kwSGQCA) return done(addLog(ctx, '[SIGNI_GRANT_QUOTED_CONSTANT_ABILITY: 繧ｭ繝ｼ繝ｯ繝ｼ繝芽ｧ｣譫蝉ｸ榊庄]'));
      const newGrants = { ...(ctx.ownerState.keyword_grants ?? {}) };
      for (const cn of ctx.lastProcessedCards) {
        const prev = newGrants[cn] ?? [];
        if (!prev.includes(kwSGQCA)) newGrants[cn] = [...prev, kwSGQCA];
      }
      const names = ctx.lastProcessedCards.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: newGrants } },
        `${names}竊偵・{kwSGQCA}縲台ｻ倅ｸ餐));
    }
    // 閾ｪ繝輔ぅ繝ｼ繝ｫ繝峨°繧唄ELECT_TARGET
    const fieldCandsSGQCA = ctx.ownerState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    if (fieldCandsSGQCA.length === 0) return done(addLog(ctx, '閾ｪ繝輔ぅ繝ｼ繝ｫ繝峨↓繧ｷ繧ｰ繝九↑縺・));
    const contSGQCA: StubAction = { type: 'STUB', id: 'SIGNI_GRANT_QUOTED_CONSTANT_ABILITY' };
    return needsInteraction(addLog(ctx, `繧ｷ繧ｰ繝九ｒ驕ｸ謚橸ｼ亥ｼ慕畑蟶ｸ蝨ｨ閭ｽ蜉帑ｻ倅ｸ・ ${kwSGQCA ?? '?'}・荏), {
      type: 'SELECT_TARGET', candidates: fieldCandsSGQCA, count: maxCntSGQCA, optional: true,
      targetScope: 'self_field', thenAction: contSGQCA as EffectAction,
    });
  }
  // 閭ｽ蜉帑ｻ倅ｸ守ｳｻ・・ONTINUOUS蜉ｹ譫懊・effectEngine縺ｧ蜃ｦ逅・、UTO/ACTIVATED縺ｧ繧よ擂縺溷ｴ蜷医・繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ・・  // GRANT_UNDER_SIGNI_*/GRANT_UNDER_LRIG_*/GRANT_LRIG_TRASH_ACTIVATE_ABILITY
  // 竊・collectGrantedFromUnderSigni / collectLrigGrantedEffects縺ｧ蜃ｦ逅・ｸ医∩
  if (stub.id === 'GRANT_LRIG_ABILITY' || stub.id === 'GRANT_LRIG_TRASH_ACTIVATE_ABILITY'
      || stub.id === 'GRANT_UNDER_LRIG_ACTIVATE_ABILITY' || stub.id === 'GRANT_UNDER_LRIG_AUTO_ABILITY'
      || stub.id === 'GRANT_UNDER_SIGNI_ALL_ABILITIES' || stub.id === 'GRANT_UNDER_SIGNI_CONSTANT_ABILITY'
      || stub.id === 'GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE'
      || stub.id === 'GRANT_LRIG_TYPE_GAME_WIDE') {
    return done(addLog(ctx, `[閭ｽ蜉帑ｻ倅ｸ・ ${stub.id}]`));
  }
  // COPY_ABILITY: 縺薙・繧ｷ繧ｰ繝九・縺昴・・・astProcessed[0]縺ｮ・芽・蜉帙ｒ蠕励ｋ
  if (stub.id === 'COPY_ABILITY') {
    const targetCA = ctx.sourceCardNum;
    const copiedCA = ctx.lastProcessedCards?.[0];
    if (!targetCA || !copiedCA) return done(addLog(ctx, 'COPY_ABILITY: 蟇ｾ雎｡縺ｾ縺溘・繧ｳ繝斐・蜈・↑縺・));
    const copiedCardCA = ctx.cardMap.get(copiedCA);
    if (!copiedCardCA) return done(addLog(ctx, 'COPY_ABILITY: 繧ｳ繝斐・蜈・き繝ｼ繝峨ョ繝ｼ繧ｿ縺ｪ縺・));
    const copiedEffsCA = parseCardEffects(copiedCardCA);
    const grantedCA = { ...(ctx.ownerState.granted_effects ?? {}) };
    grantedCA[targetCA] = [...(grantedCA[targetCA] ?? []), ...copiedEffsCA];
    const newOwnerCA: PlayerState = { ...ctx.ownerState, granted_effects: grantedCA };
    return done(addLog({ ...ctx, ownerState: newOwnerCA },
      `${ctx.cardMap.get(targetCA)?.CardName ?? targetCA}縺・{copiedCardCA.CardName}縺ｮ閭ｽ蜉帙ｒ繧ｳ繝斐・`));
  }
  // GRANT_ABILITY_UNTIL_OPP_TURN: 谺｡縺ｮ蟇ｾ謌ｦ逶ｸ謇九・繧ｿ繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ竭縺ｮ閭ｽ蜉帙ｒ莉倅ｸ・  if (stub.id === 'GRANT_ABILITY_UNTIL_OPP_TURN') {
    const srcGAUOT = ctx.sourceCardNum;
    if (!srcGAUOT) return done(addLog(ctx, 'GRANT_ABILITY_UNTIL_OPP_TURN: 繧ｽ繝ｼ繧ｹ縺ｪ縺・));
    const srcCardGAUOT = ctx.cardMap.get(srcGAUOT);
    const txtGAUOT = srcCardGAUOT ? (srcCardGAUOT.EffectText ?? '') + ' ' + (srcCardGAUOT.BurstText ?? '') : '';
    let kwGAUOT: string | null = null;
    if (txtGAUOT.includes('S繝ｩ繝ｳ繧ｵ繝ｼ')) kwGAUOT = 'S繝ｩ繝ｳ繧ｵ繝ｼ';
    else if (txtGAUOT.includes('繝ｩ繝ｳ繧ｵ繝ｼ')) kwGAUOT = 'lancer';
    else if (txtGAUOT.includes('繧｢繧ｵ繧ｷ繝ｳ')) kwGAUOT = 'assassin';
    else if (txtGAUOT.includes('繝繝悶Ν繧ｯ繝ｩ繝・す繝･')) kwGAUOT = 'double_crush';
    else if (txtGAUOT.includes('繧ｷ繝｣繝峨え')) kwGAUOT = 'shadow';
    else if (txtGAUOT.includes('繝舌ル繝・す繝･荳榊庄')) kwGAUOT = '繝舌ル繝・す繝･荳榊庄';
    else if (txtGAUOT.includes('繝繧ｦ繝ｳ荳榊庄')) kwGAUOT = '繝繧ｦ繝ｳ荳榊庄';
    if (!kwGAUOT) return done(addLog(ctx, `GRANT_ABILITY_UNTIL_OPP_TURN: 繧ｭ繝ｼ繝ｯ繝ｼ繝芽ｧ｣譫蝉ｸ榊庄`));
    const grantsGAUOT = { ...(ctx.ownerState.keyword_grants ?? {}) };
    grantsGAUOT[srcGAUOT] = [...new Set([...(grantsGAUOT[srcGAUOT] ?? []), kwGAUOT])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsGAUOT } },
      `${ctx.cardMap.get(srcGAUOT)?.CardName ?? srcGAUOT}縺ｫ${kwGAUOT}・域ｬ｡縺ｮ逶ｸ謇九ち繝ｼ繝ｳ邨ゆｺ・∪縺ｧ・荏));
  }
  // RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY: 繝ｩ繧､繧ｺ蟇ｾ雎｡繧ｷ繧ｰ繝九↓蠑慕畑蟶ｸ蝨ｨ閭ｽ蜉帙ｒ莉倅ｸ・  if (stub.id === 'RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY') {
    const targetRTSGA = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!targetRTSGA) return done(addLog(ctx, 'RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY: 蟇ｾ雎｡縺ｪ縺・));
    const riseCardRTSGA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRTSGA = riseCardRTSGA ? (riseCardRTSGA.EffectText ?? '') : '';
    let kwRTSGA: string | null = null;
    if (txtRTSGA.includes('繧｢繧ｵ繧ｷ繝ｳ')) kwRTSGA = 'assassin';
    else if (txtRTSGA.includes('S繝ｩ繝ｳ繧ｵ繝ｼ')) kwRTSGA = 'S繝ｩ繝ｳ繧ｵ繝ｼ';
    else if (txtRTSGA.includes('繝ｩ繝ｳ繧ｵ繝ｼ')) kwRTSGA = 'lancer';
    else if (txtRTSGA.includes('繝繝悶Ν繧ｯ繝ｩ繝・す繝･')) kwRTSGA = 'double_crush';
    else if (txtRTSGA.includes('繧ｷ繝｣繝峨え')) kwRTSGA = 'shadow';
    else if (txtRTSGA.includes('繝舌ル繝・す繝･荳榊庄')) kwRTSGA = '繝舌ル繝・す繝･荳榊庄';
    if (!kwRTSGA) return done(addLog(ctx, `RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY: 繧ｭ繝ｼ繝ｯ繝ｼ繝芽ｧ｣譫蝉ｸ榊庄`));
    const grantsRTSGA = { ...(ctx.ownerState.keyword_grants ?? {}) };
    grantsRTSGA[targetRTSGA] = [...new Set([...(grantsRTSGA[targetRTSGA] ?? []), kwRTSGA])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsRTSGA } },
      `${ctx.cardMap.get(targetRTSGA)?.CardName ?? targetRTSGA}縺・{kwRTSGA}繧貞ｾ励ｋ`));
  }
  // GRANT_SIGNI_CLASS: 縺薙・繧ｷ繧ｰ繝九↓・弭・槭け繝ｩ繧ｹ繧剃ｻ倅ｸ・  if (stub.id === 'GRANT_SIGNI_CLASS') {
    const srcGSC = ctx.sourceCardNum;
    if (!srcGSC) return done(addLog(ctx, 'GRANT_SIGNI_CLASS: 繧ｽ繝ｼ繧ｹ縺ｪ縺・));
    const srcCardGSC = ctx.cardMap.get(srcGSC);
    const txtGSC = srcCardGSC ? (srcCardGSC.EffectText ?? '') : '';
    const classMatchGSC = txtGSC.match(/縺薙・繧ｷ繧ｰ繝九・・・[^・枉+)・槭ｒ謖√▽/);
    const classNameGSC = classMatchGSC ? classMatchGSC[1] : '';
    if (!classNameGSC) return done(addLog(ctx, 'GRANT_SIGNI_CLASS: 繧ｯ繝ｩ繧ｹ隗｣譫蝉ｸ榊庄'));
    const existingGSC = srcCardGSC?.CardClass ?? '';
    const newClassGSC = existingGSC.includes(classNameGSC) ? existingGSC : `${existingGSC}:${classNameGSC}`;
    const overridesGSC = { ...(ctx.ownerState.card_class_overrides ?? {}), [srcGSC]: newClassGSC };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: overridesGSC } },
      `${ctx.cardMap.get(srcGSC)?.CardName ?? srcGSC}縺鯉ｼ・{classNameGSC}・槭ｒ蠕励ｋ`));
  }
  // LAYER_ABILITY_COPY: ・懈ｪ逡ｰ・槭す繧ｰ繝九・繝ｬ繧､繝､繝ｼ閭ｽ蜉帙ｒ閾ｪ繧ｷ繧ｰ繝九↓繧ｳ繝斐・
  if (stub.id === 'LAYER_ABILITY_COPY') {
    const srcLAC = ctx.sourceCardNum;
    const srcCardLAC = srcLAC ? ctx.cardMap.get(srcLAC) : undefined;
    const txtLAC = srcCardLAC ? (srcCardLAC.EffectText ?? '') : '';
    const fromTrash = txtLAC.includes('繝医Λ繝・す繝･縺九ｉ');
    const kaiClass = '諤ｪ逡ｰ';
    let candsLAC: string[];
    let scopeLAC: TargetScope;
    if (fromTrash) {
      candsLAC = ctx.ownerState.trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.Type === '繧ｷ繧ｰ繝・ && (c.CardClass ?? '').includes(kaiClass);
      });
      scopeLAC = 'self_trash';
    } else {
      candsLAC = [0, 1, 2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn && cn !== srcLAC && (ctx.cardMap.get(cn)?.CardClass ?? '').includes(kaiClass));
      scopeLAC = 'self_field';
    }
    if (candsLAC.length === 0) return done(addLog(ctx, `・・{kaiClass}・槭す繧ｰ繝九↑縺暦ｼ・{fromTrash ? '繝医Λ繝・す繝･' : '繝輔ぅ繝ｼ繝ｫ繝・}・荏));
    const noopLAC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contLAC: StubAction = { type: 'STUB', id: 'INTERNAL_LAYER_COPY_APPLY' };
    return needsInteraction(addLog(ctx, '繝ｬ繧､繝､繝ｼ閭ｽ蜉帙ｒ繧ｳ繝斐・縺吶ｋ繧ｷ繧ｰ繝九ｒ驕ｸ謚・), {
      type: 'SELECT_TARGET', candidates: candsLAC, count: 1, optional: false,
      targetScope: scopeLAC, thenAction: noopLAC as EffectAction, continuation: contLAC as EffectAction,
    });
  }
  // INTERNAL_LAYER_COPY_APPLY: 驕ｸ謚槭す繧ｰ繝九・繝ｬ繧､繝､繝ｼ閭ｽ蜉帙ｒ閾ｪ繧ｷ繧ｰ繝九↓莉倅ｸ・  if (stub.id === 'INTERNAL_LAYER_COPY_APPLY') {
    const srcILCA = ctx.sourceCardNum;
    const targetILCA = (ctx.lastProcessedCards ?? [])[0];
    if (!srcILCA || !targetILCA) return done(addLog(ctx, '繝ｬ繧､繝､繝ｼ繧ｳ繝斐・螟ｱ謨・));
    const targetCardILCA = ctx.cardMap.get(targetILCA);
    const targetTxtILCA = (targetCardILCA?.EffectText ?? '') + ' ' + (targetCardILCA?.BurstText ?? '');
    // 繝ｬ繧､繝､繝ｼ閭ｽ蜉幃Κ蛻・ｒ謚ｽ蜃ｺ・医翫Ξ繧､繝､繝ｼ繧｢繧､繧ｳ繝ｳ縲倶ｻ･髯搾ｼ・    const layerMatchILCA = targetTxtILCA.match(/縲翫Ξ繧､繝､繝ｼ繧｢繧､繧ｳ繝ｳ縲・.+)/);
    const layerTxtILCA = layerMatchILCA?.[1] ?? '';
    const knownKwsILCA = ['S繝ｩ繝ｳ繧ｵ繝ｼ', '繝ｩ繝ｳ繧ｵ繝ｼ', '繝繝悶Ν繧ｯ繝ｩ繝・す繝･', '繧｢繧ｵ繧ｷ繝ｳ', '繧ｷ繝｣繝峨え', '繝槭Ν繝√お繝・];
    const copiedKwsILCA = knownKwsILCA.filter(kw => layerTxtILCA.includes(kw));
    // S繝ｩ繝ｳ繧ｵ繝ｼ・医ヱ繝ｯ繝ｼ譚｡莉ｶ莉倥″・・    if (layerTxtILCA.match(/12000莉･荳・*S繝ｩ繝ｳ繧ｵ繝ｼ|S繝ｩ繝ｳ繧ｵ繝ｼ.*12000莉･荳・)) {
      const srcPow = ctx.effectivePowers?.get(srcILCA) ?? parseInt(ctx.cardMap.get(srcILCA)?.Power ?? '0');
      if (srcPow >= 12000) copiedKwsILCA.push('S繝ｩ繝ｳ繧ｵ繝ｼ');
    }
    if (copiedKwsILCA.length > 0) {
      const grantsILCA = { ...(ctx.ownerState.keyword_grants ?? {}) };
      grantsILCA[srcILCA] = [...new Set([...(grantsILCA[srcILCA] ?? []), ...copiedKwsILCA])];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsILCA } },
        `${targetCardILCA?.CardName ?? targetILCA}縺ｮ繝ｬ繧､繝､繝ｼ縲・{copiedKwsILCA.join('繝ｻ')}縲代ｒ繧ｳ繝斐・`));
    }
    // 繝代Ρ繝ｼ菫晁ｭｷ縺ｪ縺ｩ髱槭く繝ｼ繝ｯ繝ｼ繝臥ｳｻ
    if (layerTxtILCA.includes('繝代Ρ繝ｼ縺ｯ蠅玲ｸ帙＠縺ｪ縺・)) {
      return done(addLog(ctx, `${targetCardILCA?.CardName ?? targetILCA}縺ｮ繝ｬ繧､繝､繝ｼ・医ヱ繝ｯ繝ｼ菫晁ｭｷ・峨ｒ繧ｳ繝斐・`));
    }
    return done(addLog(ctx, `${targetCardILCA?.CardName ?? targetILCA}縺ｮ繝ｬ繧､繝､繝ｼ閭ｽ蜉帙ｒ繧ｳ繝斐・・医Ο繧ｰ縺ｮ縺ｿ・荏));
  }
  // RIDE_ON: 繝ｫ繝ｪ繧ｰ縺御ｹ玲ｩ溘す繧ｰ繝・菴薙↓莉ｻ諢上〒繝ｩ繧､繝会ｼ医ラ繝ｩ繧､繝也憾諷九〒縺ｪ縺・ｴ蜷医・縺ｿ蜿ｯ・・  if (stub.id === 'RIDE_ON') {
    if ((ctx.ownerState.lrig_riding_signi?.length ?? 0) > 0) {
      return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ譌｢縺ｫ繝峨Λ繧､繝也憾諷具ｼ・IDE_ON 繧ｹ繧ｭ繝・・・・));
    }
    const selectedRO = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (selectedRO) {
      const newOwnerRO = { ...ctx.ownerState, lrig_riding_signi: [selectedRO] };
      const namRO = ctx.cardMap.get(selectedRO)?.CardName ?? selectedRO;
      return done(addLog({ ...ctx, ownerState: newOwnerRO }, `繝ｫ繝ｪ繧ｰ縺・{namRO}縺ｫ荵励ｋ・医ラ繝ｩ繧､繝也憾諷具ｼ荏));
    }
    const rideCandRO = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('荵玲ｩ・) ? [top] : [];
    });
    if (rideCandRO.length === 0) return done(addLog(ctx, '荵玲ｩ溘す繧ｰ繝九↑縺暦ｼ・IDE_ON・・));
    const applyRO: StubAction = { type: 'STUB', id: 'INTERNAL_RIDE_ON_APPLY' };
    const skipRO:  StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, '繝ｫ繝ｪ繧ｰ繧剃ｹ玲ｩ溘す繧ｰ繝九↓荵励○縺ｦ繧ゅｈ縺・), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'ride', label: '荵励ｋ', action: applyRO as EffectAction, available: true },
        { id: 'skip', label: '縺励↑縺・, action: skipRO as EffectAction, available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_RIDE_ON_APPLY') {
    const rideCandIROA = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('荵玲ｩ・) ? [top] : [];
    });
    if (rideCandIROA.length === 0) return done(addLog(ctx, '荵玲ｩ溘す繧ｰ繝九↑縺暦ｼ・NTERNAL_RIDE_ON_APPLY・・));
    const contIROA: StubAction = { type: 'STUB', id: 'RIDE_ON' };
    const noopIROA: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(rideCandIROA, 1, false, 'self_field', noopIROA as EffectAction, contIROA as EffectAction, ctx);
  }
  // 繝ｩ繧､繧ｺ/繧ｹ繧ｿ繝・け邉ｻ・・ngine: 繝ｩ繧､繧ｺ繧ｷ繧ｹ繝・Β譛ｪ螳溯｣・ｼ・  if (stub.id === 'RISE_BANISH_SUBSTITUTE' || stub.id === 'RISE_LEAVE_DISCARD_STACK'
      || stub.id === 'BANISH_SUBSTITUTE_RISE_STACK' || stub.id === 'RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE'
      || stub.id === 'COOKING_BANISH_SUBSTITUTE' || stub.id === 'BLACK_RISE_PLAY_STACK_FROM_TRASH') {
    return done(addLog(ctx, `[繝ｩ繧､繧ｺ/繧ｹ繧ｿ繝・け: ${stub.id}]`));
  }
  // ENERGY_COLOR_SUBSTITUTE_襍､_OR_髱胆TO_逋ｽ: CONTINUOUS蜉ｹ譫懶ｼ・ffectEngine.collectEnergyColorSubs縺ｧ蜍慕噪險育ｮ暦ｼ・  if (stub.id === 'ENERGY_COLOR_SUBSTITUTE_襍､_OR_髱胆TO_逋ｽ') {
    return done(addLog(ctx, '[ENERGY_COLOR_SUBSTITUTE: effectEngine縺ｧ蜍慕噪蜃ｦ逅・ｸｭ]'));
  }
  // 繧ｨ繝贋ｻ｣譖ｿ邉ｻ・・ffectEngine.collectEnergyTrashSubstituteInfo縺ｧ蜍慕噪險育ｮ暦ｼ・  if (stub.id === 'ENERGY_COLOR_SUBSTITUTE_TRASH' || stub.id === 'ENERGY_SUBSTITUTE_TRASH_SIGNI'
      || stub.id === 'ENERGY_SUBSTITUTE_TRASH_KEY' || stub.id === 'ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI') {
    return done(addLog(ctx, `[繧ｨ繝贋ｻ｣譖ｿ: ${stub.id}・・I縺ｧ蜃ｦ逅・ｸ医∩・云`));
  }
  // CLASS_CHANGE: 繧ｷ繧ｰ繝九・繧ｯ繝ｩ繧ｹ繧剃ｸ譎ょ､画峩
  if (stub.id === 'CLASS_CHANGE') {
    const srcCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCC = srcCC ? (srcCC.EffectText ?? '') + ' ' + (srcCC.BurstText ?? '') : '';
    // 螟画峩蜈医け繝ｩ繧ｹ繧呈歓蜃ｺ・茨ｼ懈ｪ逡ｰ・槭↑縺ｩ・峨ＭastProcessedCards縺ｫ螳｣險繧ｯ繝ｩ繧ｹ縺梧ｼ邏阪＆繧後ｋ蝣ｴ蜷医ｂ縺ゅｊ
    const declaredClassCC = (ctx.lastProcessedCards ?? []).find(s => !s.match(/^WX|^WD|^WXD|^WXK|^SPDi/));
    const newClassMCC = txtCC.match(/・・[^・枉+)・槭ｒ蠕励ｋ/);
    const newClass = declaredClassCC ?? (newClassMCC ? newClassMCC[1] : null);
    if (!newClass) return done(addLog(ctx, '繧ｯ繝ｩ繧ｹ螟画峩蜈井ｸ肴・'));
    // 縲後☆縺ｹ縺ｦ縺ｮ...繧ｷ繧ｰ繝九坂・ 蟇ｾ雎｡驕ｸ謚槭↑縺暦ｼ亥・蜩｡驕ｩ逕ｨ・・    if (txtCC.match(/縺吶∋縺ｦ.*繧ｷ繧ｰ繝・*繧ｯ繝ｩ繧ｹ繧貞､ｱ縺л縺吶∋縺ｦ縺ｮ.*繧ｷ繧ｰ繝九・.*繧ｯ繝ｩ繧ｹ繧貞､ｱ縺・)) {
      const colorPatCC = txtCC.match(/(襍､|髱竹邱掃逋ｽ|鮟・.*(?:縺ｨ|縺弓縺ｾ縺溘・).*(襍､|髱竹邱掃逋ｽ|鮟・/);
      const colorSingleCC = !colorPatCC && txtCC.match(/(襍､|髱竹邱掃逋ｽ|鮟・.*繧ｷ繧ｰ繝・*繧ｯ繝ｩ繧ｹ繧貞､ｱ縺・);
      const reqColors: string[] = [];
      if (colorPatCC) { colorPatCC.slice(1).forEach(c => { if (c) reqColors.push(c); }); }
      else if (colorSingleCC) reqColors.push(colorSingleCC[1]);
      const targets = [0, 1, 2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => {
          if (!cn) return false;
          if (reqColors.length === 0) return true;
          const c = ctx.cardMap.get(cn);
          return reqColors.some(col => (c?.Color ?? '').includes(col));
        });
      if (targets.length === 0) return done(addLog(ctx, '繧ｯ繝ｩ繧ｹ螟画峩蟇ｾ雎｡縺ｪ縺・));
      const overridesCC = { ...(ctx.ownerState.card_class_overrides ?? {}) };
      for (const cn of targets) overridesCC[cn] = newClass;
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: overridesCC } },
        `${targets.length}菴薙・繧ｷ繧ｰ繝九・繧ｯ繝ｩ繧ｹ繧抵ｼ・{newClass}・槭↓螟画峩`));
    }
    // lastProcessedCards 縺ｫ蟇ｾ雎｡繧ｷ繧ｰ繝九′縺ゅｋ蝣ｴ蜷茨ｼ・EQUENCE蜀・・繧ｿ繝ｼ繧ｲ繝・ヨ驕ｸ謚槫ｾ鯉ｼ・    const targetFromContext = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn) ||
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (targetFromContext) {
      const inOwnCC2 = ctx.ownerState.field.signi.some(s => s?.at(-1) === targetFromContext);
      if (inOwnCC2) {
        const ovCC2 = { ...(ctx.ownerState.card_class_overrides ?? {}), [targetFromContext]: newClass };
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: ovCC2 } },
          `${ctx.cardMap.get(targetFromContext)?.CardName ?? targetFromContext}縺ｮ繧ｯ繝ｩ繧ｹ繧抵ｼ・{newClass}・槭↓螟画峩`));
      }
      const ovCC2Op = { ...(ctx.otherState.card_class_overrides ?? {}), [targetFromContext]: newClass };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, card_class_overrides: ovCC2Op } },
        `${ctx.cardMap.get(targetFromContext)?.CardName ?? targetFromContext}縺ｮ繧ｯ繝ｩ繧ｹ繧抵ｼ・{newClass}・槭↓螟画峩`));
    }
    // 蟇ｾ雎｡驕ｸ謚橸ｼ・菴難ｼ・    const allSigniCC = [
      ...[0, 1, 2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
      ...[0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
    ];
    if (allSigniCC.length === 0) return done(addLog(ctx, '繧ｯ繝ｩ繧ｹ螟画峩蟇ｾ雎｡縺ｪ縺・));
    const changeClassStub: StubAction = { type: 'STUB', id: 'INTERNAL_APPLY_CLASS_CHANGE', value: newClass };
    return needsInteraction(addLog(ctx, `繧ｯ繝ｩ繧ｹ繧抵ｼ・{newClass}・槭↓螟画峩縺吶ｋ蟇ｾ雎｡繧帝∈謚杼), {
      type: 'SELECT_TARGET', candidates: allSigniCC, count: 1, optional: false,
      targetScope: 'self_field', thenAction: changeClassStub as EffectAction,
    });
  }
  // INTERNAL_APPLY_CLASS_CHANGE: 驕ｸ謚槭す繧ｰ繝九・繧ｯ繝ｩ繧ｹ繧貞､画峩
  if (stub.id === 'INTERNAL_APPLY_CLASS_CHANGE') {
    const targetCnIACC = ctx.lastProcessedCards?.[0];
    const newClassIACC = typeof stub.value === 'string' ? stub.value : '';
    if (!targetCnIACC || !newClassIACC) return done(addLog(ctx, '繧ｯ繝ｩ繧ｹ螟画峩驕ｩ逕ｨ螟ｱ謨・));
    // 閾ｪ蛻・・逶ｸ謇九←縺｡繧峨・繝輔ぅ繝ｼ繝ｫ繝峨°繧貞愛譁ｭ
    const inOwnIACC = ctx.ownerState.field.signi.some(s => s?.at(-1) === targetCnIACC);
    if (inOwnIACC) {
      const overridesIACC = { ...(ctx.ownerState.card_class_overrides ?? {}), [targetCnIACC]: newClassIACC };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: overridesIACC } },
        `${ctx.cardMap.get(targetCnIACC)?.CardName ?? targetCnIACC}縺ｮ繧ｯ繝ｩ繧ｹ繧抵ｼ・{newClassIACC}・槭↓螟画峩`));
    }
    const overridesIACCOp = { ...(ctx.otherState.card_class_overrides ?? {}), [targetCnIACC]: newClassIACC };
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, card_class_overrides: overridesIACCOp } },
      `${ctx.cardMap.get(targetCnIACC)?.CardName ?? targetCnIACC}縺ｮ繧ｯ繝ｩ繧ｹ繧抵ｼ・{newClassIACC}・槭↓螟画峩`));
  }
  // LOSE_COLOR_ALL_ZONES: CONTINUOUS蜉ｹ譫懶ｼ・ffectEngine.collectColorlessOverrides縺ｧ蜍慕噪險育ｮ暦ｼ・  if (stub.id === 'LOSE_COLOR_ALL_ZONES') {
    return done(addLog(ctx, '[LOSE_COLOR_ALL_ZONES: effectEngine縺ｧ蜍慕噪蜃ｦ逅・ｸｭ]'));
  }
  // CHANGE_SIGNI_COLOR: 蟇ｾ雎｡繧ｷ繧ｰ繝九・濶ｲ繧呈欠螳夊牡縺ｫ螟画峩・医ち繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ・・  if (stub.id === 'CHANGE_SIGNI_COLOR') {
    // value 縺後≠繧句ｴ蜷茨ｼ售ELECT_TARGET 縺ｮ蠕悟・逅・ｼ亥ｯｾ雎｡ = lastProcessedCards[0]・・    if (typeof stub.value === 'string' && ctx.lastProcessedCards?.length) {
      const targetCSC2 = ctx.lastProcessedCards[0];
      const newColorCSC2 = stub.value as string;
      const overridesCSC2 = { ...(ctx.otherState.signi_color_overrides ?? {}), [targetCSC2]: newColorCSC2 };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, signi_color_overrides: overridesCSC2 } },
        `${ctx.cardMap.get(targetCSC2)?.CardName ?? targetCSC2}縺ｮ濶ｲ繧・{newColorCSC2}縺ｫ螟画峩`));
    }
    const srcCSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCSC = srcCSC ? (srcCSC.EffectText ?? '') + ' ' + (srcCSC.BurstText ?? '') : '';
    // 螟画峩蜈医・濶ｲ繧呈歓蜃ｺ・医後◎繧後ｒ逋ｽ縺ｫ縺吶ｋ縲阪瑚ｵ､縺ｫ縺吶ｋ縲咲ｭ会ｼ・    const colorMCSC = txtCSC.match(/縺昴ｌ繧・[襍､髱堤ｷ鷹ｻ堤區]+)縺ｫ縺吶ｋ/);
    const newColorCSC = colorMCSC ? colorMCSC[1] : null;
    if (!newColorCSC) return done(addLog(ctx, 'CHANGE_SIGNI_COLOR: 螟画峩蜈郁牡荳肴・'));
    // 繝ｬ繝吶Ν繝輔ぅ繝ｫ繧ｿ・医後Ξ繝吶ΝN莉･荳九・繧ｷ繧ｰ繝九搾ｼ・    const toHWCSC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const lvMaxMCSC = txtCSC.match(/繝ｬ繝吶Ν([・・・兔d]+)莉･荳九・繧ｷ繧ｰ繝・);
    const lvMaxCSC = lvMaxMCSC ? parseInt(toHWCSC(lvMaxMCSC[1])) : 99;
    // 逶ｸ謇九す繧ｰ繝・菴薙ｒ驕ｸ謚橸ｼ・astProcessedCards縺梧里縺ｫ縺ゅｌ縺ｰ逶ｴ謗･驕ｩ逕ｨ・・    const oppSigniCSC = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => {
      if (!c) return false;
      const lv = parseInt(ctx.cardMap.get(c)?.Level ?? '99');
      return lv <= lvMaxCSC;
    });
    if (oppSigniCSC.length === 0) return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・HANGE_SIGNI_COLOR・・));
    const targetCSC = ctx.lastProcessedCards?.[0];
    if (targetCSC && oppSigniCSC.includes(targetCSC)) {
      const overridesCSC = { ...(ctx.otherState.signi_color_overrides ?? {}), [targetCSC]: newColorCSC };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, signi_color_overrides: overridesCSC } },
        `${ctx.cardMap.get(targetCSC)?.CardName ?? targetCSC}縺ｮ濶ｲ繧・{newColorCSC}縺ｫ螟画峩`));
    }
    // 蟇ｾ雎｡驕ｸ謚・    const applyCSC: StubAction = { type: 'STUB', id: 'CHANGE_SIGNI_COLOR', value: newColorCSC };
    return selectOrInteract(oppSigniCSC, 1, false, 'opp_field', applyCSC as EffectAction, undefined, ctx);
  }
  // 繧ｫ繝ｼ繝牙ｱ樊ｧ螟画峩邉ｻ・・ngine: 螻樊ｧ螟画峩繧ｷ繧ｹ繝・Β譛ｪ螳溯｣・ｼ・  // SIGNI_LOSE_COLOR: 蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝・菴薙′濶ｲ繧貞､ｱ縺・ｼ医ち繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ・・  if (stub.id === 'SIGNI_LOSE_COLOR') {
    const targetSLC = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetSLC) {
      const oppOverridesSLC = { ...(ctx.otherState.signi_color_overrides ?? {}), [targetSLC]: '辟｡' };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, signi_color_overrides: oppOverridesSLC } },
        `${ctx.cardMap.get(targetSLC)?.CardName ?? targetSLC}縺瑚牡繧貞､ｱ縺・));
    }
    const oppCandsSLC = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    if (oppCandsSLC.length === 0) return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・IGNI_LOSE_COLOR・・));
    const applySLC: StubAction = { type: 'STUB', id: 'SIGNI_LOSE_COLOR' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: oppCandsSLC, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: applySLC as EffectAction,
    });
  }
  // COPY_SIGNI: 閾ｪ繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝・菴薙ｒ繝医Λ繝・す繝･縺ｮ繧ｷ繧ｰ繝九→蜷後§繧ｫ繝ｼ繝峨↓縺吶ｋ・医ち繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ・・  if (stub.id === 'COPY_SIGNI') {
    const fieldSigniCS = [0,1,2]
      .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => !!cn);
    const trashSigniCS = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
    // Phase 1: lastProcessedCards 縺ｫ繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝九′縺ｪ縺代ｌ縺ｰ驕ｸ謚・    const fieldTargetCS = (ctx.lastProcessedCards ?? []).find(cn => fieldSigniCS.includes(cn));
    if (!fieldTargetCS) {
      if (fieldSigniCS.length === 0) return done(addLog(ctx, '繧ｳ繝斐・蟇ｾ雎｡縺ｪ縺暦ｼ郁・繧ｷ繧ｰ繝九↑縺暦ｼ・));
      const noopCS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contCS: StubAction = { type: 'STUB', id: 'COPY_SIGNI' };
      return needsInteraction(addLog(ctx, '繧ｳ繝斐・縺吶ｋ繧ｷ繧ｰ繝九ｒ驕ｸ謚橸ｼ医ヵ繧｣繝ｼ繝ｫ繝峨°繧会ｼ・), {
        type: 'SELECT_TARGET', candidates: fieldSigniCS, count: 1, optional: false,
        targetScope: 'self_field', thenAction: noopCS as EffectAction, continuation: contCS as EffectAction,
      });
    }
    // Phase 2: 繝医Λ繝・す繝･繧ｷ繧ｰ繝九ｒ驕ｸ謚橸ｼ医さ繝斐・蜈・ｼ・    if (trashSigniCS.length === 0) return done(addLog(ctx, '繧ｳ繝斐・蜈・↑縺暦ｼ医ヨ繝ｩ繝・す繝･縺ｫ繧ｷ繧ｰ繝九↑縺暦ｼ・));
    const noopCS2: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contCS2: StubAction = { type: 'STUB', id: 'INTERNAL_COPY_SIGNI_APPLY', value: fieldTargetCS };
    return needsInteraction(addLog(ctx, '繧ｳ繝斐・蜈・す繧ｰ繝九ｒ驕ｸ謚橸ｼ医ヨ繝ｩ繝・す繝･縺九ｉ・・), {
      type: 'SELECT_TARGET', candidates: trashSigniCS, count: 1, optional: false,
      targetScope: 'self_trash', thenAction: noopCS2 as EffectAction, continuation: contCS2 as EffectAction,
    });
  }
  // INTERNAL_COPY_SIGNI_APPLY: card_identity_overrides 繧定ｨｭ螳壹＠縺ｦ繧ｳ繝斐・繧帝←逕ｨ
  if (stub.id === 'INTERNAL_COPY_SIGNI_APPLY') {
    const fieldNumICSA = typeof stub.value === 'string' ? stub.value : '';
    const trashNumICSA = (ctx.lastProcessedCards ?? [])[0];
    if (!fieldNumICSA || !trashNumICSA) return done(addLog(ctx, '繧ｳ繝斐・驕ｩ逕ｨ螟ｱ謨・));
    const overridesICSA = { ...(ctx.ownerState.card_identity_overrides ?? {}), [fieldNumICSA]: trashNumICSA };
    const newOwnerICSA = { ...ctx.ownerState, card_identity_overrides: overridesICSA };
    const fieldName = ctx.cardMap.get(fieldNumICSA)?.CardName ?? fieldNumICSA;
    const trashName = ctx.cardMap.get(trashNumICSA)?.CardName ?? trashNumICSA;
    return done(addLog({ ...ctx, ownerState: newOwnerICSA },
      `${fieldName}縺・{trashName}縺ｨ蜷後§繧ｫ繝ｼ繝峨↓縺ｪ繧具ｼ医ち繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ・荏));
  }
  // ALL_CLASS: CONTINUOUS竊弾ffectEngine.collectAllClassSigni縺ｧ蜍慕噪蜃ｦ逅・ｸ医∩
  if (stub.id === 'ALL_CLASS') return done(addLog(ctx, '[ALL_CLASS: effectEngine縺ｧ蜃ｦ逅・'));
  // ALL_COLOR: CONTINUOUS竊弾ffectEngine.collectAllColorSigni縺ｧ蜍慕噪蜃ｦ逅・ｸ医∩
  if (stub.id === 'ALL_COLOR') return done(addLog(ctx, '[ALL_COLOR: effectEngine縺ｧ蜃ｦ逅・'));
  // ALL_ZONE_BLACK: CONTINUOUS竊弾ffectEngine.collectAllZoneBlackCardNums縺ｧ蜍慕噪蜃ｦ逅・ｸ医∩
  if (stub.id === 'ALL_ZONE_BLACK') return done(addLog(ctx, '[ALL_ZONE_BLACK: effectEngine縺ｧ蜃ｦ逅・'));
  // ALL_CARDS_COLOR_CHANGE_BLACK: CONTINUOUS竊弾ffectEngine.hasAllCardsColorBlack縺ｧ蜍慕噪蜃ｦ逅・ｸ医∩
  if (stub.id === 'ALL_CARDS_COLOR_CHANGE_BLACK') return done(addLog(ctx, '[ALL_CARDS_COLOR_CHANGE_BLACK: effectEngine縺ｧ蜃ｦ逅・'));
  // ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE: 縺薙・繧ｲ繝ｼ繝荳ｭ縲∝・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ謖・ｮ壹ち繧､繝励ｒ霑ｽ蜉縺ｧ蠕励ｋ
  if (stub.id === 'ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE') {
    const srcACLGT = ctx.sourceCardNum ? ctx.cardMap.get(getCardNum(ctx.sourceCardNum)) : undefined;
    const txtACLGT = srcACLGT ? (srcACLGT.EffectText ?? '') : '';
    const typeMACLGT = txtACLGT.match(/縺吶∋縺ｦ縺ｮ蝣ｴ縺ｫ縺ゅｋ繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ・・[^・枉+)・槭ｒ霑ｽ蜉縺ｧ蠕励ｋ/);
    const gainTypeACLGT = typeMACLGT?.[1] ?? '縺ｶ縺上・繧ｿ繝・;
    const newOwnerACLGT: PlayerState = { ...ctx.ownerState, lrig_gained_types: [...new Set([...(ctx.ownerState.lrig_gained_types ?? []), gainTypeACLGT])] };
    const newOtherACLGT: PlayerState = { ...ctx.otherState, lrig_gained_types: [...new Set([...(ctx.otherState.lrig_gained_types ?? []), gainTypeACLGT])] };
    return done(addLog({ ...ctx, ownerState: newOwnerACLGT, otherState: newOtherACLGT }, `縺薙・繧ｲ繝ｼ繝荳ｭ: 蜈ｨ繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ・・{gainTypeACLGT}・槭ｒ蠕励ｋ`));
  }
  // CHANGE_BASE_LEVEL: 縺薙・繧ｷ繧ｰ繝九・蝓ｺ譛ｬ繝ｬ繝吶Ν繧・・・縺ｫ縺励※繧ゅｈ縺・ｼ医ち繝ｼ繝ｳ邨ゆｺ・∪縺ｧ・・  if (stub.id === 'CHANGE_BASE_LEVEL') {
    const srcCBL = ctx.sourceCardNum;
    if (!srcCBL) return done(addLog(ctx, 'CHANGE_BASE_LEVEL: 繧ｽ繝ｼ繧ｹ縺ｪ縺・));
    if (typeof stub.value === 'number') {
      const newOvCBL = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [srcCBL]: stub.value as number };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: newOvCBL } },
        `${ctx.cardMap.get(srcCBL)?.CardName ?? srcCBL}縺ｮ蝓ｺ譛ｬ繝ｬ繝吶Ν繧・{stub.value}縺ｫ螟画峩`));
    }
    const optsCBL = [1,2,3].map(lv => ({
      id: `lv_${lv}`, label: `繝ｬ繝吶Ν${lv}縺ｫ縺吶ｋ`,
      action: ({ type: 'STUB', id: 'CHANGE_BASE_LEVEL', value: lv } as StubAction) as EffectAction,
      available: true,
    }));
    optsCBL.push({ id: 'skip', label: '繧ｹ繧ｭ繝・・',
      action: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction) as EffectAction, available: true });
    return needsInteraction(addLog(ctx, '蝓ｺ譛ｬ繝ｬ繝吶Ν繧貞､画峩縺励※繧ゅｈ縺・ｼ・・・・・), {
      type: 'CHOOSE', options: optsCBL, count: 1,
    });
  }
  // CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN: 繧ｷ繧ｰ繝・菴薙・蝓ｺ譛ｬ繝ｬ繝吶Ν繧・縺ｫ縺励※繧ゅｈ縺・ｼ域ｬ｡縺ｮ閾ｪ繧ｿ繝ｼ繝ｳ邨ゆｺ・∪縺ｧ・・  if (stub.id === 'CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN') {
    if (ctx.lastProcessedCards?.length) {
      const targetCBLUNT = ctx.lastProcessedCards[0];
      const newOvCBLUNT = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [targetCBLUNT]: 1 };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: newOvCBLUNT } },
        `${ctx.cardMap.get(targetCBLUNT)?.CardName ?? targetCBLUNT}縺ｮ蝓ｺ譛ｬ繝ｬ繝吶Ν繧・縺ｫ螟画峩`));
    }
    const allSigniCBLUNT = [...ctx.ownerState.field.signi, ...ctx.otherState.field.signi]
      .flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    if (allSigniCBLUNT.length === 0) return done(addLog(ctx, '蟇ｾ雎｡繧ｷ繧ｰ繝九↑縺暦ｼ・HANGE_BASE_LEVEL_UNTIL_NEXT_TURN・・));
    const contCBLUNT: StubAction = { type: 'STUB', id: 'CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN' };
    return needsInteraction(addLog(ctx, '繧ｷ繧ｰ繝九ｒ驕ｸ謚橸ｼ亥渕譛ｬ繝ｬ繝吶Ν繧・縺ｫ縺励※繧ゅｈ縺・ｼ・), {
      type: 'SELECT_TARGET', candidates: allSigniCBLUNT, count: 1, optional: true,
      targetScope: 'self_field', thenAction: contCBLUNT as EffectAction,
    });
  }
  // COPY_CARD: 縺薙・繧ｷ繧ｰ繝九・lastProcessed[0]縺ｮ繧ｫ繝ｼ繝峨→繝ｬ繝吶Ν莉･螟門酔縺倥↓縺ｪ繧具ｼ・ard_identity_overrides・・  if (stub.id === 'COPY_CARD') {
    const srcCC = ctx.sourceCardNum;
    const targetCC = ctx.lastProcessedCards?.[0];
    if (!srcCC || !targetCC) return done(addLog(ctx, 'COPY_CARD: 繧ｽ繝ｼ繧ｹ縺ｾ縺溘・繧ｳ繝斐・蜈・↑縺・));
    const overridesCC2 = { ...(ctx.ownerState.card_identity_overrides ?? {}), [srcCC]: targetCC };
    const newOwnerCC2: PlayerState = { ...ctx.ownerState, card_identity_overrides: overridesCC2 };
    return done(addLog({ ...ctx, ownerState: newOwnerCC2 },
      `${ctx.cardMap.get(srcCC)?.CardName ?? srcCC}縺・{ctx.cardMap.get(targetCC)?.CardName ?? targetCC}縺ｮ繧ｳ繝斐・縺ｫ縺ｪ繧義));
  }
  // CENTER_LRIG_COLOR_CHANGE_BLACK: 縺薙・繧ｿ繝ｼ繝ｳ縲√そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ鮟偵ｒ蠕励ｋ・・CTIVATED蜉ｹ譫懶ｼ・  if (stub.id === 'CENTER_LRIG_COLOR_CHANGE_BLACK') {
    const curExtraCLCB = ctx.ownerState.lrig_extra_colors ?? [];
    if (!curExtraCLCB.includes('鮟・)) {
      const newOwnerCLCB: PlayerState = { ...ctx.ownerState, lrig_extra_colors: [...curExtraCLCB, '鮟・] };
      return done(addLog({ ...ctx, ownerState: newOwnerCLCB }, '縺薙・繧ｿ繝ｼ繝ｳ縲√そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ鮟偵ｒ蠕励ｋ'));
    }
    return done(addLog(ctx, '繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ縺吶〒縺ｫ鮟偵ｒ謖√▽'));
  }
  if (stub.id === 'DECK_SIGNI_LEVEL_OVERRIDE' || stub.id === 'DYNAMIC_LEVEL_BY_ENERGY'
      || stub.id === 'LEVEL_REFERENCE_OVERRIDE' || stub.id === 'LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT'
      || stub.id === 'INHERIT_OPP_LRIG_TYPE' || stub.id === 'INHERIT_UNDER_SIGNI_COLOR') {
    return done(addLog(ctx, `[螻樊ｧ螟画峩: ${stub.id}]`));
  }
  // SIGNI_GAIN_ONE_LRIG_COLOR: 縺薙・繧ｷ繧ｰ繝九′繝ｫ繝ｪ繧ｰ縺ｮ濶ｲ繧・縺､蠕励ｋ・医ち繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ・・  if (stub.id === 'SIGNI_GAIN_ONE_LRIG_COLOR') {
    const srcSGOLC = ctx.sourceCardNum;
    if (!srcSGOLC) return done(addLog(ctx, 'SIGNI_GAIN_ONE_LRIG_COLOR: 繧ｽ繝ｼ繧ｹ縺ｪ縺・));
    const lrigCnSGOLC = ctx.ownerState.field.lrig.at(-1);
    const lrigColorSGOLC = lrigCnSGOLC ? (ctx.cardMap.get(lrigCnSGOLC)?.Color ?? '').split('')[0] : null;
    if (!lrigColorSGOLC) return done(addLog(ctx, 'SIGNI_GAIN_ONE_LRIG_COLOR: 繝ｫ繝ｪ繧ｰ濶ｲ荳肴・'));
    const origCardSGOLC = ctx.cardMap.get(srcSGOLC);
    const origColorSGOLC = origCardSGOLC?.Color ?? '辟｡';
    const newColorSGOLC = origColorSGOLC.includes(lrigColorSGOLC) ? origColorSGOLC : origColorSGOLC + lrigColorSGOLC;
    const overridesSGOLC = { ...(ctx.ownerState.signi_color_overrides ?? {}), [srcSGOLC]: newColorSGOLC };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, signi_color_overrides: overridesSGOLC } },
      `${origCardSGOLC?.CardName ?? srcSGOLC}縺・{lrigColorSGOLC}繧貞ｾ励ｋ`));
  }
  // STACK_ALL_LRIG_UNDER: 繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･蜈ｨ繝ｫ繝ｪ繧ｰ繧偵％縺ｮ繧ｫ繝ｼ繝峨・荳九↓鄂ｮ縺・  if (stub.id === 'STACK_ALL_LRIG_UNDER') {
    const lrigTrashSALU = ctx.ownerState.lrig_trash ?? [];
    if (lrigTrashSALU.length === 0) return done(addLog(ctx, '繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｪ縺暦ｼ・TACK_ALL_LRIG_UNDER・・));
    const newLrigStack = [...lrigTrashSALU, ...ctx.ownerState.field.lrig];
    const newOwnerSALU: PlayerState = {
      ...ctx.ownerState,
      lrig_trash: [],
      field: { ...ctx.ownerState.field, lrig: newLrigStack },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerSALU },
      `繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･${lrigTrashSALU.length}譫壹ｒ繝ｫ繝ｪ繧ｰ繧ｹ繧ｿ繝・け荳九↓驟咲ｽｮ`));
  }
  // LRIG_RIDE_SIGNI: 繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺後☆縺ｹ縺ｦ縺ｮ荵玲ｩ溘す繧ｰ繝九↓荵励ｋ・医ラ繝ｩ繧､繝也憾諷具ｼ・  if (stub.id === 'LRIG_RIDE_SIGNI') {
    const ridingAllLRS = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('荵玲ｩ・) ? [top] : [];
    });
    if (ridingAllLRS.length === 0) return done(addLog(ctx, '荵玲ｩ溘す繧ｰ繝九↑縺暦ｼ・RIG_RIDE_SIGNI・・));
    const newOwnerLRS = { ...ctx.ownerState, lrig_riding_signi: ridingAllLRS };
    return done(addLog({ ...ctx, ownerState: newOwnerLRS },
      `繝ｫ繝ｪ繧ｰ縺・{ridingAllLRS.length}菴薙・荵玲ｩ溘す繧ｰ繝九↓荵励ｋ・医ラ繝ｩ繧､繝也憾諷具ｼ荏));
  }
  // CENTER_LRIG_RIDES_ON_SIGNI: 繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺碁∈謚槭＠縺・菴薙・荵玲ｩ溘す繧ｰ繝九↓荵励ｋ・井ｹ励ｊ謠帙∴蜿ｯ・・  if (stub.id === 'CENTER_LRIG_RIDES_ON_SIGNI') {
    const selectedCLR = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (selectedCLR) {
      const newOwnerCLR = { ...ctx.ownerState, lrig_riding_signi: [selectedCLR] };
      return done(addLog({ ...ctx, ownerState: newOwnerCLR },
        `繝ｫ繝ｪ繧ｰ縺・{ctx.cardMap.get(selectedCLR)?.CardName ?? selectedCLR}縺ｫ荵励ｋ・医ラ繝ｩ繧､繝也憾諷具ｼ荏));
    }
    const rideCandCLR = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('荵玲ｩ・) ? [top] : [];
    });
    if (rideCandCLR.length === 0) return done(addLog(ctx, '荵玲ｩ溘す繧ｰ繝九↑縺暦ｼ・ENTER_LRIG_RIDES_ON_SIGNI・・));
    const contCLR: StubAction = { type: 'STUB', id: 'CENTER_LRIG_RIDES_ON_SIGNI' };
    const noopCLR: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(rideCandCLR, 1, false, 'self_field', noopCLR as EffectAction, contCLR as EffectAction, ctx);
  }
  // CENTER_LRIG_DISMOUNT: 繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺後☆縺ｹ縺ｦ縺ｮ荵玲ｩ溘す繧ｰ繝九°繧蛾剄繧翫ｋ・医ラ繝ｩ繧､繝冶ｧ｣髯､繝ｻ莉ｻ諢擾ｼ・  if (stub.id === 'CENTER_LRIG_DISMOUNT') {
    if (!ctx.ownerState.lrig_riding_signi?.length) {
      return done(addLog(ctx, '繝峨Λ繧､繝也憾諷九〒縺ｯ縺ｪ縺・ｼ・ENTER_LRIG_DISMOUNT 繧ｹ繧ｭ繝・・・・));
    }
    const dismountOpt: StubAction = { type: 'STUB', id: 'INTERNAL_DISMOUNT_DO' };
    const skipOpt: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, '繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺御ｹ玲ｩ溘す繧ｰ繝九°繧蛾剄繧翫∪縺吶°・・), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'dismount', label: '髯阪ｊ繧具ｼ医ラ繝ｩ繧､繝冶ｧ｣髯､・・, action: dismountOpt as EffectAction, available: true },
        { id: 'stay',     label: '縺昴・縺ｾ縺ｾ',              action: skipOpt as EffectAction,     available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_DISMOUNT_DO') {
    const newOwnerDM = { ...ctx.ownerState, lrig_riding_signi: [] };
    return done(addLog({ ...ctx, ownerState: newOwnerDM }, '繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺碁剄繧翫◆・医ラ繝ｩ繧､繝冶ｧ｣髯､・・));
  }
  // LRIG_GAIN_ABILITY: 繧ｿ繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ縲√そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ逶ｴ蜑阪↓驕ｸ謚槭＠縺溯・蜉帙ｒ蠕励ｋ
  if (stub.id === 'LRIG_GAIN_ABILITY') {
    const selectedAbilityLGA = ctx.lastProcessedCards?.[0]; // CHOOSE 縺ｧ驕ｸ謚槭＆繧後◆閭ｽ蜉姜D
    if (!selectedAbilityLGA) return done(addLog(ctx, 'LRIG_GAIN_ABILITY: 驕ｸ謚櫁・蜉帙↑縺・));
    // keyword_grants 縺ｫ莉倅ｸ趣ｼ医Ν繝ｪ繧ｰ縺ｮCardNum繧偵く繝ｼ縺ｨ縺励※・・    const lrigCnLGA = ctx.ownerState.field.lrig.at(-1);
    if (!lrigCnLGA) return done(addLog(ctx, 'LRIG_GAIN_ABILITY: 繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｪ縺・));
    const grantMapLGA = { ...(ctx.ownerState.keyword_grants ?? {}) };
    const existingLGA = grantMapLGA[lrigCnLGA] ?? [];
    if (!existingLGA.includes(selectedAbilityLGA)) {
      grantMapLGA[lrigCnLGA] = [...existingLGA, selectedAbilityLGA];
    }
    const newOwnerLGA: PlayerState = { ...ctx.ownerState, keyword_grants: grantMapLGA };
    return done(addLog({ ...ctx, ownerState: newOwnerLGA }, `繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺瑚・蜉帙・{selectedAbilityLGA}縲阪ｒ蠕励ｋ`));
  }
  // GAIN_ADDITIONAL_LRIG_TYPE / GAIN_LRIG_COLOR: CONT蜉ｹ譫懶ｼ・ffectEngine/collectLrigNameAliases縺ｧ蜍慕噪蜃ｦ逅・ｼ・  if (stub.id === 'GAIN_ADDITIONAL_LRIG_TYPE' || stub.id === 'GAIN_LRIG_COLOR') {
    return done(addLog(ctx, `[繝ｫ繝ｪ繧ｰ繧ｷ繧ｹ繝・Β: ${stub.id}・・ffectEngine縺ｧ蜍慕噪蜃ｦ逅・ｼ云`));
  }
  // LRIG_ALL_NAMES: CONT蜉ｹ譫懶ｼ・ollectLrigNameAliases縺ｧ蜃ｦ逅・ｸ医∩・・  if (stub.id === 'LRIG_ALL_NAMES') {
    return done(addLog(ctx, '[LRIG_ALL_NAMES: effectEngine縺ｧ蜃ｦ逅・ｸ医∩]'));
  }
  // 繝峨Ο繝ｼ譫壽焚蛻ｶ髯撰ｼ域ｬ｡縺ｮ繧ｿ繝ｼ繝ｳ・・  if (stub.id === 'LIMIT_OPP_DRAW_COUNT') {
    const srcLODC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLODC = srcLODC ? (srcLODC.EffectText ?? '') + ' ' + (srcLODC.BurstText ?? '') : '';
    const toHWLODC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const limitM = txtLODC.match(/蜷郁ｨ・[・・・兔d]+)譫壹∪縺ｧ縺励°蠑輔￠縺ｪ縺・);
    const limitVal = limitM ? parseInt(toHWLODC(limitM[1])) : 1;
    const newOtherLODC: PlayerState = { ...ctx.otherState, draw_limit: limitVal };
    return done(addLog({ ...ctx, otherState: newOtherLODC }, `蟇ｾ謌ｦ逶ｸ謇九・谺｡繧ｿ繝ｼ繝ｳ縺ｮ繝峨Ο繝ｼ荳企剞${limitVal}譫壹↓蛻ｶ髯秦));
  }
  // 謇区惆荳企剞蠅怜刈・・ONTINUOUS・壹す繧ｰ繝九′繝輔ぅ繝ｼ繝ｫ繝峨↓縺ゅｋ髢難ｼ・  // HAND_SIZE_INCREASE: 謇区惆荳企剞繧貞｢励ｄ縺・/ REDUCE_OPP_HAND_LIMIT: 逶ｸ謇九・謇区惆荳企剞繧呈ｸ帙ｉ縺・  if (stub.id === 'HAND_SIZE_INCREASE' || stub.id === 'REDUCE_OPP_HAND_LIMIT') {
    const srcHSI = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHSI = srcHSI ? (srcHSI.EffectText ?? '') + ' ' + (srcHSI.BurstText ?? '') : '';
    const toHWHSI = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 縲梧焔譛ｭ繧誰譫壹∪縺ｧ縲阪ヱ繧ｿ繝ｼ繝ｳ・育峩謗･謖・ｮ夲ｼ・    const limitM = txtHSI.match(/謇区惆繧・[・・・兔d]+)譫壹∪縺ｧ/);
    // 縲梧焔譛ｭ縺ｮ譫壽焚縺ｮ荳企剞縺ｯN蠅励∴繧具ｼ・譫壹°繧窺譫壹↓縺ｪ繧具ｼ峨阪ヱ繧ｿ繝ｼ繝ｳ
    const increaseM = txtHSI.match(/謇区惆縺ｮ譫壽焚縺ｮ荳企剞縺ｯ([・・・兔d]+)蠅励∴繧・);
    // 縲・譫壹°繧丑譫壹↓縺ｪ繧九阪ヱ繧ｿ繝ｼ繝ｳ・域峡蠑ｧ蜀・・荳企剞蛟､・・    const becomeM = txtHSI.match(/[・・].*縺九ｉ([・・・兔d]+)譫壹↓縺ｪ繧擬・・]/);
    const DEFAULT_HAND = 6;
    let newLimit: number | null = null;
    if (limitM) newLimit = parseInt(toHWHSI(limitM[1]));
    else if (becomeM) newLimit = parseInt(toHWHSI(becomeM[1]));
    else if (increaseM) newLimit = DEFAULT_HAND + parseInt(toHWHSI(increaseM[1]));
    if (stub.id === 'HAND_SIZE_INCREASE' && newLimit !== null) {
      const newOwnerHSI = { ...ctx.ownerState, hand_limit: newLimit };
      return done(addLog({ ...ctx, ownerState: newOwnerHSI }, `謇区惆荳企剞繧・{newLimit}譫壹↓險ｭ螳啻));
    }
    if (stub.id === 'REDUCE_OPP_HAND_LIMIT' && newLimit !== null) {
      const newOtherHSI = { ...ctx.otherState, hand_limit: newLimit };
      return done(addLog({ ...ctx, otherState: newOtherHSI }, `逶ｸ謇区焔譛ｭ荳企剞繧・{newLimit}譫壹↓險ｭ螳啻));
    }
    return done(addLog(ctx, `[謇区惆蛻ｶ髯・ ${stub.id}]`));
  }
  // 繝ｩ繧､繝輔ヰ繝ｼ繧ｹ繝育音谿奇ｼ・ngine: 逋ｺ蜍輔す繧ｹ繝・Β謾ｹ菫ｮ蠢・ｦ・ｼ・  // LIFE_BURST_DOUBLE: 縺薙・繧ｿ繝ｼ繝ｳ縲∵ｬ｡縺ｮ繝ｩ繧､繝輔ヰ繝ｼ繧ｹ繝医・2蝗樒匱蜍輔☆繧・  if (stub.id === 'LIFE_BURST_DOUBLE') {
    const newOwnerLBD: PlayerState = { ...ctx.ownerState, life_burst_double_next: true };
    return done(addLog({ ...ctx, ownerState: newOwnerLBD }, '縺薙・繧ｿ繝ｼ繝ｳ谺｡縺ｮ繝ｩ繧､繝輔ヰ繝ｼ繧ｹ繝医・2蝗樒匱蜍輔☆繧・));
  }
  // TRIGGER_LIFE_BURST: lastProcessedCards[0] 縺ｮLB繧堤匱蜍包ｼ・ield.check縺ｫ繧ｻ繝・ヨ・・  if (stub.id === 'TRIGGER_LIFE_BURST') {
    const cardTLB = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cardTLB) return done(addLog(ctx, 'TRIGGER_LIFE_BURST: 繧ｫ繝ｼ繝峨↑縺・));
    const dataTLB = ctx.cardMap.get(cardTLB);
    if (!dataTLB?.BurstText) return done(addLog(ctx, `${dataTLB?.CardName ?? cardTLB}: LB縺ｪ縺輿));
    const newOwnerTLB: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, check: cardTLB } };
    return done(addLog({ ...ctx, ownerState: newOwnerTLB },
      `繝ｩ繧､繝輔ヰ繝ｼ繧ｹ繝育匱蜍・ ${dataTLB.CardName}`));
  }
  // BATTLE_BANISH_LIFE_BURST: 繝舌ヨ繝ｫ繝舌ル繝・す繝･蠕後↓逶ｸ謇句・LB繧堤匱蜍・  if (stub.id === 'BATTLE_BANISH_LIFE_BURST') {
    const cardBBLB = ctx.lastProcessedCards?.[0];
    if (!cardBBLB) return done(addLog(ctx, 'BATTLE_BANISH_LIFE_BURST: 繧ｫ繝ｼ繝峨↑縺・));
    const dataBBLB = ctx.cardMap.get(cardBBLB);
    if (!dataBBLB?.BurstText) return done(addLog(ctx, `${dataBBLB?.CardName ?? cardBBLB}: LB縺ｪ縺輿));
    const newOtherBBLB: PlayerState = { ...ctx.otherState, field: { ...ctx.otherState.field, check: cardBBLB } };
    return done(addLog({ ...ctx, otherState: newOtherBBLB },
      `繝舌ヨ繝ｫ繝舌ル繝・す繝･LB: ${dataBBLB.CardName}`));
  }
  // BEAT_ZONE_OP: 繝薙・繝医だ繝ｼ繝ｳ謫堺ｽ懶ｼ医後舌ン繝ｼ繝医代↓縺吶ｋ縲阪∪縺溘・縲後舌ン繝ｼ繝医代′N譫壻ｻ･荳九肴擅莉ｶ繝√ぉ繝・け・・  if (stub.id === 'BEAT_ZONE_OP') {
    const srcBZO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtBZO = srcBZO ? (srcBZO.EffectText ?? '') + ' ' + (srcBZO.BurstText ?? '') : '';
    const toHWBZO = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 譚｡莉ｶ繝√ぉ繝・け繝代ち繝ｼ繝ｳ: 縲後舌ン繝ｼ繝医代′N譫壻ｻ･荳九・蝣ｴ蜷医・    const condMBZO = txtBZO.match(/縲舌ン繝ｼ繝医代′([・・・兔d]+)譫壻ｻ･荳・);
    if (condMBZO) {
      const threshBZO = parseInt(toHWBZO(condMBZO[1]));
      const beatCountBZO = (ctx.ownerState.field.beat_zone ?? []).length;
      if (beatCountBZO > threshBZO) {
        return done(addLog(ctx, `繝薙・繝域擅莉ｶ荳肴・遶具ｼ育樟蝨ｨ${beatCountBZO}譫・> ${threshBZO}・俄・繧ｹ繧ｭ繝・・`));
      }
      return done(addLog(ctx, `繝薙・繝域擅莉ｶ謌千ｫ具ｼ育樟蝨ｨ${beatCountBZO}譫・竕､ ${threshBZO}・荏));
    }
    // 縲後舌ン繝ｼ繝医代↓縺吶ｋ縲・ 繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝九ｒ驕ｸ謚槭＠縺ｦ繝薙・繝医だ繝ｼ繝ｳ縺ｸ
    const fieldCandsBZO = ctx.ownerState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    if (fieldCandsBZO.length === 0) return done(addLog(ctx, '繝薙・繝医↓縺吶ｋ繧ｷ繧ｰ繝九↑縺・));
    return needsInteraction(addLog(ctx, '繝薙・繝医↓縺吶ｋ繧ｷ繧ｰ繝九ｒ驕ｸ謚・), {
      type: 'SELECT_TARGET', candidates: fieldCandsBZO, count: 1, optional: false,
      targetScope: 'self_field',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_MOVE_TO_BEAT' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_MOVE_TO_BEAT: 驕ｸ謚槭す繧ｰ繝九ｒ繝薙・繝医だ繝ｼ繝ｳ縺ｸ遘ｻ蜍・  if (stub.id === 'INTERNAL_MOVE_TO_BEAT') {
    const cardIMTB = ctx.lastProcessedCards?.[0];
    if (!cardIMTB) return done(addLog(ctx, 'INTERNAL_MOVE_TO_BEAT: 繧ｫ繝ｼ繝峨↑縺・));
    const newSigniIMTB = ctx.ownerState.field.signi.map(s => {
      if (!s?.at(-1)?.includes(cardIMTB)) return s;
      const f = s.filter(c => c !== cardIMTB);
      return f.length > 0 ? f : null;
    }) as (string[] | null)[];
    const newBeatIMTB = [...(ctx.ownerState.field.beat_zone ?? []), cardIMTB];
    const newOwnerIMTB: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniIMTB, beat_zone: newBeatIMTB } };
    return done(addLog({ ...ctx, ownerState: newOwnerIMTB },
      `${ctx.cardMap.get(cardIMTB)?.CardName ?? cardIMTB}繧偵ン繝ｼ繝医だ繝ｼ繝ｳ縺ｸ`));
  }
  if (stub.id === 'TRASH_SIGNI_TO_BEAT') {
    const selectedTSTB = ctx.lastProcessedCards ?? [];
    if (selectedTSTB.length > 0) {
      const newBeatTSTB = [...(ctx.ownerState.field.beat_zone ?? []), ...selectedTSTB];
      const newTrashTSTB = ctx.ownerState.trash.filter(cn => !selectedTSTB.includes(cn));
      const newOwnerTSTB: PlayerState = { ...ctx.ownerState, trash: newTrashTSTB, field: { ...ctx.ownerState.field, beat_zone: newBeatTSTB } };
      const namesTSTB = selectedTSTB.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('繝ｻ');
      return done(addLog({ ...ctx, ownerState: newOwnerTSTB }, `${namesTSTB}繧偵ン繝ｼ繝医だ繝ｼ繝ｳ縺ｸ`));
    }
    const candsTSTB = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
    if (candsTSTB.length === 0) return done(addLog(ctx, '繝医Λ繝・す繝･縺ｫ繧ｷ繧ｰ繝九↑縺暦ｼ・RASH_SIGNI_TO_BEAT・・));
    const noopTSTB: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contTSTB: StubAction = { type: 'STUB', id: 'TRASH_SIGNI_TO_BEAT' };
    return needsInteraction(addLog(ctx, '繝薙・繝医↓縺吶ｋ繧ｷ繧ｰ繝九ｒ譛螟ｧ2譫夐∈謚・), {
      type: 'SELECT_TARGET', candidates: candsTSTB, count: Math.min(2, candsTSTB.length), optional: true,
      targetScope: 'self_trash', thenAction: noopTSTB as EffectAction, continuation: contTSTB as EffectAction,
    });
  }
  // SIGNI_UNDER_WEAPON_SIGNI: 閾ｪ繧ｷ繧ｰ繝・菴薙ｒ閾ｪ・懊え繧ｧ繝昴Φ・槭す繧ｰ繝九・荳九↓鄂ｮ縺・  if (stub.id === 'SIGNI_UNDER_WEAPON_SIGNI') {
    const ownFieldSUWS = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    const sourceSUWS = (ctx.lastProcessedCards ?? []).find(cn => ownFieldSUWS.includes(cn));
    if (!sourceSUWS) {
      if (ownFieldSUWS.length === 0) return done(addLog(ctx, '閾ｪ繧ｷ繧ｰ繝九↑縺暦ｼ・IGNI_UNDER_WEAPON_SIGNI・・));
      const noop: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const cont: StubAction = { type: 'STUB', id: 'SIGNI_UNDER_WEAPON_SIGNI' };
      return needsInteraction(addLog(ctx, '荳九↓鄂ｮ縺上す繧ｰ繝九ｒ驕ｸ謚・), {
        type: 'SELECT_TARGET', candidates: ownFieldSUWS, count: 1, optional: false,
        targetScope: 'self_field', thenAction: noop as EffectAction, continuation: cont as EffectAction,
      });
    }
    const weaponCandsSUWS = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => !!cn && cn !== sourceSUWS &&
        (ctx.cardMap.get(cn)?.CardClass ?? '').includes('繧ｦ繧ｧ繝昴Φ'));
    if (weaponCandsSUWS.length === 0) return done(addLog(ctx, '繧ｦ繧ｧ繝昴Φ繧ｷ繧ｰ繝九↑縺暦ｼ・IGNI_UNDER_WEAPON_SIGNI・・));
    const applyStubSUWS: StubAction = { type: 'STUB', id: 'INTERNAL_SIGNI_UNDER_WEAPON', value: sourceSUWS };
    return needsInteraction(addLog(ctx, '荳九↓鄂ｮ縺丞・縺ｮ・懊え繧ｧ繝昴Φ・槭す繧ｰ繝九ｒ驕ｸ謚・), {
      type: 'SELECT_TARGET', candidates: weaponCandsSUWS, count: 1, optional: false,
      targetScope: 'self_field', thenAction: applyStubSUWS as EffectAction,
    });
  }
  // INTERNAL_SIGNI_UNDER_WEAPON: 驕ｸ謚槭す繧ｰ繝九ｒ・懊え繧ｧ繝昴Φ・槭・荳九↓驟咲ｽｮ
  if (stub.id === 'INTERNAL_SIGNI_UNDER_WEAPON') {
    const srcSUWI = typeof stub.value === 'string' ? stub.value : '';
    const weaponSUWI = ctx.lastProcessedCards?.[0];
    if (!srcSUWI || !weaponSUWI) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺暦ｼ・NTERNAL_SIGNI_UNDER_WEAPON・・));
    const signiSUWI = [...(ctx.ownerState.field.signi ?? [])] as (string[] | null)[];
    const srcZoneSUWI = signiSUWI.findIndex(s => s?.at(-1) === srcSUWI);
    const weaponZoneSUWI = signiSUWI.findIndex(s => s?.at(-1) === weaponSUWI);
    if (srcZoneSUWI < 0 || weaponZoneSUWI < 0) return done(addLog(ctx, '繧ｾ繝ｼ繝ｳ迚ｹ螳壻ｸ榊庄・・NTERNAL_SIGNI_UNDER_WEAPON・・));
    const srcStackSUWI = [...(signiSUWI[srcZoneSUWI] ?? [])];
    signiSUWI[srcZoneSUWI] = srcStackSUWI.length > 1 ? srcStackSUWI.slice(0, -1) : null;
    signiSUWI[weaponZoneSUWI] = [srcSUWI, ...(signiSUWI[weaponZoneSUWI] ?? [])];
    const newOwnerSUWI = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: signiSUWI } };
    return done(addLog({ ...ctx, ownerState: newOwnerSUWI },
      `${ctx.cardMap.get(srcSUWI)?.CardName ?? srcSUWI}繧・{ctx.cardMap.get(weaponSUWI)?.CardName ?? weaponSUWI}縺ｮ荳九↓驟咲ｽｮ`));
  }
  // PLACE_DECK_TOP_UNDER_WEAPON_SIGNI: 繧ｦ繧ｧ繝昴Φ繧ｷ繧ｰ繝九・荳九↓繝・ャ繧ｭ荳翫ｒ鄂ｮ縺・  if (stub.id === 'PLACE_DECK_TOP_UNDER_WEAPON_SIGNI') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const newSigniPDTUW = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const topCardPDTUW = ctx.ownerState.deck[0];
    // 繧ｦ繧ｧ繝昴Φ繧ｷ繧ｰ繝九・繧ｾ繝ｼ繝ｳ繧呈爾縺・    let placedPDTUW = false;
    for (let zi = 0; zi < 3; zi++) {
      const stack = newSigniPDTUW[zi];
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      const card = ctx.cardMap.get(topNum);
      if (card?.CardClass?.includes('繧ｦ繧ｧ繝昴Φ') || card?.CardClass?.includes('豁ｦ蝎ｨ')) {
        newSigniPDTUW[zi] = [topCardPDTUW, ...stack]; // 繝・ャ繧ｭ荳翫ｒ繧ｹ繧ｿ繝・け蠎輔↓霑ｽ蜉
        placedPDTUW = true;
        break;
      }
    }
    if (!placedPDTUW) return done(addLog(ctx, '繧ｦ繧ｧ繝昴Φ繧ｷ繧ｰ繝九↑縺・));
    const newOwnerPDTUW: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(1), field: { ...ctx.ownerState.field, signi: newSigniPDTUW } };
    return done(addLog({ ...ctx, ownerState: newOwnerPDTUW }, `繧ｦ繧ｧ繝昴Φ荳九↓繝・ャ繧ｭ荳企・鄂ｮ: ${ctx.cardMap.get(topCardPDTUW)?.CardName ?? topCardPDTUW}`));
  }
  // PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON: 蜈ｨ繧ｦ繧ｧ繝昴Φ繧ｷ繧ｰ繝九・荳九↓繝医Λ繝・す繝･縺九ｉ繧ｷ繧ｰ繝九ｒ1譫壹★縺､鄂ｮ縺・  if (stub.id === 'PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON') {
    const weaponZonesPTSUAW: number[] = [];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) continue;
      const c = ctx.cardMap.get(top);
      if (c?.CardClass?.includes('繧ｦ繧ｧ繝昴Φ') || c?.CardClass?.includes('豁ｦ蝎ｨ')) weaponZonesPTSUAW.push(zi);
    }
    if (weaponZonesPTSUAW.length === 0) return done(addLog(ctx, '繧ｦ繧ｧ繝昴Φ繧ｷ繧ｰ繝九↑縺・));
    const trashSigniPTSUAW = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
    if (trashSigniPTSUAW.length === 0) return done(addLog(ctx, '繝医Λ繝・す繝･縺ｫ繧ｷ繧ｰ繝九↑縺・));
    // 1縺､逶ｮ縺ｮ繧ｦ繧ｧ繝昴Φ繧ｾ繝ｼ繝ｳ縺ｫ1譫夐∈謚槭＠縺ｦ驟咲ｽｮ
    const tgtZonePTSUAW = weaponZonesPTSUAW[0];
    return needsInteraction(addLog(ctx, `繧ｦ繧ｧ繝昴Φ・医だ繝ｼ繝ｳ${tgtZonePTSUAW + 1}・我ｸ九↓繝医Λ繝・す繝･繧ｷ繧ｰ繝九ｒ鄂ｮ縺汁), {
      type: 'SELECT_TARGET',
      candidates: trashSigniPTSUAW,
      count: 1,
      optional: false,
      targetScope: 'self_trash',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_PTSUAW_PLACE', value: tgtZonePTSUAW } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_PTSUAW_PLACE: 繧ｦ繧ｧ繝昴Φ荳九す繧ｰ繝矩・鄂ｮ縺ｮ螳溯｡・  if (stub.id === 'INTERNAL_PTSUAW_PLACE') {
    const zoneIdxIPTSUAW = typeof stub.value === 'number' ? stub.value : 0;
    const cardIPTSUAW = ctx.lastProcessedCards?.[0];
    if (!cardIPTSUAW) return done(addLog(ctx, 'INTERNAL_PTSUAW_PLACE: 繧ｫ繝ｼ繝峨↑縺・));
    const newSigniIPTSUAW = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const existingStackIPTSUAW = newSigniIPTSUAW[zoneIdxIPTSUAW] ?? [];
    newSigniIPTSUAW[zoneIdxIPTSUAW] = [cardIPTSUAW, ...existingStackIPTSUAW];
    const newTrashIPTSUAW = ctx.ownerState.trash.filter(c => c !== cardIPTSUAW);
    const newOwnerIPTSUAW: PlayerState = { ...ctx.ownerState, trash: newTrashIPTSUAW, field: { ...ctx.ownerState.field, signi: newSigniIPTSUAW } };
    return done(addLog({ ...ctx, ownerState: newOwnerIPTSUAW }, `繧ｦ繧ｧ繝昴Φ荳九↓驟咲ｽｮ: ${ctx.cardMap.get(cardIPTSUAW)?.CardName ?? cardIPTSUAW}`));
  }
  // CONDITIONAL_TRASH_UNDER_SIGNI: 逶ｸ謇九お繝劾譫壻ｻ･荳翫・蝣ｴ蜷医√す繧ｰ繝倶ｸ九き繝ｼ繝峨ｒ莉ｻ諢上〒繝医Λ繝・す繝･
  if (stub.id === 'CONDITIONAL_TRASH_UNDER_SIGNI') {
    const toHWCTUS = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcCTUS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCTUS = srcCTUS ? (srcCTUS.EffectText ?? '') + ' ' + (srcCTUS.BurstText ?? '') : '';
    const enaMCTUS = txtCTUS.match(/繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ繧ｫ繝ｼ繝峨′([・・・兔d]+)譫壻ｻ･荳・);
    const enaThreshCTUS = enaMCTUS ? parseInt(toHWCTUS(enaMCTUS[1])) : 3;
    if (ctx.otherState.energy.length < enaThreshCTUS) {
      return done(addLog(ctx, `譚｡莉ｶ荳肴・遶具ｼ育嶌謇九お繝・{ctx.otherState.energy.length}譫・< ${enaThreshCTUS}・荏));
    }
    // 繧ｷ繧ｰ繝倶ｸ九き繝ｼ繝会ｼ医せ繧ｿ繝・け豺ｱ縺・1縺ｮ繧ゅ・・峨ｒ蜿朱寔
    const underCardsCTUS: string[] = ctx.ownerState.field.signi.flatMap(stack => {
      if (!stack || stack.length <= 1) return [];
      return stack.slice(0, stack.length - 1); // top莉･螟・    });
    if (underCardsCTUS.length === 0) return done(addLog(ctx, '繧ｷ繧ｰ繝倶ｸ九き繝ｼ繝峨↑縺・));
    const noopCTUS: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, '繧ｷ繧ｰ繝倶ｸ九き繝ｼ繝峨ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺阪∪縺吶°・・), {
      type: 'SELECT_TARGET',
      candidates: underCardsCTUS,
      count: 1,
      optional: true,
      targetScope: 'self_field',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_TRASH_UNDER_SIGNI' } as StubAction) as EffectAction,
      continuation: noopCTUS as EffectAction,
    });
  }
  // INTERNAL_TRASH_UNDER_SIGNI: 繧ｷ繧ｰ繝倶ｸ九き繝ｼ繝峨ｒ繝医Λ繝・す繝･縺ｸ遘ｻ蜍・  if (stub.id === 'INTERNAL_TRASH_UNDER_SIGNI') {
    const cardITUS = ctx.lastProcessedCards?.[0];
    if (!cardITUS) return done(addLog(ctx, 'INTERNAL_TRASH_UNDER_SIGNI: 繧ｫ繝ｼ繝峨↑縺・));
    const newSigniITUS = ctx.ownerState.field.signi.map(stack => {
      if (!stack) return stack;
      const idx = stack.indexOf(cardITUS);
      if (idx < 0) return stack;
      return stack.filter((_, i) => i !== idx);
    }) as (string[] | null)[];
    const newOwnerITUS: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, cardITUS],
      field: { ...ctx.ownerState.field, signi: newSigniITUS },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerITUS },
      `${ctx.cardMap.get(cardITUS)?.CardName ?? cardITUS}繧偵す繧ｰ繝倶ｸ九°繧峨ヨ繝ｩ繝・す繝･縺ｸ`));
  }
  // LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE: 逶ｸ謇九す繧ｰ繝句粋險・蝗槭い繧ｿ繝・け蛻ｶ髯・  if (stub.id === 'LIMIT_OPP_SIGNI_ATTACKS_ONCE' || stub.id === 'OPP_SIGNI_ONE_ATTACK_TOTAL' || stub.id === 'LIMIT_OPP_ATTACK_ONCE') {
    const newOtherOSA: PlayerState = { ...ctx.otherState, signi_attack_once_limit: true };
    return done(addLog({ ...ctx, otherState: newOtherOSA }, '逶ｸ謇九す繧ｰ繝九・蜷郁ｨ・蝗槭＠縺九い繧ｿ繝・け縺ｧ縺阪↑縺・));
  }
  // 繧｢繧ｿ繝・け蛻ｶ髯千ｳｻ・・ngine: 繧｢繧ｿ繝・け蛻ｶ髯舌す繧ｹ繝・Β譛ｪ螳溯｣・ｼ・  if (stub.id === 'ONE_ATTACK_PER_TURN' || stub.id === 'ODD_LEVEL_SIGNI_CANT_ATTACK'
      || stub.id === 'ATTACK_COUNT_BY_POWER'
      || stub.id === 'ADJACENT_ZONE_ATTACK'
      || stub.id === 'MULTI_ZONE_ATTACK' || stub.id === 'BLOCK_FRONT_SIGNI_ATTACK') {
    return done(addLog(ctx, `[繧｢繧ｿ繝・け蛻ｶ髯・ ${stub.id}]`));
  }
  // BLOCK_OPP_ARTS_SPELL_ACT: 縺薙・繧ｿ繝ｼ繝ｳ蟇ｾ謌ｦ逶ｸ謇九・繧｢繝ｼ繝・・繧ｹ繝壹Ν繝ｻ襍ｷ蜍戊・蜉帙ｒ菴ｿ逕ｨ縺ｧ縺阪↑縺・  if (stub.id === 'BLOCK_OPP_ARTS_SPELL_ACT') {
    const newBlockedBOASA = [...(ctx.otherState.blocked_actions ?? []), 'USE_ARTS', 'USE_SPELL', 'USE_ACT'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBOASA } },
      '縺薙・繧ｿ繝ｼ繝ｳ縲∝ｯｾ謌ｦ逶ｸ謇九・繧｢繝ｼ繝・・繧ｹ繝壹Ν繝ｻ襍ｷ蜍戊・蜉帙ｒ菴ｿ逕ｨ縺ｧ縺阪↑縺・));
  }
  // BLOCK_COLORLESS_PLAY: 逶ｸ謇九・辟｡濶ｲ繝励Ξ繧､繧貞ｰ√§繧・  if (stub.id === 'BLOCK_COLORLESS_PLAY') {
    const newBlockedBCP = [...(ctx.otherState.blocked_actions ?? []), 'PLAY_COLORLESS'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBCP } },
      '逶ｸ謇九・辟｡濶ｲ繧ｫ繝ｼ繝峨ｒ繝励Ξ繧､縺ｧ縺阪↑縺・));
  }
  // BLOCK_ALL_OPP_ACTIVATE_ABILITY: 蜈ｨ逶ｸ謇玖ｵｷ蜍戊・蜉帛ｰ√§
  if (stub.id === 'BLOCK_ALL_OPP_ACTIVATE_ABILITY') {
    const newBlockedBAAA = [...(ctx.otherState.blocked_actions ?? []), 'USE_ACT'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBAAA } },
      '逶ｸ謇九・襍ｷ蜍戊・蜉帙ｒ菴ｿ逕ｨ縺ｧ縺阪↑縺・));
  }
  // 繝悶Ο繝・け邉ｻ・・ngine: 陦悟虚繝悶Ο繝・け譛ｪ螳溯｣・ｼ・  // BLOCK_OPP_SPELL_ACT_NEXT_TURN: 谺｡縺ｮ蟇ｾ謌ｦ逶ｸ謇九・繧ｿ繝ｼ繝ｳ荳ｭ縲√せ繝壹Ν縺ｨ襍ｷ蜍戊・蜉帙ｒ菴ｿ逕ｨ縺ｧ縺阪↑縺・  if (stub.id === 'BLOCK_OPP_SPELL_ACT_NEXT_TURN') {
    const blockedBOSANT = [...(ctx.otherState.blocked_actions ?? []), 'USE_SPELL:NEXT_TURN', 'USE_ACT:NEXT_TURN'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: blockedBOSANT } },
      '谺｡縺ｮ蟇ｾ謌ｦ逶ｸ謇九・繧ｿ繝ｼ繝ｳ荳ｭ縲∫嶌謇九・繧ｹ繝壹Ν縺ｨ襍ｷ蜍戊・蜉帙ｒ菴ｿ逕ｨ縺ｧ縺阪↑縺・));
  }
  // BLOCK_OPP_AUTO_ABILITY_EXTENDED: 縺薙・繧ｿ繝ｼ繝ｳ縺ｨ谺｡縺ｮ繧ｿ繝ｼ繝ｳ縲∫嶌謇九す繧ｰ繝九・縲占・縲題・蜉帙・逋ｺ蜍輔＠縺ｪ縺・  if (stub.id === 'BLOCK_OPP_AUTO_ABILITY_EXTENDED') {
    const newBlocedBOAE = [
      ...(ctx.ownerState.blocked_actions ?? []),
      'BLOCK_OPP_SIGNI_AUTO',
      'BLOCK_OPP_SIGNI_AUTO:NEXT_TURN',
    ];
    const newOwnerBOAE: PlayerState = { ...ctx.ownerState, blocked_actions: newBlocedBOAE };
    return done(addLog({ ...ctx, ownerState: newOwnerBOAE }, '縺薙・繧ｿ繝ｼ繝ｳ縺ｨ谺｡縺ｮ繧ｿ繝ｼ繝ｳ: 逶ｸ謇九す繧ｰ繝九・縲占・縲題・蜉帙・逋ｺ蜍輔＠縺ｪ縺・));
  }
  if (stub.id === 'BLOCK_NON_WHITE_SPELL'
      || stub.id === 'BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT' || stub.id === 'BLOCK_OPP_DECK_TO_ENERGY'
      || stub.id === 'BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT') {
    return done(addLog(ctx, `[繝悶Ο繝・け蜉ｹ譫・ ${stub.id}]`));
  }
  // OPP_TURN_NO_ENERGY_COST: 蟇ｾ謌ｦ逶ｸ謇九・谺｡縺ｮ繧ｿ繝ｼ繝ｳ荳ｭ縲∝ｯｾ謌ｦ逶ｸ謇九・繧ｨ繝翫さ繧ｹ繝医ｒ謾ｯ謇輔∴縺ｪ縺・  if (stub.id === 'OPP_TURN_NO_ENERGY_COST') {
    // 繧ｨ繝翫さ繧ｹ繝医ｒ蠢・ｦ√→縺吶ｋ蜈ｨ繧｢繧ｯ繧ｷ繝ｧ繝ｳ繧偵ヶ繝ｭ繝・け・医い繝ｼ繝・繧ｹ繝壹Ν/繧ｰ繝ｭ繧ｦ/襍ｷ蜍戊・蜉幢ｼ・    const newBlockedOTNEC = [
      ...(ctx.otherState.blocked_actions ?? []),
      'USE_ARTS:NEXT_TURN', 'USE_SPELL:NEXT_TURN',
      'GROW:NEXT_TURN', 'USE_ACT:NEXT_TURN',
    ];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedOTNEC } },
      '蟇ｾ謌ｦ逶ｸ謇九・谺｡縺ｮ繧ｿ繝ｼ繝ｳ荳ｭ縲∝ｯｾ謌ｦ逶ｸ謇九・繧ｨ繝翫さ繧ｹ繝医ｒ謾ｯ謇輔∴縺ｪ縺・ｼ医い繝ｼ繝・繧ｹ繝壹Ν/繧ｰ繝ｭ繧ｦ/襍ｷ蜍戊・蜉帙☆縺ｹ縺ｦ・・));
  }
  // OPP_MAIN_PHASE_LIMIT_DOWN: 谺｡縺ｮ逶ｸ謇九Γ繧､繝ｳ繝輔ぉ繧､繧ｺ縺ｮ髢薙√そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ繝ｪ繝溘ャ繝・2
  if (stub.id === 'OPP_MAIN_PHASE_LIMIT_DOWN') {
    const newOtherMPLD: PlayerState = { ...ctx.otherState, pending_lrig_limit_mod: (ctx.otherState.pending_lrig_limit_mod ?? 0) - 2 };
    return done(addLog({ ...ctx, otherState: newOtherMPLD }, '谺｡縺ｮ逶ｸ謇九Γ繧､繝ｳ繝輔ぉ繧､繧ｺ荳ｭ縲∫嶌謇九Μ繝溘ャ繝・2'));
  }
  // OPP_SIGNI_ATTACK_COST: 繧ｿ繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ縲∫嶌謇九す繧ｰ繝九・繧｢繧ｿ繝・け縺ｫ縲顔┌縲凝・繧ｳ繧ｹ繝・  if (stub.id === 'OPP_SIGNI_ATTACK_COST') {
    const newOtherSAC: PlayerState = { ...ctx.otherState, signi_attack_cost: 2 };
    return done(addLog({ ...ctx, otherState: newOtherSAC }, '繧ｿ繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ縲∝ｯｾ謌ｦ逶ｸ謇九す繧ｰ繝九い繧ｿ繝・け縺ｫ縲顔┌縲凝・繧ｳ繧ｹ繝・));
  }
  // OPP_ZONE_PLACEMENT_RESTRICT: CONTINUOUS蜉ｹ譫懶ｼ・ffectEngine縺ｧ蜍慕噪蛻､螳夲ｼ・  if (stub.id === 'OPP_ZONE_PLACEMENT_RESTRICT') {
    return done(addLog(ctx, '[驟咲ｽｮ蛻ｶ髯・ OPP_ZONE_PLACEMENT_RESTRICT・・ONTINUOUS・云'));
  }
  // 繧ｳ繧ｹ繝医い繝・・邉ｻ・・ngine: 繧ｳ繧ｹ繝郁ｨ育ｮ玲悴螳溯｣・ｼ・  if (stub.id === 'FIRST_SPELL_COST_UP' || stub.id === 'OPP_LRIG_ATTACK_COST'
      || stub.id === 'ARTS_COLORLESS_MUST_PAY_CENTER_COLOR') {
    return done(addLog(ctx, `[繧ｳ繧ｹ繝医い繝・・/蛻ｶ髯・ ${stub.id}]`));
  }
  // 繧ｷ繧ｰ繝狗ｧｻ蜍・繝ｪ繝繧､繝ｬ繧ｯ繝育ｳｻ・・ngine: 遘ｻ蜍募・螟画峩譛ｪ螳溯｣・ｼ・  // MOVE_TO_ATTACKER_FRONT: 逶ｸ謇九す繧ｰ繝九い繧ｿ繝・け譎ゅ∵ｭ｣髱｢縺檎ｩｺ縺ｪ繧芽・蛻・ｒ縺昴・豁｣髱｢縺ｫ遘ｻ蜍包ｼ医＠縺ｦ繧ゅｈ縺・ｼ・  if (stub.id === 'MOVE_TO_ATTACKER_FRONT') {
    const srcMTAF = ctx.sourceCardNum;
    if (!srcMTAF) return done(addLog(ctx, '繧｢繧ｿ繝・き繝ｼ蜑咲ｧｻ蜍包ｼ壹た繝ｼ繧ｹ縺ｪ縺・));
    // 繧｢繧ｿ繝・き繝ｼ繧ｾ繝ｼ繝ｳ繧堤音螳夲ｼ・tub.value 蜆ｪ蜈医√↑縺代ｌ縺ｰ attacked_signi_ids 縺九ｉ蜍慕噪蜿門ｾ暦ｼ・    let targetZoneMTAF: number;
    if (typeof stub.value === 'number' && stub.value >= 0) {
      targetZoneMTAF = stub.value;
    } else {
      const attackerIds = ctx.otherState.attacked_signi_ids ?? [];
      const lastAttacker = attackerIds[attackerIds.length - 1];
      if (lastAttacker) {
        targetZoneMTAF = ctx.otherState.field.signi.findIndex(s => s?.at(-1) === lastAttacker);
      } else {
        targetZoneMTAF = (ctx.otherState.field.signi_down ?? []).findIndex(d => d);
      }
    }
    if (targetZoneMTAF < 0) return done(addLog(ctx, '繧｢繧ｿ繝・き繝ｼ蜑咲ｧｻ蜍包ｼ壹だ繝ｼ繝ｳ迚ｹ螳壻ｸ榊庄'));
    // 閾ｪ蛻・・蜷後だ繝ｼ繝ｳ縺檎ｩｺ縺ｧ縺ｪ縺代ｌ縺ｰ遘ｻ蜍穂ｸ榊庄
    const frontStack = ctx.ownerState.field.signi[targetZoneMTAF];
    if (frontStack && frontStack.length > 0 && frontStack.at(-1) !== srcMTAF) {
      return done(addLog(ctx, `繧｢繧ｿ繝・き繝ｼ豁｣髱｢繧ｾ繝ｼ繝ｳ${targetZoneMTAF + 1}縺ｯ蜊譛画ｸ医∩・育ｧｻ蜍穂ｸ榊庄・荏));
    }
    const curZoneMTAF = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcMTAF);
    if (curZoneMTAF < 0) return done(addLog(ctx, '繧｢繧ｿ繝・き繝ｼ蜑咲ｧｻ蜍包ｼ壹ヵ繧｣繝ｼ繝ｫ繝峨↓縺・↑縺・));
    if (curZoneMTAF === targetZoneMTAF) return done(addLog(ctx, '繧｢繧ｿ繝・き繝ｼ蜑咲ｧｻ蜍包ｼ壹☆縺ｧ縺ｫ豁｣髱｢繧ｾ繝ｼ繝ｳ'));
    // 遘ｻ蜍輔☆繧九°縺ｩ縺・°驕ｸ謚・    const moveStubMTAF: StubAction = { type: 'STUB', id: 'INTERNAL_MOVE_TO_ZONE', value: targetZoneMTAF };
    const skipStubMTAF: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, `繧ｾ繝ｼ繝ｳ${targetZoneMTAF + 1}・医い繧ｿ繝・き繝ｼ豁｣髱｢・峨↓遘ｻ蜍輔＠縺ｦ繧ゅｈ縺Я), {
      type: 'CHOOSE',
      options: [
        { id: 'move', label: `繧ｾ繝ｼ繝ｳ${targetZoneMTAF + 1}縺ｫ遘ｻ蜍描, action: moveStubMTAF as EffectAction, available: true },
        { id: 'skip', label: '繧ｹ繧ｭ繝・・', action: skipStubMTAF as EffectAction, available: true },
      ],
      count: 1,
    });
  }
  if (stub.id === 'OPP_TRASH_LOSE_COLOR_AND_CLASS') {
    return done(addLog(ctx, `[遘ｻ蜍輔Μ繝繧､繝ｬ繧ｯ繝・ ${stub.id}]`));
  }
  // FORCE_TARGET_SELF: 縺薙・繧ｷ繧ｰ繝九＠縺句ｯｾ雎｡縺ｫ縺ｧ縺阪↑縺・ｼ医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'FORCE_TARGET_SELF') {
    return done(addLog(ctx, `[蠑ｷ蛻ｶ閾ｪ蟾ｱ蟇ｾ雎｡: ${stub.id}]`));
  }
  // BANISH_BY_SELF_GOES_TO_TRASH: 縺薙・繧ｷ繧ｰ繝九↓繧医ｋ繝舌ル繝・す繝･縺ｯ繧ｨ繝翫〒縺ｪ縺上ヨ繝ｩ繝・す繝･縺ｸ
  if (stub.id === 'BANISH_BY_SELF_GOES_TO_TRASH') {
    const srcBBSGTT = ctx.sourceCardNum;
    if (!srcBBSGTT) return done(addLog(ctx, 'BANISH_BY_SELF_GOES_TO_TRASH: 繧ｽ繝ｼ繧ｹ縺ｪ縺・));
    const currentBTBS = ctx.ownerState.banish_to_trash_by_self ?? [];
    const newBTBS = [...new Set([...currentBTBS, srcBBSGTT])];
    const newOwnerBBSGTT: PlayerState = { ...ctx.ownerState, banish_to_trash_by_self: newBTBS };
    return done(addLog({ ...ctx, ownerState: newOwnerBBSGTT },
      `${ctx.cardMap.get(srcBBSGTT)?.CardName ?? srcBBSGTT}縺ｮ繝舌ル繝・す繝･竊偵ヨ繝ｩ繝・す繝･縺ｸ隱伜ｰ餐));
  }
  // CRASH_TO_TRASH_INSTEAD: 縺薙・繧ｿ繝ｼ繝ｳ逶ｸ謇九・繝ｩ繧､繝輔け繝ｭ繧ｹ繧ｯ繝ｩ繝・す繝･譎ゅ√お繝翫〒縺ｯ縺ｪ縺上ヨ繝ｩ繝・す繝･縺ｸ
  if (stub.id === 'CRASH_TO_TRASH_INSTEAD') {
    const newOwner = { ...ctx.ownerState, crash_to_trash_instead: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, '縺薙・繧ｿ繝ｼ繝ｳ縲√け繝ｩ繝・す繝･縺輔ｌ縺溘き繝ｼ繝峨・繝医Λ繝・す繝･縺ｫ鄂ｮ縺九ｌ繧・));
  }
  // BANISH_REDIRECT_TO_HAND: 縺薙・繧ｿ繝ｼ繝ｳ縲∝ｯｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝九′繝舌ル繝・す繝･縺輔ｌ繧句ｴ蜷医お繝翫だ繝ｼ繝ｳ縺ｧ縺ｯ縺ｪ縺乗焔譛ｭ縺ｫ謌ｻ繧・  if (stub.id === 'BANISH_REDIRECT_TO_HAND') {
    const newOwnerBRTH: PlayerState = { ...ctx.ownerState, banish_redirect_to_hand: true };
    return done(addLog({ ...ctx, ownerState: newOwnerBRTH }, '縺薙・繧ｿ繝ｼ繝ｳ縲∝ｯｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝九ヰ繝九ャ繧ｷ繝･蜈遺・謇区惆'));
  }
  // OPP_RETURN_HAND_ON_SELF_BANISH: 繝舌ル繝・す繝･縺輔ｌ縺溘→縺阪∝ｯｾ謌ｦ逶ｸ謇九・謇区惆繧・譫壹ョ繝・く縺ｮ荳逡ｪ荳翫↓鄂ｮ縺・  if (stub.id === 'OPP_RETURN_HAND_ON_SELF_BANISH') {
    const candsORHOSB = ctx.otherState.hand;
    if (candsORHOSB.length === 0) return done(addLog(ctx, '蟇ｾ謌ｦ逶ｸ謇九・謇区惆縺ｪ縺暦ｼ・PP_RETURN_HAND_ON_SELF_BANISH・・));
    const ttdActionORHOSB: EffectAction = {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'HAND_CARD', owner: 'opponent', count: 1 },
      shuffle: false,
      position: 'top',
    } as TransferToDeckAction;
    return selectOrInteract(candsORHOSB, 1, false, 'opp_hand', ttdActionORHOSB, undefined, ctx, true);
  }
  // MULTI_DAMAGE_ON_LRIG_ATTACK: 縺薙・繧ｿ繝ｼ繝ｳ縲√Ν繝ｪ繧ｰ繧｢繧ｿ繝・け繧誰蝗樔ｸ弱∴繧具ｼ・rig_attack_remaining繝輔Λ繧ｰ縺ｧBattleScreen蛛ｴ縺檎ｮ｡逅・ｼ・  if (stub.id === 'MULTI_DAMAGE_ON_LRIG_ATTACK') {
    const srcMDALA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMDALA = srcMDALA ? (srcMDALA.EffectText ?? '') + ' ' + (srcMDALA.BurstText ?? '') : '';
    const toHWMDALA = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mMDALA = txtMDALA.match(/繝繝｡繝ｼ繧ｸ繧・[・・・兔d]+)蝗樔ｸ弱∴繧・);
    const totalMDALA = mMDALA ? parseInt(toHWMDALA(mMDALA[1])) : 3;
    // 谿九ｊ蝗樊焚 = 蜷郁ｨ・- 1・・蝗樒岼縺ｯ騾壼ｸｸ繧｢繧ｿ繝・け謇ｱ縺・ｼ・    const newOwnerMDALA = { ...ctx.ownerState, lrig_attack_remaining: totalMDALA - 1 };
    return done(addLog({ ...ctx, ownerState: newOwnerMDALA }, `縺薙・繧ｿ繝ｼ繝ｳ縲√Ν繝ｪ繧ｰ縺・{totalMDALA}蝗槭い繧ｿ繝・け縺吶ｋ・域ｮ九ｊ${totalMDALA - 1}蝗橸ｼ荏));
  }
  // 繝繝｡繝ｼ繧ｸ迚ｹ谿奇ｼ・ngine: 繝繝｡繝ｼ繧ｸ蜃ｦ逅・僑蠑ｵ蠢・ｦ・ｼ・  if (stub.id === 'ATTACK_PHASE_LEVEL_OVERRIDE') {
    return done(addLog(ctx, `[繝繝｡繝ｼ繧ｸ/繝輔ぉ繧､繧ｺ迚ｹ谿・ ${stub.id}]`));
  }
  // 繧ｦ繧ｧ繝昴Φ繝ｻ繝励Ο繝・け繧ｷ繝ｧ繝ｳ邉ｻ・・ngine: 遞ｮ譌丈ｿ晁ｭｷ繝輔Λ繧ｰ譛ｪ螳溯｣・ｼ・  // DRIVE_SIGNI_PREVENT_DOWN: 繝峨Λ繧､繝也憾諷九・繧ｷ繧ｰ繝九↓蟇ｾ謌ｦ逶ｸ謇九・蜉ｹ譫懊↓繧医ｋ繝繧ｦ繝ｳ髦ｲ豁｢繧剃ｻ倅ｸ・  if (stub.id === 'DRIVE_SIGNI_PREVENT_DOWN') {
    const targetDSPD = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetDSPD) {
      const grantsDSPD = { ...(ctx.ownerState.keyword_grants ?? {}) };
      const prevDSPD = grantsDSPD[targetDSPD] ?? [];
      const protKey = 'PROTECTION:DOWN:opponent';
      if (!prevDSPD.includes(protKey)) grantsDSPD[targetDSPD] = [...prevDSPD, protKey];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsDSPD } },
        `${ctx.cardMap.get(targetDSPD)?.CardName ?? targetDSPD}竊偵ち繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ蟇ｾ謌ｦ逶ｸ謇句柑譫懊↓繧医ｋ繝繧ｦ繝ｳ荳榊庄`));
    }
    const driveCandsDSPD = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => !!cn);
    if (driveCandsDSPD.length === 0) return done(addLog(ctx, '閾ｪ繝輔ぅ繝ｼ繝ｫ繝峨↓繧ｷ繧ｰ繝九↑縺暦ｼ・RIVE_SIGNI_PREVENT_DOWN・・));
    const applyDSPD: StubAction = { type: 'STUB', id: 'DRIVE_SIGNI_PREVENT_DOWN' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: driveCandsDSPD, count: 1, optional: false,
      targetScope: 'self_field', thenAction: applyDSPD as EffectAction,
    });
  }
  // DRIVE_CONT_BANISH_RESIST: 繝峨Λ繧､繝門ｸｸ竊偵％縺ｮ繧ｷ繧ｰ繝九・繝舌ル繝・す繝･縺輔ｌ縺ｪ縺・ｼ・ffectEngine縺ｧ蜃ｦ逅・ｼ・  if (stub.id === 'DRIVE_CONT_BANISH_RESIST') {
    return done(addLog(ctx, '[繝峨Λ繧､繝門ｸｸ・壹ヰ繝九ャ繧ｷ繝･閠先ｧ・・ffectEngine蜍慕噪蜃ｦ逅・ｼ云'));
  }
  // DRIVE_AUTO_BANISH_ALL_OPP: 繝峨Λ繧､繝冶・竊偵い繧ｿ繝・け譎ゅ↓逶ｸ謇句・繧ｷ繧ｰ繝九ｒ繝舌ル繝・す繝･・・S_DRIVE_STATE繝√ぉ繝・け莉倥″・・  if (stub.id === 'DRIVE_AUTO_BANISH_ALL_OPP') {
    if (!(ctx.ownerState.lrig_riding_signi?.includes(ctx.sourceCardNum ?? ''))) {
      return done(addLog(ctx, '繝峨Λ繧､繝也憾諷九〒縺ｪ縺・ｼ・RIVE_AUTO_BANISH_ALL_OPP 繧ｹ繧ｭ繝・・・・));
    }
    const oppAllDABA = [0, 1, 2].flatMap(zi => {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      return top ? [top] : [];
    });
    if (oppAllDABA.length === 0) return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・RIVE_AUTO_BANISH_ALL_OPP・・));
    let newOtherDABA = ctx.otherState;
    for (const cn of oppAllDABA) {
      const removed = removeFromField(cn, newOtherDABA);
      newOtherDABA = { ...removed, trash: [...removed.trash, cn] };
    }
    return done(addLog({ ...ctx, otherState: newOtherDABA }, `繝峨Λ繧､繝冶・・夂嶌謇句・繧ｷ繧ｰ繝・{oppAllDABA.length}菴薙ｒ繝舌ル繝・す繝･`));
  }
  if (stub.id === 'WEAPON_SIGNI_PROTECT_DOWN'
      || stub.id === 'WEAPON_SIGNI_PROTECTION' || stub.id === 'ARM_SIGNI_LRIG_PROTECTION'
      || stub.id === 'WHITE_SIGNI_ABILITY_PROTECT' || stub.id === 'WEAPON_SIGNI_PREVENT_DOWN') {
    return done(addLog(ctx, `[遞ｮ譌丈ｿ晁ｭｷ: ${stub.id}]`));
  }
  // === 繝舌ャ繝・7: 繝代Ρ繝ｼ蜿崎ｻ｢繝ｻ譚｡莉ｶ蛻・ｲ舌・繧ｿ繝ｼ繧ｲ繝・ヨ邉ｻ ===
  // REVERSE_OPP_POWER_MINUS: 逶ｸ謇九す繧ｰ繝九・繝代Ρ繝ｼ繝槭う繝翫せ菫ｮ豁｣繧貞渚霆｢・医・繝ｩ繧ｹ縺ｫ・・  if (stub.id === 'REVERSE_OPP_POWER_MINUS') {
    const modsRPM = (ctx.otherState.temp_power_mods ?? []).map(m => m.delta < 0 ? { ...m, delta: Math.abs(m.delta) } : m);
    const newOtherRPM: PlayerState = { ...ctx.otherState, temp_power_mods: modsRPM };
    return done(addLog({ ...ctx, otherState: newOtherRPM }, '逶ｸ謇九す繧ｰ繝九・繝代Ρ繝ｼ繝槭う繝翫せ繧貞渚霆｢・医・繝ｩ繧ｹ縺ｫ・・));
  }
  // NEGATE_THAT_ATTACK: 迴ｾ蝨ｨ縺ｮ繧｢繧ｿ繝・け繧堤┌蜉ｹ蛹・  if (stub.id === 'NEGATE_THAT_ATTACK') {
    // lastProcessedCards 縺ｮ1譫夂岼繧呈判謦・ｸｭ縺ｮ繧ｷ繧ｰ繝九→縺励※辟｡蜉ｹ蛹・    const attackerNTA = ctx.lastProcessedCards?.[0];
    if (attackerNTA) {
      const negatedNTA = [...(ctx.ownerState.negated_attacks ?? []), attackerNTA];
      const newSNTA: PlayerState = { ...ctx.ownerState, negated_attacks: negatedNTA };
      return done(addLog({ ...ctx, ownerState: newSNTA }, `${ctx.cardMap.get(attackerNTA)?.CardName ?? attackerNTA}縺ｮ繧｢繧ｿ繝・け繧堤┌蜉ｹ蛹冒));
    }
    return done(addLog(ctx, '繧｢繧ｿ繝・け辟｡蜉ｹ蛹厄ｼ亥ｯｾ雎｡荳肴・・・));
  }
  // NEGATE_NTH_ATTACK: 縺薙・繧ｿ繝ｼ繝ｳ縲∫嶌謇九す繧ｰ繝九・繧｢繧ｿ繝・け繧誰蝗樒岼縺ｾ縺ｧ閾ｪ蜍慕┌蜉ｹ蛹・  if (stub.id === 'NEGATE_NTH_ATTACK') {
    const toHWNNA = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcNNA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtNNA = srcNNA ? (srcNNA.EffectText ?? '') + ' ' + (srcNNA.BurstText ?? '') : '';
    // 縲御ｸ蠎ｦ逶ｮ縺倶ｺ悟ｺｦ逶ｮ縲坂・2, 縲御ｸ蠎ｦ逶ｮ縲坂・1, 繝・く繧ｹ繝井ｸ肴・竊・
    let nNNA = 1;
    if (txtNNA.match(/[荳1・曽蠎ｦ逶ｮ縺擬莠・・綻蠎ｦ逶ｮ/)) nNNA = 2;
    else if (txtNNA.match(/[荳1・曽蠎ｦ逶ｮ縺擬莠・・綻蠎ｦ逶ｮ縺擬荳・・転蠎ｦ逶ｮ/)) nNNA = 3;
    else { const m = txtNNA.match(/([・・・兔d荳莠御ｸ牙屁莠泌・荳・・荵晏香]+)蝗樒岼/); if (m) nNNA = parseInt(toHWNNA(m[1])) || 1; }
    const cur = ctx.ownerState.negate_opp_signi_attacks_until ?? 0;
    const newOwner = { ...ctx.ownerState, negate_opp_signi_attacks_until: Math.max(cur, nNNA) };
    return done(addLog({ ...ctx, ownerState: newOwner }, `縺薙・繧ｿ繝ｼ繝ｳ縲∫嶌謇九す繧ｰ繝九い繧ｿ繝・け繧・{nNNA}蝗樒岼縺ｾ縺ｧ閾ｪ蜍慕┌蜉ｹ蛹冒));
  }
  // NEGATE_COIN_ABILITY: 縺薙・繧ｿ繝ｼ繝ｳ縲∝ｯｾ謌ｦ逶ｸ謇九・繧ｳ繧､繝ｳ閭ｽ蜉幢ｼ医・繝・ヨ・峨ｒ逋ｺ蜍輔〒縺阪↑縺・  if (stub.id === 'NEGATE_COIN_ABILITY') {
    const newOtherNCA: PlayerState = { ...ctx.otherState, negate_coin_abilities: true };
    return done(addLog({ ...ctx, otherState: newOtherNCA }, '縺薙・繧ｿ繝ｼ繝ｳ蟇ｾ謌ｦ逶ｸ謇九・繧ｳ繧､繝ｳ閭ｽ蜉帙ｒ逋ｺ蜍輔〒縺阪↑縺・));
  }
  // NEGATE_ALL_OPP_EFFECTS: 逶ｸ謇九・CONTINUOUS蜉ｹ譫懊ｒ蜈ｨ縺ｦ辟｡蜉ｹ蛹厄ｼ・ll_cont_effects_negated繝輔Λ繧ｰ・・  if (stub.id === 'NEGATE_ALL_OPP_EFFECTS') {
    const newOtherNAOE: PlayerState = { ...ctx.otherState, all_cont_effects_negated: true };
    return done(addLog({ ...ctx, otherState: newOtherNAOE },
      '逶ｸ謇九・CONTINUOUS蜉ｹ譫懊ｒ蜈ｨ縺ｦ辟｡蜉ｹ蛹厄ｼ医％縺ｮ繧ｿ繝ｼ繝ｳ・・));
  }
  // EFFECT_LIMIT: 騾｣邯壼柑譫懊・荳企剞譫壽焚繧偵く繝｣繝・・・育峩蜑阪・繝代Ρ繝ｼ菫ｮ豁｣繧剃ｸ企剞蛟､縺ｧ繧ｭ繝｣繝・・・・  if (stub.id === 'EFFECT_LIMIT') {
    const srcEL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtEL = srcEL ? (srcEL.EffectText ?? '') + ' ' + (srcEL.BurstText ?? '') : '';
    const toHWEL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const capMEL = txtEL.match(/縺薙・蜉ｹ譫懊・([・・・兔d]+)譫・?:縺ｾ縺ｧ|縺ｾ縺ｧ縺励°)/);
    if (capMEL && ctx.sourceCardNum) {
      const cap = parseInt(toHWEL(capMEL[1]));
      // temp_power_mods 縺ｮ譛蠕後・繧ｨ繝ｳ繝医Μ繧偵く繝｣繝・・・・eltaPerUnit * cap 縺御ｸ企剞・・      const mods = [...(ctx.ownerState.temp_power_mods ?? [])];
      if (mods.length > 0) {
        const last = mods[mods.length - 1];
        // deltaPerUnit 繧呈耳螳夲ｼ域怙蠕後・delta / 迴ｾ蝨ｨ縺ｮ繧ｫ繧ｦ繝ｳ繝医°繧蛾・ｮ励′蝗ｰ髮｣縺ｪ縺ｮ縺ｧ蜊倡ｴ斐↓ cap 繧剃ｽｿ縺・ｼ・        // 譛繧ょ腰邏斐↑螳溯｣・ｼ單elta 縺ｮ邨ｶ蟇ｾ蛟､縺・cap * 1000 繧定ｶ・∴繧句ｴ蜷医く繝｣繝・・
        const capVal = cap * 1000;
        if (Math.abs(last.delta) > capVal) {
          mods[mods.length - 1] = { ...last, delta: last.delta > 0 ? capVal : -capVal };
          return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: mods } },
            `蜉ｹ譫應ｸ企剞: ${cap}譫夲ｼ医ヱ繝ｯ繝ｼ菫ｮ豁｣繧・{last.delta > 0 ? '+' : '-'}${capVal}縺ｫ繧ｭ繝｣繝・・・荏));
        }
      }
      return done(addLog(ctx, `蜉ｹ譫應ｸ企剞: ${cap}譫夲ｼ医く繝｣繝・・蜀・ｼ荏));
    }
    return done(addLog(ctx, '蜉ｹ譫懷宛髯・));
  }
  // DISONA_RESTRICTION: DISONA蛻ｶ髯撰ｼ医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'DISONA_RESTRICTION') {
    return done(addLog(ctx, 'DISONA蛻ｶ髯・));
  }
  // COIN_SPEND_CONDITION 窶ｻ繝ｭ繧ｰ縺ｮ縺ｿ
  if (stub.id === 'COIN_SPEND_CONDITION') {
    return done(addLog(ctx, '繧ｳ繧､繝ｳ豸郁ｲｻ譚｡莉ｶ'));
  }
  // COIN_USE_RESTRICTION: 繧ｳ繧､繝ｳ菴ｿ逕ｨ蜈医ｒ繧ｹ繝壹Ν縺ｨ繧ｷ繧ｰ繝九↓髯仙ｮ夲ｼ医ご繝ｼ繝荳ｭ豌ｸ邯夲ｼ・  if (stub.id === 'COIN_USE_RESTRICTION') {
    const newOwnerCUR: PlayerState = { ...ctx.ownerState, coin_use_restriction: 'spell_signi_only' };
    return done(addLog({ ...ctx, ownerState: newOwnerCUR }, '縺薙・繧ｲ繝ｼ繝縺ｮ髢難ｼ壹さ繧､繝ｳ縺ｯ繧ｹ繝壹Ν縺ｨ繧ｷ繧ｰ繝九↓縺励°謾ｯ謇輔∴縺ｪ縺・));
  }
  // INCREASE_ACT_ABILITY_COST: 襍ｷ蜍戊・蜉帙・繧ｳ繧ｹ繝医ｒ蠅怜刈・医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'INCREASE_ACT_ABILITY_COST') {
    return done(addLog(ctx, '襍ｷ蜍戊・蜉帙さ繧ｹ繝亥｢怜刈'));
  }
  // CONDITIONAL_KEYWORD_BY_CENTER_COLOR: 繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ濶ｲ縺ｫ蠢懊§縺ｦ繧ｭ繝ｼ繝ｯ繝ｼ繝我ｻ倅ｸ・  if (stub.id === 'CONDITIONAL_KEYWORD_BY_CENTER_COLOR') {
    const centerCKBC = ctx.ownerState.field.lrig.at(-1);
    const centerCardCKBC = centerCKBC ? ctx.cardMap.get(centerCKBC) : undefined;
    const centerColorCKBC = centerCardCKBC?.Color ?? '';
    const srcCKBC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCKBC = srcCKBC ? (srcCKBC.EffectText ?? '') : '';
    const mKwCKBC = txtCKBC.match(/縲・[^縲曽+)縲・);
    const kwCKBC = mKwCKBC ? mKwCKBC[1] : '繝ｩ繝ｳ繧ｵ繝ｼ';
    const mColorCKBC = txtCKBC.match(/(襍､|髱竹邱掃逋ｽ|鮟・/);
    const condColorCKBC = mColorCKBC ? mColorCKBC[1] : '';
    if (condColorCKBC && !centerColorCKBC.includes(condColorCKBC)) {
      return done(addLog(ctx, `繧ｻ繝ｳ繧ｿ繝ｼ濶ｲ${centerColorCKBC}竕${condColorCKBC}・域擅莉ｶ荳埼＃謌撰ｼ荏));
    }
    // 閾ｪ蛻・・繝輔ぅ繝ｼ繝ｫ繝峨す繧ｰ繝九↓繧ｭ繝ｼ繝ｯ繝ｼ繝我ｻ倅ｸ・    const kwGrantsCKBC = { ...(ctx.ownerState.keyword_grants ?? {}) };
    (ctx.ownerState.field.signi ?? []).forEach(s => {
      if (s && s.length > 0) {
        const cn = s[s.length - 1];
        const existing = kwGrantsCKBC[cn] ?? [];
        if (!existing.includes(kwCKBC)) kwGrantsCKBC[cn] = [...existing, kwCKBC];
      }
    });
    const newSCKBC: PlayerState = { ...ctx.ownerState, keyword_grants: kwGrantsCKBC };
    return done(addLog({ ...ctx, ownerState: newSCKBC }, `繧ｻ繝ｳ繧ｿ繝ｼ濶ｲ${centerColorCKBC}竊貞・繧ｷ繧ｰ繝九↓縲・{kwCKBC}縲台ｻ倅ｸ餐));
  }
  // SELECT_OTHER_SIGNI: 繧ｽ繝ｼ繧ｹ莉･螟悶・繧ｷ繧ｰ繝九ｒ驕ｸ謚・  if (stub.id === 'SELECT_OTHER_SIGNI') {
    const srcSOS = ctx.sourceCardNum;
    const candsSOS = (ctx.ownerState.field.signi ?? []).flatMap(s => {
      if (!s || s.length === 0) return [];
      const top = s[s.length - 1];
      return top !== srcSOS ? [top] : [];
    });
    if (candsSOS.length === 0) return done(addLog(ctx, '驕ｸ謚槫庄閭ｽ縺ｪ莉悶す繧ｰ繝九↑縺・));
    const noopSOS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsSOS, count: 1, optional: true,
      targetScope: 'self_field', thenAction: noopSOS as EffectAction,
    });
  }
  // ENERGY_LEVEL_CONDITION_CHOOSE: 繧ｨ繝翫↓繝ｬ繝吶ΝN莉･荳翫′縺ゅｌ縺ｰCHOOSE謠千､ｺ
  if (stub.id === 'ENERGY_LEVEL_CONDITION_CHOOSE') {
    const toHWELCC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcELCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtELCC = srcELCC ? (srcELCC.EffectText ?? '') + ' ' + (srcELCC.BurstText ?? '') : '';
    const mLvELCC = txtELCC.match(/繝ｬ繝吶Ν([・・・兔d]+)莉･荳・);
    const threshELCC = mLvELCC ? parseInt(toHWELCC(mLvELCC[1])) : 4;
    const hasLevelELCC = ctx.ownerState.energy.some(cn => {
      const lv = parseInt(toHWELCC(ctx.cardMap.get(cn)?.Level ?? '0')) || 0;
      return lv >= threshELCC;
    });
    if (!hasLevelELCC) return done(addLog(ctx, `繧ｨ繝翫↓Lv${threshELCC}莉･荳翫↑縺暦ｼ域擅莉ｶ荳埼＃謌撰ｼ荏));
    return done(addLog(ctx, `繧ｨ繝翫↓Lv${threshELCC}莉･荳翫≠繧奇ｼ域擅莉ｶ驕疲・・俄・驕ｸ謚槫柑譫彖));
  }
  // LEVEL_BASED_CONDITIONAL: 蜈ｬ髢九＠縺溘す繧ｰ繝九・繝ｬ繝吶ΝN譫壹□縺第焔譛ｭ繧呈昏縺ｦ繧・  if (stub.id === 'LEVEL_BASED_CONDITIONAL') {
    const toHWLBC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealedLBC = ctx.lastProcessedCards?.[0];
    const revealedCardLBC = revealedLBC ? ctx.cardMap.get(revealedLBC) : undefined;
    const levelLBC = revealedCardLBC ? (parseInt(toHWLBC(revealedCardLBC.Level ?? '0')) || 0) : 0;
    if (levelLBC === 0 || ctx.ownerState.hand.length === 0) {
      return done(addLog(ctx, `繝ｬ繝吶Ν譚｡莉ｶ: Lv${levelLBC}竊呈焔譛ｭ謐ｨ縺ｦ縺ｪ縺輿));
    }
    const discardNLBC = Math.min(levelLBC, ctx.ownerState.hand.length);
    const discardActionLBC: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: discardNLBC } };
    return selectOrInteract(ctx.ownerState.hand, discardNLBC, false, 'self_hand', discardActionLBC as EffectAction, undefined,
      addLog(ctx, `繝ｬ繝吶Ν${levelLBC}縺ｮ繧ｷ繧ｰ繝・竊・謇区惆${discardNLBC}譫壽昏縺ｦ`));
  }
  // OPP_DECLARE_COLOR: 逶ｸ謇九′濶ｲ繧貞ｮ｣險・・濶ｲCHOOSE opponentResponds竊棚NTERNAL_SET_OPP_DECLARED_COLOR・・  if (stub.id === 'OPP_DECLARE_COLOR') {
    const colorsODC = ['逋ｽ', '襍､', '髱・, '邱・, '鮟・];
    const setColorODC = (c: string): StubAction => ({ type: 'STUB', id: 'INTERNAL_SET_OPP_DECLARED_COLOR', value: c });
    const optsODC = colorsODC.map(c => ({
      id: `opp_color_${c}`, label: `${c}繧貞ｮ｣險`, action: setColorODC(c) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, '蟇ｾ謌ｦ逶ｸ謇九′濶ｲ繧貞ｮ｣險縺吶ｋ・育區/襍､/髱・邱・鮟抵ｼ・), {
      type: 'CHOOSE', options: optsODC, count: 1, opponentResponds: true,
    });
  }
  if (stub.id === 'INTERNAL_SET_OPP_DECLARED_COLOR') {
    const colorSODC = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const newOtherSODC = { ...ctx.otherState, declared_color: colorSODC };
    return done(addLog({ ...ctx, otherState: newOtherSODC }, `蟇ｾ謌ｦ逶ｸ謇九′濶ｲ縲・{colorSODC}縲阪ｒ螳｣險`));
  }
  // COLLAB: 繧ｳ繝ｩ繝懷柑譫・  if (stub.id === 'COLLAB') {
    const srcCL = ctx.sourceCardNum ? ctx.cardMap.get(getCardNum(ctx.sourceCardNum)) : undefined;
    const txtCL = (srcCL?.EffectText ?? '') + ' ' + (srcCL?.BurstText ?? '');
    // 縲後さ繝ｩ繝懊Λ繧､繝舌・N莠ｺ繧貞他縺ｶ縲・ 繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ縺九ｉ繧｢繧ｷ繧ｹ繝医Ν繝ｪ繧ｰ繧偵い繧ｷ繧ｹ繝医だ繝ｼ繝ｳ縺ｫ驟咲ｽｮ
    const callM = txtCL.match(/繧ｳ繝ｩ繝懊Λ繧､繝舌・([・・])莠ｺ繧貞他縺ｶ/);
    const callCount = callM ? 2 : txtCL.includes('繧ｳ繝ｩ繝懊Λ繧､繝舌・') && txtCL.includes('蜻ｼ縺ｶ') ? 1 : 0;
    if (callCount > 0) {
      const lrigDk = ctx.ownerState.lrig_deck;
      const assistInDk = lrigDk.filter(cn => {
        const c = ctx.cardMap.get(getCardNum(cn));
        return c?.Type === '繧｢繧ｷ繧ｹ繝医Ν繝ｪ繧ｰ';
      });
      if (assistInDk.length === 0) return done(addLog(ctx, '繧ｳ繝ｩ繝懊Λ繧､繝舌・縺ｪ縺・));
      let ns: PlayerState = { ...ctx.ownerState };
      let placed = 0;
      const placedIds: string[] = [];
      for (const instanceId of assistInDk) {
        if (placed >= callCount) break;
        const lf = ns.field.assist_lrig_l ?? [];
        const rt = ns.field.assist_lrig_r ?? [];
        const newDk = ns.lrig_deck.filter(x => x !== instanceId);
        if (lf.length === 0) {
          ns = { ...ns, lrig_deck: newDk, field: { ...ns.field, assist_lrig_l: [instanceId] } };
          placedIds.push(instanceId);
          placed++;
        } else if (rt.length === 0) {
          ns = { ...ns, lrig_deck: newDk, field: { ...ns.field, assist_lrig_r: [instanceId] } };
          placedIds.push(instanceId);
          placed++;
        } else {
          break;
        }
      }
      return done(addLog({ ...ctx, ownerState: ns, lastProcessedCards: placedIds }, `繧ｳ繝ｩ繝懊Λ繧､繝舌・${placed}莠ｺ繧貞他繧薙□`));
    }
    // 縲後さ繝ｩ繝懊＠縺ｦ繧ゅｈ縺・・ 莉ｻ諢上〒繧｢繧ｷ繧ｹ繝医Ν繝ｪ繧ｰ繧・莠ｺ蜿ｬ蝟・    const assistAvailCL = ctx.ownerState.lrig_deck.filter(cn => {
      const c = ctx.cardMap.get(getCardNum(cn));
      return c?.Type === '繧｢繧ｷ繧ｹ繝医Ν繝ｪ繧ｰ';
    });
    const hasAssistSpaceCL = (ctx.ownerState.field.assist_lrig_l?.length ?? 0) === 0 ||
      (ctx.ownerState.field.assist_lrig_r?.length ?? 0) === 0;
    if (assistAvailCL.length === 0 || !hasAssistSpaceCL) {
      return done(addLog(ctx, '繧ｳ繝ｩ繝・ 繧｢繧ｷ繧ｹ繝医Ν繝ｪ繧ｰ縺ｾ縺溘・遨ｺ縺阪だ繝ｼ繝ｳ縺ｪ縺・));
    }
    const noopCL: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, '繧ｳ繝ｩ繝懊＠縺ｾ縺吶°・滂ｼ医さ繝ｩ繝懊Λ繧､繝舌・繧・莠ｺ蜻ｼ縺ｶ・・), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'collab_yes', label: '繧ｳ繝ｩ繝懊☆繧・, action: ({ type: 'STUB', id: 'INTERNAL_DO_COLLAB', value: 1 } as StubAction) as EffectAction, available: true },
        { id: 'collab_no', label: '縺励↑縺・, action: noopCL as EffectAction, available: true },
      ],
    });
  }
  // INTERNAL_DO_COLLAB: 繧ｳ繝ｩ繝懷ｮ溯｡鯉ｼ医い繧ｷ繧ｹ繝医Ν繝ｪ繧ｰ1莠ｺ繧帝・鄂ｮ・・  if (stub.id === 'INTERNAL_DO_COLLAB') {
    const assistInDkIDC = ctx.ownerState.lrig_deck.filter(cn => {
      const c = ctx.cardMap.get(getCardNum(cn));
      return c?.Type === '繧｢繧ｷ繧ｹ繝医Ν繝ｪ繧ｰ';
    });
    if (assistInDkIDC.length === 0) return done(addLog(ctx, '繧ｳ繝ｩ繝懊Λ繧､繝舌・縺ｪ縺・));
    const toPlaceIDC = assistInDkIDC[0];
    const newDkIDC = ctx.ownerState.lrig_deck.filter(x => x !== toPlaceIDC);
    let newFieldIDC = ctx.ownerState.field;
    if ((ctx.ownerState.field.assist_lrig_l?.length ?? 0) === 0) {
      newFieldIDC = { ...newFieldIDC, assist_lrig_l: [toPlaceIDC] };
    } else {
      newFieldIDC = { ...newFieldIDC, assist_lrig_r: [toPlaceIDC] };
    }
    const newOwnerIDC: PlayerState = { ...ctx.ownerState, lrig_deck: newDkIDC, field: newFieldIDC };
    return done(addLog({ ...ctx, ownerState: newOwnerIDC },
      `繧ｳ繝ｩ繝・ ${ctx.cardMap.get(getCardNum(toPlaceIDC))?.CardName ?? toPlaceIDC}繧貞小蝟啻));
  // GATE: 繧ｲ繝ｼ繝亥柑譫懶ｼ医Ο繧ｰ縺ｮ縺ｿ・・  // GATE: 逶ｸ謇九・繧ｷ繧ｰ繝九だ繝ｼ繝ｳ1縺､縺ｫ縲舌ご繝ｼ繝医代ｒ險ｭ鄂ｮ・域ｬ｡縺ｮ繧｢繧ｿ繝・け繝輔ぉ繧､繧ｺ縺ｫ譚｡莉ｶ莉倥″縺ｧ繧｢繧ｿ繝・け荳榊庄・・  if (stub.id === 'GATE') {
    const zoneOptsGATE = [0, 1, 2].map(zi => ({
      id: `gate_zone_${zi}`,
      label: `逶ｸ謇九だ繝ｼ繝ｳ${zi + 1}縺ｫ縲舌ご繝ｼ繝医題ｨｭ鄂ｮ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_GATE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '縲舌ご繝ｼ繝医代ｒ險ｭ鄂ｮ縺吶ｋ繧ｾ繝ｼ繝ｳ繧帝∈謚・), {
      type: 'CHOOSE', options: zoneOptsGATE, count: 1,
    });
  }
  if (stub.id === 'INTERNAL_SET_GATE') {
    const gateZoneIdx: number = (typeof stub.value === 'number' ? stub.value : 0) as number;
    const currentGates = [...(ctx.otherState.signi_gate_zones ?? [])];
    if (!currentGates.includes(gateZoneIdx)) currentGates.push(gateZoneIdx);
    // 繧ｲ繝ｼ繝医だ繝ｼ繝ｳ縺ｮ逶ｸ謇九す繧ｰ繝九ｒ blocked_actions 縺ｫ霑ｽ蜉・医い繧ｿ繝・け荳榊庄・・    const gateTop = ctx.otherState.field.signi[gateZoneIdx]?.at(-1);
    const blocked = [...(ctx.otherState.blocked_actions ?? [])];
    if (gateTop) blocked.push(`ATTACK:${gateTop}`);
    const newOtherGATE = { ...ctx.otherState, signi_gate_zones: currentGates, blocked_actions: blocked };
    return done(addLog({ ...ctx, otherState: newOtherGATE }, `逶ｸ謇九だ繝ｼ繝ｳ${gateZoneIdx + 1}縺ｫ縲舌ご繝ｼ繝医題ｨｭ鄂ｮ`));
  }
  // PLACE_MAGIC_BOX: lastProcessedCards[0]縺ｮ繧ｫ繝ｼ繝峨ｒMB縺ｨ縺励※險ｭ鄂ｮ・医だ繝ｼ繝ｳ驕ｸ謚樞・INTERNAL_SET_MAGIC_BOX・・  if (stub.id === 'PLACE_MAGIC_BOX') {
    const cardPMB = ctx.lastProcessedCards?.[0] ?? null;
    if (!cardPMB) return done(addLog(ctx, '縲舌・繧ｸ繝・け繝懊ャ繧ｯ繧ｹ縲題ｨｭ鄂ｮ・壹き繝ｼ繝峨↑縺・));
    const zoneLabelsPMB = [0, 1, 2].map(zi => {
      const existingMB = (ctx.ownerState.field.signi_magic_boxes ?? [null, null, null])[zi];
      const label = existingMB
        ? `繧ｾ繝ｼ繝ｳ${zi + 1}・域里蟄弄B繧剃ｸ頑嶌縺搾ｼ荏
        : `繧ｾ繝ｼ繝ｳ${zi + 1}縺ｫ險ｭ鄂ｮ`;
      return { id: `zone_${zi}`, label, action: ({ type: 'STUB', id: 'INTERNAL_SET_MAGIC_BOX', value: zi } as StubAction) as EffectAction, available: true };
    });
    return needsInteraction(addLog(ctx, '縲舌・繧ｸ繝・け繝懊ャ繧ｯ繧ｹ縲代ｒ險ｭ鄂ｮ縺吶ｋ繧ｾ繝ｼ繝ｳ繧帝∈謚・), {
      type: 'CHOOSE', options: zoneLabelsPMB, count: 1,
    });
  }
  // INTERNAL_SET_MAGIC_BOX: 繧ｾ繝ｼ繝ｳ遒ｺ螳壼ｾ後・螳溯ｨｭ鄂ｮ蜃ｦ逅・  if (stub.id === 'INTERNAL_SET_MAGIC_BOX') {
    const zoneIdxSMB: number = (typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'))) as number;
    const cardSMB = ctx.lastProcessedCards?.[0] ?? null;
    if (!cardSMB) return done(addLog(ctx, 'INTERNAL_SET_MAGIC_BOX・壹き繝ｼ繝峨↑縺・));
    const currentMBs = [...(ctx.ownerState.field.signi_magic_boxes ?? [null, null, null])] as (string | null)[];
    const newTrashSMB = [...ctx.ownerState.trash];
    if (currentMBs[zoneIdxSMB]) newTrashSMB.push(currentMBs[zoneIdxSMB]!);
    currentMBs[zoneIdxSMB] = cardSMB;
    // 繧ｫ繝ｼ繝峨ｒ繝・ャ繧ｭ/謇区惆縺九ｉ髯､蜴ｻ・医←縺｡繧峨↓縺ゅ▲縺ｦ繧ょｯｾ蠢懶ｼ・    const newDeckSMB = ctx.ownerState.deck.filter(c => c !== cardSMB);
    const newHandSMB = ctx.ownerState.hand.filter(c => c !== cardSMB);
    const newOwnerSMB: PlayerState = {
      ...ctx.ownerState,
      deck: newDeckSMB,
      hand: newHandSMB,
      trash: newTrashSMB,
      field: { ...ctx.ownerState.field, signi_magic_boxes: currentMBs },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerSMB }, `縲舌・繧ｸ繝・け繝懊ャ繧ｯ繧ｹ縲題ｨｭ鄂ｮ: 繧ｾ繝ｼ繝ｳ${zoneIdxSMB + 1}・・{ctx.cardMap.get(cardSMB ?? '')?.CardName ?? cardSMB}・荏));
  }
  // OPEN_MAGIC_BOX: 縺薙・繧ｷ繧ｰ繝九→蜷後だ繝ｼ繝ｳ縺ｮMB繧定｡ｨ蜷代″縺ｫ縺励※繝医Λ繝・す繝･縺ｸ・井ｻｻ諢擾ｼ・  if (stub.id === 'OPEN_MAGIC_BOX') {
    const srcOMB = ctx.sourceCardNum;
    const signiFieldOMB = ctx.ownerState.field.signi;
    const zoneIdxOMB = signiFieldOMB.findIndex(stack => stack?.includes(srcOMB ?? ''));
    const mbsOMB = ctx.ownerState.field.signi_magic_boxes ?? [null, null, null];
    const mbCardOMB = zoneIdxOMB >= 0 ? (mbsOMB[zoneIdxOMB] ?? null) : null;
    if (!mbCardOMB) return done(addLog(ctx, `繧ｾ繝ｼ繝ｳ${zoneIdxOMB >= 0 ? zoneIdxOMB + 1 : '?'}縺ｫMB縺ｪ縺輿));
    const mbNameOMB = ctx.cardMap.get(mbCardOMB ?? '')?.CardName ?? (mbCardOMB ?? '');
    const noopOMB: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, `縲舌・繧ｸ繝・け繝懊ャ繧ｯ繧ｹ縲托ｼ・{mbNameOMB}・峨ｒ陦ｨ蜷代″縺ｫ縺励∪縺吶°・歔), {
      type: 'CHOOSE',
      options: [
        {
          id: 'open', label: '陦ｨ蜷代″縺ｫ縺励※繝医Λ繝・す繝･縺ｸ',
          action: ({ type: 'STUB', id: 'INTERNAL_OPEN_MB_DO', value: zoneIdxOMB } as StubAction) as EffectAction,
          available: true,
        },
        { id: 'skip', label: '縺励↑縺・, action: noopOMB as EffectAction, available: true },
      ],
      count: 1,
    });
  }
  // INTERNAL_OPEN_MB_DO: MB陦ｨ蜷代″遒ｺ螳壼ｾ後・繝医Λ繝・す繝･遘ｻ蜍・  if (stub.id === 'INTERNAL_OPEN_MB_DO') {
    const zoneIdxOD = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const mbsOD = [...(ctx.ownerState.field.signi_magic_boxes ?? [null, null, null])] as (string | null)[];
    const mbCardOD = mbsOD[zoneIdxOD];
    if (!mbCardOD) return done(addLog(ctx, 'INTERNAL_OPEN_MB_DO・哺B縺ｪ縺・));
    mbsOD[zoneIdxOD] = null;
    const newOwnerOD: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, mbCardOD],
      field: { ...ctx.ownerState.field, signi_magic_boxes: mbsOD },
    };
    return done(addLog(
      { ...ctx, ownerState: newOwnerOD, lastProcessedCards: [mbCardOD] },
      `縲舌・繧ｸ繝・け繝懊ャ繧ｯ繧ｹ縲大・髢・ ${ctx.cardMap.get(mbCardOD)?.CardName ?? mbCardOD}竊偵ヨ繝ｩ繝・す繝･`,
    ));
  }
  // TARGET_OPP_SIGNI_ONLY / TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE: 蟇ｾ雎｡菫ｮ鬟ｾ蟄撰ｼ医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'TARGET_OPP_SIGNI_ONLY' || stub.id === 'TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE') {
    return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九ｒ蟇ｾ雎｡縺ｨ縺吶ｋ'));
  }
  // USE_CONDITION_ARTS_USED: 縺薙・繧ｿ繝ｼ繝ｳ縺ｫ繧｢繝ｼ繝・ｒ菴ｿ逕ｨ縺励※縺・◆蝣ｴ蜷医√％縺ｮ繧ｫ繝ｼ繝峨・菴ｿ逕ｨ荳榊庄
  // actions_done 縺ｫ 'USE_ARTS' 縺悟性縺ｾ繧後ｋ縺九メ繧ｧ繝・け・・attleScreen縺径rtsUse譎ゅ↓霑ｽ蜉・・  if (stub.id === 'USE_CONDITION_ARTS_USED') {
    const usedArtsUCU = ctx.ownerState.actions_done?.includes('USE_ARTS') ?? false;
    if (usedArtsUCU) {
      return done(addLog(ctx, '縺薙・繧ｿ繝ｼ繝ｳ縺吶〒縺ｫ繧｢繝ｼ繝・ｒ菴ｿ逕ｨ貂医∩ 竊・菴ｿ逕ｨ荳榊庄'));
    }
    return done(addLog(ctx, '繧｢繝ｼ繝・悴菴ｿ逕ｨ 竊・菴ｿ逕ｨ蜿ｯ'));
  }
  // CENTER_ZONE_CONDITION: 縺薙・繧ｷ繧ｰ繝九′荳ｭ螟ｮ繧ｾ繝ｼ繝ｳ・・one[1]・峨↓縺ゅｋ蝣ｴ蜷医・縺ｿ邯夊｡・  if (stub.id === 'CENTER_ZONE_CONDITION') {
    const srcCZC = ctx.sourceCardNum;
    if (srcCZC) {
      const centerStack = ctx.ownerState.field.signi[1];
      const inCenter = centerStack?.includes(srcCZC) ?? false;
      if (!inCenter) return done(addLog(ctx, '荳ｭ螟ｮ繧ｾ繝ｼ繝ｳ譚｡莉ｶ: 荳肴・遶具ｼ医せ繧ｭ繝・・・・));
    }
    return done(addLog(ctx, '荳ｭ螟ｮ繧ｾ繝ｼ繝ｳ譚｡莉ｶ: 謌千ｫ・));
  }
  // DEPLOY_RESTRICT: 驟咲ｽｮ蛻ｶ髯撰ｼ・ONTINUOUS縺ｯ蜍慕噪蜃ｦ逅・、UTO縺ｯ繝輔Λ繧ｰ險ｭ鄂ｮ・・  if (stub.id === 'DEPLOY_RESTRICT') {
    const srcDR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDR = srcDR ? (srcDR.EffectText ?? '') : '';
    const toHWDR = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 縲後ヱ繝ｯ繝ｼN莉･荳翫・繧ｷ繧ｰ繝九ｒ譁ｰ縺溘↓蝣ｴ縺ｫ蜃ｺ縺帙↑縺・坂・ 逶ｸ謇九↓驟咲ｽｮ繝代Ρ繝ｼ荳企剞繧定ｨｭ螳・    const powerCapM = txtDR.match(/繝代Ρ繝ｼ([・・・兔d荳Ⅹ+)莉･荳・*(?:譁ｰ縺溘↓)?蝣ｴ縺ｫ蜃ｺ縺帙↑縺・);
    if (powerCapM) {
      const cap = parseInt(toHWDR(powerCapM[1]).replace('荳・, '0000'));
      const newOtherDR = { ...ctx.otherState, signi_deploy_power_limit: cap };
      return done(addLog({ ...ctx, otherState: newOtherDR },
        `蟇ｾ謌ｦ逶ｸ謇九・繝代Ρ繝ｼ${cap}莉･荳翫・繧ｷ繧ｰ繝九ｒ蝣ｴ縺ｫ蜃ｺ縺帙↑縺・ｼ域ｬ｡繧ｿ繝ｼ繝ｳ縺ｾ縺ｧ・荏));
    }
    // 縲後懊・蜉ｹ譫懊↓繧医▲縺ｦ縺励°譁ｰ縺溘↓蝣ｴ縺ｫ蜃ｺ縺帙↑縺・坂・ 閾ｪ蛻・す繧ｰ繝九∈縺ｮ驟咲ｽｮ蛻ｶ髯撰ｼ医Ο繧ｰ縺ｮ縺ｿ・・    if (txtDR.includes('蜉ｹ譫懊↓繧医▲縺ｦ縺励°') || txtDR.includes('蜉ｹ譫應ｻ･螟・)) {
      return done(addLog(ctx, `驟咲ｽｮ蛻ｶ髯撰ｼ育音螳壼柑譫懊・縺ｿ・会ｼ・{srcDR?.CardName ?? ''}縺ｯ迚ｹ螳壼柑譫懊〒縺ｮ縺ｿ蝣ｴ縺ｫ蜃ｺ縺帙ｋ`));
    }
    return done(addLog(ctx, '驟咲ｽｮ蛻ｶ髯撰ｼ医ヱ繧ｿ繝ｼ繝ｳ隗｣譫蝉ｸ榊庄・・));
  }
  // DEFEAT: 謨怜圏蜃ｦ逅・- 繝ｩ繧､繝輔け繝ｭ繧ｹ繧・縺ｫ縺励※繧ｲ繝ｼ繝邨ゆｺ・ｒ隱倡匱
  if (stub.id === 'DEFEAT') {
    if (ctx.ownerState.prevent_defeat) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_defeat: undefined } },
        '謨怜圏辟｡蜉ｹ・・REVENT_DEFEAT逋ｺ蜍包ｼ・));
    }
    const newOwnerDEFEAT: PlayerState = { ...ctx.ownerState, life_cloth: [] };
    return done(addLog({ ...ctx, ownerState: newOwnerDEFEAT }, '謨怜圏・医Λ繧､繝輔け繝ｭ繧ｹ0・・));
  }
  // REPEAT_N_TIMES / REPEAT_EFFECT: 莉･荳九ｒN蝗樒ｹｰ繧願ｿ斐☆
  if (stub.id === 'REPEAT_N_TIMES' || stub.id === 'REPEAT_EFFECT') {
    const srcRNT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRNT = srcRNT ? (srcRNT.EffectText ?? '') + ' ' + (srcRNT.BurstText ?? '') : '';
    const toHWRNT = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const nMBase = txtRNT.match(/莉･荳九ｒ([・・・兔d]+)蝗櫁｡後≧/);
    // "縺薙・蜉ｹ譫懊ｒN蝗樒ｹｰ繧願ｿ斐☆" / "縺ゅ→N蝗・ 繝代ち繝ｼ繝ｳ蟇ｾ蠢・    const nMRepeat = txtRNT.match(/縺薙・蜉ｹ譫懊ｒ([・・・兔d]+)蝗樒ｹｰ繧願ｿ斐☆|縺ゅ→([・・・兔d]+)蝗・?:菴ｿ逕ｨ|郢ｰ繧願ｿ・/);
    let nRNT = nMBase ? parseInt(toHWRNT(nMBase[1])) : (nMRepeat ? parseInt(toHWRNT(nMRepeat[1] ?? nMRepeat[2])) : 1);
    // stub.value 縺後≠繧後・谿九ｊ蝗樊焚縺ｨ縺励※菴ｿ縺・ｼ磯｣骼門・螳溯｡梧凾・・    if (typeof stub.value === 'number') nRNT = stub.value;

    // REPEAT_EFFECT: 繝・ャ繧ｭ蜈ｬ髢銀・繧ｷ繧ｰ繝句ｴ縺ｫ蜃ｺ縺吶ヱ繧ｿ繝ｼ繝ｳ・・X04-093邉ｻ・・    if (stub.id === 'REPEAT_EFFECT' && nRNT > 0 && txtRNT.includes('繧ｷ繧ｰ繝九′繧√￥繧後ｋ縺ｾ縺ｧ')) {
      const deckRevealS: StubAction = { type: 'STUB', id: 'DECK_REVEAL_UNTIL' };
      const toFieldS: StubAction = { type: 'STUB', id: 'REVEALED_SIGNI_TO_FIELD_REST_TRASH' };
      const nextRepeatS: StubAction = { type: 'STUB', id: 'REPEAT_EFFECT', value: nRNT - 1 };
      const repeatSeq: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [deckRevealS as EffectAction, toFieldS as EffectAction, nextRepeatS as EffectAction] };
      return exec(repeatSeq, addLog(ctx, `郢ｰ繧願ｿ斐＠谿九ｊ${nRNT}蝗橸ｼ壹ョ繝・く蜈ｬ髢銀・蝣ｴ縺ｫ蜃ｺ縺兪));
    }
    // 繝代Ρ繝ｼ菫ｮ豁｣繝代ち繝ｼ繝ｳ
    const pwMRNT = txtRNT.match(/繝代Ρ繝ｼ繧・[・・][・・・兔d]+)縺吶ｋ/);
    if (pwMRNT) {
      const delta = parseInt(toHWRNT(pwMRNT[1]).replace('・・, '-'));
      const totalDelta = delta * nRNT;
      const modsRNT = [...(ctx.otherState.temp_power_mods ?? [])];
      [0,1,2].forEach(zi => {
        const top = ctx.otherState.field.signi[zi]?.at(-1);
        if (top) modsRNT.push({ cardNum: top, delta: totalDelta });
      });
      return done(addLog({...ctx, otherState: {...ctx.otherState, temp_power_mods: modsRNT}},
        `${nRNT}蝗樒ｹｰ繧願ｿ斐＠: 蜈ｨ繧ｷ繧ｰ繝九ヱ繝ｯ繝ｼ${totalDelta}・・{delta}ﾃ・{nRNT}・荏));
    }
    // 繝・ャ繧ｭ繝医Λ繝・す繝･繝代ち繝ｼ繝ｳ・育嶌謇具ｼ・    const millMRNT = txtRNT.match(/繝・ャ繧ｭ縺ｮ荳翫°繧峨き繝ｼ繝峨ｒ([・・・兔d]+)譫壹ヨ繝ｩ繝・す繝･縺ｫ鄂ｮ縺・);
    if (millMRNT) {
      const millPerRound = parseInt(toHWRNT(millMRNT[1]));
      const totalMill = millPerRound * nRNT;
      const toTrashRNT = ctx.otherState.deck.slice(0, Math.min(totalMill, ctx.otherState.deck.length));
      const newOtherRNT = { ...ctx.otherState, deck: ctx.otherState.deck.slice(toTrashRNT.length), trash: [...ctx.otherState.trash, ...toTrashRNT] };
      return done(addLog({...ctx, otherState: newOtherRNT}, `${nRNT}蝗樒ｹｰ繧願ｿ斐＠: 繝・ャ繧ｭ${toTrashRNT.length}譫壹ヨ繝ｩ繝・す繝･`));
    }
    // 繝峨Ο繝ｼ繝代ち繝ｼ繝ｳ・郁・蛻・ｼ・    const drawMRNT = txtRNT.match(/繧ｫ繝ｼ繝峨ｒ([・・・兔d]+)譫壼ｼ輔￥/);
    if (drawMRNT) {
      const drawPerRound = parseInt(toHWRNT(drawMRNT[1]));
      const totalDraw = drawPerRound * nRNT;
      const canDraw = Math.min(totalDraw, ctx.ownerState.deck.length);
      const newOwnerRNTDraw: PlayerState = {
        ...ctx.ownerState,
        hand: [...ctx.ownerState.hand, ...ctx.ownerState.deck.slice(0, canDraw)],
        deck: ctx.ownerState.deck.slice(canDraw),
      };
      return done(addLog({ ...ctx, ownerState: newOwnerRNTDraw }, `${nRNT}蝗樒ｹｰ繧願ｿ斐＠: ${canDraw}譫壹ラ繝ｭ繝ｼ`));
    }
    // 繝代Ρ繝ｼ繧｢繝・・繝代ち繝ｼ繝ｳ・郁・繧ｷ繧ｰ繝九・豁｣縺ｮ蛟､・・    const pwUpMRNT = txtRNT.match(/繝代Ρ繝ｼ繧端・・]([・・・兔d]+)縺吶ｋ/);
    if (pwUpMRNT) {
      const deltaUp = parseInt(toHWRNT(pwUpMRNT[1]));
      const totalDeltaUp = deltaUp * nRNT;
      const targetRNTUp = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
      if (targetRNTUp) {
        const modsRNTUp = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: targetRNTUp, delta: totalDeltaUp }];
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsRNTUp } },
          `${nRNT}蝗樒ｹｰ繧願ｿ斐＠: 繝代Ρ繝ｼ+${totalDeltaUp}`));
      }
    }
    // 繝舌え繝ｳ繧ｹ繝代ち繝ｼ繝ｳ・育嶌謇九す繧ｰ繝九ｒ謇区惆縺ｸ・・    if (txtRNT.includes('謇区惆縺ｫ謌ｻ縺・) && nRNT > 0) {
      const oppCands = ctx.otherState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
      if (oppCands.length > 0) {
        const toBounce = oppCands.slice(0, nRNT);
        let newOtherBounce = ctx.otherState;
        for (const cn of toBounce) {
          const newSigni = [...newOtherBounce.field.signi] as (string[] | null)[];
          const zi = newSigni.findIndex(s => s?.at(-1) === cn);
          if (zi >= 0) { newSigni[zi] = null; }
          newOtherBounce = { ...newOtherBounce, hand: [...newOtherBounce.hand, cn], field: { ...newOtherBounce.field, signi: newSigni } };
        }
        return done(addLog({ ...ctx, otherState: newOtherBounce }, `${nRNT}蝗樒ｹｰ繧願ｿ斐＠: 繝舌え繝ｳ繧ｹ${toBounce.length}菴伝));
      }
    }
    // 繝代Ρ繝ｼ繝繧ｦ繝ｳ・九ョ繝・く繝溘Ν隍・粋繝代ち繝ｼ繝ｳ・井ｾ具ｼ夐橿髀｡繧､繧ｪ繝ｪ縲鯉ｼ・000・九ョ繝・く2譫壹催湧・・    const pwDownMillM = txtRNT.match(/繝代Ρ繝ｼ繧・[・・][・・・兔d]+)縺吶ｋ.*?繝・ャ繧ｭ縺ｮ荳翫°繧峨き繝ｼ繝峨ｒ([・・・兔d]+)譫壹ヨ繝ｩ繝・す繝･/);
    if (pwDownMillM) {
      const deltaPDM = parseInt(toHWRNT(pwDownMillM[1]).replace('・・, '-'));
      const millPerPDM = parseInt(toHWRNT(pwDownMillM[2]));
      // 逶ｸ謇九す繧ｰ繝九↓1菴薙★縺､繝代Ρ繝ｼ繝繧ｦ繝ｳ・・RNT蝗槭√Λ繝ｳ繝繝縺ｫ謖ｯ繧雁・縺托ｼ・      const modsRNTPDM = [...(ctx.otherState.temp_power_mods ?? [])];
      const oppSigniListPDM = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter(Boolean) as string[];
      for (let i = 0; i < nRNT; i++) {
        const target = oppSigniListPDM[i % Math.max(1, oppSigniListPDM.length)];
        if (target) modsRNTPDM.push({ cardNum: target, delta: deltaPDM });
      }
      const totalMillPDM = millPerPDM * nRNT;
      const toTrashPDM = ctx.otherState.deck.slice(0, Math.min(totalMillPDM, ctx.otherState.deck.length));
      const newOtherPDM = {
        ...ctx.otherState,
        temp_power_mods: modsRNTPDM,
        deck: ctx.otherState.deck.slice(toTrashPDM.length),
        trash: [...ctx.otherState.trash, ...toTrashPDM],
      };
      return done(addLog({ ...ctx, otherState: newOtherPDM },
        `${nRNT}蝗樒ｹｰ繧願ｿ斐＠: 繝代Ρ繝ｼ${deltaPDM}ﾃ・{nRNT}・九ョ繝・く${toTrashPDM.length}譫壹ヨ繝ｩ繝・す繝･`));
    }
    // 荳｡閠・ョ繝・く繝溘Ν繝代ち繝ｼ繝ｳ・井ｾ具ｼ壹後≠縺ｪ縺溘°蟇ｾ謌ｦ逶ｸ謇九・繝・ャ繧ｭ縺ｮ荳翫°繧丑譫壹ヨ繝ｩ繝・す繝･縲坂・荳｡閠・↓mill・・    const bothMillM = txtRNT.match(/縺ゅ↑縺溘°蟇ｾ謌ｦ逶ｸ謇九・繝・ャ繧ｭ縺ｮ荳翫°繧峨き繝ｼ繝峨ｒ([・・・兔d]+)譫壹ヨ繝ｩ繝・す繝･/);
    if (bothMillM) {
      const millPerBMRNT = parseInt(toHWRNT(bothMillM[1]));
      const totalBMRNT = millPerBMRNT * nRNT;
      const toTrashOwnerBM = ctx.ownerState.deck.slice(0, Math.min(totalBMRNT, ctx.ownerState.deck.length));
      const toTrashOtherBM = ctx.otherState.deck.slice(0, Math.min(totalBMRNT, ctx.otherState.deck.length));
      const newOwnerBM = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(toTrashOwnerBM.length), trash: [...ctx.ownerState.trash, ...toTrashOwnerBM] };
      const newOtherBM = { ...ctx.otherState, deck: ctx.otherState.deck.slice(toTrashOtherBM.length), trash: [...ctx.otherState.trash, ...toTrashOtherBM] };
      return done(addLog({ ...ctx, ownerState: newOwnerBM, otherState: newOtherBM },
        `${nRNT}蝗樒ｹｰ繧願ｿ斐＠: 荳｡閠・ョ繝・く${millPerBMRNT}譫堙・{nRNT}繝医Λ繝・す繝･`));
    }
    return done(addLog(ctx, `${nRNT}蝗樒ｹｰ繧願ｿ斐＠蜉ｹ譫懶ｼ亥ｾ檎ｶ壹せ繝・ャ繝励〒蜃ｦ逅・ｼ荏));
  }
  // PLACE_CHOKKIN: sourceCardNum縺ｮ繧ｾ繝ｼ繝ｳ縺ｫ縲占ｲｯ闖後代き繧ｦ繝ｳ繧ｿ繝ｼ繧・1
  if (stub.id === 'PLACE_CHOKKIN') {
    if (!ctx.sourceCardNum) return done(addLog(ctx, '繝√Ι繝・く繝ｳ險ｭ鄂ｮ蜈井ｸ肴・'));
    let ziPC = -1;
    for (let i = 0; i < 3; i++) {
      if (ctx.ownerState.field.signi[i]?.at(-1) === ctx.sourceCardNum) { ziPC = i; break; }
    }
    if (ziPC < 0) return done(addLog(ctx, '繝√Ι繝・く繝ｳ險ｭ鄂ｮ蜈医す繧ｰ繝九↑縺・));
    const chokkinPC = [...(ctx.ownerState.field.signi_chokkin ?? [0, 0, 0])];
    chokkinPC[ziPC] = (chokkinPC[ziPC] ?? 0) + 1;
    const newOwnerPC: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_chokkin: chokkinPC } };
    return done(addLog({ ...ctx, ownerState: newOwnerPC }, `縲占ｲｯ闖後妥・{chokkinPC[ziPC]}・医だ繝ｼ繝ｳ${ziPC + 1}・荏));
  }
  // ADD_RESONANCE_CONDITION: 繝ｬ繧ｾ繝頑擅莉ｶ霑ｽ蜉・医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'ADD_RESONANCE_CONDITION') {
    return done(addLog(ctx, '繝ｬ繧ｾ繝頑擅莉ｶ霑ｽ蜉'));
  }
  // IGNORE_LRIG_RESTRICTION_ARTS: 繝ｫ繝ｪ繧ｰ蛻ｶ髯舌い繝ｼ繝・ｒ辟｡隕厄ｼ医ヵ繝ｩ繧ｰ險ｭ螳夲ｼ・  if (stub.id === 'IGNORE_LRIG_RESTRICTION_ARTS') {
    const newOwnerILRA: PlayerState = { ...ctx.ownerState, lrig_gained_types: [...(ctx.ownerState.lrig_gained_types ?? []), '__ignore_lrig_restriction__'] };
    return done(addLog({ ...ctx, ownerState: newOwnerILRA }, '縺薙・繧ｲ繝ｼ繝縺ｮ髢薙√Ν繝ｪ繧ｰ蛻ｶ髯舌い繝ｼ繝・ｒ辟｡隕・));
  }
  // COST_COLOR_SELECT: 繧ｳ繧ｹ繝郁牡繧帝∈謚橸ｼ医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'COST_COLOR_SELECT') {
    return done(addLog(ctx, '繧ｳ繧ｹ繝郁牡繧帝∈謚・));
  }
  // HASTARLIQ: 繝上せ繧ｿ繝ｫ繝ｪ繧ｯ蜉ｹ譫懶ｼ医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'HASTARLIQ') {
    return done(addLog(ctx, '繝上せ繧ｿ繝ｫ繝ｪ繧ｯ蜉ｹ譫・));
  }
  // ACTIVATE_EICHI_ABILITY: 繧ｳ繧､繝ｳ閭ｽ蜉帙〒縺薙・繧ｷ繧ｰ繝九・縲仙・縲大柑譫懊ｒ蜀咲匱蜍・  if (stub.id === 'ACTIVATE_EICHI_ABILITY') {
    const srcAEA = ctx.sourceCardNum ? ctx.cardMap.get(getCardNum(ctx.sourceCardNum)) : undefined;
    if (!srcAEA) return done(addLog(ctx, '繧ｨ繧､繝∬・蜉幢ｼ壹た繝ｼ繧ｹ繧ｫ繝ｼ繝峨↑縺・));
    const eichiEffs = parseCardEffects(srcAEA);
    const onPlayAEA = eichiEffs.find(e => e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY'));
    if (onPlayAEA) {
      return exec(onPlayAEA.action, addLog(ctx, `繧ｨ繧､繝∬・蜉幢ｼ・{srcAEA.CardName}縺ｮ縲仙・縲大柑譫懊ｒ逋ｺ蜍描));
    }
    return done(addLog(ctx, `繧ｨ繧､繝∬・蜉帷匱蜍包ｼ・{srcAEA.CardName}・荏));
  }
  // CHANGE_EICHI_SIGNI_BASE_LEVEL: 闍ｱ遏･繧ｷ繧ｰ繝九ｒ驕ｸ謚樞・蝓ｺ譛ｬ繝ｬ繝吶Ν繧・・・縺ｫ螟画峩・医ち繝ｼ繝ｳ邨ゆｺ・∪縺ｧ・・  if (stub.id === 'CHANGE_EICHI_SIGNI_BASE_LEVEL') {
    // stub.value縺梧焚蛟､縺九▽lastProcessedCards縺ゅｊ竊帝←逕ｨ
    if (typeof stub.value === 'number' && ctx.lastProcessedCards?.length) {
      const targetCESBL = ctx.lastProcessedCards[0];
      const newOvCESBL = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [targetCESBL]: stub.value as number };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: newOvCESBL } },
        `${ctx.cardMap.get(targetCESBL)?.CardName ?? targetCESBL}縺ｮ蝓ｺ譛ｬ繝ｬ繝吶Ν繧・{stub.value}縺ｫ螟画峩`));
    }
    // lastProcessedCards縺ゅｊ・医ち繝ｼ繧ｲ繝・ヨ驕ｸ謚樊ｸ医∩・俄・繝ｬ繝吶Ν驕ｸ謚・    if (ctx.lastProcessedCards?.length) {
      const targetCESBL2 = ctx.lastProcessedCards[0];
      const optsCESBL = [1,2,3].map(lv => ({
        id: `lv_${lv}`, label: `繝ｬ繝吶Ν${lv}`,
        action: ({ type: 'STUB', id: 'CHANGE_EICHI_SIGNI_BASE_LEVEL', value: lv } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, `${ctx.cardMap.get(targetCESBL2)?.CardName ?? targetCESBL2}縺ｮ繝ｬ繝吶Ν繧帝∈謚杼), {
        type: 'CHOOSE', options: optsCESBL, count: 1,
      });
    }
    // SELECT_TARGET: 閾ｪ繝輔ぅ繝ｼ繝ｫ繝峨・闍ｱ遏･繧ｷ繧ｰ繝・    const srcCESBL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCESBL = srcCESBL ? (srcCESBL.EffectText ?? '') + ' ' + (srcCESBL.BurstText ?? '') : '';
    const classNameCESBL = txtCESBL.match(/・・[^・枉+)・槭・繧ｷ繧ｰ繝・)?.[1] ?? '闍ｱ遏･';
    const eichiCandsCESBL = ctx.ownerState.field.signi.flatMap(s => {
      const top = s?.at(-1);
      if (!top || top === ctx.sourceCardNum) return [];
      return (ctx.cardMap.get(top)?.CardClass ?? '').includes(classNameCESBL) ? [top] : [];
    });
    if (eichiCandsCESBL.length === 0) return done(addLog(ctx, `・・{classNameCESBL}・槭す繧ｰ繝九↑縺暦ｼ・HANGE_EICHI_SIGNI_BASE_LEVEL・荏));
    const contCESBL: StubAction = { type: 'STUB', id: 'CHANGE_EICHI_SIGNI_BASE_LEVEL' };
    return needsInteraction(addLog(ctx, `・・{classNameCESBL}・槭す繧ｰ繝九ｒ驕ｸ謚橸ｼ亥渕譛ｬ繝ｬ繝吶Ν螟画峩・荏), {
      type: 'SELECT_TARGET', candidates: eichiCandsCESBL, count: 1, optional: false,
      targetScope: 'self_field', thenAction: contCESBL as EffectAction,
    });
  }
  // TRIGGER_OTHER_SIGNI_EICHI_ABILITY: 莉悶・閾ｪ繧ｷ繧ｰ繝九ｒ驕ｸ謚槭＠縲√◎縺ｮ闍ｱ遏･AUTO閭ｽ蜉帙ｒ逋ｺ蜍輔＆縺帙ｋ
  if (stub.id === 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY') {
    if (ctx.lastProcessedCards?.length) {
      const targetTOSEA = ctx.lastProcessedCards[0];
      const cardTOSEA = ctx.cardMap.get(targetTOSEA);
      if (!cardTOSEA) return done(addLog(ctx, 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY: 繧ｫ繝ｼ繝峨↑縺・));
      const effectsTOSEA = parseCardEffects(cardTOSEA);
      // 闍ｱ遏･AUTO閭ｽ蜉帙ｒ讀懃ｴ｢・・ctiveCondition: EICHI_LEVEL_SUM・・      const eichiEffTOSEA = effectsTOSEA.find(e =>
        e.effectType === 'AUTO' && e.activeCondition?.type === 'EICHI_LEVEL_SUM');
      if (!eichiEffTOSEA) return done(addLog(ctx, `${cardTOSEA.CardName}縺ｫ闍ｱ遏･AUTO閭ｽ蜉帙↑縺輿));
      return exec(eichiEffTOSEA.action,
        addLog({ ...ctx, sourceCardNum: targetTOSEA, lastProcessedCards: [] },
          `${cardTOSEA.CardName}縺ｮ闍ｱ遏･AUTO閭ｽ蜉帙ｒ逋ｺ蜍描));
    }
    // 莉悶・閾ｪ繧ｷ繧ｰ繝九ｒ驕ｸ謚・    const otherSigniTOSEA = ctx.ownerState.field.signi.flatMap(s => {
      const top = s?.at(-1);
      return (top && top !== ctx.sourceCardNum) ? [top] : [];
    });
    if (otherSigniTOSEA.length === 0) return done(addLog(ctx, '莉悶・繧ｷ繧ｰ繝九↑縺暦ｼ・RIGGER_OTHER_SIGNI_EICHI_ABILITY・・));
    const contTOSEA: StubAction = { type: 'STUB', id: 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY' };
    return needsInteraction(addLog(ctx, '闍ｱ遏･閭ｽ蜉帙ｒ逋ｺ蜍輔＆縺帙ｋ繧ｷ繧ｰ繝九ｒ驕ｸ謚・), {
      type: 'SELECT_TARGET', candidates: otherSigniTOSEA, count: 1, optional: false,
      targetScope: 'self_field', thenAction: contTOSEA as EffectAction,
    });
  }
  // SUPPRESS_CENTER_ON_PLAY: 縺薙・繧ｿ繝ｼ繝ｳ閾ｪ蛻・・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ縲仙・縲大柑譫懊ｒ謚大宛
  if (stub.id === 'SUPPRESS_CENTER_ON_PLAY') {
    const newOwner = { ...ctx.ownerState, suppress_center_on_play: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, '縺薙・繧ｿ繝ｼ繝ｳ縲√そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ縲仙・縲題・蜉帙・逋ｺ蜍輔＠縺ｪ縺・));
  }
  // SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: 縺薙・繧ｷ繧ｰ繝九ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺丈ｻ｣繧上ｊ縺ｫ繝繝｡繝ｼ繧ｸ辟｡蜉ｹ・井ｻｻ諢擾ｼ・  if (stub.id === 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH') {
    const srcSDWT = ctx.sourceCardNum;
    if (!srcSDWT) return done(addLog(ctx, 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: 繧ｽ繝ｼ繧ｹ縺ｪ縺・));
    const inFieldSDWT = ctx.ownerState.field.signi.some(s => s?.includes(srcSDWT));
    if (!inFieldSDWT) return done(addLog(ctx, 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: 繝輔ぅ繝ｼ繝ｫ繝峨↓繧ｷ繧ｰ繝九↑縺・));
    const noopSDWT: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, `${ctx.cardMap.get(srcSDWT)?.CardName ?? srcSDWT}繧偵ヨ繝ｩ繝・す繝･竊偵ム繝｡繝ｼ繧ｸ辟｡蜉ｹ縺励∪縺吶°・歔), {
      type: 'CHOOSE', count: 1,
      options: [
        {
          id: 'trash_prevent', label: `${ctx.cardMap.get(srcSDWT)?.CardName ?? srcSDWT}繧偵ヨ繝ｩ繝・す繝･縺励※繝繝｡繝ｼ繧ｸ辟｡蜉ｹ`,
          action: ({ type: 'STUB', id: 'INTERNAL_SDWT_DO' } as StubAction) as EffectAction, available: true,
        },
        { id: 'skip', label: '縺励↑縺・ｼ医ム繝｡繝ｼ繧ｸ繧貞女縺代ｋ・・, action: noopSDWT as EffectAction, available: true },
      ],
    });
  }
  // INTERNAL_SDWT_DO: 繧ｷ繧ｰ繝九ヨ繝ｩ繝・す繝･+繝繝｡繝ｼ繧ｸ辟｡蜉ｹ螳溯｡・  if (stub.id === 'INTERNAL_SDWT_DO') {
    const srcISDWT = ctx.sourceCardNum;
    if (!srcISDWT) return done(addLog(ctx, 'INTERNAL_SDWT_DO: 繧ｽ繝ｼ繧ｹ縺ｪ縺・));
    const newSigniISDWT = ctx.ownerState.field.signi.map(s => {
      if (!s?.includes(srcISDWT)) return s;
      const f = s.filter(c => c !== srcISDWT);
      return f.length > 0 ? f : null;
    }) as (string[] | null)[];
    const newOwnerISDWT: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, srcISDWT],
      field: { ...ctx.ownerState.field, signi: newSigniISDWT },
      prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1,
    };
    return done(addLog({ ...ctx, ownerState: newOwnerISDWT },
      `${ctx.cardMap.get(srcISDWT)?.CardName ?? srcISDWT}繧偵ヨ繝ｩ繝・す繝･竊偵ム繝｡繝ｼ繧ｸ辟｡蜉ｹ`));
  }
  // SELECT_NO_COMMON_COLOR: 蜈ｱ騾夊牡縺ｪ縺励ｒ驕ｸ謚橸ｼ医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'SELECT_NO_COMMON_COLOR') {
    return done(addLog(ctx, '蜈ｱ騾夊牡縺ｪ縺励ｒ驕ｸ謚・));
  }
  // DISCARD_BY_POWER_MATCH: 繝代Ρ繝ｼ荳閾ｴ縺ｧ謐ｨ縺ｦ・医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'DISCARD_BY_POWER_MATCH') {
    return done(addLog(ctx, '繝代Ρ繝ｼ荳閾ｴ縺ｧ謐ｨ縺ｦ・医せ繧ｭ繝・・・・));
  }
  // DECLARE_NUMBER_RANGE: 0縲・縺ｮ謨ｰ蟄怜ｮ｣險・・ECLARE_NUMBER縺ｨ蜷梧ｧ倥□縺・繧貞性繧・・  if (stub.id === 'DECLARE_NUMBER_RANGE') {
    const setDNR = (n: number): StubAction => ({ type: 'STUB', id: 'SET_DECLARED_NUMBER', value: n });
    const optsDNR = [0, 1, 2, 3, 4, 5].map(n => ({
      id: `dnr_${n}`, label: `${n}繧貞ｮ｣險`, action: setDNR(n) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, '謨ｰ蟄励ｒ螳｣險縺励※縺上□縺輔＞・・縲・・・), {
      type: 'CHOOSE', options: optsDNR, count: 1,
    });
  }
  // DECLARE_NUMBER_POWER: 繝代Ρ繝ｼ蛟､螳｣險・・000縲・5000・俄・ declared_guard_restrict_level 縺ｫ菫晏ｭ・  if (stub.id === 'DECLARE_NUMBER_POWER') {
    const setDNP = (n: number): StubAction => ({ type: 'STUB', id: 'SET_DECLARED_NUMBER', value: n });
    const optsDNP = [3000, 5000, 7000, 10000, 12000, 15000].map(n => ({
      id: `pwr_${n}`, label: `${n.toLocaleString()}繧貞ｮ｣險`, action: setDNP(n) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, '繝代Ρ繝ｼ繧貞ｮ｣險縺励※縺上□縺輔＞'), {
      type: 'CHOOSE', options: optsDNP, count: 1,
    });
  }
  // CONDITIONAL_ALTERNATE_EFFECT: 譚｡莉ｶ驕疲・譎ゅ↓繝繧ｦ繝ｳ貂医∩繧ｷ繧ｰ繝九ｒ繝医Λ繝・す繝･縺ｸ・井ｻ｣譖ｿ蜉ｹ譫懶ｼ・  if (stub.id === 'CONDITIONAL_ALTERNATE_EFFECT') {
    const srcCAE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCAE = srcCAE ? (srcCAE.EffectText ?? '') + ' ' + (srcCAE.BurstText ?? '') : '';
    // 縲後≠縺ｪ縺溘・蝣ｴ縺ｫ・廚LASS・槭・繧ｷ繧ｰ繝九′縺ゅｋ蝣ｴ蜷医∽ｻ｣繧上ｊ縺ｫ縲阪ヱ繧ｿ繝ｼ繝ｳ
    const classMatchCAE = txtCAE.match(/縺ゅ↑縺溘・蝣ｴ縺ｫ・・[^・枉+)・槭・繧ｷ繧ｰ繝九′縺ゅｋ蝣ｴ蜷・縲・]莉｣繧上ｊ縺ｫ/);
    const reqClassCAE = classMatchCAE ? classMatchCAE[1] : '';
    const condMetCAE = reqClassCAE
      ? ctx.ownerState.field.signi.some(stack => {
          const cn = stack?.at(-1);
          return cn && (ctx.cardMap.get(cn)?.CardClass ?? '').includes(reqClassCAE);
        })
      : false;
    if (condMetCAE && ctx.lastProcessedCards?.[0]) {
      const targetCAE = ctx.lastProcessedCards[0];
      const removedCAE = removeFromField(targetCAE, ctx.otherState);
      const newOtherCAE: PlayerState = { ...removedCAE, trash: [...removedCAE.trash, targetCAE] };
      return done(addLog({ ...ctx, otherState: newOtherCAE },
        `・・{reqClassCAE}・槭≠繧岩・${ctx.cardMap.get(targetCAE)?.CardName ?? targetCAE}繧偵ヨ繝ｩ繝・す繝･縺ｸ・井ｻ｣譖ｿ蜉ｹ譫懶ｼ荏));
    }
    return done(addLog(ctx, `莉｣譖ｿ譚｡莉ｶ譛ｪ驕費ｼ・{reqClassCAE ? '・・ + reqClassCAE + '・槭↑縺・ : '譚｡莉ｶ隗｣譫蝉ｸ榊庄'}・荏));
  }
  // TRASH_SPELL_FREE_USE_LIMIT: 繝医Λ繝・す繝･繧ｹ繝壹Ν辟｡譁吩ｽｿ逕ｨ蛻ｶ髯撰ｼ医Ο繧ｰ縺ｮ縺ｿ・・  // TRASH_SPELL_FREE_USE_LIMIT: 繝医Λ繝・す繝･縺九ｉ繧ｳ繧ｹ繝井ｸ企剞莉･荳九・繧ｹ繝壹Ν繧偵さ繧ｹ繝医↑縺励〒菴ｿ逕ｨ
  if (stub.id === 'TRASH_SPELL_FREE_USE_LIMIT') {
    const cnTSFUL = ctx.lastProcessedCards?.[0];
    if (!cnTSFUL) {
      const srcTSFUL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
      const txtTSFUL = srcTSFUL ? (srcTSFUL.EffectText ?? '') + ' ' + (srcTSFUL.BurstText ?? '') : '';
      const toHWTSFUL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const costLimMTSFUL = txtTSFUL.match(/繧ｳ繧ｹ繝医・蜷郁ｨ医′([・・・兔d]+)莉･荳九・繧ｹ繝壹Ν/);
      const costLimTSFUL = costLimMTSFUL ? parseInt(toHWTSFUL(costLimMTSFUL[1])) : 2;
      const trashSpellsTSFUL = ctx.ownerState.trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        if (!c || c.Type !== '繧ｹ繝壹Ν') return false;
        const colorCount = (c.Cost ?? '').match(/[襍､髱堤ｷ鷹ｻ堤區辟｡]/g)?.length ?? 0;
        return colorCount <= costLimTSFUL;
      });
      if (trashSpellsTSFUL.length === 0) return done(addLog(ctx, `繝医Λ繝・す繝･縺ｫ繧ｳ繧ｹ繝・{costLimTSFUL}莉･荳九・繧ｹ繝壹Ν縺ｪ縺輿));
      const contTSFUL: StubAction = { type: 'STUB', id: 'TRASH_SPELL_FREE_USE_LIMIT' };
      return needsInteraction(addLog(ctx, '繝医Λ繝・す繝･縺ｮ繧ｹ繝壹Ν繧帝∈謚橸ｼ医さ繧ｹ繝医↑縺嶺ｽｿ逕ｨ・・), {
        type: 'SELECT_TARGET', candidates: trashSpellsTSFUL, count: 1, optional: false,
        targetScope: 'self_trash', thenAction: contTSFUL as EffectAction,
      });
    }
    const cardTSFUL = ctx.cardMap.get(cnTSFUL);
    if (!cardTSFUL) return done(addLog(ctx, 'TRASH_SPELL_FREE_USE_LIMIT: 繧ｫ繝ｼ繝峨↑縺・));
    const effectsTSFUL = parseCardEffects(cardTSFUL);
    const mainEffTSFUL = effectsTSFUL.find(e =>
      e.effectType === 'ACTIVATED' || (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY')));
    if (!mainEffTSFUL) return done(addLog(ctx, `${cardTSFUL.CardName}蜉ｹ譫懊↑縺輿));
    return exec(mainEffTSFUL.action,
      addLog({ ...ctx, sourceCardNum: cnTSFUL, lastProcessedCards: [] },
        `${cardTSFUL.CardName}繧偵ヨ繝ｩ繝・す繝･縺九ｉ繧ｳ繧ｹ繝医↑縺励〒菴ｿ逕ｨ`));
  }
  // UPKEEP_OR_NO_UP: 繧｢繝・・繧ｭ繝ｼ繝励°繧｢繝・・縺ｪ縺暦ｼ医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'UPKEEP_OR_NO_UP') {
    return done(addLog(ctx, '繧｢繝・・繧ｭ繝ｼ繝励°繧｢繝・・縺ｪ縺・));
  }
  // ACTIVATE_COST_ZERO_BLACK: 繝医Λ繝・す繝･縺ｮ繧ｷ繧ｰ繝九ｒ驕ｸ謚樞・谺｡縺ｮ襍ｷ蜍輔さ繧ｹ繝医ｒ縲企ｻ津・縲九↓
  if (stub.id === 'ACTIVATE_COST_ZERO_BLACK') {
    if (!ctx.lastProcessedCards?.length) {
      const trashSigniACZB = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
      if (trashSigniACZB.length === 0) return done(addLog(ctx, '繝医Λ繝・す繝･縺ｫ繧ｷ繧ｰ繝九↑縺暦ｼ・CTIVATE_COST_ZERO_BLACK・・));
      const contACZB: StubAction = { type: 'STUB', id: 'ACTIVATE_COST_ZERO_BLACK' };
      return needsInteraction(addLog(ctx, '繧ｳ繧ｹ繝・縺ｫ縺吶ｋ繧ｷ繧ｰ繝九ｒ驕ｸ謚橸ｼ医ヨ繝ｩ繝・す繝･縺九ｉ・・), {
        type: 'SELECT_TARGET', candidates: trashSigniACZB, count: 1, optional: false,
        targetScope: 'self_trash', thenAction: contACZB as EffectAction,
      });
    }
    const targetACZB = ctx.lastProcessedCards[0];
    const newOwnerACZB = { ...ctx.ownerState, activate_cost_zero_signi: targetACZB };
    return done(addLog({ ...ctx, ownerState: newOwnerACZB },
      `${ctx.cardMap.get(targetACZB)?.CardName ?? targetACZB}縺ｮ谺｡縺ｮ襍ｷ蜍輔さ繧ｹ繝遺・縲企ｻ津・縲義));
  }
  // BET_CONDITION: 繝吶ャ繝域擅莉ｶ・医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'BET_CONDITION') {
    return done(addLog(ctx, '繝吶ャ繝域擅莉ｶ'));
  }
  // DISABLE_FIRST_ABILITY_ON_ATTACK: 繧｢繧ｿ繝・け譎よ怙蛻昴・閭ｽ蜉帙ｒ辟｡蜉ｹ蛹厄ｼ医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'DISABLE_FIRST_ABILITY_ON_ATTACK') {
    return done(addLog(ctx, '繧｢繧ｿ繝・け譎よ怙蛻昴・閭ｽ蜉帙ｒ辟｡蜉ｹ蛹・));
  }
  // REPLACE_PLUS_N: 縺薙・繧ｿ繝ｼ繝ｳ縲∫嶌謇九す繧ｰ繝九∈縺ｮ豁｣繝代Ρ繝ｼ菫ｮ豁｣繧定ｲ縺ｫ鄂ｮ謠・  if (stub.id === 'REPLACE_PLUS_N') {
    const newOwnerRPN: PlayerState = { ...ctx.ownerState, replace_opp_power_plus: true };
    return done(addLog({ ...ctx, ownerState: newOwnerRPN }, '縺薙・繧ｿ繝ｼ繝ｳ逶ｸ謇九す繧ｰ繝九∈縺ｮ+繝代Ρ繝ｼ菫ｮ豁｣繧・縺ｫ鄂ｮ謠・));
  }
  // CONDITIONAL_KEYWORD_BY_CENTER_COLOR already handled above
  // === 繝舌ャ繝・6: 繧｢繧ｯ繧ｻ繝ｻ蜈ｬ髢九・豎守畑驕ｸ謚樒ｳｻ ===
  // GRID_REVEAL_PLUS: 繧ｰ繝ｪ繝・ラ蜈ｬ髢具ｼ医ョ繝・く荳翫ｒ蜈ｬ髢九＠邨先棡縺ｫ蠢懊§縺ｦ繝峨Ο繝ｼ遲会ｼ・  if (stub.id === 'GRID_REVEAL_PLUS') {
    const sGRP = ctx.ownerState;
    if (sGRP.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺暦ｼ医げ繝ｪ繝・ラ蜈ｬ髢九〒縺阪★・・));
    const topGRP = sGRP.deck[0];
    const cardGRP = ctx.cardMap.get(topGRP);
    const newSGRP: PlayerState = { ...sGRP, deck: sGRP.deck.slice(1), trash: [...sGRP.trash, topGRP] };
    return done(addLog({ ...ctx, ownerState: newSGRP, lastProcessedCards: [topGRP] },
      `繧ｰ繝ｪ繝・ラ蜈ｬ髢具ｼ・{cardGRP?.CardName ?? topGRP}竊偵ヨ繝ｩ繝・す繝･`));
  }
  // MAGIC_BOX_REVEAL: 蝣ｴ縺ｮMB繧定｡ｨ蜷代″縺ｫ縺励※繧ｷ繧ｰ繝九↓縺吶ｋ・亥・MB繧偵す繧ｰ繝九→縺励※驟咲ｽｮ・・  if (stub.id === 'MAGIC_BOX_REVEAL') {
    const mbsReveal = ctx.ownerState.field.signi_magic_boxes ?? [null, null, null];
    const newSigniReveal = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const newMBsReveal = [...mbsReveal] as (string | null)[];
    const revealedCards: string[] = [];
    for (let i = 0; i < 3; i++) {
      if (!mbsReveal[i]) continue;
      const mbCard = mbsReveal[i]!;
      const cardData = ctx.cardMap.get(mbCard);
      // 荳ｭ霄ｫ縺後す繧ｰ繝九〒縺ｪ縺代ｌ縺ｰ繧ｹ繧ｭ繝・・・井ｾ具ｼ壹せ繝壹Ν遲峨・蝣ｴ縺ｫ蜃ｺ縺帙↑縺・ｼ・      if (cardData && cardData.Type !== '繧ｷ繧ｰ繝・) continue;
      newSigniReveal[i] = [mbCard];
      newMBsReveal[i] = null;
      revealedCards.push(mbCard);
    }
    if (revealedCards.length === 0) return done(addLog(ctx, 'MB縺ｪ縺暦ｼ医∪縺溘・荳ｭ霄ｫ縺後す繧ｰ繝九〒縺ｪ縺・ｼ・));
    const newOwnerReveal: PlayerState = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, signi: newSigniReveal, signi_magic_boxes: newMBsReveal },
    };
    const names = revealedCards.map(c => ctx.cardMap.get(c)?.CardName ?? c).join('縲・);
    return done(addLog({ ...ctx, ownerState: newOwnerReveal, lastProcessedCards: revealedCards },
      `縲舌・繧ｸ繝・け繝懊ャ繧ｯ繧ｹ縲題｡ｨ蜷代″竊偵す繧ｰ繝具ｼ・{names}`));
  }
  // ACCE_OP: 繧｢繧ｯ繧ｻ謫堺ｽ懶ｼ域ｱ守畑繝ｭ繧ｰ・・  if (stub.id === 'ACCE_OP') {
    const acceCountAO = (ctx.ownerState.field.signi_acce ?? []).filter(cn => cn !== null).length;
    return done(addLog(ctx, `繧｢繧ｯ繧ｻ謫堺ｽ懶ｼ育樟蝨ｨ${acceCountAO}蛟九・繧｢繧ｯ繧ｻ・荏));
  }
  // ACCE_SIGNI_ALL_COLOR: 繧｢繧ｯ繧ｻ荳ｭ縺ｮ繧ｷ繧ｰ繝九ｒ蜈ｨ濶ｲ縺ｫ縺吶ｋ
  if (stub.id === 'ACCE_SIGNI_ALL_COLOR') {
    const srcASAC = ctx.sourceCardNum;
    const acceASAC = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const zoneIdxASAC = acceASAC.findIndex(cn => cn === srcASAC);
    if (zoneIdxASAC < 0) return done(addLog(ctx, '繧｢繧ｯ繧ｻ荳ｭ縺ｮ繧ｷ繧ｰ繝九′隕九▽縺九ｉ縺ｪ縺・));
    const targetSigniASAC = ctx.ownerState.field.signi[zoneIdxASAC]?.at(-1);
    if (!targetSigniASAC) return done(addLog(ctx, '繧｢繧ｯ繧ｻ蜈医・繧ｷ繧ｰ繝九′縺・↑縺・));
    // story_overrides 縺ｫ繝輔Λ繧ｰ縺ｨ縺励※險倬鹸・亥・濶ｲ莉倅ｸ弱・諢擾ｼ・    const ovASAC = { ...(ctx.ownerState.story_overrides ?? {}), [targetSigniASAC]: 'ALL_COLOR' };
    const newSASAC: PlayerState = { ...ctx.ownerState, story_overrides: ovASAC };
    return done(addLog({ ...ctx, ownerState: newSASAC },
      `${ctx.cardMap.get(targetSigniASAC)?.CardName ?? targetSigniASAC}縺悟・濶ｲ繧呈戟縺､`));
  }
  // TRASH_ACCE_AT_TURN_END: 繧｢繧ｯ繧ｻ繧ｫ繝ｼ繝峨ｒ繧ｿ繝ｼ繝ｳ邨ゆｺ・凾縺ｫ繝医Λ繝・す繝･・亥叉蠎ｧ縺ｫ蜃ｦ逅・ｼ・  // TRASH_ACCE_AT_TURN_END: 縺薙・繧ｷ繧ｰ繝九↓莉倥＞縺ｦ縺・ｋ繧｢繧ｯ繧ｻ1譫壹ｒ繝医Λ繝・す繝･縺ｸ
  if (stub.id === 'TRASH_ACCE_AT_TURN_END') {
    const srcTATE = ctx.sourceCardNum;
    const zoneIdxTATE = srcTATE
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcTATE)
      : -1;
    const acceTATE = zoneIdxTATE >= 0
      ? (ctx.ownerState.field.signi_acce ?? [null, null, null])[zoneIdxTATE]
      : null;
    if (!acceTATE) return done(addLog(ctx, '繧｢繧ｯ繧ｻ縺ｪ縺暦ｼ・RASH_ACCE_AT_TURN_END・・));
    const newAcceTATE = [...(ctx.ownerState.field.signi_acce ?? [null, null, null])] as (string | null)[];
    newAcceTATE[zoneIdxTATE] = null;
    const newSTATE: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, acceTATE],
      field: { ...ctx.ownerState.field, signi_acce: newAcceTATE },
    };
    return done(addLog({ ...ctx, ownerState: newSTATE },
      `${ctx.cardMap.get(acceTATE)?.CardName ?? acceTATE}・医い繧ｯ繧ｻ・俄・繝医Λ繝・す繝･`));
  }
  // MULTI_ACCE_LIMIT: 繧｢繧ｯ繧ｻ繧堤音螳壽椢謨ｰ縺ｫ蛻ｶ髯撰ｼ医Ο繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'MULTI_ACCE_LIMIT') {
    const acceCountMAL = (ctx.ownerState.field.signi_acce ?? []).filter(cn => cn !== null).length;
    return done(addLog(ctx, `繝槭Ν繝√い繧ｯ繧ｻ蛻ｶ髯撰ｼ育樟蝨ｨ${acceCountMAL}蛟具ｼ荏));
  }
  // CHOOSE_HAND_CARD: 謇区惆縺九ｉ1譫夐∈謚橸ｼ・astProcessedCards縺ｫ險ｭ螳夲ｼ・  if (stub.id === 'CHOOSE_HAND_CARD') {
    const handCHC = ctx.ownerState.hand;
    if (handCHC.length === 0) return done(addLog(ctx, '謇区惆縺ｪ縺・));
    const noopCHC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: handCHC, count: 1, optional: true,
      targetScope: 'self_hand', thenAction: noopCHC as EffectAction,
    });
  }
  // CHOOSE_HAND_OR_ENERGY: 繝・ャ繧ｭ荳劾譫壹°繧我ｻｻ諢乗椢謨ｰ繧呈焔譛ｭ縺ｫ蜉縺医∵ｮ九ｊ繧偵お繝翫∈・・OOK_AND_REORDER蠕鯉ｼ・  if (stub.id === 'CHOOSE_HAND_OR_ENERGY') {
    const srcCHOE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCHOE = srcCHOE ? (srcCHOE.EffectText ?? '') + ' ' + (srcCHOE.BurstText ?? '') : '';
    const toHWCHOE = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const countMCHOE = txtCHOE.match(/([・・・兔d]+)譫夊ｦ九ｋ/);
    const revealCountCHOE = countMCHOE ? parseInt(toHWCHOE(countMCHOE[1])) : 3;
    const topCardsCHOE = ctx.ownerState.deck.slice(0, revealCountCHOE);
    if (topCardsCHOE.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺暦ｼ・HOOSE_HAND_OR_ENERGY・・));
    const addToHandCHOE: import('../types/effects').AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    return needsInteraction(addLog(ctx, `繝・ャ繧ｭ荳・{topCardsCHOE.length}譫壹°繧画焔譛ｭ縺ｫ蜉縺医ｋ繧ｫ繝ｼ繝峨ｒ驕ｸ謚橸ｼ域ｮ九ｊ縺ｯ繧ｨ繝翫∈・荏), {
      type: 'SEARCH', visibleCards: topCardsCHOE, maxPick: topCardsCHOE.length,
      thenAction: addToHandCHOE as EffectAction, restDest: 'energy',
    });
  }
  // INTERNAL_OPP_DECK_TRASH_N: 逶ｸ謇九ョ繝・く縺ｮ荳翫°繧丑譫壹ｒ繝医Λ繝・す繝･
  if (stub.id === 'INTERNAL_OPP_DECK_TRASH_N') {
    const cntIODTN = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '4'));
    const trashedIODTN = ctx.otherState.deck.slice(0, cntIODTN);
    const newOtherIODTN: PlayerState = {
      ...ctx.otherState,
      deck: ctx.otherState.deck.slice(cntIODTN),
      trash: [...ctx.otherState.trash, ...trashedIODTN],
    };
    return done(addLog({ ...ctx, otherState: newOtherIODTN }, `逶ｸ謇九ョ繝・く荳翫°繧・{trashedIODTN.length}譫壹ヨ繝ｩ繝・す繝･`));
  }
  // INTERNAL_ODC_COLOR_CHECK: 濶ｲ螳｣險蠕後〕astProcessedCards[0]縺ｮ濶ｲ繧堤｢ｺ隱阪＠縺ｦ繝壹リ繝ｫ繝・ぅ驕ｩ逕ｨ
  if (stub.id === 'INTERNAL_ODC_COLOR_CHECK') {
    const declaredColor = typeof stub.value === 'string' ? stub.value : '';
    const targetInstIOCC = ctx.lastProcessedCards?.[0];
    const targetCardIOCC = targetInstIOCC ? ctx.cardMap.get(getCardNum(targetInstIOCC)) : undefined;
    const cardColorIOCC = targetCardIOCC?.Color ?? '';
    const revealName = targetCardIOCC?.CardName ?? targetInstIOCC ?? '?';
    // 螳｣險濶ｲ縺ｨ荳閾ｴ縺励↑縺・°遒ｺ隱搾ｼ医き繝ｼ繝峨・濶ｲ縺悟ｮ｣險繧貞性縺ｾ縺ｪ縺・竊・蟇ｾ謌ｦ逶ｸ謇九・蜈ｨ繧ｷ繧ｰ繝九ヰ繝九ャ繧ｷ繝･・・    const colorMatchIOCC = cardColorIOCC.includes(declaredColor);
    const logMsg = `蜈ｬ髢・ ${revealName}・郁牡: ${cardColorIOCC}・・ 螳｣險: ${declaredColor} 竊・${colorMatchIOCC ? '荳閾ｴ・医・繝翫Ν繝・ぅ縺ｪ縺暦ｼ・ : '荳堺ｸ閾ｴ竊堤嶌謇句・繧ｷ繧ｰ繝九ヰ繝九ャ繧ｷ繝･'}`;
    if (!colorMatchIOCC) {
      // 逶ｸ謇九・蜈ｨ繧ｷ繧ｰ繝九ｒ繝医Λ繝・す繝･縺ｸ
      let newOtherIOCC = ctx.otherState;
      const newSigniIOCC = [...newOtherIOCC.field.signi] as (string[] | null)[];
      const banishedIOCC: string[] = [];
      for (let zi = 0; zi < 3; zi++) {
        const top = newSigniIOCC[zi]?.at(-1);
        if (top) { banishedIOCC.push(top); newSigniIOCC[zi] = null; }
      }
      newOtherIOCC = { ...newOtherIOCC, field: { ...newOtherIOCC.field, signi: newSigniIOCC }, energy: [...newOtherIOCC.energy, ...banishedIOCC] };
      return done(addLog({ ...ctx, otherState: newOtherIOCC }, logMsg));
    }
    return done(addLog(ctx, logMsg));
  }
  // OPP_DECLARE_CHOICE / OPP_CHOOSE_EFFECT / OPP_CHOOSES_FOR_YOU: 逶ｸ謇九′竭竭｡縺九ｉ驕ｸ縺ｶ
  if (stub.id === 'OPP_DECLARE_CHOICE' || stub.id === 'OPP_CHOOSE_EFFECT' || stub.id === 'OPP_CHOOSES_FOR_YOU') {
    const srcODC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtODC = srcODC ? (srcODC.EffectText ?? '') + ' ' + (srcODC.BurstText ?? '') : '';
    const toHWODC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 濶ｲ螳｣險繝代ち繝ｼ繝ｳ・医え繝ｪ繧ｹ邉ｻ・・ 縲悟ｯｾ謌ｦ逶ｸ謇九・縲顔區縲九願ｵ､縲・..縺九ｉ・代▽繧貞ｮ｣險縺吶ｋ縲・    if (txtODC.match(/蟇ｾ謌ｦ逶ｸ謇九・.*縺九ｉ・代▽繧貞ｮ｣險縺吶ｋ/) && txtODC.match(/縲顔區[^縲犠*縲・*縲願ｵ､[^縲犠*縲・)) {
      const colorList = ['逋ｽ', '襍､', '髱・, '邱・, '鮟・, '辟｡'];
      const colorOpts = colorList.map(color => ({
        id: `odc_color_${color}`,
        label: `縲・{color}縲九ｒ螳｣險`,
        action: ({ type: 'STUB', id: 'INTERNAL_ODC_COLOR_CHECK', value: color } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, `蟇ｾ謌ｦ逶ｸ謇九′濶ｲ繧貞ｮ｣險・亥ｯｾ雎｡繧ｫ繝ｼ繝・ ${ctx.lastProcessedCards?.[0] ? ctx.cardMap.get(getCardNum(ctx.lastProcessedCards[0]))?.CardName ?? '?' : '譛ｪ驕ｸ謚・}・荏), {
        type: 'CHOOSE', options: colorOpts, count: 1, opponentResponds: true,
      });
    }
    // 竭竭｡繝代ち繝ｼ繝ｳ繧定ｧ｣譫・    const choicePatsODC = [{ m: /竭([^竭｡竭｢]+)/, idx: 0 }, { m: /竭｡([^竭｢竭｣]+)/, idx: 1 }];
    const optsODC: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of choicePatsODC) {
      const mat = txtODC.match(m);
      if (!mat) continue;
      const ctxt = mat[1].replace(/縲・s*$/, '').trim();
      let act: EffectAction | null = null;
      // 縲悟ｯｾ謌ｦ逶ｸ謇九・繝・ャ繧ｭ縺ｮ荳翫°繧丑譫壹ヨ繝ｩ繝・す繝･縲坂・ 逶ｸ謇具ｼ・therState・峨・繝・ャ繧ｭ繧偵ヨ繝ｩ繝・す繝･
      if (!act && ctxt.match(/蟇ｾ謌ｦ逶ｸ謇九・繝・ャ繧ｭ縺ｮ荳翫°繧峨き繝ｼ繝峨ｒ([・・・兔d]+)譫壹ヨ繝ｩ繝・す繝･/)) {
        const cnt = parseInt(toHWODC(ctxt.match(/([・・・兔d]+)譫・)![1]));
        act = ({ type: 'STUB', id: 'INTERNAL_OPP_DECK_TRASH_N', value: cnt } as StubAction) as EffectAction;
      }
      // 縲後ョ繝・く縺ｮ荳翫°繧丑譫壹ヨ繝ｩ繝・す繝･縲搾ｼ域園譛芽・ｸ肴・ = 荳｡閠・ｼ・      if (!act && ctxt.match(/繝・ャ繧ｭ縺ｮ荳翫°繧峨き繝ｼ繝峨ｒ([・・・兔d]+)譫壹ヨ繝ｩ繝・す繝･/)) {
        const cnt = parseInt(toHWODC(ctxt.match(/([・・・兔d]+)譫・)![1]));
        act = ({ type: 'STUB', id: 'INTERNAL_DECK_TRASH_BOTH', value: cnt } as StubAction) as EffectAction;
      }
      // 縲後き繝ｼ繝峨ｒN譫壼ｼ輔￥縲搾ｼ育嶌謇九′蠑輔￥ = opponentResponds譁・ц縺ｧ縺ｯ閾ｪ蛻・′蠑輔￥縺薙→縺悟､壹＞・・      if (!act && ctxt.match(/繧ｫ繝ｼ繝峨ｒ([・・・兔d]+)譫壼ｼ輔￥/)) {
        const cnt = parseInt(toHWODC(ctxt.match(/([・・・兔d]+)譫・)![1]));
        act = ({ type: 'DRAW', owner: stub.id === 'OPP_CHOOSE_EFFECT' ? 'opponent' : 'self', count: cnt } as DrawAction) as EffectAction;
      }
      // 縲梧焔譛ｭ縺九ｉ繧ｷ繧ｰ繝・譫壹ｒ蝣ｴ縺ｫ蜃ｺ縺吶搾ｼ亥ｯｾ謌ｦ逶ｸ謇九′蜃ｺ縺呻ｼ・      if (!act && ctxt.match(/謇区惆縺九ｉ.*繧ｷ繧ｰ繝・*蝣ｴ縺ｫ蜃ｺ縺・)) {
        act = ({ type: 'ADD_TO_FIELD', owner: 'opponent', source: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as AddToFieldAction) as EffectAction;
      }
      // 縲後ヨ繝ｩ繝・す繝･縺九ｉ繧ｷ繧ｰ繝・譫壹ｒ謇区惆縺ｫ蜉縺医ｋ縲・      if (!act && ctxt.match(/繝医Λ繝・す繝･縺九ｉ.*繧ｷ繧ｰ繝・*謇区惆縺ｫ蜉縺医ｋ/)) {
        act = ({ type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { cardType: '繧ｷ繧ｰ繝・ } } } as TransferToHandAction) as EffectAction;
      }
      // 譌ｧ繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ: 縲梧焔譛ｭ繧貞刈縺医ｋ縲咲ｳｻ
      if (!act && ctxt.match(/謇区惆.+繧・+蜉縺医ｋ/)) act = { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1 } } as TransferToHandAction;
      if (act) optsODC.push({ id: `odc_${idx}`, label: `${'竭竭｡'[idx]}${ctxt.slice(0, 20)}...`, action: act, available: true });
    }
    if (optsODC.length > 0) {
      return needsInteraction(addLog(ctx, `蟇ｾ謌ｦ逶ｸ謇九′驕ｸ謚橸ｼ・{optsODC.length}謚橸ｼ荏), {
        type: 'CHOOSE', options: optsODC, count: 1, opponentResponds: true,
      });
    }
    return done(addLog(ctx, `逶ｸ謇矩∈謚橸ｼ郁ｧ｣譫蝉ｸ榊庄: ${stub.id}・荏));
  }
  // DO_THREE_THINGS: 3縲・縺､縺ｮ蜃ｦ逅・ｒ蜍慕噪隗｣譫舌＠縺ｦ螳溯｡・  if (stub.id === 'DO_THREE_THINGS') {
    const srcDTT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDTT = srcDTT ? (srcDTT.EffectText ?? '') + ' ' + (srcDTT.BurstText ?? '') : '';
    let ctxDTT = ctx;
    const logsDTT: string[] = [];
    // 竭縲悟ｯｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝・菴薙ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺上・    if (txtDTT.match(/竭.*蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝擬・・]菴薙ｒ蟇ｾ雎｡縺ｨ縺・*繝医Λ繝・す繝･縺ｫ鄂ｮ縺・)) {
      const oppTopSigni = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).find(cn => !!cn);
      if (oppTopSigni) {
        const removedDTT = removeFromField(oppTopSigni, ctxDTT.otherState);
        ctxDTT = { ...ctxDTT, otherState: { ...removedDTT, trash: [...removedDTT.trash, oppTopSigni] } };
        logsDTT.push(`竭${ctx.cardMap.get(oppTopSigni)?.CardName ?? oppTopSigni}繧偵ヨ繝ｩ繝・す繝･縺ｸ`);
      }
    }
    // 竭｡縲悟ｯｾ謌ｦ逶ｸ謇九・繝ｩ繧､繝輔け繝ｭ繧ｹ1譫壹ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺上・    if (txtDTT.match(/竭｡.*繝ｩ繧､繝輔け繝ｭ繧ｹ[・・]譫壹ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・)) {
      const life = ctxDTT.otherState.life_cloth;
      if (life.length > 0) {
        const top = life[life.length - 1];
        ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
          life_cloth: life.slice(0,-1),
          trash: [...ctxDTT.otherState.trash, top],
        }};
        logsDTT.push(`竭｡繝ｩ繧､繝輔け繝ｭ繧ｹ(${ctx.cardMap.get(top)?.CardName ?? top})繧偵ヨ繝ｩ繝・す繝･縺ｸ`);
      }
    }
    // 竭｢縲悟ｯｾ謌ｦ逶ｸ謇九・繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ繧ｫ繝ｼ繝・譫壹ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺上・    if (txtDTT.match(/竭｢.*繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ繧ｫ繝ｼ繝閏・・]譫壹ｒ蟇ｾ雎｡縺ｨ縺・*繝医Λ繝・す繝･縺ｫ鄂ｮ縺・)) {
      const oppEna = ctxDTT.otherState.energy;
      if (oppEna.length > 0) {
        const picked = oppEna[0];
        ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
          energy: oppEna.slice(1),
          trash: [...ctxDTT.otherState.trash, picked],
        }};
        logsDTT.push(`竭｢繧ｨ繝・${ctx.cardMap.get(picked)?.CardName ?? picked})繧偵ヨ繝ｩ繝・す繝･縺ｸ`);
      }
    }
    // 竭｣縲悟ｯｾ謌ｦ逶ｸ謇九・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九・繧ｫ繝ｼ繝・譫壹ｒ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺上・    if (txtDTT.match(/竭｣.*繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ荳九↓縺ゅｋ繧ｫ繝ｼ繝閏・・]譫壹ｒ蟇ｾ雎｡縺ｨ縺・*繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・)) {
      const oppLrigStack = ctxDTT.otherState.field.lrig;
      if (oppLrigStack.length > 1) {
        const under = oppLrigStack[oppLrigStack.length - 2];
        const newLrigDTT = [...oppLrigStack.slice(0,-1).slice(0,-1), oppLrigStack[oppLrigStack.length - 1]];
        ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
          field: { ...ctxDTT.otherState.field, lrig: newLrigDTT },
          lrig_trash: [...ctxDTT.otherState.lrig_trash, under],
        }};
        logsDTT.push(`竭｣${ctx.cardMap.get(under)?.CardName ?? under}繧偵Ν繝ｪ繧ｰ繝医Λ繝・す繝･縺ｸ`);
      }
    }
    // 縲悟ｯｾ謌ｦ逶ｸ謇九・蜈ｨ繝ｫ繝ｪ繧ｰ縺ｨ繧ｷ繧ｰ繝九ｒ繝繧ｦ繝ｳ縺怜㍾邨舌☆繧九・    if (txtDTT.match(/竭.*(?:縺吶∋縺ｦ縺ｮ繝ｫ繝ｪ繧ｰ縺ｨ繧ｷ繧ｰ繝弓蜈ｨ.*繝ｫ繝ｪ繧ｰ.*繧ｷ繧ｰ繝・繧偵ム繧ｦ繝ｳ縺怜㍾邨舌☆繧・)) {
      ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
        field: { ...ctxDTT.otherState.field,
          signi_down: [true, true, true],
          signi_frozen: [true, true, true],
          lrig_down: true,
          lrig_frozen: true,
        },
      }};
      logsDTT.push('竭蜈ｨ繧ｷ繧ｰ繝九・繝ｫ繝ｪ繧ｰ繧偵ム繧ｦ繝ｳ+蜃咲ｵ・);
    }
    // 縲悟・逶ｸ謇九す繧ｰ繝九′閭ｽ蜉帙ｒ螟ｱ縺・ｼ域ｬ｡繧ｿ繝ｼ繝ｳ邨ゆｺ・∪縺ｧ・峨・    if (txtDTT.match(/竭｡.*縺吶∋縺ｦ縺ｮ繧ｷ繧ｰ繝九・閭ｽ蜉帙ｒ螟ｱ縺・)) {
      const oppAllSigniDTT = [0,1,2].map(zi => ctxDTT.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
      const abRemovedDTT = [...new Set([...(ctxDTT.otherState.abilities_removed ?? []), ...oppAllSigniDTT])];
      ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState, abilities_removed: abRemovedDTT } };
      logsDTT.push(`竭｡蜈ｨ${oppAllSigniDTT.length}菴薙・閭ｽ蜉帙ｒ豸亥悉`);
    }
    // 縲娯蔵繧ｫ繝ｼ繝峨ｒN譫壼ｼ輔￥縲・    if (!logsDTT.length) {
      const drawDTT = txtDTT.match(/竭.*繧ｫ繝ｼ繝峨ｒ([・・・兔d]+)譫壼ｼ輔￥/);
      if (drawDTT) {
        const toHWD = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const n = parseInt(toHWD(drawDTT[1]));
        const canDraw = Math.min(n, ctxDTT.ownerState.deck.length);
        const newOwnerDraw = { ...ctxDTT.ownerState,
          hand: [...ctxDTT.ownerState.hand, ...ctxDTT.ownerState.deck.slice(0, canDraw)],
          deck: ctxDTT.ownerState.deck.slice(canDraw),
        };
        ctxDTT = { ...ctxDTT, ownerState: newOwnerDraw };
        logsDTT.push(`竭${n}譫壹ラ繝ｭ繝ｼ`);
      }
    }
    // 縲娯蔵逶ｸ謇九そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ繧偵ム繧ｦ繝ｳ縺吶ｋ縲・    if (!logsDTT.length && txtDTT.match(/竭.*(?:繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ|蟇ｾ謌ｦ逶ｸ謇九・繝ｫ繝ｪ繧ｰ)[・・]菴薙ｒ蟇ｾ雎｡縺ｨ縺・*繝繧ｦ繝ｳ/)) {
      ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
        field: { ...ctxDTT.otherState.field, lrig_down: true },
      }};
      logsDTT.push('竭逶ｸ謇九Ν繝ｪ繧ｰ繧偵ム繧ｦ繝ｳ');
    }
    // 縲娯蔵蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝・菴薙↓繧｢繧ｿ繝・け遖∵ｭ｢縲坂・ SELECT_TARGET 縺悟ｿ・ｦ√↑縺溘ａ繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ
    if (!logsDTT.length && txtDTT.match(/竭.*蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝擬・・]菴薙ｒ蟇ｾ雎｡.*繧｢繧ｿ繝・け縺ｧ縺阪↑縺・)) {
      const oppSigniDTT = [0,1,2]
        .map(zi => ctxDTT.otherState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn);
      if (oppSigniDTT.length > 0) {
        const blockStub: StubAction = { type: 'STUB', id: 'INTERNAL_BLOCK_ATTACK_THIS_TURN' };
        return needsInteraction(addLog(ctxDTT, '繧ｿ繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ縲後い繧ｿ繝・け縺ｧ縺阪↑縺・阪す繧ｰ繝九ｒ驕ｸ謚・), {
          type: 'SELECT_TARGET', candidates: oppSigniDTT, count: 1, optional: false,
          targetScope: 'opp_field', thenAction: blockStub as EffectAction,
        });
      }
    }
    // 縲娯蔵繝代Ρ繝ｼN莉･荳九・逶ｸ謇九す繧ｰ繝九ｒ繝舌ル繝・す繝･縲・    if (!logsDTT.length) {
      const banishPwrM = txtDTT.match(/竭.*繝代Ρ繝ｼ([・・・兔d荳Ⅹ+)莉･荳・*繝舌ル繝・す繝･/);
      if (banishPwrM) {
        const toHWB = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace('荳・,'0000');
        const maxPwr = parseInt(toHWB(banishPwrM[1]));
        const bCands = [0,1,2]
          .map(zi => ctxDTT.otherState.field.signi[zi]?.at(-1))
          .filter((cn): cn is string => {
            if (!cn) return false;
            const pw = parseInt(ctx.cardMap.get(cn)?.Power ?? '99999');
            return pw <= maxPwr;
          });
        if (bCands.length > 0) {
          const banishAct: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } };
          return selectOrInteract(bCands, 1, false, 'opp_field', banishAct as EffectAction, undefined, ctxDTT);
        }
        return done(addLog(ctxDTT, `竭繝舌ル繝・す繝･蟇ｾ雎｡縺ｪ縺暦ｼ医ヱ繝ｯ繝ｼ${maxPwr}莉･荳九・逶ｸ謇九す繧ｰ繝倶ｸ榊惠・荏));
      }
    }
    if (logsDTT.length > 0) return done(addLog(ctxDTT, logsDTT.join(' / ')));
    return done(addLog(ctx, '3縺､縺ｮ蜃ｦ逅・ｼ亥句挨隗｣譫蝉ｸ榊庄・・));
  }
  // CONDITIONAL_MULTI_CHOOSE_BY_CENTER: 繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｫ繧医ｋ隍・焚驕ｸ謚・  if (stub.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER') {
    const srcCMCBC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCMCBC = srcCMCBC ? (srcCMCBC.EffectText ?? '') + ' ' + (srcCMCBC.BurstText ?? '') : '';
    const toHWCMCBC = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 繝吶・繧ｹ驕ｸ謚樊焚縲御ｻ･荳九・N 縺､縺九ｉ M 縺､(縺ｾ縺ｧ)驕ｸ縺ｶ縲・    const baseCountM = txtCMCBC.match(/莉･荳九・[・・・兔d・・・兢縺､縺九ｉ([・・・兔d・・])縺､(?:縺ｾ縺ｧ)?驕ｸ縺ｶ/);
    const baseCount = baseCountM ? parseInt(toHWCMCBC(baseCountM[1])) : 1;
    // 繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ譚｡莉ｶ繝√ぉ繝・け
    const centerCondM = txtCMCBC.match(/繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺・.+?)縺ｮ蝣ｴ蜷・);
    let condMetCMCBC = !centerCondM; // 譚｡莉ｶ縺ｪ縺励↑繧牙ｸｸ縺ｫtrue
    if (centerCondM) {
      const reqNames = centerCondM[1].trim().split(/縺弓縺ｨ/).map(s => s.trim()).filter(Boolean);
      const centerTop = ctx.ownerState.field.lrig.at(-1);
      const centerCard = centerTop ? ctx.cardMap.get(centerTop) : undefined;
      const centerName = centerCard?.CardName ?? '';
      const runtimeAliases = ctx.ownerState.lrig_name_aliases ?? [];
      const hasAllNames = runtimeAliases.includes(LRIG_ALL_NAMES_SENTINEL);
      const aliases = [centerName, ...runtimeAliases.filter(a => a !== LRIG_ALL_NAMES_SENTINEL)];
      condMetCMCBC = hasAllNames || reqNames.some(rn => aliases.some(a => a.includes(rn) || rn.includes(a)));
    }
    // 驕ｸ謚樊焚: 譚｡莉ｶ驕疲・縺ｪ繧・莉｣繧上ｊ縺ｫN縺､縺ｾ縺ｧ"縲∵悴驕疲・縺ｯ繝吶・繧ｹ謨ｰ
    const enhCountM = txtCMCBC.match(/莉｣繧上ｊ縺ｫ([・・・兔d])縺､縺ｾ縺ｧ驕ｸ縺ｶ/);
    const maxChooseCount = condMetCMCBC && enhCountM ? parseInt(toHWCMCBC(enhCountM[1])) : baseCount;
    // 蜷・∈謚櫁い・遺蔵竭｡竭｢竭｣・峨ｒ隗｣譫舌＠縺ｦCHOOSE繧ｪ繝励す繝ｧ繝ｳ逕滓・
    const choicePatterns = [
      { m: /竭([^竭｡竭｢竭｣]+)/, idx: 0 }, { m: /竭｡([^竭｢竭｣竭､]+)/, idx: 1 },
      { m: /竭｢([^竭｣竭､]+)/, idx: 2 }, { m: /竭｣([^竭､]+)/, idx: 3 },
    ];
    const optionsCMCBC: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of choicePatterns) {
      const mat = txtCMCBC.match(m);
      if (!mat) continue;
      const choiceTxt = mat[1].replace(/縲・s*$/,'').trim();
      let choiceAction: EffectAction | null = null;
      // 縲後き繝ｼ繝峨ｒ1譫壼ｼ輔￥縲坂・ DRAW
      if (choiceTxt.match(/繧ｫ繝ｼ繝峨ｒ[・・]譫壼ｼ輔￥/)) {
        choiceAction = { type: 'DRAW', count: 1 } as DrawAction;
      }
      // 縲悟推繝励Ξ繧､繝､繝ｼ縺ｯ繝・ャ繧ｭ縺ｮ荳翫°繧丑譫壹ヨ繝ｩ繝・す繝･縺ｫ鄂ｮ縺上・      const deckTrashM = choiceTxt.match(/繝・ャ繧ｭ縺ｮ荳翫°繧峨き繝ｼ繝峨ｒ([・・・兔d]+)譫壹ヨ繝ｩ繝・す繝･縺ｫ鄂ｮ縺・);
      if (!choiceAction && deckTrashM) {
        const cnt = parseInt(toHWCMCBC(deckTrashM[1]));
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_DECK_TRASH_BOTH', value: cnt } as StubAction) as EffectAction;
      }
      // 縲悟ｯｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝九ｒ蟇ｾ雎｡縺ｨ縺励√◎繧後ｒ繝繧ｦ繝ｳ縺吶ｋ縲坂・ DOWN STUB縺ｨ縺励※蠕後〒蜃ｦ逅・      if (!choiceAction && choiceTxt.match(/蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝擬・・]菴薙ｒ蟇ｾ雎｡縺ｨ縺・*繝繧ｦ繝ｳ/)) {
        const downActCMCBC: DownAction = {
          type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 },
        };
        choiceAction = downActCMCBC as EffectAction;
      }
      // 縲悟ｯｾ謌ｦ逶ｸ謇九・謇区惆繧・譫夊ｦ九↑縺・〒驕ｸ縺ｳ縲∵昏縺ｦ縺輔○繧九・      if (!choiceAction && choiceTxt.match(/謇区惆繧端・・]譫夊ｦ九↑縺・〒驕ｸ縺ｳ.*謐ｨ縺ｦ/)) {
        const blindTrashCMCBC: TrashAction = {
          type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 },
        };
        choiceAction = blindTrashCMCBC as EffectAction;
      }
      // 縲悟ｯｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝・菴薙・繝代Ρ繝ｼ繧・N縲・      const pwDownM = !choiceAction && choiceTxt.match(/繝代Ρ繝ｼ繧・[・・][・・・兔d]+)縺吶ｋ/);
      if (pwDownM) {
        const delta = parseInt(toHWCMCBC(pwDownM[1]).replace('・・,'-'));
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_OPP_ONE', value: delta } as StubAction) as EffectAction;
      }
      // 縲後ヨ繝ｩ繝・す繝･縺九ｉ繧ｷ繧ｰ繝九ｒ蝣ｴ縺ｫ蜃ｺ縺吶・      if (!choiceAction && choiceTxt.match(/繝医Λ繝・す繝･縺九ｉ.*繧ｷ繧ｰ繝擬・・]譫・*蝣ｴ縺ｫ蜃ｺ縺・)) {
        choiceAction = ({ type: 'STUB', id: 'SUMMON_FROM_TRASH' } as StubAction) as EffectAction;
      }
      // 縲後い繧ｿ繝・け縺ｧ縺阪↑縺・坂・ blocked_actions霑ｽ蜉
      if (!choiceAction && choiceTxt.match(/繧｢繧ｿ繝・け縺ｧ縺阪↑縺・)) {
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_BLOCK_ATTACK_THIS_TURN' } as StubAction) as EffectAction;
      }
      // 縲悟ｯｾ謌ｦ逶ｸ謇九・繝代Ρ繝ｼN莉･荳九・繧ｷ繧ｰ繝九ｒ繝舌ル繝・す繝･縲・      if (!choiceAction) {
        const banishPwrMCMCBC = choiceTxt.match(/繝代Ρ繝ｼ([・・・兔d荳Ⅹ+)莉･荳・*繝舌ル繝・す繝･/);
        if (banishPwrMCMCBC) {
          const maxPwrCMCBC = parseInt(toHWCMCBC(banishPwrMCMCBC[1]).replace('荳・,'0000'));
          choiceAction = ({ type: 'STUB', id: 'INTERNAL_BANISH_OPP_POWER_LTE', value: maxPwrCMCBC } as StubAction) as EffectAction;
        }
      }
      // 縲後お繝翫だ繝ｼ繝ｳ縺九ｉ繧ｷ繧ｰ繝九ｒ蝣ｴ縺ｫ蜃ｺ縺吶・      if (!choiceAction && choiceTxt.match(/繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ.*繧ｷ繧ｰ繝・*蝣ｴ縺ｫ蜃ｺ縺・)) {
        choiceAction = ({ type: 'STUB', id: 'SUMMON_FROM_ENERGY' } as StubAction) as EffectAction;
      }
      // 縲梧焔譛ｭ繧偵☆縺ｹ縺ｦ謐ｨ縺ｦ縲¨譫壼ｼ輔￥縲・      if (!choiceAction && choiceTxt.match(/謇区惆繧偵☆縺ｹ縺ｦ謐ｨ縺ｦ.*([・・・兔d]譫嘶蠑輔￥)/)) {
        const drawAllM = choiceTxt.match(/([・・・・-9\d])譫壼ｼ輔￥/);
        const drawAllN = drawAllM ? parseInt(toHWCMCBC(drawAllM[1])) : 4;
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_DISCARD_ALL_DRAW_N', value: drawAllN } as StubAction) as EffectAction;
      }
      // 縲後ョ繝・く荳九・繧ｫ繝ｼ繝峨ｒ繝医Λ繝・す繝･竊偵す繧ｰ繝九↑繧牙ｴ縺ｫ蜃ｺ縺吶・      if (!choiceAction && choiceTxt.match(/繝・ャ繧ｭ縺ｮ荳逡ｪ荳・*繝医Λ繝・す繝･.*繧ｷ繧ｰ繝・*蝣ｴ縺ｫ蜃ｺ縺・)) {
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_DECK_BOTTOM_SUMMON' } as StubAction) as EffectAction;
      }
      // 縲後ョ繝・く荳九・繧ｫ繝ｼ繝峨ｒ繝医Λ繝・す繝･竊貞酔縺倥Ξ繝吶Ν縺ｮ逶ｸ謇九す繧ｰ繝九ｒ繝繧ｦ繝ｳ縲・      if (!choiceAction && choiceTxt.match(/繝・ャ繧ｭ縺ｮ荳逡ｪ荳・*繝医Λ繝・す繝･.*蜷後§繝ｬ繝吶Ν.*繝繧ｦ繝ｳ/)) {
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_DECK_BOTTOM_LEVEL_DOWN' } as StubAction) as EffectAction;
      }
      // 縲後す繧ｰ繝九ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ鄂ｮ縺上坂・ 繝舌ル繝・す繝･・医お繝翫だ繝ｼ繝ｳ縺ｸ遘ｻ蜍包ｼ・      if (!choiceAction && choiceTxt.match(/蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝擬・・]菴・*繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ鄂ｮ縺・)) {
        choiceAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BanishAction as EffectAction;
      }
      // 縲悟㍾邨舌☆繧九坂・ FREEZE・亥腰迢ｬ縺ｾ縺溘・繝繧ｦ繝ｳ縺ｨ邨・∩蜷医ｏ縺幢ｼ・      if (!choiceAction && choiceTxt.match(/蜃咲ｵ舌☆繧・)) {
        if (choiceTxt.match(/繝繧ｦ繝ｳ縺・*蜃咲ｵ・)) {
          // DOWN + FREEZE ALL
          choiceAction = ({ type: 'STUB', id: 'INTERNAL_DOWN_AND_FREEZE_OPP' } as StubAction) as EffectAction;
        } else {
          choiceAction = { type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as import('../types/effects').FreezeAction as EffectAction;
        }
      }
      // 縲後せ繝壹Ν縺ｮ蜉ｹ譫懊ｒ謇薙■豸医☆縲坂・ 繝ｭ繧ｰ縺ｮ縺ｿ・郁ｧ｣豎ｺ繧､繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ譛ｪ螳溯｣・ｼ・      if (!choiceAction && choiceTxt.match(/繧ｹ繝壹Ν.*蜉ｹ譫懊ｒ謇薙■豸医☆|繧ｹ繝壹Ν.*謇薙■豸医☆/)) {
        choiceAction = ({ type: 'STUB', id: 'NEGATE_SPELL_EFFECT' } as StubAction) as EffectAction;
      }
      // 縲後ヨ繝ｩ繝・す繝･縺九ｉ繧ｷ繧ｰ繝・譫壹ｒ謇区惆縺ｫ蜉縺医ｋ縲坂・ ADD_TO_HAND from trash
      if (!choiceAction && choiceTxt.match(/繝医Λ繝・す繝･縺九ｉ.*繧ｷ繧ｰ繝擬・・]譫・*謇区惆縺ｫ蜉縺医ｋ/)) {
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_TRASH_SIGNI_TO_HAND' } as StubAction) as EffectAction;
      }
      // 縲後ヰ繝九ャ繧ｷ繝･縺吶ｋ縲搾ｼ医ヱ繝ｯ繝ｼ蛻ｶ髯舌↑縺励√∪縺溘・莉･荳奇ｼ・      if (!choiceAction && choiceTxt.match(/繧ｷ繧ｰ繝擬・・]菴・*繝舌ル繝・す繝･縺吶ｋ/)) {
        const gte = choiceTxt.match(/繝代Ρ繝ｼ([・・・兔d荳Ⅹ+)莉･荳・*繝舌ル繝・す繝･/);
        if (gte) {
          // 繝代Ρ繝ｼ莉･荳翫ヰ繝九ャ繧ｷ繝･縺ｯ驕ｸ謚槭う繝ｳ繧ｿ繝ｩ繧ｯ繧ｷ繝ｧ繝ｳ・育ｰ｡譏灘ｮ溯｣・ｼ壼ｯｾ雎｡驕ｸ謚槭↑縺暦ｼ・          const minPwr = parseInt(toHWCMCBC(gte[1]).replace('荳・, '0000'));
          choiceAction = ({ type: 'STUB', id: 'INTERNAL_BANISH_OPP_POWER_GTE', value: minPwr } as StubAction) as EffectAction;
        } else if (!choiceTxt.match(/繝代Ρ繝ｼ/)) {
          choiceAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BanishAction as EffectAction;
        }
      }
      // 縲後ム繝悶Ν繧ｯ繝ｩ繝・す繝･/繝ｩ繝ｳ繧ｵ繝ｼ遲峨・繧ｭ繝ｼ繝ｯ繝ｼ繝峨ｒ蠕励ｋ縲・      if (!choiceAction && choiceTxt.match(/縲舌ム繝悶Ν繧ｯ繝ｩ繝・す繝･縲代ｒ蠕励ｋ|縲舌Λ繝ｳ繧ｵ繝ｼ縲代ｒ蠕励ｋ|縲舌い繧ｵ繧ｷ繝ｳ縲代ｒ蠕励ｋ/)) {
        const kw = choiceTxt.includes('繝繝悶Ν繧ｯ繝ｩ繝・す繝･') ? 'double_crush'
          : choiceTxt.includes('繝ｩ繝ｳ繧ｵ繝ｼ') ? 'lancer' : 'assassin';
        choiceAction = ({ type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: kw, duration: 'UNTIL_END_OF_TURN' } as import('../types/effects').GrantKeywordAction) as EffectAction;
      }
      // 縲後す繧ｰ繝九ｒ謇区惆縺ｫ謌ｻ縺吶坂・ BOUNCE
      if (!choiceAction && choiceTxt.match(/繧ｷ繧ｰ繝擬・・]菴・*謇区惆縺ｫ謌ｻ縺・)) {
        choiceAction = { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BounceAction as EffectAction;
      }
      if (choiceAction) {
        optionsCMCBC.push({
          id: `choice_${idx}`,
          label: `${['竭','竭｡','竭｢','竭｣'][idx]}${choiceTxt.slice(0, 20)}...`,
          action: choiceAction,
          available: true,
        });
      }
    }
    if (optionsCMCBC.length > 0) {
      const condLogCMCBC = centerCondM
        ? `・・{condMetCMCBC ? '譚｡莉ｶ驕疲・' : '繝吶・繧ｹ驕ｸ謚・}・壽怙螟ｧ${maxChooseCount}謚橸ｼ荏
        : `・域怙螟ｧ${maxChooseCount}謚橸ｼ荏;
      return needsInteraction(addLog(ctx, `蜉ｹ譫懊ｒ譛螟ｧ${maxChooseCount}縺､驕ｸ謚槭＠縺ｦ縺上□縺輔＞${condLogCMCBC}`), {
        type: 'CHOOSE', options: optionsCMCBC, count: maxChooseCount,
      });
    }
    const centerCMCBC2 = ctx.ownerState.field.lrig.at(-1);
    const centerCardCMCBC2 = centerCMCBC2 ? ctx.cardMap.get(centerCMCBC2) : undefined;
    return done(addLog(ctx, `繧ｻ繝ｳ繧ｿ繝ｼ・・{centerCardCMCBC2?.CardName ?? '縺ｪ縺・}・峨↓繧医ｋ隍・焚驕ｸ謚橸ｼ郁ｧ｣譫蝉ｸ榊庄・荏));
  }
  // INTERNAL_DOWN_AND_FREEZE_OPP: 逶ｸ謇九す繧ｰ繝・菴薙ｒ繝繧ｦ繝ｳ+蜈ｨ繧ｷ繧ｰ繝九ｒ蜃咲ｵ・  if (stub.id === 'INTERNAL_DOWN_AND_FREEZE_OPP') {
    const downCandsDFO = ctx.otherState.field.signi.flatMap((s, zi) => s?.at(-1) ? [{ cn: s.at(-1)!, zi }] : []);
    if (downCandsDFO.length === 0) return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九↑縺・));
    // 1菴薙ム繧ｦ繝ｳ・域怙蛻昴・1菴薙√う繝ｳ繧ｿ繝ｩ繧ｯ繝・ぅ繝夜∈謚槭・逵∫払・・    const targetDFO = downCandsDFO[0];
    const newDownDFO = [...(ctx.otherState.field.signi_down ?? [false, false, false])];
    newDownDFO[targetDFO.zi] = true;
    // 蜈ｨ繧ｷ繧ｰ繝句㍾邨・    const newFrozenDFO = [true, true, true];
    const newOtherDFO = { ...ctx.otherState, field: { ...ctx.otherState.field, signi_down: newDownDFO, signi_frozen: newFrozenDFO } };
    return done(addLog({ ...ctx, otherState: newOtherDFO },
      `${ctx.cardMap.get(targetDFO.cn)?.CardName ?? targetDFO.cn}繧偵ム繧ｦ繝ｳ + 蜈ｨ繧ｷ繧ｰ繝句㍾邨秦));
  }
  // INTERNAL_BANISH_OPP_POWER_GTE: 逶ｸ謇九・繝代Ρ繝ｼN莉･荳翫・繧ｷ繧ｰ繝・菴薙ｒ繝舌ル繝・す繝･
  if (stub.id === 'INTERNAL_BANISH_OPP_POWER_GTE') {
    const minPwr = typeof stub.value === 'number' ? stub.value : 0;
    const candsBOPG = ctx.otherState.field.signi.flatMap((s, zi) => {
      const top = s?.at(-1);
      if (!top) return [];
      const ep = ctx.effectivePowers;
      const pwr = (ep instanceof Map ? ep.get(top) : (ep as Record<string, number> | undefined)?.[top]) ?? parseInt(ctx.cardMap.get(top)?.Power ?? '0');
      return pwr >= minPwr ? [{ cn: top, zi }] : [];
    });
    if (candsBOPG.length === 0) return done(addLog(ctx, `繝代Ρ繝ｼ${minPwr}莉･荳翫・逶ｸ謇九す繧ｰ繝九↑縺輿));
    const banishAct: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { powerRange: { min: minPwr } } } };
    return exec(banishAct as EffectAction, ctx);
  }
  // INTERNAL_TRASH_SIGNI_TO_HAND: 繝医Λ繝・す繝･縺九ｉ繧ｷ繧ｰ繝・譫壹ｒ謇区惆縺ｸ・・ONDITIONAL_MULTI_CHOOSE邉ｻ・・  if (stub.id === 'INTERNAL_TRASH_SIGNI_TO_HAND') {
    const signiTrashTSTH = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・);
    if (signiTrashTSTH.length === 0) return done(addLog(ctx, '繝医Λ繝・す繝･縺ｫ繧ｷ繧ｰ繝九↑縺・));
    const addHandTSTH: AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    return needsInteraction(addLog(ctx, '繝医Λ繝・す繝･縺九ｉ繧ｷ繧ｰ繝九ｒ謇区惆縺ｫ蜉縺医ｋ'), {
      type: 'SEARCH', visibleCards: signiTrashTSTH, maxPick: 1, thenAction: addHandTSTH as EffectAction,
    });
  }
  // INTERNAL_DECK_TRASH_BOTH: 荳｡繝励Ξ繧､繝､繝ｼ縺ｮ繝・ャ繧ｭ荳劾譫壹ｒ繝医Λ繝・す繝･
  if (stub.id === 'INTERNAL_DECK_TRASH_BOTH') {
    const cntIDTB = typeof stub.value === 'number' ? stub.value : 7;
    const selfDeckIDTB = ctx.ownerState.deck;
    const oppDeckIDTB = ctx.otherState.deck;
    const selfTrashIDTB = selfDeckIDTB.slice(0, Math.min(cntIDTB, selfDeckIDTB.length));
    const oppTrashIDTB = oppDeckIDTB.slice(0, Math.min(cntIDTB, oppDeckIDTB.length));
    const newOwnerIDTB: PlayerState = { ...ctx.ownerState, deck: selfDeckIDTB.slice(selfTrashIDTB.length), trash: [...ctx.ownerState.trash, ...selfTrashIDTB] };
    const newOtherIDTB: PlayerState = { ...ctx.otherState, deck: oppDeckIDTB.slice(oppTrashIDTB.length), trash: [...ctx.otherState.trash, ...oppTrashIDTB] };
    return done(addLog({ ...ctx, ownerState: newOwnerIDTB, otherState: newOtherIDTB },
      `蜷・・繝ｬ繧､繝､繝ｼ繝・ャ繧ｭ荳・{cntIDTB}譫壹ヨ繝ｩ繝・す繝･`));
  }
  // INTERNAL_POWER_MOD_OPP_ONE: 逶ｸ謇九・1菴薙↓繝代Ρ繝ｼ菫ｮ豁｣
  if (stub.id === 'INTERNAL_POWER_MOD_OPP_ONE') {
    const deltaIPMOO = typeof stub.value === 'number' ? stub.value : -12000;
    const targetIPMOO = ctx.lastProcessedCards?.[0]
      ?? [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).find(c => !!c);
    if (!targetIPMOO) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺・));
    const modsIPMOO = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: targetIPMOO, delta: deltaIPMOO }];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIPMOO } },
      `${ctx.cardMap.get(targetIPMOO)?.CardName ?? targetIPMOO}繝代Ρ繝ｼ${deltaIPMOO}`));
  }
  // INTERNAL_BANISH_OPP_POWER_LTE: 繝代Ρ繝ｼN莉･荳九・逶ｸ謇九す繧ｰ繝九ｒ繝舌ル繝・す繝･・亥ｯｾ雎｡驕ｸ謚橸ｼ・  if (stub.id === 'INTERNAL_BANISH_OPP_POWER_LTE') {
    const maxPwrIBOPL = typeof stub.value === 'number' ? stub.value : 7000;
    const candsIBOPL = [0,1,2]
      .map(zi => ctx.otherState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => {
        if (!cn) return false;
        const pw = parseInt(ctx.cardMap.get(cn)?.Power ?? '99999');
        return pw <= maxPwrIBOPL;
      });
    if (candsIBOPL.length === 0) return done(addLog(ctx, `繝舌ル繝・す繝･蟇ｾ雎｡縺ｪ縺暦ｼ医ヱ繝ｯ繝ｼ${maxPwrIBOPL}莉･荳具ｼ荏));
    const banishIBOPL: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } };
    return selectOrInteract(candsIBOPL, 1, false, 'opp_field', banishIBOPL as EffectAction, undefined, ctx);
  }
  // SUMMON_FROM_ENERGY: 繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ繧ｷ繧ｰ繝九ｒ蝣ｴ縺ｫ蜃ｺ縺呻ｼ医す繧ｰ繝矩剞螳夲ｼ・  if (stub.id === 'SUMMON_FROM_ENERGY') {
    const srcSFE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSFE = srcSFE ? (srcSFE.EffectText ?? '') : '';
    const lvMSFE = txtSFE.match(/繝ｬ繝吶Ν([・・・兔d]+)莉･荳九・/);
    const toHWSFE = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxLvSFE = lvMSFE ? parseInt(toHWSFE(lvMSFE[1])) : 99;
    const signiInEnaSFE = ctx.ownerState.energy.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (!c || c.Type !== '繧ｷ繧ｰ繝・) return false;
      return parseInt(c.Level ?? '0') <= maxLvSFE;
    });
    if (signiInEnaSFE.length === 0) return done(addLog(ctx, '繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ繧ｷ繧ｰ繝九↑縺・));
    const addFieldAct: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
    return selectOrInteract(signiInEnaSFE, 1, false, 'self_energy', addFieldAct as EffectAction, undefined, ctx);
  }
  // INTERNAL_DISCARD_ALL_DRAW_N: 謇区惆繧偵☆縺ｹ縺ｦ謐ｨ縺ｦN譫壼ｼ輔￥
  if (stub.id === 'INTERNAL_DISCARD_ALL_DRAW_N') {
    const drawNIDADN = typeof stub.value === 'number' ? stub.value : 4;
    const newOwnerIDADN = { ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, ...ctx.ownerState.hand],
      hand: [],
    };
    const canDraw = Math.min(drawNIDADN, newOwnerIDADN.deck.length);
    const finalOwner = { ...newOwnerIDADN,
      hand: newOwnerIDADN.deck.slice(0, canDraw),
      deck: newOwnerIDADN.deck.slice(canDraw),
    };
    return done(addLog({ ...ctx, ownerState: finalOwner }, `謇区惆縺吶∋縺ｦ謐ｨ縺ｦ竊・{drawNIDADN}譫壹ラ繝ｭ繝ｼ`));
  }
  // INTERNAL_DECK_BOTTOM_SUMMON: 繝・ャ繧ｭ荳・譫壹ヨ繝ｩ繝・す繝･竊偵す繧ｰ繝九↑繧牙ｴ縺ｫ蜃ｺ縺・  if (stub.id === 'INTERNAL_DECK_BOTTOM_SUMMON') {
    const deck = ctx.ownerState.deck;
    if (deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const bottom = deck[deck.length - 1];
    const newDeck = deck.slice(0, -1);
    const card = ctx.cardMap.get(bottom);
    const newOwner = { ...ctx.ownerState, deck: newDeck, trash: [...ctx.ownerState.trash, bottom] };
    const ctxIDBSM = addLog({ ...ctx, ownerState: newOwner }, `繝・ャ繧ｭ荳・${card?.CardName ?? bottom})繧偵ヨ繝ｩ繝・す繝･縺ｸ`);
    if (card?.Type === '繧ｷ繧ｰ繝・) {
      const addField: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
      return exec(addField as EffectAction, { ...ctxIDBSM, lastProcessedCards: [bottom] });
    }
    return done(ctxIDBSM);
  }
  // INTERNAL_DECK_BOTTOM_LEVEL_DOWN: 繝・ャ繧ｭ荳・譫壹ヨ繝ｩ繝・す繝･竊偵す繧ｰ繝九↑繧牙酔繝ｬ繝吶Ν逶ｸ謇九す繧ｰ繝九ｒ繝繧ｦ繝ｳ
  if (stub.id === 'INTERNAL_DECK_BOTTOM_LEVEL_DOWN') {
    const deckIDBLD = ctx.ownerState.deck;
    if (deckIDBLD.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const bottomIDBLD = deckIDBLD[deckIDBLD.length - 1];
    const bottomCard = ctx.cardMap.get(bottomIDBLD);
    const newDeckIDBLD = deckIDBLD.slice(0, -1);
    const newOwnerIDBLD = { ...ctx.ownerState, deck: newDeckIDBLD, trash: [...ctx.ownerState.trash, bottomIDBLD] };
    let ctxIDBLD = addLog({ ...ctx, ownerState: newOwnerIDBLD }, `繝・ャ繧ｭ荳・${bottomCard?.CardName ?? bottomIDBLD})繧偵ヨ繝ｩ繝・す繝･縺ｸ`);
    if (bottomCard?.Type === '繧ｷ繧ｰ繝・) {
      const lv = parseInt(bottomCard.Level ?? '0');
      const targets = [0,1,2].map(zi => ctxIDBLD.otherState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => {
          if (!cn) return false;
          return parseInt(ctx.cardMap.get(cn)?.Level ?? '-1') === lv;
        });
      const newDown = [...(ctxIDBLD.otherState.field.signi_down ?? [false,false,false])];
      for (let zi = 0; zi < 3; zi++) {
        if (targets.includes(ctxIDBLD.otherState.field.signi[zi]?.at(-1) ?? '')) newDown[zi] = true;
      }
      ctxIDBLD = addLog({ ...ctxIDBLD, otherState: { ...ctxIDBLD.otherState, field: { ...ctxIDBLD.otherState.field, signi_down: newDown } } },
        `蜷後Ξ繝吶Ν(${lv})縺ｮ逶ｸ謇九す繧ｰ繝・{targets.length}菴薙ｒ繝繧ｦ繝ｳ`);
    }
    return done(ctxIDBLD);
  }
  // INTERNAL_BLOCK_ATTACK_THIS_TURN: 蟇ｾ雎｡縺後い繧ｿ繝・け縺ｧ縺阪↑縺・  if (stub.id === 'INTERNAL_BLOCK_ATTACK_THIS_TURN') {
    const targetIBAC = ctx.lastProcessedCards?.[0];
    if (!targetIBAC) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺・));
    const blockedIBAC = [...(ctx.otherState.blocked_actions ?? []), `ATTACK:${targetIBAC}`];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: blockedIBAC } },
      `${ctx.cardMap.get(targetIBAC)?.CardName ?? targetIBAC}縺ｯ繧｢繧ｿ繝・け縺ｧ縺阪↑縺Я));
  }
  // DOWN_UP_SIGNI_AND_CHOOSE: 繧ｷ繧ｰ繝九ｒ繝繧ｦ繝ｳ/繧｢繝・・縺励※驕ｸ謚・  // DOWN_UP_SIGNI_AND_CHOOSE: 繧｢繝・・迥ｶ諷九・迚ｹ螳壹け繝ｩ繧ｹ繧ｷ繧ｰ繝九ｒ螂ｽ縺阪↑謨ｰ繝繧ｦ繝ｳ・医さ繧ｹ繝郁ｻｽ貂帷ｴ譚撰ｼ・  if (stub.id === 'DOWN_UP_SIGNI_AND_CHOOSE') {
    const srcDUSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDUSC = srcDUSC ? (srcDUSC.EffectText ?? '') + ' ' + (srcDUSC.BurstText ?? '') : '';
    // 蟇ｾ雎｡繧ｯ繝ｩ繧ｹ繧呈歓蜃ｺ・医後い繝・・迥ｶ諷九・・懊け繝ｩ繧ｹ・槭・繧ｷ繧ｰ繝九搾ｼ・    const classM = txtDUSC.match(/繧｢繝・・迥ｶ諷九・・・[^・枉+)・槭・繧ｷ繧ｰ繝・);
    const targetClass = classM ? classM[1] : null;
    // UP迥ｶ諷九・蟇ｾ雎｡繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九ｒ蜿朱寔
    const upSigniDUSC = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      const isDown = ctx.ownerState.field.signi_down?.[zi] ?? false;
      if (!top || isDown) return [];
      const card = ctx.cardMap.get(top);
      if (targetClass && !card?.CardClass?.includes(targetClass)) return [];
      return [{ cn: top, zi }];
    });
    if (upSigniDUSC.length === 0) {
      return done(addLog(ctx, `繧｢繝・・迥ｶ諷九・${targetClass ?? '繧ｷ繧ｰ繝・}縺ｪ縺暦ｼ・OWN_UP_SIGNI_AND_CHOOSE・荏));
    }
    // 驕ｸ謚櫁い・壹君菴薙ム繧ｦ繝ｳ縲阪が繝励す繝ｧ繝ｳ・・ to upSigniDUSC.length・・    const optsDUSC = [
      { id: 'dusc_none', label: '繝繧ｦ繝ｳ縺励↑縺・, action: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction, available: true },
      ...upSigniDUSC.map((s, i) => ({
        id: `dusc_${i}`,
        label: `${ctx.cardMap.get(s.cn)?.CardName ?? s.cn}繧偵ム繧ｦ繝ｳ`,
        action: ({ type: 'STUB', id: 'INTERNAL_DOWN_SIGNI_BY_ZONE', value: s.zi } as StubAction) as EffectAction,
        available: true,
      })),
    ];
    return needsInteraction(
      addLog(ctx, `繧｢繝・・${targetClass ?? ''}繧ｷ繧ｰ繝九ｒ驕ｸ謚槭＠縺ｦ繝繧ｦ繝ｳ・医さ繧ｹ繝郁ｻｽ貂帷ｴ譚撰ｼ荏),
      { type: 'CHOOSE', options: optsDUSC, count: 1 }
    );
  }
  if (stub.id === 'INTERNAL_DOWN_SIGNI_BY_ZONE') {
    const ziIDSBZ = typeof stub.value === 'number' ? stub.value : 0;
    const downArrIDSBZ = [...(ctx.ownerState.field.signi_down ?? [false, false, false])];
    downArrIDSBZ[ziIDSBZ] = true;
    const newOwnerIDSBZ = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_down: downArrIDSBZ } };
    const topIDSBZ = ctx.ownerState.field.signi[ziIDSBZ]?.at(-1);
    return done(addLog({ ...ctx, ownerState: newOwnerIDSBZ, lastProcessedCards: topIDSBZ ? [topIDSBZ] : [] },
      `${topIDSBZ ? ctx.cardMap.get(topIDSBZ)?.CardName : '繧ｷ繧ｰ繝・}繧偵ム繧ｦ繝ｳ・医さ繧ｹ繝郁ｻｽ貂幢ｼ荏));
  }
  // CHOOSE_N_FROM_LIST: 莉･荳九・竭竭｡竭｢竭｣縺九ｉN蛟矩∈謚槭＠縺ｦ螳溯｡・  if (stub.id === 'CHOOSE_N_FROM_LIST') {
    const srcCNFL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCNFL = srcCNFL ? (srcCNFL.EffectText ?? '') + ' ' + (srcCNFL.BurstText ?? '') : '';
    const toHWCNFL = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 驕ｸ謚樊焚繧定ｧ｣譫撰ｼ医君 縺､縺ｾ縺ｧ驕ｸ縺ｶ縲阪君 縺､驕ｸ縺ｶ縲搾ｼ・    const countM = txtCNFL.match(/([・・・・-4])縺､(?:縺ｾ縺ｧ)?驕ｸ縺ｶ/);
    const maxChoose = countM ? parseInt(toHWCNFL(countM[1])) : 2;
    // 竭竭｡竭｢竭｣ 繧定ｧ｣譫舌＠縺ｦCHOOSE繧ｪ繝励す繝ｧ繝ｳ逕滓・・・ONDITIONAL_MULTI_CHOOSE_BY_CENTER縺ｨ蜷後§繝ｭ繧ｸ繝・け・・    const choicePatternsCNFL = [
      { m: /竭([^竭｡竭｢竭｣]+)/, idx: 0 }, { m: /竭｡([^竭｢竭｣竭､]+)/, idx: 1 },
      { m: /竭｢([^竭｣竭､]+)/, idx: 2 }, { m: /竭｣([^竭､]+)/, idx: 3 },
    ];
    const optsCNFL: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of choicePatternsCNFL) {
      const mat = txtCNFL.match(m);
      if (!mat) continue;
      const choiceTxtCNFL = mat[1].replace(/縲・s*$/, '').trim();
      let choiceActionCNFL: EffectAction | null = null;
      if (choiceTxtCNFL.match(/繧ｫ繝ｼ繝峨ｒ[・・]譫壼ｼ輔￥/))
        choiceActionCNFL = { type: 'DRAW', count: 1 } as DrawAction;
      if (!choiceActionCNFL && choiceTxtCNFL.match(/蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝擬・・]菴薙ｒ蟇ｾ雎｡縺ｨ縺・*繝繧ｦ繝ｳ/))
        choiceActionCNFL = { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as DownAction;
      if (!choiceActionCNFL && choiceTxtCNFL.match(/謇区惆繧端・・]譫夊ｦ九↑縺・〒驕ｸ縺ｳ.*謐ｨ縺ｦ/))
        choiceActionCNFL = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as TrashAction;
      const pwDownMCNFL = !choiceActionCNFL && choiceTxtCNFL.match(/繝代Ρ繝ｼ繧・[・・][・・・兔d]+)縺吶ｋ/);
      if (pwDownMCNFL) {
        const delta = parseInt(toHWCNFL(pwDownMCNFL[1]).replace('・・, '-'));
        choiceActionCNFL = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_OPP_ONE', value: delta } as StubAction) as EffectAction;
      }
      if (!choiceActionCNFL && choiceTxtCNFL.match(/繝繧ｦ繝ｳ縺吶ｋ/))
        choiceActionCNFL = { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as DownAction;
      if (choiceActionCNFL)
        optsCNFL.push({ id: `choice_${idx}`, label: `${'竭竭｡竭｢竭｣'[idx]}${choiceTxtCNFL.slice(0, 18)}...`, action: choiceActionCNFL, available: true });
    }
    if (optsCNFL.length > 0) {
      return needsInteraction(addLog(ctx, `蜉ｹ譫懊ｒ${maxChoose}縺､驕ｸ謚橸ｼ・HOOSE_N_FROM_LIST・荏), {
        type: 'CHOOSE', options: optsCNFL, count: Math.min(maxChoose, optsCNFL.length),
      });
    }
    return done(addLog(ctx, `繝ｪ繧ｹ繝医°繧丑蛟矩∈謚橸ｼ郁ｧ｣譫蝉ｸ榊庄: ${txtCNFL.slice(0,30)}・荏));
  }
  // CHOOSE_COLOR_FROM_LIST / CHOOSE_SAME_OPTION_TWICE / CHOOSE_SAME_OPTION_MULTIPLE
  // CHOOSE_COLOR_FROM_LIST: 繧ｨ繝翫だ繝ｼ繝ｳ縺ｮ濶ｲ縺九ｉ驕ｸ縺ｶ・域怙螟ｧN濶ｲ・俄・ selectedColors 縺ｫ菫晏ｭ・  if (stub.id === 'CHOOSE_COLOR_FROM_LIST') {
    const colorNames = ['逋ｽ', '襍､', '髱・, '邱・, '鮟・];
    // 繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ縺ゅｋ濶ｲ繧貞庶髮・    const enaColorsCCL = new Set<string>();
    ctx.ownerState.energy.forEach(cn => {
      const c = ctx.cardMap.get(cn);
      (c?.Color ?? '').split(/[繝ｻ,縲‐/).forEach(col => { if (colorNames.includes(col.trim())) enaColorsCCL.add(col.trim()); });
    });
    if (enaColorsCCL.size === 0) return done(addLog(ctx, '濶ｲ驕ｸ謚橸ｼ壹お繝翫↓濶ｲ縺ｪ縺・));
    const optsCCL = [...enaColorsCCL].map(col => ({
      id: `color_${col}`,
      label: `縲・{col}縲九ｒ驕ｸ縺ｶ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SELECT_COLOR', value: col } as StubAction) as EffectAction,
      available: true,
    }));
    const srcCCL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCCL = srcCCL ? srcCCL.EffectText ?? '' : '';
    const maxMCCL = txtCCL.match(/譛螟ｧ([・・・・-5])濶ｲ/);
    const maxCount = maxMCCL ? parseInt(maxMCCL[1].replace(/[・・・評/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))) : 1;
    return needsInteraction(addLog(ctx, `濶ｲ繧帝∈謚橸ｼ域怙螟ｧ${maxCount}濶ｲ・荏), {
      type: 'CHOOSE', options: optsCCL, count: Math.min(maxCount, optsCCL.length),
    });
  }
  if (stub.id === 'INTERNAL_SELECT_COLOR') {
    const colISC = typeof stub.value === 'string' ? stub.value : '';
    const selectedColors = [...(ctx.ownerState.story_overrides?.['__selected_colors__']?.split(',') ?? []), colISC].filter(Boolean);
    const newOv = { ...(ctx.ownerState.story_overrides ?? {}), '__selected_colors__': selectedColors.join(',') };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, story_overrides: newOv } }, `縲・{colISC}縲九ｒ驕ｸ謚杼));
  }
  if (stub.id === 'CHOOSE_SAME_OPTION_TWICE' || stub.id === 'CHOOSE_SAME_OPTION_MULTIPLE') {
    const srcCSO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCSO = srcCSO ? (srcCSO.EffectText ?? '') + ' ' + (srcCSO.BurstText ?? '') : '';
    const toHWCSO = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const cntMCSO = txtCSO.match(/莉･荳九・.*?縺九ｉ([・・・兔d])縺､縺ｾ縺ｧ驕ｸ縺ｶ/);
    const maxRoundsCSO = cntMCSO ? parseInt(toHWCSO(cntMCSO[1])) : 2;
    const remainingCSO = typeof stub.value === 'number' ? stub.value : maxRoundsCSO;
    if (remainingCSO <= 0) return done(addLog(ctx, '驕ｸ謚槫ｮ御ｺ・));
    const optsCSO: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    // 竭繝舌え繝ｳ繧ｹ: 逶ｸ謇九す繧ｰ繝九ｒ謇区惆縺ｫ謌ｻ縺呻ｼ域焔譛ｭ謐ｨ縺ｦ繧ｻ繝・ヨ繧ょ性繧・・    if (txtCSO.match(/竭.*謇区惆縺ｫ謌ｻ縺・)) {
      const hasDiscard = /竭[^竭｡]*謇区惆繧端・・]譫壽昏縺ｦ繧・.test(txtCSO);
      const bounceAct: EffectAction = hasDiscard
        ? { type: 'SEQUENCE', steps: [
            { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: '繧ｷ繧ｰ繝・ } } } as BounceAction,
            { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } } as TrashAction,
          ]} as import('../types/effects').SequenceAction
        : { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: '繧ｷ繧ｰ繝・ } } } as BounceAction;
      optsCSO.push({
        id: 'cso_bounce', label: '竭逶ｸ謇九す繧ｰ繝九ｒ謇区惆縺ｫ謌ｻ縺・ + (hasDiscard ? '・域焔譛ｭ1譫壽昏縺ｦ・・ : ''),
        action: bounceAct,
        available: ctx.otherState.field.signi.some(s => s && s.length > 0),
      });
    }
    // 竭｡繧｢繧ｿ繝・け縺ｧ縺阪↑縺・ｻ倅ｸ・ 繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｫ繧｢繧ｿ繝・け遖∵ｭ｢繧剃ｻ倅ｸ・    if (txtCSO.match(/竭｡.*繧｢繧ｿ繝・け縺ｧ縺阪↑縺・)) {
      optsCSO.push({
        id: 'cso_no_attack', label: '竭｡逶ｸ謇九そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｫ繧｢繧ｿ繝・け荳榊庄繧剃ｻ倅ｸ・,
        action: { type: 'STUB', id: 'INTERNAL_GRANT_NO_ATTACK_LRIG' } as StubAction as EffectAction,
        available: !!ctx.otherState.field.lrig.at(-1),
      });
    }
    // 竭｡繧ｵ繝ｼ繝・ 繝・ャ繧ｭ縺九ｉ繧ｷ繧ｰ繝九ｒ謇区惆縺ｫ蜉縺医ｋ
    if (txtCSO.match(/竭｡.*繝・ャ繧ｭ.*繧ｷ繧ｰ繝・*(?:謇区惆|謗｢縺励※)/)) {
      optsCSO.push({
        id: 'cso_search', label: '竭｡繝・ャ繧ｭ縺九ｉ繧ｷ繧ｰ繝九ｒ謇区惆縺ｫ蜉縺医ｋ',
        action: { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: '繧ｷ繧ｰ繝・ }, maxCount: 1, then: { type: 'ADD_TO_HAND', owner: 'self' }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } } as EffectAction,
        available: ctx.ownerState.deck.some(cn => ctx.cardMap.get(cn)?.Type === '繧ｷ繧ｰ繝・),
      });
    }
    // 竭｢繧ｯ繝ｩ繧ｹ繧ｵ繝ｼ繝・ 繝・ャ繧ｭ縺九ｉ迚ｹ螳壹け繝ｩ繧ｹ縺ｮ繧ｷ繧ｰ繝九ｒN譫壽焔譛ｭ縺ｫ蜉縺医ｋ
    if (txtCSO.match(/竭｢.*繝・ャ繧ｭ縺九ｉ.*・・[^・枉+)・槭・繧ｷ繧ｰ繝・[・・・兔d]+)譫壹ｒ謗｢縺励※/)) {
      const mCS3 = txtCSO.match(/竭｢.*・・[^・枉+)・槭・繧ｷ繧ｰ繝・[・・・兔d]+)譫・);
      const className3 = mCS3 ? mCS3[1] : '';
      const cnt3 = mCS3 ? parseInt(toHWCSO(mCS3[2])) : 2;
      optsCSO.push({
        id: 'cso_class_search', label: `竭｢繝・ャ繧ｭ縺九ｉ・・{className3}・槭ｒ${cnt3}譫壽焔譛ｭ縺ｸ`,
        action: { type: 'SEQUENCE', steps: [
          { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: '繧ｷ繧ｰ繝・, story: className3 }, maxCount: cnt3, then: { type: 'ADD_TO_HAND', owner: 'self' }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } },
        ]} as import('../types/effects').SequenceAction as EffectAction,
        available: ctx.ownerState.deck.some(cn => (ctx.cardMap.get(cn)?.CardClass ?? '').includes(className3)),
      });
    }
    if (optsCSO.length === 0) return done(addLog(ctx, `[CHOOSE_SAME_OPTION: 驕ｸ謚櫁い隗｣譫仙､ｱ謨余`));
    const contCSO: StubAction = { type: 'STUB', id: stub.id, value: remainingCSO - 1 };
    return needsInteraction(addLog(ctx, `驕ｸ謚橸ｼ域ｮ九ｊ${remainingCSO}蝗槭∝酔荳驕ｸ謚櫁い蜿ｯ・荏), {
      type: 'CHOOSE', options: optsCSO, count: 1, continuation: contCSO as EffectAction,
    });
  }
  // === 繝舌ャ繝・5: 蜈ｬ髢九・繧｢繧ｯ繧ｻ蠢懃畑繝ｻ譚｡莉ｶ繝峨Ο繝ｼ邉ｻ ===
  // FIELD_COND_DRAW_REVEAL: 繝輔ぅ繝ｼ繝ｫ繝画擅莉ｶ驕疲・譎ゅ↓繝・ャ繧ｭ荳翫ｒ蜈ｬ髢九＠蜷後け繝ｩ繧ｹ縺ｪ繧画焔譛ｭ縺ｸ
  if (stub.id === 'FIELD_COND_DRAW_REVEAL') {
    const srcFCDR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtFCDR = srcFCDR ? (srcFCDR.EffectText ?? '') + ' ' + (srcFCDR.BurstText ?? '') : '';
    const mClassFCDR = txtFCDR.match(/・・[^・枉+)・・);
    const classNameFCDR = mClassFCDR ? mClassFCDR[1] : '';
    const hasClassFCDR = !classNameFCDR || ctx.ownerState.field.signi.some(s => {
      if (!s || s.length === 0) return false;
      return ctx.cardMap.get(s[s.length - 1])?.CardClass?.includes(classNameFCDR);
    });
    if (!hasClassFCDR) return done(addLog(ctx, `繝輔ぅ繝ｼ繝ｫ繝峨↓・・{classNameFCDR}・槭↑縺暦ｼ域擅莉ｶ譛ｪ驕疲・・荏));
    const sFCDR = ctx.ownerState;
    if (sFCDR.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const topFCDR = sFCDR.deck[0];
    const topCardFCDR = ctx.cardMap.get(topFCDR);
    const topClassFCDR = topCardFCDR?.CardClass ?? '';
    if (classNameFCDR && topClassFCDR.includes(classNameFCDR)) {
      const newSFCDR: PlayerState = { ...sFCDR, deck: sFCDR.deck.slice(1), hand: [...sFCDR.hand, topFCDR] };
      return done(addLog({ ...ctx, ownerState: newSFCDR }, `蜈ｬ髢・{topCardFCDR?.CardName ?? topFCDR}(・・{classNameFCDR}・樔ｸ閾ｴ)竊呈焔譛ｭ縺ｸ`));
    }
    const newSFCDR2: PlayerState = { ...sFCDR, deck: sFCDR.deck.slice(1), trash: [...sFCDR.trash, topFCDR] };
    return done(addLog({ ...ctx, ownerState: newSFCDR2 }, `蜈ｬ髢・{topCardFCDR?.CardName ?? topFCDR}(荳堺ｸ閾ｴ)竊偵ヨ繝ｩ繝・す繝･`));
  }
  // REVEAL: 繝・ャ繧ｭ荳翫ｒ蜈ｬ髢具ｼ亥錐蜑阪Ο繧ｰ・・  if (stub.id === 'REVEAL') {
    const sREV = ctx.ownerState;
    if (sREV.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺暦ｼ亥・髢九〒縺阪★・・));
    const topREV = sREV.deck[0];
    const cardREV = ctx.cardMap.get(topREV);
    return done(addLog({ ...ctx, lastProcessedCards: [topREV] }, `蜈ｬ髢具ｼ・{cardREV?.CardName ?? topREV}`));
  }
  // HAND_REVEAL_CLASS_SIGNI: 謇区惆縺ｮ繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九ｒ驕ｸ謚槭＠縺ｦ蜈ｬ髢具ｼ・ELECT_TARGET・・  if (stub.id === 'HAND_REVEAL_CLASS_SIGNI') {
    const srcHRCS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHRCS = srcHRCS ? (srcHRCS.EffectText ?? '') + ' ' + (srcHRCS.BurstText ?? '') : '';
    // 繧ｯ繝ｩ繧ｹ蜷阪ｒ謚ｽ蜃ｺ・井ｾ・ ・懊い繝ｼ繝・槭・ｼ懈ｰｴ迯｣・橸ｼ・    const classMatchHRCS = txtHRCS.match(/謇区惆縺九ｉ(?:螂ｽ縺阪↑譫壽焚縺ｮ?)?[・懊馨([^・槭犠+)[・槭犠/);
    const classNameHRCS = classMatchHRCS ? classMatchHRCS[1] : '';
    const isAnyCountHRCS = txtHRCS.includes('螂ｽ縺阪↑譫壽焚');
    // 謇区惆縺九ｉ繧ｯ繝ｩ繧ｹ繧ｷ繧ｰ繝九ｒ邨槭ｊ霎ｼ繧
    const candsHRCS = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === '繧ｷ繧ｰ繝・ && (!classNameHRCS || (c.CardClass ?? '').includes(classNameHRCS));
    });
    if (candsHRCS.length === 0) {
      return done(addLog({ ...ctx, lastProcessedCards: [] },
        `謇区惆縺ｫ${classNameHRCS ? `・・{classNameHRCS}・杼 : ''}繧ｷ繧ｰ繝九↑縺暦ｼ亥・髢九↑縺暦ｼ荏));
    }
    const countHRCS = isAnyCountHRCS ? candsHRCS.length : 1;
    const noopHRCS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(
      addLog(ctx, `謇区惆縺九ｉ${classNameHRCS ? `・・{classNameHRCS}・杼 : ''}繧ｷ繧ｰ繝九ｒ${isAnyCountHRCS ? '螂ｽ縺阪↑譫壽焚' : '・第椢'}蜈ｬ髢九☆繧義),
      {
        type: 'SELECT_TARGET',
        candidates: candsHRCS,
        count: countHRCS,
        optional: isAnyCountHRCS,
        targetScope: 'self_hand',
        thenAction: noopHRCS as EffectAction,
      }
    );
  }
  // OPTIONAL_HAND_REVEAL_NAMED: 蜷咲ｧｰ謖・ｮ壹〒謇区惆繧ｫ繝ｼ繝峨ｒ莉ｻ諢丞・髢・  if (stub.id === 'OPTIONAL_HAND_REVEAL_NAMED') {
    const srcOHRN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOHRN = srcOHRN ? (srcOHRN.EffectText ?? '') + ' ' + (srcOHRN.BurstText ?? '') : '';
    const mNameOHRN = txtOHRN.match(/縲・[^縲江+)縲・);
    const nameOHRN = mNameOHRN ? mNameOHRN[1] : '';
    const matchingOHRN = ctx.ownerState.hand.filter(cn => nameOHRN && ctx.cardMap.get(cn)?.CardName === nameOHRN);
    if (matchingOHRN.length === 0) return done(addLog(ctx, `謇区惆縺ｫ縲・{nameOHRN}縲阪↑縺暦ｼ亥・髢九↑縺暦ｼ荏));
    return done(addLog({ ...ctx, lastProcessedCards: matchingOHRN },
      `謇区惆縲・{nameOHRN}縲阪ｒ蜈ｬ髢具ｼ・{matchingOHRN.length}譫夲ｼ荏));
  }
  // ACCE_SIGNI_GRANT_ABILITY: 繧｢繧ｯ繧ｻ荳ｭ縺ｮ繧ｷ繧ｰ繝九↓繧ｭ繝ｼ繝ｯ繝ｼ繝芽・蜉帙ｒ莉倅ｸ・  if (stub.id === 'ACCE_SIGNI_GRANT_ABILITY') {
    const srcAcceAGSA = ctx.sourceCardNum;
    const acceAGSA = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const zoneIdxAGSA = acceAGSA.findIndex(cn => cn === srcAcceAGSA);
    if (zoneIdxAGSA < 0) return done(addLog(ctx, '繧｢繧ｯ繧ｻ荳ｭ縺ｮ繧ｷ繧ｰ繝九′隕九▽縺九ｉ縺ｪ縺・));
    const targetSigniAGSA = ctx.ownerState.field.signi[zoneIdxAGSA]?.at(-1);
    if (!targetSigniAGSA) return done(addLog(ctx, '繧｢繧ｯ繧ｻ蜈医・繧ｷ繧ｰ繝九′縺・↑縺・));
    const srcCardAGSA = ctx.cardMap.get(srcAcceAGSA ?? '');
    const txtAGSA = srcCardAGSA ? (srcCardAGSA.EffectText ?? '') : '';
    const mKwAGSA = txtAGSA.match(/縲・[^縲曽+)縲・);
    const kwAGSA = mKwAGSA ? mKwAGSA[1] : '繝ｩ繝ｳ繧ｵ繝ｼ';
    const kwGrantsAGSA = { ...(ctx.ownerState.keyword_grants ?? {}) };
    const existingAGSA = kwGrantsAGSA[targetSigniAGSA] ?? [];
    if (!existingAGSA.includes(kwAGSA)) kwGrantsAGSA[targetSigniAGSA] = [...existingAGSA, kwAGSA];
    const newSAGSA: PlayerState = { ...ctx.ownerState, keyword_grants: kwGrantsAGSA };
    return done(addLog({ ...ctx, ownerState: newSAGSA },
      `${ctx.cardMap.get(targetSigniAGSA)?.CardName ?? targetSigniAGSA}縺ｫ縲・{kwAGSA}縲台ｻ倅ｸ餐));
  }
  // MOVE_ACCE_TO_SIGNI: 繧｢繧ｯ繧ｻ繧貞挨縺ｮ繧ｷ繧ｰ繝九↓莉倥￠譖ｿ縺・  if (stub.id === 'MOVE_ACCE_TO_SIGNI') {
    const srcAcceMATS = ctx.sourceCardNum;
    const acceMATS = [...(ctx.ownerState.field.signi_acce ?? [null, null, null])];
    const srcZoneMATS = acceMATS.findIndex(cn => cn === srcAcceMATS);
    if (srcZoneMATS < 0) return done(addLog(ctx, '繧｢繧ｯ繧ｻ荳ｭ縺ｮ繧ｷ繧ｰ繝九′隕九▽縺九ｉ縺ｪ縺・));
    // 繧｢繧ｯ繧ｻ縺後▽縺・※縺・↑縺・だ繝ｼ繝ｳ繧呈爾縺・    const dstZoneMATS = acceMATS.findIndex((cn, i) => i !== srcZoneMATS && cn === null &&
      ctx.ownerState.field.signi[i] && (ctx.ownerState.field.signi[i]?.length ?? 0) > 0);
    if (dstZoneMATS < 0) return done(addLog(ctx, '遘ｻ蜍募・縺ｮ繧ｷ繧ｰ繝九だ繝ｼ繝ｳ縺ｪ縺・));
    acceMATS[srcZoneMATS] = null;
    acceMATS[dstZoneMATS] = srcAcceMATS ?? null;
    const newSMATS: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_acce: acceMATS } };
    const dstSigniName = ctx.cardMap.get(ctx.ownerState.field.signi[dstZoneMATS]?.at(-1) ?? '')?.CardName ?? '繧ｷ繧ｰ繝・;
    return done(addLog({ ...ctx, ownerState: newSMATS },
      `${ctx.cardMap.get(srcAcceMATS ?? '')?.CardName ?? '繧｢繧ｯ繧ｻ'}繧・{dstSigniName}縺ｸ遘ｻ蜍描));
  }
  // PEEP_HAND: 逶ｸ謇九・謇区惆繧定ｦ励″隕具ｼ医Ο繧ｰ縺ｫ譫壽焚縺ｨ蜷榊燕繧定｡ｨ遉ｺ・・  if (stub.id === 'PEEP_HAND') {
    const oppHandPH = ctx.otherState.hand;
    const namesPH = oppHandPH.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('縲・);
    return done(addLog(ctx, `逶ｸ謇九・謇区惆繧堤｢ｺ隱搾ｼ・{oppHandPH.length}譫夲ｼ会ｼ・{namesPH || '縺ｪ縺・}`));
  }
  // REVEAL_OPP_HAND_CARD: 逶ｸ謇九・謇区惆縺ｮ繧ｫ繝ｼ繝峨ｒ1譫壼・髢・  if (stub.id === 'REVEAL_OPP_HAND_CARD') {
    const oppHandROHC = ctx.otherState.hand;
    if (oppHandROHC.length === 0) return done(addLog(ctx, '逶ｸ謇九・謇区惆縺ｪ縺・));
    const randROHC = oppHandROHC[Math.floor(Math.random() * oppHandROHC.length)];
    return done(addLog({ ...ctx, lastProcessedCards: [randROHC] },
      `逶ｸ謇九・謇区惆繧貞・髢具ｼ・{ctx.cardMap.get(randROHC)?.CardName ?? randROHC}`));
  }
  // OPP_REVEAL_HAND_AND_LRIG_DECK / OPP_REVEAL_LRIG_DECK / OPP_REVEAL_TOP_AND_HAND: 蜈ｬ髢九Ο繧ｰ
  if (stub.id === 'OPP_REVEAL_HAND_AND_LRIG_DECK' || stub.id === 'OPP_REVEAL_LRIG_DECK' || stub.id === 'OPP_REVEAL_TOP_AND_HAND') {
    const handNames = ctx.otherState.hand.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('縲・);
    const lrigNames = ctx.otherState.lrig_deck.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('縲・);
    if (stub.id === 'OPP_REVEAL_LRIG_DECK') {
      return done(addLog(ctx, `逶ｸ謇九・繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ蜈ｬ髢具ｼ・{ctx.otherState.lrig_deck.length}譫夲ｼ会ｼ・{lrigNames || '縺ｪ縺・}`));
    }
    if (stub.id === 'OPP_REVEAL_TOP_AND_HAND') {
      const topName = ctx.cardMap.get(ctx.otherState.deck[0] ?? '')?.CardName ?? '縺ｪ縺・;
      return done(addLog(ctx, `逶ｸ謇九・繝・ャ繧ｭ荳奇ｼ・{topName}・・謇区惆・・{handNames || '縺ｪ縺・}・峨ｒ蜈ｬ髢義));
    }
    return done(addLog(ctx, `逶ｸ謇九・謇区惆・・{handNames || '縺ｪ縺・}・・繝ｫ繝ｪ繧ｰ繝・ャ繧ｭ・・{lrigNames || '縺ｪ縺・}・峨ｒ蜈ｬ髢義));
  }
  // === 繝舌ャ繝・4: 繧ｷ繧ｰ繝狗ｧｻ蜍輔・繧ｨ繝頑桃菴懊・隍・焚蟇ｾ雎｡邉ｻ ===
  // OPP_SIGNI_TO_DECK_AND_SHUFFLE / OPP_SIGNI_TO_DECK_BY_GATE / OPP_SIGNI_TO_DECK_NTH 縺ｯ line 2567 縺ｮ handler 縺ｧ蜃ｦ逅・ｸ医∩・・ead code 蜑企勁・・  // INTERNAL_BOUNCE_TO_DECK: 驕ｸ謚槭す繧ｰ繝九ｒ繝・ャ繧ｭ縺ｫ繝ｩ繝ｳ繝繝謖ｿ蜈･
  if (stub.id === 'INTERNAL_BOUNCE_TO_DECK') {
    const cnIBTD = ctx.lastProcessedCards?.[0];
    if (!cnIBTD) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺・));
    const inOwnIBTD = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnIBTD);
    const ownerIBTD: Owner = inOwnIBTD ? 'self' : 'opponent';
    const sIBTD = ownerState(ownerIBTD, ctx);
    const removedIBTD = removeFromField(cnIBTD, sIBTD);
    const deckIBTD = [...removedIBTD.deck];
    const insertIBTD = Math.floor(Math.random() * (deckIBTD.length + 1));
    deckIBTD.splice(insertIBTD, 0, cnIBTD);
    const newSIBTD: PlayerState = { ...removedIBTD, deck: deckIBTD };
    return done(addLog(setOwnerState(ownerIBTD, newSIBTD, ctx),
      `${ctx.cardMap.get(cnIBTD)?.CardName ?? cnIBTD}繧偵ョ繝・く縺ｫ豺ｷ縺懊◆・医す繝｣繝・ヵ繝ｫ・荏));
  }
  // OPP_SIGNI_LEAVE_TO_TRASH: 逶ｸ謇九す繧ｰ繝矩蝣ｴ竊偵ヨ繝ｩ繝・す繝･・医お繝翫〒縺ｯ縺ｪ縺擾ｼ・  if (stub.id === 'OPP_SIGNI_LEAVE_TO_TRASH') {
    const candidatesOSLT = (ctx.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candidatesOSLT.length === 0) return done(addLog(ctx, '逶ｸ謇九す繧ｰ繝九↑縺・));
    const thenOSLT: StubAction = { type: 'STUB', id: 'INTERNAL_LEAVE_TO_TRASH' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candidatesOSLT, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: thenOSLT as EffectAction,
    });
  }
  // INTERNAL_LEAVE_TO_TRASH: 驕ｸ謚槭す繧ｰ繝九ｒ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・  if (stub.id === 'INTERNAL_LEAVE_TO_TRASH') {
    const cnILT = ctx.lastProcessedCards?.[0];
    if (!cnILT) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺・));
    const inOwnILT = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnILT);
    const ownerILT: Owner = inOwnILT ? 'self' : 'opponent';
    const sILT = ownerState(ownerILT, ctx);
    const removedILT = removeFromField(cnILT, sILT);
    const newSILT: PlayerState = { ...removedILT, trash: [...removedILT.trash, cnILT] };
    return done(addLog(setOwnerState(ownerILT, newSILT, ctx),
      `${ctx.cardMap.get(cnILT)?.CardName ?? cnILT}繧偵ヨ繝ｩ繝・す繝･縺ｸ騾蝣ｴ`));
  }
  // TRADE_SELF_AND_OPP_TO_ENERGY: 閾ｪ繧ｷ繧ｰ繝・逶ｸ謇九す繧ｰ繝・菴凪・荳｡閠・お繝・  if (stub.id === 'TRADE_SELF_AND_OPP_TO_ENERGY') {
    const srcTSAOTE = ctx.sourceCardNum;
    let ctxTSAOTE = ctx;
    if (srcTSAOTE && ctx.ownerState.field.signi.some(s => s?.at(-1) === srcTSAOTE)) {
      const removedTSAOTE = removeFromField(srcTSAOTE, ctx.ownerState);
      const newOwnerTSAOTE: PlayerState = { ...removedTSAOTE, energy: [...removedTSAOTE.energy, srcTSAOTE] };
      ctxTSAOTE = { ...ctxTSAOTE, ownerState: newOwnerTSAOTE };
    }
    const candsTSAOTE = (ctxTSAOTE.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candsTSAOTE.length === 0) return done(addLog(ctxTSAOTE, '閾ｪ繧ｷ繧ｰ繝銀・繧ｨ繝奇ｼ育嶌謇九す繧ｰ繝九↑縺暦ｼ・));
    const banishTSAOTE: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'any', count: 1 } };
    return needsInteraction(addLog(ctxTSAOTE, '閾ｪ繧ｷ繧ｰ繝銀・繧ｨ繝翫∫嶌謇九す繧ｰ繝・菴馴∈謚・), {
      type: 'SELECT_TARGET', candidates: candsTSAOTE, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: banishTSAOTE as EffectAction,
    });
  }
  // MULTI_SIGNI_TO_ENERGY: 閾ｪ蛻・・隍・焚繧ｷ繧ｰ繝九ｒ繧ｨ繝翫↓
  if (stub.id === 'MULTI_SIGNI_TO_ENERGY') {
    const toHWMSTE = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcMSTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMSTE = srcMSTE ? (srcMSTE.EffectText ?? '') + ' ' + (srcMSTE.BurstText ?? '') : '';
    const mMSTE = txtMSTE.match(/([・・・兔d]+)菴・);
    const countMSTE = mMSTE ? parseInt(toHWMSTE(mMSTE[1])) : 2;
    const candsMSTE = (ctx.ownerState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candsMSTE.length === 0) return done(addLog(ctx, '繧ｷ繧ｰ繝九↑縺・));
    const banishMSTE: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'any', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsMSTE,
      count: Math.min(countMSTE, candsMSTE.length), optional: false,
      targetScope: 'self_field', thenAction: banishMSTE as EffectAction,
    });
  }
  // MULTI_SIGNI_POWER_UP_5000: 隍・焚繧ｷ繧ｰ繝九↓+5000繝代Ρ繝ｼ
  if (stub.id === 'MULTI_SIGNI_POWER_UP_5000') {
    const toHWMSPU5 = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcMSPU5 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMSPU5 = srcMSPU5 ? (srcMSPU5.EffectText ?? '') + ' ' + (srcMSPU5.BurstText ?? '') : '';
    const mMSPU5 = txtMSPU5.match(/([・・・兔d]+)菴・);
    const countMSPU5 = mMSPU5 ? parseInt(toHWMSPU5(mMSPU5[1])) : 2;
    const mDeltaMSPU5 = txtMSPU5.match(/\+([・・・兔d]+)/);
    const deltaMSPU5 = mDeltaMSPU5 ? parseInt(toHWMSPU5(mDeltaMSPU5[1])) : 5000;
    const candsMSPU5 = (ctx.ownerState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candsMSPU5.length === 0) return done(addLog(ctx, '繧ｷ繧ｰ繝九↑縺・));
    const pmMSPU5: PowerModifyAction = {
      type: 'POWER_MODIFY', delta: deltaMSPU5, target: { type: 'SIGNI', owner: 'self', count: 1 },
    };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsMSPU5,
      count: Math.min(countMSPU5, candsMSPU5.length), optional: false,
      targetScope: 'self_field', thenAction: pmMSPU5 as EffectAction,
    });
  }
  // TRASHED_CARD_TO_HAND_OR_ENERGY: 繝医Λ繝・す繝･繧ｫ繝ｼ繝俄・謇区惆縺九お繝企∈謚・  // OPP_TRASH_FIELD_SIGNI_AND_ENERGY: 逶ｸ謇九・繧ｷ繧ｰ繝九→繧ｨ繝翫ｒ繝医Λ繝・す繝･
  if (stub.id === 'OPP_TRASH_FIELD_SIGNI_AND_ENERGY') {
    const candidatesOTFSE = (ctx.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    let otherOTFSE = ctx.otherState;
    // 逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨す繧ｰ繝九ｒ蜈ｨ縺ｦ繝医Λ繝・す繝･
    for (const cn of candidatesOTFSE) {
      const removed = removeFromField(cn, otherOTFSE);
      otherOTFSE = { ...removed, trash: [...removed.trash, cn] };
    }
    // 逶ｸ謇九お繝翫ｒ蜈ｨ縺ｦ繝医Λ繝・す繝･
    otherOTFSE = { ...otherOTFSE, trash: [...otherOTFSE.trash, ...otherOTFSE.energy], energy: [] };
    return done(addLog({ ...ctx, otherState: otherOTFSE },
      `逶ｸ謇九す繧ｰ繝・{candidatesOTFSE.length}菴・蜈ｨ繧ｨ繝翫ｒ繝医Λ繝・す繝･`));
  }
  // NON_GUARD_DISCARD_TO_ENERGY: 髱槭ぎ繝ｼ繝画昏縺ｦ迚後ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ
  if (stub.id === 'NON_GUARD_DISCARD_TO_ENERGY') {
    const cnNGDTE = ctx.lastProcessedCards?.[0];
    if (!cnNGDTE) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺・));
    const cardNGDTE = ctx.cardMap.get(cnNGDTE);
    const hasGuardNGDTE = cardNGDTE?.Guard === '笳・ || (cardNGDTE?.EffectText ?? '').includes('縲舌ぎ繝ｼ繝峨・);
    if (hasGuardNGDTE) return done(addLog(ctx, '繧ｬ繝ｼ繝峨き繝ｼ繝峨↑縺ｮ縺ｧ繧ｨ繝顔ｧｻ蜍輔↑縺・));
    const newSNGDTE: PlayerState = {
      ...ctx.ownerState,
      trash: ctx.ownerState.trash.filter(c => c !== cnNGDTE),
      energy: [...ctx.ownerState.energy, cnNGDTE],
    };
    return done(addLog({ ...ctx, ownerState: newSNGDTE }, `髱槭ぎ繝ｼ繝画昏縺ｦ迚娯・繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ`));
  }
  // === 繝舌ャ繝・3: 繧ｨ繝頑桃菴懊・繧ｫ繧ｦ繝ｳ繝医・譚｡莉ｶ蛻・ｲ千ｳｻ ===
  // ENERGY_TO_HAND_ON_DECK: 繧ｨ繝翫だ繝ｼ繝ｳ縺ｮ譛ｫ蟆ｾ竊呈焔譛ｭ・医ョ繝・く邨檎罰繧堤怐逡･・・  if (stub.id === 'ENERGY_TO_HAND_ON_DECK') {
    const sETHOD = ctx.ownerState;
    if (sETHOD.energy.length === 0) return done(addLog(ctx, '繧ｨ繝翫だ繝ｼ繝ｳ縺ｪ縺・));
    const lastEnaETHOD = sETHOD.energy.at(-1)!;
    const newSETHOD: PlayerState = {
      ...sETHOD,
      energy: sETHOD.energy.slice(0, -1),
      hand: [...sETHOD.hand, lastEnaETHOD],
    };
    return done(addLog({ ...ctx, ownerState: newSETHOD }, `${ctx.cardMap.get(lastEnaETHOD)?.CardName ?? lastEnaETHOD}繧偵お繝岩・謇区惆`));
  }
  // COUNT_DISTINCT_NAMES: 繝輔ぅ繝ｼ繝ｫ繝峨・逡ｰ縺ｪ繧句錐遘ｰ謨ｰ繧呈焚縺医※繝代Ρ繝ｼ菫ｮ豁｣
  if (stub.id === 'COUNT_DISTINCT_NAMES') {
    const toHWCDN = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcCDN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCDN = srcCDN ? (srcCDN.EffectText ?? '') + ' ' + (srcCDN.BurstText ?? '') : '';
    const mCDN = txtCDN.match(/([・・・・][・・・兔d]+)/);
    const deltaCDN = mCDN ? parseInt(toHWCDN(mCDN[1]).replace('・・, '+').replace('・・, '-')) : 1000;
    const ownSigniNames = new Set<string>();
    (ctx.ownerState.field.signi ?? []).forEach(s => {
      if (s && s.length > 0) {
        const name = ctx.cardMap.get(s[s.length - 1])?.CardName;
        if (name) ownSigniNames.add(name);
      }
    });
    const countCDN = ownSigniNames.size;
    const totalCDN = deltaCDN * countCDN;
    if (ctx.sourceCardNum) {
      const modsOwnCDN = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalCDN }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsOwnCDN } },
        `逡ｰ縺ｪ繧句錐遘ｰ${countCDN}遞ｮﾃ・{deltaCDN}竊偵ヱ繝ｯ繝ｼ${totalCDN}`));
    }
    return done(addLog(ctx, `逡ｰ縺ｪ繧句錐遘ｰ${countCDN}遞ｮ`));
  }
  // DISCARD_OR_PENALTY: 迚ｹ螳壹き繝ｼ繝・譫壽昏縺ｦ繧九°繝壹リ繝ｫ繝・ぅ・・譫壽昏縺ｦ・峨ｒ驕ｸ縺ｶ
  if (stub.id === 'DISCARD_OR_PENALTY') {
    const srcDOP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDOP = srcDOP ? (srcDOP.EffectText ?? '') + ' ' + (srcDOP.BurstText ?? '') : '';
    const toHWDOP = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchDOP = txtDOP.match(/謇区惆縺九ｉ[<・彎([^>・枉+)[>・枉縺ｮ繧ｷ繧ｰ繝九ｒ・第椢謐ｨ縺ｦ縺ｪ縺・°縺弱ｊ/);
    const typeMatchDOP = !classMatchDOP ? txtDOP.match(/謇区惆縺九ｉ(繧ｹ繝壹Ν|繧ｷ繧ｰ繝弓繧｢繝ｼ繝・繧抵ｼ第椢謐ｨ縺ｦ縺ｪ縺・°縺弱ｊ/) : null;
    const penaltyMDOP = txtDOP.match(/縺九℃繧頑焔譛ｭ繧・[・・・兔d]+)譫壽昏縺ｦ繧・);
    const penaltyCount = penaltyMDOP ? parseInt(toHWDOP(penaltyMDOP[1])) : 2;
    const matchingDOP = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (classMatchDOP) return c?.Type === '繧ｷ繧ｰ繝・ && (c.CardClass ?? '').includes(classMatchDOP[1]);
      if (typeMatchDOP) return c?.Type === typeMatchDOP[1];
      return false;
    });
    const labelDOP = classMatchDOP ? `・・{classMatchDOP[1]}・槭す繧ｰ繝九ｒ1譫壽昏縺ｦ繧義 : typeMatchDOP ? `${typeMatchDOP[1]}繧・譫壽昏縺ｦ繧義 : '謖・ｮ壹き繝ｼ繝峨ｒ1譫壽昏縺ｦ繧・;
    const penaltyActionDOP: StubAction = { type: 'STUB', id: 'INTERNAL_DISCARD_PENALTY', value: penaltyCount };
    if (matchingDOP.length === 0) {
      const toDiscard = ctx.ownerState.hand.slice(0, penaltyCount);
      const newOwner = { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(penaltyCount), trash: [...ctx.ownerState.trash, ...toDiscard] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `謖・ｮ壹き繝ｼ繝峨↑縺冷・繝壹リ繝ｫ繝・ぅ謇区惆${penaltyCount}譫壽昏縺ｦ`));
    }
    return needsInteraction(addLog(ctx, `${labelDOP}縺区焔譛ｭ繧・{penaltyCount}譫壽昏縺ｦ繧九°驕ｸ謚杼), {
      type: 'CHOOSE', count: 1, options: [
        { id: 'specific', label: labelDOP, action: { type: 'STUB', id: 'INTERNAL_DISCARD_MATCHING_HAND_DOP' } as EffectAction, available: true },
        { id: 'penalty',  label: `謇区惆繧・{penaltyCount}譫壽昏縺ｦ繧義, action: penaltyActionDOP as EffectAction, available: ctx.ownerState.hand.length >= penaltyCount },
      ],
    });
  }
  if (stub.id === 'INTERNAL_DISCARD_MATCHING_HAND_DOP') {
    const srcIDMD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtIDMD = srcIDMD ? (srcIDMD.EffectText ?? '') + ' ' + (srcIDMD.BurstText ?? '') : '';
    const classMatchIDMD = txtIDMD.match(/謇区惆縺九ｉ[<・彎([^>・枉+)[>・枉縺ｮ繧ｷ繧ｰ繝・);
    const typeMatchIDMD = !classMatchIDMD ? txtIDMD.match(/謇区惆縺九ｉ(繧ｹ繝壹Ν|繧ｷ繧ｰ繝弓繧｢繝ｼ繝・/) : null;
    const candsIDMD = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (classMatchIDMD) return c?.Type === '繧ｷ繧ｰ繝・ && (c.CardClass ?? '').includes(classMatchIDMD[1]);
      if (typeMatchIDMD) return c?.Type === typeMatchIDMD[1];
      return false;
    });
    if (candsIDMD.length === 0) return done(addLog(ctx, '隧ｲ蠖薙き繝ｼ繝峨↑縺・));
    const trashOneIDMD: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };
    return selectOrInteract(candsIDMD, 1, false, 'self_hand', trashOneIDMD as EffectAction, undefined, ctx);
  }
  if (stub.id === 'INTERNAL_DISCARD_PENALTY') {
    const cntIDP = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '2'));
    const toDiscardIDP = ctx.ownerState.hand.slice(0, cntIDP);
    const newOwnerIDP = { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(cntIDP), trash: [...ctx.ownerState.trash, ...toDiscardIDP] };
    return done(addLog({ ...ctx, ownerState: newOwnerIDP }, `繝壹リ繝ｫ繝・ぅ・壽焔譛ｭ${cntIDP}譫壽昏縺ｦ`));
  }
  // REVEAL_TOP_CONDITIONAL_ROUTE: 繝・ャ繧ｭ荳翫ｒ蜈ｬ髢九＠繝ｬ繝吶Ν譚｡莉ｶ縺ｧ蛻・ｲ・  if (stub.id === 'REVEAL_TOP_CONDITIONAL_ROUTE') {
    const toHWRTCR = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const sRTCR = ctx.ownerState;
    if (sRTCR.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const topRTCR = sRTCR.deck[0];
    const cardRTCR = ctx.cardMap.get(topRTCR);
    const topLevelRTCR = cardRTCR ? parseInt(toHWRTCR(cardRTCR.Level ?? '0')) || 0 : 0;
    const srcRTCR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRTCR = srcRTCR ? (srcRTCR.EffectText ?? '') + ' ' + (srcRTCR.BurstText ?? '') : '';
    const mLvRTCR = txtRTCR.match(/繝ｬ繝吶Ν([・・・兔d]+)莉･荳・);
    const threshRTCR = mLvRTCR ? parseInt(toHWRTCR(mLvRTCR[1])) : 3;
    const condMetRTCR = topLevelRTCR >= threshRTCR;
    const newSRTCR: PlayerState = { ...sRTCR, deck: sRTCR.deck.slice(1), trash: [...sRTCR.trash, topRTCR] };
    return done(addLog({ ...ctx, ownerState: newSRTCR },
      `蜈ｬ髢・{cardRTCR?.CardName ?? topRTCR}(Lv${topLevelRTCR})・壽擅莉ｶ${condMetRTCR ? '驕疲・' : '譛ｪ驕疲・'}竊偵ヨ繝ｩ繝・す繝･`));
  }
  // === 繝舌ャ繝・2: 繧｢繧ｯ繧ｻ繝ｻ繧ｷ繧ｰ繝矩・鄂ｮ繝ｻ閭ｽ蜉帑ｻ倅ｸ弱・辟｡蜉ｹ邉ｻ ===
  // ACCE_FROM_HAND: 謇区惆縺ｮ繧｢繧ｯ繧ｻ繧ｫ繝ｼ繝峨ｒ閾ｪ蛻・・繧ｷ繧ｰ繝九↓莉倥￠繧・  if (stub.id === 'ACCE_FROM_HAND' || stub.id === 'MULTI_ACCE_FROM_HAND') {
    const srcAFH = ctx.sourceCardNum;
    if (!srcAFH || !ctx.ownerState.hand.includes(srcAFH)) return done(addLog(ctx, '繧｢繧ｯ繧ｻ繧ｫ繝ｼ繝峨′謇区惆縺ｫ縺ｪ縺・));
    const acceAFH = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const candidatesAFH = (ctx.ownerState.field.signi ?? []).flatMap((stack, i) => {
      if (!stack || stack.length === 0) return [];
      if (acceAFH[i] !== null) return [];
      return [stack[stack.length - 1]];
    });
    if (candidatesAFH.length === 0) return done(addLog(ctx, '繧｢繧ｯ繧ｻ蟇ｾ雎｡縺ｮ繧ｷ繧ｰ繝九↑縺・));
    const attachAFH: AttachAcceAction = { type: 'ATTACH_ACCE', targetSigniOwner: 'self', sourceOwner: 'self' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candidatesAFH, count: 1, optional: false,
      targetScope: 'self_field', thenAction: attachAFH as EffectAction,
    });
  }
  // ACCE_FROM_TRASH: 繝医Λ繝・す繝･縺ｮ繧｢繧ｯ繧ｻ繧ｫ繝ｼ繝峨ｒ閾ｪ蛻・・繧ｷ繧ｰ繝九↓莉倥￠繧・  if (stub.id === 'ACCE_FROM_TRASH' || stub.id === 'NAMED_SIGNI_ACCE_FROM_TRASH') {
    const acceAFTR = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const candidatesAFTR = (ctx.ownerState.field.signi ?? []).flatMap((stack, i) => {
      if (!stack || stack.length === 0) return [];
      if (acceAFTR[i] !== null) return [];
      return [stack[stack.length - 1]];
    });
    if (candidatesAFTR.length === 0) return done(addLog(ctx, '繧｢繧ｯ繧ｻ蟇ｾ雎｡縺ｮ繧ｷ繧ｰ繝九↑縺・));
    // 繝医Λ繝・す繝･縺ｮ繧｢繧ｯ繧ｻ繧ｫ繝ｼ繝峨ｒ縺・▲縺溘ｓ謇区惆縺ｫ遘ｻ縺励、TTACH_ACCE縺ｧ蜃ｦ逅・    const srcAFTR = ctx.sourceCardNum;
    const trashAcceAFTR = srcAFTR && ctx.ownerState.trash.includes(srcAFTR) ? srcAFTR : null;
    if (!trashAcceAFTR) return done(addLog(ctx, '繧｢繧ｯ繧ｻ繧ｫ繝ｼ繝峨′繝医Λ繝・す繝･縺ｫ縺ｪ縺・));
    const newSAFTR: PlayerState = {
      ...ctx.ownerState,
      trash: ctx.ownerState.trash.filter(c => c !== trashAcceAFTR),
      hand: [...ctx.ownerState.hand, trashAcceAFTR],
    };
    const attachAFTR: AttachAcceAction = { type: 'ATTACH_ACCE', targetSigniOwner: 'self', sourceOwner: 'self' };
    return needsInteraction({ ...ctx, ownerState: newSAFTR }, {
      type: 'SELECT_TARGET', candidates: candidatesAFTR, count: 1, optional: false,
      targetScope: 'self_field', thenAction: attachAFTR as EffectAction,
    });
  }
  // SIGNI_REPOSITION: 繧ｷ繧ｰ繝九ｒ蛻･縺ｮ繧ｾ繝ｼ繝ｳ縺ｫ遘ｻ蜍包ｼ郁・or逶ｸ謇九・菴・or 蜈ｨ菴難ｼ・  if (stub.id === 'SIGNI_REPOSITION' || stub.id === 'SWAP_OPTIONAL') {
    const srcCardSR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSR = srcCardSR ? (srcCardSR.EffectText ?? '') + ' ' + (srcCardSR.BurstText ?? '') : '';
    const isOppSR = txtSR.includes('蟇ｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝・);
    const isAllSR = txtSR.includes('縺吶∋縺ｦ縺ｮ繧ｷ繧ｰ繝九ｒ') && !isOppSR;
    const targetStateSR = isOppSR ? ctx.otherState : ctx.ownerState;
    const targetScopeSR: TargetScope = isOppSR ? 'opp_field' : 'self_field';
    // 蜈ｨ繧ｷ繧ｰ繝矩・鄂ｮ譖ｿ縺・ 繝輔ぅ繝ｼ繝ｫ繝峨・繧ｷ繧ｰ繝句・菴薙ｒ繧ｾ繝ｼ繝ｳ驕ｸ謚槭〒蜈･繧梧崛縺医ｋ
    if (isAllSR) {
      const candsSRAll = ctx.ownerState.field.signi.flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
      if (candsSRAll.length < 2) return done(addLog(ctx, '驟咲ｽｮ譖ｿ縺井ｸ榊庄・医す繧ｰ繝・菴謎ｻ･荳具ｼ・));
      // 1菴薙★縺､驕ｸ謚槭＠縺ｦ遘ｻ蜍募・繧呈ｱｺ繧√ｋ・井ｻｻ諢擾ｼ・      const selectedSRAll = (ctx.lastProcessedCards ?? []).find(cn =>
        ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
      if (!selectedSRAll) {
        const noopSRAll: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
        const contSRAll: StubAction = { type: 'STUB', id: 'SIGNI_REPOSITION' };
        return needsInteraction(addLog(ctx, '驟咲ｽｮ譖ｿ縺医☆繧九す繧ｰ繝九ｒ驕ｸ謚橸ｼ井ｻｻ諢擾ｼ・), {
          type: 'SELECT_TARGET', candidates: candsSRAll, count: 1, optional: true,
          targetScope: 'self_field', thenAction: noopSRAll as EffectAction, continuation: contSRAll as EffectAction,
        });
      }
      const curZoneSRAll = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === selectedSRAll);
      const zoneOptsSRAll = [0,1,2].filter(i => i !== curZoneSRAll).map(zi => ({
        id: `zone_${zi}`, label: `繧ｾ繝ｼ繝ｳ${zi+1}縺ｸ遘ｻ蜍描,
        action: ({ type: 'STUB', id: 'INTERNAL_REPOSITION_TO_ZONE',
          value: `${selectedSRAll}:${zi}:false` } as StubAction) as EffectAction,
        available: true,
      }));
      zoneOptsSRAll.push({ id: 'skip', label: '邨ゆｺ・,
        action: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction) as EffectAction,
        available: true });
      return needsInteraction(addLog(ctx, '遘ｻ蜍募・繧ｾ繝ｼ繝ｳ繧帝∈謚・), { type: 'CHOOSE', options: zoneOptsSRAll, count: 1 });
    }
    // 蟇ｾ雎｡繧ｷ繧ｰ繝矩∈謚・    const selectedSR = (ctx.lastProcessedCards ?? []).find(cn =>
      targetStateSR.field.signi.some(s => s?.at(-1) === cn),
    );
    if (!selectedSR) {
      const candsSR = targetStateSR.field.signi.flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
      if (candsSR.length === 0) return done(addLog(ctx, '繧ｷ繧ｰ繝九↑縺暦ｼ・IGNI_REPOSITION・・));
      const noopSR: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contSR: StubAction = { type: 'STUB', id: stub.id };
      return needsInteraction(addLog(ctx, '驟咲ｽｮ譖ｿ縺医☆繧九す繧ｰ繝九ｒ驕ｸ謚・), {
        type: 'SELECT_TARGET', candidates: candsSR, count: 1, optional: stub.id === 'SWAP_OPTIONAL',
        targetScope: targetScopeSR, thenAction: noopSR as EffectAction, continuation: contSR as EffectAction,
      });
    }
    // 遘ｻ蜍募・繧ｾ繝ｼ繝ｳ驕ｸ謚・    const currentZoneSR = targetStateSR.field.signi.findIndex(s => s?.at(-1) === selectedSR);
    const zoneOptsSR = [0,1,2].filter(i => i !== currentZoneSR).map(zi => ({
      id: `zone_${zi}`, label: `繧ｾ繝ｼ繝ｳ${zi+1}縺ｸ遘ｻ蜍描,
      action: ({ type: 'STUB', id: 'INTERNAL_REPOSITION_TO_ZONE',
        value: `${selectedSR}:${zi}:${isOppSR}` } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '遘ｻ蜍募・繧ｾ繝ｼ繝ｳ繧帝∈謚・), { type: 'CHOOSE', options: zoneOptsSR, count: 1 });
  }
  // INTERNAL_REPOSITION_MOVE: 驕ｸ謚槭す繧ｰ繝九ｒ遨ｺ縺阪だ繝ｼ繝ｳ縺ｸ遘ｻ蜍包ｼ亥ｾ梧婿莠呈鋤・・  if (stub.id === 'INTERNAL_REPOSITION_MOVE') {
    const cnIRM = ctx.lastProcessedCards?.[0];
    if (!cnIRM) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺・));
    const signiIRM = [...(ctx.ownerState.field.signi ?? [])] as (string[] | null)[];
    const srcIdxIRM = signiIRM.findIndex(s => s?.at(-1) === cnIRM);
    const dstIdxIRM = signiIRM.findIndex(s => !s || s.length === 0);
    if (srcIdxIRM < 0 || dstIdxIRM < 0) return done(addLog(ctx, '繧ｷ繧ｰ繝狗ｧｻ蜍穂ｸ榊庄'));
    const stack = signiIRM[srcIdxIRM]!;
    signiIRM[srcIdxIRM] = stack.length > 1 ? stack.slice(0, -1) : null;
    signiIRM[dstIdxIRM] = [cnIRM];
    const newSIRM: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: signiIRM } };
    return done(addLog({ ...ctx, ownerState: newSIRM },
      `${ctx.cardMap.get(cnIRM)?.CardName ?? cnIRM}繧偵だ繝ｼ繝ｳ${srcIdxIRM + 1}竊・{dstIdxIRM + 1}縺ｫ遘ｻ蜍描));
  }
  // INTERNAL_REPOSITION_TO_ZONE: 驕ｸ謚槭す繧ｰ繝九ｒ謖・ｮ壹だ繝ｼ繝ｳ縺ｸ遘ｻ蜍包ｼ・IGNI_REPOSITION縺ｮ蠕悟濠・・  if (stub.id === 'INTERNAL_REPOSITION_TO_ZONE') {
    const valIRTZ = typeof stub.value === 'string' ? stub.value : '';
    const [cnIRTZ, dstStrIRTZ, isOppStrIRTZ] = valIRTZ.split(':');
    const dstIdxIRTZ = parseInt(dstStrIRTZ);
    const isOppIRTZ = isOppStrIRTZ === 'true';
    if (!cnIRTZ || isNaN(dstIdxIRTZ)) return done(addLog(ctx, '蠑墓焚荳肴ｭ｣・・NTERNAL_REPOSITION_TO_ZONE・・));
    const targetStateIRTZ = isOppIRTZ ? ctx.otherState : ctx.ownerState;
    const signiIRTZ = [...targetStateIRTZ.field.signi] as (string[] | null)[];
    const srcIdxIRTZ = signiIRTZ.findIndex(s => s?.at(-1) === cnIRTZ);
    if (srcIdxIRTZ < 0) return done(addLog(ctx, '繧ｾ繝ｼ繝ｳ迚ｹ螳壻ｸ榊庄・・NTERNAL_REPOSITION_TO_ZONE・・));
    // 遘ｻ蜍募・縺檎ｩｺ縺阪↑繧臥ｧｻ蜍輔∝頃譛峨↑繧牙・繧梧崛縺・    const stackSrcIRTZ = signiIRTZ[srcIdxIRTZ]!;
    const stackDstIRTZ = signiIRTZ[dstIdxIRTZ];
    if (!stackDstIRTZ || stackDstIRTZ.length === 0) {
      signiIRTZ[srcIdxIRTZ] = stackSrcIRTZ.length > 1 ? stackSrcIRTZ.slice(0, -1) : null;
      signiIRTZ[dstIdxIRTZ] = [cnIRTZ];
    } else {
      const topDstIRTZ = stackDstIRTZ[stackDstIRTZ.length - 1];
      signiIRTZ[srcIdxIRTZ] = stackSrcIRTZ.length > 1
        ? [...stackSrcIRTZ.slice(0, -1), topDstIRTZ] : [topDstIRTZ];
      signiIRTZ[dstIdxIRTZ] = stackDstIRTZ.length > 1
        ? [...stackDstIRTZ.slice(0, -1), cnIRTZ] : [cnIRTZ];
    }
    const newStateIRTZ = { ...targetStateIRTZ, field: { ...targetStateIRTZ.field, signi: signiIRTZ } };
    const newCtxIRTZ = isOppIRTZ
      ? { ...ctx, otherState: newStateIRTZ }
      : { ...ctx, ownerState: newStateIRTZ };
    return done(addLog(newCtxIRTZ,
      `${ctx.cardMap.get(cnIRTZ)?.CardName ?? cnIRTZ}繧偵だ繝ｼ繝ｳ${srcIdxIRTZ+1}竊・{dstIdxIRTZ+1}縺ｫ遘ｻ蜍描));
  }
  // GRANT_CONDITIONAL_ASSASSIN_ABILITY: 譚｡莉ｶ莉倥″繧｢繧ｵ繧ｷ繝ｳ繧談eyword_grants縺ｫ莉倅ｸ・  if (stub.id === 'GRANT_CONDITIONAL_ASSASSIN_ABILITY') {
    const cnGCAA = ctx.sourceCardNum;
    if (!cnGCAA) return done(addLog(ctx, '繧ｽ繝ｼ繧ｹ繧ｫ繝ｼ繝峨↑縺・));
    const kwGCAA = { ...(ctx.ownerState.keyword_grants ?? {}) };
    const existingGCAA = kwGCAA[cnGCAA] ?? [];
    if (!existingGCAA.includes('繧｢繧ｵ繧ｷ繝ｳ')) kwGCAA[cnGCAA] = [...existingGCAA, '繧｢繧ｵ繧ｷ繝ｳ'];
    const newSGCAA: PlayerState = { ...ctx.ownerState, keyword_grants: kwGCAA };
    return done(addLog({ ...ctx, ownerState: newSGCAA },
      `${ctx.cardMap.get(cnGCAA)?.CardName ?? cnGCAA}縺ｫ繧｢繧ｵ繧ｷ繝ｳ莉倅ｸ趣ｼ域擅莉ｶ莉倥″・荏));
  }
  // POWER_MINUS_PER_OWN_LEVEL: 縺薙・繧ｷ繧ｰ繝九・繝ｬ繝吶Νﾃ・000縺縺大ｯｾ謌ｦ逶ｸ謇九す繧ｰ繝九・繝代Ρ繝ｼ繧剃ｸ九￡繧・  // WXK08-078・亥ｼｩ譖ｸ縲繧ｨ繝繧ｷ繝ｧ・峨・GRANT_SIGNI_ABOVE_ABILITY縺ｧ莉倅ｸ弱＆繧後ｋACTIVATED蜉ｹ譫・  if (stub.id === 'POWER_MINUS_PER_OWN_LEVEL') {
    const srcCardPMPOL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const srcLevelPMPOL = srcCardPMPOL ? (parseInt(srcCardPMPOL.Level ?? '0') || 0) : 0;
    const deltaPMPOL = -2000 * srcLevelPMPOL;
    const targetPMPOL = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetPMPOL) {
      const newMods = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: targetPMPOL, delta: deltaPMPOL }];
      const newOtherPMPOL: PlayerState = { ...ctx.otherState, temp_power_mods: newMods };
      return done(addLog({ ...ctx, otherState: newOtherPMPOL },
        `${ctx.cardMap.get(targetPMPOL)?.CardName ?? targetPMPOL} 繝代Ρ繝ｼ${deltaPMPOL}・医Ξ繝吶Ν${srcLevelPMPOL}ﾃ・2000・荏));
    }
    const oppCandsPMPOL = fieldCandidates(ctx.otherState, { cardType: '繧ｷ繧ｰ繝・ }, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
    if (oppCandsPMPOL.length === 0) return done(addLog(ctx, '蟇ｾ雎｡逶ｸ謇九す繧ｰ繝九↑縺暦ｼ・OWER_MINUS_PER_OWN_LEVEL・・));
    const thenPMPOL: StubAction = { type: 'STUB', id: 'POWER_MINUS_PER_OWN_LEVEL' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: oppCandsPMPOL, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: thenPMPOL as EffectAction,
    });
  }
  // NEGATE_ABILITY: 蟇ｾ雎｡繧ｷ繧ｰ繝九・閭ｽ蜉帙ｒ辟｡蜉ｹ蛹厄ｼ・bilities_removed縺ｫ霑ｽ蜉・・  if (stub.id === 'NEGATE_ABILITY') {
    const targetNA = ctx.lastProcessedCards?.[0];
    if (targetNA) {
      // 蟇ｾ雎｡縺後＞縺壹ｌ縺九・繝輔ぅ繝ｼ繝ｫ繝峨↓蟄伜惠縺吶ｋ縺狗｢ｺ隱・      const inOwnNA = ctx.ownerState.field.signi.some(s => s?.at(-1) === targetNA);
      const inOppNA = ctx.otherState.field.signi.some(s => s?.at(-1) === targetNA);
      if (inOwnNA) {
        const newOwnerNA: PlayerState = { ...ctx.ownerState, abilities_removed: [...(ctx.ownerState.abilities_removed ?? []), targetNA] };
        return done(addLog({ ...ctx, ownerState: newOwnerNA }, `${ctx.cardMap.get(targetNA)?.CardName ?? targetNA}縺ｮ閭ｽ蜉帙ｒ辟｡蜉ｹ蛹冒));
      }
      if (inOppNA) {
        if ((ctx.otherProtectedSigniNums ?? []).includes(targetNA)) {
          return done(addLog(ctx, `${ctx.cardMap.get(targetNA)?.CardName ?? targetNA}縺ｯ菫晁ｭｷ縺輔ｌ縺ｦ縺・ｋ縺溘ａ閭ｽ蜉帙ｒ螟ｱ繧上↑縺Я));
        }
        const newOtherNA: PlayerState = { ...ctx.otherState, abilities_removed: [...(ctx.otherState.abilities_removed ?? []), targetNA] };
        return done(addLog({ ...ctx, otherState: newOtherNA }, `${ctx.cardMap.get(targetNA)?.CardName ?? targetNA}縺ｮ閭ｽ蜉帙ｒ辟｡蜉ｹ蛹冒));
      }
    }
    // 蟇ｾ雎｡縺御ｸ肴・: 逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨°繧唄ELECT・井ｿ晁ｭｷ貂医∩繧ｷ繧ｰ繝九ｒ髯､縺擾ｼ・    const candNA = (ctx.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : [])
      .filter(n => !(ctx.otherProtectedSigniNums ?? []).includes(n));
    if (candNA.length === 0) return done(addLog(ctx, '辟｡蜉ｹ蛹門ｯｾ雎｡縺ｪ縺・));
    const thenNA: StubAction = { type: 'STUB', id: 'INTERNAL_NEGATE_ABILITY' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candNA, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: thenNA as EffectAction,
    });
  }
  // INTERNAL_NEGATE_ABILITY: 驕ｸ謚槭す繧ｰ繝九・閭ｽ蜉帙ｒ辟｡蜉ｹ蛹・  if (stub.id === 'INTERNAL_NEGATE_ABILITY') {
    const cnINA = ctx.lastProcessedCards?.[0];
    if (!cnINA) return done(addLog(ctx, '蟇ｾ雎｡縺ｪ縺・));
    const inOwnINA = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnINA);
    if (inOwnINA) {
      const newOwnerINA: PlayerState = { ...ctx.ownerState, abilities_removed: [...(ctx.ownerState.abilities_removed ?? []), cnINA] };
      return done(addLog({ ...ctx, ownerState: newOwnerINA }, `${ctx.cardMap.get(cnINA)?.CardName ?? cnINA}縺ｮ閭ｽ蜉帙ｒ辟｡蜉ｹ蛹冒));
    }
    if ((ctx.otherProtectedSigniNums ?? []).includes(cnINA)) {
      return done(addLog(ctx, `${ctx.cardMap.get(cnINA)?.CardName ?? cnINA}縺ｯ菫晁ｭｷ縺輔ｌ縺ｦ縺・ｋ縺溘ａ閭ｽ蜉帙ｒ螟ｱ繧上↑縺Я));
    }
    const newOtherINA: PlayerState = { ...ctx.otherState, abilities_removed: [...(ctx.otherState.abilities_removed ?? []), cnINA] };
    return done(addLog({ ...ctx, otherState: newOtherINA }, `${ctx.cardMap.get(cnINA)?.CardName ?? cnINA}縺ｮ閭ｽ蜉帙ｒ辟｡蜉ｹ蛹冒));
  }
  // === 繝舌ャ繝・1: 繝・ャ繧ｭ/繧ｨ繝・繝峨Ο繝ｼ邉ｻ ===
  // RESONANCE_COST_CARDS_TO_ENERGY: 繝ｬ繧ｾ繝翫さ繧ｹ繝医き繝ｼ繝峨ｒ繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ
  if (stub.id === 'RESONANCE_COST_CARDS_TO_ENERGY') {
    const cardsRCCTE = ctx.lastProcessedCards ?? [];
    if (cardsRCCTE.length === 0) return done(addLog(ctx, '繝ｬ繧ｾ繝翫さ繧ｹ繝医き繝ｼ繝峨↑縺・));
    const newSRCCTE: PlayerState = {
      ...ctx.ownerState,
      energy: [...ctx.ownerState.energy, ...cardsRCCTE],
      trash: ctx.ownerState.trash.filter(c => !cardsRCCTE.includes(c)),
    };
    return done(addLog({ ...ctx, ownerState: newSRCCTE }, `繝ｬ繧ｾ繝翫さ繧ｹ繝・{cardsRCCTE.length}譫壺・繧ｨ繝翫だ繝ｼ繝ｳ縺ｸ`));
  }
  // ENERGY_TO_TRASH: 閾ｪ蛻・・繧ｨ繝翫だ繝ｼ繝ｳ縺ｮ譛ｫ蟆ｾ繧ｫ繝ｼ繝俄・繝医Λ繝・す繝･
  if (stub.id === 'ENERGY_TO_TRASH') {
    const sETT = ctx.ownerState;
    if (sETT.energy.length === 0) return done(addLog(ctx, '繧ｨ繝翫だ繝ｼ繝ｳ縺ｪ縺・));
    const lastEnaETT = sETT.energy.at(-1)!;
    const newSETT: PlayerState = {
      ...sETT,
      energy: sETT.energy.slice(0, -1),
      trash: [...sETT.trash, lastEnaETT],
    };
    return done(addLog({ ...ctx, ownerState: newSETT }, `${ctx.cardMap.get(lastEnaETT)?.CardName ?? lastEnaETT}繧偵お繝岩・繝医Λ繝・す繝･`));
  }
  // EACH_PLAYER_DRAW_DISCARD 縺ｯ荳贋ｽ阪ワ繝ｳ繝峨Λ・・ine 1031・峨〒蜃ｦ逅・ｸ医∩
  // DRAW_DISCARD_COUNT_PLUS_N: N譫壼ｼ輔＞縺ｦM譫壽昏縺ｦ繧・  if (stub.id === 'DRAW_DISCARD_COUNT_PLUS_N') {
    const toHWDDCPN = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcDDCPN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDDCPN = srcDDCPN ? (srcDDCPN.EffectText ?? '') + ' ' + (srcDDCPN.BurstText ?? '') : '';
    const mDrawDDCPN = txtDDCPN.match(/([・・・兔d]+)譫壼ｼ輔￥/);
    const mDiscDDCPN = txtDDCPN.match(/([・・・兔d]+)譫壽昏縺ｦ繧・);
    const drawNDDCPN = mDrawDDCPN ? parseInt(toHWDDCPN(mDrawDDCPN[1] ?? '1')) : 1;
    const discNDDCPN = mDiscDDCPN ? parseInt(toHWDDCPN(mDiscDDCPN[1] ?? '1')) : 1;
    let sDDCPN = ctx.ownerState;
    const canDrawDDCPN = Math.min(drawNDDCPN, sDDCPN.deck.length);
    sDDCPN = { ...sDDCPN, hand: [...sDDCPN.hand, ...sDDCPN.deck.slice(0, canDrawDDCPN)], deck: sDDCPN.deck.slice(canDrawDDCPN) };
    const newCtxDDCPN = { ...ctx, ownerState: sDDCPN };
    if (discNDDCPN > 0 && sDDCPN.hand.length > 0) {
      const thenDDCPN: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
      return needsInteraction(addLog(newCtxDDCPN, `${drawNDDCPN}譫壹ラ繝ｭ繝ｼ竊・{discNDDCPN}譫壽昏縺ｦ驕ｸ謚杼), {
        type: 'SELECT_TARGET',
        candidates: sDDCPN.hand,
        count: Math.min(discNDDCPN, sDDCPN.hand.length),
        optional: false,
        targetScope: 'self_hand',
        thenAction: thenDDCPN as EffectAction,
      });
    }
    return done(addLog(newCtxDDCPN, `${drawNDDCPN}譫壹ラ繝ｭ繝ｼ`));
  }
  // PLACE_LIMIT_UPPER: 繝ｫ繝ｪ繧ｰ繝ｪ繝溘ャ繝井ｸ企剞繧・1
  if (stub.id === 'PLACE_LIMIT_UPPER') {
    const newSPLU: PlayerState = { ...ctx.ownerState, lrig_limit_mod: (ctx.ownerState.lrig_limit_mod ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newSPLU }, '繝ｪ繝溘ャ繝井ｸ企剞+1'));
  }
  // LOOK_DECK_BOTTOM: 繝・ャ繧ｭ荳九ｒ1譫夂｢ｺ隱・  if (stub.id === 'LOOK_DECK_BOTTOM') {
    const sLDB = ctx.ownerState;
    if (sLDB.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const bottomLDB = sLDB.deck.at(-1)!;
    return needsInteraction(ctx, {
      type: 'LOOK_AND_REORDER',
      cards: [bottomLDB],
      canTrash: false,
      destLocation: 'deck',
      destOwner: 'self',
      destPosition: 'bottom',
    });
  }
  // LOOK_TOP_BOTTOM: 繝・ャ繧ｭ荳・譫壹→繝・ャ繧ｭ荳・譫壹ｒ遒ｺ隱・  if (stub.id === 'LOOK_TOP_BOTTOM') {
    const sLTB = ctx.ownerState;
    if (sLTB.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const topLTB = sLTB.deck[0];
    const bottomLTB = sLTB.deck.at(-1)!;
    const cardsLTB = sLTB.deck.length === 1 ? [topLTB] : [topLTB, bottomLTB];
    return needsInteraction(ctx, {
      type: 'LOOK_AND_REORDER',
      cards: cardsLTB,
      canTrash: false,
      destLocation: 'deck',
      destOwner: 'self',
      destPosition: 'any',
    });
  }
  // LOOK_TOP_OPP_CHOOSE_TRASH: 繝・ャ繧ｭ荳劾譫壹ｒ蜈ｬ髢九＠逶ｸ謇九′1譫夐∈繧薙〒繝医Λ繝・す繝･
  if (stub.id === 'LOOK_TOP_OPP_CHOOSE_TRASH') {
    const toHWLTOCT = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcLTOCT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTOCT = srcLTOCT ? (srcLTOCT.EffectText ?? '') + ' ' + (srcLTOCT.BurstText ?? '') : '';
    const mLTOCT = txtLTOCT.match(/荳翫°繧・[・・・兔d]+)譫・);
    const nLTOCT = mLTOCT ? parseInt(toHWLTOCT(mLTOCT[1])) : 3;
    const sLTOCT = ctx.ownerState;
    if (sLTOCT.deck.length === 0) return done(addLog(ctx, '繝・ャ繧ｭ縺ｪ縺・));
    const visLTOCT = sLTOCT.deck.slice(0, Math.min(nLTOCT, sLTOCT.deck.length));
    const thenLTOCT: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
    return needsInteraction(addLog(ctx, `繝・ャ繧ｭ荳・{visLTOCT.length}譫壼・髢義), {
      type: 'SELECT_TARGET',
      candidates: visLTOCT,
      count: 1,
      optional: false,
      targetScope: 'self_hand' as TargetScope,
      thenAction: thenLTOCT as EffectAction,
      opponentResponds: true,
    });
  }
  // ALL_PLAYER_MILL: 蜷・・繝ｬ繧､繝､繝ｼ縺後ョ繝・く荳劾譫壹ｒ繝医Λ繝・す繝･
  if (stub.id === 'ALL_PLAYER_MILL') {
    const srcAPM = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtAPM = srcAPM ? (srcAPM.EffectText ?? '') + ' ' + (srcAPM.BurstText ?? '') : '';
    const toHWAPM = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mAPM = txtAPM.match(/繝・ャ繧ｭ縺ｮ荳翫°繧峨き繝ｼ繝峨ｒ([・・・兔d]+)譫壹ヨ繝ｩ繝・す繝･縺ｫ鄂ｮ縺・) ||
                 txtAPM.match(/繝・ャ繧ｭ縺ｮ荳翫°繧・[・・・兔d]+)譫・*繝医Λ繝・す繝･/);
    const cntAPM = mAPM ? parseInt(toHWAPM(mAPM[1])) : 1;
    const selfMillAPM = ctx.ownerState.deck.slice(0, Math.min(cntAPM, ctx.ownerState.deck.length));
    const oppMillAPM  = ctx.otherState.deck.slice(0, Math.min(cntAPM, ctx.otherState.deck.length));
    const newOwnerAPM: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(selfMillAPM.length), trash: [...ctx.ownerState.trash, ...selfMillAPM] };
    const newOtherAPM: PlayerState = { ...ctx.otherState, deck: ctx.otherState.deck.slice(oppMillAPM.length),  trash: [...ctx.otherState.trash,  ...oppMillAPM]  };
    return done(addLog({ ...ctx, ownerState: newOwnerAPM, otherState: newOtherAPM },
      `蜷・・繝ｬ繧､繝､繝ｼ繝・ャ繧ｭ荳・{cntAPM}譫壹ヨ繝ｩ繝・す繝･`));
  }
  // SUPPRESS_OPP_SIGNI_ABILITIES: 逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨・蜈ｨ繧ｷ繧ｰ繝九・閭ｽ蜉帙ｒ豸亥悉
  if (stub.id === 'SUPPRESS_OPP_SIGNI_ABILITIES') {
    const oppTopsSOS = ctx.otherState.field.signi
      .map(s => s?.at(-1))
      .filter((n): n is string => !!n && !(ctx.otherProtectedSigniNums ?? []).includes(n));
    const newRemovedSOS = [...new Set([...(ctx.otherState.abilities_removed ?? []), ...oppTopsSOS])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, abilities_removed: newRemovedSOS } },
      '逶ｸ謇九ヵ繧｣繝ｼ繝ｫ繝峨・蜈ｨ繧ｷ繧ｰ繝九・閭ｽ蜉帙ｒ豸亥悉'));
  }
  // END_ATTACK_IF_EXTRA_TURN: 霑ｽ蜉繧ｿ繝ｼ繝ｳ縺ｪ繧峨い繧ｿ繝・け繝輔ぉ繧､繧ｺ繧堤ｵゆｺ・ｼ・TTACK_SIGNI/LRIG蟆√§・・  if (stub.id === 'END_ATTACK_IF_EXTRA_TURN') {
    if (!ctx.ownerState.extra_turn) return done(addLog(ctx, '霑ｽ蜉繧ｿ繝ｼ繝ｳ縺ｧ縺ｪ縺・竊・繧ｹ繧ｭ繝・・'));
    const newBlockedEAIET = [...new Set([...(ctx.ownerState.blocked_actions ?? []), 'ATTACK_SIGNI', 'ATTACK_LRIG'])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, blocked_actions: newBlockedEAIET } },
      '霑ｽ蜉繧ｿ繝ｼ繝ｳ荳ｭ縺ｮ繧｢繧ｿ繝・け繧貞・蟆√§・医い繧ｿ繝・け繝輔ぉ繧､繧ｺ邨ゆｺ・ｼ・));
  }
  // BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN: 逶ｸ謇九ち繝ｼ繝ｳ荳ｭ縲∫嶌謇九・繧ｷ繧ｰ繝九ｒ驟咲ｽｮ縺ｧ縺阪↑縺・  if (stub.id === 'BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN') {
    const newBlockedBOSP = [...(ctx.otherState.blocked_actions ?? []), 'PLACE_SIGNI'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBOSP } },
      '逶ｸ謇九・繧ｷ繧ｰ繝九ｒ驟咲ｽｮ縺ｧ縺阪↑縺・));
  }
  // PREVENT_OPP_UPKEEP: 逶ｸ謇九・繧｢繝・・繧ｭ繝ｼ繝暦ｼ医い繝・・・峨ｒ髦ｲ縺・  if (stub.id === 'PREVENT_OPP_UPKEEP') {
    const newBlockedPOU = [...(ctx.otherState.blocked_actions ?? []), 'UPKEEP'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedPOU } },
      '逶ｸ謇九・繧｢繝・・繧ｭ繝ｼ繝励〒縺阪↑縺・));
  }
  // DRAW_IF_OPP_DISCARDED_HAND: 逶ｸ謇九′謇区惆繧呈昏縺ｦ縺溘→縺阪ラ繝ｭ繝ｼ・医ヨ繝ｪ繧ｬ繝ｼ邉ｻ繝ｻ繝ｭ繧ｰ縺ｮ縺ｿ・・  if (stub.id === 'DRAW_IF_OPP_DISCARDED_HAND') {
    return done(addLog(ctx, '[逶ｸ謇区焔譛ｭ謐ｨ縺ｦ譎ゅラ繝ｭ繝ｼ繝医Μ繧ｬ繝ｼ: BattleScreen蛛ｴ譛ｪ螳溯｣・'));
  }
  // OPTIONAL_DISCARD_GUARD: 謇区惆繧呈昏縺ｦ縺ｦ繧ｬ繝ｼ繝会ｼ井ｻｻ諢擾ｼ・  if (stub.id === 'OPTIONAL_DISCARD_GUARD') {
    return done(addLog(ctx, '[莉ｻ諢乗昏縺ｦ繧ｬ繝ｼ繝・ 繧ｬ繝ｼ繝峨す繧ｹ繝・Β蛛ｴ譛ｪ螳溯｣・'));
  }
  // ADJACENT_SIGNI_POWER_MOD: 縺薙・繧ｷ繧ｰ繝九→髫｣謗･縺吶ｋ繧ｷ繧ｰ繝区怙螟ｧ2菴薙・繝代Ρ繝ｼ繧剃ｿｮ豁｣
  if (stub.id === 'ADJACENT_SIGNI_POWER_MOD') {
    const zoneIdxADJ = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    if (zoneIdxADJ === -1) return done(addLog(ctx, 'ADJACENT_SIGNI_POWER_MOD: 繧ｾ繝ｼ繝ｳ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ'));
    const adjNumsADJ: string[] = [];
    if (zoneIdxADJ > 0) {
      const adj = ctx.ownerState.field.signi[zoneIdxADJ - 1]?.at(-1);
      if (adj) adjNumsADJ.push(adj);
    }
    if (zoneIdxADJ < 2) {
      const adj = ctx.ownerState.field.signi[zoneIdxADJ + 1]?.at(-1);
      if (adj) adjNumsADJ.push(adj);
    }
    if (adjNumsADJ.length === 0) return done(addLog(ctx, '髫｣謗･繧ｷ繧ｰ繝九↑縺暦ｼ・DJACENT_SIGNI_POWER_MOD・・));
    // delta繧偵き繝ｼ繝峨ユ繧ｭ繧ｹ繝医°繧牙叙蠕暦ｼ域悴險倩ｿｰ縺ｪ繧・3000繝・ヵ繧ｩ繝ｫ繝茨ｼ・    const srcADJ = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtADJ = srcADJ ? (srcADJ.EffectText ?? '') : '';
    const toHWADJ = (s: string) => s.replace(/[・・・兢/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mADJ = txtADJ.match(/[・・]([・・・兔d]+)/);
    const deltaADJ = mADJ ? parseInt(toHWADJ(mADJ[1])) : 3000;
    const modsADJ = [
      ...(ctx.ownerState.temp_power_mods ?? []),
      ...adjNumsADJ.map(cn => ({ cardNum: cn, delta: deltaADJ })),
    ];
    const newOwnerADJ = { ...ctx.ownerState, temp_power_mods: modsADJ };
    return done(addLog({ ...ctx, ownerState: newOwnerADJ }, `髫｣謗･${adjNumsADJ.length}菴薙ヱ繝ｯ繝ｼ+${deltaADJ}`));
  }

  return done(addLog(ctx, `[STUB: ${stub.id}]`));
}
}

