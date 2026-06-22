export type ViewMode = 'LOGIN' | 'START' | 'DECK_LIST' | 'DECK_EDITOR' | 'MATCHMAKING' | 'BATTLE';

export * from './effects';

export type TurnPhase =
  | 'UP' | 'DRAW' | 'ENERGY' | 'GROW' | 'MAIN'
  | 'ATTACK_ARTS' | 'ATTACK_ARTS_OP' | 'ATTACK_SIGNI' | 'ATTACK_LRIG'
  | 'END';

export interface CardData {
  CardNum: string;
  CardName: string;
  ImgURL: string;
  Type: string;
  CardClass: string;
  Color: string;
  Level: string;
  GrowCost: string;
  Cost: string;
  Limit: string;
  Power: string;
  Restriction: string;
  Team: string;
  Timing: string;
  Guard: string;
  Coin: string;
  Story: string;
  LifeBurst: string;
  EffectText?: string;
  BurstText?: string;
  effects?: import('./effects').CardEffect[];
  hasCrossIcon?: boolean;
  crossConditionText?: string;
}

export interface Deck {
  id: string;
  name: string;
  mainDeck: string[];
  lrigDeck: string[];
  thumbnailCardNum?: string;
  sortOrder?: number;
  artOverrides?: Record<string, string>; // canonicalCardNum → variantCardNum（表示のみ）
}

export interface Room {
  id: string;
  host_id: string;
  guest_id: string | null;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  passcode: string | null;
  host_deck_id: string | null;
  guest_deck_id: string | null;
  host_art_overrides: Record<string, string>;
  guest_art_overrides: Record<string, string>;
  winner_id: string | null;
  created_at: string;
}

// BANISH_SUBSTITUTE (F-3) のオプション（engine の BanishSubstituteOption と同形・state永続用）
export type BanishSubstituteOptionState =
  | { kind: 'sacrifice'; sourceNum: string; sacrificeNum: string }
  | { kind: 'pay_cost'; sourceNum: string; costType: 'discardSpell' | 'trashStackSpell'; amount: number };

export interface PlayerState {
  deck: string[];
  lrig_deck: string[];
  hand: string[];
  life_cloth: string[];
  trash: string[];
  lrig_trash: string[];
  energy: string[];
  coins: number;
  field: {
    lrig: string[];
    signi: (string[] | null)[];
    signi_down?: boolean[];    // [zone0, zone1, zone2] true=ダウン状態
    signi_frozen?: boolean[];  // [zone0, zone1, zone2] true=凍結中（アップフェイズにアップせず凍結を解除）
    lrig_down?: boolean;       // true=ルリグがダウン状態（攻撃済み）
    lrig_frozen?: boolean;     // true=ルリグが凍結中
    lrig_attacked?: boolean;   // true=このプレイヤーが相手ルリグに攻撃された（ガード応答待ち）
    assist_lrig_l?: string[];
    assist_lrig_r?: string[];
    assist_lrig_l_down?: boolean; // true=左アシストルリグがダウン状態（【出】ルリグダウンコスト等）
    assist_lrig_r_down?: boolean; // true=右アシストルリグがダウン状態
    check?: string | null;
    key_piece?: string | null;
    key_piece_extra?: string[];  // UNLIMITED_KEYS: 2枚目以降のキー/ピース
    signi_charms?: (string | null)[]; // [zone0, zone1, zone2] チャームカードのCardNum or null
    signi_acce?:   (string | null)[]; // [zone0, zone1, zone2] アクセカードのCardNum or null
    signi_virus?:  number[];          // [zone0, zone1, zone2] ウィルス数（0 or 1）
    signi_chokkin?: number[];         // [zone0, zone1, zone2] 貯菌カウンター数
    signi_soul?:   (string | null)[]; // [zone0, zone1, zone2] ソウルカードのCardNum（場を離れるとlrig_trashへ）
    signi_traps?:       (string | null)[]; // [zone0, zone1, zone2] 裏向きトラップのCardNum（設置済み・未発動）
    signi_magic_boxes?: (string | null)[]; // [zone0, zone1, zone2] 【マジックボックス】のCardNum（裏向き設置中）
    signi_seeds?:  (string | null)[]; // [zone0, zone1, zone2] 【シード】のCardNum（設置済み・未開花）
    signi_armor?:  boolean[];         // [zone0, zone1, zone2] true=血晶武装状態（場を離れるまで維持）
    free_zone?:    string[];          // フリーゾーン（チアガール等を置く汎用ゾーン）
    beat_zone?:    string[];          // ビートゾーン（ターン終了時にトラッシュへ、UIはフリーゾーンと共有）
    cross_state?:  boolean[];         // [zone0, zone1, zone2] true=クロス状態
    heaven_state?: boolean[];         // [zone0, zone1, zone2] true=このターンヘブンヘブン済み
  };
  actions_done?: string[];      // このターンに使用済みのアクション（ターン開始時にリセット）
  refresh_count_this_turn?: number; // このターン中にこのプレイヤーが行ったリフレッシュ回数（ターン開始時にリセット。ターンプレイヤーが2回目でターン終了）
  game_actions_done?: string[]; // ゲーム通じて使用済みのアクション（once_per_game追跡、ターンリセット対象外）
  last_activated_discard_count?: number; // 直前【起】コスト支払いで捨てた合計枚数（手札+エナ）。ACTIVATED_DISCARD_COUNT_GTE条件用
  last_energy_trash_color_count?: number; // 直前コスト(energyTrashColorAll)でエナからトラッシュした指定色カードの枚数。ENERGY_TRASH_COLOR_COUNT_GTE条件用（WX04-002-E2「この方法で赤が3枚以上」）
  last_charm_trash_count?: number; // 直前コスト支払いでトラッシュしたチャーム枚数（BanishFilter: levelEqualsVar用）
  last_field_trash_level?: number; // 直前コスト支払いで場からトラッシュしたシグニのレベル（BanishFilter: levelEqualsVar='field_trash_level'用。WX03-001）
  blocked_actions?: string[]; // カード効果で封じられたアクション
  blocked_card_names?: string[]; // このターン使用禁止のカード名（BLOCK_CARD_USE 効果）
  story_overrides?: Record<string, string>; // CardNum -> ゲーム中に変更されたStory（大本のCardDataは変えない）
  // DECLARE_ZONE_FOR_CLASS_CHANGE: このプレイヤーが指定した領域（相手シグニがクラス/色を失い＜精元＞を得る）
  declared_class_zones?: Array<{ sourceCardNum: string; zone: 'deck' | 'hand' | 'signi' | 'trash' }>;
  pending_crashed_cards?: string[]; // ダブルクラッシュ等で同時クラッシュしたが未処理のカード番号（バースト処理待ち）
  // 効果エンジン用：ターン終了時にクリア
  temp_power_mods?: Array<{ cardNum: string; delta: number }>;
  // 次の対戦相手のターン終了時までの一時パワー修正（temp_power_modsの長期版。UNTIL_OPP_TURN_END）
  power_mods_until_opp_turn?: Array<{ cardNum: string; delta: number }>;
  keyword_grants?: Record<string, string[]>; // instanceId → ['ランサー', ...]
  keyword_grants_until_opp_turn?: Record<string, string[]>; // 次の対戦相手ターン終了時までの付与キーワード
  // 次の自分のターンの間、自分の場の「すべて」のシグニ（その間に新たに出したシグニも含む）が得るキーワード（GRANT_KEYWORD duration:NEXT_TURN）
  field_keyword_grants_next_turn?: string[]; // 付与予約（発動時セット → 次の自分ターン開始時に active へ移動）
  field_keyword_grants_active?: string[];    // 現在の自ターン中に全自シグニが得ているキーワード（自ターン終了時にクリア）
  granted_effects?: Record<string, import('./effects').CardEffect[]>; // instanceId → 付与された CardEffect[]
  // 次の対戦相手のターン終了時までの付与効果（granted_effectsの長期版。UNTIL_OPP_TURN_END）
  granted_effects_until_opp_turn?: Record<string, import('./effects').CardEffect[]>;
  // 強制攻撃フラグ（このターン、このプレイヤーのシグニは可能ならばアタックしなければならない）
  must_attack_signi?: boolean;
  // 強制攻撃を感染状態のシグニのみに限定する（WX16-047等）
  must_attack_infected_only?: boolean;
  // アクティブなコスト修正（CostIncrease/CostReduction効果）
  cost_modifiers?: Array<{
    direction: 'increase' | 'decrease';
    targetCardType: string;
    amount: { color: string; count: number }[];
    until: 'END_OF_TURN' | 'NEXT_TURN' | 'PERMANENT';
  }>;
  // 能力消去されたシグニのCardNum一覧
  abilities_removed?: string[];
  // 次のダメージを無効にする回数（PREVENT_NEXT_DAMAGE 効果）
  prevent_next_damage?: number;
  // このターン、次のライフバーストは2回発動する（LIFE_BURST_DOUBLE 効果）
  life_burst_double_next?: boolean;
  // スペル/アーツ効果でターン終了まで付与されたルリグの AUTO 能力
  lrig_granted_auto_effects?: import('./effects').CardEffect[];
  // このターン、対戦相手のシグニがバニッシュされる場合エナゾーンではなくトラッシュへ（BANISH_REDIRECT）
  banish_redirect?: boolean;
  // このターン、対戦相手のシグニがバニッシュされる場合エナゾーンではなく手札に戻る（BANISH_REDIRECT_TO_HAND）
  banish_redirect_to_hand?: boolean;
  // DECLARE_NUMBER で宣言された数字（このターン、相手はこのレベルのシグニでガードできない）
  declared_guard_restrict_level?: number;
  // DECLARE_CARD_NAME で宣言されたカード名（デッキ上確認効果等で使用）
  declared_card_name?: string;
  // COPY_LRIG_NAME_ABILITY: ルリグが別のルリグ名/タイプを持つとして扱うエイリアス
  lrig_name_aliases?: string[];
  // GAIN_EXTRA_TURN: 追加ターンフラグ（BattleScreen側でターン終了時にチェック）
  extra_turn?: boolean;
  // HAND_SIZE_INCREASE: 手札上限数（未設定 = デフォルト∞）
  hand_limit?: number;
  // このターン、手札のすべてのシグニが【ガード】を得る（GRANT_GUARD_ICON_HAND_SIGNI）
  hand_signi_guard_enabled?: boolean;
  // 覚醒状態のシグニのCardNum一覧（永続、場を離れるまで有効）
  awakened_signi?: string[];
  // このターン次にアタックしたとき無効にされるシグニのCardNum一覧
  negated_attacks?: string[];
  // このターンまたは次のターン、グロウできない
  no_grow?: boolean;
  // このターン、ライフバースト発動を抑制（クラッシュされた側）
  suppress_life_burst?: boolean;
  // このターン、ルリグダメージを受けない
  prevent_lrig_damage?: boolean;
  // このターン（または次のターンまで）、敗北しない
  prevent_defeat?: boolean;
  // サブスクライバーカウント（ちあコーデ系）
  subscriber_count?: number;
  // ルリグリミット加算修正（エナフェイズ終了まで）
  lrig_limit_mod?: number;
  // このターン、相手はガードできない（追加無色支払いなし版：OPP_GUARD_COST_COLORLESS）
  prevent_opp_guard?: boolean;
  // 次の自分のターンのドロー枚数上限（LIMIT_OPP_DRAW_COUNT等）
  draw_limit?: number;
  // ターン終了時まで有効なカードクラスオーバーライド（CardNum → 新クラス名）
  card_class_overrides?: Record<string, string>;
  // このターン無効化された自フィールドのシグニゾーン番号（REMOVE_SIGNI_ZONE効果）
  disabled_signi_zones?: number[];
  // ゲート設置済みゾーン番号（GATE効果：条件付きアタック不可。相手ゾーンへ設置するアタック妨害ゲート）
  signi_gate_zones?: number[];
  // THE DOOR【ゲート】が置かれている自分のシグニゾーン番号。signi_gate_zones とは別概念で、
  // 自分のシグニゾーンに置くマーカー。THE DOORシグニが「同じシグニゾーンに【ゲート】があるかぎり…」等で参照する。
  // ゾーン番号で管理し、そのゾーンのシグニが離れてもゲートは残る（ルール通り）。
  own_gate_zones?: number[];
  // ハスターリク設置済みゾーン番号（WXDi-P05-TK01A：アタックフェイズ開始時に相手が捨て/払いしないとバニッシュ）
  hastarliq_zones?: number[];
  // このターン、対戦相手シグニのパワーが0以下になったときカード1枚引く（WX13-060①）
  draw_on_opp_power_zero?: boolean;
  // 宣言したクラス（DECLARE_CLASS効果）
  declared_class?: string;
  // このターン指定された相手シグニゾーン番号（DESIGNATE_SIGNI_ZONE効果）
  designated_zone?: number;
  // 全ゾーンで色を失うカードのCardNum一覧（LOSE_COLOR_ALL_ZONES: チームルリグ3体未満時）
  colorless_card_overrides?: string[];
  // 対戦相手の効果でトラッシュに移動できないゾーン（PREVENT_ZONE_MOVE_BY_OPP等）
  prevent_opp_trash_from?: ('hand' | 'energy')[];
  // ターン終了時まで有効なシグニ色オーバーライド（CardNum → 新色名）
  signi_color_overrides?: Record<string, string>;
  // エナの色代替（キーピース等：from色のエナをto色として扱う）
  energy_color_substitutes?: { from: string[]; to: string }[];
  // このターンにアタックしたシグニのCardNum一覧（ターン終了時リセット）
  attacked_signi_ids?: string[];
  // 絆を獲得したカード名一覧（ゲーム中に失われない。【絆】アイコン能力の発動条件として参照）
  bonds?: string[];
  // このターン、自分のシグニは合計1回しかアタックできない（LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL）
  signi_attack_once_limit?: boolean;
  // 相手効果による自シグニのダウンを防ぐ（PREVENT_SIGNI_DOWN_BY_OPP_ALL）
  prevent_signi_down_by_opp?: boolean;
  // 相手シグニがアタック時に適用するパワー制限（OPP_SIGNI_ATTACK_POWER_RESTRICT）
  opp_signi_attack_power_cap?: number;
  // 裏向きシグニのCardNum一覧（SIGNI_FLIP_FACEDOWN / FACE_DOWN_OPP_SIGNI）
  face_down_signi?: string[];
  // このターン、自分の効果による特定シグニへのパワー-を2倍にする（DOUBLE_OWN_POWER_MINUS）
  double_power_minus_targets?: string[];
  // アタックフェイズ中の英知レベルオーバーライド（CardNum → 扱うレベル）
  attack_phase_level_overrides?: Record<string, number>;
  // COPY_SIGNI: このターン、フィールドシグニが別のカードとして扱われる（field_cardNum → copy_source_cardNum）
  card_identity_overrides?: Record<string, string>;
  // DEPLOY_RESTRICT: このターンと次のターン、このパワー以上のシグニを場に出せない（自ターン基準）
  signi_deploy_power_limit?: number;
  // ACTIVATE_COST_ZERO_BLACK: このカードの次の起動能力コストを《黒×0》にする（CardNum）
  activate_cost_zero_signi?: string;
  // DECLARE_COLOR: 宣言された色（白/赤/青/緑/黒）
  declared_color?: string;
  // OPPONENT_PAY_OPTIONAL: 相手が任意コストを支払ったかどうか（true=支払い済み）
  opponent_paid_optional_cost?: boolean;
  // UNKNOWN_NESTED / BANISH_FROM_GAME: 任意効果（自トラッシュ・除外）を実行したかどうか
  self_optional_effect_taken?: boolean;
  // ATTACH_ACCE 直後にセット: アクセしたホストシグニのCardNum（BattleScreenでON_ACCEトリガー検出用）
  acce_just_done?: string | null;
  // 効果による手札公開直後にセット: 公開された手札カードのCardNum（BattleScreenでON_REVEALED_FROM_HANDトリガー検出用）
  hand_revealed_just?: string[] | null;
  // 効果による手札捨て直後にセット: 捨てられたカードのCardNum（BattleScreenでON_HAND_DISCARDEDトリガー検出用）
  hand_discarded_just?: string[] | null;
  // このプレイヤーから見て対戦相手の場に【ウィルス】が置かれた/取り除かれた直後にセット
  // （BattleScreenでON_OPP_VIRUS_REMOVED / ON_OPP_VIRUS_CHANGEDトリガー検出用。複数個の同時増減でも1回扱い）
  opp_virus_placed_just?: boolean | null;
  opp_virus_removed_just?: boolean | null;
  // OPP_MAIN_PHASE_LIMIT_DOWN: 次の自ターンMAINフェイズ開始時に適用するリミット修正
  pending_lrig_limit_mod?: number;
  // OPP_SIGNI_ATTACK_COST: 自シグニのアタックに支払う無色コスト枚数（エナ消費）
  signi_attack_cost?: number;
  // MULTI_DAMAGE_ON_LRIG_ATTACK: このターン残りN回ルリグアタックできる（1回目は通常アタック扱い）
  lrig_attack_remaining?: number;
  // このターン既にルリグがアタックした（ON_ATTACK_LRIG効果でアップされても再アタック不可）
  lrig_has_attacked?: boolean;
  // ライドシステム：LRIGが現在乗っている乗機シグニのCardNum一覧（ターン終了時にクリア）
  lrig_riding_signi?: string[];
  // SUPPRESS_CENTER_ON_PLAY: このターン自分のセンタールリグの【出】効果は発動しない
  suppress_center_on_play?: boolean;
  // CRASH_TO_TRASH_INSTEAD: このターン相手のライフクロスがクラッシュされた場合エナではなくトラッシュへ
  crash_to_trash_instead?: boolean;
  // SET_NEXT_LIFE_CRASH_COUNTER: 自分のライフがクラッシュされたとき、相手のライフを perTrigger 枚クラッシュし返す（remaining回まで）。
  // 防御用カウンタークラッシュ（WX25-P1-004 アーツ / WXDi-P12-030 アシストルリグ）。ターン終了時にクリア。
  life_crash_counter?: { remaining: number; perTrigger: number };
  // NEGATE_NTH_ATTACK: このターン、相手シグニアタックをN回目まで自動無効化する残り回数
  negate_opp_signi_attacks_until?: number;
  // NEGATE_ALL_OPP_EFFECTS: このターン、自分のCONTINUOUS効果は何もしない（相手が効果無効化）
  all_cont_effects_negated?: boolean;
  // BANISH_BY_SELF_GOES_TO_TRASH: このシグニによってバニッシュされたシグニはエナでなくトラッシュへ
  banish_to_trash_by_self?: string[];
  // GROW_COST_ZERO / CONDITIONAL_FREE_GROW: 次のグロウコストを0にする
  free_grow_this_turn?: boolean;
  // THIS_CARD_FROM_TRASH: トラッシュから場に出したシグニのインスタンスID。直後の【出】効果で
  // 「このシグニがトラッシュから場に出た場合」条件の判定に使う（WX03-034）。ターン開始時にクリア。
  signi_played_from_trash?: string[];
  // FREE_GROW_NEXT_TURN: 次の自分ターンのグロウコストを0にする予約（WX03-024-BURST）。
  // 自分ターン開始時に free_grow_this_turn へ移される。
  free_grow_next_turn?: boolean;
  // このターンに効果（execDraw 経由）で引いた累計枚数。ドローフェイズのドローは含まない。
  // 「このターンに効果によってカードをN枚以上引いていた場合」条件（CARDS_DRAWN_BY_EFFECT）用。ターン終了時に0へリセット。
  cards_drawn_by_effect_this_turn?: number;
  // REPLACE_PLUS_N: このターン、相手シグニへの正のパワー修正を負に置換する
  replace_opp_power_plus?: boolean;
  // COIN_USE_RESTRICTION: コイン使用先制限（'spell_signi_only'=スペルとシグニにしか使えない）
  coin_use_restriction?: string;
  // NEGATE_COIN_ABILITY: このターン、このプレイヤーはコイン能力（ベット）を発動できない
  negate_coin_abilities?: boolean;
  // MULTI_ACCE_LIMIT: このシグニには複数のアクセを付けられない（最大1個）
  multi_acce_limit?: boolean;
  // CENTER_LRIG_COLOR_CHANGE_BLACK: このターン、センタールリグが追加で得た色（ACTIVATED効果）
  lrig_extra_colors?: string[];
  // ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE: このゲーム中全センタールリグが得たタイプ
  lrig_gained_types?: string[];
  // GRID_REVEAL_PLUS: このターン、デッキ公開枚数+1できる
  grid_reveal_plus_one_this_turn?: boolean;
  // DECK_SIGNI_LEVEL_OVERRIDE: このターン、指定クラスのデッキシグニのレベルをN扱い
  deck_signi_level_override?: { class: string; level: number };
  // REDUCE_PLAY_ABILITY_COST: 次の【出】能力コスト軽減（color×count）
  reduce_next_on_play_cost?: { color: string; count: number };
  // OPTIONAL_DISCARD_GUARD: 手札から任意カードを捨ててガード可能フラグ
  optional_discard_guard_enabled?: boolean;
  // COIN_SPEND_CONDITION: ターン終了時にコイン消費チェックが必要なシグニinstanceId一覧
  coin_condition_signi_instances?: string[];
  // GAIN_ABILITY_THIS_GAME で付与されたゲーム全体フラグ（ターンリセット対象外）
  game_suppress_lb?: boolean;       // WXK08-028: このゲーム、ライフバーストは発動しない
  game_main_draw?: boolean;         // WXDi-P11-004: メインフェイズ開始時、手札5枚以下ならドロー
  game_grow_draw?: boolean;         // WX24-P4-036: グロウしたとき1枚ドロー
  game_hand_size_bonus?: number;    // WX25-P2-005: 手札上限増加
  game_energy_phase_draw?: boolean; // WX25-P2-005: エナフェイズ開始時1枚ドロー
  game_no_coin_gain?: boolean;                     // WXDi-P07-006: このゲームコイン獲得禁止
  game_opp_extra_guard_hand_or_colorless?: number; // WXDi-P05-005: 相手ガード時追加コスト（手札N枚か《無》）
  game_guard_alt_hand?: number;                    // WXDi-P06-006: ガード代替（手札N枚捨て）
  game_turn_end_trash_to_hand?: { class: string; count: number }; // WXDi-P04-006: ターン終了時トラッシュ→手札
  game_grow_phase_limit_plus?: number;             // WXDi-P11-010A: グロウフェイズ開始時リミット+N（累積）
  game_lrig_limit_bonus?: number;                  // ゲーム通じて累積するリミット増加量（リセット対象外）
  limit_upper_token?: boolean;                     // 【リミットアッパー】トークン（ルリグゾーンに1つまで・リセット対象外。ルリグ1体かつレベル3以上でリミット+2）
  game_declared_signi_level_zero?: boolean;        // WXK09-001: 宣言シグニのレベルを0に
  game_declared_signi_ignore_restriction?: boolean; // WXK09-001: 宣言シグニの限定条件無視
  // GRANT_ABILITY_INNER_TEXT で付与されたルリグ能力（ターンリセット対象外の持続効果）
  lrig_opp_act_cost_plus?: number;                 // WXDi-P15-033: 相手起動能力コスト増加
  lrig_attack_phase_power_down_per_signi?: number; // WX24-P2-030: アタックフェイズ中の相手パワーダウン
  opp_signi_energy_to_deck_bottom?: boolean;       // WX25-CP1-003: 相手シグニのエナ→デッキ下
  lrig_copy_opp_level_limit?: boolean;             // WXK03-003A: ルリグのレベル・リミットを相手センタールリグからコピー
  lrig_activation_count?: { [cardNum: string]: number }; // WXK03-003A: 特定ルリグ起動能力の使用回数
  flip_attack_signi_zones?: number[];              // WXDi-P05-069: フリップアタックで裏向きにしたゾーン番号
  // TRASH_AT_TURN_END: ターン終了時にフィールドからトラッシュに置くカードのインスタンスID一覧
  turn_end_field_trash_targets?: string[];
  // NEGATE_SPELL: このターン、このプレイヤーのスペル（コスト合計5以下）が打ち消される
  spell_negated_this_turn?: boolean;
  // GRANT_NEXT_SPELL_UNCOUNTERABLE: 次にこのプレイヤーが使用するスペルは対戦相手の効果で打ち消されない（WX04-008 ファフニール）
  next_spell_uncounterable?: boolean;
  // COST_REDUCTION(スペル/UNTIL_END_OF_TURN): 次に使用するスペルの使用コストを軽減（WX04-008《白×2》減）。スペル使用時に消費
  next_spell_cost_reduction?: { color: string; count: number }[];
  // DISONA_RESTRICTION: このターンに《ディソナアイコン》ではないスペルを使用した（使用条件チェック用）
  non_dissona_spell_played_this_turn?: boolean;
  // DISONA_RESTRICTION: このターン、《ディソナアイコン》ではないスペルを使用できない
  dissona_only_spells_this_turn?: boolean;
  // GRANT_TURN_TRIGGER_3RD_DOWN: このターン植物シグニが3回目ダウン時に効果を発動する
  turn_trigger_3rd_plant_down?: boolean;
  // このターンの植物シグニダウン回数（GRANT_TURN_TRIGGER_3RD_DOWN用）
  turn_plant_down_count?: number;
  // OPP_LRIG_LOSE_ABILITY: このターン、このプレイヤーのルリグは能力を失う（相手がカットイン発動）
  lrig_abilities_disabled?: boolean;
  // このターンに手札を捨てた枚数の累計（BANISH_IF_DISCARDED_3_THIS_TURN等で参照）
  turn_hand_discarded_count?: number;
  // v0.278: discardVariable コスト支払いで捨てたカードのレベル合計（WDK13-011用）
  last_activated_discard_level_sum?: number;
  // v0.278: WX25-P2-001 GAIN_ABILITY_THIS_GAME で付与されるゲーム全体フラグ
  // 【ルリグバリア】【シグニバリア】は field.free_zone にトークンカードとして設置する
  // （旧 lrig_barrier / signi_barrier 数値カウンタは廃止。execUtils の barrier ヘルパー参照）
  game_guard_barrier_act?: boolean;      // 手札ガードシグニ捨て→ルリグバリア付与 能力を持つ
  game_opp_guard_extra_colorless?: boolean; // 相手ガード時に追加で《無》1枚必要（このゲーム）
  // ON_ATTACK_SIGNI解決後のバトル解決待ち（zoneIndex: アタックしたゾーン番号）
  pending_signi_battle?: { zoneIndex: number };
  // ON_ATTACK_LRIG解決後にlrig_attacked: trueをセット待ち（防御側IDを保持）
  pending_lrig_attack?: boolean;
  // UPKEEP_OR_NO_UP: 次の自分のUPフェーズにルリグアップ条件（条件未達でセンタールリグはアップしない）
  // 'pay_colorless1': 《無》1枚支払わないかぎりアップしない
  // 'pay_colorless3': 《無》3枚支払わないかぎりアップしない
  // 'discard_or_colorless1': 手札1枚捨てるか《無》1枚支払わないかぎりアップしない
  lrig_upkeep_condition?: 'pay_colorless1' | 'pay_colorless3' | 'discard_or_colorless1';
  // DISCARD_BY_POWER_MATCH: 起動コスト支払い後に捨てたシグニのパワーを記録（次のexecStub呼び出しで参照）
  last_discarded_signi_power?: number;
  // BET_CONDITION: このアーツ/効果でベット宣言していた場合 true（execStub内でチェック）
  is_betting_this_effect?: boolean;
  // FUTURE SESSION③: 次のアタックフェイズ開始時にプリオケシグニへアタック時トラッシュ能力を付与
  pending_prioke_attack_trash_grant?: boolean;
  // PR-Di035: 次のアタックフェイズ開始時にプリパラ共通色・レベル3種類チェックして色別効果
  pending_pridi035_paradise?: boolean;
  // NEGATE_ATTACK_ON_TRIGGER: アタックを無効にする（WXDi-P11-055）
  cancel_current_signi_attack?: boolean;
  // BANISH_SUBSTITUTE (F-3): バトルバニッシュの任意身代わり置換。防御側で対話待ち中の情報。
  // 攻撃側のバトル解決はこのフラグが立つ間 victim バニッシュを保留し、防御側の決定（banish_substitute_choice）後に再開する。
  // options は collectBanishSubstitutes の BanishSubstituteOption[]（sacrifice=別シグニを犠牲 / pay_cost=コスト払いで victim を残す）。
  pending_banish_substitute?: { victimNum: string; options: BanishSubstituteOptionState[] };
  // BANISH_SUBSTITUTE 防御側の決定。option=null は「身代わりしない（通常バニッシュ）」。
  banish_substitute_choice?: { victimNum: string; option: BanishSubstituteOptionState | null };
}

export interface GameLog {
  timestamp: string;
  user_id: string;
  action: string;
  detail?: string;
}

export interface PendingSpell {
  caster_id: string;   // スペルを発動したプレイヤーのID
  card_num: string;    // 発動中のスペルカード番号
  from_lrig_deck?: boolean; // ルリグデッキからの発動（フェゾーネマジック等スペル/クラフト）
}

// ===== 効果エンジン インタラクション定義 =====

export type TargetScope =
  | 'self_field' | 'opp_field' | 'both_field'  // both_field: 自分・対戦相手の両シグニゾーン（「対象のシグニ」owner:'any'）
  | 'self_hand'  | 'opp_hand'
  | 'self_trash' | 'opp_trash'
  | 'self_energy'| 'opp_energy';

import type { EffectAction } from './effects';

export type PendingInteractionDef =
  | {
      type: 'SELECT_TARGET';
      candidates: string[];       // 選択可能なCardNum一覧
      count: number;
      optional: boolean;
      targetScope: TargetScope;
      thenAction: EffectAction;   // 選択後に実行するアクション（各カードに適用）
      continuation?: EffectAction;
      opponentResponds?: boolean; // true = 相手プレイヤーが選択するインタラクション（例:「対戦相手は手札を1枚捨てる」）
      totalPowerMax?: number;     // 「パワーの合計がN以下になるように好きな数」: 選択カードの実効パワー合計の上限
      candidatePowers?: Record<string, number>; // 各候補の実効パワー（totalPowerMax 判定・UI用）
    }
  | {
      type: 'SEARCH';
      visibleCards: string[];     // デッキ公開カードのCardNum一覧
      maxPick: number;
      thenAction: EffectAction;   // ピックしたカードに対するアクション
      afterAction?: EffectAction; // 完了後のアクション（通常はSHUFFLE_DECK）
      restDest?: 'deck_bottom' | 'trash' | 'energy'; // 未ピックカードの行き先（REVEAL_PICK_HAND_SHUFFLE_BOTTOM用）
      continuation?: EffectAction;
    }
  | {
      type: 'CHOOSE';
      options: Array<{ id: string; label: string; action: EffectAction; available: boolean; costColors?: string[] }>;
      count: number;
      continuation?: EffectAction;
      opponentResponds?: boolean; // true = 対戦相手が選択するインタラクション（例:「対戦相手は支払ってもよい」）
      multiSelect?: boolean;       // true = count > 1 の複数選択UI
      upTo?: boolean;              // true = 「N個まで」選択可（0個も可）
    }
  | {
      type: 'LOOK_AND_REORDER';
      cards: string[];
      canTrash: boolean;
      destLocation: 'deck';
      destOwner: 'self' | 'opponent';
      destPosition: 'top' | 'bottom' | 'any' | 'first_top_rest_bottom';
      private: boolean;       // true=自分だけ見る（見る）/ false=両者公開（公開する）
      continuation?: EffectAction;
    }
  | {
      type: 'SELECT_ZONE';
      cardNum: string;          // 場に出すカードのCardNum（instance ID含む）
      owner: 'self' | 'opponent';
      continuation?: EffectAction;
    }
  | {
      type: 'SELECT_SIGNI_ZONE';
      cardNum: string;          // 場に出すカード（ソースから除去済み）
      owner: 'self' | 'opponent';
      asDown?: boolean;
      continuation?: EffectAction;
    }
  | {
      type: 'SELECT_VIRUS_ZONE';
      owner: 'self' | 'opponent';  // ウィルスを置くフィールドの持ち主（効果オーナー視点）
      virusCount: number;          // 選択ゾーンに置くウィルス数（通常1）
      remainingZones: number;      // 残り選択ゾーン数
      upTo?: boolean;              // true=「～つまで」（配置をやめられる）
      powerDeltaOnZone?: number;   // 選択ゾーンのシグニへのパワー修正。指定時はウィルス済みゾーンも選択可（WD19-009）
      continuation?: EffectAction;
    }
  | {
      type: 'DECLARE_BOND';
      deckCards: string[];       // デッキのCardNum一覧（全枚数表示）
      continuation?: EffectAction;
    }
  | {
      type: 'REVEAL_CARDS';      // カード群を閲覧専用で公開（「対戦相手の手札を見て」等の情報公開モーダル）
      cards: string[];           // 公開するカードのCardNum一覧
      title?: string;            // モーダル見出し
      continuation?: EffectAction;
    };

export interface PendingEffect {
  sourcePlayerId: string;   // 効果オーナーのプレイヤーID（effectExecutorのownerState用）
  respondPlayerId?: string; // UIに応答するプレイヤーID（省略時=sourcePlayerId。対戦相手が選ぶ場合は相手ID）
  sourceCardNum: string;
  effectId: string;
  interaction: PendingInteractionDef;
}

// ===== 効果スタック =====

export interface StackEntry {
  id: string;                                  // UUID（並び替えキー）
  playerId: string;                            // 効果オーナーのプレイヤーID
  cardNum: string;
  effectId: string;
  label: string;                               // 表示用 e.g. "サーバント O の【自】効果"
  effect: import('./effects').CardEffect;
  triggeringCardNum?: string;                  // any_ally/self scope で効果を引き起こしたカード番号（「それ」参照用）
}

export interface EffectStack {
  turnPlayerId: string;         // 現在ターンのプレイヤーID
  pendingTurn: StackEntry[];   // ターンプレイヤーの整列待ち効果
  pendingOpp:  StackEntry[];   // 相手の整列待ち効果
  orderTurnDone: boolean;      // ターンプレイヤーが順序を確定した
  orderOppDone:  boolean;      // 相手が順序を確定した
  queue: StackEntry[];          // 解決待ちキュー（確定後）
}

export interface BattleStateRow {
  room_id: string;
  host_id: string;
  guest_id: string;
  global_phase: 'SETUP' | 'PLAYING' | 'FINISHED';
  setup_phase: 'LRIG_SELECT' | 'JAN_KEN' | 'MULLIGAN' | null;
  turn_phase: TurnPhase;
  active_user_id: string | null;
  turn_count: number;
  host_state: PlayerState;
  guest_state: PlayerState;
  game_logs: GameLog[];
  updated_at: string;
  host_lrig_selected: string | null;
  guest_lrig_selected: string | null;
  host_janken: string | null;
  guest_janken: string | null;
  host_mulligan_done: boolean;
  guest_mulligan_done: boolean;
  first_player_id: string | null;
  pending_spell: PendingSpell | null;
  pending_effect: PendingEffect | null;
  effect_stack: EffectStack | null;
  winner_id: string | null;
  host_end_ack: boolean;
  guest_end_ack: boolean;
}

// ルリグデッキに入るカードタイプ
export const LRIG_TYPES = ['ルリグ', 'アーツ', 'キー', 'ピース', 'リレーピース', 'レゾナ', 'アシストルリグ'];

export const isLrigCard = (card: CardData) => LRIG_TYPES.includes(card.Type);
