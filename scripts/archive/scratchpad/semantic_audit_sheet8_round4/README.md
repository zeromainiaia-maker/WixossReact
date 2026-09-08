# 意味照合監査 Sheet8 round4（2026-09-08）

🏁**Sheet8（round4）は 2026-09-08 に監査完了＝390枚 / 39バッチ全消化**
（**codex（`CODEX_HOME=C:/Users/zerom/.codex-work`）で実行＝失敗0バッチ**。同時刻に `~/.codex` 側が Sheet7/Sheet9 を回していたが競合なし）。
`node scripts/archive/semanticAuditGap.mjs --sheet 8` の未監査は **0**。

🔴**findings 90件は全件未 triage**＝次は Opus で O-A から（PLAN §5.0）。
内訳＝HIGH 41 / MED 44 / LOW 5、型は WRONG 45 / MISSING 44 / SUSPECT_STUB 1。**歩留まり 2.3件/バッチ**。
⚠**今日の7シートで LOW が出た2枚目のシート**（他は Sheet3 の2件のみ）。

## 走らせ方（続きから／再現）

```
node scripts/archive/semanticAuditGap.mjs --sheet 8 --list 2>/dev/null > tmp_sheet8_pending.txt
node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_sheet8_round4 \
  --cards-file tmp_sheet8_pending.txt --batch-size 10
CODEX_HOME="C:/Users/zerom/.codex-work" node scripts/semanticAuditRunCodex.mjs \
  --out scripts/archive/scratchpad/semantic_audit_sheet8_round4 --batches 1,2,3
```

⚠**`semanticAuditGap.mjs --list` の `[gap] …` 行は stderr へ出る**＝`2>/dev/null` を外すと `--cards-file` が1行余分に読む。
⚠**`audited_cards_cumulative.txt` はランナーが更新しない**＝バッチを回したら `raw/batch_NN.json` の `cardNum` を手で追記する。
