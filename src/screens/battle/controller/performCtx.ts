import type { TrigCtx } from '../../../engine/triggerCollect';
import type { BattleStateRow, CardData } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import type { BattleIo } from './battleIo';
import type { BoardDiffCollector } from './boardDiffTriggers';

/**
 * 🆕**実行関数（`perform*`）の共通の材料**（§5.7 `S-5c` 第2段・2026-09-18）。
 *
 * ■ 使い方＝`perform*` は `(…固有の引数, ctx: PerformCtx)` の形に揃える。画面は `performCtx()` を1本作って渡し、
 *   ヘッドレス（`S-5`）は同じ形を**データと `createHeadlessIo` から**組み立てる。
 * ⚠**増やすほど画面から出しにくくなる**＝新しいキーを足す前に「それは実行関数の仕事か」を疑う。
 *   React の state・ref・モーダルの開閉はここに入れない（呼び出し側の責務）。
 */
export interface PerformCtx {
  /** いまの盤面（`reduceBattle` の第1引数＝**書き込み前**の行）。 */
  bs: BattleStateRow;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  /** 全カード（`listUsableArts` など「カード一覧」を要る関数のため）。 */
  cards: CardData[];
  /** この client のプレイヤーID。 */
  userId: string;
  /** この client が host 側か。 */
  isHost: boolean;
  /** 場の実効パワー（`calcFieldPowers` の結果）。 */
  effectivePowers: Map<string, number>;
  trigCtx: () => TrigCtx;
  /** 盤面差分トリガーの収集（`makeBoardDiffCollector` の出力）。 */
  collectBoardDiff: BoardDiffCollector;
  io: BattleIo;
}
