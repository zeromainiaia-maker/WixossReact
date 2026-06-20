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
  | 'ON_LIFE_BURST'   // ライフバースト発動時
  | 'ON_TRAP_ACTIVATE' // トラップアイコン発動時
  | 'ON_SONG_ACTIVATE' // 歌のカケラ発動時
  | 'ON_BANISH'       // このカードがバニッシュされたとき
  | 'ON_TRASH'        // このカードがトラッシュに置かれたとき
  | 'ON_ATTACK_SIGNI' // シグニアタックフェイズ（このシグニがアタックしたとき）
  | 'ON_ATTACK_LRIG'  // ルリグアタックフェイズ
  | 'ON_TURN_START'    // ターン開始時
  | 'ON_TURN_END'      // ターン終了時
  | 'ON_OPP_ARTS_USE'  // 相手がアーツを使用したとき（自分フィールドのシグニがトリガー）
  | 'ON_REVEALED_FROM_HAND' // このカードが効果によって手札から公開されたとき
  | 'ON_ENERGY_FROM_TRASH' // このカードがトラッシュからエナゾーンに置かれたとき
  | 'ON_BLOOD_CRYSTAL_ARMOR' // シグニが血晶武装状態になったとき
  | 'ON_HEAVEN'  // このシグニが《ヘブン》したとき（ヘブンヘブン時）
  | 'ON_ACCE'    // シグニにアクセが付いたとき
  | 'ON_SIGNI_DOWN'             // 自分のシグニがダウンしたとき
  | 'ON_SIGNI_ENTERS'           // シグニが場に出たとき
  | 'ON_SIGNI_BANISH_OPPONENT'  // 相手シグニをバニッシュしたとき
  | 'ON_SIGNI_BANISH_BATTLE'    // バトルで相手シグニをバニッシュしたとき
  | 'ON_SIGNI_BATTLE'           // このシグニがシグニ1体とバトルしたとき（攻撃側・防御側の両参加シグニで発火）
  | 'ON_SIGNI_DAMAGE'           // このシグニが対戦相手にダメージを与えたとき（正面空きでライフをクラッシュしたとき）
  | 'ON_SIGNI_POWER_ZERO_OR_LESS' // シグニのパワーが0以下になったとき
  | 'ON_LEAVE_FIELD'            // カードがフィールドを離れたとき
  | 'ON_HAND_DISCARDED'         // 手札が捨てられたとき
  | 'ON_OPP_EFFECT_TRASH_FROM_HAND' // 相手の効果で手札がトラッシュに置かれたとき
  | 'ON_OPPONENT_SIGNI_TRASHED' // 相手シグニがトラッシュに置かれたとき
  | 'ON_OPPONENT_SIGNI_PLAY'    // 相手がシグニを場に出したとき
  | 'ON_LIFE_CRASHED'           // あなたのライフクロスがクラッシュされたとき
  | 'ON_OPP_LIFE_CRASHED'       // 対戦相手のライフクロスがクラッシュされたとき（クラッシュした側＝ターンプレイヤーのフィールドで反応）
  | 'ON_GUARD'                  // あなたが【ガード】したとき
  | 'ON_ATTACK_PHASE_START'     // あなたのアタックフェイズ開始時
  | 'ON_ACCE_ATTACH'            // シグニに【アクセ】が付いたとき（ルリグ監視/アクセカード自身）
  | 'ON_SPELL_USE'              // あなたがスペルを使用したとき
  | 'ON_DISCARDED_AS_COST'      // このカードがシグニ能力のコストとして手札から捨てられたとき
  | 'ON_EXCEED_COST'            // このカードがエクシードのコストとしてルリグトラッシュに置かれたとき
  | 'ON_PLACED_UNDER_SIGNI'     // このカードがシグニの下に置かれたとき（※配置機構が未実装のため現状発火しない）
  | 'ON_OPP_VIRUS_REMOVED'      // 対戦相手の場の【ウィルス】が取り除かれたとき（WD19-009。opp_virus_removed_justフラグで発火）
  | 'ON_OPP_VIRUS_CHANGED';     // 対戦相手の場に【ウィルス】が置かれるか取り除かれたとき（WX21-030。opp_virus_placed/removed_justフラグで発火）

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
  | { type: 'TURN_OWNER'; owner: Owner }
  | { type: 'HAS_CARD_IN_FIELD'; owner: Owner; filter: TargetFilter; excludeSelf?: boolean }
  | { type: 'COUNT_THRESHOLD'; location: CardLocation; owner: Owner; operator: CompareOp; value: number }
  | { type: 'FIELD_SIGNI_POWER_COUNT'; owner: Owner; minPower: number; operator: CompareOp; value: number } // 場のシグニのうちパワーがminPower以上のものの数（「シグニ3体がそれぞれ15000以上」等）
  | { type: 'SELF_POWER_THRESHOLD'; operator: CompareOp; value: number }
  | { type: 'HAND_DIFF'; operator: CompareOp; value: number }  // 自分の手札と相手の手札の差
  | { type: 'ENA_DIFF'; operator: CompareOp; value: number }   // 自分のエナと相手のエナの差
  | { type: 'LRIG_LEVEL'; owner: Owner; operator: CompareOp; value: number } // センタールリグのレベル条件
  | { type: 'EICHI_LEVEL_SUM'; operator: CompareOp; value: number } // 英知=N 条件
  | { type: 'IS_SELF_ARMORED' }                                 // このシグニが血晶武装状態であるかぎり
  | { type: 'IS_SELF_ACCED' }                                   // このシグニにアクセが付いているかぎり
  | { type: 'IS_SELF_ACCE_CARD' }                               // このカードがアクセとして装着されているかぎり（アクセカード側の条件）
  | { type: 'IS_DRIVE_STATE' }                                  // このシグニがドライブ状態（ルリグに乗られている）であるかぎり
  | { type: 'IS_SELF_AWAKENED' }                                // このシグニが覚醒状態であるかぎり
  | { type: 'IS_SELF_IN_CENTER_ZONE' }                          // このシグニが中央のシグニゾーンにあるかぎり
  | { type: 'TURN_HAND_DISCARD_GTE'; value: number }            // このターンにあなたが手札をN枚以上捨てている場合
  | { type: 'THIS_CARD_HAS_UNDER' }                             // このシグニの下にカードがあるかぎり
  | { type: 'HAS_BOND'; cardName?: string }                    // 絆アイコン：このカード名との絆を獲得している（cardName省略=このカード自身）
  | { type: 'SUBSCRIBER_COUNT'; operator: CompareOp; value: number }  // 登録者数条件（N万人以上等）
  | { type: 'VIRUS_COUNT'; owner: Owner; operator: CompareOp; value: number } // 場の【ウィルス】数条件（「対戦相手の場に【ウィルス】がない場合」等）
  | { type: 'LRIG_COLOR'; owner: Owner; color: string }         // センタールリグが指定色を持つ場合（「あなたのセンタールリグが青で」等）
  | { type: 'SAME_ZONE_HAS_GATE' }                              // このシグニと同じシグニゾーンにTHE DOOR【ゲート】があるかぎり（own_gate_zones）
  | { type: 'FIELD_HAS_GATE'; owner: Owner }                    // 指定プレイヤーの場にTHE DOOR【ゲート】があるかぎり（own_gate_zones が非空）
  | { type: 'AND'; conditions: ActiveCondition[] };             // 複合条件（すべてを満たす）

export type Condition =
  | { type: 'FIELD_COUNT'; owner: Owner; cardType?: CardTypeFilter; operator: CompareOp; value: NumberOrRef }
  | { type: 'HAND_COUNT';  owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'LIFE_COUNT';  owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'ENERGY_COUNT'; owner: Owner; operator: CompareOp; value: NumberOrRef }
  | { type: 'CARDS_DRAWN_BY_EFFECT'; owner: Owner; operator: CompareOp; value: number } // このターンに効果で引いた累計枚数（cards_drawn_by_effect_this_turn）
  | { type: 'HAS_CARD_IN_FIELD'; owner: Owner; filter: TargetFilter; excludeSelf?: boolean }
  | { type: 'TRASH_HAS_CARD'; owner: Owner; filter: TargetFilter }
  | { type: 'TRASH_COUNT'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'DECK_TOP_MATCHES'; owner: Owner; filter: TargetFilter }
  | { type: 'LRIG_LEVEL'; owner: Owner; operator: CompareOp; value: number }
  | { type: 'LRIG_STORY'; owner: Owner; story: string }
  | { type: 'THIS_CARD_IN_LOCATION'; location: CardLocation }
  | { type: 'THIS_CARD_IN_CENTER_ZONE' }
  | { type: 'THIS_CARD_IS_DOWN' }
  | { type: 'THIS_CARD_IS_ARMORED' }                          // このシグニが血晶武装状態の場合
  | { type: 'THIS_CARD_IS_AWAKENED' }                         // このシグニが覚醒状態の場合
  | { type: 'THIS_CARD_IS_ACCED' }                            // このシグニに【アクセ】が付いている場合
  | { type: 'IS_DRIVE_STATE' }                                // このシグニがドライブ状態の場合
  | { type: 'TURN_HAND_DISCARD_GTE'; value: number }          // このターンにあなたが手札をN枚以上捨てている場合
  | { type: 'THIS_CARD_HAS_UNDER' }                           // このシグニの下にカードがある場合
  | { type: 'LRIG_LEVEL_EQ_OPP' }                             // 自分のセンタールリグのレベルが対戦相手のセンタールリグと同じ場合
  | { type: 'LRIG_NAME_CONTAINS'; owner: Owner; name: string } // センタールリグのカード名が name を含む場合
  | { type: 'LRIG_COLOR'; owner: Owner; color: string }       // センタールリグが指定色を持つ場合（「あなたのセンタールリグが青で」等）
  | { type: 'LRIG_TRASH_COUNT'; cardType?: CardTypeFilter; operator: CompareOp; value: number } // ルリグトラッシュの（cardType一致）カード枚数（「ルリグトラッシュにアーツが4枚以上」等）
  | { type: 'FIELD_CLASS_COUNT'; owner: Owner; story: string; operator: CompareOp; value: number } // 場のシグニのうちCardClassがstoryを含むものの数（「場に＜天使＞が3体」等）
  | { type: 'SUBSCRIBER_COUNT'; operator: CompareOp; value: number } // 登録者数（万人）条件
  | { type: 'SELF_POWER_GTE'; value: number }
  | { type: 'FIELD_SIGNI_POWER_COUNT'; owner: Owner; minPower: number; operator: CompareOp; value: number } // 場のシグニのうちパワーがminPower以上のものの数（「シグニ3体がそれぞれ15000以上」等）
  | { type: 'LIFE_COMPARE_OPP'; operator: CompareOp }
  | { type: 'DURING_PHASE'; phases: string[] }
  | { type: 'AND'; conditions: Condition[] }
  | { type: 'IS_MY_TURN' }
  | { type: 'IS_OPPONENT_TURN' }
  | { type: 'PAID_ADDITIONAL_COST' }
  | { type: 'BEAT_CONDITION'; condText: string } // 《ビートアイコン》[条件]
  | { type: 'COND_STUB'; raw: string }
  | { type: 'LAST_PROCESSED_LEVEL_SUM_EQ'; value: number }   // lastProcessedCardsのシグニレベル合計=N
  | { type: 'OPPONENT_NOT_PAID' }                             // 相手が任意コストを支払わなかった場合
  | { type: 'SELF_OPTIONAL_EFFECT_TAKEN' }                    // 自分が任意効果（自バニッシュ等）を実行した場合
  | { type: 'HAS_BOND'; cardName?: string }                   // 絆アイコン：このカード名との絆を獲得している
  | { type: 'ACTIVATED_DISCARD_COUNT_GTE'; value: number }    // 直前の【起】コストで捨てた合計枚数（手札+エナ）≥ N
  | { type: 'OPP_LIFE_CRASH_EVENT_GTE'; value: number }       // 今回の相手ライフクラッシュイベントで同時にN枚以上クラッシュされた場合（ダブルクラッシュ判定。ON_OPP_LIFE_CRASHED収集時に専用評価）
  | { type: 'SAME_ZONE_HAS_GATE' }                            // このシグニと同じシグニゾーンにTHE DOOR【ゲート】がある場合（own_gate_zones）
  | { type: 'FIELD_HAS_GATE'; owner: Owner }                  // 指定プレイヤーの場にTHE DOOR【ゲート】がある場合（own_gate_zones が非空）
  | { type: 'NOT_PLAYED_NON_DISSONA_SPELL_THIS_TURN' };       // このターンに《ディソナアイコン》ではないスペルを使用していない（DISONA_RESTRICTION用）

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
  coin?: number;          // 《コインアイコン》×N（【出】《コイン》等）
  // ─ v0.263 追加: 無発火だった任意【出】コストの表現（ONPLAY_DEAD_OPTIONAL対策）─
  fieldTrash?: { count: number; filter?: TargetFilter; excludeSelf?: boolean }; // 場の自分シグニN体をトラッシュ（「他の＜原子＞のシグニ１体を場からトラッシュに置く」等）
  handToEnergy?: { count: number; filter?: TargetFilter };    // 手札からN枚をエナゾーンに置く
  handToUnderSelf?: { count: number; filter?: TargetFilter }; // 手札からN枚をこのシグニの下に置く
  lrigDown?: { count: number; centerOnly?: boolean };         // アップ状態の自分ルリグN体をダウン（センター→アシストL→Rの順で自動支払い）
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
  levelParity?: 'even' | 'odd';
  levelRange?: { min?: number; max?: number };
  powerRange?: { min?: number; max?: number };
  story?:     string | string[];  // Dissona専用。シグニクラスには cardClass を使う
  cardClass?: string | string[]; // ＜クラス＞フィルター（CSVのCardClassフィールドに対してincludesでマッチ）
  hasGuard?:  boolean;
  isDown?:    boolean;
  isUp?:      boolean; // アップ状態（ダウンしていない）
  isFrozen?:  boolean;
  hasCharm?:  boolean;
  levelEqDiscardLevelSum?: boolean; // レベルがlast_activated_discard_level_sumと一致するか（WDK13-011用）
  levelEqualsVar?: 'charm_trash_count'; // レベルがlast_charm_trash_countと一致するか（WXK10-082用）
  powerLteSelf?: boolean; // 効果元シグニの実効パワー以下（「自身のパワー以下の対戦相手のシグニ」。execBanishがpowerRange.maxへ解決）
  powerLtSelf?: boolean;  // 効果元シグニの実効パワーより低い（「自身よりパワーの低い」。execBanishがpowerRange.maxへ解決）
  frontOfSelf?: boolean;  // 効果元シグニの正面のシグニ（execBanishが対象ゾーン 2-zi を解決）
  frontOfGateZone?: boolean; // THE DOOR【ゲート】がある自分のシグニゾーンの正面にある対戦相手のシグニ（own_gate_zones の各 zi に対し相手ゾーン 2-zi。execTransferToDeck が解決）
  inGateZone?: boolean;      // このシグニと同じシグニゾーンに THE DOOR【ゲート】がある（own_gate_zones にゾーンが含まれる。状態ベース＝fieldCandidates/matchesStateFilter で判定）
  centerZoneOnly?: boolean;  // 中央のシグニゾーン（zone index 1）にあるシグニのみ（状態ベース＝fieldCandidates/matchesStateFilter で判定）
  thisCardOnly?: boolean; // 効果元シグニ自身のみ（「このシグニをバニッシュする」等の自己対象。execBanishが解決）
  excludeSelf?: boolean;  // 効果元シグニ自身を対象から除外（「あなたの他の＜原子＞のシグニ」等。execTrash/execBanishが解決）
  isTriggerSource?: boolean; // トリガー元カード（ctx.triggeringCardNum）のみを対象。execBanishが解決
  colorMatchesLrig?: boolean;    // 自分のセンタールリグと共通する色を持つか（WX01-025等）
  colorNotMatchesLrig?: boolean; // 自分のセンタールリグと共通する色を持たない（WX21-035等）
  colorExclude?: string | string[]; // この色を含むカードを除外（resolveDynamicFilterが解決後にセット）
  hasAcce?:   boolean; // アクセが付いている
  hasIcon?:   'クロス' | 'ライズ' | 'トラップ' | 'アクセ'; // 《Xアイコン》を持つカード（カードテキストのキーワード有無で判定する近似）
  hasLifeBurst?: boolean; // 《ライフバースト》を持つカード
  infected?:  boolean; // 感染状態（ウィルスのあるゾーンのシグニ）
  isArmored?: boolean; // 血晶武装状態
  keyword?: string;             // 【キーワード能力】or《キーワード》を持つカードのフィルタ（「【ライフバースト】を持つ」等）
  // ─ 動的フィルタ（ON_LEAVE_FIELD系トリガーの収集時に具体値へ解決される。未解決時は無視）─
  levelBelowLeftCard?: boolean; // 場を離れたカードよりレベルが低い → level:{max:N-1} に解決（ミョルニル/花代・伍）
  powerBelowLeftCard?: boolean; // 場を離れたカードよりパワーが低い → powerRange.max:N-1 に解決（スノークイーン WX16-025）
  underLeftCard?: boolean;      // 場を離れたカードの下にあったカード → cardNames:[...] に解決（フンババ）
  levelLteFieldVirusCount?: boolean; // レベルが場（両プレイヤー）にある【ウィルス】の数以下 → level:{max:N}に解決（WX16-005）
  powerLteLastProcessed?: boolean; // パワーが直前に処理したシグニ（lastProcessedCards[0]）の実効パワー以下 → powerRange.max に解決（「ダウンしたそのシグニのパワー以下」WD04-018）
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
  count: number | 'ALL';
  filter?: TargetFilter;
  upToCount?: boolean;   // count > 1 のとき「以上」を許容するか
  blind?: boolean;       // true = 対戦相手の手札を見ないで選ぶ（ランダム選択）
  actingPlayerSelects?: boolean; // true = 手札を見て自分が選ぶ（「手札を見てN枚選び捨てさせる」）
}

// ===== アクション =====

export type EffectAction =
  | DrawAction
  | BounceAction
  | BanishAction
  | PowerModifyAction
  | PowerSetAction
  | TrashAction
  | EnergyChargeAction
  | EnergyChargeFromDeckAction
  | LifeCrashAction
  | ShuffleDeckAction
  | RevealAction
  | AddToHandAction
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
  | BanishRedirectAction
  | RearrangeSigniAction
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
  | AwakenSigniAction
  | NegateAttackAction
  | PlaceUnderSigniAction
  | PlaceUnderSourceSigniAction
  | PreventNextDamageAction
  | TakeFromUnderSigniAction
  | GrantEffectAction
  | GrantSigniAboveAbilityAction
  | GrantFieldSigniAbilityAction
  | GrantFieldShadowAction
  | GrantAcceHostAbilityAction
  | GrantSoulHostAbilityAction
  | RevealUntilBanishSameLevelAction
  | StubAction
  | GainBondAction
  | MILLAction
  | UnknownAction;

export interface DrawAction {
  type: 'DRAW';
  owner: Owner;
  count: NumberOrRef;
}

// フィールドのシグニ N体につき M枚ドロー
export interface DrawPerFieldCountAction {
  type: 'DRAW_PER_FIELD_COUNT';
  drawPerUnit: number;        // シグニ1体ごとに引く枚数
  countFilter: TargetFilter;  // カウント対象シグニのフィルタ
  countOwner: Owner;          // カウントするフィールドのオーナー
}

// このシグニを覚醒させる（覚醒状態になる）
export interface AwakenSigniAction {
  type: 'AWAKEN_SIGNI';
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

// このターン、次にターゲットシグニがアタックしたとき、そのアタックを無効にする
export interface NegateAttackAction {
  type: 'NEGATE_ATTACK';
  target: EffectTarget;
}

export interface BounceAction {
  type: 'BOUNCE'; // フィールド→手札
  target: EffectTarget;
  optional?: boolean; // true = 「してもよい」（プレイヤーがスキップ可能）
}

export interface BanishAction {
  type: 'BANISH';
  target: EffectTarget;
  optional?: boolean;    // true = 「してもよい」（プレイヤーがスキップ可能）
  conditional?: boolean; // true = 前ステップ（STUB等）が成功した場合のみ実行
  selfTrashCost?: boolean; // 「このシグニを場からトラッシュに置いてもよい。そうした場合〜バニッシュ」：対象を1体以上選んだ場合、効果元シグニ自身をコストとしてトラッシュ（WX21-052）
}

export interface PowerModifyAction {
  type: 'POWER_MODIFY';
  target: EffectTarget;
  delta: NumberOrRef; // 正=強化、負=弱体化
  excludeSelf?: boolean; // 「あなたの他のシグニ」: 効果元カード自身を対象から除外
  targetsTriggerSource?: boolean; // 「それ」= トリガー元シグニを自動対象（ctx.triggeringCardNum → ctx.sourceCardNum の順で解決）
  duration?: EffectDuration; // 'UNTIL_OPP_TURN_END' のとき power_mods_until_opp_turn へ（省略時はターン終了まで＝temp_power_mods）
}

export interface PowerSetAction {
  type: 'POWER_SET';
  target: EffectTarget;
  value: NumberOrRef;
}

export interface TrashAction {
  type: 'TRASH'; // 指定カードをトラッシュへ
  target: EffectTarget;
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
}

export interface AddToHandAction {
  type: 'ADD_TO_HAND'; // SEARCH内で直前に選んだカードを手札へ
  owner: Owner;
}

// SEARCH内で直前に選んだカードをエナゾーンへ
export interface AddToEnergyAction {
  type: 'ADD_TO_ENERGY';
  owner: Owner;
}

// トラッシュ・エナ・ライフクロスなど任意の場所から手札へ移動
export interface TransferToHandAction {
  type: 'TRANSFER_TO_HAND';
  source: EffectTarget; // どこから何を（TRASH_CARD, ENERGY_CARD など）
}

// デッキ上のカードをライフクロスに加える
export interface AddToLifeAction {
  type: 'ADD_TO_LIFE';
  owner: Owner;
  count: NumberOrRef;
  fromTop: boolean; // true=デッキ上から
}

export interface AddToFieldAction {
  type: 'ADD_TO_FIELD'; // 直前に選んだカードをフィールドへ（コスト不要で出す）
  owner: Owner;
  source?: EffectTarget; // トラッシュ・エナ・手札など出処が明示される場合
  asDown?: boolean;      // true = ダウン状態で場に出す
  cardName?: string;     // ゲーム外からトークンを生成して場に出す場合のCardNum
}

export interface FreezeAction {
  type: 'FREEZE'; // 凍結付与
  target: EffectTarget;
  down?: boolean; // true=「ダウンし凍結」：同一対象をダウンも行う。省略時は凍結のみ（現在のアップ/ダウン状態は変えない）
}

export interface DownAction {
  type: 'DOWN'; // ダウン
  target: EffectTarget;
}

export interface UpAction {
  type: 'UP'; // アップ
  target: EffectTarget;
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
  maxCount: number;
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
  recollect?: {          // リコレクト条件達成時に choose_count/upTo を上書き
    minCount: number;       // トラッシュの<プリオケ>カード数の閾値
    thenChooseCount: number; // 条件達成時のchoose_count
    thenUpTo?: boolean;      // 条件達成時のupTo
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
    position: 'top' | 'bottom' | 'any';
  };
}

// キーワード能力を付与する（【ランサー】【ダブルクラッシュ】など）
export interface GrantKeywordAction {
  type: 'GRANT_KEYWORD';
  target: EffectTarget;
  keyword: string;
  duration: EffectDuration;
}

// 複合能力（CardEffect）をシグニ/ルリグに付与する
export interface GrantEffectAction {
  type: 'GRANT_EFFECT';
  target: EffectTarget;
  effect: CardEffect;      // 付与するエフェクト（AUTO/ACTIVATED/CONTINUOUSなど）
  duration: EffectDuration;
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

// トラッシュ/エナ/フィールドからデッキへ移動
export interface TransferToDeckAction {
  type: 'TRANSFER_TO_DECK';
  source: EffectTarget;
  shuffle: boolean;
  destination?: 'deck' | 'lrig_deck'; // 省略時は 'deck'
  position?: 'top' | 'bottom';        // デッキの挿入位置（省略時は top）
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
  from: string[];     // 保護元：'ルリグ' | 'シグニ' | 'スペル' | 'アーツ' | 'DOWN' | 'BOUNCE' | 'any'
  sourceOwner: Owner; // 誰の効果から保護するか
  duration: EffectDuration;
}

// チャーム付与（シグニに裏向きでカードを付ける）
export interface AttachCharmAction {
  type: 'ATTACH_CHARM';
  charm: EffectTarget; // チャームにするカード
  to: EffectTarget;    // 付ける対象シグニ
}

// デッキの上からN枚公開し、条件を満たすカードをpickする
export interface RevealAndPickAction {
  type: 'REVEAL_AND_PICK';
  owner: Owner;
  revealCount: NumberOrRef;
  filter?: TargetFilter;
  pickCount: number | 'ALL';
  then: EffectAction;
  remainder?: { location: CardLocation; position: 'top' | 'bottom' | 'any' };
}

// コストなしでカードを使用する（手札・相手手札・相手トラッシュ・ルリグデッキから）
export interface PlayFreeAction {
  type: 'PLAY_FREE';
  source: 'hand' | 'opp_hand' | 'opp_trash' | 'lrig_deck';
  filter: TargetFilter;
  ignoreCost: boolean;
  ignoreRestrictions?: boolean;
  optional: boolean;
}

// コスト増加（CONTINUOUS効果で相手のカード使用コストを増やす）
export interface CostIncreaseAction {
  type: 'COST_INCREASE';
  targetCardType: 'スペル' | 'アーツ' | 'ルリグ';
  targetOwner: Owner;
  amount: EnergyCost[];
  duration?: 'UNTIL_END_OF_TURN' | 'PERMANENT';
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
  redirectTo: 'trash';
  until: 'END_OF_TURN' | 'PERMANENT';
}

// フィールド上のシグニを再配置する
export interface RearrangeSigniAction {
  type: 'REARRANGE_SIGNI';
  target: EffectTarget;
  swap?: boolean; // true=このシグニと対象シグニの位置を交換
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

// このターン、プレイヤーはダメージを受けない
export interface PreventDamageAction {
  type: 'PREVENT_DAMAGE';
  owner: Owner;
  until: EffectDuration;
}

// 各プレイヤーのエナゾーンをN枚に均等化する
export interface EqualizeEnergyAction {
  type: 'EQUALIZE_ENERGY';
  targetCount: number;
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
  costColors?: string[]; // OPTIONAL_COST: 支払うエナの色リスト（例: ['赤','赤']）
  revealPickParams?: {   // REVEAL_PICK_HAND_SHUFFLE_BOTTOM: REVEAL_AND_PICK マージ用メタデータ
    pickCount: number | 'ALL';
    restDest: 'deck_bottom' | 'trash' | 'energy';
    then: 'hand' | 'energy';
    // 1段目（手札）の後に、残りから特定クラスを1枚までエナゾーンへ送る2段階ピック（FUTURE SESSION ②）
    secondPick?: { classContains: string; toMax: number; restDest: 'deck_bottom' | 'trash' };
  };
  revealed?: string[]; // REVEAL_SECOND_PICK_ENERGY: 1段目で公開したカード一覧（残り算出用）
  secondPick?: { classContains: string; toMax: number; restDest: 'deck_bottom' | 'trash' }; // 同上
  value?: number | string; // 汎用値（SET_DECLARED_NUMBER等で使用）
  count?: number;          // GAIN_SIGNI_BARRIER / GAIN_LRIG_BARRIER 等の個数
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

  // ACTIVATED / AUTO / LIFE_BURST 用：いつ使えるか
  timing?: EffectTiming[];

  // AUTO 効果のトリガースコープ（省略 = 'self'）
  triggerScope?: TriggerScope;

  // any_ally スコープのトリガーで、トリガー元カードが満たすべきフィルタ
  // （例: ミョルニル「あなたの＜アーム＞のシグニ１体が場を離れたとき」）
  triggerFilter?: TargetFilter;

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
}
