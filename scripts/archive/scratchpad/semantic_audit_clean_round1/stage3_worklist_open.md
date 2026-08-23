# 残 OPEN の worklist（2026-08-23 続き631 時点で再計算）

> **これは `stage3_worklist.md` を「まだ閉じていない findings だけ」で作り直したもの。**
> 元の worklist は 2026-08-21 続き592 時点の数字なので、**着手前にこちらを見る**。
> 再現＝`stage3_recluster.json` を flatten し、`stage2_closed.txt` の effectId を除いて
> （軸 × action型 × type）で束ね直す。

## 現在地

| | 件数 |
|---|---:|
| 残 OPEN findings | **876** |
| 　うち 効果数 | 711 |
| 　うち カード数 | 665 |
| severity | HIGH **524** / MED 343 / LOW 9 |
| 段3（単発由来）の未closed | 593 / 751 |
| 5件以上のサブ群 | **27個・200件** |

## 🔴 方針（2026-08-23 ユーザー決定）＝**OPEN を優先する**

**母集団は `findings.jsonl` 側から切る。** 自作計器（CSV原文 × live JSON 走査）や `census:clusters` から
切ると**実バグは見つかるが OPEN は構造的に動かない**（続き627〜631 で41効果中25件が母集団外だった）。
⇒ **下の表の上から取る。**

## サブ群（残 OPEN・上位15）

| 件数 | 軸 × action型 × type | 着手の目安 |
|---:|---|---|
| 26 | (未分類) × SEQUENCE × WRONG | ⚠**SEQUENCE は器なので信号が弱い**＝**内側の実 action 型でもう一段割ってから**取る |
| 16 | 特殊機構 × (none) × MISSING | チーム／ライズ／リコレクト／ハーモニー／エクシード。機構ごとに割る |
| 13 | count/upTo × SEQUENCE × WRONG | 「N体まで」と「N体」の取り違え。**機械照合しやすい＝着手しやすい** |
| 12 | filter.story × SEQUENCE × WRONG | クラス限定の脱落・誤付着 |
| 12 | キーワード能力 × SEQUENCE × WRONG | 続き616〜622 の集合主語系と同根の可能性 |
| 7 | (未分類) × SEQUENCE × MISSING | |
| 7 | filter.story × SEQUENCE × MISSING | |
| **6** | **filter.story × POWER_MODIFY × MISSING** | ⭐**狭くて機械的＝最初の1バッチ向き**。例＝`WXK10-047-E1` `WXDi-P05-084-E1` `WXDi-CP02-094-E1` `WX25-P3-068-E1` |
| 6 | filter.color × SEQUENCE × WRONG | |
| 6 | filter.color × CHOOSE × WRONG | |
| **6** | **timing/trigger × ENERGY_CHARGE_FROM_DECK × MISSING** | ⭐**狭い**。例＝`WXK03-060-E1` `WX24-P3-055-E2` `WX08-042-E2` `WXK04-029-E2` |
| 6 | condition × SEQUENCE × WRONG | |
| 6 | action丸ごと欠落 × SEQUENCE × MISSING | |
| 6 | filter.power × SEQUENCE × MISSING | |
| 5 | (未分類) × CHOOSE × MISSING | |

## 着手手順（`stage3_worklist.md` §5 と同じ）

1. サブ群を1つ取る（上の表の上から。**⭐印は狭くて着手しやすい**）
2. **生データへ戻って母集団を数え直す**＝`CSV原文 × live JSON`（findings は**標本**）
   ⚠ CODEX_GUIDE §5 の母集団10原則を守る（特に `3-3⁵⁵`＝`CardData_Sheet8.csv` の BOM）
3. 母集団を下位形に割る（parser 規則が別になる形は分ける）
4. parser 規則 → `npm run build:effects` → `node scripts/heldReview.mjs --adopt` → `npm run gates`
5. 🔴**`stage2_closed.txt` に採用 effectId を追記する**（CODEX_GUIDE §4「台帳の更新」）
