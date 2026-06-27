# パーサー修正：定量ワークリスト（終わりが見える計画）

> **目的**：パーサー修正を「手当たり次第のキーワード探し」から「**有限の・進捗が測れる**作業」に変える。
> このファイルは計器 `scripts/parserWorklist.ts` の出力スナップショット＋段階計画。
> **数字は `npx tsx scripts/parserWorklist.ts` でいつでも再生成**（live な真実はスクリプト側）。

## 0. 全体の母数（5973効果カード）と「終わり」の定義
| 区分 | 枚数 | 状態 |
|---|---|---|
| parser == 既存JSON | 約5400 | **解決済み**（同型★0で構造検証済み） |
| MANUAL（手書き効果） | 約165 | 意図的にパーサー対象外（型どおり） |
| **held（parser ≠ 既存JSON）** | **404** | ↓ ここが全作業 |

**held の内訳（1カード=1プライマリバケツ・重複なし）** ← 数字は計器の最新値（下の進捗ログ参照）
| トラック | 初期 | 現在 | 性質 | 対応 |
|---|---|---|---|---|
| **① LOSS** | 255 | **234** | 既存JSONが持つ構造をパーサーが出せない＝**真の弱点** | **直す**（この計画の本体） |
| ② VALUE | 149 | 153 | 同キーで値が違うだけ＝慣例/効果分割ズレの水増し | **1件ずつ人間判断**（bulk禁止・§2） |
| ③ ADD/OTHER | 0 | 0 | — | — |
| held合計 | 404 | **387** | | |

### 進捗ログ（LOSS が減る＝前進）
- 2026-06-27 起点: held 404 / LOSS 255。
- 2026-06-27 R1（filter.cardType・crossState条件）: 「(あなた\|相手)の場にクロス状態の[＜X＞の]シグニがある」を COND_STUB→HAS_CARD_IN_FIELD 正規化（engine実装済み）。**filter.cardType 30→16**。held 404→394 / **LOSS 255→241**。JSON無変更（既存が正・パーサーが再現できるようになった）。
- 2026-06-27 R2（filter.color・colorMatchesLrig）: 「トラッシュから(センタールリグと共通する色を持つ)〔シグニ/カード/スペル〕…手札に加える」の名詞句限定で colorMatchesLrig 付与（engine動的解決済み）。**filter.color 11→5**。held 394→388 / **LOSS 241→235**。既存が取りこぼしていた7枚に colorMatchesLrig を純改善採用（latent curation bug 修正）。残5＝WX04-021（filter.color 黒・別件）＋SEARCH/reveal の action.filter 4枚（別handler・follow-up）。
- 2026-06-27 R3（filter.cardType・複数クラスバフ）: 「あなたの[他の]＜X＞と＜Y＞のシグニのパワーを±N」のゲート正規表現が単一クラスしか許さず default（owner:any/count:1）に落ちていたのを複数クラス対応に拡張。WX04-016/086 一致、WXK04-043/WXDi-P11-041 は**既存JSONが旧バグの owner:any/count:1 を保存していた**ため fresh（正）に直接パッチ。held 388→387 / LOSS 235→234 / filter.cardType 16→15。
- 2026-06-27 R8（filter.cardType・任意捨てコスト／ymst）: `parseSentencePart3.ts` 行1053「手札から＜X＞のシグニをN枚捨ててもよい」が `parseCardTypeFilter(＜X＞)` のみでクラスを空 filter に落としていた（捨てる版 part1:1623 と不整合）。cardType:シグニ＋story/color/level を付与。**35枚の空 filter curation bug を純改善採用**。cardClass→story 正規化4枚（WX21-017/018 解消・WXDi-D08-013/P14-084 は optional 脱落が別途残）。**LOSS 216→214**。同型★0維持・typecheck緑。残 filter.cardType は REVEAL一族（WX10-007/021・WXDi-P14-077・WX24-P1-020/WX25-P1-037＝Stage B）と duration慣例絡み（WXDi-P15-093/WX24-P1-076）と POWER_MODIFY全体バフ（WXDi-P12-060）＝いずれも別系統。
- 2026-06-27 R7（count・対戦相手エナ→トラッシュ「N枚まで」／ymst）: handler 行108 の count 抽出 `カード([０-９\d]+)枚` が「カードを２枚まで」の `を` で外れ count:1 に落ちていた（+upToCount 未設定）。`カード(?:を)?(N)枚`＋`枚まで`検出で是正。**WX04-010 解消（LOSS 217→216）**。横展開で **curation bug 17枚**（HEAD が旧パーサー出力の誤値 count:1 を保存・実テキストは「N枚まで」）が顕在化＝§2 慣例ではなく実害データ誤りのため parser 正値を直接採用（全件テキストでN照合）。同型★0維持・typecheck緑。
- 2026-06-27 R6（activeCondition 3系統＋ビート全角ブラケット／ymst）: ①SUBSCRIBER_COUNT「登録者数がN万人を達成しているかぎり」追加（WXK08-061/064＋034/038）②IS_SELF_ACCED に「【アクセ】が付いているかぎり」言い回し追加（WDK07-E11）③**《ビートアイコン》の全角 ［］ 対応**＝`beatIconM` が ASCII `[]` のみで実データ全角を取りこぼし＝最大波及（WXK08-041/042/043/046/067/068/073/075・WXK10-041・WDK14-001/011/012 一族解消）＋【常】の beatCondition を activeCondition へ。**LOSS 231→217 / held 384→371**（18枚・全 pure superset）。同型★0維持。残 activeCondition 2＝WX24-P3-064/WXK07-027（TURN_OWNER↔AND 複合・別構造）。
- 2026-06-27 R5（filter.story・トラッシュ→手札／ymst）: `parseSentencePart1.ts` の TRANSFER_TO_HAND トラッシュ handler が `＜種族＞の` を落としていた（WX03-050 の story:'悪魔'）。`トラッシュから(.*?)手札に加える` の名詞句スパン内に限定して `parseStoryFilter` 付与（全文だと WX22-002 等で前置きの条件クラスを誤拾い＝偽陽性7枚）。**LOSS 234→233 / held 387→386**。retrieved-card の class フィルタ取りこぼし132枚を収穫マージで純改善採用（全て pure superset）。同型★0維持。残3枚の filter.story（WX20-026/WX21-Re09/WX22-046）は条件/トリガーfilter/コストの別構造＝別ラウンド。
- **⚠ R3 の重要発見＝filter.cardType バケツは「単一クリーン修正」ではない**：worklist 上は primary 16 だが、cardType 脱落は実は **84箇所に分散**し、その多くが STUB↔REVEAL_AND_PICK／STUB↔GRANT_ACCE_HOST_ABILITY／DECK_TOP_MATCHES↔REVEAL_AND_PICK 等の**構造差（action.type バケツ）と絡む**。`makeRevealPickStub` は filter 無し STUB を返す、`これにアクセされている…を得る` は STUB を返す等。**→ filter.cardType は「LOOK_PICK系」「アクセGRANT系」「deck-top条件系」「複数クラスバフ(R3で対処)」等の下位パターンに割って、構造修正（Stage B）とセットで進める必要がある**。純粋な属性付与の局所修正で片付くのは crossState(R1)/colorMatchesLrig(R2)/複数クラス(R3) のような一部のみ。

### 🎯 完了条件（Definition of Done）
- **LOSS 255 → 0**。各バケツは枚数とカードIDが確定した**ミニプロジェクト**。直すたびに計器の数字が減る＝進捗が可視。
- LOSS が 0 になれば、パーサーは「既存JSONを値変更を除いて完全再現」＝表現の地盤が完成。
- VALUE 149 は別トラック（パーサー修正ではない）。多くは効果分割ズレの偽差分（§backlog参照）。最後にまとめて逆翻訳レビューで潰す。
- 全工程を通して **同型★0 を維持**（grouped_all.txt）。

---

## 1. ① LOSS バケツ（直す対象・255枚・ランク順）
> 各行＝「この構造をパーサーが落とす」カード群。バケツ内のカードを開いて共通の言い回しを見つけ、narrow な正規表現で直す（**全文スキャン禁止**＝§backlog の教訓）。
> 代表IDのみ記載。**全IDは計器を実行**して取得。

| 優先 | バケツ | 枚 | 性質・着手メモ | 代表ID |
|---|---|---|---|---|
| **A（高利得・局所）** ||||  |
| A1 | filter.cardType | 30 | 対象の cardType 脱落。名詞句限定で付与 | WX07-002〜005/014/018/020, WX08-001〜003 |
| A2 | filter.color | 11 | 「赤の」等の色脱落。多くは matchesLrig 系 | WX04-021/026, WDK01-010, PR-457 |
| A3 | count | 11 | 対象数の取り違え | WX12-051/052, WX25-P1-018, SPDi44-04 |
| A4 | activeCondition | 7 | 〜があるかぎり/アクセ等の発動条件脱落 | WXK04-080, WXK08-061/064/073 |
| A5 | filter.story | 4 | 「＜種族＞の」脱落 | WX03-050, WX20-026, WX22-046 |
| A6 | upToCount | 4 | 「N体まで」の upTo 脱落 | WX04-010, WX25-CP1-030, WXK04-030 |
| **B（中・アクション形）** ||||  |
| B1 | action.type | 77 | アクション種別を誤出力（最大）。下位パターンに要再分割 | WX02-018, WX03-046, WX11-021, WX16-054 |
| B2 | filter（その他） | 31 | frontOfSelf/thisCardOnly 等の細フィルタ脱落 | WX17-033, WX21-022, WXDi-P01-011 |
| B3 | then/steps | 1 | 後続処理欠落 | WXK05-030 |
| **C（トリガー検出）** ||||  |
| C1 | triggerCondition/Scope/Filter | 43 | トリガーの詳細条件・範囲脱落 | WX02-073, WX10-074/078/080/083 |
| C2 | condition.type（その他） | 15 | 条件型の脱落（WXK08系に集中） | WXK08-026/041〜046/067〜075 |
| C3 | timing（取りこぼし） | 8 | トリガー種別を出せていない | WX15-058, WX17-075/077, WDK07-E14 |
| C4 | effectType | 7 | CONTINUOUS/AUTO 等の取り違え | WX15-102/105, WX21-041 |
| 端数 | action.id ほか単発 | 6 | 個別 | WX04-011/015, SP27-016 |

**合計 255**（計器が真値）。

### 着手順の推奨
1. **Stage A（67枚）**：局所的な「属性付与漏れ」。これまでのレゾナ/種族系と同型＝低リスク高利得。filter.cardType→color→count→activeCondition→story→upToCount。
2. **Stage C（73枚）**：トリガー検出の穴。WXK08系（C2）は同じ壊れ方で固まっており横展開しやすい。
3. **Stage B（109枚）**：action.type 77 が最大の山。**まず77を下位パターンに再分割**（「並べ替え退化」「BLOCK_ACTION退化」等）してから着手。engine ハンドラ不在のものは §5 機構として実装（乖離を作らない）。

---

## 2. ② VALUE トラック（149枚・パーサー修正ではない）
| バケツ | 枚 | 備考 |
|---|---|---|
| timing（値違い） | 111 | **大半は効果分割ズレの偽差分**（1AUTO↔2AUTO等で index がずれ見かけ上 timing 違い）。逆翻訳レビューで1件ずつ。bulk変更禁止 |
| parseStatus | 12 | 表示メタ。実害薄 |
| action.type（値違い） | 10 | 1件ずつ原文照合 |
| owner / then / 他 | 16 | 同上 |

→ **これらはパーサーのキーワードを増やしても減らない**。LOSS を 0 にした後の最終レビューパスでまとめて扱う。

### ⚠ 着手しないと判断済みの慣例案件（再調査防止）
- **duration「次の対戦相手のターン終了時まで」→ UNTIL_OPP_TURN_END**：句が「ターン終了時まで」を部分包含し誤判定するのが根本だが、**既存JSONも145枚が UNTIL_END_OF_TURN（事実上の慣例）**。直すと145枚が新規 held 化する bulk 値変更＝据置（`parser_backlog.md` 参照）。

---

## 3. 運用
- **進捗の見方**：`npx tsx scripts/parserWorklist.ts` の `LOSS` 合計が減る＝前進。0が完了。
- **1ラウンド**：LOSS の1バケツ（or 下位パターン）を選ぶ → narrow 修正 → `npm run build:effects`（収穫マージ）→ 計器で当該バケツ減を確認 → typecheck＋同型★0 → commit。
- **同型★0 と典型カードの逆翻訳一致**を毎回ゲートにする（件数だけを信じない＝§2）。
- **⚠ build 後は held 合計が増えていないか必ず確認**（新ハンドラが他カードを横取りすると +N 退行する。R4 参照）。

## 🅑 Stage B 着手記録：LOOK/REVEAL_AND_PICK 一族（最大レバー・要surgical）

action.type 77 を fresh 出力で分解すると **約半分が LOOK/REVEAL 一族**（25 LOOK_AND_REORDER 退化 ＋ 8 REVEAL_AND_PICK/DRAW ＋ singleton 多数）。filter.cardType / count / then-steps / upToCount の脱落も同時に生む**最大の cross-bucket レバー**。だが着手で重要な制約が判明：

### R4（2026-06-27）＝**広域ハンドラ追加は厳禁**（+129退行→全revert）
- 「N枚見る→その中から〔filter〕をM枚(まで)〔手札/場/エナ〕→残りデッキ下/上」を REVEAL_AND_PICK 化する**新ハンドラを早い位置に追加**したら **held 387→516（+129）の大規模退行**。原因＝この一族は既存ハンドラ（`LOOK_PICK_CHAIN`／結合処理 effectParser.ts:1373／`makeRevealPickStub` 等）が**既に広範にカバー**しており、早い位置の広域 match が正しく処理されていたカードを横取りした。→ **即 revert（held 387 復帰）**。
- **教訓**：新ハンドラ追加は不可。**既存の誤発火分岐をピンポイント修正**せよ。具体的には effectParser.ts **1206 の第1分岐(1210)** `その中から.*(?:デッキ|トラッシュ)` が**残り句の「デッキ」で誤発火**し pick を持つ文まで LOOK_AND_REORDER に潰す＝ここに「手札に加え|場に出|エナゾーンに置 を含むなら発火させない」ガードを足し、第2分岐(1222)を 場/エナ＋pickUpTo＋story へ拡張するのが正道。**毎回 build→worklist で +N 退行ゼロを確認**。

### この一族の正解形マッピング（確定済み・次の実装者へ）
- 単一pick: `REVEAL_AND_PICK{owner:self, revealCount, filter, pickCount, pickUpTo?(「N枚まで」), pickNoun?(カード/スペル時のみ), then, remainder}`。このキー順で WXDi-P01-018/WXDi-D05-007/WX24-P1-036/WXDi-P16-060/WXDi-D04-012 が IDENTICAL/SUPERSET になった（R4で検証済み）。
- `then`：手札に加え→`ADD_TO_HAND` ／ 場に出(す/し)→`ADD_TO_FIELD` ／ エナゾーンに置(く/き)→`ADD_TO_ENERGY`。
- `filter`：noun=シグニ/スペル→`cardType`、カード→cardType無し＋`pickNoun:'カード'`。＜X＞→**`story`**。色共通→`colorMatchesLrig`、《ガードアイコン》→`hasGuard`、レベル→`level`。「を」は noun と枚数の間で**任意**（「スペル１枚」）。
- **場に出す＋「シグニの【出】能力は発動しない」**＝`SEQUENCE{steps:[REVEAL_AND_PICK, BLOCK_ACTION{target:PLAYER/self, actionId:'ON_PLAY_ABILITY', until:'END_OF_TURN'}]}`。
- **story/cardClass は engine・decompiler とも完全に同一視**（execUtils 231/237＝両方 card.CardClass.includes）。REVEAL_AND_PICK filter は **story が124枚で規約・cardClass はわずか7枚**（WX16-054/WXDi-D02-18AT/WX24-P1-053/WX24-P2-061/WX25-P3-054/WXK02-045/SP27-009）。この7枚を story 正規化してから進めると IDENTICAL になる。
- 多段（手札＋場の2段）は `LOOK_PICK_CHAIN`（WX24-P1-026/WX25-P1-039/WXDi-P02-020/WXDi-P16-035 等）＝別サブパターン。WXDi-P00-045 は既存JSONが旧 LOOK_AND_REORDER（要個別確認）。
