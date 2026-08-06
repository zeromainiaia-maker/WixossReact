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
  const pay = (stack: string[] | undefined, down: boolean | undefined, markDown: () => void) => {
    const top = stack?.at(-1);
    if (remaining <= 0 || !top || down || !levelOk(stack)) return;
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
  return { state: { ...state, field }, paidCards };
}

/** コスト表示用ラベル（「アップ状態のレベル2のルリグ2体をダウン」）。モーダル間で共有する。 */
export function fmtLrigDownCostLabel(cost: NonNullable<EffectCost['lrigDown']>): string {
  const scope = cost.centerOnly ? 'センタールリグ' : cost.level !== undefined ? `レベル${cost.level}のルリグ` : 'ルリグ';
  return `アップ状態の${scope}${cost.count}体をダウン`;
}
