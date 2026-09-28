/**
 * 「以下の３つから１つを選ぶ」の選択肢ラベルを原文の①②③の文で出す（2026-09-28 バグ報告 7e71c7d1）。
 *
 * 🔴live の `CHOOSE` の選択肢は **562カード／1,310肢が `選択肢1`〜の汎用ラベル**のまま＝画面には
 *   「選択肢1／選択肢2／選択肢3」としか出ず、どれが何の効果か分からなかった（`WX20-078` エンザ）。
 * 🔑カード原文の丸数字の区切りから k 番目の文を引く。**①〜の並びが原文に1組だけのとき**に限る
 *   （複数の能力がそれぞれ①②③を持つカードは、どの組か決められないので汎用ラベルのまま）。
 *   ⚠**肢の数＝丸数字の数**のときだけ当てる＝`WX20-078` ①の中の「エナゾーンに置くかカードを１枚引く」の2択は
 *   同じ `選択肢1/2` のラベルを持つが、①②の文ではない。
 * ⚠React 非依存の純関数＝golden から import して検査する。
 */
const CIRCLED = '①②③④⑤⑥⑦⑧⑨';

export function choiceLabelFromText(label: string, effectText: string | undefined, optionCount: number): string {
  const m = /^選択肢(\d)$/.exec(label);
  if (!m || !effectText) return label;
  const k = Number(m[1]);
  if (k < 1 || k > CIRCLED.length) return label;
  // ①の出現が1回だけ（＝①②③の組が1つだけ）のときに限る
  const firstPos = effectText.indexOf('①');
  if (firstPos < 0 || effectText.indexOf('①', firstPos + 1) >= 0) return label;
  // 肢の数が丸数字の数と一致するときだけ（入れ子の「AかBを選ぶ」の2択を①②へ誤って当てない）
  const marks = [...CIRCLED].filter(c => effectText.includes(c)).length;
  if (marks !== optionCount) return label;
  const start = effectText.indexOf(CIRCLED[k - 1], firstPos);
  if (start < 0) return label;
  let end = effectText.length;
  const next = effectText.indexOf(CIRCLED[k] ?? '\u0000', start + 1);
  if (next >= 0) end = next;
  // 最後の肢は次の能力（【…】）の手前まで
  //   ⚠`【ウィルス】` のような語も【】で書かれる＝能力の見出し（【自】【起】【常】【出】…）だけで切る
  const rest = effectText.slice(start + 1);
  const nextAbility = rest.search(/【(自|起|常|出|絆[^】]*|ライフバースト|チーム[^】]*|ソウル|トラップ)】/);
  if (next < 0 && nextAbility >= 0) end = start + 1 + nextAbility;
  const body = effectText.slice(start, end).trim();
  return body.length > 1 ? body : label;
}
