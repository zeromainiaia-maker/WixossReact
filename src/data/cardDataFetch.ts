/**
 * カードデータ CSV の取得（ブラウザ）。2026-10-01 にシート別 12 ファイル → パック別（`public/data/CardDatas/`）へ再編。
 *
 * 🔑**並び順の正本は `CardDatas/index.json`**＝先に取り、載っている CSV を並び順どおりに並列で取る
 *   （`scripts/cardDataFiles.mjs` と同じ規約。Node 側の道具はそちらを使う）。
 * ⚠**パックの CSV を足したら index.json にも載せる**（`node scripts/cardDataIndex.mjs`）＝載っていない CSV は読まれない。
 */
export interface CardDataIndex {
  packs: { pack: string; file: string; legacySheet: number | null }[];
  tokens: string;
  variants: string;
}

export interface CardCsvTexts {
  /** パック CSV の本文（index の並び順）。取れなかったものは null。 */
  packs: (string | null)[];
  tokens: string | null;
  variants: string | null;
}

const BASE = '/data/CardDatas';
const getText = (file: string) => fetch(`${BASE}/${file}`).then(r => (r.ok ? r.text() : null)).catch(() => null);

export async function fetchCardCsvTexts(): Promise<CardCsvTexts> {
  const index = await fetch(`${BASE}/index.json`).then(r => r.json() as Promise<CardDataIndex>);
  const [packs, tokens, variants] = await Promise.all([
    Promise.all(index.packs.map(p => getText(p.file))),
    getText(index.tokens),
    getText(index.variants),
  ]);
  return { packs, tokens, variants };
}
