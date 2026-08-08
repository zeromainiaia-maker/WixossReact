// タスク12(cxiii)：`build:effects` の収穫マージが構造的に届かない2カードを、**parser の出力そのもの**で live へ落とす。
// ⚠なぜ手作業が要るのか＝`buildEffectsJson.ts` は「MANUAL/PARTIAL を含むカードで **effectId の集合が変わる**」
//   場合はカード丸ごと温存し、_held_fresh / _partial_fresh のどちらのレビュー行列にも載せない（sameIdSet ガード）。
//   本バッチは効果を新設する（WXEX1-33-E2b / WX09-019-E4,E5）ので、まさにその穴に落ちる。
//   ここでは parseCardEffects+mergeManualEffects の結果をそのまま書くので **parser と live は完全一致**
//   ＝held/stale live を増やさない。
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';

const TARGETS: Record<string, string> = { 'WXEX1-33': 'effects_WX', 'WX09-019': 'effects_WX' };

const rows: Record<string, string>[] = [];
for (let i = 1; i <= 10; i++) {
  const p = join('public/data', `CardData_Sheet${i}.csv`);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  rows.push(...data);
}

const byFile = new Map<string, string[]>();
for (const [id, file] of Object.entries(TARGETS)) (byFile.get(file) ?? byFile.set(file, []).get(file)!).push(id);

for (const [file, ids] of byFile) {
  const path = join('public/data', `${file}.json`);
  const j = JSON.parse(fs.readFileSync(path, 'utf-8'));
  for (const id of ids) {
    const row = rows.find(r => r.CardNum === id);
    if (!row) throw new Error(`CSV に無い: ${id}`);
    const fresh = mergeManualEffects(id, parseCardEffects({ ...row, effects: [] } as never));
    console.log(`${id}: ${(j[id] ?? []).map((e: { effectId: string }) => e.effectId).join(' ')}`);
    console.log(`   → ${fresh.map(e => e.effectId).join(' ')}`);
    j[id] = fresh;
  }
  fs.writeFileSync(path, JSON.stringify(j), 'utf-8'); // ⚠ミニファイ1行形式を維持
  console.log(`wrote ${path}`);
}
