/**
 * 🆕**CPU観戦のログ表記**（2026-09-22・バグ報告 `c8b44086`）＝ログの行頭を **`[A]`／`[B]`**（観戦画面の下／上）へ書き換える。
 *
 * ■ なぜ要るか＝ヘッドレス対戦のログは
 *   ① CPU の行動が**両席とも `[CPU]`**（どちらの CPU か書いていない）
 *   ② 効果の行が **host 席（＝A）から見た `[自分]`／`[相手]`**
 *   で出るので、観戦している人には**誰の行動か読めない**。実際に「A が B のビグタットをバニッシュした」手が
 *   「B が自分のシグニをバニッシュした」と読まれた（B の手番中に `[CPU] アーツを使用` と出たため）。
 * ⚠`[CPU]` の席は**呼び出し側が知っている**（`HeadlessMatch.lastActor()`）＝ここでは推測しない（`null` ならそのまま残す）。
 * ⚠**行頭だけ**書き換える（本文中のカード名などに触れない）。
 */
export function spectateLogLabel(line: string, cpuSeat: 'host' | 'guest' | null): string {
  if (line.startsWith('[自分]')) return `[A]${line.slice('[自分]'.length)}`;
  if (line.startsWith('[相手]')) return `[B]${line.slice('[相手]'.length)}`;
  if (line.startsWith('[CPU]') && cpuSeat) return `${cpuSeat === 'host' ? '[A]' : '[B]'}${line.slice('[CPU]'.length)}`;
  return line;
}
