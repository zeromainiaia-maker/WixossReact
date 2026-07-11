/**
 * timing 語彙センサス（続き75新設）＝「【自】なのに timing 判定が全て外れて ON_PLAY（＝場に出たとき）へ
 * フォールバックした効果」を、原文のトリガー句でクラスタリングして枚数順に出す計器。
 *
 * なぜ要るか：engine 側に収集関数があるのに parser がその timing を一度も生成していない、という穴が実在した。
 * ON_SIGNI_BANISH_OPPONENT（「バトルによってバニッシュしたとき」）がまさにそれで、31枚が「召喚しただけで発火する」
 * 幻覚になっていた（続き75で是正）。同型の穴を継続的に検出するための計器。
 *
 * 実行: npm run census:timing   → docs/_timing_census.txt
 * 見方: 上位クラスタ＝「その原文パターンに対応する timing 語彙が parser に無い」候補。engine 側に既に収集関数が
 *       あれば parser に regex を1本足すだけで直る（＝最も費用対効果が高い）。
 */
import { readFileSync, existsSync, writeFileSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects, getTimingFallbackLog } from '../src/data/effectParser';
import type { CardData } from '../src/types';

const rows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const p = `public/data/CardData_Sheet${i}.csv`;
  if (!existsSync(p)) break;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  rows.push(...data);
}
const tk = 'public/data/CardData_TK.csv';
if (existsSync(tk)) {
  const { data } = Papa.parse<Record<string, string>>(readFileSync(tk, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  rows.push(...data);
}
for (const r of rows) {
  if (!r.CardNum) continue;
  parseCardEffects({ ...r, effects: [] } as unknown as CardData);
}

// 「…とき」「…時」を含むフォールバックだけが疑わしい（含まないものは本当に【自】の常時誘発＝ON_PLAY 相当でよい）。
const hits = getTimingFallbackLog().filter(e => /とき|(?<!まで)時/.test(e.text) && !/場に出たとき/.test(e.text));

// トリガー句（「…たとき」「…時」）でクラスタリング
const clusters = new Map<string, { n: number; ids: string[] }>();
for (const h of hits) {
  const m = h.text.match(/([^、。：:]{3,30}?(?:たとき|になったとき|されたとき|時))/);
  const key = (m ? m[1] : '(トリガー句抽出不可)')
    .replace(/^《[^》]*》/, '')
    .replace(/[０-９\d]+/g, 'N')
    .replace(/＜[^＞]+＞/g, '＜X＞')
    .trim();
  const c = clusters.get(key) ?? { n: 0, ids: [] };
  c.n++;
  if (c.ids.length < 8) c.ids.push(h.effectId);
  clusters.set(key, c);
}

const sorted = [...clusters.entries()].sort((a, b) => b[1].n - a[1].n);
const out: string[] = [];
out.push('# timing 語彙センサス＝【自】が ON_PLAY へ誤フォールバックした効果のクラスタ表');
out.push('# 生成: npm run census:timing（scripts/timingCensus.ts）');
out.push('# 上位＝parser に timing 語彙が無い候補。engine に収集関数が既にあれば regex 1本で直る（続き75の ON_SIGNI_BANISH_OPPONENT が実例＝31枚）。');
out.push(`# 総数: ${hits.length} 効果 / ${sorted.length} クラスタ`);
out.push('');
for (const [k, v] of sorted) {
  out.push(`${String(v.n).padStart(4)}  ${k}`);
  out.push(`      例: ${v.ids.join(', ')}`);
}
writeFileSync('docs/_timing_census.txt', out.join('\n'), 'utf-8');
console.log(`timing フォールバック: ${hits.length} 効果 / ${sorted.length} クラスタ`);
console.log('上位15クラスタ:');
for (const [k, v] of sorted.slice(0, 15)) console.log(`  ${String(v.n).padStart(4)}  ${k}`);
console.log('\n明細: docs/_timing_census.txt');
