import type { PlayerState } from '../../types';

// アップフェイズ（§5.6 `C-9` ルール規則の棚卸し・2026-09-17）。
//
// 🔑**公式ルール**（English Rule Guide -Glossary- ver.1.0.0「Up phase」「Freeze」／[用語集 word_006](https://www.takaratomy.co.jp/products/wixoss/library/rule/word_006/)）＝
//   「ターン最初のフェイズで、あなたの全てのシグニとルリグをアップします。**ターンプレイヤーの**シグニやルリグが凍結状態だった場合、
//    それらはアップフェイズにアップしません。…アップフェイズの終了時に凍結状態ではなくなります。」
//
//   ⇒ **アップを受けるのは「これからターンを行うプレイヤー」だけ**。凍結は**そのプレイヤーのアップフェイズ**まで残る。
//
// 🔴**なぜ純関数に切り出したか**＝この規則は `BattleScreen.tsx` の**ターン終了3経路**（人間の通常終了／手札上限の捨て札経由／CPU）と
//   `applyForcedTurnEnd` の**計4箇所に同じ形で写経**されており、3経路とも**「相手をアップする」と焼き込んで**いた。
//   追加ターン（`extra_turn`）／相手のターンスキップ（`skip_next_turn`）で**ターンプレイヤーが交代しない**とき、
//   **次にターンを行うのは自分なのに、相手がアップされ自分はダウンしたまま**だった
//   （＝追加ターンで**アタックしたシグニが起き上がらずアタックできない**／相手の凍結が相手のアップフェイズより前に解ける）。
//   ⇒ **「誰をアップするか」と「どうアップするか」をここだけに置き、golden で固定する。**

type Field = PlayerState['field'];

/**
 * アップフェイズの盤面処理＝**凍結していないダウン状態のシグニ・ルリグをアップし、凍結をすべて解く**。
 *
 * @param keepCenterLrigDown センタールリグをアップしない（カード効果のアップ条件＝`lrig_upkeep_condition` が未払い）。
 *   ⚠これは**カード効果**であってルールではない＝呼び出し側が決める。
 */
export function applyUpPhaseToField(field: Field, keepCenterLrigDown = false): Field {
  const down = field.signi_down ?? [false, false, false];
  const frozen = field.signi_frozen ?? [false, false, false];
  return {
    ...field,
    // 凍結中のダウンはそのまま（アップしない）・それ以外はアップ。
    signi_down: down.map((d, i) => d && (frozen[i] ?? false)),
    signi_frozen: [false, false, false],
    lrig_down: ((field.lrig_down ?? false) && (field.lrig_frozen ?? false)) || keepCenterLrigDown,
    lrig_frozen: false,
    assist_lrig_l_down: (field.assist_lrig_l_down ?? false) && (field.assist_lrig_l_frozen ?? false),
    assist_lrig_r_down: (field.assist_lrig_r_down ?? false) && (field.assist_lrig_r_frozen ?? false),
    assist_lrig_l_frozen: false,
    assist_lrig_r_frozen: false,
  };
}

/**
 * ターン終了時に**どちらのプレイヤーがアップフェイズを迎えるか**。
 *
 * @param keepTurn `resolveTurnHandover(...).keepTurn`（true＝ターンプレイヤーが交代しない）。
 * @returns `'turnEnder'`＝いまターンを終えた側がもう一度ターンを行う（追加ターン／相手のスキップ）／`'opponent'`＝通常の交代。
 */
export function upPhaseRecipient(keepTurn: boolean): 'turnEnder' | 'opponent' {
  return keepTurn ? 'turnEnder' : 'opponent';
}
