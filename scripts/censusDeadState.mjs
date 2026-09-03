// PlayerState の「書かれるだけで読まれないキー」計器（§5.3 `O-226` の一般化・2026-09-04新設）。
//
// 🔴**なぜ要るか**＝`O-226` で見つかった穴は「STUB は実装済みなのに、**書き込んだ state を誰も読まない**」
//   という形だった（`game_declared_signi_level_zero` / `game_declared_signi_ignore_restriction` /
//   `lrig_activation_count`）。この形は
//   ・`census:stubs` A群には出ない（ハンドラ自体は在って消費地点もある）
//   ・`census:enginetext` にも出ない（原文を読んでいない）
//   ・golden / smoke / fuzz も緑（例外も不変条件違反も起きない）
//   ＝**真 no-op なのにどの計器にも映らない**。宣言だけが立って盤面が動かない。
//
// 判定＝`src/types/index.ts` の `PlayerState` に宣言されたキーごとに、`src/` 全体で
//   **書き（`key:` を含む代入文脈）**と**読み（`.key` / `['key']` / 分割代入）**を数え、
//   **書きがあって読みが 0** のものを列挙する。
// ⚠**これは候補出しであって判定ではない**＝動的アクセス（`state[k]`）やテンプレート経由は数えられない。
//   1件ずつ `grep -rn "<key>" src/` で消費地点を確かめること（`census:stubs` A群と同じ規律）。
// ⚠ゲートではない（exit 0）。ラチェットは golden 側に置く。
import fs from 'fs';
import path from 'path';

const NL = String.fromCharCode(10);   // ⚠改行リテラルを書かない（エスケープが1段剥がれる環境がある）
const root = process.cwd();
const typesSrc = fs.readFileSync(path.join(root, 'src/types/index.ts'), 'utf8');

// PlayerState の本文だけを切り出す（次の `\n}` まで）。
const start = typesSrc.indexOf('export interface PlayerState');
const body = typesSrc.slice(start, typesSrc.indexOf('\n}', start));
const keys = [...body.matchAll(/^\s{2}([a-z_][A-Za-z0-9_]*)\??\s*:/gm)].map(m => m[1]);

// src/ 全体を読む（型宣言ファイル自身は除く＝宣言は「読み」ではない）。
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
};
walk(path.join(root, 'src'));
const corpus = files
  .filter(f => !f.endsWith(path.join('src', 'types', 'index.ts')))
  .map(f => ({ f, text: fs.readFileSync(f, 'utf8') }));

const dead = [];
const rows = [];
// ⚠**正規表現のエスケープに頼らない**（テンプレートリテラルの `\b` / `\s` は環境によって
//   1段剥がれて ``＝バックスペース、`s` になり、**黙って何にも当たらない**規則になる。実際に踏んだ）。
//   ⇒ キー名の出現位置の**前後1文字**だけを見て読み書きを分ける。
const classify = (line, key) => {
  let i = line.indexOf(key);
  let write = false, read = false;
  while (i >= 0) {
    const before = i > 0 ? line[i - 1] : ' ';
    let j = i + key.length;
    while (j < line.length && line[j] === ' ') j++;
    const after = j < line.length ? line[j] : '';
    const wordBefore = /[A-Za-z0-9_$]/.test(before);
    if (!wordBefore) {
      if (before === '.' || before === "'" || before === '"') read = true;   // `.key` / `['key']`
      else if (after === ':') write = true;                                   // `key: value`
      else read = true;                                                       // 分割代入・引数など
    }
    i = line.indexOf(key, i + key.length);
  }
  return { write, read };
};
for (const key of keys) {
  let writes = 0, reads = 0;
  for (const { text } of corpus) {
    for (const line of text.split(NL)) {
      const t = line.trim();
      // コメント行は数えない（注記に key 名が出るだけで「消費」ではない）。
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      const c = classify(line, key);
      if (c.read) reads++;
      else if (c.write) writes++;
    }
  }
  rows.push({ key, writes, reads });
  if (writes > 0 && reads === 0) dead.push({ key, writes });
}

rows.sort((a, b) => b.writes - a.writes);
const out = [
  '# PlayerState の「書かれるだけで読まれない」キー（§5.3 `O-226` の一般化）',
  '# ⚠候補出しであって判定ではない＝動的アクセスは数えられない。1件ずつ grep で消費地点を確かめること。',
  '',
  `PlayerState のキー: ${keys.length}`,
  `🔴 書きあり・読み 0: ${dead.length}`,
  '',
  ...dead.map(d => `  ${d.key}  （書き ${d.writes} 箇所 / 読み 0）`),
  '',
  '## 参考：書き込みの多い順（上位40）',
  ...rows.slice(0, 40).map(r => `  ${String(r.reads).padStart(4)} 読 / ${String(r.writes).padStart(3)} 書  ${r.key}`),
];
fs.writeFileSync(path.join(root, 'docs/_census_deadstate.txt'), out.join('\n'), 'utf8');
console.log(`[census:deadstate] PlayerState ${keys.length}キー中、書きあり・読み0 は ${dead.length}件（明細 docs/_census_deadstate.txt）`);
for (const d of dead) console.log(`  🔴 ${d.key}（書き ${d.writes}）`);
