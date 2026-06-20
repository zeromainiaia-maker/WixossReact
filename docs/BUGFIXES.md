# バグ修正記録 (BUGFIXES)

これまでに修正した主要なバグ・系統的修正の記録。新しいものを上に追記する。
設計方針は [DESIGN.md](./DESIGN.md)、未対応の作業は [TODO.md](./TODO.md)。

---

## 専用の手札公開モーダル `REVEAL_CARDS` を新設（v0.410, 2026-06-20）

- **「対戦相手の手札を見て」系の情報アドバンテージを専用モーダルで再現。** v0.409 のログ公開を、閲覧専用モーダルに格上げ。
- **新インタラクション `REVEAL_CARDS`（`PendingInteractionDef`）:** `{ cards, title?, continuation? }`。選択を伴わずカード群を公開表示し、「確認」で `continuation` を実行する。`resumeRevealCards`（effectExecutor）は continuation を実行するだけ（状態変更なし）。
- **`TK3_DECLARE_DISCARD` を2段化:** 数字宣言（CHOOSE）→ `REVEAL_CARDS`（相手手札全体を公開）→ 確認後に新 STUB `TK3_DISCARD_BY_LEVEL` が宣言レベルのシグニを全捨て。効果オーナー（＝見る側）が respond するため、人間の効果なら人間がモーダルで相手手札を視認、CPU の効果なら CPU が自動確認（人間には CPU の手は見せない）。
- **BattleScreen:** `handleEffectInteraction` に `REVEAL_CARDS` 分岐（`resumeRevealCards`）＋モーダル描画（カードを face-up グリッド＋確認ボタン）。CPU 自動解決は `selected=[]` で既存経路に乗る。
- **反映:** types/index＋effectExecutor＋execStubPart1＋BattleScreen。typecheck 通過。WD03-006/WX25-P1-TK3（ダーク・アナライズ）に適用。

---

## TK3_DECLARE_DISCARD に相手手札の公開ログを追加（v0.409, 2026-06-20）

- **WD03-006/WX25-P1-TK3 の「対戦相手の手札を見て」の情報アドバンテージを再現。** 従来は同レベルのシグニを自動で捨てるだけで相手手札全体が見えず、「見て」で得られる**手札情報**が失われていた。
- **修正:** `TK3_DECLARE_DISCARD` 解決時に**対戦相手の手札全体をバトルログに公開**（`対戦相手の手札を見る：<カード名…>`）。捨てる対象が無い場合も公開する。専用の手札公開モーダルは新設せず、ログで情報を可視化（PvP でも相手は自分の手札を既知なので問題なし）。typecheck 通過。

---

## WD03-006 ピーピング・アナライズ（アーツ）誤パース修正（v0.408, 2026-06-20）

- **逆翻訳スキャンで発見。** 「数字１つを宣言する。その後、対戦相手の手札を見て、宣言した数字と同じレベルのシグニをすべて捨てさせる。」が `SEQUENCE[DECLARE_NUMBER, DECLARE_NUMBER]`＝宣言STUBが**重複**し「捨てさせる」処理が欠落していた。
- **修正:** 同一効果の WX25-P1-TK3（ダーク・アナライズ）が既に持つ STUB `TK3_DECLARE_DISCARD`（数字宣言の CHOOSE→相手手札の同レベルシグニを全捨て）に置換。manualEffects＋プリビルド JSON。typecheck 通過。

---

## WD02-007 背炎之陣（アーツ）誤パース修正（v0.406, 2026-06-20）

- **逆翻訳スキャンで発見。** 「手札を３枚捨てる。そうした場合、すべてのシグニをバニッシュする。（あなたのシグニも含まれる）」が二重に誤っていた。
  - ①「そうした場合」を `CONDITIONAL{IS_MY_TURN}` に誤パース（本来は「3枚捨てた場合」）。
  - ②`BANISH owner:'any' count:ALL` は `execBanish` で `ownerState('any')→otherState`＝**相手シグニのみ**バニッシュ＝「あなたのシグニも含まれる」が欠落。
- **修正:** 手札3枚捨てをコスト化（`cost.discard:3`）し、`SEQUENCE[BANISH self ALL, BANISH opponent ALL]` で両者の全シグニをバニッシュ。manualEffects＋プリビルド JSON。typecheck 通過、verify 新規警告なし。

---

## F-3 効果離場型 身代わり（powerReduction）を execBanish に配線（WX06-019）（v0.403, 2026-06-20）

- **対象＝TODO F-3 積み残し「効果離場型」WX06-019（シロナクジ）。** 「あなたの他の＜水獣＞が**対戦相手の効果によって**場を離れる場合、代わりにこのシグニのパワーを-6000してもよい」。バトル経路の対話本実装（v0.401/402）とは別に、**効果バニッシュ経路（`execBanish`）に限定フックを追加**。
- **`findEffectLeavePowerReductionSubstitute`（effectExecutor・純関数）:** victim owner の場に CONTINUOUS `BANISH_SUBSTITUTE{substituteCost.powerReduction}` を持つ protector があり、victim が trigger フィルタに合致（かつ victim≠protector＝「他の」）なら `{protectorNum, reduction}` を返す。
- **`execBanish` の `applyBanish` にフック:** `tgt.owner === 'opponent'`（＝相手効果で victim 側が場を離れる）かつ protector があれば、**victim を残し protector のパワーを -N**（temp_power_mods）してバニッシュを回避。「してもよい」は**自動適用**（pause/resume を伴わない決定論的近似。バトルコアの対話実装に手を入れないため最も安全）。protector 不在・自己効果（tgt.owner==='self'）では従来通り。
- **WX06-019 のデータ修正:** trigger filter が `story:'水獣'`（Dissona用フィールド）だったため `cardClass:'水獣'` に修正（manualEffects＋プリビルド JSON）。
- **近似/限界:** powerReduction 型のみ・自動適用・効果バニッシュ経路のみ（バウンス等は未対応）。犠牲型/コスト払い型の effect-banish 拡張は**バトル経路の実機検証が済むまで保留**（TODO の方針通り）。
- **検証:** `scripts/testBanishSubstitute.ts` 全10アサート通過（回帰なし）。typecheck 通過、verify 新規警告なし。

---

## F-3 コスト払い型 身代わりバニッシュを実装（既存 action.type BANISH_SUBSTITUTE・2枚）（v0.402, 2026-06-20）

**decompileEffects の Sheet1 全件検証で発見した「宣言だけで未実装の機構」を実装。** `action.type: 'BANISH_SUBSTITUTE'`（`substituteCost` 付き＝コストを払ってバニッシュを回避する型）はパーサーが生成・型も存在したが、エンジン/バトルにハンドラが無く**完全な no-op** だった。

- **`collectBanishSubstitutes` をオプション統一型に再設計:** 戻り値を `BanishSubstituteOption[]`（`kind:'sacrifice'` 別シグニを犠牲 ／ `kind:'pay_cost'` コスト払いで victim を残す）に変更し、犠牲型（v0.401 の STUB）とコスト型（既存 action）を1経路に統合。
- **WX10-033（Ｓ・Ｗ・Ｔ）:** 自身バニッシュ時、手札からスペル1枚捨てで回避（`discardSpell:1`）。trigger を `thisCardOnly` に外科パッチして「このシグニ限定」を表現（パーサーは任意シグニと区別できていなかった）。
- **WX11-029（Ｍ・Ｐ・Ｐ）:** 味方バニッシュ時、自身の下からスペル2枚トラッシュで回避（`trashStackSpell:2`）。
- **バトル統合:** v0.401 の再入 pause/resume をオプション対応に拡張。`pending_banish_substitute.options[]` ／ `banish_substitute_choice.option`。pay_cost 適用は victim を場に残しコストを支払う（手札スペル先頭から／下スタックのスペル先頭から自動選択）。UI は選択肢を「《X》を代わりにバニッシュ／手札スペルN枚捨てて回避／下スペルNトラッシュで回避／身代わりしない」で提示。CPU は pay_cost 優先＋弱い犠牲のみのヒューリスティック。
- **対象外:** `WX06-019`（シロナクジ）は「対戦相手の**効果によって場を離れる**」トリガー＋`powerReduction` 型＝バトル外の効果離場フックが要るため未対応（F-3 の効果バニッシュ経路と同じ積み残し）。
- **検証:** `scripts/testBanishSubstitute.ts` を犠牲型＋コスト型10アサートに拡張（discardSpell/trashStackSpell/thisCardOnly/コスト不足、全通過）。typecheck 通過、verify/eslint 新規警告なし。`decompileEffects` に `BANISH_SUBSTITUTE` 逆翻訳も追加。
- **反映:** types（index/effects）＋effectEngine（collectBanishSubstitutes 再設計）＋BattleScreen（decision/apply/UI/handler）＋プリビルド JSON（WX10-033 外科パッチ）。

---

## F-3 optional 身代わりバニッシュ 対話本実装（バトル経路・5枚）（v0.401, 2026-06-20）

**TODO F-3 を対話プロンプトで本実装（バトルバニッシュ経路）。** 旧は全7枚が `CONTINUOUS BANISH optional`＝`calcContinuousSigniMutations` 行397で自動適用されない no-op（＝「身代わりしない」という合法プレイで無害）。これに**「してもよい」の対話選択肢を追加**。

- **新機構 `BANISH_SUBSTITUTE`（CONTINUOUS STUB＋`StubAction.banishSubstitute`）:** victim（バトル防御シグニ＝opTopCardNum）の代わりに sacrifice をバニッシュする任意置換を宣言。2パターン: `self_sacrifice_other`（このシグニを守り、別クラスの他シグニを犠牲＝WX12-024電機/WXEX2-60ウェポン）／`protect_other_sacrifice_self`（victim を守り自身を犠牲＝WX20-055《ライズ》/CP01-032任意他/P10-052）。`oppTurnOnly` で相手ターン限定。
- **`collectBanishSubstitutes`（effectEngine・純関数）:** 防御側 state と victim から、有効な身代わりと犠牲候補を列挙。activeCondition／oppTurnOnly／クラス／《ライズアイコン》（EffectText に【ライズ】）を評価。
- **バトル統合（再入 pause/resume）:** `resolvePendingSigniBattleFor` の勝利バニッシュ分岐で victim 確定前に身代わりを判定。**人間防御=中断**（防御側 state に `pending_banish_substitute` を立てて return、攻撃側 `pending_signi_battle` は保持→決定で再入再開。ライフバースト/ガードと同じクロスクライアント方式）／**CPU防御=ヒューリスティック即決**（自己保護は最弱の他シグニを犠牲／味方保護は victim パワー≥身代わり元なら守る）。決定後はチェーン先頭で「victim を場に残し sacrifice をエナへバニッシュ（チャーム・アクセはトラッシュ）」を適用。CPUドライバ依存に `host_state.banish_substitute_choice` を追加（CPU攻撃・人間防御の再開用）。
- **状態:** `PlayerState.pending_banish_substitute`／`banish_substitute_choice`（ターン遷移リセットに追加）。UI=防御側に「《X》を代わりにバニッシュ／身代わりしない」プロンプト（`handleBanishSubstituteChoice`）。
- **対象5枚:** WX12-024 / WXEX2-60 / WX20-055 / WXDi-CP01-032 / WXDi-P10-052（P10-052 の「【出】で選んだシグニ」は SELECT_OTHER_SIGNI が選択を保存しないため「相手ターン中の他シグニ」で近似）。
- **検証:** `scripts/testBanishSubstitute.ts` で `collectBanishSubstitutes` を網羅検証（クラス絞り込み・ライズ判定・oppTurnOnly・victim=自身除外、全12アサート通過）。typecheck 通過、verify/checkAllEffects 新規警告なし、eslint 新規エラーなし。
- **既知の近似/積み残し:** ①**バトルバニッシュ経路のみ**（効果バニッシュ `execBanish`／バウンス等の場離れは未対応＝v0.393 と同じく execBanish 側フックが要る）。②**対話 pause/resume・CPU即決はヘッドレス検証不可**＝実機（PvP／CPU戦）での動作確認が必要。③`WX25-P1-056`（非バニッシュ離場→バニッシュ置換）と `WX17-075`（置換でない任意ON時バニッシュ）は別機構のため対象外。

---

## F-4 ゲート参照シグニ 近似精緻化3枚（P15-057／P16-054／P16-074）（v0.400, 2026-06-20）

TODO F-4 の「近似精緻化（任意・低優先）」3枚をすべて本実装。いずれも既存機構へ載せ、新規機構追加は collectBanishTriggers の condition/usageLimit 評価のみ。

- **WXDi-P15-057-E1b（LOVIT・相手ターン中シャドウ）:** 「同ゾーンゲートのかぎり、対戦相手のターンの間【シャドウ】を得る」を CONTINUOUS `GRANT_KEYWORD シャドウ self`＋activeCondition `AND[SAME_ZONE_HAS_GATE, TURN_OWNER opponent]` で本実装（旧＝近似省略）。execUtils のシャドウ保護フィルタの `hasCondShadow`（activeCondition 付き self シャドウを `checkActiveCondition` 評価）に既に対応経路があり追加配線不要。
- **WXDi-P16-054-E1b（アキノ・相手効果バニッシュ耐性）:** 「相手ターン中、相手効果でバニッシュされない」を CONTINUOUS `GRANT_PROTECTION{target:self, from:['BANISH'], sourceOwner:opponent}`＋同 activeCondition で本実装（旧＝近似省略）。`collectBanishEffectProtectedSigni` が activeCondition 評価込みで保護判定。
- **WXDi-P16-074-E2（ナナシ・被バニッシュ時に相手ディスカード）:** 「《ターン1回》同ゾーンゲートのあなたのシグニ1体がバニッシュされたとき、相手は手札1枚捨てる」を AUTO `ON_BANISH`／`triggerScope:any_ally`／`usageLimit:once_per_turn`／condition `FIELD_HAS_GATE owner:self` で本実装（旧＝scope self・条件/回数なしの過少発火）。**`collectBanishTriggers` のフィールドトリガー収集（section2/3）に `eff.condition`（`evalUseCondition`）と `usageLimit once_per_turn`（actions_done 照合）の評価を新設**。ON_BANISH の any_ally/any 効果は実装全体で既存ゼロのため既存挙動への影響なし。**近似:** 「同ゾーンゲート」（被バニッシュシグニの離場後ゾーン参照が必要）は「場にゲートがある」で近似。自己被バニッシュ（section1=scope self 限定）は any_ally 収集の対象外。
- **検証:** `scripts/testGateContinuous.ts` を新設しヘッドレス検証（P16-054 耐性＝相手ターン＋ゲートのみ／P15-057 シャドウ＝相手ターン＋ゲートのみ、各3条件）。全テスト通過。typecheck 通過、verifyEffects/checkAllEffects に新規警告なし。
- **反映:** manualEffects＋BattleScreen（collectBanishTriggers 拡張）＋プリビルド JSON（外科パッチ）。
- **これで F-4（THE DOOR ゲート参照シグニ）の積み残しは完全に解消**（残るは P15-058 ピース使用条件等の使用条件近似のみ）。

---

## F-4 場全体への継続シャドウ付与＋WXDi-P15-058-E1 本実装（v0.399, 2026-06-20）

- **新 CONTINUOUS 宣言アクション `GRANT_FIELD_SHADOW`:** 「フィルタに合う場のシグニ全員へ【シャドウ（X）】を継続付与」を表現。`keyword`（符号化済みシャドウキーワード）＋`filter`（例 `inGateZone`）＋`targetOwner`（現状 self のみ）。`calcContinuousSigniMutations` は BANISH/FREEZE/DOWN 以外を実行しないため CONTINUOUS としては安全（executor 到達時も default no-op）。
- **`getFieldGrantedShadowScopes`（keywords.ts 新設）:** 保護対象シグニ `n` が、同じ場の他カードの `GRANT_FIELD_SHADOW` 宣言で得るシャドウスコープを集める。`getShadowScopes` が各カード自身の effects しか読まない弱点を補完する経路。フィルタは `inGateZone`（own_gate_zones）を判定。
- **配線:** シャドウ保護の唯一の経路 `execUtils.selectOrInteract`（`scope === 'opp_field'`）に `getFieldGrantedShadowScopes`＋`evaluateShadowScope` を追加。これで場全体付与シャドウも対象除外に効く。
- **WXDi-P15-058-E1（羅星姫 コスチュム）:** 「同じシグニゾーンに【ゲート】があるあなたのシグニは【シャドウ（スペル）】を得る」を `GRANT_FIELD_SHADOW{keyword:シャドウ(スペル), filter:inGateZone, targetOwner:self}` で本実装（旧＝無害な STUB UNIMPL_GRANTED_ABILITY マーカー）。own_gate_zones のゾーンの自シグニが相手スペル効果の対象から外れる。
- **検証:** `scripts/testFieldShadow.ts` を新設しヘッドレス検証（ゲートゾーンのシグニのみスペルから保護／ゲートなしゾーン・シグニ効果・ゲート未設置では非保護）。全テスト通過。typecheck 通過、verifyEffects/checkAllEffects に新規警告なし。
- **反映:** types/effects（GrantFieldShadowAction）＋keywords（getFieldGrantedShadowScopes）＋execUtils（保護フィルタ配線）＋manualEffects＋プリビルド JSON（外科パッチ）。
- **これで F-4 ゲート参照シグニの本実装はすべて完了**（残る積み残しは P16-074-E2／P16-054-E1／P15-057-E1 の近似精緻化＝低優先のみ）。

---

## F-4 self対象 REMOVE_ABILITIES の thisCardOnly 対応＋WXDi-P15-056-E1 本実装（v0.398, 2026-06-20）

- **`execRemoveAbilities` に `thisCardOnly` フィルタ対応を追加**（frontOfSelf と同型）。「このシグニは能力を失う」を効果元自身のみに限定。
- **WXDi-P15-056-E1（Lスピーカ）:** 無害化マーカー（UNIMPL_GRANTED_ABILITY）から本実装へ。condition `SAME_ZONE_HAS_GATE` の AUTO ON_ATTACK_SIGNI＋`SEQUENCE[OPTIONAL_COST(白白), CONDITIONAL(PAID){REMOVE_ABILITIES self thisCardOnly UNTIL_END_OF_TURN}]`。「LIONがいれば」「このシグニをアップ（再攻撃）」は近似省略。
- **反映:** effectExecutor（execRemoveAbilities）＋manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。
- **残るF-4は WXDi-P15-058-E1（場全体【シャドウ（スペル）】＝getShadowScopes 拡張）のみ。**

---

## F-4 THE DOOR ピース ひらけ！ゲート！（WXDi-P15-003）（v0.397, 2026-06-20）

- **ピースのゲート設置を配線。** ピースは `executeKeyPiece` が `queueCardEffects(['AUTO'],['ON_PLAY'])` で発火させるため、旧 ACTIVATED パースでは発火しなかった。
- **E1=AUTO ON_PLAY → STUB `PLACE_OWN_GATE`**（プレイ時に自シグニゾーンへ【ゲート】設置）。
- **E2=CONTINUOUS `GRANT_LRIG_ABILITY`**（key_piece に残る間センタールリグへ付与＝`collectLrigGrantedEffects` がキーピースを走査）。付与能力＝`【起】エクシード4：【シグニバリア】1つ（STUB GAIN_SIGNI_BARRIER）`／`【起】エクシード4：カード4枚引く（DRAW 4）`。グロウしても key_piece の継続付与なので維持。
- 【使用条件】ドリームチーム3色以上はピース使用条件のため近似省略。
- **これで THE DOOR のゲート設置手段（ピース＋防衛者ルリグ WXDi-P15-010/011 の【起】）と参照シグニ15枚が揃い、アーキタイプが実用レベルで機能する。**
- **反映:** manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチG・WXDi-P15-058＝ゲート参照シグニ完了）（v0.396, 2026-06-20）

- **WXDi-P15-058（コスチュム・宇宙）:** E1=「同ゾーンゲートのあなたのシグニは【シャドウ（スペル）】を得る」→ 場全体への継続シャドウ付与は `getShadowScopes` が他カードの継続 GRANT_KEYWORD を読まないため未実装。無害な STUB `UNIMPL_GRANTED_ABILITY` に置換。E2=「同ゾーンゲートで『APS開始時、《プロフェッサー　防衛者Ｄｒ．タマゴ》がいれば相手シグニ1体に《青》《青》払ってデッキ下』を得る」→ condition `AND[SAME_ZONE_HAS_GATE, LRIG_NAME_CONTAINS self 'タマゴ']`＋`SEQUENCE[OPTIONAL_COST(青青), CONDITIONAL(PAID){TRANSFER_TO_DECK opp1 bottom}]`（タマゴはセンタールリグ名で近似）。
- **これで防衛派 THE DOOR ゲート参照シグニ（15枚）はすべて実装/近似済み**（P15-056-E1・P15-058-E1 は無害化マーカー、P16-074-E2・P16-054-E1 等は近似）。残るF-4はピース `ひらけ！ゲート！`（WXDi-P15-003）のみ。
- **反映:** manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチF・WXDi-P16-059＋GRANT_KEYWORD UNTIL_OPP_TURN_END 修正）（v0.395, 2026-06-20）

- **`execGrantKeyword` のUNTIL_OPP_TURN_END振り分けバグ修正:** 従来は duration によらず `keyword_grants` へ付与していたが、`keyword_grants` は**付与者のターン終了時にクリア**されるため、ターン終了時に付与する `UNTIL_OPP_TURN_END` キーワードが即消えていた。`a.duration === 'UNTIL_OPP_TURN_END'` のとき `keyword_grants_until_opp_turn`（付与者の次ターン開始時クリア＝相手ターンを跨ぐ）へ振り分けるよう修正（シャドウ等の読み取り側は既に両ストアを参照）。
- **WXDi-P16-059（デウス・アーム）:** E1=「同ゾーンゲートで『相手は追加で《無》払わないとガードできない』を得る」→ CONTINUOUS STUB `OPP_GUARD_COST_COLORLESS` に activeCondition `SAME_ZONE_HAS_GATE`（既存ガード税機構 `collectOppGuardExtraColorlessCost` が activeCondition 対応）。E2=「ターン終了時、場ゲートで自シグニ1体に次の相手ターン終了時まで【シャドウ（レベル2以下）】」→ AUTO ON_TURN_END＋condition `FIELD_HAS_GATE`＋GRANT_KEYWORD（`シャドウ:{"levelLte":2}`・UNTIL_OPP_TURN_END）。
- **反映:** effectExecutor（execGrantKeyword 修正）＋manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。
- **残（F-4ゲート参照）:** WXDi-P15-058 のみ（E1=同ゾーンゲートのシグニへ【シャドウ（スペル）】の場全体付与＝`getShadowScopes` の継続付与対応が要る／E2=タマゴ条件＋任意BBでデッキ下）。

---

## F-4 THE DOOR ゲート参照シグニ（バッチE・POWER_MODIFY_PER_HAND_COUNT 新設＋3枚）（v0.394, 2026-06-20）

- **新アクション `POWER_MODIFY_PER_HAND_COUNT`:** 手札N枚につきパワー±M（AUTO実行・スナップショット）。`until: 'UNTIL_OPP_TURN_END'` で `power_mods_until_opp_turn` へ、省略時は `temp_power_mods`。`execPowerModifyPerLifeCount` と同型。
- **WXDi-P16-070（アイン＝サンガ・毒牙）:** E1=同ゾーンゲートで「ターン終了時、相手シグニ1体をデッキ下」→ condition `SAME_ZONE_HAS_GATE` の ON_TURN_END AUTO＋TRANSFER_TO_DECK。E2=「ターン終了時、場ゲートで自シグニ1体に次の相手ターン終了時まで手札1枚につき+1000」→ condition `FIELD_HAS_GATE`＋`POWER_MODIFY_PER_HAND_COUNT`（旧＝STUB GATE 誤パース＝相手ゲート設置の有害動作を解消）。
- **WXDi-P15-056（Lスピーカ・電機）:** E1=「同ゾーンゲートで攻撃時にLION＋WWでアップ＋能力喪失」→ 自己アップ＋thisCardOnly能力喪失が未表現のため**無害な STUB UNIMPL_GRANTED_ABILITY に置換**（旧＝CONTINUOUS REMOVE_ABILITIES self＝自分の能力を消す有害誤りを解消）。E2=「APS開始時、次の相手ターン終了時まで同ゾーンゲートの自シグニ全体+2000」→ ON_ATTACK_PHASE_START AUTO＋POWER_MODIFY self ALL に `inGateZone` フィルタ＋`duration: UNTIL_OPP_TURN_END`。
- **WXDi-P16-054（アキノ・水獣）:** E1=「同ゾーンゲートで相手ターン中+5000＆相手効果でバニッシュ耐性」→ CONTINUOUS POWER_MODIFY self +5000 に activeCondition `AND[TURN_OWNER opponent, SAME_ZONE_HAS_GATE]`（バニッシュ耐性は近似省略）。E2=「アタック時、場ゲートで CHOOSE（相手5000以下バウンス／ドロー2）」→ ON_ATTACK_SIGNI CHOOSE に condition `FIELD_HAS_GATE`（攻撃側自身の ON_ATTACK_SIGNI 収集は eff.condition を評価する＝6277行）。
- **反映:** types/effects＋effectExecutor（新executor＋switch）＋manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 身代わり置換型2枚（WXDi-P06-034 / WXK05-024）（v0.393, 2026-06-20）

- **対象＝TODO F-2 残り最後の2枚（身代わり置換型）。** いずれも旧パースは CONTINUOUS TRASH（`calcContinuousSigniMutations` が BANISH/FREEZE/DOWN 以外を実行しないため**無害な no-op**）。バトルバニッシュ経路の既存置換チェーン（`BATTLE_LEAVE_REPLACE_WITH_DOWN`/`COOKING_BANISH_SUBSTITUTE`/`RISE_BANISH_SUBSTITUTE` 等）に倣って配線。
- **新フィルタ `TargetFilter.centerZoneOnly`（状態ベース）:** 中央のシグニゾーン（index 1）のシグニのみ。`fieldCandidates`／`matchesStateFilter` に追加。
- **WXDi-P06-034（クーフーリン・ライズ）:** E1=「バニッシュされる場合、代わりにアップ状態のこのシグニをダウンし下から1枚＋エナから1枚をトラッシュ」→ CONTINUOUS STUB `BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY`。`resolvePendingSigniBattleFor` の置換チェーンに `leaveReplaceDownTUE` 分岐を追加（UP かつ 下カード≥1 かつ エナ≥1 で自動適用＝ダウン＋下1枚/エナ1枚トラッシュして場に残る）。E2=「中央ゾーンのシグニのパワー+3000」→ CONTINUOUS POWER_MODIFY self ALL に `centerZoneOnly`。
- **WXK05-024（アナスタシア・悪魔）:** E1=「＜悪魔＞は場から手札に戻らない」→ `SIGNI_CANT_BOUNCE_FROM_FIELD`（実装済・維持）。E2=「場を離れる場合、代わりに除外」→ CONTINUOUS STUB `BATTLE_LEAVE_REPLACE_WITH_EXILE`。バトルバニッシュ時にエナでなくトラッシュへ送る（除外を**トラッシュで近似**＝既存 `REMOVE_SELF_SIGNI_FROM_GAME` と同じ方針）。`defenderLeaveExile` フラグを通常バニッシュ先計算に追加。E3（トラッシュ発動の【起】）はトラッシュ発動機構が要るためパーサー生成を維持。
- **近似（共通）:** いずれも**バトルバニッシュ経路のみ**対応。効果バニッシュ（`execBanish`）・バウンス等の場離れは未対応（execBanish 側に置換フックがないため。F-3 同様の専用設計が要る）。
- **反映:** types/effects＋execUtils＋effectEngine（centerZoneOnly）＋execStubPart3（STUB no-op登録）＋BattleScreen（置換チェーン2分岐）＋manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチD・WXDi-P15-057）（v0.392, 2026-06-20）

- **WXDi-P15-057（LOVIT・地獣）:** E1=「同ゾーンゲートでパワー+3000＋相手ターン中シャドウ」→ CONTINUOUS POWER_MODIFY self +3000 に activeCondition `SAME_ZONE_HAS_GATE`（シャドウ付与は近似省略・旧＝常時+3000）。E2=「ターン終了時、場ゲートでトラッシュの《ガードアイコン》シグニを《無》払えば手札へ」→ AUTO ON_TURN_END、condition `FIELD_HAS_GATE`、`SEQUENCE[OPTIONAL_COST(無), CONDITIONAL(PAID){TRANSFER_TO_HAND from TRASH_CARD hasGuard}]`（旧＝GRANT_KEYWORD 誤り）。
- **反映:** manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチC・inGateZone フィルタ＋WXDi-P16-062）（v0.391, 2026-06-20）

- **新フィルタ `TargetFilter.inGateZone`（状態ベース）:** 「このシグニと同じシグニゾーンに【ゲート】がある」＝own_gate_zones にゾーンが含まれる。`fieldCandidates`（AUTO 実行）と `matchesStateFilter`（CONTINUOUS パワー）の両方に判定を追加。「同ゾーンゲートのあなたのシグニ」への場全体付与に再利用可能。
- **WXDi-P16-062（マキナ・乗機）:** E1=「同ゾーンゲートで『各APS開始時、相手シグニ1体を相手が《無》払わないと能力消去』を得る」→ **近似**：CONTINUOUS REMOVE_ABILITIES opponent（対面）に activeCondition `SAME_ZONE_HAS_GATE` 付与（旧＝無条件のフリーロック誤り。`collectContinuousAbilitiesRemovedSigni` の opponent 分岐＋`checkActiveCondition` が source の own_gate_zones を見て発火。相手の《無》回避・APS再付与は近似省略）。E2=「同ゾーンゲートのあなたのシグニのパワー+2000」→ CONTINUOUS POWER_MODIFY self ALL に `inGateZone` フィルタ。
- **反映:** types/effects＋execUtils（fieldCandidates）＋effectEngine（matchesStateFilter）＋manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチB・2枚）（v0.390, 2026-06-20）

- **WXDi-P15-059（ノヴァ）:** E1=APS開始時、場ゲートでドロー2・手札1捨て→ condition `FIELD_HAS_GATE` 付与（旧は条件欠落）。E2=アタック時、相手1捨て＋同ゾーンゲートで追加1捨て→ `SEQUENCE[TRASH opp hand1, CONDITIONAL(SAME_ZONE_HAS_GATE){TRASH opp hand1}]`（旧は2枚とも無条件）。`execConditional` は `evalCondition` を `ctx.sourceCardNum` 文脈で評価するため SAME_ZONE_HAS_GATE が攻撃シグニのゾーンで正しく判定される。
- **WXDi-P16-074（ナナシ・古代兵器）:** E1=同ゾーンゲートで「APS開始時、相手シグニ1体に《無》払えば-5000」を得る→ condition `SAME_ZONE_HAS_GATE`＋`SEQUENCE[OPTIONAL_COST(無), CONDITIONAL(PAID_ADDITIONAL_COST){POWER_MODIFY opp -5000}]`（旧＝CONTINUOUS 常時誤り）。E2（ON_BANISH→相手捨て）はゲートゾーン条件・ターン1回を近似省略しパーサー生成を維持。
- **反映:** manualEffects＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチA・4枚）（v0.389, 2026-06-20）

- **対象＝TODO F-4。** v0.388 の自ゲート基盤（`own_gate_zones`/`SAME_ZONE_HAS_GATE`/`FIELD_HAS_GATE`）の上で防衛派 THE DOOR シグニを実装。いずれも旧パースは CONTINUOUS化等で no-op だったものを修正。
- **WXDi-P15-080（ヒラナ）:** E1=「同ゾーンゲートで『【自】APS開始時、相手シグニ1体を-3000』を得る」→ condition `SAME_ZONE_HAS_GATE` 付き `ON_ATTACK_PHASE_START` AUTO（POWER_MODIFY opponent -3000・ターン終了時まで）。旧＝CONTINUOUS POWER_MODIFY 常時誤り。
- **WXDi-P15-081（レイ）:** E1=同ゾーンゲートで「APS開始時ドロー1」→ condition 付き AUTO。E2=【出】場ゲートでデッキ上3枚スクライ→ `CONDITIONAL(FIELD_HAS_GATE){LOOK_AND_REORDER}`。BURST 維持。
- **WXDi-P15-077（エクス）:** E1=同ゾーンゲートでパワー+10000 → CONTINUOUS POWER_MODIFY self に activeCondition `SAME_ZONE_HAS_GATE`。E2（【出】look5）・BURST 維持。
- **WXDi-P15-078（WOLF）:** E1=同ゾーンゲートで「APS開始時エナチャージ1」→ condition 付き AUTO。E2=APS開始時、場ゲートで相手シグニ1体のバトルバニッシュをエナでなくトラッシュへ→ 旧 count:ALL・条件欠落を condition `FIELD_HAS_GATE`＋count1 に修正。
- **反映:** manualEffects＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 THE DOOR 自ゲート機構を新設（WXDi-P15-076/082）（v0.388, 2026-06-20）

- **対象＝TODO F-2 残り「ゲート条件（自ゲート未モデリング）」WXDi-P15-076 / WXDi-P15-082。** THE DOOR の【ゲート】は**自分のシグニゾーンに置くマーカー**で、既存 `signi_gate_zones`（相手ゾーンに設置するアタック妨害ゲート）とは**別概念**だったため、自ゲート機構を新設。THE DOOR アーキタイプ（P15/P16 で40枚超）全体の基盤になる。
- **状態:** `PlayerState.own_gate_zones?: number[]`（【ゲート】がある自分のシグニゾーン番号。ゾーンのシグニが離れてもゲートは残る＝ルール通り）。
- **条件（新設）:** ActiveCondition／Condition の両方に `SAME_ZONE_HAS_GATE`（効果元シグニと同じゾーンにゲート）と `FIELD_HAS_GATE{owner}`（指定プレイヤーの場にゲートあり）を追加。`checkActiveCondition`（CONTINUOUS パワー修正用）と `evalCondition`／`evalUseCondition`（AUTO の condition 用）で評価。
- **ターゲットフィルタ（新設）:** `TargetFilter.frontOfGateZone`（【ゲート】がある自シグニゾーンの正面の相手シグニ＝各 zi に対し相手ゾーン 2-zi）。`execTransferToDeck` の SIGNI 分岐で解決（frontOfSelf と同型）。
- **配置（STUB 新設＋バグ修正）:** `PLACE_OWN_GATE`（自シグニゾーン選択 CHOOSE）＋`INTERNAL_SET_OWN_GATE`（own_gate_zones へ追加）を `execStubPart3` に新設。**防衛者ルリグ WXDi-P15-010-E3／WXDi-P15-011-E3** の「あなたのシグニゾーンに【ゲート】を置く」は旧パースで**相手ゲートの STUB `GATE` に誤マッピング**されていた（THE DOOR防衛者なのに相手ゾーンに設置するバグ）ため `PLACE_OWN_GATE` に修正＝配置カードの配線とバグ修正を兼ねる。
- **WXDi-P15-076（ムジカ）:** E1=「同じゾーンにゲートあるかぎり『【自】ターン終了時、相手シグニ1体トラッシュ』を得る」→ condition `SAME_ZONE_HAS_GATE` 付き `ON_TURN_END` AUTO。E2=「場にゲートあるかぎりパワー+5000」→ CONTINUOUS POWER_MODIFY self に activeCondition `FIELD_HAS_GATE` 付与。
- **WXDi-P15-082（バン）:** E1=「同じゾーンにゲートあるかぎり『【自】APS開始時、相手は手札1枚捨てる』を得る」→ condition 付き `ON_ATTACK_PHASE_START` AUTO（相手捨て＝`TRASH HAND_CARD opponent`＝opponentResponds で相手が選ぶ）。E2=「ターン終了時、ゲートがある自ゾーンの正面の相手シグニ1体をデッキの一番下に置く」→ `ON_TURN_END` AUTO＋`TRANSFER_TO_DECK{position:bottom,shuffle:false}` source SIGNI opponent filter `frontOfGateZone`。
- **UI:** `StackedSigniSlot` に `hasGate` プロップを追加し、ゲートのあるゾーン（シグニ有無問わず）に「🚪GATE」バッジを表示。`PlayerField` が `state.own_gate_zones` から各ゾーンへ渡す。
- **反映:** types（index/effects）＋effectEngine＋execUtils＋effectExecutor＋execStubPart3＋manualEffects＋プリビルド JSON（外科パッチ）＋BoardComponents。typecheck 通過、verifyEffects 新規警告なし。
- **残（THE DOOR）:** ピース `ひらけ！ゲート！`（WXDi-P15-003）はゲート設置＋ルリグ能力付与の複合で未配線（GRANT_LRIG_ABILITY のみ生成・gate 設置欠落）。他の THE DOOR シグニ（〜40枚）は本基盤の上に個別実装可能。

---

## F-2 相手場への付与の実装（WXDi-P10-072・CPUターンAPS収集を配線）（v0.387, 2026-06-20）

- **対象＝TODO F-2 残り「相手場への付与（機構は v0.377 で用意済・未配線）」WXDi-P10-072。** 旧パース＝CONTINUOUS TRASH SIGNI opponent（no-op）。
- **正体:** 「【常】：対戦相手のシグニは『【自】：あなたのアタックフェイズ開始時、あなたのデッキの一番上のカードをトラッシュに置く。』を得る。」＝対戦相手の場のシグニ全員へ「自分のアタックフェイズ開始時に自己ミル1」する【自】を付与。
- **manualEffects:** E1 を `CONTINUOUS GRANT_FIELD_SIGNI_ABILITY{targetOwner:'opponent', filter:シグニ}`＋付与能力 `AUTO ON_ATTACK_PHASE_START / triggerScope:self / MILL{owner:'self',count:1}` に修正（`targetOwner` 対応は v0.377 で実装済。付与先＝対戦相手の視点で「あなた」＝そのシグニのコントローラー＝`owner:'self'` がコントローラーのデッキに解決される）。BURST はパーサー生成を維持。
- **配線（CPUターンの未収集を解消）:** 人間ターン側は `doPhaseAdvance` の `collectTurnTriggers('ON_ATTACK_PHASE_START')`（MAIN→ATTACK_ARTS 移行）で既に拾える（effectsMap は付与合成済みのため P10-072 を CPU が持ち人間シグニへ付与した場合も自動発火）。**CPUターン側は MAIN→ATTACK_ARTS 移行で APS トリガーを収集していなかった**ため、`cpuTurnAction` の MAIN ブロック末尾（HASTARLIQ／ATTACK_ARTS 遷移と統合）に CPU自身の場シグニの self scope `ON_ATTACK_PHASE_START` AUTO（condition 評価込み）を収集する処理を追加。HASTARLIQ と同一スタックに集約し `turn_phase: ATTACK_ARTS` へ進めながら積む（MAIN に留まると再実行で無限収集になるため）。これは汎用修正で、付与能力に限らず CPU 自身のネイティブ `ON_ATTACK_PHASE_START` 能力も発火するようになる。
- **反映:** `manualEffects.ts`＋プリビルド JSON（外科パッチ）＋`BattleScreen.tsx`。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 シグニ犠牲コスト型の実装（バッチ10・WXK10-039）（v0.386, 2026-06-20）

- **対象＝TODO F-2「シグニ犠牲コスト型」。** 「他の＜原子＞2体をトラッシュしないかぎり自己トラッシュ」を CHOOSE で実装。
- **`execTrash` の SIGNI 分岐に `excludeSelf` 対応を追加＋`TargetFilter.excludeSelf` を新設:** 「あなたの他の＜原子＞のシグニ」を効果元自身を除いた候補に限定（thisCardOnly と対をなす）。
- **WXK10-039（ＣＨ４）:** E1「【出】：他の＜原子＞2体をトラッシュしないかぎり、このシグニをトラッシュ」を `ON_PLAY`→`CHOOSE`（「他の原子2体をトラッシュ」＝`FIELD_CLASS_COUNT(原子)≥3` でのみ選択可／「このシグニを自己トラッシュ」＝thisCardOnly）で実装。他の原子が2体未満なら自己トラッシュのみ選択可。【アサシン】は静的キーワードで自動判定。
- **反映:** `manualEffects.ts`＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 自己犠牲コスト型の実装（バッチ9・WXDi-P04-040）（v0.385, 2026-06-20）

- **対象＝TODO F-2「別形の誤解析」のうち自己犠牲（pay-or-sacrifice）型1枚。** 引用付与型とは別の誤フラット化（CONTINUOUS TRASH self）。
- **`execTrash` の SIGNI 分岐に `thisCardOnly` 対応を追加:** 「このシグニを場からトラッシュに置く」を効果元自身のみへ限定（従来 execBanish のみ対応。`fieldCandidates` 後に `ctx.sourceCardNum` で絞り込み）。
- **WXDi-P04-040（イバラキドウジ）:** E1「【自】アタックフェイズ開始時、《無×3》を支払わないかぎり、このシグニを場からトラッシュに置く」を `ON_ATTACK_PHASE_START`→`SEQUENCE[OPTIONAL_COST(無×3), CONDITIONAL(PAID_ADDITIONAL_COST){then:noop, else:このシグニを自己トラッシュ}]` で実装（既存の OPTIONAL_COST 直後 CONDITIONAL ＝pay→then/skip→else パターンに乗る）。【ランサー】は静的キーワードのためテキストから自動判定。
- **反映:** `manualEffects.ts`＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ8・ダメージ時 timing 新設 WX21-054）（v0.384, 2026-06-20）

- **対象＝TODO F-2「専用 timing 欠如（ダメージ時）」。** 「このシグニが対戦相手にダメージを与えたとき」に相当する timing が無かったため新設。
- **`ON_SIGNI_DAMAGE` timing を新設:** 「正面が空き（またはアサシン）で相手ライフをクラッシュした＝ダメージを与えたとき」。`resolvePendingSigniBattleFor`（シグニアタック解決）のライフクラッシュ分岐で `dealtSigniDamage` を立て、Phase 2 のトリガー収集で攻撃側シグニ自身の `ON_SIGNI_DAMAGE` AUTO を `eff.condition` 評価込みで収集し `allTriggers` に追加。ルリグアタック・追加ゾーンバニッシュでは発火しない（シグニのライフクラッシュのみ）。
- **WX21-054（ディノス）:** E1 を `ON_SIGNI_DAMAGE`＋`condition: ENERGY_COUNT(opponent,gte,5)`→相手エナ1枚トラッシュ に修正。E2（手札公開 or 自己トラッシュ）と BURST はパーサー生成を維持。
- **近似:** WXDi-P05-069 のフリップアタック経路（別ハンドラ）でのライフクラッシュは未収集（通常アタックでは発火）。
- **反映:** `manualEffects.ts`＋プリビルド JSON（E1 のみ外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ7・WXK04-048 自己付与＋アクセ付与）（v0.383, 2026-06-20）

- **対象＝TODO F-2「アクセ付与併用＋任意コスト」。** 2能力とも CONTINUOUS TRASH に誤フラット化されていたものを実装。
- **`THIS_CARD_IS_ACCED` 条件を新設（`evalCondition`）:** 「このシグニに【アクセ】が付いているかぎり」。`sourceCardNum` のゾーンの `signi_acce` で判定（ActiveCondition `IS_SELF_ACCED` の Condition 版）。
- **WXK04-048（アイスケーキ）:**
  - E1: アクセ付き条件付き AUTO `ON_ATTACK_SIGNI`。任意《青》コストは既存パターン `SEQUENCE[STUB OPTIONAL_COST(costColors:['青']), CONDITIONAL(PAID_ADDITIONAL_COST)→相手手札1枚捨て]` で表現。
  - E2: `GRANT_ACCE_HOST_ABILITY{filter: レベル3以上}`→ホストシグニへ `ON_ATTACK_SIGNI`→相手手札1枚捨てを付与（既存 `collectGrantedFromAcce` 経由）。
  - BURST はパーサー生成を維持。
- **反映:** `manualEffects.ts`＋プリビルド JSON（E1/E2 外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ6・全領域LIFE_BURST付与 WX17-036）（v0.382, 2026-06-20）

- **対象＝TODO F-2「全領域 LIFE_BURST 付与」。** 「あなたのすべての領域にある＜怪異＞のシグニであるカードは【ライフバースト】『…』を持つ」を、既存の `GRANT_ALL_ZONE_LIFEBURST`（WD14-001 用）機構を**フィルタ＋付与アクション対応**に拡張して実装。
- **機構拡張（`StubAction` に2フィールド追加）:** `burstFilter?: TargetFilter`（付与対象の絞り込み。省略時＝全カード＝WD14-001）／`burstAction?: EffectAction`（付与する【ライフバースト】のアクション。省略時＝相手シグニ1体バニッシュ＝WD14-001）。**WD14-001 は両方とも省略のため挙動完全不変。**
- **BattleScreen の付与バースト判定をフィルタ対応に:** `controlsAllZoneBurstGrant(boolean)` を `getAllZoneBurstGrant(→STUB|null)`＋`matchesAllZoneBurstGrant(cardNum,state)` に置換。クラッシュされたカードが `burstFilter` に一致する場合のみ付与バーストを有効化。`grantedBurstEntry` は `grant.burstAction` を使用（無ければ既定 BANISH）。`effectiveHasBurst`／二重クラッシュ UI／付与バースト追加（8313 付近）の3経路を更新。
- **WX17-036（ブラウニー）:** E1 を CONTINUOUS `STUB GRANT_ALL_ZONE_LIFEBURST`＋`burstFilter:{シグニ,怪異}`＋`burstAction: TRASH 相手シグニ1体` に修正。WX17-036 が場にある間、自分の全領域（手札/デッキ/トラッシュ/ライフ）の＜怪異＞シグニがライフクラッシュ時にこのバーストを使える。
- **反映:** `manualEffects.ts`＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ5・ルリグ付与 WXDi-P05-032）（v0.381, 2026-06-20）

- **対象＝TODO F-2「ルリグへの付与」。** 「あなたのセンタールリグは『【自】…』を得る」型を、既存 `GRANT_LRIG_ABILITY`（CONTINUOUS 宣言→`collectLrigGrantedEffects` がセンタールリグへ付与）で実装。
- **配線追加（BattleScreen `performLrigAttack`）:** ON_ATTACK_LRIG 収集が `effectsMap.get(lrigNum)`／`lrig_granted_auto_effects`／コピー能力のみで、**CONTINUOUS GRANT_LRIG_ABILITY 由来（`collectLrigGrantedEffects`）の ON_ATTACK_LRIG が漏れていた**。`collectLrigGrantedEffects(my, op, …)` の ON_ATTACK_LRIG 分を `onAttackEffects` に追加。
- **WXDi-P05-032（ゲイヴォルグ）:** E1 を CONTINUOUS `GRANT_LRIG_ABILITY`（付与＝`ON_ATTACK_LRIG`＋`once_per_turn`→相手シグニ1体トラッシュ）に修正。E2（アタックフェイズ開始時に白シグニダウン→ドロー）はパーサー生成を維持。付与 AUTO は活性化 UI（`grantedActionsMA`＝ACTIVATED 限定）には出ない。
- **反映:** `manualEffects.ts`＋プリビルド JSON（E1 のみ外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ4・WXDi-P02-068＋ON_SIGNI_BATTLE 条件評価）（v0.380, 2026-06-20）

- **ON_SIGNI_BATTLE 収集に condition 評価を追加:** `collectBattleTrig`（BattleScreen）が `eff.condition` を無視していたため、`evalUseCondition` による発動条件評価を追加（攻撃側=`newMyState`／防御側=`newOpState` を基準）。他の AUTO 収集経路（ON_ATTACK_SIGNI／collectTurnTriggers）と整合。既存の ON_SIGNI_BATTLE カード（condition なし）には影響なし。
- **WXDi-P02-068（ヒジカタ）:** E2「【常】このターンに手札を２枚以上捨てていたかぎり、『【自】バトルによって相手シグニをバニッシュしたとき、相手手札を見ないで１枚捨てさせる』を得る」を、`ON_SIGNI_BATTLE`＋`condition: TURN_HAND_DISCARD_GTE(2)`→`TRASH HAND opponent blind` に修正。「バトルによってバニッシュした」勝利限定はバッチ2と同じくバトル成立時で近似。E1（手札1枚以上捨て→+3000、条件欠落は別の軽微な未対応）はパーサー生成を維持。
- **反映:** `manualEffects.ts`＋プリビルド JSON（E2 のみ外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ3・上シグニ付与 WXDi-P15-060／P15-064）（v0.379, 2026-06-20）

- **対象＝TODO F-2「上シグニ付与」。** 「このカードの上にある＜解放派＞のシグニは『【自】…』を得る」型を、既存 `GRANT_SIGNI_ABOVE_ABILITY`（`collectGrantedFromUnderSigni` Pattern B が下カードから上シグニへ付与し augMap へ合成）で実装。新規機構なし。
- **WXDi-P15-060（遊月//THE DOOR）:** E2 を `GRANT_SIGNI_ABOVE_ABILITY{filter:解放派}`→付与能力 `ON_ATTACK_PHASE_START`→相手エナの「相手センターと共通しない色」1枚トラッシュ（`colorNotMatchesLrig`、バッチ2と同じく対象オーナー基準で解決）。E1（下にカードがあるかぎり+4000）・BURST はパーサー生成を維持。
- **WXDi-P15-064（アロス・ピルルク//THE DOOR）:** E2 を `GRANT_SIGNI_ABOVE_ABILITY{filter:解放派}`→付与能力 `ON_ATTACK_PHASE_START`→`SEQUENCE[手札1枚捨て, CONDITIONAL(IS_MY_TURN)→相手手札を見ないで1枚捨てさせる(blind)]`。「捨ててもよい」の任意性は同カード E1 の生成パターンに合わせ近似。E1（自身の同型能力）・BURST は維持。
- **反映:** `manualEffects.ts`＋プリビルド JSON（E2 のみ外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ2・WX12-018／WXDi-P09-058）（v0.378, 2026-06-20）

- **対象＝TODO F-2 の続き。** バッチ1（v0.377）の方針（「〜であるかぎり『【自】…』を得る」＝condition 付き AUTO トリガー）を踏襲し、汎用条件を足して2枚を追加実装。
- **汎用条件を2つ新設（`evalCondition`/execUtils）:**
  - `LRIG_TRASH_COUNT { cardType?, operator, value }` — ルリグトラッシュの（cardType 一致）枚数。「ルリグトラッシュにアーツが4枚以上」等。
  - `FIELD_CLASS_COUNT { owner, story, operator, value }` — 場のシグニのうち CardClass が story を含む数。「場に＜天使＞が3体」等（既存 FIELD_COUNT はクラス未対応のため新設）。
- **WX12-018（ガブリエルト）:** E2「【常】ルリグトラッシュにアーツ4枚以上のかぎり、『【自】アタック時、場に＜天使＞3体なら相手の全シグニをトラッシュ』を得る」を、`ON_ATTACK_SIGNI`＋`condition: AND[LRIG_TRASH_COUNT(アーツ,gte,4), FIELD_CLASS_COUNT(self,天使,gte,3)]`→`TRASH SIGNI opponent ALL` に修正。E1（GRANT_PROTECTION）と BURST はパーサー生成を維持。
- **WXDi-P09-058（LOVIT//メモリア）:** 2能力とも誤パース（E1=CONTINUOUS TRASH ENERGY、E2=ON_PLAY AWAKEN＝召喚時覚醒の誤り）を修正。
  - E1: `ON_TURN_END`＋`condition: THIS_CARD_IS_AWAKENED`→相手エナ1枚トラッシュ。「対戦相手のセンタールリグと共通しない色」は energy 対象で既存 `colorNotMatchesLrig` が**対象オーナー（相手）のルリグ基準**で `colorExclude` へ解決される（effectExecutor の ENERGY_CARD 経路）ため、追加機構なしで忠実表現。
  - E2: `ON_SIGNI_BATTLE`→`AWAKEN_SIGNI`（自身覚醒）。**近似**: 「バトルによってバニッシュしたとき」の勝利限定は専用情報がないため、バトル成立時に発火（実用上ほぼ一致）。E2 の誤った召喚時覚醒を撤去したことで E1 の覚醒ゲートが正しく機能する。
- **反映:** `manualEffects.ts`＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects は新規警告なし（既知の WX06-029 のみ）。

---

## F-2 引用付与トリガー能力のフラット化誤解析を実装開始（バッチ1・3枚＋機構）（v0.377, 2026-06-20）

- **対象＝TODO F-2:** 「このシグニは『【自】…』を得る（かぎり）」型の引用付与能力が、内側 trigger を失って **CONTINUOUS TRASH にフラット化**され `calcContinuousSigniMutations`（行395）で no-op 化していた約19枚。監査で無害確定済みだが効果未実装だった。
- **方針の確定（機構は既存）:** 「〜であるかぎり『【自】…』を得る」型は、エンジンの **condition 付き AUTO トリガー**として表現すれば既存の収集経路が発火する（`collectTurnTriggers` 行2931／ON_ATTACK_SIGNI 収集 行6275 がいずれも `evalUseCondition(e.condition)` で発動条件を評価する確立済みパターン）。場全体への付与は既存の `GRANT_FIELD_SIGNI_ABILITY`＋`collectGrantedFromLayer`（augMap へ合成）に乗る。**新規の大規模機構は不要**で、データ表現の付け替えが主作業と判明。
- **小規模な機構追加（2点）:**
  - `LRIG_COLOR { owner, color }` 条件を新設（Condition／ActiveCondition 両方）。`evalCondition`(execUtils)・`checkActiveCondition`(effectEngine) にセンタールリグの Color 照合を実装。WX06-029 の「センタールリグが青で」用。
  - `GrantFieldSigniAbilityAction.targetOwner?: Owner` を新設し `collectGrantedFromLayer` を付与先オーナー別（自場／相手場）に分岐。`targetOwner:'opponent'` で相手シグニ全体へ付与可能に（WXDi-P10-072 等の足場。今回は未配線）。
- **実装した3枚（ON_ATTACK_SIGNI 経路＝最も検証が確実なもの）:**
  - **WX06-029（Ｏ・Ｓ・Ｓ）:** AUTO `ON_ATTACK_SIGNI`＋`condition: AND[LRIG_COLOR(self,青), THIS_CARD_IN_CENTER_ZONE]`→相手手札1枚捨て。
  - **WXDi-P04-082（ブルータス）:** AUTO `ON_ATTACK_SIGNI`＋`condition: THIS_CARD_IN_CENTER_ZONE`→`CHOOSE`（自分／対戦相手のデッキ上4枚を mill）。
  - **WXDi-P15-098（アオトラ）:** `GRANT_FIELD_SIGNI_ABILITY{filter:色黒}`→付与能力 `ON_ATTACK_SIGNI`→相手デッキ上1枚 mill。BURST はパーサー生成を維持。
- **反映:** `manualEffects.ts`（effectId 一致で JSON を上書き＝実行時に有効）＋プリビルド JSON（`effects_WX.json`/`effects_WXDi.json`、現在は minify 形式）に同内容を外科パッチ。全再生成は回避。
- **既知の無害な警告:** `verifyEffects` が WX06-029 に「【常】に対応する CONTINUOUS が無い」を1件出すが、「【常】…を得る」を condition 付き AUTO で表現したことによるヒューリスティックの誤検出（TODO E 節の既知課題）。ゲーム動作には影響しない。
- **残（TODO F-2 に詳細）:** ゲート条件・上シグニ付与・ルリグ付与・相手場付与の配線・複雑色条件（対戦相手センターと共通しない色）・全領域 LIFE_BURST 付与（WX17-036）・専用 timing 欠如（ダメージ時 WX21-054／バトルバニッシュ時 WXDi-P02-068）、および別形の誤解析（自己犠牲コスト・置換引用：WXDi-P04-040/WXDi-P06-034/WXK05-024/WXK10-039）。

## 動的キーワード付与（CONTINUOUS GRANT_KEYWORD）のバッジ表示を修正（v0.376, 2026-06-20）

- **症状（ユーザー報告）:** WD04-010「幻獣　ミスザク」（【常】パワー10000以上のかぎりランサーを得る）のように、条件達成で動的に得るキーワードの**バッジが表示されない**。他の動的変化も同様にバッジが付かない可能性。
- **原因:** バッジ判定 `getSigniStatusKeywords`（BoardComponents）が「テキストの固有【kw】（ただし『を得る』形は除外）」と「`keyword_grants` 状態（解決済み付与）」のみを参照し、**CONTINUOUS GRANT_KEYWORD の activeCondition を評価していなかった**。WD04-010 の付与は `SELF_POWER_THRESHOLD` 条件付きで毎フレーム変動するため `keyword_grants` には書かれず、テキストの「【ランサー】を得る」も除外対象で、結果バッジ非表示。バトル処理（`hasGrantedKeyword`/`contGrantedKeywords`, BattleScreen 6468-6474）では条件評価済みのため**ゲーム上のランサーは機能していた**＝表示のみの不整合。
- **修正:**
  - エンジンに `collectContinuousGrantedKeywords(ownerState, otherState, isOwnerTurn, effectsMap, cardMap, effectivePowers)` を新設。各シグニ instanceId 単位で、CONTINUOUS GRANT_KEYWORD のうち activeCondition を満たす付与を収集（自己付与「このシグニは…を得る」＝count:1/source自身、場全体付与＝count:ALL/filter一致の両対応）。
  - BattleScreen で `dynamicKeywords`（自分/相手ボード分）を `effectivePowers` 依存の useMemo で算出し、両 `PlayerField` に渡す。
  - `getSigniStatusKeywords` に `dynamicKeywords` 引数を追加し、`has(kw)` 判定に動的付与を含める。
- **波及:** WD04-010 以外の動的キーワード（パワー閾値・場の状況などで変動する CONTINUOUS ランサー/アサシン/ダブルクラッシュ等）のバッジも正しく表示・非表示されるようになる。
- **検証:** collector を WD04-010 相当で単体確認（power12000→`["ランサー"]` / power8000→`{}`）。

---

## spell-cut-in に使用条件評価を追加＋WX17-031 凶蟲条件を強制（v0.375, 2026-06-20）

- **症状:** spell-cut-in 候補収集（`cutinCandidates`）が各カットイン効果の `eff.condition` を評価していなかったため、WX17-031「§ヤシガニラ§」の【起】《スペルカットイン》が「あなたの場に＜凶蟲＞のシグニがある場合」条件を無視して常に発動候補に出ていた。
- **修正（BattleScreen.cutinCandidates）:** lrig_field／signi_field／hand の3ソースの push 直前に `if (eff.condition && !evalUseCondition(eff.condition, my, op, battleCardMap, srcNum, bs.turn_phase, effectivePowers)) return;` を追加。条件を満たさないカットインは候補から除外。
- **WX17-031-E3 に条件付与:** パーサーは文中条件「対象とし、あなたの場に＜凶蟲＞のシグニがある場合、それの効果を打ち消す」を抽出できていなかったため、JSON に `condition: HAS_CARD_IN_FIELD{owner:self, filter:{cardType:シグニ, story:凶蟲}}` を外科パッチ（`story`/`cardClass` とも `CardClass.includes` で照合されるため凶蟲に一致）。
- **退化なし確認:** 他のSPELL_CUTIN条件持ちは WX07-014/WX08-018 の `COND_STUB`（"クロス状態のシグニがある"）のみで、`evalUseCondition` は `COND_STUB→true` を返すため従来通り候補に出る（影響なし）。
- **残（近似）:** WX17-031 の凶蟲条件は「カットインを発動候補に出すか」のゲートとして強制。厳密には「カットインは使えるが凶蟲がないと打ち消さない」だが、打ち消さないカットインは無意味なため発動候補から除外で実用上同等。文中条件のパーサー抽出は未対応（同型カードが増えたら parser 化を検討）。

---

## WX19-045 ウィルス充填（合計N個になるように置く）を PLACE_VIRUS fillToTotal で正式実装（v0.374, 2026-06-20）

- **対象:** WX19-045「羅菌　ポレン」E1「対戦相手の場にある【ウィルス】の合計が２つになるように、対戦相手のシグニゾーンに【ウィルス】を置く」（v0.373 で手札発動は可能になったが action は STUB `PLACE_VIRUS_TO_2` の空きゾーン自動配置近似だった）。
- **PLACE_VIRUS に fillToTotal を新設:** `PlaceVirusAction.fillToTotal?: number`。`execPlaceVirus` で指定時は配置数 = `max(0, fillToTotal - 現在のウィルス合計)` を算出し、`SELECT_VIRUS_ZONE`（`remainingZones = min(needed, 空きゾーン数)`）で**配置先をプレイヤーが選択**して置く（既存の `resumeSelectVirusZone` 複数ゾーンループに乗る）。既に合計値に達していれば何もしない。
- **データ:** `manualEffects.ts` の WX19-045-E1 を STUB から `PLACE_VIRUS{targetOwner:opponent, zoneCount:2, virusCount:1, fillToTotal:2}` へ。プリビルド JSON も同 action に外科パッチ。
- **パーサー修正（parseSentencePart4.ts）:** 「【ウィルス】の合計がNつになるように…シグニゾーンに【ウィルス】を置く」を、誤った `STUB REMOVE_VIRUS` から `PLACE_VIRUS{fillToTotal:N}` へ（Nを抽出）。今後の同型カードも正しく解析。
- **改善点:** 旧 STUB はゾーン0,1,2の順で自動配置だったが、本実装は配置先（＝感染させる相手シグニ）をプレイヤーが選べる。旧 STUB executor `PLACE_VIRUS_TO_2`（execStubPart2）は他参照がないが念のため残置。

---

## 手札からこのカードを捨てて発動する【起】（WX17-031系9枚）を配線（v0.373, 2026-06-20）

- **症状:** 「【起】《アタックフェイズアイコン／スペルカットインアイコン》手札からこのカードを捨てる：…」という手札発動の【起】9枚（WX17-031/WX18-029/WX18-053/WX18-055/WX19-022/WX19-045/WX21-030/WXK11-067/WXDi-P08-070）が、ほぼ全て発動不能だった。B節「手札からの自己起動＋spell-cut-in 割り込み」の対象。
- **原因＝機構は既存・配線漏れ:** 手札発動の UI/ハンドラ（`getMyHandCardActions` の `handActivated` 判定→`setPendingHandActivated`→`executeHandActivated`：エナ＋自己捨てコスト支払い＋スタック積み＋`ON_DISCARDED_AS_COST` 収集）も、spell-cut-in 窓（`cutInOptions` が hand を走査）も**既に実装済み**だった。欠けていたのはパーサーが (1) `discardSelfFromHand` コストを付けつつ `handActivated` フラグを立てていない、(2) 全 【起】 を timing=MAIN 固定にしてアイコン（アタックフェイズ／スペルカットイン）を無視、の2点。
- **パーサー修正（effectParser.ts）:** `case '起'` で「手札からこのカードを捨て[る、]」を含む場合のみ、コスト先頭アイコンで timing を決定（`《スペルカットインアイコン》`→SPELL_CUTIN／`《アタックフェイズアイコン》`→ATTACK_ARTS／`《メインフェイズアイコン》`→MAIN）。`cost.discardSelfFromHand` 検出時に `handActivated:true` を付与。**discardSelfFromHand 限定**のため場の通常【起】（256件の《アタックフェイズアイコン》含む）には影響しない。読点形「捨て、…を取り除く：」の複合コスト（WX21-030）も `[る、]` で拾う。
- **COUNTER_SPELL maxCost（parseSentencePart1.ts）:** 「コストの合計が０のスペル」→ `maxCost:0` を解析（WX17-031 がコスト0スペル限定で打ち消すよう cut-in 候補を絞る）。
- **removeOppVirus コスト対応（BattleScreen.executeHandActivated）:** 「手札からこのカードを捨て、【ウィルス】3つを取り除く」（WX21-030）の複合コストを支払えるよう、相手の場のウィルス除去を追加（不足時は発動不可・UI側でもゲート）。
- **JSON 反映:** プリビルド JSON は全再生成（約90枚退化リスク）を避け、対象9効果の `timing`/`handActivated`/`cost`/`action`（COUNTER_SPELL maxCost・WX21-030 cost）のみを外科的にパッチ。他カードは不変。
- **結果:** 9枚すべてが正しいフェイズで手札発動可能に。WX18系4枚は ＜ドーナ／緑子／ウリス／イオナ＞ の `LRIG_STORY` 使用条件も維持。WX17-031 は spell-cut-in 窓に SPELL_CUTIN として出現。
- **残（内容バグ・別概念）:** WX19-045 の action は STUB（「【ウィルス】が合計2つになるように置く」の充填アクション未パース）。発動はできるが効果は近似。spell-cut-in 時の「あなたの場に＜凶蟲＞のシグニがある場合」条件は cut-in 収集が eff.condition を見ないため未強制（近似）。

---

## WX25-CP1-065（即時-2000＋同一対象へクラッシュ時-2000付与）を実装＝B節クラッシュ複雑ケース完了（v0.372, 2026-06-20）

- **症状:** WX25-CP1-065「風倉モエ」E1「【自】：アタックフェイズ開始時、対戦相手のシグニ1体を対象とし、＜ブルアカ＞を1枚捨ててもよい。そうした場合、ターン終了時まで、それのパワーを－2000する。このターン、対戦相手のライフクロス1枚がクラッシュされたとき、ターン終了時まで、それのパワーを－2000する」が、即時-2000＋手札捨ての近似で、後半の「クラッシュ時に同じ対象へ-2000」が欠落していた。B節「クラッシュ時トリガー複雑ケース（相手ライフクラッシュ時＋遅延対象記憶）」の最後の1枚。
- **鍵＝同一対象への二重適用:** 即時-2000と「クラッシュ時-2000」は同じ選択対象（「それ」）に適用する必要がある。既存 STUB `TARGET_AND_DISCARD_HAND`（対象選択→直後の `CONDITIONAL(IS_MY_TURN).then` を選択対象へ `applyDirectAction` で適用→手札1枚捨て）を利用し、`then` を `SEQUENCE[POWER_MODIFY -2000, GRANT_EFFECT(...)]` にすることで、1回の選択で両方を同一シグニへ適用。`applyDirectAction` は SEQUENCE（各ステップを同一 cardNum へ）・POWER_MODIFY・GRANT_EFFECT を既にサポート済み。
- **遅延対象記憶の解決:** 別途ストアを設けず、選択した相手シグニ自身に `GRANT_EFFECT` で `【自】ON_LIFE_CRASHED → POWER_MODIFY thisCardOnly -2000`（UNTIL_END_OF_TURN）を付与。相手（＝付与先コントローラー）のライフがクラッシュされると、その付与 `ON_LIFE_CRASHED` が `collectSelfEventTriggers`（相手フィールド走査）で発火し、付与先自身が-2000。クラッシュごとにスタック（usageLimit なし）。「対戦相手のライフ＝相手自身のライフ」なので相手視点の `ON_LIFE_CRASHED` がそのまま使え、新ストア不要。
- **近似:** 捨て札の＜ブルアカ＞限定・「捨ててもよい」の任意性・「そうした場合」ゲートは TARGET_AND_DISCARD_HAND の仕様（手札1枚＝任意カードを強制で捨て＋対象選択）に簡略化（既存STUB踏襲）。E2【絆自】は絆条件未対応のため非実装。
- **B節完了:** これでクラッシュ時トリガーの複雑ケース（WX16-Re07/WX25-P1-004/WXDi-P12-030/WX25-CP1-075/WXDi-CP02-084/WX11-026/WDK17-009/WXDi-P16-039/WXDi-P06-007/WX25-CP1-065）が全て実装済み。残るは別概念の WX17-031 系（手札からの自己起動＋spell-cut-in）。

---

## WXDi-P06-007（効果2枚ドロー条件＋ルリグ付与クラッシュ時）を実装＋CARDS_DRAWN_BY_EFFECT 新設（v0.371, 2026-06-20）

- **症状:** WXDi-P06-007「閃光へ飛翔　レイ」の3能力すべてが誤パースされていた。E1（アタックフェイズ開始時の条件付きアサシン付与）は条件・青フィルタ・任意性が欠落、E2（【出】ドロー＋エナチャージ）は DRAW が欠落しエナチャージのみ、E3（【起】《ゲーム１回》ルリグ付与のクラッシュ時能力）は ACTIVATED DRAW に完全誤パース。B節「クラッシュ時トリガー複雑ケース（クラッシュ無関係の別効果が誤リスト）」の対象だが、3能力とも実装に踏み込んだ。
- **CARDS_DRAWN_BY_EFFECT 条件を新設:** 「このターンに効果でN枚以上引いた」を表す Condition を追加。`PlayerState.cards_drawn_by_effect_this_turn` を新設し、`execDraw`（エンジンの効果ドロー経路）で `canDraw` 分加算（ドローフェイズの `drawCards` は経由しないので除外）。ターン終了時の両クリーンアップブロックで0へリセット。`evalCondition`(execUtils) に case 追加。
- **E1:** lrigブランチ（collectTurnTriggers）は `eff.condition` を評価しないため、`CONDITIONAL{CARDS_DRAWN_BY_EFFECT(self,gte,2)}` でアクションをラップして実行時評価。「捨ててもよい」は `CHOOSE`（捨てる/捨てない）で表現し、捨てる選択肢は `HAND_COUNT(self,gte,3)` の per-choice condition でゲート。捨てた場合に青のシグニ1体へ【アサシン】を UNTIL_END_OF_TURN 付与。
- **E2:** `SEQUENCE[DRAW1, ENERGY_CHARGE_FROM_DECK1]` に修正（DRAW 補完）。
- **E3:** `GRANT_EFFECT`（`thisCardOnly`＝センタールリグ自身へ `UNTIL_END_OF_TURN`）で `ON_OPP_LIFE_CRASHED`＋`twice_per_turn` の `CHOOSE(自ドロー / 相手ディスカード)` を付与。コスト `青×0`＋`once_per_game`。v0.370 で整備した `performLifeBurstResponse` の oppCrashSources（lrig 走査）と twice_per_turn 対応にそのまま乗る。
- **近似:** CARDS_DRAWN_BY_EFFECT のリセットは actions_done と同じく「自ターン終了時」のため、対戦相手ターン中の自己効果ドロー（稀）が翌自ターンのアタックフェイズ開始時まで残り得る（実用上ほぼ影響なし）。

---

## WXDi-P16-039（アシストルリグ・両者クラッシュ時ドロー/チャージ）を実装（v0.370, 2026-06-20）

- **症状:** WXDi-P16-039「アザエラ『逆転の炎』」E2「【出】：次の対戦相手のターン終了時まで、このルリグは『【自】《ターン２回》：あなたか対戦相手のライフクロス１枚がクラッシュされたとき、カードを１枚引くか【エナチャージ１】をする。』を得る」が、`ON_PLAY` の即時エナチャージに誤パースされていた。B節「クラッシュ時トリガー複雑ケース（lrig自己付与＋自分or相手両方クラッシュ＋ターン2回）」の対象。E1（バニッシュ）はパーサー生成が正しいので維持。
- **データ:** `manualEffects.ts` に `WXDi-P16-039-E2` を追加。`GRANT_EFFECT`（`thisCardOnly`＋`UNTIL_OPP_TURN_END`）でこのアシストルリグ自身へ、timing `[ON_LIFE_CRASHED, ON_OPP_LIFE_CRASHED]`＋`twice_per_turn`＋`CHOOSE(ドロー/エナチャージ)` の【自】を付与。
- **execGrantEffect の thisCardOnly 拡張:** 従来 `field.signi` のみ走査していたため、アシストルリグ（`assist_lrig_l/r`）が効果元のとき候補0になっていた。`field.lrig`／`assist_lrig_l/r` も自己ゾーンとして許可するよう拡張。付与先＝アシストルリグ instanceId。
- **収集側の lrig/アシスト走査拡張:**
  - `collectSelfEventTriggers`（ON_LIFE_CRASHED＝自ライフ）の `nonSigniSources` に `assist_lrig_l/r` を追加。
  - `performLifeBurstResponse` の ON_OPP_LIFE_CRASHED 収集を、従来の `op.field.signi` のみから `signi＋lrig＋assist_lrig＋key` を走査する `oppCrashSources` に拡張。
- **twice_per_turn 対応:** 両収集経路の usageLimit 判定を「`actions_done` の effectId 出現回数」ベースの `limitOk`／`oppLimitOk` ヘルパーに統一（once=1／twice=2）。従来は once_per_turn のみ（`includes`）対応だった。使用カウントは収集時に `usedOncePerTurnIds`／`oppUsedIds` 経由で `actions_done` へ永続化（スタック解決時の二重計上なしを確認）。
- **付与の寿命:** `granted_effects_until_opp_turn`（v0.368 ストア）に保存。設定者（コントローラー）のターン終了時には opKey 側のみクリアされ、次の相手ターン終了時（＝設定者のターン再開直前）にクリアされる＝「次の対戦相手のターン終了時まで」と一致。`actions_done` はターン毎リセットのため《ターン２回》は各ターンで2回使える。
- **波及:** ON_OPP_LIFE_CRASHED の lrig/付与/twice 対応は WXDi-P06-007-E3（ルリグ付与の ON_OPP_LIFE_CRASHED）等の足場になる。

---

## WDK17-009（キー・自ライフクラッシュ時3択）を実装（v0.369, 2026-06-20）

- **症状:** WDK17-009「愛憎の果てに　ハイティ・鍵」E1「【自】《ターン１回》：対戦相手のアタックフェイズの間、あなたのライフクロスがクラッシュされたとき、以下の３つから１つを選ぶ。①ドロー②相手ダウンシグニ1体バニッシュ③（センター＜アルフォウ＞かつ自ライフ１枚以下なら）相手ライフ1枚クラッシュ」が、`ON_PLAY` の CHOOSE（召喚時に即3択）に誤パースされていた。B節「クラッシュ時トリガー複雑ケース（条件付き／3択）」の対象。
- **実装:** `manualEffects.ts` に `WDK17-009-E1` を追加。timing を `ON_LIFE_CRASHED`＋`triggerScope:self`＋`usageLimit:once_per_turn` に修正。キーは v0.362 で `collectSelfEventTriggers` の `nonSigniSources`（`key_piece`/`key_piece_extra`）走査対象のため追加機構なしで発火。
- **条件付き選択肢:** 選択肢③に `condition: AND[LRIG_NAME_CONTAINS(self,アルフォウ), LIFE_COUNT(self,lte,1)]` を付与。`execChoose` は既存の per-choice `condition` を `available` で評価し、条件未達なら選べない（v0.350 で整備済みの `LRIG_NAME_CONTAINS`／既存 `LIFE_COUNT`／`AND` を組み合わせ）。
- **近似:** 「対戦相手のアタックフェイズの間」は省略（自ライフクラッシュはほぼ相手アタック中に発生）。E2（【起】このキーをルリグトラッシュ→対戦相手が自分のシグニ/エナを対象…）は対戦相手選択の複雑効果のためパーサー生成のまま維持。

---

## ON_SIGNI_BATTLE 新設 + UNTIL_OPP_TURN_END 永続ストア + WX25-CP1-075完全化 / WXDi-CP02-084（v0.368, 2026-06-20）

- **WX25-CP1-075 バトル時節の補完（ユーザー指摘）:** 付与能力の契機「このシグニがシグニ1体とバトルしたか」が未実装だった。timing `ON_SIGNI_BATTLE` を新設し、`resolvePendingSigniBattleFor` の実バトル成立時（`!effectivelyEmpty && opTopCardNum`）に攻撃側(myTopNum)・防御側(opTopCardNum)双方の `ON_SIGNI_BATTLE` AUTO を収集してスタックに積む（`triggerScope:'self'` 想定、各シグニ自身の能力のみ）。WX25-CP1-075-GRANT の timing を `['ON_SIGNI_BATTLE','ON_LIFE_CRASHED']` に拡張。両契機は同一 effectId＋`once_per_turn` 共有で《ターン1回》を正しく表現。
- **UNTIL_OPP_TURN_END 永続ストア新設:** `PlayerState.granted_effects_until_opp_turn`（付与効果）と `power_mods_until_opp_turn`（パワー修正）を追加。`effectsMap`(augMap) は granted_effects と配列結合マージ、`calcFieldPowers`(applyTempMods) は power_mods_until_opp_turn も加算。`execGrantEffect`/`execPowerModify` は `duration==='UNTIL_OPP_TURN_END'` のとき各長期ストアへ振り分け（`PowerModifyAction.duration` を新設）。ターン終了処理の opKey ブロック（＝次ターンプレイヤー＝設定者）で両ストアをクリア＝「次の対戦相手のターン終了時まで」を正確化。
- **WXDi-CP02-084 実装:** 【起】《ダウン》を「即時エナチャージ＋+4000」の誤パースから、`SEQUENCE[POWER_MODIFY thisCardOnly +4000 (UNTIL_OPP_TURN_END), GRANT_EFFECT thisCardOnly (UNTIL_OPP_TURN_END, 付与=【自】ON_LIFE_CRASHED once_per_turn → CONDITIONAL(DECK_TOP_MATCHES ブルアカ)→ENERGY_CHARGE_FROM_DECK)]` へ修正。`execGrantEffect` にも `thisCardOnly` 対応を追加。相手ターン中に自ライフがクラッシュされると発火し次の相手ターン終了時にクリアされるライフサイクルが一致。
- **未実装（明記）:** WX25-CP1-075 E2【絆自】／WXDi-CP02-084 E2【絆常】(+4000) はいずれも絆条件が絡みパーサーも未生成だったため今回も非実装（元から未実装で回帰なし）。

---

## 付与経由 ON_LIFE_CRASHED + WX25-CP1-075 を実装（v0.367, 2026-06-20）

- **症状:** WX25-CP1-075「姫木メル」E1（相手シグニへ「自分のライフがクラッシュされたとき自身パワー-2000」の【自】を付与）が、即時-2000＋エナチャージの誤パースになっていた（自・絆自の2能力が1つに混線）。B節「クラッシュ時トリガー複雑ケース（付与経由）」の対象。
- **付与経由の確認:** `granted_effects`（GRANT_EFFECT で付与）は `effectsMap`(augMap) に instanceId 単位でマージされ、`collectSelfEventTriggers('ON_LIFE_CRASHED')` が付与能力も拾うことを確認。付与期間「ターン終了時まで」は既存 `granted_effects` のクリアと一致するため、追加ストア不要で実装可能。
- **実装:** `manualEffects.ts` の WX25-CP1-075-E1 を `ON_ATTACK_PHASE_START`＋`condition: HAS_CARD_IN_FIELD(self, cardClass:ブルアカ, excludeSelf)`＋`GRANT_EFFECT(target: 相手シグニ1, duration: UNTIL_END_OF_TURN, effect: 【自】ON_LIFE_CRASHED once_per_turn → POWER_MODIFY thisCardOnly -2000)` に修正。付与先（相手）のライフがクラッシュされると、付与された自分視点の `ON_LIFE_CRASHED` で自身パワー-2000。
- **execPowerModify の thisCardOnly 対応:** `ctx.sourceCardNum` 自身のみ対象に追加（execUp と同型）。「このシグニのパワーを±X」を正確化。
- **未実装（近似/省略）:** バトル時節（「このシグニがバトルしたとき」）は専用 timing 未実装のためライフクラッシュ節のみ。E2【絆自】（このシグニが相手ライフをクラッシュしたときエナチャージ）は絆条件＋「このシグニがクラッシュした」判定が必要で今回非実装（元の混線E1に内包されていた誤エナチャージは除去）。

---

## カウンタークラッシュ機構新設 + WX25-P1-004 / WXDi-P12-030 を実装（v0.366, 2026-06-20）

- **症状:** 「次にあなたのライフクロスがクラッシュされたとき、対戦相手のライフクロスをクラッシュする」防御カウンター系が、即時クラッシュに誤パースされていた（WX25-P1-004＝即2枚クラッシュ、WXDi-P12-030＝即1枚クラッシュ）。B節「クラッシュ時トリガー複雑ケース（自分ライフクラッシュ時カウンタークラッシュ）」の対象。
- **新機構:** `PlayerState.life_crash_counter { remaining, perTrigger }` を新設。STUB `SET_NEXT_LIFE_CRASH_COUNTER`（`execStubPart1`）で防御側に設定。`performLifeBurstResponse`（自分=クラッシュされた側の処理）で `life_crash_counter.remaining>0` なら、対戦相手のライフを `perTrigger` 枚クラッシュするトリガー（`LIFE_CRASH owner:opponent`、playerId=防御側）を積み、`remaining` を減算（0でクリア）。ターン終了時に両プレイヤーの `life_crash_counter` をクリア（防御側＝次ターンプレイヤー側もクリア）。
- **データ:** `manualEffects.ts` に WX25-P1-004-E1（ACTIVATED/ATTACK→STUB）、WXDi-P12-030-E1（AUTO/ON_PLAY→STUB）。WXDi-P12-030-E2（《赤》《無》の別【出】）はパーサー生成のまま維持。
- **近似:** 発生源限定（「相手ルリグによって」「相手シグニによって」）と WX25-P1-004 のブースト時2枚クラッシュは未実装（perTrigger=1固定）。自分ライフがクラッシュされる＝ほぼ相手アタックのため実用上問題は小さい。

---

## ON_OPP_LIFE_CRASHED 機構新設 + WX16-Re07 を実装（v0.365, 2026-06-20）

- **症状:** WX16-Re07「轟砲 ウルバン」E1「【ダブルクラッシュ】によって対戦相手のライフクロスが２枚以上クラッシュされたとき、このシグニをアップする」《ターン１回》が `ON_PLAY` の `UP`（召喚時に自身アップ）に誤パースされていた。B節「クラッシュ時トリガー複雑ケース（相手ライフクラッシュ時機構が必要）」の対象。
- **新機構（相手ライフクラッシュ時トリガー）:** timing `ON_OPP_LIFE_CRASHED` を新設。`performLifeBurstResponse`（クラッシュされた側のバースト確認処理）で、**クラッシュした側＝ターンプレイヤー（op）のフィールド**から `ON_OPP_LIFE_CRASHED` の AUTO を収集してスタックに積む。所有はターンプレイヤー側に閉じる（playerId=crasherId）。`once_per_turn` は op の `actions_done` で管理し、activate(バースト発動)時は `queueCardEffects` の `extraUpdate` 経由、不発時は opKey 直接更新で永続化。
- **ダブルクラッシュ判定:** 新 Condition `OPP_LIFE_CRASH_EVENT_GTE`（同時N枚以上クラッシュ）。収集時に `oppCrashEventSize = 1 + pending_crashed_cards.length`（イベント先頭処理時に同時枚数を判定）で評価。条件評価器の `default: return true` のため汎用評価では阻害しない（実ゲートは収集時のインライン評価）。
- **UP の thisCardOnly 対応:** `execUp` に `thisCardOnly` フィルタを追加（`ctx.sourceCardNum` 自身のみアップ）。「このシグニをアップする」を正確化。
- **データ:** `manualEffects.ts` に `WX16-Re07-E1`（`ON_OPP_LIFE_CRASHED`＋`usageLimit:once_per_turn`＋`condition:OPP_LIFE_CRASH_EVENT_GTE(2)`＋`UP{thisCardOnly}`）。
- **波及:** この機構は他の「相手ライフクラッシュ時」カード（WX25-CP1-065 の該当節等）の足場になる。

---

## WX11-026 ヘスチア（トラッシュからの自己復活）を実装（v0.364, 2026-06-19）

- **症状:** E1「あなたのライフクロス１枚がクラッシュされたとき、このシグニをあなたのトラッシュから場に出してもよい」が `ON_PLAY` の `LIFE_CRASH owner:self`（＝召喚時に自分のライフをクラッシュする、という完全な誤パース）になっていた。B節「クラッシュ時トリガー複雑ケース（自己復活）」の対象。
- **機構:** トラッシュにあるカード自身がトリガー源になるケースに対応。`collectSelfEventTriggers('ON_LIFE_CRASHED')` を拡張し、`myState.trash` 内のカードのうち AUTO・`ON_LIFE_CRASHED`・アクションが `ADD_TO_FIELD source:TRASH_CARD` のもの（＝自己復活）を `cardNum=トラッシュのインスタンスID` で収集。フィールド走査側では同シグネチャ（`ADD_TO_FIELD`＋`source:TRASH_CARD`＋`filter.cardName` が自身の名前に含まれる）を除外し、場にいる間は発火しないようにした（トラッシュ専用能力）。
- **データ:** `manualEffects.ts` に `WX11-026-E1` を追加（E2/BURST はパーサー生成のまま維持）。action は `ADD_TO_FIELD owner:self source:{TRASH_CARD, count:1, upToCount:true, filter:{cardType:シグニ, cardName:聖火の祭壇　ヘスチア}}`。`upToCount` で「してもよい」（任意・0枚＝不発動）を表現。同名コピーは機能等価なので cardName 一致で「このシグニ」を近似。
- **解決パス:** ON_LIFE_CRASHED 収集 → `execAddToField`(TRASH_CARD) が `self_trash` の任意 SELECT_TARGET を提示 → 選択 → `resumeSelectTarget`→`applyDirectAction(ADD_TO_FIELD)` がトラッシュから除去＋`SELECT_SIGNI_ZONE` で配置。既存機構のみで実現（新アクション型なし）。
- **既知の制限:** 復活したヘスチアの【出】(E2) の自動発火は本修正の対象外（ADD_TO_FIELD 経由の ON_PLAY 配線は別課題）。E2 自体も「＜天使＞2枚を場に出す」が `LOOK_AND_REORDER` 近似のまま。

---

## TODO 監査ラウンド + 個別カード実装（v0.357〜v0.363, 2026-06-19）

このラウンドの引き継ぎ要点。**TODO.md の A節・F-1 は完全完了**、B節も大半が解消/監査済み。

### 新規実装・バグ修正

- **WX18-076（アクセ付与・被バニッシュ時の正面バニッシュ）(v0.357):** `TargetFilter.isTriggerSource` を新設（トリガー元カード＝`ctx.triggeringCardNum`のみ対象）。`collectBanishTriggers` に `prevOwnerState`（バニッシュ前状態）を渡し、離場で消える `GRANT_ACCE_HOST_ABILITY` の ON_BANISH 能力を前状態から再構築。正面（前ゾーン 2-zi）の相手シグニを `triggeringCardNum` として供給。
- **WX21-052（＜天使＞付与・相手ターン終了時の自トラッシュバニッシュ）(v0.358):** `BanishAction.selfTrashCost` を新設（対象を1体以上選んだら効果元シグニ自身をコストとしてトラッシュ。`resumeSelectTarget` で解決）。付与は `GRANT_FIELD_SIGNI_ABILITY`＋`cardClass:天使`、付与能力は `ON_TURN_END`＋`triggerScope:any_opp`（＝相手ターン終了時に発火）。
- **WXDi-P03-085 / WX17-035（A節近似2枚）(v0.359):** P03-085 は BANISH に `colorExclude:黒`＋`powerRange.max:3000` を付与。WX17-035 は `execRemoveAbilities` に `frontOfSelf` を追加し LAYER-E1 を `owner:opponent`＋`frontOfSelf` に修正（**旧 owner:self は自分の全シグニから能力を奪う実バグだった**）。
- **FS③（WX26-CP1-001）(v0.360):** 付与能力を `BANISH`→`TRASH`（カードは「トラッシュに置く」＝非バニッシュ）に忠実化。
- **WX25-P1-TK3（ダーク・アナライズ）(v0.361):** 専用stub `TK3_DECLARE_DISCARD` を新設。数字を宣言→対戦相手の手札から同レベルのシグニを全てトラッシュへ。旧 `DECLARE_NUMBER`+`LOOK_OPP_LIFE_TOP` は捨て処理が欠落していた。
- **ON_LIFE_CRASHED 誤パース7枚 + collector拡張(v0.362):** クラッシュ時トリガー機構は配線済み（全クラッシュ経路がチェックゾーン経由で `collectSelfEventTriggers('ON_LIFE_CRASHED')` に集約）だが**データ側で ON_PLAY/MAIN に誤パース**されていた。WXDi-P02-037/WX02-003/WX14-CB05/WX21-Re03/WXK03-014/WXK11-034/WD21-011 を `ON_LIFE_CRASHED` に修正。`collectSelfEventTriggers` をルリグ(`field.lrig`)・キー(`key_piece`/`_extra`)も走査するよう拡張（WX02-003=ルリグ・WXK03-014=キーは従来発火しなかった）。
- **WX09-027（羅石オリハルティア・テキスト書き換え）(v0.363):** E1=CONTINUOUSマーカー `BANISH_THRESHOLD_BOOST_7_15`。`execBanish` が自場のオリハルティア存在を検出し《オリハルティア》以外のシグニの「相手パワー7000以下バニッシュ」を15000以下に書き換え（ExecCtxへ配線せず execBanish 内で `ctx.ownerState.field` を直接スキャン＝全経路カバー）。E2 は欠落していた「トラッシュに《アダマスフィア》がある場合」を `CONDITIONAL{TRASH_HAS_CARD}` で補完。

### 監査で「実は実装済み」と判明し TODO を訂正したもの（前セッションで実装済・TODO 未更新）

- **A節 PR-Di035:** 青の「相手手札3枚捨て」は `TRASH{HAND_CARD,owner:opponent}`＋`opponentResponds` で相手選択済み（先頭3枚固定の近似は撤去済）。
- **C節 全4システム:** GRANT_QUOTED_AUTO_ABILITY / GAIN_SUBSCRIBER_COUNT / SONG_FRAGMENT / COPY_LRIG_NAME_ABILITY はいずれも engine に実体実装あり（「ログのみ」は誤り）。
- **B節:** CONTINUOUS REMOVE_ABILITIES / CONTINUOUS DRAW(WXDi-P04-056) / 動的choose_count(リコレクト) / 遅延付与(FS③) / **ダーク系TK6 `NO_BATTLE_DEFENDER`** はすべて実装済み。特に NO_BATTLE_DEFENDER は `BattleScreen.resolvePendingSigniBattleFor`（人間・CPU共通, 6446〜6454）で実装済（旧「engine未対応」はバトルロジックが engine/ でなく BattleScreen にあるための誤認）。攻撃側には適用されない（防御側＝`opTopCardNum` のみ判定）ので、TK6 が自分からアタックしたときは通常バトルになる。

### zerom への残作業（TODO.md 参照）

- **B（要・専用設計）:** ①手札からの自己起動＋spell-cut-in 割り込み（WX17-031 等8枚）②クラッシュ時トリガーの複雑ケース（相手ライフ参照・付与経由・条件付き：WX16-Re07/WDK17-009/WXDi-P06-007/P12-030/P16-039/CP02-084/WX25-P1-004/WX25-CP1-065/075、自己復活の WX11-026）
- **D:** CPU メインフェイズAI（アーツ/起動の能動使用）
- **C/E/F-2/F-3:** 個別カードのエッジケース精査のみ（バグではない）

---

## SP27-015（アクセ付与の【起】＋アクセトラッシュコスト）を実装（v0.356, 2026-06-19）

- **`acceTrash` コストの支払い実装:** `EffectCost.acceTrash`（型はあったが未配線）を `executeSigniActivated` で支払い処理（先頭ゾーンから【アクセ】N枚をトラッシュ）。シグニ【起】の起動可能判定に枚数不足チェックとコストラベルも追加。
- **SP27-015「コードイート トンカツ」:** アクセされているシグニに「【起】《ターン1回》【アクセ】2枚をトラッシュ：相手シグニ1体をバニッシュ」を付与（`GRANT_ACCE_HOST_ABILITY` の付与ACTIVATED。付与起動能力は augMap 経由で起動リストに出現し `executeSigniActivated` が渡された effect を直接解決する）。

---

## WD14-001（全領域へ【ライフバースト】付与）を実装（v0.355, 2026-06-19）

- **機構追加:** マーカー STUB `GRANT_ALL_ZONE_LIFEBURST`。`BattleScreen` に `controlsAllZoneBurstGrant`（場のシグニ/センタールリグ/アシストにこの効果があるか）・`effectiveHasBurst`・`grantedBurstEntry`（合成LIFE_BURST＝相手シグニ1体バニッシュ）を追加。
- **配線3箇所:** ①CPUのバースト発動判定（`effectiveHasBurst`）、②人間のバースト確認モーダル（`hasBurst` に付与分を加味）、③`performLifeBurstResponse` の解決で、ネイティブLBを持たないクラッシュカードに付与分を `extraEntries` として注入。
- **WD14-001「虚幸の閻魔 ウリス」:** あなたのすべての領域の【ライフバースト】を持たないカードが【ライフバースト】「対戦相手のシグニ1体をバニッシュ」を得る。E1（グロウコスト減）/E2（＜悪魔＞18枚以上で相手ガード不可）は別効果として既存のまま。

---

## WX20-Re18（動的レベル）を実装（v0.354, 2026-06-19）

- **`buildLevelMods` の `DYNAMIC_LEVEL_BY_ENERGY` バグ修正:** 「エナN枚につき＋M」の除数を無視して `baseLv + energy*delta` にしていた（レベルが過大）。`baseLv + floor(energy/divisor)*delta` に修正。「カード」指定（全カード）も解釈。
- **実効レベル比例パワー:** `calcFieldPowers` の STUB パワー処理に `DYNAMIC_LEVEL_BY_ENERGY` を追加。「パワーはレベル１につき＋N」を実効レベル（`levelMods`）×N で適用。
- **WX20-Re18「幻獣 アカズキン」:** E1=レベル＝2＋エナ÷5・パワー＝実効レベル×3000（既存 STUB が両方を駆動）。E2=レベル4以上（＝エナ10以上）でアタック時に正面のシグニをバニッシュ（`frontOfSelf`）。E2b=レベル5以上（＝エナ15以上）で対戦相手の効果を受けない（`GRANT_PROTECTION from:['any']`）。E3=メインフェイズ開始時のデッキトップ→エナを `ON_PLAY` 誤設定から `ON_TURN_START` に修正。
- レベル4/5の判定は base2・除数5から `エナ≥10 / ≥15` と数学的に同値なので `ENERGY_COUNT`/`COUNT_THRESHOLD(energy)` で正確に表現。

---

## WX17-038 を「めくり続けて同レベルバニッシュ」で実装（v0.353, 2026-06-19）

- **アクション追加:** `REVEAL_UNTIL_BANISH_SAME_LEVEL { revealClass, banishOwner }`。デッキ上から指定クラスのシグニがめくれるまで公開し、そのシグニのレベルを取得、公開カードをシャッフルしてデッキ一番下へ戻し、同レベルの相手シグニ1体をバニッシュ（プレイヤー選択）。
- **WX17-038「羅星 ≡タイトツ≡」:** 中央のシグニゾーンにあるかぎり、アタック時に＜宇宙＞のシグニがめくれるまで公開→同レベルの相手シグニ1体をバニッシュ（AUTO・`condition:THIS_CARD_IN_CENTER_ZONE`）。

---

## WXDi-CP02-TK02A（雨雲号トークン）を実装（v0.352, 2026-06-19）

- 複数効果が誤解析されていた（E1=無条件CONTINUOUS BANISH、E2=「ターン終了時に相手トラッシュを1枚トラッシュ」という無意味な誤り）。
- **修正:** E1=【常】【ランサー】（CONTINUOUS GRANT_KEYWORD）、E2=【自】バトルでシグニをバニッシュしたとき相手パワー10000以下を1体バニッシュ（AUTO `ON_SIGNI_BANISH_BATTLE`）。
- **保留:** 「対戦相手のターン終了時にこのシグニをゲームから除外」は、非アクティブ側のターン終了トリガー（`collectTurnTriggers` は能動側フィールドのみ走査）が必要なため未実装。トークンが自然消滅しない点は既知の制限。

---

## WX25-P3-057 を覚醒アサシンで実装＋ON_TURN_END条件配線（v0.351, 2026-06-19）

- **収集経路修正:** `collectTurnTriggers`（ON_TURN_END / ON_TURN_START / ON_ATTACK_PHASE_START）が `eff.condition` を無視していたのを `evalUseCondition` で判定するよう修正（既存カードは該当条件付き0件で影響なし）。
- **フィルタ追加:** `TargetFilter.thisCardOnly`（効果元シグニ自身のみを対象＝「このシグニをバニッシュする」。`execBanish` が解決）。
- **WX25-P3-057「コードハート Oイルヒーター」:** 覚醒状態であるかぎり【アサシン】を得る（CONTINUOUS GRANT_KEYWORD・`activeCondition:IS_SELF_AWAKENED`）＋あなたのターン終了時にこのシグニをバニッシュ（AUTO `ON_TURN_END`・`condition:THIS_CARD_IS_AWAKENED`・`thisCardOnly`）。「アタックが無効化されない」常在耐性は未対応（保留）。
- **あわせて修正:** E2「アタックフェイズ開始時、手札0枚なら《赤》で覚醒」が timing `ATTACK`（AUTO未ディスパッチ）で発火しなかったのを `ON_ATTACK_PHASE_START`＋`condition:HAND_COUNT=0` に修正。

---

## WDK16-06H をセンター名/登録者数条件で実装（v0.350, 2026-06-19）

- **条件追加:** `LRIG_NAME_CONTAINS { owner, name }`（センタールリグ名が name を含む）／`SUBSCRIBER_COUNT { operator, value }`（Condition版。`subscriber_count` を参照。ActiveCondition には既存）。
- **WDK16-06H「コードＶＬ 本間ひまわり」:** 場にカード名に《楓》を含むセンタールリグがいる場合、アタック時に相手パワー8000以下のシグニ1体をバニッシュ。登録者数100万人達成時は代わりに相手シグニ1体をバニッシュ（AUTO・`condition:LRIG_NAME_CONTAINS('楓')`・action は `CONDITIONAL(SUBSCRIBER_COUNT≥100)`）。

---

## PR-288 をルリグレベル一致条件で実装（v0.349, 2026-06-19）

- **条件追加:** `LRIG_LEVEL_EQ_OPP`（Condition／自分のセンタールリグのレベルが対戦相手のセンタールリグと同じ）。
- **PR-288「小砲 アルマイル」:** 中央ゾーンにあり、自他センタールリグのレベルが同じ場合、アタック時に相手パワー2000以下のシグニ1体をバニッシュ（AUTO・`condition:AND[THIS_CARD_IN_CENTER_ZONE, LRIG_LEVEL_EQ_OPP]`）。E1の基本パワー1000化（POWER_SET）は既存のまま維持。

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
