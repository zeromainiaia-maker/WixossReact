import fs from 'fs';

const manual = {
  // 単一の任意コスト句がクリーンに取れるもの（そうした場合/その後 本体が続く）
  'WXDi-P14-042': 'あなたのエナゾーンにあるすべてのカードをトラッシュに置いてもよい',
  'WX25-CP1-061': 'あなたの手札から＜ブルアカ＞のカードを３枚まで公開してもよい',
  'PR-427': 'あなたは手札をすべて捨ててもよい',
  'WXK04-084': '《緑》《緑》《無》を支払い、手札から《幻水マレガビ》を１枚捨ててもよい',
  'WXDi-P11-039': 'あなたの手札を公開してもよい', // ※本体の動的閾値（公開Lv合計10）は B2 機構待ちのまま
  'SP07-009': '手札から＜美巧＞のシグニを２枚捨ててもよい', // 原文は「捨ててよい」(も欠落)＝整形
};

const files = ['effects_WXDi.json', 'effects_WX.json', 'effects_WXK.json', 'effects_WX24_26.json', 'effects_misc.json'];
const done = [];
for (const f of files) {
  const path = 'public/data/' + f;
  const d = JSON.parse(fs.readFileSync(path, 'utf8'));
  let changed = false;
  for (const id of Object.keys(manual)) {
    if (!d[id]) continue;
    let n = 0;
    for (const e of d[id]) {
      (function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (node.type === 'STUB' && node.id === 'OPTIONAL_COST' && !node.costColors && !node.coinCost && !node.costText) {
          node.costText = manual[id]; n++;
          if (e.parseStatus !== 'MANUAL') e.parseStatus = 'MANUAL';
        }
        for (const v of Object.values(node)) walk(v);
      })(e.action);
    }
    if (n > 0) { done.push(`${id}: ${manual[id]} (x${n})`); changed = true; }
  }
  if (changed) fs.writeFileSync(path, JSON.stringify(d) + '\n');
}
console.log(done.join('\n'));
