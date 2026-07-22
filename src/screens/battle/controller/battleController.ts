// Stage3 骨組み②：純粋バトルコントローラ（reduceBattle）。
//
// 目的＝BattleScreen.tsx の各ハンドラにインラインされた「現在の bs から次に DB へ書く
// update（Partial<BattleStateRow>）を組み立てる計算」を、React/supabase から切り離した
// 純粋関数へ寄せていくための seam。
//
//   handler(React) → BattleAction を組む → reduceBattle(bs, action): Partial<BattleStateRow>
//                  → useBattlePersist().commit(patch) → supabase → realtime → setBs
//
// ⚠これは骨組み。まず「単一フィールド更新」の代表的な遷移だけを純粋化し、パターンを実証する。
//   複雑な遷移（トリガー収集・スタック整列を伴うもの）は engine 側が既に純粋（triggerCollect /
//   boardDiff / effectStack）なので、ハンドラ内のパッチ組み立て部分を1ケースずつ本 reducer へ
//   移すことで段階的に純粋化できる。移行レシピは docs/BATTLE_CONTROLLER.md。
import type { BattleStateRow } from '../../../types';

/**
 * バトル遷移アクション（discriminated union）。
 * 現状は単一フィールド更新の代表3種のみ。ハンドラを純粋化するたびにここへ追加していく。
 */
export type BattleAction =
  /** セットアップフェイズを進める（例：じゃんけん確定後 → MULLIGAN）。 */
  | { type: 'SET_SETUP_PHASE'; phase: BattleStateRow['setup_phase'] }
  /** ターンフェイズを進める（ENERGY / MAIN / ATTACK_* / END 等）。 */
  | { type: 'SET_TURN_PHASE'; phase: BattleStateRow['turn_phase'] }
  /** 決着確認（終了ダイアログ）を了承する。 */
  | { type: 'ACK_END'; isHost: boolean }
  /** じゃんけんの手を提出する。 */
  | { type: 'SUBMIT_JANKEN'; isHost: boolean; pick: string };

/**
 * 純粋遷移：現在の盤面とアクションから、DB へ書き込むパッチ（Partial<BattleStateRow>）を返す。
 * 副作用なし・同入力同出力。永続化は呼び出し側（useBattlePersist）が担う。
 */
export function reduceBattle(_bs: BattleStateRow, action: BattleAction): Partial<BattleStateRow> {
  // _bs は「純粋遷移は現在盤面から次パッチを計算する」契約を表す引数。代表3ケースは単一
  // フィールド更新で盤面参照が不要なため未使用（`_` 接頭辞）。盤面依存の遷移を移すときに参照する。
  switch (action.type) {
    case 'SET_SETUP_PHASE':
      return { setup_phase: action.phase };
    case 'SET_TURN_PHASE':
      return { turn_phase: action.phase };
    case 'ACK_END':
      return action.isHost ? { host_end_ack: true } : { guest_end_ack: true };
    case 'SUBMIT_JANKEN':
      return action.isHost ? { host_janken: action.pick } : { guest_janken: action.pick };
    default: {
      // 網羅性チェック：新しい action を足したら必ず case を追加させる。
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
