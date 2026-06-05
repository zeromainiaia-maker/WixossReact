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
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン、次のダメージを1回無効'));
  }
  if (stub.id === 'NEGATE_ATTACK_ON_TRIGGER') {
    // 発動中のアタックを無効化: prevent_next_damage と同様のフラグで近似
    const newOwner = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'アタックを無効にする'));
  }
  // ゲームプレイに影響しない説明テキストは無音でスキップ
  if (stub.id === 'RULE_REMINDER_TEXT' || stub.id === 'USE_CONDITION_TEXT') {
    return done(ctx);
  }
  // OPTIONAL_COST: 任意コスト（effectExecutorのSEQUENCEインターセプト対象外のエッジケース）
  // 主な338件はeffectExecutor.tsがSTUB→CONDITIONAL(IS_MY_TURN)パターンを処理済み
  // ここはSEQUENCE末尾や非IS_MY_TURNパターンの33件ほどを担当
  if (stub.id === 'OPTIONAL_COST') {
    const costColorsOC = stub.costColors ?? [];
    const canAffordOC = costColorsOC.length === 0 || canPayOptionalCost(costColorsOC, ctx.ownerState, ctx.cardMap);
    const payLabelOC = costColorsOC.length > 0
      ? `発動する（${costColorsOC.map(c => `《${c}》`).join('')}）`
      : '発動する';
    const noopOC: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, '任意コスト：発動しますか？'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'pay',  label: payLabelOC, action: noopOC as EffectAction, available: canAffordOC,
          ...(costColorsOC.length ? { costColors: costColorsOC } : {}) },
        { id: 'skip', label: 'スキップ',  action: noopOC as EffectAction, available: true },
      ],
    });
  }
  // 他の任意コスト系（SEQUENCEパターン外のフォールバック）
  if (stub.id === 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST' || stub.id === 'OPTIONAL_TRASH_ENERGY_CLASS') {
    return done(addLog(ctx, `任意コスト（${stub.id}：後続ステップで処理）`));
  }
  // 対戦相手任意コスト（相手にCHOOSEを提示し、支払うとフラグを立てる）
  if (stub.id === 'OPPONENT_PAY_OPTIONAL') {
    const costLen = stub.costColors?.length ?? 0;
    if (costLen === 0 || ctx.otherState.energy.length < costLen) {
      const newOwner = { ...ctx.ownerState, opponent_paid_optional_cost: false };
      return done(addLog({ ...ctx, ownerState: newOwner }, `対戦相手任意コスト：支払不可（${costLen}無色不足）`));
    }
    const payAction: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_PAY_COST', value: costLen };
    const skipAction: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_SKIP_COST' };
    const opts = [
      { id: 'pay',  label: `支払う（無×${costLen}）`, action: payAction  as EffectAction, available: true },
      { id: 'skip', label: '支払わない',               action: skipAction as EffectAction, available: true },
    ];
    return needsInteraction(addLog(ctx, `対戦相手：《無×${costLen}》を支払いますか？`), {
      type: 'CHOOSE', options: opts, count: 1, opponentResponds: true,
    });
  }
  if (stub.id === 'INTERNAL_OPP_PAY_COST') {
    const costLen = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const newOther = { ...ctx.otherState, energy: ctx.otherState.energy.slice(costLen) };
    const newOwner = { ...ctx.ownerState, opponent_paid_optional_cost: true };
    return done(addLog({ ...ctx, ownerState: newOwner, otherState: newOther },
      `対戦相手が《無×${costLen}》を支払った（結果効果スキップ）`));
  }
  if (stub.id === 'INTERNAL_OPP_SKIP_COST') {
    const newOwner = { ...ctx.ownerState, opponent_paid_optional_cost: false };
    return done(addLog({ ...ctx, ownerState: newOwner }, '対戦相手が支払わない→結果効果発動'));
  }
  // アーツコスト軽減マーカー（コストはBattleScreen使用時に算出済み）
  if (stub.id === 'ARTS_COST_REDUCTION_BY_EFFECT' || stub.id === 'ARTS_COST_REDUCTION_BY_CENTER_LRIG') {
    return done(ctx); // コストは支払い時点で計算済み、ここでは何もしない
  }
  // 数字宣言：現在はランダム値で代用
  if (stub.id === 'DECLARE_NUMBER') {
    // 宣言した数字をPlayerStateに保存するSETアクションを各選択肢に
    const setAction = (n: number): StubAction => ({
      type: 'STUB', id: 'SET_DECLARED_NUMBER', value: n,
    });
    const options = [1, 2, 3, 4, 5].map(n => ({
      id: `num_${n}`, label: `${n}を宣言`, action: setAction(n) as EffectAction, available: true,
    }));
    const pending: PendingInteractionDef = { type: 'CHOOSE', options, count: 1 };
    return needsInteraction(addLog(ctx, '数字を宣言してください（1〜5）'), pending);
  }
  // DECLARE_NUMBER の宣言値を PlayerState に格納
  if (stub.id === 'SET_DECLARED_NUMBER') {
    const val = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const newOwner = { ...ctx.ownerState, declared_guard_restrict_level: val };
    return done(addLog({ ...ctx, ownerState: newOwner }, `数字「${val}」を宣言（相手はLv${val}シグニでガード不可）`));
  }
  // カード名宣言（手札のカード名から選択）
  if (stub.id === 'DECLARE_CARD_NAME') {
    const handNames = [...new Set(
      ctx.ownerState.hand.map(cn => ctx.cardMap.get(cn)?.CardName).filter(Boolean) as string[]
    )];
    if (handNames.length === 0) {
      const newOwnerDCN = { ...ctx.ownerState, declared_card_name: 'シグニ' };
      return done(addLog({ ...ctx, ownerState: newOwnerDCN }, '「シグニ」を宣言（手札なし）'));
    }
    const optsDCN = handNames.slice(0, 4).map(name => ({
      id: 'name_' + name,
      label: name,
      action: ({ type: 'STUB', id: 'INTERNAL_DECLARE_CARD_NAME', value: name } as StubAction) as EffectAction,
      available: true,
    }));
    const pendingDCN: PendingInteractionDef = { type: 'CHOOSE', options: optsDCN, count: 1 };
    return needsInteraction(addLog(ctx, 'カード名を宣言（手札のカード名から選択）'), pendingDCN);
  }
  if (stub.id === 'INTERNAL_DECLARE_CARD_NAME') {
    const nameDCN = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const newOwnerIDCN = { ...ctx.ownerState, declared_card_name: nameDCN };
    return done(addLog({ ...ctx, ownerState: newOwnerIDCN }, `「${nameDCN}」を宣言`));
  }
  // シグニの下にカードを置く
  if (stub.id === 'PLACE_CARD_UNDER_SIGNI' || stub.id === 'STACK_SIGNI_UNDER') {
    const srcPCUS = ctx.sourceCardNum;
    const effPCUS = srcPCUS ? ctx.cardMap.get(srcPCUS) : undefined;
    const txtPCUS = effPCUS ? (effPCUS.EffectText ?? '') + ' ' + (effPCUS.BurstText ?? '') : '';
    // 「このシグニを他のシグニの下に置く」パターン
    if (txtPCUS.match(/このシグニを.+の下に置く/) && srcPCUS) {
      const srcZonePCUS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcPCUS);
      if (srcZonePCUS < 0) return done(addLog(ctx, 'このシグニが場にいない'));
      const candidatesPCUS = [0, 1, 2]
        .filter(zi => zi !== srcZonePCUS && ctx.ownerState.field.signi[zi]?.length)
        .map(zi => ctx.ownerState.field.signi[zi]!.at(-1)!)
        .filter(Boolean);
      if (candidatesPCUS.length === 0) return done(addLog(ctx, '配置先シグニなし'));
      const placeUnderStub: StubAction = { type: 'STUB', id: 'INTERNAL_PLACE_SELF_UNDER_SIGNI' };
      return selectOrInteract(candidatesPCUS, 1, false, 'self_field', placeUnderStub, undefined, ctx);
    }
    // 「トラッシュからカードをこのシグニの下に置く」パターン（lastProcessedCardsを使用）
    if (ctx.lastProcessedCards && ctx.lastProcessedCards.length > 0 && srcPCUS) {
      const targetZonePCUS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcPCUS);
      if (targetZonePCUS < 0) return done(addLog(ctx, 'このシグニが場にいない'));
      const newSigniPCUS = [...ctx.ownerState.field.signi] as (string[] | null)[];
      const currentStackPCUS = newSigniPCUS[targetZonePCUS] ?? [];
      newSigniPCUS[targetZonePCUS] = [...ctx.lastProcessedCards, ...currentStackPCUS];
      const newOwnerPCUS: PlayerState = {
        ...ctx.ownerState,
        trash: ctx.ownerState.trash.filter(cn => !ctx.lastProcessedCards!.includes(cn)),
        field: { ...ctx.ownerState.field, signi: newSigniPCUS },
      };
      return done(addLog({ ...ctx, ownerState: newOwnerPCUS },
        `${ctx.lastProcessedCards.length}枚を${effPCUS?.CardName ?? srcPCUS}の下に配置`));
    }
    return done(addLog(ctx, 'カードをシグニの下に置く（スキップ）'));
  }
  // INTERNAL_PLACE_SELF_UNDER_SIGNI: 自シグニを選択シグニのスタック下に移動
  if (stub.id === 'INTERNAL_PLACE_SELF_UNDER_SIGNI') {
    const targetCnIPSUS = ctx.lastProcessedCards?.[0];
    const srcCnIPSUS = ctx.sourceCardNum;
    if (!targetCnIPSUS || !srcCnIPSUS) return done(addLog(ctx, '対象なし'));
    const srcZoneIPSUS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcCnIPSUS);
    const targetZoneIPSUS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === targetCnIPSUS);
    if (srcZoneIPSUS < 0 || targetZoneIPSUS < 0) return done(addLog(ctx, 'ゾーン特定不可'));
    const newSigniIPSUS = [...ctx.ownerState.field.signi] as (string[] | null)[];
    // sourceCardNumを元ゾーンから削除（スタックの最後だけ取り出す）
    const srcStackIPSUS = newSigniIPSUS[srcZoneIPSUS] ?? [];
    newSigniIPSUS[srcZoneIPSUS] = srcStackIPSUS.length > 1 ? srcStackIPSUS.slice(0, -1) : null;
    // targetゾーンのスタック最下部に追加
    newSigniIPSUS[targetZoneIPSUS] = [srcCnIPSUS, ...(newSigniIPSUS[targetZoneIPSUS] ?? [])];
    const newOwnerIPSUS: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniIPSUS } };
    return done(addLog({ ...ctx, ownerState: newOwnerIPSUS },
      `${ctx.cardMap.get(srcCnIPSUS)?.CardName ?? srcCnIPSUS}を${ctx.cardMap.get(targetCnIPSUS)?.CardName ?? targetCnIPSUS}の下に配置`));
  }
  // 覚醒メカニクス（ルリグ変身）
  if (stub.id === 'AWAKEN') {
    return done(addLog(ctx, '【覚醒】発動（BattleScreen側処理）'));
  }
  // PLACE_REV_SIGNI: REVメカニクス（ライフクロス1枚以下時に指定シグニを場に出す）
  // PR-Di017A「白熱する黒白」のREV変身効果
  if (stub.id === 'PLACE_REV_SIGNI') {
    const revCardNum = typeof stub.value === 'string' ? stub.value : null;
    if (!revCardNum) return done(addLog(ctx, 'PLACE_REV_SIGNI: カード番号なし'));
    if (ctx.ownerState.life_cloth.length > 1) {
      return done(addLog(ctx, `ライフクロス${ctx.ownerState.life_cloth.length}枚（REV条件不成立）`));
    }
    // 空きゾーンを探してREVシグニを配置
    const emptyZone = ctx.ownerState.field.signi.findIndex(s => !s || s.length === 0);
    if (emptyZone < 0) return done(addLog(ctx, `${revCardNum}を場に出す空きゾーンなし`));
    const newSigniPRV = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniPRV[emptyZone] = [revCardNum];
    const newOwnerPRV: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniPRV } };
    return done(addLog({ ...ctx, ownerState: newOwnerPRV }, `≪REV:アンコーリング≫(${revCardNum})を場に出した`));
  }
  // ACCE_BANISH_SUBSTITUTE: アクセクラフトによる場離れ代替（オンタマ等）
  // アクセされているシグニが場を離れる場合、代わりにこのアクセをゲームから除外してシグニをダウン
  if (stub.id === 'ACCE_BANISH_SUBSTITUTE') {
    return done(addLog(ctx, 'アクセ代替バニッシュ（BattleScreen側処理）'));
  }
  // BET_MECHANIC: コインを消費してベット→強化選択（①②③④から2つ、ベット時4つ）
  if (stub.id === 'BET_MECHANIC') {
    const srcBET = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtBET = srcBET ? (srcBET.EffectText ?? '') + ' ' + (srcBET.BurstText ?? '') : '';
    const toHWBET = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // ①②③④ 選択肢を解析
    const choicePatsBET = [
      { m: /①([^②③④]+)/, idx: 0 }, { m: /②([^③④⑤]+)/, idx: 1 },
      { m: /③([^④⑤]+)/, idx: 2 }, { m: /④([^⑤]+)/, idx: 3 },
    ];
    const parseChoiceBET = (txt: string): Array<{ id: string; label: string; action: EffectAction; available: boolean }> => {
      const opts: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
      for (const { m, idx } of choicePatsBET) {
        const mat = txt.match(m);
        if (!mat) continue;
        const ctxt = mat[1].replace(/。\s*$/, '').trim();
        let act: EffectAction | null = null;
        if (ctxt.match(/カードを[１1]枚引く/)) act = { type: 'DRAW', count: 1 } as DrawAction;
        if (!act && ctxt.match(/手札を[１1]枚捨てる/)) act = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as TrashAction;
        if (!act && ctxt.match(/対戦相手のシグニ.*手札に戻す/)) act = { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BounceAction;
        const pwBET = !act && ctxt.match(/パワーを([－-][０-９\d]+)する/);
        if (pwBET) act = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_OPP_ONE', value: parseInt(toHWBET(pwBET[1]).replace('－','-')) } as StubAction) as EffectAction;
        if (!act && ctxt.match(/対戦相手は手札を[１1]枚捨てる/)) act = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as TrashAction;
        if (!act && ctxt.match(/ダウンする/)) act = { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as DownAction;
        if (act) opts.push({ id: `bet_c${idx}`, label: `${'①②③④'[idx]}${ctxt.slice(0, 18)}...`, action: act, available: true });
      }
      return opts;
    };
    const optsBET = parseChoiceBET(txtBET);
    if (optsBET.length === 0) return done(addLog(ctx, 'ベット（選択肢解析不可）'));
    // COIN_USE_RESTRICTION: コインをスペルとシグニにしか使えない場合、アーツBETは不可
    const coinRestricted = ctx.ownerState.coin_use_restriction === 'spell_signi_only';
    const hasCoins = ctx.ownerState.coins > 0 && !coinRestricted;
    // コインがある場合はベット選択を提示
    if (hasCoins) {
      const noopBET: SequenceAction = { type: 'SEQUENCE', steps: [] };
      const betYesOpt = { id: 'bet_yes', label: `ベットする（コイン消費・4択）`, action: ({ type: 'STUB', id: 'INTERNAL_BET_SHOW_4', value: txtBET } as StubAction) as EffectAction, available: true };
      const betNoOpt = { id: 'bet_no', label: 'ベットしない（2択）', action: noopBET as EffectAction, available: true };
      const pendingBetQ: PendingInteractionDef = {
        type: 'CHOOSE', options: [betYesOpt, betNoOpt], count: 1,
        continuation: optsBET.length > 0 ? ({ type: 'CHOOSE', options: optsBET, count: Math.min(2, optsBET.length) } as unknown as EffectAction) : undefined,
      };
      return needsInteraction(addLog(ctx, 'ベットしますか？（コインを消費して4択→強化）'), pendingBetQ);
    }
    // コインなし：通常2択
    return needsInteraction(addLog(ctx, 'ベット（コインなし）→2択'), {
      type: 'CHOOSE', options: optsBET, count: Math.min(2, optsBET.length),
    });
  }
  // INTERNAL_BET_SHOW_4: ベット時に4択を表示
  if (stub.id === 'INTERNAL_BET_SHOW_4') {
    const txtIBET = typeof stub.value === 'string' ? stub.value : '';
    const toHWIBET = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const choicePatsIBET = [
      { m: /①([^②③④]+)/, idx: 0 }, { m: /②([^③④⑤]+)/, idx: 1 },
      { m: /③([^④⑤]+)/, idx: 2 }, { m: /④([^⑤]+)/, idx: 3 },
    ];
    const optsIBET: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of choicePatsIBET) {
      const mat = txtIBET.match(m);
      if (!mat) continue;
      const ctxt = mat[1].replace(/。\s*$/, '').trim();
      let act: EffectAction | null = null;
      if (ctxt.match(/カードを[１1]枚引く/)) act = { type: 'DRAW', count: 1 } as DrawAction;
      if (!act && ctxt.match(/対戦相手のシグニ.*手札に戻す/)) act = { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BounceAction;
      const pwIBET = !act && ctxt.match(/パワーを([－-][０-９\d]+)する/);
      if (pwIBET) act = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_OPP_ONE', value: parseInt(toHWIBET(pwIBET[1]).replace('－','-')) } as StubAction) as EffectAction;
      if (!act && ctxt.match(/手札を[１1]枚捨てる|対戦相手は手札を[１1]枚捨てる/)) act = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as TrashAction;
      if (!act && ctxt.match(/ダウンする/)) act = { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as DownAction;
      if (act) optsIBET.push({ id: `ibet_c${idx}`, label: `${'①②③④'[idx]}${ctxt.slice(0,18)}...`, action: act, available: true });
    }
    // コインを1枚消費
    const newOwnerIBET = { ...ctx.ownerState, coins: Math.max(0, ctx.ownerState.coins - 1) };
    if (optsIBET.length === 0) return done(addLog({ ...ctx, ownerState: newOwnerIBET }, 'ベット4択（解析不可）'));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerIBET }, `ベット！コイン消費→4択`), {
      type: 'CHOOSE', options: optsIBET, count: Math.min(4, optsIBET.length),
    });
  }
  // BET_ALTERNATIVE: ベット強化済みなのでスキップ（BET_MECHANICで処理済み）
  if (stub.id === 'BET_ALTERNATIVE' || stub.id === 'BET_CONDITION') {
    return done(addLog(ctx, 'ベット強化（BET_MECHANICで処理済み）'));
  }
  // GRANT_QUOTED_ACTIVATE_ABILITY: 「【起】...」付与（effectEngineのCONTINUOUS処理で対応）
  // WXK08-078: GRANT_SIGNI_ABOVE_ABILITY+POWER_MINUS_PER_OWN_LEVELに変換済み（collectGrantedFromUnderSigni）
  // WX13-058: effects.jsonでDOUBLE_OWN_POWER_MINUS+HAS_CARD_IN_FIELD条件に変換済み
  if (stub.id === 'GRANT_QUOTED_ACTIVATE_ABILITY') {
    const srcGQAA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGQAA = srcGQAA ? (srcGQAA.EffectText ?? '') : '';
    const quotedActM = txtGQAA.match(/「(【起】[^」]{1,30})/);
    return done(addLog(ctx, `[GRANT_QUOTED_ACTIVATE_ABILITY: ${quotedActM?.[1] ?? '起動能力'}付与（effectEngineで処理）]`));
  }
  // 引用符付き能力付与（キーワード → keyword_grants、複合能力 → granted_effects）
  if (stub.id === 'GRANT_QUOTED_AUTO_ABILITY' || stub.id === 'GRANT_QUOTED_ABILITY' ||
      stub.id === 'GRANT_ABILITY_INNER_TEXT') {
    const srcGQ = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGQ = srcGQ ? (srcGQ.EffectText ?? '') + ' ' + (srcGQ.BurstText ?? '') : '';
    // 付与するキーワードを抽出（ランサー、ダブルクラッシュ等）
    const knownKeywords = ['Sランサー', 'ランサー', 'ダブルクラッシュ', '貫通', 'マルチエナ', 'アサシン', 'バニッシュ無効', 'ライフバースト無効', '影', 'チャーム', 'シャドウ', 'ガードアイコン', 'アタックできない', 'フリーズ', 'ドライブ'];
    // 引用符内のテキストを抽出
    const quotedM = txtGQ.match(/「([^」]+)」(?:の能力)?(?:を得る|として扱う)/) ?? txtGQ.match(/【([^】]+)】を得る/);
    const quotedText = quotedM ? quotedM[1] : '';
    const grantedKws = knownKeywords.filter(kw => quotedText.includes(kw) || txtGQ.match(new RegExp(`【${kw}】を得`)));
    // 対象シグニを決定（SELECT_TARGET後はlastProcessedCards、「このシグニ」→sourceCardNum、全体→全自シグニ）
    const allM = txtGQ.match(/あなたのシグニすべては|あなたの場にあるすべてのシグニ/);
    const targetCardNums: string[] = ctx.lastProcessedCards && ctx.lastProcessedCards.length > 0
      ? ctx.lastProcessedCards
      : allM
        ? ctx.ownerState.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : [])
        : (ctx.sourceCardNum ? [ctx.sourceCardNum] : []);

    // シンプルキーワード付与
    if (grantedKws.length > 0 && targetCardNums.length > 0) {
      const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
      for (const cn of targetCardNums) {
        grants[cn] = [...new Set([...(grants[cn] ?? []), ...grantedKws])];
      }
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grants } },
        `${grantedKws.join('・')}を付与（${targetCardNums.length}体）`));
    }

    // 既知のCONTINUOUS能力パターンを granted_effects に格納
    if (targetCardNums.length > 0 && quotedText) {
      // 「対戦相手のシグニの効果を受けない」→ GRANT_PROTECTION (CONTINUOUS)
      if (quotedText.includes('対戦相手のシグニの効果を受けない')) {
        const grantedEff: import('../types/effects').CardEffect = {
          effectId: `granted-signi-protect-${Date.now()}`,
          effectType: 'CONTINUOUS',
          duration: 'UNTIL_END_OF_TURN',
          action: {
            type: 'GRANT_PROTECTION',
            from: ['シグニ'],
            sourceOwner: 'opponent',
            duration: 'UNTIL_END_OF_TURN',
          } as import('../types/effects').GrantProtectionAction,
        };
        const grantedMap = { ...(ctx.ownerState.granted_effects ?? {}) };
        for (const cn of targetCardNums) {
          grantedMap[cn] = [...(grantedMap[cn] ?? []), grantedEff];
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, granted_effects: grantedMap } },
          `相手シグニ効果耐性を付与（${targetCardNums.length}体）`));
      }
      // 「対戦相手の効果を受けない」（シグニ・スペル・アーツすべて）
      if (quotedText.match(/対戦相手の(?:カードの)?効果を受けない/)) {
        const grantedEff: import('../types/effects').CardEffect = {
          effectId: `granted-all-protect-${Date.now()}`,
          effectType: 'CONTINUOUS',
          duration: 'UNTIL_END_OF_TURN',
          action: {
            type: 'GRANT_PROTECTION',
            from: ['シグニ', 'スペル', 'アーツ'],
            sourceOwner: 'opponent',
            duration: 'UNTIL_END_OF_TURN',
          } as import('../types/effects').GrantProtectionAction,
        };
        const grantedMap = { ...(ctx.ownerState.granted_effects ?? {}) };
        for (const cn of targetCardNums) {
          grantedMap[cn] = [...(grantedMap[cn] ?? []), grantedEff];
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, granted_effects: grantedMap } },
          `相手効果耐性を付与（${targetCardNums.length}体）`));
      }
      // 「対戦相手の効果によってダウンしない」→ ダウン保護フラグ
      if (quotedText.match(/対戦相手の効果によってダウンしない/)) {
        const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
        for (const cn of targetCardNums) {
          grants[cn] = [...new Set([...(grants[cn] ?? []), '__down_protect__'])];
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grants } },
          `ダウン保護を付与（${targetCardNums.length}体）`));
      }
      // 「対戦相手の効果によって〜パワーは－されない」→ パワー弱体保護フラグ
      if (quotedText.match(/対戦相手の効果によって.{0,15}パワーは?[－-]/)) {
        const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
        for (const cn of targetCardNums) {
          grants[cn] = [...new Set([...(grants[cn] ?? []), '__power_minus_protect__'])];
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grants } },
          `パワー弱体保護を付与（${targetCardNums.length}体）`));
      }
      // 「対戦相手の効果によってダメージを受けない」→ prevent_lrig_damage（ルリグへの付与）
      if (quotedText.match(/対戦相手の効果によってダメージを受けない/)) {
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_lrig_damage: true } },
          '相手効果ダメージ保護を付与'));
      }
      // 「対戦相手の効果によって新たに能力を得られない」→ 能力取得禁止フラグ
      if (quotedText.match(/対戦相手の効果によって新たに能力を得られない/)) {
        const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
        for (const cn of targetCardNums) {
          grants[cn] = [...new Set([...(grants[cn] ?? []), '__ability_gain_block__'])];
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grants } },
          `能力取得禁止を付与（${targetCardNums.length}体）`));
      }
    }

    if (quotedText) return done(addLog(ctx, `能力付与：「${quotedText.slice(0, 20)}...」（ログのみ）`));
    return done(addLog(ctx, '能力を付与（effectEngine処理）'));
  }
  // ルリグデッキ下操作（多パターン）
  if (stub.id === 'LRIG_UNDER_CARD_OP') {
    const srcLrig = ctx.sourceCardNum;
    const effLrigTxt = srcLrig ? (ctx.cardMap.get(srcLrig)?.EffectText ?? '') + ' ' + (ctx.cardMap.get(srcLrig)?.BurstText ?? '') : '';
    // 「エナゾーンからシグニをデッキの一番上に置く」→ エナ→デッキ先頭
    if (effLrigTxt.match(/エナゾーンから.+シグニ.+デッキの一番上に置いてもよい/) && ctx.ownerState.energy.length > 0) {
      const signiInEnergy = ctx.ownerState.energy.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
      if (signiInEnergy.length > 0) {
        const picked = signiInEnergy[0];
        const newOwner = {
          ...ctx.ownerState,
          energy: ctx.ownerState.energy.filter(cn => cn !== picked),
          deck: [picked, ...ctx.ownerState.deck],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(picked)?.CardName ?? picked}をエナからデッキ上へ`));
      }
      return done(addLog(ctx, 'エナゾーンにシグニなし'));
    }
    // 「このシグニをエナゾーンに置く」→ フィールドからエナへ
    if ((effLrigTxt.match(/このシグニをエナゾーンに置いてもよい/) || effLrigTxt.match(/このシグニをエナゾーンに置く/)) && srcLrig) {
      const removed = removeFromField(srcLrig, ctx.ownerState);
      const newOwner = { ...removed, energy: [...removed.energy, srcLrig] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcLrig)?.CardName ?? srcLrig}をエナゾーンへ`));
    }
    // 「このシグニの下にあるすべてのカードをトラッシュに置く」パターン
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
            return done(addLog(setOwnerState(owner, newS, ctx), `シグニ下${underCards.length}枚をトラッシュへ`));
          }
        }
      }
    }
    return done(addLog(ctx, 'ルリグデッキ下のカード操作'));
  }
  // アンコールメカニクス（ルリグトラッシュのアーツをコストなしで使用）
  if (stub.id === 'ENCORE') {
    const artsEN = (ctx.ownerState.lrig_trash ?? [])
      .filter(cn => ctx.cardMap.get(cn)?.Type === 'アーツ');
    if (artsEN.length === 0) return done(addLog(ctx, 'アンコール：ルリグトラッシュにアーツなし'));
    const optsEN = artsEN.map(cn => ({
      id: cn,
      label: ctx.cardMap.get(cn)?.CardName ?? cn,
      action: ({ type: 'STUB', id: 'INTERNAL_ENCORE_USE', value: cn } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, 'アンコール：使用するアーツを選択'), { type: 'CHOOSE', options: optsEN, count: 1 });
  }
  // INTERNAL_ENCORE_USE: 選択したアーツをコストなしで実行
  if (stub.id === 'INTERNAL_ENCORE_USE') {
    const encoreCN = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const encoreCard = ctx.cardMap.get(encoreCN);
    if (!encoreCard) return done(addLog(ctx, 'アンコール：カードデータなし'));
    const encoreEffs = parseCardEffects(encoreCard);
    const mainEncoreEff = encoreEffs.find(e => e.effectType === 'ACTIVATED');
    if (!mainEncoreEff) return done(addLog(ctx, `アンコール：${encoreCard.CardName}に起動効果なし`));
    return exec(mainEncoreEff.action,
      addLog({ ...ctx, sourceCardNum: encoreCN }, `${encoreCard.CardName}をアンコール（コストなし）`));
  }
  // 対戦相手のライフクロス上を見る（複数枚パターン対応）
  if (stub.id === 'LOOK_OPP_LIFE_TOP') {
    const srcLT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLT = srcLT ? (srcLT.EffectText ?? '') + ' ' + (srcLT.BurstText ?? '') : '';
    const toHWLT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 「対戦相手の手札を見る」パターン → 相手の手札枚数をログ
    if (txtLT.match(/対戦相手の手札を[０-９\d]*枚?見る/)) {
      const oppHand = ctx.otherState.hand.length;
      return done(addLog({ ...ctx, lastProcessedCards: ctx.otherState.hand }, `対戦相手の手札${oppHand}枚を確認`));
    }
    const oppS = ownerState('opponent', ctx);
    // N枚確認パターン
    const countM = txtLT.match(/ライフクロスの上(?:から)?([０-９\d]+)枚(?:の)?(?:カードを)?(?:見る|確認)/);
    const count = countM ? parseInt(toHWLT(countM[1])) : 1;
    const viewed = oppS.life_cloth.slice(Math.max(0, oppS.life_cloth.length - count));
    if (viewed.length === 0) return done(addLog(ctx, '対戦相手のライフクロスなし'));
    const names = viewed.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
    return done(addLog({ ...ctx, lastProcessedCards: viewed }, `対戦相手のライフクロス上${viewed.length}枚を確認：${names}`));
  }
  // トレード：自シグニ1体をトラッシュに置き、相手シグニ1体をバニッシュ
  if (stub.id === 'TRADE_BANISH_SELF_SIGNI') {
    const selfSigni = ctx.ownerState.field.signi
      .map((stack, zi) => stack?.at(-1) ? { cn: stack.at(-1)!, zi } : null)
      .filter(Boolean) as { cn: string; zi: number }[];
    const oppSigni = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (selfSigni.length === 0 || oppSigni.length === 0) {
      return done(addLog(ctx, 'トレード条件未達（シグニなし）'));
    }
    // まず自分シグニを選んでトラッシュ → continuation で相手シグニをバニッシュ
    const selfCands = selfSigni.map(s => s.cn);
    const trashSelfAction: TrashAction = {
      type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 },
    };
    const banishOppAction: BanishAction = {
      type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 },
    };
    return selectOrInteract(selfCands, 1, false, 'self_field', trashSelfAction, banishOppAction, ctx);
  }
  // 手札を捨てて対戦相手シグニを対象とする効果（スタンドアロン時：手札1枚捨て+相手シグニをlastProcessedCardsへ）
  if (stub.id === 'TARGET_AND_DISCARD_HAND') {
    const oppCandsTADH = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsTADH.length === 0 || ctx.ownerState.hand.length === 0)
      return done(addLog(ctx, '対戦相手シグニまたは手札なし（TARGET_AND_DISCARD_HAND）'));
    // 手札を1枚自動捨て（末尾）→ 相手シグニをlastProcessedCardsへ
    const discardedTADH = ctx.ownerState.hand[ctx.ownerState.hand.length - 1];
    const newOwnerTADH: PlayerState = {
      ...ctx.ownerState,
      hand: ctx.ownerState.hand.slice(0, -1),
      trash: [...ctx.ownerState.trash, discardedTADH],
    };
    const noopTADH: SequenceAction = { type: 'SEQUENCE', steps: [] };
    return selectOrInteract(oppCandsTADH, 1, false, 'opp_field', noopTADH as EffectAction, undefined,
      addLog({ ...ctx, ownerState: newOwnerTADH }, `手札（${ctx.cardMap.get(discardedTADH)?.CardName ?? discardedTADH}）を捨て対象選択`));
  }
  // 動的パワー修正（COUNT依存）
  if (stub.id === 'POWER_MOD_PER_COUNT') {
    const src = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const effText = src ? (src.EffectText ?? '') + ' ' + (src.BurstText ?? '') : '';
    const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const toSigned = (s: string) => parseInt(toHW(s).replace('－', '-').replace('＋', '+'));
    // パターン1: "N体/枚/つ/個につき±X" → count × deltaPerUnit
    const perM = effText.match(/([０-９\d]+)[体枚つ個]?につき([－＋][０-９\d]+)/);
    // パターン2: "レベル1につき±X" → sum(level) × deltaPerUnit
    const lvlM = !perM ? effText.match(/レベル([０-９\d]+)につき([－＋][０-９\d]+)/) : null;
    // パターン3: "合計で±X" （固定合計値）
    const totalM = (!perM && !lvlM) ? effText.match(/合計で([－＋][０-９\d]+)/) : null;
    // パターン4: "自身の下にあるすべてのシグニのパワーの合計と同じだけ+" (WXDi-P07-065 ライズ系)
    const stackPwM = (!perM && !lvlM && !totalM) ? effText.match(/自身の下にある.*シグニのパワー.*合計/) : null;
    // パターン5: "この方法で〜したシグニのパワーと同じだけ-" (WXDi-P14-037, WXK10-026)
    const lastPwM = (!perM && !lvlM && !totalM && !stackPwM)
      ? effText.match(/(?:この方法で|ターン終了時まで、|そうした場合、).*シグニのパワーと同じだけ([－＋])/)
      : null;

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
    } else if (stackPwM && ctx.sourceCardNum) {
      // パターン4: 自身の下にあるシグニのパワー合計と同じだけ+（ライズスタック）
      const srcCNSP = ctx.sourceCardNum;
      for (const stack of ctx.ownerState.field.signi) {
        const topIdx = stack?.indexOf(srcCNSP) ?? -1;
        if (topIdx < 0) continue;
        const underCards = stack!.slice(0, topIdx);
        totalDelta = underCards.reduce((acc, cn) => {
          const pw = ctx.effectivePowers?.get(cn) ?? (parseInt(ctx.cardMap.get(cn)?.Power ?? '0') || 0);
          return acc + pw;
        }, 0);
        break;
      }
    } else if (lastPwM && processed.length > 0) {
      // パターン5: lastProcessedCards[0] のパワーと同じだけ±
      const sign = lastPwM[1] === '－' ? -1 : 1;
      const refCN = processed[0];
      const refPw = ctx.effectivePowers?.get(refCN) ?? (parseInt(ctx.cardMap.get(refCN)?.Power ?? '0') || 0);
      totalDelta = sign * refPw;
    }

    // ドローパターン: "枚数に+Nを加えた枚数のカードを引く"
    const drawM = effText.match(/枚数に([０-９\d]+)を加えた枚数のカードを引く/);
    if (drawM) {
      const bonus = parseInt(toHW(drawM[1]));
      const drawCount = processed.length + bonus;
      if (drawCount > 0) {
        const s = ctx.ownerState;
        const canDraw = Math.min(drawCount, s.deck.length);
        const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
        return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}枚ドロー（移動${processed.length}枚+${bonus}）`));
      }
      return done(addLog(ctx, 'ドロー（移動枚数+N）'));
    }

    // フォールバック: lastProcessedCardsが空の場合にゲーム状態カウントを参照
    if (totalDelta === 0 && processed.length === 0) {
      const toSignedPMPC = (s: string) => parseInt(toHW(s).replace('＋','+').replace('－','-'));
      // 手札N枚につき
      const handM = effText.match(/手札([０-９\d]*)枚につき([＋+]?[－-][０-９\d]+|[＋+][０-９\d]+)/);
      if (handM) {
        const div = parseInt(toHW(handM[1] || '1')) || 1;
        totalDelta = Math.floor(ctx.ownerState.hand.length / div) * toSignedPMPC(handM[2]);
      }
      // エナゾーンN枚につき
      if (!totalDelta) {
        const enaM = effText.match(/エナゾーン(?:のカード)?([０-９\d]*)枚につき([＋+]?[－-][０-９\d]+|[＋+][０-９\d]+)/);
        if (enaM) {
          const div = parseInt(toHW(enaM[1] || '1')) || 1;
          totalDelta = Math.floor(ctx.ownerState.energy.length / div) * toSignedPMPC(enaM[2]);
        }
      }
      // 登録者数N万人につき
      if (!totalDelta) {
        const subM = effText.match(/登録者数([０-９\d]*)万人につき([＋+]?[－-][０-９\d]+|[＋+][０-９\d]+)/);
        if (subM) {
          const div = parseInt(toHW(subM[1] || '1')) || 1;
          totalDelta = Math.floor((ctx.ownerState.subscriber_count ?? 0) / div) * toSignedPMPC(subM[2]);
        }
      }
    }

    if (totalDelta !== 0) {
      // 正デルタ（自シグニバフ）: "このシグニ"/"あなたのシグニ" → ソースシグニへ
      const targetsOwn = totalDelta > 0 && effText.match(/(?:あなたの|この)シグニ/);
      if (targetsOwn && ctx.sourceCardNum) {
        const mods = [...(ctx.ownerState.temp_power_mods ?? [])];
        mods.push({ cardNum: ctx.sourceCardNum, delta: totalDelta });
        const newOwner = { ...ctx.ownerState, temp_power_mods: mods };
        return done(addLog({ ...ctx, ownerState: newOwner },
          `ソースシグニのパワー+${totalDelta}（処理${processed.length}枚）`));
      }
      // デフォルト: 全相手シグニへ
      const mods = [...(ctx.otherState.temp_power_mods ?? [])];
      const oppField = ctx.otherState.field;
      for (let zi = 0; zi < 3; zi++) {
        const top = oppField.signi[zi]?.at(-1);
        if (top) mods.push({ cardNum: top, delta: totalDelta });
      }
      const newOther = { ...ctx.otherState, temp_power_mods: mods };
      return done(addLog({ ...ctx, otherState: newOther },
        `パワー${totalDelta > 0 ? '+' : ''}${totalDelta}（処理${processed.length}枚）`));
    }
    return done(addLog(ctx, 'パワー修正（動的カウント）'));
  }
  if (stub.id === 'POWER_MOD_BY_HAND_COUNT') {
    const src2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txt2 = src2 ? (src2.EffectText ?? '') + ' ' + (src2.BurstText ?? '') : '';
    const toHW2 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const m2 = txt2.match(/手札([０-９\d]+)枚につき([－＋][０-９\d]+)/);
    if (m2) {
      const divisor = Math.max(1, parseInt(toHW2(m2[1])));
      const delta = parseInt(toHW2(m2[2]).replace('－', '-').replace('＋', '+'));
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
          `パワー${totalDelta > 0 ? '+' : ''}${totalDelta}（手札${ctx.ownerState.hand.length}枚）`));
      }
    }
    return done(addLog(ctx, 'パワー修正（手札枚数）'));
  }
  if (stub.id === 'DOUBLE_POWER_MINUS' || stub.id === 'POWER_MOD_PER_OPPONENT_FIELD') {
    const srcPMO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMO = srcPMO ? (srcPMO.EffectText ?? '') + ' ' + (srcPMO.BurstText ?? '') : '';
    const toHWP = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // パターン: "対戦相手の場にあるシグニ1体につき-N" or "2倍にする"
    const perM = txtPMO.match(/(?:シグニ|体)([０-９\d]*)体?につき([－＋][０-９\d]+)/);
    const doubleM = txtPMO.match(/パワーを([０-９\d]+)倍にする/);
    const oppCount = ctx.otherState.field.signi.filter(s => s && s.length > 0).length;
    if (perM) {
      const unitCount = parseInt(toHWP(perM[1] || '1')) || 1;
      const delta = parseInt(toHWP(perM[2]).replace('－', '-').replace('＋', '+'));
      const totalDelta = Math.floor(oppCount / unitCount) * delta;
      if (totalDelta !== 0) {
        const mods = [...(ctx.ownerState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.ownerState.field.signi[zi]?.at(-1);
          if (top) mods.push({ cardNum: top, delta: totalDelta });
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: mods } },
          `パワー${totalDelta > 0 ? '+' : ''}${totalDelta}（相手シグニ${oppCount}体）`));
      }
    } else if (doubleM) {
      // "パワーをN倍にする": 各自シグニに currentPower*(N-1) をdeltaとして適用
      const multiplierDP = parseInt(toHWP(doubleM[1])) || 2;
      const modsDP = [...(ctx.ownerState.temp_power_mods ?? [])];
      let boostedDP = 0;
      for (let zi = 0; zi < 3; zi++) {
        const top = ctx.ownerState.field.signi[zi]?.at(-1);
        if (!top) continue;
        const curPwDP = ctx.effectivePowers?.get(top) ?? (parseInt(ctx.cardMap.get(top)?.Power ?? '0') || 0);
        modsDP.push({ cardNum: top, delta: curPwDP * (multiplierDP - 1) });
        boostedDP++;
      }
      if (boostedDP > 0)
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsDP } },
          `全シグニのパワー×${multiplierDP}（${boostedDP}体）`));
    }
    return done(addLog(ctx, `パワー修正（相手${oppCount}体基準）`));
  }
  // 条件付きパワーボーナス
  if (stub.id === 'CONDITIONAL_POWER_BONUS') {
    const srcCB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCB = srcCB ? (srcCB.EffectText ?? '') + ' ' + (srcCB.BurstText ?? '') : '';
    const toHWC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const toSignedC = (s: string) => parseInt(toHWC(s).replace('－', '-').replace('＋', '+'));
    // 共通ユーティリティ：対象シグニ全体にパワー修正を適用
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
      return done(addLog(newCtx, `パワー${delta > 0 ? '+' : ''}${delta}（${reason}）`));
    };
    // パターン「この方法でN枚以上の場合、±X」（lastProcessedCards使用）
    const cM = txtCB.match(/この方法で.*?([０-９\d]+)枚以上.*?場合.*?([－＋][０-９\d]+)(?:する|される)/s);
    if (cM) {
      const threshold = parseInt(toHWC(cM[1]));
      const delta = toSignedC(cM[2]);
      const processed = ctx.lastProcessedCards ?? [];
      if (processed.length >= threshold) return applyPowerDelta(delta, 'opponent', `条件達成（${processed.length}枚≥${threshold}）`);
      return done(addLog(ctx, `条件未達（必要${threshold}枚、処理${processed.length}枚）`));
    }
    // パターン「あなたの場にシグニがN体以上ある場合、代わりに±X」
    const fieldM = txtCB.match(/あなたの場[にの](?:.*?)シグニが([０-９\d]+)体(?:以上|以上ある)(?:.*?)場合[、，](?:代わりに)?([－＋][０-９\d]+)/);
    if (fieldM) {
      const threshold = parseInt(toHWC(fieldM[1]));
      const delta = toSignedC(fieldM[2]);
      const ownCount = ctx.ownerState.field.signi.filter(s => s && s.length > 0).length;
      if (ownCount >= threshold) return applyPowerDelta(delta, 'opponent', `自場${ownCount}体≥${threshold}`);
      return done(addLog(ctx, `条件未達（自場${ownCount}体/必要${threshold}体）`));
    }
    // パターン「あなたのエナゾーンにカードがN枚以上ある場合」
    const energyM = txtCB.match(/あなたのエナゾーンにカードが([０-９\d]+)枚以上ある場合.*?([－＋][０-９\d]+)/);
    if (energyM) {
      const threshold = parseInt(toHWC(energyM[1]));
      const delta = toSignedC(energyM[2]);
      if (ctx.ownerState.energy.length >= threshold) return applyPowerDelta(delta, 'opponent', `エナ${ctx.ownerState.energy.length}枚≥${threshold}`);
      return done(addLog(ctx, `条件未達（エナ${ctx.ownerState.energy.length}枚/必要${threshold}枚）`));
    }
    // パターン「対戦相手のエナゾーンにカードがN枚以上ある場合」
    const oppEnergyM = txtCB.match(/対戦相手のエナゾーンにカードが([０-９\d]+)枚以上ある場合.*?([－＋][０-９\d]+)/);
    if (oppEnergyM) {
      const threshold = parseInt(toHWC(oppEnergyM[1]));
      const delta = toSignedC(oppEnergyM[2]);
      if (ctx.otherState.energy.length >= threshold) return applyPowerDelta(delta, 'opponent', `相手エナ${ctx.otherState.energy.length}枚≥${threshold}`);
      return done(addLog(ctx, `条件未達（相手エナ${ctx.otherState.energy.length}枚/必要${threshold}枚）`));
    }
    // パターン「あなたの手札がN枚以上の場合」
    const handM = txtCB.match(/あなたの手札が([０-９\d]+)枚以上(?:の場合)?.*?([－＋][０-９\d]+)/);
    if (handM) {
      const threshold = parseInt(toHWC(handM[1]));
      const delta = toSignedC(handM[2]);
      if (ctx.ownerState.hand.length >= threshold) return applyPowerDelta(delta, 'opponent', `手札${ctx.ownerState.hand.length}枚≥${threshold}`);
      return done(addLog(ctx, `条件未達（手札${ctx.ownerState.hand.length}枚/必要${threshold}枚）`));
    }
    // パターン「あなたのトラッシュにカード名に〜を含むカードがある場合」（固定パワー）
    const trashNameM = txtCB.match(/あなたのトラッシュにカード名に《?([^》]+)》?を含むカードがある場合.*?([－＋][０-９\d]+)/);
    if (trashNameM) {
      const cardName = trashNameM[1];
      const delta = toSignedC(trashNameM[2]);
      const found = ctx.ownerState.trash.some(cn => ctx.cardMap.get(cn)?.CardName?.includes(cardName));
      if (found) return applyPowerDelta(delta, 'opponent', `トラッシュに${cardName}あり`);
      return done(addLog(ctx, `条件未達（トラッシュに${cardName}なし）`));
    }
    // パターン「トラッシュにある＜クラス＞のカードN枚につき±X」
    const trashClassM = txtCB.match(/トラッシュにある＜([^＞]+)＞のカード[０-９\d]*枚?につき([－＋][０-９\d]+)/);
    if (trashClassM) {
      const cls = trashClassM[1];
      const delta = toSignedC(trashClassM[2]);
      const count = ctx.ownerState.trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.CardClass?.includes(cls) || c?.CardName?.includes(cls);
      }).length;
      if (count > 0) {
        const totalDelta = count * delta;
        return applyPowerDelta(totalDelta, 'opponent', `トラッシュ<${cls}>${count}枚×${delta}`);
      }
      return done(addLog(ctx, `条件未達（トラッシュ<${cls}>なし）`));
    }
    // パターン「場に他の＜クラス＞のシグニがある場合、±X」
    const fieldClassM = txtCB.match(/あなたの場に(?:他の)?＜([^＞]+)＞のシグニがある場合.*?([－＋][０-９\d]+)/);
    if (fieldClassM) {
      const cls = fieldClassM[1];
      const delta = toSignedC(fieldClassM[2]);
      const found = ctx.ownerState.field.signi.some((s) => {
        const top = s?.at(-1);
        if (!top || top === ctx.sourceCardNum) return false;
        const c = ctx.cardMap.get(top);
        return c?.CardClass?.includes(cls);
      });
      if (found) return applyPowerDelta(delta, 'self', `場に<${cls}>あり`);
      return done(addLog(ctx, `条件未達（場に<${cls}>なし）`));
    }
    // パターン「このシグニのパワーを±X（自シグニ強化）」
    const selfPwM = txtCB.match(/このシグニのパワーを([－＋][０-９\d]+)する/);
    if (selfPwM && ctx.sourceCardNum) {
      const delta = toSignedC(selfPwM[1]);
      const mods = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: mods } },
        `${ctx.cardMap.get(ctx.sourceCardNum)?.CardName ?? ctx.sourceCardNum}パワー${delta > 0 ? '+' : ''}${delta}`));
    }
    return done(addLog(ctx, '条件付きパワー修正'));
  }
  // グロウ制限：対戦相手の no_grow フラグをセット
  if (stub.id === 'LRIG_GROW_RESTRICT') {
    // CONTINUOUS効果のため、BattleScreenのgrowCandidatesフィルタリングで色制限を適用
    // （effectTextの「このルリグは〜のルリグにしかグロウできない」をBattleScreen側で解析）
    return done(addLog(ctx, 'グロウ色制限（BattleScreen側処理）'));
  }
  // ライフバースト抑制：対戦相手の suppress_life_burst フラグをセット
  if (stub.id === 'SUPPRESS_LIFE_BURST_ON_CRASH' || stub.id === 'SUPPRESS_LIFE_BURST_ON_CARD') {
    const newOther = { ...ctx.otherState, suppress_life_burst: true };
    return done(addLog({ ...ctx, otherState: newOther }, 'このターン対戦相手のライフバーストは発動しない'));
  }
  // このターンのルリグダメージ無効：ownerState に prevent_lrig_damage フラグをセット
  if (stub.id === 'PREVENT_LRIG_DAMAGE_THIS_TURN') {
    const newOwner = { ...ctx.ownerState, prevent_lrig_damage: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン自分へのルリグダメージを無効'));
  }
  // 敗北無効フラグ
  if (stub.id === 'PREVENT_DEFEAT_THIS_TURN' || stub.id === 'PREVENT_DEFEAT_UNTIL_NEXT_TURN' || stub.id === 'PREVENT_DEFEAT') {
    const newOwner = { ...ctx.ownerState, prevent_defeat: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン敗北無効'));
  }
  // サブスクライバーカウント+1
  if (stub.id === 'GAIN_SUBSCRIBER_COUNT') {
    const srcSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSC = srcSC ? (srcSC.EffectText ?? '') + ' ' + (srcSC.BurstText ?? '') : '';
    const toHWSC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mSC = txtSC.match(/登録者数を([０-９\d]+)万人得る/);
    const gain = mSC ? parseInt(toHWSC(mSC[1])) : 1;
    const newCnt = (ctx.ownerState.subscriber_count ?? 0) + gain;
    const newOwner = { ...ctx.ownerState, subscriber_count: newCnt };
    return done(addLog({ ...ctx, ownerState: newOwner }, `登録者数＋${gain}万人（計${newCnt}万人）`));
  }
  // ウイルス除去：テキストを解析して適切な数のウイルスを取り除く
  if (stub.id === 'REMOVE_VIRUS') {
    const virusArr = ctx.otherState.field.signi_virus ?? [0, 0, 0];
    const totalVirus = virusArr.reduce((s, v) => s + v, 0);
    if (totalVirus === 0) return done(addLog(ctx, 'ウイルスなし'));
    const srcRV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRV = srcRV ? (srcRV.EffectText ?? '') + ' ' + (srcRV.BurstText ?? '') : '';
    const toHWRV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const removeAllRV = !!(txtRV.match(/すべての【ウィルス】を取り除く/) || txtRV.match(/すべての.*ウィルス.*取り除く/));
    const cntMRV = txtRV.match(/【ウィルス】([０-９\d]+)つを?取り除く/);
    const removeCount = removeAllRV ? totalVirus : (cntMRV ? Math.min(parseInt(toHWRV(cntMRV[1])), totalVirus) : totalVirus);
    const newVirus = [...virusArr];
    let removed = 0;
    for (let z = 0; z < 3 && removed < removeCount; z++) {
      const take = Math.min(newVirus[z], removeCount - removed);
      newVirus[z] -= take;
      removed += take;
    }
    const newOther = { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: newVirus } };
    return done(addLog({ ...ctx, otherState: newOther }, `ウイルス${removed}つを取り除く`));
  }
  // INTERNAL_REMOVE_VIRUS_N: N個ウイルスを除去（effectExecutorのREMOVE_VIRUS+IS_MY_TURNハンドラから使用）
  if (stub.id === 'INTERNAL_REMOVE_VIRUS_N') {
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
    return done(addLog({ ...ctx, otherState: newOther }, `ウイルス${removed}つを取り除く`));
  }
  // INTERNAL_RV_BATCH_TRANSFER: N個ウイルス除去 + トラッシュからシグニN枚を手札へ（WX15-028型）
  if (stub.id === 'INTERNAL_RV_BATCH_TRANSFER') {
    const n = typeof stub.value === 'number' ? stub.value : 0;
    if (n === 0) return done(addLog(ctx, 'ウイルス取り除かない'));
    const virusArr = ctx.otherState.field.signi_virus ?? [0, 0, 0];
    const newVirus = [...virusArr];
    let removed = 0;
    for (let z = 0; z < 3 && removed < n; z++) {
      const take = Math.min(newVirus[z], n - removed);
      newVirus[z] -= take;
      removed += take;
    }
    const newCtx = addLog({ ...ctx, otherState: { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: newVirus } } },
      `ウイルス${removed}つを取り除く`);
    // トラッシュから黒のシグニをN枚選択して手札へ（SELECT_TARGETで選ばせる）
    const blackTrashCands = newCtx.ownerState.trash.filter(cn => {
      const c = newCtx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (c.Color ?? '').includes('黒');
    });
    if (blackTrashCands.length === 0) return done(addLog(newCtx, 'トラッシュに黒シグニなし'));
    const pickN = Math.min(removed, blackTrashCands.length);
    const addHandAction: AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    return needsInteraction(addLog(newCtx, `トラッシュから黒シグニ${pickN}枚を手札に加える`), {
      type: 'SEARCH', visibleCards: blackTrashCands, maxPick: pickN,
      thenAction: addHandAction as EffectAction,
    });
  }
  // EXTRA_COST_REMOVE_VIRUS: ウイルスを任意数取り除いてからN+1択の効果を選ぶ
  if (stub.id === 'EXTRA_COST_REMOVE_VIRUS') {
    const virusArrECRV = ctx.otherState.field.signi_virus ?? [0, 0, 0];
    const totalVirusECRV = virusArrECRV.reduce((s, v) => s + v, 0);
    const srcECRV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtECRV = srcECRV ? (srcECRV.EffectText ?? '') + ' ' + (srcECRV.BurstText ?? '') : '';
    const toHWECRV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 最大取り除き数を解析
    const maxRemoveM = txtECRV.match(/【ウィルス】を([０-９\d]+)つまで取り除|好きな数取り除/);
    const maxRemoveECRV = maxRemoveM
      ? (maxRemoveM[1] ? parseInt(toHWECRV(maxRemoveM[1])) : totalVirusECRV)
      : totalVirusECRV;
    // 取り除く数を選択 (0 から min(max, totalVirus))
    const removeOptions: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (let n = 0; n <= Math.min(maxRemoveECRV, totalVirusECRV); n++) {
      removeOptions.push({
        id: `remove_${n}`,
        label: n === 0 ? '取り除かない' : `ウイルス${n}つ取り除く`,
        action: ({ type: 'STUB', id: 'INTERNAL_ECRV_APPLY', value: n } as StubAction) as EffectAction,
        available: true,
      });
    }
    return needsInteraction(addLog(ctx, `ウイルス取り除き（最大${Math.min(maxRemoveECRV, totalVirusECRV)}）`), {
      type: 'CHOOSE', options: removeOptions, count: 1,
    });
  }
  // INTERNAL_ECRV_APPLY: ウイルスN個除去→(N+1)択効果を選ぶ
  if (stub.id === 'INTERNAL_ECRV_APPLY') {
    const removeN = typeof stub.value === 'number' ? stub.value : 0;
    // ウイルスをN個除去
    const newVirusECRV = [...(ctx.otherState.field.signi_virus ?? [0, 0, 0])];
    let removedECRV = 0;
    for (let zi = 0; zi < 3 && removedECRV < removeN; zi++) {
      const take = Math.min(newVirusECRV[zi], removeN - removedECRV);
      newVirusECRV[zi] -= take;
      removedECRV += take;
    }
    let ctxECRV: typeof ctx = { ...ctx, otherState: { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: newVirusECRV } } };
    if (removedECRV > 0) ctxECRV = addLog(ctxECRV as import('./execUtils').ExecCtx, `ウイルス${removedECRV}個除去`) as typeof ctx;
    const chooseCount = removeN + 1;
    const srcECRV2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtECRV2 = srcECRV2 ? (srcECRV2.EffectText ?? '') + ' ' + (srcECRV2.BurstText ?? '') : '';
    const toHWECRV2 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // ①②③④の効果オプションを解析（CONDITIONAL_MULTI_CHOOSE_BY_CENTERと同様のロジック）
    const ecrPatterns = [
      { m: /①([^②③④]+)/, idx: 0 }, { m: /②([^③④⑤]+)/, idx: 1 },
      { m: /③([^④⑤]+)/, idx: 2 }, { m: /④([^⑤]+)/, idx: 3 },
    ];
    const optsECRV: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of ecrPatterns) {
      const mat = txtECRV2.match(m);
      if (!mat) continue;
      const choiceTxtECRV = mat[1].replace(/。\s*$/, '').trim();
      let choiceActECRV: EffectAction | null = null;
      if (choiceTxtECRV.match(/トラッシュから.*黒.*シグニ.*手札/)) {
        choiceActECRV = ({ type: 'STUB', id: 'SUMMON_FROM_TRASH_TO_HAND_BLACK' } as StubAction) as EffectAction;
      } else if (choiceTxtECRV.match(/パワーを([－-][０-９\d]+)する/)) {
        const delta = parseInt(toHWECRV2(choiceTxtECRV.match(/パワーを([－-][０-９\d]+)する/)![1]).replace('－', '-'));
        choiceActECRV = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_OPP_ONE', value: delta } as StubAction) as EffectAction;
      } else if (choiceTxtECRV.match(/すべてのシグニのパワーを([－-][０-９\d]+)/)) {
        const delta = parseInt(toHWECRV2(choiceTxtECRV.match(/すべてのシグニのパワーを([－-][０-９\d]+)/)![1]).replace('－', '-'));
        choiceActECRV = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_ALL_OPP', value: delta } as StubAction) as EffectAction;
      } else if (choiceTxtECRV.match(/トラッシュにある.*ゲームから除外/)) {
        choiceActECRV = ({ type: 'STUB', id: 'INTERNAL_EXILE_OPP_TRASH' } as StubAction) as EffectAction;
      } else if (choiceTxtECRV.match(/デッキの上からカードを([０-９\d]+)枚トラッシュ/)) {
        const cnt = parseInt(toHWECRV2(choiceTxtECRV.match(/デッキの上からカードを([０-９\d]+)枚トラッシュ/)![1]));
        choiceActECRV = ({ type: 'STUB', id: 'INTERNAL_DECK_TRASH_BOTH', value: cnt } as StubAction) as EffectAction;
      }
      if (choiceActECRV) {
        optsECRV.push({
          id: `eff_${idx}`,
          label: `${['①','②','③','④'][idx]}${choiceTxtECRV.slice(0, 20)}...`,
          action: choiceActECRV,
          available: true,
        });
      }
    }
    if (optsECRV.length > 0) {
      return needsInteraction(addLog(ctxECRV, `効果を${chooseCount}つ選択`), {
        type: 'CHOOSE', options: optsECRV, count: Math.min(chooseCount, optsECRV.length),
      });
    }
    return done(addLog(ctxECRV, `ウイルス${removeN}個除去→効果${chooseCount}択（解析不可）`));
  }
  // SUMMON_FROM_TRASH_TO_HAND_BLACK: トラッシュから黒シグニを手札へ
  if (stub.id === 'SUMMON_FROM_TRASH_TO_HAND_BLACK') {
    const blackSigni = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (c.Color ?? '').includes('黒');
    });
    if (blackSigni.length === 0) return done(addLog(ctx, 'トラッシュに黒シグニなし'));
    const addHAct: AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    return selectOrInteract(blackSigni, 1, false, 'self_trash', addHAct as EffectAction, undefined, ctx);
  }
  // INTERNAL_POWER_MOD_ALL_OPP: 全相手シグニへのパワー修正
  if (stub.id === 'INTERNAL_POWER_MOD_ALL_OPP') {
    const deltaIAPMA = typeof stub.value === 'number' ? stub.value : -2000;
    const modsIAPMA = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (top) modsIAPMA.push({ cardNum: top, delta: deltaIAPMA });
    }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIAPMA } },
      `全相手シグニパワー${deltaIAPMA}`));
  }
  // INTERNAL_EXILE_OPP_TRASH: 相手トラッシュのカードをゲームから除外（2枚まで）
  if (stub.id === 'INTERNAL_EXILE_OPP_TRASH') {
    const oppTrashIEOT = ctx.otherState.trash;
    if (oppTrashIEOT.length === 0) return done(addLog(ctx, '相手トラッシュにカードなし'));
    const exileN = Math.min(2, oppTrashIEOT.length);
    const exiled = oppTrashIEOT.slice(0, exileN);
    const newOtherIEOT = { ...ctx.otherState, trash: oppTrashIEOT.slice(exileN) };
    return done(addLog({ ...ctx, otherState: newOtherIEOT },
      `相手トラッシュから${exiled.length}枚ゲーム除外（${exiled.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・')}）`));
  }
  // デッキトップを見て下に置いてもよい
  if (stub.id === 'TOP_TO_BOTTOM_OPTIONAL') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topTTB = ctx.ownerState.deck[0];
    const topNameTTB = ctx.cardMap.get(topTTB)?.CardName ?? topTTB;
    const toBottomTTB: StubAction = { type: 'STUB', id: 'INTERNAL_TOP_TO_BOTTOM' };
    const skipTTB: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const pendingTTB: PendingInteractionDef = {
      type: 'CHOOSE',
      options: [
        { id: 'do', label: `${topNameTTB}をデッキ下へ`, action: toBottomTTB as EffectAction, available: true },
        { id: 'skip', label: 'スキップ', action: skipTTB as EffectAction, available: true },
      ],
      count: 1,
    };
    return needsInteraction(addLog(ctx, `デッキトップ：${topNameTTB}（デッキ下に置いてもよい）`), pendingTTB);
  }
  if (stub.id === 'INTERNAL_TOP_TO_BOTTOM') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topITTB = ctx.ownerState.deck[0];
    const newDeckITTB = [...ctx.ownerState.deck.slice(1), topITTB];
    const newOwnerITTB = { ...ctx.ownerState, deck: newDeckITTB };
    return done(addLog({ ...ctx, ownerState: newOwnerITTB },
      `${ctx.cardMap.get(topITTB)?.CardName ?? topITTB}をデッキ下へ`));
  }
  // 各プレイヤーがカードを1枚引き手札を1枚デッキ下に置く
  if (stub.id === 'DRAW_AND_PUT_HAND_TO_DECK_BOTTOM') {
    let newOwnerDAPH = { ...ctx.ownerState };
    let newOtherDAPH = { ...ctx.otherState };
    if (newOwnerDAPH.deck.length > 0) {
      newOwnerDAPH = { ...newOwnerDAPH, hand: [...newOwnerDAPH.hand, newOwnerDAPH.deck[0]], deck: newOwnerDAPH.deck.slice(1) };
    }
    if (newOtherDAPH.deck.length > 0) {
      newOtherDAPH = { ...newOtherDAPH, hand: [...newOtherDAPH.hand, newOtherDAPH.deck[0]], deck: newOtherDAPH.deck.slice(1) };
    }
    const ctxDrawnDAPH = { ...ctx, ownerState: newOwnerDAPH, otherState: newOtherDAPH };
    if (newOwnerDAPH.hand.length === 0) return done(addLog(ctxDrawnDAPH, '両者ドロー（手札なし）'));
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
    return needsInteraction(addLog(ctxDrawnDAPH, '手札を1枚デッキの一番下に置く'), pendingDAPH);
  }
  if (stub.id === 'INTERNAL_HAND_TO_DECK_BOTTOM') {
    const selectedHDB = ctx.lastProcessedCards ?? [];
    if (selectedHDB.length === 0) return done(addLog(ctx, 'スキップ'));
    let newOwnerHDB = { ...ctx.ownerState };
    for (const cn of selectedHDB) {
      const hi = newOwnerHDB.hand.indexOf(cn);
      if (hi >= 0) {
        const newHand = [...newOwnerHDB.hand]; newHand.splice(hi, 1);
        newOwnerHDB = { ...newOwnerHDB, hand: newHand, deck: [...newOwnerHDB.deck, cn] };
      }
    }
    return done(addLog({ ...ctx, ownerState: newOwnerHDB }, `手札${selectedHDB.length}枚をデッキ下へ`));
  }
  // 各プレイヤーがカードを1枚引き、1枚捨てる
  if (stub.id === 'EACH_PLAYER_DRAW_DISCARD') {
    const toHWEPDD0 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcEPDD0 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtEPDD0 = srcEPDD0 ? (srcEPDD0.EffectText ?? '') + ' ' + (srcEPDD0.BurstText ?? '') : '';
    const mDN = txtEPDD0.match(/([０-９\d]+)枚引く/);
    const drawN = mDN ? parseInt(toHWEPDD0(mDN[1])) : 1;
    // 両者ドロー
    let newOwner = { ...ctx.ownerState };
    let newOther = { ...ctx.otherState };
    const ownDraw = Math.min(drawN, newOwner.deck.length);
    newOwner = { ...newOwner, hand: [...newOwner.hand, ...newOwner.deck.slice(0, ownDraw)], deck: newOwner.deck.slice(ownDraw) };
    const othDraw = Math.min(drawN, newOther.deck.length);
    newOther = { ...newOther, hand: [...newOther.hand, ...newOther.deck.slice(0, othDraw)], deck: newOther.deck.slice(othDraw) };
    const ctxDrawnEPDD0 = addLog({ ...ctx, ownerState: newOwner, otherState: newOther }, `両者${drawN}枚ドロー`);
    // 自分の捨て（インタラクション）→ continuation で相手の捨て（opponentResponds）
    if (newOwner.hand.length === 0) return done(ctxDrawnEPDD0);
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
  // 手札から無色でないカードをエナに置く
  if (stub.id === 'HAND_NONCOLORLESS_TO_ENERGY') {
    const nonColorless = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      const color = c?.Color ?? '';
      return color.length > 0 && color !== '無';
    });
    if (nonColorless.length === 0) return done(addLog(ctx, '手札に有色カードなし'));
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
    return needsInteraction(addLog(ctx, '手札から有色カードをエナゾーンに置いてもよい'), pendingHNE);
  }
  // 対戦相手のエナゾーンが閾値以上の場合、1枚トラッシュに
  if (stub.id === 'OPP_ENERGY_EXCESS_TRASH') {
    const srcOEE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOEE = srcOEE ? (srcOEE.EffectText ?? '') + ' ' + (srcOEE.BurstText ?? '') : '';
    const toHWOEE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const threshMOEE = txtOEE.match(/エナゾーンにカードが([０-９\d]+)枚以上/);
    const threshOEE = threshMOEE ? parseInt(toHWOEE(threshMOEE[1])) : 5;
    if (ctx.otherState.energy.length < threshOEE) {
      return done(addLog(ctx, `相手エナ${ctx.otherState.energy.length}枚（${threshOEE}枚未満、スキップ）`));
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
    return needsInteraction(addLog(ctx, `相手エナから1枚選びトラッシュへ（${ctx.otherState.energy.length}枚）`), pendingOEE);
  }
  if (stub.id === 'INTERNAL_OPP_ENERGY_TO_TRASH') {
    const selectedOET = ctx.lastProcessedCards ?? [];
    if (selectedOET.length === 0) return done(addLog(ctx, 'スキップ'));
    let newOther = { ...ctx.otherState };
    for (const cn of selectedOET) {
      const ei = newOther.energy.indexOf(cn);
      if (ei >= 0) {
        const newEnergy = [...newOther.energy]; newEnergy.splice(ei, 1);
        newOther = { ...newOther, energy: newEnergy, trash: [...newOther.trash, cn] };
      }
    }
    const namesOET = selectedOET.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, otherState: newOther }, `${namesOET}を相手エナからトラッシュへ`));
  }
  // フィールドに他のクラスシグニがない場合、手札を捨てる
  if (stub.id === 'DISCARD_IF_NO_CLASS_SIGNI') {
    const srcDINC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDINC = srcDINC ? (srcDINC.EffectText ?? '') + ' ' + (srcDINC.BurstText ?? '') : '';
    const classMatchDINC = txtDINC.match(/他の[<＜]([^>＞]+)[>＞]のシグニがない場合/);
    const targetClassDINC = classMatchDINC?.[1];
    // フィールドに自分以外のクラスシグニがあるかチェック
    const hasOtherClassSigni = ctx.ownerState.field.signi.some(stack => {
      const top = stack?.at(-1);
      if (!top || top === ctx.sourceCardNum) return false;
      const c = ctx.cardMap.get(top);
      return c?.Type === 'シグニ' && (!targetClassDINC || c.CardClass?.includes(targetClassDINC));
    });
    if (hasOtherClassSigni) return done(addLog(ctx, `他の${targetClassDINC ?? 'クラス'}シグニあり（捨てスキップ）`));
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '手札なし'));
    const discardDINC: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 },
    };
    return selectOrInteract(ctx.ownerState.hand, 1, false, 'self_hand', discardDINC as EffectAction, undefined, ctx);
  }
  // このターンにこのシグニがアタックしていた場合、手札を1枚捨てる
  if (stub.id === 'DISCARD_IF_ATTACKED_THIS_TURN') {
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '手札なし（捨てスキップ）'));
    const srcDAT = ctx.sourceCardNum;
    const didAttack = srcDAT ? (ctx.ownerState.attacked_signi_ids ?? []).includes(srcDAT) : false;
    if (!didAttack) return done(addLog(ctx, 'アタックなし（捨てスキップ）'));
    const discardDAT: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 },
    };
    return selectOrInteract(ctx.ownerState.hand, 1, false, 'self_hand', discardDAT as EffectAction, undefined, ctx);
  }
  // 手札から任意でエナゾーンに置く
  if (stub.id === 'HAND_TO_ENERGY_OPTIONAL') {
    const srcHTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHTE = srcHTE ? (srcHTE.EffectText ?? '') + ' ' + (srcHTE.BurstText ?? '') : '';
    const toHWHTE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxM = txtHTE.match(/手札から(?:カード)?([０-９\d]+)枚まで/);
    const maxHTE = maxM ? parseInt(toHWHTE(maxM[1])) : 1;
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '手札なし（エナ任意置きスキップ）'));
    // thenAction: noop（RULE_REMINDER_TEXT）, continuation: INTERNAL_HAND_TO_ENERGY でエナ移動
    const noopHTE: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
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
    return needsInteraction(addLog(ctx, '手札からエナゾーンに置いてもよい'), pendingHTE);
  }
  // INTERNAL: lastProcessedCardsの手札カードをエナへ移動
  if (stub.id === 'INTERNAL_HAND_TO_ENERGY') {
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
    const names = selected.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, ownerState: newOwnerHTE }, `${names || 'なし'}をエナゾーンへ`));
  }
  // 相手の手札を見てスペルを捨てさせる
  if (stub.id === 'VIEW_AND_DISCARD_SPELL') {
    const srcVDS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtVDS = srcVDS ? (srcVDS.EffectText ?? '') + ' ' + (srcVDS.BurstText ?? '') : '';
    const toHWVDS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // コスト合計N以下のスペル
    const costLimitM = txtVDS.match(/コストの合計が([０-９\d]+)以下のスペル/);
    const costLimit = costLimitM ? parseInt(toHWVDS(costLimitM[1])) : 99;
    const spellCands = ctx.otherState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'スペル') return false;
      const cost = c.Cost ?? '';
      const colorCount = (cost.match(/[赤青緑黒白無]/g) ?? []).length;
      return colorCount <= costLimit;
    });
    if (spellCands.length === 0) return done(addLog(ctx, '相手手札に対象スペルなし'));
    const maxM2 = txtVDS.match(/スペル([０-９\d]+)枚/);
    const maxVDS = maxM2 ? parseInt(toHWVDS(maxM2[1])) : 1;
    const discardVDS: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 },
    };
    return selectOrInteract(spellCands, maxVDS, false, 'opp_hand', discardVDS as EffectAction, undefined, ctx);
  }
  // 自シグニをデッキトップに置く
  if (stub.id === 'SELF_TO_DECK_TOP') {
    const srcSTD = ctx.sourceCardNum;
    if (!srcSTD || !ctx.ownerState.field.signi.some(s => s?.at(-1) === srcSTD)) {
      return done(addLog(ctx, 'SELF_TO_DECK_TOP: フィールドにいない'));
    }
    const removedSTD = removeFromField(srcSTD, ctx.ownerState);
    const newOwnerSTD = { ...removedSTD, deck: [srcSTD, ...removedSTD.deck] };
    return done(addLog({ ...ctx, ownerState: newOwnerSTD },
      `${ctx.cardMap.get(srcSTD)?.CardName ?? srcSTD}をデッキトップへ`));
  }
  // 相手のトラッシュからカードをデッキトップに（もよい）
  if (stub.id === 'OPP_TRASH_TO_DECK_TOP') {
    if (ctx.otherState.trash.length === 0) return done(addLog(ctx, '相手トラッシュなし'));
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
    return needsInteraction(addLog(ctx, '相手トラッシュのカードをデッキ上に置いてもよい'), pendingOTT);
  }
  if (stub.id === 'INTERNAL_OPP_TRASH_TO_DECK_TOP') {
    const selectedOTT = ctx.lastProcessedCards ?? [];
    if (selectedOTT.length === 0) return done(addLog(ctx, 'スキップ'));
    let newOther = { ...ctx.otherState };
    for (const cn of selectedOTT) {
      const ti = newOther.trash.indexOf(cn);
      if (ti >= 0) {
        const newTrash = [...newOther.trash]; newTrash.splice(ti, 1);
        newOther = { ...newOther, trash: newTrash, deck: [cn, ...newOther.deck] };
      }
    }
    const namesOTT = selectedOTT.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, otherState: newOther }, `${namesOTT}を相手デッキトップへ`));
  }
  // 相手の手札をデッキトップに置く
  if (stub.id === 'OPP_HAND_TO_DECK_TOP') {
    const srcHDT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHDT = srcHDT ? (srcHDT.EffectText ?? '') + ' ' + (srcHDT.BurstText ?? '') : '';
    const toHWHDT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMHDT = txtHDT.match(/手札を([０-９\d]+)枚/);
    const maxHDT = maxMHDT ? parseInt(toHWHDT(maxMHDT[1])) : 1;
    if (ctx.otherState.hand.length === 0) return done(addLog(ctx, '相手手札なし'));
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
    return needsInteraction(addLog(ctx, `相手は手札を${maxHDT}枚デッキトップに置く`), pendingHDT);
  }
  if (stub.id === 'INTERNAL_OPP_HAND_TO_DECK_TOP') {
    const selectedHDT = ctx.lastProcessedCards ?? [];
    if (selectedHDT.length === 0) return done(addLog(ctx, 'スキップ'));
    let newOther = { ...ctx.otherState };
    for (const cn of selectedHDT) {
      const hi = newOther.hand.indexOf(cn);
      if (hi >= 0) {
        const newHand = [...newOther.hand]; newHand.splice(hi, 1);
        newOther = { ...newOther, hand: newHand, deck: [cn, ...newOther.deck] };
      }
    }
    return done(addLog({ ...ctx, otherState: newOther }, `相手手札${selectedHDT.length}枚をデッキトップへ`));
  }
  // UNKNOWN_NESTED: 自シグニを任意でトラッシュに置く（そうした場合に後続効果が発動）
  if (stub.id === 'UNKNOWN_NESTED') {
    const srcUN = ctx.sourceCardNum;
    if (!srcUN || !ctx.ownerState.field.signi.some(s => s?.at(-1) === srcUN)) {
      const newOwner = { ...ctx.ownerState, self_optional_effect_taken: false };
      return done(addLog({ ...ctx, ownerState: newOwner }, 'UNKNOWN_NESTED: フィールドにソースなし'));
    }
    const trashSelf: StubAction = { type: 'STUB', id: 'INTERNAL_UNKNOWN_NESTED_TRASH' };
    const skipSelf: StubAction = { type: 'STUB', id: 'INTERNAL_UNKNOWN_NESTED_SKIP' };
    const optsUN = [
      { id: 'trash', label: 'このシグニをトラッシュに置く', action: trashSelf as EffectAction, available: true },
      { id: 'skip',  label: 'そうしない',                   action: skipSelf  as EffectAction, available: true },
    ];
    return needsInteraction(addLog(ctx, 'このシグニをトラッシュに置きますか？'), {
      type: 'CHOOSE', options: optsUN, count: 1,
    });
  }
  if (stub.id === 'INTERNAL_UNKNOWN_NESTED_TRASH') {
    const srcIUNT = ctx.sourceCardNum;
    if (!srcIUNT) return done(addLog(ctx, 'UNKNOWN_NESTED: ソースなし'));
    const removed = removeFromField(srcIUNT, ctx.ownerState);
    const newOwner = { ...removed, trash: [...removed.trash, srcIUNT], self_optional_effect_taken: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcIUNT)?.CardName ?? srcIUNT}をトラッシュ→後続効果発動`));
  }
  if (stub.id === 'INTERNAL_UNKNOWN_NESTED_SKIP') {
    const newOwner = { ...ctx.ownerState, self_optional_effect_taken: false };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'トラッシュしない→後続効果スキップ'));
  }
  // ゲームから除外：トラッシュにある自シグニを任意で除外（後続効果条件）
  if (stub.id === 'BANISH_FROM_GAME') {
    const src = ctx.sourceCardNum;
    if (!src) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, self_optional_effect_taken: false } },
        'BANISH_FROM_GAME: sourceCardNumなし'));
    }
    const inTrash = ctx.ownerState.trash.includes(src);
    if (!inTrash) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, self_optional_effect_taken: false } },
        `BANISH_FROM_GAME: ${ctx.cardMap.get(src)?.CardName ?? src}はトラッシュにない`));
    }
    const banishSelf: StubAction = { type: 'STUB', id: 'INTERNAL_BANISH_FROM_GAME_DO' };
    const skipBFG: StubAction  = { type: 'STUB', id: 'INTERNAL_BANISH_FROM_GAME_SKIP' };
    const optsBFG = [
      { id: 'banish', label: 'ゲームから除外する', action: banishSelf as EffectAction, available: true },
      { id: 'skip',   label: 'そうしない',          action: skipBFG   as EffectAction, available: true },
    ];
    return needsInteraction(addLog(ctx, `${ctx.cardMap.get(src)?.CardName ?? src}をゲームから除外しますか？`), {
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
    return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcIBFG)?.CardName ?? srcIBFG}をゲームから除外→後続効果発動`));
  }
  if (stub.id === 'INTERNAL_BANISH_FROM_GAME_SKIP') {
    const newOwner = { ...ctx.ownerState, self_optional_effect_taken: false };
    return done(addLog({ ...ctx, ownerState: newOwner }, '除外しない→後続効果スキップ'));
  }
  // 対戦相手が手札を1枚選んで捨てる
  if (stub.id === 'OPP_CHOOSE_YOUR_HAND_DISCARD') {
    const cands = ctx.ownerState.hand;
    if (cands.length === 0) return done(addLog(ctx, '手札なし（OPP_CHOOSE_YOUR_HAND_DISCARD）'));
    const trashAction: TrashAction = {
      type: 'TRASH',
      target: { type: 'HAND_CARD', owner: 'self', count: 1, upToCount: false },
    };
    return selectOrInteract(cands, 1, false, 'self_hand', trashAction, undefined, ctx, true);
  }
  // チェックゾーンから除外：対戦相手のチェックゾーンのカードをトラッシュへ
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
        return done(addLog({ ...ctx, otherState: newOther }, `チェックゾーンから除外（${cardName}）`));
      } else {
        const newOwner = {
          ...ctx.ownerState,
          trash: [...ctx.ownerState.trash, target],
          field: { ...ctx.ownerState.field, check: null },
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `チェックゾーンから除外（${cardName}）`));
      }
    }
    return done(addLog(ctx, 'チェックゾーンにカードなし'));
  }
  // その他ゾーン/レベル/フェイズ制限
  if (stub.id === 'LRIG_ZONE_RESTRICT' || stub.id === 'LRIG_LEVEL_RESTRICT' || stub.id === 'EXTRA_PHASE_RESTRICT') {
    return done(addLog(ctx, 'ルリグ制限効果（ログのみ）'));
  }
  // カード名コピー系
  // COPY_LRIG_NAME_ABILITY: ルリグトラッシュのルリグ名/タイプを現在のルリグに追加
  if (stub.id === 'COPY_LRIG_NAME_ABILITY') {
    const srcCLNA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCLNA = srcCLNA ? (srcCLNA.EffectText ?? '') + ' ' + (srcCLNA.BurstText ?? '') : '';
    // 「ルリグトラッシュにあるレベルNの＜ストーリー名＞と同じカード名としても扱う」
    const aliasM = txtCLNA.match(/ルリグトラッシュにある(?:レベル[０-９\d]+の)?＜([^＞]+)＞(?:のルリグ)?と同じカード名としても扱う/);
    if (aliasM) {
      const storyName = aliasM[1];
      // ルリグトラッシュから対象ストーリーのルリグを探す
      const targetLrig = ctx.ownerState.lrig_trash.find(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.CardClass?.includes(storyName) || c?.Story?.includes(storyName) || c?.CardName?.includes(storyName);
      });
      const aliasName = targetLrig ? (ctx.cardMap.get(targetLrig)?.CardName ?? storyName) : storyName;
      const currentAliases = ctx.ownerState.lrig_name_aliases ?? [];
      if (!currentAliases.includes(aliasName)) {
        const newOwner = { ...ctx.ownerState, lrig_name_aliases: [...currentAliases, aliasName] };
        return done(addLog({ ...ctx, ownerState: newOwner }, `ルリグが「${aliasName}」名としても扱われる`));
      }
      return done(addLog(ctx, `ルリグ名エイリアス（${aliasName}）設定済み`));
    }
    return done(addLog(ctx, 'ルリグ名コピー（テキスト解析不可）'));
  }
  // 条件付きアーツコスト（コスト計算はcomputeArtsEffectiveCostで処理済み、ここでは条件確認のみ）
  if (stub.id === 'CONDITIONAL_ARTS_COST') {
    const srcCAC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCAC = srcCAC ? (srcCAC.EffectText ?? '') + ' ' + (srcCAC.BurstText ?? '') : '';
    const toHWCAC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // Pattern 1: 対戦相手のセンタールリグ色条件（コスト上書き）
    const oppColorMCAC = txtCAC.match(/対戦相手のセンタールリグが(.+?)の場合/);
    if (oppColorMCAC) {
      const oppLrigCard = ctx.otherState.field.lrig.at(-1);
      const oppLrigColor = oppLrigCard ? (ctx.cardMap.get(oppLrigCard)?.Color ?? '') : '';
      const colors = oppColorMCAC[1].split(/か|と/).map(c => c.trim()).filter(Boolean);
      const condMet = colors.some(c => oppLrigColor.includes(c));
      return done(addLog(ctx, `条件付きアーツコスト（相手ルリグ${colors.join('/')}：${condMet ? '条件達成・割引適用済み' : '未達成'}）`));
    }
    // Pattern 2: 自分のセンタールリグレベル条件
    const myLvMCAC = txtCAC.match(/(?:あなたの)?センタールリグのレベルが([０-９\d]+)(以上|以下)/);
    if (myLvMCAC) {
      const threshold = parseInt(toHWCAC(myLvMCAC[1]));
      const op = myLvMCAC[2];
      const myLrigCard = ctx.ownerState.field.lrig.at(-1);
      const myLevel = myLrigCard ? parseInt(ctx.cardMap.get(myLrigCard)?.Level ?? '0') : 0;
      const condMet = op === '以上' ? myLevel >= threshold : myLevel <= threshold;
      return done(addLog(ctx, `条件付きアーツコスト（センタールリグLv${myLevel}${op}${threshold}：${condMet ? '条件達成' : '未達成'}）`));
    }
    return done(addLog(ctx, '条件付きアーツコスト（確認完了）'));
  }
  // INTERNAL_OTEC_SELECT: エナゾーンから特定クラスのカードを選択してトラッシュ/手札へ
  if (stub.id === 'INTERNAL_OTEC_SELECT') {
    const paramsOTEC = String(stub.value ?? 'trash::1');
    const [destOTEC, reqClassOTEC, cntStrOTEC] = paramsOTEC.split(':');
    const pickCountOTEC = parseInt(cntStrOTEC || '1') || 1;
    const energyCandsOTEC = ctx.ownerState.energy.filter(cn => {
      if (!reqClassOTEC) return true;
      return (ctx.cardMap.get(cn)?.CardClass ?? '').includes(reqClassOTEC);
    });
    if (energyCandsOTEC.length === 0) return done(addLog(ctx, `エナに${reqClassOTEC || 'カード'}なし（INTERNAL_OTEC_SELECT）`));
    const moveStubOTEC: StubAction = { type: 'STUB', id: 'INTERNAL_OTEC_MOVE_SELECTED', value: destOTEC };
    return needsInteraction(addLog(ctx, `エナゾーンから選択（${reqClassOTEC || 'カード'}）`), {
      type: 'SELECT_TARGET', candidates: energyCandsOTEC,
      count: Math.min(pickCountOTEC, energyCandsOTEC.length),
      optional: true, targetScope: 'self_energy',
      thenAction: moveStubOTEC as EffectAction,
    });
  }
  // INTERNAL_OTEC_MOVE_SELECTED: applyDirectActionのdefault経由で呼ばれ、lastProcessedCards[0]を移動
  if (stub.id === 'INTERNAL_OTEC_MOVE_SELECTED') {
    const destMOTEC = String(stub.value ?? 'trash');
    const selectedCardOTEC = ctx.lastProcessedCards?.[0];
    if (!selectedCardOTEC) return done(addLog(ctx, 'INTERNAL_OTEC_MOVE_SELECTED: 対象なし'));
    const newEnergyOTEC = ctx.ownerState.energy.filter(cn => cn !== selectedCardOTEC);
    const cardNameOTEC = ctx.cardMap.get(selectedCardOTEC)?.CardName ?? selectedCardOTEC;
    let newOwnerOTEC = { ...ctx.ownerState, energy: newEnergyOTEC };
    if (destMOTEC === 'hand') {
      newOwnerOTEC = { ...newOwnerOTEC, hand: [...newOwnerOTEC.hand, selectedCardOTEC] };
      return done(addLog({ ...ctx, ownerState: newOwnerOTEC }, `${cardNameOTEC}をエナから手札へ`));
    }
    newOwnerOTEC = { ...newOwnerOTEC, trash: [...newOwnerOTEC.trash, selectedCardOTEC] };
    return done(addLog({ ...ctx, ownerState: newOwnerOTEC }, `${cardNameOTEC}をエナからトラッシュへ`));
  }
  // CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE
  // 「以下のN つからM つ選ぶ。[条件]の場合、代わりにK つまで選ぶ。①...②...」
  // stub.value: undefined=初回, 0=ベース選択, 1=強化選択
  if (stub.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE') {
    const srcCMCLG = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCMCLG = srcCMCLG ? (srcCMCLG.EffectText ?? '') + ' ' + (srcCMCLG.BurstText ?? '') : '';
    const toHWCMCLG = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // ベース選択数
    const baseM = txtCMCLG.match(/以下の[２-９\d]つから([１-９\d1-9])つ(?:まで)?選ぶ/);
    const baseCount = baseM ? parseInt(toHWCMCLG(baseM[1])) : 1;
    // 強化選択数
    const enhM = txtCMCLG.match(/代わりに([２-９\d])つ(?:まで)?選ぶ/);
    const enhCount = enhM ? parseInt(toHWCMCLG(enhM[1])) : baseCount + 1;

    // ─── 条件判定 ───
    // (A) センタールリグのレベルがN以上
    const lvCondM = txtCMCLG.match(/センタールリグのレベルが([１-９\d])以上/);
    // (B) 追加コスト払い済み（任意コストまたはエクシード）
    const optCostM = txtCMCLG.match(/追加で(?:エクシード([１-９\d])|((?:《[^》]+》)+))を支払(?:ってい)?た場合/);

    let maxCount: number;
    if (stub.value === 1) {
      // 任意コスト支払い済み → 強化
      maxCount = enhCount;
    } else if (stub.value === 0) {
      // スキップ → ベース
      maxCount = baseCount;
    } else if (lvCondM) {
      // センターレベル条件: その場で判定
      const threshold = parseInt(toHWCMCLG(lvCondM[1]));
      const centerTop = ctx.ownerState.field.lrig.at(-1);
      const centerLv = centerTop ? (parseInt(ctx.cardMap.get(centerTop)?.Level ?? '0') || 0) : 0;
      maxCount = centerLv >= threshold ? enhCount : baseCount;
    } else if (optCostM) {
      // 任意コスト: 支払うか選択させる
      const exceedN = optCostM[1] ? parseInt(toHWCMCLG(optCostM[1])) : 0;
      let costColors: string[] = [];
      if (exceedN > 0) {
        // エクシード: 自分のエナから任意N枚
        costColors = Array(exceedN).fill('無');
      } else {
        const colorBlock = optCostM[2] ?? '';
        const colorMatches = [...colorBlock.matchAll(/《([^》]+)》/g)];
        for (const cm of colorMatches) {
          const parts = cm[1].split('×');
          const col = parts[0].trim();
          const cnt = parts[1] ? parseInt(toHWCMCLG(parts[1])) : 1;
          for (let i = 0; i < cnt; i++) costColors.push(col);
        }
      }
      const canAffordCMCLG = costColors.length === 0 || ctx.ownerState.energy.length >= costColors.length;
      const payLabelCMCLG = costColors.length > 0
        ? `追加コストを支払う（${costColors.map(c => `《${c}》`).join('')}）`
        : '追加コストを支払う';
      const paySeq: StubAction[] = costColors.length > 0
        ? [{ type: 'STUB', id: 'INTERNAL_CMCLG_DEDUCT', value: JSON.stringify(costColors) } as StubAction,
           { type: 'STUB', id: 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE', value: 1 } as StubAction]
        : [{ type: 'STUB', id: 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE', value: 1 } as StubAction];
      const payActionCMCLG: EffectAction = paySeq.length === 1
        ? paySeq[0] as EffectAction
        : { type: 'SEQUENCE', steps: paySeq as EffectAction[] } as import('../types/effects').SequenceAction;
      const skipActionCMCLG: EffectAction = { type: 'STUB', id: 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE', value: 0 } as StubAction;
      const optsCMCLGPay = [
        { id: 'pay', label: payLabelCMCLG, action: payActionCMCLG, available: canAffordCMCLG },
        { id: 'skip', label: `スキップ（${baseCount}択のみ）`, action: skipActionCMCLG, available: true },
      ];
      return needsInteraction(addLog(ctx, '追加コストを支払いますか？'), { type: 'CHOOSE', options: optsCMCLGPay, count: 1 });
    } else {
      // 条件なし（常時）
      maxCount = baseCount;
    }

    // ─── 選択肢を解析してCHOOSEを生成 ───
    const chPatterns = [
      { m: /①([^②③④⑤]+)/, idx: 0 }, { m: /②([^③④⑤]+)/, idx: 1 },
      { m: /③([^④⑤]+)/, idx: 2 }, { m: /④([^⑤]+)/, idx: 3 },
    ];
    const optsCMCLG: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of chPatterns) {
      const mat = txtCMCLG.match(m);
      if (!mat) continue;
      const choiceTxtCMCLG = mat[1].replace(/。\s*$/, '').trim();
      let act: EffectAction | null = null;

      // カードを1枚引く
      if (!act && choiceTxtCMCLG.match(/カードを[１1]枚引く/))
        act = { type: 'DRAW', count: 1 } as DrawAction;
      // トラッシュをデッキに戻しシャッフル→デッキ上をライフに加える
      if (!act && choiceTxtCMCLG.match(/トラッシュにある.*カード.*デッキ.*シャッフル.*デッキ.*ライフ|トラッシュ.*デッキ.*シャッフル.*ライフクロス/))
        act = { type: 'STUB', id: 'INTERNAL_CMCLG_TRASH_TO_DECK_LIFE' } as StubAction as EffectAction;
      // 対戦相手: トラッシュをデッキに→ライフ1枚エナへ
      if (!act && choiceTxtCMCLG.match(/対戦相手.*トラッシュ.*デッキ.*シャッフル.*ライフクロス.*エナ/))
        act = { type: 'STUB', id: 'INTERNAL_CMCLG_OPP_TRASH_TO_DECK_LIFE_ENERGY' } as StubAction as EffectAction;
      // 対戦相手のデッキ上N枚をトラッシュ
      if (!act) {
        const deckMillM = choiceTxtCMCLG.match(/対戦相手.*デッキの上からカードを([０-９\d]+)枚トラッシュ/);
        if (deckMillM) act = { type: 'STUB', id: 'INTERNAL_CMCLG_MILL_OPP', value: parseInt(toHWCMCLG(deckMillM[1])) } as StubAction as EffectAction;
      }
      // 手札から＜CLASS＞のシグニを場に出す
      if (!act) {
        const playHandM = choiceTxtCMCLG.match(/手札から＜([^＞]+)＞のシグニ[１1]枚を場に出す/);
        if (playHandM) act = { type: 'STUB', id: 'INTERNAL_CMCLG_PLAY_CLASS_FROM_HAND', value: playHandM[1] } as StubAction as EffectAction;
      }
      // トラッシュから＜CLASS＞のシグニをN枚まで場に出す
      if (!act) {
        const playTrashM = choiceTxtCMCLG.match(/トラッシュから＜([^＞]+)＞のシグニを([０-９\d１-９]+)枚まで場に出す/);
        if (playTrashM) act = { type: 'STUB', id: 'INTERNAL_CMCLG_PLAY_CLASS_FROM_TRASH', value: JSON.stringify({ cls: playTrashM[1], n: parseInt(toHWCMCLG(playTrashM[2])) }) } as StubAction as EffectAction;
      }
      // ＜CLASS＞シグニに【Sランサー】を付与
      if (!act && choiceTxtCMCLG.match(/【Ｓランサー】を得る|【Sランサー】を得る/))
        act = { type: 'STUB', id: 'INTERNAL_CMCLG_GRANT_SLANCER' } as StubAction as EffectAction;
      // すべてのシグニのパワーを+N（次の対戦相手ターン終了まで）
      if (!act) {
        const allPwM = choiceTxtCMCLG.match(/すべてのシグニのパワーを([＋\+][０-９\d万]+)/);
        if (allPwM) {
          const delta = parseInt(toHWCMCLG(allPwM[1].replace('＋','+').replace('万','0000')));
          act = { type: 'STUB', id: 'INTERNAL_CMCLG_ALL_POWER_UP', value: delta } as StubAction as EffectAction;
        }
      }
      // パワーをレベル合計×-1000する（WX13-060②）
      if (!act && choiceTxtCMCLG.match(/パワーを.*レベル.*合計.*[－-]1000/))
        act = { type: 'STUB', id: 'INTERNAL_CMCLG_POWER_MOD_BY_CLASS_LEVELS' } as StubAction as EffectAction;
      // このターン、対戦相手シグニのパワーが0以下になったとき引く（WX13-060①）
      if (!act && choiceTxtCMCLG.match(/パワーが[０0]以下.*引く|引く.*パワーが[０0]以下/))
        act = { type: 'STUB', id: 'INTERNAL_CMCLG_DRAW_ON_POWER_ZERO' } as StubAction as EffectAction;
      // 【レイヤー】シグニに「場を離れたとき手札に戻す」を付与（SP26-005②）
      if (!act && choiceTxtCMCLG.match(/【レイヤー】.*場を離れたとき|場を離れたとき.*手札に戻す/))
        act = { type: 'STUB', id: 'INTERNAL_CMCLG_GRANT_LAYER_LEAVE_BOUNCE' } as StubAction as EffectAction;
      // 既存パターン流用: バウンス
      if (!act && choiceTxtCMCLG.match(/シグニ[１1]体.*手札に戻す/))
        act = { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BounceAction as EffectAction;
      // バニッシュ
      if (!act && choiceTxtCMCLG.match(/シグニ[１1]体.*バニッシュ/))
        act = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BanishAction as EffectAction;

      if (act) {
        optsCMCLG.push({ id: `cmclg_${idx}`, label: `${'①②③④'[idx]}${choiceTxtCMCLG.slice(0, 20)}...`, action: act, available: true });
      }
    }
    if (optsCMCLG.length === 0) {
      return done(addLog(ctx, `センター/任意コスト多択（${maxCount}択、解析不可）`));
    }
    const condInfoCMCLG = lvCondM
      ? `センターLv${(() => { const t = ctx.ownerState.field.lrig.at(-1); return t ? (parseInt(ctx.cardMap.get(t)?.Level ?? '0') || 0) : 0; })()}`
      : stub.value === 1 ? '追加コスト済み' : 'ベース';
    return needsInteraction(addLog(ctx, `効果を最大${maxCount}つ選択（${condInfoCMCLG}）`), {
      type: 'CHOOSE', options: optsCMCLG, count: maxCount, multiSelect: maxCount > 1,
    });
  }
  // INTERNAL_CMCLG_DEDUCT: 任意コストのエナを消費
  if (stub.id === 'INTERNAL_CMCLG_DEDUCT') {
    const colorsArr: string[] = JSON.parse(typeof stub.value === 'string' ? stub.value : '[]');
    let newEnergyDEDUCT = [...ctx.ownerState.energy];
    for (const col of colorsArr) {
      const idx = newEnergyDEDUCT.findIndex(en => {
        const c = ctx.cardMap.get(en)?.Color ?? '無';
        return col === '無' || c.includes(col);
      });
      if (idx >= 0) newEnergyDEDUCT.splice(idx, 1);
    }
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, energy: newEnergyDEDUCT } },
      `追加コスト消費（${colorsArr.map(c => `《${c}》`).join('')}）`));
  }
  // INTERNAL_CMCLG_TRASH_TO_DECK_LIFE: 自トラッシュ全→デッキにシャッフル+デッキ上→ライフ
  if (stub.id === 'INTERNAL_CMCLG_TRASH_TO_DECK_LIFE') {
    const trashTDL = ctx.ownerState.trash;
    if (trashTDL.length === 0) return done(addLog(ctx, 'トラッシュなし（スキップ）'));
    const shuffled = [...ctx.ownerState.deck, ...trashTDL].sort(() => Math.random() - 0.5);
    const lifeTop = shuffled[0];
    const newDeck = shuffled.slice(1);
    const newOwnerTDL: PlayerState = {
      ...ctx.ownerState,
      trash: [],
      deck: newDeck,
      life_cloth: [...ctx.ownerState.life_cloth, lifeTop],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerTDL },
      `トラッシュ${trashTDL.length}枚→デッキにシャッフル、デッキ上（${ctx.cardMap.get(lifeTop)?.CardName ?? lifeTop}）をライフに加える`));
  }
  // INTERNAL_CMCLG_OPP_TRASH_TO_DECK_LIFE_ENERGY: 相手トラッシュ全→デッキにシャッフル+相手ライフ1枚→エナ
  if (stub.id === 'INTERNAL_CMCLG_OPP_TRASH_TO_DECK_LIFE_ENERGY') {
    const oppTrashOTD = ctx.otherState.trash;
    const oppShuffled = [...ctx.otherState.deck, ...oppTrashOTD].sort(() => Math.random() - 0.5);
    let newOtherOTD = { ...ctx.otherState, trash: [], deck: oppShuffled };
    let lifeLogOTD = `相手トラッシュ${oppTrashOTD.length}枚→デッキにシャッフル`;
    if (ctx.otherState.life_cloth.length > 0) {
      const lifeCard = ctx.otherState.life_cloth[ctx.otherState.life_cloth.length - 1];
      newOtherOTD = {
        ...newOtherOTD,
        life_cloth: ctx.otherState.life_cloth.slice(0, -1),
        energy: [...ctx.otherState.energy, lifeCard],
      };
      lifeLogOTD += `、ライフ（${ctx.cardMap.get(lifeCard)?.CardName ?? lifeCard}）→エナ`;
    }
    return done(addLog({ ...ctx, otherState: newOtherOTD }, lifeLogOTD));
  }
  // INTERNAL_CMCLG_MILL_OPP: 相手デッキ上N枚→トラッシュ
  if (stub.id === 'INTERNAL_CMCLG_MILL_OPP') {
    const millN = typeof stub.value === 'number' ? stub.value : 10;
    const milled = ctx.otherState.deck.slice(0, millN);
    const newOtherMill: PlayerState = {
      ...ctx.otherState,
      deck: ctx.otherState.deck.slice(millN),
      trash: [...ctx.otherState.trash, ...milled],
    };
    return done(addLog({ ...ctx, otherState: newOtherMill }, `相手デッキ上${millN}枚→トラッシュ`));
  }
  // INTERNAL_CMCLG_PLAY_CLASS_FROM_HAND: 手札から＜CLASS＞のシグニを場に出す
  if (stub.id === 'INTERNAL_CMCLG_PLAY_CLASS_FROM_HAND') {
    const clsPCFH = typeof stub.value === 'string' ? stub.value : '';
    const candsPCFH = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (!clsPCFH || c.CardClass?.includes(clsPCFH));
    });
    if (candsPCFH.length === 0) return done(addLog(ctx, `手札に＜${clsPCFH}＞シグニなし`));
    const addFieldPCFH: import('../types/effects').AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
    return needsInteraction(addLog(ctx, `手札から＜${clsPCFH}＞シグニを選んで場に出す`), {
      type: 'SEARCH', visibleCards: candsPCFH, maxPick: 1, thenAction: addFieldPCFH as EffectAction,
    });
  }
  // INTERNAL_CMCLG_PLAY_CLASS_FROM_TRASH: トラッシュから＜CLASS＞のシグニをN枚まで場に出す
  if (stub.id === 'INTERNAL_CMCLG_PLAY_CLASS_FROM_TRASH') {
    const paramPCFT = JSON.parse(typeof stub.value === 'string' ? stub.value : '{"cls":"","n":1}') as { cls: string; n: number };
    const candsPCFT = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (!paramPCFT.cls || c.CardClass?.includes(paramPCFT.cls));
    });
    if (candsPCFT.length === 0) return done(addLog(ctx, `トラッシュに＜${paramPCFT.cls}＞シグニなし`));
    const addFieldPCFT: import('../types/effects').AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
    return needsInteraction(addLog(ctx, `トラッシュから＜${paramPCFT.cls}＞シグニを${paramPCFT.n}枚まで場に出す`), {
      type: 'SEARCH', visibleCards: candsPCFT, maxPick: paramPCFT.n, thenAction: addFieldPCFT as EffectAction,
    });
  }
  // INTERNAL_CMCLG_GRANT_SLANCER: 選択した＜CLASS＞シグニに【Sランサー】付与
  if (stub.id === 'INTERNAL_CMCLG_GRANT_SLANCER') {
    const mySigniGS = ctx.ownerState.field.signi.flatMap((s, zi) => s?.at(-1) ? [{ cn: s.at(-1)!, zi }] : []);
    if (mySigniGS.length === 0) return done(addLog(ctx, 'フィールドにシグニなし'));
    const grantKwGS: import('../types/effects').GrantKeywordAction = {
      type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: 's_lancer', duration: 'UNTIL_END_OF_TURN',
    };
    return exec(grantKwGS as EffectAction, ctx);
  }
  // INTERNAL_CMCLG_ALL_POWER_UP: 自フィールド全シグニのパワーを+N（次の対戦相手ターン終了まで継続）
  if (stub.id === 'INTERNAL_CMCLG_ALL_POWER_UP') {
    const deltaCAPU = typeof stub.value === 'number' ? stub.value : 10000;
    const modsCAPU = [...(ctx.ownerState.temp_power_mods ?? [])];
    for (const stack of ctx.ownerState.field.signi) {
      const top = stack?.at(-1);
      if (!top) continue;
      const existing = modsCAPU.find(m => m.cardNum === top);
      if (existing) existing.delta += deltaCAPU;
      else modsCAPU.push({ cardNum: top, delta: deltaCAPU });
    }
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsCAPU } },
      `全シグニのパワー+${deltaCAPU}（ターン終了まで）`));
  }
  // INTERNAL_CMCLG_POWER_MOD_BY_CLASS_LEVELS: ＜毒牙＞シグニのレベル合計×-1000で対象シグニのパワーを修正
  if (stub.id === 'INTERNAL_CMCLG_POWER_MOD_BY_CLASS_LEVELS') {
    // どのクラスを参照するかをテキストから解析
    const srcPMBCL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBCL = srcPMBCL ? (srcPMBCL.EffectText ?? '') + ' ' + (srcPMBCL.BurstText ?? '') : '';
    const clsMatchPMBCL = txtPMBCL.match(/＜([^＞]+)＞のシグニのレベルを合計/);
    const clsPMBCL = clsMatchPMBCL ? clsMatchPMBCL[1] : '';
    let levelSumPMBCL = 0;
    for (const stack of ctx.ownerState.field.signi) {
      const top = stack?.at(-1);
      if (!top) continue;
      const c = ctx.cardMap.get(top);
      if (!c || !c.CardClass?.includes(clsPMBCL)) continue;
      levelSumPMBCL += parseInt(c.Level ?? '0') || 0;
    }
    const deltaPMBCL = -levelSumPMBCL * 1000;
    const targetCandsPMBCL = ctx.otherState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    if (targetCandsPMBCL.length === 0) return done(addLog(ctx, '相手シグニなし'));
    const noopPMBCL: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contPMBCL: StubAction = { type: 'STUB', id: 'INTERNAL_CMCLG_APPLY_POWER_MOD', value: deltaPMBCL };
    return needsInteraction(addLog(ctx, `＜${clsPMBCL}＞レベル合計${levelSumPMBCL}→対象シグニのパワーを${deltaPMBCL}`), {
      type: 'SELECT_TARGET', candidates: targetCandsPMBCL, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: noopPMBCL as EffectAction, continuation: contPMBCL as EffectAction,
    });
  }
  // INTERNAL_CMCLG_APPLY_POWER_MOD: POWER_MOD_BY_CLASS_LEVELS の続き
  if (stub.id === 'INTERNAL_CMCLG_APPLY_POWER_MOD') {
    const targetAPM = ctx.lastProcessedCards?.[0];
    const deltaAPM = typeof stub.value === 'number' ? stub.value : 0;
    if (!targetAPM || deltaAPM === 0) return done(addLog(ctx, 'パワー修正スキップ'));
    const modsAPM = [...(ctx.otherState.temp_power_mods ?? [])];
    const exAPM = modsAPM.find(m => m.cardNum === targetAPM);
    if (exAPM) exAPM.delta += deltaAPM;
    else modsAPM.push({ cardNum: targetAPM, delta: deltaAPM });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsAPM } },
      `${ctx.cardMap.get(targetAPM)?.CardName ?? targetAPM}のパワー${deltaAPM > 0 ? '+' : ''}${deltaAPM}`));
  }
  // INTERNAL_CMCLG_DRAW_ON_POWER_ZERO: このターン相手シグニのパワー≤0でドロー（フラグ設置）
  if (stub.id === 'INTERNAL_CMCLG_DRAW_ON_POWER_ZERO') {
    const newOwnerDPZ: PlayerState = { ...ctx.ownerState, draw_on_opp_power_zero: true };
    return done(addLog({ ...ctx, ownerState: newOwnerDPZ }, 'このターン、対戦相手のシグニのパワーが0以下になったとき、カードを1枚引く'));
  }
  // INTERNAL_CMCLG_GRANT_LAYER_LEAVE_BOUNCE: 【レイヤー】持ちシグニに「場を離れたとき手札に戻す」を付与
  if (stub.id === 'INTERNAL_CMCLG_GRANT_LAYER_LEAVE_BOUNCE') {
    return done(addLog(ctx, '【レイヤー】シグニに「場を離れたとき相手シグニ1体手札に戻す」を付与（effectEngine未対応・ログのみ）'));
  }
  // 大量トラッシュ: 相手エナ全体+相手シグニ全体、またはシグニ+キー
  if (stub.id === 'MASS_TRASH') {
    // 相手のエナゾーン全カード + フィールド全シグニをトラッシュ
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
      `相手エナ${oppEnaAll.length}枚+シグニ${oppSigniAll.length}体をトラッシュ`));
  }
  if (stub.id === 'TRASH_ALL_SIGNI_AND_KEY') {
    // 自分のシグニ全体 + キーをトラッシュ/ルリグトラッシュへ
    const srcTAK = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTAK = srcTAK ? (srcTAK.EffectText ?? '') : '';
    const isSelfTarget = !txtTAK.match(/対戦相手/);
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
      `シグニ${signiAll.length}体${keyCard ? '+キー' : ''}をトラッシュへ`));
  }
  // デッキ公開してシグニを場に出す
  if (stub.id === 'REVEAL_PICK_PLAY') {
    const srcRPP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRPP = srcRPP ? (srcRPP.EffectText ?? '') + ' ' + (srcRPP.BurstText ?? '') : '';
    // 【シード】として設置するパターン（「それを【シード】として...」等）
    if (txtRPP.match(/【シード】として.*シグニゾーンに出してもよい/) || txtRPP.match(/【シード】として.*シグニゾーンに出すか/)) {
      const topCardsRPPS = ctx.ownerState.deck.slice(0, 1);
      if (topCardsRPPS.length === 0) return done(addLog(ctx, 'REVEAL_PICK_PLAY(SEED): デッキなし'));
      return needsInteraction(addLog(ctx, '【シード】として設置するカードを選択（任意）'), {
        type: 'SEARCH',
        visibleCards: topCardsRPPS,
        maxPick: 1,
        thenAction: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction,
        continuation: ({ type: 'STUB', id: 'INTERNAL_SEED_FROM_DECK' } as StubAction) as EffectAction,
      });
    }
    const toHWR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealCountM = txtRPP.match(/カードを([０-９\d]+)枚(?:見る|公開する)/);
    const revealCount = revealCountM ? parseInt(toHWR(revealCountM[1])) : 5;
    const deckCards = ctx.ownerState.deck.slice(0, Math.min(revealCount, ctx.ownerState.deck.length));
    if (deckCards.length === 0) return done(addLog(ctx, 'デッキなし（REVEAL_PICK_PLAY）'));
    // 場に出せるシグニをフィルタ（簡易：「シグニ」タイプ）
    const signiCards = deckCards.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    const pickCount = txtRPP.match(/シグニを([０-９\d]+)枚まで場に出す/) ? parseInt(toHWR(RegExp.$1)) : 1;
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
    // デッキから公開した分を除去
    const newOwnerDeck = ctx.ownerState.deck.slice(deckCards.length);
    return needsInteraction(
      addLog({ ...ctx, ownerState: { ...ctx.ownerState, deck: newOwnerDeck } }, `デッキ上${deckCards.length}枚公開（シグニを場に）`),
      pending,
    );
  }
  // デッキから探してもよい（REVEAL_AND_PICK: シグニ検索→手札or場）
  if (stub.id === 'REVEAL_AND_PICK') {
    const srcRAP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRAP = srcRAP ? (srcRAP.EffectText ?? '') + ' ' + (srcRAP.BurstText ?? '') : '';
    const toHWRAP = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const countM = txtRAP.match(/シグニ([０-９\d]+)枚を探して/);
    const pickCount = countM ? parseInt(toHWRAP(countM[1])) : 1;
    // デッキ全体からシグニのみをフィルタ
    const signiInDeck = ctx.ownerState.deck.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (signiInDeck.length === 0) return done(addLog(ctx, 'デッキにシグニなし'));
    const toField = txtRAP.match(/場に出す/) && !txtRAP.match(/手札に加える/);
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
    return needsInteraction(addLog(ctx, `デッキからシグニを${pickCount}枚まで検索`), pending);
  }
  // デッキを条件が満たされるまで公開する
  if (stub.id === 'DECK_REVEAL_UNTIL' || stub.id === 'DECK_REVEAL_UNTIL_CLASS' || stub.id === 'OPP_DECK_REVEAL_UNTIL') {
    const isOpp = stub.id === 'OPP_DECK_REVEAL_UNTIL';
    const stateRU = isOpp ? ctx.otherState : ctx.ownerState;
    const srcRU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRU = srcRU ? (srcRU.EffectText ?? '') + ' ' + (srcRU.BurstText ?? '') : '';
    const toHWRU = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 停止条件を解析
    const classM = txtRU.match(/＜([^＞]+)＞のシグニがめくれるまで/);
    const targetClassRU = classM ? classM[1] : null;
    const lvM = txtRU.match(/レベル([０-９\d]+)を持つ/);
    const targetLvRU = lvM ? parseInt(toHWRU(lvM[1])) : null;
    const untilSigniRU = !!txtRU.match(/シグニがめくれるまで/);
    const untilNameRU = !!txtRU.match(/宣言したカードがめくれるまで|宣言したカードが公開されるまで/);
    const declaredNameRU = ctx.ownerState.declared_card_name ?? null;
    const toTrashRestRU = !!txtRU.match(/残りをトラッシュに置く/);
    const toBottomRestRU = !!txtRU.match(/残り.*デッキの一番下/);
    // デッキを先頭から公開していく
    const deckRU = [...stateRU.deck];
    const revealedRU: string[] = [];
    let hitCardRU: string | null = null;
    for (const cn of deckRU) {
      revealedRU.push(cn);
      const card = ctx.cardMap.get(cn);
      let stop = false;
      if (untilSigniRU && card?.Type === 'シグニ') {
        if (!targetClassRU || card?.CardClass?.includes(targetClassRU)) {
          if (!targetLvRU || parseInt(card?.Level ?? '0') === targetLvRU) stop = true;
        }
      }
      if (untilNameRU && declaredNameRU && card?.CardName === declaredNameRU) stop = true;
      if (!untilSigniRU && !untilNameRU) { break; } // 条件不明：先頭1枚
      if (stop) { hitCardRU = cn; break; }
    }
    const nonHitRU = revealedRU.filter(cn => cn !== hitCardRU);
    let newStateRU = { ...stateRU, deck: deckRU.filter(cn => !revealedRU.includes(cn)) };
    if (toTrashRestRU && nonHitRU.length > 0) newStateRU = { ...newStateRU, trash: [...newStateRU.trash, ...nonHitRU] };
    if (toBottomRestRU && nonHitRU.length > 0) newStateRU = { ...newStateRU, deck: [...newStateRU.deck, ...nonHitRU] };
    const newCtxRU = isOpp
      ? { ...ctx, otherState: newStateRU, lastProcessedCards: hitCardRU ? [hitCardRU] : [] }
      : { ...ctx, ownerState: newStateRU, lastProcessedCards: hitCardRU ? [hitCardRU] : [] };
    const hitNameRU = hitCardRU ? ctx.cardMap.get(hitCardRU)?.CardName ?? hitCardRU : 'ヒットなし';
    return done(addLog(newCtxRU, `デッキ公開 ${revealedRU.length}枚 → ヒット: ${hitNameRU}`));
  }
  // SONG_FRAGMENT: エナゾーンから【歌のカケラ】持ちカードをトラッシュに置き、その効果を発動
  // 「このルリグはそのカードの【歌のカケラ】を使用する」= ルリグ効果として扱う
  if (stub.id === 'SONG_FRAGMENT') {
    const lrigCardNumSF = ctx.sourceCardNum; // 発動元ルリグ
    const songCardsInEnergy = ctx.ownerState.energy.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.EffectText?.includes('【歌のカケラ】');
    });
    if (songCardsInEnergy.length === 0) return done(addLog(ctx, '歌のカケラ：エナゾーンにカードなし'));
    if (songCardsInEnergy.length > 1) {
      // 複数ある場合はSELECT_TARGETで選択 → INTERNAL_SONG_FRAGMENTで処理
      const internalSF: StubAction = { type: 'STUB', id: 'INTERNAL_SONG_FRAGMENT', value: lrigCardNumSF };
      const pendingSF: PendingInteractionDef = {
        type: 'SELECT_TARGET',
        candidates: songCardsInEnergy,
        count: 1,
        optional: false,
        targetScope: 'self_energy',
        thenAction: internalSF as EffectAction,
      };
      return needsInteraction(addLog(ctx, '歌のカケラカードを選択'), pendingSF);
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
      // sourceCardNum をルリグのCardNumに設定（ルリグ効果として扱うため）
      const songCtx = { ...ctx, ownerState: newOwnerSF, sourceCardNum: lrigCardNumSF };
      return exec(songEff.action, addLog(songCtx, `【歌のカケラ】発動（${songCardData?.CardName ?? songCard}）：ルリグ効果として処理`));
    }
    return done(addLog({ ...ctx, ownerState: newOwnerSF }, `歌のカケラ（${songCardData?.CardName ?? songCard}）：効果なし`));
  }
  // INTERNAL_SONG_FRAGMENT: SELECT_TARGETで選択されたカードで歌のカケラ発動
  if (stub.id === 'INTERNAL_SONG_FRAGMENT') {
    const selectedSF = ctx.lastProcessedCards?.[0];
    // stub.value にルリグCardNumが格納されている（SONG_FRAGMENTから渡される）
    const lrigCardNumISF = typeof stub.value === 'string' ? stub.value : ctx.sourceCardNum;
    if (!selectedSF) return done(addLog(ctx, 'INTERNAL_SONG_FRAGMENT: 選択なし'));
    const songCardDataISF = ctx.cardMap.get(selectedSF);
    const newOwnerISF: PlayerState = {
      ...ctx.ownerState,
      energy: ctx.ownerState.energy.filter(cn => cn !== selectedSF),
      trash: [...ctx.ownerState.trash, selectedSF],
    };
    const songEffsISF = parseCardEffects(songCardDataISF!);
    const songEffISF = songEffsISF.find(e => e.effectType === 'SONG_ICON');
    if (songEffISF) {
      // sourceCardNum をルリグのCardNumに設定（ルリグ効果として扱うため）
      const songCtxISF = { ...ctx, ownerState: newOwnerISF, sourceCardNum: lrigCardNumISF };
      return exec(songEffISF.action, addLog(songCtxISF, `【歌のカケラ】発動（${songCardDataISF?.CardName ?? selectedSF}）：ルリグ効果として処理`));
    }
    return done(addLog({ ...ctx, ownerState: newOwnerISF }, `歌のカケラ（${songCardDataISF?.CardName ?? selectedSF}）：効果なし`));
  }
  // ゲーム全体能力付与
  if (stub.id === 'GAIN_ABILITY_THIS_GAME') {
    const srcGA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGA = srcGA ? (srcGA.EffectText ?? '') + ' ' + (srcGA.BurstText ?? '') : '';
    let ctxGA = ctx;
    const logsGA: string[] = [];
    // 「あなたはグロウできない」（「このゲームの間」句を含む複合文も含む）
    if (txtGA.match(/あなたはグロウできない/)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, no_grow: true } };
      logsGA.push('グロウ不可（このゲーム）');
    }
    // 「対戦相手はグロウできない」
    if (txtGA.match(/対戦相手はグロウできない/)) {
      ctxGA = { ...ctxGA, otherState: { ...ctxGA.otherState, no_grow: true } };
      logsGA.push('相手グロウ不可（このゲーム）');
    }
    // 「あなたのセンタールリグは【ダブルクラッシュ】を得る」→ keyword_grantsに追加
    if (txtGA.match(/センタールリグは【ダブルクラッシュ】を得/)) {
      const centerGAcn = ctxGA.ownerState.field.lrig.at(-1);
      if (centerGAcn) {
        const grantsGA = { ...(ctxGA.ownerState.keyword_grants ?? {}) };
        grantsGA[centerGAcn] = [...new Set([...(grantsGA[centerGAcn] ?? []), 'ダブルクラッシュ'])];
        ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, keyword_grants: grantsGA } };
        logsGA.push('センタールリグにダブルクラッシュ付与（このゲーム）');
      }
    }
    // 「あなたのセンタールリグは【ランサー】を得る」
    if (txtGA.match(/センタールリグは【ランサー】を得/)) {
      const centerGAL = ctxGA.ownerState.field.lrig.at(-1);
      if (centerGAL) {
        const grantsGAL = { ...(ctxGA.ownerState.keyword_grants ?? {}) };
        grantsGAL[centerGAL] = [...new Set([...(grantsGAL[centerGAL] ?? []), 'ランサー'])];
        ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, keyword_grants: grantsGAL } };
        logsGA.push('センタールリグにランサー付与（このゲーム）');
      }
    }
    // 「このゲームの間、あなたは～を使用できない」
    const blockMGA = txtGA.match(/このゲームの間、あなたは《([^》]+)》を使用できない/);
    if (blockMGA) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, blocked_card_names: [...(ctxGA.ownerState.blocked_card_names ?? []), blockMGA[1]] } };
      logsGA.push(`《${blockMGA[1]}》の使用をブロック`);
    }
    if (logsGA.length > 0) return done(addLog(ctxGA, logsGA.join('・')));
    return done(addLog(ctx, 'このゲームの間：能力付与（ログのみ）'));
  }
  // メインフェイズ終了
  if (stub.id === 'SKIP_MAIN_PHASE') {
    return done(addLog(ctx, 'メインフェイズ終了（BattleScreen側処理）'));
  }
  // ライフクロスの一番上を手札に加える
  if (stub.id === 'CRASH_LIFE_TO_HAND') {
    const srcCLH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCLH = srcCLH ? (srcCLH.EffectText ?? '') + ' ' + (srcCLH.BurstText ?? '') : '';
    // 対象プレイヤーを判定
    const isOpp = txtCLH.match(/対戦相手のライフクロス.*手札に加える/);
    const target = isOpp ? 'opponent' : 'self';
    const st = ownerState(target, ctx);
    if (st.life_cloth.length === 0) return done(addLog(ctx, 'ライフクロスなし（CRASH_LIFE_TO_HAND）'));
    const top = st.life_cloth[st.life_cloth.length - 1];
    const newSt: PlayerState = {
      ...st,
      life_cloth: st.life_cloth.slice(0, -1),
      hand: [...st.hand, top],
    };
    const name = ctx.cardMap.get(top)?.CardName ?? top;
    return done(addLog(setOwnerState(target, newSt, ctx), `ライフクロス上（${name}）を手札へ`));
  }
  // クラス/色宣言
  // DECLARE_CLASS: クラスを宣言してownerState.declared_classに保存
  if (stub.id === 'DECLARE_CLASS') {
    // stub.valueに宣言クラスが入っている場合→保存して完了
    if (typeof stub.value === 'string') {
      const newOwnerDCLS: PlayerState = {
        ...ctx.ownerState,
        declared_class: stub.value,
        lastProcessedCards: [...(ctx.lastProcessedCards ?? []), stub.value],
      };
      return done(addLog({ ...ctx, ownerState: newOwnerDCLS, lastProcessedCards: newOwnerDCLS.lastProcessedCards! },
        `クラス「${stub.value}」を宣言`));
    }
    // クラス一覧を自トラッシュ・手札・相手フィールドから動的収集
    const classSetDCLS = new Set<string>();
    const addClassesDCLS = (cn: string) => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'シグニ' || !c.CardClass) return;
      c.CardClass.replace(/[＜＞]/g, '').split(/[・\/]/).forEach(cl => {
        const t = cl.trim();
        if (t && t !== '-') classSetDCLS.add(t);
      });
    };
    [...ctx.ownerState.trash, ...ctx.ownerState.hand].forEach(addClassesDCLS);
    ctx.ownerState.field.signi.forEach(s => s?.forEach(addClassesDCLS));
    ctx.otherState.field.signi.forEach(s => s?.forEach(addClassesDCLS));
    // クラスが見つからない場合は cardMap 全体から収集
    if (classSetDCLS.size === 0) {
      for (const [, card] of ctx.cardMap) addClassesDCLS(card.CardNum ?? '');
    }
    const sortedClassesDCLS = [...classSetDCLS].sort();
    const setClassDCLS = (cls: string): StubAction => ({ type: 'STUB', id: 'DECLARE_CLASS', value: cls });
    const optsDCLS = sortedClassesDCLS.map(cls => ({
      id: `dcls_${cls}`,
      label: `＜${cls}＞`,
      action: setClassDCLS(cls) as EffectAction,
      available: true,
    }));
    if (optsDCLS.length === 0) return done(addLog(ctx, 'クラス宣言：候補なし'));
    return needsInteraction(addLog(ctx, 'クラスを宣言してください'), {
      type: 'CHOOSE', options: optsDCLS, count: 1,
    });
  }
  // INTERNAL_DC_TRASH_RETRIEVE: WXDi-P09-004用
  // 宣言クラスを持ち《ガードアイコン》を持たないLv1/Lv2/Lv3のシグニをトラッシュから各1枚まで手札へ
  if (stub.id === 'INTERNAL_DC_TRASH_RETRIEVE') {
    const cls = ctx.ownerState.declared_class ?? '';
    if (!cls) return done(addLog(ctx, 'クラス未宣言（スキップ）'));
    const matchTR = (cn: string, lv: number) => {
      const c = ctx.cardMap.get(cn);
      if (!c || c.Type !== 'シグニ') return false;
      if (!c.CardClass?.includes(cls)) return false;
      if (c.GuardIcon && c.GuardIcon !== '-' && c.GuardIcon !== '') return false;
      return (parseInt(c.Level ?? '-1') || -1) === lv;
    };
    const retrieved: string[] = [];
    let newOwnerTR = ctx.ownerState;
    for (const lv of [1, 2, 3]) {
      const cand = newOwnerTR.trash.find(cn => matchTR(cn, lv));
      if (!cand) continue;
      newOwnerTR = {
        ...newOwnerTR,
        trash: newOwnerTR.trash.filter(c => c !== cand),
        hand: [...newOwnerTR.hand, cand],
      };
      retrieved.push(cand);
    }
    if (retrieved.length === 0) return done(addLog(ctx, `＜${cls}＞の対象シグニなし（スキップ）`));
    return done(addLog({ ...ctx, ownerState: newOwnerTR },
      `トラッシュから＜${cls}＞のLv1/2/3シグニを各1枚手札に加えた（${retrieved.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、')}）`));
  }
  // INTERNAL_DC_DECK_PICK: WX24-P1-035用
  // デッキ上3枚から宣言クラスのシグニを好きな枚数手札/エナに振り分け、残りをデッキ下へ
  if (stub.id === 'INTERNAL_DC_DECK_PICK') {
    const clsDP = ctx.ownerState.declared_class ?? '';
    if (!clsDP) return done(addLog(ctx, 'クラス未宣言（スキップ）'));
    const top3DP = ctx.ownerState.deck.slice(0, 3);
    const restDP = ctx.ownerState.deck.slice(3);
    const matchDP = top3DP.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && c.CardClass?.includes(clsDP);
    });
    const nonMatchDP = top3DP.filter(cn => !matchDP.includes(cn));
    if (matchDP.length === 0) {
      // 宣言クラスのシグニなし: 全部デッキ下へ
      const newOwnerDP: PlayerState = { ...ctx.ownerState, deck: [...restDP, ...top3DP] };
      return done(addLog({ ...ctx, ownerState: newOwnerDP }, `＜${clsDP}＞シグニなし→デッキ上3枚をデッキ下へ`));
    }
    // 宣言クラスのシグニを手札に加え、残りをデッキ下へ（簡易: 全て手札に加える）
    const newOwnerDP: PlayerState = {
      ...ctx.ownerState,
      deck: [...restDP, ...nonMatchDP],
      hand: [...ctx.ownerState.hand, ...matchDP],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerDP },
      `デッキ上3枚から＜${clsDP}＞シグニ${matchDP.length}枚を手札に加えた（${matchDP.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、')}）、残り${nonMatchDP.length}枚はデッキ下へ`));
  }
  if (stub.id === 'DECLARE_COLOR') {
    const colorsDC = ['白', '赤', '青', '緑', '黒'];
    const setColorDC = (c: string): StubAction => ({ type: 'STUB', id: 'INTERNAL_SET_DECLARED_COLOR', value: c });
    const optsDC = colorsDC.map(c => ({
      id: `color_${c}`, label: `${c}を宣言`, action: setColorDC(c) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, '色を宣言してください（白/赤/青/緑/黒）'), {
      type: 'CHOOSE', options: optsDC, count: 1,
    });
  }
  if (stub.id === 'INTERNAL_SET_DECLARED_COLOR') {
    const colorSDC = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const newOwnerSDC = { ...ctx.ownerState, declared_color: colorSDC };
    return done(addLog({ ...ctx, ownerState: newOwnerSDC }, `色「${colorSDC}」を宣言`));
  }
  // ターゲット選択のみ（lastProcessedCards に格納し後続ステップへ）
  if (stub.id === 'TARGET_ONLY') {
    const srcTO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTO = srcTO ? (srcTO.EffectText ?? '') + ' ' + (srcTO.BurstText ?? '') : '';
    // テキストから自分/相手どちらのシグニを選ぶか判断
    const isOwnTO = (txtTO.includes('あなたのシグニ') || txtTO.includes('自分のシグニ'))
      && !txtTO.match(/対戦相手.{0,5}シグニ/);
    const stateTO = isOwnTO ? ctx.ownerState : ctx.otherState;
    const scopeTO: TargetScope = isOwnTO ? 'self_field' : 'opp_field';
    const candsTO = fieldCandidates(stateTO, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (candsTO.length === 0) return done(addLog(ctx, '対象シグニなし（TARGET_ONLY）'));
    const noopTO: SequenceAction = { type: 'SEQUENCE', steps: [] };
    return selectOrInteract(candsTO, 1, false, scopeTO, noopTO as EffectAction, undefined, ctx);
  }
  // デッキ上N枚公開してM枚を手札に加え残りをデッキ下/トラッシュ/エナゾーンへ
  if (stub.id === 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM') {
    const params = (stub as StubAction & { revealPickParams?: { pickCount: number | 'ALL'; restDest: 'deck_bottom' | 'trash' | 'energy'; then: 'hand' | 'energy' } }).revealPickParams
      ?? { pickCount: 1, restDest: 'deck_bottom' as const, then: 'hand' as const };
    const effText = ctx.sourceCardNum
      ? (ctx.cardMap.get(ctx.sourceCardNum)?.EffectText ?? '') + ' ' + (ctx.cardMap.get(ctx.sourceCardNum)?.BurstText ?? '')
      : '';
    const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealM = effText.match(/カードを([０-９\d]+)枚(?:見る|公開する)/);
    const revealCount = revealM ? parseInt(toHW(revealM[1])) : 5;
    const deckCards = ctx.ownerState.deck.slice(0, Math.min(revealCount, ctx.ownerState.deck.length));
    if (deckCards.length === 0) return done(addLog(ctx, 'デッキなし（REVEAL_PICK）'));
    const maxPick = params.pickCount === 'ALL' ? deckCards.length : (params.pickCount as number);
    const addHandAction: AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    const pending: PendingInteractionDef = {
      type: 'SEARCH',
      visibleCards: deckCards,
      maxPick,
      thenAction: addHandAction,
      restDest: params.restDest,
    };
    return needsInteraction(addLog(ctx, `デッキ上${deckCards.length}枚公開（${maxPick}枚まで手札に）`), pending);
  }
  // ソウル/ルリグデッキ操作
  if (stub.id === 'SOUL_OP') {
    const srcSO = ctx.sourceCardNum;
    const effSOtxt = srcSO ? (ctx.cardMap.get(srcSO)?.EffectText ?? '') + ' ' + (ctx.cardMap.get(srcSO)?.BurstText ?? '') : '';
    const processed = ctx.lastProcessedCards ?? [];
    const toHWSO = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 「それをルリグデッキに加える」→ sourceCardNumをlrig_deckへ
    if (effSOtxt.match(/それをルリグデッキに加える/) && srcSO) {
      const newOwner = { ...ctx.ownerState, lrig_trash: ctx.ownerState.lrig_trash.filter(n => n !== srcSO), lrig_deck: [...(ctx.ownerState.lrig_deck ?? []), srcSO] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcSO)?.CardName ?? srcSO}をルリグデッキへ`));
    }
    // 「それらをルリグトラッシュに置く」→ lastProcessedCardsをlrig_trashへ
    if ((effSOtxt.match(/それらをルリグトラッシュに置く/) || effSOtxt.match(/ルリグトラッシュに置く/)) && processed.length > 0) {
      const newOwner = { ...ctx.ownerState, lrig_trash: [...ctx.ownerState.lrig_trash, ...processed] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `${processed.length}枚をルリグトラッシュへ`));
    }
    // 「ルリグトラッシュからアーツをルリグデッキに戻す」
    if (effSOtxt.match(/ルリグトラッシュから.*アーツ.*ルリグデッキに加える/)) {
      const artsInLrigTrash = ctx.ownerState.lrig_trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'アーツ');
      if (artsInLrigTrash.length > 0) {
        const toMove = artsInLrigTrash.slice(0, 1);
        const newOwner = {
          ...ctx.ownerState,
          lrig_trash: ctx.ownerState.lrig_trash.filter(cn => !toMove.includes(cn)),
          lrig_deck: [...(ctx.ownerState.lrig_deck ?? []), ...toMove],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(toMove[0])?.CardName ?? toMove[0]}をルリグデッキへ`));
      }
      return done(addLog(ctx, 'ルリグトラッシュにアーツなし'));
    }
    // 「このカードをセンタールリグの下に置く」→ sourceCardNumをlrig_deckの先頭（ルリグの下）へ
    if (effSOtxt.match(/このカードをあなたのセンタールリグの下に置く/) && srcSO) {
      // ルリグの下 = lrig_deck の末尾（先頭がトップ）に追加
      const lrig_deck = ctx.ownerState.lrig_deck ?? [];
      // 手札から取り除く
      const newHand = ctx.ownerState.hand.filter(cn => cn !== srcSO);
      const newOwner = { ...ctx.ownerState, hand: newHand, lrig_deck: [...lrig_deck, srcSO] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcSO)?.CardName ?? srcSO}をルリグデッキ（ルリグ下）へ`));
    }
    // 「ルリグデッキからN枚をルリグトラッシュに置く」
    const lrigDeckTrashM = effSOtxt.match(/ルリグデッキ(?:の上から)?([０-９\d]+)枚をルリグトラッシュに/);
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
        return done(addLog({ ...ctx, ownerState: newOwner }, `ルリグデッキ上${toTrash.length}枚をルリグトラッシュへ`));
      }
      return done(addLog(ctx, 'ルリグデッキなし'));
    }
    // 「このルリグの下からカード１枚をシグニの【ソウル】にする」
    if (effSOtxt.match(/このルリグの下からカード[１1]枚をそれの【ソウル】にする/)) {
      const lrigStack = ctx.ownerState.field.lrig;
      const underCards = lrigStack.length > 1 ? lrigStack.slice(0, -1) : [];
      if (underCards.length === 0) return done(addLog(ctx, 'ルリグの下にカードなし（ソウル付与）'));
      const selfSigniCands = [0, 1, 2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((c): c is string => !!c);
      if (selfSigniCands.length === 0) return done(addLog(ctx, 'ソウル付与対象シグニなし'));
      // SELECT_TARGETで対象シグニを選択してからソウルを付与
      const soulCard = underCards[underCards.length - 1]; // ルリグ直下のカードを使用
      const attachSoulStub: StubAction = {
        type: 'STUB', id: 'INTERNAL_ATTACH_SOUL_FROM_LRIG', value: soulCard,
      };
      return selectOrInteract(selfSigniCands, 1, false, 'self_field', attachSoulStub, undefined, ctx);
    }
    // 「ルリグトラッシュからルリグ１枚をシグニの【ソウル】にする」
    if (effSOtxt.match(/ルリグトラッシュからルリグ[１1]枚をそれの【ソウル】にする/)) {
      const lrigInTrash = ctx.ownerState.lrig_trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.Type === 'ルリグ' || c?.Type === 'アシストルリグ';
      });
      if (lrigInTrash.length === 0) return done(addLog(ctx, 'ルリグトラッシュにルリグなし'));
      const selfSigniSoulCands = [0, 1, 2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((c): c is string => !!c);
      if (selfSigniSoulCands.length === 0) return done(addLog(ctx, 'ソウル付与対象シグニなし'));
      // まず対象シグニを選択 → INTERNAL_CHOOSE_SOUL_LRIG でルリグトラッシュから選択
      const chooseSoulStub: StubAction = {
        type: 'STUB', id: 'INTERNAL_CHOOSE_SOUL_LRIG',
      };
      return selectOrInteract(selfSigniSoulCands, 1, false, 'self_field', chooseSoulStub, undefined, ctx);
    }
    // 「このルリグの下からカードN枚をルリグトラッシュに置いてもよい」（任意・WXDi-P04/05/06-009系）
    const lrigUnderOptM = effSOtxt.match(/このルリグの下からカード([０-９\d]+)枚をルリグトラッシュに置いてもよい/);
    if (lrigUnderOptM) {
      const countLUO = parseInt(toHWSO(lrigUnderOptM[1]));
      const lrigStackLUO = ctx.ownerState.field.lrig;
      const underLUO = lrigStackLUO.length > 1 ? lrigStackLUO.slice(0, -1) : [];
      if (underLUO.length === 0) return done(addLog(ctx, 'ルリグの下にカードなし'));
      const toConsumeLUO = underLUO.slice(-Math.min(countLUO, underLUO.length));
      const consumeActLUO = { type: 'STUB', id: 'INTERNAL_CONSUME_LRIG_UNDER', value: countLUO } as StubAction;
      const noopActLUO: SequenceAction = { type: 'SEQUENCE', steps: [] };
      const nameListLUO = toConsumeLUO.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
      return needsInteraction(addLog(ctx, `ルリグ下消費？（${nameListLUO}）`), {
        type: 'CHOOSE', count: 1,
        options: [
          { id: 'consume', label: `ルリグ下（${nameListLUO}）をルリグトラッシュへ`, action: consumeActLUO as EffectAction, available: true },
          { id: 'skip',    label: 'スキップ', action: noopActLUO as EffectAction, available: true },
        ],
      });
    }
    // 「センタールリグの下からカードN枚をルリグトラッシュに置く」（強制・固定枚数・WD22-016-UG/SPK06-05系）
    const centerUnderFixedM = effSOtxt.match(/センタールリグの下からカード([０-９\d]+)枚をルリグトラッシュに置く/);
    if (centerUnderFixedM) {
      const countCUF = parseInt(toHWSO(centerUnderFixedM[1]));
      const lrigStackCUF = ctx.ownerState.field.lrig;
      const underCUF = lrigStackCUF.length > 1 ? lrigStackCUF.slice(0, -1) : [];
      const toTrashCUF = underCUF.slice(-Math.min(countCUF, underCUF.length));
      if (toTrashCUF.length === 0) return done(addLog(ctx, 'ルリグの下にカードなし（固定消費）'));
      const remainCUF = underCUF.slice(0, underCUF.length - toTrashCUF.length);
      const newLrigCUF = [...remainCUF, lrigStackCUF[lrigStackCUF.length - 1]];
      const newOwnerCUF: PlayerState = {
        ...ctx.ownerState,
        field: { ...ctx.ownerState.field, lrig: newLrigCUF },
        lrig_trash: [...ctx.ownerState.lrig_trash, ...toTrashCUF],
      };
      return done(addLog({ ...ctx, ownerState: newOwnerCUF, lastProcessedCards: toTrashCUF },
        `センタールリグ下${toTrashCUF.length}枚をルリグトラッシュへ`));
    }
    // 「ルリグトラッシュからLvNのルリグをセンタールリグの下に置いてもよい」（WX13-033系）
    const fromTrashToUnderM = effSOtxt.match(/ルリグトラッシュから.*レベル([０-９\d]+).*ルリグ[１1]枚.*センタールリグの下に置いてもよい/);
    if (fromTrashToUnderM) {
      const targetLvFTU = parseInt(toHWSO(fromTrashToUnderM[1]));
      const centerTopFTU = ctx.ownerState.field.lrig.at(-1);
      const centerCardFTU = centerTopFTU ? ctx.cardMap.get(centerTopFTU) : undefined;
      const sameType = effSOtxt.includes('完全に同一のルリグタイプ');
      const candidatesFTU = ctx.ownerState.lrig_trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        if (!c) return false;
        if (parseInt(c.Level ?? '') !== targetLvFTU) return false;
        if (sameType && centerCardFTU) {
          return c.CardClass === centerCardFTU.CardClass || c.Story === centerCardFTU.Story;
        }
        return true;
      });
      if (candidatesFTU.length === 0) return done(addLog(ctx, `ルリグトラッシュにLv${targetLvFTU}のルリグなし`));
      const noopFTU: SequenceAction = { type: 'SEQUENCE', steps: [] };
      const opts = [
        ...candidatesFTU.map(cn => ({
          id: cn,
          label: `${ctx.cardMap.get(cn)?.CardName ?? cn}をセンタールリグ下に置く`,
          action: { type: 'STUB', id: 'INTERNAL_PLACE_LRIG_UNDER_CENTER', value: cn } as StubAction as EffectAction,
          available: true,
        })),
        { id: 'skip', label: 'スキップ', action: noopFTU as EffectAction, available: true },
      ];
      return needsInteraction(addLog(ctx, 'センタールリグ下に置くルリグを選択'), { type: 'CHOOSE', count: 1, options: opts });
    }
    // 「センタールリグの下からカードを好きな枚数対象とし、それらをルリグトラッシュに置く」
    if (effSOtxt.match(/センタールリグの下からカードを好きな枚数対象とし.*ルリグトラッシュに置く/)) {
      const lrigStackSO = ctx.ownerState.field.lrig;
      const underCardsSO = lrigStackSO.length > 1 ? lrigStackSO.slice(0, -1) : [];
      if (underCardsSO.length === 0) return done(addLog(ctx, 'ルリグの下にカードなし'));
      // 全カードをルリグトラッシュへ（簡易：任意枚数→全枚）
      const newLrigSO2 = [lrigStackSO[lrigStackSO.length - 1]]; // トップのみ残す
      const newOwnerSO2: PlayerState = {
        ...ctx.ownerState,
        field: { ...ctx.ownerState.field, lrig: newLrigSO2 },
        lrig_trash: [...ctx.ownerState.lrig_trash, ...underCardsSO],
      };
      return done(addLog({ ...ctx, ownerState: newOwnerSO2, lastProcessedCards: underCardsSO },
        `センタールリグ下${underCardsSO.length}枚をルリグトラッシュへ`));
    }
    // 「他のルリグの下にあるすべてのカードをこのルリグの下に置く」（チームルリグ統合）
    if (effSOtxt.match(/他のルリグの下にあるすべてのカードをこのルリグの下に置く/)) {
      const assistLSO = ctx.ownerState.field.assist_lrig_l ?? [];
      const assistRSO = ctx.ownerState.field.assist_lrig_r ?? [];
      // アシストルリグの下のカード（スタックのトップ以外）を収集
      const underLSO = assistLSO.length > 1 ? assistLSO.slice(0, -1) : [];
      const underRSO = assistRSO.length > 1 ? assistRSO.slice(0, -1) : [];
      const allUnderSO = [...underLSO, ...underRSO];
      if (allUnderSO.length === 0) return done(addLog(ctx, '他ルリグの下にカードなし'));
      // センタールリグのスタック下に追加（古いカードが先頭）
      const newLrigSO = [...allUnderSO, ...ctx.ownerState.field.lrig];
      // アシストルリグのトップのみ残す
      const newAssistLSO = assistLSO.length > 0 ? [assistLSO[assistLSO.length - 1]] : [];
      const newAssistRSO = assistRSO.length > 0 ? [assistRSO[assistRSO.length - 1]] : [];
      const newOwnerSO: PlayerState = {
        ...ctx.ownerState,
        field: { ...ctx.ownerState.field, lrig: newLrigSO, assist_lrig_l: newAssistLSO, assist_lrig_r: newAssistRSO },
      };
      return done(addLog({ ...ctx, ownerState: newOwnerSO }, `他ルリグ下${allUnderSO.length}枚をセンタールリグ下に統合`));
    }
    // 汎用フォールバック: ソースシグニの下にソウルがあれば消費するインタラクションを提示
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
            { id: 'consume', label: `ソウル（${soulNameSO2}）を使用`, action: consumeSO2 as EffectAction, available: true },
            { id: 'skip', label: 'スキップ', action: noopSO2 as EffectAction, available: true },
          ],
        };
        return needsInteraction(addLog(ctx, 'ソウルを使用しますか？'), pendingSO2);
      }
    }
    return done(addLog(ctx, 'ソウル操作'));
  }
  // INTERNAL_CONSUME_SOUL: ソースシグニの下にあるソウルカードをルリグトラッシュへ
  if (stub.id === 'INTERNAL_CONSUME_SOUL') {
    const srcICS = ctx.sourceCardNum;
    if (!srcICS) return done(addLog(ctx, 'ソウル消費：ソースなし'));
    const ziICS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcICS);
    if (ziICS < 0) return done(addLog(ctx, 'ソウル消費：シグニがフィールドにいない'));
    const stackICS = ctx.ownerState.field.signi[ziICS];
    if (!stackICS || stackICS.length < 2) return done(addLog(ctx, 'ソウル消費：ソウルなし'));
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
      `ソウル（${ctx.cardMap.get(soulCardICS)?.CardName ?? soulCardICS}）を消費してルリグトラッシュへ`));
  }
  // INTERNAL_CONSUME_LRIG_UNDER: ルリグの下からN枚をルリグトラッシュへ（SOUL_OP optional消費の実行部）
  if (stub.id === 'INTERNAL_CONSUME_LRIG_UNDER') {
    const countICLU = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '1'));
    const lrigStackICLU = ctx.ownerState.field.lrig;
    if (lrigStackICLU.length <= 1) return done(addLog(ctx, 'ルリグの下にカードなし'));
    const underICLU = lrigStackICLU.slice(0, -1);
    const toConsumeICLU = underICLU.slice(-Math.min(countICLU, underICLU.length));
    const remainICLU = underICLU.slice(0, underICLU.length - toConsumeICLU.length);
    const newLrigICLU = [...remainICLU, lrigStackICLU[lrigStackICLU.length - 1]];
    const newOwnerICLU: PlayerState = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, lrig: newLrigICLU },
      lrig_trash: [...ctx.ownerState.lrig_trash, ...toConsumeICLU],
    };
    const nameListICLU = toConsumeICLU.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, ownerState: newOwnerICLU, lastProcessedCards: toConsumeICLU },
      `ルリグ下（${nameListICLU}）をルリグトラッシュへ`));
  }
  // INTERNAL_PLACE_LRIG_UNDER_CENTER: ルリグトラッシュから選択ルリグをセンタールリグ下に配置
  if (stub.id === 'INTERNAL_PLACE_LRIG_UNDER_CENTER') {
    const cnIPLUC = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    if (!cnIPLUC) return done(addLog(ctx, 'センタールリグ下配置：カードなし'));
    const newLrigTrashIPLUC = ctx.ownerState.lrig_trash.filter(x => x !== cnIPLUC);
    const newLrigIPLUC = [cnIPLUC, ...ctx.ownerState.field.lrig]; // 最下に追加
    const newOwnerIPLUC: PlayerState = {
      ...ctx.ownerState,
      lrig_trash: newLrigTrashIPLUC,
      field: { ...ctx.ownerState.field, lrig: newLrigIPLUC },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerIPLUC },
      `${ctx.cardMap.get(cnIPLUC)?.CardName ?? cnIPLUC}をセンタールリグ下に配置`));
  }
  // デッキを見て並べ替え（STUB版：動的パース）
  if (stub.id === 'LOOK_AND_REORDER') {
    const srcLOR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLOR = srcLOR ? (srcLOR.EffectText ?? '') + ' ' + (srcLOR.BurstText ?? '') : '';
    const toHWL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 「残りをデッキに加えてシャッフルする」→ lastProcessedCardsをデッキへシャッフル
    if ((txtLOR.match(/残りをデッキに加えてシャッフルする/) || txtLOR.match(/^残りをデッキに加えてシャッフルする$/)) && ctx.lastProcessedCards && ctx.lastProcessedCards.length > 0) {
      const cards = ctx.lastProcessedCards;
      const newDeck = shuffle([...ctx.ownerState.deck, ...cards]);
      const newS: PlayerState = { ...ctx.ownerState, deck: newDeck };
      return done(addLog({ ...ctx, ownerState: newS }, `残り${cards.length}枚をデッキに戻してシャッフル`));
    }
    // 「デッキ上からN枚見る」→ LOOK_AND_REORDER インタラクション
    const lookM = txtLOR.match(/デッキの上(?:から)?カードを?([０-９\d]+)枚(?:を?見る|確認する)/);
    if (lookM) {
      const count = parseInt(toHWL(lookM[1]));
      const visible = ctx.ownerState.deck.slice(0, Math.min(count, ctx.ownerState.deck.length));
      if (visible.length > 0) {
        const newS: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(visible.length) };
        return needsInteraction(
          addLog({ ...ctx, ownerState: newS }, `デッキ上${visible.length}枚を確認`),
          { type: 'LOOK_AND_REORDER', cards: visible, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'top' },
        );
      }
    }
    return done(addLog(ctx, 'デッキを見て並べ替え（スキップ）'));
  }
  // デッキ上をライフクロスに加える
  if (stub.id === 'DECK_TOP_TO_LIFE') {
    const srcDTL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDTL = srcDTL ? (srcDTL.EffectText ?? '') + ' ' + (srcDTL.BurstText ?? '') : '';
    const toHWD = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 枚数の解析（デフォルト1枚）
    const cntM = txtDTL.match(/デッキの一番上(?:から)?([０-９\d]+)枚のカードをライフクロスに/);
    const addCount = cntM ? parseInt(toHWD(cntM[1])) : 1;
    // 対象プレイヤーの判断
    const oppPattern = /対戦相手のデッキの一番上のカードをライフクロスに/;
    const owner = oppPattern.test(txtDTL) ? 'opponent' : 'self';
    const st = ownerState(owner, ctx);
    if (st.deck.length === 0) return done(addLog(ctx, 'デッキなし（ライフ追加）'));
    const toAdd = st.deck.slice(0, Math.min(addCount, st.deck.length));
    const newS: PlayerState = {
      ...st,
      deck: st.deck.slice(toAdd.length),
      life_cloth: [...toAdd, ...st.life_cloth],
    };
    return done(addLog(setOwnerState(owner, newS, ctx), `デッキ上${toAdd.length}枚をライフクロスに加えた`));
  }
  // カウント基準ドロー/パワー（lastProcessedCardsの枚数だけドロー or パワー修正）
  if (stub.id === 'COUNT_BASED_DRAW_OR_POWER') {
    const srcCBDP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCBDP = srcCBDP ? (srcCBDP.EffectText ?? '') + ' ' + (srcCBDP.BurstText ?? '') : '';
    const toHWCBDP = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const processed = ctx.lastProcessedCards ?? [];
    const count = processed.length;
    // 「捨てた枚数のカードを引く」パターン
    if (txtCBDP.match(/(?:捨てた|置かれた|ダウンした).*枚数.*(?:引く|カードを引)/)) {
      const bonusM = txtCBDP.match(/枚数に([０-９\d]+)を加えた枚数/);
      const bonus = bonusM ? parseInt(toHWCBDP(bonusM[1])) : 0;
      const drawCount = count + bonus;
      if (drawCount > 0) {
        const s = ctx.ownerState;
        const canDraw = Math.min(drawCount, s.deck.length);
        const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
        return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}枚ドロー（処理${count}枚${bonus > 0 ? `+${bonus}` : ''}）`));
      }
      return done(addLog(ctx, 'ドロー0枚（カウントなし）'));
    }
    // 「捨てた枚数につきパワー±N」パターン
    const perM = txtCBDP.match(/(?:捨てた|置かれた).*枚数.*([＋－][０-９\d]+)/);
    if (perM) {
      const delta = parseInt(toHWCBDP(perM[1]).replace('＋', '+').replace('－', '-')) * count;
      if (delta !== 0) {
        const mods = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) mods.push({ cardNum: top, delta });
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: mods } },
          `パワー${delta > 0 ? '+' : ''}${delta}（処理${count}枚）`));
      }
    }
    // スタンドアロン: ゲーム状態カウントベースのドロー/パワー
    if (count === 0) {
      const toSignedCBDP = (s: string) => parseInt(toHWCBDP(s).replace('＋','+').replace('－','-'));
      // 「手札をN枚まで捨てる：枚数ドロー or 枚数のシグニパワー修正」パターン（インタラクティブ）
      const discardCostMCBDP = txtCBDP.match(/手札を([０-９\d]+)枚まで捨てる/);
      if (discardCostMCBDP) {
        const maxDiscardCBDP = parseInt(toHWCBDP(discardCostMCBDP[1]));
        const handCardsCBDP = ctx.ownerState.hand;
        if (handCardsCBDP.length === 0) return done(addLog(ctx, '手札なし（捨てスキップ）'));
        const noopSCBDP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
        const contSCBDP: StubAction = { type: 'STUB', id: 'INTERNAL_CBDOP_AFTER_DISCARD' };
        const hasPwrDownCBDP = !!txtCBDP.match(/枚数.*パワー|パワー.*枚数/);
        const logMsgCBDP = hasPwrDownCBDP
          ? `手札を${maxDiscardCBDP}枚まで捨て、その枚数だけ相手シグニのパワーを修正`
          : `手札を${maxDiscardCBDP}枚まで捨て、その枚数引く`;
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
      // "エナゾーン(?:のカード)?N枚につき(N枚)カードを引く"
      const enaDrawM = txtCBDP.match(/エナゾーン(?:のカード)?([０-９\d]*)枚につき(?:カードを)?([０-９\d]*)枚(?:ドロー|引く)/);
      if (enaDrawM) {
        const div = parseInt(toHWCBDP(enaDrawM[1] || '1')) || 1;
        const drawPerDiv = parseInt(toHWCBDP(enaDrawM[2] || '1')) || 1;
        const drawCount = Math.floor(ctx.ownerState.energy.length / div) * drawPerDiv;
        if (drawCount > 0) {
          const s = ctx.ownerState;
          const canDraw = Math.min(drawCount, s.deck.length);
          const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
          return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}枚ドロー（エナ${ctx.ownerState.energy.length}枚÷${div}）`));
        }
        return done(addLog(ctx, 'エナゾーン基準ドロー（0枚）'));
      }
      // "手札N枚につき(N枚)カードを引く"
      const handDrawM = txtCBDP.match(/手札([０-９\d]*)枚につき(?:カードを)?([０-９\d]*)枚(?:ドロー|引く)/);
      if (handDrawM) {
        const div = parseInt(toHWCBDP(handDrawM[1] || '1')) || 1;
        const drawPerDiv = parseInt(toHWCBDP(handDrawM[2] || '1')) || 1;
        const drawCount = Math.floor(ctx.ownerState.hand.length / div) * drawPerDiv;
        if (drawCount > 0) {
          const s = ctx.ownerState;
          const canDraw = Math.min(drawCount, s.deck.length);
          const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
          return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}枚ドロー（手札${ctx.ownerState.hand.length}枚÷${div}）`));
        }
        return done(addLog(ctx, '手札基準ドロー（0枚）'));
      }
      // "登録者数N万人につき(N枚)カードを引く"
      const subDrawM = txtCBDP.match(/登録者数([０-９\d]*)万人につき(?:カードを)?([０-９\d]*)枚(?:ドロー|引く)/);
      if (subDrawM) {
        const div = parseInt(toHWCBDP(subDrawM[1] || '1')) || 1;
        const drawPerDiv = parseInt(toHWCBDP(subDrawM[2] || '1')) || 1;
        const drawCount = Math.floor((ctx.ownerState.subscriber_count ?? 0) / div) * drawPerDiv;
        if (drawCount > 0) {
          const s = ctx.ownerState;
          const canDraw = Math.min(drawCount, s.deck.length);
          const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
          return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}枚ドロー（登録者数${ctx.ownerState.subscriber_count ?? 0}万人÷${div}）`));
        }
        return done(addLog(ctx, '登録者数基準ドロー（0枚）'));
      }
      // "フィールドのシグニN体につき±X"
      const fieldPwM = txtCBDP.match(/フィールド.*シグニ([０-９\d]*)体につき([＋＋\-－][０-９\d]+)/);
      if (fieldPwM) {
        const div = parseInt(toHWCBDP(fieldPwM[1] || '1')) || 1;
        const ownSigniCount = ctx.ownerState.field.signi.filter(s => s && s.length > 0).length;
        const delta = Math.floor(ownSigniCount / div) * toSignedCBDP(fieldPwM[2]);
        if (delta !== 0 && ctx.sourceCardNum) {
          const mods = [...(ctx.ownerState.temp_power_mods ?? [])];
          mods.push({ cardNum: ctx.sourceCardNum, delta });
          return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: mods } },
            `ソースシグニパワー${delta > 0 ? '+' : ''}${delta}（フィールド${ownSigniCount}体）`));
        }
      }
    }
    return done(addLog(ctx, `カウント基準効果（処理${count}枚）`));
  }
  // INTERNAL: 手札捨て後の効果（COUNT_BASED_DRAW_OR_POWER から継続）
  if (stub.id === 'INTERNAL_CBDOP_AFTER_DISCARD') {
    const selectedICD = ctx.lastProcessedCards ?? [];
    const countICD = selectedICD.length;
    // 選択カードを手札からトラッシュへ
    let newOwnerICD = { ...ctx.ownerState };
    for (const cn of selectedICD) {
      const hi = newOwnerICD.hand.indexOf(cn);
      if (hi >= 0) {
        const newH = [...newOwnerICD.hand]; newH.splice(hi, 1);
        newOwnerICD = { ...newOwnerICD, hand: newH, trash: [...newOwnerICD.trash, cn] };
      }
    }
    if (countICD === 0) return done(addLog({ ...ctx, ownerState: newOwnerICD }, '捨てなし（効果スキップ）'));
    const ctxICD = { ...ctx, ownerState: newOwnerICD };
    const srcICD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtICD = srcICD ? (srcICD.EffectText ?? '') + ' ' + (srcICD.BurstText ?? '') : '';
    const toHWICD = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 「捨てたカードの枚数（に1を加えた枚数）カードを引く」
    if (txtICD.match(/捨てたカードの枚数|枚数に等しい枚数.*引く|枚数のカードを引く/)) {
      const bonusM = txtICD.match(/枚数に([０-９\d]+)を加えた枚数/);
      const bonus = bonusM ? parseInt(toHWICD(bonusM[1])) : 0;
      const drawCount = countICD + bonus;
      const canDraw = Math.min(drawCount, ctxICD.ownerState.deck.length);
      const newS: PlayerState = {
        ...ctxICD.ownerState,
        hand: [...ctxICD.ownerState.hand, ...ctxICD.ownerState.deck.slice(0, canDraw)],
        deck: ctxICD.ownerState.deck.slice(canDraw),
      };
      return done(addLog({ ...ctxICD, ownerState: newS }, `手札${countICD}枚捨て→${drawCount}枚ドロー`));
    }
    // 「枚数と同じ数の相手シグニのパワーを-N」
    const pwrM = txtICD.match(/それぞれ([＋－][０-９\d]+)/);
    if (pwrM || txtICD.match(/枚数.*パワー.*([＋－][０-９\d]+)/)) {
      const rawDelta = pwrM
        ? pwrM[1]
        : (txtICD.match(/パワー.*([＋－][０-９\d]+)/)?.[1] ?? '－5000');
      const delta = parseInt(toHWICD(rawDelta).replace('＋', '+').replace('－', '-'));
      const oppSigniAll = ([0, 1, 2] as const)
        .map(i => ctxICD.otherState.field.signi[i]?.at(-1))
        .filter((cn): cn is string => !!cn);
      const targets = oppSigniAll.slice(0, countICD);
      if (targets.length === 0) return done(addLog(ctxICD, 'パワー修正：相手シグニなし'));
      const mods = [...(ctxICD.otherState.temp_power_mods ?? [])];
      for (const cn of targets) mods.push({ cardNum: cn, delta });
      return done(addLog(
        { ...ctxICD, otherState: { ...ctxICD.otherState, temp_power_mods: mods } },
        `手札${countICD}枚捨て→相手シグニ${targets.length}体にパワー${delta}`,
      ));
    }
    return done(addLog(ctxICD, `手札${countICD}枚捨て（効果適用不明）`));
  }
  // アーツ使用時にルリグデッキからアーツを任意でルリグトラッシュへ
  if (stub.id === 'ARTS_USE_DISCARD_LRIG_DECK') {
    const lrigDeck = ctx.ownerState.lrig_deck ?? [];
    const artsInDeck = lrigDeck.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'アーツ') return false;
      const effs = parseCardEffects(c);
      return !effs.some(e => e.effectType === 'CONTINUOUS' && e.action.type === 'STUB' && (e.action as StubAction).id === 'ARTS_IMMOVABLE');
    });
    if (artsInDeck.length === 0) return done(addLog(ctx, 'ルリグデッキにアーツなし'));
    const noopAction: SequenceAction = { type: 'SEQUENCE', steps: [] };
    // 任意なのでスキップ選択肢も提供
    const options = [
      ...artsInDeck.slice(0, 3).map(cn => ({
        id: cn,
        label: `捨てる（${ctx.cardMap.get(cn)?.CardName ?? cn}）`,
        action: { type: 'STUB', id: 'INTERNAL_DISCARD_LRIG_DECK_ARTS', value: cn } as StubAction as EffectAction,
        available: true,
      })),
      { id: 'skip', label: 'スキップ', action: noopAction as EffectAction, available: true },
    ];
    const pending: PendingInteractionDef = { type: 'CHOOSE', options, count: 1 };
    return needsInteraction(addLog(ctx, 'ルリグデッキからアーツを捨てますか？'), pending);
  }
  // INTERNAL: ルリグデッキからアーツをルリグトラッシュへ（CHOOSEの続き）
  if (stub.id === 'INTERNAL_DISCARD_LRIG_DECK_ARTS') {
    const cnArt = String(stub.value ?? '');
    if (!cnArt) return done(addLog(ctx, 'INTERNAL_DISCARD_LRIG_DECK_ARTS: value なし'));
    const lrigDeck = ctx.ownerState.lrig_deck ?? [];
    const newDeck = lrigDeck.filter(cn => cn !== cnArt);
    const newOwner = { ...ctx.ownerState, lrig_deck: newDeck, lrig_trash: [...ctx.ownerState.lrig_trash, cnArt] };
    const artName = ctx.cardMap.get(cnArt)?.CardName ?? cnArt;
    return done(addLog({ ...ctx, ownerState: newOwner }, `${artName}をルリグトラッシュへ`));
  }
  // 手札のシグニにガードアイコンを付与（このターン）
  if (stub.id === 'GRANT_GUARD_ICON_HAND_SIGNI') {
    const newOwner = { ...ctx.ownerState, hand_signi_guard_enabled: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン手札のシグニはガードに使える'));
  }
  // トラッシュからシグニをフィールドシグニの下に置く（ライズ補充）
  if (stub.id === 'TRASH_SIGNI_UNDER_FIELD_SIGNI') {
    const srcCardT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtT = srcCardT ? (srcCardT.EffectText ?? '') + ' ' + (srcCardT.BurstText ?? '') : '';
    const toHWT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 枚数（"N枚まで" or デフォルト1）
    const countMT = txtT.match(/シグニ([０-９\d]+)枚(?:まで)?を対象とし.*の下に置く/);
    const maxCountT = countMT ? parseInt(toHWT(countMT[1])) : 1;
    // レベル上限
    const lvMT = txtT.match(/レベル([０-９\d]+)以下の/);
    const maxLvT = lvMT ? parseInt(toHWT(lvMT[1])) : 99;
    // クラスフィルタ（＜X＞）
    const classM = txtT.match(/＜([^＞]+)＞のシグニ.*の下に置く/);
    const reqClass = classM?.[1];
    // 色フィルタ
    const colorM = txtT.match(/あなたのトラッシュから(白|赤|青|緑|黒)の/);
    const reqColor = colorM?.[1];
    const trashSigniT = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (!c || c.Type !== 'シグニ') return false;
      if (parseInt(c.Level ?? '0') > maxLvT) return false;
      if (reqClass && !(c.CardClass ?? '').includes(reqClass)) return false;
      if (reqColor && !(c.Color ?? '').includes(reqColor)) return false;
      return true;
    });
    if (trashSigniT.length === 0) return done(addLog(ctx, 'トラッシュにシグニなし（シグニ下配置スキップ）'));
    const noopTSU: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contTSU: StubAction = { type: 'STUB', id: 'INTERNAL_TSU_CHOOSE_ZONE' };
    return needsInteraction(addLog(ctx, 'トラッシュからシグニを選択（下に置く）'), {
      type: 'SELECT_TARGET', candidates: trashSigniT, count: Math.min(maxCountT, trashSigniT.length),
      optional: true, targetScope: 'self_trash',
      thenAction: noopTSU as EffectAction, continuation: contTSU as EffectAction,
    });
  }
  // INTERNAL_TSU_CHOOSE_ZONE: 選択トラッシュシグニをどのフィールドシグニの下に置くか選択
  if (stub.id === 'INTERNAL_TSU_CHOOSE_ZONE') {
    const rawTrash = stub.value ? String(stub.value).split(',') : (ctx.lastProcessedCards ?? []);
    if (rawTrash.length === 0) return done(addLog(ctx, 'キャンセル（下置きスキップ）'));
    const [firstTrash, ...restTrash] = rawTrash;
    const srcTSU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTSU = srcTSU ? (srcTSU.EffectText ?? '') + ' ' + (srcTSU.BurstText ?? '') : '';
    // 配置先クラスフィルタ
    const fieldClassM = txtTSU.match(/対象の.*＜([^＞]+)＞のシグニ.*体.*の下に置く|＜([^＞]+)＞のシグニ.*体.*の下に置く/);
    const reqFieldClass = fieldClassM?.[1] ?? fieldClassM?.[2];
    const fieldZones = [0, 1, 2].filter(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return false;
      if (reqFieldClass && !(ctx.cardMap.get(top)?.CardClass ?? '').includes(reqFieldClass)) return false;
      return true;
    });
    if (fieldZones.length === 0) return done(addLog(ctx, '対象フィールドシグニなし'));
    const opts = fieldZones.map(zi => {
      const top = ctx.ownerState.field.signi[zi]!.at(-1)!;
      const rest = restTrash.join(',');
      const encoded = rest ? `${firstTrash}:${zi}:${rest}` : `${firstTrash}:${zi}`;
      return {
        id: `zone_${zi}`,
        label: `${ctx.cardMap.get(top)?.CardName ?? top}の下（ゾーン${zi + 1}）`,
        action: { type: 'STUB', id: 'INTERNAL_TSU_DO_PLACE', value: encoded } as StubAction as EffectAction,
        available: true,
      };
    });
    return needsInteraction(
      addLog(ctx, `${ctx.cardMap.get(firstTrash)?.CardName ?? firstTrash}をどのシグニの下に置く？`),
      { type: 'CHOOSE', options: opts, count: 1 },
    );
  }
  // INTERNAL_TSU_DO_PLACE: トラッシュ→フィールド下配置実行、残りがあれば継続
  if (stub.id === 'INTERNAL_TSU_DO_PLACE') {
    const valStr = String(stub.value ?? '');
    const colonIdx = valStr.indexOf(':');
    const colonIdx2 = valStr.indexOf(':', colonIdx + 1);
    const trashCard = colonIdx >= 0 ? valStr.slice(0, colonIdx) : valStr;
    const zoneStr = colonIdx >= 0
      ? (colonIdx2 >= 0 ? valStr.slice(colonIdx + 1, colonIdx2) : valStr.slice(colonIdx + 1))
      : '';
    const restStr = colonIdx2 >= 0 ? valStr.slice(colonIdx2 + 1) : '';
    const zone = parseInt(zoneStr);
    if (!trashCard || isNaN(zone)) return done(addLog(ctx, '配置情報なし'));
    const newTrashITP = ctx.ownerState.trash.filter(c => c !== trashCard);
    const newSigniITP = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniITP[zone] = [trashCard, ...(newSigniITP[zone] ?? [])];
    const newOwnerITP = { ...ctx.ownerState, trash: newTrashITP, field: { ...ctx.ownerState.field, signi: newSigniITP } };
    const ctxITP = addLog({ ...ctx, ownerState: newOwnerITP },
      `${ctx.cardMap.get(trashCard)?.CardName ?? trashCard}をゾーン${zone + 1}のシグニの下に配置`);
    // 残りのトラッシュカードがあれば次の選択へ
    if (restStr) {
      const nextStub: StubAction = { type: 'STUB', id: 'INTERNAL_TSU_CHOOSE_ZONE', value: restStr };
      return exec(nextStub as EffectAction, ctxITP);
    }
    return done(ctxITP);
  }
  // ルリグリミット修正（エナフェイズ終了まで）
  if (stub.id === 'LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END') {
    const srcL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtL = srcL ? (srcL.EffectText ?? '') + ' ' + (srcL.BurstText ?? '') : '';
    const toHWL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    let newCtxL = ctx;
    const logs: string[] = [];
    // 自分のリミット変更（「あなたの...リミットを＋N/－N」または単純に「リミットを」）
    const selfMinusM = txtL.match(/(?:あなたの)?.*リミットを([－-])([０-９\d]+)/);
    const selfPlusM = txtL.match(/(?:あなたの)?.*リミットを([＋+]?)([０-９\d]+)(?:にする|増やす|する|し)/);
    const selfPlusM2 = txtL.match(/(?:あなたの)?.*リミットを＋([０-９\d]+)/);
    // 相手のリミット変更（「対戦相手の...リミットを」）
    const oppMinusM = txtL.match(/対戦相手.*リミットを([－-])([０-９\d]+)/);
    const oppPlusM = txtL.match(/対戦相手.*リミットを＋([０-９\d]+)/);
    // 自分側
    if (!oppMinusM && !oppPlusM) {
      let deltaOwn = 1;
      if (selfMinusM && !selfMinusM[0].includes('対戦相手')) {
        deltaOwn = -parseInt(toHWL(selfMinusM[2]));
      } else if (selfPlusM && !selfPlusM[0].includes('対戦相手')) {
        deltaOwn = parseInt(toHWL(selfPlusM[2]));
      } else if (selfPlusM2 && !selfPlusM2[0].includes('対戦相手')) {
        deltaOwn = parseInt(toHWL(selfPlusM2[1]));
      }
      const newModOwn = (newCtxL.ownerState.lrig_limit_mod ?? 0) + deltaOwn;
      newCtxL = { ...newCtxL, ownerState: { ...newCtxL.ownerState, lrig_limit_mod: newModOwn } };
      logs.push(`自リミット${deltaOwn > 0 ? '+' : ''}${deltaOwn}`);
    }
    // 相手側
    if (oppMinusM) {
      const deltaOpp = -parseInt(toHWL(oppMinusM[2]));
      const newModOpp = (newCtxL.otherState.lrig_limit_mod ?? 0) + deltaOpp;
      newCtxL = { ...newCtxL, otherState: { ...newCtxL.otherState, lrig_limit_mod: newModOpp } };
      logs.push(`相手リミット${deltaOpp}`);
    } else if (oppPlusM) {
      const deltaOpp = parseInt(toHWL(oppPlusM[1]));
      const newModOpp = (newCtxL.otherState.lrig_limit_mod ?? 0) + deltaOpp;
      newCtxL = { ...newCtxL, otherState: { ...newCtxL.otherState, lrig_limit_mod: newModOpp } };
      logs.push(`相手リミット+${deltaOpp}`);
    }
    if (logs.length === 0) {
      // フォールバック: リミット+1
      newCtxL = { ...newCtxL, ownerState: { ...newCtxL.ownerState, lrig_limit_mod: (newCtxL.ownerState.lrig_limit_mod ?? 0) + 1 } };
      logs.push('リミット+1（デフォルト）');
    }
    return done(addLog(newCtxL, `${logs.join(' / ')}（エナフェイズ終了まで）`));
  }
  // 捨てた枚数基準パワー修正
  if (stub.id === 'POWER_MOD_BY_DISCARD_COUNT_HIGH') {
    const count = (ctx.lastProcessedCards ?? []).length;
    if (count === 0) return done(addLog(ctx, 'パワー修正（捨てた0枚）'));
    const srcPH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPH = srcPH ? (srcPH.EffectText ?? '') + ' ' + (srcPH.BurstText ?? '') : '';
    const toHWPH = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPH = txtPH.match(/枚につき([－＋][０-９\d]+)/);
    const deltaPerCard = mPH ? parseInt(toHWPH(mPH[1]).replace('－', '-').replace('＋', '+')) : -3000;
    const totalDelta = deltaPerCard * count;
    const mods = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (top) mods.push({ cardNum: top, delta: totalDelta });
    }
    const newOther = { ...ctx.otherState, temp_power_mods: mods };
    return done(addLog({ ...ctx, otherState: newOther },
      `パワー${totalDelta}（${count}枚捨て×${deltaPerCard}）`));
  }
  // デッキ上2枚を見てクラスシグニをエナへ、残りをデッキ上へ
  if (stub.id === 'REVEAL_PICK_CLASS_TO_ENERGY') {
    const srcRPC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRPC = srcRPC ? (srcRPC.EffectText ?? '') + ' ' + (srcRPC.BurstText ?? '') : '';
    const classMatchRPC = txtRPC.match(/[<＜]([^>＞]+)[>＞]のシグニ.*エナゾーンに置く/);
    const targetClassRPC = classMatchRPC?.[1];
    const viewedRPC = (ctx.lastProcessedCards ?? []).length > 0 ? ctx.lastProcessedCards! : ctx.ownerState.deck.slice(0, 2);
    if (viewedRPC.length === 0) return done(addLog(ctx, 'デッキなし（REVEAL_PICK_CLASS_TO_ENERGY）'));
    const toEnergyRPC = viewedRPC.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (!targetClassRPC || c.CardClass?.includes(targetClassRPC));
    });
    const toTopRPC = viewedRPC.filter(cn => !toEnergyRPC.includes(cn));
    let newDeckRPC = [...ctx.ownerState.deck];
    for (const cn of [...toEnergyRPC, ...toTopRPC]) {
      const idx = newDeckRPC.indexOf(cn); if (idx >= 0) newDeckRPC.splice(idx, 1);
    }
    newDeckRPC = [...toTopRPC, ...newDeckRPC];
    const newOwnerRPC = { ...ctx.ownerState, deck: newDeckRPC, energy: [...ctx.ownerState.energy, ...toEnergyRPC] };
    const enamesRPC = toEnergyRPC.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, ownerState: newOwnerRPC },
      `${enamesRPC || 'なし'}をエナゾーンへ、残り${toTopRPC.length}枚をデッキ上へ`));
  }
  // ガードアイコンなしカードを捨てたとき、そのカードをエナへ
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
    return done(addLog({ ...ctx, ownerState: newOwnerNGD }, 'ガードなしカードをエナゾーンへ'));
  }
  // トラッシュに置かれたカードを手札かエナに
  if (stub.id === 'TRASHED_CARD_TO_HAND_OR_ENERGY') {
    // lastProcessedCards優先、なければtrash末尾を使用
    const targetTCTE = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetTCTE || !ctx.ownerState.trash.includes(targetTCTE)) {
      return done(addLog(ctx, 'トラッシュにカードなし（TRASHED_CARD_TO_HAND_OR_ENERGY）'));
    }
    const cardNameTCTE = ctx.cardMap.get(targetTCTE)?.CardName ?? targetTCTE;
    const toHandTCTE: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_HAND' };
    const toEnaTCTE: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_ENERGY' };
    return needsInteraction(addLog(ctx, `${cardNameTCTE}を手札かエナゾーンへ`), {
      type: 'CHOOSE', count: 1, options: [
        { id: 'hand', label: '手札に加える', action: toHandTCTE as EffectAction, available: true },
        { id: 'energy', label: 'エナゾーンへ', action: toEnaTCTE as EffectAction, available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_TRASHED_TO_HAND') {
    const selected = ctx.lastProcessedCards ?? [];
    const target = selected[0];
    if (!target) return done(addLog(ctx, 'INTERNAL_TRASHED_TO_HAND: 対象なし'));
    const ti = ctx.ownerState.trash.indexOf(target);
    if (ti < 0) return done(addLog(ctx, '対象がトラッシュにない'));
    const newTrash = [...ctx.ownerState.trash]; newTrash.splice(ti, 1);
    const newOwner = { ...ctx.ownerState, trash: newTrash, hand: [...ctx.ownerState.hand, target] };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(target)?.CardName ?? target}を手札に`));
  }
  if (stub.id === 'INTERNAL_TRASHED_TO_ENERGY') {
    const selected = ctx.lastProcessedCards ?? [];
    const target = selected[0];
    if (!target) return done(addLog(ctx, 'INTERNAL_TRASHED_TO_ENERGY: 対象なし'));
    const ti = ctx.ownerState.trash.indexOf(target);
    if (ti < 0) return done(addLog(ctx, '対象がトラッシュにない'));
    const newTrash = [...ctx.ownerState.trash]; newTrash.splice(ti, 1);
    const newOwner = { ...ctx.ownerState, trash: newTrash, energy: [...ctx.ownerState.energy, target] };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(target)?.CardName ?? target}をエナゾーンに`));
  }
  // 相手シグニ複数をエナに置く
  if (stub.id === 'MULTI_SIGNI_TO_ENERGY') {
    const srcMSE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMSE = srcMSE ? (srcMSE.EffectText ?? '') + ' ' + (srcMSE.BurstText ?? '') : '';
    const toHWMSE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMMSE = txtMSE.match(/シグニ([０-９\d]+)体まで/);
    const maxMSE = maxMMSE ? parseInt(toHWMSE(maxMMSE[1])) : 2;
    const oppCandsMSE = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsMSE.length === 0) return done(addLog(ctx, '相手フィールドにシグニなし'));
    const toEnergyMSE: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_SIGNI_TO_ENERGY_EXEC' };
    return selectOrInteract(oppCandsMSE, maxMSE, false, 'opp_field', toEnergyMSE as EffectAction, undefined, ctx);
  }
  if (stub.id === 'INTERNAL_OPP_SIGNI_TO_ENERGY_EXEC') {
    const selectedIOSE = ctx.lastProcessedCards ?? [];
    if (selectedIOSE.length === 0) return done(addLog(ctx, 'エナへ（対象なし）'));
    let newOtherIOSE = ctx.otherState;
    let countIOSE = 0;
    for (const cn of selectedIOSE) {
      if (!newOtherIOSE.field.signi.some(s => s?.at(-1) === cn)) continue;
      const removedIOSE = removeFromField(cn, newOtherIOSE);
      newOtherIOSE = { ...removedIOSE, energy: [...removedIOSE.energy, cn] };
      countIOSE++;
    }
    const namesIOSE = selectedIOSE.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, otherState: newOtherIOSE },
      countIOSE > 0 ? `${namesIOSE}→相手エナゾーン` : 'エナへ（対象なし）'));
  }
  // 相手シグニをデッキに加えてシャッフル
  if (stub.id === 'OPP_SIGNI_TO_DECK_AND_SHUFFLE') {
    const oppCandsSDS = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsSDS.length === 0) return done(addLog(ctx, '相手フィールドにシグニなし'));
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
    return needsInteraction(addLog(ctx, '相手シグニ1体をデッキに加えてシャッフル'), pendingSDS);
  }
  if (stub.id === 'INTERNAL_OPP_SIGNI_TO_DECK_SHUFFLE') {
    const selected = ctx.lastProcessedCards ?? [];
    if (selected.length === 0) return done(addLog(ctx, '選択なし'));
    let newOther = { ...ctx.otherState };
    for (const cn of selected) {
      newOther = removeFromField(cn, newOther);
      const shuffled = [...newOther.deck, cn].sort(() => Math.random() - 0.5);
      newOther = { ...newOther, deck: shuffled };
    }
    const names = selected.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, otherState: newOther }, `${names}をデッキに加えてシャッフル`));
  }
  // 手札のクラスシグニを好きな枚数公開（公開＝SELECT_TARGET、デッキに触れない）
  if (stub.id === 'REVEAL_CLASS_SIGNI_FROM_HAND') {
    const srcRev = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRev = srcRev ? (srcRev.EffectText ?? '') + ' ' + (srcRev.BurstText ?? '') : '';
    const classMatchRev = txtRev.match(/手札から(?:それぞれ名前の異なる)?[<＜]([^>＞]+)[>＞]のシグニ/);
    const targetClassRev = classMatchRev?.[1];
    const handCands = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'シグニ') return false;
      if (targetClassRev && !c.CardClass?.includes(targetClassRev)) return false;
      return true;
    });
    if (handCands.length === 0) return done(addLog(ctx, `手札に${targetClassRev ?? 'クラス'}シグニなし（公開スキップ）`));
    const noopAction: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(handCands, handCands.length, true, 'self_hand', noopAction as EffectAction, undefined, ctx);
  }
  // 対戦相手が自分のシグニを選んでエナに置く
  if (stub.id === 'OPP_CHOOSE_OWN_SIGNI_TO_ENERGY') {
    const srcOCS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOCS = srcOCS ? (srcOCS.EffectText ?? '') + ' ' + (srcOCS.BurstText ?? '') : '';
    const toHWOCS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const powerLimitM = txtOCS.match(/パワー([０-９\d]+)以上のシグニ/);
    const powerLimit = powerLimitM ? parseInt(toHWOCS(powerLimitM[1])) : 0;
    const oppCands = ctx.otherState.field.signi
      .map(s => s?.at(-1))
      .filter((cn): cn is string => {
        if (!cn) return false;
        const pw = ctx.effectivePowers?.get(cn) ?? parseInt(ctx.cardMap.get(cn)?.Power ?? '0');
        return pw >= powerLimit;
      });
    if (oppCands.length === 0) return done(addLog(ctx, '対象シグニなし（相手エナ置きスキップ）'));
    // 相手がシグニを選ぶ（opponentResponds: true）→ INTERNAL_OPP_FIELD_TO_ENERGY でエナゾーンに移動
    const moveToEnaAction: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_FIELD_TO_ENERGY' };
    const pendingOCS: PendingInteractionDef = {
      type: 'SELECT_TARGET',
      candidates: oppCands,
      count: 1,
      optional: false,
      targetScope: 'opp_field',
      thenAction: moveToEnaAction as EffectAction,
      opponentResponds: true,
    };
    return needsInteraction(addLog(ctx, `対戦相手はパワー${powerLimit}以上のシグニ1体をエナゾーンに置く`), pendingOCS);
  }
  // INTERNAL_OPP_FIELD_TO_ENERGY: lastProcessedCards[0]を相手フィールドからエナゾーンへ移動
  if (stub.id === 'INTERNAL_OPP_FIELD_TO_ENERGY') {
    const targetIOFTE = ctx.lastProcessedCards?.[0];
    if (!targetIOFTE) return done(addLog(ctx, '対象なし（INTERNAL_OPP_FIELD_TO_ENERGY）'));
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
      `${ctx.cardMap.get(targetIOFTE)?.CardName ?? targetIOFTE}→相手エナゾーンへ`));
  }
  // 自シグニを他の空きシグニゾーンに移動（してもよい）
  if (stub.id === 'MOVE_TO_OTHER_SIGNI_ZONE') {
    const srcMov = ctx.sourceCardNum;
    if (!srcMov) return done(addLog(ctx, 'ゾーン移動：ソースカードなし'));
    const currentZone = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcMov);
    if (currentZone < 0) return done(addLog(ctx, 'ゾーン移動：フィールドにいない'));
    const emptyZones = [0, 1, 2].filter(i =>
      i !== currentZone && (!ctx.ownerState.field.signi[i] || ctx.ownerState.field.signi[i]!.length === 0));
    if (emptyZones.length === 0) return done(addLog(ctx, 'ゾーン移動：空きゾーンなし'));
    const moveOptions = emptyZones.map(zi => ({
      id: `zone_${zi}`,
      label: `ゾーン${zi + 1}に移動`,
      action: ({ type: 'STUB', id: 'INTERNAL_MOVE_TO_ZONE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    moveOptions.push({ id: 'skip', label: 'スキップ',
      action: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction) as EffectAction,
      available: true });
    const pendingMov: PendingInteractionDef = { type: 'CHOOSE', options: moveOptions, count: 1 };
    return needsInteraction(addLog(ctx, '他のシグニゾーンに移動してもよい'), pendingMov);
  }
  if (stub.id === 'INTERNAL_MOVE_TO_ZONE') {
    const srcZ = ctx.sourceCardNum;
    const targetZoneNum = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    if (!srcZ) return done(addLog(ctx, 'ゾーン移動：ソースカードなし'));
    const curZone = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcZ);
    if (curZone < 0 || curZone === targetZoneNum) return done(addLog(ctx, 'ゾーン移動：ゾーン特定不可'));
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
      `${ctx.cardMap.get(srcZ)?.CardName ?? srcZ}をゾーン${curZone + 1}→ゾーン${targetZoneNum + 1}に移動`);
    // 「効果によって移動したとき、パワー+N」テキストがあれば即時適用
    const movTxt = ctx.cardMap.get(srcZ)?.EffectText ?? '';
    const movPwrM = movTxt.match(/移動したとき.*パワーを＋([０-９\d]+)/);
    if (movPwrM) {
      const toHWMov = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const boost = parseInt(toHWMov(movPwrM[1]));
      const modsM = [...(ctxMov.ownerState.temp_power_mods ?? [])];
      modsM.push({ cardNum: srcZ, delta: boost });
      ctxMov = addLog({ ...ctxMov, ownerState: { ...ctxMov.ownerState, temp_power_mods: modsM } },
        `${ctx.cardMap.get(srcZ)?.CardName ?? srcZ}のパワー+${boost}（ターン終了時まで）`);
    }
    return done(ctxMov);
  }
  // ソウル付与（ルリグの下カードを選択シグニに付与）
  if (stub.id === 'INTERNAL_ATTACH_SOUL_FROM_LRIG') {
    const targetSigniAS = (ctx.lastProcessedCards ?? [])[0];
    const soulCardAS = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    if (!targetSigniAS || !soulCardAS) return done(addLog(ctx, 'ソウル付与：対象またはカードなし'));
    const zoneIdxAS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === targetSigniAS);
    if (zoneIdxAS < 0) return done(addLog(ctx, 'ソウル付与：対象シグニが場にない'));
    // ルリグ直下から取り出す（スタックの2番目から末尾-1、一番下のカード）
    const lrigStackAS = ctx.ownerState.field.lrig;
    const newLrigAS = lrigStackAS.filter(cn => cn !== soulCardAS);
    // ソウルとして設定
    const newSoulAS = [...(ctx.ownerState.field.signi_soul ?? [null, null, null])];
    // 既存ソウルがあればlrig_trashへ
    const prevSoulAS = newSoulAS[zoneIdxAS];
    newSoulAS[zoneIdxAS] = soulCardAS;
    const newOwnerAS: PlayerState = {
      ...ctx.ownerState,
      lrig_trash: prevSoulAS ? [...ctx.ownerState.lrig_trash, prevSoulAS] : ctx.ownerState.lrig_trash,
      field: { ...ctx.ownerState.field, lrig: newLrigAS, signi_soul: newSoulAS as (string | null)[] },
    };
    const signName = ctx.cardMap.get(targetSigniAS)?.CardName ?? targetSigniAS;
    const soulName = ctx.cardMap.get(soulCardAS)?.CardName ?? soulCardAS;
    return done(addLog({ ...ctx, ownerState: newOwnerAS }, `${soulName}を${signName}の【ソウル】に付与`));
  }
  // ソウル付与（ルリグトラッシュからルリグを選択シグニに付与）
  if (stub.id === 'INTERNAL_CHOOSE_SOUL_LRIG') {
    const targetSigniCSL = (ctx.lastProcessedCards ?? [])[0];
    if (!targetSigniCSL) return done(addLog(ctx, 'ソウル付与（ルリグトラッシュ）：対象シグニなし'));
    const zoneIdxCSL = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === targetSigniCSL);
    if (zoneIdxCSL < 0) return done(addLog(ctx, 'ソウル付与：対象シグニが場にない'));
    const lrigInTrashCSL = ctx.ownerState.lrig_trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'ルリグ' || c?.Type === 'アシストルリグ';
    });
    if (lrigInTrashCSL.length === 0) return done(addLog(ctx, 'ルリグトラッシュにルリグなし'));
    // SEARCHインタラクションでルリグトラッシュから1枚選択
    const attachAfterSearch: StubAction = {
      type: 'STUB', id: 'INTERNAL_SET_SOUL_FROM_LRIG_TRASH_RESULT',
      value: targetSigniCSL,
    };
    const pendingCSL: PendingInteractionDef = {
      type: 'SEARCH',
      visibleCards: lrigInTrashCSL,
      maxPick: 1,
      thenAction: attachAfterSearch as EffectAction,
    };
    return needsInteraction(addLog(ctx, 'ルリグトラッシュからルリグを選択（ソウル付与）'), pendingCSL);
  }
  // ルリグトラッシュ選択後ソウル付与
  if (stub.id === 'INTERNAL_SET_SOUL_FROM_LRIG_TRASH_RESULT') {
    const targetSigniSFLTR = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const soulCardSFLTR = (ctx.lastProcessedCards ?? [])[0];
    if (!targetSigniSFLTR || !soulCardSFLTR) return done(addLog(ctx, 'ソウル付与結果：対象またはカードなし'));
    const zoneIdxSFLTR = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === targetSigniSFLTR);
    if (zoneIdxSFLTR < 0) return done(addLog(ctx, 'ソウル付与：対象シグニが場にない'));
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
    return done(addLog({ ...ctx, ownerState: newOwnerSFLTR }, `${soulNameSFLTR}を${signNameSFLTR}の【ソウル】に付与`));
  }
  // 公開したカード枚数基準パワー修正
  if (stub.id === 'POWER_MOD_PER_REVEALED') {
    const revCount = (ctx.lastProcessedCards ?? []).length;
    if (revCount === 0) return done(addLog(ctx, 'パワー修正：公開0枚'));
    const srcPR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPR = srcPR ? (srcPR.EffectText ?? '') + ' ' + (srcPR.BurstText ?? '') : '';
    const toHWPR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPR = txtPR.match(/枚につき([＋+][０-９\d]+)/);
    const deltaPerCard = mPR ? parseInt(toHWPR(mPR[1]).replace('＋', '+').replace('+', '+')) : 1000;
    const totalDelta = deltaPerCard * revCount;
    const targetCnPR = ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)
      ? ctx.sourceCardNum
      : ctx.ownerState.field.signi.find(s => s && s.length > 0)?.at(-1);
    if (!targetCnPR) return done(addLog(ctx, `パワー${totalDelta > 0 ? '+' : ''}${totalDelta}（フィールドなし）`));
    const mods = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: targetCnPR, delta: totalDelta }];
    const newOwner = { ...ctx.ownerState, temp_power_mods: mods };
    return done(addLog({ ...ctx, ownerState: newOwner },
      `${ctx.cardMap.get(targetCnPR)?.CardName ?? targetCnPR}パワー${totalDelta > 0 ? '+' : ''}${totalDelta}（${revCount}枚公開）`));
  }
  // このターン相手はガードできない（ガードコスト無色版 or ガード禁止）
  if (stub.id === 'OPP_GUARD_COST_COLORLESS' || stub.id === 'PREVENT_OPP_GUARD_THIS_TURN') {
    const newOwner = { ...ctx.ownerState, prevent_opp_guard: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン対戦相手はガードできない'));
  }
  // キー１枚を任意でルリグトラッシュに置く（追加効果条件）
  if (stub.id === 'TRASH_OWN_KEY_OPTIONAL') {
    const keyPiece = ctx.ownerState.field.key_piece;
    if (!keyPiece) return done(addLog(ctx, 'キーなし（追加効果スキップ）'));
    const keyName = ctx.cardMap.get(keyPiece)?.CardName ?? keyPiece;
    const trashKeyStub: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_OWN_KEY' };
    const skipStub: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const pendingKey: PendingInteractionDef = {
      type: 'CHOOSE',
      options: [
        { id: 'do', label: `${keyName}をルリグトラッシュへ（追加効果）`, action: trashKeyStub as EffectAction, available: true },
        { id: 'skip', label: 'スキップ', action: skipStub as EffectAction, available: true },
      ],
      count: 1,
    };
    return needsInteraction(addLog(ctx, `キー「${keyName}」をルリグトラッシュに置いてもよい`), pendingKey);
  }
  if (stub.id === 'INTERNAL_TRASH_OWN_KEY') {
    const key = ctx.ownerState.field.key_piece;
    if (!key) return done(addLog(ctx, 'キーなし'));
    const newField = { ...ctx.ownerState.field, key_piece: null };
    const newOwner = {
      ...ctx.ownerState, field: newField,
      lrig_trash: [...ctx.ownerState.lrig_trash, key],
    };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(key)?.CardName ?? key}をルリグトラッシュへ`));
  }
  // 手札からクラスシグニを任意枚数捨てる
  if (stub.id === 'OPTIONAL_DISCARD_CLASS_SIGNI') {
    const srcODC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtODC = srcODC ? (srcODC.EffectText ?? '') + ' ' + (srcODC.BurstText ?? '') : '';
    const toHWODC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchODC = txtODC.match(/手札から[<＜]([^>＞]+)[>＞]のシグニ/);
    const targetClassODC = classMatchODC?.[1];
    const maxMODC = txtODC.match(/シグニ([０-９\d]+)枚まで/);
    const maxODC = maxMODC ? parseInt(toHWODC(maxMODC[1])) : 1;
    const handCands = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'シグニ') return false;
      if (targetClassODC && !c.CardClass?.includes(targetClassODC)) return false;
      return true;
    });
    if (handCands.length === 0) return done(addLog(ctx, `手札に${targetClassODC ?? 'クラス'}シグニなし（任意捨てスキップ）`));
    const discardActionODC: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 },
    };
    return selectOrInteract(handCands, maxODC, true, 'self_hand', discardActionODC as EffectAction, undefined, ctx);
  }
  // 手札のシグニをこのシグニの下に置く
  if (stub.id === 'HAND_SIGNI_UNDER_SIGNI') {
    const srcHSU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHSU = srcHSU ? (srcHSU.EffectText ?? '') + ' ' + (srcHSU.BurstText ?? '') : '';
    const toHWHSU = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMHSU = txtHSU.match(/手札から.*シグニ([０-９\d]+)枚/);
    const maxHSU = maxMHSU ? parseInt(toHWHSU(maxMHSU[1])) : 1;
    const classMatchHSU = txtHSU.match(/手札から[<＜]([^>＞]+)[>＞]のシグニ/);
    const targetClassHSU = classMatchHSU?.[1];
    const handSigHSU = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'シグニ') return false;
      if (targetClassHSU && !c.CardClass?.includes(targetClassHSU)) return false;
      return true;
    });
    if (handSigHSU.length === 0) return done(addLog(ctx, '手札にシグニなし（シグニ下配置スキップ）'));
    const placeAction: PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'hand' };
    return selectOrInteract(handSigHSU, maxHSU, false, 'self_hand', placeAction as EffectAction, undefined, ctx);
  }
  // 手札からカードをこのシグニの下に置く（HAND_CARDS_UNDER_SIGNI / PLACE_SIGNI_UNDER_SELF_OPT）
  if (stub.id === 'HAND_CARDS_UNDER_SIGNI' || stub.id === 'PLACE_SIGNI_UNDER_SELF_OPT') {
    const srcHCU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHCU = srcHCU ? (srcHCU.EffectText ?? '') + ' ' + (srcHCU.BurstText ?? '') : '';
    const toHWHCU = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMHCU = txtHCU.match(/(?:手札から)?カード(?:を)?([０-９\d]+)枚まで/);
    const maxHCU = maxMHCU ? parseInt(toHWHCU(maxMHCU[1])) : 1;
    const optHCU = stub.id === 'PLACE_SIGNI_UNDER_SELF_OPT' || txtHCU.includes('もよい');
    // レベル以上フィルタ（"レベルN以上"）または完全一致フィルタ（"レベルN"）
    const lvMinMHCU = txtHCU.match(/レベル([０-９\d]+)以上/);
    const lvExactMHCU = !lvMinMHCU && txtHCU.match(/レベル([０-９\d]+)(?![以上以下\d])/);
    const minLvHCU = lvMinMHCU ? parseInt(toHWHCU(lvMinMHCU[1])) : 0;
    const exactLvHCU = lvExactMHCU ? parseInt(toHWHCU(lvExactMHCU[1])) : -1;
    const levelOkHCU = (lv: number) => {
      if (exactLvHCU >= 0) return lv === exactLvHCU;
      if (minLvHCU > 0) return lv >= minLvHCU;
      return true;
    };
    // PLACE_SIGNI_UNDER_SELF_OPT で "手札から" の明示がない場合はフィールドから
    const useFieldHCU = stub.id === 'PLACE_SIGNI_UNDER_SELF_OPT' && !txtHCU.includes('手札');
    if (useFieldHCU) {
      const fieldCandsHCU = ctx.ownerState.field.signi.flatMap(stack => {
        const top = stack?.at(-1);
        if (!top || top === ctx.sourceCardNum) return [];
        const c = ctx.cardMap.get(top);
        if (!c) return [];
        return levelOkHCU(parseInt(c.Level ?? '0')) ? [top] : [];
      });
      if (fieldCandsHCU.length === 0) return done(addLog(ctx, '対象シグニなし（PLACE_SIGNI_UNDER_SELF_OPT）'));
      const placeFieldHCU: PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'field' };
      return selectOrInteract(fieldCandsHCU, maxHCU, optHCU, 'self_field', placeFieldHCU as EffectAction, undefined, ctx);
    }
    const handCandsHCU = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (!c) return false;
      return levelOkHCU(parseInt(c.Level ?? '0'));
    });
    if (handCandsHCU.length === 0) return done(addLog(ctx, '手札なし（シグニ下配置スキップ）'));
    const placeActionHCU: PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'hand' };
    return selectOrInteract(handCandsHCU, maxHCU, optHCU, 'self_hand', placeActionHCU as EffectAction, undefined, ctx);
  }
  // シグニの下のカードをエナゾーンに置く
  if (stub.id === 'UNDER_SIGNI_TO_ENERGY') {
    // SELECT_TARGET後の処理：lastProcessedCardsにカードがある場合
    if (ctx.lastProcessedCards?.length) {
      const movedUTE = ctx.lastProcessedCards[0];
      const newSigniUTE2 = ctx.ownerState.field.signi.map(stack => {
        if (!stack?.includes(movedUTE)) return stack;
        const filtered = stack.filter(c => c !== movedUTE);
        return filtered.length > 0 ? filtered : null;
      }) as (string[] | null)[];
      const newOwnerUTE2 = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniUTE2 }, energy: [...ctx.ownerState.energy, movedUTE] };
      return done(addLog({ ...ctx, ownerState: newOwnerUTE2 },
        `${ctx.cardMap.get(movedUTE)?.CardName ?? movedUTE}をエナゾーンへ（シグニ下から）`));
    }
    // ソースゾーンのシグニ下カードを収集
    const srcZoneUTE = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : ctx.ownerState.field.signi.findIndex(s => s && s.length > 1);
    if (srcZoneUTE < 0) return done(addLog(ctx, 'シグニの下にカードなし（UNDER_SIGNI_TO_ENERGY）'));
    const stackUTE = ctx.ownerState.field.signi[srcZoneUTE] ?? [];
    const underCardsUTE = stackUTE.slice(0, -1); // 最前面以外（下のカード群）
    if (underCardsUTE.length === 0) return done(addLog(ctx, 'シグニの下にカードなし'));
    if (underCardsUTE.length === 1) {
      // 1枚のみ→直接エナへ
      const movedUTE = underCardsUTE[0];
      const newStackUTE = stackUTE.filter(c => c !== movedUTE);
      const newSigniUTE = [...ctx.ownerState.field.signi] as (string[] | null)[];
      newSigniUTE[srcZoneUTE] = newStackUTE.length > 0 ? newStackUTE : null;
      const newOwnerUTE = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniUTE }, energy: [...ctx.ownerState.energy, movedUTE] };
      return done(addLog({ ...ctx, ownerState: newOwnerUTE },
        `${ctx.cardMap.get(movedUTE)?.CardName ?? movedUTE}をエナゾーンへ（シグニ下から）`));
    }
    // 複数枚→SELECT_TARGET
    const contUTE: StubAction = { type: 'STUB', id: 'UNDER_SIGNI_TO_ENERGY' };
    return needsInteraction(addLog(ctx, 'シグニ下のカードを選択（エナゾーンへ）'), {
      type: 'SELECT_TARGET', candidates: underCardsUTE, count: 1, optional: false,
      targetScope: 'self_field', thenAction: contUTE as EffectAction,
    });
  }
  // デッキトップを公開してレベル一致なら手札に加える
  if (stub.id === 'DECK_TOP_CHECK_LEVEL_HAND') {
    const declaredLv = ctx.ownerState.declared_guard_restrict_level;
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topCard = ctx.ownerState.deck[0];
    const topData = ctx.cardMap.get(topCard);
    const topLv = parseInt(topData?.Level ?? '-1');
    if (declaredLv !== undefined && topData?.Type === 'シグニ' && topLv === declaredLv) {
      const newDeck = ctx.ownerState.deck.slice(1);
      const newOwner = { ...ctx.ownerState, deck: newDeck, hand: [...ctx.ownerState.hand, topCard] };
      return done(addLog({ ...ctx, ownerState: newOwner },
        `デッキトップ公開：${topData?.CardName ?? topCard}（Lv${topLv}）→手札`));
    }
    const name = topData?.CardName ?? topCard;
    const lv = topData?.Level ?? '?';
    // 一致しない場合はデッキトップに戻す（移動なし）
    return done(addLog(ctx, `デッキトップ公開：${name}（Lv${lv}）→不一致、デッキトップに戻す`));
  }
  // 相手の手札のシグニを見て捨てさせる（宣言数字フィルタ or 有色フィルタ）
  if (stub.id === 'LOOK_OPP_HAND_DISCARD_SIGNI') {
    const declaredLvLOD = ctx.ownerState.declared_guard_restrict_level;
    const oppHandLOD = ctx.otherState.hand;
    const candsLOD = oppHandLOD.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'シグニ') return false;
      if (declaredLvLOD !== undefined) {
        return parseInt(c.Level ?? '-1') === declaredLvLOD;
      }
      const color = c?.Color ?? '';
      return color.length > 0 && color !== '無';
    });
    if (candsLOD.length === 0) return done(addLog(ctx, '相手手札に対象シグニなし（LOOK_OPP_HAND_DISCARD_SIGNI）'));
    const discardLOD: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 },
    };
    return selectOrInteract(candsLOD, 1, false, 'opp_hand', discardLOD as EffectAction, undefined, ctx);
  }
  // デッキ上を公開し、宣言したレベルのシグニならエナゾーンへ
  if (stub.id === 'DECK_TOP_CHECK_LEVEL_ENERGY') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'デッキなし（DECK_TOP_CHECK_LEVEL_ENERGY）'));
    const declaredLvDTE = ctx.ownerState.declared_guard_restrict_level;
    const topCardDTE = ctx.ownerState.deck[0];
    const topDataDTE = ctx.cardMap.get(topCardDTE);
    const topLvDTE = parseInt(topDataDTE?.Level ?? '-1');
    const topNameDTE = topDataDTE?.CardName ?? topCardDTE;
    if (topDataDTE?.Type === 'シグニ' && declaredLvDTE !== undefined && topLvDTE === declaredLvDTE) {
      const newDeckDTE = ctx.ownerState.deck.slice(1);
      const newOwnerDTE = { ...ctx.ownerState, deck: newDeckDTE, energy: [...ctx.ownerState.energy, topCardDTE] };
      return done(addLog({ ...ctx, ownerState: newOwnerDTE },
        `デッキトップ公開：${topNameDTE}（Lv${topLvDTE}）→エナゾーンへ`));
    }
    return done(addLog(ctx, `デッキトップ公開：${topNameDTE}（Lv${topDataDTE?.Level ?? '?'}）→条件不一致`));
  }
  // ルリグトラッシュのアーツ枚数に基づくパワー修正（対象1体を先にSELECT_TARGETで選ぶ）
  if (stub.id === 'POWER_MOD_BY_LRIG_TRASH_ARTS') {
    const srcPMLTA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMLTA = srcPMLTA ? (srcPMLTA.EffectText ?? '') + ' ' + (srcPMLTA.BurstText ?? '') : '';
    const toHWPMLTA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const artsCountPMLTA = (ctx.ownerState.lrig_trash ?? []).filter(cn => ctx.cardMap.get(cn)?.Type === 'アーツ').length;
    const perMPMLTA = txtPMLTA.match(/アーツ([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    if (!perMPMLTA) return done(addLog(ctx, `パワー修正（ルリグトラッシュアーツ${artsCountPMLTA}枚）`));
    const divisorPMLTA = parseInt(toHWPMLTA(perMPMLTA[1] || '1')) || 1;
    const deltaPMLTA = parseInt(toHWPMLTA(perMPMLTA[2]).replace('－', '-').replace('＋', '+'));
    const totalDeltaPMLTA = Math.floor(artsCountPMLTA / divisorPMLTA) * deltaPMLTA;
    // 対象シグニが未選択なら SELECT_TARGET で相手シグニを選ぶ
    if (!ctx.lastProcessedCards?.length) {
      const oppCandsPMLTA = ctx.otherState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
      if (oppCandsPMLTA.length === 0) return done(addLog(ctx, '対象相手シグニなし（POWER_MOD_BY_LRIG_TRASH_ARTS）'));
      const contPMLTA: StubAction = { type: 'STUB', id: 'POWER_MOD_BY_LRIG_TRASH_ARTS' };
      return needsInteraction(addLog(ctx, '対象シグニを選択（ルリグトラッシュアーツによるパワー修正）'), {
        type: 'SELECT_TARGET', candidates: oppCandsPMLTA, count: 1, optional: false,
        targetScope: 'opp_field', thenAction: contPMLTA as EffectAction,
      });
    }
    const modsPMLTA = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of ctx.lastProcessedCards) modsPMLTA.push({ cardNum: cn, delta: totalDeltaPMLTA });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMLTA } },
      `パワー${totalDeltaPMLTA > 0 ? '+' : ''}${totalDeltaPMLTA}（ルリグトラッシュアーツ${artsCountPMLTA}枚）`));
  }
  // ルリグレベルに基づくパワー修正（相手センタールリグのレベルを参照）
  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL') {
    const srcPMLV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMLV = srcPMLV ? (srcPMLV.EffectText ?? '') + ' ' + (srcPMLV.BurstText ?? '') : '';
    const toHWPMLV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const oppLrigTop = ctx.otherState.field.lrig.at(-1);
    const oppLrigLv = parseInt(ctx.cardMap.get(oppLrigTop ?? '')?.Level ?? '0');
    const perMPMLV = txtPMLV.match(/レベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (perMPMLV) {
      const divisorPMLV = parseInt(toHWPMLV(perMPMLV[1] || '1')) || 1;
      const deltaPMLV = parseInt(toHWPMLV(perMPMLV[2]).replace('－', '-').replace('＋', '+'));
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
          `パワー${totalDeltaPMLV > 0 ? '+' : ''}${totalDeltaPMLV}（相手ルリグLv${oppLrigLv}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（相手ルリグLv${oppLrigLv}）`));
  }
  // ルリグレベル合計に基づくパワー修正（自分のルリグ全体のレベル合計を参照）
  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL_SUM') {
    const srcPMLS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMLS = srcPMLS ? (srcPMLS.EffectText ?? '') + ' ' + (srcPMLS.BurstText ?? '') : '';
    const toHWPMLS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const lrigLvSum = (ctx.ownerState.field.lrig ?? []).reduce((acc, cn) => {
      const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0');
      return acc + (isNaN(lv) ? 0 : lv);
    }, 0);
    const perMPMLS = txtPMLS.match(/レベルの合計([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (perMPMLS) {
      const divisorPMLS = parseInt(toHWPMLS(perMPMLS[1] || '1')) || 1;
      const deltaPMLS = parseInt(toHWPMLS(perMPMLS[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMLS = Math.floor(lrigLvSum / divisorPMLS) * deltaPMLS;
      if (totalDeltaPMLS !== 0) {
        // 自シグニ（sourceCardNum）に適用、なければ全自シグニ
        const selfTargetPMLS = ctx.sourceCardNum;
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
          `パワー${totalDeltaPMLS > 0 ? '+' : ''}${totalDeltaPMLS}（ルリグレベル合計${lrigLvSum}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（ルリグレベル合計${lrigLvSum}）`));
  }
  // トラッシュの特定クラスカード枚数に基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_TRASH_CLASS_COUNT') {
    const srcPMTCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMTCC = srcPMTCC ? (srcPMTCC.EffectText ?? '') + ' ' + (srcPMTCC.BurstText ?? '') : '';
    const toHWPMTCC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchPMTCC = txtPMTCC.match(/トラッシュにある[<＜《]([^>＞》]+)[>＞»]のカード([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    if (classMatchPMTCC) {
      const targetClass = classMatchPMTCC[1];
      const divisorPMTCC = parseInt(toHWPMTCC(classMatchPMTCC[2] || '1')) || 1;
      const deltaPMTCC = parseInt(toHWPMTCC(classMatchPMTCC[3]).replace('－', '-').replace('＋', '+'));
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
          `パワー${totalDeltaPMTCC > 0 ? '+' : ''}${totalDeltaPMTCC}（トラッシュ${targetClass}×${countPMTCC}枚）`));
      }
    }
    return done(addLog(ctx, 'パワー修正（トラッシュクラス数）'));
  }
  // 自場シグニの色の種類数×delta → 1体相手シグニパワー修正（SELECT_TARGET→自己再帰）
  if (stub.id === 'POWER_MOD_BY_COLOR_VARIETY') {
    const toHWPMCV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const colorSetPMCV = new Set<string>();
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (top) {
        const colors = (ctx.cardMap.get(top)?.Color ?? '').split('/').map(c => c.trim()).filter(c => c && c !== '無');
        for (const c of colors) colorSetPMCV.add(c);
      }
    }
    const varietyPMCV = colorSetPMCV.size;
    const srcPMCV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMCV = srcPMCV ? (srcPMCV.EffectText ?? '') + ' ' + (srcPMCV.BurstText ?? '') : '';
    const mPMCV = txtPMCV.match(/色の種類([０-９\d]*)つにつき([－＋][０-９\d]+)/);
    const divisorPMCV = mPMCV ? parseInt(toHWPMCV(mPMCV[1] || '1')) || 1 : 1;
    const deltaPMCV = mPMCV ? parseInt(toHWPMCV(mPMCV[2]).replace('－', '-').replace('＋', '+')) : -3000;
    const totalDeltaPMCV = Math.floor(varietyPMCV / divisorPMCV) * deltaPMCV;
    // 既にターゲット選択済みなら適用
    const existPMCV = (ctx.lastProcessedCards ?? []).find(cn => ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (existPMCV) {
      const modsPMCV = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: existPMCV, delta: totalDeltaPMCV }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMCV } },
        `${ctx.cardMap.get(existPMCV)?.CardName ?? existPMCV}のパワー${totalDeltaPMCV}（色${varietyPMCV}種）`));
    }
    const oppCandsPMCV = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPMCV.length === 0) return done(addLog(ctx, '相手シグニなし（POWER_MOD_BY_COLOR_VARIETY）'));
    const contPMCV: StubAction = { type: 'STUB', id: 'POWER_MOD_BY_COLOR_VARIETY' };
    const noopPMCV: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(oppCandsPMCV, 1, false, 'opp_field', noopPMCV as EffectAction, contPMCV as EffectAction, ctx);
  }
  // 自場の特定クラスシグニのレベル合計に基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_FIELD_CLASS_LEVEL') {
    const srcPMFCL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMFCL = srcPMFCL ? (srcPMFCL.EffectText ?? '') + ' ' + (srcPMFCL.BurstText ?? '') : '';
    const toHWPMFCL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchFCL = txtPMFCL.match(/[<＜《]([^>＞》]+)[>＞»]のシグニのレベルを合計した数だけ([－＋][０-９\d]+)/);
    if (classMatchFCL) {
      const targetClassFCL = classMatchFCL[1];
      const deltaPerLvFCL = parseInt(toHWPMFCL(classMatchFCL[2]).replace('－', '-').replace('＋', '+'));
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
          `パワー${totalDeltaFCL > 0 ? '+' : ''}${totalDeltaFCL}（${targetClassFCL}レベル合計${lvSumFCL}）`));
      }
    }
    return done(addLog(ctx, 'パワー修正（フィールドクラスレベル）'));
  }
  // シグニ下のカード枚数×delta → 2体まで相手シグニパワー修正（SELECT→INTERNAL）
  if (stub.id === 'POWER_MOD_BY_UNDER_COUNT') {
    const toHWPMUC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMUC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMUC = srcPMUC ? (srcPMUC.EffectText ?? '') + ' ' + (srcPMUC.BurstText ?? '') : '';
    const mPMUC = txtPMUC.match(/下にあるカード([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    if (!mPMUC) return done(addLog(ctx, '解析失敗（POWER_MOD_BY_UNDER_COUNT）'));
    const maxMPMUC = txtPMUC.match(/シグニ([０-９\d]*)体まで/);
    const maxTargetsPMUC = maxMPMUC ? parseInt(toHWPMUC(maxMPMUC[1])) : 2;
    const oppCandsPMUC = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPMUC.length === 0) return done(addLog(ctx, '相手シグニなし（POWER_MOD_BY_UNDER_COUNT）'));
    const noopPMUC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contPMUC: StubAction = { type: 'STUB', id: 'INTERNAL_PMBUC_APPLY' };
    return selectOrInteract(oppCandsPMUC, Math.min(maxTargetsPMUC, oppCandsPMUC.length), false, 'opp_field', noopPMUC as EffectAction, contPMUC as EffectAction, ctx);
  }
  if (stub.id === 'INTERNAL_PMBUC_APPLY') {
    const selected = ctx.lastProcessedCards ?? [];
    if (selected.length === 0) return done(addLog(ctx, '対象なし（INTERNAL_PMBUC_APPLY）'));
    const toHWUC2 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const src2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txt2 = src2 ? (src2.EffectText ?? '') + ' ' + (src2.BurstText ?? '') : '';
    const m2 = txt2.match(/下にあるカード([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    const divisorUC2 = m2 ? parseInt(toHWUC2(m2[1] || '1')) || 1 : 1;
    const deltaUC2 = m2 ? parseInt(toHWUC2(m2[2]).replace('－', '-').replace('＋', '+')) : -3000;
    const srcZoneUC2 = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const underCntUC2 = srcZoneUC2 >= 0 ? Math.max(0, (ctx.ownerState.field.signi[srcZoneUC2]?.length ?? 1) - 1) : 0;
    const totalDeltaUC2 = Math.floor(underCntUC2 / divisorUC2) * deltaUC2;
    const modsUC2 = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of selected) modsUC2.push({ cardNum: cn, delta: totalDeltaUC2 });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsUC2 } },
      `${selected.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・')}のパワー${totalDeltaUC2}（下${underCntUC2}枚）`));
  }
  // シグニゾーンのカード総数×delta → 1体相手シグニパワー修正（SELECT_TARGET→自己再帰）
  if (stub.id === 'POWER_DOWN_BY_ZONE_CARD_COUNT') {
    const toHWPDZCC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPDZCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPDZCC = srcPDZCC ? (srcPDZCC.EffectText ?? '') + ' ' + (srcPDZCC.BurstText ?? '') : '';
    const mPDZCC = txtPDZCC.match(/シグニゾーンにあるカード([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    const divisorPDZCC = mPDZCC ? parseInt(toHWPDZCC(mPDZCC[1] || '1')) || 1 : 1;
    const deltaPDZCC = mPDZCC ? parseInt(toHWPDZCC(mPDZCC[2]).replace('－', '-').replace('＋', '+')) : -2000;
    const totalCardsPDZCC = ctx.ownerState.field.signi.reduce((acc, stack) => acc + (stack?.length ?? 0), 0);
    const totalDeltaPDZCC = Math.floor(totalCardsPDZCC / divisorPDZCC) * deltaPDZCC;
    const existPDZCC = (ctx.lastProcessedCards ?? []).find(cn => ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (existPDZCC) {
      const modsPDZCC = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: existPDZCC, delta: totalDeltaPDZCC }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPDZCC } },
        `${ctx.cardMap.get(existPDZCC)?.CardName ?? existPDZCC}のパワー${totalDeltaPDZCC}（ゾーン${totalCardsPDZCC}枚）`));
    }
    const oppCandsPDZCC = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPDZCC.length === 0) return done(addLog(ctx, '相手シグニなし（POWER_DOWN_BY_ZONE_CARD_COUNT）'));
    const contPDZCC: StubAction = { type: 'STUB', id: 'POWER_DOWN_BY_ZONE_CARD_COUNT' };
    const noopPDZCC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(oppCandsPDZCC, 1, false, 'opp_field', noopPDZCC as EffectAction, contPDZCC as EffectAction, ctx);
  }
  // トラッシュに置かれたシグニのレベルに基づくパワー修正（1体対象 or 全体）
  if (stub.id === 'OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL') {
    const srcPDTL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPDTL = srcPDTL ? (srcPDTL.EffectText ?? '') + ' ' + (srcPDTL.BurstText ?? '') : '';
    const toHWPDTL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const perMPDTL = txtPDTL.match(/トラッシュに置かれた.*?シグニのレベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    const trashedCards = ctx.lastProcessedCards ?? [];
    const lvSumTrashedPDTL = trashedCards.reduce((acc, cn) => {
      const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0');
      return acc + (isNaN(lv) ? 0 : lv);
    }, 0);
    if (perMPDTL && lvSumTrashedPDTL > 0) {
      const divisorPDTL = parseInt(toHWPDTL(perMPDTL[1] || '1')) || 1;
      const deltaPDTL = parseInt(toHWPDTL(perMPDTL[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPDTL = Math.floor(lvSumTrashedPDTL / divisorPDTL) * deltaPDTL;
      if (totalDeltaPDTL !== 0) {
        // 「対戦相手のシグニ１体を対象とし」の場合 SELECT_TARGET で1体選択
        const isSingleTarget = txtPDTL.includes('対戦相手のシグニ１体を対象とし');
        const oppCandsPDTL = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
        if (isSingleTarget && oppCandsPDTL.length > 0) {
          // pre-calculated delta を continuation stub の value に埋め込む（thenAction=STUB は applyDirectAction で無視されるため continuation を使用）
          const noopPDTL: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
          const applyPDTL: StubAction = { type: 'STUB', id: 'INTERNAL_APPLY_POWER_DELTA_OPP', value: totalDeltaPDTL };
          return selectOrInteract(oppCandsPDTL, 1, false, 'opp_field', noopPDTL as EffectAction, applyPDTL as EffectAction, ctx);
        }
        // 全体対象: 全シグニに適用
        const modsPDTL = [...(ctx.otherState.temp_power_mods ?? [])];
        for (const cn of oppCandsPDTL) modsPDTL.push({ cardNum: cn, delta: totalDeltaPDTL });
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPDTL } },
          `パワー${totalDeltaPDTL > 0 ? '+' : ''}${totalDeltaPDTL}（トラッシュ済みLv合計${lvSumTrashedPDTL}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（トラッシュシグニLv合計${lvSumTrashedPDTL}）`));
  }
  // INTERNAL_APPLY_POWER_DELTA_OPP: SELECT_TARGET後に対象シグニへparent deltaを適用
  if (stub.id === 'INTERNAL_APPLY_POWER_DELTA_OPP') {
    const deltaIAPDO = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const targetIAPDO = ctx.lastProcessedCards ?? [];
    if (targetIAPDO.length === 0 || deltaIAPDO === 0) return done(addLog(ctx, 'パワー修正: 対象なし'));
    const modsIAPDO = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of targetIAPDO) modsIAPDO.push({ cardNum: cn, delta: deltaIAPDO });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIAPDO } },
      `パワー${deltaIAPDO > 0 ? '+' : ''}${deltaIAPDO}`));
  }
  // アタックしたシグニのレベルに基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_ATTACKER_LEVEL') {
    const srcPMAL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMAL = srcPMAL ? (srcPMAL.EffectText ?? '') + ' ' + (srcPMAL.BurstText ?? '') : '';
    const toHWPMAL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const attackerLvPMAL = parseInt(toHWPMAL(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Level ?? '0')) || 0;
    const perMPMAL = txtPMAL.match(/レベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (!perMPMAL || attackerLvPMAL === 0) return done(addLog(ctx, `パワー修正（アタッカーLv${attackerLvPMAL}）`));
    const divisorPMAL = parseInt(toHWPMAL(perMPMAL[1] || '1')) || 1;
    const deltaPMAL = parseInt(toHWPMAL(perMPMAL[2]).replace('－', '-').replace('＋', '+'));
    const totalDeltaPMAL = Math.floor(attackerLvPMAL / divisorPMAL) * deltaPMAL;
    // 対象シグニが未選択なら SELECT_TARGET で相手シグニを選ぶ（レベル奇数/偶数でフィルタ）
    if (!ctx.lastProcessedCards?.length) {
      const parityMPMAL = txtPMAL.match(/レベルが(奇数|偶数)の対戦相手/);
      const parityPMAL = parityMPMAL?.[1];
      const oppCandsPMAL = ctx.otherState.field.signi.flatMap(s => {
        const top = s?.at(-1);
        if (!top) return [];
        if (parityPMAL) {
          const lv = parseInt(toHWPMAL(ctx.cardMap.get(top)?.Level ?? '0')) || 0;
          if (parityPMAL === '奇数' && lv % 2 === 0) return [];
          if (parityPMAL === '偶数' && lv % 2 === 1) return [];
        }
        return [top];
      });
      if (oppCandsPMAL.length === 0) return done(addLog(ctx, '対象相手シグニなし（POWER_MOD_BY_ATTACKER_LEVEL）'));
      const contPMAL: StubAction = { type: 'STUB', id: 'POWER_MOD_BY_ATTACKER_LEVEL' };
      return needsInteraction(addLog(ctx, '対象シグニを選択（アタッカーレベルによるパワー修正）'), {
        type: 'SELECT_TARGET', candidates: oppCandsPMAL, count: 1, optional: false,
        targetScope: 'opp_field', thenAction: contPMAL as EffectAction,
      });
    }
    const modsPMAL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of ctx.lastProcessedCards) modsPMAL.push({ cardNum: cn, delta: totalDeltaPMAL });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMAL } },
      `パワー${totalDeltaPMAL > 0 ? '+' : ''}${totalDeltaPMAL}（アタッカーLv${attackerLvPMAL}）`));
  }
  // 公開したシグニのレベルに基づくパワー修正（lastProcessedCards使用）
  if (stub.id === 'POWER_MOD_PER_REVEALED_LEVEL') {
    const srcPMRL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMRL = srcPMRL ? (srcPMRL.EffectText ?? '') + ' ' + (srcPMRL.BurstText ?? '') : '';
    const toHWPMRL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealedPMRL = ctx.lastProcessedCards ?? [];
    const lvSumPMRL = revealedPMRL.reduce((acc, cn) => {
      const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0');
      return acc + (isNaN(lv) ? 0 : lv);
    }, 0);
    const perMPMRL = txtPMRL.match(/シグニのレベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (perMPMRL) {
      const divisorPMRL = parseInt(toHWPMRL(perMPMRL[1] || '1')) || 1;
      const deltaPMRL = parseInt(toHWPMRL(perMPMRL[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMRL = Math.floor(lvSumPMRL / divisorPMRL) * deltaPMRL;
      if (totalDeltaPMRL !== 0) {
        const modsPMRL = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) modsPMRL.push({ cardNum: top, delta: totalDeltaPMRL });
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMRL } },
          `パワー${totalDeltaPMRL > 0 ? '+' : ''}${totalDeltaPMRL}（公開シグニLv${lvSumPMRL}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（公開シグニレベル${lvSumPMRL}）`));
  }
  // 複数の自シグニにパワー+5000（SELECT_TARGET→INTERNAL_POWER_UP_SELECTED）
  if (stub.id === 'MULTI_SIGNI_POWER_UP_5000') {
    const srcMSPU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMSPU = srcMSPU ? (srcMSPU.EffectText ?? '') + ' ' + (srcMSPU.BurstText ?? '') : '';
    const toHWMSPU = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchMSPU = txtMSPU.match(/あなたの[<＜《]([^>＞»]+)[>＞»]のシグニを([０-９\d]*)体まで/);
    const targetClassMSPU = classMatchMSPU?.[1];
    const maxCountMSPU = parseInt(toHWMSPU(classMatchMSPU?.[2] || '2')) || 2;
    const selfCandsMSPU = ctx.ownerState.field.signi
      .map(s => s?.at(-1))
      .filter((cn): cn is string => !!cn && (!targetClassMSPU || (ctx.cardMap.get(cn)?.CardClass ?? '').includes(targetClassMSPU)));
    if (selfCandsMSPU.length === 0) return done(addLog(ctx, '自場に対象シグニなし（MULTI_SIGNI_POWER_UP_5000）'));
    const noopMSPU: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contMSPU: StubAction = { type: 'STUB', id: 'INTERNAL_POWER_UP_SELECTED' };
    return needsInteraction(addLog(ctx, `シグニを${maxCountMSPU}体まで選択（パワー+5000）`), {
      type: 'SELECT_TARGET', candidates: selfCandsMSPU, count: maxCountMSPU, optional: true,
      targetScope: 'self_field', thenAction: noopMSPU as EffectAction, continuation: contMSPU as EffectAction,
    });
  }
  // MULTI_SIGNI_POWER_UP_5000 の後処理：選択した自シグニにパワー+5000
  if (stub.id === 'INTERNAL_POWER_UP_SELECTED') {
    const selectedIPU = ctx.lastProcessedCards ?? [];
    if (selectedIPU.length === 0) return done(addLog(ctx, 'なし（INTERNAL_POWER_UP_SELECTED）'));
    const srcIPU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtIPU = srcIPU ? (srcIPU.EffectText ?? '') + ' ' + (srcIPU.BurstText ?? '') : '';
    const toHWIPU = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const deltaIPU = (() => {
      const m = txtIPU.match(/それらのパワーをそれぞれ([＋－][０-９\d]+)/);
      return m ? parseInt(toHWIPU(m[1]).replace('＋', '+').replace('－', '-')) : 5000;
    })();
    const modsIPU = [...(ctx.ownerState.temp_power_mods ?? [])];
    for (const cn of selectedIPU) modsIPU.push({ cardNum: cn, delta: deltaIPU });
    const namesIPU = selectedIPU.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsIPU } },
      `${namesIPU}のパワー${deltaIPU > 0 ? '+' : ''}${deltaIPU}`));
  }
  // トラッシュしたシグニのレベル×-2000 → 1体相手シグニパワー修正（SELECT→INTERNAL）
  if (stub.id === 'POWER_MOD_BY_TRASHED_SIGNI_LEVEL') {
    const lastTrashedPMTSL = ctx.ownerState.trash.at(-1) ?? '';
    const lvPMTSL = parseInt(ctx.cardMap.get(lastTrashedPMTSL)?.Level ?? '0') || 0;
    if (lvPMTSL === 0) return done(addLog(ctx, 'パワー修正（トラッシュシグニLv0）'));
    const oppCandsPMTSL = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPMTSL.length === 0) return done(addLog(ctx, '相手シグニなし（POWER_MOD_BY_TRASHED_SIGNI_LEVEL）'));
    const noopPMTSL: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contPMTSL: StubAction = { type: 'STUB', id: 'INTERNAL_PMBTSL_APPLY' };
    return selectOrInteract(oppCandsPMTSL, 1, false, 'opp_field', noopPMTSL as EffectAction, contPMTSL as EffectAction, ctx);
  }
  if (stub.id === 'INTERNAL_PMBTSL_APPLY') {
    const selected = ctx.lastProcessedCards ?? [];
    if (selected.length === 0) return done(addLog(ctx, '対象なし（INTERNAL_PMBTSL_APPLY）'));
    const lastTrIPMTSL = ctx.ownerState.trash.at(-1) ?? '';
    const lvIPMTSL = parseInt(ctx.cardMap.get(lastTrIPMTSL)?.Level ?? '0') || 0;
    const deltaIPMTSL = -(lvIPMTSL * 2000);
    const modsIPMTSL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of selected) modsIPMTSL.push({ cardNum: cn, delta: deltaIPMTSL });
    const nameIPMTSL = ctx.cardMap.get(lastTrIPMTSL)?.CardName ?? lastTrIPMTSL;
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIPMTSL } },
      `${selected.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・')}のパワー${deltaIPMTSL}（${nameIPMTSL} Lv${lvIPMTSL}）`));
  }
  // 自シグニのパワーの半分だけ全相手シグニをパワーマイナス
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
        `全相手シグニパワー-${halfPowerAOSPDH}（自パワー${selfPowerAOSPDH}の半分）`));
    }
    return done(addLog(ctx, '全相手シグニパワー半減（自パワー0）'));
  }
  // エナゾーンからカード1枚選んでトラッシュ（SELECT→INTERNAL）
  if (stub.id === 'ENERGY_TO_TRASH') {
    const selfEnergyETT = ctx.ownerState.energy;
    if (selfEnergyETT.length === 0) return done(addLog(ctx, 'エナゾーンにカードなし（ENERGY_TO_TRASH）'));
    const noopETT: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contETT: StubAction = { type: 'STUB', id: 'INTERNAL_ENERGY_TO_TRASH' };
    return needsInteraction(addLog(ctx, 'エナゾーンからカードを選択（トラッシュへ）'), {
      type: 'SELECT_TARGET', candidates: selfEnergyETT, count: 1, optional: false,
      targetScope: 'self_energy', thenAction: noopETT as EffectAction, continuation: contETT as EffectAction,
    });
  }
  // ENERGY_TO_TRASH の後処理：選択したエナカードをトラッシュへ
  if (stub.id === 'INTERNAL_ENERGY_TO_TRASH') {
    const selectedETT = ctx.lastProcessedCards ?? [];
    if (selectedETT.length === 0) return done(addLog(ctx, 'なし（INTERNAL_ENERGY_TO_TRASH）'));
    const newEnergyETT = ctx.ownerState.energy.filter(cn => !selectedETT.includes(cn));
    const newTrashETT = [...ctx.ownerState.trash, ...selectedETT];
    const newOwnerETT = { ...ctx.ownerState, energy: newEnergyETT, trash: newTrashETT };
    const nameETT = selectedETT.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, ownerState: newOwnerETT }, `エナゾーン：${nameETT}→トラッシュ`));
  }
  // デッキ上のクラスシグニを最大2枚選んでエナゾーンへ（LOOK_AND_REORDER後）
  if (stub.id === 'CLASS_SIGNI_TO_ENERGY') {
    const srcCSTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCSTE = srcCSTE ? (srcCSTE.EffectText ?? '') + ' ' + (srcCSTE.BurstText ?? '') : '';
    const toHWCSTE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchCSTE = txtCSTE.match(/[<＜《]([^>＞》]+)[>＞»]のシグニ(?:を([０-９\d]*)枚まで|を([０-９\d]*)体まで)/);
    const targetClassCSTE = classMatchCSTE?.[1];
    const maxPickCSTE = parseInt(toHWCSTE(classMatchCSTE?.[2] ?? classMatchCSTE?.[3] ?? '2')) || 2;
    const topCardsCSTE = ctx.ownerState.deck.slice(0, 4);
    const filteredCSTE = topCardsCSTE.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'シグニ') return false;
      if (targetClassCSTE && !c.CardClass?.includes(targetClassCSTE)) return false;
      return true;
    });
    if (filteredCSTE.length === 0) return done(addLog(ctx, 'デッキ上にクラスシグニなし（CLASS_SIGNI_TO_ENERGY）'));
    const addToEnergyCSTE: AddToEnergyAction = { type: 'ADD_TO_ENERGY', owner: 'self' };
    return needsInteraction(addLog(ctx, `デッキ上4枚からシグニを${maxPickCSTE}枚まで選択（エナゾーンへ）`), {
      type: 'SEARCH', visibleCards: filteredCSTE, maxPick: maxPickCSTE,
      thenAction: addToEnergyCSTE as EffectAction,
    });
  }
  // 公開枚数（lastProcessedCards）に基づくパワー修正
  if (stub.id === 'POWER_MOD_PER_REVEALED') {
    const srcPMPR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMPR = srcPMPR ? (srcPMPR.EffectText ?? '') + ' ' + (srcPMPR.BurstText ?? '') : '';
    const toHWPMPR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealedCountPMPR = (ctx.lastProcessedCards ?? []).length;
    const perMPMPR = txtPMPR.match(/([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    if (perMPMPR && revealedCountPMPR > 0) {
      const divisorPMPR = parseInt(toHWPMPR(perMPMPR[1] || '1')) || 1;
      const deltaPMPR = parseInt(toHWPMPR(perMPMPR[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMPR = Math.floor(revealedCountPMPR / divisorPMPR) * deltaPMPR;
      if (totalDeltaPMPR !== 0) {
        const modsPMPR = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) modsPMPR.push({ cardNum: top, delta: totalDeltaPMPR });
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMPR } },
          `パワー${totalDeltaPMPR > 0 ? '+' : ''}${totalDeltaPMPR}（公開${revealedCountPMPR}枚）`));
      }
    }
    return done(addLog(ctx, `パワー修正（公開${revealedCountPMPR}枚）`));
  }
  // 自場チャーム数に基づくパワー修正
  if (stub.id === 'POWER_BY_CHARM_COUNT') {
    const srcPBCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBCC = srcPBCC ? (srcPBCC.EffectText ?? '') + ' ' + (srcPBCC.BurstText ?? '') : '';
    const toHWPBCC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const charmCountPBCC = (ctx.ownerState.field.signi_charms ?? []).filter(c => c !== null && c !== undefined).length;
    const perMPBCC = txtPBCC.match(/チャーム([０-９\d]*)(?:個|枚)?につき([－＋][０-９\d]+)/);
    if (perMPBCC && charmCountPBCC > 0) {
      const divisorPBCC = parseInt(toHWPBCC(perMPBCC[1] || '1')) || 1;
      const deltaPBCC = parseInt(toHWPBCC(perMPBCC[2]).replace('－', '-').replace('＋', '+'));
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
          `パワー${totalDeltaPBCC > 0 ? '+' : ''}${totalDeltaPBCC}（チャーム${charmCountPBCC}個）`));
      }
    }
    return done(addLog(ctx, `パワー修正（チャーム${charmCountPBCC}個）`));
  }
  // エナゾーンの色の種類数に基づくパワー修正
  if (stub.id === 'POWER_BY_ENERGY_COLOR_VARIETY') {
    const srcPBECV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBECV = srcPBECV ? (srcPBECV.EffectText ?? '') + ' ' + (srcPBECV.BurstText ?? '') : '';
    const toHWPBECV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const energyColorSetPBECV = new Set<string>();
    for (const cn of ctx.ownerState.energy) {
      const colors = (ctx.cardMap.get(cn)?.Color ?? '').split('/').map(c => c.trim()).filter(c => c && c !== '無');
      for (const col of colors) energyColorSetPBECV.add(col);
    }
    const varietyPBECV = energyColorSetPBECV.size;
    const perMPBECV = txtPBECV.match(/エナゾーン.*?色の種類([０-９\d]*)(?:色|つ)?につき([－＋][０-９\d]+)/);
    if (perMPBECV && varietyPBECV > 0) {
      const divisorPBECV = parseInt(toHWPBECV(perMPBECV[1] || '1')) || 1;
      const deltaPBECV = parseInt(toHWPBECV(perMPBECV[2]).replace('－', '-').replace('＋', '+'));
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
          `パワー${totalDeltaPBECV > 0 ? '+' : ''}${totalDeltaPBECV}（エナ色種類${varietyPBECV}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（エナ色種類${varietyPBECV}）`));
  }
  // 自場ライズシグニ数に基づくパワー修正（スタック2枚以上のシグニ）
  if (stub.id === 'POWER_BY_RISE_SIGNI_COUNT') {
    const srcPBRSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBRSC = srcPBRSC ? (srcPBRSC.EffectText ?? '') + ' ' + (srcPBRSC.BurstText ?? '') : '';
    const toHWPBRSC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const riseCountPBRSC = ctx.ownerState.field.signi.filter(s => (s?.length ?? 0) >= 2).length;
    const perMPBRSC = txtPBRSC.match(/ライズシグニ([０-９\d]*)体?につき([－＋][０-９\d]+)/);
    if (perMPBRSC && riseCountPBRSC > 0) {
      const divisorPBRSC = parseInt(toHWPBRSC(perMPBRSC[1] || '1')) || 1;
      const deltaPBRSC = parseInt(toHWPBRSC(perMPBRSC[2]).replace('－', '-').replace('＋', '+'));
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
          `パワー${totalDeltaPBRSC > 0 ? '+' : ''}${totalDeltaPBRSC}（ライズシグニ${riseCountPBRSC}体）`));
      }
    }
    return done(addLog(ctx, `パワー修正（ライズシグニ${riseCountPBRSC}体）`));
  }
  // 相手同ゾーン（前）シグニのレベルに基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_FRONT_LEVEL') {
    const srcPMFLL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMFLL = srcPMFLL ? (srcPMFLL.EffectText ?? '') + ' ' + (srcPMFLL.BurstText ?? '') : '';
    const toHWPMFLL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcZoneFLL = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnFLL = srcZoneFLL >= 0 ? ctx.otherState.field.signi[srcZoneFLL]?.at(-1) : undefined;
    const frontLvFLL = parseInt(ctx.cardMap.get(frontCnFLL ?? '')?.Level ?? '0') || 0;
    const perMPMFLL = txtPMFLL.match(/前.*?シグニのレベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (perMPMFLL && frontLvFLL > 0) {
      const divisorPMFLL = parseInt(toHWPMFLL(perMPMFLL[1] || '1')) || 1;
      const deltaPMFLL = parseInt(toHWPMFLL(perMPMFLL[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMFLL = Math.floor(frontLvFLL / divisorPMFLL) * deltaPMFLL;
      if (totalDeltaPMFLL !== 0 && ctx.sourceCardNum) {
        const modsFLL = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMFLL }];
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsFLL } },
          `パワー${totalDeltaPMFLL > 0 ? '+' : ''}${totalDeltaPMFLL}（前シグニLv${frontLvFLL}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（前シグニLv${frontLvFLL}）`));
  }
  // 相手フィールドのウイルスシグニのレベル合計に基づくパワー修正
  if (stub.id === 'INFECTED_SIGNI_POWER_DOWN_BY_LEVEL') {
    const srcISPDL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtISPDL = srcISPDL ? (srcISPDL.EffectText ?? '') + ' ' + (srcISPDL.BurstText ?? '') : '';
    const toHWISPDL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const virusLvSumISPDL = [0, 1, 2].reduce((acc, zi) => {
      if ((ctx.otherState.field.signi_virus?.[zi] ?? 0) === 0) return acc;
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      return acc + (parseInt(ctx.cardMap.get(top ?? '')?.Level ?? '0') || 0);
    }, 0);
    const perMISPDL = txtISPDL.match(/ウイルス.*?シグニのレベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (perMISPDL && virusLvSumISPDL > 0) {
      const divisorISPDL = parseInt(toHWISPDL(perMISPDL[1] || '1')) || 1;
      const deltaISPDL = parseInt(toHWISPDL(perMISPDL[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaISPDL = Math.floor(virusLvSumISPDL / divisorISPDL) * deltaISPDL;
      if (totalDeltaISPDL !== 0) {
        const modsISPDL = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) modsISPDL.push({ cardNum: top, delta: totalDeltaISPDL });
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsISPDL } },
          `パワー${totalDeltaISPDL > 0 ? '+' : ''}${totalDeltaISPDL}（ウイルスLv合計${virusLvSumISPDL}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（ウイルスシグニLv合計${virusLvSumISPDL}）`));
  }
  // 自シグニパワーの2倍を全相手シグニにマイナス
  // DOUBLE_OWN_POWER_MINUS: 対象シグニへの自分効果パワー-を2倍にする（SELECT_TARGET + フラグ設置）
  if (stub.id === 'DOUBLE_OWN_POWER_MINUS') {
    const targetDOPM = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (!targetDOPM) {
      const oppSigniDOPM = [0,1,2]
        .map(zi => ctx.otherState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn);
      if (oppSigniDOPM.length === 0) return done(addLog(ctx, '2倍パワー-：相手シグニなし'));
      const noopDOPM: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contDOPM: StubAction = { type: 'STUB', id: 'DOUBLE_OWN_POWER_MINUS' };
      return needsInteraction(addLog(ctx, 'このターン自分効果でパワー-を2倍にするシグニを選択'), {
        type: 'SELECT_TARGET', candidates: oppSigniDOPM, count: 1, optional: false,
        targetScope: 'opp_field', thenAction: noopDOPM as EffectAction,
        continuation: contDOPM as EffectAction,
      });
    }
    const existingDOPM = ctx.ownerState.double_power_minus_targets ?? [];
    const newOwnerDOPM = { ...ctx.ownerState, double_power_minus_targets: [...new Set([...existingDOPM, targetDOPM])] };
    return done(addLog({ ...ctx, ownerState: newOwnerDOPM },
      `${ctx.cardMap.get(targetDOPM)?.CardName ?? targetDOPM}へのパワー-を2倍に設定`));
  }
  // 全自シグニのパワーを2倍にする（現在値と同量をデルタ追加）
  if (stub.id === 'POWER_DOUBLE_ALL') {
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
        `全自シグニのパワー×2（${boostedPDA}体）`));
    return done(addLog(ctx, '自場にシグニなし（POWER_DOUBLE_ALL）'));
  }
  // COPY_TARGET_POWER: 対象シグニのパワーを自シグニの基本パワーにする
  if (stub.id === 'COPY_TARGET_POWER') {
    const selfCnCTP = ctx.sourceCardNum;
    const targetCnCTP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn) ||
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (!selfCnCTP) return done(addLog(ctx, 'パワーコピー不可（自シグニなし）'));
    if (!targetCnCTP) {
      // ターゲット未選択 → SELECT_TARGET してからCOPY_TARGET_POWERを再実行
      const allFieldCTP = [
        ...[0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
        ...[0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
      ].filter(cn => cn !== selfCnCTP);
      if (allFieldCTP.length === 0) return done(addLog(ctx, 'コピー対象シグニなし'));
      const contCTP: StubAction = { type: 'STUB', id: 'COPY_TARGET_POWER' };
      const noopCTP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      return needsInteraction(addLog(ctx, 'パワーをコピーするシグニを選択'), {
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
      `${ctx.cardMap.get(selfCnCTP)?.CardName ?? selfCnCTP}のパワーを${targetPwCTP}にコピー（${ctx.cardMap.get(targetCnCTP)?.CardName ?? targetCnCTP}から）`));
  }
  // 自パワーに合わせて相手シグニのパワーを設定
  if (stub.id === 'SET_OPP_SIGNI_POWER_BY_SELF_POWER') {
    // 対戦相手のシグニ1体のパワーを自シグニのパワーと同じだけ－する
    const selfPwSOSP = ctx.effectivePowers?.get(ctx.sourceCardNum ?? '')
      ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Power ?? '0', 10);
    const targetSOSP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetSOSP) {
      const modsSOSP = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: targetSOSP, delta: -selfPwSOSP }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsSOSP } },
        `${ctx.cardMap.get(targetSOSP)?.CardName ?? targetSOSP}のパワーを${selfPwSOSP}だけ減少`));
    }
    const oppCandsSOSP = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    if (oppCandsSOSP.length === 0) return done(addLog(ctx, '相手シグニなし（SET_OPP_SIGNI_POWER_BY_SELF_POWER）'));
    const applySOSP: StubAction = { type: 'STUB', id: 'SET_OPP_SIGNI_POWER_BY_SELF_POWER' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: oppCandsSOSP, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: applySOSP as EffectAction,
    });
  }
  // クラスが出るまでデッキ上からトラッシュに置く
  if (stub.id === 'DECK_MILL_UNTIL_CLASS') {
    const srcDMUC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDMUC = srcDMUC ? (srcDMUC.EffectText ?? '') + ' ' + (srcDMUC.BurstText ?? '') : '';
    const classMatchDMUC = txtDMUC.match(/[<＜《]([^>＞》]+)[>＞»].*?(?:が出る|が出現|のシグニが現れる)まで/);
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
      if (!targetClassDMUC || (topDataDMUC?.Type === 'シグニ' && topDataDMUC.CardClass?.includes(targetClassDMUC))) break;
    }
    return done(addLog(curDMUC, `デッキ上${milledDMUC}枚をトラッシュ（${targetClassDMUC ?? 'クラス'}まで削り）`));
  }
  // 宣言した数だけデッキ上からトラッシュへ
  if (stub.id === 'DECK_TOP_DECLARED_NUM_TRASH') {
    const declaredNumDTDT = ctx.ownerState.declared_guard_restrict_level ?? 1;
    const topCardsDTDT = ctx.ownerState.deck.slice(0, declaredNumDTDT);
    if (topCardsDTDT.length === 0) return done(addLog(ctx, 'デッキなし（DECK_TOP_DECLARED_NUM_TRASH）'));
    const newOwnerDTDT = {
      ...ctx.ownerState,
      deck: ctx.ownerState.deck.slice(declaredNumDTDT),
      trash: [...ctx.ownerState.trash, ...topCardsDTDT],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerDTDT },
      `デッキ上${topCardsDTDT.length}枚→トラッシュ（宣言数${declaredNumDTDT}）`));
  }
  // 自場シグニのレベル合計枚数をデッキ上からトラッシュ
  if (stub.id === 'TRASH_FROM_DECK_PER_SIGNI_LEVEL') {
    const lvSumTFDPSL = [0, 1, 2].reduce((acc, zi) => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      return acc + (parseInt(ctx.cardMap.get(top ?? '')?.Level ?? '0') || 0);
    }, 0);
    if (lvSumTFDPSL === 0 || ctx.ownerState.deck.length === 0)
      return done(addLog(ctx, `デッキトップトラッシュ不可（Lv合計${lvSumTFDPSL}）`));
    const trashCountTFDPSL = Math.min(lvSumTFDPSL, ctx.ownerState.deck.length);
    const newOwnerTFDPSL = {
      ...ctx.ownerState,
      deck: ctx.ownerState.deck.slice(trashCountTFDPSL),
      trash: [...ctx.ownerState.trash, ...ctx.ownerState.deck.slice(0, trashCountTFDPSL)],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerTFDPSL },
      `デッキ上${trashCountTFDPSL}枚→トラッシュ（シグニLv合計${lvSumTFDPSL}）`));
  }
  // チャーム数だけドロー
  if (stub.id === 'DRAW_BY_CHARM_COUNT') {
    const charmCountDBCC = (ctx.ownerState.field.signi_charms ?? []).filter(c => c !== null && c !== undefined).length;
    if (charmCountDBCC === 0) return done(addLog(ctx, 'チャームなし（DRAW_BY_CHARM_COUNT）'));
    const drawCountDBCC = Math.min(charmCountDBCC, ctx.ownerState.deck.length);
    if (drawCountDBCC === 0) return done(addLog(ctx, 'デッキなし（DRAW_BY_CHARM_COUNT）'));
    const newOwnerDBCC = {
      ...ctx.ownerState,
      deck: ctx.ownerState.deck.slice(drawCountDBCC),
      hand: [...ctx.ownerState.hand, ...ctx.ownerState.deck.slice(0, drawCountDBCC)],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerDBCC }, `${drawCountDBCC}枚ドロー（チャーム${charmCountDBCC}個）`));
  }
  // 複数色（2色以上）の相手シグニをバニッシュ
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
      ? `複数色シグニ${banishedBMCS}体をバニッシュ`
      : '複数色シグニなし（BANISH_MULTI_COLOR_SIGNI）'));
  }
  // 相手フィールドシグニとエナゾーンをすべてトラッシュ
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
    return done(addLog({ ...ctx, otherState: newOtherOTFSAE }, '相手フィールドシグニとエナゾーンをすべてトラッシュ'));
  }
  // 自シグニをフィールドから退場させてデッキ下へ
  if (stub.id === 'LEAVE_FIELD_TO_DECK_BOTTOM') {
    const srcCnLFDB = ctx.sourceCardNum;
    if (!srcCnLFDB || !ctx.ownerState.field.signi.some(s => s?.at(-1) === srcCnLFDB))
      return done(addLog(ctx, '対象がフィールドにいない（LEAVE_FIELD_TO_DECK_BOTTOM）'));
    const removedLFDB = removeFromField(srcCnLFDB, ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: { ...removedLFDB, deck: [...removedLFDB.deck, srcCnLFDB] } },
      `${ctx.cardMap.get(srcCnLFDB)?.CardName ?? srcCnLFDB}をデッキ下へ`));
  }
  // ルリグダメージ無効フラグを設定
  if (stub.id === 'PREVENT_LRIG_DAMAGE' || stub.id === 'PREVENT_DAMAGE_UNTIL_OPP_TURN_END'
      || stub.id === 'PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_lrig_damage: true } },
      'このターンルリグダメージ無効'));
  }
  // 色条件によるライフバースト抑制（相手に suppress_life_burst フラグ）
  if (stub.id === 'SUPPRESS_LIFEBURST_COLOR_CONDITION') {
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, suppress_life_burst: true } },
      'ライフバースト発動抑制（色条件）'));
  }
  // 相手エナが指定数以上のとき超過分をトラッシュ
  if (stub.id === 'OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL') {
    const srcOEOTC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOEOTC = srcOEOTC ? (srcOEOTC.EffectText ?? '') + ' ' + (srcOEOTC.BurstText ?? '') : '';
    const toHWOEOTC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMOEOTC = txtOEOTC.match(/エナゾーンにカードが([０-９\d]*)枚?以上/);
    const maxEnaOEOTC = maxMOEOTC ? (parseInt(toHWOEOTC(maxMOEOTC[1])) || 5) : 5;
    const oppEnaCountOEOTC = ctx.otherState.energy.length;
    if (oppEnaCountOEOTC >= maxEnaOEOTC) {
      // 条件達成時は常に1枚（最後=直近に置かれたカード）をトラッシュ
      const trashedOEOTC = ctx.otherState.energy.slice(-1);
      const newOtherOEOTC = {
        ...ctx.otherState,
        energy: ctx.otherState.energy.slice(0, -1),
        trash: [...ctx.otherState.trash, ...trashedOEOTC],
      };
      return done(addLog({ ...ctx, otherState: newOtherOEOTC },
        `相手エナ1枚→トラッシュ（${oppEnaCountOEOTC}枚≥${maxEnaOEOTC}）`));
    }
    return done(addLog(ctx, `相手エナ${oppEnaCountOEOTC}枚（条件${maxEnaOEOTC}枚以上：未達）`));
  }
  // エナゾーンからカードを手札へ（SELECT→INTERNAL）
  if (stub.id === 'ENERGY_TO_HAND_ON_DECK') {
    const selfEnaETHOD = ctx.ownerState.energy;
    if (selfEnaETHOD.length === 0) return done(addLog(ctx, 'エナゾーンにカードなし（ENERGY_TO_HAND_ON_DECK）'));
    const noopETHOD: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contETHOD: StubAction = { type: 'STUB', id: 'INTERNAL_ENERGY_TO_HAND' };
    return needsInteraction(addLog(ctx, 'エナゾーンからカードを選択（手札へ）'), {
      type: 'SELECT_TARGET', candidates: selfEnaETHOD, count: 1, optional: false,
      targetScope: 'self_energy', thenAction: noopETHOD as EffectAction, continuation: contETHOD as EffectAction,
    });
  }
  // ENERGY_TO_HAND_ON_DECK 後処理：選択エナを手札へ
  if (stub.id === 'INTERNAL_ENERGY_TO_HAND') {
    const selectedETH = ctx.lastProcessedCards ?? [];
    if (selectedETH.length === 0) return done(addLog(ctx, 'なし（INTERNAL_ENERGY_TO_HAND）'));
    const newOwnerETH = {
      ...ctx.ownerState,
      energy: ctx.ownerState.energy.filter(cn => !selectedETH.includes(cn)),
      hand: [...ctx.ownerState.hand, ...selectedETH],
    };
    const nameETH = selectedETH.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, ownerState: newOwnerETH }, `エナゾーン：${nameETH}→手札`));
  }
  // コイン獲得+手札から捨て（先頭N枚を自動捨て）
  if (stub.id === 'GAIN_COIN_AND_DISCARD') {
    const srcGCAD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGCAD = srcGCAD ? (srcGCAD.EffectText ?? '') + ' ' + (srcGCAD.BurstText ?? '') : '';
    const toHWGCAD = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const coinMGCAD = txtGCAD.match(/コイン([０-９\d]*)(?:枚?|個?)を得る/);
    const coinCountGCAD = coinMGCAD ? (parseInt(toHWGCAD(coinMGCAD[1] || '1')) || 1) : 1;
    const discardMGCAD = txtGCAD.match(/手札を([０-９\d]*)枚?(?:捨て|トラッシュ)/);
    const discardCountGCAD = discardMGCAD ? (parseInt(toHWGCAD(discardMGCAD[1] || '1')) || 1) : 1;
    // コイン付与
    const ctxCoinGCAD = addLog({ ...ctx, ownerState: { ...ctx.ownerState, coins: (ctx.ownerState.coins ?? 0) + coinCountGCAD } }, `コイン+${coinCountGCAD}`);
    // 手札がなければそのまま終了
    if (ctxCoinGCAD.ownerState.hand.length === 0) return done(ctxCoinGCAD);
    // インタラクティブ捨て（SELECT_TARGET）
    const actualDiscardGCAD = Math.min(discardCountGCAD, ctxCoinGCAD.ownerState.hand.length);
    const discardActionGCAD: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: actualDiscardGCAD } };
    return selectOrInteract(ctxCoinGCAD.ownerState.hand, actualDiscardGCAD, false, 'self_hand', discardActionGCAD as EffectAction, undefined, ctxCoinGCAD);
  }
  // 対象シグニと自シグニの両方にパワー修正（自場シグニを対象とする）
  if (stub.id === 'POWER_MOD_TARGET_AND_SELF') {
    const srcPMTS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMTS = srcPMTS ? (srcPMTS.EffectText ?? '') + ' ' + (srcPMTS.BurstText ?? '') : '';
    const toHWPMTS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const paramDeltaPMTS = typeof (stub as StubAction & { delta?: number }).delta === 'number'
      ? (stub as StubAction & { delta?: number }).delta!
      : undefined;
    const deltaMPMTS = !paramDeltaPMTS ? txtPMTS.match(/([－＋][０-９\d]+)/) : null;
    if (paramDeltaPMTS === undefined && !deltaMPMTS) return done(addLog(ctx, 'パワー修正（対象+自）'));
    const deltaPMTS = paramDeltaPMTS !== undefined
      ? paramDeltaPMTS
      : parseInt(toHWPMTS(deltaMPMTS![1]).replace('－', '-').replace('＋', '+'));
    // lastProcessedCards が自場シグニ（trigger signi: 場に出たとき）→ 自場に適用
    const ownTargetsPMTS = (ctx.lastProcessedCards ?? []).filter(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    let newCtxPMTS = ctx;
    if (ownTargetsPMTS.length > 0) {
      const modsOwn = [...(newCtxPMTS.ownerState.temp_power_mods ?? [])];
      for (const cn of ownTargetsPMTS) modsOwn.push({ cardNum: cn, delta: deltaPMTS });
      newCtxPMTS = { ...newCtxPMTS, ownerState: { ...newCtxPMTS.ownerState, temp_power_mods: modsOwn } };
    }
    // 自シグニ（sourceCardNum）にも同デルタ
    if (ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)) {
      const modsSelf = [...(newCtxPMTS.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPMTS }];
      newCtxPMTS = { ...newCtxPMTS, ownerState: { ...newCtxPMTS.ownerState, temp_power_mods: modsSelf } };
    }
    return done(addLog(newCtxPMTS, `対象+自シグニパワー${deltaPMTS > 0 ? '+' : ''}${deltaPMTS}`));
  }
  // 自シグニのパワーに等しく相手シグニのパワーを設定
  if (stub.id === 'POWER_EQUAL_TO_SELF_POWER') {
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
      `相手シグニのパワーを${selfPwPETS}に設定`));
  }
  // 前のシグニのパワーと等しく設定（自シグニを前シグニのパワーに）
  if (stub.id === 'POWER_EQUALS_FRONT_SIGNI') {
    const srcZonePEFS = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnPEFS = srcZonePEFS >= 0 ? ctx.otherState.field.signi[srcZonePEFS]?.at(-1) : undefined;
    if (!frontCnPEFS || !ctx.sourceCardNum) return done(addLog(ctx, '前シグニなし（POWER_EQUALS_FRONT_SIGNI）'));
    const frontPwPEFS = ctx.effectivePowers?.get(frontCnPEFS) ?? parseInt(ctx.cardMap.get(frontCnPEFS)?.Power ?? '0', 10);
    const selfPwPEFS = ctx.effectivePowers?.get(ctx.sourceCardNum) ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum)?.Power ?? '0', 10);
    const deltaPEFS = frontPwPEFS - selfPwPEFS;
    if (deltaPEFS !== 0) {
      const modsPEFS = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPEFS }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPEFS } },
        `パワーを前シグニの${frontPwPEFS}に設定`));
    }
    return done(addLog(ctx, `パワー既に${frontPwPEFS}（前シグニと同値）`));
  }
  // 自・相手のシグニレベル合計比較（自≦相手の場合）× levelSum → 1体相手シグニパワー修正
  if (stub.id === 'POWER_BY_LEVEL_SUM_COMPARE') {
    const toHWPBLSC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const selfLvSumPBLSC = [0, 1, 2].reduce((acc, zi) =>
      acc + (parseInt(ctx.cardMap.get(ctx.ownerState.field.signi[zi]?.at(-1) ?? '')?.Level ?? '0') || 0), 0);
    const oppLvSumPBLSC = [0, 1, 2].reduce((acc, zi) =>
      acc + (parseInt(ctx.cardMap.get(ctx.otherState.field.signi[zi]?.at(-1) ?? '')?.Level ?? '0') || 0), 0);
    // 条件：自Lv合計 ≦ 相手Lv合計（以下）
    if (selfLvSumPBLSC > oppLvSumPBLSC) {
      return done(addLog(ctx, `パワー修正なし（Lv合計：自${selfLvSumPBLSC}＞相手${oppLvSumPBLSC}）`));
    }
    const srcPBLSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBLSC = srcPBLSC ? (srcPBLSC.EffectText ?? '') + ' ' + (srcPBLSC.BurstText ?? '') : '';
    const mPBLSC = txtPBLSC.match(/([０-９\d]+)につき([－＋][０-９\d]+)/);
    const divisorPBLSC = mPBLSC ? parseInt(toHWPBLSC(mPBLSC[1])) || 1 : 1;
    const deltaPerPBLSC = mPBLSC ? parseInt(toHWPBLSC(mPBLSC[2]).replace('－', '-').replace('＋', '+')) : -1000;
    const totalDeltaPBLSC = Math.floor(selfLvSumPBLSC / divisorPBLSC) * deltaPerPBLSC;
    const existPBLSC = (ctx.lastProcessedCards ?? []).find(cn => ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (existPBLSC) {
      const modsPBLSC = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: existPBLSC, delta: totalDeltaPBLSC }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBLSC } },
        `${ctx.cardMap.get(existPBLSC)?.CardName ?? existPBLSC}のパワー${totalDeltaPBLSC}（Lv合計${selfLvSumPBLSC}≦${oppLvSumPBLSC}）`));
    }
    const oppCandsPBLSC = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPBLSC.length === 0) return done(addLog(ctx, '相手シグニなし（POWER_BY_LEVEL_SUM_COMPARE）'));
    const contPBLSC: StubAction = { type: 'STUB', id: 'POWER_BY_LEVEL_SUM_COMPARE' };
    const noopPBLSC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(oppCandsPBLSC, 1, false, 'opp_field', noopPBLSC as EffectAction, contPBLSC as EffectAction, ctx);
  }
  // 捨てたシグニのパワーだけ自場シグニ1体をパワーアップ（SELECT自場→自己再帰）
  if (stub.id === 'POWER_UP_BY_DISCARDED_SIGNI_POWER') {
    const trashedCnPUBDP = ctx.ownerState.trash.at(-1) ?? '';
    const trashedPwPUBDP = parseInt(ctx.cardMap.get(trashedCnPUBDP)?.Power ?? '0') || 0;
    if (trashedPwPUBDP <= 0) return done(addLog(ctx, `パワーアップ不可（トラッシュシグニパワー${trashedPwPUBDP}）`));
    // 自場シグニが選択済みなら適用
    const fieldTargetPUBDP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (fieldTargetPUBDP) {
      const modsPUBDP = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: fieldTargetPUBDP, delta: trashedPwPUBDP }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPUBDP } },
        `${ctx.cardMap.get(fieldTargetPUBDP)?.CardName ?? fieldTargetPUBDP}のパワー+${trashedPwPUBDP}（捨てたシグニのパワー）`));
    }
    // SELECT 1 own field signi
    const ownCandsPUBDP = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      return top ? [top] : [];
    });
    if (ownCandsPUBDP.length === 0) return done(addLog(ctx, '自場にシグニなし（POWER_UP_BY_DISCARDED_SIGNI_POWER）'));
    const contPUBDP: StubAction = { type: 'STUB', id: 'POWER_UP_BY_DISCARDED_SIGNI_POWER' };
    const noopPUBDP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(ownCandsPUBDP, 1, false, 'self_field', noopPUBDP as EffectAction, contPUBDP as EffectAction, ctx);
  }
  // シャッフル後に全シグニのパワーを半減
  if (stub.id === 'SHUFFLE_DECK_POWER_HALF') {
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
      `デッキシャッフル→全相手シグニパワー半減`));
  }
  // 公開したシグニをフィールドに出し、残りをトラッシュ
  if (stub.id === 'REVEALED_SIGNI_TO_FIELD_REST_TRASH') {
    const revealedRSTF = ctx.lastProcessedCards ?? [];
    if (revealedRSTF.length === 0) return done(addLog(ctx, '公開カードなし（REVEALED_SIGNI_TO_FIELD_REST_TRASH）'));
    const signiRSTF = revealedRSTF.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    const nonSigniRSTF = revealedRSTF.filter(cn => ctx.cardMap.get(cn)?.Type !== 'シグニ');
    let newOwnerRSTF = ctx.ownerState;
    // シグニをフィールドへ（空きゾーンへ順番に配置）
    const fieldRSTF = [...newOwnerRSTF.field.signi] as (string[] | null)[];
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
    // 残りをトラッシュへ
    for (const cn of nonSigniRSTF) {
      const di = newOwnerRSTF.deck.indexOf(cn);
      if (di >= 0) {
        const newDeckRSTF = [...newOwnerRSTF.deck];
        newDeckRSTF.splice(di, 1);
        newOwnerRSTF = { ...newOwnerRSTF, deck: newDeckRSTF, trash: [...newOwnerRSTF.trash, cn] };
      }
    }
    return done(addLog({ ...ctx, ownerState: newOwnerRSTF },
      `公開シグニ${signiRSTF.length}体→フィールド、非シグニ${nonSigniRSTF.length}枚→トラッシュ`));
  }
  // 相手シグニをデッキのN番目に挿入
  if (stub.id === 'OPP_SIGNI_TO_DECK_NTH') {
    const targetOSTDN = (ctx.lastProcessedCards ?? [])[0];
    if (!targetOSTDN) return done(addLog(ctx, '対象なし（OPP_SIGNI_TO_DECK_NTH）'));
    const srcOSTDN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOSTDN = srcOSTDN ? (srcOSTDN.EffectText ?? '') + ' ' + (srcOSTDN.BurstText ?? '') : '';
    const toHWOSTDN = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const nthMOSTDN = txtOSTDN.match(/デッキの上から([０-９\d]*)番目/);
    const nthOSTDN = nthMOSTDN ? (parseInt(toHWOSTDN(nthMOSTDN[1])) - 1) : 0;
    const removedOSTDN = removeFromField(targetOSTDN, ctx.otherState);
    const newOtherDeckOSTDN = [...removedOSTDN.deck];
    newOtherDeckOSTDN.splice(Math.max(0, nthOSTDN), 0, targetOSTDN);
    return done(addLog({ ...ctx, otherState: { ...removedOSTDN, deck: newOtherDeckOSTDN } },
      `${ctx.cardMap.get(targetOSTDN)?.CardName ?? targetOSTDN}→相手デッキ上から${nthOSTDN + 1}番目`));
  }
  // 相手シグニが退場時にエナではなくトラッシュへ（フラグ設定）
  if (stub.id === 'OPP_SIGNI_LEAVE_TO_TRASH') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, banish_redirect: true } },
      '相手シグニのバニッシュ先→トラッシュに変更'));
  }
  // 相手より手札が少ない場合、相手の手札をデッキ下へ
  if (stub.id === 'OPP_HAND_TO_DECK_BOTTOM_IF_LESS_HAND') {
    const selfHandCntOHTDB = ctx.ownerState.hand.length;
    const oppHandCntOHTDB = ctx.otherState.hand.length;
    const excessOHTDB = oppHandCntOHTDB - selfHandCntOHTDB;
    if (excessOHTDB <= 0) return done(addLog(ctx, `相手手札${oppHandCntOHTDB}枚≤自手札${selfHandCntOHTDB}枚（条件未達）`));
    // 相手は超過枚数分を選択してデッキ下へ（1枚なら自動）
    if (excessOHTDB >= oppHandCntOHTDB) {
      // 全手札→デッキ下（超過が手札枚数以上の場合）
      const newOtherOHTDB = { ...ctx.otherState, hand: [], deck: [...ctx.otherState.deck, ...ctx.otherState.hand] };
      return done(addLog({ ...ctx, otherState: newOtherOHTDB }, `相手手札全${oppHandCntOHTDB}枚→デッキ下`));
    }
    return needsInteraction(addLog(ctx, `相手は手札を${excessOHTDB}枚選んでデッキ下に置く`), {
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
  // INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N: 選択した相手手札をデッキ下へ
  if (stub.id === 'INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N') {
    const selectedIOHTDBN = ctx.lastProcessedCards ?? [];
    if (selectedIOHTDBN.length === 0) return done(addLog(ctx, 'スキップ'));
    const newHandIOHTDBN = ctx.otherState.hand.filter(c => !selectedIOHTDBN.includes(c));
    const newOtherIOHTDBN = { ...ctx.otherState, hand: newHandIOHTDBN, deck: [...ctx.otherState.deck, ...selectedIOHTDBN] };
    return done(addLog({ ...ctx, otherState: newOtherIOHTDBN }, `相手手札${selectedIOHTDBN.length}枚→デッキ下`));
  }
  // トラッシュから3ゾーンへ分配（lastProcessedCards→各ゾーンへ）
  // TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH: トラッシュから3枚選んでエナ/手札/デッキ下に分配
  if (stub.id === 'TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH') {
    if ((ctx.lastProcessedCards?.length ?? 0) >= 3) {
      const [toEna, toHand, toDeck] = ctx.lastProcessedCards!;
      let sTZDFT = ctx.ownerState;
      sTZDFT = { ...sTZDFT, trash: sTZDFT.trash.filter(c => c !== toEna && c !== toHand && c !== toDeck) };
      sTZDFT = { ...sTZDFT, energy: [...sTZDFT.energy, toEna], hand: [...sTZDFT.hand, toHand], deck: [...sTZDFT.deck, toDeck] };
      const nameTZDFT = [toEna, toHand, toDeck].map(c => ctx.cardMap.get(c)?.CardName ?? c).join('・');
      return done(addLog({ ...ctx, ownerState: sTZDFT },
        `${nameTZDFT}→エナ/手札/デッキ下`));
    }
    if (ctx.ownerState.trash.length < 3) {
      return done(addLog(ctx, 'トラッシュが3枚未満（TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH）'));
    }
    const contTZDFT: StubAction = { type: 'STUB', id: 'TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH' };
    return needsInteraction(addLog(ctx, 'トラッシュから3枚選択（1枚目→エナ・2枚目→手札・3枚目→デッキ下）'), {
      type: 'SELECT_TARGET', candidates: ctx.ownerState.trash, count: 3, optional: false,
      targetScope: 'self_trash', thenAction: contTZDFT as EffectAction,
    });
  }
  // 自・相手を両方エナへ（ゾーン交換系）
  if (stub.id === 'TRADE_SELF_AND_OPP_TO_ENERGY') {
    const selfCnTSAOTE = ctx.sourceCardNum;
    const oppTargetTSAOTE = (ctx.lastProcessedCards ?? [])[0];
    if (!selfCnTSAOTE) return done(addLog(ctx, '対象なし（TRADE_SELF_AND_OPP_TO_ENERGY）'));
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
      `自・相手シグニをエナゾーンへ`));
  }
  // 自シグニをデッキトップへ（フィールドから退場）
  if (stub.id === 'SELF_TO_DECK_TOP') {
    const selfCnSTDT = ctx.sourceCardNum;
    if (!selfCnSTDT || !ctx.ownerState.field.signi.some(s => s?.at(-1) === selfCnSTDT))
      return done(addLog(ctx, '対象がフィールドにいない（SELF_TO_DECK_TOP）'));
    const removedSTDT = removeFromField(selfCnSTDT, ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: { ...removedSTDT, deck: [selfCnSTDT, ...removedSTDT.deck] } },
      `${ctx.cardMap.get(selfCnSTDT)?.CardName ?? selfCnSTDT}をデッキトップへ`));
  }
  // 相手シグニをゲートを通じてデッキへ（バウンス）
  if (stub.id === 'OPP_SIGNI_TO_DECK_BY_GATE') {
    const targetOSTDBG = (ctx.lastProcessedCards ?? [])[0];
    if (!targetOSTDBG) return done(addLog(ctx, '対象なし（OPP_SIGNI_TO_DECK_BY_GATE）'));
    const removedOSTDBG = removeFromField(targetOSTDBG, ctx.otherState);
    const newDeckOSTDBG = [...removedOSTDBG.deck, targetOSTDBG];
    return done(addLog({ ...ctx, otherState: { ...removedOSTDBG, deck: newDeckOSTDBG } },
      `${ctx.cardMap.get(targetOSTDBG)?.CardName ?? targetOSTDBG}→相手デッキ下`));
  }
  // デッキ上のシグニをフィールドへ（最初のシグニを配置）
  if (stub.id === 'LOOK_TOP_SIGNI_TO_FIELD') {
    const topNLTSTF = 3;
    const topCardsLTSTF = ctx.ownerState.deck.slice(0, topNLTSTF);
    const firstSigniLTSTF = topCardsLTSTF.find(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (!firstSigniLTSTF) return done(addLog(ctx, `デッキ上${topNLTSTF}枚にシグニなし`));
    const emptyZoneLTSTF = ctx.ownerState.field.signi.findIndex(z => !z || z.length === 0);
    if (emptyZoneLTSTF < 0) return done(addLog(ctx, '空きシグニゾーンなし'));
    const newDeckLTSTF = ctx.ownerState.deck.filter(cn => cn !== firstSigniLTSTF);
    const newFieldLTSTF = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newFieldLTSTF[emptyZoneLTSTF] = [firstSigniLTSTF];
    // 残りはデッキ下へ（トラッシュへのバリアント）
    const restLTSTF = topCardsLTSTF.filter(cn => cn !== firstSigniLTSTF);
    const restDeckLTSTF = newDeckLTSTF.filter(cn => !restLTSTF.includes(cn));
    const finalTrashLTSTF = [...ctx.ownerState.trash, ...restLTSTF];
    return done(addLog({ ...ctx, ownerState: {
      ...ctx.ownerState, deck: restDeckLTSTF, trash: finalTrashLTSTF,
      field: { ...ctx.ownerState.field, signi: newFieldLTSTF },
    }}, `デッキ上から${ctx.cardMap.get(firstSigniLTSTF)?.CardName ?? firstSigniLTSTF}→フィールド`));
  }
  // 追加ターンを獲得（ログのみ、ゲームエンジン実装が必要）
  // GAIN_EXTRA_TURN: 追加ターンフラグをセット（BattleScreen側でターン終了時に追加ターンを付与）
  if (stub.id === 'GAIN_EXTRA_TURN') {
    const newOwnerET = { ...ctx.ownerState, extra_turn: true };
    return done(addLog({ ...ctx, ownerState: newOwnerET }, '追加ターンを獲得（次のターン終了後にもう1ターン）'));
  }
  // ガードアイコン付与（手札のシグニに付与: フラグ設定）
  if (stub.id === 'HAND_SIGNI_HAS_GUARD_ICON') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, hand_signi_guard_enabled: true } },
      '手札のシグニすべてにガードアイコン付与'));
  }
  // フィールドのエナシグニが色を獲得（ログのみ・スキップ）
  if (stub.id === 'FIELD_ENERGY_SIGNI_GAIN_COLOR') {
    return done(addLog(ctx, 'エナゾーンのシグニが色を獲得（スキップ）'));
  }
  // 相手が宣言した色に応じてエナをトラッシュ（相手の宣言が必要→スキップ）
  // DECLARE_COLOR_COND_ENERGY_TRASH: 色を宣言し、エナから宣言色のカードを任意でトラッシュ
  if (stub.id === 'DECLARE_COLOR_COND_ENERGY_TRASH' || stub.id === 'OPP_DECLARE_COLOR_COND_ENERGY_TRASH') {
    if (ctx.ownerState.energy.length === 0) return done(addLog(ctx, 'エナなし'));
    const noopDCCET: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    const setColorDCCET = (c: string): StubAction => ({ type: 'STUB', id: 'INTERNAL_DCCE_TRASH_COLOR', value: c });
    const colorOptsDCCET = ['白', '赤', '青', '緑', '黒'].map(c => ({
      id: `dcce_${c}`, label: `${c}を宣言してエナトラッシュ`, action: setColorDCCET(c) as EffectAction, available: true,
    }));
    colorOptsDCCET.push({ id: 'dcce_skip', label: 'しない', action: noopDCCET as EffectAction, available: true });
    return needsInteraction(addLog(ctx, '色を宣言してエナトラッシュしますか？'), {
      type: 'CHOOSE', options: colorOptsDCCET, count: 1,
    });
  }
  // INTERNAL_DCCE_TRASH_COLOR: 宣言色のエナ1枚をトラッシュ
  if (stub.id === 'INTERNAL_DCCE_TRASH_COLOR') {
    const colorDCCE = typeof stub.value === 'string' ? stub.value : '';
    const matchingDCCE = ctx.ownerState.energy.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Color?.includes(colorDCCE) ?? false;
    });
    if (matchingDCCE.length === 0) return done(addLog(ctx, `${colorDCCE}エナなし`));
    if (matchingDCCE.length === 1) {
      const cn = matchingDCCE[0];
      const newOwnerDCCE: PlayerState = { ...ctx.ownerState, energy: ctx.ownerState.energy.filter(c => c !== cn), trash: [...ctx.ownerState.trash, cn] };
      return done(addLog({ ...ctx, ownerState: newOwnerDCCE }, `${colorDCCE}エナ→トラッシュ`));
    }
    return selectOrInteract(matchingDCCE, 1, false, 'self_energy',
      ({ type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 1 } } as TrashAction) as EffectAction,
      undefined, addLog(ctx, `${colorDCCE}エナを1枚選んでトラッシュ`));
  }
  // エナのカードが指定レベル合計を超えたらトラッシュ
  if (stub.id === 'ENERGY_BY_LEVEL_SUM_LIMIT') {
    const srcEBLSL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtEBLSL = srcEBLSL ? (srcEBLSL.EffectText ?? '') + ' ' + (srcEBLSL.BurstText ?? '') : '';
    const toHWEBLSL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxLvMEBLSL = txtEBLSL.match(/レベルの合計が([０-９\d]*)を超え/);
    const maxLvEBLSL = maxLvMEBLSL ? (parseInt(toHWEBLSL(maxLvMEBLSL[1])) || 10) : 10;
    const enaLvSumEBLSL = ctx.ownerState.energy.reduce((acc, cn) => {
      return acc + (parseInt(ctx.cardMap.get(cn)?.Level ?? '0') || 0);
    }, 0);
    if (enaLvSumEBLSL > maxLvEBLSL) {
      const excessEBLSL = enaLvSumEBLSL - maxLvEBLSL;
      // 末尾から excess 分をトラッシュ（簡易実装）
      const trashCountEBLSL = ctx.ownerState.energy.slice().reverse().reduce((acc, cn) => {
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
        `エナLv合計${enaLvSumEBLSL}→上限${maxLvEBLSL}超え、${trashCountEBLSL.length}枚トラッシュ`));
    }
    return done(addLog(ctx, `エナLv合計${enaLvSumEBLSL}（上限${maxLvEBLSL}以内）`));
  }
  // 相手エナのカード1枚を色条件でトラッシュ（相手が選択→スキップ）
  if (stub.id === 'OPP_ENERGY_COLOR_CONDITION_TRASH') {
    // 相手エナから色条件に合うカードを1枚自動トラッシュ（最後の1枚）
    const srcOECCT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOECCT = srcOECCT ? (srcOECCT.EffectText ?? '') + ' ' + (srcOECCT.BurstText ?? '') : '';
    const colorMOECCT = txtOECCT.match(/([赤青緑黒白無])のカード/);
    const targetColorOECCT = colorMOECCT?.[1];
    const targetCardOECCT = targetColorOECCT
      ? ctx.otherState.energy.find(cn => (ctx.cardMap.get(cn)?.Color ?? '').includes(targetColorOECCT))
      : ctx.otherState.energy.at(-1);
    if (!targetCardOECCT) return done(addLog(ctx, '対象エナカードなし（OPP_ENERGY_COLOR_CONDITION_TRASH）'));
    const newOtherOECCT = {
      ...ctx.otherState,
      energy: ctx.otherState.energy.filter(cn => cn !== targetCardOECCT),
      trash: [...ctx.otherState.trash, targetCardOECCT],
    };
    return done(addLog({ ...ctx, otherState: newOtherOECCT },
      `相手エナ：${ctx.cardMap.get(targetCardOECCT)?.CardName ?? targetCardOECCT}→トラッシュ`));
  }
  // TRASHED_CARD_TO_HAND_OR_ENERGY → 手札選択後処理
  if (stub.id === 'INTERNAL_TRASH_TO_HAND') {
    const targetITTH = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetITTH) return done(ctx);
    const ti = ctx.ownerState.trash.indexOf(targetITTH);
    if (ti < 0) return done(ctx);
    const newTrashITTH = [...ctx.ownerState.trash]; newTrashITTH.splice(ti, 1);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashITTH, hand: [...ctx.ownerState.hand, targetITTH] } },
      `トラッシュ：${ctx.cardMap.get(targetITTH)?.CardName ?? targetITTH}→手札`));
  }
  // TRASHED_CARD_TO_HAND_OR_ENERGY → エナ選択後処理
  if (stub.id === 'INTERNAL_TRASH_TO_ENERGY') {
    const targetITTE = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetITTE) return done(ctx);
    const ti = ctx.ownerState.trash.indexOf(targetITTE);
    if (ti < 0) return done(ctx);
    const newTrashITTE = [...ctx.ownerState.trash]; newTrashITTE.splice(ti, 1);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashITTE, energy: [...ctx.ownerState.energy, targetITTE] } },
      `トラッシュ：${ctx.cardMap.get(targetITTE)?.CardName ?? targetITTE}→エナゾーン`));
  }
  // 複数シグニをエナへ（lastProcessedCards or 全自フィールドシグニ）
  if (stub.id === 'MULTI_SIGNI_TO_ENERGY') {
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
      countMSTE > 0 ? `${countMSTE}体のシグニをエナゾーンへ` : 'シグニをエナへ（対象なし）'));
  }
  // 非ガードの手札捨てをエナゾーンへ
  if (stub.id === 'NON_GUARD_DISCARD_TO_ENERGY') {
    const lastDiscardedNGDE = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1) ?? '';
    if (!lastDiscardedNGDE) return done(addLog(ctx, 'カードなし（NON_GUARD_DISCARD_TO_ENERGY）'));
    const isGuardNGDE = (ctx.cardMap.get(lastDiscardedNGDE)?.Guard ?? '') !== '';
    if (!isGuardNGDE) {
      // トラッシュからエナへ移動
      const ti = ctx.ownerState.trash.indexOf(lastDiscardedNGDE);
      if (ti >= 0) {
        const newTrashNGDE = [...ctx.ownerState.trash]; newTrashNGDE.splice(ti, 1);
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashNGDE, energy: [...ctx.ownerState.energy, lastDiscardedNGDE] } },
          `${ctx.cardMap.get(lastDiscardedNGDE)?.CardName ?? lastDiscardedNGDE}（非ガード）→エナゾーン`));
      }
    }
    return done(addLog(ctx, 'ガードカード（NON_GUARD_DISCARD_TO_ENERGY）'));
  }
  // ゾーンが空いているときトラッシュ（条件付き）
  if (stub.id === 'TRASH_IF_ZONE_OCCUPIED') {
    const emptyZoneTIZO = ctx.ownerState.field.signi.findIndex(z => !z || z.length === 0);
    if (emptyZoneTIZO < 0 && ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)) {
      const removedTIZO = removeFromField(ctx.sourceCardNum, ctx.ownerState);
      return done(addLog({ ...ctx, ownerState: { ...removedTIZO, trash: [...removedTIZO.trash, ctx.sourceCardNum] } },
        `${ctx.cardMap.get(ctx.sourceCardNum)?.CardName ?? ctx.sourceCardNum}→トラッシュ（ゾーン満杯）`));
    }
    return done(addLog(ctx, 'ゾーン空きあり（TRASH_IF_ZONE_OCCUPIED）'));
  }
  // 条件付きトラッシュ→エナ（センタールリグ名条件付き）
  if (stub.id === 'CONDITIONAL_TRASH_TO_ENERGY') {
    const srcCTTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCTTE = srcCTTE ? (srcCTTE.EffectText ?? '') + ' ' + (srcCTTE.BurstText ?? '') : '';
    // 「センタールリグが＜X＞の場合」条件チェック
    const lrigCondM = txtCTTE.match(/あなたのセンタールリグが＜([^＞]+)＞の場合/);
    if (lrigCondM) {
      const reqLrigClass = lrigCondM[1];
      const centerLrig = ctx.ownerState.field.lrig.at(-1);
      const lrigCard = centerLrig ? ctx.cardMap.get(centerLrig) : undefined;
      const lrigOk = lrigCard && ((lrigCard.Story ?? '').includes(reqLrigClass) || (lrigCard.CardClass ?? '').includes(reqLrigClass) || (lrigCard.CardName ?? '').includes(reqLrigClass));
      if (!lrigOk) return done(addLog(ctx, `センタールリグが＜${reqLrigClass}＞でない（条件未達）`));
    }
    const targetCTTE = ctx.sourceCardNum && ctx.ownerState.trash.includes(ctx.sourceCardNum)
      ? ctx.sourceCardNum
      : (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetCTTE) return done(addLog(ctx, 'トラッシュにカードなし（CONDITIONAL_TRASH_TO_ENERGY）'));
    const ti = ctx.ownerState.trash.indexOf(targetCTTE);
    if (ti < 0) return done(addLog(ctx, '対象がトラッシュにない'));
    const newTrashCTTE = [...ctx.ownerState.trash]; newTrashCTTE.splice(ti, 1);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashCTTE, energy: [...ctx.ownerState.energy, targetCTTE] } },
      `トラッシュ：${ctx.cardMap.get(targetCTTE)?.CardName ?? targetCTTE}→エナゾーン`));
  }
  // トラッシュからクラスシグニを手札かエナへ選択
  if (stub.id === 'TRASH_CLASS_TO_HAND_OR_ENERGY') {
    // トラッシュからクラスカードを複数選択 → 1枚まで手札、残りエナゾーンへ
    const srcTCTHOE2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTCTHOE2 = srcTCTHOE2 ? (srcTCTHOE2.EffectText ?? '') + ' ' + (srcTCTHOE2.BurstText ?? '') : '';
    const toHWTCTHOE2 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMTCTHOE2 = txtTCTHOE2.match(/＜([^＞]+)＞/);
    const targetClassTCTHOE2 = classMTCTHOE2?.[1];
    const countMTCTHOE2 = txtTCTHOE2.match(/([０-９\d]+)枚まで対象/);
    const maxCountTCTHOE2 = countMTCTHOE2 ? parseInt(toHWTCTHOE2(countMTCTHOE2[1])) : 1;
    const candsTCTHOE2 = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return (!targetClassTCTHOE2 || (c?.CardClass ?? '').includes(targetClassTCTHOE2));
    });
    if (candsTCTHOE2.length === 0) return done(addLog(ctx, 'トラッシュに対象なし（TRASH_CLASS_TO_HAND_OR_ENERGY）'));
    const contTCTHOE2: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CLASS_SPLIT' };
    return needsInteraction(addLog(ctx, `トラッシュから${targetClassTCTHOE2 ?? 'カード'}を${maxCountTCTHOE2}枚まで選択`), {
      type: 'SELECT_TARGET', candidates: candsTCTHOE2, count: maxCountTCTHOE2, optional: false,
      targetScope: 'self_trash', thenAction: contTCTHOE2 as EffectAction,
    });
  }
  // INTERNAL_TRASH_CLASS_SPLIT: 選択カードを手札（1枚）＋エナ（残り）に振り分け
  if (stub.id === 'INTERNAL_TRASH_CLASS_SPLIT') {
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
    if (toProcess.length === 0) return done(addLog({ ...ctx, ownerState: newOwnerITCS }, '対象カードなし'));
    // 1枚目→手札、残り→エナゾーン
    const [handCard, ...enaCards] = toProcess;
    newOwnerITCS = {
      ...newOwnerITCS,
      hand: [...newOwnerITCS.hand, handCard],
      energy: [...newOwnerITCS.energy, ...enaCards],
    };
    const names = [
      `${ctx.cardMap.get(handCard)?.CardName ?? handCard}→手札`,
      ...enaCards.map(cn => `${ctx.cardMap.get(cn)?.CardName ?? cn}→エナ`),
    ].join('、');
    return done(addLog({ ...ctx, ownerState: newOwnerITCS }, names));
  }
  // ルリグデッキにカードを追加（非ルリグをルリグトラッシュへ）
  if (stub.id === 'NON_LRIG_TO_LRIG_TRASH') {
    const target = (ctx.lastProcessedCards ?? [])[0];
    if (!target) return done(addLog(ctx, '対象なし（NON_LRIG_TO_LRIG_TRASH）'));
    // フィールドまたはトラッシュから除去してルリグトラッシュへ
    let newOwnerNLTLT = ctx.ownerState;
    if (newOwnerNLTLT.field.signi.some(s => s?.at(-1) === target)) {
      newOwnerNLTLT = removeFromField(target, newOwnerNLTLT);
    } else {
      const ti = newOwnerNLTLT.trash.indexOf(target);
      if (ti >= 0) { const t = [...newOwnerNLTLT.trash]; t.splice(ti, 1); newOwnerNLTLT = { ...newOwnerNLTLT, trash: t }; }
    }
    newOwnerNLTLT = { ...newOwnerNLTLT, lrig_trash: [...newOwnerNLTLT.lrig_trash, target] };
    return done(addLog({ ...ctx, ownerState: newOwnerNLTLT },
      `${ctx.cardMap.get(target)?.CardName ?? target}→ルリグトラッシュ`));
  }
  // フィールドの全シグニの名前が一致するカードをエナ・フィールドからトラッシュ
  if (stub.id === 'TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY') {
    const srcTABN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTABN = srcTABN ? (srcTABN.EffectText ?? '') + ' ' + (srcTABN.BurstText ?? '') : '';
    const nameMTABN = txtTABN.match(/「([^」]+)」/);
    const targetNameTABN = nameMTABN?.[1];
    if (!targetNameTABN) return done(addLog(ctx, '対象名称なし（TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY）'));
    let newOtherTABN = ctx.otherState;
    // 相手フィールドから
    for (let zi = 0; zi < 3; zi++) {
      const top = newOtherTABN.field.signi[zi]?.at(-1);
      if (!top || (ctx.cardMap.get(top)?.CardName ?? '') !== targetNameTABN) continue;
      const removedTABN = removeFromField(top, newOtherTABN);
      newOtherTABN = { ...removedTABN, trash: [...removedTABN.trash, top] };
    }
    // 相手エナから
    const enaToTrashTABN = newOtherTABN.energy.filter(cn => (ctx.cardMap.get(cn)?.CardName ?? '') === targetNameTABN);
    newOtherTABN = {
      ...newOtherTABN,
      energy: newOtherTABN.energy.filter(cn => (ctx.cardMap.get(cn)?.CardName ?? '') !== targetNameTABN),
      trash: [...newOtherTABN.trash, ...enaToTrashTABN],
    };
    return done(addLog({ ...ctx, otherState: newOtherTABN },
      `「${targetNameTABN}」を相手フィールド・エナからトラッシュ`));
  }
  // === バッチ4: デッキ/手札/エナ操作 ===
  // DRAW: N枚ドロー
  if (stub.id === 'DRAW') {
    const srcDRW = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDRW = srcDRW ? (srcDRW.EffectText ?? '') + ' ' + (srcDRW.BurstText ?? '') : '';
    const toHWDRW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mDRW = txtDRW.match(/カードを([０-９\d]+)枚引く/);
    const drawCountDRW = mDRW ? parseInt(toHWDRW(mDRW[1])) : 1;
    const sDRW = ctx.ownerState;
    const canDrawDRW = Math.min(drawCountDRW, sDRW.deck.length);
    const newSDRW: PlayerState = { ...sDRW, hand: [...sDRW.hand, ...sDRW.deck.slice(0, canDrawDRW)], deck: sDRW.deck.slice(canDrawDRW) };
    return done(addLog({ ...ctx, ownerState: newSDRW }, `${drawCountDRW}枚ドロー`));
  }
  // DRAW_DISCARD_COUNT_PLUS_N: 捨てた枚数+Nドロー
  if (stub.id === 'DRAW_DISCARD_COUNT_PLUS_N') {
    const toHWDDCPN = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcDDCPN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDDCPN = srcDDCPN ? (srcDDCPN.EffectText ?? '') + ' ' + (srcDDCPN.BurstText ?? '') : '';
    const mDDCPN = txtDDCPN.match(/枚数に([０-９\d]+)を加えた/);
    const plusN = mDDCPN ? parseInt(toHWDDCPN(mDDCPN[1])) : 1;
    const discardCount = ctx.lastProcessedCards?.length ?? 0;
    const drawCount = discardCount + plusN;
    const sDDCPN = ctx.ownerState;
    const canDraw = Math.min(drawCount, sDDCPN.deck.length);
    const newSDDCPN: PlayerState = { ...sDDCPN, hand: [...sDDCPN.hand, ...sDDCPN.deck.slice(0, canDraw)], deck: sDDCPN.deck.slice(canDraw) };
    return done(addLog({ ...ctx, ownerState: newSDDCPN }, `捨て${discardCount}枚+${plusN}→${canDraw}枚ドロー`));
  }
  // LOOK_TOP_N / LOOK_TOP_SORT / LOOK_TOP_COLOR_SORT / LOOK_TOP_BY_LIFE_COUNT: デッキ上N枚を確認して並べ替え
  if (stub.id === 'LOOK_TOP_N' || stub.id === 'LOOK_TOP_SORT' || stub.id === 'LOOK_TOP_COLOR_SORT' || stub.id === 'LOOK_TOP_BY_LIFE_COUNT') {
    const srcLTN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTN = srcLTN ? (srcLTN.EffectText ?? '') + ' ' + (srcLTN.BurstText ?? '') : '';
    const toHWLTN = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    let countLTN = 3;
    if (stub.id === 'LOOK_TOP_BY_LIFE_COUNT') {
      countLTN = ctx.ownerState.life_cloth.length;
    } else {
      const mLTN = txtLTN.match(/デッキ(?:の上)?(?:から)?([０-９\d]+)枚/);
      if (mLTN) countLTN = parseInt(toHWLTN(mLTN[1]));
    }
    const visLTN = ctx.ownerState.deck.slice(0, Math.min(countLTN, ctx.ownerState.deck.length));
    if (visLTN.length === 0) return done(addLog(ctx, 'デッキなし'));
    const newSLTN: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(visLTN.length) };
    return needsInteraction(
      addLog({ ...ctx, ownerState: newSLTN }, `デッキ上${visLTN.length}枚を確認`),
      { type: 'LOOK_AND_REORDER', cards: visLTN, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'top' },
    );
  }
  // LOOK_TOP_ONE_RETURN_REST_BOTTOM: デッキ上N枚を確認し1枚をトップ・残りをデッキ下に
  if (stub.id === 'LOOK_TOP_ONE_RETURN_REST_BOTTOM') {
    const srcLTORB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTORB = srcLTORB ? (srcLTORB.EffectText ?? '') + ' ' + (srcLTORB.BurstText ?? '') : '';
    const toHWLTORB = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mLTORB = txtLTORB.match(/デッキ(?:の上)?(?:から)?([０-９\d]+)枚/);
    const countLTORB = mLTORB ? parseInt(toHWLTORB(mLTORB[1])) : 2;
    const visLTORB = ctx.ownerState.deck.slice(0, Math.min(countLTORB, ctx.ownerState.deck.length));
    if (visLTORB.length === 0) return done(addLog(ctx, 'デッキなし'));
    const newSLTORB: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(visLTORB.length) };
    return needsInteraction(
      addLog({ ...ctx, ownerState: newSLTORB }, `デッキ上${visLTORB.length}枚を確認（1枚をトップへ・残りはデッキ下へ）`),
      { type: 'LOOK_AND_REORDER', cards: visLTORB, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'first_top_rest_bottom' },
    );
  }
  // LOOK_TOP_SPELLS_TO_HAND: デッキ上N枚を確認してスペルを手札へ・残りをデッキへ
  if (stub.id === 'LOOK_TOP_SPELLS_TO_HAND') {
    const srcLTSH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTSH = srcLTSH ? (srcLTSH.EffectText ?? '') + ' ' + (srcLTSH.BurstText ?? '') : '';
    const toHWLTSH = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mLTSH = txtLTSH.match(/デッキ(?:の上)?(?:から)?([０-９\d]+)枚/);
    const countLTSH = mLTSH ? parseInt(toHWLTSH(mLTSH[1])) : 3;
    const sLTSH = ctx.ownerState;
    const revealedLTSH = sLTSH.deck.slice(0, Math.min(countLTSH, sLTSH.deck.length));
    const spellsLTSH = revealedLTSH.filter(cn => ctx.cardMap.get(cn)?.Type === 'スペル');
    const restLTSH = revealedLTSH.filter(cn => ctx.cardMap.get(cn)?.Type !== 'スペル');
    const newSLTSH: PlayerState = {
      ...sLTSH,
      deck: [...restLTSH, ...sLTSH.deck.slice(revealedLTSH.length)],
      hand: [...sLTSH.hand, ...spellsLTSH],
    };
    return done(addLog({ ...ctx, ownerState: newSLTSH },
      `デッキ上${revealedLTSH.length}枚確認、スペル${spellsLTSH.length}枚を手札に`));
  }
  // LIFE_TO_HAND_OPTIONAL: ライフクロス1枚を手札に加える
  if (stub.id === 'LIFE_TO_HAND_OPTIONAL') {
    const sLTH = ctx.ownerState;
    if (sLTH.life_cloth.length === 0) return done(addLog(ctx, 'ライフクロスなし'));
    const doLTH: StubAction = { type: 'STUB', id: 'INTERNAL_LIFE_TO_HAND_DO' };
    const skipLTH: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, 'ライフクロス1枚を手札に加えてもよい'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'do',   label: 'ライフクロスを手札に加える', action: doLTH   as EffectAction, available: true },
        { id: 'skip', label: 'そうしない',                 action: skipLTH as EffectAction, available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_LIFE_TO_HAND_DO') {
    const sLTH = ctx.ownerState;
    if (sLTH.life_cloth.length === 0) return done(addLog(ctx, 'ライフクロスなし'));
    const topLife = sLTH.life_cloth[0];
    const newSLTH: PlayerState = { ...sLTH, life_cloth: sLTH.life_cloth.slice(1), hand: [...sLTH.hand, topLife] };
    return done(addLog({ ...ctx, ownerState: newSLTH }, 'ライフクロス1枚を手札に加えた'));
  }
  // HAND_NONCOLORLESS_TO_ENERGY: 手札の無色以外カードをエナゾーンへ
  if (stub.id === 'HAND_NONCOLORLESS_TO_ENERGY') {
    const sHNCE = ctx.ownerState;
    const nonColorlessHNCE = sHNCE.hand.filter(cn => { const c = ctx.cardMap.get(cn)?.Color ?? ''; return c !== '' && c !== '無色'; });
    const remainHNCE = sHNCE.hand.filter(cn => { const c = ctx.cardMap.get(cn)?.Color ?? ''; return c === '' || c === '無色'; });
    const newSHNCE: PlayerState = { ...sHNCE, hand: remainHNCE, energy: [...sHNCE.energy, ...nonColorlessHNCE] };
    return done(addLog({ ...ctx, ownerState: newSHNCE }, `手札の無色以外${nonColorlessHNCE.length}枚をエナゾーンへ`));
  }
  // OPP_TRASH_TO_DECK_TOP は line 1211 の handler で処理済み（dead code 削除）
  // REMOVE_OPP_MULTI_ENA / REMOVE_OPP_MULTI_ENA_ONLY: 相手の複数色エナをトラッシュへ
  if (stub.id === 'REMOVE_OPP_MULTI_ENA' || stub.id === 'REMOVE_OPP_MULTI_ENA_ONLY') {
    const sROME = ctx.otherState;
    const multiColorROME = sROME.energy.filter(cn => (ctx.cardMap.get(cn)?.Color ?? '').includes('/'));
    if (multiColorROME.length === 0) return done(addLog(ctx, '相手の複数色エナなし'));
    const newSROME: PlayerState = {
      ...sROME,
      energy: sROME.energy.filter(cn => !(ctx.cardMap.get(cn)?.Color ?? '').includes('/')),
      trash: [...sROME.trash, ...multiColorROME],
    };
    return done(addLog({ ...ctx, otherState: newSROME }, `相手の複数色エナ${multiColorROME.length}枚をトラッシュへ`));
  }
  // BOTH_DISCARD_BY_CENTER_LEVEL: 両者センタールリグのレベル分捨て
  if (stub.id === 'BOTH_DISCARD_BY_CENTER_LEVEL') {
    const toHWBDCL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const getLevel = (state: PlayerState) => {
      const cn = state.field.lrig.at(-1);
      return cn ? parseInt(toHWBDCL(ctx.cardMap.get(cn)?.Level ?? '0')) || 0 : 0;
    };
    // 「場にある最も高いレベルを持つセンタールリグのレベル」= 両者のルリグレベルの最大値
    const centerLevelBDCL = Math.max(getLevel(ctx.ownerState), getLevel(ctx.otherState));
    const selfDiscardBDCL = Math.min(centerLevelBDCL, ctx.ownerState.hand.length);
    const otherDiscardBDCL = Math.min(centerLevelBDCL, ctx.otherState.hand.length);
    const newCtxBDCL: ExecCtx = {
      ...ctx,
      ownerState: { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(selfDiscardBDCL), trash: [...ctx.ownerState.trash, ...ctx.ownerState.hand.slice(0, selfDiscardBDCL)] },
      otherState: { ...ctx.otherState, hand: ctx.otherState.hand.slice(otherDiscardBDCL), trash: [...ctx.otherState.trash, ...ctx.otherState.hand.slice(0, otherDiscardBDCL)] },
    };
    return done(addLog(newCtxBDCL, `両者センターレベル${centerLevelBDCL}枚ずつ捨て`));
  }
  // TRASH_SIGNI_UNDER_FIELD_SIGNI: 自分フィールドシグニ下のカードをトラッシュへ
  if (stub.id === 'TRASH_SIGNI_UNDER_FIELD_SIGNI') {
    let sTSUFS = ctx.ownerState;
    const underCardsTSUFS = sTSUFS.field.signi.flatMap(stack => stack && stack.length > 1 ? stack.slice(0, -1) : []);
    const newSigniTSUFS = sTSUFS.field.signi.map(stack => !stack || stack.length <= 1 ? stack : [stack.at(-1)!]) as (string[] | null)[];
    sTSUFS = { ...sTSUFS, field: { ...sTSUFS.field, signi: newSigniTSUFS }, trash: [...sTSUFS.trash, ...underCardsTSUFS] };
    return done(addLog({ ...ctx, ownerState: sTSUFS }, `シグニ下${underCardsTSUFS.length}枚をトラッシュへ`));
  }
  // UNDER_SIGNI_TO_ENERGY: シグニ下カードをエナゾーンへ
  // UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: ソースシグニの下のカードを対象とし、エナに同クラスがなければエナへ
  if (stub.id === 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS') {
    const srcUSTENC = ctx.sourceCardNum;
    if (!srcUSTENC) return done(addLog(ctx, 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: ソースなし'));
    const srcZoneUSTENC = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcUSTENC);
    if (srcZoneUSTENC < 0) return done(addLog(ctx, 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: ゾーン不明'));
    const stackUSTENC = ctx.ownerState.field.signi[srcZoneUSTENC] ?? [];
    const underUSTENC = stackUSTENC.slice(0, -1);
    if (underUSTENC.length === 0) return done(addLog(ctx, 'シグニの下にカードなし（UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS）'));
    // 各underカードについて、エナゾーンに同クラスを持つシグニがない場合エナへ
    const targetCnUSTENC = underUSTENC.find(cn => {
      const cnClass = ctx.cardMap.get(cn)?.CardClass ?? '';
      if (!cnClass) return false;
      const cnClasses = cnClass.split('/').map(s => s.trim()).filter(Boolean);
      return !ctx.ownerState.energy.some(enaCn => {
        const enaClass = ctx.cardMap.get(enaCn)?.CardClass ?? '';
        return cnClasses.some(cls => enaClass.includes(cls));
      });
    });
    if (!targetCnUSTENC) return done(addLog(ctx, 'エナゾーンに同クラスあり（UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS）'));
    const newStackUSTENC = stackUSTENC.filter(c => c !== targetCnUSTENC);
    const newSigniUSTENC = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniUSTENC[srcZoneUSTENC] = newStackUSTENC.length > 0 ? newStackUSTENC : null;
    const newOwnerUSTENC = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, signi: newSigniUSTENC },
      energy: [...ctx.ownerState.energy, targetCnUSTENC],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerUSTENC },
      `${ctx.cardMap.get(targetCnUSTENC)?.CardName ?? targetCnUSTENC}→エナゾーン（同クラスなし）`));
  }
  // ADD_CARD_TO_LRIG_DECK / ADD_CARD_TO_LRIG_DECK_HIDDEN: lastProcessedCards をルリグデッキに加える
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
      return done(addLog({ ...ctx, ownerState: sACLD }, `${cardsACLD.length}枚をルリグデッキに加えた`));
    }
    // lastProcessedCards なし：テキストから《カード名》を解析して候補を収集
    const srcACLD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtACLD = srcACLD ? (srcACLD.EffectText ?? '') + ' ' + (srcACLD.BurstText ?? '') : '';
    const nameMatchesACLD = [...txtACLD.matchAll(/《([^》]+)》/g)].map(m => m[1]);
    if (nameMatchesACLD.length === 0) return done(addLog(ctx, '[ADD_CARD_TO_LRIG_DECK: カード名解析不可]'));
    // 各カード名に対応するインスタンスを lrig_deck → deck → hand → lrig_trash の順で探す
    const findInstance = (s: PlayerState, name: string): string | undefined => {
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
    // HIDDEN かつ 2候補ある場合：CHOOSE を提示
    if (stub.id === 'ADD_CARD_TO_LRIG_DECK_HIDDEN' && nameMatchesACLD.length >= 2) {
      const instA = findInstance(ctx.ownerState, nameMatchesACLD[0]);
      const instB = findInstance(ctx.ownerState, nameMatchesACLD[1]);
      const opts = [
        ...(instA ? [{ id: 'acldh_a', label: nameMatchesACLD[0], action: ({ type: 'STUB', id: 'INTERNAL_ACLDH_APPLY', value: instA } as StubAction) as EffectAction, available: true }] : []),
        ...(instB ? [{ id: 'acldh_b', label: nameMatchesACLD[1], action: ({ type: 'STUB', id: 'INTERNAL_ACLDH_APPLY', value: instB } as StubAction) as EffectAction, available: true }] : []),
      ];
      if (opts.length === 0) return done(addLog(ctx, `[ADD_CARD_TO_LRIG_DECK_HIDDEN: 対象なし]`));
      if (opts.length === 1) {
        const inst = (opts[0].action as StubAction).value as string;
        return done(addLog({ ...ctx, ownerState: moveToLrigDeck(ctx.ownerState, inst) }, `裏向きルリグデッキへ: ${opts[0].label}`));
      }
      return needsInteraction(addLog(ctx, `どちらを裏向きでルリグデッキに加えますか？`), {
        type: 'CHOOSE', count: 1, options: opts,
      });
    }
    // ADD_CARD_TO_LRIG_DECK（非HIDDEN）または1候補：全て追加
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
      `ルリグデッキに${addedACLD}枚加えた（${nameMatchesACLD.join('・')}）`));
  }
  // INTERNAL_ACLDH_APPLY: ADD_CARD_TO_LRIG_DECK_HIDDEN の選択後処理
  if (stub.id === 'INTERNAL_ACLDH_APPLY') {
    const inst = typeof stub.value === 'string' ? stub.value : '';
    if (!inst) return done(addLog(ctx, '[INTERNAL_ACLDH_APPLY: インスタンスなし]'));
    const moveToLD = (s: PlayerState, id: string): PlayerState => ({
      ...s,
      deck: s.deck.filter(c => c !== id),
      hand: s.hand.filter(c => c !== id),
      trash: s.trash.filter(c => c !== id),
      lrig_trash: s.lrig_trash.filter(c => c !== id),
      lrig_deck: s.lrig_deck.includes(id) ? s.lrig_deck : [...s.lrig_deck, id],
    });
    const name = ctx.cardMap.get(getCardNum(inst))?.CardName ?? inst;
    return done(addLog({ ...ctx, ownerState: moveToLD(ctx.ownerState, inst) }, `裏向きルリグデッキへ: ${name}`));
  }
  // PREVENT_LOW_LEVEL_LRIG_DAMAGE / PREVENT_DAMAGE_FROM_OPP_EFFECTS / PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP: ルリグダメージ無効フラグ
  if (stub.id === 'PREVENT_LOW_LEVEL_LRIG_DAMAGE' || stub.id === 'PREVENT_DAMAGE_FROM_OPP_EFFECTS' || stub.id === 'PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP') {
    const newSPLLD: PlayerState = { ...ctx.ownerState, prevent_lrig_damage: true };
    return done(addLog({ ...ctx, ownerState: newSPLLD }, 'ルリグダメージ無効'));
  }
  // PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN: 相手の次ターン最初のダメージを無効
  if (stub.id === 'PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN') {
    const newSPFDNOT: PlayerState = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newSPFDNOT }, '次の相手ターン最初のダメージを無効'));
  }
  // === バッチ5: アクセ・デッキ・パワー補足 ===
  // ACCE_TO_ENERGY / PLACE_ACCE_SIGNI_TO_ENERGY: アクセカードをエナゾーンへ
  if (stub.id === 'ACCE_TO_ENERGY' || stub.id === 'PLACE_ACCE_SIGNI_TO_ENERGY') {
    const sATE = ctx.ownerState;
    const acceCardsATE = (sATE.field.signi_acce ?? []).filter((c): c is string => c !== null);
    if (acceCardsATE.length === 0) return done(addLog(ctx, 'アクセなし'));
    const newSATE: PlayerState = {
      ...sATE,
      field: { ...sATE.field, signi_acce: [null, null, null] },
      energy: [...sATE.energy, ...acceCardsATE],
    };
    return done(addLog({ ...ctx, ownerState: newSATE }, `アクセ${acceCardsATE.length}枚をエナゾーンへ`));
  }
  // ACCE_BANISH_SELF_TRASH: アクセを自分のトラッシュへ
  if (stub.id === 'ACCE_BANISH_SELF_TRASH') {
    const sABST = ctx.ownerState;
    const acceCardsABST = (sABST.field.signi_acce ?? []).filter((c): c is string => c !== null);
    if (acceCardsABST.length === 0) return done(addLog(ctx, 'アクセなし'));
    const newSABST: PlayerState = {
      ...sABST,
      field: { ...sABST.field, signi_acce: [null, null, null] },
      trash: [...sABST.trash, ...acceCardsABST],
    };
    return done(addLog({ ...ctx, ownerState: newSABST }, `アクセ${acceCardsABST.length}枚をトラッシュへ`));
  }
  // FROM_TRASH_TO_CENTER_ZONE: トラッシュからカードを中央シグニゾーン（zone[1]）に出す
  if (stub.id === 'FROM_TRASH_TO_CENTER_ZONE') {
    const cnFTCZ = ctx.sourceCardNum
      ? ctx.ownerState.trash.find(cn => cn === ctx.sourceCardNum)
      : (ctx.lastProcessedCards?.[0] ?? ctx.ownerState.trash.at(-1));
    if (!cnFTCZ) return done(addLog(ctx, 'トラッシュにカードなし（FROM_TRASH_TO_CENTER_ZONE）'));
    const sFTCZ = ctx.ownerState;
    const newTrashFTCZ = sFTCZ.trash.filter(c => c !== cnFTCZ);
    const newSigniFTCZ = [...sFTCZ.field.signi] as (string[] | null)[];
    // 中央ゾーン(index=1)に配置。既存シグニはバニッシュしてエナへ
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
      `${ctx.cardMap.get(cnFTCZ)?.CardName ?? cnFTCZ}をトラッシュから中央ゾーン（zone2）に出す`));
  }
  // VIEW_AND_DISCARD_SPELL: 手札からスペルを選んでトラッシュへ
  if (stub.id === 'INTERNAL_TRASH_CARD') {
    const cnITC = ctx.lastProcessedCards?.[0];
    if (!cnITC) return done(ctx);
    const sITC = ctx.ownerState;
    const newSITC: PlayerState = { ...sITC, hand: sITC.hand.filter(c => c !== cnITC), trash: [...sITC.trash, cnITC] };
    return done(addLog({ ...ctx, ownerState: newSITC }, `${ctx.cardMap.get(cnITC)?.CardName ?? cnITC}をトラッシュへ`));
  }
  // POWER_BY_ACCE_COUNT: アクセ数×deltaをパワー修正
  if (stub.id === 'POWER_BY_ACCE_COUNT') {
    const srcPBAC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBAC = srcPBAC ? (srcPBAC.EffectText ?? '') + ' ' + (srcPBAC.BurstText ?? '') : '';
    const toHWPBAC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPBAC = txtPBAC.match(/([＋+－-][０-９\d]+)/);
    if (!mPBAC) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_BY_ACCE_COUNT）'));
    const singleDeltaPBAC = parseInt(toHWPBAC(mPBAC[1]).replace('＋', '+').replace('－', '-'));
    const acceCountPBAC = (ctx.ownerState.field.signi_acce ?? []).filter(c => c !== null).length;
    const totalDeltaPBAC = singleDeltaPBAC * acceCountPBAC;
    if (totalDeltaPBAC === 0) return done(addLog(ctx, 'アクセなし（POWER_BY_ACCE_COUNT）'));
    const modsPBAC = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (top) modsPBAC.push({ cardNum: top, delta: totalDeltaPBAC });
    }
    const newSOPBAC: PlayerState = { ...ctx.otherState, temp_power_mods: modsPBAC };
    return done(addLog({ ...ctx, otherState: newSOPBAC },
      `アクセ${acceCountPBAC}枚×${singleDeltaPBAC}→相手シグニパワー${totalDeltaPBAC}`));
  }
  // POWER_BY_CENTER_LRIG_TYPE_COUNT: センタールリグのタイプ数×deltaをパワー修正
  if (stub.id === 'POWER_BY_CENTER_LRIG_TYPE_COUNT') {
    const srcPCLTC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPCLTC = srcPCLTC ? (srcPCLTC.EffectText ?? '') + ' ' + (srcPCLTC.BurstText ?? '') : '';
    const toHWPCLTC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPCLTC = txtPCLTC.match(/([＋+－-][０-９\d]+)/);
    if (!mPCLTC) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_BY_CENTER_LRIG_TYPE_COUNT）'));
    const singleDeltaPCLTC = parseInt(toHWPCLTC(mPCLTC[1]).replace('＋', '+').replace('－', '-'));
    const centerNumPCLTC = ctx.ownerState.field.lrig.at(-1);
    const centerCardPCLTC = centerNumPCLTC ? ctx.cardMap.get(centerNumPCLTC) : undefined;
    const typesCountPCLTC = centerCardPCLTC ? (centerCardPCLTC.Team ?? '').split('/').filter(Boolean).length : 0;
    const totalDeltaPCLTC = singleDeltaPCLTC * typesCountPCLTC;
    if (totalDeltaPCLTC === 0) return done(addLog(ctx, 'タイプなし（POWER_BY_CENTER_LRIG_TYPE_COUNT）'));
    // 自分のシグニに適用
    if (ctx.sourceCardNum) {
      const modsPCLTC = [...(ctx.ownerState.temp_power_mods ?? [])];
      modsPCLTC.push({ cardNum: ctx.sourceCardNum, delta: totalDeltaPCLTC });
      const newSOPCLTC: PlayerState = { ...ctx.ownerState, temp_power_mods: modsPCLTC };
      return done(addLog({ ...ctx, ownerState: newSOPCLTC },
        `センタールリグタイプ${typesCountPCLTC}種×${singleDeltaPCLTC}→パワー${totalDeltaPCLTC}`));
    }
    return done(addLog(ctx, `センタールリグタイプ${typesCountPCLTC}種×${singleDeltaPCLTC}（対象なし）`));
  }
  // DRAW_AND_PUT_HAND_TO_DECK_BOTTOM: ドローして手札1枚をデッキ下に
  if (stub.id === 'DRAW_AND_PUT_HAND_TO_DECK_BOTTOM') {
    const srcDAPHTDB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDAPHTDB = srcDAPHTDB ? (srcDAPHTDB.EffectText ?? '') + ' ' + (srcDAPHTDB.BurstText ?? '') : '';
    const toHWDAPHTDB = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mDAPHTDB = txtDAPHTDB.match(/([０-９\d]+)枚引き/);
    const drawCntDAPHTDB = mDAPHTDB ? parseInt(toHWDAPHTDB(mDAPHTDB[1])) : 1;
    let sDAPHTDB = ctx.ownerState;
    const canDrawDAPHTDB = Math.min(drawCntDAPHTDB, sDAPHTDB.deck.length);
    sDAPHTDB = { ...sDAPHTDB, hand: [...sDAPHTDB.hand, ...sDAPHTDB.deck.slice(0, canDrawDAPHTDB)], deck: sDAPHTDB.deck.slice(canDrawDAPHTDB) };
    // 手札からデッキ下に置くカードを選択
    if (sDAPHTDB.hand.length > 0) {
      const putCard = sDAPHTDB.hand[0]; // 先頭を自動選択
      sDAPHTDB = { ...sDAPHTDB, hand: sDAPHTDB.hand.slice(1), deck: [...sDAPHTDB.deck, putCard] };
    }
    return done(addLog({ ...ctx, ownerState: sDAPHTDB }, `${canDrawDAPHTDB}枚ドロー、手札1枚をデッキ下へ`));
  }
  // LRIG_LIMIT_MODIFY (STUB版): ルリグリミット修正
  if (stub.id === 'LRIG_LIMIT_MODIFY') {
    const srcLLM = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLLM = srcLLM ? (srcLLM.EffectText ?? '') + ' ' + (srcLLM.BurstText ?? '') : '';
    const toHWLLM = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mLLM = txtLLM.match(/リミットを?([＋+－-]?[０-９\d]+)/);
    if (!mLLM) return done(addLog(ctx, 'ルリグリミット修正値解析失敗'));
    const deltaLLM = parseInt(toHWLLM(mLLM[1]).replace('＋', '+').replace('－', '-'));
    const newSLLM: PlayerState = { ...ctx.ownerState, lrig_limit_mod: (ctx.ownerState.lrig_limit_mod ?? 0) + deltaLLM };
    return done(addLog({ ...ctx, ownerState: newSLLM }, `ルリグリミット${deltaLLM > 0 ? '+' : ''}${deltaLLM}`));
  }
  // LRIG_TRASH_KEY_TO_CENTER_UNDER: ルリグトラッシュのキーをセンタールリグの下に
  if (stub.id === 'LRIG_TRASH_KEY_TO_CENTER_UNDER') {
    const sLTKCU = ctx.ownerState;
    const keyCardLTKCU = sLTKCU.lrig_trash.find(cn => ctx.cardMap.get(cn)?.Type === 'キー');
    if (!keyCardLTKCU) return done(addLog(ctx, 'ルリグトラッシュにキーなし'));
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
      `${ctx.cardMap.get(keyCardLTKCU)?.CardName ?? keyCardLTKCU}をセンタールリグの下に`));
  }
  // === バッチ6: パワー補足・ウィルス・条件移動 ===
  // POWER_CAP: シグニのパワーをN以下に制限
  if (stub.id === 'POWER_CAP') {
    const srcPC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPC = srcPC ? (srcPC.EffectText ?? '') + ' ' + (srcPC.BurstText ?? '') : '';
    const toHWPC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPC = txtPC.match(/パワーが?([０-９\d,，]+)以下/);
    if (!mPC || !ctx.sourceCardNum) return done(addLog(ctx, 'パワー上限解析失敗'));
    const capPC = parseInt(toHWPC(mPC[1]).replace(/[,，]/g, ''));
    const currentPowerPC = ctx.effectivePowers?.get(ctx.sourceCardNum) ?? 0;
    if (currentPowerPC <= capPC) return done(addLog(ctx, `パワー上限${capPC}以下のため修正なし`));
    const deltaPC = capPC - currentPowerPC;
    const modsPC = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPC }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPC } },
      `パワー上限${capPC}に制限（${deltaPC}）`));
  }
  // POWER_COPY_FROM_DOWNED: ダウンしたシグニのパワーを自シグニに加算
  if (stub.id === 'POWER_COPY_FROM_DOWNED') {
    if (!ctx.sourceCardNum) return done(ctx);
    let targetPowerPCFD = 0;
    // 優先: lastProcessedCards[0] (起動コストでダウンした自シグニ)
    const costDownedPCFD = ctx.lastProcessedCards?.[0];
    if (costDownedPCFD) {
      targetPowerPCFD = ctx.effectivePowers?.get(costDownedPCFD) ?? (parseInt(ctx.cardMap.get(getCardNum(costDownedPCFD))?.Power ?? '0') || 0);
    }
    // フォールバック: 自フィールドのダウンシグニ
    if (!targetPowerPCFD) {
      for (let zi = 0; zi < 3; zi++) {
        if (ctx.ownerState.field.signi_down?.[zi]) {
          const dn = ctx.ownerState.field.signi[zi]?.at(-1);
          if (dn && dn !== ctx.sourceCardNum) { targetPowerPCFD = ctx.effectivePowers?.get(dn) ?? (parseInt(ctx.cardMap.get(getCardNum(dn))?.Power ?? '0') || 0); break; }
        }
      }
    }
    if (!targetPowerPCFD) return done(addLog(ctx, 'ダウンシグニなし（POWER_COPY_FROM_DOWNED）'));
    const modsPCFD = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: targetPowerPCFD }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPCFD } },
      `ダウンシグニパワー+${targetPowerPCFD}`));
  }
  // CHARM_CONDITIONAL_POWER: チャームがある場合パワー修正
  if (stub.id === 'CHARM_CONDITIONAL_POWER') {
    if (!ctx.sourceCardNum) return done(ctx);
    const srcCCP = ctx.cardMap.get(ctx.sourceCardNum);
    const txtCCP = srcCCP ? (srcCCP.EffectText ?? '') + ' ' + (srcCCP.BurstText ?? '') : '';
    const toHWCCP = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mCCP = txtCCP.match(/([＋+－-][０-９\d]+)/);
    if (!mCCP) return done(addLog(ctx, 'パワー値解析失敗（CHARM_CONDITIONAL_POWER）'));
    const deltaCCP = parseInt(toHWCCP(mCCP[1]).replace('＋', '+').replace('－', '-'));
    let selfZoneCCP = -1;
    for (let zi = 0; zi < 3; zi++) {
      if (ctx.ownerState.field.signi[zi]?.at(-1) === ctx.sourceCardNum) { selfZoneCCP = zi; break; }
    }
    const hasCharmCCP = selfZoneCCP >= 0 && (ctx.ownerState.field.signi_charms?.[selfZoneCCP] ?? null) !== null;
    if (!hasCharmCCP) return done(addLog(ctx, 'チャームなし（CHARM_CONDITIONAL_POWER）'));
    const modsCCP = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaCCP }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsCCP } },
      `チャームあり→パワー${deltaCCP > 0 ? '+' : ''}${deltaCCP}`));
  }
  // POWER_BOOST_PER_SIGNI_WITH_ICON: キーワード持ちシグニ1体につきパワー修正
  if (stub.id === 'POWER_BOOST_PER_SIGNI_WITH_ICON') {
    const srcPBPSWI = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBPSWI = srcPBPSWI ? (srcPBPSWI.EffectText ?? '') + ' ' + (srcPBPSWI.BurstText ?? '') : '';
    const toHWPBPSWI = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mDeltaPBPSWI = txtPBPSWI.match(/([＋+－-][０-９\d]+)/);
    if (!mDeltaPBPSWI) return done(addLog(ctx, 'パワー値解析失敗（POWER_BOOST_PER_SIGNI_WITH_ICON）'));
    const singleDeltaPBPSWI = parseInt(toHWPBPSWI(mDeltaPBPSWI[1]).replace('＋', '+').replace('－', '-'));
    // キーワード能力持ちシグニをカウント（keyword_grants または effectText に【〇】パターン）
    let countPBPSWI = 0;
    const kwGrants = ctx.ownerState.keyword_grants ?? {};
    for (let zi = 0; zi < 3; zi++) {
      const cn = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!cn) continue;
      if (kwGrants[cn]?.length) countPBPSWI++;
      else if ((ctx.cardMap.get(cn)?.EffectText ?? '').includes('【')) countPBPSWI++;
    }
    const totalDeltaPBPSWI = singleDeltaPBPSWI * countPBPSWI;
    if (totalDeltaPBPSWI === 0) return done(addLog(ctx, 'キーワード持ちシグニなし'));
    const modsPBPSWI = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (top) modsPBPSWI.push({ cardNum: top, delta: totalDeltaPBPSWI });
    }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBPSWI } },
      `キーワード持ちシグニ${countPBPSWI}体×${singleDeltaPBPSWI}→相手パワー${totalDeltaPBPSWI}`));
  }
  // POWER_MOD_MIRROR: 捨てたシグニのパワーを±として対象に適用
  // ・WXEX1-23文脈（lastProcessedCardsに相手シグニ）: -(捨てたパワー)を相手シグニへ
  // ・WXK06-049文脈（自場シグニが発動源）: +(捨てたパワー)を自シグニへ
  if (stub.id === 'POWER_MOD_MIRROR') {
    const lastDiscardedPMM = ctx.ownerState.trash.at(-1);
    const discardedPwPMM = lastDiscardedPMM ? (parseInt(ctx.cardMap.get(lastDiscardedPMM)?.Power ?? '0') || 0) : 0;
    const oppTargetPMM = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (oppTargetPMM && discardedPwPMM > 0) {
      const modsPMM = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: oppTargetPMM, delta: -discardedPwPMM }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMM } },
        `${ctx.cardMap.get(oppTargetPMM)?.CardName ?? oppTargetPMM}のパワー-${discardedPwPMM}（捨てたシグニのパワー）`));
    }
    if (ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum) && discardedPwPMM > 0) {
      const modsSelfPMM = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: discardedPwPMM }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsSelfPMM } },
        `${ctx.cardMap.get(ctx.sourceCardNum)?.CardName ?? ctx.sourceCardNum}のパワー+${discardedPwPMM}（捨てたシグニのパワー）`));
    }
    return done(addLog(ctx, `パワーミラー（対象なし / 捨てパワー${discardedPwPMM}）`));
  }
  // PLACE_VIRUS_CENTER: 相手の全シグニゾーンにウィルスを設置
  if (stub.id === 'PLACE_VIRUS_CENTER') {
    const sOtherPVC = ctx.otherState;
    const virusPVC = [...(sOtherPVC.field.signi_virus ?? [0, 0, 0])];
    for (let i = 0; i < 3; i++) { if (virusPVC[i] === 0 && sOtherPVC.field.signi[i]?.at(-1)) virusPVC[i] = 1; }
    const newSOtherPVC: PlayerState = { ...sOtherPVC, field: { ...sOtherPVC.field, signi_virus: virusPVC } };
    return done(addLog({ ...ctx, otherState: newSOtherPVC }, '相手全シグニゾーンにウィルス設置'));
  }
  // SELF_TRASH_IF_NO_OPP_VIRUS: 相手にウィルスがなければ自トラッシュ
  if (stub.id === 'SELF_TRASH_IF_NO_OPP_VIRUS') {
    const hasVirusSTINOV = (ctx.otherState.field.signi_virus ?? []).some(v => (v ?? 0) > 0);
    if (hasVirusSTINOV) return done(addLog(ctx, '相手ウィルスあり（トラッシュなし）'));
    if (!ctx.sourceCardNum) return done(ctx);
    if (!ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum))
      return done(addLog(ctx, 'フィールドにいない（SELF_TRASH_IF_NO_OPP_VIRUS）'));
    const removedSTINOV = removeFromField(ctx.sourceCardNum, ctx.ownerState);
    const newSSTINOV: PlayerState = { ...removedSTINOV, trash: [...removedSTINOV.trash, ctx.sourceCardNum] };
    return done(addLog({ ...ctx, ownerState: newSSTINOV }, '相手ウィルスなし→自トラッシュ'));
  }
  // NO_ABILITY_SIGNI_TO_DECK_BOTTOM: 能力なしシグニをデッキ下に
  if (stub.id === 'NO_ABILITY_SIGNI_TO_DECK_BOTTOM') {
    if (!ctx.sourceCardNum) return done(ctx);
    const srcDataNASDB = ctx.cardMap.get(ctx.sourceCardNum);
    const hasAbility = !!(srcDataNASDB?.EffectText ?? srcDataNASDB?.BurstText);
    if (hasAbility) return done(addLog(ctx, '能力ありのためデッキ下移動なし'));
    const removedNASDB = removeFromField(ctx.sourceCardNum, ctx.ownerState);
    const newSNASDB: PlayerState = { ...removedNASDB, deck: [...removedNASDB.deck, ctx.sourceCardNum] };
    return done(addLog({ ...ctx, ownerState: newSNASDB }, '能力なし→デッキ下'));
  }
  // FROZEN_SIGNI_TO_TRASH_ON_LEAVE: 凍結状態のシグニが退場するとトラッシュへ
  if (stub.id === 'FROZEN_SIGNI_TO_TRASH_ON_LEAVE') {
    // 凍結シグニをフィールドからトラッシュへ移動
    let sFSTTOL = ctx.ownerState;
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
    return done(addLog({ ...ctx, ownerState: sFSTTOL }, `凍結シグニ${frozenSigni.length}枚をトラッシュへ`));
  }
  // FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM: 凍結シグニのバニッシュをデッキ下へ
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
    return done(addLog({ ...ctx, ownerState: sFSBTDB }, `凍結シグニ${frozenSigniFSBTDB.length}枚をデッキ下へ`));
  }
  // ALL_OPP_SIGNI_SERVANT_ZERO / MAKE_SERVANT_ZERO / MAKE_MULTI_SERVANT_ZERO / SIGNI_SERVANT_ZERO:
  // 対象シグニをサーバントZERO（WXDi-P07-TK01-A: Lv1 精元 無色 1000 能力なし）に変換
  if (stub.id === 'ALL_OPP_SIGNI_SERVANT_ZERO' || stub.id === 'MAKE_SERVANT_ZERO' || stub.id === 'MAKE_MULTI_SERVANT_ZERO' || stub.id === 'SIGNI_SERVANT_ZERO') {
    const SERVANT_ZERO_NUM = 'WXDi-P07-TK01-A';
    // MAKE_SERVANT_ZERO / SIGNI_SERVANT_ZERO: 相手シグニ1体を選択
    if ((stub.id === 'MAKE_SERVANT_ZERO' || stub.id === 'SIGNI_SERVANT_ZERO') && !ctx.lastProcessedCards?.length) {
      const oppSigniMSZ = [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
      if (oppSigniMSZ.length === 0) return done(addLog(ctx, '相手フィールドにシグニなし（SERVANT_ZERO）'));
      const applyMSZ: StubAction = { type: 'STUB', id: stub.id };
      return selectOrInteract(oppSigniMSZ, 1, false, 'opp_field', applyMSZ as EffectAction, undefined, ctx);
    }
    const targets = ctx.lastProcessedCards?.length ? ctx.lastProcessedCards :
      [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
    if (targets.length === 0) return done(addLog(ctx, '対象なし（SERVANT_ZERO）'));
    // card_identity_overrides: instanceId → 'WXDi-P07-TK01-A' に設定
    // battleCardMapがこれを解決し、power=1000/class=精元/color=無/abilities=なし が適用される
    const identOverSZ = { ...(ctx.otherState.card_identity_overrides ?? {}) };
    for (const cn of targets) identOverSZ[cn] = SERVANT_ZERO_NUM;
    const newSOtherSZ: PlayerState = { ...ctx.otherState, card_identity_overrides: identOverSZ };
    return done(addLog({ ...ctx, otherState: newSOtherSZ }, `${targets.length}体をサーバントZERO（WXDi-P07-TK01-A）に`));
  }
  // === バッチ7: バニッシュ・トラッシュ・条件効果 ===
  // BANISH (STUB版): lastProcessedCards[0] か sourceCardNum をバニッシュ
  if (stub.id === 'BANISH') {
    const cnBAN = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnBAN) return done(addLog(ctx, 'バニッシュ対象なし'));
    const foundOppBAN = ctx.otherState.field.signi.some(s => s?.at(-1) === cnBAN);
    if (foundOppBAN) {
      const removedBAN = removeFromField(cnBAN, ctx.otherState);
      const newSOtherBAN: PlayerState = { ...removedBAN, energy: [...removedBAN.energy, cnBAN] };
      return done(addLog({ ...ctx, otherState: newSOtherBAN }, `${ctx.cardMap.get(cnBAN)?.CardName ?? cnBAN}をバニッシュ`));
    }
    const foundSelfBAN = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnBAN);
    if (foundSelfBAN) {
      const removedBAN = removeFromField(cnBAN, ctx.ownerState);
      const newSBAN: PlayerState = { ...removedBAN, energy: [...removedBAN.energy, cnBAN] };
      return done(addLog({ ...ctx, ownerState: newSBAN }, `${ctx.cardMap.get(cnBAN)?.CardName ?? cnBAN}をバニッシュ`));
    }
    return done(addLog(ctx, `${ctx.cardMap.get(cnBAN)?.CardName ?? cnBAN}はフィールドにない`));
  }
  // TRASH (STUB版): lastProcessedCards[0] か sourceCardNum をトラッシュへ
  if (stub.id === 'TRASH') {
    const cnTRS = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnTRS) return done(addLog(ctx, 'トラッシュ対象なし'));
    // 自フィールド
    if (ctx.ownerState.field.signi.some(s => s?.includes(cnTRS))) {
      const removedTRS = removeFromField(cnTRS, ctx.ownerState);
      return done(addLog({ ...ctx, ownerState: { ...removedTRS, trash: [...removedTRS.trash, cnTRS] } },
        `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}をトラッシュへ`));
    }
    // 自手札
    if (ctx.ownerState.hand.includes(cnTRS)) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, hand: ctx.ownerState.hand.filter(c => c !== cnTRS), trash: [...ctx.ownerState.trash, cnTRS] } },
        `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}をトラッシュへ`));
    }
    // 相手フィールド
    if (ctx.otherState.field.signi.some(s => s?.includes(cnTRS))) {
      const removedTRS = removeFromField(cnTRS, ctx.otherState);
      return done(addLog({ ...ctx, otherState: { ...removedTRS, trash: [...removedTRS.trash, cnTRS] } },
        `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}をトラッシュへ`));
    }
    return done(addLog(ctx, `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}（TRASH STUB）`));
  }
  // BANISH_FROM_GAME: ゲームから除外（ルリグトラッシュへ）
  if (stub.id === 'BANISH_FROM_GAME') {
    const cnBFG = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnBFG) return done(addLog(ctx, '除外対象なし'));
    const foundOppBFG = ctx.otherState.field.signi.some(s => s?.at(-1) === cnBFG);
    const ownerBFG: 'self' | 'opponent' = foundOppBFG ? 'opponent' : 'self';
    const stBFG = ownerState(ownerBFG, ctx);
    const removedBFG = removeFromField(cnBFG, stBFG);
    const newSBFG: PlayerState = { ...removedBFG, lrig_trash: [...removedBFG.lrig_trash, cnBFG] };
    return done(addLog(setOwnerState(ownerBFG, newSBFG, ctx), `${ctx.cardMap.get(cnBFG)?.CardName ?? cnBFG}をゲームから除外`));
  }
  // TRASH_ALL_OPP_CARDS: 相手エナから名前一致カードをすべてトラッシュへ
  if (stub.id === 'TRASH_ALL_OPP_CARDS') {
    const srcTAOC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTAOC = srcTAOC ? (srcTAOC.EffectText ?? '') + ' ' + (srcTAOC.BurstText ?? '') : '';
    const nameMatchTAOC = txtTAOC.match(/《([^》]+)》を含むすべてのカードをトラッシュに置く/);
    const targetNameTAOC = nameMatchTAOC?.[1];
    if (targetNameTAOC) {
      const toTrashTAOC = ctx.otherState.energy.filter(cn =>
        (ctx.cardMap.get(cn)?.CardName ?? '').includes(targetNameTAOC),
      );
      if (toTrashTAOC.length === 0) return done(addLog(ctx, `相手エナに「${targetNameTAOC}」なし`));
      const newOtherTAOC: PlayerState = {
        ...ctx.otherState,
        energy: ctx.otherState.energy.filter(cn => !(ctx.cardMap.get(cn)?.CardName ?? '').includes(targetNameTAOC)),
        trash: [...ctx.otherState.trash, ...toTrashTAOC],
      };
      return done(addLog({ ...ctx, otherState: newOtherTAOC },
        `相手エナから「${targetNameTAOC}」${toTrashTAOC.length}枚→トラッシュ`));
    }
    // フォールバック: 相手の全フィールド+手札をトラッシュへ
    let sOppTAOC = ctx.otherState;
    const toTrashFbTAOC: string[] = [];
    const newSigniTAOC = sOppTAOC.field.signi.map(stack => {
      if (stack && stack.length > 0) { toTrashFbTAOC.push(...stack); return null; }
      return stack;
    }) as (string[] | null)[];
    toTrashFbTAOC.push(...sOppTAOC.hand);
    sOppTAOC = { ...sOppTAOC, field: { ...sOppTAOC.field, signi: newSigniTAOC }, hand: [], trash: [...sOppTAOC.trash, ...toTrashFbTAOC] };
    return done(addLog({ ...ctx, otherState: sOppTAOC }, `相手の${toTrashFbTAOC.length}枚をトラッシュへ`));
  }
  // ABILITY_CHECK_ELSE_TRASH: 能力なしなら自トラッシュ
  if (stub.id === 'ABILITY_CHECK_ELSE_TRASH') {
    if (!ctx.sourceCardNum) return done(ctx);
    const srcDataACET = ctx.cardMap.get(ctx.sourceCardNum);
    const hasAbilityACET = !!(srcDataACET?.EffectText?.trim() || srcDataACET?.BurstText?.trim());
    if (hasAbilityACET) return done(addLog(ctx, '能力ありのためトラッシュなし'));
    const removedACET = removeFromField(ctx.sourceCardNum, ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: { ...removedACET, trash: [...removedACET.trash, ctx.sourceCardNum] } }, '能力なし→トラッシュ'));
  }
  // OPTIONAL_DISCARD_CLASS_SIGNI: クラスシグニを任意で捨てる
  if (stub.id === 'OPTIONAL_DISCARD_CLASS_SIGNI') {
    const srcODCS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtODCS = srcODCS ? (srcODCS.EffectText ?? '') + ' ' + (srcODCS.BurstText ?? '') : '';
    const classMatchODCS = txtODCS.match(/【([^】]+)】/);
    const classFilterODCS = classMatchODCS?.[1];
    const candsODCS = ctx.ownerState.hand.filter(cn => {
      const card = ctx.cardMap.get(cn);
      if (card?.Type !== 'シグニ') return false;
      return !classFilterODCS || (card.CardClass ?? '').includes(classFilterODCS);
    });
    if (candsODCS.length === 0) return done(addLog(ctx, '対象クラスシグニなし（任意捨て）'));
    const thenODCS: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsODCS, count: 1, optional: true,
      targetScope: 'self_hand', thenAction: thenODCS,
    });
  }
  // PICK_FROM_TRASHED_CARDS: トラッシュカードからピックして手札へ
  if (stub.id === 'PICK_FROM_TRASHED_CARDS') {
    const trashPFTC = ctx.ownerState.trash;
    if (trashPFTC.length === 0) return done(addLog(ctx, 'トラッシュなし'));
    const thenPFTC: TransferToHandAction = { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: trashPFTC, count: 1, optional: true,
      targetScope: 'self_trash', thenAction: thenPFTC,
    });
  }
  // CONDITIONAL_ADD_HAND: フィールドにシグニがあれば手札に1枚追加
  if (stub.id === 'CONDITIONAL_ADD_HAND') {
    const hasSigniCAH = ctx.ownerState.field.signi.some(s => s && s.length > 0);
    if (!hasSigniCAH) return done(addLog(ctx, 'フィールドにシグニなし（手札追加なし）'));
    const sCAH = ctx.ownerState;
    if (sCAH.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const drawnCAH = sCAH.deck[0];
    const newSCAH: PlayerState = { ...sCAH, deck: sCAH.deck.slice(1), hand: [...sCAH.hand, drawnCAH] };
    return done(addLog({ ...ctx, ownerState: newSCAH }, '条件達成→手札に1枚追加'));
  }
  // CONDITIONAL_DISCARD: 条件付き手札捨て
  if (stub.id === 'CONDITIONAL_DISCARD') {
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '手札なし（条件捨てなし）'));
    const thenCD: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: ctx.ownerState.hand, count: 1, optional: false,
      targetScope: 'self_hand', thenAction: thenCD,
    });
  }
  // PICK_FROM_TRASHED_CARDS の後半 / CONDITIONAL_ALTERNATE_EFFECT: 代替効果（スキップ）
  // TRASH_SPELL_FREE_USE_LIMIT: トラッシュスペル無料使用制限（log）
  // OPP_DECLARE_COLOR: 相手が色を宣言（log）
  // DISCARD_BY_POWER_MATCH: 手札の青シグニを捨て→相手手札の同パワーシグニを捨てさせる
  if (stub.id === 'DISCARD_BY_POWER_MATCH') {
    const toHWDBPM = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const discardedDBPM = (ctx.lastProcessedCards ?? []).find(cn => ctx.ownerState.hand.includes(cn));
    if (!discardedDBPM) {
      // Phase 1: SELECT_TARGET 手札の青シグニ（コスト）
      const blueHandDBPM = ctx.ownerState.hand.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.Type === 'シグニ' && (c.Color ?? '').includes('青');
      });
      if (blueHandDBPM.length === 0) return done(addLog(ctx, '手札に青シグニなし（DISCARD_BY_POWER_MATCH）'));
      const noop: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const cont: StubAction = { type: 'STUB', id: 'DISCARD_BY_POWER_MATCH' };
      return needsInteraction(addLog(ctx, '手札から青シグニを選択（捨てる）'), {
        type: 'SELECT_TARGET', candidates: blueHandDBPM, count: 1, optional: false,
        targetScope: 'self_hand', thenAction: noop as EffectAction, continuation: cont as EffectAction,
      });
    }
    // Phase 2: 選択シグニを捨て、同パワーの相手手札シグニを捨てさせる
    const discardedPwDBPM = parseInt(toHWDBPM(ctx.cardMap.get(discardedDBPM)?.Power ?? '0')) || 0;
    const newOwnerDBPM: PlayerState = {
      ...ctx.ownerState,
      hand: ctx.ownerState.hand.filter(cn => cn !== discardedDBPM),
      trash: [...ctx.ownerState.trash, discardedDBPM],
    };
    const matchingOppDBPM = ctx.otherState.hand.find(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (parseInt(toHWDBPM(c.Power ?? '0')) || 0) === discardedPwDBPM;
    });
    if (matchingOppDBPM) {
      const newOtherDBPM: PlayerState = {
        ...ctx.otherState,
        hand: ctx.otherState.hand.filter(cn => cn !== matchingOppDBPM),
        trash: [...ctx.otherState.trash, matchingOppDBPM],
      };
      return done(addLog({ ...ctx, ownerState: newOwnerDBPM, otherState: newOtherDBPM },
        `${ctx.cardMap.get(discardedDBPM)?.CardName ?? discardedDBPM}を捨て、相手の${ctx.cardMap.get(matchingOppDBPM)?.CardName ?? matchingOppDBPM}（パワー${discardedPwDBPM}）を捨てさせる`));
    }
    return done(addLog({ ...ctx, ownerState: newOwnerDBPM },
      `${ctx.cardMap.get(discardedDBPM)?.CardName ?? discardedDBPM}を捨て（相手手札にパワー${discardedPwDBPM}のシグニなし）`));
  }
  // SELECT_NO_COMMON_COLOR / DISCARD_OR_PENALTY: log
  // === バッチ8: パワー修正（ルリグ・カウント系） ===
  // POWER_MOD_BY_LRIG_LEVEL: ルリグレベル×deltaを相手シグニに適用
  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL') {
    const toHWPMBLL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const centerNumPMBLL = ctx.ownerState.field.lrig.at(-1);
    const centerCardPMBLL = centerNumPMBLL ? ctx.cardMap.get(centerNumPMBLL) : undefined;
    const lrigLevelPMBLL = centerCardPMBLL ? parseInt(toHWPMBLL(centerCardPMBLL.Level ?? '0')) || 0 : 0;
    const srcPMBLL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBLL = srcPMBLL ? (srcPMBLL.EffectText ?? '') + ' ' + (srcPMBLL.BurstText ?? '') : '';
    const mPMBLL = txtPMBLL.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBLL) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_LRIG_LEVEL）'));
    const singleDeltaPMBLL = parseInt(toHWPMBLL(mPMBLL[1]).replace('＋', '+').replace('－', '-'));
    const totalDeltaPMBLL = singleDeltaPMBLL * lrigLevelPMBLL;
    const modsPMBLL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMBLL.push({ cardNum: top, delta: totalDeltaPMBLL }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMBLL } },
      `ルリグLv${lrigLevelPMBLL}×${singleDeltaPMBLL}→相手シグニパワー${totalDeltaPMBLL}`));
  }
  // POWER_MOD_BY_LRIG_LEVEL_SUM: 全ルリグレベル合計×deltaを相手シグニに
  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL_SUM') {
    const toHWPMBLLS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const lrigLevelSumPMBLLS = ctx.ownerState.field.lrig.reduce((sum, cn) => {
      return sum + (parseInt(toHWPMBLLS(ctx.cardMap.get(cn)?.Level ?? '0')) || 0);
    }, 0);
    const srcPMBLLS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBLLS = srcPMBLLS ? (srcPMBLLS.EffectText ?? '') + ' ' + (srcPMBLLS.BurstText ?? '') : '';
    const mPMBLLS = txtPMBLLS.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBLLS) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_LRIG_LEVEL_SUM）'));
    const singleDeltaPMBLLS = parseInt(toHWPMBLLS(mPMBLLS[1]).replace('＋', '+').replace('－', '-'));
    const totalDeltaPMBLLS = singleDeltaPMBLLS * lrigLevelSumPMBLLS;
    const modsPMBLLS = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMBLLS.push({ cardNum: top, delta: totalDeltaPMBLLS }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMBLLS } },
      `全ルリグLv合計${lrigLevelSumPMBLLS}×${singleDeltaPMBLLS}→相手シグニパワー${totalDeltaPMBLLS}`));
  }
  // POWER_MOD_BY_TRASH_CLASS_COUNT: トラッシュの特定クラス枚数×deltaをパワー修正
  if (stub.id === 'POWER_MOD_BY_TRASH_CLASS_COUNT') {
    const toHWPMBTCC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBTCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBTCC = srcPMBTCC ? (srcPMBTCC.EffectText ?? '') + ' ' + (srcPMBTCC.BurstText ?? '') : '';
    const classMatchPMBTCC = txtPMBTCC.match(/【([^】]+)】.*?(?:の)?(?:シグニ|カード).*?([＋+－-][０-９\d]+)/);
    if (!classMatchPMBTCC) return done(addLog(ctx, 'クラス/パワー値解析失敗（POWER_MOD_BY_TRASH_CLASS_COUNT）'));
    const classNamePMBTCC = classMatchPMBTCC[1];
    const singleDeltaPMBTCC = parseInt(toHWPMBTCC(classMatchPMBTCC[2]).replace('＋', '+').replace('－', '-'));
    const trashClassCountPMBTCC = ctx.ownerState.trash.filter(cn => (ctx.cardMap.get(cn)?.CardClass ?? '').includes(classNamePMBTCC)).length;
    const totalDeltaPMBTCC = singleDeltaPMBTCC * trashClassCountPMBTCC;
    if (ctx.sourceCardNum) {
      const modsOwnPMBTCC = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMBTCC }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsOwnPMBTCC } },
        `トラッシュ【${classNamePMBTCC}】${trashClassCountPMBTCC}枚×${singleDeltaPMBTCC}→パワー${totalDeltaPMBTCC}`));
    }
    const modsOppPMBTCC = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsOppPMBTCC.push({ cardNum: top, delta: totalDeltaPMBTCC }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsOppPMBTCC } },
      `トラッシュ【${classNamePMBTCC}】${trashClassCountPMBTCC}枚→相手パワー${totalDeltaPMBTCC}`));
  }
  // POWER_MOD_BY_UNDER_COUNT: シグニ下のカード枚数×deltaをパワー修正
  if (stub.id === 'POWER_MOD_BY_UNDER_COUNT') {
    const toHWPMBUC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBUC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBUC = srcPMBUC ? (srcPMBUC.EffectText ?? '') + ' ' + (srcPMBUC.BurstText ?? '') : '';
    const mPMBUC = txtPMBUC.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBUC || !ctx.sourceCardNum) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_UNDER_COUNT）'));
    const singleDeltaPMBUC = parseInt(toHWPMBUC(mPMBUC[1]).replace('＋', '+').replace('－', '-'));
    let selfZonePMBUC = -1;
    for (let zi = 0; zi < 3; zi++) { if (ctx.ownerState.field.signi[zi]?.at(-1) === ctx.sourceCardNum) { selfZonePMBUC = zi; break; } }
    const underCountPMBUC = selfZonePMBUC >= 0 ? Math.max(0, (ctx.ownerState.field.signi[selfZonePMBUC]?.length ?? 1) - 1) : 0;
    const totalDeltaPMBUC = singleDeltaPMBUC * underCountPMBUC;
    const modsPMBUC = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMBUC }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPMBUC } },
      `シグニ下${underCountPMBUC}枚×${singleDeltaPMBUC}→パワー${totalDeltaPMBUC}`));
  }
  // POWER_MOD_BY_COLOR_VARIETY: 色の種類数×deltaをパワー修正
  if (stub.id === 'POWER_MOD_BY_COLOR_VARIETY') {
    const toHWPMBCV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBCV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBCV = srcPMBCV ? (srcPMBCV.EffectText ?? '') + ' ' + (srcPMBCV.BurstText ?? '') : '';
    const mPMBCV = txtPMBCV.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBCV) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_COLOR_VARIETY）'));
    const singleDeltaPMBCV = parseInt(toHWPMBCV(mPMBCV[1]).replace('＋', '+').replace('－', '-'));
    // 自分のエナゾーンの色の種類（"無色"以外）
    const colorsInEna = new Set<string>();
    for (const cn of ctx.ownerState.energy) {
      const col = ctx.cardMap.get(cn)?.Color ?? '';
      col.split('/').forEach(c => { if (c && c !== '無色') colorsInEna.add(c); });
    }
    const colorCountPMBCV = colorsInEna.size;
    const totalDeltaPMBCV = singleDeltaPMBCV * colorCountPMBCV;
    if (ctx.sourceCardNum) {
      const modsOwnPMBCV = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMBCV }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsOwnPMBCV } },
        `エナ色${colorCountPMBCV}種×${singleDeltaPMBCV}→パワー${totalDeltaPMBCV}`));
    }
    const modsOppPMBCV = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsOppPMBCV.push({ cardNum: top, delta: totalDeltaPMBCV }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsOppPMBCV } },
      `エナ色${colorCountPMBCV}種→相手シグニパワー${totalDeltaPMBCV}`));
  }
  // POWER_MOD_BY_DISCARD_COUNT_HIGH: 捨てた枚数の高い方×deltaをパワー修正
  if (stub.id === 'POWER_MOD_BY_DISCARD_COUNT_HIGH') {
    const toHWPMBDCH = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBDCH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBDCH = srcPMBDCH ? (srcPMBDCH.EffectText ?? '') + ' ' + (srcPMBDCH.BurstText ?? '') : '';
    const mPMBDCH = txtPMBDCH.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBDCH) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_DISCARD_COUNT_HIGH）'));
    const singleDeltaPMBDCH = parseInt(toHWPMBDCH(mPMBDCH[1]).replace('＋', '+').replace('－', '-'));
    const discardCountPMBDCH = ctx.lastProcessedCards?.length ?? 0;
    const totalDeltaPMBDCH = singleDeltaPMBDCH * discardCountPMBDCH;
    const modsPMBDCH = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMBDCH.push({ cardNum: top, delta: totalDeltaPMBDCH }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMBDCH } },
      `捨て${discardCountPMBDCH}枚×${singleDeltaPMBDCH}→相手パワー${totalDeltaPMBDCH}`));
  }
  // === バッチ9: ルリグ・条件サーチ・選択系 ===
  // CRAFT_TO_LRIG_DECK / ADD_CRAFT_TO_LRIG_DECK: クラフトをルリグデッキへ
  if (stub.id === 'CRAFT_TO_LRIG_DECK' || stub.id === 'ADD_CRAFT_TO_LRIG_DECK') {
    let cnCTLD = ctx.sourceCardNum ?? ctx.lastProcessedCards?.[0];
    if (!cnCTLD) {
      // テキストから《カード名》を解析してlrig_trash→field→deck から検索
      const srcCTLD2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
      const txtCTLD2 = srcCTLD2 ? (srcCTLD2.EffectText ?? '') : '';
      const nameMCTLD2 = txtCTLD2.match(/クラフトの《([^》]+)》/);
      const craftNameCTLD2 = nameMCTLD2 ? nameMCTLD2[1] : '';
      if (craftNameCTLD2) {
        const fromLrigTrash = ctx.ownerState.lrig_trash.find(cn => ctx.cardMap.get(cn)?.CardName === craftNameCTLD2);
        const fromField = ctx.ownerState.field.lrig.find(cn => ctx.cardMap.get(cn)?.CardName === craftNameCTLD2);
        cnCTLD = fromLrigTrash ?? fromField;
      }
      if (!cnCTLD) return done(addLog(ctx, `クラフトカードなし${craftNameCTLD2 ? `（${craftNameCTLD2}）` : ''}`));
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
    return done(addLog({ ...ctx, ownerState: sCTLD }, `${ctx.cardMap.get(cnCTLD)?.CardName ?? cnCTLD}をルリグデッキに追加`));
  }
  // PLACE_LRIG_FROM_DECK_ON_TOP: ルリグデッキからルリグをフィールドへ
  if (stub.id === 'PLACE_LRIG_FROM_DECK_ON_TOP') {
    const sPLFDOT = ctx.ownerState;
    const topLrigPLFDOT = sPLFDOT.lrig_deck[0];
    if (!topLrigPLFDOT) return done(addLog(ctx, 'ルリグデッキなし'));
    const newSPLFDOT: PlayerState = {
      ...sPLFDOT,
      lrig_deck: sPLFDOT.lrig_deck.slice(1),
      field: { ...sPLFDOT.field, lrig: [...sPLFDOT.field.lrig, topLrigPLFDOT] },
    };
    return done(addLog({ ...ctx, ownerState: newSPLFDOT }, `${ctx.cardMap.get(topLrigPLFDOT)?.CardName ?? topLrigPLFDOT}をフィールドへ`));
  }
  // LRIG_LIMIT_UP_AND_COLOR_GAIN: ルリグリミット増加（+1）と色獲得（log）
  if (stub.id === 'LRIG_LIMIT_UP_AND_COLOR_GAIN') {
    const newSLLUACG: PlayerState = { ...ctx.ownerState, lrig_limit_mod: (ctx.ownerState.lrig_limit_mod ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newSLLUACG }, 'ルリグリミット+1（色獲得はエンジン処理）'));
  }
  // CONDITIONAL_SEARCH_IF_FIELD: フィールドにシグニがある場合サーチ
  if (stub.id === 'CONDITIONAL_SEARCH_IF_FIELD') {
    const hasSigniCSIF = ctx.ownerState.field.signi.some(s => s && s.length > 0);
    if (!hasSigniCSIF) return done(addLog(ctx, 'フィールドにシグニなし（サーチなし）'));
    // デッキ上3枚からシグニを選択
    const deckCSIF = ctx.ownerState.deck;
    if (deckCSIF.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topCSIF = deckCSIF.slice(0, Math.min(3, deckCSIF.length));
    const signiTopCSIF = topCSIF.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (signiTopCSIF.length === 0) return done(addLog(ctx, 'デッキ上3枚にシグニなし'));
    const newSCSIF: PlayerState = { ...ctx.ownerState, deck: deckCSIF.slice(topCSIF.length), hand: [...ctx.ownerState.hand, signiTopCSIF[0]] };
    return done(addLog({ ...ctx, ownerState: newSCSIF }, `フィールドあり→${ctx.cardMap.get(signiTopCSIF[0])?.CardName ?? signiTopCSIF[0]}を手札へ`));
  }
  // CONDITIONAL_SEARCH_IF_RESONA: フィールドにレゾナがある場合サーチ
  if (stub.id === 'CONDITIONAL_SEARCH_IF_RESONA') {
    const hasResonaCSIR = ctx.ownerState.field.signi.some(s => s && s.some(cn => ctx.cardMap.get(cn)?.Type === 'レゾナ'));
    if (!hasResonaCSIR) return done(addLog(ctx, 'レゾナなし（サーチなし）'));
    const deckCSIR = ctx.ownerState.deck;
    if (deckCSIR.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topCSIR = deckCSIR.slice(0, Math.min(5, deckCSIR.length));
    const signiCSIR = topCSIR.find(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (!signiCSIR) return done(addLog(ctx, 'デッキ上5枚にシグニなし'));
    const restCSIR = topCSIR.filter(cn => cn !== signiCSIR);
    const newSCSIR: PlayerState = { ...ctx.ownerState, deck: [...restCSIR, ...deckCSIR.slice(topCSIR.length)], hand: [...ctx.ownerState.hand, signiCSIR] };
    return done(addLog({ ...ctx, ownerState: newSCSIR }, `レゾナあり→${ctx.cardMap.get(signiCSIR)?.CardName ?? signiCSIR}を手札へ`));
  }
  // CHOSEN_TO_ENERGY_OR_HAND: 選んだカードをエナか手札か選択して追加
  if (stub.id === 'CHOSEN_TO_ENERGY_OR_HAND') {
    const cnCTEOH = ctx.lastProcessedCards?.[0];
    if (!cnCTEOH) return done(addLog(ctx, '対象カードなし'));
    const toHandCTEOH: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_HAND' };
    const toEnaCTEOH: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_ENERGY' };
    return needsInteraction(ctx, {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'to_hand', label: '手札に加える', action: toHandCTEOH, available: true },
        { id: 'to_energy', label: 'エナゾーンへ', action: toEnaCTEOH, available: true },
      ],
    });
  }
  // OPP_ENERGY_OR_DISCARD_CONDITION: 相手はエナゾーンかトラッシュか選択
  if (stub.id === 'OPP_ENERGY_OR_DISCARD_CONDITION') {
    const toEnaOEODC: EnergyChargeAction = { type: 'ENERGY_CHARGE', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } };
    const toTrashOEODC: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } };
    return needsInteraction(ctx, {
      type: 'CHOOSE', count: 1, opponentResponds: true,
      options: [
        { id: 'energy', label: 'エナからカードを置く', action: toEnaOEODC, available: ctx.otherState.energy.length > 0 },
        { id: 'discard', label: '手札を1枚捨てる', action: toTrashOEODC, available: ctx.otherState.hand.length > 0 },
      ],
    });
  }
  // PLACE_SIGNI_UNDER_SIGNI: シグニをシグニ下に設置（lastProcessed→sourceCardNumのゾーン下）
  if (stub.id === 'PLACE_SIGNI_UNDER_SIGNI') {
    const cardToPlacePSUS = ctx.lastProcessedCards?.[0];
    if (!cardToPlacePSUS || !ctx.sourceCardNum) return done(addLog(ctx, '対象なし（PLACE_SIGNI_UNDER_SIGNI）'));
    let selfZonePSUS = -1;
    for (let zi = 0; zi < 3; zi++) { if (ctx.ownerState.field.signi[zi]?.at(-1) === ctx.sourceCardNum) { selfZonePSUS = zi; break; } }
    if (selfZonePSUS < 0) return done(addLog(ctx, 'ゾーン不明（PLACE_SIGNI_UNDER_SIGNI）'));
    let sPSUS = ctx.ownerState;
    sPSUS = { ...sPSUS, hand: sPSUS.hand.filter(c => c !== cardToPlacePSUS), trash: sPSUS.trash.filter(c => c !== cardToPlacePSUS) };
    const newSigniPSUS = sPSUS.field.signi.map((stack, i) => {
      if (i !== selfZonePSUS) return stack;
      return [cardToPlacePSUS, ...(stack ?? [])];
    }) as (string[] | null)[];
    sPSUS = { ...sPSUS, field: { ...sPSUS.field, signi: newSigniPSUS } };
    return done(addLog({ ...ctx, ownerState: sPSUS }, `${ctx.cardMap.get(cardToPlacePSUS)?.CardName ?? cardToPlacePSUS}をシグニ下に設置`));
  }
  // CONDITIONAL_PER_TRASH: トラッシュ枚数による条件（N枚以上でX）
  if (stub.id === 'CONDITIONAL_PER_TRASH') {
    const srcCPT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCPT = srcCPT ? (srcCPT.EffectText ?? '') + ' ' + (srcCPT.BurstText ?? '') : '';
    const toHWCPT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mCPT = txtCPT.match(/トラッシュに(?:カードが)?([０-９\d]+)枚以上/);
    const threshold = mCPT ? parseInt(toHWCPT(mCPT[1])) : 5;
    const trashCountCPT = ctx.ownerState.trash.length;
    if (trashCountCPT < threshold) return done(addLog(ctx, `トラッシュ${trashCountCPT}枚（閾値${threshold}枚に未達）`));
    // 条件達成→1枚ドロー
    const sCPT = ctx.ownerState;
    if (sCPT.deck.length === 0) return done(addLog(ctx, `トラッシュ条件達成だがデッキなし`));
    const drawnCPT = sCPT.deck[0];
    return done(addLog({ ...ctx, ownerState: { ...sCPT, deck: sCPT.deck.slice(1), hand: [...sCPT.hand, drawnCPT] } },
      `トラッシュ${trashCountCPT}枚条件達成→1枚ドロー`));
  }
  // === バッチ10: 公開・手札・相手手札操作 ===
  // LOOK_OPP_HAND_DISCARD_SIGNI: 相手の手札を見てシグニ1枚を捨てさせる
  if (stub.id === 'LOOK_OPP_HAND_DISCARD_SIGNI') {
    const signiInOppLOHDS = ctx.otherState.hand.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (signiInOppLOHDS.length === 0) return done(addLog(ctx, '相手手札にシグニなし'));
    const thenLOHDS: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: signiInOppLOHDS, count: 1, optional: false,
      targetScope: 'opp_hand', thenAction: thenLOHDS,
    });
  }
  // REVEALED_CARD_COLOR_DISCARD: 公開カードの色と同じ色の手札カードを捨てる
  if (stub.id === 'REVEALED_CARD_COLOR_DISCARD') {
    const revCardRCCD = ctx.lastProcessedCards?.[0];
    if (!revCardRCCD) return done(addLog(ctx, '公開カードなし'));
    const revColorRCCD = ctx.cardMap.get(revCardRCCD)?.Color ?? '';
    if (!revColorRCCD) return done(addLog(ctx, '公開カードの色不明'));
    const revColorsRCCD = revColorRCCD.split('/');
    const matchingRCCD = ctx.ownerState.hand.filter(cn => {
      const col = ctx.cardMap.get(cn)?.Color ?? '';
      return col.split('/').some(c => revColorsRCCD.includes(c));
    });
    if (matchingRCCD.length === 0) return done(addLog(ctx, `手札に${revColorRCCD}カードなし`));
    const thenRCCD: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: matchingRCCD, count: 1, optional: false,
      targetScope: 'self_hand', thenAction: thenRCCD,
    });
  }
  // VIEW_AND_DISCARD_SPELL (STUB版): 手札か場のカードを見てスペルを捨てる → 手札からスペルを1枚捨てる
  // (already implemented by batch 5 VIEW_AND_DISCARD_SPELL)
  // OPP_TRASH_TO_OPP_SIGNI_UNDER: 相手トラッシュ最上段を相手シグニ下にカードを置く
  if (stub.id === 'OPP_TRASH_TO_OPP_SIGNI_UNDER') {
    const sOTTOSU = ctx.otherState;
    if (sOTTOSU.trash.length === 0) return done(addLog(ctx, '相手トラッシュなし'));
    const topTrashOTTOSU = sOTTOSU.trash.at(-1)!;
    // トラッシュからカードを取り出し、lastProcessedCardsに保持
    const newTrashOTTOSU = sOTTOSU.trash.slice(0, -1);
    const ctx1OTTBSU = { ...ctx, otherState: { ...sOTTOSU, trash: newTrashOTTOSU }, lastProcessedCards: [topTrashOTTOSU] };
    const oppZonesOTTOSU = [0, 1, 2].filter(zi => sOTTOSU.field.signi[zi]?.at(-1));
    if (oppZonesOTTOSU.length === 0) return done(addLog(ctx1OTTBSU, '相手フィールドにシグニなし'));
    if (oppZonesOTTOSU.length === 1) {
      // 1体のみ → 自動決定
      return exec({ type: 'STUB', id: 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE', value: oppZonesOTTOSU[0] } as StubAction as EffectAction, ctx1OTTBSU);
    }
    // 複数シグニ → ゾーン選択（オーナー側が選ぶ）
    const zoneOptsOTTOSU = oppZonesOTTOSU.map(zi => ({
      id: `ottbsu_zone_${zi}`,
      label: `ゾーン${zi + 1}のシグニの下に置く`,
      action: ({ type: 'STUB', id: 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx1OTTBSU, `${ctx.cardMap.get(topTrashOTTOSU)?.CardName ?? topTrashOTTOSU}：どのシグニの下に置く？`), {
      type: 'CHOOSE', options: zoneOptsOTTOSU, count: 1,
    });
  }
  // INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE: stub.value=ゾーン番号、lastProcessedCards[0]=置くカード
  if (stub.id === 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE') {
    const zoneIdxOTUSZ = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const cardToPlaceOTUSZ = ctx.lastProcessedCards?.[0] ?? null;
    if (!cardToPlaceOTUSZ) return done(addLog(ctx, 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE: カードなし'));
    const newSigniOTUSZ = ctx.otherState.field.signi.map((stack, i) => {
      if (i !== zoneIdxOTUSZ) return stack;
      return [cardToPlaceOTUSZ, ...(stack ?? [])];
    }) as (string[] | null)[];
    const newOtherOTUSZ = { ...ctx.otherState, field: { ...ctx.otherState.field, signi: newSigniOTUSZ } };
    return done(addLog({ ...ctx, otherState: newOtherOTUSZ },
      `${ctx.cardMap.get(cardToPlaceOTUSZ)?.CardName ?? cardToPlaceOTUSZ}→相手ゾーン${zoneIdxOTUSZ + 1}のシグニ下へ`));
  }
  // POWER_MOD_BY_FIELD_CLASS_LEVEL: フィールドのクラスシグニレベル合計×deltaをパワー修正
  if (stub.id === 'POWER_MOD_BY_FIELD_CLASS_LEVEL') {
    const toHWPMBFCL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBFCL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBFCL = srcPMBFCL ? (srcPMBFCL.EffectText ?? '') + ' ' + (srcPMBFCL.BurstText ?? '') : '';
    const classMatchPMBFCL = txtPMBFCL.match(/【([^】]+)】/);
    const classNamePMBFCL = classMatchPMBFCL?.[1] ?? '';
    const mDeltaPMBFCL = txtPMBFCL.match(/([＋+－-][０-９\d]+)/);
    if (!mDeltaPMBFCL) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_FIELD_CLASS_LEVEL）'));
    const singleDeltaPMBFCL = parseInt(toHWPMBFCL(mDeltaPMBFCL[1]).replace('＋', '+').replace('－', '-'));
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
        `フィールド【${classNamePMBFCL}】レベル合計${levelSumPMBFCL}×${singleDeltaPMBFCL}→パワー${totalDeltaPMBFCL}`));
    }
    const modsOppPMBFCL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsOppPMBFCL.push({ cardNum: top, delta: totalDeltaPMBFCL }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsOppPMBFCL } },
      `フィールドクラスレベル${levelSumPMBFCL}→相手パワー${totalDeltaPMBFCL}`));
  }
  // POWER_MOD_PER_REVEALED_LEVEL: 公開カードのレベル合計×deltaをパワー修正
  if (stub.id === 'POWER_MOD_PER_REVEALED_LEVEL') {
    const toHWPMPRL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMPRL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMPRL = srcPMPRL ? (srcPMPRL.EffectText ?? '') + ' ' + (srcPMPRL.BurstText ?? '') : '';
    const mPMPRL = txtPMPRL.match(/([＋+－-][０-９\d]+)/);
    if (!mPMPRL) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_PER_REVEALED_LEVEL）'));
    const singleDeltaPMPRL = parseInt(toHWPMPRL(mPMPRL[1]).replace('＋', '+').replace('－', '-'));
    const levelSumPMPRL = (ctx.lastProcessedCards ?? []).reduce((sum, cn) => {
      return sum + (parseInt(toHWPMPRL(ctx.cardMap.get(cn)?.Level ?? '0')) || 0);
    }, 0);
    const totalDeltaPMPRL = singleDeltaPMPRL * levelSumPMPRL;
    const modsPMPRL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMPRL.push({ cardNum: top, delta: totalDeltaPMPRL }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMPRL } },
      `公開レベル合計${levelSumPMPRL}×${singleDeltaPMPRL}→相手シグニパワー${totalDeltaPMPRL}`));
  }
  // === バッチ18: エンジン必須系 ===
  // トラップ系 ─────────────────────────────────────────────────────────

  // PLACE_TRAP_OPTIONAL / SET_HAND_CARD_AS_TRAP: 手札からトラップ設置
  if (stub.id === 'PLACE_TRAP_OPTIONAL' || stub.id === 'SET_HAND_CARD_AS_TRAP') {
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, 'トラップ設置：手札なし'));
    const zoneOptsPTO = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `ゾーン${zi + 1}に設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, 'トラップにするカードを選択'), {
      type: 'SELECT_TARGET',
      candidates: ctx.ownerState.hand,
      count: 1,
      optional: false,
      targetScope: 'self_hand',
      thenAction: ({ type: 'STUB', id: 'CHOOSE_TRAP_ZONE' } as StubAction) as EffectAction,
      continuation: ({ type: 'CHOOSE', choose_count: 1, from_count: 3, choices: zoneOptsPTO.map(o => ({ choiceId: o.id, label: o.label, action: o.action })) } as ChooseAction) as EffectAction,
    });
  }
  // CHOOSE_TRAP_ZONE: 選択済みカードのゾーン選択
  if (stub.id === 'CHOOSE_TRAP_ZONE') {
    const zoneOptsCTZ = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `ゾーン${zi + 1}に設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '設置するゾーンを選択'), {
      type: 'CHOOSE', options: zoneOptsCTZ, count: 1,
    });
  }
  // INTERNAL_SET_TRAP: ゾーン番号をstub.valueで受け取りトラップ設置
  if (stub.id === 'INTERNAL_SET_TRAP') {
    const zoneIdxIST = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const trapCardIST = ctx.lastProcessedCards?.[0] ?? null;
    if (!trapCardIST) return done(addLog(ctx, 'トラップ設置：対象カードなし'));
    const currentTrapsIST = [...(ctx.ownerState.field.signi_traps ?? [null, null, null])] as (string | null)[];
    const newTrashIST = [...ctx.ownerState.trash];
    if (currentTrapsIST[zoneIdxIST]) newTrashIST.push(currentTrapsIST[zoneIdxIST]!);
    currentTrapsIST[zoneIdxIST] = trapCardIST;
    const newHandIST = ctx.ownerState.hand.filter(c => c !== trapCardIST);
    const newOwnerIST = { ...ctx.ownerState, hand: newHandIST, trash: newTrashIST, field: { ...ctx.ownerState.field, signi_traps: currentTrapsIST } };
    return done(addLog({ ...ctx, ownerState: newOwnerIST }, `トラップ設置: ゾーン${zoneIdxIST + 1}`));
  }
  // TRAP_TO_HAND: signi_trapsのカードを手札へ（全枚または選択）
  if (stub.id === 'TRAP_TO_HAND') {
    const allTrapsTTH = (ctx.ownerState.field.signi_traps ?? [null, null, null]);
    const trapsToHandTTH = allTrapsTTH.filter(Boolean) as string[];
    if (trapsToHandTTH.length === 0) return done(addLog(ctx, 'トラップなし'));
    // テキストで枚数制限を確認
    const srcTTH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTTH = srcTTH ? (srcTTH.EffectText ?? '') + ' ' + (srcTTH.BurstText ?? '') : '';
    const toHWTTH = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const cntMTTH = txtTTH.match(/【トラップ】を([０-９\d]+)枚まで手札に加える/);
    const maxCountTTH = cntMTTH ? parseInt(toHWTTH(cntMTTH[1])) : trapsToHandTTH.length;
    // 「N枚まで」指定があり複数トラップがある場合は選択UI
    if (maxCountTTH < trapsToHandTTH.length && trapsToHandTTH.length > 1) {
      return needsInteraction(addLog(ctx, `手札に加えるトラップを${maxCountTTH}枚まで選択`), {
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
    return done(addLog({ ...ctx, ownerState: newOwnerTTH }, `トラップ${takeTTH.length}枚を手札へ`));
  }
  // INTERNAL_TTH_APPLY: TRAP_TO_HAND選択完了後の適用
  if (stub.id === 'INTERNAL_TTH_APPLY') {
    const selectedTTH = ctx.lastProcessedCards ?? [];
    if (selectedTTH.length === 0) return done(addLog(ctx, 'トラップ未選択'));
    const currentTrapsTTH = ctx.ownerState.field.signi_traps ?? [null, null, null];
    const newTrapsTTH2 = currentTrapsTTH.map(t => (t && selectedTTH.includes(t) ? null : t)) as (string | null)[];
    const newOwnerTTH2 = { ...ctx.ownerState, hand: [...ctx.ownerState.hand, ...selectedTTH], field: { ...ctx.ownerState.field, signi_traps: newTrapsTTH2 } };
    return done(addLog({ ...ctx, ownerState: newOwnerTTH2 }, `トラップ${selectedTTH.length}枚を手札へ`));
  }
  // ACTIVATE_TRAP / ACTIVATE_TRAP_IN_FIELD: トラップを表向きにしてTRAP_ICON効果を発動
  if (stub.id === 'ACTIVATE_TRAP' || stub.id === 'ACTIVATE_TRAP_IN_FIELD') {
    const trapsAT: (string | null)[] = ctx.ownerState.field.signi_traps ?? [null, null, null];
    // lastProcessedCardsに指定があればそのトラップを優先、なければ最初のトラップ
    const selectedAT = ctx.lastProcessedCards?.[0];
    let firstTrapIdxAT = selectedAT ? trapsAT.findIndex(t => t === selectedAT) : -1;
    if (firstTrapIdxAT < 0) firstTrapIdxAT = trapsAT.findIndex((t: string | null) => t !== null);
    if (firstTrapIdxAT < 0) return done(addLog(ctx, 'トラップなし'));
    const trapCardAT = trapsAT[firstTrapIdxAT]!;
    const newTrapsAT = [...trapsAT] as (string | null)[];
    newTrapsAT[firstTrapIdxAT] = null;
    // トラップカードをトラッシュへ移動した状態を基点に
    const newOwnerAT = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, trapCardAT], field: { ...ctx.ownerState.field, signi_traps: newTrapsAT } };
    const loggedCtxAT = addLog({ ...ctx, ownerState: newOwnerAT, sourceCardNum: trapCardAT }, `トラップ発動: ゾーン${firstTrapIdxAT + 1}（${ctx.cardMap.get(trapCardAT)?.CardName ?? trapCardAT}）`);
    // TRAP_ICON効果を解析して実行
    const trapDataAT = ctx.cardMap.get(trapCardAT);
    if (trapDataAT) {
      const trapEffsAT = parseCardEffects(trapDataAT);
      const trapIconEffAT = trapEffsAT.find(e => e.effectType === 'TRAP_ICON');
      if (trapIconEffAT) return exec(trapIconEffAT.action, loggedCtxAT);
    }
    return done(loggedCtxAT);
  }
  // SET_OPP_SIGNI_AS_TRAP: 相手のシグニ1体をトラップとして設置
  if (stub.id === 'SET_OPP_SIGNI_AS_TRAP') {
    const oppSigniCandsSSOSAT = (ctx.otherState.field.signi.map((s, zi) => s?.at(-1) ? { instId: s.at(-1)!, zi } : null).filter(Boolean)) as Array<{ instId: string; zi: number }>;
    if (oppSigniCandsSSOSAT.length === 0) return done(addLog(ctx, 'SET_OPP_SIGNI_AS_TRAP: 相手シグニなし'));
    return needsInteraction(addLog(ctx, '相手のシグニを選択（トラップ化）'), {
      type: 'SELECT_TARGET',
      candidates: oppSigniCandsSSOSAT.map(x => x.instId),
      count: 1,
      optional: false,
      targetScope: 'opp_field',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_OPP_SIGNI_TO_TRAP' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_OPP_SIGNI_TO_TRAP: 選択した相手シグニをトラップゾーンへ
  if (stub.id === 'INTERNAL_OPP_SIGNI_TO_TRAP') {
    const targetIOSTT = ctx.lastProcessedCards?.[0] ?? null;
    if (!targetIOSTT) return done(addLog(ctx, 'INTERNAL_OPP_SIGNI_TO_TRAP: 対象なし'));
    let zoneIdxIOSTT = -1;
    for (let zi = 0; zi < 3; zi++) {
      if ((ctx.otherState.field.signi[zi] ?? []).includes(targetIOSTT)) { zoneIdxIOSTT = zi; break; }
    }
    if (zoneIdxIOSTT < 0) return done(addLog(ctx, 'INTERNAL_OPP_SIGNI_TO_TRAP: ゾーン特定失敗'));
    const newOppSigniIOSTT = [...ctx.otherState.field.signi] as (string[] | null)[];
    newOppSigniIOSTT[zoneIdxIOSTT] = null;
    const newOppTrapsIOSTT = [...(ctx.otherState.field.signi_traps ?? [null, null, null])] as (string | null)[];
    const newOppTrashIOSTT = [...ctx.otherState.trash];
    if (newOppTrapsIOSTT[zoneIdxIOSTT]) newOppTrashIOSTT.push(newOppTrapsIOSTT[zoneIdxIOSTT]!);
    newOppTrapsIOSTT[zoneIdxIOSTT] = targetIOSTT;
    const newOtherIOSTT = { ...ctx.otherState, trash: newOppTrashIOSTT, field: { ...ctx.otherState.field, signi: newOppSigniIOSTT, signi_traps: newOppTrapsIOSTT } };
    return done(addLog({ ...ctx, otherState: newOtherIOSTT }, `相手シグニ→トラップ: ゾーン${zoneIdxIOSTT + 1}`));
  }
  // TRAP_TO_SIGNI_IF_ZONE_EMPTY: このカードのゾーンにシグニがない場合、signi_traps[zone]→signi[zone]
  if (stub.id === 'TRAP_TO_SIGNI_IF_ZONE_EMPTY') {
    const srcCardTTSIZE = ctx.sourceCardNum ?? null;
    if (!srcCardTTSIZE) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: sourceCardNumなし'));
    let zoneIdxTTSIZE = -1;
    for (let zi = 0; zi < 3; zi++) {
      const trapsArr = ctx.ownerState.field.signi_traps ?? [null, null, null];
      if (trapsArr[zi] === srcCardTTSIZE || (ctx.ownerState.field.signi[zi] ?? []).includes(srcCardTTSIZE)) {
        zoneIdxTTSIZE = zi; break;
      }
    }
    if (zoneIdxTTSIZE < 0) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: ゾーン特定失敗'));
    if (ctx.ownerState.field.signi[zoneIdxTTSIZE]?.length) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: ゾーンにシグニあり'));
    const trapCardTTSIZE = (ctx.ownerState.field.signi_traps ?? [])[zoneIdxTTSIZE];
    if (!trapCardTTSIZE) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: トラップなし'));
    const newSigniTTSIZE = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniTTSIZE[zoneIdxTTSIZE] = [trapCardTTSIZE];
    const newTrapsTTSIZE = [...(ctx.ownerState.field.signi_traps ?? [null, null, null])] as (string | null)[];
    newTrapsTTSIZE[zoneIdxTTSIZE] = null;
    const newOwnerTTSIZE = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniTTSIZE, signi_traps: newTrapsTTSIZE } };
    return done(addLog({ ...ctx, ownerState: newOwnerTTSIZE }, `トラップ→シグニ: ゾーン${zoneIdxTTSIZE + 1}`));
  }
  // PLACE_TRAP_FROM_REVEALED: 前のLOOK_AND_REORDERで公開されたデッキ上N枚からトラップ設置
  if (stub.id === 'PLACE_TRAP_FROM_REVEALED') {
    const srcPTFR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPTFR = srcPTFR ? (srcPTFR.EffectText ?? '') + ' ' + (srcPTFR.BurstText ?? '') : '';
    const toHWPTFR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 公開枚数をテキストから解析（デフォルト2枚）
    const cntMPTFR = txtPTFR.match(/カードを([０-９\d]+)枚見る/);
    const revealCountPTFR = cntMPTFR ? parseInt(toHWPTFR(cntMPTFR[1])) : 2;
    // デッキ上から公開カードを取得
    const topCardsPTFR = ctx.ownerState.deck.slice(0, revealCountPTFR);
    if (topCardsPTFR.length === 0) return done(addLog(ctx, 'PLACE_TRAP_FROM_REVEALED: デッキなし'));
    // 公開カードをデッキから除去した状態でSEARCHを提示
    const deckWithoutPTFR = ctx.ownerState.deck.slice(revealCountPTFR);
    const ctxPTFR = { ...ctx, ownerState: { ...ctx.ownerState, deck: deckWithoutPTFR } };
    const noopPTFR: SequenceAction = { type: 'SEQUENCE', steps: [] };
    const contPTFR: StubAction = { type: 'STUB', id: 'INTERNAL_PTFR_CHOOSE_ZONE' };
    return needsInteraction(
      addLog(ctxPTFR, `デッキ公開${topCardsPTFR.length}枚からトラップを選択（任意）`),
      {
        type: 'SEARCH', visibleCards: topCardsPTFR, maxPick: 1,
        thenAction: noopPTFR as EffectAction,
        continuation: contPTFR as EffectAction,
        restDest: 'deck_bottom',  // 未選択カードはデッキ下へ
      },
    );
  }
  // INTERNAL_PTFR_CHOOSE_ZONE: PLACE_TRAP_FROM_REVEALED用のゾーン選択
  if (stub.id === 'INTERNAL_PTFR_CHOOSE_ZONE') {
    const selectedPTFR = ctx.lastProcessedCards?.[0];
    if (!selectedPTFR) return done(addLog(ctx, 'トラップ設置スキップ（選択なし）'));
    const zoneOptsPTFR = [0, 1, 2].map(zi => ({
      id: `ptfr_zone_${zi}`,
      label: `ゾーン${zi + 1}にトラップ設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(
      addLog({ ...ctx, lastProcessedCards: [selectedPTFR] },
        `${ctx.cardMap.get(selectedPTFR)?.CardName ?? selectedPTFR}をトラップとしてゾーン選択`),
      { type: 'CHOOSE', options: zoneOptsPTFR, count: 1 },
    );
  }
  // TRAP_OP: ソースカードのテキストに応じて操作判定
  if (stub.id === 'TRAP_OP') {
    const srcTRAPOP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTRAPOP = srcTRAPOP ? (srcTRAPOP.EffectText ?? '') + ' ' + (srcTRAPOP.BurstText ?? '') : '';
    // トラップアイコン発動：ACTIVATE_TRAPと同一ロジック（parseCardEffects経由でTRAP_ICON実行）
    if (txtTRAPOP.includes('トラップアイコン') && (txtTRAPOP.includes('発動') || txtTRAPOP.includes('発動させる'))) {
      const trapsIconAT: (string | null)[] = ctx.ownerState.field.signi_traps ?? [null, null, null];
      const firstIdxIconAT = trapsIconAT.findIndex((t: string | null) => t !== null);
      if (firstIdxIconAT < 0) return done(addLog(ctx, 'トラップなし（トラップアイコン発動）'));
      const trapCardIconAT = trapsIconAT[firstIdxIconAT]!;
      const newTrapsIconAT = [...trapsIconAT] as (string | null)[];
      newTrapsIconAT[firstIdxIconAT] = null;
      const newOwnerIconAT = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, trapCardIconAT], field: { ...ctx.ownerState.field, signi_traps: newTrapsIconAT } };
      const loggedIconAT = addLog({ ...ctx, ownerState: newOwnerIconAT, sourceCardNum: trapCardIconAT }, `トラップアイコン発動: ${ctx.cardMap.get(trapCardIconAT)?.CardName ?? trapCardIconAT}`);
      const trapDataIconAT = ctx.cardMap.get(trapCardIconAT);
      if (trapDataIconAT) {
        const trapEffsIconAT = parseCardEffects(trapDataIconAT);
        const trapIconEffAT = trapEffsIconAT.find(e => e.effectType === 'TRAP_ICON');
        if (trapIconEffAT) return exec(trapIconEffAT.action, loggedIconAT);
      }
      return done(loggedIconAT);
    }
    if (txtTRAPOP.includes('トラッシュに置く') || txtTRAPOP.includes('トラッシュへ置く')) {
      const trapsTO: (string | null)[] = ctx.ownerState.field.signi_traps ?? [null, null, null];
      const firstIdxTO = trapsTO.findIndex((t: string | null) => t !== null);
      if (firstIdxTO < 0) return done(addLog(ctx, 'トラップなし'));
      const trapCardTO = trapsTO[firstIdxTO]!;
      const newTrapsTO = [...trapsTO] as (string | null)[];
      newTrapsTO[firstIdxTO] = null;
      const newOwnerTO = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, trapCardTO], field: { ...ctx.ownerState.field, signi_traps: newTrapsTO } };
      return done(addLog({ ...ctx, ownerState: newOwnerTO }, `トラップをトラッシュへ`));
    }
    if (txtTRAPOP.includes('手札から') && (txtTRAPOP.includes('設置') || txtTRAPOP.includes('トラップ'))) {
      if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, 'トラップ設置：手札なし'));
      const zoneOptsTRAPOP = [0, 1, 2].map(zi => ({
        id: `zone_${zi}`,
        label: `ゾーン${zi + 1}に設置`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, 'トラップにするカードを選択'), {
        type: 'SELECT_TARGET',
        candidates: ctx.ownerState.hand,
        count: 1,
        optional: false,
        targetScope: 'self_hand',
        thenAction: ({ type: 'STUB', id: 'CHOOSE_TRAP_ZONE' } as StubAction) as EffectAction,
        continuation: ({ type: 'CHOOSE', choose_count: 1, from_count: 3, choices: zoneOptsTRAPOP.map(o => ({ choiceId: o.id, label: o.label, action: o.action })) } as ChooseAction) as EffectAction,
      });
    }
    // 「その中から」パターン: lastProcessedCardsのカードをトラップとして設置
    if (ctx.lastProcessedCards?.length) {
      const zoneOptsTRAPOP3 = [0, 1, 2].map(zi => ({
        id: `trapop3_zone_${zi}`,
        label: `ゾーン${zi + 1}にトラップ設置`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, `${ctx.cardMap.get(ctx.lastProcessedCards[0])?.CardName ?? ctx.lastProcessedCards[0]}をトラップとして設置するゾーンを選択`), {
        type: 'CHOOSE', options: zoneOptsTRAPOP3, count: 1,
      });
    }
    return done(addLog(ctx, '[トラップ操作]'));
  }
  // TRAP_OPERATION: トラップ/チェックゾーン操作の統合ハンドラ
  if (stub.id === 'TRAP_OPERATION') {
    const srcTRAPOPER = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTRAPOPER = srcTRAPOPER ? (srcTRAPOPER.EffectText ?? '') + ' ' + (srcTRAPOPER.BurstText ?? '') : '';
    // チェックゾーンに置く: lastProcessedCards[0] を field.check に設置
    if (txtTRAPOPER.includes('チェックゾーンに置') || txtTRAPOPER.includes('チェックゾーンへ')) {
      const cardToCheckTO = ctx.lastProcessedCards?.[0] ?? (ctx.ownerState.deck.length > 0 ? ctx.ownerState.deck[0] : null);
      if (!cardToCheckTO) return done(addLog(ctx, '[チェックゾーン：対象カードなし]'));
      const newDeckCKTO = ctx.ownerState.deck[0] === cardToCheckTO ? ctx.ownerState.deck.slice(1) : ctx.ownerState.deck;
      const newHandCKTO = ctx.ownerState.hand.filter(c => c !== cardToCheckTO);
      const newOwnerCKTO = { ...ctx.ownerState, deck: newDeckCKTO, hand: newHandCKTO, field: { ...ctx.ownerState.field, check: cardToCheckTO } };
      return done(addLog({ ...ctx, ownerState: newOwnerCKTO }, `${ctx.cardMap.get(cardToCheckTO)?.CardName ?? cardToCheckTO}をチェックゾーンへ`));
    }
    const cardToTrapTO = ctx.lastProcessedCards?.[0];
    if (cardToTrapTO) {
      // lastProcessedCards[0] をトラップとして設置（ゾーン選択）
      const zoneOptsTRAPOP = [0, 1, 2].map(zi => ({
        id: `trapop_zone_${zi}`,
        label: `ゾーン${zi + 1}にトラップ設置`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(
        addLog({ ...ctx, lastProcessedCards: [cardToTrapTO] }, `${ctx.cardMap.get(cardToTrapTO)?.CardName ?? cardToTrapTO}をトラップとして設置`),
        { type: 'CHOOSE', options: zoneOptsTRAPOP, count: 1 }
      );
    }
    // lastProcessedCardsなし：デッキ上1枚を手札に加える（デッキ上確認後のトラップ設置が多い）
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, '[トラップ操作：デッキなし]'));
    const topCardTO = ctx.ownerState.deck[0];
    const newDeckTO = ctx.ownerState.deck.slice(1);
    const newOwnerTO = { ...ctx.ownerState, deck: newDeckTO };
    const zoneOptsTRAPOP2 = [0, 1, 2].map(zi => ({
      id: `trapop2_zone_${zi}`,
      label: `ゾーン${zi + 1}にトラップ設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    zoneOptsTRAPOP2.push({
      id: 'trapop2_skip', label: 'スキップ（手札に加える）',
      action: ({ type: 'ADD_TO_HAND', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } as unknown) as EffectAction,
      available: true,
    });
    return needsInteraction(
      addLog({ ...ctx, ownerState: newOwnerTO, lastProcessedCards: [topCardTO] },
        `デッキ上${ctx.cardMap.get(topCardTO)?.CardName ?? topCardTO}：トラップ設置？`),
      { type: 'CHOOSE', options: zoneOptsTRAPOP2, count: 1 }
    );
  }
  // ─── シード系 ────────────────────────────────────────────────────────────
  // PLACE_SEED_FROM_REVEALED: デッキ上4枚を見て1枚を【シード】として設置
  if (stub.id === 'PLACE_SEED_FROM_REVEALED') {
    const topCardsPSFR = ctx.ownerState.deck.slice(0, 4);
    if (topCardsPSFR.length === 0) return done(addLog(ctx, 'PLACE_SEED_FROM_REVEALED: デッキなし'));
    return needsInteraction(addLog(ctx, '【シード】として設置するカードを選択（任意）'), {
      type: 'SEARCH',
      visibleCards: topCardsPSFR,
      maxPick: 1,
      thenAction: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction,
      continuation: ({ type: 'STUB', id: 'INTERNAL_SEED_FROM_DECK' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_SEED_FROM_DECK: SEARCHで選択したカードをデッキから取り出してゾーン選択
  if (stub.id === 'INTERNAL_SEED_FROM_DECK') {
    const pickedISD = ctx.lastProcessedCards?.[0];
    if (!pickedISD) return done(addLog(ctx, 'シード設置：未選択'));
    const newDeckISD = ctx.ownerState.deck.filter(c => c !== pickedISD);
    const newOwnerISD = { ...ctx.ownerState, deck: newDeckISD };
    const zoneOptsISD = [0, 1, 2].map(zi => ({
      id: `seed_zone_${zi}`,
      label: `ゾーン${zi + 1}にシード設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerISD }, 'シード設置ゾーンを選択'), {
      type: 'CHOOSE', options: zoneOptsISD, count: 1,
    });
  }
  // INTERNAL_SET_SEED: lastProcessedCards[0]を指定ゾーンにシード設置
  if (stub.id === 'INTERNAL_SET_SEED') {
    const zoneIdxISS = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const seedCardISS = ctx.lastProcessedCards?.[0] ?? null;
    if (!seedCardISS) return done(addLog(ctx, 'シード設置：対象カードなし'));
    const currentSeedsISS = [...(ctx.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
    const newTrashISS = [...ctx.ownerState.trash];
    if (currentSeedsISS[zoneIdxISS]) newTrashISS.push(currentSeedsISS[zoneIdxISS]!);
    currentSeedsISS[zoneIdxISS] = seedCardISS;
    // 手札にあれば手札からも除去（手札から設置するケース）
    const newHandISS = ctx.ownerState.hand.filter(c => c !== seedCardISS);
    const newOwnerISS = { ...ctx.ownerState, hand: newHandISS, trash: newTrashISS, field: { ...ctx.ownerState.field, signi_seeds: currentSeedsISS } };
    return done(addLog({ ...ctx, ownerState: newOwnerISS }, `シード設置: ゾーン${zoneIdxISS + 1}`));
  }
  // SEED_BLOOM: シード1枚（または好きな枚数）を開花する
  // SEED_BLOOM_OPTIONAL: 任意でシード1枚を開花する
  if (stub.id === 'SEED_BLOOM' || stub.id === 'SEED_BLOOM_OPTIONAL') {
    const seedsSB = ctx.ownerState.field.signi_seeds ?? [null, null, null];
    const availableZonesSB = [0, 1, 2].filter(zi => seedsSB[zi] !== null);
    if (availableZonesSB.length === 0) return done(addLog(ctx, 'シード開花：シードなし'));
    // 「好きな枚数」全開花パターン
    const srcSB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSB = srcSB ? (srcSB.EffectText ?? '') + ' ' + (srcSB.BurstText ?? '') : '';
    if (txtSB.includes('好きな枚数')) {
      let curSB = ctx;
      const bloomedCardsSB: string[] = [];
      for (const zi of [0, 1, 2]) {
        const s = (curSB.ownerState.field.signi_seeds ?? [null, null, null])[zi];
        if (!s) continue;
        if (curSB.ownerState.field.signi[zi]?.length) { curSB = addLog(curSB, `開花：ゾーン${zi + 1}シグニあり`); continue; }
        const sd = curSB.cardMap.get(s);
        const newSeeds2 = [...(curSB.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
        newSeeds2[zi] = null;
        if (!sd || sd.Type !== 'シグニ') {
          curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, trash: [...curSB.ownerState.trash, s], field: { ...curSB.ownerState.field, signi_seeds: newSeeds2 } } }, `開花：シグニ以外→トラッシュ`);
          continue;
        }
        const lrigInst2 = curSB.ownerState.field.lrig.at(-1);
        const lrigCard2 = lrigInst2 ? curSB.cardMap.get(lrigInst2) : null;
        const lrigLv2 = parseInt(lrigCard2?.Level ?? '0', 10);
        const signiLv2 = parseInt(sd.Level ?? '0', 10);
        if (signiLv2 > lrigLv2) {
          curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, trash: [...curSB.ownerState.trash, s], field: { ...curSB.ownerState.field, signi_seeds: newSeeds2 } } }, `開花：${sd.CardName}レベル超過→トラッシュ`);
          continue;
        }
        const lrigLim2 = parseInt(lrigCard2?.Limit ?? '0', 10);
        let usedLim2 = 0;
        for (let zj = 0; zj < 3; zj++) { if (zj !== zi) { const top2 = curSB.ownerState.field.signi[zj]?.at(-1); if (top2) usedLim2 += parseInt(curSB.cardMap.get(top2)?.Level ?? '0', 10); } }
        if (usedLim2 + signiLv2 > lrigLim2) {
          curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, trash: [...curSB.ownerState.trash, s], field: { ...curSB.ownerState.field, signi_seeds: newSeeds2 } } }, `開花：${sd.CardName}リミット超過→トラッシュ`);
          continue;
        }
        const newSig2 = [...curSB.ownerState.field.signi] as (string[] | null)[];
        newSig2[zi] = [s];
        bloomedCardsSB.push(s);
        curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, field: { ...curSB.ownerState.field, signi: newSig2, signi_seeds: newSeeds2 } } }, `開花：${sd.CardName}がゾーン${zi + 1}に出た`);
      }
      const doneAllSB = done(curSB) as { done: true; ownerState: PlayerState; otherState: PlayerState; logs: string[] };
      return bloomedCardsSB.length > 0 ? { ...doneAllSB, lastProcessedCards: bloomedCardsSB } : doneAllSB;
    }
    const optional = stub.id === 'SEED_BLOOM_OPTIONAL';
    const zoneOptsSB = availableZonesSB.map(zi => {
      const seedName = ctx.cardMap.get(seedsSB[zi]!)?.CardName ?? seedsSB[zi]!;
      return {
        id: `bloom_zone_${zi}`,
        label: `ゾーン${zi + 1}（${seedName}）を開花`,
        action: ({ type: 'STUB', id: 'INTERNAL_BLOOM_SEED', value: zi } as StubAction) as EffectAction,
        available: true,
      };
    });
    if (optional) {
      zoneOptsSB.push({ id: 'bloom_skip', label: 'スキップ', action: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction, available: true });
    }
    return needsInteraction(addLog(ctx, '開花するシードを選択'), {
      type: 'CHOOSE', options: zoneOptsSB, count: 1,
    });
  }
  // INTERNAL_BLOOM_SEED: 指定ゾーンのシードを開花する
  if (stub.id === 'INTERNAL_BLOOM_SEED') {
    const zoneIdxIBS = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const seedCardIBS = (ctx.ownerState.field.signi_seeds ?? [null, null, null])[zoneIdxIBS];
    if (!seedCardIBS) return done(addLog(ctx, `開花：ゾーン${zoneIdxIBS + 1}にシードなし`));
    const newSeedsIBS = [...(ctx.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
    newSeedsIBS[zoneIdxIBS] = null;
    // 同ゾーンにシグニがある場合は開花しない
    const signiStackIBS = ctx.ownerState.field.signi[zoneIdxIBS];
    if (signiStackIBS?.length) {
      const newOwnerSkip = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerSkip }, `開花：ゾーン${zoneIdxIBS + 1}にシグニあり（開花不可）`));
    }
    const seedCardDataIBS = ctx.cardMap.get(seedCardIBS);
    // シグニ以外はトラッシュへ
    if (!seedCardDataIBS || seedCardDataIBS.Type !== 'シグニ') {
      const newOwnerIBS = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, seedCardIBS], field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerIBS }, `開花：シグニでないためトラッシュへ`));
    }
    // ルリグレベルチェック
    const lrigInstIBS = ctx.ownerState.field.lrig.at(-1);
    const lrigCardIBS = lrigInstIBS ? ctx.cardMap.get(lrigInstIBS) : null;
    const lrigLevelIBS = parseInt(lrigCardIBS?.Level ?? '0', 10);
    const signiLevelIBS = parseInt(seedCardDataIBS.Level ?? '0', 10);
    if (signiLevelIBS > lrigLevelIBS) {
      const newOwnerIBS = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, seedCardIBS], field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerIBS }, `開花：${seedCardDataIBS.CardName}レベル${signiLevelIBS}超過でトラッシュへ`));
    }
    // リミットチェック（他ゾーンのシグニレベル合計 + このシグニのレベル > ルリグのリミット）
    const lrigLimitIBS = parseInt(lrigCardIBS?.Limit ?? '0', 10);
    let usedLimitIBS = 0;
    for (let zi = 0; zi < 3; zi++) {
      if (zi === zoneIdxIBS) continue;
      const topInstZI = ctx.ownerState.field.signi[zi]?.at(-1);
      if (topInstZI) usedLimitIBS += parseInt(ctx.cardMap.get(topInstZI)?.Level ?? '0', 10);
    }
    if (usedLimitIBS + signiLevelIBS > lrigLimitIBS) {
      const newOwnerIBS = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, seedCardIBS], field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerIBS }, `開花：${seedCardDataIBS.CardName}リミット超過でトラッシュへ`));
    }
    // 場に出す。lastProcessedCards にセットし BattleScreen が ON_PLAY 効果を積む
    const newSigniIBS = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniIBS[zoneIdxIBS] = [seedCardIBS];
    const newOwnerIBS = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniIBS, signi_seeds: newSeedsIBS } };
    const doneCtxIBS = addLog({ ...ctx, ownerState: newOwnerIBS }, `開花：${seedCardDataIBS.CardName}がゾーン${zoneIdxIBS + 1}に出た`);
    return { ...(done(doneCtxIBS) as { done: true; ownerState: PlayerState; otherState: PlayerState; logs: string[] }), lastProcessedCards: [seedCardIBS] };
  }
  // SEED_HAND_AND_BLOOM_FROM_DECK_TOP: シード1枚を手札に加え、デッキ上をシード設置
  if (stub.id === 'SEED_HAND_AND_BLOOM_FROM_DECK_TOP') {
    const seedsSHAB = ctx.ownerState.field.signi_seeds ?? [null, null, null];
    const availSHAB = [0, 1, 2].filter(zi => seedsSHAB[zi] !== null);
    if (availSHAB.length === 0) return done(addLog(ctx, 'SEED_HAND_AND_BLOOM_FROM_DECK_TOP: シードなし'));
    const optsSHAB = availSHAB.map(zi => {
      const seedName = ctx.cardMap.get(seedsSHAB[zi]!)?.CardName ?? seedsSHAB[zi]!;
      return {
        id: `shabfdt_${zi}`,
        label: `ゾーン${zi + 1}（${seedName}）を手札に`,
        action: ({ type: 'STUB', id: 'INTERNAL_SEED_TO_HAND_THEN_DECK_TOP', value: zi } as StubAction) as EffectAction,
        available: true,
      };
    });
    return needsInteraction(addLog(ctx, '手札に加えるシードを選択'), {
      type: 'CHOOSE', options: optsSHAB, count: 1,
    });
  }
  // INTERNAL_SEED_TO_HAND_THEN_DECK_TOP: 指定ゾーンのシードを手札に加えてデッキ上をシード設置
  if (stub.id === 'INTERNAL_SEED_TO_HAND_THEN_DECK_TOP') {
    const zoneIdxISTH = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const seedsISTH = [...(ctx.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
    const seedCardISTH = seedsISTH[zoneIdxISTH];
    if (!seedCardISTH) return done(addLog(ctx, 'INTERNAL_SEED_TO_HAND_THEN_DECK_TOP: シードなし'));
    seedsISTH[zoneIdxISTH] = null;
    const newHandISTH = [...ctx.ownerState.hand, seedCardISTH];
    let newOwnerISTH = { ...ctx.ownerState, hand: newHandISTH, field: { ...ctx.ownerState.field, signi_seeds: seedsISTH } };
    if (newOwnerISTH.deck.length === 0) return done(addLog({ ...ctx, ownerState: newOwnerISTH }, `${ctx.cardMap.get(seedCardISTH)?.CardName}を手札へ・デッキなし`));
    const topCardISTH = newOwnerISTH.deck[0];
    const newDeckISTH = newOwnerISTH.deck.slice(1);
    newOwnerISTH = { ...newOwnerISTH, deck: newDeckISTH };
    const zoneOptsISTH = [0, 1, 2].map(zi => ({
      id: `isth_zone_${zi}`,
      label: `ゾーン${zi + 1}にシード設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerISTH, lastProcessedCards: [topCardISTH] }, `デッキ上${ctx.cardMap.get(topCardISTH)?.CardName ?? topCardISTH}をシード設置`), {
      type: 'CHOOSE', options: zoneOptsISTH, count: 1,
    });
  }
  // SEED_FLOWER_OP: 別シード1枚を開花してデッキ上をシード設置（ヤマレンゲ系）
  if (stub.id === 'SEED_FLOWER_OP') {
    const seedsSFO = ctx.ownerState.field.signi_seeds ?? [null, null, null];
    const availSFO = [0, 1, 2].filter(zi => seedsSFO[zi] !== null);
    if (availSFO.length === 0) return done(addLog(ctx, 'SEED_FLOWER_OP: シードなし'));
    const optsSFO = availSFO.map(zi => {
      const seedName = ctx.cardMap.get(seedsSFO[zi]!)?.CardName ?? seedsSFO[zi]!;
      return {
        id: `sfo_zone_${zi}`,
        label: `ゾーン${zi + 1}（${seedName}）を開花`,
        // 開花してからデッキ上をシード設置
        action: ({ type: 'SEQUENCE', steps: [
          { type: 'STUB', id: 'INTERNAL_BLOOM_SEED', value: zi } as StubAction,
          { type: 'STUB', id: 'INTERNAL_SEED_FROM_DECK_TOP_PLACE' } as StubAction,
        ] } as SequenceAction) as EffectAction,
        available: true,
      };
    });
    return needsInteraction(addLog(ctx, '開花するシードを選択（ヤマレンゲ効果）'), {
      type: 'CHOOSE', options: optsSFO, count: 1,
    });
  }
  // INTERNAL_SEED_FROM_DECK_TOP_PLACE: デッキ上1枚をシードとして設置
  if (stub.id === 'INTERNAL_SEED_FROM_DECK_TOP_PLACE') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'INTERNAL_SEED_FROM_DECK_TOP_PLACE: デッキなし'));
    const topCardSFDTP = ctx.ownerState.deck[0];
    const newDeckSFDTP = ctx.ownerState.deck.slice(1);
    const newOwnerSFDTP = { ...ctx.ownerState, deck: newDeckSFDTP };
    const zoneOptsSFDTP = [0, 1, 2].map(zi => ({
      id: `sfdtp_zone_${zi}`,
      label: `ゾーン${zi + 1}にシード設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerSFDTP, lastProcessedCards: [topCardSFDTP] }, `デッキ上${ctx.cardMap.get(topCardSFDTP)?.CardName ?? topCardSFDTP}をシード設置`), {
      type: 'CHOOSE', options: zoneOptsSFDTP, count: 1,
    });
  }
  // BLOOM_CHOOSE: 開花したとき選択効果（個別効果テキスト依存）
  if (stub.id === 'BLOOM_CHOOSE') {
    return done(addLog(ctx, `[開花時選択効果: ${ctx.sourceCardNum}]`));
  }
  // 裏向き系（face_down_signi + abilities_removed で近似実装済み）
  // REMOVE_SIGNI_ZONE: 対戦相手のシグニゾーンを1つ削除
  if (stub.id === 'REMOVE_SIGNI_ZONE') {
    // 対戦相手のゾーン選択（CHOOSEインタラクション）
    const oppZoneOptionsRSZ = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `相手ゾーン${zi + 1}を削除`,
      action: ({ type: 'STUB', id: 'INTERNAL_REMOVE_SIGNI_ZONE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '削除する対戦相手のシグニゾーンを選択'), {
      type: 'CHOOSE', options: oppZoneOptionsRSZ, count: 1,
    });
  }
  // INTERNAL_REMOVE_SIGNI_ZONE: 選択したゾーンを削除してシグニをトラッシュへ
  if (stub.id === 'INTERNAL_REMOVE_SIGNI_ZONE') {
    const zoneIdxIRSZ = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const oppStackIRSZ = ctx.otherState.field.signi[zoneIdxIRSZ] ?? [];
    // そのゾーンのシグニをすべてトラッシュへ
    let newOtherIRSZ = ctx.otherState;
    for (const cn of oppStackIRSZ) {
      const removed = removeFromField(cn, newOtherIRSZ);
      newOtherIRSZ = { ...removed, trash: [...removed.trash, cn] };
    }
    // ゾーンを無効化
    const newDisabledIRSZ = [...(newOtherIRSZ.disabled_signi_zones ?? [])];
    if (!newDisabledIRSZ.includes(zoneIdxIRSZ)) newDisabledIRSZ.push(zoneIdxIRSZ);
    newOtherIRSZ = { ...newOtherIRSZ, disabled_signi_zones: newDisabledIRSZ };
    return done(addLog({ ...ctx, otherState: newOtherIRSZ },
      `相手ゾーン${zoneIdxIRSZ + 1}を削除（${oppStackIRSZ.length}体トラッシュ）`));
  }
  // DESIGNATE_SIGNI_ZONE: 相手シグニゾーンを1つ指定する
  if (stub.id === 'DESIGNATE_SIGNI_ZONE') {
    const zoneOptsDSZ = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `ゾーン${zi + 1}を指定`,
      action: ({ type: 'STUB', id: 'INTERNAL_DESIGNATE_ZONE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '指定する相手シグニゾーンを選択'), {
      type: 'CHOOSE', options: zoneOptsDSZ, count: 1,
    });
  }
  // INTERNAL_DESIGNATE_ZONE: 選択したゾーンを相手Stateに保存
  if (stub.id === 'INTERNAL_DESIGNATE_ZONE') {
    const zoneIdxIDZ = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const newOtherIDZ = { ...ctx.otherState, designated_zone: zoneIdxIDZ };
    return done(addLog({ ...ctx, otherState: newOtherIDZ }, `相手ゾーン${zoneIdxIDZ + 1}を指定`));
  }
  // BLOCK_OPP_ZONE_PLACEMENT: 指定ゾーンへの配置を禁止（disabled_signi_zones に追加）
  if (stub.id === 'BLOCK_OPP_ZONE_PLACEMENT') {
    const zoneIdxBOZP = ctx.otherState.designated_zone ?? 0;
    const currentDisabledBOZP = [...(ctx.otherState.disabled_signi_zones ?? [])];
    if (!currentDisabledBOZP.includes(zoneIdxBOZP)) currentDisabledBOZP.push(zoneIdxBOZP);
    const newOtherBOZP = { ...ctx.otherState, disabled_signi_zones: currentDisabledBOZP };
    return done(addLog({ ...ctx, otherState: newOtherBOZP }, `相手ゾーン${zoneIdxBOZP + 1}へのシグニ配置を禁止`));
  }
  // ARTS_EXTRA_COST_CONDITION: 追加コスト支払い済みなら選択肢を増やす
  if (stub.id === 'ARTS_EXTRA_COST_CONDITION') {
    const srcAECC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtAECC = srcAECC ? (srcAECC.EffectText ?? '') : '';
    const extraPaidAECC = ctx.ownerState.self_optional_effect_taken === true;
    // ①②テキストから選択肢を生成
    const toHWAECC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const choicePatsAECC = [/①([^②③]{1,80})/, /②([^③④]{1,80})/];
    const optsAECC: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (let i = 0; i < choicePatsAECC.length; i++) {
      const mat = txtAECC.match(choicePatsAECC[i]);
      if (!mat) continue;
      const ctxtAECC = mat[1].replace(/。\s*$/, '').trim();
      // ①パワー+SHADOW付与
      if (i === 0 && ctxtAECC.match(/パワーを＋([０-９\d]+)/)) {
        const deltaMat = ctxtAECC.match(/パワーを＋([０-９\d]+)/);
        const delta = deltaMat ? parseInt(toHWAECC(deltaMat[1])) : 10000;
        const pmAct: import('../types/effects').PowerModifyAction = {
          type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1 }, delta,
        };
        optsAECC.push({ id: 'aecc_1', label: `①${ctxtAECC.slice(0, 25)}...`, action: pmAct as EffectAction, available: true });
      }
      // ②ダウン
      if (i === 1 && ctxtAECC.match(/ダウン/)) {
        const downAct: import('../types/effects').DownAction = {
          type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: {} },
        };
        optsAECC.push({ id: 'aecc_2', label: `②${ctxtAECC.slice(0, 25)}...`, action: downAct as EffectAction, available: true });
      }
    }
    if (optsAECC.length === 0) return done(addLog(ctx, '[ARTS_EXTRA_COST_CONDITION: 選択肢解析不可]'));
    const countAECC = extraPaidAECC ? Math.min(2, optsAECC.length) : 1;
    return needsInteraction(addLog(ctx, `追加コスト${extraPaidAECC ? '支払済（2つ選択）' : '未払（1つ選択）'}`), {
      type: 'CHOOSE', options: optsAECC, count: countAECC,
    });
  }
  // アーツ条件系（engine: アーツ使用条件未実装）
  if (stub.id === 'ARTS_IMMOVABLE' || stub.id === 'ACCE_COST_REDUCTION') {
    return done(addLog(ctx, `[アーツ/アクセコスト: ${stub.id}]`));
  }
  // ARTS_USE_DISCARD_COLOR_HAND: 手札から特定色のカードを任意N枚まで捨て、コスト軽減（OPTIONAL_DISCARD_CLASS_SIGNI の色版）
  if (stub.id === 'ARTS_USE_DISCARD_COLOR_HAND') {
    const srcAUDCH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtAUDCH = srcAUDCH ? (srcAUDCH.EffectText ?? '') + ' ' + (srcAUDCH.BurstText ?? '') : '';
    const toHWAUDCH = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const colorMatchAUDCH = txtAUDCH.match(/手札から(白|赤|青|緑|黒)のカードを/);
    const targetColor = colorMatchAUDCH?.[1];
    const maxMAUDCH = txtAUDCH.match(/カードを([０-９\d]+)枚まで捨てる/);
    const maxAUDCH = maxMAUDCH ? parseInt(toHWAUDCH(maxMAUDCH[1])) : 3;
    const candsAUDCH = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return !targetColor || (c?.Color ?? '').includes(targetColor);
    });
    if (candsAUDCH.length === 0) return done(addLog(ctx, `手札に${targetColor ?? ''}カードなし（ARTS_USE_DISCARD_COLOR_HAND）`));
    const discardAction: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };
    return selectOrInteract(candsAUDCH, maxAUDCH, true, 'self_hand', discardAction as EffectAction, undefined, ctx);
  }
  // PLAY_SPELL_FREE_IGNORE_RESTRICTION: 手札のスペルをコストなし・限定条件無視で使用
  if (stub.id === 'PLAY_SPELL_FREE_IGNORE_RESTRICTION') {
    const cnPSFIR = ctx.lastProcessedCards?.[0];
    if (!cnPSFIR) {
      // 未選択：手札のスペルを SELECT_TARGET で選ぶ
      const srcPSFIR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
      const txtPSFIR = srcPSFIR ? (srcPSFIR.EffectText ?? '') + ' ' + (srcPSFIR.BurstText ?? '') : '';
      const toHWPSFIR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const costLimitMPSFIR = txtPSFIR.match(/コストの合計が([０-９\d]+)以下/);
      const costLimitPSFIR = costLimitMPSFIR ? parseInt(toHWPSFIR(costLimitMPSFIR[1])) : Infinity;
      const spellCandsPSFIR = ctx.ownerState.hand.filter(cn => {
        const c = ctx.cardMap.get(cn);
        if (!c || c.Type !== 'スペル') return false;
        if (costLimitPSFIR < Infinity) {
          const costArr = Array.isArray(c.Cost) ? c.Cost : [];
          const totalCost = typeof c.Cost === 'string' ? parseInt(c.Cost) || 0 : costArr.length;
          if (totalCost > costLimitPSFIR) return false;
        }
        return true;
      });
      if (spellCandsPSFIR.length === 0) return done(addLog(ctx, '[PLAY_SPELL_FREE_IGNORE_RESTRICTION: 手札に対象スペルなし]'));
      const contPSFIR: StubAction = { type: 'STUB', id: 'PLAY_SPELL_FREE_IGNORE_RESTRICTION' };
      return needsInteraction(addLog(ctx, '手札のスペルを選択（コストなし・限定条件無視）'), {
        type: 'SELECT_TARGET', candidates: spellCandsPSFIR, count: 1, optional: false,
        targetScope: 'self_hand', thenAction: contPSFIR as EffectAction,
      });
    }
    // 選択済み：選んだスペルをトラッシュへ移動して効果実行
    const cardPSFIR = ctx.cardMap.get(cnPSFIR);
    if (!cardPSFIR) return done(addLog(ctx, '[PLAY_SPELL_FREE_IGNORE_RESTRICTION: カードデータなし]'));
    const effectsPSFIR = parseCardEffects(cardPSFIR);
    const mainEffPSFIR = effectsPSFIR.find(e =>
      e.effectType === 'ACTIVATED' || (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY'))
    );
    if (!mainEffPSFIR) return done(addLog(ctx, `[PLAY_SPELL_FREE_IGNORE_RESTRICTION: ${cardPSFIR.CardName}効果なし]`));
    const statePSFIR = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, cnPSFIR],
      hand: ctx.ownerState.hand.filter(c => c !== cnPSFIR),
    };
    return exec(mainEffPSFIR.action,
      addLog({ ...ctx, ownerState: statePSFIR, sourceCardNum: cnPSFIR, lastProcessedCards: [] },
        `${cardPSFIR.CardName}をコストなし・限定条件無視で使用`));
  }
  // CAST_FROM_OPP_TRASH AUTO: lastProcessedCards未設定時は相手トラッシュからスペル選択
  if (stub.id === 'CAST_FROM_OPP_TRASH' && !(ctx.lastProcessedCards?.length)) {
    const spellsInOppTrash = ctx.otherState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'スペル');
    if (spellsInOppTrash.length === 0) return done(addLog(ctx, '[CAST_FROM_OPP_TRASH: 相手トラッシュにスペルなし]'));
    const contCFOT: StubAction = { type: 'STUB', id: 'CAST_FROM_OPP_TRASH' };
    return needsInteraction(addLog(ctx, '相手トラッシュからスペルを選択して使用'), {
      type: 'SELECT_TARGET', candidates: spellsInOppTrash, count: 1, optional: false,
      targetScope: 'opp_trash', thenAction: contCFOT as EffectAction,
    });
  }
  // フリープレイ系：lastProcessedCards[0] のカードをコストなしでプレイ
  if (stub.id === 'PLAY_FREE' || stub.id === 'CAST_FROM_OPP_TRASH'
      || stub.id === 'PLAY_SPELL_FROM_HAND' || stub.id === 'PLAY_SPELL_FROM_HAND_FREE'
      || stub.id === 'USE_SPELL_FROM_TRASH' || stub.id === 'PLAY_EFFECT_TARGET_CLASS_CHANGE') {
    const cnPF = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnPF) return done(addLog(ctx, '[フリープレイ: 対象カードなし]'));
    const cardPF = ctx.cardMap.get(cnPF);
    if (!cardPF) return done(addLog(ctx, '[フリープレイ: カードデータなし]'));
    const effectsPF = parseCardEffects(cardPF);
    // スペル・アーツは主効果（ACTIVATED/AUTO）を実行
    const mainEffPF = effectsPF.find(e =>
      e.effectType === 'ACTIVATED' ||
      (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY'))
    );
    if (mainEffPF) {
      const newCtxPF = { ...ctx, sourceCardNum: cnPF };
      // カードをトラッシュ/使用済みへ移動してから効果実行
      let stateAfterPF = ctx.ownerState;
      let stateOtherAfterPF = ctx.otherState;
      if (stub.id === 'CAST_FROM_OPP_TRASH') {
        // 相手トラッシュから削除（手札にあるかのように使用するため自トラッシュには加えない）
        stateOtherAfterPF = { ...stateOtherAfterPF, trash: stateOtherAfterPF.trash.filter(c => c !== cnPF) };
      } else if (cardPF.Type === 'スペル') {
        stateAfterPF = { ...stateAfterPF, trash: [...stateAfterPF.trash, cnPF], hand: stateAfterPF.hand.filter(c => c !== cnPF) };
      }
      const execCtxPF = { ...newCtxPF, ownerState: stateAfterPF, otherState: stateOtherAfterPF };
      const resPF = exec(mainEffPF.action, addLog(execCtxPF, `${cardPF.CardName}をコストなしで使用`));
      return resPF;
    }
    // シグニは場に出す
    if (cardPF.Type === 'シグニ') {
      const addPF: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
      return exec(addPF, { ...ctx, lastProcessedCards: [cnPF] });
    }
    return done(addLog(ctx, `[フリープレイ: ${cardPF.CardName} (効果実行不可)]`));
  }
  // REACTIVE_POWER_UP: あなたの効果で相手シグニのパワーが減ったとき、その分だけ自シグニのパワーを上げる
  if (stub.id === 'REACTIVE_POWER_UP') {
    const srcRPU = ctx.sourceCardNum;
    if (!srcRPU) return done(addLog(ctx, '[REACTIVE_POWER_UP: ソースなし]'));
    // 相手シグニの temp_power_mods のマイナス分を合計（このターンに加えられた全マイナス）
    const oppMods = ctx.otherState.temp_power_mods ?? [];
    const totalMinus = oppMods.reduce((acc, m) => acc + (m.delta < 0 ? -m.delta : 0), 0);
    if (totalMinus <= 0) return done(addLog(ctx, 'リアクティブパワーアップ：相手パワーマイナスなし'));
    const selfMods = [...(ctx.ownerState.temp_power_mods ?? [])];
    selfMods.push({ cardNum: srcRPU, delta: totalMinus });
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: selfMods } },
      `リアクティブパワーアップ：+${totalMinus}（相手マイナス合計分）`));
  }
  // POWER_MOD_DISTRIBUTE: 合計パワーを選択シグニに均等配分（自場シグニ最大3体）
  if (stub.id === 'POWER_MOD_DISTRIBUTE') {
    const toHWPMD = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMD = srcPMD ? (srcPMD.EffectText ?? '') + ' ' + (srcPMD.BurstText ?? '') : '';
    const mPMD = txtPMD.match(/合わせて[＋+]([０-９\d]+)/);
    const totalBoostPMD = mPMD ? parseInt(toHWPMD(mPMD[1])) : 20000;
    const existOwnPMD = (ctx.lastProcessedCards ?? []).filter(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (existOwnPMD.length > 0) {
      const perSigniPMD = Math.floor(totalBoostPMD / existOwnPMD.length / 1000) * 1000;
      const modsPMD = [...(ctx.ownerState.temp_power_mods ?? [])];
      for (const cn of existOwnPMD) modsPMD.push({ cardNum: cn, delta: perSigniPMD });
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPMD } },
        `${existOwnPMD.length}体に+${perSigniPMD}ずつ（合計+${totalBoostPMD}配分）`));
    }
    const ownCandsPMD = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      return top ? [top] : [];
    });
    if (ownCandsPMD.length === 0) return done(addLog(ctx, '自場にシグニなし（POWER_MOD_DISTRIBUTE）'));
    const contPMD: StubAction = { type: 'STUB', id: 'POWER_MOD_DISTRIBUTE' };
    const noopPMD: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(ownCandsPMD, Math.min(ownCandsPMD.length, 3), false, 'self_field', noopPMD as EffectAction, contPMD as EffectAction, ctx);
  }
  // POWER_MOD_ON_FRONT_PLACE: 正面に配置された相手シグニに任意で-3000
  if (stub.id === 'POWER_MOD_ON_FRONT_PLACE') {
    const srcZonePMOP = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnPMOP = srcZonePMOP >= 0 ? ctx.otherState.field.signi[srcZonePMOP]?.at(-1) : undefined;
    if (!frontCnPMOP) return done(addLog(ctx, '正面シグニなし（POWER_MOD_ON_FRONT_PLACE）'));
    const applyPMOP: StubAction = { type: 'STUB', id: 'INTERNAL_PMOP_APPLY' };
    const skipPMOP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, `${ctx.cardMap.get(frontCnPMOP)?.CardName ?? frontCnPMOP}のパワーを－3000してもよい`), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'do',   label: '－3000する',  action: applyPMOP as EffectAction, available: true },
        { id: 'skip', label: 'しない',       action: skipPMOP as EffectAction,  available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_PMOP_APPLY') {
    const srcZoneIPMOP = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnIPMOP = srcZoneIPMOP >= 0 ? ctx.otherState.field.signi[srcZoneIPMOP]?.at(-1) : undefined;
    if (!frontCnIPMOP) return done(addLog(ctx, '正面シグニなし（INTERNAL_PMOP_APPLY）'));
    const modsIPMOP = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: frontCnIPMOP, delta: -3000 }];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIPMOP } },
      `${ctx.cardMap.get(frontCnIPMOP)?.CardName ?? frontCnIPMOP}のパワー-3000`));
  }
  // POWER_MOD_DOUBLE_DIFF: 対象シグニの基本パワーと自分の基本パワーとの差の2倍でマイナス
  if (stub.id === 'POWER_MOD_DOUBLE_DIFF') {
    const targetNum = ctx.lastProcessedCards?.[0];
    if (!targetNum) return done(addLog(ctx, 'POWER_MOD_DOUBLE_DIFF: 対象なし'));
    const pSelf = parseInt(String(ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum)?.Power ?? '0' : '0')) || 0;
    const pTarget = parseInt(String(ctx.cardMap.get(targetNum)?.Power ?? '0')) || 0;
    if (pTarget <= pSelf) return done(addLog(ctx, `POWER_MOD_DOUBLE_DIFF: 対象パワー${pTarget}≦自パワー${pSelf}、効果なし`));
    const delta = -(pTarget - pSelf) * 2;
    const mods = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: targetNum, delta }];
    const newOther = { ...ctx.otherState, temp_power_mods: mods };
    return done(addLog({ ...ctx, otherState: newOther }, `${ctx.cardMap.get(targetNum)?.CardName ?? targetNum}パワー${delta}`));
  }
  // 複雑パワー修正（engine: コンテキスト/配置情報必要）
  // CONDITIONAL_ALT_POWER_BOOST: 条件成立時に代わりにパワー修正（AUTO/ACTIVATED: temp_power_mods）
  if (stub.id === 'CONDITIONAL_ALT_POWER_BOOST') {
    if (!ctx.sourceCardNum) return done(addLog(ctx, 'CONDITIONAL_ALT_POWER_BOOST: sourceCardNum不明'));
    const srcCAPB = ctx.cardMap.get(ctx.sourceCardNum);
    const txtCAPB = srcCAPB ? (srcCAPB.EffectText ?? '') + ' ' + (srcCAPB.BurstText ?? '') : '';
    const toHWCAPB = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPosCAPB = txtCAPB.match(/代わりに[＋+]([０-９\d]+)/);
    const mNegCAPB = !mPosCAPB && txtCAPB.match(/代わりに[－-]([０-９\d]+)/);
    const deltaCAPB = mPosCAPB ? parseInt(toHWCAPB(mPosCAPB[1]))
      : mNegCAPB ? -parseInt(toHWCAPB(mNegCAPB[1])) : 0;
    if (deltaCAPB === 0) return done(addLog(ctx, 'CONDITIONAL_ALT_POWER_BOOST: 値不明'));
    const modsCAPB = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaCAPB }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsCAPB } },
      `代替パワー修正: ${deltaCAPB > 0 ? '+' : ''}${deltaCAPB}`));
  }
  // レベル修正（engine: ベースレベル変更システム未実装）
  if (stub.id === 'LEVEL_MOD_PER_COUNT') {
    return done(addLog(ctx, '[LEVEL_MOD_PER_COUNT: effectEngineで処理]'));
  }
  // SET_LEVEL_RANGE: 自シグニ1体を選んでレベル1～4に変更（ターン終了時まで）
  if (stub.id === 'SET_LEVEL_RANGE') {
    const targetSLR = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetSLR) {
      // Phase 2: レベル選択
      const optsSLR = [1,2,3,4].map(lv => ({
        id: `lv_${lv}`, label: `レベル${lv}にする`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_LEVEL_RANGE', value: `${targetSLR}:${lv}` } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, 'レベルを選択（1～4）'), { type: 'CHOOSE', options: optsSLR, count: 1 });
    }
    // Phase 1: 対象シグニ選択
    const ownSigniSLR = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    if (ownSigniSLR.length === 0) return done(addLog(ctx, '対象シグニなし（SET_LEVEL_RANGE）'));
    const noop: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const cont: StubAction = { type: 'STUB', id: 'SET_LEVEL_RANGE' };
    return needsInteraction(addLog(ctx, 'レベルを変更するシグニを選択'), {
      type: 'SELECT_TARGET', candidates: ownSigniSLR, count: 1, optional: false,
      targetScope: 'self_field', thenAction: noop as EffectAction, continuation: cont as EffectAction,
    });
  }
  if (stub.id === 'INTERNAL_SET_LEVEL_RANGE') {
    const valISLR = typeof stub.value === 'string' ? stub.value : '';
    const [tgtISLR, lvStrISLR] = valISLR.split(':');
    const lvISLR = parseInt(lvStrISLR);
    if (!tgtISLR || isNaN(lvISLR)) return done(addLog(ctx, '引数不正（INTERNAL_SET_LEVEL_RANGE）'));
    const overridesISLR = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [tgtISLR]: lvISLR };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: overridesISLR } },
      `${ctx.cardMap.get(tgtISLR)?.CardName ?? tgtISLR}の基本レベルを${lvISLR}に変更`));
  }
  // PREVENT_ZONE_MOVE_BY_OPP: CONTINUOUS→collectProtectedZones動的計算 / AUTO→prevent_opp_trash_fromフラグ設置
  if (stub.id === 'PREVENT_ZONE_MOVE_BY_OPP') {
    const srcPZM = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPZM = srcPZM ? (srcPZM.EffectText ?? '') : '';
    const zones: ('hand' | 'energy')[] = [];
    if (txtPZM.includes('エナゾーン') && txtPZM.includes('トラッシュに移動しない')) zones.push('energy');
    if (txtPZM.includes('手札') && txtPZM.includes('トラッシュに移動しない')) zones.push('hand');
    if (zones.length === 0) return done(addLog(ctx, '[PREVENT_ZONE_MOVE_BY_OPP: CONTINUOUSで動的処理中]'));
    const existing = ctx.ownerState.prevent_opp_trash_from ?? [];
    const merged = [...new Set([...existing, ...zones])] as ('hand' | 'energy')[];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_opp_trash_from: merged } },
      `相手効果によるトラッシュ移動禁止設置: ${zones.join(',')}`));
  }
  // PREVENT_SIGNI_DOWN_BY_OPP_ALL / PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP: 相手によるシグニダウン防止
  if (stub.id === 'PREVENT_SIGNI_DOWN_BY_OPP_ALL' || stub.id === 'PREVENT_SELF_DOWN_BY_OPP'
      || stub.id === 'PREVENT_BOUNCE_AND_DOWN_BY_OPP') {
    const newOwnerPSD: PlayerState = { ...ctx.ownerState, prevent_signi_down_by_opp: true };
    return done(addLog({ ...ctx, ownerState: newOwnerPSD }, '相手は自シグニをダウンできない'));
  }
  // OPP_SIGNI_ATTACK_POWER_RESTRICT: 相手シグニアタック時パワー制限
  if (stub.id === 'OPP_SIGNI_ATTACK_POWER_RESTRICT') {
    const srcOSAPR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOSAPR = srcOSAPR ? (srcOSAPR.EffectText ?? '') + ' ' + (srcOSAPR.BurstText ?? '') : '';
    const toHWOSAPR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const capM = txtOSAPR.match(/パワーが([０-９\d]+)以下のシグニは/);
    const cap = capM ? parseInt(toHWOSAPR(capM[1])) : 12000;
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, opp_signi_attack_power_cap: cap } },
      `相手シグニアタック時パワー上限: ${cap}`));
  }
  // SIGNI_FLIP_FACEDOWN: 自シグニ（または相手lastProcessed）を裏向きにする
  if (stub.id === 'SIGNI_FLIP_FACEDOWN') {
    const srcSFD = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!srcSFD) return done(addLog(ctx, '裏向き: ソースなし'));
    // 自フィールドにいれば ownerState、相手フィールドにいれば otherState に追加
    const inOwnerSFD = ctx.ownerState.field.signi.some(s => s?.includes(srcSFD));
    if (inOwnerSFD) {
      const newFaceSFD = [...new Set([...(ctx.ownerState.face_down_signi ?? []), srcSFD])];
      const newAbilSFD = [...new Set([...(ctx.ownerState.abilities_removed ?? []), srcSFD])];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, face_down_signi: newFaceSFD, abilities_removed: newAbilSFD } },
        `${ctx.cardMap.get(srcSFD)?.CardName ?? srcSFD}を裏向きに`));
    }
    const newFaceOppSFD = [...new Set([...(ctx.otherState.face_down_signi ?? []), srcSFD])];
    const newAbilOppSFD = [...new Set([...(ctx.otherState.abilities_removed ?? []), srcSFD])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, face_down_signi: newFaceOppSFD, abilities_removed: newAbilOppSFD } },
      `${ctx.cardMap.get(srcSFD)?.CardName ?? srcSFD}を裏向きに`));
  }
  // FLIP_FACE_DOWN_SIGNI: 裏向きシグニを表向きに戻す（"この方法で裏向きにしたシグニを表向きにする"）
  if (stub.id === 'FLIP_FACE_DOWN_SIGNI') {
    const faceDownFBSFD = ctx.ownerState.face_down_signi ?? [];
    const oppFaceDownFBSFD = ctx.otherState.face_down_signi ?? [];
    if (faceDownFBSFD.length === 0 && oppFaceDownFBSFD.length === 0) {
      return done(addLog(ctx, '裏向きシグニなし（flip-back不要）'));
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
      `裏向きシグニ${faceDownFBSFD.length + oppFaceDownFBSFD.length}体を表向きに`));
  }
  // FACE_DOWN_OPP_SIGNI: 相手シグニを対象選択→裏向きにする
  if (stub.id === 'FACE_DOWN_OPP_SIGNI') {
    // lastProcessedCardsが既にある場合はそれを使用（他STUBから連鎖）
    const preselectedFDOS = ctx.lastProcessedCards?.[0];
    if (preselectedFDOS && ctx.otherState.field.signi.some(s => s?.at(-1) === preselectedFDOS)) {
      const newFaceFDOS = [...new Set([...(ctx.otherState.face_down_signi ?? []), preselectedFDOS])];
      const newAbilFDOS = [...new Set([...(ctx.otherState.abilities_removed ?? []), preselectedFDOS])];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, face_down_signi: newFaceFDOS, abilities_removed: newAbilFDOS } },
        `${ctx.cardMap.get(preselectedFDOS)?.CardName ?? preselectedFDOS}を裏向きに`));
    }
    // 相手シグニを選択
    const candsFDOS = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (candsFDOS.length === 0) return done(addLog(ctx, '裏向き対象なし（相手フィールド空）'));
    const applyFDOS: StubAction = { type: 'STUB', id: 'FACE_DOWN_OPP_SIGNI' };
    return selectOrInteract(candsFDOS, 1, false, 'opp_field', applyFDOS as EffectAction, undefined, ctx);
  }
  // 保護・移動防止系（engine: 各防止フラグシステム未実装）
  if (stub.id === 'PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH'
      || stub.id === 'PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH' || stub.id === 'PREVENT_NON_FIELD_MOVE_BY_OPP'
      || stub.id === 'PREVENT_OPP_SIGNI_ABILITY_GAIN'
      || stub.id === 'PREVENT_SIGNI_ABILITY_LOSS_BY_OPP' || stub.id === 'PREVENT_POWER_MINUS_BY_OPP'
      || stub.id === 'PREVENT_OPP_POWER_PLUS' || stub.id === 'PREVENT_ABILITY_CHANGE_BY_OPP'
      || stub.id === 'PREVENT_SIGNI_DOWN_BY_OPP' || stub.id === 'SUPPRESS_GAIN_ABILITY'
      || stub.id === 'PREVENT_INFECTED_SIGNI_ACTIVATE'
      || stub.id === 'SIGNI_CANT_BOUNCE_FROM_FIELD'
      || stub.id === 'SIGNI_PROTECT_MOVE_EXCEPT_ENERGY') {
    return done(addLog(ctx, `[保護効果: ${stub.id}]`));
  }
  // PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE: 次の相手ATKフェイズ開始時、このシグニはアタック不可
  if (stub.id === 'PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE') {
    const srcPAUOAP = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!srcPAUOAP) return done(addLog(ctx, 'PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE: 対象なし'));
    // 対象シグニのオーナー側のblocked_actionsにATTACK:{cardId}を追加
    const inOwnerPAUOAP = ctx.ownerState.field.signi.some(s => s?.includes(srcPAUOAP));
    if (inOwnerPAUOAP) {
      const newBlockedPAUOAP = [...(ctx.ownerState.blocked_actions ?? []), `ATTACK:${srcPAUOAP}`];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, blocked_actions: newBlockedPAUOAP } },
        `${ctx.cardMap.get(srcPAUOAP)?.CardName ?? srcPAUOAP}は次の相手ATKフェイズ中アタック不可`));
    }
    const newBlockedOtherPAUOAP = [...(ctx.otherState.blocked_actions ?? []), `ATTACK:${srcPAUOAP}`];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedOtherPAUOAP } },
      `${ctx.cardMap.get(srcPAUOAP)?.CardName ?? srcPAUOAP}は次の相手ATKフェイズ中アタック不可`));
  }
  // PREVENT_TARGET_LRIG_ATTACK_THIS_TURN: このターン対象ルリグのアタックを防ぐ
  if (stub.id === 'PREVENT_TARGET_LRIG_ATTACK_THIS_TURN') {
    const tgtPTLAT = ctx.lastProcessedCards?.[0]
      ?? ctx.otherState.field.lrig.at(-1);
    if (!tgtPTLAT) return done(addLog(ctx, 'ルリグアタック防止: 対象なし'));
    const newNegatedPTLAT = [...new Set([...(ctx.otherState.negated_attacks ?? []), tgtPTLAT])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, negated_attacks: newNegatedPTLAT } },
      `${ctx.cardMap.get(tgtPTLAT)?.CardName ?? tgtPTLAT}はこのターンアタックできない`));
  }
  // INTERNAL_GRANT_NO_ATTACK_LRIG: CHOOSE_SAME_OPTION_TWICEから呼ばれる内部ハンドラ
  // 相手センタールリグにアタック不可（negated_attacks）を付与
  if (stub.id === 'INTERNAL_GRANT_NO_ATTACK_LRIG') {
    const lrigIGNAL = ctx.otherState.field.lrig.at(-1);
    if (!lrigIGNAL) return done(addLog(ctx, 'INTERNAL_GRANT_NO_ATTACK_LRIG: ルリグなし'));
    const newNegIGNAL = [...new Set([...(ctx.otherState.negated_attacks ?? []), lrigIGNAL])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, negated_attacks: newNegIGNAL } },
      `${ctx.cardMap.get(lrigIGNAL)?.CardName ?? lrigIGNAL}はこのターンアタックできない`));
  }
  // BLOCK_OPP_ENCORE_AND_BET: 相手のアンコール/ベット封じ
  if (stub.id === 'BLOCK_OPP_ENCORE_AND_BET') {
    const newBlockedBOEB = [...(ctx.otherState.blocked_actions ?? []), 'ENCORE', 'BET'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBOEB } },
      '相手はアンコール・ベットできない'));
  }
  // PREVENT_OWN_ARTS_USE: 自分のアーツ使用封じ
  if (stub.id === 'PREVENT_OWN_ARTS_USE') {
    const newBlockedPOAU = [...(ctx.ownerState.blocked_actions ?? []), 'USE_ARTS'];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, blocked_actions: newBlockedPOAU } },
      '自分はアーツを使用できない'));
  }
  // PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP: 全シグニの相手パワーマイナス防止（effectEngineで動的処理）
  if (stub.id === 'PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP') {
    return done(addLog(ctx, '[全シグニパワーマイナス防止: effectEngineで動的処理]'));
  }
  // グロウコスト変更（engine: グロウコスト処理未実装）
  if (stub.id === 'GROW_COST_ZERO' || stub.id === 'CONDITIONAL_FREE_GROW') {
    const newOwnerGCZ: PlayerState = { ...ctx.ownerState, free_grow_this_turn: true };
    return done(addLog({ ...ctx, ownerState: newOwnerGCZ }, 'グロウコスト0（次のグロウは無料）'));
  }
  if (stub.id === 'GROW_COST_SUBSTITUTE_TRASH_SIGNI') {
    return done(addLog(ctx, '[グロウコスト代替: GROW_COST_SUBSTITUTE_TRASH_SIGNI]'));
  }
  // コスト軽減系（engine: コスト計算システム未実装）
  // CONDITIONAL_COST_REDUCTION_BY_FIELD: フィールド条件（クラス/枚数）でコスト軽減チェック
  if (stub.id === 'CONDITIONAL_COST_REDUCTION_BY_FIELD') {
    const srcCCRF = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCCRF = srcCCRF ? (srcCCRF.EffectText ?? '') + ' ' + (srcCCRF.BurstText ?? '') : '';
    // クラス条件（「＜クラス1＞と＜クラス2＞のシグニがある場合」）
    const classMatchesCCRF = [...txtCCRF.matchAll(/＜([^＞]+)＞/g)].map(m => m[1]).slice(0, 3);
    if (classMatchesCCRF.length > 0) {
      const allPresentCCRF = classMatchesCCRF.every(cls =>
        ctx.ownerState.field.signi.some(s => {
          const top = s?.at(-1); return top && ctx.cardMap.get(top)?.CardClass?.includes(cls);
        })
      );
      return done(addLog(ctx, `コスト軽減条件[${classMatchesCCRF.join('+')}]: ${allPresentCCRF ? '条件達成（コスト軽減適用）' : '条件未達（通常コスト）'}`));
    }
    return done(addLog(ctx, 'コスト軽減条件（条件解析不可）'));
  }
  // CONDITIONAL_CARD_COST_BY_OPP_LRIG: 対戦相手のルリグ属性によるコスト変更チェック
  if (stub.id === 'CONDITIONAL_CARD_COST_BY_OPP_LRIG') {
    const srcCCOL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCCOL = srcCCOL ? (srcCCOL.EffectText ?? '') + ' ' + (srcCCOL.BurstText ?? '') : '';
    const condM = txtCCOL.match(/対戦相手のセンタールリグが([赤青緑黒白]+)の場合/);
    if (condM) {
      const condColor = condM[1];
      const oppLrigCn = ctx.otherState.field.lrig.at(-1);
      const oppColor = oppLrigCn ? (ctx.cardMap.get(oppLrigCn)?.Color ?? '') : '';
      const met = oppColor.includes(condColor);
      return done(addLog(ctx, `コスト変更条件（相手${condColor}）: ${met ? '条件達成' : '条件未達'}`));
    }
    return done(addLog(ctx, 'コスト変更条件（ルリグ属性解析不可）'));
  }
  if (stub.id === 'SPELL_COST_REDUCTION_BY_TRASH_COUNT' || stub.id === 'SPECIFIC_CARD_COST_REDUCE'
      || stub.id === 'ARTS_COST_REDUCTION_BY_COST_THRESHOLD') {
    return done(addLog(ctx, `[コスト軽減: ${stub.id}]`));
  }
  // REDUCE_PLAY_ABILITY_COST: 次の【出】能力コストを軽減
  if (stub.id === 'REDUCE_PLAY_ABILITY_COST') {
    const srcRPAC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRPAC = srcRPAC ? (srcRPAC.EffectText ?? '') : '';
    const toHWRPAC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const colorMatchRPAC = txtRPAC.match(/発動コストは《([白赤青緑黒無])/);
    const colorRPAC = colorMatchRPAC?.[1] ?? '赤';
    const countMatchRPAC = txtRPAC.match(/《[白赤青緑黒無]×([０-９\d]+)》減る/);
    const countRPAC = countMatchRPAC ? parseInt(toHWRPAC(countMatchRPAC[1])) : 1;
    const newOwnerRPAC: PlayerState = { ...ctx.ownerState, reduce_next_on_play_cost: { color: colorRPAC, count: countRPAC } };
    return done(addLog({ ...ctx, ownerState: newOwnerRPAC }, `次の【出】能力コスト軽減（${colorRPAC}×${countRPAC}）`));
  }
  // ガード系（engine: ガードコスト処理未実装）
  if (stub.id === 'GUARD_ALTERNATIVE_COST' || stub.id === 'EXTRA_GUARD_COST_FROM_HAND' || stub.id === 'OPTIONAL_TRADE_GUARD_SIGNI') {
    return done(addLog(ctx, `[ガードコスト: ${stub.id}]`));
  }
  // 選んだキーワード/保護能力付与（シグニ対象・SELECT_TARGET→CHOOSEインタラクション）
  if (stub.id === 'GRANT_CHOSEN_ABILITY' || stub.id === 'GRANT_CHOSEN_ABILITY_SELF'
      || stub.id === 'SIGNI_GRANT_CHOSEN_ABILITY') {
    const srcGCA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGCA = srcGCA ? (srcGCA.EffectText ?? '') + ' ' + (srcGCA.BurstText ?? '') : '';
    const toHWGCA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 自フィールドシグニが対象（lastProcessedCardsに対象シグニを設定）
    const targetFromLP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (!targetFromLP) {
      // SELECT_TARGET: 自フィールドシグニを選択してから能力付与へ
      const fieldCandsGCA = [0,1,2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn);
      if (fieldCandsGCA.length === 0) return done(addLog(ctx, '能力付与対象なし（自シグニなし）'));
      const noopGCA: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contGCA: StubAction = { type: 'STUB', id: stub.id };
      return needsInteraction(addLog(ctx, '能力を付与するシグニを選択'), {
        type: 'SELECT_TARGET', candidates: fieldCandsGCA, count: 1, optional: false,
        targetScope: 'self_field', thenAction: noopGCA as EffectAction, continuation: contGCA as EffectAction,
      });
    }
    // 選択数（"N つ選ぶ" or デフォルト1）
    const chooseCountGCA = (() => {
      const m = txtGCA.match(/([２-９2-9\d])つを選ぶ/);
      return m ? parseInt(toHWGCA(m[1])) : 1;
    })();
    // テキストから選択肢を抽出（①②③④⑤）
    const abilitiesGCA: Array<{ label: string; kw: string }> = [];
    const abilityPatterns: Array<[RegExp, string]> = [
      [/【アサシン】/, 'アサシン'],
      [/【ランサー】/, 'ランサー'],
      [/【ダブルクラッシュ】/, 'ダブルクラッシュ'],
      [/【シャドウ】/, 'シャドウ'],
      [/【マルチエナ】/, 'マルチエナ'],
      [/バニッシュされない/, 'バニッシュ不可'],
      [/ダウンしない/, 'ダウン不可'],
      [/手札に戻らない/, 'バウンス不可'],
    ];
    for (const [pat, kw] of abilityPatterns) {
      if (pat.test(txtGCA)) abilitiesGCA.push({ label: `【${kw}】を付与`, kw });
    }
    if (abilitiesGCA.length === 0) return done(addLog(ctx, `[能力付与: ${stub.id}]（能力解析不可）`));
    const optionsGCA = abilitiesGCA.map(({ label, kw }) => ({
      id: kw,
      label,
      action: ({ type: 'STUB', id: 'INTERNAL_GRANT_KEYWORD_TO_TARGET', value: `${targetFromLP}:${kw}` } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '付与する能力を選択'), { type: 'CHOOSE', options: optionsGCA, count: chooseCountGCA });
  }
  // INTERNAL_GRANT_KEYWORD_TO_TARGET: 選択されたキーワード/保護能力を対象シグニに付与
  if (stub.id === 'INTERNAL_GRANT_KEYWORD_TO_TARGET') {
    const valIGKTT = typeof stub.value === 'string' ? stub.value : '';
    const [targetCnIGKTT, kwIGKTT] = valIGKTT.split(':');
    if (!targetCnIGKTT || !kwIGKTT) return done(addLog(ctx, 'キーワード付与失敗（引数不正）'));
    // keyword_grants に追加（保護系も含む）
    let newOwnerIGKTT = ctx.ownerState;
    const grantsIGKTT = { ...(newOwnerIGKTT.keyword_grants ?? {}) };
    grantsIGKTT[targetCnIGKTT] = [...new Set([...(grantsIGKTT[targetCnIGKTT] ?? []), kwIGKTT])];
    newOwnerIGKTT = { ...newOwnerIGKTT, keyword_grants: grantsIGKTT };
    // 保護系は専用フラグも設定
    if (kwIGKTT === 'バニッシュ不可') {
      // otherState.abilities_removed から除外 + banish_redirect 相当フラグなし → keyword_grantsで管理
    }
    return done(addLog({ ...ctx, ownerState: newOwnerIGKTT },
      `${ctx.cardMap.get(targetCnIGKTT)?.CardName ?? targetCnIGKTT}に【${kwIGKTT}】付与`));
  }
  // GRANT_CHOSEN_ABILITY_FROM_PLAY: 【出】で選んだ能力（keyword_grants記録済み）を常在で参照
  // このCONTINUOUS効果はexecStubではなくeffectEngine側でkeyword_grantsを参照するため、ここでは何もしない
  if (stub.id === 'GRANT_CHOSEN_ABILITY_FROM_PLAY') {
    // keyword_grants に同カードの付与済みキーワードがあれば継続（effectEngineで動的参照）
    return done(ctx);
  }
  // SIGNI_GRANT_QUOTED_CONSTANT_ABILITY: 引用常在能力を自シグニに付与（SELECT_TARGET→keyword_grants）
  if (stub.id === 'SIGNI_GRANT_QUOTED_CONSTANT_ABILITY') {
    const srcSGQCA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSGQCA = srcSGQCA ? (srcSGQCA.EffectText ?? '') + ' ' + (srcSGQCA.BurstText ?? '') : '';
    const toHWSGQCA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 付与するキーワードを引用文から解析
    let kwSGQCA: string | null = null;
    if (txtSGQCA.includes('アサシン')) kwSGQCA = 'assassin';
    else if (txtSGQCA.includes('シャドウ')) kwSGQCA = 'shadow';
    else if (txtSGQCA.includes('ランサー')) kwSGQCA = 'lancer';
    else if (txtSGQCA.includes('ダブルクラッシュ')) kwSGQCA = 'double_crush';
    else if (txtSGQCA.includes('ガード')) kwSGQCA = 'guard';
    // 対象シグニ数
    const countMSGQCA = txtSGQCA.match(/シグニを([０-９\d]+)体まで/);
    const maxCntSGQCA = countMSGQCA ? parseInt(toHWSGQCA(countMSGQCA[1])) : 1;
    // 対象選択済みならキーワードを付与
    if (ctx.lastProcessedCards?.length) {
      if (!kwSGQCA) return done(addLog(ctx, '[SIGNI_GRANT_QUOTED_CONSTANT_ABILITY: キーワード解析不可]'));
      const newGrants = { ...(ctx.ownerState.keyword_grants ?? {}) };
      for (const cn of ctx.lastProcessedCards) {
        const prev = newGrants[cn] ?? [];
        if (!prev.includes(kwSGQCA)) newGrants[cn] = [...prev, kwSGQCA];
      }
      const names = ctx.lastProcessedCards.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: newGrants } },
        `${names}→【${kwSGQCA}】付与`));
    }
    // 自フィールドからSELECT_TARGET
    const fieldCandsSGQCA = ctx.ownerState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    if (fieldCandsSGQCA.length === 0) return done(addLog(ctx, '自フィールドにシグニなし'));
    const contSGQCA: StubAction = { type: 'STUB', id: 'SIGNI_GRANT_QUOTED_CONSTANT_ABILITY' };
    return needsInteraction(addLog(ctx, `シグニを選択（引用常在能力付与: ${kwSGQCA ?? '?'}）`), {
      type: 'SELECT_TARGET', candidates: fieldCandsSGQCA, count: maxCntSGQCA, optional: true,
      targetScope: 'self_field', thenAction: contSGQCA as EffectAction,
    });
  }
  // 能力付与系（CONTINUOUS効果はeffectEngineで処理、AUTO/ACTIVATEDでも来た場合のフォールバック）
  // GRANT_UNDER_SIGNI_*/GRANT_UNDER_LRIG_*/GRANT_LRIG_TRASH_ACTIVATE_ABILITY
  // → collectGrantedFromUnderSigni / collectLrigGrantedEffectsで処理済み
  if (stub.id === 'GRANT_LRIG_ABILITY' || stub.id === 'GRANT_LRIG_TRASH_ACTIVATE_ABILITY'
      || stub.id === 'GRANT_UNDER_LRIG_ACTIVATE_ABILITY' || stub.id === 'GRANT_UNDER_LRIG_AUTO_ABILITY'
      || stub.id === 'GRANT_UNDER_SIGNI_ALL_ABILITIES' || stub.id === 'GRANT_UNDER_SIGNI_CONSTANT_ABILITY'
      || stub.id === 'GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE'
      || stub.id === 'GRANT_LRIG_TYPE_GAME_WIDE') {
    return done(addLog(ctx, `[能力付与: ${stub.id}]`));
  }
  // COPY_ABILITY: このシグニはその（lastProcessed[0]の）能力を得る
  if (stub.id === 'COPY_ABILITY') {
    const targetCA = ctx.sourceCardNum;
    const copiedCA = ctx.lastProcessedCards?.[0];
    if (!targetCA || !copiedCA) return done(addLog(ctx, 'COPY_ABILITY: 対象またはコピー元なし'));
    const copiedCardCA = ctx.cardMap.get(copiedCA);
    if (!copiedCardCA) return done(addLog(ctx, 'COPY_ABILITY: コピー元カードデータなし'));
    const copiedEffsCA = parseCardEffects(copiedCardCA);
    const grantedCA = { ...(ctx.ownerState.granted_effects ?? {}) };
    grantedCA[targetCA] = [...(grantedCA[targetCA] ?? []), ...copiedEffsCA];
    const newOwnerCA: PlayerState = { ...ctx.ownerState, granted_effects: grantedCA };
    return done(addLog({ ...ctx, ownerState: newOwnerCA },
      `${ctx.cardMap.get(targetCA)?.CardName ?? targetCA}が${copiedCardCA.CardName}の能力をコピー`));
  }
  // GRANT_ABILITY_UNTIL_OPP_TURN: 次の対戦相手のターン終了時まで①の能力を付与
  if (stub.id === 'GRANT_ABILITY_UNTIL_OPP_TURN') {
    const srcGAUOT = ctx.sourceCardNum;
    if (!srcGAUOT) return done(addLog(ctx, 'GRANT_ABILITY_UNTIL_OPP_TURN: ソースなし'));
    const srcCardGAUOT = ctx.cardMap.get(srcGAUOT);
    const txtGAUOT = srcCardGAUOT ? (srcCardGAUOT.EffectText ?? '') + ' ' + (srcCardGAUOT.BurstText ?? '') : '';
    let kwGAUOT: string | null = null;
    if (txtGAUOT.includes('Sランサー')) kwGAUOT = 'Sランサー';
    else if (txtGAUOT.includes('ランサー')) kwGAUOT = 'lancer';
    else if (txtGAUOT.includes('アサシン')) kwGAUOT = 'assassin';
    else if (txtGAUOT.includes('ダブルクラッシュ')) kwGAUOT = 'double_crush';
    else if (txtGAUOT.includes('シャドウ')) kwGAUOT = 'shadow';
    else if (txtGAUOT.includes('バニッシュ不可')) kwGAUOT = 'バニッシュ不可';
    else if (txtGAUOT.includes('ダウン不可')) kwGAUOT = 'ダウン不可';
    if (!kwGAUOT) return done(addLog(ctx, `GRANT_ABILITY_UNTIL_OPP_TURN: キーワード解析不可`));
    const grantsGAUOT = { ...(ctx.ownerState.keyword_grants ?? {}) };
    grantsGAUOT[srcGAUOT] = [...new Set([...(grantsGAUOT[srcGAUOT] ?? []), kwGAUOT])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsGAUOT } },
      `${ctx.cardMap.get(srcGAUOT)?.CardName ?? srcGAUOT}に${kwGAUOT}（次の相手ターン終了まで）`));
  }
  // RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY: ライズ対象シグニに引用常在能力を付与
  if (stub.id === 'RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY') {
    const targetRTSGA = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!targetRTSGA) return done(addLog(ctx, 'RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY: 対象なし'));
    const riseCardRTSGA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRTSGA = riseCardRTSGA ? (riseCardRTSGA.EffectText ?? '') : '';
    let kwRTSGA: string | null = null;
    if (txtRTSGA.includes('アサシン')) kwRTSGA = 'assassin';
    else if (txtRTSGA.includes('Sランサー')) kwRTSGA = 'Sランサー';
    else if (txtRTSGA.includes('ランサー')) kwRTSGA = 'lancer';
    else if (txtRTSGA.includes('ダブルクラッシュ')) kwRTSGA = 'double_crush';
    else if (txtRTSGA.includes('シャドウ')) kwRTSGA = 'shadow';
    else if (txtRTSGA.includes('バニッシュ不可')) kwRTSGA = 'バニッシュ不可';
    if (!kwRTSGA) return done(addLog(ctx, `RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY: キーワード解析不可`));
    const grantsRTSGA = { ...(ctx.ownerState.keyword_grants ?? {}) };
    grantsRTSGA[targetRTSGA] = [...new Set([...(grantsRTSGA[targetRTSGA] ?? []), kwRTSGA])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsRTSGA } },
      `${ctx.cardMap.get(targetRTSGA)?.CardName ?? targetRTSGA}が${kwRTSGA}を得る`));
  }
  // GRANT_SIGNI_CLASS: このシグニに＜X＞クラスを付与
  if (stub.id === 'GRANT_SIGNI_CLASS') {
    const srcGSC = ctx.sourceCardNum;
    if (!srcGSC) return done(addLog(ctx, 'GRANT_SIGNI_CLASS: ソースなし'));
    const srcCardGSC = ctx.cardMap.get(srcGSC);
    const txtGSC = srcCardGSC ? (srcCardGSC.EffectText ?? '') : '';
    const classMatchGSC = txtGSC.match(/このシグニは＜([^＞]+)＞を持つ/);
    const classNameGSC = classMatchGSC ? classMatchGSC[1] : '';
    if (!classNameGSC) return done(addLog(ctx, 'GRANT_SIGNI_CLASS: クラス解析不可'));
    const existingGSC = srcCardGSC?.CardClass ?? '';
    const newClassGSC = existingGSC.includes(classNameGSC) ? existingGSC : `${existingGSC}:${classNameGSC}`;
    const overridesGSC = { ...(ctx.ownerState.card_class_overrides ?? {}), [srcGSC]: newClassGSC };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: overridesGSC } },
      `${ctx.cardMap.get(srcGSC)?.CardName ?? srcGSC}が＜${classNameGSC}＞を得る`));
  }
  // LAYER_ABILITY_COPY: ＜怪異＞シグニのレイヤー能力を自シグニにコピー
  if (stub.id === 'LAYER_ABILITY_COPY') {
    const srcLAC = ctx.sourceCardNum;
    const srcCardLAC = srcLAC ? ctx.cardMap.get(srcLAC) : undefined;
    const txtLAC = srcCardLAC ? (srcCardLAC.EffectText ?? '') : '';
    const fromTrash = txtLAC.includes('トラッシュから');
    const kaiClass = '怪異';
    let candsLAC: string[];
    let scopeLAC: TargetScope;
    if (fromTrash) {
      candsLAC = ctx.ownerState.trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(kaiClass);
      });
      scopeLAC = 'self_trash';
    } else {
      candsLAC = [0, 1, 2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn && cn !== srcLAC && (ctx.cardMap.get(cn)?.CardClass ?? '').includes(kaiClass));
      scopeLAC = 'self_field';
    }
    if (candsLAC.length === 0) return done(addLog(ctx, `＜${kaiClass}＞シグニなし（${fromTrash ? 'トラッシュ' : 'フィールド'}）`));
    const noopLAC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contLAC: StubAction = { type: 'STUB', id: 'INTERNAL_LAYER_COPY_APPLY' };
    return needsInteraction(addLog(ctx, 'レイヤー能力をコピーするシグニを選択'), {
      type: 'SELECT_TARGET', candidates: candsLAC, count: 1, optional: false,
      targetScope: scopeLAC, thenAction: noopLAC as EffectAction, continuation: contLAC as EffectAction,
    });
  }
  // INTERNAL_LAYER_COPY_APPLY: 選択シグニのレイヤー能力を自シグニに付与
  if (stub.id === 'INTERNAL_LAYER_COPY_APPLY') {
    const srcILCA = ctx.sourceCardNum;
    const targetILCA = (ctx.lastProcessedCards ?? [])[0];
    if (!srcILCA || !targetILCA) return done(addLog(ctx, 'レイヤーコピー失敗'));
    const targetCardILCA = ctx.cardMap.get(targetILCA);
    const targetTxtILCA = (targetCardILCA?.EffectText ?? '') + ' ' + (targetCardILCA?.BurstText ?? '');
    // レイヤー能力部分を抽出（《レイヤーアイコン》以降）
    const layerMatchILCA = targetTxtILCA.match(/《レイヤーアイコン》(.+)/);
    const layerTxtILCA = layerMatchILCA?.[1] ?? '';
    const knownKwsILCA = ['Sランサー', 'ランサー', 'ダブルクラッシュ', 'アサシン', 'シャドウ', 'マルチエナ'];
    const copiedKwsILCA = knownKwsILCA.filter(kw => layerTxtILCA.includes(kw));
    // Sランサー（パワー条件付き）
    if (layerTxtILCA.match(/12000以上.*Sランサー|Sランサー.*12000以上/)) {
      const srcPow = ctx.effectivePowers?.get(srcILCA) ?? parseInt(ctx.cardMap.get(srcILCA)?.Power ?? '0');
      if (srcPow >= 12000) copiedKwsILCA.push('Sランサー');
    }
    if (copiedKwsILCA.length > 0) {
      const grantsILCA = { ...(ctx.ownerState.keyword_grants ?? {}) };
      grantsILCA[srcILCA] = [...new Set([...(grantsILCA[srcILCA] ?? []), ...copiedKwsILCA])];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsILCA } },
        `${targetCardILCA?.CardName ?? targetILCA}のレイヤー【${copiedKwsILCA.join('・')}】をコピー`));
    }
    // パワー保護など非キーワード系
    if (layerTxtILCA.includes('パワーは増減しない')) {
      return done(addLog(ctx, `${targetCardILCA?.CardName ?? targetILCA}のレイヤー（パワー保護）をコピー`));
    }
    return done(addLog(ctx, `${targetCardILCA?.CardName ?? targetILCA}のレイヤー能力をコピー（ログのみ）`));
  }
  // RIDE_ON: ルリグが乗機シグニ1体に任意でライド（ドライブ状態でない場合のみ可）
  if (stub.id === 'RIDE_ON') {
    if ((ctx.ownerState.lrig_riding_signi?.length ?? 0) > 0) {
      return done(addLog(ctx, 'ルリグ既にドライブ状態（RIDE_ON スキップ）'));
    }
    const selectedRO = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (selectedRO) {
      const newOwnerRO = { ...ctx.ownerState, lrig_riding_signi: [selectedRO] };
      const namRO = ctx.cardMap.get(selectedRO)?.CardName ?? selectedRO;
      return done(addLog({ ...ctx, ownerState: newOwnerRO }, `ルリグが${namRO}に乗る（ドライブ状態）`));
    }
    const rideCandRO = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('乗機') ? [top] : [];
    });
    if (rideCandRO.length === 0) return done(addLog(ctx, '乗機シグニなし（RIDE_ON）'));
    const applyRO: StubAction = { type: 'STUB', id: 'INTERNAL_RIDE_ON_APPLY' };
    const skipRO:  StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, 'ルリグを乗機シグニに乗せてもよい'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'ride', label: '乗る', action: applyRO as EffectAction, available: true },
        { id: 'skip', label: 'しない', action: skipRO as EffectAction, available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_RIDE_ON_APPLY') {
    const rideCandIROA = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('乗機') ? [top] : [];
    });
    if (rideCandIROA.length === 0) return done(addLog(ctx, '乗機シグニなし（INTERNAL_RIDE_ON_APPLY）'));
    const contIROA: StubAction = { type: 'STUB', id: 'RIDE_ON' };
    const noopIROA: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(rideCandIROA, 1, false, 'self_field', noopIROA as EffectAction, contIROA as EffectAction, ctx);
  }
  // ライズ/スタック系（engine: ライズシステム未実装）
  if (stub.id === 'RISE_BANISH_SUBSTITUTE' || stub.id === 'RISE_LEAVE_DISCARD_STACK'
      || stub.id === 'BANISH_SUBSTITUTE_RISE_STACK' || stub.id === 'RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE'
      || stub.id === 'COOKING_BANISH_SUBSTITUTE' || stub.id === 'BLACK_RISE_PLAY_STACK_FROM_TRASH') {
    return done(addLog(ctx, `[ライズ/スタック: ${stub.id}]`));
  }
  // ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白: CONTINUOUS効果（effectEngine.collectEnergyColorSubsで動的計算）
  if (stub.id === 'ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白') {
    return done(addLog(ctx, '[ENERGY_COLOR_SUBSTITUTE: effectEngineで動的処理中]'));
  }
  // エナ代替系（effectEngine.collectEnergyTrashSubstituteInfoで動的計算）
  if (stub.id === 'ENERGY_COLOR_SUBSTITUTE_TRASH' || stub.id === 'ENERGY_SUBSTITUTE_TRASH_SIGNI'
      || stub.id === 'ENERGY_SUBSTITUTE_TRASH_KEY' || stub.id === 'ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI') {
    return done(addLog(ctx, `[エナ代替: ${stub.id}（UIで処理済み）]`));
  }
  // CLASS_CHANGE: シグニのクラスを一時変更
  if (stub.id === 'CLASS_CHANGE') {
    const srcCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCC = srcCC ? (srcCC.EffectText ?? '') + ' ' + (srcCC.BurstText ?? '') : '';
    // 変更先クラスを抽出: declared_class → lastProcessedCards → テキスト解析の優先順
    const declaredClassCC = ctx.ownerState.declared_class
      ?? (ctx.lastProcessedCards ?? []).find(s => !s.match(/^WX|^WD|^WXD|^WXK|^SPDi/));
    const newClassMCC = txtCC.match(/＜([^＞]+)＞を得る/);
    const newClass = declaredClassCC ?? (newClassMCC ? newClassMCC[1] : null);
    if (!newClass) return done(addLog(ctx, 'クラス変更先不明'));
    // 「すべての...シグニ」→ 対象選択なし（全員適用）
    if (txtCC.match(/すべて.*シグニ.*クラスを失い|すべての.*シグニは.*クラスを失い/)) {
      const colorPatCC = txtCC.match(/(赤|青|緑|白|黒).*(?:と|か|または).*(赤|青|緑|白|黒)/);
      const colorSingleCC = !colorPatCC && txtCC.match(/(赤|青|緑|白|黒).*シグニ.*クラスを失い/);
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
      if (targets.length === 0) return done(addLog(ctx, 'クラス変更対象なし'));
      const overridesCC = { ...(ctx.ownerState.card_class_overrides ?? {}) };
      for (const cn of targets) overridesCC[cn] = newClass;
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: overridesCC } },
        `${targets.length}体のシグニのクラスを＜${newClass}＞に変更`));
    }
    // lastProcessedCards に対象シグニがある場合（SEQUENCE内のターゲット選択後）
    const targetFromContext = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn) ||
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (targetFromContext) {
      const inOwnCC2 = ctx.ownerState.field.signi.some(s => s?.at(-1) === targetFromContext);
      if (inOwnCC2) {
        const ovCC2 = { ...(ctx.ownerState.card_class_overrides ?? {}), [targetFromContext]: newClass };
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: ovCC2 } },
          `${ctx.cardMap.get(targetFromContext)?.CardName ?? targetFromContext}のクラスを＜${newClass}＞に変更`));
      }
      const ovCC2Op = { ...(ctx.otherState.card_class_overrides ?? {}), [targetFromContext]: newClass };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, card_class_overrides: ovCC2Op } },
        `${ctx.cardMap.get(targetFromContext)?.CardName ?? targetFromContext}のクラスを＜${newClass}＞に変更`));
    }
    // 対象選択（1体）
    const allSigniCC = [
      ...[0, 1, 2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
      ...[0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
    ];
    if (allSigniCC.length === 0) return done(addLog(ctx, 'クラス変更対象なし'));
    const changeClassStub: StubAction = { type: 'STUB', id: 'INTERNAL_APPLY_CLASS_CHANGE', value: newClass };
    return needsInteraction(addLog(ctx, `クラスを＜${newClass}＞に変更する対象を選択`), {
      type: 'SELECT_TARGET', candidates: allSigniCC, count: 1, optional: false,
      targetScope: 'self_field', thenAction: changeClassStub as EffectAction,
    });
  }
  // INTERNAL_APPLY_CLASS_CHANGE: 選択シグニのクラスを変更
  if (stub.id === 'INTERNAL_APPLY_CLASS_CHANGE') {
    const targetCnIACC = ctx.lastProcessedCards?.[0];
    const newClassIACC = typeof stub.value === 'string' ? stub.value : '';
    if (!targetCnIACC || !newClassIACC) return done(addLog(ctx, 'クラス変更適用失敗'));
    // 自分・相手どちらのフィールドかを判断
    const inOwnIACC = ctx.ownerState.field.signi.some(s => s?.at(-1) === targetCnIACC);
    if (inOwnIACC) {
      const overridesIACC = { ...(ctx.ownerState.card_class_overrides ?? {}), [targetCnIACC]: newClassIACC };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: overridesIACC } },
        `${ctx.cardMap.get(targetCnIACC)?.CardName ?? targetCnIACC}のクラスを＜${newClassIACC}＞に変更`));
    }
    const overridesIACCOp = { ...(ctx.otherState.card_class_overrides ?? {}), [targetCnIACC]: newClassIACC };
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, card_class_overrides: overridesIACCOp } },
      `${ctx.cardMap.get(targetCnIACC)?.CardName ?? targetCnIACC}のクラスを＜${newClassIACC}＞に変更`));
  }
  // LOSE_COLOR_ALL_ZONES: CONTINUOUS効果（effectEngine.collectColorlessOverridesで動的計算）
  if (stub.id === 'LOSE_COLOR_ALL_ZONES') {
    return done(addLog(ctx, '[LOSE_COLOR_ALL_ZONES: effectEngineで動的処理中]'));
  }
  // CHANGE_SIGNI_COLOR: 対象シグニの色を指定色に変更（ターン終了時まで）
  if (stub.id === 'CHANGE_SIGNI_COLOR') {
    // value がある場合：SELECT_TARGET の後処理（対象 = lastProcessedCards[0]）
    if (typeof stub.value === 'string' && ctx.lastProcessedCards?.length) {
      const targetCSC2 = ctx.lastProcessedCards[0];
      const newColorCSC2 = stub.value as string;
      const overridesCSC2 = { ...(ctx.otherState.signi_color_overrides ?? {}), [targetCSC2]: newColorCSC2 };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, signi_color_overrides: overridesCSC2 } },
        `${ctx.cardMap.get(targetCSC2)?.CardName ?? targetCSC2}の色を${newColorCSC2}に変更`));
    }
    const srcCSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCSC = srcCSC ? (srcCSC.EffectText ?? '') + ' ' + (srcCSC.BurstText ?? '') : '';
    // 変更先の色を抽出（「それを白にする」「赤にする」等）
    const colorMCSC = txtCSC.match(/それを([赤青緑黒白]+)にする/);
    const newColorCSC = colorMCSC ? colorMCSC[1] : null;
    if (!newColorCSC) return done(addLog(ctx, 'CHANGE_SIGNI_COLOR: 変更先色不明'));
    // レベルフィルタ（「レベルN以下のシグニ」）
    const toHWCSC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const lvMaxMCSC = txtCSC.match(/レベル([０-９\d]+)以下のシグニ/);
    const lvMaxCSC = lvMaxMCSC ? parseInt(toHWCSC(lvMaxMCSC[1])) : 99;
    // 相手シグニ1体を選択（lastProcessedCardsが既にあれば直接適用）
    const oppSigniCSC = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => {
      if (!c) return false;
      const lv = parseInt(ctx.cardMap.get(c)?.Level ?? '99');
      return lv <= lvMaxCSC;
    });
    if (oppSigniCSC.length === 0) return done(addLog(ctx, '相手シグニなし（CHANGE_SIGNI_COLOR）'));
    const targetCSC = ctx.lastProcessedCards?.[0];
    if (targetCSC && oppSigniCSC.includes(targetCSC)) {
      const overridesCSC = { ...(ctx.otherState.signi_color_overrides ?? {}), [targetCSC]: newColorCSC };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, signi_color_overrides: overridesCSC } },
        `${ctx.cardMap.get(targetCSC)?.CardName ?? targetCSC}の色を${newColorCSC}に変更`));
    }
    // 対象選択
    const applyCSC: StubAction = { type: 'STUB', id: 'CHANGE_SIGNI_COLOR', value: newColorCSC };
    return selectOrInteract(oppSigniCSC, 1, false, 'opp_field', applyCSC as EffectAction, undefined, ctx);
  }
  // カード属性変更系（engine: 属性変更システム未実装）
  // SIGNI_LOSE_COLOR: 対戦相手のシグニ1体が色を失う（ターン終了時まで）
  if (stub.id === 'SIGNI_LOSE_COLOR') {
    const targetSLC = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetSLC) {
      const oppOverridesSLC = { ...(ctx.otherState.signi_color_overrides ?? {}), [targetSLC]: '無' };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, signi_color_overrides: oppOverridesSLC } },
        `${ctx.cardMap.get(targetSLC)?.CardName ?? targetSLC}が色を失う`));
    }
    const oppCandsSLC = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    if (oppCandsSLC.length === 0) return done(addLog(ctx, '相手シグニなし（SIGNI_LOSE_COLOR）'));
    const applySLC: StubAction = { type: 'STUB', id: 'SIGNI_LOSE_COLOR' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: oppCandsSLC, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: applySLC as EffectAction,
    });
  }
  // COPY_SIGNI: 自フィールドシグニ1体をトラッシュのシグニと同じカードにする（ターン終了時まで）
  if (stub.id === 'COPY_SIGNI') {
    const fieldSigniCS = [0,1,2]
      .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => !!cn);
    const trashSigniCS = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    // Phase 1: lastProcessedCards にフィールドシグニがなければ選択
    const fieldTargetCS = (ctx.lastProcessedCards ?? []).find(cn => fieldSigniCS.includes(cn));
    if (!fieldTargetCS) {
      if (fieldSigniCS.length === 0) return done(addLog(ctx, 'コピー対象なし（自シグニなし）'));
      const noopCS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contCS: StubAction = { type: 'STUB', id: 'COPY_SIGNI' };
      return needsInteraction(addLog(ctx, 'コピーするシグニを選択（フィールドから）'), {
        type: 'SELECT_TARGET', candidates: fieldSigniCS, count: 1, optional: false,
        targetScope: 'self_field', thenAction: noopCS as EffectAction, continuation: contCS as EffectAction,
      });
    }
    // Phase 2: トラッシュシグニを選択（コピー元）
    if (trashSigniCS.length === 0) return done(addLog(ctx, 'コピー元なし（トラッシュにシグニなし）'));
    const noopCS2: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contCS2: StubAction = { type: 'STUB', id: 'INTERNAL_COPY_SIGNI_APPLY', value: fieldTargetCS };
    return needsInteraction(addLog(ctx, 'コピー元シグニを選択（トラッシュから）'), {
      type: 'SELECT_TARGET', candidates: trashSigniCS, count: 1, optional: false,
      targetScope: 'self_trash', thenAction: noopCS2 as EffectAction, continuation: contCS2 as EffectAction,
    });
  }
  // INTERNAL_COPY_SIGNI_APPLY: card_identity_overrides を設定してコピーを適用
  if (stub.id === 'INTERNAL_COPY_SIGNI_APPLY') {
    const fieldNumICSA = typeof stub.value === 'string' ? stub.value : '';
    const trashNumICSA = (ctx.lastProcessedCards ?? [])[0];
    if (!fieldNumICSA || !trashNumICSA) return done(addLog(ctx, 'コピー適用失敗'));
    const overridesICSA = { ...(ctx.ownerState.card_identity_overrides ?? {}), [fieldNumICSA]: trashNumICSA };
    const newOwnerICSA = { ...ctx.ownerState, card_identity_overrides: overridesICSA };
    const fieldName = ctx.cardMap.get(fieldNumICSA)?.CardName ?? fieldNumICSA;
    const trashName = ctx.cardMap.get(trashNumICSA)?.CardName ?? trashNumICSA;
    return done(addLog({ ...ctx, ownerState: newOwnerICSA },
      `${fieldName}が${trashName}と同じカードになる（ターン終了時まで）`));
  }
  // ALL_CLASS: CONTINUOUS→effectEngine.collectAllClassSigniで動的処理済み
  if (stub.id === 'ALL_CLASS') return done(addLog(ctx, '[ALL_CLASS: effectEngineで処理]'));
  // ALL_COLOR: CONTINUOUS→effectEngine.collectAllColorSigniで動的処理済み
  if (stub.id === 'ALL_COLOR') return done(addLog(ctx, '[ALL_COLOR: effectEngineで処理]'));
  // ALL_ZONE_BLACK: CONTINUOUS→effectEngine.collectAllZoneBlackCardNumsで動的処理済み
  if (stub.id === 'ALL_ZONE_BLACK') return done(addLog(ctx, '[ALL_ZONE_BLACK: effectEngineで処理]'));
  // ALL_CARDS_COLOR_CHANGE_BLACK: CONTINUOUS→effectEngine.hasAllCardsColorBlackで動的処理済み
  if (stub.id === 'ALL_CARDS_COLOR_CHANGE_BLACK') return done(addLog(ctx, '[ALL_CARDS_COLOR_CHANGE_BLACK: effectEngineで処理]'));
  // ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE: ゲーム全体ルリグタイプ付与（ログのみ）
  if (stub.id === 'ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE') return done(addLog(ctx, '[ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE: ゲーム全体効果ログ]'));
  // CHANGE_BASE_LEVEL: このシグニの基本レベルを1～3にしてもよい（ターン終了まで）
  if (stub.id === 'CHANGE_BASE_LEVEL') {
    const srcCBL = ctx.sourceCardNum;
    if (!srcCBL) return done(addLog(ctx, 'CHANGE_BASE_LEVEL: ソースなし'));
    if (typeof stub.value === 'number') {
      const newOvCBL = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [srcCBL]: stub.value as number };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: newOvCBL } },
        `${ctx.cardMap.get(srcCBL)?.CardName ?? srcCBL}の基本レベルを${stub.value}に変更`));
    }
    const optsCBL = [1,2,3].map(lv => ({
      id: `lv_${lv}`, label: `レベル${lv}にする`,
      action: ({ type: 'STUB', id: 'CHANGE_BASE_LEVEL', value: lv } as StubAction) as EffectAction,
      available: true,
    }));
    optsCBL.push({ id: 'skip', label: 'スキップ',
      action: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction) as EffectAction, available: true });
    return needsInteraction(addLog(ctx, '基本レベルを変更してもよい（1～3）'), {
      type: 'CHOOSE', options: optsCBL, count: 1,
    });
  }
  // CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN: シグニ1体の基本レベルを1にしてもよい（次の自ターン終了まで）
  if (stub.id === 'CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN') {
    if (ctx.lastProcessedCards?.length) {
      const targetCBLUNT = ctx.lastProcessedCards[0];
      const newOvCBLUNT = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [targetCBLUNT]: 1 };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: newOvCBLUNT } },
        `${ctx.cardMap.get(targetCBLUNT)?.CardName ?? targetCBLUNT}の基本レベルを1に変更`));
    }
    const allSigniCBLUNT = [...ctx.ownerState.field.signi, ...ctx.otherState.field.signi]
      .flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    if (allSigniCBLUNT.length === 0) return done(addLog(ctx, '対象シグニなし（CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN）'));
    const contCBLUNT: StubAction = { type: 'STUB', id: 'CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN' };
    return needsInteraction(addLog(ctx, 'シグニを選択（基本レベルを1にしてもよい）'), {
      type: 'SELECT_TARGET', candidates: allSigniCBLUNT, count: 1, optional: true,
      targetScope: 'self_field', thenAction: contCBLUNT as EffectAction,
    });
  }
  // COPY_CARD: このシグニはlastProcessed[0]のカードとレベル以外同じになる（card_identity_overrides）
  if (stub.id === 'COPY_CARD') {
    const srcCC = ctx.sourceCardNum;
    const targetCC = ctx.lastProcessedCards?.[0];
    if (!srcCC || !targetCC) return done(addLog(ctx, 'COPY_CARD: ソースまたはコピー元なし'));
    const overridesCC2 = { ...(ctx.ownerState.card_identity_overrides ?? {}), [srcCC]: targetCC };
    const newOwnerCC2: PlayerState = { ...ctx.ownerState, card_identity_overrides: overridesCC2 };
    return done(addLog({ ...ctx, ownerState: newOwnerCC2 },
      `${ctx.cardMap.get(srcCC)?.CardName ?? srcCC}が${ctx.cardMap.get(targetCC)?.CardName ?? targetCC}のコピーになる`));
  }
  // DECK_SIGNI_LEVEL_OVERRIDE: デッキ内指定クラスのシグニレベルをN扱い（このターン）
  if (stub.id === 'DECK_SIGNI_LEVEL_OVERRIDE') {
    const srcDSLO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDSLO = srcDSLO ? (srcDSLO.EffectText ?? '') : '';
    const toHWDSLO = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchDSLO = txtDSLO.match(/＜([^＞]+)＞のシグニのレベルを参照する場合/);
    const targetClassDSLO = classMatchDSLO?.[1] ?? '宇宙';
    const levelMatchDSLO = txtDSLO.match(/レベル([１-４\d]+)として扱って/);
    const levelDSLO = levelMatchDSLO ? parseInt(toHWDSLO(levelMatchDSLO[1])) : 4;
    const newOwnerDSLO: PlayerState = { ...ctx.ownerState, deck_signi_level_override: { class: targetClassDSLO, level: levelDSLO } };
    return done(addLog({ ...ctx, ownerState: newOwnerDSLO }, `デッキ内＜${targetClassDSLO}＞シグニのレベルをLv${levelDSLO}として扱う`));
  }
  // LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT: このカード自身のレベル参照をLv4として扱う（デッキ/手札/トラッシュ在中）
  if (stub.id === 'LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT') {
    return done(addLog(ctx, '[LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT: effectEngineで処理]'));
  }
  if (stub.id === 'DYNAMIC_LEVEL_BY_ENERGY'
      || stub.id === 'LEVEL_REFERENCE_OVERRIDE'
      || stub.id === 'CENTER_LRIG_COLOR_CHANGE_BLACK'
      || stub.id === 'INHERIT_OPP_LRIG_TYPE' || stub.id === 'INHERIT_UNDER_SIGNI_COLOR') {
    return done(addLog(ctx, `[属性変更: ${stub.id}]`));
  }
  // SIGNI_GAIN_ONE_LRIG_COLOR: このシグニがルリグの色を1つ得る（ターン終了時まで）
  if (stub.id === 'SIGNI_GAIN_ONE_LRIG_COLOR') {
    const srcSGOLC = ctx.sourceCardNum;
    if (!srcSGOLC) return done(addLog(ctx, 'SIGNI_GAIN_ONE_LRIG_COLOR: ソースなし'));
    const lrigCnSGOLC = ctx.ownerState.field.lrig.at(-1);
    const lrigColorSGOLC = lrigCnSGOLC ? (ctx.cardMap.get(lrigCnSGOLC)?.Color ?? '').split('')[0] : null;
    if (!lrigColorSGOLC) return done(addLog(ctx, 'SIGNI_GAIN_ONE_LRIG_COLOR: ルリグ色不明'));
    const origCardSGOLC = ctx.cardMap.get(srcSGOLC);
    const origColorSGOLC = origCardSGOLC?.Color ?? '無';
    const newColorSGOLC = origColorSGOLC.includes(lrigColorSGOLC) ? origColorSGOLC : origColorSGOLC + lrigColorSGOLC;
    const overridesSGOLC = { ...(ctx.ownerState.signi_color_overrides ?? {}), [srcSGOLC]: newColorSGOLC };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, signi_color_overrides: overridesSGOLC } },
      `${origCardSGOLC?.CardName ?? srcSGOLC}が${lrigColorSGOLC}を得る`));
  }
  // STACK_ALL_LRIG_UNDER: ルリグトラッシュ全ルリグをこのカードの下に置く
  if (stub.id === 'STACK_ALL_LRIG_UNDER') {
    const lrigTrashSALU = ctx.ownerState.lrig_trash ?? [];
    if (lrigTrashSALU.length === 0) return done(addLog(ctx, 'ルリグトラッシュなし（STACK_ALL_LRIG_UNDER）'));
    const newLrigStack = [...lrigTrashSALU, ...ctx.ownerState.field.lrig];
    const newOwnerSALU: PlayerState = {
      ...ctx.ownerState,
      lrig_trash: [],
      field: { ...ctx.ownerState.field, lrig: newLrigStack },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerSALU },
      `ルリグトラッシュ${lrigTrashSALU.length}枚をルリグスタック下に配置`));
  }
  // LRIG_RIDE_SIGNI: センタールリグがすべての乗機シグニに乗る（ドライブ状態）
  if (stub.id === 'LRIG_RIDE_SIGNI') {
    const ridingAllLRS = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('乗機') ? [top] : [];
    });
    if (ridingAllLRS.length === 0) return done(addLog(ctx, '乗機シグニなし（LRIG_RIDE_SIGNI）'));
    const newOwnerLRS = { ...ctx.ownerState, lrig_riding_signi: ridingAllLRS };
    return done(addLog({ ...ctx, ownerState: newOwnerLRS },
      `ルリグが${ridingAllLRS.length}体の乗機シグニに乗る（ドライブ状態）`));
  }
  // CENTER_LRIG_RIDES_ON_SIGNI: センタールリグが選択した1体の乗機シグニに乗る（乗り換え可）
  if (stub.id === 'CENTER_LRIG_RIDES_ON_SIGNI') {
    const selectedCLR = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (selectedCLR) {
      const newOwnerCLR = { ...ctx.ownerState, lrig_riding_signi: [selectedCLR] };
      return done(addLog({ ...ctx, ownerState: newOwnerCLR },
        `ルリグが${ctx.cardMap.get(selectedCLR)?.CardName ?? selectedCLR}に乗る（ドライブ状態）`));
    }
    const rideCandCLR = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('乗機') ? [top] : [];
    });
    if (rideCandCLR.length === 0) return done(addLog(ctx, '乗機シグニなし（CENTER_LRIG_RIDES_ON_SIGNI）'));
    const contCLR: StubAction = { type: 'STUB', id: 'CENTER_LRIG_RIDES_ON_SIGNI' };
    const noopCLR: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(rideCandCLR, 1, false, 'self_field', noopCLR as EffectAction, contCLR as EffectAction, ctx);
  }
  // CENTER_LRIG_DISMOUNT: センタールリグがすべての乗機シグニから降りる（ドライブ解除・任意）
  if (stub.id === 'CENTER_LRIG_DISMOUNT') {
    if (!ctx.ownerState.lrig_riding_signi?.length) {
      return done(addLog(ctx, 'ドライブ状態ではない（CENTER_LRIG_DISMOUNT スキップ）'));
    }
    const dismountOpt: StubAction = { type: 'STUB', id: 'INTERNAL_DISMOUNT_DO' };
    const skipOpt: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, 'センタールリグが乗機シグニから降りますか？'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'dismount', label: '降りる（ドライブ解除）', action: dismountOpt as EffectAction, available: true },
        { id: 'stay',     label: 'そのまま',              action: skipOpt as EffectAction,     available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_DISMOUNT_DO') {
    const newOwnerDM = { ...ctx.ownerState, lrig_riding_signi: [] };
    return done(addLog({ ...ctx, ownerState: newOwnerDM }, 'センタールリグが降りた（ドライブ解除）'));
  }
  // ルリグシステム（未実装残）
  if (stub.id === 'LRIG_GAIN_ABILITY' || stub.id === 'LRIG_ALL_NAMES'
      || stub.id === 'GAIN_ADDITIONAL_LRIG_TYPE' || stub.id === 'GAIN_LRIG_COLOR') {
    return done(addLog(ctx, `[ルリグシステム: ${stub.id}]`));
  }
  // ドロー枚数制限（次のターン）
  if (stub.id === 'LIMIT_OPP_DRAW_COUNT') {
    const srcLODC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLODC = srcLODC ? (srcLODC.EffectText ?? '') + ' ' + (srcLODC.BurstText ?? '') : '';
    const toHWLODC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const limitM = txtLODC.match(/合計([０-９\d]+)枚までしか引けない/);
    const limitVal = limitM ? parseInt(toHWLODC(limitM[1])) : 1;
    const newOtherLODC: PlayerState = { ...ctx.otherState, draw_limit: limitVal };
    return done(addLog({ ...ctx, otherState: newOtherLODC }, `対戦相手の次ターンのドロー上限${limitVal}枚に制限`));
  }
  // 手札上限増加（CONTINUOUS：シグニがフィールドにある間）
  // HAND_SIZE_INCREASE: 手札上限を増やす / REDUCE_OPP_HAND_LIMIT: 相手の手札上限を減らす
  if (stub.id === 'HAND_SIZE_INCREASE' || stub.id === 'REDUCE_OPP_HAND_LIMIT') {
    const srcHSI = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHSI = srcHSI ? (srcHSI.EffectText ?? '') + ' ' + (srcHSI.BurstText ?? '') : '';
    const toHWHSI = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 「手札をN枚まで」パターン（直接指定）
    const limitM = txtHSI.match(/手札を([０-９\d]+)枚まで/);
    // 「手札の枚数の上限はN増える（6枚からM枚になる）」パターン
    const increaseM = txtHSI.match(/手札の枚数の上限は([０-９\d]+)増える/);
    // 「6枚からN枚になる」パターン（括弧内の上限値）
    const becomeM = txtHSI.match(/[（(].*から([０-９\d]+)枚になる[）)]/);
    const DEFAULT_HAND = 6;
    let newLimit: number | null = null;
    if (limitM) newLimit = parseInt(toHWHSI(limitM[1]));
    else if (becomeM) newLimit = parseInt(toHWHSI(becomeM[1]));
    else if (increaseM) newLimit = DEFAULT_HAND + parseInt(toHWHSI(increaseM[1]));
    if (stub.id === 'HAND_SIZE_INCREASE' && newLimit !== null) {
      const newOwnerHSI = { ...ctx.ownerState, hand_limit: newLimit };
      return done(addLog({ ...ctx, ownerState: newOwnerHSI }, `手札上限を${newLimit}枚に設定`));
    }
    if (stub.id === 'REDUCE_OPP_HAND_LIMIT' && newLimit !== null) {
      const newOtherHSI = { ...ctx.otherState, hand_limit: newLimit };
      return done(addLog({ ...ctx, otherState: newOtherHSI }, `相手手札上限を${newLimit}枚に設定`));
    }
    return done(addLog(ctx, `[手札制限: ${stub.id}]`));
  }
  // ライフバースト特殊（engine: 発動システム改修必要）
  // LIFE_BURST_DOUBLE: このターン、次のライフバーストは2回発動する
  if (stub.id === 'LIFE_BURST_DOUBLE') {
    const newOwnerLBD: PlayerState = { ...ctx.ownerState, life_burst_double_next: true };
    return done(addLog({ ...ctx, ownerState: newOwnerLBD }, 'このターン次のライフバーストは2回発動する'));
  }
  // TRIGGER_LIFE_BURST: lastProcessedCards[0] のLBを発動（field.checkにセット）
  if (stub.id === 'TRIGGER_LIFE_BURST') {
    const cardTLB = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cardTLB) return done(addLog(ctx, 'TRIGGER_LIFE_BURST: カードなし'));
    const dataTLB = ctx.cardMap.get(cardTLB);
    if (!dataTLB?.BurstText) return done(addLog(ctx, `${dataTLB?.CardName ?? cardTLB}: LBなし`));
    const newOwnerTLB: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, check: cardTLB } };
    return done(addLog({ ...ctx, ownerState: newOwnerTLB },
      `ライフバースト発動: ${dataTLB.CardName}`));
  }
  // BATTLE_BANISH_LIFE_BURST: バトルバニッシュ後に相手側LBを発動
  if (stub.id === 'BATTLE_BANISH_LIFE_BURST') {
    const cardBBLB = ctx.lastProcessedCards?.[0];
    if (!cardBBLB) return done(addLog(ctx, 'BATTLE_BANISH_LIFE_BURST: カードなし'));
    const dataBBLB = ctx.cardMap.get(cardBBLB);
    if (!dataBBLB?.BurstText) return done(addLog(ctx, `${dataBBLB?.CardName ?? cardBBLB}: LBなし`));
    const newOtherBBLB: PlayerState = { ...ctx.otherState, field: { ...ctx.otherState.field, check: cardBBLB } };
    return done(addLog({ ...ctx, otherState: newOtherBBLB },
      `バトルバニッシュLB: ${dataBBLB.CardName}`));
  }
  // BEAT_ZONE_OP: ビートゾーン操作（「【ビート】にする」または「【ビート】がN枚以下」条件チェック）
  if (stub.id === 'BEAT_ZONE_OP') {
    const srcBZO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtBZO = srcBZO ? (srcBZO.EffectText ?? '') + ' ' + (srcBZO.BurstText ?? '') : '';
    const toHWBZO = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 条件チェックパターン: 「【ビート】がN枚以下の場合」
    const condMBZO = txtBZO.match(/【ビート】が([０-９\d]+)枚以下/);
    if (condMBZO) {
      const threshBZO = parseInt(toHWBZO(condMBZO[1]));
      const beatCountBZO = (ctx.ownerState.field.beat_zone ?? []).length;
      if (beatCountBZO > threshBZO) {
        return done(addLog(ctx, `ビート条件不成立（現在${beatCountBZO}枚 > ${threshBZO}）→スキップ`));
      }
      return done(addLog(ctx, `ビート条件成立（現在${beatCountBZO}枚 ≤ ${threshBZO}）`));
    }
    // 「【ビート】にする」: フィールドシグニを選択してビートゾーンへ
    const fieldCandsBZO = ctx.ownerState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    if (fieldCandsBZO.length === 0) return done(addLog(ctx, 'ビートにするシグニなし'));
    return needsInteraction(addLog(ctx, 'ビートにするシグニを選択'), {
      type: 'SELECT_TARGET', candidates: fieldCandsBZO, count: 1, optional: false,
      targetScope: 'self_field',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_MOVE_TO_BEAT' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_MOVE_TO_BEAT: 選択シグニをビートゾーンへ移動
  if (stub.id === 'INTERNAL_MOVE_TO_BEAT') {
    const cardIMTB = ctx.lastProcessedCards?.[0];
    if (!cardIMTB) return done(addLog(ctx, 'INTERNAL_MOVE_TO_BEAT: カードなし'));
    const newSigniIMTB = ctx.ownerState.field.signi.map(s => {
      if (!s?.at(-1)?.includes(cardIMTB)) return s;
      const f = s.filter(c => c !== cardIMTB);
      return f.length > 0 ? f : null;
    }) as (string[] | null)[];
    const newBeatIMTB = [...(ctx.ownerState.field.beat_zone ?? []), cardIMTB];
    const newOwnerIMTB: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniIMTB, beat_zone: newBeatIMTB } };
    return done(addLog({ ...ctx, ownerState: newOwnerIMTB },
      `${ctx.cardMap.get(cardIMTB)?.CardName ?? cardIMTB}をビートゾーンへ`));
  }
  if (stub.id === 'TRASH_SIGNI_TO_BEAT') {
    const selectedTSTB = ctx.lastProcessedCards ?? [];
    if (selectedTSTB.length > 0) {
      const newBeatTSTB = [...(ctx.ownerState.field.beat_zone ?? []), ...selectedTSTB];
      const newTrashTSTB = ctx.ownerState.trash.filter(cn => !selectedTSTB.includes(cn));
      const newOwnerTSTB: PlayerState = { ...ctx.ownerState, trash: newTrashTSTB, field: { ...ctx.ownerState.field, beat_zone: newBeatTSTB } };
      const namesTSTB = selectedTSTB.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
      return done(addLog({ ...ctx, ownerState: newOwnerTSTB }, `${namesTSTB}をビートゾーンへ`));
    }
    const candsTSTB = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (candsTSTB.length === 0) return done(addLog(ctx, 'トラッシュにシグニなし（TRASH_SIGNI_TO_BEAT）'));
    const noopTSTB: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contTSTB: StubAction = { type: 'STUB', id: 'TRASH_SIGNI_TO_BEAT' };
    return needsInteraction(addLog(ctx, 'ビートにするシグニを最大2枚選択'), {
      type: 'SELECT_TARGET', candidates: candsTSTB, count: Math.min(2, candsTSTB.length), optional: true,
      targetScope: 'self_trash', thenAction: noopTSTB as EffectAction, continuation: contTSTB as EffectAction,
    });
  }
  // SIGNI_UNDER_WEAPON_SIGNI: 自シグニ1体を自＜ウェポン＞シグニの下に置く
  if (stub.id === 'SIGNI_UNDER_WEAPON_SIGNI') {
    const ownFieldSUWS = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    const sourceSUWS = (ctx.lastProcessedCards ?? []).find(cn => ownFieldSUWS.includes(cn));
    if (!sourceSUWS) {
      if (ownFieldSUWS.length === 0) return done(addLog(ctx, '自シグニなし（SIGNI_UNDER_WEAPON_SIGNI）'));
      const noop: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const cont: StubAction = { type: 'STUB', id: 'SIGNI_UNDER_WEAPON_SIGNI' };
      return needsInteraction(addLog(ctx, '下に置くシグニを選択'), {
        type: 'SELECT_TARGET', candidates: ownFieldSUWS, count: 1, optional: false,
        targetScope: 'self_field', thenAction: noop as EffectAction, continuation: cont as EffectAction,
      });
    }
    const weaponCandsSUWS = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => !!cn && cn !== sourceSUWS &&
        (ctx.cardMap.get(cn)?.CardClass ?? '').includes('ウェポン'));
    if (weaponCandsSUWS.length === 0) return done(addLog(ctx, 'ウェポンシグニなし（SIGNI_UNDER_WEAPON_SIGNI）'));
    const applyStubSUWS: StubAction = { type: 'STUB', id: 'INTERNAL_SIGNI_UNDER_WEAPON', value: sourceSUWS };
    return needsInteraction(addLog(ctx, '下に置く先の＜ウェポン＞シグニを選択'), {
      type: 'SELECT_TARGET', candidates: weaponCandsSUWS, count: 1, optional: false,
      targetScope: 'self_field', thenAction: applyStubSUWS as EffectAction,
    });
  }
  // INTERNAL_SIGNI_UNDER_WEAPON: 選択シグニを＜ウェポン＞の下に配置
  if (stub.id === 'INTERNAL_SIGNI_UNDER_WEAPON') {
    const srcSUWI = typeof stub.value === 'string' ? stub.value : '';
    const weaponSUWI = ctx.lastProcessedCards?.[0];
    if (!srcSUWI || !weaponSUWI) return done(addLog(ctx, '対象なし（INTERNAL_SIGNI_UNDER_WEAPON）'));
    const signiSUWI = [...(ctx.ownerState.field.signi ?? [])] as (string[] | null)[];
    const srcZoneSUWI = signiSUWI.findIndex(s => s?.at(-1) === srcSUWI);
    const weaponZoneSUWI = signiSUWI.findIndex(s => s?.at(-1) === weaponSUWI);
    if (srcZoneSUWI < 0 || weaponZoneSUWI < 0) return done(addLog(ctx, 'ゾーン特定不可（INTERNAL_SIGNI_UNDER_WEAPON）'));
    const srcStackSUWI = [...(signiSUWI[srcZoneSUWI] ?? [])];
    signiSUWI[srcZoneSUWI] = srcStackSUWI.length > 1 ? srcStackSUWI.slice(0, -1) : null;
    signiSUWI[weaponZoneSUWI] = [srcSUWI, ...(signiSUWI[weaponZoneSUWI] ?? [])];
    const newOwnerSUWI = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: signiSUWI } };
    return done(addLog({ ...ctx, ownerState: newOwnerSUWI },
      `${ctx.cardMap.get(srcSUWI)?.CardName ?? srcSUWI}を${ctx.cardMap.get(weaponSUWI)?.CardName ?? weaponSUWI}の下に配置`));
  }
  // PLACE_DECK_TOP_UNDER_WEAPON_SIGNI: ウェポンシグニの下にデッキ上を置く
  if (stub.id === 'PLACE_DECK_TOP_UNDER_WEAPON_SIGNI') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const newSigniPDTUW = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const topCardPDTUW = ctx.ownerState.deck[0];
    // ウェポンシグニのゾーンを探す
    let placedPDTUW = false;
    for (let zi = 0; zi < 3; zi++) {
      const stack = newSigniPDTUW[zi];
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      const card = ctx.cardMap.get(topNum);
      if (card?.CardClass?.includes('ウェポン') || card?.CardClass?.includes('武器')) {
        newSigniPDTUW[zi] = [topCardPDTUW, ...stack]; // デッキ上をスタック底に追加
        placedPDTUW = true;
        break;
      }
    }
    if (!placedPDTUW) return done(addLog(ctx, 'ウェポンシグニなし'));
    const newOwnerPDTUW: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(1), field: { ...ctx.ownerState.field, signi: newSigniPDTUW } };
    return done(addLog({ ...ctx, ownerState: newOwnerPDTUW }, `ウェポン下にデッキ上配置: ${ctx.cardMap.get(topCardPDTUW)?.CardName ?? topCardPDTUW}`));
  }
  // PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON: 全ウェポンシグニの下にトラッシュからシグニを1枚ずつ置く
  if (stub.id === 'PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON') {
    const weaponZonesPTSUAW: number[] = [];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) continue;
      const c = ctx.cardMap.get(top);
      if (c?.CardClass?.includes('ウェポン') || c?.CardClass?.includes('武器')) weaponZonesPTSUAW.push(zi);
    }
    if (weaponZonesPTSUAW.length === 0) return done(addLog(ctx, 'ウェポンシグニなし'));
    const trashSigniPTSUAW = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (trashSigniPTSUAW.length === 0) return done(addLog(ctx, 'トラッシュにシグニなし'));
    // 1つ目のウェポンゾーンに1枚選択して配置
    const tgtZonePTSUAW = weaponZonesPTSUAW[0];
    return needsInteraction(addLog(ctx, `ウェポン（ゾーン${tgtZonePTSUAW + 1}）下にトラッシュシグニを置く`), {
      type: 'SELECT_TARGET',
      candidates: trashSigniPTSUAW,
      count: 1,
      optional: false,
      targetScope: 'self_trash',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_PTSUAW_PLACE', value: tgtZonePTSUAW } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_PTSUAW_PLACE: ウェポン下シグニ配置の実行
  if (stub.id === 'INTERNAL_PTSUAW_PLACE') {
    const zoneIdxIPTSUAW = typeof stub.value === 'number' ? stub.value : 0;
    const cardIPTSUAW = ctx.lastProcessedCards?.[0];
    if (!cardIPTSUAW) return done(addLog(ctx, 'INTERNAL_PTSUAW_PLACE: カードなし'));
    const newSigniIPTSUAW = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const existingStackIPTSUAW = newSigniIPTSUAW[zoneIdxIPTSUAW] ?? [];
    newSigniIPTSUAW[zoneIdxIPTSUAW] = [cardIPTSUAW, ...existingStackIPTSUAW];
    const newTrashIPTSUAW = ctx.ownerState.trash.filter(c => c !== cardIPTSUAW);
    const newOwnerIPTSUAW: PlayerState = { ...ctx.ownerState, trash: newTrashIPTSUAW, field: { ...ctx.ownerState.field, signi: newSigniIPTSUAW } };
    return done(addLog({ ...ctx, ownerState: newOwnerIPTSUAW }, `ウェポン下に配置: ${ctx.cardMap.get(cardIPTSUAW)?.CardName ?? cardIPTSUAW}`));
  }
  // CONDITIONAL_TRASH_UNDER_SIGNI: 相手エナN枚以上の場合、シグニ下カードを任意でトラッシュ
  if (stub.id === 'CONDITIONAL_TRASH_UNDER_SIGNI') {
    const toHWCTUS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcCTUS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCTUS = srcCTUS ? (srcCTUS.EffectText ?? '') + ' ' + (srcCTUS.BurstText ?? '') : '';
    const enaMCTUS = txtCTUS.match(/エナゾーンにカードが([０-９\d]+)枚以上/);
    const enaThreshCTUS = enaMCTUS ? parseInt(toHWCTUS(enaMCTUS[1])) : 3;
    if (ctx.otherState.energy.length < enaThreshCTUS) {
      return done(addLog(ctx, `条件不成立（相手エナ${ctx.otherState.energy.length}枚 < ${enaThreshCTUS}）`));
    }
    // シグニ下カード（スタック深さ>1のもの）を収集
    const underCardsCTUS: string[] = ctx.ownerState.field.signi.flatMap(stack => {
      if (!stack || stack.length <= 1) return [];
      return stack.slice(0, stack.length - 1); // top以外
    });
    if (underCardsCTUS.length === 0) return done(addLog(ctx, 'シグニ下カードなし'));
    const noopCTUS: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, 'シグニ下カードをトラッシュに置きますか？'), {
      type: 'SELECT_TARGET',
      candidates: underCardsCTUS,
      count: 1,
      optional: true,
      targetScope: 'self_field',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_TRASH_UNDER_SIGNI' } as StubAction) as EffectAction,
      continuation: noopCTUS as EffectAction,
    });
  }
  // INTERNAL_TRASH_UNDER_SIGNI: シグニ下カードをトラッシュへ移動
  if (stub.id === 'INTERNAL_TRASH_UNDER_SIGNI') {
    const cardITUS = ctx.lastProcessedCards?.[0];
    if (!cardITUS) return done(addLog(ctx, 'INTERNAL_TRASH_UNDER_SIGNI: カードなし'));
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
      `${ctx.cardMap.get(cardITUS)?.CardName ?? cardITUS}をシグニ下からトラッシュへ`));
  }
  // LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE: 相手シグニ合計1回アタック制限
  if (stub.id === 'LIMIT_OPP_SIGNI_ATTACKS_ONCE' || stub.id === 'OPP_SIGNI_ONE_ATTACK_TOTAL' || stub.id === 'LIMIT_OPP_ATTACK_ONCE') {
    const newOtherOSA: PlayerState = { ...ctx.otherState, signi_attack_once_limit: true };
    return done(addLog({ ...ctx, otherState: newOtherOSA }, '相手シグニは合計1回しかアタックできない'));
  }
  // アタック制限系（engine: アタック制限システム未実装）
  if (stub.id === 'ONE_ATTACK_PER_TURN' || stub.id === 'ODD_LEVEL_SIGNI_CANT_ATTACK'
      || stub.id === 'ATTACK_COUNT_BY_POWER'
      || stub.id === 'ADJACENT_ZONE_ATTACK'
      || stub.id === 'MULTI_ZONE_ATTACK' || stub.id === 'BLOCK_FRONT_SIGNI_ATTACK') {
    return done(addLog(ctx, `[アタック制限: ${stub.id}]`));
  }
  // BLOCK_OPP_ARTS_SPELL_ACT: このターン対戦相手はアーツ・スペル・起動能力を使用できない
  if (stub.id === 'BLOCK_OPP_ARTS_SPELL_ACT') {
    const newBlockedBOASA = [...(ctx.otherState.blocked_actions ?? []), 'USE_ARTS', 'USE_SPELL', 'USE_ACT'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBOASA } },
      'このターン、対戦相手はアーツ・スペル・起動能力を使用できない'));
  }
  // BLOCK_COLORLESS_PLAY: 相手の無色プレイを封じる
  if (stub.id === 'BLOCK_COLORLESS_PLAY') {
    const newBlockedBCP = [...(ctx.otherState.blocked_actions ?? []), 'PLAY_COLORLESS'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBCP } },
      '相手は無色カードをプレイできない'));
  }
  // BLOCK_ALL_OPP_ACTIVATE_ABILITY: 全相手起動能力封じ
  if (stub.id === 'BLOCK_ALL_OPP_ACTIVATE_ABILITY') {
    const newBlockedBAAA = [...(ctx.otherState.blocked_actions ?? []), 'USE_ACT'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBAAA } },
      '相手は起動能力を使用できない'));
  }
  // ブロック系（engine: 行動ブロック未実装）
  // BLOCK_OPP_SPELL_ACT_NEXT_TURN: 次の対戦相手のターン中、スペルと起動能力を使用できない
  if (stub.id === 'BLOCK_OPP_SPELL_ACT_NEXT_TURN') {
    const blockedBOSANT = [...(ctx.otherState.blocked_actions ?? []), 'USE_SPELL:NEXT_TURN', 'USE_ACT:NEXT_TURN'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: blockedBOSANT } },
      '次の対戦相手のターン中、相手はスペルと起動能力を使用できない'));
  }
  // BLOCK_OPP_AUTO_ABILITY_EXTENDED: このターンと次のターン、相手シグニの【自】能力は発動しない
  if (stub.id === 'BLOCK_OPP_AUTO_ABILITY_EXTENDED') {
    const newBlocedBOAE = [
      ...(ctx.ownerState.blocked_actions ?? []),
      'BLOCK_OPP_SIGNI_AUTO',
      'BLOCK_OPP_SIGNI_AUTO:NEXT_TURN',
    ];
    const newOwnerBOAE: PlayerState = { ...ctx.ownerState, blocked_actions: newBlocedBOAE };
    return done(addLog({ ...ctx, ownerState: newOwnerBOAE }, 'このターンと次のターン: 相手シグニの【自】能力は発動しない'));
  }
  if (stub.id === 'BLOCK_NON_WHITE_SPELL'
      || stub.id === 'BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT' || stub.id === 'BLOCK_OPP_DECK_TO_ENERGY'
      || stub.id === 'BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT') {
    return done(addLog(ctx, `[ブロック効果: ${stub.id}]`));
  }
  // OPP_TURN_NO_ENERGY_COST: 対戦相手の次のターン中、対戦相手はエナコストを支払えない
  if (stub.id === 'OPP_TURN_NO_ENERGY_COST') {
    // エナコストを必要とする全アクションをブロック（アーツ/スペル/グロウ/起動能力）
    const newBlockedOTNEC = [
      ...(ctx.otherState.blocked_actions ?? []),
      'USE_ARTS:NEXT_TURN', 'USE_SPELL:NEXT_TURN',
      'GROW:NEXT_TURN', 'USE_ACT:NEXT_TURN',
    ];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedOTNEC } },
      '対戦相手の次のターン中、対戦相手はエナコストを支払えない（アーツ/スペル/グロウ/起動能力すべて）'));
  }
  // OPP_MAIN_PHASE_LIMIT_DOWN: 次の相手メインフェイズの間、センタールリグのリミット-2
  if (stub.id === 'OPP_MAIN_PHASE_LIMIT_DOWN') {
    const newOtherMPLD: PlayerState = { ...ctx.otherState, pending_lrig_limit_mod: (ctx.otherState.pending_lrig_limit_mod ?? 0) - 2 };
    return done(addLog({ ...ctx, otherState: newOtherMPLD }, '次の相手メインフェイズ中、相手リミット-2'));
  }
  // OPP_SIGNI_ATTACK_COST: ターン終了時まで、相手シグニのアタックに《無》×2コスト
  if (stub.id === 'OPP_SIGNI_ATTACK_COST') {
    const newOtherSAC: PlayerState = { ...ctx.otherState, signi_attack_cost: 2 };
    return done(addLog({ ...ctx, otherState: newOtherSAC }, 'ターン終了時まで、対戦相手シグニアタックに《無》×2コスト'));
  }
  // OPP_ZONE_PLACEMENT_RESTRICT: CONTINUOUS効果（effectEngineで動的判定）
  if (stub.id === 'OPP_ZONE_PLACEMENT_RESTRICT') {
    return done(addLog(ctx, '[配置制限: OPP_ZONE_PLACEMENT_RESTRICT（CONTINUOUS）]'));
  }
  // コストアップ系（engine: コスト計算未実装）
  if (stub.id === 'FIRST_SPELL_COST_UP' || stub.id === 'OPP_LRIG_ATTACK_COST'
      || stub.id === 'ARTS_COLORLESS_MUST_PAY_CENTER_COLOR') {
    return done(addLog(ctx, `[コストアップ/制限: ${stub.id}]`));
  }
  // シグニ移動/リダイレクト系（engine: 移動先変更未実装）
  // MOVE_TO_ATTACKER_FRONT: 相手シグニアタック時、正面が空なら自分をその正面に移動（してもよい）
  if (stub.id === 'MOVE_TO_ATTACKER_FRONT') {
    const srcMTAF = ctx.sourceCardNum;
    if (!srcMTAF) return done(addLog(ctx, 'アタッカー前移動：ソースなし'));
    // アタッカーゾーンを特定（stub.value 優先、なければ attacked_signi_ids から動的取得）
    let targetZoneMTAF: number;
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
    if (targetZoneMTAF < 0) return done(addLog(ctx, 'アタッカー前移動：ゾーン特定不可'));
    // 自分の同ゾーンが空でなければ移動不可
    const frontStack = ctx.ownerState.field.signi[targetZoneMTAF];
    if (frontStack && frontStack.length > 0 && frontStack.at(-1) !== srcMTAF) {
      return done(addLog(ctx, `アタッカー正面ゾーン${targetZoneMTAF + 1}は占有済み（移動不可）`));
    }
    const curZoneMTAF = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcMTAF);
    if (curZoneMTAF < 0) return done(addLog(ctx, 'アタッカー前移動：フィールドにいない'));
    if (curZoneMTAF === targetZoneMTAF) return done(addLog(ctx, 'アタッカー前移動：すでに正面ゾーン'));
    // 移動するかどうか選択
    const moveStubMTAF: StubAction = { type: 'STUB', id: 'INTERNAL_MOVE_TO_ZONE', value: targetZoneMTAF };
    const skipStubMTAF: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, `ゾーン${targetZoneMTAF + 1}（アタッカー正面）に移動してもよい`), {
      type: 'CHOOSE',
      options: [
        { id: 'move', label: `ゾーン${targetZoneMTAF + 1}に移動`, action: moveStubMTAF as EffectAction, available: true },
        { id: 'skip', label: 'スキップ', action: skipStubMTAF as EffectAction, available: true },
      ],
      count: 1,
    });
  }
  // OPP_TRASH_LOSE_COLOR_AND_CLASS: CONT効果（effectEngineで処理）
  if (stub.id === 'OPP_TRASH_LOSE_COLOR_AND_CLASS') {
    return done(addLog(ctx, '[OPP_TRASH_LOSE_COLOR_AND_CLASS: effectEngineで処理]'));
  }
  // FORCE_TARGET_SELF: このシグニしか対象にできない（ログのみ）
  if (stub.id === 'FORCE_TARGET_SELF') {
    return done(addLog(ctx, `[強制自己対象: ${stub.id}]`));
  }
  // BANISH_BY_SELF_GOES_TO_TRASH: このシグニによるバニッシュはエナでなくトラッシュへ
  if (stub.id === 'BANISH_BY_SELF_GOES_TO_TRASH') {
    const srcBBSGTT = ctx.sourceCardNum;
    if (!srcBBSGTT) return done(addLog(ctx, 'BANISH_BY_SELF_GOES_TO_TRASH: ソースなし'));
    const currentBTBS = ctx.ownerState.banish_to_trash_by_self ?? [];
    const newBTBS = [...new Set([...currentBTBS, srcBBSGTT])];
    const newOwnerBBSGTT: PlayerState = { ...ctx.ownerState, banish_to_trash_by_self: newBTBS };
    return done(addLog({ ...ctx, ownerState: newOwnerBBSGTT },
      `${ctx.cardMap.get(srcBBSGTT)?.CardName ?? srcBBSGTT}のバニッシュ→トラッシュへ誘導`));
  }
  // CRASH_TO_TRASH_INSTEAD: このターン相手のライフクロスクラッシュ時、エナではなくトラッシュへ
  if (stub.id === 'CRASH_TO_TRASH_INSTEAD') {
    const newOwner = { ...ctx.ownerState, crash_to_trash_instead: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン、クラッシュされたカードはトラッシュに置かれる'));
  }
  // BANISH_REDIRECT_TO_HAND: このターン、対戦相手のシグニがバニッシュされる場合エナゾーンではなく手札に戻る
  if (stub.id === 'BANISH_REDIRECT_TO_HAND') {
    const newOwnerBRTH: PlayerState = { ...ctx.ownerState, banish_redirect_to_hand: true };
    return done(addLog({ ...ctx, ownerState: newOwnerBRTH }, 'このターン、対戦相手のシグニバニッシュ先→手札'));
  }
  // OPP_RETURN_HAND_ON_SELF_BANISH: バニッシュされたとき、対戦相手は手札を1枚デッキの一番上に置く
  if (stub.id === 'OPP_RETURN_HAND_ON_SELF_BANISH') {
    const candsORHOSB = ctx.otherState.hand;
    if (candsORHOSB.length === 0) return done(addLog(ctx, '対戦相手の手札なし（OPP_RETURN_HAND_ON_SELF_BANISH）'));
    const ttdActionORHOSB: EffectAction = {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'HAND_CARD', owner: 'opponent', count: 1 },
      shuffle: false,
      position: 'top',
    } as TransferToDeckAction;
    return selectOrInteract(candsORHOSB, 1, false, 'opp_hand', ttdActionORHOSB, undefined, ctx, true);
  }
  // MULTI_DAMAGE_ON_LRIG_ATTACK: このターン、ルリグアタックをN回与える（lrig_attack_remainingフラグでBattleScreen側が管理）
  if (stub.id === 'MULTI_DAMAGE_ON_LRIG_ATTACK') {
    const srcMDALA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMDALA = srcMDALA ? (srcMDALA.EffectText ?? '') + ' ' + (srcMDALA.BurstText ?? '') : '';
    const toHWMDALA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mMDALA = txtMDALA.match(/ダメージを([０-９\d]+)回与える/);
    const totalMDALA = mMDALA ? parseInt(toHWMDALA(mMDALA[1])) : 3;
    // 残り回数 = 合計 - 1（1回目は通常アタック扱い）
    const newOwnerMDALA = { ...ctx.ownerState, lrig_attack_remaining: totalMDALA - 1 };
    return done(addLog({ ...ctx, ownerState: newOwnerMDALA }, `このターン、ルリグが${totalMDALA}回アタックする（残り${totalMDALA - 1}回）`));
  }
  // ダメージ特殊（engine: ダメージ処理拡張必要）
  if (stub.id === 'ATTACK_PHASE_LEVEL_OVERRIDE') {
    return done(addLog(ctx, `[ダメージ/フェイズ特殊: ${stub.id}]`));
  }
  // ウェポン・プロテクション系（engine: 種族保護フラグ未実装）
  // DRIVE_SIGNI_PREVENT_DOWN: ドライブ状態のシグニに対戦相手の効果によるダウン防止を付与
  if (stub.id === 'DRIVE_SIGNI_PREVENT_DOWN') {
    const targetDSPD = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetDSPD) {
      const grantsDSPD = { ...(ctx.ownerState.keyword_grants ?? {}) };
      const prevDSPD = grantsDSPD[targetDSPD] ?? [];
      const protKey = 'PROTECTION:DOWN:opponent';
      if (!prevDSPD.includes(protKey)) grantsDSPD[targetDSPD] = [...prevDSPD, protKey];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsDSPD } },
        `${ctx.cardMap.get(targetDSPD)?.CardName ?? targetDSPD}→ターン終了時まで対戦相手効果によるダウン不可`));
    }
    const driveCandsDSPD = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => !!cn);
    if (driveCandsDSPD.length === 0) return done(addLog(ctx, '自フィールドにシグニなし（DRIVE_SIGNI_PREVENT_DOWN）'));
    const applyDSPD: StubAction = { type: 'STUB', id: 'DRIVE_SIGNI_PREVENT_DOWN' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: driveCandsDSPD, count: 1, optional: false,
      targetScope: 'self_field', thenAction: applyDSPD as EffectAction,
    });
  }
  // DRIVE_CONT_BANISH_RESIST: ドライブ常→このシグニはバニッシュされない（effectEngineで処理）
  if (stub.id === 'DRIVE_CONT_BANISH_RESIST') {
    return done(addLog(ctx, '[ドライブ常：バニッシュ耐性（effectEngine動的処理）]'));
  }
  // DRIVE_AUTO_BANISH_ALL_OPP: ドライブ自→アタック時に相手全シグニをバニッシュ（IS_DRIVE_STATEチェック付き）
  if (stub.id === 'DRIVE_AUTO_BANISH_ALL_OPP') {
    if (!(ctx.ownerState.lrig_riding_signi?.includes(ctx.sourceCardNum ?? ''))) {
      return done(addLog(ctx, 'ドライブ状態でない（DRIVE_AUTO_BANISH_ALL_OPP スキップ）'));
    }
    const oppAllDABA = [0, 1, 2].flatMap(zi => {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      return top ? [top] : [];
    });
    if (oppAllDABA.length === 0) return done(addLog(ctx, '相手シグニなし（DRIVE_AUTO_BANISH_ALL_OPP）'));
    let newOtherDABA = ctx.otherState;
    for (const cn of oppAllDABA) {
      const removed = removeFromField(cn, newOtherDABA);
      newOtherDABA = { ...removed, trash: [...removed.trash, cn] };
    }
    return done(addLog({ ...ctx, otherState: newOtherDABA }, `ドライブ自：相手全シグニ${oppAllDABA.length}体をバニッシュ`));
  }
  if (stub.id === 'WEAPON_SIGNI_PROTECT_DOWN'
      || stub.id === 'WEAPON_SIGNI_PROTECTION' || stub.id === 'ARM_SIGNI_LRIG_PROTECTION'
      || stub.id === 'WHITE_SIGNI_ABILITY_PROTECT' || stub.id === 'WEAPON_SIGNI_PREVENT_DOWN') {
    return done(addLog(ctx, `[種族保護: ${stub.id}]`));
  }
  // === バッチ17: パワー反転・条件分岐・ターゲット系 ===
  // REVERSE_OPP_POWER_MINUS: 相手シグニのパワーマイナス修正を反転（プラスに）
  if (stub.id === 'REVERSE_OPP_POWER_MINUS') {
    const modsRPM = (ctx.otherState.temp_power_mods ?? []).map(m => m.delta < 0 ? { ...m, delta: Math.abs(m.delta) } : m);
    const newOtherRPM: PlayerState = { ...ctx.otherState, temp_power_mods: modsRPM };
    return done(addLog({ ...ctx, otherState: newOtherRPM }, '相手シグニのパワーマイナスを反転（プラスに）'));
  }
  // NEGATE_THAT_ATTACK: 現在のアタックを無効化
  if (stub.id === 'NEGATE_THAT_ATTACK') {
    // lastProcessedCards の1枚目を攻撃中のシグニとして無効化
    const attackerNTA = ctx.lastProcessedCards?.[0];
    if (attackerNTA) {
      const negatedNTA = [...(ctx.ownerState.negated_attacks ?? []), attackerNTA];
      const newSNTA: PlayerState = { ...ctx.ownerState, negated_attacks: negatedNTA };
      return done(addLog({ ...ctx, ownerState: newSNTA }, `${ctx.cardMap.get(attackerNTA)?.CardName ?? attackerNTA}のアタックを無効化`));
    }
    return done(addLog(ctx, 'アタック無効化（対象不明）'));
  }
  // NEGATE_NTH_ATTACK: このターン、相手シグニのアタックをN回目まで自動無効化
  if (stub.id === 'NEGATE_NTH_ATTACK') {
    const toHWNNA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcNNA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtNNA = srcNNA ? (srcNNA.EffectText ?? '') + ' ' + (srcNNA.BurstText ?? '') : '';
    // 「一度目か二度目」→2, 「一度目」→1, テキスト不明→1
    let nNNA = 1;
    if (txtNNA.match(/[一1１]度目か[二2２]度目/)) nNNA = 2;
    else if (txtNNA.match(/[一1１]度目か[二2２]度目か[三3３]度目/)) nNNA = 3;
    else { const m = txtNNA.match(/([０-９\d一二三四五六七八九十]+)回目/); if (m) nNNA = parseInt(toHWNNA(m[1])) || 1; }
    const cur = ctx.ownerState.negate_opp_signi_attacks_until ?? 0;
    const newOwner = { ...ctx.ownerState, negate_opp_signi_attacks_until: Math.max(cur, nNNA) };
    return done(addLog({ ...ctx, ownerState: newOwner }, `このターン、相手シグニアタックを${nNNA}回目まで自動無効化`));
  }
  // NEGATE_COIN_ABILITY: コイン能力を無効化（ログのみ）
  if (stub.id === 'NEGATE_COIN_ABILITY') {
    const newOtherNCA: PlayerState = { ...ctx.otherState, negate_coin_abilities: true };
    return done(addLog({ ...ctx, otherState: newOtherNCA }, 'このターン、対戦相手のコイン能力（ベット）を発動できない'));
  }
  // NEGATE_ALL_OPP_EFFECTS: 相手のCONTINUOUS効果を全て無効化（all_cont_effects_negatedフラグ）
  if (stub.id === 'NEGATE_ALL_OPP_EFFECTS') {
    const newOtherNAOE: PlayerState = { ...ctx.otherState, all_cont_effects_negated: true };
    return done(addLog({ ...ctx, otherState: newOtherNAOE },
      '相手のCONTINUOUS効果を全て無効化（このターン）'));
  }
  // EFFECT_LIMIT: 連続効果の上限枚数をキャップ（直前のパワー修正を上限値でキャップ）
  if (stub.id === 'EFFECT_LIMIT') {
    const srcEL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtEL = srcEL ? (srcEL.EffectText ?? '') + ' ' + (srcEL.BurstText ?? '') : '';
    const toHWEL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const capMEL = txtEL.match(/この効果は([０-９\d]+)枚(?:まで|までしか)/);
    if (capMEL && ctx.sourceCardNum) {
      const cap = parseInt(toHWEL(capMEL[1]));
      // temp_power_mods の最後のエントリをキャップ（deltaPerUnit * cap が上限）
      const mods = [...(ctx.ownerState.temp_power_mods ?? [])];
      if (mods.length > 0) {
        const last = mods[mods.length - 1];
        // deltaPerUnit を推定（最後のdelta / 現在のカウントから逆算が困難なので単純に cap を使う）
        // 最も単純な実装：delta の絶対値が cap * 1000 を超える場合キャップ
        const capVal = cap * 1000;
        if (Math.abs(last.delta) > capVal) {
          mods[mods.length - 1] = { ...last, delta: last.delta > 0 ? capVal : -capVal };
          return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: mods } },
            `効果上限: ${cap}枚（パワー修正を${last.delta > 0 ? '+' : '-'}${capVal}にキャップ）`));
        }
      }
      return done(addLog(ctx, `効果上限: ${cap}枚（キャップ内）`));
    }
    return done(addLog(ctx, '効果制限'));
  }
  // DISONA_RESTRICTION: DISONA制限（ログのみ）
  if (stub.id === 'DISONA_RESTRICTION') {
    return done(addLog(ctx, 'DISONA制限'));
  }
  // COIN_SPEND_CONDITION: ターン終了時にコイン消費チェック、未達時トラッシュ
  if (stub.id === 'COIN_SPEND_CONDITION') {
    // lastProcessedCards[0] が今ターン場に出たシグニ → ターン終了時チェック対象として登録
    const cnCCSC = ctx.lastProcessedCards?.[0];
    if (!cnCCSC) return done(addLog(ctx, '[COIN_SPEND_CONDITION: 対象シグニなし]'));
    const srcCCSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCCSC = srcCCSC ? (srcCCSC.EffectText ?? '') : '';
    const toHWCCSC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const minCoinsM = txtCCSC.match(/《コインアイコン》を合計([０-９\d]+)枚以上支払っていなかった場合/);
    const minCoins = minCoinsM ? parseInt(toHWCCSC(minCoinsM[1])) : 1;
    const newCCSC = [...(ctx.ownerState.coin_condition_signi_instances ?? []), cnCCSC];
    const newOwnerCCSC: PlayerState = { ...ctx.ownerState, coin_condition_signi_instances: newCCSC };
    return done(addLog({ ...ctx, ownerState: newOwnerCCSC }, `コイン消費チェック登録：${ctx.cardMap.get(cnCCSC)?.CardName ?? cnCCSC}（コイン${minCoins}枚以上要）`));
  }
  // COIN_USE_RESTRICTION: コイン使用先をスペルとシグニに限定（ゲーム中永続）
  if (stub.id === 'COIN_USE_RESTRICTION') {
    const newOwnerCUR: PlayerState = { ...ctx.ownerState, coin_use_restriction: 'spell_signi_only' };
    return done(addLog({ ...ctx, ownerState: newOwnerCUR }, 'このゲームの間：コインはスペルとシグニにしか支払えない'));
  }
  // INCREASE_ACT_ABILITY_COST: 起動能力のコストを増加（ログのみ）
  if (stub.id === 'INCREASE_ACT_ABILITY_COST') {
    return done(addLog(ctx, '起動能力コスト増加'));
  }
  // CONDITIONAL_KEYWORD_BY_CENTER_COLOR: センタールリグの色に応じてキーワード付与
  if (stub.id === 'CONDITIONAL_KEYWORD_BY_CENTER_COLOR') {
    const centerCKBC = ctx.ownerState.field.lrig.at(-1);
    const centerCardCKBC = centerCKBC ? ctx.cardMap.get(centerCKBC) : undefined;
    const centerColorCKBC = centerCardCKBC?.Color ?? '';
    const srcCKBC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCKBC = srcCKBC ? (srcCKBC.EffectText ?? '') : '';
    const mKwCKBC = txtCKBC.match(/【([^】]+)】/);
    const kwCKBC = mKwCKBC ? mKwCKBC[1] : 'ランサー';
    const mColorCKBC = txtCKBC.match(/(赤|青|緑|白|黒)/);
    const condColorCKBC = mColorCKBC ? mColorCKBC[1] : '';
    if (condColorCKBC && !centerColorCKBC.includes(condColorCKBC)) {
      return done(addLog(ctx, `センター色${centerColorCKBC}≠${condColorCKBC}（条件不達成）`));
    }
    // 自分のフィールドシグニにキーワード付与
    const kwGrantsCKBC = { ...(ctx.ownerState.keyword_grants ?? {}) };
    (ctx.ownerState.field.signi ?? []).forEach(s => {
      if (s && s.length > 0) {
        const cn = s[s.length - 1];
        const existing = kwGrantsCKBC[cn] ?? [];
        if (!existing.includes(kwCKBC)) kwGrantsCKBC[cn] = [...existing, kwCKBC];
      }
    });
    const newSCKBC: PlayerState = { ...ctx.ownerState, keyword_grants: kwGrantsCKBC };
    return done(addLog({ ...ctx, ownerState: newSCKBC }, `センター色${centerColorCKBC}→全シグニに【${kwCKBC}】付与`));
  }
  // SELECT_OTHER_SIGNI: ソース以外のシグニを選択
  if (stub.id === 'SELECT_OTHER_SIGNI') {
    const srcSOS = ctx.sourceCardNum;
    const candsSOS = (ctx.ownerState.field.signi ?? []).flatMap(s => {
      if (!s || s.length === 0) return [];
      const top = s[s.length - 1];
      return top !== srcSOS ? [top] : [];
    });
    if (candsSOS.length === 0) return done(addLog(ctx, '選択可能な他シグニなし'));
    const noopSOS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsSOS, count: 1, optional: true,
      targetScope: 'self_field', thenAction: noopSOS as EffectAction,
    });
  }
  // ENERGY_LEVEL_CONDITION_CHOOSE: エナにレベルN以上があればCHOOSE提示
  if (stub.id === 'ENERGY_LEVEL_CONDITION_CHOOSE') {
    const toHWELCC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcELCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtELCC = srcELCC ? (srcELCC.EffectText ?? '') + ' ' + (srcELCC.BurstText ?? '') : '';
    const mLvELCC = txtELCC.match(/レベル([０-９\d]+)以上/);
    const threshELCC = mLvELCC ? parseInt(toHWELCC(mLvELCC[1])) : 4;
    const hasLevelELCC = ctx.ownerState.energy.some(cn => {
      const lv = parseInt(toHWELCC(ctx.cardMap.get(cn)?.Level ?? '0')) || 0;
      return lv >= threshELCC;
    });
    if (!hasLevelELCC) return done(addLog(ctx, `エナにLv${threshELCC}以上なし（条件不達成）`));
    return done(addLog(ctx, `エナにLv${threshELCC}以上あり（条件達成）→選択効果`));
  }
  // LEVEL_BASED_CONDITIONAL: 公開したシグニのレベルN枚だけ手札を捨てる
  if (stub.id === 'LEVEL_BASED_CONDITIONAL') {
    const toHWLBC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealedLBC = ctx.lastProcessedCards?.[0];
    const revealedCardLBC = revealedLBC ? ctx.cardMap.get(revealedLBC) : undefined;
    const levelLBC = revealedCardLBC ? (parseInt(toHWLBC(revealedCardLBC.Level ?? '0')) || 0) : 0;
    if (levelLBC === 0 || ctx.ownerState.hand.length === 0) {
      return done(addLog(ctx, `レベル条件: Lv${levelLBC}→手札捨てなし`));
    }
    const discardNLBC = Math.min(levelLBC, ctx.ownerState.hand.length);
    const discardActionLBC: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: discardNLBC } };
    return selectOrInteract(ctx.ownerState.hand, discardNLBC, false, 'self_hand', discardActionLBC as EffectAction, undefined,
      addLog(ctx, `レベル${levelLBC}のシグニ → 手札${discardNLBC}枚捨て`));
  }
  // OPP_DECLARE_COLOR: 相手が色を宣言（5色CHOOSE opponentResponds→INTERNAL_SET_OPP_DECLARED_COLOR）
  if (stub.id === 'OPP_DECLARE_COLOR') {
    const colorsODC = ['白', '赤', '青', '緑', '黒'];
    const setColorODC = (c: string): StubAction => ({ type: 'STUB', id: 'INTERNAL_SET_OPP_DECLARED_COLOR', value: c });
    const optsODC = colorsODC.map(c => ({
      id: `opp_color_${c}`, label: `${c}を宣言`, action: setColorODC(c) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, '対戦相手が色を宣言する（白/赤/青/緑/黒）'), {
      type: 'CHOOSE', options: optsODC, count: 1, opponentResponds: true,
    });
  }
  if (stub.id === 'INTERNAL_SET_OPP_DECLARED_COLOR') {
    const colorSODC = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const newOtherSODC = { ...ctx.otherState, declared_color: colorSODC };
    return done(addLog({ ...ctx, otherState: newOtherSODC }, `対戦相手が色「${colorSODC}」を宣言`));
  }
  // COLLAB: コラボ効果
  if (stub.id === 'COLLAB') {
    const srcCL = ctx.sourceCardNum ? ctx.cardMap.get(getCardNum(ctx.sourceCardNum)) : undefined;
    const txtCL = (srcCL?.EffectText ?? '') + ' ' + (srcCL?.BurstText ?? '');
    // 「コラボライバーN人を呼ぶ」= ルリグデッキからアシストルリグをアシストゾーンに配置
    const callM = txtCL.match(/コラボライバー([２2])人を呼ぶ/);
    const callCount = callM ? 2 : txtCL.includes('コラボライバー') && txtCL.includes('呼ぶ') ? 1 : 0;
    if (callCount > 0) {
      const lrigDk = ctx.ownerState.lrig_deck;
      const assistInDk = lrigDk.filter(cn => {
        const c = ctx.cardMap.get(getCardNum(cn));
        return c?.Type === 'アシストルリグ';
      });
      if (assistInDk.length === 0) return done(addLog(ctx, 'コラボライバーなし'));
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
      return done(addLog({ ...ctx, ownerState: ns, lastProcessedCards: placedIds }, `コラボライバー${placed}人を呼んだ`));
    }
    // 「コラボしてもよい」: 任意でアシストルリグを1人召喚
    const assistAvailCL = ctx.ownerState.lrig_deck.filter(cn => {
      const c = ctx.cardMap.get(getCardNum(cn));
      return c?.Type === 'アシストルリグ';
    });
    const hasAssistSpaceCL = (ctx.ownerState.field.assist_lrig_l?.length ?? 0) === 0 ||
      (ctx.ownerState.field.assist_lrig_r?.length ?? 0) === 0;
    if (assistAvailCL.length === 0 || !hasAssistSpaceCL) {
      return done(addLog(ctx, 'コラボ: アシストルリグまたは空きゾーンなし'));
    }
    const noopCL: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, 'コラボしますか？（コラボライバーを1人呼ぶ）'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'collab_yes', label: 'コラボする', action: ({ type: 'STUB', id: 'INTERNAL_DO_COLLAB', value: 1 } as StubAction) as EffectAction, available: true },
        { id: 'collab_no', label: 'しない', action: noopCL as EffectAction, available: true },
      ],
    });
  }
  // INTERNAL_DO_COLLAB: コラボ実行（アシストルリグ1人を配置）
  if (stub.id === 'INTERNAL_DO_COLLAB') {
    const assistInDkIDC = ctx.ownerState.lrig_deck.filter(cn => {
      const c = ctx.cardMap.get(getCardNum(cn));
      return c?.Type === 'アシストルリグ';
    });
    if (assistInDkIDC.length === 0) return done(addLog(ctx, 'コラボライバーなし'));
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
      `コラボ: ${ctx.cardMap.get(getCardNum(toPlaceIDC))?.CardName ?? toPlaceIDC}を召喚`));
  // GATE: ゲート効果（ログのみ）
  // GATE: 相手のシグニゾーン1つに【ゲート】を設置（次のアタックフェイズに条件付きでアタック不可）
  if (stub.id === 'GATE') {
    const zoneOptsGATE = [0, 1, 2].map(zi => ({
      id: `gate_zone_${zi}`,
      label: `相手ゾーン${zi + 1}に【ゲート】設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_GATE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '【ゲート】を設置するゾーンを選択'), {
      type: 'CHOOSE', options: zoneOptsGATE, count: 1,
    });
  }
  if (stub.id === 'INTERNAL_SET_GATE') {
    const gateZoneIdx: number = (typeof stub.value === 'number' ? stub.value : 0) as number;
    const currentGates = [...(ctx.otherState.signi_gate_zones ?? [])];
    if (!currentGates.includes(gateZoneIdx)) currentGates.push(gateZoneIdx);
    // ゲートゾーンの相手シグニを blocked_actions に追加（アタック不可）
    const gateTop = ctx.otherState.field.signi[gateZoneIdx]?.at(-1);
    const blocked = [...(ctx.otherState.blocked_actions ?? [])];
    if (gateTop) blocked.push(`ATTACK:${gateTop}`);
    const newOtherGATE = { ...ctx.otherState, signi_gate_zones: currentGates, blocked_actions: blocked };
    return done(addLog({ ...ctx, otherState: newOtherGATE }, `相手ゾーン${gateZoneIdx + 1}に【ゲート】設置`));
  }
  // PLACE_MAGIC_BOX: lastProcessedCards[0]のカードをMBとして設置（ゾーン選択→INTERNAL_SET_MAGIC_BOX）
  if (stub.id === 'PLACE_MAGIC_BOX') {
    const cardPMB = ctx.lastProcessedCards?.[0] ?? null;
    if (!cardPMB) return done(addLog(ctx, '【マジックボックス】設置：カードなし'));
    const zoneLabelsPMB = [0, 1, 2].map(zi => {
      const existingMB = (ctx.ownerState.field.signi_magic_boxes ?? [null, null, null])[zi];
      const label = existingMB
        ? `ゾーン${zi + 1}（既存MBを上書き）`
        : `ゾーン${zi + 1}に設置`;
      return { id: `zone_${zi}`, label, action: ({ type: 'STUB', id: 'INTERNAL_SET_MAGIC_BOX', value: zi } as StubAction) as EffectAction, available: true };
    });
    return needsInteraction(addLog(ctx, '【マジックボックス】を設置するゾーンを選択'), {
      type: 'CHOOSE', options: zoneLabelsPMB, count: 1,
    });
  }
  // INTERNAL_SET_MAGIC_BOX: ゾーン確定後の実設置処理
  if (stub.id === 'INTERNAL_SET_MAGIC_BOX') {
    const zoneIdxSMB: number = (typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'))) as number;
    const cardSMB = ctx.lastProcessedCards?.[0] ?? null;
    if (!cardSMB) return done(addLog(ctx, 'INTERNAL_SET_MAGIC_BOX：カードなし'));
    const currentMBs = [...(ctx.ownerState.field.signi_magic_boxes ?? [null, null, null])] as (string | null)[];
    const newTrashSMB = [...ctx.ownerState.trash];
    if (currentMBs[zoneIdxSMB]) newTrashSMB.push(currentMBs[zoneIdxSMB]!);
    currentMBs[zoneIdxSMB] = cardSMB;
    // カードをデッキ/手札から除去（どちらにあっても対応）
    const newDeckSMB = ctx.ownerState.deck.filter(c => c !== cardSMB);
    const newHandSMB = ctx.ownerState.hand.filter(c => c !== cardSMB);
    const newOwnerSMB: PlayerState = {
      ...ctx.ownerState,
      deck: newDeckSMB,
      hand: newHandSMB,
      trash: newTrashSMB,
      field: { ...ctx.ownerState.field, signi_magic_boxes: currentMBs },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerSMB }, `【マジックボックス】設置: ゾーン${zoneIdxSMB + 1}（${ctx.cardMap.get(cardSMB ?? '')?.CardName ?? cardSMB}）`));
  }
  // OPEN_MAGIC_BOX: このシグニと同ゾーンのMBを表向きにしてトラッシュへ（任意）
  if (stub.id === 'OPEN_MAGIC_BOX') {
    const srcOMB = ctx.sourceCardNum;
    const signiFieldOMB = ctx.ownerState.field.signi;
    const zoneIdxOMB = signiFieldOMB.findIndex(stack => stack?.includes(srcOMB ?? ''));
    const mbsOMB = ctx.ownerState.field.signi_magic_boxes ?? [null, null, null];
    const mbCardOMB = zoneIdxOMB >= 0 ? (mbsOMB[zoneIdxOMB] ?? null) : null;
    if (!mbCardOMB) return done(addLog(ctx, `ゾーン${zoneIdxOMB >= 0 ? zoneIdxOMB + 1 : '?'}にMBなし`));
    const mbNameOMB = ctx.cardMap.get(mbCardOMB ?? '')?.CardName ?? (mbCardOMB ?? '');
    const noopOMB: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, `【マジックボックス】（${mbNameOMB}）を表向きにしますか？`), {
      type: 'CHOOSE',
      options: [
        {
          id: 'open', label: '表向きにしてトラッシュへ',
          action: ({ type: 'STUB', id: 'INTERNAL_OPEN_MB_DO', value: zoneIdxOMB } as StubAction) as EffectAction,
          available: true,
        },
        { id: 'skip', label: 'しない', action: noopOMB as EffectAction, available: true },
      ],
      count: 1,
    });
  }
  // INTERNAL_OPEN_MB_DO: MB表向き確定後のトラッシュ移動
  if (stub.id === 'INTERNAL_OPEN_MB_DO') {
    const zoneIdxOD = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const mbsOD = [...(ctx.ownerState.field.signi_magic_boxes ?? [null, null, null])] as (string | null)[];
    const mbCardOD = mbsOD[zoneIdxOD];
    if (!mbCardOD) return done(addLog(ctx, 'INTERNAL_OPEN_MB_DO：MBなし'));
    mbsOD[zoneIdxOD] = null;
    const newOwnerOD: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, mbCardOD],
      field: { ...ctx.ownerState.field, signi_magic_boxes: mbsOD },
    };
    return done(addLog(
      { ...ctx, ownerState: newOwnerOD, lastProcessedCards: [mbCardOD] },
      `【マジックボックス】公開: ${ctx.cardMap.get(mbCardOD)?.CardName ?? mbCardOD}→トラッシュ`,
    ));
  }
  // TARGET_OPP_SIGNI_ONLY / TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE: 対象修飾子（ログのみ）
  if (stub.id === 'TARGET_OPP_SIGNI_ONLY' || stub.id === 'TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE') {
    return done(addLog(ctx, '相手シグニを対象とする'));
  }
  // USE_CONDITION_ARTS_USED: このターンにアーツを使用していた場合、このカードは使用不可
  // actions_done に 'USE_ARTS' が含まれるかチェック（BattleScreenがartsUse時に追加）
  if (stub.id === 'USE_CONDITION_ARTS_USED') {
    const usedArtsUCU = ctx.ownerState.actions_done?.includes('USE_ARTS') ?? false;
    if (usedArtsUCU) {
      return done(addLog(ctx, 'このターンすでにアーツを使用済み → 使用不可'));
    }
    return done(addLog(ctx, 'アーツ未使用 → 使用可'));
  }
  // CENTER_ZONE_CONDITION: このシグニが中央ゾーン（zone[1]）にある場合のみ続行
  if (stub.id === 'CENTER_ZONE_CONDITION') {
    const srcCZC = ctx.sourceCardNum;
    if (srcCZC) {
      const centerStack = ctx.ownerState.field.signi[1];
      const inCenter = centerStack?.includes(srcCZC) ?? false;
      if (!inCenter) return done(addLog(ctx, '中央ゾーン条件: 不成立（スキップ）'));
    }
    return done(addLog(ctx, '中央ゾーン条件: 成立'));
  }
  // DEPLOY_RESTRICT: 配置制限（CONTINUOUSは動的処理、AUTOはフラグ設置）
  if (stub.id === 'DEPLOY_RESTRICT') {
    const srcDR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDR = srcDR ? (srcDR.EffectText ?? '') : '';
    const toHWDR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 「パワーN以上のシグニを新たに場に出せない」→ 相手に配置パワー上限を設定
    const powerCapM = txtDR.match(/パワー([０-９\d万]+)以上.*(?:新たに)?場に出せない/);
    if (powerCapM) {
      const cap = parseInt(toHWDR(powerCapM[1]).replace('万', '0000'));
      const newOtherDR = { ...ctx.otherState, signi_deploy_power_limit: cap };
      return done(addLog({ ...ctx, otherState: newOtherDR },
        `対戦相手はパワー${cap}以上のシグニを場に出せない（次ターンまで）`));
    }
    // 「〜の効果によってしか新たに場に出せない」→ 自分シグニへの配置制限（ログのみ）
    if (txtDR.includes('効果によってしか') || txtDR.includes('効果以外')) {
      return done(addLog(ctx, `配置制限（特定効果のみ）：${srcDR?.CardName ?? ''}は特定効果でのみ場に出せる`));
    }
    return done(addLog(ctx, '配置制限（パターン解析不可）'));
  }
  // DEFEAT: 敗北処理 - ライフクロスを0にしてゲーム終了を誘発
  if (stub.id === 'DEFEAT') {
    if (ctx.ownerState.prevent_defeat) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_defeat: undefined } },
        '敗北無効（PREVENT_DEFEAT発動）'));
    }
    const newOwnerDEFEAT: PlayerState = { ...ctx.ownerState, life_cloth: [] };
    return done(addLog({ ...ctx, ownerState: newOwnerDEFEAT }, '敗北（ライフクロス0）'));
  }
  // REPEAT_N_TIMES / REPEAT_EFFECT: 以下をN回繰り返す
  if (stub.id === 'REPEAT_N_TIMES' || stub.id === 'REPEAT_EFFECT') {
    const srcRNT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRNT = srcRNT ? (srcRNT.EffectText ?? '') + ' ' + (srcRNT.BurstText ?? '') : '';
    const toHWRNT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const nM = txtRNT.match(/以下を([２-９\d]+)回行う/);
    const nRNT = nM ? parseInt(toHWRNT(nM[1])) : 1;
    // パワー修正パターン
    const pwMRNT = txtRNT.match(/パワーを([－-][０-９\d]+)する/);
    if (pwMRNT) {
      const delta = parseInt(toHWRNT(pwMRNT[1]).replace('－', '-'));
      const totalDelta = delta * nRNT;
      const modsRNT = [...(ctx.otherState.temp_power_mods ?? [])];
      [0,1,2].forEach(zi => {
        const top = ctx.otherState.field.signi[zi]?.at(-1);
        if (top) modsRNT.push({ cardNum: top, delta: totalDelta });
      });
      return done(addLog({...ctx, otherState: {...ctx.otherState, temp_power_mods: modsRNT}},
        `${nRNT}回繰り返し: 全シグニパワー${totalDelta}（${delta}×${nRNT}）`));
    }
    // デッキトラッシュパターン（相手）
    const millMRNT = txtRNT.match(/デッキの上からカードを([０-９\d]+)枚トラッシュに置く/);
    if (millMRNT) {
      const millPerRound = parseInt(toHWRNT(millMRNT[1]));
      const totalMill = millPerRound * nRNT;
      const toTrashRNT = ctx.otherState.deck.slice(0, Math.min(totalMill, ctx.otherState.deck.length));
      const newOtherRNT = { ...ctx.otherState, deck: ctx.otherState.deck.slice(toTrashRNT.length), trash: [...ctx.otherState.trash, ...toTrashRNT] };
      return done(addLog({...ctx, otherState: newOtherRNT}, `${nRNT}回繰り返し: デッキ${toTrashRNT.length}枚トラッシュ`));
    }
    // ドローパターン（自分）
    const drawMRNT = txtRNT.match(/カードを([０-９\d]+)枚引く/);
    if (drawMRNT) {
      const drawPerRound = parseInt(toHWRNT(drawMRNT[1]));
      const totalDraw = drawPerRound * nRNT;
      const canDraw = Math.min(totalDraw, ctx.ownerState.deck.length);
      const newOwnerRNTDraw: PlayerState = {
        ...ctx.ownerState,
        hand: [...ctx.ownerState.hand, ...ctx.ownerState.deck.slice(0, canDraw)],
        deck: ctx.ownerState.deck.slice(canDraw),
      };
      return done(addLog({ ...ctx, ownerState: newOwnerRNTDraw }, `${nRNT}回繰り返し: ${canDraw}枚ドロー`));
    }
    // パワーアップパターン（自シグニ・正の値）
    const pwUpMRNT = txtRNT.match(/パワーを[＋+]([０-９\d]+)する/);
    if (pwUpMRNT) {
      const deltaUp = parseInt(toHWRNT(pwUpMRNT[1]));
      const totalDeltaUp = deltaUp * nRNT;
      const targetRNTUp = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
      if (targetRNTUp) {
        const modsRNTUp = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: targetRNTUp, delta: totalDeltaUp }];
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsRNTUp } },
          `${nRNT}回繰り返し: パワー+${totalDeltaUp}`));
      }
    }
    // バウンスパターン（相手シグニを手札へ）
    if (txtRNT.includes('手札に戻す') && nRNT > 0) {
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
        return done(addLog({ ...ctx, otherState: newOtherBounce }, `${nRNT}回繰り返し: バウンス${toBounce.length}体`));
      }
    }
    // パワーダウン＋デッキミル複合パターン（例：銀鏡イオリ「－5000＋デッキ2枚」×N）
    const pwDownMillM = txtRNT.match(/パワーを([－-][０-９\d]+)する.*?デッキの上からカードを([０-９\d]+)枚トラッシュ/);
    if (pwDownMillM) {
      const deltaPDM = parseInt(toHWRNT(pwDownMillM[1]).replace('－', '-'));
      const millPerPDM = parseInt(toHWRNT(pwDownMillM[2]));
      // 相手シグニに1体ずつパワーダウン（nRNT回、ランダムに振り分け）
      const modsRNTPDM = [...(ctx.otherState.temp_power_mods ?? [])];
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
        `${nRNT}回繰り返し: パワー${deltaPDM}×${nRNT}＋デッキ${toTrashPDM.length}枚トラッシュ`));
    }
    // 両者デッキミルパターン（例：「あなたか対戦相手のデッキの上からN枚トラッシュ」→両者にmill）
    const bothMillM = txtRNT.match(/あなたか対戦相手のデッキの上からカードを([０-９\d]+)枚トラッシュ/);
    if (bothMillM) {
      const millPerBMRNT = parseInt(toHWRNT(bothMillM[1]));
      const totalBMRNT = millPerBMRNT * nRNT;
      const toTrashOwnerBM = ctx.ownerState.deck.slice(0, Math.min(totalBMRNT, ctx.ownerState.deck.length));
      const toTrashOtherBM = ctx.otherState.deck.slice(0, Math.min(totalBMRNT, ctx.otherState.deck.length));
      const newOwnerBM = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(toTrashOwnerBM.length), trash: [...ctx.ownerState.trash, ...toTrashOwnerBM] };
      const newOtherBM = { ...ctx.otherState, deck: ctx.otherState.deck.slice(toTrashOtherBM.length), trash: [...ctx.otherState.trash, ...toTrashOtherBM] };
      return done(addLog({ ...ctx, ownerState: newOwnerBM, otherState: newOtherBM },
        `${nRNT}回繰り返し: 両者デッキ${millPerBMRNT}枚×${nRNT}トラッシュ`));
    }
    return done(addLog(ctx, `${nRNT}回繰り返し効果（後続ステップで処理）`));
  }
  // PLACE_CHOKKIN: sourceCardNumのゾーンに【貯菌】カウンターを+1
  if (stub.id === 'PLACE_CHOKKIN') {
    if (!ctx.sourceCardNum) return done(addLog(ctx, 'チョッキン設置先不明'));
    let ziPC = -1;
    for (let i = 0; i < 3; i++) {
      if (ctx.ownerState.field.signi[i]?.at(-1) === ctx.sourceCardNum) { ziPC = i; break; }
    }
    if (ziPC < 0) return done(addLog(ctx, 'チョッキン設置先シグニなし'));
    const chokkinPC = [...(ctx.ownerState.field.signi_chokkin ?? [0, 0, 0])];
    chokkinPC[ziPC] = (chokkinPC[ziPC] ?? 0) + 1;
    const newOwnerPC: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_chokkin: chokkinPC } };
    return done(addLog({ ...ctx, ownerState: newOwnerPC }, `【貯菌】×${chokkinPC[ziPC]}（ゾーン${ziPC + 1}）`));
  }
  // ADD_RESONANCE_CONDITION: ルリグデッキのレゾナにアタックフェイズタイミングを追加（effectEngineで処理）
  if (stub.id === 'ADD_RESONANCE_CONDITION') {
    return done(addLog(ctx, '[ADD_RESONANCE_CONDITION: effectEngineで処理済み]'));
  }
  // IGNORE_LRIG_RESTRICTION_ARTS: ルリグ制限アーツを無視（ログのみ）
  if (stub.id === 'IGNORE_LRIG_RESTRICTION_ARTS') {
    return done(addLog(ctx, 'ルリグ制限アーツを無視'));
  }
  // COST_COLOR_SELECT: 支払ったエナの色ごとに1色選択し、選択色のシグニをデッキから手札に加える
  if (stub.id === 'COST_COLOR_SELECT') {
    const srcCCS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const costCCS = srcCCS ? (Array.isArray((srcCCS as any).Cost) ? (srcCCS as any).Cost : []) : [];
    // コスト色一覧からユニーク色セットを生成（無色は全色選択可）
    const colorsCCS = ['白', '赤', '青', '緑', '黒'];
    const costColorsCCS: string[] = [];
    if (Array.isArray(costCCS)) {
      for (const c of costCCS) {
        if (c.color && c.color !== '無') {
          for (let i = 0; i < (c.count ?? 1); i++) costColorsCCS.push(c.color);
        } else if (c.color === '無') {
          // 無色は全色選択可能を代表して追加
          for (let i = 0; i < (c.count ?? 1); i++) costColorsCCS.push('ANY');
        }
      }
    }
    // 実際に支払ったエナのカードから色を収集（best-effort）
    const energyBeforeCCS = ctx.ownerState.energy;
    const paidColorsCCS: string[] = costColorsCCS.length > 0 ? costColorsCCS : colorsCCS.slice(0, 1);
    // 選択肢：各色1つのシグニをデッキから手札に
    const chosenColorsCCS = [...new Set(paidColorsCCS.filter(c => c !== 'ANY'))];
    const anyCount = paidColorsCCS.filter(c => c === 'ANY').length;
    // CHOOSE で選択する色を提示
    const colorOptsCCS = colorsCCS.map(col => ({
      id: `ccs_${col}`, label: `《${col}》のシグニを手札に`,
      action: ({ type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ', color: col }, maxCount: 1, then: { type: 'SEQUENCE', steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }] }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } } as EffectAction),
      available: true,
    }));
    const totalCountCCS = chosenColorsCCS.length + anyCount || 1;
    if (totalCountCCS >= colorOptsCCS.length) {
      // 全色分：SEARCH を色ごとに順次実行
      return done(addLog(ctx, `コスト色選択：${totalCountCCS}色のシグニをデッキから手札へ`));
    }
    return needsInteraction(addLog(ctx, `コスト色選択（${totalCountCCS}色）`), {
      type: 'CHOOSE', options: colorOptsCCS, count: Math.min(totalCountCCS, colorOptsCCS.length), multiSelect: true,
    });
  }
  // HASTARLIQ: 【ハスターリク】(WXDi-P05-TK01A)を相手シグニゾーンに設置
  if (stub.id === 'HASTARLIQ') {
    const selectedZoneHL = typeof stub.value === 'number' ? stub.value : -1;
    if (selectedZoneHL >= 0) {
      const currentHL = [...(ctx.otherState.hastarliq_zones ?? [])];
      if (!currentHL.includes(selectedZoneHL)) currentHL.push(selectedZoneHL);
      const newOtherHL = { ...ctx.otherState, hastarliq_zones: currentHL };
      return done(addLog({ ...ctx, otherState: newOtherHL }, `相手ゾーン${selectedZoneHL + 1}に【ハスターリク】設置`));
    }
    const setHLZone = (zi: number): StubAction => ({ type: 'STUB', id: 'HASTARLIQ', value: zi });
    const zoneOptsHL = [0, 1, 2].map(zi => ({
      id: `hastarliq_zone_${zi}`,
      label: `相手ゾーン${zi + 1}に設置`,
      action: setHLZone(zi) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '【ハスターリク】を設置するゾーンを選択'), {
      type: 'CHOOSE', options: zoneOptsHL, count: 1,
    });
  }
  // HASTARLIQ_TRIGGER: アタックフェイズ開始時発動（BattleScreenがスタックに積む）
  // 相手に「手札を1枚捨てる」か「《無》を支払う」か「どちらも行わない（→バニッシュ）」を選ばせる
  if (stub.id === 'HASTARLIQ_TRIGGER') {
    const zoneHL = typeof stub.value === 'number' ? stub.value : 0;
    const signiStackHLT = ctx.otherState.field.signi[zoneHL];
    if (!signiStackHLT || signiStackHLT.length === 0) {
      return done(addLog(ctx, `【ハスターリク】ゾーン${zoneHL + 1}: シグニなし（不発）`));
    }
    const canPayHLT    = ctx.otherState.energy.length >= 1;
    const canDiscardHLT = ctx.otherState.hand.length >= 1;
    const optsHLT = [];
    if (canDiscardHLT) {
      optsHLT.push({
        id: 'hl_discard',
        label: '手札を1枚捨てる',
        action: { type: 'STUB', id: 'INTERNAL_HL_SELECT_DISCARD', value: zoneHL } as EffectAction,
        available: true,
      });
    }
    if (canPayHLT) {
      optsHLT.push({
        id: 'hl_pay',
        label: '《無》を1枚支払う',
        action: { type: 'STUB', id: 'INTERNAL_HL_PAY', value: zoneHL } as EffectAction,
        available: true,
      });
    }
    optsHLT.push({
      id: 'hl_neither',
      label: 'どちらも行わない（シグニがバニッシュ）',
      action: { type: 'STUB', id: 'INTERNAL_HL_BANISH', value: zoneHL } as EffectAction,
      available: true,
    });
    const targetNameHLT = ctx.cardMap.get(signiStackHLT.at(-1)!)?.CardName ?? signiStackHLT.at(-1)!;
    return needsInteraction(addLog(ctx, `【ハスターリク】発動：ゾーン${zoneHL + 1}の${targetNameHLT}を守りますか？`), {
      type: 'CHOOSE', options: optsHLT, count: 1, opponentResponds: true,
    });
  }
  // INTERNAL_HL_SELECT_DISCARD: 手札を1枚選んで捨てる（ハスターリク回避）
  if (stub.id === 'INTERNAL_HL_SELECT_DISCARD') {
    if (ctx.otherState.hand.length === 0) {
      return done(addLog(ctx, '【ハスターリク】：手札なし（捨て不可）'));
    }
    const noopHLS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contHLS: StubAction = { type: 'STUB', id: 'INTERNAL_HL_DO_DISCARD' };
    return needsInteraction(addLog(ctx, '【ハスターリク】：手札から1枚捨てる'), {
      type: 'SELECT_TARGET',
      candidates: ctx.otherState.hand,
      count: 1,
      optional: false,
      targetScope: 'opp_hand',
      thenAction: noopHLS as EffectAction,
      continuation: contHLS as EffectAction,
      opponentResponds: true,
    });
  }
  // INTERNAL_HL_DO_DISCARD: 選択した手札をトラッシュへ→バニッシュ回避
  if (stub.id === 'INTERNAL_HL_DO_DISCARD') {
    const discardedHLD = ctx.lastProcessedCards?.[0];
    if (!discardedHLD) return done(addLog(ctx, '【ハスターリク】：手札捨て失敗'));
    const newOtherHLD: PlayerState = {
      ...ctx.otherState,
      hand:  ctx.otherState.hand.filter(c => c !== discardedHLD),
      trash: [...ctx.otherState.trash, discardedHLD],
    };
    return done(addLog({ ...ctx, otherState: newOtherHLD },
      `【ハスターリク】：${ctx.cardMap.get(discardedHLD)?.CardName ?? discardedHLD}を捨てた→バニッシュ回避`));
  }
  // INTERNAL_HL_PAY: 《無》1枚支払い→バニッシュ回避
  if (stub.id === 'INTERNAL_HL_PAY') {
    if (ctx.otherState.energy.length < 1) {
      return done(addLog(ctx, '【ハスターリク】：エナ不足（支払い不可）'));
    }
    const newOtherHLP: PlayerState = {
      ...ctx.otherState,
      energy: ctx.otherState.energy.slice(1),
    };
    return done(addLog({ ...ctx, otherState: newOtherHLP }, '【ハスターリク】：《無》1枚支払い→バニッシュ回避'));
  }
  // INTERNAL_HL_BANISH: どちらも行わない→そのゾーンのシグニをバニッシュ（エナへ）
  if (stub.id === 'INTERNAL_HL_BANISH') {
    const zoneHLB = typeof stub.value === 'number' ? stub.value : 0;
    const signiStackHLB = ctx.otherState.field.signi[zoneHLB];
    const topHLB = signiStackHLB?.at(-1);
    if (!topHLB) return done(addLog(ctx, `【ハスターリク】ゾーン${zoneHLB + 1}: シグニなし（バニッシュ不要）`));
    const newFieldSigHLB = [...ctx.otherState.field.signi] as (string[] | null)[];
    const remaining = signiStackHLB!.slice(0, -1);
    newFieldSigHLB[zoneHLB] = remaining.length > 0 ? remaining : null;
    const newOtherHLB: PlayerState = {
      ...ctx.otherState,
      energy: [...ctx.otherState.energy, topHLB],
      field: { ...ctx.otherState.field, signi: newFieldSigHLB },
    };
    return done(addLog({ ...ctx, otherState: newOtherHLB },
      `【ハスターリク】：${ctx.cardMap.get(topHLB)?.CardName ?? topHLB}をバニッシュ（エナへ）`));
  }
  // ACTIVATE_EICHI_ABILITY: コイン能力でこのシグニの【出】効果を再発動
  if (stub.id === 'ACTIVATE_EICHI_ABILITY') {
    const srcAEA = ctx.sourceCardNum ? ctx.cardMap.get(getCardNum(ctx.sourceCardNum)) : undefined;
    if (!srcAEA) return done(addLog(ctx, 'エイチ能力発動：ソースカードなし'));
    const eichiEffs = parseCardEffects(srcAEA);
    const onPlayAEA = eichiEffs.find(e => e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY'));
    if (onPlayAEA) {
      return exec(onPlayAEA.action, addLog(ctx, `エイチ能力発動：${srcAEA.CardName}の【出】効果を再発動`));
    }
    return done(addLog(ctx, `エイチ能力発動（${srcAEA.CardName}）：ON_PLAYなし`));
  }
  // CHANGE_EICHI_SIGNI_BASE_LEVEL: 英知シグニを選択→基本レベルを1～3に変更（ターン終了まで）
  if (stub.id === 'CHANGE_EICHI_SIGNI_BASE_LEVEL') {
    // stub.valueが数値かつlastProcessedCardsあり→適用
    if (typeof stub.value === 'number' && ctx.lastProcessedCards?.length) {
      const targetCESBL = ctx.lastProcessedCards[0];
      const newOvCESBL = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [targetCESBL]: stub.value as number };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: newOvCESBL } },
        `${ctx.cardMap.get(targetCESBL)?.CardName ?? targetCESBL}の基本レベルを${stub.value}に変更`));
    }
    // lastProcessedCardsあり（ターゲット選択済み）→レベル選択
    if (ctx.lastProcessedCards?.length) {
      const targetCESBL2 = ctx.lastProcessedCards[0];
      const optsCESBL = [1,2,3].map(lv => ({
        id: `lv_${lv}`, label: `レベル${lv}`,
        action: ({ type: 'STUB', id: 'CHANGE_EICHI_SIGNI_BASE_LEVEL', value: lv } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, `${ctx.cardMap.get(targetCESBL2)?.CardName ?? targetCESBL2}のレベルを選択`), {
        type: 'CHOOSE', options: optsCESBL, count: 1,
      });
    }
    // SELECT_TARGET: 自フィールドの英知シグニ
    const srcCESBL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCESBL = srcCESBL ? (srcCESBL.EffectText ?? '') + ' ' + (srcCESBL.BurstText ?? '') : '';
    const classNameCESBL = txtCESBL.match(/＜([^＞]+)＞のシグニ/)?.[1] ?? '英知';
    const eichiCandsCESBL = ctx.ownerState.field.signi.flatMap(s => {
      const top = s?.at(-1);
      if (!top || top === ctx.sourceCardNum) return [];
      return (ctx.cardMap.get(top)?.CardClass ?? '').includes(classNameCESBL) ? [top] : [];
    });
    if (eichiCandsCESBL.length === 0) return done(addLog(ctx, `＜${classNameCESBL}＞シグニなし（CHANGE_EICHI_SIGNI_BASE_LEVEL）`));
    const contCESBL: StubAction = { type: 'STUB', id: 'CHANGE_EICHI_SIGNI_BASE_LEVEL' };
    return needsInteraction(addLog(ctx, `＜${classNameCESBL}＞シグニを選択（基本レベル変更）`), {
      type: 'SELECT_TARGET', candidates: eichiCandsCESBL, count: 1, optional: false,
      targetScope: 'self_field', thenAction: contCESBL as EffectAction,
    });
  }
  // TRIGGER_OTHER_SIGNI_EICHI_ABILITY: 他の自シグニを選択し、その英知AUTO能力を発動させる
  if (stub.id === 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY') {
    if (ctx.lastProcessedCards?.length) {
      const targetTOSEA = ctx.lastProcessedCards[0];
      const cardTOSEA = ctx.cardMap.get(targetTOSEA);
      if (!cardTOSEA) return done(addLog(ctx, 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY: カードなし'));
      const effectsTOSEA = parseCardEffects(cardTOSEA);
      // 英知AUTO能力を検索（activeCondition: EICHI_LEVEL_SUM）
      const eichiEffTOSEA = effectsTOSEA.find(e =>
        e.effectType === 'AUTO' && e.activeCondition?.type === 'EICHI_LEVEL_SUM');
      if (!eichiEffTOSEA) return done(addLog(ctx, `${cardTOSEA.CardName}に英知AUTO能力なし`));
      return exec(eichiEffTOSEA.action,
        addLog({ ...ctx, sourceCardNum: targetTOSEA, lastProcessedCards: [] },
          `${cardTOSEA.CardName}の英知AUTO能力を発動`));
    }
    // 他の自シグニを選択
    const otherSigniTOSEA = ctx.ownerState.field.signi.flatMap(s => {
      const top = s?.at(-1);
      return (top && top !== ctx.sourceCardNum) ? [top] : [];
    });
    if (otherSigniTOSEA.length === 0) return done(addLog(ctx, '他のシグニなし（TRIGGER_OTHER_SIGNI_EICHI_ABILITY）'));
    const contTOSEA: StubAction = { type: 'STUB', id: 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY' };
    return needsInteraction(addLog(ctx, '英知能力を発動させるシグニを選択'), {
      type: 'SELECT_TARGET', candidates: otherSigniTOSEA, count: 1, optional: false,
      targetScope: 'self_field', thenAction: contTOSEA as EffectAction,
    });
  }
  // SUPPRESS_CENTER_ON_PLAY: このターン自分のセンタールリグの【出】効果を抑制
  if (stub.id === 'SUPPRESS_CENTER_ON_PLAY') {
    const newOwner = { ...ctx.ownerState, suppress_center_on_play: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン、センタールリグの【出】能力は発動しない'));
  }
  // SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: このシグニをトラッシュに置く代わりにダメージ無効（任意）
  if (stub.id === 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH') {
    const srcSDWT = ctx.sourceCardNum;
    if (!srcSDWT) return done(addLog(ctx, 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: ソースなし'));
    const inFieldSDWT = ctx.ownerState.field.signi.some(s => s?.includes(srcSDWT));
    if (!inFieldSDWT) return done(addLog(ctx, 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: フィールドにシグニなし'));
    const noopSDWT: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, `${ctx.cardMap.get(srcSDWT)?.CardName ?? srcSDWT}をトラッシュ→ダメージ無効しますか？`), {
      type: 'CHOOSE', count: 1,
      options: [
        {
          id: 'trash_prevent', label: `${ctx.cardMap.get(srcSDWT)?.CardName ?? srcSDWT}をトラッシュしてダメージ無効`,
          action: ({ type: 'STUB', id: 'INTERNAL_SDWT_DO' } as StubAction) as EffectAction, available: true,
        },
        { id: 'skip', label: 'しない（ダメージを受ける）', action: noopSDWT as EffectAction, available: true },
      ],
    });
  }
  // INTERNAL_SDWT_DO: シグニトラッシュ+ダメージ無効実行
  if (stub.id === 'INTERNAL_SDWT_DO') {
    const srcISDWT = ctx.sourceCardNum;
    if (!srcISDWT) return done(addLog(ctx, 'INTERNAL_SDWT_DO: ソースなし'));
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
      `${ctx.cardMap.get(srcISDWT)?.CardName ?? srcISDWT}をトラッシュ→ダメージ無効`));
  }
  // SELECT_NO_COMMON_COLOR: 共通色なしを選択（ログのみ）
  // SELECT_NO_COMMON_COLOR: WX22-050 エンジェル・アウェイク
  // LOOK_AND_REORDER後のlastProcessedCards（デッキ上3枚）から天使シグニを選択
  // 「それぞれ共通する色を持たないように」: プレイヤーが手動でルールを守る前提
  // 選択したカードは「手札 or エナ」を1枚ずつ選択、非選択はトラッシュへ
  if (stub.id === 'SELECT_NO_COMMON_COLOR') {
    const revealedSNC = ctx.lastProcessedCards ?? [];

    // Phase 2: 選択後の個別行き先CHOOSE（stub.valueにJSON配列で残カード一覧）
    if (typeof stub.value === 'string' && stub.value.startsWith('SNC_DIST:')) {
      const queueSNC: string[] = JSON.parse(stub.value.slice('SNC_DIST:'.length));
      if (queueSNC.length === 0) return done(addLog(ctx, '選択処理完了'));
      const [firstSNC, ...restSNC] = queueSNC;
      const cardNameSNC = ctx.cardMap.get(firstSNC)?.CardName ?? firstSNC;
      const contNextSNC: StubAction | null = restSNC.length > 0
        ? { type: 'STUB', id: 'SELECT_NO_COMMON_COLOR', value: `SNC_DIST:${JSON.stringify(restSNC)}` }
        : null;
      const toHandContSNC: EffectAction = contNextSNC
        ? { type: 'SEQUENCE', steps: [{ type: 'STUB', id: 'INTERNAL_SNC_MOVE_TO_HAND', value: firstSNC } as StubAction, contNextSNC] as EffectAction[] } as import('../types/effects').SequenceAction
        : { type: 'STUB', id: 'INTERNAL_SNC_MOVE_TO_HAND', value: firstSNC } as StubAction;
      const toEnaContSNC: EffectAction = contNextSNC
        ? { type: 'SEQUENCE', steps: [{ type: 'STUB', id: 'INTERNAL_SNC_MOVE_TO_ENERGY', value: firstSNC } as StubAction, contNextSNC] as EffectAction[] } as import('../types/effects').SequenceAction
        : { type: 'STUB', id: 'INTERNAL_SNC_MOVE_TO_ENERGY', value: firstSNC } as StubAction;
      return needsInteraction(addLog(ctx, `${cardNameSNC}の行き先を選択`), {
        type: 'CHOOSE', count: 1, options: [
          { id: 'hand', label: `手札へ（${cardNameSNC}）`, action: toHandContSNC, available: true },
          { id: 'energy', label: `エナゾーンへ（${cardNameSNC}）`, action: toEnaContSNC, available: true },
        ],
      });
    }

    // Phase 1: 天使シグニを抽出し、非天使は即トラッシュ、天使はSEARCHで選択
    const toHWCMCBC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const isAngelSNC = (cn: string) => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && !!(c.CardClass?.includes('天使'));
    };
    const angelSNC   = revealedSNC.filter(isAngelSNC);
    const nonAngelSNC = revealedSNC.filter(cn => !isAngelSNC(cn));

    // 非天使をデッキからトラッシュへ
    let curSNC = ctx;
    for (const cn of nonAngelSNC) {
      const di = curSNC.ownerState.deck.indexOf(cn);
      if (di < 0) continue;
      const newDeck = [...curSNC.ownerState.deck]; newDeck.splice(di, 1);
      curSNC = { ...curSNC, ownerState: { ...curSNC.ownerState, deck: newDeck, trash: [...curSNC.ownerState.trash, cn] } };
    }

    if (angelSNC.length === 0) {
      return done(addLog(curSNC, '天使シグニなし→全カードをトラッシュへ'));
    }

    // ヒント: 選んだカードは互いに共通する色を持たないように（ルール上の制約・表示のみ）
    const colorHintSNC = angelSNC.map(cn => {
      const c = ctx.cardMap.get(cn);
      return `${c?.CardName ?? cn}(${c?.Color ?? '?'})`;
    }).join('、');

    // 天使シグニ選択 → continuation でエナ/手札振り分け
    const contSNC: StubAction = { type: 'STUB', id: 'INTERNAL_SNC_AFTER_SEARCH' };
    return needsInteraction(addLog(curSNC, `天使シグニを選ぶ（共通色を持たないように）: ${colorHintSNC}`), {
      type: 'SEARCH',
      visibleCards: angelSNC,
      maxPick: angelSNC.length,
      thenAction: { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as EffectAction,
      restDest: 'trash',
      continuation: contSNC as EffectAction,
    });
  }
  // INTERNAL_SNC_AFTER_SEARCH: SEARCHで非選択→trash済み、選択カードはまだdeckに残っている
  // SEARCH+restDestがdeck上カードをtrashに移動済み（非選択分）
  // 選択分はdeck内に残っているので、LOOK_AND_REORDER前後のdeckを比較して特定するか
  // SEARCH.visibleCardsの中で今もdeckにあるカードを選択済みとみなす
  // → lastProcessedCards で拾えないのでdeckを走査して特定
  // ここでは: SNC_AFTER_SEARCH stateを受け取って振り分けへ
  if (stub.id === 'INTERNAL_SNC_AFTER_SEARCH') {
    // lastProcessedCardsはSEARCH後に更新されないため、deck内に残っている天使シグニを探す
    // (非選択分はrestDest:'trash'でtrash済み, 選択分はまだdeckにある)
    // ctx.lastProcessedCardsには選択カードが入っているはず（applyDirectAction経由で更新）
    // RULE_REMINDER_TEXT は done(ctx) なので lastProcessedCards は変わらない
    // → SEARCHのvisibleCards情報は失われているが、continuation実行時の ctx.lastProcessedCards は
    //   resumeSearch前の値のままのはず(top3)なのでそこから天使でdeck内のものを抽出
    const deckSNC = ctx.ownerState.deck;
    const revSNC = ctx.lastProcessedCards ?? [];
    const selectedSNC = revSNC.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && c.CardClass?.includes('天使') && deckSNC.includes(cn);
    });
    if (selectedSNC.length === 0) return done(addLog(ctx, '天使シグニ選択なし'));
    // Phase 2 へ: カードを1枚ずつ手札 or エナへ
    const queuePayload = `SNC_DIST:${JSON.stringify(selectedSNC)}`;
    return exec({ type: 'STUB', id: 'SELECT_NO_COMMON_COLOR', value: queuePayload } as StubAction as EffectAction, ctx);
  }
  // INTERNAL_SNC_MOVE_TO_HAND: 指定カードをデッキから手札へ
  if (stub.id === 'INTERNAL_SNC_MOVE_TO_HAND') {
    const cnSMTH = typeof stub.value === 'string' ? stub.value : (ctx.lastProcessedCards?.[0] ?? '');
    if (!cnSMTH) return done(addLog(ctx, '対象カードなし'));
    const diSMTH = ctx.ownerState.deck.indexOf(cnSMTH);
    if (diSMTH < 0) return done(addLog(ctx, `${ctx.cardMap.get(cnSMTH)?.CardName ?? cnSMTH}はデッキにない`));
    const newDeckSMTH = [...ctx.ownerState.deck]; newDeckSMTH.splice(diSMTH, 1);
    const newOwnerSMTH: PlayerState = { ...ctx.ownerState, deck: newDeckSMTH, hand: [...ctx.ownerState.hand, cnSMTH] };
    return done(addLog({ ...ctx, ownerState: newOwnerSMTH },
      `${ctx.cardMap.get(cnSMTH)?.CardName ?? cnSMTH}→手札`));
  }
  // INTERNAL_SNC_MOVE_TO_ENERGY: 指定カードをデッキからエナゾーンへ
  if (stub.id === 'INTERNAL_SNC_MOVE_TO_ENERGY') {
    const cnSMTE = typeof stub.value === 'string' ? stub.value : (ctx.lastProcessedCards?.[0] ?? '');
    if (!cnSMTE) return done(addLog(ctx, '対象カードなし'));
    const diSMTE = ctx.ownerState.deck.indexOf(cnSMTE);
    if (diSMTE < 0) return done(addLog(ctx, `${ctx.cardMap.get(cnSMTE)?.CardName ?? cnSMTE}はデッキにない`));
    const newDeckSMTE = [...ctx.ownerState.deck]; newDeckSMTE.splice(diSMTE, 1);
    const newOwnerSMTE: PlayerState = { ...ctx.ownerState, deck: newDeckSMTE, energy: [...ctx.ownerState.energy, cnSMTE] };
    return done(addLog({ ...ctx, ownerState: newOwnerSMTE },
      `${ctx.cardMap.get(cnSMTE)?.CardName ?? cnSMTE}→エナゾーン`));
  }
  // DISCARD_BY_POWER_MATCH: パワー一致で捨て（ログのみ）
  if (stub.id === 'DISCARD_BY_POWER_MATCH') {
    return done(addLog(ctx, 'パワー一致で捨て（スキップ）'));
  }
  // DECLARE_NUMBER_RANGE: 0〜5の数字宣言（DECLARE_NUMBERと同様だが0を含む）
  if (stub.id === 'DECLARE_NUMBER_RANGE') {
    const setDNR = (n: number): StubAction => ({ type: 'STUB', id: 'SET_DECLARED_NUMBER', value: n });
    const optsDNR = [0, 1, 2, 3, 4, 5].map(n => ({
      id: `dnr_${n}`, label: `${n}を宣言`, action: setDNR(n) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, '数字を宣言してください（0〜5）'), {
      type: 'CHOOSE', options: optsDNR, count: 1,
    });
  }
  // DECLARE_NUMBER_POWER: パワー値宣言（3000〜15000）→ declared_guard_restrict_level に保存
  if (stub.id === 'DECLARE_NUMBER_POWER') {
    const setDNP = (n: number): StubAction => ({ type: 'STUB', id: 'SET_DECLARED_NUMBER', value: n });
    const optsDNP = [3000, 5000, 7000, 10000, 12000, 15000].map(n => ({
      id: `pwr_${n}`, label: `${n.toLocaleString()}を宣言`, action: setDNP(n) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, 'パワーを宣言してください'), {
      type: 'CHOOSE', options: optsDNP, count: 1,
    });
  }
  // CONDITIONAL_ALTERNATE_EFFECT: 条件達成時にダウン済みシグニをトラッシュへ（代替効果）
  if (stub.id === 'CONDITIONAL_ALTERNATE_EFFECT') {
    const srcCAE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCAE = srcCAE ? (srcCAE.EffectText ?? '') + ' ' + (srcCAE.BurstText ?? '') : '';
    // 「あなたの場に＜CLASS＞のシグニがある場合、代わりに」パターン
    const classMatchCAE = txtCAE.match(/あなたの場に＜([^＞]+)＞のシグニがある場合[、,]代わりに/);
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
        `＜${reqClassCAE}＞あり→${ctx.cardMap.get(targetCAE)?.CardName ?? targetCAE}をトラッシュへ（代替効果）`));
    }
    return done(addLog(ctx, `代替条件未達（${reqClassCAE ? '＜' + reqClassCAE + '＞なし' : '条件解析不可'}）`));
  }
  // TRASH_SPELL_FREE_USE_LIMIT: トラッシュスペル無料使用制限（ログのみ）
  // TRASH_SPELL_FREE_USE_LIMIT: トラッシュからコスト上限以下のスペルをコストなしで使用
  if (stub.id === 'TRASH_SPELL_FREE_USE_LIMIT') {
    const cnTSFUL = ctx.lastProcessedCards?.[0];
    if (!cnTSFUL) {
      const srcTSFUL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
      const txtTSFUL = srcTSFUL ? (srcTSFUL.EffectText ?? '') + ' ' + (srcTSFUL.BurstText ?? '') : '';
      const toHWTSFUL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const costLimMTSFUL = txtTSFUL.match(/コストの合計が([０-９\d]+)以下のスペル/);
      const costLimTSFUL = costLimMTSFUL ? parseInt(toHWTSFUL(costLimMTSFUL[1])) : 2;
      const trashSpellsTSFUL = ctx.ownerState.trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        if (!c || c.Type !== 'スペル') return false;
        const colorCount = (c.Cost ?? '').match(/[赤青緑黒白無]/g)?.length ?? 0;
        return colorCount <= costLimTSFUL;
      });
      if (trashSpellsTSFUL.length === 0) return done(addLog(ctx, `トラッシュにコスト${costLimTSFUL}以下のスペルなし`));
      const contTSFUL: StubAction = { type: 'STUB', id: 'TRASH_SPELL_FREE_USE_LIMIT' };
      return needsInteraction(addLog(ctx, 'トラッシュのスペルを選択（コストなし使用）'), {
        type: 'SELECT_TARGET', candidates: trashSpellsTSFUL, count: 1, optional: false,
        targetScope: 'self_trash', thenAction: contTSFUL as EffectAction,
      });
    }
    const cardTSFUL = ctx.cardMap.get(cnTSFUL);
    if (!cardTSFUL) return done(addLog(ctx, 'TRASH_SPELL_FREE_USE_LIMIT: カードなし'));
    const effectsTSFUL = parseCardEffects(cardTSFUL);
    const mainEffTSFUL = effectsTSFUL.find(e =>
      e.effectType === 'ACTIVATED' || (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY')));
    if (!mainEffTSFUL) return done(addLog(ctx, `${cardTSFUL.CardName}効果なし`));
    return exec(mainEffTSFUL.action,
      addLog({ ...ctx, sourceCardNum: cnTSFUL, lastProcessedCards: [] },
        `${cardTSFUL.CardName}をトラッシュからコストなしで使用`));
  }
  // UPKEEP_OR_NO_UP: アップキープかアップなし（ログのみ）
  if (stub.id === 'UPKEEP_OR_NO_UP') {
    return done(addLog(ctx, 'アップキープかアップなし'));
  }
  // ACTIVATE_COST_ZERO_BLACK: トラッシュのシグニを選択→次の起動コストを《黒×0》に
  if (stub.id === 'ACTIVATE_COST_ZERO_BLACK') {
    if (!ctx.lastProcessedCards?.length) {
      const trashSigniACZB = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
      if (trashSigniACZB.length === 0) return done(addLog(ctx, 'トラッシュにシグニなし（ACTIVATE_COST_ZERO_BLACK）'));
      const contACZB: StubAction = { type: 'STUB', id: 'ACTIVATE_COST_ZERO_BLACK' };
      return needsInteraction(addLog(ctx, 'コスト0にするシグニを選択（トラッシュから）'), {
        type: 'SELECT_TARGET', candidates: trashSigniACZB, count: 1, optional: false,
        targetScope: 'self_trash', thenAction: contACZB as EffectAction,
      });
    }
    const targetACZB = ctx.lastProcessedCards[0];
    const newOwnerACZB = { ...ctx.ownerState, activate_cost_zero_signi: targetACZB };
    return done(addLog({ ...ctx, ownerState: newOwnerACZB },
      `${ctx.cardMap.get(targetACZB)?.CardName ?? targetACZB}の次の起動コスト→《黒×0》`));
  }
  // BET_CONDITION: ベット条件（ログのみ）
  if (stub.id === 'BET_CONDITION') {
    return done(addLog(ctx, 'ベット条件'));
  }
  // DISABLE_FIRST_ABILITY_ON_ATTACK: アタック時最初の能力を無効化（ログのみ）
  if (stub.id === 'DISABLE_FIRST_ABILITY_ON_ATTACK') {
    return done(addLog(ctx, 'アタック時最初の能力を無効化'));
  }
  // REPLACE_PLUS_N: このターン、相手シグニへの正パワー修正を負に置換
  if (stub.id === 'REPLACE_PLUS_N') {
    const newOwnerRPN: PlayerState = { ...ctx.ownerState, replace_opp_power_plus: true };
    return done(addLog({ ...ctx, ownerState: newOwnerRPN }, 'このターン相手シグニへの+パワー修正を-に置換'));
  }
  // CONDITIONAL_KEYWORD_BY_CENTER_COLOR already handled above
  // === バッチ16: アクセ・公開・汎用選択系 ===
  // GRID_REVEAL_PLUS: このターン、デッキ公開枚数+1フラグを設定
  if (stub.id === 'GRID_REVEAL_PLUS') {
    const newOwnerGRP: PlayerState = { ...ctx.ownerState, grid_reveal_plus_one_this_turn: true };
    return done(addLog({ ...ctx, ownerState: newOwnerGRP }, 'グリッド公開：このターンデッキ公開枚数+1'));
  }
  // MAGIC_BOX_REVEAL: 場のMBを表向きにしてシグニにする（全MBをシグニとして配置）
  if (stub.id === 'MAGIC_BOX_REVEAL') {
    const mbsReveal = ctx.ownerState.field.signi_magic_boxes ?? [null, null, null];
    const newSigniReveal = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const newMBsReveal = [...mbsReveal] as (string | null)[];
    const revealedCards: string[] = [];
    for (let i = 0; i < 3; i++) {
      if (!mbsReveal[i]) continue;
      const mbCard = mbsReveal[i]!;
      const cardData = ctx.cardMap.get(mbCard);
      // 中身がシグニでなければスキップ（例：スペル等は場に出せない）
      if (cardData && cardData.Type !== 'シグニ') continue;
      newSigniReveal[i] = [mbCard];
      newMBsReveal[i] = null;
      revealedCards.push(mbCard);
    }
    if (revealedCards.length === 0) return done(addLog(ctx, 'MBなし（または中身がシグニでない）'));
    const newOwnerReveal: PlayerState = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, signi: newSigniReveal, signi_magic_boxes: newMBsReveal },
    };
    const names = revealedCards.map(c => ctx.cardMap.get(c)?.CardName ?? c).join('、');
    return done(addLog({ ...ctx, ownerState: newOwnerReveal, lastProcessedCards: revealedCards },
      `【マジックボックス】表向き→シグニ：${names}`));
  }
  // ACCE_OP: アクセ操作（汎用ログ）
  if (stub.id === 'ACCE_OP') {
    const acceCountAO = (ctx.ownerState.field.signi_acce ?? []).filter(cn => cn !== null).length;
    return done(addLog(ctx, `アクセ操作（現在${acceCountAO}個のアクセ）`));
  }
  // ACCE_SIGNI_ALL_COLOR: アクセ中のシグニを全色にする
  if (stub.id === 'ACCE_SIGNI_ALL_COLOR') {
    const srcASAC = ctx.sourceCardNum;
    const acceASAC = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const zoneIdxASAC = acceASAC.findIndex(cn => cn === srcASAC);
    if (zoneIdxASAC < 0) return done(addLog(ctx, 'アクセ中のシグニが見つからない'));
    const targetSigniASAC = ctx.ownerState.field.signi[zoneIdxASAC]?.at(-1);
    if (!targetSigniASAC) return done(addLog(ctx, 'アクセ先のシグニがいない'));
    // story_overrides にフラグとして記録（全色付与の意）
    const ovASAC = { ...(ctx.ownerState.story_overrides ?? {}), [targetSigniASAC]: 'ALL_COLOR' };
    const newSASAC: PlayerState = { ...ctx.ownerState, story_overrides: ovASAC };
    return done(addLog({ ...ctx, ownerState: newSASAC },
      `${ctx.cardMap.get(targetSigniASAC)?.CardName ?? targetSigniASAC}が全色を持つ`));
  }
  // TRASH_ACCE_AT_TURN_END: アクセカードをターン終了時にトラッシュ（即座に処理）
  // TRASH_ACCE_AT_TURN_END: このシグニに付いているアクセ1枚をトラッシュへ
  if (stub.id === 'TRASH_ACCE_AT_TURN_END') {
    const srcTATE = ctx.sourceCardNum;
    const zoneIdxTATE = srcTATE
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcTATE)
      : -1;
    const acceTATE = zoneIdxTATE >= 0
      ? (ctx.ownerState.field.signi_acce ?? [null, null, null])[zoneIdxTATE]
      : null;
    if (!acceTATE) return done(addLog(ctx, 'アクセなし（TRASH_ACCE_AT_TURN_END）'));
    const newAcceTATE = [...(ctx.ownerState.field.signi_acce ?? [null, null, null])] as (string | null)[];
    newAcceTATE[zoneIdxTATE] = null;
    const newSTATE: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, acceTATE],
      field: { ...ctx.ownerState.field, signi_acce: newAcceTATE },
    };
    return done(addLog({ ...ctx, ownerState: newSTATE },
      `${ctx.cardMap.get(acceTATE)?.CardName ?? acceTATE}（アクセ）→トラッシュ`));
  }
  // MULTI_ACCE_LIMIT: アクセを特定枚数に制限（ログのみ）
  if (stub.id === 'MULTI_ACCE_LIMIT') {
    const acceCountMAL = (ctx.ownerState.field.signi_acce ?? []).filter(cn => cn !== null).length;
    return done(addLog(ctx, `マルチアクセ制限（現在${acceCountMAL}個）`));
  }
  // CHOOSE_HAND_CARD: 手札から1枚選択（lastProcessedCardsに設定）
  if (stub.id === 'CHOOSE_HAND_CARD') {
    const handCHC = ctx.ownerState.hand;
    if (handCHC.length === 0) return done(addLog(ctx, '手札なし'));
    const noopCHC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: handCHC, count: 1, optional: true,
      targetScope: 'self_hand', thenAction: noopCHC as EffectAction,
    });
  }
  // CHOOSE_HAND_OR_ENERGY: デッキ上N枚から任意枚数を手札に加え、残りをエナへ（LOOK_AND_REORDER後）
  if (stub.id === 'CHOOSE_HAND_OR_ENERGY') {
    const srcCHOE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCHOE = srcCHOE ? (srcCHOE.EffectText ?? '') + ' ' + (srcCHOE.BurstText ?? '') : '';
    const toHWCHOE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const countMCHOE = txtCHOE.match(/([０-９\d]+)枚見る/);
    const revealCountCHOE = countMCHOE ? parseInt(toHWCHOE(countMCHOE[1])) : 3;
    const topCardsCHOE = ctx.ownerState.deck.slice(0, revealCountCHOE);
    if (topCardsCHOE.length === 0) return done(addLog(ctx, 'デッキなし（CHOOSE_HAND_OR_ENERGY）'));
    const addToHandCHOE: import('../types/effects').AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    return needsInteraction(addLog(ctx, `デッキ上${topCardsCHOE.length}枚から手札に加えるカードを選択（残りはエナへ）`), {
      type: 'SEARCH', visibleCards: topCardsCHOE, maxPick: topCardsCHOE.length,
      thenAction: addToHandCHOE as EffectAction, restDest: 'energy',
    });
  }
  // INTERNAL_OPP_DECK_TRASH_N: 相手デッキの上からN枚をトラッシュ
  if (stub.id === 'INTERNAL_OPP_DECK_TRASH_N') {
    const cntIODTN = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '4'));
    const trashedIODTN = ctx.otherState.deck.slice(0, cntIODTN);
    const newOtherIODTN: PlayerState = {
      ...ctx.otherState,
      deck: ctx.otherState.deck.slice(cntIODTN),
      trash: [...ctx.otherState.trash, ...trashedIODTN],
    };
    return done(addLog({ ...ctx, otherState: newOtherIODTN }, `相手デッキ上から${trashedIODTN.length}枚トラッシュ`));
  }
  // INTERNAL_ODC_COLOR_CHECK: 色宣言後、lastProcessedCards[0]の色を確認してペナルティ適用
  if (stub.id === 'INTERNAL_ODC_COLOR_CHECK') {
    const declaredColor = typeof stub.value === 'string' ? stub.value : '';
    const targetInstIOCC = ctx.lastProcessedCards?.[0];
    const targetCardIOCC = targetInstIOCC ? ctx.cardMap.get(getCardNum(targetInstIOCC)) : undefined;
    const cardColorIOCC = targetCardIOCC?.Color ?? '';
    const revealName = targetCardIOCC?.CardName ?? targetInstIOCC ?? '?';
    // 宣言色と一致しないか確認（カードの色が宣言を含まない → 対戦相手の全シグニバニッシュ）
    const colorMatchIOCC = cardColorIOCC.includes(declaredColor);
    const logMsg = `公開: ${revealName}（色: ${cardColorIOCC}）/ 宣言: ${declaredColor} → ${colorMatchIOCC ? '一致（ペナルティなし）' : '不一致→相手全シグニバニッシュ'}`;
    if (!colorMatchIOCC) {
      // 相手の全シグニをトラッシュへ
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
  // OPP_DECLARE_CHOICE / OPP_CHOOSE_EFFECT / OPP_CHOOSES_FOR_YOU: 相手が①②から選ぶ
  if (stub.id === 'OPP_DECLARE_CHOICE' || stub.id === 'OPP_CHOOSE_EFFECT' || stub.id === 'OPP_CHOOSES_FOR_YOU') {
    const srcODC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtODC = srcODC ? (srcODC.EffectText ?? '') + ' ' + (srcODC.BurstText ?? '') : '';
    const toHWODC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 色宣言パターン（ウリス系）: 「対戦相手は《白》《赤》...から１つを宣言する」
    if (txtODC.match(/対戦相手は.*から１つを宣言する/) && txtODC.match(/《白[^》]*》.*《赤[^》]*》/)) {
      const colorList = ['白', '赤', '青', '緑', '黒', '無'];
      const colorOpts = colorList.map(color => ({
        id: `odc_color_${color}`,
        label: `《${color}》を宣言`,
        action: ({ type: 'STUB', id: 'INTERNAL_ODC_COLOR_CHECK', value: color } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, `対戦相手が色を宣言（対象カード: ${ctx.lastProcessedCards?.[0] ? ctx.cardMap.get(getCardNum(ctx.lastProcessedCards[0]))?.CardName ?? '?' : '未選択'}）`), {
        type: 'CHOOSE', options: colorOpts, count: 1, opponentResponds: true,
      });
    }
    // ①②パターンを解析
    const choicePatsODC = [{ m: /①([^②③]+)/, idx: 0 }, { m: /②([^③④]+)/, idx: 1 }];
    const optsODC: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of choicePatsODC) {
      const mat = txtODC.match(m);
      if (!mat) continue;
      const ctxt = mat[1].replace(/。\s*$/, '').trim();
      let act: EffectAction | null = null;
      // 「対戦相手のデッキの上からN枚トラッシュ」→ 相手（otherState）のデッキをトラッシュ
      if (!act && ctxt.match(/対戦相手のデッキの上からカードを([０-９\d]+)枚トラッシュ/)) {
        const cnt = parseInt(toHWODC(ctxt.match(/([０-９\d]+)枚/)![1]));
        act = ({ type: 'STUB', id: 'INTERNAL_OPP_DECK_TRASH_N', value: cnt } as StubAction) as EffectAction;
      }
      // 「デッキの上からN枚トラッシュ」（所有者不明 = 両者）
      if (!act && ctxt.match(/デッキの上からカードを([０-９\d]+)枚トラッシュ/)) {
        const cnt = parseInt(toHWODC(ctxt.match(/([０-９\d]+)枚/)![1]));
        act = ({ type: 'STUB', id: 'INTERNAL_DECK_TRASH_BOTH', value: cnt } as StubAction) as EffectAction;
      }
      // 「カードをN枚引く」（相手が引く = opponentResponds文脈では自分が引くことが多い）
      if (!act && ctxt.match(/カードを([０-９\d]+)枚引く/)) {
        const cnt = parseInt(toHWODC(ctxt.match(/([０-９\d]+)枚/)![1]));
        act = ({ type: 'DRAW', owner: stub.id === 'OPP_CHOOSE_EFFECT' ? 'opponent' : 'self', count: cnt } as DrawAction) as EffectAction;
      }
      // 「手札からシグニ1枚を場に出す」（対戦相手が出す）
      if (!act && ctxt.match(/手札から.*シグニ.*場に出す/)) {
        act = ({ type: 'ADD_TO_FIELD', owner: 'opponent', source: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as AddToFieldAction) as EffectAction;
      }
      // 「トラッシュからシグニ1枚を手札に加える」
      if (!act && ctxt.match(/トラッシュから.*シグニ.*手札に加える/)) {
        act = ({ type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ' } } } as TransferToHandAction) as EffectAction;
      }
      // 旧フォールバック: 「手札を加える」系
      if (!act && ctxt.match(/手札.+を.+加える/)) act = { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1 } } as TransferToHandAction;
      if (act) optsODC.push({ id: `odc_${idx}`, label: `${'①②'[idx]}${ctxt.slice(0, 20)}...`, action: act, available: true });
    }
    if (optsODC.length > 0) {
      return needsInteraction(addLog(ctx, `対戦相手が選択（${optsODC.length}択）`), {
        type: 'CHOOSE', options: optsODC, count: 1, opponentResponds: true,
      });
    }
    return done(addLog(ctx, `相手選択（解析不可: ${stub.id}）`));
  }
  // DO_THREE_THINGS: 3〜4つの処理を動的解析して実行
  if (stub.id === 'DO_THREE_THINGS') {
    const srcDTT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDTT = srcDTT ? (srcDTT.EffectText ?? '') + ' ' + (srcDTT.BurstText ?? '') : '';
    let ctxDTT = ctx;
    const logsDTT: string[] = [];
    // ①「対戦相手のシグニ1体をトラッシュに置く」
    if (txtDTT.match(/①.*対戦相手のシグニ[１1]体を対象とし.*トラッシュに置く/)) {
      const oppTopSigni = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).find(cn => !!cn);
      if (oppTopSigni) {
        const removedDTT = removeFromField(oppTopSigni, ctxDTT.otherState);
        ctxDTT = { ...ctxDTT, otherState: { ...removedDTT, trash: [...removedDTT.trash, oppTopSigni] } };
        logsDTT.push(`①${ctx.cardMap.get(oppTopSigni)?.CardName ?? oppTopSigni}をトラッシュへ`);
      }
    }
    // ②「対戦相手のライフクロス1枚をトラッシュに置く」
    if (txtDTT.match(/②.*ライフクロス[１1]枚をトラッシュに置く/)) {
      const life = ctxDTT.otherState.life_cloth;
      if (life.length > 0) {
        const top = life[life.length - 1];
        ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
          life_cloth: life.slice(0,-1),
          trash: [...ctxDTT.otherState.trash, top],
        }};
        logsDTT.push(`②ライフクロス(${ctx.cardMap.get(top)?.CardName ?? top})をトラッシュへ`);
      }
    }
    // ③「対戦相手のエナゾーンからカード1枚をトラッシュに置く」
    if (txtDTT.match(/③.*エナゾーンからカード[１1]枚を対象とし.*トラッシュに置く/)) {
      const oppEna = ctxDTT.otherState.energy;
      if (oppEna.length > 0) {
        const picked = oppEna[0];
        ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
          energy: oppEna.slice(1),
          trash: [...ctxDTT.otherState.trash, picked],
        }};
        logsDTT.push(`③エナ(${ctx.cardMap.get(picked)?.CardName ?? picked})をトラッシュへ`);
      }
    }
    // ④「対戦相手のセンタールリグの下のカード1枚をルリグトラッシュに置く」
    if (txtDTT.match(/④.*センタールリグの下にあるカード[１1]枚を対象とし.*ルリグトラッシュに置く/)) {
      const oppLrigStack = ctxDTT.otherState.field.lrig;
      if (oppLrigStack.length > 1) {
        const under = oppLrigStack[oppLrigStack.length - 2];
        const newLrigDTT = [...oppLrigStack.slice(0,-1).slice(0,-1), oppLrigStack[oppLrigStack.length - 1]];
        ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
          field: { ...ctxDTT.otherState.field, lrig: newLrigDTT },
          lrig_trash: [...ctxDTT.otherState.lrig_trash, under],
        }};
        logsDTT.push(`④${ctx.cardMap.get(under)?.CardName ?? under}をルリグトラッシュへ`);
      }
    }
    // 「対戦相手の全ルリグとシグニをダウンし凍結する」
    if (txtDTT.match(/①.*(?:すべてのルリグとシグニ|全.*ルリグ.*シグニ)をダウンし凍結する/)) {
      ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
        field: { ...ctxDTT.otherState.field,
          signi_down: [true, true, true],
          signi_frozen: [true, true, true],
          lrig_down: true,
          lrig_frozen: true,
        },
      }};
      logsDTT.push('①全シグニ・ルリグをダウン+凍結');
    }
    // 「全相手シグニが能力を失う（次ターン終了まで）」
    if (txtDTT.match(/②.*すべてのシグニは能力を失う/)) {
      const oppAllSigniDTT = [0,1,2].map(zi => ctxDTT.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
      const abRemovedDTT = [...new Set([...(ctxDTT.otherState.abilities_removed ?? []), ...oppAllSigniDTT])];
      ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState, abilities_removed: abRemovedDTT } };
      logsDTT.push(`②全${oppAllSigniDTT.length}体の能力を消去`);
    }
    // 「①カードをN枚引く」
    if (!logsDTT.length) {
      const drawDTT = txtDTT.match(/①.*カードを([０-９\d]+)枚引く/);
      if (drawDTT) {
        const toHWD = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const n = parseInt(toHWD(drawDTT[1]));
        const canDraw = Math.min(n, ctxDTT.ownerState.deck.length);
        const newOwnerDraw = { ...ctxDTT.ownerState,
          hand: [...ctxDTT.ownerState.hand, ...ctxDTT.ownerState.deck.slice(0, canDraw)],
          deck: ctxDTT.ownerState.deck.slice(canDraw),
        };
        ctxDTT = { ...ctxDTT, ownerState: newOwnerDraw };
        logsDTT.push(`①${n}枚ドロー`);
      }
    }
    // 「①相手センタールリグをダウンする」
    if (!logsDTT.length && txtDTT.match(/①.*(?:センタールリグ|対戦相手のルリグ)[１1]体を対象とし.*ダウン/)) {
      ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
        field: { ...ctxDTT.otherState.field, lrig_down: true },
      }};
      logsDTT.push('①相手ルリグをダウン');
    }
    // 「①対戦相手のシグニ1体にアタック禁止」→ SELECT_TARGET が必要なためインタラクション
    if (!logsDTT.length && txtDTT.match(/①.*対戦相手のシグニ[１1]体を対象.*アタックできない/)) {
      const oppSigniDTT = [0,1,2]
        .map(zi => ctxDTT.otherState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn);
      if (oppSigniDTT.length > 0) {
        const blockStub: StubAction = { type: 'STUB', id: 'INTERNAL_BLOCK_ATTACK_THIS_TURN' };
        return needsInteraction(addLog(ctxDTT, 'ターン終了時まで「アタックできない」シグニを選択'), {
          type: 'SELECT_TARGET', candidates: oppSigniDTT, count: 1, optional: false,
          targetScope: 'opp_field', thenAction: blockStub as EffectAction,
        });
      }
    }
    // 「①パワーN以下の相手シグニをバニッシュ」
    if (!logsDTT.length) {
      const banishPwrM = txtDTT.match(/①.*パワー([０-９\d万]+)以下.*バニッシュ/);
      if (banishPwrM) {
        const toHWB = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace('万','0000');
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
        return done(addLog(ctxDTT, `①バニッシュ対象なし（パワー${maxPwr}以下の相手シグニ不在）`));
      }
    }
    if (logsDTT.length > 0) return done(addLog(ctxDTT, logsDTT.join(' / ')));
    return done(addLog(ctx, '3つの処理（個別解析不可）'));
  }
  // CONDITIONAL_MULTI_CHOOSE_BY_CENTER: センタールリグによる複数選択
  if (stub.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER') {
    const srcCMCBC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCMCBC = srcCMCBC ? (srcCMCBC.EffectText ?? '') + ' ' + (srcCMCBC.BurstText ?? '') : '';
    const toHWCMCBC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // ベース選択数「以下のN つから M つ(まで)選ぶ」
    const baseCountM = txtCMCBC.match(/以下の[２-９\d２-９]つから([２-９\d１1])つ(?:まで)?選ぶ/);
    const baseCount = baseCountM ? parseInt(toHWCMCBC(baseCountM[1])) : 1;
    // センタールリグ条件チェック
    const centerCondM = txtCMCBC.match(/センタールリグが(.+?)の場合/);
    let condMetCMCBC = !centerCondM; // 条件なしなら常にtrue
    if (centerCondM) {
      const reqNames = centerCondM[1].trim().split(/か|と/).map(s => s.trim()).filter(Boolean);
      const centerTop = ctx.ownerState.field.lrig.at(-1);
      const centerCard = centerTop ? ctx.cardMap.get(centerTop) : undefined;
      const centerName = centerCard?.CardName ?? '';
      const runtimeAliases = ctx.ownerState.lrig_name_aliases ?? [];
      const hasAllNames = runtimeAliases.includes(LRIG_ALL_NAMES_SENTINEL);
      const aliases = [centerName, ...runtimeAliases.filter(a => a !== LRIG_ALL_NAMES_SENTINEL)];
      condMetCMCBC = hasAllNames || reqNames.some(rn => aliases.some(a => a.includes(rn) || rn.includes(a)));
    }
    // 選択数: 条件達成なら"代わりにNつまで"、未達成はベース数
    const enhCountM = txtCMCBC.match(/代わりに([２-９\d])つまで選ぶ/);
    const maxChooseCount = condMetCMCBC && enhCountM ? parseInt(toHWCMCBC(enhCountM[1])) : baseCount;
    // 各選択肢（①②③④）を解析してCHOOSEオプション生成
    const choicePatterns = [
      { m: /①([^②③④]+)/, idx: 0 }, { m: /②([^③④⑤]+)/, idx: 1 },
      { m: /③([^④⑤]+)/, idx: 2 }, { m: /④([^⑤]+)/, idx: 3 },
    ];
    const optionsCMCBC: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of choicePatterns) {
      const mat = txtCMCBC.match(m);
      if (!mat) continue;
      const choiceTxt = mat[1].replace(/。\s*$/,'').trim();
      let choiceAction: EffectAction | null = null;
      // 「カードを1枚引く」→ DRAW
      if (choiceTxt.match(/カードを[１1]枚引く/)) {
        choiceAction = { type: 'DRAW', count: 1 } as DrawAction;
      }
      // 「各プレイヤーはデッキの上からN枚トラッシュに置く」
      const deckTrashM = choiceTxt.match(/デッキの上からカードを([０-９\d]+)枚トラッシュに置く/);
      if (!choiceAction && deckTrashM) {
        const cnt = parseInt(toHWCMCBC(deckTrashM[1]));
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_DECK_TRASH_BOTH', value: cnt } as StubAction) as EffectAction;
      }
      // 「対戦相手のシグニを対象とし、それをダウンする」→ DOWN STUBとして後で処理
      if (!choiceAction && choiceTxt.match(/対戦相手のシグニ[１1]体を対象とし.*ダウン/)) {
        const downActCMCBC: DownAction = {
          type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 },
        };
        choiceAction = downActCMCBC as EffectAction;
      }
      // 「対戦相手の手札を1枚見ないで選び、捨てさせる」
      if (!choiceAction && choiceTxt.match(/手札を[１1]枚見ないで選び.*捨て/)) {
        const blindTrashCMCBC: TrashAction = {
          type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 },
        };
        choiceAction = blindTrashCMCBC as EffectAction;
      }
      // 「対戦相手のシグニ1体のパワーを-N」
      const pwDownM = !choiceAction && choiceTxt.match(/パワーを([－-][０-９\d]+)する/);
      if (pwDownM) {
        const delta = parseInt(toHWCMCBC(pwDownM[1]).replace('－','-'));
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_OPP_ONE', value: delta } as StubAction) as EffectAction;
      }
      // 「トラッシュからシグニを場に出す」
      if (!choiceAction && choiceTxt.match(/トラッシュから.*シグニ[１1]枚.*場に出す/)) {
        choiceAction = ({ type: 'STUB', id: 'SUMMON_FROM_TRASH' } as StubAction) as EffectAction;
      }
      // 「アタックできない」→ blocked_actions追加
      if (!choiceAction && choiceTxt.match(/アタックできない/)) {
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_BLOCK_ATTACK_THIS_TURN' } as StubAction) as EffectAction;
      }
      // 「対戦相手のパワーN以下のシグニをバニッシュ」
      if (!choiceAction) {
        const banishPwrMCMCBC = choiceTxt.match(/パワー([０-９\d万]+)以下.*バニッシュ/);
        if (banishPwrMCMCBC) {
          const maxPwrCMCBC = parseInt(toHWCMCBC(banishPwrMCMCBC[1]).replace('万','0000'));
          choiceAction = ({ type: 'STUB', id: 'INTERNAL_BANISH_OPP_POWER_LTE', value: maxPwrCMCBC } as StubAction) as EffectAction;
        }
      }
      // 「エナゾーンからシグニを場に出す」
      if (!choiceAction && choiceTxt.match(/エナゾーンから.*シグニ.*場に出す/)) {
        choiceAction = ({ type: 'STUB', id: 'SUMMON_FROM_ENERGY' } as StubAction) as EffectAction;
      }
      // 「手札をすべて捨て、N枚引く」
      if (!choiceAction && choiceTxt.match(/手札をすべて捨て.*([２-９\d]枚|引く)/)) {
        const drawAllM = choiceTxt.match(/([２-９2-9\d])枚引く/);
        const drawAllN = drawAllM ? parseInt(toHWCMCBC(drawAllM[1])) : 4;
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_DISCARD_ALL_DRAW_N', value: drawAllN } as StubAction) as EffectAction;
      }
      // 「デッキ下のカードをトラッシュ→シグニなら場に出す」
      if (!choiceAction && choiceTxt.match(/デッキの一番下.*トラッシュ.*シグニ.*場に出す/)) {
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_DECK_BOTTOM_SUMMON' } as StubAction) as EffectAction;
      }
      // 「デッキ下のカードをトラッシュ→同じレベルの相手シグニをダウン」
      if (!choiceAction && choiceTxt.match(/デッキの一番下.*トラッシュ.*同じレベル.*ダウン/)) {
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_DECK_BOTTOM_LEVEL_DOWN' } as StubAction) as EffectAction;
      }
      // 「シグニをエナゾーンに置く」→ バニッシュ（エナゾーンへ移動）
      if (!choiceAction && choiceTxt.match(/対戦相手のシグニ[１1]体.*エナゾーンに置く/)) {
        choiceAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BanishAction as EffectAction;
      }
      // 「凍結する」→ FREEZE（単独またはダウンと組み合わせ）
      if (!choiceAction && choiceTxt.match(/凍結する/)) {
        if (choiceTxt.match(/ダウンし.*凍結/)) {
          // DOWN + FREEZE ALL
          choiceAction = ({ type: 'STUB', id: 'INTERNAL_DOWN_AND_FREEZE_OPP' } as StubAction) as EffectAction;
        } else {
          choiceAction = { type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as import('../types/effects').FreezeAction as EffectAction;
        }
      }
      // 「スペルの効果を打ち消す」→ ログのみ（解決インタラクション未実装）
      if (!choiceAction && choiceTxt.match(/スペル.*効果を打ち消す|スペル.*打ち消す/)) {
        choiceAction = ({ type: 'STUB', id: 'NEGATE_SPELL_EFFECT' } as StubAction) as EffectAction;
      }
      // 「トラッシュからシグニ1枚を手札に加える」→ ADD_TO_HAND from trash
      if (!choiceAction && choiceTxt.match(/トラッシュから.*シグニ[１1]枚.*手札に加える/)) {
        choiceAction = ({ type: 'STUB', id: 'INTERNAL_TRASH_SIGNI_TO_HAND' } as StubAction) as EffectAction;
      }
      // 「バニッシュする」（パワー制限なし、または以上）
      if (!choiceAction && choiceTxt.match(/シグニ[１1]体.*バニッシュする/)) {
        const gte = choiceTxt.match(/パワー([０-９\d万]+)以上.*バニッシュ/);
        if (gte) {
          // パワー以上バニッシュは選択インタラクション（簡易実装：対象選択なし）
          const minPwr = parseInt(toHWCMCBC(gte[1]).replace('万', '0000'));
          choiceAction = ({ type: 'STUB', id: 'INTERNAL_BANISH_OPP_POWER_GTE', value: minPwr } as StubAction) as EffectAction;
        } else if (!choiceTxt.match(/パワー/)) {
          choiceAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BanishAction as EffectAction;
        }
      }
      // 「ダブルクラッシュ/ランサー等のキーワードを得る」
      if (!choiceAction && choiceTxt.match(/【ダブルクラッシュ】を得る|【ランサー】を得る|【アサシン】を得る/)) {
        const kw = choiceTxt.includes('ダブルクラッシュ') ? 'double_crush'
          : choiceTxt.includes('ランサー') ? 'lancer' : 'assassin';
        choiceAction = ({ type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: kw, duration: 'UNTIL_END_OF_TURN' } as import('../types/effects').GrantKeywordAction) as EffectAction;
      }
      // 「シグニを手札に戻す」→ BOUNCE
      if (!choiceAction && choiceTxt.match(/シグニ[１1]体.*手札に戻す/)) {
        choiceAction = { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BounceAction as EffectAction;
      }
      if (choiceAction) {
        optionsCMCBC.push({
          id: `choice_${idx}`,
          label: `${['①','②','③','④'][idx]}${choiceTxt.slice(0, 20)}...`,
          action: choiceAction,
          available: true,
        });
      }
    }
    if (optionsCMCBC.length > 0) {
      const condLogCMCBC = centerCondM
        ? `（${condMetCMCBC ? '条件達成' : 'ベース選択'}：最大${maxChooseCount}択）`
        : `（最大${maxChooseCount}択）`;
      return needsInteraction(addLog(ctx, `効果を最大${maxChooseCount}つ選択してください${condLogCMCBC}`), {
        type: 'CHOOSE', options: optionsCMCBC, count: maxChooseCount,
      });
    }
    const centerCMCBC2 = ctx.ownerState.field.lrig.at(-1);
    const centerCardCMCBC2 = centerCMCBC2 ? ctx.cardMap.get(centerCMCBC2) : undefined;
    return done(addLog(ctx, `センター（${centerCardCMCBC2?.CardName ?? 'なし'}）による複数選択（解析不可）`));
  }
  // INTERNAL_DOWN_AND_FREEZE_OPP: 相手シグニ1体をダウン+全シグニを凍結
  if (stub.id === 'INTERNAL_DOWN_AND_FREEZE_OPP') {
    const downCandsDFO = ctx.otherState.field.signi.flatMap((s, zi) => s?.at(-1) ? [{ cn: s.at(-1)!, zi }] : []);
    if (downCandsDFO.length === 0) return done(addLog(ctx, '相手シグニなし'));
    // 1体ダウン（最初の1体、インタラクティブ選択は省略）
    const targetDFO = downCandsDFO[0];
    const newDownDFO = [...(ctx.otherState.field.signi_down ?? [false, false, false])];
    newDownDFO[targetDFO.zi] = true;
    // 全シグニ凍結
    const newFrozenDFO = [true, true, true];
    const newOtherDFO = { ...ctx.otherState, field: { ...ctx.otherState.field, signi_down: newDownDFO, signi_frozen: newFrozenDFO } };
    return done(addLog({ ...ctx, otherState: newOtherDFO },
      `${ctx.cardMap.get(targetDFO.cn)?.CardName ?? targetDFO.cn}をダウン + 全シグニ凍結`));
  }
  // INTERNAL_BANISH_OPP_POWER_GTE: 相手のパワーN以上のシグニ1体をバニッシュ
  if (stub.id === 'INTERNAL_BANISH_OPP_POWER_GTE') {
    const minPwr = typeof stub.value === 'number' ? stub.value : 0;
    const candsBOPG = ctx.otherState.field.signi.flatMap((s, zi) => {
      const top = s?.at(-1);
      if (!top) return [];
      const ep = ctx.effectivePowers;
      const pwr = (ep instanceof Map ? ep.get(top) : (ep as Record<string, number> | undefined)?.[top]) ?? parseInt(ctx.cardMap.get(top)?.Power ?? '0');
      return pwr >= minPwr ? [{ cn: top, zi }] : [];
    });
    if (candsBOPG.length === 0) return done(addLog(ctx, `パワー${minPwr}以上の相手シグニなし`));
    const banishAct: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { powerRange: { min: minPwr } } } };
    return exec(banishAct as EffectAction, ctx);
  }
  // INTERNAL_TRASH_SIGNI_TO_HAND: トラッシュからシグニ1枚を手札へ（CONDITIONAL_MULTI_CHOOSE系）
  if (stub.id === 'INTERNAL_TRASH_SIGNI_TO_HAND') {
    const signiTrashTSTH = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (signiTrashTSTH.length === 0) return done(addLog(ctx, 'トラッシュにシグニなし'));
    const addHandTSTH: AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    return needsInteraction(addLog(ctx, 'トラッシュからシグニを手札に加える'), {
      type: 'SEARCH', visibleCards: signiTrashTSTH, maxPick: 1, thenAction: addHandTSTH as EffectAction,
    });
  }
  // INTERNAL_DECK_TRASH_BOTH: 両プレイヤーのデッキ上N枚をトラッシュ
  if (stub.id === 'INTERNAL_DECK_TRASH_BOTH') {
    const cntIDTB = typeof stub.value === 'number' ? stub.value : 7;
    const selfDeckIDTB = ctx.ownerState.deck;
    const oppDeckIDTB = ctx.otherState.deck;
    const selfTrashIDTB = selfDeckIDTB.slice(0, Math.min(cntIDTB, selfDeckIDTB.length));
    const oppTrashIDTB = oppDeckIDTB.slice(0, Math.min(cntIDTB, oppDeckIDTB.length));
    const newOwnerIDTB: PlayerState = { ...ctx.ownerState, deck: selfDeckIDTB.slice(selfTrashIDTB.length), trash: [...ctx.ownerState.trash, ...selfTrashIDTB] };
    const newOtherIDTB: PlayerState = { ...ctx.otherState, deck: oppDeckIDTB.slice(oppTrashIDTB.length), trash: [...ctx.otherState.trash, ...oppTrashIDTB] };
    return done(addLog({ ...ctx, ownerState: newOwnerIDTB, otherState: newOtherIDTB },
      `各プレイヤーデッキ上${cntIDTB}枚トラッシュ`));
  }
  // INTERNAL_POWER_MOD_OPP_ONE: 相手の1体にパワー修正
  if (stub.id === 'INTERNAL_POWER_MOD_OPP_ONE') {
    const deltaIPMOO = typeof stub.value === 'number' ? stub.value : -12000;
    const targetIPMOO = ctx.lastProcessedCards?.[0]
      ?? [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).find(c => !!c);
    if (!targetIPMOO) return done(addLog(ctx, '対象なし'));
    const modsIPMOO = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: targetIPMOO, delta: deltaIPMOO }];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIPMOO } },
      `${ctx.cardMap.get(targetIPMOO)?.CardName ?? targetIPMOO}パワー${deltaIPMOO}`));
  }
  // INTERNAL_BANISH_OPP_POWER_LTE: パワーN以下の相手シグニをバニッシュ（対象選択）
  if (stub.id === 'INTERNAL_BANISH_OPP_POWER_LTE') {
    const maxPwrIBOPL = typeof stub.value === 'number' ? stub.value : 7000;
    const candsIBOPL = [0,1,2]
      .map(zi => ctx.otherState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => {
        if (!cn) return false;
        const pw = parseInt(ctx.cardMap.get(cn)?.Power ?? '99999');
        return pw <= maxPwrIBOPL;
      });
    if (candsIBOPL.length === 0) return done(addLog(ctx, `バニッシュ対象なし（パワー${maxPwrIBOPL}以下）`));
    const banishIBOPL: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } };
    return selectOrInteract(candsIBOPL, 1, false, 'opp_field', banishIBOPL as EffectAction, undefined, ctx);
  }
  // SUMMON_FROM_ENERGY: エナゾーンからシグニを場に出す（シグニ限定）
  if (stub.id === 'SUMMON_FROM_ENERGY') {
    const srcSFE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSFE = srcSFE ? (srcSFE.EffectText ?? '') : '';
    const lvMSFE = txtSFE.match(/レベル([０-９\d]+)以下の/);
    const toHWSFE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxLvSFE = lvMSFE ? parseInt(toHWSFE(lvMSFE[1])) : 99;
    const signiInEnaSFE = ctx.ownerState.energy.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (!c || c.Type !== 'シグニ') return false;
      return parseInt(c.Level ?? '0') <= maxLvSFE;
    });
    if (signiInEnaSFE.length === 0) return done(addLog(ctx, 'エナゾーンにシグニなし'));
    const addFieldAct: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
    return selectOrInteract(signiInEnaSFE, 1, false, 'self_energy', addFieldAct as EffectAction, undefined, ctx);
  }
  // INTERNAL_DISCARD_ALL_DRAW_N: 手札をすべて捨てN枚引く
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
    return done(addLog({ ...ctx, ownerState: finalOwner }, `手札すべて捨て→${drawNIDADN}枚ドロー`));
  }
  // INTERNAL_DECK_BOTTOM_SUMMON: デッキ下1枚トラッシュ→シグニなら場に出す
  if (stub.id === 'INTERNAL_DECK_BOTTOM_SUMMON') {
    const deck = ctx.ownerState.deck;
    if (deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const bottom = deck[deck.length - 1];
    const newDeck = deck.slice(0, -1);
    const card = ctx.cardMap.get(bottom);
    const newOwner = { ...ctx.ownerState, deck: newDeck, trash: [...ctx.ownerState.trash, bottom] };
    const ctxIDBSM = addLog({ ...ctx, ownerState: newOwner }, `デッキ下(${card?.CardName ?? bottom})をトラッシュへ`);
    if (card?.Type === 'シグニ') {
      const addField: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
      return exec(addField as EffectAction, { ...ctxIDBSM, lastProcessedCards: [bottom] });
    }
    return done(ctxIDBSM);
  }
  // INTERNAL_DECK_BOTTOM_LEVEL_DOWN: デッキ下1枚トラッシュ→シグニなら同レベル相手シグニをダウン
  if (stub.id === 'INTERNAL_DECK_BOTTOM_LEVEL_DOWN') {
    const deckIDBLD = ctx.ownerState.deck;
    if (deckIDBLD.length === 0) return done(addLog(ctx, 'デッキなし'));
    const bottomIDBLD = deckIDBLD[deckIDBLD.length - 1];
    const bottomCard = ctx.cardMap.get(bottomIDBLD);
    const newDeckIDBLD = deckIDBLD.slice(0, -1);
    const newOwnerIDBLD = { ...ctx.ownerState, deck: newDeckIDBLD, trash: [...ctx.ownerState.trash, bottomIDBLD] };
    let ctxIDBLD = addLog({ ...ctx, ownerState: newOwnerIDBLD }, `デッキ下(${bottomCard?.CardName ?? bottomIDBLD})をトラッシュへ`);
    if (bottomCard?.Type === 'シグニ') {
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
        `同レベル(${lv})の相手シグニ${targets.length}体をダウン`);
    }
    return done(ctxIDBLD);
  }
  // INTERNAL_BLOCK_ATTACK_THIS_TURN: 対象がアタックできない
  if (stub.id === 'INTERNAL_BLOCK_ATTACK_THIS_TURN') {
    const targetIBAC = ctx.lastProcessedCards?.[0];
    if (!targetIBAC) return done(addLog(ctx, '対象なし'));
    const blockedIBAC = [...(ctx.otherState.blocked_actions ?? []), `ATTACK:${targetIBAC}`];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: blockedIBAC } },
      `${ctx.cardMap.get(targetIBAC)?.CardName ?? targetIBAC}はアタックできない`));
  }
  // DOWN_UP_SIGNI_AND_CHOOSE: シグニをダウン/アップして選択
  // DOWN_UP_SIGNI_AND_CHOOSE: アップ状態の特定クラスシグニを好きな数ダウン（コスト軽減素材）
  if (stub.id === 'DOWN_UP_SIGNI_AND_CHOOSE') {
    const srcDUSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDUSC = srcDUSC ? (srcDUSC.EffectText ?? '') + ' ' + (srcDUSC.BurstText ?? '') : '';
    // 対象クラスを抽出（「アップ状態の＜クラス＞のシグニ」）
    const classM = txtDUSC.match(/アップ状態の＜([^＞]+)＞のシグニ/);
    const targetClass = classM ? classM[1] : null;
    // UP状態の対象クラスシグニを収集
    const upSigniDUSC = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      const isDown = ctx.ownerState.field.signi_down?.[zi] ?? false;
      if (!top || isDown) return [];
      const card = ctx.cardMap.get(top);
      if (targetClass && !card?.CardClass?.includes(targetClass)) return [];
      return [{ cn: top, zi }];
    });
    if (upSigniDUSC.length === 0) {
      return done(addLog(ctx, `アップ状態の${targetClass ?? 'シグニ'}なし（DOWN_UP_SIGNI_AND_CHOOSE）`));
    }
    // 選択肢：「N体ダウン」オプション（0 to upSigniDUSC.length）
    const optsDUSC = [
      { id: 'dusc_none', label: 'ダウンしない', action: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction, available: true },
      ...upSigniDUSC.map((s, i) => ({
        id: `dusc_${i}`,
        label: `${ctx.cardMap.get(s.cn)?.CardName ?? s.cn}をダウン`,
        action: ({ type: 'STUB', id: 'INTERNAL_DOWN_SIGNI_BY_ZONE', value: s.zi } as StubAction) as EffectAction,
        available: true,
      })),
    ];
    return needsInteraction(
      addLog(ctx, `アップ${targetClass ?? ''}シグニを選択してダウン（コスト軽減素材）`),
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
      `${topIDSBZ ? ctx.cardMap.get(topIDSBZ)?.CardName : 'シグニ'}をダウン（コスト軽減）`));
  }
  // CHOOSE_N_FROM_LIST: 以下の①②③④からN個選択して実行
  if (stub.id === 'CHOOSE_N_FROM_LIST') {
    const srcCNFL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCNFL = srcCNFL ? (srcCNFL.EffectText ?? '') + ' ' + (srcCNFL.BurstText ?? '') : '';
    const toHWCNFL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 選択数を解析（「N つまで選ぶ」「N つ選ぶ」）
    const countM = txtCNFL.match(/([１-４1-4])つ(?:まで)?選ぶ/);
    const maxChoose = countM ? parseInt(toHWCNFL(countM[1])) : 2;
    // ①②③④ を解析してCHOOSEオプション生成（CONDITIONAL_MULTI_CHOOSE_BY_CENTERと同じロジック）
    const choicePatternsCNFL = [
      { m: /①([^②③④]+)/, idx: 0 }, { m: /②([^③④⑤]+)/, idx: 1 },
      { m: /③([^④⑤]+)/, idx: 2 }, { m: /④([^⑤]+)/, idx: 3 },
    ];
    const optsCNFL: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of choicePatternsCNFL) {
      const mat = txtCNFL.match(m);
      if (!mat) continue;
      const choiceTxtCNFL = mat[1].replace(/。\s*$/, '').trim();
      let choiceActionCNFL: EffectAction | null = null;
      if (choiceTxtCNFL.match(/カードを[１1]枚引く/))
        choiceActionCNFL = { type: 'DRAW', count: 1 } as DrawAction;
      if (!choiceActionCNFL && choiceTxtCNFL.match(/対戦相手のシグニ[１1]体を対象とし.*ダウン/))
        choiceActionCNFL = { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as DownAction;
      if (!choiceActionCNFL && choiceTxtCNFL.match(/手札を[１1]枚見ないで選び.*捨て/))
        choiceActionCNFL = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as TrashAction;
      const pwDownMCNFL = !choiceActionCNFL && choiceTxtCNFL.match(/パワーを([－-][０-９\d]+)する/);
      if (pwDownMCNFL) {
        const delta = parseInt(toHWCNFL(pwDownMCNFL[1]).replace('－', '-'));
        choiceActionCNFL = ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_OPP_ONE', value: delta } as StubAction) as EffectAction;
      }
      if (!choiceActionCNFL && choiceTxtCNFL.match(/ダウンする/))
        choiceActionCNFL = { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as DownAction;
      if (choiceActionCNFL)
        optsCNFL.push({ id: `choice_${idx}`, label: `${'①②③④'[idx]}${choiceTxtCNFL.slice(0, 18)}...`, action: choiceActionCNFL, available: true });
    }
    if (optsCNFL.length > 0) {
      return needsInteraction(addLog(ctx, `効果を${maxChoose}つ選択（CHOOSE_N_FROM_LIST）`), {
        type: 'CHOOSE', options: optsCNFL, count: Math.min(maxChoose, optsCNFL.length),
      });
    }
    return done(addLog(ctx, `リストからN個選択（解析不可: ${txtCNFL.slice(0,30)}）`));
  }
  // CHOOSE_COLOR_FROM_LIST / CHOOSE_SAME_OPTION_TWICE / CHOOSE_SAME_OPTION_MULTIPLE
  // CHOOSE_COLOR_FROM_LIST: エナゾーンの色から選ぶ（最大N色）→ selectedColors に保存
  if (stub.id === 'CHOOSE_COLOR_FROM_LIST') {
    const colorNames = ['白', '赤', '青', '緑', '黒'];
    // エナゾーンにある色を収集
    const enaColorsCCL = new Set<string>();
    ctx.ownerState.energy.forEach(cn => {
      const c = ctx.cardMap.get(cn);
      (c?.Color ?? '').split(/[・,、]/).forEach(col => { if (colorNames.includes(col.trim())) enaColorsCCL.add(col.trim()); });
    });
    if (enaColorsCCL.size === 0) return done(addLog(ctx, '色選択：エナに色なし'));
    const optsCCL = [...enaColorsCCL].map(col => ({
      id: `color_${col}`,
      label: `《${col}》を選ぶ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SELECT_COLOR', value: col } as StubAction) as EffectAction,
      available: true,
    }));
    const srcCCL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCCL = srcCCL ? srcCCL.EffectText ?? '' : '';
    const maxMCCL = txtCCL.match(/最大([１-５1-5])色/);
    const maxCount = maxMCCL ? parseInt(maxMCCL[1].replace(/[１-５]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))) : 1;
    return needsInteraction(addLog(ctx, `色を選択（最大${maxCount}色）`), {
      type: 'CHOOSE', options: optsCCL, count: Math.min(maxCount, optsCCL.length),
    });
  }
  if (stub.id === 'INTERNAL_SELECT_COLOR') {
    const colISC = typeof stub.value === 'string' ? stub.value : '';
    const selectedColors = [...(ctx.ownerState.story_overrides?.['__selected_colors__']?.split(',') ?? []), colISC].filter(Boolean);
    const newOv = { ...(ctx.ownerState.story_overrides ?? {}), '__selected_colors__': selectedColors.join(',') };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, story_overrides: newOv } }, `《${colISC}》を選択`));
  }
  if (stub.id === 'CHOOSE_SAME_OPTION_TWICE' || stub.id === 'CHOOSE_SAME_OPTION_MULTIPLE') {
    const srcCSO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCSO = srcCSO ? (srcCSO.EffectText ?? '') + ' ' + (srcCSO.BurstText ?? '') : '';
    const toHWCSO = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const cntMCSO = txtCSO.match(/以下の.*?から([２-９\d])つまで選ぶ/);
    const maxRoundsCSO = cntMCSO ? parseInt(toHWCSO(cntMCSO[1])) : 2;
    const remainingCSO = typeof stub.value === 'number' ? stub.value : maxRoundsCSO;
    if (remainingCSO <= 0) return done(addLog(ctx, '選択完了'));
    const optsCSO: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    // ①バウンス: 相手シグニを手札に戻す（手札捨てセットも含む）
    if (txtCSO.match(/①.*手札に戻す/)) {
      const hasDiscard = /①[^②]*手札を[１1]枚捨てる/.test(txtCSO);
      const bounceAct: EffectAction = hasDiscard
        ? { type: 'SEQUENCE', steps: [
            { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } as BounceAction,
            { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } } as TrashAction,
          ]} as import('../types/effects').SequenceAction
        : { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } as BounceAction;
      optsCSO.push({
        id: 'cso_bounce', label: '①相手シグニを手札に戻す' + (hasDiscard ? '（手札1枚捨て）' : ''),
        action: bounceAct,
        available: ctx.otherState.field.signi.some(s => s && s.length > 0),
      });
    }
    // ②アタックできない付与: センタールリグにアタック禁止を付与
    if (txtCSO.match(/②.*アタックできない/)) {
      optsCSO.push({
        id: 'cso_no_attack', label: '②相手センタールリグにアタック不可を付与',
        action: { type: 'STUB', id: 'INTERNAL_GRANT_NO_ATTACK_LRIG' } as StubAction as EffectAction,
        available: !!ctx.otherState.field.lrig.at(-1),
      });
    }
    // ②サーチ: デッキからシグニを手札に加える
    if (txtCSO.match(/②.*デッキ.*シグニ.*(?:手札|探して)/)) {
      optsCSO.push({
        id: 'cso_search', label: '②デッキからシグニを手札に加える',
        action: { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ' }, maxCount: 1, then: { type: 'ADD_TO_HAND', owner: 'self' }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } } as EffectAction,
        available: ctx.ownerState.deck.some(cn => ctx.cardMap.get(cn)?.Type === 'シグニ'),
      });
    }
    // ③クラスサーチ: デッキから特定クラスのシグニをN枚手札に加える
    if (txtCSO.match(/③.*デッキから.*＜([^＞]+)＞のシグニ([２-９\d]+)枚を探して/)) {
      const mCS3 = txtCSO.match(/③.*＜([^＞]+)＞のシグニ([２-９\d]+)枚/);
      const className3 = mCS3 ? mCS3[1] : '';
      const cnt3 = mCS3 ? parseInt(toHWCSO(mCS3[2])) : 2;
      optsCSO.push({
        id: 'cso_class_search', label: `③デッキから＜${className3}＞を${cnt3}枚手札へ`,
        action: { type: 'SEQUENCE', steps: [
          { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ', story: className3 }, maxCount: cnt3, then: { type: 'ADD_TO_HAND', owner: 'self' }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } },
        ]} as import('../types/effects').SequenceAction as EffectAction,
        available: ctx.ownerState.deck.some(cn => (ctx.cardMap.get(cn)?.CardClass ?? '').includes(className3)),
      });
    }
    if (optsCSO.length === 0) return done(addLog(ctx, `[CHOOSE_SAME_OPTION: 選択肢解析失敗]`));
    const contCSO: StubAction = { type: 'STUB', id: stub.id, value: remainingCSO - 1 };
    return needsInteraction(addLog(ctx, `選択（残り${remainingCSO}回、同一選択肢可）`), {
      type: 'CHOOSE', options: optsCSO, count: 1, continuation: contCSO as EffectAction,
    });
  }
  // === バッチ15: 公開・アクセ応用・条件ドロー系 ===
  // FIELD_COND_DRAW_REVEAL: フィールド条件達成時にデッキ上を公開し同クラスなら手札へ
  if (stub.id === 'FIELD_COND_DRAW_REVEAL') {
    const srcFCDR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtFCDR = srcFCDR ? (srcFCDR.EffectText ?? '') + ' ' + (srcFCDR.BurstText ?? '') : '';
    const mClassFCDR = txtFCDR.match(/＜([^＞]+)＞/);
    const classNameFCDR = mClassFCDR ? mClassFCDR[1] : '';
    const hasClassFCDR = !classNameFCDR || ctx.ownerState.field.signi.some(s => {
      if (!s || s.length === 0) return false;
      return ctx.cardMap.get(s[s.length - 1])?.CardClass?.includes(classNameFCDR);
    });
    if (!hasClassFCDR) return done(addLog(ctx, `フィールドに＜${classNameFCDR}＞なし（条件未達成）`));
    const sFCDR = ctx.ownerState;
    if (sFCDR.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topFCDR = sFCDR.deck[0];
    const topCardFCDR = ctx.cardMap.get(topFCDR);
    const topClassFCDR = topCardFCDR?.CardClass ?? '';
    if (classNameFCDR && topClassFCDR.includes(classNameFCDR)) {
      const newSFCDR: PlayerState = { ...sFCDR, deck: sFCDR.deck.slice(1), hand: [...sFCDR.hand, topFCDR] };
      return done(addLog({ ...ctx, ownerState: newSFCDR }, `公開${topCardFCDR?.CardName ?? topFCDR}(＜${classNameFCDR}＞一致)→手札へ`));
    }
    const newSFCDR2: PlayerState = { ...sFCDR, deck: sFCDR.deck.slice(1), trash: [...sFCDR.trash, topFCDR] };
    return done(addLog({ ...ctx, ownerState: newSFCDR2 }, `公開${topCardFCDR?.CardName ?? topFCDR}(不一致)→トラッシュ`));
  }
  // REVEAL: デッキ上を公開（名前ログ）
  if (stub.id === 'REVEAL') {
    const sREV = ctx.ownerState;
    if (sREV.deck.length === 0) return done(addLog(ctx, 'デッキなし（公開できず）'));
    const topREV = sREV.deck[0];
    const cardREV = ctx.cardMap.get(topREV);
    return done(addLog({ ...ctx, lastProcessedCards: [topREV] }, `公開：${cardREV?.CardName ?? topREV}`));
  }
  // HAND_REVEAL_CLASS_SIGNI: 手札のクラスシグニを選択して公開（SELECT_TARGET）
  if (stub.id === 'HAND_REVEAL_CLASS_SIGNI') {
    const srcHRCS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHRCS = srcHRCS ? (srcHRCS.EffectText ?? '') + ' ' + (srcHRCS.BurstText ?? '') : '';
    // クラス名を抽出（例: ＜アーム＞、＜水獣＞）
    const classMatchHRCS = txtHRCS.match(/手札から(?:好きな枚数の?)?[＜《]([^＞》]+)[＞》]/);
    const classNameHRCS = classMatchHRCS ? classMatchHRCS[1] : '';
    const isAnyCountHRCS = txtHRCS.includes('好きな枚数');
    // 手札からクラスシグニを絞り込む
    const candsHRCS = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (!classNameHRCS || (c.CardClass ?? '').includes(classNameHRCS));
    });
    if (candsHRCS.length === 0) {
      return done(addLog({ ...ctx, lastProcessedCards: [] },
        `手札に${classNameHRCS ? `＜${classNameHRCS}＞` : ''}シグニなし（公開なし）`));
    }
    const countHRCS = isAnyCountHRCS ? candsHRCS.length : 1;
    const noopHRCS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(
      addLog(ctx, `手札から${classNameHRCS ? `＜${classNameHRCS}＞` : ''}シグニを${isAnyCountHRCS ? '好きな枚数' : '１枚'}公開する`),
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
  // OPTIONAL_HAND_REVEAL_NAMED: 名称指定で手札カードを任意公開
  if (stub.id === 'OPTIONAL_HAND_REVEAL_NAMED') {
    const srcOHRN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOHRN = srcOHRN ? (srcOHRN.EffectText ?? '') + ' ' + (srcOHRN.BurstText ?? '') : '';
    const mNameOHRN = txtOHRN.match(/「([^」]+)」/);
    const nameOHRN = mNameOHRN ? mNameOHRN[1] : '';
    const matchingOHRN = ctx.ownerState.hand.filter(cn => nameOHRN && ctx.cardMap.get(cn)?.CardName === nameOHRN);
    if (matchingOHRN.length === 0) return done(addLog(ctx, `手札に「${nameOHRN}」なし（公開なし）`));
    return done(addLog({ ...ctx, lastProcessedCards: matchingOHRN },
      `手札「${nameOHRN}」を公開（${matchingOHRN.length}枚）`));
  }
  // ACCE_SIGNI_GRANT_ABILITY: アクセ中のシグニにキーワード能力を付与
  if (stub.id === 'ACCE_SIGNI_GRANT_ABILITY') {
    const srcAcceAGSA = ctx.sourceCardNum;
    const acceAGSA = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const zoneIdxAGSA = acceAGSA.findIndex(cn => cn === srcAcceAGSA);
    if (zoneIdxAGSA < 0) return done(addLog(ctx, 'アクセ中のシグニが見つからない'));
    const targetSigniAGSA = ctx.ownerState.field.signi[zoneIdxAGSA]?.at(-1);
    if (!targetSigniAGSA) return done(addLog(ctx, 'アクセ先のシグニがいない'));
    const srcCardAGSA = ctx.cardMap.get(srcAcceAGSA ?? '');
    const txtAGSA = srcCardAGSA ? (srcCardAGSA.EffectText ?? '') : '';
    const mKwAGSA = txtAGSA.match(/【([^】]+)】/);
    const kwAGSA = mKwAGSA ? mKwAGSA[1] : 'ランサー';
    const kwGrantsAGSA = { ...(ctx.ownerState.keyword_grants ?? {}) };
    const existingAGSA = kwGrantsAGSA[targetSigniAGSA] ?? [];
    if (!existingAGSA.includes(kwAGSA)) kwGrantsAGSA[targetSigniAGSA] = [...existingAGSA, kwAGSA];
    const newSAGSA: PlayerState = { ...ctx.ownerState, keyword_grants: kwGrantsAGSA };
    return done(addLog({ ...ctx, ownerState: newSAGSA },
      `${ctx.cardMap.get(targetSigniAGSA)?.CardName ?? targetSigniAGSA}に【${kwAGSA}】付与`));
  }
  // MOVE_ACCE_TO_SIGNI: アクセを別のシグニに付け替え
  if (stub.id === 'MOVE_ACCE_TO_SIGNI') {
    const srcAcceMATS = ctx.sourceCardNum;
    const acceMATS = [...(ctx.ownerState.field.signi_acce ?? [null, null, null])];
    const srcZoneMATS = acceMATS.findIndex(cn => cn === srcAcceMATS);
    if (srcZoneMATS < 0) return done(addLog(ctx, 'アクセ中のシグニが見つからない'));
    // アクセがついていないゾーンを探す
    const dstZoneMATS = acceMATS.findIndex((cn, i) => i !== srcZoneMATS && cn === null &&
      ctx.ownerState.field.signi[i] && (ctx.ownerState.field.signi[i]?.length ?? 0) > 0);
    if (dstZoneMATS < 0) return done(addLog(ctx, '移動先のシグニゾーンなし'));
    acceMATS[srcZoneMATS] = null;
    acceMATS[dstZoneMATS] = srcAcceMATS ?? null;
    const newSMATS: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_acce: acceMATS } };
    const dstSigniName = ctx.cardMap.get(ctx.ownerState.field.signi[dstZoneMATS]?.at(-1) ?? '')?.CardName ?? 'シグニ';
    return done(addLog({ ...ctx, ownerState: newSMATS },
      `${ctx.cardMap.get(srcAcceMATS ?? '')?.CardName ?? 'アクセ'}を${dstSigniName}へ移動`));
  }
  // PEEP_HAND: 相手の手札を覗き見（ログに枚数と名前を表示）
  if (stub.id === 'PEEP_HAND') {
    const oppHandPH = ctx.otherState.hand;
    const namesPH = oppHandPH.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
    return done(addLog(ctx, `相手の手札を確認（${oppHandPH.length}枚）：${namesPH || 'なし'}`));
  }
  // REVEAL_OPP_HAND_CARD: 相手の手札のカードを1枚公開
  if (stub.id === 'REVEAL_OPP_HAND_CARD') {
    const oppHandROHC = ctx.otherState.hand;
    if (oppHandROHC.length === 0) return done(addLog(ctx, '相手の手札なし'));
    const randROHC = oppHandROHC[Math.floor(Math.random() * oppHandROHC.length)];
    return done(addLog({ ...ctx, lastProcessedCards: [randROHC] },
      `相手の手札を公開：${ctx.cardMap.get(randROHC)?.CardName ?? randROHC}`));
  }
  // OPP_REVEAL_HAND_AND_LRIG_DECK / OPP_REVEAL_LRIG_DECK / OPP_REVEAL_TOP_AND_HAND: 公開ログ
  if (stub.id === 'OPP_REVEAL_HAND_AND_LRIG_DECK' || stub.id === 'OPP_REVEAL_LRIG_DECK' || stub.id === 'OPP_REVEAL_TOP_AND_HAND') {
    const handNames = ctx.otherState.hand.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
    const lrigNames = ctx.otherState.lrig_deck.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
    if (stub.id === 'OPP_REVEAL_LRIG_DECK') {
      return done(addLog(ctx, `相手のルリグデッキ公開（${ctx.otherState.lrig_deck.length}枚）：${lrigNames || 'なし'}`));
    }
    if (stub.id === 'OPP_REVEAL_TOP_AND_HAND') {
      const topName = ctx.cardMap.get(ctx.otherState.deck[0] ?? '')?.CardName ?? 'なし';
      return done(addLog(ctx, `相手のデッキ上（${topName}）+手札（${handNames || 'なし'}）を公開`));
    }
    return done(addLog(ctx, `相手の手札（${handNames || 'なし'}）+ルリグデッキ（${lrigNames || 'なし'}）を公開`));
  }
  // === バッチ14: シグニ移動・エナ操作・複数対象系 ===
  // OPP_SIGNI_TO_DECK_AND_SHUFFLE / OPP_SIGNI_TO_DECK_BY_GATE / OPP_SIGNI_TO_DECK_NTH は line 2567 の handler で処理済み（dead code 削除）
  // INTERNAL_BOUNCE_TO_DECK: 選択シグニをデッキにランダム挿入
  if (stub.id === 'INTERNAL_BOUNCE_TO_DECK') {
    const cnIBTD = ctx.lastProcessedCards?.[0];
    if (!cnIBTD) return done(addLog(ctx, '対象なし'));
    const inOwnIBTD = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnIBTD);
    const ownerIBTD: Owner = inOwnIBTD ? 'self' : 'opponent';
    const sIBTD = ownerState(ownerIBTD, ctx);
    const removedIBTD = removeFromField(cnIBTD, sIBTD);
    const deckIBTD = [...removedIBTD.deck];
    const insertIBTD = Math.floor(Math.random() * (deckIBTD.length + 1));
    deckIBTD.splice(insertIBTD, 0, cnIBTD);
    const newSIBTD: PlayerState = { ...removedIBTD, deck: deckIBTD };
    return done(addLog(setOwnerState(ownerIBTD, newSIBTD, ctx),
      `${ctx.cardMap.get(cnIBTD)?.CardName ?? cnIBTD}をデッキに混ぜた（シャッフル）`));
  }
  // OPP_SIGNI_LEAVE_TO_TRASH: 相手シグニ退場→トラッシュ（エナではなく）
  if (stub.id === 'OPP_SIGNI_LEAVE_TO_TRASH') {
    const candidatesOSLT = (ctx.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candidatesOSLT.length === 0) return done(addLog(ctx, '相手シグニなし'));
    const thenOSLT: StubAction = { type: 'STUB', id: 'INTERNAL_LEAVE_TO_TRASH' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candidatesOSLT, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: thenOSLT as EffectAction,
    });
  }
  // INTERNAL_LEAVE_TO_TRASH: 選択シグニをトラッシュに置く
  if (stub.id === 'INTERNAL_LEAVE_TO_TRASH') {
    const cnILT = ctx.lastProcessedCards?.[0];
    if (!cnILT) return done(addLog(ctx, '対象なし'));
    const inOwnILT = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnILT);
    const ownerILT: Owner = inOwnILT ? 'self' : 'opponent';
    const sILT = ownerState(ownerILT, ctx);
    const removedILT = removeFromField(cnILT, sILT);
    const newSILT: PlayerState = { ...removedILT, trash: [...removedILT.trash, cnILT] };
    return done(addLog(setOwnerState(ownerILT, newSILT, ctx),
      `${ctx.cardMap.get(cnILT)?.CardName ?? cnILT}をトラッシュへ退場`));
  }
  // TRADE_SELF_AND_OPP_TO_ENERGY: 自シグニ+相手シグニ1体→両者エナ
  if (stub.id === 'TRADE_SELF_AND_OPP_TO_ENERGY') {
    const srcTSAOTE = ctx.sourceCardNum;
    let ctxTSAOTE = ctx;
    if (srcTSAOTE && ctx.ownerState.field.signi.some(s => s?.at(-1) === srcTSAOTE)) {
      const removedTSAOTE = removeFromField(srcTSAOTE, ctx.ownerState);
      const newOwnerTSAOTE: PlayerState = { ...removedTSAOTE, energy: [...removedTSAOTE.energy, srcTSAOTE] };
      ctxTSAOTE = { ...ctxTSAOTE, ownerState: newOwnerTSAOTE };
    }
    const candsTSAOTE = (ctxTSAOTE.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candsTSAOTE.length === 0) return done(addLog(ctxTSAOTE, '自シグニ→エナ（相手シグニなし）'));
    const banishTSAOTE: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'any', count: 1 } };
    return needsInteraction(addLog(ctxTSAOTE, '自シグニ→エナ、相手シグニ1体選択'), {
      type: 'SELECT_TARGET', candidates: candsTSAOTE, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: banishTSAOTE as EffectAction,
    });
  }
  // MULTI_SIGNI_TO_ENERGY: 自分の複数シグニをエナに
  if (stub.id === 'MULTI_SIGNI_TO_ENERGY') {
    const toHWMSTE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcMSTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMSTE = srcMSTE ? (srcMSTE.EffectText ?? '') + ' ' + (srcMSTE.BurstText ?? '') : '';
    const mMSTE = txtMSTE.match(/([０-９\d]+)体/);
    const countMSTE = mMSTE ? parseInt(toHWMSTE(mMSTE[1])) : 2;
    const candsMSTE = (ctx.ownerState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candsMSTE.length === 0) return done(addLog(ctx, 'シグニなし'));
    const banishMSTE: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'any', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsMSTE,
      count: Math.min(countMSTE, candsMSTE.length), optional: false,
      targetScope: 'self_field', thenAction: banishMSTE as EffectAction,
    });
  }
  // MULTI_SIGNI_POWER_UP_5000: 複数シグニに+5000パワー
  if (stub.id === 'MULTI_SIGNI_POWER_UP_5000') {
    const toHWMSPU5 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcMSPU5 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMSPU5 = srcMSPU5 ? (srcMSPU5.EffectText ?? '') + ' ' + (srcMSPU5.BurstText ?? '') : '';
    const mMSPU5 = txtMSPU5.match(/([０-９\d]+)体/);
    const countMSPU5 = mMSPU5 ? parseInt(toHWMSPU5(mMSPU5[1])) : 2;
    const mDeltaMSPU5 = txtMSPU5.match(/\+([０-９\d]+)/);
    const deltaMSPU5 = mDeltaMSPU5 ? parseInt(toHWMSPU5(mDeltaMSPU5[1])) : 5000;
    const candsMSPU5 = (ctx.ownerState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candsMSPU5.length === 0) return done(addLog(ctx, 'シグニなし'));
    const pmMSPU5: PowerModifyAction = {
      type: 'POWER_MODIFY', delta: deltaMSPU5, target: { type: 'SIGNI', owner: 'self', count: 1 },
    };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsMSPU5,
      count: Math.min(countMSPU5, candsMSPU5.length), optional: false,
      targetScope: 'self_field', thenAction: pmMSPU5 as EffectAction,
    });
  }
  // TRASHED_CARD_TO_HAND_OR_ENERGY: トラッシュカード→手札かエナ選択
  // OPP_TRASH_FIELD_SIGNI_AND_ENERGY: 相手のシグニとエナをトラッシュ
  if (stub.id === 'OPP_TRASH_FIELD_SIGNI_AND_ENERGY') {
    const candidatesOTFSE = (ctx.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    let otherOTFSE = ctx.otherState;
    // 相手フィールドシグニを全てトラッシュ
    for (const cn of candidatesOTFSE) {
      const removed = removeFromField(cn, otherOTFSE);
      otherOTFSE = { ...removed, trash: [...removed.trash, cn] };
    }
    // 相手エナを全てトラッシュ
    otherOTFSE = { ...otherOTFSE, trash: [...otherOTFSE.trash, ...otherOTFSE.energy], energy: [] };
    return done(addLog({ ...ctx, otherState: otherOTFSE },
      `相手シグニ${candidatesOTFSE.length}体+全エナをトラッシュ`));
  }
  // NON_GUARD_DISCARD_TO_ENERGY: 非ガード捨て牌をエナゾーンへ
  if (stub.id === 'NON_GUARD_DISCARD_TO_ENERGY') {
    const cnNGDTE = ctx.lastProcessedCards?.[0];
    if (!cnNGDTE) return done(addLog(ctx, '対象なし'));
    const cardNGDTE = ctx.cardMap.get(cnNGDTE);
    const hasGuardNGDTE = cardNGDTE?.Guard === '○' || (cardNGDTE?.EffectText ?? '').includes('【ガード】');
    if (hasGuardNGDTE) return done(addLog(ctx, 'ガードカードなのでエナ移動なし'));
    const newSNGDTE: PlayerState = {
      ...ctx.ownerState,
      trash: ctx.ownerState.trash.filter(c => c !== cnNGDTE),
      energy: [...ctx.ownerState.energy, cnNGDTE],
    };
    return done(addLog({ ...ctx, ownerState: newSNGDTE }, `非ガード捨て牌→エナゾーンへ`));
  }
  // === バッチ13: エナ操作・カウント・条件分岐系 ===
  // ENERGY_TO_HAND_ON_DECK: エナゾーンの末尾→手札（デッキ経由を省略）
  if (stub.id === 'ENERGY_TO_HAND_ON_DECK') {
    const sETHOD = ctx.ownerState;
    if (sETHOD.energy.length === 0) return done(addLog(ctx, 'エナゾーンなし'));
    const lastEnaETHOD = sETHOD.energy.at(-1)!;
    const newSETHOD: PlayerState = {
      ...sETHOD,
      energy: sETHOD.energy.slice(0, -1),
      hand: [...sETHOD.hand, lastEnaETHOD],
    };
    return done(addLog({ ...ctx, ownerState: newSETHOD }, `${ctx.cardMap.get(lastEnaETHOD)?.CardName ?? lastEnaETHOD}をエナ→手札`));
  }
  // COUNT_DISTINCT_NAMES: フィールドの異なる名称数を数えてパワー修正
  if (stub.id === 'COUNT_DISTINCT_NAMES') {
    const toHWCDN = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcCDN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCDN = srcCDN ? (srcCDN.EffectText ?? '') + ' ' + (srcCDN.BurstText ?? '') : '';
    const mCDN = txtCDN.match(/([＋+－-][０-９\d]+)/);
    const deltaCDN = mCDN ? parseInt(toHWCDN(mCDN[1]).replace('＋', '+').replace('－', '-')) : 1000;
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
        `異なる名称${countCDN}種×${deltaCDN}→パワー${totalCDN}`));
    }
    return done(addLog(ctx, `異なる名称${countCDN}種`));
  }
  // DISCARD_OR_PENALTY: 特定カード1枚捨てるかペナルティ（N枚捨て）を選ぶ
  if (stub.id === 'DISCARD_OR_PENALTY') {
    const srcDOP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDOP = srcDOP ? (srcDOP.EffectText ?? '') + ' ' + (srcDOP.BurstText ?? '') : '';
    const toHWDOP = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchDOP = txtDOP.match(/手札から[<＜]([^>＞]+)[>＞]のシグニを１枚捨てないかぎり/);
    const typeMatchDOP = !classMatchDOP ? txtDOP.match(/手札から(スペル|シグニ|アーツ)を１枚捨てないかぎり/) : null;
    const penaltyMDOP = txtDOP.match(/かぎり手札を([２-９\d]+)枚捨てる/);
    const penaltyCount = penaltyMDOP ? parseInt(toHWDOP(penaltyMDOP[1])) : 2;
    const matchingDOP = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (classMatchDOP) return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(classMatchDOP[1]);
      if (typeMatchDOP) return c?.Type === typeMatchDOP[1];
      return false;
    });
    const labelDOP = classMatchDOP ? `＜${classMatchDOP[1]}＞シグニを1枚捨てる` : typeMatchDOP ? `${typeMatchDOP[1]}を1枚捨てる` : '指定カードを1枚捨てる';
    const penaltyActionDOP: StubAction = { type: 'STUB', id: 'INTERNAL_DISCARD_PENALTY', value: penaltyCount };
    if (matchingDOP.length === 0) {
      const toDiscard = ctx.ownerState.hand.slice(0, penaltyCount);
      const newOwner = { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(penaltyCount), trash: [...ctx.ownerState.trash, ...toDiscard] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `指定カードなし→ペナルティ手札${penaltyCount}枚捨て`));
    }
    return needsInteraction(addLog(ctx, `${labelDOP}か手札を${penaltyCount}枚捨てるか選択`), {
      type: 'CHOOSE', count: 1, options: [
        { id: 'specific', label: labelDOP, action: { type: 'STUB', id: 'INTERNAL_DISCARD_MATCHING_HAND_DOP' } as EffectAction, available: true },
        { id: 'penalty',  label: `手札を${penaltyCount}枚捨てる`, action: penaltyActionDOP as EffectAction, available: ctx.ownerState.hand.length >= penaltyCount },
      ],
    });
  }
  if (stub.id === 'INTERNAL_DISCARD_MATCHING_HAND_DOP') {
    const srcIDMD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtIDMD = srcIDMD ? (srcIDMD.EffectText ?? '') + ' ' + (srcIDMD.BurstText ?? '') : '';
    const classMatchIDMD = txtIDMD.match(/手札から[<＜]([^>＞]+)[>＞]のシグニ/);
    const typeMatchIDMD = !classMatchIDMD ? txtIDMD.match(/手札から(スペル|シグニ|アーツ)/) : null;
    const candsIDMD = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (classMatchIDMD) return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(classMatchIDMD[1]);
      if (typeMatchIDMD) return c?.Type === typeMatchIDMD[1];
      return false;
    });
    if (candsIDMD.length === 0) return done(addLog(ctx, '該当カードなし'));
    const trashOneIDMD: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };
    return selectOrInteract(candsIDMD, 1, false, 'self_hand', trashOneIDMD as EffectAction, undefined, ctx);
  }
  if (stub.id === 'INTERNAL_DISCARD_PENALTY') {
    const cntIDP = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '2'));
    const toDiscardIDP = ctx.ownerState.hand.slice(0, cntIDP);
    const newOwnerIDP = { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(cntIDP), trash: [...ctx.ownerState.trash, ...toDiscardIDP] };
    return done(addLog({ ...ctx, ownerState: newOwnerIDP }, `ペナルティ：手札${cntIDP}枚捨て`));
  }
  // REVEAL_TOP_CONDITIONAL_ROUTE: デッキ上を公開しレベル条件で分岐
  if (stub.id === 'REVEAL_TOP_CONDITIONAL_ROUTE') {
    const toHWRTCR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const sRTCR = ctx.ownerState;
    if (sRTCR.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topRTCR = sRTCR.deck[0];
    const cardRTCR = ctx.cardMap.get(topRTCR);
    const topLevelRTCR = cardRTCR ? parseInt(toHWRTCR(cardRTCR.Level ?? '0')) || 0 : 0;
    const srcRTCR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRTCR = srcRTCR ? (srcRTCR.EffectText ?? '') + ' ' + (srcRTCR.BurstText ?? '') : '';
    const mLvRTCR = txtRTCR.match(/レベル([０-９\d]+)以上/);
    const threshRTCR = mLvRTCR ? parseInt(toHWRTCR(mLvRTCR[1])) : 3;
    const condMetRTCR = topLevelRTCR >= threshRTCR;
    const newSRTCR: PlayerState = { ...sRTCR, deck: sRTCR.deck.slice(1), trash: [...sRTCR.trash, topRTCR] };
    return done(addLog({ ...ctx, ownerState: newSRTCR },
      `公開${cardRTCR?.CardName ?? topRTCR}(Lv${topLevelRTCR})：条件${condMetRTCR ? '達成' : '未達成'}→トラッシュ`));
  }
  // === バッチ12: アクセ・シグニ配置・能力付与・無効系 ===
  // ACCE_FROM_HAND: 手札のアクセカードを自分のシグニに付ける
  if (stub.id === 'ACCE_FROM_HAND' || stub.id === 'MULTI_ACCE_FROM_HAND') {
    const srcAFH = ctx.sourceCardNum;
    if (!srcAFH || !ctx.ownerState.hand.includes(srcAFH)) return done(addLog(ctx, 'アクセカードが手札にない'));
    const acceAFH = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const candidatesAFH = (ctx.ownerState.field.signi ?? []).flatMap((stack, i) => {
      if (!stack || stack.length === 0) return [];
      if (acceAFH[i] !== null) return [];
      return [stack[stack.length - 1]];
    });
    if (candidatesAFH.length === 0) return done(addLog(ctx, 'アクセ対象のシグニなし'));
    const attachAFH: AttachAcceAction = { type: 'ATTACH_ACCE', targetSigniOwner: 'self', sourceOwner: 'self' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candidatesAFH, count: 1, optional: false,
      targetScope: 'self_field', thenAction: attachAFH as EffectAction,
    });
  }
  // ACCE_FROM_TRASH: トラッシュのアクセカードを自分のシグニに付ける
  if (stub.id === 'ACCE_FROM_TRASH' || stub.id === 'NAMED_SIGNI_ACCE_FROM_TRASH') {
    const acceAFTR = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const candidatesAFTR = (ctx.ownerState.field.signi ?? []).flatMap((stack, i) => {
      if (!stack || stack.length === 0) return [];
      if (acceAFTR[i] !== null) return [];
      return [stack[stack.length - 1]];
    });
    if (candidatesAFTR.length === 0) return done(addLog(ctx, 'アクセ対象のシグニなし'));
    // トラッシュのアクセカードをいったん手札に移し、ATTACH_ACCEで処理
    const srcAFTR = ctx.sourceCardNum;
    const trashAcceAFTR = srcAFTR && ctx.ownerState.trash.includes(srcAFTR) ? srcAFTR : null;
    if (!trashAcceAFTR) return done(addLog(ctx, 'アクセカードがトラッシュにない'));
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
  // SIGNI_REPOSITION: シグニを別のゾーンに移動（自or相手、1体 or 全体）
  if (stub.id === 'SIGNI_REPOSITION' || stub.id === 'SWAP_OPTIONAL') {
    const srcCardSR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSR = srcCardSR ? (srcCardSR.EffectText ?? '') + ' ' + (srcCardSR.BurstText ?? '') : '';
    const isOppSR = txtSR.includes('対戦相手のシグニ');
    const isAllSR = txtSR.includes('すべてのシグニを') && !isOppSR;
    const targetStateSR = isOppSR ? ctx.otherState : ctx.ownerState;
    const targetScopeSR: TargetScope = isOppSR ? 'opp_field' : 'self_field';
    // 全シグニ配置替え: フィールドのシグニ全体をゾーン選択で入れ替える
    if (isAllSR) {
      const candsSRAll = ctx.ownerState.field.signi.flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
      if (candsSRAll.length < 2) return done(addLog(ctx, '配置替え不可（シグニ1体以下）'));
      // 1体ずつ選択して移動先を決める（任意）
      const selectedSRAll = (ctx.lastProcessedCards ?? []).find(cn =>
        ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
      if (!selectedSRAll) {
        const noopSRAll: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
        const contSRAll: StubAction = { type: 'STUB', id: 'SIGNI_REPOSITION' };
        return needsInteraction(addLog(ctx, '配置替えするシグニを選択（任意）'), {
          type: 'SELECT_TARGET', candidates: candsSRAll, count: 1, optional: true,
          targetScope: 'self_field', thenAction: noopSRAll as EffectAction, continuation: contSRAll as EffectAction,
        });
      }
      const curZoneSRAll = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === selectedSRAll);
      const zoneOptsSRAll = [0,1,2].filter(i => i !== curZoneSRAll).map(zi => ({
        id: `zone_${zi}`, label: `ゾーン${zi+1}へ移動`,
        action: ({ type: 'STUB', id: 'INTERNAL_REPOSITION_TO_ZONE',
          value: `${selectedSRAll}:${zi}:false` } as StubAction) as EffectAction,
        available: true,
      }));
      zoneOptsSRAll.push({ id: 'skip', label: '終了',
        action: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction) as EffectAction,
        available: true });
      return needsInteraction(addLog(ctx, '移動先ゾーンを選択'), { type: 'CHOOSE', options: zoneOptsSRAll, count: 1 });
    }
    // 対象シグニ選択
    const selectedSR = (ctx.lastProcessedCards ?? []).find(cn =>
      targetStateSR.field.signi.some(s => s?.at(-1) === cn),
    );
    if (!selectedSR) {
      const candsSR = targetStateSR.field.signi.flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
      if (candsSR.length === 0) return done(addLog(ctx, 'シグニなし（SIGNI_REPOSITION）'));
      const noopSR: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contSR: StubAction = { type: 'STUB', id: stub.id };
      return needsInteraction(addLog(ctx, '配置替えするシグニを選択'), {
        type: 'SELECT_TARGET', candidates: candsSR, count: 1, optional: stub.id === 'SWAP_OPTIONAL',
        targetScope: targetScopeSR, thenAction: noopSR as EffectAction, continuation: contSR as EffectAction,
      });
    }
    // 移動先ゾーン選択
    const currentZoneSR = targetStateSR.field.signi.findIndex(s => s?.at(-1) === selectedSR);
    const zoneOptsSR = [0,1,2].filter(i => i !== currentZoneSR).map(zi => ({
      id: `zone_${zi}`, label: `ゾーン${zi+1}へ移動`,
      action: ({ type: 'STUB', id: 'INTERNAL_REPOSITION_TO_ZONE',
        value: `${selectedSR}:${zi}:${isOppSR}` } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '移動先ゾーンを選択'), { type: 'CHOOSE', options: zoneOptsSR, count: 1 });
  }
  // INTERNAL_REPOSITION_MOVE: 選択シグニを空きゾーンへ移動（後方互換）
  if (stub.id === 'INTERNAL_REPOSITION_MOVE') {
    const cnIRM = ctx.lastProcessedCards?.[0];
    if (!cnIRM) return done(addLog(ctx, '対象なし'));
    const signiIRM = [...(ctx.ownerState.field.signi ?? [])] as (string[] | null)[];
    const srcIdxIRM = signiIRM.findIndex(s => s?.at(-1) === cnIRM);
    const dstIdxIRM = signiIRM.findIndex(s => !s || s.length === 0);
    if (srcIdxIRM < 0 || dstIdxIRM < 0) return done(addLog(ctx, 'シグニ移動不可'));
    const stack = signiIRM[srcIdxIRM]!;
    signiIRM[srcIdxIRM] = stack.length > 1 ? stack.slice(0, -1) : null;
    signiIRM[dstIdxIRM] = [cnIRM];
    const newSIRM: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: signiIRM } };
    return done(addLog({ ...ctx, ownerState: newSIRM },
      `${ctx.cardMap.get(cnIRM)?.CardName ?? cnIRM}をゾーン${srcIdxIRM + 1}→${dstIdxIRM + 1}に移動`));
  }
  // INTERNAL_REPOSITION_TO_ZONE: 選択シグニを指定ゾーンへ移動（SIGNI_REPOSITIONの後半）
  if (stub.id === 'INTERNAL_REPOSITION_TO_ZONE') {
    const valIRTZ = typeof stub.value === 'string' ? stub.value : '';
    const [cnIRTZ, dstStrIRTZ, isOppStrIRTZ] = valIRTZ.split(':');
    const dstIdxIRTZ = parseInt(dstStrIRTZ);
    const isOppIRTZ = isOppStrIRTZ === 'true';
    if (!cnIRTZ || isNaN(dstIdxIRTZ)) return done(addLog(ctx, '引数不正（INTERNAL_REPOSITION_TO_ZONE）'));
    const targetStateIRTZ = isOppIRTZ ? ctx.otherState : ctx.ownerState;
    const signiIRTZ = [...targetStateIRTZ.field.signi] as (string[] | null)[];
    const srcIdxIRTZ = signiIRTZ.findIndex(s => s?.at(-1) === cnIRTZ);
    if (srcIdxIRTZ < 0) return done(addLog(ctx, 'ゾーン特定不可（INTERNAL_REPOSITION_TO_ZONE）'));
    // 移動先が空きなら移動、占有なら入れ替え
    const stackSrcIRTZ = signiIRTZ[srcIdxIRTZ]!;
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
      `${ctx.cardMap.get(cnIRTZ)?.CardName ?? cnIRTZ}をゾーン${srcIdxIRTZ+1}→${dstIdxIRTZ+1}に移動`));
  }
  // GRANT_CONDITIONAL_ASSASSIN_ABILITY: 条件付きアサシンをkeyword_grantsに付与
  if (stub.id === 'GRANT_CONDITIONAL_ASSASSIN_ABILITY') {
    const cnGCAA = ctx.sourceCardNum;
    if (!cnGCAA) return done(addLog(ctx, 'ソースカードなし'));
    const kwGCAA = { ...(ctx.ownerState.keyword_grants ?? {}) };
    const existingGCAA = kwGCAA[cnGCAA] ?? [];
    if (!existingGCAA.includes('アサシン')) kwGCAA[cnGCAA] = [...existingGCAA, 'アサシン'];
    const newSGCAA: PlayerState = { ...ctx.ownerState, keyword_grants: kwGCAA };
    return done(addLog({ ...ctx, ownerState: newSGCAA },
      `${ctx.cardMap.get(cnGCAA)?.CardName ?? cnGCAA}にアサシン付与（条件付き）`));
  }
  // POWER_MINUS_PER_OWN_LEVEL: このシグニのレベル×2000だけ対戦相手シグニのパワーを下げる
  // WXK08-078（弩書　エムショ）のGRANT_SIGNI_ABOVE_ABILITYで付与されるACTIVATED効果
  if (stub.id === 'POWER_MINUS_PER_OWN_LEVEL') {
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
        `${ctx.cardMap.get(targetPMPOL)?.CardName ?? targetPMPOL} パワー${deltaPMPOL}（レベル${srcLevelPMPOL}×-2000）`));
    }
    const oppCandsPMPOL = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPMPOL.length === 0) return done(addLog(ctx, '対象相手シグニなし（POWER_MINUS_PER_OWN_LEVEL）'));
    const thenPMPOL: StubAction = { type: 'STUB', id: 'POWER_MINUS_PER_OWN_LEVEL' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: oppCandsPMPOL, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: thenPMPOL as EffectAction,
    });
  }
  // NEGATE_ABILITY: 対象シグニの能力を無効化（abilities_removedに追加）
  if (stub.id === 'NEGATE_ABILITY') {
    const targetNA = ctx.lastProcessedCards?.[0];
    if (targetNA) {
      // 対象がいずれかのフィールドに存在するか確認
      const inOwnNA = ctx.ownerState.field.signi.some(s => s?.at(-1) === targetNA);
      const inOppNA = ctx.otherState.field.signi.some(s => s?.at(-1) === targetNA);
      if (inOwnNA) {
        const newOwnerNA: PlayerState = { ...ctx.ownerState, abilities_removed: [...(ctx.ownerState.abilities_removed ?? []), targetNA] };
        return done(addLog({ ...ctx, ownerState: newOwnerNA }, `${ctx.cardMap.get(targetNA)?.CardName ?? targetNA}の能力を無効化`));
      }
      if (inOppNA) {
        if ((ctx.otherProtectedSigniNums ?? []).includes(targetNA)) {
          return done(addLog(ctx, `${ctx.cardMap.get(targetNA)?.CardName ?? targetNA}は保護されているため能力を失わない`));
        }
        const newOtherNA: PlayerState = { ...ctx.otherState, abilities_removed: [...(ctx.otherState.abilities_removed ?? []), targetNA] };
        return done(addLog({ ...ctx, otherState: newOtherNA }, `${ctx.cardMap.get(targetNA)?.CardName ?? targetNA}の能力を無効化`));
      }
    }
    // 対象が不明: 相手フィールドからSELECT（保護済みシグニを除く）
    const candNA = (ctx.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : [])
      .filter(n => !(ctx.otherProtectedSigniNums ?? []).includes(n));
    if (candNA.length === 0) return done(addLog(ctx, '無効化対象なし'));
    const thenNA: StubAction = { type: 'STUB', id: 'INTERNAL_NEGATE_ABILITY' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candNA, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: thenNA as EffectAction,
    });
  }
  // INTERNAL_NEGATE_ABILITY: 選択シグニの能力を無効化
  if (stub.id === 'INTERNAL_NEGATE_ABILITY') {
    const cnINA = ctx.lastProcessedCards?.[0];
    if (!cnINA) return done(addLog(ctx, '対象なし'));
    const inOwnINA = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnINA);
    if (inOwnINA) {
      const newOwnerINA: PlayerState = { ...ctx.ownerState, abilities_removed: [...(ctx.ownerState.abilities_removed ?? []), cnINA] };
      return done(addLog({ ...ctx, ownerState: newOwnerINA }, `${ctx.cardMap.get(cnINA)?.CardName ?? cnINA}の能力を無効化`));
    }
    if ((ctx.otherProtectedSigniNums ?? []).includes(cnINA)) {
      return done(addLog(ctx, `${ctx.cardMap.get(cnINA)?.CardName ?? cnINA}は保護されているため能力を失わない`));
    }
    const newOtherINA: PlayerState = { ...ctx.otherState, abilities_removed: [...(ctx.otherState.abilities_removed ?? []), cnINA] };
    return done(addLog({ ...ctx, otherState: newOtherINA }, `${ctx.cardMap.get(cnINA)?.CardName ?? cnINA}の能力を無効化`));
  }
  // === バッチ11: デッキ/エナ/ドロー系 ===
  // RESONANCE_COST_CARDS_TO_ENERGY: レゾナコストカードをエナゾーンへ
  if (stub.id === 'RESONANCE_COST_CARDS_TO_ENERGY') {
    const cardsRCCTE = ctx.lastProcessedCards ?? [];
    if (cardsRCCTE.length === 0) return done(addLog(ctx, 'レゾナコストカードなし'));
    const newSRCCTE: PlayerState = {
      ...ctx.ownerState,
      energy: [...ctx.ownerState.energy, ...cardsRCCTE],
      trash: ctx.ownerState.trash.filter(c => !cardsRCCTE.includes(c)),
    };
    return done(addLog({ ...ctx, ownerState: newSRCCTE }, `レゾナコスト${cardsRCCTE.length}枚→エナゾーンへ`));
  }
  // ENERGY_TO_TRASH: 自分のエナゾーンの末尾カード→トラッシュ
  if (stub.id === 'ENERGY_TO_TRASH') {
    const sETT = ctx.ownerState;
    if (sETT.energy.length === 0) return done(addLog(ctx, 'エナゾーンなし'));
    const lastEnaETT = sETT.energy.at(-1)!;
    const newSETT: PlayerState = {
      ...sETT,
      energy: sETT.energy.slice(0, -1),
      trash: [...sETT.trash, lastEnaETT],
    };
    return done(addLog({ ...ctx, ownerState: newSETT }, `${ctx.cardMap.get(lastEnaETT)?.CardName ?? lastEnaETT}をエナ→トラッシュ`));
  }
  // EACH_PLAYER_DRAW_DISCARD は上位ハンドラ（line 1031）で処理済み
  // DRAW_DISCARD_COUNT_PLUS_N: N枚引いてM枚捨てる
  if (stub.id === 'DRAW_DISCARD_COUNT_PLUS_N') {
    const toHWDDCPN = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcDDCPN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDDCPN = srcDDCPN ? (srcDDCPN.EffectText ?? '') + ' ' + (srcDDCPN.BurstText ?? '') : '';
    const mDrawDDCPN = txtDDCPN.match(/([０-９\d]+)枚引く/);
    const mDiscDDCPN = txtDDCPN.match(/([０-９\d]+)枚捨てる/);
    const drawNDDCPN = mDrawDDCPN ? parseInt(toHWDDCPN(mDrawDDCPN[1] ?? '1')) : 1;
    const discNDDCPN = mDiscDDCPN ? parseInt(toHWDDCPN(mDiscDDCPN[1] ?? '1')) : 1;
    let sDDCPN = ctx.ownerState;
    const canDrawDDCPN = Math.min(drawNDDCPN, sDDCPN.deck.length);
    sDDCPN = { ...sDDCPN, hand: [...sDDCPN.hand, ...sDDCPN.deck.slice(0, canDrawDDCPN)], deck: sDDCPN.deck.slice(canDrawDDCPN) };
    const newCtxDDCPN = { ...ctx, ownerState: sDDCPN };
    if (discNDDCPN > 0 && sDDCPN.hand.length > 0) {
      const thenDDCPN: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
      return needsInteraction(addLog(newCtxDDCPN, `${drawNDDCPN}枚ドロー→${discNDDCPN}枚捨て選択`), {
        type: 'SELECT_TARGET',
        candidates: sDDCPN.hand,
        count: Math.min(discNDDCPN, sDDCPN.hand.length),
        optional: false,
        targetScope: 'self_hand',
        thenAction: thenDDCPN as EffectAction,
      });
    }
    return done(addLog(newCtxDDCPN, `${drawNDDCPN}枚ドロー`));
  }
  // PLACE_LIMIT_UPPER: ルリグリミット上限を+1
  if (stub.id === 'PLACE_LIMIT_UPPER') {
    const newSPLU: PlayerState = { ...ctx.ownerState, lrig_limit_mod: (ctx.ownerState.lrig_limit_mod ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newSPLU }, 'リミット上限+1'));
  }
  // LOOK_DECK_BOTTOM: デッキ下を1枚確認
  if (stub.id === 'LOOK_DECK_BOTTOM') {
    const sLDB = ctx.ownerState;
    if (sLDB.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
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
  // LOOK_TOP_BOTTOM: デッキ上1枚とデッキ下1枚を確認
  if (stub.id === 'LOOK_TOP_BOTTOM') {
    const sLTB = ctx.ownerState;
    if (sLTB.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
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
  // LOOK_TOP_OPP_CHOOSE_TRASH: デッキ上N枚を公開し相手が1枚選んでトラッシュ
  if (stub.id === 'LOOK_TOP_OPP_CHOOSE_TRASH') {
    const toHWLTOCT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcLTOCT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTOCT = srcLTOCT ? (srcLTOCT.EffectText ?? '') + ' ' + (srcLTOCT.BurstText ?? '') : '';
    const mLTOCT = txtLTOCT.match(/上から([０-９\d]+)枚/);
    const nLTOCT = mLTOCT ? parseInt(toHWLTOCT(mLTOCT[1])) : 3;
    const sLTOCT = ctx.ownerState;
    if (sLTOCT.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const visLTOCT = sLTOCT.deck.slice(0, Math.min(nLTOCT, sLTOCT.deck.length));
    const thenLTOCT: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
    return needsInteraction(addLog(ctx, `デッキ上${visLTOCT.length}枚公開`), {
      type: 'SELECT_TARGET',
      candidates: visLTOCT,
      count: 1,
      optional: false,
      targetScope: 'self_hand' as TargetScope,
      thenAction: thenLTOCT as EffectAction,
      opponentResponds: true,
    });
  }
  // ALL_PLAYER_MILL: 各プレイヤーがデッキ上N枚をトラッシュ
  if (stub.id === 'ALL_PLAYER_MILL') {
    const srcAPM = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtAPM = srcAPM ? (srcAPM.EffectText ?? '') + ' ' + (srcAPM.BurstText ?? '') : '';
    const toHWAPM = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mAPM = txtAPM.match(/デッキの上からカードを([０-９\d]+)枚トラッシュに置く/) ||
                 txtAPM.match(/デッキの上から([０-９\d]+)枚.*トラッシュ/);
    const cntAPM = mAPM ? parseInt(toHWAPM(mAPM[1])) : 1;
    const selfMillAPM = ctx.ownerState.deck.slice(0, Math.min(cntAPM, ctx.ownerState.deck.length));
    const oppMillAPM  = ctx.otherState.deck.slice(0, Math.min(cntAPM, ctx.otherState.deck.length));
    const newOwnerAPM: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(selfMillAPM.length), trash: [...ctx.ownerState.trash, ...selfMillAPM] };
    const newOtherAPM: PlayerState = { ...ctx.otherState, deck: ctx.otherState.deck.slice(oppMillAPM.length),  trash: [...ctx.otherState.trash,  ...oppMillAPM]  };
    return done(addLog({ ...ctx, ownerState: newOwnerAPM, otherState: newOtherAPM },
      `各プレイヤーデッキ上${cntAPM}枚トラッシュ`));
  }
  // SUPPRESS_OPP_SIGNI_ABILITIES: 相手フィールドの全シグニの能力を消去
  if (stub.id === 'SUPPRESS_OPP_SIGNI_ABILITIES') {
    const oppTopsSOS = ctx.otherState.field.signi
      .map(s => s?.at(-1))
      .filter((n): n is string => !!n && !(ctx.otherProtectedSigniNums ?? []).includes(n));
    const newRemovedSOS = [...new Set([...(ctx.otherState.abilities_removed ?? []), ...oppTopsSOS])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, abilities_removed: newRemovedSOS } },
      '相手フィールドの全シグニの能力を消去'));
  }
  // END_ATTACK_IF_EXTRA_TURN: 追加ターンならアタックフェイズを終了（ATTACK_SIGNI/LRIG封じ）
  if (stub.id === 'END_ATTACK_IF_EXTRA_TURN') {
    if (!ctx.ownerState.extra_turn) return done(addLog(ctx, '追加ターンでない → スキップ'));
    const newBlockedEAIET = [...new Set([...(ctx.ownerState.blocked_actions ?? []), 'ATTACK_SIGNI', 'ATTACK_LRIG'])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, blocked_actions: newBlockedEAIET } },
      '追加ターン中のアタックを全封じ（アタックフェイズ終了）'));
  }
  // BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN: 相手ターン中、相手はシグニを配置できない
  if (stub.id === 'BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN') {
    const newBlockedBOSP = [...(ctx.otherState.blocked_actions ?? []), 'PLACE_SIGNI'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBOSP } },
      '相手はシグニを配置できない'));
  }
  // PREVENT_OPP_UPKEEP: 相手のアップキープ（アップ）を防ぐ
  if (stub.id === 'PREVENT_OPP_UPKEEP') {
    const newBlockedPOU = [...(ctx.otherState.blocked_actions ?? []), 'UPKEEP'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedPOU } },
      '相手はアップキープできない'));
  }
  // DRAW_IF_OPP_DISCARDED_HAND: 相手が手札を捨てたときドロー（トリガー系・ログのみ）
  if (stub.id === 'DRAW_IF_OPP_DISCARDED_HAND') {
    return done(addLog(ctx, '[相手手札捨て時ドロートリガー: BattleScreen側未実装]'));
  }
  // OPTIONAL_DISCARD_GUARD: 手札から任意カードを捨ててガード可能フラグを設定
  if (stub.id === 'OPTIONAL_DISCARD_GUARD') {
    const newOwnerODG: PlayerState = { ...ctx.ownerState, optional_discard_guard_enabled: true };
    return done(addLog({ ...ctx, ownerState: newOwnerODG }, '手札から任意カードを捨ててガード可能（このターン）'));
  }
  // ADJACENT_SIGNI_POWER_MOD: このシグニと隣接するシグニ最大2体のパワーを修正
  if (stub.id === 'ADJACENT_SIGNI_POWER_MOD') {
    const zoneIdxADJ = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    if (zoneIdxADJ === -1) return done(addLog(ctx, 'ADJACENT_SIGNI_POWER_MOD: ゾーンが見つかりません'));
    const adjNumsADJ: string[] = [];
    if (zoneIdxADJ > 0) {
      const adj = ctx.ownerState.field.signi[zoneIdxADJ - 1]?.at(-1);
      if (adj) adjNumsADJ.push(adj);
    }
    if (zoneIdxADJ < 2) {
      const adj = ctx.ownerState.field.signi[zoneIdxADJ + 1]?.at(-1);
      if (adj) adjNumsADJ.push(adj);
    }
    if (adjNumsADJ.length === 0) return done(addLog(ctx, '隣接シグニなし（ADJACENT_SIGNI_POWER_MOD）'));
    // deltaをカードテキストから取得（未記述なら+3000デフォルト）
    const srcADJ = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtADJ = srcADJ ? (srcADJ.EffectText ?? '') : '';
    const toHWADJ = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mADJ = txtADJ.match(/[＋+]([０-９\d]+)/);
    const deltaADJ = mADJ ? parseInt(toHWADJ(mADJ[1])) : 3000;
    const modsADJ = [
      ...(ctx.ownerState.temp_power_mods ?? []),
      ...adjNumsADJ.map(cn => ({ cardNum: cn, delta: deltaADJ })),
    ];
    const newOwnerADJ = { ...ctx.ownerState, temp_power_mods: modsADJ };
    return done(addLog({ ...ctx, ownerState: newOwnerADJ }, `隣接${adjNumsADJ.length}体パワー+${deltaADJ}`));
  }

  // OPP_DRAW_LIMIT_PER_TURN: ドローフェイズ中の相手ドローを1枚に制限（BattleScreen側処理）
  if (stub.id === 'OPP_DRAW_LIMIT_PER_TURN') {
    return done(addLog(ctx, '対戦相手のドローフェイズのドロー上限：１枚（BattleScreen側処理）'));
  }
  // REDIRECT_ATTACK_TO_SELF_ZONE: 相手シグニの直接アタックをこのシグニゾーンにリダイレクト（BattleScreen側処理）
  if (stub.id === 'REDIRECT_ATTACK_TO_SELF_ZONE') {
    return done(addLog(ctx, '正面アタックをこのシグニゾーンへリダイレクト（BattleScreen側処理）'));
  }
  // BATTLE_LEAVE_REPLACE_WITH_DOWN: バトル・相手効果による場離れをダウンに置換（任意）（BattleScreen側処理）
  if (stub.id === 'BATTLE_LEAVE_REPLACE_WITH_DOWN') {
    return done(addLog(ctx, '場離れ代替ダウン（BattleScreen側処理）'));
  }
  // REMOVE_SELF_SIGNI_FROM_GAME: このシグニをゲームから除外する（クラフトルール適用）
  if (stub.id === 'REMOVE_SELF_SIGNI_FROM_GAME') {
    const srcCnRSG = ctx.sourceCardNum;
    if (!srcCnRSG) return done(addLog(ctx, 'REMOVE_SELF_SIGNI_FROM_GAME: ソースなし'));
    const removedRSG = removeFromField(srcCnRSG, ctx.ownerState);
    const newOwnerRSG: PlayerState = { ...removedRSG, trash: [...removedRSG.trash, srcCnRSG] };
    return done(addLog({ ...ctx, ownerState: newOwnerRSG },
      `${ctx.cardMap.get(srcCnRSG)?.CardName ?? srcCnRSG}をゲームから除外`));
  }

  return done(addLog(ctx, `[STUB: ${stub.id}]`));
}
}
