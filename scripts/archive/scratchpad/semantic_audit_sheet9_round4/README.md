# 意味照合監査 Sheet9 round4（2026-09-08）

🏁**Sheet9（round4）は 2026-09-08 に監査完了＝441枚 / 45バッチ全消化・失敗0バッチ**。
🔑**2アカウントで分担した唯一のシート**＝**b01〜23 を既定 `~/.codex`、b24〜45 を `CODEX_HOME=C:/Users/zerom/.codex-work` が
同時に同じ `--out` へ書いた**（スキップ規約が `raw/batch_NN.json` の有無なので、バッチ番号が重ならなければ二重監査は起きない）。
⚠**`findings.jsonl` だけは両プロセスが `appendFileSync` で同時追記する**＝理屈の上では行が壊れうる。
**正本は `raw/batch_NN.json`**（プロセスごとに別ファイル）なので、壊れたら raw から再構築する。
🔑**この回は実測で破損0行**（88行すべて JSON.parse 成功・raw からの再構築結果と件数一致）。

🔴**findings 88件は全件未 triage**＝次は Opus で O-A から（PLAN §5.0）。
内訳＝HIGH 53 / MED 34 / LOW 1、型は WRONG 57 / MISSING 28 / SUSPECT_STUB 2 / EXTRA 1。**歩留まり 2.0件/バッチ**。

## 走らせ方（続きから／再現）

```
node scripts/archive/semanticAuditGap.mjs --sheet 9 --list 2>/dev/null > tmp_sheet9_pending.txt
node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_sheet9_round4 \
  --cards-file tmp_sheet9_pending.txt --batch-size 10
node scripts/semanticAuditRunCodex.mjs --out scripts/archive/scratchpad/semantic_audit_sheet9_round4 --batches 1,2,3
```

⚠**`semanticAuditGap.mjs --list` の `[gap] …` 行は stderr へ出る**＝`2>/dev/null` を外すと `--cards-file` が1行余分に読む。
⚠**`audited_cards_cumulative.txt` はランナーが更新しない**＝バッチを回したら `raw/batch_NN.json` の `cardNum` を手で追記する。
