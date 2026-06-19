# バグ修正記録 (BUGFIXES)

これまでに修正した主要なバグ・系統的修正の記録。新しいものを上に追記する。
設計方針は [DESIGN.md](./DESIGN.md)、未対応の作業は [TODO.md](./TODO.md)。

---

## 正面ターゲット機構と PR-426 実装（v0.348, 2026-06-19）

- **機構追加:** `TargetFilter.frontOfSelf`（効果元シグニの正面＝相手ゾーン `2-zi` のシグニに限定。`execBanish` が解決）と `IS_SELF_IN_CENTER_ZONE`（ActiveCondition／中央ゾーン index 1）。
- **PR-426「篭手 エルゼ」:** ライフ1枚以下かつ中央ゾーンにあるかぎりパワー＋4000（CONTINUOUS・`activeCondition:AND[ライフ≤1, IS_SELF_IN_CENTER_ZONE]`）＋アタック時に正面のシグニ1体をバニッシュ（AUTO・`condition:AND[LIFE_COUNT≤1, THIS_CARD_IN_CENTER_ZONE]`・`frontOfSelf`）。
- **あわせて修正:** PR-426-E2 が「ライフクラッシュ時」なのに `ON_PLAY` に誤設定され召喚時にバニッシュしていたのを `ON_LIFE_CRASHED` に修正（同 timing は未配線のため発火は保留だが、誤った召喚時発火は停止）。
- **保留:** WX20-Re18（エナ数依存の動的自己レベル条件が必要）/ WX18-076（被バニッシュ時に「正面にあった」シグニを参照＝離場時のゾーン記録が必要）は no-op のまま。

---

## ソウル付与機構（GRANT_SOUL_HOST_ABILITY）の新設（v0.347, 2026-06-19）

- **機構追加:** 【ソウル】カードからホストシグニ（ソウルが付いているシグニ）へ能力を付与する仕組みをアクセ機構と同型で新設。アクション型 `GRANT_SOUL_HOST_ABILITY { filter?, abilities }`、コレクター `collectGrantedFromSoul`（`field.signi_soul[zi]` 参照）、`BattleScreen` augMap に `hasSoulGrant` 判定＋適用を追加。
- **WXDi-D07-003「エクス・ツー」:** ソウル先がアタック時に相手パワー12000以下のシグニ1体をバニッシュ。
- **WXDi-P04-015「マキナ・ツー」:** ソウル先がアタック時に相手レベル2以下のシグニ1体をバニッシュ。
- ※《ターン1回》はON_ATTACK_SIGNI経路で未強制（既存の系統的制約・シグニは通常1ターン1アタック）。

---

## アクセ付与機構（GRANT_ACCE_HOST_ABILITY）の新設（v0.346, 2026-06-19）

- **機構追加:** アクセカードからホストシグニ（アクセが付いているシグニ）へ任意の能力を付与する仕組みを新設。アクション型 `GRANT_ACCE_HOST_ABILITY { filter?, abilities }`、コレクター `collectGrantedFromAcce`（`effectEngine.ts`）、`BattleScreen` の augMap 構築に `hasAcceGrant` 判定＋適用を追加。付与AUTOは augMap 経由でトリガー収集に入り発火する。従来アクセはパワー修正とキーワードのみホストへ伝播していた。
- **WX16-045「コードイート チョコスプ」:** アクセされた＜調理＞シグニにアタック時「自身のパワー以下の相手1体バニッシュ」を付与。
- **WX20-072「コードイート チョコプレート」:** アクセされた《コードオーダーウェディング》にパワー＋1000（既存アクセPOWER_MODIFY経路）＋アタック時「自身のパワー以下の相手1体バニッシュ」を付与。
- **保留:** WX18-076（正面参照）/ SP27-015（付与先が【起】＋【アクセ】2枚トラッシュコスト）はそれぞれ別機構が必要なため no-op のまま。

---

## WXDi-P15-061 を上シグニ付与で実装（v0.345, 2026-06-19）

- **WXDi-P15-061「羅星 サシェ//THE DOOR」:** 「このカードの上にある＜解放派＞のシグニは『【自】アタックフェイズ開始時、相手パワー3000以下のシグニ1体をバニッシュ』を得る」を既存の `GRANT_SIGNI_ABOVE_ABILITY`（`collectGrantedFromUnderSigni` の Pattern B、付与AUTOは augMap 経由で発火）＋`filter:{cardClass:'解放派'}` で実装。

---

## 「自身のパワー以下/より低い」動的フィルタと場全体付与（v0.344, 2026-06-19）

- **動的フィルタ追加:** `TargetFilter.powerLteSelf`（効果元シグニの実効パワー以下）／`powerLtSelf`（より低い）。`execBanish` が効果元の実効パワーを基準に `powerRange.max` へ解決（`powerLtSelf` は max=自パワー−1）。アタック時付与の場合 `sourceCardNum` はアタックしたシグニ＝付与先なので、付与先ごとに正しく解決される。
- **WX13-034「幻獣神 マンモ」:** 「あなたのシグニは『【自】アタック時、自身よりパワーの低い相手シグニ1体をバニッシュ』を得る」を `GRANT_FIELD_SIGNI_ABILITY`（付与AUTOは augMap 経由でトリガー収集に入り発火）＋`powerLtSelf` で実装。
- **既存近似の正確化:** WDK01-011・WXK03-034・WXK04-042 の「自身のパワー以下」バニッシュに `powerLteSelf` を付与（従来は無フィルタ近似だった）。

---

## WDK08-L11 を血晶武装条件で実装（v0.343, 2026-06-19）

- **WDK08-L11「紅蓮の使い魔 ツクヨミ」:** 血晶武装状態であるかぎりアタック時に相手シグニ2体まで《赤》《赤》を支払ってバニッシュ（AUTO `ON_ATTACK_SIGNI`・`condition:THIS_CARD_IS_ARMORED`・任意コスト）。既存条件で表現でき新条件は不要。

---

## 「下にカードがある」条件の追加と WXDi-P05-034 実装（v0.342, 2026-06-19）

- **条件型追加:** `THIS_CARD_HAS_UNDER`（ActiveCondition／Condition。このシグニの下にカードがある＝そのスタック長 > 1）。
- **WXDi-P05-034「コードアクセル ヒャッハー」:** 下にカードがあるかぎりパワー＋5000（`activeCondition`）＋アタック時に相手パワー8000以下へ《赤》《赤》を支払ってバニッシュ（AUTO・`condition`・任意コスト）。

---

## 「このターン手札N枚捨てた」条件の追加と実装（v0.341, 2026-06-19）

TODO F-1 の中装シリーズ2枚を機能化。

- **条件型追加:** `TURN_HAND_DISCARD_GTE { value }`（ActiveCondition／Condition 両方。`turn_hand_discarded_count` を参照）。
- **WXK03-034「中装 ニョイボウ」:** このターン手札2枚以上捨てていればパワー＋2000（`activeCondition`）＋アタック時に《赤》を支払ってバニッシュ（AUTO・`condition`・任意コストは `OPTIONAL_COST`＋`CONDITIONAL(IS_MY_TURN)` の定石）。「自身のパワー以下」は無フィルタ近似。
- **WXK03-056「中装 ジョワイ」:** このターン手札1枚以上捨てていればアタック時に相手パワー3000以下へ《赤》を支払ってバニッシュ。

---

## 覚醒/ドライブ条件の追加と能力実装（v0.340, 2026-06-19）

TODO F-1 の no-op カードのうち、状態条件さえあれば忠実実装できる2枚を機能化。

- **条件型追加:** `IS_SELF_AWAKENED`（ActiveCondition／このシグニが覚醒状態＝`awakened_signi` に含まれる）、`THIS_CARD_IS_AWAKENED`・`IS_DRIVE_STATE`（Condition／AUTO 用。`evalCondition` で `awakened_signi`・`lrig_riding_signi` を参照）。
- **WXDi-P07-060「紅天 ヒュペリオン」:** 覚醒状態であるかぎりパワー＋2000（CONTINUOUS POWER_MODIFY・`activeCondition:IS_SELF_AWAKENED`）＋アタック時に相手パワー3000以下バニッシュ（AUTO `ON_ATTACK_SIGNI`・`condition:THIS_CARD_IS_AWAKENED`）。覚醒付与は既存 E2（ターン終了時 AWAKEN_SIGNI）。
- **WDK01-011「コードライド ヤマテ」:** 【ドライブ常】でパワー＋3000（`activeCondition:IS_DRIVE_STATE`）＋アタック時バニッシュ（AUTO・`condition:IS_DRIVE_STATE`）。「自身のパワー以下」フィルタは動的未対応のため無フィルタで近似。

---

## CONTINUOUS BANISH 誤解析の一掃ラウンド（v0.339, 2026-06-19）

WD04-009 と同根の「能力付与/AUTOトリガーが無条件 CONTINUOUS BANISH に誤解析され、`calcContinuousSigniMutations` により場に出た瞬間から相手シグニを一方的にバニッシュし続ける」系統バグを一掃。**非optionalのCONTINUOUS BANISHは残り0件**になった（optionalの身代わり系は元々自動適用されず無害なので対象外。CONTINUOUS TRASH もこの経路では実行されず無害だが誤解析なので別途・TODO F）。

- **根本修正（収集経路）:** `ON_ATTACK_SIGNI` の AUTO トリガー収集（`BattleScreen.tsx` `performSigniAttack`）が `eff.condition` を無視していたため、条件付き付与（「〜であるかぎり『【自】アタック時…』を得る」）を AUTO で表現できなかった。アタッカーの実効パワーを `calcFieldPowers` で算出し `evalUseCondition` で `condition` を判定して収集するよう修正。これで WD04-009-E2 を含む条件付き ON_ATTACK_SIGNI が正しくゲートされる。
- **機能実装（7枚）:** WX05-021（パワー20000↑でダブルクラッシュ＋アタック時バニッシュ）／WX09-019（18000↑でランサー＋ライフクラッシュ時バニッシュ※ON_LIFE_CRASHED未配線のため発火は保留）／WX10-063（中央でアタック時1000以下バニッシュ）／WX11-063・WX11-064（相手ターンに被バニッシュ時に7000/3000以下バニッシュ＝AUTO `ON_BANISH`＋`activeCondition:TURN_OWNER`）／WXK04-042（血晶武装でアタック時バニッシュ）／WXK07-044（中央でアタック時7000以下バニッシュ）。条件は既存の `THIS_CARD_IN_CENTER_ZONE`/`THIS_CARD_IS_ARMORED`/`SELF_POWER_GTE`/`SELF_POWER_THRESHOLD`/`TURN_OWNER` で表現。
- **無害化のみ（no-op STUB `UNIMPL_GRANTED_ABILITY`、24枚）:** 覚醒/ソウル/アクセ/ドライブ付与、場全体への付与、動的パワー（自身以下）・正面・ルリグ名存在・手札捨て枚数・下のカード有無など、現状の条件/機構では忠実実装できないものは CONTINUOUS STUB に置換して誤バニッシュを停止。機能は未実装（→ TODO F に列挙）。

---

## WD04-009「幻獣 セイリュ」— 能力付与が CONTINUOUS BANISH に誤解析され召喚時に相手シグニをバニッシュ（v0.338, 2026-06-19）

- **症状:** WD04-009 を場に出すと、本来何も起きないはずなのに相手シグニが1体バニッシュされた。
- **原因:** 「【常】：あなたの場にあるシグニ３体のパワーがそれぞれ15000以上であるかぎり、このシグニは【ランサー】と『【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、それをバニッシュする。』を得る。」をパーサーが**条件なしの CONTINUOUS BANISH（`mandatory:true`）** に潰していた。`calcContinuousSigniMutations`（`effectEngine.ts`）は CONTINUOUS の BANISH/FREEZE/DOWN（mandatory・非optional・条件パス）を場にある間ずっと自動適用するため、出した瞬間から相手シグニをバニッシュし続けていた。ライフバースト（パワー10000以上をバニッシュ）とは別物。
- **修正:** WD04-009 を正しい3効果に再定義。①CONTINUOUS `GRANT_KEYWORD`【ランサー】（条件付き）、②AUTO `ON_ATTACK_SIGNI` の相手シグニ1体バニッシュ（同条件・`triggerScope:self`）、③LIFE_BURST はそのまま。条件「自分の場のシグニ3体がそれぞれ15000以上」を表す `FIELD_SIGNI_POWER_COUNT`（`owner/minPower/operator/value`）を ActiveCondition と Condition の双方に新設し、`checkActiveCondition`（effectEngine）と `evalCondition`（execUtils）の両方で実効パワー基準に評価。
- **未対応（要フォロー）:** 同じ「CONTINUOUS BANISH（mandatory・無条件）」誤解析が他にも約30枚残存（`WX05-021`/`WX09-019`/`WX09-027`/`WX10-063`ほか）。多くは【自】や能力付与の誤潰しと推測。→ TODO.md「F. CONTINUOUS BANISH 誤解析の一掃」。

---

## WX21-035 / WX22-029 — 欠落していた効果の実装（v0.337, 2026-06-19）

- **WX21-035「縛恋の煉獄」（スペル）:** 「以下の４つから２つまで選ぶ」の CHOOSE が JSON から丸ごと欠落し、コスト軽減スタブ（しかも `CONDITIONAL(IS_MY_TURN)` 付きの誤構造）のみ存在していた。`CHOOSE`（`choose_count:2 / upTo:true / from_count:4`）を実装：①対戦相手のエナから「相手センタールリグと共通色を持たない」カード1枚をトラッシュ（`TRASH` + `ENERGY_CARD` + `colorNotMatchesLrig`）、②デッキ上2枚をエナへ（`ENERGY_CHARGE_FROM_DECK`）、③相手パワー7000以下シグニ1体バニッシュ、④相手パワー12000以上シグニ1体バニッシュ。コスト軽減（手札から赤・緑の＜龍獣＞を1枚ずつ捨てて《赤×0》）は `OPTIONAL_COST` マーカーで近似のまま。
- **`colorNotMatchesLrig` の解決バグ:** `execTrash` の `ENERGY_CARD` 分岐は `resolveDynamicFilter` を通しておらず、`colorNotMatchesLrig`（→`colorExclude`）が未解決のまま `matchesFilter` に渡り無視されていた（対象が全エナになる）。対象オーナー（=相手）のルリグを基準に解決するよう `resolveDynamicFilter` を追加。`colorNotMatchesLrig` の実データ初使用カード。
- **WX22-029「参ノ遊　ハンスピ」（シグニ）:** アタック時効果「あなたのエナゾーンからシグニ１枚を手札に加える。そうした場合、手札からカードを１枚エナゾーンに置く。」の後半が `CONDITIONAL(IS_MY_TURN)→STUB OPTIONAL_COST`（実体なし）だった。`SEQUENCE [TRANSFER_TO_HAND(エナのシグニ1枚), ENERGY_CHARGE(手札1枚)]` に修正。前半 `TRANSFER_TO_HAND` に `filter:{cardType:'シグニ'}` を追加。※「そうした場合」のエナにシグニ無し時のガードは未対応（稀ケース・近似）。《ターン1回》は他カード同様 `usageLimit` 未表現（ON_ATTACK_SIGNI 発火経路が未対応のため＝既存の系統的制約）。

---

## WD19-011 — パワー0シグニがバニッシュ前にバトルしてしまう（v0.336, 2026-06-19）

- **症状:** WD19-011 のアタック時 ON_ATTACK_SIGNI 効果で正面シグニのパワーを -4000 し 0 にしたあと、本来ならパワー0以下のルールバニッシュで除去されるべきシグニが、バニッシュされる前にそのシグニとバトルしてしまっていた。
- **原因:** スタックが空になったタイミングで「パワー0以下バニッシュ（`checkAndBanishPowerZero`）」と「バトル解決（`resolvePendingSigniBattleFor`）」の両 useEffect が発火しうる。バトル解決側はパワー0バニッシュ未完了をチェックしていなかったため、バニッシュより先にバトルが成立していた（CPUドライバでも `pending_signi_battle` 判定がパワー0バニッシュ判定より前に置かれていた）。
- **修正:** `BattleScreen.tsx` に `collectPowerZeroBanishCandidates`（`checkAndBanishPowerZero` と同じ判定ロジックを共有）を新設。`resolvePendingSigniBattleFor` の冒頭でパワー0以下バニッシュ候補が残っていればバトル解決を遅延（`pending_signi_battle` は保持され、バニッシュ完了後に再解決される）。CPUドライバの `pending_signi_battle` 分岐にも同候補チェックを追加し、候補があれば先に `checkPowerZeroBanish` を実行するようにした。バトルは「すべてのルール処理完了後」に行われる。

---

## WXK07-043「羅菌 マグネ」— バニッシュ耐性キーの不一致（v0.335, 2026-06-19）

- **症状:** STUB `WXK07_043_CHARM_BANISH` は「バニッシュされない」付与のため `keyword_grants` に `'PROTECTION:BANISH:opponent'` を書いていたが、バトル/ルールバニッシュ（パワー0以下）の耐性判定 `hasBanishResist`（`utils/keywords.ts`）は `'バニッシュされない'` キーを見るため**キーが一致せず、効果バニッシュしか防げていなかった**（部分実装）。
- **修正:** `execStubPart3.ts` の同ハンドラで `'PROTECTION:BANISH:opponent'` に加え `'バニッシュされない'` も付与。テキスト通り全方位（効果・バトル・ルール）のバニッシュ耐性が効くようにした。
- **補足:** 同時に調査した WXDi-P07-073 は `GRANT_LRIG_ABILITY`→`lrig_granted_auto_effects`→相手ターン終了時発火（`BattleScreen.tsx:2936`）が既に実装済みで問題なし。両カードを「dormant」としていた HANDOFF 情報は古かった。

---

## WD19-018 ラブリー・バイオ（スペル）— 効果の誤実装（2026-06-18）

- **症状:** ①②の選択構造がなく、どちらの選択肢にもある「自分の＜微菌＞シグニをバニッシュ」が欠落。②の -7000 が `CONDITIONAL(IS_MY_TURN)` という誤った条件分岐になっていた。
- **正しい効果:** 以下の2つから1つを選ぶ。①自分の＜微菌＞シグニ1体をバニッシュ→相手シグニゾーン1つにウィルスを置く。②自分の＜微菌＞シグニ1体をバニッシュ→相手シグニ1体のパワーを-7000（ターン終了時まで）。
- **修正:** `manualEffects.ts` に `CHOOSE`（1/2）＋各選択肢に `BANISH`→`PLACE_VIRUS` / `BANISH`→`POWER_MODIFY` の `SEQUENCE` を実装。
- **あわせて:** `TargetFilter.cardClass` を新設（CSV の `CardClass` 列に `includes` でマッチ）。`story` はディソナ専用というルールを確立（→ [DESIGN.md](./DESIGN.md) §3）。

---

## コスト設定漏れ（v0.312）— 177件 → 3件

- **症状:** effects JSON の ACTIVATED 効果で `cost={}`（未設定）。ゲームエンジンがコストを要求せず効果を使い放題になるバグ。
- **修正:** `effectParser.ts` の `parseCost` を系統的に修正。残3件（WXK03-001 E2/E3, WXK03-002 E3）は《コイン×0》＝0コインで正常。
- **追加した EffectCost フィールド:** `fieldDown` / `discardUpTo` / `handBottomDeck` / `handExileSelf` / `selfToDeckBottom` / `selfPowerDown` / `fieldToLrigTrash` / `energyTrashColorAll` / `energyTrashSelf` / `acceTrash` / `chargeCounterRemove` / `trapToHand`。
- **追加した parseCost パターン例:** 混色コスト（`《白/赤》×N`）、`アップ状態のシグニN体をダウンする`→`fieldDown`、`手札をすべて捨てる`→`discardAll`、`手札からカード名に《XXX》を含むカードをN枚捨てる`→`discard+discardFilter`、`ルリグデッキからアーツN枚をルリグトラッシュに置く`→`trashArtsFromLrigDeck` ほか多数。

---

## 無発火【出】効果の系統修正（v0.261〜v0.263）

- **症状:** 【出】効果のコストが未表現で効果が無発火だった。
- **修正:**
  - v0.261: 【出】《コイン》コスト未表現で38枚が無発火 → `EffectCost.coin` 追加＋モーダル対応。
  - v0.262: 同型系統調査で230件検出、`discardFilter`/`energyTrash` 追加で244効果に付与。
  - v0.263: 残105件→12件。`EffectCost` 拡張（fieldTrash 等）、`TargetFilter` に `hasIcon`/`hasLifeBurst`、英知14件は `mandatory:true`＋`EICHI_LEVEL_SUM` ゲート化。

---

## アクション不一致 0 件達成（v0.247〜v0.254）

effects JSON ⇔ CardData CSV の全件照合で発見した誤りを系統的に解消（修正前 643 issues → 0 件、全12シート全カテゴリ）。

- **v0.247:** `effectParser` の接頭辞バグ（【ライド】【ライズ】等で `parseBlock` がブロック全体を破棄）→ `stripKeywordPrefixes` 追加。効果未定義 33 枚を追加。`verifyEffects` の Sheet8 BOM スキップバグ修正（866枚が無検証だった）。
- **v0.248:** 【レイヤー】を `GRANT_FIELD_SIGNI_ABILITY`（CONTINUOUS 宣言型）で実装。
- **v0.249:** タイミング不一致 113 件を全シート 0 に。`POWER_MODIFY` に `excludeSelf`（「あなたの他のシグニ」対応）。
- **v0.250:** `effectExecutor.ts` の文字化け破損（PowerShell CP932 誤読由来）を掃討。→ [DESIGN.md](./DESIGN.md) §6 のエンコーディング注意。
- **v0.251〜v0.253:** ①②③④選択肢解析を `choiceTextParser.ts` に共通化。Sheet 別に残件を 0 化。
- **v0.254:** 残り全シートを JSON 修正約100カードで解消し 0 件達成。

---

## keyword_grants 英語コード不一致（2026-06-17）

- **症状:** 付与したキーワード能力が常時非発火。`keyword_grants` は日本語の正式名（'シャドウ'/'ランサー' 等）で照合するのに、3箇所が英語短縮コード（'shadow'/'lancer' 等）を書き込んでいた。
- **該当箇所:** `execStubPart2.ts` の `GRANT_ABILITY_UNTIL_OPP_TURN` / `SIGNI_GRANT_QUOTED_CONSTANT_ABILITY`、`choiceTextParser.ts` の GRANT_KEYWORD 分岐。
- **修正:** 全て日本語の正式名に統一。

---

## 「対戦相手のアタックフェイズ開始時」の系統修正（2026-06-18）

- **症状:** パーサーが「あなた/対戦相手/各アタックフェイズ開始時」を無差別に timing `['ATTACK']` へ潰し owner 情報を喪失。さらに `'ATTACK'` は AUTO トリガーとしてディスパッチされず、該当 AUTO 効果は全く発火していなかった。
- **修正:** owner を区別して `ON_ATTACK_PHASE_START` に正しくマッピング・配線。あわせてバリア付与の no-op 化、シャドウ色スコープ符号化、多択ベットの誤分類、複合キーワード付与の SEQUENCE 化など複数の系統バグを修正。

---

## 【起】コストの支払い可否判定（2026-06-18）

- **症状:** 《ダウン》起動効果が、対象シグニが既にダウン済みでも再発動できた（WX01-072 等）。
- **修正:** `BattleScreen.tsx` の activatable フィルタに `down_self`（既ダウン）/`discard`（手札不足）を追加。`executeSigniActivated` 冒頭にも多重発動防止ガード。
