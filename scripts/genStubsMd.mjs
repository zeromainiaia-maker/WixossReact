// docs/STUBS.md を再生成する。
//   実行: node scripts/genStubsMd.mjs
// effects JSON の全 STUB ノードを集計し、execStubPart1-3.ts のハンドラ実装状況・
// 直前コメント（説明）と突き合わせて Markdown 表を出力する。
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
const handlerFile = {};
const handlerComment = {};
for (const part of ['execStubPart1', 'execStubPart2', 'execStubPart3']) {
  const lines = fs.readFileSync(`src/engine/${part}.ts`, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const ids = [...lines[i].matchAll(/stub\.id === '([A-Z0-9_]+)'/g)].map(m => m[1]);
    if (!ids.length) continue;
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
const fallback = inJson.filter(r => !r.impl);
const dead = rows.filter(r => r.count === 0 && r.impl);
const impl = inJson.filter(r => r.impl);
const total = inJson.reduce((a, r) => a + r.count, 0);

// 3) Markdown 生成
const esc = (s) => (s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const clip = (s, n) => { s = esc(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const partName = { execStubPart1: 'execStubPart1.ts', execStubPart2: 'execStubPart2.ts', execStubPart3: 'execStubPart3.ts' };
function table(list) {
  const out = ['| STUB ID | 件数 | カード数 | 代表カード | 説明 |', '|---|---:|---:|---|---|'];
  for (const r of list.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))) {
    out.push(`| \`${r.id}\` | ${r.count} | ${r.cardCount} | ${esc(r.sample)} | ${clip(r.comment, 120)} |`);
  }
  return out.join('\n');
}

let md = `# STUB 一覧

effects JSON 内の \`{ type: 'STUB', id: '...' }\` ノードの全一覧と実装状況。
**このファイルは \`node scripts/genStubsMd.mjs\` で再生成する**（手で編集しても次回再生成で消える）。

> **STUB とは:** カードテキストを DSL に落とし込む際、汎用アクションでは表現しきれない固有ロジックを
> 名前付きハンドラ（\`src/engine/execStub.ts\` → \`execStubPart1〜3.ts\`）に逃がす仕組み。
> \`execStub\` は Part1→2→3 の順に \`stub.id\` を照合し、どれにも一致しなければ \`[STUB: id]\` をログ出力する（フォールバック）。

## サマリー（最終生成: ${new Date().toISOString().slice(0, 10)}）

| 区分 | 値 |
|---|---:|
| JSON で使用中の STUB id 種類 | ${inJson.length} |
| 　└ ハンドラ実装あり | ${impl.length} |
| 　└ フォールバック（execStub 未処理） | ${fallback.length} |
| 総 STUB ノード件数 | ${total} |
| JSON 0 件・ハンドラのみ（内部/動的生成 STUB） | ${dead.length} |

- 「説明」列は \`execStubPart*.ts\` の各 \`stub.id ===\` 直前コメントから自動抽出（空欄＝コメント無し、要補完）。説明を充実させたい場合は該当ハンドラの直前にコメントを書いて再生成する。
- **STUB_LOG（ゲーム効果なしのログのみ）は 0 件達成済み**（v0.284）。現在残る STUB は何らかの実処理を持つ。

---

## ⚠ フォールバック（execStub で未処理）

execStub の if 分岐に無い id。ただし下記の一部は **CONTINUOUS 宣言型**で \`effectEngine\` 側が処理するため実害はない
（例: \`TREAT_AS_LEVEL1_IN_DECK_TRASH\`）。新規 STUB を足したのにここに出る場合は実装漏れの可能性。

${table(fallback)}

---

## 実装済み STUB（ハンドラ別）
`;

for (const part of ['execStubPart1', 'execStubPart2', 'execStubPart3']) {
  const list = impl.filter(r => r.impl === part);
  md += `\n### ${partName[part]}（${list.length} 種）\n\n${table(list)}\n`;
}

md += `

---

## 付録: 内部/動的生成 STUB（JSON 0 件・ハンドラのみ ${dead.length} 種）

他の STUB やパーサーが実行時に動的生成する \`INTERNAL_*\` 系などが大半。JSON には静的には現れない。

${table(dead)}
`;

fs.writeFileSync('docs/STUBS.md', md);
console.log(`docs/STUBS.md を生成（使用中 ${inJson.length} 種 / 実装 ${impl.length} / フォールバック ${fallback.length} / 内部 ${dead.length}）`);
