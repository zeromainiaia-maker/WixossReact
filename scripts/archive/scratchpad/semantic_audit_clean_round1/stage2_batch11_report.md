# 段2 第11バッチ報告 — 「そうした場合」did-it ゲート

## 1. 触ったファイル

- `src/engine/effectExecutor.ts` — 既存did-it対象5型の追加、成功記録、空振り前リセット、任意REVEALの既存フィールド消費。
- `scripts/goldenTest.ts` — 5型の空振り／成功E2Eと任意REVEALの辞退／実行E2Eを追加。
- `docs/_census_stubs.txt` — `npm run census:stubs` がengine行番号だけを再生成（意味・件数変更なし）。
- 本報告 `tmp_stage2_batch11_report.md`。`public/data/effects_*.json`、parser、型宣言、PLAN/PLAN_PROGRESSは変更0。

## 2. Claude の見立ての検証

結論：母集団998、既存慣例による除外969（647+84+247+24）、未捕捉29は再現した。`tmp_b11_real4.mjs` 再実行結果も一致した。

1. `IS_MY_TURN` は `execUtils.ts:2143` で無条件 `true`。相手ターン過小実行という説明は誤りで、実害は前段空振り／辞退時の後段過剰発火だけ。
2. 直下STUB入口は `effectExecutor.ts:4034`。個別id分岐を抜けたcatch-allも同じ `if` の関数内にあり、pay/skipの `CHOOSE` を `needsInteraction` でreturnする。647件を素通ししない。
3. 条件包みは `:3869-3870` の `OPT_IDS_WRAP`、離れた任意コスト／Pattern⑤は `:4651-4652`。84件を既存pay/skip枝へ委譲する。
4. `DID_IT_GATED_TYPES` は `:3816`、空振り消費本体は `:4886`。247件は直前処理結果0枚でplaceholderだけを消費する。
5. 使用時コスト軽減markerは `effectParser.ts:14989-15008` の `USE_TIME_COST_PAY_STUBS`／`stripUseTimeCostReductionStep`。24件の支払処理はengine action本体ではなくuse-time側であり、no-op marker判定は妥当。

行番号はすべて当該関数境界内を再確認した。Claude表への件数訂正は不要。ただしAの `WXDi-P11-075-E1` ①はsource無しREVEALで、公開処理そのものが既存no-opという別不一致がある。

## 3. A群14効果

共通修正：`DID_IT_GATED_TYPES` に `REVEAL / TAKE_FROM_UNDER_SIGNI / REMOVE_CHARM / ADD_TO_FIELD / FIELD_SIGNI_TO_ACCE` だけを追加。REVEAL・TAKE・REMOVE・FIELD→ACCEはstep直前に履歴を空へ倒す。ADD_TO_FIELDは動的 `countFromZone` が直前履歴を読むため事前リセットせず、候補0は既存 `selectOrInteract` の空記録、成功は `execAddToField:2894-2947` で実配置カードだけを記録する。

| effectId | 原文前段 → 後段 / 型 | 空振り記録・修正後 | 外した慣例（§5-25） / 逆翻訳照合 |
|---|---|---|---|
| WDK08-Y17-E1 | 水獣3枚公開 → +1000・ランサー / REVEAL | `execReveal:1294` が `[]`。空振り不発、3枚公開成功時だけ付与 | 直下STUBなし、任意コストなし、旧did-it外、cost markerでない。逆翻訳は+1000表示が欠ける既存不一致（keyword付与木のみ） |
| WX22-044-E1 | 龍獣1枚を公開してもよい → +5000 / REVEAL optional | 候補0は`:1294`、辞退はresumeで0枚。`optional`を`:1310`で消費し辞退可能化 | 無コスト任意だがOPTIONAL_ACTIVATE前置なし、Pattern④/包みなし、旧did-it外、marker外。逆翻訳全体は原文一致 |
| WXDi-P10-045-E1 | プリパラ1枚を公開してもよい → +4000 / REVEAL optional | 上と同じ。辞退不発、公開成功時だけ付与 | STUB interceptなし、Pattern④なし、旧did-it外、marker外。逆翻訳全体は原文一致 |
| WXDi-P11-075-E1 | ①L1/2/3公開→EC1、②水獣3公開→1ドロー / REVEAL×2 | ①source無しは`:1316` no-opで事前reset後常に不発。②候補0`[]`／成功時発火 | CHOOSE枝内に直下STUBも任意コストもなく、旧did-it外、marker外。逆翻訳は①公開内容欠落で不一致、②一致 |
| WXK05-044-E1 | L3以上水獣公開 → 同名サーチ / REVEAL | 候補0`[]`。成功時resumeが公開札を再記録し `nameEqLastProcessed` を保持 | STUBなし、Pattern④なし、旧did-it外、marker外。同名照応を含め逆翻訳一致 |
| WX21-042-E2 | この下1枚をtrash → deck topをenergy / TAKE_FROM_UNDER_SIGNI | `execTakeFromUnderSigni:6282` の候補0done持越しを事前reset。成功選択はresumeが再記録 | コストSTUBでなく実移動action、任意コスト系なし、旧did-it外、marker外。逆翻訳一致 |
| WXEX1-35-E2 | 下2枚をtrashしてもよい → self up / TAKE_FROM_UNDER_SIGNI | 下0で不発、0枚辞退も既存optional continuation strip、2枚成功でup | STUB interceptなし、Pattern④なし、旧did-it外、marker外。逆翻訳一致 |
| WXDi-P08-044-E2 | 置換で下2枚trashしてもよい → self down / TAKE_FROM_UNDER_SIGNI | 下0／辞退で不発、成功時だけdown | 置換節内の実actionでSTUB/Pattern④/旧did-it/marker全て外。逆翻訳は置換の完全な発生制御を表せず既存近似 |
| WX10-088-E1 | 相手charm1枚trash → L2以下黒signi回収 / REMOVE_CHARM | `execRemoveCharm:6890` が常にremovedCards（0なら`[]`）。成功時だけ回収 | 支払いSTUBでなくcharm状態移動、任意コストなし、旧did-it外、marker外。逆翻訳一致 |
| WXEX1-28-E2 | 相手charm1枚trash → 凶蟲回収 / REMOVE_CHARM | 同上 | 起動処理だがSTUB intercept対象でなく、Pattern④なし、旧did-it外、marker外。逆翻訳一致 |
| WX20-034-CB-E1 | 手札の非白L3以下遊具を場へ任意 → 1draw / ADD_TO_FIELD | 候補0はselectOrInteractが`[]`、辞退0枚、成功時`:2945-2947`が配置札を記録 | action自身のoptionalでSTUBなし、Pattern④/包みなし、旧did-it外、marker外。逆翻訳一致 |
| WX20-039-CB-E1 | 非赤L3以下遊具を任意配置 → 対象banish / ADD_TO_FIELD | 上と同じ。配置成功時だけbanish | 前置対象とは別に配置成否を見る必要があり、STUB/任意コスト/旧did-it/markerに非該当。逆翻訳は先行対象固定がなく既存近似 |
| WXK05-024-E3 | 手札0ならselfをtrashから場へ → 相手をtrash / 条件包みADD_TO_FIELD | 条件偽は既存`wrapCondFalse`で`[]`。条件真でも候補0は空、配置成功だけ記録 | 包みのthenはADDで `OPT_IDS_WRAP` 3 id外、直下STUBなし、旧did-it外、marker外。逆翻訳一致 |
| WXEX2-19-E2 | アクセicon持ちsigniを他の調理のacceへ → 1draw / FIELD_SIGNI_TO_ACCE | 元／hostなしdone持越しを事前reset。2段選択成功時resumeが選択札を記録してdraw | 専用2段interactionでSTUBなし、任意コストなし、旧did-it外、marker外。逆翻訳一致 |

## 4. B群8件・C群7件

### B（実装なし）

- `WX22-008-E2`：COUNTER_SPELL本体はBattleScreen、engine `:7355` はno-opで記録なし。型追加なら常時不発。
- `WXK05-004-E1`：CHOOSE④も同じno-op。EC4をdid-itで判定できない。
- `WXK06-016-E1`：コスト軽減marker後のCOUNTER_SPELLも同じ。marker除去と打消し成功は別経路。
- `WXK06-078-E1`：`execEnergyChargeFromDeck:2083-2098` は必ず実行・記録する。必要なのはparserの「してもよい」復元。
- `WX21-025-E2`：トラップアイコン節をGRANT_KEYWORDへ化かした構造誤り。did-it対象化すると常時抑止。
- `WX21-036-E1`：同じく本来の任意支払い／トラップ処理がGRANTへ崩壊。
- `WXEX1-67-E1`：同じくGRANT_KEYWORDは支払い成功を記録しない。
- `WXK05-070-E1`：`CONDITIONAL{TURN_OWNER,then:TARGET_AND_DISCARD_HAND}` 包みで直下STUB intercept外、`OPT_IDS_WRAP` 3 id外。許可id拡張の別機構。

### C（変更なし）

- `SPDi43-21-E1`：先頭OPTIONAL_ACTIVATE。Pattern⑤がskipなら残り全体を落とし、payならDRAW以降を実行。
- `WX07-003-E1`：同じOPTIONAL_ACTIVATEで任意draw辞退を保護。
- `WX17-030-E1`：同じ。各attack phaseの任意drawだけを包む。
- `WXDi-D09-P17-E1`：同じ。天使場出しtrigger後の任意drawを包む。
- `WX25-CP1-046-E2`：条件包みOPTIONAL_COSTを `OPT_IDS_WRAP` が解体し、power分岐を含むpay枝へ委譲。
- `WXK08-053-E1`：OPTIONAL_COST系が先行し、IS_MY_TURNは支払い側の帰結内。
- `WXDi-P14-085-E1`：先頭OPTIONAL_COSTをPattern⑤が処理し、snapshot条件列はpay枝でのみ実行。

## 5. 条件以外の原文差

3点。今回直したのは(1)だけ。

1. `WX22-044-E1` / `WXDi-P10-045-E1`：`RevealAction.optional` が非ALL選択経路で死んでおり辞退不能だった。既存フィールドを消費するよう修正し両枝E2E追加。
2. `WXDi-P11-075-E1` ①：source無しREVEALで「L1/L2/L3を1枚ずつ公開」がno-op。今回はparserを触らず安全側（後段EC1不発）に留めた。
3. `WDK08-Y17-E1`：live後段にPOWER_MODIFYがなく、+1000が欠落。今回のdid-it条件外なので未修正。

## 6. ゲート before / after

| 計器 | before | after |
|---|---:|---:|
| golden | 2353/0 | 2355/0 |
| census | 742/742 | 742/742 |
| smoke | 10693・全異常0・SKIP0 | 同左 |
| fuzz | 全0 | 全0 |
| census:stubs | A無言0 / C0 | 同左 |
| check:manual-fields | 0 | 0 |
| lint | 0 errors / 260 warnings | 同左 |
| groupSimilar --all | ★0 | ★0 |
| held / partial / idset | 92 / 15 / 46 | 92 / 15 / 46 |
| live効果総数 | 10693 | 10693 |

最終 `npm run gates`：**全緑**。typecheck PASS、golden 2355/0、smoke 10693全異常0・SKIP0、fuzz全0、census 742/742、census:stubs無言no-op 0、manual-fields 0、lint 0 errors / 260 warnings。

## 7. 生パース diff と outlier

parser、型宣言、CSVは変更0。`git diff -- src/data/effectParser.ts src/types public/data/CardData_*.csv` は空で、この作業起因のraw fresh変化集合は **changed 0 / added 0 / removed 0 / outlier 0**。live JSONも全5ファイル差分0。既存 `tmp_stage2_before/after` は前バッチ途中の異なる時点（時刻も別）なので今回のA/B基準には使用していない。

## 8. buckets / lint

`_held_fresh` 92→92、`_partial_fresh` 15→15、`_idset_fresh` 46→46。各added/removed集合は空。lintは0 errors / 260 warningsで増減0。

§5-22：変更していない既存処理は行単位diffで不変を確認した。`execEnergyChargeFromDeck:2083-2098`、STUB catch-all本体、Pattern④/⑤、包み形、COUNTER_SPELL dispatcher、`stripDidItConditional`、型宣言、BattleScreen/useTimeCostはdiff hunk 0。engineの差分は `git diff -U0` で `execReveal:1310`、`execAddToField:2894-2947`、集合`:3819`、reset`:4825-4831` のみ。

## 9. やらなかったこと

- B8・C7は一切実装変更していない。
- COUNTER_SPELL、ENERGY_CHARGE_FROM_DECK、GRANT_KEYWORD、包みSTUB許可idをdid-it集合へ追加していない。
- `WXDi-P11-075-E1` ①のparser構造、`WDK08-Y17-E1` の+1000欠落、置換の完全モデル、対象先行固定は直していない。
- 新action型・新condition型・force-adopt・manual/live JSONパッチを作っていない。
- build:effects / regen / held採用を行っていない。effects JSONは変更0。
- PLAN / PLAN_PROGRESSを編集していない。commit / pushしていない。

---

## 【Claude 検証節】2026-08-22 続き603

**結論＝採用。** 数値申告は全項目一致・スコープ外変更0。

### 独立実行した検証

| 項目 | 結果 |
|---|---|
| `npm run gates` | 全緑（typecheck / golden **2355/0** / smoke 10693 全異常0 SKIP0 / fuzz 全0 / census **742/742** / census:stubs A🔴0 C0 / manual-fields 0 / lint **0 errors 260 warnings**） |
| `node scripts/groupSimilar.mjs --all` | 同型★ **0** |
| `git diff f2cdb1f7c -- public/data/ src/data/` | **空**＝JSON・parser・CSV 変更0（申告どおり） |
| 変更ファイル | 3本（`effectExecutor.ts` / `goldenTest.ts` / `docs/_census_stubs.txt`）。stubs は**行番号だけ**の再生成を diff で確認 |
| §5-19 エンコーディング | 全変更ファイルで BOM(`efbbbf`) 0 / U+FFFD 0 / `???` 0 |
| 構造の機械再計測（`tmp_b11_real4.mjs` の DIDIT に5型を足して再実行） | 未捕捉候補 **29→15**＝A群14効果がちょうど閉じた。残15＝B群8＋C群7（想定どおり） |

### engine 差分の副作用を独立に潰した

1. **`REVEAL` の事前リセットが `SEARCH` 経路を壊さないか**＝live には bare `{type:'REVEAL'}` が
   **278件**（ほぼ `SEARCH.then = SEQUENCE[REVEAL, ADD_TO_HAND]`）あるが、これは
   `applyDirectAction:9766` の `SEQUENCE` case が `cardNum` を引き継いで回す経路で、
   **`execSequence` を通らない**＝事前リセットは届かない。**回帰なし**。
2. **`execSequence` 経路の REVEAL は16件だけ**（後続ステップあり）。うち bare は4件で、
   3件（`WXDi-P09-063-E1`／`WXDi-P14-075-E1`／`WXDi-CP02-074-E1`）は後続が
   `CONDITIONAL{DECK_TOP_MATCHES}`＝**IS_MY_TURN ではないのでゲート対象外**、かつ
   `DECK_TOP_MATCHES` は `lastProcessedCards` を読まない＝**無害**。
   影響は Codex が申告した `WXDi-P11-075-E1` ①**のみ**＝申告は正確だった。
3. **`applyToField` の `lastProcessedCards: placed` 追加**は呼び出し元が `:2951` の
   **`src.count === 'ALL'` の1経路だけ**。後段が lastProcessed を読む ADD_TO_FIELD は live 3効果
   （`WX24-P2-007-E1`／`WX25-CP1-029-E1`／`WXDi-P14-069-E1`）で、いずれも原文が
   「**それを**場に出す→**それの**〜」＝**置いた札を指すのが正**＝精密化。**退化なし**。

### 🔴 申告の取りこぼし（1件）と台帳への反映

`WXDi-P11-075-E1` ① は「過剰実行 → **恒久 no-op**」へ裏返っている
（source 無し REVEAL は `execReveal:1316` で記録を書かないので、事前リセット後は必ず空振り判定になる）。
Codex は §5 で自主申告しているが、**§9「やらなかったこと」では『安全側に留めた』と書いており、
「今より悪くなった効果がある」という書き方にはなっていない**。
⇒ **台帳では当該 finding を閉じない**（`stage2_closed.txt` にコメントで理由を明記）。
⇒ この①は parser 側で「L1/L2/L3 を1枚ずつ公開」を表せるようにする別バッチの題材。

### 台帳

閉じたのは **finding 単位で4本**（`WDK08-Y17-E1` / `WX21-042-E2` / `WX10-088-E1` / `WXEX1-28-E2` の
quote「そうした場合」）。⚠**§5-3-4′ に従い、同じ効果に付いた別軸の finding は閉じていない**
（`WDK08-Y17-E1` の「パワー+1000 欠落」、`WX20-039-CB-E1` の「パワー5000以下 限定欠落」）。
A群14効果のうち残り8効果は **findings に無い**＝live JSON の全数走査で新規に見つけた分。
残 OPEN **984→980**／段2 消化 **103→107**。
