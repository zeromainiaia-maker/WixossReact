import {collectOppSigniAttackResponses} from '../attackResponse';
import {calcFieldPowers, checkActiveCondition, collectGrantedFromLayer} from '../../../engine/effectEngine';
import {getCardNum} from '../../../engine/effectExecutor';
import {initStack, pushToStack} from '../../../engine/effectStack';
import {type TrigCtx, collectAttackerSelfTriggers as pureCollectAttackerSelfTriggers, collectFieldTriggers as pureCollectFieldTriggers, collectSelfEventTriggers as pureCollectSelfEventTriggers, collectSigniAttackDelayedTriggers as pureCollectSigniAttackDelayedTriggers, collectSigniDownUpTriggers as pureCollectSigniDownUpTriggers, recordSigniDownedThisTurn, collectTrashTriggers as pureCollectTrashTriggers, collectLeaveFieldTriggers as pureCollectLeaveFieldTriggers, collectAttackerSelfDelayedTriggers as pureCollectAttackerSelfDelayedTriggers} from '../../../engine/triggerCollect';
import {type PlayerState, type StackEntry} from '../../../types';
import {attackFieldTrashCost, deterministicAttackFieldTrashZones, payAttackFieldTrashCost} from '../attackFieldTrashCost';
import {consumeNthAttackNegation} from '../attackNegation';
import {CPU_PLAYER_ID, InstanceMap, generateUUID} from '../battleUtils';
import {reduceBattle} from '../controller/battleController';
import {signiAttackBanHandDiscardCost} from '../signiAttackBan';
import {canSigniAttack, signiAttackColorlessCost} from '../signiAttackGate';
import type {PerformCtx} from './performCtx';

/**
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O と材料（`PerformCtx`）を注入にした。
 * ⚠可否の判定はここに書かない（`*Gate.ts`）。
 */
 const mkTrigCtxWithLayerGrants = (ctx: PerformCtx) => (myS: PlayerState, opS: PlayerState, myIsActive: boolean): TrigCtx => {
  const base = ctx.trigCtx();
  const augMap = new InstanceMap<import('../../../types/effects').CardEffect[]>(ctx.effectsMap);
  const merged = [
    ...collectGrantedFromLayer(myS, opS, myIsActive, augMap, ctx.cardMap),
    ...collectGrantedFromLayer(opS, myS, !myIsActive, augMap, ctx.cardMap),
  ];
  for (const [num, extra] of merged) {
    const cur = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
    const seen = new Set(cur.map(e => e.effectId));
    const add = extra.filter(e => !seen.has(e.effectId));
    if (add.length > 0) augMap.set(num, [...cur, ...add]);
  }
  return { ...base, effectsMap: augMap };
};

 const collectAttackFieldTrashCostTriggers = (ctx: PerformCtx) => (
  beforeAttacker: PlayerState,
  paidAttacker: PlayerState,
  defender: PlayerState,
  attackerId: string,
  attackerIsHost: boolean,
  trashedSigniNums: string[],
): { attacker: PlayerState; defender: PlayerState; entries: StackEntry[] } => {
  let hostState = attackerIsHost ? paidAttacker : defender;
  let guestState = attackerIsHost ? defender : paidAttacker;
  const entries: StackEntry[] = [];
  const applyUsed = (usedHostIds: string[], usedGuestIds: string[]) => {
    if (usedHostIds.length > 0) hostState = { ...hostState, actions_done: [...(hostState.actions_done ?? []), ...usedHostIds] };
    if (usedGuestIds.length > 0) guestState = { ...guestState, actions_done: [...(guestState.actions_done ?? []), ...usedGuestIds] };
  };
  for (const cardNum of trashedSigniNums) {
    const zoneIdx = beforeAttacker.field.signi.findIndex(stack => stack?.at(-1) === cardNum);
    const under = zoneIdx >= 0 ? (beforeAttacker.field.signi[zoneIdx] ?? []).slice(0, -1) : [];
    const trash = pureCollectTrashTriggers(ctx.trigCtx(), cardNum, attackerId, hostState, guestState, false, true, false);
    entries.push(...trash.entries);
    applyUsed(trash.usedHostIds, trash.usedGuestIds);
    const leave = pureCollectLeaveFieldTriggers(ctx.trigCtx(), 
      cardNum, under, attackerId, hostState, guestState,
      undefined, beforeAttacker, zoneIdx >= 0 ? zoneIdx : undefined,
    );
    entries.push(...leave.entries);
    applyUsed(leave.usedHostIds, leave.usedGuestIds);
  }
  return {
    attacker: attackerIsHost ? hostState : guestState,
    defender: attackerIsHost ? guestState : hostState,
    entries,
  };
};

// シグニアタックのバトル解決（人間・CPU共通）
// attacker視点で全処理（無効化・キーワード能力・バニッシュ代替/リダイレクト・各種トリガー収集）を行う。
// 呼び出し元はフェイズ・check待ち・blocked_actionsのガードを行うこと（blockedはここでも弾くが、
// CPU側はアタッカーがダウンしないと無限ループするため事前に除外が必要）
export const performSigniAttack = async (zoneIndex: number, p: {
  attacker: PlayerState; defender: PlayerState;
  attackerId: string; defenderId: string;
  attackerKey: 'host_state' | 'guest_state';
  targetOpZone?: number; // 【側面アタック】: 正面(2-zoneIndex)ではなく指定した相手シグニゾーンを攻撃。シグニ無ければ何も起きない・ライフダメージなし
  attackFieldTrashZones?: number[];
  attackFieldTrashAlreadyPaid?: boolean;
  /** 「手札をN枚捨てないかぎりアタックできない」の支払い（手札 index・§6.4 O-3）。 */
  attackHandDiscardIndices?: number[];
  attackHandDiscardAlreadyPaid?: boolean;
  /**
   * 🆕**§5.3 `O-238`**＝`attacker`/`defender` が **React state にまだ反映していない盤面**であることの宣言。
   * 立てると `collectGrantedFromLayer`（【レイヤー付与】）をその盤面で組み直してから【自】を収集する。
   * ⚠立てないと `ctx.effectsMap`（memo＝`ctx.bs` 依存）が**変更前の場**のままなので、
   *   直前に自分で変えた盤面で初めて成立する付与が**1つも載らない**。
   */
  regrantLayerAbilities?: boolean;
  /** 🆕§5.7 `S-5c` 第2段＝無効化の回避UI（画面のみ。CPU・ヘッドレスは渡さない＝元の条件と同じ）。 */
  openNegateEscape?: (a: { zoneIndex: number; targetOpZone?: number; cardNum: string; count: number;
    attackFieldTrashAlreadyPaid?: boolean; attackHandDiscardAlreadyPaid?: boolean }) => void;
}, ctx: PerformCtx) => {
  let my = p.attacker;
  let op = p.defender;
  const { attackerId, defenderId } = p;
  const attackerIsHost = p.attackerKey === 'host_state';
  ctx.io.setLoading(true);
  try {
    const myTopNum = (my.field.signi[zoneIndex] ?? []).at(-1);
    if (!myTopNum) return;
    // GATE: アタック可否は signiAttackGate に一本化（人間ボタン／CPU候補フィルタと同じ関数）。
    // ⚠ここで弾かれるシグニは CPU 候補フィルタ側でも同じ理由で除外されている必要がある
    //   （除外漏れがあるとアタッカーがダウンせず ATTACK_SIGNI で無限ループする）。
    if (!canSigniAttack({
      attacker: my, defender: op, attackerNum: myTopNum,
      effectsMap: ctx.effectsMap, cardMap: ctx.cardMap, turnPhase: ctx.bs.turn_phase,
      fieldTrashCostAlreadyPaid: p.attackFieldTrashAlreadyPaid,
    })) return;

    // 解除コストつきアタック制限：人間はモーダルで選んだゾーン、CPUは左から決定論的に選ぶ。
    let attackFieldTrashTriggerEntries: StackEntry[] = [];
    if (!p.attackFieldTrashAlreadyPaid && attackFieldTrashCost(my, myTopNum) > 0) {
      const selectedZones = p.attackFieldTrashZones
        ?? (attackerId === CPU_PLAYER_ID ? deterministicAttackFieldTrashZones(my, myTopNum, ctx.cardMap) : []);
      const paid = payAttackFieldTrashCost(my, myTopNum, selectedZones, ctx.cardMap);
      if (!paid) return;
      const collected = collectAttackFieldTrashCostTriggers(ctx)(
        my, paid.state, op, attackerId, attackerIsHost, paid.trashedSigniNums,
      );
      my = collected.attacker;
      op = collected.defender;
      attackFieldTrashTriggerEntries = collected.entries;
      ctx.io.appendLogs([`${paid.trashedSigniNums.map(n => ctx.cardMap.get(n)?.CardName ?? n).join('・')}を場からトラッシュに置き、アタック制限を解除`]);
    }

    // 「手札をN枚捨てないかぎりアタックできない」（§6.4 O-3）＝**アタックするごとに**払う。
    // ⚠払えるかどうかの判定は signiAttackGate 側（ATTACK_BAN_HAND_COST）。ここは引き落としだけ。
    // ⚠`newMyState` を組み立てる**前**に `my` を差し替える（後だと手札が減らないまま確定する）。
    if (!p.attackHandDiscardAlreadyPaid) {
      const handTaxSA = signiAttackBanHandDiscardCost(my, myTopNum, ctx.cardMap);
      if (handTaxSA > 0) {
        const idxSA = p.attackHandDiscardIndices
          ?? (attackerId === CPU_PLAYER_ID ? my.hand.map((_, i) => i).slice(0, handTaxSA) : []);
        if (idxSA.length !== handTaxSA) return;
        const discardSet = new Set(idxSA);
        const discardedSA = my.hand.filter((_, i) => discardSet.has(i));
        my = { ...my, hand: my.hand.filter((_, i) => !discardSet.has(i)), trash: [...my.trash, ...discardedSA] };
        ctx.io.appendLogs([`手札${discardedSA.length}枚を捨ててアタック制限を解除`]);
      }
    }

    const myCardName = ctx.cardMap.get(myTopNum)?.CardName ?? myTopNum;
    const isSideAttack = p.targetOpZone !== undefined; // 【側面アタック】
    let opZoneIndex = p.targetOpZone ?? (2 - zoneIndex); // 正面ゾーン（表示反転を考慮）／側面アタックは指定ゾーン
    let opStack = op.field.signi[opZoneIndex] ?? [];
    let opTopCardNum: string | null = opStack.length > 0 ? opStack[opStack.length - 1] : null;

    // REDIRECT_ATTACK_TO_SELF_ZONE: 正面が空の場合、このSTUBを持つ相手シグニのゾーンへリダイレクト（側面アタックは対象固定のため対象外）
    if (!opTopCardNum && !isSideAttack) {
      for (let zi = 0; zi < op.field.signi.length; zi++) {
        const top = op.field.signi[zi]?.at(-1);
        if (!top) continue;
        const hasRedir = (ctx.effectsMap.get(top) ?? []).some(eff =>
          eff.effectType === 'CONTINUOUS' &&
          (eff.action as import('../../../types/effects').StubAction).type === 'STUB' &&
          (eff.action as import('../../../types/effects').StubAction).id === 'REDIRECT_ATTACK_TO_SELF_ZONE',
        );
        if (hasRedir) {
          opZoneIndex = zi;
          opStack = op.field.signi[zi]!;
          opTopCardNum = top;
          ctx.io.appendLogs([`${ctx.cardMap.get(top)?.CardName ?? top}がアタックをこのゾーンへリダイレクト`]);
          break;
        }
      }
    }

    const myKey = p.attackerKey;
    const opKey = attackerIsHost ? 'guest_state' : 'host_state';

    // 自分のシグニをダウン
    const newSigniDown = [...(my.field.signi_down ?? [false, false, false])];
    newSigniDown[zoneIndex] = true;
    const newAttackedIds = [...(my.attacked_signi_ids ?? []), myTopNum];
    // OPP_SIGNI_ATTACK_COST: アタックにエナコストが必要な場合、エナを消費
    // ⚠ここは**選択のない自動支払い**（末尾から削る近似）なので §6.4 のエナ支払い元 funnel は通さない
    //   ＝「エナゾーン以外を支払い元にする」語彙の対象外（原文は「支払う際」＝選んで払う場面を指す）。
    // signi_attack_bans_this_turn の「《無》×N を支払わないかぎり」分も同じ自動支払いに乗せる（§6.4 O-3）。
    // ⚠払えるかどうかの判定は signiAttackGate 側（ATTACK_BAN_COST）。ここは引き落としだけ。
    // ⚠**判定と同じ1関数を見る**（§6.4 O-31）＝`signi_attack_bans_this_turn` 由来だけを足すと、
    //   【常】由来の「《無》を支払わないかぎりアタックできない」がタダで通る穴になる。
    const banCostSA = signiAttackColorlessCost({
      attacker: my, defender: op, attackerNum: myTopNum, effectsMap: ctx.effectsMap, cardMap: ctx.cardMap,
    }) ?? 0;
    const signiAtkCostSA = (my.signi_attack_cost ?? 0) + banCostSA;
    const newEnergySA = signiAtkCostSA > 0 ? my.energy.slice(0, -signiAtkCostSA) : my.energy;
    const newMyState: PlayerState = { ...my, field: { ...my.field, signi_down: newSigniDown }, attacked_signi_ids: newAttackedIds, energy: newEnergySA };
    const newOpState = op;

    // NEGATE_NTH_ATTACK: 防御側の共有カウンタがシグニを対象にする場合
    const signiNegation = consumeNthAttackNegation(op, 'signi');
    if (signiNegation.negated) {
      const negatedTriggers = pureCollectSelfEventTriggers(ctx.trigCtx(), 'ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT', signiNegation.defender, newMyState, 'シグニアタック無効時', defenderId);
      const defenderAfterTrigger: PlayerState = negatedTriggers.usedOncePerTurnIds.length > 0
        ? { ...signiNegation.defender, actions_done: [...(signiNegation.defender.actions_done ?? []), ...negatedTriggers.usedOncePerTurnIds] }
        : signiNegation.defender;
      const allNegatedEntries = [...attackFieldTrashTriggerEntries, ...negatedTriggers.entries];
      const stack = allNegatedEntries.length > 0
        ? (ctx.bs.effect_stack ? pushToStack(ctx.bs.effect_stack, allNegatedEntries) : initStack(ctx.bs.active_user_id ?? attackerId, allNegatedEntries))
        : undefined;
      ctx.io.appendLogs([`${myCardName}のアタックは無効化された（残り${signiNegation.remaining}回）`]);
      await ctx.io.commit(reduceBattle(ctx.bs, { type: 'WRITE_STATE', myKey: myKey, myState: newMyState, opp: { key: opKey, state: defenderAfterTrigger }, ...(stack ? { effectStack: stack } : {}) }));
      return;
    }
    // NEGATE_THAT_ATTACK: 対象側（アタッカー）の state に myTopNum が登録されていた場合、このアタックを無効化
    if ((my.negated_attacks ?? []).includes(myTopNum)) {
      // escapeDiscard（G154 BURST）: アタック側が手札をN枚捨てれば無効化を回避できる。手札が足りればモーダルで選択させる。
      const escapeCount = my.negated_attacks_escape?.[myTopNum];
      if (escapeCount && my.hand.length >= escapeCount) {
        // ⚠解除コストは**この時点で支払い済み**（上のブロック）＝再入時に二重請求しない。
        p.openNegateEscape?.({ zoneIndex, targetOpZone: p.targetOpZone, cardNum: myTopNum, count: escapeCount, attackFieldTrashAlreadyPaid: true, attackHandDiscardAlreadyPaid: true });
        const paymentStack = attackFieldTrashTriggerEntries.length > 0
          ? (ctx.bs.effect_stack ? pushToStack(ctx.bs.effect_stack, attackFieldTrashTriggerEntries) : initStack(ctx.bs.active_user_id ?? attackerId, attackFieldTrashTriggerEntries))
          : undefined;
        await ctx.io.commit(reduceBattle(ctx.bs, {
          type: 'WRITE_STATE', myKey, myState: my,
          opp: { key: opKey, state: op }, ...(paymentStack ? { effectStack: paymentStack } : {}),
        }));
        ctx.io.setLoading(false);
        return; // アタックを保留してプレイヤーの選択を待つ
      }
      const clearedNA = (my.negated_attacks ?? []).filter(id => id !== myTopNum);
      const escMap0 = { ...(my.negated_attacks_escape ?? {}) }; delete escMap0[myTopNum];
      const newMyNA: PlayerState = {
        ...newMyState,
        negated_attacks: clearedNA.length ? clearedNA : undefined,
        negated_attacks_escape: Object.keys(escMap0).length ? escMap0 : undefined,
      };
      const negatedTriggers = pureCollectSelfEventTriggers(ctx.trigCtx(), 'ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT', op, newMyNA, 'シグニアタック無効時', defenderId);
      const defenderAfterTrigger: PlayerState = negatedTriggers.usedOncePerTurnIds.length > 0
        ? { ...op, actions_done: [...(op.actions_done ?? []), ...negatedTriggers.usedOncePerTurnIds] }
        : op;
      const allNegatedEntries = [...attackFieldTrashTriggerEntries, ...negatedTriggers.entries];
      const stack = allNegatedEntries.length > 0
        ? (ctx.bs.effect_stack ? pushToStack(ctx.bs.effect_stack, allNegatedEntries) : initStack(ctx.bs.active_user_id ?? attackerId, allNegatedEntries))
        : undefined;
      ctx.io.appendLogs([`${myCardName}のアタックは無効化された`]);
      await ctx.io.commit(reduceBattle(ctx.bs, { type: 'WRITE_STATE', myKey: myKey, myState: newMyNA, opp: { key: opKey, state: defenderAfterTrigger }, ...(stack ? { effectStack: stack } : {}) }));
      return;
    }

    // ON_ATTACK_SIGNIトリガー収集（Phase 1：バトル前に処理するトリガー）
    // condition を持つ AUTO は発動条件を満たす場合のみ収集（「〜であるかぎり『【自】アタック時…』を得る」系）
    const atkSelfPowers = calcFieldPowers(newMyState, newOpState, true, ctx.effectsMap, ctx.cardMap, ctx.bs.turn_phase);
    // 🆕**§5.3 `O-238`**＝呼び出し元が「React state にまだ反映していない盤面」を渡してきたとき
    //   （フリップアタック）は、`ctx.effectsMap`（memo）が**変更前の場**で組まれているので
    //   【レイヤー付与】だけ組み直す。同一なら memo をそのまま使う（余計な再計算をしない）。
    // ⚠**`my` は関数先頭で `let my = p.attacker` と shadow されている**＝`p.attacker === my` は常に true。
    //   （2026-09-05 に実際にこれで1回空振りした）＝呼び出し元が明示フラグで宣言する。
    const atkTrigCtx = p.regrantLayerAbilities ? mkTrigCtxWithLayerGrants(ctx)(newMyState, newOpState, true) : ctx.trigCtx();
    const attackEntries = pureCollectAttackerSelfTriggers(
      // 🆕最後の引数＝「正面以外のシグニゾーンにアタックしたか」（2026-08-31 続き749・`WXEX2-71-E1`）。
      //   `isSideAttack` は上（:8826）で `p.targetOpZone !== undefined`＝【側面アタック】として既に立っている。
      atkTrigCtx, newMyState, newOpState, myTopNum, attackerId, atkSelfPowers, isSideAttack,
    );

    // 🆕INSTALL_DELAYED_TRIGGER（§5.3 2026-08-27 Sheet1 B11）＝**攻撃側**に設置された
    //   「このターン、あなたのシグニ１体がアタックしたとき、…」watcher（`WX10-035`）。
    //   防御側の収集（下の `pureCollectSigniAttackDelayedTriggers`）は `attackerOwner:'self'` を
    //   読み飛ばすので、ここを足さないと設置しても永久に発火しない。
    attackEntries.push(...pureCollectAttackerSelfDelayedTriggers(ctx.trigCtx(), attackerId, newMyState, myTopNum));

    // any_ally scope: 味方フィールドの他シグニが持つON_ATTACK_SIGNIへの応答（例: WX01-029）
    const allyAttackRes = pureCollectFieldTriggers(ctx.trigCtx(), 'ON_ATTACK_SIGNI', myTopNum, newMyState, newOpState, attackerId, { sideAttack: isSideAttack });
    const allyAttackEntries = allyAttackRes.entries;
    // usageLimit（《ターン1回/2回》）消費を actions_done へ永続化（attacker=myState / defender=opState）
    const atkUsedMine = attackerIsHost ? allyAttackRes.usedHostIds : allyAttackRes.usedGuestIds;
    const atkUsedOpp  = attackerIsHost ? allyAttackRes.usedGuestIds : allyAttackRes.usedHostIds;
    const newOpStateAtk: PlayerState = atkUsedOpp.length > 0
      ? { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...atkUsedOpp] }
      : newOpState;

    // ON_ATTACK_SIGNIトリガー（防御側：相手シグニがアタックしたとき発動するAUTO効果）
    const opFrontZoneIdx = p.targetOpZone ?? (2 - zoneIndex); // 側面アタックは攻撃先＝指定ゾーン
    const opAtkedEntries: StackEntry[] = [];
    const opPlayerId = defenderId;
    newOpState.field.signi.forEach((opSigniStack, ozi) => {
      const opTopNum = opSigniStack?.at(-1);
      if (!opTopNum) return;
      for (const oe of (ctx.effectsMap.get(opTopNum) ?? [])) {
        if (oe.effectType !== 'AUTO') continue;
        // ON_FRONT_SIGNI_ATTACK: 「このシグニの正面のシグニがアタックしたとき」。
        //   正面（opFrontZoneIdx＝アタッカーと向かい合うゾーン）の守備側シグニのみ発火。triggeringCardNum=アタッカー。
        if (oe.timing?.includes('ON_FRONT_SIGNI_ATTACK')) {
          if (ozi !== opFrontZoneIdx) continue;
          if (oe.activeCondition && !checkActiveCondition(oe.activeCondition, newOpState, newMyState, false, ctx.cardMap, opTopNum)) continue;
          opAtkedEntries.push({
            id: generateUUID(),
            playerId: opPlayerId,
            cardNum: opTopNum,
            effectId: oe.effectId,
            label: `${ctx.cardMap.get(opTopNum)?.CardName ?? opTopNum} の【自】効果（正面シグニアタック時）`,
            effect: oe,
            triggeringCardNum: myTopNum, // 「それ」= アタッカー（正面のシグニ）
          } satisfies StackEntry);
          continue;
        }
        if (!oe.timing?.includes('ON_ATTACK_SIGNI')) continue;
        const oeAct = oe.action as import('../../../types/effects').StubAction;
        if (oeAct.type !== 'STUB') continue;
        if (oeAct.id === 'MOVE_TO_OTHER_SIGNI_ZONE') {
          opAtkedEntries.push({
            id: generateUUID(),
            playerId: opPlayerId,
            cardNum: opTopNum,
            effectId: oe.effectId,
            label: `${ctx.cardMap.get(opTopNum)?.CardName ?? opTopNum} の【自】効果（相手シグニアタック時）`,
            effect: oe,
          } satisfies StackEntry);
        } else if (oeAct.id === 'MOVE_TO_ATTACKER_FRONT') {
          opAtkedEntries.push({
            id: generateUUID(),
            playerId: opPlayerId,
            cardNum: opTopNum,
            effectId: oe.effectId,
            label: `${ctx.cardMap.get(opTopNum)?.CardName ?? opTopNum} の【自】効果（アタッカー正面移動）`,
            effect: { ...oe, action: { ...oeAct, value: opFrontZoneIdx } },
          } satisfies StackEntry);
        }
      }
    });

    // INSTALL_DELAYED_TRIGGER（B3・タスク12(lxi) 第8波）: 防御側プレイヤーに設置された ON_ATTACK_SIGNI
    // watcher（`WXK05-009-E2`）。上のループは場のシグニ効果しか走査しないため、プレイヤーに設置された
    // 遅延分は拾えず、parser 側は設置を落として**起動した瞬間に相手シグニを1体トラッシュ**する
    // 過剰実行になっていた。triggeringCardNum＝アタッカーで帰結の「そのシグニ」が解ける。
    opAtkedEntries.push(...pureCollectSigniAttackDelayedTriggers(ctx.trigCtx(), defenderId, newOpState, myTopNum));

    // ON_OPP_SIGNI_ATTACK_DIRECT: 正面が空（=守備側ルリグへの直接アタック）のとき、
    // 守備側ルリグの「コストを払ってアタックを無効にしてもよい」能力をスタックに積んで提示する（WX04-004-E2）。
    // STUB(OPP_DIRECT_ATTACK_NEGATE)が支払い可否判定・選択・アタッカーのキャンセルフラグ設定までを担う。
    // 側面アタックはシグニゾーンへの攻撃で直接アタックではないため対象外。
    if (!opTopCardNum && !isSideAttack) {
      const defLrigTop = newOpState.field.lrig.at(-1);
      if (defLrigTop) {
        for (const de of (ctx.effectsMap.get(defLrigTop) ?? ctx.effectsMap.get(getCardNum(defLrigTop)) ?? [])) {
          if ((de.effectType !== 'AUTO' && de.effectType !== 'ACTIVATED') || !de.timing?.includes('ON_OPP_SIGNI_ATTACK_DIRECT')) continue;
          opAtkedEntries.push({
            id: generateUUID(),
            playerId: defenderId,
            cardNum: defLrigTop,
            effectId: de.effectId,
            label: `${ctx.cardMap.get(getCardNum(defLrigTop))?.CardName ?? defLrigTop} の【自】効果（正面が空のアタックを無効化）`,
            effect: de,
          } satisfies StackEntry);
        }
      }
    }

    // ON_OPP_SIGNI_ATTACK（タスク12(cx)）: 守備側の「対戦相手のシグニ1体がアタックしたときにしか使用できない」【起】。
    // 使用条件ではなく**使用タイミング**なので、宣言→バトル解決の間にここで守備側のスタックへ積む
    // （`wrapOptionalOnPlay` が「エクシード等を支払って発動するか」の CHOOSE に包む＝踏み倒しなし）。
    // ⚠ここで積まないと相手ターン中にアクセスする経路が構造的に無い（【起】のUIは全て自ターン限定）。
    opAtkedEntries.push(...collectOppSigniAttackResponses(newOpState, newMyState, ctx.effectsMap, ctx.cardMap, ctx.bs.turn_phase)
      .map(({ cardNum, effect }) => ({
        id: generateUUID(),
        playerId: defenderId,
        cardNum,
        effectId: effect.effectId,
        label: `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum} の【起】効果（相手シグニのアタックに応答）`,
        effect,
        triggeringCardNum: myTopNum, // 「アタックしているシグニ」＝アタッカー
      } satisfies StackEntry)));

    // ON_SIGNI_DOWN（アタックダウン・タスク16[C]機構①）: アタック宣言でアタッカーがダウンした（byEffect:false＝
    // 「効果によってダウン」限定の watcher は発火しない）。中央 diff はスタック解決のみを通るためここで収集する。
    // 🔴台帳は**収集の前に**積む（`fireCondition` が今回のダウンを含めて数えるため）。
    //   アタックでダウンするのはアタッカー＝`newMyState` 側。
    const newMyStateDownRec = recordSigniDownedThisTurn(newMyState, [myTopNum]);
    const downHostSt  = attackerIsHost ? newMyStateDownRec : newOpStateAtk;
    const downGuestSt = attackerIsHost ? newOpStateAtk : newMyStateDownRec;
    const atkDownRes = pureCollectSigniDownUpTriggers(ctx.trigCtx(), 'ON_SIGNI_DOWN',
      [{ ownerId: attackerId, nums: [myTopNum], byEffect: false }], downHostSt, downGuestSt);
    const atkDownUsedMine = attackerIsHost ? atkDownRes.usedHostIds : atkDownRes.usedGuestIds;
    const atkDownUsedOpp  = attackerIsHost ? atkDownRes.usedGuestIds : atkDownRes.usedHostIds;
    const newOpStateAtkDown: PlayerState = atkDownUsedOpp.length > 0
      ? { ...newOpStateAtk, actions_done: [...(newOpStateAtk.actions_done ?? []), ...atkDownUsedOpp] }
      : newOpStateAtk;

    // バトル解決前にON_ATTACK_SIGNIを処理するため pending_signi_battle をセット（側面アタックは攻撃先ゾーンを保持）
    const newMyStateWithPending: PlayerState = {
      // 「このターンでN回目」台帳（§6.4 O-11）＝上で積んだ `newMyStateDownRec` をそのまま引き継ぐ。
      //   ⚠アタック宣言によるダウンも**同じ台帳へ積む**（原文の「ダウン状態になったとき」は
      //     効果起因に限らない。`byEffect` の絞りは watcher 側の役目）。
      ...newMyStateDownRec,
      ...(atkUsedMine.length > 0 || atkDownUsedMine.length > 0
        ? { actions_done: [...(newMyState.actions_done ?? []), ...atkUsedMine, ...atkDownUsedMine] } : {}),
      pending_signi_battle: { zoneIndex, ...(isSideAttack ? { targetOpZone: p.targetOpZone } : {}) },
    };

    const allAttackTriggers = [...attackFieldTrashTriggerEntries, ...attackEntries, ...allyAttackEntries, ...opAtkedEntries, ...atkDownRes.entries];
    if (allAttackTriggers.length > 0) {
      const turnPlayerId = ctx.bs.active_user_id ?? attackerId;
      const existingStack = ctx.bs.effect_stack ?? null;
      const stack = existingStack
        ? pushToStack(existingStack, allAttackTriggers)
        : initStack(turnPlayerId, allAttackTriggers);
      await ctx.io.commit(reduceBattle(ctx.bs, { type: 'WRITE_STATE', myKey: myKey, myState: newMyStateWithPending, opp: { key: opKey, state: newOpStateAtkDown }, effectStack: stack }));
    } else {
      await ctx.io.commit(reduceBattle(ctx.bs, { type: 'WRITE_STATE', myKey: myKey, myState: newMyStateWithPending, opp: { key: opKey, state: newOpStateAtkDown } }));
    }
  } finally {
    ctx.io.setLoading(false);
  }
};
