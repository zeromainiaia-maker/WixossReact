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
  removeFromField, getCardNum, fieldCandidates, selectOrInteract, shuffle,
} from './execUtils';

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
  // 任意コストの単独発動（SEQUENCEパターン外）：支払ったものとして処理
  if (stub.id === 'OPTIONAL_COST' ||
      stub.id === 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST' || stub.id === 'OPTIONAL_TRASH_ENERGY_CLASS') {
    return done(addLog(ctx, '任意コスト（自動支払い）'));
  }
  // 対戦相手払い単独発動（SEQUENCEパターン外）：支払わないとして処理
  if (stub.id === 'OPPONENT_PAY_OPTIONAL') {
    return done(addLog(ctx, '対戦相手任意コスト（スキップ）'));
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
    const hasCoins = ctx.ownerState.coins > 0;
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
  // 引用符付き能力付与（キーワードを keyword_grants に格納）
  if (stub.id === 'GRANT_QUOTED_AUTO_ABILITY' || stub.id === 'GRANT_QUOTED_ABILITY' ||
      stub.id === 'GRANT_ABILITY_INNER_TEXT' || stub.id === 'GRANT_QUOTED_ACTIVATE_ABILITY') {
    const srcGQ = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGQ = srcGQ ? (srcGQ.EffectText ?? '') + ' ' + (srcGQ.BurstText ?? '') : '';
    // 付与するキーワードを抽出（ランサー、ダブルクラッシュ、貫通、マルチエナ等）
    const knownKeywords = ['Sランサー', 'ランサー', 'ダブルクラッシュ', '貫通', 'マルチエナ', 'アサシン', 'バニッシュ無効', 'ライフバースト無効', '影', 'チャーム', 'シャドウ', 'ガードアイコン', 'アタックできない', 'フリーズ', 'ドライブ'];
    // 引用符内のテキスト（「...」を得る）または直接記述（「…は...を得る」）を抽出
    const quotedM = txtGQ.match(/「([^」]+)」(?:の能力)?(?:を得る|として扱う)/) ?? txtGQ.match(/【([^】]+)】を得る/);
    const quotedText = quotedM ? quotedM[1] : '';
    const grantedKws = knownKeywords.filter(kw => quotedText.includes(kw) || txtGQ.match(new RegExp(`【${kw}】を得`)));
    // 対象シグニを決定（「このシグニ」→sourceCardNum、「あなたのシグニすべて」→全自シグニ）
    const allM = txtGQ.match(/あなたのシグニすべては|あなたの場にあるすべてのシグニ/);
    const targetCardNums: string[] = allM
      ? ctx.ownerState.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : [])
      : (ctx.sourceCardNum ? [ctx.sourceCardNum] : []);
    if (grantedKws.length > 0 && targetCardNums.length > 0) {
      const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
      for (const cn of targetCardNums) {
        grants[cn] = [...new Set([...(grants[cn] ?? []), ...grantedKws])];
      }
      const newOwner = { ...ctx.ownerState, keyword_grants: grants };
      return done(addLog({ ...ctx, ownerState: newOwner }, `${grantedKws.join('・')}を付与（${targetCardNums.length}体）`));
    }
    if (quotedText) return done(addLog(ctx, `能力付与：「${quotedText.slice(0, 15)}...」（ログのみ）`));
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
    // パターン1: "N体/枚につき±X" → count × deltaPerUnit
    const perM = effText.match(/([０-９\d]+)[体枚]?につき([－＋][０-９\d]+)/);
    // パターン2: "レベル1につき±X" → sum(level) × deltaPerUnit
    const lvlM = !perM ? effText.match(/レベル([０-９\d]+)につき([－＋][０-９\d]+)/) : null;
    // パターン3: "合計で±X" （固定合計値）
    const totalM = (!perM && !lvlM) ? effText.match(/合計で([－＋][０-９\d]+)/) : null;

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
      return done(addLog(ctx, 'パワー2倍修正（ログのみ）'));
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
  // ウイルス除去：対戦相手のシグニに乗った最初のウイルスを取り除く
  if (stub.id === 'REMOVE_VIRUS' || stub.id === 'EXTRA_COST_REMOVE_VIRUS') {
    const virusArr = ctx.otherState.field.signi_virus ?? [0, 0, 0];
    const zoneIdx = virusArr.findIndex(v => v > 0);
    if (zoneIdx < 0) return done(addLog(ctx, 'ウイルスなし'));
    const newVirus = [...virusArr];
    newVirus[zoneIdx] = 0;
    const newOther = { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: newVirus } };
    return done(addLog({ ...ctx, otherState: newOther }, `ウイルスを除去（ゾーン${zoneIdx + 1}）`));
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
    // 両者ドロー
    let newOwner = { ...ctx.ownerState };
    let newOther = { ...ctx.otherState };
    if (newOwner.deck.length > 0) {
      newOwner = { ...newOwner, hand: [...newOwner.hand, newOwner.deck[0]], deck: newOwner.deck.slice(1) };
    }
    if (newOther.deck.length > 0) {
      newOther = { ...newOther, hand: [...newOther.hand, newOther.deck[0]], deck: newOther.deck.slice(1) };
    }
    const ctxDrawn = { ...ctx, ownerState: newOwner, otherState: newOther };
    // 自分が手札を捨てるSELECT_TARGETを出す（相手はCPU戦ではランダム、対人ではopponentResponds）
    if (newOwner.hand.length === 0) return done(addLog(ctxDrawn, '両者ドロー（捨てなし）'));
    const discardEPDD: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 },
    };
    return selectOrInteract(newOwner.hand, 1, false, 'self_hand', discardEPDD as EffectAction, undefined, ctxDrawn);
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
  // ゲームから除外：自分のシグニをフィールドからトラッシュへ（ゲーム除外の近似）
  if (stub.id === 'BANISH_FROM_GAME') {
    const src = ctx.sourceCardNum;
    if (!src) return done(addLog(ctx, 'BANISH_FROM_GAME: sourceCardNumなし'));
    const inOwner = ctx.ownerState.field.signi.some(s => s?.at(-1) === src);
    const inOther = ctx.otherState.field.signi.some(s => s?.at(-1) === src);
    if (inOwner) {
      const removed = removeFromField(src, ctx.ownerState);
      const newOwner = { ...removed, trash: [...removed.trash, src] };
      const name = ctx.cardMap.get(src)?.CardName ?? src;
      return done(addLog({ ...ctx, ownerState: newOwner }, `${name}をゲームから除外`));
    }
    if (inOther) {
      const removed = removeFromField(src, ctx.otherState);
      const newOther = { ...removed, trash: [...removed.trash, src] };
      const name = ctx.cardMap.get(src)?.CardName ?? src;
      return done(addLog({ ...ctx, otherState: newOther }, `${name}をゲームから除外`));
    }
    return done(addLog(ctx, 'BANISH_FROM_GAME: フィールドにカードなし'));
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
  // 条件付きアーツコスト（条件チェックのみ・タイミング変更はBattleScreen側未実装）
  if (stub.id === 'CONDITIONAL_ARTS_COST') {
    const srcCAC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCAC = srcCAC ? (srcCAC.EffectText ?? '') + ' ' + (srcCAC.BurstText ?? '') : '';
    const toHWCAC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const lifeM = txtCAC.match(/ライフクロスが([０-９\d]+)枚以下/);
    if (lifeM) {
      const threshold = parseInt(toHWCAC(lifeM[1]));
      const myLife = ctx.ownerState.life_cloth.length;
      const met = myLife <= threshold;
      return done(addLog(ctx, `条件付きアーツ（ライフ${myLife}枚/閾値${threshold}以下: ${met ? '条件達成' : '未達成'}）`));
    }
    return done(addLog(ctx, '条件付きアーツコスト'));
  }
  if (stub.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE') {
    return done(addLog(ctx, 'センターレベル基準多択（ログのみ）'));
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
  if (stub.id === 'SONG_FRAGMENT') {
    const songCardsInEnergy = ctx.ownerState.energy.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.EffectText?.includes('【歌のカケラ】');
    });
    if (songCardsInEnergy.length === 0) return done(addLog(ctx, '歌のカケラ：エナゾーンにカードなし'));
    if (songCardsInEnergy.length > 1) {
      const internalSF: StubAction = { type: 'STUB', id: 'INTERNAL_SONG_FRAGMENT' };
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
      const songCtx = { ...ctx, ownerState: newOwnerSF, sourceCardNum: songCard };
      return exec(songEff.action, addLog(songCtx, `【歌のカケラ】発動：${songCardData?.CardName ?? songCard}`));
    }
    return done(addLog({ ...ctx, ownerState: newOwnerSF }, `歌のカケラ（${songCardData?.CardName ?? songCard}）：効果なし`));
  }
  // INTERNAL_SONG_FRAGMENT: SELECT_TARGETで選択されたカードで歌のカケラ発動
  if (stub.id === 'INTERNAL_SONG_FRAGMENT') {
    const selectedSF = ctx.lastProcessedCards?.[0];
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
      const songCtxISF = { ...ctx, ownerState: newOwnerISF, sourceCardNum: selectedSF };
      return exec(songEffISF.action, addLog(songCtxISF, `【歌のカケラ】発動：${songCardDataISF?.CardName ?? selectedSF}`));
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
  if (stub.id === 'DECLARE_CLASS' || stub.id === 'DECLARE_COLOR') {
    return done(addLog(ctx, 'クラス/色宣言（ログのみ）'));
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
    // 色フィルタ（「共通する色を持たない」は除外）
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
    const placeUnderAction: PlaceUnderSourceSigniAction = {
      type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'trash',
    };
    return selectOrInteract(trashSigniT, maxCountT, true, 'self_trash', placeUnderAction as EffectAction, undefined, ctx);
  }
  // ルリグリミット修正（エナフェイズ終了まで）
  if (stub.id === 'LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END') {
    const srcL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtL = srcL ? (srcL.EffectText ?? '') + ' ' + (srcL.BurstText ?? '') : '';
    const toHWL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mL = txtL.match(/リミットを([＋+]?)([０-９\d]+)(?:にする|増やす|する)/);
    const mLMinus = txtL.match(/リミットを([－-])([０-９\d]+)/);
    let deltaL = 1;
    if (mLMinus) {
      deltaL = -parseInt(toHWL(mLMinus[2]));
    } else if (mL) {
      deltaL = parseInt(toHWL(mL[2]));
    } else {
      const mLPlus = txtL.match(/リミットを＋([０-９\d]+)/);
      if (mLPlus) deltaL = parseInt(toHWL(mLPlus[1]));
    }
    const newMod = (ctx.ownerState.lrig_limit_mod ?? 0) + deltaL;
    const newOwner = { ...ctx.ownerState, lrig_limit_mod: newMod };
    return done(addLog({ ...ctx, ownerState: newOwner }, `リミット${deltaL > 0 ? '+' : ''}${deltaL}（エナフェイズ終了まで）`));
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
    const selected = ctx.lastProcessedCards ?? [];
    if (selected.length === 0) return done(addLog(ctx, '対象カードなし'));
    const target = selected[0];
    const inTrash = ctx.ownerState.trash.includes(target);
    if (!inTrash) return done(addLog(ctx, 'トラッシュにカードなし'));
    const cardName = ctx.cardMap.get(target)?.CardName ?? target;
    const toHandStub: StubAction = { type: 'STUB', id: 'INTERNAL_TRASHED_TO_HAND' };
    const toEnaStub: StubAction = { type: 'STUB', id: 'INTERNAL_TRASHED_TO_ENERGY' };
    const pendingTCTE: PendingInteractionDef = {
      type: 'CHOOSE',
      options: [
        { id: 'hand', label: `${cardName}を手札に`, action: toHandStub as EffectAction, available: true },
        { id: 'energy', label: `${cardName}をエナゾーンに`, action: toEnaStub as EffectAction, available: true },
      ],
      count: 1,
    };
    return needsInteraction(addLog(ctx, `${cardName}：手札かエナゾーンに置く`), pendingTCTE);
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
    const banishMSE: BanishAction = {
      type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 },
    };
    return selectOrInteract(oppCandsMSE, maxMSE, false, 'opp_field', banishMSE as EffectAction, undefined, ctx);
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
    // 相手がシグニを選ぶ（opponentResponds: true）
    const banishToEnaAction: BanishAction = {
      type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 },
    };
    const pendingOCS: PendingInteractionDef = {
      type: 'SELECT_TARGET',
      candidates: oppCands,
      count: 1,
      optional: false,
      targetScope: 'opp_field',
      thenAction: banishToEnaAction as EffectAction,
      opponentResponds: true,
    };
    return needsInteraction(addLog(ctx, `対戦相手はパワー${powerLimit}以上のシグニ1体をエナゾーンに置く`), pendingOCS);
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
    const newVirus  = copyArr(ctx.ownerState.field.signi_virus, 0);
    [newDown[targetZoneNum], newFrozen[targetZoneNum], newCharms[targetZoneNum], newAcce[targetZoneNum], newVirus[targetZoneNum]] =
      [newDown[curZone], newFrozen[curZone], newCharms[curZone], newAcce[curZone], newVirus[curZone]];
    newDown[curZone] = false; newFrozen[curZone] = false;
    newCharms[curZone] = null; newAcce[curZone] = null; newVirus[curZone] = 0;
    const newFieldMov = {
      ...ctx.ownerState.field, signi: newSigniMov,
      signi_down: newDown as boolean[], signi_frozen: newFrozen as boolean[],
      signi_charms: newCharms, signi_acce: newAcce, signi_virus: newVirus,
    };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, field: newFieldMov } },
      `${ctx.cardMap.get(srcZ)?.CardName ?? srcZ}をゾーン${curZone + 1}→ゾーン${targetZoneNum + 1}に移動`));
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
    const lvMHCU = txtHCU.match(/レベル([０-９\d]+)以上のシグニ/);
    const minLvHCU = lvMHCU ? parseInt(toHWHCU(lvMHCU[1])) : 0;
    const handCandsHCU = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (!c) return false;
      const lv = parseInt(c.Level ?? '0');
      return (!minLvHCU || lv >= minLvHCU);
    });
    if (handCandsHCU.length === 0) return done(addLog(ctx, '手札なし（シグニ下配置スキップ）'));
    const placeActionHCU: PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'hand' };
    return selectOrInteract(handCandsHCU, maxHCU, optHCU, 'self_hand', placeActionHCU as EffectAction, undefined, ctx);
  }
  // シグニの下のカードをエナゾーンに置く
  if (stub.id === 'UNDER_SIGNI_TO_ENERGY') {
    // sourceCardNumのシグニが自分フィールドにある場合はそのゾーンの下を優先
    const srcZoneUTE = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    let pickedZoneUTE = srcZoneUTE >= 0 ? srcZoneUTE : -1;
    if (pickedZoneUTE < 0) {
      // 最初に見つけた「下にカードがある」ゾーン
      pickedZoneUTE = ctx.ownerState.field.signi.findIndex(s => s && s.length > 1);
    }
    if (pickedZoneUTE < 0) return done(addLog(ctx, 'シグニの下にカードなし'));
    const stackUTE = [...(ctx.ownerState.field.signi[pickedZoneUTE] ?? [])];
    const movedUTE = stackUTE.shift(); // 一番下のカードを取り出す
    if (!movedUTE) return done(addLog(ctx, 'シグニの下にカードなし'));
    const newSigniUTE = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniUTE[pickedZoneUTE] = stackUTE.length > 0 ? stackUTE : null;
    const newOwnerUTE = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, signi: newSigniUTE },
      energy: [...ctx.ownerState.energy, movedUTE],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerUTE },
      `${ctx.cardMap.get(movedUTE)?.CardName ?? movedUTE}をエナゾーンへ（シグニ下から）`));
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
    const newDeck2 = ctx.ownerState.deck.slice(1);
    const newOwner2 = { ...ctx.ownerState, deck: [...newDeck2, topCard] };
    return done(addLog({ ...ctx, ownerState: newOwner2 },
      `デッキトップ公開：${name}（Lv${lv}）→不一致、デッキ下へ`));
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
  // ルリグトラッシュのアーツ枚数に基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_LRIG_TRASH_ARTS') {
    const srcPMLTA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMLTA = srcPMLTA ? (srcPMLTA.EffectText ?? '') + ' ' + (srcPMLTA.BurstText ?? '') : '';
    const toHWPMLTA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const artsCountPMLTA = (ctx.ownerState.lrig_trash ?? []).filter(cn => ctx.cardMap.get(cn)?.Type === 'アーツ').length;
    const perMPMLTA = txtPMLTA.match(/アーツ([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    if (perMPMLTA) {
      const divisorPMLTA = parseInt(toHWPMLTA(perMPMLTA[1] || '1')) || 1;
      const deltaPMLTA = parseInt(toHWPMLTA(perMPMLTA[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMLTA = Math.floor(artsCountPMLTA / divisorPMLTA) * deltaPMLTA;
      if (totalDeltaPMLTA !== 0) {
        const targetsPMLTA = ctx.lastProcessedCards ?? [];
        const modsPMLTA = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPMLTA.length > 0) {
          for (const cn of targetsPMLTA) modsPMLTA.push({ cardNum: cn, delta: totalDeltaPMLTA });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPMLTA.push({ cardNum: top, delta: totalDeltaPMLTA });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMLTA } },
          `パワー${totalDeltaPMLTA > 0 ? '+' : ''}${totalDeltaPMLTA}（ルリグトラッシュアーツ${artsCountPMLTA}枚）`));
      }
    }
    return done(addLog(ctx, `パワー修正（ルリグトラッシュアーツ${artsCountPMLTA}枚）`));
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
  // 自場シグニの色の種類数に基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_COLOR_VARIETY') {
    const srcPMCV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMCV = srcPMCV ? (srcPMCV.EffectText ?? '') + ' ' + (srcPMCV.BurstText ?? '') : '';
    const toHWPMCV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const colorSet = new Set<string>();
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (top) {
        const colors = (ctx.cardMap.get(top)?.Color ?? '').split('/').map(c => c.trim()).filter(Boolean);
        for (const c of colors) colorSet.add(c);
      }
    }
    const varietyCount = colorSet.size;
    const perMPMCV = txtPMCV.match(/色の種類([０-９\d]*)つにつき([－＋][０-９\d]+)/);
    if (perMPMCV) {
      const divisorPMCV = parseInt(toHWPMCV(perMPMCV[1] || '1')) || 1;
      const deltaPMCV = parseInt(toHWPMCV(perMPMCV[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMCV = Math.floor(varietyCount / divisorPMCV) * deltaPMCV;
      if (totalDeltaPMCV !== 0) {
        const targetsPMCV = ctx.lastProcessedCards ?? [];
        const modsPMCV = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPMCV.length > 0) {
          for (const cn of targetsPMCV) modsPMCV.push({ cardNum: cn, delta: totalDeltaPMCV });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPMCV.push({ cardNum: top, delta: totalDeltaPMCV });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMCV } },
          `パワー${totalDeltaPMCV > 0 ? '+' : ''}${totalDeltaPMCV}（色の種類${varietyCount}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（色の種類${varietyCount}）`));
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
  // このシグニの下にあるカード枚数に基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_UNDER_COUNT') {
    const srcPMUC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMUC = srcPMUC ? (srcPMUC.EffectText ?? '') + ' ' + (srcPMUC.BurstText ?? '') : '';
    const toHWPMUC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const perMPMUC = txtPMUC.match(/下にあるカード([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    if (perMPMUC) {
      const divisorPMUC = parseInt(toHWPMUC(perMPMUC[1] || '1')) || 1;
      const deltaPMUC = parseInt(toHWPMUC(perMPMUC[2]).replace('－', '-').replace('＋', '+'));
      const srcZoneUC = ctx.sourceCardNum
        ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
        : -1;
      const underCount = srcZoneUC >= 0 ? Math.max(0, (ctx.ownerState.field.signi[srcZoneUC]?.length ?? 1) - 1) : 0;
      const totalDeltaPMUC = Math.floor(underCount / divisorPMUC) * deltaPMUC;
      if (totalDeltaPMUC !== 0) {
        const targetsPMUC = ctx.lastProcessedCards ?? [];
        const modsPMUC = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPMUC.length > 0) {
          for (const cn of targetsPMUC) modsPMUC.push({ cardNum: cn, delta: totalDeltaPMUC });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPMUC.push({ cardNum: top, delta: totalDeltaPMUC });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMUC } },
          `パワー${totalDeltaPMUC > 0 ? '+' : ''}${totalDeltaPMUC}（下${underCount}枚）`));
      }
    }
    return done(addLog(ctx, 'パワー修正（シグニ下枚数）'));
  }
  // シグニゾーンのカード総数に基づくパワー修正
  if (stub.id === 'POWER_DOWN_BY_ZONE_CARD_COUNT') {
    const srcPDZCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPDZCC = srcPDZCC ? (srcPDZCC.EffectText ?? '') + ' ' + (srcPDZCC.BurstText ?? '') : '';
    const toHWPDZCC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const perMPDZCC = txtPDZCC.match(/シグニゾーンにあるカード([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    if (perMPDZCC) {
      const divisorPDZCC = parseInt(toHWPDZCC(perMPDZCC[1] || '1')) || 1;
      const deltaPDZCC = parseInt(toHWPDZCC(perMPDZCC[2]).replace('－', '-').replace('＋', '+'));
      const totalCardsPDZCC = ctx.ownerState.field.signi.reduce((acc, stack) => acc + (stack?.length ?? 0), 0);
      const totalDeltaPDZCC = Math.floor(totalCardsPDZCC / divisorPDZCC) * deltaPDZCC;
      if (totalDeltaPDZCC !== 0) {
        const targetsPDZCC = ctx.lastProcessedCards ?? [];
        const modsPDZCC = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPDZCC.length > 0) {
          for (const cn of targetsPDZCC) modsPDZCC.push({ cardNum: cn, delta: totalDeltaPDZCC });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPDZCC.push({ cardNum: top, delta: totalDeltaPDZCC });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPDZCC } },
          `パワー${totalDeltaPDZCC > 0 ? '+' : ''}${totalDeltaPDZCC}（ゾーン${totalCardsPDZCC}枚）`));
      }
    }
    return done(addLog(ctx, 'パワー修正（ゾーンカード数）'));
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
        if (isSingleTarget && oppCandsPDTL.length > 0 && !ctx.lastProcessedCards?.some(cn => oppCandsPDTL.includes(cn))) {
          // 対象選択が未済なら SELECT_TARGET
          const applyPDTL: StubAction = { type: 'STUB', id: 'OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL' };
          return selectOrInteract(oppCandsPDTL, 1, false, 'opp_field', applyPDTL as EffectAction, undefined, ctx);
        }
        // 選択済みまたは全体対象: 適用
        const modsPDTL = [...(ctx.otherState.temp_power_mods ?? [])];
        const targetsPDTL = isSingleTarget && ctx.lastProcessedCards?.length ? ctx.lastProcessedCards : oppCandsPDTL;
        for (const cn of targetsPDTL) modsPDTL.push({ cardNum: cn, delta: totalDeltaPDTL });
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPDTL } },
          `パワー${totalDeltaPDTL > 0 ? '+' : ''}${totalDeltaPDTL}（トラッシュ済みLv合計${lvSumTrashedPDTL}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（トラッシュシグニLv合計${lvSumTrashedPDTL}）`));
  }
  // アタックしたシグニのレベルに基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_ATTACKER_LEVEL') {
    const srcPMAL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMAL = srcPMAL ? (srcPMAL.EffectText ?? '') + ' ' + (srcPMAL.BurstText ?? '') : '';
    const toHWPMAL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const attackerLv = parseInt(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Level ?? '0');
    const perMPMAL = txtPMAL.match(/レベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (perMPMAL && attackerLv > 0) {
      const divisorPMAL = parseInt(toHWPMAL(perMPMAL[1] || '1')) || 1;
      const deltaPMAL = parseInt(toHWPMAL(perMPMAL[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMAL = Math.floor(attackerLv / divisorPMAL) * deltaPMAL;
      if (totalDeltaPMAL !== 0) {
        const targetsPMAL = ctx.lastProcessedCards ?? [];
        const modsPMAL = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPMAL.length > 0) {
          for (const cn of targetsPMAL) modsPMAL.push({ cardNum: cn, delta: totalDeltaPMAL });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPMAL.push({ cardNum: top, delta: totalDeltaPMAL });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMAL } },
          `パワー${totalDeltaPMAL > 0 ? '+' : ''}${totalDeltaPMAL}（アタッカーLv${attackerLv}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（アタッカーLv${attackerLv}）`));
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
  // デッキトップトラッシュ済みシグニのレベルに基づく全相手シグニパワー修正
  if (stub.id === 'POWER_MOD_BY_TRASHED_SIGNI_LEVEL') {
    const lastTrashedPMTSL = ctx.ownerState.trash.at(-1) ?? '';
    const lvPMTSL = parseInt(ctx.cardMap.get(lastTrashedPMTSL)?.Level ?? '0') || 0;
    if (lvPMTSL > 0) {
      const deltaPMTSL = -2000 * lvPMTSL;
      const modsPMTSL = [...(ctx.otherState.temp_power_mods ?? [])];
      for (let zi = 0; zi < 3; zi++) {
        const top = ctx.otherState.field.signi[zi]?.at(-1);
        if (top) modsPMTSL.push({ cardNum: top, delta: deltaPMTSL });
      }
      const namePMTSL = ctx.cardMap.get(lastTrashedPMTSL)?.CardName ?? lastTrashedPMTSL;
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMTSL } },
        `全相手シグニパワー${deltaPMTSL}（${namePMTSL} Lv${lvPMTSL}）`));
    }
    return done(addLog(ctx, 'パワー修正（トラッシュシグニLv0）'));
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
  if (stub.id === 'DOUBLE_OWN_POWER_MINUS') {
    const selfPwDOPM = ctx.effectivePowers?.get(ctx.sourceCardNum ?? '')
      ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Power ?? '0', 10);
    const deltaDOPM = -(selfPwDOPM * 2);
    if (deltaDOPM !== 0) {
      const modsDOPM = [...(ctx.otherState.temp_power_mods ?? [])];
      for (let zi = 0; zi < 3; zi++) {
        const top = ctx.otherState.field.signi[zi]?.at(-1);
        if (top) modsDOPM.push({ cardNum: top, delta: deltaDOPM });
      }
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsDOPM } },
        `全相手シグニパワー${deltaDOPM}（自パワー${selfPwDOPM}×2）`));
    }
    return done(addLog(ctx, '全相手シグニパワー-0'));
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
  // lastProcessedCards の先頭シグニのパワーを自シグニにコピー
  if (stub.id === 'COPY_TARGET_POWER') {
    const targetCnCTP = (ctx.lastProcessedCards ?? [])[0];
    const selfCnCTP = ctx.sourceCardNum;
    if (!targetCnCTP || !selfCnCTP) return done(addLog(ctx, 'パワーコピー不可（対象/自シグニなし）'));
    const targetPwCTP = ctx.effectivePowers?.get(targetCnCTP) ?? parseInt(ctx.cardMap.get(targetCnCTP)?.Power ?? '0', 10);
    const selfPwCTP = ctx.effectivePowers?.get(selfCnCTP) ?? parseInt(ctx.cardMap.get(selfCnCTP)?.Power ?? '0', 10);
    const deltaCTP = targetPwCTP - selfPwCTP;
    const modsCTP = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: selfCnCTP, delta: deltaCTP }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsCTP } },
      `パワー${targetPwCTP}をコピー（${ctx.cardMap.get(targetCnCTP)?.CardName ?? targetCnCTP}から）`));
  }
  // 自パワーに合わせて相手シグニのパワーを設定
  if (stub.id === 'SET_OPP_SIGNI_POWER_BY_SELF_POWER') {
    const selfPwSOSP = ctx.effectivePowers?.get(ctx.sourceCardNum ?? '')
      ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Power ?? '0', 10);
    const targetsSOSP = (ctx.lastProcessedCards?.length ? ctx.lastProcessedCards
      : [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn));
    const modsSOSP = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of targetsSOSP) {
      const oppPw = ctx.effectivePowers?.get(cn) ?? parseInt(ctx.cardMap.get(cn)?.Power ?? '0', 10);
      if (selfPwSOSP !== oppPw) modsSOSP.push({ cardNum: cn, delta: selfPwSOSP - oppPw });
    }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsSOSP } },
      `相手シグニのパワーを${selfPwSOSP}に設定`));
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
      const excessOEOTC = oppEnaCountOEOTC - maxEnaOEOTC + 1;
      const newEnaOEOTC = ctx.otherState.energy.slice(0, ctx.otherState.energy.length - excessOEOTC);
      const toTrashOEOTC = ctx.otherState.energy.slice(ctx.otherState.energy.length - excessOEOTC);
      const newOtherOEOTC = { ...ctx.otherState, energy: newEnaOEOTC, trash: [...ctx.otherState.trash, ...toTrashOEOTC] };
      return done(addLog({ ...ctx, otherState: newOtherOEOTC },
        `相手エナ${excessOEOTC}枚→トラッシュ（${oppEnaCountOEOTC}枚≥${maxEnaOEOTC}）`));
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
    let curGCAD = addLog({ ...ctx, ownerState: { ...ctx.ownerState, coins: (ctx.ownerState.coins ?? 0) + coinCountGCAD } },
      `コイン+${coinCountGCAD}`);
    const actualDiscardGCAD = Math.min(discardCountGCAD, curGCAD.ownerState.hand.length);
    if (actualDiscardGCAD > 0) {
      const toDiscardGCAD = curGCAD.ownerState.hand.slice(0, actualDiscardGCAD);
      curGCAD = addLog({ ...curGCAD, ownerState: {
        ...curGCAD.ownerState,
        hand: curGCAD.ownerState.hand.slice(actualDiscardGCAD),
        trash: [...curGCAD.ownerState.trash, ...toDiscardGCAD],
      }}, `手札${actualDiscardGCAD}枚捨て`);
    }
    return done(curGCAD);
  }
  // 対象シグニと自シグニの両方にパワー修正
  if (stub.id === 'POWER_MOD_TARGET_AND_SELF') {
    const srcPMTS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMTS = srcPMTS ? (srcPMTS.EffectText ?? '') + ' ' + (srcPMTS.BurstText ?? '') : '';
    const toHWPMTS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // stub.delta パラメータが存在する場合はそちらを優先、なければカードテキストを解析
    const paramDeltaPMTS = typeof (stub as StubAction & { delta?: number }).delta === 'number'
      ? (stub as StubAction & { delta?: number }).delta!
      : undefined;
    const deltaMPMTS = !paramDeltaPMTS ? txtPMTS.match(/([－＋][０-９\d]+)/) : null;
    if (paramDeltaPMTS !== undefined || deltaMPMTS) {
      const deltaPMTS = paramDeltaPMTS !== undefined
        ? paramDeltaPMTS
        : parseInt(toHWPMTS(deltaMPMTS![1]).replace('－', '-').replace('＋', '+'));
      // 対象（lastProcessedCards or 全相手シグニ）にデルタ
      const targets = ctx.lastProcessedCards?.length ? ctx.lastProcessedCards
        : [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
      const modsOther = [...(ctx.otherState.temp_power_mods ?? [])];
      for (const cn of targets) modsOther.push({ cardNum: cn, delta: deltaPMTS });
      let newCtx = { ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsOther } };
      // 自シグニ（sourceCardNum）にも同デルタ
      if (ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)) {
        const modsOwn = [...(newCtx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPMTS }];
        newCtx = { ...newCtx, ownerState: { ...newCtx.ownerState, temp_power_mods: modsOwn } };
      }
      return done(addLog(newCtx, `対象+自シグニパワー${deltaPMTS > 0 ? '+' : ''}${deltaPMTS}`));
    }
    return done(addLog(ctx, 'パワー修正（対象+自）'));
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
  // 自・相手のシグニレベル合計を比較してパワー修正
  if (stub.id === 'POWER_BY_LEVEL_SUM_COMPARE') {
    const srcPBLSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBLSC = srcPBLSC ? (srcPBLSC.EffectText ?? '') + ' ' + (srcPBLSC.BurstText ?? '') : '';
    const toHWPBLSC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const selfLvSumPBLSC = [0, 1, 2].reduce((acc, zi) => {
      return acc + (parseInt(ctx.cardMap.get(ctx.ownerState.field.signi[zi]?.at(-1) ?? '')?.Level ?? '0') || 0);
    }, 0);
    const oppLvSumPBLSC = [0, 1, 2].reduce((acc, zi) => {
      return acc + (parseInt(ctx.cardMap.get(ctx.otherState.field.signi[zi]?.at(-1) ?? '')?.Level ?? '0') || 0);
    }, 0);
    const deltaMPBLSC = txtPBLSC.match(/([－＋][０-９\d]+)/);
    const deltaPBLSC = deltaMPBLSC ? parseInt(toHWPBLSC(deltaMPBLSC[1]).replace('－', '-').replace('＋', '+')) : 0;
    if (selfLvSumPBLSC > oppLvSumPBLSC && deltaPBLSC !== 0) {
      const targets = ctx.lastProcessedCards?.length ? ctx.lastProcessedCards
        : [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
      const modsPBLSC = [...(ctx.otherState.temp_power_mods ?? [])];
      for (const cn of targets) modsPBLSC.push({ cardNum: cn, delta: deltaPBLSC });
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBLSC } },
        `パワー${deltaPBLSC > 0 ? '+' : ''}${deltaPBLSC}（Lv合計：自${selfLvSumPBLSC}＞相手${oppLvSumPBLSC}）`));
    }
    return done(addLog(ctx, `パワー修正なし（Lv合計：自${selfLvSumPBLSC}・相手${oppLvSumPBLSC}）`));
  }
  // トラッシュに置いたシグニのパワーだけ自シグニをパワーアップ
  if (stub.id === 'POWER_UP_BY_DISCARDED_SIGNI_POWER') {
    const trashedCnPUBDP = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1) ?? '';
    const trashedPwPUBDP = parseInt(ctx.cardMap.get(trashedCnPUBDP)?.Power ?? '0') || 0;
    if (trashedPwPUBDP > 0 && ctx.sourceCardNum) {
      const modsPUBDP = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: trashedPwPUBDP }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPUBDP } },
        `パワー+${trashedPwPUBDP}（${ctx.cardMap.get(trashedCnPUBDP)?.CardName ?? trashedCnPUBDP}のパワー）`));
    }
    return done(addLog(ctx, `パワーアップ不可（トラッシュシグニパワー${trashedPwPUBDP}）`));
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
    if (oppHandCntOHTDB > selfHandCntOHTDB) {
      const newOtherOHTDB = {
        ...ctx.otherState,
        hand: [],
        deck: [...ctx.otherState.deck, ...ctx.otherState.hand],
      };
      return done(addLog({ ...ctx, otherState: newOtherOHTDB },
        `相手手札${oppHandCntOHTDB}枚→デッキ下（自手札${selfHandCntOHTDB}枚＜相手）`));
    }
    return done(addLog(ctx, `相手手札${oppHandCntOHTDB}枚≤自手札${selfHandCntOHTDB}枚（条件未達）`));
  }
  // トラッシュから3ゾーンへ分配（lastProcessedCards→各ゾーンへ）
  if (stub.id === 'TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH') {
    const toDistTZD = ctx.lastProcessedCards ?? ctx.ownerState.trash.slice(-3);
    if (toDistTZD.length === 0) return done(addLog(ctx, 'トラッシュにカードなし（TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH）'));
    let newOwnerTZD = ctx.ownerState;
    const fieldTZD = [...newOwnerTZD.field.signi] as (string[] | null)[];
    for (let i = 0; i < Math.min(toDistTZD.length, 3); i++) {
      if (!fieldTZD[i] || fieldTZD[i]!.length === 0) {
        fieldTZD[i] = [toDistTZD[i]];
        newOwnerTZD = { ...newOwnerTZD, trash: newOwnerTZD.trash.filter(cn => cn !== toDistTZD[i]) };
      }
    }
    return done(addLog({ ...ctx, ownerState: { ...newOwnerTZD, field: { ...newOwnerTZD.field, signi: fieldTZD } } },
      `トラッシュから${toDistTZD.length}枚を各ゾーンへ`));
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
  if (stub.id === 'DECLARE_COLOR_COND_ENERGY_TRASH' || stub.id === 'OPP_DECLARE_COLOR_COND_ENERGY_TRASH') {
    return done(addLog(ctx, '色宣言条件エナトラッシュ（スキップ）'));
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
  // トラッシュのカードを手札かエナへ（CHOOSE → INTERNAL）
  if (stub.id === 'TRASHED_CARD_TO_HAND_OR_ENERGY') {
    const targetTCTHOE = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetTCTHOE) return done(addLog(ctx, 'トラッシュにカードなし（TRASHED_CARD_TO_HAND_OR_ENERGY）'));
    const cardNameTCTHOE = ctx.cardMap.get(targetTCTHOE)?.CardName ?? targetTCTHOE;
    const toHandAction: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_HAND' };
    const toEnaAction: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_ENERGY' };
    return needsInteraction(addLog(ctx, `${cardNameTCTHOE}を手札かエナへ`), {
      type: 'CHOOSE',
      options: [
        { id: 'hand', label: '手札に加える', action: toHandAction as EffectAction, available: true },
        { id: 'energy', label: 'エナゾーンへ', action: toEnaAction as EffectAction, available: true },
      ],
      count: 1,
    });
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
    const srcTCTHOE2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTCTHOE2 = srcTCTHOE2 ? (srcTCTHOE2.EffectText ?? '') + ' ' + (srcTCTHOE2.BurstText ?? '') : '';
    const classMTCTHOE2 = txtTCTHOE2.match(/[<＜《]([^>＞》]+)[>＞»]/);
    const targetClassTCTHOE2 = classMTCTHOE2?.[1];
    const candsTCTHOE2 = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (!targetClassTCTHOE2 || c.CardClass?.includes(targetClassTCTHOE2));
    });
    if (candsTCTHOE2.length === 0) return done(addLog(ctx, 'トラッシュに対象なし（TRASH_CLASS_TO_HAND_OR_ENERGY）'));
    const noopTCTHOE2: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contTCTHOE2: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_HAND' };
    return needsInteraction(addLog(ctx, `トラッシュから${targetClassTCTHOE2 ?? 'シグニ'}を選択`), {
      type: 'SELECT_TARGET', candidates: candsTCTHOE2, count: 1, optional: false,
      targetScope: 'self_trash', thenAction: noopTCTHOE2 as EffectAction, continuation: contTCTHOE2 as EffectAction,
    });
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
  // LOOK_TOP_ONE_RETURN_REST_BOTTOM: デッキ上N枚を確認して残りをデッキ下に
  if (stub.id === 'LOOK_TOP_ONE_RETURN_REST_BOTTOM') {
    const srcLTORB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTORB = srcLTORB ? (srcLTORB.EffectText ?? '') + ' ' + (srcLTORB.BurstText ?? '') : '';
    const toHWLTORB = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mLTORB = txtLTORB.match(/デッキ(?:の上)?(?:から)?([０-９\d]+)枚/);
    const countLTORB = mLTORB ? parseInt(toHWLTORB(mLTORB[1])) : 3;
    const visLTORB = ctx.ownerState.deck.slice(0, Math.min(countLTORB, ctx.ownerState.deck.length));
    if (visLTORB.length === 0) return done(addLog(ctx, 'デッキなし'));
    const newSLTORB: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(visLTORB.length) };
    return needsInteraction(
      addLog({ ...ctx, ownerState: newSLTORB }, `デッキ上${visLTORB.length}枚を確認（残りをデッキ下へ）`),
      { type: 'LOOK_AND_REORDER', cards: visLTORB, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'bottom' },
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
    const topLife = sLTH.life_cloth[0];
    const newSLTH: PlayerState = { ...sLTH, life_cloth: sLTH.life_cloth.slice(1), hand: [...sLTH.hand, topLife] };
    return done(addLog({ ...ctx, ownerState: newSLTH }, 'ライフクロス1枚を手札に加えた'));
  }
  // HAND_TO_ENERGY_OPTIONAL: 手札1枚を任意でエナゾーンへ
  if (stub.id === 'HAND_TO_ENERGY_OPTIONAL') {
    const cHTE = ctx.ownerState.hand;
    if (cHTE.length === 0) return done(addLog(ctx, '手札なし'));
    const thenHTE: AddToEnergyAction = { type: 'ADD_TO_ENERGY', owner: 'self' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: cHTE, count: 1, optional: true,
      targetScope: 'self_hand', thenAction: thenHTE,
    });
  }
  // HAND_NONCOLORLESS_TO_ENERGY: 手札の無色以外カードをエナゾーンへ
  if (stub.id === 'HAND_NONCOLORLESS_TO_ENERGY') {
    const sHNCE = ctx.ownerState;
    const nonColorlessHNCE = sHNCE.hand.filter(cn => { const c = ctx.cardMap.get(cn)?.Color ?? ''; return c !== '' && c !== '無色'; });
    const remainHNCE = sHNCE.hand.filter(cn => { const c = ctx.cardMap.get(cn)?.Color ?? ''; return c === '' || c === '無色'; });
    const newSHNCE: PlayerState = { ...sHNCE, hand: remainHNCE, energy: [...sHNCE.energy, ...nonColorlessHNCE] };
    return done(addLog({ ...ctx, ownerState: newSHNCE }, `手札の無色以外${nonColorlessHNCE.length}枚をエナゾーンへ`));
  }
  // OPP_HAND_TO_DECK_TOP: 相手の手札をデッキトップに戻す
  if (stub.id === 'OPP_HAND_TO_DECK_TOP') {
    const sOHTDT = ctx.otherState;
    if (sOHTDT.hand.length === 0) return done(addLog(ctx, '相手手札なし'));
    const newSOHTDT: PlayerState = { ...sOHTDT, deck: [...sOHTDT.hand, ...sOHTDT.deck], hand: [] };
    return done(addLog({ ...ctx, otherState: newSOHTDT }, `相手の手札${ctx.otherState.hand.length}枚をデッキトップに戻した`));
  }
  // OPP_TRASH_TO_DECK_TOP: 相手のトラッシュ最上段をデッキトップに
  if (stub.id === 'OPP_TRASH_TO_DECK_TOP') {
    const sOTTDT = ctx.otherState;
    if (sOTTDT.trash.length === 0) return done(addLog(ctx, '相手トラッシュなし'));
    const topTrashOTTDT = sOTTDT.trash.at(-1)!;
    const newSOTTDT: PlayerState = { ...sOTTDT, trash: sOTTDT.trash.slice(0, -1), deck: [topTrashOTTDT, ...sOTTDT.deck] };
    return done(addLog({ ...ctx, otherState: newSOTTDT },
      `${ctx.cardMap.get(topTrashOTTDT)?.CardName ?? topTrashOTTDT}を相手デッキトップに戻した`));
  }
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
    const centerNumBDCL = ctx.ownerState.field.lrig.at(-1);
    const centerCardBDCL = centerNumBDCL ? ctx.cardMap.get(centerNumBDCL) : undefined;
    const toHWBDCL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const centerLevelBDCL = centerCardBDCL ? parseInt(toHWBDCL(centerCardBDCL.Level ?? '0')) || 0 : 0;
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
  if (stub.id === 'UNDER_SIGNI_TO_ENERGY') {
    let sUSTE = ctx.ownerState;
    const underCardsUSTE = sUSTE.field.signi.flatMap(stack => stack && stack.length > 1 ? stack.slice(0, -1) : []);
    const newSigniUSTE = sUSTE.field.signi.map(stack => !stack || stack.length <= 1 ? stack : [stack.at(-1)!]) as (string[] | null)[];
    sUSTE = { ...sUSTE, field: { ...sUSTE.field, signi: newSigniUSTE }, energy: [...sUSTE.energy, ...underCardsUSTE] };
    return done(addLog({ ...ctx, ownerState: sUSTE }, `シグニ下${underCardsUSTE.length}枚をエナゾーンへ`));
  }
  // UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: シグニ下のクラスなしカードをエナゾーンへ
  if (stub.id === 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS') {
    let sUSTENC = ctx.ownerState;
    const newSigniUSTENC = [...sUSTENC.field.signi] as (string[] | null)[];
    const toEnaUSTENC: string[] = [];
    for (let zi = 0; zi < 3; zi++) {
      const stack = sUSTENC.field.signi[zi];
      if (!stack || stack.length <= 1) continue;
      const under = stack.slice(0, -1);
      const noClass = under.filter(cn => !(ctx.cardMap.get(cn)?.CardClass));
      const hasClass = under.filter(cn => !!ctx.cardMap.get(cn)?.CardClass);
      newSigniUSTENC[zi] = [...hasClass, stack.at(-1)!];
      toEnaUSTENC.push(...noClass);
    }
    sUSTENC = { ...sUSTENC, field: { ...sUSTENC.field, signi: newSigniUSTENC }, energy: [...sUSTENC.energy, ...toEnaUSTENC] };
    return done(addLog({ ...ctx, ownerState: sUSTENC }, `クラスなしシグニ下${toEnaUSTENC.length}枚をエナゾーンへ`));
  }
  // ADD_CARD_TO_LRIG_DECK / ADD_CARD_TO_LRIG_DECK_HIDDEN: lastProcessedCards をルリグデッキに加える
  if (stub.id === 'ADD_CARD_TO_LRIG_DECK' || stub.id === 'ADD_CARD_TO_LRIG_DECK_HIDDEN') {
    const cardsACLD = ctx.lastProcessedCards?.length ? ctx.lastProcessedCards : [];
    if (cardsACLD.length === 0) return done(addLog(ctx, '対象カードなし'));
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
  // FROM_TRASH_TO_CENTER_ZONE: トラッシュからカードをチェックゾーンへ
  if (stub.id === 'FROM_TRASH_TO_CENTER_ZONE') {
    const cnFTCZ = ctx.lastProcessedCards?.[0] ?? ctx.ownerState.trash.at(-1);
    if (!cnFTCZ) return done(addLog(ctx, 'トラッシュなし'));
    const sFTCZ = ctx.ownerState;
    const newSFTCZ: PlayerState = {
      ...sFTCZ,
      trash: sFTCZ.trash.filter(c => c !== cnFTCZ),
      field: { ...sFTCZ.field, check: cnFTCZ },
    };
    return done(addLog({ ...ctx, ownerState: newSFTCZ }, `${ctx.cardMap.get(cnFTCZ)?.CardName ?? cnFTCZ}をセンターゾーンへ`));
  }
  // VIEW_AND_DISCARD_SPELL: 手札からスペルを選んでトラッシュへ
  if (stub.id === 'VIEW_AND_DISCARD_SPELL') {
    const spellsVADS = ctx.ownerState.hand.filter(cn => ctx.cardMap.get(cn)?.Type === 'スペル');
    if (spellsVADS.length === 0) return done(addLog(ctx, '手札にスペルなし'));
    const thenVADS: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: spellsVADS, count: 1, optional: false,
      targetScope: 'self_hand', thenAction: thenVADS,
    });
  }
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
  // POWER_COPY_FROM_DOWNED: ダウン状態のシグニのパワーをコピー
  if (stub.id === 'POWER_COPY_FROM_DOWNED') {
    if (!ctx.sourceCardNum) return done(ctx);
    let targetPowerPCFD = 0;
    // 相手のダウンシグニから探す
    for (let zi = 0; zi < 3; zi++) {
      if (ctx.otherState.field.signi_down?.[zi]) {
        const dn = ctx.otherState.field.signi[zi]?.at(-1);
        if (dn) { targetPowerPCFD = ctx.effectivePowers?.get(dn) ?? 0; break; }
      }
    }
    if (targetPowerPCFD === 0) return done(addLog(ctx, 'ダウンシグニなし'));
    const selfPowerPCFD = ctx.effectivePowers?.get(ctx.sourceCardNum) ?? 0;
    const deltaPCFD = targetPowerPCFD - selfPowerPCFD;
    if (deltaPCFD === 0) return done(addLog(ctx, 'パワー差なし'));
    const modsPCFD = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPCFD }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPCFD } },
      `ダウンシグニパワー${targetPowerPCFD}をコピー（${deltaPCFD > 0 ? '+' : ''}${deltaPCFD}）`));
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
  // POWER_MOD_MIRROR: 相手シグニのパワーに合わせてパワー修正
  if (stub.id === 'POWER_MOD_MIRROR') {
    if (!ctx.sourceCardNum) return done(ctx);
    let selfZonePMM = -1;
    for (let zi = 0; zi < 3; zi++) {
      if (ctx.ownerState.field.signi[zi]?.at(-1) === ctx.sourceCardNum) { selfZonePMM = zi; break; }
    }
    if (selfZonePMM < 0) return done(addLog(ctx, '自ゾーン不明'));
    const oppCnPMM = ctx.otherState.field.signi[selfZonePMM]?.at(-1);
    const oppPowerPMM = oppCnPMM ? (ctx.effectivePowers?.get(oppCnPMM) ?? 0) : 0;
    const selfPowerPMM = ctx.effectivePowers?.get(ctx.sourceCardNum) ?? 0;
    const deltaPMM = oppPowerPMM - selfPowerPMM;
    if (deltaPMM === 0) return done(addLog(ctx, 'パワー同じ（POWER_MOD_MIRROR）'));
    const modsPMM = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPMM }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPMM } },
      `パワーミラー: 相手${oppPowerPMM}に合わせ（${deltaPMM > 0 ? '+' : ''}${deltaPMM}）`));
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
    const hasVirusSTINOV = (ctx.otherState.field.signi_virus ?? []).some(v => v > 0);
    if (hasVirusSTINOV) return done(addLog(ctx, '相手ウィルスあり（トラッシュなし）'));
    if (!ctx.sourceCardNum) return done(ctx);
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
  // 相手シグニをサーバントゼロ（Color='無色', CardClass='無', abilities_removed）にする
  if (stub.id === 'ALL_OPP_SIGNI_SERVANT_ZERO' || stub.id === 'MAKE_SERVANT_ZERO' || stub.id === 'MAKE_MULTI_SERVANT_ZERO' || stub.id === 'SIGNI_SERVANT_ZERO') {
    // MAKE_SERVANT_ZERO: 相手シグニ1体をSELECT_TARGETで選択してからサーバントゼロに
    if ((stub.id === 'MAKE_SERVANT_ZERO' || stub.id === 'SIGNI_SERVANT_ZERO') && !ctx.lastProcessedCards?.length) {
      const oppSigniMSZ = [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
      if (oppSigniMSZ.length === 0) return done(addLog(ctx, '相手フィールドにシグニなし（SERVANT_ZERO）'));
      const applyMSZ: StubAction = { type: 'STUB', id: stub.id };
      return selectOrInteract(oppSigniMSZ, 1, false, 'opp_field', applyMSZ as EffectAction, undefined, ctx);
    }
    // サーバントゼロ: 相手フィールドのシグニを能力消去 + ストーリーをサーバント0に
    const targets = ctx.lastProcessedCards?.length ? ctx.lastProcessedCards :
      [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
    if (targets.length === 0) return done(addLog(ctx, '対象なし（SERVANT_ZERO）'));
    const abilRemovedSZ = [...(ctx.otherState.abilities_removed ?? []), ...targets.filter(cn => !(ctx.otherState.abilities_removed ?? []).includes(cn))];
    const storyOverridesSZ = { ...(ctx.otherState.story_overrides ?? {}) };
    for (const cn of targets) { storyOverridesSZ[cn] = 'サーバント'; }
    const newSOtherSZ: PlayerState = { ...ctx.otherState, abilities_removed: abilRemovedSZ, story_overrides: storyOverridesSZ };
    return done(addLog({ ...ctx, otherState: newSOtherSZ }, `${targets.length}体をサーバントゼロに`));
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
  // TRASH_ALL_OPP_CARDS: 相手の全フィールドシグニと手札をトラッシュへ
  if (stub.id === 'TRASH_ALL_OPP_CARDS') {
    let sOppTAOC = ctx.otherState;
    const toTrashTAOC: string[] = [];
    const newSigniTAOC = sOppTAOC.field.signi.map(stack => {
      if (stack && stack.length > 0) { toTrashTAOC.push(...stack); return null; }
      return stack;
    }) as (string[] | null)[];
    toTrashTAOC.push(...sOppTAOC.hand);
    sOppTAOC = { ...sOppTAOC, field: { ...sOppTAOC.field, signi: newSigniTAOC }, hand: [], trash: [...sOppTAOC.trash, ...toTrashTAOC] };
    return done(addLog({ ...ctx, otherState: sOppTAOC }, `相手の${toTrashTAOC.length}枚をトラッシュへ`));
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
  // SELECT_NO_COMMON_COLOR / DISCARD_OR_PENALTY / DISCARD_BY_POWER_MATCH: log
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
  // POWER_MOD_BY_LRIG_TRASH_ARTS: ルリグトラッシュのアーツ数×deltaを相手シグニに
  if (stub.id === 'POWER_MOD_BY_LRIG_TRASH_ARTS') {
    const toHWPMBLTA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const artsCountPMBLTA = ctx.ownerState.lrig_trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'アーツ').length;
    const srcPMBLTA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBLTA = srcPMBLTA ? (srcPMBLTA.EffectText ?? '') + ' ' + (srcPMBLTA.BurstText ?? '') : '';
    const mPMBLTA = txtPMBLTA.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBLTA) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_LRIG_TRASH_ARTS）'));
    const singleDeltaPMBLTA = parseInt(toHWPMBLTA(mPMBLTA[1]).replace('＋', '+').replace('－', '-'));
    const totalDeltaPMBLTA = singleDeltaPMBLTA * artsCountPMBLTA;
    const modsPMBLTA = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMBLTA.push({ cardNum: top, delta: totalDeltaPMBLTA }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMBLTA } },
      `ルリグトラッシュアーツ${artsCountPMBLTA}×${singleDeltaPMBLTA}→相手パワー${totalDeltaPMBLTA}`));
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
  // CRAFT_TO_LRIG_DECK / ADD_CRAFT_TO_LRIG_DECK (STUB版): クラフトをルリグデッキへ
  if (stub.id === 'CRAFT_TO_LRIG_DECK' || stub.id === 'ADD_CRAFT_TO_LRIG_DECK') {
    const cnCTLD = ctx.sourceCardNum ?? ctx.lastProcessedCards?.[0];
    if (!cnCTLD) return done(addLog(ctx, 'クラフトカードなし'));
    let sCTLD = ctx.ownerState;
    sCTLD = { ...sCTLD, hand: sCTLD.hand.filter(c => c !== cnCTLD), trash: sCTLD.trash.filter(c => c !== cnCTLD), lrig_deck: [...sCTLD.lrig_deck, cnCTLD] };
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
  // OPP_TRASH_TO_OPP_SIGNI_UNDER: 相手トラッシュから相手シグニ下にカードを置く
  if (stub.id === 'OPP_TRASH_TO_OPP_SIGNI_UNDER') {
    const sOTTOSU = ctx.otherState;
    if (sOTTOSU.trash.length === 0) return done(addLog(ctx, '相手トラッシュなし'));
    const topTrashOTTOSU = sOTTOSU.trash.at(-1)!;
    // 相手の最初のシグニのゾーン下に置く
    let targetZoneOTTOSU = -1;
    for (let zi = 0; zi < 3; zi++) { if (sOTTOSU.field.signi[zi]?.at(-1)) { targetZoneOTTOSU = zi; break; } }
    if (targetZoneOTTOSU < 0) return done(addLog(ctx, '相手フィールドにシグニなし'));
    const newSigniOTTOSU = sOTTOSU.field.signi.map((stack, i) => {
      if (i !== targetZoneOTTOSU) return stack;
      return [topTrashOTTOSU, ...(stack ?? [])];
    }) as (string[] | null)[];
    const newSOTTOSU: PlayerState = { ...sOTTOSU, trash: sOTTOSU.trash.slice(0, -1), field: { ...sOTTOSU.field, signi: newSigniOTTOSU } };
    return done(addLog({ ...ctx, otherState: newSOTTOSU },
      `${ctx.cardMap.get(topTrashOTTOSU)?.CardName ?? topTrashOTTOSU}を相手シグニ下へ`));
  }
  // POWER_MOD_BY_ATTACKER_LEVEL: アタッカーのレベル×deltaをパワー修正
  if (stub.id === 'POWER_MOD_BY_ATTACKER_LEVEL') {
    const toHWPMBAL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // ソースカードのレベルを使う
    const srcCardPMBAL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const attackerLevelPMBAL = srcCardPMBAL ? parseInt(toHWPMBAL(srcCardPMBAL.Level ?? '0')) || 0 : 0;
    const txtPMBAL = srcCardPMBAL ? (srcCardPMBAL.EffectText ?? '') + ' ' + (srcCardPMBAL.BurstText ?? '') : '';
    const mPMBAL = txtPMBAL.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBAL) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_ATTACKER_LEVEL）'));
    const singleDeltaPMBAL = parseInt(toHWPMBAL(mPMBAL[1]).replace('＋', '+').replace('－', '-'));
    const totalDeltaPMBAL = singleDeltaPMBAL * attackerLevelPMBAL;
    const modsPMBAL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMBAL.push({ cardNum: top, delta: totalDeltaPMBAL }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMBAL } },
      `アタッカーLv${attackerLevelPMBAL}×${singleDeltaPMBAL}→相手シグニパワー${totalDeltaPMBAL}`));
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
  // TRAP_TO_HAND: signi_trapsの全カードを手札へ
  if (stub.id === 'TRAP_TO_HAND') {
    const trapsToHandTTH = (ctx.ownerState.field.signi_traps ?? [null, null, null]).filter(Boolean) as string[];
    if (trapsToHandTTH.length === 0) return done(addLog(ctx, 'トラップなし'));
    const newHandTTH = [...ctx.ownerState.hand, ...trapsToHandTTH];
    const newTrapsTTH: (string | null)[] = [null, null, null];
    const newOwnerTTH = { ...ctx.ownerState, hand: newHandTTH, field: { ...ctx.ownerState.field, signi_traps: newTrapsTTH } };
    return done(addLog({ ...ctx, ownerState: newOwnerTTH }, `トラップ${trapsToHandTTH.length}枚を手札へ`));
  }
  // ACTIVATE_TRAP / ACTIVATE_TRAP_IN_FIELD: スペル等でトラップを強制発動
  if (stub.id === 'ACTIVATE_TRAP' || stub.id === 'ACTIVATE_TRAP_IN_FIELD') {
    const trapsAT: (string | null)[] = ctx.ownerState.field.signi_traps ?? [null, null, null];
    const firstTrapIdxAT = trapsAT.findIndex((t: string | null) => t !== null);
    if (firstTrapIdxAT < 0) return done(addLog(ctx, 'トラップなし'));
    const trapCardAT = trapsAT[firstTrapIdxAT]!;
    const newTrapsAT = [...trapsAT] as (string | null)[];
    newTrapsAT[firstTrapIdxAT] = null;
    const newOwnerAT = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, trapCardAT], field: { ...ctx.ownerState.field, signi_traps: newTrapsAT } };
    return done(addLog({ ...ctx, ownerState: newOwnerAT }, `トラップ発動: ゾーン${firstTrapIdxAT + 1}`));
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
  // PLACE_TRAP_FROM_REVEALED: lastProcessedCards[0]をトラップ設置（ゾーン選択→INTERNAL_SET_TRAP）
  if (stub.id === 'PLACE_TRAP_FROM_REVEALED') {
    if (!(ctx.lastProcessedCards?.[0])) return done(addLog(ctx, 'PLACE_TRAP_FROM_REVEALED: 対象なし'));
    const zoneOptsPTFR = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `ゾーン${zi + 1}に設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '設置するゾーンを選択（公開から）'), {
      type: 'CHOOSE', options: zoneOptsPTFR, count: 1,
    });
  }
  // TRAP_OP: ソースカードのテキストに応じて操作判定
  if (stub.id === 'TRAP_OP') {
    const srcTRAPOP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTRAPOP = srcTRAPOP ? (srcTRAPOP.EffectText ?? '') + ' ' + (srcTRAPOP.BurstText ?? '') : '';
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
    return done(addLog(ctx, '[トラップ操作]'));
  }
  // TRAP_OPERATION: lastProcessedCardsがあればそのカードをトラップ設置、なければデッキ上1枚から設置
  if (stub.id === 'TRAP_OPERATION') {
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
  // 裏向き系（engine: 裏向きゾーン未実装）
  if (stub.id === 'SIGNI_FLIP_FACEDOWN' || stub.id === 'FLIP_FACE_DOWN_SIGNI' || stub.id === 'FACE_DOWN_OPP_SIGNI') {
    return done(addLog(ctx, `[裏向き: ${stub.id}]`));
  }
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
  // アーツ条件系（engine: アーツ使用条件未実装）
  if (stub.id === 'ARTS_IMMOVABLE' || stub.id === 'ARTS_USE_DISCARD_COLOR_HAND'
      || stub.id === 'ARTS_EXTRA_COST_CONDITION' || stub.id === 'ACCE_COST_REDUCTION') {
    return done(addLog(ctx, `[アーツ/アクセコスト: ${stub.id}]`));
  }
  // フリープレイ系：lastProcessedCards[0] のカードをコストなしでプレイ
  if (stub.id === 'PLAY_FREE' || stub.id === 'PLAY_SPELL_FREE_IGNORE_RESTRICTION' || stub.id === 'CAST_FROM_OPP_TRASH'
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
      if (cardPF.Type === 'スペル') {
        stateAfterPF = { ...stateAfterPF, trash: [...stateAfterPF.trash, cnPF], hand: stateAfterPF.hand.filter(c => c !== cnPF) };
      }
      const execCtxPF = { ...newCtxPF, ownerState: stateAfterPF };
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
  // 複雑パワー修正（engine: コンテキスト/配置情報必要）
  if (stub.id === 'POWER_MOD_DISTRIBUTE' || stub.id === 'POWER_MOD_DOUBLE_DIFF' || stub.id === 'POWER_MOD_ON_FRONT_PLACE'
      || stub.id === 'CONDITIONAL_ALT_POWER_BOOST') {
    return done(addLog(ctx, `[複合パワー修正: ${stub.id}]`));
  }
  // レベル修正（engine: ベースレベル変更システム未実装）
  if (stub.id === 'LEVEL_MOD_PER_COUNT' || stub.id === 'SET_LEVEL_RANGE') {
    return done(addLog(ctx, `[レベル修正: ${stub.id}]`));
  }
  // PREVENT_ZONE_MOVE_BY_OPP: CONTINUOUS効果（effectEngine.collectProtectedZonesで動的計算）
  if (stub.id === 'PREVENT_ZONE_MOVE_BY_OPP') {
    return done(addLog(ctx, '[PREVENT_ZONE_MOVE_BY_OPP: effectEngineで動的処理中]'));
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
  // SIGNI_FLIP_FACEDOWN / FLIP_FACE_DOWN_SIGNI: 自シグニを裏向きにする
  if (stub.id === 'SIGNI_FLIP_FACEDOWN' || stub.id === 'FLIP_FACE_DOWN_SIGNI') {
    const srcSFD = ctx.sourceCardNum;
    if (!srcSFD) return done(addLog(ctx, '裏向き: ソースなし'));
    const newFaceSFD = [...new Set([...(ctx.ownerState.face_down_signi ?? []), srcSFD])];
    const newAbilSFD = [...new Set([...(ctx.ownerState.abilities_removed ?? []), srcSFD])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, face_down_signi: newFaceSFD, abilities_removed: newAbilSFD } },
      `${ctx.cardMap.get(srcSFD)?.CardName ?? srcSFD}を裏向きに`));
  }
  // FACE_DOWN_OPP_SIGNI: 相手シグニを裏向きにする（対象選択後）
  if (stub.id === 'FACE_DOWN_OPP_SIGNI') {
    const tgtFDOS = ctx.lastProcessedCards?.[0];
    if (!tgtFDOS) return done(addLog(ctx, '裏向き: 対象なし'));
    const newFaceFDOS = [...new Set([...(ctx.otherState.face_down_signi ?? []), tgtFDOS])];
    const newAbilFDOS = [...new Set([...(ctx.otherState.abilities_removed ?? []), tgtFDOS])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, face_down_signi: newFaceFDOS, abilities_removed: newAbilFDOS } },
      `${ctx.cardMap.get(tgtFDOS)?.CardName ?? tgtFDOS}を裏向きに`));
  }
  // 保護・移動防止系（engine: 各防止フラグシステム未実装）
  if (stub.id === 'PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH'
      || stub.id === 'PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH' || stub.id === 'PREVENT_NON_FIELD_MOVE_BY_OPP'
      || stub.id === 'PREVENT_OPP_SIGNI_ABILITY_GAIN'
      || stub.id === 'PREVENT_SIGNI_ABILITY_LOSS_BY_OPP' || stub.id === 'PREVENT_POWER_MINUS_BY_OPP'
      || stub.id === 'PREVENT_OPP_POWER_PLUS' || stub.id === 'PREVENT_ABILITY_CHANGE_BY_OPP'
      || stub.id === 'PREVENT_SIGNI_DOWN_BY_OPP' || stub.id === 'SUPPRESS_GAIN_ABILITY'
      || stub.id === 'PREVENT_INFECTED_SIGNI_ACTIVATE' || stub.id === 'PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE'
      || stub.id === 'SIGNI_CANT_BOUNCE_FROM_FIELD'
      || stub.id === 'SIGNI_PROTECT_MOVE_EXCEPT_ENERGY') {
    return done(addLog(ctx, `[保護効果: ${stub.id}]`));
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
  if (stub.id === 'GROW_COST_ZERO' || stub.id === 'CONDITIONAL_FREE_GROW' || stub.id === 'GROW_COST_SUBSTITUTE_TRASH_SIGNI') {
    return done(addLog(ctx, `[グロウコスト: ${stub.id}]`));
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
      || stub.id === 'ARTS_COST_REDUCTION_BY_COST_THRESHOLD' || stub.id === 'REDUCE_PLAY_ABILITY_COST') {
    return done(addLog(ctx, `[コスト軽減: ${stub.id}]`));
  }
  // ガード系（engine: ガードコスト処理未実装）
  if (stub.id === 'GUARD_ALTERNATIVE_COST' || stub.id === 'EXTRA_GUARD_COST_FROM_HAND' || stub.id === 'OPTIONAL_TRADE_GUARD_SIGNI') {
    return done(addLog(ctx, `[ガードコスト: ${stub.id}]`));
  }
  // 選んだキーワード能力付与（シグニ対象・CHOOSEインタラクション）
  if (stub.id === 'GRANT_CHOSEN_ABILITY' || stub.id === 'GRANT_CHOSEN_ABILITY_SELF'
      || stub.id === 'SIGNI_GRANT_CHOSEN_ABILITY') {
    const srcGCA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGCA = srcGCA ? (srcGCA.EffectText ?? '') + ' ' + (srcGCA.BurstText ?? '') : '';
    // 既知キーワードを選択肢として抽出
    const knownKwsGCA = ['アサシン', 'ランサー', 'ダブルクラッシュ', '貫通', 'マルチエナ', 'シャドウ', 'バニッシュ無効'];
    const choiceKwsGCA = knownKwsGCA.filter(kw => txtGCA.includes(`【${kw}】`) || txtGCA.includes(kw));
    if (choiceKwsGCA.length > 0) {
      // 対象シグニを決定（lastProcessedCards or sourceCardNum）
      const targetSigniGCA = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum ?? null;
      if (!targetSigniGCA) return done(addLog(ctx, '能力付与対象なし'));
      const optionsGCA = choiceKwsGCA.map(kw => ({
        id: kw,
        label: `【${kw}】を付与`,
        action: ({ type: 'STUB', id: 'INTERNAL_GRANT_KEYWORD_TO_TARGET', value: `${targetSigniGCA}:${kw}` } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, '能力を選んでください'), { type: 'CHOOSE', options: optionsGCA, count: 1 });
    }
    return done(addLog(ctx, `[能力付与: ${stub.id}]（キーワード解析不可）`));
  }
  // INTERNAL_GRANT_KEYWORD_TO_TARGET: 選択されたキーワードを対象シグニに付与
  if (stub.id === 'INTERNAL_GRANT_KEYWORD_TO_TARGET') {
    const valIGKTT = typeof stub.value === 'string' ? stub.value : '';
    const [targetCnIGKTT, kwIGKTT] = valIGKTT.split(':');
    if (!targetCnIGKTT || !kwIGKTT) return done(addLog(ctx, 'キーワード付与失敗（引数不正）'));
    const grantsIGKTT = { ...(ctx.ownerState.keyword_grants ?? {}) };
    grantsIGKTT[targetCnIGKTT] = [...new Set([...(grantsIGKTT[targetCnIGKTT] ?? []), kwIGKTT])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsIGKTT } },
      `${ctx.cardMap.get(targetCnIGKTT)?.CardName ?? targetCnIGKTT}に【${kwIGKTT}】付与`));
  }
  // GRANT_CHOSEN_ABILITY_FROM_PLAY: プレイ時選んだ能力を自シグニに付与（ログのみ）
  if (stub.id === 'GRANT_CHOSEN_ABILITY_FROM_PLAY') {
    return done(addLog(ctx, '[能力付与（プレイ時選択）: 複雑効果スキップ]'));
  }
  // 能力付与系（engine: CardEffect付与システム未実装）
  if (stub.id === 'GRANT_LRIG_ABILITY' || stub.id === 'GRANT_LRIG_TRASH_ACTIVATE_ABILITY'
      || stub.id === 'GRANT_UNDER_LRIG_ACTIVATE_ABILITY' || stub.id === 'GRANT_UNDER_LRIG_AUTO_ABILITY'
      || stub.id === 'GRANT_UNDER_SIGNI_ALL_ABILITIES' || stub.id === 'GRANT_UNDER_SIGNI_CONSTANT_ABILITY'
      || stub.id === 'GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE' || stub.id === 'GRANT_ABILITY_UNTIL_OPP_TURN'
      || stub.id === 'GRANT_SIGNI_CLASS' || stub.id === 'LAYER_ABILITY_COPY' || stub.id === 'COPY_ABILITY'
      || stub.id === 'RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY' || stub.id === 'SIGNI_GRANT_QUOTED_CONSTANT_ABILITY'
      || stub.id === 'GRANT_LRIG_TYPE_GAME_WIDE') {
    return done(addLog(ctx, `[能力付与: ${stub.id}]`));
  }
  // ライズ/スタック系（engine: ライズシステム未実装）
  if (stub.id === 'RIDE_ON' || stub.id === 'RISE_BANISH_SUBSTITUTE' || stub.id === 'RISE_LEAVE_DISCARD_STACK'
      || stub.id === 'BANISH_SUBSTITUTE_RISE_STACK' || stub.id === 'RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE'
      || stub.id === 'COOKING_BANISH_SUBSTITUTE' || stub.id === 'BLACK_RISE_PLAY_STACK_FROM_TRASH') {
    return done(addLog(ctx, `[ライズ/スタック: ${stub.id}]`));
  }
  // ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白: CONTINUOUS効果（effectEngine.collectEnergyColorSubsで動的計算）
  if (stub.id === 'ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白') {
    return done(addLog(ctx, '[ENERGY_COLOR_SUBSTITUTE: effectEngineで動的処理中]'));
  }
  // エナ代替系（engine: コスト代替システム未実装）
  if (stub.id === 'ENERGY_COLOR_SUBSTITUTE_TRASH' || stub.id === 'ENERGY_SUBSTITUTE_TRASH_SIGNI'
      || stub.id === 'ENERGY_SUBSTITUTE_TRASH_KEY' || stub.id === 'ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI') {
    return done(addLog(ctx, `[エナ代替: ${stub.id}]`));
  }
  // CLASS_CHANGE: シグニのクラスを一時変更（SELECT_TARGETで対象選択）
  if (stub.id === 'CLASS_CHANGE') {
    const srcCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCC = srcCC ? (srcCC.EffectText ?? '') + ' ' + (srcCC.BurstText ?? '') : '';
    // 変更先クラスを抽出 (＜怪異＞など)
    const newClassM = txtCC.match(/＜([^＞]+)＞を得る/);
    const newClass = newClassM ? newClassM[1] : null;
    if (!newClass) return done(addLog(ctx, 'クラス変更先不明'));
    // 自分・相手のフィールドシグニを対象候補
    const allSigniCC = [
      ...[0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
      ...[0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
    ];
    if (allSigniCC.length === 0) return done(addLog(ctx, 'クラス変更対象なし'));
    const changeClassStub: StubAction = {
      type: 'STUB', id: 'INTERNAL_APPLY_CLASS_CHANGE', value: newClass,
    };
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
    // 相手シグニ1体を選択（lastProcessedCardsが既にあれば直接適用）
    const oppSigniCSC = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
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
  // SIGNI_LOSE_COLOR: このシグニが色を失う（ターン終了時まで）
  if (stub.id === 'SIGNI_LOSE_COLOR') {
    const srcSLC = ctx.sourceCardNum;
    if (!srcSLC) return done(addLog(ctx, 'SIGNI_LOSE_COLOR: ソースなし'));
    const ownerHasSLC = ctx.ownerState.field.signi.some(s => s?.includes(srcSLC));
    if (ownerHasSLC) {
      const overridesSLC = { ...(ctx.ownerState.signi_color_overrides ?? {}), [srcSLC]: '無' };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, signi_color_overrides: overridesSLC } },
        `${ctx.cardMap.get(srcSLC)?.CardName ?? srcSLC}が色を失う`));
    }
    const oppOverridesSLC = { ...(ctx.otherState.signi_color_overrides ?? {}), [srcSLC]: '無' };
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, signi_color_overrides: oppOverridesSLC } },
      `${ctx.cardMap.get(srcSLC)?.CardName ?? srcSLC}が色を失う`));
  }
  if (stub.id === 'COPY_SIGNI' || stub.id === 'COPY_CARD'
      || stub.id === 'CHANGE_BASE_LEVEL' || stub.id === 'CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN'
      || stub.id === 'DECK_SIGNI_LEVEL_OVERRIDE' || stub.id === 'DYNAMIC_LEVEL_BY_ENERGY'
      || stub.id === 'LEVEL_REFERENCE_OVERRIDE' || stub.id === 'LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT'
      || stub.id === 'ALL_CLASS' || stub.id === 'ALL_COLOR' || stub.id === 'ALL_ZONE_BLACK'
      || stub.id === 'ALL_CARDS_COLOR_CHANGE_BLACK' || stub.id === 'ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE'
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
  // ルリグデッキ/ライドシステム
  if (stub.id === 'STACK_ALL_LRIG_UNDER' || stub.id === 'LRIG_RIDE_SIGNI' || stub.id === 'CENTER_LRIG_RIDES_ON_SIGNI'
      || stub.id === 'CENTER_LRIG_DISMOUNT' || stub.id === 'LRIG_GAIN_ABILITY' || stub.id === 'LRIG_ALL_NAMES'
      || stub.id === 'GAIN_ADDITIONAL_LRIG_TYPE' || stub.id === 'GAIN_LRIG_COLOR') {
    return done(addLog(ctx, `[ルリグシステム: ${stub.id}]`));
  }
  // ドロー枚数制限（次のターン）
  if (stub.id === 'LIMIT_OPP_DRAW_COUNT' || stub.id === 'OPP_MAIN_PHASE_LIMIT_DOWN') {
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
  if (stub.id === 'TRIGGER_LIFE_BURST' || stub.id === 'BATTLE_BANISH_LIFE_BURST') {
    return done(addLog(ctx, `[ライフバースト特殊: ${stub.id}]`));
  }
  // ビートゾーン操作
  if (stub.id === 'BEAT_ZONE_OP') {
    // フィールドのシグニ選択→ビートゾーンへ（target未実装: ログのみ）
    return done(addLog(ctx, '[ビートゾーン移動: 対象選択未実装]'));
  }
  if (stub.id === 'TRASH_SIGNI_TO_BEAT') {
    // トラッシュからシグニをビートゾーンへ（target未実装: ログのみ）
    return done(addLog(ctx, '[トラッシュ→ビートゾーン: 未実装]'));
  }
  if (stub.id === 'SIGNI_UNDER_WEAPON_SIGNI'
      || stub.id === 'PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON' || stub.id === 'PLACE_DECK_TOP_UNDER_WEAPON_SIGNI'
      || stub.id === 'CONDITIONAL_TRASH_UNDER_SIGNI') {
    return done(addLog(ctx, `[ビートゾーン: ${stub.id}]`));
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
  if (stub.id === 'BLOCK_OPP_AUTO_ABILITY_EXTENDED'
      || stub.id === 'BLOCK_NON_WHITE_SPELL'
      || stub.id === 'BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT' || stub.id === 'BLOCK_OPP_DECK_TO_ENERGY'
      || stub.id === 'BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT') {
    return done(addLog(ctx, `[ブロック効果: ${stub.id}]`));
  }
  // OPP_TURN_NO_ENERGY_COST: 対戦相手の次のターン中、対戦相手はエナコストを支払えない
  if (stub.id === 'OPP_TURN_NO_ENERGY_COST') {
    const newBlockedOTNEC = [...(ctx.otherState.blocked_actions ?? []), 'USE_ARTS:NEXT_TURN', 'USE_SPELL:NEXT_TURN'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedOTNEC } },
      '対戦相手の次のターン中、対戦相手はエナコストを支払えない'));
  }
  // コストアップ系（engine: コスト計算未実装）
  if (stub.id === 'FIRST_SPELL_COST_UP' || stub.id === 'OPP_LRIG_ATTACK_COST' || stub.id === 'OPP_SIGNI_ATTACK_COST'
      || stub.id === 'OPP_MAIN_PHASE_LIMIT_DOWN'
      || stub.id === 'OPP_ZONE_PLACEMENT_RESTRICT' || stub.id === 'ARTS_COLORLESS_MUST_PAY_CENTER_COLOR') {
    return done(addLog(ctx, `[コストアップ/制限: ${stub.id}]`));
  }
  // シグニ移動/リダイレクト系（engine: 移動先変更未実装）
  // MOVE_TO_ATTACKER_FRONT: アタッカー正面ゾーンに自分を移動（stub.value = 目標ゾーンインデックス）
  if (stub.id === 'MOVE_TO_ATTACKER_FRONT') {
    const targetZoneMTAF = typeof stub.value === 'number' ? stub.value : -1;
    const srcMTAF = ctx.sourceCardNum;
    if (targetZoneMTAF < 0 || !srcMTAF) return done(addLog(ctx, 'アタッカー前移動：情報不足'));
    const curZoneMTAF = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcMTAF);
    if (curZoneMTAF < 0) return done(addLog(ctx, 'アタッカー前移動：フィールドにいない'));
    if (curZoneMTAF === targetZoneMTAF) return done(addLog(ctx, 'アタッカー前移動：すでに正面ゾーン'));
    const targetStackMTAF = ctx.ownerState.field.signi[targetZoneMTAF];
    if (targetStackMTAF && targetStackMTAF.length > 0) return done(addLog(ctx, 'アタッカー前移動：目標ゾーン占有済み'));
    const newSigniMTAF = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const movedStackMTAF = [...(newSigniMTAF[curZoneMTAF] ?? [])];
    newSigniMTAF[curZoneMTAF] = null;
    newSigniMTAF[targetZoneMTAF] = movedStackMTAF;
    const newDownMTAF = [...(ctx.ownerState.field.signi_down ?? [false, false, false])];
    const wasDownMTAF = newDownMTAF[curZoneMTAF];
    newDownMTAF[curZoneMTAF] = false;
    newDownMTAF[targetZoneMTAF] = wasDownMTAF;
    const newOwnerMTAF = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniMTAF, signi_down: newDownMTAF } };
    return done(addLog({ ...ctx, ownerState: newOwnerMTAF }, `${ctx.cardMap.get(srcMTAF)?.CardName ?? srcMTAF}をゾーン${targetZoneMTAF + 1}（アタッカー正面）に移動`));
  }
  if (stub.id === 'FORCE_TARGET_SELF' || stub.id === 'BANISH_BY_SELF_GOES_TO_TRASH'
      || stub.id === 'CRASH_TO_TRASH_INSTEAD'
      || stub.id === 'OPP_TRASH_LOSE_COLOR_AND_CLASS') {
    return done(addLog(ctx, `[移動リダイレクト: ${stub.id}]`));
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
  // ダメージ特殊（engine: ダメージ処理拡張必要）
  if (stub.id === 'MULTI_DAMAGE_ON_LRIG_ATTACK' || stub.id === 'ATTACK_PHASE_LEVEL_OVERRIDE') {
    return done(addLog(ctx, `[ダメージ/フェイズ特殊: ${stub.id}]`));
  }
  // ウェポン・プロテクション系（engine: 種族保護フラグ未実装）
  if (stub.id === 'DRIVE_SIGNI_PREVENT_DOWN' || stub.id === 'WEAPON_SIGNI_PROTECT_DOWN'
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
  // NEGATE_NTH_ATTACK: N回目のアタックを無効化（ログのみ）
  if (stub.id === 'NEGATE_NTH_ATTACK') {
    const toHWNNA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcNNA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtNNA = srcNNA ? (srcNNA.EffectText ?? '') : '';
    const mNNA = txtNNA.match(/([０-９\d]+)回目/);
    const nNNA = mNNA ? parseInt(toHWNNA(mNNA[1])) : 1;
    return done(addLog(ctx, `${nNNA}回目のアタックを無効化`));
  }
  // NEGATE_COIN_ABILITY: コイン能力を無効化（ログのみ）
  if (stub.id === 'NEGATE_COIN_ABILITY') {
    return done(addLog(ctx, 'コイン能力を無効化'));
  }
  // NEGATE_ALL_OPP_EFFECTS: 相手の全効果を無効化（ログのみ）
  if (stub.id === 'NEGATE_ALL_OPP_EFFECTS') {
    return done(addLog(ctx, '相手の全効果を無効化（このターン）'));
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
  // COIN_SPEND_CONDITION / COIN_USE_RESTRICTION: コイン関連制限
  if (stub.id === 'COIN_SPEND_CONDITION' || stub.id === 'COIN_USE_RESTRICTION') {
    return done(addLog(ctx, stub.id === 'COIN_SPEND_CONDITION' ? 'コイン消費条件' : 'コイン使用制限'));
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
  // LEVEL_BASED_CONDITIONAL: レベル基準で条件分岐
  if (stub.id === 'LEVEL_BASED_CONDITIONAL') {
    const toHWLBC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const centerLBC = ctx.ownerState.field.lrig.at(-1);
    const centerCardLBC = centerLBC ? ctx.cardMap.get(centerLBC) : undefined;
    const centerLvLBC = centerCardLBC ? parseInt(toHWLBC(centerCardLBC.Level ?? '0')) || 0 : 0;
    return done(addLog(ctx, `レベル${centerLvLBC}基準の条件分岐（スキップ）`));
  }
  // OPP_DECLARE_COLOR: 相手が色を宣言（ログのみ）
  if (stub.id === 'OPP_DECLARE_COLOR') {
    return done(addLog(ctx, '相手が色を宣言'));
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
    const centerCol = ctx.ownerState.field.lrig.at(-1);
    const centerNameCol = centerCol ? ctx.cardMap.get(centerCol)?.CardName ?? centerCol : 'なし';
    return done(addLog(ctx, `コラボ（センター：${centerNameCol}）`));
  }
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
    const gateZoneIdx = typeof stub.value === 'number' ? stub.value : 0;
    const currentGates = [...(ctx.otherState.signi_gate_zones ?? [])];
    if (!currentGates.includes(gateZoneIdx)) currentGates.push(gateZoneIdx);
    // ゲートゾーンの相手シグニを blocked_actions に追加（アタック不可）
    const gateTop = ctx.otherState.field.signi[gateZoneIdx]?.at(-1);
    const blocked = [...(ctx.otherState.blocked_actions ?? [])];
    if (gateTop) blocked.push(`ATTACK:${gateTop}`);
    const newOtherGATE = { ...ctx.otherState, signi_gate_zones: currentGates, blocked_actions: blocked };
    return done(addLog({ ...ctx, otherState: newOtherGATE }, `相手ゾーン${gateZoneIdx + 1}に【ゲート】設置`));
  }
  // OPEN_MAGIC_BOX: マジックボックスを開ける（ログのみ）
  if (stub.id === 'OPEN_MAGIC_BOX') {
    return done(addLog(ctx, 'マジックボックスを開ける'));
  }
  // PLACE_MAGIC_BOX: マジックボックスを設置（ログのみ）
  if (stub.id === 'PLACE_MAGIC_BOX') {
    return done(addLog(ctx, 'マジックボックスを設置'));
  }
  // TARGET_OPP_SIGNI_ONLY / TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE: 対象修飾子（ログのみ）
  if (stub.id === 'TARGET_OPP_SIGNI_ONLY' || stub.id === 'TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE') {
    return done(addLog(ctx, '相手シグニを対象とする'));
  }
  // USE_CONDITION_ARTS_USED: アーツ使用条件（ログのみ）
  if (stub.id === 'USE_CONDITION_ARTS_USED') {
    return done(addLog(ctx, 'アーツ使用条件'));
  }
  // CENTER_ZONE_CONDITION: センターゾーン条件（ログのみ）
  if (stub.id === 'CENTER_ZONE_CONDITION') {
    return done(addLog(ctx, 'センターゾーン条件'));
  }
  // DEPLOY_RESTRICT: 配置制限（ログのみ）
  if (stub.id === 'DEPLOY_RESTRICT') {
    return done(addLog(ctx, '配置制限'));
  }
  // DEFEAT: 敗北処理（ログのみ）
  if (stub.id === 'DEFEAT') {
    return done(addLog(ctx, '敗北処理（エンジン未実装）'));
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
    // デッキトラッシュパターン
    const millMRNT = txtRNT.match(/デッキの上からカードを([０-９\d]+)枚トラッシュに置く/);
    if (millMRNT) {
      const millPerRound = parseInt(toHWRNT(millMRNT[1]));
      const totalMill = millPerRound * nRNT;
      const toTrashRNT = ctx.otherState.deck.slice(0, Math.min(totalMill, ctx.otherState.deck.length));
      const newOtherRNT = { ...ctx.otherState, deck: ctx.otherState.deck.slice(toTrashRNT.length), trash: [...ctx.otherState.trash, ...toTrashRNT] };
      return done(addLog({...ctx, otherState: newOtherRNT}, `${nRNT}回繰り返し: デッキ${toTrashRNT.length}枚トラッシュ`));
    }
    return done(addLog(ctx, `${nRNT}回繰り返し効果（後続ステップで処理）`));
  }
  // PLACE_CHOKKIN: チョッキン設置（ログのみ）
  if (stub.id === 'PLACE_CHOKKIN') {
    return done(addLog(ctx, 'チョッキン設置'));
  }
  // ADD_RESONANCE_CONDITION: レゾナ条件追加（ログのみ）
  if (stub.id === 'ADD_RESONANCE_CONDITION') {
    return done(addLog(ctx, 'レゾナ条件追加'));
  }
  // IGNORE_LRIG_RESTRICTION_ARTS: ルリグ制限アーツを無視（ログのみ）
  if (stub.id === 'IGNORE_LRIG_RESTRICTION_ARTS') {
    return done(addLog(ctx, 'ルリグ制限アーツを無視'));
  }
  // COST_COLOR_SELECT: コスト色を選択（ログのみ）
  if (stub.id === 'COST_COLOR_SELECT') {
    return done(addLog(ctx, 'コスト色を選択'));
  }
  // HASTARLIQ: ハスタルリク効果（ログのみ）
  if (stub.id === 'HASTARLIQ') {
    return done(addLog(ctx, 'ハスタルリク効果'));
  }
  // ACTIVATE_EICHI_ABILITY / CHANGE_EICHI_SIGNI_BASE_LEVEL / TRIGGER_OTHER_SIGNI_EICHI_ABILITY: エイチ系
  if (stub.id === 'ACTIVATE_EICHI_ABILITY' || stub.id === 'CHANGE_EICHI_SIGNI_BASE_LEVEL' || stub.id === 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY') {
    return done(addLog(ctx, `エイチ能力（${stub.id}）`));
  }
  // SUPPRESS_CENTER_ON_PLAY: プレイ時センター抑制（ログのみ）
  if (stub.id === 'SUPPRESS_CENTER_ON_PLAY') {
    return done(addLog(ctx, 'プレイ時センター抑制'));
  }
  // SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: ダメージを自トラッシュで代替（ログのみ）
  if (stub.id === 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH') {
    return done(addLog(ctx, 'ダメージを自トラッシュで代替'));
  }
  // SELECT_NO_COMMON_COLOR: 共通色なしを選択（ログのみ）
  if (stub.id === 'SELECT_NO_COMMON_COLOR') {
    return done(addLog(ctx, '共通色なしを選択'));
  }
  // DISCARD_BY_POWER_MATCH: パワー一致で捨て（ログのみ）
  if (stub.id === 'DISCARD_BY_POWER_MATCH') {
    return done(addLog(ctx, 'パワー一致で捨て（スキップ）'));
  }
  // DECLARE_NUMBER_RANGE / DECLARE_NUMBER_POWER: 数字宣言（ログのみ）
  if (stub.id === 'DECLARE_NUMBER_RANGE' || stub.id === 'DECLARE_NUMBER_POWER') {
    return done(addLog(ctx, '数字宣言'));
  }
  // CONDITIONAL_ALTERNATE_EFFECT: 条件付き代替効果（ログのみ）
  if (stub.id === 'CONDITIONAL_ALTERNATE_EFFECT') {
    return done(addLog(ctx, '条件付き代替効果（スキップ）'));
  }
  // TRASH_SPELL_FREE_USE_LIMIT: トラッシュスペル無料使用制限（ログのみ）
  if (stub.id === 'TRASH_SPELL_FREE_USE_LIMIT') {
    return done(addLog(ctx, 'トラッシュスペル無料使用制限'));
  }
  // UPKEEP_OR_NO_UP: アップキープかアップなし（ログのみ）
  if (stub.id === 'UPKEEP_OR_NO_UP') {
    return done(addLog(ctx, 'アップキープかアップなし'));
  }
  // ACTIVATE_COST_ZERO_BLACK: 黒の起動コスト0（ログのみ）
  if (stub.id === 'ACTIVATE_COST_ZERO_BLACK') {
    return done(addLog(ctx, '黒の起動コスト0'));
  }
  // BET_CONDITION: ベット条件（ログのみ）
  if (stub.id === 'BET_CONDITION') {
    return done(addLog(ctx, 'ベット条件'));
  }
  // DISABLE_FIRST_ABILITY_ON_ATTACK: アタック時最初の能力を無効化（ログのみ）
  if (stub.id === 'DISABLE_FIRST_ABILITY_ON_ATTACK') {
    return done(addLog(ctx, 'アタック時最初の能力を無効化'));
  }
  // REPLACE_PLUS_N: +N置換（ログのみ）
  if (stub.id === 'REPLACE_PLUS_N') {
    return done(addLog(ctx, '+N置換'));
  }
  // CONDITIONAL_KEYWORD_BY_CENTER_COLOR already handled above
  // === バッチ16: アクセ・公開・汎用選択系 ===
  // GRID_REVEAL_PLUS: グリッド公開（デッキ上を公開し結果に応じてドロー等）
  if (stub.id === 'GRID_REVEAL_PLUS') {
    const sGRP = ctx.ownerState;
    if (sGRP.deck.length === 0) return done(addLog(ctx, 'デッキなし（グリッド公開できず）'));
    const topGRP = sGRP.deck[0];
    const cardGRP = ctx.cardMap.get(topGRP);
    const newSGRP: PlayerState = { ...sGRP, deck: sGRP.deck.slice(1), trash: [...sGRP.trash, topGRP] };
    return done(addLog({ ...ctx, ownerState: newSGRP, lastProcessedCards: [topGRP] },
      `グリッド公開：${cardGRP?.CardName ?? topGRP}→トラッシュ`));
  }
  // MAGIC_BOX_REVEAL: マジックボックスを開けて公開
  if (stub.id === 'MAGIC_BOX_REVEAL') {
    const sMBR = ctx.ownerState;
    if (sMBR.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topMBR = sMBR.deck[0];
    const cardMBR = ctx.cardMap.get(topMBR);
    return done(addLog({ ...ctx, lastProcessedCards: [topMBR] },
      `マジックボックス公開：${cardMBR?.CardName ?? topMBR}`));
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
  if (stub.id === 'TRASH_ACCE_AT_TURN_END') {
    const accesTATE = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const acceCardsToTrash = accesTATE.filter((cn): cn is string => cn !== null);
    if (acceCardsToTrash.length === 0) return done(addLog(ctx, 'アクセなし（トラッシュ対象なし）'));
    const newAcceTATE = [null, null, null] as (string | null)[];
    const newSTATE: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, ...acceCardsToTrash],
      field: { ...ctx.ownerState.field, signi_acce: newAcceTATE },
    };
    return done(addLog({ ...ctx, ownerState: newSTATE }, `アクセ${acceCardsToTrash.length}枚→トラッシュ（ターン終了）`));
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
  // CHOOSE_HAND_OR_ENERGY: 手札かエナから選択
  if (stub.id === 'CHOOSE_HAND_OR_ENERGY') {
    const candsCHOE = [...ctx.ownerState.hand, ...ctx.ownerState.energy];
    if (candsCHOE.length === 0) return done(addLog(ctx, '手札もエナもなし'));
    const noopCHOE: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsCHOE, count: 1, optional: true,
      targetScope: 'self_hand', thenAction: noopCHOE as EffectAction,
    });
  }
  // OPP_DECLARE_CHOICE / OPP_CHOOSE_EFFECT / OPP_CHOOSES_FOR_YOU: 相手が①②から選ぶ
  if (stub.id === 'OPP_DECLARE_CHOICE' || stub.id === 'OPP_CHOOSE_EFFECT' || stub.id === 'OPP_CHOOSES_FOR_YOU') {
    const srcODC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtODC = srcODC ? (srcODC.EffectText ?? '') + ' ' + (srcODC.BurstText ?? '') : '';
    // ①②パターンを解析
    const choicePatsODC = [{ m: /①([^②③]+)/, idx: 0 }, { m: /②([^③④]+)/, idx: 1 }];
    const optsODC: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of choicePatsODC) {
      const mat = txtODC.match(m);
      if (!mat) continue;
      const ctxt = mat[1].replace(/。\s*$/, '').trim();
      let act: EffectAction | null = null;
      if (ctxt.match(/デッキの上からカードを([０-９\d]+)枚トラッシュ/)) {
        const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const cnt = parseInt(toHW(ctxt.match(/([０-９\d]+)枚/)![1]));
        act = ({ type: 'STUB', id: 'INTERNAL_DECK_TRASH_BOTH', value: cnt } as StubAction) as EffectAction;
      }
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
      const newSigniDownDTT = [true, true, true];
      const newSigniFrozenDTT = [true, true, true];
      ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
        field: { ...ctxDTT.otherState.field,
          signi_down: newSigniDownDTT,
          signi_frozen: newSigniFrozenDTT,
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
    if (logsDTT.length > 0) return done(addLog(ctxDTT, logsDTT.join(' / ')));
    return done(addLog(ctx, '3つの処理（個別解析不可）'));
  }
  // CONDITIONAL_MULTI_CHOOSE_BY_CENTER: センタールリグによる複数選択
  if (stub.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER') {
    const srcCMCBC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCMCBC = srcCMCBC ? (srcCMCBC.EffectText ?? '') + ' ' + (srcCMCBC.BurstText ?? '') : '';
    const toHWCMCBC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // センタールリグ条件チェック: 「センタールリグがXXの場合」
    const centerCondM = txtCMCBC.match(/センタールリグが(.+?)の場合/);
    if (centerCondM) {
      const reqCenterName = centerCondM[1].trim();
      const centerTop = ctx.ownerState.field.lrig.at(-1);
      const centerCard = centerTop ? ctx.cardMap.get(centerTop) : undefined;
      const centerName = centerCard?.CardName ?? '';
      // lrigNameAliasesも考慮（COPY_LRIG_NAME_ABILITYがある場合）
      const aliases: string[] = centerName ? [centerName] : [];
      if (!aliases.some(n => n.includes(reqCenterName) || reqCenterName.includes(n))) {
        // センター条件不一致 → ベース効果（残りのSEQUENCEステップ）へ
        return done(addLog(ctx, `センター条件不一致（要:${reqCenterName}・現:${centerName}）→ベース効果`));
      }
    }
    // 選択数（"N つまで" → N, デフォルト1）
    const chooseCountM = txtCMCBC.match(/代わりに([２-９２-９])つまで選ぶ/);
    const maxChooseCount = chooseCountM ? parseInt(toHWCMCBC(chooseCountM[1])) : 1;
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
      return needsInteraction(addLog(ctx, `効果を最大${maxChooseCount}つ選択してください`), {
        type: 'CHOOSE', options: optionsCMCBC, count: maxChooseCount,
      });
    }
    const centerCMCBC2 = ctx.ownerState.field.lrig.at(-1);
    const centerCardCMCBC2 = centerCMCBC2 ? ctx.cardMap.get(centerCMCBC2) : undefined;
    return done(addLog(ctx, `センター（${centerCardCMCBC2?.CardName ?? 'なし'}）による複数選択（解析不可）`));
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
    return done(addLog(ctx, `選択効果（${stub.id}）`));
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
  // HAND_REVEAL_CLASS_SIGNI: 手札のクラスシグニを公開（フィルタしてログ）
  if (stub.id === 'HAND_REVEAL_CLASS_SIGNI') {
    const srcHRCS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHRCS = srcHRCS ? (srcHRCS.EffectText ?? '') + ' ' + (srcHRCS.BurstText ?? '') : '';
    const mHRCS = txtHRCS.match(/＜([^＞]+)＞/);
    const classNameHRCS = mHRCS ? mHRCS[1] : '';
    const classSigniHRCS = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (!classNameHRCS || (c.CardClass ?? '').includes(classNameHRCS));
    });
    const namesHRCS = classSigniHRCS.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
    return done(addLog({ ...ctx, lastProcessedCards: classSigniHRCS },
      `手札${classNameHRCS ? '＜' + classNameHRCS + '＞' : 'シグニ'}公開：${namesHRCS || 'なし'}`));
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
  // OPP_SIGNI_TO_DECK_AND_SHUFFLE / OPP_SIGNI_TO_DECK_BY_GATE / OPP_SIGNI_TO_DECK_NTH:
  //   相手シグニをデッキに混ぜる
  if (stub.id === 'OPP_SIGNI_TO_DECK_AND_SHUFFLE' || stub.id === 'OPP_SIGNI_TO_DECK_BY_GATE' || stub.id === 'OPP_SIGNI_TO_DECK_NTH') {
    const candidatesOSTDS = (ctx.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candidatesOSTDS.length === 0) return done(addLog(ctx, '相手シグニなし'));
    const thenOSTDS: StubAction = { type: 'STUB', id: 'INTERNAL_BOUNCE_TO_DECK' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candidatesOSTDS, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: thenOSTDS as EffectAction,
    });
  }
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
  if (stub.id === 'TRASHED_CARD_TO_HAND_OR_ENERGY') {
    const cnTCTHOE = ctx.lastProcessedCards?.[0] ?? ctx.ownerState.trash.at(-1);
    if (!cnTCTHOE) return done(addLog(ctx, 'トラッシュなし'));
    const toHandTCTHOE: TransferToHandAction = {
      type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1 },
    };
    const toEnergyTCTHOE: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_ENERGY' };
    return needsInteraction(ctx, {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'hand', label: '手札に加える', action: toHandTCTHOE as EffectAction, available: true },
        { id: 'energy', label: 'エナゾーンに置く', action: toEnergyTCTHOE as EffectAction, available: true },
      ],
    });
  }
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
  // OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL / OPP_ENERGY_EXCESS_TRASH:
  //   相手エナゾーンが閾値超えなら超過分をトラッシュ
  if (stub.id === 'OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL' || stub.id === 'OPP_ENERGY_EXCESS_TRASH') {
    const toHWOEOT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcOEOT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOEOT = srcOEOT ? (srcOEOT.EffectText ?? '') + ' ' + (srcOEOT.BurstText ?? '') : '';
    const mOEOT = txtOEOT.match(/([０-９\d]+)枚/);
    const limitOEOT = mOEOT ? parseInt(toHWOEOT(mOEOT[1])) : 5;
    const oppEnaOEOT = ctx.otherState.energy;
    if (oppEnaOEOT.length <= limitOEOT) return done(addLog(ctx, `相手エナ${oppEnaOEOT.length}枚≤${limitOEOT}：トラッシュなし`));
    const excessOEOT = oppEnaOEOT.length - limitOEOT;
    const trashOEOT = oppEnaOEOT.slice(limitOEOT);
    const newOtherOEOT: PlayerState = {
      ...ctx.otherState,
      energy: oppEnaOEOT.slice(0, limitOEOT),
      trash: [...ctx.otherState.trash, ...trashOEOT],
    };
    return done(addLog({ ...ctx, otherState: newOtherOEOT }, `相手エナ超過${excessOEOT}枚→トラッシュ`));
  }
  // OPP_ENERGY_COLOR_CONDITION_TRASH: 相手エナの特定色をトラッシュ
  if (stub.id === 'OPP_ENERGY_COLOR_CONDITION_TRASH') {
    const srcOECCT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOECCT = srcOECCT ? (srcOECCT.EffectText ?? '') + ' ' + (srcOECCT.BurstText ?? '') : '';
    const mColorOECCT = txtOECCT.match(/(赤|青|緑|白|黒|無色)/);
    const colorOECCT = mColorOECCT ? mColorOECCT[1] : '';
    const removeOECCT = colorOECCT
      ? ctx.otherState.energy.filter(cn => ctx.cardMap.get(cn)?.Color?.includes(colorOECCT))
      : [];
    if (removeOECCT.length === 0) return done(addLog(ctx, `相手エナに${colorOECCT || '対象'}色なし`));
    const newOtherOECCT: PlayerState = {
      ...ctx.otherState,
      energy: ctx.otherState.energy.filter(cn => !removeOECCT.includes(cn)),
      trash: [...ctx.otherState.trash, ...removeOECCT],
    };
    return done(addLog({ ...ctx, otherState: newOtherOECCT }, `相手${colorOECCT}エナ${removeOECCT.length}枚→トラッシュ`));
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
  // DISCARD_OR_PENALTY: 手札を1枚捨てるかペナルティを選ぶ
  if (stub.id === 'DISCARD_OR_PENALTY') {
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '手札なし（ペナルティ）'));
    const noopDOP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(ctx, {
      type: 'CHOOSE',
      count: 1,
      options: [
        { id: 'discard', label: '手札を1枚捨てる', action: { type: 'STUB', id: 'INTERNAL_TRASH_CARD' } as EffectAction, available: ctx.ownerState.hand.length > 0 },
        { id: 'penalty', label: 'ペナルティを受ける', action: noopDOP as EffectAction, available: true },
      ],
    });
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
  // SIGNI_REPOSITION: 自分のシグニ1体を空きゾーンに移動
  if (stub.id === 'SIGNI_REPOSITION' || stub.id === 'SWAP_OPTIONAL') {
    const signiSR = ctx.ownerState.field.signi ?? [];
    const emptyIdxSR = signiSR.findIndex(s => !s || s.length === 0);
    if (emptyIdxSR < 0) return done(addLog(ctx, '空きゾーンなし（配置替え不可）'));
    const candidatesSR = signiSR.flatMap(stack => (stack && stack.length > 0 ? [stack[stack.length - 1]] : []));
    if (candidatesSR.length === 0) return done(addLog(ctx, 'シグニなし'));
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candidatesSR, count: 1, optional: stub.id === 'SWAP_OPTIONAL',
      targetScope: 'self_field',
      thenAction: { type: 'STUB', id: 'INTERNAL_REPOSITION_MOVE' } as EffectAction,
    });
  }
  // INTERNAL_REPOSITION_MOVE: 選択シグニを空きゾーンへ移動（SIGNI_REPOSITIONの後半）
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
  // EACH_PLAYER_DRAW_DISCARD: 両者がドロー+捨て（ドローのみ実装、捨ては選択省略）
  if (stub.id === 'EACH_PLAYER_DRAW_DISCARD') {
    const toHWEPDD = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcEPDD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtEPDD = srcEPDD ? (srcEPDD.EffectText ?? '') + ' ' + (srcEPDD.BurstText ?? '') : '';
    const mEPDD = txtEPDD.match(/([０-９\d]+)枚引く/);
    const drawNEPDD = mEPDD ? parseInt(toHWEPDD(mEPDD[1])) : 1;
    let ownerEPDD = ctx.ownerState;
    let otherEPDD = ctx.otherState;
    const canDrawOwnEPDD = Math.min(drawNEPDD, ownerEPDD.deck.length);
    ownerEPDD = { ...ownerEPDD, hand: [...ownerEPDD.hand, ...ownerEPDD.deck.slice(0, canDrawOwnEPDD)], deck: ownerEPDD.deck.slice(canDrawOwnEPDD) };
    const canDrawOtherEPDD = Math.min(drawNEPDD, otherEPDD.deck.length);
    otherEPDD = { ...otherEPDD, hand: [...otherEPDD.hand, ...otherEPDD.deck.slice(0, canDrawOtherEPDD)], deck: otherEPDD.deck.slice(canDrawOtherEPDD) };
    return done(addLog({ ...ctx, ownerState: ownerEPDD, otherState: otherEPDD }, `両者${drawNEPDD}枚ドロー`));
  }
  // DRAW_DISCARD_COUNT_PLUS_N: N枚引いてM枚捨てる
  if (stub.id === 'DRAW_DISCARD_COUNT_PLUS_N') {
    const toHWDDCPN = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcDDCPN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDDCPN = srcDDCPN ? (srcDDCPN.EffectText ?? '') + ' ' + (srcDDCPN.BurstText ?? '') : '';
    const mDrawDDCPN = txtDDCPN.match(/([０-９\d]+)枚引く/);
    const mDiscDDCPN = txtDDCPN.match(/([０-９\d]+)枚捨てる/);
    const drawNDDCPN = mDrawDDCPN ? parseInt(toHWDDCPN(mDrawDDCPN[1])) : 1;
    const discNDDCPN = mDiscDDCPN ? parseInt(toHWDDCPN(mDiscDDCPN[1])) : 1;
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
  // END_ATTACK_IF_EXTRA_TURN: 追加ターン獲得時にアタックを終了（BattleScreen側でターン終了時チェック）
  if (stub.id === 'END_ATTACK_IF_EXTRA_TURN') {
    return done(addLog(ctx, '追加ターン時アタック終了（ターン終了時処理）'));
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
  // OPTIONAL_DISCARD_GUARD: 手札を捨ててガード（任意）
  if (stub.id === 'OPTIONAL_DISCARD_GUARD') {
    return done(addLog(ctx, '[任意捨てガード: ガードシステム側未実装]'));
  }
  // ADJACENT_SIGNI_POWER_MOD: 隣接シグニのパワー修正（effectEngine側で動的処理）
  if (stub.id === 'ADJACENT_SIGNI_POWER_MOD') {
    return done(addLog(ctx, '[隣接シグニパワー修正: effectEngineで動的処理]'));
  }

  return done(addLog(ctx, `[STUB: ${stub.id}]`));
}
