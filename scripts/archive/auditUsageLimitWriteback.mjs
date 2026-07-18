// usageLimit（《ターン1回/2回》）消費IDの書き戻し監査（2026-07-19・続き205・Opusタスク12(未確認)）
//
// 背景＝collectLrigGrowTriggers が usedIds を返さず書き戻し機構も無く《ターン1回》が実質ノーガードだった
// 構造的バグ（続き132-135で修正済）が、他のコレクタにも残っていないかを全数確認するために書いた。
// 結果＝**15コレクタ・全呼び出し箇所で書き戻しは実装済み＝新規の穴なし**（続き205で確認）。
//
// ⚠この監査を再実行するときの注意（最初の2版が偽陽性を量産した教訓）：
//  (1) 戻り値型の抽出は関数宣言の括弧対応を数えて厳密に行う。非貪欲な正規表現だと関数をまたいで
//      別関数の戻り値型を拾い、usedIds を返さないコレクタ（collectDeckTrashSelfTriggers 等）まで拾う。
//  (2) 書き戻しには**複数のイディオム**があり、actions_done への直接代入だけを探すと大量の偽陽性が出る：
//      useHost()/useGuest()（中央diff）・usePZ()（パワー0経路）・useRP()（配置resume）・useSU()（スペル使用）・
//      applyCoinPaidUsed()・usedByKey[] への蓄積・呼び出しから数十行離れた位置での一括永続化。
//  (3) 最終判断は必ず該当箇所を目視する。この種の近傍ヒューリスティックは当たりを弾くことも外すこともある。
//
// 使い方: node scripts/archive/auditUsageLimitWriteback.mjs
import fs from 'fs';
const tc = fs.readFileSync('src/engine/triggerCollect.ts', 'utf8');
const bs = fs.readFileSync('src/screens/BattleScreen.tsx', 'utf8');
const lines = tc.split('\n');

// 1) 各 export function の「宣言直後から本体開始まで」を正確に取り、戻り値型に used*Ids を含むものだけ拾う。
//    （旧スクリプトは非貪欲マッチが関数をまたいで別関数の戻り値型を拾い、偽陽性を量産した）
const collectors = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^export function (collect\w+)\s*\(/);
  if (!m) continue;
  // 宣言部＝この行から、括弧の対応が閉じて `{` で本体が始まるまで
  let decl = '', depth = 0, started = false;
  for (let j = i; j < Math.min(i + 25, lines.length); j++) {
    decl += lines[j] + '\n';
    for (const ch of lines[j]) {
      if (ch === '(') { depth++; started = true; }
      else if (ch === ')') depth--;
    }
    if (started && depth === 0 && /\{\s*$/.test(lines[j])) break;
  }
  const ret = decl.slice(decl.lastIndexOf(')') + 1);
  if (/used(Host|Guest)?Ids/.test(ret)) collectors.push({ name: m[1], line: i + 1, ret: ret.replace(/\s+/g, ' ').trim().slice(0, 90) });
}
console.log('=== usageLimit の消費IDを返すコレクタ:', collectors.length, '===');
for (const c of collectors) console.log(`  ${c.name}  (triggerCollect.ts:${c.line})`);
console.log();

// 2) 呼び出し箇所ごとに、戻り値が永続化経路（useHost/useGuest/usePZ/applyCoinPaidUsed/actions_done）へ渡っているか
// 書き戻しイディオムの一覧（中央diff/パワー0/配置resume/スペル使用/ターン系の各アキュムレータを含む）
const PERSIST = /useHost\(|useGuest\(|usePZ\(|useRP\(|useSU\(|foldTurnUsed\(|usedByKey|applyCoinPaidUsed|actions_done|[Uu]sedHostIds\s*=|[Uu]sedGuestIds\s*=|[Uu]sedIds\s*=|[Uu]sedMine|[Uu]sedOpp/;
let problems = 0;
for (const c of collectors) {
  const callRe = new RegExp(`\\b${c.name}\\s*\\(`, 'g');
  let cm;
  while ((cm = callRe.exec(bs))) {
    const line = bs.slice(0, cm.index).split('\n').length;
    const decl = /const\s+\w+\s*=\s*\(/.test(bs.slice(Math.max(0, cm.index - 120), cm.index));
    if (decl) continue;                       // ラッパ定義そのものは除外
    const near = bs.slice(cm.index, cm.index + 1200);
    if (PERSIST.test(near)) continue;
    problems++;
    console.log(`⚠ ${c.name}  BattleScreen.tsx:${line}`);
    console.log('   ' + bs.split('\n')[line - 1].trim().slice(0, 170));
    console.log('   ' + (bs.split('\n')[line] ?? '').trim().slice(0, 170));
  }
}
console.log(`\n=== 永続化が見当たらない呼び出し: ${problems} 件 ===`);
