/**
 * 対戦ログの**視点の入れ替え**（バグ報告 `1f6f080a`＝「アーツ使用時のログが相手も『自分』表記になっている」）。
 *
 * 🔴**なぜ要るか**＝`game_logs` は部屋で1本＝**書いた人の視点の文字列がそのまま相手の画面にも出る**。
 *   画面はこれまで **「あなた」↔「相手」だけ**を入れ替えていたが、ログの語彙は**2系統**ある：
 *     ① `[あなた] メインフェイズ`（`BattleScreen` のフェイズ行）
 *     ② `[自分] 〇〇 の【起】効果`（`stackResolve.ts` / `cutinPass.ts` / `performCutinUse.ts`）
 *        ＋ engine 本文の `自分のエナを3枚に調整` 等（`effectExecutor.ts` に4箇所）
 *   ②の「自分」は**入れ替え表に載っていなかった**ので、相手が撃ったアーツが相手の画面で「自分」のまま出ていた。
 *
 * 🔑**1回の走査で置換する**＝`replace` を3回重ねると入れ替えたものをもう一度入れ替えてしまう
 *   （旧実装が `\x00` の番兵を挟んでいたのはそのため）。**交替の正規表現1本**なら番兵が要らない。
 * ⚠**長い語から並べる**＝`対戦相手` を `相手` より先に置かないと「対戦あなた」になる。
 */
const FLIP: Record<string, string> = {
  対戦相手: 'あなた',
  あなた: '相手',
  自分: '相手',
  相手: 'あなた',
};

/** 書き手以外が読むときのログ本文（一人称と二人称を入れ替える）。 */
export function flipLogPerspective(text: string): string {
  return text.replace(/対戦相手|あなた|自分|相手/g, (m) => FLIP[m] ?? m);
}

/** そのログ行を `viewerId` の視点で読むときの本文（書き手本人ならそのまま）。 */
export function logTextFor(log: { user_id: string; action: string }, viewerId: string): string {
  return log.user_id === viewerId ? log.action : flipLogPerspective(log.action);
}
