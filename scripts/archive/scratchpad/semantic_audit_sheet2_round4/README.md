# 意味照合監査 Sheet2 round4（2026-09-07 開始）

🔵**Sheet2 は 2026-09-07（第210バッチ）に先頭18/36バッチ（180/356枚）を消化。残 18バッチ / 176枚。**
**findings 32件は全件未 triage**＝次セッションは Opus で O-A から（§5.0）。詳細は `TYPE_LEDGER.md`。

Sheet1（`semantic_audit_sheet1_round4/`）が完了したので、同じ形でこのディレクトリを新設した。

## 走らせ方（続きから）

```
node scripts/archive/semanticAuditGap.mjs --sheet 2 --list > tmp_sheet2_pending.txt   # 未監査カード番号を再取得
node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_sheet2_round4 \
  --cards-file tmp_sheet2_pending.txt --batch-size 10
node scripts/semanticAuditRun.mjs --out scripts/archive/scratchpad/semantic_audit_sheet2_round4 \
  --model sonnet --batches 19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36
```

⚠**初回抽出時のシャッフルは seed 42 の mulberry32**（`pending_cards.txt` が356枚の並び。以後は
`semanticAuditGap.mjs --sheet 2` で再取得した「残り」をそのまま `--cards-file` に渡せばよい＝再シャッフル不要）。

⚠**`node scripts/semanticAuditRun.mjs` は `raw/batch_NN.json` が既にあるバッチをスキップする**＝
`--batches` を絞らずに全バッチ範囲を指定しても二重実行はされない（同じコマンドで再開可能）。

⚠**消化した分は `audited_cards_cumulative.txt` へ追記が必須**（`semanticAuditGap.mjs` が
`*cumulative.txt` を自動走査して未監査カードから差し引く）。**このファイルのキー名は `num`**
（`batches/batch_NN.json` の各要素は `{num, group}` であって `{cardNum, group}` ではない＝
第210バッチで一度 `cardNum` と誤読し、180行の空行を書いてしまった事故を踏んだ）。

## 第210バッチの実績（180枚・2026-09-07）

- findings **32件 / 180枚（1.8件/バッチ）**。全件未 triage。
- 実行時トラブル＝**s2-07 が claude -p の JSON 契約を守らず散文で応答**（Sheet1 r4-12 と同型）。
  本文が「findings 空配列で報告済み」と明記していたため 0件で確定・手動復元は不要だった。
- `mandatory:true` 疑い（LOW・「してもよい」なのに強制）が**4件**連続で出ている＝
  規則12（STUB内で任意判定される可能性）に該当するかを O-A triage で優先確認する。

詳細は `TYPE_LEDGER.md`。
