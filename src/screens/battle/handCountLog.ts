/**
 * **手札の枚数が変わったときのログ**（2026-09-23 ユーザー要望
 * ＝「手札の枚数が変わるとき、1枚ドロー（2枚→3枚）のようなログだとわかりやすい」）。
 *
 * 🔑**なぜ「増減の監視」で書くのか**＝手札が動く経路は engine だけで数十箇所ある
 *   （`〇枚ドロー` の addLog は9箇所・捨てる/加える/戻すを含めるとさらに多い）。
 *   **1箇所ずつ枚数を書き足すと、書き忘れた経路が静かに残る**（しかも書き忘れは計器に映らない）。
 *   ⇒ **盤面の手札枚数そのものを見て差分を書く**＝経路を1つも取りこぼさない。
 *
 * 🔴**書くのはホスト側のクライアントだけ**（呼び出し側の規約）＝`game_logs` は部屋で1本なので、
 *   両者が書くと**同じ行が2回出る**。先行例＝`BattleScreen` の ON_ENERGY_CHARGE ウォッチャー
 *   （「二重 push を避けるため push はホスト側クライアントのみ」）。
 * ⚠**視点はホストの一人称で書く**＝相手の画面では `logPerspective.ts` が「あなた」↔「相手」を入れ替える。
 */
export interface HandCounts {
  /** 書き手（＝ホスト）自身の手札枚数。 */
  self: number;
  /** 相手（＝ゲスト）の手札枚数。 */
  opp: number;
}

/** `prev` から `cur` への手札増減を説明する行（変化がなければ空）。 */
export function handCountLogLines(prev: HandCounts, cur: HandCounts): string[] {
  const lines: string[] = [];
  const line = (who: string, from: number, to: number) => {
    const d = to - from;
    if (d === 0) return;
    lines.push(`${who}の手札 ${d > 0 ? '+' : '-'}${Math.abs(d)}枚（${from}枚→${to}枚）`);
  };
  line('あなた', prev.self, cur.self);
  line('相手', prev.opp, cur.opp);
  return lines;
}
