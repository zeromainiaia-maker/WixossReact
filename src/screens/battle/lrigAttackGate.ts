import type { PlayerState } from '../../types';

/**
 * センタールリグが**いまアタックできるか**（ルール由来の軸だけ）を1か所で判定する純関数
 * （§5.3 `O-366`・2026-09-14）。
 *
 * 🔴**かつてここは `lrig_has_attacked`（真偽値）を「このターンもうアタックした」門として読んでいた。**
 * WIXOSS の規則ではアタックできるのは**アップ状態**のカードであって、「1ターンに1回」という
 * 独立した制限は無い＝**アタックしてダウンしたルリグを効果でアップすれば再アタックできる**。
 * 真偽値の門はその再アタックを**明示的に禁止**しており、
 * 「【自】：このルリグがアタックしたとき、〜このルリグをアップする」系の **live 20効果**が
 * **アップは起きるが2回目のアタックができない真 no-op** になっていた
 * （`WX01-028-E1` / `WX19-014-E1` / `WX19-021-E2` / `WX19-031-E1` / `WX24-D1-05-E1` /
 *  `WX24-P1-011-E1` / `WX24-P4-011-E2` / `WX26-CP1-046-E1` / `WXDi-D08-004-E1` /
 *  `WXDi-D09-H07-E1` / `WXDi-P00-026-E1` / `WXDi-P03-035-E1` / `WXDi-P04-051-E1` /
 *  `WXDi-P12-044-E2` / `WXDi-CP01-028-E1` / `WXK11-052-E1` / `PR-204-E1` / `PR-238-E1` /
 *  `PR-461-E2` / `WD21-009-E1` ほか）。
 *
 * 🔴しかも**門は2箇所にあって片方にしか無かった**＝アクション一覧（アタックボタンの生成）は
 * ダウン状態しか見ていなかったので、**ボタンは出るのに押しても何も起きない**（§6.4 `O-18`）。
 * ⇒ 判定をこの関数1本へ寄せ、真偽値の門は落とした。
 *
 * ⚠**`lrig_has_attacked` 自体は残す**＝`LRIG_ATTACKED_THIS_TURN` 等の**条件**が読んでいる
 * （「このターンにあなたのルリグがアタックしていた場合」）＝アタック可否の門とは別の軸。
 *
 * ⚠**「処理中」「ガード応答待ち」「ドライブ中」「コストが払えない」等は入れない**＝
 * 呼び出し元の責務（`signiAttackGate.ts` と同じ規律）。ここはダウン状態と付与された上限だけを見る。
 *
 * ⚠**アシスト枠は対象外**＝センター専用（アシストは `assistLrigAttackableSlots` が別に見る）。
 */
export type CenterLrigAttackBlockReason =
  | 'ALREADY_DOWN'  // ダウンしている（＝アタック済みでまだアップされていない）
  | 'ATTACK_LIMIT'; // 付与された「1ターンにアタックできる上限」に達した（§5.3 `O-236`）

export function centerLrigAttackBlock(my: PlayerState): CenterLrigAttackBlockReason | null {
  // 🆕**§5.3 `O-236`＝「1ターンにこのルリグがアタックできる上限は N になる」**。
  //   ⚠上限が未設定のターンは**回数を数えていない**（`lrig_attack_count_this_turn` を書かない）ので
  //     ここで参照してはいけない＝上限が在るときだけカウント比較する。
  const limit = my.lrig_attack_limit_this_turn;
  if (limit !== undefined && (my.lrig_attack_count_this_turn ?? 0) >= limit) return 'ATTACK_LIMIT';
  // 🆕**「ダウン状態でもアタックできる」**（`O-236`）＝ルリグ側の軸。
  //   ⚠シグニ用の `ATTACK_WHILE_DOWN` とは**別軸**（あちらは `signiAttackGate.ts`）。
  //   ⚠このフラグは `LRIG_ATTACK_LIMIT{whileDown}` からしか立たない＝**必ず上限とセット**なので、
  //     上のカウント比較が止め役になる（ダウン中に無限にアタックできる状態は作れない）。
  if (my.field.lrig_down && !my.lrig_attack_while_down_this_turn) return 'ALREADY_DOWN';
  return null;
}
