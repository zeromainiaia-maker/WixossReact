/**
 * CardData_TK.csv の全トークンが BattleScreen.tsx の battleCardNums に
 * 静的登録されているかを監査する。未登録トークンは（signi_acce 等の
 * 非走査ゾーンに置かれる場合）cardMap に載らず描画・効果解決が壊れる。
 * 実行: npx tsx scripts/_auditTokenCardMap.mts
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tk = Papa.parse<Record<string, string>>(
  readFileSync(join(root, 'public/data/CardData_TK.csv'), 'utf-8').replace(/^﻿/, ''),
  { header: true, skipEmptyLines: true },
).data;

const src = readFileSync(join(root, 'src/screens/BattleScreen.tsx'), 'utf-8');
const loaded = new Set([...src.matchAll(/nums\.add\('([^']+)'\)/g)].map(m => m[1]));

const missing = tk.map(r => r.CardNum).filter(cn => cn && !loaded.has(cn));
console.log(`TK総数: ${tk.length} / 登録済: ${tk.length - missing.length} / 未登録: ${missing.length}`);
for (const m of missing) console.log(`  未登録: ${m}`);
process.exit(missing.length > 0 ? 1 : 0);
