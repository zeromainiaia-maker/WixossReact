# 意味照合監査 Sheet7 round4（2026-09-08）

🏁**Sheet7（round4）は 2026-09-08 に監査完了＝368枚 / 37バッチ全消化**
（**codex（既定 `~/.codex`）で実行＝失敗0バッチ**。同時刻に `.codex-work` 側が Sheet8 を回していたが競合なし）。
`node scripts/archive/semanticAuditGap.mjs --sheet 7` の未監査は **0**。

🔴**findings 64件は全件未 triage**＝次は Opus で O-A から（PLAN §5.0）。
内訳＝HIGH 41 / MED 23、型は WRONG 35 / MISSING 25 / EXTRA 3 / SUSPECT_STUB 1。**歩留まり 1.7件/バッチ**。

## 走らせ方（続きから／再現）

```
node scripts/archive/semanticAuditGap.mjs --sheet 7 --list 2>/dev/null > tmp_sheet7_pending.txt
node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_sheet7_round4 \
  --cards-file tmp_sheet7_pending.txt --batch-size 10
node scripts/semanticAuditRunCodex.mjs --out scripts/archive/scratchpad/semantic_audit_sheet7_round4 --batches 1,2,3
```

⚠**`semanticAuditGap.mjs --list` の `[gap] …` 行は stderr へ出る**＝`2>/dev/null` を外すと `--cards-file` が1行余分に読む。
⚠**`audited_cards_cumulative.txt` はランナーが更新しない**＝バッチを回したら `raw/batch_NN.json` の `cardNum` を手で追記する。
