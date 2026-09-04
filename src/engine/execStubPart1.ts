import type { Owner, PlayerState, PendingInteractionDef, TargetScope } from '../types';
import { parseCardEffects } from '../data/effectParser';
import { parseEnergyCosts } from '../data/parserUtils';
import { deployLimitBlockReason, deployLimitLogMessage, effectPlacementSource } from './deployLimit';
import { signiAutoPayGateMarkers } from './blockAction';
import type {
  EffectAction, EffectTarget, StubAction, BanishAction, TrashAction, ShuffleDeckAction, AddToFieldAction, SequenceAction, AddToHandAction, } from '../types/effects';
import type { ExecCtx, ExecResult } from './execUtils';
import {
  done, addLog, needsInteraction, ownerState, setOwnerState,
  removeFromField, fieldCandidates, selectOrInteract, shuffle, getCardNum, matchesFilter,
  createTokenInstanceId, resolveTokenBase, banishDestination, banishRedirectOpts,
  resolveOptionalCostSpec, canAffordOptionalCostSpec, optionalCostPaySteps, optionalCostExtraLabels,
  payBeatSigniCost, payBeatSigniFromTrashCost,
  isOwnTrashMoveLocked,
  sourceAbilityText, fieldCandidatesByOwner, sideOfFieldCard, lrigZoneTops,
  resolveHandCardPick, handCardPickLabel,
} from './execUtils';
import { cloneAcceSlots } from '../utils/acce';
import { parseChoiceOptionsFromText } from './choiceTextParser';
import { payLrigDownCost } from '../screens/battle/lrigDownCost';
import { matchesTrashArtsFromLrigDeckCost } from '../screens/battle/artsTrashCost';

/**
 * カード1枚の **【歌のカケラ】能力（`SONG_ICON`）** を返す（無ければ `undefined`）。
 *
 * 🆕**§5.3 `O-60` 第55バッチ（2026-09-03）＝`SONG_FRAGMENT` の候補判定を原文から外すために切り出した。**
 * 🔴旧は `card.EffectText.includes('【歌のカケラ】')` で候補を決めていたが、これは
 *   **「【歌のカケラ】を持つカード」と書いてあるだけのカード**まで拾う。実測＝原文にこの語を含む26枚のうち
 *   `WX26-CP1-101`（スペル「力を貸して！」＝**自分では歌のカケラを持たず、他のカードのそれを使う側**）が
 *   該当し、エナゾーンにあると候補に出て**トラッシュへ置かれるだけで何も起きない**（カードの丸損）。
 * 🔑`SONG_ICON` は parser が `/【歌のカケラ】：/` から作る効果なので、**構造化された判定と原文が一致する**。
 * ⚠**候補判定と実行で同じ funnel を通す**（別々に判定すると「選べるのに何も起きない」が復活する）。
 * ⚠`effectsMap` → `cardMap.effects`（live JSON） → `parseCardEffects` の順に見る＝
 *   live を持たないテスト経路でも候補が消えない。
 */
function songIconEffectOf(ctx: ExecCtx, instanceId: string): import('../types/effects').CardEffect | undefined {
  const base = getCardNum(instanceId);
  const card = ctx.cardMap.get(base);
  if (!card) return undefined;
  const effs = ctx.effectsMap?.get(instanceId) ?? ctx.effectsMap?.get(base)
    ?? card.effects ?? parseCardEffects(card);
  return effs.find(e => e.effectType === 'SONG_ICON');
}

/**
 * `EXILE_ARTS_FROM_LRIG_DECK_SKIP_SIGNI_STEP` の候補＝ルリグデッキにある「コストの合計が N 以上」のアーツ。
 *
 * ⚠**コストの合計は `parseEnergyCosts` で数える**＝`《白》×１《無》×１` のような表記を色ごとに分解して
 *   個数を合計する（`effectExecutor` の `costThreshold` と同じ数え方に揃える）。素朴な `×(\d+)` の総和だと
 *   《コインアイコン》のような非エナコストを混ぜてしまう。
 * ⚠候補判定と支払いで別々に絞ると「選べるのに払えない」が起きるので、CHOOSE の可否判定と選択肢生成の
 *   両方でこの1関数を通す。
 * 📌**使用中のアーツ自身は候補に入らない**＝`BattleScreen` のアーツ使用は効果解決の**前**に
 *   `lrig_deck` から抜いて `lrig_trash` へ入れる（`paid: { lrig_deck: newLrigDeck, lrig_trash: [...,instanceId] }`）。
 *   `WXK11-001` 自身のコスト合計は2で閾値を満たすため、この順序が崩れると自己除外が起きる。
 */
function exileArtsFromLrigDeckCandidates(
  ctx: ExecCtx,
  spec: { count: number; minTotalCost?: number },
): string[] {
  const min = spec.minTotalCost ?? 0;
  return (ctx.ownerState.lrig_deck ?? []).filter(n => {
    const card = ctx.cardMap.get(getCardNum(n));
    if (card?.Type !== 'アーツ') return false;
    const total = parseEnergyCosts(card.Cost ?? '').reduce((sum, e) => sum + e.count, 0);
    return total >= min;
  });
}

export function execStubPart1(
  stub: StubAction,
  ctx: ExecCtx,
  exec: (action: EffectAction, ctx: ExecCtx) => ExecResult,
  transferToHandTrashCandidates: (target: EffectTarget, ctx: ExecCtx) => string[],
  zoneTargetCandidates: (target: EffectTarget, owner: Owner, ctx: ExecCtx) => string[],
): ExecResult | null {
  // WXDi-P11-010A 夢限 -Q-: reset and flip in one indivisible state write.
  // Field SIGNI leave triggers are collected later by BattleScreen's board diff.
  if (stub.id === 'MUGEN_Q_RESET_AND_FLIP') {
    const lrig = ctx.ownerState.field.lrig;
    const sourceInstance = lrig.at(-1);
    if (!sourceInstance || getCardNum(sourceInstance) !== 'WXDi-P11-010A') {
      return done(addLog(ctx, '夢限 -Q- の反転条件を満たすセンタールリグがないため処理なし'));
    }
    const field = ctx.ownerState.field;
    const cards = (values: Array<string | null | undefined> | undefined): string[] =>
      (values ?? []).filter((value): value is string => typeof value === 'string' && value.length > 0);
    const exiledFromField = [
      ...lrig.slice(0, -1),
      ...field.signi.flatMap(stack => stack ?? []),
      ...cards(field.assist_lrig_l), ...cards(field.assist_lrig_r),
      ...cards([field.key_piece]), ...cards(field.key_piece_extra),
      ...cards(field.signi_charms), ...(field.signi_acce ?? []).flatMap(acce => acce ?? []), ...cards(field.signi_soul),
      ...cards(field.signi_traps), ...cards(field.signi_magic_boxes), ...cards(field.signi_seeds),
      ...cards(field.facedown_signi), ...cards(field.free_zone), ...cards(field.beat_zone),
    ];
    const newOwnerState: PlayerState = {
      ...ctx.ownerState,
      deck: shuffle([...ctx.ownerState.deck, ...ctx.ownerState.hand, ...ctx.ownerState.energy, ...ctx.ownerState.trash]),
      hand: [], energy: [], trash: [], lrig_deck: [],
      excluded: [...(ctx.ownerState.excluded ?? []), ...ctx.ownerState.lrig_deck, ...exiledFromField],
      card_identity_overrides: {
        ...(ctx.ownerState.card_identity_overrides ?? {}),
        [sourceInstance]: 'WXDi-P11-010B',
      },
      // The accumulated modifier belongs specifically to cards named 夢限 -Q-.
      // Once the same physical LRIG is the -A- face, its printed Limit 9 applies.
      game_grow_phase_limit_plus: undefined,
      game_lrig_limit_bonus: undefined,
      field: {
        ...field,
        lrig: [sourceInstance],
        signi: [null, null, null],
        signi_down: [false, false, false], signi_frozen: [false, false, false],
        assist_lrig_l: [], assist_lrig_r: [],
        assist_lrig_l_down: false, assist_lrig_r_down: false,
        key_piece: null, key_piece_extra: [],
        signi_charms: [null, null, null], signi_acce: [null, null, null],
        signi_virus: [0, 0, 0], signi_chokkin: [0, 0, 0],
        signi_soul: [null, null, null], signi_traps: [null, null, null],
        signi_magic_boxes: [null, null, null], signi_seeds: [null, null, null],
        facedown_signi: [null, null, null], signi_armor: [false, false, false],
        puppet_signi: [], free_zone: [], beat_zone: [],
        cross_state: [false, false, false], heaven_state: [false, false, false],
      },
      deck_shuffled_count: (ctx.ownerState.deck_shuffled_count ?? 0) + 1,
    };
    return done(addLog(
      { ...ctx, ownerState: newOwnerState },
      `全領域を再編し、夢限 -Q- が夢限 -A- に反転（${ctx.ownerState.lrig_deck.length + exiledFromField.length}枚をゲームから除外）`,
    ));
  }
  // POWER_PLUS_BANISHED_POWER: 対象のパワーを、そのバニッシュしたシグニのパワーぶん＋する
  if (stub.id === 'POWER_PLUS_BANISHED_POWER') {
    const params = stub.powerPlusBanishedPower;
    const delta = Math.max(0, ctx.banishedSigniPower ?? 0);
    if (!params || delta === 0) return done(ctx);
    return exec({
      type: 'POWER_MODIFY',
      target: params.target,
      delta,
      duration: params.duration,
    }, ctx);
  }
  // VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE: エナゾーンからN枚までトラッシュに置き、この方法で置いた枚数と同じレベルの対戦相手のシグニ1体を手札に戻す
  if (stub.id === 'VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE') {
    const params = stub.variableEnergyTrashLevelBounce;
    if (!params) return done(ctx);
    if (params.resolve) {
      const level = ctx.lastProcessedCards?.length ?? 0;
      if (level === 0) return done(ctx);
      return exec({
        type: 'BOUNCE',
        target: {
          type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false,
          filter: { cardType: 'シグニ', level },
        },
        optional: false,
      }, ctx);
    }
    return exec({
      type: 'SEQUENCE',
      steps: [
        {
          type: 'TRASH',
          target: {
            type: 'ENERGY_CARD', owner: 'self', count: params.maxCount, upToCount: true,
            filter: { story: params.story },
          },
        },
        {
          type: 'STUB', id: stub.id,
          variableEnergyTrashLevelBounce: { ...params, resolve: true },
        },
      ],
    }, ctx);
  }
  if (stub.id === 'STORE_LAST_PROCESSED_TARGETS') {
    return done({ ...ctx, storedTargetCards: [...(ctx.lastProcessedCards ?? [])] });
  }
  // SELECT_TARGET_ONLY（タスク12(liii)）: 「〈シグニ〉１体を対象とし、」だけを行い盤面は一切変えない対象宣言。
  // 「それのレベル１につき〈コスト〉を支払ってもよい」族は、コスト量が対象のレベルで決まるため
  // **対象を先に確定**しないと支払い額を提示できない。従来この宣言を表すステップが無く、対象指定ごと
  // 落ちて count:1 固定になっていた（WX26-CP1-005-E1② 等15効果）。
  // 直後に STORE_LAST_PROCESSED_TARGETS を置いて storedTargetCards へ固定し、OPTIONAL_COST が
  // そのレベルを倍率に使い、支払い後の本体は targetsStored で同じ対象を撃つ、という組で使う。
  // 選択後の適用アクションは INTERNAL_NOOP＝resumeSelectTarget が lastProcessedCards だけを残す。
  // ⚠**対象型を1つでも取りこぼすと丸ごと no-op になる**（`lastProcessedCards: []`→STORE が空→本体が
  //   「対象が確定していない」で降りる＝STUB ですらないので census にも映らない）。
  //   ルリグ対象／「ルリグかシグニ1体」（§6.4 O-28 のアタック税5効果）は候補の作り方だけが違う。
  if (stub.id === 'SELECT_TARGET_ONLY') {
    const tgt = stub.selectTarget;
    if (!tgt) {
      return done({ ...ctx, lastProcessedCards: [] });
    }
    if (tgt.type === 'TRASH_CARD') {
      // §5.3 `O-188`：候補集めは `execTransferToHand` の TRASH_CARD 分岐と**同一の関数**を共有する。
      // ⚠宣言時と実行時で候補がズレると「選んだのに動かない」になるので、自前で書き直さない。
      // ⚠相手トラッシュは今回のスコープ外＝fail-closed のまま（候補0で降りる）。
      if (tgt.owner !== 'self') return done({ ...ctx, lastProcessedCards: [] });
      const cands = transferToHandTrashCandidates(tgt, ctx);
      const count = typeof tgt.count === 'number' ? tgt.count
        : tgt.count === 'ALL' ? cands.length
        : 1;
      return selectOrInteract(cands, count, tgt.upToCount ?? false, 'self_trash',
        { type: 'STUB', id: 'INTERNAL_NOOP' } as StubAction, undefined, ctx,
        false);
    }
    // 🆕**§5.3 `O-96` 第8バッチ（2026-09-02）＝エナゾーンの対象宣言**
    //   （「あなたのエナゾーンから〈名詞句〉１枚を**対象とし**、〈任意コスト〉して**もよい**。
    //     **そうした場合、それを**場に出す」）。
    // ⚠候補集めは `execAddToField` の `ENERGY_CARD` 分岐と**同一関数**を共有する（`TRASH_CARD` と同規約）。
    // ⚠**相手エナは今回のスコープ外**＝fail-closed のまま（候補0で降りる）。
    if (tgt.type === 'ENERGY_CARD') {
      // ⚠`owner` は**エナの持ち主**（相手エナを効果の使用者が選ぶ形＝「対戦相手のエナゾーンから…を対象とし」）。
      //   「**対戦相手は**自分のエナから選び」は別形（`opponentSelects`）＝ここには来ない。
      const ownerEN: Owner = tgt.owner === 'opponent' ? 'opponent' : 'self';
      const cands = zoneTargetCandidates(tgt, ownerEN, ctx);
      const count = typeof tgt.count === 'number' ? tgt.count
        : tgt.count === 'ALL' ? cands.length
        : 1;
      return selectOrInteract(cands, count, tgt.upToCount ?? false,
        ownerEN === 'self' ? 'self_energy' : 'opp_energy',
        { type: 'STUB', id: 'INTERNAL_NOOP' } as StubAction, undefined, ctx,
        false);
    }
    // 🆕**§5.3 `O-220` 第5バッチ（2026-09-02）＝ルリグトラッシュの対象宣言**
    //   （「あなたのルリグトラッシュから〈修飾〉１枚を**対象とし**、〈任意コスト〉して**もよい**。
    //     **そうした場合、それを**ルリグデッキに加える」）。
    // ⚠候補集めは `execTransferToDeck` の `LRIG_TRASH_CARD` 分岐と**同一関数**を共有する。
    if (tgt.type === 'LRIG_TRASH_CARD') {
      const ownerLT: Owner = tgt.owner === 'opponent' ? 'opponent' : 'self';
      const cands = zoneTargetCandidates(tgt, ownerLT, ctx);
      const count = typeof tgt.count === 'number' ? tgt.count
        : tgt.count === 'ALL' ? cands.length
        : 1;
      return selectOrInteract(cands, count, tgt.upToCount ?? false,
        ownerLT === 'self' ? 'self_lrig_trash' : 'opp_lrig_trash',
        { type: 'STUB', id: 'INTERNAL_NOOP' } as StubAction, undefined, ctx,
        false);
    }
    if (tgt.type !== 'SIGNI' && tgt.type !== 'LRIG' && tgt.type !== 'CENTER_LRIG_OR_SIGNI') {
      return done({ ...ctx, lastProcessedCards: [] });
    }
    const state = ownerState(tgt.owner, ctx);
    let selectFilter = tgt.filter;
    if (selectFilter?.powerLteSelfHalf) {
      const { powerLteSelfHalf: _half, ...rest } = selectFilter;
      const sourcePower = ctx.sourceCardNum
        ? (ctx.effectivePowers?.get(ctx.sourceCardNum)
          ?? Number.parseInt(ctx.cardMap.get(getCardNum(ctx.sourceCardNum))?.Power ?? '', 10))
        : Number.NaN;
      selectFilter = Number.isFinite(sourcePower)
        ? { ...rest, powerRange: { ...(rest.powerRange ?? {}), max: sourcePower / 2 } }
        : rest;
    }
    // ⚠センタールリグだけを候補にする（`GRANT_KEYWORD` の同型分岐と同じ近似＝アシストは対象外）。
    const lrigTopSTO = state.field.lrig.at(-1);
    // 🔑`owner:'any'`（修飾語なし「シグニ１体を対象とし」）は `ownerState` が**相手側へ潰す**ので、
    //   両フィールドから候補を集める（`fieldCandidatesByOwner` の規約に合わせる・§6.4 O-34(a)）。
    //   ⚠live に `SELECT_TARGET_ONLY{owner:'any'}` は従来0件＝この分岐は純粋な追加。
    const anySTO = tgt.type === 'SIGNI' && tgt.owner === 'any'
      ? fieldCandidatesByOwner('any', selectFilter, ctx) : null;
    let cands = anySTO ? anySTO.cands
      : tgt.type === 'LRIG'
        ? (lrigTopSTO ? [lrigTopSTO] : [])
        : fieldCandidates(state, selectFilter, ctx.cardMap, ctx.effectivePowers);
    if (tgt.type === 'CENTER_LRIG_OR_SIGNI' && lrigTopSTO) cands = [lrigTopSTO, ...cands];
    if (tgt.filter?.excludeSelf && ctx.sourceCardNum) {
      cands = cands.filter(n => n !== ctx.sourceCardNum);
    }
    // `count:'ALL'`＋`upToCount`＝「好きな数」（0体〜全体）＝候補数を上限にする（§6.4 O-3）。
    const count = typeof tgt.count === 'number' ? tgt.count
      : tgt.count === 'ALL' ? cands.length
      : 1;
    const scope: TargetScope = anySTO ? anySTO.scope : tgt.owner === 'self' ? 'self_field' : 'opp_field';
    // ⚠「**対戦相手は**自分のシグニを〜選ぶ」＝選ぶのは相手＝`opponentResponds`
    //   （落とすと効果の使用者が相手の代わりに選ぶ＝有利な取り違えになる）。
    return selectOrInteract(cands, count, tgt.upToCount ?? false, scope,
      { type: 'STUB', id: 'INTERNAL_NOOP' } as StubAction, undefined, ctx,
      !!stub.opponentSelects && tgt.owner === 'opponent');
  }
  // 盤面を変えない内部マーカー（SELECT_TARGET_ONLY の thenAction 等）。
  if (stub.id === 'INTERNAL_NOOP') return done(ctx);
  // ═══ PLACE_TRASH_SIGNI_FACING_SAME_POWER（§6.4 O-32・`WXDi-CP01-024-E1`）═══
  // 「あなたのトラッシュから**対戦相手の場にあるシグニ１体と同じパワー**の＜X＞のシグニを１枚まで対象とし、
  //  それを**その対戦相手のシグニの正面**のシグニゾーンに出す」。
  // 🔑盤面は左右反転する＝**相手ゾーン zi の正面は自分ゾーン 2-zi**（`collectForcedFrontAttackZones` と同規約）。
  // ⚠**正面が埋まっているペアは最初から候補に入れない**＝選ばせてから「出せません」になるのを防ぐ。
  // ⚠パワー照合は**相手側だけ実効パワー**（`effectivePowers`）を見る。トラッシュのカードには場の修正が
  //   乗らないので印刷値で比べる。
  if (stub.id === 'PLACE_TRASH_SIGNI_FACING_SAME_POWER' || stub.id === 'INTERNAL_PLACE_FACING_SAME_POWER') {
    const clsPFSP = typeof stub.value === 'string' && stub.value ? stub.value : undefined;
    // 「(必要パワー, 正面ゾーン)」の組を作る。
    const pairsPFSP: { power: number; frontZone: number }[] = [];
    for (let zi = 0; zi < 3; zi++) {
      const topPFSP = ctx.otherState.field.signi[zi]?.at(-1);
      if (!topPFSP) continue;
      const frontPFSP = 2 - zi;
      if ((ctx.ownerState.field.signi[frontPFSP] ?? []).length > 0) continue; // 正面が埋まっている
      const pwPFSP = ctx.effectivePowers?.get(topPFSP)
        ?? Number.parseInt(ctx.cardMap.get(getCardNum(topPFSP))?.Power ?? '', 10);
      if (!Number.isFinite(pwPFSP)) continue;
      pairsPFSP.push({ power: pwPFSP, frontZone: frontPFSP });
    }
    const trashPowerOk = (n: string): number | null => {
      const c = ctx.cardMap.get(getCardNum(n));
      if (!c || c.Type !== 'シグニ') return null;
      if (clsPFSP && !(c.CardClass ?? '').includes(clsPFSP)) return null;
      const p = Number.parseInt(c.Power ?? '', 10);
      return Number.isFinite(p) ? p : null;
    };
    // 第2段＝選択済みの1枚を正面ゾーンへ出す。
    if (stub.id === 'INTERNAL_PLACE_FACING_SAME_POWER') {
      const pickPFSP = ctx.lastProcessedCards?.[0];
      if (!pickPFSP) return done(addLog(ctx, '場に出すシグニが選ばれなかった'));
      const pwPick = trashPowerOk(pickPFSP);
      const slotPFSP = pwPick === null ? undefined : pairsPFSP.find(x => x.power === pwPick);
      if (!slotPFSP) return done(addLog(ctx, '同じパワーの相手シグニの正面が空いていない'));
      const namePFSP = ctx.cardMap.get(getCardNum(pickPFSP))?.CardName ?? pickPFSP;
      const blockedPFSP = deployLimitBlockReason({
        placingState: ctx.ownerState, opponentState: ctx.otherState,
        cardNum: pickPFSP, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap,
        contCountCap: ctx.deployCountCapSelf, isPlacingOwnerTurn: ctx.isOwnerTurn,
        placementSource: effectPlacementSource(ctx.sourceCardNum, ctx.cardMap),
      placementSourceCardNum: ctx.sourceCardNum,
      });
      if (blockedPFSP) return done(addLog(ctx, deployLimitLogMessage(blockedPFSP, namePFSP)));
      const signiPFSP = ctx.ownerState.field.signi.map(s => (s ? [...s] : null)) as (string[] | null)[];
      signiPFSP[slotPFSP.frontZone] = [pickPFSP];
      const nextPFSP: PlayerState = {
        ...ctx.ownerState,
        trash: ctx.ownerState.trash.filter(n => n !== pickPFSP),
        field: { ...ctx.ownerState.field, signi: signiPFSP },
      };
      return done(addLog({ ...ctx, ownerState: nextPFSP, lastProcessedCards: [pickPFSP] },
        `${namePFSP}を正面のシグニゾーン${slotPFSP.frontZone + 1}に場に出す`));
    }
    if (pairsPFSP.length === 0) return done(addLog(ctx, '正面が空いている対戦相手のシグニがいない'));
    const candsPFSP = ctx.ownerState.trash.filter(n => {
      const p = trashPowerOk(n);
      return p !== null && pairsPFSP.some(x => x.power === p);
    });
    if (candsPFSP.length === 0) {
      return done(addLog(ctx, `同じパワーの${clsPFSP ? `＜${clsPFSP}＞の` : ''}シグニがトラッシュにない`));
    }
    // 「１枚**まで**」＝任意（0枚でよい）。
    return needsInteraction(addLog(ctx, 'トラッシュから正面へ出すシグニを選ぶ（1枚まで）'), {
      type: 'SELECT_TARGET', candidates: candsPFSP, count: 1, optional: true, targetScope: 'self_trash',
      thenAction: { type: 'STUB', id: 'INTERNAL_PLACE_FACING_SAME_POWER', value: clsPFSP ?? '' } as StubAction as EffectAction,
    });
  }
  // USE_SEARCHED_SPELL_OR_TRASH（§6.4 O-34(b)・`WX20-077-E2`）:
  // 「その後、デッキをシャッフルし、**それをコストを支払わずに使用するかトラッシュに置く**」＝
  // 直前のサーチで見つけたカードを「タダで使う／トラッシュに置く」の二択にする。
  // ⚠**近似**＝サーチ既定の `ADD_TO_HAND` で一度手札を経由する（「探して手に持つ」段階の専用ゾーンが無い）。
  //   どちらを選んでも手札には残らない（使用＝トラッシュへ／不使用＝トラッシュへ）ので最終盤面は正しい。
  // ⚠**「使わない」側は手札に残さない**＝残すと事実上の無条件サーチになる（原文より強い）。
  if (stub.id === 'USE_SEARCHED_SPELL_OR_TRASH') {
    const cnUSST = ctx.lastProcessedCards?.[0];
    if (!cnUSST) return done(addLog(ctx, '探し当てたカードが無いため何も起きない'));
    const nameUSST = ctx.cardMap.get(getCardNum(cnUSST))?.CardName ?? cnUSST;
    return needsInteraction(ctx, {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'use', label: `${nameUSST}をコストを支払わずに使用する`, available: true,
          action: { type: 'STUB', id: 'INTERNAL_USE_SEARCHED_SPELL', value: cnUSST } as StubAction as EffectAction },
        { id: 'trash', label: `${nameUSST}をトラッシュに置く`, available: true,
          action: { type: 'STUB', id: 'INTERNAL_TRASH_SEARCHED_CARD', value: cnUSST } as StubAction as EffectAction },
      ],
    });
  }
  // INTERNAL_USE_SEARCHED_SPELL: `USE_SEARCHED_SPELL_OR_TRASH` の「使う」枝。
  // ⚠**`lastProcessedCards` を CHOOSE 跨ぎで当てにしない**（resume 経路によっては失われる）＝
  //   `value` で束縛した1枚を明示的に復元してからフリープレイ機構へ渡す。
  if (stub.id === 'INTERNAL_USE_SEARCHED_SPELL') {
    const cnIUSS = typeof stub.value === 'string' ? stub.value : ctx.lastProcessedCards?.[0];
    if (!cnIUSS) return done(addLog(ctx, '使用するカードが無い'));
    return exec({ type: 'STUB', id: 'PLAY_SPELL_FROM_HAND_FREE' } as StubAction as EffectAction,
      { ...ctx, lastProcessedCards: [cnIUSS] });
  }
  // INTERNAL_TRASH_SEARCHED_CARD: `USE_SEARCHED_SPELL_OR_TRASH` の「使わない」枝。
  // ⚠CHOOSE を跨ぐと `lastProcessedCards` が残らない経路があるため、対象は `value` で束縛して運ぶ。
  if (stub.id === 'INTERNAL_TRASH_SEARCHED_CARD') {
    const cnITSC = typeof stub.value === 'string' ? stub.value : ctx.lastProcessedCards?.[0];
    if (!cnITSC) return done(addLog(ctx, 'トラッシュに置くカードが無い'));
    const sITSC: PlayerState = {
      ...ctx.ownerState,
      hand: ctx.ownerState.hand.filter(n => n !== cnITSC),
      deck: ctx.ownerState.deck.filter(n => n !== cnITSC),
      trash: ctx.ownerState.trash.includes(cnITSC) ? ctx.ownerState.trash : [...ctx.ownerState.trash, cnITSC],
    };
    return done(addLog({ ...ctx, ownerState: sITSC, lastProcessedCards: [cnITSC] },
      `${ctx.cardMap.get(getCardNum(cnITSC))?.CardName ?? cnITSC}をトラッシュに置いた`));
  }
  // PER_OWN_LRIG_COLOR_SCALE（§6.4 O-34(d)）:「あなたの場にいる〈色〉のルリグ１体につき〈効果〉」＝
  // その色の自ルリグ体数だけ本体を繰り返す。
  // 🔑**数える対象はセンター＋アシスト2枠の最前面**（`lrigZoneTops`）＝「場にいるルリグ」の定義に揃える。
  // ⚠**0体なら本体を一度も実行しない**（従来はスケール節が丸ごと落ちて**無条件で1回**走っていた）。
  // ⚠多色ルリグは色文字列の部分一致で数える（`Color` が「白緑」等の連結表記のため）。
  if (stub.id === 'PER_OWN_LRIG_COLOR_SCALE') {
    const inner = stub.scaleAction;
    const color = stub.scaleColor;
    if (!inner || !color) return done(addLog(ctx, 'PER_OWN_LRIG_COLOR_SCALE: 本体または色が無い'));
    const nPOLCS = lrigZoneTops(ctx.ownerState.field)
      .filter(n => !!n && (ctx.cardMap.get(getCardNum(n))?.Color ?? '').includes(color)).length;
    if (nPOLCS === 0) return done(addLog(ctx, `場に${color}のルリグがいないため何も起きない`));
    const logged = addLog(ctx, `${color}のルリグ${nPOLCS}体ぶん実行`);
    return exec({ type: 'SEQUENCE', steps: Array.from({ length: nPOLCS }, () => inner) } as SequenceAction, logged);
  }
  // STRIP_ATTACHED_AND_UNDER（§6.4 O-34(a)・`WX19-064-E1` 選択肢③）:
  // 「シグニ１体を対象とし、**それに付いているすべてのカード**と、**下に置かれているすべてのカード**を
  //  トラッシュに置く」＝対象シグニ自身は場に残したまま、付随物と下カードだけを剥がす。
  // ⚠既存の `LRIG_UNDER_CARD_OP` は「このシグニ」＝自身専用のカード全文 regex ハンドラなので流用できない。
  // 🔑**剥がし方は `removeFromField` の付随物処理と同じ規約に揃える**＝チャーム／アクセ／下カードは
  //   そのシグニの持ち主のトラッシュへ、**ソウルだけはルリグトラッシュへ**（ソウルはルリグ側のカード）。
  //   ここだけ独自規約にすると同じカードがゾーン往復で別トラッシュへ散る。
  // ⚠**ウィルス／貯菌カウンターはゾーンに属する**ので剥がさない（`removeFromField` と同じ扱い）。
  //   【トラップ】／【マジックボックス】／【シード】も「そのシグニに付いているカード」ではなく
  //   ゾーンに設置された裏向きカードなので対象外。
  if (stub.id === 'STRIP_ATTACHED_AND_UNDER') {
    const targetSAU = stub.stripSelf
      ? ctx.sourceCardNum
      : (ctx.storedTargetCards ?? ctx.lastProcessedCards ?? [])[0];
    if (!targetSAU) return done(addLog(ctx, '付随物を剥がす対象なし'));
    const sideSAU = sideOfFieldCard(targetSAU, ctx);
    const stateSAU = ownerState(sideSAU, ctx);
    const zoneSAU = stateSAU.field.signi.findIndex(s => s?.at(-1) === targetSAU);
    if (zoneSAU < 0) return done(addLog(ctx, '対象シグニが場にいない'));
    const charmsSAU = [...(stateSAU.field.signi_charms ?? [null, null, null])];
    const acceSAU = cloneAcceSlots(stateSAU.field);
    const soulSAU = [...(stateSAU.field.signi_soul ?? [null, null, null])];
    const stackSAU = stateSAU.field.signi[zoneSAU] ?? [];
    const toTrashSAU: string[] = [];
    const toLrigTrashSAU: string[] = [];
    if (charmsSAU[zoneSAU]) { toTrashSAU.push(charmsSAU[zoneSAU]!); charmsSAU[zoneSAU] = null; }
    if (acceSAU[zoneSAU]) { toTrashSAU.push(...acceSAU[zoneSAU]!); acceSAU[zoneSAU] = null; }
    if (soulSAU[zoneSAU]) { toLrigTrashSAU.push(soulSAU[zoneSAU]!); soulSAU[zoneSAU] = null; }
    if (stackSAU.length > 1) toTrashSAU.push(...stackSAU.slice(0, -1));
    if (toTrashSAU.length === 0 && toLrigTrashSAU.length === 0) {
      return done(addLog(ctx, `${ctx.cardMap.get(getCardNum(targetSAU))?.CardName ?? targetSAU}には剥がすカードが無い`));
    }
    const newSigniSAU = stateSAU.field.signi.map((st, i) => (i === zoneSAU && st ? [st[st.length - 1]] : st)) as (string[] | null)[];
    const nextStateSAU: PlayerState = {
      ...stateSAU,
      trash: toTrashSAU.length > 0 ? [...stateSAU.trash, ...toTrashSAU] : stateSAU.trash,
      lrig_trash: toLrigTrashSAU.length > 0 ? [...stateSAU.lrig_trash, ...toLrigTrashSAU] : stateSAU.lrig_trash,
      field: {
        ...stateSAU.field,
        signi: newSigniSAU,
        signi_charms: charmsSAU,
        signi_acce: acceSAU,
        signi_soul: soulSAU as (string | null)[],
      },
    };
    return done(addLog(setOwnerState(sideSAU, nextStateSAU, ctx),
      `${ctx.cardMap.get(getCardNum(targetSAU))?.CardName ?? targetSAU}に付いているカードと下のカード${toTrashSAU.length + toLrigTrashSAU.length}枚をトラッシュに置いた`));
  }
  // 自身を場→ルリグデッキへ戻し、ルリグデッキから fetchCardName（省略時は同名）のカードを同じゾーンへ出す。
  // PR-470A《現実からの逃避 タマ》→《進化する筋肉 紗倉ひびき》（PR-470B）＝**別名カード**なので
  // fetchCardName の名指しが必須（検証是正＝旧・同名フェッチは常に不発で自シグニが消えるだけだった）。
  if (stub.id === 'SELF_TO_LRIG_DECK_AND_FETCH_SAME_NAME') {
    const source = ctx.sourceCardNum;
    const sourceName = source ? ctx.cardMap.get(getCardNum(source))?.CardName : undefined;
    const zone = source ? ctx.ownerState.field.signi.findIndex(stack => stack?.at(-1) === source) : -1;
    if (!source || !sourceName || zone < 0) return done(addLog(ctx, '発生源シグニが場にいない'));
    const fetchName = stub.fetchCardName ?? sourceName;
    const fetched = ctx.ownerState.lrig_deck.find(cn => cn !== source && ctx.cardMap.get(getCardNum(cn))?.CardName === fetchName);
    const signi = ctx.ownerState.field.signi.map(stack => stack ? [...stack] : null);
    const returned = signi[zone]!.pop()!;
    if (signi[zone]!.length === 0) signi[zone] = null;
    const nextLrigDeck = [...ctx.ownerState.lrig_deck, returned];
    // 配置制限（§6.4 続き405 の `deployLimit.ts` funnel）を通す。⚠**同一ゾーンの入れ替えなので体数は不変**
    //   ＝`fieldCountAdjust:1`（この配置と同時に場を空ける1体）で count 制限には掛からないが、
    //   **パワー制限（「パワーN以上のシグニを新たに場に出せない」）は掛かる**＝従来はここだけ素通りしていた。
    const deployBlocked = fetched ? deployLimitBlockReason({
      placingState: ctx.ownerState, opponentState: ctx.otherState,
      cardNum: fetched, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap,
      contCountCap: ctx.deployCountCapSelf, isPlacingOwnerTurn: ctx.isOwnerTurn,
      fieldCountAdjust: 1,
      placementSource: effectPlacementSource(ctx.sourceCardNum, ctx.cardMap),
      placementSourceCardNum: ctx.sourceCardNum,
    }) : null;
    if (fetched && !deployBlocked) {
      const idx = nextLrigDeck.indexOf(fetched);
      if (idx >= 0) nextLrigDeck.splice(idx, 1);
      signi[zone] = [fetched];
    }
    const next = {
      ...ctx.ownerState,
      lrig_deck: nextLrigDeck,
      field: { ...ctx.ownerState.field, signi },
      ...(fetched ? { signi_played_from_non_hand_this_turn: [
        ...(ctx.ownerState.signi_played_from_non_hand_this_turn ?? []).filter(n => n !== fetched), fetched,
      ] } : {}),
    };
    if (deployBlocked) {
      return done(addLog({ ...ctx, ownerState: next, lastProcessedCards: [] },
        deployLimitLogMessage(deployBlocked, `《${fetchName}》`)));
    }
    return done(addLog({ ...ctx, ownerState: next, lastProcessedCards: fetched ? [fetched] : [] }, fetched ? `《${fetchName}》をルリグデッキから場に出した` : `《${fetchName}》がルリグデッキにない`));
  }
  if (stub.id === 'PREVENT_NEXT_DAMAGE' || stub.id === 'PREVENT_NEXT_DAMAGE_THIS_TURN') {
    const newOwner = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン、次のダメージを1回無効'));
  }
  // LIFE_CRASH_PREVENTION: 「このターン、あなたのライフクロスは（ダメージ以外によっては）クラッシュされない」
  // ＝ライフクロスのクラッシュ防止／回数制限（§5.3 O-66）。判定は engine/lifeCrashGate.ts の1本。
  // ⚠ここへ来るのは**アーツ等の INSTANT 宣言だけ**＝【常】は `executeAction` を通らないので
  //   `collectLifeCrashPreventions` が盤面から直接読む（両方見ないと片方だけ効く）。
  // ⚠ペイロードが無い宣言は**何もしない**（fail-closed）＝parser が落としたときに
  //   「あらゆるダメージを無効化する」側へ倒さない。
  if (stub.id === 'LIFE_CRASH_PREVENTION') {
    const spec = stub.lifeCrashPrevention;
    if (!spec) return done(ctx);
    const newOwner = {
      ...ctx.ownerState,
      life_crash_preventions_this_turn: [...(ctx.ownerState.life_crash_preventions_this_turn ?? []), spec],
    };
    const label = spec.maxPerTurn !== undefined
      ? `このターン、あなたのライフクロスは${spec.maxPerTurn}枚までしかクラッシュされない`
      : spec.scope === 'EXCEPT_DAMAGE'
        ? 'このターン、あなたのライフクロスはダメージ以外によってはクラッシュされない'
        : 'このターン、あなたのライフクロスはクラッシュされない';
    return done(addLog({ ...ctx, ownerState: newOwner }, label));
  }
  // SET_NEXT_LIFE_CRASH_COUNTER: 「次にあなたのライフクロスがクラッシュされたとき、対戦相手のライフクロスをクラッシュする」
  // 防御用カウンタークラッシュをセット（WX25-P1-004 / WXDi-P12-030）。perTrigger=value(既定1)、remaining=1。
  if (stub.id === 'SET_NEXT_LIFE_CRASH_COUNTER') {
    const perTrigger = typeof stub.value === 'number' ? stub.value : 1;
    const newOwner = { ...ctx.ownerState, life_crash_counter: { remaining: 1, perTrigger } };
    return done(addLog({ ...ctx, ownerState: newOwner },
      `次にあなたのライフクロスがクラッシュされたとき、対戦相手のライフクロスを${perTrigger}枚クラッシュする`));
  }
  // ディスペア：次の対戦相手ターンだけ、自分の全ゾーンの非LBカードへ指定LBを付与する。
  if (stub.id === 'SET_DISPAIR_BURST_GRANT') {
    const grant: StubAction = {
      type: 'STUB',
      id: 'GRANT_ALL_ZONE_LIFEBURST',
      burstAction: stub.burstAction,
      burstFilter: stub.burstFilter,
      burstAdditive: stub.burstAdditive,
    };
    return done(addLog({
      ...ctx,
      ownerState: { ...ctx.ownerState, allzone_burst_grant_until_opp_turn: grant },
    }, '次の対戦相手ターンの間、全ゾーンの非ライフバーストカードへライフバーストを付与'));
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
    const specOC = resolveOptionalCostSpec(stub, ctx);
    const costColorsOC = specOC.costColors;
    const canAffordOC = canAffordOptionalCostSpec(specOC, ctx);
    // ⚠エナ色以外の対価（自己トラッシュ等）も出す＝§6.4 O-26・続き535（4サイト共通の `optionalCostExtraLabels`）。
    const payPartsOC = [...costColorsOC.map(c => `《${c}》`), ...optionalCostExtraLabels(specOC)];
    const payLabelOC = payPartsOC.length > 0 ? `発動する（${payPartsOC.join('＋')}）` : '発動する';
    const noopOC: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    const payStepsOC = optionalCostPaySteps(specOC);
    const payActionOC: EffectAction = payStepsOC.length === 0 ? noopOC
      : payStepsOC.length === 1 ? payStepsOC[0]
      : { type: 'SEQUENCE', steps: payStepsOC };
    return needsInteraction(addLog(ctx, '任意コスト：発動しますか？'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'pay',  label: payLabelOC, action: payActionOC, available: canAffordOC,
          ...(costColorsOC.length ? { costColors: costColorsOC } : {}) },
        { id: 'skip', label: 'スキップ',  action: noopOC as EffectAction, available: true },
      ],
    });
  }
  // SET_KEY_PLACE_LIMIT: このゲームの間に場へ出せるキーの枚数を N まで引き上げる
  // （`WXK02-004-E3`「このゲームの間、あなたはキーを**２枚まで**場に出すことができる」＝§5.3 `O-200`）。
  // 🔑消費は2地点＝engine の `execPlaceKeyFromLrigDeck`（枠が空いていれば `key_piece_extra` へ積む）と
  //   BattleScreen のキーセット可否ゲート／配置先。
  // ⚠**引き下げない**（`Math.max`）＝重ねて撃っても枠が減らない。
  if (stub.id === 'SET_KEY_PLACE_LIMIT') {
    const limit = typeof stub.value === 'number' ? stub.value : 1;
    const newOwner = { ...ctx.ownerState, key_place_limit: Math.max(ctx.ownerState.key_place_limit ?? 1, limit) };
    return done(addLog({ ...ctx, ownerState: newOwner }, `このゲームの間、キーを${limit}枚まで場に出せる`));
  }
  // TRASH_UNDER_LRIG_CARD: センタールリグの下にあるカード1枚をルリグトラッシュに置く
  // （`WXK09-001-E2` のアップキープ3択の1枝。原文＝「センタールリグの下から対象のカード１枚をルリグトラッシュに置く」）。
  // 🔑移動そのものは `INTERNAL_PAY_EXCEED` と同じ操作（`field.lrig` の最上面より下 → `lrig_trash`）。
  // ⚠**選択UIは出さない近似**＝スタックの最下段（グロウ順の最も古い1枚）を置く。原文は「対象の」だが、
  //   ルリグの下は非公開領域で盤面上の区別が無く、どの1枚でも後続の参照（枚数条件・エクシード原資）は同値。
  // ⚠下にカードが無ければ**何も起きない**（no-op）＝この枝は選べても支払えない（他の2枝がある）。
  if (stub.id === 'TRASH_UNDER_LRIG_CARD') {
    const under = ctx.ownerState.field.lrig.slice(0, -1);
    if (under.length === 0) return done(addLog(ctx, 'センタールリグの下にカードが無い'));
    const moved = under[0];
    const newOwner = {
      ...ctx.ownerState,
      lrig_trash: [...ctx.ownerState.lrig_trash, moved],
      field: { ...ctx.ownerState.field, lrig: ctx.ownerState.field.lrig.filter(n => n !== moved) },
    };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'センタールリグの下からカード1枚をルリグトラッシュへ'));
  }
  if (stub.id === 'INTERNAL_PAY_EXCEED') {
    const count = typeof stub.value === 'number' ? stub.value : 0;
    const pool = [
      ...ctx.ownerState.field.lrig.slice(0, -1),
      ...(ctx.ownerState.field.assist_lrig_l?.slice(0, -1) ?? []),
      ...(ctx.ownerState.field.assist_lrig_r?.slice(0, -1) ?? []),
    ];
    if (pool.length < count) return done(addLog(ctx, `エクシード${count}を支払えない`));
    const paid = new Set(pool.slice(0, count));
    const newOwner = {
      ...ctx.ownerState,
      lrig_trash: [...ctx.ownerState.lrig_trash, ...paid],
      field: {
        ...ctx.ownerState.field,
        lrig: ctx.ownerState.field.lrig.filter(n => !paid.has(n)),
        assist_lrig_l: ctx.ownerState.field.assist_lrig_l?.filter(n => !paid.has(n)),
        assist_lrig_r: ctx.ownerState.field.assist_lrig_r?.filter(n => !paid.has(n)),
      },
    };
    return done(addLog({ ...ctx, ownerState: newOwner }, `エクシード${count}を支払った`));
  }
  if (stub.id === 'INTERNAL_SET_OPTIONAL_EFFECT_TAKEN') {
    return done({ ...ctx, ownerState: { ...ctx.ownerState, self_optional_effect_taken: true } });
  }
  if (stub.id === 'INTERNAL_CLEAR_OPTIONAL_EFFECT_TAKEN') {
    return done({ ...ctx, ownerState: { ...ctx.ownerState, self_optional_effect_taken: false } });
  }
  if (stub.id === 'INTERNAL_PAY_LRIG_DOWN') {
    const cost = stub.lrigDown;
    if (!cost) return done(addLog(ctx, 'ルリグダウンコストを支払えない'));
    const paid = payLrigDownCost(ctx.ownerState, cost, ctx.cardMap);
    if (!paid) return done(addLog(ctx, `ルリグ${cost.count}体をコストでダウンできない`));
    return done(addLog({
      ...ctx,
      ownerState: paid.state,
      lastProcessedCards: paid.paidCards,
    }, `ルリグ${cost.count}体をコストでダウンした`));
  }
  if (stub.id === 'INTERNAL_PAY_LRIG_DOWN_VARIABLE') {
    const count = stub.lrigDownVariableCount ?? 0;
    const paid = payLrigDownCost(ctx.ownerState, { count }, ctx.cardMap);
    if (!paid) return done(addLog(ctx, `ルリグ${count}体をコストでダウンできない`));
    // レベル合計・ダウンしたルリグの記録は payLrigDownCost が state へ書く（単一入口・タスク12(cix)）。
    return done(addLog({
      ...ctx,
      ownerState: paid.state,
      lastProcessedCards: paid.paidCards,
      seqVars: { ...ctx.seqVars, lastDownedLrigLevelSum: paid.levelSum },
    }, `ルリグ${count}体（レベル合計${paid.levelSum}）をコストでダウンした`));
  }
  if (stub.id === 'INTERNAL_PAY_BEAT_SIGNI') {
    let paidState = ctx.ownerState;
    const moved: string[] = [];
    if (stub.beat_signi) {
      if (!ctx.sourceCardNum) return done(addLog(ctx, '【ビート】コストの効果元がありません'));
      const paid = payBeatSigniCost(
        paidState, ctx.sourceCardNum, ctx.cardMap, stub.beat_signi,
      );
      if (!paid.ok) return done(addLog(ctx, paid.log));
      paidState = paid.state;
      moved.push(...paid.moved);
    }
    if (stub.beat_signi_from_trash) {
      const paid = payBeatSigniFromTrashCost(
        paidState, ctx.cardMap,
        stub.beat_signi_from_trash.count, stub.beat_signi_from_trash.filter,
      );
      if (!paid.ok) return done(addLog(ctx, paid.log));
      paidState = paid.state;
      moved.push(...paid.moved);
    }
    return done(addLog({
      ...ctx,
      ownerState: paidState,
      lastProcessedCards: moved,
    }, `【ビート】コストで${moved.length}枚を支払った`));
  }
  if (stub.id === 'INTERNAL_PAY_CHARM_TRASH') {
    const count = stub.charmTrash ?? 0;
    const charms = [...(ctx.ownerState.field.signi_charms ?? [null, null, null])];
    const moved: string[] = [];
    for (let zi = 0; zi < charms.length && moved.length < count; zi++) {
      if (charms[zi]) {
        moved.push(charms[zi]!);
        charms[zi] = null;
      }
    }
    if (moved.length < count) return done(addLog(ctx, `チャーム${count}枚をコストでトラッシュに置けない`));
    return done(addLog({
      ...ctx,
      ownerState: {
        ...ctx.ownerState,
        trash: [...ctx.ownerState.trash, ...moved],
        field: { ...ctx.ownerState.field, signi_charms: charms },
      },
      lastProcessedCards: moved,
    }, `チャーム${count}枚をコストでトラッシュに置いた`));
  }
  if (stub.id === 'INTERNAL_PAY_CHARM_TRASH_VARIABLE') {
    const count = stub.charmTrash ?? 0;
    const charms = [...(ctx.ownerState.field.signi_charms ?? [null, null, null])];
    const moved: string[] = [];
    for (let zi = 0; zi < charms.length && moved.length < count; zi++) {
      if (charms[zi]) { moved.push(charms[zi]!); charms[zi] = null; }
    }
    if (moved.length < count) return done(addLog(ctx, `チャーム${count}枚をコストでトラッシュに置けない`));
    return done(addLog({
      ...ctx,
      ownerState: {
        ...ctx.ownerState,
        trash: [...ctx.ownerState.trash, ...moved],
        field: { ...ctx.ownerState.field, signi_charms: charms },
        last_charm_trash_count: count,
      },
      lastProcessedCards: moved,
    }, `チャーム${count}枚をコストでトラッシュに置いた`));
  }
  if (stub.id === 'INTERNAL_PAY_TRASH_ARTS_FROM_LRIG_DECK') {
    const cost = stub.trashArtsFromLrigDeck;
    if (!cost) return done(addLog(ctx, 'ルリグデッキのアーツコストを支払えない'));
    const candidates = ctx.ownerState.lrig_deck.filter(n =>
      matchesTrashArtsFromLrigDeckCost(ctx.cardMap.get(getCardNum(n)), cost));
    const action: StubAction = {
      type: 'STUB', id: 'INTERNAL_TRASH_SELECTED_ARTS_FROM_LRIG_DECK',
    };
    return selectOrInteract(candidates, cost.count, false, 'self_lrig_deck', action, undefined, ctx);
  }
  if (stub.id === 'INTERNAL_TRASH_SELECTED_ARTS_FROM_LRIG_DECK') {
    const selected = ctx.lastProcessedCards ?? [];
    if (selected.length !== 1) return done(addLog(ctx, 'ルリグデッキのアーツを選べなかった'));
    const cardNum = selected[0];
    const index = ctx.ownerState.lrig_deck.indexOf(cardNum);
    if (index < 0) return done(addLog(ctx, '選んだアーツがルリグデッキにない'));
    const lrigDeck = [...ctx.ownerState.lrig_deck];
    lrigDeck.splice(index, 1);
    return done(addLog({
      ...ctx,
      ownerState: {
        ...ctx.ownerState,
        lrig_deck: lrigDeck,
        lrig_trash: [...ctx.ownerState.lrig_trash, cardNum],
      },
      lastProcessedCards: [cardNum],
    }, 'ルリグデッキからアーツ1枚をコストでルリグトラッシュに置いた'));
  }
  // WXK11-001 ②「あなたのルリグデッキにあるコストの合計が２以上のアーツ１枚をゲームから除外してもよい。
  //   そうした場合、このターン、シグニアタックステップをスキップする。」
  // ⚠**スキップ機構は既に完備**（同カード①のルリグ側が `BLOCK_ACTION{SIGNI_ATTACK_STEP}` で動いている）。
  //   欠けていたのは任意コスト側だけだったので、後段はその BLOCK_ACTION をそのまま `exec` して再利用する。
  // ⚠行先は**ルリグトラッシュではなく `excluded`**＝`trashArtsFromLrigDeck` 族を流用してはいけない。
  if (stub.id === 'EXILE_ARTS_FROM_LRIG_DECK_SKIP_SIGNI_STEP') {
    const specEA = stub.exileArtsFromLrigDeck ?? { count: 1, minTotalCost: 2 };
    const candsEA = exileArtsFromLrigDeckCandidates(ctx, specEA);
    const selectEA: StubAction = { type: 'STUB', id: 'INTERNAL_EXILE_ARTS_FROM_LRIG_DECK_SELECT', exileArtsFromLrigDeck: specEA };
    const noopEA: SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, 'ルリグデッキのアーツ1枚をゲームから除外しますか？'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'exile', label: 'ゲームから除外する（シグニアタックステップをスキップ）', action: selectEA as EffectAction, available: candsEA.length >= specEA.count },
        { id: 'skip', label: 'そうしない', action: noopEA as EffectAction, available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_EXILE_ARTS_FROM_LRIG_DECK_SELECT') {
    const specEAS = stub.exileArtsFromLrigDeck ?? { count: 1, minTotalCost: 2 };
    const candsEAS = exileArtsFromLrigDeckCandidates(ctx, specEAS);
    if (candsEAS.length < specEAS.count) return done(addLog(ctx, '除外できるアーツがルリグデッキにない'));
    const thenEAS: StubAction = { type: 'STUB', id: 'INTERNAL_EXILE_SELECTED_ARTS_AND_SKIP_SIGNI_STEP' };
    return selectOrInteract(candsEAS, specEAS.count, false, 'self_lrig_deck', thenEAS, undefined, ctx);
  }
  if (stub.id === 'INTERNAL_EXILE_SELECTED_ARTS_AND_SKIP_SIGNI_STEP') {
    const selectedEAX = ctx.lastProcessedCards ?? [];
    if (selectedEAX.length === 0) return done(addLog(ctx, '除外するアーツを選べなかった'));
    const lrigDeckEAX = [...ctx.ownerState.lrig_deck];
    const exiledEAX: string[] = [];
    for (const n of selectedEAX) {
      const i = lrigDeckEAX.indexOf(n);
      if (i < 0) continue;
      lrigDeckEAX.splice(i, 1);
      exiledEAX.push(n);
    }
    if (exiledEAX.length === 0) return done(addLog(ctx, '選んだアーツがルリグデッキにない'));
    const afterExileEAX = addLog({
      ...ctx,
      ownerState: {
        ...ctx.ownerState,
        lrig_deck: lrigDeckEAX,
        excluded: [...(ctx.ownerState.excluded ?? []), ...exiledEAX],
      },
      lastProcessedCards: exiledEAX,
    }, `${exiledEAX.map(n => ctx.cardMap.get(getCardNum(n))?.CardName ?? n).join('・')}をルリグデッキからゲームから除外した`);
    // 後段＝①のルリグ側と同じ語彙（相手＝ターンプレイヤーのシグニアタックステップを封じる）。
    return exec({
      type: 'BLOCK_ACTION',
      target: { type: 'PLAYER', owner: 'opponent', count: 1 },
      actionId: 'SIGNI_ATTACK_STEP',
      until: 'END_OF_TURN',
    } as EffectAction, afterExileEAX);
  }
  if (stub.id === 'INTERNAL_PAY_REMOVE_OPP_VIRUS') {
    const count = stub.removeOppVirus ?? 0;
    const virus = [...(ctx.otherState.field.signi_virus ?? [0, 0, 0])];
    let removed = 0;
    for (let zi = 0; zi < virus.length && removed < count; zi++) {
      while (virus[zi] > 0 && removed < count) {
        virus[zi]--;
        removed++;
      }
    }
    if (removed < count) return done(addLog(ctx, `相手の【ウィルス】${count}個をコストで取り除けない`));
    return done(addLog({
      ...ctx,
      ownerState: { ...ctx.ownerState, opp_virus_removed_just: true },
      otherState: { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: virus } },
    }, `相手の【ウィルス】${count}個をコストで取り除いた`));
  }
  // LRIG_UNDER_TRASH_ANY: あなたのルリグ（アシスト含む）の下からカードを好きな枚数選び、ルリグトラッシュに置く
  if (stub.id === 'LRIG_UNDER_TRASH_ANY') {
    const pool = [
      ...ctx.ownerState.field.lrig.slice(0, -1),
      ...(ctx.ownerState.field.assist_lrig_l?.slice(0, -1) ?? []),
      ...(ctx.ownerState.field.assist_lrig_r?.slice(0, -1) ?? []),
    ];
    const action: StubAction = { type: 'STUB', id: 'INTERNAL_LRIG_UNDER_TRASH_SELECTED' };
    return selectOrInteract(pool, pool.length, true, 'self_lrig_under', action, undefined, ctx);
  }
  if (stub.id === 'INTERNAL_LRIG_UNDER_TRASH_SELECTED') {
    const selected = ctx.lastProcessedCards ?? [];
    const moved = new Set(selected);
    const newOwner = {
      ...ctx.ownerState,
      lrig_trash: [...ctx.ownerState.lrig_trash, ...selected],
      field: {
        ...ctx.ownerState.field,
        lrig: ctx.ownerState.field.lrig.filter(n => !moved.has(n)),
        assist_lrig_l: ctx.ownerState.field.assist_lrig_l?.filter(n => !moved.has(n)),
        assist_lrig_r: ctx.ownerState.field.assist_lrig_r?.filter(n => !moved.has(n)),
      },
    };
    return done(addLog({ ...ctx, ownerState: newOwner, lastProcessedCards: selected }, `ルリグの下から${selected.length}枚をトラッシュに置いた`));
  }
  // INTERNAL_MARK_CHOICE_TAKEN: `CHOOSE{noRepeat}`（「まだ選んでいないもの１つを選ぶ」）で
  //   **いま選んだ選択肢**を `taken_choice_keys` に刻む（2026-09-01 続き760・`WXDi-P11-003-E1-GRANT`）。
  //   🔑この STUB は `execChoose` が**実行時に生成する**＝live JSON には現れない（`noRepeat` だけが載る）。
  //   ⚠ターン境界でリセットしない（原文は「このゲームの間」）＝`turnScopedState` にも登録しない。
  if (stub.id === 'INTERNAL_MARK_CHOICE_TAKEN') {
    const keyMCT = typeof stub.value === 'string' ? stub.value : '';
    if (!keyMCT) return done(ctx);
    const prevMCT = ctx.ownerState.taken_choice_keys ?? [];
    if (prevMCT.includes(keyMCT)) return done(ctx);
    return done({ ...ctx, ownerState: { ...ctx.ownerState, taken_choice_keys: [...prevMCT, keyMCT] } });
  }
  // 任意の全件処理（手札全公開／手札・エナ全トラッシュ）の非実行枝。
  // 直前効果の記録を持ち越さず、後続 LAST_PROCESSED_* 条件を確実に不成立にする。
  if (stub.id === 'INTERNAL_SKIP_OPTIONAL_ACTION') {
    // ⚠ ルリグ任意ダウンの非実行枝（value:'lrig_down'）だけは「この方法でダウンしたルリグ」の記録も落とす
    //   （タスク12(cix)）。lastProcessedCards を空にするだけでは、フォールバック先の
    //   PlayerState.last_lrig_down_cards が**別の効果の支払い**を指したままになり、ダウンをスキップしたのに
    //   後続フィルタが当たる＝did-it ゲートが抜ける。他用途の skip では記録を触らない（無関係な効果の
    //   コスト支払い記録まで消さないため）。
    if (stub.value === 'lrig_down') {
      const { last_lrig_down_cards: _c, last_lrig_down_level_sum: _s, ...ownerRest } = ctx.ownerState;
      return done({
        ...addLog({ ...ctx, ownerState: ownerRest }, '任意アクションをスキップ'),
        lastProcessedCards: [],
        seqVars: { ...ctx.seqVars, lastDownedLrigLevel: undefined, lastDownedLrigLevelSum: undefined },
      });
    }
    return done({ ...addLog(ctx, '任意アクションをスキップ'), lastProcessedCards: [] });
  }
  // 他の任意コスト系（SEQUENCEパターン外のフォールバック）
  if (stub.id === 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST' || stub.id === 'OPTIONAL_TRASH_ENERGY_CLASS') {
    return done(addLog(ctx, `任意コスト（${stub.id}：後続ステップで処理）`));
  }
  // 対戦相手任意コスト（相手にCHOOSEを提示し、支払うとフラグを立てる）
  if (stub.id === 'OPPONENT_PAY_OPTIONAL') {
    // 可変《無》コスト（タスク12(lxi) 第8波・`WXK05-009-E2`）は支払う側のアタック回数で決まる。
    // ⚠ここは SEQUENCE 標準ペア外へ落ちたときのフォールバック。同じ解決を入れないと costColors が
    //   空＝costLen 0 で「支払不可」扱いになり、**必ず帰結が撃たれる**過剰実行になる。
    const costLen = stub.opponentPayColorlessPerSigniAttack === true
      ? (ctx.otherState.attacked_signi_ids?.length ?? 0)
      : (stub.costColors?.length ?? 0);
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
  // アーツコスト軽減／置換マーカー（コストはBattleScreen使用時に算出済み）。
  // 「減る/増える」は `computeArtsEffectiveCost` の軽減規則、「《X》に**なる**」＝条件つき置換は
  // 同ファイルの `computeCostReplacement`（タスク12(lxxxi)）が支払い時点で解決する。
  if (stub.id === 'ARTS_COST_REDUCTION_BY_EFFECT' || stub.id === 'ARTS_COST_REDUCTION_BY_CENTER_LRIG') {
    return done(ctx); // コストは支払い時点で計算済み、ここでは何もしない
  }
  // 数字宣言：CHOOSE UI で 1〜5 を選択し declared_number に保存する（ガード制限は伴わない・§6.4 O-41）
  // GAIN_MIKOMIKO_GUARD: 【みこみこ親衛隊】を1つ得る（§5.3 `O-148`・2026-09-02）
  // 🔴**【ウィルス】とは別のカウンタ**＝ウィルスは `field.signi_virus`（シグニゾーン単位）だが、
  //   【みこみこ親衛隊】は「**対戦相手が**得る」＝**プレイヤー単位**。
  //   旧 live は `GRANT_KEYWORD`（シグニへのキーワード付与）に化けており engine のどこにも消費が無かった。
  if (stub.id === 'GAIN_MIKOMIKO_GUARD') {
    const nGMG = typeof stub.value === 'number' ? stub.value : 1;
    // 効果の主語は「対戦相手は〜を得る」＝効果オーナーから見た other 側が得る。
    const newOtherGMG = { ...ctx.otherState, mikomiko_guards: (ctx.otherState.mikomiko_guards ?? 0) + nGMG };
    return done(addLog({ ...ctx, otherState: newOtherGMG },
      `対戦相手は【みこみこ親衛隊】を${nGMG}つ得た（計${newOtherGMG.mikomiko_guards}）`));
  }
  // REMOVE_MIKOMIKO_GUARD: 対戦相手の【みこみこ親衛隊】を好きな数取り除く（§5.3 `O-148`・2026-09-02）
  // ⚠**取り除いた数を `lastProcessedCount` へ載せる**＝後段の「1つにつき－8000」が読む。
  //   カードではなく個数なので `lastProcessedCards` ではなくこちらを使う（`O-148` の先行バッチと同じ規約）。
  if (stub.id === 'REMOVE_MIKOMIKO_GUARD') {
    const haveRMG = ctx.otherState.mikomiko_guards ?? 0;
    if (haveRMG === 0) {
      // 🔴0個のときは対話を出さず、**取り除いた数0**を明示して抜ける
      //   （後段の「1つにつき」が前段の値を引き継いで過剰に効くのを防ぐ）。
      return done(addLog({ ...ctx, lastProcessedCount: 0 }, '対戦相手に【みこみこ親衛隊】が無い'));
    }
    const setRMG = (n: number): StubAction => ({ type: 'STUB', id: 'INTERNAL_REMOVE_MIKOMIKO_GUARD_N', value: n });
    // 「好きな数〜してもよい」＝0個も選べる（0..N）。
    const optsRMG = Array.from({ length: haveRMG + 1 }, (_, n) => ({
      id: String(n), label: `${n}つ取り除く`, action: setRMG(n) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, `【みこみこ親衛隊】をいくつ取り除きますか？（0〜${haveRMG}）`), {
      type: 'CHOOSE', options: optsRMG, count: 1,
    });
  }
  if (stub.id === 'INTERNAL_REMOVE_MIKOMIKO_GUARD_N') {
    const nIRM = Math.max(0, Math.min(typeof stub.value === 'number' ? stub.value : 0, ctx.otherState.mikomiko_guards ?? 0));
    const newOtherIRM = { ...ctx.otherState, mikomiko_guards: (ctx.otherState.mikomiko_guards ?? 0) - nIRM };
    return done(addLog({ ...ctx, otherState: newOtherIRM, lastProcessedCount: nIRM },
      `【みこみこ親衛隊】を${nIRM}つ取り除いた（残り${newOtherIRM.mikomiko_guards}）`));
  }
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
  // DECLARE_TWO_GUARD_LEVELS: 異なるレベルを2つ宣言する（対戦相手はそのレベルのシグニで【ガード】できない）
  if (stub.id === 'DECLARE_TWO_GUARD_LEVELS') {
    const options = [1, 2, 3, 4, 5].map(n => ({
      id: `guard_lv_${n}`, label: `${n}を宣言`,
      action: ({ type: 'STUB', id: 'ADD_DECLARED_GUARD_LEVEL', value: n } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '異なるガード制限レベルを2つ宣言'), {
      type: 'CHOOSE', options, count: 2, multiSelect: true,
    });
  }
  if (stub.id === 'ADD_DECLARED_GUARD_LEVEL') {
    const val = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const levels = [...new Set([...(ctx.ownerState.declared_guard_restrict_levels ?? []), val])];
    return done({ ...ctx, ownerState: { ...ctx.ownerState, declared_guard_restrict_levels: levels } });
  }
  // 数字宣言（宣言できる数字を絞れる版・タスク12(xlvi)(c)）。「数字１つを宣言する。…宣言した数字と同じ
  // レベルを持つシグニを手札に加える」（PR-434）のように宣言値を filter に使うだけの効果はこちら。
  // ⚠**§6.4 O-41 以降、保存先は `DECLARE_NUMBER` と同じ `declared_number`**（ガード制限の巻き添えは解消済み）＝
  //   残る違いは `numberChoices` で選択肢を絞れる点だけ。
  if (stub.id === 'DECLARE_NUMBER_PLAIN') {
    const choices = stub.numberChoices?.length ? [...new Set(stub.numberChoices)] : [1, 2, 3, 4, 5];
    const options = choices.map(n => ({
      id: `numplain_${n}`, label: `${n}を宣言`,
      action: ({ type: 'STUB', id: 'SET_DECLARED_NUMBER_PLAIN', value: n } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '数字を宣言してください（1〜5）'), { type: 'CHOOSE', options, count: 1 });
  }
  if (stub.id === 'SET_DECLARED_NUMBER_PLAIN') {
    const valP = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, declared_number: valP } }, `数字「${valP}」を宣言`));
  }
  // DECLARE_NUMBER の宣言値を PlayerState に格納する。
  // 🔴**2026-08-22（§6.4 O-41）まで `declared_guard_restrict_level` へ書いており、宣言しただけで
  //   「対戦相手はそのレベルのシグニでガードできない」が付いていた**＝`DECLARE_NUMBER` を使う live 30カードの
  //   うち原文にガード制限があるのは2枚（`WX10-009`／`WX19-054`）だけで、残り28枚は原文に無い過剰実行だった
  //   （消費 funnel を通るのは `DECK_TOP_CHECK_LEVEL_HAND` 1本きり）。
  // ⚠**宣言値は `declared_number`／ガード制限は `declared_guard_restrict_level(s)` と役割を分ける**。
  //   ガード制限が要る2枚は原文の該当文が `BLOCK_ACTION{GUARD_LV_DECLARED}` を別に立てる。
  if (stub.id === 'SET_DECLARED_NUMBER') {
    const val = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const newOwner = { ...ctx.ownerState, declared_number: val };
    return done(addLog({ ...ctx, ownerState: newOwner }, `数字「${val}」を宣言`));
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
      // otherState 側＝その相手から見れば「対戦相手の効果によって」（byOwnEffect の否定材料）
      hand_discarded_just_by_opp: discardTD.length > 0 ? true : ctx.otherState.hand_discarded_just_by_opp,
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
  // INTERNAL_DECLARE_DECK_TOP_ICON: 宣言後にデッキの一番上を公開し、外れていたら帰結を実行する（§6.4 O-4）。
  // ⚠公開しても**デッキの順番は変えない**（原文は「公開する」だけで移動を書いていない）。
  if (stub.id === 'INTERNAL_DECLARE_DECK_TOP_ICON') {
    const specDDT = stub.deckTopIcon;
    if (!specDDT) return done(addLog(ctx, 'デッキトップ宣言：宣言内容が取れない'));
    const stDDT = ownerState(specDDT.deckOwner, ctx);
    const topDDT = stDDT.deck[0];
    if (!topDDT) return done(addLog(ctx, 'デッキが空で公開できない'));
    const cardDDT = ctx.cardMap.get(getCardNum(topDDT));
    const actualDDT = (cardDDT?.EffectText ?? '').includes(`《${specDDT.icon}アイコン》：`);
    const declaredDDT = stub.value === 1;
    const loggedDDT = addLog(ctx,
      `公開: ${cardDDT?.CardName ?? topDDT}（《${specDDT.icon}アイコン》${actualDDT ? 'あり' : 'なし'}）`
      + ` / 宣言: ${declaredDDT ? 'あり' : 'なし'} → ${declaredDDT === actualDDT ? '的中' : '外れ'}`);
    return declaredDDT === actualDDT ? done(loggedDDT) : exec(specDDT.onWrongAction, loggedDDT);
  }
  // INTERNAL_APPLY_CARD_NAME_LOCK: 宣言されたカード名を使用禁止（blacklist）／許可（whitelist）へ書き込む。
  // ⚠**封じられる側の state に載せる**（判定 `cardNameUseBlocked` は使う側の state だけを見る）。
  if (stub.id === 'INTERNAL_APPLY_CARD_NAME_LOCK') {
    const specACNL = stub.cardNameLock;
    const nameACNL = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    if (!specACNL || !nameACNL) return done(addLog(ctx, 'カード名宣言：宣言が取れない'));
    const stACNL = ownerState(specACNL.lockedPlayer, ctx);
    const whoACNL = specACNL.lockedPlayer === 'self' ? 'あなた' : '対戦相手';
    if (specACNL.mode === 'whitelist') {
      return done(addLog(setOwnerState(specACNL.lockedPlayer, {
        ...stACNL, arts_name_whitelist_this_turn: [nameACNL],
      }, ctx), `このターン、${whoACNL}は「${nameACNL}」以外のアーツを使用できない`));
    }
    // blacklist。「次のターンの間」は予約フィールドへ（自ターン開始時に昇格する）。
    const keyACNL = specACNL.until === 'NEXT_TURN' ? 'blocked_card_names_next_turn' : 'blocked_card_names';
    const prevACNL = stACNL[keyACNL] ?? [];
    if (prevACNL.includes(nameACNL)) return done(addLog(ctx, `「${nameACNL}」は既に使用禁止`));
    return done(addLog(setOwnerState(specACNL.lockedPlayer, {
      ...stACNL, [keyACNL]: [...prevACNL, nameACNL],
    }, ctx), `${specACNL.until === 'NEXT_TURN' ? '次の' : 'この'}ターン、${whoACNL}は「${nameACNL}」を使用できない`));
  }
  if (stub.id === 'INTERNAL_DECLARE_CARD_NAME') {
    const nameDCN = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const newOwnerIDCN = { ...ctx.ownerState, declared_card_name: nameDCN };
    return done(addLog({ ...ctx, ownerState: newOwnerIDCN }, `「${nameDCN}」を宣言`));
  }
  // PLACE_CARD_UNDER_SIGNI: `placeUnder` が指すものをシグニの下に置く。
  //
  // 🔴**2026-08-26（§5.3 `O-60` 第6バッチ）＝ここはカード全文 regex で3分岐していた。**
  //   どれにも当たらないと「`lastProcessedCards` を丸ごと下に置く」フォールバックへ落ちるため、
  //   **`WX16-003-E2`（手札からカード1枚を裏向きで付ける＝【チャーム】）が、原文と無関係に
  //   直前処理カードを下へ積んでいた**。⇒ parser が `placeUnder{mode,craftName}` を刻む。
  // ⚠**`STACK_SIGNI_UNDER` は live 0 件**だったので分岐から外した（死んだ枝は catch-all の温床）。
  if (stub.id === 'PLACE_CARD_UNDER_SIGNI') {
    const srcPCUS = ctx.sourceCardNum;
    const effPCUS = srcPCUS ? ctx.cardMap.get(getCardNum(srcPCUS)) : undefined;
    const specPCUS = stub.placeUnder;
    if (!specPCUS) return done(addLog(ctx, `[未実装] 置くものが未指定（PLACE_CARD_UNDER_SIGNI・${srcPCUS ?? '?'}）`));
    // クラフト生成＝ゲーム外からトークンを作り、ソースシグニの下（スタック先頭=下）に重ねる。
    // 「下に《X》がない場合」条件は原文側にあり、既に同名がスタック下にあれば置かない。
    if (specPCUS.mode === 'craft' && specPCUS.craftName && srcPCUS && resolveTokenBase(ctx.cardMap, specPCUS.craftName)) {
      const craftNamePCUS = specPCUS.craftName;
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
    if (specPCUS.mode === 'self_under_other' && srcPCUS) {
      const srcZonePCUS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcPCUS);
      if (srcZonePCUS < 0) return done(addLog(ctx, 'このシグニが場にいない'));
      const hostFilterPCUS = stub.selectTarget?.filter;
      const candidatesPCUS = [0, 1, 2]
        .filter(zi => zi !== srcZonePCUS && ctx.ownerState.field.signi[zi]?.length)
        .map(zi => ctx.ownerState.field.signi[zi]!.at(-1)!)
        .filter(cn => !hostFilterPCUS || matchesFilter(ctx.cardMap.get(cn), hostFilterPCUS))
        .filter(Boolean);
      if (candidatesPCUS.length === 0) return done(addLog(ctx, '配置先シグニなし'));
      const placeUnderStub: StubAction = { type: 'STUB', id: 'INTERNAL_PLACE_SELF_UNDER_SIGNI' };
      return selectOrInteract(candidatesPCUS, 1, false, 'self_field', placeUnderStub, undefined, ctx);
    }
    // 「直前に処理したカードをこのシグニの下に置く」パターン（lastProcessedCardsを使用）
    if (specPCUS.mode === 'processed' && ctx.lastProcessedCards && ctx.lastProcessedCards.length > 0 && srcPCUS) {
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
  // INTERNAL_PLACE_SELF_UNDER_SIGNI: 自シグニを選択シグニのスタック下に移動。
  // ⚠同名スタブが execStubPart2 にもあり、そちらは「スペル自身を stub.value のシグニの下に置き
  //   ON_PLACED_UNDER_SIGNI を発火する」別変種（生成元は TRAP_OPERATION の選択肢）。execStub は part1→part2 の
  //   順に引くため、value 付きはここで引き取らずに素通りさせる（従来はここが必ず done を返し、
  //   part2 のハンドラが丸ごと到達不能だった）。value なし＝選択UI経由（上の PLACE_CARD_UNDER_SIGNI）だけを見る。
  if (stub.id === 'INTERNAL_PLACE_SELF_UNDER_SIGNI' && stub.value == null) {
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
  // 🏁**§5.3 `O-60` 第60バッチ（2026-09-03）＝`BET_MECHANIC` ハンドラを撤去した。**
  //   「以下のNつからMつ選ぶ。あなたがベットしていた場合、代わりにKつ選ぶ。①…②…」は
  //   **parser が `CHOOSE{choose_count, betChoose}` を出す**（`effectParser.ts` のベット選択数変更型）。
  //   旧ハンドラは**カード全文**から選択数2本を regex で読み、選択肢は `choiceTextParser` に
  //   カード全文を渡して組み立てていた＝逆翻訳にも live JSON にも①②③が現れない形だった。
  // BET_ALTERNATIVE: ベット強化済みなのでスキップ（BET_MECHANICで処理済み）
  // ⚠**`BET_CONDITION` をここに入れてはいけない**（§6.4 O-21）＝`execStubPart3` に
  //   「ベットしていた場合の追加効果」の**実装がある**のに、この3行の no-op が先着で潰していた
  //   （dispatch は part1 → part2 → part3 の先着勝ち。根拠カード＝`WDK01-010-E1`）。
  if (stub.id === 'BET_ALTERNATIVE') {
    return done(addLog(ctx, 'ベット強化（BET_MECHANICで処理済み）'));
  }
  // DEFERRED_GRANT_QUOTED_ACTIVATE_ABILITY: 引用された【起】能力をプレイヤーが得る（**機構が無い**）。
  // 🆕**§5.3 `O-60` 第55バッチ（2026-09-03）＝カード全文 regex を撤去し、`DEFERRED_` へ改名した。**
  // 🔴旧コメントは「effectEngine の CONTINUOUS 処理で対応」と書いてあったが、
  //   `censusStubs --id GRANT_QUOTED_ACTIVATE_ABILITY` の実測で**消費地点 0＝真 no-op**だった
  //   （ハンドラはカード全文から引用文を切り出してログに出すだけ）。**id が嘘をつく形**だったので改名した。
  // ■要るもの＝**期間つきでプレイヤーが得る【起】能力**の提示（`GRANT_PLAYER_ABILITY` は
  //   `permanent:true` の AUTO 用ストア `game_granted_effects` なので流用できない）。`src/screens/` 側。
  if (stub.id === 'DEFERRED_GRANT_QUOTED_ACTIVATE_ABILITY') {
    return done(addLog(ctx, '[未実装] 引用された【起】能力の付与（DEFERRED_GRANT_QUOTED_ACTIVATE_ABILITY）'));
  }
  // WD21-007型: 「以下の５つから１つを選ぶ。…対象のシグニ１体は選んだ能力を得る。あなたがベットしていた場合、この効果を１回繰り返す。」
  // 🆕**§5.3 `O-60` 第46バッチ（2026-09-03）＝専用 id に分けてカード全文 regex を撤去した。**
  // 🔴旧は汎用 id `GRANT_QUOTED_AUTO_ABILITY`（live 4効果・parser 生成地点30箇所超）のハンドラの中で
  //   **カード全文**に `/以下の[５5]つから[１1]つを選ぶ/` を当ててこのカードだけを識別しており、
  //   残る3カード（`PR-K076`／`WXDi-CP02-TK03A`／`WXK03-042`）は門を通れず**黙って落ちて**いた。
  //   （3カードは `effectEngine.collectGrantedFromLayer` が別経路で消費する＝B群。）
  // CHOOSE_GRANT_FIVE_KEYWORDS: 以下の5つから1つを選び、対象のシグニ1体が選んだ能力を得る（ベット時はもう1回）
  if (stub.id === 'CHOOSE_GRANT_FIVE_KEYWORDS') {
    {
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
      curW7 = { ...curW7, ownerState: { ...curW7.ownerState, is_betting_this_effect: undefined, is_boosting_this_effect: undefined }, lastProcessedCards: [] };
      return exec({ type: 'STUB', id: 'CHOOSE_GRANT_FIVE_KEYWORDS' } as StubAction, curW7);
    }
    return done(curW7);
  }
  // SIGNI_GRANT_CHOSEN_ABILITY: WXK09-050 コードアート Ｒ・Ｌ・Ｃ【出】。
  //   「以下の２つから１つを選ぶ。表記されているパワーよりパワーの高いあなたの＜電機＞のシグニ１体を対象とし、
  //    ターン終了時まで、それは選んだ能力を得る。①対戦相手の効果によってダウンしない ②対戦相手の効果によって手札に戻らない」
  //   CHOOSE(2) → 対象選択（＜電機＞・現在パワー>表記パワー）→ GRANT_PROTECTION(DOWN/BOUNCE) を granted_effects に付与。
  if (stub.id === 'SIGNI_GRANT_CHOSEN_ABILITY') {
    const optsGCA = [
      { id: 'gca_down', label: '①対戦相手の効果によってダウンしない', action: ({ type: 'STUB', id: 'INTERNAL_GCA_SELECT', value: 'down' } as StubAction) as EffectAction, available: true },
      { id: 'gca_bounce', label: '②対戦相手の効果によって手札に戻らない', action: ({ type: 'STUB', id: 'INTERNAL_GCA_SELECT', value: 'bounce' } as StubAction) as EffectAction, available: true },
    ];
    return needsInteraction(addLog(ctx, '以下の２つから１つを選ぶ'), { type: 'CHOOSE', options: optsGCA, count: 1 });
  }
  // INTERNAL_GCA_SELECT: 表記パワーより現在パワーが高いあなたの＜電機＞シグニ１体を対象に選ぶ
  if (stub.id === 'INTERNAL_GCA_SELECT') {
    const modeGCA = typeof stub.value === 'string' ? stub.value : '';
    const candsGCA = ctx.ownerState.field.signi.flatMap(s => {
      if (!s?.length) return [];
      const cn = s[s.length - 1];
      const card = ctx.cardMap.get(cn);
      if (!card?.CardClass?.includes('電機')) return [];
      const printed = parseInt(card.Power ?? '0', 10) || 0;
      const effPw = ctx.effectivePowers?.get(cn) ?? printed;
      return effPw > printed ? [cn] : [];
    });
    if (candsGCA.length === 0) return done(addLog(ctx, '表記より高いパワーの＜電機＞シグニなし（能力付与なし）'));
    const contGCA: StubAction = { type: 'STUB', id: 'INTERNAL_GCA_APPLY', value: modeGCA };
    return selectOrInteract(candsGCA, 1, false, 'self_field', contGCA as EffectAction, undefined, ctx);
  }
  // INTERNAL_GCA_APPLY: 選んだ保護（ダウン/バウンス）をターン終了時まで付与
  if (stub.id === 'INTERNAL_GCA_APPLY') {
    const modeGCAb = typeof stub.value === 'string' ? stub.value : '';
    const tnGCA = ctx.lastProcessedCards?.[0];
    if (!tnGCA) return done(addLog(ctx, '対象なし'));
    const nameGCA = ctx.cardMap.get(tnGCA)?.CardName ?? tnGCA;
    const fromGCA = modeGCAb === 'bounce' ? 'BOUNCE' : 'DOWN';
    const labelGCA = modeGCAb === 'bounce' ? '手札に戻らない' : 'ダウンしない';
    const grantedEffGCA: import('../types/effects').CardEffect = {
      effectId: `granted-wxk09050-${modeGCAb}-${Date.now()}-${tnGCA}`,
      effectType: 'CONTINUOUS',
      duration: 'UNTIL_END_OF_TURN',
      action: { type: 'GRANT_PROTECTION', target: { type: 'SIGNI', owner: 'self', count: 1 }, from: [fromGCA], sourceOwner: 'opponent', duration: 'UNTIL_END_OF_TURN' },
    };
    const grantedMapGCA = { ...(ctx.ownerState.granted_effects ?? {}) };
    grantedMapGCA[tnGCA] = [...(grantedMapGCA[tnGCA] ?? []), grantedEffGCA];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, granted_effects: grantedMapGCA } },
      `${nameGCA}は対戦相手の効果によって${labelGCA}（ターン終了時まで）`));
  }
  // BANISH_ATTACKER_IF_WEAKER_THAN_FRONT: WD07-012 コードアンチ ヴィマナ【自】。
  //   「対戦相手のシグニがアタックしたとき、そのシグニのパワーがそのシグニの正面のシグニのパワーより低い場合、
  //    アタックしたそのシグニをバニッシュする。」triggeringCardNum＝アタックした相手シグニ。
  //   その正面（ownerState の鏡像ゾーン 2-zone）のシグニとパワーを比較し、低ければアタッカーをバニッシュ。
  if (stub.id === 'BANISH_ATTACKER_IF_WEAKER_THAN_FRONT') {
    const attackerBAW = ctx.triggeringCardNum;
    if (!attackerBAW) return done(addLog(ctx, 'アタッカー不明（BANISH_ATTACKER_IF_WEAKER_THAN_FRONT）'));
    const ziBAW = ctx.otherState.field.signi.findIndex(s => s?.at(-1) === attackerBAW);
    if (ziBAW < 0) return done(addLog(ctx, 'アタッカーが場にいない'));
    const frontBAW = ctx.ownerState.field.signi[2 - ziBAW]?.at(-1);
    if (!frontBAW) return done(addLog(ctx, '正面シグニなし（バニッシュなし）'));
    const atkPwBAW = ctx.effectivePowers?.get(attackerBAW) ?? (parseInt(ctx.cardMap.get(attackerBAW)?.Power ?? '0', 10) || 0);
    const frontPwBAW = ctx.effectivePowers?.get(frontBAW) ?? (parseInt(ctx.cardMap.get(frontBAW)?.Power ?? '0', 10) || 0);
    if (atkPwBAW >= frontPwBAW) {
      return done(addLog(ctx, `アタッカー(${atkPwBAW})は正面(${frontPwBAW})未満でない＝バニッシュなし`));
    }
    const { state: newOtherBAW, log: logBAW } = banishDestination(removeFromField(attackerBAW, ctx.otherState), ctx.ownerState, attackerBAW, banishRedirectOpts(ctx, ctx.otherState, attackerBAW));
    return done(addLog({ ...ctx, otherState: newOtherBAW },
      `${ctx.cardMap.get(attackerBAW)?.CardName ?? attackerBAW}${logBAW}（正面より低パワー）`));
  }
  // INTERNAL_GRANT_ATTACK_BANISH_TO_ARMORED: WXK04-030 血晶の紅雨。
  //   あなたの血晶武装状態のすべてのシグニに「【自】このシグニがアタックしたとき、自パワー以下の対戦相手のシグニ1体をバニッシュ」を
  //   ターン終了時まで付与する。granted_effects（instanceId単位）に積むと effectsMap マージ経由でアタックトリガー収集が拾う。
  if (stub.id === 'INTERNAL_GRANT_ATTACK_BANISH_TO_ARMORED') {
    const armoredTops = ctx.ownerState.field.signi.flatMap((s, i) =>
      (ctx.ownerState.field.signi_armor?.[i] && s?.at(-1)) ? [s.at(-1)!] : []);
    if (armoredTops.length === 0) return done(addLog(ctx, '血晶武装シグニなし（能力付与なし）'));
    const grantedMapKKB = { ...(ctx.ownerState.granted_effects ?? {}) };
    let seqKKB = 0;
    for (const tnKKB of armoredTops) {
      const grantedEffKKB: import('../types/effects').CardEffect = {
        effectId: `granted-wxk04030-${tnKKB}-${Date.now()}-${seqKKB++}`,
        effectType: 'AUTO',
        timing: ['ON_ATTACK_SIGNI'],
        triggerScope: 'self',
        duration: 'UNTIL_END_OF_TURN',
        action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerLteSelf: true }, upToCount: false } },
        mandatory: true,
        parseStatus: 'MANUAL',
      };
      grantedMapKKB[tnKKB] = [...(grantedMapKKB[tnKKB] ?? []), grantedEffKKB];
    }
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, granted_effects: grantedMapKKB } },
      `血晶武装シグニ${armoredTops.length}体に「アタック時バニッシュ」を付与（ターン終了時まで）`));
  }
  // ── 🆕**§5.3 `O-60` 第62バッチ（2026-09-03）＝「次の対戦相手のターン終了時まで、このルリグは
  //   「【常】：〈Q〉」を得る」family（5効果）**。引用の中身は engine のグローバルな宣言に落ちるので、
  //   **どの宣言かは parser が決めて payload で渡す**（旧 `GRANT_ABILITY_INNER_TEXT` の引用 regex 4本＋1本）。
  //   ⚠**状態書き込みは旧実装と1バイトも同じ**にしてある（この巡は経路の移設だけ）。
  //   ⚠**payload が無ければ何もしない**（fail-closed）。

  // LRIG_GAIN_BLOCK_OPP_SIGNI_AUTO: 次の対戦相手のターン終了時まで、対戦相手のシグニの【自】能力は発動しない
  //   （`WXDi-P16-044-E2`）
  if (stub.id === 'LRIG_GAIN_BLOCK_OPP_SIGNI_AUTO') {
    return done(addLog({
      ...ctx,
      ownerState: { ...ctx.ownerState, blocked_actions: [...(ctx.ownerState.blocked_actions ?? []), 'BLOCK_OPP_SIGNI_AUTO'] },
      otherState: { ...ctx.otherState, blocked_actions: [...(ctx.otherState.blocked_actions ?? []), 'BLOCK_OWN_SIGNI_AUTO:NEXT_TURN'] },
    }, '相手シグニ【自】能力ブロック（次ターンも）'));
  }
  // LRIG_GAIN_OPP_SIGNI_AUTO_PAY_GATE: 対戦相手のシグニの【自】能力が発動する場合、対戦相手が指定コストを支払わないかぎりその能力は何もしない
  //   （`SPDi43-01-E2`）
  // 🔴**「丸ごと止める」ではない**＝支払えば通るゲート（§6.4 O-38・続き544）。消費は `BattleScreen.resolveStackNext`。
  if (stub.id === 'LRIG_GAIN_OPP_SIGNI_AUTO_PAY_GATE') {
    const gateColorsLG = stub.autoPayGateColors;
    if (!gateColorsLG || gateColorsLG.length === 0) return done(addLog(ctx, '[未実装] 相手【自】能力ゲート（payload なし）'));
    const markersLG = signiAutoPayGateMarkers(gateColorsLG);
    return done(addLog({
      ...ctx,
      ownerState: { ...ctx.ownerState, blocked_actions: [...(ctx.ownerState.blocked_actions ?? []), markersLG.declarer] },
      otherState: { ...ctx.otherState, blocked_actions: [...(ctx.otherState.blocked_actions ?? []), markersLG.opponentNextTurn] },
    }, `相手シグニ【自】能力は${gateColorsLG.map(c => `《${c}》`).join('')}を支払わないかぎり何もしない（次の対戦相手のターン終了時まで）`));
  }
  // LRIG_GAIN_OPP_ACTIVATE_COST_UP: 対戦相手のカードの【起】能力の使用コストは《無×N》増える
  //   （`WXDi-P15-033-E2`）
  if (stub.id === 'LRIG_GAIN_OPP_ACTIVATE_COST_UP') {
    const nLG = stub.oppActivateCostPlus;
    if (!nLG) return done(addLog(ctx, '[未実装] 相手【起】能力コスト増加（payload なし）'));
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, lrig_opp_act_cost_plus: (ctx.ownerState.lrig_opp_act_cost_plus ?? 0) + nLG } },
      `相手起動能力コスト《無×${nLG}》増加`));
  }
  // LRIG_GAIN_ATTACK_PHASE_POWER_DOWN: アタックフェイズの間、対戦相手のシグニのパワーをあなたの場にあるシグニ1体につき－Nする
  //   （`WX24-P2-030-E2`）
  if (stub.id === 'LRIG_GAIN_ATTACK_PHASE_POWER_DOWN') {
    const specLG = stub.powerPerUnit;
    if (!specLG) return done(addLog(ctx, '[未実装] アタックフェイズ中のパワーダウン（payload なし）'));
    // 消費側（`BattleScreen`）は「自シグニ1体につき N」で読むので、単価を1体あたりへ正規化する。
    const perOneLG = Math.abs(specLG.delta) / (specLG.per || 1);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, lrig_attack_phase_power_down_per_signi: perOneLG } },
      `アタックフェイズ中：相手シグニパワー自シグニ×-${perOneLG}付与`));
  }
  // OPP_SIGNI_ENERGY_TO_DECK_BOTTOM: 対戦相手のシグニがエナゾーンに置かれる場合、代わりにデッキの一番下に置かれる
  //   （`WX25-CP1-003-E1`）
  if (stub.id === 'OPP_SIGNI_ENERGY_TO_DECK_BOTTOM') {
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, opp_signi_energy_to_deck_bottom: true } },
      '相手シグニのエナゾーン配置→デッキ下に変更'));
  }

  // 🏁**§5.3 `O-60` 第70バッチ（2026-09-04）＝引用付与 catch-all のハンドラを撤去した。**
  //
  // 🔴**何だったか**＝`GRANT_QUOTED_AUTO_ABILITY` / `GRANT_QUOTED_ABILITY` / `GRANT_ABILITY_INNER_TEXT` の3綴りを
  //   受け、**効果元のアビリティブロック全文**に `「([^」]+)」…を得る` を当てて引用を切り出し、
  //   キーワード表・条件つきキーワード表・既知 CONTINUOUS パターン表（合計 約200行）で意味を決めていた。
  //   ＝`census:enginetext` A群の**最大項目**（第63の較正時点で live 27効果 / 14カード）。
  //
  // 🔴**なぜ消してよいか**＝第64〜68で live 27効果を**全部**受け皿（11効果）か明示 defer（8効果）へ移し、
  //   第69で **parser の生成地点31箇所**を `DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED` へ畳んだ＝
  //   **この3綴りを作る場所がもう無い**（golden『第69: parser は旧3綴りの catch-all をもう生成しない』が守る）。
  //
  // 🔑**残す価値が無かった理由**＝表に無い言い回しは最後の `能力を付与（effectEngine処理）` へ落ちる**無言 no-op**で、
  //   JSON・逆翻訳・census・golden・smoke・fuzz が全部緑のまま意味が壊れる形だった。
  //   新しい文型は今後 `DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED` に落ち、**逆翻訳に【未実装】が出る**。
  // ⚠**この分岐を復活させない。** 引用付与は parser 側で `GRANT_EFFECT{rawText}` /
  //   `GRANT_FIELD_SIGNI_ABILITY{rawText}` / `GRANT_SIGNI_ABOVE_ABILITY{rawText}` のどれかへ載せる。
  // LRIG_UNDER_CARD_OP: `underCardOp` が指す操作を1つだけ行う。
  //
  // 🔴**2026-08-26（§5.3 `O-60` 第2バッチ）＝ここはカード全文 regex で3分岐していた。**
  //   ①regex は2本しか無いのに **parser の生成地点は22箇所**（＝この id は「ルリグデッキ下操作」ではなく
  //     **無関係な22文型の catch-all**＝id の名前が嘘をつく）
  //   ②🔴**3つ目の分岐には regex すら無かった**＝どの regex にも当たらないと、**効果元シグニの下に
  //     カードが在るだけで問答無用に全部トラッシュ**していた。実測＝live 17効果のうち regex に当たるのは
  //     **2効果だけ**で、残り15効果がこの無条件フォールバックか無言ログに落ちていた。
  //     実害＝`WX24-P4-046-E2`（「下から**それぞれレベルの異なるシグニ３枚**をトラッシュに置いて**もよい**」）は
  //     **下の全カードを強制的に**失い、`WXK08-084-E1`（下に**置く**効果）は逆に下を**トラッシュ**していた。
  // ⇒ parser が `underCardOp` を刻み、engine は payload だけを読む。
  // ⚠**payload が無ければ何もしない**（fail-closed）。落ちたら「効かない」で済むが、旧実装のフォールバックは
  //   **無関係な効果が盤面のカードを失わせる**＝取り返しがつかない側の壊れ方だった。
  if (stub.id === 'LRIG_UNDER_CARD_OP') {
    const srcLrig = ctx.sourceCardNum;
    const specUC = stub.underCardOp;
    if (!specUC) return done(addLog(ctx, `[未実装] 操作が未指定（LRIG_UNDER_CARD_OP・${srcLrig ?? '?'}）`));

    // エナゾーンのシグニ（原文の色／＜クラス＞の絞り込みを payload から適用）をデッキの一番上へ。
    if (specUC.op === 'energy_signi_to_deck_top') {
      const candUC = ctx.ownerState.energy.filter(cn => {
        const card = ctx.cardMap.get(getCardNum(cn));
        if (card?.Type !== 'シグニ') return false;
        return !specUC.filter || matchesFilter(card, specUC.filter);
      });
      if (candUC.length === 0) return done(addLog(ctx, 'エナゾーンに該当するシグニなし'));
      const pickedUC = candUC[0];
      const newOwnerUC = {
        ...ctx.ownerState,
        energy: ctx.ownerState.energy.filter(cn => cn !== pickedUC),
        deck: [pickedUC, ...ctx.ownerState.deck],
      };
      return done(addLog({ ...ctx, ownerState: newOwnerUC, lastProcessedCards: [pickedUC] },
        `${ctx.cardMap.get(getCardNum(pickedUC))?.CardName ?? pickedUC}をエナからデッキ上へ`));
    }

    // 場のこのシグニをエナゾーンへ。
    if (specUC.op === 'self_to_energy') {
      if (!srcLrig) return done(addLog(ctx, 'LRIG_UNDER_CARD_OP: 効果元不明'));
      const removedUC = removeFromField(srcLrig, ctx.ownerState);
      const newOwnerUC2 = { ...removedUC, energy: [...removedUC.energy, srcLrig] };
      return done(addLog({ ...ctx, ownerState: newOwnerUC2 }, `${ctx.cardMap.get(getCardNum(srcLrig))?.CardName ?? srcLrig}をエナゾーンへ`));
    }

    // このシグニの下にあるすべてのカードをトラッシュへ。
    if (!srcLrig) return done(addLog(ctx, 'LRIG_UNDER_CARD_OP: 効果元不明'));
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
          return done(addLog({
            ...setOwnerState(owner, newS, ctx),
            lastProcessedCards: underCards,
          }, `シグニ下${underCards.length}枚をトラッシュへ`));
        }
      }
    }
    return done(addLog(ctx, 'シグニの下にカードなし'));
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
  // REVEAL_EACH_PLAYER_DECK_TOP（§6.4 O-35・続き530）＝「各プレイヤーは自分のデッキの一番上のカードを公開する」。
  // 🔴従来は parser がこの文を `LOOK_OPP_LIFE_TOP`（＝**相手のライフクロス**上を見る）に化けさせており、
  //   公開が起きないうえ `lastProcessedCards` に無関係な札が載って、後続の「レベルの合計が〜の場合」が
  //   別物を数えていた（`SPDi43-25-E2`）。
  // ⚠原文に移動の指示が無い＝**公開した札はデッキの一番上に残す**（`REVEAL_BOTH_DECK_TOPS` は
  //   一番下へ回す別文型なので流用しない）。公開2枚を `lastProcessedCards` に載せて後続の
  //   `LAST_PROCESSED_LEVEL_SUM` へ渡す。
  if (stub.id === 'REVEAL_EACH_PLAYER_DECK_TOP') {
    const myTopRE = ctx.ownerState.deck[0];
    const opTopRE = ctx.otherState.deck[0];
    const revealedRE = [myTopRE, opTopRE].filter((n): n is string => !!n);
    if (revealedRE.length === 0) return done(addLog(ctx, '各プレイヤーの公開：デッキが空'));
    const nameRE = (n: string) => ctx.cardMap.get(getCardNum(n))?.CardName ?? n;
    return done(addLog({ ...ctx, lastProcessedCards: revealedRE },
      `各プレイヤーがデッキの一番上を公開（あなた: ${myTopRE ? nameRE(myTopRE) : 'なし'}・対戦相手: ${opTopRE ? nameRE(opTopRE) : 'なし'}）`));
  }
  // LOOK_OPP_LIFE_TOP: 指定されたゾーンの上から N 枚を見る（公開する）。
  // ⚠見たカードは lastProcessedCards に残り、後続の「【ライフバースト】を持たない場合、それをトラッシュに置く」等が参照する。
  //
  // 🔴**2026-08-26（§5.3 `O-60` 第1バッチ）＝ここは `EffectText`/`BurstText` の regex でゾーンと枚数を
  //   決めていた**。実測で live 28効果のうち **27効果は regex が1本も当たらず既定（相手ライフ上1枚）へ
  //   落ちていた**＝「対戦相手の手札を見**て**」（連用形）が全滅し、`WXEX1-11-E2` の「上からカードを２枚」も
  //   1枚に潰れていた。⇒ **parser が `stub.lookZone` にゾーンと枚数を刻み、engine は payload だけを読む。**
  // ⚠**payload が無い宣言は何も見ない**（fail-closed）＝この id は 20 の無関係な文型の catch-all にも
  //   なっており（§5.3 `O-76`）、既定で覗くと**見る効果ではないのに相手の非公開領域を開いて
  //   `lastProcessedCards` を汚す**。落ちたときは「効かない」で済ませる。
  if (stub.id === 'LOOK_OPP_LIFE_TOP') {
    const specLT = stub.lookZone;
    if (!specLT) return done(addLog(ctx, `[未実装] 見る対象が未指定（LOOK_OPP_LIFE_TOP・${ctx.sourceCardNum ?? '?'}）`));
    const zoneOwnerLT = specLT.zone === 'self_life' ? ctx.ownerState : ownerState('opponent', ctx);
    const pileLT = specLT.zone === 'opp_hand' ? zoneOwnerLT.hand
      : specLT.zone === 'opp_deck_top' ? zoneOwnerLT.deck
        : zoneOwnerLT.life_cloth;
    // ライフクロスは配列末尾が「一番上」・デッキは先頭が「一番上」。手札に上下は無い（全部見る）。
    const wantLT = specLT.count === 'ALL' ? pileLT.length : specLT.count;
    const viewedLT = specLT.zone === 'opp_hand' ? pileLT
      : specLT.zone === 'opp_deck_top' ? pileLT.slice(0, wantLT)
        : pileLT.slice(Math.max(0, pileLT.length - wantLT));
    const zoneNameLT = specLT.zone === 'opp_hand' ? '対戦相手の手札'
      : specLT.zone === 'opp_deck_top' ? '対戦相手のデッキ上'
        : specLT.zone === 'self_life' ? 'あなたのライフクロス' : '対戦相手のライフクロス上';
    if (viewedLT.length === 0) return done(addLog(ctx, `${zoneNameLT}なし`));
    const namesLT = viewedLT.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
    return done(addLog({ ...ctx, lastProcessedCards: viewedLT }, `${zoneNameLT}${viewedLT.length}枚を確認：${namesLT}`));
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
  if (stub.id === 'DOUBLE_POWER_MINUS' && (stub as StubAction & { targetsStored?: boolean }).targetsStored) {
    const sources = ctx.storedTargetCards ?? [];
    const current = ctx.ownerState.double_power_minus_sources ?? [];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, double_power_minus_sources: [...new Set([...current, ...sources])] } },
      `選択したシグニ${sources.length}体の効果によるパワーマイナスを2倍`));
  }
  // DOUBLE_POWER_MINUS: 「対戦相手のシグニのパワーが－される場合、代わりに2倍－される」。
  //
  // 🔴**2026-08-26（§5.3 `O-60` 第5バッチ）＝ここはカード全文 regex で `シグニN体につき±X` /
  //   `パワーをN倍にする` に当てようとしていた**が、実データの綴りは「**2倍－される**」なので
  //   **live 7効果すべてが1本も当たらず**、ログだけ出して終わる**無言 no-op** だった。
  //   ⚠**受け皿は最初から在った**（`double_power_minus_this_turn` フラグ＋`effectEngine` の2倍化）＝
  //   別 id `DOUBLE_POWER_MINUS_THIS_TURN` が同じことをしており、**parser がそちらを吐かなかっただけ**。
  //   ⇒ parser が `doublePowerMinus{duration}` を刻み、engine は payload で分岐する。
  // ⚠**同時に、live 0 件の枝を2つ撤去した**＝`POWER_MOD_PER_OPPONENT_FIELD`（live 0・parser も吐かない）と
  //   「パワーをN倍にする」（どの live 効果にも当たらない）。**死んだ枝は catch-all の温床になる。**
  if (stub.id === 'DOUBLE_POWER_MINUS') {
    const specDPM = stub.doublePowerMinus;
    if (!specDPM) return done(addLog(ctx, `[未実装] 2倍マイナスの寿命が未指定（DOUBLE_POWER_MINUS・${ctx.sourceCardNum ?? '?'}）`));
    // 【常】の宣言は `effectEngine` が場のカードを走査して読む（実行側は何もしない）。
    if (specDPM.duration === 'continuous') {
      return done(addLog(ctx, '【常】対戦相手のシグニへのパワーマイナスが2倍（常在・effectEngine処理）'));
    }
    const newOwnerDPM: PlayerState = { ...ctx.ownerState, double_power_minus_this_turn: true };
    return done(addLog({ ...ctx, ownerState: newOwnerDPM },
      `このターン、${specDPM.sourceSigniOnly ? 'あなたのシグニの効果' : 'あなたの効果'}による相手へのパワーマイナスが2倍`));
  }
  // 条件付きパワーボーナス
  if (stub.id === 'CONDITIONAL_POWER_BONUS') {
    // §6.4 O-20: 全文だと別能力の条件・数値を実行してしまう
    // （`WX26-CP1-057-E2`／`WX25-CP1-056-E1`＝相手をトラッシュする効果が自己バフ化）のでブロックだけを読む。
    const txtCB = sourceAbilityText(ctx);
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
  // LRIG_GROW_RESTRICT: このルリグは指定された名前/色のルリグにしかグロウできない
  // ⚠判定は `BattleScreen` の growCandidates 側（原文を読む）＝ここは実行時 no-op のログ1行。
  //   旧コメント「対戦相手の no_grow フラグをセット」は**実装と無関係**で、逆翻訳にそのまま出ていた。
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
  // INTERNAL_PICK_TO_HAND: 公開中のカード（stub.value）をデッキ/トラッシュ/エナから手札へ（handOrField の手札分岐）。
  if (stub.id === 'INTERNAL_PICK_TO_HAND') {
    const card = stub.value != null ? String(stub.value) : '';
    if (!card) return done(ctx);
    let s = { ...ctx.ownerState };
    const di = s.deck.indexOf(card);
    if (di >= 0) { const dk = [...s.deck]; dk.splice(di, 1); s = { ...s, deck: dk }; }
    else { const ti = s.trash.indexOf(card); if (ti >= 0) { const t = [...s.trash]; t.splice(ti, 1); s = { ...s, trash: t }; } }
    s = { ...s, hand: [...s.hand, card] };
    return done(addLog({ ...ctx, ownerState: s, lastProcessedCards: [card] }, `${ctx.cardMap.get(card)?.CardName ?? card}を手札に加える`));
  }
  // INTERNAL_PICK_TO_ENERGY: 公開中のカード（stub.value）をデッキ/トラッシュからエナゾーンへ（handOrEnergy のエナ分岐）。
  if (stub.id === 'INTERNAL_PICK_TO_ENERGY') {
    const card = stub.value != null ? String(stub.value) : '';
    if (!card) return done(ctx);
    let s = { ...ctx.ownerState };
    const di = s.deck.indexOf(card);
    if (di >= 0) { const dk = [...s.deck]; dk.splice(di, 1); s = { ...s, deck: dk }; }
    else { const ti = s.trash.indexOf(card); if (ti >= 0) { const t = [...s.trash]; t.splice(ti, 1); s = { ...s, trash: t }; } }
    s = { ...s, energy: [...s.energy, card] };
    return done(addLog({ ...ctx, ownerState: s, lastProcessedCards: [card] }, `${ctx.cardMap.get(getCardNum(card))?.CardName ?? card}をエナゾーンへ`));
  }
  // INTERNAL_HAND_OR_ENERGY: 「それぞれ手札に加えるかエナゾーンに置き」を1枚ずつ問うチェーン（タスク12(xlvi)(h)）。
  // 先頭1枚の行き先を CHOOSE で決め、残りは自分自身を continuation に積んで再入する。
  if (stub.id === 'INTERNAL_HAND_OR_ENERGY') {
    const queue = stub.pickQueue ?? [];
    if (queue.length === 0) return done(ctx);
    const card = queue[0];
    const rest = queue.slice(1);
    return needsInteraction(ctx, {
      type: 'CHOOSE',
      count: 1,
      options: [
        { id: 'hand', label: '手札に加える', available: true, action: { type: 'STUB', id: 'INTERNAL_PICK_TO_HAND', value: card } as EffectAction },
        { id: 'energy', label: 'エナゾーンに置く', available: true, action: { type: 'STUB', id: 'INTERNAL_PICK_TO_ENERGY', value: card } as EffectAction },
      ],
      ...(rest.length > 0 ? { continuation: { type: 'STUB', id: 'INTERNAL_HAND_OR_ENERGY', pickQueue: rest } as EffectAction } : {}),
    });
  }
  // INTERNAL_KEEP_ON_DECK_TOP: LOOK_PICK_CHAIN の then:'deck_top' 段のマーカー。ここでは盤面を動かさない
  // （公開中のカードはデッキに残ったまま）。resumeSearch が lastProcessedCards にピックを載せ、
  // execLookPickChain が remainder 処理のあとでデッキの一番上へ置く。
  if (stub.id === 'INTERNAL_KEEP_ON_DECK_TOP') {
    return done(ctx);
  }
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
  // GAIN_SUBSCRIBER_COUNT: 登録者数を N 万人得る
  // 🆕**§5.3 `O-60` 第47バッチ（2026-09-03）＝獲得量は payload（`stub.value`）だけを読む。**
  // 🔴旧実装は**カード全文**に `/登録者数を([０-９\d]+)万人得る/` を当てており、
  //   同じカードに「登録者数を〜得る」が2文あると**先頭の数字**を両方に使う形だった
  //   （`WDK16-01*` は【自】と【起】の両方が登録者数に触る）。
  // ⚠**payload が無ければ何もしない**（fail-closed）＝旧既定の 1万人は原文に無い加算。
  //   live 21効果はすべて `value` を持っている（parser が最初からキャプチャしている）。
  if (stub.id === 'GAIN_SUBSCRIBER_COUNT') {
    const gain = typeof stub.value === 'number' ? stub.value : Number.NaN;
    if (!Number.isFinite(gain)) return done(addLog(ctx, '登録者数の獲得量が指定されていないため何もしない'));
    const newCnt = (ctx.ownerState.subscriber_count ?? 0) + gain;
    const newOwner = { ...ctx.ownerState, subscriber_count: newCnt };
    return done(addLog({ ...ctx, ownerState: newOwner }, `登録者数＋${gain}万人（計${newCnt}万人）`));
  }
  // ウイルス除去：**個数は payload で決まる**（§5.3 `O-60` 第11バッチ・2026-08-29）。
  // 🔴旧実装は**カード全文**を3本の regex で読み直しており、しかも**既定値が「全部」**だった
  //   （もう1つの消費地点 `effectExecutor` の既定は「1」＝2地点で食い違っていた）。
  // `'any'`（好きな数）は、0個で終了できる1個ずつの対話ループで処理する。
  // ⚠**payload 省略時は1個**（fail-closed＝旧既定「全部」の逆）。
  if (stub.id === 'REMOVE_VIRUS') {
    const virusArr = ctx.otherState.field.signi_virus ?? [0, 0, 0];
    const totalVirus = virusArr.reduce((s, v) => s + v, 0);
    if (stub.virusCount === 'any') {
      const removedSoFar = stub.virusRemovedSoFar ?? 0;
      const availableZones = [0, 1, 2].filter(zone => (virusArr[zone] ?? 0) > 0);
      if (availableZones.length === 0) {
        return done(addLog({ ...ctx, lastProcessedCount: removedSoFar }, `ウイルス除去完了（${removedSoFar}つ）`));
      }
      const options = availableZones.map(zone => ({
        id: `remove_virus_any_${zone}`,
        label: `ゾーン${zone + 1}の【ウィルス】を1つ取り除く`,
        action: ({ type: 'SEQUENCE', steps: [
          ({ type: 'STUB', id: 'INTERNAL_REMOVE_VIRUS_AT_ZONE', value: zone } as StubAction) as EffectAction,
          ({ ...stub, virusRemovedSoFar: removedSoFar + 1 } as StubAction) as EffectAction,
        ] } as SequenceAction) as EffectAction,
        available: true,
      }));
      options.push({
        id: 'remove_virus_any_stop', label: 'これで取り除くのを終える',
        action: ({ type: 'STUB', id: 'INTERNAL_SET_LAST_PROCESSED_COUNT', value: removedSoFar } as StubAction) as EffectAction,
        available: true,
      });
      return needsInteraction(addLog(ctx, '取り除く【ウィルス】を選択（好きな数）'), {
        type: 'CHOOSE', options, count: 1,
      });
    }
    if (totalVirus === 0) return done(addLog({ ...ctx, lastProcessedCount: 0 }, 'ウイルスなし'));
    const removeCount = stub.virusCount === 'all'
      ? totalVirus
      : Math.min(typeof stub.virusCount === 'number' ? stub.virusCount : 1, totalVirus);
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
    return done(addLog({ ...ctx, ownerState: newOwnerRV, otherState: newOther, lastProcessedCount: removed }, `ウイルス${removed}つを取り除く`));
  }
  if (stub.id === 'INTERNAL_SET_LAST_PROCESSED_COUNT') {
    const count = typeof stub.value === 'number' ? stub.value : 0;
    return done({ ...ctx, lastProcessedCount: count });
  }
  if (stub.id === 'INTERNAL_REMOVE_VIRUS_AT_ZONE') {
    const zone = typeof stub.value === 'number' ? stub.value : -1;
    const virusArr = [...(ctx.otherState.field.signi_virus ?? [0, 0, 0])];
    if (zone < 0 || zone > 2 || (virusArr[zone] ?? 0) <= 0) return done(ctx);
    virusArr[zone] -= 1;
    const newOther = { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: virusArr } };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, opp_virus_removed_just: true }, otherState: newOther }, `ゾーン${zone + 1}のウイルス1つを取り除く`));
  }
  // INTERNAL_REMOVE_VIRUS_N: N個ウイルスを除去（effectExecutorのREMOVE_VIRUS+IS_MY_TURNハンドラから使用）
  if (stub.id === 'INTERNAL_REMOVE_VIRUS_N') {
    const n = typeof stub.value === 'number' ? stub.value : 0;
    if (n === 0) return done({ ...ctx, lastProcessedCount: 0 });
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
    return done(addLog({ ...ctx, ownerState: newOwnerIRVN, otherState: newOther, lastProcessedCount: removed }, `ウイルス${removed}つを取り除く`));
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
  // DRAW_IF_POWER_ZERO_TEMP は §5.3 `O-166`（2026-08-30）で撤去した。
  // `WX15-064` 専用で「lastProcessedCards[0] が temp_power_mods 適用後パワー0以下なら1枚引く」を
  // ハンドラごと抱えていたが、**同じ判定を6効果が必要としていた**ので条件型
  // `LAST_PROCESSED_POWER_LTE`（`execUtils.evalCondition`）へ引き上げ、`CONDITIONAL` ＋ 既存 `DRAW` で表す形にした。
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
  // EXTRA_COST_REMOVE_VIRUS: ウイルスを任意数取り除いてからN+1択の効果を選ぶ。
  // 🆕**取り除ける上限は payload（`virusCount`＝`REMOVE_VIRUS` と共有）**
  //   （§5.3 `O-60` 第54バッチ・2026-09-03）。`'any'`／`'all'` は原文「好きな数」＝場のウィルス全部。
  // 🔴旧実装は `EffectText + BurstText`（カード全文）にも regex を当てていた＝
  //   **同じカードの別の能力**の「【ウィルス】をNつまで取り除」を掴みうる形だった
  //   （live 2効果は `value` payload が先に効いていたので regex は死んでいた＝**miss=0 の中身**）。
  // ⚠**payload が無ければ 0 個**（fail-closed）＝原文は「取り除いて**もよい**」なので
  //   0 は必ず正当な選択肢。旧既定（場のウィルス全部）へ倒すと過剰実行になりうる。
  if (stub.id === 'EXTRA_COST_REMOVE_VIRUS') {
    const virusArrECRV = ctx.otherState.field.signi_virus ?? [0, 0, 0];
    const totalVirusECRV = virusArrECRV.reduce((s, v) => s + v, 0);
    const specECRV = stub.virusCount;
    const maxRemoveECRV = typeof specECRV === 'number' ? specECRV
      : (specECRV === 'any' || specECRV === 'all') ? totalVirusECRV : 0;
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
  if (stub.id === 'OPP_ENERGY_COLORLESS_ABILITY_LOSS') {
    return done(addLog({
      ...ctx,
      otherState: { ...ctx.otherState, energy_colorless_ability_loss_this_turn: true },
    }, '対戦相手のエナゾーンのカードはこのターン、色と能力を失う'));
  }
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
  // DISRUPT_OPP_LRIG_UNDER_BY_TYPE: このシグニがアタックしたとき、対戦相手のセンタールリグの下のカードを最大2枚、
  // あなたのルリグデッキから「あなたのセンタールリグと同じルリグタイプ（CardClass）」のルリグ2枚をルリグトラッシュに置いて（任意コスト）、
  // ルリグトラッシュに置く（SPK16-8C / PR-465）。
  if (stub.id === 'DISRUPT_OPP_LRIG_UNDER_BY_TYPE') {
    const oppUnderDLU = ctx.otherState.field.lrig.slice(0, -1);
    if (oppUnderDLU.length === 0) return done(addLog(ctx, '相手センタールリグの下にカードなし'));
    const myCenterDLU = ctx.ownerState.field.lrig.at(-1);
    const centerClsDLU = (ctx.cardMap.get(getCardNum(myCenterDLU ?? ''))?.CardClass ?? '').split(/[/／]/).filter(Boolean);
    const payableDLU = (ctx.ownerState.lrig_deck ?? []).filter(cn => {
      const c = ctx.cardMap.get(getCardNum(cn));
      if (c?.Type !== 'ルリグ') return false;
      const cls = (c.CardClass ?? '').split(/[/／]/).filter(Boolean);
      return cls.some(x => centerClsDLU.includes(x));
    });
    if (payableDLU.length < 2) return done(addLog(ctx, 'ルリグデッキに同タイプのルリグが2枚なく実行不可'));
    const doDLU: StubAction = { type: 'STUB', id: 'INTERNAL_DISRUPT_LRIG_UNDER_EXEC' };
    const skipDLU: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, '相手センタールリグの下のカード除去（ルリグ2枚コスト）を実行するか'), {
      type: 'CHOOSE',
      options: [
        { id: 'do', label: 'ルリグデッキから同タイプのルリグ2枚をルリグトラッシュ→相手の下のカードを最大2枚ルリグトラッシュ', action: doDLU as EffectAction, available: true },
        { id: 'skip', label: 'スキップ', action: skipDLU as EffectAction, available: true },
      ],
      count: 1,
    });
  }
  // INTERNAL_DISRUPT_LRIG_UNDER_EXEC: DISRUPT_OPP_LRIG_UNDER_BY_TYPE の実行部（コスト支払い＋除去）
  if (stub.id === 'INTERNAL_DISRUPT_LRIG_UNDER_EXEC') {
    const myCenterDX = ctx.ownerState.field.lrig.at(-1);
    const centerClsDX = (ctx.cardMap.get(getCardNum(myCenterDX ?? ''))?.CardClass ?? '').split(/[/／]/).filter(Boolean);
    const payableDX = (ctx.ownerState.lrig_deck ?? []).filter(cn => {
      const c = ctx.cardMap.get(getCardNum(cn));
      if (c?.Type !== 'ルリグ') return false;
      return (c.CardClass ?? '').split(/[/／]/).filter(Boolean).some(x => centerClsDX.includes(x));
    }).slice(0, 2);
    if (payableDX.length < 2) return done(addLog(ctx, 'コスト支払い不可（同タイプのルリグ不足）'));
    const paySetDX = new Set(payableDX);
    const newOwnerDX: PlayerState = {
      ...ctx.ownerState,
      lrig_deck: (ctx.ownerState.lrig_deck ?? []).filter(n => !paySetDX.has(n)),
      lrig_trash: [...ctx.ownerState.lrig_trash, ...payableDX],
    };
    const underDX = ctx.otherState.field.lrig.slice(0, -1);
    const removeDX = underDX.slice(-2); // 下のカードを最大2枚（下＝古い側から末尾2枚＝現センター直下）
    const removeSetDX = new Set(removeDX);
    const newOtherDX: PlayerState = {
      ...ctx.otherState,
      field: { ...ctx.otherState.field, lrig: ctx.otherState.field.lrig.filter(n => !removeSetDX.has(n)) },
      lrig_trash: [...ctx.otherState.lrig_trash, ...removeDX],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerDX, otherState: newOtherDX },
      `同タイプのルリグ2枚をルリグトラッシュ→相手センタールリグの下${removeDX.length}枚をルリグトラッシュ`));
  }
  // STEAL_OPP_TRASH_PUPPET: 対戦相手のトラッシュからシグニを傀儡状態であなたの場に出す（WDK17-007）。
  // ベット時は2枚、非ベットは1枚。空きゾーン数・候補数で上限。選択した各カードを INTERNAL_PLACE_PUPPET で配置。
  if (stub.id === 'STEAL_OPP_TRASH_PUPPET') {
    const pp = stub.puppetParams;
    let oppTrashSPP = ctx.otherState.trash.filter(cn => ctx.cardMap.get(getCardNum(cn))?.Type === 'シグニ');
    // filter: 原文の静的な絞り込み（「レベル３以下の」「＜美巧＞ではない」）。2026-08-18・§5d-0 (i)
    if (pp?.filter) oppTrashSPP = oppTrashSPP.filter(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), pp.filter));
    // levelLteTrigger: トリガー元シグニ（バニッシュしたシグニ）のレベル以下に候補を限定
    if (pp?.levelLteTrigger && ctx.triggeringCardNum) {
      const trigLv = parseInt(ctx.cardMap.get(getCardNum(ctx.triggeringCardNum))?.Level ?? '0', 10);
      oppTrashSPP = oppTrashSPP.filter(cn => parseInt(ctx.cardMap.get(getCardNum(cn))?.Level ?? '99', 10) <= trigLv);
    }
    if (oppTrashSPP.length === 0) return done(addLog(ctx, '相手トラッシュにシグニなし'));
    const emptyZonesSPP = ctx.ownerState.field.signi.filter(z => !z || z.length === 0).length;
    if (emptyZonesSPP === 0) return done(addLog(ctx, '空きシグニゾーンなし（傀儡を出せない）'));
    const wantSPP = pp?.count ?? (ctx.ownerState.is_betting_this_effect ? 2 : 1);
    const countSPP = Math.min(wantSPP, oppTrashSPP.length, emptyZonesSPP);
    const placeAct: StubAction = { type: 'STUB', id: 'INTERNAL_PLACE_PUPPET' };
    return selectOrInteract(oppTrashSPP, countSPP, pp?.optional ?? false, 'opp_trash', placeAct as EffectAction, undefined, ctx);
  }
  // INTERNAL_PLACE_PUPPET: 選択した相手トラッシュのシグニ1枚を、傀儡状態で自分の空きゾーンに出す（applyDirectActionが1枚ずつ呼ぶ）
  if (stub.id === 'INTERNAL_PLACE_PUPPET') {
    const cnPP = ctx.lastProcessedCards?.[0];
    if (!cnPP) return done(ctx);
    if (!ctx.otherState.trash.includes(cnPP)) return done(ctx);
    const signiPP = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const zPP = signiPP.findIndex(z => !z || z.length === 0);
    if (zPP < 0) return done(addLog(ctx, '空きゾーンなし（傀儡配置スキップ）'));
    signiPP[zPP] = [cnPP];
    const newOwnerPP: PlayerState = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, signi: signiPP, puppet_signi: [...(ctx.ownerState.field.puppet_signi ?? []), cnPP] },
    };
    const newOtherPP: PlayerState = { ...ctx.otherState, trash: ctx.otherState.trash.filter(x => x !== cnPP) };
    return done(addLog({ ...ctx, ownerState: newOwnerPP, otherState: newOtherPP },
      `${ctx.cardMap.get(getCardNum(cnPP))?.CardName ?? cnPP}を傀儡状態で場に出す`));
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
  // 各プレイヤーがカードをN枚引き、M枚捨てる
  // 🆕**§5.3 `O-60` 第23バッチ（2026-09-03）＝枚数は payload（`eachPlayerDrawDiscard`）で受け取る。**
  // 🔴旧実装は `EffectText + BurstText` に `/([０-９\d]+)枚引く/` を当てていたが、原文の綴りは
  //   「１枚引**き**」（連用中止形）なので**当たらず既定 1** へ落ちていた。
  //   **捨てる枚数に至っては regex すら無く 1 に焼き込まれていた**（原文を1文字も読んでいない）。
  // ⚠**payload が無ければ何もしない**（fail-closed）。
  if (stub.id === 'EACH_PLAYER_DRAW_DISCARD') {
    const specEPDD0 = stub.eachPlayerDrawDiscard;
    if (!specEPDD0) return done(addLog(ctx, '各プレイヤーのドロー／捨て：枚数が無いため何もしない'));
    const drawN = specEPDD0.draw;
    const discardN = specEPDD0.discard;
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
    if (discardN <= 0 || newOwner.hand.length === 0) return done(ctxDrawnEPDD0);
    const oppDiscardEPDD0: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: discardN } };
    return selectOrInteract(
      newOwner.hand, discardN, false, 'self_hand',
      ({ type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: discardN } } as TrashAction) as EffectAction,
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
  // 🆕**しきい値は payload（`oppEnergyThreshold`）**（§5.3 `O-60` 第52バッチ・2026-09-03）。
  // 🔴旧実装は `EffectText + BurstText`（**カード全文**）へ `/エナゾーンにカードが(\d+)枚以上/` を当てており、
  //   同じ文を読む `CONDITIONAL_TRASH_UNDER_SIGNI` と**既定値が 5 と 3 で食い違っていた**
  //   （＝どちらが正しいのか JSON からは決して分からない形）。
  // ⚠**payload が無ければ何もしない**（fail-closed）＝既定値へ倒すと原文と無関係なしきい値で発火する。
  if (stub.id === 'OPP_ENERGY_EXCESS_TRASH') {
    const threshOEE = stub.oppEnergyThreshold;
    if (threshOEE === undefined) return done(addLog(ctx, '[OPP_ENERGY_EXCESS_TRASH: しきい値なし（未指定）]'));
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
  // 🆕**場の絞り込みと枚数は payload（`discardIfNoSigni`）**（§5.3 `O-60` 第51バッチ・2026-09-03）。
  // 🔴旧実装は `EffectText + BurstText`（**カード全文**）を読み、regex が外れると
  //   `targetClassDINC === undefined`＝**クラス無視で「他のシグニが1体でもあれば捨てない」**に化けた。
  // ⚠**payload が無ければ何もしない**（fail-closed）。
  if (stub.id === 'DISCARD_IF_NO_CLASS_SIGNI') {
    const specDINC = stub.discardIfNoSigni;
    if (!specDINC) return done(addLog(ctx, '[DISCARD_IF_NO_CLASS_SIGNI: 条件なし（未指定）]'));
    // フィールドに自分以外の該当シグニがあるかチェック
    const hasOtherClassSigni = ctx.ownerState.field.signi.some(stack => {
      const top = stack?.at(-1);
      if (!top || top === ctx.sourceCardNum) return false;
      return matchesFilter(ctx.cardMap.get(getCardNum(top)), specDINC.filter);
    });
    const labelDINC = Array.isArray(specDINC.filter.story) ? specDINC.filter.story.join('か') : specDINC.filter.story;
    if (hasOtherClassSigni) return done(addLog(ctx, `他の${labelDINC ? `＜${labelDINC}＞の` : ''}シグニあり（捨てスキップ）`));
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '手札なし'));
    const discardDINC: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 },
    };
    return selectOrInteract(ctx.ownerState.hand, specDINC.discardCount, false, 'self_hand', discardDINC as EffectAction, undefined, ctx);
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
  // 手札から任意でエナゾーンに置くは §5.3 `O-60` 第15バッチで既存の `ENERGY_CHARGE{target:{HAND_CARD, upToCount}}` へ移した。
  // 旧 `STUB{HAND_TO_ENERGY_OPTIONAL}` は実行時に**カード全文**へ `/手札から(?:カード)?N枚まで/` を当てて枚数を決めており、
  // live 2効果の原文はどちらも「カード１枚を」で**1本も当たっていなかった**（既定1で結果的に合っていただけ）。ここに戻さないこと。
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
  // 🆕**コスト上限と枚数は payload（`viewDiscardSpell`）**（§5.3 `O-60` 第52バッチ・2026-09-03）。
  // 🔴旧実装は **カード全文**へ2本の regex を当てており、`WXDi-P16-050` は【自】の
  //   「手札からスペルを１枚捨て」を `/スペル(\d+)枚/` で拾いうる位置にあった。
  // ⚠**payload が無ければ何もしない**（fail-closed）。`costMax` 省略＝上限なし（原文にコスト条件が無い）。
  if (stub.id === 'VIEW_AND_DISCARD_SPELL') {
    const specVDS = stub.viewDiscardSpell;
    if (!specVDS) return done(addLog(ctx, '[VIEW_AND_DISCARD_SPELL: 条件なし（未指定）]'));
    const costLimit = specVDS.costMax;
    const spellCands = ctx.otherState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'スペル') return false;
      if (costLimit === undefined) return true;
      const colorCount = ((c.Cost ?? '').match(/[赤青緑黒白無]/g) ?? []).length;
      return colorCount <= costLimit;
    });
    if (spellCands.length === 0) return done(addLog(ctx, '相手手札に対象スペルなし'));
    const maxVDS = specVDS.count;
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
  // 🆕**枚数は payload（`oppHandToDeckCount`）**（§5.3 `O-60` 第52バッチ・2026-09-03）。
  // 🔴旧実装は **カード全文**へ `/手札を(\d+)枚/` を当てていた＝同じカードの**別の能力**の
  //   「手札を◯枚捨てる」等を先に掴みうる（`WXK06-028` は【起】にも手札の枚数表記がある）。
  // ⚠**payload が無ければ何もしない**（fail-closed）。
  if (stub.id === 'OPP_HAND_TO_DECK_TOP') {
    const maxHDT = stub.oppHandToDeckCount;
    if (maxHDT === undefined) return done(addLog(ctx, '[OPP_HAND_TO_DECK_TOP: 枚数なし（未指定）]'));
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
  // MAGIC_BOX_FLIP_GRANT_ASSASSIN_DC（WX24-P4-016-E3）：
  //   「このターンのアタックフェイズの間、効果によってあなたの【マジックボックス】１つが表向きに
  //     なったとき、あなたのシグニ１体を対象とし、ターン終了時まで、それは【アサシン】か
  //     【ダブルクラッシュ】を得る。」
  // ⚠**印字能力ではなく「そのターンだけ付与される watcher」**なので `lrig_granted_auto_effects` へ積む
  //   （`permanentGrant` を付けない＝`clearTurnGrantedLrigAbilities` がターン終了時に落とす）。
  //   `game_granted_auto_effects` は「このゲームの間」用でターン境界のクリアが無く、使うと持ち越す。
  // ⚠発火は `collectMagicBoxFlippedTriggers` が**付与ストアも走査**して拾う（印字だけ見ると恒久 no-op）。
  if (stub.id === 'MAGIC_BOX_FLIP_GRANT_ASSASSIN_DC') {
    const grantKw = (keyword: string, choiceId: string): { choiceId: string; label: string; action: EffectAction } => ({
      choiceId, label: `【${keyword}】`,
      action: {
        type: 'GRANT_KEYWORD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        keyword, duration: 'UNTIL_END_OF_TURN',
      } as EffectAction,
    });
    const watcherMBF = {
      effectId: `${ctx.sourceEffectId ?? 'MAGIC_BOX_FLIP_GRANT'}-G`,
      effectType: 'AUTO' as const,
      timing: ['ON_MAGIC_BOX_FLIPPED' as const],
      triggerScope: 'any_ally' as const,
      // 「このターンのアタックフェイズの間」＝ターン限定は付与ストアの寿命が担い、
      // フェイズ限定はこの activeCondition が担う。
      activeCondition: { type: 'DURING_ATTACK_PHASE' as const, owner: 'self' as const },
      action: {
        type: 'CHOOSE', choose_count: 1, from_count: 2,
        choices: [grantKw('アサシン', 'c0'), grantKw('ダブルクラッシュ', 'c1')],
      } as EffectAction,
      duration: 'INSTANT' as const,
      mandatory: true,
      parseStatus: 'MANUAL' as const,
    };
    return done(addLog({
      ...ctx,
      ownerState: {
        ...ctx.ownerState,
        lrig_granted_auto_effects: [...(ctx.ownerState.lrig_granted_auto_effects ?? []), watcherMBF],
      },
    }, 'このターンのアタックフェイズ中、【マジックボックス】が表向きになったらシグニ1体に【アサシン】か【ダブルクラッシュ】を与える'));
  }
  // ARTS_ATTACK_EMPTY_ZONE_AS_FRONT（WX16-021 驚天動地）：
  //   「このターン、あなたの＜英知＞のシグニがシグニのない対戦相手のシグニゾーンにアタックする場合、
  //     代わりにそのアタックではそのシグニゾーンの正面にあるかのように対戦相手にダメージを与える。」
  // ⚠クラスは**構造（`sideAttackEmptyZoneAsFront.cardClass`）から取る**＝`costText` を engine で再パースしない。
  // 判定側は `screens/battle/sideAttackDamage.ts` に置き、**アタック先ボタン生成と解決の2箇所**から同じ関数を呼ぶ。
  if (stub.id === 'ARTS_ATTACK_EMPTY_ZONE_AS_FRONT') {
    const clsAEZ = stub.sideAttackEmptyZoneAsFront?.cardClass ?? '';
    return done(addLog({
      ...ctx,
      ownerState: { ...ctx.ownerState, side_attack_empty_zone_damage_class: clsAEZ },
    }, `このターン、${clsAEZ ? `＜${clsAEZ}＞の` : ''}シグニは空の相手シグニゾーンへの側面アタックで対戦相手にダメージを与える`));
  }
  // PLAY_MILLED_SIGNI_DELAYED_TRASH（WXDi-P09-079-E1）：
  //   「あなたのデッキからレベル１のシグニ１枚がトラッシュに置かれたとき、そのシグニを場に出す。
  //     ターン終了時、そのシグニを場からトラッシュに置く。」
  // ⚠**timing・triggerCondition は既に配線済み**（`ON_CARD_MILLED_FROM_DECK` ＋ `milledCardFilter`）で、
  //   死んでいたのは action だけだった。「そのシグニ」は `collectMillTriggers` が
  //   `triggeringCardNum`（＝フィルタに一致したミル済みカード）に載せる。
  // ⚠**ターン終了時トラッシュも既存機構**＝`turn_end_field_trash_targets`（`TRASH_AT_TURN_END` と同じストア）。
  // ⚠**配置制限を必ず通す**（続き405 で一本化した `deployLimit.ts`）＝直接 field に書く実装は
  //   「シグニをN体までしか場に出せない」をすり抜ける常習箇所。
  if (stub.id === 'PLAY_MILLED_SIGNI_DELAYED_TRASH') {
    const milledPM = ctx.triggeringCardNum;
    if (!milledPM || !ctx.ownerState.trash.includes(milledPM)) {
      return done(addLog({ ...ctx, lastProcessedCards: [] }, 'ミルされたシグニがトラッシュにない'));
    }
    const signiPM = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const zonePM = signiPM.findIndex(z => !z || z.length === 0);
    const namePM = ctx.cardMap.get(getCardNum(milledPM))?.CardName ?? milledPM;
    if (zonePM < 0) return done(addLog({ ...ctx, lastProcessedCards: [] }, `空きシグニゾーンなし（${namePM}を場に出せない）`));
    const blockedPM = deployLimitBlockReason({
      placingState: ctx.ownerState, opponentState: ctx.otherState,
      cardNum: milledPM, cardMap: ctx.cardMap, contCountCap: ctx.deployCountCapSelf,
      placementSource: effectPlacementSource(ctx.sourceCardNum, ctx.cardMap),
      placementSourceCardNum: ctx.sourceCardNum,
    });
    if (blockedPM) return done(addLog({ ...ctx, lastProcessedCards: [] }, deployLimitLogMessage(blockedPM, namePM)));
    signiPM[zonePM] = [milledPM];
    const newOwnerPM: PlayerState = {
      ...ctx.ownerState,
      trash: ctx.ownerState.trash.filter(x => x !== milledPM),
      field: { ...ctx.ownerState.field, signi: signiPM },
      turn_end_field_trash_targets: [...new Set([...(ctx.ownerState.turn_end_field_trash_targets ?? []), milledPM])],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerPM, lastProcessedCards: [milledPM] },
      `${namePM}を場に出す（ターン終了時にトラッシュ）`));
  }
  // 対戦相手が自分のルリグデッキからカード1枚を選んでルリグトラッシュに置く（WX24-P4-014-E3 ②）。
  // ⚠**選ぶのはカードの持ち主＝対戦相手**なので `opponentResponds` を立てる（`OPP_CHOOSE_YOUR_HAND_DISCARD` と同じ慣例）。
  // ⚠**ctx の視点は反転しない**＝`opponentResponds` は「誰がクリックするか」だけを変えるので、
  //   候補も適用先も `ctx.otherState`（＝効果コントローラーから見た対戦相手）のまま扱う。
  // ⚠行先は `trash` ではなく **`lrig_trash`**（ルリグデッキのカードはルリグトラッシュへ行く）。
  if (stub.id === 'OPP_LRIG_DECK_TO_LRIG_TRASH') {
    const candsOLD = ctx.otherState.lrig_deck ?? [];
    if (candsOLD.length === 0) {
      return done(addLog({ ...ctx, lastProcessedCards: [] }, '対戦相手のルリグデッキにカードがない'));
    }
    const applyOLD: StubAction = { type: 'STUB', id: 'INTERNAL_OPP_LRIG_DECK_TO_LRIG_TRASH_APPLY' };
    return selectOrInteract(candsOLD, 1, false, 'opp_lrig_deck', applyOLD, undefined, ctx, true);
  }
  if (stub.id === 'INTERNAL_OPP_LRIG_DECK_TO_LRIG_TRASH_APPLY') {
    const selOLD = ctx.lastProcessedCards ?? [];
    const deckOLD = [...(ctx.otherState.lrig_deck ?? [])];
    const movedOLD: string[] = [];
    for (const n of selOLD) {
      const i = deckOLD.indexOf(n);
      if (i < 0) continue;
      deckOLD.splice(i, 1);
      movedOLD.push(n);
    }
    if (movedOLD.length === 0) return done(addLog(ctx, '選んだカードが対戦相手のルリグデッキにない'));
    return done(addLog({
      ...ctx,
      otherState: {
        ...ctx.otherState,
        lrig_deck: deckOLD,
        lrig_trash: [...ctx.otherState.lrig_trash, ...movedOLD],
      },
      lastProcessedCards: movedOLD,
    }, `対戦相手は${movedOLD.map(n => ctx.cardMap.get(getCardNum(n))?.CardName ?? n).join('・')}をルリグデッキからルリグトラッシュに置いた`));
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
  // COPY_LRIG_NAME_ABILITY: ルリグトラッシュのルリグ名を現在のルリグに追加する（能力コピーは
  // effectEngine の collectCopiedLrigAutoEffects / collectCopiedLrigContinuousEffects が担当）。
  //
  // 🔴**2026-08-26（§5.3 `O-60` 第3バッチ）＝ここはカード全文 regex で名前を読んでいた。**
  //   しかも regex が**終止形「と同じカード名としても扱**う**」**を要求しており、実データは全部
  //   **連用形「扱**い**、そのルリグの…能力を得る」**＝**live 16効果すべてが1つも当たらず**、
  //   「ルリグ名コピー（テキスト解析不可）」を出して**丸ごと no-op**だった（§4.2「活用形が違うだけで
  //   語彙は丸ごと落ちる」＝`O-46` と同型）。⇒ parser が `lrigNameCopy` を刻み、engine は payload を読む。
  // ⚠**payload が無ければ何もしない**（fail-closed）。
  if (stub.id === 'COPY_LRIG_NAME_ABILITY') {
    const specCLNA = stub.lrigNameCopy;
    if (!specCLNA) return done(addLog(ctx, `[未実装] コピー元が未指定（COPY_LRIG_NAME_ABILITY・${ctx.sourceCardNum ?? '?'}）`));
    const targetCLNA = ctx.ownerState.lrig_trash.find(cn => {
      const c = ctx.cardMap.get(getCardNum(cn));
      if (!c) return false;
      if (specCLNA.level !== undefined && parseInt(c.Level ?? '0') !== specCLNA.level) return false;
      return c.CardClass?.includes(specCLNA.story) || c.Story?.includes(specCLNA.story) || c.CardName?.includes(specCLNA.story);
    });
    // ⚠**ルリグトラッシュに該当が無ければ何も足さない**（旧実装は見つからないと**＜ストーリー名＞そのもの**を
    //   エイリアスに入れており、カード名条件が実在しない名前で通ることがあった）。
    if (!targetCLNA) return done(addLog(ctx, `ルリグトラッシュに＜${specCLNA.story}＞のルリグなし`));
    const aliasNameCLNA = ctx.cardMap.get(getCardNum(targetCLNA))?.CardName ?? specCLNA.story;
    const currentAliases = ctx.ownerState.lrig_name_aliases ?? [];
    if (currentAliases.includes(aliasNameCLNA)) return done(addLog(ctx, `ルリグ名エイリアス（${aliasNameCLNA}）設定済み`));
    const newOwner = { ...ctx.ownerState, lrig_name_aliases: [...currentAliases, aliasNameCLNA] };
    return done(addLog({ ...ctx, ownerState: newOwner }, `ルリグが「${aliasNameCLNA}」名としても扱われる`));
  }
  // CONDITIONAL_ARTS_COST: 条件つきアーツ使用コスト（§5.3 `O-60` 第8バッチ・2026-08-26）。
  // 🔑**実コストの適用はここではない**＝`screens/battle/costs.ts` の `computeArtsEffectiveCost` /
  //   `computeCostReplacement` が支払い時に行う。ここは**条件の成否をログに出すだけ**。
  // 🔴従来はカード全文（`EffectText`＋`BurstText`）を regex 2本で読んでいた＝①同じカードの別能力の
  //   コスト文まで拾いうる ②**この id が「コストの話が1文字も無い4文型」の catch-all**になっていて、
  //   `SP38-001`（グロウしてもよい）や `WD06-008`（ライフの一番上を公開する）にまで
  //   「条件付きアーツコスト（確認完了）」を出していた（＝id が嘘をつく）。⇒ parser が条件を刻む。
  // ⚠payload が無い宣言は**条件を判定せずログだけ**（盤面には触れないので fail-closed の向きは問題にならない）。
  if (stub.id === 'CONDITIONAL_ARTS_COST') {
    const condCAC = stub.artsCostCond;
    if (!condCAC) return done(addLog(ctx, '条件付きアーツコスト（条件未指定・支払い時に適用）'));
    if (condCAC.kind === 'opp_center_lrig_color') {
      const oppLrigCardCAC = ctx.otherState.field.lrig.at(-1);
      const oppLrigColorCAC = oppLrigCardCAC ? (ctx.cardMap.get(oppLrigCardCAC)?.Color ?? '') : '';
      const colorsCAC = condCAC.colors ?? [];
      const metCAC = colorsCAC.some(c => oppLrigColorCAC.includes(c));
      return done(addLog(ctx, `条件付きアーツコスト（相手ルリグ${colorsCAC.join('/')}：${metCAC ? '条件達成・割引適用済み' : '未達成'}）`));
    }
    if (condCAC.kind === 'center_lrig_level') {
      const myLrigCardCAC = ctx.ownerState.field.lrig.at(-1);
      const myLevelCAC = myLrigCardCAC ? parseInt(ctx.cardMap.get(myLrigCardCAC)?.Level ?? '0') : 0;
      const opCAC = condCAC.op ?? '以上';
      let metCAC = opCAC === '以上' ? myLevelCAC >= (condCAC.level ?? 0) : myLevelCAC <= (condCAC.level ?? 0);
      let extraCAC = '';
      if (condCAC.oppLevel !== undefined) {
        const oppLrigCardCAC2 = ctx.otherState.field.lrig.at(-1);
        const oppLevelCAC = oppLrigCardCAC2 ? parseInt(ctx.cardMap.get(oppLrigCardCAC2)?.Level ?? '0') : 0;
        const oppOpCAC = condCAC.oppOp ?? '以上';
        metCAC = metCAC && (oppOpCAC === '以上' ? oppLevelCAC >= condCAC.oppLevel : oppLevelCAC <= condCAC.oppLevel);
        extraCAC = `・相手Lv${oppLevelCAC}${oppOpCAC}${condCAC.oppLevel}`;
      }
      return done(addLog(ctx, `条件付きアーツコスト（センタールリグLv${myLevelCAC}${opCAC}${condCAC.level}${extraCAC}：${metCAC ? '条件達成' : '未達成'}）`));
    }
    // self_life_count
    const lifeCAC = ctx.ownerState.life_cloth.length;
    const opLifeCAC = condCAC.op ?? '以下';
    const metLifeCAC = opLifeCAC === '以上' ? lifeCAC >= (condCAC.level ?? 0) : lifeCAC <= (condCAC.level ?? 0);
    return done(addLog(ctx, `条件付きアーツコスト（ライフ${lifeCAC}枚${opLifeCAC}${condCAC.level}：${metLifeCAC ? '条件達成' : '未達成'}）`));
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
    // 選択後にここへ来た時点で任意支払いは実際に成立している。
    // 後続の ARTS_EXTRA_COST_CONDITION 等が支払い結果を参照できるよう記録する。
    let newOwnerOTEC = { ...ctx.ownerState, energy: newEnergyOTEC, self_optional_effect_taken: true };
    if (destMOTEC === 'hand') {
      newOwnerOTEC = { ...newOwnerOTEC, hand: [...newOwnerOTEC.hand, selectedCardOTEC] };
      return done(addLog({ ...ctx, ownerState: newOwnerOTEC }, `${cardNameOTEC}をエナから手札へ`));
    }
    newOwnerOTEC = { ...newOwnerOTEC, trash: [...newOwnerOTEC.trash, selectedCardOTEC] };
    return done(addLog({ ...ctx, ownerState: newOwnerOTEC }, `${cardNameOTEC}をエナからトラッシュへ`));
  }
  // 🏁**§5.3 `O-60` 第61バッチ（2026-09-03）＝`INTERNAL_OTEC_SKIP` を撤去した。**
  //   `ARTS_EXTRA_COST_CONDITION` 専用の「スキップしても後続の多択は出す」分岐からしか呼ばれておらず、
  //   その分岐ごと消えた（呼び出し元0・live 0）。任意コストのスキップは汎用経路の
  //   `INTERNAL_CLEAR_OPTIONAL_EFFECT_TAKEN` が同じ役割を持つ。
  // 🏁**§5.3 `O-60` 第60バッチ（2026-09-03）＝`CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE` を撤去した。**
  //   1つの id に**2つの文型**（センタールリグのレベル条件／追加コストの支払い）が同居しており、
  //   選択肢も**このハンドラ専用の ①〜④ 解析表**（`choiceTextParser` とは別実装＝同じ仕事の2つ目のコピー）で
  //   組んでいた。いまは parser が `CHOOSE{conditionChoose}`（`LRIG_LEVEL`）と
  //   `CHOOSE{additionalCostChoose}`（直前の `STUB{OPTIONAL_COST}` が支払いを提示）へ振り分ける。
  //   ⚠`INTERNAL_CMCLG_DEDUCT`（任意コストのエナ消費）は `USE_SPELL_FROM_TRASH_PAYING_COST` からも
  //     使われているので残す。`INTERNAL_CMCLG_APPLY_POWER_MOD` は下の
  //     `POWER_MOD_BY_FIELD_CLASS_LEVEL_SUM` の継続なので残す。それ以外の `INTERNAL_CMCLG_*` は
  //     このハンドラからしか呼ばれない死枝だったので一緒に撤去した。
  // INTERNAL_CMCLG_DEDUCT: 任意コストのエナを消費（実行時に組み立てる汎用の支払いステップ。
  //   `CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE` 発祥だが、支払い額が実行時に決まる形なら誰でも使える
  //   ＝§6.4 O-35 の `USE_SPELL_FROM_TRASH_PAYING_COST`（選んだスペルの印刷コスト）も同じ手順を通す）。
  // 🔴**支払ったエナはトラッシュへ置く**＝従来 `energy` から抜くだけでカードが**ゲームから消えて**いた
  //   （リフレッシュのデッキ枚数が合わなくなる。§6.4 O-35・続き530 で発見）。
  if (stub.id === 'INTERNAL_CMCLG_DEDUCT') {
    const colorsArr: string[] = JSON.parse(typeof stub.value === 'string' ? stub.value : '[]');
    const newEnergyDEDUCT = [...ctx.ownerState.energy];
    const paidDEDUCT: string[] = [];
    for (const col of colorsArr) {
      const idx = newEnergyDEDUCT.findIndex(en => {
        const c = ctx.cardMap.get(en)?.Color ?? '無';
        return col === '無' || c.includes(col);
      });
      if (idx >= 0) paidDEDUCT.push(...newEnergyDEDUCT.splice(idx, 1));
    }
    return done(addLog({ ...ctx, ownerState: {
      ...ctx.ownerState, energy: newEnergyDEDUCT, trash: [...ctx.ownerState.trash, ...paidDEDUCT],
    } }, `追加コスト消費（${colorsArr.map(c => `《${c}》`).join('')}）`));
  }
  // 🆕🔴**§5.3 `O-60` 第60バッチ（2026-09-03）＝カード全文 regex を撤去して payload で決める。**
  //   旧 id は `INTERNAL_CMCLG_POWER_MOD_BY_CLASS_LEVELS` で、**カード全文**に
  //   `/＜([^＞]+)＞のシグニのレベルを合計/` を当ててクラスを決めていた＝
  //   ①選択肢が複数ある札では**別の選択肢の＜X＞**を拾いうる ②外れると `clsPMBCL===''` で
  //   `CardClass.includes('')` が**全シグニに真**＝場のシグニ全部のレベル合計になる（過剰）。
  //   いまは `fieldClassLevelSumPower` の payload だけを読む（無ければ何もしない＝fail-closed）。
  // POWER_MOD_BY_FIELD_CLASS_LEVEL_SUM: 自分の場の＜X＞シグニのレベル合計×deltaPerLevel で対象のパワーを修正
  if (stub.id === 'POWER_MOD_BY_FIELD_CLASS_LEVEL_SUM') {
    const specPMBCL = stub.fieldClassLevelSumPower;
    if (!specPMBCL) return done(addLog(ctx, '[未実装] クラス別レベル合計パワー修正（payload なし）'));
    const clsPMBCL = specPMBCL.story;
    let levelSumPMBCL = 0;
    for (const stack of ctx.ownerState.field.signi) {
      const top = stack?.at(-1);
      if (!top) continue;
      const c = ctx.cardMap.get(top);
      if (!c || !c.CardClass?.includes(clsPMBCL)) continue;
      levelSumPMBCL += parseInt(c.Level ?? '0') || 0;
    }
    const deltaPMBCL = levelSumPMBCL * specPMBCL.deltaPerLevel;
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
  // 🏁**§5.3 `O-245`（2026-09-04）＝`DRAW_ON_OPP_POWER_ZERO` ハンドラを撤去した。**
  //   🔴書き込み先 `draw_on_opp_power_zero` に**読み手が1人もいなかった**（`npm run census:deadstate` で検出）
  //   ＝宣言だけ立って何も起きない真 no-op。`census:stubs` A群にも `census:enginetext` にも映らない形。
  //   ⇒ parser が `INSTALL_DELAYED_TRIGGER{ON_SIGNI_POWER_ZERO_OR_LESS, zeroedOwner:'opponent'}` を出し、
  //     `triggerCollect.collectPowerZeroTriggers` が発火させる（`O-92` 族の既存機構）。
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
  // 🆕🔴**§5.3 `O-60` 第59バッチ（2026-09-03）＝原文 regex を撤去して payload で決める。**
  //   旧実装は `sourceAbilityText(ctx)` に `各プレイヤー|すべてのシグニ` と `対戦相手` の**2本だけ**を当てて
  //   「誰の分か」を決め、**流すゾーンは常に「シグニ＋キー」に固定**していた。⇒ 2通りに壊れていた＝
  //   🔴①`WX07-017-E1`（原文「各プレイヤーは、自分の**手札とエナゾーンにあるカードと場にあるシグニを**
  //     すべてトラッシュに置く」）は**手札とエナが1枚も流れず**（過小実行）、
  //     **原文に無いキーまでルリグトラッシュへ送っていた**（過剰実行）。
  //   ②`WXEX2-21-E3`（原文「すべてのシグニをトラッシュに置き、**すべてのキー**をルリグトラッシュに置く」）
  //     だけが「シグニ＋キー」で正しく、**2つの別々の文型が1つの id に同居**していた。
  // ⚠**payload が無い宣言は何もしない**（fail-closed）＝盤面を全部流す破壊的な既定は持たせない。
  if (stub.id === 'TRASH_ALL_SIGNI_AND_KEY') {
    const specTAK = stub.trashAllScope;
    if (!specTAK) return done(addLog(ctx, '[未実装] 全体トラッシュ（payload なし）'));
    const targetsTAK: ('self' | 'opponent')[] = specTAK.owner === 'both'
      ? ['self', 'opponent'] : [specTAK.owner];
    let ctxTAK = ctx;
    let signiTAK = 0, handTAK = 0, energyTAK = 0, keysTAK = 0;
    for (const target of targetsTAK) {
      const st = ownerState(target, ctxTAK);
      const moveSigni = specTAK.zones.includes('signi');
      const moveHand = specTAK.zones.includes('hand');
      const moveEnergy = specTAK.zones.includes('energy');
      const signiAll = moveSigni ? st.field.signi.flatMap(s => s ?? []) : [];
      const handAll = moveHand ? [...st.hand] : [];
      const energyAll = moveEnergy ? [...st.energy] : [];
      const keyCard = specTAK.keys ? st.field.key_piece : null;
      const newSt: PlayerState = {
        ...st,
        ...(moveHand ? { hand: [] } : {}),
        ...(moveEnergy ? { energy: [] } : {}),
        trash: [...st.trash, ...signiAll, ...handAll, ...energyAll],
        lrig_trash: keyCard ? [...st.lrig_trash, keyCard] : st.lrig_trash,
        field: {
          ...st.field,
          ...(moveSigni ? { signi: [null, null, null] as (string[] | null)[] } : {}),
          ...(specTAK.keys ? { key_piece: null } : {}),
        },
      };
      signiTAK += signiAll.length; handTAK += handAll.length; energyTAK += energyAll.length;
      if (keyCard) keysTAK++;
      ctxTAK = setOwnerState(target, newSt, ctxTAK);
    }
    const partsTAK = [
      ...(signiTAK > 0 ? [`シグニ${signiTAK}体`] : []),
      ...(handTAK > 0 ? [`手札${handTAK}枚`] : []),
      ...(energyTAK > 0 ? [`エナ${energyTAK}枚`] : []),
      ...(keysTAK > 0 ? [`キー${keysTAK}`] : []),
    ];
    return done(addLog(ctxTAK, `${partsTAK.join('＋') || '対象なし'}をトラッシュへ`));
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
    const classM = txtRU.match(/＜([^＞]+)＞のシグニが(?:[０-９\d]+枚)?めくれるまで/);
    const targetClassRU = classM ? classM[1] : null;
    const lvM = txtRU.match(/レベル([０-９\d]+)を持つ/);
    const targetLvRU = lvM ? parseInt(toHWRU(lvM[1])) : null;
    const untilSigniRU = !!txtRU.match(/シグニが(?:[０-９\d]+枚)?めくれるまで/);
    const untilSigniCountM = txtRU.match(/シグニが([０-９\d]+)枚めくれるまで/);
    const untilSigniCountRU = untilSigniCountM ? parseInt(toHWRU(untilSigniCountM[1])) : 1;
    const untilNameRU = !!txtRU.match(/宣言したカードがめくれるまで|宣言したカードが公開されるまで/);
    const declaredNameRU = ctx.ownerState.declared_card_name ?? null;
    const toTrashRestRU = !!txtRU.match(/残りをトラッシュに置く/);
    const toBottomRestRU = !!txtRU.match(/残り.*デッキの一番下/);
    const toBottomAllRU = !!txtRU.match(/公開された?カードを(?:シャッフルして)?デッキの一番下に置く/);
    const toBottomOtherRU = !!txtRU.match(/公開した他のカードを(?:シャッフルして)?デッキの一番下に置く/);
    const hitToHandRU = !!txtRU.match(/それを手札に加える/);
    // 「公開したカードをトラッシュに置く」＝ヒットシグニを含む公開カード全てをトラッシュへ（WXK10-031）。
    // ヒットシグニはレベル参照（lastProcessedCards）としてのみ使い、物理的にはトラッシュに置く。未対応だと deck から除去され行き場を失い消失していた。
    // 「（この方法で）公開されたカードをトラッシュに置く」も同義（WXK01-037）。従来はどの廃棄分岐にも掛からず
    // 公開札が消滅していた＝安全網（デッキ下へ戻す）でも原文の「トラッシュ」と食い違うため、ここで受ける。
    const toTrashAllRU = !!txtRU.match(/公開した(?:カード|カードすべて)をトラッシュに置く/)
      || !!txtRU.match(/(?:この方法で)?公開されたカードをトラッシュに置く/);
    // デッキを先頭から公開していく
    const deckRU = [...stateRU.deck];
    const revealedRU: string[] = [];
    let hitCardRU: string | null = null;
    let hitCountRU = 0;
    for (const cn of deckRU) {
      revealedRU.push(cn);
      const card = ctx.cardMap.get(cn);
      let stop = false;
      if (untilSigniRU && card?.Type === 'シグニ') {
        if (!targetClassRU || card?.CardClass?.includes(targetClassRU)) {
          if (!targetLvRU || parseInt(card?.Level ?? '0') === targetLvRU) {
            hitCountRU++;
            if (hitCountRU >= untilSigniCountRU) stop = true;
          }
        }
      }
      if (untilNameRU && declaredNameRU && card?.CardName === declaredNameRU) stop = true;
      if (!untilSigniRU && !untilNameRU) { break; } // 条件不明：先頭1枚
      if (stop) { hitCardRU = cn; break; }
    }
    const nonHitRU = revealedRU.filter(cn => cn !== hitCardRU);
    let newStateRU = { ...stateRU, deck: deckRU.filter(cn => !revealedRU.includes(cn)) };
    if (toTrashAllRU && revealedRU.length > 0) newStateRU = { ...newStateRU, trash: [...newStateRU.trash, ...revealedRU] };
    else if (toTrashRestRU && nonHitRU.length > 0) newStateRU = { ...newStateRU, trash: [...newStateRU.trash, ...nonHitRU] };
    if (hitToHandRU && hitCardRU) newStateRU = { ...newStateRU, hand: [...newStateRU.hand, hitCardRU] };
    if (toBottomRestRU && nonHitRU.length > 0) {
      const bottomRU = txtRU.match(/残りをシャッフルして/) ? shuffle([...nonHitRU]) : nonHitRU;
      newStateRU = { ...newStateRU, deck: [...newStateRU.deck, ...bottomRU] };
    }
    if (toBottomAllRU && revealedRU.length > 0) {
      newStateRU = { ...newStateRU, deck: [...newStateRU.deck, ...shuffle([...revealedRU])] };
    } else if (toBottomOtherRU && nonHitRU.length > 0) {
      newStateRU = { ...newStateRU, deck: [...newStateRU.deck, ...shuffle([...nonHitRU])] };
    } else if (!toTrashAllRU && !toTrashRestRU && !toBottomRestRU && !hitToHandRU && revealedRU.length > 0) {
      // 未知文型でも公開カードをゲームから消さない安全網。
      newStateRU = { ...newStateRU, deck: [...newStateRU.deck, ...shuffle([...revealedRU])] };
    }
    const newCtxRU = isOpp
      ? { ...ctx, otherState: newStateRU, lastProcessedCards: revealedRU }
      : { ...ctx, ownerState: newStateRU, lastProcessedCards: revealedRU };
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
  // 🆕**候補は「`SONG_ICON` 効果を持つカード」で判定する**（§5.3 `O-60` 第55バッチ・2026-09-03）。
  // 🔴旧は `EffectText.includes('【歌のカケラ】')`＝**原文にその語が出るだけ**で候補にしていた。
  //   実測＝原文に【歌のカケラ】を含む26枚のうち **`WX26-CP1-101`（スペル「力を貸して！」）は
  //   自分の【歌のカケラ】を持たない**（「【歌のカケラ】を**持つカード**」と書いているだけ）＝
  //   エナゾーンにあると候補に出て、選ぶと**トラッシュへ置かれるだけで何も起きない**（カードの丸損）。
  // 🔑`SONG_ICON` はまさに `/【歌のカケラ】：/` から作られる効果なので、構造化された判定と原文が一致する。
  if (stub.id === 'SONG_FRAGMENT') {
    const lrigCardNumSF = ctx.sourceCardNum; // 発動元ルリグ
    const songCardsInEnergy = ctx.ownerState.energy.filter(cn => songIconEffectOf(ctx, cn));
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
    const songCardData = ctx.cardMap.get(getCardNum(songCard));
    const newOwnerSF: PlayerState = {
      ...ctx.ownerState,
      energy: ctx.ownerState.energy.filter(cn => cn !== songCard),
      trash: [...ctx.ownerState.trash, songCard],
    };
    const songEff = songIconEffectOf(ctx, songCard);
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
    const songCardDataISF = ctx.cardMap.get(getCardNum(selectedSF));
    const newOwnerISF: PlayerState = {
      ...ctx.ownerState,
      energy: ctx.ownerState.energy.filter(cn => cn !== selectedSF),
      trash: [...ctx.ownerState.trash, selectedSF],
    };
    const songEffISF = songIconEffectOf(ctx, selectedSF);
    if (songEffISF) {
      // sourceCardNum をルリグのCardNumに設定（ルリグ効果として扱うため）
      const songCtxISF = { ...ctx, ownerState: newOwnerISF, sourceCardNum: lrigCardNumISF };
      return exec(songEffISF.action, addLog(songCtxISF, `【歌のカケラ】発動（${songCardDataISF?.CardName ?? selectedSF}）：ルリグ効果として処理`));
    }
    return done(addLog({ ...ctx, ownerState: newOwnerISF }, `歌のカケラ（${songCardDataISF?.CardName ?? selectedSF}）：効果なし`));
  }
  // ゲーム全体能力付与
  if (stub.id === 'INSTALL_GAME_GRANTED_AUTO') {
    const sourceNum = ctx.sourceCardNum ? getCardNum(ctx.sourceCardNum) : '';
    const sourceCard = sourceNum ? ctx.cardMap.get(sourceNum) : undefined;
    const sourceEffects = sourceNum
      ? (ctx.effectsMap?.get(sourceNum) ?? (sourceCard ? parseCardEffects(sourceCard) : []))
      : [];
    const granted = sourceEffects.filter(e => e.effectType === 'AUTO');
    const existing = ctx.ownerState.game_granted_auto_effects ?? [];
    const existingIds = new Set(existing.map(e => e.effectId));
    const additions = granted.filter(e => !existingIds.has(e.effectId));
    return done(addLog({
      ...ctx,
      ownerState: {
        ...ctx.ownerState,
        game_granted_auto_effects: [...existing, ...additions],
      },
    }, `ゲーム持続AUTO能力を${additions.length}件インストール`));
  }
  if (stub.id === 'REPLACE_NEXT_OPP_REFRESH_MILL_LRIG') {
    if (ctx.otherState.life_cloth.length !== 0) {
      return done(addLog(ctx, '対戦相手のライフクロスが0枚ではないためリフレッシュ置換不発'));
    }
    return done(addLog({
      ...ctx,
      otherState: { ...ctx.otherState, next_refresh_replaced: true },
    }, '対戦相手の次のリフレッシュを置換'));
  }
  // GAIN_ABILITY_THIS_GAME: このゲームの間、グロウ不可・キーワード付与・特定カード名の使用禁止などの常在効果を得る
  // 🆕**§5.3 `O-60` 第49バッチ（2026-09-03）＝`stub.gameGrants`（payload）だけを読む。**
  // 🔴旧実装は `EffectText + BurstText`（＝カード全文）を**24本のリテラル regex** で読み分けていた
  //   （`census:enginetext` A🔴 の最大の catch-all）。読み替えの理由は3つ：
  //   ①カード全文なので**同じカードの別効果やライフバースト文の語句で宣言が立ちうる**
  //   ②regex が外れても盤面が動かないだけで**誰も気づけない**（`メインフェイズ開始時.*手札.*5枚以下` は
  //     原文が全角「５枚以下」なので1枚も当たらず、`WXDi-P11-004` は丸ごと無言 no-op だった）
  //   ③同じ効果に本 STUB が2つ並ぶ形（`WXK03-003A-E2`）で**1回の起動なのに全文を2回読んでいた**＝
  //     `lrig_activation_count` が2進み、5回目の裏返しが3回目に来ていた。
  // 🔑**原文を読むのは parser（`src/data/parsers/gameGrants.ts`・効果単位の原文）だけ**。
  // ⚠**payload が無い／空なら何も宣言しない**（fail-closed）＝旧既定の「全文を読んで拾えたものを全部立てる」の逆。
  if (stub.id === 'GAIN_ABILITY_THIS_GAME') {
    const grantsGA = stub.gameGrants;
    if (!grantsGA) return done(addLog(ctx, '[未実装] このゲームの間の宣言（gameGrants なし）'));
    let ctxGA = ctx;
    const logsGA: string[] = [];
    for (const g of grantsGA) {
      switch (g.kind) {
        case 'noGrow': {
          ctxGA = g.player === 'opponent'
            ? { ...ctxGA, otherState: { ...ctxGA.otherState, no_grow: true } }
            : { ...ctxGA, ownerState: { ...ctxGA.ownerState, no_grow: true } };
          logsGA.push(g.player === 'opponent' ? '相手グロウ不可（このゲーム）' : 'グロウ不可（このゲーム）');
          break;
        }
        case 'centerLrigKeyword': {
          const centerGA = ctxGA.ownerState.field.lrig.at(-1);
          if (!centerGA) break;
          const grantsMapGA = { ...(ctxGA.ownerState.keyword_grants ?? {}) };
          grantsMapGA[centerGA] = [...new Set([...(grantsMapGA[centerGA] ?? []), g.keyword])];
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, keyword_grants: grantsMapGA } };
          logsGA.push(`センタールリグに${g.keyword}付与（このゲーム）`);
          break;
        }
        case 'blockCardName':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState,
            blocked_card_names: [...(ctxGA.ownerState.blocked_card_names ?? []), g.cardName] } };
          logsGA.push(`《${g.cardName}》の使用をブロック`);
          break;
        case 'suppressLifeBurst':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_suppress_lb: true } };
          logsGA.push('ライフバースト全無効（このゲーム）');
          break;
        case 'mainPhaseDrawIfHandLte':
          // ⚠消費地点（`BattleScreen`）の閾値は 5 固定＝payload の `handLte` が5以外なら近似になる。
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_main_draw: true } };
          logsGA.push(`メインフェイズ開始時ドロー（手札${g.handLte}枚以下・このゲーム）`);
          break;
        case 'growDraw':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_grow_draw: true } };
          logsGA.push('グロウ時ドロー（このゲーム）');
          break;
        case 'handSizeBonus':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState,
            game_hand_size_bonus: (ctxGA.ownerState.game_hand_size_bonus ?? 0) + g.value } };
          logsGA.push(`手札上限+${g.value}（このゲーム）`);
          break;
        case 'energyPhaseDraw':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_energy_phase_draw: true } };
          logsGA.push('エナフェイズ開始時ドロー（このゲーム）');
          break;
        case 'deckSigniLevelOverride':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState,
            deck_signi_level_override: { class: g.cardClass, level: g.level } } };
          logsGA.push(`デッキ内＜${g.cardClass}＞シグニのレベルをLv${g.level}扱い（このゲーム）`);
          break;
        case 'noCoinGain':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_no_coin_gain: true } };
          logsGA.push('コイン獲得禁止（このゲーム）');
          break;
        case 'declaredSigniLevelZero':
          // ⚠🔴**書き込み先 `game_declared_signi_level_zero` に読み手が1人もいない**（§5.3 `O-226`）＝
          //   宣言は立つが盤面は動かない。payload 化で穴が可視になっただけで、旧実装と挙動は同じ。
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_declared_signi_level_zero: true } };
          logsGA.push('宣言シグニのレベル0（このゲーム）');
          break;
        case 'declaredSigniIgnoreRestriction':
          // ⚠🔴同上＝`game_declared_signi_ignore_restriction` も読み手0（§5.3 `O-226`）。
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_declared_signi_ignore_restriction: true } };
          logsGA.push('宣言シグニの限定条件無視（このゲーム）');
          break;
        case 'oppGuardExtraHandOrColorless':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState,
            game_opp_extra_guard_hand_or_colorless: g.handCount } };
          logsGA.push(`相手ガード追加コスト（手札${g.handCount}枚か《無》・このゲーム）`);
          break;
        case 'oppGuardExtraColorless':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_opp_guard_extra_colorless: true } };
          logsGA.push('相手ガード追加《無》コスト（このゲーム）');
          break;
        case 'guardAltHand':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_guard_alt_hand: g.handCount } };
          logsGA.push(`ガード代替：手札${g.handCount}枚捨て（このゲーム）`);
          break;
        case 'guardBarrierAct':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_guard_barrier_act: true } };
          logsGA.push('ガードシグニ捨て→ルリグバリア能力付与（このゲーム）');
          break;
        case 'turnEndTrashToHand':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState,
            game_turn_end_trash_to_hand: { class: g.cardClass, count: g.count } } };
          logsGA.push(`ターン終了時トラッシュ＜${g.cardClass}＞シグニ→手札（このゲーム）`);
          break;
        case 'growPhaseLimitPlus':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, game_grow_phase_limit_plus: g.value } };
          logsGA.push(`グロウフェイズ開始時リミット+${g.value}（このゲーム・累積）`);
          break;
        case 'lrigCopyOppLevelLimit':
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, lrig_copy_opp_level_limit: true } };
          logsGA.push('ルリグのレベル・リミットを相手センタールリグからコピー（このゲーム）');
          break;
        case 'nthActivationFlip': {
          // ⚠🔴**裏返しそのものは未実装**（ログだけ）＝`lrig_activation_count` にも読み手が無い（§5.3 `O-226`）。
          const srcNumGA = ctx.sourceCardNum ?? '';
          const countMapGA = { ...(ctxGA.ownerState.lrig_activation_count ?? {}) };
          countMapGA[srcNumGA] = (countMapGA[srcNumGA] ?? 0) + 1;
          ctxGA = { ...ctxGA, ownerState: { ...ctxGA.ownerState, lrig_activation_count: countMapGA } };
          logsGA.push(countMapGA[srcNumGA] >= g.count
            ? `このルリグを裏返す（${countMapGA[srcNumGA]}/${g.count}回目：裏返し実行ログのみ）`
            : `このゲームN回目起動（${countMapGA[srcNumGA]}/${g.count}回）`);
          break;
        }
        case 'abilityBlockHeader':
          logsGA.push('ゲーム能力ブロック付与');
          break;
      }
    }
    if (logsGA.length > 0) return done(addLog(ctxGA, logsGA.join('・')));
    return done(addLog(ctx, '[未実装] このゲームの間の宣言（gameGrants が空）'));
  }
  // 「このメインフェイズを終了する」（`WXK06-078-E1`・§6.4 O-3 続き491）。
  // ⚠🔴従来は**ログを1行出すだけ**で state を一切書いていなかった＝`census:stubs` は「ハンドラがある」
  //   ことをもって実装済みと判定するため、A群にも出ない**無言 no-op** だった（続き459 の教訓の実例）。
  // 🔑消費地点は「メインフェイズを封じる」1点（`MAIN_PHASE`＝`PHASE_SKIP_BLOCK_IDS` と同じ語彙）。
  //   人間側は `BattleScreen` の自動進行 effect が、CPU 側は召喚ループのガードが読む。
  //   ⚠`:NEXT_TURN` を付けない＝**このターン限り**（ターン終了時に unsuffixed なぶんが落ちる）。
  if (stub.id === 'SKIP_MAIN_PHASE') {
    const blockedSMP = ctx.ownerState.blocked_actions ?? [];
    if (blockedSMP.includes('MAIN_PHASE')) return done(addLog(ctx, 'メインフェイズは既に終了予約済み'));
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, blocked_actions: [...blockedSMP, 'MAIN_PHASE'] } },
      'このメインフェイズを終了する'));
  }
  // ライフクロスの一番上を手札に加える
  // 🆕**どちらのライフかは payload（既存の汎用 `owner`）**（§5.3 `O-60` 第53バッチ・2026-09-03）。
  // 🔴旧実装は `EffectText + BurstText`（**カード全文**）で所有者を決めていた。しかも
  //   `GRANT_LRIG_ABILITY` の子として実行される `WXDi-P07-001` では効果元が**付与先のルリグ**になるため、
  //   **`effectId` の `-sub-E\d+` からカード番号を逆引きする足場**まで engine 側に生えていた
  //   ＝「原文を読むために engine が経路情報を復元する」という一番重い形だった。
  // ⚠**payload が無ければ何もしない**（fail-closed）＝既定 self へ倒すと**自分のライフを手札に加える**
  //   （原文と逆向きの利得）になる。
  if (stub.id === 'CRASH_LIFE_TO_HAND') {
    const target = stub.owner;
    if (target !== 'self' && target !== 'opponent') {
      return done(addLog(ctx, '[CRASH_LIFE_TO_HAND: 対象プレイヤーなし（未指定）]'));
    }
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
  // 対象プレイヤーのライフクロス上1枚を、そのプレイヤーのエナゾーンへ置く。
  // クラッシュではないためライフバースト/check は発生させない。
  if (stub.id === 'LIFE_TO_ENERGY') {
    const target = stub.owner ?? 'self';
    const st = ownerState(target, ctx);
    if (st.life_cloth.length === 0) return done(addLog(ctx, 'ライフクロスなし（LIFE_TO_ENERGY）'));
    const top = st.life_cloth[st.life_cloth.length - 1];
    const newSt: PlayerState = {
      ...st,
      life_cloth: st.life_cloth.slice(0, -1),
      energy: [...st.energy, top],
    };
    const name = ctx.cardMap.get(top)?.CardName ?? top;
    return done(addLog(setOwnerState(target, newSt, ctx), `ライフクロス上（${name}）をエナゾーンへ`));
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
    // 原文がクラスを列挙している場合（「＜精像＞か＜精武＞か…から１つを宣言する」PR-431）はその候補だけを出す。
    // 列挙があるのに動的収集の全クラスから選ばせると、原文にない有利なクラスを宣言できる過剰実行になる。
    if (stub.declareOptions?.length) {
      return needsInteraction(addLog(ctx, 'クラスを宣言してください'), {
        type: 'CHOOSE',
        options: stub.declareOptions.map(cls => ({
          id: `dcls_${cls}`, label: `＜${cls}＞`,
          action: ({ type: 'STUB', id: 'DECLARE_CLASS', value: cls } as StubAction) as EffectAction,
          available: true,
        })),
        count: 1,
      });
    }
    // 🆕`declareFromLastProcessed`＝候補は**直前に処理したカード**の中で `minCount` 回以上出たクラスだけ
    //   （`WD08-008-E1`「この方法でトラッシュに置いたカードの中に共通するクラスを持つカードが3枚以上ある場合、
    //   そのクラス1つを選択する」）。下の動的収集に倒すと盤面・手札・トラッシュの全クラスが選べてしまう。
    if (stub.declareFromLastProcessed) {
      const needDFL = stub.declareFromLastProcessed.minCount ?? 1;
      const tallyDFL = new Map<string, number>();
      for (const cn of ctx.lastProcessedCards ?? []) {
        const c = ctx.cardMap.get(getCardNum(cn));
        if (c?.Type !== 'シグニ' || !c.CardClass) continue;
        for (const raw of c.CardClass.replace(/[＜＞]/g, '').split(/[・/]/)) {
          const t = raw.trim();
          if (!t || t === '-') continue;
          tallyDFL.set(t, (tallyDFL.get(t) ?? 0) + 1);
        }
      }
      const optsDFL = [...tallyDFL.entries()].filter(([, n]) => n >= needDFL).map(([cls]) => cls).sort();
      if (optsDFL.length === 0) return done(addLog(ctx, 'クラス宣言：条件を満たすクラスなし'));
      if (optsDFL.length === 1) {
        const onlyDFL = optsDFL[0];
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, declared_class: onlyDFL } },
          `クラス「${onlyDFL}」を選択`));
      }
      return needsInteraction(addLog(ctx, 'クラスを1つ選択してください'), {
        type: 'CHOOSE',
        options: optsDFL.map(cls => ({
          id: `dcls_${cls}`, label: `＜${cls}＞`,
          action: ({ type: 'STUB', id: 'DECLARE_CLASS', value: cls } as StubAction) as EffectAction,
          available: true,
        })),
        count: 1,
      });
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
  // WDK04-006: 対戦相手が偶数/奇数を宣言する。値は汎用 declared_number に偶=0/奇=1で保存し、
  // ガード制限用 declared_guard_restrict_level は立てない。
  if (stub.id === 'DECLARE_PARITY_OPPONENT') {
    const options = [
      { id: 'parity_even', label: '偶数を宣言', action: { type: 'STUB', id: 'SET_DECLARED_PARITY', value: 0 } as EffectAction, available: true },
      { id: 'parity_odd', label: '奇数を宣言', action: { type: 'STUB', id: 'SET_DECLARED_PARITY', value: 1 } as EffectAction, available: true },
    ];
    return needsInteraction(addLog(ctx, '対戦相手が偶数か奇数を宣言'), {
      type: 'CHOOSE', options, count: 1, opponentResponds: true,
    });
  }
  if (stub.id === 'SET_DECLARED_PARITY') {
    const parity = Number(stub.value) === 1 ? 1 : 0;
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, declared_number: parity } },
      `${parity === 0 ? '偶数' : '奇数'}を宣言`));
  }
  if (stub.id === 'INTERNAL_RESOLVE_PILES') {
    const trashCards = stub.pileTrashCards ?? [];
    const handCards = stub.pileHandCards ?? [];
    const moving = new Set([...trashCards, ...handCards]);
    const deckCards = ctx.ownerState.deck.filter(n => moving.has(n));
    const deckSet = new Set(deckCards);
    const toTrash = trashCards.filter(n => deckSet.has(n));
    const toHand = handCards.filter(n => deckSet.has(n));
    const newOwner = {
      ...ctx.ownerState,
      deck: ctx.ownerState.deck.filter(n => !moving.has(n)),
      trash: [...ctx.ownerState.trash, ...toTrash],
      hand: [...ctx.ownerState.hand, ...toHand],
    };
    return done(addLog(
      { ...ctx, ownerState: newOwner, lastProcessedCards: [...toTrash, ...toHand] },
      `対戦相手が選んだ束${toTrash.length}枚をトラッシュへ、残り${toHand.length}枚を手札へ`,
    ));
  }
  // DECLARE_COLORS: 原文が列挙した候補から重複なしで複数色を同時宣言する。
  // CHOOSE の複数選択は選択 action を SEQUENCE で実行するため、各色を順に配列へ積む。
  if (stub.id === 'DECLARE_COLORS') {
    if (typeof stub.value === 'string') {
      const declared = [...(ctx.ownerState.declared_colors ?? []), stub.value];
      return done(addLog(
        { ...ctx, ownerState: { ...ctx.ownerState, declared_colors: declared } },
        `色「${stub.value}」を宣言`,
      ));
    }
    const options = stub.declareOptions ?? [];
    const count = stub.count ?? 1;
    if (options.length < count || count <= 0) return done(addLog(ctx, '色宣言：候補不足（スキップ）'));
    const cleared = { ...ctx, ownerState: { ...ctx.ownerState, declared_colors: [] } };
    return needsInteraction(addLog(cleared, '色を宣言してください'), {
      type: 'CHOOSE',
      options: options.map(color => ({
        id: `dcolor_${color}`,
        label: color,
        action: { type: 'STUB', id: 'DECLARE_COLORS', value: color } as StubAction,
        available: true,
      })),
      count,
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
  // デッキ上N枚公開してM枚を手札に加え残りをデッキ下/トラッシュ/エナゾーンへ
  if (stub.id === 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM') {
    const params = stub.revealPickParams
      ?? { pickCount: 1, restDest: 'deck_bottom' as const, then: 'hand' as const };
    // 🆕**公開枚数は payload（`revealPickParams.revealCount`）**（§5.3 `O-60` 第53バッチ・2026-09-03）。
    // 🔴旧実装は `EffectText + BurstText`（**カード全文**）を読んでおり、`WX14-037` は `CHOOSE` の②の枝な
    //   ので**別の枝や別能力の数字**を先頭一致で掴みうる形だった（外れたときの既定 5枚も原文と無関係）。
    // ⚠**payload が無ければ何も公開しない**（fail-closed）。
    if (params.revealCount === undefined) {
      return done(addLog(ctx, '[REVEAL_PICK_HAND_SHUFFLE_BOTTOM: 公開枚数なし（未指定）]'));
    }
    const revealCount = params.revealCount;
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
    // filter は融合前（＝REVEAL_AND_PICK に解決されない経路）でも効かせる。従来は絞り込みが一切なく
    // 「どのカードでも拾える」過剰実行だった（タスク12(xlvi)(h)）。
    // ⚠ 絞り込むときは残りの行き先を restDest（visibleCards 基準）ではなく revealRemainder（公開全体基準）で渡す。
    //   restDest のままだと**非対象の公開カードがデッキ上に取り残される**（remainder の取りこぼし）。
    const restLoc = params.restDest === 'trash' ? 'trash' as const : params.restDest === 'energy' ? 'energy' as const : 'deck' as const;
    const restPos = params.restDest === 'deck_bottom' ? 'bottom' as const : params.restDest === 'deck_top' ? 'top' as const : 'any' as const;
    if (params.filter) {
      const pickable = deckCards.filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), params.filter));
      if (pickable.length === 0) {
        // 対象なし：公開した全カードを残りの行き先へ
        const deckRest = ctx.ownerState.deck.slice(deckCards.length);
        const s = { ...ctx.ownerState,
          deck: restLoc === 'deck' ? [...deckRest, ...deckCards] : deckRest,
          ...(restLoc === 'trash' ? { trash: [...ctx.ownerState.trash, ...deckCards] } : {}),
          ...(restLoc === 'energy' ? { energy: [...ctx.ownerState.energy, ...deckCards] } : {}) };
        return done(addLog({ ...ctx, ownerState: s }, `デッキ上${deckCards.length}枚公開（対象なし）`));
      }
      const pendingF: PendingInteractionDef = {
        type: 'SEARCH',
        visibleCards: pickable,
        maxPick: Math.min(maxPick, pickable.length),
        thenAction: pickDestAction,
        revealRemainder: { cards: deckCards, location: restLoc, position: restPos },
        ...(params.handOrEnergy ? { handOrEnergy: true } : {}),
      };
      return needsInteraction(addLog(ctx, `デッキ上${deckCards.length}枚公開（${maxPick}枚まで${params.handOrEnergy ? '手札かエナへ' : params.then === 'energy' ? 'エナへ' : '手札に'}）`), pendingF);
    }
    const pending: PendingInteractionDef = {
      type: 'SEARCH',
      visibleCards: deckCards,
      maxPick,
      thenAction: pickDestAction,
      restDest: params.restDest,
      ...(params.handOrEnergy ? { handOrEnergy: true } : {}),
    };
    return needsInteraction(addLog(ctx, `デッキ上${deckCards.length}枚公開（${maxPick}枚まで${params.handOrEnergy ? '手札かエナへ' : params.then === 'energy' ? 'エナへ' : '手札に'}）`), pending);
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
  // 🆕🔴**§5.3 `O-60` 第57バッチ（2026-09-03）＝`O-228`。原文 regex を全部撤去して payload で分岐する。**
  //   旧実装は `sourceAbilityText(ctx)`（アビリティブロック全文）に**13本のリテラル**を当てて
  //   13通りに分岐していた＝`census:enginetext` A群の最大項目（live 24効果）で、
  //   **唯一 miss（どの regex にも当たらないカード）が 6枚残っていた**ハンドラ。
  //   その6枚は下の「汎用フォールバック＝効果元シグニの下のソウルを消費しますか？」へ落ちており、
  //   効果元がルリグ／アーツ／ピースでシグニゾーンに居ないため**恒久 no-op** だった。
  // ⚠**payload が無い `SOUL_OP` は何もしない**（fail-closed）＝parser が payload を落としても
  //   「効かない」で済み、原文と無関係な盤面操作にはならない。
  if (stub.id === 'SOUL_OP') {
    const spec = stub.soulOp;
    if (!spec) return done(addLog(ctx, '[未実装] ルリグ下／ルリグトラッシュ操作（payload なし）'));
    const srcSO = ctx.sourceCardNum;
    // ルリグスタックは「先頭が下・末尾がトップ（現ルリグ）」。下のカード＝トップ以外。
    const underOf = (stack: string[] | undefined | null): string[] => (stack && stack.length > 1 ? stack.slice(0, -1) : []);
    const nameOf = (cn: string) => ctx.cardMap.get(cn)?.CardName ?? cn;

    switch (spec.kind) {
      // 「それをルリグデッキに加える」＝効果元カードをルリグトラッシュからルリグデッキへ
      case 'self_to_lrig_deck': {
        if (!srcSO) return done(addLog(ctx, 'ルリグデッキへ戻す対象なし'));
        const newOwner = {
          ...ctx.ownerState,
          lrig_trash: ctx.ownerState.lrig_trash.filter(n => n !== srcSO),
          lrig_deck: [...(ctx.ownerState.lrig_deck ?? []), srcSO],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `${nameOf(srcSO)}をルリグデッキへ`));
      }

      // 「それらをルリグトラッシュに置く」＝直前に処理したカードをルリグトラッシュへ
      case 'processed_to_lrig_trash': {
        const processed = ctx.lastProcessedCards ?? [];
        if (processed.length === 0) return done(addLog(ctx, 'ルリグトラッシュに置くカードなし'));
        const newOwner = { ...ctx.ownerState, lrig_trash: [...ctx.ownerState.lrig_trash, ...processed] };
        return done(addLog({ ...ctx, ownerState: newOwner }, `${processed.length}枚をルリグトラッシュへ`));
      }

      // 「ルリグトラッシュからアーツN枚をルリグデッキに加える」
      case 'lrig_trash_arts_to_lrig_deck': {
        const artsInLrigTrash = ctx.ownerState.lrig_trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'アーツ');
        if (artsInLrigTrash.length === 0) return done(addLog(ctx, 'ルリグトラッシュにアーツなし'));
        const toMove = artsInLrigTrash.slice(0, spec.count ?? 1);
        const newOwner = {
          ...ctx.ownerState,
          lrig_trash: ctx.ownerState.lrig_trash.filter(cn => !toMove.includes(cn)),
          lrig_deck: [...(ctx.ownerState.lrig_deck ?? []), ...toMove],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `${toMove.map(nameOf).join('・')}をルリグデッキへ`));
      }

      // 「このカードをあなたのセンタールリグの下に置く」＝効果元を手札からルリグスタックの下へ
      case 'self_to_under_center': {
        if (!srcSO) return done(addLog(ctx, 'センタールリグ下に置く対象なし'));
        const newOwner = {
          ...ctx.ownerState,
          hand: ctx.ownerState.hand.filter(cn => cn !== srcSO),
          lrig_deck: [...(ctx.ownerState.lrig_deck ?? []), srcSO],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `${nameOf(srcSO)}をルリグデッキ（ルリグ下）へ`));
      }

      // 「ルリグデッキの上からN枚をルリグトラッシュに置く」
      case 'lrig_deck_top_to_lrig_trash': {
        const lrigDeck = ctx.ownerState.lrig_deck ?? [];
        const toTrash = lrigDeck.slice(0, Math.min(spec.count ?? 1, lrigDeck.length));
        if (toTrash.length === 0) return done(addLog(ctx, 'ルリグデッキなし'));
        const newOwner = {
          ...ctx.ownerState,
          lrig_deck: lrigDeck.slice(toTrash.length),
          lrig_trash: [...ctx.ownerState.lrig_trash, ...toTrash],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `ルリグデッキ上${toTrash.length}枚をルリグトラッシュへ`));
      }

      // 「このルリグの下からカード１枚をそれの【ソウル】にする」
      case 'under_to_soul': {
        const underCards = underOf(ctx.ownerState.field.lrig);
        if (underCards.length === 0) return done(addLog(ctx, 'ルリグの下にカードなし（ソウル付与）'));
        const selfSigniCands = [0, 1, 2]
          .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
          .filter((c): c is string => !!c);
        if (selfSigniCands.length === 0) return done(addLog(ctx, 'ソウル付与対象シグニなし'));
        const soulCard = underCards[underCards.length - 1]; // ルリグ直下のカードを使用
        const attachSoulStub: StubAction = { type: 'STUB', id: 'INTERNAL_ATTACH_SOUL_FROM_LRIG', value: soulCard };
        return selectOrInteract(selfSigniCands, 1, false, 'self_field', attachSoulStub, undefined, ctx);
      }

      // 「あなたのルリグトラッシュからルリグ１枚をそれの【ソウル】にする」
      case 'lrig_trash_to_soul': {
        const lrigInTrash = ctx.ownerState.lrig_trash.filter(cn => {
          const c = ctx.cardMap.get(cn);
          return c?.Type === 'ルリグ' || c?.Type === 'アシストルリグ';
        });
        if (lrigInTrash.length === 0) return done(addLog(ctx, 'ルリグトラッシュにルリグなし'));
        const selfSigniSoulCands = [0, 1, 2]
          .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
          .filter((c): c is string => !!c);
        if (selfSigniSoulCands.length === 0) return done(addLog(ctx, 'ソウル付与対象シグニなし'));
        const chooseSoulStub: StubAction = { type: 'STUB', id: 'INTERNAL_CHOOSE_SOUL_LRIG' };
        return selectOrInteract(selfSigniSoulCands, 1, false, 'self_field', chooseSoulStub, undefined, ctx);
      }

      // 「〈センター／この／あなたの〉ルリグの下からカードN枚（または好きな枚数）をルリグトラッシュに置く」
      // ⚠**任意形（「置いてもよい」）はここへ来ない**＝parser が `OPTIONAL_LRIG_UNDER_COST` へ振り分ける。
      case 'under_to_lrig_trash': {
        const lrigStack = ctx.ownerState.field.lrig;
        const centerUnder = underOf(lrigStack);
        const assistLUnder = underOf(ctx.ownerState.field.assist_lrig_l);
        const assistRUnder = underOf(ctx.ownerState.field.assist_lrig_r);
        const pool = spec.fromAllLrigs ? [...centerUnder, ...assistLUnder, ...assistRUnder] : centerUnder;
        if (pool.length === 0) return done(addLog(ctx, 'ルリグの下にカードなし'));
        // 🔑**「N枚」（「まで」が無い）は足りなければ払えない**＝「そうした場合」の前提を満たさない。
        if (!spec.anyCount && !spec.upTo && (spec.count ?? 1) > pool.length) {
          return done(addLog(ctx, `ルリグの下が${pool.length}枚＝${spec.count}枚を置けない`));
        }
        const want = spec.anyCount ? pool.length : Math.min(spec.count ?? 1, pool.length);
        // 下（古い側）から順に取り、各スタックのトップは残す。
        const takeFrom = (under: string[], n: number) => under.slice(0, Math.max(0, Math.min(n, under.length)));
        let remain = want;
        const takeCenter = takeFrom(centerUnder, remain); remain -= takeCenter.length;
        const takeL = spec.fromAllLrigs ? takeFrom(assistLUnder, remain) : []; remain -= takeL.length;
        const takeR = spec.fromAllLrigs ? takeFrom(assistRUnder, remain) : [];
        const moved = [...takeCenter, ...takeL, ...takeR];
        if (moved.length === 0) return done(addLog(ctx, 'ルリグの下にカードなし'));
        const rebuild = (stack: string[] | undefined | null, taken: string[]): string[] => {
          if (!stack || stack.length === 0) return stack ?? [];
          const under = underOf(stack).filter(cn => !taken.includes(cn));
          return [...under, stack[stack.length - 1]];
        };
        const newOwner: PlayerState = {
          ...ctx.ownerState,
          field: {
            ...ctx.ownerState.field,
            lrig: rebuild(lrigStack, takeCenter),
            ...(spec.fromAllLrigs ? {
              assist_lrig_l: rebuild(ctx.ownerState.field.assist_lrig_l, takeL),
              assist_lrig_r: rebuild(ctx.ownerState.field.assist_lrig_r, takeR),
            } : {}),
          },
          lrig_trash: [...ctx.ownerState.lrig_trash, ...moved],
        };
        return done(addLog({ ...ctx, ownerState: newOwner, lastProcessedCards: moved },
          `ルリグ下${moved.length}枚（${moved.map(nameOf).join('・')}）をルリグトラッシュへ`));
      }

      // 「あなたのルリグトラッシュから〈レベル条件〉のルリグをN枚まで対象とし、センタールリグの下に置く」
      case 'lrig_trash_to_under_center': {
        const centerTop = ctx.ownerState.field.lrig.at(-1);
        const centerCard = centerTop ? ctx.cardMap.get(centerTop) : undefined;
        const candidates = ctx.ownerState.lrig_trash.filter(cn => {
          const c = ctx.cardMap.get(cn);
          if (!c) return false;
          if (c.Type !== 'ルリグ' && c.Type !== 'アシストルリグ') return false;
          const lv = parseInt(c.Level ?? '', 10);
          if (spec.level !== undefined && lv !== spec.level) return false;
          if (spec.levelMax !== undefined && !(Number.isFinite(lv) && lv <= spec.levelMax)) return false;
          if (spec.sameLrigType && centerCard) {
            return c.CardClass === centerCard.CardClass || c.Story === centerCard.Story;
          }
          return true;
        });
        if (candidates.length === 0) return done(addLog(ctx, 'ルリグトラッシュに条件を満たすルリグなし'));
        const pickCount = Math.min(spec.count ?? 1, candidates.length);
        const placeStub: StubAction = { type: 'STUB', id: 'INTERNAL_PLACE_LRIG_UNDER_CENTER' };
        return selectOrInteract(candidates, pickCount, (spec.upTo ?? false) || (spec.optional ?? false),
          'self_lrig_trash', placeStub, undefined, ctx);
      }

      // 「あなたの他のルリグの下にあるすべてのカードをこのルリグの下に置く」（チームルリグ統合）
      case 'merge_other_lrig_under': {
        const assistL = ctx.ownerState.field.assist_lrig_l ?? [];
        const assistR = ctx.ownerState.field.assist_lrig_r ?? [];
        const allUnder = [...underOf(assistL), ...underOf(assistR)];
        if (allUnder.length === 0) return done(addLog(ctx, '他ルリグの下にカードなし'));
        const newOwner: PlayerState = {
          ...ctx.ownerState,
          field: {
            ...ctx.ownerState.field,
            lrig: [...allUnder, ...ctx.ownerState.field.lrig],
            assist_lrig_l: assistL.length > 0 ? [assistL[assistL.length - 1]] : [],
            assist_lrig_r: assistR.length > 0 ? [assistR[assistR.length - 1]] : [],
          },
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `他ルリグ下${allUnder.length}枚をセンタールリグ下に統合`));
      }
    }
    return done(addLog(ctx, '[未実装] ルリグ下／ルリグトラッシュ操作'));
  }
  // 🔴🆕**`INTERNAL_CONSUME_SOUL` は撤去した**（§5.3 `O-60` 第57バッチ＝`O-228`・2026-09-03）。
  //   「効果元シグニの下のカードをルリグトラッシュへ捨てる」実行部で、
  //   `effectExecutor` の `SOUL_OP` コスト先取り（同バッチで撤去）と
  //   `SOUL_OP` の汎用フォールバック（同）からしか呼ばれていなかった＝**生成元ゼロ**。
  //   ⚠**復活させないこと**＝原文が要求していたのは**ルリグ**の下（`INTERNAL_CONSUME_LRIG_UNDER`）で、
  //     シグニの下（ソウル）ではなかった。
  // INTERNAL_CONSUME_LRIG_UNDER: ルリグの下からN枚をルリグトラッシュへ（OPTIONAL_LRIG_UNDER_COST の実行部）
  // 🆕**§5.3 `O-60` 第57バッチ（2026-09-03）＝`lrigUnderCost.fromAllLrigs` に対応**＝
  //   原文「**あなたの**ルリグの下からカードを**合計**N枚」はセンターだけでは足りず、
  //   アシストルリグの下も合わせて払う（`WXDi-CP02-002/003/004`）。
  if (stub.id === 'INTERNAL_CONSUME_LRIG_UNDER') {
    const specICLU = stub.lrigUnderCost;
    const countICLU = specICLU?.count
      ?? (typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '1')));
    const underOfICLU = (st: string[] | undefined | null): string[] => (st && st.length > 1 ? st.slice(0, -1) : []);
    const rebuildICLU = (st: string[] | undefined | null, taken: string[]): string[] => {
      if (!st || st.length === 0) return st ?? [];
      return [...underOfICLU(st).filter(cn => !taken.includes(cn)), st[st.length - 1]];
    };
    const lrigStackICLU = ctx.ownerState.field.lrig;
    const centerUnderICLU = underOfICLU(lrigStackICLU);
    const assistLICLU = specICLU?.fromAllLrigs ? underOfICLU(ctx.ownerState.field.assist_lrig_l) : [];
    const assistRICLU = specICLU?.fromAllLrigs ? underOfICLU(ctx.ownerState.field.assist_lrig_r) : [];
    if (centerUnderICLU.length + assistLICLU.length + assistRICLU.length === 0) {
      return done(addLog(ctx, 'ルリグの下にカードなし'));
    }
    // ルリグ直下（新しい側）から順に払う。
    let remainICLU = countICLU;
    const takeICLU = (under: string[]) => {
      const n = Math.max(0, Math.min(remainICLU, under.length));
      remainICLU -= n;
      return n > 0 ? under.slice(-n) : [];
    };
    const takeCenterICLU = takeICLU(centerUnderICLU);
    const takeLICLU = takeICLU(assistLICLU);
    const takeRICLU = takeICLU(assistRICLU);
    const toConsumeICLU = [...takeCenterICLU, ...takeLICLU, ...takeRICLU];
    const newOwnerICLU: PlayerState = {
      ...ctx.ownerState,
      field: {
        ...ctx.ownerState.field,
        lrig: rebuildICLU(lrigStackICLU, takeCenterICLU),
        ...(specICLU?.fromAllLrigs ? {
          assist_lrig_l: rebuildICLU(ctx.ownerState.field.assist_lrig_l, takeLICLU),
          assist_lrig_r: rebuildICLU(ctx.ownerState.field.assist_lrig_r, takeRICLU),
        } : {}),
      },
      lrig_trash: [...ctx.ownerState.lrig_trash, ...toConsumeICLU],
    };
    const nameListICLU = toConsumeICLU.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, ownerState: newOwnerICLU, lastProcessedCards: toConsumeICLU },
      `ルリグ下（${nameListICLU}）をルリグトラッシュへ`));
  }
  // INTERNAL_PLACE_LRIG_UNDER_CENTER: ルリグトラッシュから選択ルリグをセンタールリグ下に配置
  // 🆕**§5.3 `O-60` 第57バッチ（2026-09-03）＝選択は `SELECT_TARGET`（`lastProcessedCards`）で受ける。**
  //   🔴旧実装は `stub.value` に1枚だけ焼き込む `CHOOSE` から呼ばれていたため、
  //     原文「レベル２以下のルリグを**２枚まで**」（`WX22-Re20`③）を表現できなかった。
  //   ⚠`stub.value` 経由も残す（他所から1枚指定で呼ばれても壊れないため）。
  if (stub.id === 'INTERNAL_PLACE_LRIG_UNDER_CENTER') {
    const legacyIPLUC = typeof stub.value === 'string' ? [stub.value] : [];
    const picksIPLUC = (legacyIPLUC.length > 0 ? legacyIPLUC : (ctx.lastProcessedCards ?? []))
      .filter(cn => ctx.ownerState.lrig_trash.includes(cn));
    if (picksIPLUC.length === 0) return done(addLog(ctx, 'センタールリグ下配置：カードなし'));
    const newLrigTrashIPLUC = ctx.ownerState.lrig_trash.filter(x => !picksIPLUC.includes(x));
    const newLrigIPLUC = [...picksIPLUC, ...ctx.ownerState.field.lrig]; // 最下に追加
    const newOwnerIPLUC: PlayerState = {
      ...ctx.ownerState,
      lrig_trash: newLrigTrashIPLUC,
      field: { ...ctx.ownerState.field, lrig: newLrigIPLUC },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerIPLUC },
      `${picksIPLUC.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・')}をセンタールリグ下に配置`));
  }
  // SHUFFLE_REMAINDER_INTO_DECK: 「残りをデッキに加えてシャッフルする」
  // 🆕**§5.3 `O-60` 第45バッチ（2026-09-03）＝`STUB{LOOK_AND_REORDER}` の catch-all を15文型へ割った。**
  // 🔴旧実装は**カード全文**に2本の regex を当てており、
  //   ①「残りをデッキに加えてシャッフル」に当たらないカードでも
  //   ②「デッキの上からカードをN枚見る」が**同じカードの別の文**に当たると
  //   **追加でN枚めくる**まったく別の処理が走った（`WX13-035-BURST` は直前の `REVEAL_AND_PICK` に加えて
  //   もう2枚、`WXDi-CP02-033-E2` は直前の `LOOK_AND_REORDER{count:5}` に加えてもう5枚）。
  // ⇒ ここは**原文を一切読まない**＝`lastProcessedCards` をデッキへ戻してシャッフルするだけ。
  if (stub.id === 'SHUFFLE_REMAINDER_INTO_DECK') {
    const cards = ctx.lastProcessedCards ?? [];
    if (cards.length === 0) return done(addLog(ctx, 'デッキに戻す残りがない'));
    const newDeck = shuffle([...ctx.ownerState.deck, ...cards]);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, deck: newDeck } },
      `残り${cards.length}枚をデッキに戻してシャッフル`));
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
  // 🆕🔴**§5.3 `O-60` 第58バッチ（2026-09-03）＝原文 regex を全部撤去して payload で決める。**
  //   旧実装は `sourceAbilityText(ctx)` に**4本の regex**を当てており、3通りに壊れていた＝
  //   ①枚数 regex `シグニ([０-９\d]+)枚(?:まで)?を対象とし.*の下に置く` が
  //     **live 9効果すべてに当たらなかった**（原文は「シグニ**を**２枚まで対象とし」「対象のシグニ**を**２枚まで」）
  //     ＝**常に既定の1枚**で、「２枚まで」の5効果が過小実行。
  //   ②クラス regex は最初に出た `＜X＞` を**トラッシュ側の絞り込み**に使っていたが、
  //     `WDK15-001`／`WXK08-048`／`WXK10-090` は `＜X＞` が**配置先**にしか無い＝
  //     **トラッシュの＜ウェポン＞しか選べない**過小実行だった。
  //   ③配置先の絞り込み（`INTERNAL_TSU_CHOOSE_ZONE`）は**カード全文**を読んでおり、
  //     `WXEX2-61`（配置先は《ライズアイコン》を持つシグニ）で**＜武勇＞**を配置先条件にしていた。
  // ⚠**payload が無い宣言は何もしない**（fail-closed）。
  if (stub.id === 'TRASH_SIGNI_UNDER_FIELD_SIGNI') {
    const specT = stub.trashUnderPlace;
    if (!specT) return done(addLog(ctx, '[未実装] トラッシュのシグニをシグニの下に置く（payload なし）'));
    const trashSigniT = ctx.ownerState.trash.filter(cn =>
      matchesFilter(ctx.cardMap.get(getCardNum(cn)), specT.sourceFilter ?? { cardType: 'シグニ' }));
    if (trashSigniT.length === 0) return done(addLog(ctx, 'トラッシュに対象のシグニなし（シグニ下配置スキップ）'));
    const noopTSU: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    // 🔑**配置先の条件は継続ステップへ引き継ぐ**（旧はここで捨てて engine が原文を読み直していた）。
    const contTSU: StubAction = { type: 'STUB', id: 'INTERNAL_TSU_CHOOSE_ZONE', trashUnderPlace: specT };
    return needsInteraction(addLog(ctx, 'トラッシュからシグニを選択（下に置く）'), {
      type: 'SELECT_TARGET', candidates: trashSigniT,
      count: Math.min(specT.count, trashSigniT.length),
      optional: specT.upTo ?? true, targetScope: 'self_trash',
      thenAction: noopTSU as EffectAction, continuation: contTSU as EffectAction,
    });
  }
  // INTERNAL_TSU_CHOOSE_ZONE: 選択トラッシュシグニをどのフィールドシグニの下に置くか選択
  // 🆕**§5.3 `O-60` 第58バッチ（2026-09-03）＝配置先の条件は payload（`trashUnderPlace.destFilter`）で受け取る。**
  //   🔴旧実装は `sourceCardNum` の**カード全文**に `＜X＞のシグニ…体…の下に置く` を当てており、
  //     トラッシュ側の `＜X＞` を拾って配置先を誤って絞っていた（`WXEX2-61`）。
  if (stub.id === 'INTERNAL_TSU_CHOOSE_ZONE') {
    const rawTrash = stub.value ? String(stub.value).split(',') : (ctx.lastProcessedCards ?? []);
    if (rawTrash.length === 0) return done(addLog(ctx, 'キャンセル（下置きスキップ）'));
    const [firstTrash, ...restTrash] = rawTrash;
    const specTSU = stub.trashUnderPlace;
    // ⚠**`destLastPlayed`（「**その**シグニの下に置く」＝`WDK15-007`）は絞り込まない**＝
    //   参照先の「直前に場に出したシグニ」を engine が持っていない。**過小に倒さず全ゾーンを候補にする。**
    //   🔴そもそも `WDK15-007` は前段「あなたのトラッシュから対象の＜ウェポン＞のシグニ１枚を**場に出し**」が
    //     live JSON に無い（parser の別の穴）＝§5.3 `O-231` に登録した。
    const fieldZones = [0, 1, 2].filter(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return false;
      if (specTSU?.destFilter && !specTSU.destLastPlayed) {
        return matchesFilter(ctx.cardMap.get(getCardNum(top)), specTSU.destFilter);
      }
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
        action: { type: 'STUB', id: 'INTERNAL_TSU_DO_PLACE', value: encoded,
          ...(specTSU ? { trashUnderPlace: specTSU } : {}) } as StubAction as EffectAction,
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
  // 🆕🔴**§5.3 `O-60` 第58バッチ（2026-09-03）＝原文 regex を全部撤去して payload で決める。**
  //   旧実装は `sourceAbilityText(ctx)`（アビリティブロック全文）に**5本の regex**を当てており、
  //   ①`対戦相手.*リミットを＋N` が**文を跨いで**当たるため、原文「**あなたの**センタールリグの
  //     リミットを＋２」の `WXDi-P16-002-E1` が**相手のリミットを＋２**していた
  //     （同じブロックの前の文に「次の**対戦相手**のターンの間、…」がある）。
  //   ②「相手側の一致があれば自分側の分岐を丸ごと飛ばす」構造だったので、自分と相手の両方を書いた
  //     `WX25-P2-014-E2`（自分＋1／相手−2）は**自分の＋1が消え**、さらに相手の−2は
  //     後続の `OPP_MAIN_PHASE_LIMIT_DOWN` と**二重に**掛かっていた。
  // ⚠**payload が無い宣言は何もしない**（fail-closed）＝旧既定の「リミット+1」は
  //   原文に無い数値を勝手に足す形だった。
  if (stub.id === 'LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END') {
    const specL = stub.lrigLimitChange;
    if (!specL) return done(addLog(ctx, '[未実装] ルリグリミット修正（payload なし）'));
    const ownerL: Owner = specL.owner === 'opponent' ? 'opponent' : 'self';
    const stL = ownerL === 'opponent' ? ctx.otherState : ctx.ownerState;
    const nextL: PlayerState = { ...stL, lrig_limit_mod: (stL.lrig_limit_mod ?? 0) + specL.delta };
    const ctxL = ownerL === 'opponent' ? { ...ctx, otherState: nextL } : { ...ctx, ownerState: nextL };
    return done(addLog(ctxL,
      `${ownerL === 'opponent' ? '対戦相手の' : ''}リミット${specL.delta > 0 ? '+' : ''}${specL.delta}（エナフェイズ終了まで）`));
  }
  // REVEAL_PICK_CLASS_TO_ENERGY: デッキ上N枚を公開し、条件に合うカードをエナへ、残りを指定の行き先へ
  // 🆕**§5.3 `O-60` 第35バッチ（2026-09-03）＝公開枚数・絞り込み・残りの行き先は payload で受け取る。**
  // 🔴旧実装は `EffectText + BurstText` に `/[<＜]([^>＞]+)[>＞]のシグニ.*エナゾーンに置く/` を当てていたので、
  //   `WX18-034` の「**《アクセアイコン》を持つ**すべてのシグニ」には**1本も当たらず絞り込みが消え**
  //   （公開したシグニ全部がエナへ行く過剰実行）、しかも**残りの行き先がデッキの一番上に固定**で
  //   原文の「残りを**トラッシュに置く**」と別物、公開枚数も既定2枚（原文3枚）だった。
  // ⚠**payload が無ければ何もしない**（fail-closed）。
  if (stub.id === 'REVEAL_PICK_CLASS_TO_ENERGY') {
    const specRPC = stub.revealPickToEnergy;
    if (!specRPC) return done(addLog(ctx, 'デッキ公開→エナ：内容が無いため何もしない'));
    // 🔑候補は前段 `LOOK_AND_REORDER` が残した公開結果を優先（原文の「**その中から**」がそのまま成立する）。
    //   payload に枚数があればそれで切り出す（前段が無い経路のフォールバック）。
    const viewedRPC = (ctx.lastProcessedCards ?? []).length > 0
      ? ctx.lastProcessedCards!
      : specRPC.revealCount !== undefined ? ctx.ownerState.deck.slice(0, specRPC.revealCount) : [];
    if (viewedRPC.length === 0) return done(addLog(ctx, 'デッキなし（REVEAL_PICK_CLASS_TO_ENERGY）'));
    const toEnergyRPC = viewedRPC.filter(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), specRPC.pickFilter));
    const restRPC = viewedRPC.filter(cn => !toEnergyRPC.includes(cn));
    let newDeckRPC = [...ctx.ownerState.deck];
    for (const cn of viewedRPC) {
      const idx = newDeckRPC.indexOf(cn); if (idx >= 0) newDeckRPC.splice(idx, 1);
    }
    // 残りの行き先＝原文どおり（デッキの一番上／トラッシュ）。
    const trashRPC = specRPC.remainderTo === 'trash' ? restRPC : [];
    if (specRPC.remainderTo === 'deck_top') newDeckRPC = [...restRPC, ...newDeckRPC];
    const newOwnerRPC = {
      ...ctx.ownerState,
      deck: newDeckRPC,
      energy: [...ctx.ownerState.energy, ...toEnergyRPC],
      trash: [...ctx.ownerState.trash, ...trashRPC],
    };
    const enamesRPC = toEnergyRPC.map(cn => ctx.cardMap.get(getCardNum(cn))?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, ownerState: newOwnerRPC },
      `${enamesRPC || 'なし'}をエナゾーンへ、残り${restRPC.length}枚を${specRPC.remainderTo === 'trash' ? 'トラッシュ' : 'デッキ上'}へ`));
  }
  // ガードアイコンなしカードを捨てたとき、そのカードをエナへ
  if (stub.id === 'NON_GUARD_DISCARD_TO_ENERGY') {
    // ⚠AUTO トリガー（ON_HAND_DISCARDED）から解決するとき、stack entry 由来の ExecCtx には
    //   lastProcessedCards が入らない（BattleScreen.tsx の entry→ExecCtx 構築に含まれない）。
    //   そのままだと空配列を回して**完全 no-op**（しかも《ターン1回》だけ消費する）になるため、
    //   collectHandDiscardTriggers が entry に載せた triggeringCardNum＝捨てられたカードを使う。
    //   コスト/効果の即時経路（lastProcessedCards が入る）は従来どおり優先する。
    const selected = ctx.lastProcessedCards?.length
      ? ctx.lastProcessedCards
      : (ctx.triggeringCardNum ? [ctx.triggeringCardNum] : []);
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
    if (isOwnTrashMoveLocked('self', ctx)) return done(addLog(ctx, 'トラッシュのカードは自分の効果で移動できない'));
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
        // 「カードを１枚**まで**」（§6.4 O-37(c)・`WX24-P3-007`）＝0枚を選べる。
        // ⚠既定（`WX24-P3-030-E1`＝「カード１枚を対象とし」）は必須なのでこの枝を出さない。
        ...(stub.trashedCardUpTo
          ? [{ id: 'none', label: '何もしない', action: { type: 'STUB', id: 'INTERNAL_NOOP' } as EffectAction, available: true }]
          : []),
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
  // 🏁**`MULTI_SIGNI_TO_ENERGY` / `INTERNAL_OPP_SIGNI_TO_ENERGY_EXEC` は撤去した**
  //   （2026-09-03 §5.3 `O-60` 第21バッチ）。旧実装は `card.EffectText` に
  //   `/シグニ([０-９\d]+)体まで/` を当てて枚数を決めており、当たらなければ**既定 2**へ落ちていた
  //   （原文の綴りは「シグニ**を**２体まで」で助詞が違い、実際に外れていた）。
  //   いまは parser が `SEND_TO_ENERGY{target:{count, upToCount}}` を出し、`execSendToEnergy` が解く
  //   （`parseSigniTarget` は最初からこの文型から `count:2, upToCount:true` を出せていた＝受け皿は在った）。

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
  // 🆕**絞り込みは payload（`handCardPick`）**（§5.3 `O-60` 第51バッチ・2026-09-03）。
  // 🔴旧実装は `EffectText + BurstText`（**カード全文**）を読んでおり、`WXK05-043` のように
  //   **同じカードの別の能力**にも「手札から＜水獣＞の」と書ける形では取り違えが起きうるうえ、
  //   効果元が `cardMap` から引けない経路では絞り込みが消えて**手札の全シグニ**が候補になった。
  // ⚠**payload が無ければ何も公開しない**（fail-closed）。
  if (stub.id === 'REVEAL_CLASS_SIGNI_FROM_HAND') {
    const pickRCS = resolveHandCardPick(stub.handCardPick, ctx);
    if (!pickRCS) return done(addLog({ ...ctx, lastProcessedCards: [] }, '[REVEAL_CLASS_SIGNI_FROM_HAND: 公開条件なし（未指定）]'));
    if (pickRCS.cands.length === 0) return done({
      ...addLog(ctx, `手札に${handCardPickLabel(stub.handCardPick)}なし（公開スキップ）`),
      lastProcessedCards: [],
    });
    // 公開カードを hand_revealed_just に記録（ON_REVEALED_FROM_HANDトリガー検出用、execStubPart3にハンドラ）
    const markRevealRCS: StubAction = { type: 'STUB', id: 'INTERNAL_MARK_REVEALED_FROM_HAND' };
    return selectOrInteract(pickRCS.cands, pickRCS.count, pickRCS.optional, 'self_hand', markRevealRCS as EffectAction, undefined, ctx);
  }
  // 対戦相手が自分のシグニを選んでエナに置く
  // 🆕**パワー下限は payload（`oppSigniPowerMin`）**（§5.3 `O-60` 第52バッチ・2026-09-03）。
  // 🔴旧実装は **カード全文**へ `/パワー(\d+)以上のシグニ/` を当てていた＝`WXDi-P12-051` は
  //   【常】にも「パワーは＋3000」「【シャドウ（レベル３以上のシグニ）】」があり、別の能力の数字を掴みうる形。
  // ⚠**payload が無ければ何もしない**（fail-closed）＝旧既定 0 へ倒すと**相手の全シグニ**が候補になる。
  if (stub.id === 'OPP_CHOOSE_OWN_SIGNI_TO_ENERGY') {
    const powerLimit = stub.oppSigniPowerMin;
    if (powerLimit === undefined) return done(addLog(ctx, '[OPP_CHOOSE_OWN_SIGNI_TO_ENERGY: パワー下限なし（未指定）]'));
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
  // MOVE_TO_OTHER_SIGNI_ZONE: 自シグニを他のシグニゾーンへ移動（してもよい）＝既定は空きゾーンのみ・moveSelfZone.allowSwap で占有ゾーンとの入れ替えも選べる
  if (stub.id === 'MOVE_TO_OTHER_SIGNI_ZONE') {
    const srcMov = ctx.sourceCardNum;
    if (!srcMov) return done(addLog(ctx, 'ゾーン移動：ソースカードなし'));
    const currentZone = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcMov);
    if (currentZone < 0) return done(addLog(ctx, 'ゾーン移動：フィールドにいない'));
    const emptyZones = [0, 1, 2].filter(i =>
      i !== currentZone && (!ctx.ownerState.field.signi[i] || ctx.ownerState.field.signi[i]!.length === 0));
    // 🆕§5.3 `O-237`（2026-09-04）＝**`allowSwap` のときだけ占有ゾーンも候補にする**（原文に
    //   「そのシグニゾーンにシグニがある場合、…場所を入れ替える」と書いてある札だけ）。
    //   ⚠既定は空きゾーンだけ＝入れ替え条項の無い5枚（`WX14-050` ほか）の挙動を変えない。
    const swapZones = stub.moveSelfZone?.allowSwap
      ? [0, 1, 2].filter(i => i !== currentZone && (ctx.ownerState.field.signi[i]?.length ?? 0) > 0)
      : [];
    if (emptyZones.length === 0 && swapZones.length === 0) return done(addLog(ctx, 'ゾーン移動：空きゾーンなし'));
    const moveOptions = [
      ...emptyZones.map(zi => ({
        id: `zone_${zi}`,
        label: `ゾーン${zi + 1}に移動`,
        action: ({ type: 'STUB', id: 'INTERNAL_MOVE_TO_ZONE', value: zi } as StubAction) as EffectAction,
        available: true,
      })),
      ...swapZones.map(zi => ({
        id: `swap_${zi}`,
        label: `ゾーン${zi + 1}のシグニと入れ替える`,
        action: ({ type: 'STUB', id: 'INTERNAL_MOVE_TO_ZONE', value: zi, moveSelfZone: { allowSwap: true } } as StubAction) as EffectAction,
        available: true,
      })),
    ];
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
    // 🆕§5.3 `O-237`＝**入れ替え**（`allowSwap`）＝行き先に居るシグニを元のゾーンへ移す。
    //   ⚠**マーカー（ダウン／凍結／チャーム…）も一緒に入れ替える**＝下の一括入れ替えがそれを担う
    //   （既定の「移動」はマーカーを元ゾーンで消すので、そちらとは分岐する）。
    const swapStack = stub.moveSelfZone?.allowSwap ? [...(newSigniMov[targetZoneNum] ?? [])] : [];
    newSigniMov[curZone] = swapStack.length > 0 ? swapStack : null;
    newSigniMov[targetZoneNum] = movedStack;
    const copyArr = <T>(arr: T[] | undefined, def: T): T[] =>
      arr ? [...arr] : [def, def, def];
    const newDown   = copyArr(ctx.ownerState.field.signi_down, false);
    const newFrozen = copyArr(ctx.ownerState.field.signi_frozen, false);
    const newCharms = copyArr(ctx.ownerState.field.signi_charms as (null | string)[], null);
    const newAcce   = copyArr(ctx.ownerState.field.signi_acce as (null | string[])[], null);
    const newVirus   = copyArr(ctx.ownerState.field.signi_virus, 0);
    const newChokkin = copyArr(ctx.ownerState.field.signi_chokkin, 0);
    const prevAtTarget = [newDown[targetZoneNum], newFrozen[targetZoneNum], newCharms[targetZoneNum], newAcce[targetZoneNum], newVirus[targetZoneNum], newChokkin[targetZoneNum]] as const;
    [newDown[targetZoneNum], newFrozen[targetZoneNum], newCharms[targetZoneNum], newAcce[targetZoneNum], newVirus[targetZoneNum], newChokkin[targetZoneNum]] =
      [newDown[curZone], newFrozen[curZone], newCharms[curZone], newAcce[curZone], newVirus[curZone], newChokkin[curZone]];
    if (swapStack.length > 0) {
      // 入れ替え＝行き先のマーカーを元ゾーンへ運ぶ（消さない）。
      [newDown[curZone], newFrozen[curZone], newCharms[curZone], newAcce[curZone], newVirus[curZone], newChokkin[curZone]] =
        [prevAtTarget[0], prevAtTarget[1], prevAtTarget[2], prevAtTarget[3], prevAtTarget[4], prevAtTarget[5]];
    } else {
      newDown[curZone] = false; newFrozen[curZone] = false;
      newCharms[curZone] = null; newAcce[curZone] = null; newVirus[curZone] = 0; newChokkin[curZone] = 0;
    }
    const newFieldMov = {
      ...ctx.ownerState.field, signi: newSigniMov,
      signi_down: newDown as boolean[], signi_frozen: newFrozen as boolean[],
      signi_charms: newCharms, signi_acce: newAcce, signi_virus: newVirus, signi_chokkin: newChokkin,
    };
    // ON_ZONE_MOVED トリガー検出用フラグ（BattleScreen が collectZoneMovedTriggers で発火・クリア）。
    // 旧実装はここで原文「移動したとき…パワー+N」を読んで即時適用していたが、ON_ZONE_MOVED 配線に一本化。
    const ctxMov = addLog({ ...ctx, ownerState: { ...ctx.ownerState, field: newFieldMov,
      zone_moved_just: [...(ctx.ownerState.zone_moved_just ?? []), srcZ] } },
      `${ctx.cardMap.get(srcZ)?.CardName ?? srcZ}をゾーン${curZone + 1}→ゾーン${targetZoneNum + 1}に移動`);
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
  // このターン相手はガードできない（追加コストを払えば可能な語彙とは分離）
  if (stub.id === 'PREVENT_OPP_GUARD_THIS_TURN') {
    const newOwner = { ...ctx.ownerState, prevent_opp_guard: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン対戦相手はガードできない'));
  }
  // 実行型の「このターン、追加で《無》N枚」。until 省略の CONTINUOUS 宣言は collector が処理する。
  if (stub.id === 'OPP_GUARD_COST_COLORLESS') {
    if (stub.until !== 'END_OF_TURN') {
      return done(addLog(ctx, 'ガード追加《無》コスト（継続効果collector処理）'));
    }
    const count = stub.count ?? 1;
    const total = (ctx.ownerState.opp_guard_extra_colorless_this_turn ?? 0) + count;
    return done(addLog({
      ...ctx,
      ownerState: { ...ctx.ownerState, opp_guard_extra_colorless_this_turn: total },
    }, `このターン、対戦相手のガード追加コスト《無》×${count}`));
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
  // 複合任意コスト：【トラップ】は field.signi_traps の別ゾーンなので、SIGNI の TRASH では払わない。
  // INTERNAL_TRASH_FIELD_TRAP_COST: 候補提示／INTERNAL_TRASH_SELECTED_FIELD_TRAP_COST: 選択済み1枚の移動。
  if (stub.id === 'INTERNAL_TRASH_FIELD_TRAP_COST') {
    const spec = stub.fieldTrapTrash;
    if (!spec) return done(addLog(ctx, '【トラップ】支払い仕様なし'));
    const candidates = (ctx.ownerState.field.signi_traps ?? [])
      .filter((n): n is string => !!n)
      .filter(n => !spec.excludeSource || !ctx.sourceCardNum || n !== ctx.sourceCardNum);
    if (candidates.length < spec.count) return done(addLog(ctx, '支払える【トラップ】が足りない'));
    return selectOrInteract(candidates, spec.count, false, 'self_trap', {
      type: 'STUB', id: 'INTERNAL_TRASH_SELECTED_FIELD_TRAP_COST', fieldTrapTrash: spec,
    } as EffectAction, undefined, ctx);
  }
  if (stub.id === 'INTERNAL_TRASH_SELECTED_FIELD_TRAP_COST') {
    const selected = ctx.lastProcessedCards?.[0];
    const traps = [...(ctx.ownerState.field.signi_traps ?? [null, null, null])] as (string | null)[];
    const zone = selected ? traps.indexOf(selected) : -1;
    if (zone < 0 || !selected) return done(addLog(ctx, '選択した【トラップ】が場にない'));
    if (stub.fieldTrapTrash?.excludeSource && ctx.sourceCardNum && selected === ctx.sourceCardNum) {
      return done(addLog(ctx, '効果元の【トラップ】は支払えない'));
    }
    traps[zone] = null;
    const ownerState2: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, selected],
      field: { ...ctx.ownerState.field, signi_traps: traps },
    };
    return done({
      ...addLog({ ...ctx, ownerState: ownerState2 }, `${ctx.cardMap.get(getCardNum(selected))?.CardName ?? selected}を【トラップ】からトラッシュへ`),
      lastProcessedCards: [selected],
    });
  }
  // 手札からクラスシグニを任意枚数捨てる
  // 🆕**絞り込みと上限枚数は payload（`handCardPick`）**（§5.3 `O-60` 第51バッチ・2026-09-03）。
  // 🔴旧実装は `EffectText + BurstText`（**カード全文**）へ「シグニをN枚まで」を当てていた＝
  //   `PR-328` は**捨てた枚数がそのまま後段 CHOOSE の選択数**（`countChoose`）になるので、
  //   別の能力の数字を拾うと**選べる効果の数まで化ける**形だった（§6.4 O-11・続き532 で
  //   助詞「を」を足して直したのは「同じ穴に別の綴りで落ちた」だけ）。
  // ⚠**payload が無ければ何も捨てない**（fail-closed）。
  if (stub.id === 'OPTIONAL_DISCARD_CLASS_SIGNI') {
    const pickODC = resolveHandCardPick(stub.handCardPick, ctx);
    if (!pickODC) return done(addLog(ctx, '[OPTIONAL_DISCARD_CLASS_SIGNI: 捨てる条件なし（未指定）]'));
    if (pickODC.cands.length === 0) return done(addLog(ctx, `手札に${handCardPickLabel(stub.handCardPick)}なし（任意捨てスキップ）`));
    const discardActionODC: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 },
    };
    return selectOrInteract(pickODC.cands, pickODC.count, true, 'self_hand', discardActionODC as EffectAction, undefined, ctx);
  }
  return null;
}
