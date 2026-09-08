# S-2 バッチB：真バグ集団の母集団実測（2026-09-08）

測定対象は `docs/_effect_srctext.json` の効果単位原文と live `public/data/effects_*.json`。C4 だけは指定どおり live のカード内構造を起点にした。O-290/O-292 は効果原文に現れないカード常在文・コスト文があるため `public/data/CardData_*.csv` もカード番号で重複排除して併用した。

内訳表の A/B/C/M は **HIT を除いた未解決候補の仕分け**であり、HIT は内訳表に重ねて数えていない。live JSON 無しでも原文から欠落が確定できる O-290 の3カードは A に分類した。また、指定書式どおり「母集団（A+B）」は parser が届く真バグだけを表し、真バグだが手書き別枠の M は直後に併記した。

## 前半：C4〜C6

### C4. 【ライド】が2つの起動能力に重複している（登録 2効果）

- **採用した正規表現**＝原文は `/【ライド】/`。先に live を「同一 cardNum に `STUB{RIDE_ON}` と `STUB{CENTER_LRIG_RIDES_ON_SIGNI}` が共存」で抽出し、そのカードの効果単位原文に `/【ライド】/` が1回だけあることを検算した。捨てた regex は `/ライド/`（注釈中の「ドライブ状態」等まで拾い、能力マーカーの個数にならない）。
- **既知 effectId の検算**＝2/2 件が live 構造条件に当たった（`WXK01-008-E1` / `WXK01-009-E1`）。両 E1 は手書き合成なので `SRC` 自体は無く、対応する `-RIDE` 原文は各1回だけ `/【ライド】/` に当たった。カード全文でも各1回（`public/data/CardData_Sheet3.csv:233-234`）。
- **候補（効果単位）**＝2 ／ **HIT（重複なし）**＝0 ／ **MISS**＝2 ／ **live JSON 無し**＝0（該当カード数も2）。
- **受け皿の別名として調べたもの**＝`RIDE_ON`（`src/data/effectParser.ts:27030`, `src/engine/execStubPart2.ts:4563-4590`） / `CENTER_LRIG_RIDES_ON_SIGNI`（`src/engine/execStubPart3.ts:445-464`） / UI の正準判定 `STUB{RIDE_ON}`（`src/screens/battle/battleUtils.ts:122-128`）。両 engine 枝は実装済みだが、本線は parser が生成し UI も特別扱いする `RIDE_ON`。
- 🔴**母集団（真バグ確度 A+B）＝0効果**、ただし **M（手書き別枠）込みの真バグ総数＝2効果**（登録 2 → 実測 2／**登録票は M 込みの総数として正しかった**）。
- **内訳**

  | 確度 | 件数 | effectId |
  |---|---:|---|
  | **A＝確実に真バグ**（原文の主要処理が JSON のどこにも無い） | 0 | — |
  | **B＝要確認**（別軸で表現されている可能性が残る） | 0 | — |
  | **C＝除外**（別の正準形で表現済み／engine が原文を読む／原文の意味が違う） | 0 | — |
  | **M＝MANUAL/PARTIAL**（parser 修正が届かない別枠） | 2 | `WXK01-008-E1`, `WXK01-009-E1` |
- **C に落とした理由の代表例**＝C は0件。重複側 E1 は `src/data/manualEffects.ts:10109-10110`、正準の `-RIDE` は parser と UI の `RIDE_ON` 経路（`src/data/effectParser.ts:27030`, `src/screens/battle/battleUtils.ts:126-128`）にある。
- **レーンの見立て**＝速い（`manualEffects.ts` 手書き2枚）。新規 engine 機構は不要。

### C5. 色付きルリグ／シグニを対象にする効果の色フィルタが欠落（登録 2効果）

- **採用した正規表現**＝`/([白黒赤青緑無](?:か[白黒赤青緑無])*)(?:色)?の(?:(?!ルリグ|シグニ|[。、：]).){0,16}(?:ルリグ|シグニ)[^。、：]{0,8}を(?:対象とし|対象に)/`。試して捨てた `/([白黒赤青緑無])(?:色)?の[^。]{0,24}(ルリグ|シグニ)[^。]{0,12}を?対象/` は231件で、コスト句の色や先行条件の色から後続の無関係な「対象」まで渡る。句読点で狭めた版も166〜173件で同じ混入が残った。
- **既知 effectId の検算**＝本体の対象欠落署名に属する3/3件（`WXK11-052-E1`, `WXK11-077-E1`, `WXDi-P06-059-E1`）が当たった。参考 `WXDi-P03-035-E1` は「白のルリグがアタックしたとき」という**トリガー修飾**なので別 regex `/[白黒赤青緑無]のルリグ[^。]{0,8}がアタックしたとき/` で検算し、`triggerFilter.color` により正しく表現済み。逆向き `PR-457-E2` は原文に色語が無いので原文 regex の対象外とし、JSON 側の `colorMatchesLrig:true` を別途確認した。提示された5件は以上の指定方向別検算で5/5確認済み。
- **候補（効果単位）**＝149 ／ **HIT（受け皿あり）**＝144 ／ **MISS**＝5 ／ **live JSON 無し**＝0。
- **受け皿の別名として調べたもの**＝`TargetFilter.color: string|string[]`（`src/types/effects.ts:1342-1349`） / `anyOf[].color`（同:1338-1342） / `colorMatchesLrig`（同:1555-1559） / `triggerFilter.color` の消費（`src/engine/triggerCollect.ts:884-892`） / `filter.color` の照合（`src/engine/effectEngine.ts:1018-1019`） / 動的色の解決（`src/engine/effectExecutor.ts:3429-3433`） / `TAKE_FROM_UNDER_SIGNI.filter` の消費（同:8458-8479） / STUB payload 内 `target.filter.color`。`filter.colors` と `colorIn` は grep 0件、`cardColor` はコスト増減用（`src/engine/effectEngine.ts:3274`）で対象フィルタの別名ではなかった。predicate はトップレベル `cost` を見ず `action` 内のこれらを OR した。
- 🔴**母集団（真バグ確度 A+B）＝2効果**、加えて **M＝1効果**（登録 2 → 実測 A+B 2だが effectId の中身は入れ替わり、Mも1件発見／**登録票は内容が stale だった**）。
- **内訳**

  | 確度 | 件数 | effectId |
  |---|---:|---|
  | **A＝確実に真バグ**（原文の主要処理が JSON のどこにも無い） | 2 | `WXDi-D06-014-E1`, `WXDi-P06-059-E1` |
  | **B＝要確認**（別軸で表現されている可能性が残る） | 0 | — |
  | **C＝除外**（別の正準形で表現済み／engine が原文を読む／原文の意味が違う） | 2 | `WXK11-052-E1`, `WXK11-077-E1` |
  | **M＝MANUAL/PARTIAL**（parser 修正が届かない別枠） | 1 | `WXDi-P05-060-E1` |
- **C に落とした理由の代表例**＝`WXK11-052-E1` と `WXK11-077-E1` は対象型が `LRIG,self,count:1` で、実行時候補がセンタールリグ `field.lrig.at(-1)` ただ1体に固定される（`src/engine/effectExecutor.ts:4979-4987`）。色が違っても別のルリグを誤選択できず実害ゼロ。手書き所在はそれぞれ `src/data/manualEffects.ts:4969`, `src/data/manualEffects.ts:4550`。参考 `WXDi-P03-035-E1` は `triggerFilter.color:'白'` をアタック元に当てる経路が実装済み（`src/engine/triggerCollect.ts:884-892`）。
- **レーンの見立て**＝混在。遅い（parser：Aの自動生成2件）＋速い（`manualEffects.ts`：Mの1件）。`WXDi-P06-059-E1` は既存 `TAKE_FROM_UNDER_SIGNI.filter` の受け皿が engine にある。

補足：`WXDi-D06-014-E1` は原文の白・赤・青・緑に対し live は青・緑だけで、色フィルタの「完全欠落」ではなく**2色欠落**だが同じ対象色 parser 系統としてAに含めた。`WXDi-P05-060-E1` は色だけでなく先行対象選択自体が無く、`PLACE_SIGNI_UNDER_SIGNI` は `lastProcessedCards` が無ければ no-op（`src/engine/execStubPart2.ts:2112-2126`）なので手書き別枠の確実な不具合。

### C6. グロウ時「公開した場合」が「手札にある」判定になっている（登録 2効果）

- **採用した正規表現**＝`/(?=[\s\S]*(?:このカードにグロウする際|グロウするためのコスト))(?=[\s\S]*(?:公開した場合|公開してもよい。?そうした場合|この方法で[^。]{0,20}公開))/`。表記ゆれ別の実測は `/公開した場合/` 7件、`/公開してもよい。?そうした場合/` 10件、`/この方法で[^。]{0,20}公開/` 59件、和集合69件。和集合は公開カード参照全般で実装単位が違うため捨て、グロウ軽減文脈2件を採用した。
- **既知 effectId の検算**＝2/2 件が当たった（`WD13-002-E1` / `WD13-003-E1`）。
- **候補（効果単位）**＝2 ／ **HIT（公開実績の受け皿あり）**＝0 ／ **MISS**＝2 ／ **live JSON 無し**＝0。参考として全「公開した場合」系は69効果（liveあり68、liveなし1）だが、母集団には採用していない。
- **受け皿の別名として調べたもの**＝手札公開 `REVEAL{source:HAND_CARD}` と `lastProcessedCards`（`src/engine/effectExecutor.ts:1681-1693`） / `cardName:'__lastRevealed__'`（同:5191-5197） / `LAST_PROCESSED_MATCHES`, `LAST_PROCESSED_COUNT_GTE` / `REVEAL_AND_PICK` / 任意公開コスト `OPTIONAL_COST.handReveal`＋`PAID_ADDITIONAL_COST`（同:5530-5535）。現 live の `HAND_COUNT_FILTER` は手札候補枚数を直接数える（`src/engine/effectEngine.ts:3481-3489`, `src/engine/execUtils.ts:2330-2335`）。`sourceAbilityText` / `abilityBlockTextOf` の funnel がこの2 IDを読む参照は0件。
- 🔴**母集団（真バグ確度 A+B）＝0効果**、ただし **M（手書き別枠）込みの真バグ総数＝2効果**（登録 2 → 実測 2／**登録票は M 込みの総数として正しかった**）。
- **内訳**

  | 確度 | 件数 | effectId |
  |---|---:|---|
  | **A＝確実に真バグ**（原文の主要処理が JSON のどこにも無い） | 0 | — |
  | **B＝要確認**（別軸で表現されている可能性が残る） | 0 | — |
  | **C＝除外**（別の正準形で表現済み／engine が原文を読む／原文の意味が違う） | 0 | — |
  | **M＝MANUAL/PARTIAL**（parser 修正が届かない別枠） | 2 | `WD13-002-E1`, `WD13-003-E1` |
- **C に落とした理由の代表例**＝C は0件。engine 自身がこの2件を `HAND_COUNT_FILTER` で自動適用する意図を明記している（`src/engine/effectEngine.ts:3466-3470`, 同:3547-3549）が、`WD13-003-E1` の「公開してもよい」を拒否できず軽減されるので、これは正準形ではなく問題そのもの。手書き所在は `src/data/manualEffects.ts:4566`, 同:4578。
- **レーンの見立て**＝遅い（グロウ支払い／公開の対話と結果記録をつなぐ engine）＋手書き2件。通常効果の `REVEAL` 受け皿はあるが、グロウコスト算定フローへの配線が必要。

## 後半：機構 worklist O-289〜O-292

### O-289. 起動をまたぐ「選択済み」管理（登録 live 2効果）

- **採用した正規表現**＝`/(?:この【起】能力で)?まだ選(?:ばれて|んで)いない(?:もの|[０-９0-9]*つ)?[^。]{0,12}選ぶ|ゲーム中[１1]回だけ選べる/`。捨てた `/まだ選/` は今回同じ3件だったが、何を選ぶかまで拘束しないため採用しなかった。全角/半角の「1/１」と「選ばれて／選んで」を含めた。
- **既知 effectId の検算**＝2/2 件が当たった（`PR-469-E3` / `WXDi-P11-002-E1`）。追加で `WXDi-P11-003-E1` が当たった。
- **候補（効果単位）**＝3 ／ **HIT（受け皿あり）**＝1 ／ **MISS**＝2 ／ **live JSON 無し**＝0。
- **受け皿の別名として調べたもの**＝`CHOOSE.noRepeat`（`src/types/effects.ts:2735`） / 永続 store `PlayerState.taken_choice_keys`（`src/types/index.ts:880-885`） / 選択肢の除外とマーカー生成（`src/engine/effectExecutor.ts:6427-6447`） / `INTERNAL_MARK_CHOICE_TAKEN` の永続書込み（`src/engine/execStubPart1.ts:921-930`）。`usedChoices`, `chosen_once`, `choiceUsed` は grep 0件。
- 🔴**母集団（真バグ確度 A+B）＝2効果**（登録 2 → 実測 2／**登録票の真バグ数は正しかった**。候補総数はHIT 1を含め3）。
- **内訳**

  | 確度 | 件数 | effectId |
  |---|---:|---|
  | **A＝確実に真バグ**（原文の主要処理が JSON のどこにも無い） | 2 | `PR-469-E3`, `WXDi-P11-002-E1` |
  | **B＝要確認**（別軸で表現されている可能性が残る） | 0 | — |
  | **C＝除外**（別の正準形で表現済み／engine が原文を読む／原文の意味が違う） | 0 | — |
  | **M＝MANUAL/PARTIAL**（parser 修正が届かない別枠） | 0 | — |
- **C に落とした理由の代表例**＝MISS のCは0件。HIT `WXDi-P11-003-E1` は手書きながら `CHOOSE{noRepeat:true}` を持ち、選んだキーをターン境界で消さない store に刻む（`src/data/manualEffects.ts:1144`, `src/engine/execStubPart1.ts:921-930`）。
- **レーンの見立て**＝遅い（parser／データ生成）だが engine 新機構は不要。既存 `noRepeat` を出せばよい型。
- **登録票の「受け皿が無い」は正しかったか**＝**stale（誤り）**。`noRepeat` は解決内だけではなく `taken_choice_keys` にゲーム中永続化されている。

### O-290. キーを場に出すときのコスト条件・軽減（登録 live 4効果）

- **採用した正規表現**＝カード全文で `/(?:この|その)キーを場に出すためのコストは《コイン(?:アイコン)?×[０-９0-9]+》(?:になる|減る)|エナゾーンにあるカードが持つ色が合計[３3]種類以上ある場合にしか新たに場に出せない/`。捨てた `/キー[^。]{0,40}コスト/` は他の「キーをコストとして置く」文まで混ざるため不採用。`コイン` / `コインアイコン`、全角/半角数字、「なる」/「減る」を試した。
- **既知 effectId の検算**＝カード番号4/4件が当たった（`WXK03-014`, `WXK10-015`, `WXK11-012`, `PR-K060`）。効果単位では `WXK03-014-E3` だけに文があり、残る3カードの常在文は effectId 自体が生成されていない。
- **候補（効果単位）**＝1 ／ **候補（カード単位）**＝4 ／ **HIT（受け皿あり）**＝1効果・1カード ／ **MISS**＝0効果＋3カード ／ **live JSON 無し**＝3カード常在文。CSV 所在は `public/data/CardData_Sheet3.csv:438`, `CardData_Sheet4.csv:202`, 同:300, `CardData_Sheet6.csv:128`。
- **受け皿の別名として調べたもの**＝`PLACE_KEY_FROM_LRIG_DECK.payPrintedCost` / `.coinReduction`（`src/types/effects.ts:3102-3117`）と消費（`src/engine/effectExecutor.ts:6817-6824`, 同:6846-6855） / 通常キー提示の `coinNeeded`（`src/screens/BattleScreen.tsx:9074`） / キーモーダルの `coinNeeded`（`src/screens/battle/modals/KeyUseModal.tsx:35-56`） / 一般の `costReplacement`・`costScaling`（同:42-47）。一般経路のコイン数は印刷値を直接読み、これらの self key 条件で置換する payload は無い。
- 🔴**母集団（真バグ確度 A+B）＝3カード（effectId 無し）**（登録 4 → 実測 3／**登録票は stale だった**）。効果単位の真バグは0だが、これは3文が `_effect_srctext` へ切り出されていないためであり、カード単位3を実装母集団とする。
- **内訳**

  | 確度 | 件数 | effectId |
  |---|---:|---|
  | **A＝確実に真バグ**（原文の主要処理が JSON のどこにも無い） | 3カード | `WXK10-015-(effectId無し)`, `WXK11-012-(effectId無し)`, `PR-K060-(effectId無し)` |
  | **B＝要確認**（別軸で表現されている可能性が残る） | 0 | — |
  | **C＝除外**（別の正準形で表現済み／engine が原文を読む／原文の意味が違う） | 0 | — |
  | **M＝MANUAL/PARTIAL**（parser 修正が届かない別枠） | 0 | — |
- **C に落とした理由の代表例**＝MISS のCは0件。候補からHITへ除いた `WXK03-014-E3` は `coinReduction:1` を持ち、印刷コイン1から差し引いて0を請求する（`src/data/manualEffects.ts:10669-10674`, `src/engine/effectExecutor.ts:6821-6824`）。
- **レーンの見立て**＝遅い（通常のキープレイ gate／モーダルとカード常在文のデータ化）。`PLACE_KEY_FROM_LRIG_DECK` 専用の軽減だけは既存。
- **登録票の「受け皿が無い」は正しかったか**＝**一部 stale**。`coinReduction` は既にあり `WXK03-014-E3` を正しく処理する。一方、通常キープレイの自己コイン置換2枚と色種類数による配置制限1枚の受け皿は無い。

### O-291. 相手エナの【マルチエナ】剥奪＋相手効果免疫（登録 live 1効果）

- **採用した正規表現**＝`/エナゾーンにあるカードは【マルチエナ】を失い、?対戦相手の効果を受けない/`。捨てた `/エナゾーンにあるカード[^。]{0,30}効果を受けない/` も同じ1件だったが、前半の【マルチエナ】剥奪との複合欠落を特定しないため不採用。読点有無を許容した。
- **既知 effectId の検算**＝1/1 件が当たった（`WXK11-020-E1`）。
- **候補（効果単位）**＝1 ／ **HIT（後半の受け皿あり）**＝0 ／ **MISS**＝1 ／ **live JSON 無し**＝0。
- **受け皿の別名として調べたもの**＝`STRIP_OPP_ENA_MULTI_ENA` の live 宣言（`src/data/manualEffects.ts:5253`）と消費（`src/screens/battle/costs.ts:1218-1233`, `src/screens/battle/artsUseGate.ts:71`） / 汎用 `GRANT_PROTECTION` と `collectEffectImmuneSigni`（`src/engine/effectEngine.ts:6352-6375`）。後者の収集対象は場のシグニ／センタールリグだけ（同:6496-6524, 6560-6573）で、エナカード集合を返す軸は無い。`sourceAbilityText` によるこの原文の直接読取りも0件。
- 🔴**母集団（真バグ確度 A+B）＝0効果**、ただし **M（手書き別枠）込みの真バグ総数＝1効果**（登録 1 → 実測 1／**登録票は M 込みの総数として正しかった**）。
- **内訳**

  | 確度 | 件数 | effectId |
  |---|---:|---|
  | **A＝確実に真バグ**（原文の主要処理が JSON のどこにも無い） | 0 | — |
  | **B＝要確認**（別軸で表現されている可能性が残る） | 0 | — |
  | **C＝除外**（別の正準形で表現済み／engine が原文を読む／原文の意味が違う） | 0 | — |
  | **M＝MANUAL/PARTIAL**（parser 修正が届かない別枠） | 1 | `WXK11-020-E1` |
- **C に落とした理由の代表例**＝C は0件。`STRIP_OPP_ENA_MULTI_ENA` の2消費地点はいずれも支払い時のマルチエナ判定だけで、効果によるエナ移動・除去を遮断しない（`src/screens/battle/costs.ts:1218-1233`, `src/screens/battle/artsUseGate.ts:71`）。
- **レーンの見立て**＝遅い（engine のエナ領域効果免疫）＋ `manualEffects.ts` 1件。
- **登録票の「受け皿が無い」は正しかったか**＝**正しい**。場のカード向け汎用効果免疫はあるが、エナカードを保護する収集・各移動消費地点への配線は無い。

### O-292. 起動コスト「コラボライバー1人とのコラボ」（登録 live 3効果）

- **採用した正規表現**＝`/【起】[^。：]{0,40}コラボライバー[１1]人と(?:の)?コラボする：/`。捨てた `/コラボライバー[^。：]{0,20}コラボする：/` も同じ3件だったが、【出】の「呼ぶ」やガード代替コストと区別するため【起】を必須にした。全角/半角1と「と／との」を許容した。
- **既知 effectId の検算**＝3/3 件が当たった（`WXDi-CP01-006-E2`, `WXDi-CP01-007-E2`, `WXDi-CP01-008-E2`）。
- **候補（効果単位）**＝3 ／ **HIT（起動コスト受け皿あり）**＝0 ／ **MISS**＝3 ／ **live JSON 無し**＝0。カード単位も3（`public/data/CardData_Sheet8.csv:718-720`）。
- **受け皿の別名として調べたもの**＝通常起動コスト `EffectCost`（`src/types/effects.ts:1094`） / 呼び出し効果 `STUB{COLLAB, collabCall}`（同:4909-4915, `src/engine/execStubPart3.ts:1262-1304`） / ガード代替コスト `guardAltCost.kind:'colorless_and_collab'`（`src/types/effects.ts:5838-5847`, `src/engine/effectEngine.ts:8017-8024`） / 低水準の `INTERNAL_DO_COLLAB`（`src/engine/execStubPart3.ts:1311-1331`）。通常【起】の `EffectCost` に collab payload は無く、parser はコラボライバー語を `cost.none=true` にするだけ（`src/data/effectParser.ts:1145`）。起動可否 gate の既存コスト列にもコラボ検査は無い（`src/screens/battle/signiActivateGate.ts:173-247`）。
- 🔴**母集団（真バグ確度 A+B）＝3効果**（登録 3 → 実測 3／**登録票は正しかった**）。
- **内訳**

  | 確度 | 件数 | effectId |
  |---|---:|---|
  | **A＝確実に真バグ**（原文の主要処理が JSON のどこにも無い） | 3 | `WXDi-CP01-006-E2`, `WXDi-CP01-007-E2`, `WXDi-CP01-008-E2` |
  | **B＝要確認**（別軸で表現されている可能性が残る） | 0 | — |
  | **C＝除外**（別の正準形で表現済み／engine が原文を読む／原文の意味が違う） | 0 | — |
  | **M＝MANUAL/PARTIAL**（parser 修正が届かない別枠） | 0 | — |
- **C に落とした理由の代表例**＝C は0件。`INTERNAL_DO_COLLAB` は正しくアシストルリグを配置するが、コメントどおり通常効果からの producer が無い（`src/engine/execStubPart3.ts:1311-1315`）。`guardAltCost` はガード時だけの別経路（`src/engine/effectEngine.ts:8017-8024`）。
- **レーンの見立て**＝遅い（EffectCost 型・parser・起動可否／支払いフロー）。低水準のコラボ実行部は再利用可能。
- **登録票の「受け皿が無い」は正しかったか**＝**正しい（コスト層）**。実行プリミティブはあるが、通常【起】コストの宣言・可否・支払いを結ぶ受け皿は無い。

## サマリ

| 系統 | 登録 | 実測 A+B | stale か | 受け皿の有無 | レーン |
|---|---:|---:|---|---|---|
| C4 ライド重複 | 2 | 0（M 2、真バグ総数2） | 正しい（M込み） | `RIDE_ON` あり、重複側も実装済み | 速い：manual |
| C5 色対象フィルタ | 2 | 2（M 1も別途） | **内容 stale** | 既存 `filter.color` 等あり | 混在：parser＋manual |
| C6 公開実績でグロウ軽減 | 2 | 0（M 2、真バグ総数2） | 正しい（M込み） | 通常公開はあり、grow配線なし | 遅い：engine＋manual |
| O-289 選択済み永続管理 | 2 | 2 | 真バグ数は正しい／**機構見立て stale** | `noRepeat`＋永続storeあり | parser（engine不要） |
| O-290 キー配置コスト | 4 | 3カード | **stale** | 専用 `coinReduction` のみあり | BattleScreen＋データ化 |
| O-291 エナ効果免疫 | 1 | 0（M 1、真バグ総数1） | 正しい（M込み） | エナ免疫なし | engine＋manual |
| O-292 コラボ起動コスト | 3 | 3 | 正しい | 実行部のみ、コスト層なし | parser＋engine/UI |

1. **登録票は正しかったか**＝C4 正しい（M込み2）／C5 stale（A+Bは2だが登録2件はCへ落ち、別A 2＋M 1）／C6 正しい（M込み2）／O-289 真バグ数2は正しいが「受け皿無し」は stale（`noRepeat` あり）／O-290 stale（実測3、`coinReduction` も既存）／O-291 正しい（M込み1、「エナ免疫受け皿無し」も正しい）／O-292 正しい（実測3、「通常起動コスト受け皿無し」も正しい）。
2. **触ったファイル一覧**＝`tmp_s2_b_c4.mjs`, `tmp_s2_b_c5.mjs`, `tmp_s2_b_c6.mjs`, `tmp_s2_b_mechanisms.mjs`, `scripts/archive/scratchpad/s2_population_20260908/REPORT_B.md` のみ。`src/`, `public/`, 他の `docs/`・`scripts/` は変更していない。
3. **測っていて気づいた別の系統**＝無し（追加発見した `WXDi-P05-060-E1` と `WXDi-P11-003-E1` はそれぞれ C5/O-289 の同一系統内）。

---

## 🔵 Opus による裏取り（2026-09-08・codex 判定の検査）

**PLAN §5.0 の規約「codex の FP/除外判定は真バグを恒久的に消す向きなので人間が engine を読んで確定する」に従って検査した。**

### 🔴 訂正1＝C5 の `WXK11-052-E1` / `WXK11-077-E1` は **C（除外）ではなく B（真バグ）**

codex の除外根拠は「対象が `field.lrig.at(-1)` 固定なので色が違っても**別のルリグを誤選択できず実害ゼロ**」。
**前半は正しいが結論が誤り。** `effectExecutor.ts:4986` は
`cands = lrigTop && lrigLikeFilterOk(lrigTop, gkResolvedFilter, ctx) ? [lrigTop] : []` で、
**`lrigLikeFilterOk`（同 `:4875-4895`）は `matchesFilter` へ落ちて `color` を消費する**。
⇒ **色フィルタを足すと「センタールリグが白でないとき候補0＝不発」になる**＝いまは**色を問わず能力が付く**。
`WXK11-052-E1` のコストは《白×3》だが、**白エナを払いつつ非白のセンタールリグを持つ盤面は作れる**ので到達可能。
⇒ **壊れ方は「誤選択」ではなく「不発すべき効果が通る」。実害は非ゼロ。**
🔑**この型の取り違えは既知**（BUGFIXES 2026-09-08＝codex は FP 側で真バグを消しかける）。

### ✅ 裏取りできたもの

- **O-289 の「受け皿が無い」は stale**＝`PlayerState.taken_choice_keys`（`src/types/index.ts:885`）が実在し、
  `effectExecutor.ts:6432` が `noRepeat` のとき読み、`execStubPart1.ts:922-930` が**ターン境界で消さずに**書き込む。
  ⇒ **`O-289` は engine 新機構が要らない**＝parser が `noRepeat` を出せばよい（§5.3 索引 G から降ろせる）。
- **C6 の2件がどちらも `MANUAL`**＝`manualEffects.ts` 側の作業（速いレーン）。私の独立実測と一致。
- **C4 の母集団2**＝私の独立実測（同一 cardNum に `CENTER_LRIG_RIDES_ON_SIGNI` と `RIDE_ON` が共存するのは
  `WXK01-008` / `WXK01-009` の2枚だけ・原文の【ライド】は各1回）と一致。

### 訂正後の C5 内訳

| 確度 | 件数 | effectId |
|---|---:|---|
| **A** | 2 | `WXDi-D06-014-E1`, `WXDi-P06-059-E1` |
| **B** | 2 | `WXK11-052-E1`, `WXK11-077-E1`（**codex は C としていた**・上記訂正） |
| **M** | 1 | `WXDi-P05-060-E1` |

🔴**C5 の母集団＝A+B 4効果＋M 1効果＝5効果**（登録 2 → 実測 5＝**stale**）。

### ⛔ 追加で測って**空振り**だった系統（記録＝次に同じ道を通らないため）

**「原文が3色以上を『か』で列挙しているのに live の `color` 配列が短い」**＝**候補9効果・MISS 6効果**だったが、
**1件ずつ開いたら真バグは `WXDi-D06-014-E1` の1件だけ**だった。残る5件は**別の正準形で正しく表現済み**：

| effectId | 正準形 |
|---|---|
| `WDA-F03-13-E1` | `activeCondition` が **`OR` × `ENERGY_HAS_CARD{filter.color:単色}` 4本**＝色配列を使わない |
| `WX24-P4-028-E1` / `-030-E1` / `-032-E1` / `-034-E1` | `LAST_PROCESSED_MATCHES.requiredDistinctColors: ["赤", ["白","青","緑","黒"]]`＝**入れ子配列**で「1枚が赤・もう1枚がそれ以外4色のどれか」を表す専用の軸 |

🔑**教訓＝「同じ概念のキーが1つだけ」と仮定した predicate は必ず過大に出る**（`color` 配列の長さだけを見た）。
⇒ **`census:population` の `--json` MISS と同じ読み方**＝MISS は候補であって判定ではない。

### 🔁 私（Opus）側の実測の訂正＝**相手【エナチャージ】任意は 6 ではなく 4**

私は「6効果とも `ENERGY_CHARGE_FROM_DECK{owner:opponent}` に `optional` が無い」と数えたが、
**`SPDi43-18-E1` と `WXDi-P05-072-E2` は1段上の `CHOOSE{opponentResponds:true, choices:[charge, skip]}` で
正しく表現されていた**（＝相手に選ばせる正準形）。⇒ **真バグは4効果**（`WXDi-D07-013-E1` / `WXDi-P06-011-E1` /
`WXDi-P08-059-E2` / `WX26-CP1-048-E2`）。
🔑**「アクションノードにキーが無い」は「表現されていない」ではない**＝**親ノードの正準形を必ず見る**。
（バッチA の codex はこの判定を正しく書いていた＝`hasRelevantOppEnergyOptional`）

### 🔁 私（Opus）側の実測の訂正2＝**C3①「1枚を上・残りを下」は 14 ではなく 2**

私は「`first_top_rest_bottom` は parser が一度も生成していない」→「候補14が全部 MISS」と数えたが、
**受け皿は4通りある**（バッチA の `hasTopRestBottom` が正しい）：
`first_top_rest_bottom` ／ `split_top_bottom`（原文が「好きな枚数」のとき） ／
`LOOK_TOP_ONE_RETURN_REST_BOTTOM` ／ `then:"deck_top"` ＋ `remainder:{location:"deck",position:"bottom"}`。
⇒ **候補14 / HIT 12 / MISS 2**（`WXDi-P09-050-E1` / `WXDi-P10-047-E2`＝登録どおり）。
🔑**「キー名を1つ思い浮かべて grep した結果を母集団と呼ばない」**（BUGFIXES 2040行の既出教訓を私が踏んだ）。
