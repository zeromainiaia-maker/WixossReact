import { collectCopiedLrigAutoEffects, collectLrigGrantedEffects, collectOppLrigAttackExtraCost } from '../../../engine/effectEngine';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { attackingLrigPrintedEffects, collectAllyLrigAttackTriggers as pureCollectAllyLrigAttackTriggers, collectLrigAttackDefenderTriggers as pureCollectLrigAttackDefenderTriggers } from '../../../engine/triggerCollect';
import { type PlayerState, type StackEntry } from '../../../types';
import { type LrigAttackSlot, assistLrigAttackableSlots, lrigSlotTop, markLrigSlotDown } from '../assistLrigAttack';
import { canPayLrigAttackFieldTrashCost, deterministicLrigAttackFieldTrashZones, payLrigAttackFieldTrashCost } from '../attackFieldTrashCost';
import { consumeNthAttackNegation, getTargetedAttackNegation, resolveNegateEscapeChoice } from '../attackNegation';
import { generateUUID } from '../battleUtils';
import { reduceBattle } from '../controller/battleController';
import { isEnergyPayBlocked } from '../energyPaySource';
import { collectAttackingLrigGrantedAutos, consumeTriggeredGrantedAutos } from '../grantedAuto';
import { centerLrigAttackBlock } from '../lrigAttackGate';
import { lrigAttackBanCost } from '../signiAttackBan';
import type { PerformCtx } from './performCtx';

/**
 * ルリグアタックの実行（人間・CPU 共通）。
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O（`commit`／`appendLogs`／`setLoading`）と
 *   材料（`PerformCtx`）を注入にした。⚠**可否の判定はここに書かない**（`centerLrigAttackBlock`／`lrigAttackCostInfo`）。
 */
const lrigAttackCostInfo = (ctx: PerformCtx) => (
  my: PlayerState, op: PlayerState, lrigNum: string | null | undefined,
): { blocked: boolean; colorless: number; fieldTrash: number } => {
  const banCost = lrigAttackBanCost(my, lrigNum, ctx.cardMap);
  // 解除できない ban（「アタックできない」だけ）が掛かっている＝どれだけ払っても不可。
  if (banCost === null) return { blocked: true, colorless: 0, fieldTrash: 0 };
  const colorless = collectOppLrigAttackExtraCost(op, my, ctx.cardMap, ctx.effectsMap, false) + banCost.colorless;
  // 🆕**「あなたのシグニN体を場からトラッシュに置かないかぎり」**（§5.3 `O-222`・`WX24-P3-049-E1`）。
  // ⚠**払えるかどうかも同じ関数で見る**＝盤面にシグニが足りなければアタック不可
  //   （押せるのに無反応＝§6.4 `O-18` にしない）。
  const fieldTrash = banCost.fieldTrash;
  // 「手札をN枚捨てないかぎり」のルリグ版は**母集団0**（原文はいずれもシグニ）。
  // 万一生えたら支払いUIが無いので過少側（アタック不可）に倒す＝無言で無視しない。
  // §5.3 `O-371`＝《無》の前払いは `buildEnergyPayPool` を通らない＝「1以上のエナコストを支払えない」はここで見る。
  const blocked = banCost.handDiscard > 0
    || my.energy.length < colorless
    || (colorless > 0 && isEnergyPayBlocked(my, ctx.bs?.turn_phase ?? 'ATTACK_LRIG'))
    || !canPayLrigAttackFieldTrashCost(my, fieldTrash, ctx.cardMap);
  return { blocked, colorless, fieldTrash };
};

// ルリグアタックの実行（人間・CPU共通）: アタッカーのルリグをダウンし防御側にガード応答を要求。
// アタック不可（ドライブ状態・無効化等）の場合は状態を変えずに false を返す
export const performLrigAttack = async (p: {
  attacker: PlayerState; defender: PlayerState;
  attackerId: string;
  attackerKey: 'host_state' | 'guest_state';
  /**
   * アタック元のルリグ枠（省略＝センター）。`assist_l`/`assist_r` は `ASSIST_LRIG_ATTACK_THIS_TURN`
   * が立っているターンだけ到達する（§6.4 A群・続き427）。
   * ⚠**センター専用の判定・収集はアシストでは飛ばす**＝`lrig_has_attacked`（センターの1回制限）、
   *   ドライブ状態（ルリグに乗っているシグニ）、センタールリグ付与ストア由来の ON_ATTACK_LRIG。
   *   ここを共有すると「アシストがアタックしたらセンターも撃てなくなる」等の別バグになる。
   */
  slot?: LrigAttackSlot;
  /**
   * 🆕**「シグニN体を場からトラッシュに置かないかぎりアタックできない」の支払い**（§5.3 `O-222`）。
   * 人間はモーダルで選んだゾーン、CPU は `deterministicLrigAttackFieldTrashZones` が決める。
   * ⚠**未指定なら CPU 規約（盤面左から）で自動選択する**＝ここを素通りさせると
   *   「払わずにアタックできる」無言の過少コストになる。
   */
  attackFieldTrashZones?: number[];
  /**
   * 🆕§5.7 `S-5c` 第2段＝**無効化の回避UI（手札を捨てて逃げる）を開く**。
   * ⚠**画面だけが渡す**＝CPU・ヘッドレスは渡さない（元々 `attackerId === userId` のときしか開かないので挙動は同じ）。
   */
  openNegateEscape?: (a: { zoneIndex: number; cardNum: string; count: number }) => void;
}, ctx: PerformCtx): Promise<boolean> => {
  const { attacker: my, defender: op, attackerId } = p;
  const slot: LrigAttackSlot = p.slot ?? 'center';
  const isCenterAttack = slot === 'center';
  // 🆕**§5.3 `O-366`（2026-09-14）＝センターのアタック可否は `centerLrigAttackBlock` の1本に寄せた。**
  //   🔴従来ここには `if (my.lrig_has_attacked) return false;` が在り、
  //     **効果でアップされても再アタックできない**＝再アタック系 live 20効果が真 no-op だった。
  //   ⚠**アクション一覧（下の `getLrigActions`）と必ず同じ関数を通す**＝
  //     片方だけ塞がっていたせいで「ボタンは出るが押しても無反応」（§6.4 `O-18`）になっていた。
  if (isCenterAttack && centerLrigAttackBlock(my) !== null) return false;
  if (!isCenterAttack && !assistLrigAttackableSlots(my, ctx.cardMap).includes(slot)) return false;
  if (op.field.lrig_attacked) return false; // ガード応答待ち中
  const myLrigNumLA = lrigSlotTop(my, slot);
  const allowDriveAttack = !!(myLrigNumLA && (ctx.effectsMap.get(myLrigNumLA) ?? []).some(e =>
    e.effectType === 'CONTINUOUS' &&
    (e.action as import('../../../types/effects').StubAction).type === 'STUB' &&
    (e.action as import('../../../types/effects').StubAction).id === 'ALLOW_ATTACK_WHILE_DRIVE',
  ));
  if (isCenterAttack && (my.lrig_riding_signi?.length ?? 0) > 0 && !allowDriveAttack) return false; // ドライブ状態：ルリグはアタックできない
  // keyword_grants で「アタックできない」が付与されている場合アタック不可
  if (myLrigNumLA && (my.keyword_grants?.[myLrigNumLA] ?? []).includes('アタックできない')) return false;
  // 《無》×N の前払い（§6.4 O-28）＝払えないならアタックそのものが成立しない。
  const lrigCostLA = lrigAttackCostInfo(ctx)(my, op, myLrigNumLA);
  if (lrigCostLA.blocked) return false;
  // NEGATE_ATTACK: ルリグもアタック宣言時に無効化。escapeDiscard があり手札を払える場合は既存回避UIへ。
  // （旧 PREVENT_TARGET_LRIG_ATTACK_THIS_TURN の判定を統合＝同じ negated_attacks を見る）
  // ⚠回避モーダルを開けるのは自分のアタックのときだけ。CPU/リモート側のアタックは払わず無効化を受け入れる。
  const targetedLrigNegation = getTargetedAttackNegation(my, myLrigNumLA);
  if (targetedLrigNegation.negated) {
    const escapeCount = targetedLrigNegation.escapeDiscard;
    if (escapeCount && my.hand.length >= escapeCount && attackerId === ctx.userId && p.openNegateEscape) {
      p.openNegateEscape({ zoneIndex: -1, cardNum: myLrigNumLA!, count: escapeCount });
      return false;
    }
    ctx.io.setLoading(true);
    try {
      const accepted = resolveNegateEscapeChoice(my, op, 'accept', myLrigNumLA!, -1);
      const defenderKey: 'host_state' | 'guest_state' = p.attackerKey === 'host_state' ? 'guest_state' : 'host_state';
      ctx.io.appendLogs([`${ctx.cardMap.get(myLrigNumLA!)?.CardName ?? myLrigNumLA}のアタックは無効化された`]);
      await ctx.io.commit(reduceBattle(ctx.bs, {
        type: 'WRITE_STATE',
        myKey: p.attackerKey,
        myState: accepted.attacker,
        opp: { key: defenderKey, state: accepted.defender },
      }));
    } finally {
      ctx.io.setLoading(false);
    }
    return true;
  }
  ctx.io.setLoading(true);
  try {
    const myKey = p.attackerKey;
    const lrigNum = myLrigNumLA ?? '';
    const lrigName = ctx.cardMap.get(lrigNum)?.CardName ?? 'ルリグ';
    // 《無》の前払い（OPP_LRIG_ATTACK_COST＋付与された ban）＝可否は上の `lrigAttackCostInfo` で判定済み。
    // ⚠ここは引き落としだけ（続き490 の「判定と引き落としを別軸にしない」と同じ規約）。
    const lrigAttackExtraCost = lrigCostLA.colorless;
    let myEnergyAfterAttack = my.energy;
    if (lrigAttackExtraCost > 0) {
      const removed = myEnergyAfterAttack.slice(-lrigAttackExtraCost);
      myEnergyAfterAttack = myEnergyAfterAttack.slice(0, -lrigAttackExtraCost);
      ctx.io.appendLogs([`ルリグアタック追加コスト（《無》×${lrigAttackExtraCost}）消費：${removed.map(n=>ctx.cardMap.get(n)?.CardName??n).join('、')}`]);
    }
    // 🆕**場のシグニN体を場からトラッシュに置く解除コスト**（§5.3 `O-222`・`WX24-P3-049-E1`）。
    // ⚠**引き落としだけ**＝可否は上の `lrigAttackCostInfo` が判定済み（判定と引き落としを別軸にしない）。
    // ⚠**払えなければアタックを成立させない**（`null` は fail-closed）。
    let myAfterFieldTrash = my;
    if (lrigCostLA.fieldTrash > 0) {
      const zonesLA = p.attackFieldTrashZones
        ?? deterministicLrigAttackFieldTrashZones(my, lrigCostLA.fieldTrash, ctx.cardMap);
      const paid = payLrigAttackFieldTrashCost(my, lrigCostLA.fieldTrash, zonesLA, ctx.cardMap);
      if (!paid) return false;
      myAfterFieldTrash = paid.state;
      ctx.io.appendLogs([`ルリグアタック解除コスト（シグニ${lrigCostLA.fieldTrash}体）トラッシュ：${paid.trashedSigniNums.map(n=>ctx.cardMap.get(n)?.CardName??n).join('、')}`]);
    }
    ctx.io.appendLogs([`${lrigName}がアタック`]);
    const attackedMyState: PlayerState = {
      ...myAfterFieldTrash, energy: myEnergyAfterAttack,
      ...(isCenterAttack ? { lrig_has_attacked: true } : {}),
      // 🆕§5.3 `O-236`＝上限つきのときは回数も数える（上限が無い日は書かない＝既存の挙動を汚さない）。
      ...(isCenterAttack && my.lrig_attack_limit_this_turn !== undefined
        ? { lrig_attack_count_this_turn: (my.lrig_attack_count_this_turn ?? 0) + 1 } : {}),
      field: markLrigSlotDown(myAfterFieldTrash, slot),
    };
    // NEGATE_NTH_ATTACK は「アタックしたとき」に無効化するため、追加コスト支払い・ダウン・攻撃済み化は行う。
    // ただし pending_lrig_attack を立てず、ON_ATTACK_LRIG収集とガード/ダメージ応答へは進めない。
    const lrigNegation = consumeNthAttackNegation(op, 'lrig');
    if (lrigNegation.negated) {
      const defenderKey: 'host_state' | 'guest_state' = myKey === 'host_state' ? 'guest_state' : 'host_state';
      ctx.io.appendLogs([`${lrigName}のアタックは無効化された（残り${lrigNegation.remaining}回）`]);
      await ctx.io.commit(reduceBattle(ctx.bs, {
        type: 'WRITE_STATE',
        myKey,
        myState: attackedMyState,
        opp: { key: defenderKey, state: lrigNegation.defender },
      }));
      return true;
    }
    // pending_lrig_attack: true でON_ATTACK_LRIG解決後にガード応答（lrig_attacked）をセット
    // ⚠攻撃元カードも一緒に運ぶ＝ダメージ解決（ダブル/トリプルクラッシュ判定）が
    //   「攻撃側＝センタールリグ」と決め打てなくなったため（アシストのアタック・続き427）。
    let newMyState: PlayerState = { ...attackedMyState, pending_lrig_attack: true, pending_lrig_attack_num: lrigNum };
    // lrig_attacked は ON_ATTACK_LRIG 解決後にセット（スタック解決後の useEffect で対応）

    // ON_ATTACK_LRIG AUTO トリガー収集（ルリグカード自身の効果 + スペル付与の能力 + COPY_LRIG_NAME_ABILITYコピー効果）
    const lrigCardEffects = attackingLrigPrintedEffects(ctx.trigCtx(), newMyState, lrigNum);
    // ⚠**付与ストア／コピー／CONTINUOUS 付与はいずれも「センタールリグの能力」**なので、
    //   アシストルリグのアタックでは収集しない（収集すると同じ能力がアシストのアタックでも
    //   撃てる過剰実行になる）。アシストは**そのカード自身の** ON_ATTACK_LRIG だけが発火する。
    const grantedAttack = isCenterAttack
      ? collectAttackingLrigGrantedAutos(newMyState, attackerId, lrigNum, generateUUID)
      : { entries: [] as StackEntry[], triggered: [], usedIds: [] as string[] };
    newMyState = consumeTriggeredGrantedAutos(newMyState, grantedAttack.triggered);
    if (grantedAttack.usedIds.length > 0) {
      newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...grantedAttack.usedIds] };
    }
    const copiedAutoEffects = (isCenterAttack ? collectCopiedLrigAutoEffects(my, ctx.cardMap, ctx.effectsMap, op, true) : [])
      .filter(e => e.timing?.includes('ON_ATTACK_LRIG'));
    // CONTINUOUS GRANT_LRIG_ABILITY（場のシグニ/キーが「あなたのセンタールリグは『【自】…』を得る」を宣言）由来の
    // ON_ATTACK_LRIG 付与能力（WXDi-P05-032 等）。lrig_granted_auto_effects（実行時付与）とは別ソース。
    // ⚠triggerScope:'any_opp'（「**対戦相手の**センタールリグがアタックしたとき」）は防御側の能力なので
    //   アタック側では拾わない（下の collectLrigAttackDefenderTriggers が担当。タスク12(l)＝WDK04-006）。
    const contGrantedLrigEffects = (isCenterAttack ? collectLrigGrantedEffects(my, op, true, ctx.effectsMap, ctx.cardMap) : [])
      .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_LRIG')
        && (e.triggerScope ?? 'self') !== 'any_opp');
    const otherAttackEffects = [...copiedAutoEffects, ...contGrantedLrigEffects];
    // 防御側の付与AUTO（「対戦相手のルリグがアタックしたとき」＝any_opp/any scope・タスク12(xlvii)）。
    // アタック側とは playerId も usageLimit の書き戻し先も異なるため、別の entries として結合する。
    const defenderKey: 'host_state' | 'guest_state' = myKey === 'host_state' ? 'guest_state' : 'host_state';
    const defenderId = attackerId === ctx.bs.host_id ? ctx.bs.guest_id : ctx.bs.host_id;
    const defRes = pureCollectLrigAttackDefenderTriggers(ctx.trigCtx(), op, defenderId,
      collectLrigGrantedEffects(op, my, false, ctx.effectsMap, ctx.cardMap));
    const defenderUsed = defRes.usedIds.length > 0
      ? { key: defenderKey, state: { ...op, actions_done: [...(op.actions_done ?? []), ...defRes.usedIds] } }
      : undefined;
    const attackerEntries: StackEntry[] = [...lrigCardEffects.map(e => ({
      id: generateUUID(),
      playerId: attackerId,
      cardNum: lrigNum,
      effectId: e.effectId,
      label: `${lrigName} の【自】効果（アタック時）`,
      effect: e,
      triggeringCardNum: lrigNum,
    } satisfies StackEntry)), ...grantedAttack.entries, ...otherAttackEffects.map(e => ({
      id: generateUUID(),
      playerId: attackerId,
      cardNum: lrigNum,
      effectId: e.effectId,
      label: `${lrigName} の【自】効果（アタック時）`,
      effect: e,
    } satisfies StackEntry))];
    // アタック側の**味方カード**（場のシグニ／アシストルリグ）が持つ「あなたのルリグがアタックしたとき」
    // ＝§3 (cxxviii)・続き475d で新設。上の4本はいずれも「ルリグ自身の能力」しか見ないので、
    // この経路が無いと 18効果（17枚がシグニ）が丸ごと拾われない。
    const allyRes = pureCollectAllyLrigAttackTriggers(ctx.trigCtx(), newMyState, attackerId, lrigNum);
    if (allyRes.usedIds.length > 0) {
      newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...allyRes.usedIds] };
    }
    const entries: StackEntry[] = [...attackerEntries, ...allyRes.entries, ...defRes.entries];
    const existingStackLA = ctx.bs.effect_stack ?? null;
    await ctx.io.commit(reduceBattle(ctx.bs, {
      type: 'WRITE_STATE', myKey, myState: newMyState, opp: defenderUsed,
      effectStack: entries.length > 0
        ? (existingStackLA ? pushToStack(existingStackLA, entries) : initStack(ctx.bs.active_user_id ?? attackerId, entries))
        : undefined,
    }));
    return true;
  } finally {
    ctx.io.setLoading(false);
  }
};
