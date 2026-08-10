/**
 * goldenTypeCoverage.ts — DSLアクション型の golden カバレッジ計器（PLAN §6.4「golden の型網羅」）
 *
 * `EffectAction` union の各メンバが持つ `type: 'FOO'` リテラルを列挙し、
 * **`scripts/goldenTest.ts` の中にその型リテラルが1度も現れない型**＝未カバーとして報告する。
 *
 * ⚠これは「型ごとに1テストある」ことの近似（リテラル出現の有無）であって、テストの中身は見ない。
 *   それでも **「新しいアクション型を足したのに golden を1件も書いていない」は確実に捕まる**＝
 *   型が増えるたびに無検証の実装が積み上がるのを防ぐのが目的。
 *
 * 使い方: `npm run census:goldentypes`（ゲートではない＝exit 0。数は PLAN §4 恒久指標に載せる）
 * 出力: 未カバー型を live JSON の出現数の多い順に並べる（＝実カードで使われている型ほど優先度が高い）。
 */
import fs from 'fs';
import { join } from 'path';

const root = process.cwd();
const effSrc = fs.readFileSync(join(root, 'src/types/effects.ts'), 'utf8');

// ── ① EffectAction union のメンバ型名 ──
const unionSrc = effSrc.slice(effSrc.indexOf('export type EffectAction ='));
const members: string[] = [];
for (const line of unionSrc.split(/\r?\n/).slice(1)) {
  const m = line.match(/^\s*\|\s*([A-Za-z]+Action)\s*$/);
  if (m) { members.push(m[1]); continue; }
  if (line.trim() && !line.trim().startsWith('//')) break;
}

// ── ② 各メンバの type リテラル ──
const typeOf = new Map<string, string>();
const unresolved: string[] = [];
for (const name of members) {
  const at = effSrc.search(new RegExp('(?:interface|type) ' + name + '\\b'));
  if (at < 0) { unresolved.push(name); continue; }
  const hit = effSrc.slice(at, at + 900).match(/type:\s*'([A-Z_0-9]+)'/);
  if (hit) typeOf.set(name, hit[1]); else unresolved.push(name);
}
const allTypes = [...new Set(typeOf.values())].sort();

// ── ③ golden に現れる型名 ──
// ⚠**`type: 'FOO'` リテラルだけを数えてはいけない**＝この計器の最初の版がそうで、
//   「テスト名やコメントで型名を書き、実カードを live effectsMap から引いて実行する」形の既存テスト
//   （例: `test('POWER_MODIFY_PER_ENERGY: エナ枚数×deltaでCONTパワー加算（WX09-019）')`）を
//   **全部「未カバー」と誤報**した（39件中の大半）。CONTINUOUS 専用型は合成 action を書かず live を引くのが
//   正しい書き方なので、リテラル一致では構造的に取りこぼす。**型名がどこかに現れれば覆われている**とみなす。
// 型ごとに単語境界つきで引く（`UP` のような短い型名を全トークン抽出で扱うと `UPKEEP` 等と衝突する）。
const golden = fs.readFileSync(join(root, 'scripts/goldenTest.ts'), 'utf8');
const isCovered = (t: string): boolean => new RegExp(`\\b${t}\\b`).test(golden);

// ── ④ live JSON の出現数（優先度づけ用） ──
const live: Record<string, unknown[]> = {};
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  Object.assign(live, JSON.parse(fs.readFileSync(join(root, 'public/data', f), 'utf8')));
}
const liveCount = new Map<string, number>();
const liveExample = new Map<string, string>();
const walk = (node: unknown, card: string, effectId: string): void => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, card, effectId); return; }
  const obj = node as Record<string, unknown>;
  if (typeof obj.type === 'string' && /^[A-Z_0-9]+$/.test(obj.type)) {
    liveCount.set(obj.type, (liveCount.get(obj.type) ?? 0) + 1);
    if (!liveExample.has(obj.type)) liveExample.set(obj.type, `${card}/${effectId}`);
  }
  for (const v of Object.values(obj)) walk(v, card, effectId);
};
for (const [card, effects] of Object.entries(live)) {
  for (const e of (effects ?? []) as Array<{ action?: unknown; effectId?: string }>) {
    walk(e.action, card, e.effectId ?? '?');
  }
}

const missing = allTypes.filter(t => !covered.has(t));
const missingLive = missing.filter(t => (liveCount.get(t) ?? 0) > 0);

console.log('===== golden 型カバレッジ =====');
console.log(`EffectAction 型: ${allTypes.length} ／ golden カバー: ${allTypes.length - missing.length} ／ 未カバー: ${missing.length}（うち live 出現あり ${missingLive.length}）`);
if (unresolved.length > 0) {
  console.log(`⚠ type リテラルを解決できない union メンバ: ${unresolved.join(', ')}（STUB 等はここに出るのが正常）`);
}
if (missing.length > 0) {
  console.log('\nlive件数  型                                      代表カード');
  for (const t of [...missing].sort((a, b) => (liveCount.get(b) ?? 0) - (liveCount.get(a) ?? 0))) {
    console.log(String(liveCount.get(t) ?? 0).padStart(8), ' ', t.padEnd(38), liveExample.get(t) ?? '(live 0件)');
  }
}
