import type { CardData, PlayerState } from '../../types';
import type { EffectCost } from '../../types/effects';

export interface LrigDownCostPayment {
  state: PlayerState;
  paidCards: string[];
  /** ダウンしたルリグの表記レベル合計（可変枚数コストの「レベルの合計１につき」用。非数値は0扱い）。 */
  levelSum: number;
}

/**
 * アップ状態の自分ルリグを、通常召喚UIの正規順（センター→アシストL→R）でダウンする。
 * level / centerOnly を満たす候補が count 未満なら、盤面を変えず null を返す。
 */
export function payLrigDownCost(
  state: PlayerState,
  cost: NonNullable<EffectCost['lrigDown']>,
  cardMap: Map<string, CardData>,
): LrigDownCostPayment | null {
  // ⚠ `execUtils.getCardNum` と同じ実装をここに写している。このモジュールは execUtils から
  //   import されるため、逆向きに import すると循環参照になる。**共通化しないこと**（本体を変えるなら両方直す）。
  const getCardNum = (id: string) => {
    const hash = id.indexOf('#');
    return hash > 0 ? id.slice(0, hash) : id;
  };
  let remaining = cost.count;
  const field = { ...state.field };
  const paidCards: string[] = [];
  const levelOk = (stack?: string[]) => cost.level === undefined
    || Number(cardMap.get(getCardNum(stack?.at(-1) ?? ''))?.Level) === cost.level;
  // 🆕**色限定**（2026-09-05・§5.3 `O-257`＝【ハーモニー】「〈色〉のルリグN体をダウン」）。
  // ⚠**`includes` で見る**＝多色ルリグの `Color` は `白青` のように連結されるので完全一致だと外れる。
  const colorOk = (stack?: string[]) => cost.color === undefined
    || (cardMap.get(getCardNum(stack?.at(-1) ?? ''))?.Color ?? '').includes(cost.color);
  const pay = (stack: string[] | undefined, down: boolean | undefined, markDown: () => void) => {
    const top = stack?.at(-1);
    if (remaining <= 0 || !top || down || !levelOk(stack) || !colorOk(stack)) return;
    markDown();
    paidCards.push(top);
    remaining--;
  };

  pay(field.lrig, field.lrig_down, () => { field.lrig_down = true; });
  if (!cost.centerOnly) {
    pay(field.assist_lrig_l, field.assist_lrig_l_down, () => { field.assist_lrig_l_down = true; });
    pay(field.assist_lrig_r, field.assist_lrig_r_down, () => { field.assist_lrig_r_down = true; });
  }
  if (remaining > 0) return null;
  // 「この方法でダウンしたルリグ」の参照先を**支払いの単一入口**で記録する（タスク12(cix)）。
  // ⚠ 呼び出し側（engine の INTERNAL_PAY_LRIG_DOWN* / BattleScreen の各コスト支払い）で個別に書くと必ず
  //   書き忘れが出る＝実UIだけ参照不能になり、フィルタが空ヒット（＝完全 no-op）へ倒れる。
  const levelSum = paidCards.reduce((sum, id) => {
    const lv = Number(cardMap.get(getCardNum(id))?.Level);
    return sum + (Number.isFinite(lv) ? lv : 0);
  }, 0);
  return {
    state: { ...state, field, last_lrig_down_cards: paidCards, last_lrig_down_level_sum: levelSum },
    paidCards,
    levelSum,
  };
}

/**
 * 🔴ルリグの【起】《ダウン》（`cost.down_self`）＝**その能力を使ったルリグ自身**をダウンする（タスク12(cxxxi)）。
 * ⚠シグニ用の `down_self` 実装（`executeSigniActivated` / `canAffordOptionalCostSpec`）は
 *   **`field.signi` しか探さない**ので、ルリグの【起】では `findIndex` が常に -1 ＝**誰もダウンせず
 *   実質無コスト**だった（live 27効果。`usageLimit` を持たない効果は同一ターンに何度でも撃てた）。
 * ⚠`lrigDown`（別カードのコスト語彙）とは別物＝あちらは「アップ状態のルリグN体」を任意に選ぶ。
 *   こちらは**自分自身**なので候補選択が無く、既にダウンしていれば払えない（`null`＝盤面を変えない）。
 * ⚠`last_lrig_down_cards` は**記録しない**＝シグニ側の `down_self` と同じ規約（「この方法でダウンした
 *   ルリグ」を参照するカードは `lrigDown` 語彙の側にしかいない。記録すると過剰実行の種になる）。
 */
export function payLrigDownSelfCost(state: PlayerState): PlayerState | null {
  if (state.field.lrig.length === 0) return null;
  if (state.field.lrig_down) return null;
  return { ...state, field: { ...state.field, lrig_down: true } };
}

/** コスト表示用ラベル（「アップ状態のレベル2のルリグ2体をダウン」）。モーダル間で共有する。 */
export function fmtLrigDownCostLabel(cost: NonNullable<EffectCost['lrigDown']>): string {
  const scope = cost.centerOnly ? 'センタールリグ' : cost.level !== undefined ? `レベル${cost.level}のルリグ` : 'ルリグ';
  return `アップ状態の${scope}${cost.count}体をダウン`;
}
