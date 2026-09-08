# 意味照合監査 Sheet10 round4（2026-09-08）

🏁**Sheet10（round4）は 2026-09-08 に監査完了＝42枚 / 5バッチ全消化・失敗0バッチ**
（codex `CODEX_HOME=C:/Users/zerom/.codex-work`）。

🔴**findings 14件は全件未 triage**。内訳＝HIGH 12 / MED 2、型は WRONG 9 / MISSING 5。**歩留まり 2.8件/バッチ**。
⚠**HIGH 比率 86% は今日の全シートで最高**（全体平均は約55%）＝母数42枚と小さいので単独では読まないが、triage 時に見る価値がある。

## 走らせ方（続きから／再現）

```
node scripts/archive/semanticAuditGap.mjs --sheet 10 --list 2>/dev/null > tmp_sheet10_pending.txt
node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_sheet10_round4 \
  --cards-file tmp_sheet10_pending.txt --batch-size 10
CODEX_HOME="C:/Users/zerom/.codex-work" node scripts/semanticAuditRunCodex.mjs \
  --out scripts/archive/scratchpad/semantic_audit_sheet10_round4 --batches 1,2,3
```
