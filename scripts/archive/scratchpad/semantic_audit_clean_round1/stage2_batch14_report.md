# 段2 第14バッチ報告

## 1. 触ったファイル

- `src/data/effectParser.ts`：原文照合済み10効果の条件復元と誤付着除去。
- `scripts/goldenTest.ts`：Condition／ActiveConditionの正負E2Eと既存集合カウンタ更新。
- `scripts/vocabCensus.ts`：実測733へbaseline更新。
- `public/data/effects_WX.json`／`effects_WX24_26.json`／`effects_WXDi.json`／`effects_WXK.json`：live 10効果。
- `docs/decompile_sheet1/2/3/8/9.txt`、`grouped_sentence_all.txt`、`_held_fresh.json`、`_held_review.txt`、`_vocab_census.txt`、`_census_stubs.txt`：regen／計器生成物。
- `docs/BUGFIXES.md`：一次記録。

開始時点で既に変更済みだった `_census_clusters.txt`／`_census_wiring.txt`／`_timing_census.txt` は保持。PLAN系は未編集。

## 2. Claudeの見立ての検証

- `tmp_b14e.mjs` は24効果（AUTO 16 / MANUAL 8）を再現。複数の場条件語彙を除外しており、`HAS_CARD_IN_FIELD` だけで数えた28件ではない。
- 型は `effects.ts:183`（ActiveCondition）／`:305`（Condition）。現HEADの関数本体は `checkActiveCondition` が `effectEngine.ts:60`（case `:147`）、`evalCondition` が `execUtils.ts:1556`（case `:1713`）。指定case行は合うが関数行としては訂正。
- `distinctNames`／`distinctColors` は両型・両評価器で実集計される。`NO_COMMON_COLOR_AMONG_FIELD_SIGNI` は場全体の相互比較＋指定体数一致で、効果元との色比較ではない。

## 3. A群8＋A2群5

| effectId | 原文条件 → 生成JSON | 評価器 | 誤付着／§5-25の読み／逆翻訳 |
|---|---|---|---|
| WX17-067-E1 | 手札3枚以下＋場に＜凶蟲＞ → `AND[HAND_COUNT{self,lte,3},HAS_CARD_IN_FIELD{self,{story:'凶蟲'}}]` | evalCondition | 誤付着なし。「3枚以下」をlte 3、「あなたの場」をself。全体一致。 |
| WX25-P2-054-E2 | 他の＜電機＞＋相手エナ2枚以上 → `AND[HAS_CARD_IN_FIELD{self,{story:'電機'},excludeSelf:true},ENERGY_COUNT{opponent,gte,2}]` | evalCondition | 「他の」をexcludeSelf、「対戦相手」をownerへ。全体一致。 |
| WX25-P3-080-E1 | 選択肢②の緑の＜龍獣＞＋相手エナ2枚以上 → choice②だけに `AND[HAS_CARD_IN_FIELD{self,{color:'緑',story:'龍獣'}},ENERGY_COUNT{opponent,gte,2}]` | evalCondition | 「②だけ」をchoice conditionへ。全体一致。 |
| WX26-CP1-068-E1 | 他の＜プリオケ＞ → `HAS_CARD_IN_FIELD{self,{story:'プリオケ'},excludeSelf:true}` | evalCondition | 「他の」をexcludeSelf。全体一致。 |
| WXDi-CP02-085-E2 | 自身5000以上＋他の＜ブルアカ＞ → `AND[SELF_POWER_GTE{5000},HAS_CARD_IN_FIELD{self,{story:'ブルアカ'},excludeSelf:true}]` | evalCondition | 相手対象のstory除去。「このシグニ」をSELF_POWER_GTEへ。全体一致。 |
| WX09-025-E1 | ＜鉱石＞か＜宝石＞合計3体 → `HAS_CARD_IN_FIELD{self,{story:['鉱石','宝石']},minCount:3}` | evalCondition | 相手対象のstory除去。「か」を配列、「合計3体」をminCount。全体一致。 |
| WX14-024-E1 | 緑の＜美巧＞2体以上あるかぎり → `activeCondition:HAS_CARD_IN_FIELD{self,{color:'緑',story:'美巧'},minCount:2}` | checkActiveCondition | 【常】なのでactiveCondition。「2体以上」をminCount。全体一致。 |
| WXEX2-03-E1 | 引用①＜天使＞があるかぎり → 付与能力に `activeCondition:HAS_CARD_IN_FIELD{self,{story:'天使'}}`、対象`LRIG opponent` | checkActiveCondition | SIGNI誤対象除去。「センタールリグ」をLRIGへ。引用①一致、引用②欠落で効果全体は部分一致。 |
| WXK05-033-E1 | 名前の異なる＜植物＞3体 → `HAS_CARD_IN_FIELD{self,{story:'植物'},minCount:3,distinctNames:true}` | evalCondition | 「それぞれ名前の異なる」をdistinctNames。全体一致。 |
| WX21-051-E1 | ＜天使＞の色が合計2種類以上 → `HAS_CARD_IN_FIELD{self,{story:'天使'},minCount:2,distinctColors:true}` | evalCondition | 相手対象のstory除去。「色が合計2種類」をdistinctColors。全体一致。 |
| WX21-032-E1 | 効果元と共通色を持たない他の＜天使＞ | 据置 | — | 誤付着未除去。既存型で効果元比較不能。storyだけ消す過剰化を避けた。 |
| SP27-012-E1 | 同上＋相互に共通色なし3体なら代わりに | 据置 | — | 効果元比較と排他的置換が不足。DRAW1＋DRAW2の現状は残る。 |
| WX21-039-E1 | 同上、代わりにEC2 | 据置 | — | 同理由。EC1＋EC2の現状は残る。 |

採用効果が通る側で `excludeSelf`、minCount、distinctNames、distinctColorsを読むことを確認済み。

## 4. B群11件の見送り

- `WX10-031-E1`／`WX12-049-E1`：スペル使用コスト軽減でuseTimeCost＋SpellCastModal経路。
- `WX20-006-E1`：アーツ使用コスト軽減でArtsModal経路。
- `WXDi-D01-021-E1`／`WXDi-D02-29-E1`／`WXDi-D03-021-E1`／`WXDi-D04-021-E1`／`WXDi-D05-021-E1`／`WXDi-D06-021-E1`／`WXDi-D09-P27-E1`：MANUALかつルリグ3体条件付き「代わりに」。parserだけでは届かない。
- `WXDi-P16-056-E1`：＜解放派＞シグニの下カード合計4枚で、場カード数とは別軸。

MANUAL 7件の条件部分は `HAS_CARD_IN_FIELD{owner:'self',filter:{cardType:['ルリグ','アシストルリグ'],story:'各チーム'},minCount:3}` で書ける。両評価器がセンター＋左右アシストを走査しcardType配列を扱う。ただし置換本体まで揃えず部分採用しない。

## 5. 条件以外の食い違い

新規発見0件。指示内既知の `WXEX2-03-E1` のSIGNI誤対象は修正、第2引用欠落は見送り。A2の二重実行は既知のまま。

## 6. ゲート before / after

| 計器 | before | after |
|---|---:|---:|
| golden | 2358 / 0 | 2360 / 0 |
| census | 742 / 742 | 733 / 733 |
| smoke | 10693・異常0・SKIP0 | 10693・異常0・SKIP0 |
| fuzz | 全0 | 全0 |
| census:stubs | 無言A 0 / C 0 | 無言A 0 / C 0 |
| manual-fields | 0 | 0 |
| lint | 0 errors / 260 warnings（提示値） | 0 errors / 261 warnings |
| groupSimilar | ★0 | ★0 |
| held / partial / idset | 92 / 15 / 46 | 95 / 15 / 46 |
| live総数 | 10693 | 10693 |

lint +1は今回未変更の `SpellCastModal.tsx` のHook警告。提示値との差として申告する。

## 7. 生パースdiff・outlier・parseStatus

live変化は10効果のみ：`WX09-025-E1`、`WX14-024-E1`、`WX17-067-E1`、`WX21-051-E1`、`WXEX2-03-E1`、`WX25-P2-054-E2`、`WX25-P3-080-E1`、`WX26-CP1-068-E1`、`WXDi-CP02-085-E2`、`WXK05-033-E1`。追加0、削除0、outlier 0。全件`AUTO→AUTO`、parseStatus変化0。

## 8. held / partial / idset・lint

- held 92→95。対象でheld入りした4カード（WX09-025／WX21-051／WXDi-CP02-085／WXEX2-03）は全件原文照合して`--adopt`済み。残+3はbuild時の既存fresh差分。
- partial 15→15、idset 46→46。
- lint 260（提示値）→261、errors 0。今回変更ファイル由来の警告0。

## 9. やらなかったこと

- A2後半3件は未修正。WX21-032の誤付着、SP27-012／WX21-039の二重実行は残る。
- WXEX2-03の第2引用能力は未修正。第1能力だけ改善し、効果全体の逆翻訳は不一致のまま。
- B群11件は調査のみ。
- 新条件型、engine変更、force-adopt、pure-superset巻き戻し、PLAN系編集、commit、pushは未実施。
- 採用10効果に「今より悪くなった効果」は0。据置効果の既知不具合は改善していない。

---

## 【Claude 検証節】2026-08-22 続き606

**結論＝採用。** ゲート全緑・live 変化 **10効果ちょうど**・条件値は10/10 が原文と一致・誤付着の除去も3件すべて確認。

### 独立実行した検証

| 項目 | 結果 |
|---|---|
| `npm run gates` | 全緑（golden **2360/0**・census **733/733**・smoke 10693 全異常0 SKIP0・fuzz 全0・stubs A🔴0 C0・manual-fields 0・lint **0 errors 261 warnings**） |
| `groupSimilar --all` | 同型★ **0** |
| live 機械 diff（ベースライン `0e5c9161f`） | 変化 **10効果**＝申告と一致。追加/削除0・兄弟効果の巻き込み0・`parseStatus` 変化0 |
| 条件値の原文照合（10件全数） | **10/10 一致**。「か」→配列（`WX09-025`）／「合計３体」→`minCount:3`／「２種類以上」→`distinctColors`／「名前の異なる」→`distinctNames`／「他の」→`excludeSelf`／【常】→`activeCondition` すべて正しい |
| 誤付着の除去 | `WX09-025-E1`・`WX21-051-E1`・`WXDi-CP02-085-E2` の**対象フィルタから `story` が消えている**ことを実データで確認＝**過小実行側も直った** |
| census ベースライン更新 | `scripts/vocabCensus.ts` の diff は**定数と履歴コメントのみ**（742→733）。実測と一致 |
| §5-19 エンコーディング | 全変更ファイルで BOM(`efbbbf`) 0／U+FFFD 0 |

### 🔴 Claude 側のベースラインが誤っていた（Codex の申告が正しい）

報告§6 の「lint 260→261」は **Codex が正しい**。`git stash` して HEAD `0e5c9161f` で `npm run lint` を
実行し直したところ **261 warnings**＝**ベースライン自体が 261 だった**（Claude が続き605 の
`BattleScreen.tsx` 改変で1本増えたのを恒久指標へ反映せず、260 のまま指示書へ書いた）。
⇒ **今回の変更による lint 増減は 0。** 恒久指標を 261 へ訂正する。

### 🔴 held の申告値がずれていた（+3 は実体の無い stale）

報告§8 は「held 92→95、残+3 は build 時の既存 fresh 差分」としているが、**+3 の正体は
このバッチ自身の3カード**（`WX09-025`／`WX21-051`／`WXDi-CP02-085`）で、
**fresh と live を突き合わせると完全一致**＝採用済みなのに `_held_fresh.json` が
再生成されていないだけの**stale**だった。

⇒ `npm run build:effects` を回し直したところ **held 92→91**（`WXEX2-03` が**解消**）、
新規 held **0**、live diff は10効果のまま不変。**真の値は 91。**
⚠**CODEX_GUIDE §6 の但し書き（held の申告値は「報告直前に `build:effects`→`heldReview` を
再実行した実測値」であること）が守られていない**＝続き252 と同じ再発。

### 妥当な見送り（A2群3件）

`WX21-032-E1`／`SP27-012-E1`／`WX21-039-E1`＝「**このシグニと共通する色を持たない**他の＜天使＞」は
**効果元との色比較**で、`NO_COMMON_COLOR_AMONG_FIELD_SIGNI`（場全体の相互比較）とは別物。
Codex はこれを実コードで確認し、**「`story` だけ消すと過剰化する」ため誤付着も直さず据置**とした。
⇒ **判断は正しい**（片方だけ直すと退化する）。`SP27-012-E1`／`WX21-039-E1` の
**「代わりに」置換が効かず両方実行される**問題も残置＝**次の題材**。

### 台帳

閉じたのは **finding 単位で11本**。⚠§5-3-4′ に従い、`WXEX2-03-E1` の
「場とトラッシュにある」（＜古代兵器＞側の**第2引用能力**）は**未修正なので閉じていない**。
`WX25-P3-080-E1` の「選択肢①の対象選択者」も別軸なので閉じていない。
残 OPEN **970→959**／段2 消化 **117→128**（今バッチで11本＝これまでで最多）。
