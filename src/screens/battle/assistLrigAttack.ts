import type { CardData, PlayerState } from '../../types';

/** アタック元のルリグ枠。センターと左右アシストの3つ。 */
export type LrigAttackSlot = 'center' | 'assist_l' | 'assist_r';

/**
 * アシストルリグのアタック可否（`ASSIST_LRIG_ATTACK_THIS_TURN`）を**1か所で**判定する純関数。
 *
 * 通常ルールではアシストルリグはアタックできない。`WX25-P1-048`（ピース）の
 * 「このターン、あなたはレベル１以上のアシストルリグでアタックできる」だけが例外を作る
 * （§6.4 A群＝engine に消費地点が無く**恒久 no-op** だった。続き427 で実装）。
 *
 * ⚠**必ず3経路（人間のアタックボタン生成 / CPU のアタック / フェイズ進行の確認ダイアログ）から
 *   同じ関数を呼ぶこと**。`signiAttackGate.ts` と同じ理由＝軸がずれると
 *   「人間には出ないが CPU は撃てる」「アタックできるのにフェイズを進めてしまう」が必ず出る。
 *
 * ⚠**「アタックしなければならない」ではない**（原文は「アタックできる」）＝強制ではないので
 *   `mustAttackRemainingZones` の側には入れない。フェイズ進行は確認ダイアログ止まりでよい。
 */
export function assistLrigAttackableSlots(
  state: PlayerState,
  cardMap: Map<string, CardData>,
): LrigAttackSlot[] {
  const minLevel = state.assist_lrig_attack_min_level;
  if (minLevel === undefined) return [];
  const out: LrigAttackSlot[] = [];
  const check = (slot: 'assist_l' | 'assist_r', stack: string[] | undefined, isDown: boolean, isFrozen: boolean) => {
    const top = stack?.at(-1);
    if (!top) return;
    if (isDown || isFrozen) return;                     // アタック済み／凍結中は不可
    // ⚠レベルは**カード表記**で見る（アシストルリグに LEVEL_MODIFY を載せる語彙は現状無い）。
    const level = parseInt(cardMap.get(baseNum(top))?.Level ?? '', 10);
    if (!Number.isFinite(level) || level < minLevel) return;
    out.push(slot);
  };
  check('assist_l', state.field.assist_lrig_l, state.field.assist_lrig_l_down ?? false, state.field.assist_lrig_l_frozen ?? false);
  check('assist_r', state.field.assist_lrig_r, state.field.assist_lrig_r_down ?? false, state.field.assist_lrig_r_frozen ?? false);
  return out;
}

/** インスタンスID（`WX25-P1-048#3`）から CardNum を取り出す。 */
function baseNum(id: string): string {
  const h = id.indexOf('#');
  return h > 0 ? id.slice(0, h) : id;
}

/** 指定枠のグロウスタック頂点。 */
export function lrigSlotTop(state: PlayerState, slot: LrigAttackSlot): string | undefined {
  return slot === 'center' ? state.field.lrig.at(-1)
    : slot === 'assist_l' ? state.field.assist_lrig_l?.at(-1)
    : state.field.assist_lrig_r?.at(-1);
}

/** 指定枠をダウン（＝アタック済み）にした field を返す。 */
export function markLrigSlotDown(state: PlayerState, slot: LrigAttackSlot): PlayerState['field'] {
  return slot === 'center' ? { ...state.field, lrig_down: true }
    : slot === 'assist_l' ? { ...state.field, assist_lrig_l_down: true }
    : { ...state.field, assist_lrig_r_down: true };
}
