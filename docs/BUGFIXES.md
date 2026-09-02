# バグ修正記録 (BUGFIXES)

## 2026-09-02（索引 A 第7・8バッチ）：§5.3 `O-86` ③payload 化の続き＝A群 26→14規則

**ベースライン**＝`dd4b320a6`（第2〜6バッチの直後）。
**A🔴 COST 26 →（較正 +5）31 → 18 → 14規則・当たり 77→23カード・真の worklist 45→18カード。**

### 第7バッチ＝計器の較正 ＋ `costScaling` payload に取って代わられた regex 13本の撤去

🔴**①まず計器が過小に出ていたのを直した**＝`censusCostText.ts` は
`const text = card.EffectText ?? ''` のような**直接の**代入しか原文変数と見なしておらず、
`const costSentence = text.split('。').find(...)` のように**1段ワンクッション置かれた**変数へ
当てている regex が**丸ごと計器から消えていた**（`costs.ts` の I-1〜I-5＝相手盤面参照の5規則）。
⇒ **代入の右辺に追跡済みの変数が出たら左辺も追跡へ足す**（行内・不動点）。A群 26→31規則。
🔑**「規則が減った」ではなく「見えていなかった」**＝較正であって退化ではない。

**②撤去した13本**＝場の＜クラス＞比例／ルリグトラッシュのアーツ比例／場の〔色・カード名〕シグニ比例／
I-1〜I-4（凍結・能力なし・チャーム・ウィルス・コイン）／ピースのルリグ体数比例／場＋エナ二重比例／
トラッシュのカード名比例／アクセ済みシグニ比例／ライフ増＋クラス減／手札枚数差比例。
どれも parser が `EffectCost.costScaling` を刻んでおり、payload 分岐が先に return する
（`census:costtext` の「payload無」列が **13本とも 0**）。
🔴**「payload無 0」だけを根拠にしていない**＝`applyCostScalingTerms` は owner/state を読めないと
`null` を返して regex へ落ちる作りなので、**撤去前後で `computeArtsEffectiveCost` の出力を
全カード × 盤面マトリクスでダンプして突き合わせた**（**323,298 通りで不一致 0**）。

🔴🔑**golden の読み取り元を payload 経路へ揃えたら、旧 regex 側の穴が1件出た**＝
`task12(xcii)` の全カード掃引に `costScalingOf` を渡したところ **`WX05-034` が新たに現れた**
（「使用コストはあなたのライフクロス１枚につき《無×1》**増える**」）。旧 regex には**この札の規則が無く**、
`O-119` の golden が `legacyBugIds` として明示的に除外していた。**退化ではなく可視化**なので
増加札として別途固定した。`O-119` 自体は legacy 経路との突き合わせが無意味になったため
**独立オラクル**（`CostScalingTerm` の定義から10行で組み立てる）へ置き換え、除外2枚も全 assert を通した。

### 第8バッチ＝センタールリグ条件の軽減／置換を `costReplacement` へ（28枚・4規則）

「あなたのセンタールリグが＜X＞の場合」14枚／「対戦相手のセンタールリグが〔色〕の場合」12枚／
「＜X＞の場合〜減り、＜Y＞の場合〜減る」1枚／「レベルN以上の場合」1枚。
受け皿＝`CostReplacementWhen` に `selfCenterLrigName` / `oppCenterLrigColor` / `selfCenterLrigLevelGte`
を追加し、参照元は **`CostReplaceCtx.lrig`**（`computeArtsEffectiveCost` が自分の引数から束ねて渡す＝
呼び出し4経路は無改修）。
- 🆕**`accumulate`**＝原文「〜減り、〜減る」の2条件の重ね（`PR-460`）。全項を見終わって印刷コストから
  動いていなければ `null`＝旧実装の `if (out !== base) return out;` と同契約。
- 🔴**`keepZeroAmounts`**＝旧実装は「対戦相手のセンタールリグ〜になる」**だけ** `normalizeCostText` の
  生出力を返しており、**`《赤》×0` が `なし` に畳まれていなかった**。表示に出る差なので忠実に保存した。
- 🔑**ガードの外に置く**＝4形のうち3つは「〜**減る**」なので `使用コストは…になる` ガードの内側に
  置くと1枚も項が作られない。
- 🔑**項の並び＝旧 `computeArtsEffectiveCost` の評価順**（置換系 → ルリグ条件）。ベット形／任意支払い形の
  早期 return もルリグ条件の項を後ろに残す（旧実装では宣言しなかったとき後段のルリグ規則へ落ちた）。

**検証**＝**全カード × 盤面マトリクス 1,293,192 通り**（ベット宣言・任意支払い済みの軸も追加）の
撤去前後ダンプ突き合わせで**不一致 0**。ブラスト半径は機械 diff で 28カード・payload 追加のみ・予定外0。

### ゲート・実機

**ゲート**＝全緑。golden 3275/3275／smoke 全異常0／fuzz 全0／census 3 / BASELINE 5／
`census:stubs` A🔴0・C0／manual-fields 0／`census:enginetext` A🔴129（据置）／
**`census:costtext` A🔴 26→14規則**／lint 0 errors。`npm run regen` 完走・**同型★0**（据置）。

**⑤実機＝8/8 PASS。** 新規4本＝`o86ScalingPayloadPay` / `o86ScalingPayloadNone`（`V-126`＝
`WX12-Re04` のルリグトラッシュのアーツ2枚で《無×4》軽減され印刷7枚→3枚で使用でき、空なら提示すらされない）／
`o86LrigCondPay` / `o86LrigCondNone`（`V-127`＝`WX11-015` がセンタールリグ花代なら《赤×1》軽減で
エナ1枚で使え、タマヨリヒメなら提示すらされない）。回帰4本＝`o86BetCostReplace` / `o86BoostExtraCost` /
`o199EncoreTextCostPay` / `o123usetimepay`。**新規はすべて反転確認つき。**

**残り**＝18カード＝β ゾーン枚数差5／相手のアーツ・スペル使用の累積5／場のシグニ存在条件3／
トラッシュ比例1／ライフ比較1／γ-1 ルリグトラッシュの色アーツ1／γ-2 場の色×クラス1／
δ-6 バニッシュ履歴1。**どれも `CostReplacementWhen` の語彙を1〜2種足せば載る見込み。**


## 2026-09-02（索引 A 第2〜6バッチ）：§5.3 `O-86` ③payload 化＝UI コスト層の原文 regex を5系統ぶん撤去

**ベースライン**＝`960cb12ab`（第1巡＝計器新設と死に規則撤去の直後）。
**A🔴 COST 規則 45→26本・当たり 261→77カード・真の worklist 229→45カード。**

**真因**＝**カードに印刷されたコスト（【アンコール】【ベット】【ブースト】）と、
原文が書いている条件つきの置換／軽減を、UI 層が「支払いのたびに `card.EffectText` を
regex で読み直して」決めていた**。同じ意味を **2〜5個の入口が別々に再解釈**しており、
規則を1本直すと入口の数だけ挙動が動く（`census:costtext` A群＝この形の全数計器）。

**どう直したか**＝読み取りを **`src/data/keywordCosts.ts` 1箇所**へ集約し、build 時に
`EffectCost` の payload として刻む。UI は `〜Of(cardNum, effectsMap)` で JSON を読むだけにした。

| バッチ | 系統 | 影響枚数 | 受け皿（`EffectCost`） | 撤去した UI 入口 |
|---|---|---:|---|---|
| 第2 | 【アンコール】の印字コスト | 32 | `encoreCost` | `parseEncoreCost`（`ArtsModal`／`BattleScreen`） |
| 第3 | 【ベット】の印字コイン選択肢 | 68 | `betOptions` | `parseBetOptions`（`artsUseGate`／`ArtsModal`／`CutinModal`／`SpellCastModal`） |
| 第4 | 【ブースト】の任意追加エナ | 5 | `boostCost` | `parseBoostCost` |
| 第5 | 使用時の任意支払いによる**軽減** | 33 | `useTimeCost` | `parseUseTimeCostReduction`（5入口＋逆翻訳） |
| 第6 | 条件つきコスト**置換／軽減** | 48 | `costReplacement` / `optionalDiscardCost` | `computeCostReplacement` の regex 7本 ＋ `parseOptionalDiscardForCost` |

🔴🔑**収穫マージの死角を最初から塞いである**＝マージは live の MANUAL/PARTIAL を効果単位で
不可侵にするので、`manualEffects.ts` が本文を手書きしたカードでは parser の刻印が**永久に届かない**
（実測＝アンコール32枚中9枚・ベット68枚中21枚）。⇒ **`buildEffectsJson.ts` が【出現条件】と同じく
マージの後から重ねる**（fresh 側の `parseCardEffects` と同じ `printedKeywordCosts` を呼ぶので値は必ず一致）。
これが無ければ「**手書きした札だけ静かにコストを踏み倒す／印刷コストで請求される**」という、
どの計器にも出ない壊れ方になっていた。

**検証**
- **A/B（旧 UI 実装を `tmp_*.mjs` へ写経 vs live payload）**＝アンコール 32/32・ベット 68/68・
  ブースト 5/5・使用時軽減 33/33・任意支払い置換 2/2 が完全一致。
  **条件つき置換は全カード × ctx 16通り × 盤面3通り＝445,584 通りを照合して不一致 0。**
- **ブラスト半径**＝ベースライン commit との機械 diff で、変化カードは**すべて payload 追加のみ・予定外 0**。
- **反転確認あり**＝実機の各シナリオに「払えない／宣言しない側」を必ず組み込んだ（下記）。
- **ゲート**＝全緑。golden 3275/3275／smoke 全異常0／fuzz 全0／census 3 / BASELINE 5／
  `census:stubs` A🔴0・C0／manual-fields 0／`census:enginetext` A🔴129（据置）／
  **`census:costtext` A🔴 45→26規則**（ratchet を実測値へ下げた）／lint 0 errors。

**⑤実機**（`src/screens/` を触ったので必須）＝**6/6 PASS**。
新規2本＝`o86BoostExtraCost`（`V-124`＝ブースト OFF は0枚で使用可／ON は0枚では押せず／
《緑》《無》《無》の3枚で成立し全額支払われる）・`o86BetCostReplace`（`V-125`＝エナ0枚では押せず／
ベット2枚宣言で《緑×0》へ置換されて使用でき／OFF へ戻すと再び押せない。ライフ 7→8・コイン 2→0 まで確認）。
回帰4本＝`o199EncoreTextCostPay` / `craftArtsBetK07105` / `o123usetimepay` / `o123usetimenopay`。

**踏んだ罠（次に触る人向け）**
1. 🔴**`JSON.stringify(Infinity)` は `null`**＝使用時軽減の `max` は原文「好きな数」で `Infinity`。
   payload では **`'ANY'` を文字列で持ち**、読み出し1箇所（`resolveUseTimeCost`）で戻す。
2. 🔴**`stopIfUnmet` を落とすと置換が別物になる**＝旧 `computeCostReplacement` はベット形／任意支払い形で
   条件が偽なら**即 `null`**。「最初に成立した項が勝つ」だけにすると後段の項へ落ちて別の置換が成立する。
3. 🔴**テンプレ文字列の `\d` は二重に書く**＝落とすと `d` に潰れて半角数字が読めなくなる。
   **現データは全角しか無いので A/B も golden も緑のまま通る**（lint の `no-useless-escape` だけが気づいた）。
4. 🔴**関数名を `use…` で始めない**＝eslint が React Hook と誤認する（`useTimeCostOf` → `resolveUseTimeCost`）。
5. ⚠**§6.3 K のトリップワイヤは印字コストを除外する**（`PRINTED_KEYWORD_COST_KEYS` を import して1本で持つ）＝
   これらは `manualEffects.ts` に書かない種類のフィールド。**届いていること自体は golden が live payload 経由で assert。**
6. 🔴**`ATTACK_SIGNI` ではアーツ窓が開かない**（`BattleScreen.tsx:8645`＝`ATTACK_ARTS` / `ATTACK_ARTS_OP` だけが
   timing `ATTACK` へ写像）＝実機シナリオでルリグデッキのカードを押しても画像拡大になるだけ。
7. ⚠**実機のエナは色を確かめて置く**＝《緑》要求に黒3枚を置くと「payload は読めているのに成立しない」に見える。

**計器の較正1件**＝`censusCostText.ts` の原文追跡 regex が `\s` を含んでおり**改行をまたいで貪欲に伸びて**、
手前の行から始まった1マッチが後続の規則を飲み込んでいた。**改行コード（LF/CRLF）の違いだけで規則が
現れたり消えたり**していた（`isMultiEna` の `'：【マルチエナ】'` で実測＝B群 4→5規則）。行内空白のみへ限定した。

**🔴この巡で見つけて直した別バグ1件＝`npm run regen` が落ちていた**
`scripts/decompileEffects.ts:2560` の `DECLARE_ICON_REVEAL_CHECK` 分岐が **存在しない関数
`describeAction` を呼んで**おり、このカードを描画するたび `ReferenceError` で全10枚の再生成が止まっていた。
**混入は `c1e141c6e`（索引 B 第2巡・`O-163`）**＝`regen` は `npm run gates` にも CI にも入っていないので、
**3コミットのあいだ誰も気づかなかった**。同ファイル内の正しい入口 `actionJa` へ差し替え。
⇒ 🔑**`gates` が緑でも `regen` が動く保証は無い**（逆翻訳シート・同型★・census:stubs C群の入力が
全部この経路）。**decompiler を触った巡は `npm run regen` まで回す**（CLAUDE.md の既定どおり）。
再生成後の**同型★は 0（据置）**。

**残り**＝`computeArtsEffectiveCost` の条件つき軽減群（`@957` センタールリグ＜X＞14カード／
`@854` 相手センタールリグ色12／`@986` 場のシグニN体につき11 ほか）。詳細は `docs/PLAN_DETAIL.md` の `O-86`。


## 2026-09-02（索引 A 第1巡）：§5.3 `O-86` の①計器・②母集団実測・③死に規則5本の撤去

**ベースライン**＝`cfe8e0d90`（索引 B を空にした直後）。`O-86` の登録票が指定する
**「①まず計器を作る ②母集団を実測 ③payload 化」**の①②を完了し、③の**最初の払い戻し**まで進めた。

**ゲート**＝全緑。golden 3275 / 3275（据置）／smoke 全異常0／fuzz 全0／census 5 / BASELINE 5／
`census:stubs` A🔴0・C0／manual-fields 0／`census:enginetext` A🔴129（据置）／
🆕**`census:costtext` A🔴45規則**（新設・ratchet）／lint 0 errors。
**実機**＝コスト系の回帰5シナリオ すべて PASS
（`chainArtsCostReduction` / `b19costup` / `b19costupnone` / `exceedCostPay` / `fezoneDoubleCostPay`）。

### ① 計器＝`npm run census:costtext` を新設（`scripts/censusCostText.ts`）

**なぜ別計器が要るか**＝既存の `census:enginetext`（`O-60`）は **`src/engine/` しか走査しない**。
実効コスト（置換／軽減／追加／使用時の任意支払い）を決めているのは
**`src/screens/battle/costs.ts` ほかの UI 層**で、`card.EffectText` を毎回読み直している＝
**A群の数字が0になってもコストの意味は原文 regex のまま**。⇒ UI コスト層専用の ratchet を切った
（`runGates` 同梱。増えても減っても exit 1＝新しく原文 regex を書いたら止まる）。

**計器を書くときに2回踏んだ罠**（初版がどちらも母集団を桁で外した）
- (a)**行ごとに読むと、ネストした arrow const（`const toCostStr = (raw) => …`）を関数境界と誤認**して
  追跡中の原文変数が消え、**A群が 2規則**しか出なかった。⇒ ファイル全体を1文字列として走査する。
- (b)`text.match(new RegExp(\`…${'${'}RED}…\`))` の**テンプレ regex**と**複数行呼び出し**が1本も拾えない
  （`costs.ts` だけで7本）。⇒ テンプレ内の `${'${'}定数}` を同ファイルの `const 名 = '…'` から解決する。
- (c)**原文を引数で受け取る関数**（`parseUseTimeCostReduction(effectText)` ほか）を数えないと
  `costs.ts` の `parse*` 群と `useTimeCost.ts` が丸ごと消える（**38 → 50規則**の差はここ）。

### ② 母集団の実測

**A🔴 COST 45規則 / 当たり 261カード**（B GATE 4規則・C OTHER 3規則）。
🔑**うち「コスト payload（`costScaling` / `conditionalEnergyReduction`）が無い」229カードが真の worklist**＝
`computeArtsEffectiveCost` は「payload が評価できたら下の全文 regex 群を通さない」構造なので、
**payload 済みの32枚は既に regex から降りている**（＝`O-86` の残作業ではない）。
⚠登録票の「178カード」はカード種別の内訳から出した別の数え方＝**今回の229が以後の正**。

### ③ 第1バッチ＝死に規則5本の撤去（真因 / 影響 / 検証）

**真因**＝`computeArtsEffectiveCost` の「使用コストは《X》を〈N〉**つ少**なくする」形5本
（センタールリグのレベル／ライフN枚以下／手札N枚以下／センタールリグ名2綴り）が
**1枚も当たっていなかった**。実データの言い回しは**「減る」だけ**で、`つ少` を含むカードは
**全 CSV で 0枚**（計器が live 0 と測り、原文側からも確認）。同じ意味は下の「減る」系の規則が担っている。
**影響**＝0効果（到達不能な枝の削除＝**挙動は1バイトも変わらない**）。A群 **50 → 45規則**。
**検証**＝`npm run census:costtext`（死に規則 0本になった）／`npm run gates` 全緑／実機コスト系5シナリオ。

### ⑤実機の要否（PLAN §2.2 の機械判定）

**必須**＝`src/screens/battle/costs.ts` を触ったため。⚠**削除だけ**なので新規シナリオは作らず、
**コスト系の既存5シナリオを回帰として回した**（全 PASS）。

## 2026-09-02（索引 B 第2巡）：§5.3 索引 B の残り9件を全消化 — `O-71` / `O-68` / `O-137` / `O-138` / `O-163` / `O-78` / `O-104` / `O-118` / `O-160`

**ベースライン**＝`eca372931`（索引 B 第1巡の直後）。**ユーザー指示で9件すべて着手前に母集団を数え直した**＝
**索引の 29効果 → 実測20効果**（`O-137` は実測0＝コード変更ゼロでクローズ）。

**ゲート**＝全緑。golden **3269 → 3275**（+6本・全件実行）／smoke 全異常0／fuzz 全0／
census **5 / BASELINE 5**／`census:stubs` A🔴0・C0／manual-fields 0／
**`census:enginetext` A🔴 130 → 129行 / 126ハンドラ**（`BASELINE_SELF_TEXT` を 129 へ下げた）／lint 0 errors。
**実機**＝新規5シナリオ＋回帰3シナリオ すべて PASS（`node scripts/verifyBattleDrive.mjs`）。

### 1件ずつ（真因 / 影響 / 検証）

- 🔴**`O-104` 偽ゲート**（`WX07-039-E2` / `WXEX1-14-E2`・2効果）
  **真因**＝「そうした場合」が `CONDITIONAL{IS_MY_TURN}`＝`evalCondition` が**常に true** を返すプレースホルダ。
  `stripDidItConditional` が消すのは**任意ステップをスキップしたとき**だけで、ここは非 optional なので消えない。
  さらに `fixedSelectionPickLimit` が候補数へクランプするため**払える分だけ払って本体が通る**。
  ⇒ 自分の＜原子＞が0体でも相手シグニをバニッシュできた。`LAST_PROCESSED_COUNT_GTE{3}` へ差し替え。
  **影響**＝2効果。**検証**＝`golden --only "第24バッチ"`（静的形＋**実行して3体/2体の両方向**）。

- 🔴**`O-78` 配線漏れ**（`WXK09-015-E3`・1効果）
  **真因**＝受け皿 `SIGNI_DEPLOY_BAN{namesFromTargets}` は既存だったが、parser の分岐が期間の綴り
  `このターンと次のターンの間` しか見ておらず、`次の対戦相手のターン終了時まで` が payload 無しの
  `STUB{DEPLOY_RESTRICT}`（engine にログしか無い**真 no-op**）へ落ちていた。
  **影響**＝1効果（実測 3→1。他2枚は既に載っていた）。**検証**＝`golden --only "SIGNI_DEPLOY_BAN"`。

- 🔴**`O-71` 遅延本文の照応**（`WXK10-045-E2` / `WX25-CP1-038-E1`・2効果）
  **真因**＝(a)`WX25-CP1-038-E1` は**パワー5000以下のゲートが無く**（どんな大型でも手札へ戻せた）、
  2文目の遅延が `STUB{RULE_REMINDER_TEXT}` に化けて消えていた。(b)`WXK10-045-E2` は
  `STUB{DEFERRED_OPP_HAND_TO_CHECK_ZONE_UNTIL_END}`（no-op）＋**無関係な `BOUNCE{相手シグニ}`**。
  受け皿の3点組（`SELECT_TARGET_ONLY`→`STORE_LAST_PROCESSED_TARGETS`→`INSTALL_DELAYED_TRIGGER{targetsStored}`）は
  既存で、新設は**手札→チェックゾーン**の `HAND_TO_CHECK_ZONE` 1つだけ（置き先は `check_rest`）。
  🔴**実機で別バグを発見**＝戻す側の `TRANSFER_TO_HAND{CHECK_CARD, fixedCardNums}` が**候補1件でも選択UIを開き**、
  ターン終了時に**盤面ごと止まった**。対象は設置時に焼き込み済みで選ぶものが1通りしか無い＝
  `execTransferToHand` に「`fixedCardNums` で候補が枚数以下なら即適用」を足した（既存 `thisCardOnly` と同じ規約）。
  ⚠**この型は golden の autopilot（`run()`）では出ない**＝`ok(result.done)` を書くまで見えない。
  **影響**＝2効果＋`fixedCardNums` を使う全効果（`O-188` / `WX24-P4-051-E2` の contract を反転）。
  **検証**＝`golden --only "O-71"` ／実機 `o71HandToCheckZone`（🔴反転＝`check_rest` の掃除より先に手札へ戻る）。

- 🏁**`O-137`＝実測でクローズ（コード変更ゼロ）**。3条件の独立判定も `SWAP_DECK_TOP_AND_LIFE` も実装済みで
  golden も張ってあった。census の「4件」は「入れ替え」regex の別用法。

- 🔴**`O-138` 条件の欠落 ＋ 「条件が真になる盤面が無い」**（`WX13-006B-E1` / `WX14-006B-E1`・2効果）
  **真因**＝「対戦相手のチェックゾーンにスペルがある場合」が丸ごと落ちて**チェックゾーンが空でも撃てた**。
  🔴**条件を足すだけだと逆側の事故**＝解決待ちのスペルは `pending_spell` が保持していて `field` のどこにも
  属さないので、条件は**永久に偽**＝レゾナ3枚が無言 no-op に化ける。⇒ `PlayerState.spell_in_check_zone` を新設
  （`QUEUE_SPELL` で置き `FINISH_SPELL`/`FINISH_CUTIN` で降ろす・turn-scoped レジストリに保険登録）。
  ⚠**処理順序（「そのスペルの効果より先に発動する」）は既に実装済み**だった＝カットイン窓が
  スペルを打ち消さず先に ON_PLAY を解決する。**影響**＝3効果（`WX13-005B-E1` 含む）。
  **検証**＝`golden --only "O-138"`（3枚の live 形＋`evalCondition` の空/シグニのみ/スペルあり/解決待ち/窓を閉じた後）。

- 🔴**`O-163` 3分岐の同時実行**（`WX16-Re17-E1` / `WX05-006-E3` / `PR-K060-E2-G`・3効果）
  **真因**＝engine が `EffectText` **全文**を regex で読んでペナルティを「相手の全シグニをトラッシュ」1種類に
  焼き込んでおり（`census:enginetext` A群）、JSON 側は**3分岐が素の3ステップとして並んでいた**＝
  `WX16-Re17-E1` は起動するたび**全シグニトラッシュ＋1体バニッシュ＋自分の手札全捨て**がまとめて起きていた。
  ⇒ `DECLARE_ICON_REVEAL_CHECK`（宣言する軸1〜2と一致軸数ごとの帰結）を新設し、全文 regex 枝を撤去。
  **影響**＝3効果。**検証**＝`golden --only "O-163"`（live 形＋一致0/1/2の3枝を実行）／実機 `o163DeclareIconBranches`。

- 🔴**`O-68` 複合コストの踏み倒し**（`WXDi-P03-019-E1` / `WXK10-006-E3`・2効果）
  **真因**＝①`fieldTrash{count:number}` では「すべて」を表せず、`parseCost` が**意図的に `undefined`**（＝`costUnparsed`）
  に倒していた（部分採用すると自分の場を1体も失わずに相手の場を全滅できるため）。`fieldTrashAll` を新設して
  既存の `'ALL'` 規約（`discardAll`/`energyTrashAll`）へ載せた＝**任意【出】の明示保留は0件になった**。
  ②「ルリグデッキから**クラフトではない**アーツ１枚を…」は修飾語1つで regex を外し、**アーツ1枚のコストが
  丸ごと落ちていた**。⚠クラフト除外は `Type === 'アーツ'` の完全一致（クラフトは `'アーツ/クラフト'`）が
  既に弾いており、`excludeCraft` を足すのは**存在しない仕事**だった。キー【起】側にアーツ徴収の支払いと
  選択UI（`KeyActivatedModal`）と可否ゲート（`canPayTrashArtsFromLrigDeck`）を新設。
  **影響**＝2効果。**検証**＝`golden --only "O-68"`／`--only "O-46 live"`／`--only "(xxix)"`／`--only "task12(lv)"`。

- 🔴**`O-160` 遅延ダメージトリガー**（`WX18-002-E3` / `WXEX2-27-E3` / `WXDi-P07-047-E1`・3効果）
  **真因**＝(a)遅延句が落ちて**起動した瞬間に無条件実行**（相手ライフを即クラッシュ／即20枚ミル）
  (b)直接形は `ON_SIGNI_DAMAGE`（＝**このシグニが**与えたとき）で近似され、ルリグアタックのダメージを取りこぼす。
  ⇒ `ON_PLAYER_DAMAGED` を新設。発生印 `PlayerState.damaged_just` は**アタックの2経路**
  （`crashOneLife` とルリグアタック）だけが立て、クラッシュ解決 funnel が読んで `consumeDamagedJust` で消す。
  ⚠**`ON_OPP_LIFE_CRASHED` を流用してはいけない**＝あちらは**効果によるクラッシュでも発火**する。
  **影響**＝3効果。**検証**＝`golden --only "O-160"`／実機 `o160DamageByAttack`＋`o160DamageByEffect`（🔴反転）。

- **`O-118` エクシードの選択権**（`WX10-001` E1/E2/E3・3効果）
  **真因**＝ルリグ【起】の経路には選択UIが無く**下から機械的に**払い、色指定は貪欲に満たすだけだった。
  `LrigGrantedModal` に選択UIを新設し、`performLrigActivated` に `exceedIndices` を通した。
  ⚠**未選択なら従来どおり自動**（既存フローを1バイトも変えない）／中途半端な選択は発動を止める／CPU は据置。
  **影響**＝3効果＋エクシードを払う全ルリグ【起】のUI。
  **検証**＝実機 `o118ExceedPick`（未選択で発動可／赤＝色不成立で不可／白で可＋その札がルリグトラッシュへ）
  ＋回帰 `exceedCost`。

### 反転確認（🔴＝旧挙動なら落ちる）

実機5シナリオのうち**3本が反転確認**＝`o160DamageByEffect`（効果のクラッシュで発火したら FAIL）／
`o118ExceedPick`（色を満たさない選択で発動できたら FAIL）／`o71HandToCheckZone`（`check_rest` の掃除に
食われてトラッシュへ落ちたら FAIL）。`o163DeclareIconBranches` は「相手全滅**かつ**自分の手札全消し」で FAIL。

### ⑤実機の要否（PLAN §2.2 の機械判定）

**必須**＝`src/screens/`（`BattleScreen.tsx` / `LrigGrantedModal` / `KeyActivatedModal` /
`controller/battleController.ts` / `turnScopedState.ts`）を触り、**新しい型・機構を6組**足したため。⇒ 同巡で実行・全 PASS。

## 2026-09-02（索引 B 第1巡）：§5.3 索引 B の上から3件 — `O-181` / `O-59` / `O-58`

**ベースライン**＝`bc71f6c0c`（索引 C を空にした直後）。**3件とも「機構が無い」のではなく「実装済みの機構が
境界で止まっていた」**＝索引 C 第10巡と同じ型。**作業中に別のバグを2件見つけて直した**。

**ゲート**＝全緑。golden **3265 → 3269**（+4本・全件実行）／smoke 全異常0／fuzz 全0／
census 高シグナル **5**（据置）／`census:stubs` A群🔴0・C群0／manual-fields 0／
`census:enginetext` A🔴130行（据置）／lint 0 errors。
**実機 4シナリオ・25アサート すべて PASS**（うち**反転確認7本**）。
**在庫**＝機構 worklist **33 → 30項目**（索引 A 17／**索引 B 12 → 9**／索引 E 4）。

---

### 🔑 まず実測 — `O-181` の母集団は「残4効果」ではなく**残2効果**だった

`WXK11-006-E4`（キー）と `WX24-P3-055-E2`（場のシグニ）は、**legacy の
`collectLrigAttackGuardedTriggers` が既に発火させていた**（`sourcesLAG` にキーと場のシグニが入っている）。
索引の「残4」は登録当時の標本で、現在値ではなかった。

```
legacy collectLrigAttackGuardedTriggers → [ 'WXK11-006-E4', 'WX24-P3-055-E2' ]
```

⇒ 🔑**collector は「読む」のではなく「走らせて数える」。** 索引 C の全巡で繰り返し出た教訓がここでも当たった。

---

### `O-181` 軸(b) — `collectAttackEndTriggers` が **1行の early return** で watcher を見ていなかった

- **真因**＝`if (!isLrigAttack) return { entries, usedOncePerTurnIds };`
  ＝**シグニアタックのときはアタッカー自身しか走査していなかった**。
  `WX25-CP1-012-E1`（原文「あなたの**ルリグかシグニが**アタックによって…」）は**ルリグが watcher** なので、
  自分のシグニがアタックしても永久に発火しない。
- **直し方**＝watcher 走査を**明示 opt-in（`triggerScope:'any_ally'|'any'`）限定で**シグニアタックにも広げた。
  ⚠既定 `'self'` の既存効果は1件も巻き込まない（他のシグニの self `ON_ATTACK_END` が誤発火しないことを golden で固定）。
- **新設**＝`triggerCondition.attackCrashedLife` ＋ `AttackEndTriggerOptions.crashedLife`。
  🔴**未提供は「分からない」＝発火させない**（fail-closed）。
- 🔴**旧 live は `ON_OPP_LIFE_CRASHED` の即時発火**＝2つ同時に壊れていた：
  ①「**アタックによって**」の限定が無く**効果によるクラッシュでも撃てた**（過剰）
  ②「**そのアタック終了時**」ではなく**クラッシュした瞬間**に割り込んでいた（バトルの解決前）。

### `O-181` — 「そのアタック終了時に」の遅延が**アタック宣言時**に発火していた

- `WX14-018-E4`「次のターンの間、対戦相手のシグニ１体がアタックしたとき、**そのアタック終了時に**そのシグニをバニッシュする」。
- 🔴**宣言時にバニッシュすると、そのアタック自体が起きない**（バトルもライフクラッシュも発生しない）＝
  原文（バトル解決**後**に落とす）より明確に強い。
- **新設**＝`InstallDelayedTriggerAction.trigger.attackEnd` ＋ `collectAttackEndDelayedTriggers`。
  宣言時の2 collector（`collectSigniAttackDelayedTriggers` / `collectAttackerSelfDelayedTriggers`）は
  このフラグを**読み飛ばす**＝二重発火しない。**両側**（防御側・攻撃側）から呼ぶ。

---

### `O-59` — トラップ4機構のうち3つが「ログだけの no-op」だった

| 原文 | 旧 | 新 |
|---|---|---|
| `WX17-062-E1`「あなたのすべての【トラップ】を好きなように配置し直す」 | `[トラップ再配置：並べ替え対話は未実装]` | **`REARRANGE_SIGNI` に `mode:'traps'`**（新しい対話は作らない） |
| `WX16-028-E2`「それが**あった**シグニゾーンに手札から〜設置」 | `[トラップ設置保留: previous]` | `PlayerState.trap_removed_zones`（抜く funnel が書く）＋ゾーンを選ばせず直行 |
| `WX17-029-TRAP`「このカードは**それのトラップ能力を得て**、その能力を発動する」 | `[トラップ能力コピー：未実装]` | 既存 `trapOp:'activate'` と同じ「対象の `TRAP_ICON` を exec」 |

🔑**①は新しい対話を1本も作っていない**＝シグニの並べ替えと**器だけが違う**（`field.signi_traps` を置換する）ので、
pending・UI・確定ハンドラを丸ごと共有した。UI は文言だけ分岐（「シグニを配置し直す」と書くと嘘になる）。

🔴**③は `sourceCardNum` を差し替えてはいけない**＝原文は「**このカードが**得て発動する」なので、
コピー元（トラッシュの札）を効果元にすると能力中の「このシグニ」が**場に居ないカード**を指す。
（`trapOp:'activate'` は「**場のシグニの**トラップアイコンを発動」なので差し替えるのが正しい＝**向きが逆**。）

⚠**②は記憶が無ければ何もしない**（fail-closed）＝自由ゾーンへ誤設置すると原文と別の効果になる。

### 🔴 別バグ① — `WX21-025` は**3能力が2つに混線**していた

原文は【自】／【出】／【トラップアイコン】の3つ。旧 live は：

- **E2（【出】）に【トラップアイコン】の本文が流れ込んで**おり、正しく動く `SET_OPP_SIGNI_AS_TRAP` の後ろに
  `GRANT_KEYWORD{トラップアイコン→自分}` と `TRAP_OPERATION{trapFixedZone:'source'}`（保留ログだけ）が続いて
  **同じ設置を2回書いている**状態だった。
- その結果、**このカードには `TRAP_ICON` 効果が1つも無かった**（アイコンが発動しても何も起きない）。
- **E1 も2つ壊れていた**＝「そのシグニ」ではなく**別の相手シグニを選べ**（`targetsTriggerSource` 欠落）、
  「**その【トラップ】**」が丸ごと落ちていた。

⇒ 3能力へ分解し、`trapZoneOfTriggerSource` を新設（**無指定の `trapOp:'trash'` は先頭から N 枚**なので
別ゾーンのトラップを巻き込む）。【トラップアイコン】の「＜トリック＞2枚捨てる**か**《青》《青》」は
`additionalCostChoices` に **`handDiscard` を足して**表した（🔴無いと `costColors` 空の枝が常に available ＝
**捨てられない盤面でも押せて**支払いが空振りしたまま帰結だけ通る）。

---

### `O-58` 段2 — 登録票が予告していた障害3点を全部片付けた

#### 🔴 障害③を**先に**決着させた（ミラーする前に）

`ACCE_BANISH_SUBSTITUTE` は **ログだけが「ゲームから除外」で実装は `trash`** だった
（`WXDi-P09-TK03A`「代わりに**これをゲームから除外**してもよい」＝トラッシュだと回収できてしまう）。
**防御側を `excluded` へ直してからアタッカー側へミラーした**（不整合を複製しない＝登録票の指示どおり）。

#### 障害①② — 2 kind を足してアタッカー側にも同じ器を通した

- `BanishSubstituteOptionState` に **`trash_charm` / `exile_acce`** を追加（モーダルのラベルも対で）。
  ⚠**アクセ除外はダウンが付く**のでラベルに明示する（選ぶ判断が変わる）。
- アタッカー側は**防御側と同じ `pending_banish_substitute` / `banish_substitute_choice` を自分の state で**使う。
  🔑アタッカーはターンプレイヤー＝この解決を回している本人なので、**同じモーダル・同じハンドラ**で済んだ。
  ⚠**必須置換（段1）を先に見る**＝選択の余地が無いものを、任意の問いより先に確定させる。

#### 🔴 防御側の「自動適用」も外した

原文は「〜して**もよい**」なのに battle ladder が**無条件で適用**しており、
**「付いている札を残してバニッシュを受ける」という選択が player から奪われていた**
（しかもアタッカー側には1本も無い＝`O-58` の非対称そのもの）。

#### ⚠ 効果バニッシュ経路にも同じ2 kind を実装した（§3 (cxxix) の再発防止）

`isImplementedSubstituteCost` は **`kind !== 'pay_cost'` を無条件で通す**ので、
`applyEffectBanishSubstituteChoice` に分岐が無いと末尾の `trashStackSpell` 枝へ落ちて
「**0枚トラッシュで成立**」＝**コスト0の身代わり**になる。対価が既に無い場合は「回避できない」で止める。

---

### 新設した型・状態

| 追加 | 用途 |
|---|---|
| `triggerCondition.attackCrashedLife` ＋ `AttackEndTriggerOptions.crashedLife` | 「アタックによってライフを1枚以上クラッシュしたとき」（`O-181` 軸(b)） |
| `InstallDelayedTriggerAction.trigger.attackEnd` ＋ `collectAttackEndDelayedTriggers` | 「そのアタック終了時に」の遅延（`O-181`） |
| `PlayerState.trap_removed_zones` | 「それがあったシグニゾーン」の記憶（`O-59`） |
| `REARRANGE_SIGNI.mode:'traps'` | 【トラップ】の並べ替え（`O-59`・**新しい対話は作っていない**） |
| `StubAction.trapZoneOfTriggerSource` | 「**その**【トラップ】」＝トリガー元と同じゾーン（`O-59`） |
| `additionalCostChoices[].handDiscard` | エナ以外の対価で払う枝の**可否判定**（`O-59`） |
| `BanishSubstituteOptionState` の `trash_charm` / `exile_acce` | 付いている札を対価にする任意置換（`O-58` 段2） |

**撤去**＝防御側 ladder の CHARM_PROTECTION / ACCE_BANISH_SUBSTITUTE の自動適用（選択肢へ移行）。

---

### 逆翻訳（計器に映らないと直したことが見えない）

新しいペイロードは**4つとも逆翻訳へ描いた**。旧文と並べると、直す前と後が区別できるようになった：

```
- WX21-025-E1: …：対戦相手のシグニ1体をトラッシュに置く
+ WX21-025-E1: …：それ（トリガー元シグニ）をトラッシュに置く。そしてそのシグニゾーンにある【トラップ】をトラッシュに置く
- WX21-025-E2: …設置する。そしてこのシグニは【トラップアイコン】を持つ。そうした場合、…設置する   ← 同じ設置が2回
+ WX21-025-E2: …：対戦相手のシグニ１体を対象とし、それを【トラップ】としてそのシグニゾーンに設置する
+ WX21-025-TRAP: 【トラップアイコン】以下のいずれかを支払ってもよい【《青》《青》→… ／ 手札から＜トリック＞のカードを2枚捨てる→…】
- WX25-CP1-012-E1: 【自】対戦相手のライフがクラッシュされたとき：…
+ WX25-CP1-012-E1: 【自】あなたのルリグかシグニがアタックによって対戦相手のライフクロスを1枚以上クラッシュしたとき、そのアタック終了時：…
+ WX14-018-E4: …対戦相手のシグニがアタックしたとき、そのアタック終了時にそのシグニをバニッシュする
```

⚠`WX21-025-TRAP` は旧実装なら「**コストを支払ってもよい**」に潰れていた（何を払うと何が起きるかが1文字も出ない）。

---

### 検証コマンド

```
npm run build:effects && npx tsx scripts/syncManualLive.ts WX14-018 WX25-CP1-012 WX21-025
npm run regen && npm run gates          # 全緑（golden 3269／census 高シグナル 5）
npm run verify:browser                  # 実機4シナリオ・25アサート 全 PASS
```

**⑤実機の要否判定**＝`src/screens/`（`BattleScreen.tsx` / `EffectInteractionModal.tsx` /
`BanishSubstituteModal.tsx` / `rearrangeSigniUi.ts`）を触り、**新しい型・機構を7組足した**ので
**PLAN §2.2 により実機まで必須**。

---

## 2026-09-02（索引 C 第10巡）：§5.3 索引 C の残り7件を全消化して**索引 C を空にした** — `O-74` / `O-79` / `O-83` / `O-94` / `O-103` / `O-130` / `O-150`

**ベースライン**＝`c9f4cff6b`。**7件のうち1件（`O-103`）は丸ごと stale**、**3件は「実装済みの機構が pending／funnel の境界でフラグを落としていた」型**だった。
**作業中に別のバグを2件見つけて直した**（器の誤流用1件・過剰実行1件）。

**ゲート**＝全緑。golden **3259 → 3265**（+6本・全件実行）／smoke 全異常0／fuzz 全0／
census 高シグナル **5**（据置・`SELF_PLAY_RESTRICT` を較正キーに追加＝下記）／`census:stubs` A群🔴0・C群0／
manual-fields 0／`census:enginetext` A🔴130行（据置）／lint 0 errors。
**実機 6シナリオ・28アサート すべて PASS**（うち**反転確認5本**）。
**在庫**＝機構 worklist **43 → 33項目**（索引 A 17／索引 B 12／索引 E 4）。**索引 C は 0**。

---

### 🔑 この巡の主題 — 「1効果の項目」でも受け皿は engine の **funnel 側に既にあった**

**§5.3 冒頭「1〜3枚の項目の取り方」の第1項（まず受け皿を疑う）が 7件中 5件で当たった。**

| ID | 登録票の見立て | 実際 |
|---|---|---|
| `O-74`/`O-79` | 「例外つき出撃制限の機構が無い」 | **`deployLimit.ts` の `deployLimitBlockReason`（呼び出し元10箇所の既存 funnel）へ1本足すだけ**だった |
| `O-83` | 「条件が既存の条件型に無い」 | **`LRIG_LEVEL_CMP_OPP{lt}` が既存**。グロウ予約も `pending_flip_grow_card` と同じ形が既にあった |
| `O-103` | 「受け皿が2択専用でエナの枝が落ちる」 | **丸ごと stale**＝`manualEffects.ts` が3択 `CHOOSE` で表しており live にも届いていた |
| `O-130` | 「帰結が『効果を受けたシグニ』を参照する受け皿が無い」 | **`triggeringCardNum` → `targetsTriggerSource` で足りた**（collector は特定済みで、entry へ載せていなかっただけ） |

⇒ **1効果の項目でも「新しい型」から入らない。まず funnel と既存フラグの通り道を読む。**

---

### 🔴 この巡の最大の発見 — 「実装済みの機構が **pending／funnel の境界** でフラグを落としていた」型が3件

**型が在ることと、その型がプレイヤーの操作地点まで届いていることは別。**

#### ① `O-150` — `LOOK_AND_REORDER` の `reorder` が pending へ1バイトも運ばれていなかった（**live 105効果が過剰実行**）

- **真因**＝`execLookAndReorder` が `needsInteraction` へ渡す `PendingInteractionDef` に **`reorder` を含めていなかった**。
  だから `EffectInteractionModal` は ↑↓ を**常時**描き、`resumeLookAndReorder` はクライアントが返した並びを**無条件で信じて**いた。
- **母集団**＝live の `LOOK_AND_REORDER` **151効果のうち 105効果が `reorder:false`**（「デッキの一番上を見る」等）＝
  **全部が並べ替え可能**になっていた（＝デッキトップを自由に組み替えられる過剰実行）。
- 🔑**`O-144`（続き718）でフラグを41効果へ届けても実機の挙動が変わらなかったのはこれが理由。**
  分岐すべきは `remainder.reorder` ではなく**この1本**だった（登録票の見立てが当たっていた）。
- **直し方は3点セット**＝①pending へ `reorder` を運ぶ ②UI は `inter.reorder !== false` のときだけ ↑↓ を描き、
  案内文も「元の順番のまま戻ります」へ ③**engine を並びの権威にする**（`reorder:false` なら `pending.cards` の順を使う）。
  🔴**③が要る**＝UI だけ直すのは片肺（細工されたリクエストや別クライアントの実装差でそのまま通る）。
- ⚠**トラッシュ選択／上下振り分け／`first_top_rest_bottom` は封じていない**＝どれも「**どれを**」の選択であって「**どの順に**」ではない。

#### ② `O-94`② — ゾーン配置制限の判定が funnel の**外**にあり、通常召喚UIの1箇所からしか呼ばれていなかった

- 旧＝`effectEngine.collectCenterZoneDeployRestrict`（呼び出しは `BattleScreen` の通常召喚1箇所）＝
  **CPU 配置も engine の効果配置も素通り**。しかも **`return 3` とゾーン index 1 がハードコード**で、
  JSON を見ても何が起きるか分からなかった（`census:enginetext` A群と同じ形）。
- 新＝判定を **`deployLimitBlockReason`（`zoneIndex` を渡した呼び出し元が受ける）** へ移し、旧 collector は撤去。
  配線先は**通常召喚UI／召喚ゾーンモーダル／CPU 召喚／`execAddToField`** の4本。
  - 召喚ゾーンモーダルは**ボタン単位で落とす**（旧は押せてしまってから `handleSummonSigni` が黙って弾いていた）。
  - `execAddToField` は**制限に掛からない空きゾーンを選ぶ**（旧は無条件に「最初の空き」）。
- レベルとゾーンは `StubAction.zonePlacementRestrict{zones,minLevel}` として parser が刻む（逆翻訳にも出る）。

#### ③ `O-130` — collector は「効果を受けたシグニ」を特定していたのに entry へ載せていなかった

- `collectOppArtsUseTriggers` は `affectedByOppArtsFilter`（`O-113` で新設）に**マッチしたシグニを持っていた**のに、
  `StackEntry` へ載せずに捨てていた＝帰結の「そのシグニ」が解決できず、live は
  `REMOVE_ABILITIES{owner:'opponent'}` 単独に落ちていた。
- ⇒ `triggeringCardNum` に載せるだけで既存の `targetsTriggerSource` が働く（**新機構ゼロ**）。

---

### `WXK11-019-E2` は3つ同時に壊れていた（部分修正では過小↔過剰に裏返る）

原文＝「あなたのシグニ１体が対戦相手のアーツの効果を受けたとき、**そのシグニをアップし**、ターン終了時まで、
**そのシグニ**は**効果によって得ている**能力を失う。」

1. **「アップし」が丸ごと欠落**（過小）
2. **能力を失わせる相手が逆**＝原文は「効果を受けた**自分の**シグニ」／旧 live は `owner:'opponent'`（向きが真逆）
3. **「効果によって得ている能力」なのに印刷能力ごと消していた**（過剰）

3が別軸だったので受け皿を新設した（下記）。**1つでも残すと原文にならない**（第6巡 `WXDi-P16-056-E1` と同型）。

---

### 🔴 別バグ① — 「効果によって得ている能力を失う」が**印刷能力ごと**消していた（2効果）

- **`abilities_removed` は全能力喪失**なので、この語彙をそこへ倒すと**原文が触れていない印刷【常】【自】【起】まで消える**。
  live で該当したのは `WXK11-019-E2` と **`SPK01-13` の選択肢⑤**（「対戦相手のすべてのシグニは効果によって得ている能力を失う」）の2効果。
- **新設**＝`RemoveAbilitiesAction.grantedOnly` ＋ `PlayerState.granted_abilities_removed`（turn-end 寿命・`turnScopedState` に登録）。
- 🔑**読み側を funnel 化した**＝`grantedStore.grantedEffectsOf(state, num)` 1本に集約し、
  **`granted_effects` / `granted_effects_until_opp_turn` を直読みしていた 8箇所（`effectEngine`）＋1箇所（`effectExecutor`）**を通した。
  さらに engine 全体の読み口である **`BattleScreen` の augmented effectsMap 合成**でも落とす。
- ⚠**逆翻訳にも描いた**（`〜は効果によって得ている能力を失う`）＝落とすと全能力喪失と同じ文になり、
  **直した実装と壊れた実装を計器が区別できない**。

### 🔴 別バグ② — `WXDi-P11-TK01` が**器ごと違う STUB** で書かれていた

- 原文＝「【常】：あなたのターンの間、対戦相手はシグニを**２体まで**しか場に出すことができない。」＝**体数制限**。
- 旧 manual＝`STUB{OPP_ZONE_PLACEMENT_RESTRICT}`＝engine では「**中央のシグニゾーンにレベル3以上を置けない**」
  （`WXDi-P14-068` 用の別機構）として読まれていた ⇒ **体数制限は1件も効かず、代わりに中央ゾーンだけ封じていた。**
- 正しい形（`STUB{DEPLOY_RESTRICT{kind:'count',cap:2,subject:'opponent'}}`）は **parser が既に出していた**ので、
  §6.4 `O-42` の規約どおり **manual 定義ごと撤去**した（影武者コピーを残すとこのカードだけ parser 改善が永久に届かない）。
  live 側の MANUAL スタンプは `census:orphanmanual --unfreeze A` で解凍（実体は1バイトも変わらないことを A/B で確認）。

### 🔴 「ルール注記」に見えて実効ルールだった1件

`SP38-001` の「この方法でグロウしたルリグの【出】能力は発動しない」は **`STUB{RULE_REMINDER_TEXT}`＝完全な no-op**
だった（＝効果でグロウしたルリグの【出】が普通に発動する過剰実行）。
`GROW_BY_EFFECT_SUPPRESS_ON_PLAY` へ移し、`performGrow` の **`suppressOnPlayOnce`**（そのグロウ**1回だけ**）で効かせる。
⚠ターン全体のフラグ `suppress_center_on_play` へ焼き付けない（同じターンの別のグロウを巻き込む）。

---

### `O-83` のグロウは「コストを払う」— `GROW_FREE` を流用しない

- 原文に「コストを支払わずに」が**無い**ので、`GROW_FREE`（＝踏み倒し）は使えない。
- **engine は予約だけ**（`STUB{GROW_BY_EFFECT}` → `PlayerState.pending_effect_grow`）、
  実グロウは `BattleScreen` の `executeGrow`（正規経路）＝`pending_flip_grow_card`（`O-10` 続き515）と同じ形。
  🔑engine で `field.lrig` へ直接 push すると**【出】・リミット再計算・コイン獲得が丸ごと落ちる**。
- グロウモーダルの `freeGrowFilter` に **`'plus1_paid'`** を足した（`defaultFreeCost` は false ＝通常のグロウコストを払う）。

---

### 新設した型・状態（この巡で本当に新規なのは5つ）

| 追加 | 用途 |
|---|---|
| `SelfPlayRestrictAction.exceptSourceCardNames` ＋ `DeployLimitInput.placementSourceCardNum` | 配置元の効果を**カード名**で限定（`O-74`/`O-79`） |
| `DeployLimitInput.zoneIndex` ＋ `StubAction.zonePlacementRestrict` | ゾーン＋レベルの配置禁止（`O-94`②） |
| `RemoveAbilitiesAction.grantedOnly` ＋ `PlayerState.granted_abilities_removed` ＋ `grantedStore.grantedEffectsOf` | 「効果によって得ている能力」だけの喪失（`O-130`） |
| `PendingInteractionDef.LOOK_AND_REORDER.reorder` | 並べ替え可否を pending まで運ぶ（`O-150`） |
| `PlayerState.pending_effect_grow` ＋ `STUB{GROW_BY_EFFECT}` / `{GROW_BY_EFFECT_SUPPRESS_ON_PLAY}` ＋ `freeGrowFilter:'plus1_paid'` | 条件つきグロウ（コストは払う）＋【出】抑制（`O-83`） |

**撤去**＝`deployRestrict.kind` の `only_by_effect`（死枝）／`effectEngine.collectCenterZoneDeployRestrict`／
`manualEffects` の `WXDi-P11-TK01`／`RULE_REMINDER_TEXT` への誤誘導1本。

---

### 計器（較正であって前進ではない）

- **census 高シグナル**＝`WXDi-P11-050-E1` が `STUB{DEPLOY_RESTRICT}` から `SELF_PLAY_RESTRICT` へ移った瞬間に
  **STUB 免除が外れて +1** した（6）。`vocabCensus.ts` の「制限「できない」」へ **`SELF_PLAY_RESTRICT`** を追加して 5 へ戻した。
  🔴**較正の唯一の危険＝キーが免罪符になる**ので、`O-132` のトリップワイヤ（較正キーが live に実在する）へ1行足してある。
- **golden の負方向契約を1本畳んだ**＝`O-60④ parser` の「『効果によってしか』は機構未実装として明示」は
  **実装が入った瞬間に嘘になる assert** だった（第2巡の教訓＝負方向契約が項目を眠らせる）。
- `WXK11-019-E1` の逆翻訳から `〈※コスト未表現〉` が消えたのは**この巡の変更ではない**＝
  そのカードは `_held_fresh` に居て parser の改善が凍っていた。`syncManualLive` で E2 を届けた際に一緒に解凍された。

---

### 検証コマンド

```
npm run build:effects && node scripts/heldReview.mjs --adopt WXDi-P11-050,SP38-001
npx tsx scripts/syncManualLive.ts WXK11-019 SPK01-13
npx tsx scripts/censusOrphanManual.ts --unfreeze A
npm run regen && npm run gates          # 全緑（golden 3265／census 高シグナル 5）
npm run verify:browser                  # 実機6シナリオ・28アサート 全 PASS
```

**⑤実機の要否判定**＝`src/screens/`（`BattleScreen.tsx` / `EffectInteractionModal.tsx` / `SigniSummonZoneModal.tsx` /
`GrowModal.tsx` / `useGrowModal.ts` / `growLogic.ts`）を触り、**新しい型・機構を5組足した**ので **PLAN §2.2 により実機まで必須**。

---

## 2026-09-02（索引 C 第9巡）：§5.3 索引 C を上から15件 — `O-84` / `O-114` / `O-180` / `O-151` / `O-164` / `O-167` / `O-177` / `O-186` / `O-203` / `O-205` / `O-206` / `O-209` / `O-210` / `O-213` / `O-72`

**ベースライン**＝`981a504df`。**15件のうち5件で登録票の「受け皿が無い」が失効していた**（`O-205` は丸ごと stale）。
新設した型は**5組＋STUB 2本**だけ。

**ゲート**＝全緑。golden **3243 → 3259**（+16本・全件実行）／smoke 10,721 全異常0／fuzz 全0／
census 高シグナル **6 → 5**（`BASELINE_HIGH` も 5 へ）／`census:stubs` A群🔴0・C群0／manual-fields 0／
`census:enginetext` A🔴130行（据置）／lint 0 errors。
**実機 10本／10本 PASS**（うち**反転確認5本**）。**在庫**＝機構 worklist **58 → 43項目**（索引 C 22 → 7）。

---

### 🔴 この巡の主題① — 「実装済み」と書かれた項目が2件とも**経路単位で穴**だった

**完了報告は「型があるか」ではなく「入口が何本あるか」で確かめる。**

- **`O-210`（`WX24-P4-050-E2`）＝向きが真逆だった。** `bySource:'by_this'` は
  `banish_redirect_by_source_nums` に載るが、**この配列を読むのは `BattleScreen` のバトル解決3箇所だけ**。
  原文は「このシグニ**の効果によって**対戦相手のシグニ1体がバニッシュされる場合」＝**効果経路**なので、
  **効果バニッシュでは一度も置換されず、逆にバトルでだけ置換されていた**。
- **`O-164`（`WX15-010-E1`）＝入口が2本あるうち1本だけ塞いでいた。**
  効果バニッシュの1回消費盾は `applyDirectAction` の `BANISH`（`targetsLastProcessed` 等）にしか無く、
  **`execBanish` の `applyBanish`（対象を選んで撃つ本線）は素通り**していた
  ＝「対象を選んで撃つと防げないのに、それ経由なら防げる」無言のズレ。

⇒ この巡は**4本を funnel 化**した＝`applyBanishPreventShield` ／ `consumeBanishRedirectOnce` ／
`applySplitTotalToTargets` ／ `trashExileCostSatisfied`+`canAddTrashExileIndex`+`trashExileAffordable`。

### 🔴 この巡の主題② — 実機が机上では出ない嘘を2件捕まえた

- **`TrashActivatedModal` の実行ボタンが「発動する（トラッシュから場に出す）」固定**だった。
  アクション出し側（`getMyTrashCardActions`）のラベルだけ直しても**モーダルは嘘のまま**。
  ⇒ **同じ文言を2箇所で組み立てているものは必ず両方直す**（`trashActivateVerbLabel` へ集約）。
- **`WXDi-P13-043` はシグニではなくアシストルリグ**＝【出】は手札召喚ではなく**アシストグロウ**で発火する。
  ⇒ **シナリオを書く前に `CardData` の `Type` 列を読む**（「【出】＝召喚」と決めつけない）。

---

### 1. `O-213` — 「このゲームの間にリレーピースを使用している」（1効果・**受け皿は在った**）

**真因**＝`effectParser.ts:21231` に `LRIG_TRASH_COUNT{filter:{cardType:'リレーピース'}}` の規則が**既にあった**のに、
`manualEffects.ts` の `WXDi-CP01-002` が **`PARTIAL` で上書き**して届いていなかった（第4の死角の"出所あり"版）。

- **直し方**＝manual 定義を**削除**して parser に任せた（`§6.4 O-42 tripwire` の指示どおり＝実体同一の影武者は残さない）。
  2つの【使用条件】は原文が「両方の…」と明記しているので **AND** で載る。
- ⚠**「使用している」の近似はルリグトラッシュ**＝使用済みピースは `lrig_trash` へ入る（`execUtils.ts:2597` に明記）。
  ゲームから除外されたピースは残らない＝**偽陰性側（fail-closed）**。
- **影響**＝1枚（`WXDi-CP01-002`）。旧はデッキ2434枚ミルが**使用条件なしでいつでも撃てた**。
- **検証**＝golden `索引C 2026-09-02: O-213 …`（成立／不成立の両方向）。

### 2. `O-209` — 「好きな生徒1人との絆を獲得する」（1効果・**受け皿は在った**）

**真因**＝`GAIN_BOND{source:'declared'}` は型・parser 規則・`effectExecutor.ts:9695` の消費・
`PlayerState.bonds`（【絆】アイコンのゲート）まで**完成済み**だった。`WXDi-CP02-001-E1` が原文の**末尾2文**を
落としていただけ。「ルリグの下からカードを合計4枚ルリグトラッシュに置く」＝**エクシード4**＝`OptionalCostSpec.exceed`。

- **直し方**＝`STUB{OPTIONAL_COST, exceed:4}` → `CONDITIONAL{PAID_ADDITIONAL_COST}` → `GAIN_BOND{declared}`。
  使用条件②（《連邦生徒会》か《クロノス報道部》の使用歴）も `LRIG_TRASH_COUNT{cardNames}` で同時に載せた。
- **engine は0行**。**影響**＝1枚。
- **検証**＝golden `索引C 2026-09-02: O-209 …`（任意コストが絆獲得より前にあることまで固定）。

### 3. `O-151` — 「それらのパワーを合わせて－18000」で対象宣言が別の文にある（1効果）

**真因**＝`PR-K026-E1-G2` は**対象宣言が丸ごと落ちて** `CONDITIONAL{LAST_PROCESSED_COUNT_GTE 9} → STUB{POWER_MOD_PER_COUNT}`
だけ＝**相手のパワーは1ミリも下がらない**（真 no-op）。

- **受け皿は既存の3点**＝`STUB{SELECT_TARGET_ONLY}`（盤面を変えない対象宣言）＋
  `STUB{STORE_LAST_PROCESSED_TARGETS}`（`storedTargetCards` へ固定）＋`POWER_MODIFY{targetsStored, splitTotal}`。
  🔑**間にミル9枚を挟んでも対象が生き残る**のがこの組の要点（`lastProcessedCards` はミルで上書きされる）。
- **engine 1点**＝`execPowerModify` の `splitTotal` が `targetsStored` を honor するようにした。
  旧は必ず選択UIを出したので**同じ対象へ ON_TARGETED が二度立つ**（対象宣言は1回）。
  割り振り本体は `applySplitTotalToTargets` 1本へ集約（選択経路と共有＝1体なら対話を挟まない規約も共有）。
- **死枝を撤去**＝`parseSentencePart4.ts` の catch-all `それらのパワーを(合わせて|合計で)` は
  母集団が0になったので削除（登録票の指示どおり）。
- **検証**＝golden 2本（`splitTotal は targetsStored なら…` ／ `PR-K026-E1-G2 は対象宣言→ミル9→割り振りの順に…`）。
  `BASELINE_SPLIT_TOTAL` 5 → 6。

### 4. `O-167` — 【起】コスト「このシグニを場から手札に戻す」（1効果）

**真因**＝この句が**どのコスト規則にも当たらず丸ごと踏み倒されて**いた（`WX21-031-CB-E2` はエナ《白》だけで撃てた）。

- **新設**＝`EffectCost.bounceSelf`。🔴**`trash_self` へ寄せない＝行き先が違う**
  （手札なら同じ札を再利用できる／トラッシュなら資源を失う＝コストの重さが別物。§5.3 `O-67` の `fieldBanish` と同じ取り違え）。
- **配線**＝parser 規則1本＋`BattleScreen` の【起】コスト funnel（離場は `removeFromField` を共有）＋
  `SigniActivatedModal` のラベル＋`CPU_AUTO_PAYABLE_COST_KEYS`＋逆翻訳。
- **影響**＝1枚。**census 高シグナル -1**（`AUTO` のまま JSON に載った＝**真の前進**）。

### 5. `O-206` — `trashExile` の集合制約が支払いモーダルで enforce されない（1効果）

**真因**＝型（`selectionConstraint`）は 2026-08-31 から在ったのに、支払いUIは **`size >= count` しか見ておらず**
`WXK09-029-E2` は**同名のスペル3枚でも払えた**（`energyTrash` とまったく同じ穴）。

- **直し方**＝`costs.ts` に `trashExileCostSatisfied` / `canAddTrashExileIndex` / `trashExileAffordable` を新設し、
  **支払いモーダル2本（`SigniActivatedModal` / `LrigGrantedModal`）と可否ゲート（`signiActivateGate`）**を
  同じ関数へ通した。⚠**判定はここ1本に集約**（写経すると「その入口からだけ制約なしで払える」になる）。
- `WXK09-029-E2` は `PARTIAL` → `MANUAL`。
- **検証**＝golden（異名3枚は払える／同名3枚は払えない・提示もされない／タップ時ガード）＋
  **実機2本**（`o206TrashExileDistinct` / `o206TrashExileSameName`）。

### 6. `O-177` — ライフバースト無効に「カードの条件」を載せられない（1効果）

**真因**＝`PlayerState.suppress_life_burst` が **boolean** で、`WX25-P3-003-E1` の
「**対戦相手のセンタールリグと共通する色を持たない**対戦相手のカードのライフバーストは発動しない」が
**そのターンの相手のバーストを全部止めて**いた（過剰実行）。

- **直し方**＝`boolean | TargetFilter` へ広げ、判定を `lifeBurstSuppress.ts` の
  `lifeBurstSuppressedByTurnFlag` 1本に集約（`LifeBurstCheckModal` は**カードごと**に呼ぶ）。
  ⚠**基準ルリグはフラグの持ち主**（抑制フラグはクラッシュ**される側**に立つ）。
  ⚠**色は配列で渡す**（文字列だと `colorExclude` が1要素扱いで1色も除外されない＝§5.3 `O-183` の実測）。
- ⚠ルリグ色が引けないときは**抑制しない側**へ倒す（fail-closed）。
- **検証**＝golden（共通色なし＝抑制／共通色あり＝抑制しない／boolean は全部止める）。

### 7. `O-164` — 「次にバニッシュされる場合、バニッシュされない」が**効果経路の本線**で効かない（1効果）

**真因**＝上の「主題①」。`applyBanishPreventShield` を新設して `execBanish` の `applyBanish` と
`applyDirectAction` の `BANISH` の**両方**から通した。身代わり（`BANISH_SUBSTITUTE`）より**先**に見る
（原文は「バニッシュされない」＝離場自体が起きない）。

- ⚠**1回消費は instance 単位**＝`abilities_removed` に積むのは肩代わりした `src`（`thisCardOnly` なら victim 自身）
  なので、＜武勇＞が複数いても**各自が1回ずつ**吸収する（原文どおり）。
- `WX15-010-E1` は `PARTIAL` → `MANUAL`。**検証**＝golden（1回目は吸収／2回目はバニッシュされる）。

### 8. `O-210` — `BANISH_REDIRECT` の「次に1回だけ」＋効果経路（1効果）

**真因**＝上の「主題①」（向きが真逆）＋回数無制限。

- **新設**＝`BanishRedirectAction.byEffectOnly` / `consumeOnce`、
  `PlayerState.banish_redirect_by_source_effect_nums` / `banish_redirect_once_source_nums`。
- `banishDestination` が `opts.effectSourceNum` と突き合わせて置換し、**`consumedOnceSource` を返すだけ**にした
  （置換元の state を書き換えるのは呼び出し側＝この関数は被バニッシュ側の state しか返せない）。
  消費は `consumeBanishRedirectOnce` 1本で `applyBanish` / `applyDirectAction` の両方から呼ぶ。
- ⚠**バトル経路の消費地点は未配線**なので、`byEffectOnly` を伴わない `consumeOnce` は書かない（型コメントに明記）。
- parser 規則も足したので `manualEffects` の影武者を削除（`§6.4 O-42 tripwire`）。**検証**＝golden（両方向）。

### 9. `O-114` — スペル／アーツの「別能力としての【起】」が UI から使えない（2効果）

**真因**＝①`trashActivated` は本体が「場に出す／シグニゾーンに出す」のときしか立たず、
**「トラッシュにあるこのカードを手札に加える」自己回収**（`WX10-096-E2`）を知らなかった
②**エナゾーン起動の入口そのものが無かった**（`WXDi-P06-077-E2`）。どちらも**どこからも提示されない**過小実行。

- **新設**＝`CardEffect.energyActivated`（`trashActivated` と**入口だけが違う**＝支払い・実行は
  `trashActivateCost.ts` / `executeTrashActivated` を共有）＋`PlayerField` の `getEnergyCardActions`
  （エナゾーンの `Stat` に `my-energy` testid とゾーンモーダルの action を配線）。
- **ラベルを本体アクションから決める**＝`trashActivateVerbLabel`。
  🔴**実機で発見**＝`TrashActivatedModal` の実行ボタンも「トラッシュから場に出す」固定だった（**2箇所目**）。
- **検証**＝**実機4本**（`o114EnergyActivated` / `o114EnergyActivatedGated`＝＜美巧＞の使用条件で反転／
  `o114TrashSelfToHand` / `o114TrashSelfNoCharm`＝【チャーム】コストで反転）＋golden 1本。

### 10. `O-84` — 「条件を満たす場合、このアーツは追加で《アタックフェイズアイコン》を持つ」（1効果）

**真因**＝使用可否の Timing は `CardData.Timing` 列を読む**静的判定**なので、
**盤面条件で timing を1つ足す動的な口が無く**、`WX16-Re20-E1` は `DEFERRED_…` で恒久 no-op だった。

- **新設**＝`StubAction.extraUseTiming` ＋ `ActiveCondition.LIFE_COUNT`（`Condition` 側には元から在り、
  **片側だけ育っていた**＝§5-2‴ の再発）。消費は `artsUseGate.ts` の `collectExtraUseTimings` 1本
  （人間UIと CPU はどちらも `checkArtsUse` を通る）。
- 🔴**向きに注意**＝**足す側**（`timingOk` へ `||` で合流）。条件を使用可否の必須項に混ぜると
  「ライフ2枚以下でしか使えないアーツ」に化ける。`effectParser.ts` の `STATE_HOIST_BATCH1_CARDS`
  ガードはその誤変換を封じているので**外していない**。
- 宣言は本体の `SEQUENCE` から外して**別の CONTINUOUS 効果（E2）**にした（撃った後に宣言しても間に合わない）。
- **検証**＝**実機2本**（ライフ2枚＝アタックフェイズで使える／ライフ5枚＝使えない）＋golden（両方向＋
  「本体の使用条件へライフ条件を載せていない」）。`ACTIVE_CONDITION_TYPES` 66 → 67。

### 11. `O-180` — 「次にアシストルリグにグロウする場合、ルリグタイプは無視され、コストは《無×1》減る」（1効果）

**真因**＝`GROW_COST_REDUCTION` に**実行ハンドラが1つも無かった**（`collectGrowCostReductions` は
**場の CONTINUOUS** しか走査しない）＝ピース `WX24-P2-043` が**丸ごと無言 no-op**。

- **新設**＝`GrowCostReductionAction.nextAssistGrowOnly` / `ignoreLrigType` ＋
  `PlayerState.next_assist_grow_mods`（**1回きり**＝`executeAssistGrow` が消す・ターン終了時も消える）。
- ⚠**アシストグロウ専用**（原文が「アシストルリグにグロウする場合」）＝`listGrowCandidates`（センター用）ではなく
  `getAssistGrowCandidates` 側だけが読む。⚠`BLOCK_ACTION{IGNORE_LRIG_TYPE}` は**グロウ先ルリグ自身の宣言**で軸が別。
- コスト軽減は `AssistGrowModal` で `collectGrowCostReductions` の結果へ合流する。
- **検証**＝**実機1本**（`o180NextAssistGrowMods`）＋golden（【常】版は state へ焼かないことまで固定）。

### 12. `O-203` — 「あなたの効果1つによってこのシグニを参照する場合、レゾナとしても扱う」（1効果）

**新設**＝`STUB{TREAT_SELF_AS_RESONA}` ＋ `PlayerState.treated_as_resona_until_opp_turn`。
参照側は `fieldCandidates` が `Type` を `'レゾナ'` へ差し替えて読む。

- 🔑**「としても」＝シグニでもある は無料で成立する**＝`matchesFilter` は `Type==='レゾナ'` を
  `cardType:'シグニ'` フィルタにも一致させる（非対称の緩和が以前から入っている）。
- ⚠**近似を明記**＝`fieldCandidates` は「誰の効果が参照しているか」を知らないので、原文の
  「**あなたの**効果1つによって」は絞れない（相手の「レゾナ1体を対象とし」にも当たり、`excludeResona` では逆に外れる）。
  **1効果のための意図的な近似**。**検証**＝golden 4方向（レゾナに当たる／シグニにも当たる／印が無ければ当たらない／`excludeResona` に掛かる）。

### 13. `O-186` — 「次のあなたのターン終了時まで」の `EffectDuration` が無い（2効果）

**真因**＝`UNTIL_END_OF_TURN` に潰れており**相手ターンを跨がずに切れて**いた（過小）。
`UNTIL_OPP_TURN_END` へ寄せても**1ターン短い**。

- **新設**＝`EffectDuration.UNTIL_NEXT_OWN_TURN_END` ＋
  `PlayerState.power_mods_until_next_own_turn` / `abilities_removed_until_next_own_turn`。
- 🔑**寿命はグローバルターン終了の回数で数える**＝自分のターン中に置いたら **3**
  （自T終了→相手T終了→**次の自T終了で消える**）、相手のターン中（ライフバースト等）なら **2**。
  🔴**`_next_turn` の2スロット式では表せない**（あれは常に1回ぶんしか跨げない）。
- `clearTurnEndScopedState` が毎ターン終了時に1減らし、生き残った分を `abilities_removed` へ書き戻す。
  `calcFieldPowers` にも新ストアを足した（足さないと JSON に載るだけの死フラグ）。
- **影響**＝`WXDi-P13-043-E1` / `WXK10-022-BURST`。
- **検証**＝**実機1本**（`o186UntilNextOwnTurnEnd`＝寿命3で載ることまで観測）＋
  golden（3回のターン終了で切れる／従来の2スロットは2回で切れる、の対照つき）。

### 14. `O-72` — `ON_ATTACK_PHASE_START` がフェイズ限定【常】の配る【自】を拾えない（1効果）

**真因**（登録票の「当て」どおり）＝`effectsMap`（memo）は **`bs.turn_phase`＝遷移「前」**（MAIN）で組まれるので、
`collectGrantedFromUnderSigni` の `activeCondition:{DURING_ATTACK_PHASE}` がまだ false ＝
**付与された【自】が augmented map に載る前に `ON_ATTACK_PHASE_START` を収集していた**。

- **直し方**＝`mkTrigCtxForPhase(phase, …)` を新設し、**遷移先フェイズで下カード付与だけを組み直す**
  （フェイズ以外の条件は遷移で変わらないので memo を捨てない）。⚠**effectId で重複を弾く**（二重発火防止）。
- 開始時トリガーの4呼び出し（`ON_ATTACK_PHASE_START` / `ON_GROW_PHASE_START` / `ON_MAIN_PHASE_START`）に
  遷移先を渡し、**CPU 版（`collectCpuTurnTriggers`）にも同じ引数**を通した
  （写経して片方だけ落とすと「人間ターンでは発火するのに CPU ターンでは発火しない」無言のズレになる）。
- **影響**＝`WXK08-048-E1`。**検証**＝golden（ATTACK_ARTS 基準なら載る／MAIN 基準では載らない＝真因そのもの）。

### 15. `O-205` — **stale**（1効果）

登録票「`lrigAttackNoDamage` の発火地点は【ガード】された経路だけ」は **続き772 の `O-181` で失効していた**＝
`collectAttackEndTriggers` が非ガードのダメージ無効を補完しており、golden
`O-181 ON_ATTACK_END: ルリグ付与・全場 watcher を…`（`:13728`）が既に assert 済み。
契約の在処だけを golden 1本で固定してクローズ。

---

### 計器の更新（**内訳を混ぜない**）

- **census 高シグナル 6 → 5**＝**前進1件だけ**（`WX21-031-CB-E2` が `AUTO` のまま `bounceSelf` を載せた）。
  🔴**この巡で MANUAL 免除に入った分は 0**（新しく `MANUAL` にした効果はもともと高シグナルに出ていない）。
- **`ACTIVE_CONDITION_TYPES` 66 → 67**（`LIFE_COUNT`）／**`BASELINE_SPLIT_TOTAL` 5 → 6**。
- **`§6.4 O-42 tripwire` が2件を検出**＝parser に規則を足した結果 `WX24-P4-050-E2` / `WXDi-CP01-002-E1` が
  **実体同一の影武者**になったので manual 定義を削除し、`census:orphanmanual --unfreeze A` で live の
  スタンプも `AUTO` へ戻した（残さないと parser 改善が永久に届かない）。
- **在庫**＝機構 worklist **58 → 43項目**（索引 A 17／B 12／**C 22 → 7**／E 4／F 3）。
  Sheet1 要対応 **22 / 863**（据置＝`mech` 22・即着手可能 0）。台帳 残 OPEN **44**（据置＝この巡は §5.2 から取っていない）。


## 2026-09-02（続き774）：§5.3 索引 C を上から5件 — `O-162` / `O-199` / `O-200` / `O-201` / `O-202`

**ベースライン**＝`a4f666a2c`。**新しい `Condition` 型もアクション型も1つも足していない**（足したのは既存型のフィールドと
STUB 2本だけ）。**5件のうち4件で登録票の「受け皿が無い／窓が無い」が失効していた。**

**ゲート**＝全緑。golden **3233 → 3243**（+10本）／smoke 10,721 全異常0／fuzz 全0／
census 高シグナル **12 → 6**（`BASELINE_HIGH` も 6 へ）／`census:stubs` A群🔴0・C群0／manual-fields 0／
`census:enginetext` A🔴130行（据置）／lint 0 errors・250 warnings。
**live の per-effect diff は 8効果ちょうど**（HEAD との全数 diff で意図外の変化が無いことを確認）。

---

### 1. `O-162` — 「プレイヤーをN人まで選ぶ」（2効果）

**真因**＝parser が `STUB{CHOOSE_N_FROM_LIST}` へ落とし、engine の `([１-４1-4])つ(?:まで)?選ぶ` は
原文「N**人**まで」に**1本も当たらない**＝**選択が無言 no-op**。後続だけが焼き込んだ owner で走っていた。

- `WXEX2-44-E2`「プレイヤーを1人まで選ぶ。**そのプレイヤーは**自分のトラッシュを全部デッキへ」
  → 旧 live は `TRANSFER_TO_DECK{owner:'self'}` 固定＝**対戦相手を選んでも自分のトラッシュが戻る**真逆の実行。
- `WXK06-028-E2`「プレイヤーを2人まで選ぶ。選ばれた各プレイヤーは手札を全部デッキへ加えてシャッフルし、
  加えた枚数と同じ枚数を引く。**最大5枚まで**」
  → 旧 live は `STUB{MASS_TRASH}`（**トラッシュへ置く別物**）＋**ドローが丸ごと無い**。

**直し方**＝🔑**新しい型を作らなかった**。選べるプレイヤーは「あなた」「対戦相手」の2つしか無いので、
**選択肢そのものを owner 違いの同じアクションにする**と「選ばれたプレイヤーを後続へ運ぶ口」（登録票の②）が要らない。
`CHOOSE{choose_count, upTo:true, choices:[self, opponent]}` を `manualEffects.ts` に手書き（`MANUAL`）。
引く枚数は `DRAW{count:0, addLastProcessedCount:true}`＝`TRANSFER_TO_DECK{HAND_CARD,'ALL'}` の
`lastProcessedCards` に追従（枚数を焼き込まない）。**上限5枚だけ新設**＝`DrawAction.maxCount`
（engine で `Math.min` を1回・デッキ残量のクランプとは別軸・逆翻訳に `（最大N枚まで）`）。

**検証**＝golden `索引C 2026-09-02: O-162 …` 2本（0人／1人／2人・上限5枚・`maxCount` 無しなら9枚引く反転）。
実機 `o162ChoosePlayer`＝「対戦相手」だけを選ぶと **相手の手札 7 → 5（上限で止まる）／自分は 3 のまま**。

---

### 2. `O-199` — アンコールの「テキスト形」コスト（**登録票 2効果 → 実測5枚**）

**真因**＝`screens/battle/costs.ts` の `parseEncoreCost` が `《…》` アイコンしか読まず **null（＝コスト無し）**に落ちる。
null だと `canEncore` が false になるので、**アンコールの選択肢そのものが出ない**（実害は過小の側）。

**母集団**＝`WDA-F02-08`（下から3枚）／`SP27-010`・`SP27-016`（下から2枚）／`SPK01-13`（キー1枚）／
`WX14-016`（手札から＜美巧＞1枚）。**32枚のアンコール札のうち5枚**。

**直し方**＝`parseEncoreCost` を `{energy, coins, exceed?, trashOwnKey?, handDiscardSigni?}` へ拡張。
- ①「ルリグの下からN枚をルリグトラッシュ」→ **既存 `exceed`**（`paySelectedExceed` がそのまま使える）
- ②「キー1枚を場からルリグトラッシュ」→ `trashOwnKey`
- ③「手札から＜X＞のシグニをN枚捨てる」→ `handDiscardSigni`（既存の `selectedArtsDiscard` UI を再利用）
- ⚠🔴**テキスト形と判定するのは「－の直後が `《` でない」ときだけ**＝
  `アンコール－《黒》このターン、あなたのシグニの【出】能力は発動しない` のような
  **アイコンの後ろに続くアーツ本文**をコストと読み違えると**払わされる側＝過剰**になる。
  32枚全部に当てて、アイコン形27枚の解釈が1件も変わっていないことを確認した。
- `ArtsModal`＝`canEncore` に支払い可否（`canPayExceed` / キーの有無 / 手札の該当枚数）を足し、
  ボタンのラベルに支払い内容を出す。`performArts`＝`exceed`（プール先頭から N 枚の近似）と `trashOwnKey` を徴収。

**検証**＝golden `索引C 2026-09-02: O-199 …` 2本（5枚の解釈＋アイコン形の非退行＋本文誤読の反転）。
実機 `o199EncoreTextCostPay`（下3枚を払ってアーツがルリグデッキへ戻る）／
`o199EncoreTextCostShort`（🔴**下が2枚ならアンコールが押せない**）。

---

### 3. `O-200` — ルリグデッキからキーを場に出す（2効果）

**登録票の「`field.key_piece` を置く手段がゼロ」は失効していた**＝`PLACE_KEY_FROM_LRIG_DECK` は
`WDK03-001-E1` 用に続き760 で新設済み（engine ハンドラ・逆翻訳・golden つき）。

**真因**＝2効果とも live が `SEQUENCE[ADD_TO_FIELD{source なし} × 2]`＝キーと無関係な別物。

**直し方**＝既存受け皿を3点だけ拡張した。
- `cardName` を**省略可**にし、省略時は**ルリグデッキのキーから選ばせる**（候補1枚なら対話を出さない）。
- `payPrintedCost` ＋ `coinReduction`＝**選んだキーの `Cost` 列**（コイン＋エナ）を徴収し、
  **払えないキーは候補に出さない**（踏み倒しを作らない）。エナは `selectOptionalCostEnergy` で自動選択。
  ⚠読むのは `Cost` 列であって `EffectText` ではない（`census:enginetext` A群とは別軸）。
- `PlayerState.key_place_limit`（`STUB{SET_KEY_PLACE_LIMIT}`）＝「このゲームの間、キーをN枚まで場に出せる」。
  消費は2地点＝engine の `execPlaceKeyFromLrigDeck`（枠が空いていれば `key_piece_extra` へ積む）と
  `BattleScreen` のキーセット可否ゲート／配置先。

🐛🔴**副産物＝「キーが1枚も場に出せない」実バグを発見して修正**（`o200KeyGateOn` が最初 FAIL したので調査）。
`getMyLrigDeckCardActions` が `const timing = cardData.Timing ?? ''` として `!timing` で
「タイミング指定なし＝メインで使える」を判定していたが、**CSV の空欄は `'-'`（空文字ではない）**＝truthy。
**Timing 列が全部 `-` の全80枚のキーが、ルリグデッキから永久に使用不可**だった。⇒ `'-'` を `''` へ正規化。
⚠ピースは Timing に文言が入るので影響なし＝壊れていたのはキーだけ。

**検証**＝golden `索引C 2026-09-02: O-200 …` 2本（選択・枠の積み上げ・差し替えの反転・印刷コストの徴収と不足時の非成立）。
実機 `o200KeyFromLrigDeck`（【起】でキーが出て枠が2になり既存キーが残る）／
`o200KeyGateOn`（枠2なら手で2枚目を置ける）／`o200KeyGateOff`（🔴**枠1なら置けない**）。

---

### 4. `O-201` — 【出】任意コストの新しい支払い種別（2効果）

**登録票の「`resolveOptionalCostSpec` から支払いUIまでの縦切り」は半分失効**＝`OptionalCostSpec` も
支払いUIも既にある。🔴**本当の真因は `optionalOnPlayCostStub` の `SUPPORTED` 集合**＝
**未対応キーが1つでもあると `wrapOptionalOnPlay` が null を返し、その任意【出】が丸ごと積まれない**
（＝`costUnparsed` と同じ「取りこぼす側」）。だから登録票は「cost を書くと発火しなくなる」と読めていた。

- `WXDi-P12-031-E2`「**手札とエナゾーンにあるすべてのカードをトラッシュに置く**：この方法で6枚以上…バニッシュ」
  → parser は既に `discardAll` + `energyTrashAll` を出せるのに `SUPPORTED` に無いので**差し戻されていた**
  （`manualEffects.ts` に `costUnparsed:true` を手書きして温存）。`SUPPORTED` へ通し、
  `discardAll → handDiscard{count:'ALL'}` / `energyTrashAll → energyTrash{count:'ALL'}` を写す。
  🔑**「この方法で6枚以上」は `activeCondition` 側へ移した**＝`action` の中に置くと**支払い後**に評価され、
  手札もエナも空なので**必ず偽**になる（過小）。支払い前の「手札＋エナが6枚以上」は「全部捨てる」形なので枚数として同値。
- `WXDi-CP02-100-E1`「**トラッシュから＜ブルアカ＞のカード1枚をデッキの一番下に置く**：」
  → 新しい `EffectCost.trashToDeckBottom` ＋ `OptionalCostSpec.trashToDeckBottom`。
  ⚠**`trashExile`（ゲームから除外）を流用しない**＝行き先が違う（除外は戻ってこない）。
  支払いは既存 `TRANSFER_TO_DECK{TRASH_CARD, position:'bottom'}` に載る。
  通常召喚経路（`SigniOnPlayCostModal` ＋ `executeSigniOnPlayCost`）にも選択UIと徴収を足した。

**据置契約を反転**＝golden `(xxix)(2) 第15波後の明示保留3効果は costUnparsed のまま保持する` を
**3効果 → 1効果**（残るのは `WXDi-P03-019-E1`＝`O-68` の領分）。連動して4本のカウント assert を実数へ更新
（`optionalCost` 962→964／`optionalNoCost` 20→18／`deferred` 3→1／通常アシスト収集 158→159・据置 2→1）。

**検証**＝golden `索引C 2026-09-02: O-201 …` 2本。
実機 `o201TrashToDeckBottomPay`（トラッシュの＜ブルアカ＞が**デッキの一番下**へ行き、＋2000 が乗る）／
`o201TrashToDeckBottomNoPay`（🔴**候補が無ければ「発動」が押せず、本体も走らない**）。

---

### 5. `O-202` — コスト付きの置換（2効果）

**登録票の「置換の発生時に支払いを問う窓が無い」は失効していた**＝窓は2本とも既存。
①ダメージ置換＝`screens/battle/lifeCrashReplace.ts` の `kind:'pay_cost'`（続き543）
②離場置換＝`collectLeaveSubstituteOptions` の `selfAbilityPay` 軸（続き511）。
**足りなかったのは支払い種別だけ。**

- `WX24-P3-043-E1`（ピース）「このターン、あなたがダメージを受ける場合、代わりに**レベル1以上のアップ状態の
  アシストルリグ2体をダウンして**もよい」
  → 旧 live は `ACTIVATED{DOWN{SIGNI, level>=1, isUp}}`＝**使った瞬間にシグニを1体ダウンするだけ**の別物
  （置換の宣言でも、アシストルリグでも、2体でもない）。
  → `LifeCrashReplaceAction.replaceKind:'pay_cost'` ＋ `payOptions[].assistLrigDown{count,minLevel}` を新設し、
  funnel の `pickPayOption` / `applyPayCostReplacement` に通した。⚠**アップの枠が足りなければ成立しない**
  ＝ダメージがそのまま通る（過剰にしない側）。⚠`once` を付けない（原文に「次に」が無い）。
- `WXEX2-28-E1`（【常】）「あなたの＜ウェポン＞のシグニ1体が**対戦相手の効果によって**場を離れる場合、
  代わりにアップ状態のこのシグニをダウンしてもよい」
  → 旧 live は素の `CONTINUOUS DOWN{thisCardOnly, optional}`＝**CONTINUOUS は `executeAction` を通らない**ので
  **恒久 no-op**（`LIFE_CRASH_REPLACE` 系と同じ壊れ方）。守りが1回も働いていなかった。
  → 離場置換の新軸 `downProtector`（`STUB{EFFECT_LEAVE_REPLACE_WITH_DOWN_SELF}`）。
  ⚠**無料の軸より後ろ**に置く（`selfAbilityPay` と同じ規約＝タダで済む置換があるのに資源を払わない）。
  ⚠**`BATTLE_LEAVE_REPLACE_WITH_DOWN`（`WXDi-CP02-TK01A-E2`）とは別物**＝あちらは「**このシグニ自身が**
  バトルか相手効果で離れる場合」で BattleScreen のバトル経路だけが読む。こちらは**他の味方を守る**＋**効果離場**。
  → golden `段2-10 A/B4`（`thisCardOnly` DOWN の母集団）から `WXEX2-28-E1` を外した。

**検証**＝golden `索引C 2026-09-02: O-202 …` 2本（アシストのダウン払いの成立／アップ1体・レベル不足・
`cardMap` 無しの3反転／`downProtector` の宣言者ダウン＋victim 残存と、ダウン済み・非＜ウェポン＞・自分の効果の3反転）。
実機 `o202DamageReplaceDeclare`（**置換が宣言として積まれ、その場では誰もダウンしない**）。

---

### 実機（`verifyBattleDrive.mjs`）＝新規9本すべて PASS（単体でも9本一括でも）

`o162ChoosePlayer`／`o199EncoreTextCostPay`／`o199EncoreTextCostShort`🔴／`o200KeyFromLrigDeck`／
`o200KeyGateOn`／`o200KeyGateOff`🔴／`o201TrashToDeckBottomPay`／`o201TrashToDeckBottomNoPay`🔴／
`o202DamageReplaceDeclare`。`queryState` に `keyPieceExtra` / `keyPlaceLimit` / `powerModsUntilOppTurn` を追加。

**この巡で踏んだ罠（次に同じ作業をする人へ）**
- 🔴**CSV の空欄は `'-'` であって空文字ではない**＝`!timing` 判定でキー80枚が使用不可になっていた（上記）。
- 🔴**`TargetFilter.story`（＜ブルアカ＞等）が読むのは `CardClass` の「：」より後ろ**＝
  CSV の `Story` 列は `-` / `Dissona` の2値しか無い。golden の候補選びで2回外した。
- 🔴**`UNTIL_OPP_TURN_END` のパワー修整は別ストア**（`power_mods_until_opp_turn`）＝
  `temp_power_mods` だけ見て「効果が走っていない」と誤読した。
- 🔴**「召喚」→ゾーン選択は別ティック**＝同じ tick で両方押すループを書くと永久に場に出ない。
- 🔴**同じ testid を押し続けない**＝`keycost-energy-0` はトグル。複数枚コストは index を進めて1枚ずつ選ぶ。
- 🔴**`manualEffects.ts` を機械編集したらキー集合の差分を取る**＝重複キー（`WXK02-004` / `WXK03-014` が既存）を
  作ってしまい、`syncManualLive.ts` が**既存の手書き定義を落とした live** を書いた（HEAD の per-effect diff で発見して復旧）。
- 🔴**`syncManualLive.ts` は live を直接書く**＝AUTO 効果の held な parser 差分まで一緒に焼き込む。
  `WXK03-014-E1` が巻き込まれたので **HEAD の値へ戻した**（採用は `heldReview --adopt` の仕事）。
- 🔑**golden のカウント assert が落ちると、そのテストは途中で止まって POOL カーソルの消費量が変わる**＝
  **無関係なテストが道連れで落ちる**。カウントを実数へ直したら道連れも消えた（先に赤の原因を1つずつ潰す）。

## 2026-09-02：§5.3 `O-52` — 「めくれるまで公開」4効果を `REVEAL_UNTIL` へ復元

**ベースライン**＝`824910248`。登録票の「色除外 filter が無い」は誤りで、既存の
`TargetFilter.colorExclude` と全 `RevealUntilStopCondition.filter` がそのまま使えた。
`levelLteLastProcessed` / `suppressOnPlay` も型・resolve・live 実績まで確認して再利用した。
さらに「兄弟を新設」とされた `levelLtLastProcessed` も、型・resolve・parser・逆翻訳・golden まで既に実装済みだった。

**parser / live**＝次の AUTO 4効果だけを fresh から `heldReview --adopt` で採用した。
- `WX20-041-CB-E1`＝`colorExclude:'青'`＋`story:'遊具'` で停止し、停止札だけを手札へ。
- `WXK01-045-E2`＝相手シグニを `TRASH` 後、相手デッキからそのレベル以下まで公開して場へ出す（【出】抑止）。
- `WXDi-CP01-015-E1`＝相手のレベル2以上を `TRASH` 後、相手デッキからそのレベル未満まで公開して場へ出す（【出】抑止）。
- `SP27-005-E1`＝＜水獣＞まで公開し、停止札を手札／場の2択、残りをシャッフルしてデッキ下へ。

停止条件だけに filter を置くと公開した不一致札も pick 候補になるため、4件とも `hit.filter` に同じ filter を明記した。
全5枚の effects JSON を baseline とオブジェクト比較し、変化は上記4カード・4 effectId だけ。
既存 `REVEAL_UNTIL` 17効果（MANUAL 8／PARTIAL 1を含む）は全件一致し、`WX04-015` は触っていない。

**engine の追加検算で見つけた穴**＝`REVEAL_UNTIL{owner:'opponent'}` は公開元だけ相手デッキになる一方、
SEARCH pending に `deckOwner` が無く、残り札の復帰先が self に既定されていた。
`deckOwner` と相手 responder を pending へ渡して修正した。
`SP27-005` の2択は新UIを作らず、既存 SEARCH pending の `handOrField` と画面側の選択経路を
`RevealUntilHitSpec.handOrField` から再利用したため、`src/screens/` は未変更・実機不要。

**`lastProcessedCards` 境界**＝`TRASH` の選択 resume が実選択カードを `lastProcessedCards` に設定してから
SEQUENCE の `REVEAL_UNTIL` へ進むことを実装で確認。golden では前々段値としてレベル3以上を注入したうえで
レベル2 victim をトラッシュし、`lte` はレベル2、`lt` はレベル1で2枚目停止することを固定した。

**golden（+4本、計3233）**＝parser の live/fresh 構造、色／クラス不一致を越えて3枚目だけで止まる境界、
`lte` / `lt` の2枚目停止と相手デッキ owner、＜水獣＞の手札／場両枝を追加。
旧「SP27-005は非採用」契約も削除せず採用契約へ反転した。

**据置**＝`WX04-015` は依頼どおりスコープ外。現 HEAD では既に MANUAL の
`OPP_REVEAL_SPELL_USE_FREE` 経路に載っているため、今回の `REVEAL_UNTIL` バッチからは独立して扱う。

**検証**＝`npm run census:goldentypes` 未カバー0、フィルタなし `npm run golden` 3233/3233 PASS、
`npm run gates` 全緑（golden 3233/3233・smoke 10721 全0・fuzz 全0・census 高シグナル11・
STUB A群0・enginetext 130行/127ハンドラ・manual-fields 0/0・lint 0 errors/250 warnings）。

## 2026-09-02：§5.3 `O-181` 軸(a) — ルリグのアタック終了時（`ON_ATTACK_END`）の収集地点を新設

**ベースライン**＝`fc669c349`。**Codex が実装途中で使用上限に当たり（`.codex-work`）、Claude が引き継いで完成・検証した。**

**真因（1行）**＝`collectAttackEndTriggers` の唯一の呼び出し地点がシグニのバトル解決 Phase2 末尾だけで、
**ルリグのアタックは `performGuardResponse` を通る**ため、ルリグ側のアタック終了が誰にも収集されていなかった。

**engine（Codex 実装）**＝`collectAttackEndTriggers` に `AttackEndTriggerOptions{attackerKind, wasGuarded}` を足し、
①ルリグアタックでは付与ストア（`grantedStoreWatchers`＝`GRANT_LRIG_ABILITY` の結果は `effectsMap` に載らない）を走査
②watcher≠アタッカーは `triggerScope:'any_ally'|'any'` か `lrigAttack*` 条件で**明示的に opt-in したものだけ**を拾う
（無条件の全場走査にすると既存の「このシグニが」7効果が他者のアタックで誤発火する）。
呼び出しは `BattleScreen.performGuardResponse` のガード／ダメージ確定後＝**シグニ側と同じ境界**（LB 解決の前）。

**🔴Claude が引き継いで直した2点（Codex の未検証部分に欠陥があった）**＝
① **parser 規則が到達不能だった**＝`trigText.includes('このルリグがアタックしたとき') ? ['ON_ATTACK_LRIG']` の分岐が
   **先に**あるため、Codex が `ON_ATTACK_END` 側の regex に `ルリグ` を足しても**一度も通らなかった**
   （`build:effects` しても live も fresh も1バイトも変わらないことで発覚）。先行分岐に「そのアタック終了時」の除外を入れた。
② **`attackDealtNoDamage` の抽出 regex が語形を取りこぼしていた**＝旧 regex は
   「ダメージが与えられて**いない**場合」だけを見ており、`SPDi43-03` / `WXDi-D04-004` の「**いなかった**場合」と
   `WX24-P3-055` の「ダメージを与えて**いなかった**場合」に当たらず、**条件なしで発火**する形になっていた。
   受身/能動 × 現在/過去の4語形へ広げた。

**影響**＝live は `SPDi43-03-E2`（付与される `sub-E1`）が
`ON_ATTACK_LRIG`（＝**アタック宣言時**）→ `ON_ATTACK_END` + `triggerCondition{attackDealtNoDamage}` + `triggerScope:'self'` へ。
**全 CSV 全数差分で変化したカードはこの1枚だけ**（`heldReview --adopt SPDi43-03` で採用）。
`WXDi-D04-004-sub-E1` は旧形（`ON_GUARD` + `lrigAttackNoDamage`）で live に入っており、
**新しい収集地点の legacy 分岐が同じ地点へ合流させる**（live JSON は不変・PARTIAL のまま）。

**golden**＝**据置契約を1本反転**した＝第40バッチの
`「WXDi-D04-004-sub-E1 は発動タイミングが主因なので据置」`（`ON_ATTACK_END` が**無い**ことを assert していた）を、
`ON_ATTACK_END` と `attackDealtNoDamage` が**在る**ことの assert へ差し替え
（**落ちたテストを消して通すのは禁止**・PLAN §5.2 の規約どおり反転させた）。全件 3229/3229 PASS。

**実機（🔴必須＝`src/screens/` を触った）＝Claude が追記して実行・3/3 PASS。**
⚠**実カードではなく合成の付与能力を注入している**＝実カードの本体は《赤》の**任意**支払いを含み、
CPU の選択が入ると「発火したか」と「支払ったか」が分離できないため。付与ストア経由なので新経路はそのまま通る。
- `o181LrigAttackEndFiresWhenGuarded`＝ガード成立（hostLife 減少0）→ アタック終了時に発火（guestEnergy 0→1）
- `o181LrigAttackEndSkippedWhenDamaged`（🔴反転確認）＝ダメージが通ると `attackDealtNoDamage` で**発火しない**（0→0）
- `o181LegacyGuardShapeAlsoFires`＝旧形（`ON_GUARD`+`lrigAttackNoDamage`）も**engine の別分岐**を通って同じ地点で発火する

**検証**＝`npm run gates` 全緑（golden 3229/3229・smoke 10721 全0・fuzz 全0・census 高シグナル11・
STUB A群0・enginetext 130行/127ハンドラ・manual-fields 0/0・lint 0 errors/250 warnings）。

**残（軸(b)＝watcher≠アタッカー）**＝`WXK11-006-E4`／`WX24-P3-055-E2`（「ルリグ１体が」を場の別カードが監視）と
`WX14-018-E4`（次ターンの遅延設置）／`WX25-CP1-012-E1`（ライフクラッシュ連動）の**4効果**。
**engine 側の受け口は入った**（opt-in scope）が、**parser がその scope/triggerCondition を出していない**。
⚠4件とも MANUAL/PARTIAL なので、parser を直しても `syncManualLive.ts` を回すまで live へ届かない。

**別途見つけた系統バグ（未修正・O-181 とは別軸）**＝「〜してもよい。**そうした場合**、〜」が
`CONDITIONAL{IS_MY_TURN}`（＝自分のターンなら）に化ける。`SPDi43-03-sub-E1` と `WXDi-D04-004-sub-E1` の両方、
および `WXDi-CP02-002/003/004`（`O-97` の道中で観測）に出ている＝**任意コストを払わなくても後段が走る**過剰実行。
did-it ゲート（`LAST_PROCESSED_*` 系）が正。**母集団の実測から始めること。**

## 2026-09-02：§5.3 `O-58` 段1 — 攻撃側にも必須バニッシュ置換4効果をミラー

**ベースライン**＝`f148aa317`。防御側の約370行ある既存 ladder は変更せず、アタッカー自身が
バトルでバニッシュされる直前に、必須置換だけを選ぶ `selectMandatoryAttackerBanishSubstitute` を
`src/screens/battle/` へ追加した。

**対象**＝`WX22-034-E2`（下から1枚をトラッシュ）、`WXK04-031-E2`（アクセ自身をトラッシュ）、
`WX13-031-E1` / `WX15-010-E1`（バニッシュされず能力喪失）の4効果。
`activeCondition` はアタッカー＝オーナーターンとして評価し、`WX16-001` / `WX16-002` /
`WXK04-068` など「対戦相手のターンの間」限定の能力を自ターンへ広げない。
能力喪失は防御側と同じ `abilities_removed` を使い、同ターン2回目を不成立にした。

**トリガー境界**＝置換成立時は `banishedMyCardNum` / `banishedMyUnderCards` を立てず、victim を
`ON_BANISH` / `ON_LEAVE_FIELD` / `ON_TRASH` funnel へ流さない。代わりにトラッシュへ移ったアクセは
通常の trash trigger と ACCE_TO_TRASH、下のカードは `origin:'under_signi'` の trash trigger だけを収集する。

**golden（+1本）**＝4効果の正方向、`abilities_removed` 後の2回目、`WX16-001` / `WX16-002` /
`WXK04-068` の負方向を固定した。

**実機（🔴必須＝`src/screens/` を触ったので CLAUDE.md ⑤ の判定規則どおり）**＝
`scripts/verifyBattleDrive.mjs` へ3本追加し、**Claude 側で実行して 3/3 PASS**。
- `o58ArtemisAttackerBanish`＝アルテミス残存=true／下1枚→トラッシュ=true／victim は移動しない=true
- `o58GustavAttackerBanishOnce`＝1回目は場に残存=true／`abilities_removed` へ記録=true／**2回目は回避せず離場**=true
- `o58OpponentTurnOnlyDoesNotProtectAttacker`（🔴反転確認）＝バゲット（対戦相手ターン限定）は
  **自分から攻撃して負けたときは守られない**=true／エナへ=true／付属アクセは通常処理でトラッシュ=true

**Claude 側の独立検証**＝`npm run gates` 全緑（golden 3227/3227・smoke 10721 全0・fuzz 全0・
census 高シグナル11・STUB A群0・enginetext 130行/127ハンドラ・manual-fields 0/0・lint 0 errors）。

**段2据置**＝任意置換の `WX04-052-E1` / `WXDi-P09-TK03A-E1` は未実装。既存永続型とモーダルが
`sacrifice` / `pay_cost` の2種専用で、チャーム／アクセ除外の選択肢、CPU判断、pause/resume 後の
代替カード trigger を同時に拡張する必要がある。また既存防御側 `ACCE_BANISH_SUBSTITUTE` はログ上は
「ゲームから除外」だが実装は `trash` へ置いており、既存 ladder を変更しない制約下では安全に共通化できない。

**検証**＝`npm run gates` 全緑（golden **3227/3227**、smoke 10721/10721・全0、fuzz 全0、
census 高シグナル11、STUB A群0、enginetext 130行/127ハンドラ、manual-fields 0/0、
lint 0 errors/250 warnings）。ベースラインからの差分は golden +1のみ。

## 2026-09-02：§5.3 `O-97` — 複数の印刷済み【使用条件】を4ピースへ復元

**真因（1行）**＝`parseArtsEffect` が先頭の印刷済み【使用条件】を `.find()` で1本だけ消費していたため、
2本目が本文 parser へ残り、AUTO 4効果では `condition` が丸ごと消えて無条件使用できた。

**既存受け皿を再利用**＝新しい Condition 型は足さず、既存 `LRIG_TRASH_COUNT.filter` を使用歴の近似へ流用した。
`TargetFilter.cardNames` で《連邦生徒会》《クロノス報道部》を完全一致OR、`cardType:'リレーピース'` で種別を厳密一致する。
実データには在るのに `CardTypeFilter` union から漏れていた `リレーピース` だけを型語彙へ追加した。
⚠使用済みピースは通常 `lrig_trash` に入る近似であり、ゲームから除外された場合は偽陰性になりうる。

**parser**＝先頭から【使用条件】が続く限りループして全条件を `AND` 化。未対応の【使用条件】が1本でも先頭に
残れば、採った条件と剥離をすべて捨てる（部分採用禁止）。単色ドリームチーム、カード名2択、リレーピース使用歴を追加した。
対象＝`WXDi-CP01-004-E1` / `WXDi-CP02-002-E1` / `WXDi-CP02-003-E1` / `WXDi-CP02-004-E1`。
`WXDi-CP01-002` / `WXDi-CP02-001` は PARTIAL のため live 不変。前者の fresh は2条件を剥がした後、
本文先頭の `LRIG_LEVEL{gte:3}` まで正しくホイストする。

**live 配送**＝`build:effects` は `001-004` / `002-002` を純改善として自動採用。`002-003/004` は action 側の
別差分も held に含むため、fresh 全採用を避けて effectId 指定で `condition` だけ外科反映した。4件とも action は HEAD と同一。

**golden（+3本）**＝①4効果の live/fresh が2条件AND ②指定使用歴あり=true／履歴なし・別種別/別名=falseを
live/fresh 双方 ③未対応2本目があれば1本目も不採用。`WXDi-CP01-002` fresh の本文ゲート到達も①で固定。

**検証**＝`npm run build:effects`、逆翻訳4枚目視、`npm run census:goldentypes`（未カバー0）、
`npm run gates`（全緑・golden 3226/3226・smoke/fuzz 全0・census 11・STUB A群0・
enginetext 130行/127ハンドラ・manual-fields 0/0・lint 0 errors/250 warnings）。
**実機不要**＝`src/screens/` は未変更。二次項目の `IS_MY_TURN` 誤ゲートは別機構なので据置。

## 2026-09-02（続き778）：§5.3 索引 C を 30→27件＝`O-211` / `O-148` を実装、`O-179` は stale でクローズ

### ① `O-211`＝遅延トリガーの発火源を「カード個体」で縛れなかった（過剰実行）

**真因（1行）**＝`WX25-CP1-008-E1`③「対戦相手のシグニ1体を対象とし、このターン、**次にそれが**アタックしたとき」が
`attackerOwner:'opponent'` だけで設置されており、**対象に取っていない相手シグニのアタックでも発火**していた。
`once:true` があるため、狙ったシグニより先に別のシグニがアタックすると**そちらで消費されて**しまう。

**新設**＝`trigger.attackerFixedFromStored`（設置指示）→ `execInstallDelayedTrigger` が `storedTargetCards` を
`trigger.attackerFixedCardNums` へ**焼き込む**（設置と発火で ExecCtx が別物なので `targetsStored` では届かない
＝既存 `freezeStoredTargets` と同じ理由）。収集側は `collectSigniAttackDelayedTriggers` /
`collectAttackerSelfDelayedTriggers` の**2箇所**でゲートする。⚠**空配列は「誰でも発火しない」**（fail-closed）。

### ② `O-148`＝【みこみこ親衛隊】が【ウィルス】の受け皿を誤流用していた（3枚4効果）

**真因（1行）**＝**登録票の「1効果」は過小**で、実測は**3枚4効果**。旧 live は2方向に壊れていた。

| 向き | 旧 | 問題 |
|---|---|---|
| 得る | `GRANT_KEYWORD{keyword:"みこみこ親衛隊"}` | **engine のどこにも消費が無い真 no-op** |
| 取り除く | `STUB{REMOVE_VIRUS}` | 🔴**誤流用**＝【ウィルス】は `field.signi_virus`（シグニゾーン単位）なので**相手のウィルス state を壊す** |

**新設**＝`PlayerState.mikomiko_guards`（**プレイヤー単位**のカウンタ）＋ STUB 3本
（`GAIN_MIKOMIKO_GUARD` / `REMOVE_MIKOMIKO_GUARD` / `INTERNAL_REMOVE_MIKOMIKO_GUARD_N`）。
⚠取り除いた**個数**は `lastProcessedCount` へ載せる（カードではないので `lastProcessedCards` ではない）。
⚠**0個のときは対話を出さず 0 を明示**する＝前段の値を引き継ぐと「1つにつき－8000」が過剰に効く。
対象カード＝`WXDi-P12-050-E1` / `WX25-P3-023-E1`② / `WX25-P3-058-E1` / `WX25-P3-058-E2`。

🔽**golden のラチェットを 9→8 へ下げた**（`live の REMOVE_VIRUS ノード数`）＝**退化ではなく誤流用の解消**。

### ③ `O-179` は stale でクローズ

`SELF_CRASH_TO_TRASH_AND_REFILL`（回数制の予約）が `execStubPart3.ts:989` に実装済みで、
`BattleScreen.tsx:12644` が1クラッシュにつき1消費している。任意性も live に `optional:true` で入っていた。
登録票が挙げた2つの欠陥（①任意性が強制 ②置換が無い）は**両方とも解消済み**だった。

### 着手前実測が3件とも登録票を訂正した

`O-148` 1効果→**3枚4効果**／`O-186` 未計測→**2枚**（`WXK10-022`・`WXDi-P13-043`）／`O-179` 真→**stale**。

### 🔴 この巡で出した自分の編集ミス（記録として残す）

重複キーを解消するスクリプトの削除範囲が広すぎ、**無関係の `WXDi-P16-069` の manual 定義を巻き込んで削除**していた
（`endMark` の探索が自分のブロックを越えて次のエントリの終端に当たった）。HEAD から復元済み。
⇒ **`manualEffects.ts` を機械編集したら「HEAD とのキー集合差分」を必ず両方向で取る**（失われたキー／追加したキー）。
この巡はそれで気づけた。**typecheck だけでは検出できない**（キーが消えても構文は通る）。

### 見送った項目

**`O-74`**＝`canSelfPlay` の呼び出しは `BattleScreen` の通常召喚1箇所だけで、効果配置経路にゲートが無い。
`ctx.effectsMap` は一部経路でしか代入されず、型のコメントが「**dead flag になる**」と明記している。⇒ **実機必須の側へ回した。**
**`O-186`**＝解除地点が `src/screens/battle/untilOppTurn.ts` にあるので engine だけでは閉じられない（母集団2枚だけ記録）。

**検証コマンド**＝`npm run gates`（全緑・**golden 3223/3223 PASS**）。
**反転確認**＝あり（`O-211` は「対象のシグニで発火／対象でないシグニでは発火しない」を collector 実走で。
`O-148` は「相手だけ増える／自分は増えない」「ウィルス state が無傷」「所持数でクランプ」「0個なら0を明示」の4方向）。
**⑤実機＝不要と判定**（§2.2）＝変更は `src/types/` `src/engine/` `src/data/` `public/data/` のみ。**`src/screens/` は未変更**。


## 2026-09-02（続き777）：§5.3 索引 C を 31→30件＝`O-105` を実装（`FIELD_ATTACHED_COUNT.filter` を新設し2効果を実働化）

**真因（1行）**＝場全体の「シグニの下にあるカードの合計枚数」条件の受け皿 `FIELD_ATTACHED_COUNT` は在ったが、
**どのシグニの分を数えるかの `filter`（ホスト側の絞り）が無かった**ため、
「あなたの場にある**＜解放派＞の**シグニの下にカードが合計4枚以上ある場合」を表せなかった。

**影響枚数**＝**2効果／2カード**。索引 C は **31 → 30項目**。

### 直したもの

| 対象 | 旧 | 新 |
|---|---|---|
| `src/types/effects.ts` | `FIELD_ATTACHED_COUNT` に絞りが無い | `filter?: TargetFilter` を追加（**親シグニ**にかかる） |
| `src/engine/execUtils.ts` | 場の全ゾーンを無条件で数える | `filter` があるゾーンだけ数える（スタック最上段で判定） |
| `WXDi-P16-056-E1` | 3つ同時に破損（下記） | 対象・置換・条件を同時に修正 |
| `WXDi-P15-007-E2` | `COND_STUB`＝**無条件成立** | `FIELD_ATTACHED_COUNT{under, gte 2}` |

🔴**`WXDi-P16-056-E1` は登録票が「部分採用は禁止」と書いていたとおり3つ同時に壊れていた**＝
①対象が `owner:self`＋`targetsTriggerSource`（**アタックフェイズ開始時にトリガー元は無い**＝自分のシグニを下げていた）
②「代わりに」が畳めておらず **-5000 と -8000 が両方走る** ③＜解放派＞の条件が丸ごと無い。
**1つでも残すと過小から過剰へ裏返る**ので、3つ同時に直して初めて原文になる。

🔴**`COND_STUB` は「未実装」ではなく「無条件成立」**（`execUtils.ts` が `return true`）。
`WXDi-P15-007-E2` は印刷された【使用条件】が丸ごと消えて**いつでも撃てる**過剰実行だった。

⚠**`build:effects` では live に届かなかった**＝収穫マージが既存 id を温存するため、
`npx tsx scripts/syncManualLive.ts WXDi-P16-056 WXDi-P15-007` まで回して初めて1巡が閉じた（CLAUDE.md の既知の穴を実際に踏んだ）。

**golden**＝`(B7) 据置契約: …部分採用しない` を **`(B7) 解除: …3つが同時に直っている`** へ反転し、
2件目用に `(B7) 解除2: …COND_STUB から実条件になった` を新設。

**検証コマンド**＝`npm run gates`（全緑・**golden 3221/3221 PASS**）。
**反転確認**＝あり（`evalCondition` を実走させ「＜解放派＞の下に4枚→成立／3枚→不成立／**＜解放派＞以外の下は数えない**」の3方向。
`filter` を無視する実装だと3本目で落ちる。2件目も「下に2枚→使える／1枚→使えない」で両方向）。
**⑤実機＝不要と判定**（§2.2）＝変更は `src/types/` `src/engine/` `src/data/` `public/data/` のみ。
**`src/screens/` は未変更**。既存 Condition 型へのフィールド追加であって、新しい条件型は足していない。


## 2026-09-01（続き776）：§5.3 索引 C を 34→31件＝`O-183` を実装（**この巡で唯一の実装**）＋ `colorExclude` の実バグを1件発見・修正

### ① `O-183`＝「すべての色を得る」が共通色判定の**基準側**に効いていなかった（過小実行）

**真因（1行）**＝`allColorSigniNums` は `fieldCandidates`（＝**候補側**）には以前から渡っていたが、
`resolveDynamicFilter` の**基準側（効果元）**は `cardMap.get(source).Color`＝**印字色しか読んでいなかった**。

**症状**＝`WXK05-029`（サーバント G）は E1 の `STUB{ALL_COLOR}` で全色を得ても、
E2「このシグニと**共通する色を持つ**対戦相手のシグニ1体をトラッシュ」の対象が広がらない。

**直したもの**（`src/engine/` のみ）＝
- `resolveDynamicFilter` に `allColorSigniNums?: Set<string>` を足し、**全26呼び出し地点**へ `ctx`/`cur` から配線した。
- `colorMatchesSourceCard`＝効果元が全色なら**色による絞りを外す**（他の軸は残す）。
- `colorNotMatchesSource`＝効果元が全色なら**誰も満たさない**（全5色を `colorExclude` に入れる）。
  ⚠**この2つは必ず対で直す**＝片方だけだと同じ盤面で「共通色を持つ」と「持たない」が同時に成立する。
- 条件側 `execUtils.evalCondition` の `HAS_CARD_IN_FIELD` 分岐にも同じ判定を入れた（評価器が別なので executor だけでは届かない）。

### ② 🔴 作業中に見つけた実バグ＝`colorExclude` に文字列を渡していて **1色も除外されていなかった**

`matchesFilter` は `colorExclude` を配列化して `card.Color.includes(c)` で判定するので、
**文字列を渡すと `[「白赤青緑黒」]` の1要素配列**になり、`includes` が常に false ＝**除外が丸ごと無効**だった。
`execUtils.ts` と `effectExecutor.ts` の2箇所。**単色の効果元では偶然当たっていた**（1文字＝1要素なので一致した）が、
**複数色の効果元（`白/黒` など）では既に壊れていた**。両方とも「色1文字ずつの配列」へ直した。

### ③ stale クローズ2件（掃除はここで枯れた）

| ID | 実際の受け皿 | 既存 golden |
|---|---|---|
| `O-106` | `TargetFilter.hasOnPlayAbility` ＋ `triggerStateFilterOk`（`triggerCollect.ts:4306`） | ✅ `EMPTY_TIMING_ALLOWED` ratchet が0 |
| `O-109` | `collectAttackerSelfDelayedTriggers`（`triggerCollect.ts:197`・`BattleScreen.tsx:8934` から呼出） | ✅ `WX10-035` で両方向 assert 済み |

**`O-151` は母集団を訂正**＝`WX24-P2-009-E1` は消化済み（golden あり）で、**残るのは `PR-K026` だけ**。

### 4巡ぶんの総括

索引 C は **53 → 31項目**。**21件クローズのうち実装は `O-183` の1件だけ**で、残り20件は「実装済みなのに行が残っていた」。
🔑**見落としの主因は「受け皿の名前が登録票の提案と違う」**（`O-101`→`TRASH_HAS_CARD` ほか計4例）。
🔑**`O-183` は「向き」の取り違え**＝同じキー名が engine にあっても、**候補側か基準側か**で別物。

**検証コマンド**＝`npm run gates`（全緑・**golden 3220/3220 PASS**）。
**反転確認**＝あり（`O-183` は engine 実走で「全色でなければ対象外／全色なら対象」と、条件側の反転も同一盤面で assert。
`colorNotMatchesSource` 側を直さないと同じ盤面で両方成立するため、片側だけの実装では落ちる）。
**⑤実機＝不要と判定**（§2.2）＝変更は `src/engine/effectExecutor.ts` と `src/engine/execUtils.ts` のみ。
**`src/screens/` は触っておらず、新しいアクション型・条件型も足していない**（既存 `ExecCtx` フィールドを1つ多くの地点へ配線しただけ）。


## 2026-09-01（続き775）：§5.3 索引 C を 40→34件（6件クローズ）＝**3巡で計18件**が「実装済みなのに索引行が残っていた」

**真因（1行）**＝**受け皿の名前が登録票の提案キー名と違う**ため、着手前の grep が「無い」と誤答し、
**すでに実装され golden まで張られている項目が worklist に残り続けていた**。

**影響枚数**＝**6効果／7カード**（実装ゼロ）。索引 C は **40 → 34項目**（第2巡6件・第3巡6件と合わせて **53 → 34**）。

| ID | カード | 実際の受け皿（登録票の提案とは別名） | 既存 golden |
|---|---|---|---|
| `O-95` | `WX21-032-E1` | `HAS_CARD_IN_FIELD{filter.colorNotMatchesSource, excludeSelf}` | 🆕**今回追加**（`powerLteSelf` 側だけ固定されていた） |
| `O-102` | `SP27-012-E1` / `WX21-039-E1` | 同上（else 枝） | ✅ `天使の非共通色: else 枝にも条件が付いた` |
| `O-136` | `SP36-001` | `costScaling` ＋ `actions_done`／`turn_arts_used` | ✅ `task12(xc)`（3方向 assert 済み） |
| `O-139` | `WX21-044-E2/E3` | `THIS_CARD_PLACED_BY_CLASS`（`execUtils.ts:2722`） | ✅ |
| `O-159` | `WX13-029-E1`③ | `ability_gain_blocked_this_turn` ＋ `collectAbilityGainProtectedSigni` | ✅ **テスト名が `O-159: …` そのもの** |
| `O-178` | `WX18-056-E1` | `SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE` | ✅ |

🔑**提案キー名と実装名の食い違い一覧**（3巡ぶん）＝
`O-101`→`TRASH_HAS_CARD` ／ `O-139`→`THIS_CARD_PLACED_BY_CLASS` ／ `O-178`→`SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE` ／
`O-95`・`O-102`→`colorNotMatchesSource`（登録票は `NO_COMMON_COLOR_WITH_SELF_IN_FIELD` を提案していた）。
⇒ **§4.2 のとおり「提案キー名で grep して無いと言わない」。原文の言い回しと golden のテスト名でも引く。**

### 🔴 部分完了を「未着手」と書いていた1件＝`O-164`（行は残す・内容を訂正）

「次にバニッシュされる場合、バニッシュされない」の**1回消費の器は完成済み**
（`BATTLE_BANISH_PREVENT_LOSE_ABILITY`＝防いだら `abilities_removed` へ入るので二度は防げない。続き749 で
`collectBanishPreventLoseAbility` が `granted_effects` も見るよう配線され、golden `段2 第23バッチ』で両方向固定済み）。
**残るのは経路だけ**＝バトルバニッシュ限定で、**効果によるバニッシュは防げない**（過小側）。索引の記述をこれに合わせた。
⇒ **登録票の見出しが残作業を表していないことがある。着手前に golden のテスト名を grep する。**

**検証コマンド**＝`npm run gates`（全緑・**golden 3219/3219 PASS**）。
**反転確認**＝あり（`O-95` は `evalCondition` を実走させ「共通色を持たない他のシグニがいれば成立／同色しかいなければ不成立」の両方向。
`NO_COMMON_COLOR_AMONG_FIELD_SIGNI`（場のシグニ**同士**の相互比較）へ流用すると落ちる）。
**⑤実機＝不要と判定**（§2.2）＝触ったのは `docs/` と `scripts/goldenTest.ts` だけで、**`src/` は1バイトも変更していない**。


## 2026-09-01（続き774）：§5.3 索引 C を 47→40件（6件クローズ＋`O-152` を索引 A へ移設）＝「実装したのに索引の行を消し忘れる」運用穴

**真因（1行）**＝受け皿を実装した巡に **BUGFIXES だけ書いて §5.3 の索引行を消していなかった**ため、
**すでに動いている6件が「機構待ち」として worklist に残り続けていた**（前巡の6件と合わせて **2巡で12件**が同じ理由）。

**影響枚数**＝**6効果／6カード**（実装ゼロ）。索引 C は **47 → 40項目**。

| ID | カード | 受け皿 | 既存 golden |
|---|---|---|---|
| `O-101` | `WX05-023-E3` | `CONDITIONAL{TRASH_HAS_CARD{minCount:3}, else:TRASH}` | ✅ `B12 「そうしない場合」は else 側…` |
| `O-110` | `PR-205-E1` | `REFRESH_COUNT_THIS_TURN`（`execUtils.ts:2806`） | 🆕**今回追加**（唯一の未固定） |
| `O-158` | `WX20-002-E2` ほか | `ATTACH_ACCE.fromEnergy` の2段選択（`effectExecutor.ts:8557`） | ✅ `続き760 ATTACH_ACCE.repeatWhilePossible` |
| `O-165` | `WX16-Re09-E1` | `GRANT_PROTECTION.duringOppTurn`（`effectEngine.ts:6189`） | ✅ 続き759 |
| `O-173` | `WDA-F02-07-E1` | `selectionConstraint.levelMultisetFromLastProcessed`（`execUtils.ts:3320`） | ✅ |
| `O-182` | `WX24-P4-040-E2` | `PLAY_FREE{targetsLastProcessed}` ＋ `STUB{USE_SPELL_FROM_TRASH}` | ✅ |

🔑**`O-101` は受け皿の形が登録票の提案と違った**＝登録票は `LAST_PROCESSED_COUNT_GTE{negate}` を当てにしていたが、
実際は `TRASH_HAS_CARD{minCount:3}` の前提条件として実装されていた（`execPlaceUnderSigni` が候補0で
`lastProcessedCards` を触らずに返す罠を**構造的に回避**している）。⇒ **提案キー名で grep して「無い」と言わない**（§4.2）。

### 🔴 母集団が桁で増えた1件＝`O-152` を索引 C → 索引 A へ移した

`ON_HAND_DISCARDED` の watcher が効果による手札捨てで発火しない件。**登録票の「1カード」は分離のきっかけになった標本1枚**で、
live を全走査すると **34効果／33カード**。受け皿（`execTrash` の `hand_discarded_just`／`collectHandDiscardTriggers`）は在り、
**壊れているのは配送**。⚠**再現は実機のみ**（`verifyBattleDrive.mjs o143CheckPlace`）なのでこの巡では着手していない。
⇒ **索引 C の「1カード」表記は母集団ではないことがある。「1効果」と「1カード」を読み分ける。**

**検証コマンド**＝`npm run gates`（全緑・**golden 3218/3218 PASS**）。
**反転確認**＝あり（`O-110` は `evalCondition` を実走させて 1回目=成立 / 2回目=不成立 の両方向を assert。
境界を `lte 0` と書くと落ちる＝`refresh.ts` が収集前に加算する規約を固定した）。
**⑤実機＝不要と判定**（§2.2）＝触ったのは `docs/` と `scripts/goldenTest.ts` だけで、**`src/` は1バイトも変更していない**。


## 2026-09-01（続き773）：§5.3 索引 C を 53→47件（6件クローズ）＋ golden の「見送り契約」が項目を眠らせていた穴を塞いだ

**真因（1行）**＝`O-168` / `O-169` の据置契約 golden が **`sheet3b1Fresh`（＝parser 出力）だけ**を assert していたため、
**`manualEffects.ts` 経由で live には既に実装が届いていたのに、契約が緑のまま索引 C に「機構待ち」として残り続けていた**
（続き768 の `WXDi-P09-043-E2`＝「live だけの負方向 assert」の**鏡像**）。

**影響枚数**＝**6効果／6カード**（実装ゼロ・全件が既に動いていた）。索引 C は **53 → 47項目**。

| ID | カード | 受け皿（全部すでに在った） | 消費地点 |
|---|---|---|---|
| `O-168` | `WXEX2-03-E1` | `RemoveAbilitiesAction.target.extraZones` | `effectExecutor.ts:8011`（`allZones` と違い手札・エナを巻き込まない） |
| `O-169` | `WXK07-048-E1` | `triggerCondition.banishedHadCharm` | `triggerCollect.ts:1503/1534/1592`（除去直前の `signi_charms` で判定） |
| `O-172` | `WD15-007-E1` | `GRANT_KEYWORD.fieldCondition{FRONT_SIGNI_POWER_GTE}` | `effectEngine.ts:1181`（**既存 golden が per-signi 挙動まで固定済み**） |
| `O-174` | `WD19-007-E1` | `STUB{REMOVE_VIRUS_TARGET_ZONE}` | `execStubPart1.ts:2232`（`lastProcessedCards[0]` のゾーンを引く） |
| `O-176` | `WD15-023-E1` | `trigger.banisherFilter` ＋ `levelLtTriggerSource` | `triggerCollect.ts:138` / `effectExecutor.ts:2957` |
| `O-204` | `WX15-006-E1` | `trigger.notByOwnEffect` ＋ `IS_BETTING` | `triggerCollect.ts:1433`（自分で落として得をする抜け道を塞ぐ） |

**やったこと**＝実装は1バイトも足していない。**退化検出のトリップワイヤとして golden を3本に整理した**：
- `段2 Sheet3① 契約: A5/C2/C3 は実装済み（据置解除・過剰側へ倒さない）`＝据置契約を反転。
  A5 は **engine を実走**させて「場とトラッシュは能力を失う／手札は巻き込まない」を両方向で固定（`extraZones` が `allZones` に化けたら落ちる）。
- `索引C 2026-09-01: O-174 …` / `索引C 2026-09-01: O-176/O-204 …`＝ゾーン連動・発生源の絞りが消えたら落ちる。

🔴**逆向きに外しかけた1件＝`O-183`。** `allColorSigniNums` が engine に3箇所あるので「受け皿あり」と読みかけたが、
繋がっているのは **`fieldCandidates` の候補側**で、落ちているのは**参照の基準側**＝`colorMatchesSourceCard`
（`effectExecutor.ts:3041`）が **`cardMap.get(source).Color`＝印字色しか読まない**。
⇒ `WXK05-029` は E1 で自分が全色を得ても E2 の対象が広がらない（過小）。**索引 C に残し、登録票の向きを訂正した。**
⚠**教訓＝「同じキーが engine にある」は受け皿の証明にならない。「どちら側に効くキーか」まで読む。**

**検証コマンド**＝`npm run gates`（全緑・**golden 3217/3217 PASS**）。
**反転確認**＝あり（A5 は手札を巻き込まないことを engine 実走で negative assert。`O-174` は汎用 `STUB{REMOVE_VIRUS}` へ戻したら落ちる assert）。
**⑤実機＝不要と判定**（§2.2）＝触ったのは `docs/` と `scripts/goldenTest.ts` だけで、**`src/` は1バイトも変更していない**。


## 2026-09-01（続き772）：§5.3 索引 B を再計測し、9効果を実働化（stale 6件／据置3件／G・Hは設計調査のみ）

**真因（総論）**＝登録票どおりの「残16効果」ではなかった。`O-155`／`O-196`／`O-216` は既に完了、
`O-184` の【シュート】2件も `hasKeyword` → `getSigniAttackKeywordState` → `BattleScreen` のバニッシュ行き先変更で実働済み、
`O-161` の先行3件も既存 `TargetFilter.colorNotMatchesSource` で条件・対象・置換まで実装済みだった。
さらに登録票の `WXDi-P16-058-E1` は採番違いで、対象効果は **E3**。`WX25-P3-058-E1` は【ウィルス】ではなく
**【みこみこ親衛隊】という別の player counter** だった。⇒ **新型を足す前に live・collector・実行 choke point を再探索する。**

### 実装した9効果

| ID | 効果 | 修正 |
|---|---|---|
| `O-156` | `WX20-040-E1` | 「場に【トラップ】があるかぎり」を既存 `HAS_TRAP_IN_FIELD` の `activeCondition` へ配線 |
| `O-184` | `WX25-CP1-079-E1` | 条件つき引用【常】を `GRANT_EFFECT` 内の `SELF_POWER_THRESHOLD{lte:1000}`＋`GRANT_PROTECTION{BANISH}` として付与先へ載せた |
| `O-191` | `WXDi-P13-008-E3` | 付与 `ON_SPELL_USE` に `triggerFilter{cardType:'スペル',isDisona:true}` を刻み、使用スペルを collector へ渡した |
| `O-180` | `WX14-003-E1`／`WXK09-001-E1`／`WX25-P3-037-E1` | 候補自身の `IGNORE_LRIG_TYPE` 宣言を `listGrowCandidates` が読むようにした。逆翻訳の誤文も訂正 |
| `O-148` | `WD19-001-E2`／`WX15-028-E1` | `virusCount:'any'` を0〜N個の対話ループにし、カードでない処理数を `lastProcessedCount` で直後の倍率／枚数へ運搬 |
| `O-161` | `WXDi-P16-058-E3` | 任意コストの候補判定と支払い後対象の両方へ既存 `colorNotMatchesSource` を刻み、場で得たルリグ色も動的解決へ渡した |

### 触らなかった／据え置いたもの

- `O-155`／`O-196`／`O-216` は live・型・両評価器を再確認して消化済み。1バイトも変更していない。
- 【シュート】2件と `O-161` の `SP27-012-E1`／`WX21-032-E1`／`WX21-039-E1` は既存実装が正しく、
  `_idset_fresh` にも対象カードは無かったため変更ゼロ。
- `WX24-P2-043` は「次に1回」＋アシストグロウ専用経路 `getAssistGrowCandidates` が必要なので据置。
- `WX25-P3-058-E1` は【みこみこ親衛隊】の任意数除去＋除去数倍率という別機構。ウィルス state を壊すため据置。
- `O-163`／`O-181` は依頼どおりコード変更ゼロ。前者はアイコン判定の小ヘルパだけ抽出可能、後者は
  `collectAttackEndTriggers` の watcher 全場走査化と `performGuardResponse` からのルリグ終了時収集が必要。

### 検証

- fresh parser 規則5本を一時無効化すると狙った5本が **0 PASS / 1 FAIL**、復元後は各 **1 PASS / 0 FAIL**。
- BOM除去込み全 **6,712カード / 10,679 fresh効果**を HEAD と比較し、変化は
  `WX15-028-E1`／`WX20-040-E1`／`WX25-CP1-079-E1`／`WXDi-P13-008-E3`／`WXDi-P16-058-E3` の5件、outlier 0。
- `npm run gates` 全緑（golden **3215 / 3215**、smoke **10,721** 全異常0、fuzz 全0、census **11 / BASELINE 12**、
  STUB A群0/C群0、engine-text **130行/127ハンドラ**、manual field loss 0、lint **0 errors / 250 warnings**）。
  `npm run regen` 済み、同型★0。ブラウザ実機は依頼どおり未実施。
- bucket は held **76→75**、partial **10→10**、idset **7→7**。held の−1は直前巡で完了した
  `WXDi-P12-034` の stale 項目が再生成で消えたもの（同カードの live は不変）。

### 🔎Claude 側の検証（CODEX_GUIDE §7・ベースライン `0d277d22c`）

⚠**Codex は実装とゲートまで完走してから利用上限に当たり、最終レポートファイルだけ書けずに exit 1**した
（`ERROR: You've hit your usage limit ... try again at Sep 2nd 00:48`／`tokens used 787,881`）。
[[codex-fallback-order]] の落ち方②＝**破棄せず作業ツリーの成果を引き取った。**

- **独立ゲート＝全緑**（golden **3215 / 3215**・smoke 10,721 全異常0・fuzz 全0・census 11 / 12・
  census-stubs A🔴0/C0・manual-fields 0・census-enginetext A🔴130行 据置・lint 0 errors / 250 warnings・**同型★ 0**）。
- **per-effect JSON diff（ベースライン比）＝ちょうど5効果**＝`WX15-028-E1` / `WX20-040-E1` / `WX25-CP1-079-E1` /
  `WXDi-P13-008-E3` / `WXDi-P16-058-E3`。**Codex の申告と完全一致・outlier 0。**
- **held の集合 diff**＝76 → 75 で、消えたのは `WXDi-P12-034`（続き771 で完了済みの stale 項目）**のみ・新規増0**。
  ⚠`_held_fresh.json` は報告時点で stale だったので `build:effects` → `heldReview` を回し直してから測った。
- **エンコーディング検査**（§5-19）＝変更ファイル全件で BOM / `U+FFFD` / 3連 `?` の新規増**0**。
- **原文照合**＝5効果とも原文と一致することを1件ずつ確認した。⚠`WX25-CP1-079-E1` は
  ランサー付与にも `thisCardOnly` が入った（原文「**このシグニは**」＝旧 live は自分のどのシグニでも対象にできた）＝**改善**。
- 🔴**`src/screens/` の変更2件は「新規追加行だけか」を目で見た**（§5-22）＝
  `BattleScreen.tsx` は**インラインの色フィルタ2箇所を `spellUseTriggerMatches` へ抜き出し、`triggeringCardNum` を積むだけ**
  （使用者側／相手 watcher 側の**両方**を対称に変更）。`matchesFilter` の色判定は `card.Color?.includes(c)` で
  **旧インライン実装と同一セマンティクス**、かつ**多色スペルは live に0枚**なので既存8効果に影響なし（実測）。
  `growLogic.ts` は `ignoresLrigTypeForGrow` の追加と1行の OR だけ。
- 🔑**`BattleScreen.tsx:6490` にもう1つ `lrigClassesCompatible` がある**（アシストルリグ候補）が、
  そこは Codex が据置と宣言した `WX24-P2-043` の担当なので**穴ではない**（§5-20 の確認）。

### 🖥実機（Claude が実行・新規3本＋既存回帰1本／単体でも4本一括でも全 PASS）

| シナリオ | 見たもの |
|---|---|
| `v12GrantedSpellUseMinus4000`（既存・**正方向**） | ディソナのスペル（`WXDi-P12-089`）を使うと付与【自】が発火して −4000 |
| `o191SpellUseNonDisona`（新規・**負方向**） | 🔴**同じ黒・《黒》×0 の非ディソナスペル**（`WX02-075`）では**発火しない**（`powerMods` が空のまま） |
| `o180GrowIgnoreLrigType`（新規） | クラス不一致（ピルルク Lv3 → `?` Lv4）でも**宣言があれば候補に出て実際にグロウできる**／**宣言の無い同レベル**（`WD01-001` タマ・コストは払える状態）**は候補に出ない** |
| `o148VirusAnyCount`（新規） | 【ウィルス】3つのうち**2つだけ選んで取り除き**、パワー修整が **－20000**（＝2×10000）。**－30000 なら最大数除去＝旧挙動** |

🔑**共通化リファクタは「正方向の既存シナリオ」＋「負方向の新規シナリオ」の2本で挟む**＝
片方だけでは「全部発火」も「全部不発」も緑に見える（§5-3′ の実機版）。
🔑**ルリグ【起】も手札スペルも UI は2段**（「【起】…」→「発動」／「発動」→「発動する」）＝
1段目で止まると**前提崩れの FAIL** になる。押せなかったら開き直して自己回復するループにする。

### 索引の更新

- **クローズ8件**＝`O-155` / `O-156` / `O-161` / `O-180` / `O-184` / `O-191` / `O-196` / `O-216`。
- **`O-180`（残1＝`WX24-P2-043`）と `O-148`（残1＝`WX25-P3-058-E1`）は索引 C（母集団1効果）へ移した。**
- **`O-163` / `O-181` は索引 B に残す**（設計調査の結果を登録票へ追記済み＝入口の関数名まで特定）。
- ⇒ **索引 B は 11件 → 2件。機構 worklist 全体は 97 → 90項目。**

## 2026-09-01（続き771）：§5.3 索引 C（母集団1〜2効果）を 45件 → 33件（12件クローズ＝実装9件＋登録票 stale 3件）

**真因（総論）**＝索引 C の登録票は「受け皿が無い」と書いているものが多いが、**実際には受け皿が既にあり、
落ちていたのは配線か、そもそも既に消化済みという事実**だった（12件中7件）。⇒ **索引 C は「型を足す作業」ではなく
「配線を探す作業」**として取る。⚠**「規模＝1効果」の登録は母集団ではない**（`O-170` は原文12カード、`O-153` は
多段 `LOOK_PICK_CHAIN` 16効果が母数）＝**索引 C でも②「数える」を飛ばさない。**

### 実装した9件

| ID | 真因（1行） | 影響 | 直した層 |
|---|---|---|---|
| `O-153` | `LOOK_PICK_CHAIN` が全ステージのピックを合算して後続へ渡す＝原文が「この方法／効果で**場に出た**シグニ」と行き先を名指ししても**手札行きの札のレベルまで数える** | **3効果**（`WX24-P3-039-E1` 過剰ミル／`WX25-P1-039-E1` 過剰バニッシュ／`WX24-P2-035-E1` は STUB 据置だった） | 型＋engine＋parser 後段パス＋golden |
| `O-170` | 「表記されているパワーと異なる／より高い（低い）」が `parseSigniTarget` を通らない builder（`SELECT_TARGET_ONLY.selectTarget`・任意コスト前置きの `CONDITIONAL.then`）で丸ごと落ちる | **3効果**（相手のどのシグニでも選べた） | parser 後段パス＋golden（**受け皿は既存**） |
| `O-212` | `EffectTarget.totalPowerMax` は**場のシグニ経路だけ**が読み、`execAddToField` の trash/energy 経路は `selectOrInteract` へ渡していない＝**誰も見ない死にキー** | **2効果**（`WXK09-023-E1` はエナから＜電機＞3体を無制限に／`WXEX2-52-E3` は制約ごと欠落） | 型3キー＋`$ref`1本＋両評価器＋UI 文言＋golden＋実機 |
| `O-145` | `execTransferToDeck` の `LIFE_CLOTH_CARD` 経路が `optional` を見ない＝「してもよい」が**強制**（受け皿が無いと判断して `DEFERRED_*` にしてあった） | **1効果** | engine＋parser＋golden＋実機 |
| `O-146` | `underCardOp{energy_signi_to_deck_top}` が「置いて**もよい**」を強制で実行し、候補が複数でも `candUC[0]` を自動で選ぶ | **1効果** | parser（typed 化・engine 新規実装ゼロ）＋golden＋実機 |
| `O-154` | 「その中に〈クラス〉が N枚以上ある場合」の閾値と、冒頭で対象化したカードへの照応が両方落ちる | **1効果**（自分の＜龍獣＞を条件なしで割り、【ダブルクラッシュ】が無条件で乗る） | `manualEffects.ts` 手書き（**engine 0行**）＋golden |
| `O-189` | `convertSelfHandDiscardStep` が素の `TRASH{HAND_CARD}` の filter を流用し、名詞句の**色が脱落** | **2効果**（任意コストが原文より緩い） | parser＋golden |
| `O-208` | `STUB{LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS}` がアーツを**全部**ルリグデッキへ戻す（原文は「対象のアーツを2枚まで」） | **1効果** | 型1キー＋engine＋`manualEffects.ts`＋golden |
| `O-214` | `ZONE_SUM_COUNT` がゾーンごとに distinct して足す＝**同名が場とエナに1枚ずつあると2種類**と数える | **1効果**（基本パワー35000が早く乗る） | 型1キー＋両評価器＋`manualEffects.ts`＋golden |

### 「登録票が stale」だった3件（**コード変更ゼロ**）

- **`O-171`**＝`ZONE_SUM_COUNT`（両評価器＋golden）は 2026-08-31 続き747 で実装済み・`WDA-F03-13-E3` も是正済み。
- **`O-207`**＝`LookPickChainStage.gateZoneOnly` → `AddToFieldAction.gateZoneOnly` は実装済み・`WXDi-P15-079-E1` に刻み済み。
- **`O-215`**＝`TargetFilter.hasSoul` と `frontOfAllyWithSoul` は 2026-08-31 続き749 で実装済み（2効果とも）。

⇒ 🔑**索引の項目に着手したら、最初にやるのは実装ではなく「その受け皿を grep する」こと。**

### 検証

- `npm run gates` **全緑**（golden **3209 / 3209**＝3199 → +10本・0 FAIL／smoke 10,721効果 全異常0／fuzz 全0／
  census **11 / BASELINE 12**／`census:stubs` A群🔴0・C群0／manual-fields 0／`census:enginetext` A🔴130行 据置／
  lint 0 errors・250 warnings）。`npm run regen` 済み。
- **live の A/B 差分は毎回「意図した件数だけ」を機械確認**した（`O-153`＝6枚／`O-170`＝3枚／`O-189`＝2枚／
  `O-146`＝1枚／`O-145`＝1枚）。⚠**AUTO でも `_held_fresh` に落ちるので `heldReview --adopt` まで回さないと live に届かない**
  （この巡で4回踏んだ）。MANUAL/PARTIAL は `syncManualLive.ts`。
- **実機（`verifyBattleDrive.mjs`）＝新規5本すべて PASS**（単体でも5本一括でも）
  ＝`o146EnergyTopTake`／`o146EnergyTopSkip`／`o145LifeTopTake`／`o145LifeTopSkip`／`o212PowerSumExact`。
  **反転確認あり**＝(a)`O-146` は「置く／置かない」で【ルリグバリア】の有無が1ビット反転
  (b)`O-145` は「加える／加えない」でライフの一番上が入れ替わるか否かが反転
  (c)`O-212` は 10000 / 11000 / 13000（超過＝選択自体を拒否）では**決定が押せず**、ちょうど12000でだけ押せる。
- **実機は必須と判定**（§2.2）＝新しい機構を4本足した（`lastProcessedFrom` ／ パワー合計制約3キー ／
  `$ref:'source_effective_power'` ／ `distinctAcrossZones`）ことと、`src/screens/battle/modals/EffectInteractionModal.tsx`
  の見出し文言に2行足したこと。

### 同時に直した計器の較正（1件）

**`census:cards` の `mech` フラグが PLAN_DETAIL の登録票を「クローズ済みも含めて」読んでいた。**
PLAN の運用は「クローズした項目は §5.3 の索引から消すが、登録票の全文は PLAN_DETAIL に残す」なので、
**消化しても `mech` は永久に減らない**＝この計器の目的（1シートを分母にした**単調減少するカウンタ**）が
成り立っていなかった。⇒ **見出しの直後が 🏁 の登録票は数えない**（本文中の部分消化 🏁 は数え続ける＝fail-open）。
⚠**今回の12件クローズで Sheet1 の 20 は動かなかった**＝残 20 枚は**別の（まだ開いている）登録票**から立っている。
**これは前進ではなく較正。**

### この巡で踏んだ罠（次の人向け）

1. 🔴**`applyPrintedPowerScope` の「既に刻まれている」判定は対象フィルタ以外も見る**＝`SIGNI_ATTACK_BAN.powerDiffersFromPrinted`
   のように**アクション直下**に持つ型があり、見落とすと**同じ文の別の対象へ二重に刻む**（`WX25-P2-010-E1` で実測）。
2. 🔴**golden の新規テストで `mkCtx`/`fresh` を使うなら `withSavedCursor` で包む**＝POOL カーソルがずれて
   **無関係な2本が FAIL する**（この巡で `task12(cx)` と `Stage2 power B44` が巻き添えになった）。
3. 🔴**実機ドライバ：注入したスタックは最初のクエリ時点で既に `pending_effect` へ移っている**＝
   `stackLen > 0` を前提条件にすると即 FAIL する。**基準値は最初のクエリではなくスペックの固定値**にする
   （`LOOK_AND_REORDER` が1枚抱えている間は **life が2枚に見える**のも同根）。
4. 🔴**実機ドライバ：確定直後の1回読みはコミット前の盤面を掴む**＝**単体では PASS するのに一括実行だけ FAIL** する。
   ⇒ `settled` ストリーク（3ティック連続で pending も stack も無い）を進行条件にする。
5. 🔑**候補モーダルの札は1度だけ押す**（毎ティック押すとトグルして「決定」に永久に進まない）。
6. 🔑**`deck_shuffled_count` は判定に使えない**＝明示的なシャッフルアクションが積むカウンタで、
   `insertToDeck` の `shuffle:true` では増えない（実機で実測）。**カード番号で見る。**


## 2026-09-01（続き770）：旧「未採番の機構在庫」30件を採番（`O-191`〜`O-217`）／`census:cards` の `mech` が PLAN 再編で嘘をつく穴を1件修正

**真因（採番側）**＝旧 §5.4 (ii) は「機構ギャップは §5.3 へ送る」と書きながら送らずに溜め続けており、**機構の置き場が2つ**あった。
2026-09-01 の PLAN 再編（第2回）で §5.3 へ移設したが **`O-nn` が無く母集団順にも並べられない**ので、索引 A〜F の「取る順」に入れられなかった。

**やったこと**＝30件を全数 triage して行き先を確定した。
- **新規採番 27件（`O-191`〜`O-217`）**＝索引 A 6／B 3／C 17／D 1。**索引に1行＋ PLAN_DETAIL に登録票1項目**（PLAN の登録ルールどおり。本文は無改変）。
- **既出 `O-nn` へ統合 5件**（採番せず吸収）＝`O-104`（N体・N枚の強制中間動作の UI ソフトロック）／`O-137`（デッキの一番上とライフクロスの入れ替え）／
  `O-158`（`ATTACH_ACCE` がエナから選べない）／`O-164`（「次に〜される場合」の1回消費耐性＝**2件が同じ器**）／`O-173`（「同じレベル」のペア付け）。
- **§5.4 (iii) 構造混線へ送り 2件**＝live の `parseStatus:'PARTIAL'` 11効果／続き749 の縦切り8（`WX21-028-E2`／`WXDi-P10-007-E3`）＝
  どちらも**木ごと作り直す**種類で、機構の追加では閉じない。
- ⚠**`O-217` は「機構」ではなく未整理の集計**（旧クラスタ集計の7区分）＝索引 D に入れて「着手の最初の工程は再計測」と明記した。`O-199`（アンコール）と重なっている。

🔴**在庫 82 → 109 は新しい在庫が増えたのではない**＝**置き場が2つあったのを1つに畳んだ結果**。§5.3 の内訳＝A **14**／B **11**／C **45**／D **34**／E 4／F 1。

### 🔴 同時に踏んだ計器のバグ＝`census:cards` の `mech` が「本文を移しただけ」で緑になる

**真因**＝`scripts/cardProgressCensus.mjs` の `mech` 判定は **`docs/PLAN.md` の §5.3 節だけ**を読んでカード番号を拾っていた。
ところが §5.3 は 2026-09-01 の再編で **「索引（PLAN.md）＋登録票の全文（PLAN_DETAIL.md）」に分割済み**で、
**カード番号はほぼ全部が登録票の側**にある。⇒ **登録票へ本文を移すたびに `mech` が減る**＝機構待ちが解消したように見える。

- **実測**＝この採番で本文を PLAN.md から移しただけで **Sheet1 要対応 18 → 1（`mech` 18 → 1）** に化けた。**実装は1行も変えていない。**
- **修正**＝`PLAN.md §5.3` ＋ `PLAN_DETAIL.md の「§5.3 機構 worklist 登録票の全文」節` の**両方**を haystack にした（切り出し失敗時は個別に警告を出す）。
- **修正後＝Sheet1 要対応 20 / 863（`mech` 20・即着手可能 0）**。🔑**18 → 20 は前進でも退化でもなく較正**＝
  差分2件は「2026-09-01 の再編で PLAN.md から登録票へ移されていたぶん」＝**この採番の前から既に過少報告だった**。
- ⚠**§5.3 の置き場をこれ以上動かすなら、この計器の切り出し見出しを必ず一緒に直す**（見出し文字列でしか掴んでいない）。
- ⚠`census:cards` はゲートではない（exit 0）ので**CI では捕まらない**。同型の「本文を移すと計器が緑になる」穴は
  §5.3 O-187（`mech` の過大側）と対になっている＝**`mech` は過大にも過少にも振れる。**

**影響枚数**＝カードの挙動は 0 枚（engine / parser / live JSON / `src/` は1バイトも触っていない）。動いたのは docs 2本と計器1本。

**検証**＝`npm run gates` 全緑 ✅（golden 3199/3199・smoke 全異常0・fuzz 全0・census 11 / BASELINE 12・`census:stubs` A群🔴0/C群0・
manual-fields 0・`census:enginetext` A🔴 130行/127ハンドラ 据置・lint 0 errors）／`npm run census:cards -- --sheet 1`。
**反転確認**＝あり（計器の修正を外すと Sheet1 が 1 に戻ることを実測）。
**⑤実機＝不要と判定**（§2.2＝`src/screens/` も `src/engine/` も新しい型・機構も触っていない。触ったのは `docs/` と `scripts/` の計器のみ）。


## 2026-09-01（続き769）：§5.1 実機未検証キューを 4件 → **0件** に返済（`V-107`／`V-105`／`V-104`／`V-103`）

**この巡は「新しい実装」ではなく「返済」**＝続き756/757/767/768 が `src/screens/` と新機構に触れたまま残していた
**実機観測点4件**を全部踏んだ。**新規シナリオ13本・すべて PASS（単体でも13本一括でも）**。engine/parser は1バイトも触っていない。
触ったのは **`scripts/verifyBattleDrive.mjs`（+736行）** と **`SigniOnPlayCostModal.tsx` の `data-testid` 1行**だけ。

### A. `V-107`＝`WX22-018-E2`「**いずれかのトラッシュから**対象のコストの合計が０のスペル１枚を除外し《無》を支払ってもよい」

**残っていたのは UI 経路だけ**（runtime `canAffordOptionalCostSpec` と支払いステップ `EXILE{TRASH_CARD owner:'any'}` は golden 済み）。
`execExile` が `owner:'any'` を `TargetScope 'both_trash'` に落とすので、**`EffectInteractionModal` の `scopeDesc` に行が無ければ見出しが空になる**。

- **盤面**＝自分のトラッシュには**スペルでないバニラ1枚**だけ、相手のトラッシュにコスト0スペル1枚。
- **観測3点とも PASS**＝①自分側に候補が無くても**支払い択が出る** ②見出しが「**いずれかのトラッシュから**」
  ③選んだ札が**相手のトラッシュから消えて相手の除外へ**（自分のバニラは候補にすら出ない＝filter が効いている）。
- **反転確認**＝live の `trashExile.owner` を `any`→`self` にすると**支払い択自体が出ず** FAIL（`canAfford` が false で丸ごとスキップ）。
- 新シナリオ＝`v107BothTrashPay` / `v107BothTrashSkip`（辞退なら除外も本体も起きない）。

### B. `V-105`＝`WXK03-070`（幻怪　モモタロ）の `cost.energyTrashGroups`（続き767 で新設・旧 live は `costUnparsed`＝**無料**）

🔑**支払い経路は2つあり、両方を別々に踏んだ**＝①通常召喚（`SigniOnPlayCostModal`）②効果で場に出た（`optionalCostPaySteps`）。

- **観測4点とも PASS**＝(a) 3種そろっているときだけ **発動が enabled**（`エナゾーンからトラッシュするカードを選択: 3/3`）
  (b) **同名3枚では 1/3 で止まり 発動は disabled**（グループごとに別カードが要る）
  (c) 支払った札が**3枚ともトラッシュへ**・**無関係な1枚はエナに残る**（1枚だけ／4枚は誤り）
  (d) **②効果で場に出た経路**でも同じコストを取られ、**グループごとに1つずつ TRASH ステップへ分解**される（実測で3ステップ）。
- 🔑**選択ガードの観測は「押してカウンタが動かないこと」で測った**＝無関係な札を先に押して `0/3` のままを読む
  （`canAddEnergyTrashGroupIndex` が効いていなければここで 1/3 になる）。
- **反転確認**＝`manualEffects.ts` から `cost.energyTrashGroups` を外すと、選択UIが消えて**無料の「発動しますか？」**に戻り FAIL。
- **`SigniOnPlayCostModal.tsx` に `data-testid="onplaycost-enatrash-${i}"` を追加**（エナ**支払い**の `onplaycost-energy-${i}` とは別枠。
  この面には testid が無く、盤面の同名 `img[alt]` と区別して狙えなかった）。
- 新シナリオ＝`v105OnPlayGroupsPay` / `v105OnPlayGroupsSameName` / `v105OnPlayGroupsByEffect`。

### C. `V-104`＝`WXK11-013`（キー）の `LRIG_LIMIT_MODIFY{owner:'any'}`「（お互いのセンタールリグに影響する）」

**3本セット（キー無し11／自分側にキー10／相手側にキー10）で、表示と配置ゲートが同じ値を見ていることを確かめた。**
**対照が「キーの有無だけの1ビット反転」なので、これ自体が反転確認になっている。**

- **PASS**＝表示「`Lv.2　リミット: 8/11`」→ キーありで「`8/10`」／空きゾーンの内訳が `10/11`→`10/10`。
- 🔑**配置ゲートは2段ある**＝①手札カードの【召喚】ボタンを出すか（`BattleScreen.tsx:8327`）②ゾーンボタンの `disabled`。
  **リミットを1超える札では①で既に止まる**ので、**ちょうど収まる Lv2 と 1超える Lv3 の2枚**を手札に置いて両方を見た
  （リミット10のとき Lv3 は**【召喚】自体が出ない**＝ゲートが表示と同じ値を見ている）。
- 新シナリオ＝`v104LimitNoKey` / `v104LimitKeySelf` / `v104LimitKeyOpp`。

### D. `V-103`①＝**【ライド】の【起】**（続き756 が `<CardNum>-RIDE` をルリグ9枚に新規生成）

- **PASS**＝(a) ルリグの【起】一覧に **`【起】コストなし`** が出る（本来の `【起】コイン1` と並ぶ）
  (b) ＜乗機＞シグニを選んで**乗る**（`lrig_riding_signi` に入る）／(c) ＜乗機＞が居なければ「**乗機シグニなし（RIDE_ON）**」で止まる
  (d) 撃ったあと**同じターンには一覧から消える**（`once_per_turn`）／既にドライブ状態なら「**ルリグ既にドライブ状態**」で乗り直さない。
- 新シナリオ＝`v103RideOn` / `v103RideNoTarget` / `v103RideAlreadyDriving`。
- **`queryState` に `lrigRidingSigni` を追加**（`RIDE_ON` はここが空でなければ即スキップするので、両方向の観測点）。

### E. `V-103`②＝`split_top_bottom` の振り分けUI（`WDK04-014` 大罠　ジャバウォック）

**PLAN が「この枝は golden で固定できていない」と明記していた「置かない」枝**を実機で踏んだ。

- **PASS**＝**上に残しても**（デッキトップのまま）**下へ置いても**、後続の
  「この方法で公開したカードがレベルが奇数のシグニの場合」が**両方とも成立**（`+5000` と【ランサー】が付く）＝`lastProcessedCards` が残る。
- **同じ盤面・同じ札で「上/下」1ビットだけ反転**した2本＝`v103SplitKeepTop` / `v103SplitToBottom`。

### 🔑 この巡で得た「ドライバの書き方」の教訓（次の人が同じ穴に落ちないために）

1. 🔴**`field.key_piece` は `CORE_FIELD_KEYS`＝シナリオ間で引き継がれる。**
   明示的に `null` を書かないと**前の巡のキーが残ったまま**回り、対照が別のリミットで走る。
   症状は「**【召喚】ボタンが出ない**」だけなので、カードやルリグ限定や待ち時間を疑って時間を溶かす。
   ⇒ **効果が「盤面に1枚あるかどうか」で決まる観測をするときは、その枠を spec で必ず両サイド明示クリアする。**
2. 🔴**反転確認の後始末を `mv`（mtime 保存）で戻すと、`distIsFresh()` が build をスキップして次の実行が反転版の dist で回る。**
   実際にこれで「一括実行だけ2本 FAIL」を踏み、シナリオ間汚染を疑って調査した（**真因は stale dist**）。
   ⇒ **復元は `git checkout` か、復元後に `touch`。疑わしいときは `SKIP_BUILD=0` で強制ビルド。**
3. 🔴**`manualEffects.ts` は実行時にも勝つ。** `BattleScreen` が `buildEffectsMap` → `mergeManualEffects` を毎回呼ぶので、
   **`public/data/effects_*.json` を削っても manual 側が復活させる**。⇒ **MANUAL 効果の反転確認は `manualEffects.ts` を触る。**
4. 🔑**候補モーダルは「このモーダルで選んだ札」を覚える。** 毎ティック同じ札を押すと選択がトグルして `決定` に永久に進まない
   （`o190CostDrive` が既にこの型を持っていたのに写し損ねて2回踏んだ）。
5. 🔑**「出ないこと」を主張する観測は、出る側と同じ時間だけ待ってから結論する**（`getMyHandCardActions` は `loading` 中 `[]` を返す）。
   出なかったときは**そのとき何が出ていたか**（`data-action-label` の一覧）を必ずログに残す。
6. 🔑**観測だけの巡では押し切らない**＝`V-104` はモーダルを開いて読んでキャンセルし、`盤面は不変` を判定に含めた
   （配置してしまうと次の観測ができない）。

**検証**＝`npm run gates` **全緑**（typecheck／golden 3199・0 FAIL／smoke 全0／fuzz 全0／census 11 / BASELINE 12／
census-stubs A🔴0・C0／manual-fields 0／census-enginetext A🔴130行 据置／lint 0 errors・249 warnings）。
**実機**＝`node scripts/verifyBattleDrive.mjs` で**新規13本すべて PASS**（単体・13本一括の両方）。
⚠**実機は必須と判定**（§2.2）＝`src/screens/` を触った（`data-testid` 1行）＋そもそもこの巡が実機返済。


## 2026-09-01：PLAN 再編（第2回）＋ 対象レベル依存コスト2効果を live へ届けた

### A. 対象レベル依存の任意コスト2効果（前セッションの未完了分を完走）

**真因**＝支払う量が「先に固定した対象のレベル」で決まる形の受け皿が片方しか無かった（`costColorsPerTargetLevel`＝**最大**レベルのみ）。
**影響**＝2効果。`WX24-P4-051-E2`（旧 live は `STUB{OPTIONAL_TRASH_ENERGY_CLASS}`＝レベル限定を失い、支払い後に回収対象を選び直せた）／
`WX24-P2-054-E2`（旧 live は `ENERGY_CHARGE{DECK_CARD}`＝**自分のデッキからエナチャージする別の動作**）。

- **新キー1本**＝`StubAction.costColorsPerTargetLevelSum`（対象**すべてのレベル合計**1につき単位コスト）。
  **4箇所へ配線**＝`src/types/effects.ts`（型）／`src/engine/execUtils.ts`（`sumCardLevels` 新設＋`resolveOptionalCostSpec`）／
  同（`levelUnavailable` を合計版でも fail-closed に）／`scripts/decompileEffects.ts`（逆翻訳）。
- **2効果は `manualEffects.ts` に手書き**（§2.0 の速いレーン＝同型2枚以下）。`WX24-P4-051-E2` は既存の `energyTrashSameLevelAsTarget` が受け皿だった。
- **`WX24-P2-054-E2` の負方向 golden（`ENERGY_CHARGE` のままを固定していたもの）を削除し、正方向へ差し替え。**

🔴🔑**真の発見＝`manualEffects.ts` に書いただけでは live に届いていなかった。**
`build:effects` の収穫マージは**既存 id の書き直しを温存する**ので、live は旧出力（`parseStatus:AUTO`）のまま残っていた。
**新しい golden は `manualEffect()` ヘルパで MANUAL_EFFECTS を直接読むため全部緑**になり、逆翻訳・census・smoke・fuzz も何も言わなかった。
**捕まえたのは `§6.3 K トリップワイヤ`（「manualEffects.ts の定義が live JSON に届いている」）1本だけ**＝
`新しい乖離（manualEffects.ts を直したが live に届いていない）: WX24-P4-051-E2, WX24-P2-054-E2`。
⇒ **既存 id を書き直したら `npx tsx scripts/syncManualLive.ts <CardNum>` まで回して初めて1巡が閉じる**（CLAUDE.md の同項目を実地で再確認した）。

**検証**＝`npx tsx scripts/syncManualLive.ts WX24-P4-051 WX24-P2-054` → **live の変更が この2効果だけ**であることを
`git show HEAD:public/data/effects_WX24_26.json` との**効果単位の機械比較**で確認 → `npm run regen` → `npm run gates` **全緑**
（golden **3199 / 3199**・0 FAIL／smoke 全0／fuzz 全0／census 11 / BASELINE 12／lint 0 errors）。
**反転確認**＝golden に fail-closed 2本（対象0体・レベル参照不能／同レベルのエナが無い）を含む＝**払えない側でも赤くなる。**
⚠**実機は不要と判定**（§2.2）＝`src/screens/` 不変更・新キーは engine の純関数経路のみ。
📋**残した粗**＝`energyTrashSameLevelAsTarget` の「それと同じレベルの」が**逆翻訳に出ない**（挙動は正しい）＝PLAN §5.3 の「監視だけしている項目」へ登録。

### B. PLAN 再編（第2回）＝計器主導から機構主導へ

**真因**＝**3つの進捗計器が同時に底を打った**のに、PLAN が「計器の在庫を消化する」前提のままだった
（census 高シグナル **11 / BASELINE 12**＝旧ベースライン 1872／`census:cards --sheet 1` の要対応 **18枚が全部 `mech`＝即着手可能 0**／
意味照合台帳の残 OPEN **44 は続き766 の全数 triage で全件が `src/screens/` か新 engine 機構待ち**）。

- **§5.3 を「登録順の巨大テーブル」から「母集団順の索引 A〜F」へ**作り替え、登録票82項目の履歴 **68,401字**を PLAN_DETAIL へ**無改変で退避**。
  **旧「取る順」表は廃止**（索引の並びがそのまま取る順）。索引で判明した実態＝**`O-96` は登録票「M」で実測122効果**、
  逆に**取る順1位だった `O-106` は1効果**、**母集団未計測が33項目（4割）**。
- **§5.2（意味照合）を本線から降格**、**§5.4 の (i) 配線ギャップ・(ii) 機構ギャップ（未採番30件）を §5.3 へ統合**（機構の置き場が2つあった）。
- **§5.1 のクローズ済み `V-nn` を教訓7本へ圧縮**（宙に浮いていた断片行も解消）。**進捗指標に「在庫2本」を追加**（§3・§6）。
- **PLAN.md 195,282字 → 100,385字（-49%）／1423行 → 1203行。**

**検証**＝旧 PLAN の **O-id 124種・V-id 26種・カード番号 355種**がすべて PLAN.md か PLAN_DETAIL.md に残存することを機械確認（欠落0）。
索引82行はすべてテーブル記法として妥当（パイプ4本）。**併せて `CLAUDE.md`（廃止した取る順表への誘導と消化済みの次の一手を差し替え）と
`baton`／`census-batch` スキルを更新。**


## 2026-09-01：PLAN §5.3 `O-190` 第2バッチ — 任意コストのトラッシュ除外／他の【トラップ】支払いを復元

第1バッチで受け皿がなく据え置いた4効果のうち、通常の複合任意コストとして扱える3効果を修正した。
原文は「別のコスト動作をし、《色》を支払ってもよい」だが、旧 live は
`OPTIONAL_COST{costColors}` だけだったため、色エナだけで本体を撃てる過剰実行だった。

### 実装と7点配線

- `src/types/effects.ts` の JSON payload 型 `StubAction` と、`src/engine/execUtils.ts` の runtime 型
  `OptionalCostSpec` の両方へ `trashExile` / `fieldTrapTrash` を追加した。
- `resolveOptionalCostSpec` で両キーを転送し、`canAffordOptionalCostSpec` で候補数を fail-closed に判定した。
  `trashExile.owner:'any'` は自分・相手の両トラッシュを単一候補プールとして数える。
  `fieldTrapTrash.excludeSource` は `field.signi_traps` から効果元自身を除いて数える。
- `optionalCostPaySteps` は `trashExile` を既存 `EXILE{TRASH_CARD}` に、`fieldTrapTrash` を
  専用 `INTERNAL_TRASH_FIELD_TRAP_COST` に展開する。後者は `execStubPart1` で選択後に
  `field.signi_traps` から除き、通常トラッシュへ移す。`fieldTrash` は借用していない。
- `execExile` の `owner:'any'` 候補収集を両トラッシュへ広げ、`TargetScope` に `both_trash` / `self_trap` を追加した。
- 3効果はすべて action 内の `OPTIONAL_COST` なので、支払い入口は効果起動側の
  `EffectInteractionModal`。同モーダルへ2 scope の表示を追加した。通常召喚の
  `SigniOnPlayCostModal` と、その共通判定を置く `costs.ts` は通らないため変更していない。
  色エナ選択と pay/skip は既存 `optionalCostUi`、追加コストの表示は
  `optionalCostExtraLabels`、追加支払い選択は pay 後の `EffectInteractionModal` が担う。
- `effectParser.ts` の複合任意コスト規則へ「ゲームから除外し」を追加し、3句だけを payload 化した。
  「コストの合計が0」は新キーを作らず、既存 `TargetFilter.costMin:0/costMax:0` を使った。
- `decompileEffects.ts` へ両 payload の描画を追加した。第1バッチの `fieldTrash` /
  `underAnySigniTrash` と同じ「live は直ったが逆翻訳からコストが消える」穴を残していない。

### 採用3効果

| effectId | 原文のコスト節 | 生成した `OPTIONAL_COST` | 逆翻訳でのコスト節 |
|---|---|---|---|
| `WXDi-P11-049-E1` | あなたのトラッシュにある＜毒牙＞のシグニ3枚をゲームから除外し《黒》 | `trashExile:{count:3,owner:'self',filter:{cardType:'シグニ',story:'毒牙'}}` | あなたのトラッシュにある＜毒牙＞のシグニ3枚をゲームから除外し《黒》を支払ってもよい |
| `WX22-018-E2` | いずれかのトラッシュから対象のコストの合計が0のスペル1枚をゲームから除外し《無》 | `trashExile:{count:1,owner:'any',filter:{cardType:'スペル',costMin:0,costMax:0}}` | いずれかのトラッシュから対象のコストの合計が0のスペル1枚をゲームから除外し《無》を支払ってもよい |
| `WX15-053-TRAP` | あなたの場にある他の【トラップ】1枚をトラッシュに置き、《青》 | `fieldTrapTrash:{count:1,excludeSource:true}` | あなたの場にある他の【トラップ】1枚をトラッシュに置き、《青》を支払ってもよい |

`WX22-018-E2` は指示どおりコスト payload だけを変更し、既存の
`CONDITIONAL{IS_MY_TURN}` と未固定 `BOUNCE` 対象には触れていない。
`resumeOptionalCost('skip')` は continuation を実行するため、自分ターンなら skip 後もこの既存ゲートが成立し得る。
したがってコスト節は改善したが、did-it gate／先行対象固定の原文不一致は残る。今回の変更による新規退化ではなく、別バッチの領分。

`WXK06-029-E1` はデッキ探索中に効果元自身を公開する特殊形であり、通常の任意コストではないため第1バッチどおり据置。
今回の条件以外で新しく見つけた原文差は0件。

### fail-closed・実機・反転確認

- golden を日本語名で4本追加。fresh/live の3 payload、`WX22-018-E2` の既存木据置、
  ＜毒牙＞3枚／2枚、相手トラッシュだけにあるコスト0スペル／両方0枚、
  他の【トラップ】あり／効果元だけ、pay/skip の本体分離を固定した。
- parser 規則から「ゲームから除外し」を一時的に外すと、fresh assert が
  `WXDi-P11-049-E1 ... got=undefined` で FAIL。復帰後4/4 PASS。
- 実機4本を `verifyBattleDrive.mjs` に追加し、`SKIP_BUILD=0` で
  `o190TrashExilePay` / `o190TrashExileSkip` / `o190FieldTrapTrashPay` /
  `o190FieldTrapTrashSkip` が **4/4 ALL PASS**。候補選択後に `決定` の enabled を検査してから押している。
- live JSON から両 payload を一時的に外す反転では pay 2本がともに FAIL。
  色エナだけが減り、＜毒牙＞は除外されず／他の【トラップ】は残ったまま本体だけが起きる旧挙動を再現した。
  退避から復元後、`SKIP_BUILD=0` で再度4/4 ALL PASS。

### ゲート・帳票・ブラスト半径

- `npm run gates` 全緑＝golden **3189 → 3193 PASS / FAIL 0**、smoke **10721/10721**・
  CRASH/HANG/INVARIANT 0、fuzz CRASH/HANG/INVARIANT/EXPLOSION 0、census 高シグナル **11**
  （BASELINE 12以下）、census:stubs A0/C0、manual-fields 0、census:enginetext A🔴130行据置、
  lint **0 errors / 249 warnings**（増減0）。
- ベースライン `597ed93bd` との effectId 単位比較は
  `WXDi-P11-049-E1` / `WX22-018-E2` / `WX15-053-TRAP` の**変更3件だけ**。追加0・削除0・予定外0。
- 報告直前の `build:effects` → `heldReview` は `_held_fresh` **75** /
  `_partial_fresh` **10** / `_idset_fresh` **7**（すべてベースライン据置）。
- 変更ファイルのベースライン比較で U+FFFD、3文字以上連続 `?`、先頭BOMの新規増は0。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` は編集せず、commit / push もしていない。

### Claude 側の独立検証（Codex の報告を鵜呑みにしない＝CODEX_GUIDE §7）

- **per-effect diff を自前で取り直した**（キー順を正規化しない生文字列比較）＝**変更3・追加0・削除0**で報告と一致。
- **`npm run gates` を回し直して全緑**（golden **3193**・census 11・lint 0 errors / 249 warnings）。
- 🔴**実機4本を Claude が `SKIP_BUILD=0` で再実行して 4/4 ALL PASS**（Codex の申告と独立）。**ログで挙動まで確認した**＝
  `o190FieldTrapTrashPay` は**コスト候補が `["WX15-052#1911"]` の1枚だけ**＝**効果元の `WX15-053#1910` が候補から除かれている**
  （＝`excludeSource` が実 UI で効いている）。pay 後は `traps=["WX15-053#1910",null,null]` / `trash=[…,"WX15-052#1911"]` /
  対象バニッシュ=true / energy=0。skip は3ゾーンとも不変で energy=1（＝色エナも払っていない）。
  `o190TrashExilePay` も除外3枚・energy=0・-10000=true、skip は除外0・energy=1。
- **`execExile` の `owner:'any'` 拡張のブラスト半径を実測**＝live に `EXILE{target.owner:'any'}` を持つ効果は
  **今回の `WX22-018-E2` 以外に0件**（全 effects JSON を走査）。**適用側は元から両者を探索していた**
  （`effectExecutor.ts:11000` 付近＝`owner` が self/opponent 以外なら `['self','opponent']`）ので、
  今回の変更は**候補集めと scope 表示だけ**を揃えたことになる。
- **`both_trash` / `self_trap` の UI 配線を実コードで確認**＝`EffectInteractionModal` は候補を
  `inter.candidates`（カード id の配列）から描き、**scope はラベルと「場のゾーン番号表示」にしか使わない**
  （`opp_field` / `self_field` / `both_field` の分岐のみ）。⇒ 追加した2 scope は**ラベルの追加だけで足りる**。

🔴**唯一の未検証＝`WX22-018-E2`（`owner:'any'`＝`both_trash`）は実機シナリオが無い。**
runtime（`canAffordOptionalCostSpec` が**相手トラッシュだけに候補がある盤面で true**）と
支払いステップ（`EXILE{owner:'any'}` への転送）は golden で固定したが、**実 UI で相手トラッシュの札を選べるか**は
まだ踏んでいない。⇒ **PLAN §5.1 に `V-107` として登録**した。

## 2026-09-01：PLAN §5.3 `O-188` 第7バッチ — 「〈A〉1枚と〈B〉1枚を対象とし」の**片方の群だけが live に残っていた**4効果 ＋ 恒久 no-op 1件

**Codex は2アカウントとも利用上限**（`.codex-work` 13:55／`~/.codex` 16:27 まで）のため **Claude が実装**した。

**真因**＝この文型の受け皿（`source.selectionConstraint.groups` ＋ `filter.anyOf` の和）は**既にあり、
parser も `parseExplicitSelectionGroups` で群を作っていた**。しかしそれは
**「クラス＋クラス」「クラス＋スペル」「シグニ＋スペル」「カード名＋カード名」…という綴り別の列挙**で、
**レベル修飾・アイコン修飾・「色のスペル」が付いた瞬間に1件も当たらず**、
**片方の群だけが残った単一 filter**（＝**枚数が2→1に減る過小実行**＋**残った側の候補が広い過剰実行**）に落ちていた。

⇒ **列挙の最後に一般形の受け皿**を足した。名詞句の解釈は**第4バッチと同じ `recoveryGroupFilter`**
（＝既存 `parsePickNounPhraseFilter`）へ一任し、新しい語彙解釈は1つも書いていない。
⚠**左端はゾーン句（「あなたのトラッシュから」等）で固定する**＝固定しないと最初の群が
「【出】：あなたのトラッシュから…」まで飲み込んで名詞句として解けない（最初の実装で実際にそうなった）。

| 効果 | 原文 | 旧 live | 直した形 |
|---|---|---|---|
| `WX19-027-BURST` | トラッシュから**レベル１の＜英知＞のシグニ１枚とレベル４の＜英知＞のシグニ１枚** | `{cardType:'シグニ', story:'英知'}` 1枚（**レベルが両方消えた**） | 2群（level 1 / level 4） |
| `WXK02-002-E1` | **《ライズアイコン》を持つシグニ１枚と＜アーム＞のシグニ１枚** | `{story:'アーム'}` 1枚（**アイコン群が消滅**） | 2群（`hasRiseIcon` / `cardClass:'アーム'`） |
| `WXK07-034-BURST` | **黒のシグニ１枚と黒のスペル１枚** | `{cardType:'シグニ', color:'黒'}` 1枚（**スペル群が消滅**） | 2群（黒シグニ / 黒スペル） |
| `WDK15-001-E2` | **《ライズアイコン_黒》_blackを持つシグニ１枚と＜ウェポン＞のシグニ１枚** | `{story:'ウェポン'}` 1枚 | 2群（`hasRiseIcon` / `cardClass:'ウェポン'`） |
| 🆕`WDK15-017-E1` | デッキから**《ライズアイコン_黒》_blackを持つシグニ１枚**を探して公開し手札に加える | `filter:{cardName:'ライズアイコン_黒'}`＝**どのカード名にも一致しない恒久 no-op**（1枚も探せない） | `filter:{hasIcon:'ライズ'}` |

### 🔴 CSV には「色つきアイコン」の綴りがある（`《ライズアイコン_黒》_black`）

画像由来の綴りで **`WDK15-001` / `-009` / `-017` の3枚**に出る。アイコン判定が**完全一致**（`^…アイコン$`）だったため
**アイコン条件として読めず、カード名フィルタへ落ちていた**。⚠**同じファイルのコメントが
「カード名フィルタにすると無言 no-match になる（`WX08-072-BURST` の旧バグ）」と警告していた穴が、綴り違いで再発**していた。
⇒ `parseIconFilter`／`REVEAL_PICK_DESC_RULES`／SEARCH のアイコン判定の**3箇所**で色サフィックスを受けるようにした。
⚠**色を filter に足さない**＝色サフィックスは表示上の色で、条件ではない（先行の MANUAL 実装 `WDK15-009-E1` も `hasRiseIcon` だけ）。

### 🔴 実装中に踏んだ退行＝「既に2ステップへ割れている回収」に群を載せると**枚数が倍**になる

`WXEX1-30-BURST`（白のシグニ1枚と青のシグニ1枚）は **`TRANSFER_TO_HAND` 2ステップ**で**既に正しかった**。
`applyExplicitSelectionGroups` の `rewrite` は **SEQUENCE を再帰して各ステップを書き換える**ので、
一般形を足した直後は**2ステップとも「合計2枚」**になり、**合計4枚回収**の過剰実行になっていた。
⇒ **効果全体の `TRANSFER_TO_HAND` ノードが1つのときだけ**群へ畳むガードを入れ、**対照テストで固定**した。
🔑**教訓＝同じ意味を2通りの構造で表す実装があるとき（§5-3-4″）、片方を一般化すると
もう片方に二重適用される。「別構造で正しい群」は据置するだけでなく、二重適用のガードまで要る。**

### 検証コマンドと結果

- `npm run gates` 全緑＝**golden 3186 → 3189 PASS / FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **per-effect diff**（ベースライン `4a73d195c`・生文字列比較）＝**変更5・追加0・削除0・予定外0**。
- **held は 75 → 81 → 採用5枚で 75 へ戻した**（`heldReview --adopt` 経由・5件とも fresh を1件ずつ原文照合）。
  `_partial_fresh` 10／`_idset_fresh` 7 は据置。
- 🔴**反転確認をファイル単位で3本**＝`effectParser.ts` を戻すと `WX19-027-BURST(fresh)` が FAIL／
  `parserUtils.ts` を戻すと `WDK15-001-E2(fresh)` が FAIL／`parsers/parseSentencePart1.ts` を戻すと
  `WDK15-017-E1(fresh)` が FAIL。**3ファイルとも載っている**ことを確認した。
- **既存 golden 1本を書き換えた**（§5-17′）＝「続き377c トリップワイヤ: 別ピック2本の span にアイコンを AND しない」の
  `WXK02-002` 分岐。**元の意図（2本の別ピックを1 filter に AND しない）は保ったまま**、
  「アイコンが無いこと」ではなく**群の中身で直接見る**形へ変えた（器は `transferGroups` と
  `source.selectionConstraint.groups` の2通りあるので両方を読む）。
- 逆翻訳（`regen` 後）＝5件とも原文どおり。例＝`WXK07-034-BURST`「あなたの《黒》のシグニ1枚と《黒》のスペル1枚(トラッシュ)を手札に加える」。

**⚠実機は不要と判定**（§2.2）＝`src/data/` `scripts/` `public/data/` `docs/` のみ。`src/engine/` も `src/screens/` も触らず、
新しい型・機構も足していない（既存 `selectionConstraint.groups` の生成規則を1本足しただけ）。

## 2026-09-01：PLAN §5.3 `O-188` 第6バッチ — 「それぞれ1枚まで」が**手札以外の帰結**で潰れていた3効果 ＋ 別物を実装していた STUB 1本

**Codex は2アカウントとも利用上限**（`.codex-work` 13:55／`~/.codex` 16:27 まで）だったので **Claude が実装**した。

**真因**＝第4バッチで直した「AとBをそれぞれ1枚まで」は**帰結が「手札に加える」の場合だけ**
（`TRANSFER_TO_HAND.transferGroups`）で、**帰結が別のアクションだと群ごと潰れたまま**だった。

🔑**受け皿は既存の `SelectionConstraint.groups`**（「＜A＞1枚と＜B＞1枚」の配分を表す機構）＝
`execAddToField`（`:3582`）・`execPlaceUnderSigni`（`:7551`）・`execSearch`（`:4586`）・`execTrash`（`:2028` 内2箇所）が
**そろって `selectionConstraint` を `selectOrInteract` へ渡しており**、`canAssignSelectionGroups` が
**どの群にも割り当てられない選択を却下する**（群外の札は取れない／同じ群の二重取りもできない）。**新型は0本。**

| 効果 | 原文 | 旧 live（実害） | 直した形 |
|---|---|---|---|
| `WXDi-P06-083-E2` | トラッシュから**レベル１、レベル２、レベル３のシグニをそれぞれ１枚まで**対象とし、それらをこのシグニの下に置く | `PLACE_UNDER_SIGNI{count:3, filter:{cardType:'シグニ'}}`＝**レベル限定が丸ごと消滅**（レベル1を3枚でも置けた＝過剰実行） | 群3つ（level 1/2/3 × 1枚） |
| `WXDi-P07-095-E1`② | トラッシュから**《惨之遊姫　グズ子//メモリア》とレベル２以下のシグニをそれぞれ１枚まで**対象とし、それらを場に出す | `ADD_TO_FIELD{count:1, filter:{level:{max:2}}}`＝**カード名の群が消えて①の劣化版**（枚数の過小＋候補の過剰） | `count:2` ＋ 群2つ（カード名／レベル2以下）。`filter` は2群の `anyOf` |
| `WXK05-030-E1` 後段 | デッキから**白、赤、青、緑、黒のカードをそれぞれ１枚まで**探して公開し手札に加える | `SEARCH{filter:{color:'黒'}, maxCount:1}`＝**最大5枚が1枚**（過小）＋**色が黒に化けていた**（他4色は0枚） | `maxCount:5` ＋ 5色の群 |
| 🆕`WXK05-030-E1` 前段 | **対戦相手の白、赤、青、緑、黒のシグニをそれぞれ１体**対象とし、それらを**トラッシュに置く** | `STUB{BANISH_MULTI_COLOR_SIGNI}`＝engine のハンドラは**「2色以上を持つ相手シグニを、選択させずに全部バニッシュ」**という**まったくの別物** | `TRASH{SIGNI, owner:'opponent', 色ごと1体の群}` へ typed 化し、**ハンドラを削除** |

### 🔴 前段の STUB は「実装済み」に見えて別物だった（`census:stubs` でも `census:enginetext` でも映らない）

`BANISH_MULTI_COLOR_SIGNI` は **engine に消費地点がある**ので `census:stubs` の A群🔴 には出ず、
**カード全文 regex も読んでいない**ので `census:enginetext` にも出ない。**逆翻訳も STUB の日本語ラベルを描くだけ**なので、
「複数色（2色以上）の相手シグニをバニッシュ」という**ラベル自体が原文と違う**ことに気付ける計器が1つも無かった。
⇒ 🔑**STUB の日本語ラベルは「実装の要約」であって「原文の要約」ではない**＝**原文と突き合わせるまで正しさは分からない。**
（今回は同じ効果の後段を直すために原文を読み直したので気付いた。）

### レーンの判断と実装方式

- **同型は各1枚**なので PLAN §2.0 の**速いレーン**＝`manualEffects.ts` に手書き（`parseStatus:'MANUAL'`）。
  ⚠**移設ではない**＝3件とも原文を読み直して JSON を書いた（PLAN §2.0 の禁止事項）。
- ただし**前段の5色トラッシュだけは parser（`parseSentencePart4.ts`）も直した**＝STUB を出す規則がそこに在ったため。
  同じ typed アクションを manual と parser の両方が出す（生成 JSON は一致）。
- 🔴**`upToCount:true` は意図的**＝候補の色構成によっては「ちょうどN体」を満たす選び方が存在しない
  （同じ色が2体・別の色が0体など）ので、**確定できない選択UIを作らないための fail-open**。原文に「まで」は無いが、
  群制約が上限を担保しているので過剰実行にはならない。

### 検証コマンドと結果

- `npm run gates` 全緑＝**golden 3184 → 3186 PASS / FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **per-effect diff**（ベースライン `6342f7d5f`・生文字列比較）＝**変更3・追加0・削除0・予定外0**。
- 3帳票＝`_held_fresh` **75**／`_partial_fresh` **10**／`_idset_fresh` **7**（いずれも据置）。
- ⚠**`manualEffects.ts` を直しただけでは live に届かない**（収穫マージが MANUAL を不可侵にする）＝
  **`npx tsx scripts/syncManualLive.ts WXDi-P06-083 WXDi-P07-095 WXK05-030` が必要**だった（CLAUDE.md の道具）。
- 🔴**反転確認**＝`src/data/manualEffects.ts` を戻すと **golden が赤**（`WXK05-030-E1: live が manualEffects.ts と一致する`）。
  🔑**新テストは live だけでなく「manual 由来のマージ結果」と live の一致まで assert する**＝
  「manual を直したのに同期し忘れた」も「live だけ手で書いた」も検知できる（§5-29 の逆向きの穴＝第5バッチで踏んだもの）。
- 逆翻訳（`regen` 後）＝3効果とも原文どおりに読める。例＝
  `WXDi-P06-083-E2`「あなたのトラッシュからレベル1のシグニ1枚とレベル2のシグニ1枚とレベル3のシグニ1枚をこのシグニの下に置く」／
  `WXK05-030-E1`「対戦相手の《白》のシグニ1体と…《黒》のシグニ1体をトラッシュに置く。そしてあなたのデッキから《白》のカード1枚と…」。
  ⚠**群の filter に `cardType` を入れるまで「カード1体」と描かれていた**＝逆翻訳は群の filter しか読まないので、
  **群にも名詞を決める情報を持たせないと原文照合が効かない**（第4バッチの `filterJa` 対応と同じ趣旨）。
- `node scripts/genStubsMd.mjs` を再生成（`BANISH_MULTI_COLOR_SIGNI` の行が消えた）。
- 🆕**副産物＝逆翻訳の STUB 説明が「別 id の削除メモ」になっていたのを直した**（`WXDi-P08-046-E1`）。
  `genStubsMd.mjs` は**ハンドラの `if` の直上にある連続コメント行**を説明として拾うので、
  **削除した id の記録を次のハンドラの真上に置くと、その説明として逆翻訳に出る**。
  ⇒ 削除メモとハンドラの間に**空行**を入れ、`// LEAVE_FIELD_TO_DECK_BOTTOM: …` の1行説明を足した
  （旧表示＝「§6.4 O-24：`OPP_TRASH_FIELD_SIGNI_AND_ENERGY` は削除した…」／新表示＝
  「このシグニが場を離れる場合、代わりにこれをデッキの一番下に置く」）。

**⚠実機は不要と判定**（§2.2）＝`src/data/` `src/engine/`（ハンドラ削除のみ）`scripts/` `public/data/` `docs/` だけで、
`src/screens/` は触らず、新しい型・機構も足していない（既存 `SelectionConstraint.groups` を使っただけ）。

## 2026-09-01：PLAN §5.3 `O-188` 第5バッチ — 対象名詞句の限定が丸ごと落ちていた4効果（過剰実行）＋「据置」だったはずの1件は**既に直っていた**

**Codex（既定 `~/.codex`）が parser・engine・golden まで実装したところで利用上限**（`try again at 4:27 PM`）に当たり、
**live JSON の再生成（`build:effects` → `heldReview --adopt`）と全ゲートが未了のまま中断**した。**Claude が引き取って完成**させた。
⚠**この巡は `.codex-work` が先に上限**（`try again at 1:55 PM`・**1トークンも使わず即 exit**）だったので既定ホームへ投げ直しており、
**2アカウント連続で上限に当たった**（前例＝2026-08-30 第13バッチ）。

### 群A＝「このターンに手札から捨てた」の履歴限定が消えていた（`SPK01-12-E1`）

原文「あなたのトラッシュから**このターンに手札から捨てた**＜水獣＞のシグニ１枚を対象とし、《緑》を支払ってもよい。
そうした場合、それを手札に加える」に対し、live は `filter:{cardType:'シグニ', story:'水獣'}` だけ＝
**トラッシュの＜水獣＞なら何でも回収できる過剰実行**。

**受け皿は在った**（`TargetFilter.discardedFromHandThisTurn`／消費は `execUtils.ts:1729` の `trashCandidates` funnel／
実装例は `manualEffects.ts` の `WXK05-016-E2`）。**無かったのは名詞句フィルタ側の語彙**＝
`parserUtils.ts` に `parseDiscardedFromHandThisTurnFilter` を新設し、`extractNounPhraseFilter` と `parseSigniTarget` の両方へ配線した。
**対象宣言（`SELECT_TARGET_ONLY.selectTarget`）と回収元（`TRANSFER_TO_HAND.source`）の2箇所とも**限定が付く。

### 群B🔑＝`WXDi-P09-043-E2` は「据置」ではなく**採用漏れ**だった（この巡でいちばん重要な発見）

同日の `O-188` 第2バッチは、この効果を「**上流の別規則が先に食うので未修正・負方向 golden で固定**」と記録していた。
🔴**実測すると、その時点で fresh パースは既に `filter:{thisCardOnly:true}` を出していた**（`src/` を第2バッチ時点へ戻して確認）。
**live に届いていなかっただけ**＝`cardType` が消える変更は**純粋上位集合ではない**ので収穫マージが live を温存し、
カードは `docs/_held_fresh.json` に載っていた。**負方向 golden が live しか見ていなかったので緑のまま**だった。

⇒ **`node scripts/heldReview.mjs --adopt WXDi-P09-043` の1コマンドで解決**（parser の変更は0行）。
🔑**教訓＝「直っていない」と記録する前に fresh を見る。** §5-29 は「live だけの assert では parser の退行を検知できない」だったが、
**逆向き（parser は直っているのに live が古い）も同じ assert の穴から落ちる**。
⇒ **据置を記録するときの golden は live と fresh の両方を assert する**（今回の新テストはそうした）。

### 群C＝「あなたのセンタールリグと同じレベルの」（`WXK02-028-E1` / `SP38-001-E1`）

🔴**PLAN §5.3 の登録票（および 2026-09-01 の第2バッチの記録）は「受け皿は無い・動的レベル比較キーの新設が要る」としていたが、誤り。**
**`TargetFilter.levelEqLrig?: 'self' | 'opponent'` は `src/types/effects.ts:1048` に在り、`effectExecutor.ts:2740` の
`resolveDynamicFilter` が消費し、golden（`goldenTest.ts:4448` `:4468`）まで張ってあった。**
使っていたのは**カード固有 `addFilter` ハードコード2箇所だけ**で、**一般規則が無かった**。

- `parserUtils.ts` の `parseLevelFilter` に「〈あなた／対戦相手〉のセンタールリグと同じレベルの」→ `levelEqLrig` を追加。
  ⇒ **`WXK10-053-BURST` のカード固有ハードコードは不要になったので削除**（生成 JSON は per-effect diff で**変化0**を確認）。
- `effectParser.ts` に `bindCenterLrigLevelUnionTarget` を追加＝「**ルリグかシグニ**」の union 対象（`CENTER_LRIG_OR_SIGNI`）へ
  同じ filter を戻す（シグニ単独は既存の `parseSigniTarget` 経路が担当）。
- 🔴**engine の穴も1つ塞いだ**＝`execGrantKeyword` は **`SIGNI` 単独のときしか `resolveDynamicFilter` を通しておらず**、
  `LRIG` と `CENTER_LRIG_OR_SIGNI` の枝は**生の filter のまま**候補を作っていた。さらに union の枝は
  **センタールリグを filter に関係なく必ず候補へ入れていた**。⇒ 両方を直した（参照不能時は `noMatch` で空ヒット＝fail-closed）。
  ⚠**ブラスト半径は実測済み**＝`GRANT_KEYWORD` × `CENTER_LRIG_OR_SIGNI` は live に **14効果**あるが、
  **`target.filter` を持つのは今回の `SP38-001-E1` だけ**（他13件は `selectionConstraint.groups` を使っており `tgt.filter` は無い）
  ＝`lrigLikeFilterOk(lrig, undefined)` は `true` を返すので**挙動は変わらない**。

### 検証コマンドと結果

- `npm run gates` 全緑＝**golden 3180 → 3184 PASS / FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**（BASELINE 12）／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **per-effect diff**（ベースライン `b54cc149d`・キー順を正規化しない生比較）＝**変更4・追加0・削除0・予定外0**
  （`SPK01-12-E1` / `WXDi-P09-043-E2` / `WXK02-028-E1` / `SP38-001-E1`）。
  ⚠`parseLevelFilter` と `parseSigniTarget` という**広く使われるヘルパ**を触ったので、ここが本命の検査だった。
- 3帳票（報告直前に `build:effects` → `heldReview` を再実行した実測値）＝`_held_fresh` 76 → **75**（`WXDi-P09-043` を採用した1枚ぶん減）／`_partial_fresh` **10**（据置）／`_idset_fresh` **7**（据置）。
- 🔴**反転確認はファイル単位で3回取った**＝
  ①`src/engine/effectExecutor.ts` を戻すと **群C の E2E が FAIL**（「異なるレベルの相手シグニは候補外」）＝engine 変更は載っている。
  ②`src/data/effectParser.ts` を戻すと **3本 FAIL**（群A の fresh assert・群A E2E・群C E2E）。
  ③`src/data/parserUtils.ts` だけを戻すと**import が壊れて実行不能**（新設関数を effectParser が参照するため）＝この軸は ② に含まれる。
- 逆翻訳（`npm run regen` 後）＝`SPK01-12-E1`「…このターンに手札から捨てた＜水獣＞のシグニ…」と原文どおり表示される
  （`decompileEffects.ts` の語彙を「このターンに捨てた」→「このターンに**手札から**捨てた」へ精密化した）。

**⚠実機は不要と判定**（§2.2）＝触ったのは `src/data/` `src/engine/` `scripts/` `public/data/` `docs/` で、
**`src/screens/` は触っておらず、新しい型・機構も足していない**（既存 `resolveDynamicFilter` を既存の union 経路へ配線しただけ）。
engine 変更の実挙動は**新規 E2E golden 2本**（候補集合の正・負＋参照不能時の fail-closed）で固定した。

## 2026-09-01：PLAN §5.3 `O-188` 第4バッチ — 「AとBをそれぞれ1枚まで」の回収群を復元（過剰実行＋過小実行）

**真因**＝`TRANSFER_TO_HAND.transferGroups` と executor／逆翻訳の受け皿は既に在ったが、parser が
「あなたのトラッシュから〈A〉と〈B〉（と〈C〉）をそれぞれN枚まで対象とし、それらを手札に加える」から
群を生成していなかった。単一 `source.filter` に片群だけを残す／複数クラスをORへ潰す／限定を全部落とすため、
**合計2〜3枚が1枚へ減る過小実行**と、**限定外のシグニを拾える過剰実行**が同時に起きていた。

### 実装

- `src/data/effectParser.ts` — 効果単位の最終 root に限定文型 `applyRecoveryTransferGroups` を追加。
  名詞句の意味解釈は既存の厳格な `parsePickNounPhraseFilter` へ一任し、新規の名詞句パーサ／型／filterキーは作っていない。
  新規出力のクラスキーは `cardClass`。`applyDroppedRecoveryDesignation` より後なので同規則の
  `transferGroups` 非干渉契約を保ち、既に群を持つ形も触らない。
- `WXDi-P09-004-E1` の「共通修飾、レベル1、レベル2、レベル3のシグニ」は、助詞ではなく
  反復するレベル列挙を分割し、各句を同じ既存ヘルパへ渡した。
- `WXDi-P00-001-E1` は3つの連続 `TRANSFER_TO_HAND` が群と完全一致する場合に据え置く構造ガードを追加。
- `WX24-P4-017-E2` は一般規則だけで既存 JSON と完全一致したため、`applyExceedBodyFixes` のカード固有分岐を削除。
- 🆕**`scripts/decompileEffects.ts`（Claude が追加）** — `transferGroups` の逆翻訳が**自前で noun を組み立てており
  `cardType` と `color` しか描いていなかった**ので、他の群レンダラと同じく **`filterJa` に描かせる**1箇所へ直した。
  🔴**これを直さないと今回の修正そのものが読めない**＝クラス・レベル・アイコン・《ガードアイコン》を持たない・
  宣言クラスが**逆翻訳から丸ごと消え**、原文照合（このリポの主軸の検査）が効かない穴が新しく5効果ぶん増えていた。
- `scripts/goldenTest.ts` — live＋fresh の7効果、単一群の負対照、`WXDi-P00-001-E1` 据置、
  `WX24-P4-017-E2` 完全一致を3本で固定。既存「アイコンをANDしない」テストは、元の意図を保ったまま
  「アイコン群とクラス群が同じ filter に同居しない」を直接見る形へ精密化した。

### 調査結果・採用7効果

全件、既存 `transferGroups` と既存 `TargetFilter` だけで表現可能。JSON は今回生成した該当アクション。

| effectId | 原文の該当節 | 生成 JSON | 逆翻訳（効果全体） | 原文一致 |
|---|---|---|---|---|
| `WX16-026-BURST` | トラッシュからライズ持ちシグニと《武勇》のシグニを各1枚まで | `TRANSFER_TO_HAND{source:{TRASH_CARD,self,1},transferGroups:[{1,{cardType:'シグニ',hasRiseIcon:true}},{1,{cardType:'シグニ',cardClass:'武勇'}}]}` | `【LB】【ライフバースト】：あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳は両限定を表示せず不一致 |
| `WX16-031-BURST` | ＜調理＞シグニとアクセ持ちシグニを各1枚まで | `…transferGroups:[{1,{cardType:'シグニ',cardClass:'調理'}},{1,{cardType:'シグニ',hasIcon:'アクセ'}}]` | `【LB】【ライフバースト】：あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳は両限定を表示せず不一致 |
| `WXDi-D04-016-BURST` | シグニとスペルを各1枚まで | `…transferGroups:[{1,{cardType:'シグニ'}},{1,{cardType:'スペル'}}]` | `【LB】【ライフバースト】：あなたのトラッシュからシグニ1枚までとスペル1枚まで対象とし、それらを手札に加える` | 一致 |
| `WXDi-P04-022-E1` | デッキ上2枚をトラッシュ。その後、赤と黒のシグニを各1枚まで | `SEQUENCE[TRASH{DECK_CARD,2},TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',color:'赤'}},{1,{cardType:'シグニ',color:'黒'}}]}]` | `【自】このシグニが場に出たとき：あなたのデッキの上からカードを2枚トラッシュに置く。そしてあなたのトラッシュから赤のシグニ1枚までと黒のシグニ1枚まで対象とし、それらを手札に加える` | 該当節は一致（【出】の表示名は既存 decompiler 規約） |
| `WXDi-P08-002-E1` | 黒ルリグ条件内でLv2シグニとLv3シグニを各1枚まで | 3つ目の `CONDITIONAL.then=TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',level:2}},{1,{cardType:'シグニ',level:3}}]}` | `【起】（メイン起動）：〈《無×1》〉あなたの場のルリグが3体以上いて、持つ色が3種類以上の場合、あなたの場に《白》のルリグがいるなら、あなたの《ガードアイコン》を持つシグニ(トラッシュ)1枚を手札に加える。そしてあなたの場に《緑》のルリグがいるなら、対戦相手のパワー10000以上のシグニ1体をバニッシュする。そしてあなたの場に《黒》のルリグがいるなら、あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳はLv2/Lv3を表示せず不一致 |
| `WXDi-P09-004-E1` | 宣言クラス・非ガードのLv1/Lv2/Lv3シグニを各1枚まで | `SEQUENCE[DECLARE_CLASS,TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',level:1,noGuard:true,classEqDeclaredClass:true}},{…level:2…},{…level:3…}]}]` | `【起】（メイン起動）：〈《無×1》〉クラス１つを宣言する。そしてあなたのトラッシュからシグニ1枚までとシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳は宣言クラス・非ガード・各レベルを表示せず不一致 |
| `WXDi-P11-056-E1` | 選択肢①でLv2以下の＜天使＞と＜古代兵器＞を各1枚まで | `CHOOSE.c0=TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',level:{max:2},cardClass:'天使'}},{1,{cardType:'シグニ',level:{max:2},cardClass:'古代兵器'}}]}` | `【起】（メイン起動）：〈《白×1》《黒×1》〉以下の2つから1つを選ぶ【あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える / あなたの場に《融合せし極門　ウトゥルス//メモリア》がいる場合、対戦相手のシグニ1体を手札に戻す】` | JSONは一致。逆翻訳はLv上限・両クラスを表示せず不一致 |

**見送り0件**。指定7効果はすべて既存機構で表現できた。触るな指定2効果は変更0：
`WXDi-P00-001-E1` は旧3連続アクションのまま、`WX24-P4-017-E2` は生成 JSON が旧専用分岐と完全一致。

### 別軸の食い違い・検証

- live JSON の今回の群条件以外で新たに見つけた原文差は **0件**。
- 🔴**上表の「逆翻訳が不一致」5件は Codex の報告時点の値**＝**同じ巡で Claude が `decompileEffects.ts` を直したので解消済み**。
  修正後の実出力（`npm run regen` 後）＝
  `WX16-026-BURST`「あなたのトラッシュから《ライズアイコン》を持つシグニ1枚までと＜武勇＞のシグニ1枚まで対象とし、それらを手札に加える」／
  `WXDi-P09-004-E1`「…レベル1の《ガードアイコン》を持たない宣言したクラスを持つシグニ1枚まで…（レベル2・3も同様）」／
  `WXDi-P11-056-E1`「…＜天使＞のレベル2以下のシグニ1枚までと＜古代兵器＞のレベル2以下のシグニ1枚まで…」＝**7効果とも原文と一致**。
- `npm run gates` 全緑＝golden **3177 → 3180 PASS / FAIL 0**、smoke **10721/10721・全0**、
  fuzz **CRASH/HANG/INVARIANT/EXPLOSION 0**、census高シグナル **11据置**、
  census:stubs **A0/C0**、manual-fields **0**、census:enginetext **A🔴130行据置**、
  lint **0 errors / 249 warnings（増減0）**。
- ベースライン `99dda6a11` との effectId 単位・キー順正規化済み機械 diff＝**変更7・追加0・削除0・予定外0**。
- 🆕**Claude 側の独立検証（`tmp_verify.mjs`＝キー順を正規化しない生文字列比較）では 変更8件**＝
  8件目は **`WXDi-D04-016-E2` の `activeCondition` の出現位置が動いただけ**で**中身は1バイトも同じ**
  （同カードが再生成された副作用）。⚠**「正規化済み diff で0」と「生 diff で0」は別の数字**なので、両方見ること。
- 🆕**反転確認は Claude も独立に再現**＝`applyRecoveryTransferGroups` の呼び出し1行を潰すと
  `npm run golden -- --only "O-188 第4"` が **1 PASS / 2 FAIL**（fresh assert と `WX24-P4-017-E2` 一致 assert）。復元後は全件 **3180/3180 PASS**。
- 🆕**逆翻訳の修正後に `npm run regen` → `npm run gates` を回し直して全緑**（golden 3180・census 11・
  census:stubs A0/C0・enginetext A🔴130行・lint 0 errors / 249 warnings）。
- 報告直前に `npm run build:effects` → `node scripts/heldReview.mjs` を再実行＝
  `_held_fresh.json` **76（増減0）**／`_partial_fresh.json` **10（増減0）**／`_idset_fresh.json` **7（増減0）**。
- 反転確認＝最終 root の一般規則呼び出しを一時無効化すると、新規3テスト中2本が FAIL：
  7効果の fresh assert は `WX16-026-BURST` で `transferGroups` 0件、`WX24-P4-017-E2` は旧単一filterへ退行。
  復帰後は新規3/3、全件3180/3180 PASS。
- 実機不要（§2.2）＝`src/data/`／`scripts/`／`public/data/`／`docs/` のみ。
  `src/engine/`／`src/types/`／`src/screens/` と新しい型・機構は変更していない。
- **実装は Codex（既定 `~/.codex`）／検証・逆翻訳の修正・簿記は Claude。**
  ⚠**`.codex-work` はこの巡の投入時点で利用上限**（`try again at 1:55 PM`）＝**1トークンも消費せず即 exit** したため、
  既定ホームへ投げ直した（前巡は「上限で途中放棄」だったが、今回は**着手前に落ちる**形＝残骸の判定が不要）。

## 2026-09-01：PLAN §5.3 `O-188` 第3バッチ — 回収の対象宣言がゾーンごと落ちて「無言 no-op」3効果

Codex は利用上限（`try again at 1:55 PM`）のまま復帰しなかったので **Claude が実装**した。

**真因**＝原文「あなたの〈トラッシュ／エナゾーン〉から〈X〉N枚(まで)を**対象とし**、〈任意コスト〉**てもよい**。
**そうした場合、それを手札に加える**」で、**対象宣言のゾーン・所有者・修飾が丸ごと落ち**、
帰結が既定の `TRANSFER_TO_HAND{source:{DECK_CARD, owner:'self', count:1}}` に化けていた。

🔴**「別のカードを拾う」ではなく、帰結が丸ごと起きない**＝`execTransferToHand` は `DECK_CARD` を
**`fromTop:true` のときしか扱わず**、それ以外は最後の `else` で `done(ctx)` に落ちる。
⇒ **コストを払っても何も起きない過小実行**。⚠**型は正しく値（ゾーン）だけが別物**なので、
逆翻訳・census・`census:goldentypes` のどれにも映らない。

**影響枚数**＝**3効果**（`WXDi-P01-070-E1`＝エナから＜武勇＞／`WXDi-P05-059-E2`＝トラッシュから赤のスペル／
`WDK08-Y14-E1`＝エナから＜水獣＞を1枚まで）。
**先行例と同じ作法**で `applyDroppedRecoveryDesignation` を新設した（`applyDroppedEnergyDesignation`＝続き375 に倣い、
**壊れている形＝`DECK_CARD` 既定に当たったときだけ**書き換える。既に正しいゾーンを持つ形は据置）。
📌`WXDi-P05-059-E2` は source が正しくなった結果、後段の `applyO96OptionalCostTargetFirst` が
**対象固定まで引き上げた**（規則が正しい入力を得ると自動で連鎖する）。

### 母集団の測り方
「原文に『デッキ』が一度も出てこないのに live に `DECK_CARD` が出る効果」で全数走査＝**4効果 / 4カード**
（CSV 総数 6712 を検算）。**うち3件を修正、1件は据置**。

🔴**据置＝`WX24-P2-054-E2`**（原文「対戦相手のシグニを**3体まで**対象とし、**それらのレベルの合計1につき**
《緑》を支払ってもよい。そうした場合、**それらをエナゾーンに置く**」）。
live は `ENERGY_CHARGE{DECK_CARD}`＝**自分のデッキからエナチャージする別の動作**。
帰結の型（`SEND_TO_ENERGY`）も、対象レベル依存コスト（`costColorsPerTargetLevel`）も別軸なので分けた。
**負方向テストを golden に置いた**（直したら赤くなる）。

### 検証コマンドと結果
- `npm run gates` 全緑＝**golden 3176 → 3177・FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **ブラスト半径**＝ベースライン `ae777cc69` との effectId 単位 機械 diff で **変更3件・追加0・削除0・予定外0**。
- 3帳票（`build:effects`→`heldReview` を報告直前に再実行した実測値）＝`_held_fresh` **76**／`_partial_fresh` **10**／`_idset_fresh` **7**（いずれも据置）。
- 🔴**反転確認（§5-29）**＝規則のマッチを無効化すると `WXDi-P01-070-E1` の **fresh assert が FAIL**。
  golden には live 側と fresh 側の**両方**の assert を入れてある。

**⚠実機は不要と判定**（§2.2）＝触ったのは `src/data/` ・ `scripts/` ・ `public/data/` ・ `docs/` のみ。
`src/screens/` も `src/engine/` も `src/types/` も触らず、新しい型・機構も足していない。

### 🔴この巡でいちばん価値があったのは「やらなかった判断」

**当初バッチ4は「`O-96` の did-it ゲートでない18件」＝任意コスト直後が `CONDITIONAL{IS_MY_TURN}` の群にする予定だった。**
署名で数えると **434効果**（AUTO 414 / MANUAL 20）あり、うち **99件が相手ターン側**（`ON_LIFE_BURST` 等）で、
PLAN §1 の「相手ターンに解決する効果では `IS_MY_TURN` の残留が致命的＝効果が丸ごと発火しない」という
記録と合わせると**大物に見えた**。

🔴**engine の消費地点を読んだら実害ではなかった**（CODEX_GUIDE §5-3-3′ の罠を踏む寸前だった）：
- `execUtils.ts:2706`＝`case 'IS_MY_TURN': return true;`（executor はオーナー視点なので**常に真のプレースホルダ**）。
- `effectExecutor.ts:4899`＝**任意コスト STUB の直後の `CONDITIONAL` は
  `['IS_MY_TURN','PAID_ADDITIONAL_COST']` を同一に扱う**（同じ形が `:4742` `:5438` にもある）。
- `triggerCollect.ts:1262` のターン判定は **`eff.condition`（効果レベル）だけ**を見ており、
  アクション内側の `CONDITIONAL` は見ない。

⇒ **この434件は「慣例エンコード」であって、大半は実害ゼロ。**
PLAN §1 が「致命的」と書いた2件（`WX15-053-TRAP` / `WXDi-P05-073-BURST`）は
**この interception が効かない位置**にあった個別事情だった、と読み替えるべき。
🔑**教訓＝「署名の件数」は実害の件数ではない。executor の分岐を読むまで着手しない。**
（同じ罠の前例＝続き603＝998効果と記録されていたが実害は29。）


## 2026-09-01：PLAN §5.3 `O-188` 第2バッチ — 暫定ガードを外して18効果 ＋ 自己回収の語順漏れ（過剰実行）

Codex が利用上限（`try again at 1:55 PM`）で使えなかったため **Claude が指示書どおり実装**した。

### 群A＝`O-96` の対象固定を塞いでいた2つの暫定ガードを外した（12効果）

`applyO96OptionalCostTargetFirst`（`src/data/effectParser.ts`）に、第1バッチで置いた
**「一度に載せすぎないための暫定ガード」が2つ**あった。

1. `outcome.source.filter?.hasGuard || noGuard` ＝**ガード軸だけ**に絞る。**意味的な根拠は無い**。
2. `allowedCostKeys` ＝ **`costColors` 単独 か `handDiscard` 単独のどちらか一方だけ**という排他 XOR。
   🔴**これが一番効いていた**＝`O-190` 第1バッチで `OPTIONAL_COST` の payload に
   `fieldTrash` / `selfTrash` / `handReveal` / `underAnySigniTrash` が入るようになった結果、
   **複合任意コストの効果が全部この XOR で弾かれていた**。

⇒ ①を撤去し、②を**許可リスト方式**へ広げた（`costColors` / `handDiscard` / `handReveal` /
`fieldTrash` / `fieldDown` / `selfTrash` / `energyTrash` / `underAnySigniTrash` / `charmTrash`）。
🔴**fail-closed は維持**＝**知らないキーが1つでも混ざれば通さない**。
⚠**対象のレベルで額が決まる系（`costColorsPerTargetLevel` 等）は許可リストに入れていない**＝倍率の意味が変わるので別軸。

**採用12効果**（全件 `heldReview --adopt` 経由・**1件ずつ原文照合済み**）＝
`WXDi-P04-022-E2` / `WXDi-P04-041-E1` / `WXDi-P04-041-E2` / `WXDi-P13-044-E1` / `WXDi-P14-041-E2` /
`WX24-P1-079-E1` / `WX24-P2-063-E1` / `WX24-P4-059-E1` / `WXK05-022-E1` / `WXK08-052-E1` /
`WDK11-011-E1` / `SPK01-12-E1`。

🔑**見積もりの訂正**＝投入前は「`TRANSFER_TO_HAND` の6効果」と見ていたが、**実際は12効果**だった。
②の XOR を外すと **`BANISH` / `BOUNCE` / `TRASH` / `POWER_MODIFY` 側の複合コスト効果も一緒に直る**
（`WDK11-011-E1`＝`fieldTrash` 単独コスト、`WXK08-052-E1`＝`underAnySigniTrash` 単独コストなど）。
⚠**予定外の5枚は「別の効果へ漏れた」のではなく「同じ欠陥の未計測分」**＝
兄弟効果への波及が無いことを **effectId 単位の per-effect diff で確認済み**（変化したのは意図した効果だけ）。

### 群B＝「**このカードを**トラッシュから手札に加える」の語順が丸ごと漏れていた（6効果）

🔴**実害＝過剰実行**。原文は**効果元自身の回収**なのに、live は `TRANSFER_TO_HAND{TRASH_CARD, filter:{}}`
＝**トラッシュのどのカードでも1枚回収できる**状態だった。

**受け皿も規則も既にあった**（`filter.thisCardOnly`／`execTransferToHand` の `TRASH_CARD` 分岐が消費）。
**漏れていたのは語順だけ**＝既存規則は「あなたのトラッシュから**このカードを**手札に加える」しか読まず、
「**このカードを**トラッシュから手札に加える」を落としていた。指示語も3通り（カード／シグニ／スペル）ある。

**修正6効果**＝`WXDi-P03-081-E1` / `WXDi-P08-075-E1` / `WXK01-041-E2` / `WXK10-030-E2` /
`WX24-P3-093-E2` / `WX16-028-E3`。
⚠**`WX16-028-E3` は Claude の母集団 regex が取りこぼしていた**（「このカードを**あなたの**トラッシュから」＝
指示語とゾーンの間に「あなたの」が入る形）。**実装の regex のほうが広かったので拾えた**＝
🔑**母集団の見積もりが実装より狭いことがある**という実例。

🔴**据置1件＝`WXDi-P09-043-E2`**（原文「この**シグニ**を…」）。**上流の別規則が先に食って**
`filter:{cardType:'シグニ'}` へ落ちるため、**トラッシュのどの＜シグニ＞でも回収できる過剰実行が残る**。
**負方向テストを golden に置いた**（直したら赤くなる）＝「直っている」と誤解しないため。

### 検証コマンドと結果
- `npm run gates` 全緑＝**golden 3174 → 3176・FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **ブラスト半径**＝ベースライン `21efff5cb` との effectId 単位 機械 diff で **変更18件・追加0・削除0**。
  内訳＝群A 12 ＋ 群B 6。**予定外0**（`WX16-028-E3` は上記のとおり母集団側の取りこぼしで、実装は正しい）。
- 3帳票＝`_held_fresh` 78 → **76**／`_partial_fresh` 10 → 10／`_idset_fresh` 7 → 7。
- 🔴**反転確認（§5-29）を2本とも取った**＝
  ①群Bの regex を旧語順へ戻すと `WXDi-P03-081-E1` の **fresh assert が FAIL**。
  ②群Aの `hasGuard/noGuard` ガードを戻すと `SPK01-12-E1` の **fresh assert が FAIL**。
- **既存 golden 3本を書き換えた**（§5-17′＝元の意図を確認してから）＝
  `§6.4 O-26` は**位置（steps[0]）で `OPTIONAL_COST` を取っていた**ので **id で引く形へ直した**
  （assert の意図は「位置」ではなく「エナと自己トラッシュが1つの任意コストに束ねられていること」）。
  据置契約2本は**削除せず、いま何を据置しているかへ書き換えた**（`CHOOSE` のネスト器と専用 STUB id）。

**⚠実機は不要と判定**（§2.2）＝触ったのは `src/data/` ・ `scripts/` ・ `public/data/` ・ `docs/` のみ。
`src/screens/` も `src/engine/` も `src/types/` も触らず、新しい型・機構も足していない。
今回広げた経路（`SELECT_TARGET_ONLY{TRASH_CARD}`）は**同日の `O-188` 第1バッチで実機 PASS 済み**。

### 新しく見つけた原文との食い違い（このバッチでは直さない＝§5.3 へ登録する）
1. `WXDi-P01-070-E1` — 原文「あなたの**エナゾーンから**＜武勇＞のシグニ1枚」なのに `source` が `DECK_CARD`。
2. `WXDi-P05-059-E2` — 原文「あなたの**トラッシュから**赤のスペル1枚」なのに `source` が `DECK_CARD`。
3. `SPK01-12-E1` — 原文「**このターンに手札から捨てた**＜水獣＞のシグニ」の限定が filter に無い＝**過剰実行**。
4. `WXK02-028-E1` — 原文「**あなたのセンタールリグと同じレベルの**シグニ」の限定が filter に無い＝**過剰実行**。
5. `WX24-P4-051-E2` — コスト「エナゾーンから**それと同じレベルの**シグニ1枚」の動的レベルが表せていない。
6. `WXDi-P04-022-E1` — 原文「トラッシュから**赤と黒の**シグニを**それぞれ1枚まで**」なのに live は**黒1枚だけ**
   （`transferGroups` を使えば表せる形）。
7. `WXDi-P09-043-E2` — 群Bの据置（上記）。
📌**`WXDi-P04-041-E1` と `-E2` の色フィルタ差は正しかった**（原文が別の【自】で、E2 側だけ「黒の」と書いてある）。
投入前に「疑義」として挙げていたが、原文照合で解消した。


## 2026-09-01：PLAN §5.3 `O-188` 第1バッチ — `SELECT_TARGET_ONLY` をトラッシュへ広げ、`TRANSFER_TO_HAND` を対象固定に対応

**真因**＝「あなたのトラッシュから〈X〉1枚を**対象とし**、《色》を支払ってもよい。**そうした場合、それを**手札に加える」
という原文に対し、live は**対象宣言を持たず、支払いのあとで対象を選んでいた**。
⇒ 🔴**コストを払ってから別のトラッシュ札を選び直せた**＝原文の「それ」が別のカードになる**過剰実行**。

⚠**この形は engine 側に4つの穴があり、どれか1つでも残すと「フィールドは付いたが無視される＝無言 no-op」になる。**
`O-96` 第1バッチ（続き763）で「3箇所」と記録していたが、実測すると**4箇所目が本体**だった。

| # | 穴 | 直した場所 |
|---|---|---|
| ① | `TransferToHandAction` に `targetsStored` / `fixedCardNums` が無い | `src/types/effects.ts`（`interface TransferToHandAction`） |
| ② | `execTransferToHand` に保存対象での絞り込みが無い | `src/engine/effectExecutor.ts`（`TRASH_CARD` 分岐） |
| ③ | `freezeStoredTargets` の `FREEZABLE` に `TRANSFER_TO_HAND` が無い | 同上（配列に1語追加） |
| ④ 🔴 | **`SELECT_TARGET_ONLY` が `SIGNI`/`LRIG`/`CENTER_LRIG_OR_SIGNI` 以外を `lastProcessedCards: []` で黙って落とす** | `src/engine/execStubPart1.ts`（`TRASH_CARD`/`owner:'self'` 分岐を追加） |

🔑**④の設計上の要点＝候補集めを `execTransferToHand` と同一の関数に切り出して共有した**
（`transferToHandTrashCandidates` を `effectExecutor.ts` に置き、`execStub` 経由で `execStubPart1` へ注入）。
**宣言時と実行時で候補がズレると「選んだのに動かない」**という、この機構特有の事故を構造的に防ぐため。
⚠**相手トラッシュ（`owner:'opponent'`）は今回入れていない**＝母集団に無いので fail-closed のまま。
⚠**`transferGroups` との併用は非対応**＝1対1対応が付かないので、**黙って束縛を捨てず**ログに残して降りる。

**影響枚数**＝**3効果**（`WXDi-P02-035-E2` / `WXDi-P05-042-E2` / `WX24-P4-044-E3`）。
parser 側は `O96_STORABLE_OUTCOMES` に `TRANSFER_TO_HAND` を足し、**第1バッチは `hasGuard`/`noGuard` 軸だけ**に絞った。
⚠**この絞り込みに意味的な根拠は無い**（一度に20効果を載せないための暫定ガード）＝**第2バッチで外す**。
母集団は「`O-96` 未固定署名のうち帰結に `TRANSFER_TO_HAND` を含むもの＝23効果、うち20効果が `TRASH_CARD`/`owner:self`」。

**検証コマンドと結果**
- `npm run gates` 全緑＝**golden 3168 → 3174（+6本）・FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **ブラスト半径**＝ベースライン `223db3b0d` との effectId 単位 機械 diff で**変更3件・追加0・削除0・予定外0**。
- golden の内訳＝①支払えば宣言した1枚だけが動く ②辞退すれば動かない ③払えない盤面では pay 不能
  ④**候補0なら任意コストを提示せず降りる**（④の無言 no-op 再発防止）
  ⑤🔴**`targetsStored` 省略時は従来どおり全候補**（省略をスキップに倒すと既存23効果が全滅する）
  ⑥fresh パース assert（§5-29）。

**🔴実機検証（§2.2＝`src/engine/` と `src/types/` を触り、新機構を足したので必須）**
`scripts/verifyBattleDrive.mjs` に `o188TrashRecoverPay` / `o188TrashRecoverSkip` を追加（`WX24-P4-044-E3`）。
- **PASS**＝宣言した `WD01-016#901` だけが手札へ／もう1枚のガード持ちはトラッシュに残留／
  非ガードは候補外／エナ 2→0／選択モーダルに「トラッシュから」が出る。
- **対照 PASS**＝辞退すれば手札・トラッシュ・エナが1つも動かない。
- 🔴**反転確認**＝`execTransferToHand` の絞り込み2行を外して再実行すると、
  **支払い直後の候補が `["WD01-016#901","WD01-017#902"]` の2枚に戻り FAIL**（＝旧挙動＝選び直せる）。
  戻したうえで `SKIP_BUILD=0` で再実行して ALL PASS を確認した。
- 🔑**この観測は golden では踏めない**＝`self_trash` スコープの選択モーダルが実 UI で開くかは BattleScreen 側の話。

**⚠この巡の運用上の実績＝Codex が2バッチ連続で利用上限に当たった。**
今回は **engine 実装と golden までを Codex が完成させた直後に exit 1**（`try again at 1:55 PM`）で、
**作業ツリーには途中変更が残っていた**（前回＝続き765 は clean だった）。⇒ **落ち方は2通りある**と記録する。
Claude が引き継いで ①コメント・テスト名の日本語化（Codex は英語で書く） ②実機シナリオ ③反転確認 ④簿記 を完了させた。


## 2026-09-01：PLAN §5.3 `O-190` 第1バッチ — 複合任意コストの消失した前半8効果を復元

原文が「〈別のコスト動作〉し《色》を支払ってもよい。そうした場合、～」なのに、live の
`STUB{OPTIONAL_COST}` が `costColors` しか持たず、原文より安いコストで本体を実行できた8効果を修正した。
CSV 12枚を BOM 除去・CardNum 先勝ちで読み、**カード総数6712**を検算したうえで、色支払い任意句493出現、
直前が別コスト動作のもの22出現／22カードを再現した。22件のうち既に正しい10件と受け皿のない4件は変更していない。

### 変更ファイルと理由

- `src/data/effectParser.ts` — 既存 `parseOptionalCostClauseFields` に限定文型を足し、最終 root の bare
  `OPTIONAL_COST{costColors}` だけへ前半payloadを合成した。表せない修飾が残れば `null` の原則は維持した。
- `scripts/goldenTest.ts` — 8効果の fresh/live、4受け皿の pay/skip/支払不能、4効果の did-it gate を固定した。
- `public/data/effects_WXDi.json` / `public/data/effects_WX24_26.json` — parser 出力を `build:effects` と
  `heldReview` で採用した。手編集ではない。
- `docs/decompile_sheet7.txt` / `docs/decompile_sheet8.txt` / `docs/decompile_sheet9.txt` /
  `docs/grouped_sentence_all.txt` — `npm run regen` による8効果の逆翻訳・下流帳票更新。
- `docs/_vocab_census.txt` — 修正済み効果が STUB/MANUAL 格納群から外れた結果を再生成した。
- `docs/_census_stubs.txt` — parser 行追加に伴う生成地点の行番号だけを再生成した。A群/C群の件数は不変。
- `docs/_held_fresh.json` / `docs/_held_review.txt` — fresh/live 収穫帳票を再生成し、4件のゲート差分を目視採用した。
- `docs/BUGFIXES.md` — 本報告。

### 既存受け皿と支払不能判定の実査

全キーは `resolveOptionalCostSpec`（`src/engine/execUtils.ts:388`、payload転送は407～410行）で
`OptionalCostSpec` に渡る。名前だけを借りず、候補数を判定する `canAffordOptionalCostSpec` と実際の支払い列を作る
`optionalCostPaySteps` の両方を確認した。

| effectId | 受け皿 | 支払不能を止める箇所 | 実支払い | 結論 |
|---|---|---|---|---|
| `WXDi-P16-050-E1` | `handDiscard` | `canAffordOptionalCostSpec`:467～471（手札をfilterし必要枚数を比較） | `optionalCostPaySteps`:623～628（`TRASH HAND_CARD`, `asCost:true`） | スペル0枚ならpay不可 |
| `WX24-P1-011-E1` | `handDiscard` | 同467～471 | 同623～628 | 手札0枚ならpay不可 |
| `WX25-P2-022-E1` | `handDiscard` | 同467～471 | 同623～628 | 手札0枚ならpay不可 |
| `WX25-CP1-041-E1` | `handDiscard` | 同467～471 | 同623～628 | ＜ブルアカ＞1枚以下ならpay不可 |
| `WX26-CP1-046-E1` | `handDiscard` | 同467～471 | 同623～628 | ＜プリオケ＞1枚以下ならpay不可 |
| `WXDi-P04-007-E1` | `fieldTrash` | 同527～534（場候補をfilterし必要数を比較） | 同668～676（`TRASH SIGNI`, `asCost:true`） | 白シグニ0体ならpay不可 |
| `WXDi-P06-055-E1` | `handReveal` | 同473～477（手札をfilterし必要枚数を比較） | 同629～635（`REVEAL HAND_CARD`） | ＜天使＞シグニ5枚以下ならpay不可 |
| `WXDi-P06-083-E1` | `underAnySigniTrash` | 同516～525。`fromThis:true` は source と同じ場の束だけを数える | 同660～667（`TAKE_FROM_UNDER_SIGNI`, `fromThis:true`） | このシグニの下2枚以下ならpay不可。他のシグニの下では代用不能 |

`TargetFilter.cardType:'スペル'` は既存型・`matchesFilter` の語彙であり、別キーの借用ではない。
`WXDi-P04-041-E1` が既に通って007が通らなかった理由は、既存 `parserUtils.tradeOptionalCost` が
「あなたの**他の**…シグニ」を直接 `fieldTrash{excludeSelf:true}` にする一方、007の
「あなたの**白の**シグニ」はそのregexに一致せず、従来は bare `costColors` 経路へ落ちたため。
`foldOptionalHandRevealCost` は「公開してもよい」という独立任意動作の木を折り畳む機構であるため、
今回の「公開し《色》を支払ってもよい」は複合句を一括解釈する `parseOptionalCostClauseFields` に⑥として足した。

### 採用8効果（effect単位）

以下の「逆翻訳」は `_decompile` の効果全体。JSON欄は生成された `OPTIONAL_COST` と、今回変更した場合は直後gateを示す。

1. `WXDi-P16-050-E1` — 原文コスト「手札からスペルを１枚捨て《青》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"],"handDiscard":{"count":1,"filter":{"cardType":"スペル"}}}`。
   逆翻訳全体「【自】あなたのアタックフェイズ開始時：対戦相手のシグニ1体を対象とする。そして《青》を支払い手札からスペルを1枚捨ててもよい。そして（コストを支払った場合）なら、それをバニッシュする」。
   コスト・gate・本体は原文と一致（接続順の表示差のみ）。
2. `WX24-P1-011-E1` — 原文コスト「手札を１枚捨て《白》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["白"],"handDiscard":{"count":1}}`。
   逆翻訳全体「【自】このルリグがアタックしたとき：あなたの場に＜アーム＞のシグニがいるなら、《白》を支払い手札からカードを1枚捨ててもよい。そうした場合、あなたのルリグ1体をアップする。そしてあなたのシグニ1体は能力を失い、新たに得られない（ターン終了時まで）」。
   コストは一致。本体gateが別枝の `IS_MY_TURN` であるため `PAID_ADDITIONAL_COST` 化は据置。本体の対象種別にも既存不一致あり（後述）。
3. `WX25-P2-022-E1` — 原文コスト「手札を１枚捨て《青》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"],"handDiscard":{"count":1}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのシグニがアタックしたとき：《once_per_turn》《青》を支払い手札からカードを1枚捨ててもよい。そして（コストを支払った場合）なら、あなたのシグニ1体に【アサシン:{\"isFrozen\":true}】を与える（ターン終了時まで）」。
   コストとdid-it gateは一致。対象の＜武勇＞filterには既存不一致あり（後述）。
4. `WX25-CP1-041-E1` — 原文コスト「手札から＜ブルアカ＞のカードを２枚捨て《青》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"],"handDiscard":{"count":2,"filter":{"story":"ブルアカ"}}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのアタックフェイズ開始時：《青》を支払い手札から＜ブルアカ＞のカードを2枚捨ててもよい。そして（コストを支払った場合）なら、対戦相手のシグニ1体をデッキの一番下に置く」。
   コストとdid-it gateは一致。対象選択時点には既存不一致あり（後述）。
5. `WX26-CP1-046-E1` — 原文コスト「手札から＜プリオケ＞のカードを２枚捨て《無》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["無"],"handDiscard":{"count":2,"filter":{"story":"プリオケ"}}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのルリグがアタックしたとき：〔範囲:any_ally〕《once_per_turn》《無》を支払い手札から＜プリオケ＞のカードを2枚捨ててもよい。そして（コストを支払った場合）なら、あなたのルリグ1体をアップする。そしてあなたのルリグ1体は能力を失い、新たに得られない（ターン終了時まで）」。
   コストとdid-it gateは一致。トリガー個体の照応には既存不一致あり（後述）。
6. `WXDi-P04-007-E1` — 原文コスト「あなたの白のシグニ１体を場からトラッシュに置き《白》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["白"],"fieldTrash":{"count":1,"filter":{"cardType":"シグニ","color":"白"}}}`。
   逆翻訳全体「【自】あなたのメインフェイズ開始時：対戦相手のシグニ1体を対象とする。そして《白》を支払ってもよい。そして（コストを支払った場合）なら、対戦相手のシグニ1体を手札に戻す」。
   live JSON・実行は原文と一致。逆翻訳器が `fieldTrash` を表示しないため、逆翻訳文だけは不一致。
7. `WXDi-P06-055-E1` — 原文コスト「あなたの手札から＜天使＞のシグニを６枚公開し《赤》《無》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","無"],"handReveal":{"count":6,"filter":{"cardType":"シグニ","story":"天使"}}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのアタックフェイズ開始時：対戦相手のパワー12000以下のシグニ1体を対象とする。そして《赤》《無》を支払い、手札から＜天使＞のシグニを6枚公開してもよい。そして（コストを支払った場合）なら、それをバニッシュする」。
   語順表示差だけでコスト・gate・本体は原文と一致。
8. `WXDi-P06-083-E1` — 原文コスト「このシグニの下からカード３枚をトラッシュに置き《黒》《無》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["黒","無"],"underAnySigniTrash":{"count":3,"fromThis":true}}`。
   逆翻訳全体「【自】このシグニがアタックしたとき：対戦相手のシグニ1体を対象とする。そしてこのシグニの下からカードを3枚トラッシュに置いてもよい。そして（コストを支払った場合）なら、それのパワーを－8000する」。
   live JSON・実行は原文と一致。逆翻訳器が同payloadと `costColors` を併記しないため、逆翻訳文だけは色支払いが欠落。

### 据置

- `WX15-053-TRAP` — 【トラップ】は `OptionalCostSpec` の対象外。据置。次に取るなら
  `fieldTrapTrash:{count,excludeSource}` のような専用キーを新設し、`canAffordOptionalCostSpec` で
  `field.signi_traps` を数え、`optionalCostPaySteps` から選んだtrapをtrashへ移す支払いaction/UIへ接続する必要がある。
- `WX22-018-E2` — いずれかのtrashから「コスト合計0のスペル」を除外する受け皿がなく、owner横断filterも必要。据置。
  次に取るなら `trashExile:{count,owner:'any',filter:{cardType:'スペル',costSum:0}}` 相当を新設し、
  `canAffordOptionalCostSpec` で両trashを走査、`optionalCostPaySteps` で選択付き `EXILE` を消費する。
- `WXK06-029-E1` — デッキ探索中にsource自身を公開する継続効果で、通常の任意コストではない。据置。
  `deckSearchRevealSelf` 相当の専用状態を設け、deck search の候補提示／resume地点で公開→色支払い→手札移動を消費する必要がある。
- `WXDi-P11-049-E1` — 自trashの＜毒牙＞シグニ3枚を除外する受け皿がないため据置。次に取るなら
  `trashExile:{count:3,owner:'self',filter:{cardType:'シグニ',story:'毒牙'}}` 相当を設け、
  `canAffordOptionalCostSpec` の自trash候補数判定と `optionalCostPaySteps` の選択付き `EXILE` に接続する。
- `WX24-P1-011-E1` のpayloadは採用したが、`OPTIONAL_COST` が `HAS_CARD_IN_FIELD` の内側、結果本体が
  別の `IS_MY_TURN` 枝にあるため、この1件のgate変更は据置。root直列形へ一般化して他効果を壊すより、別バッチで木を組み直す。

既に正しい10効果（`WXDi-D08-004-E1`, `WXDi-P03-035-E1`, `WXDi-P04-041-E1`,
`WXDi-P04-051-E1`, `WXDi-P12-044-E2`, `WXDi-P13-044-E1`, `WX24-P2-063-E1`,
`WX24-P2-086-E1`, `WX24-P4-059-E1`, `WX25-P3-019-E1`）は変更0。

### コスト条件以外で見つけた原文差

本バッチでは直していない。

- `WX24-P1-011-E1` — 原文は「このルリグ」が能力を失うが、live は `REMOVE_ABILITIES` の対象が自シグニ。
- `WX25-P2-022-E1` — 原文の結果対象は自分の＜武勇＞シグニだが、live の結果targetに `story:'武勇'` がない。
- `WX25-CP1-041-E1` — 原文は相手シグニをコスト提示前に対象とするが、live は支払い後に対象を選ぶ。
- `WX26-CP1-046-E1` — 原文の「そのルリグ」はアタックした個体だが、live は任意の自ルリグ1体を選べる。

また、前掲のとおり逆翻訳器には `fieldTrash` 非表示と
`underAnySigniTrash`＋`costColors` 併記漏れがある。いずれも今回生成したliveの実行意味とは別の表示欠落。

### 検証・ブラスト半径・帳票

- `npm run gates`: 全緑。typecheck PASS、golden **3168/3168・FAIL 0**（ベースライン3164から+4）、
  smoke **10721/10721・CRASH/HANG/INVARIANT 0**、fuzz **CRASH/HANG/INVARIANT/EXPLOSION 0**、
  census高シグナル **11**（投入前実数11、`BASELINE_HIGH` 12以下）、census:stubs **A群0/C群0**、
  manual-fields **0 effects / parseStatus違反0**、census:enginetext **A 130行/127ハンドラ**、
  lint **0 errors/249 warnings**（warning増減0）。
- ベースライン `7ba5cdcd0` の5 effects JSONとeffectId単位で比較。変更は
  `WX24-P1-011-E1`, `WX25-CP1-041-E1`, `WX25-P2-022-E1`, `WX26-CP1-046-E1`,
  `WXDi-P04-007-E1`, `WXDi-P06-055-E1`, `WXDi-P06-083-E1`, `WXDi-P16-050-E1` の**8件のみ**。
  期待漏れ0、予定外0。
- `_held_fresh.json`: 76→75カード、追加0・変更0、削除は stale な `WXK03-070` 1件。
  `_partial_fresh.json`: 9→9、追加/削除/変更0。`_idset_fresh.json`: 7→7、追加/削除/変更0。
  `_held_review.txt` は今回の4 gate差分を採用後に空になった。
- §5-19文字検査：変更した全13 tracked fileで、ベースライン比 `U+FFFD`・3文字以上連続の`?`・
  先頭BOMはいずれも **新規増0**。
- §5-29反転確認：`applyCompositeOptionalCostFields` の最終呼び出しを一時的に外し
  `npm run golden -- --only "O-190 第1バッチ"` を実行すると **4本中3本 FAIL**。
  fresh payload、fresh did-it gate、runtime支払不能の3本が赤くなった。呼び出し復帰後は4/4 PASS。

### やらなかったこと

- `src/engine/`, `src/types/`, `src/screens/`, `manualEffects.ts` は変更していない。新しい
  `EffectAction`、`StubAction`キー、STUB id、engine分岐、支払いUIを作っていない。
- 正解10効果、受け皿のない4効果、上記4件の別軸原文差へ変更を波及させていない。
- `effects_*.json` の手編集、`buildEffectsJson.ts` のforce-adopt、`stage2_closed.txt` 更新をしていない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` を編集していない。commit / push もしていない。
- ブラウザ実機確認はしていない。既存機構だけを使うdata/parser変更のため、fresh/runtime両方向goldenと
  smoke/fuzzを権威ある検証とした。

## 2026-09-01：意味照合 段2（支払いUI バッチ1）— `cost.energyTrashGroups` の支払いを2経路に通した

ユーザー決定で「支払いUI を実装する」方針に切り替えた最初のバッチ。残 OPEN **45 → 44**。

🔴**真因＝型はもとから在ったが、消費が `screens/battle/resonaSummon.ts`（レゾナ召喚）1箇所だけだった。**
そのため `WXK03-070-E1`（幻怪　モモタロ）の【出】「エナゾーンから《モモイヌ》1枚と《モモザル》1枚と
《モモキジ》1枚をトラッシュに置く：対象の相手シグニ1体をエナゾーンへ、対象の相手シグニ1体を手札へ」は
`costUnparsed:true` のままで、**発動コストが完全に無料**だった（エナを1枚も払わずに相手シグニ2体を触れた）。

🔑**支払い経路は2つあり、片方だけでは片肺になる**＝
①**通常召喚** … `SigniOnPlayCostModal`。`costs.ts` に `energyTrashGroupsSatisfied` /
  `canAddEnergyTrashGroupIndex` / `energyTrashGroupsAffordable` を新設して可否判定と選択ガードに配線した。
  ⚠**先着順の貪欲割り当てでは足りない**（フィルタが重なると厳しいグループが埋まらず「払えるのに払えない」になる）ので
  **総当たりの割り当て**にした。
②**効果で場に出た** … `optionalOnPlayCostStub` → `optionalCostPaySteps`。
  `StubAction` / `OptionalCostSpec` にキーを足し、**グループごとに1 TRASH ステップへ分解**して払う
  （1本の TRASH に潰すと「各1枚ずつ」が消えて**同名3枚でも払えてしまう**）。
  `canAffordOptionalCostSpec` にもグループ単位の可否を足した（合計枚数だけでは同名3枚を通す）。

🔑**golden の「明示保留リスト」から1件外した。** `(xxix)(2) 第15波後の明示保留4効果` は
**「既存語彙が不完全だから載せない」**という契約で、**「永久に据え置く」ではない**。
語彙を完成させたので `WXK03-070-E1` を外し、連動する計数（任意costあり 961→962／
任意costなし 21→20／据え置き 4→3）と、golden 側にコピーされている `SUPPORTED` 集合も同期した。
⚠**`SUPPORTED` は engine（`triggerCollect.ts`）と golden の2箇所にある**＝片方だけ足すと
「写せるかどうかが対応キー集合と一致」で落ちる（今回それで検出できた）。

影響枚数＝1効果 / 1カード。
🔴**実機必須**（`src/screens/` と `src/types/`・`src/engine/` を触った＝§2.2）。**未実施なので `V-105` を登録した。**
反転確認＝未実施。検証＝gates 全緑（**golden 3162 → 3164**・0 FAIL / smoke・fuzz 全0 / census 11 /
census-stubs A0・C0 / manual-fields 0 / census-enginetext A 130行 据置 / lint 0 errors・249 warnings）。


## 2026-09-01：PLAN §5.3 `O-96` 第3バッチ — 規則を「語尾の列挙」から「順序＋構造ガード」へ切り替え（11効果）

🔴**このバッチは Codex が `.codex-work` の利用上限に達して exit 1 で落ちたため、Claude が引き継いで実装した**
（ログ末尾＝`You've hit your usage limit ... try again at 8:43 AM`。**作業ツリーは clean・HEAD 不変で中途半端な変更は残っていなかった**）。

第1・第2バッチの原文 regex は**語尾を列挙**していた（`それを手札に戻す` ／ `バニッシュする` …）。
これが頭打ちになったことを実測で確認した＝**エナ側の語尾を `handDiscard` 側と同じだけ広げても新規は1効果だけ**
（該当5件のうち4件が `parseStatus:MANUAL`＝収穫マージ不可侵で parser では届かない）。
⇒ **原文 regex を `/を対象とし[、,][^。]*?てもよい。そうした場合[、,]/` の1本（順序だけ）に置き換え、
範囲は構造ガードで担保する方式へ切り替えた**（`applyO96OptionalCostTargetFirst`）。
構造ガード＝①root `SEQUENCE` ②`hasStoredTargetBinding` で二重適用を防ぐ
③コスト payload が `costColors` だけ／`handDiscard` だけ ④直後が did-it ゲート
⑤帰結が `O96_STORABLE_OUTCOMES`（`BOUNCE`/`POWER_MODIFY`/`BANISH`/`TRASH`/`TRANSFER_TO_DECK`/`SEND_TO_ENERGY`/`EXILE`）
かつ `target.type==='SIGNI'`。**この7型は型に `targetsStored` があり `freezeStoredTargets` の `FREEZABLE` にも入っている**
（どちらかが欠けると「フィールドは付いたが engine が無視する」＝無言 no-op になる）。

採用11効果＝`WX07-039-E1` / `WX15-053-TRAP` / `WXK08-070-E1` / `WXDi-P16-050-E1` / `WXK06-074-E1` /
`WDA-F02-17-E3` / `WXDi-P06-083-E1` / `WXDi-P11-049-E1` / `PR-K021-E3` / `WXDi-P04-007-E1` / `WXDi-P05-073-BURST`。
**`SEND_TO_ENERGY` は第3バッチで初めて対象に入った帰結型。**
影響枚数＝11効果 / 11カード（`O-96` の欠陥署名 **133 → 122**）。

🔴**採用前に11件すべての原文を読み、`IS_MY_TURN` → `PAID_ADDITIONAL_COST` の置換が正しいことを確認した**＝
「自分のターンなら」に相当する条件は1件も無く、すべて did-it ゲートの誤パースだった。
**特に `WX15-053-TRAP`（【トラップ】）と `WXDi-P05-073-BURST`（【ライフバースト】）は相手ターンに解決する**ので、
`IS_MY_TURN` が残ると**支払いゲートが永久に成立せず効果が丸ごと発火しない**。この2件は golden で明示的に固定した。
前置条件が**効果レベルの `condition`** にあるもの（`WXK08-070`＝`BEAT_CONDITION` / `PR-K021`＝`SELF_POWER_GTE`）も
落としていないことを golden で固定した。

反転確認＝未実施（実機不要判定のため）。代わりに**ブラスト半径をベースライン commit（`eedcb3ab5`）との
effectId 単位 機械 diff で検算**＝**変わったのは予定の11件のみ・予定外0**。
`build:effects` 2回の再実行で live JSON がビット同一に再生成されることも確認。

🔑**教訓＝「原文の語尾を列挙する」規則は必ず頭打ちになる。**
語尾や対象句の言い回しは無限に変奏されるが、**欠陥そのものは構造（対象固定の有無）で定義できる**。
⇒ **原文 regex は「順序の確認」だけに使い、範囲は live の構造ガードで縛るほうが、広くて安全。**
⚠**ただしこれは「ブラスト半径を毎回機械で検算する」運用とセット**でしか成立しない。

⚠🔴**採用の過程で、今回とは別軸の既存欠陥を3種類見つけた（いずれもベースラインから存在・未修正）**：
1. **複合任意コストの前半が丸ごと消えている**（→ `O-190`）＝原文「〈他のコスト〉し、《色》を支払ってもよい」の
   前半が live に無い。実例＝`WX15-053-TRAP`（他の【トラップ】1枚をトラッシュ）／`WXDi-P04-007-E1`（白のシグニ1体を場からトラッシュ）／
   `WXDi-P06-083-E1`（下からカード3枚をトラッシュ）／`WXDi-P11-049-E1`（トラッシュの＜毒牙＞3枚を除外）／
   `WXDi-P16-050-E1`（手札からスペル1枚を捨て）。**任意コストが原文より安い＝過剰実行側。**
2. **前置条件そのものが消えている**＝`WXK06-074-E1`（原文「このターンに対戦相手のカードがあなたの効果によって
   デッキに移動していた場合」が live に無い）。
3. **対象オーナーの誤パース**＝`PR-K021-E3`（原文「シグニ1体を対象とし」＝無修飾なのに `owner:'self'`）。


影響枚数＝21効果 / 21カード（`O-96` の欠陥署名 154 → 133）。
反転確認＝未実施。代わりに**ブラスト半径をベースライン commit（`2f2291b53`）との effectId 単位 機械 diff で検算**＝
**変わったのは予定の21件のみ・予定外0・群B 変更0**（Claude 側でも独立に再実行して一致を確認）。
`IS_MY_TURN` → `PAID_ADDITIONAL_COST` の置換は**21件すべて原文照合済み**（Claude 側でも5件を抜き取り再確認）＝
いずれも「トリガー＋対象とし＋任意コスト＋そうした場合＋帰結」で、**原文に「自分のターンなら」に相当する条件は無い**。
🔑🔴**教訓＝parser 規則の「適用地点」で対象範囲が変わる。**
当初 `parseActionText` の中で適用したところ、**`CHOOSE` 組み立て前の枝が一時的に root `SEQUENCE` に見えて群B へ当たった**。
⇒ **効果単位の最終 root へ適用地点を移して解決**。**この誤りは fresh 三帳票で検出した**＝
**ブラスト半径の検算はゲートでは代替できない**（ゲートは全部緑のままだった）。
⚠**別軸の残差を2件記録**＝`WXK10-029-E1`（原文「手札から**黒の**シグニを1枚捨てて」）と
`WXK10-040-E2`（同「**赤の**シグニ」）は、**旧 live の時点で `handDiscard.filter` から色指定が脱落している**
＝任意コストが原文より緩い（過剰実行側）。今回の対象固定とは別軸なので未修正（→ `O-189`）。

## 2026-09-01：PLAN §5.3 `O-96` 第2バッチ — 手札を捨てる任意コスト前に対象を固定（21効果）

原文が「相手シグニを対象とし、手札から条件付きカードをN枚捨ててもよい。そうした場合、それを…」の順なのに、live は `OPTIONAL_COST{handDiscard} → CONDITIONAL{IS_MY_TURN} → 帰結` となり、対象候補0でも支払いを提示し、支払い後に対象を選び直していた。第1バッチの parser 規則を一般化し、root `SEQUENCE` の21効果を `SELECT_TARGET_ONLY{abortIfNoCandidate:true} → STORE_LAST_PROCESSED_TARGETS → OPTIONAL_COST{handDiscard} → CONDITIONAL{PAID_ADDITIONAL_COST} → 帰結{targetsStored:true}` へ変更した。帰結は `POWER_MODIFY` 13／`BANISH` 4／`BOUNCE` 2／`TRASH` 2。`handDiscard` の `count`／`filter`／`selectionConstraint` は元オブジェクトをそのまま運び、`POWER_MODIFY` の delta と期間も維持した。

採用＝`WXK01-052-E1` / `WDK10-014-E1` / `WXDi-P03-084-BURST` / `WXDi-P05-082-BURST` / `WXDi-P06-084-BURST` / `WXDi-P07-093-BURST` / `WXDi-P08-047-E1` / `WXDi-P08-075-BURST` / `WXDi-P10-074-BURST` / `WXDi-P11-081-BURST` / `WXDi-P12-085-BURST` / `WXDi-CP01-049-BURST` / `WXDi-CP02-099-BURST` / `WXK10-029-E1` / `WXK10-040-E2` / `WD23-033-A-TRAP` / `WXDi-P04-038-BURST` / `WXEX1-43-E2` / `WXDi-P00-033-E1` / `WXK11-017-E2` / `PR-370-E1`。`IS_MY_TURN` は21件すべて原文のターン条件ではなく「そうした場合」の誤フォールバックだったことを効果単位原文で確認した。

据置＝`WXDi-D09-P17-BURST` / `WX25-CP1-004-E1` / `WXDi-P13-045-E1`（CHOOSE 枝内のネスト器）。当初 `parseActionText` 内で後段適用すると、CHOOSE 組み立て前の各枝も一時的に root `SEQUENCE` に見えて群Bへ当たることを fresh diff が検出した。規則を**効果単位の最終 root**でだけ適用する位置へ移し、三帳票と golden で3件不変を固定した。`TRANSFER_TO_HAND` / `O-188`、エナ軸の追加、engine/types/screens は未変更。

検証＝ベースライン `2f2291b53` と現行 live を effectId 単位・オブジェクトキー順正規化で比較し、論理差分は上記21件のみ（予定外0・群B0）。`npm run regen` で対象宣言→手札捨て→帰結の順と同型★0を目視。`build:effects` 連続2回後の全5 effects JSON は SHA-256 一致。`npm run gates` 全緑（typecheck、golden **3157/3157**、smoke 10721/10721・CRASH/HANG/INVARIANT 0、fuzz 全0、census 11、census-stubs A 0/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、lint 0 errors/249 warnings）。ネットワーク遮断の指示に従い実機確認は未実施。

影響枚数＝21効果 / 21カード（`O-96` 欠陥署名 **154 → 133**）。次の最大下位形は `TRANSFER_TO_HAND` 11効果（`O-188` のゾーン選択機構待ち）、次いでネスト器6効果。反転確認は「候補0で旧木だけが手札コスト CHOOSE を提示する」golden 対照で実施した。

## 2026-09-01：PLAN §5.3 `O-96` 第1バッチ — 任意エナ支払い前に BOUNCE 対象を固定

原文が「対戦相手のシグニを対象とし、《色…》を支払ってもよい。そうした場合、それを手札に戻す」の順なのに、live が `OPTIONAL_COST → CONDITIONAL → BOUNCE` となり、対象候補0でも支払いを提示し、解決時に対象を選び直していた。`effectParser.ts` にこの下位形だけの規則を追加し、root `SEQUENCE` の直接 BOUNCE 7効果を `SELECT_TARGET_ONLY{abortIfNoCandidate:true} → STORE_LAST_PROCESSED_TARGETS → OPTIONAL_COST → PAID_ADDITIONAL_COST → BOUNCE{targetsStored:true}` へ変更した。前置条件付き3効果と公開条件付き1効果は、その条件の内側へ4段をまとめて条件不成立時の挙動を維持した。採用は `WX20-054-E1` / `WXDi-P02-048-BURST` / `WXDi-P08-052-E1` / `WXDi-P14-052-E1` / `WX24-P3-047-E2` / `WX25-P3-055-E3` / `WX25-CP1-055-E1` の7件。build 前後の全 live effectId 差分はこの7件だけで、予定外0・群B変更0。

`TRANSFER_TO_HAND` は `targetsStored` の型定義・executor 対応・任意選択中の保存対象凍結が無いため、群Aの11効果（MANUAL `WXDi-P15-057-E2` を含む）はガードレールどおり据置。群B 6効果も CHOOSE / GRANT 内の別器なので据置。golden を3本追加し、代表3効果の JSON 順序、前置条件維持、候補0なら任意コストを提示しない実行挙動、TRANSFER 据置契約を固定した。`WXDi-P04-041-E1/E2` は同一カード内の別々の【自】能力で重複ではない。`WXDi-P05-059-E1` の TRASH は第1能力に対応しており正しいが、手札回収側 `E2` の source が `DECK_CARD` になっている別疑義を確認し、今回は変更していない。

検証：`npm run regen` で対象7件の逆翻訳が対象宣言→支払い→帰結の順になったことを目視。`build:effects` 連続2回後の全5 effects JSON は SHA-256 一致。`npm run gates` 全緑（typecheck、golden **3154/3154**、smoke 10721/10721・CRASH/HANG/INVARIANT 0、fuzz 全0、census 11、census-stubs A 0/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、lint 0 errors/249 warnings）。ネットワーク遮断の指示に従い実機確認は未実施。

影響枚数＝7効果 / 7カード（`O-96` の欠陥署名 161 → 154）。
反転確認＝未実施。代わりに🔑**ブラスト半径をベースライン commit との機械 diff で検算**した＝
`git show e85bfe6b8:public/data/effects_*.json` と現行を effectId 単位で突き合わせ、
**変わったのは予定の7件のみ・予定外0・群B 変更0**。**遅いレーン（parser）ではこれが主要な検証項目。**
🔑**教訓＝「型にフィールドが無いなら足さずに据置する」が正解だった。**`TRANSFER_TO_HAND` は
`targetsStored` を型（`effects.ts:1909`）にも `execTransferToHand` にも `freezeStoredTargets` の
`FREEZABLE`（`effectExecutor.ts:133`）にも持たない＝**フィールドだけ書いても無視されて無言 no-op**になる。
`O-128` 第4バッチの「収集契約」とまったく同じ罠で、**2バッチ連続で同じ形の落とし穴に当たった**。
⇒ **受け皿へ配線するときは「型・実行・凍結」の3層すべてに消費地点があるかを確かめる。**（→ `O-188` に登録）
⚠**別件の疑義を2つ記録**＝`WXDi-P04-041-E1/E2` は重複ではなく別々の【自】（自アタック時／相手アタックフェイズ開始時）。
`WXDi-P05-059-E2` は原文がトラッシュからの回収なのに `source` が `DECK_CARD`（未修正）。

## 2026-09-01：PLAN §5.3 `O-128` 第4バッチ — 【ソウル】／下カード／プレイヤー恒久の3効果を既存受け皿へ配線

`GRANT_ABILITY_INNER_TEXT` が無言 no-op だった `WXDi-D07-002-E1` を `GRANT_SOUL_HOST_ABILITY`、
`WXDi-P05-060-E1` の引用部分を新設 `WXDi-P05-060-E2` の `GRANT_SIGNI_ABOVE_ABILITY`、
`WXDi-P10-002-E1` を `GRANT_PLAYER_ABILITY` へ manual 配線した（新型・engine・parser変更なし）。
`WXDi-P05-060` は collector 契約に合わせ、付与宣言を `effectType:'CONTINUOUS'` の action 直下へ分離。
E1 は設置 STUB と既存 `POWER_MODIFY` を保持し、引用付与 STUB だけを除去した。
`WXDi-D07-002` は `ON_ATTACK_SIGNI`／`triggerScope:'self'`／`usageLimit:'once_per_turn'` と
ドロー1・エナチャージ1の `CHOOSE`、`WXDi-P10-002` は既存使用条件・コストを保持して
`ON_ATTACK_PHASE_START` の `CHOOSE` と `colorMatchesLrig:true` を付与した。`targetOwner` は省略＝自分。

据置＝`WXDi-P03-002-E1` は `ON_LRIG_GROW` は実在するが「そのターン最初のグロウ」を表す条件が無い。
`WXDi-P05-069-E2` は `collectAltAttackFlipSigni` → BattleScreen の裏向きアタック／ターン終了時復帰で既に動作し、
typed 化には「アタック置換＋N体まで裏向き＋この方法で裏向きにした集合の復帰」を運ぶ構造化ペイロードが要るため据置。
🔑これにより「STUB だが別経路で動く」在庫は既知4枚→5枚。live の当該 STUB 保持カードは **17→14**
（残14のうち既知5枚は動作済み）。

既知の未修正＝`WXDi-P05-060-E1` の `POWER_MODIFY{aboveSelf:true}` は原文では別の【常】だが、
今回は指示どおり既存起動 `SEQUENCE` 内のまま。今回採用した3効果の引用能力部分に近似はない。
逆翻訳は3受け皿を日本語化し、原文の timing／対象色／選択肢／恒久性を保持した。
実機はユーザー指示どおり未実施（data／golden／生成物のみ、新型・engine・screens変更なし）。
検証＝golden **3151/0（+3）**、smoke 10721/10721・CRASH/HANG/INVARIANT 0、fuzz 全0、
census 11、census-stubs 無言A 0/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、
lint 0 errors/249 warnings。`build:effects` 2回後の全5 effects JSON SHA-256 一致も確認済み。
影響枚数＝3効果（`WXDi-P05-060` は1効果を2効果へ分割）。`WXDi-P05-060-E2` の `filter:{color:"赤"}` と
`WXDi-D07-002` のソウル付与は**盤面に載ったときだけ効く**ので静的な該当枚数は出せない。
反転確認＝未実施（実機不要判定のため）。代わりに `build:effects` 2回の SHA-256 一致で
manual→live の正規経路を確認。🔑**golden は JSON の形ではなく「収集されること」を assert**＝
`collectGrantedFromUnderSigni` に赤シグニを上に載せた盤面を渡して能力が返ることと、
**赤でないシグニでは返らないこと**（否定側）まで見ている。
🔑**教訓**＝受け皿には「収集契約」があり、`GRANT_SIGNI_ABOVE_ABILITY` / `GRANT_SOUL_HOST_ABILITY` は
**`effectType:"CONTINUOUS"` の action 直下しか読まない**（`effectEngine.ts:7007` / `7094`）。
`SEQUENCE` のステップに入れると **JSON も逆翻訳も census も golden も緑のまま盤面が動かない**。
⇒ **受け皿へ配線するときは型名の一致だけでなく、収集側の走査条件まで読む。**
🔴**`O-128` は事実上ここでクローズ**＝残 14 のうち **5枚は engine の全文 regex で既に動作**
（`WXDi-P15-033`/`WXDi-P16-044`/`WX24-P2-030`/`SPDi43-01`/`WXDi-P05-069`＝`O-60` の在庫）、
**3枚は据置契約を golden 化済み**（`WD17-001`/`WX25-CP1-003`/`WXDi-P05-068`）、
**残る6枚はすべて新機構待ち**（レイヤー／トラップアイコン付与／序数／最初のグロウ／ほか2枚）。
**既存受け皿だけで取れる在庫は尽きた。**

## 2026-09-01：PLAN §5.3 `O-128` 第3バッチ — 【ライフバースト】付与3効果を既存受け皿へ配線

`GRANT_ABILITY_INNER_TEXT` が対象なし／未知引用で無言 no-op になっていた4効果を原文照合し、
`WXEX1-11-E1`・`WXDi-P08-008-E1` を既存 `GRANT_ALL_ZONE_LIFEBURST`、
`WX24-P3-022-E2` を既存 `SET_DISPAIR_BURST_GRANT` へ manual 配線した（新型・engine変更なし）。
`WXEX1-11` の＜水獣＞は CSV `CardClass` 列にあるため正準キー `cardClass:'水獣'` を使用し、
「＜水獣＞のカード」をシグニ限定にしなかった。`WX24-P3-022` は対象を任意コスト前に固定し、
`OPTIONAL_COST{handDiscard:{count:2}}` の支払い時だけ同じ対象を `DOWN` する。
`WXDi-P12-036-E1` は「チェックゾーンへ置かれた1枚目・2枚目」の序数を保持する受け皿が無いため据置。
既知近似＝`WX24-P3-022` の一時付与は自ターン中に読まれず次の相手ターンだけ読まれるため、
自ターン中に自分のライフがクラッシュされる場合だけ原文「このターンと次のターン」より弱い。
実機不要判定＝変更は data／golden／生成物のみで `src/screens/`・新型・新機構を変更していない。
実機はユーザー指示どおり未実施。検証＝golden 3148/0、smoke・fuzz 全0、census 11、
census-stubs A/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、lint 0 errors/249 warnings。
影響枚数＝直した効果は3件だが、`WXEX1-11` の `burstFilter:{cardClass:"水獣"}` は**CSV 実測158枚**に当たる
（`WXDi-P08-008`・`WX24-P3-022` はフィルタ無し＝全カード）。`O-128` の live 残 STUB は **20 → 17 カード**
（うち4枚は engine の `quotedText` regex で既に動作＝実質の未実装は13枚）。
反転確認＝**未実施**（実機不要判定のため）。代わりに `npm run build:effects` の再実行で live JSON が
ビット同一に再生成されることを確認済み（手編集ではなく manual→live の正規経路で届いている）。
🔑**教訓**＝登録票の「受け皿が無い」は誤りで、受け皿は型・engine・UI・逆翻訳・golden まで完成しており
生成側（parser/manualEffects）が繋いでいないだけだった。§4.1「まず受け皿を疑う」を機構 worklist にも適用する。
⚠**未処理の不整合1件**＝`WX17-036` は修飾なし（「＜怪異＞のシグニであるカードは…を持つ」）なのに
`burstAdditive` が無い＝今回確定したルールと矛盾する。スコープ外として未変更。

## 2026-09-01（続き760）：意味照合 段2 残 OPEN **67 → 46（-21）**＝実装20／較正1

ユーザー指示「さらに２０減らす」の1巡。§5.2（意味照合 段2）を **-21**（依頼は -20）まで消化した。
gates 全緑（typecheck / **golden 3139 → 3145（+6本）**・0 FAIL / smoke 全0 / fuzz 全0 / census 12/12（据置）/
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 1065→**1086**／残 OPEN 67→**46**（HIGH 39・MED 7・影響カード 43／効果 34）。
live の A/B 差分＝**15カード**（すべて意図したもの・**巻き添え0**）。

🔑**この巡の主産物＝「engine/JSON だけで閉じられる母集団」をほぼ使い切ったこと。**
続き759 の教訓（「取れる母集団は消費地点の層で決まる」）をそのまま延長して、
**コスト系 finding（`src/screens/` の支払いUIが消費地点）を今回も全部見送り**、engine/JSON だけで -21 を取った。
その結果、**残 46 の主成分は「コスト（支払いUI）」「複数体ライズ（`O-147`）」「ハーモニー」「ピース使用履歴」**に絞られた。
⇒ **次の巡は「engine/JSON で -N」を前提にできない。** コストを取るなら実機込みのバッチとして切る。

---

### ■ 新しく足した語彙（型＋評価器＋逆翻訳＋golden）

| 語彙 | 原文 | 🔴旧 live の挙動 |
|---|---|---|
| `EffectTarget.extraZones` | 「対戦相手の**場とトラッシュにある**シグニは能力を失う」 | 2つ目の【常】付与が丸ごと欠落（`rawText` に文字列としては残っていた） |
| `LEVEL_MODIFY` の `aboveSelf` 適用（`buildLevelMods`） | 「これの上にある《鰐渕アカリ（正月）》の**レベルを＋１**し」 | **レベル側は恒久 no-op**（最前面だけを走査するのでクラフト＝下段の能力は1つも拾われない） |
| `ChooseAction.noRepeat`（+`taken_choice_keys`） | 「以下の３つから**まだ選んでいないもの**１つを選ぶ」 | 毎メインフェイズ**同じ選択肢を取り続けられた**（このゲームの間ずっと有効な付与） |
| `SWAP_DECK_TOP_AND_LIFE` | 「対戦相手のデッキの一番上と対戦相手のライフクロス１枚を入れ替えてもよい」 | 3枝目が丸ごと欠落 |
| `TargetFilter.nameInCrossConditionOfLastProcessed` | 「それの**クロス条件に含まれる**シグニ」 | **デッキ／トラッシュの任意のシグニ**（クロスデッキを揃えるという役目が消えていた） |
| `AttachAcceAction.repeatWhilePossible` | 「エナゾーンから**好きな枚数**を**好きな数の**シグニの【アクセ】にする」 | `GRANT_KEYWORD{アクセ}`＝**エナのカードが1枚も動かない**真 no-op（主語も相手を含む） |
| `LookPickChainStage.gateZoneOnly` → `AddToFieldAction.gateZoneOnly` | 「シグニ１枚を**【ゲート】があるあなたのシグニゾーン**に出し」 | 空いているどのゾーンでもよかった（【ゲート】を作った意味が消える） |
| `ON_BANISH` の遅延収集地点（`collectBanishTriggers`）＋`trigger.notByOwnEffect` | 「このターン、あなたのシグニ１体が**あなたの効果以外によって**バニッシュされたとき」 | **設置しても永久に発火しない**（バニッシュを読む地点が無かった）＝アーツ本体が死んでいた |
| `GRANT_KEYWORD` の `target.type:'PLAYER'`（+`player_keywords`） | 「**対戦相手は**【みこみこ親衛隊】１つを得る」 | 任意のシグニ1体へ付与＝**トークンのコストを払う人が真逆**になりうる |
| 効果バニッシュへの `collectBanishPreventLoseAbility` 適用 | 「このシグニが**次に**バニッシュされる場合、バニッシュされない」 | **バトルバニッシュ経路だけ**が読んでいた（原文は発生源を限定しない） |
| `BlockActionAction.bothPlayers` | 「このターン、**シグニアタックステップをスキップする**」 | 効果の使用者だけを止める＝相手ターンに出たとき**相手のステップが飛ばない** |
| `PLACE_KEY_FROM_LRIG_DECK` | 「あなたのルリグデッキから《異体同心　華代》１枚を場に出す」 | `ADD_TO_FIELD{source なし}`＝**デッキの一番上を場に出す**別のカード |
| `TransferToDeckAction.orderChosenBy:'opponent'` | 「（**置く順番は対戦相手が決める**）」 | 一括処理＝engine の内部順で積まれる（デッキトップの並び＝次のドロー順なので実効果が変わる） |

### ■ 既存の受け皿へ配線しただけのもの

- `GAIN_BOND{source:'last_found'}`（`WXDi-CP02-005-E1`「この方法で公開した生徒との絆を獲得する」）
- `PLACE_LRIGS_UNDER_CENTER`＋`TRANSFER_TO_DECK{LRIG_TRASH_CARD→lrig_deck}`（`WXEX2-84`。同型の `WX05-001-E1` が前からこの形）
- `REPEAT{3}`＋`CHOOSE`（支払いの2択）＋`NEGATE_ATTACK{target:{type:'LRIG'}}`（`WXDi-P05-003-E1`＝**2 finding を1枚で**）
- `REVEAL_DECK_TOP`＋`DECK_TOP_MATCHES`（`WX19-061-E1` のスペル枝。⚠**この枝だけ `lastProcessedCards` を使えない**＝
  直前の `LOOK_AND_REORDER`（相手デッキを見る）が上書きするので、公開札がデッキトップに残る性質を使って判定する）

### ■ 較正（live を開いたら既に実装済みだったもの・1件）

`WXEX2-84-E1`「すべてのルリグをこのカードの下に置き」＝`STUB{LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS}`
（`execStubPart3.ts:4800`）が**ルリグを全部センタールリグの下へ置いていた**（claim が stale）。

### ■ golden：契約1本を更新・影武者1本を撤去

- 🆕**`task12 lxxiv残` の対照を更新**＝`WXDi-P09-031-E1` は `bothPlayers:true` を明示したので**両者**へ積む。
  ⚠**この試験の本来の目的（主語なしを一律 opponent へ倒さない）は残した**＝
  **フラグを外した対照が self だけに積む**ことを同時に assert する形へ組み替えた。
- `WDK03-001-E2`（【エナチャージ２】）は **parser 出力と実体同一**だったので manual から撤去（§6.4 O-42 の影武者禁止）。
- `BASELINE_ORPHAN_MANUAL` を 10 → 9 へ（払い戻し）。

### ■ 実機の判定

⚠**実機は不要と判定**（§2.2 の「触ったディレクトリ」ルール）＝`src/screens/` を1バイトも触っていない。
🔴**ただし今回は新機構が**多段対話**を2つ含む**（`ATTACH_ACCE.repeatWhilePossible` のループ／
`TransferToDeckAction.orderChosenBy` の 1体ずつ `opponentResponds`）＝**UI 層は golden で守れない層**なので、
**engine 側の resume チェーンを golden に固定した**（`--only "続き760"` の6本）。
UI の候補提示・選択リセットまで見たい場合は §5.1 へ `V-nn` として観測点を足すこと。

### ■ 検証コマンド

```
npm run gates            # 全緑（golden 3145 / 0 FAIL）
node scripts/archive/semanticAuditLedger.mjs     # 残 OPEN 67 → 46
npm run golden -- --only "続き760"                # 新語彙の3点セット（反転確認つき・6本）
```

## 2026-08-31（続き759）：意味照合 段2 残 OPEN **97 → 67（-30）**＝実装25／較正5

ユーザー指示「PLANをよみ、OPENを３０減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3139本・0 FAIL** / smoke 全0 / fuzz 全0 / census 12/12（据置）/
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 1035→**1065**／残 OPEN 97→**67**（HIGH 58・MED 9・影響カード 60／効果 51）。
live の A/B 差分＝**20カード**（すべて意図したもの・**巻き添え0**）。
⚠**実機は不要と判定**（§2.2）＝`src/screens/` を1バイトも触っていない（変更は `src/types/` `src/engine/`
`src/data/` `scripts/` `public/data/` だけ）。反転確認は golden 側に埋めた（下記）。

🔑**この巡の主産物＝「claim の半分が stale」という中間状態が母集団の主成分になってきた。**
較正5件のうち3件（`WX25-P1-022-E2` / `WXDi-P14-070-E1` / `WX16-Re19-E2`）は
**engine の実体は正しいのに逆翻訳の語や JSON のラベルが原文と違って見えていた**もので、
`WX24-P4-040-E2` `WXDi-P11-003-E1` `WXDi-P15-079-E1` のように **claim の前半だけ stale**という形も増えた。
⇒ **finding を読んだら「claim の各節」ごとに live を当てる**（1件まるごと真／偽で扱わない）。

---

### ■ 新しく足した語彙（型＋評価器＋逆翻訳＋golden）

| 語彙 | 原文 | 🔴旧 live の挙動 |
|---|---|---|
| `ZONE_COUNT_COMPARE.offset` | 「あなたの場のシグニが対戦相手より**２体以上少ない**場合」 | 条件が丸ごと落ちて**無条件バニッシュ**（同じ効果の④には条件が付いていた＝片枝の取りこぼし） |
| `TargetFilter.isAttacking` | 「**アタックしている**あなたのシグニのパワーを＋2000」 | **自分の全シグニを常時＋2000**（原文の3倍規模の常在バフ） |
| `TargetFilter.discardedFromHandThisTurn` | 「**このターンに捨てた**シグニ１枚を対象とし」 | トラッシュの**任意のシグニ**を釣れた |
| `TargetFilter.restrictionMatchesCenterLrig`（+`restrictionContains`） | 「**限定条件にあなたのセンタールリグのルリグタイプを持つ**カード」 | `cardType:'ルリグ'`＝**メインデッキにいないカード**を探す実質空振り |
| `trashedPick.dest:'field'` | 「**それを**トラッシュから場に出す」 | `ADD_TO_FIELD{TRASH_CARD}`＝**トラッシュの任意のシグニ**（「この方法で」の限定が消えていた） |
| `StubAction.declareFromLastProcessed` | 「（この方法で置いた5枚に）共通するクラスが3枚以上ある場合、**そのクラス**1つを選択する」 | クラス選択そのものが無く、手札に加えるのは**任意のシグニ** |
| `CHECK_ZONE_COUNT.filter` | 「対戦相手のチェックゾーンに**スペル**がある場合」 | 条件が丸ごと無く、**場に出るたび必ず**発動 |
| `GrantProtectionAction.duringOppTurn` | 「**対戦相手のターンの間**、対戦相手の効果を受けない」 | **ターンを問わない永続耐性** |
| `PlayFreeAction.source:'trash'` ／ `targetsLastProcessed` | 「あなたと対戦相手のトラッシュ…**（コストは支払う）**」／「**その**スペルを」 | 自分側が `PLAY_FREE_FROM_TRASH`＝**必ず無料**／照応が消えて**別のコスト1以下スペル**を使えた |
| `ATTACH_CHARM` の場ソース ＋ `toOther` | 「対戦相手のシグニ１体を**他の**シグニの【チャーム】にする」 | `charm.type:'SIGNI'` を書いていたのに engine に分岐が無く、既定枝（手札／エナ）へ落ちて**相手の手札のカードをチャームにしていた** |
| `Condition REFRESH_COUNT_THIS_TURN` | 「それが**このターンであなたの最初のリフレッシュ**である場合」 | 同じターンの**2回目以降でも**バニッシュ |

🔴**手札捨て枚数を候補数で頭打ちにした**（`execTrash` の HAND_CARD 分岐）＝
原文「手札を２枚捨てる。**（手札が１枚以下で使用した場合すべて捨てる）**」（`WDK05-T10-E1`）は
ルールの「できるかぎり行う」そのもの。旧実装は `count` をそのまま渡しており
`EffectInteractionModal.canConfirm`（選択数 ≧ count）が**候補不足でソフトロック**していた。
⚠**上限を下げるだけ**なので候補が足りている盤面は1バイトも変わらない（golden 3139 全緑で確認）。

### ■ 既存の受け皿へ配線しただけのもの（実装25件のうち14件）

- `GRANT_PROTECTION{target:{type:'LRIG'}, from:['any']}`（`WXK10-104-E1`＝主語がシグニ・耐性がルリグ限定の2軸ズレ）
- `GRANT_EFFECT{target:LRIG}` を `SEQUENCE` で3本（`WXK10-014-E1`＝3つの【起】のうち2つが欠落）
- `REVEAL_UNTIL{stopCondition:signiCount, restDestination:'trash'}`＋`SELECT_TARGET_ONLY`→`STORE`→`TRASH{targetsStored}`
  （`WXK06-030-E1`＝**3 finding を1枚で閉じた**。めくり切りが無い／対象が＜龍獣＞に限定されていた／「それ」の照応が消えていた）
- `TRANSFER_TO_DECK`→`LAST_PROCESSED_COUNT_GTE`→`ADD_TO_FIELD{TRASH_CARD}`（`WXK09-090-E1`＝
  旧 `ADD_TO_FIELD{source 無し}` は**デッキの一番上を出す**別のカードで、ゲートも「そうした場合」ではなく `IS_MY_TURN` だった）
- `CHOOSE` の2枝でプレイヤー選択を表す（`WXDi-P04-005-E1`「**あなたか対戦相手は**」＝旧は自分固定）
- `REVEAL_DECK_TOP`＋`LAST_PROCESSED_MATCHES`（`WX19-061-E1` の＜水獣＞ドロー枝）
- `LOOK_AND_REORDER{source:{location:'life_cloth'}}`（`WXDi-P03-004-E1`「ライフクロスの一番上を**見て**」）
- `TRANSFER_TO_HAND{source.owner:'opponent'}`（`WXK11-006-E1-G`＝取得元と受取人が自分になっていた＝**主語が真逆**）
- `cost:{discardAll,energyTrashAll}` 等は**支払いUI（`src/screens/`）が要る**ので今回は取らなかった（実機必須になるため）

### ■ 較正（live を開いたら既に実装済みだったもの・5件）

| finding | 実体 |
|---|---|
| `WX25-P3-053-E1`「次とその次に」 | `REPLACE_NEXT_DAMAGE_WITH_MILL` は `once:true` の予約を**配列に積む**＝2本並べれば2回ぶん |
| `WXK11-006-E1-G`「ルリグ１体とシグニ１体」 | `selectionConstraint.groups` で**既に分けられていた** |
| `WX25-P1-022-E2`「あなたと対戦相手のトラッシュ」 | 自分側の枝は前から在った（claim が stale。**同じ finding のもう1つの節「コストは支払う」は真バグ**） |
| `WXDi-P14-070-E1`「このピースの後に場に出たシグニにも影響」 | `duration:'NEXT_TURN'` は `reserveFieldGrant`＝**場レベル予約**（後から出たシグニにも効く） |
| `WX16-Re19-E2`「次の対戦相手のメインフェイズの間」 | `until:'NEXT_TURN'` の実体は `pending_lrig_limit_mod` → 次ターンの GROW→MAIN で `lrig_limit_mod` へ移り、それは**ターン開始時リセット**＝原文どおり。**逆翻訳の語だけ**「次のターンの間」→「次のメインフェイズの間」に直した |

### ■ golden の据置契約を1本卒業・1本を反転

- 🆕**卒業**＝`(B6) 据置契約: 別ゾーンを指す中間動作は owner だけ直さない（WXK06-030 のみ）`。
  据置理由「原文照合が未了」を解いたので、**3段（対象宣言→めくり切り→そうした場合）が揃っていること**を
  見張る側へ反転した（owner だけ直す退化はここで落ちる）。
- 🆕**反転確認を golden に埋めた**＝`WX16-Re09-E1` は耐性を見る窓を**相手ターン**へ移し、
  同時に「**あなたのターンには耐性を得ない**」も assert（`duringOppTurn` を落とすと必ず落ちる）。
- `(l) センタールリグ付与の入れ子化` は**判定を直した**＝`rawText` が **`undefined`（＝展開済みで消えた正常形）**を
  `?? ''` で空文字にしてから「句点のみ」判定に掛けており、**manual で `abilities` を直書きすると誤検出**していた。

### ■ 検証コマンド

```
npm run gates            # 全緑（golden 3139 / 0 FAIL）
node scripts/archive/semanticAuditLedger.mjs     # 残 OPEN 97 → 67
npm run regen            # 逆翻訳シート再生成（新語彙10本ぶんの日本語を確認）
```

## 2026-08-31（続き758）：意味照合 段2 残 OPEN **127 → 97（-30）**＝実装26／較正4

ユーザー指示「さらに３０減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3131→3139（+8本）**・0 FAIL / smoke 全0 / fuzz 全0 /
census 12/12（較正で据置）／census-stubs A🔴0・C0 / manual-fields 0 /
census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 1001→**1035**／残 OPEN 127→**97**（HIGH 81・MED 16・影響カード 79／効果 71）。
live の A/B 差分＝**24カード**（すべて意図したもの・巻き添え0）。

🔑**この巡の主産物＝「1つの受け皿に複数カードを束ねる」ほうが歩留まりが高いと分かったこと。**
新設した engine 語彙は7つだが、**26件の実装のうち19件は既存受け皿への配線**で、
そのうち **`LOOK_PICK_CHAIN` だけで4件**（前セッションの「配線だけ」型の再実証）。

---

### ■ 新しい語彙を足したもの（型＋評価器＋golden の3点セット）

| 語彙 | 原文 | 🔴旧 live の挙動 |
|---|---|---|
| `TakeFromUnderSigniAction.count:'ALL'` | 「このシグニの下からカードを**好きな枚数**」 | **9枚固定**＝原文に無い数字が上限を決めていた |
| `SelectionConstraint.distinct:'costSum'` | 「**それぞれコストの合計が異なる**スペル３枚」 | **任意のカード3枚**＝重い支払いが実質タダ |
| `triggerCondition.targetedByOpponent` | 「**対戦相手の**、能力か効果の対象になったとき」 | **誰の効果でも**発火（`WX25-P2-055` は自分で「バニッシュされない」を剥がす自滅） |
| `triggerCondition.centerLrigOnly` | 「あなたの**センタールリグ**がアタックしたとき」 | **アシストルリグのアタックでも**誘発 |
| `TargetFilter.classMatchesAnyFieldSigni` | 「あなたの場のいずれかのシグニと**共通するクラスを持つ**」 | 相手の**どのシグニでも**取れた |
| `$ref:'assist_lrig_level_sum'` | 「**アシストルリグのレベルの合計**１につき」 | 比例が落ちて**常に1枚** |
| `ATTACH_ACCE.targetsLastProcessed` ＋ `optional` | 「それを**この方法で場に出したシグニ**の【アクセ】にして**もよい**」 | `GRANT_KEYWORD{アクセ}`＝**エナのカードが1枚も動かない**（アクセ機構としては完全な no-op） |

🔴**fail-closed の向きを全部そろえた**＝`classMatchesAnyFieldSigni`（自分の場が空なら空ヒット）／
`distinct:'costSum'`（コストが読めない札が混ざったら不成立）／`ATTACH_ACCE.targetsLastProcessed`
（直前処理カードが場に居なければ候補0）。⚠**例外は `targetedByOpponent` だけ**＝`TargetedOrigin` が
持ち主を持たないので **origin のカードを両者のゾーンから探して**判定し、**見つからないときは従来どおり通す
（fail-open）**。ここだけ過小へ倒すと「誰の効果か分からない経路」で誘発が丸ごと消えるため。

---

### ■ 受け皿は在ったのに配線されていなかったもの（19件）

#### (a) 🔑**`LOOK_PICK_CHAIN` で4件**＝「N枚見て、1枚を〈行き先〉、残りを好きな順番でデッキの一番下」

- 🔴**`LOOK_AND_REORDER{canTrash:true}` は「何枚トラッシュに置けるか無制限」**（＝任意）で、
  「**必ず**1枚をトラッシュに置く」も「1枚を**デッキの一番上**に戻す」も表せない。
  受け皿は `LOOK_PICK_CHAIN` の `then:'trash'` / `then:'deck_top'`（どちらも実装済み）。
- `SPDi01-133-E1`（トラッシュ1＋デッキ上1）／`WX24-P3-078-E1`（デッキ上1）／`WXDi-P15-073-E2`（トラッシュ1）。
- 🔴**`WXDi-P10-075-E1` は別種の壊れ方**＝「見る」の後ろに `TRASH{SIGNI owner:'any'}` が付いており、
  **任意確認なしで場のシグニ1体（自分のでも）を強制トラッシュ**していた＝原文と別のカードだった。
  ⇒ `LOOK_AND_REORDER{count:1, canTrash:true}` 1本で「見て、置いてもよい」を表す。

#### (b) 「このシグニと共通する色を持たない他の＜天使＞がある場合」（2件）

- `SP27-012-E1` / `WX21-039-E1`＝**`else` 枝が無条件**で、原文の①（1枚引く／1枚エナ）が
  条件を満たさなくても必ず通っていた。受け皿は 2026-08-31 続き748 新設の
  `HAS_CARD_IN_FIELD{filter.colorNotMatchesSource, excludeSelf}`（`WX21-032-E1` と同じ式）。

#### (c) 単発の配線（残り13件）

- `PR-322-E2`＝「それを場に出す**か**手札から黒のシグニ1枚を場に出す」の**手札枝が丸ごと落ちていた**。
- `WD20-018-E1`＝選択肢②の全シグニトラッシュが**強制**（ライフ0のとき自分の盤面が必ず全滅した）。
- `WD21-017-E1`＝「**効果によって**バニッシュされたとき」の原因限定が無く、**バトルバニッシュでも発火**。
- `WX14-057-E1`＝条件成立後に対象を選ぶ形＝**条件を満たさないと対象宣言そのものが起きない**。
- `WDK15-008-E1`＝「シグニの**下から**2枚まで」が**シグニ本体を1体、必ず**トラッシュ（盤面が減る別物）。
- `WX21-046-E1`／`SP24-010-E1`／`WX13-052-E1`（「そうした場合、公開したシグニをダウンで場に出す」が
  丸ごと無く**自分をバニッシュして終わり**だった）／`WXDi-P00-021-E2`／`WX19-031-E1`／
  `WX24-P4-102-E1`／`WX25-P2-055-E2`／`WXDi-P05-008-E1`／`WXDi-D04-004-sub-E1`。

#### (d) 「あなたのレベル３のルリグ１体を対象とし」（ピース3枚）

- `WXDi-D03-011-E1` / `WXDi-D05-011-E1` / `WXDi-D06-011-E1`＝使用条件が「チーム全員レベル１以上」だけで
  **レベル1のセンターでも撃てた**。`GRANT_LRIG_ABILITY` の付与先は常にセンタールリグなので、
  **センターがレベル3以上であること**を使用条件に足すのが「レベル３のルリグ１体を対象とし」の忠実表現。
  ⚠**`eq 3` ではなく `gte 3`**＝原文は対象の資格であって上限ではない。
- あわせて `WXDi-D03-011-sub-E1` の【ダブルクラッシュ】付与先を **`SIGNI{thisCardOnly}` → `LRIG`** に直した
  （ルリグが得る能力なのにシグニへ付いていた）。

---

### ■ 較正（4件）＝live を開いたら既に実装済みだったもの

- **`WD06-009-E2` ×2 ／ `WX20-043-E1`**＝自分のライフクラッシュ置換は
  `STUB{SELF_CRASH_TO_TRASH_AND_REFILL}` として 2026-08-31 続き749 で**完全に実装済み**だった
  （`BattleScreen.tsx:12514` でエナ送りをトラッシュへ差し替え、`:12649` で**置換が乗った回だけ**
  デッキ上をライフへ足し、回数を1つ消費する）。
- **`WDK05-T09-E1-G`**＝`actionId:'GUARD_LV1'` は `makeGuardLevelBlocker` が
  **正規表現 `^GUARD_LV(\d+)` で消費済み**だった。
  🔑**教訓＝「リテラルで grep して0件だから未実装」と判断しない。**
  受け皿が**正規表現で id を解釈する**形だと、文字列検索では絶対に見つからない。
  この型は `census:enginetext` が測っている「engine が regex で意味を決めている箇所」の裏返しでもある。

---

### ■ 計器・契約の更新（どちらも「実装したら必ず動く」印）

- 🔴**据置契約 golden を1本反転**＝`段2 第33バッチ 据置契約: PR-322-E2 は手札から出す選択肢が未表現` は
  「実装したら落ちるトリップワイヤ」なので、**消さずに期待値を反転**して
  「トラッシュ枝と手札枝の二択になっている」を要求する契約へ書き換えた（PLAN §5.2 の規約どおり）。
- 🔴**census の較正を1箇所広げた**＝`ON_GUARD` ＋ `lrigAttackNoDamage` を「アタックしたとき」の
  正表現と認める既存規則は主語が**「（センター）ルリグN体」しか剥がせず**、
  「**この**ルリグがアタックしたとき、そのアタック終了時、」（`WXDi-D04-004-sub-E1`）を
  同じ受け皿へ配線した瞬間に高シグナルへ昇格していた（12→13）。
  ⚠**ベースラインを上げずに較正で戻した**＝退化ではなく**計器の穴**（同じ族の綴り違い）。

---

### ■ 検証コマンド／反転確認

```
npm run typecheck && npm run build:effects
node scripts/heldReview.mjs --adopt <22枚>
npx tsx scripts/syncManualLive.ts WD20-018 WX25-P2-055   # 既存 manual を書き直した2枚はこちら
npm run regen && npm run gates
node scripts/archive/semanticAuditLedger.mjs             # 127 → 97
```

**反転確認（実測4件）**＝該当分岐を `if (false && …)` にすると、
- `targetedByOpponent` → `✗ 🔴自分の手札のカードが対象化したときは誘発しない（旧バグ）`
- `centerLrigOnly` → `✗ 🔴アシストルリグのアタックでは誘発しない（旧バグ）`
- `distinct:'costSum'` → `✗ 🔴コスト合計が同じ2枚は選べない`
- `classMatchesAnyFieldSigni` → `✗ 🔴自分の場が空なら誰も対象にならない`

⚠🔑**収穫マージの関門を2種類とも踏んだ**＝新規カード22枚は `heldReview --adopt` で届いたが、
**既に `manualEffects.ts` に定義があるカードを書き直した2枚（`WD20-018` / `WX25-P2-055`）は
`build:effects` では live に届かない**（live 側の MANUAL/PARTIAL が不可侵）。
⇒ `npx tsx scripts/syncManualLive.ts` が要る。**「既存 manual の書き直し」と「新規 manual」は経路が別。**

---

## 2026-08-31（続き757）：意味照合 段2 残 OPEN **157 → 127（-30）**＝実装18／較正12

ユーザー指示「PLANを読み、OPENを30減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3126→3131（+5本）**・0 FAIL / smoke 全0 / fuzz 全0 /
census 12/12 据置 / census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 970→**1001**／残 OPEN 157→**127**（HIGH 101・MED 26・影響カード 106／効果 98）。
live の A/B 差分＝**15カード**（意図した14＋同文型の拡張採用 `WXDi-P07-002` 1）。

🔑🔴**この巡の主産物＝「受け皿は在るのに、生成側の入口が2つあって片方だけ配線されていなかった」型を見つけたこと。**
新設した engine 語彙は **2つだけ**（`SelectionConstraint.same:'power'` と `TargetFilter.powerEqTrigger`）。
残り16件はすべて**既存受け皿への配線**（`countChoose` ／ `ENERGY_CHARGE_PER_LRIG_LEVEL` ／
`ATTACH_ACCE.fromEnergy` ／ `GRANT_PLAYER_ABILITY` ／ `GRANT_LRIG_ABILITY` ／ `OR`＋`HAS_CARD_IN_FIELD` ／
`LRIG_LIMIT_MODIFY{owner:'any'}`）。

**⑤実機の判定＝不要**（PLAN §2.2 の表）。⚠**`src/screens/battle/lrigLimit.ts` を1行だけ触った**（`owner:'any'` を
受けるための述語拡張）が、**UI を持たない純関数**で、golden が `computeEffectiveLrigLimit` と
`collectOppDeclaredLrigLimitDelta` を**直接呼んで両側を assert**している。新しい UI 面は増えていないので
ドライバは書かず、観測点だけ §5.1 `V-104` に登録した。

---

### ■ 新しい語彙を足したもの（型＋評価器＋golden の3点セット）

#### (a) `SelectionConstraint.same:'power'`（2 findings＝`WX13-013-E1` / `WX21-010-E1`）

- **真因**＝「**同じパワーを持つ**シグニ３体を対象とし、それらをバニッシュする」の相互制約が
  **語彙ごと無く**、`{type:'SIGNI',owner:'any',count:3}` の裸だった＝**盤面のどの3体でも**薙ぎ払える
  過剰効果（赤1エナの全体除去）。`WX21-010` も同様に「相手のどの2体でも」だった。
- **配線先**＝`src/types/effects.ts`（`same` の union に `'power'`）／`execUtils.ts:satisfiesSelectionConstraint`
  （`canAddToSelection` は同関数へ委譲済みなので逐次選択にも自動で効く）／`decompileEffects.ts` の
  `共通する◯を持つ` 表示。
- ⚠**印刷パワーで比較する近似**＝`satisfiesSelectionConstraint` は `cardMap` しか受け取らないので実効パワーを
  見られない（既存の `same:'level'` と同じ層）。パワー不明（`Power` が数値でない）は**不成立**へ倒した（fail-closed）。
  **制約が1つも無い現状より厳密に狭い**ので採用した。
- **影響**＝2効果。

#### (b) `TargetFilter.powerEqTrigger`（2 findings＝`WX17-046-E2` / `WX24-P4-003-E1`）

- **真因**＝「**バニッシュしたシグニと同じパワーを持つ**対戦相手のシグニ1体」／「トラッシュから**それと同じ
  パワーの**シグニ1枚」のパワー条件が落ち、**相手のどのシグニでも**連鎖バニッシュ／回収できた。
- **配線先**＝`effectExecutor.ts:resolveDynamicFilter`（`triggeringCardNum` → 無ければ `lastProcessedCards[0]` を
  基準に `powerRange.min/max` を同値へ解決）／`decompileEffects.ts` の `filterJa`。
- 🔴**参照不能時は空ヒット（fail-closed）**にした。兄弟の `powerLteTrigger` は歴史的に fail-open だが、
  **同値条件を fail-open にすると「同じパワー」の限定が丸ごと消えて過剰実行に裏返る**（§5-3′′）。
- **影響**＝2効果。

---

### ■ 受け皿は在ったのに配線されていなかったもの（engine 変更なし／parser・JSON だけ）

#### (c) 🔴**CHOOSE ヘッダの入口が2つあり、素の入口だけが `countChoose` を捨てていた**（5 findings・実質6効果）

- **真因**＝`parseChooseHeaderCount` は「あなたのセンタールリグのレベル１につき１つまで選ぶ」を
  正しく `countChoose{$ref:'center_lrig_level'}` へ解いていたが、**それを使う入口が2つ**あり、
  `buildChooseFromHeader`（＝ヘッダが文フィルタで落ちた形の救済路）だけが `countChoose` を載せ、
  **素の「先頭がヘッダ」入口（`effectParser.ts` の `headM` ブロック）は `count`/`upTo` しか読まずに捨てていた**。
  ⇒ 該当カードは**常に1つ固定**（センターLv4でも1つしか選べない）に潰れていた。
- 🔑**教訓＝「受け皿が在るのに届かない」を疑うときは、受け皿の *呼び出し元* を全部数える。**
  今回は生成側の関数（`parseChooseHeaderCount`）まで正しく、**その戻り値の一部を捨てる呼び出し元**が犯人だった。
  受け皿・生成関数・呼び出し元の3層を分けて見ないと「実装済みなのに直らない」に見える。
- **影響**＝`WXDi-P06-003-E1` / `WXDi-P14-003-E1` / `WXDi-P07-002-E1`（同文型の拡張採用）。

#### (d) 「この効果を〈誰か〉のセンタールリグのレベルと**同じ回数**行う」（2 findings）

- **真因**＝`WXK10-104-E1` / `WXDi-D05-011-sub-E1` の反復指定が丸ごと落ちて**常に1回**だった。
- **書き方**＝`countChoose{$ref}`＋`allowRepeat`（原文の注記が「同じ選択肢を選んでもよい」なので
  「1回の選択をN回実行」ではなく**選択数そのものがN**）。⚠`upTo` は立てない（必須回数）。
- 🔴**置く場所を3回間違えた**＝①`applyDynamicActionCountBatch35` の中は guard regex に文型が無くて素通り
  ②その後ろの `markRemainderReorder` / `rewriteCatchAllStubs` が action 木を作り直すので先に書くと落ちる
  ⇒ **`parseCardEffects` の最後（カード単位の後段のいちばん後ろ）**に置いた。
  ⚠さらに `currentSourceTexts` にこの effect が載らないカードがある（`WXK10-104-E1`）ので、無ければカード全文へ落とす。
- ⚠**デバッグ中に自分で偽の結論を出した**＝probe が `JSON.stringify(...).slice(0,1200)` で切れており、
  末尾に付く `countChoose` が見えず「効いていない」と誤読した。**出力を切り詰めた計器で「無い」と判断しない。**

#### (e) `ENERGY_CHARGE_PER_LRIG_LEVEL` の単独形（1 finding＝`WXDi-P14-004-E1`）

- **真因**＝受け皿は「レベル1につきN枚引く**か**レベル1につき【エナチャージM】」の**二択形からしか**合成されず、
  単独形は下の【エナチャージ】ショートハンドに食われて**レベルに依らない固定2枚**へ潰れていた。
- **配線先**＝`parseSentencePart1.ts`（二択形の直前に単独形を1本。ドロー単独形も同じ穴なので同時に配線）。

#### (f) `ATTACH_ACCE.fromEnergy`（1 finding＝`WX20-002-E2`）

- **真因**＝「あなたのエナゾーンから《アクセアイコン》を持つカード1枚を…シグニの【アクセ】にする」が
  `GRANT_KEYWORD{keyword:'アクセ'}` に化けており、**エナのカードは1枚も動かず**場のシグニに語だけが付いていた
  （＝アクセ機構としては完全な no-op）。受け皿は 2026-08-31 続き748 で新設済みだった。

#### (g) `LRIG_LIMIT_MODIFY{owner:'any'}`（1 finding＝`WXK11-013-E3`）

- **真因**＝「センタールリグのリミットは１減る。**（お互いのセンタールリグに影響する）**」が `owner:'self'`＝
  **自分のリミットだけ**が減っており、相手の盤面を縛るという札の主目的が丸ごと消えていた。
- 🔴**注記は `stripRuleParens` で文レベル parser へ届く前に消える**（`（…）` を全部落とす）。
  ⇒ 文レベルでは読めないので、**カード全文が見える後段**（`parseCardEffects` の末尾）で刻む。
  **最初に `parseSentencePart2` へ書いた規則は永久に発火しないコードだった**ので撤去した。
- **engine 側**＝`effectEngine.ts:collectLrigColorAndLimitMods`（自分側）と
  `screens/battle/lrigLimit.ts:collectOppDeclaredLrigLimitDelta`（対面側）の**両方**が `'any'` を拾う。
  **片方だけ直すと「自分だけ／相手だけ」に化ける。**

#### (h) 使用条件の OR（1 finding＝`WXDi-P08-068-E1`）

- **真因**＝「3種の指定シグニが場にある**か**、相手の手札が1枚以下」が `HAND_COUNT{eq:1}` の**片枝だけ**に潰れ、
  **0枚では撃てず、指定シグニが並んでいても撃てない**という両方向に外れた条件だった。
  受け皿（`OR` ＋ `HAS_CARD_IN_FIELD{filter.cardName}`）は既存。`manualEffects.ts` へ手書き。

#### (i) 帰属の付け直し2件

- `WXK03-008-E3`＝「あなたのセンタールリグは以下の能力を得る」の2本目【自】が**キー自身の独立した自動能力**
  として立っていた ⇒ 同カードの E1 が既に使っている `GRANT_LRIG_ABILITY` の中へ入れ子にした。
  ⚠**golden のラチェット `ON_TURN_END` 母数 187→186 が動く**（トップレベルの ON_TURN_END が1件減っただけで
  挙動は消えていない）＝理由を書いて基準を下げた。
- `WXDi-P11-003-E1`（ピース）＝①使用条件（ルリグ3体で3色以上）が無い ②「このゲームの間の付与」が落ちて
  **使用時に1回だけ選択肢を即時実行** ③原文に無い `GRANT_KEYWORD{keyword:'使用条件'}` を自分のシグニへ付与
  ④選択肢③の移動元が**場のシグニ**（トラッシュではない）＝自分の盤面を自らデッキへ戻していた。
  ⇒ `GRANT_PLAYER_ABILITY{permanent}` ＋ `ON_MAIN_PHASE_START` ＋ `FIELD_LRIG_COLOR_COUNT{minLrigs:3}` で書き直し。
  ⚠**「まだ選んでいないもの」＝選択履歴による除外は未実装**（parser 側の既存注記と同じ近似）＝`PARTIAL` にして
  finding「メインフェイズ開始時」は**閉じずに残した**（5/6 だけ閉じた）。

---

### ■ 較正（12件）＝live を開いたら既に実装済みだったもの

`WXDi-P06-077-E1`×3・`WXDi-P06-077-sub-E1`・`WXDi-P03-071-BURST`・`WX25-CP1-TK2A-E2`・`WXDi-P06-035-E2`・
`WXEX1-14-E2`・`WX25-CP1-008-E1`・`WXDi-P07-071-E1`・`WX24-P3-055-E2`・`WXK11-006-E4`。

🔑**続き756 の教訓（「live を開いた効果はその場で claim を読み直す」）がそのまま効いた。**
⚠**`semanticAuditRecheck.mjs` の LCS 候補28件とは1件も重なっていない**（あちらは quote と逆翻訳の
最長共通部分文字列で並べるだけなので、「claim の軸が別」の偽陽性が過半）。
🔑**代わりに効いたのは「1効果に複数 finding が付いているカードを開く」**＝`WXDi-P06-077` は
finding 4本のうち**4本とも**が stale だった（E2 が独立した【起】として既に在り、`thisCardOnly` も
`美巧` 条件も配線済み）。**同じ効果の finding が3本以上あるカードは、まとめて古くなっている可能性が高い。**

---

### ■ 検証コマンド／反転確認

```
npm run typecheck && npm run build:effects && node scripts/heldReview.mjs --adopt <10枚> && npm run regen && npm run gates
npm run golden -- --only "same:power" --only "powerEqTrigger" --only "LRIG_LIMIT_MODIFY owner:any" \
                 --only "countChoose" --only "ENERGY_CHARGE_PER_LRIG_LEVEL"
node scripts/archive/semanticAuditLedger.mjs      # 157 → 127
```

**反転確認（実測）**＝
- `satisfiesSelectionConstraint` の `same:'power'` 分岐を `if (false && …)` にすると
  `✗ 🔴パワーが違う2体は選べない` で FAIL。
- `resolveDynamicFilter` の `powerEqTrigger` 分岐を同様に無効化すると
  `✗ 直前処理(12000)と同じパワーは候補` で FAIL。
- `WXDi-D05-011` の golden には**相手センター不在なら0回＝1枚も引かない**という反証を足した
  （これが無いと「レベル比例」を足したつもりで常に1回に潰れていても緑のままになる）。

⚠**収穫マージの関門**＝今回の14カードのうち**10枚が held に落ちた**（`docs/_held_fresh.json`）。
`build:effects` だけでは live に届かないので `node scripts/heldReview.mjs --adopt <CardNum,…>` が要る。
**「parser を直したのに live が変わらない」ときは真っ先にここを見る**（CLAUDE.md の3ファイル）。

---

## 2026-08-31（続き756）：意味照合 段2 残 OPEN **187 → 157（-30）**＝実装21／較正9

ユーザー指示「PLANを読み、OPENを30減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3123→3126（+3本）**・0 FAIL / smoke 全0 / fuzz 全0 /
census 12 / census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 939→**970**／残 OPEN 187→**157**（HIGH 127・MED 30・影響カード 124／効果 120）。

**⑤実機の判定＝不要**（PLAN §2.2 の表）。触ったのは `src/data/` `src/engine/` `public/data/` `scripts/` だけで
**`src/screens/` は1バイトも触っていない**。新設した語彙（下記）は**engine を実走させる golden で両方向を固定し、
修正を外すと FAIL することを実測**した（下の「反転確認」）。⚠ただし **UI に新しく面が出る2件**
（【ライド】の【起】ボタン9枚／`split_top_bottom` の振り分けUI 4枚）は**どの計器も見ていない**ので
§5.1 に `V-101` として観測点を登録した。

---

### ■ 新しい語彙を足したもの（型＋両評価器＋golden の3点セット）

#### (a) `TargetFilter.hasUnderCards` / `hasAttachedOrUnder`（3 findings）

- **真因**＝「**下にカードがある**あなたの＜解放派＞のシグニ1体」（`WXDi-P15-063-E1`）／
  「**カードが付いているか下にカードがある**対戦相手のシグニ1体」（`WXDi-P11-079-E1`）／
  「**下にカードがある**あなたのシグニ1体につき」（`WXDi-P15-051-E1`）の修飾が
  **語彙ごと存在せず**、どれも「任意のシグニ」に化けていた（過剰効果）。
- 🔴**`anyOf:[{hasCharm},{hasUnderCards},…]` では書けない**＝`anyOf` は `matchesFilter`（CardData 単体）
  しか通らず、**ゾーン状態キーは中で黙って無視される＝無条件成立**（`execUtils.ts:941`）。
  ⇒ OR を**1つのゾーン状態キー**（`hasAttachedOrUnder`）として持たせた。
- **配線先**＝`matchesStateFilter`（`effectEngine.ts`）／`fieldCandidates`（`execUtils.ts`）／
  `ZONE_STATE_KEYS` 2箇所（`execUtils` / `triggerCollect`）／`decompileEffects.ts` の `filterJa` 2箇所。
- 🔑**`POWER_MODIFY_PER_FIELD` の数え上げは `matchesFilter` しか呼んでいなかった**＝ゾーン状態キーが素通りする。
  `execPowerModifyPerField`（executor）と CONTINUOUS collector（`effectEngine`）の**両方**へ同じ式を足した
  （**片方だけ直すと経路で挙動が割れる**）。
- **影響**＝3効果（＋原文が同型の `WX25-P3-063-E2` が拡張採用で1件）。

#### (b) `triggerCondition.notByBattle`（1 finding）

- **真因**＝「このシグニが**バトル以外によって**バニッシュされたとき」（`WXDi-D06-013-E1`・原文1枚）の
  限定が丸ごと落ちて、**バトルバニッシュでも発火**していた。
- 🔴**`byEffect` を流用してはいけない**＝あちらは「効果起因の原因主体がいる」ことを要求するので、
  **ルール処理（パワー0）のバニッシュで発火しなくなる**（原文の「バトル以外」はルール処理も含む）。
  ⇒ 判定は `battleAttackerNum !== undefined`（**バトル経路だけがこれを渡す**）。
- **配線先**＝`collectBanishTriggers` の3箇所（被バニッシュ自身／場 watcher×2）。

---

### ■ 「受け皿は既にあるのに生成側だけが取り残されていた」もの（本命・PLAN §5.2 の実証）

| # | 効果 | 症状（旧） | 受け皿（既存） |
|---|---|---|---|
| 1 | `WDK01-001`〜`004`／`WXK01-001`/`008`/`009`/`010`／`WXEX2-11` | 🔴**【ライド】が丸ごと消えていた**（ルリグ9枚でライドが撃てない） | `STUB{RIDE_ON}`＋`INTERNAL_RIDE_ON_APPLY`（乗機選択・ドライブ判定まで実装済み） |
| 2 | `WXDi-P11-051-E2`／`WXDi-P11-078-E2` | 「このシグニ**と《NAME》1体**を場からトラッシュに置く」の**後半が消え、相方が場に無くても撃てた** | `cost.fieldTrash{filter.cardName, excludeSelf}` |
| 3 | `WDK04-014-E1`／`WDK04-015-E1`／`WXDi-P06-071-E1`／`WXDi-CP01-025-E2`／`WXK03-050-E1` | 「デッキの一番下に置いて**もよい**」が `position:'bottom'`＝**強制の下送り**に化けていた | `split_top_bottom`（振り分けUI・続き742-2 が同じ理由で選んだ受け皿） |
| 4 | `WXK11-028-E1` | 「手札に加えるか**ダウン状態で**場に出す」の `asDown` が場出し枝へ渡っていない＝**アップで出てそのターン殴れた** | `PLACE_SIGNI_ON_FIELD.asDown` |
| 5 | `SP27-003-E1` | 「**アタックフェイズの間、**…トラッシュに置かれたとき」＝**メインでも発火**（`ON_TRASH` のコレクタだけ `duringAttackPhase` を見ていなかった） | `triggerCondition.duringAttackPhase`（他コレクタ6箇所は配線済み） |
| 6 | `WXK01-035-E1-G` | 「**このターンにアタックした**すべてのシグニをバニッシュする」＝**場の全シグニ**が対象 | `TargetFilter.attackedThisTurn` |
| 7 | `WX24-P3-041-E1` | 「【リミットアッパー】1つを**得る**」が汎用の「【K】を得る」に食われ **`GRANT_KEYWORD`（シグニに文字列を付けるだけ）**＝無言 no-op | `STUB{PLACE_LIMIT_UPPER}`（`limit_upper_token`／リミット計算まで実装済み） |
| 8 | `WXDi-CP01-021-E1`／`WXDi-P12-003-E1`／`WX24-P2-038-E1` | 「トラッシュの全カードをデッキに加えてシャッフル**し、**〈後続〉」の**「し、」の右側が丸ごと落ちていた**（16枚ミル／エナチャージ／ライフ追加） | `TRANSFER_TO_DECK{TRASH_CARD, count:'ALL'}` は在った＝**分割していなかっただけ**（原文の継続形は実測9文） |
| 9 | `WDK13-001-E3` | 「シグニゾーンにある**すべての**表向きのカード」が `count:1` | `count:'ALL'` |

🔑**7 と 6 の教訓＝「汎用規則に食われる」形は part1 の先頭で引き取る**。
`【リミットアッパー】１つを得る` は `parseSentencePart3` に受け皿規則が在ったのに、
`parseSentencePart1` の汎用「【K】を得る」が先に当たって届いていなかった（単体で part3 を叩くと正しく通る＝
**規則の有無ではなく到達順の問題**）。§2.0 の「regex の網羅率ではなく、どの規則が先に当たるかで決まる」の再実証。

🔑**parser を直したのに live が変わらないときは3つのバケツを見る**（CLAUDE.md）＝今回も
`_held_fresh`（8枚）と `_idset_fresh`（4枚）で止まっていた。**`_idset_fresh` は `heldReview --adopt` では採用できない**
（MANUAL を巻き込む）ので、**新規 id（`-RIDE`）だけを live へ外科パッチ**した。

---

### ■ 較正（実装済みだったのに OPEN のまま残っていた・9 findings）

`node scripts/archive/semanticAuditRecheck.mjs` の候補30件は**ほぼ全部が真の未修正**だった（LCS だけでは拾えない）。
実際に stale だったのは、**live JSON を1件ずつ読み直して**見つけた次の9件：

- `WXDi-P03-087-E2`（`STUB{FROM_TRASH_TO_CENTER_ZONE}` は**zone[1] 固定で実装済み**）
- `WXK01-035-E1-G`（「このターン終了時」は `INSTALL_DELAYED_TRIGGER{ON_TURN_END}` で実装済み）
- `SPK01-08-E1`（`LOOK_PICK_CHAIN{pick 1→trash, remainder→bottom}`＝3枚下・1枚トラッシュと同値）
- `WD19-007-E1`（`STUB{REMOVE_VIRUS_TARGET_ZONE}` は実装済み）
- `WXK05-035-E2`（下のレベル1/2/3 条件は `AND{THIS_CARD_HAS_UNDER}×3` で実装済み・対象のレベル限定も無い）
- `WX24-P2-036-E1`／`WDA-F02-07-E1`（`count:{$ref:last_processed_count}`＋`levelMultisetFromLastProcessed` で実装済み）
- `WXEX1-38-E1`（`HAND_CARD{blind:true}` で実装済み）
- （`WXK01-035-E1-G` は1効果に finding 2本＝実装1・較正1）

🔑**教訓＝`semanticAuditRecheck.mjs` の LCS 候補と、実際の stale はほぼ重ならなかった。**
続き750 で在庫を払い出した直後なので当然だが、**「候補に出ない stale」は live JSON を読まないと見つからない**。
⇒ **バッチの中で live を開いた効果は、finding の claim をその場で照合し直す**のが安い（今回9件がこれで出た）。

---

### ■ golden（+3本・**反転確認済み**）

- `続き756① TargetFilter.hasUnderCards / hasAttachedOrUnder: 両評価器に配線されている`
  ＝生成側（3効果の JSON）＋ `matchesStateFilter` 6ケース＋ `fieldCandidates` 2ケース。
- `続き756② 【ライド】はキーワードそのものが【起】能力`＝ルリグ9枚に `-RIDE` が在ることを固定。
- `続き756③ この巡で配線した既存受け皿`＝上表 2〜9 ＋ `notByBattle` の engine 実走（バトル/効果の両方向）。

**反転確認**＝`matchesStateFilter` の `hasUnderCards` 分岐と `collectBanishTriggers` の `notByBattle` ゲートを
それぞれ**外すと 2 本が FAIL する**ことを実測した（`PASS 1 / FAIL 2`）＝**素通り（無条件成立）していない**証拠。

**既存 golden の期待値を2本更新**（PLAN §5.2「据置契約は受け皿ができたら反転する／消して通すのは禁止」）：
- `WXK03-050-E1: 外れ札の行き先はデッキの一番下（**任意性は未機構で別契約**）` → **契約の前提が消えた**ので
  `split_top_bottom` へ反転（受け皿は既にあった）。
- `wave2 A3 WDK04-015-E1` の `resumeWave2Look` を2回→**1回**（2ステップを1ステップへ畳んだため）。

**`§6.4 O-42` トリップワイヤが発火**＝`WXDi-P14-033-E1` が parser 出力と実体同一になった
（(8) の連用形分割が追いついたため）。`manualEffects.ts` から削除し、**live の `parseStatus` も `MANUAL`→`AUTO`**
へ直した（`PRESERVE_STATUSES` が効いたままだとその効果にだけ parser 改善が永久に届かない）。

---

### ■ 検証コマンド

```
npm run gates                                    # 全緑（golden 3126 / 0 FAIL）
npm run golden -- --only "続き756"               # 新設3本
node scripts/archive/semanticAuditLedger.mjs     # 残 OPEN 157（187 から -30）
npx tsx scripts/censusManualDrift.ts             # 削除候補 0
npm run regen                                    # 逆翻訳シート再生成（decompiler を触ったため）
```


## 2026-08-31（続き755）：§5.1 実機返済を**残0**へ（`V-94`／`V-96`〜`V-100` の6件）＋真バグ2件

ユーザー指示「残り６件も行う」の1巡。**§5.1 は 6 → 0**。実機シナリオを25本追加し、
**すべて両方向（肯定／対照）**で PASS。過程で engine の真バグを2件見つけて直した。
gates 全緑（typecheck / **golden 3121→3123（+2本）**・0 FAIL / smoke 全0 / fuzz 全0 / census 12 /
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
実機シナリオ 612 → **637本**。

### ■ 🔴真因①＝`ON_ATTACK_SIGNI` の遅延トリガーが**二重に積まれ、`attackerFilter` も素通り**していた

`WX25-CP1-085`（薬子サヤ）＝「アタックフェイズ開始時に相手シグニ1体を選び、**このターン黒の＜ブルアカ＞の
シグニがアタックしたとき**その1体に －1000」を実機で撃つと、**－1000 が2回乗り**、しかも
**白の＜ブルアカ＞でアタックしても乗った**。

**真因**＝`collectFieldTriggers` の汎用 `delayed_triggers` ループ（`triggerCollect.ts:4282`）。
あれは **`ON_PLAY`/`ON_BLOOM` の遅延を拾うために続き748 で足した**ものだが、
`ON_ATTACK_SIGNI` まで巻き込んでいた。あのイベントには**専用の対**が既にある：

| コレクタ | 役割 | `attackerOwner` | `attackerFilter` |
|---|---|---|---|
| `collectAttackerSelfDelayedTriggers` | 攻撃側に設置された watcher | `opponent` を読み飛ばす | ✅見る |
| `collectSigniAttackDelayedTriggers` | 防御側 | `self` を読み飛ばす | ✅見る |
| **汎用 `collectFieldTriggers`** | （ON_PLAY 用） | 🔴**見ない** | 🔴**見ない** |

⇒ ①専用コレクタと汎用コレクタの**両方**が積む＝効果が2回走る
②汎用側は `attackerFilter` を見ないので**誰がアタックしても発火する**。
**修正**＝汎用ループは `ON_ATTACK_SIGNI` を読み飛ばす（専用コレクタがあるイベントはそちらに任せる）。

**golden**＝`V-100② ON_ATTACK_SIGNI の遅延は専用コレクタだけが拾う` を追加。
①汎用が0件 ②専用が1件 ③白＜ブルアカ＞では専用も0件 ④**`ON_PLAY` の遅延は引き続き汎用が拾う**（巻き添え防止）
の4点を固定。**読み飛ばしを外すと即 FAIL することを確認済み**。

### ■ 🔴真因②＝`TRANSFER_TO_DECK.position` の `'second'`/`'third'` が**実経路に実装されていなかった**

`WDK09-011-E2`「【ゲート】の正面の相手シグニ1体をデッキの**上から三番目**に置く」が、
実機では**一番上（index 0）**に入っていた。

**真因**＝位置解決が**3箇所に別々に**書かれていた：

| 実装 | 由来 | second/third |
|---|---|---|
| `transferSpecificDeckCard` | `DECK_CARD` | ✅ |
| `insertToDeck` | 場・手札・エナ・トラッシュ・ライフ（7経路の共通入口） | 🔴無し |
| `applyDirectAction` の `TRANSFER_TO_DECK` | **SELECT_TARGET を挟む経路** | 🔴無し |

3つ目のコメントには「execTransferToDeck の insertToDeck と同じ配置ロジック」と書いてあったが**ドリフトしていた**。
**SELECT_TARGET を挟む効果は必ず3つ目を通る**ので、あのカードは実質どこにも実装が無かった。
⇒ `deckInsertIndex` / `deckInsertPosJa` を module レベルに切り出し、**3箇所すべてをそこへ寄せた**。

**golden**＝`V-100③ TRANSFER_TO_DECK: 場のシグニでも top/second/third/bottom が位置どおりに入る` を追加。
**既定（position 無し）＝一番上**も同時に固定（ここが動くと大量の既存効果が壊れるため）。

⚠**枚数はどの位置でも同じ**＝この種のバグは**順序を見る計器**が無いと永久に気づけない。
デッキの中身を全部別 id にして index で見るのが唯一の検出法。

### ■ 返済した6件（25シナリオ・すべて両方向）

| 項目 | 見たもの | シナリオ |
|---|---|---|
| `V-100`① | `hasSoul` × `triggerStateFilterOk`（ソウル付き/無しでミル） | `censusSoulAttackerMill` / `…NoSoulNoop` |
| `V-100`② | `attackerFilter` の色 ＋ 設置時対象の焼き込み | `censusDelayedAttackerFilterFires` / `…ColorNoop` |
| `V-100`③ | `position:'third'` ＋【ゲート】正面限定 | `censusTransferToDeckThird` |
| `V-100`④ | `ActiveCondition` の `ZONE_SUM_COUNT`（赤1枚で崩れる） | `censusZoneSumActiveGranted` / `…Broken` |
| `V-100`⑤ | `distinctBy:'name'`（同じ5枚でも2種類なら不成立） | `censusDistinctByNameMet` / `…SameName` |
| `V-99`① | `ZONE_SUM_COUNT` の **3+4=7**（AND 近似では通らない配分） | `censusZoneSumDisona7` / `…Disona6` |
| `V-99`② | ターン終了時の遅延対象の焼き込み（発火時の候補が1件） | `censusDelayedTurnEndStoredTarget` |
| `V-99`③ | 4択アップキープの「センタールリグの下から1枚」 | `censusUpkeepTrashUnderLrig` |
| `V-98`① | `THIS_CARD_HAS_UNDER{lrig}` の**2段閾値**（4/5/7枚） | `censusLrigUnder4Noop` / `…5Charge` / `…7Lancer` |
| `V-98`② | `FIELD_ATTACHED_COUNT{under}` | `censusFieldUnderCharge` / `…Noop` |
| `V-98`③ | `CENTER_LRIG_ATTACKED_THIS_TURN{negate}` | `censusLrigNotAttackedCharge` / `censusLrigAttackedNoop` |
| `V-97` | `cost.beat_signi{excludeSelf}` ＋ `BEAT_CONDITION`「4枚以下」 | `censusBeatSigniCostPay` / `…Blocked` |
| `V-96` | `EffectCost.fieldExileSelf`（トラッシュではなく `excluded` へ） | `censusFieldExileSelfCost` |
| `V-94` | `SUPPRESS_GAIN_ABILITY`（相手の付与が通らない） | `censusSuppressGainAbility` / `…Control` |

■**`V-99`②は登録票の `WXDi-CP02-043`（アシストルリグ）ではなく同一機構の `WXDi-P12-006`（ルリグ【自】）で踏んだ。**
アシストの【出】は UI 経路が別で本筋（焼き込み）から遠く、ルリグ【自】なら同じ
`SELECT_TARGET_ONLY → STORE → INSTALL_DELAYED_TRIGGER{ON_TURN_END, targetsStored}` を安く通せる。

■**`V-94` の「相手が付与を試みる」は `oppArtsStack` で作った**（`O-113` と同じ注入）。
対照（①を選ぶ）で**付与が普通に通る**ことまで見ているので、③側の PASS が
「そもそも付与が来ていないだけ」ではないことを担保している。

### ■ 実機ドライバで踏んだ罠（次の人が同じ時間を払わないために）

1. 🔴**`opp_field` の候補は表示時に反転する**（`EffectInteractionModal.tsx:214`＝「相手シグニ選択時はゾーン3→2→1の順」）。
   つまり **`pick-0` は DB 候補の末尾**。`cands[0]` と読むと「選んだのと違う1体に乗った」と**誤って赤を出す**。
2. 🔴**`field.lrig_attacked` と `lrig_has_attacked` は別物。**
   `CENTER_LRIG_ATTACKED_THIS_TURN` が読むのは後者（`execUtils.ts:2464`）。前者は「ルリグアタック解決中」の印で、
   盤面注入で立てると**ガード応答窓が開いてフェイズ送りボタンごと消える**（22ティック空振りした）。
3. 🔴**【出】にコストが付くカードは、コストを払うまで配置が DB へ書かれない**（React 側の `placedState` が持つ）。
   `placed`（DB 反映）を操作の前提にすると**コストモーダルが開いたまま永久に待つ**。
4. 🔴**CHOOSE のボタン名は `選択肢N` とは限らない**＝JSON の `label` をそのまま出すカードがある
   （`WXDi-P12-006` は「相手のシグニ1体をこのターン終了時にデッキの一番下へ」）。
5. 🔴**フェイズ送りボタンは1種類ではない**（`uiConstants.PHASE_BTN`）＝ATTACK_SIGNI は「ルリグアタックへ」／
   ATTACK_LRIG は「エンドフェイズへ」／END は「ターン終了」。さらに ATTACK_SIGNI は送りボタンが出ないことがあるので、
   **ターン終了の解決だけを見たいなら END へ patch して「ターン終了」を押す**。
6. 🔴**`img[alt]` の枚数で「候補に出たか」を測らない**＝同じカード名の画像は手札・配置プレビュー・
   モーダルヘッダにも出る。`excludeSelf` は**結果**（自分が場に残っているか）で見る。
7. 🔴**対照が「そもそも操作できなかった」で PASS しないようにする**＝`V-97` の5枚側は
   「場には出たうえで【出】だけが成立しない」ことを明示的に assert した（初版は召喚失敗でも緑になっていた）。

### ■ 追加した観測点

`queryState` に3つ追加＝**`fieldSoul`**（【ソウル】の付き方）／**`lrigHasAttacked`**（このターンにルリグがアタックしたか。
`field.lrig_attacked` と別物）／**`beatZone`**（【ビート】ゾーンの中身）。

### ■ 再現手段

```
node scripts/verifyBattleDrive.mjs censusSoulAttackerMill censusSoulAttackerNoSoulNoop \
  censusDelayedAttackerFilterFires censusDelayedAttackerFilterColorNoop censusTransferToDeckThird \
  censusZoneSumActiveGranted censusZoneSumActiveBroken censusDistinctByNameMet censusDistinctByNameSameName \
  censusZoneSumDisona7 censusZoneSumDisona6 censusDelayedTurnEndStoredTarget censusUpkeepTrashUnderLrig
node scripts/verifyBattleDrive.mjs censusLrigUnder4Noop censusLrigUnder5Charge censusLrigUnder7Lancer \
  censusFieldUnderCharge censusFieldUnderNoop censusLrigNotAttackedCharge censusLrigAttackedNoop \
  censusBeatSigniCostPay censusBeatSigniCostBlocked censusFieldExileSelfCost \
  censusSuppressGainAbility censusSuppressGainAbilityControl
npm run golden -- --only "V-100"
npm run gates
```

## 2026-08-31（続き754）：§5.1 実機返済 7 → 6 件（`V-101` クローズ）＋ **手札捨て台帳の真バグを10箇所修正**

ユーザー指示「実機検証を続ける」の1巡。**`V-101`①②③ を実機5シナリオ（すべて両方向）で返済**し、
その過程で**「このターン手札から捨てた」台帳の書き漏れ**という真バグを見つけて直した。
gates 全緑（typecheck / **golden 3119→3121（+2本）・0 FAIL** / smoke 全0 / fuzz 全0 / census 12 /
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。

### ■ 🔴真因（症状ではなく）＝`turn_hand_discarded_cards` を書く支払い地点が3種類あった

`HAND_DISCARDED_THIS_TURN{filter}`（`effectEngine.ts:871` / `:1363` ／ `execUtils.ts:2336`）は
**枚数カウンタではなく実体リスト（`turn_hand_discarded_cards`）を絞って数える**。
ところがコストで手札を捨てる地点は10箇所あり、実装が**3種類に割れていた**：

| 支払い地点 | 旧 `turn_hand_discarded_count` | 旧 `turn_hand_discarded_cards` |
|---|---|---|
| アーツ使用（`performArts`） | ✅ | ✅ |
| スペル使用・**ルリグデッキから** | ✅ | ✅ |
| スペル使用・**手札から** | ✅ | 🔴**無し** |
| シグニ【出】コスト（`executeSigniOnPlayCost`） | 🔴無し | 🔴無し |
| シグニ【起】／ルリグ【起】／キー【起】／アシスト【起】／トラッシュ【起】／ガードシグニ捨て | 🔴無し | 🔴無し |

⇒ **その経路で捨てた turn は条件が永久に false**（無言 no-op）。
とくにスペルの2枝は**同じ関数の中で片方だけ実体を落としていた**ので、
「ルリグデッキから使うと効くのに手札から使うと効かない」という再現しにくい形になっていた。

**実機での再現**＝`WXDi-CP02-055`（猫塚ヒビキ）は1枚で両側を持つ：
E3【出】が手札から＜ブルアカ＞2枚を捨て、E2【自】アタック時がその履歴を読む。
修正前は **`捨て履歴=[] 捨て枚数=0`**（＝【出】のコストで2枚捨てた直後）で、アタックしても相手の手札は減らなかった。

### ■ 直し方＝**唯一の入口**を作って10箇所から呼ぶ

`src/screens/battle/costs.ts` に `handDiscardHistoryRecord(prev, discarded)` を新設し、
**枚数と実体を必ず同時に**積むようにした。既に両方書いていたアーツ／スペル(ルリグデッキ)枝も
この関数へ寄せて、**書き方が分岐する余地を消した**。

⚠**「捨てる」以外を渡さない**＝`handToEnergy`（エナへ）／`handToUnder`（このシグニの下へ）／
`energyTrash`（エナから）は手札を捨てていないので台帳に載せない。各呼び出し地点でコメントを添えた。
⚠**ターン終了時のルール処理（手札上限超過）は通していない**＝あの捨ては `turn_*` がリセットされる
境界と同じ地点で起きるので、載せると寿命が1ティックの値になる（意図的な除外・ヘルパーの JSDoc に明記）。

### ■ golden（+2本）＝**片方だけ書く形を機械で禁止**

- `V-101② handDiscardHistoryRecord: 枚数と実体を必ず同時に積む` … 空配列で何も動かない／初回／追記の3段に加え、
  **不変条件「枚数 === 実体の長さ」**を全状態で assert（旧バグはここが 2 対 0 に割れていた）。
- `V-101② HAND_DISCARDED_THIS_TURN は実体を絞って数える` … ＜ブルアカ＞／非ブルアカ／空 の3方向を `evalCondition` で実走。

### ■ `V-101` の実機5シナリオ（すべて両方向・全 PASS）

| シナリオ | カード | 見たもの |
|---|---|---|
| `censusAcceFromEnergy` | `WX22-Re02` | 段1（`targetScope:'self_energy'`）の候補が＜調理＞《アクセアイコン》の**1件だけ**／選ぶとエナから消えて【アクセ】へ |
| `censusHandDiscardedBuruakaFires` | `WXDi-CP02-055` | 【出】コストで＜ブルアカ＞2枚を捨てる → アタック時に相手の手札 2→1 |
| `censusHandDiscardedOtherClassNoop` | 同上 | 対照＝捨てたのが＜ブルアカ＞でなければ発動しない（手札 2→2） |
| `censusDelayedPlacedByEffectFires` | `WXDi-P09-010` | 効果（【起】トラッシュから場に出す）で配置 → 遅延トリガー発火で相手に －8000 |
| `censusDelayedPlacedBySummonNoop` | 同上 | 対照＝手札からの通常召喚では発火しない（`placedByEffect` の弁別） |

■**`ATTACH_ACCE.fromEnergy` と `placedByEffect` は engine 側が正しかった**＝実機で炙って両方向とも期待どおり。
実装の穴が出たのは②だけで、**そこは engine ではなく UI の支払い地点**だった（＝golden/smoke/fuzz が届かない層）。

### ■ 実機ドライバで踏んだ罠（次の人が同じ時間を払わないために）

1. 🔴**`H.clickTextOrBtn` は `isEnabled` を検査しない。**
   disabled の「発動」を毎ティック押して `'btn:発動'` を返し続け、**30ティック空振りしても「押せている」ように見える**。
   ⇒ **可否のあるボタンは `H.clickBtn(name, {exact:true})`**（あちらは isEnabled を見る）。ドライバ自身のコメントが
   「disabled のまま押して『クリックした風だが進まない』」を2大罠として警告しているのに、その罠に落ちた。
2. 🔴**ルリグ【起】のボタン名は効果本文ではなく支払い要約**＝実測で `【起】エナ2` と `【起】コストなし` の2件だけ。
   「効果によって」「トラッシュから」といった本文で選び分けようとすると**1つも押せない**。
3. 🔴**`SELECT_SIGNI_ZONE`（効果で場に出すときの配置先）は `ゾーンN` ボタン**で、通常召喚の `summon-zone-N`（testid）
   とは**別の窓**。片方だけ書くと `pEff=SELECT_SIGNI_ZONE` で止まる。
4. 🔴**対象選択（`pick-0`）は「決定」より先に置く。** 逆順だと毎ティック「決定 (0/1)」を押しに行って pick へ到達せず、
   `pEff=SELECT_TARGET` のまま空回りする。
5. **解決待ちの窓が開いている間はルリグ/カードを触らない**（裏でカード詳細が開いて操作を食う）。
6. **ルリグ【起】のコストUIに testid は無い**＝エナ札は `<img alt={CardName}>` を包む div の onClick なので
   **カード名で掴む**。モーダル外の同名カードはオーバーレイに覆われて click が通らないので、
   `force` を付けずに順に試し、通ったものだけを支払いとして数える。

### ■ 再現手段

```
node scripts/verifyBattleDrive.mjs censusAcceFromEnergy censusHandDiscardedBuruakaFires \
  censusHandDiscardedOtherClassNoop censusDelayedPlacedByEffectFires censusDelayedPlacedBySummonNoop
npm run golden -- --only "V-101②"
npm run gates
```

## 2026-08-31（続き753）：§5.1 実機返済を 10 → 7 件（`V-93` / `V-95` / `V-102` をクローズ）

ユーザー指示「§5.1【最優先】実機未検証の返済」の1巡。**`src/` は1バイトも触っていない**＝変更は
`scripts/verifyBattleDrive.mjs`（ドライバのフレーク修正＋観測点1つ＋新規シナリオ3本）と docs のみ。
gates 全緑（typecheck / golden 3119・0 FAIL / smoke 全0 / fuzz 全0 / census 12 / census-stubs A🔴0・C0 /
manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。

### ■ `V-93`＝**engine のバグではなく、実機ドライバのフレークだった**

`wx17040ConditionsTrueExecuteAll` / `wx17040ConditionsFalseNoop`（`WX17-040-E1`＝「以下の3つから3つまで選ぶ」）。
**単独 → 単独 → 連続2本の計4回すべて PASS**（9秒／6秒）。live JSON も逆翻訳も原文と一致したままで、
engine・parser には手を入れていない。

**真因**＝ドライバが**「クリックしたこと」を進行条件にしていた**こと。

```js
await c1.click().catch(() => {});
await c2.click().catch(() => {});
await c3.click().catch(() => {});
did = 'click:選択肢1+2+3'; picked = true;   // ← 押せたかを一度も測っていない
```

`multiSelect` の CHOOSE は1クリックごとに React が再描画する（`EffectInteractionModal.tsx:640` の
`selectedMultiChoiceIds` が更新され、選択済みのラベルが `選択肢N` → `✓ 選択肢N` に変わる）。
続けて押すと直後の locator が **detach 済みの要素を掴んで throw** しうるが、`.catch(() => {})` が
それを握り潰すので、**2つしか選ばれていないまま `picked = true` になって「決定」へ進む**。
`upTo` の確定ボタンは常に enabled なので**そのまま確定できてしまい**、後段の観測（バニッシュ／エナチャージ）
だけが空振りする＝**実行ごとに停止段階が変わる**という記録どおりの症状になる。

**直し方**＝選択済みラベル `✓ 選択肢N` を進行条件にした。1つずつ押して ✓ が付いたことを確かめ、
**3つ揃うまで `picked` を立てない**（`FalseNoop` の③も同じく ✓ 確認へ）。揃わなければ次ティックで押し直す。

🔑**教訓＝実機ドライバでは「押した」ではなく「盤面/DOM が変わった」を進行条件にする。**
`.catch(() => {})` を置いた行は**必ず次の行で「効いたか」を測る**。黙って半端な状態で先へ進むのが最悪の形で、
これは engine のバグと見分けが付かない赤を出し続ける。

### ■ `V-95`＝**書いてあったシナリオを回すだけ**（`HAS_TRAP_IN_FIELD`）

`node scripts/verifyBattleDrive.mjs censusHasTrapInField` → **PASS（9秒）**。
手札 2→1（トラップ無しは不発）→ トラップを `patchPlayerState` で設置してもう1枚召喚 → DRAW で1 の反転確認。
PLAN に書かれていた「Playwright Chromium 未導入／外部認証で timeout」は**既に古い記述**だった（続き747 で解消済み）。

🔑**「ドライバは書いてあるが未実走」の在庫は実装より圧倒的に安い。§5.1 に来たらまず全部回す。**

### ■ `V-102`＝新規シナリオ3本（4方向すべて PASS）

| シナリオ | カード | 見たもの |
|---|---|---|
| `censusSelfCrashToTrashRefill` | `WD06-009` | 自ライフのクラッシュ置換（トラッシュ＋デッキ上を補填）と**回数制**の反転 |
| `censusSideAttackLancerFires` | `WXEX2-71` | 正面以外へアタック→そのシグニが【ランサー】を得る→相手ライフ−1 |
| `censusSideAttackLancerFrontNoop` | `WXEX2-71` | 対照＝正面へアタックすると付かない |

③（`ON_ACCE` のトリガー元）は続き748 で返済済みなので含めていない。

**なぜ実機でしか見えないか**＝
- `SELF_CRASH_TO_TRASH_AND_REFILL` は engine（`execStubPart3.ts:989`）が**カウンタを積むだけ**で、
  置換そのものは `BattleScreen.performLifeBurstResponse`（`BattleScreen.tsx:12644` 付近）の**1点にしかない**。
  golden / smoke / fuzz はこの経路を1行も通らない。
- `triggerCondition.attackedNotFront` は `triggerCollect.ts:4280` で **fail-closed**＝`sideAttack` を渡さない
  収集経路では永久に発火しない。渡しているのは `BattleScreen.tsx:8942` の
  `collectFieldTriggers('ON_ATTACK_SIGNI', …, { sideAttack: isSideAttack })` **1箇所だけ**。

**観測結果**（`censusSelfCrashToTrashRefill`）：
- 対照（残0）＝割った札 `WD01-013#9323` は**エナへ**・life 3→2・deck 3のまま。
- 置換あり（残1）＝**同じ操作**で割った札 `#9322` が**トラッシュへ**・デッキ上 `#9331` がライフ末尾へ・deck 3→2・残回数 1→0。

**観測結果**（`censusSideAttackLancer*`）：
- 側面（host zone0 → opp zone1）＝`keyword_grants` が `側面アタック` → `側面アタック/ランサー` になり、
  バトルバニッシュで**相手ライフ 3→2**（付与が読まれていることまで確認）。
- 正面（host zone0 → opp zone2）＝**付かず**、バニッシュしても相手ライフは 3 のまま。

### ■ シナリオを書くときに踏んだ罠（次の人が同じ時間を払わないために）

1. 🔴**盤面注入で「召喚ボタンが出ない」ときは、まずルリグ限定を疑う。**
   `getMyHandCardActions`（`BattleScreen.tsx:8298`）が `meetsRestriction(cardData.Restriction, lrigClass)` を見るので、
   **エルドラ限定の `WD06-009` は あや のルリグ（`WX22-009`）では召喚できない**。
   症状は「**盤面注入は成功しているのに操作が1手も始まらない**」＝30ティック空振り。
   ⇒ ルリグを `WD06-001`（エルドラ Lv4・Limit11）へ替えて解決。
2. 🔴**回数制の置換は「同じ札・同じ操作で1ビットだけ反転」して測る。**
   チェックゾーンは**クリック待ちで止まる**ので、そこで `self_crash_to_trash_and_refill` を 1→0 に patch してから
   同じ「エナに送る」を押せば、**経路を1本も変えずに**対照が取れる。
   ⚠**別カードで反転しようとしない**＝素の自ライフクラッシュはたいてい `triggerBurst:false` で、
   あれは `execLifeCrash` の else 枝で**直接トラッシュへ**行く（チェックゾーンを通らない別経路）＝比較にならない。
   ⚠**ルリグ限定が違うカードも使えない**（1と同じ理由）。
3. 🔴**patch のあとを固定 sleep で済ませない。**
   realtime 反映前にボタンを押すと**対照のつもりで置換つきを踏み、「置換が無条件に乗っている」と赤を誤報する**（初版がこれ）。
   ⇒ **patch した値を `queryState` で観測してから**次へ進む（最大12回・500ms ポーリング）。
4. **手札モーダルを「1回開けば開いたまま」と仮定しない。**
   毎ティック「召喚ボタンが見えているか」を測り、見えていなければ手札札を押し直す（`censusAcceSelfPlayGate` と同型）。

### ■ 追加した観測点

`queryState` の `sideOf` に **`selfCrashRefill`**（`self_crash_to_trash_and_refill`）を追加。
置換は回数制なので、「2回目に乗らない」を盤面差分だけで言うと**「そもそも1回目も乗っていない」と区別が付かない**＝
カウンタ自体を観測点にした。

### ■ 直していない粗（挙動バグではないので §5.3 には登録しない）

チェックゾーンのボタンは置換が乗っていても **「エナに送る」のまま**（実際はトラッシュ＋ライフ補填）。
**ラベルを変えると 158 シナリオがアクセシブル名でこのボタンを掴んでいる**ので触っていない。
直すなら「ラベル変更＋ドライバ側の名前を一斉に追随」を1巡で通すこと。

### ■ 再現手段

```
node scripts/verifyBattleDrive.mjs wx17040ConditionsTrueExecuteAll wx17040ConditionsFalseNoop
node scripts/verifyBattleDrive.mjs censusHasTrapInField
node scripts/verifyBattleDrive.mjs censusSelfCrashToTrashRefill
node scripts/verifyBattleDrive.mjs censusSideAttackLancerFires
node scripts/verifyBattleDrive.mjs censusSideAttackLancerFrontNoop
```
