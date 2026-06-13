# 引き継ぎ: バグ修正ラウンド続き（2026-06-11 → zrom側Claudeへ）

## 🔜 2026-06-13 ymsty側: ON_LIFE_CRASHED CPU戦配線

### 現状サマリー（v0.280〜v0.284, zerom側 — デプロイ済み）

STUB_LOG（ログのみSTUB）**0件達成**。実装内容:

| version | STUB ID | 概要 |
|---------|---------|------|
| v0.280 | TREAT_AS_LEVEL1_IN_DECK_TRASH | `collectDeckTrashLevel1Nums`（effectEngine）＋`ExecCtx.deckTrashLevel1Nums`。execSearchでオーバーライドcardMap構築（Type:'シグニ', Level:'1'） |
| v0.281 | ARTS_SELF_RECYCLE_ON_TRIGGER | lrig_trash走査（collectTurnTriggers/collectFieldTriggers/performLifeBurstResponse）＋CHOOSE(pay/skip)＋lrig_deck shuffle |
| v0.282 | UNLIMITED_KEYS | `PlayerField.key_piece_extra`追加。lrig CONT検出→2枚目以降をkey_piece_extraへ。getKeyPieceActionsで全キー対応 |
| v0.283 | DECLARE_ZONE_FOR_CLASS_CHANGE | `applyDeclaredZoneClassOverride`（effectEngine）＋`declared_class_zones`（PlayerState）。全6 ExecCtxサイトに適用 |
| v0.284 | BUFF_HOST_WHEN_PLACED_UNDER | TRAP_OPERATION拡張（の下に置いてもよい検出＋メモリア名フィルタ）＋INTERNAL_PLACE_SELF_UNDER_SIGNI（trash→signi stack配置＋ON_PLACED_UNDER_SIGNI即時発火）。E2 actionをSTUBのみに変更 |

### ymsty担当タスク: ON_LIFE_CRASHED CPU戦配線

v0.255でON_LIFE_CRASHED（WXDi-P02-037 ダッキ）は`handleLifeBurstResponse`経由で**人間戦は配線済み**。
未対応の近似: **CPU自身のライフがクラッシュされた場合は発火しない**（cpuTurnActionがcheckを直接消化するため）。

#### 配線ポイント（推定）
- `cpuTurnAction` 内でCPUの`check`（クラッシュカード）を消化する箇所（`triggerPendingCrash`相当）に
  `collectSelfEventTriggers('ON_LIFE_CRASHED', cpuState, humanState, ...)` を追加してスタックに積む
- `performLifeBurstResponse`を呼ぶか、その中で ON_LIFE_CRASHED を収集している部分をCPU側にも適用

#### 完了基準
- CPU戦でダッキ（WXDi-P02-037）がCPUフィールドにいるとき、**CPUのライフがクラッシュされるとダッキのドロー効果が発火**する
- tsc 0 / lint 0 errors / vercel deploy --prod

### その他残課題（優先度順）

1. checkAllEffects MANDATORY_SUSPICIOUS 102件の精査・本物バグ抽出
2. CPU AI拡張（メインフェイズでのアーツ/スペル/起動効果使用）
3. 課題A: 「場に出す」効果のゾーン選択化（effectExecutor.ts `execAddToField` 等）

---

> ## ✅ 2026-06-13 ymsty側: 残4カード対応（可変コスト1枚 / アーツSTUB付与 / 正スキップ確認）（v0.278）— デプロイ未実施→zerom側で
>
> tsc 0 / lint 0 errors（28警告、既存同数）。機構未対応カード **残0件**。**`vercel deploy --prod` をzerom側で行うこと**（v0.275+v0.276+v0.277+v0.278まとめてデプロイ）。
>
> ### WDK13-011-E2（可変コスト）: 1枚以上の宇宙シグニを捨て→レベル合計と一致する相手シグニをバニッシュ
> - **新EffectCost.discardVariable `{filter?, min}`**: 1枚以上の可変枚数手札捨てコスト（min未満では発動不可）
> - **新TargetFilter.levelEqDiscardLevelSum**: `last_activated_discard_level_sum`（捨てたカードのレベル合計）と一致するシグニを絞り込む
> - **新PlayerState.last_activated_discard_level_sum**: discardVariableコスト支払いで捨てたカードのレベル合計を保存。次の発動まで保持
> - **execBanish内解決**: `matchesFilter`にはPlayerState非渡しのため、levelEqDiscardLevelSumを発動前に具体的な`level:N`値に変換してfieldCandidatesへ渡す
> - **シグニ起動モーダル**: discardVariableのフィルタ表示＋複数選択UI（min枚以上選択しないと「発動」ボタンが無効）
> - **executeSigniActivated拡張**: `discardVarIndices?: Set<number>` パラメータ追加、捨てカードのレベル合計計算、trash追加、last_activated_discard_level_sum更新
>
> ### WX25-P2-001（アーツSTUB内 GAIN_ABILITY_THIS_GAME付与2効果）
> - **新PlayerState**: `lrig_barrier`（ルリグバリア残数）/ `game_guard_barrier_act`（ガードシグニ捨て→バリア【起】付与フラグ）/ `game_opp_guard_extra_colorless`（相手ガード追加《無》コスト、ゲーム長）
> - **GAIN_ABILITY_THIS_GAME STUB拡張** (execStubPart1.ts): テキストマッチで上記3フラグを付与
> - **collectOppGuardExtraColorlessCost拡張**: `game_opp_guard_extra_colorless`フラグも追加コスト判定に含む
> - **getMyLrigFieldActions**: `game_guard_barrier_act`がtrueの場合、MAINフェイズにガードシグニ捨て→バリア【起】ボタンを表示
> - **executeGuardBarrierAct**: 手札からガードアイコン持ちシグニを1枚選択して捨てる→`lrig_barrier+1`。GUARD_BARRIER_ACTをactions_doneに記録（once_per_turn相当）
> - **performGuardResponse拡張**: ルリグアタック時、`lrig_barrier > 0`ならダメージ無効（prevent_next_damageより優先）し`lrig_barrier-1`
> - **ガード応答モーダル**: ルリグバリア発動ボタンを追加（`lrig_barrier > 0`時のみ表示）
>
> ### 正しいスキップ確認（変更なし）
> - **WXK10-026**: DISCARD_BY_POWER_MATCH STUBがスタブ内で手札捨てを自己処理しているため、コスト付与すると二重払いになる。変更不要（正しい）
> - **WX25-P3-088**: v0.275でコスト付与済み（`discard:1, discardFilter:{cardType:'シグニ', story:'微菌'}`）＋timing ON_DISCARDED_AS_COSTに修正済み。変更不要（正しい）

> ## ✅ 2026-06-13 ymsty側: 【起】手札から自身を捨てて発動する型 8カード対応（v0.277）— デプロイ未実施→zerom側で
>
> tsc 0 / lint 0 errors（28警告、既存同数）/ checkAllEffects 0 / verifyEffects全12シート0件維持。**`vercel deploy --prod` をzerom側で行うこと**（v0.275+v0.276+v0.277まとめてデプロイ）。
>
> ### 新スキーマ・機構
> - **CardEffect.handActivated?: boolean**: 手札から起動できる【起】効果フラグ。BattleScreenのgetMyHandCardActionsで検出しボタン表示
> - **EffectCost.discardSelfFromHand?: true**: 自分自身を手札から捨てることがコスト。executeHandActivated内でコスト支払い処理
> - **State: pendingHandActivated / selectedHandActivatedCost**: 手発動モーダル用のstate
> - **executeHandActivated**: 手コスト支払い（自身をtrashへ）＋エネルギーコスト支払い＋スタックへ積む。ON_DISCARDED_AS_COST/ON_HAND_DISCARDEDトリガーも収集
> - **getMyHandCardActions拡張**: MAIN/ATTACK_ARTSフェイズで`handActivated`効果を持つカードに【起】ボタン表示
> - **モーダルUI**: エネルギーコストの色選択＋「発動する（このカードを捨てる）」ボタン
>
> ### JSON更新 8カード
> - **WX17-031-E3**: handActivated=true / cost:{discardSelfFromHand:true, energy:[{color:'白',count:1}]} / POWER_MODIFY self ALL
> - **WX18-029-E2**: handActivated=true / cost:{discardSelfFromHand:true, energy:[{color:'黒',count:1}]} / DRAW
> - **WX18-053-E1**: handActivated=true / cost:{discardSelfFromHand:true, energy:[{color:'赤',count:1}]} / POWER_MODIFY ALL
> - **WX18-055-E1**: handActivated=true / cost:{discardSelfFromHand:true, energy:[{color:'青',count:1}]} / BOUNCE or ENERGY_CHARGE（CHOOSE）
> - **WX19-022-E3**: handActivated=true / cost:{discardSelfFromHand:true, energy:[{color:'緑',count:1}]} / DRAW
> - **WX19-045-E1**: handActivated=true / cost:{discardSelfFromHand:true, energy:[{color:'無',count:1}]} / ADD_TO_LIFE
> - **WXK11-067-E1**: handActivated=true / cost:{discardSelfFromHand:true, energy:[{color:'黒',count:1}]} / BANISH+DRAW
> - **WXDi-P08-070-E1**: handActivated=true / cost:{discardSelfFromHand:true} / DRAW×2（エネルギーコストなし）
>
> ### 残り4カード（v0.277→v0.278で全解消）
> - **WDK13-011**（可変コスト）/ **WX25-P2-001**（アーツSTUB付与）/ **WXK10-026**・**WX25-P3-088**（正しいスキップ）→ v0.278で完了

> ## ✅ 2026-06-13 ymsty側: 【起】手札すべて捨てコスト 6カード対応（v0.276）— デプロイ未実施→zerom側で
>
> tsc 0 / lint 0 errors（28警告、既存同数）/ checkAllEffects 0（警告12既存同数）。**`vercel deploy --prod` をzerom側で行うこと**（v0.275+v0.276まとめてデプロイ）。
>
> ### 新スキーマ・機構
> - **EffectCost拡張**: `discardAll: true`（手札をすべて捨てる、自動・選択不要）、`energyTrashAll: true`（エナゾーン全トラッシュ、自動）
> - **PlayerState拡張**: `last_activated_discard_count`（【起】コスト支払いで捨てた合計枚数、手札+エナ）、`game_actions_done`（once_per_game追跡、ターンリセット対象外）
> - **Condition追加**: `ACTIVATED_DISCARD_COUNT_GTE: {value: N}`（捨てた合計枚数 ≥ N を判定。evalCondition / effectExecutor CONDITIONAL内で動作）
> - **BattleScreen**: executeSigniActivated / executeLrigGrantedの両方でdiscardAll/energyTrashAllを自動支払い。モーダルに「手札N枚をすべて捨てます」表示（選択UI不要）。once_per_gameの可用性チェックをシグニ・ルリグ両方に追加
>
> ### JSON更新 6カード
> - **WX05-022-E2** (C.M.R 手札すべて捨て BANISH): cost discardAll + once_per_turn / CONDITIONAL(≥2)→BANISH、else=空
> - **WX10-037-E3** (シヴァ 手札すべて捨て ADD_TO_LIFE): cost discardAll / CONDITIONAL(≥4)→ADD_TO_LIFE×1（count:4→1バグ修正）、else=空
> - **WXEX2-48-E3** (アスモデ 手札すべて捨て 場に出す): cost discardAll + once_per_turn / CONDITIONAL(≥2)→悪魔3体まで、else→悪魔Lv3以下1体
> - **WXDi-P09-006-E2** (レイラ=オーバーテイク 手札すべて捨て GUARD不可): cost discardAll + once_per_game / BLOCK_ACTION（近似: 全アタック間）
> - **WXDi-P16-012-E3** (アト=トレ エナ全+手札全捨て ライフに加える): cost energyTrashAll+discardAll + once_per_game / CONDITIONAL(≥5)→SHUFFLE_DECK+ADD_TO_LIFE、else=空
> - **WX25-P3-019-E2** (ヒラナ エナ全+手札全捨て ドロー+エナチャ): cost energyTrashAll+discardAll + once_per_game / SEQUENCE[DRAW×3, ENERGY_CHARGE×3]（DRAWが欠落していたバグ修正）
>
> ### 残り12カード（v0.275残の18→さらに6解消）
> - **「手札からこのカードを捨てる」型 8枚**（WX17-031等）: 手札から自己起動＝機構未実装
> - **「手札をすべて捨てる」型 残4枚**（WX05-022, WX10-037はv0.275残扱いだったが今回解消。残: WX05-022/WX10-037完了）
> - **正しいスキップ 2枚**: WXK10-026 / WX25-P3-088（修正済み）。**WDK13-011（可変）・WX25-P2-001（アーツSTUB）も引き続き未対応**
>
> ### 近似メモ
> - WXDi-P09-006-E2: 「次のアタック時のみガード不可」→「このターン中ガード不可」（BLOCK_ACTION END_OF_TURN）
> - 「手札からこのカードを捨てる」型（自己コスト手発動）はゲームエンジン側で機構未実装のため引き続きスキップ

> ## ✅ 2026-06-13 ymsty側: 【起】手札捨てコスト ラウンド2 — 残51カード中33カード解消（v0.275）— デプロイ未実施→zerom側で
>
> v0.266の残り（混合/可変/キー/STUB型 ≈50）のうち表現可能な分を解消した。51→18カード（スキャンは
> tmp_verify/scanActivatedHandDiscardCost.mjs、ymsty側gitignore）。tsc 0 / lint 0 errors（28警告、既存同数）/
> checkAllEffects 0（警告12既存同数）/ verifyEffects全12シート0 / tsxスモークテスト60項目PASS。
> **`vercel deploy --prod` をzerom側で行うこと**（v0.275）。
>
> ### 一括付与 26効果（tmp_verify/tagActivatedDiscardCosts.mjs拡張、gitignore対象）
> - **discardFilterの語彙拡張で付与**: story配列（＜鉱石＞か＜宝石＞等）/ color配列 / 色+クラス複合 /
>   cardName（《フレイスロ》を含む・《究極　ニパ子》・《ディソナアイコン》='//ディソナ'）/ hasIcon:'クロス' /
>   hasGuard / level:N / ＜クラス＞の「カード」（シグニ限定なし、ブルアカ・プリオケ12枚）。
>   matchesFilterは全て対応済みのためエンジン変更不要。シグニ【起】モーダルのフィルタラベルに
>   level/hasIcon/hasGuard表示を追加
> - **handDiscardSigniのcolor/story配列対応**（types/effects.ts + ルリグ【起】モーダル判定・ラベル3箇所、
>   `fmtHandDiscardSigniLabel`新設）
> - **trash読みSTUBへの付与は必須だった**: POWER_MOD_MIRROR（WXK06-049）/ POWER_UP_BY_DISCARDED_SIGNI_POWER
>   （WDK08-Y01）は`trash.at(-1)`=捨てカード前提の実装なのに、コスト未付与でtrash末尾を誤読する実バグだった。
>   DISCARD_BY_POWER_MATCH（WXK10-026）はスタブ内で自己処理のため引き続き付与しない（二重払い防止）
>
> ### 新スキーマ `discardGroups`: 混合手札捨てコスト 3カード（WX04-003/WX12-024/WX20-Re07）
> - `cost.discardGroups: {count, filter?}[]`（「スペル１枚と＜原子＞のシグニ１枚を捨てる」等）。
>   充足判定は `canSatisfyDiscardGroups`（execUtils、バックトラック割当。青黒両色カードの交差ケース対応）
> - シグニ【起】モーダルとルリグ【起】モーダル両方で選択UI対応（支払いは従来のindexベースで変更なし）
>
> ### 手動修正 5カード（tmp_verify/fixActivatedDiscardRound2.mjs）
> - **WX11-003 花代・肆**: E1が【起】2ブロックの誤マージ（アサシン付与+バニッシュが1つのSEQUENCE、
>   コスト1回で両方実行）→ E1/E1Bに分割。アサシン対象も誤り（any/無フィルタ→自分の赤シグニ）、
>   BANISHのstory[鉱石,宝石]はコスト側の条件だったため対象フィルタから除去
> - **WXEX2-12-E3**: handDiscardSigni青1付与 / **WXDi-P10-042-E2**: discard+スペルfilter付与 /
>   **PR-046-E3**: discard+白か青filter付与（併せてFREEZE対象owner self→any修正）
> - **WX25-P3-088-E2 アオミドロ（実バグ）**: 「能力のコストとしてこのカードが捨てられたとき」が
>   ON_PLAYに誤マッピングされ**場に出た時に発火していた** → ON_DISCARDED_AS_COST（v0.257配線済み）に修正
> - 1:1不一致の原因はテキスト中の【起】参照（【常】の「【起】能力」・引用付与能力内の【起】）による
>   ブロック数の水増しだった
>
> ### 残り18カード（スキーマ/機構が未対応のため意図的スキップ）
> - **「手札からこのカードを捨てる」型 8枚**（WX17-031/WX18-029/WX18-053/WX18-055/WX19-022/WX19-045/
>   WXK11-067/WXDi-P08-070）: 手札からの起動＝自身がコストという機構自体が未実装
> - **「手札をすべて捨てる」型 6枚**（WX05-022/WX10-037/WXEX2-48/WXDi-P09-006/WXDi-P16-012/WX25-P3-019）:
>   discardAllスキーマ+「この方法でN枚以上捨てた場合」の枚数条件ゲートが必要（後半2枚はエナ全トラッシュとの複合）
> - **可変 1枚**（WDK13-011 1枚以上捨てる・レベル合計参照）/ **アーツ 1枚**（WX25-P2-001、STUB能力付与内）/
>   **正しいスキップ 2枚**（WXK10-026=スタブ自己処理、WX25-P3-088=トリガー誤検出・timing修正済み）。
>   なおキー4枚（WXK10-015/016/019, WDK10-009）はv0.267-274のキー【起】discard UI追加で解消済みだった

> ## ✅ 2026-06-13 ymsty側: 残作業2件を実施（v0.265/v0.266）— デプロイ未実施→zerom側で
>
> tsc 0 / lint 0 errors（28警告、既存同数）/ checkAllEffects 0（警告12既存同数）/ verifyEffects全12シート0 /
> スモークテスト11項目PASS。**`vercel deploy --prod` をzerom側で行うこと**。
>
> ### v0.265: ON_OPP_VIRUS_REMOVED / ON_OPP_VIRUS_CHANGED 配線（残課題2の完了）
> - PlayerStateに `opp_virus_placed_just` / `opp_virus_removed_just` 新設（監視者=ウィルスが増減した場から見た対戦相手側にセット）
> - 設定点: execPlaceVirus即時配置 / resumeSelectVirusZone / PLACE_VIRUS_CENTER（置く）、
>   REMOVE_VIRUS / INTERNAL_REMOVE_VIRUS_N / INTERNAL_RV_BATCH_TRANSFER / INTERNAL_ECRV_APPLY（除去）、
>   removeOppVirusコスト支払い（BattleScreen executeSigniOnPlayCost内）
> - BattleScreen新useEffect（hand_revealed_justと同パターン）がフラグ検出→collectSelfEventTriggers
>   （timing2種追加）で発火・クリア。**CPU戦はCPU側（guest固定）フラグも人間クライアントが処理**
> - 近似: 複数個の同時増減は1イベント扱い（ペズトは1回のみ発火）/ 盤面リセット系STUB（execStubPart1 L3352付近）の
>   ウィルス消滅では発火しない / 効果オーナー以外のプレイヤー側の監視シグニは発火しない（該当カードは現状なし）
>
> ### v0.266: 【起】手札捨てコスト 53効果/51カードに付与（v0.264発見の102カード系統穴の安全サブセット）
> - **シグニ【起】モーダルにdiscardFilter対応を追加**（従来は素のdiscardのみ。【出】モーダルと同じ
>   matchesFilterゲート+薄表示）。シグニは `discard+discardFilter`（色/＜クラス＞=story/シグニ/スペル）で付与
> - **handDiscardSigniスキーマ拡張**: `{color?, story?, count}`（colorをオプション化しstory追加）。
>   ルリグ【起】の「＜クラス＞のシグニN枚」7件に対応（モーダルの判定・ラベル3箇所も対応）
> - 付与はnth【起】ブロック↔nth ACTIVATED効果の1:1対応が取れたカードのみ（tmp_verify/tagActivatedDiscardCosts.mjs、
>   gitignore対象）。**残りスキップ分**: 1:1不一致4（WX11-003/WXEX2-12/WXDi-P10-042/WX25-P3-088）/
>   キー4（WXK10-015/016/019, WDK10-009、キー【起】モーダルにdiscard UIなし）/ STUB action 3
>   （WXK06-049-E3/WXK10-026-E2/WDK08-Y01-E2、スタブ内で自己処理の可能性）/
>   混合・可変・「すべて捨てる」型（WX04-001/WX04-003/WX05-022等、スキーマ未対応）≈50カードは未表現のまま

> ## ✅ 2026-06-13 ymsty側: ユーザー報告バグ4件の修正（v0.264）+ 🚨 新規系統穴の発見（下記）
>
> **デプロイ未実施（ymsty側に権限なし）→ zerom側で動作確認のうえ `vercel deploy --prod` を行うこと**。
> tsc 0 / lint 0 errors（warning 28、既存同数）/ checkAllEffects 0（警告12、既存同数）/
> verifyEffects 全12シート issues 0 / tsxスモークテスト13項目PASS。
>
> ### 修正1: WX01-005 ピルルクΩの【起】手札コストが支払われていなかった
> - JSONに`cost`が丸ごと欠落（「手札から青のシグニを１枚捨てる」）→ `cost:{handDiscardSigni:{color:'青',count:1}}` 付与。
>   ルリグ【起】モーダル（pendingLrigGranted）はhandDiscardSigniの選択UI・検証・支払いを既に完備しており、JSONのみで解決
>
> ### 修正2: WX01-031 コードハートVACの【常】スペルコスト軽減が機能していなかった
> - **原因**: `calcActiveCostMods`（effectEngine.ts）がCONTINUOUSの`COST_INCREASE`しか収集せず、
>   `COST_REDUCTION`はeffectExecutorでもログのみの未実装で**どこからも参照されていなかった**
> - **エンジン**: `extractCostReductions`新設 → ActiveCostModに `direction:'decrease'` + `cardColor`（対象カード色制限）で収集。
>   isGrowCost付きはスキップ（グロウはGROW_COST_REDUCTION経路）
> - **BattleScreen**: `applyContinuousCostDecreases(cost, cardType, cardColor, mods)` 新設。
>   スペル発動モーダルとアーツ選択モーダルの`computeArtsEffectiveCost`直後に適用
>   （アーツ支払いモーダルへはpendingArtsEffectiveCost経由で伝播）。《無》軽減は無色部分のみ減る
>   （removeNColorFromCostの挙動どおり、ルール準拠）。**カットインアーツ経路には未適用**（既存のコスト軽減全般が
>   未適用の経路のため従来どおりの近似）
> - **JSONデータバグ3件を併せて修正**: WX01-031-E1とWX03-028-E1の`reduction:[{color:'無×1'}]`→`'無'`
>   （破損気味のパース値）、WX12-024-E2（†C・C・M†）に色フィルタ`color:'青と黒'`欠落
>   （全色スペルに効く定義だった）。これでWX03-028（青アーツ軽減）とWX12-024も同時に直った
> - 残: ACTIVATED/AUTO/LIFE_BURSTの一時的COST_REDUCTION（WX04-008等10件）は状態機構がなく未実装のまま
>
> ### 修正3: WD19-015 クロコウジが相手の場にウィルスがあっても【出】でさらに置けた
> - 「対戦相手の場に【ウィルス】がない場合」の条件がJSON欠落 → 新ActiveCondition
>   `{type:'VIRUS_COUNT', owner, operator, value}` を新設（types/effects.ts + effectEngine checkActiveCondition）し、
>   `activeCondition:{type:'VIRUS_COUNT',owner:'opponent',operator:'eq',value:0}` を付与。
>   v0.263のON_PLAY収集3箇所のactiveConditionゲートで人間召喚/グロウ/CPU召喚すべて効く。
>   同型テキストのWX20-030はSTUB（SELF_TRASH_IF_NO_OPP_VIRUS）内で条件判定済みのため対象外
>
> ### 修正4: 空きゾーンのウィルスが見えなかった（UI）
> - StackedSigniSlot（BoardComponents.tsx）の空ゾーン分岐にウィルス表示がなかった（「V」バッジは
>   シグニがいる分岐のみ）→ 空ゾーンに 🦠 VIRUS 表示 + 赤破線ボーダー。トラップ/マジックボックス/シード
>   と共存する場合は右上「V」バッジで表示
>
> ### 🚨 新規発見: 【起】の手札捨てコスト未表現が102カード（WX01-005と同型の系統穴）
> - スキャン: CSVの【起】コスト部（「：」より前）に「手札から…捨てる」があるのに、対応ACTIVATED効果に
>   `cost.discard`/`cost.handDiscardSigni`が無いもの = **102カード**（スクリプトはymsty側
>   tmp_verify/scanActivatedHandDiscardCost.mjs、gitignore対象なので再作成要）。
>   ON_PLAY（v0.262の230件）と違いACTIVATEDは**コスト無しで発動できてしまう**（無発火ではなく踏み倒し）
> - **一括付与は要注意**: 支払いUIの対応がパスごとに違う。ルリグ【起】（executeLrigGranted）は
>   handDiscardSigniのみ、シグニ【起】（executeSigniActivated）はdiscard+discardFilterのみ対応。
>   対応外のコスト型を付けると**発動不能になる退行**を起こすため、パスごとのUI対応確認
>   （または共通化）とセットで行うこと。混合コスト（「スペル１枚と＜原子＞１枚」等）はスキーマ拡張も必要
> - なお本スキャンは手札捨てのみ。【起】のウィルス除去コスト（WX20-030-E2等）・エナカード指定等、
>   他のコスト型にも同様の穴がある可能性が高い

> ## ✅ 2026-06-12 zerom側: ONPLAY_DEAD_OPTIONAL 105件 → 12件（v0.263）
>
> v0.262の残課題1を実施。未表現だった【出】コストのスキーマを拡張し、105件中93件を解消した。
> tsc 0 / lint 0 errors（warning 28、既存同数）/ checkAllEffects 0 / verifyEffects 全12シート issues 0 /
> tsxスモークテスト18項目PASS。v0.262と合わせてv0.263としてデプロイ済み。
>
> ### スキーマ追加（types/effects.ts EffectCost）と【出】コストモーダル対応
> - `fieldTrash {count, filter?, excludeSelf?}`: 場の自分シグニをトラッシュ（ゾーン選択UI、チャーム/アクセも一緒にトラッシュ。
>   ON_LEAVE_FIELD等のトリガーは発火しない近似）
> - `handToEnergy {count, filter?}` / `handToUnderSelf {count, filter?}`: 手札→エナ / 手札→このシグニの下
>   （手札選択UIをdiscardと共用。同一効果での併用は不可）
> - `lrigDown {count, centerOnly?}`: アップ状態ルリグをダウン（センター→アシストL→Rの順で自動支払い。
>   **PlayerState.fieldに `assist_lrig_l_down`/`assist_lrig_r_down` を新設**、ターン交代時リセット4箇所対応。
>   UIにアシストのダウン表示はない=コスメティック課題）
> - `lifeTrash` / `lifeToHand` / 既存`life_crash`の支払い対応（ライフ上から自動。
>   **life_crashコストはバースト不発でトラッシュへの近似**）
> - `deckTrash` / `charmTrash` / `removeOppVirus`（自動支払い。ウィルス除去とチャームは左ゾーンから自動選択。
>   removeOppVirusのみ相手stateを別updateで書き込み）
> - `none: true`: コストなし任意【出】（発動確認のみのモーダル）
> - TargetFilterに `hasIcon: 'クロス'|'ライズ'|'トラップ'|'アクセ'`（カードテキストのキーワード有無で判定する近似）と
>   `hasLifeBurst` を追加（execUtils matchesFilter）
>
> ### 英知=N 14件: コストでなく条件として解決
> mandatory:true + activeCondition(EICHI_LEVEL_SUM、既存実装) に変更し、
> **ON_PLAY収集3箇所（handleSummonSigni / executeGrow / CPU召喚）に activeCondition ゲートを追加**
> （満たさない【出】は発火しない）。
>
> ### 可変手札捨て型 11件: COUNT_BASED_DRAW_OR_POWER スタブで自己完結化
> - CBDPの捨て正規表現を拡張: 「手札から＜クラス＞のシグニをN枚まで捨てる」（候補をクラスでフィルタ）、
>   「手札を好きな枚数捨てる」
> - INTERNAL_CBDOP_AFTER_DISCARD に新分岐: 「1枚につき【エナチャージN】」「1枚につきカードを1枚引く」
>   「それのパワーを…1枚につき－N」（単体対象×枚数倍）
> - 対象カードは action→CBDP置換 + mandatory:true（オニオコゼ/アザエラ翼/タウィル/まほまほは既にCBDPでフリップのみ）
>
> ### JSON付与 105効果（tmp_verify/addDeadOptionalCosts.mjs、gitignore対象）
> 内訳: fieldTrash14 / discard+filter16（hasIcon/hasLifeBurst/ディソナ=cardName'//ディソナ'）/ 英知14 /
> energyTrash13 / handToEnergy8 / handToUnderSelf5 / lrigDown7 / ライフ系8 / coin2（ホログラフ・オーネスト）/
> removeOppVirus3 / deckTrash2 / charmTrash1 / none1 / CBDPフリップ11。
> 実バグ修正2件: WXDi-P14-006遊月燦のLIFE_CRASH owner self→opponent（自分のライフを削っていた）、
> WDK17-014キュルビウスのSEQUENCE二重パワー修正（-7000と-10000が両方適用される定義→-7000のみの近似に）
>
> ### 残り12件（意図的スキップ、`--warnings`で列挙）
> - チャーム可変数+リンク（ダエワ）/ 全シグニ+手札+エナ全トラッシュ（DJ.LOVIT）/ シグニ下からトラッシュ
>   （ダリチュー・ゲンダ）/ トラッシュ→デッキ下（フウカ）/ ルリグデッキからアーツ（マリゴールド・ゴルスペ、
>   UIセクション未実装）/ ルリグダウン可変数+レベル比例（ベロド）/ ビートコスト（ヘーリオス・ナーキル）/
>   手札とエナ全部（レイラ乱舞）/ スペルのON_PLAY警告（リング・ドロー、ピース/スペル経路はqueueCardEffectsが
>   全効果を積むため実際は発火する誤検出に近い）
> - 近似メモ: シャフリ（Lv1+Lv2各1→Lv2以下2体）、Sk（同レベルリンクなし）、アタランテ/アト（異クラス制約なし）、
>   モモタロ（3種各1→cardNames3枚）、OPA（共通色なし）、USS（Lv1-4各1なし）、イモイシ（鉱石+宝石各1なし）、
>   パンジャン（ダウンしたルリグとの共通色リンクなし）、クロス・ライフ・クロス（加える側がデッキ上のまま）
> - ピース/キーの【出】は従来どおりqueueCardEffects経由で**コスト支払いなしの無条件発火**（v0.261既知）。
>   今回タグ付けしたコストはピースでは支払われない（データとしては正しい表現になった）

> ## ✅ 2026-06-12 ymsty側: コインバグ同型の系統調査 — 無発火【出】230件の検出と244コスト付与（v0.262）
>
> v0.261のコイン【出】バグ（mandatory:false+costなしは収集から漏れて無発火）が**なぜ全検証0件をすり抜けたか**を
> 分析し、同型バグを系統的に検出・修正した。**デプロイ未実施（ymsty側に権限なし）→ zerom側で動作確認のうえ
> `vercel deploy --prod` を行うこと**。tsc 0 / lint 0 errors（warning 28、既存同数）/ checkAllEffects 0 /
> verifyEffects 全12シート issues 0。
>
> ### 見逃しの原因分析（再発防止のため記録）
> 1. **verifyEffectsのコスト語彙が6色のみ**: `extractCostFromText` が《コインアイコン》を抽出できず、
>    テキスト側「コストなし」vs JSON側「コストなし」の空対空一致で**空振りPASS**していた
> 2. **checkAllEffectsのOPTIONAL_SUSPICIOUS除外が「テキストにコスト⇒JSONにcostがある」を暗黙の前提に**:
>    『全効果がON_PLAY+CSVに【出】…：があればmandatory:falseは正しい』の除外（L300-318付近）で、
>    JSON側に`cost`が実在するかを確認していなかった（ここに1条件あれば38枚全て検出できた）
> 3. **エンジン収集フィルタが非網羅で無音**: mandatory:false+costなしはどちらのバケツにも入らず警告なく消える
> 4. **「無発火」を検出する検証が存在しない**（静的なテキスト↔JSON照合のみ）
>
> ### 系統調査の結果: 同じ穴に【出】230件・【起】コイン約130件が残っていた
> - **コストなし任意【出】（mandatory:false+costなし）= 230効果**が無発火。全件に実コストあり
>   （純粋な「してもよい」は0件）。内訳: 手札捨て103 / エナカード指定31 / エナ色2 / 自己犠牲14 /
>   デッキ2 / ライフ5 / その他（英知・ルリグデッキ・アップルリグダウン等）65 / 特殊8
> - **【起】《コインアイコン》コストも全件未表現**（HANDOFFの「未調査」が定量化: メモリア/ディソナ/THE DOOR系
>   シグニ約130効果）。コイン支払いなしで発動できていた
>
> ### 修正内容
> 1. **スキーマ拡張**（types/effects.ts EffectCost）: `discardFilter?: TargetFilter`（フィルタ付き手札捨て）、
>    `energyTrash?: {count, filter?}`（エナゾーンからのカード指定トラッシュ）
> 2. **JSON一括付与 計244効果**（使い捨てスクリプト tmp_verify/addOnPlayCosts.mjs / addActivatedCoinCosts.mjs、
>    gitignore対象）: 【出】113効果（discard+discardFilter / energyTrash / energy / coin。
>    v0.261の38枚から漏れていたWXDi系コイン7枚を含む）+【起】コイン130効果 + WXDi-P07-041（コイン×3+赤×1混合）。
>    1:1対応チェック（コストブロック数=効果数）とエナ色整合チェック付きで適用、不一致はスキップ
> 3. **【出】コストモーダル**（BattleScreen）: discardFilter（対象外カードは選択不可・薄表示）、
>    energyTrash選択セクション新設、**複数コスト効果の連鎖**（remainingCostEffects、1効果ずつモーダル）。
>    **実バグ修正**: エナ参照が`my.energy`だった→`placedState.energy`（グロウ経路でグロウコストのエナが
>    復活する潜在バグ。コインのみルリグはLv1グロウコスト0のため顕在化していなかった）
> 4. **【起】コイン支払い対応**: executeSigniActivated（coins減算）+ モーダル（コイン表示・支払い可否判定）
> 5. **検証器強化**:
>    - verifyEffects: コスト語彙に《コインアイコン》追加（normCostがcost.coinを照合）
>    - checkAllEffects: 新警告 `ONPLAY_DEAD_OPTIONAL`（mandatory:false+costなしのON_PLAY検出。
>      0件ゲートとは別枠の警告セクション、`--warnings`で詳細）。**現在105件**（下記残課題）
>    - エンジン収集2箇所（handleSummonSigni/executeGrow）にconsole.warnで収集漏れを警告
>
> ### WD19-009 ニホコカビのバグ修正（ymsty報告分）
> - **BURST**: JSONが「任意のシグニ(any)に-8000」だった → 正は「ウィルスを置いたそのゾーンのシグニに-8000、
>   ウィルス済みゾーンも選択可」。PLACE_VIRUSに `powerDeltaOnZone?: number` を新設（types/effects.ts +
>   types/index.ts SELECT_VIRUS_ZONE + execPlaceVirus/resumeSelectVirusZone + モーダル/CPU自動応答）。
>   tsxスモークテスト3項目PASS（選択式/空きゾーン=配置+修正/ウィルス済み=修正のみ）
> - **E1**: timingが`ON_TURN_END`（「ターン終了時まで」を誤parse）で**毎ターン終了時に-5000が誤発火していた**
>   → 新timing `ON_OPP_VIRUS_REMOVED`（未配線=発火しない。誤発火よりはまし）+ usageLimit:once_per_turn。
>   **WX21-030（コビョウ）のE1も同型誤parse** → `ON_OPP_VIRUS_CHANGED`（未配線）に変更
>
> ### ウィルス「自分のゾーンに置かれる」報告の調査結果（ymsty報告分）
> エンジン・UI配線・JSON全31件のtargetOwnerを検証したが**自分の効果が自分の場に置くバグは発見できず**
> （エンジン単体テストPASS、方向チェック全OK）。有力な説明: v0.259-261でCPUの【出】/【自】が発火するように
> なったため、**CPU側ウィルス効果が（ルール通り）人間の場にウィルスを置くようになった**のが新挙動として
> 見えている可能性。CPUのゾーン選択は自動でモーダルが出ないため突然置かれたように見える。
> バトルログに「[相手] ◯◯の【出】効果」があればこれ。**実バグの再現報告があれば カード名+状況 を要確認**
>
> ### 残課題（zerom側 or 次ラウンド）
> 1. **ONPLAY_DEAD_OPTIONAL 105件**（`node scripts/checkAllEffects.mjs --warnings`で列挙）: コストが
>    スキーマ未対応で未表現のまま無発火。主な型: 英知=N（〜10件）/ 自己犠牲（場からトラッシュ14件）/
>    ライフコスト5件 / ルリグデッキからアーツ2件 / アップ状態ルリグをダウン7件 / 「手札をN枚まで捨てる」
>    可変コスト型（効果が枚数参照、〜10件）/ ディソナアイコン（フィルタ表現なし）/ クロス・ライズ等アイコン持ち /
>    シグニの下に置く / 手札からエナへ 等。スキーマ拡張（life_crash流用可のものあり）+モーダル対応が必要
> 2. **ON_OPP_VIRUS_REMOVED / ON_OPP_VIRUS_CHANGED の配線**: ウィルス増減点は execPlaceVirus/
>    resumeSelectVirusZone/PLACE_VIRUS_CENTER（置く）、execStubPart1 L917-1015・execStubPart2 L786（取り除く）。
>    acce_just_done と同じフラグパターンで配線可能
> 3. **キー【出】コインの無条件発火**は従来どおり未対応（executeKeyPieceがコストモーダル非経由。v0.261の既知）
> 4. CPUはコスト付き任意【出】を発動しない（従来どおり。コインのみ自動支払いはCPUグロウのみ）
> 5. 課題A（場に出す効果のゾーン選択化）は引き続き未着手

> ## ✅ 2026-06-12 zerom側: 【出】《コイン》コストの系統バグ修正 — WD19-004等38枚（v0.261）
>
> **報告**: WD19-004（ナナシ 其ノ壱）の【出】が発動しない。
> **原因**: 【出】《コインアイコン》のコイン コストがJSONスキーマに存在せず、該当効果は
> `mandatory:false` ＋ `cost`なし で出力されていた。executeGrow/handleSummonSigniの収集フィルタは
> mandatoryOnPlay（mandatory!==false）と costOnPlay（mandatory:false **かつcostあり**）の2種のみのため、
> **コスト無し任意扱いの効果は両方から漏れて一切発火しなかった**。同パターンは全CSVで38枚（コイン【出】持ち全ルリグ/キー）。
>
> ### 修正内容
> 1. **types/effects.ts**: `EffectCost` に `coin?: number` を追加
> 2. **JSON 38枚**: コイン【出】効果に `cost:{coin:N}` を一括付与（tmp_verify/addCoinCosts.mjs、gitignore対象）。
>    Nはテキストの《コインアイコン》連続数から導出（WD20-001=3、WD20-004/WD21-001=2、他=1）。
>    テキスト件数とJSON効果件数の1:1突き合わせで全38枚一致（手動確認0件）
> 3. **コスト支払いモーダル**（pendingSigniOnPlayCost / executeSigniOnPlayCost）: コイン表示
>    （所持数併記）・支払い可否判定・支払い（coins減算）対応。グロウ/召喚の両経路で機能
> 4. **WD19-004-E1**: 「黒のカード1枚」のTRANSFER_TO_HANDフィルタが空だった → `{color:'黒'}` 追加
> 5. **CPUグロウのパリティ**（CPU統一の続き）: CPUグロウ時にコイン獲得/グロウコイン消費が無かったのを追加。
>    ルリグ【出】も発火するように（mandatoryは常に、コインのみコストの任意【出】は支払えるなら自動支払いで発動）
>
> ### 検証・残課題
> - tsc 0 / lint 0 errors / checkAllEffects 0 / verifyEffects Sheet2-5 全て issues 0（退行なし）。v0.261デプロイ済み
> - **キーの【出】コイン（WXK07-004 真・遊月・鍵）は従来どおり支払いなしで無条件発火**
>   （executeKeyPieceがqueueCardEffectsで全AUTO/ON_PLAYを積む実装。コストモーダルは1効果しか扱えず
>   キーは2効果あるため未対応。修正するならモーダルの連鎖化が必要）
> - 【起】効果のコインコスト支払いは未対応（executeSigniActivated等。現状コインコスト【起】の有無は未調査）

> ## ✅ 2026-06-12 zerom側: CPU統一ラウンド2 — 残りのCPU独自実装を対人戦と共通化（v0.260）
>
> v0.259（シグニアタック統一）に続き、cpuTurnAction の残りの独自実装を共通関数化した。
> 抽出パターンは performSigniAttack と同じ（本体を `perform*` に抽出し、人間用 `handle*` は薄いラッパーに）。
>
> 1. **ルリグアタック**: `performLrigAttack({attacker, defender, attackerId, attackerKey})` 抽出。
>    CPU戦で **ON_ATTACK_LRIGトリガーが発火**、OPP_LRIG_ATTACK_COST・ドライブ状態・アタック無効化もCPUに適用。
>    アタック不可時は false を返す（CPU側はfalseならENDへ進む）。myLrigAttackExtraCost メモは関数内計算に置換し削除
> 2. **ガード応答**: `performGuardResponse(handIndex, {responder, attacker, responderId, attackerId, responderKey})` 抽出。
>    CPUの被ルリグアタックで **prevent_next_damage・PREVENT_LRIG_DAMAGE（手札0条件）・人間ルリグのダブルクラッシュ**が
>    有効に（従来は素通り）。handIndex=null=ガードしない。CPUは常にnull（将来のAI強化はindexを渡すだけ）
> 3. **ライフバースト**: `performLifeBurstResponse(activate, targetCardNum, {owner, opponent, ownerId, ownerKey})` 抽出。
>    CPUのライフクラッシュで **ON_LIFE_CRASHEDが発火**（v0.255の既知の近似を解消）、CRASH_TO_TRASH_INSTEAD対応。
>    **CPUはLIFE_BURST効果を持つカードなら発動するようになった**（従来は常に不発動→CPU強化）。
>    queueCardEffects に owner引数（{id,key}、省略時従来通り）を追加
> 4. **同時クラッシュ予約の消化**: CPUの pending_crashed_cards を check へ順次昇格する処理を cpuTurnAction に追加
>    （人間側 triggerPendingCrash 相当）。**従来は人間のダブルクラッシュ2点目がCPU戦で消えていた実バグの修正**。
>    CPU行動useEffectの発火条件・depsにも pending_crashed_cards を追加
> 5. **スペルカットインパス**: CPU独自のスペル解決30行を削除し `handleCutinPass()` を呼ぶだけに
>    （caster_idベースで既に汎用だった）。CPU戦で **NEGATE_SPELL打ち消し・ON_SPELL_USEトリガー**が有効に
> 6. **CPU召喚の【出】効果**: MAINフェイズのシグニ配置で **ON_PLAYトリガー（自身のmandatory + フィールドのany_ally/any_opp）を
>    収集してスタックに積む**ようにした（従来は一切発火せず）。コスト付き任意【出】（mandatory:false）はCPUは発動しない。
>    トリガーがある場合はMAINに留まり、スタック解決後の再実行でATTACK_ARTSへ進む
> 7. **ヘルパーのオーナーID化**: collectFieldTriggers / collectSelfEventTriggers に ownerId引数（省略時user.id）を追加
>
> ### 検証・残課題
> - tsc 0 / lint 0 errors（warning 28、既存同数）。v0.260デプロイ済み
> - CPU召喚のON_PLAY解決は全配置後にまとめて（人間は1枚ごと）— 近似
> - CPUのグロウ時トリガー（ON_GROW等）・アーツ/スペル使用はCPU AI未実装のため対象外
> - MULTI_DAMAGE再アタック＋ダメージ無効が連続する稀なケースでCPU行動useEffectのdepsが変化せず停止する可能性（既存からの理論上の残課題）

> ## ✅ 2026-06-12 zerom側: 課題B解決 — CPUアタックを対人戦と共通処理に統一（v0.259）
>
> 課題Bの最小修正（(a)(b)のみ複製）ではなく、**handleSigniAttack のバトル解決ロジック全体を
> `performSigniAttack(zoneIndex, {attacker, defender, attackerId, defenderId, attackerKey})` として抽出**し、
> 人間（handleSigniAttackは薄いラッパーに）とCPU（cpuTurnのATTACK_SIGNI独自実装60行を削除）の両方が
> 同じ関数でバトルを解決するようにした。今後のCPU強化も同関数を呼ぶだけでよい。
>
> これによりCPU戦のバトルバニッシュで (a)(b)(c) がすべて解決:
> - ON_BANISH / ON_LEAVE_FIELD / ON_SIGNI_BANISH_BATTLE / ON_ATTACK_SIGNI / ヘブンヘブン等が発火（WX15-116含む）
> - バニッシュ先がエナへ（ライズ下カード・チャーム・アクセはトラッシュ）
> - 無効化（NEGATE系）・アサシン/ランサー/Sランサー/ダブルクラッシュ・各種バニッシュ代替
>   （ダウン代替/調理/アクセ/レゾナ/ライズ）・リダイレクト・凍結オーバーライド・MULTI_ZONE/ADJACENT追加バトルもCPUで有効に
>
> ### 併せて修正したCPU戦の固まりバグ（統一で顕在化するため必須）
> 1. **スタック解決ゲート**（BattleScreen L1540付近）: CPUターン中のCPU所有エントリは
>    `firstEntry.playerId !== user.id` で弾かれ解決されなかった → CPU戦では人間クライアントが全エントリを解決
> 2. **CPU自動応答の一般化**（L1100付近）: `respondPlayerId !== CPU_PLAYER_ID` → `(respondPlayerId ?? sourcePlayerId)`。
>    CPU所有効果のSELECT_TARGET/CHOOSE等のpendingはUI非表示のため、応答しないと固まる潜在バグだった
>    （v0.258のSELECT_ZONE/SELECT_VIRUS_ZONE対応と同じパターン）。CHOOSEは available な選択肢を優先するよう改善
> 3. **CPUのattacked_signi_idsリセット**: 共通処理が記録するようになったため、ENDフェイズのcleanCpuStに追加
>    （リセットしないとONE_ATTACK系条件が翌ターン誤判定）
>
> ### 実装メモ
> - performSigniAttack 内では isMyTurn は「アタッカーのターン」として常にtrue前提（両呼び出し元が保証）
> - CPU側はアタック不可（blocked_actions `ATTACK:xxx`）のシグニを**事前に候補から除外**すること
>   （共通関数はダウンさせずに早期returnするため、除外しないとCPUが無限ループする）
> - DECLARE_BOND インタラクションのみCPU自動応答未対応（CPU効果からは現状発生しない）
> - 検証: tsc 0 / lint 0 errors（warning 28、既存同数）
> - **v0.258（ウィルスゾーン選択化）と合わせて v0.259 としてデプロイ済み**
>
> ### 残課題
> - 課題A（場に出す効果のゾーン選択化）は未着手
> - CPUルリグアタックは独自実装のまま（ON_ATTACK_LRIG トリガーがCPU戦で発火しない。同様の共通化が可能）
> - CPU自身のライフクラッシュは cpuTurnAction が check を直接消化するため ON_LIFE_CRASHED 不発（v0.255の既知の近似）

> ## ✅ 2026-06-12 ymsty側: ウィルス配置のゾーン選択化（v0.258）+ 🆕 zerom側への新規課題2件（下記A/B）
>
> ### 完了: ウィルスが勝手にゾーン1（左端）に置かれる問題の修正
> 1. **PLACE_VIRUS（effectExecutor.ts execPlaceVirus）**: 左端の空きゾーンから自動配置していた →
>    新設インタラクション `SELECT_VIRUS_ZONE`（types/index.ts PendingInteractionDefに追加）で効果オーナーが
>    ゾーンを選択。選択の余地がない場合（'ALL' / 配置数≧空きゾーン数で強制）は従来どおり即時配置。
>    「～つまで」（upToZoneCount）は1ゾーンずつ選択し「配置を終了する」で打ち切り可。
>    複数ゾーンは remainingZones を減らしながら再インタラクション。`resumeSelectVirusZone` 新設（export）。
> 2. **PLACE_VIRUS_CENTER（execStubPart2.ts）実バグ**: テキストは「対戦相手の中央のシグニゾーンに置く」なのに
>    実装が「シグニのいる全ゾーンに置く」だった → 中央（index 1）固定に修正（選択不要）。
> 3. **BattleScreen.tsx**: SELECT_VIRUS_ZONE モーダルUI（ゾーン3ボタン+シグニ名表示、ウィルス済みは無効、
>    upTo時は打ち切りボタン）+ `handleSelectVirusZoneForEffect`。
>    **CPU自動応答を追加**（CPU効果のゾーン選択は最初の空きを自動選択）。その際、**既存の SELECT_ZONE
>    （デッキトップを場に出す効果）にもCPU応答が存在せず固まる潜在バグ**を発見したため併せて対応済み。
> 4. 検証: tsc 0 / lint 0 errors（warning 26→28、新規2件は既存と同型のreact-hooks系）/
>    tsxスモークテスト13項目PASS（選択化・ALL即時・強制即時・まで打ち切り・空きなし・再選択・
>    SEQUENCE内continuation引き継ぎ）。**デプロイ未実施（ymsty側に権限なし）→ zerom側で動作確認のうえ
>    version確認 + `vercel deploy --prod` を行うこと**。
>
> ### 🆕 課題A（zerom担当）: カードを場に出す効果のゾーン自動配置（最初の空きゾーン固定）
>
> カードを場に出す効果（トラッシュ/手札/エナから「場に出す」）はゾーン選択なしで**最初の空きゾーンに
> 自動配置**される（コード上「呼び出し元が担当できないため自動的に最初の空きへ」と意図的簡略化の明記あり）。
> 本来はプレイヤーがゾーンを選ぶルール。ウィルスと同じ症状（勝手にゾーン1）。
>
> - **箇所**: effectExecutor.ts `execAddToField` 内 `applyToField`（count:'ALL'経路、L511付近）/
>   `applyDirectAction` の `ADD_TO_FIELD`（SELECT_TARGET・SEARCH選択後の経路、L2810付近）/
>   スタブ多数（execStubPart1 L201、execStubPart2 L1210・L1350・L1517、execStubPart3 L2527・L3280 等。
>   `findIndex(z => !z || z.length === 0)` でgrepすると列挙できる）
> - **実装ガイド**: 既存の SELECT_ZONE（デッキトップ用）と今回の SELECT_VIRUS_ZONE が実装例。注意点:
>   1. `resumeSelectTarget`（L2360付近）のループは pending を返すと**残りの選択カードが脱落**する。
>      複数枚「場に出す」を選択式にするには1枚ずつ連鎖させる設計（continuation化）が必要
>   2. `resumeSelectZone` は占有ゾーン選択時に**デッキトップへ戻す**安全網がある — トラッシュ/手札/エナ
>      出しに流用する場合は戻し先の引数化が必要
>   3. AddToFieldAction の `asDown`（ダウン状態で出す）は SELECT_ZONE 定義に未対応
>   4. CPU自動応答は SELECT_ZONE / SELECT_VIRUS_ZONE 対応済み（BattleScreen L1077付近）。
>      新インタラクション型を足す場合はここにも追加しないとCPU戦が固まる
>
> ### 🆕 課題B（zerom担当）: WX15-116 ヨグルティの ON_BANISH 効果がCPU対戦で発動しない（調査済み・方針確定）
>
> - JSON定義は正常: `WX15-116-E1` = AUTO / ON_BANISH / PLACE_VIRUS（zoneCount:1）
> - 配線済みで正常な経路: 人間のアタック（handleSigniAttack L5648で collectBanishTriggers）・
>   効果バニッシュ（detectBanishedSigni L3381/L3698）・パワー0バニッシュ（L5895）
> - **原因: CPUアタックのバトル勝利処理（cpuTurn の ATTACK_SIGNI、BattleScreen L6355-6396）が独自実装**:
>   - (a) collectBanishTriggers を呼ばない → ON_BANISH / ON_LEAVE_FIELD / ON_SIGNI_BANISH_BATTLE 等が
>     CPU戦のバトルバニッシュで一切発火しない
>   - (b) バニッシュ先が**トラッシュ**（`trash: [...huSt.trash, ...opStack]`）— 正: トップカードはエナへ、
>     ライズ下カードはトラッシュへ。**CPU戦では人間のシグニがバニッシュされてもエナが増えない**ルール違反
>   - (c) バニッシュ代替（ダウン代替/調理/アクセ/ライズ）・リダイレクト（banish_redirect等）・チャームも未考慮
> - **修正方針**: handleSigniAttack の L5732-5741 と同じパターンで
>   `collectBanishTriggers(banishedCardNum, 人間側id, newHostState, newGuestState)` → `pushToStack/initStack`
>   で effect_stack に積む。最低限 (a)(b) で WX15-116 は発火する（PLACE_VIRUS は SELECT_VIRUS_ZONE になり
>   人間オーナーならモーダルでゾーン選択、CPUオーナーならCPU自動応答済み）。(c) は別途
>   handleSigniAttack のロジック共通化を検討

> ## ✅ 2026-06-12 ymsty側: トリガー配線ラウンド3（v0.257）— 未配線timing 5種を配線（1種は配線不能と判定）
>
> v0.256の残りを処理。tsc 0 / lint 0 errors / checkAllEffects 0 / verifyEffects全12シート0件維持。
> エンジン側フラグ設定はtsxスモークテスト5項目PASS（blind捨て/DISCARD_BOTH両者/名前公開/SELECT_TARGET公開2枚/手札残存）。
>
> 1. **ON_REVEALED_FROM_HAND**（9カード、幻水/水獣系）: acce_just_doneと同じフラグパターンで配線。
>    手札公開スタブ3種（HAND_REVEAL_CLASS_SIGNI / REVEAL_CLASS_SIGNI_FROM_HAND / OPTIONAL_HAND_REVEAL_NAMED×2箇所）が
>    新設マーカー `INTERNAL_MARK_REVEALED_FROM_HAND`（SELECT_TARGET選択カード）/ `INTERNAL_MARK_REVEALED_NAMED`
>    （テキストの《名前》から導出）で `hand_revealed_just` に記録 → BattleScreenのuseEffectが公開カード自身の
>    AUTO効果をスタックに積んでフラグをクリア（**トリガー有無に関わらず必ずクリア**）
> 2. **ON_HAND_DISCARDED**（WXDi-CP02-077 花岡ユズ）: 効果による手札捨ては `hand_discarded_just` フラグ
>    （execTrashのHAND_CARD blind/通常 + execDiscardBoth の3経路）、コストによる捨てはBattleScreenの
>    コスト支払い2箇所で直接収集。`collectHandDiscardTriggers` 新設: triggerFilterで捨てカード照合
>    （ユズはJSONに `triggerFilter:{story:'ブルアカ'}` 追加）、《ターン２回》は新設 `usageLimit:'twice_per_turn'` を
>    actions_doneの**出現回数**で制御。テキスト「あなたのターンの間」のため自ターンのみ発火
> 3. **ON_DISCARDED_AS_COST**（WX25-P3-085 ユーグレナ）: executeSigniActivated（【起】）と
>    executeSigniOnPlayCost（【出】）の手札捨てコスト支払い時に、捨てられたカード自身のAUTO効果を収集。
>    近似: 「＜微菌＞のシグニの能力のコスト」限定は未チェック（任意のシグニ能力コストで発火）
> 4. **ON_SPELL_USE**（WX25-P2-034 APEX2）: handleCutinPass（スペル解決点）でcasterルリグのAUTO効果を収集。
>    《自分ターン》はspellIsOwnerTurnでゲート、《ターン1回》と＜電機＞条件はJSONに追加
>    （`usageLimit:'once_per_turn'` + `condition:HAS_CARD_IN_FIELD{story:'電機'}`、storyフィルタはCardClass部分一致）。
>    近似: カットインで使用されたスペル自体では発火しない
> 5. **ON_EXCEED_COST**（WXK03-005 フラクタル・ケージ）: executeLrigGranted（エクシード支払いの唯一の箇所）で
>    ルリグトラッシュに置かれたカードのAUTO効果を収集
> 6. **ON_PLACED_UNDER_SIGNI**（WXDi-P11-063 無心の豪圧）: **配線不能と判定**。
>    「このスペルをチェックゾーンからシグニの下に置く」機構自体が未実装（E1のパースが STUB TRAP_OPERATION に
>    誤マッピングされており、トラップ設置として動く）。配線するにはまず置く機構の実装が必要。
>    timingはEffectTimingユニオンに追加済み（コメントで未発火を明記）
>
> **これでeffects JSONで使用中のtimingは ON_PLACED_UNDER_SIGNI（上記の通り機構未実装）を除き全て配線済み**。

> ## ✅ 2026-06-12 ymsty側: トリガー配線ラウンド2（v0.256）— 未配線timing残り3種を配線
>
> v0.255に続き、effects JSONで使用されているのにエンジン未配線だったtimingを配線した。
> tsc 0 / lint 0 errors / checkAllEffects 0 / verifyEffects全12シート0件維持。
>
> 1. **ON_ATTACK_PHASE_START**（4カード: WXEX2-03ウトゥルス/WXDi-D09-P16ホタルイカ/WXDi-P00-040アザトース/
>    WXK03-021 EXカリバン）: `collectTurnTriggers` を汎用化し、`doPhaseAdvance` のMAIN→ATTACK_ARTS移行時に収集。
>    turn_count===1はEND直行なので発火しない（正しい）。近似: ウトゥルス「各アタックフェイズ開始時」は自ターンのみ発火
> 2. **ON_SIGNI_BANISH_BATTLE**（2カード: WXDi-P02-046ファラリス/WX24-P4-058ジガネマル）:
>    `handleSigniAttack` の `banishedOpCardNum` 成立時に収集。scope 'self'=アタッカー自身のみ、
>    'any_ally'=自フィールド全シグニ。近似: バニッシュ代替（調理/アクセ/ライズ等）・MULTI_ZONE/ADJACENT追加バトルでは発火しない
> 3. **ON_ACCE_ATTACH**（2カード: WXK04-003オーバークロック=ルリグが自シグニのアクセ装着を監視/
>    SPK01-11ラズベリー=アクセカード自身）: 既存の `checkAndFireOnAcceTriggersForOwner`（ON_ACCE配線済み）を拡張。
>    アクセカードは `state.field.signi_acce[hostZone]` から特定
> 4. **JSON修正2件**: WX24-P4-058-EX1に `triggerScope:'any_ally'`（「あなたのシグニが」）、
>    WXK04-003-E1に `usageLimit:'once_per_turn'`（CSV《ターン１回》の反映漏れ）
>
> **残りの未配線timing**: ON_REVEALED_FROM_HAND（9カード、手札公開機構が分散しており未着手）、
> ON_PLACED_UNDER_SIGNI / ON_SPELL_USE / ON_DISCARDED_AS_COST / ON_EXCEED_COST / ON_HAND_DISCARDED（各1カード）。
> いずれも発生イベントの検出点が個別に必要。

> ## ✅ 2026-06-12 ymsty側: ON_LIFE_CRASHED / ON_GUARD トリガー配線完了（v0.255）
>
> ラウンド1・3で見送られていた未配線timing 2種を配線した。tsc 0 / lint 0 errors / checkAllEffects 0 /
> verifyEffects全12シート0件維持。
>
> ### 実装内容（src/screens/BattleScreen.tsx）
> 1. **`collectSelfEventTriggers(timing, myState, opState, labelSuffix)` 新設**（collectFieldTriggersの直後）:
>    自フィールドシグニのAUTO+指定timingを収集してStackEntry[]を返す。`usageLimit:'once_per_turn'`は
>    `actions_done`（effectId、ターン毎リセット）で制御し、発火分のidを返すので呼び出し側でactions_doneに追加保存。
>    BLOCK_OWN_SIGNI_AUTO / FROZEN_LOSES_ABILITIES（相手ルリグ）+凍結も考慮。
> 2. **ON_LIFE_CRASHED（WXDi-P02-037 ダッキ）**: 配線点は `handleLifeBurstResponse` の1箇所のみ。
>    アタック/ダブルクラッシュ/効果LIFE_CRASH等、全クラッシュ経路がチェックゾーン（`field.check`）経由で
>    ここに集約されるため（crashOneLife系7箇所への個別配線は不要だった）。バースト発動時は
>    queueCardEffectsの新引数 `extraEntries` でバーストと一緒にスタックへ、不発時は直接effect_stackにpush。
> 3. **ON_GUARD（WXDi-P02-035 ヤエキリ）**: `handleGuardResponse` のガード成立分岐 +
>    `handleGuardWithEnergyAlternative` / `handleGuardWithHandAlternative`（代替ガードもガードに含む）。
> 4. **types/effects.ts**: EffectTimingユニオンに `ON_LIFE_CRASHED` / `ON_GUARD` を追加。
>
> ### 既知の近似（残課題）
> - `LIFE_CRASH{triggerBurst:false}`（チェックゾーン非経由で直接トラッシュ）とエンジン内STUBの
>   ライフ減少（CRASH_LIFE_TO_HAND等）では発火しない（エンジン側からスタックに積めないため）
> - CPU戦でCPU自身のライフがクラッシュされた場合は発火しない（cpuTurnActionがcheckを直接消化）
> - 防御側（非ターンプレイヤー）が積んだエントリはキュー先頭所有者解決ルール
>   （BattleScreen L1516: `firstEntry.playerId === user.id`）で防御側クライアントが解決する


> ## ✅ 2026-06-12 zerom側: アクション不一致ラウンド3完了（144→**0件**、v0.254）— 全シート0件達成
>
> Sheet3(37)/Sheet4(31)/Sheet7(1)/Sheet8(28)/Sheet9(46) をすべて0件化。**verifyEffectsの全カテゴリ
> （コスト/タイミング/定義なし/LIFE_BURST/アクション）が全12シートで0件**。checkAllEffects 0維持。tsc 0 / lint 0 errors。
>
> ### このラウンドの主な変更
> 1. **JSON修正 約100カード**: CHOOSE丸ごと欠落の展開（約30カード）、「エナゾーンに置く」のBANISH誤り→
>    `ENERGY_CHARGE+target`修正（約10カード）、「デッキから探してエナへ」のSEARCH+then:ADD_TO_ENERGY展開、
>    「1ドローかエナチャ1」CHOOSE化、チーム効果丸ごと欠落の追加（WXDi-P16-087/089/093）、
>    「N枚見てM枚手札/エナ」のRPHSB（revealPickParams）置換等。使い捨てスクリプトは
>    tmp_verify/fixSheet3.mjs / fixSheet4.mjs / fixSheet8.mjs / fixSheet9.mjs（gitignore対象）
> 2. **新規STUB実装2種✅**: INTERNAL_DRAW_PER_CENTER_LEVEL / INTERNAL_CHARGE_PER_CENTER_LEVEL
>    （ルリグレベル比例ドロー/エナチャ、execStubPart3）。ログのみSTUB新設7種はSTUBS.md
>    「2026-06-12 アクション不一致修正ラウンド3」参照
> 3. **choiceTextParser拡張**: 「あなたのすべてのシグニのパワーを＋N」→POWER_MODIFY(self ALL)
> 4. **verifyEffects誤検出修正**: stripParensのネスト括弧対応（ランサー注釈の誤LIFE_CRASH）、
>    「バニッシュ以外」「探している間」「ルリグデッキから」の除外、STUB_EQUIVALENTS 6種追加
>    （INTERNAL_DECK_TRASH_BOTH/INTERNAL_DISCARD_ALL_DRAW_N/INTERNAL_DRAW_PER_CENTER_LEVEL/
>    INTERNAL_CHARGE_PER_CENTER_LEVEL + CMCBC系2種にMOVE_TO_ENERGY/POWER_MODIFY追加）
> 5. **Sheet7のダッキ（WXDi-P02-037）**: E1を新設timing `ON_LIFE_CRASHED`+DRAW実体に変更。
>    **クラッシュ時トリガーの配線は未実装のまま**（クラッシュ発生がcrashOneLife系7箇所+execLifeCrashに
>    分散しており、今回は見送り。配線時は全経路で before/after のlife_cloth減少検出が必要）
>
> ### 次回候補（このHANDOFFの残課題）
> - checkAllEffects残: MANDATORY_SUSPICIOUS 102 / EFFECT_TYPE_MISSING 54 の精査（memory参照）
> - ON_LIFE_CRASHED / ON_GUARD 等の未配線timingのトリガー配線
> - STUB_LOG（ログのみSTUB）の本実装化継続

> ## ✅ 2026-06-12 zerom側: アクション不一致ラウンド2（217→144件、v0.253）— Sheet2を0件化
>
> 残りは **Sheet3: 37 / Sheet4: 32 / Sheet7: 1 / Sheet8: 28 / Sheet9: 46 = 計144件**。
> コスト/タイミング/定義なし/LIFE_BURST/checkAllEffects はすべて0維持。tsc 0 / lint 0 errors。
>
> ### このラウンドの主な変更（次ラウンドでも効く汎用改善）
> 1. **①②③④選択肢解析を `src/engine/choiceTextParser.ts` に共通化**。従来はCMCBC/CHOOSE_N_FROM_LIST/
>    BET_MECHANIC/INTERNAL_BET_SHOW_4/INTERNAL_ECRV_APPLYの5箇所が独自の部分解析を持ち対応パターンが
>    まちまちだった。全箇所で同一パターン集（バニッシュ各種/デッキ上N枚エナ/ライフ追加/ライフクラッシュ/
>    ルリグダウン・凍結/相手エナトラッシュ/クラスサーチ/ウィルス除去等）を解析可能に。
>    **新パターンを足すときは choiceTextParser.ts の parseSingleChoiceText に1箇所追加するだけでよい**
> 2. **STUB_EQUIVALENTS追加**: BET_ALTERNATIVE/BET_CONDITION/CHOOSE_N_FROM_LIST/CHOOSE_SAME_OPTION_TWICE(_MULTIPLE)/
>    EXTRA_COST_REMOVE_VIRUS/REVEAL_TOP_BANISH_BY_LEVEL_SUM/REVEAL_PICK_HAND_SHUFFLE_BOTTOM/REVEAL_TOP_LEVEL_ROUTE
> 3. **verifyEffects誤検出修正**: DISCARDパターンを同一文内限定（`手札から[^。]+捨てる`、文またぎ誤検出排除）、
>    アンコールコスト宣言文の除去（stripEncoreCost）
> 4. **新規STUB実装✅**: REVEAL_TOP_BANISH_BY_LEVEL_SUM/SUMMON_FROM_TRASH/SUMMON_RESONA_FROM_LRIG_DECK/
>    REVEAL_TOP_LEVEL_ROUTE/INTERNAL_BANISH_ALL_POWER_GTE/INTERNAL_FREEZE_OPP_LRIG。
>    RPHSBのthen:'energy'対応（選んだカードをエナへ）。BETの選択数をテキスト解析（従来2/4固定）
> 5. **Sheet2のJSON修正24カード**: 大半は「以下のNつからMつ選ぶ」が丸ごと欠落→実CHOOSE展開
>    （tmp_verify/fixSheet2.mjs・fixSheet2b.mjs参照、gitignore対象なので消える）。
>    「エナチャージ1かドロー1」のCHOOSE化7件、トラップシグニのTRAP_ICON効果欠落2件
>    （effectId `<cardNum>-TRAP`/effectType TRAP_ICON/timing ON_TRAP_ACTIVATE、WX15-081が前例）

> ## ✅ 2026-06-12 ymsty側: アクション不一致ラウンド1完了（318→217件、v0.252）
>
> Sheet1/5/6/7/10/TK/Variants を0件化（Sheet7のみ1件残、下記）。残りは **Sheet2: 62 / Sheet3: 42 / Sheet4: 33 / Sheet8: 30 / Sheet9: 49 = 計216件 + Sheet7: 1件**。
> コスト/タイミング/定義なし/LIFE_BURST/checkAllEffects はすべて0維持。tsc 0 / lint 0 errors。
>
> ### zerom側への続行手順（このセッションで確立したワークフロー）
> 1. `node tmp_verify/dumpCompact.mjs Sheet2:WX12-001 ...` でCSVとJSONを突き合わせ（**dumpCompact.mjs / dumpCards.mjs はymsty側tmp_verify/にあり、gitignore対象なので再作成が必要**。仕様は本ファイル下部「カード調査用ダンプスクリプト」参照。dumpCompactはJSONをアクション構造の要約で表示する版）
> 2. 修正は使い捨てスクリプト（JSON.parse→変更→JSON.stringifyでミニファイ維持）で一括適用
> 3. シート0件化→全シート再実行で退行チェック→checkAllEffects 0確認
>
> ### 頻出パターンと確立した直し方
> - **「1枚引くか【エナチャージ1】」がチャージ固定** → CHOOSE 1/2 [DRAW, ENERGY_CHARGE_FROM_DECK]（多数あり）
> - **「デッキから探してエナゾーンに置く」がSHUFFLE_DECKのみ** → `SEARCH{filter,maxCount,then:{type:'ADD_TO_ENERGY',owner:'self'},afterSearch:SHUFFLE_DECK}`。ADD_TO_ENERGYはapplyDirectActionが対応済みでSEARCH/REVEAL_AND_PICKのthenに安全（ENERGY_CHARGE+DECK_CARDよりこちらを使う）
> - **「以下のN つからM つ選ぶ」が丸ごと欠落/STUB単体** → 実CHOOSE{choose_count,from_count,choices}に展開。選択肢内の「そうした場合」はコスト→`conditional:true`(BANISHのみ対応)か順次実行で近似
> - **チーム起/チーム自の効果が丸ごと欠落**（WXDi系に多い）→ addEffで先頭にunshift。任意コストは`SEQ[STUB OPTIONAL_COST{costColors},CONDITIONAL(IS_MY_TURN)→効果]`
> - **「手札に加えるかエナゾーンに置く」** → 行き先を先に選ぶCHOOSE（choices両方にREVEAL_AND_PICK、thenだけ違う）で近似。CHOSEN_TO_ENERGY_OR_HANDはトラッシュ専用なのでデッキ公開系には使えない（カード消失する）
> - **トリガー条件文の誤検出**（「手札からトラッシュに移動していた」等）→ ACTION_KEYWORDSの能動形限定で対処済み。パターンを広げると誤検出が増えるので注意（「捨て」だけにすると退行した）
> - **動的条件（トラッシュN枚以上等）** → `{type:'COND_STUB',raw:'...'}`（常にtrueの許容近似）
> - STUB_EQUIVALENTSに追加済み: CONDITIONAL_MULTI_CHOOSE_BY_CENTER(_LEVEL_GTE)/DRAW_UNTIL_HAND_SIZE/DRAW_IF_CHARGED_CLASS/HAND_EXCESS_TO_ENERGY/REVEAL_PICK_PLAY。エイリアス追加: ADD_TO_ENERGY・TAKE_FROM_UNDER_SIGNI（エナゾーンに置く）、TRANSFER_TO_HAND（手札に戻す）
>
> ### 残課題（Sheet7の1件）
> - **WXDi-P02-037 紅魔姫ダッキ**: 「ライフクロスがクラッシュされたとき1ドロー」= STUB TRIGGER_OWN_LIFE_CRASHED_DRAW。クラッシュ時トリガーの配線がBattleScreenに存在しないため未実装のまま。配線追加かエンジン側対応が必要
> - WXDi-P02-035に新設timing `ON_GUARD`（ガード時トリガー、未配線）を使用。発火させるにはBattleScreenのガード処理に配線が必要
>
> ### このセッションのエンジン変更（src/engine/execStubPart3.ts）
> - 新規スタブ実装: DRAW_UNTIL_HAND_SIZE / HAND_EXCESS_TO_ENERGY / DRAW_IF_CHARGED_CLASS
> - CONDITIONAL_MULTI_CHOOSE_BY_CENTERのパーサー改善: 「カードをN枚引く」(N=1-9)、「すべてのシグニを凍結」→FREEZE ALL

> **✅ 2026-06-11 完了報告（zrom側）**: 残作業1「タイミング不一致113件」を全件解消した（全シート0件）。
> 内訳: 実欠落の効果追加 約30件（うち新設STUB 18種 → STUBS.md「2026-06-11 タイミング不一致修正ラウンド」参照）、
> パース誤り修正（効果タイプ誤り・誤マージ分離）約15件、verifyEffects.ts誤検出修正 約60件
> （能力参照テキスト【X】能力/【X】と【Y】の能力、ネスト引用「「」」、『』引用、注釈（）内マーカー）。
> エンジン修正: POWER_MODIFYにexcludeSelf追加（「他のシグニ」対応）、REVEAL_PICK_PLAYのpickCount正規表現修正。
> ARTS_IMMOVABLE（TK5枚）をACTIVATED内からCONTINUOUSへ移動（エンジンはCONTINUOUSのみ参照するため実バグ修正）。
> 残作業は2の「アクション[STUB代替?] 211件 / アクション[要確認] 163件」のみ。コスト/定義なし/LIFE_BURST/checkAllEffectsはすべて0維持。

ymsty側のClaude (Fable 5) セッションからの引き継ぎ。コミット `fix: コスト/リミットアッパー/開始時コイン/ライド・デコレのバグ修正とチェッカー誤検出解消` の続きを行う。

---

## 🚨 2026-06-11 ymsty側: effectExecutor.ts の文字化け破損を発見・修復（zerom側に残作業あり）

アクション不一致の調査中に重大な問題を発見し、このセッションは破損修復を優先した。

### 経緯（確定事実）

1. **020302f**（6/4 00:12, v0.187）が `effectExecutor.ts`（281行）と `execStub.ts`（2510行）の日本語を
   **UTF-8→CP932誤読の文字化け**で破壊（例: `シグニ` → `繧ｷ繧ｰ繝・`）。
2. `execStub.ts` は当日中に **983df86**「execStub.ts を1aba8f5ベースに戻してCI修正」で復元された。
   現在の execStubPart1〜3 は復元後の分割なので無事（化け0件確認済み）。
3. **`effectExecutor.ts` だけは復元されず**、**4f4c77c**（6/4 01:22）が化け文字を**削除**しただけで
   今日まで残存していた（334行が破損。日本語文字列が空になり、一部はクォートがコードを飲み込んだ）。

### 機能影響していた実バグ（今回修復済み）

- **RECOLLECT_GATE**: `Type === 'アーツ'` が `Type === ''` になりリコレクト条件が**常に不成立**
  （リコレクトを持つ全アーツの追加効果が死んでいた）
- **OPTIONAL_TRASH_ENERGY_CLASS**: 枚数解析の正規表現が化けて**常に1枚**扱い
- **execPlayFree**: lrig_deck検索の `cands = ...` 代入行がコメントに飲み込まれ**デッドコード化**
- CHOOSEの「スキップ」「支払う」等のUIラベルが空文字（ボタンが無文字表示）
- 各種ログ文字列・コメント多数

### 修復方法（再現可能）

正本は `git show '020302f^:src/engine/effectExecutor.ts'`。
化けは可逆（化け文字列をCP932にエンコードし直しUTF-8でデコード）だが、
**`・`（U+30FB）はデコード不能ペアの置換マーカーで2バイト損失**しており、
0x8145として再エンコードすると前後と偶然つながり**正しいUTF-8に見える誤復元**になる
（例: `'アーツ'` → `'アーチE` で閉じクォート消失）。`・`を含む行の機械復元は要監査。
復元スクリプトは ymsty 側 `tmp_verify/`（gitignore対象）: repairCorruption.mjs / applyAnswers.mjs /
auditRoundtrip.mjs / fixRoundtrip.mjs。

### zerom側への残作業 → ✅ 完了（2026-06-11 v0.250）

> 1. 残存ダメージ掃討: 空ログ7件・空/劣化ラベル5件・空コメント14件を正本（020302f^）から復元。
>    実バグ2件を追加発見・修復: ①OTECクラス抽出regexが破損後に`《》`形式へ誤修正されておりクラスフィルタが常に空
>    （正: `＜クラス＞`形式、CSVテキストで確認）②`[０-９d]`の`\d`バックスラッシュ欠落3箇所（レベル参照上書き2・ウィルス除去数1）。
> 2. 動作確認: tsxスモークテストでRECOLLECT_GATE未達/達成の分岐とSOUL_OP CHOOSEラベル表示をPASS確認。
> 3. CI: tsc 0 / lint 0 errors / checkAllEffects 0件。v0.250でデプロイ済み。
> 4. **破損原因の特定**: PowerShell 5.1の`Get-Content`はBOMなしUTF-8をCP932誤読する（実際に本セッションの
>    一時ファイルで再現）。日本語ファイルの読み書きは`[System.IO.File]::ReadAllText/WriteAllText`を使うこと。

### zerom側への残作業（原文）

1. **残存ダメージの掃討**: 4f4c77c以降の107コミットが破損行を変更しており、内容一致で復元できなかった
   約120行は後続コミットで修正済みと推定されるが、ログ文字列が空のまま残っている可能性がある。
   `grep -nE "addLog\((ctx|cur|c)[0-9]?, ''\)|label: ''" src/engine/effectExecutor.ts` 等で残存確認を推奨。
2. **動作確認**: リコレクト条件アーツ（WX26-CP1-001等）がゲート判定されること、
   CHOOSEダイアログのラベルが表示されること。
3. **デプロイ**: このセッションは修復コミット+pushのみ。CI（tsc 0 / lint 0 errors / checkAllEffects 0件）
   確認済みだが、動作確認後に version bump + `vercel deploy --prod` を行うこと。
4. **教訓**: `auto: Claude による変更` の自動コミットフックは破損もそのまま積むため、
   大量行数の auto コミット（±300行超の同数置換）は破損シグナルとして警戒する。

### アクション不一致調査で得た知見（残作業1の続行に必要）

- 「シグニをエナゾーンに置く」は `ENERGY_CHARGE`+target（フィールド対応済み）。`MOVE_TO_ENERGY` という
  アクション型はエンジンに存在しない（verifyEffectsのエイリアスにのみ登場）。
- JSONの `CHOOSE` は相手選択（opponentResponds）未対応。`types/effects.ts` の ChooseAction に
  `opponentResponds?: boolean` を追加し `execChoose` で `needsInteraction` に透過すれば実現できる
  （BattleScreen側は対応済み）。「対戦相手はカードを1枚引くか【エナチャージ1】してもよい」
  （SPDi43-32）等に必要。
- 「何もしない」選択肢の表現は `{"type":"SEQUENCE","steps":[]}`。
- 「次のあなたのアタックフェイズ開始時」等の遅延発動は**即時実行で近似**するのが既存慣例
  （WX24-P1-007等。遅延トリガー機構は存在しない）。
- **⚠ TARGET_AND_DISCARD_HAND の二重実行バグ疑い**（effectExecutor.ts execSequence内、現L920付近）:
  インターセプトが「相手シグニ選択→BANISH→手札1枚捨て」をハードコードした上で、
  残ステップの `CONDITIONAL(IS_MY_TURN)→BANISH(owner:'self')` を continuation に**素通し**するため、
  `IS_MY_TURN` は常にtrue（execUtils）で**自分のシグニへの追加BANISHが実行される**疑いが濃厚。
  正しくは TOSOC（TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST, 現L1062付近）の `fixOwnerTOSOC` と同様に、
  直後の CONDITIONAL を**消費**して `then`（owner self→opponent修正）を thenAction に使うべき。
  then の型は BANISH 以外に BOUNCE/POWER_MODIFY/ENERGY_CHARGE/DRAW 等があり（52カード）、
  ハードコードBANISHではこれらのカードも誤動作する。修正時は applyDirectAction が
  選択カードに直接適用される（未対応型は executeAction+lastProcessedCards フォールバック）ことを利用。

### Sheet10 アクション不一致5件の分析結果（修正方針確定済み・未適用）

| カード | 不一致 | 判定と方針 |
|---|---|---|
| WX24-D4-06 樹木堕絡 | MOVE_TO_ENERGY | **実バグ**: テキスト「エナゾーンに置く」がJSONでは`BANISH`。`ENERGY_CHARGE`+target(opponent SIGNI, maxPower8000)へ。さらに`REVEAL_AND_PICK`のpickCountが1（正: 2）でfilter（緑）も欠落 |
| PR-Di035 OPEN DREAM LAND! | MOVE_TO_ENERGY | **実バグ多数**: 黒効果のTRASH対象がowner:self（正: opponent のデッキ20枚）、赤のLIFE_CRASHがowner:self（正: opponent）、緑はBANISH ALL（正: ENERGY_CHARGE ALL）、青のDRAW 3欠落、5色効果が無条件逐次実行（正: 色条件分岐。CONDITIONAL+HAS_CARD_IN_FIELD{story:'プリパラ',color:X}+FIELD_COUNT>=3 のANDで近似）、トラッシュ回収のstoryフィルタ欠落 |
| SPDi43-32 Bグレートソード | DRAW | **実バグ**: E1が`ENERGY_CHARGE_FROM_DECK` owner:self固定。正: 対戦相手がドロー/エナチャージ/しないを選択（要opponentResponds CHOOSE、上記エンジン拡張）|
| SPDi43-15 マドカ | DISCARD | STUB `TARGET_AND_DISCARD_HAND`(✅)が手札捨てを実装済み→検証側でSTUB同等マップ対応。ただし上記二重実行バグの影響対象 |
| SPDi43-26 ノヴァ | BOUNCE | **実バグ**: E2のJSONがLOOK_AND_REORDERのみで「2枚まで手札に加え」（REVEAL_PICK_HAND_SHUFFLE_BOTTOM相当）と後半「ガード捨て→バウンス」（TADH+CONDITIONAL→BOUNCE）が丸ごと欠落。E1のtimingも`ON_ATTACK_SIGNI`（正: `ON_ATTACK_LRIG`、テキスト「このルリグがアタックしたとき」）|

検証側の対応方針（[STUB代替?]の解消）: `verifyEffects.ts` の `collectActionsFromJson` でSTUB idも収集し、
`STUB_EQUIVALENTS: Record<string, string[]>`（例: `TARGET_AND_DISCARD_HAND→['DISCARD','TRASH']`）で
実装済みSTUBを期待アクションの同等物として照合する。

## 前提知識（このリポジトリの検証ワークフロー）

- カード効果の正データは `public/data/effects_{WX,WXDi,WX24_26,WXK,misc}.json`（各1行ミニファイ形式）。
  **`npm run build:effects` はこれらを再生成しない**（旧式の結合effects.json出力）ので、JSONは直接編集してよい。
  編集時は `JSON.parse` → 変更 → `fs.writeFileSync(p, JSON.stringify(j))` でミニファイ形式を維持すること。
- 検証ツールは2つ:
  1. `node scripts/checkAllEffects.mjs` — 「してもよい」と mandatory フラグの照合。**現在0件**。退行させないこと。
  2. `npx tsx scripts/verifyEffects.ts --sheet SheetN` — CSV効果テキストとJSONの照合（N=1〜10、TK、Variants）。
- 修正後は **全シート再実行して件数を前回と比較**し、退行がないことを確認する（このセッションでは `diff` でサマリー比較した）。
- CSVの行順は絶対に変えない（CLAUDE.md参照）。

## 今回完了した内容（参考）

- 実バグ4件: WX17-044コスト(青2→青1+無1)、【リミットアッパー】(+1/ターン消失→+2/恒久/条件付き、`limit_upper_token`新設)、ゲーム開始時コイン未付与(ナナシ其ノ零ノ禍等、初期化4経路)、【ライド】/【デコレ】未使用可能(レイラ系9体+エルドラ系9体にACTIVATED効果を追加)
- verifyEffects.tsの誤検出修正: コスト照合(引用文・文中【起】の誤拾い)、定義なし(デュアルエナ注釈のみ/注釈のみ/トークンを除外)
- 結果: **コスト0件・定義なし0件**（全シート）

## 残作業（優先度順）

### ~~1. タイミング不一致 113件~~ → ✅ 完了（v0.249、冒頭の完了報告参照）

### 1. アクション[STUB代替?] 211件 / アクション[要確認] 163件
「テキストから期待されるアクション型がJSONにない」。1件ずつ分類して対処する:

**[STUB代替?]（カードがSTUBアクションを含む）の判定手順:**
1. そのカードのSTUB idをSTUBS.mdの一覧で確認する
2. STUBが期待アクションを実装済み（✅）なら誤検出 → `verifyEffects.ts`の`collectActionsFromJson`で
   そのSTUB idを期待アクションの同等物として数えるか、`ACTION_KEYWORDS`のエイリアスに追加して解消
3. STUBがログのみ（📝）なら実体未実装 → 本実装するか、現状維持（STUB_LOG削減作業の対象として残す）

**[要確認]（STUBなし）の判定手順:**
1. CSVテキストとJSONを突き合わせ、表現違いか実欠落かを判定
2. 表現違い（例: バニッシュ→`BANISH_REDIRECT`、ミル→`REVEAL_AND_PICK`）→ `ACTION_KEYWORDS`のエイリアス追加
3. 実欠落（JSONのアクションが本当に間違っている/足りない）→ JSONを修正。
   前回ラウンドでは誤マージ（複数効果が1エフェクトに混入）や効果タイプ誤り（【出】がCONTINUOUS登録等）が多数見つかったので、
   アクション不一致もパース誤りの兆候として周辺エフェクト全体を確認するとよい

### 2. シート別残件数（2026-06-11 v0.251時点、verifyEffects.ts）

タイミング/コスト/定義なし/LIFE_BURSTは全シート0。

> **✅ 2026-06-11 v0.251 進捗（zerom側）**: 374→318件（-56）。実施内容:
> - **STUB_EQUIVALENTS実装**（verifyEffects.ts）: 実装済みSTUB 25種を期待アクションの同等物として照合（-51件）。
>   collectActionsFromJsonがSTUB idを`STUB:ID`形式で収集し、レポートにもSTUB idを表示するようになった
> - **TARGET_AND_DISCARD_HAND二重実行バグ修正**（effectExecutor.ts）: 直後のCONDITIONAL(IS_MY_TURN)を消費し
>   then（owner self/any→opponent修正、SEQUENCE内再帰）を対象適用アクションに使用。スモークテストPASS
> - **CHOOSE opponentResponds対応**: types/effects.ts ChooseAction拡張+execChoose透過（SPDi43-32で使用）
> - **Sheet10全5件解消**（0件達成）: WX24-D4-06（ENERGY_CHARGE+target/pickCount2/緑filter）、
>   SPDi43-26（ON_ATTACK_LRIG/REVEAL_PICK_HAND_SHUFFLE_BOTTOM/TADH+BOUNCE/usageLimit）、
>   SPDi43-32（opponentResponds CHOOSE）、PR-Di035（5色CONDITIONAL分岐+owner修正+storyフィルタ）、SPDi43-15（TADH同等）
> - **DISCARD誤検出対策**: 受動態「手札からトラッシュに置かれた」をトリガー文として除去

| シート | STUB代替? | 要確認 | (v0.249: STUB代替?/要確認) |
|---|---:|---:|---|
| Sheet1 | 10 | 8 | 11/8 |
| Sheet2 | 31 | 36 | 41/36 |
| Sheet3 | 27 | 20 | 36/21 |
| Sheet4 | 24 | 10 | 28/10 |
| Sheet5 | 13 | 8 | 14/8 |
| Sheet6 | 8 | 3 | 9/3 |
| Sheet7 | 8 | 27 | 15/27 |
| Sheet8 | 17 | 16 | 24/16 |
| Sheet9 | 18 | 31 | 28/31 |
| Sheet10 | 0 | 0 | 2/3 |
| TK | 3 | 0 | 3/0 |
| Variants | 0 | 0 | 0/0 |
| **計** | **159** | **159** | **211/163** |

調査で判明した実欠落の例（次ラウンドの参考）:
- WX21-035: 4択から2つ選ぶ効果（CHOOSE）がJSONから丸ごと欠落（コスト軽減部分のみ存在）
- WX22-029: 「手札からカードを1枚エナゾーンに置く」がOPTIONAL_COST止まり（実体なし）

## 作業ノウハウ（v0.249ラウンドで得たもの）

### カード調査用ダンプスクリプト
カードごとのCSVテキストとJSON定義の突き合わせには使い捨てスクリプトを作ると速い（前回は`tmp_verify/dumpCards.mjs`として作成、削除済み）。要点:
- 5つのeffects JSONを全部ロードして`Object.assign`でマージ → cardNumで引く
- CSVは`"`囲み対応の簡易スプリットでパース（`CardNum`/`CardName`/`EffectText`列）
- 引数`Sheet1:WX05-001`形式でシートとカードを指定できるようにする

### effects JSONの表現語彙（実装済みでそのまま使えるもの）
- **フィルター**: `cardType`/`story`/`color`(配列可)/`level:{max:N}`/`powerRange:{min,max}`/`cardName`(部分一致)/`hasGuard`/`isUp`/`isFrozen`/`hasAcce`
- **POWER_MODIFYの`excludeSelf:true`**: 「あなたの他のシグニ」（v0.249でエンジン対応済み）
- **効果レベルの`condition`**: `{type:'HAS_CARD_IN_FIELD',owner,filter}`、`{type:'DURING_PHASE',phases}`等
- **`activeCondition`（CONTINUOUS用）**: `IS_DRIVE_STATE`、`TURN_OWNER`等
- **`usageLimit:'once_per_game'`**（《ゲーム１回》）
- **SEQUENCEステップ**: `RECOLLECT_GATE`(`{minArts:N}`でリコレクト条件)、`STUB DECLARE_NUMBER`+`MILL{useDeclaredCount:true}`(数字宣言ミル)
- **便利STUB（実装済み✅）**: `REVEAL_PICK_HAND_SHUFFLE_BOTTOM`+`revealPickParams:{pickCount,restDest,then}`（デッキ上N枚見て選ぶ）、`REVEAL_PICK_PLAY`（公開して場に出す）、`DECLARE_CLASS`、`OPTIONAL_TRASH_ENERGY_CLASS`、`LRIG_GROW_RESTRICT`

### 慣例・落とし穴
- **コスト付き【出】効果は`mandatory:false`**（支払いは任意。既存360件false vs 3件true）。コストなし【出】で「してもよい」がなければtrue
- 「このキーを場からルリグトラッシュに置く」等の特殊コストは現状コスト未表現（cost欄なし）が慣例
- エンジンが**CONTINUOUSとしてのみ参照するSTUB**がある（例: `ARTS_IMMOVABLE`はexecStubPart1の判定がCONTINUOUS前提。ACTIVATED内に置くと機能しない）。STUBを置く際はエンジン側のgrepで参照のされ方を確認
- 新設timing文字列（`ON_ACCE_ATTACH`等6種、STUBS.md参照）はエンジン未配線＝発火しない。トリガー実装時に配線が必要
- `checkAllEffects.mjs`は修正のたびに必ず再実行（現在0件、退行させない）

## 運用ルール（リポジトリ外の取り決め）

- **このリポジトリには「auto: Claude による変更」を自動コミットするフックがある**。ファイル編集が随時コミットされるのは正常動作（異常ではない）
- リリース手順: `package.json`のversionをインクリメント → CIチェック（`npx tsc --noEmit`と`npm run lint`が**エラー0**であること。warningは既存26件あり許容）→ まとめコミット&`git push` → `vercel deploy --prod`
- アプリコードに影響しないドキュメントのみの変更はversion bump/デプロイ不要

## 注意点・既知の近似実装

- 新設した【ライド】効果（`<ID>-RIDE`、STUB `CENTER_LRIG_RIDES_ON_SIGNI`）は「ドライブ状態でない場合のみ使用可」を強制していない（乗り換えになるだけで実害は小さい）。厳密化する場合はスタブ側に `lrig_riding_signi` チェックを追加。
- 【リミットアッパー】のレベル3以上条件は印刷レベル（`currentLrigLevel`）参照。レベル上書き効果との相互作用は未考慮。
- 【ルリグバリア】/【シグニバリア】トークンのダメージ身代わり機構は**未実装**（verifyEffectsはトークンを検証対象外にしたため検出されない。STUBS.md・エンジン側の課題として残る）。
- 完了したら STUBS.md / このファイルの更新も忘れずに。
