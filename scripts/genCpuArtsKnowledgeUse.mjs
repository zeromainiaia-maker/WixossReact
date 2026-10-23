// 🆕2026-10-23＝カード知識ベース（`src/data/cardKnowledge.json`）から**アーツの使いどき**だけを抜き出す
//   ⇒ `src/data/cpuArtsKnowledgeUse.ts`（{ カード番号: 'offense' | 'defense' | 'both' }・生成物＝手で直さない）。
// 🔑**なぜ別ファイルか**＝知識ベース本体は約2MB＝アプリ（CPU の判断）に読み込ませるには重い。CPU が使うのはアーツの `when` だけ。
// 🔑再録・別絵柄（`_Variants.csv`）の番号にも同じ値を付ける（デッキが再録の番号で持っていても引ける）。
// 使い方：知識ベースを直したら `node scripts/genCpuArtsKnowledgeUse.mjs`（読み手は `cpuDeckPlan.ts` の `withKnowledgeArtsUse`）。
import { readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';
import { cardCsvPaths, variantsCsvPath, readCsvText } from './cardDataFiles.mjs';

const kb = JSON.parse(readFileSync('src/data/cardKnowledge.json', 'utf-8'));
const USE = { own: 'offense', opp: 'defense', both: 'both' };
const rows = (p) => Papa.parse(readCsvText(p), { header: true, skipEmptyLines: true }).data;
const byName = new Map();
const out = {};
for (const p of cardCsvPaths({ tokens: false })) {
  if (p === variantsCsvPath()) continue;
  for (const r of rows(p)) {
    if (r.Type !== 'アーツ') continue;
    const use = USE[kb[r.CardNum]?.when];
    if (!use) continue;
    out[r.CardNum] = use;
    byName.set(r.CardName, use);
  }
}
for (const r of rows(variantsCsvPath())) {
  if (r.Type === 'アーツ' && byName.has(r.CardName) && !out[r.CardNum]) out[r.CardNum] = byName.get(r.CardName);
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync('src/data/cpuArtsKnowledgeUse.ts', `// 生成物（node scripts/genCpuArtsKnowledgeUse.mjs）＝手で直さない。元データは src/data/cardKnowledge.json の when（アーツだけ）。
export const CPU_ARTS_KNOWLEDGE_USE: Readonly<Record<string, 'offense' | 'defense' | 'both'>> = ${JSON.stringify(sorted)};
`);
const count = (u) => Object.values(sorted).filter(x => x === u).length;
console.log(`アーツ ${Object.keys(sorted).length}枚（攻め ${count('offense')}／守り ${count('defense')}／両方 ${count('both')}）→ src/data/cpuArtsKnowledgeUse.ts`);
