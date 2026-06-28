# バグ修正記録 (BUGFIXES)

これまでに修正した主要なバグ・系統的修正の記録。新しいものを上に追記する。
設計方針は [DESIGN.md](./DESIGN.md)、未対応の作業は [TODO.md](./TODO.md)。

---

## repr: 脱落疑い棚卸しの実バグ候補3枚を修正（2026-06-28・P1 DoD(a)）

脱落疑い255枚の棚卸し（`scripts/_dropTriage.mjs`）で JSON 実体の脱落を確認した3枚を MANUAL パッチで原文一致に修正。残2枚は語彙なしで機構待ちに再分類。

- **WXK01-063 貫穿**＝旧 JSON は GRANT_KEYWORD Ｓランサーのみ＝原文「＋2000し【Ｓランサー】を得る」の **POWER_MODIFY +2000 が脱落**。SEQUENCE に POWER_MODIFY +2000（UNTIL_END_OF_TURN）を追加し GRANT_KEYWORD を targetsLastProcessed で同一対象に。
- **WX18-019 奮闘努力**＝旧 JSON は `SHUFFLE_DECK` のみ＝原文「デッキから2枚まで探してエナに置きシャッフル」の **SEARCH→ENERGY が脱落**。SEQUENCE で SEARCH(maxCount2,then ENERGY_CHARGE)＋SHUFFLE_DECK に復元。
- **WDK15-009 スティング・スイング**＝旧 JSON は TRANSFER_TO_HAND count:1 シグニ＝原文「ライズ黒持ち1枚＋無色でない1枚を手札」の **対象2枚→1枚＋フィルタが脱落**。SEQUENCE で TRANSFER_TO_HAND×2（filter:hasRiseIcon／nonColorless）に復元。decompiler の filterJa に hasRiseIcon/hasCrossIcon を追加（《ライズアイコン_黒》の色は hasRiseIcon で近似＝色未限定）。
- 機構待ち再分類＝**WX17-028**（【出】が「公開シグニのレベル合計×1000以下」の動的閾値＝語彙なし）／**WX25-CP1-069**（「このターン…クラッシュしたとき」の遅延条件トリガー＝語彙なし）。
- 3枚とも parseStatus:MANUAL・typecheck緑・同型★0・逆翻訳が原文の全効果を表現。⚠実機未検証。

## repr: 最難物2件＝ウェポン効果バニッシュ＋複合ORトリガー（R58・VALUE 2→0・🎉 timing flatten 完了）（R58・2026-06-28）

残 VALUE 2 の最難物を表現し切り、**timing flatten（VALUE）を 0 にした**（P1 表現①の到達点）。両者とも既存単一 timing では表せない／engine 機構が無いため、専用の新 timing＋engine未配線マークで表現のみ確定。

- **WX07-036**「あなたの＜ウェポン＞のシグニが効果によって対戦相手のシグニ１体をバニッシュしたとき」＝新 timing `ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`。既存 `ON_SIGNI_BANISH_OPPONENT` は**バトル経路のみ配線**で「効果バニッシュ」とは別イベント＝共有すると未配線注記が付けられない（偽陰性）ため別 timing 化。triggerScope=any_ally＋triggerFilter.story=ウェポンで主語を表現（decompiler の汎用「このシグニ」置換で `あなたの＜ウェポン＞のシグニが…` を生成）。
- **WXDi-P11-064**「あなたの他の＜天使＞のシグニ１体が場に出る**か**、あなたの効果によって対戦相手が手札を１枚捨てたとき」＝**OR複合トリガー**を新 timing `ON_ALLY_PLAY_OR_OPP_HAND_DISCARD` で表現。ON_PLAY と ON_HAND_DISCARDED は両方とも**配線済み**＝配列に並べると engine が誤scopeで実発火する危険があるため、専用の未配線 timing 1個に集約。triggerFilter.{excludeSelf,story:天使} を decompiler 専用レンダリングで「あなたの他の＜天使＞の…」に反映。
- 型＝effects.ts に2 timing 追加。パーサー＝'自'チェーンに句ルール2件（トリガー文非除去）＋scope/filter 抽出ブロック2件。decompiler＝`timingJa` 2件・`ON_ALLY_PLAY_OR_OPP_HAND_DISCARD` 専用レンダリング・`engineUnwiredTimings` に2件登録。データ＝両 E1 を FRESH 同期。
- typecheck緑・**同型★0**・逆翻訳トリガー句**原文一致**・**VALUE 2→0・LOSS 0 維持**・⚠両者 engine未配線。⚠pre-existing（別件・metric非影響）：WX07-036 action 対象が「このシグニ」でなく owner:self count:1 近似／WXDi-P11-064 は「あなたのターンの間」condition と「次の対戦相手のターン終了時まで」duration（UNTIL_END_OF_TURN 近似）が未表現。

## repr: ON_MATERIAL_USED（《改造素材》が使用されたとき）8効果（R57・2026-06-28）

WXK09-047/084「《改造素材》が使用されたとき…」を新 timing `ON_MATERIAL_USED` で表現。同句6枚（WXK09-047/048/049/077/084・WXK10-050）を一括対応。**3変種**を triggerScope/triggerCondition で区別：
- `このシグニに…使用されたとき`＝self（既定）
- `あなたの他のシグニ１体に…使用されたとき`＝any_ally + excludeSelf
- `あなたが…を使用したとき`＝triggerCondition.materialUsedByPlayer（プレイヤー起点）

**改造素材の use イベントが engine 未実装＝engine未配線**（`engineUnwiredTimings` 登録）。

- 型＝`ON_MATERIAL_USED`＋`triggerCondition.materialUsedByPlayer`（effects.ts）。パーサー＝句ルール＋専用 scope/cond 抽出ブロック（トリガー文非除去）。decompiler＝`timingJa`＋3分岐レンダリング＋`engineUnwiredTimings` 登録。
- データ＝8効果を superset-safe で FRESH 丸ごと一括置換（WXK09-047-E1/E2/BURST・WXK09-048-E1・WXK09-049-E1・WXK09-077-E1・WXK09-084-E1・WXK10-050-E1）。WXK09-047-BURST の source filter story:電機 も同時補完。
- typecheck緑・同型★0・逆翻訳3変種とも原文一致・**VALUE 4→2・LOSS 0 維持**・⚠engine未配線。⚠pre-existing：WXK09-084-E1 action の対象 owner が「自分または対戦相手」近似（別件）。

## repr: ON_COIN_PAID（コインを1枚以上支払ったとき）3枚（R56・2026-06-28）

WXDi-P15-069「あなたが《コイン》を１枚以上支払ったとき…」を新 timing `ON_COIN_PAID` で表現。同句3枚（WXDi-P15-055/069・WXDi-P16-057）を一括対応＝全て self scope（変種なし・素直）。**コイン支払がグロウ/ベット/起動コスト等の多経路に分散＝engine未配線**（`engineUnwiredTimings` 登録）。

- 型＝`ON_COIN_PAID`（effects.ts）。パーサー＝句ルール `/あなたが《コイン[^》]*》を[^。]{0,8}支払ったとき/`→`['ON_COIN_PAID']`（トリガー文非除去・scope=self 既定）。decompiler＝`timingJa` 追加＋`engineUnwiredTimings` 登録。
- データ＝3枚の E1（WXDi-P15-055/069・WXDi-P16-057）を一括 sync。WXDi-P15-069-E1 は thisCardOnly 補完含め FRESH 丸ごと置換で完全一致。
- typecheck緑・同型★0・逆翻訳原文一致・**VALUE 5→4・LOSS 0 維持**・⚠engine未配線。

## repr: ON_LRIG_GROW（ルリグがグロウしたとき）6効果（R55・2026-06-28）

WXDi-P05-010「あなたの他のルリグがグロウしたとき…」を新 timing `ON_LRIG_GROW` で表現。同句が多数（self/any_ally/any_opp/excludeSelf 変種）に出るカスケード＝R49 式に**パーサー句ルール＋scope抽出＋一括patch**で系統対応。**grow が executeGrow/CPU/アシストの多経路に分散＝engine未配線**（`engineUnwiredTimings` 登録）。

- 型＝`ON_LRIG_GROW`（effects.ts）。パーサー＝句ルール `/(?:あなた|対戦相手)の(?:他の)?(?:センター)?ルリグがグロウしたとき/`→`['ON_LRIG_GROW']`＋専用 scope 抽出ブロック（`対戦相手の…`→any_opp／`あなたの他の…`→any_ally+excludeSelf／他→any_ally）。トリガー文非除去。
- decompiler＝`timingJa.ON_LRIG_GROW` ＋ scope 反映ブロック（any_opp→「対戦相手の」／excludeSelf→「他の」）＋`〔範囲:…〕`フォールバック除外に ON_LRIG_GROW 追加＋`engineUnwiredTimings` 登録。
- データ＝一括 sync 6効果：WXDi-P05-010-E1/E2（any_ally+excludeSelf／E2 は action source filter `color:黒` も補完）・WXK11-012-E3・WXDi-P03-039-E2（any_ally）・WXDi-P03-046-E1・WXDi-P13-047-E2（any_opp）。ACTIVATED/注記文（WXDi-P03-002/WXDi-P13-023/WX24-P4-036/WXK11-012 付与）は '自' チェーン非対象/未生成で誤分類せず。
- typecheck緑・同型★0・逆翻訳トリガー句原文一致（センター省略は偽陽性）・**VALUE 6→5・LOSS 0 維持**・⚠engine未配線。

## repr+engine: ON_OPP_ARTS_USE 配線流用（相手アーツの効果を受けたとき）1枚（R54・2026-06-28）

WXK11-019-E2「あなたのシグニ１体が対戦相手のアーツの効果を受けたとき、…」を**既存の配線済み timing `ON_OPP_ARTS_USE`** に載せる（新 timing 不要・**engine未配線ではない＝genuine**）。`collectOppArtsUseTriggers`（BattleScreen:7028）が相手アーツ使用時に場シグニの ON_OPP_ARTS_USE【自】を収集する既存機構をそのまま使う。

- パーサー＝timing チェーンに `/対戦相手のアーツの効果を受けたとき/`→`['ON_OPP_ARTS_USE']`（トリガー文非除去）。これまで WX05-020 は manualEffect で ON_OPP_ARTS_USE を持っていたが、パーサーが拾えず WXK11-019 は ON_PLAY 化していた＝パーサー優先で是正（[[feedback_parser_over_manual]]）。
- decompiler＝`timingJa.ON_OPP_ARTS_USE='あなたのシグニが対戦相手のアーツの効果を受けたとき'` を追加（従来 raw 表示だった WX05-020 の逆翻訳も改善）。engineUnwiredTimings には**追加しない**（配線済み）。
- データ＝WXK11-019-E2 timing `ON_TURN_END`→`ON_OPP_ARTS_USE`＋E1（中央ゾーン付与の UP）target に `thisCardOnly` 補完で完全一致。カスケードは WX05-020（manual・非影響）/WXK11-019 のみ。
- typecheck緑・同型★0・逆翻訳トリガー句原文一致・**VALUE 7→6・LOSS 0 維持**。⚠pre-existing：WXK11-019-E2 action の対象が「そのシグニ（trigger源）」でなく「対戦相手のシグニ」近似（別件・metric非影響）。

## repr: ON_LRIG_ATTACK_STEP_START（ルリグアタックステップ開始時）2効果（R53・2026-06-28）

WX25-CP1-042-E2「あなたのルリグアタックステップ開始時、…対戦相手は手札を１枚捨てる」を新 timing `ON_LRIG_ATTACK_STEP_START` で表現。同句が3枚（WXK01-038/WXDi-CP02-059/WX25-CP1-042）に出るが、**actionText 先頭アンカー `/^あなたのルリグアタックステップ開始時/`** でトップレベルのトリガーのみ拾う設計：

- WXDi-CP02-059＝句がアクション内（遅延効果）＝実トリガー ON_OPP_LIFE_CRASHED のまま（誤分類せず）。
- WXK01-038＝句が GRANT_LRIG_ABILITY の付与能力内（先頭アンカー一致）＝付与能力の内側 timing も `ON_PLAY`（旧近似）→`ON_LRIG_ATTACK_STEP_START`（正）に更新＝JSON も揃えて完全一致。
- 型＝`ON_LRIG_ATTACK_STEP_START`（effects.ts）。decompiler＝`timingJa` 追加＋`engineUnwiredTimings` 登録。データ＝WX25-CP1-042-E2 timing＋WXK01-038-E1.action.abilities[0].timing を更新。
- typecheck緑・同型★0・逆翻訳トリガー句原文一致・**VALUE 8→7・LOSS 0 維持**・⚠engine未配線（クラッシュ数カウント等のアクション機構も要）。
- ⚠pre-existing（別件）：WX25-CP1-042-E2 の action は「ライフ1枚につき」カウントや E3 との切り分けが近似（変更前から EXIST=FRESH 共通・metric非影響）。

## repr: ON_LRIG_UNDER_MOVED（ルリグの下からカードが移動したとき）1枚（R52・2026-06-28）

WXDi-P04-042「あなたのターンの間、あなたのルリグ１体の下からカード１枚が移動したとき、対戦相手のシグニ１体を対象とし、《無》を支払ってもよい。そうした場合、ターン終了時まで、それのパワーを－8000する」を新 timing `ON_LRIG_UNDER_MOVED` で表現。**ルリグ下スタックの set-diff 配線が必要かつ発火が稀（検証困難）のため engine未配線**（`engineUnwiredTimings` 登録＋【※engine未配線】）。R49〜R51 と同手順（句ユニーク・トリガー文非除去・timing差分のみ＝完全一致）。

- 型＝`ON_LRIG_UNDER_MOVED`（effects.ts）。パーサー＝timing チェーンに `/ルリグ[^。]{0,6}下から[^。]{0,8}移動したとき/`→`['ON_LRIG_UNDER_MOVED']`。decompiler＝`timingJa` 追加＋`engineUnwiredTimings` 登録。データ＝WXDi-P04-042-E1 timing `ON_TURN_END`→`ON_LRIG_UNDER_MOVED`。
- typecheck緑・同型★0・逆翻訳トリガー句原文一致・**VALUE 9→8・LOSS 0 維持**・⚠engine未配線。
- ⚠既知残（pre-existing・別件）：E1 action の POWER_MODIFY が `targetsTriggerSource:true`＝原文「それ」はstep[0]（TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST）で選んだ対戦相手シグニを指すべき。変更前から EXIST=FRESH 共通の action 誤り（VALUE/LOSS 非影響）。本ラウンドのスコープ外。

## repr: ON_KEYWORD_GAINED（他シグニがアサシン/ランサー/ダブルクラッシュを得たとき）1枚（R51・2026-06-28）

WXDi-P04-035「あなたの他のシグニ１体が【アサシン】か【ランサー】か【ダブルクラッシュ】を得たとき、《赤》《無》を支払ってもよい。そうした場合、このシグニはその能力を得る」を新 timing `ON_KEYWORD_GAINED` で表現。**「その能力を得る」の動的注入（得たキーワードを引き継ぐ）＋任意コストで配線が重いため engine未配線**（`engineUnwiredTimings` 登録＋【※engine未配線】）。R49/R50 と同型の手順。

- 型＝`ON_KEYWORD_GAINED`（effects.ts）。パーサー＝timing チェーンに `/(?:【アサシン】|【ランサー】|【ダブルクラッシュ】)[^。]{0,40}を得たとき/`→`['ON_KEYWORD_GAINED']`（トリガー文非除去）。decompiler＝`timingJa` 追加＋`engineUnwiredTimings` 登録。
- データ＝WXDi-P04-035-E1 timing `ON_TURN_END`→`ON_KEYWORD_GAINED`。句ユニーク（カスケードなし・timing差分のみ＝完全一致）。
- typecheck緑・同型★0・逆翻訳原文一致・**VALUE 10→9・LOSS 0 維持**・⚠engine未配線。なお `PlayerState.keyword_grants`（set-diff 可能）が存在＝将来配線の足掛かり有り。

## repr: ON_DECK_SHUFFLED（あなたのデッキがシャッフルされたとき）1枚（R50・2026-06-28）

PR-470A「あなたのデッキがシャッフルされたとき、ターン終了時まで、このシグニのパワーを＋5000する」を新 timing `ON_DECK_SHUFFLED` で表現。**`shuffle()` がリフレッシュ/サーチ後/各種デッキ操作の多数箇所に分散（フック分散）＝配線が重いため engine未配線**（`engineUnwiredTimings` 登録＋【※engine未配線】）。R49 ON_TARGETED と同型の手順。

- 型＝`ON_DECK_SHUFFLED`（effects.ts）。パーサー＝timing チェーンに `/デッキがシャッフルされたとき/`→`['ON_DECK_SHUFFLED']`（トリガー文非除去＝action 解析を変えない）。decompiler＝`timingJa` 追加＋`engineUnwiredTimings` 登録。
- データ＝PR-470A-E1 timing `ON_TURN_END`→`ON_DECK_SHUFFLED`＋POWER_MODIFY target に `thisCardOnly` 補完で完全一致。句はユニーク（カスケードなし）。
- typecheck緑・同型★0・逆翻訳原文一致・**VALUE 11→10・LOSS 0 維持**・⚠engine未配線。

## repr: ON_TARGETED（対戦相手の能力か効果の対象になったとき）14枚（R49・2026-06-28）

「このシグニ／あなたの〔色/クラス〕のシグニが対戦相手の、能力か効果の対象になったとき」を新 timing `ON_TARGETED` として表現。**対象選択の確定経路への配線は重い（インタラクション中核の多経路改変＝高リスク）ため engine未配線**＝decompiler `engineUnwiredTimings` に `ON_TARGETED` を登録し逆翻訳末尾に【※engine未配線】を付与（TODO §3 の方針どおり）。

- 型＝`EffectTiming` に `ON_TARGETED` 追加（effects.ts）。
- パーサー＝timing 検出チェーンに `/対戦相手の[、,]?\s*能力か効果の対象になったとき/`→`['ON_TARGETED']` を追加。**トリガー文は除去しない**（除去すると後続アクションの target/owner 解析が変わり手修正JSONと乖離＝検証で判明）。主語が「あなたの〔＜X＞/色〕のシグニ」の場合のみ `triggerScope:any_ally`＋`triggerFilter`（story/color/excludeSelf）を抽出（actionText 非改変）。
- decompiler＝`timingJa.ON_TARGETED='このシグニが対戦相手の能力か効果の対象になったとき'`。triggerScope:any_ally は既存の汎用 scope主語置換（「このシグニ」→「あなたの《色》/＜クラス＞のシグニ」）に自動的に乗る。`engineUnwiredTimings` 登録。
- データ＝該当14効果（WXDi-P11-040/WX25-P2-055/WX25-CP1-060 ＋ パーサー修正で新たに露出した WXDi-D09-H14/D09-P13/P02-043/P03-067/P11-058/P12-074/P13-054・WX24-P1-045/P3-051/P4-102・WX26-CP1-050）の timing を `ON_TURN_END`/`ON_PLAY`仮置き→`ON_TARGETED` に統一。any_ally の4枚は triggerScope/triggerFilter も付与。1枚 WX25-CP1-060 は POWER_MODIFY target に `thisCardOnly` 補完で完全一致。
- typecheck緑・同型★0（sheet7/8/9＋grouped 再生成）・**VALUE 14→11・LOSS 0 維持**・⚠engine未配線（ON_TARGETED 発火は未実装）。
- ⚠既知残：WX25-P2-055-E2 の REMOVE_ABILITIES owner が `opponent`（原文「このシグニ」＝self のはず）＝**変更前から存在する pre-existing parser誤り**（trigger文「対戦相手の」が target解析に滲む。EXIST=FRESH共通＝VALUE/LOSS非影響）。本ラウンドのスコープ外。

## engine: ON_PLAY placedPuppet（傀儡状態のシグニが場に出たとき）1枚（R48・2026-06-28）

WDK17-001「あなたの傀儡状態のシグニ１体が場に出たとき、以下の３つから１つを選ぶ」を新設。トリガーは新 timing 不要＝**既存 ON_PLAY any_ally 機構に相乗り**（バトンの「低リスク（既存単一検出点に相乗り）」方針）。

- 型＝`triggerCondition.placedPuppet`（effects.ts）。
- パーサー＝`effectParser.ts` の ON_PLAY ally 抽出正規表現に `(傀儡状態の)?` を追加し、マッチ時 `placedPuppet:true`＋`triggerScope:any_ally`。capture group ずれに伴い `他の`/`story`/`効果によって`/action の index を +1 補正。
- エンジン＝`collectFieldTriggers`（BattleScreen.tsx）。(1) ON_PLAY のとき**ルリグも any_ally ウォッチャーに追加**（WDK17-001 は ルリグの【自】。ON_LEAVE_FIELD の既存 lrig watcher 前例に倣う）。(2) `placedPuppet` 条件＝トリガー元 instanceId が `myState.field.puppet_signi` に在中するかで判定（INTERNAL_PLACE_PUPPET が cnPP を puppet_signi に積む＝placedNum と一致）。BLOCK_OWN_SIGNI_AUTO はシグニ限定にしルリグは除外。
- decompiler＝ON_PLAY placedPuppet で `シグニが場に出たとき`→`傀儡状態のシグニが場に出たとき` 置換。逆翻訳「あなたの傀儡状態のシグニが場に出たとき」＝原文一致。
- データ＝effects_misc.json WDK17-001-E1 を `ON_TURN_END`（仮置き）→`ON_PLAY`＋`triggerScope:any_ally`＋`triggerCondition.placedPuppet`（パーサー FRESH と leaf 完全一致）。
- typecheck緑・同型★0（sheet5/grouped 再生成）・**VALUE 15→14・LOSS 0 維持**・⚠実機未検証（puppet 配置→ON_PLAY 収集→lrig watcher 発火の経路）。

## engine: ON_MAIN_PHASE_START（対戦相手のメインフェイズ開始時）1枚（R47・2026-06-28・ymst）

「対戦相手のメインフェイズ開始時、あなたのデッキの一番上を公開する。そのカードが＜バーチャル＞のシグニの場合、…このシグニは【シャドウ】を得る」のトリガーを新設。フェイズ遷移 `GROW→MAIN` で `collectTurnTriggers('ON_MAIN_PHASE_START', …)` を ON_ATTACK_PHASE_START と同じ要領で呼ぶ。`triggerScope:any_opp`（「対戦相手の」）＝非ターンプレイヤー（watcher）の場シグニが、ターンプレイヤーの MAIN 開始に反応＝collectTurnTriggers の既存「相手フィールドシグニ any_opp/any」分岐が拾う（新規ループ不要・低リスク）。

- 型 `ON_MAIN_PHASE_START`（effects.ts）＋collectTurnTriggers の timing union/labelSuffix 追加＋doPhaseAdvance の `phase==='GROW'` 分岐で収集（BattleScreen.tsx）。
- decompiler＝timingJa に `あなたのメインフェイズ開始時`、`triggerScope:any_opp` で `対戦相手のメインフェイズ開始時` に切替、`〔範囲:…〕` フォールバック除外に ON_MAIN_PHASE_START 追加。
- データ＝WXDi-P00-034-E1 を `ON_TURN_END`（誤 flatten）→`ON_MAIN_PHASE_START`＋`triggerScope:any_opp`＋`parseStatus:MANUAL`。action は既存 REVEAL_AND_PICK 近似のまま（シャドウ付与 target は「あなたのシグニ1体」近似＝原文「このシグニ」とは差・別途要改善）。
- typecheck緑・同型★0（sheet7/grouped_all 再生成）・逆翻訳トリガー原文一致・**VALUE 16→15**・⚠実機未検証（GROW→MAIN での any_opp 発火経路）。

## engine: ON_OPP_POWER_DECREASED（毒牙・相手パワー減少時）2枚（R46・2026-06-28・ymst）

「あなたの効果によって対戦相手のシグニのパワーが減ったとき、…このシグニのパワーを減った値と同じだけ＋する」を新設（§3 機構④の毒牙）。`detectPowerDecrease(before,after)`＝`temp_power_mods` が execPowerModify で末尾 append される性質を使い、before.length 以降の新規エントリの負 delta 合計の絶対値＝減少量を算出。`collectPowerDecreaseTriggers`＝減らした側（controller）の場の ON_OPP_POWER_DECREASED【自】を発火（host のシグニが減った→guest が反応／その逆）。`PowerModifyAction.deltaFromOppPowerDecrease` のとき delta を減少量で動的注入（クローン）。

- 型 `ON_OPP_POWER_DECREASED`＋`PowerModifyAction.deltaFromOppPowerDecrease`＋detector/collector＋decompiler（トリガー文＋「減った値と同じだけ＋」action 描画）。
- データ2枚（MANUAL）: WX13-036-E1／WXEX2-52-E1（STUB `REACTIVE_POWER_UP`→POWER_MODIFY thisCardOnly deltaFromOppPowerDecrease）。
- typecheck緑・同型★0・逆翻訳が原文完全一致・⚠実機未検証。VALUE 18→16。**⚠近似**＝①「あなたの効果」限定は未判定（相手自身の自己弱体でも発火しうる）②`temp_power_mods` のみ計上＝UNTIL_OPP_TURN_END 弱体（power_mods_until_opp_turn）は未計上③複数同時減少は合算（per-event ではない）。

## engine: ON_ACCE_ATTACH host条件＋ON_REFRESH＋ON_LEAVE_FIELD leftToZone 計3枚（R45・2026-06-28・ymst）

3機構を連続実装（いずれも MANUAL・typecheck緑・同型★0・逆翻訳原文一致・⚠実機未検証）。VALUE 21→18。

- **R45-1 WXK05-041（ON_ACCE_ATTACH host レベル条件）**: `triggerCondition.accedHostMinLevel`（=4）をアクセカード自身の ON_ACCE_ATTACH パスに追加（host シグニ Level 判定）＋usageLimit once_per_turn 評価を acce-self パスに追加。E2 を ON_ACCE_ATTACH に正配線＋action の targetsTriggerSource no-op を是正（TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST 青→対戦相手シグニ -12000）。E1 も「対戦相手のターン終了時、このシグニを手札に戻す」＝ON_TURN_END turnOwner:opponent＋BOUNCE self thisCardOnly に是正（旧 BOUNCE opponent 誤）。
- **R45-2 WXDi-P04-043（ON_REFRESH）**: `refresh_count_this_turn` の set-diff（`countRefresh`＋`collectRefreshTriggers`・triggerCondition.refreshedOwner）で「いずれかのプレイヤーがリフレッシュしたとき」を新設。effect-resolution ブロックに相乗り。E1（+action targetsTriggerSource no-op 是正→対戦相手シグニ -10000）。⚠近似＝ドローフェイズの過剰ドロー refresh は未検出（効果解決経路のみ）。
- **R45-3 WXK02-041（ON_LEAVE_FIELD leftToZone:'hand'）**: `collectLeaveFieldTriggers` の watcher ループに「離れたカードが所有者の手札に在中する場合のみ発火」判定を内部追加（signature 不変＝`ownerStateAfter.hand` 参照）。`triggerCondition.leftToZone:'hand'`。E2（target を自＜遊具＞シグニに是正）。⚠近似＝triggerScope any でも実装上は離脱カードと同じ側の watcher のみ（既存 collectLeaveFieldTriggers の制約）。

## engine: ON_EXCEED_COST 場シグニ反応（エクシードコスト支払い時）1枚（R44・2026-06-28・ymst）

「あなたがエクシードのコストを支払ったとき」に**場のシグニ/ルリグが反応**する変種を `triggerCondition.exceedCostPaidByPlayer` で新設。既存 ON_EXCEED_COST は exceedPaidCards（コストとして置かれたカード自身）のみ走査だったため、ルリグ起動のエクシード支払いブロック（line ~11960）に「exceedCost>0 のとき自分の場シグニ/ルリグの ON_EXCEED_COST【自】（exceedCostPaidByPlayer のみ）を発火」を追加。turnOwner/usageLimit 評価。既存 exceedPaidCards 走査は `exceedCostPaidByPlayer` を skip して二重発火回避。

- 型 `triggerCondition.exceedCostPaidByPlayer`＋engine 走査追加＋decompiler ラベル。
- データ1枚（MANUAL）: WXDi-P06-078-E1（ON_TURN_END flatten・exceedCostPaidByPlayer:true・turnOwner:self）。**+action実バグ修正**＝conditional.then の POWER_MODIFY が `targetsTriggerSource:true`＋owner:self で、ON_EXCEED_COST にトリガー元が無く autoNum=自カード（相手候補外）→ execPowerModify が短絡 no-op していた。targetsTriggerSource を除去し owner:opponent に是正（STUB TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST の CHOOSE→対象選択が正しく -5000 を適用）。
- typecheck緑・同型★0・逆翻訳がトリガー＋action とも原文一致・⚠実機未検証。VALUE 22→21。**⚠近似**＝アーツ/スペルのカットイン exceed 支払い経路では未発火（ルリグ起動経路のみ）。

## engine: ON_ENERGY_TO_TRASH（エナがトラッシュに置かれたとき）トリガー1枚（R43・2026-06-28・ymst）

「あなたの効果によって対戦相手のエナゾーンからカード１枚がトラッシュに置かれたとき」を**ミル機構と同じ効果解決の set-diff 検出**で新設。`countEnergyToTrash(before,after)`＝`energy`（cardNum）が before にあって after に無く、かつ after.trash に在中する枚数。`collectEnergyToTrashTriggers`＝両プレイヤー場シグニ/ルリグの ON_ENERGY_TO_TRASH【自】を `triggerCondition.energyTrashedOwner`（self/opponent/any）で発生源限定して収集。配線はミル/チャームと同じ統合ブロック（line ~5330）。

- 型 `ON_ENERGY_TO_TRASH`＋`triggerCondition.energyTrashedOwner`＋detector/collector＋decompiler ラベル。
- データ1枚（MANUAL）: WD15-015-E1（ON_TURN_END flatten・energyTrashedOwner:opponent・GRANT_KEYWORD ダブルクラッシュ）。target を `thisCardOnly`（「このシグニは」）に是正。
- typecheck緑・同型★0・逆翻訳が原文トリガー完全一致・⚠実機未検証。VALUE 23→22。**⚠近似**＝「あなたの効果によって」の発生源限定は未表現（効果解決経路で発火＝相手効果による自エナトラッシュも発火しうる）。

## engine: ON_CHARM_TO_TRASH（チャームがトラッシュに置かれたとき）トリガー1枚（R42・2026-06-28・ymst）

「【チャーム】１枚が場からいずれかのトラッシュに置かれたとき」を**ミル機構と同じ効果解決の set-diff 検出**で新設。`countCharmsToTrash(before,after)`＝`signi_charms`（cardNum or null）が before にあって after に無く、かつ after.trash に在中する枚数（チャームは host 離脱時に owner トラッシュへ＝removeFromField で extraTrash 送り）。`collectCharmToTrashTriggers(controllerId,controllerState,otherState,myCharms,oppCharms)`＝両プレイヤー場シグニ/ルリグの ON_CHARM_TO_TRASH【自】を triggerScope（any=どちらの／any_ally=自分の／any_opp=相手の）で絞り収集。usageLimit/activeCondition/condition 評価。配線はミル/デッキ移動と同じ統合ブロック（line ~5330）。

- 型 `ON_CHARM_TO_TRASH`＋detector/collector（BattleScreen）＋decompiler ラベル/scope 主語/scope マーカー抑制を追加。
- データ1枚（MANUAL）: WX16-Re05-E1（ON_TURN_END flatten・action は既に正＝対戦相手シグニ1体 -4000・triggerScope:any）。timing のみ是正。
- typecheck緑・同型★0・逆翻訳が原文トリガー完全一致・⚠実機未検証。VALUE 24→23。**⚠近似**＝①同一解決で複数チャームがトラッシュ送りでも1回のみ発火（per-charm 未対応）②**バトルバニッシュで host が離脱しチャームがトラッシュに行くケースは効果解決経路外で未検出の可能性**（ミルの「コスト払い未検出」と同種の制約）。

## engine: placedFront（正面に配置されたとき）トリガー1枚（R41・2026-06-28・ymst）

「対戦相手のシグニ１体がこのシグニの正面に配置されたとき」を `ON_PLAY`＋`triggerScope:any_opp`＋`triggerCondition.placedFront` で配線。`collectFieldTriggers` の any_opp ループに既存の `frontLowerLevelThanSource`（WX17-075）と同じ正面ゾーン検出（盤面反転 `2-ziHost`）を**レベル条件なし**で相乗り＝最小追加。

- 型 `triggerCondition.placedFront` 追加＋engine 1分岐（collectFieldTriggers）＋decompiler ラベル。
- データ1枚（MANUAL）: WXDi-P03-043-E3＝ON_TURN_END flatten（STUB `POWER_MOD_ON_FRONT_PLACE`）を是正。action＝`POWER_MODIFY targetsTriggerSource`（それ=配置された相手シグニ）-3000 UNTIL_END_OF_TURN・mandatory:false（してもよい）。
- typecheck緑・同型★0・逆翻訳が原文トリガー完全一致・⚠実機未検証。VALUE 25→24。**⚠近似**＝「してもよい」は targetsTriggerSource が無選択自動適用（相手デバフのため実害ほぼなし）。

## engine: opp-draw（対戦相手が引いたとき）トリガー機構＋4枚（R40・2026-06-28・ymst）

「対戦相手が（効果によって）カードを引いたとき」を新設。`triggerScope:'any_opp'`＋`ON_DRAW` で表現し、`collectOppDrawTriggers(reactorId,reactorState,drawerState)` が **drawer の反対側プレイヤー（reactor）**の場シグニ/ルリグの any_opp ON_DRAW【自】を収集。効果ドロー検出ブロック（line ~5297/5304・`cards_drawn_by_effect_this_turn` 増加）に相乗り＝host が効果ドロー→guest が反応／guest→host が反応。位相限定 `triggerCondition.drawPhaseRestriction`（main_attack＝MAIN/ATTACK系サブフェイズ／opp_attack＝ATTACK系サブフェイズ＋!reactorIsTurn）＋turnOwner/usageLimit/activeCondition/condition 評価。`drawByEffect` は逆翻訳「効果によって」表示専用（効果ドロー経路でのみ呼ばれるため暗黙）。

- 型 `triggerCondition.drawPhaseRestriction`/`drawByEffect` 追加＋engine collector＋呼び出し2箇所＋decompiler（any_opp 主語/位相プレフィクス、ON_DRAW を scope マーカー抑制に追加）。
- データ4枚（MANUAL・全 ON_PLAY flatten 誤）: WXDi-P04-038-E1（main_attack・相手手札1捨て・once）／WXDi-P15-091-E1（drawByEffect・自ドロー1・once）／WD22-029-G-E1（opp_attack・相手シグニ1ダウン）／PR-423-E1（main_attack+drawByEffect・ダメージ＋自バニッシュ）。action本体は維持。
- typecheck緑・同型★0・逆翻訳が原文トリガー一致（と/か・効果によって/自分の効果で の軽微差のみ）・⚠実機未検証。VALUE 29→25。**⚠近似**＝「対戦相手が自分の効果で」の発生源プレイヤー限定は未判定（自効果で相手に引かせた場合も発火しうる）／main_attack はターン主体未判定（相手のメイン/アタック中の効果ドロー前提）。

## engine: outsideDrawPhase（ドローフェイズ以外ドロー）トリガー2枚（R39・2026-06-28・ymst）

「ドローフェイズ以外であなたがカードを１枚引いたとき」を **既存 ON_DRAW 機構に triggerCondition を相乗り**させて実装（R36-R38 で確立した低リスク手法）。`collectDrawTriggers` に第4引数 `isDrawPhaseDraw`（既定 false）を追加。ドローフェイズの通常ドロー呼び出し（line ~4230）のみ `true` を渡し、効果ドロー呼び出し（line ~5234/5241・execDraw 経由）は `false`。ループ内で `eff.triggerCondition?.outsideDrawPhase && isDrawPhaseDraw` を skip＝通常ドローでは発火せず効果ドローでのみ発火。

- 型 `triggerCondition.outsideDrawPhase?: boolean` 追加（effects.ts）＋engine 1分岐＋呼び出し1箇所＋decompiler ラベル（ON_DRAW 用）。
- データ2枚（MANUAL・全 triggerScope:self・旧 ON_TURN_END/ON_PLAY flatten 誤）: WXDi-D09-P19-E1（ON_TURN_END誤・《ターン2回》→全自シグニ+1000）／WXDi-P05-062-E1（ON_PLAY誤・《ターン1回》→手札1捨て→ドロー）。action本体は既存の確立済み近似（`CONDITIONAL{IS_MY_TURN}`＝「そうした場合」）を維持＝トリガーのみ是正。
- typecheck緑・同型★0・逆翻訳が原文トリガー一致・⚠実機未検証（効果ドローが実際にドローフェイズ外で起きるか／twice_per_turn の発火回数）。VALUE 31→29（commit 後に計器反映）。残 ON_DRAW は opp-draw 4枚（§4・別機構）。

## engine: ON_SIGNI_FROZEN 新設＋凍結トリガー3枚（R38・2026-06-28・ymst）

「シグニが凍結状態になったとき」を**ミル機構と同じ効果解決の set-diff 検出点**で新設。`detectNewlyFrozen(before,after)`＝`field.signi_frozen` の false→true ゾーンの在中シグニ番号を返す。`collectFreezeTriggers(frozenByOwner,host,guest)`＝両プレイヤー場シグニ/ルリグの `ON_SIGNI_FROZEN`【自】を triggerScope（any_opp 多数派/any_ally/any）で絞り収集し、`triggeringCardNum` に凍結シグニを渡す（「そのシグニ」= targetsTriggerSource 用）。turnOwner/usageLimit《ターン1回》評価。検出はミル/デッキ移動と同じ統合ブロック（line ~5231）に追加。

- 型 `ON_SIGNI_FROZEN`＋detector/collector（BattleScreen）＋decompiler ラベル/scope 主語/〔範囲〕抑制を追加。
- データ3枚（MANUAL・全 any_opp・旧 ON_PLAY/ON_TURN_END 誤）: WX08-039-E1（→相手手札1捨て）／WXEX2-02-E2（→相手手札1捨て）／WXDi-P04-065-E1（→そのシグニ-1000・`targetsTriggerSource` で「そのシグニ」を表現・旧 isFrozen filter 近似を是正）。
- typecheck緑・同型★0・逆翻訳が原文トリガー一致・⚠実機未検証（複数同時凍結時の once_per_turn／凍結のまま移動する稀ケース未対応／targetsTriggerSource の triggeringCardNum 伝播）。VALUE 32→31（flatten 該当は WXDi-P04-065 のみ・他2枚は ON_PLAY 誤 curation で計器外だったが今回正配線＝実質3枚改善）。

---

## engine: ON_SIGNI_POWER_ZERO_OR_LESS 配線＋パワー0以下トリガー5枚（R37・2026-06-28・ymst）

「シグニのパワーが0以下になったとき」を**既存のルール処理点1箇所**で配線（型は既存・収集機構が無かった）。`checkAndBanishPowerZero`（パワー0以下シグニのルールバニッシュ・useEffect 反応）の中で各 0化シグニについて `collectBanishTriggers` と並べて `collectPowerZeroTriggers` を呼ぶ＝**単一フック・低リスク**（既存の collectBanishTriggers と同パターン）。

- `collectPowerZeroTriggers(zeroedCardNum,zeroedOwnerId,host,guest)`＝両プレイヤー場シグニの `ON_SIGNI_POWER_ZERO_OR_LESS`【自】を triggerScope（any_opp 多数派／any_ally／self／any）で絞り収集。`triggerCondition.turnOwner`（《自分ターン》）と usageLimit《ターン1回》（actions_done 照合）も評価。同パス複数同時0化の once_per_turn 重複は effectId dedup で回避。
- decompiler に timingJa＋scope 別主語（any_opp→「対戦相手のシグニのパワーが0以下になったとき」）＋〔範囲〕マーカー抑制を追加。
- データ5枚（MANUAL・全て旧 ON_PLAY/ON_TURN_END 誤 flatten を是正）: WX20-Re03（→デッキ上をエナ）／WX21-067（→ドロー）／WX22-013-E2（→CHOOSE[エナ/ドロー]・action も CHOOSE 再構築）／WXDi-P01-043（→エナチャージ1）／WXDi-P14-009（《自分ターン》→相手-5000・UNTIL_END_OF_TURN）。全て any_opp。
- typecheck緑・同型★0・逆翻訳が原文トリガー一致・⚠実機未検証（特に複数同時0化の dedup／once_per_turn の actions_done 記録タイミング／-5000 連鎖0化の再発火）。VALUE 33→32（flatten 該当は WXDi-P14-009 のみ・他4枚は ON_PLAY 誤 curation で計器外だったが今回正配線＝実質5枚改善）。

---

## データ＋engine小追加: timing flatten 手札捨て/トラッシュ系 2枚（R36・2026-06-28・ymst）

VALUE timing flatten（`ON_TURN_END` 誤 flatten した【自】）を配線済みトリガーで修正（MANUAL）。1枚は純データ・1枚は小エンジン追加（後方互換）。

- **WDA-F02-17-E3（ON_TRASH 手札から・純データ）**: 「このカードが手札からトラッシュに置かれたとき→相手シグニ1体に《青》か《黒》任意払いで-5000」。`collectAnyZoneTrashSelfTriggers(origin:'hand')` が配線済み＝`timing:ON_TRASH`＋`triggerScope:self`＋`triggerCondition.fromZones:["hand"]` に再構築。旧 JSON は POWER_MODIFY target が `owner:self/targetsTriggerSource` の誤りだったため `owner:opponent` に是正。OPTIONAL_COST + CONDITIONAL{IS_MY_TURN} は「そうした場合」の構造プレースホルダ（executor が pay 時 then を直接実行・IS_MY_TURN は実行時非評価）＝維持。逆翻訳が原文一致。⚠E2【自】（あなたの手札からカードがトラッシュ→正面ダウン）は別の未配線機構（場シグニが手札トラッシュを監視）で別バグ＝今回スコープ外（TODO §3.5 へ）。
- **WXDi-CP02-082（ON_HAND_DISCARDED ＜ブルアカ＞・E1/E2 分割＋engine 小追加）**: 旧 JSON は2つの【自】【絆自】を1つの ON_TURN_END SEQUENCE に flatten し story:ブルアカ を POWER_MODIFY target に誤配置していた。**E1**（あなたのターン）＝`turnOwner:self`＋`triggerFilter.story:ブルアカ`＋POWER_MODIFY 相手 -3000（target の story 誤配置を除去）。**E2**（【絆自】対戦相手のターン）＝`turnOwner:opponent`＋同 triggerFilter＋DRAW。`collectHandDiscardTriggers` のターンゲートに `triggerCondition.turnOwner==='opponent'` 分岐を追加（相手ターン=!myIsTurn のみ発火・未指定/self は従来どおり自ターン＝後方互換）。逆翻訳が E1/E2 とも原文トリガー一致。⚠近似＝「コストか効果によって」限定未表現・絆条件は engine 未ゲート（全 AUTO 同様）・相手ターン手札捨ての発火経路は実機未検証。
- typecheck緑・同型★0・逆翻訳一致・⚠実機未検証。VALUE 35→33。

---

## engine: ON_CARD_MOVED_TO_DECK 機構＋デッキ移動 flatten 4枚（R35・2026-06-28・ymst）

「カードが効果によってデッキに移動したとき」を**ミル機構の鏡像**で新設（set-diff 検出）。`countMovedToDeck(before,after,fromTrashOnly)`＝`after.deck \ before.deck`（fromTrashOnly 時は解決前トラッシュ起点に限定）。`collectMoveToDeckTriggers`＝controller の場シグニ/ルリグの `ON_CARD_MOVED_TO_DECK`【自】を `triggerCondition.movedToDeckOwner`（self/opponent/any）/`movedToDeckMinCount`/`movedToDeckFromTrash` で限定収集。検出はミルと同じ効果解決点（1箇所）。

- 型 union＋triggerCondition 3フィールド＋collector/detector（BattleScreen）＋decompiler ラベル/条件描画を追加。
- データ4枚（POWER_MODIFY クリーン・MANUAL）: WX09-020-E1（自トラッシュ→自デッキ1枚・相手-2000）／WX22-014-E2（自トラッシュ→自デッキ4枚以上・相手-8000・once）／WXK10-076-E1（相手カード→相手デッキ・相手-1000・twice）／WDK09-013-E1（相手カード→相手デッキ・相手-2000）。
- typecheck緑・同型★0・逆翻訳が原文トリガー一致・⚠実機未検証。VALUE 39→35。⚠近似＝発生源限定（効果1つ/悪魔等）未表現・解決単位 delta（複数効果跨ぎ累積は未対応・ミルと同様）。

---

## データ: timing flatten ON_SELF_REVEAL_FROM_HAND 1＋ON_DISCARDED_AS_COST 1（R34・2026-06-28・ymst）

配線済みトリガー2種で flatten 2枚を修正（MANUAL）。

- **WXK04-055（ON_SELF_REVEAL_FROM_HAND・G198 配線済み）**: E2「自分の効果で手札公開時→すべての＜水獣＞+2000」。timing 修正に加え **E1【常】・E2 とも target が lossy**（owner:any count:1＝「自分または対戦相手のシグニ1体」）だったため両方を canonical `{owner:self,count:ALL,filter:{cardType:シグニ,story:水獣}}` に是正（E1 も MANUAL）。逆翻訳が E1/E2 とも原文完全一致。⚠ON_SELF_REVEAL_FROM_HAND 収集は usageLimit 未チェック＝《ターン1回》は公開ごと発火の近似。
- **WX25-P3-071-E2（ON_DISCARDED_AS_COST 配線済み）**: 「＜微菌＞シグニの【出】【起】コストとしてこのカードが捨てられたとき→相手能力消失」。`collectHandDiscardTriggers` asCost が捨てられたカード自身の ON_DISCARDED_AS_COST を発火（シグニ能力コスト捨てに限定済み）。⚠「微菌 signi の出/起」限定は未判定＝任意シグニ能力コストで発火の近似。
- typecheck緑・同型★0・逆翻訳一致・⚠実機未検証。VALUE 41→39。

---

## engine: ON_OPP_VIRUS_PLACED 追加＋ウィルス配置/除去 flatten 4枚（R33・2026-06-28・ymst）

timing flatten のウィルス系4枚を配線。`ON_OPP_VIRUS_REMOVED`/`ON_OPP_VIRUS_CHANGED` は型・`collectSelfEventTriggers`・呼び出し（virus flag useEffect）が既に配線済みで**コメントに WD19-009/WX21-030 を名指ししていたのに JSON が未配線**だった＝データ修正のみ。「置かれたとき」専用が無かったため `ON_OPP_VIRUS_PLACED` を新設（`opp_virus_placed_just` フラグ・`placed` 時に collectSelfEventTriggers 呼び出し追加）。

- 型 union（effects.ts）＋collectSelfEventTriggers timing 引数＋呼び出し（`if(placed)`）＋decompiler ラベル3種を追加。
- データ4枚（POWER_MODIFY はクリーン・timing のみ修正・MANUAL）: WX19-079（置かれた→相手-2000・PLACED）／WX21-030（置く/除去→相手-5000・CHANGED）／WX21-068（除去→相手-2000・REMOVED）／WD19-009（除去→相手-5000・REMOVED・once）。
- typecheck緑・同型★0・逆翻訳が原文トリガー完全一致・⚠実機未検証。VALUE 45→41。

---

## データ: timing flatten ON_DRAW（効果ドロー）2＋ON_HAND_DISCARDED（ディソナ捨て）1（2026-06-28・ymst）

VALUE timing flatten（`ON_TURN_END` へ誤 flatten した【自】3枚）を**既存配線**で修正（新機構不要・MANUAL ロック）。いずれも parser は ON_PLAY を出すが triggerScope/Condition を欠き両誤＝per-card 再構築。

- **ON_DRAW（自分の効果ドロー・2枚）**: `collectDrawTriggers` は効果ドロー時のみ呼ばれ通常ドローでは非発火（triggerScope:self）。WXK10-025-E1「効果1つによって引いたとき→相手シグニ-4000」＝`ON_DRAW`＋scope self（twice_per_turn 維持）。WXK10-040-E1「あなたのターンの間、効果で引いたとき→このシグニ+1000」＝`ON_DRAW`＋scope self＋`triggerCondition.turnOwner:self`＋`target.filter.thisCardOnly`（POWER_MODIFY は target.filter.thisCardOnly を解決＝effectExecutor:417）。
- **ON_HAND_DISCARDED（ディソナ捨て・1枚）**: `collectHandDiscardTriggers` は triggerFilter で捨てカードを照合＋scope self は discarder の自ターンのみ発火。WXDi-P12-048-E1「あなたのターンの間、《ディソナアイコン》のカードを捨てたとき→相手シグニ-3000」＝`ON_HAND_DISCARDED`＋scope self＋`triggerFilter.isDisona`（matchesFilter が CSV Story==='Dissona' を判定・execUtils:280）。⚠decompiler は ON_HAND_DISCARDED の triggerFilter 未描画（逆翻訳に「ディソナ」が出ない）＝データ/engine は正・表示のみ未対応。
- typecheck緑・同型★0・WXK10 逆翻訳原文一致・⚠実機未検証（§TODO5）。timing flatten 残 ≈45。

---

## engine: placedFromTrash 機構＋トラッシュから場出し6枚（2026-06-28・ymst）

「シグニがトラッシュから場に出たとき」を配線。triggerCondition に `placedFromTrash` を新設し、ミル機構と同じ **set-diff** で配置元を判定（配置されたインスタンスが解決前トラッシュにあったか＝`bs.{host,guest}_state.trash` に含まれるか）。

- `collectFieldTriggers` opts に `placedFromTrash` 追加＋any_ally ON_PLAY で `triggerCondition.placedFromTrash` を判定。ON_PLAY 検出ブロック（通常5092・resume5630）で `detectPlacedSigni` の各 placedNum がトラッシュ起点かを set-diff で渡す。
- データ6枚: WX03-020（自全+2000）／WX12-023（相手-7000）／WX14-018（相手-5000）／WXDi-P07-047（自ターン・相手-3000）／WXDi-P09-080（このシグニ+4000）／WDK06-C11（＜武勇＞・武勇を target→triggerFilter 移動・相手-3000）。
- decompiler に ON_PLAY+placedFromTrash 描画追加。typecheck緑・同型★0・逆翻訳原文一致・lint 0。⚠実機未検証。timing flatten 残 ≈42。

---

## engine: triggerFilter hasCrossIcon/hasRiseIcon 追加＋クロス/ライズ場出し6枚（2026-06-28・ymst）

「《クロスアイコン》/《ライズアイコン》を持つシグニが場に出たとき」を配線。`matchesFilter`（execUtils）に triggerFilter フィールド `hasCrossIcon`（EffectText が《クロスアイコン》で始まる・`cardHasCrossIcon` と同基準）／`hasRiseIcon`（EffectText に【ライズ】を含む）を追加。既存 `collectFieldTriggers` ON_PLAY any_ally が entering signi を triggerFilter で照合するため、データ側で triggerFilter を付けるだけで発火。

- クロス4: WX07-002（シグニ+2000）／WX07-004（自全+2000）／WX07-005（相手-2000）／WX08-001（《赤赤》払い→アサシン）。
- ライズ2: WX16-026（3択CHOOSE）／WX22-Re01（このシグニ+4000・thisCardOnly・ターン2回）。
- decompiler に ON_PLAY+hasCrossIcon/hasRiseIcon 描画追加。typecheck緑・同型★0・逆翻訳原文一致・lint 0。⚠実機未検証。timing flatten 残 ≈48。

---

## データ: timing flatten「場に出たとき」Group A 6枚（既存 ON_PLAY any_ally/any_opp）（2026-06-28・ymst）

「シグニが場に出たとき」系のうち、既存 `collectFieldTriggers`（ON_PLAY・any_ally/any_opp＋標準 triggerFilter）で配線できる Group A を修正（新機構不要）。

- **レゾナ場出し**（any_ally＋triggerFilter cardType:レゾナ）: WX08-004（自ターン・相手-7000）／WX08-031（相手全-5000）／WXEX1-04（自ターン・3択CHOOSE）。
- **アーム場出し**（any_ally＋story:アーム）: WXDi-P03-086（相手-2000）。
- **偶数レベル場出し**（any_ally＋levelParity:even）: WXK03-028（相手-3000）。
- **相手シグニ効果場出し**（any_opp＋byEffect＋REMOVE_ABILITIES.targetsTriggerSource）: WXEX2-29（そのシグニ能力喪失。⚠原文の「凍結」は未表現＝近似）。
- typecheck緑・同型★0・逆翻訳原文一致・lint 0。⚠実機未検証（特にレゾナ場出しが ON_PLAY any_ally を発火するか要確認・false-negative でも現状 no-op と同等で無害）。
- **⛔ 残「場に出たとき」（support 追加が要る・TODO §3.5）**: クロスアイコン4／ライズアイコン2＝triggerFilter に hasCrossIcon/hasRiseIcon 追加要／トラッシュから場出し7＝placedFromTrash 条件（配置元=トラッシュ検出）要／傀儡状態1＝傀儡フィルタ要。

---

## データ: timing flatten 配線済みクラスタ9枚（ON_EXCEED_COST/ON_ACCE/ON_HAND_DISCARDED）（2026-06-28・ymst）

既に engine 配線済みのトリガーへ timing を差し替えるデータ修正（新機構不要）。

- **ON_EXCEED_COST**（11427配線）: WX11-014-E1（ダブクラ付与）・WXDi-P04-025-E2（相手-2000）。
- **ON_ACCE_ATTACH**（ルリグ・10987）: WXK04-003-E1（オーバークロック3択CHOOSE）。**ON_ACCE**（シグニ・10963）: WXK05-064-E1（相手-3000）。
- **ON_HAND_DISCARDED**（6246配線・triggerFilter で捨て札クラス照合）: WXDi-P10-058（プリパラ捨て→自プリパラ+2000）・WX24-P1-059（このシグニ+4000）・WX24-P1-084（宝石捨て・宝石を target→triggerFilter へ移動）・WXK01-082（相手-4000・ターン2回）・WXK11-054（自全赤+2000）。
- decompiler に ON_EXCEED_COST/ON_ACCE_ATTACH の timingJa＋ON_HAND_DISCARDED の triggerFilter（捨て札クラス）描画を追加。
- typecheck緑・同型★0・逆翻訳原文一致・lint 0。⚠ON_ACCE シグニ収集（10963）は usageLimit 未enforce（WXK05-064 のターン2回はデータ正・engine 側別途）。timing flatten 残 ≈60。

---

## engine: ON_CARD_MILLED_FROM_DECK 新規配線（デッキミル機構）＋12枚（2026-06-28・ymst）

未配線トリガー「デッキからカードがトラッシュに置かれたとき」を engine 実装。**各 mill 経路（MILL/TRASH-DECK_CARD 等）を instrument せず、効果解決の前後 state を set-diff してミル枚数を精密算出**するアプローチ（インスタンスID一意＝`before.deck ∩ after.trash − before.trash`）。

- **型**: triggerCondition に `milledDeckOwner`（self/opponent/any）＋`milledMinCount`。`ON_CARD_MILLED_FROM_DECK` は timing 既存。decompiler の `engineUnwiredTimings` から除外＋owner/枚数描画。
- **検出**: `countMilledFromDeck(before, after)`（set-diff）でホスト/ゲスト各デッキのミル枚数を算出。ドロー検出ブロック直後で、両プレイヤーを controller として `collectMillTriggers` 収集（milledDeckOwner を controller 視点で self/opponent/any 判定・milledMinCount 以上・usageLimit・activeCondition・condition 評価）。ターンカウンタ不要（解決単位の delta＝usageLimit は actions_done でターン境界リセット済み）。
- **データ12枚**を ON_TURN_END→ON_CARD_MILLED_FROM_DECK 再curate＋MANUAL。WXDi-P07-093（自1→このシグニ+5000）／WXK01-065（自1→全トリック+2000）／WXK02-059（自1→武勇1体+4000）／WXK03-027（自3→相手-5000）／WXK09-056（自1・ターン2回）／WXK10-052・WX24-P3-087・WXDi-P08-079（自・合計2近似）／WXEX1-49（自3→エナチャージ+相手-8000・欠落-8000補完）／WXDi-CP02-010（any3→相手全-3000）／WXDi-P13-085（相手1）／WX24-P4-088（any1→このシグニ+4000）。
- **⚠近似（TODO §3.5 記録）**: 原因限定（効果/コスト/＜悪魔＞シグニ/《ディソナ》カード/＜龍獣＞ミルカードフィルタ）は未表現／「合計N枚」は解決単位の delta で近似（複数効果跨ぎの累積は未対応）／コスト払いミルは効果解決経路外のため未検出の可能性。
- typecheck緑・同型★0・逆翻訳原文一致・lint 0。⚠実機未検証。timing flatten 残 ≈69。

---

## engine: ON_RISE 新規配線＋timing flatten ライズクラスタ6効果（2026-06-28・ymst）

未配線トリガー「このシグニがライズされたとき」を engine 実装。

- **型**: `effects.ts` timing union に `ON_RISE`＋triggerCondition に `risedOntoNameContains`（特定名カードにライズ限定）追加。decompiler timingJa＋risedOntoNameContains 描画。
- **配線**: `handleSummonSigni`（BattleScreen）のライズ配置分岐（`isRise`）後に、ライズされたシグニ自身（cardNum）の ON_RISE【自】を収集して mandatory entries に合流。triggerScope:self／activeCondition 評価／`risedOntoNameContains` は下に置かれた元シグニ（existingZoneStack.at(-1)）の CardName で判定。empty-check を ownEntries.length ベースに変更（rise エントリも考慮）。
- **データ**: 6効果を timing:ON_TURN_END→ON_RISE 再curate＋MANUAL。「このシグニ/そのシグニ」=thisCardOnly（WX16-037 バニッシュ保護／WX16-039 ダブクラ／WX20-056-E1・WD17-011 +3000）。WX17-054=自全シグニ+2000。WX20-056-E2=《オダノブ》ライズ限定（risedOntoNameContains）＋既存 STUB `RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY`（実装済）維持。
- typecheck緑・同型★0・逆翻訳原文一致。⚠実機未検証＋⚠CPU 召喚経路のライズは未収集（人間召喚経路のみ）。timing flatten 残 ≈81。

---

## engine: ON_ARTS_USE 新規配線＋timing flatten アーツ使用クラスタ5枚（2026-06-28・ymst）

未配線トリガー「あなたがアーツを使用したとき」を engine 実装。**`ON_SPELL_USE` のアーツ版**＝既存 `ON_OPP_ARTS_USE`（相手アーツ使用）の裏で、使用者自身のトリガーを収集する `ON_ARTS_USE` を新設。

- **型**: `effects.ts` timing union に `ON_ARTS_USE` 追加。
- **収集**: `collectArtsUseTriggers(casterId, casterState, opState, isCasterTurn)`（BattleScreen・collectOppArtsUseTriggers 直後）＝caster のセンタールリグ＋場シグニを走査。triggerScope:self／usageLimit（《ターン1回/2回》＝actions_done 出現回数）／activeCondition／condition を ON_SPELL_USE と同様に評価。
- **配線点**: アーツ解決後ブロック（`entryCardType === 'アーツ'`）で、`entry.playerId === user.id`（=自分が使用）の場合のみ収集＝ON_OPP_ARTS_USE（`!== user.id`）と裏表で二重押し防止。usedIds を caster の actions_done に永続化。
- **データ**: 5枚を timing:ON_TURN_END→ON_ARTS_USE に再curate＋target 是正＋MANUAL。WXK01-059-E2／WDK03-011-E1（自全＜怪異＞へ）＝self/ALL/story:怪異。WXK05-042/WXK10-046＝無指定「シグニ1体」any/1。WDK03-017＝「このシグニ」thisCardOnly。
- typecheck緑・同型★0・逆翻訳原文一致。⚠実機未検証（アーツ使用→自トリガー発火）。timing flatten 残 ≈87。

---

## データ: VALUE curation R1-R4＝小バケツ整理＋timing flatten 実バグ発見（VALUE 159→107）（2026-06-28・ymst）

LOSS 0 達成後、held の残り＝VALUE（EXIST≠FRESH の値違い・leaf 喪失なし）159枚を `scripts/_valueTriage.ts`（新設・EXIST/FRESH 変更リーフ一覧）で1枚ずつ triage。**判定原則＝①FRESH/manual が正で JSON stale＝resync（実バグ修正）②EXIST 正で parser 退化＝MANUAL-lock（metadata のみ・挙動不変）③両方 lossy 近似＝EXIST ロック＋TODO に機構待ち記録**。

- **R1 owner 7**: resync1（WXK05-023＝無指定「シグニ1体」バニッシュは any 正・EXIST=self 過小）＋MANUAL6（「あなたの」「対戦相手のデッキ」を parser が誤）。
- **R2 小バケツ10**（count/then/action.type/effectType/action.id/mandatory）: resync4（WDK08-L13＝「あなたの血晶武装シグニは」self/ALL／WXK08-044＝mandatory true／WXK04-044＝CONTINUOUS UP 誤訳→AUTO ON_SIGNI_BANISH_BATTLE／WXK06-041＝activeCondition TURN_OWNER:opponent 補完）＋MANUAL6（アクセホスト付与 count=1／split_top_bottom／FORCE_FRONT）。
- **R3 parseStatus/then 20**: resync12（manual 定義は MANUAL だが JSON が AUTO の stale ラベル整合）＋MANUAL8（内側 quoted ability の MANUAL 維持4／「対戦相手は」誤2／STUB近似ロック2＝WDK08-Y12・WX24-P2-048 は OPTIONAL_COST↔TARGET_AND_DISCARD_HAND の機構待ち）。
- **R4 timing 小グループ15**: MANUAL13（EXIST が具体トリガー＝ON_HAND_DISCARDED/ON_SELF_REVEAL_FROM_HAND/ON_BECOME_BEAT/ON_SIGNI_BECOMES_DRIVE を持ち parser が ON_PLAY に退化）＋resync2（MAIN→ATTACK_ARTS＝《アタックフェイズアイコン》明示で FRESH 正）。
- **⚠ 重大発見＝timing flatten 102枚（実バグ・残 VALUE の本丸）**: `timing:ON_TURN_END` だが action は `duration:UNTIL_END_OF_TURN` の【自】。原文トリガー「〜したとき」（場出し/ヘブン/スペル使用/ライズ/ウィルス/レゾナ 等）を丸ごと落として flatten＝**ターン終了時に付与し即失効＝実質 no-op**。parser の ON_PLAY も scope/filter 欠で誤＝resync 不可。**per-card で trigger 再構築＋engine 配線確認が要る**＝`TODO.md` §3.5 に手順登録。⛔bulk禁止。

全ラウンド typecheck緑・同型★0維持。runtime 変更は resync 分のみ（実バグ修正）。

---

## engine: R31＝drawBySourceStory トリガー実装＋WX20-026 配線（LOSS 1→0・worklist 完了🎉）（2026-06-28・ymst）

最後の LOSS 1枚 WX20-026-E3「【自】：あなたの場にある＜凶蟲＞のシグニの効果であなたがカードを１枚引いたとき、対戦相手のシグニ１体を対象とし、ターン終了時まで、それのパワーを－4000する」を配線。**ドローの「原因カードのクラス」を追跡する新トリガー条件 `drawBySourceStory` を実装**：

- **型**：`triggerCondition.drawBySourceStory?: string`（effects.ts）。「このドローの原因が、指定＜story＞のシグニの効果である場合のみ ON_DRAW を発火」。`PlayerState.last_effect_draw_source?: string`（index.ts）＝直近の効果ドローの原因カード番号。
- **記録**：`execDraw`（effectExecutor.ts:74）が実際に引いた場合（canDraw>0）のみ `last_effect_draw_source = ctx.sourceCardNum` を記録。
- **判定**：`collectDrawTriggers`（BattleScreen:3874）に `drawBySourceStory` ガードを追加＝`last_effect_draw_source` のカードが シグニ かつ CardClass に指定 story を含む場合のみ通す。WX20-026 は自身が＜凶蟲＞シグニで E1/E2 の自前ドローが原因＝発火する。
- **リセット境界**：ドロー検出（4951）は `cards_drawn_by_effect_this_turn` 増加比較で、その直後に `last_effect_draw_source` を読むため**常に最新の原因が反映**（execDraw が直前に上書き）。誤発火対策＝①ドローフェイズ通常ドロー（drawCards 経由・効果ドローではない）で `last_effect_draw_source:undefined` にクリア（直後の collectDrawTriggers が前ターン残値で誤発火しないように）②ターン境界リセット2箇所（4115/4413・`cards_drawn_by_effect_this_turn` と同位置）でも undefined。CPU 通常ドロー（9363）は collectDrawTriggers を呼ばない＝誤発火経路なし。
- **データ再curate**：WX20-026-E3＝`ON_DRAW`＋`triggerCondition:{drawBySourceStory:'凶蟲'}`＋target は単に `{SIGNI,opponent,1}`（旧 EXIST は story:凶蟲 を**ターゲット側**に誤付与＝対象を凶蟲に絞っていた／本来は原因の限定）＋MANUAL。旧 `ON_TURN_END` 代用を解消。decompiler に ON_DRAW+drawBySourceStory の描画を追加（逆翻訳が原文トリガー完全一致）。
- typecheck緑・同型★0維持・逆翻訳原文一致。⚠ドローのホットパス＋state ライフサイクルのため**実機未検証**（PvP で＜凶蟲＞シグニ自前ドロー→相手シグニ−4000、通常ドローや別カード効果ドローでは非発火、を要確認）。
- **🎉 これで held の LOSS 255→0。パーサー整合ワークリスト完了。** 残 held 159 は全て VALUE（値違い＝慣例/1件ずつ判断・bulk禁止）＝P1 最終フェーズの curation レビュー案件。

---

## engine: R30＝REMOVE_ABILITIES targetsTriggerSource 追加＋WXK10-022 配線（LOSS 2→1）（2026-06-28・ymst）

WXK10-022-E1「【自】：あなたのターンの間、対戦相手のシグニ１体が場に出たとき、ターン終了時まで、そのシグニは能力を失う」を配線。**当初 TODO に「`ON_OPPONENT_SIGNI_PLAY` が未配線」と書いたが、調査の結果 新 timing は不要で既存機構で表現できると判明**：

- **`collectFieldTriggers`（BattleScreen:5687 opState ループ）が既に「相手シグニ配置時に自分のシグニが反応」を `timing:ON_PLAY`＋`triggerScope:any_opp`/`any` で収集**（通常召喚 6280 でも呼ばれる）。entry に `triggeringCardNum`（＝場に出たシグニ）を持たせ、executor ctx.triggeringCardNum へ渡る（4822）。
- **`effectStack.turnGateOk`（effectStack.ts:8）が `triggerCondition.turnOwner` を全エントリに集約適用**＝「あなたのターンの間」は `turnOwner:'self'` を立てるだけで効く（collectFieldTriggers 改変不要）。
- **engine 追加は1点のみ**＝`execRemoveAbilities` に `targetsTriggerSource` ハンドラ（ctx.triggeringCardNum→そのシグニの abilities_removed 追加・既存 UP/GRANT/BANISH と同パターン）。型 `RemoveAbilitiesAction` に `targetsTriggerSource?` を追加。
- **データ再curate**：WXK10-022-E1＝`ON_PLAY`＋`triggerScope:any_opp`＋`triggerCondition:{turnOwner:self}`＋`action.targetsTriggerSource:true`＋MANUAL。旧 `ON_TURN_END` 代用を解消。
- typecheck緑。⚠ヘッドレス検証不可＝**実機未検証**（any_opp+ON_PLAY 経路は現状このカードのみ使用＝万一の不具合も本カードに限局）。
- **残 LOSS 1＝WX20-026-E3**（最後の1枚）：draw-source-class 追跡という別機構が要る（`TODO.md` §3 に設計詳細）。ホットパス＋state ライフサイクルが微妙でヘッドレス不可のため、blind 実装は見送り＝実機テスト前提の慎重実装案件。

---

## データ: R29＝残 LOSS 6枚を個別対応（6→2・worklist 実質完了）（2026-06-28・ymst）

R28 で除外した「EXIST誤り/FRESH優位/曖昧」な残 LOSS 6枚を engine 実装を確認しながら1枚ずつ処理。**4枚を実修正/MANUAL化（LOSS 6→2）**。残2はデータ不能の engine 配線案件。

- **WDK08-L14＝resync**：`INTERNAL_KIYOHIME_CHOOSE` は engine 実装済み（execStubPart3.ts:2935・血晶武装で1→3回ループ）。旧JSONは `CHOOSE from3/choose1` 固定で「武装中3つまで・重複可」を欠落。manualEffects 定義（STUB）へ resync。
- **WXDi-D09-P18-E1＝activeCondition 付与**：「覚醒状態であるかぎり+3000」の `activeCondition:{IS_SELF_AWAKENED}` が欠落し +3000 が無条件適用（過大）になっていた。付与＋target `thisCardOnly`。engine は `IS_SELF_AWAKENED`（effectEngine.ts:248 が `awakened_signi` を参照）↔`AWAKEN_SIGNI`（E2 が `awakened_signi` に push）の連動を確認。MANUAL化（granted ability は別途・未表現）。
- **SP27-016-E1 choice①＝SEARCH 再構築**：「デッキから共通色カードを2枚まで探してエナに置きシャッフル」が `SHUFFLE_DECK`＋colorMatchesLrig の lossy 近似に退化。canonical（WX20-006）に倣い `SEARCH(deck,colorMatchesLrig,maxCount2,upToTarget)→ADD_TO_ENERGY→afterSearch SHUFFLE_DECK` に再構築。MANUAL化。
- **WXK05-030＝MANUAL化（EXIST 正と判明）**：【常】：【マルチエナ】は engine が**印字テキスト検出**（execUtils.ts:313 `EffectText.includes('：【マルチエナ】')`）で機能。E1 の `RULE_REMINDER_TEXT` は「印字で処理済み」の妥当なプレースホルダ＝機能的に正。FRESH の SEQUENCE 内 GRANT_KEYWORD は `selfGrant` 検出（CONTINUOUS限定）に掛からず劣る。EXIST を MANUAL化。
- **⚠残 LOSS 2＝engine トリガー未配線（データ不能・TODO.md §3 機構④へ登録）**：①WXK10-022-E1（「対戦相手のシグニが場に出たとき」＝`ON_OPPONENT_SIGNI_PLAY` 型は存在するが engine 未配線・JSON未使用。現 ON_TURN_END 代用は誤）②WX20-026-E3（「自＜凶蟲＞シグニの効果で引いたとき」＝source-class 付き ON_DRAW trigger が無い。現 ON_TURN_END 代用は誤）。

---

## データ: R28＝LOOK/REVEAL 一族61枚を MANUAL化（LOSS 67→6・worklist ほぼ完了）（2026-06-28・ymst）

**エンジン調査が決め手**：`execRevealAndPick` は「公開→フィルタ→○枚ピック→`then`(手札/場/エナに加える)＋残り下」を完全実装。`execLookAndReorder` は**見て並べ替えてデッキに戻すだけで `then`(取得)を持たない**。→ 両者は別メカニクスで、「N枚見てその中から手札等に加える」take系は **REVEAL_AND_PICK が唯一の正**。残 LOSS の LOOK/REVEAL 一族は EXIST が概ね正しく `REVEAL_AND_PICK`/`LOOK_PICK_CHAIN`/`LOOK_AND_REORDER+CONDITIONAL(DECK_TOP_MATCHES)` でcurateされ、パーサーが共通文法から型を判別できず `LOOK_AND_REORDER` に割れて flag されていただけ（R14 のとおりパーサー surgical は +105 退行で不可）。→ **canonical を REVEAL_AND_PICK と確定し、61枚を MANUAL化**（runtime不変・構造完全一致）。**LOSS 67→6／held 226→165**。

- **MANUAL化 61枚**＝action.type 57（LOOK/REVEAL）＋filter.cardType 3（WX24-P1-020/WX25-P1-037/WX25-P3-040＝REVEAL_AND_PICK）＋PR-457（E2 の SEARCH+colorMatchesLrig 脱落）。
- **⚠残 LOSS 6枚＝個別判断（bulk不可）**：WX20-026-E3／WXK05-030（FRESH優位だが各々難あり＝過剰発火・bundle乱れ）／WXDi-D09-P18／WXK10-022-E1（EXIST/FRESH ともに誤＝覚醒 activeCondition 欠落・ON_PLACE系トリガー穴）／SP27-016（lossy choice 近似）／WDK08-L14（FRESH=manual STUB・engine確認待ち）。VALUE 最終レビューに合流予定。
- **📌 統計の参考**：`scripts/_lr.ts` 計測で REVEAL_AND_PICK 217／LOOK_PICK_CHAIN 13／LOOK_AND_REORDER 448（うち最大252枚はテキストが「その中から…手札/場/エナに加える」take系＝engine が取得を実装しない疑い・要精査の別軸品質課題。複数効果カードの誤検出を含む粗い上限）。

---

## データ: R27＝action.type バケツの非LOOK/REVEAL hard-tail 17枚を MANUAL化（2026-06-28・ymst）

action.type バケツ76枚を全数 dry-run。**大半（~59枚）は LOOK/REVEAL 一族**＝EXIST の `REVEAL_AND_PICK`/`LOOK_PICK_CHAIN`/`LOOK_AND_REORDER+CONDITIONAL(DECK_TOP_MATCHES)` に対し FRESH が `REVEAL_AND_PICK`↔`LOOK_AND_REORDER` のどちらかに割れる（R14 で判明した curation 不整合）。これらは触らず bulk 正規化送り。**「EXIST 正・FRESH 退化」かつ LOOK/REVEAL を含まない17枚のみ MANUAL化**。差分effectのみ・runtime不変・構造完全一致を検証。**LOSS 84→67（−17）／held 243→226**。

- **①CHOOSE 構造を FRESH が潰した**：WXK07-069／WDK01-020／WDK08-L20（「①対象シグニをトラッシュ→相手バニッシュ ②エナチャージ」の2択 CHOOSE を FRESH が `BANISH` 単体に崩壊）／WXK09-006（3択の c1 COST_INCREASE×2・c2 CONDITIONAL(手札0) を FRESH が STUB/単純 BANISH に退化）。
- **②「代わりに」CONDITIONAL then/else**：WXDi-P01-085／WXDi-P06-079（「－N。トラッシュ15枚以上なら代わりに－M」を EXIST は then/else で表現＝排他、FRESH は －N → CONDITIONAL(+−M) の逐次＝**二重適用バグ**）。
- **③CONDITIONAL/cost/条件の脱落**：WX03-046（power≥15000）／WX04-025（opponentSelects＋field=0）／WX11-021（c1 LIFE_CRASHED）／WX18-063・WX18-064・WXDi-P16-065（LIFE_CRASHED）／WX24-P2-070（HAS_CARD(龍獣) 条件を FRESH が誤って target filter に merge）／WX25-P3-062（OPTIONAL_TRASH→誤 STUB＋両者−20000＋ハナレ条件脱落）／WD21-011（life=0 条件）／WDK14-013（beat cost＋4枚条件）／SPDi43-31（DECK_TOP level1/2/3 分岐3つ・両側 LOOK_AND_REORDER で REVEAL 曖昧性なし）。
- **⚠保留（次フェーズ送り）**：WDK08-L14（FRESH=manual STUB `INTERNAL_KIYOHIME_CHOOSE`＝EXIST の CHOOSE3 より intended だが engine 実装未確認で resync 保留）／WXK10-022（E3 が LOOK/REVEAL・E1 timing が ON_TURN_END↔ON_PLAY で両者不正確）。
- **🚩 マイルストーン**：1枚ずつの MANUAL化/resync で削れる LOSS は出し切り。残 LOSS 67 はほぼ LOOK/REVEAL bulk正規化案件（REVEAL_AND_PICK と LOOK_AND_REORDER の canonical を決める設計判断＝VALUE 最終 bulk と同性質）。

---

## データ: R26＝filter（その他）バケツ21枚を全 parseStatus:MANUAL 化（2026-06-28・ymst）

filter（その他）バケツ全21枚を1枚ずつ dry-run。**全て「EXIST 正・FRESH 退化」の hard-tail**（stale/FRESH 優位なし・LOOK/REVEAL 構造問題なし）と判明し MANUAL化。差分effectのみ・runtime不変・構造完全一致を検証。**LOSS 105→84（−21）／held 264→243**。

- **脱落していた filter 詳細（FRESH が落とす leaf）**：`acceHost`（「これにアクセされているシグニ」＝WX17-033/WXK04-080/082/WXDi-P09-TK01A/WD18-013/015）、`cardClass`（調理/水獣/電機）、`level`（≤2/≤3）、`levelLteDiscardSigni`（「この方法で捨てたシグニのレベル以下」＝WX22-046/WXK10-044）、`eachDistinctColor`+`nonColorless`（「それぞれ共通する色を持たず無色ではない」＝WXDi-P02-031/P13-034）、`commonClass`（「共通するクラスを持つ」＝WXDi-P10-029/CP01-020/CP02-046）、`keyword`（アサシン等＝WX24-P3-032）、`powerRange`（WXDi-P10-056/WX24-P2-068）、`filter.excludeSelf`（WXDi-CP02-051）。
- **timing 穴も併発**：WXK05-066/067 は `ON_ACCE`（アクセが付いたとき）が timing 検出無く `ON_PLAY`＋owner 誤り（self）に退化。
- **STUB 退化**：WXDi-P10-056/WX24-P2-068 は EXIST の `OPTIONAL_TRASH_ENERGY_CLASS` が FRESH では無関係な `TARGET_AND_DISCARD_HAND` に化ける。
- WX24-P3-032 は CHOOSE だが**構造は EXIST/FRESH 完全一致**（c1 の filter.keyword のみ脱落）＝R14 が警告した CHOOSE 構造の curation 不整合ではないため MANUAL化。
- 残 LOSS 84 の大半は action.type 76（構造差）。次ラウンドはここを1枚ずつ突き合わせ（curated-STUB 正→MANUAL化／stale→resync／LOOK/REVEAL/CHOOSE 構造→bulk送り）。

---

## データ: R25＝filter.cardType／count バケツ triage 15枚（MANUAL化6＋resync9）（2026-06-28・ymst）

2刀流（`_manualize2.ts`＝EXIST正→MANUAL化／`_resync.ts`＝FRESH正→採用）で残2バケツを1枚ずつ判定。**LOSS 120→105（−15）／held 279→264**。

- **MANUAL化 6枚**（EXIST が正・FRESH が退化）：WX10-007／WX10-021（「デッキトップを見てレベル≤3の＜X＞シグニなら場に出してもよい」の ADD_TO_FIELD source filter＋optional 脱落）／WXDi-P12-060（他《ディソナ》全体バフの ALL/filter/excludeSelf 脱落）／WXDi-P15-093／WX24-P1-076（他＜地獣＞の cardClass filter＋UNTIL_OPP_TURN_END＋BURST の damageSource:lrig 脱落）／WXK08-045（ON_BECOME_BEAT timing穴＋BEAT条件＋悪魔 filter 脱落）。
- **resync/採用 9枚**（FRESH/manual が正・保存JSONが stale＝実 runtime バグ修正）：
  - WXK04-042＝E1 が誤 `BANISH`→正 `POWER_MODIFY+2000(thisCardOnly)`、E2 に `SELF_POWER_GTE:10000` 条件追加。
  - WXDi-P14-077＝**mixed**。E1 は EXIST が filter 無し（+2000 を任意1体）→FRESH の「他＜電音部＞全体」を採用。E2 は逆に EXIST の詳細 `LOOK_PICK_CHAIN` が正→MANUAL化（FRESH は generic LOOK_AND_REORDER に退化）。effect 単位で逆判定が要る例。
  - WX25-P1-018／SPDi44-08＝E2 が `REMOVE_ABILITIES`（全く無関係な誤実装）→正しい `POWER_SET 15000(crossState)+GRANT_LRIG_ABILITY`、E1 に triggerScope/Filter＋DURING_PHASE＋hasIcon クロス追加。
  - WX25-P1-026／SPDi44-04＝無条件 ENERGY_CHARGE/TRANSFER→`FIELD_SIGNI_ALL_DISTINCT_CLASS` 条件付き＋`LAST_PROCESSED_COUNT_GTE:5` の付与。
  - WX25-P1-115／SPDi01-121＝無条件 ENERGY_CHARGE→`DECK_TOP_SHARES_COLOR_WITH_LRIG` 条件付き。
  - WXK04-002＝E1 `GRANT_PROTECTION` が全シグニ対象→`isArmored` のみ、E2 BLOOD_CRYSTAL_ARMOR に紅蓮 filter 追加。
- **⚠SKIP**：REVEAL_AND_PICK 3枚（WX24-P1-020／WX25-P1-037／WX25-P3-040）は LOOK/REVEAL 一族＝bulk 正規化送り（R14 教訓）。WXDi-D09-P18（覚醒）は EXIST が `activeCondition`（覚醒状態であるかぎり）を欠落し+3000が無条件化、FRESH は内側 granted ability が誤 top-level に漏れ＝両方不正確で LOSS 据置。

---

## データ: R24＝stale データ6枚を FRESH へ再同期/採用（実 runtime バグ修正）（2026-06-27・ymst）

R23 で発見した「FRESH（パーサー出力）の方が保存JSONより正しい」逆パターンを処理。**runtime は `public/data/effects_*.json` を直ロードし build:effects で再生成しない**ため、stale JSON は実ゲームで誤動作していた＝これは LOSS 削減であると同時に **runtime バグ修正**。`scripts/_resync.ts <id>`（差分のある effect だけを FRESH 値へ置換・BURST 等は据置・スコープ検証付き）で実施。**LOSS 126→120（−6）／held 285→279**。

- **①JSON stale 再同期 3枚**（manualEffects.ts に完全定義があり FRESH が parseStatus:MANUAL で出す）：**WXK04-030**＝OLD は `SHUFFLE+BANISH ALL 相手シグニ` という無関係な誤実装→NEW は `BLOOD_CRYSTAL_ARMOR+POWER_MODIFY(armored+5000)+grant STUB`（テキスト通り）。**WX25-CP1-030／WX25-CD1-06**＝OLD は単一 `NEGATE_ATTACK`（2択を喪失）→NEW は完全な2択 `CHOOSE`（①単体無効化／②エナから＜ブルアカ＞2枚トラッシュで2体まで無効化）。
- **②パーサー優位の data 採用 3枚**（FRESH=AUTO で IDENTICAL 化）：**WX24-P3-064／WXK07-027**＝OLD は activeCondition が `TURN_OWNER` のみ（無条件バフ）＋target に thisCardOnly 無し（全味方対象）→NEW は `AND[TURN_OWNER, TRASH_HAS_CARD(class≥N)]`＋`thisCardOnly`（テキスト「トラッシュにN枚以上あるかぎり、このシグニのパワー」通り）。**WX21-Re09**＝OLD は timing `ON_TURN_END` 誤り＋story:天使 を target に誤配置→NEW は `ON_PLAY`＋`triggerScope:any_ally`＋`triggerFilter:{story:天使}`＋`triggerCondition:{byEffect:true}`（「あなたの＜天使＞のシグニが効果によって場に出たとき」）。
- **⚠不採用＝WX20-026-E3**：FRESH は timing を `ON_DRAW` にするが「あなたの場にある＜凶蟲＞のシグニの効果で引いたとき」の**発生源限定を落とし過剰発火**になる（OLD の ON_TURN_END も誤り）。どちらも不正確＝**パーサーギャップとして LOSS 据置**（class-effect-triggered-draw の triggerCondition が必要）。
- ツール：`scripts/_resync.ts`（FRESH正の stale を採用）と `scripts/_manualize2.ts`（EXIST正の hard-tail を MANUAL化）の2刀流。dry-run で EXIST/FRESH を必ず突き合わせ、**どちらが正しいかを1枚ずつ判定**してから適用（誤った方を凍結しない）。

---

## データ: R23＝小バケツ hard-tail 12枚を parseStatus:MANUAL 化＋逆パターン3種の発見（2026-06-27・ymst）

R21/R22 の MANUAL化戦略継続。残 LOSS の小バケツを `scripts/_manualize2.ts <id>` で1枚ずつ dry-run し、**EXIST が正・FRESH が退化** の hard-tail のみ MANUAL化（差分effectのみ・runtime不変・構造完全一致を検証）。**LOSS 138→126（−12）／held 297→285**。

- **MANUAL化 12枚**：action.id 4＝WX04-015（curated STUB `OPP_REVEAL_SPELL_USE_FREE`・FRESH は誤 TRANSFER_TO_DECK を含む分解）／WXDi-P06-054-E2（`GRANT_QUOTED_AUTO_ABILITY`・FRESH は内側能力が UNKNOWN に漏れる＝R13 同型）／WXK01-054・WXK01-089（`DRAW_AT_TURN_END`・FRESH は「ターン終了時」を落とし即時DRAW）。condition.type 2＝WXK08-070・WXK10-069（`ON_BECOME_BEAT` timing穴＋`BEAT_CONDITION` 脱落）。costThreshold 1＝WX04-011（`costThreshold`＋`useTimingIncludes` 脱落）。optional 2＝WXDi-D08-013・WXDi-P14-084（TRASH の `optional:true` 脱落）。then 3＝WXK02-071・WXK10-057・WDK05-T15（curated STUB `REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI`・FRESH は LOOK_AND_REORDER+ADD_TO_FIELD に lossy 分解＝「それがシグニの場合」条件喪失）。
- **⚠重要発見＝MANUAL化してはいけない逆パターン**（dry-run で FRESH の方が正しいもの。誤って MANUAL化すると誤データを凍結する）：
  1. **JSON stale（manualEffects.ts に richer 定義・保存JSONが古い）＝再同期案件**：WX25-CP1-030／WX25-CD1-06（2択 CHOOSE が単一 NEGATE_ATTACK に退化）／WXK04-030（血晶武装+power+grant が「BANISH ALL」に誤退化）。FRESH（mergeManualEffects 後）が既に parseStatus:MANUAL で完全版を出す＝**JSON を FRESH 値に再同期すれば held 化**（最もクリーンな次の一手）。
  2. **パーサー優位の stale データ＝data採用案件（R12/R17 型）**：WX24-P3-064／WXK07-027（activeCondition のトラッシュ枚数条件＋target.thisCardOnly を JSON が欠落・FRESH が完備）／WX20-026-E3／WX21-Re09-E1（JSON が timing `ON_TURN_END` 誤り＋story を target に誤配置・FRESH が `triggerScope`/`triggerFilter`/`triggerCondition.byEffect` に正配置）。JSON を FRESH 値に寄せれば改善＋held 化。
  3. **curation 案件**：SP27-016（choice① が SEARCH→ENERGY を落とした lossy 近似）／WXK05-030（【マルチエナ】を RULE_REMINDER_TEXT で近似・本来 GRANT_KEYWORD）。bulk 正規化送り。

---

## データ: R22＝powerRange anaphora／トリガー穴 hard-tail 6枚を parseStatus:MANUAL 化（LOSS から正当除外）（2026-06-27・ymst）

R21 と同じ「既存 JSON は正しいがパーサー再現不能な hard-tail を MANUAL化」戦略の継続。計器（`scripts/parserWorklist.ts`）の triggerCondition/Scope バケツ6枚を 1枚ずつ dry-run（`scripts/_manualize2.ts <id>`＝HEAD effect と fresh parser 出力の leaf 差分を表示）で「EXIST正・FRESH退化」を確認のうえ MANUAL化。**差分effectのみ・runtime不変（leaf 不変・parseStatus メタデータのみ）**。

- **再現不能の2系統**：①**powerRange anaphora**＝「対戦相手のパワーN以下のシグニ１体を**対象とし**…《X》を支払ってもよい。**そうした場合、それ**をバニッシュする」。BANISH 対象が後続文の「それ」で照応されるため、`parseSingleSentence("それをバニッシュする")`（effectParser.ts:1399-1405 の「そうした場合」CONDITIONAL）に前文の `filter.powerRange` が伝播せず脱落。②**timing 穴**＝`ON_SIGNI_BECOMES_DRIVE`（ドライブ状態になったとき）/`ON_HAND_DISCARDED`（手札を捨てたとき）/`ON_BECOME_BEAT`（ビートになったとき）は timing 検出ロジック自体が存在せず FRESH が `ON_PLAY` に退化。timing を足しても①の照応で powerRange は落ちるため held に戻せない。
- **6枚**：WXDi-P06-052（ON_TRASH・powerRange max5000・fromFieldByCostOrEffect）／WXK01-076（ON_SIGNI_BECOMES_DRIVE・max3000・any_ally）／WXK01-079（同・max1000）／WXK07-061（ON_TRASH・max10000・fromFieldByCostOrEffect）／WXK09-038（ON_HAND_DISCARDED・any・E1のみ）／WDK14-014（ON_BECOME_BEAT・any_ally・E1のみ）。
- **検証**：3ファイルとも parseStatus を除けば HEAD と構造完全一致（`structurallyIdentical=true`）＝他カード巻き込みなし。AUTO→MANUAL は WXDi:1／WXK:4／misc:1＝計6 のみ。**LOSS 144→138（−6）／held 303→297**。triggerCondition/Scope バケツ枯渇。
- ⚠LOOK/REVEAL・CHOOSE 一族は curation 不整合のため MANUAL化しない（最終 VALUE の bulk 正規化案件）。

---

## データ: R21＝hard-tail 11枚を parseStatus:MANUAL 化（表現完成・LOSS から正当除外）（2026-06-27・ymst）

クリーンなパーサー鉱脈が枯れたため、**「既存 JSON は正しく完成済みだがパーサーが構造的に再現不能」な hard-tail** を `parseStatus:MANUAL` 化する戦略へ移行（計器は MANUAL/PARTIAL を held から除外＝§2 の「手動管理・パーサー対象外」明示）。**メタデータのみ変更・効果本体と runtime 挙動は不変**。差分のある effect だけを MANUAL 化（パーサーと一致する effect は AUTO 据置）。

- **batch1＝GRANT_ACCE_HOST_ABILITY 6枚**（WX16-074/WX17-075/WX17-077/WXK10-074/WXK10-075/WDK07-E14）。内側 abilities が手書き品質（triggerScope/isTriggerSource/独自CHOOSE）で R13 検証済の再現不能。**LOSS 155→149**。
- **batch2＝機構依存 5枚**（WXDi-P07-044=機構④ ON_HAND_DISCARDED＋FREEZE／WX25-P2-009=ゲーム能力付与＋ON_CARD_MILLED_FROM_DECK 2AUTO手動分割／WX10-074・078=placedDown＋targetsTriggerSource／WXK10-055=傀儡 STEAL_OPP_TRASH_PUPPET）。**LOSS 149→144**。
- 各カード HEAD vs fresh を effectId 単位で比較し、差分 effect のみ MANUAL 化したことをスクリプトで検証（想定カード以外・parseStatus 以外の変化ゼロを確認）。同型★0維持・JSON キー順保持。
- **⚠ MANUAL化しない対象**：LOOK/REVEAL（〜50）・CHOOSE 一族は curation 不整合（同テキスト形で REVEAL_AND_PICK/LOOK_AND_REORDER 等が割れている）＝MANUAL化は不整合を凍結するだけ。これらは**curation 統一（bulk 正規化）** で扱う別案件（R14/R16 参照）。トリガー検出の系統的な穴（ON_ACCE 等）も、systematic ならパーサー修正候補として保留。

## パーサー: R20＝「この方法で…したシグニのレベル以下」levelLteLastProcessed 付与（LOSS −3）（2026-06-27・ymst）

「この方法で〔手札に加えた／バニッシュした／手札に移動した〕シグニのレベル以下の…シグニ」の動的レベル参照（engine 解決済 `levelLteLastProcessed`）をパーサーが出せていなかった。`parserUtils` に `parseLevelLteLastProcessed`（`/この方法で[^。]{0,20}?シグニのレベル以下/`）を新設し、3ハンドラに適用：①BOUNCE「それを手札に戻す」target②SEND_TO_ENERGY「それをエナゾーンに置く」target（m3）③SEARCH「探して場に出し」filter。

- 計器：**LOSS 158→155（−3）／held 317→314**。WX21-022（BOUNCE）/WX24-P3-026（SEND_TO_ENERGY）/WXEX2-17（SEARCH・CONDITIONAL内）が IDENTICAL 化。同型★0維持・typecheck（tsc -b）緑・JSON無変更・要実機検証。
- filter（その他）の動的フィルタ系を解消。helper 化で横展開可能。

## パーサー: R19＝トラッシュ抽出に《ガードアイコン》hasGuard/noGuard 付与（LOSS −4）（2026-06-27・ymst）

`parserUtils` に `parseGuardFilter`（《ガードアイコン》を持つ→hasGuard／持たない→noGuard）を新設し、`parseSentencePart1.ts` の2ハンドラに適用：①トラッシュ→手札（行1105・名詞句スパン spanTxt 限定）②トラッシュ→エナ汎用（行1883）。

- 計器：**LOSS 162→158（−4）／held 321→317**。WXDi-P00-025/P01-011（hasGuard・TRANSFER_TO_HAND source.filter）＋WXDi-P01-030/P07-029（noGuard・ENERGY_CHARGE target.filter）が IDENTICAL 化。同型★0維持・typecheck（tsc -b）緑・JSON無変更・要実機検証。
- filter（その他）バケツの hasGuard 2／noGuard 2 を解消（helper 化したので REVEAL 一族等への横展開も今後容易）。

## パーサー: R18＝「このシグニを場から手札に戻す」BOUNCE に thisCardOnly 付与（LOSS −3）（2026-06-27・ymst）

`parseSentencePart1.ts` の BOUNCE handler（行866）が「このシグニを場から手札に戻してもよい」の自身限定（`filter.thisCardOnly`）を落とし、汎用 `filter:{cardType:シグニ}` に潰していた。語順 `/このシグニを(?:場から)?手札に戻/` で判定して `thisCardOnly:true` を付与（トリガーの「このシグニが…とき」や対戦相手/他シグニ対象には付けない）。

- 計器：**LOSS 165→162（−3）／held 324→321**。WXK06-034/036/WXK10-061 が IDENTICAL 化（「アタック時このシグニを手札に戻す→手札からレベルN英知シグニを場に出す」一族）。同パターンの WXK02-071/WXK10-057/WDK05-T15 は別途 STUB（REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI）差分が残るため held 継続（別件）。同型★0維持・typecheck（tsc -b）緑・JSON無変更・要実機検証。
- filter（その他）バケツの最大サブクラスタ（thisCardOnly 6枚）のうち clean な3枚を解消。

## データ正規化: R17＝公開→エナ送りの stale ENERGY_CHARGE{DECK_CARD}→ADD_TO_ENERGY（3枚・engine バグ修正）（2026-06-27・ymst）

「デッキの一番上を公開する。それが〔X〕の場合、それをエナゾーンに置く」の REVEAL_AND_PICK の `then` が、HEAD では **stale な `{type:ENERGY_CHARGE, target:{DECK_CARD,self,1}}`** で保存されていた。これは `effectParser.ts:1284` が明示する既知バグ形＝`execEnergyCharge` が DECK_CARD ターゲットを場のシグニ選択と誤解する。パーサーは正しく `{type:ADD_TO_ENERGY, owner:self}`（applyDirectAction が公開カードをエナへ）に正規化済み。

- **JSON 直接パッチ3枚**（WX12-051/052/WX18-070・全 effects_WX.json）。`then` を `ADD_TO_ENERGY{owner:self}` に置換＝**パーサー出力と完全一致（IDENTICAL）**。engine バグ修正でもある（公開カードが正しくエナへ行く）。
- 同パターンの stale `ENERGY_CHARGE{DECK_CARD}` は他17枚に残存するが、それらは別の差分も持ち本パッチだけでは解決しない（held のまま）＝**今回は完全解決する3枚のみに限定**（スコープを絞る）。残17枚は当該カードを本格対応する際に同時修正。
- 計器：**LOSS 168→165（−3）／held 327→324**。同型★0維持・typecheck（tsc -b）緑・パーサー変更なし（データのみ）。**要実機検証**（公開カードのエナ送り）。

## パーサー: Stage B R15＝「この方法で…の中に〔Type〕がある場合」CONDITIONAL 復元（LOSS −2）（2026-06-27・ymst）

「あなたのデッキの上からカードをN枚トラッシュに置く。**この方法でトラッシュに置いたカードの中にスペルがある場合、カードを１枚引く**」（G164）の第2文が、条件 `LAST_PROCESSED_HAS_TYPE` を落として DRAW を無条件 step 化していた（fresh＝SEQUENCE[TRASH, DRAW]・existing＝SEQUENCE[TRASH, CONDITIONAL{LAST_PROCESSED_HAS_TYPE, then:DRAW}]）。`parseSingleSentence` 冒頭の「…場合、〜」CONDITIONAL 群（LAST_PROCESSED_HAS_BURST の隣）に narrow handler を追加＝`^この方法で.*?の中に(スペル|シグニ|アーツ|ルリグ)がある場合、(.+)` を CONDITIONAL でラップ。

- 計器：**LOSS 170→168（−2）／held 329→327**。WX12-054/055 が IDENTICAL 化（型 `LAST_PROCESSED_HAS_TYPE` は engine 実装済＝effects.ts:208）。SEQUENCE 結合の thenM 正規表現（1389）は「た場合」を要求し「ある場合」を拾わないため標準文として parseSingleSentence に到達＝衝突なし。typecheck（tsc -b）緑・同型★0維持・effects_*.json 無変更・要実機検証。
- **R14 の教訓を適用**：着手前に逆方向ペア（DRAW←CONDITIONAL）を計器で確認＝0件＝curation 不整合なし。同 CONDITIONAL←DRAW バケツの残2枚（WX18-064＝LIFE_CRASHED_THIS_TURN／WDK14-013＝BEAT_CONDITION＋cost.beat_signi_from_trash 脱落）は別パターンで別途。

## パーサー: Stage B R13＝アクセホスト能力付与（GRANT_ACCE_HOST_ABILITY）の wrapper 復元（LOSS −8）（2026-06-27・ymst）

「【常】：これにアクセされている[＜X＞の]シグニは『…』を得る」（アクセ装着先ホストへ引用能力／キーワードを付与）が、`splitSentences` が引用「」内の「。」で wrapper を割ってしまい、**内側の能力が単独の効果として漏れ出していた**（fresh が GRANT_ACCE_HOST_ABILITY を一切出さず DRAW/GRANT_PROTECTION/STUB 等に退化＝全 leaf 喪失の LOSS 本体）。engine は `effectEngine.ts:4453` 等で CONTINUOUS の GRANT_ACCE_HOST_ABILITY を読みホストへ付与する実装が既にあった（＝表現だけ欠けていた）。

- **修正＝最優先での wrapper 捕捉＋再帰展開**（GRANT_LRIG_ABILITY と同方式）。`parseActionText` 冒頭（splitSentences の前）に `^これにアクセされている(?:＜X＞の|《Y》の)?シグニは([「『【]…)を得る$` を追加し `{type:GRANT_ACCE_HOST_ABILITY, filter:{cardType:シグニ, cardClass?:X, cardName?:Y}, abilities:[], rawText}` を返す。`parseBlock` で rawText を `splitEffectBlocks`→`parseBlock` 再帰し abilities へ展開（effectId は既存慣例 `{cardNum}-E{N}-G`）。引用符なしのキーワード付与（「…は【ランサー】を得る」）は `【常】：このシグニは{kw}を得る` に再構成して解析。
- **本体は引用「」/『』 か キーワード【】 始まりに限定**（`[「『【]`）＝「すべての色を得る」等の専用STUB（ACCE_SIGNI_ALL_COLOR）を誤捕捉しない（初版で WX22-043 を +1 退行させたため narrow 化＝held +1→0）。
- 計器：**LOSS 178→170（−8）／held 329 不変（横取り退行0）**。LOSS→VALUE へ移った8枚＝WX15-058/WX21-041/WXEX1-70/WXDi-P09-TK02A（内側 parseStatus）・WX15-102/WX15-105/WXK04-050（内側 GRANT_PROTECTION の count ALL↔1）・WX20-045（FORCE_FRONT_SIGNI_ATTACK↔FORCE_SIGNI_ATTACK）。残6枚（WX16-074/WX17-075/WX17-077/WXK10-074/WXK10-075/WDK07-E14）は内側が MANUAL 専用（triggerScope/isTriggerSource/独自CHOOSE 等）で再現不能＝LOSS 残（filter.cardType/triggerCondition/timing バケツへ移動）。
- **検証**：WXEX1-70 等は内側まで既存JSONと leaf 完全一致（差は inner `parseStatus` MANUAL↔AUTO のみ＝だから VALUE）。**effects_*.json 無変更**（VALUE 差＝収穫マージ非対象・MANUAL 内側を温存）。typecheck（tsc -b）緑・**同型★0維持**（JSON 不変）。**要実機検証**（アクセ付与の発火）。
- **教訓**：引用能力を含む付与系（GRANT_*_ABILITY）は splitSentences より前に wrapper を捕捉し rawText→再帰展開するのが定石。内側が MANUAL 品質のカードは LOSS→VALUE 止まり（parseStatus/effectId が必ず差分化）＝VALUE は最終レビュー送り。

## データ正規化: Stage B R12＝「対戦相手のシグニをエナゾーンに置く」の ENERGY_CHARGE→SEND_TO_ENERGY（11枚・mis-curation）（2026-06-27・ymst）

Stage B 第1弾（非REVEALの最有望クラスタ）。「対戦相手のシグニ１体を対象とし…それをエナゾーンに置く」（＝エナ送り）が HEAD では `ENERGY_CHARGE` with `target:{SIGNI,opponent}` と **mis-curate** されていた。engine 上 `SEND_TO_ENERGY` が「フィールドのシグニをエナゾーンに置く（エナ送り）」の正規アクションで、パーサーは正しく `SEND_TO_ENERGY` を出力済み。`ENERGY_CHARGE` は本来 deck/hand/trash→エナのチャージ用（HEAD でも DECK_CARD 21・TRASH_CARD 31・HAND_CARD 4 が正用途）。SIGNI ターゲットの **11枚のみ**が誤り。

- **パーサー変更なし＝データのみ正規化**（fresh が既に SEND_TO_ENERGY なので恒久安定）。`ENERGY_CHARGE`+`target.type:SIGNI` の11箇所を一律 `SEND_TO_ENERGY` へ（型 swap のみ・他leaf無変更）。engine は execEnergyCharge の field 分岐も execSendToEnergy も同じエナ送りを行うが、SEND_TO_ENERGY は解決済み対象に直接作用し再選択の齟齬がない＝正。
- 対象: WX20-046/WXDi-P02-023/WX24-P2-007/P2-086/P2-087/WXK01-042/WXK09-052/WXK10-046/WXK11-068/WXK11-069/PR-K054。
- 計器：**VALUE 161→151（−10）／held 339→329**。⚠**LOSS ではなく VALUE トラックだった**（型の値違いのみで lost leaf 無し＝VALUE 分類。Stage B 診断スクリプトは LOSS/VALUE を区別せず action.type 変化を数えたため見込み違い。LOSS 178 は不変）。データ正規化としては正当（11枚の実 mis-curation 修正）。WXK10-046 は別件 timing で held 残。typecheck（tsc -b）緑・**同型★0維持**。**要実機検証**（エナ送りの挙動）。
- **教訓**：Stage B の「action.type 77」は **LOSS 分類**（構造差で lost leaf あり）。型の値違いだけのものは VALUE に入る＝LOSS を減らすには lost leaf を持つカード（LOOK/REVEAL 一族等）を直す必要がある。

## パーサー: Stage C R11＝AUTO/ACTIVATED の《自分ターン》《相手ターン》を triggerCondition.turnOwner 化（最大の単発・LOSS −28）（2026-06-27・ymst）

Stage C の本丸。`effectParser.ts:1948` が 《相手ターン》《自分ターン》マーカーを **CONTINUOUS のみ** activeCondition 化し、AUTO/ACTIVATED は「engine 側未整備」として**見送っていた**（コメントが陳腐化）。実際は engine の `effectStack.ts`（機構④）が `triggerCondition.turnOwner` を現ターンと照合してゲートする実装が完了済み（`types/effects.ts:1509` も WXDi-P06-033 を名指しで文書化）。AUTO/ACTIVATED 経路で `extractedTriggerCondObj.turnOwner = (turnOwnerCond.owner)` を付与するよう是正。

- 計器：**LOSS 206→178（−28）／held 360→339**。turnOwner 値の衝突＝**0件**（HEAD の既存 turnOwner と矛盾なし・純粋に欠落補完）。**同型★0維持**・typecheck（tsc -b）緑。**要実機検証**（《自分/相手ターン》AUTO がターン外で発火しないこと）。
- 解消例：WXDi-D05-013/WXDi-P06-033/WXDi-P11-058/WX24-P1-013/WX24-P2-030 等。VALUE が +7（154→161）したのは、turnOwner 脱落が primary だった一部（WX24-P1-059/P1-084/WXDi-P11-040＝timing `ON_TURN_END`↔`ON_PLAY` の別ズレ）が LOSS→VALUE に再分類されただけ（held のまま・別系統の宿題）。

## パーサー: Stage C R10＝ON_PLAY「他の…場に出た」excludeSelf／UP thisCardOnly／ON_TRASH fromZones／自己蘇生 optional（2026-06-27・ymst）

Stage C（triggerCondition/Scope/Filter バケツ）の第1弾。トリガー検出の穴を4点是正：

1. **ON_PLAY「あなたの他のシグニが（効果によって）場に出たとき」**：`effectParser.ts:1641` の any_ally 正規表現が「他の」を許さず scope/byEffect/excludeSelf を丸ごと落としていた。`(他の)?` を追加し triggerFilter.excludeSelf を付与。WX10-080/083 ほか、story 付き4枚（WX06-021/WXDi-P00-042/WXDi-P03-050/WX24-P1-046）を harvest。
2. **UP「このシグニをアップする」= thisCardOnly**：`parseSentencePart1.ts` の UP handler が単体「このシグニ」に thisCardOnly を付けず汎用 self/count:1 に落としていた。`このシグニ`→`filter:{thisCardOnly:true}`。**44枚の curation bug を harvest**。
3. **ON_TRASH の fromZones**：`effectParser.ts:1728` がトリガー文を除去するだけで出自ゾーンを捨てていた。「デッキ/場/手札かデッキ から」→ `triggerCondition.fromZones`（deck/field/hand+deck）を記録。**63枚を harvest**（engine は fromZones 未使用＝表現専用・無害）。
4. **自己蘇生 ADD_TO_FIELD の optional**：「このカードをトラッシュから場に出してもよい」の `もよい`→`optional:true`。WX10-092/WX02-073 ほか **15枚を harvest**。

- 計器：**LOSS 210→206**（WX10-080/083/092・WX02-073）＋ thisCardOnly 44・fromZones 63・optional 15・excludeSelf 4 の harvest。typecheck（tsc -b）緑・**同型★0維持**。**要実機検証**。
- **保留**：Cluster 1（WX10-074/078「ダウン状態で場に出たとき→そのシグニをアップ」＝placedDown＋**targetsTriggerSource**）は「そのシグニ」自動対象化の機構追加が要るため次ラウンド。

## パーサー: filter.color／colorMatchesLrig 脱落是正（trash→hand 単色＋SEARCH/REVEAL系の共通色）（2026-06-27・ymst）

Stage A（filter.color バケツ）。2系統：

1. **trash→hand の単色 filter**：R5 で story は付与したが**色を落としていた**（WX04-021「トラッシュから黒のシグニ…手札に加える」の color:'黒'）。名詞句スパン内に**一意な単色のみ**付与（`[白赤青緑黒](?=[のか])` を集合化し distinct===1 かつ「色の」形のときだけ）。**⚠複色は除外**＝「白か赤のシグニ」「白のカード１枚と黒のカード１枚」は単一色 filter で表せず誤るため付けない（WX14-031/WX20-022 の偽陽性を回避）。単色 curation bug 56枚を純改善採用。
2. **colorMatchesLrig の共用ヘルパー化**：「(あなたの)センタールリグと共通する色を持つ〔シグニ/カード〕」を `parseColorMatchesLrig`（parserUtils・名詞句限定の共通正規表現）に切り出し、**SEARCH（part1:926）／trash→hand／trash→field（part1:1222）** に適用。WDK13-009・PR-K064（SEARCH）・WX19-004（trash→field choice）解消＋PR-318 等を harvest。R2 のインライン正規表現も同ヘルパーへ統一。

- 計器：**LOSS 214→210**（WX04-021/WDK13-009/PR-K064/WX19-004）＋単色56枚・colorMatchesLrig数枚の純改善。typecheck（tsc -b）緑・**同型★0維持**。**要実機検証**。残＝PR-457（REVEAL_AND_PICK の filter.colorMatchesLrig＝**Stage B 一族**で別途）。

## パーサー: 「手札から＜X＞のシグニをN枚捨ててもよい」コスト捨ての class filter 脱落是正（2026-06-27・ymst）

Stage A（filter.cardType バケツ）。任意捨て handler（`parseSentencePart3.ts` 行1053 `手札から(.+?)のシグニ?を(N)枚?捨ててもよい`）が `parseCardTypeFilter(＜X＞)` のみ＝`＜天使＞` 等のクラス名を空 filter に落としていた（**捨てる版** part1:1623 は parseStoryFilter で正しく story を付与しており不整合だった）。`cardType:'シグニ'`＋名詞句スパン限定の `parseStoryFilter`/`parseColorFilter`/`parseLevelFilter` を付与して整合。

- **35枚の curation bug を純改善採用**：これら任意捨てカードは HEAD JSON も空 filter（旧パーサー出力に追従）だった＝**捨てるシグニのクラス絞りが効かない実害**。fresh の正値（cardType＋story/level）を収穫マージで採用（全て pure superset）。
- **cardClass→story 正規化（4枚）**：WX21-017/018・WXDi-D08-013・WXDi-P14-084 は HEAD が `cardClass:'天使/電音部'` の少数派表記（story が規約・124枚 vs cardClass 7枚／`parser_worklist.md` Stage B 記録参照）。engine・decompiler は story/cardClass を同一視するため、規約の story に正規化して parser 出力と一致。**WX21-017/018 解消**（WXDi-D08-013/P14-084 は steps[0].optional の脱落が別途残＝任意捨ての optional 表現は handler 横断で不統一のため据置）。
- 計器：**LOSS 216→214**（WX21-017/018）＋35枚 filter 是正＋4枚 story 正規化。typecheck（tsc -b）緑・**同型★0維持**。**要実機検証**（捨てコストのクラス絞り）。

## パーサー: 対戦相手エナゾーン→トラッシュの「N枚まで」count/upToCount是正＋curation bug 17枚採用（2026-06-27・ymst）

Stage A（count バケツ）。`parseSentencePart1.ts` の「対戦相手エナゾーン→トラッシュ」handler（行108）の count 抽出が `カード([０-９\d]+)枚` で**数字直後のみ**マッチ＝「カード**を**２枚まで」の `を` で外れ、count が 1 に落ち、`upToCount` も未設定だった。`カード(?:を)?([０-９\d]+)枚` ＋ `枚まで` 検出で是正（WX04-010 解消）。

- **⚠ 横展開で curation bug 17枚が顕在化**：この handler を通る既存17枚は **HEAD JSON が古い誤値 `count:1`（＝旧パーサーのバグ出力に合わせて curate されていた）** を保存していた。実テキストは全て「カードをN枚まで対象とし…トラッシュに置く」（WX13-001=2/SP10-001=7/WX24-P1-019=3 等、全件テキストでN照合済み）＝**本来N枚トラッシュできるのに1枚しか対象にならない実害バグ**。§2 の「慣例 churn」ではなく明白なデータ誤りのため、parser の正値（count:N, upToCount:true）を17枚に直接採用（収穫マージは値変更を採らないので `scripts` で fresh 出力を書き戻し）。対象: WX13-001/WX20-060/WXDi-P04-020/P06-011/P10-026/P12-002/WX24-P1-019/P2-003/P2-018/P4-067/WX25-P1-003/P2-078/WX26-CP1-032/WDK05-T09/SP10-001/SPDi47-02/WXDi-D09-H21。
- 計器：**LOSS 217→216**（WX04-010）＋17枚の値是正。typecheck（tsc -b）緑・**同型★0維持**（逆翻訳が「N枚まで」に正され原文一致）。**要実機検証**（複数エナトラッシュの枚数）。

## パーサー: activeCondition 3系統＋《ビートアイコン》全角ブラケット是正（2026-06-27・ymst）

Stage A（activeCondition バケツ）＋大きな波及。`effectParser.ts` に3つの修正：

1. **SUBSCRIBER_COUNT 条件**：`parseActiveCondition` に「あなたの登録者数がN万人を達成しているかぎり、」→ `{type:'SUBSCRIBER_COUNT', operator:'gte', value:N}`（万単位の数値をそのまま格納＝既存JSON規約 value:40）。WXK08-061/064 解消＋WXK08-034/038（80/100万）を純改善採用。
2. **IS_SELF_ACCED の言い回し追加**：既存は「このシグニがアクセされているかぎり、」のみ。「このシグニに【アクセ】が付いているかぎり、」を追加（WDK07-E11 解消・WXK04-080/082 の[0]も是正。ただし両者は[1]「これにアクセされているシグニのパワーを＋N」の acceHost 脱落が別途残＝広域 POWER_MODIFY が先に発火する precedence 問題で別件）。
3. **《ビートアイコン》の全角ブラケット ［］ 対応（最大の波及）**：`beatIconM` の正規表現が ASCII `[]` のみで、実データは全角 `［１枚以上］`（U+FF3B/FF3D）。`[\[［]([^\]］]+)[\]］]` で両対応。これで WXK08-041/042/043/046/067/068/073/075・WXK10-041・WDK14-001/011/012 等の 《ビートアイコン》[条件] 一族（【常】【自】【起】【出】）がまとめて解消（従来は条件丸ごと脱落）。併せて **【常】CONTINUOUS の beatCondition は activeCondition に**ルーティング（engine checkActiveCondition が評価・WXK08-073）。それ以外（起動/自動）は従来どおり useCondition。

- 計器：**LOSS 233→217・held 386→371**（18枚改善・全て pure superset／leaf 削除なし）。typecheck（tsc -b）緑・**同型★0維持**。**要実機検証**（登録者数/ビート条件の開閉）。
- 残 activeCondition 2枚＝WX24-P3-064/WXK07-027（「《相手ターン》/ターンの間＋トラッシュ枚数」の TURN_OWNER↔AND 複合構造ズレ＝別構造）。

## パーサー: 「トラッシュ→手札」source に filter.story を名詞句スパン限定で付与（2026-06-27・ymst）

Stage A（filter.story バケツ）。`parseSentencePart1.ts` の TRANSFER_TO_HAND トラッシュ handler が `parseCardTypeFilter` のみで `＜種族＞の` を落としていた（WX03-050「トラッシュから＜悪魔＞のシグニ…手札に加える」の story:'悪魔' が脱落）。`parseStoryFilter` を追加して付与。

- **⚠ 偽陽性回避が肝**：全文 `t` に `parseStoryFilter` を当てると前置きの**条件クラス**を誤って拾う（例 WX22-002「黒の＜天使＞がある場合、トラッシュから対象のシグニ１枚を手札に加える」＝retrieved は無クラスなのに story:'天使' が漏れる）。→ `トラッシュから(.*?)手札に加える` の**名詞句スパン内**に限定して抽出（前置き条件 ＜X＞ を構造的に除外）。広い版だと139枚・うち7枚が条件漏れ偽陽性 → narrow 版で132枚（全て純粋な story-only 追加）。
- 計器：**LOSS 234→233・held 387→386**（WX03-050 が LOSS から解消）。残り132枚は既存JSONが取りこぼしていた retrieved-card の class フィルタ＝**latent curation bug の純改善**（収穫マージで採用・全て pure superset／leaf 削除/値変更なし）。
- typecheck（tsc -b）緑・**同型★0維持**。**要実機検証**（トラッシュ回収のクラス絞り込み）。残3枚の filter.story（WX20-026/WX21-Re09/WX22-046）は別構造（条件/トリガーfilter/コスト）＝別ラウンド。

## パーサー: 複数クラス「＜X＞と＜Y＞のシグニのパワー」全体バフのtarget是正（2026-06-27・karka）

Stage A R3（filter.cardType の一部）。`parseSentencePart1.ts` の POWER_MODIFY 全体バフ分岐のゲート正規表現が単一クラス（`＜X＞の`）しか許さず、「あなたの[他の]＜X＞と＜Y＞のシグニのパワーを±N」が default（owner:'any', count:1, filter無）に落ちていた。`(?:＜[^＞]+＞[とか])*＜[^＞]+＞の` で複数クラス連結を許容。self/opponent 両分岐。

- WX04-016/086 が一致（既存JSON正）。WXK04-043・WXDi-P11-041 は**既存JSONが旧バグの owner:'any'/count:1 を保存していた**ため fresh（正＝owner:'self'/count:'ALL'/filter）に直接パッチ（収穫マージは owner/count の値変更を採用しないため手修正）。held 388→386。
- typecheck（tsc -b）緑・同型★0維持。**要実機検証**。
- **重要発見**：filter.cardType バケツは単一修正ではなく84箇所に分散し多くが構造差（STUB/action.type）と絡む（`docs/parser_worklist.md` R3 ログ参照）。

## パーサー: 「トラッシュ→手札」source に colorMatchesLrig を名詞句限定で付与（2026-06-27・karka）

Stage A R2（filter.color バケツ）。`parseSentencePart1.ts` の TRANSFER_TO_HAND トラッシュ handler が「あなたのセンタールリグと共通する色を持つ」を落としていた。**名詞句修飾形に限定**した正規表現（`センタールリグと共通する色を持つ…(シグニ|スペル|カード)`）で `filter.colorMatchesLrig=true` を付与。engine は動的解決済み（effectExecutor）。SEQUENCE/CHOICE の sub-clause も再帰でこの handler に到達するため step/choice 版も拾える。

- **backlog の全文スキャン教訓を遵守**＝広い `includes()` ではなく名詞句限定の narrow 正規表現。過剰発火チェックで「fresh が付与・既存に無い」7枚を精査したが、全て実際に当該名詞句を持つ＝**既存JSONの取りこぼしを補う純改善**（収穫マージで7枚採用）。
- WX04-026/WX06-015/WX15-029/WX20-047-CB/WDK01-010/WDK06-C09 が一致（既存が正・JSON無変更）。WXDi-P04-004/P14-005/P15-045・WX24-P1-009/P2-009・WX25-P2-044/P3-009 に colorMatchesLrig 採用。
- 計器：**filter.color 11→5・held 394→388・LOSS 241→235**。typecheck（tsc -b）緑・**同型★0維持**。残5＝SEARCH/reveal の action.filter（別handler）＋filter.color 黒（別件）。**要実機検証**。

## パーサー: 「場にクロス状態のシグニがある」条件を COND_STUB→HAS_CARD_IN_FIELD 正規化（2026-06-27・karka）

Stage A（parser_worklist の filter.cardType バケツ）の R1。`effectParser.ts parseUseCondition` が「クロス状態」を一律 `COND_STUB`（常に許可）に倒していたが、これは**未実装時代の名残**。engine は crossState フィルタを実装済み（`execUtils` の HAS_CARD_IN_FIELD 条件評価 行697／`fieldCandidates` 行595）。「(あなた｜対戦相手)の場に[ある]クロス状態の[＜X＞の]シグニがいる／ある」を `HAS_CARD_IN_FIELD{owner, filter:{cardType:'シグニ', crossState:true, ...story}}` に正規化（それ以外の自身クロス参照等は COND_STUB 据置）。

- **engine配線済み（パリティOK）**＝新規engine作業なし。既存JSONが元々この正規形を持っていたため**JSON無変更**（パーサーが再現できるようになっただけ）。WX07-014/018/020・WX08-011・WX07-003・WX08-002/003 が一致、WX07-002/004/005・WX08-001 は crossState 解消（残差は無関係の timing 差＝別バケツ）。
- 計器：**filter.cardType 30→16・held 404→394・LOSS 255→241**。typecheck（tsc -b）緑・全sheet＋下流再生成で**同型★0維持**。**要実機検証**（クロス状態条件の開閉）。

## パーサー: 「あなたのレゾナのパワーを±N」のtarget脱落を是正＋isResona完全撤去（2026-06-27・karka）

`parseSentencePart1.ts` の POWER_MODIFY 分岐が「シグニ」限定で「あなたのレゾナのパワーを」を拾えず、デフォルト `{owner:'any',count:1}`（filter無）に落としていた（owner/count/filter 全滅）。レゾナ専用分岐を追加し `{owner:'self', count:'ALL', filter:{cardType:'レゾナ'}}` を出力。engine（`card.Type==='レゾナ'` でマッチ）も decompiler（前コミットで cardType:'レゾナ' 認識済み）も正しく解釈する。WX07-007/WX08-019 一致。

併せて既存JSON最後の `isResona`（死にキー）2箇所を `cardType:'レゾナ'` へ移行し、**isResona をコードベースから完全撤去**（残0）。レゾナ表現は cardType:'レゾナ' に一本化。

- typecheck（tsc -b）緑・下流再生成・**同型★0維持**・逆翻訳「あなたのすべてのレゾナのパワーを＋2000する」（count:'ALL' の標準表記）。**要実機検証**。

## パーサー/decompiler: 自身の基本レベルSET_BASE_LEVEL化＋レゾナ存在条件のdecompile退化を是正（2026-06-27・karka）

2系統の是正。**①SET_BASE_LEVEL（engine実行可）**＝「このシグニの基本レベルはNになる」を `parseSentencePart1.ts` で `SET_BASE_LEVEL`（until:END_OF_TURN）として出力。従来は `BLOCK_ACTION/actionId:SET_LEVEL_N` に退化していたが、`execBlockAction` は actionId を `blocked_actions` に積むだけで**基本レベルを変更しない no-op**（divergence）。`SET_BASE_LEVEL` executor（effectExecutor.ts:3695）が `attack_phase_level_overrides` に反映＝実行可。対象は self（ctx.sourceCardNum）のみ engine 対応のため、「を…にする」（対象指定の他シグニ）は engine 未対応につき BLOCK_ACTION 近似のまま据置。WX10-056/058（【起】基本レベル4/3）が一致。

**②レゾナ存在条件のdecompile退化**＝`decompileEffects.ts` の `HAS_CARD_IN_FIELD`／targetJa が `filter.isResona` だけでレゾナ名詞を出していたため、`filter.cardType:'レゾナ'`（多数派の正準形）のカードが原文「レゾナ」なのに「シグニ」と退化していた（WX08-033/WX14-042/WX21-Re19/WD09-009/WD11-009/PR-319 の6枚＝★非検出の隠れバグ）。`cardType==='レゾナ'` もレゾナと認識するよう2箇所修正。これに伴い WX10-056/058 の冗長な `isResona:true`（死にキー・engine 0参照）を JSON から除去し cardType に統一。

- typecheck（tsc -b）緑・全sheet＋下流再生成・**同型★0維持**・8枚のレゾナ存在条件が原文一致「レゾナがいるかぎり」。WX10-056/058 は fresh==JSON で held 解消。
- **要実機検証**（基本レベル変更が実ゲームで反映されるか）。

## パーサー: 【自】ON_BANISH「(対戦相手|あなた)のターンの間、…バニッシュされたとき」のactiveCondition脱落を是正（2026-06-27・karka）

`effectParser.ts` の **AUTO【自】ON_BANISH** 経路に「(対戦相手|あなた)のターンの間、」前置きの検出を追加し、`forcedActiveCondition = TURN_OWNER` を設定＋プレフィックス除去。従来は【常】→ON_BANISH 再分類（G150）にだけ TURN_OWNER 化があり、**素の【自】版は activeCondition 丸ごと脱落**していた（WXK04-065/067 が要レビューに滞留）。

- **engine配線済み（パリティOK）**: BattleScreen `collectBanishTriggers`（src/screens/BattleScreen.tsx:3571-3577）が ON_BANISH 自己トリガー収集時に `checkActiveCondition` を評価（コメントにも「対戦相手のターンの間」）。【常】G150 と同じ機構を流用＝新規engine作業なし。
- **収穫マージ（build:effects）で純改善採用12枚**: TURN_OWNER activeCondition を追加（全て原文に「ターンの間」を持つ）。WXK04-065/067・WX11-066・WX14-044/071・WX16-029・WXDi-P03-042・WXDi-P05-058・WXDi-P15-090・WXK07-048・WXK08-059。WXDi-P03-042/WXDi-P15-090 は「あなたの他の/＜原子＞のシグニ」被バニッシュ（any_ally scope は別の既存制約・本修正で悪化なし）。
- **held（要レビュー）409→408**。typecheck（tsc -b）緑・全sheet＋下流再生成・**同型★0維持**・逆翻訳に《対戦相手のターンの間であるかぎり》反映。
- **要実機検証**（相手/自分ターン中のみ ON_BANISH が発火するか）。

## 機構④誤parse3枚の是正（WXDi-P07-044／WX25-P3-062／WX25-P2-009・2026-06-26）

機構④（《自分/相手ターン》AUTO）で「未配線・別系統の重い誤parse」として残していた3枚を、既存語彙＋トリガー配線で是正。トリガー/アクションが丸ごと壊れていたのを原文一致まで復元。

- **WXDi-P07-044（全3効果・engine配線あり）**:
  - E1: ON_PLAY誤り→**ON_HAND_DISCARDED**＋triggerFilter{シグニ}＋DURING_PHASE{MAIN}（「メインフェイズの間シグニを捨てたとき、そのカードをトラッシュから場に」）。「そのカード」は近似（トラッシュのシグニを場へ）。collectHandDiscardTriggers で発火。
  - E2: ON_TURN_END誤り→**ON_PLAY＋triggerScope:any_ally＋byEffect＋turnOwner:self**（「あなたのシグニが手札以外＝効果で場に出たとき」）。**欠落していたFREEZEを復元**＋POWER_MODIFY-2000。collectFieldTriggers(byEffect)＋機構④ゲートで発火。
  - E3: 既に正しい（コイン2で相手手札捨て）。
- **WX25-P3-062-E2（engine配線あり）**: TARGET_AND_DISCARD_HAND誤り→**HAS_CARD_IN_FIELD{《虚幸の冥者　ハナレ》}条件＋OPTIONAL_TRASH_ENERGY_CLASS（エナから＜毒牙＞を任意トラッシュ）→そうした場合、対戦相手とこのシグニ両方を-20000**。E1（他＜毒牙＞効果でパワー減少時トリガー）は専用機構が要るため STUB `POWER_COPY_FROM_DOWNED` のまま据置。
- **WX25-P2-009（1ACTIVATEDに全マッシュ→2 AUTOに分割）**:
  - E1: **ON_OPP_LIFE_CRASHED＋once_per_game**＋新STUB `REPLACE_NEXT_OPP_REFRESH_MILL_LRIG`（次の相手リフレッシュをルリグデッキ1ミル版に置換＝refresh置換機構は未実装のため no-op STUB＋decompiler説明で表現）。
  - E2: 新timing **`ON_CARD_MILLED_FROM_DECK`**（デッキ→トラッシュのミル時）＋turnOwner:self＋once_per_turn＋POWER_MODIFY opp-5000。**収集機構が未実装のため engineUnwiredTimings に登録＝逆翻訳に【※engine未配線】を付与**（偽陰性防止）。
- **新規**: timing `ON_CARD_MILLED_FROM_DECK`（型＋timingJa＋unwired登録）／STUB `REPLACE_NEXT_OPP_REFRESH_MILL_LRIG`（decompiler説明）。
- `npm run typecheck`（tsc -b）通過。sheet7/9＋下流再生成・同型★0維持。逆翻訳が原文一致（近似は明示）。**要実機検証**（特に WXDi-P07-044 E1/E2 の発火）。
- **残（重い機構・別途）**: WX25-P3-062-E1（「他＜毒牙＞効果で相手パワー減少」トリガー）／WX25-P2-009-E1 のリフレッシュ置換実体／E2 のミルトリガー収集（`ON_CARD_MILLED_FROM_DECK` 配線）。

## 機構：【ビート】機構 Phase7 ＝ MAKE_BEAT正規化＋beat対象のプレイヤー選択UI（2026-06-26）

ビート機構の残り2項目を実装し、コア＋UIを完了。①**MAKE_BEAT正規化**＝5箇所でコピペしていた「beat_zone＋beat_became_just へ積む」を共通ヘルパ `addToBeatZone` に集約。②**beat対象のプレイヤー選択UI**＝従来「他のシグニN体を【ビート】に」のコスト支払いがレベル低い順の自動近似だったのを、ON_PLAY/ACTIVATED の両コストモーダルでプレイヤーがゾーン選択できるようにした。

- **正規化（engine）**: `addToBeatZone(state, cards)`（execUtils・**配置のみ**＝元の場所からの除去は呼び出し側）を新設し、`payBeatSigniCost`／`payBeatSigniFromTrashCost`／`INTERNAL_MOVE_TO_BEAT`／`TRASH_SIGNI_TO_BEAT`／`ADD_TO_BEAT` の5経路を集約。挙動不変（既存ビートsmoke全pass）。
- **選択UI（engine）**: `analyzeBeatSigniCost`（{includeSelf, selfZone, otherPart, eligibleOtherZones}）を新設＝UIが「何枚どこから選ぶか」を知る。`payBeatSigniCost` に `selectedOtherZones?: number[]` を追加（指定時はそのゾーンを beat に・**未指定は従来のレベル低い順自動近似でフォールバック**＝CPU/省略時の互換維持）。
- **選択UI（BattleScreen）**: ON_PLAY コストモーダル（`selectedSigniOnPlayBeat`）／ACTIVATED コストモーダル（`selectedSigniActivatedBeat`）に【ビート】対象のゾーン選択を追加（fieldTrash と同型のUI・オレンジ枠「ビート」）。**候補が必要数より多いときだけ選択を要求**（同数以下は自動＝モーダル簡潔化）。`canAfford` に `beatSelectOk`／`actBeatSelectOk` を追加。
- **対象**: 「他のシグニ1体を【ビート】に」系（WXK08-043/068/075・WXK10-041-E3・WDK14-012/014-E2・WXK08-026-E2 等）。WXK08-046（このシグニ＝self only）は選択不要。トラッシュ→beat（WDK14-013）は自動近似のまま（トラッシュピッカーは別途・低優先）。
- **smokeテスト**: `_verifyBeatSelectUI.ts`（analyze の候補解析／selectedOtherZones で高レベルも選べる／未指定は自動近似／self+他1体／候補≤必要数は選択不要 計12ケース・全pass）。既存ビートsmoke計63も全pass（正規化の挙動不変を確認）。
- `npm run typecheck`（tsc -b）通過。**JSON/decompiler 変更なし**（engine＋UIのみ＝同型★に影響なし）。**要実機検証**（選択UIの表示・選んだシグニが beat になるか・ON_BECOME_BEAT連鎖・CPU=自動近似のまま）。
- **→ 【ビート】機構は Phase1-7 でコア＋UI完了**。残はトラッシュ版の選択ピッカー（WDK14-013・低優先）のみ。

## 機構：【ビート】機構 Phase6 ＝ look→pick の【ビート】化宛先＋同レベルバニッシュ（WDK14-008・2026-06-26）

WDK14-008（アーツ「回心転火」）を実装。従来は bare `LOOK_AND_REORDER`（見て下に戻すだけ）で「1枚手札に加え／1枚【ビート】にし／その後この方法で【ビート】にしたシグニと同レベルの相手をバニッシュ」が**丸ごと脱落**していた。LOOK_PICK_CHAIN に【ビート】化宛先を追加し、deferred だった multi-dest pick（手札＋beat）＋後続の同レベルバニッシュを表現・実装。

- **型**: `AddToBeatAction`（'ADD_TO_BEAT'）新設＋EffectAction union 追加／`LookPickChainStage.then` に `'beat'`／`TargetFilter.levelEqLastProcessed`（同じレベル＝`level{min,max}` 同値に解決）。
- **engine**: `lookPickThenAction('beat')`→ADD_TO_BEAT／`applyDirectAction` の ADD_TO_BEAT 分岐（公開デッキ/トラッシュ/手札のカードを beat_zone へ＋`beat_became_just`＝ON_BECOME_BEAT 連鎖）／`resolveDynamicFilter` に levelEqLastProcessed（参照不能＝非シグニ等なら空ヒット `level{min:99,max:-1}`）。
- **chain→banish**: 既存 `SEQUENCE[LOOK_PICK_CHAIN, <action>]`（WX25-P1-039 と同型）に乗る。chain の最終 stage=beat pick が `lastProcessedCards` に残り、後続 BANISH(levelEqLastProcessed) が同レベルの相手シグニのみに候補を絞る。
- **decompiler**: destVerb に 'beat'='【ビート】にし'／filterJa に levelEqLastProcessed。
- **JSON**: WDK14-008-E1 = `SEQUENCE[ LOOK_PICK_CHAIN{reveal4, stages:[hand, beat], remainder:デッキ下}, BANISH{opponent, levelEqLastProcessed} ]`。アンコール－《コイン》は注記（偽陽性・非表現）。
- **smokeテスト**: `_verifyBeatLookPick.ts`（ADD_TO_BEAT で beat_zone/became_just/lastProcessed 記録／levelEq で候補が同レベルのみ・他レベル除外／同レベル不在で空 計9ケース・全pass）。
- `npm run typecheck`（tsc -b）通過・sheet5＋下流再生成・同型★0維持。**要実機検証**（look4→手札/beat の2連ピック対話→同レベルバニッシュ・ON_BECOME_BEAT連鎖）。
- **再利用可**: `then:'beat'` は他の look→beat カードに、`levelEqLastProcessed` は「同じレベル」参照に流用可。

## 機構：【ビート】機構 Phase5 ＝ トラッシュ→beat コスト（beat_signi_from_trash）＋WDK14-013（2026-06-26）

Phase4 で「残」とした **WDK14-013-E1** を実装。「【出】《ビート》[４枚以下]**トラッシュから＜悪魔＞のシグニ１枚を【ビート】にする**：この方法で【ビート】が４枚になった場合、カードを１枚引く」。従来は `mandatory:false`＋cost無し＝dropped で**無発火**（コストも条件も脱落）だった。既存 `beat_signi`（場シグニ→beat）とは別経路の**トラッシュ→beat コスト**を新設。

- **型**: `Cost.beat_signi_from_trash?: { count; filter? }`（effects.ts）。
- **engine（純関数）**: `payBeatSigniFromTrashCost(state, cardMap, count, filter)`（execUtils・payBeatSigniCost と同型の戻り値）。トラッシュから `Type==='シグニ'`＋filter 一致を**先頭から count 枚**（プレイヤー選択UIは別タスク）beat_zone へ移し `beat_became_just` に積む（ON_BECOME_BEAT 連鎖）。**重複カード番号でも count 枚だけ移動**（index ベースで全消し防止）。対象不足は ok=false。
- **BattleScreen**: `executeSigniOnPlayCost` の beat_signi 支払い直後に beat_signi_from_trash を追加（ok=false で発動中止）。**ON_PLAYコストモーダル**に affordability（`beatTrashOkM`＝トラッシュに必要数あるか）と cost ラベル（beat_signi/beat_signi_from_trash 両方）を追加。
- **「この方法で４枚になった場合」**: コスト支払いで beat が+1 された**後**の状態で action を実行するため、`action: CONDITIONAL{ BEAT_CONDITION '４枚'(=ちょうど4) → DRAW1 }` で表現（checkBeatCondition は `^N枚$` を完全一致でサポート済）。支払い前=3枚のときだけ4枚ちょうど→ドロー。
- **decompiler**: costJa に beat_signi_from_trash 描画追加。逆翻訳＝「〈トラッシュから＜悪魔＞のシグニ1枚を【ビート】にする〉あなたの【ビート】が４枚以下の場合、あなたの【ビート】が４枚なら、…1枚引く」＝原文一致。
- **smokeテスト**: `_verifyBeatFromTrash.ts`（filter一致のみ移動／支払い不能／重複番号で count 枚のみ 計12ケース・全pass）。
- `npm run typecheck`（tsc -b）通過・sheet5＋下流再生成・同型★0維持。**要実機検証**（出発動→トラッシュ→beat→4枚ちょうどでドロー・ON_BECOME_BEAT連鎖）。
- **残（beat サブタスク）**: ①beat対象のプレイヤー選択UI（payBeatSigniCost／payBeatSigniFromTrashCost とも自動近似）②MAKE_BEAT アクションの正規化③WDK14-008（公開4→1手札＋1ビート→ビート同レベルの相手バニッシュ）。

## 機構：【ビート】機構 Phase4 ＝ コスト型《ビートアイコン》[４枚以下]使用ゲートの配線（2026-06-26）

「【出】/【起】《ビートアイコン》［４枚以下］…シグニを【ビート】にする：〜」の使用ゲート（自分の【ビート】が条件を満たすかぎり使用可）を9効果に配線。従来 parser はこのゲートを脱落させ無条件発動だった。Phase1 の CONTINUOUS/AUTO ゲートに続き、コスト型【出】/【起】を網羅。

- **JSON配線9効果**: `condition:{type:'BEAT_CONDITION',condText:'４枚以下'}` を付与。ON_PLAY=WXK08-043-E1／068-E1／075-E1・WXK10-041-E3・WDK14-011-E1／012-E1／014-E2、ACTIVATED=WXK08-026-E2／046-E1。
- **engine（収集ゲート）**: 【出】コスト効果の収集 `ownCostOnPlay`（BattleScreen `handleSummonSigni`）が `e.condition` を**未評価**だった→`evalUseCondition` で評価を追加（使用条件を満たさない【出】コスト効果はモーダル提示しない）。**ACTIVATED は既存の発動可否ゲート（line ~11320）が `e.condition` を評価済＝配線のみで機能**（バトンの「ACTIVATEDは e.condition 未評価」は 2026-05-28 に解消済で誤りだった）。
- **収集ゲートの副次効果**: 同filterに該当する唯一の既存条件付き【出】コスト効果 WX06-027-E1（「この能力は対戦相手のエナが４枚以下の場合にしか使用できない」）も正しくゲートされるようになった（従来は無条件提示の潜在バグ）。**ゲートは支払い前の状態で評価**＝「コストの支払いで【ビート】が５枚以上になっても発動する」公式裁定とも整合。
- **decompiler**: 既存 condJa(BEAT_CONDITION) で「あなたの【ビート】が４枚以下の場合、」描画。併せて `TRASH_SIGNI_TO_BEAT`／`INTERNAL_MOVE_TO_BEAT` のSTUB説明も追加（WDK14-011-E1 等の生ID解消）。
- **smokeテスト**: `_verifyBeatUseGate.ts`（[４枚以下]境界=4可/5不可・[５枚以上]逆ゲート 計6ケース・全pass）。
- `npm run typecheck`（tsc -b）通過・sheet4/5＋下流再生成・同型★0維持。**要実機検証**（[４枚以下]ゲートの開閉／コスト支払いで5枚超過時も発動）。
- **残（次の beat サブタスク）**: ①**WDK14-013-E1**＝「トラッシュから＜悪魔＞シグニ1枚を【ビート】にする」コスト＋「この方法で【ビート】が4枚になった場合」条件＝**新コスト機構が要る**（現状 mandatory:false＋cost無し＝dropped で無発火）②beat対象のプレイヤー選択UI（payBeatSigniCost はレベル低い順の自動近似）③MAKE_BEAT アクションの正規化。

## 機構：【ビート】機構 Phase3 ＝ cost.beat_signi（シグニを【ビート】にするコスト）の支払い実装（2026-06-26）

「【出】/【起】…シグニを【ビート】にする：〜」のコストが engine 未処理（＝コスト未払いで素通り・beat 化が起きずON_BECOME_BEATも不発）だったのを実装。これで beat_signi 経由でも beat_zone へ入り、Phase2 の ON_BECOME_BEAT チェーンが発火する。

- **`payBeatSigniCost`（execUtils・純関数）**: `cost.beat_signi` は count のみ保持するため、対象の意味を効果元 EffectText から導出＝「このシグニを」(self)／「このシグニと他のシグニN体を」(self＋他N)／「他の・以外のシグニ」(excludeSelf)／「シグニN体」(任意)。対象を場から beat_zone へ移し `beat_became_just` に積む（Phase2 watcher が発火）。**近似：「他の」シグニはレベル低い順に自動選択**（プレイヤー選択は未実装）。対象不足は ok=false で支払い不能。
- **BattleScreen**: ACTIVATED（`executeSigniActivated`）/ ON_PLAY（`executeSigniOnPlayCost`）両支払い経路の fieldTrash 直後に beat_signi 支払いを追加（ok=false で発動中止）。発動可否に「場にシグニが1体以上」チェックを追加（精密な不足は支払い時 ok=false）。
- **decompiler**: costJa に `beat_signi`='シグニN体を【ビート】にする' を追加。
- **smokeテスト**: `_verifyBeatSigniCost.ts`（self/excludeSelf＋低レベル選択/self＋他1体=2枚/支払い不能/ルリグ任意 計14ケース・全pass）。
- `npm run typecheck` 通過・sheet4/5＋下流再生成・同型★0維持。**要実機検証**（出/起の発動→beat化→ON_BECOME_BEAT連鎖・CPU）。
- **残（次の beat サブタスク）**: ①コスト型《ビート》[4枚以下]使用ゲート（ON_PLAYは condition で配線可・**ACTIVATEDは発動可否が e.condition 未評価なので enforcement追加が要る**）②beat対象のプレイヤー選択UI（現状レベル低い順の自動近似）③MAKE_BEATアクションの正規化（効果による beat 化＝TRASH_SIGNI_TO_BEAT等の整理）。

## 機構：【ビート】機構 Phase2 ＝ ON_BECOME_BEAT トリガー（このカードが【ビート】になったとき・2026-06-26）

「【自】：このカードが【ビート】になったとき〜」のトリガーを新設。従来は **timing が ON_PLAY／ON_TURN_END に誤parse**（本体アクションは概ね正・トリガーだけ別物）＝発火しない／誤発火していた8枚を正す。`drive_became_just`/ON_SIGNI_BECOMES_DRIVE と同型のフラグ＋watcher 設計。

- **型**: timing `ON_BECOME_BEAT`（effects.ts）／`PlayerState.beat_became_just?: string[]|null`（index.ts。drive_became_just と同型）。
- **engine（発火元）**: `INTERNAL_MOVE_TO_BEAT`/`TRASH_SIGNI_TO_BEAT`（execStubPart3）でカードが beat_zone へ入るとき `beat_became_just` に積む。
- **BattleScreen**: ①watcher useEffect（`beat_became_just` を検出→収集→スタック投入→フラグクリア。drive watcher と同型・CPU代行対応）②`collectBeatBecameTriggers`（**self=なったカード自身＝beat_zone在中なので effectsMap から直接引く**／any_ally・any=オーナーの場のシグニ＝「あなたの他のカードが【ビート】になったとき」WDK14-014。usageLimit対応）。
- **decompiler**: timingJa に `ON_BECOME_BEAT`='このカードが【ビート】になったとき'。
- **JSON修正8枚**: WXK08-045（＋beat3条件・GRANT先を自＜悪魔＞へ）／070（＋beat5）／074／077／WXK10-069（＋beat2）／WDK14-014（any_ally＋ターン1回）／015／017。逆翻訳が原文一致。
- **smokeテスト**: `_verifyBecomeBeat.ts`（INTERNAL_MOVE_TO_BEAT/TRASH_SIGNI_TO_BEAT がフラグを立てる・6ケースpass）。
- `npm run typecheck` 通過・sheet4/5＋下流再生成・同型★0維持。**要実機検証**（watcher の発火・self/any_ally の出し分け・CPU代行）。
- **残（beat_signi コスト未処理）**: 出/起「シグニを【ビート】にする」の `cost.beat_signi` が engine 未処理＝この経路の beat 化＋ON_BECOME_BEAT 発火は未（INTERNAL_MOVE_TO_BEAT/TRASH_SIGNI_TO_BEAT 経路のみ動く）。コスト処理の実装が次の beat サブタスク。

## 機構：【ビート】機構 Phase1 ＝《ビートアイコン》[条件]ゲートの配線（2026-06-26・着手中）

§5大型機構【ビート】（44枚）に着手。**Phase1＝《ビートアイコン》[条件]ゲート**（「自分の【ビート】が条件を満たすかぎり能力が有効」）を実装・配線。従来 parser はこのゲートを**完全に脱落**させていた（例: WXK08-073 常《ビート》[1枚以上]＋5000 が無条件化、WXK08-041 自《ビート》[条件]も条件なし）。既存基盤（`beat_zone`／`checkBeatCondition`／ENDフェーズ回収／beat化STUB）は流用。

- **engine**: `BEAT_CONDITION` を `ActiveCondition` union に追加（従来 `Condition` のみ）＋`checkActiveCondition` に評価追加（CONTINUOUS の常《ビート》ゲート用。`ownerState.field.beat_zone` を `checkBeatCondition` で判定）。AUTO/ACTIVATED/ON_PLAY は既存の `eff.condition`→`evalUseCondition`→`evalCondition`(BEAT_CONDITION) 経路で機能（配線のみ）。
- **checkBeatCondition 拡張**: 「同じレベルがN枚以上」パターンを新設（WXK10-041-E2）。既存の枚数/レベル各種は流用。
- **decompiler**: BEAT_CONDITION を `あなたの【ビート】が{条件}` に自然文化（CONTINUOUS＝`《…であるかぎり》`が公式表現と一致／AUTO＝`…の場合、`。条件末尾 以上/以下/枚 に「の」補正も追加）。
- **JSON配線12効果**: AUTO=condition／CONTINUOUS=activeCondition で `BEAT_CONDITION` 付与。WXK08-026-E1／041-E1,E2／042-E1,E2／044-E1／067-E1／073-E1(＋thisCardOnly補正)／WXK10-041-E1,E2／WDK14-001-E1／WDK14-011-E2。
- **smokeテスト**: `_verifyBeatCondition.ts`（枚数/レベル/同じレベル/activeCondition経路 計16ケース・全pass）。
- `npm run typecheck` 通過・sheet4/5＋下流再生成・同型★0維持。**要実機検証**（beat_zone へのカード投入後にゲートが正しく開閉するか）。
- **Phase1 残**: ①コスト型《ビート》[4枚以下]＋「シグニを【ビート】にする」の使用ゲート（WDK14-011-E1/012/013・WXK10-041-E3 等の出/起）②**ON_BECOME_BEAT トリガー**（「このカードが【ビート】になったとき」＝WXK08-045/070/074/077・WXK10-069・WDK14-014/015/017。現状 ON_TURN_END 等に誤parse・未実装）③MAKE_BEAT アクションの正規化。→ TODO/バトン参照。

## 逆翻訳器：高頻出STUBの説明文を追加（`[STUB:X]` 生ID残存を ~140→54 に削減・2026-06-26）

アクション生IDに続き、`[STUB:X]` の生IDのまま出ていた高頻出STUBに `actionJa` の STUB ブロックへ説明文を追加。**複数出現STUBを全解消**（残54件は全て1回のみの深いテール）。

- **追加(複数出現)**: GRANT_ABILITY_INNER_TEXT(18・テキスト検出型)／GUARD_EXTRA_COST_BY_OPP(9)／LEVEL_REFERENCE_OVERRIDE(8)／POWER_MOD_BY_HAND_COUNT(6)／DOUBLE_POWER_MINUS(6)／BANISH_TO_LRIG_TRASH_INSTEAD(5)／DECLARE_COLOR(4)／SET_ACCE_CHOICE／MULTI_ZONE_ATTACK／TRASH_ALL_SIGNI_AND_KEY／SPELL_COST_REDUCTION_BY_TRASH_COUNT／SIGNI_CANT_BOUNCE_FROM_FIELD／PREVENT_SIGNI_ABILITY_LOSS_BY_OPP／PREVENT_POWER_MINUS_BY_OPP／NEGATE_ATTACK_ON_TRIGGER／CHOOSE_SAME_OPTION_TWICE／INHERIT_OPP_LRIG_TYPE／GRANT_LEAVE_PLACE_PENDING。
- **decompiler表示のみ**（engine/JSON不変）。`npm run typecheck` 通過・全シート＋下流再生成・同型★0維持。
- **残54件**＝1回のみ出現の単発STUB（WHITE_SIGNI_ABILITY_PROTECT 等の保護系・特殊ルール系）。費用対効果が下がるので後続セッションで随時。

## 逆翻訳器：未描画アクション21種を自然文化（生ID `[アクション:X]` 残存を全解消・2026-06-26）

`decompileEffects.ts` の `actionJa` が未対応で `[アクション:X]` の生IDのまま出ていた21アクション型を自然文描画に追加。**全シートで生アクションID残存=0**（約180箇所→0）。逆翻訳の網羅性が上がり、P1「逆翻訳が原文一致」の判定が正確になる。**decompiler表示のみの変更**（engine/JSON不変・低リスク）。

- **高頻出**: RECOLLECT_GATE(63)／PLACE_VIRUS(31)／AWAKEN_SIGNI(30)／GRANT_ACCE_HOST_ABILITY(20)／GROW_COST_REDUCTION(7)／GAIN_BOND(6)／DISCARD_BOTH(5)／LRIG_LIMIT_MODIFY(3)。
- **残り**: POWER_MODIFY_BY_SOURCE／LOOK_AT_DECK_AND_LIFE／GRANT_SIGNI_ABOVE_ABILITY／NAME_BAN／BLOCK_CARD_USE／COST_SUBSTITUTE／VARIABLE_DISCARD_AND_DRAW／SELF_TRASH_PREVENT／REVEAL_UNTIL_BANISH_SAME_LEVEL／ENERGY_CHARGE_BY_FIELD_COUNT／COLOR_INHERIT／FORCE_FRONT_SIGNI_ATTACK。
- `npm run typecheck` 通過。全10シート＋下流再生成済み。同型★0維持。**残る生ID＝`[STUB:X]`系のみ**（STUBS.md管理・各STUBの意味理解が要るので別途）。

## 機構：傀儡場出しの汎用化（count/optional/levelLteTrigger）＋ WXK10-055 全効果再構築（2026-06-26）

§5の大型機構。`STEAL_OPP_TRASH_PUPPET`（相手トラッシュからシグニを傀儡状態で自場へ）を**パラメータ化**し、WXK10-055（千匹の童話　センショク）のE2/BURST/E1を正しく表現・実装。従来は丸ごと誤parse（E1=相手バニッシュ＋デッキ手札／E2・BURST=自トラッシュから自身を場出し）だった。

- **型**: `StubAction.puppetParams?: { count?; optional?; levelLteTrigger? }`（effects.ts）。省略時は従来挙動（ベット2/非ベット1・必須・レベル制限なし）。
- **engine（execStubPart1）**: `STEAL_OPP_TRASH_PUPPET` が `puppetParams` を読む。`levelLteTrigger` は候補を**トリガー元シグニ（`ctx.triggeringCardNum`）のレベル以下**に限定、`count`/`optional` を `selectOrInteract` に反映。
- **被バニッシュ参照**: `BattleScreen` の `battleBanishEntries` に `triggeringCardNum: banishedOpCardNum` を付与（「そのシグニのレベル以下」用。ON_SIGNI_BANISH_BATTLE 経路）。
- **小機構（汎用）**: `execTrash` の SIGNI 固定数経路が `a.optional` を尊重するよう修正（従来 false 固定）。「あなたのシグニ１体を場からトラッシュに置いてもよい」をスキップ可に。E1 は pure JSON `SEQUENCE[TRASH{optional}, CONDITIONAL{IS_MY_TURN→TRANSFER_TO_HAND(トラッシュの＜美巧＞)}]` で表現（スキップ時は resumeSelectTarget の stripDidItConditional で「そうした場合」を除去）。
- **decompiler**: `puppetParams` 付き STEAL_OPP_TRASH_PUPPET を枚数/レベル制限/任意で自然文描画。
- **JSON**: WXK10-055 の E1（ON_ATTACK_SIGNI・トレード回収）／E2（ON_SIGNI_BANISH_BATTLE・傀儡optional+levelLte）／BURST（傀儡必須1枚）を再構築。
- **smokeテスト**: `_verifyPuppetGeneralize.ts`（levelLteTrigger 候補絞り／BURST必須全候補／該当なしdone 計8ケース・全pass）。
- `npm run typecheck` 通過。sheet4＋下流再生成済み。逆翻訳が原文一致・同型★0。**要実機検証**（傀儡の離場回収・E1コスト支払い対話）。

## 機構実装④：《自分ターン》/《相手ターン》AUTOトリガー基盤 ＋ 配線30枚（2026-06-26）

AUTO能力のターン限定発火（「【自】《相手ターン》：〜のとき」）を実装。従来 parser は CONTINUOUS のみ activeCondition 化し **AUTO/ACTIVATED は見送り**（effectParser.ts:1868 のコメント）＝ターン限定が脱落していた。**スタック投入の単一チョークポイント**でゲートする低リスク設計を採用（~40 箇所ある AUTO 収集点を個別に触らない）。

- **型**: `triggerCondition.turnOwner?: 'self' | 'opponent'`（effects.ts）。self=効果オーナーのターン、opponent=相手のターンのみ発火。
- **engine（単一チョーク）**: `effectStack.ts` の `initStack`/`pushToStack` 冒頭で `turnGateOk(entry, turnPlayerId)` フィルタ。`turnOwner` 無しは常に通す（既存挙動不変）。`self` は `entry.playerId===turnPlayerId`、`opponent` はその否定。**全AUTOトリガーは必ずスタックを経由するため、ここ1箇所で全経路をカバー**。
- **decompiler**: 【自】直後に `《自分ターン》`/`《相手ターン》` を描画。
- **配線30枚**: 単一AUTO 25枚＋複数AUTOのうち対象効果を特定できた5枚（WXDi-P06-033-E2／WX24-P2-054-E1／WX24-P4-043-E1／WX25-P3-054-E2／WX25-CP1-046-E1）。`triggerCondition.turnOwner` を該当AUTO効果に付与（JSON parse→stringifyでキー順保持・差分は該当エントリのみ）。
- **smokeテスト**: initStack/pushToStack の self/opp×ターン一致/不一致/untagged 計6ケースを確認（全pass）。
- **未配線（別途・カード自体が誤parse）**: WXDi-P07-044（ON_PLAY本体がADD_TO_FIELD誤り）／WX25-P2-009（AUTOがACTIVATED化＝0 AUTO）／WX25-P3-062（「パワーが減ったとき」トリガー無し）。WX25-CP1-060 はマーカー付与したE2の本体がWD21型STUB誤parse（マーカー自体は正・本体は別課題）。
- `tsc` 通過。sheet7/8/9＋下流再生成済み。同型★ 0件。**要実機検証**（特に相手ターン中の発火/非発火）。

## 小機構：keyword フィルタの複数OR対応 ＋ WX24-P3-032（2026-06-26）

個別★精査。`TargetFilter.keyword` を `string | string[]` に拡張（配列＝いずれかを持つ＝OR）。併せて **【ランサー（条件）】等の括弧付き変種**も `【kw（` 前方一致で含めるよう matchesFilter を修正（公式ルール「【ランサー（条件）】は【ランサー】に含まれる」）。

- **型**: `keyword?: string | string[]`（effects.ts）。
- **matchesFilter**（execUtils.ts）: 配列を OR 判定。各 kw を `【kw】`/`《kw》`/`【kw（`（変種）で照合。
- **decompiler**: `【X】か【Y】…を持つ` と連結描画（単一は従来どおり）。
- **配線 WX24-P3-032**: CHOOSE② のバウンス対象が「【アサシン】か【ランサー】か【Ｓランサー】か【ダブルクラッシュ】を持つ相手シグニ」だったのにキーワード制限が脱落していた→ `keyword:["アサシン","ランサー","Ｓランサー","ダブルクラッシュ"]`（カード印字に合わせ全角Ｓ）を付与。
- `tsc` 通過。sheet9＋下流再生成済み。同型★ 0件。**要実機検証**。

## 小機構：levelLteDiscardSigni（コストで捨てたシグニのレベル以下）＋配線2枚（2026-06-26）

「`handDiscardSigni` コストで捨てたシグニのレベル以下」を参照する動的フィルタを新設。`last_activated_discard_level_sum` は別系統（discardVarCards）専用で **handDiscardSigni の捨て札レベルは記録されていなかった**（パワーは `last_discarded_signi_power` で記録済だがレベルは欠落）ため、レベル記録から追加。

- **状態**: `PlayerState.last_discarded_signi_level`（index.ts）。
- **記録**: BattleScreen のコスト支払いで `discardedCards[0]` の Level を記録（`last_discarded_signi_power` の隣）。クリアはターン境界2箇所（line~4117/~4378）に追記。
- **型/解決**: `TargetFilter.levelLteDiscardSigni`（effects.ts）。`resolveDiscardLevelFilter(filter, casterState)` を新設し **常にキャスター（ctx.ownerState）の値**で `level.max` に解決（対象が相手でもキャスターの捨て札を参照するため、target-owner を渡す resolveDynamicFilter とは別経路）。execTransferToHand（TRASH_CARD源）と execTransferToDeck（SIGNI源）の filter 前処理に組込み。
- **decompiler**: filterJa に「この方法で捨てたシグニのレベル以下の」。
- **配線2枚**: WX22-046（トラッシュから＜天使＞＋レベル以下を手札へ。天使クラス自体も脱落していたので併せて復元）／WXK10-044-E2（捨てたレベル以下の相手シグニをデッキトップへ）。
- **カバレッジ注意**: `last_discarded_signi_*` を設定するのはコスト支払いの1経路のみ＝既存パワー版と同等。別経路（CPU等）での網羅は power版と共通の課題として残置。
- `tsc` 通過。sheet3/4＋下流再生成済み。同型★ 0件。**要実機検証**。

## levelLteLastProcessed：engine解決の穴埋め（execBounce/execSearch）＋WXEX2-17（2026-06-26）

前項で新設した `levelLteLastProcessed`（および既存 `powerLteLastProcessed`）が、**一部アクションの実行経路で `resolveDynamicFilter` に `lastProcessedCards` が渡っておらず解決されない**穴を発見・是正（＝逆翻訳に出るのにエンジンが無視する偽陽性の防止）。

- **`execBounce`**: `resolveDynamicFilter` を**全く呼んでいなかった**。追加（`lastProcessedCards`/`effectivePowers` 付き）。→ 前項 **WX21-022**（BOUNCE のレベル制約）が実際に効くようになった（解決経路の確認：TRANSFER_TO_HAND → `resumeSelect` が `lastProcessedCards=選択シグニ` を設定 → continuation の BOUNCE が解決）。
- **`execSearch`**: 動的フィルタ解決が `colorMatchesLrig` 系のときだけだったのを**常時解決**（no-op安全）に変更し `lastProcessedCards` を渡すよう修正。
- **配線 WXEX2-17-E2**: SEARCH（デッキから美巧を探して場出し）の filter に `levelLteLastProcessed` を付与。直前の self-BANISH（execBanish が lastProcessedCards に記録）したシグニのレベルを参照。
- **未対応（別機構が要る・本フィルタでは不可）**: WX22-046・WXK10-044-E2 は参照対象が**コストで捨てたシグニ**（lastProcessedCards ではない＝「コスト捨てシグニのレベル」追跡が別途必要）。WXK10-055 は E2 が丸ごと誤parse（バトルバニッシュ時の傀儡場出しが「自身をトラッシュから場出し」に化け）＝個別再構築案件。
- `tsc` 通過。sheet3＋下流再生成済み。同型★ 0件。**要実機検証**（特に BOUNCE/SEARCH のレベル制約解決）。

## 小機構：levelLteLastProcessed フィルタ ＋ 配線3枚（2026-06-26）

「この方法で〈処理／場に出し／手札に加え〉たシグニの**レベル以下**の対戦相手のシグニ」という動的フィルタを新設（既存 `powerLteLastProcessed`＝パワー版の鏡）。

- **型**: `TargetFilter.levelLteLastProcessed?: boolean`（effects.ts）。
- **解決**: `resolveDynamicFilter`（effectExecutor.ts）で `lastProcessedCards[0]` のレベルを読み `level.max` に解決（powerLte… と同位置・同形）。
- **decompiler**: `filterJa` に「この方法で処理したシグニのレベル以下の」を追加。
- **配線3枚**:
  - **WX21-022-BURST**: BOUNCE 対象フィルタに付与（トラッシュ→手札したシグニのレベル以下の相手を手札に戻す）。元々アクションは在り、レベル制約のみ欠落＝1フィールド追加。
  - **WX24-P3-026-E1**: SEND_TO_ENERGY 対象フィルタに付与（同上・エナ送り）。1フィールド追加。
  - **WX25-P1-039**: 「並べ替える」退化を全再構築＝`SEQUENCE[LOOK_PICK_CHAIN{原子hand1, 原子field1}, BANISH{levelLteLastProcessed}]`（機構③ field 宛先＋本フィルタの合わせ技）。
- **未配線（同フィルタで表現可能・次回）**: WX22-046（捨てた→トラッシュ探し手札）／WXEX2-17（バニッシュした→デッキ探し場出し）／WXK10-044（捨てた→相手デッキトップ）／WXK10-055（バトル相手→傀儡場出し）。WXK11-036 は LRIG レベル基準で別。
- **近似メモ**: ピックが0枚（「1枚まで」で未配置）の場合 ref 不在＝max 無し（任意対象）に縮退。原文の含意（配置時のみ）からは緩いが許容。
- `tsc` 通過。sheet2/9＋下流再生成済み。同型★ 0件。**要実機検証**。

## 機構実装③：LOOK_PICK_CHAIN の field 宛先 ＋ 配線3枚（2026-06-26）

「デッキを見て、その中から〈X〉を手札に加え、〈Y〉を**場に出し**、残りを…」の **hand＋field 二目的pick** を `LOOK_PICK_CHAIN` で表現可能にした。これまで `then` は hand/energy/trash のみで、場出しを含む二目的が `LOOK_AND_REORDER`（「並べ替える」）に退化・脱落していた。

- **型**: `LookPickChainStage.then` に `'field'` を追加（effects.ts）。
- **実行（engine変更は最小）**: `lookPickThenAction('field')` → `ADD_TO_FIELD`。**`resumeSearch` の既存 `ADD_TO_FIELD` 分岐**が「複数枚を1枚ずつゾーン選択でチェーン配置し、afterAction＋外側 continuation を全配置後に実行」を既に行うため、stage 間の continuation（残りステージの LOOK_PICK_CHAIN）と remainder 処理がそのまま合成される（追加のフロー改修不要）。
- **decompiler**: `destVerb` に `field → '場に出し'` を追加。
- **配線3枚**:
  - **WXDi-P16-035**（look5→カード1手札＋シグニ1場＋【出】抑止）= `SEQUENCE[LOOK_PICK_CHAIN{hand1, field1}, BLOCK_ACTION ON_PLAY_ABILITY]`。15巡の後回し解消。
  - **WXDi-P02-020**（look5→カード1手札＋シグニ2場＋【出】抑止）= 同型（field pickCount2）。15巡の後回し解消。
  - **WX24-P1-026**（look5→＜地獣＞1手札＋＜地獣＞1場＋ランサー付与）= `SEQUENCE[LOOK_PICK_CHAIN{地獣hand1, 地獣field1}, GRANT_KEYWORD{targetsLastProcessed, ランサー, ターン終了時まで}]`。`targetsLastProcessed` が field 配置した signi（lastProcessedCards）を参照。
- **後回し（個別の重い後続効果が残る）**: WX24-P1-017・WX25-P3-038（場出しシグニへ**引用AUTO付与**＝GRANT_EFFECT要・引用付与タスク）／WX25-P1-039（**場出しシグニのレベル以下**の相手バニッシュ＝`levelLteLastProcessed` フィルタ新設要）／WX25-CP1-025（hand-only＋「白を手札に加えた場合」条件）／WX26-CP1-019（CHOOSE2分岐×look→ener/hand）。
- `tsc` 通過。sheet7/8/9＋下流再生成済み。同型★ 0件。**要実機検証**（field ステージのゾーン選択チェーン・残りデッキ下処理）。

## 文型★脱落バグ17巡目：look→pick→エナ／手札＋エナ二目的 が「並べ替える」退化 3枚（2026-06-26）

16巡の「手札」版に続き、**エナ**ピック退化と**手札＋エナの二目的pick**を是正。二目的は既存 `LOOK_PICK_CHAIN`（stages: hand/energy/trash 対応）で表現（**field 宛先は未対応**＝下記後回し）。

- **WXK02-045**（純エナ）: SEQUENCE[LOOK_AND_REORDER, STUB CLASS_SIGNI_TO_ENERGY, …] → `REVEAL_AND_PICK{filter:＜遊具＞シグニ, pickCount2 upTo, then:ADD_TO_ENERGY, remainder:deck/top}`。
- **WXDi-P14-077-E2**（手札＋エナ）: `LOOK_AND_REORDER` → `LOOK_PICK_CHAIN{revealCount3, stages:[＜電音部＞シグニ1→hand, ＜電音部＞シグニ1→energy], remainder:bottom}`。
- **WX26-CP1-021**（手札＋エナ＋トークン）: `SEQUENCE[LOOK_PICK_CHAIN{＜プリオケ＞カード1→hand, 1→energy}, STUB:PLACE_LIMIT_UPPER]`（リミットアッパー設置は既存STUB・engine実装済）。
- **後回し（要 LOOK_PICK_CHAIN の field 宛先拡張＝mechanism）**: look5→**手札＋場**の二目的pick（WX24-P1-017/026・WX25-P1-039・WX25-P3-038・WX25-CP1-025・WXDi-P16-035・WXDi-P02-020・WX26-CP1-019）。`LookPickChainStage.then` に `'field'` を足すと execLookPickChain の SEARCH→ADD_TO_FIELD がゾーン選択の入れ子interactionになり、resumeSearch の再入設計が要る（TODO §6 に候補追記）。
- `tsc` 通過。sheet3/8/9＋下流再生成済み。同型★ 0件。**要実機検証**。

## 文型★脱落バグ16巡目：look→pick→手札 が「並べ替える」に退化した系統 16枚（2026-06-26）

逆翻訳が `LOOK_AND_REORDER`（「デッキの上N枚を並べ替える」）に**退化し、原文の「その中から〈フィルタ〉を公開し手札に加え、残りをデッキの一番下に置く」(pick→手札) が脱落**していた系統を横展開で是正。8〜11巡の「REVEAL_AND_PICK then副作用」系の同類で、今回は **then が丸ごと消えて reorder だけ残った**ケース。

- **抽出**: 全 decompile_sheet を走査 →「逆翻訳に『並べ替える』を含むが『手札に加え/エナ/場出し』を欠く」かつ「原文に『その中から…手札に加え』」を満たす75件 → うち場出し/エナ複合・post条件・split宛先・絆獲得・リコレクト等を除外し、**純粋な単目的 look→手札 の16枚**を確定。
- **修正型**: `LOOK_AND_REORDER` → `REVEAL_AND_PICK{revealCount, filter, pickCount(+pickUpTo), then:ADD_TO_HAND, remainder:deck/bottom}`。decompiler は filterJa（cardClass=＜X＞の・hasGuard=《ガードアイコン》を持つ）＋pickNoun（既定シグニ／スペルは pickNoun:"スペル"／無フィルタは「カード」）で自然文化。
- **16枚**: WX16-054（怪異2まで）／SP27-009（天使か悪魔1）／WXDi-D04-012（スペル1）／WXDi-D09-H23(B)（カード3まで）／WXDi-P01-051(B)（シグニ2まで）／WXDi-P06-048/065/074/081(B)（カード3まで×4）／WXDi-P08-038(B)（CHOOSE②カード2まで）／WXDi-P11-039-E2（カード1まで）／WXDi-P16-060（ガードアイコン持つシグニ1）／WX24-D1-04-E2（カード2まで）／WX24-P1-053（宝石1）／WX24-P2-061（龍獣1）／WX25-P3-054-E2（迷宮1）。
- **残存（今回は触らない・pre-existing）**: WX24-P2-061「対戦相手が《無》を支払わないかぎり」prevent-cost／WX25-P3-054-E2「《解明の巫女 ユキ》が場にいる場合」在場条件／WX24-P1-053「このターン手札を捨てていた場合」履歴条件 ＝ いずれも元々JSON未モデル。今回は look→手札 本体のみ復元（逆翻訳は厳密改善＝退化解消）。
- **後回し（multi-dest／要 LOOK_PICK_CHAIN）**: WX24-P1-017/026・WX25-P1-039・WX25-P3-038・WX25-CP1-025 等（look5→手札＋場の二目的）。
- `tsc` 通過。sheet2/5/7/8/9＋下流再生成済み。同型★ 0件。**要実機検証**。

## 文型★脱落バグ15巡目：場出しシグニの【出】能力抑止（ON_PLAY_ABILITY）5枚（2026-06-26）

「デッキを見てその中からシグニを場に出す。そのシグニの【出】能力は発動しない」の **「発動しない」が逆翻訳から脱落**していた系統を横展開で是正。語彙は既存 `BLOCK_ACTION {actionId:'ON_PLAY_ABILITY', target:PLAYER self}`（参照: WX25-CP1-006 が確立済み。decompiler は「その【出】能力は発動しない」を描画）。`SEQUENCE[<場出し>, BLOCK_ACTION]` の形に統一。

- **抽出**: 全 decompile_sheet を走査し「原文に『能力は発動しない』を含むが逆翻訳に『発動しない』を欠く」34件を列挙→ 注記系（「コストのない【出】能力は発動しないことを選べない」＝ルール注記、非効果）と handoff既知の複雑札を除外し、クリーンな5枚を確定。
- **WX25-CP1-037**（虚妄のサンクトゥム攻略会議）: 既存 REVEAL_AND_PICK→ADD_TO_FIELD に BLOCK_ACTION を追加（SEQUENCE化）。
- **WXK10-017-E3**（クリミナル・リタッチ）: 既存 REVEAL_AND_PICK→ADD_TO_FIELD（公開1・トップ戻し）に BLOCK_ACTION 追加。
- **WXDi-D05-007 / WXDi-D02-18AT / WX24-P1-036**: 逆翻訳が `LOOK_AND_REORDER`（「並べ替える」）に**退化し場出し自体も脱落**していたのを `REVEAL_AND_PICK→ADD_TO_FIELD`＋BLOCK_ACTION に再構築。フィルタ＝D05無条件1枚／D02-18AT `cardClass:バーチャル` 2枚まで／P1-036 `level:{max:2}` 2枚まで（`pickUpTo:true`）。
- **エンジン整合**: REVEAL_AND_PICK 経由の場出しシグニは自身の【出】を自動発火する専用パスが無い（REVEAL_UNTIL_TO_FIELD のみ持つ）＝現状エンジンも【出】を撃たない。よって原文「発動しない」とエンジン挙動は整合（偽陰性なし）。BLOCK_ACTION は逆翻訳のテキスト整合＋将来の発火実装時のガードを兼ねる。
- **後回し（多目的pick）**: WXDi-P16-035・WXDi-P02-020（look5→手札最大1＋場最大1〜2＝`LOOK_PICK_CHAIN` 要・別途）。
- `tsc` 通過。sheet4/7/9＋下流再生成済み。同型★ 0件。脱落疑いは内容是正済みだが文数メトリクス（。区切り）の粗さで件数は据え置き（242枚前後）。**要実機検証**。

## 機構実装②：自/相手ライフクラッシュ履歴条件（LIFE_CRASHED_THIS_TURN）5枚（2026-06-26）

「このターンに（自分/相手の）ライフクロスがN枚クラッシュされていた場合」を判定する条件機構を新設。

- **カウンタ**: `PlayerState.life_crashed_this_turn`（index.ts）＝このターンに自分のライフがクラッシュされた枚数。
- **加算**: 全クラッシュ経路で加算＝`crashOneLife`（BattleScreen・戦闘/ダブルクラッシュ、+1）と `execLifeCrash`（effectExecutor・効果、+crashed枚数）。
- **条件**: `LIFE_CRASHED_THIS_TURN { owner, operator, value }`（effects.ts）を `evalCondition`（execUtils.ts）に追加。
- **リセット**: ターン境界の3リセットブロック（PvP通常終了 line~4053・PvP確認後 line~4350・CPU line~9687）で `undefined` に。ON_TURN_END 効果は `collectTurnTriggers` でリセット前に解決されるので、ターン終了時効果も正しく読める。
- **decompiler**: `condJa` に専用描画追加。
- **JSON（5枚）**: WX18-063（自≥1→エナチャージ）／WX18-064（自≥1→ドロー）／WX11-021②（自≥1→デッキトップをライフ。「相手効果によって」限定は近似）／WD21-011-E2（ライフ0枚→ライフ追加 ＋ 自≥2→ライフ追加 の2分岐を復元）／WXDi-P16-065-E1（**相手**≥2→エナチャージ）。
- **後回し**: WXDi-P11-001（「**直前のターン**に」＝前ターン跨ぎ保持が別途必要）。
- `tsc` 通過。sheet1/2/4/8＋下流再生成済み。同型★ 0件。脱落疑い 242→241枚。**要実機検証**。

## 機構実装①：コスト増加（NEXT_OPP_TURN型）2枚＋基盤配線（2026-06-26）

「次の対戦相手のターン、対戦相手のアーツ/スペルのコストが《無×N》増える」遅延・期間型コスト増加を実装。**既存の `cost_modifiers` ストアは書かれるだけでコスト計算で読まれていなかった**（＝機構の穴）。NEXT_OPP_TURN 型は `power_mods_until_opp_turn` と同型のライフサイクルで実装。

- **型**: `CostIncreaseAction.duration` に `'NEXT_OPP_TURN'` 追加（effects.ts）。
- **ストア**: `PlayerState.opp_cost_up_until_opp_turn`（index.ts）＝キャスター側へ保持。
- **実行**: `execCostIncrease`（effectExecutor.ts）で duration==='NEXT_OPP_TURN' のとき self（キャスター）へ push。
- **コスト計算読み取り（穴を塞ぐ）**: BattleScreen `activeCostMods` memo で、相手(opS)の `opp_cost_up_until_opp_turn` を `forMy` へ加算（自分のアーツ/スペルコストに反映）。既存の forMy increase 適用経路にそのまま乗る。
- **クリア**: ターン開始時クリア2箇所に `opp_cost_up_until_opp_turn: undefined` を追加（`power_mods_until_opp_turn` と同位置）。
- **decompiler**: COST_INCREASE に NEXT_OPP_TURN 接頭辞を追加。
- **JSON**: WXK09-006 タマヨリヒメ（E1②コスト軽減マーカー誤り→COST_INCREASE arts+spell《無×2》NEXT_OPP_TURN。①＜天使＞フィルタ・③相手手札0条件 `HAND_COUNT eq0` も補完）／SPDi43-31 Nフライングギター（E1を公開→レベル分岐に再構築：Lv1相手トラッシュ/Lv2コスト増加/Lv3全自シグニ+3000）。
- **後回し**: WXK11-003「このターン」型（clearが自ターン終了で別）／WXDi-P06-031・P15-033・P13-072（起動能力コスト増加＝別collector）／WX20-Re20・PR-K056・SP38-005（自アーツコストが選択数依存・別問題）。
- `tsc` 通過。sheet4/10＋下流再生成済み。同型★ 0件。脱落疑い 243→242枚。**要実機検証**（コスト増加が使用モーダルの必要エナに反映・相手ターンで適用/クリアされるか）。

## 保護系キーワードの owner誤り是正 14巡目（2枚・2026-06-26）

別系統「**保護系キーワード（バニッシュされない等）を対戦相手に付与**」を構造抽出（GRANT_KEYWORD で keyword が保護系 かつ target.owner==='opponent'）。保護を相手に与えるのは無意味＝owner誤り。全網羅で本物2枚を是正。

- **WXDi-P03-010 アキノ＊クラップ**（アシストルリグ）: E2「あなたのシグニ1体に『バニッシュされない』付与」が owner:opponent に誤parse → self。（「対戦相手のターンの場合」条件は IS_OPPONENT_TURN が実行時判定不可のため近似省略）
- **WXK07-029 羅菌姫 プロテイン**: E1「あなたの＜微菌＞のシグニに『対戦相手の効果でバニッシュされず手札に戻らない』付与」が owner:opponent に誤parse → self。（「表記パワーと異なるパワーの」フィルタは近似省略）
- **後回し**: WXK03-018（GRANT_PROTECTION owner:opponent だが原文「対戦相手のシグニが対戦相手の効果で＋されない」＝owner:opponentが正当・センタールリグ付与のパース失敗が別問題）。
- **同時に確認した実害なし系統**: LIFE_BURST 内 `CONDITIONAL{IS_MY_TURN}`（105枚）は `evalCondition` で常時true＋「そうした場合」プレースホルダー特別処理のため**実害なし**（修正不要）。能力数欠落（差≥2＝42枚）は引用能力付与/複数能力付与/強制アタック/エクシード等の**重い機構待ち**で単純修正不可。
- `tsc` 通過。sheet3/7＋下流再生成済み。同型★ 0件。

## BURST欠落 網羅チェック＋WX04-029 是正 13巡目（1枚・2026-06-26）

別系統「**LIFE_BURST（ライフバースト）効果の丸ごと欠落**」を構造抽出で網羅チェック（原文 BurstText 非空 かつ JSON に LIFE_BURST effect 無し）。結果**全カードで1枚のみ**＝既によく整備済みと確認。

- **WX04-029 コードラビリンス クイン**: BURST「あなたのデッキから＜迷宮＞のシグニ１枚を探して公開し、手札に加えるか場に出し、デッキをシャッフルする」が丸ごと欠落 → `CHOOSE[①SEARCH(deck,迷宮,then:ADD_TO_HAND,afterSearch:SHUFFLE) / ②SEARCH(同,then:ADD_TO_FIELD,afterSearch:SHUFFLE)]` を追加（手本 WX07-023-BURST/WX04-038-BURST）。
- **同時に確認した地雷系統（修正せず）**: `TRASH owner:any`（2枚＝WXDi-P05-052 は付与能力内で逆翻訳上は既に「対戦相手の」表示／WXDi-P13-057 は//ディソナで原文欠落）も単純修正に不向き。owner:any 系全般は構造一括に不適と再確認。
- `tsc` 通過。sheet1＋下流再生成済み。同型★ 0件。脱落疑い 243→242枚。

## owner誤り調査＋ロードバフ owner:any 是正 12巡目（2枚・2026-06-26）

別系統「`owner:'any'`（＝『自分または対戦相手の』）誤り」を構造抽出で調査。**重要な知見**: `owner:any` の多くは**誤りではなく正当**だった——
- **BANISH owner:any（30枚）**: 大半が「すべてのシグニをバニッシュ」＝owner:any が正しい。
- **POWER_MODIFY owner:any（220枚）**: 大半が「**シグニ1体を対象とし**、パワー±N」＝WIXOSS に実在する自他選択強化/弱体（例 WX04-027 ドーピング）。delta符号で self/opp を機械決定するのは**誤り**。
- ⇒ `owner:any` の一括変換は厳禁。**原文に明示主語があるものだけ**個別是正する。

本物の誤りとして、CONTINUOUS ロードバフ「あなたの**他の**＜X＞のシグニのパワーを＋2000」が `owner:any` 単体に誤parseされた2枚を是正（前例 WX04-054/056/086 の `owner:self, count:ALL, filter{...,excludeSelf}, excludeSelf:true` に合わせる）:
- **WXDi-P12-060 ギロチン//ディソナ**: 他の《ディソナ》全体＋2000（`isDisona`）。
- **WXDi-CP02-051 歌住サクラコ**: 他の＜ブルアカ＞全体＋2000（`story:ブルアカ`）。
- **後回し**: WX25-CP1-087（2体まで対象＋トラッシュ枚数連動で複合・owner:any部分含む）。
- `tsc` 通過。sheet8＋下流再生成済み。同型★ 0件。脱落疑い 243枚（owner誤りは文数不変のため増減なし）。

## 文型★脱落バグ修正 11巡目（同系統の後回し回収＝isDisona/levelParity フィルタ新設 5枚・2026-06-26）

8〜10巡目で後回しにした「公開→条件付き副作用」のうち、**filter 不足が原因**だった5枚を、汎用フィルタ2種を新設して回収。

- **`TargetFilter.isDisona`（新設）**: 《ディソナアイコン》を持つカード＝CSV `Story==='Dissona'`。matchesFilter／decompiler 対応。`DECK_TOP_MATCHES` で deck-top の disona 判定に使える（`filter.story='Dissona'` は CardClass 照合で効かなかったのが原因）。
  - **WXDi-P12-070 マドカ//ディソナ**: ターン終了時・アップ状態なら 公開→《ディソナ》なら1引く（`THIS_CARD_IS_UP`で包む）。
  - **WXDi-P12-057 ノヴァ//ディソナ**: ターン終了時 公開→《ディソナ》なら**このシグニ**+5000（`POWER_MODIFY thisCardOnly`, `UNTIL_OPP_TURN_END`）。
  - **WXDi-P13-060 コメッチ//ディソナ**: アタック時 公開→《ディソナ》なら `CHOOSE[1引く/エナチャージ1]`。
- **`TargetFilter.levelParity:'odd'|'even'`（新設）**: レベルが奇数/偶数のシグニ（Level 非数値は不一致）。matchesFilter／decompiler 対応。
  - **WXK01-004 グズ子**: 公開→**奇数**レベルシグニなら2引く。
  - **WDK04-012 ダイシャリン**: 公開→**偶数**レベルシグニならエナへ。
- いずれも `SEQUENCE[LOOK_AND_REORDER(公開), CONDITIONAL{DECK_TOP_MATCHES〔新filter〕, then}]` 型（8〜10巡目と統一）。
- `tsc` 通過。sheet3/4/8＋下流再生成済み。同型★ 0件。脱落疑い 251→243枚。

## 文型★脱落バグ修正 10巡目（「公開→条件付き副作用」横展開の続き＝エナ/バニッシュ/パワー 10枚・2026-06-26）

9巡目と同抽出（`REVEAL_AND_PICK` で `then` が公開カード非消費）の `then=ENERGY_CHARGE(_FROM_DECK)/BANISH/POWER_MODIFY` を精査。いずれも `SEQUENCE[LOOK_AND_REORDER(公開・top維持), CONDITIONAL{DECK_TOP_MATCHES〔条件〕, then:〔副作用〕}]` に統一（公開でトップ不動→条件成立時にトップ＝公開カードへ作用するので「それをエナへ」「エナチャージ１」両表現とも同一機構で表せる）。

- **エナ系7枚**: WX12-050 イグアノドン（＜龍獣＞→エナ）／WX18-067 コニプラ（レベル4→エナ。Lv参照上書きは DECK_TOP_MATCHES の override で対応済）／WXK04-046 ミリア（＜紅蓮/古代兵器＞→エナ）／WXK10-022-E3 御伽原江良（無色でないシグニ→エナ・nonColorless）／WX24-P1-047-E2 キャトミ（レベル1→エナチャージ）／WX24-P3-082 リトルグレイ（レベル1→エナチャージ）／WX26-CP1-049-E1 リップル＆ジール（＜プリオケ＞→エナチャージ）。`then:ENERGY_CHARGE_FROM_DECK count1`。
- **バニッシュ系2枚**: WX22-027-E2 ナオマサ（公開→《ライズ》持ちシグニなら相手パワー12000以下バニッシュ。`hasIcon:ライズ`。対象先取りの順は近似）／WXEX1-62-E2 ケプリ（公開→レベル4シグニなら相手パワー1000以下バニッシュ）。
- **パワー系1枚（2分岐）**: WX12-CB02 ぷにとー（公開→レベル1シグニなら**このシグニ**+5000＝`POWER_MODIFY thisCardOnly`、レベル2なら**デッキトップをエナ**）。`SEQUENCE[公開, CONDITIONAL{Lv1, POWER+5000}, CONDITIONAL{Lv2, ENERGY_CHARGE}]`＋effect.duration=UNTIL_END_OF_TURN。
- **後回し（複雑・新機構/フィルタ/timing要）**: WDK04-012（偶数レベルフィルタ）／WX18-073-E2（公開カード手札＋次カードエナの複合）／WX25-P3-092（CHOOSE構造内の択一・②未表示）／WXDi-CP02-068（トリガーが「自効果で相手シグニ移動時」＝現 ON_PLAY 誤り）／WXDi-P12-057（disona＋UNTIL_OPP_TURN_END）／WX24-P4-060（UNTIL_OPP_TURN_END＋2効果目）／WX13-052・WX25-P1-053（self-banish/自身手札戻し起点の複合）／WXDi-P00-034（GRANTは可だがtimingが「相手メイン開始時」で現 ON_TURN_END 誤り）。
- `tsc` 通過。sheet2/3/4/9＋下流再生成済み。同型★ 0件。脱落疑い 253→251枚。

## 文型★脱落バグ修正 9巡目（「デッキ一番上公開→条件付きドロー」の横展開 9枚・2026-06-26）

8巡目で確立した系統を**横展開で機械的に潰す**。`REVEAL_AND_PICK` で `then` が**公開カードを消費しないアクション**になっているものを全シート抽出（`then` が ADD_TO_HAND/ADD_TO_ENERGY/ADD_TO_FIELD/TRASH/TRANSFER_TO_HAND 等＝公開カードを動かす正当ケースは除外）。`then:DRAW` の本物バグ9枚を `SEQUENCE[LOOK_AND_REORDER(公開・top維持), CONDITIONAL{DECK_TOP_MATCHES〔条件〕, then:DRAW}]` に是正。

- **条件なし6枚**: WX02-018 火紅柳緑（公開→＜鉱石/宝石＞シグニなら2枚引く）／WXDi-P06-064 デルフィヌス（レベル1シグニ→1引く・ATTACK_PHASE_START）／WXDi-P09-068 富士葵（レベル1シグニ→1引く・出）／WXDi-P10-042 ピルルクＷ//メモリア（**スペル**→1引く＝旧 filter は誤って cardType:シグニ。スペルに是正）／WX24-P1-066 Sコアボード（**スペル**→1引く・同上是正）／WX26-CP1-077 佐藤かえで（レベル2以下＜プリオケ＞→1引く）。
- **「このシグニがアップ状態の場合」条件付き3枚**: WXDi-P07-051 ヤギュウ（白→1引く）／WXDi-P07-070 カイヤナイト（青→1引く）／WXDi-P11-052 ミカムネ（＜アーム/ウェポン＞→1引く）。全体を `CONDITIONAL{THIS_CARD_IS_UP, then:SEQUENCE[公開, CONDITIONAL{DECK_TOP_MATCHES,DRAW}]}` で包む（公開自体がアップ前提のため）。
- **後回し（複雑・新条件/フィルタ要）**: WXK01-004 グズ子（奇数レベルフィルタ）／WXDi-P12-070 マドカ//ディソナ（《ディソナアイコン》deck-top 判定が不確実）／WX25-P1-082 ケルピー（このターンアーツ使用条件）／WXDi-P04-045・WXDi-P13-006・WXDi-CP01-025・WX25-CP1-038・WX26-CP1-046・WD21-001（原文乖離・別系統の複合誤り）。
- **次の横展開候補（10巡目）**: 同抽出の `then=ENERGY_CHARGE(_FROM_DECK)`／`POWER_MODIFY`／`BANISH`／`BOUNCE`／`GRANT_KEYWORD` 系（同じく公開カード非消費の副作用）。
- `tsc` 通過。sheet1/7/9＋下流再生成済み。同型★ 0件。

## 文型★脱落バグ修正 8巡目（「デッキ一番上公開→条件付き副作用」のREVEAL_AND_PICK誤用 4枚・2026-06-26）

脱落疑い続き（karka引き継ぎ＝WXDi/WX24帯の脱落系）。**S019系統「このシグニがアタックしたとき、デッキの一番上を公開する。そのカードが〔条件〕の場合、〔効果〕」**の誤パースを是正。

- **系統の核心**: REVEAL_AND_PICK は**ピックしたカード自体を then で動かす**前提（多数派の `then:ADD_TO_ENERGY/ADD_TO_HAND` ＝公開カードをエナ/手札へ＝正しい）。だが then が**公開カードを消費しない副作用（ドロー等）**の場合、エンジンは公開カードをデッキから抜いたまま戻さず（resumeSearch は非hand/field の then でピック札を捨てる）、かつ別カードをドローする**二重バグ**だった。
- **正しい型**: `SEQUENCE[LOOK_AND_REORDER(デッキ上1枚・public・reorder無・top維持＝公開), CONDITIONAL{DECK_TOP_MATCHES〔条件〕, then:〔副作用〕}]`（WX01-057 と同型）。ドローはデッキトップ＝公開カードを引くので「公開カードが手札へ」の正味結果も一致。
- **WXDi-D02-21 コード２４３４ 宇志海いちご**: 公開→＜バーチャル＞シグニなら1枚引く。`then:DRAW1`。
- **WXDi-P01-048 羅星 アルファルド**: 公開→レベル1シグニなら1枚引く。`then:DRAW1`。
- **WXDi-D03-017 羅石 アダマスフィア**: 公開→レベル3シグニなら《赤》《赤》払ってもよい→このシグニに【アサシン】（ターン終了まで）。`then:SEQUENCE[OPTIONAL_COST赤赤, GRANT_KEYWORD(thisCardOnly アサシン UNTIL_END_OF_TURN)]`（Pattern⑤ pay/skip）。
- **WX24-P2-070 幻竜 ズメイ**（S009系・別系統）: `BANISH owner:opponent filter{story:龍獣}` ＝**＜龍獣＞フィルタが対戦相手ターゲットに誤混入**（龍獣は自場の条件側）＋**自場条件・防御払いが脱落**。→ `CONDITIONAL{HAS_CARD_IN_FIELD self excludeSelf 龍獣, then:BANISH 相手パワー8000以下}`。「対戦相手が《無》《無》を支払わないかぎり」の防御払いは機構未実装のため近似省略（旧版は龍獣フィルタでほぼ不発だったため明確な改善）。
- **後回し（同S019/系統・複雑）**: WXDi-P08-037（公開シグニと自アップシグニの場所入れ替え＋覚醒トリガーE3誤パース）／WXDi-P13-060（公開→《ディソナアイコン》ならドロー/エナチャージ択一＝ディソナアイコンの deck-top フィルタ判定が不確実）。
- `tsc` 通過。sheet7/9＋下流（_review_repr/grouped_all/grouped_sentence_all）再生成済み。同型★ 0件。

## 文型★脱落バグ修正 7巡目（CONTINUOUS owner誤り・択一崩壊・枚数誤り 3枚・2026-06-26）

脱落疑い続き。偽陽性（アンコール注記のみ＝WX13-015/WX18-016/WXK07-012）を除外し本物3枚を修正。

- **SP27-014 中水罠 オトヒメ**: E1 が `POWER_MODIFY owner:any count1`（**自分または対戦相手**＝owner誤り）→ `owner:self count:ALL filter{color:青, excludeSelf}`（あなたの他の青シグニ＋2000）。E2 は `BANISH owner:self`（**自分のシグニをバニッシュ**＝誤り）で3択脱落 → ON_TRASH の `CHOOSE[①ドロー / ②デッキトップをエナ / ③手札1捨て→相手シグニバニッシュ]`（トリガー「対戦相手の効果で」限定は ON_TRASH 近似）。
- **WX10-037 破戒の轟牙 シヴァ**: E3 が `ADD_TO_LIFE count:4`（**4枚ライフに加える**）→ `count:1`（デッキトップ1枚）。「4枚以上捨てた場合」条件は捨て枚数追跡が未整備のため近似省略。
- **WXK10-007 イレイザー・スマッシュ**: E1 が `BLOCK_ACTION any signi ATTACK`（誤パース）で2択崩壊 → `CHOOSE[①相手センタールリグ能力消失(REMOVE_ABILITIES LRIG) / ②白任意払い→相手シグニにアタックできない付与]`。①の「対戦相手のターンの場合」は `IS_MY_TURN` が実行時常時 true で判定不能のため近似省略（防御アーツで通常相手ターン使用）。
- **後回し（複雑・TODO記録）**: WXK09-006（②次の相手ターンの相手アーツ/スペルのコスト**増加**＝コスト増加機構が未整備・現状はコスト軽減マーカー誤り／③相手手札0条件脱落）／WD14-011（E1 トリガーが thisCardOnly 化＋「より低いレベル」フィルタ脱落／BURST 2択崩壊）／WDK14-008（【ビート】機構＋同レベルバニッシュ）／WX25-P2-084（②エナ＜武勇＞捨て→凍結状態パワー3000以下のアサシン付与）。
- `tsc` 通過。sheet1/4/5＋下流再生成済み。

## 文型★脱落バグ修正 6巡目（コスト軽減後の択一脱落・owner誤り 3枚・2026-06-26）

脱落疑い続き。偽陽性（使用条件＋本体＝WX15-050/WX04-044、アンコール注記のみ＝WX13-010/WX18-013、GATE実装済＝WDK09-006）を除外し本物3枚を修正。

- **WX15-034 戦意の箱舟**: コスト軽減STUB単独で**2択（2つまで）が全脱落** → `SEQUENCE[コスト軽減, CHOOSE upTo2[①デッキから＜武勇＞探索手札 / ②CONDITIONAL(HAS_CARD_IN_FIELD hasIcon:ライズ)→相手シグニバニッシュ]]`。
- **WXK06-055 ブラック・ドラゴン・ウェーブ**: コスト軽減STUB単独で**3択が全脱落** → `SEQUENCE[コスト軽減, CHOOSE from3[①トラッシュから＜龍獣＞2枚まで手札 / ②相手全シグニバニッシュ / ③`OPP_ENERGY_REDUCE_TO_N` value6（相手エナを6枚に）]]`（③は既存STUBを流用）。
- **WX21-001 ドーナ FIFTH**: E1 ②が `POWER_MODIFY owner:any`（**自分または対戦相手**＝owner誤り）、③が ＜怪異＞フィルタ脱落 → ②を `owner:self, story:怪異, +10000`、③に `story:怪異` を付与（①は既に正）。
- **後回し（複雑・TODO記録）**: WX24-P3-036（②スペル打ち消し＋コスト合計比例の《無》任意払い＋NEGATE_ATTACK 誤パース）／WX20-021（使用制限「対戦相手のターンにしか使用できない」が壊れた CONTINUOUS に誤パース＋3択全脱落・各選択肢に条件付き）。
- `tsc` 通過。sheet2/3＋下流再生成済み。

## 文型★脱落バグ修正 5巡目（択肢併合・公開ピック脱落 4枚・2026-06-26）

脱落疑い続き。偽陽性（使用条件＋本体＝WDK02-007/WX15-044、BET＝WDK05-T10、解決済＝WX25-CP1-065）を除外し本物4枚を修正。

- **SPK01-13 セレクト・ハッピー５**: 5択のうち**④⑤が1つの選択肢に併合**（④アタックできない付与＋⑤全シグニ能力消失が `SEQUENCE` で1択に）＋②が `TRASH`（本来ゲーム除外）→ `from_count` 5 に修正し④/⑤を別選択肢に分離、②を `EXILE`（相手トラッシュ2枚までゲーム除外）に是正。
- **WX13-019 緑弐ノ遊 スイングライド**: E2 が `REVEAL_AND_PICK`（1枚手札のみ）で**エナ置き＋残りデッキ上が脱落** → `LOOK_PICK_CHAIN`（公開3→1枚手札＋1枚エナ→残りデッキ上）に。
- **WX25-P1-052 聖天姫 ムンカルン**: E2 が `LOOK_AND_REORDER`（並べ替え）誤 → `REVEAL_AND_PICK`（公開3→＜天使＞シグニ1枚場出し、残りデッキ下）。「出能力発動しない」は近似省略。E1 は《相手ターン》＋《永らえし冒険者タウィル＝トレ》在場条件が要るため action 修正は次回。
- **WXK10-017 白夜の使者 サシェ＆ミュウ**: E1 が `LOOK_AND_REORDER count3` ＋冗長な `count0` の2連で崩れていた → 単一 `LOOK_AND_REORDER count3 reorder top`（3枚見て好きな順でデッキトップに戻す）に。E3 の「出能力発動しない」は近似。
- **後回し（新機構要・TODO記録）**: WX11-021（②「このターンにあなたのライフが相手効果でクラッシュされていた場合」＝自ライフクラッシュ履歴条件が未整備）／WD22-036-G（2択＝自＜遊具＞バニッシュ→公開ピック／自＜遊戯＞バニッシュ→トラッシュ→デッキ、各 self-banish 起点の複合）／WX25-P1-052-E1（《相手ターン》AUTO＋名指しカード在場条件）。
- `tsc` 通過。sheet2/4/5/9＋下流再生成済み。

## 文型★脱落バグ修正 4巡目（4択全脱落・効果丸ごと欠落 2枚・2026-06-26）

脱落疑い続き。偽陽性（3択完全＝WD23-012-A、BET_MECHANIC＝WX18-005）を除外し、本物2枚を修正。

- **WX16-006 イノセント・ディフェンス**: STUB `ARTS_COLORLESS_MUST_PAY_CENTER_COLOR` 単独で**4択（2つまで）が全脱落** → `SEQUENCE[コスト制限マーカー, CHOOSE upTo2 from4[①相手センタールリグに「アタックできない」付与(target LRIG) / ②相手シグニをダウンし凍結(FREEZE down) / ③自シグニに「バニッシュされない」付与(GRANT_PROTECTION from BANISH) / ④トラッシュから共通色シグニ2枚まで手札(colorMatchesLrig, upToCount)]]`。
- **WD07-012 コードアンチ ヴィマナ**: JSON が **E1 のみで E2（出能力）と BURST が丸ごと欠落** → E2 を追加（AUTO ON_PLAY・cost《黒》・`SEQUENCE[TRANSFER_TO_DECK トラッシュの＜古代兵器＞4枚(eachDistinctLevel)→デッキ下, POWER_MODIFY 相手-10000]`）、BURST を追加（相手シグニ-10000）。E1 の `BANISH_ATTACKER_IF_WEAKER_THAN_FRONT` は既存維持。
- **後回し（新機構要・TODO記録）**: WX24-P3-032（②が「アサシン/ランサー/Sランサー/ダブルクラッシュ のいずれかを持つ」キーワード複数フィルタ＝TargetFilter は単一 `keyword` のみ）／WXK10-013（①「相手は自分の効果でシグニを場に出せない」＋相手ターン限定の配置制限）／WX26-CP1-019・WX25-P1-103・WX24-P2-070（look-pickチェーン／条件付きトラッシュ判定／相手の支払いで防ぐ）／WX16-048（取り除いたウィルス数+1の選択数スケール）。
- `tsc` 通過。sheet2/3＋下流再生成済み。

## 文型★脱落バグ修正 3巡目（択一脱落・owner誤り 6枚・2026-06-26）

脱落疑いリストをさらに精査し、本物の択一脱落／owner誤りを6枚修正（既存語彙のみ・新機構なし）。偽陽性（REVEAL_AND_PICK の文法崩れ＝WX11-059/060/WXEX1-08-E2、使用条件＋バニッシュ＝WX01-046/WX06-034/WXK01-020、3択完全＝WX17-Re14）は対象外と判定。

- **WXDi-P15-034 リメンバ・アストロジー**: E1 が `BOUNCE owner:self`（**自分のシグニを手札に戻す**＝owner誤り）の単発で択一脱落 → `CHOOSE[①相手シグニに「アタックできない」付与 / ②白無任意払い→相手シグニ手札戻し]`（②は OPTIONAL_COST costColors）。
- **WXDi-P07-083 羅星 ラセルタ（LB）**: WXDi-P07-066 と完全同型（`BANISH owner:self`＋択一脱落）→ `CHOOSE[①相手12000以上バニッシュ / ②《コイン》任意払い→相手5000以上バニッシュ]`（coinCost 機構を流用）。
- **WX05-081 リバイブ・フレア**: `ADD_TO_FIELD` 単発に潰れていた（①の一部のみ）→ `CHOOSE upTo2[①MILL3→トラッシュからLv2以下黒シグニ場出し / ②CONDITIONAL(AND[LRIG_LEVEL≥4, LRIG_COLOR黒])→トラッシュ黒シグニ場出し]`。
- **WX17-004 落華流粋**: `CONDITIONAL_MULTI_CHOOSE_BY_CENTER`（WX11-017同型・全4択を実行時パース）の後に③④断片（アサシン付与＋手札2捨て）が**無条件適用される漏出ステップ**だった → STUB 単独に是正。
- **WX20-006 共存共栄**: コスト軽減 CONDITIONAL のみで本体2択が全脱落 → `SEQUENCE[ARTS_COST_REDUCTION マーカー, CHOOSE[①デッキから＜精羅＞3枚までエナ(SEARCH→ADD_TO_ENERGY) / ②相手12000以上バニッシュ]]`。コスト軽減は BattleScreen がEffectTextから算出（line310）するためマーカー位置非依存。
- **WXK05-048 フィフス・テンプト**: 5択が⑤のみに潰れていた → `SEQUENCE[コスト軽減, ルール注記, CHOOSE from5[①デッキ探索手札 / ②相手8000以下バニッシュ / ③ドロー2捨て1 / ④相手12000以上バニッシュ / ⑤トラッシュ蘇生]]`。
- **後回し（新機構要・TODO記録）**: WDK07-E15（公開デッキカードを自身のアクセにする＝既存 ACCE_FROM_HAND は手札アクセ用で逆向き）／WX24-P3-063（公開カードと同レベルの相手全シグニ能力消失＝動的レベルフィルタ）／WX25-CP1-002・WX25-P3-023-E2・WXEX1-08（リコレクト択一④の owner／コインベット誘発／ライズフィルタ等の複雑系）。
- `tsc` 通過・`eslint` 新規エラー0。sheet1/2/3/7/8＋下流再生成済み。

## 文型★脱落バグ修正 2巡目＋コイン任意払い機構＋クロス条件の実評価（2026-06-26）

脱落疑いリスト続き（#11〜）の本物バグ2系統を修正。あわせて再利用可能な機構を2つ整備。

- **WXDi-P07-066 コードライド バギーカー（LB）**: 旧JSONは `BANISH owner:self`（**自分のシグニをバニッシュ**＝owner誤り）の単発で、原文「どちらか1つを選ぶ ①相手パワー5000以下バニッシュ ②相手パワー12000以下＋《コイン》払いバニッシュ」の**択一が丸ごと脱落**。`CHOOSE(from2)[①BANISH opp≤5000 / ②SEQUENCE[OPTIONAL_COST coinCost:1, BANISH opp≤12000]]` で完全実装。
- **コイン任意払い機構（新設・再利用可）**: `OPTIONAL_COST` STUB に `coinCost?:number` を追加（`StubAction`＋CHOOSE option 型）。effectExecutor の OPTIONAL_COST インターセプト（Pattern⑤）が `coins>=coinCost` で支払可否を判定し、`resumeOptionalCost` がコインを控除。BattleScreen の dispatch を `costColors||coinCost` で resumeOptionalCost に振り分け（コイン専用はエナ選択UIを挟まず即決済）。decompiler も `《コイン》×N を支払ってもよい` を描画。**他の「《コイン》を支払ってもよい→そうした場合〜」系に流用可。**
- **`HAS_CARD_IN_FIELD` のゾーン状態（クロス/凍結）実評価バグ（系統・engine）**: `evalCondition` の `HAS_CARD_IN_FIELD` が `matchesFilter(card, filter)` のみで判定しており、**`crossState`/`isFrozen` は `CardData` のプロパティでないため無視**されていた（＝「クロス状態のシグニがある」が実際は「シグニがいる」になっていた／1巡目の WX07-012 修正も実は不完全だった）。`fieldCandidates` 同様に `field.cross_state[zoneIdx]`/`field.signi_frozen[zoneIdx]` をゾーン別に参照して判定するよう修正。
- **クロス状態条件の COND_STUB 一括是正（14枚）**: `{COND_STUB raw:"あなたの場にクロス状態のシグニがある"}` を `HAS_CARD_IN_FIELD{owner:self, filter:{シグニ, crossState:true}}` へ置換（WX07-002/003/004/005/014/018/020・WX08-001/002/003/011/013/018・PR-195）。上記 engine 修正により実際にクロス状態を判定する。
- `tsc` 通過・`eslint` 新規エラー0。sheet1/6/7＋下流（_review_repr/grouped_all/grouped_sentence_all）再生成済み。同型★ 0件。

## 文型★脱落バグ修正 1巡目（10枚・2026-06-26）

脱落疑い（逆翻訳＜原文）リスト先頭から10枚を処理。主効果（択一・探索）を復元、複雑riderは近似/別途TODO。
- **WXDi-CP01-036**: STUB単独 → `CHOOSE[①＜バーチャル＞いれば相手能力喪失(REMOVE_ABILITIES) / ②LOOK_TOP_ONE_RETURN_REST_BOTTOM]`。
- **WX24-P4-026**: ルリグ付与のみ → `SEQUENCE[REVEAL_AND_PICK(5→シグニ2枚手札), 付与]`（色ゲート近似）。
- **WX26-CP1-001**: 択一②③誤 → ②`LOOK_PICK_CHAIN(5→2枚手札+プリオケ1枚エナ)`、③`GRANT_EFFECT`（プリオケに攻撃時トラッシュ付与・遅延近似）。
- **WXK10-008**: 自シグニバニッシュ誤 → 相手パワー7000以下・任意《赤》バニッシュ（①エナ色喪失モードは別途）。
- **WXDi-P02-039**: E1 timing誤(ON_TURN_END)→`ON_PLAY any_ally ＜地獣＞`（E2引用付与は別途）。
- **WXDi-P16-048**: ①シャドウを thisCardOnly＋次相手ターン、②バニッシュにパワー8000以下付与。
- **WX25-P3-027**: E1 にトラッシュ＜悪魔＞15枚以上条件付与（E2 LB付与は別途）。
- **WX25-CP1-006**: ③ダメージ軽減を damageSource:lrig、④エナ＜ブルアカ＞トラッシュ→相手パワー10000以上バニッシュ（枚数誤マッチは別途）。
- **WX07-012**: COND_STUB → `HAS_CARD_IN_FIELD crossState`（クロス状態シグニ条件）。
- **WX25-CP1-037**（前出）。`tsc` 通過、全シート＋下流再生成済み。近似/別途項目は TODO.md に記録。

## 文型★トリアージ: 検出器改良＋S001択一脱落カード修正（2026-06-26）

`grouped_sentence_all.txt`（文型★）の誤検出を抑制（`groupBySentence.mjs`）: ①`bodyKey` で先頭接続句（そして／そうした場合等）・選択肢番号（①②③④）を除去、②`splitDecomp` で CHOOSE「次から…選ぶ【A / B】」を選択肢別文に展開＋原文の選択ヘッダー除外、③外れ判定を「共通バリアント（2枚以上に出る逆翻訳型）のどれにも一致しないカードのみ」に変更。**★要確認 1626枚→390枚**。詳細は TODO.md E節。

**⚠ 重要な方法論訂正:** 当初「逆翻訳に `[STUB:]` を含む外れ＝意図的未実装でスキップ」と仕分けたが**誤り**。STUB は**実装済みハンドラ**（STUBS.md: 541種中534種にハンドラ。STUB_LOG 0件）であり、`[STUB:]` タグは「汎用アクションで描けない固有ロジックをハンドラに逃がしている＝decompiler が自然文化できずタグ表示」の意味。**ただしタグだけでは「ハンドラがカード全体を実装（WX11-017）」と「STUB/単一アクションが断片しか実装せず残りを落とした（WX09-Re03/WDK07-E08）」を区別できない**ため、STUB外れも個別に「実装が原文全体を覆うか」検証が必要。STUBフィルタで一括除外すると実バグを見落とす。

S001「カードをN枚引く」の外れ4枚を個別検証 → 実バグ3枚を修正、1枚は実装済み:
- **WX22-005 グラン・クロス（アーツ）**: 旧JSONは最終文「デッキトップをライフへ」だけで、**「3つから1つ選ぶ①＜天使＞3枚サーチ場出し②6枚引く③スペル打ち消し」＋相手エナ1枚トラッシュが丸ごと欠落**。`SEQUENCE[CHOOSE(SEARCH天使/DRAW6/COUNTER_SPELL), TRASH 相手ENERGY_CARD, ADD_TO_LIFE]` で完全実装。
- **WX09-Re03 ゼノ・マルチプル**: 旧STUB `PREVENT_TARGET_LRIG_ATTACK_THIS_TURN` は**選択肢①のみ**実装（②全凍結③手札戻し④2ドロー欠落）。汎用ハンドラ `CONDITIONAL_MULTI_CHOOSE_BY_CENTER`（EffectText を実行時パースして「4つから2つ選ぶ」全4択を生成。WX11-017 と同型）に置換。smoke テストで count=2・options=4 を確認。
- **WDK07-E08 キャンディ・レイン**: 旧JSは `NAME_BAN(targetSelf)` 断片のみ（③の同名禁止の誤実装）で**択一丸ごと欠落**。`CHOOSE(①DOWN/②DRAW2/③COUNTER_SPELL)` を手組み（③の「トラッシュから相手手札に戻す＋一時同名禁止」riderは新語彙未対応で近似）。
- **WX11-017 ブルー・パニッシュ**: STUB `CONDITIONAL_MULTI_CHOOSE_BY_CENTER` が全選択肢を実行時パース済＝**正しく実装済み**（decompiler のタグ表示のみ・バグではない）。
- `tsc` 通過、sheet1/3/5＋下流再生成済み。

**トリアージ効率化ツール（同日）**: ①`grouped_sentence_all.txt` の各★外れに**原文・逆翻訳を併記**＋**⚠脱落疑い(原文N文/逆翻訳M文)** マーカー（逆翻訳の効果文数＜原文＝効果脱落の実バグ）を追加し、脱落疑いを先頭に並べる（現在262枚前後）。②decompiler が `CONDITIONAL_MULTI_CHOOSE_BY_CENTER(_LEVEL_GTE)` を原文の選択肢で自然文描画（実装済みSTUBの偽陽性除去。WX11-017等が脱落疑いから外れた）。原文を別途引かずバグ判定できる。
- **WX25-CP1-037 虚妄のサンクトゥム攻略会議**（ツール実証修正）: 旧 `LOOK_AND_REORDER`（並べ替え）誤→ `REVEAL_AND_PICK`（デッキ上4枚→＜ブルアカ＞シグニ1枚場に出す→残りデッキ下）。「出能力発動しない」riderは新語彙未対応で近似。sheet9再生成済み。

## G250〜G265 一括是正（逆翻訳乖離16系統32枚）＋新語彙整備（2026-06-26）

逆翻訳が原文と大きく乖離していた G250〜G265 を上から順に全是正。エンジン実装もセットで配線（[[decompile-engine-parity]]）。

- **G250**（WXDi-P11-065/WX25-P1-066）: `LOOK_AND_REORDER`（並べ替える）→ `REVEAL_AND_PICK`（デッキ上N枚→＜X＞シグニ1枚手札、残りデッキ下）。cost 手札1枚捨て維持。
- **G251**（WXDi-P12-084/088）: TRASH `DECK_CARD` owner `self`→`opponent`（「対戦相手のデッキの上から」）。
- **G252**（WXDi-P13-027/CP02-025）: 新アクション `LOOK_PICK_CHAIN`（後述）で完全実装。look5→シグニ1枚まで手札＋そのシグニと共通クラスを持つ無色でないシグニ1枚まで手札、残り下。
- **G253**（WXDi-P14-083/WX24-P3-068）: 新stub `OPTIONAL_DISCARD_HAND_CLASS`（G249のエナ版＝手札からクラスシグニを任意捨て→そうした場合バニッシュ）。effectExecutor の IS_MY_TURN インターセプトに handler 追加、decompiler も対応。対象パワー≤5000付与。
- **G254**（WXDi-P15-093/WX24-P1-076）: `PREVENT_NEXT_DAMAGE.damageSource:'lrig'`（新フィールド・逆翻訳忠実化用。engine は源を区別せず次1回無効＝軽微な過剰軽減で偽陰性ではない）。
- **G255**（WX24-P1-029/WX25-P1-043）: 旧 `TRANSFER_TO_DECK`（自シグニをデッキ下）誤→ −8000 ＋ `LOOK_PICK_CHAIN`（look5→カード1枚までトラッシュ＋＜X＞シグニ2枚まで手札、残り下）。中間トラッシュも完全実装。
- **G256**（WX24-P1-085/WX25-P3-107）: E1 ADD_TO_FIELD source に `eachDistinctLevel`（新フィルタ・表示/選択補助）。BURST を `CHOOSE`（手札に加える／場に出す）＋`noGuard` フィルタに（旧 TRANSFER_TO_HAND のみ）。
- **G257**（WX24-P3-035/WX25-P2-043）: G255同型（−10000 ＋ look5→＜X＞2枚まで手札、残り下）。
- **G258**（WX24-P4-080/WX25-P3-096）: E1 に condition `ENERGY_COUNT_FILTER`（エナに＜X＞シグニ3枚以上ある場合）。BURST `damageSource:'signi'`。
- **G259**（WX25-P3-074/078）: 旧「アタック時直接バニッシュ」誤→ ON_ATTACK_PHASE_START・任意 `DOWN`（thisCardOnly/isUp）→ そうした場合 他の＜天使＞1体へ `GRANT_EFFECT`（「アタック時相手パワーN以下バニッシュ」をターン終了まで付与）。
- **G260**（WX25-P3-081/WX26-CP1-074）: condition `HAS_CARD_IN_FIELD`（場に他の＜X＞）＋ TRASH `ENERGY_CARD` opponent `colorNotMatchesLrig`（相手センタールリグと共通色でない）。
- **G261**（WX25-CP1-033/WX26-CP1-020）: `REVEAL_AND_PICK`（look4→＜X＞カード2枚まで手札）＋ `PLACE_LIMIT_UPPER`（decompiler に専用描画追加）。
- **G262**（WX26-CP1-064/067）: アクションは正・cost `discardFilter`（＜プリオケ＞）が逆翻訳器 `costJa` 未描画だったため反映追加。
- **G263**（WX26-CP1-072/075）: 旧「2連バニッシュ」誤→ `CONDITIONAL(HAND_COUNT eq0)`（手札0枚なら高パワー、そうでなければ低パワーの択一バニッシュ＝「代わりに」）。
- **G264**（WX26-CP1-080/083）: G262同様 cost `discardFilter` 描画で解決（POWER_MODIFY は正）。
- **G265**（WX26-CP1-088/091）: 旧「あなたのシグニ1体に【ランサー】を与える」誤→ thisCardOnly＋keyword `ランサー:N`（`hasKeyword` の `'ランサー:'` プレフィックスで検出。decompiler が「ランサー（パワーN以下のシグニ）」へ復号）＋ターン終了まで。
- 逆翻訳器の文法是正: `ENERGY_COUNT_FILTER`（cardType名詞＋「ある」）。`tsc`・`eslint` 通過。sheet8/9＋下流再生成済み。

### 追記: G252/G255 を多段ピック新機構で完全実装（2026-06-26）

当初 G252「共通クラス無色でない2段目」・G255「中間トラッシュ」を近似（省略）としたが、汎用の多段ピック機構を新設して完全実装に置換。

- **新アクション `LOOK_PICK_CHAIN`**（types/effects.ts）: デッキ上N枚を1度公開し、`stages[]`（各 `{filter, pickCount, then:'hand'|'energy'|'trash', sharesClassWithPrev, pickNoun}`）を順にピック、残りを `remainder` へ。段間は `SEARCH` の continuation に自身（remaining stages ＋ 内部 `_revealed`）を渡して再入し、`resumeSearch` がセットする `lastProcessedCards`（直前ステージのピック）を `sharesClassWithPrev`（共通クラス判定）の参照に使う。executor `execLookPickChain`（effectExecutor.ts）＋ switch 登録、decompiler 描画追加。
- **`applyDirectAction` の `TRASH` に `DECK_CARD` 分岐追加**（公開中のデッキ1枚をトラッシュ＝G255の中間トラッシュ）。
- **副次バグ修正**: `nonColorless` フィルタ（execUtils.ts）が無色を `''`/`'無色'` のみで判定していたが、データ上の無色は `'無'`（36枚）。`'無'` を除外条件に追加（G240 の同フィルタ使用カードも従来一切マッチしなかった不具合を是正）。
- スモークテストで両系統を検証: G252＝stage1でシグニ選択→stage2は共通クラスかつ非無色のシグニのみ候補（無色は除外）→残りデッキ下。G255＝stage1で任意カード1枚トラッシュ→stage2で＜悪魔＞2枚手札→残りデッキ下。いずれも期待どおり。`tsc`・`eslint` 通過。sheet8/9＋下流再生成済み。

---

## G249 任意コスト誤り（手札捨て→エナのシグニトラッシュ）＋対象パワー欠落の修正（2026-06-25）

`WXDi-P10-056 プリパラアイドル 黒須あろま`／`WX24-P2-068 羅植 モミジ`（G249）が **誤った STUB `TARGET_AND_DISCARD_HAND`（手札を捨てる）** で表現され、原文の任意コスト「あなたのエナゾーンから＜X＞のシグニ1枚をトラッシュに置いてもよい」と乖離。加えてバニッシュ対象の **パワー制限（N以下）が欠落**（任意の相手シグニをバニッシュできてしまう）。

- **JSON 修正**（effects_WXDi.json / effects_WX24_26.json）: STUB id を `OPTIONAL_TRASH_ENERGY_CLASS` に変更（エナのクラス/枚数は engine が EffectText から解釈する既存パターン）。`SEQUENCE[STUB, CONDITIONAL(IS_MY_TURN → BANISH)]` の形は維持（effectExecutor の任意コスト・インターセプトがこの形を「払う→そうした場合バニッシュ／スキップ」に変換）。BANISH 対象に `filter.powerRange.max`（P10-056=10000／P2-068=5000）を付与。
- **逆翻訳器**（decompileEffects.ts）: `OPTIONAL_TRASH_ENERGY_CLASS` を「コストを支払ってもよい」一律描画から分離し、原文（currentCardText）から ＜クラス＞・枚数を復元して「あなたのエナゾーンから＜X＞のシグニN枚をトラッシュに置いてもよい」と描画。
- 逆翻訳: 「【自】あなたのアタックフェイズ開始時：あなたのエナゾーンから＜プリパラ＞のシグニ1枚をトラッシュに置いてもよい。そうした場合、対戦相手のパワー10000以下のシグニ1体をバニッシュする」。`tsc` 通過。sheet8/9＋下流再生成済み。

---

## G247「あなたのターン終了時、このシグニがアップ状態の場合」の欠落修正（2026-06-25）

`WXDi-P09-063 蒼魔 キマリス`／`WXDi-P14-075 電音部 東雲和音`（G247）の逆翻訳が **「このシグニがアップ状態の場合」条件を欠落**し、さらに `REVEAL_AND_PICK` 表現のため「公開→悪魔シグニなら1枚引く」構造が崩れていた（「その中から＜悪魔＞のシグニを1枚あなたのカードを1枚引く…」と非文）。

- **新条件型 `THIS_CARD_IS_UP`**（types/effects.ts）: このシグニがアップ状態（ダウンしていない）の場合。`execUtils.ts` 評価は `THIS_CARD_IS_DOWN` の反転（場にいて signi_down=false）。逆翻訳器（decompileEffects.ts）に `condJa` 描画追加。
- **JSON 再構成**（effects_WXDi.json, 両カード）: `REVEAL_AND_PICK` → `condition:THIS_CARD_IS_UP` ＋ `SEQUENCE[REVEAL, CONDITIONAL(DECK_TOP_MATCHES{シグニ,story} → DRAW 1)]`。`execReveal`（source無＝デッキ上を公開しトップ据置）→ 後続 CONDITIONAL がそのトップを判定して引く、で原文どおり。
- **逆翻訳器の文法修正2点**: ①`condition` 描画で名詞（状態）終わりに「の」を補い「…状態の場合」化（既存の 覚醒状態/血晶武装状態 条件7枚の「状態場合」非文も同時是正）。②`DECK_TOP_MATCHES` 描画で filter.cardType を名詞に反映（「＜悪魔＞のカード」→「＜悪魔＞のシグニ」）。
- 逆翻訳: 「【自】ターン終了時：このシグニがアップ状態の場合、あなたのデッキの上を公開する。そしてあなたのデッキの一番上が＜悪魔＞のシグニなら、あなたのカードを1枚引く」。`tsc` 通過。sheet3/5/7/8/9 と下流（_review_repr / grouped_all / grouped_sentence_all）再生成済み。

---

## 「これにアクセされている」系・複雑8枚の完全実装（新語彙整備）（2026-06-25）

前記の棚卸しで no-op 据置とした複雑/特殊8枚を、必要な新語彙をエンジンに整備して本実装。全て `scripts/_verifyAcceHost.ts`（計23項 pass）で検証。`tsc` 通過・`eslint` 新規エラー0。

- **動的パワー減 `POWER_MODIFY_BY_SOURCE`（新アクション）**: 効果元シグニ（このシグニ）の **レベル or 実効パワー × multiplier** を delta として算出し `POWER_MODIFY` へ委譲（対象選択・効果耐性・ターン終了/相手ターン終了ストアを再利用）。`WDK07-E14 ラムレーズン`（level×−2000）／`WXK10-075 ラムネ`（power×−1、E2は任意《青》=`OPTIONAL_COST`＋`PAID_ADDITIONAL_COST`、E1は `THIS_CARD_IS_ACCED` 自己条件付き）。
- **`WXK10-074 ワラビモチ`**: ホストへ「アタック時、相手手札を見てこのシグニよりパワーの低いシグニ1枚を捨てさせる」＝AUTO `ON_ATTACK_SIGNI` `TRASH HAND_CARD`（`powerLtSelf`＋`actingPlayerSelects`）付与。
- **`WX22-043 クギニ`（全色）**: `collectAllColorSigniForField` に **signi_acce 走査**を追加。アクセカードの CONTINUOUS `ACCE_SIGNI_ALL_COLOR` を読み装着先ホストを全色集合へ（従来の story_overrides 経路はアクセが場のシグニでないため発火しなかった）。
- **`WX17-077 サルサス`**: ホストへ「対戦相手のターン終了時、このシグニをトラッシュしてよい→デッキ上3枚エナ or 3枚ドロー」＝AUTO `ON_TURN_END`／`triggerScope:any_opp`（＝相手ターン終了時のみ発火）／`CHOOSE upTo:1`（してもよい）。各選択肢は `SEQUENCE[TRASH self(thisCardOnly), …]`。
- **`WX20-045 マロンクリーム`（正面個別強制）**: 新アクション `FORCE_FRONT_SIGNI_ATTACK`＋`collectForcedFrontAttackZones`（盤面反転を考慮し相手の本効果を読んで自分の正面ゾーンを強制対象化）。`BattleScreen.mustAttackRemainingZones`／フェイズ進行ゲートを個別強制ゾーン対応に拡張（従来は `must_attack_signi` プレイヤー全体フラグのみ）。
- **`WX17-075 タルタル`（正面低レベル登場誘発）**: 新トリガー条件 `triggerCondition.frontLowerLevelThanSource`。`collectFieldTriggers` の相手場 `any_opp` `ON_PLAY` 分岐で「効果元の正面（2−ziHost）に効果元より低レベルのシグニが出た」ときのみ収集。アクションは `BANISH optional`＋`filter.isTriggerSource`（出たそのシグニを任意バニッシュ）。各召喚は召喚側クライアントの `collectFieldTriggers` を通るため両方向で発火。
- **`SPK01-11 ラズベリー`（装着時選択付与）**: `GRANT_ACCE_HOST_ABILITY.byChoice`＋`PlayerState.acce_choice`（アクセCardNum→選択index）＋`SET_ACCE_CHOICE` stub を新設。E1 `ON_ACCE_ATTACH` `CHOOSE` 3択が選択indexを記録し、E2 の `byChoice` 付与が **選んだ1能力のみ**（①ダウン耐性②バウンス耐性③アタック時ドロー）をホストへ付与（未選択中は付与なし）。

---

## 「これにアクセされている」系の全棚卸し・本実装（2026-06-25）

「これにアクセされている（＝このカードがアクセとして装着されているホストシグニ）」を参照する全31枚を CSV から洗い出し、未実装/誤実装を本実装。多くが **クォートされた能力をアクセカード自身の効果へフラット化**（場に出ていないアクセカード上の CONTINUOUS ＝ no-op）していた。[[banish-vs-ener-send]] と同様、ホスト宛の付与・パワーは専用機構に載せる。

- **engine（`calcFieldPowers` の `signi_acce` ループ）**: ホスト宛 `POWER_MODIFY` に **＜クラス＞/《カード名》フィルタ判定**を追加。従来は acce カードの `POWER_MODIFY` を無条件でホストへ加算していた（`WD18-015 マヨ`＝＜調理＞限定が非調理ホストにも誤加算）。`target.filter` から関係フラグ `acceHost` を除いた残り（cardClass/cardName 等）を `matchesFilter(hostCard, …)` で判定し、満たすときのみ加算。
- **パワー acceHost 化（4枚）**: `WX17-033 キャビアラ`(＋1000調理)／`WD18-013 ケチャ`(＋5000調理)／`WD18-015 マヨ`(＋2000調理)／`WXDi-P09-TK01A ケチャチャ`(＋10000)。plain `POWER_MODIFY`→`filter:{acceHost,(cardClass)}`。
- **能力付与 `GRANT_ACCE_HOST_ABILITY` 化（フラット化是正）**: 効果耐性＝`WX15-102 メダマヤキ`(シグニ)／`WX15-105 トロチー`(スペル)／`WXK04-050 ブルジャム`(ルリグ)、ダウン耐性＝`WX21-041 オロラソ`(GRANT_PROTECTION from `DOWN`)、キーワード＝`WXEX1-70 セアブラ`/`WXDi-P09-TK02A セアブラマシマシ`(【ランサー】)、AUTO＝`WX15-058 テキソス`(ON_ATTACK エナチャージ)/`WX16-074 メーシロ`(ON_BANISH ドロー)。いずれも付与能力は `target self count1` でホスト自身を指し、各保護/キーワード収集器がホスト（augMap 上の効果元）を対象に解決する。
- **パワー＋付与の複合**: `WX20-072 チョコプレート`(《ウェディング》限定へ filter 修正＋＋1000 power 追加)／`WXEX2-69 メロシロ`(＋3000調理 power 追加)／`WDK17-015 グラシュ`(＋2000 power＋被バニッシュ耐性 from `BANISH`/`bySourceType:シグニ`)／`SP27-015 トンカツ`(既存 power E2 へ `acceHost` 付与)。
- **置換効果**: `WXDi-P09-TK03A オンタマ`(`ACCE_BANISH_SUBSTITUTE`＝既存配線)に加え、`WXK04-031 メレドール`(`ACCE_BANISH_SELF_TRASH`＝代わりにアクセをトラッシュ。CONTINUOUS STUB は発火しないため **BattleScreen バトルバニッシュ防御チェーンに分岐追加**＝アクセをトラッシュしホストはダウンせず存置)。
- **parser（`parseSentencePart2`）**: acceHost パワールールを ＜クラス＞/《名前》限定にも拡張（従来は無限定のみ。build:effects は不使用だが将来同型に追従）。
- **検証**: `scripts/_verifyAcceHost.ts` ハーネス12項 pass（クラス限定の加算/非加算、《名前》限定、能力付与＝シグニ免疫あり・アーツ免疫なし・非調理ホストへ付与なし、【ランサー】付与、AUTO付着）。`tsc` 通過・`eslint` 新規エラー0。
- **未対応（複雑/特殊。現状 no-op のまま据置）**: `WX17-075 タルタル`(正面低レベル誘発)／`WX17-077 サルサス`(相手ターン終了時の自己トラッシュ＋選択)／`WXK10-074/075`・`WDK07-E14`(アタック時の動的パワー減/任意コスト)／`WX20-045 マロンクリーム`(正面強制アタック)／`WX22-043 クギニ`(全色)／`SPK01-11 ラズベリー`(他能力の選択参照)。忠実な語彙が未整備のため、誤動作を避け付与しない方針。→ TODO 参照。

---

## 逆翻訳乖離 G194／G196／G197 の修正（条件・コスト欠落）（2026-06-25）

grouped_all の「がない」乖離3系統を修正。いずれもデータ欠落で、エンジン側は既に対応済みだったため [[decompile-engine-parity]] の偽陰性（逆翻訳だけ健全に見える）に該当。

- **G194（WXK04-065 カモミール／WXK04-067 キヌガサ）**: 【自】「**対戦相手のターンの間**、このシグニがバニッシュされたとき【エナチャージ１】」の **`対戦相手のターンの間` が欠落**（常時のバニッシュ誘発になっていた）。`activeCondition:{TURN_OWNER, owner:opponent}` を付与（前例 WXK04-060／engine `checkActiveCondition`＋ON_BANISH収集が活性条件を評価）。
- **G196 E1（WXK04-080 アラザン／WXK04-082 ブルーワイハ）**: 【常】「**このシグニに【アクセ】が付いているかぎり**、**このシグニ**のパワー＋3000」が **`IS_SELF_ACCED` 条件欠落＋対象が「あなたのシグニ1体」**（常時＋誤対象）だった → `activeCondition:{IS_SELF_ACCED}`＋対象 `filter:{thisCardOnly:true}`（前例 WX15-099／engine実装済）。
- **G197（WXK04-089 マダラモリ＝水獣／WXK09-079 Ｔ・Ｐ・Ｓ＝電機）**: 【出】「手札から＜X＞シグニ1枚をエナに置く：エナから＜X＞シグニ1枚を手札」の **コスト（手札→エナ）と＜X＞クラスフィルタが両方欠落**。さらに `mandatory:false`＋コスト無しのため `handleSummonSigni` の `droppedOnPlay` 警告対象＝**そもそも発火していなかった**。`cost:{handToEnergy:{count:1, filter:{cardClass}}}`＋TRANSFER_TO_HAND source に `filter:{cardClass}` を付与。**engine／支払いUIは `executeSigniOnPlayCost`（手札→エナ移送）＋ON_PLAYコストモーダル（can-afford・選択フィルタ・ラベル）が既に `handToEnergy` 完備**。`cost.handToEnergy`／`handToUnderSelf` の **decompile レンダリングが未対応だった点のみ `costJa` に追加**。
- **検証**: `typecheck` 通過。`verifyEffects` 6枚とも新規警告なし。decompile sheet3／4＋grouped_all＋_review_repr 再生成、6枚とも原文一致、★逆翻訳割れグループ **0件** 維持。

### 追記: G196 E2「これにアクセされているシグニのパワーを＋3000する」も本実装（同日）

E2（WXK04-080／082）は **`POWER_MODIFY owner:any count:1`** だったため、`calcFieldPowers` の「count≠ALL＝効果元自身」規則（effectEngine.ts:1162）で **アラザンが場にいる限り常に自己＋3000**になる誤実装だった（逆翻訳も「自分または対戦相手のシグニ1体」）。意味は「これ（アラザン）がアクセとして装着されているホストシグニを＋3000」＝**アクセ→ホストのパワー修正**（ユーザー確認）。エンジンの既存機構 effectEngine.ts:1040（アクセカードの CONTINUOUS POWER_MODIFY をホストへ加算）を使う形へ修正。

- **新フィルタ `TargetFilter.acceHost`**: 「これにアクセされているシグニ＝このカードのアクセ装着先ホスト」。`POWER_MODIFY target.filter.acceHost:true delta:3000`（activeCondition は付けない＝原文に条件節が無いため逆翻訳一致）。
- **engine（effectEngine.ts:1162）**: count≠ALL の自己適用ブロックに `if (target.filter?.acceHost) continue;` を追加。場のシグニとしての自己バフを抑止し、ホスト加算は signi_acce ループ（:1040、activeCondition 無し/IS_SELF_ACCE_CARD のみ許可）に委ねる。
- **parser（parseSentencePart2.ts）**: `^これにアクセされているシグニのパワーを＋N(する)` → `POWER_MODIFY acceHost` を生成する系統ルールを新設（同型の将来カードも自動対応。＜クラス＞限定形 WX17-033 はホスト側クラス判定が要るため対象外）。
- **decompile（costJa 隣の `POWER_MODIFY`）**: `target.filter.acceHost` を「これにアクセされているシグニ」と表示。
- **実機相当検証**: `calcFieldPowers` ハーネスで3系統 pass — ①アラザンがアクセ装着→ホスト+3000、②場・アクセ無し→base据え置き（スプリアス+3000なし）、③場・アクセ有り→E1のみ+3000（E2は自己適用せず）。E1とE2の逆翻訳が原文と完全一致。

---

## 【デコレ】起動能力の未実装（G192）と逆翻訳の読みやすさ改善（2026-06-25）

逆翻訳グループ G192（WXK04-016/017 エルドラ TYPE×Ⅲ／Ⅱ）が「(effects.json に登録なし)」になっていた件を調査。**【デコレ】起動能力が全デコレカードで未実装**だったことが判明し修正した。

- **根本原因**: パーサー `effectParser.ts` `stripKeywordPrefixes` が **【デコレ】を非効果キーワード接頭辞として丸ごと除去**していたため、デコレ起動能力（青×0・ターン1回で手札の＜調理＞シグニを場の＜調理＞シグニの【アクセ】にする）がどのカードにも生成されていなかった。デコレ持ち9枚すべてで欠落（効果ありの7枚は「デコレ**以外**」の能力のみ登録）。`execAttachAcce` の `fromHand` 分岐（＝デコレ実行パス）は実装済みだが、JSON全体で `ATTACH_ACCE fromHand:true` が0件で**到達不能の死にコード**だった。逆翻訳上は「登録なし」と綺麗に出るため [[decompile-engine-parity]] の典型的な偽陰性。
- **修正（manualEffects へ durable 登録）**: ＜調理＞のエルドラ全9枚（WXK04-003/016/017/018、WXK05-014、WDK07-E01〜E04）に `-DECORE` の新IDで **`ACTIVATED timing:[MAIN] cost:{energy:[青×0]} ATTACH_ACCE(fromHand:true, signiFilter/targetFilter=story:調理) usageLimit:once_per_turn`** を追記（マージは追記方式なので既存効果は不変）。中央ルリグの自前【起】機構（BattleScreen `getMyLrigFieldActions`）でボタン化され `execAttachAcce`→fromHandパスに到達。青×0は既存 BLOOD_CRYSTAL_ARMOR と同パターンで実績あり。
- **decompile 読みやすさ**: `actionJa` に **`ATTACH_ACCE`**（デコレ/アクセクラフト両対応）と **`BLOOD_CRYSTAL_ARMOR`**（領域・枚数を反映）のケースを追加（従来は `[アクション:型名]` のフォールバック表示だった）。
- **`genStubsMd.mjs` 区切りコメント漏れ修正**: `stub.id ===` 直前コメントを遡る際 **`─── …`／`=== バッチN: …` の装飾区切り行まで巻き込み**、STUB説明に混入していた（PLACE_SEED_FROM_REVEALED, ACCE_FROM_HAND, CRAFT_TO_LRIG_DECK 他多数）。区切り行（`─{3,}`／`={3,}`）で打ち切るよう修正し、全シートの `[STUB:…]` から罫線混入を一掃（残存0）。
- **検証**: `typecheck`／`eslint`（変更3ファイル）／`verifyEffects`（デコレ9枚に新規警告なし）通過。逆翻訳を全10シート＋ grouped_all＋_review_repr 再生成、★逆翻訳割れグループ **0件** 維持。G192の2枚は「登録なし」→デコレ起動能力の和文表示に解消。

---

## 血晶武装：関連カード全数監査と逆翻訳乖離の修正（2026-06-24）

血晶武装に関連する全カード（CSV上26枚）を監査。**エンジン層（アクション実行・場離脱時の下カードトラッシュ・`IS_SELF_ARMORED`/`THIS_CARD_IS_ARMORED` 条件・`isArmored` フィルタ・`ON_BLOOD_CRYSTAL_ARMOR` トリガー収集・既武装の再武装でトリガー不発）は完備**を確認。一方で **decompile された effects JSON 側に複数の逆翻訳乖離**があり、確証の取れたものを修正した。

- **parser修正①（triggerScope）**: `inferTriggerScope` の「あなたのシグニ…が血晶武装状態になったとき」正規表現が **`＜紅蓮＞の` を挟む形を取りこぼし**、WDK08-L01 英血の器 優羽莉Lv4（ルリグ）の「あなたの＜紅蓮＞のシグニ１体が血晶武装状態になったとき」が `self` 既定になり**ルリグでは永久に不発**だった。`あなたの(?:＜[^＞]*＞の)?シグニ…` に拡張し `any_ally` を返すよう修正。トリガー本文抽出の正規表現も同様に拡張。
- **parser修正②（活性条件）**: `extractActiveCondition` パターン6b が **「このシグニ**が**血晶武装状態であるかぎり」しか拾わず「このシグニ**は**…」を取りこぼし**ていた（`[はが]` に拡張）。これが下記JSON乖離の根因。
- **JSON修正・第1弾（条件欠落系。manualEffects へ durable 化）**:
  - **WXK04-028 アカズキン-E1**: `activeCondition:IS_SELF_ARMORED` 欠落で**常時ダブルクラッシュ**だった → 武装中のみへ。
  - **WDK08-L15 コノハナサクヤ-E1**: 同様に**常時アサシン**だった → 武装中のみへ。
  - **WXK04-074 スノーホワイト-E2**: `condition:THIS_CARD_IS_ARMORED` 欠落で**ターン終了時に武装と無関係に常時エナチャージ**していた → 武装時のみへ。
  - **WDK08-L13 アマテラス-E1**: 「あなたの血晶武装状態のシグニはダブルクラッシュを得る」が `owner:any count:1`（任意1体へ常時付与）だった → `count:'ALL' owner:self filter:{isArmored:true}`（BattleScreen `contGrantedKeywords` が `isArmored` を honor）。

- **JSON修正・第2弾（誤訳・付与能力系。manualEffects＋エンジン補強）**:
  - **WXK04-042 オトタチバナ**: E1 が「CONTINUOUS BANISH（常時バニッシュ）」に**完全誤訳**＋ +2000欠落だった → **E1=`POWER_MODIFY+2000`（武装中）／E1b=`AUTO ON_ATTACK_SIGNI condition:THIS_CARD_IS_ARMORED BANISH(powerLteSelf)`** に分割。E2 に欠落していた「パワー10000以上の場合」を `condition:SELF_POWER_GTE 10000` で補完。
  - **WXK04-044 オズマ姫-E1**: 「常時UP」誤訳 → **`AUTO ON_SIGNI_BANISH_BATTLE condition:THIS_CARD_IS_ARMORED` で自身UP**。あわせて BattleScreen の `ON_SIGNI_BANISH_BATTLE` 収集に **`eff.condition` 評価を追加**（従来 condition 未評価だった経路を他カード含め healthier 化）。
  - **WXK05-023 アンゴルモア-E1**: 「シグニ1体（自他不問）」が `owner:self` 固定だった → `owner:any`。
  - **WXK04-030 血晶の紅雨**: E1 が「`SHUFFLE_DECK`＋相手シグニ全バニッシュ」の**完全誤訳**だった → **SEQUENCE**〔①`BLOOD_CRYSTAL_ARMOR source:[deck] targetFilter:{story:紅蓮}`（武装＋シャッフル）→ ②`POWER_MODIFY count:ALL filter:{isArmored} +5000` → ③新設STUB `INTERNAL_GRANT_ATTACK_BANISH_TO_ARMORED`〕に再構成。③は全血晶武装シグニへ「【自】アタック時、自パワー以下の相手シグニ1体バニッシュ」を `granted_effects`（ターン終了時まで）で付与（`execSequence` の continuation で対話的①の後に②③が継続することを確認）。BURSTはJSON維持（正しい）。
- **検証**: `typecheck`／`eslint`（変更ファイル）通過。修正正規表現を実カードテキストで単体確認（L01/043/L17=any_ally、05-023=self、028/074/L15 の は/が 両方一致）。

- **JSON修正・第3弾（残りの乖離を全消化。manualEffects＋エンジン基盤）**:
  - **WXK04-002 優羽莉Lv4'-E1**: 「あなたの血晶武装状態のシグニは相手ルリグの効果を受けない」が `target:{count:ALL}`（`collectEffectImmuneSigni` が honor せず実質無効）だった → **`subjectFilter:{isArmored:true}/subjectOwner:self`** へ。あわせて `collectEffectImmuneSigni` の `subjectFilter` 収集に **`matchesStateFilter` 評価を追加**（カード属性だけでなくゾーン状態 isArmored 等も honor）。
  - **WXK04-070 那須与一-E1／WXK04-072 ママリリ-E1b**: 武装中の多面アタック（070=両隣にも／072=正面以外にも）。070はMULTI_ZONE_ATTACKに `activeCondition:IS_SELF_ARMORED` 欠落で常時発動だった→付与。072は多面アタック自体が欠落→E1bで追加（+3000のE1はJSON維持）。BattleScreen の MULTI_ZONE_ATTACK 検出に **`activeCondition` 評価を追加**。
  - **WDK08-L14 清姫-E1**: 「通常1つ／血晶武装中は3つまで（同一選択肢可）選ぶ」が常時 from3/choose1 だった → 専用STUB **`INTERNAL_KIYOHIME_CHOOSE`**（武装で1→3回ループ、各回で①全シグニ-1000／②パワー4000以下バニッシュ／③2引き2捨て を重複選択可）。
  - **血晶武装アクションの対象クラス限定**: `BLOOD_CRYSTAL_ARMOR` に `targetFilter:{story:'紅蓮'}` を付与（非紅蓮シグニの誤武装を防止）。WXK04-002/011/012/013、WXK05-011、WDK08-L01/L02/L03/L04（WXK04-030は再構成時に付与済み）。パーサー `parseSentencePart2` にも「＜紅蓮＞のシグニ…血晶武装」抽出を追加。
- **検証**: `typecheck`／`eslint`（変更ファイル・新規エラーなし）通過。`buildEffectsMap` マージ結果を16項目で実地検証（第3弾の全構造＋第1/2弾の回帰）→ ALL PASS。

- **JSON修正・第4弾（WXK04-014 血晶操作のベット選択肢を完全実装）**:
  - 血晶操作はベット（`BET_MECHANIC`）で「3つから1つ／ベット時は2つまで選ぶ」。BET_MECHANIC自体は実装済みだが、選択肢パーサー `parseSingleChoiceText`（choiceTextParser）が**①の条件付き捨てと③の血晶武装を解析できず**、③は選択肢から脱落、①はドロー4のみの近似だった。
  - **③** 「あなたの＜紅蓮＞のシグニ1体を血晶武装［トラッシュ］する」→ `BLOOD_CRYSTAL_ARMOR source:[trash] targetFilter:{story:紅蓮}` を解析するブランチを追加。
  - **①** 「カードを4枚引く。＜紅蓮＞のシグニを1枚捨てないかぎりカードを2枚捨てる」→ `SEQUENCE[DRAW4, STUB INTERNAL_DISCARD_CLASS_OR_PENALTY("紅蓮:2")]` に。新設STUBは「＜紅蓮＞を1枚捨ててペナルティ回避」か「2枚捨てる」を選ばせる（紅蓮非所持なら後者のみ）。
  - **②**（ルリグダメージ無効）は既存対応。検証: `parseChoiceOptionsFromText` で3択すべてが期待アクションに解決されることを確認（ALL PASS）。

### 仕様上の標準表現（乖離ではない）
- **WDK08-L14-E1 ②「対象→パワー4000以下ならバニッシュ」**: `filter:powerRange.max=4000` で表現。これは本コードベースで「パワーN以下の場合バニッシュ」を表す**標準慣例**（4000超はどちらの表現でも非バニッシュで結果同値。>4000を「対象に取って何も起きない」縮退選択を許さない分むしろ親切）。専用の対象後条件分岐は導入しない（全カードの一貫性を優先）。

---

## 【シード】設置フローの修正：複数枚設置の新設＋設置カード消失バグ（2026-06-24）

【シード】をデッキ等から設置する全フローで、**ゾーン選択（CHOOSE）を挟むと設置カードが消える**潜在バグを修正し、あわせて **WXK04-010 アンコール・シード（2枚まで設置）** を実装した。

- **潜在バグ（設置カード消失）**: シード設置の確定 `INTERNAL_SET_SEED` は設置カードを `ctx.lastProcessedCards[0]` から読んでいたが、`needsInteraction` も BattleScreen の resume（`handleEffectInteraction` の ctx 再構築 5123行）も **`lastProcessedCards` をインタラクション跨ぎで保持しない**。そのため「カードを選ぶ → デッキから取り出す → ゾーンを選ぶ」型の単数シード設置（`INTERNAL_SEED_FROM_DECK` / `INTERNAL_SEED_TO_HAND_THEN_DECK_TOP` / `INTERNAL_SEED_FROM_DECK_TOP_PLACE`）は、ゾーン選択後に設置カードを見失い、**デッキからは抜けるのに【シード】が置かれない＝カードが消失**していた（WXK04-007/008/009・WXK05-007・WDK07-Y02/Y03/Y04、ヤマレンゲ `SEED_FLOWER_OP`、プラント・アレンジ `SEED_HAND_AND_BLOOM_FROM_DECK_TOP`）。
- **修正**: `StubAction` に `seedCards?: string[]` を追加し、ゾーン選択 CHOOSE の各オプション action に**設置カードを埋め込む**（`INTERNAL_SET_SEED { value:zone, seedCards:[card] }`）。`INTERNAL_SET_SEED` は `stub.seedCards[0] ?? lastProcessedCards[0]` の順で解決。これは `execPlaceSigniOnField`（複数枚場出し）が remaining をオプション/continuation に積んでインタラクション跨ぎ保持する既存方式と同じ。`INTERNAL_SET_SEED` はデッキからの除去も行うよう補強。
- **WXK04-010 アンコール・シード（2枚まで設置）**: action を `LOOK_AND_REORDER`(top4 を見る) → `STUB PLACE_SEEDS_FROM_REVEALED{value:2}` → `SHUFFLE_DECK` に再構成。新設の `PLACE_SEEDS_FROM_REVEALED`（SEARCH maxPick:N）＋ `INTERNAL_SEEDS_PLACE_LOOP`（選んだ N 枚を1枚ずつゾーン選択、残りは CHOOSE の continuation に `seedCards` で積んで順次設置）で、**0/1/2枚いずれの選択でも正しく設置**。`lastProcessedCards` に非依存。
- **検証**: `typecheck` 通過。エンジン直結の統合テストで (a) 2枚設置（両方が指定ゾーンに着地・デッキから除去）、(b) 1枚のみ／0枚選択、(c) 単数シード設置の回帰（**resume を ctx に lastProcessedCards 無しで再現**しても設置成功）を確認。

---

## 【シード】開花トリガー ON_BLOOM 新設（開花≠場に出た）（2026-06-24・11効果）

【シード】を開花したときのトリガー「【自】：このシグニが開花したとき、…」が **ON_PLAY（出現時）として扱われていた** ため、ルール上の3つの誤りが生じていた。公式ルール「開花して表向きにしたシグニは**新たに場に出たわけではない**ので出現時能力はトリガーしない」に合わせて専用 timing `ON_BLOOM` を新設して修正した。

- **誤り①（開花トリガーが通常召喚で誤発火）**: 「開花したとき」が `ON_PLAY` に分類されていたため、そのシグニを**普通に場に出しただけで開花効果が発火**していた（例: WXK05-033 イジュは本来 別の【出】を持つため、開花効果まで召喚時に暴発）。
- **誤り②（開花で本来の出現時が誤発火）**: 旧 `SEED_BLOOM` ハンドラが開花したシグニの **ON_PLAY（＝本物の出現時）をスタックに積んでいた**。開花は場に出た扱いではないので出現時は発火してはならない。
- **誤り③（開花が他シグニの「場に出たとき」を誤起動）**: `detectPlacedSigni` が【シード】→シグニの遷移を「新規場出し」と判定し、他シグニの ON_PLAY(any_ally) 監視が開花に反応していた。
- **修正（型）**: `EffectTiming` に `ON_BLOOM` を追加。
- **修正（JSON・手動管理）**: 開花トリガー11効果を `timing:["ON_BLOOM"]` に変更。自己＝`triggerScope:"self"`（WXK04-026-E2〔旧ON_TURN_END〕/ WXK04-036-E1/E2 / WXK05-033-E2 / WXK10-059-E3 / WXK04-060-E3 / WXK05-050-E2 / WDK07-Y11-E2 / WDK07-Y14-E2）、他シグニ監視＝`triggerScope:"any_ally"`（WXK05-021-E1 / WXK10-059-E2「あなたの他のシグニが開花したとき」）。
- **修正（engine・BattleScreen）**: `detectBloomedSigni`（signi_seeds→signi の同一 instanceId 遷移を検出）と `collectBloomTriggers`（自己 self ＋ 場の他シグニ any_ally/any を `collectFieldTriggers('ON_BLOOM')` で収集）を新設。両エフェクト解決経路（通常／pending_effect）で、開花したシグニを `detectPlacedSigni` の ON_PLAY 収集から除外しつつ ON_BLOOM を発火。旧 `SEED_BLOOM` の ON_PLAY 積み込み（2箇所）は削除。state 差分検出ベースなので INTERNAL_BLOOM_SEED / 好きな枚数 / SEED_FLOWER_OP 等の全開花経路を漏れなく拾う。レベル/リミット超過でトラッシュ送りになった開花は signi に入らないため ON_BLOOM 不発＝ルール通り。
- **修正（decompiler/parser parity）**: `effectParser` の【自】timing 判定に「開花したとき」→`ON_BLOOM` を追加し、`このシグニが`=self／`あなたの[他の]シグニが`=any_ally の triggerScope を抽出。プレフィックス除去にも開花トリガー文を追加（「アタックしたとき…開花してもよい」は ON_ATTACK_SIGNI のまま誤検出しないことを確認）。
- **検証**: `typecheck` 通過。`lint` 新規エラーなし（既存 warning のみ）。parser 単体テストで self/ally/attack-非開花の3ケースが期待どおり分類されることを確認。

---

## WXK09-038「いずれかのプレイヤーが手札を捨てたとき」を engine 対応（2026-06-24）

[G189系 timing 修正](#g189系ガードステップ以外で手札を捨てたときのトリガー-timing-誤り修正2026-06-245枚)で保留した WXK09-038-E1（魔界の射手 ステラ系）「【自】：ガードステップ以外で**いずれかのプレイヤー**が手札を１枚捨てたとき、対戦相手のシグニ１体を…－2000」を正確実装した。

- **課題**: 既存 `collectHandDiscardTriggers` は「捨てた本人(=自ターン・自フィールド)」のみ収集。「いずれかのプレイヤー」だと**相手の手札捨て**でも自分のシグニが発火する必要がある。
- **JSON**: WXK09-038-E1 を `timing:["ON_HAND_DISCARDED"]` + `triggerScope:"any"`。
- **engine（BattleScreen）**: `collectHandDiscardTriggers` を triggerScope 対応に拡張。引数を `(discardedNums, myState, discarderId, asCost, opState?, opId?)` に変更し、
  - **discarder の自フィールド**: `any` はターン問わず・`self`/`any_ally` は discarder の自ターンのみ収集（既存挙動維持）。
  - **discarder の相手フィールド**: `triggerScope:'any'` のみ、その相手をコントローラー(playerId)として収集。usageLimit は参照チェックのみ（該当カードは無制限）。
  - 手札捨ての全4経路（効果捨て watcher・【起】/【出】/起動コスト捨て）に `discarderId=user.id` と相手 state/id を渡すよう更新。
- **CPU戦**: watcher に CPU(guest)の `hand_discarded_just` 検出を追加（virus watcher の processCpu と同型）。人間(host)が CPU の捨てを処理し、CPU自身の self/any＋人間盤面の any を収集・guest フラグをクリア。
- **「ガードステップ以外で」**: `performGuardResponse` はガード時の手札→トラッシュで `hand_discarded_just`/asCost を立てない（コード確認済）ため、`ON_HAND_DISCARDED` はガードでは発火せず構造的に担保される。
- **decompiler**: `ON_HAND_DISCARDED`+`triggerScope:'any'` を「ガードステップ以外でいずれかのプレイヤーが手札を捨てたとき」と和文化し、`〔範囲:any〕`マーカーを抑制。
- **検証**: `typecheck`・`lint`（新規エラーなし／既存 warning のみ）。decompile_sheet4・grouped_all 再生成で原文どおりの逆翻訳を確認。

---

## G189系「ガードステップ以外で手札を捨てたとき」のトリガー timing 誤り修正（2026-06-24・5枚）

WXK03-064（魔界の公爵 クロケル）/ WXK03-065（魔界の破片 カガミ）ほか、原文「【自】：ガードステップ以外であなたが手札を１枚捨てたとき、対戦相手のシグニ１体を…ターン終了時まで、それのパワーを－N する」系。

- **逆翻訳乖離（トリガーが別物）**: パーサが**持続「ターン終了時まで」をトリガー timing「ターン終了時(ON_TURN_END)」と誤認**し、JSON が `timing:["ON_TURN_END"]` になっていた。結果、本来「手札を捨てたとき」に発火すべき効果が**毎ターン終了時に誤発火**する挙動だった（パワー減少の持続自体は `duration:UNTIL_END_OF_TURN` で別途保持されていたため二重に取り違え）。
- **修正**: `timing` を `ON_HAND_DISCARDED`（=「ガードステップ以外であなたが手札を捨てたとき」）へ変更。`duration:UNTIL_END_OF_TURN`・`usageLimit`・`mandatory` は据え置き。`ON_HAND_DISCARDED` は engine 配線済（`collectHandDiscardTriggers`。自ターンのみ収集＝ガードはアタック中＝相手ターンなので**ガードステップ除外を自然に担保**）。対象5枚: **WXK03-064-E1 / WXK03-065-E1 / WXK03-024-E3 / WXK10-070-E1 / WDK10-011-E1**（いずれも主語「あなたが」・対象「対戦相手のシグニ1体」）。
- **decompiler**: `timingJa` に `ON_HAND_DISCARDED`（「ガードステップ以外であなたが手札を捨てたとき」）と `ON_DISCARDED_AS_COST` のラベルを追加（未登録だと生 id が逆翻訳に露出するため）。
- **保留（TODO 記録）**: **WXK09-038-E1** は原文が「**いずれかのプレイヤー**が手札を捨てたとき」で、相手の手札捨てでも発火させる engine 拡張（`collectHandDiscardTriggers` の相手ターン/相手捨て対応）が要るため timing は据え置き（`ON_TURN_END` のまま）。逆翻訳を「あなた」に変えると主語が原文と乖離するため、エンジン側とセットで対応する。
- **検証**: `typecheck`・`lint`（新規エラーなし）。JSON 妥当性 OK。decompile_sheet3/4/5・grouped_all 再生成で5枚とも原文どおりの逆翻訳になることを確認。

---

## G186「アタックしているシグニとして場に出す」を近似→正確化（2026-06-24・3枚）

WXK02-071 / WXK10-057 / WDK05-T15。直前の[初回修正](#g186アタック時に手札に戻りデッキトップ公開シグニならアタック継続逆翻訳乖離修正2026-06-243枚)で残した2つの近似を解消し、`REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI`（execStubPart3）を正確実装にした。

- **アタック継続を正確に**: BattleScreen のアタックは ON_ATTACK_SIGNI 収集前に `pending_signi_battle.zoneIndex`（アタッカーの元ゾーン）を保存し、トリガー解決後の Phase 2（`resolvePendingSigniBattleFor`）が**そのゾーンのシグニをアタッカーとして**ダメージ処理する。よって新シグニを**「空きゾーン」ではなくアタッカーの元ゾーン**へダウン配置すれば、同一アタックがそのまま継続する。battle ループ側の攻撃側差し替え機構は不要だった。旧実装は先頭の空きゾーンへ置いていたため、元ゾーン≠先頭空きのとき Phase 2 がアタッカーを見失い**アタックが消える**バグでもあった。
- **「そうした場合」を正確に**: バウンス（BOUNCE optional）を選ばなかった場合は公開も配置も起きない。パーサが「そうした場合」に転用する `CONDITIONAL(IS_MY_TURN)` はシグニアタック中は常時 true で条件にならないため、STUB 内で **`sourceCardNum` がまだ自分のシグニゾーンに残っている＝バウンス未実行なら不発**と判定するように変更。
- **検証**: `typecheck`・`lint`（新規エラーなし）。`scripts/_verifyRevealTopPlaceAttacker.ts` を拡充（**10/10 pass**）＝元ゾーン配置/非シグニ温存/バウンス未実行で不発/フォールバック/空き無し温存。STUBS.md・decompile_sheet3/4/5・grouped_all を再生成し「近似」注記を除去。

---

## G186「アタック時に手札に戻り→デッキトップ公開→シグニならアタック継続」逆翻訳乖離修正（2026-06-24・3枚）

WXK02-071（偉智の遊 サンポケ）/ WXK10-057（讃の遊 ボブスレー）/ WDK05-T15（仁の遊 カマクラ）の【自】「このシグニがアタックしたとき、このシグニを場から手札に戻してもよい。そうした場合、デッキの一番上を公開する。それがシグニの場合、それをアタックしているシグニとしてダウン状態で場に出す」。

- **逆翻訳乖離（偽陰性）**: JSON が BOUNCE（`thisCardOnly`無し）＋ `LOOK_AND_REORDER`（見るだけ）＋ `ADD_TO_FIELD`（直前カード）の近似で、逆翻訳が「あなたのシグニ1体を手札に戻す…デッキの上1枚を見る…直前に選んだカードを場に出す」となり、**①「このシグニ」自身限定、②「それがシグニの場合」分岐、③「アタックしているシグニとして」、④「ダウン状態で」が全て脱落**。健全に見えて中身が別物だった。
- **修正**: ①BOUNCE 対象に `thisCardOnly:true`（「このシグニ」）。②③④を 1 つの専用 STUB `REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI` に集約（既存 `REVEAL_TOP_CONDITIONAL_ROUTE` と同方式＝bespoke ハンドラ＋逆翻訳に `[STUB:説明]` を明示）。`そうした場合`（バウンス時）の `CONDITIONAL(IS_MY_TURN)` の中に配置。
- **engine ハンドラ（execStubPart3）**: デッキトップを公開し、**シグニなら空きシグニゾーンへダウン状態で配置**（デッキから除去）、シグニでなければ場に出さずトップに残す、空きゾーンが無ければ温存。「アタックしているシグニとして（アタック継続）」は**ダウン配置で近似**（厳密なアタック継続＝同一アタックの続行は battle ループ未対応・TODO 記録）。
- **検証**: `typecheck`・`lint`（新規エラーなし）。`scripts/_verifyRevealTopPlaceAttacker.ts`（**6/6 pass**）でシグニ→ダウン配置/非シグニ→温存/空き無し→温存を確認。STUBS.md 再生成、decompile_sheet3/4/5・grouped_all 再生成、3枚とも原文の各句を逆翻訳が再現（STUB明示）。

---

## G185「ルリグトラッシュにアーツがあるかぎり＋5000」条件欠落バグ修正（2026-06-24・2枚）

WXK01-098（幻怪 ドライアド）/ WDK03-015（幻怪 イッタンモメン）の【常】「あなたのルリグトラッシュにアーツがあるかぎり、このシグニのパワーは＋5000される」が、**activeCondition が欠落**し `POWER_MODIFY{owner:self,count:1,delta:5000}` のみだった。

- **engine バグ（有害）**: CONTINUOUS POWER_MODIFY は `count !== 'ALL'` を「このシグニ自身」として扱い、`checkActiveCondition(undefined)=true` のため、**ルリグトラッシュにアーツが無くても常時＋5000**が乗っていた（条件無視）。
- **逆翻訳乖離**: `thisCardOnly` 無しのため「あなたのシグニ1体のパワーを＋5000する」と描画され、原文「このシグニ」とも実 engine 挙動（自己バフ）とも不一致だった。
- **データ修正**: 両カードに `activeCondition: LRIG_TRASH_COUNT(アーツ,gte,1)` と target.filter に `thisCardOnly:true` を追加。
- **engine 配線**: `LRIG_TRASH_COUNT` は `Condition`（AUTO/CONDITIONAL）と decompiler・`evalConditionForContinuous` には既存だったが **`ActiveCondition` 型と `checkActiveCondition` に未対応**（不明な条件は default で true＝常時有効になっていた）。`ActiveCondition` に `LRIG_TRASH_COUNT` を追加し、`checkActiveCondition` に `evalConditionForContinuous` と同実装のケースを追加。`matchesFilter` は `thisCardOnly` を無視するため自己バフ挙動は不変。
- **検証**: `typecheck`・`lint`（新規エラーなし）。`scripts/_verifyArtsTrashBuff.ts`（**3/3 pass**）で「アーツあり→10000／空→5000／スペルのみ→5000」を確認。decompile_sheet3/4・grouped_all 再生成、2枚とも原文一致。

---

## G184/G218「ドライブ状態になったとき」逆翻訳乖離修正＋`ON_SIGNI_BECOMES_DRIVE` engine 配線（2026-06-24・4枚）

「シグニがドライブ状態になったとき（＝ルリグがライドした瞬間）、相手のパワーN以下のシグニをバニッシュする」効果4枚が、トリガーを `ON_PLAY` と誤分類していた。逆翻訳が「このシグニが場に出たとき」となり原文「ドライブ状態になったとき」を再現できず、さらに G184 はバニッシュ対象のパワー条件（パワーN以下）も欠落。エンジン上も**場に出た瞬間に相手シグニをバニッシュする偽の挙動**で発火していた。

- **新トリガー timing**: `ON_SIGNI_BECOMES_DRIVE` を新設（EffectTiming）。逆翻訳語「このシグニがドライブ状態になったとき」を追加し、`triggerScope:any_ally` で「あなたのシグニが…」に展開。
- **データ修正**: WXK01-076/079（effects_WXK）＝`ON_PLAY`→`ON_SIGNI_BECOMES_DRIVE`・`triggerScope:any_ally`・バニッシュ対象に `powerRange.max`(3000/1000) 補完・任意《赤》コスト。WDK01-014/017（effects_misc）＝timing 修正（パワー条件は既存・正、自身がドライブ化する `self` スコープ）。
- **engine 配線（G073/ON_ZONE_MOVED と同パターン）**: PlayerState に `drive_became_just?: string[]` を追加。ライド実行3パス（execStub `LRIG_RIDE_SIGNI`/`CENTER_LRIG_RIDES_ON_SIGNI`/`RIDE_ON`）が `lrig_riding_signi` を**新規セットする差分シグニ**を所有者 state に積む。BattleScreen の watcher useEffect が `drive_became_just` を検出し、`collectDriveBecameTriggers`（self/any_ally=driver側・any_opp=相手側・any=両方）でスタックに積んでフラグをクリア。`triggeringCardNum=ドライブ化シグニ`。usageLimit は actions_done で制御。CPU(=guest) のフラグはホストが代行。
- **検証**: `typecheck`・`lint`（新規エラーなし）。`scripts/_verifyDriveBecome.ts`（**8/8 pass**）で3スタックのフラグ積み・差分のみ積む挙動を確認。decompile_sheet3/4・grouped_all 再生成、4枚とも原文一致・未配線マーク無し。

---

## G179 数字宣言のガード制限副作用バグ修正＋逆翻訳STUB解消（2026-06-24）

G179（WX20-Re05 羅星 デネブ／WX20-Re06 羅星 ポラリス）の【出】「数字1つを宣言する。その後デッキの一番上を公開し、宣言数字と同じレベルのシグニなら手札に加える」。**コアは実装済みで正しく動作**（DECLARE_NUMBER=CHOOSE UIで1〜5宣言／DECK_TOP_CHECK_LEVEL_HAND=デッキトップ判定）。だが2点の問題があった。

- **副作用バグ（修正）**: `DECLARE_NUMBER` は宣言値を `declared_guard_restrict_level` に保存するが、この同一フィールドをガードUI（BattleScreen 13318）が「相手はそのレベルのシグニでガード不可」として無条件に読む。そのため**ガード制限を持たない G179 でも、宣言後に自分のルリグでアタックすると相手が宣言レベルでガード不可になる原文に無い副作用**が出ていた。→ `DECK_TOP_CHECK_LEVEL_HAND` が宣言数字を消費した時点で `declared_guard_restrict_level` をクリア（一致/不一致の両分岐）。本 stub を使う5枚（WX20-Re05/06, WXEX1-58, WXK07-085, WXK10-017）はすべて末尾ステップが判定で、いずれもガード制限文を持たないため安全。本来のガード制限カード（WX10-009/WX19-054/WD21-009 等）はこの stub を使わず無影響。
- **逆翻訳STUB（偽陰性）解消**: 実装済みなのに `[STUB:数字宣言：現在はランダム値で代用]`／`[STUB:デッキトップを公開して…]` と未実装表示だった。decompiler に両 stub の通常文描画を追加。エンジンの古いコメント（「ランダム値で代用」）も実態（CHOOSE UI）に修正。
- **検証**: `typecheck`・`lint`（新規エラーなし）・`verify`（新規警告なし）。**ユニットテスト**で一致/不一致の両分岐とも宣言数字クリアを確認。decompile_sheet2/3/4・grouped_all 再生成、原文一致。JSON は無変更。

---

## 「シグニの効果によってバニッシュされない」の正確化（軸×発生源種別）（2026-06-24・全10枚）

「対戦相手のシグニの効果によってバニッシュされない（シグニとのバトルやパワーが0以下になった場合はバニッシュされる）」が、全10枚で `GRANT_PROTECTION{from:['シグニ']}`＝**シグニの効果を全部受けない**と広すぎる近似だった（G001の★割れ調査で発覚。バウンス/ダウン/パワー減もシグニ効果なら無効化してしまう誤り）。原文は**バニッシュ軸のみ**の保護。

- **新表現**: `from:['BANISH'] + bySourceType:'シグニ'`（GrantProtectionAction に `bySourceType` 追加）。「軸＝バニッシュ」かつ「発生源カード種別＝シグニ」のときのみ保護。
- **エンジン**: 新コレクタ `collectBanishBySourceProtectedSigni(…, sourceCardType)` を追加し、効果解決文脈（ソース種別 `immuneSourceType` が判明する箇所）でのみ `otherBanishProtectedNums` に union。`collectBanishEffectProtectedSigni`（汎用・バトル文脈含む）は `bySourceType` 持ちを**スキップ**＝バトル/ルール処理（power≤0）のバニッシュは保護しない（原文の括弧書きと整合）。`collectEffectImmuneSigni` は `from:['BANISH']` に反応しない＝広義「受けない」化を回避。
- **適用範囲の正確化**: 変換後はバウンス/ダウン/パワー減等の他軸シグニ効果は**保護されなくなる**（＝原文どおりバニッシュのみ）。スペル/ルリグ/アーツ効果のバニッシュも非保護。
- **データ**: 原文に「シグニの効果によってバニッシュされない」を含み `from:['シグニ']` の10枚のみ変換（WXK01-094/096/099, WXK04-064, WXK08-036, WDK07-Y17, WDK17-015, WXDi-P03-074/P10-046/CP01-038）。広義「シグニの効果を受けない」系22枚は不変。
- **逆翻訳器**: 軸トークン描画に `bySourceType` を反映（「対戦相手のシグニの効果によってバニッシュされない」）。
- **検証**: `typecheck`・`lint`（新規エラーなし）・`verify`（新規警告なし）。**ユニットテスト5ケース**（源=シグニ/スペル/ルリグ、汎用コレクタのスキップ、effectImmune非反応）で確認。decompile_sheet3/4/5/7/8・grouped_all 再生成、10枚とも原文一致。

---

## G178 FORCE_PLACE_FRONT（正面配置強制）の実装（2026-06-24）

G178（WX19-Re05 コードメイズ 凱旋／WD07-010 コードメイズ バベル）の【常】「対戦相手がシグニを配置する場合、可能ならばこのシグニの正面に配置しなければならない」が、`BLOCK_ACTION{actionId:'FORCE_PLACE_FRONT'}` として保持されるだけでエンジン未実装＝**完全な no-op**だった（パーサーが生成するのみ・エンジンに参照なし。STUBS.md にも未掲載）。逆翻訳も「対戦相手のは「FORCE_PLACE_FRONT」ことができない」と壊れていた。E2（【起】黒シグニサーチ）・BURST（1ドロー）は正しい。

- **新ヘルパー**: `collectForcePlaceFrontZones(opponentState, myState, ...)`（effectEngine.ts）。配置を強制する側(opponentState)の各シグニ`j`について、強制される側(myState)の正面ゾーン`2-j`（盤面ミラー）を、**空きの場合のみ**集合へ。`collectCenterZoneDeployRestrict` と同型の配置制限パターン。
- **強制の適用**: ①手札召喚UI（ゾーン選択モーダル：正面以外を「正面強制」で無効化）②`handleSummonSigni`（不正ゾーンを拒否）③CPU召喚ループ（正面ゾーンへ誘導）。ライズ（上乗せ）は対象外。
- **複数枚（2枚）対応**: 集合(Set)で全該当シグニの正面を合算。相手が2枚（例 zone0/zone2）持つ場合は正面{0,2}が候補となり、配置側はどちらか一方に置けばよい（1体は1ゾーンのみ＝「可能ならば」充足）。正面が埋まっていれば集合から除外＝強制解除。**ユニットテスト6ケース**（2枚/正面片埋/両埋/0枚/1枚）で確認済み。
- **逆翻訳器**: `BLOCK_ACTION` の `actionId==='FORCE_PLACE_FRONT'` を原文どおり描画（decompileEffects.ts）。全シート（同actionId持ち含む）再生成で旧表記0件。
- **既知の範囲**: 「配置」は通常召喚（人間UI/CPU）を対象。効果による場出し（ADD_TO_FIELD のゾーン選択）への適用は未対応。
- **検証**: `typecheck`・`lint`（新規エラーなし）・`verify`（新規警告なし）。

---

## 逆翻訳割れ G177 の修正（「効果によって場から」トリガー限定の欠落）（2026-06-24）

G177（WX18-086 似之遊 †マヨケメン†／WX18-089 異血之遊 †オニガワラ†）の【自】「このシグニが**効果によって場から**トラッシュに置かれたとき、相手シグニ1体のパワーを－7000/－3000」が、トリガー限定なしの ON_TRASH で、逆翻訳が「このカードがトラッシュに置かれたとき」と無限定に見えていた（ユーザー指摘）。アクションは正しい。

- **修正**: `triggerCondition: { fromZones:['field'], byEffect:true }` と `triggerScope:'self'` を追加。`fromZones:['field']` はエンジンで実際にゲートされ（手札/デッキ/エナからのトラッシュでは発火しない）、自身トラッシュ収集パスは元々 field-origin。
- **「効果によって」の挙動**: 該当 ON_TRASH（自身・field-origin）は効果解決パス（detectTrashedSigni）由来で、通常のバトルバニッシュは ON_BANISH のみ発火し ON_TRASH は発火しない＝実質「効果によって」を満たす。`byEffect` は表現＋意図記録（ルール処理の厳密除外までは個別ゲートせず、ON_TRASH 全体共通の近似）。
- **逆翻訳器**: ON_TRASH に `byEffect→「効果によって場から」` 描画を追加（decompileEffects.ts）。
- **検証**: `lint`・`verify` 新規警告なし。decompile_sheet2・grouped_all 再生成、2枚とも「このカードが効果によって場からトラッシュに置かれたとき」に一致。

---

## 逆翻訳割れ G176 の修正（「トラッシュから場に出す」→「場のシグニをダウン」誤訳。G171と同型）（2026-06-24）

G176（WX18-084 惨之遊 †オオウチ†／WX18-087 似之遊 †ヤマハリ†）の【自】《ターン1回》「このシグニが対戦相手のライフをクラッシュしたとき、あなたの**トラッシュから**レベルN以下の＜遊具＞のシグニ1枚を対象とし、**それをダウン状態で場に出す**」が、[[G171]]と同じく `DOWN{target:self 遊具シグニ}`＝**場のシグニをダウンするだけ**に誤訳されていた（ユーザー指摘「少し違い」）。

- **修正**: アクションを `ADD_TO_FIELD{owner:self, asDown:true, source:TRASH_CARD self count1 filter(シグニ/level≤N/＜遊具＞)}` に置換（G171と同型）。トリガー（`ON_OPP_LIFE_CRASHED`／`once_per_turn`）は適切なため据え置き。
- **既知の近似（未対応）**: `ON_OPP_LIFE_CRASHED` はクラッシュ側フィールドの全シグニから収集するため「**この**シグニがクラッシュしたとき」の限定はしていない（全 ON_OPP_LIFE_CRASHED カード共通のエンジン近似。個別データ修正の範囲外）。
- **検証**: `verify` 新規警告なし。decompile_sheet2・grouped_all 再生成、2枚とも「トラッシュからレベルN以下の遊具シグニをダウン状態で場に出す」に一致。

---

## 逆翻訳割れ G174 の修正（対象スペルの色・コスト条件の欠落）（2026-06-24）

G174（WX17-Re03 コードアート Ｂ・Ｂ・Ｑ／PR-247 同名）の【出】「あなたのトラッシュから**コストの合計が4以上の青の**スペル1枚を対象とし手札に加える」が、対象フィルタが `{cardType:'スペル'}` のみで、**「青」と「コスト合計4以上」が欠落**＝任意のスペルを回収できる誤りだった（ユーザー指摘）。

- **修正**: `TRANSFER_TO_HAND` の source.filter に `color:'青'` と `costMin:4` を追加。`matchesFilter` は `costMin` を「《色×N》の合計（コイン除く）≥N」で判定する既存実装あり（execUtils）。
- **2ファイル横断**: WX17-Re03 は `effects_WX.json`、PR-247 は `effects_misc.json`（PRカード）。decompile は WX17→sheet2 / PR-247→sheet6 の双方を再生成。
- **検証**: `verify` 新規警告なし。grouped_all 再生成、2枚とも色・コスト条件が逆翻訳に反映。

---

## G172 使用条件 COND_STUB の実装（《ライズアイコン》持ちシグニ条件）（2026-06-24）

G172（WX15-071 折刀の円卓 ケイ／WX15-074 白槍の円卓 ガレス）の【起】《ダウン》：相手のパワーN以下のシグニ1体をバニッシュ「**この能力はあなたの場に《ライズアイコン》を持つシグニがある場合にしか使用できない**」が、使用条件が `COND_STUB`（`evalCondition` で常に true）＝**条件が全く強制されていなかった**（ライズ持ちが場になくても使用可能だった）。アクション・コストは正しい。

- **修正**: `condition` を `COND_STUB` → `HAS_CARD_IN_FIELD{owner:self, filter:{cardType:シグニ, hasIcon:ライズ}}` に置換。ACTIVATED は使用可否判定（BattleScreen 10796）で `evalUseCondition` を通すため、これで実際にゲートされる。`hasIcon:'ライズ'` は `matchesFilter` が EffectText の `【ライズ】` 有無で判定（既存の近似）。
- **検証**: `verify` 新規警告なし（純データ修正）。decompile_sheet2・grouped_all 再生成、`[条件STUB:...]` が解消し「あなたの場に《ライズアイコン》を持つシグニがいる場合」と原文一致。

---

## 逆翻訳割れ G171 の修正（「トラッシュから場に出す」が「場のシグニをダウン」に誤訳）（2026-06-24）

G171（WX15-062 似之遊 †チャッキー†／WX15-063 異血之遊 †ワラニン†）の【出】《無》「あなたの**トラッシュから**レベルN以下の＜遊具＞のシグニ1枚を対象とし、**それをダウン状態で場に出す**」が、`DOWN{target:self 遊具シグニ}`＝**場のシグニをダウンするだけ**に誤訳されていた（ユーザー指摘）。蘇生（トラッシュ→場）が完全に欠落。

- **修正**: アクションを `ADD_TO_FIELD{owner:self, asDown:true, source:TRASH_CARD self count1 filter(シグニ/level≤N/＜遊具＞)}` に置換（参照 WX03-011 と同型＋`asDown`）。エンジン `execAddToField` は source からの選択→空きゾーン配置（複数空きは SELECT_SIGNI_ZONE）まで対応済みで、`asDown` で signi_down を立てる処理も既存。
- **逆翻訳器**: ADD_TO_FIELD(source あり) の描画に `asDown→「ダウン状態で」` を追加（decompileEffects.ts）。
- **検証**: `lint`・`verify` 新規警告なし。decompile_sheet2・grouped_all 再生成、2枚とも原文一致（トラッシュからレベルN以下の遊具シグニをダウン状態で場に出す）。

---

## 逆翻訳割れ G170 の修正（条件欠落＋「黒」フィルタの誤付与）（2026-06-24）

G170（WX14-074 コードアンチ タユソウ／WX14-078 コードアンチ ジョモドキ）の【自】「**対戦相手のターンの間**、このシグニがバニッシュされたとき、対戦相手のシグニ1体を対象とし、**あなたのセンタールリグが黒の場合**、ターン終了時まで、それのパワーを－3000/－2000する」が、3点壊れていた（ユーザー指摘）。

- **①ターゲットの「黒」誤付与**: 原文の「黒」は**自分のセンタールリグの条件**だが、パーサーが**対象シグニの色フィルタ**（`target.filter.color:'黒'`）に誤付与＝「相手の黒のシグニ」しか対象にできない誤り。→ フィルタを `{cardType:'シグニ'}` のみに是正（対象は対戦相手のシグニ1体）。
- **②センタールリグ黒条件の欠落** / **③「対戦相手のターンの間」の欠落**: ともに未実装。→ `activeCondition: AND(TURN_OWNER opponent, LRIG_COLOR self 黒)` を追加。`triggerScope:'self'` も明示。
- **配置先の注意**: 自身バニッシュ経路（`collectBanishTriggers` の section 1）は `eff.condition` を評価せず **`activeCondition` のみ**を `checkActiveCondition`（実ターン判定可）でチェックする。`evalCondition` の `IS_OPPONENT_TURN` は常に true を返すプレースホルダのため、ターン制限は必ず `activeCondition`（TURN_OWNER）で表現する。
- **検証**: `verify` 新規警告なし（コード変更なしの純データ修正）。decompile_sheet2・grouped_all 再生成、2枚とも原文一致（対戦相手のターン＋ルリグ黒条件＋対象=相手シグニ1体）。

---

## 逆翻訳割れ G169 の修正（基本パワー設定の欠落＋対象スコープ誤り）（2026-06-24）

G169（WX14-060 幻水 ナヨハギ／WX14-061 幻水 ツノダシ）の【常】「対戦相手のターンの間、手札6枚以上のかぎり、**このシグニの基本パワーは15000/12000になり**、対戦相手の効果を受けない」が、`GRANT_PROTECTION{target:self,count:'ALL'}` のみで実装され、**①基本パワー設定が完全欠落**、**②対象が「すべてのシグニ」**（原文は「このシグニ」）になっていた（ユーザー指摘）。

- **②は実挙動バグ**: 効果耐性の一般パス（`collectEffectImmuneSigni`）は target self なら sourceNum のみ保護するが、**バニッシュ保護（`collectBanishEffectProtectedSigni`）は `count:'ALL'` を honor して全シグニを保護**していた（＝対戦相手のバニッシュから自分の全シグニが保護される誤り）。
- **修正**: 各カードを2つの CONTINUOUS 効果に再構成（同一 activeCondition: 相手ターン∧手札≥6）。E1=`POWER_SET{self,count:1}`（15000/12000、参照 WX01-054 と同型＝engine上「このシグニ」）、E2=`GRANT_PROTECTION{self,count:1, from:['any']}`。`count:1` で全保護コレクタが「このシグニのみ」に解決。
- **GRANT_PROTECTION に filter は付けない**: バウンス保護パスは `count:1` でも `target.filter` があると全シグニを走査するため。代わりに逆翻訳器（decompileEffects.ts）を POWER_SET と同様に特例対応し、CONTINUOUS・self・count≠ALL・filter/subjectFilterなし→「このシグニ」と描画。
- **検証**: `typecheck`・`lint`・`verify`（新規警告なし）。decompile_sheet2・grouped_all 再生成、2枚とも原文（基本パワー設定＋このシグニ限定の効果耐性）に一致。

---

## G168「好きな枚数を上に・残りを下に」分割UIの新設（split_top_bottom）（2026-06-24）

G168（WX13-081 弐ノ遊 カザグルマ／WX13-082 壱ノ遊 カミカブト）の【自】「デッキ上N枚を見て、**好きな枚数を好きな順番でデッキの一番上に置き、残りを好きな順番でデッキの一番下に置く**」が、`LOOK_AND_REORDER{destPosition:'bottom'}`＝**見た札を全部デッキ下に送る**実装になっており、原文の「一部を上に残す」分割ができていなかった（ユーザー指摘：新UIが必要）。

- **新 destPosition**: `LOOK_AND_REORDER` に `'split_top_bottom'` を追加（`types/effects.ts` の destination.position、`types/index.ts` の PendingInteractionDef）。
- **エンジン**: `resumeLookAndReorder` に `bottomCards` 引数を追加。`split_top_bottom` 時は keep を「下に送る集合」で2分割し `deck: [...top, ...残りデッキ, ...bottom]` に配置（各群は並べ替え順を維持）。
- **新UI**: LOOK_AND_REORDER モーダルに分割モードを追加。各カードに「上/下」トグル（既定=上）、↑↓で群内順序を調整、上群の枚数を表示。状態 `lookReorderBottom` を追加・リセット。CPUは全カードを上（原順）に置く既定動作。
- **逆翻訳器**: `decompileEffects.ts` で split_top_bottom を原文どおり描画。
- **データ**: WX13-081/082 の destPosition を `bottom`→`split_top_bottom`、reorder:true。
- **検証**: `typecheck`・`lint`（新規エラーなし）・`verify`（新規警告なし）。decompile_sheet2・grouped_all 再生成、2枚とも原文一致。

> ⚠️ **注意**: effects_*.json は**手動管理**で `scripts/buildEffectsJson.ts`（`npm run build:effects`）のパーサー出力と大きく乖離している。`build:effects` を実行すると手動修正（本件・G164等）が全消去される。**実行しないこと**。データ修正は JSON 直接編集で行う。

---

## 逆翻訳割れ G164 の修正（「スペルがある場合」条件の欠落）（2026-06-24）

G164（WX12-054 コードアート †Ｊ・Ｖ†／WX12-055 コードアート †Ｓ・Ｃ†）の【出】「デッキの上からN枚トラッシュ→**この方法でトラッシュに置いたカードの中にスペルがある場合**、1枚引く」が、ドロー無条件（`SEQUENCE[TRASH, DRAW]`）で実装されており条件が欠落していた（ユーザー指摘）。

- **新エンジン要素**: 条件型 `LAST_PROCESSED_HAS_TYPE{cardType}` を追加（`execUtils` 評価）。`TRASH{target:DECK_CARD}` は milled カードを `lastProcessedCards` に残すため、後続 `CONDITIONAL` で「直前にトラッシュしたカードに指定Typeが含まれるか」を判定できる。逆翻訳器（decompileEffects.ts）にも描画追加。
- **データ**: 両カードの DRAW ステップを `CONDITIONAL{condition: LAST_PROCESSED_HAS_TYPE(スペル), then: DRAW}` でラップ（完全動作）。
- **検証**: `typecheck`・`lint` 通過、`verify` 新規警告なし。decompile_sheet2・grouped_all 再生成、2枚とも原文の条件を反映。

---

## 逆翻訳割れ G156/G157/G158/G159 の修正（条件欠落・誤実装・技名扱い）（2026-06-24）

SP/ボカロコラボのレベル3ルリグ系4グループ（各2枚・計8枚）を `manualEffects.ts` で durable 実装。**イノセンス／プライマルはキーワード機構ではなく単なる技名**（ユーザー指摘）＝通常の【起】能力として効果本体のみ実装。

- **新エンジン要素**: 条件型 `DECK_TOP_SHARES_COLOR_WITH_LRIG`（G157「公開カードと共通色のルリグがいる場合」）、`FIELD_SIGNI_ALL_DISTINCT_CLASS`（G158「場の全シグニが互いに異クラス」＝CardClassの／区切りトークン積集合が空）、`LAST_PROCESSED_COUNT_GTE`（「この方法でN枚以上手札に加えた場合」）を `execUtils` 評価に追加。フィルタ `crossState`（クロス状態シグニ。`field.cross_state[zone]` 判定）を `fieldCandidates` に追加。逆翻訳器（decompileEffects.ts）にも各描画を追加。
- **G156**（WX25-CD1-06/WX25-CP1-030）: 単体NEGATE_ATTACK→2択CHOOSEに。①相手ルリグ/シグニ1体のアタック無効（`CENTER_LRIG_OR_SIGNI`）②エナ＜ブルアカ＞2枚トラッシュ→2体まで無効。②のクラス指定エナトラッシュは `OPTIONAL_TRASH_ENERGY_CLASS` STUB（近似）。
- **G157**（SPDi01-121/WX25-P1-115）: 無条件エナチャージ→`DECK_TOP_SHARES_COLOR_WITH_LRIG` 条件付きに（完全動作）。
- **G158**（SPDi44-04/WX25-P1-026）: E1 無条件→`FIELD_SIGNI_ALL_DISTINCT_CLASS` 条件付きエナチャージ2（完全動作）。E2(プライマル) エナのシグニを手札→5枚以上で `GRANT_LRIG_ABILITY`（対戦相手効果のダメージ無効＝`PREVENT_DAMAGE_FROM_OPP_EFFECTS`）。選択集合の異クラス制約は未強制（近似）。
- **G159**（SPDi44-08/WX25-P1-018）: E1 timing誤り（ON_PLAY=自身）→`ON_PLAY` any_ally＋triggerFilter＜ウェポン＞＋DURING_PHASE main、トラッシュ対象に `hasIcon:クロス` 追加。E2(イノセンス) は**無関係なREMOVE_ABILITIES誤パースを破棄**し、クロス状態シグニの基本パワー15000化（`POWER_SET`+`crossState`）＋ルリグ身代わり【常】付与に作り直し。身代わり置換の実行とパワーの「次相手ターン終了時まで」持続は近似。
- **検証**: `typecheck` 通過、`verify` 新規警告なし。decompile_sheet(9/10)・grouped_all 再生成、8枚すべて原文と一致。★割れグループ0維持。

---

## エナ送り（エナゾーンに置く）を SEND_TO_ENERGY 新設で正しく表現（G155他・全42枚）（2026-06-24）

「対戦相手のシグニをエナゾーンに置く（エナ送り）」を**バニッシュと別アクション**として新設。バニッシュは「バニッシュされたとき」を誘発するがエナ送りは誘発しない＝厳密に別物（最終的な行き先は同じエナでも別イベント）。従来パーサーはエナ送りを `BANISH` 代用、または**壊れた `ENERGY_CHARGE`（フィールドSIGNI対象＝実行時に「undefined枚エナチャージ」）**に誤マップしていた。

- **発見**: G155（WX24-D4-07／WX25-CD1-10）の逆翻訳が「デッキからundefined枚エナチャージ／バニッシュ」と原文（エナゾーンに置く）から乖離。根因は `parseSentencePart1.ts` がエナ送り文を `ENERGY_CHARGE{target:SIGNI,owner:opponent}` に誤変換していたこと（part3のエナ送り規則に届く前に先取り）。
- **新アクション**: `SEND_TO_ENERGY`（types/effects.ts）。executor は `execSendToEnergy`（execBounce同型・場→対象オーナーのエナ・誘発なし）＋ `applyDirectAction` の単体適用ケース。decompiler（decompileEffects.ts）も対応。
- **パーサー根治**: part1（パワー以上/レベル/色/相手選択）・part3（対象とし…エナゾーン／パワー以下）・part4（すべて／対象の〜）の各「エナゾーンに置く」分岐を `BANISH`/壊れ`ENERGY_CHARGE` から `SEND_TO_ENERGY` へ。`maxPower`（エンジン未対応の無効フィールド）も `powerRange.max` に是正。
- **データ移行**: `scripts/migrateSendToEnergy.ts` で対象48枚を再パースし、現JSONと「BANISH/SEND_TO_ENERGY/壊れENERGY_CHARGE を同一視した正規化比較」で一致した41枚＋手動1枚（WX24-P3-083）＝**42枚**を SEND_TO_ENERGY へ移行。
- **残6枚**（WXEX2-20／WXK09-031／WXK10-011／WXDi-P01-005／WXDi-P01-040／WX25-P2-041）はエナ送りが能力付与（GRANT_QUOTED_AUTO_ABILITY）・選択肢①・使用条件・別誤パース等のSTUB/未対応に埋もれており、エナ送り区別とは独立の既存課題のため未着手（要個別実装）。
- **検証**: `npm run typecheck` 通過、`npm run verify` 新規警告なし。decompile_sheet（2/3/4/5/6/7/9/10）・grouped_all 再生成。★割れグループは 0 を維持。

---

## 逆翻訳割れグループ G001/G002/G003 の修正（条件・対象欠落）（2026-06-23）

`grouped_all.txt` の「★逆翻訳が割れているグループ（要確認）」3件（計6枚）を修正。原文は同型なのに、AUTOパースで条件・対象が欠落し「あなたのシグニ1体を無条件強化」へ退化していた（同型の WXK02-081/090/099 が正データ）。修正後、★割れグループは **3→0**。

- **G001**（このターン手札1枚以上捨てた場合このシグニ＋N）: WDK06-R13/R15 に `activeCondition:{TURN_HAND_DISCARD_GTE,value:1}` と `target.filter.thisCardOnly` を追加。
- **G002**（カードを引いたときターン終了時までこのシグニ＋N）: WDK05-R13/R15 は `timing` が誤って `ON_TURN_END`（正:`ON_DRAW`）＋`thisCardOnly` 欠落。両方修正（usageLimit twice/once は据置）。
- **G003**（トラッシュに＜武勇＞シグニN枚以上あるかぎりこのシグニ＋N）: WDK06-C13(5枚以上)/C15(3枚以上) に `activeCondition:{TRASH_HAS_CARD,武勇,minCount}` と `thisCardOnly` を追加。
- エンジンは `TURN_HAND_DISCARD_GTE`/`ON_DRAW`/`TRASH_HAS_CARD`/`thisCardOnly` を既にサポート済み＝データ修正のみで実装も揃う。`docs/decompile_sheet5.txt`・`docs/grouped_all.txt` 再生成済み。

---

## COPY_LRIG_NAME_ABILITY の【常】能力コピー実装（2026-06-23）

P4エクシード等「ルリグトラッシュのレベル3の＜X＞と同じカード名としても扱い、そのルリグの【常】能力を得る」（該当=WX24-P4-021＜ひとえ＞）を実装。従来は名前エイリアス＋【自】コピー（`collectCopiedLrigAutoEffects`）のみで、【常】コピーは未対応だった。

- `collectCopiedLrigContinuousEffects`（effectEngine）新設：センタールリグが「【常】能力を得る」COPY_LRIG_NAME_ABILITY を持つとき、ルリグトラッシュの該当ルリグの CONTINUOUS 効果を集めて返す（effectId に `-COPYC-`、元カード番号を `copiedFromCardNum` に保持）。
- `BattleScreen.effectsMap` メモに `hasCopyLrigCont` 判定＋注入を追加。コピーした CONTINUOUS をセンタールリグ(instanceId)の効果に足すことで各 CONTINUOUS 収集関数が自動的に拾う。
- `CardEffect.copiedFromCardNum` を追加。テキスト駆動 STUB がコピー時に元カードの EffectText を解決できるようにする。
- `collectGuardAlternativeCost` をセンタールリグも走査＋`copiedFromCardNum` のテキスト参照に拡張（＜ひとえ＞の【常】＝植物ガード代替コストが P4-021 で実際に機能）。
- **残注意**: コピー先の【常】が text 駆動 STUB の場合は当該 STUB 自体の実装に依存（連鎖）。data 駆動（POWER_MODIFY 等）は自動で機能。

---

## リコレクト（《リコレクトアイコン》）の系統的実装（**完了**・全88枚）（2026-06-23）

効果文に《リコレクトアイコン》［N枚以上］を含む全88枚（Sheet9/10：WX24/25/26・SPDi）を系統的に実装。リコレクトは「ルリグトラッシュのアーツ枚数 ≥ N」で判定し、**使用中のアーツ自身は数えない**（エンジンは `BattleScreen.tsx:6354` で効果解決前に lrig_trash へ先行追加するため、判定時に `sourceCardNum` を除外＝`excludeSource`）。

- **発見バグ**: パーサーが「追加で／代わりに／選択数変更」の意味差を区別せず、(1) 追加で型はゲート欠落で追加効果が**無条件発動**、(2) 代わりに型は `TRASH_COUNT`（通常トラッシュ全カード）で**誤判定**または未実装、(3) `RECOLLECT_GATE` が**使用中アーツ自身を+1して数える** off-by-one。
- **機構**: 追加で/アイコン直後 → `RECOLLECT_GATE`。代わりに → `CONDITIONAL` + `{type:'LRIG_TRASH_COUNT', cardType:'アーツ', excludeSource:true}`（常時効果は `evalConditionForContinuous` に LRIG_TRASH_COUNT 追加で対応）。選択数変更（「N個からMつ選ぶ.代わりにKつ選ぶ」）→ `ChooseAction.recollectArts`（execChoose で枚数≥minArtsなら choose_count/upTo を上書き）。
- **パーサー**: `parseActionText` 最上部で `《リコレクトアイコン》［` 境界を分割（早期returnに飲み込まれる前に処理）。base/bonus がパース不能なら分割を諦め旧挙動へフォールバック＝UNKNOWN退化ゼロ。
- **適用**: effects_*.json は正データのため全再生成せず、対象88枚（「パーサー出力==現JSON」を確認済み）のみ再適用。手書き2枚（WX24-D3-25/SPDi37-06）は manualEffects.ts の条件を直接修正。
- **残**: WX25-CP1-002/004・WX26-CP1-003 は CHOOSE の1選択肢のみ複雑で UNKNOWN（パーサー既知の制約）。P4エクシード等の base 効果が STUB のものは recollect 部分のみゲート化（base は別課題）。
- **コミット**: c9251596（GATE off-by-one）／5018ddab（追加で/代わりに 63枚＋基盤）／04f6fac2（選択数変更9枚＋手書き2枚）。

---

## G144/G145 any_ally 効果配置トリガーの配線（**完了**・実機検証推奨）（2026-06-23）

G144（`WX10-074/078` `placedDown`）／G145（`WX10-080/083` `byEffect`＋`excludeSelf`）の「あなたの（他の）シグニが〈ダウン状態で／効果によって〉場に出たとき」系 any_ally ON_PLAY を、**効果配置経路で発火させる配線**を追加（従来は手札召喚経路のみで、効果でシグニが場に出ても他シグニが反応しなかった）。

- **新ヘルパー `detectPlacedSigni(before, after)`**: 効果で新たに場に出た最前面シグニ（before のフィールドに無い instanceId）を検出。
- **配線箇所**: メインスタック解決（`executeEffect` の `result.done`）／スペル解決／REVEAL resume の各完了時に、出たシグニへ `collectFieldTriggers('ON_PLAY', placedNum, …, { placedByEffect:true, placeSourceIsSigni })` を呼ぶ（自身は line 5313 で除外＝他シグニのみ）。
- **`collectFieldTriggers` に `opts.placedByEffect / placeSourceIsSigni` を追加**。`byEffectTriggerOk(eff)` で手札召喚（`placedByEffect` 無し）では byEffect/bySigniEffect を従来どおり非発火、効果配置では byEffect 発火・bySigniEffect はソースがシグニのときのみ発火。`placedDown`（G144）は配置直後の `field.signi_down[zone]` で判定。`excludeSelf`（G145）は自己除外で担保。
- **回帰注意:** 非 byEffect の any_ally ON_PLAY（例 WX11-054）も**効果配置時に発火するようになった**（ルール上正しい）。**実機検証**（PvP/CPU・ヘッドレス不可）と**残（副次）**は [[TODO.md]] 参照（CPU 効果配置経路・self placedDown の効果配置自己トリガー）。

---

## G145 「あなたの他のシグニが効果によって場に出たとき」（部分実装・残課題は TODO 可視化）（2026-06-23）

`WX10-080`/`WX10-083` の原文「【自】：あなたの他のシグニ1体が効果によって場に出たとき、このシグニをアップする」が `ON_PLAY`＋`UP{owner:self,count:1}`（「このシグニが場に出たとき：任意のシグニをアップ」）と誤り。

- **データ:** `ON_PLAY`＋`triggerScope:any_ally`＋`triggerFilter:{excludeSelf:true}`（「他の」）＋`triggerCondition:{byEffect:true}`＋`action:UP{target.filter.thisCardOnly}`。逆翻訳「あなたの他のシグニが効果によって場に出たとき：このシグニをアップする」（原文一致）。
- **engine（検証済み）:** `execUp` の `thisCardOnly` を「候補1枚でも選択 pending」→「選択不要で即アップ」に修正（既存の thisCardOnly UP 全体が選択UI削減の改善。検証 PASS）。
- **⚠️ 残課題（TODO 可視化／G144 と同根）:** `any_ally`＋`byEffect`（他シグニが効果で場に出た→このシグニが反応）の発火は、効果配置経路で `collectFieldTriggers(any_ally)` が呼ばれず未配線。**※ G079（`WX15-108`等＝`triggerScope:self`＋`bySigniEffect`「このシグニが効果で出たとき」）は自己 ON_PLAY 収集に判定が配線済み（BattleScreen line 4801/5181）で動くが、G145 は self ではなく any_ally のため別経路で未配線。** [[decompile-engine-parity]] の原則で可視化。

## G144 「ダウン状態で場に出たとき」トリガー（部分実装・残課題は TODO 可視化）（2026-06-23）

`WX10-074`/`WX10-078` の原文「【自】：あなたのシグニ1体がダウン状態で場に出たとき、そのシグニをアップする」が、JSON で `ON_PLAY`＋`UP{owner:self,count:1}`（＝「このシグニが場に出たとき：あなたのシグニ1体をアップ」）と**トリガーも対象も誤り**だった。

- **データ:** `timing:ON_PLAY`＋`triggerScope:any_ally`＋`triggerCondition:{placedDown:true}`＋`action:UP{targetsTriggerSource:true}` に。逆翻訳「あなたのシグニがダウン状態で場に出たとき：それ（トリガー元シグニ）をアップする」（原文一致）。
- **型:** `UpAction.targetsTriggerSource`、`triggerCondition.placedDown` を追加。
- **decompile:** `UP` に `targetsTriggerSource`→「それ（トリガー元シグニ）」、`ON_PLAY`＋`placedDown`→「ダウン状態で場に出たとき」を追加。
- **engine（検証済み）:** `execUp` に `targetsTriggerSource`（トリガー元シグニ＝`triggeringCardNum`を無選択アップ）。検証スクリプトでダウン中のトリガー元がアップ／不在時 no-op を確認（PASS）。BattleScreen の**手札召喚経路**に `placedDown` 判定（`queueCardEffects` self・`collectFieldTriggers` any_ally）。
- **⚠️ 残課題（TODO 可視化）:** ダウン配置は効果でのみ起こるが、BattleScreen の「効果配置時の ON_PLAY トリガー収集」は経路ごとにハードコードで分散し `placedDown`／`any_ally` を呼んでいない（既存の未配線課題と同根）。**逆翻訳は健全に見えるが効果ダウン配置時は未発火**。ユーザー判断で根幹改修は見送り、`docs/TODO.md` に明記して乖離を可視化（[[decompile-engine-parity]] の原則）。

## G141/G142 の engine 実装（DECK_CARD 場出し／一時的な基本レベル変更）（2026-06-23）

下の G135/G141/G142/G143 修正で「★engine 未対応」とした2点を実装。検証スクリプトで動作確認（PASS）。

- **G141 — `ADD_TO_FIELD` で `source:DECK_CARD` 対応（`execAddToField`）:** デッキ上から `count` 枚を `matchesFilter` で絞り、一致したものを候補に。一致が無ければ何も起きない。配置は既存 `applyDirectAction('ADD_TO_FIELD')`（line 4061〜）がカードの所在＝デッキを問わず除去・配置するため、候補生成のみ追加すれば成立。`optional:true` は selectOrInteract に渡し「出す／出さない」を選択可能（G129 で直した経路）。検証: デッキトップが ＜宇宙＞Lv3→SELECT_TARGET（候補1枚）、Lv5（レベル超過）/凶蟲（class不一致）→候補なしで何もしない、を確認。※ `filter.story` は実装上 `card.CardClass` を部分一致照合（既存仕様）。宇宙/凶蟲シグニの CardClass は「精羅：宇宙」等で `includes('宇宙')` 一致。
- **G142 E2 — `SET_BASE_LEVEL` の `until:'END_OF_TURN'` 対応（`executeAction`）:** 起動効果での一時的レベル変更を、既存の一時レベル上書き機構 `ownerState.attack_phase_level_overrides[sourceCardNum] = value` に書き込む（CHANGE_BASE_LEVEL STUB と同じ仕組み＝同じクリアタイミングに乗る）。`SetBaseLevelAction` に `until?: 'END_OF_TURN'` を追加。CONTINUOUS（until無し）は従来どおり `applyContinuousBaseLevelOverride` 経由。検証: overrides に `{src:4}` が書かれることを確認。
- `tsc --noEmit` 通過。

## G135/G141/G142/G143 逆翻訳の取りこぼし・誤りを修正（2026-06-23）

grouped_all.txt の比較で4グループを修正。**データ・逆翻訳は全て原文準拠に修正済み。一部は engine 未実装のため動作は別途**（下記★）。

- **G135（WX08-049 / WX08-051）:** 原文「【常】：あなたの場に《X》か《X》があるかぎり、基本パワーはNになる」の activeCondition が欠落。E1 に `activeCondition:{HAS_CARD_IN_FIELD, owner:self, filter:{cardNames:[…2枚…]}}` を追加（cardName は全角スペース表記）。逆翻訳「《あなたの場に《羅星　アルシャ》《羅星　ディアデム》のいずれか…がいるかぎり》」。
- **G141（WX10-007 / WX10-021）★:** 原文「デッキの一番上を見る。それがレベル3以下の＜X＞のシグニの場合、それを場に出してもよい」が `LOOK_AND_REORDER → ADD_TO_FIELD(source無し=直前に選んだカード)` で条件も任意性も欠落。`ADD_TO_FIELD` に `source:{DECK_CARD, fromTop, filter:{cardType:シグニ, level:{max:3}, story:X}}` ＋ `optional:true` を付与。decompile の ADD_TO_FIELD(source) に `（してもよい）` を追加。**→ engine 実装済み（上記エントリ参照）。**
- **G142（WX10-056 / WX10-058）:** E1 原文「あなたの場に**レゾナ**があるかぎり」が「シグニがいるかぎり」に。activeCondition.filter に `isResona:true` を追加（cardType:レゾナ は残置）、`condJa` の HAS_CARD_IN_FIELD で `isResona` 時に名詞を「レゾナ」に。E2★ 原文「ターン終了時まで、このシグニの基本レベルはNになる」が `BLOCK_ACTION{actionId:"SET_LEVEL_N"}` という誤parseに → `SET_BASE_LEVEL{value:N, until:"END_OF_TURN"}` に置換。decompile の SET_BASE_LEVEL に until→「ターン終了時まで、」を追加。**→ engine 実装済み（上記エントリ参照）。**
- **G143（WX10-069 / WX10-072）:** 原文「**対戦相手は**ライフクロス1枚をトラッシュに置く…**対戦相手は**デッキの一番上をライフクロスに加える」が owner:self になっていた。`LIFE_CRASH` と `ADD_TO_LIFE` の owner を self→opponent に。逆翻訳「対戦相手のライフクロスを…/対戦相手のデッキの一番上から…」。
- decompile 3箇所修正（condJa isResona / SET_BASE_LEVEL until / ADD_TO_FIELD(source) optional）。`tsc --noEmit` 通過。生成物 `grouped_all.txt`・`decompile_sheet1.txt` の該当12行を更新（E1/E2連結・LIFE_BURST記述は保持）。

## G134 「あなたのレゾナ」が「自分または対戦相手のシグニ1体」になっていたのを修正（2026-06-23）

WX07-007 / WX08-019 の原文「【常】：あなたのレゾナのパワーを＋2000する」が、JSON では `POWER_MODIFY target:{type:SIGNI, owner:any, count:1}` となっており、owner も対象範囲もレゾナ限定も全て誤っていた（逆翻訳「自分または対戦相手のシグニ1体のパワーを＋2000する」）。

- **修正（データ）:** target を `{type:SIGNI, owner:self, count:"ALL", filter:{isResona:true}}` に（`effects_WX.json`）。G103（WD01-001「あなたのすべてのシグニのパワーを＋N」）と同じ owner:self / count:ALL 構造。
- **修正（逆翻訳）:** `decompileEffects.ts` の `targetJa` で `filter.isResona` のとき名詞を「シグニ」→「レゾナ」に切り替え。
- 逆翻訳「あなたのすべてのレゾナのパワーを＋2000する」に（「すべての」は count:ALL の既存表記。G103 と同様）。`grouped_all.txt`・`decompile_sheet1.txt` 更新。

## G129 自己蘇生 ADD_TO_FIELD が「してもよい」＝任意発動になっていなかったのを修正（2026-06-23・追補）

G129（WX02-073 / WX10-092）の「このカードをトラッシュから場に出して**もよい**」が、データ・逆翻訳・engine の3層で任意化されていなかった。

- **修正（データ）:** 両 E1 の `action` に `optional:true` を追加（`effects_WX.json`）。
- **修正（逆翻訳）:** `decompileEffects.ts` の ADD_TO_FIELD 自己蘇生分岐（thisCardOnly source）に `${a.optional ? '（してもよい）' : ''}` を追加。
- **修正（engine）:** `execAddToField` 末尾の `selectOrInteract` が任意性を `src.upToCount` だけで判定し `a.optional` を無視していた → `(a.optional ?? false) || (src.upToCount ?? false)` に（他のターゲット解決 line 267/301 と同形）。これで「場に出す／出さない」を選択可能に。`tsc --noEmit` 通過。
- 逆翻訳「このシグニをトラッシュから場に出す（してもよい）」。`grouped_all.txt`・`decompile_sheet1.txt` 更新。
- ※ 同型の自己蘇生 ADD_TO_FIELD は他に35件あり全て optional 無し。強制蘇生を誤って任意化しないよう、原文が「〜してもよい」のもののみ個別対応する方針（今回は G129 の2枚）。

## G129 ON_TRASH の発生源「デッキから」が欠落していたのを修正（2026-06-23）

WX02-073 / WX10-092（コードアンチ）の原文「このカードが**デッキから**トラッシュに置かれたとき、…」に対し、逆翻訳が「このカードがトラッシュに置かれたとき」と発生源を欠いていた。`decompileEffects.ts` は `ON_TRASH` の `triggerCondition.fromZones` を見て「〜からトラッシュに置かれたとき」を出す仕組みを既に持っており（場からのバニッシュ等と区別）、データ側に `fromZones` が無かっただけ。

- **修正（データ）:** WX02-073-E1 / WX10-092-E1 に `triggerCondition:{fromZones:["deck"]}` を追加（`effects_WX.json`）。逆翻訳が「このカードがデッキからトラッシュに置かれたとき」に。
- 生成物 `grouped_all.txt`・`decompile_sheet1.txt` の該当行を更新（同一行の LIFE_BURST 記述は保持）。

## G100/G101/G102 逆翻訳の取りこぼしを修正（2026-06-23）

grouped_all.txt の比較で3グループに欠落を発見。

- **G100（WXDi-P02-025 / P07-022 / CP02-032）:** 原文「対戦相手の**レベル1の**シグニ1体をデッキの一番下に置く」の「レベル1の」が逆翻訳で抜けていた。**データ（filter.level:1）もコード（filterJa の `typeof level==='number'`→「レベルNの」）も既に正しく**、`grouped_all.txt` が古い生成物だっただけ。該当行を最新 decompile で更新（データ修正不要）。
- **G101（WXDi-P10-029 / CP01-020 / CP02-046）:** 原文「あなたのトラッシュから**《ガードアイコン》を持たない、共通するクラスを持つ**シグニ2枚を…手札に加える」のフィルタ2条件が `TRANSFER_TO_HAND` の source.filter から欠落。filter に `noGuard:true` / `commonClass:true` を追加し、`decompileEffects.ts` の `filterJa` に対応語彙（「《ガードアイコン》を持たない」「共通するクラスを持つ」）を新規追加。
- **G102（WX24-P1-020 宝石 / WX25-P1-037 ウェポン / WX25-P3-040 天使）:** 原文「デッキの上から5枚見る。その中から＜X＞のシグニを2枚まで公開し手札に加え、残りを…デッキの一番下に置く」が、JSON では `LOOK_AND_REORDER(5) → TRANSFER_TO_DECK(自軍シグニ1体をデッキ下)` という別物になっていて、**手札に加える選別が丸ごと欠落**していた。該当2ステップを `REVEAL_AND_PICK{revealCount:5, filter:story, pickCount:2, pickTo:hand, remainder:{deck,bottom}}` 1つに置換（WX02-018 と同形）。BANISH ステップは維持。＜X＞は `story`（宝石／ウェポン／天使）。
- 生成物 `grouped_all.txt`・`decompile_sheet7/8/9.txt` の該当9行を更新。

## G093 スペルのモード選択（2つから1つ選ぶ）が丸ごと欠落していたのを修正（2026-06-23）

WXK07-069「大成の爆火」/ WDK01-020「光明の流星」/ WDK08-L20「血晶の斧撃」（いずれもスペル・コスト《赤》×０）の効果が、原文「以下の２つから１つを選ぶ。①対象のあなたの＜X＞のシグニ１体を場からトラッシュに置く。そうした場合、対象の対戦相手のパワー12000以下のシグニ１体をバニッシュする。②【エナチャージ１】」に対し、JSON では `action` が **BANISH 単体**になっていて、モード選択も①のトラッシュコストも②エナチャージも全て失われていた。

- **修正（データ）:** `action` を `CHOOSE`（choose_count:1 / from_count:2）に置換。選択肢①＝`SEQUENCE[TRASH(自軍＜story＞シグニ1体) → CONDITIONAL{IS_MY_TURN}（「そうした場合」マーカー）→ BANISH(対戦相手パワー12000以下1体)]`、選択肢②＝`ENERGY_CHARGE_FROM_DECK(1)`。＜X＞は `story`（原子／乗機／紅蓮）。WX02-024 の CHOOSE（BANISH or エナチャージ）と同形。
- effectType/timing/cost（ACTIVATED・MAIN・energy赤0）は CSV の《赤》×０どおりで正しいため維持。
- 逆翻訳が「次から1つ選ぶ【…をトラッシュに置く。そうした場合、…をバニッシュする / …エナゾーンに置く】」と原文の2択を表現するようになった。`grouped_all.txt`・`decompile_sheet3/4/5.txt` の該当行も更新。

## G091「このシグニを手札に戻す」BOUNCE が任意ターゲット選択になっていたのを修正（2026-06-23）

逆翻訳（grouped_all.txt G091）で原文「**このシグニを**場から手札に戻してもよい」が「**あなたのシグニ1体を**手札に戻す（してもよい）」となっていた。BOUNCE の target が `{type:SIGNI, owner:self, count:1, filter:{cardType:シグニ}}` で、自分自身固定ではなく自軍シグニから1体選ぶ形になっていた。

- **修正（データ）:** WXK06-034 / WXK06-036 / WXK10-061 の BOUNCE target filter に `thisCardOnly:true` を追加（`effects_WXK.json` 直パッチ、3効果）。`effectExecutor.ts` は `target.filter.thisCardOnly` を解釈済み（マルチエナ等で確立済みのフラグ）。
- **修正（逆翻訳）:** `decompileEffects.ts` の `targetJa` に `thisCardOnly` の早期分岐を追加し「あなたの…シグニ1体」ではなく「このシグニ」を返すよう統一（従来は filter の「このシグニ自身」と type/count 由来の「シグニ1体」が重複し「このシグニ自身シグニ1体」になっていた）。マルチエナ等の既存 thisCardOnly カードも「このシグニは…」と自然化。
- 生成物 `decompile_sheet3/4.txt`・`grouped_all.txt` の該当行も再生成相当で更新。逆翻訳が原文どおり「このシグニを手札に戻す（してもよい）」に一致。

## G077【側面アタック】を engine 実装（2026-06-23）

【側面アタック】（G077=WX15-094/095/096「あなたの場に＜英知＞のシグニが3体あるかぎり、このシグニは正面の1つ隣の対戦相手のシグニゾーンにもアタックできる」）はキーワード付与されるだけで **engine 実装が無く完全に no-op** だった。

- **仕様（ユーザー確認）:** 追加バトルではなく、アタック先を**正面か側面のどちらか選ぶ**（同時攻撃ではない）。側面（正面の1つ隣のシグニゾーン）を攻撃した場合、そこにシグニがいればバトル、いなければ何も起こらない（バトルもライフダメージもなし）。シグニゾーンへの攻撃なので**対戦相手にライフダメージは与えない**。
- **実装:** `performSigniAttack` / `resolvePendingSigniBattleFor` に攻撃先ゾーン override `targetOpZone` を追加（`pending_signi_battle` に保持して phase1→phase2 を跨ぐ）。
  - 正面固定だった `opZoneIndex`(phase1/phase2) と `opFrontZoneIdx` を `targetOpZone ?? (2 - zoneIndex)` に。
  - 側面アタックは REDIRECT_ATTACK_TO_SELF_ZONE / ON_OPP_SIGNI_ATTACK_DIRECT（正面直接アタック系）をスキップ。
  - `effectivelyEmpty` を側面時は `!opTopCardNum` のみ（アサシン等の直接アタック化を無視）。占有→バトル、空→新設の `else if (isSideAttack)` で no-op（ライフダメージ分岐に入らない）。
- **UI:** 側面アタック保持シグニ（`dynamicKeywords`/`keyword_grants` で判定）に、正面の1つ隣の**占有**相手ゾーンへの「側面アタック→<名>」アクションを追加（空ゾーンは何も起きないため非提示）。通常の正面アタックは従来どおり並存。
- 付与条件（英知3体）は `collectContinuousGrantedKeywords`/`contGrantedKeywords` が活性条件込みで評価済み。
- 検証: `npm run typecheck` 通過。

## G075「対戦相手の場にシグニがN体あるかぎり」activeCondition が欠落していたのを修正（2026-06-23）

逆翻訳（grouped_all.txt G075）で「このシグニの基本パワーを12000にする」と無条件 POWER_SET になっていた（原文は「**対戦相手の場にシグニが3体あるかぎり**、…基本パワーは12000になる」）。`parseActiveCondition` に「対戦相手の場に…」系のパターンが一つも無く（全て「あなたの場に…」のみ）、相手フィールド条件が黙って捨てられていた。

- **修正（パーサー）:** `parseActiveCondition` に「対戦相手の場にシグニが(合計)?N体あるかぎり、」→ `HAS_CARD_IN_FIELD{owner:opponent, filter:cardType:シグニ, minCount:N}` を追加。
- **適用範囲（全カード差分）:** 4効果が `activeCondition:undefined → 条件` の純追加・巻き添えゼロ。WX15-077/078/079（基本パワーをNにする POWER_SET）＋ WX09-Re16（このシグニは【ランサー】を得る）。JSON 直パッチ（effects_WX）。
- **engine 検証:** calcFieldPowers で WX15-077（印刷8000）が相手シグニ0/2体→8000・3体→12000 と条件どおり。POWER_SET CONTINUOUS は checkActiveCondition を通すため activeCondition を正しく尊重。
- 検証: `npm run typecheck` 通過。decompile「《対戦相手の場にシグニが3体以上いるかぎり》」描画。
- ※ WX09-Re16 の付与対象表記「あなたのシグニ1体」は別系統の「このシグニ」self-target 慣習の問題（条件追加自体は正しい改善）。

## 《相手ターン》《自分ターン》が CONTINUOUS で完全に無視されていた系統バグ（G074 調査で発覚・2026-06-23）

G074 の実装確認中に WX25-P1-114（【常】**《相手ターン》**：パワーは色種類につき＋2000）を検証したところ、`activeCondition` が欠落し**自分ターンでも +2000 が適用される**誤りを発見。パーサーに `《相手ターン》`/`《自分ターン》` の処理が一切無く、ターン限定が黙って捨てられていた（CONTINUOUS で30枚／32効果が該当）。

- **原因:** parseBlock が costStr（マーカーと：の間）の `《相手ターン》`/`《自分ターン》` を解釈せず破棄。
- **修正（パーサー）:** costStr から両マーカーを抽出し `TURN_OWNER`（相手=owner:opponent／自分=owner:self）を生成。**CONTINUOUS のみ** `activeCondition` に統合（checkActiveCondition が `TURN_OWNER` を line 47-48 で評価＝engine 既対応）。既存 activeCondition がある場合は AND で保持（WX24-P2-076 の手札4枚条件等）。
- **適用範囲（全カード差分で検証）:** ちょうど32効果（30枚）が `activeCondition:undefined → TURN_OWNER` の純追加。巻き添えゼロ。JSON 直パッチ（effects_WXDi/WX24_26/misc）。
- **注意（重要）:** ターン条件に `IS_MY_TURN`/`IS_OPPONENT_TURN` は使わない。`IS_MY_TURN` はパーサーが「コスト支払い→効果発動（そうした場合）」の CONDITIONAL プレースホルダーに転用しており衝突する。ターン限定は必ず `TURN_OWNER`。
- **未対応（TODO E節）:** AUTO/ACTIVATED の `《相手ターン》`/`《自分ターン》`（33枚）。これらは `condition` 側の評価がトリガー収集時の ad-hoc 判定（evalCondition は IS_*_TURN を実行時 true 扱い）で timing ごとに整備が要るため別タスク。今回はマーカー除去もせず据え置き（CONTINUOUS のみ costStr から除去）。
- 検証: `npm run typecheck` 通過。`verifyEffects` 退化なし。WX25-P1-114 が自ターン=base/相手ターン=+2000×色 に。decompile「《対戦相手のターンの間であるかぎり》」描画。

## GRANT_KEYWORD に targetsTriggerSource を追加（ON_ZONE_MOVED 配線の仕上げ・2026-06-23）

ON_ZONE_MOVED 配線の残課題だった「移動シグニ自身への【KW】付与」を正式対応。self-scope では既存の `!tgt.filter && sourceCardNum∈cands` 自動付与（execGrantKeyword:1281）でプロンプトは出ないが、any_ally/any_opp で「それ＝移動シグニ ≠ 効果元カード」の場合に正しく解決できなかった。

- **types:** `GrantKeywordAction.targetsTriggerSource` 追加。
- **engine:** execGrantKeyword 冒頭（targetsLastProcessed の次）に `triggeringCardNum→sourceCardNum` を所属フィールド判定して keyword_grants へ無選択付与する分岐を追加（POWER_MODIFY の targetsTriggerSource と同思想）。
- **parser:** effectParser の ON_ZONE_MOVED self 後処理（markSelfPM）が POWER_MODIFY に加え GRANT_KEYWORD(self,count:1,filterなし)も自動マーク。
- **decompile:** GRANT_KEYWORD の targetsTriggerSource を「それ（トリガー元シグニ）は【KW】を得る」と描画。
- **WXK03-073:** SEQUENCE の GRANT_KEYWORD(ランサー)に targetsTriggerSource を付与（JSON 直・MANUAL）。+2000 もランサーも移動シグニ自身に適用されることを decompile で確認。
- 検証: `npm run typecheck` 通過。`verifyEffects` 退化なし。

## G074「パワーはエナの色の種類1つにつき＋N」CONTINUOUS が未実装だったのを配線（2026-06-23）

逆翻訳の同型グルーピング（grouped_all.txt G074）で「あなたのシグニ1体のパワーを…」と出ていた（原文は「**このシグニ**のパワーは…」）。調査したところ、表現の誤りだけでなく **`POWER_MODIFY_PER_ENERGY_COLOR` アクションが CONTINUOUS パワー計算（effectEngine.calcFieldPowers）に一切配線されておらず、+N が全く適用されない完全未実装**だった（effectExecutor 側は「effectEngine処理」とログするだけのプレースホルダ）。

- **修正（engine）:** `extractPowerModifiesPerEnergyColor` を追加し、CONTINUOUS パワー適用ループに処理を追加。エナゾーンの色種類数（白赤青緑黒を個別カウント／マルチエナは各色別／無色は不算入＝既存 `ENERGY_COLOR_TYPES` 条件と同ロジック）× `deltaPerColor` を、`target.count!=='ALL'` なら効果元シグニ自身（topNum）、`ALL` なら `applyDeltaToState` でフィルタ一致シグニに適用。
- **修正（decompile）:** 共有ケースに `thisOnly`（count!=='ALL' かつ self/any →「このシグニ」）を追加。`POWER_MODIFY_PER_VIRUS_COUNT` と共有のため両者の self/count:1 表現が「このシグニ」に統一。
- **対象（全5枚）:** WX14-063/065/068（+1000/色）・WXDi-P08-071（+1000/色）・WX25-P1-114（+2000/色）。すべて target {self,count:1}・energyOwner:self で本配線が全対応。
- 検証: `npm run typecheck` 通過。focused テストで色2種→+2000・マルチ色は各色カウント・エナ無し→base を確認。decompile が「このシグニのパワーを…」に。

## ON_ZONE_MOVED トリガーの engine 配線（2026-06-23）

G073 系の timing 分類修正（下記）に続き、`ON_ZONE_MOVED` をゲームエンジンに配線。従来は `INTERNAL_MOVE_TO_ZONE` が原文「移動したとき…パワー+N」をテキスト読みして temp_power_mods に直書きする簡易ハックのみだった。

- **フラグ方式（virus トリガーと同パターン）:** PlayerState に `zone_moved_just?: string[]` を追加。ゾーン移動を実行する全パスが**移動シグニの所有者 state** に移動カードを積む:
  - `INTERNAL_MOVE_TO_ZONE`（execStubPart1。MOVE_TO_OTHER_SIGNI_ZONE / MOVE_TO_ATTACKER_FRONT 経由＝G073 の本線）
  - `INTERNAL_REPOSITION_TO_ZONE` / `INTERNAL_REPOSITION_MOVE`（execStubPart3。SIGNI_REPOSITION。入れ替え時は両シグニ）
  - `REARRANGE_SIGNI` 解決（effectExecutor。旧ゾーン≠新ゾーンのシグニのみ）
- **発火（BattleScreen）:** `collectZoneMovedTriggers(movedNum, mover, other, …)` を追加。watcher useEffect が `zone_moved_just` を検出し、**mover 側=scope self(=移動シグニ自身)/any_ally/any／相手側=any_opp/any** を収集してスタックに積み、フラグをクリア。`triggeringCardNum=移動シグニ`。usageLimit は actions_done で制御。CPU(=guest) のフラグはホストが代行（virus と同様）。
- **自己対象化:** scope self の「このシグニのパワー＋N」は `POWER_MODIFY.targetsTriggerSource=true` を effectParser が自動付与（`triggeringCardNum`→移動シグニへ無選択適用）。G073（WX14-050/052/053）の JSON を再パッチ。
- **WXK03-073:** 「パワー＋2000し【ランサー】を得る」の power 部がパーサーで欠落していた（ハック削除で +2000 喪失）ため、JSON を SEQUENCE[POWER_MODIFY(targetsTriggerSource +2000) / GRANT_KEYWORD(ランサー)] に直パッチ（parseStatus MANUAL）。GRANT_KEYWORD は targetsTriggerSource 非対応のため KW 付与は対象選択プロンプトになる（残課題・TODO E節）。
- 検証: `npm run typecheck` 通過。`verifyEffects` 退化なし。decompile で「それ（トリガー元シグニ）のパワーを＋N」と描画。

## G073 系「他のシグニゾーンに移動したとき」トリガー 21効果の誤分類を ON_ZONE_MOVED に修正（2026-06-23）

逆翻訳の同型グルーピング（grouped_all.txt G073）で、E2「場にあるこのシグニが効果によって他のシグニゾーンに移動したとき、ターン終了時まで、このシグニのパワーを＋N」が逆翻訳「**ターン終了時**：あなたのシグニ1体のパワーを＋N」と出ていた（ymst 指摘）。

- **原因:** `effectParser.ts` の【自】timing 分類に「移動したとき」トリガーが無く、文中の「**ターン終了時まで**」(=duration) が `actionText.includes('ターン終了時')` に拾われ `ON_TURN_END` に誤分類。トリガー文も未除去だった。同系統が広く埋もれており、**ON_TURN_END / ON_PLAY / ON_ATTACK_SIGNI に化けた21効果**が存在した。
- **E1 STUB は実装済み（ユーザー調査依頼）:** `MOVE_TO_OTHER_SIGNI_ZONE`（execStubPart1.ts:3618）→ 空きゾーン選択 → `INTERNAL_MOVE_TO_ZONE` で実際に移動。**さらに同ハンドラ(3668-3677)が原文の「移動したとき…パワーを＋N」を読んで temp_power_mods に即時適用**。よって G073 のパワー＋N は E1 ハンドラ経由で機能している（E2 を engine 配線せずとも動く）。
- **修正（パーサー）:** 新 timing `ON_ZONE_MOVED` を追加。timing 分類で「他のシグニゾーンに移動したとき」を **ヘブン直後・アタック判定より前**に判定（付与能力の引用内「アタックしたとき」WXK10-079 に勝たせるため）。トリガー文を主語別に除去しスコープ判定（このシグニ=self／対戦相手の(場にある)シグニ=any_opp／あなたの(場にある)シグニ=any_ally／無主語シグニ=any）。
- **影響範囲（全カード差分で検証）:** ちょうど21効果が `ON_PLAY/ON_TURN_END/ON_ATTACK_SIGNI → ON_ZONE_MOVED` に変化、巻き添えゼロ。20枚: WX11-002・WX11-036・WX14-050/052/053・WX20-054・WXEX1-55・WXK03-026/042/072/073・WXK06-029・WXK10-079・WXDi-D06-012・WXDi-P00-037/059/063・WXDi-P01-041・WXDi-P05-071・WX24-P2-088/091。
- **JSON 直パッチ:** 各カードの当該効果を新パース結果で置換（非対象効果のドリフトが無いことを effectId 単位で検証してから置換）。effects_WX/WXK/WXDi/WX24_26.json。
- **engine 未配線（TODO E節）:** `ON_ZONE_MOVED` トリガー自体は未配線。G073 のパワー＋N は上記ハンドラで動くが、他カード（移動時の能力喪失/バウンス/ルリグデッキ追加等）は現状不発（従来の ON_TURN_END/ON_PLAY 誤発火＝誤動作だったのが「正しい時にだけ発火＝現状は無発火」になった。表現の正規化が優先）。
- 検証: `npm run typecheck` 通過。decompile で「(対戦相手の/この)シグニが効果によって他のシグニゾーンに移動したとき」と正しく描画。

## G072「対戦相手のシグニがバニッシュされたとき」が ON_BANISH(自バニッシュ) に誤分類されていたのを修正（2026-06-23）

逆翻訳の同型グルーピング（grouped_all.txt G072）で、原文「対戦相手のシグニ１体がバニッシュされたとき」が逆翻訳「**このシグニ**がバニッシュされたとき」と出ていた（ymsty 指摘）。

- **原因:** `effectParser.ts` の【自】timing 分類（`actionText.includes('バニッシュされたとき') ? ['ON_BANISH']`）が「対戦相手のシグニがバニッシュ」も一律 `ON_BANISH`（=このシグニがバニッシュされたとき）に潰し、トリガー文の除去も「このシグニが〜」しか剥がさなかった。結果 `triggerScope` 無し＝**このシグニが死んだとき**発火という逆の挙動。
- **修正（パーサー）:** ON_BANISH ブロックに「`^対戦相手の(＜X＞の)?シグニ[N体]がバニッシュされたとき`」分岐を追加し、`extractedTriggerScope='any_opp'`（＋ストーリー filter）を設定してトリガー文を除去。`collectBanishTriggers` step2 が既に ON_BANISH×triggerScope(any_opp/any) で「相手シグニのバニッシュに反応」を処理しているため、**ゲーム挙動も同時に正常化**。decompile は `timingJa[ON_BANISH]`＋scopeSubj 置換で「対戦相手のシグニがバニッシュされたとき」と正しく描画。
- **JSON 直パッチ（10枚）:** ON_BANISH 効果に `triggerScope:any_opp` を追加。
  - effects_WX.json: WX13-085/087/091/094・WXEX2-26
  - effects_WXK.json: WXK02-047・WXK03-027・WXK11-020
  - effects_WXDi.json: WXDi-P10-075 / effects_WX24_26.json: WX24-D2-19
- **未対応（TODO に記録）:** トリガー前に条件前置きが付く 6 枚（「あなたのメインフェイズの間」WX05-040/WX11-027、「アタックフェイズの間」WXEX2-23、「あなたの効果によって」WXK11-055、「あなたの＜龍獣＞のシグニの効果によって」WX13-051、「【チャーム】が付いている対戦相手のシグニ」WXDi-P11-TK05）。前置きの condition/triggerCondition モデリングが必要で誤モデル化リスクが高いため別タスク。
- 検証: `npm run typecheck` 通過。再パースで該当10枚に `triggerScope:any_opp` を確認。grouped_all 再生成で同型割れ★=0。

## G002「デッキトップ公開→＜X＞のシグニならエナゾーンに置く」23枚の誤実装を修正（2026-06-23）

逆翻訳の同型グルーピング（grouped_all.txt の G002・23枚／全て WXK 帯）の代表照合で発覚。逆翻訳が「デッキから**undefined枚**エナチャージする」と出ていたのを起点に調査。

- **原文（例 WXK01-050）:** 【自】このシグニがアタックしたとき、あなたのデッキの一番上を公開する。それが＜乗機＞のシグニの場合、それをエナゾーンに置く。
- **誤実装:** `REVEAL_AND_PICK` の `then` が `ENERGY_CHARGE{target:{type:DECK_CARD,owner:self,count:1}}`。SEARCH 解決（`resumeSearch`）で `applyDirectAction(thenAction)` を呼ぶが **applyDirectAction に `ENERGY_CHARGE` ケースが無く** default で `executeAction(ENERGY_CHARGE)` にフォールバック → `execEnergyCharge` は `DECK_CARD` を HAND/TRASH 以外＝**else 分岐で `fieldCandidates`（自分の場のシグニ）** を候補にし、公開して選んだカード（`lastProcessedCards`）を無視して**自分の場のシグニを1体エナに送る**完全な誤動作だった。
- **修正:**
  - **逆翻訳器（`decompileEffects.ts`）:** `REVEAL_AND_PICK` の `thenJa` に `ADD_TO_ENERGY`→「エナゾーンに置く」分岐を追加（`undefined枚` 表示を解消）。
  - **パーサー（`effectParser.ts`・デッキトップ公開→条件分岐の生成箇所）:** `then` が `ENERGY_CHARGE{DECK_CARD}` になる場合を `ADD_TO_ENERGY{owner:self}` に正規化（`applyDirectAction` の `ADD_TO_ENERGY` ケースが「選んだカードをデッキ/トラッシュから除去しエナへ」を実装済みのため、公開カードが正しくエナに置かれる）。再パースで `then=ADD_TO_ENERGY` になることを確認＝再生成耐性あり。
  - **JSON 直パッチ（`effects_WXK.json`・23枚）:** 全 G002 カードの `then` を `ADD_TO_ENERGY{owner:self}` に変更（即効）。対象: WXK01-050/056/062/068・WXK02-044/050/056/062・WXK04-039/052/057・WXK06-039/046/054・WXK07-041/049/057・WXK08-039/047/054・WXK09-045/054/062。
- 検証: `npm run typecheck` 通過。`decompileEffects WXK01-050` で「その中から＜乗機＞のシグニを1枚エナゾーンに置く」（undefined 解消）を確認。`parseCardEffects` 再パースで `then=ADD_TO_ENERGY` を確認。

## 逆翻訳の同型グルーピングで WX05-009 / WX05-054 / WX05-076 を修正（2026-06-23）

逆翻訳バグを系統的に発見する調査インデックス（`scripts/group*.mjs`＋`docs/grouped_all.txt`。詳細は TODO.md E節「系統分け／同型グルーピング・インデックス」）で、同型カード群の逆翻訳の割れ（★）として検出・修正。

- **WX05-009「一燭即発」（アーツ・赤）:** バニッシュ対象に「パワーが、この方法でダウンしたシグニのパワー以下」の制約が欠落し、無条件で相手シグニ1体をバニッシュできていた。BANISH フィルタに `powerLteLastProcessed:true`（DOWN ステップが `lastProcessedCards` に記録 → `resolveDynamicFilter` が `powerRange.max` へ解決。WD04-018 と同機構）＋ `conditional:true`（ダウン対象が選ばれなければ空振り）を追加。
- **WX05-054「幻竜リントブルム」/ WX05-076「魅惑の魔道ロキ」（常時強化シグニ）:** 原文「あなたの他の＜龍獣/悪魔＞のシグニのパワーを＋2000」が `POWER_MODIFY owner:any / count:1`（敵味方の**任意1体**に+2000）に誤パースされていた。手本 WX03-037 に倣い `owner:self / count:ALL / story フィルタ / excludeSelf:true`（同種族の自分のシグニ全体・自身除外）へ修正。同型7枚グループ内で逆翻訳が割れていたのを groupSimilar の★検出で発見。
- 検証: JSON parse・`decompileEffects` 再生成で全体強化に戻ったことを確認。`checkAllEffects` 退化なし。
- ⚠ 3効果とも effects_WX.json 直パッチ（parseStatus MANUAL 化）だが **manualEffects 未登録**。`build:effects` 全再生成では消える（JSON を正データとして再生成しない運用なら実質 durable）。durable 化が要るなら manualEffects 登録を検討。

## 訂正: WX05-005/006 のグロウ条件は activeCondition ではなく grow ゲート（2026-06-23）

- **背景:** decompile の【JSON逆翻訳】にグロウ条件行を追加した際、先の WX05-005-E1・WX05-006-E1 の修正が誤りだったと判明。
- **誤り:** 【グロウ】の動的条件（WX05-005「トラッシュに黒10枚以上」/ WX05-006「エナの色3種類以上」）を **CONTINUOUS の `activeCondition` として継続判定**にしていた。これだと条件が崩れた瞬間に能力が切れる（黒<10でシグニ黒化が消える／エナ色<3でマルチエナが消える）。
- **正しい挙動:** WIXOSS の【グロウ】条件は**グロウ時のみ判定するゲート**で、`checkGrowCondition`（grow UI・5597行）が担当。グロウ後の【常】能力は**条件に関係なく常時発動**。既存の正例 WX04-005「アルテマ/メイデン イオナ」（【グロウ】ライフ1枚以下）も activeCondition を持たず grow ゲートのみ。`checkGrowCondition` は「トラッシュに○色N枚以上」(511行)・「エナの色N種類以上」(520行) を既に判定可能。
- **訂正:** WX05-005-E1・WX05-006-E1 から `activeCondition` を削除し常時発動に戻した（effects_WX.json / manualEffects.ts）。grow ゲートは checkGrowCondition が従来どおり担保。
- **据え置き（無害なので残置）:** 追加した汎用プリミティブ `ActiveCondition.ENERGY_COLOR_TYPES`・`COUNT_THRESHOLD.color`・`myEnaAllMulti` の activeCondition 評価・decompile 表示は、継続条件を持つ別カード用に有用なため温存。WX05-005 の E2（energyTrash コスト）、WX05-006 の E2/E3 修正は正しく、対象外。
- 検証: `npm run typecheck` 通過。`tsx scripts/decompileEffects.ts WX05-005 WX05-006` で「【グロウ条件】…（grow ゲート）」＋「E1【常】…（無条件）」を確認。

## WX05-008「遊月・伍」E1が「３枚まで」でなく1枚だった（2026-06-23）

- **原文（ルリグ ユヅキ Lv5）:** 【グロウ】センタールリグがカード名に《遊月》を含む【出】：対戦相手のエナゾーンからカードを**３枚まで**対象とし、それらをトラッシュ／【起】《ターン1回》エクシード1：相手エナ1枚トラッシュ／【起】エクシード2：手札の赤スペル1枚をコストなしで使用。
- **グロウ条件:** 「センタールリグがカード名に《遊月》を含む」は `checkGrowCondition`（EffectText経由・508行）で処理可能。本カードは名前が遊月・伍のため自身のグロウ条件を常に満たす（問題なし）。
- **旧実装の問題:** E1 が `TRASH ENERGY_CARD opponent count:1`。「３枚まで」が欠落し1枚しかトラッシュできなかった。
- **修正:** E1 を `count:3, upToCount:true` に（WX04-010-E1 と同じ「N枚まで」表現）。E2/E3 は元から正しいため変更なし。3効果を parseStatus MANUAL 化し `manualEffects.ts` に登録。
- 検証: `npm run typecheck` 通過。`executeAction` 単体テストで相手エナ4枚→SELECT_TARGET(count:3, optional:true, 候補4枚)＝最大3枚選択を確認。`tsx scripts/decompileEffects.ts WX05-008` で E1「対戦相手のエナを3枚までトラッシュ」を確認。`checkAllEffects` 退化なし。

## WX05-007「ラスト・セレクト」E1誤パース（センタールリグの下4枚＝エクシード4相当）（2026-06-22）

- **原文（アーツ・コスト《白×1》《黒×1》）:** 対戦相手のシグニ１体を対象とし、あなたのセンタールリグの下からカード４枚をルリグトラッシュに置く。そうした場合、それをトラッシュに置く。
- **旧実装の問題:** 効果が `SEQUENCE[TRASH 相手シグニ1体 → CONDITIONAL(IS_MY_TURN)→BANISH any 1]` という誤パース。「センタールリグの下から4枚をルリグトラッシュ」が完全に欠落し、無関係な自他バニッシュが付いていた。
- **修正:**
  - 「下から4枚をルリグトラッシュ」はエクシード4相当だが、**コストではなく効果の一部（「そうした場合」）**。ゲート型 STUB `LRIG_UNDER_TO_TRASH`（value:4）を新設し `effectExecutor.execSequence` に実装（`RECOLLECT_GATE` と同様）。センタールリグ（lrig配列末尾）を除いた下のカードが N 枚未満なら置けず以降ステップをスキップ＝シグニをトラッシュしない。N枚あれば下（配列先頭）から N 枚をルリグトラッシュへ送り続行。
  - E1 を `SEQUENCE[STUB LRIG_UNDER_TO_TRASH(4) → TRASH 相手シグニ1体]` に。energyコスト《白×1》《黒×1》は Cost欄どおりで正しいため維持。
  - parseStatus MANUAL 化＋`manualEffects.ts` 登録。decompile に `LRIG_UNDER_TO_TRASH` の自然文表示を追加。
- 検証: `npm run typecheck` 通過。`executeAction` 単体テストで「下4枚→4枚ルリグトラッシュ＋相手シグニ選択へ」「下3枚→置けず以降スキップ（相手シグニ残存・ルリグ不変）」を確認。`checkAllEffects` 退化なし。

## WX05-006「虚無の閻魔 ウリス」グロウ条件欠落・E2無効・E3全シグニ常時消失（2026-06-22）

- **原文:** 【グロウ】エナゾーンのカードの色が３種類以上【常】：あなたのエナは【マルチエナ】を持つ／【常】：あなたが使用するアーツとスペルの限定条件は無視される／【起】エクシード5：手札を1枚選ぶ。相手が色を1つ宣言。公開し、宣言された色を持たない場合のみ対戦相手の全シグニをトラッシュ。
- **旧実装の問題:**
  - E1: グロウ条件「エナの色が3種類以上」が `activeCondition` に無く、さらに `BattleScreen.myEnaAllMulti` が activeCondition を見ないため、**エナの色数に関係なく常時マルチエナ付与**。
  - E2: `BLOCK_ACTION`/`actionId:"IGNORE_RESTRICTIONS"` で表現されていたが、エンジンは限定無視を CONTINUOUS STUB `IGNORE_LRIG_RESTRICTION_ARTS` のみ認識（`meetsRestriction`/5608行）。`IGNORE_RESTRICTIONS` は `isActionBlocked` でも未参照で**完全に無効**。
  - E3: SEQUENCE 末尾に**無条件の `TRASH 相手全シグニ`** があり、宣言の正誤に関係なく毎回相手の全シグニが消失（条件判定が無意味化）。加えて条件判定本体 `INTERNAL_ODC_COLOR_CHECK` が不一致時にシグニを**エナゾーンへ移動（バニッシュ）**しており、原文の「トラッシュ」と不一致。
- **修正:**
  - 新 `ActiveCondition` `ENERGY_COLOR_TYPES`（自エナの異なる色数、多色は各色カウント・無色除外）を型・`checkActiveCondition`・decompile に追加。E1 に `gte:3` を付与し、`myEnaAllMulti` で activeCondition を評価するよう改修。
  - E2 を CONTINUOUS STUB `IGNORE_LRIG_RESTRICTION_ARTS` に置換（スペル・アーツ両方の限定を `meetsRestriction` が無視）。
  - E3 の無条件 TRASH ステップを削除（条件付きトラッシュは `INTERNAL_ODC_COLOR_CHECK` が担当）。`INTERNAL_ODC_COLOR_CHECK` の送り先をエナ→**トラッシュ**に是正（スタック下のカードも含む）。
  - 3効果を parseStatus MANUAL 化し `manualEffects.ts` に登録。decompile に `ENERGY_COLOR_TYPES`・`IGNORE_LRIG_RESTRICTION_ARTS` の自然文表示を追加。
- 検証: `npm run typecheck` 通過。`checkActiveCondition` 単体テストで 白赤=2色→false / 白赤青=3色→true / 多色1枚(白赤青)→true / 無色は非カウント を確認。`tsx scripts/decompileEffects.ts WX05-006` で E1「色が3種類以上であるかぎりマルチエナ」・E2「限定条件は無視される」を確認。`checkAllEffects` 退化なし。

## WX05-005「黒点の巫女 タマヨリヒメ」E1グロウ条件欠落・E2コスト不足（2026-06-22）

- **原文:** 【グロウ】あなたのトラッシュに黒のカードが１０枚以上ある【常】：エナゾーン以外の領域にあるシグニは黒になる／【起】《黒》エナゾーンから黒のカード１枚をトラッシュに置く：対戦相手のシグニ１体をトラッシュ／【起】エクシード5：対戦相手のセンタールリグと全シグニをダウン。
- **旧実装の問題:**
  - E1: STUB `CHANGE_ALL_SIGNI_COLOR_TO_BLACK` 自体は effectEngine `collectFieldSigniExtraColors` で実装済みだが、**グロウ条件「トラッシュに黒のカードが10枚以上」が `activeCondition` に無く、`checkActiveCondition` が `if (!cond) return true` のため常時発動**していた。
  - E2: コストが energy 黒×1 のみで、「エナゾーンから黒のカード１枚をトラッシュに置く」という追加コスト（`energyTrash`）が欠落。
- **修正:**
  - `ActiveCondition` の `COUNT_THRESHOLD` に任意 `color` を追加。`effectEngine` に `getLocationCards` を新設し、`color` 指定時は `cardMap` でその色を含むカードのみ計数するよう判定。E1 に `activeCondition: COUNT_THRESHOLD(trash/黒/gte10)` を付与。
  - E2 のコストに `energyTrash:{count:1,filter:{color:"黒"}}` を追加（既存 energy 黒×1 と併記）。ルリグ【起】の発動経路（`executeLrigGranted`）は energyTrash の選択UI・支払いを既に配線済みで、color フィルタも `matchesFilter` で機能。
  - 3効果を parseStatus MANUAL 化し `manualEffects.ts` に登録（再パースドリフト耐性）。decompile に COUNT_THRESHOLD の color 表示・`energyTrash` コスト表示・`CHANGE_ALL_SIGNI_COLOR_TO_BLACK` の自然文表示を追加。
- 検証: `npm run typecheck` 通過。`checkActiveCondition` 単体テストで黒9枚→false / 黒10枚→true / 黒0白20→false を確認。`tsx scripts/decompileEffects.ts WX05-005` で E1〜E3 が原文どおり表示されることを確認。

## WX05-003「コード・ピルルク ACRO」E2全捨て・E3差分ドローの誤実装（2026-06-22）

- **原文:** 【グロウ】センタールリグがカード名に《ピルルク》を含む（グロウ条件）／【常】このルリグはルリグトラッシュにあるルリグの【起】能力を持つ／【出】対戦相手は手札をすべて捨てる／【起】エクシード5：あなたの手札が6枚より少ない場合、その差の分だけカードを引く。
- **旧実装の問題:**
  - E2 が「対戦相手の手札を**1枚**トラッシュ」（本来は**すべて**捨てる）。
  - E3 が「手札6枚未満なら**1枚**引く」（本来は**6枚になるよう差の分**引く）。
- **修正:**
  - E2 を `TRASH HAND_CARD opponent count:"ALL"` に（全捨て。選択不要）。
  - `DrawAction` に `untilHandCount` を追加し `execDraw` で「手札が N 枚になるまで（差の分だけ）引く・N枚以上なら引かない」を実装。E3 を `DRAW untilHandCount:6` に（CONDITIONAL ラッパー不要に簡素化）。
  - E1（COPY_LRIG_TRASH_ACTIVATED）は WX05-002 と同様に表示是正済み。3効果を parseStatus MANUAL 化し `manualEffects.ts` に登録。
  - decompile: DRAW の untilHandCount 表示、および「すべて捨てる（count:ALL）」時に「（相手が選ぶ）」を出さないよう是正。
- 検証: `npm run typecheck` 通過、`tsx scripts/decompileEffects.ts WX05-003` で E2「対戦相手の手札をすべてトラッシュに置く」・E3「手札が6枚より少ない場合、その差の分だけカードを引く」を確認。

## WX05-002「花代・伍」の確定（COPY_LRIG_TRASH_ACTIVATED の表示是正・durable化）（2026-06-22）

- **原文:** 【グロウ】あなたのセンタールリグがカード名に《花代》を含む（＝グロウ条件）／【常】このルリグはあなたのルリグトラッシュにあるルリグの【起】能力を持つ／【常】あなたのシグニは【ダブルクラッシュ】を得る／【起】エクシード5：対戦相手のシグニを、パワーの合計が30000以下になるように好きな数バニッシュ。
- **確認結果:** 機能面は3効果とも実装済みだった。
  - グロウ条件「センタールリグがカード名に《花代》を含む」は `checkGrowCondition`（EffectText 経由）で処理。
  - E1 COPY_LRIG_TRASH_ACTIVATED は BattleScreen のルリグメニュー（`hasInheritLrigTrash`）がルリグトラッシュの【起】を継承提示する形で実装済み。
  - E2 GRANT_KEYWORD ダブルクラッシュ（自全シグニ）、E3 BANISH `totalPowerMax:30000`（execBanish が合計パワー制限選択を実装）も正しい。
- **是正:** E1 が decompile で `[STUB:COPY_LRIG_TRASH_ACTIVATED]` と未実装に見えていたため、decompileEffects に COPY_LRIG_TRASH_ACTIVATED / INHERIT_LRIG_TRASH_ABILITIES の説明（「このルリグは…ルリグトラッシュにあるルリグの【起】能力を持つ」）を追加。3効果を parseStatus MANUAL 化し `manualEffects.ts` に登録（再パースドリフト耐性）。
- 検証: `npm run typecheck` 通過、`tsx scripts/decompileEffects.ts WX05-002` で E1〜E3 が原文どおり表示されることを確認。

## WX05-001「創世の巫女 マユ」のグロウ条件誤パース・能力誤実装（2026-06-22）

- **原文:** 【グロウ】あなたのルリグデッキから＜タマ＞か＜イオナ＞のルリグ1枚を公開し、それをあなたのセンタールリグの下に置く（＝**グロウ条件**）／【出】：あなたのルリグトラッシュからすべてのルリグをこのカードの下に置き、すべての白と黒のアーツをルリグデッキに戻す。／【起】エクシード1：ターン終了時まで、対戦相手のすべてのシグニは能力を失う。／【起】エクシード5：あなたのエナゾーンからすべてのカードをトラッシュに置き、手札をすべて捨てる。あなたはこのターンの次に追加の1ターンを得る。
- **旧実装の問題:**
  - **E1 が【グロウ】文を ON_PLAY「あなたのシグニ1体をデッキの上に置く」と誤パース**。【グロウ】はグロウ条件で、BattleScreen の `checkGrowCondition`/`applyGrowEffect`（EffectText から「＜タマ＞か＜イオナ＞のルリグ1枚を公開し…センタールリグの下に置く」を認識・処理）が担うため、effects に入れるのが誤り。本来の【出】も未実装だった。
  - E3 が「エナゾーンをすべてトラッシュ」を欠落（手札捨てと追加ターンのみ）。
  - E2 の REMOVE_ABILITIES は `abilities_removed` がターン終了時に**一度もクリアされず永続化**する潜在バグ（「ターン終了時まで」が効かない）。
- **修正:**
  - E1 を本来の【出】に置換：新アクション `PLACE_LRIGS_UNDER_CENTER`（ルリグトラッシュの全ルリグをセンタールリグの下＝スタック最下部へ）＋`TRANSFER_TO_DECK` を `source:LRIG_TRASH_CARD`（filter アーツ・色[白,黒]）・`destination:lrig_deck` に対応拡張（白黒アーツをルリグデッキへ戻す）。
  - E3 に `TRASH ENERGY_CARD ALL` を追加（エナ全トラッシュ）。GAIN_EXTRA_TURN は実装済み（extra_turn フラグ）。
  - **`abilities_removed` をターン終了時にクリア**（BattleScreen のターン終了処理で自分側 `newMyState` と相手側 upkeep の両方に `abilities_removed:[]` を追加）。一回限り REMOVE_ABILITIES/NEGATE_ABILITY 用ストアで、CONTINUOUS 能力消去は別途算出のため安全。これで E2 の「ターン終了時まで」が正しく機能。
  - decompile: `PLACE_LRIGS_UNDER_CENTER`・`TRANSFER_TO_DECK(destination:lrig_deck)` の逆翻訳を追加。
- 検証: `npm run typecheck` 通過、`tsx scripts/decompileEffects.ts WX05-001` で E1「ルリグトラッシュからすべてのルリグをこのカードの下に置く。そして…白・黒のアーツ…をルリグデッキに戻す」、E3「エナをすべてトラッシュ…手札をすべてトラッシュ…追加ターン」を確認。グロウ条件は EffectText 経由で従来どおり機能。

## WX04-103-E1「エビルズ・ソウル」のレベル合計パワー減・チャーム源の誤実装（2026-06-22）

- **原文:** 「対戦相手のシグニ1体を対象とし、ターン終了時まで、それのパワーをあなたの場にある＜悪魔＞のシグニのレベルを合計した数だけ－1000する。その後、あなたの＜悪魔＞のシグニ1体を対象とし、このスペルをそれの【チャーム】にしてもよい。」
- **旧実装の問題:** Step1 が `STUB(POWER_MOD_BY_FIELD_CLASS_LEVEL)` で未実装。Step2 はチャーム源が `charm:{type:SIGNI}`（場のシグニ）で「**このスペル**」になっておらず、付与先も＜悪魔＞絞りが欠落。
- **修正:**
  - `POWER_MODIFY_PER_LEVEL_SUM` の **executor 実装を新設**（`execPowerModifyPerLevelSum`）。従来は CONTINUOUS（calcFieldPowers）専用だったが、スペルの一回限り効果として countOwner 場の countFilter 一致シグニのレベル合計 × deltaPerLevel を、選択対象に temp_power_mods（＝ターン終了時まで）で付与。再帰ループ回避のため解決済み delta の `POWER_MODIFY` を thenAction にして `applyDirectAction` で適用。
  - Step1 を `POWER_MODIFY_PER_LEVEL_SUM`（target:opponent 1、deltaPerLevel:-1000、countFilter:cardClass 悪魔、countOwner:self）に。
  - Step2 のチャームを `TRASH_CARD + thisCardOnly`（＝このスペル。解決時スペルはトラッシュにあるので WX04-102 と同機構で自身を参照）、付与先 `cardClass:悪魔`、`optional:true` に。
  - decompile: `POWER_MODIFY_PER_LEVEL_SUM` 専用ケース（「…のレベルを合計した数だけ－N」）を追加。
- 検証: `npm run typecheck` 通過、`tsx scripts/decompileEffects.ts WX04-103` で「対戦相手のシグニ1体のパワーをあなたの場の＜悪魔＞のシグニのレベルを合計した数だけ－1000する。そしてこのカードをあなたの＜悪魔＞のシグニ1体の【チャーム】にする（してもよい）」を確認。

## WX04-102-E1「堕落の消滅 アリトン」のチャーム源・発生源限定の欠落（2026-06-22）

- **原文:** 「【自】：このカードが手札かデッキからトラッシュに置かれたとき、あなたのシグニ1体を対象とし、このカードをそれの【チャーム】にしてもよい。」
- **旧実装の問題:** ①チャーム源が `charm:{type:SIGNI,owner:self}`（場の自分シグニを選ぶ）で、原文の「**このカード**（トラッシュにある自身）」になっていなかった。②**発生源限定（手札かデッキから）が無く**、ON_TRASH 収集の都合上「場から」トラッシュされても発火し、逆に「手札から」は `fromAnyZone` 未指定で発火しなかった。③「してもよい」(optional) も欠落。
- **修正:**
  - `execAttachCharm` の `TRASH_CARD` 分岐に `filter.thisCardOnly` を実装（効果元自身＝`ctx.sourceCardNum` をトラッシュからチャーム化）。JSON の charm を `TRASH_CARD + thisCardOnly`、`optional:true` に。
  - `triggerCondition.fromZones`（`Array<'hand'|'deck'|'energy'|'field'>`）を新設。ON_TRASH 収集3経路を発生源でゲート：`collectTrashTriggers`（場）・`collectDeckTrashSelfTriggers`（デッキ）・`collectAnyZoneTrashSelfTriggers`（手札/エナ、origin 引数で領域判定）。`detectHandEnergyTrashed` を `detectHandTrashed`/`detectEnergyTrashed` に分割し、領域を区別して収集。
  - JSON に `triggerScope:self`＋`triggerCondition.fromZones:['hand','deck']`。`manualEffects.ts` に MANUAL 登録。
  - decompile: ATTACH_CHARM の thisCardOnly→「このカード」、ON_TRASH timing に fromZones（「手札かデッキから」）を反映。
- 検証: `npm run typecheck` 通過、`tsx scripts/decompileEffects.ts WX04-102` で「【自】このカードが手札かデッキからトラッシュに置かれたとき：このカードをあなたのシグニ1体の【チャーム】にする（してもよい）」を確認。場からトラッシュ時は発火しない・手札/デッキからは発火する挙動に。

## WX04-099-E1「ツヴァイ＝サリナ」のバトルトリガー誤実装（2026-06-22）

- **原文:** 「【自】：対戦相手のターンの間、このシグニが対戦相手のレベル2以下のシグニとバトルしたとき、バトル終了時に、その対戦相手のシグニをバニッシュする。（このシグニがバトルでバニッシュされていても、この能力は発動する）」
- **旧実装の問題:** timing が **ON_PLAY**（場に出たとき）で、バニッシュ対象も「対戦相手のレベル2以下シグニ**任意1体**」だった（バトル契機・相手ターン限定・バトル相手指定がすべて欠落）。
- **修正:** timing `ON_SIGNI_BATTLE`＋`triggerScope:self`＋`condition IS_OPPONENT_TURN`。BANISH 対象を `owner:opponent, filter:{isTriggerSource:true, levelRange.max:2}`（「そのバトルした相手シグニ」＝バトル相手をレベル2以下に限定）に。
- **基盤の整備（検証で発覚）:**
  - `ON_SIGNI_BATTLE` 収集（BattleScreen `collectBattleTrig`）に **①ターン判定**（`condHas` で IS_MY_TURN/IS_OPPONENT_TURN を評価。ON_TRASH と同方式）と **②`triggeringCardNum` にバトル相手を設定**（攻撃側↔防御側を相互参照）を追加。これにより `isTriggerSource` でバトル相手を特定でき、「このシグニがバニッシュされても発動」（相手＝triggeringCardNum は別カードなので追跡が途切れない）も満たす。
  - `evalCondition` の `IS_OPPONENT_TURN` を `false`→`true` に是正（`IS_MY_TURN` と対称のプレースホルダ。実ターン判定は収集側 `condHas` が担う。従来は `evalUseCondition` 経由で常にブロックされ、IS_OPPONENT_TURN 付き AUTO が発火しない潜在バグだった）。
  - decompile: `isTriggerSource` 描画にレベル条件（「そのレベルN以下のシグニ」）を追加。
- 検証: `npm run typecheck` 通過、`tsx scripts/decompileEffects.ts WX04-099` で「【自】このシグニがバトルしたとき：対戦相手のターンの間、そのレベル2以下のシグニをバニッシュする」を確認。

## WX04-098-E1「堕落の吐露 マイモン」の【チャーム】条件欠落（2026-06-22）

- **原文:** 「【常】：このシグニに【チャーム】が付いているかぎり、このシグニの基本パワーは10000になる。」
- **旧実装の問題:** activeCondition 欠落で**常時10000**だった（WX04-096-E1 と同型）。
- **修正:** JSON E1 に `activeCondition IS_SELF_CHARMED`（WX04-096 で新設済み）を追加、`manualEffects.ts` に MANUAL 登録。`npm run typecheck` 通過、decompile で「《このシグニに【チャーム】が付いているかぎり》…基本パワーを10000」を確認。

## WX04-096「堕落の破戒 オリエンス」E1条件・E2対象クラスの欠落（2026-06-22）

- **原文 E1:** 「【常】：このシグニに【チャーム】が付いているかぎり、このシグニの基本パワーは12000になる。」 / **E2:** 「【起】《ダウン》：あなたの＜悪魔＞のシグニ1体を対象とし、あなたのデッキの一番上のカードをそれの【チャーム】にしてもよい。」
- **旧実装の問題:** E1 は activeCondition 欠落で**常時12000**だった。E2 は付与先が「あなたのシグニ1体」で**＜悪魔＞のクラス絞りが欠落**していた。
- **修正:**
  - 新 activeCondition `IS_SELF_CHARMED`（types/effects.ts）を追加。`checkActiveCondition`（effectEngine.ts）で `signi_charms[zoneIdx]` の有無を判定（`IS_SELF_ACCED` と同型）。decompile condJa も対応。
  - JSON E1 に `activeCondition IS_SELF_CHARMED`、E2 の `to` に `filter cardClass:"悪魔"` を追加。`manualEffects.ts` に E1・E2・BURST を MANUAL 登録。
- 検証: `npm run typecheck` 通過、`tsx scripts/decompileEffects.ts WX04-096` で E1「《このシグニに【チャーム】が付いているかぎり》…基本パワーを12000」・E2「…あなたの＜悪魔＞のシグニ1体の【チャーム】にする」を確認。

## WX04-094「怒号」の対象・条件付き付与を本実装（2026-06-22）

- **原文:** 「あなたの＜空獣＞か＜地獣＞のシグニ1体を対象とし、ターン終了時まで、それのパワーを＋2000する。あなたの場に＜空獣＞と＜地獣＞のシグニが合計3体ある場合、ターン終了時まで、それは【ランサー】と『【自】：このシグニが対戦相手のライフクロスをクラッシュしたとき、あなたのデッキの一番上のカードをエナゾーンに置く。』を得る。」
- **旧実装の問題:** 対象が `owner:any`（自分または相手の任意シグニ）で、＜空獣＞＜地獣＞のクラス絞りが無く、しかも「3体ある場合」の条件を無視して**無条件で `ENERGY_CHARGE_FROM_DECK`** を実行していた（【ランサー】付与も【自】付与も欠落）。
- **修正:** SEQUENCE で本実装。
  - ①`POWER_MODIFY` 対象 `owner:self, count:1, filter cardClass:[空獣,地獣]`・+2000（duration 省略＝ターン終了まで）。クラスは規約どおり `cardClass` を使用（[[storyフィルター使用ルール]]）。
  - ②`CONDITIONAL`（`HAS_CARD_IN_FIELD owner:self filter cardClass:[空獣,地獣] minCount:3`）→ then で、①で選んだ「それ」へ `GRANT_KEYWORD ランサー` と `GRANT_EFFECT`（【自】`ON_OPP_LIFE_CRASHED`→`ENERGY_CHARGE_FROM_DECK`、WX03-031-E1 と同型）をいずれも UNTIL_END_OF_TURN で付与。
- **基盤追加:**
  - `GrantEffectAction` に `targetsLastProcessed`（「それ」＝直前選択シグニへ付与。GRANT_KEYWORD と同機構）を追加し `execGrantEffect` に分岐実装。付与は `granted_effects`（instanceId単位）へ入り、`effectsMap` が instanceId でマージするため `ON_OPP_LIFE_CRASHED` 収集（BattleScreen 9182〜、付与能力も走査）で発火する。
  - `Condition.HAS_CARD_IN_FIELD` に `minCount`（CONDITIONAL用。従来は `.some()`＝1体以上固定）を追加し `evalCondition` を「該当数 ≥ minCount」判定へ。
- 検証: `npm run typecheck` 通過。`tsx scripts/decompileEffects.ts WX04-094` の逆翻訳が「あなたの＜空獣・地獣＞のシグニ1体のパワーを＋2000する。そしてあなたの場に＜空獣・地獣＞のシグニが3体以上いるなら、それは【ランサー】を得る（…）。そしてそれは『【自】対戦相手のライフがクラッシュされたとき：…エナゾーンに置く』を得る（…）」となることを確認。`ON_OPP_LIFE_CRASHED` は配線済み（攻撃側フィールドを走査、augmented effectsMap 経由で付与能力も拾う）。

## WX04-093「惰眠」のデッキ公開→場出し→3回繰り返しを本実装（2026-06-22）

- **原文:** 「あなたのデッキの上からシグニがめくれるまで公開する。その後、公開されたシグニを場に出し、残りをトラッシュに置く。その後、この効果を２回繰り返す。（場に出すことのできないシグニはトラッシュに置かれる）」
- **旧実装の問題:** E1 が `SEQUENCE(STUB DECK_REVEAL_UNTIL / REVEALED_SIGNI_TO_FIELD_REST_TRASH / REPEAT_EFFECT)` で未実装（ログのみ）だった。
- **修正:** 新アクション `REVEAL_UNTIL_TO_FIELD`（types/effects.ts）を追加。`execRevealUntilToField`（effectExecutor.ts）でデッキ上からシグニがめくれるまで公開→そのシグニを場に出し→手前の公開カードをトラッシュ→これを `repeat` 回繰り返す。空きシグニゾーンが無く場に出せないシグニはトラッシュへ（原文の括弧書きに対応）。JSON E1 を `REVEAL_UNTIL_TO_FIELD(repeat:3)` に置換、`manualEffects.ts` に E1・BURST を MANUAL 登録。decompile actionJa も対応。
- **【出】(ON_PLAY) 発火 ＋ ゾーン選択維持（検証で発覚した追加対応）:** 当エンジンには「効果で場に出したシグニの【出】を発火する汎用機構」が無く（COLLAB / SEED_BLOOM など個別 STUB のみが `lastProcessedCards` ベースで ON_PLAY を積む）、しかもスペルは processStack とは別の専用パス（`resolvePendingSpell`）で解決され ON_PLAY を一切収集していなかった。さらに `SELECT_SIGNI_ZONE` での中断は `needsInteraction` が `lastProcessedCards` を保持せず、resume パス（`handleSelectSigniZoneForEffect`）にもトリガー収集が無いため、ゾーン選択を挟むと場出しシグニの追跡が途切れていた。
  - **ゾーン選択を残したまま【出】を追跡:** `SELECT_SIGNI_ZONE` の型に `placedSoFar?: string[]` を追加（types/index.ts）。`execRevealUntilToField` は空きゾーンが2つ以上なら従来通り `SELECT_SIGNI_ZONE` で配置先を選ばせ、そのとき「これまで場に出したシグニ」を `placedSoFar` に積む（空きゾーンが1つなら自動配置）。`resumeSelectSigniZone` は配置後に `lastProcessedCards = [...placedSoFar, cardNum]` を設定し、中断を跨いで蓄積を維持する。
  - **3経路で【出】収集:** BattleScreen の **resolvePendingSpell（スペルが中断なく解決）**・**processStack（非スペルの ACTIVATED が中断なく解決）**・**handleSelectSigniZoneForEffect（ゾーン選択を挟んだ最終解決）** の3箇所で、`action.type === 'REVEAL_UNTIL_TO_FIELD'` のとき `lastProcessedCards` 各シグニの AUTO/ON_PLAY 効果をスタックへ積む。中断ありは done=false で前2経路の収集をスキップ→resume 経路で1回だけ発火するため二重発火しない。複数体は別エントリとして積まれるので、原文「【出】能力は…好きな順番で発動する」も既存の整列UIで満たされる。
- 検証: `npm run typecheck` 通過。経路調査で WX04-093（スペル）は resolvePendingSpell で解決されること、カットイン経路はスペルを打ち消す＝本効果は解決しないこと、CPU はスペルパス統一済み（pending_spell 経由）であること、`applyRefreshOnDone` が `lastProcessedCards` を保持すること（デッキ枯渇でも【出】対象が失われない）を確認。decompile 再生成で「あなたのデッキを上からシグニがめくれるまで公開し、そのシグニを場に出し、残りをトラッシュに置く（場に出せないシグニはトラッシュへ）。これを3回繰り返す」を確認。

## WX04-089-E1「＜美巧＞が3体あるかぎり+2000」の minCount 欠落（2026-06-22）

- **症状（ユーザー確認依頼）:** E1「【常】：あなたの場に＜美巧＞のシグニが**３体**あるかぎり、あなたのシグニのパワーを＋2000する。」の activeCondition に `minCount` が無く「1体以上あるかぎり」になっていた（WX04-079 と同型）。
- **修正:** JSON E1 の `activeCondition`（HAS_CARD_IN_FIELD）に `minCount:3` を追加、`manualEffects.ts` に MANUAL 登録。
- 検証: `npm run typecheck` 通過、decompile 再生成で「＜美巧＞のシグニが3体以上いるかぎり」を確認。

## WX04-088 ビーグル「ランサーを持つかぎり基本10000」＋SELF_HAS_KEYWORD条件新設（2026-06-22）

- **原文 E1:** 「【常】：このシグニが【ランサー】を持っているかぎり、このシグニの基本パワーは10000になる。」 / **E2:** 「【起】《緑》《緑》《緑》：ターン終了時まで、このシグニは【ランサー】を得る。」
- **旧実装の問題:** E1 は activeCondition 欠落で常時10000。E2 は対象が「あなたのシグニ1体」（本来「このシグニ」）で、別シグニにランサー付与可能だった（E1 条件とも噛み合わない）。
- **修正:**
  - 新 activeCondition `SELF_HAS_KEYWORD`（types/effects.ts）を追加。`effectEngine.checkActiveCondition` で `hasKeyword`（印字・keyword_grants(_until_opp_turn)・field_keyword_grants_active を網羅）を用い「このシグニが【keyword】を持つか」を判定。decompile condJa も対応。
  - JSON E1 に `activeCondition SELF_HAS_KEYWORD(ランサー)`、E2 の target を `filter.thisCardOnly`（このシグニ＝自動付与・プロンプトなし）・duration UNTIL_END_OF_TURN に修正。`manualEffects.ts` に E1・E2 を MANUAL 登録。
- 検証: `npm run typecheck` 通過、lint 0 errors、decompile 再生成で E1「《このシグニが【ランサー】を持っているかぎり》…基本パワーを10000」・E2「このシグニは【ランサー】を持つ（ターン終了時まで）」を確認。E2でランサー付与→E1条件成立→基本10000 が連動。

## WX04-086-E1「他の＜空獣＞＜地獣＞に+2000」の誤実装（2026-06-22）

- **原文:** 「【常】：あなたの**他の**＜空獣＞と＜地獣＞のシグニのパワーを＋2000する。」
- **旧実装の問題:** target が `owner:any, count:1`・フィルタ無しで「自分または対戦相手のシグニ1体に+2000」になっていた（owner・count・クラス絞り・excludeSelf すべて欠落）。
- **修正:** target を `owner:self, count:ALL, filter:{cardType:シグニ, story:[空獣,地獣], excludeSelf:true}`・action `excludeSelf:true`（WX04-056 と同形）に修正。`manualEffects.ts` に MANUAL 登録。BURST（＜空獣・地獣＞シグニサーチ）は正しいため変更なし。
- 検証: `npm run typecheck` 通過、decompile 再生成で「あなたのすべての他の＜空獣・地獣＞のシグニのパワーを＋2000する」を確認。

## WX04-084-E1 ATTRACTION の誤実装（コスト1/2/3のスペル3枚サーチが単一サーチに潰れていた）（2026-06-22）

- **原文:** 「あなたのデッキからコストの合計が**1**のスペル1枚とコストの合計が**2**のスペル1枚とコストの合計が**3**のスペル1枚を探して公開し手札に加え、デッキをシャッフルする。」（3枚）
- **旧実装の問題:** 単一 SEARCH（コスト条件なし・スペル1枚のみ）になっており、コスト別の3枚サーチが表現できていなかった。
- **修正:** `TargetFilter` に `costMin?: number` を追加（`costMin===costMax` で「コストの合計がちょうどN」）、`matchesFilter` を costMin/costMax 両対応に拡張。JSON E1 を SEQUENCE で3回 SEARCH（costMin/Max=1, 2, 3）＋末尾に1回 SHUFFLE_DECK に修正。`manualEffects.ts` に MANUAL 登録、decompile `filterJa` に「コストの合計がNの／N以上の」描画を追加。
- 検証: `npm run typecheck` 通過、lint 0 errors、decompile 再生成で「コストの合計が1/2/3のスペルを探して…」の3回サーチ＝原文一致を確認。

## WX04-082-E1「正面シグニ＝アタッカーを凍結」を正しく実装（防御側トリガー新設）（2026-06-22）

- **原文:** 「【自】：このシグニの正面のシグニがアタックしたとき、アタックしたそのシグニを凍結する。」
- **旧実装の問題:** timing `ON_ATTACK_SIGNI`（=このシグニ自身がアタックしたとき）＋対象 `owner:self`（自分のシグニを凍結）で、トリガーも対象も誤り。さらに「防御側の正面シグニがアタッカーを凍結する」機構自体が未配線（防御側 ON_ATTACK_SIGNI 収集は移動系STUB2種のみ対応）だった。
- **修正（機構新設）:**
  - 新トリガー `ON_FRONT_SIGNI_ATTACK`（types/effects.ts）を追加。`BattleScreen` のアタックハンドラの防御側ループをゾーンindex対応にし、**アタッカーの正面ゾーン（opFrontZoneIdx）の守備側シグニ**が持つ `ON_FRONT_SIGNI_ATTACK` を `triggeringCardNum=アタッカー` で発火。
  - `execFreeze` に `filter.isTriggerSource` 対応を追加（凍結対象を `ctx.triggeringCardNum`＝アタッカーに限定）。
  - JSON E1 を timing `ON_FRONT_SIGNI_ATTACK`／FREEZE target `owner:opponent, count:ALL, filter.isTriggerSource`（count:ALL でプロンプトなし自動凍結）に修正。`manualEffects.ts` に MANUAL 登録。decompile に timing ラベルと `targetJa` の isTriggerSource（「そのシグニ」）描画を追加。
- 検証: `npm run typecheck` 通過、lint 0 errors、decompile 再生成で「このシグニの正面のシグニがアタックしたとき：そのシグニを凍結する」＝原文一致を確認。アタッカーは正面ゾーンのみ・凍結はバトル解決前（Phase1）に適用＝次の自分のアップフェイズにアップしない挙動。

## decompile: ON_BANISH トリガー表示の不要な「（など）」を除去（2026-06-22）

- **症状（ユーザー疑問）:** WX04-081-E1 等の逆翻訳が「このシグニ**（など）**がバニッシュされたとき」となっており、「（など）」が何を指すか不明だった。
- **原因:** `decompileEffects.ts` の `timingJa` で ON_BANISH ラベルにのみ作者のヘッジ「（など）」がハードコードされていた（WIXOSS のルール用語ではない。他トリガーには無い）。triggerScope による主語変化は別途 `scopeSubj` 機構が担うため冗長。
- **修正:** ON_BANISH ラベルを「このシグニがバニッシュされたとき」に変更し decompile 再生成（ON_BANISH を持つ全カードが原文どおりの表記に）。

## decompile: OPTIONAL_COST 系STUBの逆翻訳を「《色》を支払ってもよい」に（WX04-081-E1 他）（2026-06-22）

- **症状（ユーザー確認依頼）:** WX04-081-E1 の逆翻訳が `[STUB:OPTIONAL_COST: 任意コスト（effectExecutorのSEQUENCEインターセプト対象外のエッジケース）…]` という STUBS.md の冗長な説明文になっていた。
- **原因:** decompile の STUB 描画が OPTIONAL_COST に専用ケースを持たず、STUB レジストリ説明文へフォールバックしていた（表示のみ。JSON 構造 `SEQUENCE[OPTIONAL_COST, CONDITIONAL(IS_MY_TURN→…)]` は正しく、`effectExecutor` が直後の CONDITIONAL と結合して「支払う→効果発動／スキップ」を生成する標準パターンで**機構は正常**）。
- **修正:** `decompileEffects.ts` の STUB 描画に `OPTIONAL_COST` / `TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST` / `OPTIONAL_TRASH_ENERGY_CLASS` の専用ケースを追加し `costColors` から「《色》を支払ってもよい」を生成。decompile_sheet1.txt 再生成で WX04-035/081/092・WX05-025/028 等が正しく表示されるようになった。

## WX04-079-E1「＜原子＞が3体あるかぎり+2000」の minCount 欠落（2026-06-22）

- **症状（ユーザー確認依頼）:** E1「【常】：あなたの場に＜原子＞のシグニが**３体**あるかぎり、あなたのシグニのパワーを＋2000する。」の activeCondition に `minCount` が無く、「1体以上あるかぎり」になっていた。
- **修正:** JSON E1 の `activeCondition`（HAS_CARD_IN_FIELD）に `minCount:3` を追加、`manualEffects.ts` に MANUAL 登録。`checkActiveCondition` は `matched >= (minCount ?? 1)` で評価するため3体以上で発動。
- 検証: `npm run typecheck` 通過、decompile 再生成で「＜原子＞のシグニが3体以上いるかぎり」を確認。

## WX04-078-E1「相手場に凍結シグニがあるかぎり基本パワー10000」＋HAS_CARD_IN_FIELD の状態フィルタ対応（2026-06-22）

- **症状（ユーザー確認依頼）:** E1「【常】：対戦相手の場に凍結状態のシグニがあるかぎり、このシグニの基本パワーは10000になる。」が `activeCondition` 欠落で常時10000になっていた。
- **追加で判明した機構バグ:** `effectEngine` の `checkActiveCondition` / `evalUseCondition` の `HAS_CARD_IN_FIELD` は card ベースの `matchesFilter` のみで判定しており、`isFrozen` / `isDown` 等の**状態フィルタを無視**していた（「凍結状態のシグニがあるかぎり」が「シグニがあるかぎり」になる）。
- **修正:**
  - 両 `HAS_CARD_IN_FIELD` をゾーンindex付き走査に変更し、`matchesFilter`（カード）＋`matchesStateFilter`（状態：isFrozen/isDown/infected等）を併用するよう拡張。状態フィルタ未指定の条件は従来どおり（`matchesStateFilter` が true）。
  - JSON E1 に `activeCondition HAS_CARD_IN_FIELD(owner:opponent, filter:{cardType:シグニ, isFrozen:true})` を追加、`manualEffects.ts` に MANUAL 登録。
- 検証: `npm run typecheck` 通過、lint 0 errors、decompile 再生成で「《対戦相手の場に凍結状態のシグニがいるかぎり》このシグニの基本パワーを10000にする」を確認。

## WX04-074-E1 懐疑する慟哭の誤実装（2体バニッシュが成立不能フィルタに潰れていた）（2026-06-22）

- **原文:** 「対戦相手の、パワー5000以下のシグニ１体と**パワー10000以上のシグニ１体**を対象とし、それらをバニッシュする。」（2体）
- **旧実装の問題:** 1体の BANISH target に `powerRange{min:10000, max:5000}` を両方付けており、**パワー5000以下かつ10000以上＝該当0体**で何もバニッシュできなかった。
- **修正:** SEQUENCE で 2 体別々の BANISH（`powerRange.max:5000` と `powerRange.min:10000`）に分割。`manualEffects.ts` に MANUAL 登録。BURST（パワー5000以下1体バニッシュ→デッキトップをエナ）は正しいため変更なし。
- 検証: `npm run typecheck` 通過、decompile 再生成で「パワー5000以下のシグニ1体をバニッシュ。そしてパワー10000以上のシグニ1体をバニッシュ」＝原文一致を確認。

## WX04-073-E1 炎壊の舞盃の誤実装（自ライフでなく相手ライフをクラッシュ／パワー条件欠落）（2026-06-22）

- **原文:** 「対戦相手のパワー8000以下のシグニ１体を対象とし、**あなたの**ライフクロス１枚をクラッシュする。そうした場合、それをバニッシュする。」
- **旧実装の問題:**
  1. `LIFE_CRASH owner:"opponent"` で**対戦相手のライフをクラッシュ**していた（原文は「あなたの」＝自分のライフを払う）。挙動が逆で、コストどころか相手に得をさせていた。
  2. BANISH の対象に `powerRange.max:8000` が無く、パワー無制限でバニッシュできていた。
- **修正:** `LIFE_CRASH owner:"self"`（triggerBurst は自分のバースト誘発のため true 維持）、BANISH target に `filter.powerRange.max:8000` を追加。`manualEffects.ts` に MANUAL 登録。「そうした場合」はコードベース慣例どおり `CONDITIONAL{IS_MY_TURN}`（スペルは自ターン使用で実質常時真）。
- 検証: `npm run typecheck` 通過、decompile 再生成で「あなたのライフクロスを1枚クラッシュする。そうした場合、対戦相手のパワー8000以下のシグニ1体をバニッシュする」＝原文一致を確認。

## WX04-072-E1「【マルチエナ】を持つエナをトラッシュ」の対象フィルタ欠落（2026-06-22）

- **症状（ユーザー確認依頼）:** E1「【起】このシグニを場からトラッシュに置く：対戦相手のエナゾーンから【マルチエナ】を持つカード1枚を対象とし、それをトラッシュに置く。」が target の `filter` 欠落で「対戦相手のエナを1枚トラッシュ」になっていた（WX04-068 と同型）。
- **修正:** JSON E1 の target に `filter:{keyword:"マルチエナ"}` を追加、`manualEffects.ts` に MANUAL 登録。BURST（カード1枚ドロー）は正しいため変更なし。
- 検証: `npm run typecheck` 通過、decompile 再生成で「対戦相手の【マルチエナ】を持つエナを1枚トラッシュに置く」表示を確認。

## WX04-071-E1「コストの合計が1以下の赤スペルをサーチ」の総コストフィルタ欠落（2026-06-22）

- **症状（ユーザー確認依頼）:** E1「あなたのデッキから**コストの合計が１以下の**赤のスペル１枚を探して…」のサーチ条件が「《赤》のスペル」のみで、総コスト1以下の絞り込みが抜けていた。
- **修正:** `TargetFilter` に `costMax?: number`（使用コスト合計＝《色×N》合計、コイン除外）を新設し、`execUtils.matchesFilter` に実装（`card.Cost` を正規表現で集計）。JSON E1 の filter に `costMax:1` を追加、`manualEffects.ts` に MANUAL 登録、decompile `filterJa` に「コストの合計がN以下の」描画を追加。
- 検証: `npm run typecheck` 通過、lint 0 errors、decompile 再生成で総コスト条件の表示を確認。`execSearch`→`matchesFilter` 経由で候補が正しく絞られる。

## WX04-068-E1「【マルチエナ】を持つエナをトラッシュ」の対象フィルタ欠落（2026-06-22）

- **症状（ユーザー確認依頼）:** E1「【出】手札を1枚捨てる：対戦相手のエナゾーンから【マルチエナ】を持つカード1枚を対象とし、それをトラッシュに置く。」が target の `filter` 欠落で「対戦相手のエナを1枚トラッシュ」になり、【マルチエナ】限定が抜けていた。
- **修正:** JSON E1 の target に `filter:{keyword:"マルチエナ"}` を追加、`manualEffects.ts` に MANUAL 登録。`execTrash`(ENERGY_CARD)→`energyCandidates`→`matchesFilter` の `keyword:'マルチエナ'`（印字「：【マルチエナ】」/自己 CONTINUOUS 付与ベース）判定で候補が絞られる。
- 検証: `npm run typecheck` 通過、decompile 再生成で「対戦相手の【マルチエナ】を持つエナを1枚トラッシュに置く」表示を確認。

## decompile: trash_self コスト表示の欠落を修正（WX04-066-E1 他）（2026-06-22）

- **症状（ユーザー確認依頼）:** WX04-066-E1「【起】《赤》《赤》このシグニを場からトラッシュに置く：…」の decompile 表示に「このシグニを場からトラッシュに置く」が出ず、他カードも `コスト:{"trash_self":true}` の生 JSON 表示になっていた。
- **原因:** `decompileEffects.ts` の `costJa` が `trash_self` を未対応だった（表示のみの問題。`trash_self` コスト自体は型・パーサ・`BattleScreen`(起動コスト処理) ともに実装済みで機能は正常）。
- **修正:** `costJa` に `trash_self → 'このシグニを場からトラッシュに置く'` を追加し、`docs/decompile_sheet1.txt` を再生成（UTF-8）。WX04-066/069/071/072/091/101・WX05-049/050・WX08-036・WX11-068/069/071 等が正しく表示されるようになった（併せて WX04-059/061/062/063/064 の既修正も反映）。

## WX04-064 ノー・ゲインを正しく実装（アーツ効果耐性＋一時GRANT_PROTECTION配線）（2026-06-22）

- **原文 E1:** 「このターンと対戦相手の次のターンの間、あなたのセンタールリグとあなたのシグニはアーツの効果を受けない。」
- **原文 BURST:** 「次のターンの間、対戦相手はアーツを使用できない。」
- **旧実装の問題:**
  1. E1 の `from` が `["ルリグ","アーツ"]`（「ルリグ」は誤付与。原文は「アーツの効果」のみ）。
  2. E1 の対象が「あなたのすべてのシグニ」のみで**センタールリグが抜けていた**。
  3. E1 の `duration` が `PERMANENT`（正しくは `UNTIL_OPP_TURN_END`＝このターン＋相手の次のターン）。
  4. そもそも**一時付与の GRANT_PROTECTION（ソース種別耐性）を読む箇所が無く、「アーツの効果を受けない」が機能していなかった**（保護キーワードは BANISH/BOUNCE/DOWN 専用しか参照されていなかった）。
  5. BURST の `actionId` が `'ARTS'` だが、アーツ使用ゲートは `isActionBlocked('USE_ARTS')` を見るため**キー不一致で封じが効いていなかった**。
- **修正:**
  - `effectEngine.collectEffectImmuneSigni`: `keyword_grants` / `keyword_grants_until_opp_turn` の `PROTECTION:<種別>:opponent` を読み、解決中アーツ等のソース種別が該当する場の自シグニ／センタールリグを免疫集合へ追加（既存の banish/bounce/down/trash/freeze/power 各保護パスへ union 済み）。これで**全ての一時 GRANT_PROTECTION（ソース種別耐性）が機能**するようになった。
  - `effectExecutor.execGrantProtection`: `UNTIL_OPP_TURN_END` のとき長期ストア `keyword_grants_until_opp_turn`（相手次ターン終了時にクリア）へ付与。`target.type:'LRIG'` をセンタールリグへの付与として処理。
  - `execDown`（LRIG 対象・相手効果）: `ctx.otherEffectImmuneNums` にセンタールリグがあればダウン無効。
  - JSON E1 を SEQUENCE[ GRANT_PROTECTION(シグニ全/アーツ/UNTIL_OPP_TURN_END), GRANT_PROTECTION(ルリグ/アーツ/UNTIL_OPP_TURN_END) ] に修正。BURST の `actionId` を `USE_ARTS` に修正。`manualEffects.ts` に E1・BURST を MANUAL 登録。
- 検証: `npm run typecheck` 通過、lint 0 errors。耐性失効タイミングは「自分の次ターン開始時＝相手の次ターン終了時」クリアで原文「このターンと対戦相手の次のターンの間」と一致。

## WX04-063 ゲット・ゲートを完全実装（支払ったエナの色でデッキサーチ）（2026-06-22）

- **原文:** 「このスペルの使用コストで支払われたエナ１つにつきそのエナの色１つを選択する。あなたのデッキから、選択した色の種類１つにつきその色を持つシグニ１枚を探して公開し手札に加え、デッキをシャッフルする。（無色は色に含まれない）」
- **旧実装の問題:**
  1. `COST_COLOR_SELECT` スタブが**コスト仕様**（《白×1》《無×2》）から色を推定し、無色枠を「全色ワイルド」にしていたため、実際に何色のエナで支払ったかに関わらず最大3色のシグニを取得できてしまっていた。
  2. JSON の action が `SEQUENCE[STUB, SEARCH(任意シグニ1枚)]` で、スタブ処理に加えて**末尾に無条件サーチ1枚**が付き、本来より1枚多く手札に加わっていた。
- **修正（実際に支払ったエナの色を追跡）:**
  - `PendingSpell.paid_energy_colors`（エナ1枚ごとの色配列。マルチエナ=全5色、無色=空配列）を追加し、`castSpell` で支払いエナから算出して記録。`handleCutinPass` で `ExecCtx.paidEnergyColorSets` に渡す。
  - `COST_COLOR_SELECT` スタブを全面改修：支払ったエナの色集合から二部マッチングで「同時に取れる色の種類」最大数を求め、`CHOOSE`（multiSelect・upTo・count=最大色数）で色を選ばせ、色ごとに「その色のシグニ1枚をデッキサーチ→公開→手札→シャッフル」を実行。無色エナは対象外。`paidEnergyColorSets` 未提供時（CPU/旧データ）はコスト仕様からの推定にフォールバック。
  - JSON action を `STUB` 単体に固定（末尾の余分な SEARCH を削除）、`manualEffects.ts` に MANUAL 登録。
- 検証: `npm run typecheck` 通過、lint 0 errors、`genStubsMd.mjs` 再生成。

## WX04-062-E1「＜アーム＞シグニをアップ」の対象フィルタ欠落（2026-06-22）

- **症状（ユーザー確認依頼）:** E1「【出】：あなたの＜アーム＞のシグニ１体を対象とし、それをアップする。」が target の `filter` 欠落で「あなたのシグニ1体をアップする」になり、＜アーム＞限定が抜けていた。
- **修正:** JSON E1 の target に `filter:{cardType:シグニ, cardClass:アーム}` を追加、`manualEffects.ts` に MANUAL 登録。`cardClass:アーム` は WX04-056 と同じ engine の `matchesFilter` 対応済みキー。
- 検証: `npm run typecheck` 通過。

## WX04-061-E2「シグニ位置入れ替え」の任意化＋decompile表記修正（2026-06-22）

- **症状（ユーザー確認依頼）:** E2「【出】：あなたのシグニ１体を対象とし、それとこのシグニの場所を入れ替えて**もよい**。」が `mandatory:true`・`optional` 欠落で、decompile も「このシグニと対象シグニの位置を入れ替える」と任意（してもよい）が反映されず、原文と少し違っていた。
- **修正:** JSON の E2 に `optional:true`・`mandatory:false`、`manualEffects.ts` に E2 を MANUAL 登録。decompile の `REARRANGE_SIGNI` swap 分岐を `${target}とこのシグニの場所を入れ替える（してもよい）` に修正。E1（迷宮があるかぎり基本パワー3000）は正しいため変更なし。
- **注:** `swap` 機構自体は `effectExecutor.execRearrangeSigni` で未対応（「シグニ並び替え（未対応の形式）」とログのみ）。今回は原文との表記差＝任意フラグのみ是正。swap 実機構は別課題。
- 検証: `npm run typecheck` 通過。

## WX04-059-E2「赤シグニがあるかぎり基本パワー8000」の発動条件欠落（2026-06-22）

- **症状（ユーザー確認依頼）:** E2「【常】：あなたの場に赤のシグニがあるかぎり、このシグニの基本パワーは8000になる。」が `activeCondition` 欠落で、条件「あなたの場に赤のシグニがあるかぎり、」の後が空（decompile でも条件のみ表示）になっていた。条件を無視して常時 8000 になっていた。
- **修正:** JSON の E2 に `activeCondition`（`HAS_CARD_IN_FIELD` / owner:self / filter:{cardType:シグニ, color:赤}）を追加。E1（赤シグニ全体に +2000）は元から正しいため変更なし。
- 検証: `HAS_CARD_IN_FIELD` は `effectEngine.ts` / `execUtils.ts` の `checkActiveCondition` で対応済み。JSON パース確認済み。

## WX04-058-E2「自分のシグニ再配置」の任意化（2026-06-22）

- **症状（ユーザー確認依頼）:** E2「【出】：あなたのすべてのシグニを好きなように配置し直して**もよい**」が `mandatory:true`・`optional` 欠落で、任意（してもよい）になっていなかった。
- **確認結果:** 再配置の本体（`REARRANGE_SIGNI` / `execRearrangeSigni` / `resumeRearrangeSigni` / 再配置モーダル）は WX04-041-E2 実装時から **owner:'self' にも対応済み**（owner で対象フィールドを切替）。不足は JSON の任意フラグのみ。
- **修正:** JSON に `optional:true`・`mandatory:false` を設定、`manualEffects.ts` に E2 を MANUAL 登録。E1（POWER_SET 基本パワー7000）は元から正しいため変更なし。
- 検証: owner:'self' の `REARRANGE_SIGNI` が pending（owner:self, optional:true）を返し、`resumeRearrangeSigni` で自分フィールドが並び替わることをテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。decompile「あなたのすべてのシグニを好きなように配置し直す（してもよい）」＝原文一致。

## WX04-056-E1「他の＜アーム＞ +2000」修正・effectEngine matchesFilter の cardClass 対応（2026-06-22）

- **症状（ユーザー報告）:** E1「【常】あなたの**他の＜アーム＞**のシグニのパワーを＋2000」が `POWER_MODIFY target {owner:'any', count:1}` という**全くの別物**（「自分または対戦相手のシグニ1体 +2000」）。
- **修正:**
  - JSON を `target {owner:'self', count:'ALL', filter:{cardType:シグニ, cardClass:'アーム', excludeSelf:true}}, delta:2000, excludeSelf:true` に修正。`manualEffects.ts` に MANUAL 登録。
  - **根本修正:** `effectEngine.ts` の `matchesFilter` が **`cardClass`/`cardClassExclude` を処理していなかった**（`story` のみ対応＝execUtils 版と非対称）。`cardClass` を追加し、CONTINUOUS パワー計算（calcFieldPowers）等でクラスフィルタが効くように。これがないと `cardClass:'アーム'` が無視され全シグニに +2000 されていた（テストで ウェポンが誤って+2000 を確認→修正後は他アームのみ）。
  - 検証: 自身アーム=+0、他アーム=+2000、ウェポン=+0 をテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。
- 補足: CONTINUOUS パワー系で従来クラス指定に `story` を使っていた（effectEngine matchesFilter が story のみ対応だった）のは、この非対称が原因。今後はクラスに `cardClass` を使える。

## 【マルチエナ】逆翻訳の一貫性（未登録19枚へ効果追加・パーサー修正）（2026-06-22）

- **症状（ユーザー指摘）:** WX04-054 など18枚は effects.json に【マルチエナ】効果を持ち逆翻訳に出るが、ガード・サーバント系の約19枚（WD01-016/017・WD04-016/017・WX01-051/100・WX02-077/078・WX10-097〜100・WXDi-D01-020/D03-020・WXK01-119〜122・WXK05-030）はテキストのみで逆翻訳に出ない不整合。WX04-054 が例外に見えた。
- **原因:** `parseSentencePart4` の【マルチエナ】判定が `RULE_REMINDER_TEXT`（no-op）で、かつ括弧の補足「【マルチエナ】（…）」にマッチしていなかった。機能面は `isMultiEna` の EffectText フォールバックで全カード正常だが、逆翻訳（effects.json直読み）に差が出ていた。
- **修正:**
  - パーサー: `parseSentencePart4` の【マルチエナ】を `GRANT_KEYWORD(マルチエナ, thisCardOnly)` に変更し、`（…）` 補足付きも許容。
  - 未登録19枚を `manualEffects.ts` に【マルチエナ】CONTINUOUS（`thisCardOnly`）として登録（runtime の `buildEffectsMap` は manualEffects を常にマージ）。
  - decompile（`decompileEffects.ts`）が `mergeManualEffects` をマージするよう変更し、逆翻訳が runtime と同じ effects を反映。
  - decompile の `GRANT_KEYWORD(thisCardOnly)` は「このシグニは【X】を持つ」。
  - 全マルチエナカードが逆翻訳で一貫表示。`npm run typecheck` 通過、`npm run verify` サマリー不変、`decompile_sheet1` 差分は当該行のみ（他カードへの波及なし）。

## WX04-054「サーバント X」E1フィルタ欠落・E2マルチエナ修正（2026-06-22）

- **症状（ユーザー報告）:** E1が「カード名に《サーバント》を含むあなたの他のシグニの」になっていない／E2が誤り。
  - **E1【常】**「カード名に《サーバント》を含む**他の**自シグニのパワー+3000」が、`filter:{cardType:シグニ}` のみで**全自シグニ +3000**（cardName/他の が欠落）。
  - **E2【常】**「【マルチエナ】」（このシグニ自身が持つ）が `GRANT_KEYWORD target count:1`（場の任意シグニに付与）で意味が誤り。
- **修正:**
  - E1: filter に `cardName:'サーバント'`、action/filter に `excludeSelf:true` を追加（`applyDeltaToState` は action.excludeSelf で効果元を除外、filterJa は filter.excludeSelf で「他の」を表示）。
  - E2: target を `filter:{thisCardOnly:true}` に（このシグニ自身の【マルチエナ】）。`isMultiEna` は `GRANT_KEYWORD マルチエナ` の `count!=='ALL'` で自身マルチエナを検出するため機能継続。decompile の `GRANT_KEYWORD(thisCardOnly)` を「このシグニは【X】を持つ」に改善。
  - E3（《サーバント》検索）はパーサー結果が正しいため変更なし。JSON＋`manualEffects.ts` に E1/E2 を MANUAL 登録。
  - 検証: 自身は+0、他《サーバント》は+3000、非サーバントは+0 をテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-052「堕落の虚無 パイモン」3効果の実装（チャーム盾ほか）（2026-06-22）

- **症状（ユーザー報告）:** 3効果すべて誤り。
  - **E1【常】**「＜悪魔＞シグニがバニッシュされる場合、代わりに付いている【チャーム】1枚をトラッシュしてもよい」（チャーム盾）が `CHARM_PROTECTION` STUB のみで**どのバニッシュ経路でも消費されず no-op**。
  - **E2【出】**「デッキトップを**このシグニ**の【チャーム】にしてもよい」が、`ATTACH_CHARM` の `to` が任意自シグニ（`toCands[0]`）で**このシグニを狙えず**、かつ「してもよい」（任意）未対応。
  - **BURST**「トラッシュから**＜悪魔＞の**シグニ1枚を手札へ」が ＜悪魔＞ フィルタ欠落。
- **修正:**
  - **E1（チャーム盾）:** `collectCharmShieldSigni`（effectEngine）を新設＝CONTINUOUS `CHARM_PROTECTION` の signiFilter に一致し**チャーム付き**のシグニ集合を返す。`ctx.charmShieldNums` 経由で **効果バニッシュ（execBanish applyBanish）**＝チャーム1枚トラッシュで場に残す、**バトルバニッシュ**＝`COOKING_BANISH_SUBSTITUTE` と同型の自動代替分岐を追加。BattleScreen ctx で両プレイヤー分を計算。
  - **E2:** `execAttachCharm` が `to.filter.thisCardOnly`（効果元シグニ自身）と `optional`（付ける/付けないの CHOOSE）に対応。
  - **BURST:** `TRANSFER_TO_HAND` の filter に `story:'悪魔'` を追加。
  - JSON＋`manualEffects.ts` に3効果を MANUAL 登録。decompile に `CHARM_PROTECTION`／`ATTACH_CHARM` の和文化を追加。
  - 検証: 効果バニッシュ／バトルでチャーム盾が発動（チャーム→トラッシュ・シグニ残存）、`collectCharmShieldSigni` が悪魔かつチャーム有のみ返す、`ATTACH_CHARM(thisCardOnly)` が効果元に付く、をテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-050-E1「めくれるまで公開→手札→残りデッキ下」の実装（REVEAL_UNTIL_TO_HAND）（2026-06-22）

- **症状（ユーザー報告）:** E1「【起】《ダウン》：デッキを上から＜美巧＞のシグニがめくれるまで公開→そのシグニを手札に加え、公開した他のカードをシャッフルしてデッキの一番下に置く」が誤実装。
- **原因:** `SEQUENCE[STUB:DECK_REVEAL_UNTIL_CLASS, TRANSFER_TO_DECK(self signi)]`。STUB は公開と `lastProcessedCards` 設定のみで**ヒットシグニを手札に加えず**、「残り」の行き先テキスト（"残り…"）にも一致しないため**公開カードがデッキから除去されたまま消失**。2ステップ目も誤パース。
- **修正:**
  - 新アクション `REVEAL_UNTIL_TO_HAND`（owner / revealClass / restDest）を追加。`execRevealUntilToHand`: デッキ上から `revealClass` のシグニがめくれるまで公開→**ヒットを手札へ**、公開した他のカードを `restDest`（`deck_bottom_shuffled` / `deck_bottom` / `trash`）へ。該当なしならデッキをシャッフル。
  - JSON を `REVEAL_UNTIL_TO_HAND(revealClass:'美巧', restDest:'deck_bottom_shuffled')` に修正、`manualEffects.ts` に MANUAL 登録。decompile に和文化追加。
  - 検証: 公開列 [電機,スペル,美巧,…] で美巧を手札へ・残り（電機/スペル）をデッキ下、未公開は先頭維持をテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-049-E1「基本レベルは2になる」の実装（SET_BASE_LEVEL）（2026-06-22）

- **症状（ユーザー報告）:** E1「【常】場に他の＜空獣＞か＜地獣＞があるかぎり、このシグニの基本レベルは2になる」が誤実装。パーサーが「基本レベルはNになる」を `BLOCK_ACTION(actionId:'SET_LEVEL_2')` に変換していたが、**エンジンで一切消費されず no-op**（基本レベルが実際に2にならない）。decompileも「『SET_LEVEL_2』ことができない」と誤表示。
- **修正:**
  - 新アクション `SET_BASE_LEVEL`（CONTINUOUS。target/value）を追加。
  - `applyContinuousBaseLevelOverride`（effectEngine）: 両プレイヤーの場のシグニを走査し、条件を満たす `SET_BASE_LEVEL` 効果元の **`cardMap` の Level を直接上書き**。これで `matchesFilter` のレベルフィルタ等、全レベル参照（レベル指定の除去/対象など）に自動反映。`applyDeclaredZoneClassOverride` と同じ cardMap オーバーライド方式（45箇所ある `fieldCandidates` への引数追加を回避）。
  - BattleScreen の全 `declaredCardMap` 生成箇所（8箇所＝効果解決/各インタラクション/スペル/カットイン）でチェーン適用。
  - **手札のシグニは上書き対象外**（場のシグニのみ走査）なので「場に出るまでレベル3」＝センタールリグLv2では場に出せない、という原文の挙動も維持。
  - JSON は `SET_BASE_LEVEL` に修正、`manualEffects.ts` に E1 を MANUAL 登録。decompile に `SET_BASE_LEVEL`／`POWER_DOUBLE_ALL`（E2）の和文化を追加。
  - 検証: 他＜地獣＞があると Level 3→2、無いと 3 のままをテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-047-E1 逆翻訳（DISCARD_OR_PENALTY）の正確化（2026-06-22）

- **症状（ユーザー報告）:** E1の逆翻訳が `[STUB:DISCARD_OR_PENALTY: …汎用説明]` で原文「あなたは手札から＜原子＞のシグニを1枚捨てないかぎり手札を2枚捨てる」を表していなかった。
- **修正（decompile表示のみ）:** `decompileEffects.ts` に出力ループでカード原文を `currentCardText` に保持する仕組みを追加し、STUB `DISCARD_OR_PENALTY` を原文から「＜クラス＞/種別を1枚捨てないかぎり手札をN枚捨てる」へ復元して和文化。エンジンの `DISCARD_OR_PENALTY` 実装（原文からクラス/枚数を読み CHOOSE を提示）は元から正しく、ロジック変更なし・JSON変更なし。
- 逆翻訳：「〈《ダウン》〉あなたのカードを2枚引く。そしてあなたは手札から＜原子＞のシグニを1枚捨てないかぎり手札を2枚捨てる」＝原文一致。

## WX04-046-E1 リムーブ封じ（SELF_SIGNI_TRASH）のUI enforcement（2026-06-22）

- **症状（ユーザー報告）:** E1「【常】対戦相手は、カードの効果を除き、自分で自分のシグニを場からトラッシュに置くことができない」が**リムーブボタンに反映されていない**。押すと普通にリムーブできてしまう。押下時に「効果でブロック中」と警告を出したい。
- **原因:** JSON は正しく `BLOCK_ACTION(actionId:'SELF_SIGNI_TRASH', target:opponent)` で、`calcContinuousBlockedActions` も相手フィールドの当効果を**影響を受ける側の `forSelf`** に入れていた（＝`isActionBlocked('SELF_SIGNI_TRASH')` は true になる）。しかし**リムーブボタン／`handleRemove` がこのブロックを参照していなかった**。
- **修正:**
  - リムーブボタン押下時に `isActionBlocked('SELF_SIGNI_TRASH')` をチェックし、ブロック中なら**警告モーダル**（「⚠ リムーブできません」）を表示してモーダルを開かない。`handleRemove` にも保険ガード追加。
  - 「カードの効果を除き」はルール処理のリムーブ（`handleRemove`）のみを塞ぐことで自然に満たす（カード効果のトラッシュは `execTrash` 等の別経路で影響なし）。
  - JSON 変更不要（効果定義は元から正しい。enforcement 漏れのみ）。decompile の `BLOCK_ACTION` 和文化を改善（`SELF_SIGNI_TRASH`→「カードの効果を除き、自分で自分のシグニを場からトラッシュに置く（リムーブ）」等）。
  - 検証: 相手が当カードを持つとき影響側の `forSelf` に `SELF_SIGNI_TRASH` が入ることをテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-043-E1「羅石 黒曜」コスト欠落・両者バニッシュ修正（2026-06-22）

- **症状（ユーザー報告）:** E1「【起】《赤》《赤》＜鉱石＞か＜宝石＞のシグニを合計3体場からトラッシュ：すべてのシグニをバニッシュする」で、①**コストの「＜鉱石＞／＜宝石＞3体トラッシュ」が欠落**、②「すべてのシグニ」（両者）が `owner:'any'` になっていた（`execBanish` は `'any'` を相手のみと解釈し、自分のシグニがバニッシュされない誤り）。
- **修正:**
  - コストに `fieldTrash: { count:3, filter:{cardType:シグニ, story:['鉱石','宝石']} }`（story配列＝OR、混在3体）を追加。
  - アクションを `SEQUENCE[BANISH self ALL, BANISH opponent ALL]` に変更（「すべてのシグニ」＝両者を確実にバニッシュ）。
  - decompile: `targetJa` の `owner:'any'` レンダリングを **count='ALL' のときは主語省略（「すべてのシグニ」）**、単体選択時のみ「自分または対戦相手の」に修正（先の owner:'any' 対応の副作用だった「自分または対戦相手のすべてのシグニ」を是正）。
  - JSON＋`manualEffects.ts` に MANUAL 登録。検証: 自分2体＋相手1体が全てエナへバニッシュされることをテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-041-E2「シグニ再配置」UIの実装（2026-06-22）

- **症状（ユーザー報告）:** WX04-041-E2「対戦相手のすべてのシグニを好きなように配置し直してもよい」の**再配置UIが未実装**。エンジンの `REARRANGE_SIGNI` は `done(addLog('…BattleScreen側で処理'))` のログのみで、BattleScreen に処理が存在せず**何も起きない no-op**だった。また `mandatory:true`（原文は「もよい」＝任意）。
- **修正:**
  - `PendingInteractionDef` に `REARRANGE_SIGNI`（owner / signiNums / optional）を追加。`RearrangeSigniAction.optional` を追加。
  - エンジン `execRearrangeSigni`（count:'ALL'、swap以外）: 対象オーナーのシグニを集めて配置選択の pending を返す（1体以下はスキップ）。`resumeRearrangeSigni`: `newArrangement[newZone]=instance id` を受け、**ゾーン状態（スタック/ダウン/凍結/チャーム/アクセ/ソウル/武装/ウィルス）ごと**新ゾーンへ並び替え（順列適用）。
  - BattleScreen: 各シグニにゾーン1/2/3を割り当てる**再配置モーダル**（新配置プレビュー付き）、確定/「配置し直さない」（optional）ハンドラ `handleRearrangeSigniConfirm`、CPU自動応答（現状維持で確定）。
  - JSON は `optional:true`/`mandatory:false` に修正、`manualEffects.ts` に MANUAL 登録。decompile の `REARRANGE_SIGNI` 和文化を「好きなように配置し直す（してもよい）」に改善。
  - 検証: 3体（A/B/C、Bダウン）を [C,A,B] へ並び替え→ゾーンとダウン状態が正しく追従することをテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-040「極壊 ハンマ」3効果修正・fieldTrashGroups コスト新設（2026-06-22）

- **症状（ユーザー報告）:** WX04-040 の効果が誤り。
  - **E1【常】**「場に＜ウェポン＞がある**かぎり**基本パワー15000」→ activeCondition 欠落で常時15000だった。
  - **E2【起】**コスト「＜アーム＞1体**と**＜ウェポン＞1体を場からトラッシュ」→ ＜ウェポン＞1体のみ（＜アーム＞欠落）。
  - **BURST**「手札から＜アーム＞1枚**と**＜ウェポン＞1枚を捨てる。そうした場合、相手シグニ1体を**手札に戻し**、相手シグニ1体を**バニッシュ**」→ 1枚捨て＋バニッシュのみ（バウンス欠落・組指定なし）。
- **修正:**
  - E1: `activeCondition: HAS_CARD_IN_FIELD(self, ＜ウェポン＞)` を追加。
  - E2: **`EffectCost.fieldTrashGroups`（異クラスの場シグニを組指定）を新設**。`{＜アーム＞×1, ＜ウェポン＞×1}`。支払可否（`fieldTrashGroupsAffordable`）と選択検証（`fieldTrashGroupsSatisfied`）を BattleScreen に追加し、【起】コストUIの選択肢・確定可否をグループ対応。支払い（ゾーントラッシュ）はグループ非依存のため既存処理を流用。
  - BURST: `CONDITIONAL(AND[手札に＜アーム＞≥1, 手札に＜ウェポン＞≥1]) → SEQUENCE[＜アーム＞捨て, ＜ウェポン＞捨て, 相手バウンス, 相手バニッシュ]`（コスト付きLIFE_BURSTは0件のためアクションで「捨てて、そうした場合」を表現）。
  - JSON＋`manualEffects.ts` に MANUAL 登録。`costJa` に `fieldTrashGroups` の和文化追加。`npm run typecheck` 通過、`npm run verify` で WX04-040 フラグなし・サマリー不変。decompile再生成で3効果とも原文一致。

## WX04-038「バイオレンス・スプラッシュ」E1の複雑効果実装・BURST修正（2026-06-22）

- **症状（ユーザー報告）:** E1が複雑効果で未実装、BURSTも原文と相違。
- **E1（スペル。このターン継続2効果）:**
  - 原文①「パワーが0以下のシグニがバニッシュされる場合、エナの代わりにトラッシュ」（**所有者問わず**）／②「あなたのシグニの効果で対戦相手のシグニのパワーが－される場合、代わりに2倍－される」。
  - 修正前は ①が `BANISH_REDIRECT`（owner:self・パワー条件なし＝「対戦相手シグニ全部トラッシュ」相当の誤り）、②が未実装 STUB（`DOUBLE_POWER_MINUS` はフィールド常在シグニ用でスペルでは無効）。
  - 実装: PlayerState に `power0_banish_to_trash` / `double_power_minus_this_turn`（このターン）を新設。
    - ①: STUB `BANISH_REDIRECT_POWER0_TRASH` でフラグ設定 → `checkPowerZeroBanish`（パワー0以下バニッシュ処理）で、いずれかのプレイヤーがこのフラグを持つときトラッシュへリダイレクト。
    - ②: STUB `DOUBLE_POWER_MINUS_THIS_TURN` でフラグ設定 → `calcFieldPowers` が CONTINUOUS 負デルタ（`hasDoublePowerMinus`）と一時 `temp_power_mods` 負デルタ（`applyTempMods` の `doubleNeg`）の両方を、相手がフラグ所持時に2倍。
    - **「あなたのシグニの効果で」の正確化（発生元種別を保持）:** `temp_power_mods`/`power_mods_until_opp_turn` に **`srcType`（発生元カードの Type 文字列：'シグニ'/'スペル'/'アーツ'/'ルリグ' 等）** を保持。汎用 `POWER_MODIFY` 経路（`execPowerModify`/`applyDirectAction`）が `ctx.sourceCardNum` の Type を `srcTypeOf()` で記録。`applyTempMods` は発生元がシグニ（レゾナ含む。未設定はシグニ扱い）のときのみ倍化。CONTINUOUS 側は発生元カード `topNum` がシグニのときのみ倍化（`dblOtherMult`）。スペル/アーツ/ルリグ由来は倍化しない。
      - **二値ではなく種別文字列で保持**したため、今後「アーツの効果で」「ルリグの効果で」「スペルの効果で」を参照する効果は `mod.srcType.includes('アーツ')` 等で判定できる（拡張性確保）。
    - 両フラグはターン終了時クリア（3箇所のリセット集約に追加）。
  - 検証: フラグ設定／相手シグニ -2000 が -4000（5000→1000）になることをテストで確認。
- **BURST:** 原文「トラッシュから**黒の**シグニ1枚を対象とし、**手札に加えるか場に出す**」に対し、修正前は黒フィルタ欠落＋手札固定。`CHOOSE`（手札に加える `TRANSFER_TO_HAND` ／場に出す `ADD_TO_FIELD`、ともに `filter:{cardType:シグニ,color:黒}`）に修正。場出しは [[（applyDirectAction の ADD_TO_FIELD 修正）]] によりゾーン選択＋トラッシュ除去。
- JSON と `manualEffects.ts` に MANUAL 登録。decompile の STUB 2種に和文化を追加（`[STUB:...]` ではなく原文相当の自然文）。`npm run typecheck` 通過、`npm run verify` で WX04-038 フラグなし・サマリー不変。

## POWER_MODIFY owner:'any'（「対象のシグニ」）の両フィールド対象選択を実装（2026-06-22）

- **症状（ユーザー報告）:** WX04-037-BURST「対象のシグニ1体のパワーを－10000」など、**owner:'any'（「対象のシグニ」＝自分・相手どちらも選べる）の対象選択UIが機能していない**。
- **根本原因:** `execPowerModify` と `applyDirectAction(POWER_MODIFY)` が `owner:'any'` を一律 `'self'` に潰しており、候補・選択スコープが**自分フィールドのみ**。相手シグニを選べず、相手シグニへの適用先も誤っていた（237カードが該当）。
- **修正:**
  - `TargetScope` に `'both_field'` を追加。
  - `execPowerModify`: `owner:'any'` のとき自分＋相手両フィールドから候補収集し `scope:'both_field'`。マイナス時は相手側の完全効果耐性シグニ（[[project_effect_system]] の `otherEffectImmuneNums`）を除外。`applyPowerMod` は対象ごとに所属フィールドを判定して該当プレイヤーへ適用。
  - `applyDirectAction(POWER_MODIFY)`: 選ばれたカードの所属フィールドを判定して該当プレイヤーへ適用（`duration` による `power_mods_until_opp_turn` も考慮）。
  - `selectOrInteract`: `both_field` でも**相手側候補にはシャドウ**を適用（自分側は常に選択可）。
  - BattleScreen 選択モーダル: `both_field` の説明文と、候補ごとに「自分の/相手の ゾーンN」を表示。
  - 検証: 最小状態テストで両フィールド候補（A自分/B相手）が出ること・相手B選択で otherState に -10000 が入ることを確認。`npm run typecheck` 通過。

## WX04-037「フィア＝リカブト」E2修正・decompile和文化の改善（2026-06-22）

- **症状（ユーザー報告）:** WX04-037 の逆翻訳が不正確。E1「FIELD数に応じて」が曖昧、E2が誤実装、BURSTのマイナス対象が自分/相手どちらか不明。
- **E2 のロジック修正（誤実装）:**
  - 原文「【自】あなたのターンの間、対戦相手のシグニ1体が場からトラッシュに置かれたとき、デッキの一番上をエナゾーンに置く」。
  - 修正前 JSON は `timing:ON_TRASH` のみ（triggerScope 既定=self）で**このカード自身がトラッシュされたとき**発火していた。
  - 修正: `triggerScope:'any_opp'` + `condition:IS_MY_TURN`。`collectTrashTriggers` に **any_opp 分岐**を新設（トラッシュされたカードの対戦相手フィールドを監視）。`IS_MY_TURN`/`IS_OPPONENT_TURN` は `evalCondition` では常時 true/false のため、watcher のターンを明示判定して発火を制御。
- **decompile（`decompileEffects.ts`）の和文化改善:**
  - `POWER_MODIFY_PER_FIELD` を専用ケース化 → 「対象のパワーを〈countOwner〉の場の〈countFilter〉シグニ1体につき±N」（E1: 「あなたの場の＜毒牙＞のシグニ1体につき－1000」）。
  - target の `owner:'any'` を「自分または対戦相手の」と明示（BURST のマイナス対象が両者対象だと分かる）。
  - any_opp/any スコープを ON_TRASH/ON_LEAVE_FIELD 等「このカード」始まりのトリガーにも主語反映（「対戦相手のシグニがトラッシュに置かれたとき」）。主語反映できた場合は冗長な `〔範囲:〕` マーカーを抑制。ターン条件（〜の間）は「場合、」を付けない。
- E1（`POWER_MODIFY_PER_FIELD`）・BURST（`owner:'any'` の -10000/-7000）の **JSON ロジック自体は正しい**ため、E2 のみ `manualEffects.ts` で上書き登録。`npm run typecheck` 通過、`npm run verify` で WX04-037 フラグなし・サマリー不変。

## WX04-036-E1「再誕」場出し・好きな数バニッシュ・同数探索の修正（2026-06-22）

- **症状（ユーザー報告）:** WX04-036-E1「あなたの＜美巧＞のシグニを**好きな数**対象としバニッシュ→デッキから**同じ枚数**の＜美巧＞シグニを探して**場に出す**」が誤実装。「場に出す」はプレイヤーがカード・ゾーンを選択できる必要がある。
- **根本原因（複数）:**
  1. バニッシュが固定1体（原文「好きな数」）、探索が固定最大1枚（原文「バニッシュした数と同じ枚数」）。
  2. `applyDirectAction` の `ADD_TO_FIELD` が**場に出すカードをデッキから除去していなかった**（`src` の trash/energy のみ対応）。デッキ探索→場出しでカードがデッキに残り、`SHUFFLE_DECK` 後に二重化（**66カードに潜在**）。
  3. `resumeSearch` が複数ピック時に最初のゾーン選択で残りカード配置・afterAction を**消失**させていた。
- **修正:**
  - `applyDirectAction` の `ADD_TO_FIELD`: cardNum をデッキ/手札/トラッシュ/エナのいずれかから除去してから配置（src 非依存）。
  - `PLACE_SIGNI_ON_FIELD` アクションを新設。`resumeSearch` は `then=ADD_TO_FIELD` のとき各カードのゾーン選択（`SELECT_SIGNI_ZONE`）を `continuation` で順次チェーンし、全配置後に afterAction（シャッフル）＋外側 continuation を実行。
  - `execBanish`: `count:'ALL' + upToCount` でプレイヤー選択UI（0〜全部）＋ `lastProcessedCards` 設定（`execTrash` と同じ慣例）。
  - `execSearch`: `maxCount` を `NumberOrRef` 化し `{$ref:'last_processed_count'}`（直前バニッシュ数=「同じ枚数」）を解決。0枚なら探索せず afterSearch のみ。
  - WX04-036-E1 を JSON と `manualEffects.ts` に MANUAL 登録。`npm run typecheck` 通過、`npm run verify` で WX04-036 フラグなし・サマリー不変。

## WX04-035「コンテンポラ」3効果の完全実装（2026-06-22）

- **症状:** WX04-035 の3効果がいずれも近似/誤実装だった。
  - **E1【常】**「あなたの＜美巧＞のシグニは対戦相手の、ルリグとシグニの効果を受けない」→ `GRANT_PROTECTION from=['ルリグ','シグニ']` は定義されていたが、ソース種別を見て遮断する消費側が無く、能力消失保護に部分的にしか効いていなかった（バニッシュ/バウンス/ダウン/トラッシュ/フリーズ/パワー-が素通り）。`subjectOwner` 欠落。
  - **E2【自】**「対戦相手の効果によっていずれかの領域からトラッシュに置かれたとき、《緑》を支払ってもよい。そうした場合、このシグニを手札に加える」→ `BOUNCE`（場のシグニを手札へ）＋誤った `CONDITIONAL(IS_MY_TURN)` で、トリガー原因（対戦相手効果）・領域（いずれか）・回収対象（このカード自身）がすべて不正確。
  - **BURST**「デッキトップ1枚をエナへ。その後エナに＜美巧＞シグニが5枚以上ならデッキトップ1枚をライフへ」→ 5枚以上条件が欠落し、無条件でライフ追加していた。
- **修正:**
  - **E1:** `collectEffectImmuneSigni`（effectEngine）を新設。解決中効果のソースカード種別（ルリグ/シグニ/スペル/アーツ）を判定し、`from`/`fromAll(+exceptSource)` が該当する場合のみ耐性シグニを返す。BattleScreen の ctx 構築で、バニッシュ/バウンス/ダウン/トラッシュ/能力消失/能力付与の各保護セットへ union し、`ctx.otherEffectImmuneNums` 経由で FREEZE・POWER_MODIFY(マイナス) からも除外。`subjectOwner:'self'` を付与。
  - **E2:** `SEQUENCE[OPTIONAL_COST(緑) → CONDITIONAL(PAID_ADDITIONAL_COST) → TRANSFER_TO_HAND(thisCardOnly)]` に変更。`execTransferToHand` が `thisCardOnly` を解釈し（トラッシュの効果元自身を即時回収）、`CardEffect.triggerCondition={byOpponentEffect,fromAnyZone}` を新設。ON_TRASH 収集で原因owner（=効果オーナー）と被トラッシュ所有者を比較して「対戦相手の効果によって」を判定、手札/エナ→トラッシュ検出（`collectAnyZoneTrashSelfTriggers`）で「いずれかの領域から」を補完。
  - **BURST:** `ENERGY_COUNT_FILTER` 条件（evalCondition）を新設し、エナチャージ後に `CONDITIONAL(エナの＜美巧＞シグニ≥5)` でライフ追加を包む。
  - 3効果は再生成耐性のため `manualEffects.ts`（MANUAL_EFFECTS）にも登録。`npm run typecheck` 通過、`npm run verify` で WX04-035 のフラグなし。

## デッキが0枚になってもリフレッシュが発動しない修正（2026-06-22）

- **症状（ユーザー報告）:** メインデッキが0枚になってもリフレッシュ（トラッシュをシャッフルして新デッキ化＋ライフ1枚トラッシュ）が発動しない。
- **根本原因:** リフレッシュ発動条件が「ドロー数がデッキ枚数を**超えた**とき（`canDraw < count`）」のみだった。①**ちょうど0枚**になるドロー、②**ミル/エナチャージ/ライフ送り等の効果**でデッキが尽きるケースでリフレッシュされなかった。さらに既存実装は「トラッシュ0枚でもライフをトラッシュへ」とルール違反（ルール：トラッシュが空ならリフレッシュ保留）。
- **修正（公式ルール準拠）:** リフレッシュ発動条件を「**デッキ0枚 かつ トラッシュ≥1枚**」に統一。
  - `drawCards`/`applyRefresh`（BattleScreen）: ドロー後に**デッキが0枚なら**リフレッシュ（トラッシュ空なら保留）。`refresh_count_this_turn` を加算。
  - エンジン `execDraw`: インラインのリフレッシュを廃止し、**効果解決後（`result.done`）に集約**（ルール：効果解決中はデッキ0のまま可能な限り解決し、その後リフレッシュ）。
  - エンジンに `applyRefreshOnDone(result, cardMap)` を新設し、解決完了時に両プレイヤーのデッキ0枚をリフレッシュ（`PREVENT_LIFE_REFRESH_TRASH` 対応）。BattleScreen の全効果解決出口（スタック処理／各 resume／スペル／スペルカットイン／ゾーン選択）で適用。
  - **ターンプレイヤーの1ターン2回目**のリフレッシュ時は既存 `forceEndTurn` 経路でターン終了（スタック処理経路）。`refresh_count_this_turn` はターン開始（UPフェイズ）でリセット。
- **検証:** typecheck 0エラー、eslint 新規エラーなし。**実機検証推奨**（デッキを引き切る／ミル効果でデッキを尽くす→リフレッシュ発動＆ライフ1枚減、2回目でターン終了）。
- **未対応（限定）:** 2回目リフレッシュ→ターン終了はスタック処理経路のみ確実（インタラクション解決経路で完了する効果での2回目は未連動の可能性）。「トラッシュ空で保留→トラッシュ補充時に発動」は次の効果解決時の集中チェックで自然に発動する近似。

---

## 【重大】オンライン対戦リロード時にカード未ロードで全シグニが「パワー0以下」誤バニッシュされる修正（v0.462, 2026-06-22）

- **症状（ユーザー報告）:** オンライン対戦中にページを閉じ→リロードで対戦復帰すると、「パワーが0になってバニッシュされた」というログと共に**盤面の全シグニが破壊**される。Supabase同期しているので本来起きないはずだった。
- **根本原因（ロード競合）:** リロード時 `App.tsx` の `init()` が PLAYING ルームを検出し**即座に** `setViewMode('BATTLE')`＋`setLoading(false)` で対戦画面へ復帰する。一方カードマスタ（`CardData_Sheet*.csv` + `effects_*.json`）は**別の useEffect で非同期fetch**され、初期値は空配列。回線/パース時間により、BattleScreen がマウントされ Supabase `battle_states` を購読して `bs` がセットされた時点でも `allCards`/`battleCards` がまだ空のことがある。→ `battleCardMap` が空 → パワー0以下自動バニッシュ（`checkAndBanishPowerZero`）で各シグニの `battleCardMap.get(topNum)?.Power` が `undefined` → `parseInt('0')=0` → **全シグニが `power<=0` と誤判定**され、バニッシュ結果が Supabase に書き込まれて盤面が恒久的に破壊される。
- **修正（二重防御）:** ①**App.tsx**: BATTLE のレンダリングを `battleCards.length === 0` でガードし、未ロード時は「対戦データを読み込み中…」表示に切替（カードデータが揃うまで BattleScreen をマウントせず battle_state 購読自体を始めない＝根本対処）。②**BattleScreen.tsx**: `checkAndBanishPowerZero` 冒頭に `if (battleCardMap.size === 0) return;`（破壊的書き込みの最後の砦）。実体は ref(7904) 経由で全呼び出し経路（自動useEffect 1890／CPU処理 7963・8012）が通るため1箇所で全経路を塞げる。
- **検証:** typecheck 0エラー。**実機検証推奨**（対戦中リロード→復帰で盤面が維持されること。低速回線/スロットリングで再現しやすい）。タイミング依存のため自動テスト困難。

---

## WX04-009（遊月・参戎）の【出】が「【マルチエナ】を持つカードを対戦相手が選ぶ」を無視して任意エナを自分が選ぶ修正（v0.461, 2026-06-22）

- **症状（WX04-009-E1 報告）:** 原文「【出】：**対戦相手は**自分のエナゾーンから**【マルチエナ】を持つ**カード１枚を対象とし、それをトラッシュに置く」に対し、JSON が `TRASH(ENERGY_CARD, owner:opponent, count:1)` のみで ①**【マルチエナ】フィルタが欠落**（任意の相手エナをトラッシュ可能）、②**選択者が効果使用側（自分）**（本来は対戦相手が自分のエナから選ぶ）。punish カードが「相手エナ1枚を自分が好きに割れる」別物になっていた。
- **修正:** ①`TargetFilter.keyword` を `matchesFilter`（execUtils.ts）で実装。マルチエナは印字ベース近似（EffectText の `：【マルチエナ】`＝サーバント等／自身のみへの CONTINUOUS GRANT_KEYWORD マルチエナ）で判定（フィールド全体への付与＝allMulti は対象外。`isMultiEna` のフィールド文脈なし版）。その他キーワードは EffectText の `【kw】`/`《kw》` 包含で判定。②`TrashAction.opponentSelects` を新設（既存 BanishAction と同パターン）。execTrash の ENERGY_CARD 分岐で `opponentSelects && owner==='opponent'` 時に `selectOrInteract(..., oppResponds=true)` で**対戦相手に選択を委ねる**。③effects_WX.json の WX04-009-E1 を `filter:{keyword:'マルチエナ'}` ＋ `opponentSelects:true`、parseStatus:MANUAL に修正。
- **逆翻訳器:** filterJa に `keyword`→「【kw】を持つ」、TRASH の who 判定に `opponentSelects`（エナ含む）→「（相手が選ぶ）」を追加。「対戦相手の【マルチエナ】を持つエナを1枚トラッシュに置く（相手が選ぶ）」と原文一致。
- **検証:** typecheck 0エラー、verifyEffects で WX04-009 は警告なし（既存無関係警告のみ）、decompile_sheet1.txt 再生成（差分は当該1行のみ）。**相手にマルチエナエナが無い場合は候補0で不発（正常）。実機検証推奨。**

---

## WX03-015（デス・コロッサオ）の条件欠落＆強制トラッシュを修正（0か全部＋レベル相異3体条件）（v0.460, 2026-06-21）

- **症状（WX03-015-E1 報告）:** 原文「あなたのすべてのシグニを場からトラッシュに置いて**もよい**。この方法で**それぞれがレベルの異なるシグニが3体**トラッシュに置かれた場合、対戦相手のすべてのシグニをバニッシュする」に対し、JSON が ①TRASH が**強制**（任意の「してもよい」無視）、②条件が `CONDITIONAL:IS_MY_TURN`（パーサの「そうした場合」プレースホルダ＝常にtrue）で**レベル相異3体の条件が完全欠落**。結果「全シグニ強制トラッシュ→無条件で相手全シグニバニッシュ」という別物だった。逆翻訳も「そうした場合」と誤表示。
- **ユーザー指摘:** 「すべてのシグニをトラッシュしてもよい」は**0か全部か**（部分選択不可）。→ `upToCount`（0〜全部の自由選択）では不正確。
- **条件機構の新設:** `Condition` に `TRASHED_DISTINCT_LEVELS_GTE { count }` を追加（types/effects.ts）。`evalCondition`（execUtils.ts）で **`lastProcessedCards` のシグニの相異なるレベル数 ≥ count** を判定（`LAST_PROCESSED_LEVEL_SUM_EQ` と同系統）。
- **0か全部の表現:** `SELECT_TARGET` の `optional` は0〜count の部分選択を許すため不適。**宣言的 `CHOOSE` アクション**（既存 execChoose）で2択化：「全シグニトラッシュ」=`SEQUENCE[TRASH(self ALL 強制), CONDITIONAL(TRASHED_DISTINCT_LEVELS_GTE 3)→BANISH(opp ALL)]` ／「トラッシュしない」=空SEQUENCE。yesオプション内にCONDITIONALを内包することで、execSequence がステップ間で `lastProcessedCards` を引き継ぎ条件判定が正しく動く（resumeChoose:3168 は option の lastProcessedCards を continuation へ渡さないため、continuation方式は不可）。parseStatus:MANUAL。
- **逆翻訳器:** condJa に `TRASHED_DISTINCT_LEVELS_GTE`、空SEQUENCE→「何もしない」を追加。「…全シグニをトラッシュに置く。そしてこの方法でそれぞれレベルの異なるシグニが3体トラッシュに置かれたなら、対戦相手のすべてのシグニをバニッシュする / 何もしない」と原文一致。
- **検証:** typecheck 0エラー、checkAllEffects 0エラー、decompile_sheet1.txt 再生成。**実機検証（0/全部の二択UI→3体相異レベル時のみ相手全バニッシュ）推奨。**

---

## STUB:CONDITIONAL_CARD_COST_BY_OPP_LRIG は実装済みと判明→「未実装」表示を是正（v0.459, 2026-06-21）

- **報告:** 逆翻訳で WX03-002/003/004/005/014（アーツ5枚）の `[STUB:CONDITIONAL_CARD_COST_BY_OPP_LRIG]`（相手センタールリグが指定色なら基本コストから《無×3》等が消える軽減）が未実装に見える、という指摘。
- **調査結果:** **コスト軽減自体は既に実装・配線済み**だった。アーツ/スペルの支払いは effect JSON の `cost.energy` ではなく **`card.Cost`（テキスト）→ `computeArtsEffectiveCost`**（BattleScreen.tsx:210）で計算され、その中の正規表現「対戦相手のセンタールリグが〜の場合、基本コストは〜になる」（:232）が **相手センタールリグ色（:10297 `op.field.lrig` の Color）と照合し軽減後コスト文字列を返す**。支払いUI（:10373 `rawEffectiveCost`→`parseGrowCost`→`totalReq`/`canAffordWithExtraCost`）が軽減後コストで必要エナ数を算定する。5枚すべてで正規表現マッチ＆軽減コスト算出を確認（白×2/赤×2/青×1/緑×1/黒×1）。
- **STUB の正体:** アクション SEQUENCE 内の STUB ステップは**支払い後**に実行され、`execStubPart2` のハンドラ（:3966）は**条件結果をログ出力するだけ**（実コスト変更はしない＝支払い時に済）。未処理STUBではなく、`done(addLog('[STUB:...]'))` の no-op でもなく、専用ハンドラ有りの「結果ログ専用」だった。
- **是正（表示・ログのみ。挙動は変更なし）:** ①`execStubPart2` のコメントを「支払い時 computeArtsEffectiveCost が適用済み」と明記し、ログを `基本コスト軽減：相手センタールリグが黒→コスト《白×2》（支払い時適用済み）` 等、実コスト込みに改善（軽減後コスト文字列も正規表現で取得）。②逆翻訳器（decompileEffects.ts）で本STUBを `[STUB:...]` ではなく「相手センタールリグ色が条件を満たす場合は基本コストを軽減（支払い時に自動適用）」と実挙動表示。③STUBS.md 説明を更新（コメント由来・再生成）。decompile_sheet1.txt 再生成。
- **注記:** CPU はアーツを使用しない（BattleScreen.tsx:7723）ため軽減対象は人間プレイヤーの支払い経路のみで完結。typecheck 0エラー。

---

## WX03-002（ホーリーアクト）が「＜天使＞**ではない**」を「＜天使＞**の**」と真逆対象に潰れる修正＋`cardClassExclude` フィルタ新設（v0.458, 2026-06-21）

- **症状（WX03-002-E1 報告）:** 原文「**＜天使＞ではない**対戦相手のシグニ1体を対象とし、それをトラッシュに置く」に対し、JSON が `filter:{story:"天使"}`（=**＜天使＞の**シグニ）と**意味が真逆**になっていた。クラス除外（NOT）を表現する仕組みが存在せず、パーサが肯定形に潰していた。
- **機構新設:** `TargetFilter.cardClassExclude?: string | string[]` を追加（types/effects.ts）。`matchesFilter`（execUtils.ts）で **CardClass（クラスオーバーライド考慮）に includes でマッチしたら対象から除外**。`cardClass`/`story` の肯定マッチと対になる否定フィルタ。
- **データ修正（durable・MANUAL）:** WX03-002-E1 の TRASH ターゲット filter を `story:"天使"` 削除→ `cardClassExclude:"天使"`。`parseStatus:MANUAL` で固定。
- **逆翻訳器:** `filterJa` に `cardClassExclude`（「＜X＞ではない」）を追加。逆翻訳が「対戦相手の＜天使＞ではないシグニ1体をトラッシュに置く」と原文一致に。
- **残（未修正・別系統）:** `STUB:CONDITIONAL_CARD_COST_BY_OPP_LRIG`（相手センタールリグが黒なら基本コストが《白×2》に軽減＝《無×3》が消える）は**未実装のまま**。現状コストは常に《白×2》《無×3》固定。同 STUB は WX03-003 等にも存在し、コスト動的変更機構として別途対応が必要。他シートの「＜X＞ではない/でない」系8枚（WX12-025/034/036・WX22-006・WXK05-005・WXK10-091・WXDi-P07-049・WX25-P3-015）は文脈が異なるため今回は未着手（`cardClassExclude` 流用で対応可能なものは将来）。
- **検証:** typecheck 0エラー、checkAllEffects 0エラー、decompile_sheet1.txt 再生成。**実機検証（対象が天使以外のみに絞られるか）推奨。**

---

## WX03-001（ウムル=フィーラ）【起】が「自分シグニを無条件バニッシュ」に潰れる修正＋「コストでトラッシュしたシグニと同レベル」機構を新設（v0.457, 2026-06-21）

- **症状（WX03-001-E1 報告）:** 【起】《黒》《黒》＜古代兵器＞のシグニ1体を場からトラッシュ：**この方法でトラッシュしたシグニと同じレベルのシグニ1体**をバニッシュ、という効果が、JSON 上 `BANISH target owner:"self"`（=**自分のシグニ**を対象）＋**レベル制約欠落**（無条件の任意シグニ）になっていた。逆翻訳も「あなたのシグニ1体をバニッシュする」と誤表示。
- **データ修正（durable・MANUAL）:** `effects_WX.json` WX03-001-E1 の `action.target.owner` を `self`→`any`（原文「シグニ1体」＝owner無制限）、`filter` に **`levelEqualsVar:"field_trash_level"`** を付与。`parseStatus:MANUAL` で固定（再生成保護）。コスト `fieldTrash {filter:{story:"古代兵器"}}` は既存どおり（story/cardClass どちらも CardClass を includes 判定するため適合）。
- **機構新設（既存 `levelEqualsVar` 動的フィルタ系統に追従）:** ①`PlayerState.last_field_trash_level` を新設（types/index.ts）。②`fieldTrash` コスト支払い時（BattleScreen）に**トラッシュしたシグニ最上段のレベル**を `last_field_trash_level` に記録。③`TargetFilter.levelEqualsVar` のユニオンに `'field_trash_level'` を追加（types/effects.ts）。④`execBanish` で `levelEqualsVar==='field_trash_level'` を `level: last_field_trash_level ?? -1` に解決（既存の `charm_trash_count` 分岐に並置）。
- **逆翻訳器:** `costJa` に `fieldTrash`（「場から〜シグニN体をトラッシュ」）、`filterJa` に `levelEqualsVar`/`levelEqDiscardLevelSum` の和文を追加。逆翻訳が原文一致（〈《黒×1》《黒×1》＋場から＜古代兵器＞のシグニ1体をトラッシュ〉この方法でトラッシュしたシグニと同じレベルのシグニ1体をバニッシュする）に。
- **検証:** typecheck 0エラー、checkAllEffects 0エラー、decompile_sheet1.txt 再生成。**実機検証（PvP/CPU・コスト支払いで level 記録→対象がレベル一致のみに絞られるか）推奨。** CPU AI のこの起動利用は未確認。

---

## 「このカードがデッキからトラッシュに置かれたとき」が ON_PLAY 誤判定→ON_TRASH 修正＋デッキミル ON_TRASH 発火（v0.456, 2026-06-21）

- **症状（WX02-073 報告）:** 【自】「このカードが**デッキからトラッシュに置かれたとき**、このカードをトラッシュから場に出してもよい」が **`timing:ON_PLAY`（場に出たとき）に誤判定**され、さらに action が任意トラッシュカード（`thisCardOnly` 欠落）・`mandatory:true`（「もよい」無視）だった。
- **timing 修正（parser）:** ON_TRASH の timing 正規表現が `(?:手札か?デッキから|…)` で**プレーンな「デッキから」にマッチしなかった**（「手札か」が必須化していた）。`(?:(?:手札か)?デッキから|場から|いずれかの領域から)` に修正（timing 判定とトリガー文ストリップの2か所）。**ON_TRASH の「〜してもよい」を任意トリガー（mandatory:false）**の対象に追加。
- **action 修正（parser）:** 自己蘇生ハンドラ（v0.455）の判定を「場に出**す**」限定から「場に出」に緩め、「場に出して（もよい）」も `thisCardOnly`＋asDown 付与の対象に。
- **engine（デッキミル ON_TRASH 発火）:** ON_TRASH は従来**フィールド→トラッシュ**（`detectTrashedSigni`）でしか収集されず、**デッキ→トラッシュ（ミル）では発火しなかった**。`detectDeckTrashed`（before.deck→after.trash を検出）＋`collectDeckTrashSelfTriggers`（カード自身・`triggerScope:self` のみ。場シグニ用 any_ally 等は除外）を新設し、stack 解決ループの ON_TRASH 検出に配線。
- **影響（素パース差分で隔離確認）:** Sheet1 で **5枚**変化（WX02-073・**WX10-092**＝同型の場出し自蘇生・WX04-035/WX04-102＝ON_TRASH の任意化・WX11-026-E1＝thisCardOnly 補完）。他帯の **WX13-038**（デッキトラッシュ時パワー-2000・mandatory 維持）も同 timing 修正で ON_TRASH に。対象5枚 JSON 再生成（WX11-026 は manualEffects 優先で無変化）。typecheck 0エラー。
- **残:** デッキミル ON_TRASH の発火は stack 解決ループ経由のミルが対象（コスト/特殊経路の網羅は将来）。自己蘇生の発動は v0.455 の trashActivated 実行経路（場に出す）に乗るため**実機検証（PvP/CPU）推奨**。

---

## トラッシュ自己起動【起】機構＋UI を新設（「このシグニをトラッシュから場に出す」）（v0.455, 2026-06-21）

- **症状（WX02-069/071 報告）:** 【起】《黒》《黒/無》「このシグニをトラッシュから場に出す（このシグニがトラッシュにある場合のみ使用可）」が、①データ上 `ADD_TO_FIELD source:TRASH_CARD count:1`（=**任意トラッシュカード**1枚／`thisCardOnly` 欠落）で、②そもそも**トラッシュから起動する機構が無かった**（`handActivated`＝手札自己起動は v0.373 で実装済だがトラッシュ版は未実装）。`ACTIVATED timing:MAIN`＝場のシグニ起動扱いだが本体は場に存在せず、起動UIに現れず発動不能だった。
- **データ修正（parser・durable）:** parseSentencePart1 の「このシグニをトラッシュから場に出す」ハンドラを「このシグニ/カード＋トラッシュから＋場に出す/シグニゾーンに出す」に一般化し **source に `thisCardOnly`＋「ダウン状態で」→`asDown`** を付与。effectParser に **`trashActivated` フラグ**（ACTIVATED かつ自己蘇生アクション時）を新設（`handActivated` と同様）。
- **engine:** `execAddToField` の TRASH_CARD 分岐に `thisCardOnly`＝効果元カード自身（`ctx.sourceCardNum` がトラッシュにあればそれのみ）を追加。effect_stack 解決時の ctx は `sourceCardNum=entry.cardNum`・場にいなくても無条件で解決されるため、トラッシュの自身を場へ移せる。
- **UI（BattleScreen / BoardComponents）:** `PlayerField` に `getTrashCardActions` を新設し、**トラッシュ ZoneCardModal のカードに発動ボタン**を表示（従来 getCardActions=undefined で何も出なかった）。`getMyTrashCardActions`＝自ターン MAIN・`trashActivated`・コストがエナのみ・使用回数/condition を満たすカードに「【起】トラッシュから出す」。`pendingTrashActivated` モーダルでエナ支払い→`executeTrashActivated`（エナをトラッシュへ・効果元はトラッシュに残し effect_stack に積む→`execAddToField` が場へ移動）。
- **対象データ再生成（14枚）:** WX02-069/071/WX07-033(E3・自蘇生 asDown)/WX11-049/WX17-049/WX19-029/WXK02-037/WXK11-071/WXDi-P03-087/P07-089/P09-045/P12-053/P16-082/CP01-050。素パース差分で Sheet1 影響4枚を隔離確認、全件「自己蘇生効果のみ」変化。逆翻訳器に「このシグニをトラッシュから場に出す」表示を追加。typecheck 0エラー。
- **MVP の範囲・残（TODO）:** UIで発動可能なのは**エナコストのみ・MAINフェイズ**の自己蘇生。手札捨て/コイン/エクシード/ウィルス除去/アタックフェイズ起動（WXDi系・WX11-049/WX19-029 等）のコストUIは未対応（データは正・UIゲートで非提示）。**CPU AI はトラッシュ起動を使わない**。**実機検証（PvP/CPU・ヘッドレス不可）が必要。**

---

## 「場のシグニN体につきデッキトップをエナに置く」が固定エナチャージに潰れる修正（v0.454, 2026-06-21）

- **症状:** 「あなたの場にある＜空獣＞と＜地獣＞と＜植物＞のシグニ１体につきあなたのデッキの一番上のカードをエナゾーンに置く」（WX02-066）が **固定 `ENERGY_CHARGE_FROM_DECK count:1`** に潰れていた。v0.453 のドロー版（DRAW_PER_FIELD_COUNT）と同型で、アクションがエナチャージ。
- **新アクション:** `ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT`（chargePerUnit/countFilter/countOwner/owner）を types/engine に新設。engine は対象シグニ数を数えて `ENERGY_CHARGE_FROM_DECK` を実行（`matchesFilter`＋`matchesStateFilter`＋`excludeSelf`＝効果元除外も評価）。
- **パーサー:** part3 の per-field ハンドラに「…シグニN体につきデッキの一番上のカードをエナゾーンに置く」分岐を追加（クラスOR＋ステート＋「他の」=excludeSelf 抽出を `buildCountFilter` に共通化）。part1 の **2か所**の汎用エナチャージ handler（デッキトップ→エナ）に「体につき」ガードを追加して part3 に委譲。
- **波及（WX06-020-E2）:** part1 の汎用キーワード付与（`を得る/を持つ`）が「**【ライフバースト】を持つ**他の＜植物＞のシグニ１体につき…」を**付与と誤認**して先取りしていた（per-field を止めた副作用で顕在化）。part1 キーワードブロックに per-field 構文（体につき＋引く/エナに置く）除外ガードを追加。WX06-020-E2 は `ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT`（story:植物＋excludeSelf）に。**近似:** 「【ライフバースト】を持つ」フィルタは省略（場の他の植物シグニ数でカウント）。
- **影響（素パース差分で隔離確認）:** Sheet1 で変化は **2枚のみ**（WX02-066 / WX06-020-E2）。対象2枚のみ JSON 再生成。逆翻訳器に `ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT` 表示を追加。typecheck 0エラー。

---

## 「場のシグニN体につきカードをM枚引く」が固定ドローに潰れる修正＋ステート/複数クラス対応（v0.453, 2026-06-21）

- **症状:** 「あなたの場にある＜電機＞と＜水獣＞のシグニ１体につきカードを１枚引く」（WX02-061）が **固定 `DRAW count:1`** に潰れていた（動的枚数＝場の対象シグニ数が欠落）。
- **原因①（先取り）:** parseSentencePart1 の汎用 DRAW ハンドラ `カードをN枚引く` が「N体につき」の前半を無視して先取りし、part3 の `DRAW_PER_FIELD_COUNT` ハンドラに到達していなかった。→ 「体につき」を含む場合は委譲するガードを追加。
- **原因②（複数クラス非対応）:** part3 の正規表現が単一クラス `(＜X＞の)?` のみで「＜電機＞と＜水獣＞の」（と/か連結）にマッチしなかった。→ クラス句を `(?:＜X＞[とか]?)+の` に一般化し `parseStoryFilter` で OR 抽出。
- **波及（WX09-Re01-E3）:** part1 ガードにより「対戦相手の凍結状態のシグニ１体につきカードを１枚引く」が一旦 UNKNOWN 化したため、part3 を更に一般化：「場にある」を任意化し、修飾句から**盤面ステート（凍結/ダウン/アップ/感染）**を抽出。**engine の `execDrawPerFieldCount` がカード属性フィルタしか見ず盤面ステートを無視していた**のを `matchesStateFilter`（effectEngine から export）併用に修正。WX09-Re01-E3 は `isFrozen` フィルタ＋countOwner:opponent で「対戦相手の凍結シグニ数だけドロー」に。
- **影響（素パース差分で隔離確認）:** Sheet1 で変化は **2枚のみ**（WX02-061 / WX09-Re01-E3）。対象2枚のみ JSON 再生成。逆翻訳器に `DRAW_PER_FIELD_COUNT` 表示を追加（生ID `[アクション:…]` を解消）。typecheck 0エラー。

---

## 逆翻訳器：CONTINUOUS POWER_SET の「このシグニ」表示と condition「他の」表示を改善（2026-06-21・ツールのみ）

- **背景:** WX02-052 が「間違っている」と報告されたが、**JSON データは正しく逆翻訳器の表示バグ**だった。原文「あなたの場に**他の**＜ウェポン＞のシグニがあるかぎり、**このシグニの基本パワー**は8000になる」に対し、逆翻訳が「＜ウェポン＞のシグニがいるかぎり…あなたのシグニ1体のパワーを8000にする」と表示し、「他の」と「このシグニ」が抜けていた。
- **データが正しい根拠:** ①condition は `HAS_CARD_IN_FIELD` に **`excludeSelf:true`** を持つ（＝「他の」）。②action は CONTINUOUS POWER_SET で `target:{owner:self,count:1}`。engine の `calcContinuousSigniMutations`（effectEngine.ts:975-982）は **`count!=='ALL'` を「このシグニのみ」** として効果元へ適用するため、ランタイム挙動は「このシグニの基本パワーを8000」で正しい。
- **修正（`scripts/decompileEffects.ts` のみ）:** ①`HAS_CARD_IN_FIELD` の condJa に `excludeSelf` → 「他の」表示を追加。②`actionJa` に effectType を渡し、**CONTINUOUS の POWER_SET で count≠ALL・owner self/any** のとき「このシグニの基本パワーを…にする」と表示（engine 挙動に一致）。
- **影響:** 逆翻訳の表示精度向上のみ（JSON/パーサー/engine 変更なし）。Sheet1 で「場に他の」72件・「このシグニの基本パワー」系（WX01-054/056/068 等の条件付き基本パワー族）が正しく表示。`docs/decompile_sheet1.txt` 再生成。typecheck 0エラー。

---

## キーワード付与の「あなたの＜クラス＞/色のシグニ」が owner:any＋フィルタ欠落に潰れる修正（v0.452, 2026-06-21）

- **症状:** 【ダブルクラッシュ】等のキーワード付与で、原文「あなたの＜鉱石＞か＜宝石＞のシグニ１体を対象とし…得る」が **`GRANT_KEYWORD target:{owner:'any', count:1}`（フィルタ無し）** に潰れていた（WX02-055-E1 で発覚）。`parseSentencePart1` の汎用キーワード付与ブロックが owner 判定に `t.includes('あなたのシグニ')` を使っており、「あなたの」と「シグニ」の間にクラス句/色句が挟まると外れて owner:any 既定にフォールバック、かつクラス/色フィルタも一切付与していなかった。**＝相手シグニにも付与可能・クラス無制限の誤り。**
- **修正（パーサー・durable）:** owner 判定を `あなたの(?:[白赤青緑黒]の|＜X＞か?)+の?シグニ` / `対戦相手の…` のクラス句・色句許容パターンに拡張。さらに単体シグニ付与に `parseStoryFilter`／`parseColorFilter`／`parseLevelFilter` を付与（フィルタが空でなければ `target.filter` に格納）。`story`/`color`/`level` はいずれも engine の `matchesFilter` が `CardClass.includes` 等で評価する既存経路。
- **影響（素パース差分で隔離確認）:** Sheet1 で本変更により変化するのは **4枚のみ** — `WX02-055`（鉱石/宝石/ウェポン・self）/ `WX04-069`（鉱石/宝石・self）/ `WX05-041`（空獣/地獣・self）/ `WX11-003-E1`（赤・self）。いずれも owner→self＋正しいフィルタへ是正。対象4枚のみ JSON 再生成（`regenCards.ts`、E2/E3 等への巻き込み無しを確認）。typecheck 0エラー。
- **残（他Sheet）:** 同型「あなたの＜クラス＞のシグニに【キーワード】を与える」は WX02〜以外にも存在しうる。パーサー修正は durable なので全再生成すれば是正されるが、全再生成は禁止のため逆翻訳スキャンで個別に拾って再生成する。

---

## Sheet1 逆翻訳照合（WX02-021〜040）一括修正＋動的数/条件/場全体付与の基盤追加（v0.442〜0.451, 2026-06-21）

`docs/decompile_sheet1.txt` を1枚ずつ原文照合し、パーサー/エンジン/逆翻訳器を横断修正。多くは**1枚の指摘から系統的に同型カードへ波及する基盤追加**。

- **WX02-021（v0.442）:** GRANT_PROTECTION「ルリグ以外からの効果を受けない」を `fromAll+exceptSource` で表現（意味が逆だった）。SEARCH→ADD_TO_FIELD の逆翻訳「場に出す」、BURST「センタールリグかシグニ1体」を `CENTER_LRIG_OR_SIGNI`（OR選択）に。
- **WX02-022（v0.443）:** ① CONTINUOUS の `activeCondition`「ライフクロスN枚以下」を `COUNT_THRESHOLD(life_cloth)` で新設（パターン追加・6効果に波及）。② **パワー合計上限つき複数選択バニッシュ**を新機能実装：`EffectTarget.totalPowerMax`＋SELECT_TARGET 拡張（`candidatePowers`）、execBanish/selectOrInteract/resumeSelectTarget で合計検証、BattleScreen UI（超過カード選択不可・合計表示・CPU貪欲選択）。同型4枚（WX05-002/WX07-026/WXEX2-38）。
- **WX02-025（v0.444）:** `BanishAction.opponentSelects`（「対戦相手は自分のシグニを選んでバニッシュ」=相手が選択）を新設し execBanish で `opponentResponds` に接続（同型5枚）。REVEAL_AND_PICK 逆翻訳の `remainder` 反映（「残りは戻す」固定→trash/deck-bottom/top を正しく描画、209枚に波及）。
- **WX02-027（v0.445）:** ① execTrash が `count:'ALL'+upToCount`（＝「好きな数」）を**自動全トラッシュ**にしていたのを選択式に。② **直前処理数の動的参照 `{$ref:'last_processed_count'}`** を新設（「トラッシュに置いたシグニ1体につき対戦相手のシグニ1体」）。execBanish で解決。同型 WD14-011 にも波及。
- **WX02-028（v0.446）:** スペルの**引用符形式ルリグ能力付与**「あなたのセンタールリグは『…』を得る」を `GRANT_LRIG_ABILITY` 化＋ parseSpellEffect でサブ能力パース（22枚）。タイミング「このルリグがアタックしたとき」→`ON_ATTACK_LRIG`。ADD_TO_LIFE も `last_processed_count` 対応。BURST 逆翻訳「その【出】能力は発動しない」。
- **WX02-029（v0.447）:** 逆翻訳 `costJa` の `handDiscardSigni` がクラス/storyを無視していたのを `filterJa` 経由に（「＜アーム・ウェポン＞のシグニ」、108枚に波及）。
- **WX02-034（v0.448）:** Condition **`ENERGY_HAS_COLOR`** 新設（「エナゾーンに赤と緑がある場合」）。「シグニ1体を対象とし、〈エナ色条件〉場合、それを除去」を CONDITIONAL で表現（対象=対戦相手・色フィルタ誤付与を除去）。evalCondition 両系統に評価追加。
- **WX02-037（v0.449）:** parseSingleSentence に「あなたの場に＜X＞のシグニがある場合、〜」→`CONDITIONAL(HAS_CARD_IN_FIELD)` を追加（2枚目ドローの条件欠落、17枚に波及）。
- **WX02-040（v0.450/0.451）:** GRANT_KEYWORD のクラスフィルタ＋ALL対象＋期間（ターン終了時まで/次のあなたのターン）をストリップ前に抽出。**QA準拠の「次の自分ターン中に存在する全シグニ（新規召喚含む）に継続付与」をエンジン実装**：PlayerState `field_keyword_grants_next_turn`/`_active`、execGrantKeyword で `duration:NEXT_TURN`＋自全シグニを場全体付与として予約、ターン遷移3パスで予約→active→クリア、hasKeyword/getSigniStatusKeywords に `fieldKeywords` 引数（ランサー判定・UIバッジ）。

- typecheck 0エラー・UNKNOWN 0件維持。`docs/decompile_sheet1.txt` 再生成済み。**続きの照合（WX02-041〜）は ymst が継続。**

---

## FREEZE の自動ダウンを廃止（凍結＝現状維持）＋ down フラグ新設（v0.433, 2026-06-20）

- **症状:** engine の `execFreeze`（単独 FREEZE 経路）が `signi_frozen` に加え **`signi_down` も常時立てて**おり、原文が純「凍結する」（「ダウン」記載なし）のカードまで誤ってダウンさせていた。WIXOSS の凍結は「次の自分のアップフェイズにアップしない」だけで**現在のアップ/ダウン状態は変えない**のが正。
- **修正（engine）:** `FreezeAction.down?: boolean` を新設。`execFreeze`／`applyDirectAction(FREEZE)` ともに **`down:true` のときだけダウンも行う**よう変更（既定は凍結のみ）。`applyDirectAction` 側は元々ダウンしておらず**経路間で挙動が食い違っていた**のも統一。
- **データ/パーサー:** 純「凍結する」は `FREEZE`（down 無し）＝ダウンしない。「ダウンし凍結」は同一対象に適用する **`FREEZE(down:true)`** をパーサーが生成（旧 `SEQUENCE[DOWN, FREEZE]` は選択対象が別々になりうる二重選択バグも併せて解消）。WX01-085 E1/BURST を `FREEZE(down:true)` に（manualEffects＋JSON）。
- **既存 JSON の `SEQUENCE[DOWN, FREEZE]`（「ダウンし凍結」）カードは無修正でも DOWN ステップでダウンするため壊れない**（純凍結だけがダウンしなくなる）。全体対象は元から正。
- **逆翻訳器:** `FREEZE` を `down:true` のとき「ダウンして凍結する」、それ以外「凍結する」と表示。
- typecheck 通過。（既存 JSON の `SEQUENCE[DOWN,FREEZE]` 二重選択は v0.434 で一括変換）

---

## 一時召喚「ターン終了時、それらを場からトラッシュに置く」が全シグニ BANISH（盤面全滅）に誤パース → TRASH_AT_TURN_END へ修正（v0.441, 2026-06-21）

- **症状（致命）:** 「デッキ/トラッシュから…シグニを場に出す。**ターン終了時、それら（=出したカード）を場からトラッシュに置く**」型の一時召喚で、2文目が **`BANISH SIGNI owner:any count:ALL`（両者の全シグニを即座にバニッシュ＝盤面全滅）** に誤パースされていた（単数「それを」は `BANISH any 1`）。parseSentencePart1 の `それ(ら)を場からトラッシュに置く`→BANISH ハンドラが原因。「それら＝直前に出したカード」「トラッシュに置く≠バニッシュ」「ターン終了時＝遅延」をすべて取り違えていた。
- **修正（パーサー・durable）:** `parseSingleSentence` の**プレフィックス除去前**に `^ターン終了時、それら?を(場から)?トラッシュに置く$` を検出し、専用 STUB **`TRASH_AT_TURN_END`** を発行（この STUB は元々 WX02-005 用に engine 実装済みだったが、パーサーが BANISH を吐いていたため未使用だった）。`lastProcessedCards`（直前に出したカード）を `turn_end_field_trash_targets` に登録し、ターン終了処理でトラッシュする既存機構に接続。
- **対象（13枚 / 同型15枚中）:** `WX02-005`/`WX03-047`/`WX13-002`/`WX13-009`/`WX13-017`/`WX13-023`/`WX16-Re20`/`WX20-001`/`WX20-048`/`WX20-Re20`/`WXDi-P03-034`/`WXDi-P13-042`/`WXDi-P15-046`（単数「それを」型＝旧 BANISH 1 も含め全て TRASH_AT_TURN_END へ）。
- **動作範囲:** **SEARCH 系配置**（WX02-005 等）は `resumeSearch` が `lastProcessedCards` を設定するため**ターン終了トラッシュまで完全動作**。**source 系配置**（トラッシュ/手札/エナから出す）は `execAddToField`/`resumeSelectSigniZone` が `lastProcessedCards` を設定しないため **TRASH_AT_TURN_END が空振り＝一時シグニが残る（過剰利益・非致命）**。core resume 関数の `lastProcessedCards` 変更は他カードの「そうした場合」conditional に波及するため見送り。**残課題:** source 系配置の placed カードを `lastProcessedCards` に通す（要慎重なスコープ）。typecheck 0エラー。

---

## 「ライフクロスがクラッシュされたとき」→ ON_LIFE_CRASHED 誤パース（ON_PLAY 化）を恒久修正＋usageLimit/thisCardOnly 補完（v0.440, 2026-06-21）

- **症状:** 【自】「あなたのライフクロス１枚がクラッシュされたとき、〜」が **timing 判定に無く ON_PLAY（場に出たとき）へ誤フォールバック**していた。TODO B節で「7枚を ON_LIFE_CRASHED に修正済」とあったが**JSON 直パッチのみで manualEffects 未登録**だったため、後の再生成で ON_PLAY に逆戻りしていた（WX02-003 で発覚）。
- **修正（パーサー・durable）:** `自` の timing 判定に **`対戦相手のライフ…クラッシュされたとき`→`ON_OPP_LIFE_CRASHED` / `(あなたの)ライフ…クラッシュされたとき`→`ON_LIFE_CRASHED`** を新設。トリガー文を除去し、ON_LIFE_CRASHED は `triggerScope:self`。「〜してもよい」は mandatory:false（任意化対象に ON_LIFE_CRASHED/ON_OPP_LIFE_CRASHED を追加）。
- **副次修正① usageLimit:** パーサーは従来 `《ターン１回》` 等を**一切解析しておらず**（usageLimit は manualEffects のみ）、ライフクラッシュ系が毎回多重発動しうる状態だった。**`《ターン１回》→once_per_turn` / `《ターン２回》→twice_per_turn` / `《ゲーム１回》→once_per_game`** を AUTO/ACTIVATED 全般で付与（CONTINUOUS 除外）。
- **副次修正② thisCardOnly:** 「このシグニをバニッシュする」が「自シグニ1体を任意選択」になっていたのを `thisCardOnly` に（WX14-CB05-E3）。
- **対象再生成（12枚）:** 単純系 `WX02-003`/`WX14-CB05`/`WX21-Re03`/`WXK03-014`/`WXK11-034`/`WD21-011`/`WXDi-P02-037`、parser 効果を含む `PR-426`(E2)、および manualEffects 定義が JSON に未反映で stale だった `WDK17-009`/`WXDi-P06-007`/`WXDi-P16-039`/`WX25-CP1-065` を JSON に反映。さらに usageLimit 追加で差分が出た本セッション既修正の `WXDi-P07-032`/`WX20-002`/`WX25-P1-034`/`WX24-P3-018`/`WX22-001` も再生成（usageLimit のみの差分を確認）。
- **注意（durable 性）:** usageLimit のパーサー化は**全再生成で多数のカードに once_per_turn 等が付与される**広域変更。現状はサージカル再生成のみのため影響は対象カードに限定。全再生成時は退化チェック推奨。typecheck 0エラー。

---

## WX02-002-E1「全領域のカードが【ライフバースト】【エナチャージ１】を持つ」の誤パース修正（v0.439, 2026-06-21）

- **症状:** 【常】「あなたのすべての領域にあるカードは【ライフバースト】【エナチャージ１】を持つ」が `SEQUENCE[GRANT_KEYWORD(ライフバースト→シグニ1体), GRANT_KEYWORD(エナチャージ１→シグニ1体)]` に誤パースされていた（全領域付与でなく「シグニ1体にキーワード付与」＝完全に別物）。本来はライフクロスを含む全領域のカードが追加の【ライフバースト】（効果＝【エナチャージ１】）を得て、クラッシュ時に発動する。
- **修正:** `manualEffects` に `WX02-002-E1` を `GRANT_ALL_ZONE_LIFEBURST`（既存機構）で定義。`burstAction:{ENERGY_CHARGE_FROM_DECK count1}`＝エナチャージ１。**`StubAction.burstAdditive` を新設**：従来の WD14-001/WX17-036 は「ネイティブ【ライフバースト】を持たないカードのみ」に付与だったが、WX02-002 は**既にバーストを持つカードにも追加**（両方を好きな順で使用可）。`BattleScreen` の `grantedBurstExtras` 判定を `burstAdditive || !cardHasNativeBurst` に拡張。
- 逆翻訳器も `GRANT_ALL_ZONE_LIFEBURST` の burstFilter/burstAction/burstAdditive を表示するよう強化。E2/E3（ライフクラッシュ）はパーサー版が正しいため据置（effectId 単位マージ）。typecheck 0エラー。

---

## ADD_TO_FIELD source 欠落族の残り（SEQUENCE/動的フィルタ/名指し/ベット/クラフト/leave）を一括修正（v0.438, 2026-06-21）

v0.435〜0.437 で単純系27効果を直したあとの「残り系統」（TODO の①〜⑥）をパーサー＋engine 改修＋対象カードのみ JSON 再生成（`scripts/regenCards.ts` 新設・全再生成は禁止のため）で durable 修正。**全て「bare ADD_TO_FIELD＝デッキトップ誤配置」を正しい source/cardName に。**

- **① エナ配置の SEQUENCE 形（11効果）:** `WX24-P2-007` / `WX24-P3-086` / `WX25-P3-098` / `WX25-CP1-005` / `WX26-CP1-086`(SONG) / `WXDi-P01-032` / `WXDi-P07-032` / `WXDi-P12-042` / `WXDi-CP02-087` / `WXK09-023` / `WXDi-P03-078`。パーサーは v0.435 で既に「エナゾーンから…場に出す」→source:ENERGY_CARD を生成済みだったが、SEQUENCE 先頭の当該効果は JSON が未再生成で bare のまま残っていた＝対象再生成で解消。`parseStoryFilter` に**重複除去**を追加（条件文＋フィルタ文で ＜ブルアカ＞ が2回出て story:["ブルアカ","ブルアカ"] になる WXDi-CP02-087 を是正）。
- **② 動的フィルタ手札配置＋timing 誤り（2効果）:** `WX11-035`（＜アーム＞が場を離れたとき）/ `WX16-025`（このシグニが場を離れたとき）。**`自`の timing 判定に「場を離れたとき」→`ON_LEAVE_FIELD` を新設**（従来は ON_PLAY 誤判定）。triggerScope/triggerFilter を抽出（「あなたの＜X＞のシグニが」→any_ally＋triggerFilter）。手札配置フィルタに動的 **`levelBelowLeftCard`**（既存）/**`powerBelowLeftCard`（新設）** を付与。`BattleScreen` の `resolveLeaveFieldDynamicFilters` に powerBelowLeftCard 解決（離れたカードのパワー-1）を追加。ON_LEAVE_FIELD/ON_REVEALED_FROM_HAND の「〜してもよい」は mandatory:false（任意トリガー）に。**ON_LEAVE_FIELD 基盤（収集・動的解決）は既存だが JSON で使うカードがゼロだった＝ここで初めて配線。**
- **③ 名指し手札配置（2効果）:** `WXDi-P05-068`（《大罠　ハーメルン》）/ `WX22-036`（《幻竜　ピュートン》）。手札配置ハンドラに **`parseNameFilter`** を追加（cardName フィルタ）。WX22-036 は **`ON_REVEALED_FROM_HAND` 検出を broaden**（「このカードが**＜龍獣＞のシグニの効果によって**手札から公開されたとき」も拾う）。
- **④ ベット/アンコール手札配置（2効果）:** `WXK07-105` / `WX19-017`。現行パーサーで既に正しく source:HAND_CARD を生成（コスト接頭辞後に手札ハンドラ発火）＝対象再生成のみで解消。
- **⑤ クラフト/トークン配置（cardName 機構・7効果）:** `WXDi-P13-062`(サーバントＺＥＲＯ) / `WXDi-CP02-028`(ペロロ人形) / `WXDi-CP02-029`(クルセイダーちゃん) / `WXDi-CP02-041`(雨雲号) / `WX25-CP1-066`(雷ちゃん) / `WX25-P1-034`(幻怪ヤミノザンシ・ON_LEAVE_FIELD) / `WX24-P3-018`(ママ勇者)。パーサーに**「クラフトの《X》…を場に出す」→ `ADD_TO_FIELD{cardName:X}`** ハンドラを新設。**`execAddToField` のトークン生成パスに CardName→CardNum 解決を追加**（InstanceMap は CardNum でカードデータを引くため、原文の《CardName》のままだと能力・パワーが付かない空トークンになっていた）。全角英数・表意空白を半角化して照合（原文《ＺＥＲＯ》とトークン名 "ZERO" の幅差を吸収）。対象トークンは全て battleCardNums にプリロード済み。
- **⑥ トラッシュ/その他（2効果）:** `WX20-002-E3`（エナから＜調理＞配置＝対象再生成で解消）/ `WX22-001-E1`（トラッシュから＜遊具＞2枚配置＝既に正）。`WX22-001-E3`（【起】「このアタックフェイズの間、＜遊具＞が場を離れたとき手札から配置」＝**付与型遅延 leave トリガー**）は機構未実装のため、**bare ADD_TO_FIELD のデッキトップ誤配置を避けて no-op STUB `GRANT_LEAVE_PLACE_PENDING` に**（忠実実装は将来課題）。

**残った近似（要追加実装）:** WXDi-CP02-087 のエナ枚数条件・WXDi-P03-078 の「このシグニよりパワー低い」（ON_TURN_END は動的フィルタ未解決）・WXDi-P05-068 先頭の「カードを2枚引き」（複数文の引き＋配置でドロー脱落）・WXK07-105 のベット条件分岐・WX25-CP1-066-E1 の「場に雷ちゃんがない場合」・WX22-001-E3 の付与型 leave トリガー。クラフトトークンの実機配置（cardName→token 解決）は**要実機検証**。typecheck は本変更による新規エラー 0（既存4件はpull由来）。

---

## 「手札からシグニを場に出す」が bare ADD_TO_FIELD でデッキトップを出していた修正（v0.437, 2026-06-20）

- **症状:** 原文「あなたの手札から[フィルタ]シグニを場に出す」が source 無しの bare `ADD_TO_FIELD` で、デッキトップを出していた（手札から選ばない誤り）。ena/レゾナ系（v0.435/0.436）と同根。
- **修正:** パーサーに「手札から…場に出す」→ `source:HAND_CARD`＋フィルタ（レベル/色/クラス、「Xではない」は `colorExclude`）の分岐を追加（durable）。
- **対象9効果（単純系のみ）:** `WXDi-P00-028-E1/E2`（＜バーチャル＞）/ `WXDi-P09-030-E1/E2` / `WXK08-059-E1`（レベル1＜電機＞）/ `WXDi-P03-071-E1`（赤＜宝石＞）/ `WXDi-P08-031-E1` / `WX20-034-CB-E1`（白以外L3以下＜遊具＞）/ `WX20-039-CB-E1`（赤以外L3以下＜遊具＞）。
- 逆翻訳器: `colorExclude` を「《X》以外の」表示。typecheck 通過。
- **残（要個別対応・bare ADD_TO_FIELD 同根の別系統）:** ①エナ配置の SEQUENCE 形（WX24-P2-007/WX25-P3-098 等・一部は「【出】能力発動しない」抑制や動的フィルタ併発）②動的フィルタ手札配置（WX11-035「より低いレベル」/WX16-025「よりパワー低い」＝timing 誤りも併発）③名指し手札配置（WXDi-P05-068《大罠ハーメルン》/WX22-036《幻竜》）④ベット/アンコール手札配置（WXK07-105/WX19-017）⑤クラフト/トークン配置（WXDi-CP02-028/029/041・WX25-CP1-066 等＝cardName 機構）⑥トラッシュ配置の一部（WX22-001-E3/WX20-002-E3）。

---

## 「ルリグデッキからレゾナを場に出す」が bare ADD_TO_FIELD でデッキトップを出していた修正（v0.436, 2026-06-20）

- **症状:** 原文「あなたのルリグデッキからレゾナ1枚を出現条件を無視して場に出す」が **source 無しの bare `ADD_TO_FIELD`** で、`execAddToField` がデッキトップを場に出していた（レゾナでなく無関係カードが出る誤り）。
- **修正:** 既存 STUB `SUMMON_RESONA_FROM_LRIG_DECK`（ルリグデッキからレゾナを選び出現条件無視で配置・クラスは EffectText から読む）に置換。パーサーにも「ルリグデッキから…レゾナ…場に出す」→ 当 STUB の分岐を追加（generic 場に出す より先・durable）。
- **対象9効果:** `WX10-040-E1` / `WX10-028-BURST` / `WX22-010-E1`（＜遊具＞）/ `WD23-001-E-E2`（＜水獣＞）/ `WX18-020-E3`（＜凶蟲＞）/ `WX19-028-E3`（＜空獣＞か＜地獣＞＝先頭クラスのみ近似）/ `WX16-Re18-E1`（2枚→1枚近似）/ `WX07-050-E1`（レベル3以下白→全クラス1枚近似）/ `WX13-007-E3`（好きな枚数→1枚近似）。
- typecheck 通過。**残（要個別精査）:** `WX20-069-E1`（複雑STUB内の「そうした場合」配置）/ `WD12-007-E1/E2`（timing 誤パース「場を離れたとき」＋重複）は構造が複雑なため未着手。レゾナ選択を1枚固定（候補先頭）・level/color 非対応の STUB 制約は将来拡張余地。

---

## 「エナゾーンからシグニを場に出す」が source 欠落でデッキトップを出していた修正（v0.435, 2026-06-20）

- **症状:** 原文「あなたのエナゾーンから[フィルタ]シグニを対象とし、それを場に出す」が、JSON で **source 無しの bare `ADD_TO_FIELD`** になっており、`execAddToField` の `!src` 分岐が**デッキトップを場に出して**いた（エナから選ばない・全く別のカードが出る誤り）。逆翻訳は「直前に選んだカードを場に出す」と表示されていた。
- **原因（パーサー）:** `parseSentencePart1.ts` の「エナゾーンから…場に出す」ハンドラが `{ ADD_TO_FIELD, owner:self }` のみを返し source を付けていなかった。→ トラッシュ版と同形に修正し `source:{ ENERGY_CARD, filter(レベル/色/クラス), count, upToCount }` を付与（durable）。
- **データ:** 同型**9効果**に `source` を付与: `WX01-099-E1`（逆出）/ `WX17-046-E1`（英知＝3）/ `WX20-068-E1`（英知＝7）/ `WXDi-P06-075-E1` / `WX24-P4-080-E1`（＜植物＞）/ `WX25-P1-094-E1`（緑）/ `WX25-P3-096-E1`（＜天使＞）/ `WXEX1-43-E1`（＜美巧＞）/ `WXEX2-45-E1`（＜遊具＞・レベル3以下）。
- typecheck 通過。**残（別系統・要個別精査）:** 他の bare `ADD_TO_FIELD`（ルリグデッキからレゾナを出現条件無視で場に出す＝WX10-040 等／トラッシュ・手札・トークン配置）は別機構で、デッキトップ誤配置の可能性があるため別途精査が必要。

---

## 既存「ダウンし凍結」82効果を FREEZE(down:true) に一括変換（v0.434, 2026-06-20）

- v0.433 でパーサーは新規分を `FREEZE(down:true)` に直したが、既存プリビルド JSON には旧 `SEQUENCE[DOWN(N), FREEZE(N)]`（同一対象だが**別々に選択でき、ダウン対象と凍結対象が一致しない**二重選択バグ）が残っていた。
- **隣接する `DOWN`→`FREEZE` で target が完全一致するペアを単一 `FREEZE(down:true)` に統合**するスクリプトを全シートに適用（**82効果**・WX04-046-BURST 等）。他ステップ（DRAW/TRASH 等）やネスト SEQUENCE は保持。
- **対象が異なるペアは変換しない**（例 WX08-027-BURST＝「すべてのシグニをダウン」＋「シグニ1体を凍結」は別物なので据置）。
- durable: パーサーが同形を生成するため再パースでも一致。typecheck 通過。

---

## LOOK_AND_REORDER の canTrash がUI未実装だったのを実装（v0.431, 2026-06-20）

- **症状:** `LOOK_AND_REORDER` の `canTrash:true`（「上からN枚見て**好きな枚数をトラッシュに置き**、残りを並べ替えて戻す」）が、**UI にトラッシュ選択が無く** resume 呼び出しも `trashed=[]` 固定だったため、**1枚もトラッシュできず全枚数を並べ替えて戻すだけ**の近似になっていた。データ（JSON）とエンジン（`resumeLookAndReorder` は `trashed[]` 対応済）は正しかった。**`canTrash:true` の全25効果**が該当（WX01-062 ゲット・オープン他）。
- **修正（`BattleScreen` UI のみ）:** LOOK_AND_REORDER モーダルに `inter.canTrash` 時のみ**各カードのトラッシュ・トグル**を追加（トラッシュ指定カードはグレー表示＋取り消し線＋↑↓無効）。確定時に `resumeLookAndReorder(order, 選択したトラッシュ集合, ...)` を渡すよう変更（`[]` 固定を撤廃）。`lookReorderTrash` state を新設しインタラクション切替/確定時にリセット。
- **CPU:** 自己解決は全カード保持（トラッシュ無し）の安全デフォルト（既存の `selected=[...inter.cards]` のまま、trashed は空）。
- typecheck 通過。エンジン・データ変更なし。

---

## 逆翻訳スキャン Sheet1：サーチ/デッキトップ配置の誤り修正（v0.430, 2026-06-20）

WX01-057（正＝条件付き任意配置）を基準に、Sheet1 のサーチ系/デッキトップ配置系4枚を修正。

- **デッキトップ配置の条件・任意欠落（WX01-057 と同型）:** **WX01-036**（カタパル）/ **WX01-059**（ボウ）。「デッキトップを見て、レベルN以下のシグニで他のシグニがない場合に出して**もよい**」が、`LOOK_AND_REORDER` の後に `ADD_TO_FIELD` を**無条件実行**＝条件（レベル／他シグニ無し）も任意（してもよい）も欠落していた。→ `CONDITIONAL{AND[DECK_TOP_MATCHES(シグニ,level), FIELD_COUNT self eq 1]}＋CHOOSE{出す/出さない}`。036 はレベル2以下、059 はレベル1（ちょうど）。
- **「〜以外」の除外が逆になっていた:** **WX01-037**（ヴァルキリー）。「《ヴァルキリー》**以外**のレベル3以下のシグニを探す」が `filter.cardName:'忘得ぬ幻想　ヴァルキリー'`（＝ヴァルキリー**を**探す）になっていた。→ `excludeCardName`（既存フィルタ・engine 対応済）に修正。
- **複数サーチの片方が欠落:** **WX01-038**（ゲット・ダンタリアン）。「白のシグニ1枚**と**赤のシグニ1枚を探す」が**白のみ**だった。→ `SEQUENCE[SEARCH(白), SEARCH(赤)]`（赤の後にシャッフル）。コスト《白×1》《赤×1》は実カード通りで正当。
- **WX01-058 はデータ正**（原文・JSON・コスト一致）。decompiler が SEARCH の「公開し」を表示していなかった**表示バグ**だった。
- **逆翻訳器:** SEARCH の `then` に REVEAL/ADD_TO_HAND があれば「公開し手札に加える」を反映、`excludeCardName` を「《名》以外の」と表示。
- すべて manualEffects＋JSON 両方に登録（durable）。typecheck 通過。

---

## WX01-033 E3 トラッシュ色フィルタ欠落修正（v0.429, 2026-06-20）

- **WX01-033（幻獣神オサキ）E3:** 「あなたのトラッシュからすべての**緑の**カードをデッキに加えてシャッフルする」が source の色フィルタ欠落で**全色を対象**にしていた（過剰）。→ `source.filter:{color:'緑'}` を付与（`execTransferToDeck` は `trashCandidates(state, src.filter)` で既にフィルタを尊重）。manualEffects＋JSON。
- 逆翻訳器: `TRANSFER_TO_DECK` の `shuffle:true` を「デッキに加えてシャッフルする」と表示するよう改善。typecheck 通過。

---

## WX01-033 オサキ「緑のスペル使用時」誤パース修正＋ON_SPELL_USE をシグニへ拡張（v0.428, 2026-06-20）

- **WX01-033（幻獣神オサキ）E1:** 原文「**あなたが緑のスペルを使用したとき**、デッキトップをエナゾーンに置く」が **timing `ON_PLAY`（場に出たとき）に誤パース**＋スペル色フィルタ欠落だった。→ `timing:['ON_SPELL_USE']`＋`triggerFilter:{color:'緑'}`。manualEffects＋JSON。
- **エンジン拡張（`BattleScreen.handleCutinPass`）:** `ON_SPELL_USE` の収集が**キャスターのセンタールリグのみ**だったため、シグニの ON_SPELL_USE（オサキ）が発火しなかった。→ 収集元を**ルリグ＋場のシグニ各ゾーンのトップ**に拡張し、`triggerFilter.color` があれば**使用スペルの色**（`battleCardMap.get(card_num).Color`）で絞るようにした。発火点は handleCutinPass のみ（CPU はカットインパスでここに合流）＝PvP/CPU 両対応。打ち消し経路 `handleCutinUse` はスペル不発のため ON_SPELL_USE を発火しない（正しい）。
- **逆翻訳器:** `ON_SPELL_USE`/`ON_GUARD` を timingJa に追加。`ON_SPELL_USE`＋`triggerFilter.color` を「あなたが緑のスペルを使用したとき」と表示。
- typecheck 通過。（E3 のトラッシュ色フィルタ欠落は v0.429 で修正。上の項を参照）

---

## 逆翻訳スキャン Sheet1：コスト軽減/条件欠落の系統修正（v0.427, 2026-06-20）

逆翻訳スキャンの継続。Sheet1 で5効果の誤りを発見・修正（すべて manualEffects＋JSON 両方＝durable）。

- **コスト軽減の color 文字列めり込みバグ（軽減が全く効かない・全シート走査で2件）:**
  - **WX01-031-E1**（青のスペル《無×1》減）/ **WX03-028-E1**（青のアーツ《無×1》減）の `COST_REDUCTION.reduction[0].color` が **`"無×1"`**（《無×1》の `×1` が色名にめり込み）になっており、`removeNColorFromCost` が `p.color === "無×1"` を実コストの `"無"` に一致できず**軽減が一切発動していなかった**。→ `color: "無", count: 1` に修正。`color: "青"`（スペル/アーツ色フィルタ）は正しかった。全シート走査で該当はこの2件のみ。
- **「対戦相手の手札が0枚の場合」を `IS_MY_TURN` 誤パース:** **WX01-032-E1**（ＳＮＡＴＣＨＥＲ）。スペルは自ターン使用＝常時 true で**常時1ドローの過剰**だった。→ `CONDITIONAL{HAND_COUNT opponent eq 0}`（TRASH 後に評価され「捨てて0枚なら引く」を正しく判定）。
- **「エナ10枚以上ある場合、追加で」条件欠落:** **WX01-034-E1**（修復）。2枚目の `ADD_TO_LIFE` が無条件＝常時2枚追加だった。→ `CONDITIONAL{ENERGY_COUNT self gte 10}` で2枚目をゲート。
- **activeCondition 欠落で常時化:** **WX03-028-E2**（ルリグデッキ0枚であるかぎり基本パワー18000）。条件欠落で常時18000だった。→ `COUNT_THRESHOLD{lrig_deck self eq 0}`。`getLocationCount` に `lrig_deck`/`lrig_trash` を追加（従来 default で0を返していた）。CONTINUOUS POWER_SET の `count:1 owner:self` は既存挙動で「このシグニのみ」に適用されるため target 変更は不要。
- typecheck 通過。

---

## WX01-030 BURST「そうした場合」誤パース修正（v0.425, 2026-06-20）

- **コストは正しい**（《赤》×3＝JSON 赤×3）。精査で BURST の致命バグを発見。
- **WX01-030 BURST:** 「あなたのライフを1枚トラッシュに置く。**そうした場合**、相手ライフを1枚クラッシュ」が「そうした場合」を `IS_MY_TURN` に誤パース。**バーストは相手ターンに発動するため `IS_MY_TURN` は常に false → 相手ライフクラッシュが永久不発**だった。→ `LIFE_CRASH self(triggerBurst:false＝トラッシュへ)` が `lastProcessedCards` を残し、相手 `LIFE_CRASH` を `conditional:true` でゲート。
- **`execLifeCrash` に `conditional` 対応＋`lastProcessedCards` 設定を追加**（「そうした場合」の連鎖用・再利用可能）。`LifeCrashAction.conditional` 新設。
- **E1:** keyword duration を PERMANENT→UNTIL_END_OF_TURN（「ターン終了時まで」）。
- 逆翻訳器: `LIFE_CRASH triggerBurst:false` を「トラッシュに置く（バースト不発）」、`conditional` を「（そうした場合）」と表示。typecheck 通過。

---

## WX01-029-E3「このシグニ」明示＋execGrantKeyword に thisCardOnly 対応（v0.423, 2026-06-20）

- **WX01-029 E3:** 「ターン終了時まで、**このシグニ**は【ダブルクラッシュ】を得る」が target `owner:self count:1`（フィルタ無し）＋keyword `duration:PERMANENT` で、任意自シグニ選択に見えた（runtime は no-filter 自動適用で実害は無かったが曖昧）。→ `thisCardOnly:true` で明示＋keyword duration を `UNTIL_END_OF_TURN` に。
- **`execGrantKeyword` に `thisCardOnly` 対応を追加**（候補を効果元のみに絞り、選択UIを出さず自動付与）。「このシグニは【X】を得る」系で再利用可能。typecheck 通過。

---

## WX01-029-E1「それ」の対象誤り修正（v0.422, 2026-06-20）

- **WX01-029（羅輝石アダマスフィア）E1:** 「あなたの赤のシグニがアタックしたとき、**それ**のパワーを+2000」が `POWER_MODIFY owner:any count:1`（＝任意シグニを自由選択・相手シグニも選べる誤り）だった。「それ」＝アタックした赤シグニなので `targetsTriggerSource:true`（トリガー元を自動対象）に修正。manualEffects＋JSON。
- 逆翻訳器にも `targetsTriggerSource` 表示（「それ（トリガー元シグニ）」）を追加。typecheck 通過。

---

## WX01-023 シグニ「トラッシュに置く」を BANISH 誤用→TRASH に修正（v0.419, 2026-06-20）

- **WX01-023（アーツ）:** 「対戦相手のエナ全てと対戦相手の全シグニを**トラッシュに置く**」が、シグニ側を `BANISH`（＝既定でエナゾーン行き）にしていた誤り。バニッシュではトラッシュに置かれない。→ `TRASH`（SIGNI opponent ALL＝場からトラッシュへ）に修正。manualEffects＋JSON。
- **⚠ 横展開の要監査（TODO 記録）:** 「シグニを**トラッシュに置く**」を `BANISH` にパースした誤りが他にも疑われる（粗スキャンで〜49件・誤検出多数）。要・効果単位の原文照合。再スキャン例: `BANISH(SIGNI,opponent)` かつ当該効果の原文が「…シグニ…をトラッシュに置く」（「バニッシュ」「デッキ」を含まない）。**バニッシュ＝エナ行き／トラッシュに置く＝トラッシュ行き**の区別は機能差が大きいため要対応。

---

## WX01-002-E1 条件欠落修正（v0.417, 2026-06-20）

- **WX01-002（コードアートＲＩＤＥ・ルリグ）E1:** 「あなたの場に**白と赤のシグニがあるかぎり**、あなたのシグニのパワー+3000」が **activeCondition 欠落で常時+3000** だった。→ `AND[HAS_CARD_IN_FIELD(self,色白), HAS_CARD_IN_FIELD(self,色赤)]` を付与。E2/E3 はパーサー生成を維持。manualEffects＋JSON。typecheck 通過。

---

## WD04-013/015/018 誤パース修正＋powerLteLastProcessed 新設（v0.416, 2026-06-20）

- **WD04-013 / WD04-015（シグニ）:** 「アタック時、このシグニのパワーが5000/3000以上の場合にエナチャージ」の **SELF_POWER_GTE 条件が欠落**し常時チャージだった。→ `condition: SELF_POWER_GTE` を付与。
- **WD04-018（スペル）:** 「アップシグニ1体をダウン→そのシグニのパワー以下の相手シグニ1体バニッシュ」が、①「そうした場合」を `IS_MY_TURN` に誤パース、②「そのシグニのパワー以下」フィルタ欠落（任意シグニをバニッシュできる過剰）だった。
  - **新フィルタ `TargetFilter.powerLteLastProcessed`:** パワーが `lastProcessedCards[0]` の実効パワー以下 → `resolveDynamicFilter` が `powerRange.max` に解決（`execBanish` に lastProcessedCards／effectivePowers を渡すよう拡張）。`resumeSelectTarget` は対象適用後 `lastProcessedCards=選択` を立てるため、`SEQUENCE[DOWN, BANISH{powerLteLastProcessed, conditional:true}]` で「ダウンしたそのシグニのパワー以下」を正しく解決し、`conditional` でダウン成立をゲート。
- 逆翻訳器にも `powerLteLastProcessed` 表示を追加。typecheck 通過、verify 安定。

---

## フラット化 CONTINUOUS BANISH 27件を manualEffects へ昇格＝durable 化（v0.415, 2026-06-20）

- **v0.414 の JSON 修正を manualEffects に昇格し再生成耐性を獲得。** 修正済みプリビルド JSON から27件の該当 effectId を抽出して `MANUAL_EFFECTS` に登録（`mergeManualEffects` が effectId 単位で上書き）。
- **検証:** `card.effects` 無し（＝パーサー再パース＋manualEffects マージ）経路でも有害な非optional CONTINUOUS BANISH が **0件**＝`build:effects` 全再生成しても上書きが効く。typecheck 通過、verify 安定。
- **補足修正:** WX21-052 の `selfTrashCost` は `EffectTarget` でなく `BanishAction` 直下のフラグだったため移動。

---

## 有害フラット化 CONTINUOUS BANISH 27件を一括本実装（v0.414, 2026-06-20）

- **TODO F の再発27件（非optional・mandatory:true・activeCondition無しの CONTINUOUS BANISH＝runtime で常時バニッシュ）をプリビルド JSON で一括修正。残存0件を確認。**
- **条件付き granted AUTO 型（中央/パワー/覚醒/血晶武装/手札捨て/楓/下カード 等）:** WX05-021・WX10-063・WXK07-044・PR-288・PR-426・WXDi-P07-060・WDK08-L11・WDK16-06H・WXDi-P05-034・WXK03-034・WXK03-056・WX20-Re18 を `ON_ATTACK_SIGNI`＋各 condition（SELF_POWER_GTE/THIS_CARD_IN_CENTER_ZONE/IS_SELF_AWAKENED/THIS_CARD_IS_ARMORED/TURN_HAND_DISCARD_GTE/LRIG_NAME_CONTAINS/THIS_CARD_HAS_UNDER 等）＋必要なら OPTIONAL_COST に。
- **機構型（既存エンジン機能で復元）:** アクセ＝GRANT_ACCE_HOST_ABILITY（WX16-045/WX18-076/WX20-072/SP27-015）／ソウル＝GRANT_SOUL_HOST_ABILITY（WXDi-D07-003/WXDi-P04-015）／上シグニ＝GRANT_SIGNI_ABOVE_ABILITY（WXDi-P15-061）／場全体＝GRANT_FIELD_SIGNI_ABILITY（WX13-034/WX21-052）／全領域LB＝GRANT_ALL_ZONE_LIFEBURST（WD14-001）／公開バニッシュ＝REVEAL_UNTIL_BANISH_SAME_LEVEL（WX17-038）／閾値書換＝BANISH_THRESHOLD_BOOST_7_15（WX09-027）。
- **その他:** WX25-P3-057（覚醒中ターン終了時の自己バニッシュ）／WX09-019（パワー18000以上でライフクラッシュ時2体）／WXDi-CP02-TK02A（バトルバニッシュ時＝ON_SIGNI_BATTLE）。
- **⚠ durable 化は未:** JSON 直接修正のため `build:effects` 全再生成で失われる。manualEffects 昇格 or parser 修正が次の課題（TODO F 参照）。verify 新規エラーなし（CONTINUOUS→AUTO 化に伴う timing 警告 +2 は軽微）。

---

## WD04-009 引用付与フラット化（有害 CONTINUOUS BANISH）修正＋再発の発見（v0.413, 2026-06-20）

- **WD04-009（幻獣セイリュ）:** 「場のシグニ3体が各15000以上のかぎり【ランサー】＋『【自】アタック時に相手シグニ1体バニッシュ』を得る」が、引用付与をフラット化し **CONTINUOUS BANISH opponent（条件・トリガー欠落＝常時バニッシュの有害誤り）** になっていた。→ E1=条件 `FIELD_SIGNI_POWER_COUNT(15000×3体)` 付きランサー付与／E2=同条件付き `ON_ATTACK_SIGNI` バニッシュ。manualEffects＋JSON。
- **⚠ 同型の再発を27件発見（TODO F に記録）:** 非optional・mandatory:true の CONTINUOUS BANISH がプリビルド JSON に27件残存＝**runtime で実際にバニッシュ適用＝有害**。`calcContinuousSigniMutations`→`removeFromField`。
- **🔑 パイプライン知見の確定:** runtime は `buildEffectsMap` が **`card.effects`（プリビルド JSON）を優先**し `mergeManualEffects` を重ねる＝**プリビルド JSON が runtime の真実源**。JSON 手パッチは効くが `build:effects` 全再生成で manualEffects 未登録分は消える。**durable 修正は manualEffects 登録が必須。**

---

## 「対戦相手の手札を見て選び」系を一括修正＋相手手札を見るUI（v0.412, 2026-06-20）

- **UI（全`opp_hand`選択を網羅）:** `SELECT_TARGET` の `targetScope==='opp_hand'` 選択モーダルで、**対戦相手の手札全体**を表示するよう拡張（候補のみ選択可・非候補はグレー＝0.4不透明）。「対戦相手の手札を見て…選び」で相手手札全体を実際に見て選べる。相手が選ぶ場合（opponentResponds）は相手が自分の手札を見るだけなので無害。
- **パーサー修正（durable・全件＆将来分）:** `parseSentencePart1.ts` の「対戦相手の手札を見てN枚選び（…捨てさせる）」「レベル指定」ハンドラが `actingPlayerSelects:true` を付けていなかった（→`execTrash` で `opponentResponds`＝相手が選ぶに取り違え）。3箇所に付与。
- **プリビルド JSON 一括パッチ（21件）:** 検証済み20カードの「見て…選び」効果（`count===1` の TRASH opp_hand のみ・whitelist effectId 内）に `actingPlayerSelects:true` を付与。混在分岐（WXDi-P13-049＝「対戦相手は3枚捨てる」count3 は据置／スペル分岐 count1 は付与、WXK09-039＝E1付与・BURST「対戦相手は捨てる」は据置）も `count===1` で正しく区別。
- **逆翻訳器:** TRASH 手札の選択者を明示（自分が見て選ぶ／見ないでランダム／相手が選ぶ）。
- 対象例: WX06-CB02/WX07-015/WX14-027/WX17-071/WX19-039/WXK03-001/WXK09-039/WXK10-026/WXK11-023/WDK16-05H/WXDi-P00-006/P03-025/P06-002/P07-025/P08-033/P08-036/P13-049/P14-045/P16-043/WX24-P4-040。typecheck 通過。

---

## WD03-011 手札捨ての選択者修正＋逆翻訳器に選択者表示（v0.411, 2026-06-20）

- **WD03-011（Ｓ・Ｍ・Ｐ）誤り修正:** 【出】「対戦相手の手札を見てレベル１のカード１枚を選び、捨てさせる」が `blind`/`actingPlayerSelects` 無し＝`execTrash` で `opponentResponds=true`（相手が選ぶ）になっていた。本来は「見て…選び」＝**自分が選ぶ**なので `actingPlayerSelects:true` を付与。manualEffects＋プリビルド JSON。
- **逆翻訳器の TRASH 表示強化:** 手札捨ての**選択者**を明示（`blind`→「（見ないでランダム）」／`actingPlayerSelects`→「（自分が見て選ぶ）」／それ以外の相手手札→「（相手が選ぶ）」）＋フィルタ（レベル等）を表示。これにより「誰が選ぶか」の取り違えがスキャンで一目で分かる。
- typecheck 通過。

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
