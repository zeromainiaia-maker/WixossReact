// タスク12(lxxxv)/(lxxxix)：MANUAL（PRESERVE 保護）で build:effects / heldReview が届かない4効果の外科パッチ。
// 先頭の STUB OPTIONAL_COST（＝使用時の任意支払いを解決中にもう一度聞く形）だけを落とす。
//
// 支払いとコスト軽減は使用時（`src/screens/battle/useTimeCost.ts` ＋ SpellCastModal / ArtsModal）が担当する。
// 落とさないと Pattern⑤ の「skip→残りステップをスキップ」に当たり、支払いを断ると**本体が丸ごと不発**になる
// （WX11-044＝相手の手札3枚捨て／WX12-032＝バニッシュ／WX24-P3-004＝このターン敗北しない が消える）。
// 冪等：先頭が OPTIONAL_COST でなければ何もしない。
import { readFileSync, writeFileSync } from 'fs';

const TARGETS = [
  ['public/data/effects_WX.json', ['WX11-044', 'WX12-032']],
  // WX25-P1-110 は (lxxxix)＝支払い元が「場のシグニをトラッシュ」の追加分。
  ['public/data/effects_WX24_26.json', ['WX24-P3-004', 'WX25-P1-110']],
];

let total = 0;
for (const [path, nums] of TARGETS) {
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  let changed = 0;
  for (const num of nums) {
    const eff = data[num]?.find(e => e.effectType === 'ACTIVATED');
    const steps = eff?.action?.steps;
    if (!Array.isArray(steps)) { console.log(`${num}: SEQUENCE でない → skip`); continue; }
    if (!(steps[0]?.type === 'STUB' && steps[0]?.id === 'OPTIONAL_COST')) {
      console.log(`${num}: 先頭が OPTIONAL_COST でない → skip（適用済み）`); continue;
    }
    eff.action = { ...eff.action, steps: steps.slice(1) };
    changed++;
    console.log(`${num}: OPTIONAL_COST を除去 → ${JSON.stringify(eff.action.steps.map(s => s.id ?? s.type))}`);
  }
  if (changed > 0) writeFileSync(path, JSON.stringify(data), 'utf-8');
  total += changed;
}
console.log(`計 ${total} 効果`);
