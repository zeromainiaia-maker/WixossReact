# S-2 バッチA：真バグ集団の母集団実測

測定日：2026-09-08。`docs/_effect_srctext.json` の効果単位原文を母集合とし、`public/data/effects_*.json` の live JSON と照合した。候補抽出・既知 ID 検算・HIT/MISS/nojson 集計は `tmp_s2_a_measure.mjs` で再現でき、全 MISS は原文と live JSON を1件ずつ目視した。母集団は指示どおり **A+B のみ**であり、M は parser 修正が届かない別枠、C と nojson は含めていない。

### C1. 遅延誘発が即時実行に化けている（登録 6効果）

- **採用した正規表現**＝`/(?:(?:(?:次の){1,2}(?:あなた|対戦相手)?の?|このターンの、?次の)[^。]{0,30}(?:フェイズ|ステップ)(?:開始時|終了時)(?:に|、)|そのバトル終了時(?:に|、)|このターン[、の]次に[^。]{0,60}(?:アタックしたとき|アタックによって[^。]{0,30}クラッシュされる場合)|このターン、[^。]{0,45}パワーが[０0]以下になったとき|このターン、それがアタックしたとき)/`。フェイズ/ステップだけの regex は既知の「そのバトル終了時」「このターン次にアタック」「パワー0以下」を落とすため不採用。逆に `まで` を含めた regex は「次のエナフェイズ終了時まで」等の持続期限まで拾って 78件になったため不採用。
- **既知 effectId の検算**＝10/10 件が当たった（不一致なし）。
- **候補（効果単位）**＝67 ／ **HIT（受け皿あり）**＝57 ／ **MISS**＝10 ／ **live JSON 無し**＝0
- **受け皿の別名として調べたもの**＝`INSTALL_DELAYED_TRIGGER`（`src/types/effects.ts:2840`、設置 `src/engine/effectExecutor.ts:2947`、収集 `src/engine/triggerCollect.ts:5319`）／`DELAY_TO_NEXT_OPP_ATTACK_PHASE`・`DELAY_TO_NEXT_OPP_TURN_END`・`DELAY_TO_NEXT_OWN_TURN_END`（`src/types/effects.ts:4038,4057,4069`、`src/engine/effectExecutor.ts:10131,10146,10161`）／`pending_lrig_limit_mod`（`src/engine/effectExecutor.ts:9854`）／`NEGATE_ATTACK`・`PREVENT_NEXT_DAMAGE`・`REPLACE_NEXT_DAMAGE_WITH_MILL`／`BLOCK_ACTION{actionId:NEGATE_NEXT_*}`（名称表 `src/engine/effectExecutor.ts:4690`）／入れ子の `GRANT_EFFECT`/`GRANT_ABILITY` 内 `AUTO+timing`／`SIGNI_FLIP_FACEDOWN{delayUntilTurnEnd,returnTiming}`（`src/engine/execStubPart2.ts:4006`）／同一カードの別 effectId に分離された `AUTO+timing`。原文 funnel は `sourceAbilityText`→`abilityBlockTextOf`（`src/engine/execUtils.ts:176-179`）も検索した。
- 🔴**母集団（真バグ確度 A+B）＝8効果**（登録 6 → 実測 8／**登録票は stale だった**）
- **内訳**

  | 確度 | 件数 | effectId |
  |---|---:|---|
  | **A＝確実に真バグ**（原文の主要処理が JSON のどこにも無い） | 8 | `PR-305-E1`, `WX24-D5-05-E1`, `WX24-P1-004-E1`, `WX24-P2-080-E1`, `WX25-P3-032-E2`, `WXDi-CP02-059-E1`, `WXDi-P00-038-E1`, `WXDi-P14-031-E1` |
  | **B＝要確認**（別軸で表現されている可能性が残る） | 0 | — |
  | **C＝除外**（別の正準形で表現済み／engine が原文を読む／原文の意味が違う） | 0 | — |
  | **M＝MANUAL/PARTIAL**（parser 修正が届かない別枠） | 2 | `WX25-P3-007-E1`, `WX26-CP1-001-E1` |

- **C に落とした理由の代表例**＝最終 MISS に C は無かった。なお候補から HIT とした代表例は、`PR-Di035-E1` が専用 STUB で遅延 state を設置（`src/engine/execStubPart3.ts:4981-4982`）、`WXDi-P09-009-E3` が `SIGNI_FLIP_FACEDOWN` の遅延指定を保持（`src/data/manualEffects.ts:4884`、実行 `src/engine/execStubPart2.ts:4006-4007`）、`WXK01-028-E4` 型が `BLOCK_ACTION{NEGATE_NEXT_SIGNI_ATTACK}` で表現済み（受け皿名称 `src/engine/effectExecutor.ts:4690`）だった。
- **レーンの見立て**＝遅い（parser・engine）。遅延イベントの種類、対象保存、発火期限を揃える横断作業。M の2件は `src/data/manualEffects.ts:4390-4391,4777-4778` の別レーン。

### C2. 「置いてもよい／してもよい」が素の強制アクションになっている（登録 4効果）

- **採用した正規表現**＝`/(?:(?:トラッシュ|エナゾーン)に(?:置いて|捨てて)|【エナチャージ[０-９\d]+】をして|手札に加えて|(?:カードを[０-９\d]+枚)?引いて|(?:表向きにして|カードを)?公開して)もよい/`。指示例の `/(置いて|して|加えて|捨てて|公開して|引いて)もよい/` はコスト文・注釈・別種の任意行為まで含め 795件となるため不採用。行き先またはアクション名を要求する形に絞った。
- **既知 effectId の検算**＝9/9 件が当たった（不一致なし）。既知の `WX10-015-E1` は現 live では `OPTIONAL_ACTIVATE` を持つため HIT。
- **候補（効果単位）**＝268 ／ **HIT（受け皿あり）**＝250 ／ **MISS**＝17 ／ **live JSON 無し**＝1
- **アクション種別の小分け**

  | 実装単位 | 採用した追加条件 | 候補 | HIT | MISS | nojson |
  |---|---|---:|---:|---:|---:|
  | ① デッキ/ライフ→トラッシュ | `/(?:(?:あなた|対戦相手)のデッキの(?:上から|一番下)[^。]{0,45}トラッシュに置いてもよい|(?:あなた|対戦相手)のデッキの一番上を見る。(?:あなたは)?(?:それ|そのカード)をトラッシュに置いてもよい|(?:あなた|対戦相手)のライフクロス(?:の一番上を見る。(?:あなたは)?(?:それ|そのカード)を|[０-９\d]+枚を)トラッシュに置いてもよい)/` | 26 | 21 | 5 | 0 |
  | ② 対戦相手の【エナチャージ】 | `/対戦相手は【エナチャージ[０-９\d]+】をしてもよい/` | 6 | 2 | 4 | 0 |
  | ③ その他 | 上記2群を除く採用 regex の残り | 236 | 227 | 8 | 1 |

- **受け皿の別名として調べたもの**＝5経路すべてを OR 判定した。`action.optional:true`（例：`src/types/effects.ts:2201,2218,2235`、`TRASH` は `src/types/effects.ts:2351-2358`）／`effect.mandatory:false` の AUTO 任意発動（型 `src/types/effects.ts:7093`、正規化 `src/engine/triggerCollect.ts:477,584`）／「しない・何もしない・スキップ」枝を持つ `CHOOSE`／`OPTIONAL_ACTIVATE`（生成 `src/engine/triggerCollect.ts:524`、実行 `src/engine/effectExecutor.ts:6167-6189`）／`STUB{OPTIONAL_*}`（実行 ID 群 `src/engine/effectExecutor.ts:6170`）。加えて `upToCount`、`canTrash`、`useTimeCost`、専用任意 UI の STUB、および原文 funnel `sourceAbilityText`（`src/engine/execUtils.ts:176-179`）も調べた。
- 🔴**母集団（真バグ確度 A+B）＝9効果**（登録 4 → 実測 9／**登録票は stale だった**）
- **内訳**

  | 確度 | 件数 | effectId |
  |---|---:|---|
  | **A＝確実に真バグ**（原文の主要処理が JSON のどこにも無い） | 9 | ① `WX24-P3-089-E1`, `WX24-P3-090-E1`, `WX25-P1-101-E2`, `WXDi-P00-042-E1`, `WXK11-036-E2`／② `WXDi-D07-013-E1`, `WXDi-P06-011-E1`, `WXDi-P08-059-E2`／③ `WXDi-P14-064-E1` |
  | **B＝要確認**（別軸で表現されている可能性が残る） | 0 | — |
  | **C＝除外**（別の正準形で表現済み／engine が原文を読む／原文の意味が違う） | 6 | `SPDi43-05-E2`, `WX09-032-E1`, `WX24-P4-046-E2`, `WX25-P1-071-E1`, `WXDi-P05-038-E1`, `WXEX2-09-E1` |
  | **M＝MANUAL/PARTIAL**（parser 修正が届かない別枠） | 2 | `WX26-CP1-048-E2`, `WDK13-017-E1` |

- **C に落とした理由の代表例**＝`SPDi43-05-E2` は素の強制アクションではなく `DEFERRED_ATTACKER_LEVEL_TRADE_NEGATE` という別 STUB に退避（生成 `src/data/effectParser.ts:23946`）。`WX09-032-E1` も強制アクションではなく `DEFERRED_COST_SUBSTITUTE_MULTI_ENERGY`（`src/data/parsers/parseSentencePart2.ts:268`）。`WXEX2-09-E1` は `RISE_LEAVE_DISCARD_STACK` 経路で、engine 側は rise/stack 系として分岐（`src/engine/execStubPart3.ts:113-116`）。よって6件は「素の TRASH/MILL/ENERGY_CHARGE が任意性を失った」母集団から除外したが、STUB 実装状況は別系統として要監査。nojson の `WX17-052-LAYER-E1` は live 側で親 `WX17-052-LAYER` の入れ子効果に統合され、`upToCount:true` を保持していた。
- **レーンの見立て**＝遅い（parser・engine）。3実装単位にまたがり、相手が選ぶ任意処理と自分が選ぶ任意処理で UI/実行主体も違う。`WXDi-P14-064-E1` の専用 handler は現在選択を挟まず移動する（`src/engine/execStubPart2.ts:870-881`）。M の2件は `src/data/manualEffects.ts:4595-4596,9406-9407` の別レーン。

### C3. 「1枚を上・残りを下」／「残りをシャッフルして下」が落ちている（登録 2効果）

- **採用した正規表現**＝① `/一番上に(?:戻し|置き)[^。]{0,30}残り/`、② `/(?:残り|それら(?:のカード)?)[^。]{0,20}シャッフルして[^。]{0,30}一番下/`。`/残り[^。]{0,20}(?:シャッフル|好きな順番)[^。]{0,30}一番下/` は無作為化と任意順序を混ぜ、さらに 339件まで広がるため不採用。①と②を分離した。
- **既知 effectId の検算**＝① 2/2、② 3/3、合計 5/5 件が当たった（不一致なし）。
- **候補（効果単位）**＝66 ／ **HIT（受け皿あり）**＝58 ／ **MISS**＝8 ／ **live JSON 無し**＝0
- **近接2型の小分け**

  | 型 | 候補 | HIT | MISS | nojson |
  |---|---:|---:|---:|---:|
  | ① 1枚を一番上・残りを一番下 | 14 | 12 | 2 | 0 |
  | ② 残りをシャッフルして一番下 | 52 | 46 | 6 | 0 |

- **受け皿の別名として調べたもの**＝`LOOK_AND_REORDER` の `first_top_rest_bottom`（解決 `src/engine/effectExecutor.ts:11426-11429`）／枚数可変の `split_top_bottom`（`src/engine/effectExecutor.ts:10946-10952,11430`）／`REVEAL_AND_PICK.remainder.shuffle` と `reorder`（型 `src/types/effects.ts:3339,3372`、shuffle 実行 `src/engine/effectExecutor.ts:7718,7770,7914`）／`LOOK_PICK_CHAIN.remainder`（型 `src/types/effects.ts:3314`）／`deckBottomShuffled`（型 `src/types/effects.ts:5105-5106`、実行 `src/engine/execStubPart1.ts:3073-3079`）／専用 `CROSS_ZONE_TRIPLE_TARGET_TO_DECK_BOTTOM`（`src/engine/execStubPart3.ts:2346-2353`）。`reorder:true` は「好きな順番」、`shuffle:true` は無作為として別判定した。
- 🔴**母集団（真バグ確度 A+B）＝5効果**（登録 2 → 実測 5／**登録票は stale だった**）
- **内訳**

  | 確度 | 件数 | effectId |
  |---|---:|---|
  | **A＝確実に真バグ**（原文の主要処理が JSON のどこにも無い） | 5 | ① `WXDi-P09-050-E1`, `WXDi-P10-047-E2`／② `WXDi-P05-035-E1`, `WXDi-P10-033-E2`, `WXK09-067-E1` |
  | **B＝要確認**（別軸で表現されている可能性が残る） | 0 | — |
  | **C＝除外**（別の正準形で表現済み／engine が原文を読む／原文の意味が違う） | 0 | — |
  | **M＝MANUAL/PARTIAL**（parser 修正が届かない別枠） | 3 | `WX25-CP1-002-E1`, `WX25-P2-066-E1`, `WXDi-D04-021-E1` |

- **C に落とした理由の代表例**＝最終 MISS に C は無かった。候補から HIT とした代表例は、`WX22-021-E2` が `deckBottomShuffled` を保持（`src/data/manualEffects.ts:4140`、実行 `src/engine/execStubPart1.ts:3073-3079`）、`first_top_rest_bottom` が専用解決を持つ（`src/engine/effectExecutor.ts:11426-11429`）、`remainder.shuffle:true` が `REVEAL_AND_PICK` の実行時に無作為化される（`src/engine/effectExecutor.ts:7718,7914`）。
- **レーンの見立て**＝遅い（parser・engine）。①は配置先分割、②は無作為化フラグで修正単位が異なる。M の3件は `src/data/manualEffects.ts:4232-4233,4387-4388,5124-5125` の別レーン。

## サマリ

| 系統 | 登録 | 実測 A+B | stale か | 受け皿の有無 | レーン |
|---|---:|---:|---|---|---|
| C1 遅延誘発 | 6 | 8 | stale | あり（`INSTALL_DELAYED_TRIGGER` ほか） | 遅い：parser・engine（M 2件は手書き） |
| C2 任意処理の強制化 | 4 | 9 | stale | あり（`optional`、`mandatory:false`、`CHOOSE`、`OPTIONAL_ACTIVATE`、任意 STUB） | 遅い：parser・engine（M 2件は手書き） |
| C3 上/下分割・下シャッフル | 2 | 5 | stale | あり（`first_top_rest_bottom`、`remainder.shuffle` ほか） | 遅い：parser・engine（M 3件は手書き） |

1. **登録票は正しかったか**＝C1 stale（実測 8）／C2 stale（実測 9）／C3 stale（実測 5）。
2. **触ったファイル一覧**＝`tmp_s2_a_measure.mjs`、`tmp_s2_a_probe.mjs`（探索用に作成後、削除済み）、`scripts/archive/scratchpad/s2_population_20260908/REPORT_A.md` のみ。
3. **測っていて気づいた別の系統**＝C2 の C 6件（`SPDi43-05-E2`, `WX09-032-E1`, `WX24-P4-046-E2`, `WX25-P1-071-E1`, `WXDi-P05-038-E1`, `WXEX2-09-E1`）は任意性を失った素の強制アクションではなく、専用 `DEFERRED_*` / rise 系 STUB に退避した別系統候補。実行実装または別 funnel の有無を別監査する必要がある。
