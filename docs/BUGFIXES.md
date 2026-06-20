# バグ修正記録 (BUGFIXES)

これまでに修正した主要なバグ・系統的修正の記録。新しいものを上に追記する。
設計方針は [DESIGN.md](./DESIGN.md)、未対応の作業は [TODO.md](./TODO.md)。

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
