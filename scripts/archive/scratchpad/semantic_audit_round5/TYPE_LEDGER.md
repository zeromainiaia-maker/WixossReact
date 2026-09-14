# round5 型台帳（1バッチ1行）

**round5＝効果テキストと effects JSON を持つ全 5,976 枚の読み直し**（2026-09-15 ユーザー決定）。
- 並び＝`card_order.txt`（seed 42 の mulberry32 でシャッフル）／598バッチ（10枚/バッチ）。JSON 未登録の56枚は対象外。
- 実行＝`CODEX_HOME="C:/Users/zerom/.codex-work" node scripts/semanticAuditRunCodex.mjs --out scripts/archive/scratchpad/semantic_audit_round5 --batches N`
- 抽出（作り直すとき）＝`node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_round5 --cards-file scripts/archive/scratchpad/semantic_audit_round5/card_order.txt --batch-size 10`

| バッチ | 枚数 | findings | 新型 | 内容 | 状態 |
|---|---|---|---|---|---|
| r5-001 | 10 | 0（初回は1） | 0 | 初回の1件（`WXDi-D01-011-E1`「無色エナ8個の支払いが余分」）は**偽陽性**＝抽出スクリプトが `meta` に `Cost`/`GrowCost` を入れておらず、監査員はコストを知らなかった。**抽出側を直して再実行し0件**（初回の出力は `rejected_v1/`） | 済 |
| r5-002〜021 | 200 | 7 | 1（＋解釈待ち3） | FP 3（→ 規則35〜37）／BUG 1＝**「対戦相手のスペルを使用したとき」の持ち主限定が engine に無い**（`WX14-027-E2` → `O-376`）／**解釈待ち3**＝「その後」が「そうした場合」の内側か（`O-377`・同文型14件）・「他の」の基準（`O-378`）・「1体につき〜てもよい」の単位（`O-379`）。詳細は `triaged.txt` | triage 済・登録済 |
