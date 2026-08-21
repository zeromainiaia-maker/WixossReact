# 段3（単発751件）を段2 へ寄せ直した worklist（2026-08-21・続き592）

PLAN §6.2 段3 の「⚠着手前にもう一度 段2 へ寄せ直す＝claim の語彙軸で括り直せば parser 規則に還元できる塊が残っている見込み」を実測した結果。

## 1. 軸の選定＝3案を実測して比較した

| 案 | 結果 | 判定 |
|---|---|---|
| **quote の正規化**（カード名・クラス名・数字をマスク） | 42クラスタ/92件・**659件が残る** | ❌ 単発は quote がカード固有なので束ならない |
| **claim の正規化**（同上） | 6クラスタ/13件・**738件が残る** | ❌ LLM が毎回違う言い回しをするので効かない |
| ✅**「欠落している語彙キー」軸**（claim の欠陥述語から抽出・最長一致優先の単一割当） | **未分類133（18%）まで圧縮** | ✅**採用** |

再現＝**`node scripts/archive/semanticAuditRecluster.mjs`**（明細 `stage3_recluster.txt` ／機械可読 `stage3_recluster.json` ／
1軸だけ見るなら `--axis "filter.cardName"`）。

## 2. 第1層＝欠落語彙キー軸（751件）

| 軸 | 件数 | HIGH | 主な action 型 |
|---|---:|---:|---|
| (未分類) | 133 | 95 | SEQUENCE(37) CHOOSE(10) POWER_MODIFY(10) |
| filter.story | 100 | 80 | SEQUENCE(24) CHOOSE(10) POWER_MODIFY(9) |
| キーワード能力 | 71 | 52 | GRANT_KEYWORD(29) SEQUENCE(19) |
| count/upTo | 51 | 34 | SEQUENCE(13) CHOOSE(8) LOOK_PICK_CHAIN(5) |
| filter.color | 45 | 30 | SEQUENCE(12) CHOOSE(8) |
| timing/trigger | 45 | 32 | ENERGY_CHARGE_FROM_DECK(9) SEQUENCE(5) DRAW(5) |
| 特殊機構（チーム/ライズ/リコレクト/ハーモニー/エクシード） | 43 | 29 | (none)(16) CHOOSE(6) |
| filter.level | 41 | 29 | POWER_MODIFY(8) SEQUENCE(8) |
| condition | 39 | 28 | SEQUENCE(11) CHOOSE(8) BANISH(6) |
| filter.状態（チャーム/アクセ/ソウル/凍結/感染/レゾナ） | 34 | 24 | SEQUENCE(9) POWER_MODIFY(5) |
| cost | 26 | 19 | SEQUENCE(7) ADD_TO_FIELD(3) |
| filter.cardName | 23 | 21 | SEQUENCE(8) ADD_TO_FIELD(5) |
| action丸ごと欠落 | 22 | 18 | SEQUENCE(7) |
| 順序/構造 | 17 | 11 | SEQUENCE(10) |
| filter.power | 16 | 13 | SEQUENCE(11) GRANT_KEYWORD(7)※ |
| duration | 11 | 8 | SEQUENCE(4) BLOCK_ACTION(3) |
| owner/主語 | 9 | 6 | GRANT_KEYWORD(2) |
| アタック状態 | 9 | 7 | POWER_MODIFY(3) ENERGY_CHARGE_FROM_DECK(3) |
| プレイヤー選択（あなたか対戦相手） | 6 | 6 | TRANSFER_TO_DECK(1) PLAY_FREE(1) |
| 能力種別（【常】/【自】/【起】） | 5 | 3 | — |
| filter.hasIcon | 3 | 2 | — |
| usageLimit（《ターンN回》） | 2 | 1 | — |

⚠**第1層だけでは段2 の単位にならない**＝`filter.story` 100件は「クラス限定が落ちている」だけで、
**parser のどこで落ちているかは1つとは限らない**。

## 3. 第2層＝（軸 × action型 × type）＝**段2 の単位**

**5件以上のサブ群が38個・302件**（単発751の40%）。上位：

| 件数 | 軸 | action型 / type |
|---:|---|---|
| 28 | (未分類) | SEQUENCE / WRONG |
| 17 | filter.story | SEQUENCE / WRONG |
| 17 | キーワード能力 | GRANT_KEYWORD / MISSING |
| 16 | キーワード能力 | SEQUENCE / WRONG |
| 16 | 特殊機構 | (none) / MISSING |
| 13 | count/upTo | SEQUENCE / WRONG |
| 12 | キーワード能力 | GRANT_KEYWORD / WRONG |
| 9 | 順序/構造 | SEQUENCE / WRONG |
| 8 | filter.story | POWER_MODIFY / MISSING |
| 7 | filter.story | SEQUENCE / MISSING |
| 7 | timing/trigger | ENERGY_CHARGE_FROM_DECK / MISSING |
| 7 | action丸ごと欠落 | SEQUENCE / MISSING |

⚠**`SEQUENCE` は器なので信号が弱い**（`SEQUENCE / WRONG` に4群が乗っている）。着手時は SEQUENCE 群を
**内側の実 action 型でもう一段割る**こと。

## 4. ✅ 実証＝「単発に見えた指摘」は systematic bug だった

**`filter.cardName × ADD_TO_FIELD × WRONG`（5件）を検証したところ、5件とも live JSON がバイト一致**：

```
{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self",
 "count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}}
```

原文は `WX26-CP1-065/073/081/089/097` の「あなたのトラッシュから**《花の騎士ピュリティ》**１枚を対象とし、それを場に出す」で、
**`filter.cardName` が丸ごと落ちて任意のシグニを選べる**＝**parser 規則1本で5件同時に直る。**

さらに**生データ（CSV原文 × live JSON）へ戻して母集団を数え直すと約15効果**（audit が拾ったのは5件＝**標本にすぎない**）。
2つの下位形に分かれる：
- **(a) 指定形**「《NAME》1枚を対象とし場に出す」＝`WX26-CP1`5件＋`WXDi-D02-22-E1`／`PR-427-E3`／`WXDi-P07-095-E1,-BURST` ≒9
- **(b) 除外形**「《NAME》**以外**の…」＝`WX20-048-E1`／`WXEX2-75-E2,-BURST`／`WXEX2-80-E1`／`WDK14-012-E1`／`SP27-003-E1` ≒6

⚠**母集団の数え直しには落とし穴がある**＝原文の `《…》` は**カード名だけでなくコスト記号**（`《黒》`『《黒×0》』`《ダウン》`
`《ターン１回》`『《アタックフェイズアイコン》』）にも使われる。素朴に `/《[^》]+》/` で数えると **25件中7件が誤検出**だった。
**カード名判定は「中身が3文字以上」かつ「コスト語彙でない」で絞る。**

## 5. 段2 の進め方（この worklist の使い方）

1. サブ群を1つ取る（第2層の表の上から）。
2. **生データへ戻って母集団を数え直す**＝`CSV原文 × live JSON` を機械走査し、同じ構造の効果を全部集める
   （findings は標本。§4 の実測では **5件 → 約15効果**）。
3. 母集団を**下位形に割る**（§4 の指定形／除外形のように、parser 規則が別になる形は分ける）。
4. parser 規則を1本足す → `npm run build:effects` → `node scripts/heldReview.mjs --adopt` → `npm run gates`。
5. ⚠**JSON 手パッチ単独は禁止**（parser 同修正か MANUAL 化とセット）。MANUAL 側は `npx tsx scripts/syncManualLive.ts` 経由でないと live に届かない。

## 6. 見積もりへの含意

PLAN §6.2 の段3 見積もりは **60〜100セッション**（786件を1カードずつ）。
本 worklist により **302件が38サブ群に束ねられた**＝この40%は「1サブ群＝1バッチ」で回せる。
残る449件は5件未満の群と未分類だが、**§4 の実証どおり findings は標本**なので、
生データへ戻して母集団を数え直すと**さらに束ねられる可能性がある**（＝着手時に毎回 §5 の手順2 を踏む）。
⚠**楽観しすぎない**＝`SEQUENCE / WRONG` 群のように「器が同じだけ」の群も混ざっており、割り直しで数は減る。
