// シグニ状態キーワードバッジ算出（getSigniStatusKeywords）の検証ハーネス（tsx 実行）。
import { getSigniStatusKeywords } from '../src/components/BoardComponents';
import type { CardData } from '../src/types';

let pass = 0, fail = 0;
function eq(name: string, got: string[], want: string[]) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
}
const card = (num: string, text: string): CardData => ({ CardNum: num, CardName: num, Color: '', Level: '', CardClass: '', Type: 'シグニ', EffectText: text } as CardData);

const cards: CardData[] = [
  card('A', '【ランサー】【ダブルクラッシュ】このシグニが…'),
  card('B', 'テキストなし'),
  card('C', '【Sランサー】このシグニ…'),
  card('D', '【トリプルクラッシュ】【ダブルクラッシュ】'),
  card('E', '【アサシン】【シャドウ】'),
];

console.log('\n[状態キーワードバッジ算出]');
eq('固有ランサー+ダブルクラッシュ', getSigniStatusKeywords(['A'], cards), ['ランサー', 'ダブルクラッシュ']);
eq('付与シャドウのみ', getSigniStatusKeywords(['B'], cards, { B: ['シャドウ'] }), ['シャドウ']);
eq('固有Sランサー→ランサーは出さない', getSigniStatusKeywords(['C'], cards), ['Sランサー']);
eq('Sランサー固有+ランサー付与でも重複なし', getSigniStatusKeywords(['C'], cards, { C: ['ランサー'] }), ['Sランサー']);
eq('トリプル優先でダブル除外', getSigniStatusKeywords(['D'], cards), ['トリプルクラッシュ']);
eq('アサシン+シャドウ（表示順）', getSigniStatusKeywords(['E'], cards), ['アサシン', 'シャドウ']);
eq('能力消去中は空', getSigniStatusKeywords(['A'], cards, undefined, ['A']), []);
eq('キーワードなしは空', getSigniStatusKeywords(['B'], cards), []);
eq('空スタックは空', getSigniStatusKeywords(null, cards), []);
eq('スタックのトップで判定（下にA、上にB）', getSigniStatusKeywords(['A', 'B'], cards, { B: ['アサシン'] }), ['アサシン']);

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
