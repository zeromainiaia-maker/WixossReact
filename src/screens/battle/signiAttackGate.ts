import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect } from '../../types/effects';
import { calcContinuousBlockedActions, calcFieldPowers, checkActiveCondition, collectForcedFrontAttackZones, resolveForcedSigniAttack, type ContinuousBlockResult } from '../../engine/effectEngine';
import { attackFieldTrashCost, canPayAttackFieldTrashCost } from './attackFieldTrashCost';
import { parsePowerVal } from './battleUtils';
import { signiAttackBanCost, signiAttackBansNeedPower } from './signiAttackBan';

/**
 * シグニアタックの可否（ルール由来の軸だけ）を1か所で判定する純関数。
 *
 * ⚠**必ず3箇所（人間のアタックボタン生成 / 共通実行経路 performSigniAttack / CPU のアタック候補フィルタ）
 * から同じ関数を呼ぶこと**。かつて `cannotAttackSigni`（CONTINUOUS 由来・keyword_grants「アタックできない」由来）は
 * 人間のボタン生成でしか読まれておらず、`blocked_actions:'ATTACK:<num>'` だけが3箇所共通という
 * 軸の不一致があった（＝付与された「アタックできない」が CPU に一切効かない）。
 *
 * ⚠**「処理中」「相手のライフバースト待ち」等の一過性UI条件はここに入れない**（呼び出し元の責務）。
 * ここに入れると CPU 側が候補を絞れず無限ループする／実行経路が理由なく早期returnする、の両方に化ける。
 */
export type SigniAttackBlockReason =
  | 'CONTINUOUS_CANNOT_ATTACK' // CONTINUOUS BLOCK_ACTION・ONE_ATTACK_PER_TURN・付与「アタックできない」等
  | 'BLOCKED_ACTION'           // blocked_actions の 'ATTACK:<CardNum>'
  | 'OPP_POWER_CAP'            // OPP_SIGNI_ATTACK_POWER_RESTRICT（相手が課したパワー上限以下はアタック不可）
  | 'ONCE_PER_TURN_LIMIT'      // signi_attack_once_limit（このターンのシグニアタックは合計1回）
  | 'ENERGY_COST'              // OPP_SIGNI_ATTACK_COST のエナが払えない
  | 'FIELD_TRASH_COST'         // 「他のシグニN体をトラッシュしないかぎりアタックできない」が払えない
  | 'ATTACK_BAN'               // signi_attack_bans_this_turn（「〈条件〉のシグニでアタックできない」）
  | 'ATTACK_BAN_COST'          // 同・「《無》×N を支払わないかぎり」の分が払えない
  | 'ATTACK_BAN_HAND_COST'     // 同・「手札をN枚捨てないかぎり」の分が払えない（手札不足）
  | 'ALREADY_DOWN'             // すでにダウンしている（＝アタック済み）。§6.4 O-10 で gate へ寄せた
  | 'FORCED_ATTACK_ORDER';     // 「可能ならばアタックしなければならない」対象が未アタック＝**そちらが先**（§6.4 O-8(a)）

export interface SigniAttackGateInput {
  attacker: PlayerState;
  defender: PlayerState;
  /** アタックするシグニ（フィールド最前面）の CardNum。 */
  attackerNum: string;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  /** 事前計算済みなら渡す（UI のメモ）。無ければアタッカー視点で計算する。 */
  contBlocked?: ContinuousBlockResult;
  /** 事前計算済みなら渡す（UI のメモ）。無ければアタッカー視点で計算する。 */
  effectivePowers?: Map<string, number>;
  turnPhase?: TurnPhase;
  /**
   * 「他のシグニN体トラッシュ」を**支払い済みで再入**した場合に true。
   * ⚠支払い後も `signi_attack_field_trash_costs` の予約は残り、支払いで場が減っているため、
   *   このフラグ無しだと再入時に「もう払えない」と誤判定してアタックが黙って消える
   *   （G154 BURST の無効化回避モーダルからの再実行が該当）。
   */
  fieldTrashCostAlreadyPaid?: boolean;
  /**
   * 内部用＝**強制アタック順**（§6.4 O-8(a)）の判定から再入するときだけ true。
   * ⚠強制対象が「いまアタック可能か」を同じ gate で判定するため、立てないと無限再帰する。
   *   立てて呼ぶのは `collectForcedAttackZones` の1箇所だけ。
   */
  skipForcedOrderRule?: boolean;
}

/** `collectForcedAttackZones` の入力（アタッカー1体を指さないので `attackerNum` を持たない）。 */
export type ForcedAttackScanInput = Omit<SigniAttackGateInput, 'attackerNum'>;

/**
 * 「可能ならばアタックしなければならない」対象のうち、**まだアタックしておらず、いまアタックできる**
 * シグニのゾーン index 一覧（§6.4 O-8(a)）。
 *
 * 原文のリマインダは「（**他のシグニより先にアタックしなければならない**）」＝**順序の規則**。
 * ここが空でない間は、含まれないゾーンのシグニはアタックできない（`FORCED_ATTACK_ORDER`）。
 *
 * ⚠**「アタック可能か」は同じ gate で判定する**（`skipForcedOrderRule`）＝
 *   「可能ならば」の除外（アタック禁止・コスト不足・パワー上限）が自動で効き、
 *   アタックできない強制対象が残ってフェイズを進められなくなるソフトロックを防ぐ。
 * ⚠**フェイズ進行のブロック（`mustAttackRemainingZones`）も必ずこの関数を使う**＝
 *   軸を写経すると「ボタンは消えるのにフェイズは進める」型のズレが出る。
 */
export function collectForcedAttackZones(p: ForcedAttackScanInput): number[] {
  const { attacker, defender, effectsMap, cardMap } = p;
  // アタックはアタッカーのターンにしか起きないので isViewerTurn は常に true。
  const front = collectForcedFrontAttackZones(attacker, defender, true, effectsMap, cardMap);
  const all = resolveForcedSigniAttack(attacker, defender, true, effectsMap, cardMap);
  if (!all.forced && front.size === 0) return [];
  const down = attacker.field.signi_down ?? [false, false, false];
  const virus = attacker.field.signi_virus ?? [0, 0, 0];
  const zones: number[] = [];
  for (let i = 0; i < attacker.field.signi.length; i++) {
    const top = attacker.field.signi[i]?.at(-1);
    if (!top) continue;
    if (down[i]) continue;                                   // 既にアタック済み（ダウン）
    const byFront = front.has(i);
    if (!all.forced && !byFront) continue;                   // 全体強制でなければ正面強制のゾーンだけ
    if (all.forced && all.infectedOnly && (virus[i] ?? 0) === 0 && !byFront) continue; // 感染限定
    if (signiAttackBlockReason({ ...p, attackerNum: top, skipForcedOrderRule: true }) !== null) continue;
    zones.push(i);
  }
  return zones;
}

/**
 * 「ダウン状態でもアタックできる」（`ATTACK_WHILE_DOWN`＝`WX22-022-E1`・§6.4 O-10）を宣言しているか。
 * ⚠**判定はここ1箇所**＝人間ボタン／`performSigniAttack`／CPU 候補フィルタが同じ gate を通るので、
 *   呼び出し元に「すでにダウン」判定を写経すると例外が片側にしか効かない。
 */
function declaresAttackWhileDown(
  attacker: PlayerState, defender: PlayerState, attackerNum: string,
  effectsMap: Map<string, CardEffect[]>, cardMap: Map<string, CardData>,
): boolean {
  return (effectsMap.get(attackerNum) ?? []).some(eff =>
    eff.effectType === 'CONTINUOUS'
    && eff.action.type === 'STUB'
    && (eff.action as { id?: string }).id === 'ATTACK_WHILE_DOWN'
    && checkActiveCondition(eff.activeCondition, attacker, defender, true, cardMap, attackerNum));
}

/**
 * ダウン状態のまま同一ターンに撃てるアタックの**安全上限**（§6.4 O-10）。
 *
 * 🔑「ダウン状態でもアタックできる」は原文どおりなら回数を制限しない＝現存カード（`WX22-022`）は
 * 同居する【常】「自身のパワー10000につき一度まで」で必ず止まるが、**その相方を持たない札が将来出ると
 * CPU/fuzz が無限にアタックし続ける**（`performSigniAttack` はダウン済みでも状態が変わらない）。
 * ここは挙動の再現ではなく**ハングを止めるための弁**なので、実カードが到達しない値にしておく。
 */
const MAX_ATTACKS_WHILE_DOWN = 5;

/** アタックできない理由。null ならアタック可能。 */
export function signiAttackBlockReason(p: SigniAttackGateInput): SigniAttackBlockReason | null {
  const { attacker, defender, attackerNum, effectsMap, cardMap } = p;

  if (attacker.blocked_actions?.includes(`ATTACK:${attackerNum}`)) return 'BLOCKED_ACTION';

  // 実効パワーは「相手が課したパワー上限」「アタック禁止のパワー条件」「パワー比例のアタック回数」の
  // 3軸が使う。⚠**同じ1本を共有する**＝軸ごとに引き直すと、渡された `effectivePowers` を使う軸と
  //   印刷パワーへ落ちる軸が混ざって人間/CPU でズレる。
  let powersCache = p.effectivePowers;
  const getPowers = (): Map<string, number> =>
    (powersCache ??= calcFieldPowers(attacker, defender, true, effectsMap, cardMap, p.turnPhase));

  // §6.4 O-10（続き507）＝「すでにダウン」を gate へ寄せた（従来は人間ボタン生成と CPU 候補フィルタに
  // インラインで写経されていた）。例外は【常】「このシグニはダウン状態でもアタックできる」だけ。
  const downZone = attacker.field.signi.findIndex(stack => stack?.at(-1) === attackerNum);
  if (downZone >= 0 && (attacker.field.signi_down?.[downZone] ?? false)) {
    if (!declaresAttackWhileDown(attacker, defender, attackerNum, effectsMap, cardMap)) return 'ALREADY_DOWN';
    if ((attacker.attacked_signi_ids ?? []).filter(id => id === attackerNum).length >= MAX_ATTACKS_WHILE_DOWN) {
      return 'ALREADY_DOWN';
    }
  }

  // アタックはアタッカーのターンにしか起きないので isOwnerTurn は常に true。
  const contBlocked = p.contBlocked
    ?? calcContinuousBlockedActions(attacker, defender, true, effectsMap, cardMap, getPowers());
  if (contBlocked.cannotAttackSigni.has(attackerNum)) return 'CONTINUOUS_CANNOT_ATTACK';
  // 【常】由来の「〈コスト〉を支払わないかぎりアタックできない」は**払えば通る**（§6.4 O-31）。
  // ⚠`cannotAttackSigni` と同じ扱いにすると「絶対に通らない」に化ける。
  //   ⚠**同じ加算を `signiAttackColorlessCost` にも入れる**＝判定と引き落としが別の数を見ると
  //     「判定は通るのに引き落としが0」＝タダでアタックできる穴になる（続き494 のルリグ側と同じ罠）。
  const contPay = contBlocked.cannotAttackSigniUnlessPayColorless.get(attackerNum) ?? 0;

  // OPP_SIGNI_ATTACK_POWER_RESTRICT: 相手側が設定したパワー上限「以下」のシグニはアタック不可
  const oppPowerCap = defender.opp_signi_attack_power_cap;
  if (oppPowerCap !== undefined) {
    const signiPower = getPowers().get(attackerNum) ?? parsePowerVal(cardMap.get(attackerNum)?.Power);
    if (signiPower <= oppPowerCap) return 'OPP_POWER_CAP';
  }

  if (attacker.signi_attack_once_limit && (attacker.attacked_signi_ids?.length ?? 0) > 0) {
    return 'ONCE_PER_TURN_LIMIT';
  }

  // signi_attack_bans_this_turn: 「このターン、対戦相手は〈条件〉のシグニでアタックできない」（§6.4 O-3）
  if ((attacker.signi_attack_bans_this_turn?.length ?? 0) > 0 || contPay > 0) {
    // 実効パワー参照の ban が無ければパワー計算そのものを省く（毎ゾーン呼ばれる関数なので）。
    const banPower = signiAttackBansNeedPower(attacker)
      ? (getPowers().get(attackerNum) ?? parsePowerVal(cardMap.get(attackerNum)?.Power))
      : undefined;
    const banCost = signiAttackBanCost(attacker, attackerNum, cardMap, banPower);
    if (banCost === null) return 'ATTACK_BAN';
    const colorless = banCost.colorless + contPay;
    if (colorless > 0 && attacker.energy.length < colorless + (attacker.signi_attack_cost ?? 0)) return 'ATTACK_BAN_COST';
    // 「手札をN枚捨てないかぎり」＝**アタックするごとに**払うので、毎回いまの手札で判定する。
    if (banCost.handDiscard > 0 && attacker.hand.length < banCost.handDiscard) return 'ATTACK_BAN_HAND_COST';
  }

  // OPP_SIGNI_ATTACK_COST: アタック自体にエナコストが必要（performSigniAttack が実際に引き落とす）
  const signiAtkCost = attacker.signi_attack_cost ?? 0;
  if (signiAtkCost > 0 && attacker.energy.length < signiAtkCost) return 'ENERGY_COST';

  if (!p.fieldTrashCostAlreadyPaid
      && attackFieldTrashCost(attacker, attackerNum) > 0
      && !canPayAttackFieldTrashCost(attacker, attackerNum, cardMap)) {
    return 'FIELD_TRASH_COST';
  }

  // §6.4 O-8(a)「可能ならばアタックしなければならない（**他のシグニより先にアタックしなければならない**）」。
  // 🔴従来はフェイズ進行を止めるだけで**順序を強制していなかった**＝強制対象を後回しにして
  //   他のシグニから先にアタックできてしまう（原文のリマインダが明示している規則の違反）。
  // ⚠最後に置く＝他の「そもそもアタックできない」理由を先に返したい（理由表示が「順番」に化けない）。
  if (!p.skipForcedOrderRule) {
    const forcedZones = collectForcedAttackZones(p);
    if (forcedZones.length > 0) {
      const zi = attacker.field.signi.findIndex(stack => stack?.at(-1) === attackerNum);
      if (zi >= 0 && !forcedZones.includes(zi)) return 'FORCED_ATTACK_ORDER';
    }
  }

  return null;
}

export function canSigniAttack(p: SigniAttackGateInput): boolean {
  return signiAttackBlockReason(p) === null;
}

/**
 * アタック宣言時に前払いする《無》の総額（`signi_attack_bans_this_turn` 由来 ＋ 【常】由来）。
 * `null` なら解除できない禁止が掛かっている（＝どれだけ払っても不可）。
 *
 * ⚠**判定（`signiAttackBlockReason`）と引き落とし（`performSigniAttack`）は必ずこの1関数を見る**。
 *   軸ごとに別々に足すと「判定は通るのに引き落としが0」＝タダでアタックできる穴になる
 *   （続き494 でルリグ側の同じ穴を実際に踏んだ）。⚠支払い軸を増やすときもここに足す。
 */
export function signiAttackColorlessCost(p: SigniAttackGateInput): number | null {
  const contBlocked = p.contBlocked
    ?? calcContinuousBlockedActions(p.attacker, p.defender, true, p.effectsMap, p.cardMap);
  const ban = signiAttackBanCost(p.attacker, p.attackerNum, p.cardMap, p.effectivePowers?.get(p.attackerNum));
  if (ban === null) return null;
  return ban.colorless + (contBlocked.cannotAttackSigniUnlessPayColorless.get(p.attackerNum) ?? 0);
}
