# 意味照合監査（Semantic Audit）— 原文 vs effects JSON の LLM 意味比較

> ⚠️ **主軸から外した**：LLM方式は固定プロンプト再送などで完成まで高コスト。原文照合の主軸は
> [BEHAVIOR_AUDIT.md](BEHAVIOR_AUDIT.md)（実行結果を目視照合・LLM不使用）に移行。本方式は「発見器」実績（下記）を lint 化して引き継ぐ。

> **目的**: 「JSON がカード原文を正しく表現しているか」を、逆翻訳の**文字列一致に頼らず**、LLM の意味比較で直接検査する。
> 逆翻訳（`decompileEffects.ts`）が原理的に検査できない **STUB/MANUAL カード（2,306枚）** を検査できるのが最大の利点。
> 位置づけ＝P1「表現」の検証手段の追加。同型★0・逆翻訳は**回帰ゲートとして従来どおり維持**（このツールはその置き換えではなく、不一致の**発見器**）。

## 使い方（3ステップ）

```bash
# ① 抽出＝サンプリングしてバッチプロンプト生成（シード付き・決定的）
node scripts/semanticAuditExtract.mjs --out <出力dir> [--per-group 50] [--batch-size 10] [--seed 42]
node scripts/semanticAuditExtract.mjs --out <出力dir> --cards WX01-001,WX01-002   # カード指定も可

# ② 実行＝各バッチを claude -p（headless）に流し findings.jsonl に集約
node scripts/semanticAuditRun.mjs --out <同じdir> [--model sonnet] [--batches 1,2]

# ③ 精査＝指摘をカードごとに原文+JSON と並べて表示（人手裏取り用）
node scripts/semanticAuditTriage.mjs <同じdir> [cardNum...]
```

- サンプリングは2群：**stub群**（STUB/MANUAL 含有＝逆翻訳の盲点・本命）と **clean群**（全効果 AUTO＝対照群・偽陽性率の測定用）。
- ②は**再開可能**（済みバッチは `raw/` の存在でスキップ）。`claude -p` はプランのセッション上限を消費する。**429（session limit）を検出すると自動中断**＝リセット後に同コマンドで再開。
- 1バッチ（10枚・プロンプト約25KB）≈ 2〜5分。sonnet 推奨（パイロットの precision 実測は sonnet）。
- **指摘＝真バグとは限らない**。必ず③で engine 実装を確認してから直す（下の「偽陽性パターン」参照。主要な既知規約はプロンプトに反映済み）。

## パイロット結果（2026-07-02〜03・sonnet・stub群30枚を全数精査）

- **findings 50件 → 真バグ39件＋要追精査3件＋偽陽性7件 ＝ precision 約78%（真バグのみ）〜84%（要追精査込み）**
- **stub群30枚中17枚（57%）に確定バグ**。すべて同型★0・smoke/fuzz 緑を通過済みのカード＝既存ゲートの死角を実証。
- 見つかった真バグの型：効果/条件の丸ごと欠落（パワー条件・場条件・クラス条件フィルター）／対象取り違え（自分↔相手・シグニ↔ルリグ）／タイミング違い（【ガード】された時→ON_PLAY 等）／別アクション化（ダウン→トラッシュ、デッキ下→トラッシュ）／数値違い（2回→1回）／付与能力の即時実行化。
- 例（重篤）：`WX24-P4-023-E3`＝「対戦相手が手札全捨てかエナ全トラッシュを選ばない限り相手の全シグニをトラッシュ」→ JSON は**自分の手札を全捨て**。`WX12-018-E1`＝「アーツ以外の効果を受けない」→ `from:["アーツ"]`（**真逆**）。

### 派生した系統バグ（全域スキャン済み・修正待ち worklist）

パイロットの個別指摘から正規表現＋JSON走査で全域展開したもの（`scratchpad/_auditSystematicScan.mjs`）:

1. **相手デッキ削りの owner 取り違え＝確定76枚**（＋自分ミル文も持つ要精査10枚）
   原文「対戦相手のデッキの上から…トラッシュに置く」が `TRASH { target: { type:'DECK_CARD', owner:'self' } }` になっており、**自分のデッキを削る**。
   `execTrash` は `target.owner` のデッキを削る実装（effectExecutor.ts の DECK_CARD 分岐）なので実挙動も逆。確定リストはスキャン実行で再取得。
2. **GRANT_PROTECTION `count:'ALL'`＋subjectFilter 無し＝48件**（うち原文「このシグニは…受けない」単体保護が約半数）
   保護コレクタ（effectEngine.ts）は subjectFilter 無しの場合 `target.count===1` のときだけソース自身を保護するため、**`count:'ALL'` はどの分岐にも入らず no-op** の疑い。原文が全体保護のものも含めて要修正。

## 偽陽性パターン（判明分・プロンプトのルール9〜12に反映済み）

| パターン | 正体 |
|---|---|
| STUB(任意コスト系)+`CONDITIONAL(IS_MY_TURN)` | 「支払ってもよい。そうした場合…」のイディオム。effectExecutor がインターセプト（`TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST` は then の owner:self→opponent 自動修正まで行う） |
| LIFE_BURST の `mandatory:false` | LB発動は任意、のルール表現 |
| アンコール/ベット注記が JSON に無い | engine 側の別機構（アーツ使用モーダル等）で処理 |
| STUB アクションの mandatory ずれ | 任意確認を STUB ハンドラ内で行うことがある |

## スケールアップの進め方（次の担当へ）

1. `--per-group` を増やす／`--cards` でシート単位に流す。全 stub群 2,306枚 ≈ 231バッチ（10枚/バッチ・sonnet で約半日分のセッション上限を数回に分割）。
2. findings は「発見器」出力＝**worklist**。修正は従来ルールどおり：effects JSON を直接パッチ（`build:effects` 禁止）→逆翻訳とエンジンのセット修正→同型★0＋smoke/golden/fuzz。
3. 精査で新しい偽陽性パターンを見つけたら `semanticAuditExtract.mjs` のプロンプト（ルール9〜12の並び）に追記して precision を上げる。
4. 進捗指標は「監査済みで不一致0（または全指摘クローズ）のカード数 / 5,975」を推奨（英語ID漏れ件数より目標に直結）。

## 補足：テキストありなのに JSON 未登録のカード（56枚・調査済み・実ギャップなし）

54枚は多色エナ支払いの括弧注記のみ（Color 列でエンジン処理）。残り2枚も engine 特別処理済み＝WXDi-P13-023（ゲーム開始時コイン・BattleScreen.tsx）／WX24-D1-TK1（リミットアッパー・`limit_upper_token`＋`PLACE_LIMIT_UPPER`）。
