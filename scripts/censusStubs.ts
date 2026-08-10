// STUB 仕分け計器（§6.4「生ID残存＝表示or実装の穴」・2026-08-10新設）
//   実行: npx tsx scripts/censusStubs.ts        （明細 docs/_census_stubs.txt）
//         npx tsx scripts/censusStubs.ts --id X （1 id の完全内訳＝消費地点を全部出す）
//
// ねらい＝逆翻訳に出る `[STUB:...]` を **「表示だけの穴」と「実装の穴」に機械で仕分ける**。
// 「STUB＝未実装」ではない（実装済みハンドラの表示名でもある）ので、2軸で測る：
//   軸1 実装 ＝ live JSON の STUB id を engine の**どこか**が消費しているか
//              （execStubPart1-3 のハンドラ／CONTINUOUS 宣言型を読む effectEngine・BattleScreen 等）
//   軸2 表示 ＝ decompile_sheet に `[STUB:<生ID>` として英語 ID が露出しているか
// ⚠**生成側（parser / manualEffects）の言及は消費ではない**（STUB を作る側なので、そこにしか
//   出てこない id は「作られるが誰も読まない＝真 no-op」）＝producer は消費地点から除外する。
// ⚠id には日本語を含むものがある（`ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白`）＝`[A-Z0-9_]+` で
//   拾うと実装済みなのに「フォールバック」に化ける（genStubsMd.mjs の既知の誤検出）。
// ゲートではない（exit 0）。
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const root = join(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const onlyId = (() => {
  const i = argv.indexOf('--id');
  return i >= 0 ? argv[i + 1] : null;
})();

// ── 1) live JSON から STUB id を全数収集（engine が実際に実行するのは live）──
const SHEETS = ['misc', 'WX', 'WX24_26', 'WXDi', 'WXK'];
const liveCount = new Map<string, number>();
const liveCards = new Map<string, Set<string>>();
// STUB ノードが持つ追加キー（id/type 以外）＝engine が id ではなく**このキー**を読んで実装している
// ことがある（`PREVENT_POWER_MODIFY_BY_OPP` は `powerModifyProtection` を effectEngine が読む）。
const livePayloadKeys = new Map<string, Set<string>>();
for (const s of SHEETS) {
  const data = JSON.parse(readFileSync(join(root, `public/data/effects_${s}.json`), 'utf-8')) as Record<string, unknown[]>;
  for (const [cardNum, effects] of Object.entries(data)) {
    const walk = (o: unknown): void => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      const rec = o as Record<string, unknown>;
      if (rec.type === 'STUB' && typeof rec.id === 'string') {
        liveCount.set(rec.id, (liveCount.get(rec.id) ?? 0) + 1);
        if (!liveCards.has(rec.id)) liveCards.set(rec.id, new Set());
        liveCards.get(rec.id)!.add(cardNum);
      }
      for (const v of Object.values(rec)) walk(v);
    };
    (effects ?? []).forEach(walk);
  }
}

// ── 2) src/ を全走査して id ごとの参照地点を集める ──
// 役割で3分類する：handler（execStubPart1-3 の分岐）／consumer（それ以外の実装コード）／producer（生成側）。
const PRODUCER_RE = /^src[\\/]data[\\/](manualEffects|effectParser|parserUtils|appearanceConditionParser)\.ts$|^src[\\/]data[\\/]parsers[\\/]/;
const HANDLER_RE = /^src[\\/]engine[\\/]execStub(Part[123])?\.ts$/;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, out);
    else if (/\.tsx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

type Ref = { file: string; line: number; text: string; comment: boolean };
const handlerOf = new Map<string, string>();          // id -> 'execStubPart1' 等
const handlerComment = new Map<string, string>();     // id -> 直前コメント（説明用）
const consumers = new Map<string, Ref[]>();
const producers = new Map<string, Ref[]>();

// id は英数記号だけでなく日本語も含みうる。live に出た id を実際に検索キーにする（正規表現生成は
// 語彙表ではなく実データ駆動＝新しい id を足しても計器の対応表を直さなくてよい）。
const allIds = new Set<string>(liveCount.keys());
// ハンドラ側にしか無い id（内部/動的生成）も拾って「JSON 0件」の枠に出す。
{
  for (const part of ['execStubPart1', 'execStubPart2', 'execStubPart3']) {
    const lines = readFileSync(join(root, `src/engine/${part}.ts`), 'utf-8').split(/\r?\n/);
    for (const l of lines) {
      for (const m of l.matchAll(/stub\.id\s*===\s*'([^']+)'/g)) allIds.add(m[1]);
    }
  }
}

for (const abs of walkFiles(join(root, 'src'))) {
  const rel = relative(root, abs);
  const lines = readFileSync(abs, 'utf-8').split(/\r?\n/);
  const isHandlerFile = HANDLER_RE.test(rel);
  const isProducer = PRODUCER_RE.test(rel);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('STUB') && !/['"`]/.test(line)) continue;
    for (const id of allIds) {
      if (!line.includes(id)) continue;
      const trimmed = line.trim();
      const comment = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
      if (isHandlerFile) {
        // ハンドラ分岐だけを「実装」と数える（コメント言及は数えない）。
        if (!comment && new RegExp(`stub\\.id\\s*===\\s*'${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(line)) {
          if (!handlerOf.has(id)) {
            handlerOf.set(id, rel.replace(/^src[\\/]engine[\\/]/, '').replace(/\.ts$/, ''));
            const cmt: string[] = [];
            for (let j = i - 1; j >= 0; j--) {
              const t = lines[j].trim();
              if (!t.startsWith('//')) break;
              const c = t.replace(/^\/\/\s?/, '');
              if (/─{3,}|={3,}/.test(c)) break;
              cmt.unshift(c);
            }
            handlerComment.set(id, cmt.join(' '));
          }
        }
        continue;
      }
      const ref: Ref = { file: rel, line: i + 1, text: trimmed.slice(0, 160), comment };
      const bucket = isProducer ? producers : consumers;
      if (!bucket.has(id)) bucket.set(id, []);
      bucket.get(id)!.push(ref);
    }
  }
}

// 実コード（非コメント）の消費だけを「実装あり」の根拠にする。
const codeConsumers = (id: string): Ref[] => (consumers.get(id) ?? []).filter(r => !r.comment);

// ── 3) 逆翻訳シートでの「生ID露出」を実測 ──
// `[STUB:<生ID>` がそのまま出ているか＝表示語彙が無い（説明文が付いていれば日本語になる）。
const sheetText = (() => {
  const dir = join(root, 'docs');
  let all = '';
  for (const f of readdirSync(dir).filter(f => /^decompile_sheet\d*\.txt$/.test(f))) {
    all += readFileSync(join(dir, f), 'utf-8');
  }
  return all;
})();
const rawExposure = new Map<string, number>();
let totalStubTags = 0;
{
  for (const m of sheetText.matchAll(/\[STUB:([^\]]*)\]/g)) {
    totalStubTags++;
    const inner = m[1];
    // 「ID」そのもの、または「ID: 説明」形（ハンドラ直前コメントが id で始まる場合）＝生ID露出。
    const idm = inner.match(/^([A-Za-z0-9_\u3040-\u30ff\u4e00-\u9fa5]*[A-Z][A-Z0-9_\u3040-\u30ff\u4e00-\u9fa5]*)(?:$|[:：\s])/);
    if (!idm) continue;
    const cand = idm[1];
    if (!allIds.has(cand)) continue;
    rawExposure.set(cand, (rawExposure.get(cand) ?? 0) + 1);
  }
}

// ── 4) 仕分け ──
type Row = {
  id: string; count: number; cards: string[];
  handler: string | null; consumers: Ref[]; producers: Ref[];
  raw: number; comment: string;
};
const rows: Row[] = [...allIds].map(id => ({
  id,
  count: liveCount.get(id) ?? 0,
  cards: [...(liveCards.get(id) ?? [])],
  handler: handlerOf.get(id) ?? null,
  consumers: codeConsumers(id),
  producers: (producers.get(id) ?? []).filter(r => !r.comment),
  raw: rawExposure.get(id) ?? 0,
  comment: handlerComment.get(id) ?? '',
}));

const inLive = rows.filter(r => r.count > 0);
// A＝実装の穴：live に居るのに engine のどこにも消費が無い＝実行しても何も起きない。
const holeImpl = inLive.filter(r => !r.handler && r.consumers.length === 0);
// B＝宣言型：ハンドラは無いが engine の別経路（CONTINUOUS 収集等）が読んでいる＝実害なしの見込み。
const declarative = inLive.filter(r => !r.handler && r.consumers.length > 0);
// C＝表示だけの穴：実装はあるのに逆翻訳に英語 ID が出ている。
const holeDisplay = inLive.filter(r => (r.handler || r.consumers.length > 0) && r.raw > 0);
const healthy = inLive.filter(r => (r.handler || r.consumers.length > 0) && r.raw === 0);
const deadIds = rows.filter(r => r.count === 0);

// ── 5) 出力 ──
const out: string[] = [];
const p = (s = '') => out.push(s);

if (onlyId) {
  const r = rows.find(x => x.id === onlyId);
  if (!r) { console.log(`[censusStubs] id が見つからない: ${onlyId}`); process.exit(0); }
  console.log(`===== ${r.id} =====`);
  console.log(`live 件数: ${r.count} / カード ${r.cards.length} 枚: ${r.cards.join(', ')}`);
  console.log(`ハンドラ: ${r.handler ?? '(無し)'}`);
  console.log(`逆翻訳の生ID露出: ${r.raw} 箇所`);
  console.log(`\n-- 消費地点（engine 実装コード。ここが 0 なら真 no-op）--`);
  for (const c of (consumers.get(r.id) ?? [])) console.log(`  ${c.comment ? '(コメント) ' : ''}${c.file}:${c.line}  ${c.text}`);
  console.log(`\n-- 生成地点（parser / manualEffects＝消費ではない）--`);
  for (const c of (producers.get(r.id) ?? [])) console.log(`  ${c.comment ? '(コメント) ' : ''}${c.file}:${c.line}  ${c.text.slice(0, 120)}`);
  process.exit(0);
}

const fmt = (r: Row) =>
  `  ${String(r.count).padStart(4)}件 ${String(r.cards.length).padStart(3)}枚  ${r.id}` +
  (r.raw ? `  [生ID露出 ${r.raw}]` : '') +
  (r.cards.length ? `\n        カード: ${r.cards.slice(0, 6).join(', ')}${r.cards.length > 6 ? ` …他${r.cards.length - 6}枚` : ''}` : '');

p('===== STUB 仕分け計器（§6.4「生ID残存＝表示or実装の穴」） =====');
p('生成: npx tsx scripts/censusStubs.ts   1件の内訳: --id <STUB_ID>');
p('');
p(`live JSON の STUB id 種類 : ${inLive.length}（総ノード ${[...liveCount.values()].reduce((a, b) => a + b, 0)} 件）`);
p(`逆翻訳シートの [STUB:…] 総数: ${totalStubTags}  うち生ID露出 ${[...rawExposure.values()].reduce((a, b) => a + b, 0)} 箇所（${rawExposure.size} 種）`);
p('');
p('■ 仕分け結果');
p(`  A 実装の穴（ハンドラ無し＋src に消費0＝真 no-op）      : ${holeImpl.length} 種 / ${holeImpl.reduce((a, r) => a + r.count, 0)} 件`);
p(`  B 宣言型（ハンドラ無しだが engine 別経路が消費）        : ${declarative.length} 種 / ${declarative.reduce((a, r) => a + r.count, 0)} 件`);
p(`  C 表示だけの穴（実装あり＋逆翻訳に生ID露出）            : ${holeDisplay.length} 種 / ${holeDisplay.reduce((a, r) => a + r.raw, 0)} 箇所`);
p(`  D 健全（実装あり＋日本語表示）                          : ${healthy.length} 種`);
p(`  （参考）JSON 0件・ハンドラのみ（内部/動的生成）         : ${deadIds.length} 種`);
p('');

p('==============================================================================');
p('【A】実装の穴＝live に居るのに engine のどこにも消費が無い（実行しても何も起きない）');
p('  ⚠ これが本命の worklist。1件ずつ原文照合して「機構実装」か「そもそも parser が誤って STUB を吐いている」かを判定する。');
p('==============================================================================');
for (const r of holeImpl.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))) {
  p(fmt(r));
  if (r.producers.length) p(`        生成: ${r.producers.slice(0, 2).map(x => `${x.file}:${x.line}`).join(' / ')}`);
}
p('');

p('==============================================================================');
p('【B】宣言型＝execStub ハンドラは無いが engine の別経路が id を読んでいる（実害なしの見込み・要目視）');
p('==============================================================================');
for (const r of declarative.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))) {
  p(fmt(r));
  p(`        消費: ${r.consumers.slice(0, 3).map(x => `${x.file}:${x.line}`).join(' / ')}${r.consumers.length > 3 ? ` …他${r.consumers.length - 3}箇所` : ''}`);
}
p('');

p('==============================================================================');
p('【C】表示だけの穴＝engine は動くが逆翻訳に英語 ID が出る（decompileEffects.ts に語彙を足す案件）');
p('  ※ 直し方＝`scripts/decompileEffects.ts` の `miscStubMap` に日本語文を足す（単発）か、');
p('     ハンドラ直前コメントを日本語説明にして `node scripts/genStubsMd.mjs` を回す（STUBS.md 経由で自動反映）。');
p('==============================================================================');
for (const r of holeDisplay.sort((a, b) => b.raw - a.raw || a.id.localeCompare(b.id))) {
  p(`  露出${String(r.raw).padStart(3)}箇所 (live ${r.count}件/${r.cards.length}枚)  ${r.id}  [${r.handler ?? 'engine別経路'}]`);
  p(`        カード: ${r.cards.slice(0, 6).join(', ')}${r.cards.length > 6 ? ` …他${r.cards.length - 6}枚` : ''}`);
  if (r.comment) p(`        既存コメント: ${r.comment.slice(0, 110)}`);
}
p('');

writeFileSync(join(root, 'docs/_census_stubs.txt'), out.join('\n') + '\n');
console.log(out.slice(0, 22).join('\n'));
console.log(`\n明細 → docs/_census_stubs.txt`);
