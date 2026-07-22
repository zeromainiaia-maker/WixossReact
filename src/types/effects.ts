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
  | 'ON_COIN_PAID'              // あなたが《コイン》を1枚以上支払ったとき（WXDi-P15-055/069・WXDi-P16-057）。engine配線済（C1・2026-06-29）＝コイン支払の各サイト（グロウ人間/CPU・シグニ【起】・キープレイ・シグニ【出】・アーツ ベット/アンコール）で collectCoinPaidTriggers が発火。⚠スペルのベット（pending_spell/カットイン経由）は未配線＝実機未検証(C2)
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
  | 'ON_ENERGY_TO_TRASH'        // エナゾーンからカードがトラッシュに置かれたとき（energy→trash の set-diff で検出。WD15-015「あなたの効果によって対戦相手のエナゾーンから」。triggerCondition.energyTrashedOwner で発生源）
  | 'ON_REFRESH'                // いずれかのプレイヤーがリフレッシュしたとき（refresh_count_this_turn の set-diff で検出。WXDi-P04-043。triggerCondition.refreshedOwner で発生源。⚠効果解決経路のリフレッシュのみ検出＝ドローフェイズの過剰ドロー refresh は未検出の近似）
  | 'ON_OPP_POWER_DECREASED'    // あなたの効果によって対戦相手のシグニのパワーが減ったとき（毒牙。temp_power_mods の新規負 delta を効果解決の set-diff で検出。WX13-036/WXEX2-52。⚠「あなたの効果」限定は近似＝相手自身の自己弱体でも発火しうる／temp_power_mods のみ＝UNTIL_OPP_TURN_END 弱体は未計上）
  | 'ON_LEAVE_FIELD'            // カードがフィールドを離れたとき
  | 'ON_HAND_DISCARDED'         // 手札が捨てられたとき
  | 'ON_OPP_EFFECT_TRASH_FROM_HAND' // 相手の効果で手札がトラッシュに置かれたとき
  | 'ON_OPPONENT_SIGNI_TRASHED' // 相手シグニがトラッシュに置かれたとき
  | 'ON_OPPONENT_SIGNI_PLAY'    // 相手がシグニを場に出したとき
  | 'ON_LIFE_CRASHED'           // あなたのライフクロスがクラッシュされたとき
  | 'ON_OPP_LIFE_CRASHED'       // 対戦相手のライフクロスがクラッシュされたとき（クラッシュした側＝ターンプレイヤーのフィールドで反応）
  | 'ON_GUARD'                  // あなたが【ガード】したとき
  | 'ON_ATTACK_PHASE_START'     // あなたのアタックフェイズ開始時
  | 'ON_GROW_PHASE_START'       // あなたのグロウフェイズ開始時
  | 'ON_MAIN_PHASE_START'       // メインフェイズ開始時（GROW→MAIN 遷移で発火。triggerScope:any_opp＝「対戦相手のメインフェイズ開始時」WXDi-P00-034。collectTurnTriggers で収集）
  | 'ON_ACCE_ATTACH'            // シグニに【アクセ】が付いたとき（ルリグ監視/アクセカード自身）
  | 'ON_SPELL_USE'              // あなたがスペルを使用したとき
  | 'ON_DISCARDED_AS_COST'      // このカードがシグニ能力のコストとして手札から捨てられたとき
  | 'ON_EXCEED_COST'            // このカードがエクシードのコストとしてルリグトラッシュに置かれたとき
  | 'ON_PLACED_UNDER_SIGNI'     // このカードがシグニの下に置かれたとき（※配置機構が未実装のため現状発火しない）
  | 'ON_OPP_VIRUS_PLACED'       // 対戦相手の場に【ウィルス】が置かれたとき（WX19-079。opp_virus_placed_justフラグで発火）
  | 'ON_OPP_VIRUS_REMOVED'      // 対戦相手の場の【ウィルス】が取り除かれたとき（WD19-009。opp_virus_removed_justフラグで発火）
  | 'ON_OPP_VIRUS_CHANGED'      // 対戦相手の場に【ウィルス】が置かれるか取り除かれたとき（WX21-030。opp_virus_placed/removed_justフラグで発火）
  | 'ON_ENERGY_CHARGE'          // あなたのエナゾーンにカード1枚が置かれたとき（WX03-032-E1。エナ+1枚ちょうどで発火。2枚同時は不発）
  | 'ON_POWER_THRESHOLD'        // このシグニのパワーが閾値以上になったとき（WX03-032-E2。condition: SELF_POWER_GTE で閾値を保持）
  | 'ON_OPP_SIGNI_ATTACK_DIRECT' // 対戦相手のシグニが正面が空の状態でアタックしたとき（=守備側ルリグへの直接アタック時）に守備側で発火（WX04-004-E2）
  | 'ON_FRONT_SIGNI_ATTACK'    // このシグニの正面のシグニ（=このシグニにアタックしてくる相手シグニ）がアタックしたとき、守備側の正面シグニで発火（WX04-082-E1）。triggeringCardNum=アタッカー
  | 'ON_ZONE_MOVED'            // 場にあるこのシグニが効果によって他のシグニゾーンに移動したとき（WX14-050/052/053）。パワー＋N は MOVE_TO_OTHER_SIGNI_ZONE ハンドラが原文を読んで適用済みのため現状 engine 未配線
  | 'ON_CARD_MILLED_FROM_DECK' // あなたか対戦相手のデッキからカードが1枚以上トラッシュに置かれたとき（WX25-P2-009-E2）。collectMillTriggers で配線済み
  | 'ON_CARD_MOVED_TO_DECK'    // あなたか対戦相手のカードが効果によって1枚以上デッキに移動したとき（WX09-020/WX22-014/WXK10-076/WDK09-013）。collectMoveToDeckTriggers が解決前後の set-diff で検出（movedToDeckOwner/MinCount/FromTrash で限定）
  | 'ON_HAND_ADDED'            // 効果によってカードが手札に移動したとき（続き207・WX25-P2-063「対戦相手の効果によって…対戦相手の手札に」／WXDi-P11-007・WX14-029「あなたのエナゾーンから手札に」／WD12-009/010＝移動カード自身 triggerScope:self）。detectHandAdded の set-diff で検出（handOwner/fromZones/byOpponentEffect/excludeGrowPhase/triggerFilter で限定）
  | 'ON_ENERGY_TO_FIELD'       // あなたのエナゾーンからシグニが場に出たとき（続き207・WXDi-P11-007-E1「手札に加わるか場に出たとき」の場側枝＝ON_HAND_ADDED と併記して OR）。detectPlacedFromEnergy で検出
  | 'ON_LIFE_CLOTH_ADDED'      // あなたのライフクロスにカード1枚が加えられたとき（WD06-001/WD20-001）。detectLifeClothAdded の増加 set-diff のみで検出し、クラッシュ等の減少とは混線しない
  | 'ON_OPP_ENERGY_ADDED';     // 対戦相手のエナゾーンにカード1枚が置かれたとき（WDA-F03-13/WX24-P2-050）。detectEnergyAdded の増加 set-diff で置かれたカード自身を triggeringCardNum に保持

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

// 数値または変数参照
export type NumberOrRef = number | { $ref: string };

// ===== 発動条件 =====

export type ActiveCondition =
  | { type: 'OR'; conditions: ActiveCondition[] }
  | { type: 'TURN_OWNER'; owner: Owner }
  | { type: 'NO_COMMON_COLOR_AMONG_FIELD_SIGNI'; owner: 'self'; count: number }
  | { type: 'HAS_CARD_IN_FIELD'; owner: Owner; filter: TargetFilter; excludeSelf?: boolean; minCount?: number; distinctNames?: boolean; distinctColors?: boolean; distinctPhraseJa?: 'kinds' }
  | { type: 'HAS_KEY_IN_FIELD'; owner: Owner }
  | { type: 'COUNT_THRESHOLD'; location: CardLocation; owner: Owner; operator: CompareOp; value: number; color?: string } // color指定時はその色を含むカードのみ数える（WX05-005「トラッシュに黒のカードが10枚以上」）
  | { type: 'FIELD_SIGNI_POWER_COUNT'; owner: Owner; minPower: number; operator: CompareOp; value: number } // 場のシグニのうちパワーがminPower以上のものの数（「シグニ3体がそれぞれ15000以上」等）
  | { type: 'SELF_POWER_THRESHOLD'; operator: CompareOp; value: number }
  | { type: 'FRONT_SIGNI_POWER'; operator: CompareOp; value: number } // このシグニの正面（相手ゾーン 2-zi）のシグニの実効パワーが条件を満たすかぎり（正面が空なら不成立。SP27-002-E3）
  | { type: 'HAND_DIFF'; operator: CompareOp; value: number }  // 自分の手札と相手の手札の差
  | { type: 'ENA_DIFF'; operator: CompareOp; value: number }   // 自分のエナと相手のエナの差
  | { type: 'ENERGY_COLOR_TYPES'; owner: Owner; operator: CompareOp; value: number } // エナゾーンのカードが持つ色の種類数（WX05-006「エナゾーンのカードの色が3種類以上」）
  | { type: 'LRIG_LEVEL'; owner: Owner; operator: CompareOp; value: number } // センタールリグのレベル条件
  | { type: 'EICHI_LEVEL_SUM'; operator: CompareOp; value: number } // 英知=N 条件
  | { type: 'IS_SELF_ARMORED' }                                 // このシグニが血晶武装状態であるかぎり
  | { type: 'IS_SELF_ACCED' }                                   // このシグニにアクセが付いているかぎり
  | { type: 'IS_SELF_CHARMED' }                                 // このシグニに【チャーム】が付いているかぎり（WX04-096-E1）
  | { type: 'IS_SELF_ACCE_CARD' }                               // このカードがアクセとして装着されているかぎり（アクセカード側の条件）
  | { type: 'IS_DRIVE_STATE' }                                  // このシグニがドライブ状態（ルリグに乗られている）であるかぎり
  | { type: 'IS_SELF_AWAKENED' }                                // このシグニが覚醒状態であるかぎり
  | { type: 'IS_SELF_IN_CENTER_ZONE' }                          // このシグニが中央のシグニゾーンにあるかぎり
  | { type: 'TURN_HAND_DISCARD_GTE'; value: number }            // このターンにあなたが手札をN枚以上捨てている場合
  | { type: 'THIS_CARD_HAS_UNDER'; filter?: TargetFilter }      // このシグニの下にカードがあるかぎり（filter=「下にレベルNのシグニがあるかぎり」等の下カード条件。WX24-P1-043）
  | { type: 'SELF_HAS_KEYWORD'; keyword: string }              // このシグニが【keyword】を持っているかぎり（WX04-088-E1）
  | { type: 'HAS_BOND'; cardName?: string }                    // 絆アイコン：このカード名との絆を獲得している（cardName省略=このカード自身）
  | { type: 'SUBSCRIBER_COUNT'; operator: CompareOp; value: number }  // 登録者数条件（N万人以上等）
  | { type: 'VIRUS_COUNT'; owner: Owner; operator: CompareOp; value: number } // 場の【ウィルス】数条件（「対戦相手の場に【ウィルス】がない場合」等）
  | { type: 'LRIG_COLOR'; owner: Owner; color: string }         // センタールリグが指定色を持つ場合（「あなたのセンタールリグが青で」等）
  | { type: 'SAME_ZONE_HAS_GATE' }                              // このシグニと同じシグニゾーンにTHE DOOR【ゲート】があるかぎり（own_gate_zones）
  | { type: 'FIELD_HAS_GATE'; owner: Owner }                    // 指定プレイヤーの場にTHE DOOR【ゲート】があるかぎり（own_gate_zones が非空）
  | { type: 'ENERGY_HAS_CARD'; owner: Owner; filter: TargetFilter; minCount?: number } // エナゾーンにフィルタ一致カードがN枚以上あるかぎり（省略=1。「エナゾーンに＜植物＞のシグニがあるかぎり」。G038）
  | { type: 'TRASH_HAS_CARD'; owner: Owner; filter: TargetFilter; minCount?: number } // トラッシュにフィルタ一致カードがN枚以上あるかぎり（省略=1。「トラッシュに＜武勇＞のシグニが2枚以上あるかぎり」。G090）
  | { type: 'LRIG_TRASH_COUNT'; cardType?: CardTypeFilter; operator: CompareOp; value: number; excludeSource?: boolean } // ルリグトラッシュの（cardType一致）枚数（「ルリグトラッシュにアーツがあるかぎり」=アーツ,gte,1。G185）。Conditionと同形
  | { type: 'SIGNI_RETURNED_TO_HAND_THIS_TURN'; owner: Owner } // このターンにシグニが場から手札に戻っていた場合（turn_signi_returned_to_hand。G087）
  | { type: 'BEAT_CONDITION'; condText: string }               // 《ビートアイコン》[条件]：自分の【ビート】が条件を満たすかぎり（CONTINUOUS の常時能力ゲート。【常】《ビート》系）
  | { type: 'DURING_ATTACK_PHASE'; owner?: Owner }             // 「[あなたの/対戦相手の]アタックフェイズの間、」有効な常在効果（CONTINUOUS）。owner:'self'=あなたのアタックフェイズのみ／'opponent'=対戦相手のアタックフェイズのみ／省略=どちらのアタックフェイズでも。engine は calcFieldPowers に渡された turnPhase（ATTACK_ARTS/ATTACK_ARTS_OP/ATTACK_SIGNI/ATTACK_LRIG）で判定＝省略すると相手ターン中も過剰適用になっていた（WX25-CP1-082-E3/WX24-P1-050-E1 ほか9効果・タスク12）。turnPhase 未指定の呼び出し元では従来どおり true（過小実行を避ける）
  | { type: 'AND'; conditions: ActiveCondition[] };             // 複合条件（すべてを満たす）

export type Condition =
  | { type: 'OR'; conditions: Condition[] }
  | { type: 'TURN_OWNER'; owner: 'self' | 'opponent' }
  | { type: 'NO_COMMON_COLOR_AMONG_FIELD_SIGNI'; owner: 'self'; count: number }
  | { type: 'FIELD_COUNT'; owner: Owner; cardType?: CardTypeFilter; operator: CompareOp; value: NumberOrRef }
  | { type: 'DECK_COUNT'; owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'HAND_COUNT';  owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'HAND_COUNT_FILTER'; owner: Owner; filter: TargetFilter; operator: CompareOp; value: NumberOrRef; distinctName?: boolean } // フィルタ一致する手札枚数（distinctName=名前の異なる枚数）
  | { type: 'HAND_DIFF'; operator: CompareOp; value: number }  // 自分の手札−相手の手札の符号付き差（「手札が対戦相手より少ない場合」=lt,0／「より多い場合」=gt,0）。ActiveCondition 側にも同型あり＝両方揃えて更新すること
  | { type: 'LIFE_COUNT';  owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'LIFE_CRASHED_THIS_TURN'; owner: Owner; operator: CompareOp; value: NumberOrRef } // このターンに owner のライフクロスがクラッシュされた枚数
  | { type: 'ENERGY_COUNT'; owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'ENERGY_COUNT_FILTER'; owner: Owner; filter: TargetFilter; operator: CompareOp; value: NumberOrRef; distinctName?: boolean; distinctColor?: boolean } // フィルタ一致するエナゾーンのカード枚数（distinctColor=持つ色の種類数。「エナゾーンに＜美巧＞のシグニが５枚以上ある場合」。WX04-035-BURST）
  | { type: 'ENERGY_HAS_COLOR'; owner: Owner; colors: string[] } // エナゾーンに指定色すべてのカードがある場合（「エナゾーンに赤のカードと緑のカードがある場合」）
  | { type: 'CARDS_DRAWN_BY_EFFECT'; owner: Owner; operator: CompareOp; value: number } // このターンに効果で引いた累計枚数（cards_drawn_by_effect_this_turn）
  // このターンに**対戦相手の効果によって** owner の手札／エナゾーンからトラッシュへ移動した累計枚数
  // （hand_trashed_by_opp_this_turn / energy_trashed_by_opp_this_turn）。WXDi-P02-005 の「代わりに」ゲート。
  | { type: 'HAND_TRASHED_BY_OPP'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'ENERGY_TRASHED_BY_OPP'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'ARTS_USED_THIS_TURN'; owner: Owner; color?: string } // このターンに owner がアーツを使用していた場合（turn_arts_used）。color 指定時は当該色のアーツを使用していた場合（turn_arts_used_colors。WX24-D1-11〜D4-11）
  | { type: 'SPELL_USED_THIS_TURN'; owner: Owner; minCount?: number } // このターンに owner がスペルを使用した回数（actions_done の 'USE_SPELL' マーカー参照。省略=1）
  | { type: 'HAS_CARD_IN_FIELD'; owner: Owner; filter: TargetFilter; excludeSelf?: boolean; minCount?: number; distinctNames?: boolean; distinctColors?: boolean; distinctPhraseJa?: 'kinds' } // distinctColors=true は一致シグニが持つ色の種類数を minCount と比較
  | { type: 'HAS_KEY_IN_FIELD'; owner: Owner }                 // キーゾーン（key_piece / key_piece_extra）にキーが1枚以上ある
  | { type: 'ALL_FIELD_SIGNI_MATCH'; owner: Owner; filter: TargetFilter } // 「あなたの場にあるすべてのシグニが＜C＞/《X》の場合」＝場の全シグニ（頂点）が filter 一致。1体以上必須（空盤面は false＝空振り発火しない）。WX25-CP1-042 等
  | { type: 'TRASH_HAS_CARD'; owner: Owner; filter: TargetFilter; minCount?: number; distinctName?: boolean } // minCount: フィルタ一致カードがN枚以上。distinctName=true は異なるカード名の種類数
  | { type: 'TRASH_COUNT'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'DECK_TOP_MATCHES'; owner: Owner; filter: TargetFilter }
  | { type: 'LRIG_LEVEL'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'LRIG_STORY'; owner: Owner; story: string }
  | { type: 'THIS_CARD_IN_LOCATION'; location: CardLocation }
  | { type: 'THIS_CARD_IN_CENTER_ZONE' }
  | { type: 'THIS_CARD_IS_DOWN' }
  | { type: 'THIS_CARD_IS_UP' }                               // このシグニがアップ状態の場合（ダウンしていない。G247）
  | { type: 'CENTER_LRIG_IS_UP' }                             // あなたのセンタールリグがアップ状態の場合（WX25-P2-048）
  | { type: 'THIS_CARD_IS_ARMORED' }                          // このシグニが血晶武装状態の場合
  | { type: 'THIS_CARD_IS_AWAKENED' }                         // このシグニが覚醒状態の場合
  | { type: 'THIS_CARD_IS_ACCED' }                            // このシグニに【アクセ】が付いている場合
  | { type: 'IS_DRIVE_STATE' }                                // このシグニがドライブ状態の場合
  | { type: 'TURN_HAND_DISCARD_GTE'; value: number }          // このターンにあなたが手札をN枚以上捨てている場合
  | { type: 'THIS_CARD_HAS_UNDER'; filter?: TargetFilter; negate?: boolean } // このシグニの下にカードがある場合。negate=true は「無い場合」
  | { type: 'LRIG_LEVEL_EQ_OPP' }                             // 自分のセンタールリグのレベルが対戦相手のセンタールリグと同じ場合
  | { type: 'LRIG_LEVEL_CMP_OPP'; operator: 'lt' | 'lte' | 'gt' | 'gte' } // 自分のセンタールリグのレベルが対戦相手のセンタールリグ より低い/以下/より高い/以上 の場合（WXK07-025/WXK10-068。EQ の不等号版）
  | { type: 'LRIG_NAME_CONTAINS'; owner: Owner; name: string } // センタールリグのカード名が name を含む場合
  | { type: 'LRIG_COLOR'; owner: Owner; color: string }       // センタールリグが指定色を持つ場合（「あなたのセンタールリグが青で」等）
  | { type: 'LRIG_TRASH_COUNT'; cardType?: CardTypeFilter; operator: CompareOp; value: number; excludeSource?: boolean } // ルリグトラッシュの（cardType一致）カード枚数（「ルリグトラッシュにアーツが4枚以上」等）。excludeSource=trueで使用中カード自身(sourceCardNum)を除外＝リコレクト判定
  | { type: 'FIELD_CLASS_COUNT'; owner: Owner; story: string; operator: CompareOp; value: number } // 場のシグニのうちCardClassがstoryを含むものの数（「場に＜天使＞が3体」等）
  | { type: 'LRIG_TEAM_COUNT'; owner: Owner; team: string; operator: CompareOp; value: number } // 場のルリグ（センター＋アシストL/R）のうちTeamがteamを含むものの数（「＜うちゅうのはじまり＞のルリグが3体」。WXDi-D05-021。Teamはチーム名でCardClass/Storyとは別）
  | { type: 'SUBSCRIBER_COUNT'; operator: CompareOp; value: number } // 登録者数（万人）条件
  | { type: 'SELF_POWER_GTE'; value: number; operator?: CompareOp }
  | { type: 'THIS_CARD_FROM_TRASH' } // このシグニがトラッシュから場に出た場合（WX03-034-E1。signi_played_from_trashで判定）
  | { type: 'THIS_CARD_PLACED_BY_CLASS'; cardClass?: string } // class省略時は効果起因の配置全般
  | { type: 'THIS_CARD_FROM_DECK' } // このシグニがデッキから場に出た場合
  | { type: 'LAST_PROCESSED_SHARES_COLOR_WITH_LRIG'; owner: Owner } // 直前に処理したカード（lastProcessed）が指定プレイヤーのセンタールリグと共通する色を持つ場合（WX26-CP1-048）
  | { type: 'FIELD_SIGNI_POWER_COUNT'; owner: Owner; minPower: number; operator: CompareOp; value: number } // 場のシグニのうちパワーがminPower以上のものの数（「シグニ3体がそれぞれ15000以上」等）
  | { type: 'LIFE_COMPARE_OPP'; operator: CompareOp }
  | { type: 'DURING_PHASE'; phases: string[] }
  | { type: 'AND'; conditions: Condition[] }
  | { type: 'IS_MY_TURN' }
  | { type: 'IS_OPPONENT_TURN' }
  | { type: 'IS_BETTING'; minCoins?: number }                  // このアーツ/スペルでベットを宣言していた場合（is_betting_this_effect）。minCoins 指定時は支払ったコイン枚数（bet_coins_paid）がN以上の段階ベット判定（WX16-004）。「あなたがベットしていた場合、代わりに」の択一に使う
  | { type: 'PAID_ADDITIONAL_COST' }
  | { type: 'BEAT_CONDITION'; condText: string } // 《ビートアイコン》[条件]
  | { type: 'COND_STUB'; raw: string }
  | { type: 'LAST_PROCESSED_COUNT_GTE'; value: number; verbJa?: string; negate?: boolean; omitGteJa?: boolean } // この方法で直前に処理したカード枚数がN以上。negate=true は「N枚処理しなかった」＝N未満（否定3件）。verbJa/omitGteJa は decompiler 表示専用
  | { type: 'LAST_PROCESSED_LEVEL_SUM'; operator: CompareOp; value: number }   // lastProcessedCardsのシグニレベル合計とNの比較（operator省略時eqだった旧LAST_PROCESSED_LEVEL_SUM_EQを一般化・続き160）
  | { type: 'TRASHED_DISTINCT_LEVELS_GTE'; count: number }   // この方法でトラッシュ(lastProcessedCards)したシグニのうち相異なるレベルがcount種以上（WX03-015）
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
  | { type: 'LAST_PROCESSED_HAS_BURST'; negate?: boolean }   // lastProcessedCards[0] が【ライフバースト】を持つ場合。negate=true は持たない場合
  | { type: 'LAST_PROCESSED_HAS_TYPE'; cardType: string }   // lastProcessedCards のいずれかが指定Type（'スペル'等）の場合（G164「この方法でトラッシュしたカードの中にスペルがある場合」）
  | { type: 'LAST_PROCESSED_SHARE_COLOR' }                   // lastProcessedCards 全てに共通する色が1つ以上ある場合（「それらがそれぞれ共通する色を持つ場合」。WDK10-008）
  | { type: 'LAST_PROCESSED_MATCHES'; filter: TargetFilter; minCount?: number; operator?: CompareOp; value?: number; distinctName?: boolean; requiredCardNames?: string[]; shareClass?: boolean; levelLteCenterLrig?: Owner; verbJa?: string }  // lastProcessedCards の filter 一致数。旧 minCount は gte、operator/value で eq/lte 等、distinctName はカード名種類数、requiredCardNames は全指定名の包含、shareClass は全カードの共通クラス、levelLteCenterLrig は動的中央ルリグレベル比較。verbJa は decompiler 表示用
  | { type: 'LAST_PROCESSED_ALL_MATCH'; filter: TargetFilter };  // lastProcessedCards が **すべて** filter 一致（空集合は false）（「この方法でトラッシュに置かれたカードがすべて黒の場合」WXK09-097／「すべてのカードがレベル１のシグニの場合」WXDi-P05-042）

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
  energyTrash?: { count: number; filter?: TargetFilter }; // エナゾーンから指定カードN枚をトラッシュ（色支払いでなくカード指定。「エナゾーンから＜天使＞のシグニ３枚をトラッシュに置く」等）
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
  handToEnergy?: { count: number; filter?: TargetFilter };    // 手札からN枚をエナゾーンに置く
  handToUnderSelf?: { count: number; filter?: TargetFilter }; // 手札からN枚をこのシグニの下に置く
  lrigDown?: { count: number; centerOnly?: boolean; level?: number }; // アップ状態の自分ルリグN体をダウン（センター→アシストL→Rの順で自動支払い）。centerOnly=「センタールリグ」限定・level=「レベルNのルリグ」限定（WXDi-P02-016/P03-009/P04-042。指定時は該当レベルのゾーンだけが支払い候補）
  lifeTrash?: number;     // ライフクロス上からN枚をトラッシュに置く
  lifeToHand?: number;    // ライフクロス上からN枚を手札に加える
  deckTrash?: number;     // デッキ上からN枚をトラッシュに置く
  underSelfTrash?: number; // このシグニの下からカードN枚をトラッシュに置く（【起】コスト）
  charmTrash?: number;    // 自分の場のチャームN枚をトラッシュに置く（固定枚数）
  charmTrashVariable?: { min: number }; // チャームを好きな枚数（min枚以上）トラッシュ（プレイヤーが枚数を選択）
  trashArtsFromLrigDeck?: { color?: string; count: number }; // ルリグデッキからアーツN枚をトラッシュ（【出】コスト）
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
  handExileSelf?: boolean;     // 手札にあるこのカードをゲームから除外する
  selfToDeckBottom?: boolean;  // このシグニをデッキの一番下に置く（コスト）
  selfPowerDown?: number;      // このシグニのパワーをN減らす（コスト）
  fieldToLrigTrash?: { count: number; filter?: TargetFilter }; // 場のカードをルリグトラッシュに置く
  energyTrashColorAll?: string; // エナゾーンからすべての[色]のカードをトラッシュ
  energyTrashSelf?: boolean;   // エナゾーンからこのカード自身をトラッシュに置く
  acceTrash?: number;          // あなたの【アクセ】N枚をトラッシュに置く（コスト）
  chargeCounterRemove?: number; // この上からカウンター（貯菌等）Nつを取り除く（コスト）
  trapToHand?: number;         // あなたの【トラップ】N体を手札に加える（コスト）
}

// ===== ターゲットフィルタ =====

export interface TargetFilter {
  cardType?:  CardTypeFilter | CardTypeFilter[];
  cardName?:  string;      // 部分一致（cardName を含む）
  cardNames?: string[];    // いずれかの名前に一致（複数名指定用、完全一致）
  excludeCardName?: string; // このカード名を除外（完全一致）
  cardNum?:   string;
  color?:     string | string[];
  level?:     number | { min?: number; max?: number };
  levelRange?: { min?: number; max?: number };
  powerRange?: { min?: number; max?: number };
  costMax?:   number;  // 使用コストの合計（《色×N》の合計、コインを除く）がこの値以下（「コストの合計が1以下のスペル」WX04-071 等）
  costMin?:   number;  // 使用コストの合計がこの値以上（costMin と costMax を同値にすると「コストの合計がちょうどN」WX04-084 等）
  story?:     string | string[];  // ＜クラス＞フィルターの旧名（matchesFilter で cardClass と同一＝CSVの CardClass に includes でマッチ）。新規コードは cardClass を使う。
                                  // CSVの Story 列は '-' か 'Dissona' の2値しか取らないため、ここに 'Dissona' を入れても一致しない → ディソナ判定は isDisona を使う
  cardClass?: string | string[]; // ＜クラス＞フィルター（CSVのCardClassフィールドに対してincludesでマッチ）
  cardClassExclude?: string | string[]; // ＜クラス＞除外（「＜天使＞ではないシグニ」等。CardClassにincludesでマッチしたら除外）WX03-002
  hasGuard?:  boolean;
  noGuard?:   boolean; // 《ガードアイコン》を持たない（G237）。matchesFilter で Guard!=='1' を要求
  nonColorless?: boolean; // 無色ではない（色を1つ以上持つ）。matchesFilter で Color が空/無色のカードを除外（G240）
  isDisona?:  boolean; // 《ディソナアイコン》を持つカード（CSVの Story==='Dissona'）。matchesFilter で判定
  levelParity?: 'odd' | 'even'; // レベルが奇数/偶数のシグニ（WXK01-004「奇数」/WDK04-012「偶数」）。Level 非数値は不一致
  hasCrossIcon?: boolean; // 《クロスアイコン》を持つシグニ（EffectText が《クロスアイコン》で始まる）。matchesFilter で判定（WX07-002 等「クロスアイコンを持つシグニが場に出たとき」triggerFilter）
  hasRiseIcon?: boolean;  // 《ライズアイコン》を持つシグニ（EffectText に【ライズ】を含む）。matchesFilter で判定（WX16-026 等「ライズアイコンを持つシグニが場に出たとき」triggerFilter）
  noRiseIcon?: boolean;   // 《ライズアイコン》を持たないシグニ（hasRiseIcon の否定）。matchesFilter で判定（WX16-038-E2「ライズアイコンを持たない＜武勇＞のシグニ」）
  eachDistinctColor?: boolean; // 選択した複数枚がそれぞれ共通する色を持たない（G240）。逆翻訳の表示用＋選択補助（engine は per-card 判定しないため厳密enforce はTODO）
  eachDistinctLevel?: boolean; // 選択した複数枚がそれぞれレベルの異なる（G256「それぞれレベルの異なる＜X＞のシグニ2枚」）。逆翻訳の表示用＋選択補助（厳密enforce はTODO）
  isDown?:    boolean;
  isUp?:      boolean; // アップ状態（ダウンしていない）
  isDrive?:   boolean; // ドライブ状態のシグニ（ownerState.lrig_riding_signi に含まれる＝ルリグに乗られている乗機シグニ）。matchesStateFilter で判定（「あなたのドライブ状態のシグニ」WXEX1-37）
  isFrozen?:  boolean;
  isAwakened?: boolean; // 覚醒状態のシグニ（ownerState.awakened_signi にCardNumが含まれる）。「レベルNの覚醒状態のシグニがある場合」等。matchesStateFilter/execUtils HAS_CARD_IN_FIELD で判定（WXDi-P14-054/058/066）
  isPuppet?: boolean; // 傀儡状態のシグニ（field.puppet_signi にインスタンスIDが含まれる）
  crossState?: boolean; // クロス状態のシグニ（field.cross_state[zone]）。イノセンス等（G159）
  hasCharm?:  boolean;
  levelEqDiscardLevelSum?: boolean; // レベルがlast_activated_discard_level_sumと一致するか（WDK13-011用）
  levelEqualsVar?: 'charm_trash_count' | 'field_trash_level'; // レベルがlast_charm_trash_count/last_field_trash_levelと一致するか（WXK10-082 / WX03-001用）
  powerLteSelf?: boolean; // 効果元シグニの実効パワー以下（「自身のパワー以下の対戦相手のシグニ」。resolveDynamicFilterがpowerRange.maxへ解決）
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
  frontOfSelf?: boolean;  // 効果元シグニの正面のシグニ（execBanishが対象ゾーン 2-zi を解決）
  frontOfGateZone?: boolean; // THE DOOR【ゲート】がある自分のシグニゾーンの正面にある対戦相手のシグニ（own_gate_zones の各 zi に対し相手ゾーン 2-zi。execTransferToDeck が解決）
  inGateZone?: boolean;      // このシグニと同じシグニゾーンに THE DOOR【ゲート】がある（own_gate_zones にゾーンが含まれる。状態ベース＝fieldCandidates/matchesStateFilter で判定）
  centerZoneOnly?: boolean;  // 中央のシグニゾーン（zone index 1）にあるシグニのみ（状態ベース＝fieldCandidates/matchesStateFilter で判定）
  thisCardOnly?: boolean; // 効果元シグニ自身のみ（「このシグニをバニッシュする」等の自己対象。execBanishが解決）
  excludeSelf?: boolean;  // 効果元シグニ自身を対象から除外（「あなたの他の＜原子＞のシグニ」等。execTrash/execBanishが解決）
  isTriggerSource?: boolean; // トリガー元カード（ctx.triggeringCardNum）のみを対象。execBanishが解決
  colorMatchesLrig?: boolean;    // 自分のセンタールリグと共通する色を持つか（WX01-025等）
  colorNotMatchesLrig?: boolean; // センタールリグと共通する色を持たない。ENERGY_CARD対象では対象オーナー（＝相手エナなら相手）のルリグ基準で解決（WX21-035①等）
  colorMatchesLastProcessed?: boolean; // 直前に処理したカード（lastProcessedCards[0]＝この方法でダウンしたルリグ等）と共通する色を持つか。owner非依存＝相手エナを自ルリグ色で絞る用途（WX25-P2-112）。参照不能なら空ヒット＝did-it ゲートを兼ねる。resolveDynamicFilterが解決
  colorExclude?: string | string[]; // この色を含むカードを除外（resolveDynamicFilterが解決後にセット）
  hasAcce?:   boolean; // アクセが付いている
  acceHost?:  boolean; // 「これにアクセされているシグニ」＝このカードがアクセとして装着されているホストシグニ。CONTINUOUS POWER_MODIFY のホスト宛バフ（calcFieldPowers の signi_acce ループが適用）。主体が場のシグニのときは自己適用しない
  hasIcon?:   'クロス' | 'ライズ' | 'トラップ' | 'アクセ'; // 《Xアイコン》を持つカード（カードテキストのキーワード有無で判定する近似）
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
  powerLteLastProcessed?: boolean; // パワーが直前に処理したシグニ（lastProcessedCards[0]）の実効パワー以下 → powerRange.max に解決（「ダウンしたそのシグニのパワー以下」WD04-018）
  powerLtLastProcessed?: boolean;  // パワーが直前に処理したシグニ（lastProcessedCards[0]）の実効パワー未満 → powerRange.max:N-1 に解決（「その後、そのシグニよりパワーの低い」＝場に出たシグニ基準。参照不能なら空ヒット。WXDi-P08-031）
  levelLteLastProcessed?: boolean; // レベルが直前に処理したシグニ（lastProcessedCards[0]）のレベル以下 → level.max に解決（「この方法で場に出たシグニのレベル以下」WX25-P1-039 等）
  levelLtLastProcessed?: boolean;  // レベルが直前に処理したシグニ（lastProcessedCards[0]）のレベル未満 → level.max:N-1 に解決（「その後、そのシグニより低いレベルを持つ」＝公開シグニ基準。参照不能なら空ヒット。WXK10-031）
  levelGtLastProcessed?: boolean;  // レベルが直前に処理したシグニ（lastProcessedCards[0]）のレベルより高い → level.min:N+1 に解決（「その後、…それよりレベルの高い」＝直前配置シグニ基準。参照不能なら空ヒット。WXEX2-28）
  levelEqLastProcessed?: boolean;  // レベルが直前に処理したシグニと同じ → level.min/max に解決（「この方法で【ビート】にしたシグニと同じレベル」WDK14-008）
  levelLteDiscardSigni?: boolean; // レベルが handDiscardSigni コストで捨てたシグニ（caster.last_discarded_signi_level）のレベル以下 → level.max に解決（「この方法で捨てたシグニのレベル以下」WX22-046/WXK10-044 等）
  levelLtDiscardSigni?: boolean;  // 捨てたシグニより低いレベル → level.max = 捨てレベル-1（「この方法で捨てたシグニより低いレベルを持つ」WXEX2-37）
  levelEqDiscardSigniOffset?: number; // 捨てたシグニのレベル+offset に一致 → level = 捨てレベル+offset（「レベルがNつ高い」WDK13-013=+1/WXK10-033=+2）
  classMatchesDiscardSigni?: boolean; // 捨てたシグニ（caster.last_discarded_signi_class）と共通するクラスを持つ → story に捨てクラストークンをOR展開（WXK10-033「それと共通するクラスを持つ」）
  // B2 動的閾値: パワーが「この方法で公開したシグニのレベルの合計×N」以下 → powerRange.max に解決（数値=乗数N。WX17-028「×1000」）。
  // 直前の REVEAL_DECK_TOP が ownerState.last_revealed_signi_level_sum に記録した合計を読む。
  powerLteRevealedSigniLevelSum?: number;
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
    | 'ENERGY_CARD'
    | 'LIFE_CLOTH_CARD'
    | 'PLAYER';
  owner: Owner;
  count: number | 'ALL' | { $ref: string }; // $ref='last_processed_count': 直前ステップでトラッシュ/処理した枚数（動的）
  filter?: TargetFilter;
  upToCount?: boolean;   // count > 1 のとき「以上」を許容するか
  blind?: boolean;       // true = 対戦相手の手札を見ないで選ぶ（ランダム選択）
  actingPlayerSelects?: boolean; // true = 手札を見て自分が選ぶ（「手札を見てN枚選び捨てさせる」）
  totalPowerMax?: number; // 「パワーの合計がN以下になるように好きな数」: 選択カードの実効パワー合計の上限（count='ALL'と併用）
  totalLevelMax?: number; // 「レベルの合計がN以下になるようにM体まで」: 選択カードのレベル合計の上限（count=M・upToCount と併用。WDK13-007）
  fromTop?: boolean;     // DECK_CARD: デッキ上から count 枚を対象（「一番上を見る。それが〜の場合、場に出す」＝WX10-007/WX16-038）。execAddToField は deck.slice(0,count) で先頭前提
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
  | ChooseAction
  | ConditionalAction
  | LookAndReorderAction
  | TransferToDeckAction
  | CounterSpellAction
  | CostReductionAction
  | GrantProtectionAction
  | AttachCharmAction
  | RevealAndPickAction
  | LookPickChainAction
  | BanishRedirectAction
  | RearrangeSigniAction
  | SetBaseLevelAction
  | GrowFreeAction
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
  | EqualizeEnergyAction
  | VariableDiscardAndDrawAction
  | BanishSubstituteAction
  | StackSpellAction
  | ColorInheritAction
  | ConditionalDiscardAction
  | EnergyChargeByFieldCountAction
  | LookAtDeckAndLifeAction
  | GrowCostReductionAction
  | NameBanAction
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
  | PlaceVirusAction
  | AttachAcceAction
  | BloodCrystalArmorAction
  | PowerModifyPerVirusCountAction
  | LrigLimitModifyAction
  | AddCraftToLrigDeckAction
  | RecollectGateAction
  | AltCostOppTurnAction
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
}

export interface BanishAction {
  type: 'BANISH';
  target: EffectTarget;
  optional?: boolean;    // true = 「してもよい」（プレイヤーがスキップ可能）
  conditional?: boolean; // true = 前ステップ（STUB等）が成功した場合のみ実行
  selfTrashCost?: boolean; // 「このシグニを場からトラッシュに置いてもよい。そうした場合〜バニッシュ」：対象を1体以上選んだ場合、効果元シグニ自身をコストとしてトラッシュ（WX21-052）
  opponentSelects?: boolean; // 「対戦相手は自分のシグニ1体を対象とし、それをバニッシュする」：対戦相手が自分のシグニを選んでバニッシュ（target.owner='opponent'）
}

// フィールドのシグニをエナゾーンに置く（エナ送り）。
// バニッシュとは別アクション＝「バニッシュされたとき」を誘発しない。最終的な行き先はエナだが
// バニッシュイベントではない（BANISHで代用しないこと）。Bounceの送り先がエナ版に相当。
export interface SendToEnergyAction {
  type: 'SEND_TO_ENERGY';
  target: EffectTarget;
  optional?: boolean; // true = 「してもよい」
}

export interface PowerModifyAction {
  type: 'POWER_MODIFY';
  target: EffectTarget;
  delta: NumberOrRef; // 正=強化、負=弱体化
  excludeSelf?: boolean; // 「あなたの他のシグニ」: 効果元カード自身を対象から除外
  targetsTriggerSource?: boolean; // 「それ」= トリガー元シグニを自動対象（ctx.triggeringCardNum → ctx.sourceCardNum の順で解決）
  targetsLastProcessed?: boolean; // 「それ」= 直前ステップで選択/処理したシグニ(lastProcessedCards)へ適用（WXDi-P07-079「それが＜毒牙＞なら代わりに＋10000」。選択UIを出さず同一対象に適用）
  deltaFromOppPowerDecrease?: boolean; // 「減った値と同じだけ＋する」（毒牙 WX13-036/WXEX2-52）。delta を収集時に直前の対戦相手パワー減少量で動的に上書き（ON_OPP_POWER_DECREASED と併用）
  duration?: EffectDuration; // 'UNTIL_OPP_TURN_END' のとき power_mods_until_opp_turn へ（省略時はターン終了まで＝temp_power_mods）
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
}

export interface TrashAction {
  type: 'TRASH'; // 指定カードをトラッシュへ
  target: EffectTarget;
  asCost?: boolean; // true = 効果処理ではなくコスト支払いによる field→trash（ON_TRASH byEffect を発火させない原因追跡用）
  opponentSelects?: boolean; // 「対戦相手は自分の〜1枚を対象とし、それをトラッシュに置く」：対戦相手が自分のカードを選んでトラッシュ（target.owner='opponent'。WX04-009）
  bestEffort?: boolean; // true = 対象がなくても後続SEQUENCEをスキップしない（「手札を1枚捨て、カードをN枚引く（捨てられなくても引く）」の捨て。WDK06-R20/WDK14-022）
  optional?: boolean; // true =「捨ててもよい」（スキップ可。スキップ時は後続の CONDITIONAL(IS_MY_TURN)=「そうした場合」を実行しない。WXDi-D08-013/P14-084）
}

export interface EnergyChargeAction {
  type: 'ENERGY_CHARGE';
  target: EffectTarget; // エナゾーンに置くカード（手札やトラッシュから指定して選ぶ場合）
}

// 【エナチャージN】：デッキ上からN枚をエナゾーンに置く（選ばない）
export interface EnergyChargeFromDeckAction {
  type: 'ENERGY_CHARGE_FROM_DECK';
  owner: Owner;
  count: NumberOrRef;
}

export interface LifeCrashAction {
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
}

// トラッシュ・エナ・ライフクロスなど任意の場所から手札へ移動
export interface TransferToHandAction {
  type: 'TRANSFER_TO_HAND';
  source: EffectTarget; // どこから何を（TRASH_CARD, ENERGY_CARD など）
}

// デッキ上または手札からライフクロスに加える
export interface AddToLifeAction {
  type: 'ADD_TO_LIFE';
  owner: Owner;
  count: NumberOrRef;
  fromTop: boolean; // true=デッキ上から
  fromHand?: boolean; // true=手札から1枚選ぶ
}

export interface AddToFieldAction {
  type: 'ADD_TO_FIELD'; // 直前に選んだカードをフィールドへ（コスト不要で出す）
  owner: Owner;
  source?: EffectTarget; // トラッシュ・エナ・手札など出処が明示される場合
  asDown?: boolean;      // true = ダウン状態で場に出す
  cardName?: string;     // ゲーム外からトークンを生成して場に出す場合のCardNum
  optional?: boolean;    // true =「場に出してもよい」（出す/出さないを選択可能にする）
  // suppressOnPlay: true =「その（それらの）シグニの【出】能力は発動しない」＝この配置で場に出したシグニ自身の
  // ON_PLAY を発火させない（他シグニの watcher 反応は従来どおり発火）。旧・全体 BLOCK_ACTION{ON_PLAY_ABILITY}
  // （engine 未参照の死アクション）を parser の foldSuppressOnPlay が配置アクションへ畳み込んだ忠実表現。
  // ⚠ ADD_TO_FIELD 経路自体は現状シグニ自身の ON_PLAY を発火させない（§6.3・REVEAL_UNTIL_TO_FIELD のみ発火）ため
  // 当フラグは前方安全用フック。将来 ADD_TO_FIELD 自身 ON_PLAY を配線する際にこのフラグでゲートする。
  suppressOnPlay?: boolean;
}

export interface FreezeAction {
  type: 'FREEZE'; // 凍結付与
  target: EffectTarget;
  down?: boolean; // true=「ダウンし凍結」：同一対象をダウンも行う。省略時は凍結のみ（現在のアップ/ダウン状態は変えない）
}

export interface DownAction {
  type: 'DOWN'; // ダウン
  target: EffectTarget;
  optional?: boolean; // true =「ダウンしてもよい」（スキップ可能。スキップ時は後続の CONDITIONAL(IS_MY_TURN)=「そうした場合」を実行しない。WD12-013/015）
}

export interface UpAction {
  type: 'UP'; // アップ
  target: EffectTarget;
  targetsTriggerSource?: boolean; // 「それ」= トリガー元シグニ（ダウン状態で場に出たシグニ等）をアップ（ctx.triggeringCardNum → ctx.sourceCardNum）
  targetsBattleAttacker?: boolean; // 「そのアタックしているシグニ」= バトルを行ったアタッカー自身をアップ（ctx.battleAttackerCardNum。ON_SIGNI_BANISH_OPPONENT any_ally 等・能力ホストと攻撃者が別カードになりうるため thisCardOnly/targetsTriggerSource とは別軸。WX17-032）
}

export interface BlockActionAction {
  type: 'BLOCK_ACTION'; // アクションを封じる
  target: EffectTarget; // 封じる対象プレイヤー
  actionId: string;     // 封じるアクションID（例: 'ATTACK_SIGNI'）
  until: 'END_OF_TURN' | 'NEXT_TURN' | 'PERMANENT' | 'END_OF_GAME';
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
  upToTarget?: boolean;  // true: maxCount まで「任意の数」（0枚可）。省略時も SEARCH UI は maxPick まで任意選択
  // 見つかったカードに対して行う処理（REVEAL→ADD_TO_HAND など）
  then: EffectAction;
  // サーチ完了後に行う処理（SHUFFLE_DECK など）
  afterSearch?: EffectAction;
}

export interface SequenceAction {
  type: 'SEQUENCE';
  steps: EffectAction[];
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
  opponentResponds?: boolean; // true = 対戦相手が選択する（「対戦相手はカードを1枚引くか【エナチャージ1】してもよい」等）
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
  count: NumberOrRef;
  private: boolean;   // true = 自分だけ確認（相手に見せない）
  reorder: boolean;   // true = 順番を自由に決められる
  canTrash?: boolean; // true = 一部をトラッシュに置ける（残りをデッキに戻す）
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
  targetsLastProcessed?: boolean; // 「それ」= 直前ステップで選択/処理したシグニ(lastProcessedCards)へ付与（WX03-046「打突」等。選択UIを出さず同一対象に付与）
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
  duration: 'THIS_TURN';
  trigger: {
    timing: string;               // 発火タイミング（例: 'ON_OPP_LIFE_CRASHED' / 'ON_REFRESH'）
    crasherFilter?: TargetFilter; // 発火源シグニの条件（例: 青の＜ブルアカ＞）。⚠engine は「場に該当シグニがいるか」で近似判定（実際のクラッシュ源シグニは未追跡）
    refreshedOwner?: 'self' | 'opponent' | 'any'; // ON_REFRESH の発生源プレイヤー（設置者から見て）。省略=any。WX11-024=opponent
  };
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

// デッキ上から指定クラスのシグニがめくれるまで公開し、そのシグニを手札に加え、公開した他のカードを処理する（WX04-050）。
export interface RevealUntilToHandAction {
  type: 'REVEAL_UNTIL_TO_HAND';
  owner: Owner;            // 公開するデッキの持ち主（通常 self）
  revealClass?: string;    // めくり続ける対象シグニの＜クラス＞（省略=任意のシグニ）
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
  position?: 'top' | 'bottom';        // デッキの挿入位置（省略時は top）
  optional?: boolean;                 // 「…してもよい」＝TRASH_CARD 経路で選択/スキップ可（WX17-028-E1・続き137）
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

// 効果耐性付与（「対戦相手の〜の効果を受けない」）
export interface GrantProtectionAction {
  type: 'GRANT_PROTECTION';
  target?: EffectTarget;          // 一時付与（AUTO/ACTIVATED）: 特定ターゲットに付与
  subjectFilter?: TargetFilter;   // CONTINUOUS用: このフィルターの全シグニを保護
  subjectOwner?: Owner;           // subjectFilter の所有者（省略時: 'self'）
  from?: string[];    // 保護元：'ルリグ' | 'シグニ' | 'スペル' | 'アーツ' | 'DOWN' | 'BOUNCE' | 'BANISH' | 'any'
  // 軸（BANISH等）を発生源カード種別で限定する（「対戦相手の【シグニ】の効果によってバニッシュされない」。
  // from に 'BANISH' 等の軸トークンを置き、bySourceType でソース種別を絞る。バトル・ルール処理には適用されない）。
  bySourceType?: 'シグニ' | 'ルリグ' | 'スペル' | 'アーツ';
  sourceCostMin?: number; // 保護元カード（アーツ/スペル）の使用コスト合計がN以上の効果のみ保護する（「対戦相手のコストの合計が５以上の、アーツとスペルの効果を受けない」WX15-031）。collectEffectImmuneSigni が解決中ソースカードの Cost 合計で判定
  sourceFilter?: TargetFilter; // 保護元カードの属性で耐性を絞る（sourceCostMin の一般化）。collectEffectImmuneSigni が解決中ソースカードの CardData を matchesFilter で判定し、非マッチなら保護しない（WXEX2-36「ライズアイコンを持たない対戦相手のシグニの効果を受けない」／WXK11-021「ライフバーストではない…」）
  sourceOwner?: Owner; // 誰の効果から保護するか
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
}

// デッキの上からN枚公開し、条件を満たすカードをpickする
// デッキ上N枚を見て、複数段の選択を順に行い、残りを所定の場所へ（G252「シグニ1枚＋共通クラス無色でないシグニ1枚を手札」／
// G255「カード1枚までトラッシュ＋＜X＞シグニ2枚まで手札」など、1度の公開からの多段ピック）。
export interface LookPickChainStage {
  filter?: TargetFilter;          // ピック対象フィルタ（省略=任意カード）
  pickCount: number;              // 上限枚数（「N枚まで」）
  then: 'hand' | 'energy' | 'trash' | 'field' | 'beat'; // ピック先（手札／エナ／トラッシュ／場出し／【ビート】化）
  sharesClassWithPrev?: boolean;  // 直前ステージで選んだカードと共通するクラスを持つもののみ（G252）
  pickNoun?: string;              // 逆翻訳の名詞（既定「シグニ」。任意カードは「カード」）
  suppressOnPlay?: boolean;       // then:'field' 限定。「その（それらの）シグニの【出】能力は発動しない」（AddToFieldAction 参照）
}
export interface LookPickChainAction {
  type: 'LOOK_PICK_CHAIN';
  owner: Owner;
  revealCount: NumberOrRef;
  stages: LookPickChainStage[];
  remainder: { location: CardLocation; position: 'top' | 'bottom' | 'any' };
  _revealed?: string[]; // 内部用: 段間 continuation で公開済みカードを引き継ぐ（JSONには書かない）
}

export interface RevealAndPickAction {
  type: 'REVEAL_AND_PICK';
  owner: Owner;
  revealCount: NumberOrRef;
  filter?: TargetFilter;
  pickCount: number | 'ALL';
  pickUpTo?: boolean; // pickCount を「N枚まで」（上限）として扱う（G236）。逆翻訳に「まで」を付与
  pickNoun?: string;  // ピック対象の名詞（既定「シグニ」）。色一致で任意カードを拾う等は「カード」（G236）
  then: EffectAction;
  elseAction?: EffectAction; // 公開カードが filter に一致しない場合に実行（「そうでない場合」）
  handOrField?: boolean; // ピックしたシグニを1枚ずつ「手札に加える or 場に出す」の対話選択で処理（「公開し手札に加えるか場に出し」WX24-P1-056 等）。true のとき then は無視
  remainder?: { location: CardLocation; position: 'top' | 'bottom' | 'any'; shuffle?: boolean };
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

// シグニの能力を消去する
export interface RemoveAbilitiesAction {
  type: 'REMOVE_ABILITIES';
  target: EffectTarget;
  until: EffectDuration;
  targetsTriggerSource?: boolean; // 「そのシグニ」= トリガー元シグニ（場に出た相手シグニ等）へ無選択で適用（ctx.triggeringCardNum → ctx.sourceCardNum）
}

// ルリグのレベルに比例したパワー修正（ACTIVATED効果）
export interface PowerModifyPerLrigLevelAction {
  type: 'POWER_MODIFY_PER_LRIG_LEVEL';
  target: EffectTarget;
  deltaPerLevel: number;
  lrigOwner: Owner; // どちらのルリグのレベルを参照するか
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
// until: 'UNTIL_END_OF_TURN'＝この（発動）ターンの終わりまで／'NEXT_TURN'＝次のターンの間
export interface PreventDamageAction {
  type: 'PREVENT_DAMAGE';
  owner: Owner;
  until: EffectDuration;
  scope?: 'ALL' | 'LRIG';
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

// 条件付き強制ディスカード（N枚捨てないかぎりM枚捨てる）
export interface ConditionalDiscardAction {
  type: 'CONDITIONAL_DISCARD';
  owner: Owner;
  avoidCount: number;
  avoidFilter?: TargetFilter;
  elseCount: number;
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

// このゲームの間、対戦相手は同名カードを使用できない
export interface NameBanAction {
  type: 'NAME_BAN';
  targetSelf: boolean;
  duration: 'GAME';
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
  rawText: string;          // 元のテキスト（表示用）
  permanent?: boolean;      // 「このゲームの間」付与（グロウしても維持・ターン境界で消えない。WXDi-P06-004等）。省略=ターン終了時まで
  targetedCenter?: boolean; // 「あなたのセンタールリグ１体を対象とし、ターン終了時まで、それは以下の能力を得る」表記変種（WX25-P1-001系）。engine挙動は既定と同一（自分のセンタールリグへ付与）＝decompiler表示用
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

// パーサーが解釈できなかった効果（手動対応が必要）
export interface StubAction {
  type: 'STUB';
  id: string;
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
    then: 'hand' | 'energy';
    // 1段目（手札）の後に、残りから特定クラスを1枚までエナゾーンへ送る2段階ピック（FUTURE SESSION ②）
    secondPick?: { classContains: string; toMax: number; restDest: 'deck_bottom' | 'trash' };
  };
  seedCards?: string[]; // INTERNAL_SEEDS_PLACE_LOOP / INTERNAL_SET_SEED: 【シード】として順次設置するカード（複数枚設置をインタラクション跨ぎで保持。WXK04-010 アンコール・シード）
  revealed?: string[]; // REVEAL_SECOND_PICK_ENERGY: 1段目で公開したカード一覧（残り算出用）
  secondPick?: { classContains: string; toMax: number; restDest: 'deck_bottom' | 'trash' }; // 同上
  value?: number | string; // 汎用値（SET_DECLARED_NUMBER等で使用）
  count?: number;          // GAIN_SIGNI_BARRIER / GAIN_LRIG_BARRIER 等の個数
  // STEAL_OPP_TRASH_PUPPET の汎用化パラメータ（WXK10-055 等）。省略時は従来挙動（ベット時2枚/非ベット1枚・必須・レベル制限なし）。
  puppetParams?: {
    count?: number;          // 出す枚数（省略時=ベット2/非ベット1）
    optional?: boolean;      // 「場に出してもよい」＝スキップ可
    levelLteTrigger?: boolean; // 候補をトリガー元シグニ（triggeringCardNum）のレベル以下に限定（「そのシグニのレベル以下」WXK10-055-E2）
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
    victimFilter?: 'riseIcon' | 'otherAny';   // protect_other_sacrifice_self: 守る対象（'riseIcon'=《ライズアイコン》持ち / 'otherAny'=このシグニ以外の任意の自シグニ）
    oppTurnOnly?: boolean;                     // 対戦相手のターンの間のみ有効（CP01-032/P10-052）
  };
}

// 生徒との絆を獲得する（ブルアカ絆メカニクス）
export interface MILLAction {
  type: 'MILL';
  owner: Owner;
  count: number;
  useDeclaredCount?: boolean;
  countIsLastProcessedLevelSum?: boolean; // count を「直前に処理したシグニ(lastProcessedCards)のレベル合計」にする（「この方法で場に出たシグニのレベル１につき…1枚トラッシュ」WX24-P3-039）
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
}

// 「このターン、次にあなたがダメージを受ける場合、代わりにあなたのデッキの上からカードをN枚トラッシュに置く」
// （WXDi-P15-041/WX24-P1-010 等・黒ハナレ系）。PlayerState.damage_replace_mill のキューに積み、
// crashOneLife／ルリグアタック応答が消費する。デッキがN枚未満なら置き換え不可（原文注記）＝ダメージ通過。
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
    turnOwner?: 'self' | 'opponent'; // 《自分ターン》/《相手ターン》: そのターン中のみ AUTO 発火（self=効果オーナーのターン / opponent=相手のターン）。effectStack の initStack/pushToStack で現ターンと照合しゲート（WXDi-P06-033 等）
    byOpponentEffect?: boolean; // 対戦相手の効果が原因の場合のみ発火（バトル・自分の効果・ルール処理では発火しない）
    fromAnyZone?: boolean;      // 場以外（手札・エナ・デッキ）からトラッシュに置かれた場合も発火（ON_TRASH triggerScope:self用）
    fromZones?: Array<'hand' | 'deck' | 'energy' | 'field'>; // ON_TRASH の発生源を限定（「手札かデッキから」=['hand','deck']。指定領域からのみ発火。WX04-102）
    forResonaCondition?: boolean; // レゾナの出現条件のためにトラッシュに置かれた場合のみ発火（WX10-055等）。通常のトラッシュ（バトル・効果・ルール処理）では発火しない
    byEffect?: boolean; // 効果によるイベントのみ発火。ON_PLAY＝通常召喚を除外、ON_SIGNI_DOWN＝アタック/コストを除外、ON_TRASH＝コスト/バトル/ルール処理を除外（任意の効果起因＝自他問わず。WX18-086等）
    bySigniEffect?: boolean; // シグニの効果によって場に出た場合のみ発火（G079等「シグニの効果によって場に出たとき」）。通常召喚・スペル/アーツ/ルリグの効果では発火しない
    placedDown?: boolean; // ダウン状態で場に出た場合のみ発火（G144「あなたのシグニがダウン状態で場に出たとき」。ON_PLAY と併用）
    placedFromTrash?: boolean; // トラッシュから場に出た場合のみ発火（「シグニがトラッシュから場に出たとき」。ON_PLAY と併用。配置元がトラッシュかを場出し前後の set-diff で判定）
    placedPuppet?: boolean; // 傀儡状態で場に出た場合のみ発火（WDK17-001「あなたの傀儡状態のシグニ１体が場に出たとき」。ON_PLAY any_ally と併用。トリガー元が field.puppet_signi に在中するかで判定）
    materialUsedByPlayer?: boolean; // 「あなたが《改造素材》を使用したとき」（プレイヤー起点）＝「このシグニに使用されたとき」と区別（ON_MATERIAL_USED と併用。WXK09-047-E2/WXK09-049-E1）
    frontLowerLevelThanSource?: boolean; // このシグニ（効果元）の正面に、効果元よりレベルの低いシグニが出た場合のみ発火（WX17-075 タルタル付与。ON_PLAY any_opp と併用）
    placedFront?: boolean; // このシグニ（効果元）の正面ゾーンにトリガー元シグニが配置された場合のみ発火（WXDi-P03-043「対戦相手のシグニ１体がこのシグニの正面に配置されたとき」。ON_PLAY any_opp と併用。frontLowerLevelThanSource のレベル条件なし版）
    fromFieldByCostOrEffect?: boolean; // このシグニがコストか効果によって「場から」トラッシュに置かれた場合のみ発火（バトル・ルール処理では発火しない。G204。ON_TRASH と併用）
    fromFieldByCostOrOwnEffect?: boolean; // 自分のシグニがコストか「あなたの効果」によって場からトラッシュに置かれた場合のみ発火（相手効果・バトル・ルール処理を除外。WXDi-P02-037-E2）
    drawBySourceStory?: string; // このドローの原因が、あなたの場にある指定＜story＞のシグニの効果である場合のみ発火（WX20-026-E3「あなたの場にある＜凶蟲＞のシグニの効果でカードを引いたとき」。ON_DRAW と併用。ドローフェイズの通常ドローやその他カードの効果ドローでは発火しない）
    outsideDrawPhase?: boolean; // ドローフェイズの通常ドロー（マンダトリードロー）では発火せず、それ以外（効果等）で引いたときのみ発火（WXDi-D09-P19/WXDi-P05-062「ドローフェイズ以外であなたがカードを１枚引いたとき」。ON_DRAW と併用）
    drawPhaseRestriction?: 'main_attack' | 'opp_attack'; // ON_DRAW triggerScope:any_opp（対戦相手ドロー）の位相限定。main_attack=メイン/アタックフェイズの間（WXDi-P04-038/PR-423）／opp_attack=対戦相手のアタックフェイズの間（WD22-029-G・対戦相手ターン＋アタック系サブフェイズ）
    drawByEffect?: boolean; // ON_DRAW triggerScope:any_opp の逆翻訳で「効果によって」を付す（WXDi-P15-091/PR-423）。engine 評価では効果ドロー経路でのみ呼ばれるため暗黙＝表示専用。発生源プレイヤー限定は drawByDrawerOwnEffect で判定する
    drawByDrawerOwnEffect?: boolean; // ON_DRAW triggerScope:any_opp で「対戦相手が【自分の効果で】引いたとき」限定（PR-423）。drawer（対戦相手）の last_draw_by_own_effect が true のときのみ発火＝reactor 自身の効果で相手を引かせた場合は誤発火しない（続き162・Opusタスク12(xxi)）
    risedOntoNameContains?: string; // このシグニが、カード名に指定文字列を含むシグニの上にライズされた場合のみ発火（WX20-056-E2「《オダノブ》を含むシグニにライズされたとき」。ON_RISE と併用。ライズで下に置かれた元シグニの名前で判定）
    // ON_OPP_POWER_DECREASED の発生源限定「あなたの（他の）＜X＞のシグニの効果によって」（discardCostSourceStory と同型）。
    // engine は temp_power_mods.srcCardNum の CardClass で判定し、発生源不明のときは従来どおり発火する（過剰側に倒す）。
    powerDecreaseSourceStory?: string;
    powerDecreaseExcludeSelf?: boolean; // 「あなたの**他の**＜X＞のシグニの効果によって」＝効果元自身は発生源から除く
    discardCostSourceStory?: string; // ON_DISCARDED_AS_COST の発生源限定「あなたの＜X＞のシグニの【出】【起】能力のコストとして捨てられたとき」（WX25-P3-071/077/084/085/088）。コストを支払った能力の host シグニの CardClass に X を含む場合のみ発火＝他クラスのコスト捨てでは誤発火しない（続き162・Opusタスク12(xxiv)）
    milledDeckOwner?: 'self' | 'opponent' | 'any';   // ON_CARD_MILLED_FROM_DECK の発生源デッキ（トリガー所有者から見た self/opponent/any）。省略=any
    energyTrashedOwner?: 'self' | 'opponent' | 'any'; // ON_ENERGY_TO_TRASH の発生源エナゾーン（トリガー所有者から見た self/opponent/any）。省略=any。WD15-015=opponent。⚠「あなたの効果によって」の発生源限定は未表現（効果解決経路で発火＝相手効果による自エナトラッシュも発火しうる近似）
    accedSelf?: boolean;        // ON_ACCE_ATTACH の変種弁別：true＝「このカードが【アクセ】として（…の）シグニに付いたとき」（アクセカード自身の反応）。省略＝「あなたのシグニ1体に【アクセ】が付いたとき」（ルリグ監視・WXK04-003）。engine は走査ループが役割で分かれるため無視（逆翻訳の主語切替専用）
    accedHostMinLevel?: number; // ON_ACCE_ATTACH（アクセカード自身）の「レベルN以上のシグニに付いたとき」host レベル条件（WXK05-041=4）。host シグニの Level がN未満なら発火しない
    accedHostMaxLevel?: number; // ON_ACCE_ATTACH（アクセカード自身）の「レベルN以下のシグニに付いたとき」host レベル条件（WX17-076-E2=2）。host シグニの Level がN超なら発火しない
    accedHostStory?: string;    // ON_ACCE_ATTACH（アクセカード自身）の「＜X＞のシグニに付いたとき」host クラス条件（WX17-033-E4=調理）。host シグニの CardClass に含まれなければ発火しない
    refreshedOwner?: 'self' | 'opponent' | 'any'; // ON_REFRESH の発生源プレイヤー（トリガー所有者から見た self/opponent/any）。省略=any。WXDi-P04-043=any（いずれかのプレイヤー）
    handOwner?: 'self' | 'opponent'; // ON_HAND_ADDED の手札が増えた側（watcher 所有者から見て）。省略=self。WX25-P2-063=opponent（「対戦相手の手札に移動したとき」）。fromZones で移動元も限定可（['energy']＝「エナゾーンから」）
    excludeGrowPhase?: boolean; // 「グロウフェイズ以外で」＝ctx.turnPhase が GROW のときは発火しない（WX25-P2-063。ON_HAND_ADDED と併用）
    movedSelf?: boolean; // ON_HAND_ADDED の変種弁別：true＝「このシグニが（あなたのエナゾーンから）手札に移動したとき」＝移動したカード自身が手札から発火（WD12-009-E2/WD12-010-E1）。省略＝場の watcher（自身が手札に移動しても発火しない）
    leftToZone?: 'hand'; // ON_LEAVE_FIELD の行き先限定（「場から手札に戻ったとき」WXK02-041）。離れたカードが所有者の手札に在中する場合のみ発火。省略=行き先不問
    leftStateFilter?: TargetFilter; // ON_LEAVE_FIELD の離脱シグニ状態限定（「対戦相手の凍結状態のシグニが場を離れたとき」WXEX1-30/WXDi-P03-040 等）。離脱**直前**の盤面状態（matchesStateFilter＝isFrozen/infected/hasCharm 等）で判定。banishedFilter の ON_LEAVE_FIELD 版。バトル離脱（除去前 state 未渡し）では判定材料が無いため保守的に非発火
    exceedCostPaidByPlayer?: boolean; // ON_EXCEED_COST の「あなたがエクシードのコストを支払ったとき」変種（場のシグニが反応。WXDi-P06-078）。省略時は既存の「このカードがエクシードのコストとして置かれたとき」（コストカード自身）。⚠ルリグ起動のエクシード支払い経路のみ検出（アーツ/スペルのカットイン exceed は未検出の近似）
    // ON_CARD_MILLED_FROM_DECK の発生源限定「あなたの＜X＞のシグニの効果１つによって」（powerDecreaseSourceStory と同型）。
    // engine は last_effect_mill_source の CardClass で判定し、発生源不明のときは従来どおり発火する（過剰側に倒す）。
    milledSourceStory?: string;
    milledMinCount?: number;                        // ON_CARD_MILLED_FROM_DECK の発火に必要な、その効果解決で対象デッキからトラッシュに置かれた最低枚数（省略=1）。「合計N枚」型はこの解決単位での近似（cf. TODO §3.5）
    movedToDeckOwner?: 'self' | 'opponent' | 'any';  // ON_CARD_MOVED_TO_DECK の宛先デッキ（トリガー所有者から見た self/opponent/any）。省略=any
    movedToDeckMinCount?: number;                     // ON_CARD_MOVED_TO_DECK の発火に必要な、その効果解決で対象デッキに加わった最低枚数（省略=1）。「N枚以上」型はこの解決単位での近似（cf. TODO §3.5）
    movedToDeckFromTrash?: boolean;                   // ON_CARD_MOVED_TO_DECK の発生源をトラッシュに限定（「あなたのトラッシュから…デッキに移動したとき」WX09-020/WX22-014）。省略=任意の発生源
    banishedFilter?: TargetFilter;                    // ON_SIGNI_BANISH_OPPONENT/_BATTLE の被バニッシュシグニ限定（「感染状態の/凍結状態の/【チャーム】が付いている…シグニをバニッシュしたとき」WX16-079/WXK02-054/WXEX2-76 等）。バニッシュ**直前**の盤面状態（matchesStateFilter＝infected/isFrozen/hasCharm）＋カードデータ（matchesFilter）で判定。triggerFilter は any_ally scope で**バニッシュした側**に使われるため別軸
    banishedNotFront?: boolean;                        // ON_SIGNI_BANISH_BATTLE/_OPPONENT の被バニッシュシグニ限定「正面**以外**の」（WX17-032「あなたのシグニがバトルによって正面以外のシグニをバニッシュしたとき」）。banishedFilter（カード属性/ゾーン状態）とは別軸＝アタッカーの正面ゾーン（対戦相手視点のミラーゾーン）と被バニッシュゾーンの一致判定。犠牲/リダイレクトで実際の被バニッシュ位置が変わった場合も対応
    duringAttackPhase?: boolean;                      // 「アタックフェイズの間、…したとき」＝アタックフェイズ（ATTACK_*）中のイベントのみ発火（WXEX2-01/WX20-051＝ON_SIGNI_DOWN/UP・WX11-030＝ON_DRAW）
    upIncludesLrig?: boolean;                         // ON_SIGNI_BECOMES_UP の「あなたのセンタールリグかシグニ1体がアップ状態になったとき」（WX20-051）＝センタールリグのアップ（lrig_down true→false）でも発火。省略＝シグニのみ
    byOwnEffect?: boolean;                            // ON_TRASH（自己discard反応「あなたの効果によって/あなたがこのカードを捨てたとき」WXDi-P08-075/P11-069）＝対戦相手の効果起因では発火しない。ON_LEAVE_FIELD any_opp（「あなたの効果によって対戦相手のシグニが…」WXK11-049/WXDi-CP01-027）＝watcher 自身の効果が原因のときのみ発火（バトル/ルール処理でも発火しない）
    placedOnTrapZone?: boolean;                       // 「対戦相手のシグニN体が【トラップ】のあるシグニゾーンに出たとき」（WX21-025）＝トリガー元シグニの持ち主の signi_traps が当該ゾーンに在る場合のみ発火（ON_PLAY any_opp と併用・タスク16[C]機構⑤）
    placedOnGateZone?: boolean;                       // 「対戦相手のシグニN体が【ゲート】があるシグニゾーンに出たとき」（WXK10-044）＝トリガー元シグニの持ち主の own_gate_zones に当該ゾーンが含まれる場合のみ発火（同上。⚠WXK迷宮のゲート設置が未配線の間は発火しない＝旧 ON_PLAY self 幻覚よりは正直な no-op）
    lrigAttackGuarded?: boolean;                      // 「このルリグのアタックが【ガード】されたとき」＝防御側の「あなたが【ガード】したとき」と同じ ON_GUARD 上で攻撃側ルリグだけを収集
    trashSourceStory?: string;                        // ON_TRASH 自己discard反応の発生源限定「あなたの＜X＞のシグニの効果によってこのカードが捨てられたとき」（WXDi-P14-086）＝原因効果の発生源カード（中央diff の causeSourceCardNum）の CardClass に X を含むときのみ発火
  };

  // CONTINUOUS 用：常時効果がいつ適用されるか
  activeCondition?: ActiveCondition;

  // 発動できる条件（条件を満たさないと使えない）
  condition?: Condition;

  // 対戦相手ターン中の代替エナコスト（このフィールドがある場合、相手ターンはこちらを使う）
  altCostOppTurn?: EnergyCost[];

  // 発動コスト
  cost?: EffectCost;

  // 効果アクション
  action: EffectAction;

  usageLimit?: UsageLimit;
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
  // ターン1制限なし（デフォルトは1ターン1回）
  repeatable?: boolean;
  // v0.277: 手札から発動できる【起】（手札から自身を捨てることでフィールドなしで発動）
  handActivated?: boolean;
  // トラッシュから発動できる【起】（「このシグニをトラッシュから場に出す」等の自己蘇生。トラッシュゾーンUIから発動）
  trashActivated?: boolean;
  // GRANT_LRIG_ABILITY permanent:true で付与された能力（lrig_granted_auto_effects 内で「このゲームの間」持続＝ターン境界リセットで残す）
  permanentGrant?: boolean;
}
