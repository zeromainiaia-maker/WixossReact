import fs from 'fs';

// 1) effects JSON から全 STUB id を集計（件数 + 使用カード）
const sheets = ['misc', 'WX', 'WX24_26', 'WXDi', 'WXK'];
const count = {};
const cards = {};
for (const s of sheets) {
  const d = JSON.parse(fs.readFileSync(`public/data/effects_${s}.json`, 'utf8'));
  for (const [cardNum, effects] of Object.entries(d)) {
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (o.type === 'STUB' && o.id) {
        count[o.id] = (count[o.id] || 0) + 1;
        (cards[o.id] = cards[o.id] || new Set()).add(cardNum);
      }
      for (const v of Object.values(o)) walk(v);
    };
    effects.forEach(walk);
  }
}

// 2) ハンドラ側（execStubPart1-3）から実装済み id + 直前コメントを抽出
const handlerFile = {};   // id -> ファイル名
const handlerComment = {}; // id -> 直前コメント
for (const part of ['execStubPart1', 'execStubPart2', 'execStubPart3']) {
  const lines = fs.readFileSync(`src/engine/${part}.ts`, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const ids = [...lines[i].matchAll(/stub\.id === '([A-Z0-9_]+)'/g)].map(m => m[1]);
    if (!ids.length) continue;
    // 直前の連続コメント行を集める
    const cmt = [];
    for (let j = i - 1; j >= 0; j--) {
      const t = lines[j].trim();
      if (t.startsWith('//')) cmt.unshift(t.replace(/^\/\/\s?/, ''));
      else break;
    }
    for (const id of ids) {
      if (!handlerFile[id]) { handlerFile[id] = part; handlerComment[id] = cmt.join(' '); }
    }
  }
}

const allIds = new Set([...Object.keys(count), ...Object.keys(handlerFile)]);
const rows = [...allIds].map(id => ({
  id,
  count: count[id] || 0,
  cardCount: cards[id] ? cards[id].size : 0,
  sample: cards[id] ? [...cards[id]].slice(0, 3).join(', ') : '',
  impl: handlerFile[id] || '',
  comment: handlerComment[id] || '',
}));

const inJson = rows.filter(r => r.count > 0);
const implemented = inJson.filter(r => r.impl);
const fallback = inJson.filter(r => !r.impl);
const deadHandlers = rows.filter(r => r.count === 0 && r.impl);

console.log('=== サマリー ===');
console.log('JSONで使用中のSTUB id種類数:', inJson.length);
console.log('  うちハンドラ実装あり:', implemented.length);
console.log('  うちフォールバック(ログのみ):', fallback.length);
console.log('JSON 0件だがハンドラ存在(内部/デッド):', deadHandlers.length);
console.log('総STUBノード件数:', inJson.reduce((a, r) => a + r.count, 0));

fs.writeFileSync('scripts/_stubData.json', JSON.stringify({ inJson, fallback, deadHandlers }, null, 2));
console.log('\n--- フォールバック(ログのみ)のid一覧 ---');
fallback.sort((a, b) => b.count - a.count).forEach(r => console.log(`${r.count}\t${r.id}\t(${r.sample})`));
