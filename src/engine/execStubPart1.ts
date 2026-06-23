import type { PlayerState, PendingInteractionDef, TargetScope } from '../types';
import { parseCardEffects } from '../data/effectParser';
import type {
  EffectAction,
  StubAction,
  DrawAction,
  BanishAction,
  BounceAction,
  TrashAction,
  ShuffleDeckAction,
  AddToFieldAction,
  SequenceAction,
  AddToHandAction,
} from '../types/effects';
import type { ExecCtx, ExecResult } from './execUtils';
import {
  done, addLog, needsInteraction, ownerState, setOwnerState,
  removeFromField, fieldCandidates, selectOrInteract, shuffle, canPayOptionalCost, getCardNum,
  createTokenInstanceId, resolveTokenBase,
} from './execUtils';
import { parseChoiceOptionsFromText } from './choiceTextParser';

export function execStubPart1(
  stub: StubAction,
  ctx: ExecCtx,
  exec: (action: EffectAction, ctx: ExecCtx) => ExecResult,
): ExecResult | null {
  if (stub.id === 'PREVENT_NEXT_DAMAGE' || stub.id === 'PREVENT_NEXT_DAMAGE_THIS_TURN') {
    const newOwner = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン、次のダメージを1回無効'));
  }
  // SET_NEXT_LIFE_CRASH_COUNTER: 「次にあなたのライフクロスがクラッシュされたとき、対戦相手のライフクロスをクラッシュする」
  // 防御用カウンタークラッシュをセット（WX25-P1-004 / WXDi-P12-030）。perTrigger=value(既定1)、remaining=1。
  if (stub.id === 'SET_NEXT_LIFE_CRASH_COUNTER') {
    const perTrigger = typeof stub.value === 'number' ? stub.value : 1;
    const newOwner = { ...ctx.ownerState, life_crash_counter: { remaining: 1, perTrigger } };
    return done(addLog({ ...ctx, ownerState: newOwner },
      `次にあなたのライフクロスがクラッシュされたとき、対戦相手のライフクロスを${perTrigger}枚クラッシュする`));
  }
  if (stub.id === 'NEGATE_ATTACK_ON_TRIGGER') {
    // 発動中のアタックを無効化: prevent_next_damage と同様のフラグで近似
    const newOwner = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'アタックを無効にする'));
  }
  // ゲームプレイに影響しない説明テキストは無音でスキップ
  if (stub.id === 'RULE_REMINDER_TEXT' || stub.id === 'USE_CONDITION_TEXT' || stub.id === 'UNLIMITED_KEYS') {
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
  // TK3_DECLARE_DISCARD: 数字を宣言し、対戦相手の手札から宣言レベルのシグニをすべて捨てさせる
  // （WX25-P1-TK3 ダーク・アナライズ：「数字1つを宣言する。対戦相手の手札を見て、宣言した数字と同じレベルを持つすべてのシグニを捨てさせる」）
  if (stub.id === 'TK3_DECLARE_DISCARD') {
    if (stub.value === undefined || stub.value === null) {
      const options = [1, 2, 3, 4, 5].map(n => ({
        id: `tk3_${n}`, label: `${n}を宣言`,
        action: ({ type: 'STUB', id: 'TK3_DECLARE_DISCARD', value: n } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, '数字を宣言してください（1〜5）'), { type: 'CHOOSE', options, count: 1 });
    }
    const lvlTK3 = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value));
    // 「対戦相手の手札を見て」: 手札全体を閲覧専用モーダルで公開し、確認後に捨てさせる（TK3_DISCARD_BY_LEVEL）。
    return needsInteraction(addLog(ctx, `数字「${lvlTK3}」を宣言：対戦相手の手札を見る`), {
      type: 'REVEAL_CARDS',
      cards: [...ctx.otherState.hand],
      title: `対戦相手の手札（宣言レベル${lvlTK3}のシグニを捨てさせる）`,
      continuation: ({ type: 'STUB', id: 'TK3_DISCARD_BY_LEVEL', value: lvlTK3 } as StubAction) as EffectAction,
    });
  }
  // TK3_DISCARD_BY_LEVEL: REVEAL_CARDS 確認後、宣言レベルのシグニを相手手札からすべて捨てさせる
  if (stub.id === 'TK3_DISCARD_BY_LEVEL') {
    const lvlTD = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value));
    const oppHandTD = ctx.otherState.hand;
    const discardTD = oppHandTD.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && parseInt(c?.Level ?? '0', 10) === lvlTD;
    });
    if (discardTD.length === 0) {
      return done(addLog(ctx, `対戦相手の手札にLv${lvlTD}のシグニなし`));
    }
    const newOtherTD: PlayerState = {
      ...ctx.otherState,
      hand: oppHandTD.filter(cn => !discardTD.includes(cn)),
      trash: [...ctx.otherState.trash, ...discardTD],
      hand_discarded_just: [...(ctx.otherState.hand_discarded_just ?? []), ...discardTD],
    };
    const namesTD = discardTD.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
    return done(addLog({ ...ctx, otherState: newOtherTD },
      `対戦相手のLv${lvlTD}シグニ${discardTD.length}枚を捨てさせる（${namesTD}）`));
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
    // 「クラフトの《X》1枚をこのシグニの下に置く」パターン（給食推進車両 / 虎丸 等）
    // ゲーム外からクラフトトークンを生成し、ソースシグニの下（スタック先頭=下）に重ねる。
    // 「下に《X》がない場合」条件はテキストに含まれるが、既に同名がスタック下にあれば置かない。
    const craftUnderM = txtPCUS.match(/クラフトの《([^》]+)》[０-９\d]*枚?を(?:この)?シグニの下に置く/);
    if (craftUnderM && srcPCUS && resolveTokenBase(ctx.cardMap, craftUnderM[1])) {
      const craftNamePCUS = craftUnderM[1];
      const srcZoneCU = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcPCUS);
      if (srcZoneCU < 0) return done(addLog(ctx, 'このシグニが場にいない'));
      const stackCU = ctx.ownerState.field.signi[srcZoneCU] ?? [];
      // 既に同名クラフトがスタック下にあるなら何もしない（「〜がない場合」条件）
      if (stackCU.some(cn => ctx.cardMap.get(getCardNum(cn))?.CardName === craftNamePCUS)) {
        return done(addLog(ctx, `${craftNamePCUS}は既にこのシグニの下にある`));
      }
      const tokenCU = createTokenInstanceId(ctx.cardMap, craftNamePCUS, ctx.ownerState, ctx.otherState);
      if (!tokenCU) return done(addLog(ctx, `クラフト生成不可（${craftNamePCUS}）`));
      const newSigniCU = [...ctx.ownerState.field.signi] as (string[] | null)[];
      newSigniCU[srcZoneCU] = [tokenCU, ...stackCU]; // 先頭=下に挿入
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniCU } } },
        `クラフト《${craftNamePCUS}》を${effPCUS?.CardName ?? srcPCUS}の下に置いた`));
    }
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
  // BET_MECHANIC: ①②③④選択（ベット時は強化数まで選べる）
  // ベット可否・コイン消費はアーツ使用モーダル側（parseBetCost/is_betting_this_effect、BET_CONDITIONと共通）で
  // 既に確定済みのため、ここで独自に「ベットしますか？」を聞いたりコインを消費したりしない（二重課金防止）。
  if (stub.id === 'BET_MECHANIC') {
    const srcBET = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtBET = srcBET ? (srcBET.EffectText ?? '') + ' ' + (srcBET.BurstText ?? '') : '';
    const toHWBET = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // ①②③④ 選択肢を解析（choiceTextParserに共通化）
    const optsBET = parseChoiceOptionsFromText(txtBET, 'bet_c');
    if (optsBET.length === 0) return done(addLog(ctx, 'ベット（選択肢解析不可）'));
    // 通常時の選択数「以下のNつからMつ(まで)選ぶ」（既定2）
    const baseCntMBET = txtBET.match(/から([１-９\d])つ(?:まで)?(?:を)?選ぶ/);
    const baseCntBET = baseCntMBET ? parseInt(toHWBET(baseCntMBET[1])) : 2;
    if (ctx.ownerState.is_betting_this_effect) {
      // ベット済み（モーダルでコイン消費・宣言済み）→ 強化数「代わりにNつまで選ぶ」を使う
      const enhCntMBET = txtBET.match(/代わりに([１-９\d])つ(?:まで)?(?:を)?選ぶ/);
      const enhCntBET = enhCntMBET ? parseInt(toHWBET(enhCntMBET[1])) : baseCntBET;
      const clearedOwnerBET = { ...ctx.ownerState, is_betting_this_effect: undefined };
      return needsInteraction(addLog({ ...ctx, ownerState: clearedOwnerBET }, `ベット済み→${enhCntBET}択`), {
        type: 'CHOOSE', options: optsBET, count: Math.min(enhCntBET, optsBET.length),
      });
    }
    return needsInteraction(addLog(ctx, `${baseCntBET}択`), {
      type: 'CHOOSE', options: optsBET, count: Math.min(baseCntBET, optsBET.length),
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
  // WD21-007型: 「以下の５つから１つを選ぶ。…対象のシグニ１体は選んだ能力を得る。あなたがベットしていた場合、この効果を１回繰り返す。」
  if (stub.id === 'GRANT_QUOTED_AUTO_ABILITY') {
    const srcW7 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtW7 = srcW7 ? (srcW7.EffectText ?? '') : '';
    if (/以下の[５5]つから[１1]つを選ぶ/.test(txtW7) && /対象のシグニ[１1]体は選んだ能力を得る/.test(txtW7)) {
      const optsW7 = [
        { id: 'w7_1', label: '①【アサシン】を得る', action: ({ type: 'STUB', id: 'INTERNAL_WD007_GRANT', value: 'assassin' } as StubAction) as EffectAction, available: true },
        { id: 'w7_2', label: '②【ランサー】を得る', action: ({ type: 'STUB', id: 'INTERNAL_WD007_GRANT', value: 'lancer' } as StubAction) as EffectAction, available: true },
        { id: 'w7_3', label: '③【ダブルクラッシュ】を得る', action: ({ type: 'STUB', id: 'INTERNAL_WD007_GRANT', value: 'double_crush' } as StubAction) as EffectAction, available: true },
        { id: 'w7_4', label: '④バニッシュされない', action: ({ type: 'STUB', id: 'INTERNAL_WD007_GRANT', value: 'no_banish' } as StubAction) as EffectAction, available: true },
        { id: 'w7_5', label: '⑤対象は（相手シグニ）アタックできない', action: ({ type: 'STUB', id: 'INTERNAL_WD007_GRANT', value: 'cant_attack' } as StubAction) as EffectAction, available: true },
      ];
      return needsInteraction(addLog(ctx, '以下の５つから１つを選ぶ'), { type: 'CHOOSE', options: optsW7, count: 1 });
    }
  }
  // INTERNAL_WD007_GRANT: 選んだ能力に応じた対象（自分シグニ or 相手シグニ）を選択
  if (stub.id === 'INTERNAL_WD007_GRANT') {
    const modeW7 = typeof stub.value === 'string' ? stub.value : '';
    const scopeW7: TargetScope = modeW7 === 'cant_attack' ? 'opp_field' : 'self_field';
    const stateW7 = scopeW7 === 'self_field' ? ctx.ownerState : ctx.otherState;
    const candsW7 = stateW7.field.signi.flatMap(s => (s?.length ? [s[s.length - 1]] : []));
    if (candsW7.length === 0) return done(addLog(ctx, '対象シグニなし'));
    const contW7: StubAction = { type: 'STUB', id: 'INTERNAL_WD007_APPLY', value: modeW7 };
    return selectOrInteract(candsW7, 1, false, scopeW7, contW7 as EffectAction, undefined, ctx);
  }
  // INTERNAL_WD007_APPLY: 選択した対象に能力を付与し、ベットしていれば1回繰り返す
  if (stub.id === 'INTERNAL_WD007_APPLY') {
    const modeW7b = typeof stub.value === 'string' ? stub.value : '';
    const tnW7 = ctx.lastProcessedCards?.[0];
    if (!tnW7) return done(addLog(ctx, '対象なし'));
    const nameW7 = ctx.cardMap.get(tnW7)?.CardName ?? tnW7;
    let curW7 = ctx;
    if (modeW7b === 'cant_attack') {
      const grantsW7 = { ...(curW7.ownerState.keyword_grants ?? {}) };
      grantsW7[tnW7] = [...new Set([...(grantsW7[tnW7] ?? []), 'アタックできない'])];
      curW7 = addLog({ ...curW7, ownerState: { ...curW7.ownerState, keyword_grants: grantsW7 } }, `${nameW7}はアタックできない（ターン終了時まで）`);
    } else if (modeW7b === 'no_banish') {
      const grantedEffW7: import('../types/effects').CardEffect = {
        effectId: `granted-wd007-noBanish-${Date.now()}-${tnW7}`,
        effectType: 'CONTINUOUS',
        duration: 'UNTIL_END_OF_TURN',
        action: { type: 'GRANT_PROTECTION', target: { type: 'SIGNI', owner: 'self', count: 1 }, from: ['BANISH'], sourceOwner: 'opponent', duration: 'UNTIL_END_OF_TURN' },
      };
      const grantedMapW7 = { ...(curW7.ownerState.granted_effects ?? {}) };
      grantedMapW7[tnW7] = [...(grantedMapW7[tnW7] ?? []), grantedEffW7];
      curW7 = addLog({ ...curW7, ownerState: { ...curW7.ownerState, granted_effects: grantedMapW7 } }, `${nameW7}はバニッシュされない（ターン終了時まで）`);
    } else {
      const kwW7 = modeW7b === 'assassin' ? 'アサシン' : modeW7b === 'lancer' ? 'ランサー' : 'ダブルクラッシュ';
      const grantsW7b = { ...(curW7.ownerState.keyword_grants ?? {}) };
      grantsW7b[tnW7] = [...new Set([...(grantsW7b[tnW7] ?? []), kwW7])];
      curW7 = addLog({ ...curW7, ownerState: { ...curW7.ownerState, keyword_grants: grantsW7b } }, `${nameW7}は【${kwW7}】を得る（ターン終了時まで）`);
    }
    // BET_CONDITION: ベットしていれば（他の選択肢・他のシグニで）この効果を1回繰り返す
    if (curW7.ownerState.is_betting_this_effect) {
      curW7 = { ...curW7, ownerState: { ...curW7.ownerState, is_betting_this_effect: undefined }, lastProcessedCards: [] };
      return exec({ type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction, curW7);
    }
    return done(curW7);
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
    const rawTargets: string[] = ctx.lastProcessedCards && ctx.lastProcessedCards.length > 0
      ? ctx.lastProcessedCards
      : allM
        ? ctx.ownerState.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : [])
        : (ctx.sourceCardNum ? [ctx.sourceCardNum] : []);
    // 相手効果による能力取得禁止（PREVENT_OPP_SIGNI_ABILITY_GAIN）の保護チェック
    const abilityGainBlockedGQ = new Set(ctx.otherAbilityGainProtectedNums ?? []);
    const targetCardNums: string[] = abilityGainBlockedGQ.size > 0
      ? rawTargets.filter(cn => !abilityGainBlockedGQ.has(cn))
      : rawTargets;

    // シンプルキーワード付与
    if (grantedKws.length > 0 && targetCardNums.length > 0) {
      // 「あなたのシグニは【シャドウX】を得る」パターン: ルリグが対象でも全フィールドシグニへ
      const allSigniShadowM = txtGQ.match(/あなたのシグニは【(シャドウ[^】]*)】を得る/);
      const isLrigTarget = ctx.ownerState.field.lrig.includes(targetCardNums[0] ?? '');
      let actualTargets = targetCardNums;
      if (allSigniShadowM && isLrigTarget) {
        actualTargets = ctx.ownerState.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : []);
      }
      const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
      for (const cn of actualTargets) {
        grants[cn] = [...new Set([...(grants[cn] ?? []), ...grantedKws])];
      }
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grants } },
        `${grantedKws.join('・')}を付与（${actualTargets.length}体）`));
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

    // ---- 以下は quotedText ありだが既知パターン外のケース ----
    if (quotedText) {
      const toHWGQ = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

      // 「あなたのシグニは【シャドウX】を得る」（quotedText で直接来るケース）
      const allShadowQM = quotedText.match(/あなたのシグニは【(シャドウ[^】]*)】を得る/);
      if (allShadowQM) {
        const shadowKwQ = allShadowQM[1];
        const grantsQ = { ...(ctx.ownerState.keyword_grants ?? {}) };
        for (const stack of ctx.ownerState.field.signi) {
          const top = stack?.at(-1);
          if (top) grantsQ[top] = [...new Set([...(grantsQ[top] ?? []), shadowKwQ])];
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsQ } }, `全シグニに${shadowKwQ}付与`));
      }

      // 「対戦相手のシグニの【自】能力は発動しない」(WXDi-P16-044)
      if (quotedText.match(/対戦相手のシグニの【自】能力は発動しない/)) {
        const newMyBlocked = [...(ctx.ownerState.blocked_actions ?? []), 'BLOCK_OPP_SIGNI_AUTO'];
        const newOtherBlocked = [...(ctx.otherState.blocked_actions ?? []), 'BLOCK_OWN_SIGNI_AUTO:NEXT_TURN'];
        return done(addLog({
          ...ctx,
          ownerState: { ...ctx.ownerState, blocked_actions: newMyBlocked },
          otherState: { ...ctx.otherState, blocked_actions: newOtherBlocked },
        }, '相手シグニ【自】能力ブロック（次ターンも）'));
      }

      // 「対戦相手のシグニの【自】能力が発動する場合、支払わないかぎり何もしない」(SPDi43-01)
      if (quotedText.match(/対戦相手のシグニの【自】能力が発動する場合.*支払わないかぎり.*何もしない/)) {
        const newMyBl = [...(ctx.ownerState.blocked_actions ?? []), 'BLOCK_OPP_SIGNI_AUTO'];
        const newOtherBl = [...(ctx.otherState.blocked_actions ?? []), 'BLOCK_OWN_SIGNI_AUTO:NEXT_TURN'];
        return done(addLog({
          ...ctx,
          ownerState: { ...ctx.ownerState, blocked_actions: newMyBl },
          otherState: { ...ctx.otherState, blocked_actions: newOtherBl },
        }, '相手シグニ【自】能力（コスト払いなし時無効、次ターンも）'));
      }

      // 「対戦相手のカードの【起】能力の使用コストは《無×N》増える」(WXDi-P15-033)
      const actCostM = quotedText.match(/対戦相手のカードの【起】能力の使用コストは《無[×x]([０-９\d]+)》増える/);
      if (actCostM) {
        const n = parseInt(toHWGQ(actCostM[1])) || 1;
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, lrig_opp_act_cost_plus: (ctx.ownerState.lrig_opp_act_cost_plus ?? 0) + n } },
          `相手起動能力コスト《無×${n}》増加`));
      }

      // 「アタックフェイズの間、対戦相手のシグニのパワーをN体につき－Nする」(WX24-P2-030)
      const atkPhaseM = quotedText.match(/アタックフェイズの間.*対戦相手のシグニのパワーを.*つき[－-]([０-９\d]+)する/);
      if (atkPhaseM) {
        const delta = parseInt(toHWGQ(atkPhaseM[1])) || 2000;
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, lrig_attack_phase_power_down_per_signi: delta } },
          `アタックフェイズ中：相手シグニパワー自シグニ×-${delta}付与`));
      }

      // 「このシグニがエナゾーンに置かれる場合、代わりにデッキの一番下に置かれる」(WX25-CP1-003)
      if (quotedText.match(/このシグニがエナゾーンに置かれる場合、代わりにデッキの一番下に置かれる/)) {
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, opp_signi_energy_to_deck_bottom: true } },
          '相手シグニのエナゾーン配置→デッキ下に変更'));
      }

      // 「あなたがダメージを受ける場合、代わりに〜支払ってもよい」(WX24-P4-021)
      if (quotedText.match(/あなたがダメージを受ける場合、代わりに.*支払ってもよい/)) {
        return done(addLog(ctx, 'ダメージ代替コスト付与（ログのみ）'));
      }

      // 「あなたのシグニのパワーを＋Nする」(WXDi-P11-038): E1のPOWER_MODIFYで既処理のため参照のみ
      if (quotedText.match(/あなたのシグニのパワーを＋([０-９\d]+)する/)) {
        return done(addLog(ctx, 'ルリグへのシグニパワー付与能力（effectEngineで処理）'));
      }

      return done(addLog(ctx, `能力付与：「${quotedText.slice(0, 24)}」（ログのみ）`));
    }
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
  // INTERNAL_TRASH_TO_LIFE: 自トラッシュの末尾カードをライフクロスへ追加（近似：相手選択なし）
  if (stub.id === 'INTERNAL_TRASH_TO_LIFE') {
    if (ctx.ownerState.trash.length === 0) return done(addLog(ctx, 'トラッシュが空（INTERNAL_TRASH_TO_LIFE）'));
    const cardNum = ctx.ownerState.trash[ctx.ownerState.trash.length - 1];
    const newOwner = {
      ...ctx.ownerState,
      trash: ctx.ownerState.trash.slice(0, -1),
      life_cloth: [...ctx.ownerState.life_cloth, cardNum],
    };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をライフクロスへ`));
  }
  // ATTACH_CHARM_FROM_TRASH: トラッシュのシグニをチャームとして付与（ログのみ近似）
  if (stub.id === 'ATTACH_CHARM_FROM_TRASH') {
    return done(addLog(ctx, 'チャーム付与（ATTACH_CHARM_FROM_TRASH: 近似・詳細未実装）'));
  }
  // TRASH_ALL_CHARMS_DRAW_CHARGE: 場の全チャームをトラッシュ→同枚数ドロー+エナチャ
  if (stub.id === 'TRASH_ALL_CHARMS_DRAW_CHARGE') {
    const charms = ctx.ownerState.field.signi_charms ?? [null, null, null];
    const charmCards = (charms as (string | null)[]).filter((c): c is string => c !== null);
    if (charmCards.length === 0) return done(addLog(ctx, 'チャームなし（TRASH_ALL_CHARMS_DRAW_CHARGE）'));
    const newCharms: (string | null)[] = [null, null, null];
    const newTrash = [...ctx.ownerState.trash, ...charmCards];
    const drawCount = Math.min(charmCards.length, ctx.ownerState.deck.length);
    const drawnCards = ctx.ownerState.deck.slice(0, drawCount);
    const deckAfterDraw = ctx.ownerState.deck.slice(drawCount);
    const chargeCount = Math.min(charmCards.length, deckAfterDraw.length);
    const chargedCards = deckAfterDraw.slice(0, chargeCount);
    const deckFinal = deckAfterDraw.slice(chargeCount);
    const newOwner = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, signi_charms: newCharms },
      trash: newTrash,
      hand: [...ctx.ownerState.hand, ...drawnCards],
      deck: deckFinal,
      energy: [...ctx.ownerState.energy, ...chargedCards],
    };
    return done(addLog({ ...ctx, ownerState: newOwner },
      `チャーム${charmCards.length}枚トラッシュ→${drawCount}ドロー+${chargeCount}エナチャ`));
  }
  // DRAW_UP_TO_SIX: 手札が6枚未満のとき、6枚になるまでカードを引く（SPK16-13E③用）
  if (stub.id === 'DRAW_UP_TO_SIX') {
    const needDraw = Math.max(0, 6 - ctx.ownerState.hand.length);
    if (needDraw === 0) return done(addLog(ctx, '手札がすでに6枚以上（DRAW_UP_TO_SIX）'));
    const drawCount = Math.min(needDraw, ctx.ownerState.deck.length);
    if (drawCount === 0) return done(addLog(ctx, 'デッキが空（DRAW_UP_TO_SIX）'));
    const drawn = ctx.ownerState.deck.slice(0, drawCount);
    const newOwner = {
      ...ctx.ownerState,
      hand: [...ctx.ownerState.hand, ...drawn],
      deck: ctx.ownerState.deck.slice(drawCount),
    };
    return done(addLog({ ...ctx, ownerState: newOwner }, `${drawCount}枚ドロー（手札6枚まで）`));
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
    // ON_OPP_VIRUS_REMOVED/CHANGED検出用フラグ（取り除いた側=効果オーナーが監視者）
    const newOwnerRV = removed > 0 ? { ...ctx.ownerState, opp_virus_removed_just: true } : ctx.ownerState;
    return done(addLog({ ...ctx, ownerState: newOwnerRV, otherState: newOther }, `ウイルス${removed}つを取り除く`));
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
    const newOwnerIRVN = removed > 0 ? { ...ctx.ownerState, opp_virus_removed_just: true } : ctx.ownerState;
    return done(addLog({ ...ctx, ownerState: newOwnerIRVN, otherState: newOther }, `ウイルス${removed}つを取り除く`));
  }
  // REMOVE_VIRUS_TARGET_ZONE: lastProcessedCards[0]と同じゾーンのウィルスを1個除去（WX15-064型）
  if (stub.id === 'REMOVE_VIRUS_TARGET_ZONE') {
    const targetNumRVTZ = ctx.lastProcessedCards?.[0];
    if (!targetNumRVTZ) return done(addLog(ctx, 'REMOVE_VIRUS_TARGET_ZONE: 対象カードが不明'));
    const virusArrRVTZ = [...(ctx.otherState.field.signi_virus ?? [0, 0, 0])];
    const zoneIdxRVTZ = ctx.otherState.field.signi.findIndex(s => s?.at(-1) === targetNumRVTZ);
    if (zoneIdxRVTZ < 0) return done(addLog(ctx, 'REMOVE_VIRUS_TARGET_ZONE: ゾーン特定不可'));
    if ((virusArrRVTZ[zoneIdxRVTZ] ?? 0) === 0) return done(addLog(ctx, `REMOVE_VIRUS_TARGET_ZONE: ゾーン${zoneIdxRVTZ + 1}にウィルスなし`));
    virusArrRVTZ[zoneIdxRVTZ] = (virusArrRVTZ[zoneIdxRVTZ] ?? 1) - 1;
    const newOtherRVTZ = { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: virusArrRVTZ } };
    const newOwnerRVTZ = { ...ctx.ownerState, opp_virus_removed_just: true };
    return done(addLog({ ...ctx, ownerState: newOwnerRVTZ, otherState: newOtherRVTZ }, `ゾーン${zoneIdxRVTZ + 1}の【ウィルス】を取り除く`));
  }
  // DRAW_IF_POWER_ZERO_TEMP: lastProcessedCards[0]がtemp_power_mods適用後パワー0以下なら1枚引く（WX15-064型）
  if (stub.id === 'DRAW_IF_POWER_ZERO_TEMP') {
    const targetNumDIPZT = ctx.lastProcessedCards?.[0];
    if (!targetNumDIPZT) return done(addLog(ctx, 'DRAW_IF_POWER_ZERO_TEMP: 対象不明'));
    const cardDIPZT = ctx.cardMap.get(targetNumDIPZT);
    const basePowerDIPZT = parseInt(cardDIPZT?.Power ?? '0') || 0;
    const deltaDIPZT = (ctx.otherState.temp_power_mods ?? [])
      .filter(m => m.cardNum === targetNumDIPZT)
      .reduce((s, m) => s + m.delta, 0);
    const effectivePowerDIPZT = basePowerDIPZT + deltaDIPZT;
    if (effectivePowerDIPZT > 0) return done(addLog(ctx, `${cardDIPZT?.CardName ?? targetNumDIPZT}のパワー${effectivePowerDIPZT}のためドローせず`));
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'デッキなし（DRAW_IF_POWER_ZERO_TEMP）'));
    const drawnDIPZT = ctx.ownerState.deck[0];
    const newOwnerDIPZT = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(1), hand: [...ctx.ownerState.hand, drawnDIPZT] };
    return done(addLog({ ...ctx, ownerState: newOwnerDIPZT }, `${cardDIPZT?.CardName ?? targetNumDIPZT}のパワーが${effectivePowerDIPZT}以下のためカードを1枚引く`));
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
    const newCtx = addLog({ ...ctx,
      ownerState: removed > 0 ? { ...ctx.ownerState, opp_virus_removed_just: true } : ctx.ownerState,
      otherState: { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: newVirus } } },
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
    let ctxECRV: typeof ctx = { ...ctx,
      ownerState: removedECRV > 0 ? { ...ctx.ownerState, opp_virus_removed_just: true } : ctx.ownerState,
      otherState: { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: newVirusECRV } } };
    if (removedECRV > 0) ctxECRV = addLog(ctxECRV as import('./execUtils').ExecCtx, `ウイルス${removedECRV}個除去`) as typeof ctx;
    const chooseCount = removeN + 1;
    const srcECRV2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtECRV2 = srcECRV2 ? (srcECRV2.EffectText ?? '') + ' ' + (srcECRV2.BurstText ?? '') : '';
    // ①②③④の効果オプションを解析（choiceTextParserに共通化）
    const optsECRV = parseChoiceOptionsFromText(txtECRV2, 'eff');
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
    // 自分の捨て（インタラクション）→ continuation で相手の捨て
    // （TRASH owner:'opponent' は execTrash が opponentResponds 付きインタラクションに変換する。
    //   以前は PendingInteractionDef を EffectAction として渡しており、executeAction の default で
    //   無言スキップされ相手の捨てが発生しなかった）
    if (newOwner.hand.length === 0) return done(ctxDrawnEPDD0);
    const oppDiscardEPDD0: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } };
    return selectOrInteract(
      newOwner.hand, 1, false, 'self_hand',
      ({ type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } } as TrashAction) as EffectAction,
      newOther.hand.length > 0 ? (oppDiscardEPDD0 as EffectAction) : undefined,
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
        const allPwM = choiceTxtCMCLG.match(/すべてのシグニのパワーを([＋+][０-９\d万]+)/);
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
    const newEnergyDEDUCT = [...ctx.ownerState.energy];
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
    const pickCount = txtRPP.match(/シグニを([０-９\d]+)枚まで場に出/) ? parseInt(toHWR(RegExp.$1)) : 1;
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
  // OPP_REVEAL_SPELL_USE_FREE: 対戦相手のデッキを上からスペルがめくれるまで公開し、
  // めくれたスペルをあなたが手札にあるかのようにコストなし・限定条件無視で使用してもよい。
  // 残り（公開した非スペル）はデッキに戻してシャッフル。使用しなかった場合は相手トラッシュへ。（WX04-015）
  if (stub.id === 'OPP_REVEAL_SPELL_USE_FREE') {
    const deckORS = [...ctx.otherState.deck];
    const revealedORS: string[] = [];
    let hitSpellORS: string | null = null;
    for (const cn of deckORS) {
      revealedORS.push(cn);
      if (ctx.cardMap.get(cn)?.Type === 'スペル') { hitSpellORS = cn; break; }
    }
    // 公開した非スペル＋未公開分をデッキに戻してシャッフル（ヒットスペルはデッキから抜く）
    const notRevealedORS = deckORS.filter(cn => !revealedORS.includes(cn));
    const nonHitRevealedORS = revealedORS.filter(cn => cn !== hitSpellORS);
    const newDeckORS = shuffle([...notRevealedORS, ...nonHitRevealedORS]);
    const ctxORS = { ...ctx, otherState: { ...ctx.otherState, deck: newDeckORS } };
    if (!hitSpellORS) {
      return done(addLog(ctxORS, `相手デッキ公開 ${revealedORS.length}枚：スペルなし（デッキに戻してシャッフル）`));
    }
    const spellNameORS = ctx.cardMap.get(hitSpellORS)?.CardName ?? hitSpellORS;
    const useORS: StubAction = { type: 'STUB', id: 'INTERNAL_USE_OPP_SPELL_FREE', value: hitSpellORS };
    const skipORS: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_SPELL_TO_TRASH', value: hitSpellORS };
    const pendingORS: PendingInteractionDef = {
      type: 'CHOOSE',
      options: [
        { id: 'use', label: `${spellNameORS}を使用する`, action: useORS as EffectAction, available: true },
        { id: 'skip', label: '使用しない（相手トラッシュへ）', action: skipORS as EffectAction, available: true },
      ],
      count: 1,
    };
    return needsInteraction(addLog(ctxORS, `相手デッキ公開 ${revealedORS.length}枚 → スペル: ${spellNameORS}（使用してもよい）`), pendingORS);
  }
  // INTERNAL_USE_OPP_SPELL_FREE: 公開した相手スペルをコストなし・限定条件無視で使用し、使用後は相手トラッシュへ（WX04-015）
  if (stub.id === 'INTERNAL_USE_OPP_SPELL_FREE') {
    const cnUOS = typeof stub.value === 'string' ? stub.value : ctx.lastProcessedCards?.[0];
    if (!cnUOS) return done(addLog(ctx, '[INTERNAL_USE_OPP_SPELL_FREE: 対象スペルなし]'));
    const cardUOS = ctx.cardMap.get(cnUOS);
    // 使用後はそのスペルを対戦相手のトラッシュへ（持ち主＝相手）
    const afterOtherUOS = { ...ctx.otherState, trash: [...ctx.otherState.trash, cnUOS] };
    const ctxUOS = { ...ctx, otherState: afterOtherUOS, sourceCardNum: cnUOS, lastProcessedCards: [] };
    const effsUOS = parseCardEffects(cardUOS!);
    const mainUOS = effsUOS.find(e =>
      e.effectType === 'ACTIVATED' || (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY')));
    if (!mainUOS) return done(addLog(ctxUOS, `${cardUOS?.CardName ?? cnUOS}：効果なし（相手トラッシュへ）`));
    return exec(mainUOS.action, addLog(ctxUOS, `${cardUOS?.CardName ?? cnUOS}をコストなし・限定条件無視で使用（相手トラッシュへ）`));
  }
  // INTERNAL_OPP_SPELL_TO_TRASH: 使用しなかった公開スペルを対戦相手のトラッシュへ（WX04-015）
  if (stub.id === 'INTERNAL_OPP_SPELL_TO_TRASH') {
    const cnOST = typeof stub.value === 'string' ? stub.value : null;
    if (!cnOST) return done(ctx);
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, trash: [...ctx.otherState.trash, cnOST] } },
      `${ctx.cardMap.get(cnOST)?.CardName ?? cnOST}を対戦相手のトラッシュへ`));
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
    // WXK08-028: ライフバーストは発動しない（このゲーム）
    if (txtGA.match(/ライフバーストは発動しない/)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_suppress_lb: true } };
      logsGA.push('ライフバースト全無効（このゲーム）');
    }
    // WXDi-P11-004: メインフェイズ開始時、手札5枚以下ならドロー
    if (txtGA.match(/メインフェイズ開始時.*手札.*5枚以下.*カードを.*引く/)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_main_draw: true } };
      logsGA.push('メインフェイズ開始時ドロー（手札5枚以下・このゲーム）');
    }
    // WX24-P4-036: グロウしたとき1枚ドロー
    if (txtGA.match(/グロウしたとき.*カードを.*引く/)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_grow_draw: true } };
      logsGA.push('グロウ時ドロー（このゲーム）');
    }
    // WX25-P2-005: 手札上限増加
    const handBonusM = txtGA.match(/手札の枚数の上限は([０-９\d]+)増える/);
    if (handBonusM) {
      const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const bonus = parseInt(toHW(handBonusM[1])) || 2;
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_hand_size_bonus: (ctxGA.ownerState.game_hand_size_bonus ?? 0) + bonus } };
      logsGA.push(`手札上限+${bonus}（このゲーム）`);
    }
    // WX25-P2-005: エナフェイズ開始時1枚ドロー
    if (txtGA.match(/エナフェイズ開始時.*カードを.*引く/)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_energy_phase_draw: true } };
      logsGA.push('エナフェイズ開始時ドロー（このゲーム）');
    }
    // WXK07-056: このターン、デッキ内指定クラスのシグニのレベルをN扱い
    const deckLvMGA = txtGA.match(/デッキにある＜([^＞]+)＞のシグニのレベルは([０-９\d]+)になる/);
    if (deckLvMGA) {
      const toHWGA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const lvGA = parseInt(toHWGA(deckLvMGA[2])) || 4;
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, deck_signi_level_override: { class: deckLvMGA[1], level: lvGA } } };
      logsGA.push(`デッキ内＜${deckLvMGA[1]}＞シグニのレベルをLv${lvGA}扱い（このゲーム）`);
    }
    // WXDi-P07-006: このゲームの間コイン獲得禁止
    if (txtGA.match(/《コインアイコン》を得られない/)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_no_coin_gain: true } };
      logsGA.push('コイン獲得禁止（このゲーム）');
    }
    // WXK09-001: 宣言したシグニのレベルを0に
    if (txtGA.match(/宣言したシグニの基本レベルは０になり/)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_declared_signi_level_zero: true } };
      logsGA.push('宣言シグニのレベル0（このゲーム）');
    }
    // WXK09-001: 宣言したシグニの限定条件無視
    if (txtGA.match(/限定条件を無視して場に出せる/)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_declared_signi_ignore_restriction: true } };
      logsGA.push('宣言シグニの限定条件無視（このゲーム）');
    }
    // WXDi-P05-005: 相手ガード時に追加で手札N枚捨てるか《無》支払い
    const oppGuardExtraM = txtGA.match(/対戦相手は追加で手札を([０-９\d]+)枚捨てるか《無》を支払わないかぎり【ガード】ができない/);
    if (oppGuardExtraM) {
      const toHWGA2 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const nGA = parseInt(toHWGA2(oppGuardExtraM[1])) || 1;
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_opp_extra_guard_hand_or_colorless: nGA } };
      logsGA.push(`相手ガード追加コスト（手札${nGA}枚か《無》・このゲーム）`);
    }
    // WXDi-P06-006: ガード代替（手札N枚捨て）
    const guardAltM = txtGA.match(/【ガード】する際.*代わりに手札を([０-９\d]+)枚捨ててもよい/);
    if (guardAltM) {
      const toHWGA3 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const nGA3 = parseInt(toHWGA3(guardAltM[1])) || 3;
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_guard_alt_hand: nGA3 } };
      logsGA.push(`ガード代替：手札${nGA3}枚捨て（このゲーム）`);
    }
    // WXDi-P04-006: ターン終了時、トラッシュから指定クラスのシグニを手札へ
    const turnEndTTHM = txtGA.match(/ターン終了時、.*トラッシュから＜([^＞]+)＞のシグニ([０-９\d]*)枚.*を手札に加える/);
    if (turnEndTTHM) {
      const toHWGA4 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const cntGA4 = turnEndTTHM[2] ? (parseInt(toHWGA4(turnEndTTHM[2])) || 1) : 1;
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_turn_end_trash_to_hand: { class: turnEndTTHM[1], count: cntGA4 } } };
      logsGA.push(`ターン終了時トラッシュ＜${turnEndTTHM[1]}＞シグニ→手札（このゲーム）`);
    }
    // WXDi-P11-010A: グロウフェイズ開始時リミット+N（累積）
    const growLimitM = txtGA.match(/このゲームの間.*リミットを＋([０-９\d]+)する/);
    if (growLimitM) {
      const toHWGA5 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const nGA5 = parseInt(toHWGA5(growLimitM[1])) || 1;
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_grow_phase_limit_plus: nGA5 } };
      logsGA.push(`グロウフェイズ開始時リミット+${nGA5}（このゲーム・累積）`);
    }
    // WX25-P2-001: 対戦相手は追加で《無》を支払わないかぎり【ガード】ができない（このゲーム）
    if (txtGA.match(/対戦相手は追加で《無》を支払わないかぎり【ガード】ができない/)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_opp_guard_extra_colorless: true } };
      logsGA.push('相手ガード追加《無》コスト（このゲーム）');
    }
    // WX25-P2-001: 手札から《ガードアイコン》を持つシグニを捨て→【ルリグバリア】付与能力（このゲーム）
    if (txtGA.match(/手札から《ガードアイコン》を持つシグニを.*捨てる.*【ルリグバリア】/)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_guard_barrier_act: true } };
      logsGA.push('ガードシグニ捨て→ルリグバリア能力付与（このゲーム）');
    }
    // 以下のパターンは意図通り動作するため特定ログのみ
    // このゲームの間、あなたは以下の能力を得る（能力ブロック：後続スタブで処理）
    if (txtGA.match(/このゲームの間、あなたは以下の能力を得る/)) {
      logsGA.push('ゲーム能力ブロック付与');
    }
    // WXK03-003A: この【起】をN回目使用である場合、このルリグを裏返す
    const nthUseM = txtGA.match(/この【起】を使用したのが([０-９\d]+)回目である場合/);
    if (nthUseM) {
      const toHWGA6 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const targetCount = parseInt(toHWGA6(nthUseM[1])) || 5;
      const srcCardNumGA6 = ctx.sourceCardNum ?? '';
      const countMap = { ...(ctxGA.ownerState.lrig_activation_count ?? {}) };
      countMap[srcCardNumGA6] = (countMap[srcCardNumGA6] ?? 0) + 1;
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, lrig_activation_count: countMap } };
      if (countMap[srcCardNumGA6] >= targetCount) {
        logsGA.push(`このルリグを裏返す（${countMap[srcCardNumGA6]}/${targetCount}回目：裏返し実行ログのみ）`);
      } else {
        logsGA.push(`このゲームN回目起動（${countMap[srcCardNumGA6]}/${targetCount}回）`);
      }
    }
    // WXK03-003A: 基本レベルとリミットをセンタールリグと同じ値にコピー
    if (txtGA.match(/基本レベルと基本リミットは.*対象の対戦相手のセンタールリグ.*と同じ値になる/)) {
      ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, lrig_copy_opp_level_limit: true } };
      logsGA.push('ルリグのレベル・リミットを相手センタールリグからコピー（このゲーム）');
    }
    // WXDi-P07-006: このゲームにコインを得ていない場合
    if (txtGA.match(/このゲームの間にあなたが《コインアイコン》を得ていない場合/)) {
      logsGA.push('ゲームコイン未取得条件（ログのみ）');
    }
    if (logsGA.length > 0) return done(addLog(ctxGA, logsGA.join('・')));
    return done(addLog(ctx, 'このゲームの間：能力付与'));
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
      // lastProcessedCards は ExecCtx のフィールド（PlayerState に入れるとDB保存される状態を汚染する）
      const newOwnerDCLS: PlayerState = { ...ctx.ownerState, declared_class: stub.value };
      return done(addLog({ ...ctx, ownerState: newOwnerDCLS, lastProcessedCards: [...(ctx.lastProcessedCards ?? []), stub.value] },
        `クラス「${stub.value}」を宣言`));
    }
    // クラス一覧を自トラッシュ・手札・相手フィールドから動的収集
    const classSetDCLS = new Set<string>();
    const addClassesDCLS = (cn: string) => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'シグニ' || !c.CardClass) return;
      c.CardClass.replace(/[＜＞]/g, '').split(/[・/]/).forEach(cl => {
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
      // Guard列は '1'/'0' 形式（GuardIconというフィールドは存在せず、ガード除外が無効だった）
      if (c.Guard === '1') return false;
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
    const params = (stub as StubAction & { revealPickParams?: { pickCount: number | 'ALL'; restDest: 'deck_bottom' | 'trash' | 'energy'; then: 'hand' | 'energy'; secondPick?: { classContains: string; toMax: number; restDest: 'deck_bottom' | 'trash' } } }).revealPickParams
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
    // then:'energy' なら選んだカードをエナゾーンへ（既定は手札）
    const pickDestAction: EffectAction = params.then === 'energy'
      ? ({ type: 'ADD_TO_ENERGY', owner: 'self' } as EffectAction)
      : ({ type: 'ADD_TO_HAND', owner: 'self' } as AddToHandAction);
    // 2段階ピック（FUTURE SESSION ②）: 1段目で手札に加えたあと、残りから特定クラスを1枚までエナへ。
    // 1段目では restDest を付けず continuation で2段目スタブへ渡す（残りのデッキ下移動は2段目で実施）。
    if (params.secondPick) {
      const pending2: PendingInteractionDef = {
        type: 'SEARCH',
        visibleCards: deckCards,
        maxPick,
        thenAction: pickDestAction,
        continuation: { type: 'STUB', id: 'REVEAL_SECOND_PICK_ENERGY', revealed: deckCards, secondPick: params.secondPick } as EffectAction,
      };
      return needsInteraction(addLog(ctx, `デッキ上${deckCards.length}枚公開（${maxPick}枚まで手札に）`), pending2);
    }
    const pending: PendingInteractionDef = {
      type: 'SEARCH',
      visibleCards: deckCards,
      maxPick,
      thenAction: pickDestAction,
      restDest: params.restDest,
    };
    return needsInteraction(addLog(ctx, `デッキ上${deckCards.length}枚公開（${maxPick}枚まで${params.then === 'energy' ? 'エナへ' : '手札に'}）`), pending);
  }
  // REVEAL_SECOND_PICK_ENERGY: 2段階ピックの2段目。1段目で公開した残りのうち、
  // 指定クラスを toMax 枚までエナゾーンへ、それ以外の残りはデッキ下/トラッシュへ。
  if (stub.id === 'REVEAL_SECOND_PICK_ENERGY') {
    const sp = (stub as StubAction & { secondPick?: { classContains: string; toMax: number; restDest: 'deck_bottom' | 'trash' } }).secondPick
      ?? { classContains: '', toMax: 1, restDest: 'deck_bottom' as const };
    const revealed = (stub as StubAction & { revealed?: string[] }).revealed ?? [];
    // 1段目で手札に加えられず、まだデッキに残っている公開カード
    const remaining = revealed.filter(n => ctx.ownerState.deck.includes(n));
    const matches = remaining.filter(n => (ctx.cardMap.get(getCardNum(n))?.CardClass ?? '').includes(sp.classContains));
    const nonMatches = remaining.filter(n => !matches.includes(n));
    // 非対象の残りを先にデッキ下/トラッシュへ移動（対象の選び残しは下の SEARCH の restDest が処理）
    let cur = ctx;
    if (nonMatches.length > 0) {
      const deckNM = cur.ownerState.deck.filter(n => !nonMatches.includes(n));
      if (sp.restDest === 'trash') {
        cur = addLog({ ...cur, ownerState: { ...cur.ownerState, deck: deckNM, trash: [...cur.ownerState.trash, ...nonMatches] } }, `残り${nonMatches.length}枚をトラッシュへ`);
      } else {
        cur = addLog({ ...cur, ownerState: { ...cur.ownerState, deck: [...deckNM, ...nonMatches] } }, `残り${nonMatches.length}枚をデッキ下へ`);
      }
    }
    if (matches.length === 0) return done(cur);
    const pendingSP: PendingInteractionDef = {
      type: 'SEARCH',
      visibleCards: matches,
      maxPick: sp.toMax,
      thenAction: { type: 'ADD_TO_ENERGY', owner: 'self' } as EffectAction,
      restDest: sp.restDest,
    };
    return needsInteraction(addLog(cur, `${sp.classContains}を${sp.toMax}枚までエナゾーンへ`), pendingSP);
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
          { type: 'LOOK_AND_REORDER', cards: visible, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'top', private: true },
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
      life_cloth: [...st.life_cloth, ...toAdd],
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
      // 「手札から＜クラス＞のシグニをN枚まで捨てる」「手札を好きな枚数捨てる」も対応
      const discardCostMCBDP = txtCBDP.match(/手札(?:から(?:＜([^＞]+)＞の)?(?:シグニ|カード))?を?([０-９\d]+)枚まで捨てる/);
      const discardAnyMCBDP = txtCBDP.match(/手札を好きな枚数捨てる/);
      if (discardCostMCBDP || discardAnyMCBDP) {
        const classCBDP = discardCostMCBDP?.[1];
        const allHandCBDP = ctx.ownerState.hand;
        const handCardsCBDP = classCBDP
          ? allHandCBDP.filter(cn => (ctx.cardMap.get(cn)?.CardClass ?? '').includes(classCBDP))
          : allHandCBDP;
        const maxDiscardCBDP = discardCostMCBDP
          ? parseInt(toHWCBDP(discardCostMCBDP[2]))
          : handCardsCBDP.length;
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
    // 「この方法で捨てたカード１枚につき【エナチャージＮ】」（バン//メモリア等）
    const chargePerICD = txtICD.match(/捨てたカード１枚につき【エナチャージ([０-９\d]+)】/);
    if (chargePerICD) {
      const perN = parseInt(toHWICD(chargePerICD[1])) || 1;
      const chargeCount = Math.min(countICD * perN, ctxICD.ownerState.deck.length);
      const newS: PlayerState = {
        ...ctxICD.ownerState,
        energy: [...ctxICD.ownerState.energy, ...ctxICD.ownerState.deck.slice(0, chargeCount)],
        deck: ctxICD.ownerState.deck.slice(chargeCount),
      };
      return done(addLog({ ...ctxICD, ownerState: newS }, `手札${countICD}枚捨て→エナチャージ${chargeCount}`));
    }
    // 「それのパワーをこの方法で捨てたカード１枚につき－Ｎする」（単体対象×枚数倍、コムラサキ等）
    const pwrPerICD = txtICD.match(/それのパワーを.*捨てたカード１枚につき([＋－][０-９\d]+)/);
    if (pwrPerICD) {
      const delta = parseInt(toHWICD(pwrPerICD[1]).replace('＋', '+').replace('－', '-')) * countICD;
      const firstOpp = ([0, 1, 2] as const)
        .map(i => ctxICD.otherState.field.signi[i]?.at(-1))
        .find((cn): cn is string => !!cn);
      if (!firstOpp) return done(addLog(ctxICD, 'パワー修正：相手シグニなし'));
      const mods = [...(ctxICD.otherState.temp_power_mods ?? []), { cardNum: firstOpp, delta }];
      return done(addLog(
        { ...ctxICD, otherState: { ...ctxICD.otherState, temp_power_mods: mods } },
        `手札${countICD}枚捨て→相手シグニ1体にパワー${delta}`,
      ));
    }
    // 「この方法で捨てたカード１枚につきカードを１枚引く」
    if (txtICD.match(/捨てたカード１枚につきカードを１枚引く/)) {
      const canDraw = Math.min(countICD, ctxICD.ownerState.deck.length);
      const newS: PlayerState = {
        ...ctxICD.ownerState,
        hand: [...ctxICD.ownerState.hand, ...ctxICD.ownerState.deck.slice(0, canDraw)],
        deck: ctxICD.ownerState.deck.slice(canDraw),
      };
      return done(addLog({ ...ctxICD, ownerState: newS }, `手札${countICD}枚捨て→${canDraw}枚ドロー`));
    }
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
    // 公開カードを hand_revealed_just に記録（ON_REVEALED_FROM_HANDトリガー検出用、execStubPart3にハンドラ）
    const markRevealRCS: StubAction = { type: 'STUB', id: 'INTERNAL_MARK_REVEALED_FROM_HAND' };
    return selectOrInteract(handCands, handCands.length, true, 'self_hand', markRevealRCS as EffectAction, undefined, ctx);
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
  return null;
}
