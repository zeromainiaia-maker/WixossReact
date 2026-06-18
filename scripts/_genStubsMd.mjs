import fs from 'fs';
const d = JSON.parse(fs.readFileSync('scripts/_stubData.json', 'utf8'));

const esc = (s) => (s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const clip = (s, n) => { s = esc(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

const inJson = d.inJson;
const fallback = d.fallback;
const dead = d.deadHandlers;

const partName = { execStubPart1: 'execStubPart1.ts', execStubPart2: 'execStubPart2.ts', execStubPart3: 'execStubPart3.ts' };

function table(rows) {
  const out = ['| STUB ID | 件数 | カード数 | 代表カード | 説明 |', '|---|---:|---:|---|---|'];
  for (const r of rows.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))) {
    out.push(`| \`${r.id}\` | ${r.count} | ${r.cardCount} | ${esc(r.sample)} | ${clip(r.comment, 120)} |`);
  }
  return out.join('\n');
}

const total = inJson.reduce((a, r) => a + r.count, 0);
const impl = inJson.filter(r => r.impl);

let md = `# STUB 一覧

effects JSON 内の \`{ type: 'STUB', id: '...' }\` ノードの全一覧と実装状況。
このファイルは \`scripts/_genStubsMd.mjs\`（\`_dumpStubs.mjs\` で集計）から自動生成できる。

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

- 「説明」列は \`execStubPart*.ts\` の各 \`stub.id ===\` 直前コメントから自動抽出（空欄＝コメント無し、要補完）。
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
  const rows = impl.filter(r => r.impl === part);
  md += `\n### ${partName[part]}（${rows.length} 種）\n\n${table(rows)}\n`;
}

md += `

---

## 付録: 内部/動的生成 STUB（JSON 0 件・ハンドラのみ ${dead.length} 種）

他の STUB やパーサーが実行時に動的生成する \`INTERNAL_*\` 系などが大半。JSON には静的には現れない。

${table(dead)}
`;

fs.writeFileSync('docs/STUBS.md', md);
console.log('docs/STUBS.md を生成しました（', md.split('\n').length, '行 ）');
