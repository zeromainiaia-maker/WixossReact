import { readFileSync, writeFileSync } from 'fs';
// VALUE then/steps（EXIST=opponent 正/STUB近似ロック）＋ abilities.parseStatus（内側MANUALを維持しつつ held除外）。
const targets = {
  'effects_WX.json': [
    ['WX10-069', 0], // 「対戦相手は」ライフトラッシュ→ライフ加える（FRESH=self 誤）
    ['WX10-072', 0],
    ['WX15-058', 2],  // 内側ability MANUAL を維持（abilities.parseStatusノイズ）
    ['WX21-041', 1],
    ['WXEX1-70', 2],
  ],
  'effects_WX24_26.json': [
    ['WX24-P2-048', 0], // choice①STUB近似（OPTIONAL_COST↔TARGET_AND_DISCARD_HAND・機構待ち）EXISTロック
  ],
  'effects_misc.json': [
    ['WDK08-Y12', 0], // STUB近似（OPTIONAL_COST↔TARGET_AND_DISCARD_HAND・energyコスト＋特定札捨ては機構待ち）EXISTロック
  ],
  'effects_WXDi.json': [
    ['WXDi-P09-TK02A', 0],
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
