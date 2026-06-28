import { readFileSync, writeFileSync } from 'fs';
// VALUE 小バケツ：EXIST 正・FRESH 退化を MANUAL化（top-level 発散 effect index 指定）。runtime 不変。
const targets = {
  'effects_WX.json': [
    ['WX15-102', 1], // アクセホスト常付与 count=1（FRESH=ALL 誤・アクセは1体に1枚）
    ['WX15-105', 1],
    ['WX20-045', 1], // FORCE_FRONT_SIGNI_ATTACK（FRESH=FORCE_SIGNI_ATTACK 誤・「この正面の」）
    ['WX13-081', 0], // split_top_bottom（FRESH=bottom 誤・「一番上に置き残りを一番下」）
    ['WX13-082', 0],
  ],
  'effects_WXK.json': [
    ['WXK04-050', 0], // アクセホスト常付与 count=1（FRESH=ALL 誤）
  ],
};
for (const [fn, list] of Object.entries(targets)) {
  const path = `public/data/${fn}`;
  const d = JSON.parse(readFileSync(path, 'utf-8'));
  for (const [card, idx] of list) {
    const e = d[card][idx];
    if (!e) { console.log(`MISS ${card}[${idx}]`); continue; }
    e.parseStatus = 'MANUAL';
    console.log(`MANUAL ${card}/${e.effectId}`);
  }
  const out = JSON.stringify(d); JSON.parse(out); writeFileSync(path, out);
}
console.log('done');
