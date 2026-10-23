/**
 * **本体から絵柄違い（`_Variants.csv`）へ移したカード番号**（2026-10-23 ユーザー要望）。
 *
 * 🔑同じカードが表記ゆれで別名になり、本体が2枚に割れていたものを1枚へまとめた。移した番号はもう本体に無いので、
 *   その番号を入れて保存されたデッキは**読み込むときに本体の番号へ付け替え、元の番号は絵柄の指定として残す**。
 *   ⚠DB の行は書き換えない（他のユーザーの行には書けない）＝読むたびに付け替える。
 * - `WXDi-D03-020`《サーバント　＃》→ `WXDi-D01-020`《サーバント　#》（全角11枚・半角79枚＝多いほうの半角へ統一）
 * - ほか17組（全角・半角／空白／＝と=／ⅢとIII の違いだけで本体が2枚）＝本文・効果が完全一致することを確かめてから、
 *   先に収録された本体へまとめた。表記は**本体と絵柄違いを合わせて多いほう**、同数なら**同じシリーズの多いほう**
 *   （タウィル・ウムルは「＝」／あーやは「Ⅲ」「Ⅱ」／羅原は全角英字／英の札は「＃」／名前の区切りは全角空白）。
 */
export const MERGED_CARD_NUMS: Readonly<Record<string, string>> = {
  'WXDi-D03-020': 'WXDi-D01-020',
  'SP12-013': 'WX06-010',       // 永らえし者　タウィル＝ノル
  'PR-186': 'WX09-007',         // 導きし者　タウィル＝フィーラ
  'PR-187': 'WX09-009',         // 虚心の鍵主　ウムル＝フィーラ
  'WD23-009-A': 'WX16-013',     // とってもあーや！Ⅲ
  'WD23-010-A': 'WX16-014',     // きらめきあーや！Ⅱ
  'PR-247': 'WX17-Re03',        // コードアート　B・B・Q
  'SP12-006': 'PR-202',         // エルドラ×マーク０
  'SPK16-8C': 'PR-465',         // 時英の埋設　＃タイプス＃
  'SPK03-21': 'WXK09-022',      // コード・ピルルク　GND
  'WDK-F01-02': 'WDA-F02-02',   // アロス・ピルルク　ＴＲＩ
  'WDK-F01-04': 'WDA-F02-04',   // アロス・ピルルク　ＭＯＮＯ
  'WDK-F01-03': 'WDK02-003',    // アロス・ピルルク　ＤＩ
  'WXDi-D09-P27': 'WXDi-D05-021', // RANDOM　BAD
  'WX25-P2-118': 'WXDi-P09-048',  // コードハート　ピルルクAPEX//メモリア
  'SPDi01-121': 'WX25-P1-115',    // 羅原　Ｄｙ
  'WX25-CD1-06': 'WX25-CP1-030',  // 出張！百夜堂　海の家FC計画
  'SPDi37-06': 'WX24-D3-25',      // TOO　BADLY
};

type DeckLike = {
  main_deck?: string[] | null;
  lrig_deck?: string[] | null;
  thumbnail_card_num?: string | null;
  center_lrig?: string | null;
  assist_lrig_l?: string | null;
  assist_lrig_r?: string | null;
  art_overrides?: Record<string, string> | null;
  cpu_plan?: unknown;
};

const remap = (n: string) => {
  const [num, ...rest] = String(n).split('#');
  const to = MERGED_CARD_NUMS[num];
  return to ? [to, ...rest].join('#') : n;
};

const remapDeep = (v: unknown): unknown =>
  typeof v === 'string' ? remap(v)
    : Array.isArray(v) ? v.map(remapDeep)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remapDeep(x)]))
        : v;

/** デッキの行に残っている移した番号を本体の番号へ付け替える（移した番号は `art_overrides` に絵柄として残す）。 */
export function migrateMergedCardNums<T extends DeckLike>(row: T): T {
  const used = [...(row.main_deck ?? []), ...(row.lrig_deck ?? [])].map(n => String(n).split('#')[0]);
  const hits = Object.keys(MERGED_CARD_NUMS).filter(n => used.includes(n) || row.thumbnail_card_num === n);
  if (hits.length === 0) return row;
  const art = { ...(row.art_overrides ?? {}) };
  for (const from of hits) art[MERGED_CARD_NUMS[from]] ??= from;
  return {
    ...row,
    main_deck: row.main_deck?.map(remap) ?? row.main_deck,
    lrig_deck: row.lrig_deck?.map(remap) ?? row.lrig_deck,
    thumbnail_card_num: row.thumbnail_card_num ? remap(row.thumbnail_card_num) : row.thumbnail_card_num,
    center_lrig: row.center_lrig ? remap(row.center_lrig) : row.center_lrig,
    assist_lrig_l: row.assist_lrig_l ? remap(row.assist_lrig_l) : row.assist_lrig_l,
    assist_lrig_r: row.assist_lrig_r ? remap(row.assist_lrig_r) : row.assist_lrig_r,
    art_overrides: art,
    cpu_plan: row.cpu_plan === undefined ? row.cpu_plan : remapDeep(row.cpu_plan),
  };
}
