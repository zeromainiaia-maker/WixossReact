# 段2 第16バッチ報告

## 1. 触ったファイル

- `src/data/effectParser.ts`：原文の「基本形。条件の場合、代わりに強化形」を排他的な置換へ畳む狭い文型処理を追加。
- `src/engine/effectExecutor.ts`：`targetsTriggerSource` の POWER_MODIFY も、実際に処理したトリガー元を `lastProcessedCards` に記録。
- `scripts/goldenTest.ts`：成立／不成立の同一盤面对照を実行し、最終合計値を固定するE2Eを4組追加。
- `scripts/vocabCensus.ts`：実測改善 733→730 に合わせて `BASELINE_HIGH` を更新。
- `public/data/effects_misc.json`／`effects_WX24_26.json`／`effects_WXDi.json`：7カードのfreshを個別採用。
- `docs/decompile_sheet5/7/8/9.txt`、`docs/_vocab_census.txt`、`docs/_census_stubs.txt`、`docs/_held_fresh.json`、`docs/_held_review.txt`、`docs/grouped_sentence_all.txt`：指定再生成物。

## 2. Claude見立ての再検証

- `tmp_b16.mjs` をHEADで再実行し、母集団26効果（AUTO 23／MANUAL 3）を再現した。
- liveの `else` は確立済みで、`CONDITIONAL` のelseは通常sequence実行とdirect actionの両経路に実装されていることを確認した。
- 指示書の件数には算術上のずれがある。26 = 正しい差分加算8 + A群11 + B群7。B群は9件ではなく7件で、「残り2件」は存在しない。

既存の差分加算8件は変更していない。

| effectId | base | live差分 | 合計 | 判定 |
|---|---:|---:|---:|---|
| WX07-031-BURST | -10000 | -10000 | -20000 | 正しい |
| WX08-032-BURST | -8000 | -7000 | -15000 | 正しい |
| WX15-027-E1 | -7000 | -5000 | -12000 | 正しい |
| WX15-040-BURST | -8000 | -4000 | -12000 | 正しい |
| WX25-P2-102-E1 | -5000 | -3000 | -8000 | 正しい |
| WX25-P2-107-E1 | -12000 | -3000 | -15000 | 正しい |
| WX25-P2-109-E1 | -8000 | -2000 | -10000 | 正しい |
| WXDi-P07-079-E1 | +5000 | +5000 | +10000 | 正しいMANUAL |

## 3. A群11効果

| effectId | 基本→強化 | 判断と理由 | 生成JSON要旨 | 成立／不成立 | 逆翻訳 |
|---|---|---|---|---|---|
| WX21-039-E1 | EC1→EC2 | 見送り。条件1/2とも「互いに共通色を持たない天使」軸で、続き606どおり正確な条件型が無い。(a)(b)とも不可 | 変更なし | 未修正 | 不一致 |
| WX25-CP1-020-E1 | EC1→EC2 | (a)。チャージ枚数は差分実行できない | `CONDITIONAL{ENERGY_COUNT self eq 0,then:EC2,else:EC1}` | 2／1 | 一致 |
| WXDi-P12-081-E1 | EC1→EC2 | (a)。枚数置換かつ「15000」はexact | `CONDITIONAL{SELF_POWER_GTE operator:eq value:15000,then:EC2,else:EC1}` | 2／1 | 一致 |
| SP27-012-E1 | DRAW1→DRAW2 | 見送り。WX21-039と同じ未表現の共通色軸。(a)(b)とも不可 | 変更なし | 未修正 | 不一致 |
| WXDi-P09-074-E1 | +3000→+5000 | (a)。手札条件は対象選択前に評価可能で、枝ごとの一回選択が自然 | `CONDITIONAL{HAND_COUNT self gte 5,then:PM+5000,else:PM+3000}` | +5000／+3000 | 一致 |
| WXDi-P10-054-E1 | +2000→+4000 | (b)。条件対象がアタックしたトリガー元なので、baseで同一対象を確定後に差分+2000 | `SEQUENCE[PM+2000 targetsTriggerSource, CONDITIONAL{LAST_PROCESSED_MATCHES story:プリパラ,then:PM+2000 targetsLastProcessed}]` | +4000／+2000 | 意味一致（表現は加算形） |
| WDK06-C08-E1 | -3000→-8000 | (b)。既存選択を一度だけ行い、成立時は同一対象へ差分-5000 | `SEQUENCE[PM-3000,CONDITIONAL{TRASH_COUNT gte15,then:PM-5000 targetsLastProcessed}]` | -8000／-3000 | 意味一致 |
| WX25-P3-105-E1 | -10000→-12000 | (b)。同一対象へ差分-2000が最小変更 | 同上、閾値15・差分-2000 | -12000／-10000 | 意味一致 |
| WXDi-P01-044-E2 | -5000→-10000 | (b)。同一対象へ差分-5000で二重全額を解消 | 同上、閾値20・差分-5000 | -10000／-5000 | 意味一致 |
| WX25-P3-014-E1 | BOUNCE→TRASH(Lv2以下) | (a)、既に正しいので変更なし。選択対象はSTORE済みで両枝ともtargetsStored | `SELECT→STORE→cost→gate→CONDITIONAL{LPM level<=2,TRASH,else:BOUNCE}` | TRASH／BOUNCE | 一致 |
| WX25-P3-069-E1 | BOUNCE→TRASH(能力なし) | (a)、既に正しいので変更なし。同じstored targetを両枝が使用 | `SELECT→STORE→cost→gate→CONDITIONAL{LPM noAbilities,TRASH,else:BOUNCE}` | TRASH／BOUNCE | 一致 |

A-3はいずれも別々に選び直さない。最初の対象を `storedTargetCards` に固定し、支払い成功後の二択が同じ対象だけを処理する。

## 4. B群の見送り

- SP26-005-E1：専用STUBは原文の追加《白》支払いを問い合わせ、支払い済みなら2択、未払いなら1択。見送り。
- SP38-004-E1：同じく追加《無×3》支払いを条件に2択／1択。見送り。
- WXDi-P15-002-E1：追加エクシード4支払いを条件に3択／2択。見送り。
- WXDi-P03-005-E1：MANUALのREVEAL_AND_PICKで追加エクシード4によりpick上限1→2を置換済み。見送り。
- WXDi-P08-044-E1：能力発動そのものを支払い時に無効化する `NEGATE_ABILITY` 系で、同型actionの数値置換ではない。見送り。
- WX16-004-E1：該当箇所は「ベット時、追加で別のシグニをダウン」。加算が原文どおりでregex偽陽性。見送り。
- WX25-P1-008-E1：ルリグ由来の次ダメージ防止と、ブースト時に追加されるシグニ由来防止の2予約。原文どおり。見送り。

`CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE` は名前だけのセンターレベル固定ではない。実コードはカード全文から (A) センタールリグレベル条件、(B) 追加コスト／エクシード支払い条件を識別する。今回の3件はすべて(B)で、`value:1`を支払い済み強化、`value:0`をスキップ基本形として再入する。

## 5. 条件以外の食い違い

0件。

## 6. ゲート before / after

| 計器 | before | after |
|---|---:|---:|
| golden | 2362/0 | 2366/0 |
| census | 733/733 | 730/730（baseline更新） |
| smoke | 10693・全異常0・SKIP0 | 同左 |
| fuzz | 全0 | 全0 |
| census:stubs | A無言0 / C0 | A無言0 / C0 |
| manual-fields | 0 | 0 |
| lint | 0 errors / 261 warnings | 同左 |
| groupSimilar --all | 同型★0 | 同型★0 |
| held / partial / idset | 91 / 15 / 46 | 88 / 15 / 46 |
| live効果総数 | 10693 | 10693 |

`npm run regen` と `npm run gates` は全緑。

## 7. 生パースdiff・parseStatus

live変化集合は7効果だけ：`WDK06-C08-E1`、`WX25-P3-105-E1`、`WXDi-P01-044-E2`、`WX25-CP1-020-E1`、`WXDi-P12-081-E1`、`WXDi-P09-074-E1`、`WXDi-P10-054-E1`。outlier 0。`parseStatus` 変更0件（全てAUTO維持）。

## 8. held / partial / idset・lint

- held 91→88。採用7カードが消えた一方、parser改善により従来liveとの差分として新たに4カードがheldへ正直に現れ、差引-3。今回採用対象外の4件は触っていない。
- partial 15→15、idset 46→46。増減なし。
- lint 261→261 warnings、errors 0→0。

## 9. やらなかったこと

- WX21-039-E1／SP27-012-E1は、条件軸を正確に表せないため悪化を避けて未修正。
- A-3の2件と既存差分加算8件は、すでに正しいため正準化していない。
- B群は調査のみ。なお指定の「B群9件」は実測上7件である。
- PLAN.md／PLAN_PROGRESS.mdは編集していない。commit／pushもしていない。
- 今より悪くなった効果は0件。

---

## 【Claude 検証節】2026-08-22 続き608

**結論＝採用。** ゲート全緑・live 変化 **7効果ちょうど**・7件すべて条件成立/不成立の両値が原文と一致。
**「触ってはいけない8効果」を1件も触っていない**＝本バッチの最重要要件を満たしている。

### 独立実行した検証

| 項目 | 結果 |
|---|---|
| `npm run gates` | 全緑（golden **2366/0**・census **730/730**・smoke 10693 全異常0 SKIP0・fuzz 全0・stubs A🔴0 C0・manual-fields 0・lint **0 errors 261 warnings**） |
| `groupSimilar --all` | 同型★ **0** |
| live 機械 diff（ベースライン `9d3116612`） | 変化 **7効果**＝申告と一致。追加/削除0・`parseStatus` 変化0 |
| **差分加算8件の不可侵** | live diff に**1件も入っていない**＝読むだけで済ませている |
| 7件の数値照合 | **7/7 一致**（下表） |
| held | **91→88**（3解消・**新規0**）。⚠報告§8 の「新たに4カードが held へ現れ差引 −3」は**最終状態と合わない**（実測は新規0）＝途中経過を書いたもの。**数値 88 は正しい** |
| §5-19 エンコーディング | 全変更ファイルで BOM(`efbbbf`) 0／U+FFFD 0 |

**数値照合（原文 vs live）**

| effectId | 原文（基本／代わりに） | live 成立時 | live 不成立時 | 形 |
|---|---|---|---|---|
| `WDK06-C08-E1` | −3000 ／ −8000（トラッシュ15枚以上） | **−8000** ✅ | **−3000** ✅ | (a) |
| `WX25-P3-105-E1` | −10000 ／ −12000（同15枚以上） | **−12000** ✅ | **−10000** ✅ | (a) |
| `WXDi-P01-044-E2` | −5000 ／ −10000（同20枚以上） | **−10000** ✅ | **−5000** ✅ | (a) |
| `WXDi-P09-074-E1` | ＋3000 ／ ＋5000（手札5枚以上） | **＋5000** ✅ | **＋3000** ✅ | (a) |
| `WXDi-P10-054-E1` | ＋2000 ／ ＋4000（＜プリパラ＞） | **＋2000＋2000＝＋4000** ✅ | **＋2000** ✅ | (b) |
| `WX25-CP1-020-E1` | EC1 ／ EC2（エナ0枚） | **EC2** ✅ | **EC1** ✅ | (a) |
| `WXDi-P12-081-E1` | EC1 ／ EC2（パワー**ちょうど**15000） | **EC2** ✅ | **EC1** ✅ | (a) |

⚠**`WXDi-P12-081-E1` は `SELF_POWER_GTE{operator:'eq', value:15000}`**＝型名は GTE だが
評価器（`execUtils.ts:2057`）が `cond.operator ?? 'gte'` を読むので **`eq` が効く**（§5-14 確認済み）。
**「ちょうど15000」を `gte` にしていない**＝指示どおり。

### engine 変更の影響範囲を独立に測った

`execPowerModify` の `targetsTriggerSource` 分岐（`effectExecutor.ts:1627-1636`）に
`lastProcessedCards: [autoNum]` を追加している＝**(b) 形で同一対象を指すために必要**。

⇒ **影響範囲は極小**＝live 全体で `POWER_MODIFY{targetsTriggerSource}` のステップは **5件**しかなく、
そのうち**後段が `lastProcessed` を参照するのは `WXDi-P10-054-E1`（本バッチの対象）だけ**。
残り4件は後段に消費者が無く、**巻き込みは0**。
（`POWER_MODIFY` は `DID_IT_GATED_TYPES` に入っていないので did-it ゲートとの干渉も無い。）

### Codex が Claude の見立てを訂正した点（3件・すべて正しい）

1. **算術が合っていなかった**＝26 = 差分加算8 ＋ A群11 ＋ **B群7**（Claude は B群を9と書いた）。
2. **`WX25-P3-014-E1`／`WX25-P3-069-E1` は既に正しかった**＝`SELECT→STORE→cost→gate→CONDITIONAL{…, else:BOUNCE}`
   で**両枝とも `storedTargetCards` の同一対象**を使う。Claude が A-3 として挙げたのは**検出器の偽陽性**
   （入れ子の STUB+CONDITIONAL を拾っていた）。**正準化もしていない**＝正しい判断。
3. **`CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE` は名前どおりではない**＝実コードはカード全文から
   (A) センタールリグレベル条件と (B) 追加コスト／エクシード支払い条件の**2系統**を識別しており、
   B群3件はすべて (B)。**名前から機構を推測すると外す**実例。

### 妥当な見送り

`WX21-039-E1`／`SP27-012-E1` は条件が「**このシグニと共通する色を持たない**他の＜天使＞」軸で、
**続き606 で「既存語彙では表せない」と判定した軸と同一**。Codex は**同じ結論に独立に到達**し、
「(a)(b) とも不可」として未修正のまま残した＝**悪化を避けた正しい判断**。

### 台帳

閉じたのは **finding 単位で6本**。`WXDi-P10-054-E1`／`WX25-CP1-020-E1` は findings に無い＝
実測で新規に見つけた分。残 OPEN **952→947**／段2 消化 **135→141**。
