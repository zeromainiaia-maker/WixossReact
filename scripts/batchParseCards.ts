/**
 * バッチカード効果パーサー
 * Anthropic SDK を直接使って効果テキストをWEL JSONに変換する
 *
 * 使用法:
 *   tsx scripts/batchParseCards.ts --sheet Sheet1 --batch-size 12 --dry-run
 *   tsx scripts/batchParseCards.ts --sheet Sheet1 --batch-size 12
 *   tsx scripts/batchParseCards.ts --sheet Sheet1 --from WD01-001 --to WD01-050
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');


// ===== CLI引数パース =====
const args = process.argv.slice(2);
const getArg = (name: string, def = '') => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? (args[idx + 1] ?? def) : def;
};
const hasFlag = (name: string) => args.includes(`--${name}`);

const SHEET    = getArg('sheet', 'Sheet1');
const BATCH    = parseInt(getArg('batch-size', '12'));
const FROM_NUM = getArg('from');
const TO_NUM   = getArg('to');
const DRY_RUN  = hasFlag('dry-run');
const MODEL    = getArg('model', 'claude-sonnet-4-6');

// ===== 出力ディレクトリ =====
const OUT_DIR = join(ROOT, 'public/data/wel');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
const OUT_FILE = join(OUT_DIR, `${SHEET}.json`);

// ===== CSVを読み込む =====
const csvPath = join(ROOT, `public/data/CardData_${SHEET}.csv`);
const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
const { data: rows } = Papa.parse<Record<string, string>>(csvText, {
  header: true, skipEmptyLines: true,
});

// 効果テキストがあるカードだけ抽出
let cards = rows.filter(r => {
  const eff = r.EffectText?.trim();
  const bst = r.BurstText?.trim();
  return (eff && eff !== '-') || (bst && bst !== '-');
});

// 範囲フィルター（文字列比較: WD01-001 形式はゼロパディングで辞書順が一致）
if (FROM_NUM) cards = cards.filter(c => c.CardNum >= FROM_NUM);
if (TO_NUM)   cards = cards.filter(c => c.CardNum <= TO_NUM);

console.log(`対象: ${cards.length}枚 / バッチ: ${BATCH}枚 / モデル: ${MODEL}`);
if (DRY_RUN) console.log('[DRY RUN] 実際の呼び出しはしません');

// ===== プロンプトテンプレート =====
const SYSTEM_PROMPT = `あなたはWixoss TCGの効果テキストを構造化JSONに変換する専門パーサーです。

## EffectAction 型定義（出力形式）

### アクション
\`\`\`
draw: N                                    # N枚引く
discard: { count, filter? }                # 手札を捨てる（owner省略=self）
banish: { owner, count, filter? }          # バニッシュ（エナへ）
bounce: { owner, count, filter? }          # 手札に戻す
down:   { owner, count, filter? }          # ダウン
up:     { owner, type? }                   # アップ（type: signi|lrig）
power:  { target, delta, duration? }       # パワー修正（duration: turn|perm）
trash:  { from, count, filter? }           # 指定ゾーンからトラッシュへ
energy: { from, count }                    # エナチャージ（from: deck|hand|field）
add_hand: { from, count, filter? }         # 手札に加える
search: { filter, dest, count?, reveal? }  # デッキサーチ
reveal: { from, count, filter? }           # 公開
freeze: { owner, count, filter? }          # 凍結
grant_keyword: { target, word, duration? } # キーワード付与
protect: { filter, from[], owner? }        # 効果耐性（CONTINUOUS用）
cost_reduce: { per_signi?, flat?, filter? }# コスト軽減
move: { from, to, count, order? }          # ゾーン間移動
\`\`\`

### 複合構造
\`\`\`
seq: [action, ...]      # 順番に実行（SEQUENCE）
opt: action             # してもよい（省略可能）
cond: { if, then, else? }  # 条件付き
choose: { count, options: [action, ...] }  # N択
\`\`\`

### ターゲット省略記法
\`\`\`
opp_signi_1   → { owner: "opp", count: 1 }
opp_signi_all → { owner: "opp", count: "all" }
self_signi_1  → { owner: "self", count: 1 }
self_lrig     → { owner: "self", type: "lrig" }
\`\`\`

### フィルター
\`\`\`
filter:
  class: "クラス名"           # ＜クラス＞
  color: 白|赤|青|緑|黒
  level_gte/lte: N
  power_lte/gte: N
  type: signi|lrig|spell|arts|key
  name_has: "文字列"          # カード名に含む
  isDown: true
  hasCross: true              # クロス状態
\`\`\`

### 条件（cond.if）
\`\`\`
field_gte/lte: { owner, val, filter? }   # フィールド体数
hand_gte/lte:  { owner, val }            # 手札枚数
life_gte/lte:  { owner, val }            # ライフクロス枚数
energy_gte/lte: { owner, val }           # エナ枚数
has_signi: { owner, filter }             # フィールドに特定シグニ
trash_has: { owner, filter }             # トラッシュに特定カード
lrig_name_has: "文字列"                  # ルリグ名に含む
lrig_level_gte/lte: { val }              # センタールリグレベル
opp_used_arts: true                      # 対戦相手がアーツ使用済み
\`\`\`

### effectType
\`\`\`
AUTO       → 【自】（trigger必須: on_play|on_attack|on_banish|on_trash|on_turn_start|on_turn_end|on_lrig_attack|on_heaven|on_cross）
ACTIVATED  → 【起】（cost必須）
CONTINUOUS → 【常】
LIFE_BURST → ライフバースト
\`\`\`

### cost（ACTIVATED）
\`\`\`
cost:
  energy: [白, 白, 無]    # エナコスト
  discard: 1               # 手札を捨てる
  down_self: true          # 自身をダウン
  banish_self: true        # 自身をバニッシュ
  exceed: N                # エクシード
\`\`\`

### 重要ルール
1. 【常】効果は CONTINUOUS。activeCondition（発動条件）を持てる
2. 「てもよい」→ opt: でラップ
3. 「そうした場合」「この方法で」は前のアクション成功を前提とした seq の続き
4. 複数条件が「それが3枚以上の場合...それが4枚以上の場合...」と並ぶ場合は独立した seq（累積発動）
5. LifeBurstがある場合は effectType: "LIFE_BURST" のエントリを別途追加
6. 解析不能な複雑効果は { "stub": "REASON_TEXT" } を使う
7. グロウ条件（【グロウ】〜）は activeCondition として記録

## 出力形式
カード番号をキー、効果配列を値とするJSONオブジェクト。
説明文は不要。JSONのみ出力。

## 変換例
入力: CardNum=WX01-001, EffectText=【自】：このシグニがアタックしたとき、カードを1枚引く。
出力:
{
  "WX01-001": [
    { "effectType": "AUTO", "timing": ["on_attack"], "action": { "draw": 1 } }
  ]
}
`;

function buildCardText(card: Record<string, string>): string {
  const parts: string[] = [];
  parts.push(`CardNum: ${card.CardNum}`);
  parts.push(`CardName: ${card.CardName}`);
  parts.push(`Type: ${card.Type}`);
  if (card.CardClass && card.CardClass !== '-') parts.push(`CardClass: ${card.CardClass}`);
  if (card.Color    && card.Color    !== '-') parts.push(`Color: ${card.Color}`);
  if (card.EffectText && card.EffectText !== '-') parts.push(`EffectText: ${card.EffectText}`);
  if (card.BurstText  && card.BurstText  !== '-') parts.push(`BurstText: ${card.BurstText}`);
  return parts.join('\n');
}

function callClaude(prompt: string): string {
  // プロンプトを一時ファイル経由で渡す（Windows のシェル引用符問題を完全回避）
  const tmpFile = join(tmpdir(), `bpc_${process.pid}_${Date.now()}.txt`);
  try {
    writeFileSync(tmpFile, prompt, 'utf-8');
    const pipeCmd = process.platform === 'win32'
      ? `type "${tmpFile}" | claude -p --model ${MODEL}`
      : `cat "${tmpFile}" | claude -p --model ${MODEL}`;
    return execSync(pipeCmd, { encoding: 'utf-8', timeout: 120_000 });
  } catch (e: unknown) {
    const err = e as { stdout?: string; message?: string };
    return err.stdout ?? err.message ?? 'ERROR';
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

function extractJSON(raw: string): Record<string, unknown> {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try { return JSON.parse(m[0]); }
  catch { return { _parseError: raw.slice(0, 200) }; }
}

// ===== バッチ処理 =====
const batches: Record<string, string>[][] = [];
for (let i = 0; i < cards.length; i += BATCH) {
  batches.push(cards.slice(i, i + BATCH));
}

console.log(`バッチ数: ${batches.length}`);

// 既存結果を読み込む（中断再開用）
let result: Record<string, unknown> = {};
if (existsSync(OUT_FILE)) {
  result = JSON.parse(readFileSync(OUT_FILE, 'utf-8'));
  console.log(`既存結果: ${Object.keys(result).length}枚 読み込み済み`);
}

let processed = 0;
let skipped   = 0;
let errors    = 0;

for (let bi = 0; bi < batches.length; bi++) {
  const batch = batches[bi];

  // 全カードが既に処理済みならスキップ
  const todo = batch.filter(c => !(c.CardNum in result));
  if (todo.length === 0) {
    skipped += batch.length;
    process.stdout.write(`\rバッチ ${bi+1}/${batches.length} スキップ (全処理済み)`);
    continue;
  }

  const cardTexts = todo.map(buildCardText).join('\n\n---\n\n');

  if (DRY_RUN) {
    console.log(`[DRY RUN] バッチ ${bi+1}: ${todo.map(c=>c.CardNum).join(', ')}`);
    processed += todo.length;
    continue;
  }

  process.stdout.write(`\rバッチ ${bi+1}/${batches.length} 処理中... (${todo.map(c=>c.CardNum)[0]}〜)`);

  const prompt = `${SYSTEM_PROMPT}\n\n## 変換するカード（${todo.length}枚）\n\n${cardTexts}`;
  const raw = callClaude(prompt);
  const parsed = extractJSON(raw);

  if (Object.keys(parsed).length === 0) {
    console.log(`\n  警告: バッチ ${bi+1} でJSONを取得できませんでした`);
    errors++;
  } else {
    Object.assign(result, parsed);
    processed += Object.keys(parsed).length;
    // 都度保存（中断に対応）
    writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
  }

  // レート制限対策
  if (bi < batches.length - 1) {
    await new Promise(r => setTimeout(r, 1000));
  }
}

console.log(`\n\n完了: ${processed}枚処理 / ${skipped}枚スキップ / ${errors}バッチエラー`);
console.log(`出力: ${OUT_FILE}`);
