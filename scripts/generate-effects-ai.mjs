/**
 * Claude API（Haiku）を使ってカード効果テキストをDSL JSONに変換するスクリプト。
 *
 * 使い方:
 *   node scripts/generate-effects-ai.mjs [--test] [--all] [--resume]
 *
 * オプション:
 *   --test    先頭10枚だけ処理して精度確認
 *   --all     全カードを処理（デフォルト: PARTIAL/STUB含む未完成カードのみ）
 *   --resume  前回の進捗から再開（scripts/effects-ai-progress.json を使用）
 *
 * 環境変数:
 *   ANTHROPIC_API_KEY または .env.local の ANTHROPIC_API_KEY
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// .env.local を読み込む
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('エラー: ANTHROPIC_API_KEY が設定されていません。');
  console.error('.env.local に ANTHROPIC_API_KEY=sk-ant-... を追加してください。');
  process.exit(1);
}

const client = new Anthropic({ apiKey: API_KEY });

const IS_TEST   = process.argv.includes('--test');
const IS_ALL    = process.argv.includes('--all');
const IS_RESUME = process.argv.includes('--resume');

const CSV_FILES = [
  'CardData_Sheet1.csv', 'CardData_Sheet2.csv', 'CardData_Sheet3.csv',
  'CardData_Sheet4.csv', 'CardData_Sheet5.csv', 'CardData_Sheet6.csv',
  'CardData_Sheet7.csv', 'CardData_Sheet8.csv', 'CardData_Sheet9.csv',
  'CardData_Sheet10.csv', 'CardData_TK.csv',
];

const EFFECTS_JSON   = path.join(ROOT, 'public/data/effects.json');
const PROGRESS_FILE  = path.join(__dirname, 'effects-ai-progress.json');
const BATCH_SIZE     = 5;   // 1リクエストあたりのカード数
const CONCURRENCY    = 3;   // 並列リクエスト数
const DELAY_MS       = 300; // リクエスト間の待機

// ────────────────────────────────────────────────
// CSV読み込み
// ────────────────────────────────────────────────
function loadAllCards() {
  const cards = [];
  for (const file of CSV_FILES) {
    const fp = path.join(ROOT, 'public/data', file);
    if (!fs.existsSync(fp)) continue;
    const lines = fs.readFileSync(fp, 'utf-8').replace(/^﻿/, '').split('\n');
    const headers = lines[0].split(',');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(',');
      const obj = {};
      headers.forEach((h, idx) => obj[h.trim()] = (cols[idx] ?? '').trim());
      if (obj.CardNum) cards.push(obj);
    }
  }
  return cards;
}

// ────────────────────────────────────────────────
// 処理対象の絞り込み
// ────────────────────────────────────────────────
function needsReprocess(cardNum, existingEffects) {
  if (!existingEffects.has(cardNum)) return true;
  const str = JSON.stringify(existingEffects.get(cardNum));
  return str.includes('"STUB"') || str.includes('"PARTIAL"') || str.includes('"UNKNOWN"');
}

// ────────────────────────────────────────────────
// System Prompt
// ────────────────────────────────────────────────
const SYSTEM_PROMPT = `あなたはWIXOSSカードゲームの効果テキストをJSON DSLに変換するシステムです。

## 効果タイプ（effectType）の判定
- 【常】で始まる → CONTINUOUS（常時効果）
- 【出】で始まる → AUTO、timing: ["ON_PLAY"]
- 【自】で始まる → AUTO、timingはテキストから判定
  - 「このシグニがアタックしたとき」→ ["ON_ATTACK_SIGNI"]
  - 「ターン終了時」→ ["ON_TURN_END"]
  - 「バニッシュされたとき」→ ["ON_BANISH"]
  - 「ターン開始時」→ ["ON_TURN_START"]
  - 「対戦相手がアーツを使用したとき」→ ["ON_OPP_ARTS_USE"]
- 【起】で始まる → ACTIVATED、timing: ["MAIN"]
- BurstText → LIFE_BURST、timing: ["ON_LIFE_BURST"]
- アーツ・スペルのEffectText → ACTIVATED

## コスト解析（【起】の「：」前）
- 《色》×N → energy: [{color:"白"|"赤"|"青"|"緑"|"黒"|"無", count:N}]
- 「手札を1枚捨てる」→ discard: 1
- 《ダウン》→ down_self: true
- 「このシグニを場からトラッシュ」→ banish_self: true
- 「エクシードN」→ exceed: N

## 使用制限
- 《ターン１回》→ usageLimit: "once_per_turn"
- 《ゲームに１回》→ usageLimit: "once_per_game"

## アクションタイプ一覧

DRAW: カードを引く
{"type":"DRAW","owner":"self","count":N}

BANISH: シグニをバニッシュする
{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":N,"filter":{...}}}

BOUNCE: 手札に戻す
{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":N}}

TRASH: 指定カードをトラッシュに置く
{"type":"TRASH","target":{"type":"SIGNI"|"HAND_CARD","owner":"self"|"opponent","count":N}}

POWER_MODIFY: パワーを増減（ターン終了時まで or 常時）
{"type":"POWER_MODIFY","target":{...},"delta":2000}  ※負=弱体化

POWER_SET: パワーをN固定
{"type":"POWER_SET","target":{...},"value":15000}

ENERGY_CHARGE_FROM_DECK: エナチャージN（デッキ上からN枚エナへ）
{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":N}

ENERGY_CHARGE: 手札やトラッシュを選んでエナへ
{"type":"ENERGY_CHARGE","target":{"type":"HAND_CARD"|"TRASH_CARD","owner":"self","count":N}}

LIFE_CRASH: ライフクロスをクラッシュ
{"type":"LIFE_CRASH","owner":"opponent","count":N,"triggerBurst":true}

TRANSFER_TO_HAND: トラッシュ/エナ/ライフクロス → 手札
{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD"|"ENERGY_CARD"|"LRIG_TRASH_CARD","owner":"self","count":N,"filter":{...}}}

ADD_TO_FIELD: コストなしで場に出す
{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD"|"HAND_CARD"|"DECK_CARD","owner":"self","count":1,"filter":{...}}}

ADD_TO_LIFE: デッキ上からライフクロスに加える
{"type":"ADD_TO_LIFE","owner":"self","count":N,"fromTop":true}

FREEZE: 凍結付与（ダウン状態+次ターンアップ不可）
{"type":"FREEZE","target":{"type":"SIGNI","owner":"opponent","count":N}}

DOWN: ダウン
{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":N}}

UP: アップ
{"type":"UP","target":{"type":"SIGNI","owner":"self","count":N}}

GRANT_KEYWORD: キーワード能力付与
{"type":"GRANT_KEYWORD","target":{...},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}
keywords: ランサー、ダブルクラッシュ、トリプルクラッシュ、アサシン、シャドウ、バニッシュ耐性、チャーム耐性、ガード、マルチエナ

SEARCH: デッキサーチ
{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","level":1},"maxCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}

REVEAL_AND_PICK: デッキ上N枚を公開してM枚を手札に（残りはデッキ下/上へ）
{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ"},"pickCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom"}}

LOOK_AND_REORDER: デッキ上N枚を見て順番を決める
{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":3,"private":true,"reorder":true,"canTrash":false,"destination":{"location":"deck","owner":"self","position":"any"}}

TRANSFER_TO_DECK: デッキに戻す（バウンス先がデッキの場合）
{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1},"shuffle":true}

GRANT_PROTECTION: 効果耐性付与
{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":"ALL"},"from":["ルリグ","シグニ","スペル","アーツ"],"sourceOwner":"opponent","duration":"PERMANENT"}

REMOVE_ABILITIES: 能力消去（ターン終了時まで）
{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1},"duration":"UNTIL_END_OF_TURN"}

BLOCK_ACTION: アクションを封じる
{"type":"BLOCK_ACTION","target":{"type":"SIGNI","owner":"opponent","count":1},"actionId":"ATTACK","until":"PERMANENT"}

ATTACH_CHARM: チャーム付与（シグニに裏向きカードを付ける）
{"type":"ATTACH_CHARM","charm":{"type":"HAND_CARD","owner":"self","count":1},"to":{"type":"SIGNI","owner":"opponent","count":1}}

SEQUENCE: 複数アクションを順次実行（2つ以上のアクションがある場合は必ずSEQUENCEで包む）
{"type":"SEQUENCE","steps":[action1, action2, ...]}

CHOOSE: プレイヤーが選択肢から選ぶ（①②のような選択）
{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"opt1","label":"①..","action":{...}},{"choiceId":"opt2","label":"②..","action":{...}}]}

CONDITIONAL: 条件分岐
{"type":"CONDITIONAL","condition":{"type":"FIELD_COUNT","owner":"self","operator":"gte","value":3},"then":{...},"else"?:{...}}
condition types: FIELD_COUNT, HAND_COUNT, LIFE_COUNT, ENERGY_COUNT, HAS_CARD_IN_FIELD, IS_MY_TURN, IS_OPPONENT_TURN, DECK_TOP_MATCHES
operators: eq, neq, gte, lte, gt, lt

REARRANGE_SIGNI: シグニゾーンを並び替える
{"type":"REARRANGE_SIGNI","target":{"type":"SIGNI","owner":"opponent","count":"ALL"}}

GAIN_COIN: コインを得る
{"type":"GAIN_COIN","owner":"self","count":N}

FORCE_SIGNI_ATTACK: シグニを強制アタックさせる
{"type":"FORCE_SIGNI_ATTACK","target":{"type":"SIGNI","owner":"opponent","count":1}}

DISCARD_BOTH: 両者手札を指定枚数捨てる
{"type":"DISCARD_BOTH","count":N}

REMOVE_CHARM: チャームを外す
{"type":"REMOVE_CHARM","target":{"type":"SIGNI","owner":"opponent","count":N}}

PLACE_VIRUS: ウィルスを置く
{"type":"PLACE_VIRUS","zone_index":0|1|2}  ※ゾーン指定なしは{"zone_index":-1}

COUNTER_SPELL: スペル/アーツを打ち消す
{"type":"COUNTER_SPELL"}

COST_REDUCTION: コスト減少（次のカード使用時）
{"type":"COST_REDUCTION","targetCardType":"スペル"|"アーツ"|"ルリグ","reduction":[{color:"無",count:1}],"duration":"UNTIL_END_OF_TURN"}

POWER_MODIFY_PER_FIELD: フィールドシグニ数に比例したパワー
{"type":"POWER_MODIFY_PER_FIELD","target":{...},"deltaPerUnit":1000,"countFilter":{...},"countOwner":"self"}

POWER_MODIFY_PER_TRASH_COUNT: トラッシュ枚数に比例
{"type":"POWER_MODIFY_PER_TRASH_COUNT","target":{...},"deltaPerCard":500,"countFilter":{},"countOwner":"self"}

POWER_MODIFY_PER_LRIG_LEVEL: ルリグレベルに比例
{"type":"POWER_MODIFY_PER_LRIG_LEVEL","target":{...},"deltaPerLevel":1000,"lrigOwner":"self"}

## TargetFilter フィールド
cardType: "シグニ"|"ルリグ"|"アーツ"|"スペル"|"キー"|"ピース"
color: "白"|"赤"|"青"|"緑"|"黒"（配列可）
level: N または {min:N, max:M}
story: "アニマ"|"精像"|"精械"|"精元"|"精武"|"精羅"|"凡骨"|"英知" など（配列可）
isDown: true/false
isFrozen: true/false
hasCharm: true/false

## activeCondition（CONTINUOUS効果の発動条件）
{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"アニマ"}}
{"type":"COUNT_THRESHOLD","location":"field","owner":"self","operator":"gte","value":2}

## CONTINUOUS効果のduration
- 「あなたの場に〜がいる限り」→ duration: "PERMANENT", activeConditionあり
- 条件なし → duration: "PERMANENT"

## 出力ルール
1. 必ずJSON配列（CardEffect[]）のみを出力
2. コードブロック（\`\`\`）は不要
3. parseStatus は常に "AUTO"
4. mandatory: 「〜してもよい」は false、それ以外は true
5. 効果テキストが "-" または空の場合は [] を返す
6. 解析できないアクションは {"type":"STUB","id":"UNKNOWN_ACTION","raw":"元テキスト"} を使う

## 変換例

入力:
CardNum: WD01-002, Type: ルリグ, EffectText: 【出】：あなたのデッキからレベル1のシグニを1枚まで探して手札に加え、デッキをシャッフルする。, BurstText: -

出力:
[{"effectId":"WD01-002-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","level":1},"maxCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"}]

入力:
CardNum: WX01-010, Type: シグニ, EffectText: 【常】：あなたの他の＜精像＞のシグニのパワーを＋1000する。, BurstText: 対戦相手のシグニ1体をバニッシュする。

出力:
[{"effectId":"WX01-010-E1","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","story":"精像"}},"delta":1000},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"},{"effectId":"WX01-010-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"}]

入力:
CardNum: WX04-010, Type: シグニ, EffectText: 【自】《ターン１回》：このシグニがアタックしたとき、カードを1枚引く。【起】《赤》：ターン終了時まで、このシグニのパワーを＋2000する。, BurstText: -

出力:
[{"effectId":"WX04-010-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"usageLimit":"once_per_turn","action":{"type":"DRAW","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"},{"effectId":"WX04-010-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardNum":"WX04-010"}},"delta":2000},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO"}]`;

// ────────────────────────────────────────────────
// 1カードのユーザーメッセージを生成
// ────────────────────────────────────────────────
function buildUserMessage(cards) {
  return cards.map(c => {
    const parts = [
      `CardNum: ${c.CardNum}`,
      `CardName: ${c.CardName}`,
      `Type: ${c.Type}`,
      c.CardClass && c.CardClass !== '-' ? `Class: ${c.CardClass}` : null,
      c.Color && c.Color !== '-' ? `Color: ${c.Color}` : null,
      c.Level && c.Level !== '-' ? `Level: ${c.Level}` : null,
      `EffectText: ${c.EffectText || '-'}`,
      `BurstText: ${(c.LifeBurst === '1' && c.BurstText && c.BurstText !== '-') ? c.BurstText : '-'}`,
    ].filter(Boolean);
    return parts.join(', ');
  }).join('\n\n');
}

// ────────────────────────────────────────────────
// Claude APIでDSL生成
// ────────────────────────────────────────────────
async function generateEffects(cards, attempt = 1) {
  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `以下のカードの効果テキストをDSLに変換してください。\n各カードをJSON配列として出力し、全カードを改行区切りで出力してください。\n（例: 1行目=WD01-001の配列, 2行目=WD01-002の配列）\n\n${buildUserMessage(cards)}`,
        },
      ],
    });

    const text = msg.content[0].text.trim();
    const lines = text.split('\n').filter(l => l.trim().startsWith('['));

    const result = {};
    for (let i = 0; i < cards.length; i++) {
      const line = lines[i];
      if (!line) {
        result[cards[i].CardNum] = [];
        continue;
      }
      try {
        const parsed = JSON.parse(line);
        result[cards[i].CardNum] = Array.isArray(parsed) ? parsed : [];
      } catch {
        result[cards[i].CardNum] = [];
      }
    }
    return result;
  } catch (e) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 2000 * attempt));
      return generateEffects(cards, attempt + 1);
    }
    const result = {};
    for (const c of cards) result[c.CardNum] = [];
    return result;
  }
}

// ────────────────────────────────────────────────
// メイン処理
// ────────────────────────────────────────────────
async function main() {
  // 既存のeffects.jsonを読み込む
  const existingEffects = new Map();
  if (fs.existsSync(EFFECTS_JSON)) {
    const raw = JSON.parse(fs.readFileSync(EFFECTS_JSON, 'utf-8'));
    for (const [k, v] of Object.entries(raw)) existingEffects.set(k, v);
  }

  // 全カードを読み込む
  const allCards = loadAllCards();
  console.log(`全カード数: ${allCards.length}`);

  // 処理対象の決定
  let targets;
  if (IS_TEST) {
    targets = allCards.slice(0, 10);
  } else if (IS_ALL) {
    targets = allCards;
  } else {
    targets = allCards.filter(c => needsReprocess(c.CardNum, existingEffects));
  }

  // 前回の進捗を読み込む
  const done = new Set();
  if (IS_RESUME && fs.existsSync(PROGRESS_FILE)) {
    const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    for (const k of prog.done) done.add(k);
    console.log(`前回進捗: ${done.size}件処理済み`);
  }

  targets = targets.filter(c => !done.has(c.CardNum));

  console.log(`処理対象: ${targets.length}枚 ${IS_TEST ? '(テストモード)' : ''}`);
  if (targets.length === 0) {
    console.log('処理対象なし。完了済みです。');
    return;
  }

  // バッチ分割
  const batches = [];
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    batches.push(targets.slice(i, i + BATCH_SIZE));
  }
  console.log(`バッチ数: ${batches.length} (${BATCH_SIZE}枚/バッチ、${CONCURRENCY}並列)\n`);

  // コスト試算
  const estInputTokens = batches.length * 3500;
  const estOutputTokens = batches.length * 800;
  const estCostUSD = (estInputTokens * 0.80 + estOutputTokens * 4.0) / 1_000_000;
  console.log(`推定コスト: $${estCostUSD.toFixed(2)} (Haiku 4.5 通常料金)`);
  console.log('処理を開始します...\n');

  const newEffects = new Map(existingEffects);
  let processed = 0, failed = 0;

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(batch => generateEffects(batch)));

    for (let j = 0; j < chunk.length; j++) {
      const batch = chunk[j];
      const result = results[j];
      for (const card of batch) {
        const effects = result[card.CardNum];
        if (effects && effects.length > 0) {
          newEffects.set(card.CardNum, effects);
          done.add(card.CardNum);
          processed++;
        } else if (effects && effects.length === 0) {
          // 効果なしカード（EffectText/BurstTextが-）
          const hasText = (card.EffectText && card.EffectText !== '-') ||
                          (card.LifeBurst === '1' && card.BurstText && card.BurstText !== '-');
          if (!hasText) {
            newEffects.set(card.CardNum, []);
            done.add(card.CardNum);
            processed++;
          } else {
            // テキストはあるが変換失敗
            failed++;
            console.log(`  ✗ 変換失敗: ${card.CardNum} ${card.CardName}`);
          }
        }
      }
    }

    const batchEnd = Math.min(i + CONCURRENCY, batches.length);
    const totalCards = batchEnd * BATCH_SIZE;
    console.log(`[${String(batchEnd).padStart(4)}/${batches.length}] ${totalCards}枚処理 (成功:${processed} 失敗:${failed})`);

    // 進捗を定期保存
    if ((i + CONCURRENCY) % 20 === 0 || batchEnd === batches.length) {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ done: [...done] }));
      // effects.jsonも中間保存
      const out = {};
      for (const [k, v] of newEffects) out[k] = v;
      fs.writeFileSync(EFFECTS_JSON, JSON.stringify(out, null, 2));
    }

    if (i + CONCURRENCY < batches.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // 最終保存
  const out = {};
  for (const [k, v] of newEffects) out[k] = v;
  fs.writeFileSync(EFFECTS_JSON, JSON.stringify(out, null, 2));

  console.log(`\n--- 完了 ---`);
  console.log(`成功: ${processed}枚 / 失敗: ${failed}枚`);
  console.log(`effects.json更新: ${newEffects.size}枚`);

  if (IS_TEST) {
    console.log('\n=== テスト結果（最初の10枚）===');
    for (const card of targets) {
      const effects = newEffects.get(card.CardNum) ?? [];
      console.log(`\n[${card.CardNum}] ${card.CardName}`);
      console.log(`  効果数: ${effects.length}`);
      for (const e of effects) {
        console.log(`  - ${e.effectType} ${e.timing?.join(',')||''}: ${e.action?.type}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
