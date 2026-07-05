import { readFileSync, writeFileSync } from 'fs';
// owner バケツ：EXIST 正・FRESH 退化（「あなたの」「対戦相手のデッキ」を parser が誤る）を MANUAL化して held から除外。
// runtime はJSON直ロードのためメタデータのみ変更＝挙動不変。差分effectのみ。
const targets = {
  'effects_WXDi.json': [
    ['WXDi-D06-009', 'WXDi-D06-009-E1'], // 「あなたのレベル2以下のシグニ」→self（FRESH=any誤）
    ['WXDi-P03-010', 'WXDi-P03-010-E2'], // 「あなたのシグニ1体」→self（FRESH=opponent誤）
    ['WXDi-P06-028', 'WXDi-P06-028-E1'], // 「あなたのレベル2以下のシグニ」→self（FRESH=any誤）
    ['WXDi-P12-084', 'WXDi-P12-084-E1'], // 「対戦相手のデッキの上から」→opponent（FRESH=self誤）
    ['WXDi-P12-088', 'WXDi-P12-088-E1'], // 「対戦相手のデッキの上から」→opponent（FRESH=self誤）
  ],
  'effects_WXK.json': [
    ['WXK07-029', 'WXK07-029-E1'], // 「あなたの＜微菌＞のシグニ」→self（FRESH=opponent誤）
  ],
};
for (const [fn, list] of Object.entries(targets)) {
  const path = `public/data/${fn}`;
  const d = JSON.parse(readFileSync(path, 'utf-8'));
  for (const [card, effId] of list) {
    const e = d[card].find((x) => x.effectId === effId);
    if (!e) { console.log(`MISS ${card}/${effId}`); continue; }
    e.parseStatus = 'MANUAL';
    console.log(`MANUAL ${card}/${effId} owner=${e.action?.target?.owner}`);
  }
  const out = JSON.stringify(d); JSON.parse(out); writeFileSync(path, out);
}
console.log('done');
