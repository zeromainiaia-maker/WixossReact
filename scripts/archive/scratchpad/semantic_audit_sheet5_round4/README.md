# 意味照合監査 Sheet5 round4（2026-09-08）

🏁**Sheet5（round4）は 2026-09-08 に監査完了＝143枚 / 15バッチ全消化**
（**codex（`CODEX_HOME=C:/Users/zerom/.codex-work`）で実行＝失敗0バッチ**）。
`node scripts/archive/semanticAuditGap.mjs --sheet 5` の未監査は **0**。

🔴**findings 22件は全件未 triage**＝次は Opus で O-A から（PLAN §5.0）。
内訳＝HIGH 15 / MED 7、型は WRONG 12 / MISSING 9 / SUSPECT_STUB 1。**歩留まり 1.5件/バッチ**
（Sheet3 2.65 / Sheet4 1.9 より低い）。

## 走らせ方（続きから／再現）

```
node scripts/archive/semanticAuditGap.mjs --sheet 5 --list 2>/dev/null > tmp_sheet5_pending.txt
node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_sheet5_round4 \
  --cards-file tmp_sheet5_pending.txt --batch-size 10
CODEX_HOME="C:/Users/zerom/.codex-work" node scripts/semanticAuditRunCodex.mjs \
  --out scripts/archive/scratchpad/semantic_audit_sheet5_round4 --batches 1,2,3
```

⚠**`semanticAuditGap.mjs --list` の `[gap] …` 行は stderr へ出る**＝`2>/dev/null` を外すと `--cards-file` が1行余分に読む。
⚠**`audited_cards_cumulative.txt` はランナーが更新しない**＝バッチを回したら `raw/batch_NN.json` の `cardNum` を手で追記する。
⚠**同一 `CODEX_HOME` で codex を同時実行しない**（トークンリフレッシュ競合で5連続失敗した記録＝PLAN_PROGRESS.md:10851）。
`CODEX_HOME` が別なら並走してよい（2026-09-08 に `.codex-work`＝Sheet3/5 と `~/.codex`＝Sheet4 を並走させて失敗0）。
