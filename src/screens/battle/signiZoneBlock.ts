import type { PlayerState, SigniZoneBlock } from '../../types';

/**
 * シグニゾーンへの新規配置禁止（タスク12(lxi) 第10波）。
 *
 * 母集団は原文で3系統：
 *  - 「ターン終了時まで、対戦相手のシグニゾーン１つを消す」（REMOVE_SIGNI_ZONE・4枚）
 *  - 「次のターンの間、対戦相手は指定されたシグニゾーンにシグニを新たに配置することができない」
 *    （WX10-051-E1／WX24-P4-024-E3）
 *  - 「このターンと次のターンの間、対戦相手は《無》×5 を支払わないかぎり指定されたシグニゾーンに
 *    シグニを新たに配置できない」（WXDi-P11-009-E3）
 *
 * ⚠射程は「プレイヤーが手札／ルリグデッキから配置する経路」＝ handleSummonSigni・CPU召喚・
 *   SigniSummonZoneModal の3読み手のみ。効果による場出し（ADD_TO_FIELD 等）は対象外で、これは
 *   兄弟の配置制限（signi_deploy_power_limit／signi_deploy_count_limit／collectForcePlaceFrontZones）
 *   がいずれも同じ射程であることに合わせた既存規約。
 */

/** 指定ゾーンに掛かっているブロックを返す（無ければ undefined）。 */
export function findSigniZoneBlock(state: PlayerState, zoneIndex: number): SigniZoneBlock | undefined {
  return (state.signi_zone_blocks ?? []).find(b => b.zone === zoneIndex);
}

/** ブロックを1件追加する（同じゾーンが既にあるときは支払い回避のないほう＝厳しいほうを残す）。 */
export function addSigniZoneBlock(
  blocks: SigniZoneBlock[] | undefined,
  block: SigniZoneBlock,
): SigniZoneBlock[] {
  const rest = (blocks ?? []).filter(b => b.zone !== block.zone);
  const existing = (blocks ?? []).find(b => b.zone === block.zone);
  // 既存が無条件禁止なら、支払い回避つきの新規で緩めない。
  if (existing && existing.colorless === undefined) return [...rest, existing];
  return [...rest, block];
}

export interface SigniZonePlacementResult {
  /** そのゾーンへ新規配置できるか。 */
  allowed: boolean;
  /** 支払い後の state（支払いが無ければ入力そのまま）。allowed=false のときは入力そのまま。 */
  state: PlayerState;
  /** 実際に支払った《無》の枚数（エナ→トラッシュ）。 */
  paidColorless: number;
}

/**
 * 「そのゾーンへ新規配置できるか」を判定し、《無》の回避コストがあれば支払った state を返す。
 * 支払いはエナゾーンの末尾から取ってトラッシュへ置く（ガード追加《無》＝
 * collectOppGuardExtraColorlessCost の既存作法と同型：プロンプトは出さず、
 * 足りなければ配置自体を成立させない）。
 */
export function resolveSigniZonePlacement(
  state: PlayerState,
  zoneIndex: number,
): SigniZonePlacementResult {
  const block = findSigniZoneBlock(state, zoneIndex);
  if (!block) return { allowed: true, state, paidColorless: 0 };
  const cost = block.colorless ?? 0;
  // 支払い回避のないブロック＝無条件で配置不可。
  if (cost <= 0) return { allowed: false, state, paidColorless: 0 };
  if (state.energy.length < cost) return { allowed: false, state, paidColorless: 0 };
  const paid = state.energy.slice(-cost);
  return {
    allowed: true,
    state: { ...state, energy: state.energy.slice(0, -cost), trash: [...state.trash, ...paid] },
    paidColorless: cost,
  };
}

/** UI（ゾーン選択モーダル）とCPU用：盤面を変えずに「配置できるか」だけを見る。 */
export function canPlaceInSigniZone(state: PlayerState, zoneIndex: number): boolean {
  return resolveSigniZonePlacement(state, zoneIndex).allowed;
}

/**
 * 次の自分のターン用の予約を、そのターンのブロックへちょうど1回だけ移す。
 * 予約が無い場合は「このターン分」も同時に失効する（原文はいずれも
 * 「ターン終了時まで」か「（このターンと）次のターンの間」で、次の自分ターンをまたぐものは無い）。
 * activateNextTurnDeployCountLimit と同じく turnActuallyStarts=false（追加ターン）では何もしない。
 */
export function activateNextTurnSigniZoneBlocks(
  state: PlayerState,
  turnActuallyStarts = true,
): PlayerState {
  if (!turnActuallyStarts) return state;
  return {
    ...state,
    signi_zone_blocks: state.signi_zone_blocks_next_turn,
    signi_zone_blocks_next_turn: undefined,
    // LOCK_OPP_TRASH_MOVE（タスク12(lxxiii)）も「次の自分ターンへの予約→昇格→そのターン終了で失効」で
    // 期間が完全に同型なので同じ関数で運ぶ（呼び出しサイト4箇所を二重に持たない）。
    // 実際に効くフェイズ（メイン／アタック）の絞り込みは engine 側の `isOwnTrashMoveLocked` が見る。
    lock_trash_move_this_turn: state.lock_trash_move_next_turn,
    lock_trash_move_next_turn: undefined,
  };
}
