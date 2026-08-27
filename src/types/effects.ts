// ===== 基本列挙型 =====

export type EffectType =
  | 'ACTIVATED'   // 起動効果（プレイヤーが能動的に使う）
  | 'AUTO'        // 自動効果（条件を満たすと自動トリガー）
  | 'CONTINUOUS'  // 常時効果（フィールドにいる間適用）
  | 'LIFE_BURST'  // ライフバースト
  | 'TRAP_ICON'   // トラップアイコン（トラップが表向きになったとき発動）
  | 'SONG_ICON';  // 歌のカケラ（対応するルリグが発動するとき実行）

export type EffectTiming =
  | 'MAIN'            // メインフェイズ
  | 'ATTACK'          // アタックフェイズ全般
  | 'ATTACK_ARTS'     // アーツステップ（手札起動型シグニ等で使用）
  | 'SPELL_CUTIN'     // スペルカットイン
  | 'ON_PLAY'         // 出効果（場に出たとき）
  | 'ON_BLOOM'        // このシグニが開花したとき／あなたの他のシグニが開花したとき（【シード】の開花。場に出た扱いではないため ON_PLAY とは別）
  | 'ON_LIFE_BURST'   // ライフバースト発動時
  | 'ON_TRAP_ACTIVATE' // トラップアイコン発動時
  | 'ON_TRAP_SET'      // あなたの【トラップ】が設置されたとき
  | 'ON_SONG_ACTIVATE' // 歌のカケラ発動時
  | 'ON_BANISH'       // このカードがバニッシュされたとき
  | 'ON_TRASH'        // このカードがトラッシュに置かれたとき
  | 'ON_ATTACK_SIGNI' // シグニアタックフェイズ（このシグニがアタックしたとき）
  | 'ON_ATTACK_LRIG'  // ルリグアタックフェイズ
  | 'ON_TURN_START'    // ターン開始時
  | 'ON_TURN_END'      // ターン終了時
  | 'ON_DRAW'          // あなたがカードを引いたとき（G089）
  | 'ON_OPP_ARTS_USE'  // 相手がアーツを使用したとき（自分フィールドのシグニがトリガー）
  | 'ON_ARTS_USE'      // あなたがアーツを使用したとき（使用者自身のルリグ/シグニがトリガー。ON_SPELL_USE のアーツ版。collectArtsUseTriggers で配線）
  | 'ON_RISE'          // このシグニがライズされたとき（ライズ配置時にライズされたシグニ自身がトリガー。handleSummonSigni で配線）
  | 'ON_REVEALED_FROM_HAND' // このカードが効果によって手札から公開されたとき
  | 'ON_SELF_REVEAL_FROM_HAND' // あなたが自分の効果によって手札からカードを公開したとき（場のシグニが反応。G198）
  | 'ON_ENERGY_FROM_TRASH' // このカードがトラッシュからエナゾーンに置かれたとき
  | 'ON_BLOOD_CRYSTAL_ARMOR' // シグニが血晶武装状態になったとき
  | 'ON_HEAVEN'  // このシグニが《ヘブン》したとき（ヘブンヘブン時）
  | 'ON_ACCE'    // シグニにアクセが付いたとき
  | 'ON_SIGNI_DOWN'             // シグニがダウン状態になったとき（WX05-040/WX14-CB01/WXEX1-42/WXEX2-01/WXK11-015/SPDi43-17〜19）。triggerScope self/any_ally/any・triggerFilter（story/excludeSelf/cardName）・triggerCondition.byEffect（「効果によって」＝アタック/コストのダウンでは発火しない）/duringAttackPhase。engine 配線＝中央diff（効果ダウン）＋performSigniAttack（アタックダウン）＋checkAndApplyContMutations（常時効果ダウン/フリーズ）
  | 'ON_SIGNI_BECOMES_UP'       // シグニ（かセンタールリグ）がアップ状態になったとき（WX12-006/WX20-051）。triggerCondition.upIncludesLrig=センタールリグのアップにも反応（WX20-051）。engine 配線＝中央diff（効果アップのみ＝アップフェイズの一斉アップでは発火しない近似）
  | 'ON_SIGNI_BECOMES_DRIVE'    // あなたのシグニがドライブ状態になったとき（ルリグがライドした瞬間。WXK01-076/079・WDK01-014/017）。drive_became_just フラグ＋BattleScreen watcher で発火
  | 'ON_BECOME_BEAT'            // このカード／あなたの他のカードが【ビート】になったとき（WXK08-045/070/074/077・WXK10-069・WDK14-014/015/017）。beat_became_just フラグ＋BattleScreen watcher で発火。self=なったカード自身（beat_zone在中）／any_ally=場の他カード
  | 'ON_SIGNI_ENTERS'           // シグニが場に出たとき
  | 'ON_TARGETED'               // このシグニが対戦相手の能力か効果の対象になったとき（WXDi-P11-040/WX25-P2-055/WX25-CP1-060）。engine配線済（C1・2026-06-29）＝BattleScreen handleEffectInteraction の SELECT_TARGET 確定経路で collectTargetedTriggers が発火。⚠forced単一対象（pending無しで自動解決）経路は未カバー＝follow-up
  | 'ON_DECK_SHUFFLED'          // あなたのデッキがシャッフルされたとき（PR-470A）。⚠engine未配線（shuffle() がリフレッシュ/サーチ後等多数箇所に分散＝decompiler engineUnwiredTimings に登録済み）
  | 'ON_KEYWORD_GAINED'         // あなたの他のシグニが【アサシン】【ランサー】【ダブルクラッシュ】を得たとき（WXDi-P04-035）。⚠engine未配線（「その能力を得る」動的注入＋任意コストで配線が重い＝decompiler engineUnwiredTimings に登録済み）
  | 'ON_LRIG_UNDER_MOVED'       // あなたのルリグの下からカードが移動したとき（WXDi-P04-042）。⚠engine未配線（ルリグ下スタックの set-diff 配線が要・発火が稀＝decompiler engineUnwiredTimings に登録済み）
  | 'ON_LRIG_ATTACK_STEP_START' // あなたのルリグアタックステップ開始時（WX25-CP1-042-E2）。engine配線済（C1・2026-06-29）＝doPhaseAdvance の ATTACK_SIGNI→ATTACK_LRIG 移行で collectTurnTriggers が発火。アクションはパース済み近似（クラッシュ数カウント非依存の固定SEQUENCE）。⚠人間ターンのみ・CPUターンは未配線＝実機未検証(C2)
  | 'ON_LRIG_GROW'              // あなた/対戦相手のルリグがグロウしたとき（WXDi-P05-010 等）。triggerScope any_ally/any_opp・excludeSelf で主語を表現。engine配線済（C1・2026-06-29）＝executeGrow（人間・ゲットグロウ含む）/CPUセンターグロウで collectLrigGrowTriggers が発火。⚠アシストグロウ経路は未配線（センターグロウのみ）＝実機未検証(C2)
  | 'ON_COIN_PAID'              // あなたが《コイン》を1枚以上支払ったとき（WXDi-P15-055/069・WXDi-P16-057）。engine配線済（C1・2026-06-29）＝コイン支払の**全サイト**（グロウ人間/CPU・シグニ【起】・キープレイ・シグニ【出】・アーツ ベット/アンコール・**スペルカットインのベット**〔タスク12(lxxxiv)〕・**スペル本体のベット**〔タスク12(lxxxvi)・ベット持ちスペル7枚〕）で collectCoinPaidTriggers が発火＝2026-08-03 に穴なし。⚠スペル本体のベットだけは `pending_spell` 待ちの間にスタックへ積む＝「支払い→トリガー解決→カットイン窓→スペル解決」の順になる想定（実機未検証(C2)）
  | 'ON_LRIG_FLIP'              // 両面ルリグが反対面になったとき
  | 'ON_MATERIAL_USED'          // 《改造素材》が使用されたとき（WXK09-047/048/049/077/084・WXK10-050）。triggerScope self/any_ally・excludeSelf・triggerCondition.materialUsedByPlayer で「このシグニに/他のシグニに/あなたが」を区別。⚠engine未配線＝**基盤が未実装でブロック中**（2026-06-29調査確定）：(1)『アーツ/クラフト』型(WXK09-TK-01A 改造素材)のプレイハンドラが BattleScreen に無い→そもそも使用不可、(2)トークンの3択アクションが DO_THREE_THINGS 無対応分岐=no-op、(3)使用された対象シグニの捕捉経路が無い。完全配線は (1)(2) 実装が前提。詳細は TODO §4「改造素材機構」。
  | 'ON_SIGNI_BANISH_OPPONENT_BY_EFFECT' // あなたの〔X〕のシグニが効果によって対戦相手のシグニをバニッシュしたとき（WX07-036）。triggerScope any_ally・triggerFilter で主語を表現。既存 ON_SIGNI_BANISH_OPPONENT（バトル経路のみ配線）と別＝効果バニッシュ経路。⚠engine未配線（効果バニッシュの発生源追跡が未実装＝decompiler engineUnwiredTimings に登録済み）
  | 'ON_ALLY_PLAY_OR_OPP_HAND_DISCARD' // あなたの他の〔X〕のシグニが場に出るか、あなたの効果によって対戦相手が手札を捨てたとき（WXDi-P11-064）＝複合ORトリガー。triggerFilter で「他の＜天使＞の」主語を表現。⚠engine未配線（OR複合トリガーの機構が未実装＝decompiler engineUnwiredTimings に登録済み）
  | 'ON_SIGNI_BANISH_OPPONENT'  // 相手シグニをバニッシュしたとき
  | 'ON_SIGNI_BANISH_BATTLE'    // バトルで相手シグニをバニッシュしたとき
  | 'ON_SIGNI_BATTLE'           // このシグニがシグニ1体とバトルしたとき（攻撃側・防御側の両参加シグニで発火）
  | 'ON_SIGNI_DAMAGE'           // このシグニが対戦相手にダメージを与えたとき（正面空きでライフをクラッシュしたとき）
  | 'ON_SIGNI_POWER_ZERO_OR_LESS' // シグニのパワーが0以下になったとき
  | 'ON_SIGNI_FROZEN'           // シグニが凍結状態になったとき（signi_frozen の false→true を効果解決の set-diff で検出。WX08-039/WXEX2-02/WXDi-P04-065）
  | 'ON_CHARM_TO_TRASH'         // 【チャーム】1枚が場からいずれかのトラッシュに置かれたとき（signi_charms の set-diff で検出。WX16-Re05。triggerScope any/any_ally/any_opp）
  | 'ON_COIN_GAINED'            // いずれかのプレイヤーが《コインアイコン》を得たとき（SP27-007）＝既存 ON_COIN_PAID の**逆方向**。coins の増加を、効果解決の中央 diff とグロウ/アシストの各獲得サイトで検出。triggerScope any（あなたか対戦相手）/self（あなただけ）/any_opp（対戦相手だけ）
  | 'ON_ATTACK_PHASE_END'       // あなたのアタックフェイズ終了時（§6.3 J-4・WX24-P2-075）＝`ATTACK_LRIG→END` の遷移で発火（既存 `ON_LRIG_ATTACK_STEP_START` が `ATTACK_SIGNI→ATTACK_LRIG` で発火するのと同じ場所）。人間 `doPhaseAdvance` と CPU 経路の両方に配線
  | 'ON_ATTACK_END'             // このシグニがアタックしたアタック終了時（§6.3 J-4・WXK11-018）＝**個別アタック**の終了。`resolvePendingSigniBattleFor`（バトル解決 Phase2）の末尾で発火。triggerCondition.attackDealtNoDamage で「そのアタックでダメージが与えられていない場合」を判定
  | 'ON_ABILITY_ACTIVATED'      // 他の能力が発動したとき（§6.3 J-1）＝`WX19-066`「あなたの【自】の【英知】能力が発動したとき」／`WXEX1-77`「対戦相手の場にあるシグニの【出】能力が発動したとき」。**effectStack から1件取り出して解決を始める瞬間**（`resolveStackNext` の `shiftQueue` 直後＝唯一の funnel）に照合する。限定は triggerCondition.activatedAbility*
  | 'ON_ACCE_TO_TRASH'          // 【アクセ】N枚がトラッシュに置かれたとき（signi_acce の set-diff で検出。WXEX2-19。triggerScope any/any_ally/any_opp・triggerCondition.minCount）
  | 'ON_MAGIC_BOX_FLIPPED'      // 【マジックボックス】が表向きになったとき（§6.4 A群・WX24-P4-016-E3 が「このターンのアタックフェイズの間」限定で付与する watcher）。`signi_magic_boxes` の set-diff で検出＝**行先がトラッシュか場のシグニのものだけ**を「表向き」と数える（除外・盤面リセットで消えた分は数えない）。triggerScope any/any_ally/any_opp・triggerCondition.minCount
  | 'ON_SOUL_ATTACHED'          // 【ソウル】が付いたとき（signi_soul の null→非null を効果解決の set-diff で検出。WXDi-D07-004「あなたのシグニ1体に」=any_ally／WXDi-D07-019「このシグニに」=self）
  | 'ON_CARD_ATTACHED'          // このシグニにカードN枚が付いたとき（【チャーム】/【アクセ】/【ソウル】いずれの付与でも発火する汎用版。WXK10-049。triggerScope self/any_ally・triggerCondition.minCount）
  | 'ON_ENERGY_TO_TRASH'        // エナゾーンからカードがトラッシュに置かれたとき（energy→trash の set-diff で検出。WD15-015「あなたの効果によって対戦相手のエナゾーンから」。triggerCondition.energyTrashedOwner で発生源）
  | 'ON_REFRESH'                // いずれかのプレイヤーがリフレッシュしたとき（refresh_count_this_turn の set-diff で検出。WXDi-P04-043。triggerCondition.refreshedOwner で発生源。⚠効果解決経路のリフレッシュのみ検出＝ドローフェイズの過剰ドロー refresh は未検出の近似）
  | 'ON_OPP_POWER_DECREASED'    // あなたの効果によって対戦相手のシグニのパワーが減ったとき（毒牙。temp_power_mods の新規負 delta を効果解決の set-diff で検出。WX13-036/WXEX2-52。⚠「あなたの効果」限定は近似＝相手自身の自己弱体でも発火しうる／temp_power_mods のみ＝UNTIL_OPP_TURN_END 弱体は未計上）
  | 'ON_LEAVE_FIELD'            // カードがフィールドを離れたとき
  | 'ON_HAND_DISCARDED'         // 手札が捨てられたとき
  | 'ON_OPP_EFFECT_TRASH_FROM_HAND' // 相手の効果で手札がトラッシュに置かれたとき
  | 'ON_OPPONENT_SIGNI_TRASHED' // 相手シグニがトラッシュに置かれたとき
  | 'ON_OPPONENT_SIGNI_PLAY'    // 相手がシグニを場に出したとき
  | 'ON_LIFE_CRASHED'           // あなたのライフクロスがクラッシュされたとき
  | 'ON_SIGNI_CRASHED_LIFE_TOTAL' // このシグニが1ターンに対戦相手のライフクロスを合計N枚以上クラッシュしたとき（クラッシュした側が反応。閾値は triggerCondition.crashedTotalThisTurn）
  | 'ON_HAND_OR_ENERGY_LOST_BY_OPP' // 対戦相手の効果1つによって、あなたの手札が捨てられるか あなたのエナゾーンからカードがトラッシュに置かれたとき（2経路の OR。1解決につき1度だけ発火＝中央 diff で両方をまとめて見るため構造的に重複しない）
  | 'ON_OPP_LIFE_CRASHED'       // 対戦相手のライフクロスがクラッシュされたとき（クラッシュした側＝ターンプレイヤーのフィールドで反応）
  | 'ON_GUARD'                  // あなたが【ガード】したとき
  | 'ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT' // あなたが対戦相手のシグニのアタックを効果によって無効にしたとき
  | 'ON_ATTACK_PHASE_START'     // あなたのアタックフェイズ開始時
  | 'ON_GROW_PHASE_START'       // あなたのグロウフェイズ開始時
  | 'ON_MAIN_PHASE_START'       // メインフェイズ開始時（GROW→MAIN 遷移で発火。triggerScope:any_opp＝「対戦相手のメインフェイズ開始時」WXDi-P00-034。collectTurnTriggers で収集）
  | 'ON_ACCE_ATTACH'            // シグニに【アクセ】が付いたとき（ルリグ監視/アクセカード自身）
  | 'ON_SPELL_USE'              // あなたがスペルを使用したとき
  | 'ON_DISCARDED_AS_COST'      // このカードがシグニ能力のコストとして手札から捨てられたとき
  | 'ON_EXCEED_COST'            // このカードがエクシードのコストとしてルリグトラッシュに置かれたとき
  | 'ON_PLACED_UNDER_SIGNI'     // このカードがシグニの下に置かれたとき（INTERNAL_PLACE_SELF_UNDER_SIGNI が配置直後に直接発火させる＝汎用 collector は無い）
  | 'ON_OPP_VIRUS_PLACED'       // 対戦相手の場に【ウィルス】が置かれたとき（WX19-079。opp_virus_placed_justフラグで発火）
  | 'ON_OPP_VIRUS_REMOVED'      // 対戦相手の場の【ウィルス】が取り除かれたとき（WD19-009。opp_virus_removed_justフラグで発火）
  | 'ON_OPP_VIRUS_CHANGED'      // 対戦相手の場に【ウィルス】が置かれるか取り除かれたとき（WX21-030。opp_virus_placed/removed_justフラグで発火）
  | 'ON_ENERGY_CHARGE'          // あなたのエナゾーンにカード1枚が置かれたとき（WX03-032-E1。エナ+1枚ちょうどで発火。2枚同時は不発）
  | 'ON_POWER_THRESHOLD'        // このシグニのパワーが閾値以上になったとき（WX03-032-E2。condition: SELF_POWER_GTE で閾値を保持）
  | 'ON_OPP_SIGNI_ATTACK_DIRECT' // 対戦相手のシグニが正面が空の状態でアタックしたとき（=守備側ルリグへの直接アタック時）に守備側で発火（WX04-004-E2）
  | 'ON_FRONT_SIGNI_ATTACK'    // このシグニの正面のシグニ（=このシグニにアタックしてくる相手シグニ）がアタックしたとき、守備側の正面シグニで発火（WX04-082-E1）。triggeringCardNum=アタッカー
  // 対戦相手のシグニ1体がアタックしたとき（アタック宣言→バトル解決の間）に守備側で開く**【起】の使用窓**（WX05-013-E2＝実データ1枚）。
  // 原文「この能力は対戦相手のシグニ１体がアタックしたときにしか使用できない」＝使用条件ではなく**使用タイミング**なので、
  // parser は condition ではなくこの timing へ載せ替える（旧実装は `DURING_PHASE:['ATTACK_SIGNI_OP']`＝TurnPhase に無い値で常に false ＝一度も撃てなかった。Opusタスク12(cx)）。
  // engine 配線＝`performSigniAttack` が守備側のセンタールリグ/アシスト/場シグニから収集し、`wrapOptionalOnPlay` で
  // 「エクシード等のコストを支払って発動するか」の CHOOSE に包んで守備側プレイヤーのスタックへ積む（ON_OPP_SIGNI_ATTACK_DIRECT と同じ作法）。
  | 'ON_OPP_SIGNI_ATTACK'      // 対戦相手のシグニ1体がアタックしたとき（守備側の応答窓）
  | 'ON_ZONE_MOVED'            // 場にあるこのシグニが効果によって他のシグニゾーンに移動したとき（WX14-050/052/053）。パワー＋N は MOVE_TO_OTHER_SIGNI_ZONE ハンドラが原文を読んで適用済みのため現状 engine 未配線
  | 'ON_CARD_MILLED_FROM_DECK' // あなたか対戦相手のデッキからカードが1枚以上トラッシュに置かれたとき（WX25-P2-009-E2）。collectMillTriggers で配線済み
  | 'ON_CARD_MOVED_TO_DECK'    // あなたか対戦相手のカードが効果によって1枚以上デッキに移動したとき（WX09-020/WX22-014/WXK10-076/WDK09-013）。collectMoveToDeckTriggers が解決前後の set-diff で検出（movedToDeckOwner/MinCount/FromTrash で限定）
  | 'ON_HAND_ADDED'            // 効果によってカードが手札に移動したとき（続き207・WX25-P2-063「対戦相手の効果によって…対戦相手の手札に」／WXDi-P11-007・WX14-029「あなたのエナゾーンから手札に」／WD12-009/010＝移動カード自身 triggerScope:self）。detectHandAdded の set-diff で検出（handOwner/fromZones/byOpponentEffect/excludeGrowPhase/triggerFilter で限定）
  | 'ON_ENERGY_TO_FIELD'       // あなたのエナゾーンからシグニが場に出たとき（続き207・WXDi-P11-007-E1「手札に加わるか場に出たとき」の場側枝＝ON_HAND_ADDED と併記して OR）。detectPlacedFromEnergy で検出
  | 'ON_LIFE_CLOTH_ADDED'      // あなたのライフクロスにカード1枚が加えられたとき（WD06-001/WD20-001）。detectLifeClothAdded の増加 set-diff のみで検出し、クラッシュ等の減少とは混線しない
  | 'ON_LIFE_CLOTH_MOVED'      // ライフクロスが他領域へ移動したとき。クラッシュ直後の life→field.check は to:'other'、後続 check→energy/trash は life 差分なし
  | 'ON_OPP_ENERGY_ADDED'      // 対戦相手のエナゾーンにカード1枚が置かれたとき（WDA-F03-13/WX24-P2-050）。detectEnergyAdded の増加 set-diff で置かれたカード自身を triggeringCardNum に保持
  // 「〈誰か〉の効果1つによって〈誰か〉のトラッシュにカードが合計N枚以上置かれたとき」（§6.4 O-37(c)・続き543・WX24-P3-007 が付与）。
  // ⚠**移動元の領域を問わない**＝`ON_CARD_MILLED_FROM_DECK`（デッキ限定）／`ON_OPP_EFFECT_TRASH_FROM_HAND`（手札限定）では狭くて流用できない。
  // detectTrashAdded の増加 set-diff で検出し、trashOwner／byOpponentEffect／minCount／triggerFilter で限定する。
  | 'ON_TRASH_CARD_ADDED';

export type UsageLimit =
  | 'once_per_turn'    // ターンに1回
  | 'twice_per_turn'   // ターンに2回（《ターン２回》）
  | 'once_per_game'    // ゲームに1回
  | 'once_per_trigger' // トリガー1回につき1回
  | 'unlimited';       // 制限なし

export type EffectDuration =
  | 'INSTANT'            // 即時解決して終わり
  | 'UNTIL_END_OF_TURN'  // ターン終了時まで
  | 'UNTIL_OPP_TURN_END' // 次の対戦相手のターン終了時まで
  | 'NEXT_TURN'          // 次のターンの間
  | 'PERMANENT';         // フィールドにいる間ずっと

export type Owner = 'self' | 'opponent' | 'any';

export type CardLocation =
  | 'field' | 'hand' | 'deck' | 'trash'
  | 'lrig_deck' | 'lrig_trash' | 'energy' | 'life_cloth';

export type CardTypeFilter =
  | 'シグニ' | 'ルリグ' | 'アーツ' | 'スペル'
  | 'キー' | 'ピース' | 'アシストルリグ' | 'レゾナ';

// ===== 参照変数（動的な数値参照） =====

export type VariableSource =
  | 'TURN_TRASH_COUNT'  // このターン中にトラッシュに置いたカード数
  | 'FIELD_SIGNI_COUNT' // フィールドのシグニ数
  | 'HAND_COUNT'        // 手札枚数
  | 'LIFE_COUNT'        // ライフクロス枚数
  | 'ENERGY_COUNT'      // エナゾーンのカード枚数
  | 'TURN_COUNT';       // 現在のターン数

export interface Variable {
  source: VariableSource;
  owner: Owner;
  cardType?: CardTypeFilter;
}

// 数値または変数参照。last_processed_count は、直前に処理したカードのうち
// filter に一致する枚数だけを参照できる（例：「この方法で捨てた青のカードと同じ枚数」）。
// center_lrig_level は自分のセンタールリグの現在の表記レベルを参照する。
export type NumberOrRef = number | { $ref: string; filter?: TargetFilter };

export interface CountFromZone {
  zone: 'field' | 'hand' | 'energy' | 'trash' | 'lrig_trash' | 'deck' | 'acce' | 'charm' | 'trap';
  owner: Owner;
  filter?: TargetFilter;
  /** 「N枚につき」の単位。該当枚数をこの値で割り、端数を切り捨てる。 */
  unitSize?: number;
  /** 既存の「1枚につきN」用乗数。unitSize とは意味が逆なので互換性のため分離する。 */
  per?: number;
}

// ===== 発動条件 =====

export type ActiveCondition =
  | { type: 'LRIG_DECK_COUNT'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'OR'; conditions: ActiveCondition[] }
  | { type: 'TURN_OWNER'; owner: Owner }
  | { type: 'NO_COMMON_COLOR_AMONG_FIELD_SIGNI'; owner: 'self'; count: number; filter?: TargetFilter } // 「あなたの場にそれぞれ共通する色を持たない〈filter〉のシグニがN体ある場合」。filter 省略＝場のシグニ全体（§6.4 O-11 で filter を追加）
  | { type: 'FIELD_LRIGS_SHARE_COLOR'; owner: Owner; minCount: number }
  // §6.3「正面」サブ機構(d)：効果元シグニ（sourceCardNum）の**正面**（相手ゾーン 2-zi）を条件にする型。
  // 「このシグニの正面に〈filter〉のシグニがあるかぎり」／「このシグニより〈key〉が高いシグニがこの正面にあるかぎり」。
  // filter は matchesFilter＋matchesStateFilter（凍結/ダウン等の盤面状態）の両方で評価する。
  // compareToSelf は正面シグニの level/power を効果元自身と比較（power は effectivePowers があればそれを使う）。
  | { type: 'FRONT_SIGNI'; filter?: TargetFilter; compareToSelf?: { key: 'level' | 'power'; operator: CompareOp } }
  | { type: 'FIELD_LRIGS_HAVE_COLORS'; owner: Owner; colors: string[] }
  | { type: 'HAS_CARD_IN_FIELD'; owner: Owner; filter: TargetFilter; excludeSelf?: boolean; minCount?: number; distinctNames?: boolean; distinctColors?: boolean; distinctLevels?: boolean; distinctClasses?: boolean; excludeClasses?: string[]; distinctPhraseJa?: 'kinds' }
  | { type: 'HAS_KEY_IN_FIELD'; owner: Owner; operator?: CompareOp; value?: number }
  | { type: 'FIELD_LEVEL_SUM'; owner: Owner; target: 'signi' | 'lrig'; operator?: CompareOp; value?: number; compareTo?: 'opponent'; parity?: 'odd' | 'even'; metric?: 'level' | 'power'; lrigRole?: 'all' | 'center' | 'assist' }
  | { type: 'LRIG_TEAM_COUNT'; owner: Owner; team: string; operator: CompareOp; value: number }
  // 「あなたの場にあるすべてのシグニが〈色〉/＜C＞/《X》であるかぎり、」（§6.4 O-35）。`Condition` 側と同型・
  // 同実装（空盤面 false＝1体以上必須）。⚠**両 union に同じ型を置いたら評価器も両方に実装する**
  // （片方だけだと未知型フォールバックで無条件成立に倒れる＝過剰実行）。
  | { type: 'ALL_FIELD_SIGNI_MATCH'; owner: Owner; filter: TargetFilter }
  | { type: 'COUNT_THRESHOLD'; location: CardLocation; owner: Owner; operator: CompareOp; value: number; color?: string } // color指定時はその色を含むカードのみ数える（WX05-005「トラッシュに黒のカードが10枚以上」）
  | { type: 'FIELD_SIGNI_POWER_COUNT'; owner: Owner; minPower: number; operator: CompareOp; value: number } // 場のシグニのうちパワーがminPower以上のものの数（「シグニ3体がそれぞれ15000以上」等）
  | { type: 'SELF_POWER_THRESHOLD'; operator: CompareOp; value: number }
  // このシグニ自身の**実効レベル**（表記レベル＋`LEVEL_MOD_PER_COUNT` / `DYNAMIC_LEVEL_BY_ENERGY` 等の
  // 動的修正、`calcSigniLevels`）がかぎり条件を満たすか。`SELF_POWER_THRESHOLD` のレベル版で、
  // 「このシグニはレベルが４以上であるかぎり」（`WX20-Re18`。タスク12(cxvii)）。
  // ⚠`Condition` 側にも同型あり＝両方揃えて更新すること（`HAND_DIFF` と同じ運用）。
  // ⚠評価器に実効レベルを渡さないと**表記レベルへフォールバック**する（動的レベル札は一生 false＝過小）。
  | { type: 'SELF_LEVEL_THRESHOLD'; operator: CompareOp; value: number }
  | { type: 'FRONT_SIGNI_POWER'; operator: CompareOp; value: number } // このシグニの正面（相手ゾーン 2-zi）のシグニの実効パワーが条件を満たすかぎり（正面が空なら不成立。SP27-002-E3）
  | { type: 'HAND_DIFF'; operator: CompareOp; value: number }  // 自分の手札と相手の手札の差
  | { type: 'LIFE_COMPARE_OPP'; operator: CompareOp; value?: number } // 自分のライフクロス−相手のライフクロスの符号付き差。value省略＝0（Condition側と同型）
  | { type: 'ENA_DIFF'; operator: CompareOp; value: number }   // 自分のエナと相手のエナの差
  | { type: 'ENERGY_COLOR_TYPES'; owner: Owner; operator: CompareOp; value: number } // エナゾーンのカードが持つ色の種類数（WX05-006「エナゾーンのカードの色が3種類以上」）
  | { type: 'ENERGY_COUNT_FILTER'; owner: Owner; filter: TargetFilter; operator: CompareOp; value: number; distinctName?: boolean; distinctColor?: boolean; distinctClasses?: boolean; excludeClasses?: string[] } // Condition 側と同形。CONTINUOUS のエナ種類数ゲート
  | { type: 'LRIG_LEVEL'; owner: Owner; operator: CompareOp; value: number } // センタールリグのレベル条件
  | { type: 'EICHI_LEVEL_SUM'; operator: CompareOp; value: number } // 英知=N 条件
  | { type: 'IS_SELF_ARMORED' }                                 // このシグニが血晶武装状態であるかぎり
  | { type: 'IS_SELF_ACCED'; cardName?: string }                // このシグニにアクセが付いているかぎり（cardName指定時はそのカード名のアクセ限定）
  | { type: 'IS_SELF_SOUL_ATTACHED' }                           // このシグニに【ソウル】が付いているかぎり
  | { type: 'IS_SELF_CHARMED' }                                 // このシグニに【チャーム】が付いているかぎり（WX04-096-E1）
  | { type: 'IS_SELF_ACCE_CARD' }                               // このカードがアクセとして装着されているかぎり（アクセカード側の条件）
  | { type: 'IS_DRIVE_STATE' }                                  // このシグニがドライブ状態（ルリグに乗られている）であるかぎり
  // このルリグがドライブ状態であるかぎり（＝自分のルリグが乗機シグニに乗っている＝`lrig_riding_signi` が空でない）。
  // ⚠`IS_DRIVE_STATE` は**シグニ側**（自分が乗られている）の条件なので、ルリグ本体には使えない
  //   （`sourceCardNum` がルリグ番号になり `lrig_riding_signi` に含まれず**常に false**）＝専用型。`WXEX2-11-E2`。
  | { type: 'LRIG_IS_DRIVE_STATE' }
  | { type: 'IS_SELF_AWAKENED' }                                // このシグニが覚醒状態であるかぎり
  | { type: 'IS_SELF_DOWN' }                                    // このシグニがダウン状態であるかぎり
  // このシグニがアップ状態であるかぎり（`IS_SELF_DOWN` の裏。`WXDi-P04-050-E1/E2`＝2026-08-18）。
  // ⚠否定を持たないので `IS_SELF_DOWN` では表せない＝専用型。Condition 側の `THIS_CARD_IS_UP` と対。
  | { type: 'IS_SELF_UP' }
  | { type: 'IS_SELF_IN_CENTER_ZONE' }                          // このシグニが中央のシグニゾーンにあるかぎり
  // このシグニが左／右（または「左か右」）のシグニゾーンにあるかぎり。ゾーン添字は所有者から見た
  // 表示順＝left=0 / right=2（`TargetFilter.zoneSide` と同じ規約）。`either`＝「左か右の」＝中央以外。
  // ⚠Condition 側にも同型あり＝両方揃えて更新すること（`HAND_DIFF` と同じ運用）。
  | { type: 'IS_SELF_IN_SIDE_ZONE'; side: 'left' | 'right' | 'either' }
  | { type: 'TURN_HAND_DISCARD_GTE'; owner?: Owner; value: number }  // このターンに owner（省略=self）が手札をN枚以上捨てている場合。⚠Condition 側にも同型あり＝両方揃えて更新すること
  | { type: 'SIGNI_BANISHED_THIS_TURN'; owner: Owner; minCount?: number }  // このターンに owner のシグニがN体以上バニッシュされていた場合（signi_banished_this_turn。省略=1）
  | { type: 'SELF_DECK_TO_TRASH_THIS_TURN'; owner: Owner; minCount?: number } // このターンに owner のデッキからカードがN枚以上トラッシュに置かれていた場合（deck_to_trash_count_this_turn。省略=1）
  | { type: 'THIS_CARD_HAS_UNDER'; filter?: TargetFilter; minCount?: number } // このシグニの下にカードがN枚以上あるかぎり（省略=1。filter指定時は一致カードを数える）
  | { type: 'SELF_HAS_KEYWORD'; keyword: string; subject?: 'self' | 'center_lrig' } // 自身またはセンタールリグが【keyword】を持っているかぎり
  | { type: 'HAS_BOND'; cardName?: string }                    // 絆アイコン：このカード名との絆を獲得している（cardName省略=このカード自身）
  | { type: 'SUBSCRIBER_COUNT'; operator: CompareOp; value: number }  // 登録者数条件（N万人以上等）
  | { type: 'VIRUS_COUNT'; owner: Owner; operator: CompareOp; value: number } // 場の【ウィルス】数条件（「対戦相手の場に【ウィルス】がない場合」等）
  | { type: 'LRIG_COLOR'; owner: Owner; color: string }         // センタールリグが指定色を持つ場合（「あなたのセンタールリグが青で」等）
  // 「あなたの場にカード名に《X》を含むセンタールリグがいるかぎり」（段2 第45バッチ・`WDK16-06T-E1`）。
  // ⚠`HAS_CARD_IN_FIELD{cardType:'ルリグ', cardName}` では**アシストルリグも拾ってしまう**
  //   （`lrigZoneTops` はセンター＋左右アシストを返す＝《美兎》《凛》は同名のアシストが実在する）。
  //   `Condition` 側に同型が既にあるので**両評価器を揃える**（PLAN §4.2 の3点セット）。
  | { type: 'LRIG_NAME_CONTAINS'; owner: Owner; name: string }
  | { type: 'SAME_ZONE_HAS_GATE' }                              // このシグニと同じシグニゾーンにTHE DOOR【ゲート】があるかぎり（own_gate_zones）
  | { type: 'FIELD_HAS_GATE'; owner: Owner }                    // 指定プレイヤーの場にTHE DOOR【ゲート】があるかぎり（own_gate_zones が非空）
  | { type: 'ENERGY_HAS_CARD'; owner: Owner; filter: TargetFilter; minCount?: number } // エナゾーンにフィルタ一致カードがN枚以上あるかぎり（省略=1。「エナゾーンに＜植物＞のシグニがあるかぎり」。G038）
  | { type: 'ENERGY_EACH_LEVEL_FILTER_GTE'; owner: Owner; filter: TargetFilter; levels: number[]; minEach: number } // エナゾーンにレベル帯の各レベルごとに一致カードがN枚以上あるかぎり
  | { type: 'TRASH_HAS_CARD'; owner: Owner; filter: TargetFilter; minCount?: number; distinctName?: boolean; distinctClasses?: boolean; excludeClasses?: string[] } // トラッシュにフィルタ一致カードがN枚以上あるかぎり。distinctName=true は異なるカード名の種類数
  | { type: 'LRIG_TRASH_COUNT'; cardType?: CardTypeFilter | CardTypeFilter[]; filter?: TargetFilter; operator: CompareOp; value: number; excludeSource?: boolean } // ルリグトラッシュの（cardType/filter一致）枚数（「ルリグトラッシュにアーツがあるかぎり」=アーツ,gte,1。G185）。Conditionと同形
  | { type: 'SIGNI_RETURNED_TO_HAND_THIS_TURN'; owner: Owner; minCount?: number } // このターンにシグニがN体以上場から手札に戻っていた場合（省略=1 は turn_signi_returned_to_hand フラグ、N≧2 は signi_returned_to_hand_count_this_turn。G087）
  | { type: 'ARTS_USED_THIS_TURN'; owner: Owner; color?: string; minCount?: number; exactCount?: number } // このターンにアーツを使用した回数（省略=1。minCount指定時はturn_arts_used_namesを数える。exactCount＝「N枚目のアーツだった場合」の**ちょうどN**）
  | { type: 'BEAT_CONDITION'; condText: string }               // 《ビートアイコン》[条件]：自分の【ビート】が条件を満たすかぎり（CONTINUOUS の常時能力ゲート。【常】《ビート》系）
  | { type: 'DURING_ATTACK_PHASE'; owner?: Owner }             // 「[あなたの/対戦相手の]アタックフェイズの間、」有効な常在効果（CONTINUOUS）。owner:'self'=あなたのアタックフェイズのみ／'opponent'=対戦相手のアタックフェイズのみ／省略=どちらのアタックフェイズでも。engine は calcFieldPowers に渡された turnPhase（ATTACK_ARTS/ATTACK_ARTS_OP/ATTACK_SIGNI/ATTACK_LRIG）で判定＝省略すると相手ターン中も過剰適用になっていた（WX25-CP1-082-E3/WX24-P1-050-E1 ほか9効果・タスク12）。turnPhase 未指定の呼び出し元では従来どおり true（過小実行を避ける）
  | { type: 'DURING_MAIN_PHASE'; owner?: Owner }               // 🆕§5.3 `O-65`：「[あなたの/対戦相手の]メインフェイズの間、」有効な常在効果（CONTINUOUS）。`DURING_ATTACK_PHASE` の対で、判定も同じ規約＝**turnPhase を渡さない呼び出し元では true**（過小実行を避ける）。⚠**受け皿を足すだけでは効かない**＝消費地点（`collectBanishEffectProtectedSigni` 等）が `checkActiveCondition` へ `turnPhase` を渡していないと恒久 no-op になる（`O-64` と同じ「委ね先が読んでいない」型）
  | { type: 'AND'; conditions: ActiveCondition[] };             // 複合条件（すべてを満たす）

export type Condition =
  | { type: 'CENTER_LRIG_NOT_GROWN_THIS_TURN'; owner: Owner }
  | { type: 'FIELD_LRIGS_HAVE_COLORS'; owner: Owner; colors: string[] }
  | { type: 'FIELD_LRIG_COLOR_COUNT'; owner: Owner; operator: CompareOp; value: number; minLrigs?: number }
  // 【使用条件】【チーム】**いずれかのチーム**（`WX25-P3-050`・§6.4 O-34(d)）＝チーム名を指定せず
  // 「場のルリグ value 体が**同じ1つのチーム**に属する」ことだけを要求する。`LRIG_TEAM_COUNT` は
  // チーム名を名指しする兄弟で、`team:''` で代用すると `includes('')` が常に真＝**無条件で通る**。
  | { type: 'LRIG_ANY_TEAM_COUNT'; owner: Owner; value: number }
  | { type: 'LAST_PROCESSED_HAS_NO_ABILITIES' }
  | { type: 'OR'; conditions: Condition[] }
  | { type: 'TURN_OWNER'; owner: 'self' | 'opponent' }
  | { type: 'NO_COMMON_COLOR_AMONG_FIELD_SIGNI'; owner: 'self'; count: number; filter?: TargetFilter } // 「あなたの場にそれぞれ共通する色を持たない〈filter〉のシグニがN体ある場合」。filter 省略＝場のシグニ全体（§6.4 O-11 で filter を追加）
  | { type: 'FIELD_LRIGS_SHARE_COLOR'; owner: Owner; minCount: number }
  | { type: 'FIELD_COUNT'; owner: Owner; cardType?: CardTypeFilter; operator: CompareOp; value: NumberOrRef }
  | { type: 'DECK_COUNT'; owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'DECK_COUNT_FILTER'; owner: Owner; filter: TargetFilter; operator: CompareOp; value: NumberOrRef } // デッキ内のfilter一致枚数（選択肢availabilityにも使用。WX20-053）
  | { type: 'HAND_COUNT';  owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'HAND_COUNT_FILTER'; owner: Owner; filter: TargetFilter; operator: CompareOp; value: NumberOrRef; distinctName?: boolean } // フィルタ一致する手札枚数（distinctName=名前の異なる枚数）
  | { type: 'HAND_DIFF'; operator: CompareOp; value: number }  // 自分の手札−相手の手札の符号付き差（「手札が対戦相手より少ない場合」=lt,0／「より多い場合」=gt,0）。ActiveCondition 側にも同型あり＝両方揃えて更新すること
  // このシグニが左／右（または「左か右」）のシグニゾーンにある場合（実行時判定＝`evalCondition`）。
  // 【自】のトリガー時条件（「対戦相手がアーツを使用したとき、このシグニが左か右のシグニゾーンにある場合」
  // ／「このシグニが左のシグニゾーンに出たとき」）に使う。ActiveCondition 側にも同型あり＝両方揃えて更新すること
  | { type: 'IS_SELF_IN_SIDE_ZONE'; side: 'left' | 'right' | 'either' }
  | { type: 'LIFE_COUNT';  owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'LIFE_CRASHED_THIS_TURN'; owner: Owner; operator: CompareOp; value: NumberOrRef } // このターンに owner のライフクロスがクラッシュされた枚数
  | { type: 'LIFE_CRASHED_LAST_TURN'; owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'ENERGY_COUNT'; owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'ENERGY_COUNT_FILTER'; owner: Owner; filter: TargetFilter; operator: CompareOp; value: NumberOrRef; distinctName?: boolean; distinctColor?: boolean; distinctClasses?: boolean; excludeClasses?: string[] } // フィルタ一致するエナゾーンのカード枚数（distinctColor=持つ色の種類数。「エナゾーンに＜美巧＞のシグニが５枚以上ある場合」。WX04-035-BURST）
  | { type: 'ENERGY_EACH_LEVEL_FILTER_GTE'; owner: Owner; filter: TargetFilter; levels: number[]; minEach: number }
  | { type: 'ENERGY_HAS_COLOR'; owner: Owner; colors: string[] } // エナゾーンに指定色すべてのカードがある場合（「エナゾーンに赤のカードと緑のカードがある場合」）
  | { type: 'CARDS_DRAWN_BY_EFFECT'; owner: Owner; operator: CompareOp; value: number } // このターンに効果で引いた累計枚数（cards_drawn_by_effect_this_turn）
  // 「このターンにあなたが《コイン》を合計N枚以上支払っていた場合」＝coins_paid_this_turn（支払いのみ・獲得は数えない）。
  // WXDi-P09-039/WXDi-P15-053/068/072/073（従来は条件節ごと落ちて**無条件発火**していた＝Opusタスク12(cxvi)）。
  | { type: 'COINS_PAID_THIS_TURN'; owner: Owner; operator: CompareOp; value: number }
  /**
   * 「それが**このターンでN回目**である場合」（`WX05-042`・§6.4 O-11）。
   * `signi_downed_this_turn` の台帳を `filter` で絞って数える（＜植物＞のシグニ限定など）。
   * ⚠**数だけの器にしない**＝クラス/色の限定が原文側にあるので filter を持たせる。
   */
  | { type: 'SIGNI_DOWNED_COUNT_THIS_TURN'; owner: Owner; filter?: TargetFilter; operator: CompareOp; value: number }
  // このターンに**対戦相手の効果によって** owner の手札／エナゾーンからトラッシュへ移動した累計枚数
  // （hand_trashed_by_opp_this_turn / energy_trashed_by_opp_this_turn）。WXDi-P02-005 の「代わりに」ゲート。
  | { type: 'HAND_TRASHED_BY_OPP'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'ENERGY_TRASHED_BY_OPP'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'ARTS_USED_THIS_TURN'; owner: Owner; color?: string; minCount?: number; exactCount?: number } // このターンに owner がアーツを使用していた場合（minCount指定時はturn_arts_used_namesを数える。exactCount＝ちょうどN枚目）
  | { type: 'NO_OTHER_ARTS_USED_THIS_TURN'; exceptCardName: string }
  | { type: 'SPELL_USED_THIS_TURN'; owner: Owner; minCount?: number; exactCount?: number } // このターンに owner がスペルを使用した回数（actions_done の 'USE_SPELL' マーカー参照。省略=1。exactCount＝「N枚目のスペルだった場合」の**ちょうどN**＝N+1枚目では成立しない）
  // ── §3 タスク6「代わりに」B1残（per-target 値すり替えのターン中イベント counter／コスト参照）。いずれも
  //    「代わりに」置換ゲート（matchLeadingStateCondition 経由）専用＝ownerState の累計/直前記録を参照する。
  //    「このターンにあなたが手札をN枚以上捨てていた場合」（WXDi-P11-067）は既存 TURN_HAND_DISCARD_GTE を使う。
  | { type: 'THIS_CARD_UPPED_FROM_DOWN_THIS_TURN' } // このターンに効果元シグニ（sourceCardNum）が効果によってダウン→アップしていた場合（upped_from_down_this_turn）。WX14-070「代わりに－7000」
  | { type: 'OPP_CARDS_MOVED_TO_DECK_THIS_TURN'; operator: CompareOp; value: number } // このターンに **あなたの効果によって** 対戦相手のカードがデッキに移動した累計枚数（opp_cards_moved_to_deck_this_turn）。WXK06-071「1枚以上→－5000／4枚以上→代わりに－12000」の多段閾値
  | { type: 'SELF_DECK_TO_ENERGY_THIS_TURN'; operator: CompareOp; value: number }
  | { type: 'SELECTED_COLOR'; color: string }
  | { type: 'BEAT_ZONE_COUNT'; operator: CompareOp; value: number; thisWay?: boolean }
  | { type: 'COST_TRASHED_PUPPET' } // この能力のコストで傀儡状態のシグニをトラッシュに置いた場合（last_cost_trashed_puppet）。WDK17-014「代わりに－10000」
  | { type: 'COST_DISCARDED_SIGNI_LEVEL'; level: number } // このコストで指定レベルのシグニを手札から捨てた場合（last_discarded_signi_level）。WX25-P2-101「レベル１→代わりに－5000」
  // 「このコストで<filter に合うカード>を捨てた／トラッシュに置いた場合」＝直前のコスト支払いでトラッシュへ送った
  // カード（last_cost_trashed_cards＝手札/エナ/場すべてを含む）に filter 一致が1枚以上あるか。§3タスク6 C（2026-07-25）。
  // WX24-P1-060「スペルを捨てた→代わりにパワー5000以下」／WX25-P3-076「緑の＜龍獣＞をトラッシュ→代わりに5000以下」
  // minCount（§6.4 O-35・続き530）＝「この方法でカードをN枚以上トラッシュに置いた場合」＝**枚数閾値**。
  //   コスト節が「エナゾーンからすべてのカードをトラッシュに置く」のように**支払い枚数が可変**な形で使う
  //   （`WX25-CP1-020-E2` 3/7枚・`WXDi-P16-012-E3` 5枚）。本文の直前ステップを見る `LAST_PROCESSED_COUNT_GTE`
  //   とは参照先が違う（あちらは効果の実行結果・こちらはコスト支払い＝`last_cost_trashed_cards`）。
  | { type: 'COST_TRASHED_MATCHES'; filter: TargetFilter; verbJa?: 'discard' | 'trash'; minCount?: number; distinctColors?: boolean }
  | { type: 'HAS_CARD_IN_FIELD'; owner: Owner; filter: TargetFilter; excludeSelf?: boolean; minCount?: number; distinctNames?: boolean; distinctColors?: boolean; distinctLevels?: boolean; distinctClasses?: boolean; excludeClasses?: string[]; distinctPhraseJa?: 'kinds'; negate?: boolean } // distinctColors=true は一致シグニが持つ色の種類数を minCount と比較。negate=true は「場に〈X〉が**ない**場合」（この条件系には NOT ラッパが無いのでここで否定を表す。§6.4 O-11）
  | { type: 'HAS_KEY_IN_FIELD'; owner: Owner }                 // キーゾーン（key_piece / key_piece_extra）にキーが1枚以上ある
  | { type: 'FIELD_LEVEL_SUM'; owner: Owner; target: 'signi' | 'lrig'; operator?: CompareOp; value?: number; compareTo?: 'opponent'; parity?: 'odd' | 'even'; metric?: 'level' | 'power'; lrigRole?: 'all' | 'center' | 'assist' }
  | { type: 'ALL_FIELD_SIGNI_MATCH'; owner: Owner; filter: TargetFilter } // 「あなたの場にあるすべてのシグニが＜C＞/《X》の場合」＝場の全シグニ（頂点）が filter 一致。1体以上必須（空盤面は false＝空振り発火しない）。WX25-CP1-042 等
  | { type: 'TRASH_HAS_CARD'; owner: Owner; filter: TargetFilter; minCount?: number; distinctName?: boolean; distinctClasses?: boolean; excludeClasses?: string[] } // minCount: フィルタ一致カードがN枚以上。distinctName=true は異なるカード名の種類数
  | { type: 'ALL_SELF_SIGNI_DOWN' }
  | { type: 'TRASH_COUNT'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'DECK_TOP_MATCHES'; owner: Owner; filter: TargetFilter }
  | { type: 'LRIG_LEVEL'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'LRIG_STORY'; owner: Owner; story: string; negate?: boolean } // negate=true は「センタールリグが＜X＞**でない**場合」（この条件系には NOT ラッパが無いので`HAS_CARD_IN_FIELD`／`IS_BETTING` と同じ慣例で否定を表す。§6.4 O-35・`WXK05-005-E1`）
  | { type: 'THIS_CARD_IN_LOCATION'; location: CardLocation }
  | { type: 'THIS_CARD_IN_CENTER_ZONE' }
  | { type: 'THIS_CARD_IS_DOWN' }
  | { type: 'THIS_CARD_IS_UP' }                               // このシグニがアップ状態の場合（ダウンしていない。G247）
  | { type: 'CENTER_LRIG_IS_UP' }                             // あなたのセンタールリグがアップ状態の場合（WX25-P2-048）
  | { type: 'THIS_CARD_IS_ARMORED' }                          // このシグニが血晶武装状態の場合
  | { type: 'THIS_CARD_IS_AWAKENED' }                         // このシグニが覚醒状態の場合
  | { type: 'THIS_CARD_IS_ACCED'; minCount?: number }         // 効果元シグニに付いた【アクセ】枚数（省略=1枚以上）
  // このシグニに【チャーム】が付いている場合（§6.4 O-25(d)・`WXK07-043-E1/E2`）。
  // ⚠`ActiveCondition` 側の `IS_SELF_CHARMED` と**同型・同実装**＝両方揃えて更新すること
  //   （`SELF_LEVEL_THRESHOLD` / `HAND_DIFF` と同じ運用）。
  // ⚠`THIS_CARD_HAS_ATTACHED`（チャーム/アクセ/ソウルの合計）とは**別物**＝チャーム限定。
  | { type: 'THIS_CARD_IS_CHARMED' }
  // このシグニに【ソウル】が付いている場合（2026-08-27 Sheet1 B5・`WXDi-P16-089-E1`）。
  // ⚠`ActiveCondition` 側の `IS_SELF_SOUL_ATTACHED` と**同型・同実装**＝両方揃えて更新すること
  //   （`THIS_CARD_IS_CHARMED` / `IS_SELF_CHARMED` と同じ運用）。
  // ⚠`THIS_CARD_HAS_ATTACHED`（チャーム/アクセ/ソウルの**合計**）を流用しない＝チャームが付いていれば
  //   ソウル無しでも成立する**別物**（原文より緩い過剰効果になる）。
  | { type: 'THIS_CARD_HAS_SOUL' }
  | { type: 'THIS_CARD_HAS_ATTACHED'; minCount?: number }     // このシグニにカードがN枚以上付いている場合（【チャーム】/【アクセ】/【ソウル】の合計。省略=1。WXK10-049-E2）
  | { type: 'SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE'; owner: Owner; filter?: TargetFilter; minCount?: number } // そのアタックフェイズの間に owner のシグニ（filter 一致）が場を離れていた場合（§6.3 J-4・WX24-P2-075-E1）。`signi_left_field_this_attack_phase` に記録した instanceId を cardMap で照合する
  // 「そのアタックがこのターンN度目の場合」（§6.4 O-25(d)・`WXK06-033/035/037/038/062`／`WXDi-P14-052`／`WXDi-P16-063`）。
  // 🔑序数は**シグニ単位ではなくアタックしたプレイヤーのターン内通算**＝`attacked_signi_ids.length`
  //   ＋ルリグアタック済み分（シグニは通常1回しかアタックできないので「四度目」は盤面全体の通算でしか成立しない）。
  // ⚠**解決中のアタック自身を含む**＝`BattleScreen` は `attacked_signi_ids` へ追記した `newMyState` で
  //   ON_ATTACK_SIGNI を収集するので、一度目のアタックの解決時点で既に 1 になっている。
  // ⚠「一度目**か二度目**」（`WX10-018`／`WX17-006`／`SP27-016`）は**別機構**＝`negateNthAttack` の
  //   カウントダウン窓が既に実装済み。ここで拾わないこと（regex は「N度目の場合」に限定してある）。
  | { type: 'ATTACK_ORDINAL_THIS_TURN'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'IS_DRIVE_STATE' }                                // このシグニがドライブ状態の場合
  | { type: 'TURN_HAND_DISCARD_GTE'; owner?: Owner; value: number }  // このターンに owner（省略=self）が手札をN枚以上捨てている場合。⚠ActiveCondition 側にも同型あり＝両方揃えて更新すること
  | { type: 'SIGNI_BANISHED_THIS_TURN'; owner: Owner; minCount?: number }  // このターンに owner のシグニがN体以上バニッシュされていた場合（signi_banished_this_turn。省略=1）
  | { type: 'SELF_DECK_TO_TRASH_THIS_TURN'; owner: Owner; minCount?: number } // このターンに owner のデッキからカードがN枚以上トラッシュに置かれていた場合（deck_to_trash_count_this_turn。省略=1）
  | { type: 'SIGNI_RETURNED_TO_HAND_THIS_TURN'; owner: Owner; minCount?: number } // このターンにシグニがN体以上場から手札に戻っていた場合（signi_returned_to_hand_count_this_turn。省略=1）。⚠ActiveCondition 側にも同型あり
  // このシグニの下にカードがある場合。negate=true は「無い場合」。
  // minCount は「下にカードがN枚以上ある場合」（省略=1）＝`WXK08-030-E1` の２枚/５枚の多段閾値。
  // ⚠ filter 併用時は **filter 一致の枚数**を数える（無指定なら下カード総数）。
  | { type: 'THIS_CARD_HAS_UNDER'; filter?: TargetFilter; negate?: boolean; minCount?: number }
  | { type: 'LRIG_LEVEL_EQ_OPP' }                             // 自分のセンタールリグのレベルが対戦相手のセンタールリグと同じ場合
  | { type: 'LRIG_LEVEL_CMP_OPP'; operator: 'lt' | 'lte' | 'gt' | 'gte' } // 自分のセンタールリグのレベルが対戦相手のセンタールリグ より低い/以下/より高い/以上 の場合（WXK07-025/WXK10-068。EQ の不等号版）
  | { type: 'LRIG_NAME_CONTAINS'; owner: Owner; name: string } // センタールリグのカード名が name を含む場合
  | { type: 'LRIG_COLOR'; owner: Owner; color: string }       // センタールリグが指定色を持つ場合（「あなたのセンタールリグが青で」等）
  | { type: 'LRIG_TRASH_COUNT'; cardType?: CardTypeFilter | CardTypeFilter[]; filter?: TargetFilter; operator: CompareOp; value: number; excludeSource?: boolean } // ルリグトラッシュの（cardType/filter一致）カード枚数（「ルリグトラッシュにアーツが4枚以上」等）。excludeSource=trueで使用中カード自身(sourceCardNum)を除外＝リコレクト判定
  | { type: 'FIELD_CLASS_COUNT'; owner: Owner; story: string; operator: CompareOp; value: number } // 場のシグニのうちCardClassがstoryを含むものの数（「場に＜天使＞が3体」等）
  | { type: 'LRIG_TEAM_COUNT'; owner: Owner; team: string; operator: CompareOp; value: number } // 場のルリグ（センター＋アシストL/R）のうちTeamがteamを含むものの数（「＜うちゅうのはじまり＞のルリグが3体」。WXDi-D05-021。Teamはチーム名でCardClass/Storyとは別）
  /**
   * 「このピースは、**対戦相手が【使用条件】【チーム】を持つピースを使用する際、カットインして使用できる**」
   * （`WXDi-P05-006`・§6.4 O-10 続き517）＝**カットイン窓が開いているときだけ使える**という使用条件。
   * ⚠**現状は常に false**＝ピース使用への応答窓（`pending_spell` 相当の `pending_piece`）が engine/UI に無い。
   *   窓が実装されたらここがその state を読む1点になる。
   * 🔑これを**条件として持たせる意味**＝落とすと「いつでも無条件に使えるピース」になる（実際そうなっていた）。
   *   使えないことは過少実行だが、**カットイン専用札が通常タイミングで撃てるのは過剰実行**なので、
   *   窓が無い間は false に倒すのが正しい。
   */
  | { type: 'OPP_USING_TEAM_PIECE' }
  | { type: 'SUBSCRIBER_COUNT'; operator: CompareOp; value: number } // 登録者数（万人）条件
  // 場に付いている【チャーム】の枚数（「対戦相手の場に【チャーム】が３枚ある場合」WX11-049-E2）。
  // 【ウィルス】の VIRUS_COUNT（ActiveCondition 側）と対になる使用条件版。
  | { type: 'CHARM_COUNT'; owner: Owner; operator: CompareOp; value: number }
  /**
   * 「**この方法でシグニを公開したとき**」（§5.3 `O-81`・`WX16-003-E3`）＝
   * 直前の離脱で `signi_facedown_attached` から公開して手札へ戻したカード
   * （`PlayerState.facedown_revealed_just`）が `filter` を満たす場合。
   * ⚠**収集時に評価される**（`collectLeaveFieldTriggers` の `eff.condition`）＝
   *   マーカーは次の離脱でクリアされるので、解決時まで持ち越して読んではいけない。
   */
  | { type: 'FACEDOWN_REVEALED_JUST'; filter?: TargetFilter }
  | { type: 'VIRUS_COUNT'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'LRIG_DECK_COUNT'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'SELF_POWER_GTE'; value: number; operator?: CompareOp }
  // このシグニ自身の**実効レベル**（`calcSigniLevels`＝表記＋動的修正）の比較。ActiveCondition 側と同形＝
  // 両方揃えて更新すること。「レベルが４以上であるかぎり『【自】…』を得る」の【自】側に載る（`WX20-Re18-E2`）。
  | { type: 'SELF_LEVEL_THRESHOLD'; operator: CompareOp; value: number }
  | { type: 'THIS_CARD_FROM_TRASH' } // このシグニがトラッシュから場に出た場合（WX03-034-E1。signi_played_from_trashで判定）
  | { type: 'THIS_CARD_FROM_NON_HAND_THIS_TURN' } // このターンにこのシグニが手札以外の領域から場に出ていた場合
  | { type: 'THIS_CARD_PLACED_BY_CLASS'; cardClass?: string } // class省略時は効果起因の配置全般
  | { type: 'THIS_CARD_FROM_DECK' } // このシグニがデッキから場に出た場合
  | { type: 'LAST_PROCESSED_SHARES_COLOR_WITH_LRIG'; owner: Owner } // 直前に処理したカード（lastProcessed）が指定プレイヤーのセンタールリグと共通する色を持つ場合（WX26-CP1-048）
  | { type: 'FIELD_SIGNI_POWER_COUNT'; owner: Owner; minPower: number; operator: CompareOp; value: number } // 場のシグニのうちパワーがminPower以上のものの数（「シグニ3体がそれぞれ15000以上」等）
  | { type: 'LIFE_COMPARE_OPP'; operator: CompareOp; value?: number } // 自分のライフクロス−相手のライフクロスの符号付き差。既存値省略は0
  // 両プレイヤーの手札/エナ枚数を直接比較する（cmp(自分, operator, 対戦相手)＝LIFE_COMPARE_OPP と同じ向き）。
  // 「対戦相手の手札があなたより多い場合」＝自分 lt 相手。閾値比較の HAND_COUNT/ENERGY_COUNT（値と比べる）とは別物。
  | { type: 'HAND_COMPARE_OPP'; operator: CompareOp }
  | { type: 'ENERGY_COMPARE_OPP'; operator: CompareOp }
  | { type: 'EFFECTIVE_LRIG_LIMIT_GTE'; value: number }
  | { type: 'DURING_PHASE'; phases: string[] }
  // 対戦相手のシグニがアタックしている最中（アタック宣言済み・バトル未解決）か。
  // 「対戦相手のシグニ１体がアタックしたとき」の状態版＝`otherState.pending_signi_battle` の有無で判定する。
  // ⚠ ACTIVATED 単独の使用条件としては parser が timing:'ON_OPP_SIGNI_ATTACK' へ載せ替えるので、
  //    ここに残るのは AND 合成された場合など。（Opusタスク12(cx)）
  | { type: 'OPP_SIGNI_ATTACKING' }
  | { type: 'AND'; conditions: Condition[] }
  | { type: 'IS_MY_TURN' }
  | { type: 'IS_OPPONENT_TURN' }
  | { type: 'IS_BETTING'; minCoins?: number; negate?: boolean } // このアーツ/スペルでベットを宣言していた場合（is_betting_this_effect）。minCoins 指定時は支払ったコイン枚数（bet_coins_paid）がN以上の段階ベット判定（WX16-004）。「あなたがベットしていた場合、代わりに」の択一に使う。negate=true は「ベットしていなかった場合」（`WD20-006-E1` のデメリット節）
  | { type: 'IS_BOOSTING' }                                    // このアーツでブースト追加エナを支払っていた場合
  | { type: 'PAID_ADDITIONAL_COST' }
  | { type: 'ANY_PLAYER_REFRESHED_THIS_TURN' }                  // このターンにいずれかのプレイヤーがリフレッシュしていた場合
  | { type: 'BEAT_CONDITION'; condText: string } // 《ビートアイコン》[条件]
  | { type: 'COND_STUB'; raw: string }
  | { type: 'LAST_PROCESSED_COUNT_GTE'; value: number; verbJa?: string; negate?: boolean; omitGteJa?: boolean } // この方法で直前に処理したカード枚数がN以上。negate=true は「N枚処理しなかった」＝N未満（否定3件）。verbJa/omitGteJa は decompiler 表示専用
  | { type: 'LAST_PROCESSED_SIGNI_LEVEL_PARITY_DIFFERS_FROM_DECLARED' } // 公開されたシグニがあり、そのレベル偶奇が declared_number(偶=0/奇=1) と異なる
  | { type: 'LAST_PROCESSED_LEVEL_SUM'; operator: CompareOp; value: number; source?: 'last_processed' | 'stored_targets' }   // lastProcessedCards（source:'stored_targets' は明示退避した対象）のシグニレベル合計とNの比較
  | { type: 'TRASHED_DISTINCT_LEVELS_GTE'; count: number; allSigniDistinct?: boolean; allSameLevel?: boolean }   // 相異なるレベルがcount種以上。allSigniDistinct は処理した全シグニのレベルが相異なる（WXK09-100）、allSameLevel はシグニ1枚以上かつ全て同レベル
  | { type: 'TRASHED_STORY_COUNT_GTE'; story: string; count: number }  // この方法でトラッシュ(lastProcessedCards)した＜story＞のシグニがcount体以上（WX03-021）
  | { type: 'LAST_PROCESSED_POWER_GTE'; value: number; addDelta?: number }  // 直前に選択/処理したシグニ(lastProcessedCards[0])のパワー(+addDelta)がvalue以上（WX03-046「それのパワーが15000以上」。addDeltaで直前の+パワーを加味）
  | { type: 'ENERGY_TRASH_COLOR_COUNT_GTE'; value: number }   // 直前コスト(energyTrashColorAll)でトラッシュした指定色カードがvalue枚以上（WX04-002-E2「この方法で赤が3枚以上」）
  | { type: 'OPPONENT_NOT_PAID' }                             // 相手が任意コストを支払わなかった場合
  | { type: 'SELF_OPTIONAL_EFFECT_TAKEN' }                    // 自分が任意効果（自バニッシュ等）を実行した場合
  | { type: 'HAS_BOND'; cardName?: string }                   // 絆アイコン：このカード名との絆を獲得している
  | { type: 'ACTIVATED_DISCARD_COUNT_GTE'; value: number }    // 直前の【起】コストで捨てた合計枚数（手札+エナ）≥ N
  | { type: 'OPP_LIFE_CRASH_EVENT_GTE'; value: number }       // 今回の相手ライフクラッシュイベントで同時にN枚以上クラッシュされた場合（ダブルクラッシュ判定。ON_OPP_LIFE_CRASHED収集時に専用評価）
  | { type: 'SAME_ZONE_HAS_GATE' }                            // このシグニと同じシグニゾーンにTHE DOOR【ゲート】がある場合（own_gate_zones）
  | { type: 'FIELD_HAS_GATE'; owner: Owner }                  // 指定プレイヤーの場にTHE DOOR【ゲート】がある場合（own_gate_zones が非空）
  | { type: 'NOT_PLAYED_NON_DISSONA_SPELL_THIS_TURN' }       // このターンに《ディソナアイコン》ではないスペルを使用していない（DISONA_RESTRICTION用）
  | { type: 'DECK_TOP_SHARES_COLOR_WITH_LRIG'; owner: Owner } // デッキの一番上のカードと共通する色を持つルリグ（センター/アシスト）が場にいる場合（G157）
  | { type: 'FIELD_SIGNI_ALL_DISTINCT_CLASS'; owner: Owner }  // 場のすべてのシグニがそれぞれ共通するクラスを持たない（互いに異クラス）場合（プライマル系。G158）
  // 🆕**正方向**＝「あなたの場に〈色〉のシグニが N 体あり、**それらが共通するクラスを持つ**場合」（`WX09` の5色サイクル）。
  //   ⚠上の `FIELD_SIGNI_ALL_DISTINCT_CLASS` は**否定形**（互いに異クラス）で意味が違う＝流用しない（§5-5e）。
  //   `color` 省略時は場のシグニ全部を見る。`count` 体**以上**が `color` に一致し、かつ**一致した全員**が
  //   1つ以上のクラスを共有していることを要求する（原文は3体＝盤面全埋まりなので実質「全員」）。
  | { type: 'FIELD_SIGNI_SHARE_CLASS'; owner: Owner; color?: string; count: number }
  | { type: 'LAST_PROCESSED_HAS_BURST'; negate?: boolean }   // lastProcessedCards[0] が【ライフバースト】を持つ場合。negate=true は持たない場合
  | { type: 'LAST_PROCESSED_HAS_TYPE'; cardType: string }   // lastProcessedCards のいずれかが指定Type（'スペル'等）の場合（G164「この方法でトラッシュしたカードの中にスペルがある場合」）
  | { type: 'LAST_PROCESSED_LEVEL_EQ_FRONT_SIGNI' }         // 直前に処理したカードと、効果元シグニの正面（相手2-zi）のシグニの表記レベルが同じ（WXEX1-65）
  | { type: 'LAST_PROCESSED_SHARE_COLOR' }                   // lastProcessedCards 全てに共通する色が1つ以上ある場合（「それらがそれぞれ共通する色を持つ場合」。WDK10-008）
  | { type: 'LAST_PROCESSED_MATCHES'; filter: TargetFilter; minCount?: number; operator?: CompareOp; value?: number; distinctName?: boolean; requiredCardNames?: string[]; requiredDistinctColors?: (string | string[])[]; shareClass?: boolean; shareLevel?: boolean; levelLteCenterLrig?: Owner; verbJa?: string }  // lastProcessedCards の filter 一致数。requiredDistinctColors は各色スロット（配列ならOR候補）を互いに異なるカードへ割り当てる（多色1枚による二重充足を禁止）。
  | { type: 'LAST_LOOK_TRASHED_MATCHES'; filter: TargetFilter; minCount?: number } // 直前の LOOK_AND_REORDER で実際にトラッシュへ置いたカード
  | { type: 'LAST_PROCESSED_ALL_MATCH'; filter: TargetFilter };  // lastProcessedCards が **すべて** filter 一致（空集合は false）（「この方法でトラッシュに置かれたカードがすべて黒の場合」WXK09-097／「すべてのカードがレベル１のシグニの場合」WXDi-P05-042）

// ===== 条件型の実行時ホワイトリスト（タスク12(cxv)）=====
// `ActiveCondition` と `Condition` は**別の union** なのに、JSON は型検査を通らないので
// `activeCondition` スロットに Condition 型を書いても誰も止めない。そして両評価器
// （`checkActiveCondition` / `evalCondition`）は未知の型で **`return true`＝無条件成立** に倒れるため、
// 型を1つ取り違えるだけで「条件つき常在能力が常時発動」になり、**smoke/census/fuzz は全部緑のまま**
// 素通りする（実際に `WX05-021-E4`／`WXDi-P07-060-E3`／`PR-426-E3` の3効果がそうなっていた）。
// そこで **union のメンバ名を実行時に列挙できる表**を置き、golden が live JSON を機械照合する。
// `Record<Union['type'], true>` なので **union に型を足すとキー不足で typecheck が落ちる**＝
// ここへの追記が強制される（余計なキーもエラー）。**評価器側の実装漏れ**は各評価器末尾の
// `never` 代入が別途 typecheck で捕まえる。
export const ACTIVE_CONDITION_TYPES: Record<ActiveCondition['type'], true> = {
  LRIG_DECK_COUNT: true, OR: true, TURN_OWNER: true, NO_COMMON_COLOR_AMONG_FIELD_SIGNI: true,
  FIELD_LRIGS_SHARE_COLOR: true, FRONT_SIGNI: true, FIELD_LRIGS_HAVE_COLORS: true, HAS_CARD_IN_FIELD: true,
  HAS_KEY_IN_FIELD: true, FIELD_LEVEL_SUM: true, LRIG_TEAM_COUNT: true, ALL_FIELD_SIGNI_MATCH: true, COUNT_THRESHOLD: true, FIELD_SIGNI_POWER_COUNT: true, SELF_POWER_THRESHOLD: true,
  FRONT_SIGNI_POWER: true, SELF_LEVEL_THRESHOLD: true,
  HAND_DIFF: true, LIFE_COMPARE_OPP: true, ENA_DIFF: true, ENERGY_COLOR_TYPES: true, ENERGY_COUNT_FILTER: true, LRIG_LEVEL: true,
  EICHI_LEVEL_SUM: true, IS_SELF_ARMORED: true, IS_SELF_ACCED: true, IS_SELF_SOUL_ATTACHED: true, IS_SELF_CHARMED: true,
  IS_SELF_ACCE_CARD: true, IS_DRIVE_STATE: true, LRIG_IS_DRIVE_STATE: true, IS_SELF_AWAKENED: true, IS_SELF_DOWN: true, IS_SELF_UP: true,
  IS_SELF_IN_CENTER_ZONE: true, IS_SELF_IN_SIDE_ZONE: true, TURN_HAND_DISCARD_GTE: true,
  THIS_CARD_HAS_UNDER: true, SELF_HAS_KEYWORD: true, HAS_BOND: true, SUBSCRIBER_COUNT: true, VIRUS_COUNT: true,
  LRIG_COLOR: true, LRIG_NAME_CONTAINS: true, SAME_ZONE_HAS_GATE: true, FIELD_HAS_GATE: true, ENERGY_HAS_CARD: true, ENERGY_EACH_LEVEL_FILTER_GTE: true,
  TRASH_HAS_CARD: true, LRIG_TRASH_COUNT: true, SIGNI_RETURNED_TO_HAND_THIS_TURN: true, ARTS_USED_THIS_TURN: true, BEAT_CONDITION: true,
  SIGNI_BANISHED_THIS_TURN: true, SELF_DECK_TO_TRASH_THIS_TURN: true,
  DURING_ATTACK_PHASE: true, DURING_MAIN_PHASE: true, AND: true,
};

export const CONDITION_TYPES: Record<Condition['type'], true> = {
  CENTER_LRIG_NOT_GROWN_THIS_TURN: true, FIELD_LRIGS_HAVE_COLORS: true, FIELD_LRIG_COLOR_COUNT: true,
  LAST_PROCESSED_HAS_NO_ABILITIES: true, OR: true, TURN_OWNER: true, NO_COMMON_COLOR_AMONG_FIELD_SIGNI: true,
  FIELD_LRIGS_SHARE_COLOR: true, FIELD_COUNT: true, DECK_COUNT: true, DECK_COUNT_FILTER: true,
  HAND_COUNT: true, HAND_COUNT_FILTER: true, HAND_DIFF: true, IS_SELF_IN_SIDE_ZONE: true, LIFE_COUNT: true,
  LIFE_CRASHED_THIS_TURN: true, LIFE_CRASHED_LAST_TURN: true, ENERGY_COUNT: true, ENERGY_COUNT_FILTER: true,
  ENERGY_EACH_LEVEL_FILTER_GTE: true, ENERGY_HAS_COLOR: true, CARDS_DRAWN_BY_EFFECT: true,
  COINS_PAID_THIS_TURN: true, HAND_TRASHED_BY_OPP: true, ENERGY_TRASHED_BY_OPP: true,
  SIGNI_DOWNED_COUNT_THIS_TURN: true,
  ARTS_USED_THIS_TURN: true, NO_OTHER_ARTS_USED_THIS_TURN: true, SPELL_USED_THIS_TURN: true,
  THIS_CARD_UPPED_FROM_DOWN_THIS_TURN: true, OPP_CARDS_MOVED_TO_DECK_THIS_TURN: true,
  SELF_DECK_TO_ENERGY_THIS_TURN: true, SELECTED_COLOR: true, BEAT_ZONE_COUNT: true, COST_TRASHED_PUPPET: true,
  COST_DISCARDED_SIGNI_LEVEL: true, COST_TRASHED_MATCHES: true, HAS_CARD_IN_FIELD: true, FIELD_LEVEL_SUM: true,
  HAS_KEY_IN_FIELD: true, ALL_FIELD_SIGNI_MATCH: true, TRASH_HAS_CARD: true, ALL_SELF_SIGNI_DOWN: true,
  TRASH_COUNT: true, DECK_TOP_MATCHES: true, LRIG_LEVEL: true, LRIG_STORY: true, THIS_CARD_IN_LOCATION: true,
  THIS_CARD_IN_CENTER_ZONE: true, THIS_CARD_IS_DOWN: true, THIS_CARD_IS_UP: true, CENTER_LRIG_IS_UP: true,
  THIS_CARD_IS_ARMORED: true, THIS_CARD_IS_AWAKENED: true, THIS_CARD_IS_ACCED: true, THIS_CARD_IS_CHARMED: true, THIS_CARD_HAS_SOUL: true, THIS_CARD_HAS_ATTACHED: true,
  SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE: true, ATTACK_ORDINAL_THIS_TURN: true, IS_DRIVE_STATE: true,
  TURN_HAND_DISCARD_GTE: true, THIS_CARD_HAS_UNDER: true, LRIG_LEVEL_EQ_OPP: true, LRIG_LEVEL_CMP_OPP: true,
  LRIG_NAME_CONTAINS: true, LRIG_COLOR: true, LRIG_TRASH_COUNT: true, FIELD_CLASS_COUNT: true,
  LRIG_TEAM_COUNT: true, LRIG_ANY_TEAM_COUNT: true, OPP_USING_TEAM_PIECE: true, SUBSCRIBER_COUNT: true, CHARM_COUNT: true, VIRUS_COUNT: true, LRIG_DECK_COUNT: true, SELF_POWER_GTE: true,
  FACEDOWN_REVEALED_JUST: true,
  SELF_LEVEL_THRESHOLD: true,
  THIS_CARD_FROM_TRASH: true, THIS_CARD_FROM_NON_HAND_THIS_TURN: true, THIS_CARD_PLACED_BY_CLASS: true,
  THIS_CARD_FROM_DECK: true, LAST_PROCESSED_SHARES_COLOR_WITH_LRIG: true, FIELD_SIGNI_POWER_COUNT: true,
  LIFE_COMPARE_OPP: true, HAND_COMPARE_OPP: true, ENERGY_COMPARE_OPP: true, EFFECTIVE_LRIG_LIMIT_GTE: true,
  DURING_PHASE: true, OPP_SIGNI_ATTACKING: true, AND: true, IS_MY_TURN: true, IS_OPPONENT_TURN: true,
  IS_BETTING: true, IS_BOOSTING: true, PAID_ADDITIONAL_COST: true, ANY_PLAYER_REFRESHED_THIS_TURN: true,
  BEAT_CONDITION: true, COND_STUB: true, LAST_PROCESSED_COUNT_GTE: true,
  LAST_PROCESSED_SIGNI_LEVEL_PARITY_DIFFERS_FROM_DECLARED: true, LAST_PROCESSED_LEVEL_SUM: true,
  TRASHED_DISTINCT_LEVELS_GTE: true, TRASHED_STORY_COUNT_GTE: true, LAST_PROCESSED_POWER_GTE: true,
  ENERGY_TRASH_COLOR_COUNT_GTE: true, OPPONENT_NOT_PAID: true, SELF_OPTIONAL_EFFECT_TAKEN: true,
  HAS_BOND: true, ACTIVATED_DISCARD_COUNT_GTE: true, OPP_LIFE_CRASH_EVENT_GTE: true, SAME_ZONE_HAS_GATE: true,
  FIELD_HAS_GATE: true, NOT_PLAYED_NON_DISSONA_SPELL_THIS_TURN: true, DECK_TOP_SHARES_COLOR_WITH_LRIG: true,
  FIELD_SIGNI_ALL_DISTINCT_CLASS: true, FIELD_SIGNI_SHARE_CLASS: true, LAST_PROCESSED_HAS_BURST: true, LAST_PROCESSED_HAS_TYPE: true,
  LAST_PROCESSED_LEVEL_EQ_FRONT_SIGNI: true, LAST_PROCESSED_SHARE_COLOR: true, LAST_PROCESSED_MATCHES: true,
  LAST_LOOK_TRASHED_MATCHES: true, LAST_PROCESSED_ALL_MATCH: true,
  SIGNI_BANISHED_THIS_TURN: true, SELF_DECK_TO_TRASH_THIS_TURN: true, SIGNI_RETURNED_TO_HAND_THIS_TURN: true,
};

export type CompareOp = 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt';

// ===== コスト =====

export interface EnergyCost {
  color: '白' | '赤' | '青' | '緑' | '黒' | '無';
  count: number;
}

export interface EffectCost {
  energy?: EnergyCost[];
  discard?: number;       // 手札を任意のカードN枚トラッシュ
  discardFilter?: TargetFilter; // discardで捨てられるカードの制限（「手札から＜天使＞のシグニを１枚捨てる」等）
  discardGroups?: { count: number; filter?: TargetFilter }[]; // 混合手札捨てコスト（「スペル１枚と＜原子＞のシグニ１枚を捨てる」等、異なるフィルタの組）。discard/discardFilterと併用不可
  energyTrash?: { count: number; atLeast?: boolean; filter?: TargetFilter; selectionConstraint?: SelectionConstraint }; // エナゾーンから指定カードN枚をトラッシュ（atLeast=true はN枚以上）
  energyTrashGroups?: { count: number; filter?: TargetFilter }[]; // 異なるフィルタのエナカードを組で指定
  handDiscardSigni?: { color?: string | string[]; story?: string | string[]; count: number; level?: number }; // 手札から指定色/＜クラス＞のシグニをN枚トラッシュ（ルリグ【起】用）。配列はOR条件（「＜鉱石＞か＜宝石＞」等）
  banish_self?: boolean;  // 自身をバニッシュ
  life_crash?: number;    // 自分のライフクロスをN枚クラッシュ（【出】コスト支払いではバースト不発の近似でトラッシュへ）
  down_self?: boolean;    // 自身をダウン
  trash_self?: boolean;   // このシグニを場からトラッシュに置く（【起】コスト）
  trash_key?: boolean;    // このキーを場からルリグトラッシュに置く（【起】コスト）
  exceed?: number;        // エクシード：ルリグの下からN枚をルリグトラッシュへ
  beat_signi?: number;    // 場のシグニN体をビートにする（コスト）
  beat_signi_from_trash?: { count: number; filter?: TargetFilter }; // トラッシュからシグニN体を【ビート】にする（コスト・WDK14-013）
  coin?: number;          // 《コインアイコン》×N（【出】《コイン》等）
  // ─ v0.263 追加: 無発火だった任意【出】コストの表現（ONPLAY_DEAD_OPTIONAL対策）─
  fieldTrash?: { count: number; filter?: TargetFilter; excludeSelf?: boolean }; // 場の自分シグニN体をトラッシュ（「他の＜原子＞のシグニ１体を場からトラッシュに置く」等）
  fieldTrashGroups?: { count: number; filter?: TargetFilter }[]; // 異なるフィルタの場シグニを組で指定（「＜アーム＞1体と＜ウェポン＞1体を場からトラッシュ」WX04-040-E2）。fieldTrashと併用不可
  /**
   * 自分の場のシグニN体を**バニッシュする**コスト（「他の＜古代兵器＞のシグニ１体をバニッシュする：」
   * ＝`WX05-044-E1`／「レベル２以下の＜原子＞のシグニ１体をバニッシュする：」＝`WX25-P1-022-E1`。§5.3 `O-67`）。
   *
   * ⚠**`fieldTrash` を流用してはいけない＝行き先が違う**。バニッシュの行き先は**エナゾーン**なので
   *   支払うと**エナが1枚増える**（トラッシュ送りにすると資源をまるごと失う＝§4.4 罠8f と同じ取り違え）。
   * ⚠支払ったカードを `last_cost_trashed_cards` / `fieldTrashCostCards` に**載せない**
   *   （`ON_TRASH` の原因弁別が「コストでトラッシュに置いた」と誤観測する）。
   * ⚠**`fieldTrash` との併用は無い**（parser は片方しか立てない）＝支払いUIのゾーン選択 state は共用する。
   *   併用が現れたら golden `costFieldBanishNotMixedWithFieldTrash` が落ちる。
   * 支払いは `screens/battle/fieldBanishCost.ts` の `payFieldBanishCost` 1本（シグニ【起】／ルリグ【起】共通）。
   */
  fieldBanish?: { count: number; filter?: TargetFilter; excludeSelf?: boolean };
  handToEnergy?: { count: number; filter?: TargetFilter };    // 手札からN枚をエナゾーンに置く
  handToUnderSelf?: { count: number; filter?: TargetFilter; selectionConstraint?: SelectionConstraint }; // 手札からN枚をこのシグニの下に置く
  lrigDown?: { count: number; centerOnly?: boolean; level?: number }; // アップ状態の自分ルリグN体をダウン（センター→アシストL→Rの順で自動支払い）。centerOnly=「センタールリグ」限定・level=「レベルNのルリグ」限定（WXDi-P02-016/P03-009/P04-042。指定時は該当レベルのゾーンだけが支払い候補）
  lrigDownVariable?: { min: number }; // アップ状態のルリグを好きな数ダウン（0を含む）
  lifeTrash?: number;     // ライフクロス上からN枚をトラッシュに置く
  lifeToHand?: number;    // ライフクロス上からN枚を手札に加える
  deckTrash?: number;     // デッキ上からN枚をトラッシュに置く
  underSelfTrash?: { count: number; filter?: TargetFilter; selectionConstraint?: SelectionConstraint }; // このシグニの下から指定カードN枚をトラッシュに置く（【起】コスト）
  // あなたのシグニの下から合計N枚をトラッシュ（自分の場の全シグニを横断）。
  // fromThis＝「このシグニの下」限定（続き417）／filter＝下カードの絞り込み（続き422）。
  // ⚠`optionalCostPaySteps` と `canAffordOptionalCostSpec` の**両方**で honor すること。
  underAnySigniTrash?: { count: number; fromThis?: boolean; filter?: TargetFilter };
  charmTrash?: number;    // 自分の場のチャームN枚をトラッシュに置く（固定枚数）
  charmTrashVariable?: { min: number }; // チャームを好きな枚数（min枚以上）トラッシュ（プレイヤーが枚数を選択）
  trashArtsFromLrigDeck?: { color?: string; count: number }; // ルリグデッキからアーツN枚をトラッシュ（【出】コスト）
  /**
   * ルリグデッキにある＜X＞のルリグN枚を**ゲームから除外する**（ルリグ【起】コスト・`PR-469`・§6.4 O-11）。
   * ⚠**行先が違うので `trashArtsFromLrigDeck`（ルリグトラッシュ行き）を流用してはいけない**＝
   *   除外はどこにも戻らない。⚠これが無いまま本体だけを組むと**コストを踏み倒して撃てる**。
   */
  exileLrigFromLrigDeck?: { count: number; story?: string };
  removeOppVirus?: number; // 対戦相手の場の【ウィルス】N個を取り除く
  none?: boolean;         // コストなしの任意効果（発動するかの確認のみ）
  // ─ v0.276 追加: 全捨て型コスト ─
  discardAll?: true;      // 手札をすべて捨てる（自動・選択不要）
  energyTrashAll?: true;  // エナゾーンのカードをすべてトラッシュ（自動・選択不要）
  // ─ v0.277 追加: 手札から自身を捨てる（手発動用コスト）─
  discardSelfFromHand?: true; // このカードを手札から捨てる（handActivatedな【起】のコスト）
  // ─ v0.278 追加: 可変枚数手札捨て（１枚以上）─
  discardVariable?: { filter?: TargetFilter; min: number }; // 手札からN枚以上捨てる（プレイヤーが枚数を選択）
  // ─ v0.309 追加: トラッシュにあるカードをゲームから除外するコスト ─
  trashExile?: {
    self?: boolean;        // トラッシュにあるこのカード自身をゲームから除外
    count?: number;        // 何枚（selfでない場合）
    filter?: TargetFilter; // フィルター（cardName等）
  };
  // ─ v0.312 追加: 追加コストタイプ群 ─
  fieldDown?: { count: number; filter?: TargetFilter }; // 場のシグニN体をダウン（コスト）
  discardUpTo?: number;        // 手札をN枚まで捨てる（任意上限）
  handBottomDeck?: number;     // 手札をN枚デッキの一番下に置く
  // 「この能力の使用コストに含まれる《X》を支払う際、代わりに<substitute>してもよい」＝この能力スコープの
  // 任意コスト代替（§3タスク6 C・WX07-027-E2）。**宣言のみ・engine 未実装（§6.3送り）**＝支払いフローは
  // 常に印刷どおりのコスト（代替しない側）で成立するので安全側に倒れる。従来はこの文が action の
  // 強制 TRASH ステップへ平坦化し、**能力を使うたび必ず＜原子＞のシグニを1枚捨てる**過剰効果だった。
  // 忠実実装には起動時に「1つ分を手札捨てに振り替えるか」を問う支払いUIが要る（CONTINUOUS COST_SUBSTITUTE
  // の色オーバーライド経路＝WX08-042/WX21-044 とは別＝エナゾーン外からの支払いなので表現できない）。
  costSubstitute?: { originalCost: EnergyCost; discardFromHand?: { count: number; filter?: TargetFilter } };
  handExileSelf?: boolean;     // 手札にあるこのカードをゲームから除外する
  selfToDeckBottom?: boolean;  // このシグニをデッキの一番下に置く（コスト）
  selfPowerDown?: number;      // このシグニのパワーをN減らす（コスト）
  fieldToLrigTrash?: { count: number; filter?: TargetFilter }; // 場のカードをルリグトラッシュに置く
  energyTrashColorAll?: string; // エナゾーンからすべての[色]のカードをトラッシュ
  energyTrashSelf?: boolean;   // エナゾーンからこのカード自身をトラッシュに置く
  acceTrash?: number;          // あなたの【アクセ】N枚をトラッシュに置く（コスト）
  chargeCounterRemove?: number; // この上からカウンター（貯菌等）Nつを取り除く（コスト）
  trapToHand?: number;         // あなたの【トラップ】N体を手札に加える（コスト）
  /**
   * 「〈盤面条件〉の場合、**この能力の**発動コストは《X×N》減る」＝**この能力スコープ**の条件つきエナ減額
   * （§6.4 O-35・続き530／`WX09-011-E2`＝センタールリグがレベル4以上なら《赤×2》減る＝実質タダ）。
   *
   * ⚠`COST_REDUCTION` アクションは「スペル／アーツ／ルリグ」という**カード種別**に掛かる別軸なので表せない。
   * 🔑BattleScreen が【出】コスト提示の**直前**に条件を評価して `energy` を実際に削る（`applyAbilityCostReduction`）＝
   *   提示・支払い・可否判定がすべて同じ削減後コストを見る（funnel を増やさない）。
   */
  conditionalEnergyReduction?: { condition: Condition; energy: EnergyCost[] };
}

// ===== レゾナ出現条件 =====
// 単一ゾーンの支払いは EffectCost の既存語彙を使う。複数ゾーンを横断して合計N枚を
// 選ぶ条件だけ専用構造で表す。
export type AppearanceTiming = 'MAIN' | 'ATTACK' | 'SPELL_CUTIN';
export type AppearanceSourceZone = 'hand' | 'energy' | 'field';

export interface AppearanceTrashSelection {
  zones: AppearanceSourceZone[];
  count?: number;
  variable?: boolean;
  filter: TargetFilter;
  destination?: 'trash' | 'lrig_trash';
  totalLevelMin?: number;
  totalPowerMin?: number;
}

export interface AppearanceCostChoice {
  choose: number;
  options: EffectCost[];
}

export interface AppearanceCondition {
  rawText: string;
  timings: AppearanceTiming[];
  cost: EffectCost;
  combinedTrash?: AppearanceTrashSelection;
  choice?: AppearanceCostChoice;
  paymentShape: 'SINGLE_ZONE' | 'REQUIRES_NEW_FLOW';
  deferReason?: string;
}

// ===== ターゲットフィルタ =====

export interface TargetFilter {
  // いずれかの下位フィルタに一致すれば通す（OR）。同一 TargetFilter 内の他キーとは AND で合成される。
  // 「スペルか＜原子＞のシグニ」のように **種別ごとに条件が違う OR** は cardType の配列（＝種別だけの OR）
  // では表現できず、＜原子＞がスペルにも掛かってしまう。matchesFilter が再帰評価し、resolveDynamicFilter は
  // 各下位フィルタを個別に解決する（タスク12(xlvi)(f)）。
  anyOf?:     TargetFilter[];
  cardType?:  CardTypeFilter | CardTypeFilter[];
  cardName?:  string;      // 部分一致（cardName を含む）
  cardNames?: string[];    // いずれかの名前に一致（複数名指定用、完全一致）
  excludeCardName?: string; // このカード名を除外（完全一致）
  cardNum?:   string;
  excludeResona?: boolean; // cardType:'シグニ' はレゾナも含むため「レゾナではない」を明示
  color?:     string | string[];
  level?:     number | { min?: number; max?: number };
  levelRange?: { min?: number; max?: number };
  powerRange?: { min?: number; max?: number };
  levelEqTrigger?: boolean;
  costMax?:   number;  // 使用コストの合計（《色×N》の合計、コインを除く）がこの値以下（「コストの合計が1以下のスペル」WX04-071 等）
  costMin?:   number;  // 使用コストの合計がこの値以上（costMin と costMax を同値にすると「コストの合計がちょうどN」WX04-084 等）
  story?:     string | string[];  // ＜クラス＞フィルターの旧名（matchesFilter で cardClass と同一＝CSVの CardClass に includes でマッチ）。新規コードは cardClass を使う。
                                  // CSVの Story 列は '-' か 'Dissona' の2値しか取らないため、ここに 'Dissona' を入れても一致しない → ディソナ判定は isDisona を使う
  cardClass?: string | string[]; // ＜クラス＞フィルター（CSVのCardClassフィールドに対してincludesでマッチ）
  cardClassExclude?: string | string[]; // ＜クラス＞除外（「＜天使＞ではないシグニ」等。CardClassにincludesでマッチしたら除外）WX03-002
  hasGuard?:  boolean;
  noGuard?:   boolean; // 《ガードアイコン》を持たない（G237）。matchesFilter で Guard!=='1' を要求
  // 「能力を持たないシグニ」（§5d パターンA）。判定は `hasNoAbility` と同基準（①効果1件以上＝能力あり
  // ②0件は根拠にならず原文で判定・CSV は素のシグニを `-` で持つ）。場のシグニでは `abilities_removed`
  // （効果で能力を失った）も「持たない」に数える＝`fieldCandidates` が state を見て加算する。
  noAbilities?: boolean;
  nonColorless?: boolean; // 無色ではない（色を1つ以上持つ）。matchesFilter で Color が空/無色のカードを除外（G240）
  isDisona?:  boolean; // 《ディソナアイコン》を持つカード（CSVの Story==='Dissona'）。matchesFilter で判定
  levelParity?: 'odd' | 'even'; // レベルが奇数/偶数のシグニ（WXK01-004「奇数」/WDK04-012「偶数」）。Level 非数値は不一致
  hasCrossIcon?: boolean; // 《クロスアイコン》を持つシグニ（EffectText が《クロスアイコン》で始まる）。matchesFilter で判定（WX07-002 等「クロスアイコンを持つシグニが場に出たとき」triggerFilter）
  hasRiseIcon?: boolean;  // 《ライズアイコン》を持つシグニ（EffectText に【ライズ】を含む）。matchesFilter で判定（WX16-026 等「ライズアイコンを持つシグニが場に出たとき」triggerFilter）
  noRiseIcon?: boolean;   // 《ライズアイコン》を持たないシグニ（hasRiseIcon の否定）。matchesFilter で判定（WX16-038-E2「ライズアイコンを持たない＜武勇＞のシグニ」）
  // ⚠🔴**`eachDistinctColor` / `eachDistinctLevel` は 2026-08-23（段2 第42バッチ）で削除**＝
  //   parser だけが書いて **engine に消費が1行も無い死にキー**だった（＝制約が黙って消える過剰実行）。
  //   選択集合の相互差異は `SelectionConstraint.distinct` / `sharedColor` が正準形で、
  //   `satisfiesSelectionConstraint`（engine）・`canAddToSelection`（選択補助）・選択UI・逆翻訳のすべてが消費済み。
  //   同じ意味の受け皿を TargetFilter 側に増やさないこと（候補**単体**の述語しか書けない層なので相互差異は表せない）。
  isDown?:    boolean;
  isUp?:      boolean; // アップ状態（ダウンしていない）
  isDrive?:   boolean; // ドライブ状態のシグニ（ownerState.lrig_riding_signi に含まれる＝ルリグに乗られている乗機シグニ）。matchesStateFilter で判定（「あなたのドライブ状態のシグニ」WXEX1-37）
  isFrozen?:  boolean;
  isAwakened?: boolean; // 覚醒状態のシグニ（ownerState.awakened_signi にCardNumが含まれる）。「レベルNの覚醒状態のシグニがある場合」等。matchesStateFilter/execUtils HAS_CARD_IN_FIELD で判定（WXDi-P14-054/058/066）
  isPuppet?: boolean; // 傀儡状態のシグニ（field.puppet_signi にインスタンスIDが含まれる）
  /**
   * このターンにアタックしたシグニ（§6.4 O-3・`WDK06-R09-E1`）。
   * ⚠判定は `fieldCandidates`（state を持つ層）＝`matchesFilter` は card 単体しか見られない。
   *   参照する `attacked_signi_ids` は**アタックした側の state** に積まれる。
   */
  attackedThisTurn?: boolean;
  crossState?: boolean; // クロス状態のシグニ（field.cross_state[zone]）。イノセンス等（G159）
  hasCharm?:  boolean;
  levelEqDiscardLevelSum?: boolean; // レベルがlast_activated_discard_level_sumと一致するか（WDK13-011用）
  levelEqDeclaredNumber?: boolean; // レベルがこの効果で宣言した数と一致
  // カード名がこの効果で宣言したカード名と完全一致（「その中から宣言したカード１枚を手札に加え」WX11-037／WX13-054）。
  // resolveDynamicFilter が declared_card_name を cardNames（完全一致）へ解決する。未宣言なら空ヒット
  // （＝宣言していないのにどのカードでも拾える過剰実行を避ける）。
  nameEqDeclaredName?: boolean;
  /** 公開札のカード名が、自分の場にあるシグニのいずれかのカード名と完全一致。参照先なしは空ヒット。 */
  nameMatchesAnyFieldSigni?: boolean;
  // クラスがこの効果で宣言したクラスと一致（「その中から宣言したクラスを持つシグニ」PR-431／WX24-P1-035）。
  // resolveDynamicFilter が declared_class を story（CardClass 部分一致＝多クラス対応）へ解決する。未宣言なら空ヒット。
  classEqDeclaredClass?: boolean;
  // DECLARE_COLORS で宣言した色のうち指定番目と一致。参照不能時は空ヒット。
  colorEqDeclaredColorIndex?: number;
  // 自分の場のルリグ（センター→左アシスト→右アシスト）の指定番目と共通色。
  // 指定位置にルリグがいなければ空ヒット（WXDi-P15-005 の固定3段用）。
  colorMatchesLrigIndex?: number;
  levelEqualsVar?: 'charm_trash_count' | 'field_trash_level' | 'cost_hand_to_energy_level' | 'cost_energy_trash_level_sum'; // 直前コストの既存 last_* 記録とレベルが一致するか
  nameEqLastProcessed?: boolean; // 直前に処理した先頭カードのカード名と完全一致。参照不能時は空ヒット
  levelEqLastProcessedCount?: TargetFilter | true; // 直前に処理した枚数（true）または指定filter一致枚数と表記レベルが一致
  levelLteLastProcessedCount?: TargetFilter | true; // 直前に処理した枚数（true）または指定filter一致枚数以下のレベル。0枚ならlevel.max=0
  levelEqLastProcessedLevelSum?: boolean; // 直前に処理したカードの表記レベル合計と一致
  levelEqLrig?: 'self' | 'opponent'; // 指定側センタールリグの表記レベルと一致。参照不能時は空ヒット
  levelLteLrig?: 'self' | 'opponent'; // 指定側センタールリグの表記レベル以下。参照不能時は空ヒット
  levelEqSelf?: boolean; // 効果元カード（付与先ルリグを含む）の表記レベルと一致。参照不能時は空ヒット
  powerLteSelf?: boolean; // 効果元シグニの実効パワー以下（「自身のパワー以下の対戦相手のシグニ」。resolveDynamicFilterがpowerRange.maxへ解決）
  // 効果元の実効パワーはバフ／デバフで実行時に変わるため、静的な powerRange には焼き込めない。
  powerLteSelfHalf?: boolean; // 効果元シグニの実効パワーの半分以下（resolveDynamicFilterがpowerRange.maxへ解決）
  powerLtSelf?: boolean;  // 効果元シグニの実効パワーより低い（「このシグニ/自身よりパワーの低い」。resolveDynamicFilterがpowerRange.maxへ解決）
  powerGtSelf?: boolean;  // 効果元シグニの実効パワーより高い（「このシグニよりパワーの高い」。resolveDynamicFilterがpowerRange.min:N+1へ解決。WXK04-029）
  levelLtSelf?: boolean;  // 効果元シグニのレベルより低い（「このシグニより低いレベルを持つ」。resolveDynamicFilterがlevel.max:N-1へ解決。WXK11-018）
  levelGtSelf?: boolean;  // 効果元シグニのレベルより高い（「このシグニよりレベルの高い」。resolveDynamicFilterがlevel.min:N+1へ解決）
  powerLtTrigger?: boolean; // トリガー元シグニ（triggeringCardNum＝被バニッシュ/場に出た/アタッカー）よりパワーが低い（「そのシグニよりパワーの低い」。resolveDynamicFilterがpowerRange.max:N-1へ解決。WXK11-020）
  powerLteTrigger?: boolean; // トリガー元シグニのパワー以下（「そのシグニのパワー以下の」。resolveDynamicFilterがpowerRange.maxへ解決。WXEX1-42/WXEX1-53/WDK12-001）
  levelLtTrigger?: boolean; // トリガー元シグニのレベルより低い（「そのシグニより低いレベルを持つ」。resolveDynamicFilterがlevel.max:N-1へ解決。WX09-014）
  levelGtTrigger?: boolean; // トリガー元シグニのレベルより高い（「そのシグニより高いレベルを持つ」。resolveDynamicFilterがlevel.min:N+1へ解決。WX24-P1-015）
  levelLtOppLrig?: boolean; // 対戦相手のセンタールリグのレベルより低い（「対戦相手のセンタールリグより低いレベルを持つ、あなたの＜X＞のシグニ」。resolveDynamicFilterがotherState中央ルリグのレベル-1をlevel.maxへ解決。参照不能なら制限なしへフォールバック。WX19-042）
  powerLtAnyAlly?: boolean; // 自分の場のシグニのいずれか（＝最大実効パワー）より低い（「あなたのいずれかのシグニよりパワーの低い」。resolveDynamicFilterがownerState.field.signiの最大実効パワー-1をpowerRange.maxへ解決。WXDi-P01-020/WXDi-P07-031）
  powerLtPrinted?: boolean; // 各候補の実効パワーが自身の表記パワーより低い＝パワー低下中（「表記されているパワーよりパワーの低い」。fieldCandidatesがper-candidateで判定。WX25-CP1-093）
  powerGtPrinted?: boolean; // 各候補の実効パワーが自身の表記パワーより高い＝パワー増強中（「表記されているパワーよりパワーの高い」。fieldCandidatesがper-candidateで判定。WXK10-027）
  superlative?: { key: 'power' | 'level'; dir: 'max' | 'min' }; // 候補集合のうち最大/最小のパワー/レベルを持つもののみ（「対戦相手のシグニのうち最も大きいパワーを持つシグニ」WXDi-P08-009 等）。fieldCandidates が集合単位でポストフィルタ（同値は全て残す＝「すべて」対応）
  frontOfGateZone?: boolean; // THE DOOR【ゲート】がある自分のシグニゾーンの正面にある対戦相手のシグニ（own_gate_zones の各 zi に対し相手ゾーン 2-zi。execTransferToDeck が解決）
  inGateZone?: boolean;      // このシグニと同じシグニゾーンに THE DOOR【ゲート】がある（own_gate_zones にゾーンが含まれる。状態ベース＝fieldCandidates/matchesStateFilter で判定）
  centerZoneOnly?: boolean;  // 中央のシグニゾーン（zone index 1）にあるシグニのみ（状態ベース＝fieldCandidates/matchesStateFilter で判定）
  // 左／右のシグニゾーンにあるシグニのみ（`centerZoneOnly` の兄弟。状態ベース＝fieldCandidates/matchesStateFilter で判定）。
  // ゾーン添字は**所有者から見た表示順**＝left=0 / center=1 / right=2（`BoardComponents` の signiRow が
  // 自分側を rawIdx 昇順で左から描き、相手側だけ左右反転して描く＝物理盤面と同じ）。
  // ⚠これが無いと「あなたの右のシグニゾーンにある＜怪異＞のシグニのパワーを＋4000」が
  //   `owner:'any'/count:1` の filter 無しへ潰れ、CONTINUOUS では効果元自身に解決＝**自分にバフ**していた。
  zoneSide?: 'left' | 'right';
  thisCardOnly?: boolean; // 効果元シグニ自身のみ（「このシグニをバニッシュする」等の自己対象。execBanishが解決）
  frontOfSelf?: boolean; // このシグニの正面（相手ゾーン 2-zi）の相手シグニ1枚のみ。効果元が場のシグニでない／正面が空なら候補ゼロ＝no-op
  /**
   * 「**このシグニの隣にある**あなたのシグニ」＝効果元のシグニゾーンの**左右（`zi±1`）**だけ（`WXDi-P04-050-E2`／`WXDi-P00-053-E1`）。
   *
   * 🔴これが無いと `owner:'self'/count:'ALL'` へ潰れて**自分の全シグニ（自分自身を含む）**に効く＝過剰実装だった
   * （2026-08-18 続き562・`V-73` 実機検証で発見＝単独配置でも自分に＋3000 が乗っていた）。
   * ⚠**効果元自身は「隣」ではない**（`zi` は含めない）。効果元が場のシグニでなければ候補ゼロ＝no-op。
   * ⚠**現状の消費地点は `calcFieldPowers` の CONTINUOUS `POWER_MODIFY`（`count:'ALL'`）だけ**＝
   *   `matchesFilter`／`matchesStateFilter` は**ゾーン隣接を判定できない**（効果元のゾーンを受け取らない）ので、
   *   対象宣言（`SELECT_TARGET` 等）でこのキーを使うと**黙って無視されて過剰選択**になる。使うなら消費地点を先に足すこと
   *   （live で CONTINUOUS 以外に付いていないことは golden が見張っている）。
   */
  adjacentToSelf?: boolean;
  excludeSelf?: boolean;  // 効果元シグニ自身を対象から除外（「あなたの他の＜原子＞のシグニ」等。execTrash/execBanishが解決）
  isTriggerSource?: boolean; // トリガー元カード（ctx.triggeringCardNum）のみを対象。execBanishが解決
  colorMatchesLrig?: boolean;    // 自分のセンタールリグと共通する色を持つか（WX01-025等）
  // 「あなたの**場にいるルリグ**と共通する色を持つ」＝センター＋アシストの色の**和**（SPDi01-131-E1）。
  // colorMatchesLrig（センターのみ）だとアシストの色でしか一致しないカードを取りこぼす。
  // resolveDynamicFilter が color 配列（OR）へ解決。ルリグ不在なら制限なし（＝colorMatchesLrig と同じ扱い）
  colorMatchesAnyLrig?: boolean;
  // 「**センタールリグではない**あなたのいずれかのルリグと共通する色を持つ」＝アシストルリグの色の和
  // （WXDi-P02-017-E1）。アシスト不在なら候補ゼロ（参照先が無い＝絞れないので過剰実行しない側へ）
  colorMatchesNonCenterLrig?: boolean;
  colorNotMatchesLrig?: boolean; // センタールリグと共通する色を持たない。ENERGY_CARD対象では対象オーナー（＝相手エナなら相手）のルリグ基準で解決（WX21-035①等）
  colorNotMatchesOppLrig?: boolean; // 対戦相手のセンタールリグと共通する色を持たない（効果使用者基準。WXDi-P02-038）
  colorMatchesLastProcessed?: boolean; // 直前に処理したカード（lastProcessedCards[0]＝この方法でダウンしたルリグ等）と共通する色を持つか。owner非依存＝相手エナを自ルリグ色で絞る用途（WX25-P2-112）。参照不能なら空ヒット＝did-it ゲートを兼ねる。resolveDynamicFilterが解決
  colorMatchesUnderCards?: boolean; // 効果元シグニのスタック下カード群のいずれかと共通色。下カード無しは空ヒット
  colorMatchesCostTrashed?: boolean; // 直前の能力コストでトラッシュに置いたカード群のいずれかと共通色。記録無しは空ヒット
  colorExclude?: string | string[]; // この色を含むカードを除外（resolveDynamicFilterが解決後にセット）
  hasAcce?:   boolean; // アクセが付いている
  acceHost?:  boolean; // 「これにアクセされているシグニ」＝このカードがアクセとして装着されているホストシグニ。CONTINUOUS POWER_MODIFY のホスト宛バフ（calcFieldPowers の signi_acce ループが適用）。主体が場のシグニのときは自己適用しない
  // 「このカードの上にあるシグニ」＝このカードが**下に置かれている**スタックの最前面シグニ（＝ホスト）。
  // acceHost の兄弟で、装着経路が【アクセ】ではなくスタック下（下に置く）である点だけが違う。
  // AUTO/ACTIVATED は execPowerModify が sourceCardNum を含むスタックの頂点へ解決し、CONTINUOUS は
  // calcFieldPowers の「下カード→ホスト」ループが加算する（主体が場の最前面シグニのときは自己適用しない）。
  aboveSelf?: boolean;
  hasIcon?:   'クロス' | 'ライズ' | 'トラップ' | 'アクセ'; // 《Xアイコン》を持つカード（カードテキストのキーワード有無で判定する近似）
  /**
   * 出現条件アイコンを**持たない**シグニ（`WXDi-P07-041-E2`・§6.4 O-34(a) の母集団）。
   * ⚠原文の CSV では該当アイコンが `【　　】icon_txt_frame_null` という**レンダリング欠落**で入っており、
   *   同じ行の注記「（【ライズ】と【ハーモニー】は【　　】に含まれる）」だけが中身を示している。
   *   ＝**出現条件（ライズ／ハーモニー／出現条件）を持たないシグニ**として判定する近似。
   * 🔴従来はこの文が `GRANT_KEYWORD{keyword:'　　'}` に落ち、**自分のシグニにゴミキーワードを付与**
   *   するだけの無言 no-op だった（§6.4 O-28 と同じクラス）。
   */
  noDeployConditionIcon?: boolean;
  hasLifeBurst?: boolean; // 《ライフバースト》を持つカード
  infected?:  boolean; // 感染状態（ウィルスのあるゾーンのシグニ）
  isArmored?: boolean; // 血晶武装状態
  keyword?: string | string[];  // 【キーワード能力】or《キーワード》を持つカードのフィルタ（「【ライフバースト】を持つ」等）。配列はOR（いずれかを持つ）。【ランサー（条件）】等の括弧付き変種も含む
  // ─ 動的フィルタ（ON_LEAVE_FIELD系トリガーの収集時に具体値へ解決される。未解決時は無視）─
  levelBelowLeftCard?: boolean; // 場を離れたカードよりレベルが低い → level:{max:N-1} に解決（ミョルニル/花代・伍）
  powerBelowLeftCard?: boolean; // 場を離れたカードよりパワーが低い → powerRange.max:N-1 に解決（スノークイーン WX16-025）
  underLeftCard?: boolean;      // 場を離れたカードの下にあったカード → cardNames:[...] に解決（フンババ）
  levelLteFieldVirusCount?: boolean; // レベルが場（両プレイヤー）にある【ウィルス】の数以下 → level:{max:N}に解決（WX16-005）
  levelLteHandDiff?: boolean; // レベルが自分と対戦相手の手札枚数の差（self−opp）以下 → level:{max:N}に解決（「その枚数の差以下のレベルを持つ」WXK10-045。HAND_DIFF{gt,0} ゲート前提で差≥1）
  levelLteHandCount?: boolean; // レベルが効果使用者の現在の手札枚数以下。0枚なら level.max=0
  levelLteUnderSelfCount?: boolean; // レベルが効果元シグニの下にあるカード枚数以下。効果元不在は空ヒット、0枚なら level.max=0
  powerLteLastProcessed?: boolean; // パワーが直前に処理したシグニ（lastProcessedCards[0]）の実効パワー以下 → powerRange.max に解決（「ダウンしたそのシグニのパワー以下」WD04-018）
  powerLtLastProcessed?: boolean;  // パワーが直前に処理したシグニ（lastProcessedCards[0]）の実効パワー未満 → powerRange.max:N-1 に解決（「その後、そのシグニよりパワーの低い」＝場に出たシグニ基準。参照不能なら空ヒット。WXDi-P08-031）
  levelLteLastProcessed?: boolean; // レベルが直前に処理したシグニ（lastProcessedCards[0]）のレベル以下 → level.max に解決（「この方法で場に出たシグニのレベル以下」WX25-P1-039 等）
  levelLtLastProcessed?: boolean;  // レベルが直前に処理したシグニ（lastProcessedCards[0]）のレベル未満 → level.max:N-1 に解決（「その後、そのシグニより低いレベルを持つ」＝公開シグニ基準。参照不能なら空ヒット。WXK10-031）
  levelGtLastProcessed?: boolean;  // レベルが直前に処理したシグニ（lastProcessedCards[0]）のレベルより高い → level.min:N+1 に解決（「その後、…それよりレベルの高い」＝直前配置シグニ基準。参照不能なら空ヒット。WXEX2-28）
  levelEqLastProcessed?: boolean;  // レベルが直前に処理したシグニと同じ → level.min/max に解決（「この方法で【ビート】にしたシグニと同じレベル」WDK14-008）
  /**
   * レベルが**直前の離脱で公開された裏向き付けカード**（`facedown_revealed_just`）と同じ
   * → `level` に解決（§5.3 `O-81`・`WX16-003-E3`「そのカードと同じレベルの対戦相手のシグニ１体」）。
   * ⚠**収集時に `resolveLeaveFieldDynamicFilters` が確定させる**＝解決時にはマーカーが
   *   後続の離脱でクリアされうるので参照しない。参照不能なら `level:-1`＝空ヒット（過剰実行しない側）。
   */
  levelEqFacedownRevealed?: boolean;
  // レベルが「この方法でダウンしたルリグ」と同じ → level に解決（WX25-P1-112／WX24-P1-040。タスク12(cix)）。
  // 参照先は ①lastProcessedCards[0] がルリグならそれ（＝同一 SEQUENCE 内の DOWN。任意ダウンをスキップすると
  // 空になり did-it ゲートになる）②なければ ownerSt.last_lrig_down_cards（＝コスト経路。実UIでは支払いと効果
  // 解決が別 ExecCtx なので PlayerState 経由でしか届かない）。どちらも取れなければ空ヒット（過剰実行しない側）。
  levelEqLastDownedLrig?: boolean;
  // 色が「この方法でダウンしたルリグ」と共通する → color 配列に解決。参照元は levelEqLastDownedLrig と同じ2段。
  // ⚠ 効果内 DOWN 由来（lastProcessedCards）は既存の colorMatchesLastProcessed が担当＝こちらはコスト経路用。
  colorMatchesLastDownedLrig?: boolean;
  levelLteDiscardSigni?: boolean; // レベルが handDiscardSigni コストで捨てたシグニ（caster.last_discarded_signi_level）のレベル以下 → level.max に解決（「この方法で捨てたシグニのレベル以下」WX22-046/WXK10-044 等）
  levelLtDiscardSigni?: boolean;  // 捨てたシグニより低いレベル → level.max = 捨てレベル-1（「この方法で捨てたシグニより低いレベルを持つ」WXEX2-37）
  levelEqDiscardSigniOffset?: number; // 捨てたシグニのレベル+offset に一致 → level = 捨てレベル+offset（「レベルがNつ高い」WDK13-013=+1/WXK10-033=+2）
  classMatchesDiscardSigni?: boolean; // 捨てたシグニ（caster.last_discarded_signi_class）と共通するクラスを持つ → story に捨てクラストークンをOR展開（WXK10-033「それと共通するクラスを持つ」）
  // B2 動的閾値: パワーが「この方法で公開したシグニのレベルの合計×N」以下 → powerRange.max に解決（数値=乗数N。WX17-028「×1000」）。
  // 直前の REVEAL_DECK_TOP が ownerState.last_revealed_signi_level_sum に記録した合計を読む。
  powerLteRevealedSigniLevelSum?: number;
  // パワー／レベルが〈自分の指定ゾーンの一致枚数×per〉以下。resolveDynamicFilter が静的 range へ解決する。
  powerLteZoneCount?: CountFromZone;
  levelLteZoneCount?: CountFromZone;
  // パワーが直前に実処理したカード枚数×N以下（数値=N）。空ならpowerRange.max=0。
  powerLteLastProcessedCount?: number;
}

// ===== ターゲット =====

export interface EffectTarget {
  type:
    | 'SIGNI'
    | 'LRIG'
    | 'CENTER_LRIG_OR_SIGNI'
    | 'HAND_CARD'
    | 'DECK_CARD'
    | 'TRASH_CARD'
    | 'LRIG_TRASH_CARD'
    | 'LRIG_DECK_CARD'
    | 'ENERGY_CARD'
    /**
     * 手札とエナゾーンを**跨いだ単一の候補プール**から合計N枚を選ぶ（タスク12(lxi) 第11波）。
     * 原文「対象としたエナゾーンのカードと手札を**合計２枚**デッキの一番上に置く」（`WXK06-067-E1`）。
     * instanceId はデッキ配布時に1プレイヤー内で一意に採番されるため、選ばれた1枚がどちらのゾーンの
     * ものかは `hand.includes` / `energy.includes` で弁別できる（`resumeSelectTarget` の TRANSFER_TO_DECK
     * が既に両ゾーンを見ているのでそのまま動く）。
     */
    | 'HAND_OR_ENERGY_CARD'
    | 'LIFE_CLOTH_CARD'
    /**
     * 場のキー（`field.key_piece` ＋ `field.key_piece_extra`）を1枚ずつ選ぶ（§6.4 O-17）。
     * ⚠`RemoveAbilitiesAction.alsoKeys`（「すべてのキー」＝プレイヤー単位のフラグ）とは別物＝
     *   こちらは**1枚を選んで** `abilities_removed` に積む。読みはどちらも
     *   engine の `activeKeyAbilitySources` funnel が受ける。
     */
    | 'KEY'
    | 'PLAYER';
  owner: Owner;
  count: NumberOrRef | 'ALL'; // $ref='last_processed_count': 直前ステップでトラッシュ/処理した枚数（動的）
  /** count に直前の処理枚数を加算する（「この方法で～した枚数にNを加えた数」）。 */
  addLastProcessedCount?: boolean;
  countFromZone?: CountFromZone;
  filter?: TargetFilter;
  /** 直前の DESIGNATE_SIGNI_ZONE が保存した対象側のゾーンだけを場レベル効果の対象にする。 */
  zoneSource?: 'designated';
  /**
   * 「対戦相手の**すべての領域にある**シグニ」「対戦相手の**手札と場とエナゾーンとトラッシュにある**シグニ」
   * ＝場だけでなく手札・エナ・トラッシュも候補に含める（§6.4 O-17）。
   * ⚠デッキ／ライフは含めない＝この engine には**デッキ/ライフのカードの能力を参照する経路が無い**ので、
   *   含めても消費地点のない見せかけの実装になる。原文の「すべての領域」との差はここだけ。
   * ⚠現状の受け皿は `REMOVE_ABILITIES` だけ（`abilities_removed` は cardNum のリストでゾーン非依存）。
   */
  allZones?: boolean;
  upToCount?: boolean;   // count > 1 のとき「以上」を許容するか
  blind?: boolean;       // true = 対戦相手の手札を見ないで選ぶ（ランダム選択）
  actingPlayerSelects?: boolean; // true = 手札を見て自分が選ぶ（「手札を見てN枚選び捨てさせる」）
  totalPowerMax?: number; // 「パワーの合計がN以下になるように好きな数」: 選択カードの実効パワー合計の上限（count='ALL'と併用）
  selectionConstraint?: SelectionConstraint; // 候補単体ではなく、選択集合全体に対する相互制約
  totalLevelMax?: number; // 「レベルの合計がN以下になるようにM体まで」: 選択カードのレベル合計の上限（count=M・upToCount と併用。WDK13-007）
  fromTop?: boolean;     // DECK_CARD: デッキ上から count 枚を対象（「一番上を見る。それが〜の場合、場に出す」＝WX10-007/WX16-038）。execAddToField は deck.slice(0,count) で先頭前提
  fromLeftFieldUnder?: boolean; // ON_LEAVE_FIELD: 離場直前にトリガー元シグニの下にあったカードだけを候補にする
  /**
   * 原文が「〜を対象とし」で**プレイヤーに選ばせている**対象であることの刻印（§6.4 O-61）。
   * ⚠これが無いと `GRANT_KEYWORD` / `POWER_SET` / `POWER_MULTIPLY` の
   *   「このシグニ＝効果元へ無選択で適用する」ヒューリスティックが、
   *   `{type:'SIGNI',owner:'self',count:1}`（＝フィルタ無し）の**明示対象と見分けがつかず**
   *   選択UIを出さずに効果元へ適用してしまう（`WX25-P3-059-E1` の実機観測）。
   * ⚠BANISH 等は最初から `filter.thisCardOnly` だけを見る規約なのでこの刻印は不要＝
   *   上の3型だけが「フィルタ無し＝このシグニ」という緩い既定を持っていた。
   */
  explicitTarget?: boolean;
}

export interface SelectionConstraint {
  /**
   * 1回の選択集合を filter ごとの上限へ割り当てる。
   * 「＜A＞1枚と＜B＞1枚」「シグニ1枚とスペル1枚」のように、単一の aggregate filter では
   * 配分を表せない対象に使う。各カードは1群にだけ割り当てられ、count はその群の上限。
   * 選択自体が任意／候補不足の場合は、満たせる群だけを選べる（必須枚数は action 側の count が担う）。
   */
  groups?: Array<{ filter?: TargetFilter; count: number }>;
  distinct?: 'level' | 'name' | 'class';
  same?: 'name';
  sharedColor?: 'all' | 'none';
  /** 選択したカードのレベル合計をちょうど N にする。候補単体ではなく選択集合全体の制約。 */
  totalLevelExact?: number;
  /** 実行時に解決するレベル合計の一致値（「この方法で処理した枚数と同じ」）。 */
  totalLevelExactRef?: NumberOrRef;
  /** 選択したカードのレベル合計を N 以下にする（SEARCH／コストを含む共通経路）。 */
  totalLevelMax?: number;
  /** 実行時に解決するレベル合計の上限（「この方法で処理した枚数以下」）。 */
  totalLevelMaxRef?: NumberOrRef;
}

// ===== アクション =====

export type EffectAction =
  | DrawAction
  | BounceAction
  | BanishAction
  | SendToEnergyAction
  | PowerModifyAction
  | PowerSetAction
  | TrashAction
  | ExileAction
  | EnergyChargeAction
  | EnergyChargeFromDeckAction
  | LifeCrashAction
  | ShuffleDeckAction
  | RevealAction
  | AddToHandAction
  | AddToBeatAction
  | AddToEnergyAction
  | TransferToHandAction
  | AddToFieldAction
  | AddToLifeAction
  | FreezeAction
  | DownAction
  | UpAction
  | BlockActionAction
  | StoryChangeAction
  | GrantKeywordAction
  | SearchAction
  | PlaceSigniOnFieldAction
  | SequenceAction
  | RepeatAction
  | PreventRefreshAction
  | SelectColorAction
  | ChooseAction
  | ConditionalAction
  | LookAndReorderAction
  | TransferToDeckAction
  | CounterSpellAction
  | CostReductionAction
  | GrantProtectionAction
  | AttachCharmAction
  | AttachFacedownFromHandAction
  | RevealAndPickAction
  | LookPickChainAction
  | BanishRedirectAction
  | RearrangeSigniAction
  | SetBaseLevelAction
  | GrowFreeAction
  | ReturnAssistLrigToDeckAction
  | RemoveAbilitiesAction
  | PlayFreeAction
  | CostIncreaseAction
  | PowerModifyPerStackAction
  | PowerModifyPerFieldAction
  | PowerModifyPerLevelSumAction
  | PowerModifyPerLrigLevelAction
  | ForceEndTurnAction
  | CharmProtectionAction
  | MutualDiscardAndDrawAction
  | PowerModifyByTargetLevelAction
  | PowerModifyBySourceAction
  | PowerMultiplyAction
  | LevelModifyAction
  | PowerModifyPerCharmAction
  | PowerModifyPerEnergyAction
  | PreventDamageAction
  | ZoneMoveImmunityAction
  | SetLrigBaseLimitAction
  | ReserveDrawPhaseReplacementAction
  | EqualizeEnergyAction
  | VariableDiscardAndDrawAction
  | BanishSubstituteAction
  | StackSpellAction
  | ColorInheritAction
  | EnergyChargeByFieldCountAction
  | LookAtDeckAndLifeAction
  | GrowCostReductionAction
  | NameBanAction
  | SigniAttackBanAction
  | SigniDeployBanAction
  | AddExtraAttackPhaseAction
  | DelayToNextOppAttackPhaseAction
  | DelayToNextOppTurnEndAction
  | DelayToNextOwnTurnEndAction
  | PlaceFacedownLrigZoneAction
  | RevealFacedownLrigZoneAction
  | ReturnFacedownLrigZoneToHandAction
  | FieldSigniToCheckZoneAction
  | GainLrigTypeAction
  | DeclareCardNameLockAction
  | RevealBothDeckTopsAction
  | DeclareDeckTopIconAction
  | PlayFreeFromTrashAction
  | PowerThresholdTrashAction
  | PowerFlipAction
  | SelfTrashPreventAction
  | CostSubstituteAction
  | PowerModifyPerTrashedLevelAction
  | PowerModifyPerDeckCountAction
  | PowerModifyPerEnergyColorAction
  | PowerModifyPerTrashCountAction
  | PowerModifyPerLifeCountAction
  | PowerModifyPerHandCountAction
  | GainCoinAction
  | DiscardBothAction
  | RemoveCharmAction
  | ForceSigniAttackAction
  | ForceFrontSigniAttackAction
  | GrantLrigAbilityAction
  | GrantPlayerAbilityAction
  | DrawPhaseReplacementAction
  | PlaceVirusAction
  | AttachAcceAction
  | FieldSigniToAcceAction
  | BloodCrystalArmorAction
  | PowerModifyPerVirusCountAction
  | LrigLimitModifyAction
  | AddCraftToLrigDeckAction
  | RecollectGateAction
  | AltCostOppTurnAction
  | SetCardCostReplacementAction
  | BlockCardUseAction
  | DrawPerFieldCountAction
  | DrawPerLrigLevelAction
  | EnergyChargePerLrigLevelAction
  | EnergyChargeFromDeckPerFieldCountAction
  | AwakenSigniAction
  | NegateAttackAction
  | PlaceUnderSigniAction
  | PlaceUnderSourceSigniAction
  | PreventNextDamageAction
  | ReplaceNextDamageWithMillAction
  | LifeCrashReplaceAction
  | TakeFromUnderSigniAction
  | GrantEffectAction
  | InstallDelayedTriggerAction
  | RevealDeckTopAction
  | TrashRevealedAction
  | GrantSigniAboveAbilityAction
  | GrantFieldSigniAbilityAction
  | GrantFieldShadowAction
  | GrantAcceHostAbilityAction
  | GrantSoulHostAbilityAction
  | RevealUntilBanishSameLevelAction
  | RevealUntilAction
  | RevealUntilToHandAction
  | RevealUntilToFieldAction
  | PlaceLrigsUnderCenterAction
  | StubAction
  | SelfPlayRestrictAction
  | GainBondAction
  | MILLAction
  | UnknownAction;

export interface DrawAction {
  type: 'DRAW';
  owner: Owner;
  count: NumberOrRef;
  countFromZone?: CountFromZone;
  untilHandCount?: number; // 指定時、手札が N 枚になるまで（差の分だけ）引く。手札が N 枚以上なら引かない（WX05-003「手札が6枚より少ない場合、その差の分だけ引く」）
  addLastProcessedCount?: boolean; // 指定時、count に加えて直前の選択枚数（lastProcessedCards.length）分を引く（VARIABLE_DISCARD_AND_DRAW の「捨てた枚数＋bonus」用）
  perLastProcessedLevel?: boolean; // 指定時、count に加えて直前に公開/処理したカード（lastProcessedCards）のレベル合計 × count 分を引く（「公開したシグニのレベル１につきカードを１枚引く」WD21-001-E2）
}

// フィールドのシグニ N体につき M枚ドロー
export interface DrawPerFieldCountAction {
  type: 'DRAW_PER_FIELD_COUNT';
  drawPerUnit: number;        // シグニ1体ごとに引く枚数
  countFilter: TargetFilter;  // カウント対象シグニのフィルタ
  countOwner: Owner;          // カウントするフィールドのオーナー
}

// センタールリグのレベル1につき M枚ドロー（「あなたのセンタールリグのレベル１につきカードを１枚引く」WX12-013 等）
export interface DrawPerLrigLevelAction {
  type: 'DRAW_PER_LRIG_LEVEL';
  drawPerLevel: number;   // ルリグのレベル1につき引く枚数
  lrigOwner: Owner;       // どちらのセンタールリグのレベルを参照するか
  owner: Owner;           // 誰が引くか（通常 self）
}

// センタールリグのレベル1につき M枚エナチャージ（「あなたのセンタールリグのレベル１につき【エナチャージ１】をする」WXK10-004 等）
export interface EnergyChargePerLrigLevelAction {
  type: 'ENERGY_CHARGE_PER_LRIG_LEVEL';
  chargePerLevel: number; // ルリグのレベル1につきチャージする枚数
  lrigOwner: Owner;       // どちらのセンタールリグのレベルを参照するか
  owner: Owner;           // 誰がチャージするか（通常 self）
}

// フィールドのシグニ N体につき デッキトップ M枚をエナチャージ
export interface EnergyChargeFromDeckPerFieldCountAction {
  type: 'ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT';
  chargePerUnit: number;      // シグニ1体ごとにエナチャージする枚数
  countFilter: TargetFilter;  // カウント対象シグニのフィルタ
  countOwner: Owner;          // カウントするフィールドのオーナー
  owner: Owner;               // エナチャージするプレイヤー
}

// このシグニを覚醒させる（覚醒状態になる）
export interface AwakenSigniAction {
  type: 'AWAKEN_SIGNI';
  targetsLastProcessed?: boolean; // 直前に対象化/配置したシグニを覚醒（WXDi-P14 フェゾーネアーツ）
}

// シグニの下にカードを置く（デッキトップ・トラッシュ・手札から）
export interface PlaceUnderSigniAction {
  type: 'PLACE_UNDER_SIGNI';
  source: 'deck_top' | 'trash' | 'hand' | 'energy';
  count: number;
  upToCount?: boolean;
  filter?: TargetFilter;
  selectionConstraint?: SelectionConstraint;
}

// SELECT_TARGET の thenAction：選択カードをソースシグニの下に置く
export interface PlaceUnderSourceSigniAction {
  type: 'PLACE_UNDER_SOURCE_SIGNI';
  fromLocation: 'trash' | 'hand' | 'energy' | 'field';
}

// このターン、次にターゲットシグニ（またはルリグ）がアタックしたとき、そのアタックを無効にする
export interface NegateAttackAction {
  type: 'NEGATE_ATTACK';
  target: EffectTarget;
  // escapeDiscard: アタック側が手札をN枚捨てれば無効化を回避できる（「対戦相手が手札をN枚捨てないかぎり無効」。G154 BURST）
  escapeDiscard?: number;
  // attackingOnly: 原文「対戦相手の**アタックしている**シグニ1体を対象とし」＝候補を**いま宣言中のアタッカー**に限定する
  //（`pending_signi_battle` のゾーン頂点）。無指定の NEGATE_ATTACK は「次にアタックしたとき無効」＝場の全シグニが候補。
  // 進行中のアタックは `negated_attacks`（宣言時に見る事前登録）では止まらないため、実行側は
  // アタッカー state の `cancel_current_signi_attack` を立てる（Opusタスク12(cx)）。
  attackingOnly?: boolean;
}

// 自身出撃制限（【常】：このシグニ/カード/キーは〜場合にしか（新たに）場に出すことができない）。
// engine は通常召喚（handleSummonSigni）のチョークポイントで canSelfPlay により配置可否をゲートする。
// これは「対戦相手はシグニをN体まで」（DEPLOY_RESTRICT・場の枚数制限）とは別系統＝この効果を持つカード自身の召喚可否。
// 旧実装は「場に出す」を含むため bare ADD_TO_FIELD へ誤 parse され CONTINUOUS のまま inert no-op（＝制限が完全に失われていた）だった（Opusタスク12(xlix)）。
export interface SelfPlayRestrictAction {
  type: 'SELF_PLAY_RESTRICT';
  // never=true：通常召喚では一切場に出せない（効果でのみ配置可能）。「新たに場に出すことができない」無条件・「《X》の効果以外によっては」。
  never?: boolean;
  // condition：通常召喚を**許可**する条件。満たさないとき配置不可。省略時（未対応語彙＝ウィルス総数/アクセ総数/クロス状態/相手ディスカード等）は
  //   評価しない＝保守的に配置許可（＝従来の inert no-op と同値・退化なし）。
  condition?: Condition;
  rawText?: string; // 逆翻訳・原文照合用
}

export interface BounceAction {
  type: 'BOUNCE'; // フィールド→手札
  target: EffectTarget;
  optional?: boolean; // true = 「してもよい」（プレイヤーがスキップ可能）
  opponentSelects?: boolean; // 「対戦相手は対象の自分のシグニ1体を手札に戻す」：対戦相手が自分のシグニを選んで手札に戻す（target.owner='opponent'。WDK05-T20/WDK16-22）
  targetsStored?: boolean;
  fixedCardNums?: string[];
}

export interface BanishAction {
  type: 'BANISH';
  target: EffectTarget;
  optional?: boolean;    // true = 「してもよい」（プレイヤーがスキップ可能）
  conditional?: boolean; // true = 前ステップ（STUB等）が成功した場合のみ実行
  selfTrashCost?: boolean; // 「このシグニを場からトラッシュに置いてもよい。そうした場合〜バニッシュ」：対象を1体以上選んだ場合、効果元シグニ自身をコストとしてトラッシュ（WX21-052）
  opponentSelects?: boolean; // 「対戦相手は自分のシグニ1体を対象とし、それをバニッシュする」：対戦相手が自分のシグニを選んでバニッシュ（target.owner='opponent'）
  targetsLastProcessed?: boolean; // 直前ステップで選択したシグニをバニッシュ（追加コストの前に対象を固定する効果）
  targetsStored?: boolean; // STORE_LAST_PROCESSED_TARGETS で任意コスト前に固定した対象
  fixedCardNums?: string[]; // インタラクション生成時に固定済みの対象instanceId
}

// フィールドのシグニをエナゾーンに置く（エナ送り）。
// バニッシュとは別アクション＝「バニッシュされたとき」を誘発しない。最終的な行き先はエナだが
// バニッシュイベントではない（BANISHで代用しないこと）。Bounceの送り先がエナ版に相当。
export interface SendToEnergyAction {
  type: 'SEND_TO_ENERGY';
  target: EffectTarget;
  targetsStored?: boolean;
  fixedCardNums?: string[]; // インタラクション生成時に固定済みの対象instanceId（任意コストの pay 分岐で凍結）
  optional?: boolean; // true = 「してもよい」
  opponentSelects?: boolean; // 「対戦相手は自分のシグニ1体を選びエナゾーンに置く」
}

export interface PowerModifyAction {
  type: 'POWER_MODIFY';
  target: EffectTarget;
  delta: NumberOrRef; // 正=強化、負=弱体化
  excludeSelf?: boolean; // 「あなたの他のシグニ」: 効果元カード自身を対象から除外
  targetsTriggerSource?: boolean; // 「それ」= トリガー元シグニを自動対象（ctx.triggeringCardNum → ctx.sourceCardNum の順で解決）
  targetsLastProcessed?: boolean; // 「それ」= 直前ステップで選択/処理したシグニ(lastProcessedCards)へ適用（WXDi-P07-079「それが＜毒牙＞なら代わりに＋10000」。選択UIを出さず同一対象に適用）
  targetsStored?: boolean; // STORE_LAST_PROCESSED_TARGETS で任意コスト前に固定した対象
  // 「この方法で捨てた手札１枚につき－6000」（WX12-020-E3・タスク12(lx)②）＝倍率元が**現在の手札枚数ではなく
  // 直前ステップで実際に処理した枚数**（lastProcessedCards.length）。delta は1枚あたりの値として扱う。
  // ⚠ 現在の手札枚数比例は別型 POWER_MODIFY_PER_HAND_COUNT（handOwner の手札を数える）。混同しないこと。
  deltaPerLastProcessedCount?: boolean;
  /**
   * `deltaPerLastProcessedCount` の**倍率元を絞る／単位を変える**（§5.3 `O-80` 第1バッチ・2026-08-26）。
   * 省略＝従来どおり `lastProcessedCards.length`（絞り込みなし・1枚単位）。
   *
   * 🔴**これが無かった間、この文型は丸ごと `STUB{POWER_MOD_PER_COUNT}` の catch-all に落ちていた**＝
   *   engine が**カード全文 regex** で「N枚につき±X」だけを読み、
   *   ①`黒の`／`＜悪魔＞の`／`スペル` といった**絞り込みを完全に無視して直前処理カードを全部数え**
   *   ②「レベルの合計1につき」を**枚数**として数え
   *   ③さらに**負のデルタは問答無用で相手の全シグニへ**適用していた（原文は「対戦相手のシグニ**１体**を
   *     対象とし、**それの**パワーを」）＝**数と対象の二重の過剰実行**だった。
   * ⇒ parser が修飾句を外した文を通常経路で解いて `POWER_MODIFY`（正しい `target` つき）を作り、
   *   倍率だけをこの payload で足す。
   */
  perLastProcessed?: {
    /** 数える対象の絞り込み（「**黒の**シグニ1枚につき」「**＜悪魔＞の**シグニ1枚につき」）。 */
    filter?: TargetFilter;
    /** `'level_sum'`＝「〜の**レベル(の合計)1**につき」。省略＝枚数。 */
    unit?: 'cards' | 'level_sum';
    /** 「**N枚**につき」の N（既定1）。端数は切り捨て。 */
    divisor?: number;
  };
  /**
   * 「そのシグニのレベル１につき±N」＝**対象シグニ自身のレベル**が倍率（§6.4 O-16(a)）。delta は
   * レベル1あたりの単価として扱う。⚠現状の受け皿は**ゾーン継続の場レベル grant**（`FieldGrant{kind:'power',
   * perTargetLevel:true}`）だけ＝`zoneSource:'designated'` + `count:'ALL'` の経路でのみ意味を持つ。
   * ⚠`deltaPerLastProcessedCount`（直前ステップの処理枚数）とは倍率元が別物。
   */
  deltaPerTargetLevel?: boolean;
  deltaFromOppPowerDecrease?: boolean; // 「減った値と同じだけ＋する」（毒牙 WX13-036/WXEX2-52）。delta を収集時に直前の対戦相手パワー減少量で動的に上書き（ON_OPP_POWER_DECREASED と併用）
  /**
   * 「〈ゾーン〉にある〈filter〉のカード１枚につき±N」（§6.4 O-3・`WX26-CP1-066-E1`）。
   * `CountFromZone.per` に1枚あたりの値を入れ、`resolveCountRef` が枚数×per を返す＝delta は無視される。
   * ⚠**`delta` に `{$ref}` を書いてはいけない**＝`execPowerModify` の既定は `resolveNum` で、
   *   `resolveNum` は `{$ref}` を問答無用で 0 にする（＝無言でパワー±0 になる）。
   * ⚠常在の `POWER_MODIFY_PER_ENERGY` とは別物（あちらは CONTINUOUS 専用・filter 無し・期間なし）。
   */
  deltaFromZone?: CountFromZone;
  duration?: EffectDuration; // 'UNTIL_OPP_TURN_END' のとき power_mods_until_opp_turn へ（省略時はターン終了まで＝temp_power_mods）
  /** NEXT_TURN の基準。next=解決中のグローバルターンの次（isOwnerTurn で self/opponent を確定）。 */
  nextTurnOwner?: 'self' | 'opponent' | 'next';
  /** 「このターンと次のターン」＝従来どおり現盤面へ適用し、同時に場レベル予約も作る。 */
  appliesThisTurn?: boolean;
  /** 場レベル active 中に毎回評価する条件。 */
  fieldCondition?: import('./index').FieldGrantCondition;
}

export interface PowerSetAction {
  type: 'POWER_SET';
  target: EffectTarget;
  value: NumberOrRef;
}

// カードをゲームから除外する（トラッシュ等から取り除く。除外ゾーンは未実装のため取り除き＝消去で近似）。
// 選択したカードを lastProcessedCards に記録（「それらが共通する色を持つ場合」等の後続条件参照用。WDK10-008）。
export interface ExileAction {
  type: 'EXILE';
  target: EffectTarget; // TRASH_CARD / SIGNI / HAND_CARD など除外元
  blind?: boolean;      // 「見ないで選び」（伏せたまま選ぶ＝相手が選ぶ。WX14-011①）
  targetsStored?: boolean;
  fixedCardNums?: string[];
}

export interface TrashAction {
  type: 'TRASH'; // 指定カードをトラッシュへ
  target: EffectTarget;
  destination?: 'trash' | 'lrig_trash'; // 場からの移動先。省略時は従来どおりトラッシュ
  asCost?: boolean; // true = 効果処理ではなくコスト支払いによる field→trash（ON_TRASH byEffect を発火させない原因追跡用）
  opponentSelects?: boolean; // 「対戦相手は自分の〜1枚を対象とし、それをトラッシュに置く」：対戦相手が自分のカードを選んでトラッシュ（target.owner='opponent'。WX04-009）
  bestEffort?: boolean; // true = 対象がなくても後続SEQUENCEをスキップしない（「手札を1枚捨て、カードをN枚引く（捨てられなくても引く）」の捨て。WDK06-R20/WDK14-022）
  optional?: boolean; // true =「捨ててもよい」（スキップ可。スキップ時は後続の CONDITIONAL(IS_MY_TURN)=「そうした場合」を実行しない。WXDi-D08-013/P14-084）
  targetsStored?: boolean;
  // 「そのシグニ」= トリガー元シグニ（場に出た／アタックした相手シグニ）を無選択で対象（ctx.triggeringCardNum → ctx.sourceCardNum）。
  // REMOVE_ABILITIES 等と同形。タスク12(lxi) 第3波で追加（WXEX2-25-E1「そのシグニを場からトラッシュに置く」）。
  targetsTriggerSource?: boolean;
  fixedCardNums?: string[];
  // 「手札がN枚になるようにカードを捨てる」＝**現在の手札枚数との差**だけ捨てる（DrawAction.untilHandCount の対）。
  // 従来は「閾値−N」を固定枚数で焼き込んでおり、閾値ちょうどのときしか正しくなかった（WX18-032-E2・タスク12(lxiv)②）。
  untilHandCount?: number;
}

export interface EnergyChargeAction {
  type: 'ENERGY_CHARGE';
  target: EffectTarget; // エナゾーンに置くカード（手札やトラッシュから指定して選ぶ場合）
  asCost?: boolean; // true = 任意【出】の handToEnergy 支払い。移動札レベルを直後の本体filter用に記録する
}

// 【エナチャージN】：デッキ上からN枚をエナゾーンに置く（選ばない）
export interface EnergyChargeFromDeckAction {
  type: 'ENERGY_CHARGE_FROM_DECK';
  owner: Owner;
  count: NumberOrRef;
  countFromZone?: CountFromZone;
}

export interface LifeCrashAction {
  optional?: boolean;
  type: 'LIFE_CRASH';
  owner: Owner;
  count: NumberOrRef;
  triggerBurst: boolean; // ライフバーストを発動するか
  conditional?: boolean; // true=前ステップ（自ライフをトラッシュ等）が lastProcessedCards を残した場合のみ実行（「そうした場合」）
}

export interface ShuffleDeckAction {
  type: 'SHUFFLE_DECK';
  owner: Owner;
}

export interface RevealAction {
  type: 'REVEAL'; // 直前に選んだカードを公開
  source?: EffectTarget; // 指定がある場合は手札等から特定のカードを公開
  optional?: boolean; // true = 手札の全公開などを実行する／しないの二択
}

export interface AddToHandAction {
  type: 'ADD_TO_HAND'; // SEARCH内で直前に選んだカードを手札へ
  owner: Owner;
}

// SEARCH/LOOK_PICK_CHAIN 内で直前に選んだカード（公開中のデッキ等）を【ビート】にする（beat_zone へ＋ON_BECOME_BEAT 用フラグ）。WDK14-008
export interface AddToBeatAction {
  type: 'ADD_TO_BEAT';
  owner: Owner;
}

// SEARCH内で直前に選んだカードをエナゾーンへ
export interface AddToEnergyAction {
  type: 'ADD_TO_ENERGY';
  owner: Owner;
}

// 指定カードを1枚ずつ場に出す（ゾーン選択を順次チェーン）。
// SEARCH→ADD_TO_FIELD で複数枚を場に出す際、各カードのゾーン選択を1枚ずつ確実に解決するために使う（WX04-036-E1）。
export interface PlaceSigniOnFieldAction {
  type: 'PLACE_SIGNI_ON_FIELD';
  owner: Owner;
  cardNums: string[];        // 場に出すカード（デッキ/トラッシュ等から。applyDirectActionが現領域から除去）
  asDown?: boolean;          // ダウン状態で出す
  afterAction?: EffectAction; // 全カード配置後に実行（SHUFFLE_DECK 等）
  /** 全配置完了後に復元する公開snapshot。配置対象だけの一時 lastProcessedCards と区別する。 */
  lastProcessedCardsAfter?: string[];
  /** 配置ゾーンの選択を対戦相手自身に行わせる（§6.4 O-2）。ADD_TO_FIELD の同名フラグへそのまま渡す。 */
  opponentSelectsZone?: boolean;
}

// トラッシュ・エナ・ライフクロスなど任意の場所から手札へ移動
export interface TransferToHandAction {
  type: 'TRANSFER_TO_HAND';
  source: EffectTarget; // どこから何を（TRASH_CARD, ENERGY_CARD など）
  /** 同じ移動元から異なる条件の組をそれぞれ選ぶ。source と併用せず、source の owner/type を共有する。 */
  transferGroups?: { count: number; filter?: TargetFilter }[];
}

// デッキ上または手札からライフクロスに加える
export interface AddToLifeAction {
  fromSearch?: boolean;
  type: 'ADD_TO_LIFE';
  owner: Owner;
  count: NumberOrRef;
  fromTop: boolean; // true=デッキ上から
  fromHand?: boolean; // true=手札から1枚選ぶ
  fromTrash?: boolean; // true=トラッシュから選ぶ
  fromBottom?: boolean; // true=デッキの**一番下**から（`WXK03-066`「デッキの一番下のカードをライフクロスに加える」）
  /**
   * true=**エナゾーン**から選ぶ（`WXDi-P08-038`「このシグニをエナゾーンからライフクロスに加える」）。
   * ⚠バニッシュでエナへ行った**自分自身**を戻す文型なので、必ず `filter.thisCardOnly` と対で使う
   *   （落とすと**エナのどのカードでもライフに置ける過剰実行**になる）。`ADD_TO_FIELD`／`TRANSFER_TO_HAND`
   *   の `source:{type:'ENERGY_CARD', filter:{thisCardOnly:true}}` と同じ規約。
   */
  fromEnergy?: boolean;
  fromField?: boolean; // true=場のシグニを選んで、そのオーナーのライフクロスへ移す
  target?: EffectTarget; // fromField 時の対象。省略時は owner 側のシグニ1体
  targetsStored?: boolean; // fromField 時、STORE_LAST_PROCESSED_TARGETS で固定した対象だけを移す
  opponentSelects?: boolean; // true=対戦相手が選ぶ
  /**
   * fromTrash／fromEnergy のときの候補絞り込み（「【ライフバースト】を持たないカード」「＜龍獣＞のシグニ」
   * 「このシグニを」等）。
   * ⚠**落とすとそのゾーンのどのカードでもライフに置ける過剰実行**になる（原文は必ず種別か「この〜」を書く）。
   * `matchesFilter` がそのまま消費する＝`hasLifeBurst` / `story` / `cardType` は既に両評価器に実装済み。
   * ⚠**`thisCardOnly` だけは `matchesFilter` が黙って無視する**ので `execAddToLife` 側で剥がして候補を絞る。
   */
  filter?: TargetFilter;
}

export interface AddToFieldAction {
  targetsTriggerSource?: boolean;
  type: 'ADD_TO_FIELD'; // 直前に選んだカードをフィールドへ（コスト不要で出す）
  owner: Owner;
  source?: EffectTarget; // トラッシュ・エナ・手札など出処が明示される場合
  asDown?: boolean;      // true = ダウン状態で場に出す
  cardName?: string;     // ゲーム外からトークンを生成して場に出す場合のCardNum
  optional?: boolean;    // true =「場に出してもよい」（出す/出さないを選択可能にする）
  // suppressOnPlay: true =「その（それらの）シグニの【出】能力は発動しない」＝この配置で場に出したシグニ自身の
  // ON_PLAY を発火させない（他シグニの watcher 反応は従来どおり発火）。旧・全体 BLOCK_ACTION{ON_PLAY_ABILITY}
  // （engine 未参照の死アクション）を parser の foldSuppressOnPlay が配置アクションへ畳み込んだ忠実表現。
  // ADD_TO_FIELD の自身 ON_PLAY 収集経路が、このフラグを配置効果単位のゲートとして消費する。
  suppressOnPlay?: boolean;
  /**
   * true = 配置ゾーンの選択を**対戦相手自身**に行わせる（「対戦相手は…場に出し」）。§6.4 O-2。
   * ⚠既定（未指定）は従来どおり効果オーナーが選ぶ。`owner:'opponent'` だけを条件に相手応答へ倒すと
   *   既存の「相手の場に出す」効果の応答者まで変わるため、**明示フラグでのみ**切り替える。
   */
  opponentSelectsZone?: boolean;
}

export interface FreezeAction {
  type: 'FREEZE'; // 凍結付与
  target: EffectTarget;
  down?: boolean; // true=「ダウンし凍結」：同一対象をダウンも行う。省略時は凍結のみ（現在のアップ/ダウン状態は変えない）
  targetsStored?: boolean; // STORE_LAST_PROCESSED_TARGETS で固定した対象（「それを凍結する」。タスク12(lxiv)）
}

export interface DownAction {
  type: 'DOWN'; // ダウン
  target: EffectTarget;
  optional?: boolean; // true =「ダウンしてもよい」（スキップ可能。スキップ時は後続の CONDITIONAL(IS_MY_TURN)=「そうした場合」を実行しない。WD12-013/015）
  targetsStored?: boolean; // STORE_LAST_PROCESSED_TARGETS で固定した対象（「それをダウンする」。タスク12(lxiv)）
}

export interface UpAction {
  type: 'UP'; // アップ
  target: EffectTarget;
  targetsTriggerSource?: boolean; // 「それ」= トリガー元シグニ（ダウン状態で場に出たシグニ等）をアップ（ctx.triggeringCardNum → ctx.sourceCardNum）
  targetsBattleAttacker?: boolean; // 「そのアタックしているシグニ」= バトルを行ったアタッカー自身をアップ（ctx.battleAttackerCardNum。ON_SIGNI_BANISH_OPPONENT any_ally 等・能力ホストと攻撃者が別カードになりうるため thisCardOnly/targetsTriggerSource とは別軸。WX17-032）
  targetsStored?: boolean; // STORE_LAST_PROCESSED_TARGETS で固定した対象（「それをアップする」。タスク12(lxiv)）
}

export interface BlockActionAction {
  type: 'BLOCK_ACTION'; // アクションを封じる
  target: EffectTarget; // 封じる対象プレイヤー
  actionId: string;     // 封じるアクションID（例: 'ATTACK_SIGNI'）
  until: 'END_OF_TURN' | 'NEXT_TURN' | 'PERMANENT' | 'END_OF_GAME' | 'END_OF_ATTACK';
  /** 「このターン、あなたのシグニの【出】能力は発動しない」。PlayerState のターンフラグへ書き込む。 */
  suppressSigniOnPlayThisTurn?: boolean;
  /** 「他のシグニN体を場からトラッシュに置かないかぎりアタックできない」の解除コスト。 */
  attackCost?: { fieldTrash: { count: number; excludeSelf?: boolean } };
}

export interface StoryChangeAction {
  type: 'STORY_CHANGE'; // story_overridesを書き換える
  target: EffectTarget;
  newStory: string;
}

export interface SearchAction {
  type: 'SEARCH';
  from: { location: CardLocation; owner: Owner };
  filter: TargetFilter;
  maxCount: NumberOrRef; // {$ref:'last_processed_count'} = 直前にバニッシュ/トラッシュ等した枚数（WX04-036-E1「同じ枚数」）
  upToTarget?: boolean;  // true: maxCount まで任意（0枚可）／false: maxCount 枚必須。省略時は既存互換で任意
  selectionConstraint?: SelectionConstraint;
  revealPicked?: boolean; // 探したカードを公開する（SEARCH UI 後に公開ログへ記録）
  handOrField?: boolean; // 探したシグニを「手札に加える or 場に出す」から選ぶ。true のとき then は行き先選択の基準だけに使う
  // 見つかったカードに対して行う処理（REVEAL→ADD_TO_HAND など）
  then: EffectAction;
  // サーチ完了後に行う処理（SHUFFLE_DECK など）
  afterSearch?: EffectAction;
}

export interface SequenceAction {
  type: 'SEQUENCE';
  steps: EffectAction[];
  /** Resolve all direct conditional gates from one incoming result snapshot. */
  snapshotLastProcessedForConditionals?: boolean;
}

/** 同じ action を count 回、インタラクションを含めて順番に解決する。 */
export interface RepeatAction {
  type: 'REPEAT';
  count: number;
  /**
   * 回数を実行時に解決する（§5.3 `O-87`・`WX16-017-E1`
   * 「この方法で手札に加えた【トラップ】**１つにつき**手札からカード１枚を…設置する」）。
   * 指定時は `count` より優先し、`resolveCountRef` で解く（`{$ref:'last_processed_count'}` 等）。
   * ⚠**0 に解決したら1周も回さない**（原文どおり＝1枚も戻せなかったら設置もしない）。
   */
  countRef?: NumberOrRef;
  action: EffectAction;
  /**
   * 「あなたはこの効果を**あとN回まで繰り返してもよい**」（`WX16-042-E1`・§6.4 O-32）＝
   * 各周回の**前**に「繰り返す／繰り返さない」を問い、断られたらそこで打ち切る。
   * 省略時は従来どおり N 回すべて強制（「以下をN回行う」）。
   */
  optional?: boolean;
}

/**
 * 発生源プレイヤーのリフレッシュを「このターンと次のターンの間」禁止する。
 * 寿命は既存の *_until_opp_turn family と同じ＝次の相手ターン終了時（＝自分の次ターン開始時）に解除。
 */
/**
 * `SELECT_COLOR`（§5.3 `O-87`・2026-08-26）＝**色を選択する**（選んだ色は `SELECTED_COLOR` 条件が読む）。
 *
 * `from` が「どこから選べる色を導くか」＝**この1点で原文の2形を分ける**：
 *  - `'energy'`＝「あなたのエナゾーンにあるカードが持つ色から**最大N色**まで選ぶ」（`WX10-025`）。
 *    `count` が上限（省略＝1）。
 *  - `'last_processed'`＝「この方法で手札に加えた**カード１枚につきそのカードに含まれる色１つ**を選択する」
 *    （`WX12-Re07`）＝**直前に処理した各カードごとに、そのカードが持つ色から1つ**。
 *    1色しか持たないカードは選ぶ余地が無いので自動確定する。
 *
 * ⚠**旧 `STUB{CHOOSE_COLOR_FROM_LIST}` はカード全文を `最大N色` で読んでいた**（§5.3 `O-60` A群）。
 *   payload 化してその regex を撤去した＝engine は JSON だけを見る。
 */
export interface SelectColorAction {
  type: 'SELECT_COLOR';
  from: 'energy' | 'last_processed';
  /** `from:'energy'` の選択上限（省略＝1）。`'last_processed'` では未使用（枚数＝処理カード数）。 */
  count?: number;
  /**
   * 内部用: `from:'last_processed'` の**残りカード**（段間 continuation）。JSON には書かない。
   * ⚠**存在＝2周目以降**＝既に選んだ色をクリアしない目印も兼ねる。
   */
  _cards?: string[];
}

export interface PreventRefreshAction {
  type: 'PREVENT_REFRESH';
}

export interface ChooseAction {
  type: 'CHOOSE';
  choose_count: number; // N個選ぶ（upTo=trueなら最大N個）
  from_count: number;   // M個の選択肢から
  choices: ChoiceOption[];
  upTo?: boolean;        // true = 「N個まで」（1〜N個選択可）
  recollect?: {          // <プリオケ>条件達成時に choose_count/upTo を上書き（※命名は歴史的経緯。トラッシュの<プリオケ>数で判定）
    minCount: number;       // トラッシュの<プリオケ>カード数の閾値
    thenChooseCount: number; // 条件達成時のchoose_count
    thenUpTo?: boolean;      // 条件達成時のupTo
  };
  recollectArts?: {      // 《リコレクトアイコン》条件達成時に choose_count/upTo を上書き（ルリグトラッシュのアーツ枚数で判定、使用中アーツ自身は除外）
    minArts: number;        // ルリグトラッシュのアーツ枚数の閾値
    thenChooseCount: number; // 条件達成時のchoose_count
    thenUpTo?: boolean;      // 条件達成時のupTo
  };
  betChoose?: {          // 「あなたがベットしていた場合、代わりにMつ(まで)選ぶ」＝ベット宣言時に choose_count/upTo を上書き（is_betting_this_effect で判定・recollectArts と同型）
    thenChooseCount: number; // ベット時のchoose_count
    thenUpTo?: boolean;      // ベット時のupTo
  };
  /** 使用前に相手ウィルスをminRemoved個以上取り除いた場合の選択数上書き。 */
  preUseVirusChoose?: { minRemoved: number; thenChooseCount: number; thenUpTo?: boolean };
  /** 直前の任意追加コストを支払った場合の選択数上書き。支払い結果は選択提示時に消費する。 */
  additionalCostChoose?: { thenChooseCount: number; thenUpTo?: boolean };
  /**
   * 汎用の選択数上書き（§6.4 O-11）＝「〈盤面条件〉の場合、代わりにNつ(まで)選ぶ」。
   * ⚠上の5本（`recollect`／`recollectArts`／`betChoose`／`preUseVirusChoose`／`additionalCostChoose`）は
   *   **トリガーを型名に焼き込んだ特殊形**で、素の盤面条件を表せなかった。ここは `Condition` を
   *   そのまま持ち engine の `evalCondition` に委ねる＝条件語彙が増えても CHOOSE 側を触らずに済む。
   */
  conditionChoose?: { condition: Condition; thenChooseCount: number; thenUpTo?: boolean };
  /**
   * **選択数そのものが実行時に決まる**形（§6.4 O-11）。`conditionChoose` が「条件を満たしたら定数へ差し替え」
   * なのに対し、こちらは `choose_count` を丸ごと `NumberOrRef` で解決する。
   * ・「以下の２つから、**この方法で捨てたシグニの枚数と同じ数だけ**選ぶ」（`PR-328`）＝`last_processed_count`
   * ・「以下の３つから**対戦相手のセンタールリグのルリグタイプ１つにつき１つまで**選ぶ」（`PR-471`）
   * 🔴これが無かった頃は**カードごと受け皿 STUB に落ちて①②③が1つも実行されない**真 no-op だった。
   */
  countChoose?: { count: NumberOrRef; countFromZone?: CountFromZone; upTo?: boolean };
  /**
   * 「**同じ選択肢を２回以上選んでもよい**」（§6.4 O-29・`WX17-003-E1`／`WX22-016-E1`）。
   * ⚠**engine（`resumeChoose`）は最初から重複 id を受けられる**（`['c1','c1']` を順に実行する）＝
   *   本当の穴は **UI が `Set<string>` で持っていた**ことだった。ここを立てると UI が回数マップへ切り替わる。
   * ⚠従来この語彙が無かったため、`WX17-003-E1` は**カード全文を実行時に regex で読む受け皿 STUB**
   *   （`CHOOSE_SAME_OPTION_TWICE`＝§6.4 O-20 で潰した型の生き残り）で「1つずつN周」を近似しており、
   *   **「Nつ**まで**」の upTo が落ちて必ずN回選ばされる**過剰実行でもあった。
   */
  allowRepeat?: boolean;
  opponentResponds?: boolean; // true = 対戦相手が選択する（「対戦相手はカードを1枚引くか【エナチャージ1】してもよい」等）
  /** 支払いを伴わない相手選択。PendingInteraction へ渡し、相手任意コスト経路への誤配線を防ぐ。 */
  costlessOpponentChoice?: boolean;
}

export interface ChoiceOption {
  choiceId: string;
  label: string;
  action: EffectAction;
  condition?: Condition; // この選択肢を選べる条件（なければ常に選択可）
}

// 条件によって異なるアクションを実行する（if/else）
export interface ConditionalAction {
  type: 'CONDITIONAL';
  condition: Condition;
  then: EffectAction;
  else?: EffectAction;
}

// デッキの上からN枚を見て、順番を選んでデッキに戻す（いわゆるスクライ）
export interface LookAndReorderAction {
  type: 'LOOK_AND_REORDER';
  source: { location: CardLocation; owner: Owner };
  /** `'ALL'`＝そのゾーンの全部（「あなたの**すべての**ライフクロスを見て」＝`WX05-010-E1`・§6.4 O-4）。 */
  count: NumberOrRef | 'ALL';
  /** true＝「N枚まで見て」: 見る前に0..N枚を選ぶ。省略/falseは従来どおりN枚固定。 */
  upToCount?: boolean;
  private: boolean;   // true = 自分だけ確認（相手に見せない）
  reorder: boolean;   // true = 順番を自由に決められる
  canTrash?: boolean; // true = 一部をトラッシュに置ける（残りをデッキに戻す）
  shuffle?: boolean; // 戻すカードをシャッフルする（公開したカードをシャッフルしてデッキ下へ）
  revealTopAfterReorder?: boolean; // 戻した後にデッキトップ1枚を公開（ホログラフ置換）
  destination: {
    location: CardLocation;
    owner: Owner;
    // split_top_bottom: 見た中から好きな枚数を一番上へ、残りを一番下へ振り分ける（G168）
    position: 'top' | 'bottom' | 'any' | 'split_top_bottom';
  };
}

// キーワード能力を付与する（【ランサー】【ダブルクラッシュ】など）
export interface GrantKeywordAction {
  type: 'GRANT_KEYWORD';
  target: EffectTarget;
  keyword: string;
  duration: EffectDuration;
  /** duration:NEXT_TURN の基準。省略時は従来どおり「次の自分のターン」。 */
  nextTurnOwner?: 'self' | 'opponent' | 'next';
  /** 「このターンと次のターン」＝現ターンのスナップショット付与＋次ターンの場レベル予約。 */
  appliesThisTurn?: boolean;
  /** 場レベル active 中に毎回評価する条件。 */
  fieldCondition?: import('./index').FieldGrantCondition;
  targetsLastProcessed?: boolean; // 「それ」= 直前ステップで選択/処理したシグニ(lastProcessedCards)へ付与（WX03-046「打突」等。選択UIを出さず同一対象に付与）
  targetsStored?: boolean;        // 対象宣言→任意コストを跨いで storedTargetCards の同一対象へ付与
  targetsTriggerSource?: boolean;  // 「このシグニ/それ」= トリガー元シグニ（ctx.triggeringCardNum → ctx.sourceCardNum）へ無選択付与（ON_ZONE_MOVED self 等）
}

// 複合能力（CardEffect）をシグニ/ルリグに付与する
export interface GrantEffectAction {
  type: 'GRANT_EFFECT';
  target: EffectTarget;
  effect?: CardEffect;     // 付与するエフェクト（AUTO/ACTIVATED/CONTINUOUSなど）。rawText からパース後に展開される
  rawText?: string;        // 引用「…」の原文（パース中の一時フィールド。expandGrantEffectRawTexts が effect へ展開後に削除）
  duration: EffectDuration;
  targetsLastProcessed?: boolean; // 「それ」= 直前ステップで選択/処理したシグニ(lastProcessedCards)へ付与（WX04-094。選択UIを出さず同一対象に付与）
}

// 「このターン、…したとき、…」＝1ターン限りのプレイヤーレベル遅延条件トリガーを設置する（B3・WX25-CP1-069）。
// 設置時点では何もせず、後続のトリガー（trigger.timing）がそのターン中に発火したとき effect を実行。ターン終了時に消滅。
// 特定シグニへの能力付与（GRANT_EFFECT）と異なり、設置後に出たシグニ・プレイヤーレベルの誘発を捕捉できる。
export interface InstallDelayedTriggerAction {
  type: 'INSTALL_DELAYED_TRIGGER';
  duration: 'THIS_TURN' | 'THIS_ATTACK_PHASE';
  once?: boolean;                 // 「次に」＝最初の発火時だけ収集し、設置を消費する。省略時は期間中毎回発火
  sourceCardNum?: string;         // 設置元カード番号。executor が設置時の ExecCtx から焼き込み、発火時の sourceCardNum を復元する
  trigger: {
    timing: string;               // 発火タイミング（例: 'ON_OPP_LIFE_CRASHED' / 'ON_REFRESH'）
    crasherFilter?: TargetFilter; // 発火源シグニの条件（例: 青の＜ブルアカ＞）。⚠engine は「場に該当シグニがいるか」で近似判定（実際のクラッシュ源シグニは未追跡）
    refreshedOwner?: 'self' | 'opponent' | 'any'; // ON_REFRESH の発生源プレイヤー（設置者から見て）。省略=any。WX11-024=opponent
    leftOwner?: 'self' | 'opponent' | 'any';       // ON_LEAVE_FIELD の離脱カード所有者（設置者から見て）。省略=any
    triggerFilter?: TargetFilter;                  // ON_LEAVE_FIELD の離脱カード条件
    attackerOwner?: 'self' | 'opponent' | 'any';   // ON_ATTACK_SIGNI のアタッカー所有者（設置者から見て）。省略=any。WXK05-009-E2=opponent（タスク12(lxi) 第8波）
    /** ON_SIGNI_DOWN のダウンしたシグニの所有者（設置者から見て）。省略=any。`WX05-042`＝self（§6.4 O-11） */
    downedOwner?: 'self' | 'opponent' | 'any';
    /**
     * ON_CARD_MILLED_FROM_DECK の発生源デッキ（設置者から見て）。省略=self。
     * §5.3 `O-73`＝`WX24-P3-030-E2`「このターン、あなたの効果１つによって**デッキから**カードが
     * 合計１枚以上トラッシュに置かれたとき、」。**通常の【自】側と同じキー名**（`milledDeckOwner` /
     * `milledMinCount`）にして、collector が同じ読み方をできるようにしている。
     */
    milledDeckOwner?: 'self' | 'opponent' | 'any';
    /** ON_CARD_MILLED_FROM_DECK の最低ミル枚数（その解決単位で）。省略=1。 */
    milledMinCount?: number;
    /**
     * 「**あなたのメインフェイズの間**、〜したとき」＝メインフェイズかつ設置者のターンのときだけ発火。
     * ⚠期間（`duration:'THIS_TURN'`）とは別軸＝設置は turn 全体に残るが**発火窓はメインだけ**。
     */
    duringOwnMainPhase?: boolean;
  };
  /**
   * 発火時に満たしていなければならない盤面条件（§6.4 O-11・`WX05-042` の「それがこのターンで３回目である場合」）。
   * ⚠**収集時に評価する**＝満たさない回は entry を作らない（作ってから中で分岐すると
   *   `once` が1回目の非成立で消費されてしまう）。
   */
  fireCondition?: Condition;
  effect: EffectAction;           // 発火時に実行するアクション
  conditional?: boolean;          // 「そうした場合」＝直前ステップ（任意コスト等）が成功したときのみ設置
}

// B2 動的閾値: あなたのデッキの上からカードをN枚公開する（ピックしない）。公開したシグニのレベル合計を
// ownerState.last_revealed_signi_level_sum に、公開カード番号を last_revealed_deck_cards に記録する。
// 後続の動的閾値フィルタ（powerLteRevealedSigniLevelSum）と TRASH_REVEALED が参照する。WX17-028。
export interface RevealDeckTopAction {
  type: 'REVEAL_DECK_TOP';
  owner: Owner;
  count: number;
}

// B2: 直前に REVEAL_DECK_TOP で公開したカード（last_revealed_deck_cards）をトラッシュに置く。WX17-028「公開したカードをトラッシュに置く」。
export interface TrashRevealedAction {
  type: 'TRASH_REVEALED';
  owner: Owner;
}

// スタック下のカードから上のシグニへ能力を付与する（CONTINUOUS効果として宣言）
export interface GrantSigniAboveAbilityAction {
  type: 'GRANT_SIGNI_ABOVE_ABILITY';
  filter?: TargetFilter;   // 上のシグニへのフィルタ（省略時は任意）
  abilities: CardEffect[]; // 付与する能力
  /**
   * パース中一時フィールド（引用能力の原文）。`GRANT_FIELD_SIGNI_ABILITY` と同じ規約で
   * `parseBlock` が `abilities` へ展開してから delete する（§5.3 `O-55`・2026-08-24）。
   * ⚠これが無いと parser 側から本型を作れず、**引用の中身が外側の CONTINUOUS として即実行される**
   *   （「上のシグニがアタックしたとき〜」が常時発動する過剰実行）。
   */
  rawText?: string;
}

// このカードが場にあるかぎり、フィルタに合う自分の場のシグニ全員へ能力を付与する
// （CONTINUOUS効果として宣言。【レイヤー】の《レイヤーアイコン》能力付与に使用）
export interface GrantFieldSigniAbilityAction {
  type: 'GRANT_FIELD_SIGNI_ABILITY';
  filter?: TargetFilter;   // 付与先フィルタ（例: story:'怪異'。省略時は自分の全シグニ）
  abilities: CardEffect[]; // 付与する能力（付与先シグニ自身の能力として扱われる）
  targetOwner?: Owner;     // 付与先のオーナー（省略時 self。'opponent' = 対戦相手の場のシグニへ付与）
  thisCardOnly?: boolean;  // true = 付与元カード自身のみへ付与（「【常】：…かぎり、このシグニは「Q」を得る」型）
  rawText?: string;        // パース中一時フィールド（引用能力原文。expandGrantFieldRawText が abilities へ展開後 delete）
  rawStages?: Array<{ activeCondition?: ActiveCondition; rawText: string }>; // パース中一時フィールド（多段「<条件>かぎり、「Q」を得る。」＝段ごとの条件付き引用原文。展開時に各 CardEffect の activeCondition へ注入して delete。WX24-P1-043）
}

// このカードが場にあるかぎり、フィルタに合う場のシグニ全員へ【シャドウ（X）】キーワードを付与する（CONTINUOUS宣言型）
// 「同じシグニゾーンに【ゲート】があるあなたのシグニは【シャドウ（スペル）】を得る」(WXDi-P15-058) 等。
// getShadowScopes が読まない場全体継続シャドウ付与を、execUtils のシャドウ保護フィルタが getFieldGrantedShadowScopes 経由で評価する。
export interface GrantFieldShadowAction {
  type: 'GRANT_FIELD_SHADOW';
  keyword: string;        // 符号化済みシャドウキーワード（例: 'シャドウ:{"cardType":"スペル"}'）
  filter?: TargetFilter;  // 付与先フィルタ（例: inGateZone:true。省略時は付与元オーナーの全シグニ）
  targetOwner?: Owner;    // 付与先のオーナー（省略時 self＝付与元と同じ場。現状 self のみ対応）
}

// このカードが【アクセ】として付いているシグニ（ホスト）へ能力を付与する（CONTINUOUS宣言型）
// 「これにアクセされている＜クラス＞のシグニは『…』を得る」
export interface GrantAcceHostAbilityAction {
  type: 'GRANT_ACCE_HOST_ABILITY';
  filter?: TargetFilter;   // ホストシグニへのフィルタ（例: cardClass:'調理'。省略時は任意）
  abilities: CardEffect[]; // 付与する能力（ホストシグニ自身の能力として扱われる）
  byChoice?: boolean;      // true: abilities を選択肢とみなし、装着時に選んだ1つ（acce_choice[acceNum]）のみ付与（SPK01-11 ラズベリー）
  rawText?: string;        // parseBlock で abilities へ展開する前の引用能力テキスト（パース中の一時フィールド・展開後に削除）
}

// このカードが【ソウル】として付いているシグニ（ホスト）へ能力を付与する（CONTINUOUS宣言型）
// 「このカードが【ソウル】として付いているシグニは『…』を得る」
export interface GrantSoulHostAbilityAction {
  type: 'GRANT_SOUL_HOST_ABILITY';
  filter?: TargetFilter;   // ホストシグニへのフィルタ（省略時は任意）
  abilities: CardEffect[]; // 付与する能力（ホストシグニ自身の能力として扱われる）
}

// デッキ上から指定クラスのシグニがめくれるまで公開し、そのシグニと同じレベルの相手シグニ1体をバニッシュ。
// 公開したカードはシャッフルしてデッキの一番下に置く（WX17-038）。
export interface RevealUntilBanishSameLevelAction {
  type: 'REVEAL_UNTIL_BANISH_SAME_LEVEL';
  revealClass: string;     // めくり続ける対象シグニの＜クラス＞（CardClass に includes）
  banishOwner: Owner;      // バニッシュ対象のオーナー（通常 opponent）
}

/**
 * 「～がめくれるまで／公開されたレベル合計がN以上になるまで」の停止条件。
 * engine はこの構造だけを読み、EffectText/BurstText を実行時に再parseしない。
 */
export type RevealUntilStopCondition =
  | { kind: 'signiCount'; count: number; filter?: TargetFilter }
  | { kind: 'levelSum'; threshold: number; filter?: TargetFilter }
  | { kind: 'declaredName'; filter?: TargetFilter };

export type RevealUntilDestination =
  | 'hand'
  | 'field'
  | 'trash'
  | 'deck_bottom'
  | 'deck_bottom_shuffled';

export interface RevealUntilHitSpec {
  filter?: TargetFilter;
  count: number | 'ALL';
  upToCount?: boolean;
  destination: RevealUntilDestination;
  /** destination:'field' 限定。この方法で場に出たシグニ自身の【出】を抑止する。 */
  suppressOnPlay?: boolean;
}

/**
 * デッキを構造化された停止条件まで公開し、選んだ札と残りの行き先を明示して処理する。
 * hit 省略時は公開札すべてを restDestination へ送る。lastProcessedCards は常に公開札全体。
 */
export interface RevealUntilAction {
  type: 'REVEAL_UNTIL';
  owner: Owner;
  stopCondition: RevealUntilStopCondition;
  hit?: RevealUntilHitSpec;
  restDestination: RevealUntilDestination;
  optional?: boolean;
  /** optional の「公開しない」選択肢が使う実行時専用フラグ。生成JSONには出さない。 */
  _skip?: boolean;
}

// デッキ上から指定クラスのシグニがめくれるまで公開し、そのシグニを手札に加え、公開した他のカードを処理する（WX04-050）。
export interface RevealUntilToHandAction {
  type: 'REVEAL_UNTIL_TO_HAND';
  owner: Owner;            // 公開するデッキの持ち主（通常 self）
  revealClass?: string;    // めくり続ける対象シグニの＜クラス＞（省略=任意のシグニ）
  // 新規データは stopCondition を使う。省略時は revealClass を signiCount{count:1} へ正規化して後方互換を保つ。
  stopCondition?: RevealUntilStopCondition;
  restDest: 'deck_bottom_shuffled' | 'deck_bottom' | 'trash'; // 公開した他のカードの行き先
}

// デッキ上からシグニがめくれるまで公開し、そのシグニを場に出し、公開した他のカードをトラッシュへ置く。
// これを repeat 回繰り返す（WX04-093「惰眠」）。場に出せないシグニ（空きゾーンなし）はトラッシュへ。
export interface RevealUntilToFieldAction {
  type: 'REVEAL_UNTIL_TO_FIELD';
  owner: Owner;            // 公開するデッキの持ち主（通常 self）
  repeat: number;          // 繰り返し回数（WX04-093 = 3）
  revealClass?: string;    // めくり続ける対象シグニの＜クラス＞（省略=任意のシグニ）
  suppressOnPlay?: boolean; // true =「その（それらの）シグニの【出】能力は発動しない」（AddToFieldAction 参照）。REVEAL_UNTIL_TO_FIELD は自身 ON_PLAY を発火させるため即有効
}

// ルリグトラッシュにあるすべてのルリグを、自分のセンタールリグの下（スタック最下部）に置く（WX05-001「創世の巫女 マユ」の【出】）。
export interface PlaceLrigsUnderCenterAction {
  type: 'PLACE_LRIGS_UNDER_CENTER';
  owner: Owner;
}

// トラッシュ/エナ/フィールドからデッキへ移動
export interface TransferToDeckAction {
  type: 'TRANSFER_TO_DECK';
  source: EffectTarget;
  shuffle: boolean;
  destination?: 'deck' | 'lrig_deck'; // 省略時は 'deck'
  position?: 'top' | 'second' | 'bottom'; // デッキの挿入位置（省略時は top）
  optional?: boolean;                 // 「…してもよい」＝TRASH_CARD 経路で選択/スキップ可（WX17-028-E1・続き137）
  opponentSelects?: boolean;          // 「対戦相手は自分のシグニ1体を選びデッキに置く」
  targetsStored?: boolean;            // STORE_LAST_PROCESSED_TARGETS で任意コスト前に固定した対象（SIGNI 経路）
  fixedCardNums?: string[];           // インタラクション生成時に固定済みの対象instanceId
}

// スペル/アーツの効果を打ち消す
export interface CounterSpellAction {
  type: 'COUNTER_SPELL';
  maxCost?: number; // 対象スペルのコスト合計の上限（未指定なら無制限）
}

// コスト減少（コードハートVACなど）
export interface CostReductionAction {
  type: 'COST_REDUCTION';
  targetCardType: 'スペル' | 'アーツ' | 'ルリグ';
  color?: string;
  reduction: EnergyCost[];
  isGrowCost?: boolean;          // true = グロウコスト対象
  duration?: 'UNTIL_END_OF_TURN' | 'PERMANENT' | 'NEXT_TURN';
}

export type ProtectionSourceType = 'シグニ' | 'ルリグ' | 'スペル' | 'アーツ';

// 効果耐性付与（「対戦相手の〜の効果を受けない」）
export interface GrantProtectionAction {
  type: 'GRANT_PROTECTION';
  target?: EffectTarget;          // 一時付与（AUTO/ACTIVATED）: 特定ターゲットに付与
  targetsLastProcessed?: boolean; // 「それ」= 直前の POWER_MODIFY 等で選んだ同一シグニへ無選択で付与
  targetsTriggerSource?: boolean; // 「そのレゾナ」等、トリガー元シグニ（ctx.triggeringCardNum）へ無選択で付与
  subjectFilter?: TargetFilter;   // CONTINUOUS用: このフィルターの全シグニを保護
  subjectOwner?: Owner;           // subjectFilter の所有者（省略時: 'self'）
  from?: string[];    // 保護元：'ルリグ' | 'シグニ' | 'スペル' | 'アーツ' | 'DOWN' | 'BOUNCE' | 'BANISH' | 'any'
  // 軸（BANISH等）を発生源カード種別で限定する（「対戦相手の【シグニ】の効果によってバニッシュされない」。
  // from に 'BANISH' 等の軸トークンを置き、bySourceType でソース種別を絞る。バトル・ルール処理には適用されない）。
  bySourceType?: ProtectionSourceType | ProtectionSourceType[];
  bySourceLevel?: number | { min?: number; max?: number }; // 発生源カードの表記レベル。number=ちょうどN、範囲=min/max（CardData.Levelを整数化して判定）
  sourceCostMin?: number; // 保護元カード（アーツ/スペル）の使用コスト合計がN以上の効果のみ保護する（「対戦相手のコストの合計が５以上の、アーツとスペルの効果を受けない」WX15-031）。collectEffectImmuneSigni が解決中ソースカードの Cost 合計で判定
  sourceFilter?: TargetFilter; // 保護元カードの属性で耐性を絞る（sourceCostMin の一般化）。collectEffectImmuneSigni が解決中ソースカードの CardData を matchesFilter で判定し、非マッチなら保護しない（WXEX2-36「ライズアイコンを持たない対戦相手のシグニの効果を受けない」／WXK11-021「ライフバーストではない…」）
  sourceEffectType?: 'LIFE_BURST'; // 発生源カードの属性ではなく、現在解決中の効果種別を限定する（WX11-027「対戦相手のライフバーストの効果」）
  sourceOwner?: 'self' | 'opponent' | 'any'; // 誰の効果から保護するか（any＝発生源オーナーを問わない。ルール／バトルは含めない）
  fromAll?: boolean;   // true = すべての効果から保護（exceptSource 以外）
  exceptSource?: { sourceType: string; sourceOwner: Owner }; // fromAll 時の例外
  duration: EffectDuration;
}

// チャーム付与（シグニに裏向きでカードを付ける）
export interface AttachCharmAction {
  type: 'ATTACH_CHARM';
  charm: EffectTarget; // チャームにするカード
  to: EffectTarget;    // 付ける対象シグニ（to.filter.thisCardOnly=効果元シグニ自身）
  optional?: boolean;  // true=「チャームにしてもよい」（付ける/付けないを選択）
  perAllSigni?: boolean; // 各シグニへデッキトップから1枚ずつ一斉付与
}

/**
 * `ATTACH_FACEDOWN_FROM_HAND`（§5.3 `O-81`・母集団は実測**1件**＝`WX16-003-E2`）＝
 * 「あなたのシグニ１体を対象とし、それに**あなたの手札からカード１枚を裏向きで付ける**。」
 *
 * ⚠**【チャーム】ではない**（原文が【チャーム】と書いていない）＝受け皿は `signi_charms` ではなく
 *   `field.signi_facedown_attached`。混ぜると `hasCharm` 系の判定が軒並み過剰発火する。
 * 🔑付いたカードは**ホストが場を離れると公開されて持ち主の手札へ戻る**（`removeFromField` の1点）。
 *   その離脱時の追加効果（`WX16-003-E3` のバニッシュ）は ON_LEAVE_FIELD watcher 側が
 *   `FACEDOWN_REVEALED_JUST` 条件と `levelEqFacedownRevealed` フィルタで受ける。
 */
export interface AttachFacedownFromHandAction {
  type: 'ATTACH_FACEDOWN_FROM_HAND';
  /** 付ける先シグニ（原文「あなたのシグニ１体を対象とし」）。 */
  to: EffectTarget;
  /** 手札から付ける枚数（既定1）。 */
  count?: number;
  /** 手札側の条件（原文が「カード１枚」＝無指定）。 */
  handFilter?: TargetFilter;
  /** 内部用: 段1（ホスト選択）の応答待ち。JSON には書かない。 */
  _hostPending?: boolean;
  /** 内部用: 段2で確定したホストシグニ。JSON には書かない。 */
  _host?: string;
}

// デッキの上からN枚公開し、条件を満たすカードをpickする
// デッキ上N枚を見て、複数段の選択を順に行い、残りを所定の場所へ（G252「シグニ1枚＋共通クラス無色でないシグニ1枚を手札」／
// G255「カード1枚までトラッシュ＋＜X＞シグニ2枚まで手札」など、1度の公開からの多段ピック）。
export interface LookPickChainStage {
  filter?: TargetFilter;          // ピック対象フィルタ（省略=任意カード）
  pickCount: number | 'ALL';      // 選択枚数。ALL＝公開札の全対象
  pickUpTo?: boolean;             // true＝0..pickCount枚を選択可。省略/false＝pickCount枚必須
  // ピック先（手札／エナ／トラッシュ／場出し／【ビート】化／デッキの一番上へ戻す）。
  // 'deck_top'＝「その中から１枚をデッキの一番上に戻し、残りを（好きな順番で）デッキの一番下に置く」の中段。
  // このステージのピックは盤面を動かさず**デッキ内に留めたまま予約**し、remainder 処理時に一番上へ置く
  // （remainder より先に動かすと「残り」を下へ送る操作でその1枚まで巻き込まれるため）。
  // 'trap'／'seed'＝公開札を【トラップ】／【シード】としてシグニゾーンへ設置する。
  // ピックしたカードをデッキから抜き、対応する裏向きゾーンへ置く（ゾーンは1枚ずつ対話選択）。
  then: 'hand' | 'energy' | 'trash' | 'field' | 'beat' | 'deck_top' | 'trap' | 'seed' | 'magic_box';
  handOrEnergy?: boolean;         // 選んだ各カードを手札かエナへ（SEARCH continuation の既存対話を再利用）
  sharesClassWithPrev?: boolean;  // 直前ステージで選んだカードと共通するクラスを持つもののみ（G252）
  // 直前ステージで選んだカードと**共通するクラスを持たない**もののみ（「緑のシグニ1枚と、そのシグニと
  // 共通するクラスを持たないシグニ1枚」WX25-P1-041-E1・タスク12(xlvi)(a)）。直前ステージが空振りした場合は
  // 参照先が無い＝制限なし（sharesClassWithPrev は逆に候補ゼロ＝どちらも「原文どおりに絞れないなら
  // 過剰実行しない側」に寄せた解釈）。
  notSharesClassWithPrev?: boolean;
  pickNoun?: string;              // 逆翻訳の名詞（既定「シグニ」。任意カードは「カード」）
  suppressOnPlay?: boolean;       // then:'field' 限定。「その（それらの）シグニの【出】能力は発動しない」（AddToFieldAction 参照）
}
export interface LookPickChainAction {
  type: 'LOOK_PICK_CHAIN';
  owner: Owner;
  revealCount: NumberOrRef;
  stages: LookPickChainStage[];
  remainder: { location: CardLocation; position: 'top' | 'bottom' | 'any'; shuffle?: boolean };
  _revealed?: string[]; // 内部用: 段間 continuation で公開済みカードを引き継ぐ（JSONには書かない）
  _picked?: string[];   // 内部用: 完了済み stages の全選択（最終 lastProcessedCards／後続条件用）
  _topReserved?: string[]; // 内部用: then:'deck_top' で確定済みの「一番上へ戻す」カード（JSONには書かない）
  _pendingTop?: boolean;   // 内部用: 直前ステージが then:'deck_top'（再入時に lastProcessedCards を予約へ移す）
  /**
   * true = 各ステージのピックを**対戦相手自身**が行う（「対戦相手は自分のデッキの上からN枚見て、その中から…」）。§6.4 O-2。
   * 通常は `owner:'opponent'` と併用（＝相手のデッキを相手が見る）。「見る」は非公開なので、
   * 応答者だけにモーダルが出る本経路がそのまま原文の情報公開範囲になる。
   */
  opponentResponds?: boolean;
}

export interface RevealAndPickAction {
  type: 'REVEAL_AND_PICK';
  owner: Owner;
  /** 省略時は deck_top。デッキの一番下1枚を公開して処理する効果も同じ型で表す。 */
  from?: 'deck_top' | 'deck_bottom';
  revealCount: NumberOrRef;
  filter?: TargetFilter;
  pickCount: number | 'ALL';
  /** 公開札から選ぶ複数枚どうしの相互差異（「それぞれレベルの異なるシグニを４枚まで」WXK08-027-E2）。§6.2 段2 第42バッチ。 */
  selectionConstraint?: SelectionConstraint;
  pickUpTo?: boolean; // pickCount を「N枚まで」（上限）として扱う（G236）。逆翻訳に「まで」を付与
  pickNoun?: string;  // ピック対象の名詞（既定「シグニ」）。色一致で任意カードを拾う等は「カード」（G236）
  then: EffectAction;
  elseAction?: EffectAction; // 公開カードが filter に一致しない場合に実行（「そうでない場合」）
  handOrField?: boolean; // ピックしたシグニを1枚ずつ「手札に加える or 場に出す」の対話選択で処理（「公開し手札に加えるか場に出し」WX24-P1-056 等）。true のとき then は無視
  handOrEnergy?: boolean; // ピックしたカードを1枚ずつ「手札に加える or エナゾーンに置く」の対話選択で処理（「手札に加えるかエナゾーンに置き」WXK06-011 等）。true のとき then は無視
  // 公開札を picked / remainder の2束として保持し、対戦相手がトラッシュへ置く束を選ぶ。
  // 選ばれなかった束は手札へ（WXDi-P05-015）。通常の then/remainder 移動より先に専用の相手CHOOSEへ進む。
  opponentChoosesPileToTrash?: boolean;
  // position:'split_top_bottom'＝「好きな枚数を（好きな順番で）デッキの一番下に置き、残りを一番上に戻す」
  // ＝ピックの**あと**に残りの振り分けをプレイヤーへ問う（G168 の分割UIを resumeSearch から再利用する）。
  remainder?: { location: CardLocation; position: 'top' | 'bottom' | 'any' | 'split_top_bottom'; shuffle?: boolean };
  // 後段が「この方法で公開したカード」を参照する場合、選んで移動したカードではなく公開 snapshot 全体を残す。
  recordRevealed?: boolean;
  /**
   * true = 公開札を**対戦相手自身**が選ぶ（「対戦相手はデッキの上からN枚公開する。対戦相手はその中から…」）。§6.4 O-2。
   * 通常は `owner:'opponent'` と併用する（＝相手のデッキを相手が掘る）が、両者は**独立**＝
   * `owner` は「誰のデッキ／どこへ戻すか」、こちらは「誰がクリックするか」。
   * ⚠engine の ExecCtx 視点は反転しない（続き411 の教訓）＝ownerState は常に効果オーナー。
   */
  opponentResponds?: boolean;
}

// コストなしでカードを使用する（手札・相手手札・相手トラッシュ・ルリグデッキから）
export interface PlayFreeAction {
  type: 'PLAY_FREE';
  source: 'hand' | 'opp_hand' | 'opp_trash' | 'lrig_deck';
  filter: TargetFilter;
  ignoreCost: boolean;
  ignoreRestrictions?: boolean;
  optional: boolean;
  costThreshold?: number; // 使用コストの合計の上限（「コストの合計がN以下の〜」WX04-011）
  /** 直前に実際に支払った可変枚数コストから使用コスト上限を解決する。 */
  costThresholdFromPaidCount?: {
    source: 'discard' | 'energyTrash';
    plus?: number;
  };
  useTimingIncludes?: string; // 使用タイミングに含むべきアイコン（「使用タイミングに《メインフェイズアイコン》を含む」WX04-011）
}

// コスト増加（CONTINUOUS効果で相手のカード使用コストを増やす）
export interface CostIncreaseAction {
  type: 'COST_INCREASE';
  targetCardType: 'スペル' | 'アーツ' | 'ルリグ';
  targetOwner: Owner;
  amount: EnergyCost[];
  // NEXT_OPP_TURN: 「次の対戦相手のターンの間、対戦相手のコストが増える」（遅延・期間型。
  //   power_mods_until_opp_turn と同様にキャスター側へ保持し相手ターンを通過、自分の次ターン開始時にクリア）
  duration?: 'UNTIL_END_OF_TURN' | 'PERMANENT' | 'NEXT_OPP_TURN';
}

// スタック枚数に比例したパワー修正（CONTINUOUS効果内）
export interface PowerModifyPerStackAction {
  type: 'POWER_MODIFY_PER_STACK';
  target: EffectTarget;
  deltaPerCard: number; // スタック1枚（最上面を除く）ごとのパワー増減
}

// フィールドの他シグニのレベル合計に比例したパワー修正（CONTINUOUS効果内）
export interface PowerModifyPerLevelSumAction {
  type: 'POWER_MODIFY_PER_LEVEL_SUM';
  target: EffectTarget;
  deltaPerLevel: number;     // レベル1につきのパワー増減
  countFilter: TargetFilter; // カウント対象シグニのフィルタ
  countOwner: Owner;         // カウント対象フィールドのオーナー
  excludeSelf?: boolean;     // true=このシグニ自身をカウントから除外
}

// フィールドカウントに比例したパワー修正（AUTO効果内）
export interface PowerModifyPerFieldAction {
  type: 'POWER_MODIFY_PER_FIELD';
  target: EffectTarget;       // パワーを変更する対象
  deltaPerUnit: number;       // フィールドの対象1体ごとのパワー増減
  countFilter: TargetFilter;  // カウントするシグニのフィルタ
  countOwner: Owner;          // カウントするフィールドのオーナー（'any'=両プレイヤー）
  excludeSelf?: boolean;      // true=ターゲット自身をカウントから除外
  /** 省略時は従来どおりターン終了時まで。長期値は power_mods_until_opp_turn へ格納する。 */
  duration?: EffectDuration;
}

// チャームを消費してバニッシュを防ぐ
export interface CharmProtectionAction {
  type: 'CHARM_PROTECTION';
  signiFilter: TargetFilter;
  optional: boolean;
}

// 両者手札全捨て → 捨てた枚数の最大値分だけ引く
export interface MutualDiscardAndDrawAction {
  type: 'MUTUAL_DISCARD_AND_DRAW';
  drawMax: boolean;
}

// バニッシュされたシグニをエナゾーンではなくトラッシュへ送る
export interface BanishRedirectAction {
  type: 'BANISH_REDIRECT';
  target: EffectTarget;
  targetsLastProcessed?: boolean; // 「それ」= 直前ステップで選択/処理したシグニ(lastProcessedCards)へ適用（選択UIを出さず同一対象に適用）
  redirectTo: 'trash' | 'exile'; // exile＝「エナゾーンに置かれる代わりにゲームから除外」（SPDi47-05。除外ゾーン未実装＝どのゾーンにも置かず取り除く近似）
  until: 'END_OF_TURN' | 'PERMANENT';
  /**
   * バニッシュ元の限定（2026-07-19 続き217）。省略＝無条件（「対戦相手のシグニがバニッシュされる場合」）。
   * - 'battle_with_this'＝「このシグニとのバトルによってバニッシュされる場合」
   * - 'by_this'＝「このシグニによってバニッシュされる場合」（バトル・効果の別を問わずこのシグニ由来）
   * どちらも「能力を持つシグニ自身が関与したバニッシュ」だけを置換する＝engine のバトル経路で
   * バトル中のシグニと一致する場合のみ有効。パワー0以下による消滅は関与しないので置換しない。
   * ⚠この限定が無いと「場に1体いるだけで相手の全バニッシュが常時トラッシュ送り」に過剰発火する。
   */
  bySource?: 'battle_with_this' | 'by_this';
  /**
   * true＝「それがバトルによってバニッシュされる場合」。
   * 選択した被バニッシュ側だけをバトル経路で置換する。
   * 能力保持者を発生源限定する bySource:'battle_with_this' とは別概念。
   */
  battleOnly?: boolean;
  /**
   * 位置の限定。省略＝位置限定なし。
   * true＝この能力を持つシグニの正面ゾーンのシグニがバニッシュされる場合のみ置換する。
   */
  frontOnly?: boolean;
  /**
   * バニッシュ**される側**の限定＝「パワーが０以下のシグニがバニッシュされる場合」（2026-07-19 続き218）。
   * true のとき、置換はパワー0以下による消滅経路にだけ効く（バトル/効果によるバニッシュには効かない）。
   * 省略＝限定なし。⚠これが無いと「相手の**全**バニッシュが常時トラッシュ送り」に過剰発火する
   * （`WXDi-P10-009-E3`／`WXDi-CP02-102-E2`）。所有者問わずの同義STUB `BANISH_REDIRECT_POWER0_TRASH`
   * （WX04-038-E1）とは別に、target.owner:'opponent' 限定を engine 側で区別する。
   */
  whenPowerZero?: boolean;
}

// フィールド上のシグニを再配置する
export interface RearrangeSigniAction {
  type: 'REARRANGE_SIGNI';
  target: EffectTarget;
  swap?: boolean; // true=このシグニと対象シグニの位置を交換
  swapWithLastProcessed?: boolean; // true=直前に公開・選択したシグニと対象シグニを交換
  /** 場外カードとの交換元ゾーン。`swapSourceTarget` で1枚選び、場の `target` と交換する。 */
  swapSourceLocation?: 'energy' | 'trash';
  /** `swapSourceLocation` から選ぶ場外シグニ。owner/filter/upToCount をこの対象に保持する。 */
  swapSourceTarget?: EffectTarget;
  /** true=効果元を片側に固定せず、`target` から選んだ場の2体を交換する。 */
  swapBetweenTargets?: boolean;
  /** 「そのあなたのシグニ」＝バトルでバニッシュしたアタッカーを場側に固定する。 */
  targetsBattleAttacker?: boolean;
  /** true=2枚を対象に取った後、レベルが同じ場合だけ交換する。 */
  swapIfSameLevel?: boolean;
  suppressOnPlay?: boolean; // swapWithLastProcessed で場に出たシグニの【出】を発火させない
  optional?: boolean; // true=「配置し直してもよい」（プレイヤーがスキップ可能）
}

// シグニの基本レベルをNにする（CONTINUOUS。「このシグニの基本レベルは2になる」WX04-049-E1）。
// cardMap の Level を上書きして全レベル参照（matchesFilter のレベルフィルタ等）に反映する。
export interface SetBaseLevelAction {
  type: 'SET_BASE_LEVEL';
  target: EffectTarget;  // 通常は自分（このシグニ）。count:1=効果元シグニ
  value: number;         // 設定する基本レベル
  until?: 'END_OF_TURN'; // 起動効果で一時的に基本レベルを変更する場合（attack_phase_level_overrides に反映）
}

// コストなしでグロウする
export interface GrowFreeAction {
  type: 'GROW_FREE';
  levelFilter?: 'same' | 'any'; // 'same'=現在のルリグと同レベルのみ
}

// 場のアシストルリグのグロウスタック最上段だけをルリグデッキへ戻す。
// 「下のカードは場に残す」ため、通常のルリグトラッシュ／自身回収とは別の移動元を持つ。
export interface ReturnAssistLrigToDeckAction {
  type: 'RETURN_ASSIST_LRIG_TO_DECK';
  team?: string;
  level?: number;
  withoutAttackPhaseIcon?: boolean;
  excludeColorlessZeroGrowCost?: boolean;
}

// シグニの能力を消去する
export interface RemoveAbilitiesAction {
  abilityTypes?: Array<'常' | '自' | '起' | '出'>;
  // 指定キーワードだけを失わせ、同じターン中に新たに得ることも禁止する。
  // 省略時は従来どおり全能力を失う。
  keywords?: string[];
  type: 'REMOVE_ABILITIES';
  target: EffectTarget;
  /**
   * 「対戦相手の場にある**キーと**シグニは能力を失い、新たに得られない」（§6.4 O-16(b)）＝シグニに加えて
   * そのプレイヤーの**すべてのキー**も対象。キーは `field.signi` に居ないので per-card の
   * `abilities_removed` では表せず、専用フラグ `keys_abilities_disabled` へ倒す
   * （読みは engine の `activeKeyAbilitySources` funnel に一本化）。
   * ⚠フラグはターン限定（`turnScopedState` の turn-end 登録）＝**`until` は「このターン」しか表せない**。
   *   永続／次ターン限定のキー能力喪失が出たら、フラグを2スロット式へ広げること。
   */
  alsoKeys?: boolean;
  /**
   * 「対戦相手の**センタールリグと**すべてのシグニは能力を失う」（2026-08-27 段2 第45バッチ・
   * `WX19-022-BURST`／`WXDi-P10-005-E3`）＝シグニに加えてそのプレイヤーの**センタールリグ**も対象。
   *
   * 🔴**ルリグは `abilities_removed`（cardNum リスト）では表せない**＝engine にルリグ能力を
   *   その集合で止める消費地点が無い（シグニ／キー／トラッシュ起動だけが読む）。ルリグ側の唯一の
   *   受け皿は `PlayerState.lrig_abilities_disabled` フラグ（`grantedStore` ／ CONTINUOUS 走査／
   *   `lifeCrashGate` ／ `scanLrigSelfBlocks` が読む）なので、`alsoKeys` と同じ形でそちらへ倒す。
   *   ⚠**`target.type` を `CENTER_LRIG_OR_SIGNI` にしても効かない**（`execRemoveAbilities` は候補に
   *   ルリグを混ぜるが、書き込み先が `abilities_removed` なので**黙って無視される**＝見せかけの実装）。
   * ⚠期間は `until` に従う＝`NEXT_TURN`／`UNTIL_OPP_TURN_END` は
   *   `lrig_abilities_disabled_next_turn` へ予約する（`abilities_removed_next_turn` と同じ2スロット式）。
   */
  alsoCenterLrig?: boolean;
  until: EffectDuration;
  targetsLastProcessed?: boolean; // 「それ」= 直前の POWER_MODIFY 等で選んだ同一シグニへ無選択で適用
  targetsTriggerSource?: boolean; // 「そのシグニ」= トリガー元シグニ（場に出た相手シグニ等）へ無選択で適用（ctx.triggeringCardNum → ctx.sourceCardNum）
}

// ルリグのレベルに比例したパワー修正（ACTIVATED効果）
export interface PowerModifyPerLrigLevelAction {
  type: 'POWER_MODIFY_PER_LRIG_LEVEL';
  target: EffectTarget;
  deltaPerLevel: number;
  lrigOwner: Owner; // どちらのルリグのレベルを参照するか
  useLastDownedLrigLevelSum?: boolean; // 直前の可変ルリグダウンコストで記録したレベル合計を参照
}

// このターンを強制終了する（例: ジャッジメント・クロス）
export interface ForceEndTurnAction {
  type: 'FORCE_END_TURN';
}

// ターゲット自身のレベル×N倍パワー変更
export interface PowerModifyByTargetLevelAction {
  type: 'POWER_MODIFY_BY_TARGET_LEVEL';
  target: EffectTarget;
  deltaPerLevel: number;
  until: EffectDuration;
}

// 効果元シグニ（このシグニ）のレベル/パワーを基準にした対象パワー変更。
// 「対象のパワーをこのシグニのレベル１につき－2000」(basis:'level', multiplier:-2000) /
// 「対象のパワーをこのシグニのパワーと同じだけ－」(basis:'power', multiplier:-1)。
// delta = (効果元のレベル or 実効パワー) × multiplier。既定は temp_power_mods（ターン終了まで）。
export interface PowerModifyBySourceAction {
  type: 'POWER_MODIFY_BY_SOURCE';
  target: EffectTarget;
  basis: 'level' | 'power';
  multiplier: number;
  until?: EffectDuration;
}

// パワーをN倍にする
export interface PowerMultiplyAction {
  type: 'POWER_MULTIPLY';
  target: EffectTarget;
  multiplier: number;
  until: EffectDuration;
}

// レベルをN変更する
export interface LevelModifyAction {
  type: 'LEVEL_MODIFY';
  target: EffectTarget;
  delta: number;
  until: EffectDuration;
}

// チャーム枚数比例パワー変更（フィールドまたはこの効果でトラッシュした枚数）
export interface PowerModifyPerCharmAction {
  type: 'POWER_MODIFY_PER_CHARM';
  target: EffectTarget;
  deltaPerCharm: number;
  sourceOwner: Owner;
  sourceLocation: 'field' | 'trashed_this_effect';
  until: EffectDuration;
}

// エナゾーンのカード枚数比例パワー変更（常時効果）
export interface PowerModifyPerEnergyAction {
  type: 'POWER_MODIFY_PER_ENERGY';
  target: EffectTarget;
  deltaPerCard: number;
  energyOwner: Owner;
}

// 期間中プレイヤーはダメージを受けない（期間内は回数無制限＝1回消費の PREVENT_NEXT_DAMAGE とは別物）
// scope: 'ALL'＝あらゆるダメージ（「このターン、あなたはダメージを受けない」）
//        'LRIG'＝ルリグアタックによるダメージのみ（「対戦相手のルリグはあなたにダメージを与えない」）
// until: 'UNTIL_END_OF_TURN'＝この（発動）ターンの終わりまで／'NEXT_TURN'＝次のターンの間／
//        'END_OF_ATTACK'＝現在解決中のアタック終了時まで
export interface PreventDamageAction {
  type: 'PREVENT_DAMAGE';
  owner: Owner;
  until: EffectDuration | 'END_OF_ATTACK';
  scope?: 'ALL' | 'LRIG';
  /**
   * 「次のあなたのメインフェイズまで」（`WXK01-002-E2`・§6.4 O-3 続き492）＝**ターン境界を跨ぐ**期間。
   * `EffectDuration` にはこの長さが無いので専用フラグで表し、`until` より優先する。
   * 失効は `clearMainPhaseScopedState` 1点（自分が次にメインフェイズへ入るとき）。
   */
  untilNextMainPhase?: boolean;
}

/**
 * 「（このターンと次のターンの間、）対戦相手の効果によって〈ゾーン〉のカードは移動しない」
 * の**期間つき**予約（§6.4 O-3 続き493）。
 * ⚠【常】版（場にあるかぎり）は宣言型 STUB のまま＝こちらは**アーツ/【出】で張る**ぶん。
 * 消費は `oppMoveProtectedZones`／`activeOppMoveImmunityZones`（`engine/effectEngine.ts`）。
 */
export interface ZoneMoveImmunityAction {
  type: 'ZONE_MOVE_IMMUNITY';
  owner: Owner;
  zones: ('hand' | 'energy')[];
  /** 有効なグローバルターン数。「このターンと次のターンの間」＝2。 */
  turns: number;
}

/**
 * 「このルリグの基本リミットは N になる」（`WXK01-002-E2`・§6.4 O-3 続き492）。
 * ⚠**加算ではなく置換**＝`LRIG_LIMIT_MODIFY`（`delta`）とは別軸。消費は `computeEffectiveLrigLimit` 1点。
 */
export interface SetLrigBaseLimitAction {
  type: 'SET_LRIG_BASE_LIMIT';
  owner: Owner;
  value: number;
  /** 「次のあなたのメインフェイズまで」。省略時は場にあるかぎり（＝【常】想定）。 */
  untilNextMainPhase?: boolean;
}

/**
 * 「あなたが（次のあなたの）ドローフェイズにカードを N 枚引く場合、代わりに M 枚引く」。
 * 既存の `DRAW_PHASE_REPLACEMENT` は**付与された【常】能力**としてしか置けなかったので、
 * 期間つきの自己予約を表すためにトップレベルでも実行できるようにした（§6.4 O-3 続き492）。
 */
export interface ReserveDrawPhaseReplacementAction {
  type: 'RESERVE_DRAW_PHASE_REPLACEMENT';
  owner: Owner;
  fromCount: number;
  toCount: number;
}

// 各プレイヤーのエナゾーンをN枚に均等化する
export interface EqualizeEnergyAction {
  type: 'EQUALIZE_ENERGY';
  targetCount: number;
  owner?: Owner; // 未指定=各プレイヤー（両方）。'opponent'=対戦相手のみ／'self'=自分のみ調整（「対戦相手は自分のエナが7枚になるように」等）
}

// 手札を任意枚捨て、その枚数+bonus枚引く
export interface VariableDiscardAndDrawAction {
  type: 'VARIABLE_DISCARD_AND_DRAW';
  drawBonus: number;
  owner: Owner;
}

// バニッシュの代替コスト（任意で代替コストを払いバニッシュを回避）
export interface BanishSubstituteAction {
  type: 'BANISH_SUBSTITUTE';
  trigger: EffectTarget;
  substituteCost: {
    discardSpell?: number;    // 手札からスペルをN枚捨てる
    trashStackSpell?: number; // このシグニの下からスペルN枚をトラッシュに置く
    powerReduction?: number;  // 自分のシグニのパワーをN下げる
    lifeCrash?: number;       // あなたのライフクロスをN枚クラッシュする（§3タスク6 D・WX14-026）
  };
  optional: boolean;
}

// トラッシュからスペルをこのカードの下に置く
export interface StackSpellAction {
  type: 'STACK_SPELL';
  from: 'trash';
  filter: TargetFilter;
  maxCount: number;
}

// エナゾーンのカードの色を自身の色として追加で持つ
export interface ColorInheritAction {
  type: 'COLOR_INHERIT';
  source: 'energy';
  owner: Owner;
}

// フィールドシグニ数+bonus枚デッキからエナゾーンに置く
export interface EnergyChargeByFieldCountAction {
  type: 'ENERGY_CHARGE_BY_FIELD_COUNT';
  owner: Owner;
  bonus: number;
}

// 対戦相手のデッキ上・ライフクロス上を見る
export interface LookAtDeckAndLifeAction {
  type: 'LOOK_AT_DECK_AND_LIFE';
  targetOwner: Owner;
  mode: 'both' | 'either';
}

// グロウコスト減少
export interface GrowCostReductionAction {
  type: 'GROW_COST_REDUCTION';
  reduction: EnergyCost[];
  // per-count scaling:「あなたのトラッシュにある<filter>N枚につき reduction 分減る」（WX14-009/WD14-001）。
  // 指定時、reduction の各 count は floor(トラッシュ内 filter 一致枚数 / perCount.count) 倍される
  // （一致が perCount.count 未満なら 0＝減額なし）。zone は現状トラッシュのみ。
  perCount?: { filter: TargetFilter; count: number };
}

/**
 * 「このターン、対戦相手は〈条件〉のシグニでアタックできない」（§6.4 O-3）。
 * 実体は `PlayerState.signi_attack_bans_this_turn` への1件追加＝判定は `signiAttackGate`。
 *
 * ⚠絞り込みキーを1つも指定しない＝**すべてのシグニ**が対象（原文にその形がある）。
 * ⚠`levelFromDeclaredNumber` は**実行時に**宣言値（宣言した側の `declared_number`）を焼き込む。
 *   ban 側に「宣言参照」を残すと、判定地点（アタッカー側 state）から宣言者の state が見えない。
 */
export interface SigniAttackBanAction {
  type: 'SIGNI_ATTACK_BAN';
  /** 禁止を受ける側。'opponent'＝対戦相手のシグニがアタックできない。 */
  owner: Owner;
  /** 宣言済みの数字と同じレベルのシグニに限定する（未宣言なら ban を張らない）。 */
  levelFromDeclaredNumber?: boolean;
  /**
   * 直前に処理したカードと同じレベルのシグニに限定する（「そのカードと同じレベルのシグニ」）。
   * ⚠**実行時にレベルを焼き込む**＝判定地点（アタッカー側 state）から `lastProcessedCards` は見えない。
   *   直前カードが無い／レベルが取れないときは ban を張らない（過少側に倒す）。
   */
  levelFromLastProcessed?: boolean;
  /** 実効パワーが表記パワーと異なるシグニに限定する。 */
  powerDiffersFromPrinted?: boolean;
  /** 直前に対象化したシグニに限定する（「それはアタックできない」）。 */
  targetsStored?: boolean;
  /**
   * 直前に**選ばれたシグニ以外**を禁止する（「それら以外のシグニでアタックできない」＝
   * `WXDi-P08-030-E1`・§6.4 O-3）。⚠`targetsStored` の逆向きなので**0体選択でも ban を張る**
   *   （1体も選ばなければ全シグニがアタック不可＝原文どおり）。
   */
  exceptTargetsStored?: boolean;
  /** 《無》×N を支払えばアタックできる（払えないときだけ禁止）。 */
  unlessPayColorless?: number;
  /**
   * 手札をN枚捨てればアタックできる（`SP38-003-E1`「（アタックするごとに捨てる）」）。
   * ⚠**アタックのたびに**支払う＝1回きりの `NegateAttackAction.escapeDiscard` とは別機構。
   */
  unlessPayHandDiscard?: number;
  /**
   * 有効なグローバルターン数（2＝「次の対戦相手のターン（終了時まで）」＝§6.4 O-4）。
   * 省略＝そのターンだけ。`SigniDeployBan` と同じカウントダウン規約で
   * `clearTurnEndScopedState` の1点だけが減らす。
   */
  turns?: number;
  /**
   * 禁止するシグニゾーン（「**中央の**シグニゾーンにあるシグニでアタックできない」＝§6.4 O-33）。
   * 添字は所有者から見た表示順＝left=0 / center=1 / right=2（`TargetFilter.centerZoneOnly` と同じ規約）。
   * 省略＝ゾーンを問わない。
   */
  zones?: number[];
  /**
   * **動的**なゾーン限定（§6.4 O-33 の据置分・続き508）＝「**【ゲート】がある**シグニゾーンにあるシグニで
   * アタックできない」（`WDK09-001-E2`）。`zones` の静的な添字列では表せない
   * （ban を張ったあとに【ゲート】が増減しうる）ので、**判定地点で `signi_gate_zones` を引く**。
   * ⚠`zones` と同時に指定しない（どちらか一方）。
   */
  zoneSource?: 'gate';
}

/**
 * 「このターンと次のターンの間、対戦相手は〈条件〉のシグニを新たに場に出せない」（§6.4 O-3）。
 * 実体は `PlayerState.signi_deploy_bans` への1件追加＝判定は `deployLimitBlockReason`。
 *
 * ⚠`namesFromTargets` は**実行時に**カード名を焼き込む（判定地点から「それ」は見えない）。
 * ⚠絞り込みキーを1つも指定しない＝**すべてのシグニ**が対象。
 */
export interface SigniDeployBanAction {
  type: 'SIGNI_DEPLOY_BAN';
  /** 禁止を受ける側（＝場に出す側）。 */
  owner: Owner;
  /** 有効なグローバルターン数。2＝「このターンと次のターンの間」。 */
  turns: number;
  /** 直前に対象化／処理したカードと**同じ名前**のシグニに限定する（「それと同じ名前のシグニ」）。 */
  namesFromTargets?: boolean;
  /** 配置の出自で限定する（「自分の、シグニとスペルの効果によって」）。 */
  bySource?: 'signi_or_spell_effect';
}

/**
 * 「（このターンの最初の／次の）アタックフェイズの後に、追加のアタックフェイズを加える」（§6.4 O-3）。
 *
 * 実体は `PlayerState.extra_attack_phases_this_turn` へのキュー1件追加。消化は
 * `resolveNextPhaseAfterAttack`（ATTACK_LRIG の次を決める1点）で、`END` の代わりに `ATTACK_ARTS` へ戻す。
 *
 * ⚠`onStart`＝「この方法で加えたアタックフェイズ（の）開始時、〜」の本文。**追加した瞬間ではなく
 *   追加したフェイズの開始時に走る**（従来は後続文が即時実行され、メインフェイズ中に全シグニがアップする
 *   等の過剰実行になっていた）。フェイズ突入時に `pending_extra_attack_phase_start_effects` へ移し、
 *   `ON_ATTACK_PHASE_START` の collector が合成エントリとして積む。
 */
export interface AddExtraAttackPhaseAction {
  type: 'ADD_EXTRA_ATTACK_PHASE';
  /** 追加する数（現状の母集団はすべて1）。 */
  count?: number;
  /** 「この方法で加えたアタックフェイズの開始時、」に実行する本文。 */
  onStart?: EffectAction;
}

/**
 * 「次の対戦相手のアタックフェイズ開始時、〈本文〉」（§6.4 O-3）。
 *
 * 実体は**予約した側**の `PlayerState.pending_next_opp_attack_phase_effects` への1件追加。
 * 発火は `ON_ATTACK_PHASE_START` の collector が**非ターンプレイヤー側（＝予約した側）の予約**を読む
 * （`pending_opponent_attack_facedown_returns` と同じ走査軸）＝自分のアタックフェイズでは発火しない。
 *
 * ⚠**ターン境界を跨ぐ**ので `delayed_triggers`（THIS_TURN 限定）にも `turnScopedState` にも載せない。
 *   消化は発火時の1件ずつ（`RESOLVE_NEXT_OPP_ATTACK_PHASE_EFFECT`）。
 * ⚠本文は**その時点で実行**する＝予約時に走らせてはいけない（従来は後続文が即時実行されていた）。
 */
export interface DelayToNextOppAttackPhaseAction {
  type: 'DELAY_TO_NEXT_OPP_ATTACK_PHASE';
  action: EffectAction;
}

/**
 * 「次の対戦相手のターン終了時、〈本文〉」（§6.4 O-3）。上の アタックフェイズ版と**同じ型の兄弟**。
 *
 * 実体は**予約した側**の `PlayerState.pending_next_opp_turn_end_effects` への1件追加。
 * 発火は `ON_TURN_END` の collector が**非ターンプレイヤー側（＝予約した側）の予約**を読む
 * ＝相手のターンが終わる瞬間、ターンプレイヤーは相手なので予約は `opState` にある。
 *
 * ⚠**ターン境界を跨ぐ**ので `delayed_triggers`（THIS_TURN 限定）にも `turnScopedState` にも載せない。
 *   消化は発火時の1件ずつ（`RESOLVE_NEXT_OPP_TURN_END_EFFECT`）。
 * ⚠本文は**その時点で実行**する＝予約時に走らせてはいけない
 *   （続き493 で明示 defer に落として即時実行を止めた形の、機構が入ったぶん）。
 * ⚠**相手のターン中に予約した場合**は「いま終わろうとしている相手ターン」ではなく**次の**相手ターン終了時に
 *   なるのが原文の意味だが、現状の母集団2効果はどちらも自分のメインフェイズ限定の【起】なので差は出ない。
 */
export interface DelayToNextOppTurnEndAction {
  type: 'DELAY_TO_NEXT_OPP_TURN_END';
  action: EffectAction;
}

/**
 * 「次の**あなたの**ターン終了時、〈本文〉」（§6.4 O-4）。上の相手ターン版の兄弟。
 *
 * ⚠**2スロット式**＝予約は `pending_next_own_turn_end_effects` に積み、**自分の次のターン開始時**に
 *   `pending_own_turn_end_effects`（active）へ昇格する。1スロットだと `ON_TURN_END` の collector が
 *   **予約したそのターンの終了時**に拾ってしまい「次の」が消える（`abilities_removed_next_turn` と同じ規約）。
 */
export interface DelayToNextOwnTurnEndAction {
  type: 'DELAY_TO_NEXT_OWN_TURN_END';
  action: EffectAction;
}

/**
 * 「〈デッキの一番上／手札のカードN枚まで〉を裏向きでルリグゾーンに置く」（§6.4 O-3）。
 *
 * 実体は `PlayerState.facedown_lrig_zone_cards` への追加＝**元のゾーンからは取り除く**。
 * 後で `REVEAL_FACEDOWN_LRIG_ZONE` が表向きにしてトラッシュへ送り、そのカードを `lastProcessedCards`
 * に載せる（「そのカードと同じレベルの〜」が既存の `levelEqLastProcessed` で解ける）。
 *
 * ⚠**ルリグゾーンの裏向き表示そのものは未実装**（機能上は「取り除いて保持する」だけで足りる）＝§7 送り。
 */
export interface PlaceFacedownLrigZoneAction {
  type: 'PLACE_FACEDOWN_LRIG_ZONE';
  source: 'deck_top' | 'hand';
  count: number;
  /** 「N枚**まで**」＝0枚可。 */
  upToCount?: boolean;
  /** 置く側（省略＝効果のオーナー）。'opponent'＝「対戦相手は〜置く」（`SPDi43-02-E2`）。 */
  owner?: Owner;
  /** 「手札を**すべて**」＝枚数指定ではなく全部。指定時 `count` は無視する。 */
  all?: boolean;
}

/** 「そのカードを表向きにしてトラッシュに置き、」＝上の裏向きカードを公開してトラッシュへ。 */
export interface RevealFacedownLrigZoneAction {
  type: 'REVEAL_FACEDOWN_LRIG_ZONE';
}

/**
 * 「（次の対戦相手のターン終了時、）そのカードを手札に加える」＝上で裏向きにルリグゾーンへ置いた
 * カードを手札へ戻す（§6.4 O-3）。
 *
 * 🔑**遅延を跨いだ照応の受け皿**＝`DELAY_TO_NEXT_OPP_TURN_END` が運べるのは action だけで
 *   「そのカード」の参照先は束縛できない。**参照先を state 側（`facedown_lrig_zone_cards`）に
 *   永続化してある**ので、発火時にそこを読めば照応が解ける（原文の「この方法で置いたカード」と
 *   同じ集合）。⚠だから `REVEAL_FACEDOWN_LRIG_ZONE`（トラッシュ送り）とは**別アクション**にする。
 */
export interface ReturnFacedownLrigZoneToHandAction {
  type: 'RETURN_FACEDOWN_LRIG_ZONE_TO_HAND';
  /** 戻す側（省略＝効果のオーナー）。 */
  owner?: Owner;
}

/**
 * 「あなたのすべての〈条件〉のシグニをチェックゾーンに置く。**その後、それらを場に出し**、〜」（§6.4 O-3）。
 *
 * 🔑**チェックゾーンは経由地なので往復を1アクションに畳む**＝原文は2文だが、置く側と戻す側を
 *   別アクションに割ると「それら」の照応先（＝チェックゾーンに置いたシグニ）を運ぶ器が要る。
 *   実際、従来は戻す側の文が**丸ごと脱落**していて、置く側も受け皿 STUB＝no-op だった。
 *
 * 意味は「場を離れて出直す」＝**アップ状態の新しいシグニとして場に出る**（アタック済みの記録も落ちる）。
 * ⚠**近似**＝チャーム／アクセ／ソウル等の付随物は場を離れた扱いにせず維持する（§7）。
 */
export interface FieldSigniToCheckZoneAction {
  type: 'FIELD_SIGNI_TO_CHECK_ZONE';
  /** 往復させるシグニ（`owner:'self'` ＋ `filter`）。 */
  target: EffectTarget;
}

/**
 * 「〈期間〉、あなたのセンタールリグは対戦相手のセンタールリグのルリグタイプを**追加で**得る」
 * （`WDK17-008-E1` 選択肢①・§6.4 O-3）。
 *
 * 実体は `PlayerState.lrig_gained_types_timed` への1件追加。既存の**恒久**版
 * （`lrig_gained_types`＝`ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE`）と読み口を揃え、
 * 寿命だけ `SigniDeployBan` と同じターン数カウントダウンで持つ。
 *
 * ⚠**「追加で」＝置換ではない**（`card_class_overrides` は上書きなので使えない）。
 * ⚠得たタイプの実利は**グロウ互換**（`lrigClassesCompatible`）と**「〇〇限定」の使用制限**
 *   （`meetsRestriction`）＝どちらも `/` 区切りを split する実装なので、
 *   `effectiveLrigClass` が印刷クラスと得たタイプを `/` で連結して両方に効かせる。
 */
/**
 * 「〈誰か〉がカード名1つを宣言し、〈期間〉その名前（か、その名前**以外**）のカードを使用できない」
 * （§6.4 O-3）。母集団2枚を1語彙にまとめてある：
 *  - `PR-K046-E1`＝自分がスペル名を宣言 → **次の対戦相手のターンの間**その名前のスペルを使えない（blacklist）
 *  - `WXEX2-09-E3`＝**対戦相手が**カード名を宣言 → このターンその名前**以外**のアーツを使えない（whitelist）
 *
 * 判定は `cardNameUseBlocked` の1点（blacklist／whitelist の両軸をそこで合流させる）。
 *
 * ⚠**近似**＝宣言の候補は「宣言者が実際に知りうるカード名」に絞る（原文は任意のカード名）。
 *   blacklist は封じられる側の**公開領域**（トラッシュ／エナ／ルリグデッキ）、
 *   whitelist は宣言者**自身のルリグデッキ**から作る。隠された領域は覗かない。
 */
export interface DeclareCardNameLockAction {
  type: 'DECLARE_CARD_NAME_LOCK';
  /** 宣言する側。'opponent'＝「対戦相手はカード名1つを宣言する」。 */
  declarer: Owner;
  /** 使用を封じられる側。⚠`target` という名前は使わない（この型系では `EffectTarget` の予約語）。 */
  lockedPlayer: Owner;
  /** 封じる対象のカード種別。 */
  cardType: 'スペル' | 'アーツ';
  /** 'blacklist'＝宣言名を使えない／'whitelist'＝宣言名**以外**を使えない。 */
  mode: 'blacklist' | 'whitelist';
  /** 'THIS_TURN'／'NEXT_TURN'＝次の（封じられる側の）ターンの間。 */
  until: 'THIS_TURN' | 'NEXT_TURN';
}

/**
 * 「あなたと対戦相手は自分のデッキの一番上を公開し、そのカードをデッキの一番下に置く。この方法で公開された
 * カードが**どちらも**【ライフバースト】を持っているか、**どちらも**持っていない場合、〈帰結〉」（§6.4 O-4）。
 *
 * 🔴従来は公開・比較が丸ごと `UNKNOWN` に落ち、帰結（アタック無効）だけが残って**必ず無効化**していた
 *   （`WXDi-P09-036-E1`）。公開と比較と帰結は1つの判定なので**1アクションに畳む**。
 */
export interface RevealBothDeckTopsAction {
  type: 'REVEAL_BOTH_DECK_TOPS';
  /** 一致（どちらも持つ／どちらも持たない）のときだけ実行する帰結。 */
  matchAction: EffectAction;
}

/**
 * 「対戦相手はあなたのデッキの一番上のカードが《X アイコン》を持つか持たないかを宣言する。
 * あなたのデッキの一番上を公開する。宣言が外れた場合、〈帰結〉」（§6.4 O-4）。
 *
 * 🔴従来は宣言と照合が `UNKNOWN` に落ち、帰結（ダメージを受けない）だけが残って**必ず無効**になっていた
 *   （`WX15-002-E2`）。⚠宣言するのは**相手**＝`opponentResponds` のコスト無し CHOOSE。
 */
export interface DeclareDeckTopIconAction {
  type: 'DECLARE_DECK_TOP_ICON';
  /** 判定するアイコン（`TargetFilter.hasIcon` と同じ語彙）。 */
  icon: 'トラップ' | 'ライズ' | 'クロス' | 'アクセ';
  /** 公開されるデッキの持ち主（＝宣言される側）。 */
  deckOwner: Owner;
  /** 宣言が外れたときだけ実行する帰結。 */
  onWrongAction: EffectAction;
}

export interface GainLrigTypeAction {
  type: 'GAIN_LRIG_TYPE';
  /** タイプを得る側（現母集団は 'self' のみ）。 */
  owner: Owner;
  /** タイプの出どころ。実行時に解決して**タイプ名を焼き込む**（判定地点から相手 state は見えない）。 */
  from: 'opponent_center_lrig';
  /**
   * 有効なグローバルターン数（2＝「次の対戦相手のターン終了時まで」）。
   * `'GAME'`＝「このゲームの間」＝恒久側（`lrig_gained_types`）へ積む。
   */
  turns: number | 'GAME';
}

// このゲームの間、対戦相手は同名カードを使用できない
export interface NameBanAction {
  type: 'NAME_BAN';
  targetSelf: boolean;
  /**
   * 封じる期間。`GAME`＝`blocked_card_names_game`／`TURN`＝`blocked_card_names`（ターン終了時に消える）。
   * ⚠**`TURN` は §6.4 O-11 で追加**＝原文が「**このターン**、対戦相手はそれと同じ名前のカードを
   *   使用できない」と書いていても型に GAME しか無く、**ゲーム中ずっと封じる過剰実行**になっていた
   *   （`WDK07-E08` ③）。期間語は必ず原文から取る（既定へ倒さない）。
   */
  duration: 'GAME' | 'TURN';
}

// トラッシュからコスト以下のスペルをコスト無しで使用
export interface PlayFreeFromTrashAction {
  type: 'PLAY_FREE_FROM_TRASH';
  costThreshold: number;
  filter: TargetFilter;
  maxCount: number;
}

// パワーが閾値以上になったとき自身をトラッシュに置く
export interface PowerThresholdTrashAction {
  type: 'POWER_THRESHOLD_TRASH';
  threshold: number;
  operator: 'gte' | 'gt';
}

// 対戦相手のパワーバフをデバフへ反転する
export interface PowerFlipAction {
  type: 'POWER_FLIP';
  target: EffectTarget;
  sourceOwner: Owner;
}

// 自分自身の効果ではトラッシュに置けない制限
export interface SelfTrashPreventAction {
  type: 'SELF_TRASH_PREVENT';
}

// 特定コストを代替コスト（エナからこのシグニをトラッシュ等）で支払う
export interface CostSubstituteAction {
  type: 'COST_SUBSTITUTE';
  originalCost: EnergyCost[];
  substituteCost: EffectCost;
  optional: boolean;
}

// この効果でトラッシュしたシグニのレベル合計×N比例パワー変更
export interface PowerModifyPerTrashedLevelAction {
  type: 'POWER_MODIFY_PER_TRASHED_LEVEL';
  target: EffectTarget;
  deltaPerLevel: number;
  until: EffectDuration;
}

// デッキ枚数N枚につきパワー±M（常時効果）
export interface PowerModifyPerDeckCountAction {
  type: 'POWER_MODIFY_PER_DECK_COUNT';
  target: EffectTarget;
  deltaPerUnit: number;   // N枚ごとのパワー増減
  unitSize: number;       // N（枚単位）
  deckOwner: Owner;
}

// エナゾーンの色の種類Nつにつきパワー±M（常時効果）
export interface PowerModifyPerEnergyColorAction {
  type: 'POWER_MODIFY_PER_ENERGY_COLOR';
  target: EffectTarget;
  deltaPerColor: number;
  energyOwner: Owner;
}

// トラッシュ枚数N枚につきパワー±M（常時・ターン終了時まで）
export interface PowerModifyPerTrashCountAction {
  type: 'POWER_MODIFY_PER_TRASH_COUNT';
  target: EffectTarget;
  deltaPerUnit: number;    // unitSize枚ごとのパワー増減
  unitSize: number;        // 何枚ごとに deltaPerUnit を適用するか
  trashOwner: Owner | 'both';
  countFilter?: TargetFilter;   // カウント対象のフィルタ（クラス・色・タイプ等）
  countByVariety?: boolean;     // true=種類, false=枚数
  until?: EffectDuration;       // END_OF_TURN なら起動/自動効果；なければ常時効果
}

// ライフクロス枚数につきパワー±M（常時効果）
export interface PowerModifyPerLifeCountAction {
  type: 'POWER_MODIFY_PER_LIFE_COUNT';
  target: EffectTarget;
  deltaPerLife: number;
  lifeOwner: Owner;
}

// 手札N枚につきパワー±M（AUTO実行・スナップショット。until で持続を指定）
export interface PowerModifyPerHandCountAction {
  type: 'POWER_MODIFY_PER_HAND_COUNT';
  target: EffectTarget;
  deltaPerCard: number;
  handOwner: Owner;
  excludeSelf?: boolean; // 「あなたの他のシグニ」: 効果元カード自身を対象から除外
  until?: EffectDuration; // 'UNTIL_OPP_TURN_END' なら次の相手ターン終了時まで（省略時はターン終了時まで）
}

// コインを得る
export interface GainCoinAction {
  type: 'GAIN_COIN';
  owner: Owner;
  count: number;
}

// 各プレイヤーが手札をN枚捨てる
export interface DiscardBothAction {
  type: 'DISCARD_BOTH';
  count: number; // 各プレイヤーが捨てる枚数
}

// センタールリグへの能力付与（CONTINUOUS効果から発生）
export interface GrantLrigAbilityAction {
  type: 'GRANT_LRIG_ABILITY';
  abilities: CardEffect[];  // 付与される能力（サブエフェクト）
  rawText?: string;         // 元のテキスト（manual で構造を直接付与する場合は省略可）
  permanent?: boolean;      // 「このゲームの間」付与（グロウしても維持・ターン境界で消えない。WXDi-P06-004等）。省略=ターン終了時まで
  duration?: EffectDuration; // UNTIL_OPP_TURN_END は長期ストアへ格納
  targetedCenter?: boolean; // 「あなたのセンタールリグ１体を対象とし、ターン終了時まで、それは以下の能力を得る」表記変種（WX25-P1-001系）。engine挙動は既定と同一（自分のセンタールリグへ付与）＝decompiler表示用
  targetOwner?: Owner;      // 付与先センタールリグの持ち主。省略=self、opponent=対戦相手（WXK03-001-E3）
}

/** プレイヤー自身が「このゲームの間」得る能力。場を離れるカードではなくPlayerStateへ保持する。 */
export interface GrantPlayerAbilityAction {
  type: 'GRANT_PLAYER_ABILITY';
  abilities: CardEffect[];
  rawText?: string;
  permanent: true;
  /**
   * 能力を得るプレイヤー（省略＝効果のオーナー）。'opponent'＝「対戦相手は以下の能力を得る」
   * （`WXDi-P11-002-E1`・§6.4 O-4）。
   * ⚠**落とすと能力が自分に付く**＝相手に課すはずの不利益を自分が背負う裏返しになる。
   */
  targetOwner?: Owner;
}

/** ドローフェイズで「1枚引く場合、代わりに2枚引く」置換。ルリグのCONTINUOUS能力として収集する。 */
export interface DrawPhaseReplacementAction {
  type: 'DRAW_PHASE_REPLACEMENT';
  fromCount: number;
  toCount: number;
}

// チャームを外す（シグニに付いたチャームをトラッシュに置く）
export interface RemoveCharmAction {
  type: 'REMOVE_CHARM';
  targetOwner: Owner;          // どちらのシグニのチャームを外すか
  count: number | 'ALL';       // 何枚外すか
  targetFilter?: TargetFilter; // 対象シグニのフィルター
}

// 対戦相手のシグニを強制的にアタックさせる
export interface ForceSigniAttackAction {
  type: 'FORCE_SIGNI_ATTACK';
  targetOwner: Owner;
  infectedOnly?: boolean; // 感染状態のシグニのみを強制対象とする（WX16-047等）
  duration?: 'NEXT_TURN'; // 省略時は即時（このターン）、NEXT_TURN は対象側 state へ予約
}

// このシグニの正面のシグニ（＝対戦相手の、このシグニと向かい合うゾーンのシグニ）は
// 可能ならばアタックしなければならない。CONTINUOUS 宣言型（付与能力としてホストに乗る。WX20-045 マロンクリーム）。
// collectForcedFrontAttackZones が「相手の場のこの効果」を読み、自分の該当ゾーンを強制対象にする。
export interface ForceFrontSigniAttackAction {
  type: 'FORCE_FRONT_SIGNI_ATTACK';
}

// 対戦相手の場のウィルス数Nにつきパワー±M（常時効果）
export interface PowerModifyPerVirusCountAction {
  type: 'POWER_MODIFY_PER_VIRUS_COUNT';
  target: EffectTarget;
  deltaPerVirus: number;
  virusOwner: Owner;
}

// ウィルストークンを置く
export interface PlaceVirusAction {
  type: 'PLACE_VIRUS';
  targetOwner: Owner;          // どちらのゾーンにウィルスを置くか
  zoneCount: number | 'ALL';   // 何ゾーンに置くか
  virusCount: number;          // 各ゾーンに置くウィルス数（通常1）
  upToZoneCount?: boolean;     // true=「～つまで」
  // 対象の場の【ウィルス】合計がこの値になるように不足分だけ置く（WX19-045「合計が2つになるように置く」）。
  // 指定時、配置数 = max(0, fillToTotal - 現在のウィルス合計) を空きゾーンへ（プレイヤーが配置先を選択）。
  fillToTotal?: number;
  // 選んだゾーンのシグニにパワー修正を与える（WD19-009「そのシグニゾーンにあるシグニのパワーを－8000」）。
  // 指定時はウィルス済みゾーンも選択可（ウィルスは置けないがパワー修正は適用される）
  powerDeltaOnZone?: number;
}

// エナゾーンのカードをシグニのアクセにする
export interface AttachAcceAction {
  type: 'ATTACH_ACCE';
  targetSigniOwner: Owner;      // アクセを付けるシグニのオーナー
  sourceOwner: Owner;           // アクセカードのオーナー（エナゾーン）
  fromHand?: boolean;           // trueなら手札からアクセ（デコレ能力）
  signiFilter?: TargetFilter;   // アクセカードのフィルター（手札から選ぶ場合に使用）
  targetFilter?: TargetFilter;  // 対象シグニのフィルター（ホスト側のフィルター）
  _selectingAcceFromHand?: boolean; // 内部: fromHand step1（手札からアクセカード選択中）のthenActionマーカー
  _pickedAcceCard?: string;         // 内部: fromHand step1で選んだアクセカード（step2ホスト選択のthenActionへ引き渡す）
}

// 場のシグニを別のシグニの【アクセ】にする。
// ATTACH_ACCE（エナ／手札）とは移動元が異なるため、既存経路を変えず独立actionで表す。
export interface FieldSigniToAcceAction {
  type: 'FIELD_SIGNI_TO_ACCE';
  sourceOwner: Owner;
  targetSigniOwner: Owner;
  sourceFilter?: TargetFilter;
  targetFilter?: TargetFilter;
  sourceThisCard?: boolean;
  reattachPreviousAcceOptional?: boolean;
  _pickedFieldSigni?: string;
  _reattachAcceCard?: string;
  _reattachSelectingHost?: boolean;
}

// 血晶武装：手札・トラッシュ・デッキから同名カードをシグニの下に重ねる
export interface BloodCrystalArmorAction {
  type: 'BLOOD_CRYSTAL_ARMOR';
  source: ('hand' | 'trash' | 'deck')[];  // どこから探すか
  targetFilter?: TargetFilter;             // 対象シグニのフィルター
  count: number;                           // 武装する枚数（通常1）
}

// センタールリグのリミット増減
export interface LrigLimitModifyAction {
  type: 'LRIG_LIMIT_MODIFY';
  owner: Owner;             // 影響を受けるルリグのオーナー
  delta: number;            // 増減値（正=増加、負=減少）
  until: 'END_OF_TURN' | 'NEXT_TURN' | 'PERMANENT';
}

export interface AddCraftToLrigDeckAction {
  type: 'ADD_CRAFT_TO_LRIG_DECK';
  owner: Owner;
  cardName: string; // クラフトカードのCardName（CardData_TKから検索）
  count: number;
}

// リコレクトアイコンゲート：ルリグトラッシュのアーツ枚数が条件を満たさない場合、後続ステップをスキップ
export interface RecollectGateAction {
  type: 'RECOLLECT_GATE';
  minArts: number;
}

// 対戦相手ターン中の代替コスト（「対戦相手のターンの間、使用コストは〜になる」）
export interface AltCostOppTurnAction {
  type: 'ALT_COST_OPP_TURN';
  cost: EnergyCost[];
}

/**
 * カード名を指定して**そのカードの使用コストを置換**する（「このゲームの間、あなたの《X》の使用コストは
 * 《黒×2》《無×1》に**なる**」＝`WXK03-002-E3`）。タスク12(lxxxi) 残テール。
 * ⚠既存の `SPECIFIC_CARD_COST_REDUCE`（CONTINUOUS 収集・**《無×N》減らす**）とは別物＝
 *   こちらは印刷コストを丸ごと差し替える**状態書き込み**で、発動した【起】が解決した時点で確定する。
 * `duration:'GAME'` のみ（現状の原文はすべて「このゲームの間」）。
 */
export interface SetCardCostReplacementAction {
  type: 'SET_CARD_COST_REPLACEMENT';
  owner: Owner;
  cardName: string;
  cost: EnergyCost[];
}

// パーサーが解釈できなかった効果（手動対応が必要）
export interface StubAction {
  owner?: Owner; // owner-sensitive STUB の対象（省略時は self）
  /**
   * `LIFE_CRASH_PREVENTION`（§5.3 `O-66`・2026-08-25）＝「ライフクロスは〜クラッシュされない／
   * N枚までしかクラッシュされない」の中身。
   * ⚠**このペイロードが無い `LIFE_CRASH_PREVENTION` は「全面防止」に化ける**ので、
   *   消費側（`engine/lifeCrashGate.ts`）は**ペイロードが無い宣言を無視する**（fail-closed）。
   *   parser が payload を落としたら「効かない」で済み、「相手のダメージを全部無効化する」にはならない。
   */
  lifeCrashPrevention?: import('./index').LifeCrashPreventionSpec;
  /**
   * 「このシグニは**このカードの下にある**〈条件〉のシグニの〈種別〉能力を得る」の中身
   * （§5.3 `O-66`③・2026-08-25）。`GRANT_UNDER_SIGNI_ALL_ABILITIES` /
   * `GRANT_UNDER_SIGNI_CONSTANT_ABILITY` / `GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE` で共有する。
   *
   * 🔴**これが無かった間、engine は `cardMap` の `EffectText` を regex で読んで
   *   レベル／色／クラス／除外名／能力種別を決めていた**（`O-60` と同型）＝**JSON を見ても何が起きるか
   *   分からない**し、`txt.includes('【常】')` のようにカード全文を見るので**別の能力の表記**まで拾っていた。
   * ⚠**ペイロードが無い宣言は「下の全カードの全能力を得る」に化ける**ので、消費側は
   *   **ペイロードが無ければ何も付与しない**（fail-closed）。落ちても「効かない」で済ませる。
   */
  underAbilityGrant?: {
    /** 得る能力の種別。原文の【常】【自】【起】に対応。 */
    kinds: Array<'CONTINUOUS' | 'AUTO' | 'ACTIVATED'>;
    /** 下のカードの絞り込み（レベル／色／＜クラス＞／《名前》以外）。省略＝下の全カード。 */
    filter?: TargetFilter;
    /** 【英知】能力に限る（`WX19-027-E2`「【常】の【英知】能力」）。 */
    eichiOnly?: boolean;
    /** 限定条件も得る（`WX21-024-E2`「…能力と、限定条件を得る」）＝表示用。 */
    grantRestriction?: boolean;
  };
  /**
   * 「〈条件〉のシグニは場から手札に戻らない／場から移動させない」の対象（§5.3 `O-66`③）。
   * `SIGNI_CANT_BOUNCE_FROM_FIELD` / `PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH` で共有する。
   * 省略＝**あなたのシグニ全部**（原文に＜クラス＞の限定が無い形＝`WX13-029-E1`②）。
   * ⚠こちらは省略が「全部」で正しい（原文がそう書く）ので、上の `underAbilityGrant` とは
   *   fail の向きが逆になる。**同じ規約だと思って揃えないこと。**
   */
  moveProtectFilter?: TargetFilter;
  /**
   * SEED_BLOOM / SEED_BLOOM_OPTIONAL: 「そのシグニゾーンにシグニがある場合、**代わりにそのシグニを
   * 手札に戻してから**開花する」（`WDK07-Y07-E1`・§6.4 O-3）。
   * ⚠**開花の置換**なので後続ステップでは間に合わない（素の開花は「シグニあり＝不発」で先に終わる）＝
   *   parser の SEQUENCE 畳み込みがここへ移す。
   */
  bounceOccupant?: boolean;
  /** DECLARE_NUMBER_PLAIN で提示する数字。省略時は従来どおり1～5。 */
  numberChoices?: number[];
  /**
   * `LOOK_OPP_LIFE_TOP`：**どのゾーンの何枚を見る（公開する）か**（§5.3 `O-60` 第1バッチ・2026-08-26）。
   *
   * 🔴**従来 engine はカード全文（`EffectText`＋`BurstText`）を regex で読んでゾーンと枚数を決めていた**＝
   *   ①`対戦相手の手札を見**る**` の終止形しか見ておらず、実データに多い連用形 `見**て**` が丸ごと落ちて
   *   **相手の手札ではなくライフクロスを覗く別ゾーンへ化けていた**（`O-53` と同型）
   *   ②`ライフクロスの上からカードを２枚見る` の「カードを」を regex が挟めず**既定の1枚**に落ちていた
   *   ③そもそも `EffectText` はカード全文なので、**同じカードの別の能力**の言い回しまで拾う。
   *   実測＝この STUB を持つ live 28効果のうち **27効果で regex が1本も当たっていなかった**
   *   （`npx tsx scripts/censusEngineText.ts --id LOOK_OPP_LIFE_TOP`）。
   *
   * ⚠**ペイロードが無い宣言では engine は何も見ない**（fail-closed）。従来の「既定で相手のライフ上1枚を
   *   覗く」は、**この id が 20 の無関係な文型の catch-all になっている**ため（§5.3 `O-76`）
   *   「見る効果ではないのに相手の非公開領域を覗いて `lastProcessedCards` を汚す」副作用でしかなく、
   *   落ちたときは「効かない」で済ませるほうが安全側。
   */
  /**
   * `LRIG_UNDER_CARD_OP`：**どの操作か**（§5.3 `O-60` 第2バッチ・2026-08-26）。
   *
   * 🔴**従来 engine はカード全文を regex で読んで3分岐し、どれにも当たらないと
   *   「効果元シグニの下にあるカードを全部トラッシュする」という無条件フォールバックへ落ちていた**＝
   *   ①regex は2本しか無いのに **parser の生成地点は22箇所**（＝この id は「ルリグデッキ下操作」ではなく
   *   **無関係な22文型の catch-all**）②フォールバックには regex すら無く、**効果元の下にカードが在るだけで
   *   問答無用に全部トラッシュした**。実測＝live 17効果のうち**当たっていたのは2効果だけ**で、
   *   `WX24-P4-046-E2`（「下から**それぞれレベルの異なるシグニ３枚**をトラッシュに置いて**もよい**」）は
   *   **下の全カードを強制的に**失い、`WXK08-084-E1`（下に**置く**効果）は逆に下を**トラッシュ**していた。
   *
   * ⚠**ペイロードが無い宣言では engine は何もしない**（fail-closed）。この id に新しい意味を足さない
   *   （catch-all を太らせると、また計器から見えなくなる＝§5.3 `O-77`）。
   */
  /**
   * `COPY_LRIG_NAME_ABILITY`：**どのルリグの名前と、どの種別の能力を得るか**
   * （§5.3 `O-60` 第3バッチ・2026-08-26）。
   *
   * 🔴**従来は消費地点4つが全部それぞれ `EffectText` を regex で読んでいた**（`execStubPart1` の
   *   action ハンドラ＋`effectEngine` の名前エイリアス／【自】コピー／【常】コピー）。実害は2つ：
   *   ①action ハンドラの regex だけ **終止形 `と同じカード名としても扱**う**`** を要求していて、
   *     実データの**連用形「扱**い**、そのルリグの…能力を得る」**に **live 16効果すべてが当たらず**、
   *     「ルリグ名コピー（テキスト解析不可）」で**丸ごと no-op**だった（§4.2「活用形が違うだけで落ちる」）。
   *   ②【自】コピーの収集が **原文の能力種別を1文字も見ていなかった**＝「そのルリグの**【常】**能力を得る」
   *     と書いてある `WX24-P4-021-E1` でも **AUTO 能力まで得ていた**（過剰実行）。
   */
  /**
   * `DEPLOY_RESTRICT`：**どの形の配置制限か**（§5.3 `O-60` 第4バッチ・2026-08-26）。
   *
   * 🔴**従来は消費地点2つ**（`execStubPart3` のハンドラと `effectEngine.collectDeployCountLimit`）が
   *   **それぞれ `EffectText` を regex で読んで上限・主語・期間を決めていた**。実害：
   *   ①主語の判定が**カード全文の文分割**に頼っており、同じカードの別能力の言い回しに影響される
   *   ②「この方法でゲームから除外したシグニと**同じ名前**のシグニを新たに場に出せない」（`WXK09-015-E3`）は
   *     どの regex にも当たらず「配置制限（パターン解析不可）」＝**無言 no-op**
   *   ③**同じ判定ロジックが2箇所にコピーされていて**、片方だけ直すと【常】版と【自】版で挙動がずれる。
   *
   * ⚠**ペイロードが無い宣言では何もしない**（fail-closed）。
   */
  deployRestrict?: {
    /**
     * `count`＝「シグニをN体までしか場に出すことができない」／
     * `power_gte`＝「パワーN以上のシグニを新たに場に出せない」／
     * `only_by_effect`＝「〜の効果によってしか新たに場に出せない」（機構未実装＝明示保留）。
     */
    kind: 'count' | 'power_gte' | 'only_by_effect';
    /** `count`＝上限体数。 */
    cap?: number;
    /** `count`＝誰に掛かるか（原文「すべてのプレイヤーは」「あなたは」「対戦相手は」）。 */
    subject?: 'self' | 'opponent' | 'both';
    /** `power_gte`＝禁止するパワーの下限。 */
    powerGte?: number;
    /** 「そのターンの間、あなたは〜」＝**追加ターン**への予約（即時適用ではない）。 */
    extraTurnReservation?: boolean;
  };
  lrigNameCopy?: {
    /** ルリグトラッシュから探す＜ストーリー＞（原文「＜タマ＞」等）。 */
    story: string;
    /** レベル限定（原文「レベル３の」）。省略＝レベルを問わない。 */
    level?: number;
    /** 得る能力の種別（原文の【自】【常】）。空配列＝名前だけ得て能力は得ない。 */
    kinds: Array<'AUTO' | 'CONTINUOUS'>;
  };
  /**
   * `DOUBLE_POWER_MINUS`：**「対戦相手のシグニのパワーが－される場合、代わりに2倍－される」の寿命**
   * （§5.3 `O-60` 第5バッチ・2026-08-26）。
   *
   * 🔴**従来 engine はカード全文を regex で読み、`シグニN体につき±X` か `パワーをN倍にする` の
   *   どちらかに当てようとしていた**が、実データの綴りは「**2倍－される**」なので **live 7効果すべてが
   *   1本も当たらず**、`パワー修正（相手N体基準）` を addLog するだけの**無言 no-op** だった。
   *   ⚠**受け皿は最初から在った**＝`PlayerState.double_power_minus_this_turn`（ターン境界でリセット済み・
   *   `effectEngine` が負デルタの2倍化で読む）。**engine の別 id `DOUBLE_POWER_MINUS_THIS_TURN` が
   *   同じことをしていた**＝parser がそちらを吐かなかったので、7効果ぶんの機構が丸ごと遊んでいた。
   *
   * ⚠**ペイロードが無い宣言では何もしない**（fail-closed）。
   */
  /**
   * `PLACE_CARD_UNDER_SIGNI`：**何をシグニの下に置くのか**（§5.3 `O-60` 第6バッチ・2026-08-26）。
   *
   * 🔴**従来 engine はカード全文 regex で3分岐し、どれにも当たらないと
   *   「`lastProcessedCards` を丸ごと下に置く」フォールバックへ落ちていた**。実害＝`WX16-003-E2`
   *   「あなたのシグニ１体を対象とし、それに手札からカード１枚を**裏向きで付ける**」＝**【チャーム】**であって
   *   下に置く効果ではないのに、parser が同じ id へ流し込み、engine が**直前に処理したカードを下へ積んでいた**。
   * ⚠**ペイロードが無い宣言では何もしない**（fail-closed）。
   */
  /**
   * `TRAP_TO_HAND`：**何枚の【トラップ】を手札に加えるか**（§5.3 `O-60` 第7バッチ・2026-08-26）。
   *
   * 🔴**従来 engine はカード全文を `【トラップ】をN**枚**まで手札に加える` で読んでいた**が、
   *   実データの助数詞は「**N つ**」なので **live 5効果すべてが1本も当たらず、既定の
   *   「場の【トラップ】を全部」へ落ちていた**＝「【トラップ】**１つ**を対象とし、それを手札に加える」が
   *   **3つ全部を回収する過剰実行**になっていた（`WX16-028-E2`／`WX16-063-E1`／`WD23-040-A-E1`）。
   * ⚠**ペイロードが無い宣言では何もしない**（fail-closed）＝落ちても「効かない」で済み、
   *   **相手に見えない裏向きの札を余計に回収してしまう**side には倒さない。
   */
  trapToHand?: {
    /** 手札に加える枚数。`'ALL'` は原文「好きな数」。 */
    count: number | 'ALL';
    /**
     * 「N つ**まで**」＝0枚でもよい。
     * 🆕**`count:'ALL'` と併用すると原文「好きな数」**（§5.3 `O-87`・`WX16-017-E1`）＝
     *   0枚も選べる選択 UI を必ず出す。⚠**併用しないと engine は問答無用で全部回収する**
     *   （「好きな数対象とし」はプレイヤーの選択なので、全回収は過剰実行）。
     */
    upTo?: boolean;
    /**
     * 🆕**同じ選択プールに場のシグニも混ぜる**（§5.3 `O-87`・`WX16-017-E1`
     * 「あなたの【トラップ】**と＜トリック＞のシグニ**を好きな数対象とし、それらを場から手札に加える」）。
     * ⚠**`lastProcessedCards` に載るのは【トラップ】だけ**＝後続が数えるのは
     *   「この方法で手札に加えた**【トラップ】**１つにつき」だから（シグニは数に入らない）。
     */
    alsoSigniFilter?: TargetFilter;
  };
  /**
   * `CONDITIONAL_ARTS_COST`：**どの条件でアーツの使用コストが変わるか**
   * （§5.3 `O-60` 第8バッチ・2026-08-26）。
   *
   * 🔴**従来 engine はカード全文（`EffectText`＋`BurstText`）を regex 2本で読んで条件を判定していた**。
   *   実害は2つ：
   *   ①**この id は「条件つきアーツコスト」ではない4文型の catch-all**だった（§5.3 `O-82`）＝
   *     「センタールリグをグロウしてもよい」（`SP38-001-E1`）・「このアーツは追加で
   *     《アタックフェイズアイコン》を持つ」（`WX16-Re20-E1`）・「ライフクロスの一番上を公開する」
   *     （`WD06-008-E1`）・「ライフクロスの一番上のカードをデッキに加えてシャッフルする」
   *     （`WXDi-D04-010-E1`）＝**コストの話が1文字も無い効果**に「条件付きアーツコスト（確認完了）」を
   *     addLog していた（＝id が嘘をつく）。
   *   ②regex がカード全文を見るので、**同じカードの別の能力**のコスト文まで拾いうる。
   *
   * ⚠**実コストの適用はここではない**＝`screens/battle/costs.ts` の `computeArtsEffectiveCost` /
   *   `computeCostReplacement` が支払い時に行う（このハンドラは**条件の成否をログに出すだけ**）。
   *   したがって payload が無くても盤面は壊れない＝**未指定なら条件を判定せずログだけ出す**。
   */
  artsCostCond?: {
    /**
     * `opp_center_lrig_color`＝「対戦相手のセンタールリグが〈色〉の場合」／
     * `center_lrig_level`＝「あなたのセンタールリグのレベルがN以上／以下の場合」／
     * `self_life_count`＝「あなたのライフクロスがN枚以下の場合」。
     */
    kind: 'opp_center_lrig_color' | 'center_lrig_level' | 'self_life_count';
    /** `opp_center_lrig_color`＝許容する色（原文「赤か青」→ `['赤','青']`）。 */
    colors?: string[];
    /** `center_lrig_level`＝自分センターの閾値／`self_life_count`＝ライフ枚数の閾値。 */
    level?: number;
    /** `center_lrig_level` / `self_life_count`＝閾値の向き。 */
    op?: '以上' | '以下';
    /** `center_lrig_level`＝**対戦相手**センターにも掛かる追加条件（`WX20-020-E1`）。 */
    oppLevel?: number;
    /** 上の `oppLevel` の向き。 */
    oppOp?: '以上' | '以下';
  };
  placeUnder?: {
    /**
     * `craft`＝ゲーム外からクラフトを生成して下に置く（`craftName` 必須）／
     * `self_under_other`＝**このシグニ自身**を他のシグニの下へ／
     * `processed`＝直前に処理したカード（`lastProcessedCards`）を下へ／
     * ⚠**「手札から裏向きで付ける」はここではない**＝`ATTACH_FACEDOWN_FROM_HAND`（§5.3 `O-81` で実装）。
     *   旧 `charm_facedown` モードは受け皿ができたので削除した（死んだ枝は catch-all の温床）。
     */
    mode: 'craft' | 'self_under_other' | 'processed';
    /** `craft` のときのクラフト名（原文「クラフトの《給食推進車両》」）。 */
    craftName?: string;
  };
  doublePowerMinus?: {
    /**
     * `this_turn`＝「**このターン**、〜2倍－される」＝実行時にフラグを立てるアクション／
     * `continuous`＝【常】の宣言（`effectEngine` が場のカードを走査して読むので、実行側は何もしない）。
     */
    duration: 'this_turn' | 'continuous';
    /** 原文が「あなたの**シグニの**効果によって」と発生源を絞っているか（表示用・engine は既にシグニ限定）。 */
    sourceSigniOnly?: boolean;
  };
  underCardOp?: {
    /**
     * `energy_signi_to_deck_top`＝エナゾーンのシグニをデッキの一番上へ／
     * `self_to_energy`＝場のこのシグニをエナゾーンへ／
     * `trash_all_under_self`＝このシグニの下のカードを全部トラッシュへ。
     */
    op: 'energy_signi_to_deck_top' | 'self_to_energy' | 'trash_all_under_self';
    /** `energy_signi_to_deck_top` の絞り込み（原文「**白の**シグニ」「＜クラス＞のシグニ」）。 */
    filter?: TargetFilter;
  };
  lookZone?: {
    /** 見る領域。`opp_deck_top` は「対戦相手はデッキの一番上のカードを公開する」。 */
    zone: 'opp_life' | 'opp_hand' | 'self_life' | 'opp_deck_top';
    /** 見る枚数。`'ALL'` は「すべて見て」。省略不可（1 でも明示する）。 */
    count: number | 'ALL';
  };
  /**
   * STRIP_ATTACHED_AND_UNDER: 剥がす相手が**発生源シグニ自身**（「このシグニに付いているすべての
   * カードと、下に置かれているすべてのカードを〜」＝`WXDi-P07-041-E2`）。省略時は
   * `storedTargetCards`（＝直前の `SELECT_TARGET_ONLY` が確定した対象）を剥がす。
   */
  stripSelf?: boolean;
  /**
   * `SELF_ABILITY_COST_REDUCTION`: 「この能力の発動コストは《X×N》減る」の減額分（§6.4 O-35・続き530）。
   * ⚠**このノードは engine で実行されない**＝`hoistSelfAbilityCostReduction` が
   *   `EffectCost.conditionalEnergyReduction` へ移して action から取り除く（残っていたら parser の穴）。
   */
  costEnergy?: EnergyCost[];
  /** PER_OWN_LRIG_COLOR_SCALE: 数える自ルリグの色（「あなたの場にいる〈色〉のルリグ１体につき」）。 */
  scaleColor?: string;
  /** PER_OWN_LRIG_COLOR_SCALE: その色のルリグ体数だけ繰り返す本体。 */
  scaleAction?: EffectAction;
  /**
   * 多段対話を跨いで運ぶカード（§6.4 O-34(e)＝手札から選んだ1枚）。
   * ⚠`lastProcessedCards` は CHOOSE/SELECT_TARGET の resume を跨いで生存しないので、
   *   宣言をまたぐ参照はここへ**焼き込んで**運ぶ（`fixedCardNums` と同じ理由）。
   */
  carriedCardNum?: string;
  /** 多段対話を跨いで運ぶ対象シグニ（§6.4 O-34(e)＝先に宣言した相手シグニ1体）。 */
  carriedTargetNum?: string;
  /**
   * `SUMMON_RESONA_FROM_LRIG_DECK` のペイロード（§6.4 O-5）。
   *
   * 🔴従来 engine は**カード全文 regex**（`/ルリグデッキから＜X＞のレゾナ/`）でクラスだけを読み、
   *   **枚数・レベル・色・「か」の OR は全部落として candidates[0] を1枚だけ自動で出していた**＝
   *   ①「２枚まで」「好きな枚数」が1枚に潰れる（過少）②「レベル３以下の白の」等の絞り込みが消えて
   *   **どのレゾナでも出せる**（過剰）③どれを出すか選べない（O-20 のカード全文 regex 読みクラス）。
   * 🔑parser が原文から解いて渡す＝engine は**このペイロードだけ**を見る。
   */
  resonaSummon?: {
    /** 出す枚数（'ALL'＝「好きな枚数」＝候補数まで）。 */
    count: number | 'ALL';
    /** 「N枚**まで**」「好きな枚数」＝0枚でもよい。 */
    upTo?: boolean;
    /** ルリグデッキ側の絞り込み（クラス／レベル／色）。 */
    filter?: TargetFilter;
    /** 「この方法で場に出たレゾナの【出】能力は発動しない」。 */
    suppressOnPlay?: boolean;
  };
  /**
   * `PICK_FROM_TRASHED_CARDS` のペイロード（§6.4 O-11）＝
   * 「この方法でトラッシュに置いた**カードの中から**N枚（まで）対象とし、それを〈行き先〉へ」。
   *
   * 🔑候補は **`ctx.lastProcessedCards`（＝直前のミル/トラッシュで実際に置かれた札）に限定**する。
   * 🔴従来ハンドラは**トラッシュ全体**を候補にし、枚数・行き先・filter も全部無視して
   *   「1枚を手札へ」に潰していた（＝「この方法で」の限定が丸ごと落ちた過剰実行）。
   * ⚠直前が「〜してもよい」で辞退された場合は `lastProcessedCards` が空＝候補0＝no-op が正しい
   *   （トラッシュ全体へフォールバックしてはならない）。
   */
  trashedPick?: {
    /** 対象枚数。 */
    count: number;
    /** 「N枚**まで**」＝0枚でもよい。 */
    upTo?: boolean;
    /** 候補側の絞り込み（「シグニ1枚」等）。省略＝任意カード。 */
    filter?: TargetFilter;
    /** 行き先。`hand_or_field`＝1枚ずつ「手札に加える／場に出す」の二択。 */
    dest: 'hand' | 'energy' | 'hand_or_field';
  };
  /**
   * この STUB が**シグニを場に出す**ことの宣言（§6.4 O-32）。
   * 🔑`foldSuppressOnPlay` が「直後の `BLOCK_ACTION{ON_PLAY_ABILITY}`（＝「それの【出】能力は発動しない」）」を
   *   畳み込む配置アンカーとして認識するための目印。⚠これを立てないと畳み込みが起きず、
   *   engine 未参照の死アクションが残ったまま**置いたシグニの【出】が発動する**（過剰実行）。
   */
  placesToField?: boolean;
  /**
   * `AddToFieldAction.suppressOnPlay` の STUB 版＝この配置で場に出したシグニ自身の ON_PLAY を発火させない。
   * 読みは `BattleScreen` の `fieldPlacementOnPlayOpts` 1点（配置アンカーの型に依らない汎用判定）。
   */
  suppressOnPlay?: boolean;
  /** TRIGGER_OTHER_SIGNI_EICHI_ABILITY: 能力選択CHOOSEを跨いで保持する発動元シグニ。 */
  eichiAbilitySourceCardNum?: string;
  /** 対象句つき任意色コストで、支払い後の本体へ引き継ぐ対象。 */
  optionalCostTarget?: EffectTarget;
  /**
   * SELECT_TARGET_ONLY: 「**対戦相手は**自分のシグニを〜選ぶ」＝選ぶのは相手側（§6.4 O-3）。
   * ⚠落とすと効果の使用者が相手の代わりに選ぶ＝有利な取り違えになる。
   */
  opponentSelects?: boolean;
  /**
   * INTERNAL_APPLY_CARD_NAME_LOCK（`DECLARE_CARD_NAME_LOCK` の宣言後段）。
   * ⚠**engine 内部専用**（parser は生成しない・逆翻訳にも出さない）。
   */
  cardNameLock?: { lockedPlayer: Owner; mode: 'blacklist' | 'whitelist'; until: 'THIS_TURN' | 'NEXT_TURN' };
  /**
   * INTERNAL_DECLARE_DECK_TOP_ICON（`DECLARE_DECK_TOP_ICON` の宣言後段）。
   * ⚠**engine 内部専用**（parser は生成しない・逆翻訳にも出さない）。
   */
  deckTopIcon?: { icon: 'トラップ' | 'ライズ' | 'クロス' | 'アクセ'; deckOwner: Owner; onWrongAction: EffectAction };
  /** EFFECT_LEAVE_PREVENT_LOSE_LRIG_ABILITY: 守るシグニの条件。 */
  leaveVictimFilter?: TargetFilter;
  /**
   * EFFECT_LEAVE_PREVENT_LOSE_SELF_ABILITY（§6.4 O-10・続き507）＝
   * 「このシグニが対戦相手の効果によって場を離れる場合、代わりに（ターン終了時まで、）この能力を失う」。
   * `EFFECT_LEAVE_PREVENT_LOSE_LRIG_ABILITY` の**シグニ自身版**で、失うのは
   * **この効果1つだけ**（`lost_ability_effect_ids_this_turn`）＝同居する他の【常】/【自】は残る。
   * `thenDown`＝「そうした場合、このシグニをダウンする」（`WX25-P2-071-E1` の付与文）。
   */
  leaveLoseSelfAbility?: { thenDown?: boolean };
  /**
   * `EFFECT_LEAVE_PAY_TO_LOSE_SELF_ABILITY`（§6.4 O-10・続き511）＝上の**任意コスト**版
   * 「あなたの〈filter〉のシグニ１体が対戦相手の効果によって場を離れる場合、〈コスト〉を支払ってもよい。
   *  そうした場合、代わりにターン終了時まで、このシグニはこの能力を失う。」
   * ⚠**victim は宣言元とは限らない**（「あなたの緑のシグニ１体が」＝別のシグニでもよい）が、
   *   **能力を失うのは宣言元**（「**この**シグニはこの能力を失う」）＝両者を混同しない。
   */
  leavePayLoseSelfAbility?: {
    /** 守れる victim の条件（省略＝自分のシグニなら誰でも）。 */
    victimFilter?: TargetFilter;
    /** エナで払う場合の色スロット（`selectOptionalCostEnergy` と同じ表記）。 */
    costColors?: string[];
    /** 手札を捨てて払う場合の枚数。 */
    handDiscard?: number;
  };
  /**
   * `DAMAGE_REPLACE_BY_COST`（§6.4 O-37(a)・続き543）＝
   * 「あなたがダメージを受ける場合、代わりに〈コスト〉を支払ってもよい。
   *  （そうした場合、このルリグはこの能力を失う。）」＝**ダメージの置換**。
   *
   * ⚠**素直に parse させると別物になる**（続き536 の実測）＝コスト側が即時実行され、
   *   能力喪失が `REMOVE_ABILITIES{SIGNI owner:'self'}`＝**自分のシグニ**の能力消しに化ける。
   *   だから parser 側は専用規則でこの構造だけを組む（`quotedDamageReplaceAbility`）。
   *
   * 宣言＝ルリグ付与ストア（`GRANT_LRIG_ABILITY` が積む CONTINUOUS）。
   * 消費＝`screens/battle/lifeCrashReplace.ts` の funnel 1本（消費地点は crashOneLife と
   *   ルリグアタック応答の2つ）。**funnel を通さないと片方だけ効く不整合になる。**
   */
  damageReplaceByCost?: {
    /** 支払い方（**原文の並び順**。funnel は先に成立したものを使う）。 */
    options: {
      /** エナで払う色スロット（`selectOptionalCostEnergy` と同じ表記）。 */
      costColors?: string[];
      /** 手札を捨てて払う枚数。 */
      handDiscard?: number;
      /** エナゾーンからトラッシュに置いて払う枚数。 */
      energyTrash?: number;
    }[];
    /** 「そうした場合、このルリグはこの能力を失う」＝払ったらこの付与能力を1つ捨てる。 */
    loseAbility?: boolean;
  };
  /**
   * `REFRESH_LIFE_MOVE_REPLACE_LOSE_ABILITY`（§6.4 O-37(b)・続き543）＝
   * 「あなたのライフクロスがリフレッシュによってトラッシュに移動する場合、
   *  代わりにこのルリグはこの能力を失う。」（`WX24-P3-009` が付与）。
   * 消費は `engine/refresh.ts` の `applyRefreshState` 1本（リフレッシュ経路の唯一の choke point）。
   */
  refreshLifeMoveReplace?: true;
  /**
   * `TRASHED_CARD_TO_HAND_OR_ENERGY` の「カードを１枚**まで**」（§6.4 O-37(c)・続き543）。
   * 立っているときだけ CHOOSE に「何もしない」枝が出る（既定＝ちょうど1枚＝`WX24-P3-030-E1`）。
   */
  trashedCardUpTo?: boolean;
  /**
   * PREVENT_LRIG_DAMAGE（§6.4 O-10・続き507）＝原文が
   * 「代わりにダメージを受けず、**ターン終了時まで、この能力を失う**」（`WXK01-002-E1`）の形のとき true。
   * 1回防いだ時点で `lost_ability_effect_ids_this_turn` に刻み、**そのターンは二度と防がない**。
   * ⚠落とすと「回数無制限の防御」に化ける（`PREVENT_LRIG_DAMAGE` の既定はまさに無制限）。
   */
  loseAbilityAfterUse?: boolean;
  /** OPTIONAL_COST: discard count is the stored target SIGNI's level. */
  handDiscardCountFromTargetLevel?: boolean;
  /** Filter for a target-level-derived hand discard cost. */
  handDiscardFilter?: TargetFilter;
  handDiscard?: { count: number | 'ALL'; upToCount?: boolean; filter?: TargetFilter; selectionConstraint?: SelectionConstraint };
  /** OPTIONAL_COST: 手札から条件一致カードを選んで公開する（手札には残す）。 */
  handReveal?: { count: number; filter?: TargetFilter; selectionConstraint?: SelectionConstraint };
  /** OPTIONAL_COST: 手札からエナゾーンへ置く任意コスト。 */
  handToEnergy?: { count: number; filter?: TargetFilter };
  /** OPTIONAL_COST: 手札から効果元シグニの下へ置く任意コスト。 */
  handToUnderSelf?: { count: number; filter?: TargetFilter; selectionConstraint?: SelectionConstraint };
  /** OPTIONAL_COST: 自分の全シグニの下から合計N枚をトラッシュへ置く任意コスト。`fromThis`＝「**このシグニの**下から」限定。 */
  // filter＝下カードの絞り込み（「このシグニの下から**赤のシグニ**1枚」＝`WXDi-P11-042-E1`）。
  // ⚠`optionalCostPaySteps` と `canAffordOptionalCostSpec` の**両方**で honor すること
  //   （片方だけだと「払えない盤面で支払うボタンが出る」か「どの下カードでも払える」になる）。
  underAnySigniTrash?: { count: number; fromThis?: boolean; filter?: TargetFilter };
  /**
   * UNDER_CARD_AS_ENERGY_COST: 「このシグニの下にあるカードをエナゾーンにあるかのように
   * トラッシュに置いて（エナコストを）支払える」（`WXDi-P10-041`）。CONTINUOUS の宣言型で、
   * 消費は `screens/battle/energyPaySource.ts`（エナ支払い元 funnel）。
   * ⚠engine で原文を再パースしない＝限定は必ずこの構造に載せる（`sideAttackEmptyZoneAsFront` と同じ規約）。
   */
  underCardAsEnergyCost?: { perTurnLimit?: number; duringMyAttackPhase?: boolean };
  /**
   * INTERNAL_LEAVE_SUB_ASK / INTERNAL_LEAVE_SUB_DECIDE（§6.4 離場置換の対話化）。
   * `ask` ＝まだ問うていない victim の待ち行列、`decide` ＝被害側が下した1件の決定。
   * ⚠**engine 内部専用**（parser は生成しない・逆翻訳にも出さない）。
   */
  leaveSub?: {
    /** 問う対象の残り（先頭から1体ずつ CHOOSE を出す）。 */
    queue?: string[];
    /** 決定を書き込む victim。 */
    victim?: string;
    /** `LeaveSubstituteOption.key`。`'none'` は「置換しない」。 */
    choice?: string;
    /** victim の所有者（効果主から見た owner）。 */
    victimOwner?: Owner;
    /** バニッシュ経路か（F-3 と replaceBanish は排他）。 */
    isBanish?: boolean;
  };
  /** OPTIONAL_COST: 自分の場のシグニをトラッシュへ置く任意コスト。 */
  fieldTrash?: { count: number; filter?: TargetFilter; excludeSelf?: boolean };
  /** OPTIONAL_COST: 自分の場のシグニをデッキの一番下へ置く任意コスト。 */
  fieldToDeckBottom?: { count: number; filter?: TargetFilter; excludeSelf?: boolean };
  /** OPTIONAL_COST: 異なる条件の場シグニを組でトラッシュへ置く任意コスト。 */
  fieldTrashGroups?: { count: number; filter?: TargetFilter }[];
  /** OPTIONAL_COST: 自分の場のカードをルリグトラッシュへ置く任意コスト。 */
  fieldToLrigTrash?: { count: number; filter?: TargetFilter };
  /** OPTIONAL_COST: アップ状態の**自分の場のシグニ**N体をダウンする任意コスト（「あなたのアップ状態の＜X＞のシグニN体をダウンし…てもよい」）。filter は色/クラス等の限定。 */
  fieldDown?: { count: number; filter?: TargetFilter };
  /** OPTIONAL_COST: アップ状態のセンタールリグ1体をダウンする任意コスト。 */
  lrigDown?: { count: number; centerOnly?: boolean; level?: number };
  /** OPTIONAL_COST: アップ状態のルリグを好きな数ダウンする。 */
  lrigDownVariable?: { min: number };
  /** INTERNAL_PAY_LRIG_DOWN_VARIABLE の選択枚数。 */
  lrigDownVariableCount?: number;
  /** OPTIONAL_COST: 場のチャームを好きな数トラッシュする。 */
  charmTrashVariable?: { min: number };
  /** OPTIONAL_COST: 効果元シグニ自身をダウンする任意コスト。 */
  down_self?: boolean;
  /**
   * OPTIONAL_COST: 効果元シグニ自身を**場からエナゾーンへ置く**任意コスト（§6.4 O-7）。
   * 「（場にある）このシグニをエナゾーンに置いてもよい。そうした場合、〜」＝場を空けることが対価。
   * ⚠`fieldTrash`（トラッシュ送り）とは行き先が違うので流用できない＝エナが増える／トラッシュ参照に載らない。
   */
  selfToEnergy?: boolean;
  /**
   * OPTIONAL_COST: 効果元シグニ自身を**場からトラッシュへ置く**任意コスト（§6.4 O-11）。
   * 単独の「このシグニを場からトラッシュに置いてもよい」は専用 STUB `OPTIONAL_TRASH_SELF` が受けるが、
   * **他の支払い（手札捨て等）と同じ1つの任意ゲートに束ねる**形（`WX20-069-E1`
   * ＝「手札から＜遊具＞のシグニを３枚捨て、このシグニを場からトラッシュに置いてもよい」）は
   * `OPTIONAL_COST` 側に受け皿が無く、**手札3枚の支払いだけが丸ごと踏み倒されていた**。
   * ⚠`fieldTrash` では「自分の任意のシグニ1体」になり原文の「このシグニ」に限定できない。
   */
  selfTrash?: boolean;
  /** OPTIONAL_COST: 場のシグニを【ビート】にする任意コスト。原文上の自身/他の区別は共通解析器が担う。 */
  beat_signi?: number;
  /** OPTIONAL_COST: トラッシュのシグニを【ビート】にする任意コスト。 */
  beat_signi_from_trash?: { count: number; filter?: TargetFilter };
  life_crash?: number;
  lifeTrash?: number;
  lifeToHand?: number;
  /** OPTIONAL_COST: デッキ上からN枚をトラッシュへ置く任意コスト。 */
  deckTrash?: number;
  /** OPTIONAL_COST: 自分の場のチャームN枚を左のゾーンからトラッシュへ置く任意コスト。 */
  charmTrash?: number;
  /** OPTIONAL_COST: ルリグデッキから条件一致アーツを選んでルリグトラッシュへ置く任意コスト。 */
  trashArtsFromLrigDeck?: { color?: string; count: number };
  /**
   * `EXILE_ARTS_FROM_LRIG_DECK_SKIP_SIGNI_STEP`: ルリグデッキのアーツを**ゲームから除外**する任意コスト。
   * ⚠`trashArtsFromLrigDeck`（行先＝ルリグトラッシュ）とは**行先が違う**ので流用してはいけない
   *   （除外は `excluded` 行きでリフレッシュにも戻らない）。`minTotalCost` は「コストの合計がN以上」。
   */
  exileArtsFromLrigDeck?: { count: number; minTotalCost?: number };
  /**
   * `ARTS_ATTACK_EMPTY_ZONE_AS_FRONT`（`WX16-021`）: このターン、指定クラスのシグニが**シグニのいない**
   * 相手シグニゾーンへ【側面アタック】した場合、正面扱いにして対戦相手にダメージを与える。
   * ⚠既定の【側面アタック】は**空ゾーンだと何も起きない**（UI も空ゾーンを提示しない）ので、
   *   この効果は「解決」と「アタック先の提示」の両方を変える。
   */
  sideAttackEmptyZoneAsFront?: { cardClass?: string };
  /** OPTIONAL_COST: 相手の場のウィルスN個を左のゾーンから取り除く任意コスト。 */
  removeOppVirus?: number;
  // ---- 「それのレベル１につき〈コスト単位〉を支払ってもよい」族（タスク12(liii)）----
  // 対象シグニのレベル分だけコスト単位を繰り返す任意コスト。単位は3系統あり、いずれも
  // STORE_LAST_PROCESSED_TARGETS で固定した対象（storedTargetCards）のレベルを倍率にする。
  // ①エナ色：costColorsPerTargetLevel=['無'] → レベル3なら《無》《無》《無》
  // ②手札を捨てる：既存 handDiscardCountFromTargetLevel（+handDiscardFilter）
  // ③エナゾーンから置く：energyTrash（+energyTrashCountFromTargetLevel）
  /** OPTIONAL_COST: 対象のレベル1につき繰り返す単位エナコスト（例 ['無']）。 */
  costColorsPerTargetLevel?: string[];
  /** OPTIONAL_COST: エナゾーンからトラッシュへ置く任意コスト。 */
  energyTrash?: { count: number | 'ALL'; upToCount?: boolean; filter?: TargetFilter; selectionConstraint?: SelectionConstraint };
  /** OPTIONAL_COST: energyTrash.count を対象シグニのレベルにする。 */
  energyTrashCountFromTargetLevel?: boolean;
  /** OPTIONAL_COST: energyTrash の候補を「対象と同じレベル」に限定（「それと同じレベルの緑のシグニ」）。 */
  energyTrashSameLevelAsTarget?: boolean;
  /** SELECT_TARGET_ONLY: 盤面を変えずに対象だけを選ばせ lastProcessedCards に記録する対象宣言。 */
  selectTarget?: EffectTarget;
  /**
   * OPTIONAL_COST: 「このキーを場からルリグトラッシュに置く」（§6.4 O-3・`WDK06-R09-E1`）。
   * ⚠キーゾーンはシグニゾーンと別なので `fieldToLrigTrash` では払えない。
   */
  trashOwnKey?: boolean;
  /**
   * OPTIONAL_COST: 「〈コスト〉を**支払わないかぎり**、X」の回避ゲート（§6.4 O-30）。
   * 機構は通常の任意コストと同じ（pay＝`then`／skip＝`else`）だが、**選択肢の文言だけ**を
   * 「支払う／支払わない」へ変える。⚠既定の「発動する／スキップ」のままだと、
   * 「払うと自分のシグニが助かる」場面で**払わない方が得に見える**表示になり実機で判断できない。
   */
  unlessPay?: boolean;
  handDiscardGroups?: { count: number; filter?: TargetFilter }[];
  /** OPPONENT_PAY_OPTIONAL: energy payment alternative may instead be paid by discarding this many hand cards ('ALL' = whole hand). */
  opponentHandDiscard?: number | 'ALL';
  /** OPPONENT_PAY_OPTIONAL: restricts which hand cards satisfy `opponentHandDiscard`（「無色のカードを1枚捨てないかぎり」＝WX11-044）。 */
  opponentHandDiscardFilter?: TargetFilter;
  /**
   * OPPONENT_PAY_OPTIONAL: 「対戦相手は手札を**N枚まで**捨ててもよい」＝**枚数が可変**（§6.4 O-9(a)）。
   * ⚠`opponentHandDiscard`（all-or-nothing）で近似すると **0枚かN枚**に丸まり、
   *   「この方法で捨てたカード1枚につき〜」の中間値（1枚だけ捨てる）が**選べない**。
   *   1..N の各枚数を選択肢として出し、帰結は `DRAW{addLastProcessedCount}` 等で実枚数に追従させる。
   */
  opponentHandDiscardUpTo?: number;
  /** OPPONENT_PAY_OPTIONAL: avoidance by trashing this many of the opponent's own energy cards ('ALL' = whole energy zone). */
  opponentEnergyTrash?: number | 'ALL';
  /** OPPONENT_PAY_OPTIONAL: avoidance by trashing this many of the opponent's own field SIGNI（「自分のシグニ１体を場からトラッシュに置かないかぎり」＝WX22-025-E3／WXDi-P16-088-E1。タスク12(lxi) 第3波）。 */
  opponentSigniTrash?: number;
  /** OPPONENT_PAY_OPTIONAL: avoidance by putting this many of the opponent's own field SIGNI on top of their deck（タスク12(lxi) 第5波）。 */
  opponentSigniToDeckTop?: number;
  /**
   * OPPONENT_PAY_OPTIONAL: 回避＝**手札とエナゾーンから合計N枚**を自分のデッキの一番上に置く
   * （`WXK06-067-E1`「対象としたエナゾーンのカードと手札を合計２枚デッキの一番上に置かないかぎり」。
   * タスク12(lxi) 第11波）。**ゾーンを跨ぐ単一プール**なので `HAND_OR_ENERGY_CARD` を使う＝
   * 「手札からN枚」「エナからN枚」の2枝には割れない（内訳を相手が自由に決められるのが原文）。
   */
  opponentHandOrEnergyToDeckTop?: number;
  /**
   * OPPONENT_PAY_OPTIONAL: 《無》の枚数が固定ではなく「**このターンにシグニがアタックした回数**」に比例する
   * 可変コスト（`WXK05-009-E2`「このターンにシグニがアタックした回数１回につき《無》を支払わないかぎり」。
   * タスク12(lxi) 第8波）。true のとき `costColors` は無視し、**支払う側**（＝`otherState`）の
   * `attacked_signi_ids.length` を実行時に《無》の枚数として解決する。アタックのたびにコストが上がる。
   */
  /** ASSIST_LRIG_ATTACK_THIS_TURN: アタックを許可するアシストルリグのレベル下限（「レベル１以上の」）。 */
  minLevel?: number;
  opponentPayColorlessPerSigniAttack?: boolean;
  /**
   * OPPONENT_PAY_OPTIONAL: **極性の反転**（§6.4・続き425）。
   *
   * 既定（false／未指定）は原文「対戦相手が〈コスト〉**しないかぎり**、X」＝**支払わなかったとき**に
   * 直後 `CONDITIONAL` の `then`（＝X）が走る（回避ゲート）。ところが同じ STUB を使う原文にはもう1つ
   * **逆向きの極性**がある＝「対戦相手は〈コスト〉**してもよい。そうした場合**、X」＝**支払ったとき**に X。
   * parser はどちらも同じ `STUB + CONDITIONAL{IS_MY_TURN}` に落としていたため、後者2効果
   * （`SPDi43-06-E1`／`WXDi-P05-037-E1`＝どちらも「そうした場合、このアタックを無効にする」）は
   * **意味が真逆**になっていた（相手が何もしなければ自分のアタックが無効化される）。
   *
   * true のとき：各支払い枝は `SEQUENCE[支払い, then]`、「支払わない」枝は `else ?? 何もしない`。
   */
  thenOnPay?: boolean;
  // ---- BLOCK_OPP_ZONE_PLACEMENT: 指定シグニゾーンへの新規配置禁止（タスク12(lxi) 第10波）----
  /** 禁止がこのターンにも及ぶ（「**このターンと**次のターンの間」＝WXDi-P11-009-E3）。 */
  zoneBlockThisTurn?: boolean;
  /** 禁止が次のターンにも及ぶ（「次のターンの間」＝3枚とも該当）。 */
  zoneBlockNextTurn?: boolean;
  /** 支払えば配置できる《無》の枚数（「《無》×5 を支払わないかぎり…配置できない」）。省略＝無条件禁止。 */
  zoneBlockColorless?: number;
  /**
   * 禁止するゾーンの**供給源**（タスク12(lxxvi)）。省略＝`'designated'`（直前の `DESIGNATE_SIGNI_ZONE`）。
   * - `'vacated'`＝「**それがあった**シグニゾーン」＝直前に場を離れたシグニのゾーン（`WX08-032-E1`）。
   *   `signi_zone_vacated_just` を読む＝**直前ステップが場からの除去であること**が前提。
   * - `'virus'`＝「**【ウィルス】がある**シグニゾーン」＝該当ゾーンすべて（`WXEX1-24-E1` ③）。**複数ゾーン**。
   */
  zoneBlockSource?: 'designated' | 'vacated' | 'virus';
  /** OPTIONAL_COST: mutually-exclusive payment tiers, each with its own result action. */
  additionalCostChoices?: Array<{
    id: string;
    label: string;
    costColors: string[];
    action: EffectAction;
  }>;
  /** OPTIONAL_COST: result action when no tier is paid. */
  unpaidAction?: EffectAction;
  exceed?: number;
  // NEGATE_NTH_ATTACK: このターン、対戦相手のアタックを共有カウントで N 回目まで無効化。
  // signi/lrig は無効化対象に含める攻撃種別。count は「一度目か二度目」=2 / 「一度目」=1。
  negateNthAttack?: { count: number; signi: boolean; lrig: boolean };
  // POWER_PLUS_BANISHED_POWER: バトルでバニッシュされたシグニの直前実効パワーを対象へ加算。
  powerPlusBanishedPower?: {
    target: { type: 'SIGNI'; owner: 'self'; count: 1; filter: TargetFilter };
    duration: 'UNTIL_OPP_TURN_END';
  };
  // VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE: 指定Storyのエナを0〜maxCount枚トラッシュし、
  // 実際に置いた枚数と同レベルの相手シグニをバウンス。resolve=true はコスト選択後の内部継続。
  variableEnergyTrashLevelBounce?: { story: string; maxCount: number; resolve?: boolean };
  fetchCardName?: string; // SELF_TO_LRIG_DECK_AND_FETCH_SAME_NAME: 名指しフェッチ先（省略時は自身と同名。PR-470A→《進化する筋肉 紗倉ひびき》）
  /**
   * MILL_EACH_REPEAT_ON_NAME（§6.4 O-22(b)・`WX12-037-E2`）＝「各プレイヤーは自分のデッキの上から
   * カードをN枚トラッシュに置く。この方法でトラッシュに置いたカードの中にカード名に《X》を含む
   * カードがある場合、あなたはこの効果を繰り返してもよい。」
   * ⚠**ミルもこの STUB が行う**（前段の TRASH{DECK_CARD} ステップごと畳み込む）＝条件が見るのは
   *   「この方法で」置いた**両プレイヤー分**なので、SEQUENCE の step ごとに上書きされる
   *   `lastProcessedCards` では**相手の分しか見えず過少発火**する。
   * ⚠リフレッシュはこの効果の処理中には起こさない（原文の但し書き）＝デッキが尽きたら取れる分だけ取る。
   */
  millEachRepeatOnName?: { count: number; name: string };
  /**
   * `INTERNAL_ASK_ACCE_HOST`（§6.4 O-11）＝デッキから探したカードを【アクセ】にする際の
   * **ホスト側**（付け先シグニ）の絞り込み。「あなたの＜調理＞のシグニ1体を対象とし、〜それの【アクセ】にし」。
   * ⚠アクセ**カード側**の絞り込みは SEARCH の `filter` が担当＝役割を混ぜない。
   */
  acceHostFilter?: TargetFilter;
  type: 'STUB';
  id: string;
  /** 実行時に設定するターン持続 state の寿命。省略時は宣言型／既存 no-op のまま。 */
  until?: 'END_OF_TURN';
  // GUARD_LOSS_UNLESS_LRIG: このクラスを持つセンタールリグでなければ、手札の自身は【ガード】を失う。
  // 省略された既存 STUB は過剰なガード喪失を避けるため engine 側で無視する。
  lrigClass?: string;
  // 相手効果によるパワー修正への常時耐性。subjectOwner はこの能力の持ち主基準。
  // 既存 PREVENT_* STUB の後方互換を保ちつつ、±方向・全体/属性/自身/相手側を厳密に表す。
  powerModifyProtection?: {
    directions: Array<'plus' | 'minus'>;
    subjectOwner: Owner;
    subjectFilter?: TargetFilter;
    thisCardOnly?: boolean;
  };
  costColors?: string[]; // OPTIONAL_COST: 支払うエナの色リスト（例: ['赤','赤']）
  coinCost?: number;     // OPTIONAL_COST: 支払う《コイン》の枚数（「《コイン》を支払ってもよい」。エナと併用も可）
  costText?: string;     // OPTIONAL_COST: エナ色以外の任意コスト句を原文どおり明示（例: 「このシグニを場からトラッシュに置いてもよい」「使用コストとして追加でエクシード４を支払ってもよい」）。decompiler はこれをそのまま描画。engine 精緻化は別途（A3）
  revealPickParams?: {   // REVEAL_PICK_HAND_SHUFFLE_BOTTOM: REVEAL_AND_PICK マージ用メタデータ
    pickCount: number | 'ALL';
    restDest: 'deck_bottom' | 'trash' | 'energy';
    restShuffle?: boolean; // 「残りをシャッフルしてデッキの一番下に置く」（PR-434）
    // ⚠`'field'` は `parseRevealPickDescriptor` が最初から解けていたのに `makeRevealPickStub` が
    //   `'hand'` へ落としていた（＝「場に出す」が黙って「手札に加える」に化ける潜在バグ。§6.4 UNKNOWN 消化で是正）。
    then: 'hand' | 'energy' | 'field';
    // ピック対象の絞り込み（タスク12(xlvi)(h)）。融合規則が filter を運ばず「どのカードでも拾える」
    // 過剰実行になっていたため、pick 記述子から復元して REVEAL_AND_PICK へ渡す。
    filter?: TargetFilter;
    /** 選んだ複数枚どうしの相互差異（「それぞれレベルの異なるシグニを４枚まで」）。§6.2 段2 第42バッチ。 */
    selectionConstraint?: SelectionConstraint;
    pickUpTo?: boolean;    // 「N枚まで」（上限）
    pickNoun?: string;     // 逆翻訳の名詞（既定「シグニ」）
    handOrEnergy?: boolean; // 「手札に加えるかエナゾーンに置く」＝1枚ずつ対話選択
    // 1段目（手札）の後に、残りから特定クラスを1枚までエナゾーンへ送る2段階ピック（FUTURE SESSION ②）
    secondPick?: { classContains: string; toMax: number; restDest: 'deck_bottom' | 'trash' };
  };
  seedCards?: string[]; // INTERNAL_SEEDS_PLACE_LOOP / INTERNAL_SET_SEED: 【シード】として順次設置するカード（複数枚設置をインタラクション跨ぎで保持。WXK04-010 アンコール・シード）
  revealed?: string[]; // REVEAL_SECOND_PICK_ENERGY: 1段目で公開したカード一覧（残り算出用）
  pickQueue?: string[]; // INTERNAL_HAND_OR_ENERGY: 「手札に加えるかエナゾーンに置く」を1枚ずつ問う残りのカード
  pileTrashCards?: string[]; // INTERNAL_RESOLVE_PILES: トラッシュへ置く明示instanceId群
  pileHandCards?: string[];  // INTERNAL_RESOLVE_PILES: 手札へ加える明示instanceId群
  secondPick?: { classContains: string; toMax: number; restDest: 'deck_bottom' | 'trash' }; // 同上
  /**
   * `TRAP_OP` / `TRAP_OPERATION`：カード全文を読み直さず、parser が一致した**文の操作**を渡す
   * （§5.3 `O-56`・2026-08-24）。StubAction 全体の共用フィールドなので optional だが、
   * live の `TRAP_OP` / `TRAP_OPERATION` では全ノード必須。
   */
  trapOp?: 'set' | 'trash' | 'activate' | 'rearrange' | 'to_check' | 'from_check'
    | 'under_signi' | 'activate_check_burst' | 'burst_as_check' | 'gain_trap_ability';
  /** 【トラップ】設置・発動・チェックゾーン移動の候補限定。 */
  trapFilter?: TargetFilter;
  /** 「そのシグニゾーン」「それがあったシグニゾーン」＝既存の自由ゾーン選択では表現不能。 */
  trapFixedZone?: 'source' | 'previous';
  /** デッキ上を見て選んだ後の残り札の行き先。 */
  trapRemainder?: 'hand' | 'trash' | 'deck_top' | 'deck_bottom';
  /** `under_signi` の付け先カード名。カード全文regexの代わりにparserが列挙する。 */
  trapHostNames?: string[];
  /**
   * `activate_check_burst` / `burst_as_check` で発動するライフバーストの持ち主カード。
   * 🔴**「発動しますか？」の CHOOSE を出す前に確定させて option の action へ載せる**（続き646 の実機で発見）＝
   *   `{...stub, value:'activate'}` だけを持たせると、CHOOSE を1往復した後の ctx には
   *   `lastProcessedCards`（＝直前にトラッシュへ送ったカード）が残っておらず、再開時に対象を見失って
   *   **無言で done する**（`WXK11-036-E2` が実機でライフバーストを1度も発動しなかった）。
   */
  trapBurstCard?: string;
  /** `count` が「N枚まで／好きな枚数」という上限であること。既存語彙名をStubActionでも共有する。 */
  upToCount?: boolean;
  /**
   * `PLACE_TRAP_OPTIONAL` / `TRAP_OP` / `TRAP_OPERATION`：**どこから**【トラップ】等の対象を取るか。
   * 🔴省略時は `'hand'`＝**手札から**で、これが従来の唯一の挙動だった。原文が「そのカードを」
   * （＝直前に見たデッキの札）や「このシグニをエナゾーンから」と書いていても手札から設置していた
   * ＝**まったく別のカードが場に置かれる**（`WX15-086` / `WX16-015` / `WX16-029` / `WX21-036`）。
   * ⚠設置の実体は出所非依存の `INTERNAL_ASK_TRAP_ZONE`→`INTERNAL_PICK_TO_TRAP` が担う
   *   （deck / hand / energy のどこからでも抜く）。ここは**候補集合の出どころだけ**を決める。
   */
  trapSource?: 'hand' | 'looked' | 'looked_or_hand' | 'energy_self' | 'deck_top' | 'field_signi' | 'check' | 'trash';
  /**
   * `PLACE_TRAP_OPTIONAL` / `SET_HAND_CARD_AS_TRAP`：設置が**任意か**（原文「設置しても**よい**」）。
   * 🔴§5.3 `O-87`（2026-08-26）＝engine は**手札枝を無条件で `optional:false`**（＝強制）にしていた。
   *   live 実測3件のうち2件（`WX19-059-BURST`／`WX21-057-E1`）は原文が「してもよい」＝
   *   **設置しない選択を奪う過剰実行**だった（残る `WX16-017-E1` だけが「設置する」＝強制）。
   * ⚠**既定は `true`（任意）**＝原文の大多数が「してもよい」で、強制側へ倒すほうが害が大きい。
   */
  trapPlaceOptional?: boolean;
  /**
   * `OPTIONAL_COST`：**効果元カード自身をエナゾーンからデッキの一番下へ置く**任意コスト
   * （§5.3 `O-55`・`WXDi-P02-044-E1`「このシグニをエナゾーンからデッキの一番下に置いてもよい」）。
   * `selfToEnergy`／`selfTrash` の**行き先違い**で、違いは**払う場所が場ではなくエナゾーン**なこと
   * （バニッシュで既にエナへ行った自分自身が対価）。
   */
  selfEnergyToDeckBottom?: boolean;
  value?: number | string; // 汎用値（SET_DECLARED_NUMBER等で使用）
  // DECLARE_CLASS: 宣言できるクラスを原文が列挙している場合の候補（「＜精像＞か＜精武＞か…から１つを宣言する」PR-431）。
  // 省略時は従来どおり盤面/手札/トラッシュから動的収集する。列挙があるのに無制限に宣言させるのは過剰実行なので明示で絞る。
  declareOptions?: string[];
  count?: number;          // GAIN_SIGNI_BARRIER / GAIN_LRIG_BARRIER 等の個数
  /** SIGNI_FLIP_FACEDOWN: 裏向きにする場シグニの対象宣言。 */
  faceDownTarget?: {
    owner: 'self' | 'opponent';
    count: number | 'ALL';
    upToCount?: boolean;
    frontOfSelf?: boolean;
    /** 対象化を効果解決時ではなく現在ターン終了時まで遅延する。 */
    delayUntilTurnEnd?: boolean;
    /** 裏向き化後の復帰 timing。 */
    returnTiming?: 'TURN_END' | 'NEXT_OPP_ATTACK_PHASE_START';
  };
  // STEAL_OPP_TRASH_PUPPET の汎用化パラメータ（WXK10-055 等）。省略時は従来挙動（ベット時2枚/非ベット1枚・必須・レベル制限なし）。
  puppetParams?: {
    count?: number;          // 出す枚数（省略時=ベット2/非ベット1）
    optional?: boolean;      // 「場に出してもよい」＝スキップ可
    levelLteTrigger?: boolean; // 候補をトリガー元シグニ（triggeringCardNum）のレベル以下に限定（「そのシグニのレベル以下」WXK10-055-E2）
    // 相手トラッシュの候補を静的に絞る（2026-08-18・§5d-0 (i)）。
    // 「対戦相手のトラッシュから**レベル３以下の**シグニ１枚」（WDK17-013-E1／WDK17-017-E1）／
    // 「**＜美巧＞ではない**レベル３以下の」（WXK10-091-E2）。⚠落とすと相手トラッシュのどのシグニでも奪える。
    filter?: TargetFilter;
  };
  burstFilter?: TargetFilter; // GRANT_ALL_ZONE_LIFEBURST: 付与対象の絞り込み（省略時=全カード。例: ＜怪異＞シグニ限定=WX17-036）
  burstAction?: EffectAction; // GRANT_ALL_ZONE_LIFEBURST: 付与する【ライフバースト】のアクション（省略時=相手シグニ1体バニッシュ=WD14-001）
  burstAdditive?: boolean;    // GRANT_ALL_ZONE_LIFEBURST: ネイティブ【ライフバースト】を持つカードにも付与分を追加（両方を好きな順で使用）。例: WX02-002（すべての領域のカードが追加で【エナチャージ１】）
  // BANISH_SUBSTITUTE (F-3): バニッシュされる場合の任意身代わり置換（CONTINUOUS宣言）。
  // バトルバニッシュ経路で「victim の代わりに sacrifice をバニッシュしてもよい」を対話で適用する。
  banishSubstitute?: {
    // self_sacrifice_other: このシグニ(victim=自身)がバニッシュされる代わりに、別の sacrificeClass のシグニ1体を犠牲にする（WX12-024/WXEX2-60）
    // protect_other_sacrifice_self: 別のシグニ(victim)がバニッシュされる代わりに、このシグニ自身(sacrifice=自身)を犠牲にする（WX20-055/CP01-032/P10-052）
    pattern: 'self_sacrifice_other' | 'protect_other_sacrifice_self';
    sacrificeClass?: string;                  // self_sacrifice_other: 犠牲にする他シグニのクラス（例: '電機'）。省略時=任意の他シグニ
    sacrificeFilter?: TargetFilter;           // self_sacrifice_other: 身代わりに差し出す側の対象条件
    victimFilter?: 'riseIcon' | 'otherAny';   // protect_other_sacrifice_self: 守る対象（'riseIcon'=《ライズアイコン》持ち / 'otherAny'=このシグニ以外の任意の自シグニ）
    victimTarget?: EffectTarget;              // protect_other_sacrifice_self: 守られる側の対象条件
    oppTurnOnly?: boolean;                     // 対戦相手のターンの間のみ有効（CP01-032/P10-052）
  };
  // BATTLE_BANISH_PREVENT_LOSE_ABILITY（§3タスク6 D・置換ルール）: 「（このシグニ/あなたの＜C＞のシグニ1体）が
  // バニッシュされる場合、代わりにバニッシュされず、ターン終了時まで、この能力を失う」。バトルバニッシュ経路で
  // 自動適用＝victim を場に残し source を abilities_removed へ（同ターン中は再発動不可）。WX13-031/WX16-001/WXK04-068。
  // activeCondition（oppTurnOnly＝「対戦相手のターンの間」）は eff.activeCondition で honor。
  banishPrevent?: {
    thisCardOnly?: boolean;   // true＝このシグニ自身のみ守る（source=victim）。WX13-031/WXK04-068
    story?: string;           // 指定＝あなたの当該＜C＞のシグニを守る（source は別カードでも可）。WX16-001＝怪異
    oppTurnOnly?: boolean;    // 「対戦相手のターンの間」のみ有効（isOwnerTurn=false のときだけ）。WX16-001/WXK04-068
  };
  // EFFECT_LEAVE_REPLACE_BANISH（§3タスク6 D・§6.3 機構待ちの acknowledged STUB）: 「あなたの＜C＞のシグニが
  // 対戦相手の効果によって場を離れる場合、その移動がバニッシュによるものでないなら、代わりにそのシグニを
  // バニッシュしてもよい」＝WX25-P1-056-E1。非バニッシュ場離れ（手札戻し/トラッシュ/デッキ戻し等）への
  // 横取りフックが engine に無いため現状 no-op（従来は所有者反転した CONTINUOUS BANISH 幻覚だった）。
  leaveReplaceBanish?: { story?: string };
}

// 生徒との絆を獲得する（ブルアカ絆メカニクス）
export interface MILLAction {
  type: 'MILL';
  owner: Owner;
  count: number;
  /**
   * 「デッキから**すべての**カードをトラッシュに置く」（`PR-469`②・§6.4 O-11）。
   * `count` を無視してデッキ全体を落とす。⚠大きな `count` で代用しない（枚数が原文に無いので嘘になる）。
   */
  all?: boolean;
  countFromZone?: CountFromZone;
  fromBottom?: boolean;
  useDeclaredCount?: boolean;
  countIsLastProcessedLevelSum?: boolean; // count を「直前に処理したシグニ(lastProcessedCards)のレベル合計」にする（「この方法で場に出たシグニのレベル１につき…1枚トラッシュ」WX24-P3-039）
  lastProcessedLevelVerbJa?: string; // 逆翻訳で直前集合の由来（場に出た／捨てられた）を描き分ける。
  // count に「この方法でダウンしたルリグのレベルの合計」を**加算**する（「レベルの合計に１を加えた枚数」＝
  // count:1 と併用。WX25-P2-114。タスク12(cix)）。参照は PlayerState.last_lrig_down_level_sum＝ダウンの
  // 単一入口 payLrigDownCost が記録するため、枚数選択の CHOOSE を跨いでも失われない。
  countPlusLastDownedLrigLevelSum?: boolean;
  countPerSourceLevel?: number; // 誘発元シグニのレベル1につきN枚（付与AUTOの「このシグニのレベル1につき」。WXDi-P02-034）
  countPerLastProcessed?: number;
  countPerStoredTargets?: number;
  optional?: boolean;
  alsoOpponent?: boolean; // true=同じ枚数・位置で両プレイヤーをミルし、結果を1つに記録
  appendLastProcessed?: boolean; // true=直前の記録へ今回ミルしたカードを追記（両者ミルの合計参照用）
  untilFilter?: TargetFilter; // 一致カードが untilCount 枚置かれるまでミル
  untilCount?: number;
}

export interface GainBondAction {
  type: 'GAIN_BOND';
  // 'last_found': 直前のREVEAL_AND_PICK/SEARCHで見つかったカード名と絆を獲得
  // 'declared': デッキからカードを選び、そのカード名と絆を獲得（UIインタラクション要）
  source: 'last_found' | 'declared';
}

// このターン特定カードを使用禁止にする
export interface BlockCardUseAction {
  type: 'BLOCK_CARD_USE';
  cardName: string;
}

export interface PreventNextDamageAction {
  type: 'PREVENT_NEXT_DAMAGE';
  count: number;
  // ダメージ源の限定（「次にあなたがルリグ/シグニによってダメージを受ける場合」）。
  // 逆翻訳の忠実化用。engine 側は現状ダメージ源を区別せず次の1回を無効化する（軽微な過剰軽減・偽陰性ではない）。
  damageSource?: 'lrig' | 'signi';
  // 直前に処理したカード（WX24-P4-006ではダウンした相手ルリグ）のレベル未満の
  // シグニによるダメージだけを対象にする。実行時にレベル値を予約へ固定する。
  sourceLevelLtLastProcessed?: boolean;
  // 防いだ1回ごとに、ターン終了時のデッキミル予約を1能力ぶん得る（デウスシールド）。
  millAtTurnEndPerPrevented?: number;
}

// 「このターン、次にあなたがダメージを受ける場合、代わりにあなたのデッキの上からカードをN枚トラッシュに置く」
// （WXDi-P15-041/WX24-P1-010 等・黒ハナレ系）。PlayerState.damage_replace_mill のキューに積み、
// crashOneLife／ルリグアタック応答が消費する。デッキがN枚未満なら置き換え不可（原文注記）＝ダメージ通過。
/**
 * 「あなたのライフクロス（1枚）が〈対戦相手のシグニのアタック〉によってクラッシュされる場合、
 * 代わりに〜する」＝**ライフクラッシュの置換宣言**（`WX24-P4-009`／`WX25-P3-004`／`WXDi-CP01-023`）。
 * ⚠**宣言であって即時実行ではない**＝`PlayerState.life_crash_replacements` に積み、
 * 消費は `screens/battle/lifeCrashReplace.ts` の funnel（消費地点2つ）が行う。
 */
export interface LifeCrashReplaceAction {
  type: 'LIFE_CRASH_REPLACE';
  /** `mill`＝自分のデッキ上N枚をトラッシュ／`crash_opponent`＝対戦相手のライフクロスN枚をクラッシュ。 */
  replaceKind: 'mill' | 'crash_opponent';
  count: number;
  /** 「対戦相手の**シグニ**によって」等の限定。 */
  damageSource?: 'lrig' | 'signi';
  /** 「シグニの**アタック**によって」限定（効果によるクラッシュには乗らない）。 */
  byAttack?: boolean;
  /** 「**次に**」＝1回限り。 */
  once?: boolean;
  /** 原文「〜してもよい」。 */
  optional?: boolean;
}

export interface ReplaceNextDamageWithMillAction {
  type: 'REPLACE_NEXT_DAMAGE_WITH_MILL';
  millCount: number;
  damageSource?: 'lrig' | 'signi'; // 逆翻訳の忠実化用（engine はダメージ源を区別しない近似・PREVENT_NEXT_DAMAGE と同様）
}

export interface TakeFromUnderSigniAction {
  type: 'TAKE_FROM_UNDER_SIGNI';
  destination: 'hand' | 'energy' | 'trash';
  count: number;
  upToCount?: boolean;
  filter?: TargetFilter;
  fromThis?: boolean; // true = このシグニの下から（sourceCardNumが基準）
}

export interface UnknownAction {
  type: 'UNKNOWN';
  raw: string;
}

// ===== AUTO 効果のトリガースコープ =====

/**
 * AUTO 効果がどの「イベント発生源」に反応するか。
 * - 'self'      : このカード自身が当該イベントの発生源（デフォルト）
 * - 'any_ally'  : 自分側の他のシグニがイベントの発生源
 * - 'any_opp'   : 相手側のシグニがイベントの発生源
 * - 'any'       : どちら側でもイベントに反応
 */
export type TriggerScope = 'self' | 'any_ally' | 'any_opp' | 'any';

// ===== カード効果（最終形） =====

export interface CardEffect {
  effectId: string;
  effectType: EffectType;

  // COPY_LRIG_NAME_ABILITY 等で他カードからコピーされた効果の場合、元カード番号を保持する。
  // テキスト駆動の STUB（GUARD_ALTERNATIVE_COST 等）が元カードの EffectText を解決するために使う。
  copiedFromCardNum?: string;

  // ACTIVATED / AUTO / LIFE_BURST 用：いつ使えるか
  timing?: EffectTiming[];

  // AUTO 効果のトリガースコープ（省略 = 'self'）
  triggerScope?: TriggerScope;

  // any_ally スコープのトリガーで、トリガー元カードが満たすべきフィルタ
  // （例: ミョルニル「あなたの＜アーム＞のシグニ１体が場を離れたとき」）
  triggerFilter?: TargetFilter;

  // AUTO トリガーの発火条件（原因・領域の限定）。WX04-035-E2「対戦相手の効果によっていずれかの領域からトラッシュに置かれたとき」等。
  triggerCondition?: {
    /** ON_CARD_MILLED_FROM_DECK: deck→trash へ移動したカード自身の属性。省略=無限定。 */
    milledCardFilter?: TargetFilter;
    /** ON_HAND_ADDED / ON_HAND_DISCARDED / ON_ENERGY_TO_TRASH / ON_TRASH_CARD_ADDED 共通の解決単位最低枚数。省略=1。 */
    minCount?: number;
    /** ON_ATTACK_END（§6.3 J-4・`WXK11-018-E2`）＝「そのアタックによって対戦相手にダメージが与えられていない場合」。バトル解決の `dealtSigniDamage` が false のときだけ発火する。 */
    attackDealtNoDamage?: boolean;
    // ── ON_ABILITY_ACTIVATED（§6.3 J-1「他能力の発動監視」）の限定 ──
    /** 発動した能力の持ち主（watcher から見て）。省略=どちらでも。 */
    activatedAbilityOwner?: 'self' | 'opponent';
    /** 発動した能力の種別。'ON_PLAY'＝【出】／'AUTO'＝【自】（＝AUTO かつ ON_PLAY を含まない）。省略=種別不問。 */
    activatedAbilityKind?: 'AUTO' | 'ON_PLAY';
    /** 【英知】能力限定＝発動した能力の activeCondition に `EICHI_LEVEL_SUM` を含む（`WX19-066`）。 */
    activatedAbilityEichi?: boolean;
    /** 「場にあるシグニの」限定＝発動元カードが持ち主の場のシグニ（`WXEX1-77`）。ルリグ/スペル/アーツ由来では発火しない。 */
    activatedAbilityFromFieldSigni?: boolean;
    banishedLevelLtWatcher?: boolean;
  notWhileAttacking?: boolean;
  outsideMainPhase?: boolean;                        // 「あなたのメインフェイズ以外で」発生したイベントのみ
    banishedFromCenterZone?: boolean;
    banishedWasUp?: boolean;
    turnOwner?: 'self' | 'opponent'; // 《自分ターン》/《相手ターン》: そのターン中のみ AUTO 発火（self=効果オーナーのターン / opponent=相手のターン）。effectStack の initStack/pushToStack で現ターンと照合しゲート（WXDi-P06-033 等）
    byOpponentEffect?: boolean; // 対戦相手の効果が原因の場合のみ発火（バトル・自分の効果・ルール処理では発火しない）
    fromAnyZone?: boolean;      // 場以外（手札・エナ・デッキ）からトラッシュに置かれた場合も発火（ON_TRASH triggerScope:self用）
    fromZones?: Array<'hand' | 'deck' | 'energy' | 'field' | 'under_signi'>; // ON_TRASH の発生源を限定（「手札かデッキから」=['hand','deck']／「シグニの下から」=['under_signi']。指定領域からのみ発火。WX04-102/WX18-062）
    forResonaCondition?: boolean; // レゾナの出現条件のためにトラッシュに置かれた場合のみ発火（WX10-055等）。通常のトラッシュ（バトル・効果・ルール処理）では発火しない
    resonaClass?: string;         // 出現条件で場に出たレゾナの＜クラス＞限定（CardClass で判定。WXEX1-58/72）
    byEffect?: boolean; // 効果によるイベントのみ発火。ON_PLAY＝通常召喚を除外、ON_SIGNI_DOWN＝アタック/コストを除外、ON_TRASH＝コスト/バトル/ルール処理を除外（任意の効果起因＝自他問わず。WX18-086等）
    bySigniEffect?: boolean; // シグニの効果によって場に出た場合のみ発火（G079等「シグニの効果によって場に出たとき」）。通常召喚・スペル/アーツ/ルリグの効果では発火しない
    byLrigOrSigniEffect?: boolean; // ルリグかシグニの効果が原因の場合のみ発火（WX14-066-E1）。CardData.Type の 'ルリグ'/'アシストルリグ'/'シグニ'/'レゾナ' を受理＝アシストルリグはルリグ・レゾナはシグニ。原因カード不明・スペル・アーツ・ルール処理では発火しない
    placedDown?: boolean; // ダウン状態で場に出た場合のみ発火（G144「あなたのシグニがダウン状態で場に出たとき」。ON_PLAY と併用）
    placedFromTrash?: boolean; // トラッシュから場に出た場合のみ発火（「シグニがトラッシュから場に出たとき」。ON_PLAY と併用。配置元がトラッシュかを場出し前後の set-diff で判定）
    placedPuppet?: boolean; // 傀儡状態で場に出た場合のみ発火（WDK17-001「あなたの傀儡状態のシグニ１体が場に出たとき」。ON_PLAY any_ally と併用。トリガー元が field.puppet_signi に在中するかで判定）
    materialUsedByPlayer?: boolean; // 「あなたが《改造素材》を使用したとき」（プレイヤー起点）＝「このシグニに使用されたとき」と区別（ON_MATERIAL_USED と併用。WXK09-047-E2/WXK09-049-E1）
    frontLowerLevelThanSource?: boolean; // このシグニ（効果元）の正面に、効果元よりレベルの低いシグニが出た場合のみ発火（WX17-075 タルタル付与。ON_PLAY any_opp と併用）
    placedFront?: boolean; // このシグニ（効果元）の正面ゾーンにトリガー元シグニが配置された場合のみ発火（WXDi-P03-043「対戦相手のシグニ１体がこのシグニの正面に配置されたとき」。ON_PLAY any_opp と併用。frontLowerLevelThanSource のレベル条件なし版）
    fromFieldByCostOrEffect?: boolean; // このシグニがコストか効果によって「場から」トラッシュに置かれた場合のみ発火（バトル・ルール処理では発火しない。G204。ON_TRASH と併用）
    fromFieldByCostOnly?: boolean; // 自分のシグニが「コストとして」場からトラッシュに置かれた場合のみ発火。効果・バトル・ルール処理は除外（ON_TRASH と併用）
    fromFieldByCostOrOwnEffect?: boolean; // 自分のシグニがコストか「あなたの効果」によって場からトラッシュに置かれた場合のみ発火（相手効果・バトル・ルール処理を除外。WXDi-P02-037-E2）
    drawBySourceStory?: string; // このドローの原因が、あなたの場にある指定＜story＞のシグニの効果である場合のみ発火（WX20-026-E3「あなたの場にある＜凶蟲＞のシグニの効果でカードを引いたとき」。ON_DRAW と併用。ドローフェイズの通常ドローやその他カードの効果ドローでは発火しない）
    outsideDrawPhase?: boolean; // ドローフェイズの通常ドロー（マンダトリードロー）では発火せず、それ以外（効果等）で引いたときのみ発火（WXDi-D09-P19/WXDi-P05-062「ドローフェイズ以外であなたがカードを１枚引いたとき」。ON_DRAW と併用）
    drawPhaseRestriction?: 'main_attack' | 'opp_attack'; // ON_DRAW triggerScope:any_opp（対戦相手ドロー）の位相限定。main_attack=メイン/アタックフェイズの間（WXDi-P04-038/PR-423）／opp_attack=対戦相手のアタックフェイズの間（WD22-029-G・対戦相手ターン＋アタック系サブフェイズ）
    drawByEffect?: boolean; // ON_DRAW triggerScope:any_opp の逆翻訳で「効果によって」を付す（WXDi-P15-091/PR-423）。engine 評価では効果ドロー経路でのみ呼ばれるため暗黙＝表示専用。発生源プレイヤー限定は drawByDrawerOwnEffect で判定する
    drawByDrawerOwnEffect?: boolean; // ON_DRAW triggerScope:any_opp で「対戦相手が【自分の効果で】引いたとき」限定（PR-423）。drawer（対戦相手）の last_draw_by_own_effect が true のときのみ発火＝reactor 自身の効果で相手を引かせた場合は誤発火しない（続き162・Opusタスク12(xxi)）
    risedOntoNameContains?: string; // このシグニが、カード名に指定文字列を含むシグニの上にライズされた場合のみ発火（WX20-056-E2「《オダノブ》を含むシグニにライズされたとき」。ON_RISE と併用。ライズで下に置かれた元シグニの名前で判定）
    // ON_OPP_POWER_DECREASED の発生源限定「あなたの（他の）＜X＞のシグニの効果によって」（discardCostSourceStory と同型）。
    // engine は temp_power_mods.srcCardNum（未記録なら中央 diff の causeSourceCardNum）の CardClass で判定する。
    // 🆕**発生源不明のときは発火しない＝fail-closed**（§6.4 O-44・2026-08-25）＝原文「効果によって」は
    // 原因の特定が意味の一部なので、trashSourceStory / banishedSourceStory / milledSourceStory と規約を揃えた。
    powerDecreaseSourceStory?: string;
    powerDecreaseExcludeSelf?: boolean; // 「あなたの**他の**＜X＞のシグニの効果によって」＝効果元自身は発生源から除く
    discardCostSourceStory?: string; // ON_DISCARDED_AS_COST の発生源限定「あなたの＜X＞のシグニの【出】【起】能力のコストとして捨てられたとき」（WX25-P3-071/077/084/085/088）。コストを支払った能力の host シグニの CardClass に X を含む場合のみ発火＝他クラスのコスト捨てでは誤発火しない（続き162・Opusタスク12(xxiv)）
    milledDeckOwner?: 'self' | 'opponent' | 'any';   // ON_CARD_MILLED_FROM_DECK の発生源デッキ（トリガー所有者から見た self/opponent/any）。省略=any
    // ON_SIGNI_CRASHED_LIFE_TOTAL のしきい値＝「1ターンに合計N枚以上」。
    // 判定は単発イベントではなく PlayerState.life_crashed_by_signi_this_turn の**累計**で行う
    // （1回のアタックで2枚クラッシュしても、1枚ずつ2回でも、合計が閾値に達した時点で1度だけ発火する）。
    crashedTotalThisTurn?: number;
    energyTrashedOwner?: 'self' | 'opponent' | 'any'; // ON_ENERGY_TO_TRASH の発生源エナゾーン（トリガー所有者から見た self/opponent/any）。省略=any。WD15-015=opponent。⚠「あなたの効果によって」の発生源限定は未表現（効果解決経路で発火＝相手効果による自エナトラッシュも発火しうる近似）
    // ON_ENERGY_TO_TRASH の行き先拡張＝「エナゾーンから効果によってカードN枚が**他の領域に移動**したとき」
    // （WXDi-P06-038-E1）。true のとき collector は「エナ→トラッシュ」ではなく「エナゾーンから出て行った枚数」
    // （行き先を問わない＝手札/場/デッキ/ライフ/除外も含む）で判定する。省略時は従来どおりトラッシュ限定。
    // 「効果によって」＝コスト支払いは中央 diff を通らないので構造的に除外される（コスト支払いは
    // executeSigniActivated 等が state を直接書き、collectBoardDiffTriggers を呼ばない）。
    energyLeftToAnyZone?: boolean;
    accedSelf?: boolean;        // ON_ACCE_ATTACH の変種弁別：true＝「このカードが【アクセ】として（…の）シグニに付いたとき」（アクセカード自身の反応）。省略＝「あなたのシグニ1体に【アクセ】が付いたとき」（ルリグ監視・WXK04-003）。engine は走査ループが役割で分かれるため無視（逆翻訳の主語切替専用）
    accedHostMinLevel?: number; // ON_ACCE_ATTACH（アクセカード自身）の「レベルN以上のシグニに付いたとき」host レベル条件（WXK05-041=4）。host シグニの Level がN未満なら発火しない
    accedHostMaxLevel?: number; // ON_ACCE_ATTACH（アクセカード自身）の「レベルN以下のシグニに付いたとき」host レベル条件（WX17-076-E2=2）。host シグニの Level がN超なら発火しない
    accedHostStory?: string;    // ON_ACCE_ATTACH（アクセカード自身）の「＜X＞のシグニに付いたとき」host クラス条件（WX17-033-E4=調理）。host シグニの CardClass に含まれなければ発火しない
    refreshedOwner?: 'self' | 'opponent' | 'any'; // ON_REFRESH の発生源プレイヤー（トリガー所有者から見た self/opponent/any）。省略=any。WXDi-P04-043=any（いずれかのプレイヤー）
    handOwner?: 'self' | 'opponent' | 'any'; // ON_HAND_ADDED の手札が増えた側（watcher 所有者から見て）。省略=self。any=いずれかのプレイヤー（WX20-067）。fromZones で移動元も限定可（['energy']＝「エナゾーンから」）
    // ON_TRASH_CARD_ADDED（§6.4 O-37(c)）のトラッシュが増えた側（watcher 所有者から見て）。省略=self。
    // 枚数しきい値は `minCount`、原因側は `byOpponentEffect`/`byOwnEffect` を共用する。
    trashOwner?: 'self' | 'opponent' | 'any';
    lifeMovedOwner?: 'self' | 'opponent' | 'any'; // ON_LIFE_CLOTH_MOVED の離脱元（watcher 所有者から見て）。省略=self
    lifeMovedTo?: Array<'trash' | 'hand' | 'energy' | 'deck' | 'other'>; // ON_LIFE_CLOTH_MOVED の宛先限定。省略=全領域
    lifeCountReached?: number; // ON_LIFE_CLOTH_MOVED の到達枚数。before!==value && after===value の遷移だけを発火
    /** ON_TARGETED: 対象を取った能力・効果の origin 限定。配列要素間は OR、要素内の各キーは AND。省略=無限定。 */
    targetedOrigins?: Array<{
      sourceType?: CardTypeFilter;
      effectType?: 'LIFE_BURST';
      abilityTiming?: EffectTiming;
    }>;
    excludeGrowPhase?: boolean; // 「グロウフェイズ以外で」＝ctx.turnPhase が GROW のときは発火しない（WX25-P2-063。ON_HAND_ADDED と併用）
    movedSelf?: boolean; // ON_HAND_ADDED の変種弁別：true＝「このシグニが（あなたのエナゾーンから）手札に移動したとき」＝移動したカード自身が手札から発火（WD12-009-E2/WD12-010-E1）。省略＝場の watcher（自身が手札に移動しても発火しない）
    leftToZone?: 'hand' | Array<'hand' | 'trash'>; // ON_LEAVE_FIELD の行き先限定（「場から手札に戻ったとき」WXK02-041）。離れたカードが所有者の当該領域に在中する場合のみ発火。省略=行き先不問。配列は OR（「手札に戻る**か**トラッシュに置かれたとき」WXDi-CP02-068-E1＝['hand','trash']）。素の 'hand' は既存6効果の互換表記＝['hand'] と同義
    leftStateFilter?: TargetFilter; // ON_LEAVE_FIELD の離脱シグニ状態限定（「対戦相手の凍結状態のシグニが場を離れたとき」WXEX1-30/WXDi-P03-040 等）。離脱**直前**の盤面状態（matchesStateFilter＝isFrozen/infected/hasCharm 等）で判定。banishedFilter の ON_LEAVE_FIELD 版。バトル離脱（除去前 state 未渡し）では判定材料が無いため保守的に非発火
    exceedCostPaidByPlayer?: boolean; // ON_EXCEED_COST の「あなたがエクシードのコストを支払ったとき」変種（場のシグニが反応。WXDi-P06-078）。省略時は既存の「このカードがエクシードのコストとして置かれたとき」（コストカード自身）。⚠ルリグ起動のエクシード支払い経路のみ検出（アーツ/スペルのカットイン exceed は未検出の近似）
    // ON_CARD_MILLED_FROM_DECK の発生源限定「あなたの＜X＞のシグニの効果１つによって」（powerDecreaseSourceStory と同型）。
    // engine は last_effect_mill_source の CardClass で判定し、発生源不明のときは非発火（原因限定を保守側へ倒す）。
    milledSourceStory?: string;
    milledMinCount?: number;                        // ON_CARD_MILLED_FROM_DECK の発火に必要な、その効果解決で対象デッキからトラッシュに置かれた最低枚数（省略=1）。「合計N枚」型はこの解決単位での近似（cf. TODO §3.5）
    movedToDeckOwner?: 'self' | 'opponent' | 'any';  // ON_CARD_MOVED_TO_DECK の宛先デッキ（トリガー所有者から見た self/opponent/any）。省略=any
    movedToDeckMinCount?: number;                     // ON_CARD_MOVED_TO_DECK の発火に必要な、その効果解決で対象デッキに加わった最低枚数（省略=1）。「N枚以上」型はこの解決単位での近似（cf. TODO §3.5）
    movedToDeckFromTrash?: boolean;                   // ON_CARD_MOVED_TO_DECK の発生源をトラッシュに限定（「あなたのトラッシュから…デッキに移動したとき」WX09-020/WX22-014）。省略=任意の発生源
    banishedFilter?: TargetFilter;                    // ON_SIGNI_BANISH_OPPONENT/_BATTLE の被バニッシュシグニ限定（「感染状態の/凍結状態の/【チャーム】が付いている…シグニをバニッシュしたとき」WX16-079/WXK02-054/WXEX2-76 等）。バニッシュ**直前**の盤面状態（matchesStateFilter＝infected/isFrozen/hasCharm）＋カードデータ（matchesFilter）で判定。triggerFilter は any_ally scope で**バニッシュした側**に使われるため別軸
    banishedNotFront?: boolean;                        // ON_SIGNI_BANISH_BATTLE/_OPPONENT の被バニッシュシグニ限定「正面**以外**の」（WX17-032「あなたのシグニがバトルによって正面以外のシグニをバニッシュしたとき」）。banishedFilter（カード属性/ゾーン状態）とは別軸＝アタッカーの正面ゾーン（対戦相手視点のミラーゾーン）と被バニッシュゾーンの一致判定。犠牲/リダイレクトで実際の被バニッシュ位置が変わった場合も対応
    banishedFrontOfSelf?: boolean;                     // ON_BANISH watcher の正面ゾーンにいたシグニだけに反応（WX15-055/056）
    banishedHadCharm?: boolean;                        // ON_BANISH watcher の被バニッシュシグニに【チャーム】が付いていた場合のみ（WXDi-P11-TK05）。除去直前の signi_charms で判定し、prevOwnerState 不明時は保守的に非発火
    banishedByOwnEffect?: boolean;                     // ON_BANISH watcher の「あなたの効果によって」＝watcher 所有者の効果起因のみ（バトル/ルール処理・原因不明では非発火）
    /**
     * ON_BANISH watcher の**否定形**「あなたの効果**以外**によってバニッシュされたとき」（§5.3 `O-62`・`WX15-003-E1`）。
     *
     * ⚠**`banishedByOwnEffect: false` では書けない**＝JSON では「未指定」と区別がつかず、
     *   `!eff.triggerCondition?.banishedByOwnEffect` が両方 true になって**限定が消える**。
     *   だから**明示値の別キー**にする（PLAN §5-2″）。
     * 判定＝**バトル・ルール処理・相手の効果では発火する**が、**watcher 所有者自身の効果**が原因なら発火しない。
     */
    banishedNotByOwnEffect?: boolean;
    /**
     * ON_BANISH watcher の「**アクセされている**あなたのシグニ１体が…」（`WX15-003-E1`）。
     * `banishedHadCharm` と同じ規約＝**除去直前の `signi_acce`** で判定し、`prevOwnerState` 不明時は保守的に非発火。
     * ⚠**`triggerFilter` では書けない**＝アクセは盤面の状態で、`matchesFilter(cardMap...)` は CardData しか見ない。
     */
    banishedHadAcce?: boolean;
    banishedSourceStory?: string;                      // ON_BANISH watcher の「あなたの＜X＞のシグニの効果によって」＝banishedByOwnEffect に加え、発生源がシグニかつ CardClass に X を含む場合のみ（trashSourceStory と同型）
    duringAttackPhase?: boolean;                      // 「アタックフェイズの間、…したとき」＝アタックフェイズ（ATTACK_*）中のイベントのみ発火（WXEX2-01/WX20-051＝ON_SIGNI_DOWN/UP・WX11-030＝ON_DRAW）
    duringMainPhase?: boolean;                        // 「メインフェイズの間」だけ発火（WX18-052）
    upIncludesLrig?: boolean;                         // ON_SIGNI_BECOMES_UP の「あなたのセンタールリグかシグニ1体がアップ状態になったとき」（WX20-051）＝センタールリグのアップ（lrig_down true→false）でも発火。省略＝シグニのみ
    byOwnEffect?: boolean;                            // ON_HAND_DISCARDED（「あなたが**自分の効果によって**カードをN枚以上捨てたとき」WXDi-D09-P16-E2）＝コスト支払いの手札捨て・対戦相手の効果で捨てさせられた場合では発火しない（collectHandDiscardTriggers の asCost と、discarder 側 state の hand_discarded_just_by_opp で判定）。ON_TRASH（自己discard反応「あなたの効果によって/あなたがこのカードを捨てたとき」WXDi-P08-075/P11-069）＝対戦相手の効果起因では発火しない。ON_LEAVE_FIELD any_opp（「あなたの効果によって対戦相手のシグニが…」WXK11-049/WXDi-CP01-027）＝watcher 自身の効果が原因のときのみ発火（バトル/ルール処理でも発火しない）
    byWatcherEffect?: boolean;                        // ON_HAND_DISCARDED any_opp（「あなたの効果によって対戦相手が手札を捨てたとき」）＝その【自】の watcher 所有者の効果が原因のときのみ。捨てた本人を基準にする byOwnEffect とは別軸
    placedOnTrapZone?: boolean;                       // 「対戦相手のシグニN体が【トラップ】のあるシグニゾーンに出たとき」（WX21-025）＝トリガー元シグニの持ち主の signi_traps が当該ゾーンに在る場合のみ発火（ON_PLAY any_opp と併用・タスク16[C]機構⑤）
    placedOnGateZone?: boolean;                       // 「対戦相手のシグニN体が【ゲート】があるシグニゾーンに出たとき」（WXK10-044）＝トリガー元シグニの持ち主の own_gate_zones に当該ゾーンが含まれる場合のみ発火（同上。⚠WXK迷宮のゲート設置が未配線の間は発火しない＝旧 ON_PLAY self 幻覚よりは正直な no-op）
    lrigAttackGuarded?: boolean;                      // 「このルリグのアタックが【ガード】されたとき」＝防御側の「あなたが【ガード】したとき」と同じ ON_GUARD 上で攻撃側ルリグだけを収集
    trashSourceStory?: string;                        // ON_TRASH 自己discard反応の発生源限定「あなたの＜X＞のシグニの効果によってこのカードが捨てられたとき」（WXDi-P14-086）＝原因効果の発生源カード（中央diff の causeSourceCardNum）の CardClass に X を含むときのみ発火
    revealSourceStory?: string;                       // ON_REVEALED_FROM_HAND 自己反応の発生源限定「あなたの＜X＞のシグニの効果によって手札から公開されたとき」＝公開原因カードの CardClass に X を含むときのみ発火
  };

  // CONTINUOUS 用：常時効果がいつ適用されるか
  activeCondition?: ActiveCondition;

  // 発動できる条件（条件を満たさないと使えない）
  condition?: Condition;

  // 対戦相手ターン中の代替エナコスト（このフィールドがある場合、相手ターンはこちらを使う）
  altCostOppTurn?: EnergyCost[];

  // 発動コスト
  cost?: EffectCost;
  // 原文にコスト句があるのに `parseCost` が1つも解釈できなかった＝**コストが未表現**の印（タスク12(xxix)(2)）。
  // 任意効果の発動プロンプト機構はこの印がある効果を扱わない（無料で撃たせないため）。parser 改善の在庫でもある。
  costUnparsed?: boolean;

  // レゾナの【出現条件】。実効果ではないカード単位メタデータ。
  appearanceCondition?: AppearanceCondition;

  // 効果アクション
  action: EffectAction;

  usageLimit?: UsageLimit;
  /** 一時付与AUTOを最初の該当イベント収集時にレジストリから消費する。 */
  consumeOnTrigger?: boolean;
  duration: EffectDuration;

  // false=任意発動（デフォルト）、true=強制発動
  mandatory?: boolean;

  variables?: Record<string, Variable>;

  // AUTO=自動生成、MANUAL=手動記述、PARTIAL=一部未解析、UNKNOWN=未解析
  parseStatus?: 'AUTO' | 'MANUAL' | 'PARTIAL' | 'UNKNOWN';
  // クロス状態のときのみ有効（【クロス常】【クロス出】【クロス起】【クロス自】）
  crossOnly?: boolean;
  // 絆アイコン有効時のみ発動（【絆常】【絆出】【絆自】【絆起】）: 表示フラグ兼ロジックフラグ
  kizunaIcon?: boolean;
  // コストキーワード「ホログラフ」を持つ効果（【出】ホログラフ《コイン》《コイン》等）。
  // 「ホログラフの効果によって〜する場合、代わりに」の置換（WX16-004-E1）が発動元の判定に使う＝
  // ベットの is_betting_this_effect と同じく「いま解決中の効果がそれか」を engine が読む。
  // 付与能力（GRANT_LRIG_ABILITY.abilities）にはホログラフ効果から生えた子として伝播させる。
  holograph?: boolean;
  // ターン1制限なし（デフォルトは1ターン1回）
  repeatable?: boolean;
  // v0.277: 手札から発動できる【起】（手札から自身を捨てることでフィールドなしで発動）
  handActivated?: boolean;
  // トラッシュから発動できる【起】（「このシグニをトラッシュから場に出す」等の自己蘇生。トラッシュゾーンUIから発動）
  trashActivated?: boolean;
  // GRANT_LRIG_ABILITY permanent:true で付与された能力（lrig_granted_auto_effects 内で「このゲームの間」持続＝ターン境界リセットで残す）
  permanentGrant?: boolean;
}
