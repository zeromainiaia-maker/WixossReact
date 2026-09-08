# 意味照合監査 Sheet3 round4（2026-09-07 開始）

🏁**Sheet3（round4）は 2026-09-08 に監査完了＝369枚 / 37バッチ全消化**
（s3-01〜02＝2026-09-07 claude 版／**s3-03〜37＝2026-09-08 に codex（`CODEX_HOME=C:/Users/zerom/.codex-work`）で349枚・失敗0バッチ・19〜69秒/バッチ**）。
`node scripts/archive/semanticAuditGap.mjs --sheet 3` の未監査は **0**。
🔴**findings 98件は全件未 triage**＝次は Opus で O-A から（PLAN §5.0）。内訳＝HIGH 60 / MED 36 / LOW 2、
型は WRONG 43 / MISSING 41 / SUSPECT_STUB 11 / EXTRA 3。⚠**歩留まり 2.65件/バッチ**（Sheet1 後半の 2.4 と同水準）。
⚠**`audited_cards_cumulative.txt` はランナーが更新しない**＝バッチを回したら `raw/batch_NN.json` の `cardNum` を
手で追記する（忘れると gap 計器が減らず、再抽出で同じ枚数をもう一度監査する）。

Sheet2（`semantic_audit_sheet2_round4/`）が完了したので、同じ形でこのディレクトリを新設した。

## 走らせ方（続きから）

```
node scripts/archive/semanticAuditGap.mjs --sheet 3 --list 2>/dev/null > tmp_sheet3_pending.txt   # 未監査カード番号を再取得
node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_sheet3_round4 \
  --cards-file tmp_sheet3_pending.txt --batch-size 10
node scripts/semanticAuditRun.mjs --out scripts/archive/scratchpad/semantic_audit_sheet3_round4 \
  --model sonnet --batches 3,4,5,6,7,8
```

⚠**`semanticAuditGap.mjs --list` の `[gap] …` 行は stderr へ出る**＝`2>/dev/null` でリダイレクトを外さないと
`--cards-file` が1行余分に読む（Sheet2 の README は `>` 直書きだったが、Sheet3 は stderr 分離が必要だった）。

⚠**初回抽出時のシャッフルは seed 42 の mulberry32**（`--cards-file` に渡した並びのまま37バッチ）。以後は
`semanticAuditGap.mjs --sheet 3` で再取得した「残り」をそのまま `--cards-file` に渡せばよい（再シャッフル不要）。

⚠**`node scripts/semanticAuditRun.mjs` は `raw/batch_NN.json` が既にあるバッチをスキップする**＝
`--batches` を絞らずに全バッチ範囲を指定しても二重実行はされない（同じコマンドで再開可能）。

⚠**消化した分は `audited_cards_cumulative.txt` へ追記が必須**（`semanticAuditGap.mjs` が
`*cumulative.txt` を自動走査して未監査カードから差し引く）。**`batches/batch_NN.json` の各要素のキーは `num`**。

## s3-01〜02 の実績（20枚・2026-09-07・S-1）

- findings **4件 / 20枚（2.0件/バッチ）**。全件未 triage。Sheet2（1.8件/バッチ）とほぼ同水準＝逓減の兆候なし。
- 実行時トラブルなし（2バッチとも JSON 契約どおり応答）。
- `audited_cards_cumulative.txt` は 0件 → **20件**（`semanticAuditGap.mjs --sheet 3` の残枚数は 369 → **349** と一致確認済み）。
- 止め時（連続3バッチで新型0）はこの回では判定できない（新型判定は O-A triage の役目・§2.6 決定1／§5.0）。

詳細は `TYPE_LEDGER.md`。
