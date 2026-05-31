# WixossReactClone — Claude Code 引き継ぎメモ

## プロジェクト概要
WixossカードゲームのReactクローン実装。カード効果をWEL（Wixoss Effect Language）JSONに変換する「wel化」作業が進行中。

---

## wel化作業の引き継ぎ（zerom向け）

### 現在の進捗
- **Sheet1.json** の WX01 系まで完了（140エントリ）
- 次は **WX02** から順番に処理する
- 出力先: `public/data/wel/Sheet1.json`
- ソースCSV: `public/data/CardData_Sheet1.csv`

### 未処理カードの確認方法
```bash
node -e "
const fs = require('fs');
const json = require('./public/data/wel/Sheet1.json');
const csv = fs.readFileSync('./public/data/CardData_Sheet1.csv','utf8');
const lines = csv.split('\n').slice(1);
const missing = lines.filter(l => {
  const cols = l.split(',');
  const num = cols[0];
  if (!num || !num.startsWith('WX02')) return false; // ← ここを変える
  const eff = cols[18]?.trim();
  const bst = cols[19]?.trim();
  return (eff && eff !== '-') || (bst && bst !== '-');
}).filter(l => !json[l.split(',')[0]]);
missing.forEach(l => {
  const c = l.split(',');
  console.log(c[0], c[1], '|', c[3], '|', c[18]?.slice(0,60));
});
console.log('未処理:', missing.length);
"
```

### 処理の進め方（Claude Code で直接解析する）
**`claude -p` は使わない**（トークン大量消費のため）。
Claude Code の会話内で効果テキストを解析し、`.mjs` スクリプトを書いて `node` で実行する。

#### 手順
1. 未処理カードのEffectText/BurstTextを確認（上記コマンド）
2. Claude Code が効果を解析してエントリを作成
3. スクリプトファイル（`scripts/addWXXX.mjs`）に書いて実行
4. `node scripts/addWXXX.mjs`
5. コミット＆プッシュ

#### スクリプトのテンプレート
```js
import { readFileSync, writeFileSync } from 'fs';
const json = JSON.parse(readFileSync('./public/data/wel/Sheet1.json', 'utf8'));
const csv = readFileSync('./public/data/CardData_Sheet1.csv', 'utf8');

const newEntries = {
  'WXXX-YYY': [ /* ... */ ],
};

const dupes = Object.keys(newEntries).filter(k => json[k]);
if (dupes.length) console.log('WARNING duplicates:', dupes);
Object.assign(json, newEntries);

const csvOrder = csv.split('\n').slice(1).map(l => l.split(',')[0]).filter(Boolean);
const sorted = {};
for (const key of csvOrder) { if (json[key] !== undefined) sorted[key] = json[key]; }
for (const key of Object.keys(json)) { if (sorted[key] === undefined) sorted[key] = json[key]; }

writeFileSync('./public/data/wel/Sheet1.json', JSON.stringify(sorted, null, 2), 'utf8');
console.log('完了:', Object.keys(newEntries).length, '枚 / 合計:', Object.keys(sorted).filter(k=>k!=='_parseError').length);
```

---

## WEL スキーマ（効果解析の判断基準）

### effectType 一覧
| effectType | 意味 | 備考 |
|---|---|---|
| `AUTO` | 【自】 | `trigger` 必須 |
| `ACTIVATED` | 【起】 | `cost` 必須 |
| `CONTINUOUS` | 【常】 | `activeCondition` 任意 |
| `LIFE_BURST` | ライフバースト | |
| `SPELL` | スペル使用時効果 | |
| `ARTS` | アーツ使用時効果 | |
| `KEYWORD` | キーワード能力 | `word` 必須 |

### trigger（AUTO用）
```
on_play          → 【出】/ 場に出たとき
on_attack        → アタックしたとき
on_banish        → バニッシュされたとき
on_trash         → トラッシュに置かれたとき
on_turn_start    → ターン開始時
on_turn_end      → ターン終了時
on_lrig_attack   → ルリグがアタックしたとき
on_heaven        → ヘブン条件達成時
on_cross         → クロス時
on_spell_cast    → スペル使用時（拡張）
```
`triggerFilter: { owner, color, ... }` でトリガー対象を絞る（例: 赤シグニのみ）

### cost（ACTIVATED用）
```js
cost: {
  energy: ['白', '赤'],  // エナコスト（色の配列）
  discard: 1,            // 手札を捨てる枚数
  down_self: true,       // 自身をダウン（《ダウン》）
  banish_self: true,     // 自身をバニッシュ
  exceed: N,             // エクシード
}
```

### activeCondition（CONTINUOUS用）
```js
// 既存
during_turn: 'self' | 'opp'          // 自/相手ターン中
has_signi: { owner, filter }
hand_gte/lte: { owner, val }
life_gte/lte: { owner, val }
energy_gte/lte: { owner, val }
field_gte/lte: { owner, val, filter? }
lrig_name_has: "文字列"
lrig_level_gte/lte: { val }

// 拡張（本プロジェクトで追加）
hand_diff_gte: { val: N }    // 自手札 - 相手手札 >= N
energy_diff_gte: { val: N }  // 自エナ - 相手エナ >= N
```

### アクション一覧
```js
draw: N
discard: { owner?, count, filter?, random? }
banish: { owner, count, filter? }
bounce: { owner, count, filter? }
down:   { owner, count, filter? }
up:     { owner, count?, type? }
freeze: { owner, count, filter? }
power:  { target, delta?, set?, duration }   // set は拡張（基本パワーをXにする）
trash:  { from, count, filter? }
energy: { from, count }                      // エナチャージ
add_hand: { from, count, filter? }
search: { filter, dest, count?, reveal? }
reveal: { from, count, filter? }
grant_keyword: { target, word, duration? }
cost_reduce: { per_signi?, flat?, filter? }
move: { from, to, count, filter?, order? }
stub: "REASON_TEXT"                          // 解析不能な複雑効果
```

### power.target の書き方
```
"self"            → このシグニ自身
"self_signi_all"  → 自分の全シグニ
"opp_signi_1"     → 相手シグニ1体
"self_lrig"       → 自ルリグ
"trigger_signi"   → トリガーとなったシグニ（拡張）
"self_energy_all" → 自エナ全カード（grant_keyword用、拡張）
```

### filter の書き方
```js
filter: {
  type: 'signi' | 'lrig' | 'spell' | 'arts' | 'key',
  color: '白' | '赤' | '青' | '緑' | '黒',
  level_lte: N,
  level_gte: N,
  power_lte: N,
  power_gte: N,
  class: "クラス名",     // ＜クラス＞
  name_has: "文字列",
  name_not: "文字列",    // 拡張: 名前に含まない
  isDown: true,
  hasCross: true,
}
```

### 複合構造
```js
seq: [action1, action2]         // 順番に実行
opt: action                     // してもよい
cond: { if: condition, then: action, else?: action }
choose: { count, options: [...] }
```

### キーワード能力（word の値）
```
guard           → 【ガード】
multi_energy    → 【マルチエナ】
double_crush    → 【ダブルクラッシュ】
lancer          → 【ランサー】
shadow          → 【シャドウ】
assassin        → 【アサシン】
```

---

## stub にする基準
以下は現状 WEL で表現できないため `stub` を使う：
- ライフクロスのクラッシュ（`crash` アクション未定義）
- ライフクロスへの追加（`move to: 'life'` で暫定表現中）
- 複雑な置換効果（「〜代わりに〜」）
- ルリグへの能力付与
- デッキトップ確認→条件付きプレイ（`DECK_TOP_PLAY` stub）
- デッキフィルター系（`DECK_FILTER` stub）

---

## 注意事項
- **CSV の順番を必ず維持する**（スクリプト内の `sorted` ロジックで対応済み）
- **効果なしカード（EffectText=`-`, BurstText=`-`）はwelに追加しない**
- `_parseError` キーは末尾に残す
- `scripts/addWX01.mjs` が処理パターンの参考になる
