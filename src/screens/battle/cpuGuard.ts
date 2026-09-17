import type { CardData } from '../../types';
import { getCardNum } from '../../engine/execUtils';

/**
 * CPU が**ルリグのアタックをガードするか／何で受けるか**（§5.6 `C-2`・2026-09-17）。
 *
 * ■ 規律（§5.6.3＝`cpu*.ts` の既存5本と同じ）
 *   - **可否は書かない**＝候補は `guardableHandIndices`（`guard.ts`・人間のダイアログと同じ関数）が出したものだけ。
 *   - **実行も書かない**＝決めた添字で `performGuardResponse`（人間と同じ関数）を呼ぶ。
 *   - ここは「通った候補から1つ選ぶ／選ばない」だけ。
 *
 * ■ なぜ要るか
 *   - 旧実装は **CPU が絶対にガードしない**（`[CPU] ガードしない` 固定）＝**ルリグアタックが毎回素通り**して試合が 8ターンで終わり、
 *     **CPU がガードする経路（`ON_GUARD` トリガー・ガード追加コスト・「ガードされたとき」）が一度も踏まれていなかった**。
 *
 * ■ 方針（決定論）
 *   1. 候補が無ければガードしない。
 *   2. 🆕**候補があれば毎回ガードする**（2026-09-17 ユーザー決定「持っていれば毎回使う」）。
 *      旧＝ガード札が1枚だけならライフ2枚以下まで温存していた＝「ガードを持っているのに使わない」と見えていた（ユーザー指摘）。
 *   3. 使う札は**レベルが低い順**→手札の先頭から（高レベルのシグニは場に出す価値が高い）。
 */
export interface CpuGuardInput {
  /** `guardableHandIndices` の結果（CPU の手札の添字）。 */
  candidates: number[];
  /** CPU の手札（添字の解決用）。 */
  hand: string[];
  cardMap: Map<string, CardData>;
  /** CPU のライフクロスの枚数（アタックを受ける前）。 */
  lifeCount: number;
  /** このアタックで割られる枚数（【ダブルクラッシュ】=2／【トリプルクラッシュ】=3／通常=1）。 */
  incomingCrushCount: number;
}

export function pickCpuGuardHandIndex(p: CpuGuardInput): number | null {
  if (p.candidates.length === 0) return null;
  const levelOf = (i: number): number => {
    const lv = parseInt(p.cardMap.get(getCardNum(p.hand[i] ?? ''))?.Level ?? '');
    return Number.isFinite(lv) ? lv : -1;
  };
  return [...p.candidates].sort((a, b) => levelOf(a) - levelOf(b) || a - b)[0];
}
