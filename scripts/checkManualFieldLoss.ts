import fs from 'node:fs';
import path from 'node:path';
import { MANUAL_EFFECTS } from '../src/data/manualEffects';

const dataDir = path.join(process.cwd(), 'public', 'data');
const effectFiles = [
  'effects_WX.json',
  'effects_WXDi.json',
  'effects_WX24_26.json',
  'effects_WXK.json',
  'effects_misc.json',
];

const parsedByCard = new Map<string, Record<string, unknown>[]>();
for (const file of effectFiles) {
  const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')) as
    Record<string, Record<string, unknown>[]>;
  for (const [cardNum, effects] of Object.entries(parsed)) parsedByCard.set(cardNum, effects);
}

const losses: { cardNum: string; effectId: string; fields: string[] }[] = [];
for (const [cardNum, manualEffects] of Object.entries(MANUAL_EFFECTS)) {
  const parsedEffects = parsedByCard.get(cardNum);
  if (!parsedEffects) continue;
  for (const manual of manualEffects as unknown as Record<string, unknown>[]) {
    const effectId = String(manual.effectId);
    const parsed = parsedEffects.find(effect => effect.effectId === effectId);
    if (!parsed) continue;
    const fields = Object.keys(parsed).filter(field => !(field in manual));
    if (fields.length > 0) losses.push({ cardNum, effectId, fields });
  }
}

// ── §6.4 O-40 の再発ガード（2026-08-22 新設）──
// `mergeManualEffects` は **`parseStatus` を見ず effectId 一致で常に manual 側を勝たせる**。
// そのため `manualEffects.ts` のエントリに `parseStatus:'AUTO'` と書くと、
// **「parser が出したもの」に見える手書きコピーが parser の最新出力を永久に上書きする**
// （live も AUTO と記録されるので、どの計器からも parser 由来と区別できない＝黙って改善が届かなくなる）。
// 実測30件が溜まっていた（うち7件は parser 出力と実体同一の完全な死荷重で削除・23件は正当な上書きで刻印だけが誤り）。
// ⇒ **manualEffects.ts のトップレベル効果は MANUAL か PARTIAL のどちらかでなければならない**。
// ⚠ネストした能力（`GRANT_*` の `abilities[]` 等）は parser も生成するので対象外＝トップレベルだけを見る。
const badStatus: { cardNum: string; effectId: string; parseStatus: string }[] = [];
for (const [cardNum, manualEffects] of Object.entries(MANUAL_EFFECTS)) {
  for (const manual of manualEffects as unknown as Record<string, unknown>[]) {
    const st = String(manual.parseStatus);
    if (st !== 'MANUAL' && st !== 'PARTIAL') {
      badStatus.push({ cardNum, effectId: String(manual.effectId), parseStatus: st });
    }
  }
}

if (losses.length > 0 || badStatus.length > 0) {
  if (losses.length > 0) {
    console.error(`manual field loss: ${losses.length} effect(s)`);
    for (const loss of losses) {
      console.error(`  ${loss.cardNum} / ${loss.effectId}: ${loss.fields.join(', ')}`);
    }
  }
  if (badStatus.length > 0) {
    console.error(`manual parseStatus 違反: ${badStatus.length} effect(s)`);
    console.error('  manualEffects.ts のトップレベル効果は MANUAL / PARTIAL のみ（§6.4 O-40）。');
    console.error('  AUTO と書くと parser の最新出力を黙って上書きし続ける＝どの計器にも映らない。');
    console.error('  直し方＝①parser 出力と実体同一なら **manualEffects.ts から削除**して parser に任せる');
    console.error('        ②意図的な上書きなら **MANUAL へ刻印を直す**（内容は変えない）。');
    for (const b of badStatus) {
      console.error(`  ${b.cardNum} / ${b.effectId}: parseStatus=${b.parseStatus}`);
    }
  }
  process.exit(1);
}

console.log('manual field loss: 0 effects / manual parseStatus 違反: 0 effects');
