# 残作業 (TODO)

未実装・未対応の**残作業のみ**を載せる恒久ドキュメント。**完了した項目は消す**（修正記録は [BUGFIXES.md](./BUGFIXES.md) に積む。設計方針は [DESIGN.md](./DESIGN.md)）。

> **🎯 現在の目標＝P1（表現完成）。次の一手・品質ゲートは [P1_PLAN.md](./P1_PLAN.md) §3「現在地（バトン）」が唯一の正。cold start はまずそれを読む。** 本ファイルは「残っている穴」の索引。

最終更新: 2026-06-26（karka が整理）。**過去の引き継ぎログ・完了項目（ビート全Phase／クラッシュ時トリガー／THE DOOR(F-4)／引用付与フラット化(F-2)／自己起動(手札)／特殊システム(C) 等）は BUGFIXES.md に集約済みで本ファイルから削除した。**

---

## 0. 運用ルール（必読・時間を無駄にしない）

- **`effects_*.json` は手動管理。`build:effects`（全再生成）は破壊的＝絶対に実行しない。** 修正は JSON を直接パッチ（effectId をアンカーにした `.mjs` で外科的に）。
- **逆翻訳を直したらエンジン実装までセット**（乖離＝偽陰性を作らない）。配線不能な重い機構は decompiler の `engineUnwiredTimings` に登録し逆翻訳へ `【※engine未配線】` を付けて明示する。[[decompile-engine-parity]]
- **品質ゲートは `npm run typecheck`（＝`tsc -b`）**。`npx tsc --noEmit`（-b無し）は project references を見ず CI が拾うエラーを見逃すので不可。
- **日本語を含むスクリプトは `scratchpad` に `.mjs` を書いて `node <path>` 実行**（`node -e` 直書きは Git Bash 経由で文字化け）。papaparse が要るカード参照は project root に一時 cp して実行→削除。
- **全再生成系の一括置換は禁止**（無検証置換で約90枚退化の前例）。系統ごとに機構を1回確立→同パターン適用→各カード verify。

### 標準ワークフロー（1カード/1巡）
①`docs/grouped_sentence_all.txt` の⚠脱落疑いを上から見る（原文・逆翻訳併記済）→②欠落把握→③`effects_*.json` を既存語彙で直す→④`npm run typecheck`→⑤該当シート再生成 `npx tsx scripts/decompileEffects.ts --sheet <N> > docs/decompile_sheet<N>.txt`→⑥下流 `node scripts/genReviewRepr.mjs && node scripts/groupSimilar.mjs --all && node scripts/groupBySentence.mjs --all`→⑦逆翻訳が原文一致＆同型★0 を確認→⑧BUGFIXES追記→⑨P1_PLAN バトン更新→commit/push。カード→シート対応は `grep -q "^<CardNum> " docs/decompile_sheet<N>.txt`。

### 機構実装の「型」
1. `src/types/effects.ts`（アクション/条件/timing の型）→ 2. `src/types/index.ts`（必要なら `PlayerState` 状態フィールド）→ 3. `src/engine/effectExecutor.ts`（実行）/`execUtils.ts`（`evalCondition`/`matchesFilter`）/`effectEngine.ts`（CONTINUOUS収集）→ 4. `src/screens/BattleScreen.tsx`（状態読み取り＋**ターン境界リセット3箇所**：PvP通常終了・PvP確認後・CPU）→ 5. `scripts/decompileEffects.ts`（表示）→ 6. JSON 配線 → 検証。

### 主要ファイル
- 語彙: `src/types/effects.ts` / `src/types/index.ts`（PlayerState）
- エンジン: `src/engine/effectExecutor.ts`（`execLookPickChain`/`payBeatSigniCost` 等）・`execUtils.ts`（`evalCondition`/`matchesFilter`/`addToBeatZone`）・`effectEngine.ts`（CONTINUOUS収集・`checkActiveCondition`）
- UI/ルール: `src/screens/BattleScreen.tsx`（コスト計算・バトル・ターン境界リセット・`crashOneLife`）
- 逆翻訳器: `scripts/decompileEffects.ts`、グルーピング: `scripts/group{Similar,BySentence}.mjs`（`--all` で全10シート統合）

---

## 1. 偽陽性パターン（脱落疑いに出るが**直さない**）— 毎回まず除外

1. **使用条件＋本体**（「このカードは〜の場合にしか使用できない」前置き）＝条件として正しい。
2. **CHOOSE/チェインの1文圧縮**＝択肢が逆翻訳に全部出ていれば正しい。
3. **REVEAL_AND_PICK の文法崩れ**（語順が変でも機能は正常）。
4. **ルール注記・アンコール/ベット注記のみ**訳に出ない＝本体が合っていれば正しい。
5. **BET_MECHANIC STUB**＝別タスク。
6. **`owner:any` の一括変換は禁止**：POWER_MODIFY/BANISH の `owner:'any'` は大半が正当（「シグニ1体を対象とし±N」＝自他選択／「すべてをバニッシュ」）。原文に明示主語があるものだけ個別是正。
7. **LIFE_BURST 内 `CONDITIONAL{IS_MY_TURN}`** は実害なし（常時true＋「そうした場合」特別処理）。修正不要。
8. **`[STUB:id]` を含むからとスキップしない**：実装済みハンドラのタグ表示。ただしハンドラがカード全体を覆うか（◎）／断片だけで残りを落としたか（実バグ）はタグでは区別不可＝各外れは個別検証。

## 2. 触らなくてよい/枯れた系統（調査済み）

- 強制アタック＝実装済（未配線は WX12-010 複雑レゾナのみ）。BURST丸ごと欠落＝残0。保護系キーワードの owner誤り＝残0。
- 同型★（`grouped_all.txt`）＝**枯れた・常に0維持**。残1件 `WX04-056` は無害な表現差（任意）。
- 「あなたのアタックフェイズ開始時」系（self約407件）は **全再生成禁止**（約90枚退化）。個別に timing/triggerScope を直す。

---

## 3. 残・大型機構（次の一手の候補。詳細・着手状況は P1_PLAN §5）

- **引用AUTO付与の精緻化（`GRANT_QUOTED_AUTO_ABILITY` 系・ヒューリスティック）** ＝**✅一次完了（2026-06-28・B4）**＝引用【自】/【常】能力を `parseCardEffects`→granted_effects 実発火（自場シグニ・ターン限定・parse成功時のみ）。**残**＝permanent（このゲームの間）付与・相手シグニ付与・STUB能力＝従来 log-only 据置（追加実装課題・要実機検証）。「シグニに『〜』を付与」型。例: WX25-CP1-074／WXK09-055／WX24-P2-044。
- **機構④の残（新トリガー機構が要る）**:
  - `ON_CARD_MILLED_FROM_DECK` の収集機構（WX25-P2-009-E2＝現 `【※engine未配線】`）。
  - リフレッシュ置換の実体（WX25-P2-009-E1＝現 no-op STUB `REPLACE_NEXT_OPP_REFRESH_MILL_LRIG`）。
  - 「他＜毒牙＞のシグニ効果で相手パワーが減ったとき」トリガー（WX25-P3-062-E1＝現 STUB `POWER_COPY_FROM_DOWNED`）。
  - ~~`ON_OPPONENT_SIGNI_PLAY` 配線~~ **【R30 完了】** WXK10-022-E1 は新 timing ではなく**既存機構**で配線済み＝`ON_PLAY`＋`triggerScope:any_opp`（`collectFieldTriggers` opStateループが収集）＋`triggerCondition:turnOwner:self`（`effectStack.turnGateOk` が集約ゲート）＋`REMOVE_ABILITIES.targetsTriggerSource`（新規追加）。**参考**：WX08-006-E2（同「相手シグニが場に出たとき→チャーム」を ON_PLAY 代用）も同様に any_opp＋targetsTriggerSource(ATTACH_CHARM側に要追加)で正せる可能性。⚠実機未検証。
  - ~~「自分の＜X＞シグニの効果でカードを引いたとき」トリガー（WX20-026-E3）~~ **【R31 完了・LOSS 0達成🎉】** `triggerCondition.drawBySourceStory` を実装＝`PlayerState.last_effect_draw_source`（execDraw が原因カードを記録）を `collectDrawTriggers` で照合（シグニ かつ CardClass に story を含む場合のみ発火）。ドローフェイズ通常ドロー／ターン境界でクリア。⚠実機未検証（ホットパス・state ライフサイクル）＝§5 へ。
- **ビートの残（低優先）**: トラッシュ→beat（WDK14-013）の**プレイヤー選択ピッカー**のみ自動近似（場シグニ選択UIは Phase7 で完了）。
- **G072 残6枚（条件前置き付きの相手シグニ被バニッシュ反応）**: トリガー前に前置きが付き ON_BANISH 自バニッシュに誤分類。「メインフェイズの間」WX05-040/WX11-027・「アタックフェイズの間」WXEX2-23（→相フェイズ condition）／「あなたの効果によって」WXK11-055・「＜龍獣＞効果で」WX13-051（→byOwnEffect+story）／「【チャーム】付き相手シグニ」WXDi-P11-TK05（→charm triggerFilter）。前置きモデリングの誤りリスク高く個別対応。
- **multi-dest pick（look→手札＋場の二目的）**: WX24-P1-017／WX24-P1-026／WX25-P3-038／WX25-CP1-025／WX26-CP1-019。LOOK_PICK_CHAIN の hand+field/beat は実装済だが、付与/条件/絆を伴う同時pickは別語彙が要る。

---

## 3.5. ✅ timing flatten 系統（実バグ・当初159枚→**🎉 完了＝VALUE 0**・R58 で打ち止め）

> **🎉 完了（2026-06-28・R58）＝VALUE 159→0（R5-R58）**。timing flatten の表現バグはすべて解消（`npx tsx scripts/parserWorklist.ts` で VALUE=0・LOSS=0・同型★0）。R47 以降で残っていた未配線トリガー群（ON_TARGETED 3=R49／改造素材 2=R57／他ルリググロウ=R55／コイン支払=R56／ルリグ下移動=R52／キーワード取得=R51／デッキシャッフル=R50／ルリグアタックステップ開始=R53／相手アーツ効果=R54／傀儡場出し=R48／ウェポン効果バニッシュ=R58／複合ORトリガー=R58）を**新 timing＋engine未配線マーク**で表現し切った。**残る作業は表現ではなく engine 配線（§5・全 R5-R58 は実機未検証）**。診断＝`npx tsx scripts/_flattenList.ts`（0枚を確認）。
>
> ⚠以下の「📍 残の分類」は R47 時点の地図で**歴史的記録**。リスト中の未完カードは R48-R58 で全消化済み（取り消し線は未付与だが BUGFIXES.md の R48-R58 を参照）。

**発見（VALUE curation R1-R4・2026-06-28）**: VALUE バケツの最大塊＝**`timing:["ON_TURN_END"]` だが action は `duration:UNTIL_END_OF_TURN` の【自】トリガー（当初102枚・他系統含め VALUE 全体159枚）**。原文トリガーは「〜したとき」（場に出た/ヘブン/スペル使用/ライズ/ウィルス配置/レゾナ場出し/トラッシュから場出し 等の多様な誘発）なのに、curated JSON が **トリガーを丸ごと落として `ON_TURN_END` に flatten**。結果＝**ターン終了時に付与して同時に失効＝実質 no-op の実バグ**（buff/debuff が一切効かない）。parser は `ON_PLAY` を出すが triggerScope/Filter を欠くため**両方とも誤**（resync 不可）。

- **計器/診断**: `npx tsx scripts/_flattenList.ts`（timing 変更カードの EXIST/FRESH 差を一覧・現在 0 枚）。health 計器は `npx tsx scripts/parserWorklist.ts`（held/LOSS/VALUE すべて 0）。※旧 `_valueTriage.ts`/`_resync.ts`/`_manualize2.ts`/`analyzeHeldCards.ts` と parser 計画3文書（parser_worklist/backlog/improvement_plan）は held 0 達成で 2026-06-28 削除。
- **直し方（per-card・trigger-type 別にグループ化して）**: ①原文トリガーを判定→正しい `timing`＋`triggerScope`（多くは any_ally）＋`triggerFilter`（クロス/ライズ/レゾナ/story 等）＋`triggerCondition` を再構築②**engine が当該トリガーを配線済みか必ず確認**（未配線＝ライズされたとき/ウィルス配置/トラッシュから場出し 等は機構実装が要る可能性）③`duration:UNTIL_END_OF_TURN` は維持。
- **⛔ bulk 禁止**（baton 鉄則）。trigger-type 別の小クラスタ単位で engine 確認→数枚ずつ→typecheck＋同型★0＋実機検証。trigger-type 内訳の目安＝スペル使用7／トラッシュから場出し6／ライズ6／ヘブン5／ウィルス4／レゾナ3／クロス持ち場出し 等＋汎用「場に出たとき」多数。
- **これが VALUE curation の最後の本丸**。**進捗＝VALUE 159→25（R5-R40 で消化）。残25は下記「📍 残の分類」へ集約**。
- **進捗（R別の完了ログは下記の取り消し線マーカー）**: R5-R13＝スペル使用/ドライブ/手札捨て/場出し各種/クロス・ライズアイコン/トラッシュから場出し等。R32-R40＝ON_DRAW効果ドロー/ウィルス/手札公開/コスト捨て/デッキ移動/手札トラッシュ/パワー0以下/凍結/ドローフェイズ以外ドロー(R39)/opp-draw(R40)。⚠WXK11-033-E1 step2「相手センタールリグLv4以上で追加ダブルクラッシュ」条件は未表現（近似）。
- **🔭 残 flatten のトリガー別・engine 配線分類（次セッションの地図）**＝`node scripts/_flattenView.mjs [正規表現]` で各カードのトリガー文＋action を確認できる（auto effect 順≒【自】文順で対応）。
  - **✅配線済み＝修正可（per-card で timing+scope+filter 再構築→MANUAL→実機検証）**: 「場に出たとき」系（クロス場出し4／レゾナ場出し3／傀儡1／他アーム1／ライズアイコン場出し1／トラッシュから場出し2 等）＝`ON_PLAY`＋`triggerScope:any_ally`＋triggerFilter（cross/story 等）。「手札を捨てたとき」系＝`ON_HAND_DISCARDED`。「アクセが付いたとき」＝`ON_ACCE`/`ON_ACCE_ATTACH`。「エクシードのコストとして…置かれたとき」2＝`ON_EXCEED_COST`。
  - **⛔未配線＝機構待ち（新 timing/収集機構が要る・触らない）**: ~~「ライズされたとき」~~ **【✅R8 ON_RISE】**／~~「アーツを使用したとき」~~ **【✅R7 ON_ARTS_USE】**／~~「デッキからトラッシュ」系~~ **【✅R9 ON_CARD_MILLED_FROM_DECK 新設・set-diff 検出・12枚。⚠原因限定/合計N枚/ミルカードフィルタは近似（下記）】**／「効果で対戦相手のパワーが減ったとき」2（§3 機構④の毒牙トリガー）／「コインを支払ったとき」「ウィルスが取り除かれたとき」「ゾーン移動」等。
  - **⚠ ミル機構の近似（R9・将来精緻化）**: ①原因限定（「効果1つ」「コストか効果」「あなたの＜悪魔＞シグニの効果」「《ディソナ》カードの効果」「あなたの効果」）は未表現＝過剰発火の可能性／②「合計N枚以上」は解決単位の delta で近似（複数効果跨ぎ累積は未対応）＝`cards_milled_from_deck_this_turn` ターンカウンタを足せば精緻化可／③ミルカードのクラスフィルタ（WXK10-052 ＜龍獣＞）は未判定／④コスト払いによるミルは効果解決経路外で未検出の可能性。対象=WXDi-P08-079・WXDi-CP02-010・WX24-P3-087・WXK10-052・WXDi-P13-085 等。
  - ~~手札捨て/アクセ/エクシードコスト~~ **【✅R10 完了・9枚】**。~~場に出たとき Group A（レゾナ/アーム/偶数Lv/相手効果場出し）~~ **【✅R11 完了・6枚】**。
  - ~~クロスアイコン4／ライズアイコン2~~ **【✅R12 完了＝matchesFilter に hasCrossIcon/hasRiseIcon 追加】**。
  - ~~トラッシュから場出し~~ **【✅R13 完了＝placedFromTrash 機構・set-diff 検出・6枚】**。
  - ~~ON_DRAW 効果ドロー2／ON_HAND_DISCARDED ディソナ1~~ **【✅R32 完了・既存配線】** WXK10-025/WXK10-040（ON_DRAW・scope self・turnOwner/thisCardOnly）／WXDi-P12-048（ON_HAND_DISCARDED・triggerFilter.isDisona）。
  - ~~ウィルス配置/除去 4枚~~ **【✅R33 完了】** `ON_OPP_VIRUS_REMOVED`/`CHANGED` は配線済み（JSON 未配線だった）＋`ON_OPP_VIRUS_PLACED` 新設。WX19-079（PLACED）/WX21-030（CHANGED）/WX21-068・WD19-009（REMOVED）。
  - ~~手札公開1／コスト捨て1~~ **【✅R34 完了】** WXK04-055（ON_SELF_REVEAL_FROM_HAND・target lossy も是正）／WX25-P3-071-E2（ON_DISCARDED_AS_COST）。⚠ON_SELF_REVEAL は usageLimit 未チェック・ON_DISCARDED_AS_COST は微菌限定未判定＝近似。
  - ~~カードがデッキ移動 4枚~~ **【✅R35 完了】** `ON_CARD_MOVED_TO_DECK` 新設（ミル機構の鏡像・set-diff `after.deck\before.deck`）。`movedToDeckOwner`/`movedToDeckMinCount`/`movedToDeckFromTrash`。WX09-020・WX22-014（自トラッシュ→自デッキ1/4枚）/WXK10-076・WDK09-013（相手→相手デッキ）。⚠近似＝発生源限定（効果1つ/悪魔等）未表現・解決単位 delta（複数効果跨ぎ累積未対応）。
  - ~~手札からトラッシュ（自カード）1／ブルアカ手札捨て1~~ **【✅R36 完了】** WDA-F02-17-E3＝`ON_TRASH`手札から（`collectAnyZoneTrashSelfTriggers(origin:hand)` 配線済・純データ・POWER target owner 是正）。WXDi-CP02-082＝【自】【絆自】を E1（`turnOwner:self`・相手-3000）/E2（`turnOwner:opponent`・DRAW）に分割し `triggerFilter.story:ブルアカ`。`collectHandDiscardTriggers` に `turnOwner==='opponent'`→相手ターンのみ発火の分岐追加（後方互換）。⚠近似＝「コストか効果によって」限定未表現・絆条件未ゲート・相手ターン手札捨て発火経路は実機未検証。**⚠別件**＝WDA-F02-17-E2「あなたの手札からカードがトラッシュに置かれたとき→正面ダウン」は場シグニが手札トラッシュを監視する**未配線機構**で別バグ（現 ON_PLAY 誤・flatten 対象外）。
  - **⛔ ON_TARGETED「対象になったとき」3枚（未配線・新機構が要る）**: WXDi-P11-040-E2／WX25-P2-055-E2／WX25-CP1-060-E2＝「このシグニが対戦相手の能力か効果の対象になったとき」。対象選択を全 executor でフックする侵襲的機構が要る＝重い。WX25-CP1-060 は「裏向き→表向き」機構も絡む。
  - ~~凍結状態になったとき~~ **【✅R38 完了・3枚】** `ON_SIGNI_FROZEN` 新設（ミル機構と同じ set-diff 検出点・`field.signi_frozen` false→true）。`collectFreezeTriggers`＝両場シグニの【自】を any_opp/any_ally で収集・triggeringCardNum で「そのシグニ」。WX08-039/WXEX2-02（相手手札1捨て）/WXDi-P04-065（targetsTriggerSource -1000）。全 any_opp・旧 ON_PLAY/ON_TURN_END 誤。⚠複数同時凍結時の once_per_turn／凍結のまま移動する稀ケースは未対応＝実機未検証。
  - ~~パワー0以下になったとき~~ **【✅R37 完了・5枚】** `ON_SIGNI_POWER_ZERO_OR_LESS` を `checkAndBanishPowerZero`（ルールバニッシュ useEffect・単一フック）で配線。`collectPowerZeroTriggers`＝両場シグニの【自】を triggerScope（any_opp 多数派/any_ally/self/any）＋turnOwner＋usageLimit で収集（同時0化は effectId dedup）。WX20-Re03/WX21-067/WX22-013-E2/WXDi-P01-043/WXDi-P14-009（全 any_opp・旧 ON_PLAY/ON_TURN_END 誤）。⚠近似＝-5000 連鎖0化の再発火・once_per_turn の actions_done 記録タイミングは実機未検証。
  - ⚠**ON_EXCEED_COST は field signi 非対応**（WXDi-P06-078）＝収集は exceedPaidCards（コストカード自身）のみ走査。field signi の「エクシードコストを支払ったとき」反応には field 走査追加が要る＝engine 拡張案件。
  - **📍 残15の分類（2026-06-28・R47 時点・`npx tsx scripts/_flattenList.ts` で再確認）**＝**配線済みクラスタ＋ON_DRAW 一族＋正面配置(R41)＋チャーム→トラッシュ(R42)＋エナ→トラッシュ(R43)＋エクシードコスト(R44)＋アクセhost条件/リフレッシュ/場→手札(R45)＋毒牙パワー減(R46)＋相手メイン開始(R47)は枯れた。残りは全て新トリガー機構が要る（1機構1〜数枚）**：
    - ~~**§4 ON_DRAW（opp-draw/位相）6枚**~~ **【✅R39+R40 完了＝ON_DRAW 一族完了】**: 位相2枚＝`triggerCondition.outsideDrawPhase`（R39・第4引数 isDrawPhaseDraw）／opp-draw 4枚＝`triggerScope:any_opp`＋`collectOppDrawTriggers`（R40・反対側の場を効果ドロー経路で収集・`drawPhaseRestriction`/`drawByEffect`）。WXDi-D09-P19/WXDi-P05-062/WXDi-P04-038/WXDi-P15-091/WD22-029-G/PR-423。
    - ~~**§3 機構④ 毒牙パワー減 2枚**: WX13-036・WXEX2-52~~ **【✅R46 完了＝ON_OPP_POWER_DECREASED・temp_power_mods set-diff・deltaFromOppPowerDecrease／⚠「あなたの効果」限定なし・temp_power_modsのみ】**
    - **ON_TARGETED「対象になったとき」3枚**: WXDi-P11-040・WX25-P2-055・WX25-CP1-060（上記⛔）。侵襲的＝重い。
    - **改造素材使用 2枚**: WXK09-047・WXK09-084「《改造素材》が使用されたとき」。改造素材の「使用」イベントが engine に無い＝use フロー実装が前提。
    - **1機構1枚の未配線トリガー（要個別実装）**: WX07-036（味方＜ウェポン＞が効果で相手をバニッシュ＝ON_SIGNI_BANISH_OPPONENT 系）／~~WX16-Re05（【チャーム】が場→トラッシュ）~~ **【✅R42 完了＝ON_CHARM_TO_TRASH・signi_charms set-diff・⚠バトル離脱経路は未検出】**／~~WXDi-P00-034（対戦相手のメインフェイズ開始時）~~ **【✅R47 完了＝ON_MAIN_PHASE_START・GROW→MAIN で collectTurnTriggers・triggerScope:any_opp／⚠action は REVEAL_AND_PICK 近似・シャドウ付与 target「このシグニ」未限定】**／~~WXDi-P03-043（正面に配置された＝placed front）~~ **【✅R41 完了＝triggerCondition.placedFront・frontLowerLevelThanSource 相乗り】**／WXDi-P04-035（味方がキーワード得た）／WXDi-P04-042（ルリグ下からカード移動）／~~WXDi-P04-043（リフレッシュ）~~ **【✅R45-2 完了＝ON_REFRESH・refresh_count set-diff／⚠ドローフェイズ過剰ドローrefreshは未検出】**／WXDi-P05-010（他ルリグがグロウ＝center/assist/CPU 分散）／~~WXDi-P06-078（ON_EXCEED_COST だが field signi 非対応）~~ **【✅R44 完了＝exceedCostPaidByPlayer・ルリグ起動経路のみ／カットイン未対応】**／WXDi-P11-064（他天使場出し OR 相手手札捨て＝複合）／WXDi-P15-069（コイン支払い）／WX25-CP1-042（ルリグアタックステップ開始時＋このターンのクラッシュ数依存）／~~WXK02-041（シグニが場→手札に戻った）~~ **【✅R45-3 完了＝ON_LEAVE_FIELD leftToZone:hand】**／~~WXK05-041（ON_ACCE_ATTACH host レベル≧4）~~ **【✅R45-1 完了＝accedHostMinLevel】**／WXK11-019（味方シグニが相手アーツの効果を受けた）／~~WD15-015（相手エナ→トラッシュ by 自効果）~~ **【✅R43 完了＝ON_ENERGY_TO_TRASH・energy set-diff・energyTrashedOwner・⚠発生源「自効果」限定なし】**／PR-470A（デッキがシャッフルされた）。
    - **傀儡場出し 1枚**: WDK17-001「傀儡状態のシグニが場に出たとき」＝3択＋傀儡フィルタ。
  - **⚠ 配線済みだが該当カードに複雑要素が絡み未対応**: ~~WXDi-P06-078~~ **【✅R44】**／~~WXK05-041~~ **【✅R45-1】**＝すべて解消。
  - **進め方（R36-R38 で確立した低リスク手法）**: **既存の単一検出点に新トリガー収集を相乗りさせる**のが安全（R37=`checkAndBanishPowerZero`／R38=ミルと同じ効果解決 set-diff ブロック／R36=`collectHandDiscardTriggers`）。リフレッシュ/グロウ/正面配置のように**フック点が分散する機構は高リスク**。`_flattenList.ts` でトリガー確定→1機構ずつ（timing+scope+filter 再構築＋MANUAL→typecheck＋同型★0＋decompile 原文一致→commit）。⚠全 R5-R38 は実機未検証（§5）。

## 4. 個別の複雑カード（機構待ち・着手候補）

- **エナ送り残6枚**（親STUB＝引用付与/選択肢/使用条件の実装が前提）: WXEX2-20（E3 引用内）／WXDi-P01-040（FLIP系STUB内）／WX25-P2-041（付与引用内）／WXK09-031（誤パース）／WXK10-011（CHOOSE吸収）／WXDi-P01-005（使用条件誤パース）。
- **凍結状態フィルタのアサシン変種**: WX25-P2-084②「【アサシン（凍結状態のパワー3000以下のシグニ）】」＋2択。
- **公開カード→自身のアクセ化**: WDK07-E15（新STUB `INTERNAL_ACCE_PICKED_TO_SELF` が要る）。
- **公開カードと同レベルの動的フィルタ**: WX24-P3-063（公開カードのレベルで相手全シグニ能力消失）。
- **前ターン跨ぎ保持**: WXDi-P11-001（「直前のターン」ライフクラッシュ履歴）。
- **使用制限の誤パース＋択崩壊**: WX20-021（「相手ターンにしか使えない」が壊れCONTINUOUS化＋3択全脱落）／WX24-P3-036（スペル打消し＋《無》任意払い）／WD14-011（E1トリガー thisCardOnly化＋BURST2択崩壊）。
- **コスト増加 残**: WXK11-003「このターン」型／WXDi-P06-031 等の起動能力コスト増加／WX20-Re20 等の自アーツコスト選択数依存。
- **引用/LB付与（ディスペア型）未対応**: WXDi-P02-039-E2／WX25-P3-027-E2（現 no-op or 誤バニッシュ）＝要本実装。
- **多重「エナゾーンから…」記述の取り違え**: WX25-CP1-006④（`OPTIONAL_TRASH_ENERGY_CLASS` がカード内の別記述②を誤マッチ）。
- **WXK10-008①**「相手ターン中エナの色と能力を失う」＝新語彙未対応（②のみ実装）。
- ~~**ON_DRAW 系の opp-draw / 位相条件6枚**~~ **【✅R39+R40 完了】**: opp-draw 4枚＝`triggerScope:any_opp`＋`collectOppDrawTriggers`（drawPhaseRestriction/drawByEffect）／位相2枚＝`triggerCondition.outsideDrawPhase`。⚠近似＝「自分の効果で」の発生源プレイヤー限定・main_attack のターン主体は未判定（§5 で実機検証）。
- **任意コスト＋特定札捨ての複合 STUB 近似（機構待ち）**: WDK08-Y12（《緑》《緑》《無》《無》支払い＋手札から《幻水ダンクルテウス》1枚捨て→そうした場合バニッシュ）／WX24-P2-048-E1 choice①（対象シグニのレベル1につき白カード1枚捨て→手札に戻す）。現状 `OPTIONAL_COST` で近似（energyコスト or per-level discard を完全表現せず）。parser は `TARGET_AND_DISCARD_HAND` を出すがこちらも特定札/energy/per-level を落とす＝どちらも lossy。EXIST 近似を MANUAL ロック中（VALUE curation R3）。本実装には「energy＋特定名カード捨て」「per-level 捨て枚数」の汎用コスト機構が要る。
- **その他既出複合**: WX25-CP1-002（リコレクト択一④ owner）／WX25-P3-023-E2（遅延トリガー）／WXEX1-08（コインベット誘発＋ライズフィルタ）／WX16-048・WX16-023（ウィルス数+1の選択数スケール）／WX25-P1-103（look-pickチェーン）／WD22-036-G（self-banish起点の複合2択）／WX25-P1-052-E1（《相手ターン》AUTO＋名指しカード在場）／WXDi-P08-037（place-swap＋覚醒トリガー誤）。
- **保留（core改変が必要・1枚のためにはリスク過大）**: WXDi-P00-026（＜さんばか＞ルリグ付与＝ルリグ再アタック未実装がブロッカー）／**47枚の【使用条件】【チーム】**（ピース/アーツ使用ゲート＝正規デッキでは常に成立し機能的に等価のため保留妥当）。

---

## 5. 実機検証の宿題（ヘッドレス不可・PvP/CPU実機が要る）

実装済みだが対話 pause/resume・CPU代行のため自動検証できないもの。**安定確認まで関連拡張に進まない。**

- **ON_LRIG_ATTACK_STEP_START（C1・ルリグアタックステップ開始時・2026-06-29配線）**：1枚（WX25-CP1-042-E2）。`doPhaseAdvance` の ATTACK_SIGNI→ATTACK_LRIG 移行で `collectTurnTriggers` が発火。要確認＝①シグニアタック→ルリグアタックへフェイズを進めたとき E2 が発火する②《ターン1回》③アクションは**パース近似**＝原文「クラッシュした相手ライフ1枚につき相手手札1捨て」ではなく固定「相手手札1トラッシュ＋ブルアカ-5000」が走る（厳密スケーリングは別課題）。⚠**CPUターンのルリグアタックステップは未配線＝follow-up**。
- **ON_COIN_PAID（C1・コインを支払ったとき・2026-06-29配線）**：3枚（WXDi-P15-055/069・WXDi-P16-057＝闘争派//THE DOOR）。コイン支払の各サイトで `collectCoinPaidTriggers` が発火。要確認＝①シグニ【起】《コイン》/【出】《コイン》/グロウ/キープレイ/アーツベットでコインを支払うと発火（WXDi-P15-055＝闘争派シグニをトラッシュから場出し・WXDi-P16-057＝2択・WXDi-P15-069＝+2000を《ターン2回》）②支払い1イベント＝1回発火（2枚払いでも1回）③《ターン1回》《ターン2回》の回数制限が効く④自分のターン外（相手ターンのガード等でコイン支払）でも発火するか（turnOwner未指定なので発火する想定）。⚠**スペルのベット（pending_spell/カットイン経由）とCPUルリグ【出】《コイン》は未配線＝follow-up**。
- **ON_LRIG_GROW（C1・ルリグがグロウしたとき・2026-06-29配線）**：5枚。`executeGrow`（人間・ゲットグロウ含む）/CPUセンターグロウで `collectLrigGrowTriggers` が発火。要確認＝①自分のセンターグロウで any_ally が発火（WXK11-012＝キーがエナチャージ／WXDi-P03-039／WXDi-P05-010＝ルリグ自身）②相手のグロウで any_opp が発火（WXDi-P13-047＝相手エナ1トラッシュ・WXDi-P03-046＝トラッシュから黒シグニ回収）③any_opp トリガーがグロウ先ルリグの【出】より**先に**解決される（effect_stack opp 側先行）④《ターン1回》が2回目グロウで再発火しない⑤watcher がシグニ/キー/ルリグ上の3ゾーンで拾える。⚠**アシストルリグのグロウ経路は未配線（センターグロウのみ）＝follow-up**。
- **ON_TARGETED（C1・対象になったとき・2026-06-29配線）**：「このシグニが対戦相手の能力か効果の対象になったとき」AUTO（14枚）。`BattleScreen.handleEffectInteraction` の SELECT_TARGET 確定経路で `collectTargetedTriggers` が発火（人間/CPU双方）。要確認＝①相手の効果で自分のシグニが対象に取られた瞬間に発火（WXDi-P11-040＝相手ターンに対象→自シグニにシャドウ付与／WX25-P2-055＝相手シグニの能力消失／WXDi-P02-043＝エナチャージ／WXDi-D09-H14＝any_ally赤フィルタ＝赤シグニが対象で発火し相手エナトラッシュ）②triggerCondition.turnOwner:opponent が相手ターン限定で効く③usageLimit《ターン1回》が複数対象でも1回④自分の効果が自分のシグニを対象にしても非発火⑤WX25-CP1-060 は condition(HAS_CARD_IN_FIELD ブルアカ)成立時のみ。⚠**forced単一対象（pending無しで自動解決される対象取り）経路は未発火＝follow-up**。
- **引用付与の実発火（B4・GRANT_QUOTED）**：引用された【自】/【常】能力を自場シグニの granted_effects に積んで実発火。要確認＝①「あなたの〜シグニ1体を対象とし、ターン終了時まで、それは『【自】このシグニがアタックしたとき〜』を得る」型（WX24-P2-018 アサシン付与／DRAW付与等）で、付与先シグニのアタック時に当該AUTOが実発火する②ターン終了時に granted_effects がクリアされる③parse が STUB になる複雑引用（WXDi-P14-061 等）は従来どおり無発火（誤動作しない）。⚠permanent（このゲームの間・WXK07-001）/相手シグニ付与（WX25-CP1-067）は未対応＝log-only 据置。
- **REVEAL_DECK_TOP＋動的閾値（B2・WX17-028）**：【出】《赤×0》＝デッキ上4枚公開→パワーが「公開シグニのレベル合計×1000」以下の相手シグニ1体バニッシュ→公開カードをトラッシュ。要確認＝①デッキ上4枚が公開されシグニのレベル合計が閾値になる②閾値以下の相手シグニのみ対象に取れる（複数候補は選択UI）③公開4枚（シグニ以外含む）がトラッシュに置かれる④E1＝アタック時トラッシュから宇宙シグニ4枚（それぞれ異レベル）デッキ戻し→ダブルクラッシュ。⚠eachDistinctLevel 厳密 enforce 未対応（同レベル4枚でも通る近似）・【出】を AUTO ON_PLAY 表現。
- **INSTALL_DELAYED_TRIGGER（B3・WX25-CP1-069）**：【自】アタック開始時に手札1枚捨て→このターン「青の＜ブルアカ＞シグニが相手ライフをクラッシュしたとき相手手札1枚捨て」を設置。要確認＝①自ターンのアタック開始時に手札1捨てで delayed_triggers に設置される②設置後、青ブルアカシグニのアタックで相手ライフをクラッシュしたとき相手が手札1枚捨てる③ターン終了時に delayed_triggers がクリアされ翌ターン以降発火しない④【絆常】+4000 が絆獲得時のみ適用。⚠crasherFilter は「場に該当シグニがいるか」で近似＝青ブルアカ以外のクラッシュ（ルリグ/別色シグニ）でも場に青ブルアカがいれば誤発火しうる（実際のクラッシュ源未追跡）。

- **ON_OPP_POWER_DECREASED（R46・毒牙）**：WX13-036/WXEX2-52＝あなたの効果で相手シグニのパワーが減った→このシグニを減った値と同じだけ+。要確認＝①自効果で相手シグニを-N000したとき、このシグニが+N000される（減少量と一致）②複数同時減少時の合算挙動③相手自身の自己弱体では発火すべきでない（現状は近似で発火しうる）④UNTIL_OPP_TURN_END 弱体は未計上。
- **ON_ACCE_ATTACH host条件/ON_REFRESH/ON_LEAVE_FIELD leftToZone（R45）**：①WXK05-041＝アクセがレベル4以上のシグニに付いたとき→相手シグニ《青》任意-12000（host Lv判定・once／E1=相手ターン終了時に自身を手札に戻す）②WXDi-P04-043＝いずれかがリフレッシュ→相手シグニ《黒》任意-10000（refresh_count delta／ドローフェイズ過剰ドローrefreshは未検出）③WXK02-041＝シグニが場→手札に戻った→自＜遊具＞+2000（行き先=手札判定・離脱と同側watcherのみ）。
- **ON_EXCEED_COST 場シグニ（R44）**：WXDi-P06-078＝あなたがエクシードコスト支払い→対戦相手シグニに《黒》任意払い-5000。要確認＝①ルリグ起動でエクシードコストを支払ったとき発火（自ターン・once_per_turn）②STUB の対象選択CHOOSEで相手シグニ1体に-5000が実際に適用される（targetsTriggerSource no-op 修正後）③カットイン exceed では未発火（近似）。
- **ON_ENERGY_TO_TRASH（R43）**：WD15-015＝あなたの効果で相手エナ→トラッシュ→このシグニにダブルクラッシュ。要確認＝①自効果で相手エナをトラッシュに送ったとき発火（このシグニが thisCardOnly でダブルクラッシュ取得）②自エナ・相手効果による相手エナトラッシュでは非発火（energyTrashedOwner:opponent だが「自効果」限定は近似で未判定）。
- **ON_CHARM_TO_TRASH（R42）**：WX16-Re05＝【チャーム】が場→トラッシュ→相手シグニ-4000。要確認＝①効果でチャーム付きシグニが離脱/チャーム除去されトラッシュに行ったとき発火②**バトルバニッシュで host が離脱したとき**（効果解決経路外＝現状未検出の可能性）③複数チャーム同時トラッシュは1回のみ（近似）。
- **placedFront（R41・ON_PLAY any_opp placedFront）**：WXDi-P03-043＝対戦相手のシグニがこのシグニの正面に配置されたとき→それを-3000。要確認＝①相手が正面ゾーン（盤面反転で 2-自ゾーン）にシグニを配置（召喚/効果）したときのみ発火②正面以外の配置では非発火③targetsTriggerSource がその配置シグニに-3000。
- **opp-draw（R40・ON_DRAW any_opp）**：対戦相手が効果でカードを引いたとき→各効果。要確認＝①相手の効果ドローで reactor 側の【自】が発火（host↔guest 両方向）②WXDi-P04-038 はメイン/アタック中のみ・once_per_turn③WD22-029-G は相手アタックフェイズ中のみ（opp_attack＝ATTACK系サブフェイズ＋!自ターン）④PR-423 はダメージ＋自バニッシュ。⚠近似＝「自分の効果で」発生源限定なし（自効果で相手に引かせても発火しうる）。対象=WXDi-P04-038/WXDi-P15-091/WD22-029-G/PR-423。
- **outsideDrawPhase（R39）**：ドローフェイズ以外で引いたとき→各効果（全自シグニ+1000／手札1捨て→ドロー）。要確認＝①メイン/アタックフェイズの効果ドロー（グロウ時・スペル等）で発火②ドローフェイズの通常ドロー（マンダトリードロー）では非発火③WXDi-D09-P19 の twice_per_turn が2回まで発火。対象=WXDi-D09-P19/WXDi-P05-062。
- **凍結トリガー（R38・ON_SIGNI_FROZEN）**：相手シグニが凍結状態になったとき→各効果（相手手札1捨て×2／そのシグニ-1000）。要確認＝①FREEZE 効果で相手シグニが凍結したとき `detectNewlyFrozen` が検出し watcher の【自】を発火②《ターン1回》が複数同時凍結（WXEX2-02 の【出】全凍結等）でも1回③WXDi-P04-065 の targetsTriggerSource が凍結したそのシグニに-1000。対象=WX08-039/WXEX2-02/WXDi-P04-065。
- **パワー0以下トリガー（R37・ON_SIGNI_POWER_ZERO_OR_LESS）**：相手シグニが0化したとき→各効果（エナ/ドロー/CHOOSE/エナチャージ/相手-5000）。要確認＝①相手シグニ0化で `checkAndBanishPowerZero` が watcher の【自】を発火②《ターン1回》が複数同時0化でも1回③WXDi-P14-009 の-5000 が別シグニを0化したときの連鎖再発火④WXDi-P14-009 は自ターンのみ発火。対象=WX20-Re03/WX21-067/WX22-013/WXDi-P01-043/WXDi-P14-009。
- **手札捨て/トラッシュ flatten（R36）**：①WDA-F02-17-E3＝このカードを手札からトラッシュ→相手シグニに任意《青/黒》払い−5000（ON_TRASH 手札から発火確認）。②WXDi-CP02-082＝自ターンにブルアカ手札捨て→相手−3000（E1）／**相手ターン**にブルアカ手札捨て→ドロー（E2・`turnOwner:opponent`）。要確認＝相手ターンに手札を捨てる経路（ガード等）で `collectHandDiscardTriggers` が E2 を発火するか・自ターンで E1 のみ発火するか。
- **drawBySourceStory（WX20-026-E3・R31）**：自＜凶蟲＞シグニの効果ドローで相手シグニ−4000。要確認＝①E1/E2 の自前ドローで発火し相手シグニが−4000される②ドローフェイズの通常ドローでは非発火③別カードの効果ドロー（凶蟲以外）では非発火④前ターンの効果ドロー後、次ターン通常ドローで残値誤発火しない。
- **ON_PLAY any_opp + targetsTriggerSource（WXK10-022・R30）**：相手シグニ配置時に自ターン中のみ能力消失。
- **ビート機構 Phase1-7**：[条件]ゲート開閉／ON_BECOME_BEAT watcher の self/any_ally 出し分け／コスト発動→beat化→連鎖／**beat対象のプレイヤー選択UI**（場シグニ選択）／CPU=自動近似。
- **機構④誤parse3枚**：WXDi-P07-044（E1 手札捨て時／E2 効果配置時のFREEZE+−2000）／WX25-P3-062-E2（ハナレ条件＋エナ＜毒牙＞任意トラッシュ→両者−20000）。
- **F-3 身代わり対話**（バトルバニッシュ経路）：犠牲型 WX12-024/WXEX2-60/WX20-055/WXDi-CP01-032/WXDi-P10-052、コスト払い型 WX10-033/WX11-029。
- **LOOK_AND_REORDER の canTrash UI** / **WX04-005-E3**（場出し数制限・捨て選択）/ **WX04-004-E2**（守備側アタック無効化）。
- **G144/G145**（効果配置時の any_ally 反応）：(a) 他シグニをダウン配置→G144アップ、(b) 他シグニ場出し→G145自身アップ。回帰注意＝非byEffect の any_ally ON_PLAY も効果配置で発火するようになった。

---

## 6. オープンな実装課題（機構・基盤）

- **F-3 効果バニッシュ経路（身代わり置換の execBanish フック）**：現状バトルバニッシュのみ対応。効果バニッシュ/バウンス等の場離れは未フック（execBanish 側に置換差し込みが要る・F-2 身代わりと共通課題）。対象: WX06-019（効果離場+powerReduction）／WX25-P1-056（非バニッシュ離場→バニッシュ置換）／WX17-075（`ON_PLACED_FRONT` 任意トリガー）。いずれも現状 no-op で無害。
- **D. CPU AI の拡張**：メインフェイズ AI（アーツ/スペル/起動効果の能動使用・グロウ時トリガー）未実装。CPU 召喚の ON_PLAY 解決は「全配置後まとめて」の近似（人間は1枚ごと）。トラッシュ起動の CPU 使用も未。
- **トラッシュ自己起動のコストUI 残**：エナコスト以外（手札捨て/コイン/エクシード/ウィルス除去/アタックフェイズ起動）が未対応。対象: WXDi-P03-087/P07-089/P09-045/P12-053/P16-082/CP01-050・WX11-049・WX17-049・WX19-029（データ thisCardOnly+trashActivated は全14枚で正）。
- **UNKNOWN（部分未実装 parseStatus=PARTIAL）**: WX05-010（ライフ見て任意トラッシュ→同数補充）／WX11-037（5枚公開→宣言カード手札）／WX11-043（ヘブン時に手札青スペル使用）／WX17-003。
- **クラフトトークンの実機配置検証** ＋ ADD_TO_FIELD source 近似残: WXDi-CP02-087（エナ枚数条件）／WXDi-P03-078（自パワー動的フィルタ）／WXDi-P05-068（先頭ドロー脱落）／WXK07-105（ベット分岐）／WX25-CP1-066（場存在条件）／WX22-001-E3（付与型 leave トリガー機構）。

---

## 7. 文型★トリアージ（継続タスク・主戦場は大型機構へ移行済み）

- `grouped_sentence_all.txt`（文型★）の⚠脱落疑いを上から潰す。**簡単な系統バグはほぼ枯れ、残りは機構実装待ちが中心**（§3〜§6）。
- ⚠ **「脱落疑い件数（242枚前後）」は指標にしない**：メトリクスが「。区切りの文数」で粗く、decompiler が複数効果を1行に圧縮するため内容修正で減らない。真の指標は **同型★0＋該当カードの逆翻訳が原文一致**。
- **decompiler 改良候補**: テキスト実行時パース型STUB（`BET_MECHANIC`・`CHOOSE_SAME_OPTION_*`・`DO_THREE_THINGS` 等）を原文反映で描画すれば★偽陽性がさらに減る。
  - ~~**`PLACE_UNDER_SIGNI` の count 描画バグ**~~ **✅修正済（2026-06-28）**＝source/count/filter を正しく描画。
  - ✅**`GRANT_QUOTED_AUTO_ABILITY`/`GRANT_QUOTED_ABILITY` を原文の引用能力で描画（2026-06-28）**: **前置型**「…は『【自/常/起/出】…』を得る」（10枚）＋**後置型**「…は以下の能力を得る。『…』」（2枚＝WXDi-D04-011/WX24-P3-003）の両方を完全描画。引用が見つからない場合のみ `[STUB:引用された能力を付与する（原文参照）]` フォールバック。同型★0維持。**残課題**＝WX15-059/WX20-069 等 約30枚は GRANT_QUOTED_AUTO_ABILITY 自体が**誤パース**（原文に引用が無い）＝parser 是正案件（P1_PLAN §3 A2）。

### 7.1 ✅ 脱落疑い 棚卸し＋実バグ候補修正 完了（2026-06-28・P1 DoD(a)）
診断＝`node scripts/_dropTriage.mjs`（再現可能・`docs/_drop_triage.txt` に明細）。**⚠脱落疑い 255枚を全分類（要確認 0・実バグ候補 0）**：
- **偽陽性 179枚**（直さない）＝CHOOSE/選択肢圧縮77・LOOK/REVEAL文法崩れ50（R14/R28 で着手禁止確定）・使用条件前置き26・ルール注記6・アンコール注記+本体present7・リコレクト条件分岐/付与展開6・付与展開present等。
- **機構待ち 72枚**＝STUB 56・GRANT_QUOTED付与引用（空/圧縮/遅延）9・トラップ設置(SET_TRAP語彙なし)1・GRANT_KEYWORD CHOOSE脱落1・別timing付与の1効果脱落2・近似注記1＋**WX17-028（【出】動的閾値「公開シグニのレベル合計×1000以下」＝語彙なし）／~~WX25-CP1-069（遅延条件トリガー）~~ **✅B3完了（2026-06-28・INSTALL_DELAYED_TRIGGER）**／~~WX17-028（動的閾値）~~ **✅B2完了（2026-06-28・REVEAL_DECK_TOP＋powerLteRevealedSigniLevelSum）**。／~~GRANT_QUOTED_AUTO 精緻化~~ **✅B4完了**／~~SET_TRAP~~ **✅B1完了（2026-06-28・トラップSTUB逆翻訳。engineは既存 signi_traps）**。**§5 B機構は全完了（B1-B4）**。残るは C（engine 実機配線・P2）。
- **✅ 修正済（JSON を MANUAL でパッチ・逆翻訳が原文一致・typecheck緑・同型★0）＝255内4枚＋トラップ調査発見1枚（255外）**:
  - **WXK01-063 貫穿**＝SEQUENCE に POWER_MODIFY +2000（ターン終了時まで）を追加＋GRANT_KEYWORD Ｓランサー（targetsLastProcessed）。
  - **WX18-019 奮闘努力**＝SEQUENCE で SEARCH(maxCount2)→ENERGY_CHARGE＋SHUFFLE_DECK に復元（旧 SHUFFLE_DECK のみ）。
  - **WDK15-009 スティング・スイング**＝SEQUENCE で TRANSFER_TO_HAND×2（filter:hasRiseIcon／nonColorless）に復元（旧 count:1 シグニ）。⚠《ライズアイコン_黒》の色限定は hasRiseIcon で近似（色は未限定）。decompiler に hasRiseIcon/hasCrossIcon の filterJa を追加。
  - **WX16-062 中罠　ラクガキ**＝TRAP_ICON 効果（BOUNCE：対戦相手のレベル3シグニ1体を手札に戻す）を追加（旧 BURST のみ＝《トラップアイコン》本体が脱落）。
  - **WX16-064 小罠　ケシオトシ**（255外・トラップ調査で発見）＝TRAP_ICON 効果（BANISH：対戦相手のパワー2000以下のすべてのシグニ）を追加（旧 BURST のみ）。
- **🪤 トラップ未表現クラスタ＝調査完了（系統的でないと判明）**: 「原文に《トラップアイコン》ありJSONにTRAP無し」約20枚を精査した結果、**大半はルール注記の偽陽性**（トラップ本体見出しが無い）、残りも **(i) トラップ設置型＝SET_TRAP/PLACE_TRAP_FROM_REVEALED STUB（WX15-002/082 等・語彙なし＝機構待ち）／(ii) 本体が他効果にマージ済み（WX16-029/041/065/066＝誤構造だが機能present）**。**クリーンにトラップ本体だけ脱落していたのは WX16-062/WX16-064 の2枚のみ＝両方修正済**。~~残るトラップ案件は「SET_TRAP 設置アクション機構」＝§5寄りの機構タスク~~ **✅B1完了（2026-06-28）**＝engine は既存（signi_traps ゾーン）、decompiler の9系統トラップSTUB描画を追加し生STUB残0。残＝「マージ済み誤構造の分割」（WX16-029/041/065/066）＝個別テール。
  - ※crude metric（。区切り文数）では rule-note（）が原文文数を水増しするため 3枚は計数上 dropSuspect に残るが、逆翻訳は原文の全効果を表現済み（件数は非指標＝§7 冒頭の注記参照）。

## 8. 検証・品質（補助）

- **検証ハーネス＝C/D 作業時は毎回 `npm run smoke` ＋ `npm run golden` ＋ `npm run fuzz` を回帰チェックに回す**（全て数秒・実機不要）。3つとも engine（executeEffect/resume*）対象＝BattleScreen 配線は対象外（後述 Stage2）。
- **`npm run smoke`（②実行スモークハーネス・2026-06-28新設）＝全効果10557件をヘッドレス自動実行しCRASH/HANG/INVARIANTを検出**。現状＝CRASH/HANG/INVARIANT 全0（OK 10294／SKIP 263）。**autopilot ループ判定を修正済（2026-06-29）**＝同一pending種別の連続ではなく候補シグネチャ同一でのみ SKIP 判定（SELECT_TARGET連続の誤SKIP解消）。STEP_CAP 60→200。次段の拡張候補＝(a)autopilot のカバレッジ拡張（REVEAL_CARDS/DECLARE_BOND 等＝現SKIPを解消）(b)不変条件の強化。
- **`npm run golden`（③構文ゴールデンテスト・`scripts/goldenTest.ts`・2026-06-29 npm登録）＝主要DSLアクション型ごと制御盤面で結果をassert（型単位で③正しさを担保）**。現状＝PASS 21／FAIL 0。テストの足し方＝`test('名前', () => { ... assert ... })` を追加するだけ。直近で `UP` アクションの選択後適用ループを本テストが検出→engine 修正（BUGFIXES参照）。
- **`npm run fuzz`（②実行レベル検証の最終形・`scripts/selfPlayFuzz.ts`・2026-06-29新設）＝乱択 自己対戦ファズ。ランダム初期盤面で効果を連鎖発動し相互作用/進化盤面クラッシュ/ループ/カード爆発を検出**。シード固定で完全再現可能（既定200ゲーム×40手・約0.4秒・効果実行≈7800手/distinct≈2640種）。現状＝CRASH/HANG/INVARIANT/EXPLOSION 全0。重め＝`npm run fuzz -- --games 2000 --moves 80`。失敗時はシード＋手番で再現（`--seed S --verbose`）。次段拡張候補＝(a)attack/grow/phase など「手」の種類を増やす(b)EXPLOSION 閾値の精緻化(c)owner/other 偏りの調整。
- **【Stage2・着手中(claude)】BattleScreen 配線の純粋抽出＝C 配線の自動検証化**。collect*Triggers を `src/engine/` の pure 関数へ抽出し golden/fuzz から呼べるようにして C 配線（ON_TARGETED 発火等）を自動検証＝C2 宿題を削減する取り組み。
  - ~~第1弾（2026-06-29）＝C1 の3ヘルパ `collectTargetedTriggers`/`collectLrigGrowTriggers`/`collectCoinPaidTriggers` を `src/engine/triggerCollect.ts`（pure・依存は `TrigCtx` で注入）へ抽出。BattleScreen は薄いラッパ（`mkTrigCtx()` で bs/effectsMap/battleCardMap 等を束ねて渡すだけ）に置換＝挙動不変。golden に **C1 トリガー収集テスト7件**追加（PASS 28/28）＝ON_TARGETED の self/turnOwnerゲート/非対象、ON_LRIG_GROW の any_opp 発火/自グロウ非発火、ON_COIN_PAID の self発火/once_per_turn を自動検証。~~ **✅完了**
  - ~~第2弾（2026-06-29）＝`collectPowerZeroTriggers`（ON_SIGNI_POWER_ZERO_OR_LESS・R37・C2リスト5枚）を `triggerCollect.ts` へ抽出＋golden3件追加（PASS 31/31）。R37 発火条件が C2→golden へ。~~ **✅完了**
  - ~~第3弾（2026-06-29）＝`collectArmorTriggers`（ON_BLOOD_CRYSTAL_ARMOR・armor6枚は全 self）を抽出＋golden2件追加（PASS 33/33）。~~ **✅完了**
  - ~~第4弾（2026-06-29）＝ON_TRASH 3関数（`collectTrashTriggers`/`collectDeckTrashSelfTriggers`/`collectAnyZoneTrashSelfTriggers`）を抽出＋golden4件追加（PASS 37/37）。byOpponentEffect/fromZones/fromAnyZone/IS_MY_TURN ゲートを検証。~~ **✅完了**
  - ~~第5弾（2026-06-29）＝`collectBanishTriggers`（ON_BANISH・アクセ付与復元/activeCondition/once_per_turn 含む）を抽出＋golden3件追加（PASS 40/40）。`TrigCtx.meId`（視点）追加で my/op 分岐とエントリ順を保持。~~ **✅完了**
  - **残＝他の collect*Triggers の抽出**（`collectLeaveFieldTriggers`(`resolveLeaveFieldDynamicFilters` 依存)/`collectFieldTriggers`(ON_PLAY・複雑)/`collectHandDiscardTriggers`/`collectTurnTriggers`(ON_TURN_*/ATTACK_PHASE/LRIG_ATTACK_STEP) 等）と、`detect*`（盤面差分）／フェイズ進行／effect_stack 整列の抽出。これらが済むと既存配線（R5-R58）も golden 化でき C2 が大幅に減る。⚠17000行からの抽出＝中リスク・1ファミリずつ・抽出は薄いラッパ化で挙動不変を保つ。次の候補＝`collectLeaveFieldTriggers`（`resolveLeaveFieldDynamicFilters` も要抽出）か `collectFieldTriggers`（ON_PLAY・複雑）／`collectTurnTriggers`（特殊ケース多数＝中リスク）。
- `checkAllEffects` の `MANDATORY_SUSPICIOUS`（ヒューリスティック検出）の精査。`verifyEffects` の「定義なし」誤検出（注釈・トークン）の除外改善。
- 生ID残存＝表示or実装の穴：`[STUB:X]` 系（残54件＝単発テール・STUBS.md管理）。`[条件:X]`/`[アクション:X]` は解消済み。
