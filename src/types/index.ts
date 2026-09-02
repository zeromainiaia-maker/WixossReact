export type ViewMode = 'LOGIN' | 'START' | 'DECK_LIST' | 'DECK_EDITOR' | 'MATCHMAKING' | 'BATTLE';

export * from './effects';

/** 次のターンに有効化される、場のシグニへ動的に適用する継続効果。 */
export type FieldGrantCondition =
  | { type: 'FRONT_SIGNI_HAS_CHARM' }
  /**
   * 🆕**その正面のシグニのパワーがN以上であるかぎり**（2026-08-31 続き749・`WD15-007-E1`
   * 「このターン、あなたのシグニは、**その正面のシグニのパワーが12000以上であるかぎり**、【アサシン】を得る」）。
   * 🔑**per-signi の付与ではなく場レベル grant で持つ**＝原文の括弧書き「このアーツの後に場に出たシグニも
   *   この効果の影響を受ける」がそのまま効き、正面のパワーが変われば毎回評価し直される。
   */
  | { type: 'FRONT_SIGNI_POWER_GTE'; value: number };

export type FieldGrant =
  | {
      kind: 'keyword';
      keyword: string;
      filter?: import('./effects').TargetFilter;
      zone?: number;
      condition?: FieldGrantCondition;
    }
  | {
      kind: 'power';
      /** 固定 delta。`perTargetLevel` を付けたときは**レベル１につきの単価**になる。 */
      delta: number;
      /**
       * 動的 delta（§6.4 O-16(a)）＝「指定されたシグニゾーンにあるシグニのパワーを**そのシグニの
       * レベル１につき**±N」。適用のたびに**その時点でそのゾーンにいるシグニ自身**の実効レベル
       * （表記レベル＋`temp_level_mods`）を `delta` に掛ける。
       * ⚠**適用時に固定 delta へ焼き込んではいけない**＝ゾーン継続なので、後からそのゾーンへ出た
       *   別レベルのシグニには**そのシグニのレベル**が効く（焼き込むと最初の1体のレベルが居座る）。
       */
      perTargetLevel?: boolean;
      filter?: import('./effects').TargetFilter;
      zone?: number;
      condition?: FieldGrantCondition;
      srcType?: string;
      srcCardNum?: string;
    }
  | {
      /**
       * 場／ゾーンレベルの能力喪失（§6.4 O-16）。「（指定した）シグニゾーンにあるシグニは能力を失い、
       * 新たに得られない」＝**そのゾーンに現在／将来いるシグニ**が対象。
       * ⚠per-card の `abilities_removed` とは別物＝あちらは「適用時点でそこにいたシグニ」を instanceId で
       *   記録するので、**後からそのゾーンへ出たシグニには効かない**。原文が
       *   「このアーツの使用後に場に出たシグニはこの効果の影響を受けない」と明記する札は per-card 側が正しい。
       */
      kind: 'abilityLoss';
      filter?: import('./effects').TargetFilter;
      zone?: number;
      condition?: FieldGrantCondition;
    }
  | {
      /**
       * 場／ゾーンレベルの行動禁止（§6.4 O-16）。「対戦相手は**そのシグニゾーンにある**シグニでアタックできない」。
       * ⚠per-signi の付与（`keyword_grants['アタックできない']`）は**その時点でそこにいたシグニ**にしか
       *   効かない＝ゾーンを封じる原文の意図（後から出たシグニも撃てない）が表せない。
       * 消費は `calcContinuousBlockedActions` の `cannotAttackSigni`＝**人間UI／共通実行経路／CPU の3箇所が
       *   通る唯一の funnel**（`signiAttackGate.ts` 参照）。
       */
      kind: 'blockAction';
      actionId: 'ATTACK';
      filter?: import('./effects').TargetFilter;
      zone?: number;
      condition?: FieldGrantCondition;
    };

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
  | { kind: 'pay_cost'; sourceNum: string; costType: 'discardSpell' | 'trashStackSpell' | 'lifeCrash'; amount: number }
  /**
   * 🆕§5.3 `O-58` 段2（2026-09-02）＝**victim に付いている【チャーム】1枚をトラッシュして回避**
   * （`WX04-052-E1`「あなたの＜悪魔＞のシグニ１体がバニッシュされる場合、代わりにそのシグニに付いている
   * 【チャーム】１枚をトラッシュに置いて**もよい**」）。
   * ⚠**任意**なので選択肢として出す（旧は防御側の ladder が無条件で自動適用していた＝
   *   「チャームを残す」選択肢が player から奪われていた）。
   */
  | { kind: 'trash_charm'; sourceNum: string; charmNum: string; zoneIndex: number }
  /**
   * 🆕§5.3 `O-58` 段2（2026-09-02）＝**victim に付いている【アクセ】をゲームから除外して回避し、
   * そのシグニをダウンする**（`WXDi-P09-TK03A-E1`「代わりにこれをゲームから除外してもよい。
   * そうした場合、そのシグニをダウンする」）。
   * 🔴**行き先はトラッシュではなくゲーム外**（障害③＝防御側の実装がログと食い違っていた）。
   */
  | { kind: 'exile_acce'; sourceNum: string; acceNum: string; zoneIndex: number };

/**
 * シグニを新たに配置できないシグニゾーン1件（タスク12(lxi) 第10波）。
 * colorless 未指定＝無条件で配置不可（「シグニゾーン１つを消す」「新たに配置することができない」）。
 * colorless=N＝「《無》×N を支払わないかぎり配置できない」＝支払えば配置できる（WXDi-P11-009-E3）。
 */
export interface SigniZoneBlock {
  zone: number;
  colorless?: number;
}

/**
 * 「このターンと次のターンの間、対戦相手は〈条件〉のシグニを新たに場に出せない」1件（§6.4 O-3）。
 *
 * ⚠**禁止を受ける側（＝場に出す側）の state に載せる**＝判定は `deployLimitBlockReason` の1本に集約する
 *   （通常召喚UI／召喚ゾーンモーダル／CPU 召喚／engine の効果配置の**すべて**がこの funnel を通る）。
 * ⚠寿命は**グローバルターン数のカウントダウン**＝`clearTurnEndScopedState` が両プレイヤー分を1減らし0で捨てる。
 *   `_this_turn` 命名の1ターン失効では表せない（「このターンと次のターン」＝2ターン）。
 */
export interface SigniDeployBan {
  /** 残りグローバルターン数。2＝「このターンと次のターンの間」。ターン終了ごとに1減り、0で失効する。 */
  turnsRemaining: number;
  /** このカード名のシグニだけを禁止する（「それと同じ名前のシグニ」＝名前は生成時に焼き込む）。 */
  cardNames?: string[];
  /** このパワー以上のシグニだけを禁止する（「パワーN以上のシグニを新たに場に出せない」）。 */
  powerGte?: number;
  /** この出自の配置だけを禁止する。'signi_or_spell_effect'＝「自分の、シグニとスペルの効果によって」。 */
  bySource?: 'signi_or_spell_effect';
  /** ログ表示用の由来。 */
  label?: string;
}

/**
 * 「このターン、対戦相手は〈条件〉のシグニでアタックできない」1件（§6.4 O-3）。
 *
 * 絞り込みキーは **AND** で、**指定されたキーだけ**を見る＝キーを1つも持たない ban は
 * 「すべてのシグニがアタックできない」を意味する（原文にその形がある）。
 *
 * ⚠`unlessPayColorless` は「支払えばアタックできる」＝**払えないときだけ禁止**。
 *   支払いは `performSigniAttack` が実際に引き落とす（判定と引き落としを別軸にしない）。
 * ⚠`powerDiffersFromPrinted` と `unlessPayColorless` を同時に持たせない
 *   （引き落とし地点は実効パワーを持っていないので、表記パワーへフォールバックして誤課金になる）。
 *   golden のトリップワイヤで固定してある。
 */
export interface SigniAttackBan {
  /**
   * 'LRIG'＝**ルリグのアタック**に掛かる ban（「それは「【常】：《無》×Nを支払わないかぎりアタックできない。」を得る」
   * の対象がルリグだった場合＝§6.4 O-28）。省略＝シグニのアタックに掛かる。
   *
   * ⚠**両方向にガードする**＝`signiAttackGate` は `appliesTo==='LRIG'` を**除外**し、
   *   `lrigAttackBanCost` は `appliesTo==='LRIG'` **だけ**を見る。
   *   `cardNums` の一致だけに頼ると、キーを持たない広域 ban（「シグニでアタックできない」）が
   *   ルリグにも掛かる無言の過剰実行になる。
   */
  appliesTo?: 'LRIG';
  /** このレベルのシグニだけを禁止する（「宣言された数字と同じレベルのシグニ」＝宣言値は生成時に解決して焼き込む）。 */
  level?: number;
  /** 実効パワーが表記パワーと異なるシグニだけを禁止する。 */
  powerDiffersFromPrinted?: boolean;
  /** この CardNum のシグニだけを禁止する（「それはアタックできない」）。 */
  cardNums?: string[];
  /**
   * この CardNum のシグニ**以外**を禁止する（「選んだシグニ以外のシグニでアタックできない」＝
   * `WXDi-P08-030-E1`・§6.4 O-3）。⚠`cardNums` の否定＝**新しく場に出たシグニにも掛かる**
   *   （選ばれていないので除外リストに載らない）＝原文どおり。
   */
  exceptCardNums?: string[];
  /** 《無》×N を支払えばアタックできる。払えないときだけ禁止になる。 */
  unlessPayColorless?: number;
  /**
   * 手札をN枚捨てればアタックできる（「手札をN枚捨てないかぎりアタックできない」）。
   * ⚠**アタックするごとに**払う（1回きりの `negated_attacks_escape` とは別物）＝ban は消費しない。
   */
  unlessPayHandDiscard?: number;
  /**
   * 残りグローバルターン数（§6.4 O-4／O-33）。省略＝**そのターンだけ**（従来どおり turn-end で消える）。
   * 2＝「次の対戦相手のターン（終了時まで）」＝`SigniDeployBan` と同じカウントダウン規約で、
   * 減算は `clearTurnEndScopedState` の1点だけ。
   * ⚠🔴この軸が無かったので「次の対戦相手のターンの間」の3効果は期間ごと落ち、
   *   支払い回避も落ちて**両プレイヤーのシグニが無条件でアタック不可**になっていた。
   */
  turnsRemaining?: number;
  /**
   * **このシグニゾーンにあるシグニだけ**を禁止する（§6.4 O-33）。ゾーン添字は所有者から見た表示順＝
   * left=0 / center=1 / right=2（`TargetFilter.centerZoneOnly` / `zoneSide` と同じ規約）。
   * 省略＝ゾーンを問わない（従来どおり）。
   * ⚠🔴この軸が無かったので「中央のシグニゾーンにあるシグニでアタックできない」3効果は
   *   ゾーン限定ごと落ち、**全ゾーンのシグニ**が止まっていた（`WX24-P1-038-E2`／`WXDi-P03-027-E2` は
   *   さらに `owner:'any'` で**両プレイヤー**が止まっていた）。
   * ⚠判定は `banMatches` の1点＝アタッカー側 state のゾーン添字を引く（`appliesTo:'LRIG'` の
   *   ルリグ判定ではゾーンが取れないので、`zones` を持つ ban はルリグには掛からない＝過少側）。
   */
  zones?: number[];
  /**
   * **動的**ゾーン限定（§6.4 O-33 の据置分・続き508）＝「【ゲート】があるシグニゾーンにあるシグニで
   * アタックできない」（`WDK09-001-E2`）。判定地点（`banMatches`）で**禁止を受ける側の
   * `signi_gate_zones`** を引く＝ban を張ったあとに【ゲート】が増減しても追随する。
   * ⚠`zones` と同時に持たない。
   */
  zoneSource?: 'gate';
  /** ログ・アタックボタンに出す由来表示。 */
  label?: string;
}

export interface PlayerState {
  deck: string[];
  lrig_deck: string[];
  hand: string[];
  life_cloth: string[];
  trash: string[];
  lrig_trash: string[];
  /** ゲームから除外されたカード。通常のゾーン探索・リフレッシュ対象には含めない。 */
  excluded?: string[];
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
    assist_lrig_l_frozen?: boolean; // true=左アシストルリグが凍結中（次のアップフェイズにアップせず解除）
    assist_lrig_r_frozen?: boolean; // true=右アシストルリグが凍結中（次のアップフェイズにアップせず解除）
    check?: string | null;
    /**
     * 🆕**チェックゾーンに「留まっている」カード**（§5.3 `O-143`・2026-08-29）。
     * 🔴`check` は**ライフバースト確認中の1枚**専用のスロット**（`LifeBurstCheckModal` の表示条件・
     *   `BattleScreen` の各種ブロック条件がここを見る）で、後続は `pending_crashed_cards` が待つ。
     *   ⇒ 効果で置かれてターン終了まで**留まる**カードをそこへ入れると、バースト確認モーダルが
     *   誤って開いて盤面が固まる。**別スロットに置く**（`key_piece` / `key_piece_extra` と同じ規約）。
     * ⚠**「チェックゾーンにあるカード」を数える／探すときは必ず `checkZoneCards()` を通す**
     *   （`check` と両方を見る。片方だけ見ると原文の枚数と合わない）。
     * ⚠ターン終了時にトラッシュへ送られる（原文の括弧書き＝`clearTurnEndScopedState`）。
     */
    check_rest?: string[];
    key_piece?: string | null;
    key_piece_extra?: string[];  // UNLIMITED_KEYS: 2枚目以降のキー/ピース
    signi_charms?: (string | null)[]; // [zone0, zone1, zone2] チャームカードのCardNum or null
    /**
     * [zone0, zone1, zone2] **裏向きで付けられたカード**（§5.3 `O-81`・`WX16-003-E2`
     * 「それにあなたの手札からカード１枚を裏向きで付ける」）。未装着は null。
     * ⚠**【チャーム】ではない**＝原文が【チャーム】と書いていないので `signi_charms` とは別ゾーンに置く
     *   （混ぜると `hasCharm`／`CHARM_COUNT`／`ON_CHARM_TO_TRASH`／`IS_SELF_CHARMED` が
     *   軒並み過剰発火し、同じシグニに【チャーム】と併存できなくなる）。
     * 🔑ホストが場を離れると `removeFromField` が**公開して持ち主の手札へ戻す**（トラッシュではない）。
     */
    signi_facedown_attached?: (string[] | null)[];
    signi_acce?:   (string[] | null)[]; // [zone0, zone1, zone2] 各ホストに付いた全アクセのCardNum配列。未装着はnull
    signi_virus?:  number[];          // [zone0, zone1, zone2] ウィルス数（0 or 1）
    signi_chokkin?: number[];         // [zone0, zone1, zone2] 貯菌カウンター数
    signi_soul?:   (string | null)[]; // [zone0, zone1, zone2] ソウルカードのCardNum（場を離れるとlrig_trashへ）
    signi_traps?:       (string | null)[]; // [zone0, zone1, zone2] 裏向きトラップのCardNum（設置済み・未発動）
    signi_magic_boxes?: (string | null)[]; // [zone0, zone1, zone2] 【マジックボックス】のCardNum（裏向き設置中）
    signi_seeds?:  (string | null)[]; // [zone0, zone1, zone2] 【シード】のCardNum（設置済み・未開花）
    facedown_signi?: (string | null)[]; // [zone0, zone1, zone2] 裏向きでシグニゾーンに置かれたカード（WXDi-P10-034）。表向きにするまで inert（パワー/能力/アタック無し・場のシグニとして扱わない）。次の自メインフェイズ開始時に表向き分岐（pending_facedown_flip）
    signi_armor?:  boolean[];         // [zone0, zone1, zone2] true=血晶武装状態（場を離れるまで維持）
    puppet_signi?: string[];          // 傀儡状態でこの場に出ている（持ち主＝対戦相手の）シグニのインスタンスID。場を離れると持ち主のトラッシュへ回収される（WDK17-007）
    free_zone?:    string[];          // フリーゾーン（チアガール等を置く汎用ゾーン）
    beat_zone?:    string[];          // ビートゾーン（ターン終了時にトラッシュへ、UIはフリーゾーンと共有）
    cross_state?:  boolean[];         // [zone0, zone1, zone2] true=クロス状態
    heaven_state?: boolean[];         // [zone0, zone1, zone2] true=このターンヘブンヘブン済み
  };
  actions_done?: string[];      // このターンに使用済みのアクション（ターン開始時にリセット）
  /**
   * 直前の離脱で `signi_facedown_attached` から**公開して手札に戻したカード**（§5.3 `O-81`）。
   * `signi_zone_vacated_just` と同種の**使い捨てマーカー**＝`removeFromField` が毎回 set/クリアするので
   * 「いま起きた離脱で公開されたもの」だけを指す。ON_LEAVE_FIELD watcher の
   * `FACEDOWN_REVEALED_JUST` 条件と `levelEqFacedownRevealed` フィルタが**収集時に**読む
   * （解決時まで持ち越すと後続の離脱でクリアされて外れるため）。
   */
  facedown_revealed_just?: string[];
  /** 場に出た後、ターン終了時または場を離れた直後に除外するカードの instance id。 */
  pending_exile_nums?: string[];
  refresh_count_this_turn?: number; // このターン中にこのプレイヤーが行ったリフレッシュ回数（ターン開始時にリセット。ターンプレイヤーが2回目でターン終了）
  game_actions_done?: string[]; // ゲーム通じて使用済みのアクション（once_per_game追跡、ターンリセット対象外）
  last_activated_discard_count?: number; // 直前【起】コスト支払いで捨てた合計枚数（手札+エナ）。ACTIVATED_DISCARD_COUNT_GTE条件用
  last_energy_trash_color_count?: number; // 直前コスト(energyTrashColorAll)でエナからトラッシュした指定色カードの枚数。ENERGY_TRASH_COLOR_COUNT_GTE条件用（WX04-002-E2「この方法で赤が3枚以上」）
  last_charm_trash_count?: number; // 直前コスト支払いでトラッシュしたチャーム枚数（BanishFilter: levelEqualsVar用）
  last_lrig_down_level_sum?: number; // 直前のルリグダウン（コスト／効果）でダウンしたルリグのレベル合計。payLrigDownCost が記録
  // 直前のルリグダウン（コスト／効果）で実際にダウンしたルリグの instance id。「この方法でダウンしたルリグと同じ
  // レベル／共通する色」がコスト経路（＝実UIでは支払いと効果解決が別の ExecCtx に分かれ lastProcessedCards が
  // 渡らない）でも参照できるようにするための受け皿（タスク12(cix)）。payLrigDownCost が単一入口で記録する。
  last_lrig_down_cards?: string[];
  last_field_trash_level?: number; // 直前コスト支払いで場からトラッシュしたシグニのレベル（BanishFilter: levelEqualsVar='field_trash_level'用。WX03-001）
  last_cost_hand_to_energy_level?: number; // 直前の任意【出】コストで手札からエナへ置いたシグニのレベル（WXDi-P16-080）
  last_cost_energy_trash_level_sum?: number; // 直前の任意【出】コストでエナからトラッシュへ置いたシグニのレベル合計（WXK09-032）
  last_cost_energy_trash_count?: number; // 直前の指定 energyTrash コストで実際にトラッシュへ置いた枚数
  blocked_actions?: string[]; // カード効果で封じられたアクション
  blocked_card_names?: string[]; // このターン使用禁止のカード名（BLOCK_CARD_USE 効果）
  // 「**次の**対戦相手のターンの間、〜宣言されたカード名のスペルを使用できない」（§6.4 O-3・`PR-K046-E1`）。
  // ⚠自分のターン開始時に `blocked_card_names` へ昇格する（`activateTurnStartScopedState` の1点）。
  //   ⚠`blocked_card_names` に直接積むと**課したその場**（＝相手ターンではない）で効いてしまう。
  blocked_card_names_next_turn?: string[];
  blocked_card_names_game?: string[]; // このゲームの間使用禁止のカード名（NAME_BAN 効果。ターン境界でリセットしない）
  // 「このターン、対戦相手は宣言したカード名**以外**のアーツを使用できない」（§6.4 O-3・`WXEX2-09-E3`）。
  // ⚠blacklist ではなく **whitelist**＝空配列は「すべてのアーツが使えない」（undefined＝制限なしと区別する）。
  // 読みは `cardNameUseBlocked` の1点。
  arts_name_whitelist_this_turn?: string[];
  story_overrides?: Record<string, string>; // CardNum -> ゲーム中に変更されたStory（大本のCardDataは変えない）
  acce_choice?: Record<string, number>;     // アクセCardNum -> 装着時に選んだ付与能力のインデックス（SPK01-11 ラズベリー）
  // DECLARE_ZONE_FOR_CLASS_CHANGE: このプレイヤーが指定した領域（相手シグニがクラス/色を失い＜精元＞を得る）
  declared_class_zones?: Array<{ sourceCardNum: string; zone: 'deck' | 'hand' | 'signi' | 'trash' }>;
  pending_crashed_cards?: string[]; // ダブルクラッシュ等で同時クラッシュしたが未処理のカード番号（バースト処理待ち）
  /** 現在 check にあるクラッシュ札の発生源 instance id。未設定は従来どおり発生源不明。 */
  crash_source_card_num?: string;
  /** pending_crashed_cards と同じ添字で保持する発生源。null は発生源不明。 */
  pending_crash_source_card_nums?: Array<string | null>;
  /**
   * 現在 check にあるクラッシュ札の**原因キーワード**（§5.3 `O-120`・`'ランサー'` / `'Ｓランサー'`）。
   * 「あなたのシグニが【ランサー】によって対戦相手のライフクロスをクラッシュしたとき」の判定に使う。
   * 🔴**未設定＝原因不明**であり「通常のバトルダメージ」とは区別しない＝
   *   `triggerCondition.crashedByKeywords` を持つ効果は**未設定なら発火しない**（fail-closed）。
   * ⚠**書き手は `crash_source_card_num` と同じ地点に必ず揃える**＝片方だけ書くと
   *   前のクラッシュの原因が残って**別のクラッシュで誤発火**する。
   */
  crash_cause?: string;
  /** pending_crashed_cards と同じ添字で保持する原因キーワード。null は原因不明。 */
  pending_crash_causes?: Array<string | null>;
  // 効果エンジン用：ターン終了時にクリア
  // srcType: この修正の発生元カードの Type（'シグニ'/'スペル'/'アーツ'/'ルリグ'/'アシストルリグ'/'レゾナ' 等）。
  //   「あなたのシグニの効果で」（WX04-038-E1）等、発生元の種別を参照する効果のために保持する。
  //   includes() で照合する想定（'アシストルリグ'.includes('ルリグ') 等）。未設定はシグニ発生元として扱う（STUB系シグニ効果が大多数のため）。
  // cardNum=修正を受けた側／srcCardNum=修正を起こした効果元カード（ON_OPP_POWER_DECREASED の発生源限定
  //   「あなたの＜X＞のシグニの効果によって」の判定に使う。全書き込み経路では埋まらないため、
  //   **未設定＝発生源不明＝従来どおり発火**（過剰側に倒す）とし、部分実装が取りこぼし＝過少発火に化けないようにする）
  temp_power_mods?: Array<{ cardNum: string; delta: number; srcType?: string; srcCardNum?: string }>;
  // LEVEL_MODIFY: シグニのレベルを±する一時修正（UNTIL_END_OF_TURN）。fieldCandidates が実効レベルとして
  //   temp_power_mods と同様に適用（レベルフィルタ判定用）。ターン境界で temp_power_mods と共にクリア。
  temp_level_mods?: Array<{ cardNum: string; delta: number }>;
  // 次の対戦相手のターン終了時までの一時パワー修正（temp_power_modsの長期版。UNTIL_OPP_TURN_END）
  power_mods_until_opp_turn?: Array<{ cardNum: string; delta: number; srcType?: string }>;
  /**
   * 🆕**「次のあなたのターン終了時まで」のパワー修整**（2026-09-02・§5.3 `O-186`）。
   * ⚠**寿命はグローバルターン終了の残り回数（`turnEnds`）**＝`clearTurnEndScopedState` が毎回1減らし、
   *   0 になったエントリを落とす。`power_mods_until_opp_turn` の2スロット式では跨ぐ回数が足りない。
   * ⚠**`calcFieldPowers` に足すのを忘れない**（足さないと JSON に載るだけの死フラグになる）。
   */
  power_mods_until_next_own_turn?: Array<{ cardNum: string; delta: number; srcType?: string; srcCardNum?: string; turnEnds: number }>;
  /**
   * 🆕**「次のあなたのターン終了時まで」の能力喪失**（§5.3 `O-186`）＝cardNum → 残りターン終了回数。
   * ⚠**適用そのものは `abilities_removed` に載せる**（読み手はそこ1本）。この表は「延命」だけを担い、
   *   ターン終了時に生き残った分を `abilities_removed` へ書き戻す。
   */
  abilities_removed_until_next_own_turn?: Record<string, number>;
  // COST_INCREASE(NEXT_OPP_TURN): 「次の対戦相手のターン、対戦相手のアーツ/スペルのコストが《無×N》増える」。
  //   キャスター側へ保持し、相手ターンのコスト計算で「相手(=キャスター)のこのストア」を参照して加算する。
  //   power_mods_until_opp_turn と同じライフサイクルで自分の次ターン開始時にクリア。
  opp_cost_up_until_opp_turn?: Array<{ targetCardType: string; amount: { color: string; count: number }[] }>;
  keyword_grants?: Record<string, string[]>; // instanceId → ['ランサー', ...]
  keyword_grants_until_opp_turn?: Record<string, string[]>; // 次の対戦相手ターン終了時までの付与キーワード
  /** 次の対戦相手のターンの間だけ有効な全ゾーンLB付与（ディスペア）。
   * GRANT_ALL_ZONE_LIFEBURST 同型の StubAction を保持し、自分の次ターン開始時にクリアする。 */
  allzone_burst_grant_until_opp_turn?: import('./effects').StubAction;
  // 次の自分／対戦相手ターンに場のシグニへ動的適用する統一予約（キーワード・パワー）。
  // filter/zone/condition は active 中も毎回評価するため、予約後に場へ出たシグニにも適用される。
  field_grants_next_turn?: FieldGrant[];
  field_grants_next_opp_turn?: FieldGrant[];
  field_grants_active?: FieldGrant[];
  /** @deprecated 旧セーブ互換。読み側で無条件 keyword FieldGrant へ正規化する。 */
  field_keyword_grants_next_turn?: string[];
  /** @deprecated 旧セーブ互換。読み側で無条件 keyword FieldGrant へ正規化する。 */
  field_keyword_grants_next_opp_turn?: string[];
  /** @deprecated 旧セーブ互換。読み側で無条件 keyword FieldGrant へ正規化する。 */
  field_keyword_grants_active?: string[];
  // 《改造素材》がこの解決で使用された対象シグニ（instanceId）。MARK_MATERIAL_TARGET が記録し、
  // BattleScreen が ON_MATERIAL_USED（self/any_ally）発火後にクリアする（改造素材機構 Step3b）。
  material_used_targets?: string[];
  // デッキがシャッフルされた累積回数（execShuffleDeck がインクリメント）。BattleScreen が解決前後の差で
  // ON_DECK_SHUFFLED を発火（PR-470A）。⚠execShuffleDeck 経由のみ（リフレッシュのシャッフルは別経路で未計上）。
  deck_shuffled_count?: number;
  granted_effects?: Record<string, import('./effects').CardEffect[]>; // instanceId → 付与された CardEffect[]
  // 次の対戦相手のターン終了時までの付与効果（granted_effectsの長期版。UNTIL_OPP_TURN_END）
  granted_effects_until_opp_turn?: Record<string, import('./effects').CardEffect[]>;
  // このターンに自分のライフクロスがクラッシュされた枚数（LIFE_CRASHED_THIS_TURN 条件用。ターン開始時にリセット）
  life_crashed_this_turn?: number;
  /** Number of this player's life cloths crashed during the immediately preceding turn. */
  life_crashed_last_turn?: number;
  // このターンに「自分のどのシグニが対戦相手のライフクロスを何枚クラッシュしたか」（クラッシュした側＝攻撃側の
  // state に載る。ON_SIGNI_CRASHED_LIFE_TOTAL＝「このシグニが1ターンにライフクロスを合計N枚以上クラッシュ
  // したとき」用。キーは場のスタック頂点の表記（インスタンスIDの '#N' 付きもありうる）。ターン境界でリセット）。
  life_crashed_by_signi_this_turn?: Record<string, number>;
  /** This turn, cards in this player's energy zone are colorless and have no abilities. */
  energy_colorless_ability_loss_this_turn?: boolean;
  /** このターン、このプレイヤーのシグニ自身の【出】能力を収集しない。 */
  suppress_signi_on_play_this_turn?: boolean;
  // 強制攻撃フラグ（このターン、このプレイヤーのシグニは可能ならばアタックしなければならない）
  must_attack_signi?: boolean;
  // 次の自分のターン開始時に must_attack_signi へ昇格する予約
  must_attack_signi_next_turn?: boolean;
  // 強制攻撃を感染状態のシグニのみに限定する（WX16-047等）
  must_attack_infected_only?: boolean;
  // 次の自分のターン開始時に must_attack_infected_only へ昇格する予約
  must_attack_infected_only_next_turn?: boolean;
  /**
   * このターン、レベルがこの値以上の**アシストルリグ**でアタックできる（`ASSIST_LRIG_ATTACK_THIS_TURN`。
   * `WX25-P1-048`「このターン、あなたはレベル１以上のアシストルリグでアタックできる」）。
   * ⚠通常ルールではアシストルリグはアタックできない＝この値が入っているターンだけ例外的に許可される。
   * 判定は必ず `screens/battle/assistLrigAttack.ts` の1本を通す（人間UI／CPU／フェイズ進行の3経路共通）。
   */
  assist_lrig_attack_min_level?: number;
  /**
   * このターンに「エナゾーン**以外**」からエナコストを支払った枚数（`UNDER_CARD_AS_ENERGY_COST`＝
   * `WXDi-P10-041`「この方法でエナコストは１ターンに３つまでしか支払えない」の計数）。
   * 集計も控除も `screens/battle/energyPaySource.ts` の funnel 1本を通す。
   */
  turn_off_zone_energy_paid_count?: number;
  /**
   * いま宣言中のルリグアタックの**攻撃元カード**（`pending_lrig_attack` と対）。アシストルリグも
   * アタックしうる（続き427）ため「攻撃元＝センタールリグ」と決め打てなくなった。
   */
  pending_lrig_attack_num?: string;
  /** 自分が受けているルリグアタックの**攻撃元カード**（`field.lrig_attacked` と対）。未設定＝センター扱い。 */
  lrig_attacked_by_num?: string;
  /**
   * §5.3 `O-117`＝**直近の「カードの使用」で支払ったエナ1枚ごとの色集合**
   * （マルチエナは全5色・無色エナは空配列）。`PAID_COLORS_INCLUDE_ALL` が読む。
   * ⚠**書き手は `paidEnergyColorsOf`（`costs.ts`）1本**＝スペル経路とアーツ経路で式を割らない。
   * ⚠支払いのたびに**上書き**する（`last_cost_trashed_cards` と同じ規約）。ターン境界でも失効させる。
   */
  last_paid_energy_colors?: string[][];
  // アクティブなコスト修正（CostIncrease/CostReduction効果）
  cost_modifiers?: Array<{
    direction: 'increase' | 'decrease';
    targetCardType: string;
    amount: { color: string; count: number }[];
    until: 'END_OF_TURN' | 'NEXT_TURN' | 'PERMANENT';
  }>;
  /**
   * このターン、【側面アタック】でシグニのいない相手シグニゾーンを攻撃したとき「正面扱い」でダメージを
   * 与えられるシグニのクラス（`ARTS_ATTACK_EMPTY_ZONE_AS_FRONT`・`WX16-021`）。
   * 空文字＝クラス不問。ターン終了時にリセットする。
   */
  side_attack_empty_zone_damage_class?: string;
  // 能力消去されたシグニのCardNum一覧（**現在のターンだけ**有効。ターン終了時にクリア）
  abilities_removed?: string[];
  /**
   * 「ターン終了時まで、〜は**効果によって得ている能力**を失う」（§5.3 `O-130`／`WXK11-019-E2`・`SPK01-13` 選択肢⑤）。
   *
   * 🔴**`abilities_removed` とは別軸**＝あちらは**印刷能力ごと**すべて失わせる。この2効果を `abilities_removed` で
   *   表すと、原文が触れていない**印刷済みの【常】【自】【起】まで消える過剰実行**になる（実測＝旧 live は両方そう書いていた）。
   * 読みは `grantedStore.ts` の `grantedEffectsOf` 1本に集約する（付与ストアを読む地点が engine に散っているため）。
   * 寿命は `abilities_removed` と同じ turn-end（`turnScopedState.ts` に登録済み）。
   */
  granted_abilities_removed?: string[];
  /**
   * 「次のターンの間」能力を失うシグニの**予約**（§6.4 O-3）。
   *
   * ⚠`RemoveAbilitiesAction.until` は長らく engine から**一切読まれない死フィールド**で、
   *   `PERMANENT` も `UNTIL_OPP_TURN_END` も `NEXT_TURN` も全部「このターン終了時まで」に丸まっていた。
   *   受け皿はこの1フィールドだけでよい＝**ターン終了時に `abilities_removed` へ昇格させる**と、
   *   - `NEXT_TURN`（「次のあなたのターンの間」）＝予約だけ書く → 次ターン中だけ有効
   *   - `UNTIL_OPP_TURN_END`（「次の対戦相手のターン終了時まで」）＝現ターン＋予約の両方を書く
   *     → 残りの現ターン＋次ターンで有効になり、その次のターン終了時に消える
   *   の2語彙が同じ機構で表せる（`field_grants_next_turn` の2スロット式と同じ考え方）。
   * ⚠**昇格は turn-end の全経路**（PvP 通常終了・PvP 確認後・CPU・強制終了）で行うこと。
   *   経路ごとに手書きで空へ倒すと、その経路だけ予約を握り潰す＝`clearTurnEndScopedState` に集約する。
   */
  abilities_removed_next_turn?: string[];
  // 指定キーワードだけを失い、新たに得られないシグニ。ターン終了時に abilities_removed と同時にクリア。
  keyword_abilities_removed?: Record<string, string[]>;
  /**
   * 🆕**「このターン、あなたのシグニは新たに能力を得られない」＝能力獲得禁止の一過性版**（§5.3 `O-159`・2026-08-30）。
   *
   * 🔴**旧実装は真 no-op**＝`STUB{SUPPRESS_GAIN_ABILITY}`（`execStubPart2.ts`）が他の保護 STUB と同じ枝で
   *   **`[保護効果: …]` とログを出すだけ**で、engine のどこにも消費が無かった（`census:stubs` の消費地点0）。
   *   ⇒ `WX13-029-E1` の選択肢③は**選んでも何も起きなかった**。
   * ⚠**既存の恒久版（`PREVENT_ABILITY_GAIN_BY_OPP` ほか）は使えない**＝あちらは
   *   `effectEngine.ts` の `protected_` を **CONTINUOUS 能力からしか集めない**（`eff.effectType !== 'CONTINUOUS'` で弾く）。
   *   こちらは AUTO の選択肢から一度だけ立つフラグなので、**状態側に持つ**必要がある。
   * ⚠ターン終了時リセットは `turnScopedState.ts` に登録済み（手書きで倒さない）。
   */
  ability_gain_blocked_this_turn?: boolean;
  /**
   * §6.4 O-10（続き507）＝**「代わりに〜、ターン終了時まで、この能力を失う」で自壊した効果の effectId**。
   *
   * 🔑この語彙の能力は「置換を1回起こすこと」**だけ**が仕事なので、能力喪失を `abilities_removed`
   * （＝カード単位・全能力）で表すと**同居する他の能力まで巻き添えで消える**（`WX25-P3-055` は
   * E1 のパワー＋3000 と E3 の手札戻しが道連れになる）。そこで**効果単位**で無効化する。
   * ⚠**読むのは置換の成立地点だけ**＝現状は
   *   ①離場置換 `applyEffectLeaveSelfAbilitySubstitute`（`WX25-P3-055-E2`／`WX25-P2-071-E1` の付与）
   *   ②ルリグダメージ無効 `resolveLrigDamageShield`（`WXK01-002-E1`）
   *   の2点。新しい「代わりに…この能力を失う」を足すときは**成立地点で必ずこの配列を見る**
   *   （見ないと「ターン中に何度でも置換できる」＝原文が1回に絞った意味が消える）。
   */
  lost_ability_effect_ids_this_turn?: string[];
  // 次のダメージを無効にする回数（PREVENT_NEXT_DAMAGE 効果）
  prevent_next_damage?: number;
  // 発生源限定付きの「次のダメージ」予約。count は条件に合うダメージでのみ減る。
  prevent_next_damage_reservations?: Array<{
    count: number;
    damageSource?: 'lrig' | 'signi';
    sourceLevelLt?: number;
    millAtTurnEndPerPrevented?: number;
  }>;
  // デウスシールドで実際に防いだ回数ぶん得た、ターン終了時ミルの合計枚数。
  turn_end_mill_count?: number;
  // 次のダメージを「代わりに自デッキ上N枚トラッシュ」で置き換えるキュー（REPLACE_NEXT_DAMAGE_WITH_MILL 効果。
  // 各要素=ミル枚数。デッキが枚数未満のエントリは置き換え不可＝原文注記どおりダメージ通過。ターン境界でリセット）
  /**
   * @deprecated 続き431 で `life_crash_replacements` へ統合。**読むときは
   * `screens/battle/lifeCrashReplace.ts` の `lifeCrashReplacements()` を通すこと**
   * （続行中の対戦の state にはこの形式が残っている）。新規の書き込みはしない。
   */
  damage_replace_mill?: number[];
  /**
   * 「あなたのライフクロスがクラッシュされる場合、代わりに〜する」＝**ライフクラッシュの置換**（§6.4）。
   * 宣言（アーツ／【出】／ルリグ付与の【常】）はここへ積み、消費は
   * `screens/battle/lifeCrashReplace.ts` の funnel 1本を通す（消費地点は
   * シグニアタックの `crashOneLife` とルリグアタックの2つ）。ターン境界でクリアする。
   */
  life_crash_replacements?: LifeCrashReplacement[];
  /**
   * 「**このターン**、あなたのライフクロスは（ダメージ以外によっては）クラッシュされない」＝アーツ由来の
   * クラッシュ防止宣言（§5.3 `O-66`）。判定は `engine/lifeCrashGate.ts` の1本を通す。
   * ⚠**【常】の宣言はここに載らない**（CONTINUOUS は `executeAction` を通らない）＝盤面走査側が読む。
   *   両方を見ないと「アーツだけ効く／【常】だけ効く」型の無言の不整合になる。
   * ターン境界でクリアする（`turnScopedState.ts` に登録済み）。
   */
  life_crash_preventions_this_turn?: LifeCrashPreventionSpec[];
  /**
   * 「ターン終了時、（その）レゾナを場からルリグデッキに戻す」（`WX07-050`／`WX16-Re18`）の対象。
   * ⚠**戻し先はトラッシュではなくルリグデッキ**＝`turn_end_field_trash_targets` を流用しない。
   * 解決は `screens/battle/turnEndLrigDeckReturn.ts` の funnel 1本（ターン終了処理は2経路ある）。
   */
  turn_end_return_to_lrig_deck?: string[];
  /**
   * 「ターン終了時、それを場から**手札に**戻す」（§6.4 O-10・続き509・`WXK08-002-E1` 選択肢①）の対象。
   * ⚠**行き先が3本とも違う**＝`turn_end_field_trash_targets`（トラッシュ）／
   *   `turn_end_return_to_lrig_deck`（ルリグデッキ）と流用し合わないこと。
   * 解決は `screens/battle/turnEndHandReturn.ts` の funnel 1本（ターン終了処理は2経路ある）。
   */
  turn_end_return_to_hand?: string[];
  /**
   * 直前に `SUMMON_RESONA_FROM_LRIG_DECK` が場に出したレゾナ（次のステップが参照する一時値）。
   * ⚠**ctx ではなく state に置く**＝ゾーン選択の対話 pause を跨いで残す必要があるため。
   */
  last_summoned_resonas?: string[];
  // ダメージ無効ウィンドウ（PREVENT_DAMAGE 効果）。期間内は回数無制限で無効化する（prevent_next_damage の1回消費とは別）。
  // scope='ALL'＝あらゆるダメージ（crashOneLife 経路も含む）／'LRIG'＝ルリグアタックのダメージのみ。
  // NEXT_TURN_START は予約（消費側は無視）→次のグローバルターン開始時に NEXT_TURN_END へ昇格→その終了時に消滅。
  // MY_NEXT_MAIN_PHASE（§6.4 O-3 続き492）＝「次のあなたのメインフェイズまで」＝ターン境界を**跨いで**残り、
  //   自分が次にメインフェイズへ入る1点（`clearMainPhaseScopedState`）で消える。相手ターン中も有効。
  prevent_damage_windows?: { scope: 'ALL' | 'LRIG'; expires: 'END_OF_ATTACK' | 'MY_TURN_END' | 'NEXT_TURN_START' | 'NEXT_TURN_END' | 'MY_NEXT_MAIN_PHASE' }[];
  /**
   * 「次のあなたのメインフェイズまで、このルリグの基本リミットは N になる」（`WXK01-002-E2`・§6.4 O-3）。
   * 印刷リミットを**置き換える**（`lrig_limit_mod` の加算とは別軸）＝`computeEffectiveLrigLimit` の
   * `basicOverride` と同じ層。失効は `clearMainPhaseScopedState` 1点。
   */
  lrig_base_limit_override?: number;
  /**
   * 「あなたが次のあなたのドローフェイズにカードを N 枚引く場合、代わりに M 枚引く」（`WXK01-002-E2`）。
   * ⚠既存の `DRAW_PHASE_REPLACEMENT` は**付与された【常】能力**（`lrig_granted_auto_effects`）としてしか
   *   置けず、期間つきの自己予約を表せなかった。読みは `applyLrigDrawPhaseReplacement` の同じ1関数。
   * 失効は `clearMainPhaseScopedState` 1点（次のドローフェイズは次のメインフェイズより前なので必ず1回使える）。
   */
  draw_phase_replacement?: { fromCount: number; toCount: number };
  // このターン、このプレイヤーのすべてのキーは能力を失う（WXK02-029 ビカム・ユー CONDITIONAL_GROW_AND_KEY_DISABLE）
  keys_abilities_disabled?: boolean;
  // このターン、次のライフバーストは2回発動する（LIFE_BURST_DOUBLE 効果）
  life_burst_double_next?: boolean;
  // スペル/アーツ効果でターン終了まで付与されたルリグの AUTO 能力
  lrig_granted_auto_effects?: import('./effects').CardEffect[];
  // 次の対戦相手のターン終了時まで付与されたルリグ能力
  lrig_granted_auto_effects_until_opp_turn?: import('./effects').CardEffect[];
  // 「このゲームの間、あなたは以下の能力を得る」でプレイヤーに付与された AUTO 能力。
  // ゲーム中持続するためターン境界ではクリアしない。
  game_granted_auto_effects?: import('./effects').CardEffect[];
  // 「このゲームの間、あなたは以下の能力を得る」でプレイヤー自身へ付与された能力（AUTO以外も保持）。
  game_granted_effects?: import('./effects').CardEffect[];
  // 次にこのプレイヤーが行うリフレッシュを置換する一発フラグ。実行時までターンを跨いで保持する。
  next_refresh_replaced?: boolean;
  // このターンと次のターンの間のリフレッシュ禁止。自分の次ターン開始時にクリア。
  prevent_refresh_until_opp_turn?: boolean;
  // このターン、対戦相手のシグニがバニッシュされる場合エナゾーンではなくトラッシュへ（BANISH_REDIRECT）
  banish_redirect?: boolean;
  // このターン、選択した相手シグニだけのバニッシュ先をトラッシュへ変更する。
  banish_redirect_target_nums?: string[];
  // このターン、選択した相手シグニが「バトルによって」バニッシュされる場合だけトラッシュへ変更する。
  // 効果バニッシュ経路（banishDestination）は参照しない。
  banish_redirect_battle_target_nums?: string[];
  // このターン、選択した相手シグニがパワー0以下による消滅でバニッシュされた時だけトラッシュへ送る。ターン境界でクリア。
  banish_redirect_power0_target_nums?: string[];
  // 同上だが「このシグニとのバトル／このシグニによって」に限定される版（BANISH_REDIRECT bySource・続き217）。
  // 置換が効くのはここに載っているシグニ自身がバトル当事者のときだけ＝無条件の banish_redirect とは別枠。
  // ⚠ここを無条件フラグに合流させると「場に1体いるだけで相手の全バニッシュがトラッシュ送り」に過剰発火する。
  banish_redirect_by_source_nums?: string[];
  /**
   * 🆕**「このシグニの効果によって〜バニッシュされる場合」の置換元**（§5.3 `O-210`）。
   * ⚠上の `banish_redirect_by_source_nums` は**バトル経路だけ**が読む（`BattleScreen` のバトル解決3箇所）。
   *   こちらは `banishDestination` が `opts.effectSourceNum` と突き合わせる**効果経路専用**。
   */
  banish_redirect_by_source_effect_nums?: string[];
  /** 🆕「**次に**1回だけ」の置換元（§5.3 `O-210`）＝1回置換したら上の配列からも外す。 */
  banish_redirect_once_source_nums?: string[];
  // このターン、対戦相手のシグニがバニッシュされる場合エナゾーンではなく手札に戻る（BANISH_REDIRECT_TO_HAND）
  banish_redirect_to_hand?: boolean;
  // このターン、対戦相手のシグニがバニッシュされる場合エナゾーンに置かれる代わりにゲームから除外される
  // （BANISH_REDIRECT redirectTo:'exile'＝SPDi47-05。除外ゾーン未実装＝どのゾーンにも置かず取り除く近似）
  banish_redirect_to_exile?: boolean;
  // このターン、パワーが0以下のシグニがバニッシュされる場合エナゾーンではなくトラッシュへ（所有者問わず。WX04-038-E1）
  power0_banish_to_trash?: boolean;
  // このターン、**対戦相手の**パワー0以下のシグニがバニッシュされる場合エナゾーンではなくトラッシュへ
  // （BANISH_REDIRECT の whenPowerZero。WXDi-P10-009-E3／WXDi-CP02-102-E2）。上の所有者問わず版と別枠で、
  // 「このフラグを立てた側の対戦相手」のシグニが死ぬときだけ効く＝消滅側から見て opState 側に立っていれば適用。
  power0_banish_to_trash_opp_only?: boolean;
  // このターン、あなたのシグニの効果で対戦相手のシグニのパワーが－される場合2倍－される（WX04-038-E1）
  double_power_minus_this_turn?: boolean;
  // DECLARE_NUMBER で宣言された数字（このターン、相手はこのレベルのシグニでガードできない）
  /**
   * 「対戦相手はこのアタックフェイズの間、**無色のカードで**エナコストを支払えず」
   * （`WXK07-001-E1` の引用【自】・§6.4 O-10 続き512）。
   * ⚠読むのは支払い可否 funnel（`canAffordGrowCost` / `canAffordWithExtraCost` の `banColorlessPay`）1本。
   *   ここを通らない支払い経路を足すと**その経路だけ制限が効かない**。
   */
  cannot_pay_colorless_this_attack_phase?: boolean;
  declared_guard_restrict_level?: number;
  declared_guard_restrict_levels?: number[];
  // DECLARE_NUMBER_PLAIN で宣言された数字（ガード制限を**伴わない**汎用の数字宣言）。
  // 「数字１つを宣言する。…宣言した数字と同じレベルを持つシグニを手札に加える」（PR-434）のように
  // 宣言値をフィルタに使うだけの効果で、上の declared_guard_restrict_level（＝相手のガード制限）を
  // 立ててしまうと「相手がそのレベルでガードできない」過剰実行になるため別枠で持つ。
  declared_number?: number;
  // DECLARE_CARD_NAME で宣言されたカード名（デッキ上確認効果等で使用）
  declared_card_name?: string;
  // COPY_LRIG_NAME_ABILITY: ルリグが別のルリグ名/タイプを持つとして扱うエイリアス
  lrig_name_aliases?: string[];
  // GAIN_EXTRA_TURN: 追加ターンフラグ（BattleScreen側でターン終了時にチェック）
  extra_turn?: boolean;
  /**
   * `SKIP_NEXT_TURN`: **このプレイヤーの次のターンを丸ごと飛ばす**予約（`WD20-006-E1`・§6.4 O-3）。
   * 消費は `resolveTurnHandover`（`src/screens/battle/turnHandover.ts`）1点＝ターン終了時に
   * 「次のターンプレイヤーがこのフラグを持っていたら交代しない」で表す（`extra_turn` の裏返し）。
   * ⚠**ターン境界を跨ぐ予約なので `turnScopedState` のリセット対象に入れない**
   *   （入れると立てた次の瞬間に消える）。消費は上記1点だけ。
   */
  skip_next_turn?: boolean;
  // HAND_SIZE_INCREASE: 手札上限数（未設定 = デフォルト∞）
  hand_limit?: number;
  // このターン、手札のすべてのシグニが【ガード】を得る（GRANT_GUARD_ICON_HAND_SIGNI）
  hand_signi_guard_enabled?: boolean;
  // 覚醒状態のシグニのCardNum一覧（永続、場を離れるまで有効）
  awakened_signi?: string[];
  // このターン次にアタックしたとき無効にされるシグニのCardNum一覧
  negated_attacks?: string[];
  // negated_attacks のうち「アタック側が手札をN枚捨てれば回避できる」もの（CardNum→必要捨て枚数。G154 BURST）
  negated_attacks_escape?: Record<string, number>;
  /**
   * 🆕**「このターン、あなたのルリグが次にアシストルリグにグロウする場合」の一時修整**
   * （2026-09-02・§5.3 `O-180`・`WX24-P2-043`）。
   * ⚠**1回きり**＝`executeAssistGrow` が消す。ターン終了時も `clearTurnEndScopedState` が消す。
   * ⚠**アシストグロウ専用**（センターグロウは読まない＝原文どおり）。
   */
  next_assist_grow_mods?: { ignoreLrigType?: boolean; reduction?: { color: string; count: number }[] };
  /**
   * 🆕**「あなたの効果１つによってこのシグニを参照する場合、レゾナとしても扱う」**
   * （2026-09-02・§5.3 `O-203`・`WX25-P2-052-E2`）。
   *
   * 🔑**「としても」＝シグニでもある**＝`matchesFilter` は `Type==='レゾナ'` を
   *   `cardType:'シグニ'` フィルタにも一致させる（非対称の緩和が既に入っている）ので、
   *   **参照時に `Type` を `'レゾナ'` へ差し替えるだけで「シグニかつレゾナ」になる。**
   * ⚠**近似**＝`fieldCandidates` は「誰の効果が参照しているか」を知らないので、
   *   原文の「**あなたの**効果1つによって」を絞れない（対戦相手の「レゾナを対象とし」も当たる／
   *   `excludeResona` では逆に外れる）。**1効果のための近似**として受け入れ、golden に両方向を張る。
   * ⚠**次の対戦相手のターン終了時まで**＝`clearUntilOppTurnEffects` が消す（キー名の `_until_opp_turn` が契約）。
   */
  treated_as_resona_until_opp_turn?: string[];
  // このターンまたは次のターン、グロウできない
  no_grow?: boolean;
  /**
   * このターン、ライフバースト発動を抑制（**クラッシュされた側**の state に立つ）。
   * 🆕**`true`＝このターンの全バースト／`TargetFilter`＝条件つき**（2026-09-02・§5.3 `O-177`・
   * `WX25-P3-003-E1`「**対戦相手のセンタールリグと共通する色を持たない**対戦相手のカードの
   * ライフバーストは発動しない」）。旧は boolean だけで、条件を載せられず**全部止めていた**。
   * ⚠**判定は `lifeBurstSuppress.ts` の `lifeBurstSuppressedByTurnFlag` 1本**を通す
   *   （`flag === true` を素で書くと条件つきが truthy で全部止まる側へ戻る）。
   */
  suppress_life_burst?: boolean | import('./effects').TargetFilter;
  // このターン、ルリグダメージを受けない
  prevent_lrig_damage?: boolean;
  // このターン（または次のターンまで）、敗北しない
  prevent_defeat?: boolean;
  // サブスクライバーカウント（ちあコーデ系）
  subscriber_count?: number;
  // ルリグリミット加算修正（エナフェイズ終了まで）
  lrig_limit_mod?: number;
  // このターン、相手はガードできない（PREVENT_OPP_GUARD_THIS_TURN / BLOCK_ACTION）
  prevent_opp_guard?: boolean;
  // このターン、対戦相手が【ガード】する際に追加で支払う《無》の合計枚数
  opp_guard_extra_colorless_this_turn?: number;
  // 次の自分のターンのドロー枚数上限（LIMIT_OPP_DRAW_COUNT等）
  draw_limit?: number;
  // ターン終了時まで有効なカードクラスオーバーライド（CardNum → 新クラス名）
  card_class_overrides?: Record<string, string>;
  // このターン、シグニを新たに配置できない自フィールドのシグニゾーン（タスク12(lxi) 第10波）。
  // colorless があるときは「《無》×N を支払わないかぎり配置できない」＝支払えば配置できる。
  // 書き手＝REMOVE_SIGNI_ZONE（ゾーンを消す＝ターン終了時まで）／BLOCK_OPP_ZONE_PLACEMENT（配置禁止）。
  // 読み手＝handleSummonSigni・CPU召喚・SigniSummonZoneModal（すべて signiZoneBlock.ts の純関数経由）。
  signi_zone_blocks?: SigniZoneBlock[];
  // 次の自分のターン用の予約。ターン開始時に signi_zone_blocks へ昇格する
  // （free_grow_next_turn / signi_deploy_count_limit_next_turn と同じ作法）。
  signi_zone_blocks_next_turn?: SigniZoneBlock[];
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
  // DECLARE_COLORS で同時に宣言した色（WX11-074）。選択順を LOOK_PICK_CHAIN の固定段へ対応付ける。
  declared_colors?: string[];
  /**
   * @deprecated 単一ゾーンだけを持てた旧フィールド。読みは `designatedZones()` に一本化する（§6.4 O-16）。
   * 進行中セーブ互換のため残す。書き込みは `designated_zones` 側だけ行う。
   */
  designated_zone?: number;
  /**
   * DESIGNATE_SIGNI_ZONE で指定されたシグニゾーン番号（§6.4 O-16 で複数対応）。
   * ⚠原文「シグニゾーンを**２つまで**指定し」（`WX25-P3-014-E2`）は1つしか持てない旧フィールドでは表せず、
   *   指定そのものが JSON から落ちていた。**指定のたびに置き換える**（前回の指定を持ち越さない）。
   */
  designated_zones?: number[];
  // 直前に removeFromField でシグニが離れたシグニゾーン番号（タスク12(lxxvi)）。
  // 「それがあったシグニゾーン」の解決にだけ使う使い捨てマーカー＝**直後の1ステップでのみ有効**。
  signi_zone_vacated_just?: number[];
  // 全ゾーンで色を失うカードのCardNum一覧（LOSE_COLOR_ALL_ZONES: チームルリグ3体未満時）
  colorless_card_overrides?: string[];
  /**
   * 「（このターンと次のターンの間、）対戦相手の効果によって〈ゾーン〉にあるカードは
   * （他の領域／トラッシュへ）移動しない」の**期間つき**予約（§6.4 O-3 続き493）。
   *
   * ⚠🔴旧 `prevent_opp_trash_from`（`('hand'|'energy')[]`）は**失効地点が1つも無く永続していた**＝
   *   `WXK10-083-E1` の原文は「このターンと次のターンの間」なのに、一度張ると**ゲーム終了まで**
   *   エナがトラッシュに落ちなくなっていた（`signi_deploy_power_limit`／`negated_attacks` と同じクラス）。
   *   `signi_deploy_bans` と同じ**ターン数カウントダウン**式にし、減算は `clearTurnEndScopedState` の1点だけ。
   * ⚠**【常】宣言（`PREVENT_ZONE_MOVE_BY_OPP` / `PREVENT_NON_FIELD_MOVE_BY_OPP`）はここに載せない**＝
   *   場にあるかぎり有効なので `collectProtectedZones` が effectsMap から読む。両方の合成は
   *   `oppMoveProtectedZones`（`engine/effectEngine.ts`）1本。
   * ⚠現行の保護は **hand / energy → トラッシュ**の移動だけ（既存 `PREVENT_NON_FIELD_MOVE_BY_OPP` と同じ近似）。
   */
  opp_move_immunity?: { zones: ('hand' | 'energy')[]; turnsRemaining: number }[];
  // このターンのメインフェイズ／アタックフェイズの間、**自分の効果では**自分のトラッシュにある
  // カードを他の領域へ移動できない（LOCK_OPP_TRASH_MOVE＝タスク12(lxxiii)）。
  // ⚠止めるのは所有者**自身**の効果だけ＝相手の効果によるトラッシュ回収（STEAL_OPP_TRASH_PUPPET 等）は通す。
  lock_trash_move_this_turn?: boolean;
  // 次の自分のターン用の予約。ターン開始時に lock_trash_move_this_turn へ昇格する
  // （signi_zone_blocks_next_turn / free_grow_next_turn と同じ作法）。
  lock_trash_move_next_turn?: boolean;
  // ターン終了時まで有効なシグニ色オーバーライド（CardNum → 新色名）
  signi_color_overrides?: Record<string, string>;
  // エナの色代替（キーピース等：from色のエナをto色として扱う）
  energy_color_substitutes?: { from: string[]; to: string }[];
  // このターンにアタックしたシグニのCardNum一覧（ターン終了時リセット）
  attacked_signi_ids?: string[];
  // 絆を獲得したカード名一覧（ゲーム中に失われない。【絆】アイコン能力の発動条件として参照）
  bonds?: string[];
  /**
   * 🆕`CHOOSE{noRepeat}` で**このゲーム中に既に選んだ選択肢**のキー（2026-09-01 続き760・
   * `WXDi-P11-003-E1-GRANT`「以下の３つから**まだ選んでいないもの**１つを選ぶ」）。
   * 形＝`"<effectId|cardNum>:<choiceId>"`。⚠**ターン境界でリセットしない**（原文は「このゲームの間」）。
   */
  taken_choice_keys?: string[];
  /**
   * 🆕**プレイヤー自身が得たキーワードトークン**（2026-09-01 続き760・`WXDi-P12-050-E1`
   * 「**対戦相手は**【みこみこ親衛隊】１つを得る」）。
   * 🔴従来この語彙が無く、キーワードトークンは `keyword_grants[シグニ番号]` にしか置けなかったので、
   *   **プレイヤーが得る**原文は「任意のシグニ1体へ付与」に化けていた（誰が捨てるかが変わる）。
   * 🔑消費は `triggerCollect` の `KEYWORD_TOKEN_MAP` ループ（シグニ側と同じトークンカードを引く）。
   */
  player_keywords?: string[];
  /**
   * 🆕**このゲームの間に場へ出せるキーの枚数**（2026-09-02・§5.3 `O-200`・`WXK02-004-E3`
   * 「このゲームの間、あなたはキーを**２枚まで**場に出すことができる」）。既定＝1（ルールどおり1枚）。
   * 🔑消費は2地点＝①engine `execPlaceKeyFromLrigDeck`（枠が空いていれば `key_piece_extra` へ積む）
   *   ②`BattleScreen` のキーセット可否ゲートと配置先（`hasUnlimitedKeys` と同じ2箇所）。
   * ⚠`UNLIMITED_KEYS`（枚数無制限）とは別軸＝あちらはルリグの【常】、こちらは**回数指定の永続フラグ**。
   */
  key_place_limit?: number;
  // このターン、自分のシグニは合計1回しかアタックできない（LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL）
  signi_attack_once_limit?: boolean;
  // 相手効果による自シグニのダウンを防ぐ（PREVENT_SIGNI_DOWN_BY_OPP_ALL）
  prevent_signi_down_by_opp?: boolean;
  // 相手シグニがアタック時に適用するパワー制限（OPP_SIGNI_ATTACK_POWER_RESTRICT）
  opp_signi_attack_power_cap?: number;
  // 「このターン、対戦相手は〈条件〉のシグニでアタックできない」＝**禁止を受ける側**（アタッカー）に載る条件束。
  // ⚠`opp_signi_attack_power_cap` は逆に**課した側**に載る（歴史的経緯）。新規はこちらに寄せる＝
  //   signiAttackGate が attacker 側だけを見れば済み、`_this_turn` 命名で turn-end 失効も自動登録になる。
  signi_attack_bans_this_turn?: SigniAttackBan[];
  // 裏向きシグニのCardNum一覧（SIGNI_FLIP_FACEDOWN / FACE_DOWN_OPP_SIGNI）
  face_down_signi?: string[];
  // このターン、自分の効果による特定シグニへのパワー-を2倍にする（DOUBLE_OWN_POWER_MINUS）
  double_power_minus_targets?: string[];
  // このターン、指定した自シグニの効果による相手シグニへのパワー-を2倍にする。
  // double_power_minus_targets は「修正を受ける側」の指定なので、発生源指定は別軸で保持する。
  double_power_minus_sources?: string[];
  /**
   * このターン、指定シグニが受けるパワー－の**倍率**（§6.4 O-10・続き507）。
   * `double_power_minus_targets` は 2倍固定の集合なので「代わりに**３倍**－される」
   * （`WX25-P2-103-E1` の選択肢②）を表せなかった＝倍率つきの上位互換。
   * ⚠**読み手は 2倍軸と同じ2箇所**（`applyTempMods` と `applyActiveFieldPowerGrants`）＝
   *   片方だけに足すと「場レベル付与のパワー－にだけ倍率が乗らない」無言のズレになる。
   * ⚠倍率は 2倍軸と**併用時は大きい方**を採る（同じ－を二重に掛けない）。
   */
  power_minus_multipliers_this_turn?: Record<string, number>;
  // 基本レベルの一時変更（CardNum → 扱うレベル。SET_BASE_LEVEL/CHANGE_BASE_LEVEL 等が単一値で書く）
  attack_phase_level_overrides?: Record<string, number>;
  // 【英知】条件の判定でだけ「このシグニのレベルは１であり２であり３である」のように**同時に複数値**として
  // 扱う指定（CardNum → 取りうるレベル群）。英知の合計は単一値ではなく**取りうる合計の集合**になり、
  // 「例えばレベル２と３の＜英知＞のシグニがある場合、【英知＝６】【＝７】【＝８】はすべて条件を満たす」
  // （WX20-044-CB のルール補足）。上の単一値オーバーライドとは意味が違うので別フィールドで持つ。
  eichi_level_options?: Record<string, number[]>;
  // COPY_SIGNI: このターン、フィールドシグニが別のカードとして扱われる（field_cardNum → copy_source_cardNum）
  card_identity_overrides?: Record<string, string>;
  // 「このターンと次のターンの間、〈条件〉のシグニを新たに場に出せない」（§6.4 O-3）。
  // ⚠**場に出す側**に載る。寿命は turnsRemaining のカウントダウン（`clearTurnEndScopedState`）。
  // ⚠旧 `signi_deploy_power_limit`（DEPLOY_RESTRICT のパワー版）もここへ統合した＝旧フィールドは
  //   **どこでもクリアされておらず「このターンと次のターン」が永続していた**（続き487）。
  signi_deploy_bans?: SigniDeployBan[];
  // DEPLOY_RESTRICT（配置数制限）: このターン、このプレイヤーはシグニをこの数までしか場に出せない
  // （「対戦相手はシグニをN体までしか場に出せない」＝WXK11-074等・AUTO時のフラグ。超過分は設置時に即トラッシュ）。
  signi_deploy_count_limit?: number;
  // DEPLOY_RESTRICT（配置数制限）: 次の自分ターン開始時に有効化する予約
  signi_deploy_count_limit_next_turn?: number;
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
  // hand_revealed_just を起こした効果の発生源カード。原因限定付き公開時トリガーは未設定時に非発火。
  hand_revealed_just_source_card_num?: string | null;
  // 効果による手札捨て直後にセット: 捨てられたカードのCardNum（BattleScreenでON_HAND_DISCARDEDトリガー検出用）
  hand_discarded_just?: string[] | null;
  // 上の hand_discarded_just が「**対戦相手の**効果によるもの」かどうか（このプレイヤー視点）。
  // 1回の効果解決では ctx.ownerState=効果の持ち主／ctx.otherState=その相手で固定されるため、
  // 「他方の state 側へ書いた＝相手の効果で捨てさせた」が成り立つ＝state ごとの boolean で厳密に表せる
  // （既存の hand_trashed_by_opp_this_turn が同じ規約でカウントしている）。
  // triggerCondition.byOwnEffect（「あなたが自分の効果によって捨てたとき」WXDi-D09-P16-E2）の判定に使う。
  // hand_discarded_just と同じ地点で BattleScreen がクリアする。
  hand_discarded_just_by_opp?: boolean | null;
  // hand_discarded_just を起こした効果の owner userId。undefined＝コスト／ルール処理など効果起因でない。
  // triggerCondition.byWatcherEffect（watcher 所有者の効果による相手手札捨て）の判定に使い、同時にクリアする。
  hand_discarded_just_cause_owner_id?: string | null;
  // このプレイヤーから見て対戦相手の場に【ウィルス】が置かれた/取り除かれた直後にセット
  // （BattleScreenでON_OPP_VIRUS_REMOVED / ON_OPP_VIRUS_CHANGEDトリガー検出用。複数個の同時増減でも1回扱い）
  opp_virus_placed_just?: boolean | null;
  // 🆕§5.3 `O-148`（2026-09-02）＝【みこみこ親衛隊】の所持数。
  // 🔴**【ウィルス】とは別軸**＝ウィルスは `field.signi_virus`（シグニゾーン単位）だが、
  //   こちらは「**対戦相手が**【みこみこ親衛隊】1つを得る」＝**プレイヤー単位のカウンタ**。
  //   ⚠ウィルスの受け皿を流用すると相手のシグニゾーン state を壊す（旧 live がその誤流用だった）。
  mikomiko_guards?: number;
  opp_virus_removed_just?: boolean | null;
  // このプレイヤーのシグニが効果によって他のシグニゾーンに移動した直後にセット: 移動したシグニのCardNum
  // （BattleScreenでON_ZONE_MOVEDトリガー検出用。所有者の state に積む。両プレイヤーが各自フィルタで処理）
  zone_moved_just?: string[] | null;
  // OPP_MAIN_PHASE_LIMIT_DOWN: 次の自ターンMAINフェイズ開始時に適用するリミット修正
  pending_lrig_limit_mod?: number;
  // OPP_SIGNI_ATTACK_COST: 自シグニのアタックに支払う無色コスト枚数（エナ消費）
  signi_attack_cost?: number;
  // 対象シグニ別：「他のシグニN体を場からトラッシュ」によるアタック制限解除コスト
  signi_attack_field_trash_costs?: Record<string, number>;
  // MULTI_DAMAGE_ON_LRIG_ATTACK: このターン残りN回ルリグアタックできる（1回目は通常アタック扱い）
  lrig_attack_remaining?: number;
  // このターン既にルリグがアタックした（ON_ATTACK_LRIG効果でアップされても再アタック不可）
  lrig_has_attacked?: boolean;
  /**
   * そのアタックフェイズの間にこのプレイヤーの場を離れたシグニの instanceId（§6.3 J-4・`WX24-P2-075-E1`
   * 「そのアタックフェイズの間にあなたの＜遊具＞のシグニが場を離れていた場合」）。
   * アタックフェイズ開始時（MAIN→ATTACK_ARTS）にクリアし、離場の2経路
   * （効果解決の中央 diff ＝ `collectAutoTriggersFromDiff` ／ バトル解決＝`resolvePendingSigniBattleFor`）で追記する。
   * ⚠**行き先は問わない**（バニッシュ/エナ送り/トラッシュ/手札戻し すべて「場を離れた」）。
   */
  signi_left_field_this_attack_phase?: string[];
  // ライドシステム：LRIGが現在乗っている乗機シグニのCardNum一覧（ターン終了時にクリア）
  lrig_riding_signi?: string[];
  // このプレイヤーのシグニがドライブ状態になった（ルリグがライドした）直後にセット: 新たにドライブ状態になったシグニのCardNum
  // （BattleScreenでON_SIGNI_BECOMES_DRIVEトリガー検出用。所有者の state に積む。zone_moved_just と同型）
  drive_became_just?: string[] | null;
  // このプレイヤーのカードが【ビート】になった直後にセット: 新たに【ビート】になったカードのCardNum
  // （BattleScreenでON_BECOME_BEATトリガー検出用。所有者の state に積む。drive_became_just と同型）
  beat_became_just?: string[] | null;
  // SUPPRESS_CENTER_ON_PLAY: このターン自分のセンタールリグの【出】効果は発動しない
  suppress_center_on_play?: boolean;
  // CRASH_TO_TRASH_INSTEAD: このターン相手のライフクロスがクラッシュされた場合エナではなくトラッシュへ
  crash_to_trash_instead?: boolean;
  /**
   * 🆕**自分のライフクロスのクラッシュ置換**（2026-08-31 続き749・`WD06-009-E2` / `WX20-043-E1`）＝
   * 「この方法でチェックゾーンに置かれたカードが**エナゾーンに置かれる場合、代わりにそれをトラッシュへ置き**
   * あなたのデッキの一番上のカードをライフクロスに加える」。**残り回数**を持つ（1クラッシュにつき1消費）。
   * ⚠`crash_to_trash_instead` とは**向きが逆**＝あちらは「攻撃側が相手のクラッシュ先を変える」ターン継続フラグ。
   *   こちらは**自分自身のクラッシュ**に、しかも**回数制**でかかる。
   */
  self_crash_to_trash_and_refill?: number;
  // SET_NEXT_LIFE_CRASH_COUNTER: 自分のライフがクラッシュされたとき、相手のライフを perTrigger 枚クラッシュし返す（remaining回まで）。
  // 防御用カウンタークラッシュ（WX25-P1-004 アーツ / WXDi-P12-030 アシストルリグ）。ターン終了時にクリア。
  life_crash_counter?: { remaining: number; perTrigger: number };
  // INSTALL_DELAYED_TRIGGER（B3）: 「このターン、…したとき、…」で設置された1ターン限りの遅延条件トリガー。
  // 後続のトリガー（trigger.timing）発火時に effect を実行する。ターン終了時にクリア。
  delayed_triggers?: import('./effects').InstallDelayedTriggerAction[];
  // WXDi-P10-034: 裏向きでシグニゾーンに置いたカードの「次の自メインフェイズ開始時」表向き分岐待ち。
  //   ターン境界クリア対象外（設置は自アタックフェイズ開始時＝flip は次の自ターンのメインフェイズ開始時なので、
  //   間の相手ターンを跨いで持ち越す。delayed_triggers（THIS_TURN 限定・ターン境界クリア）では表現できないため専用フィールド）。
  pending_facedown_flip?: { cardNum: string; zoneIndex: number; powerBonus: number; sourceCardNum: string };
  // 「そのシグニが場にあるかぎり、そのシグニのパワーを＋N」＝場に居る間だけ効く永続パワー修正（WXDi-P10-034 の表向き +5000）。
  //   temp_power_mods（ターン境界クリア）と異なりクリアしない。calcFieldPowers が field.signi に居る cardNum にのみ適用（場を離れれば base が無く自然に失効）。
  field_power_mods?: Array<{ cardNum: string; delta: number; srcCardNum?: string }>;
  // REVEAL_DECK_TOP（B2）: 直前に公開したデッキ上カードのうちシグニのレベル合計（動的閾値 powerLteRevealedSigniLevelSum 用）。
  last_revealed_signi_level_sum?: number;
  // REVEAL_DECK_TOP（B2）: 直前に公開したデッキ上カード番号（TRASH_REVEALED が参照）。
  last_revealed_deck_cards?: string[];
  // NEGATE_NTH_ATTACK: このターン、対戦相手のアタックを共有カウントで無効化する残り回数と対象種別。
  // signi と lrig は1つの remaining を共有し、対象種別のアタックを無効化するたびに1減る。
  negate_opp_attacks?: { remaining: number; signi: boolean; lrig: boolean };
  // NEGATE_ALL_OPP_EFFECTS: このターン、自分のCONTINUOUS効果は何もしない（相手が効果無効化）
  all_cont_effects_negated?: boolean;
  // BANISH_BY_SELF_GOES_TO_TRASH: このシグニによってバニッシュされたシグニはエナでなくトラッシュへ
  banish_to_trash_by_self?: string[];
  // GROW_COST_ZERO / CONDITIONAL_FREE_GROW: 次のグロウコストを0にする
  /**
   * ピース応答窓が開いていて**このプレイヤーが応答側**であるあいだ true（§6.4 O-10・続き518）。
   * `Condition.OPP_USING_TEAM_PIECE` の**唯一の読み手**。
   * ⚠窓を閉じるときに必ず落とす（残すと「カットイン専用ピースが通常タイミングで撃てる」過剰実行に戻る）。
   *   保険として turn-scoped レジストリにも登録してある（ターン境界で必ず落ちる）。
   */
  team_piece_cutin_window?: boolean;
  /**
   * 使用中のピースが**打ち消された**（§6.4 O-10・続き518）。
   * `COUNTER_TEAM_PIECE_AND_EXILE` が**ピースを使った側**に立て、窓を閉じる
   * `resolvePendingPiece` が読んで「解決せずゲームから除外」に倒す。⚠読んだら必ず落とす。
   */
  piece_use_countered?: boolean;
  free_grow_this_turn?: boolean;
  /**
   * このターンにセンタールリグがグロウしたか（§6.4 O-10・続き515・`WXDi-P16-001A`
   * 「このターンにあなたのセンタールリグがグロウしていない場合」）。
   * ⚠**書くのはグロウの2経路だけ**（人間 `executeGrow` ／ CPU グロウ）＝
   *   片方に書き忘れると「CPU のターンだけ条件が通る」型の無言のズレになる。
   */
  lrig_grew_this_turn?: boolean;
  /**
   * **CPU がこのターンに能動使用した【起】の effectId**（§8／§6.4 `O-1`・`cpuActivate.ts`）。
   * ⚠**ルールの状態ではなく CPU の行動履歴**＝engine は読まない。CPU が同じ【起】を
   *   撃ち直して無限ループになるのを止めるためだけに存在する（`usageLimit` の無い効果や
   *   コスト表現が落ちている効果は `actions_done` では止まらない）。
   */
  cpu_activated_effect_ids_this_turn?: string[];
  /**
   * **CPU がこのターンに使用したアーツ／スペルの CardNum**（§8／§6.4 `O-1` (a)(b)・
   * `cpuArts.ts`／`cpuSpell.ts`）。
   * ⚠`cpu_activated_effect_ids_this_turn` と同じく**ルールの状態ではなく CPU の行動履歴**＝
   *   `performArts`／`performSpell` が使用不能を検出して何も書かずに return したとき、CPU が
   *   同じ札を選び直して**その窓から先へ進まなくなる**のを止めるためだけに存在する。
   * ⚠アーツとスペルで**同じ台帳**を使う（CardNum は型を跨いで衝突しない）。
   */
  cpu_used_card_nums_this_turn?: string[];
  /**
   * 「チェックゾーンにあるこのカードを裏返し、…グロウコストを支払わずにグロウする」（`WXDi-P16-001A`）の
   * **裏面 CardNum**。engine 側は条件判定と予約だけを行い、実際のグロウは BattleScreen が
   * `executeGrow`（＝グロウの正規経路＝【出】トリガー・リミット再計算・コイン獲得を通る）で行う。
   * ⚠**engine で直接 `field.lrig` へ push しないこと**＝グロウ時トリガーが丸ごと落ちる。
   */
  pending_flip_grow_card?: string;
  /**
   * 「〈条件〉の場合、あなたのセンタールリグをグロウしてもよい」（§5.3 `O-83`／`SP38-001-E1`）＝
   * **効果によるグロウの予約**。engine は条件判定と予約だけを行い、実際のグロウは BattleScreen が
   * `executeGrow`（正規経路）で行う（`pending_flip_grow_card` と同じ理由＝engine で `field.lrig` へ
   * 直接 push すると【出】・リミット再計算・コイン獲得が丸ごと落ちる）。
   *
   * 🔴**`GROW_FREE` を流用してはいけない**＝あちらは「グロウコストを支払わずに」＝**過少コスト**になる。
   *   原文が「支払わずに」と書いていないグロウは**通常のグロウコストを払う**（`freeCost:false`）。
   * ⚠`suppressOnPlay`＝「この方法でグロウしたルリグの【出】能力は発動しない」＝**そのグロウ1回だけ**。
   *   ターン全体のフラグ（`suppress_center_on_play`）へ倒すと、同じターンの別のグロウまで黙って抑制する。
   */
  pending_effect_grow?: { suppressOnPlay?: boolean };
  /**
   * 🆕§5.3 `O-59`（2026-09-02）＝直前に**手札へ戻した【トラップ】が居たシグニゾーン**の index。
   * 「それがあった**シグニゾーンに**手札からカード１枚を【トラップ】として設置する」（`WX16-028-E2`）が読む。
   *
   * 🔴**`lastProcessedCards` では表せない**＝あれは「どのカードか」しか運ばず、**どのゾーンに居たか**は
   *   トラップ枠から抜いた瞬間に失われる（旧実装は行き先が決まらず `[トラップ設置保留: previous]` の no-op）。
   * 書き手＝`applyTrapToHand`（トラップを抜く唯一の funnel）／読み手＝`trapOp:'set'` の `trapFixedZone:'previous'`。
   * ⚠寿命は turn-end（`turnScopedState` に登録）＝解決を跨いで残しても次のターンには持ち越さない。
   */
  trap_removed_zones?: number[];
  // THIS_CARD_FROM_TRASH: トラッシュから場に出したシグニのインスタンスID。直後の【出】効果で
  // 「このシグニがトラッシュから場に出た場合」条件の判定に使う（WX03-034）。ターン開始時にクリア。
  signi_played_from_trash?: string[];
  signi_played_from_deck?: string[];
  // THIS_CARD_FROM_NON_HAND_THIS_TURN: このターンに手札以外から場に出たシグニのインスタンスID。
  // 効果配置・レゾナ等の非手札配置で記録し、手札からの配置で同一IDの古い記録を除去する。ターン開始時にクリア。
  signi_played_from_non_hand_this_turn?: string[];
  // 🆕2026-08-27 B8: ON_PLAY の**由来ゾーン限定**（`triggerCondition.fromZones`）用に、場に出した瞬間の
  // 移動元を `"<instanceId>:<zone>"` で記録する。⚠**盤面差分（`detectPlacedFromZone`）だけでは足りない**＝
  // `execAddToField` は**ゾーン選択インタラクションの前に元の領域からカードを取り除く**ので、
  // 選択を挟む配置では resume 後の before スナップショットに移動元が残っておらず、由来が永久に unknown になる
  // （fail-closed なので「トラッシュから出したのに【自】が発火しない」＝過小へ裏返る）。ターン開始時にクリア。
  signi_placed_origin_this_turn?: string[];
  // 効果によって場に出したシグニの instanceId → 場出し効果の発生源カード instanceId。
  // 「このシグニが＜X＞のシグニの効果によって場に出ていた場合」（出自条件・WX26-CP1-048）を
  // 直後の【出】が THIS_CARD_PLACED_BY_CLASS で判定するために記録。通常召喚では記録されない。
  signi_placed_by_source?: Record<string, string>;
  // FREE_GROW_NEXT_TURN: 次の自分ターンのグロウコストを0にする予約（WX03-024-BURST）。
  // 自分ターン開始時に free_grow_this_turn へ移される。
  free_grow_next_turn?: boolean;
  // このターンに効果（execDraw 経由）で引いた累計枚数。ドローフェイズのドローは含まない。
  // 「このターンに効果によってカードをN枚以上引いていた場合」条件（CARDS_DRAWN_BY_EFFECT）用。ターン終了時に0へリセット。
  cards_drawn_by_effect_this_turn?: number;
  // 現在のアタックフェイズ中にこのプレイヤーが引いた枚数。効果ドローを execDraw で記録し、
  // アタックフェイズ開始時に0へリセットする（WX11-030「このターンのアタックフェイズの間に引いた枚数」）。
  cards_drawn_this_attack_phase?: number;
  // このターンにこのプレイヤーが支払った《コイン》の累計枚数（グロウ/アーツ/キー/スペル/ベット/【出】/【起】の全経路）。
  // 「このターンにあなたが《コイン》を合計N枚以上支払っていた場合」条件（COINS_PAID_THIS_TURN）用＝
  // WXDi-P09-039/WXDi-P15-053/068/072/073。ターン境界で0へリセット（turn_arts_used と同じ境界）。
  // ⚠支払い（cost）だけを数える＝獲得（coinGain）や《コイン》を得る効果では増えない。
  coins_paid_this_turn?: number;
  // このターンに**対戦相手の効果によって**このプレイヤーの手札／エナゾーンからトラッシュへ移動した累計枚数。
  // 「このターンに対戦相手の効果によってあなたの手札からカードが1枚以上トラッシュに移動していた場合」条件
  // （HAND_TRASHED_BY_OPP / ENERGY_TRASHED_BY_OPP）用＝WXDi-P02-005/WXDi-P07-023/SPK16-13E。ターン境界で0へリセット。
  hand_trashed_by_opp_this_turn?: number;
  energy_trashed_by_opp_this_turn?: number;
  /**
   * このターンに**ダウン状態になった自分のシグニ**のカード番号（発生順）。
   * 「それがこのターンで**N回目**である場合」条件（`SIGNI_DOWNED_COUNT_THIS_TURN`）用＝`WX05-042`（§6.4 O-11）。
   * ⚠**枚数ではなくカード番号を積む**＝原文が「あなたの＜植物＞のシグニ」のように**クラスで絞る**ため、
   *   数えるときに `filter` を当てられる形にしておく（数だけだと絞りが表現できない）。
   * ⚠記録は**ダウン検出の3経路すべて**（中央 diff／アタック宣言によるダウン／常時効果によるダウン）で行う
   *   ＝`recordSigniDownedThisTurn` を通す。1経路でも漏らすと「N回目」が永久に来ない。ターン境界で空にする。
   */
  signi_downed_this_turn?: string[];
  /**
   * 直近の**レゾナ出現条件の支払い**で実際に置いた／捨てたカード（§5.3 `O-122`）。
   * 「このレゾナの**出現条件で**同じ名前のシグニ２体をトラッシュに置いていた場合」（`WX07-009-E1`）が読む。
   * ⚠**書き手は `payResonaAppearanceAndPlace` の1本だけ**（支払いを行う唯一の funnel）。
   * ⚠**「直近」で足りる**＝出現条件つきレゾナの【出】はこの支払いの直後に解決される。
   *   ターン境界でクリアされるので、次のターンへ持ち越して誤成立することはない。
   */
  last_appearance_cost_cards?: string[];
  /**
   * このターンに**この owner が対戦相手のシグニをバニッシュした**記録（§5.3 `O-121`）。
   * `by`＝バニッシュを行ったカード（バトルならアタッカー／効果なら効果元。不明は null）、
   * `byEffect`＝効果によるバニッシュか（バトルダメージなら false）。
   * ⚠**既存の `signi_banished_this_turn` とは軸が別**＝あちらは「**バニッシュされた側**」に積む単なる件数で、
   *   「誰が」も「何によって」も持たない（`WX11-031` / `WXK02-034` はどちらも表せない）。
   * ⚠**記録地点は2つ**＝バトル経路（`BattleScreen` のバトル解決）と効果経路（`collectBoardDiffTriggers`）。
   *   片方だけ書くと「効果では数えるがバトルでは数えない」等の**半分だけ効く条件**になる。
   */
  opp_signi_banished_this_turn?: Array<{ by: string | null; byEffect: boolean }>;
  // 直近の効果ドロー（execDraw 経由）の原因カード番号。triggerCondition.drawBySourceStory（WX20-026-E3）の発火判定用。
  // ドローフェイズの通常ドロー（drawCards 経由）では undefined にクリアし、効果ドロー（execDraw）が原因カードを上書きする。
  last_effect_draw_source?: string;
  // 直近の効果ミル（execMill 経由）の原因カード番号。triggerCondition.milledSourceStory
  //   （WX24-P3-030-E1「あなたの＜悪魔＞のシグニの効果１つによって」）の発火判定に使う。
  //   trash は string[] でエントリに発生源を持てないため state 側に記録する（last_effect_draw_source と同型）。
  //   ⚠execMill 以外のミル経路では埋まらない＝**未設定は発生源不明として従来どおり発火**させる（過剰側に倒す）。
  last_effect_mill_source?: string;
  // 直近の効果ドローが「このプレイヤー自身の効果」由来か（execDraw で a.owner==='self' のとき true・相手にドローさせた
  // 場合 false）。ON_DRAW any_opp の triggerCondition.drawByDrawerOwnEffect（「対戦相手が自分の効果で引いたとき」＝
  // PR-423）の発火判定用。ドローフェイズの通常ドローは execDraw を通らないため更新されない（drawByEffect で別途除外）。
  last_draw_by_own_effect?: boolean;
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
  // GAIN_LRIG_TYPE（§6.4 O-3）: 期間つきで**追加で**得たルリグタイプ。
  // ⚠寿命は turnsRemaining のカウントダウン（減算は `clearTurnEndScopedState` の1点＝
  //   `signi_deploy_bans` / `opp_move_immunity` と同じ規約。失効地点を増やさない）。
  // 読みは `effectiveLrigClass`（グロウ互換・「〇〇限定」）と `collectLrigNameAliases`。
  lrig_gained_types_timed?: Array<{ lrigType: string; turnsRemaining: number }>;
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
  guard_alt_hand_until_opp_turn?: number;           // WX24-P4-026: 次の対戦相手ターン終了時までのガード代替
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
  // 「この方法で裏向きにしたシグニ」のターン終了時復帰予約。
  // field.facedown_signi と同じゾーン番号を保持し、別効果で裏向きになったカードを巻き込まない。
  // trashIfOccupied=false は「同じ場所にシグニがない場合だけ表向き」（場所が埋まっていれば裏向きのまま）。
  turn_end_facedown_signi_returns?: Array<{ cardNum: string; zoneIndex: number; trashIfOccupied: boolean }>;
  // 現在ターン終了時に自分の全シグニを裏向きにし、次の対戦相手アタックフェイズ開始時の復帰を予約する。
  // delayed_triggers はターン境界で消えるため、二重遅延の1段目／2段目を専用の永続フィールドで持つ。
  turn_end_facedown_all?: Array<{ sourceCardNum: string; returnTiming: 'NEXT_OPP_ATTACK_PHASE_START' }>;
  pending_opponent_attack_facedown_returns?: Array<{ cardNum: string; zoneIndex: number; sourceCardNum: string }>;
  // §6.4 O-9(b)：「**各**アタックフェイズ開始時、裏向きのそれと同じ場所にシグニがない場合、
  // 対戦相手は〈コスト〉を支払ってもよい。そうした場合、それを表向きにする」（`WXDi-P07-010-E2`）。
  // ⚠**繰り返す**ゲート＝一度きりの `pending_*` と違い、支払われるまで毎アタックフェイズ残る
  //   （＝解決しても消さない。表向きにできたときだけ取り除く）。
  // ⚠**裏向きカードの持ち主側**（＝支払う側）に載せる。効果を使った側に置くと支払い主体が反転する。
  facedown_release_by_payment?: Array<{ cardNum: string; zoneIndex: number; sourceCardNum: string; colorlessCost: number; handDiscard: number }>;
  // DELAY_TO_NEXT_OPP_ATTACK_PHASE（§6.4 O-3）: 「次の対戦相手のアタックフェイズ開始時、〜」の予約。
  // ⚠**ターン境界を跨ぐ**ので turnScopedState にも delayed_triggers（THIS_TURN 限定）にも載せない。
  //   予約は**予約した側**（＝次のアタックフェイズでは非ターンプレイヤー）に積み、
  //   `ON_ATTACK_PHASE_START` の collector が opState 側を読んで発火する。消化は発火時に1件ずつ。
  pending_next_opp_attack_phase_effects?: Array<{ sourceCardNum?: string; action: import('./effects').EffectAction }>;
  // DELAY_TO_NEXT_OPP_TURN_END（§6.4 O-3）: 「次の対戦相手のターン終了時、〜」の予約。
  // ⚠上と**同じ走査軸**＝予約は**予約した側**（＝そのターンの非ターンプレイヤー）に積み、
  //   `ON_TURN_END` の collector が opState 側を読んで発火する。消化は発火時に1件ずつ。
  // ⚠ターン境界を跨ぐので turnScopedState にも delayed_triggers（THIS_TURN 限定）にも載せない。
  pending_next_opp_turn_end_effects?: Array<{ sourceCardNum?: string; action: import('./effects').EffectAction }>;
  // DELAY_TO_NEXT_OWN_TURN_END（§6.4 O-4）: 「次の**あなたの**ターン終了時、〜」の予約。
  // ⚠**2スロット式**＝ここは予約（不活性）。自分の次のターン開始時に下の active へ昇格する。
  //   1スロットだと `ON_TURN_END` の collector が予約したそのターンの終了時に拾って「次の」が消える。
  pending_next_own_turn_end_effects?: Array<{ sourceCardNum?: string; action: import('./effects').EffectAction }>;
  /** 上の予約が昇格したもの。`ON_TURN_END` の collector が**ターンプレイヤー側**で読む。 */
  pending_own_turn_end_effects?: Array<{ sourceCardNum?: string; action: import('./effects').EffectAction }>;
  // PLACE_FACEDOWN_LRIG_ZONE（§6.4 O-3）: 裏向きでルリグゾーンに置いたカード（元ゾーンからは取り除く）。
  // REVEAL_FACEDOWN_LRIG_ZONE が表向きにしてトラッシュへ送り lastProcessedCards に載せる。
  // ⚠ターン境界を跨ぐ（置くのは自分のターン・公開は次の相手ターン）ので turn-scoped にしない。
  facedown_lrig_zone_cards?: string[];
  // ADD_EXTRA_ATTACK_PHASE（§6.4 O-3）: このターンのアタックフェイズの後に追加するアタックフェイズのキュー。
  // ATTACK_LRIG の次を決める1点（resolveNextPhaseAfterAttack）で1件ずつ消化し、END の代わりに ATTACK_ARTS へ戻す。
  extra_attack_phases_this_turn?: Array<{ sourceCardNum?: string; onStart?: import('./effects').EffectAction }>;
  // 上のキューを消化して追加フェイズへ入る際に、その開始時本文をここへ移す。
  // ON_ATTACK_PHASE_START の collector が合成エントリとして積み、STUB ハンドラが1件ずつ取り出して実行する。
  pending_extra_attack_phase_start_effects?: Array<{ sourceCardNum?: string; action: import('./effects').EffectAction }>;
  // TRASH_AT_TURN_END: ターン終了時にフィールドからトラッシュに置くカードのインスタンスID一覧
  turn_end_field_trash_targets?: string[];
  // TRASH_ENERGY_AT_TURN_END: ターン終了時に**エナゾーンから**トラッシュに置くカードのインスタンスID一覧
  // （「ターン終了時、それらをあなたのエナゾーンからトラッシュに置く」＝`SPK01-10-E1`）。
  // ⚠場トラッシュとはゾーンが違うだけなので消化地点は同じ turn-end funnel に並べる。
  turn_end_energy_trash_targets?: string[];
  // DRAW_AT_TURN_END: このターン終了時に引くカード枚数（場を離れても引く。WXK01-054/089）。ターン終了時に消化してクリア
  turn_end_draw_count?: number;
  // エンドフェイズの「ターン終了時に」効果（①）を doPhaseAdvance で解決済みであることを示す一時マーカー。
  // 手札上限超過で confirmEndDiscard へ抜ける際に立て、confirmEndDiscard 側での効果二重適用を防ぐ（消化後クリア）。
  end_turn_effects_resolved?: boolean;
  // NEGATE_SPELL: このターン、このプレイヤーのスペル（コスト合計5以下）が打ち消される
  spell_negated_this_turn?: boolean;
  // このターンにこのプレイヤーのシグニがバニッシュされた数（タスク12(xciv) の `WX13-026`
  // 「このターンに対戦相手のシグニがバニッシュされている場合、このアーツの使用コストは《黒×3》減る」）。
  // ⚠**バニッシュされた側**に積む（使用者は相手 state を読む）。盤面差分の funnel（collectBoardDiffTriggers）
  // で記録し、条件は `>= 1` でしか使わない＝同じ差分が複数回評価されても無害。ターン境界でリセット。
  signi_banished_this_turn?: number;
  // GRANT_NEXT_SPELL_UNCOUNTERABLE: 次にこのプレイヤーが使用するスペルは対戦相手の効果で打ち消されない（WX04-008 ファフニール）
  next_spell_uncounterable?: boolean;
  // COST_REDUCTION(スペル/UNTIL_END_OF_TURN): 次に使用するスペルの使用コストを軽減（WX04-008《白×2》減）。スペル使用時に消費
  next_spell_cost_reduction?: { color: string; count: number }[];
  // COST_REDUCTION(アーツ/UNTIL_END_OF_TURN): 【チェイン】《色》《色》＝「このターン、あなたが**次に**アーツを
  // 使用する場合、それの使用コストは《色×1》《色×1》減る」（WX10-004/005/022・WX11-018/021・WX14-005・WX19-004）。
  // スペル版（next_spell_cost_reduction）と同型＝アーツ使用時に消費し、ターン終了時にリセットする。
  next_arts_cost_reduction?: { color: string; count: number }[];
  // SET_CARD_COST_REPLACEMENT: カード名を指定した使用コストの**置換**（「このゲームの間、あなたの《落華流粋》の
  // 使用コストは《黒×2》《無×1》になる」WXK03-002-E3）。ゲーム間持続＝ターン境界でリセットしない。
  // ⚠軽減（`SPECIFIC_CARD_COST_REDUCE`＝場のCONT収集）とは別軸で、印刷コストを丸ごと差し替える。
  card_cost_replacements?: { cardName: string; cost: { color: string; count: number }[] }[];
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
  // 「**次の**対戦相手のターン終了時まで、対戦相手のセンタールリグ（とすべてのシグニ）は能力を失う」の予約
  // （`RemoveAbilitiesAction.alsoCenterLrig` × `until:'NEXT_TURN'|'UNTIL_OPP_TURN_END'`・段2 第45バッチ）。
  // ⚠`abilities_removed_next_turn` と同じ2スロット式＝turn-start で `lrig_abilities_disabled` へ昇格し、
  //   そのターンの終了時に turnScopedState の turn-end 登録が消す。
  lrig_abilities_disabled_next_turn?: boolean;
  /**
   * 「このターン、**あなたの効果によって**シグニのアタックは無効にならない」（`WX24-P4-016-E3`・§6.4 O-10 続き510）。
   *
   * 🔑ちより／【マジックボックス】系は「【ライフバースト】を持たない場合、**このアタックを無効にし**、〈利得〉」＝
   * **自分の効果で自分のアタックを無効にする**足枷を持つ。この【起】はその足枷をターン中だけ外す。
   * ⚠読むのは**アタック無効化を書き込む3地点だけ**＝`SET_CANCEL_ATTACK_FLAG`／`SET_CANCEL_OPP_ATTACK_FLAG`／
   *   `NEGATE_ATTACK`（シグニ対象のみ）。**このフラグの持ち主＝効果を使う側**なので、
   *   対戦相手の効果による無効化は止まらない（原文「あなたの効果によって」）。
   */
  own_effects_cannot_negate_signi_attack_this_turn?: boolean;
  // このターンに手札を捨てた枚数の累計（BANISH_IF_DISCARDED_3_THIS_TURN等で参照）
  turn_hand_discarded_count?: number;
  /**
   * 🆕このターンに**自分が**手札から捨てたカードの実体（2026-08-31 続き748）。
   * 🔴`turn_hand_discarded_count` は**枚数しか覚えていない**ので、原文
   *   「このターンにあなたが手札から**＜ブルアカ＞の**カードを1枚以上捨てていた場合」（`WXDi-CP02-055-E2`）の
   *   ような**絞り込み付きの履歴参照**が書けなかった（§5.4(ii) に登録していた機構ギャップ）。
   * ⚠**枚数カウンタと必ず同じ地点で更新する**（片方だけ増やすと条件が食い違う）。
   */
  turn_hand_discarded_cards?: string[];
  // このターンにシグニが場から手札に戻ったか（G087「このターンにシグニが場から手札に戻っていた場合」）。ターン境界でリセット
  turn_signi_returned_to_hand?: boolean;
  // このターンにシグニが場から手札に戻った**体数**（「シグニが2体以上場から手札に戻っていた場合」WXK02-040/065）。
  // ⚠既存 turn_signi_returned_to_hand（boolean）は「1体以上」の意味で据置＝**両方を同じ地点で更新する**こと。
  signi_returned_to_hand_count_this_turn?: number;
  // このターンに自分のデッキからトラッシュへ置かれた累計枚数（「このターンにあなたのデッキからカードがN枚以上
  // トラッシュに置かれていた場合」WXDi-P03-065）。中央盤面diffの detectMilledFromDeck と同じ地点で積む。
  deck_to_trash_count_this_turn?: number;
  /**
   * 🆕このターンに自分のデッキからトラッシュへ置かれた**カードの実体**（2026-08-31 続き748）。
   * 原文「このターンにあなたのデッキから**＜ブルアカ＞の**カードが1枚以上トラッシュに置かれていた場合」
   * （`WXDi-CP02-094-E1`）。⚠`deck_to_trash_count_this_turn` と**同じ地点**で更新する。
   */
  deck_to_trash_cards_this_turn?: string[];
  // このターンにアーツを使用したか（「このターンにあなたがアーツを使用していた場合」WX25-P1-106）。ターン境界でリセット
  turn_arts_used?: boolean;
  turn_arts_used_names?: string[];
  // このターンに使用したアーツの色（「このターンにあなたが(色)のアーツを使用していた場合」WX24-D1-11〜D4-11）。ターン境界でリセット
  turn_arts_used_colors?: string[];
  // v0.278: discardVariable コスト支払いで捨てたカードのレベル合計（WDK13-011用）
  last_activated_discard_level_sum?: number;
  // 直前の能力コストで手札／エナ／場からトラッシュに置いたカード instance。
  last_cost_trashed_cards?: string[];
  // 直前の能力コストで傀儡状態のシグニを場からトラッシュに置いたか（COST_TRASHED_PUPPET。WDK17-014）。コスト支払い毎に上書き。
  last_cost_trashed_puppet?: boolean;
  // このターンに **効果によって** ダウン→アップした自分のシグニ instance（THIS_CARD_UPPED_FROM_DOWN_THIS_TURN。WX14-070）。ターン境界でリセット
  upped_from_down_this_turn?: string[];
  // このターンに **このプレイヤーの効果によって** 対戦相手のカードがデッキに移動した累計枚数（OPP_CARDS_MOVED_TO_DECK_THIS_TURN。WXK06-071）。ターン境界でリセット
  opp_cards_moved_to_deck_this_turn?: number;
  self_deck_to_energy_this_turn?: number;
  // v0.278: WX25-P2-001 GAIN_ABILITY_THIS_GAME で付与されるゲーム全体フラグ
  // 【ルリグバリア】【シグニバリア】は field.free_zone にトークンカードとして設置する
  // （旧 lrig_barrier / signi_barrier 数値カウンタは廃止。execUtils の barrier ヘルパー参照）
  game_guard_barrier_act?: boolean;      // 手札ガードシグニ捨て→ルリグバリア付与 能力を持つ
  game_opp_guard_extra_colorless?: boolean; // 相手ガード時に追加で《無》1枚必要（このゲーム）
  // ON_ATTACK_SIGNI解決後のバトル解決待ち（zoneIndex: アタックしたゾーン番号）
  pending_signi_battle?: { zoneIndex: number; targetOpZone?: number };
  // ON_ATTACK_LRIG解決後にlrig_attacked: trueをセット待ち（防御側IDを保持）
  pending_lrig_attack?: boolean;
  // UPKEEP_OR_NO_UP: 次の自分のUPフェーズにルリグアップ条件（条件未達でセンタールリグはアップしない）
  // 'pay_colorless1': 《無》1枚支払わないかぎりアップしない
  // 'pay_colorless3': 《無》3枚支払わないかぎりアップしない
  // 'discard_or_colorless1': 手札1枚捨てるか《無》1枚支払わないかぎりアップしない
  lrig_upkeep_condition?: 'pay_colorless1' | 'pay_colorless3' | 'discard_or_colorless1';
  // DISCARD_BY_POWER_MATCH: 起動コスト支払い後に捨てたシグニのパワーを記録（次のexecStub呼び出しで参照）
  last_discarded_signi_power?: number;
  // levelLteDiscardSigni: handDiscardSigniコストで捨てたシグニのレベルを記録（「この方法で捨てたシグニのレベル以下」WX22-046/WXK10-044 等）
  last_discarded_signi_level?: number;
  // classMatchesDiscardSigni: handDiscardSigniコストで捨てたシグニのCardClassを記録（「それと共通するクラスを持つ」WXK10-033）
  last_discarded_signi_class?: string;
  // BET_CONDITION: このアーツ/効果でベット宣言していた場合 true（execStub内でチェック）
  is_betting_this_effect?: boolean;
  // BOOST: このアーツの任意追加エナコストを支払った場合。効果解決中だけ参照する
  is_boosting_this_effect?: boolean;
  // ベットで実際に支払ったコイン枚数（可変ベット「好きな枚数」・段階ベット「or」のスケール用）。is_betting_this_effect と同時に設定/クリア
  bet_coins_paid?: number;
  // WX16-004: ターン終了時まで、ホログラフによる自分のデッキトップ公開を3枚並べ替え後の公開へ置換
  holograph_reveal_replace_this_turn?: boolean;
  // 解決中の効果単位マーカー。カード単位ではなく effectId から立て、完了解決時にクリアする
  is_holograph_this_effect?: boolean;
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
  /**
   * **効果による**離場置換（§6.4）で被害側が下した決定。victim（instanceId）→ `LeaveSubstituteOption.key`。
   * `'none'` は「置換しない」。engine は移動の直前に**再検証したうえで**消費する（盤面が変わって
   * その置換がもう成立しないなら黙って通常の移動に倒す）。
   *
   * ⚠**ExecCtx ではなく PlayerState に置いてある**＝対話 pause を跨いで自動的に保持されるため
   * （`banish_substitute_choice` と同じ理由）。これのおかげで「離場ループの途中で pause する」
   * 機構を engine に新設せずに済んでいる＝**先に全部聞いてから同期的に適用する**。
   */
  leave_substitute_choices?: Record<string, string>;
}

/** ライフクラッシュ置換1件ぶんの宣言（`PlayerState.life_crash_replacements`）。 */
/**
 * 「ライフクロスは〜**クラッシュされない**／N枚まで**しかクラッシュされ**ない」＝**クラッシュの防止・回数制限**
 * （§5.3 `O-66`・2026-08-25）。
 *
 * ⚠**置換（`LifeCrashReplacement`）とは別軸**＝置換は「クラッシュの**代わりに**別のことをする」、
 *   こちらは「**クラッシュそのものが起きない**」。判定は `engine/lifeCrashGate.ts` の1本に寄せてある。
 * ⚠**宣言の在庫が2つある**＝アーツ（「このターン、〜」）は `PlayerState.life_crash_preventions_this_turn` へ積み、
 *   【常】は**盤面から毎回読む**（CONTINUOUS は `executeAction` を通らないので state に積めない）。
 */
export interface LifeCrashPreventionSpec {
  /**
   * 防ぐ範囲。`ALL`＝あらゆるクラッシュ／`EXCEPT_DAMAGE`＝「**ダメージ以外**によってはクラッシュされない」
   * ＝効果によるクラッシュだけ防ぎ、**ルリグ／シグニのアタックによるダメージは通す**。
   * ⚠**逆に読むと守りが攻撃に化ける**（`O-65` で実際に起きた事故）＝「ダメージ以外」は
   *   「ダメージだけ防ぐ」ではない。
   */
  scope: 'ALL' | 'EXCEPT_DAMAGE';
  /**
   * 「１ターンに**N枚までしか**クラッシュされない」＝ターン内の上限（`WX20-032-E1` の1／`WXK11-016-E1` の2）。
   * ⚠**`scope` の全面防止とは併用しない**（原文がどちらか一方）。上限型は `scope` を無視する。
   * ⚠**全か無かではない**＝原文注記「（複数枚のライフクロスがクラッシュされる場合は１枚だけクラッシュされる）」
   *   のとおり**枚数を切り詰める**。1枚も通さない実装にすると過剰防御になる。
   */
  maxPerTurn?: number;
  /** 誰のライフクロスを守るか。`each_player`＝「**各プレイヤーの**ライフクロスは」（`WXK11-016-E1`）＝相手側にも効く。 */
  protects: 'self' | 'each_player';
  /**
   * 「あなたのライフクロスが**対戦相手より少ないかぎり**」（`SP38-002-E1`）＝**クラッシュのたびに再評価**する
   * 動的条件。宣言時に1度だけ判定して焼き込むと、ライフが減って条件を満たした後に効かない／
   * 満たさなくなった後も効き続けるの両方向に外れる。
   */
  whileFewerLifeThanOpponent?: boolean;
}

export interface LifeCrashReplacement {
  /**
   * 置換の中身。`mill`＝自分のデッキ上N枚をトラッシュ／`crash_opponent`＝対戦相手のライフクロスN枚をクラッシュ／
   * 🆕`pay_cost`＝「代わりに〈コスト〉を支払ってもよい」（§6.4 O-37(a)・続き543）。
   */
  kind: 'mill' | 'crash_opponent' | 'pay_cost';
  count: number;
  /**
   * `kind:'pay_cost'` の支払い方（**原文の並び順**＝funnel は先に払えるものを使う）。
   * ⚠この配列が空／未指定の `pay_cost` は「タダで置換できる」＝**必ず1つ以上入れる**。
   */
  payOptions?: {
    costColors?: string[];
    handDiscard?: number;
    energyTrash?: number;
    /**
     * 🆕**アップ状態のアシストルリグN体をダウンして払う**（2026-09-02・§5.3 `O-202`・
     * `WX24-P3-043-E1`「代わりにあなたのレベル1以上のアップ状態のアシストルリグ2体をダウンしてもよい」）。
     * ⚠**アップの枠が足りなければ払えない**＝置換は成立せずダメージがそのまま通る（過剰にしない側）。
     */
    assistLrigDown?: { count: number; minLevel?: number };
  }[];
  /**
   * 「そうした場合、このルリグはこの能力を失う」＝払ったら**ルリグ付与ストアからこの effectId を1つ**消す。
   * ⚠この項目が付いた置換は `life_crash_replacements` には積まれない（付与ストアが唯一の在庫）＝
   *   `lifeCrashReplacements()` が走査のたびに合成する。二重に積むと能力喪失後も残る。
   */
  loseGrantedEffectId?: string;
  /** 「対戦相手の**シグニ**によって」等の発生源限定。未指定＝どのダメージでもよい。 */
  damageSource?: 'lrig' | 'signi';
  /** 「シグニの**アタック**によって」限定＝効果によるクラッシュには乗らない。 */
  byAttack?: boolean;
  /** 「**次に**」＝1回限り。未指定＝そのターン中は何度でも成立する（【常】付与型）。 */
  once?: boolean;
  /** 原文「〜してもよい」。⚠現状は自動適用の近似（funnel のコメント参照）。 */
  optional?: boolean;
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
  // 使用コストとして実際に支払われたエナ1枚ごとの色配列（WX04-063 等の「支払ったエナの色」参照用）。
  // マルチエナは全5色、無色エナは空配列。
  paid_energy_colors?: string[][];
  /** WX15-067: このスペルの使用前に実際に取り除いた相手ウィルス数。 */
  pre_use_virus_removed?: number;
  /** A non-countering SPELL_CUTIN Resona was summoned; finish its triggers before continuing the spell. */
  cutin_response_complete?: boolean;
  /**
   * `'piece'`＝**ピース使用への応答窓**（§6.4 O-10・続き518・`WXDi-P05-006`）。
   * このとき `card_num` は**使用中のピースの instanceId**、`caster_id` は使用した側。
   * ⚠`pending_spell` は `battle_states` の**既存カラム（JSON）**なので、判別子をこの中に足すぶんには
   *   DB マイグレーションが要らない。**新カラムを足さないこと**（スキーマ変更は別途ユーザー判断が要る）。
   * ⚠**窓は「応答側に使える打ち消しピースが実在するときだけ」開く**＝候補0なら従来と同じ即時解決経路。
   *   ここを緩めると、ピースを使うたびに全対戦で新しい待ち状態が挟まりデッドロックの面が広がる。
   */
  kind?: 'piece';
}

// ===== 効果エンジン インタラクション定義 =====

export type TargetScope =
  | 'self_field' | 'opp_field' | 'both_field'  // both_field: 自分・対戦相手の両シグニゾーン（「対象のシグニ」owner:'any'）
  | 'self_hand'  | 'opp_hand'
  | 'self_trash' | 'opp_trash'
  | 'both_trash' // 自分・対戦相手の両トラッシュ（「いずれかのトラッシュから」）
  | 'self_trap'  // 自分の field.signi_traps（裏向き【トラップ】）
  | 'self_energy'| 'opp_energy'
  // 手札＋エナゾーンを跨いだ単一プール（「エナゾーンのカードと手札を合計N枚」＝タスク12(lxi) 第11波）
  | 'self_hand_energy' | 'opp_hand_energy'
  | 'self_lrig_deck' | 'opp_lrig_deck'
  | 'self_lrig_trash' | 'opp_lrig_trash'
  | 'self_lrig_under'
  | 'self_assist_lrig'
  // 場のキー（`field.key_piece` ＋ `key_piece_extra`）。「対戦相手のキー１枚を対象とし」（§6.4 O-17）。
  | 'self_key' | 'opp_key';

import type { EffectAction, SelectionConstraint } from './effects';

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
      totalLevelMax?: number;     // 「レベルの合計がN以下になるようにM体まで」: 選択カードのレベル合計の上限（count=M と併用。WDK13-007）
      candidateLevels?: Record<string, number>; // 各候補のレベル（totalLevelMax 判定用）
      selectionConstraint?: SelectionConstraint;
    }
  | {
      type: 'SEARCH';
      visibleCards: string[];     // デッキ公開カードのCardNum一覧
      maxPick: number;
      optional?: boolean;         // true: 0枚選択可。false: maxPick 枚必須
      revealPicked?: boolean;     // 選択したカードを公開ログへ記録
      thenAction: EffectAction;   // ピックしたカードに対するアクション
      afterAction?: EffectAction; // 完了後のアクション（通常はSHUFFLE_DECK）
      // 未ピックカードの行き先（REVEAL_PICK_HAND_SHUFFLE_BOTTOM用）。
      // 🆕`'deck_top'`＝「残りを好きな順番でデッキの一番上に戻す」（2026-08-28 Sheet1 バッチ）。
      //   公開札はデッキ上から取っているので、**未ピック分はそのまま上に残す**のが忠実（順序の入れ替えは近似）。
      restDest?: 'deck_bottom' | 'deck_top' | 'trash' | 'energy';
      // REVEAL_AND_PICK の残り公開カード（ピックしなかった非対象/未選択カードを含む全公開カード）を
      // 指定場所へ移す。cards＝公開した全カード（visibleCards=選択可能な部分集合とは別）。
      // reorder:true＝残りを置く**順番**をプレイヤーが決める（§5.3 `O-51`）。位置は position のまま。
      revealRemainder?: { cards: string[]; location: 'deck' | 'trash' | 'energy'; position: 'top' | 'bottom' | 'any' | 'split_top_bottom'; shuffle?: boolean; reorder?: boolean };
      lastProcessedCardsAfter?: string[]; // REVEAL_AND_PICK の公開 snapshot（選択結果とは別）
      // handOrField: ピックしたカードを1枚ずつ「手札に加える or 場に出す」の対話選択で処理する（「公開し手札に加えるか場に出し」）
      handOrField?: boolean;
      handOrFieldAsDown?: boolean;
      // handOrEnergy: ピックしたカードを1枚ずつ「手札に加える or エナゾーンに置く」の対話選択で処理する（「手札に加えるかエナゾーンに置き」）
      handOrEnergy?: boolean;
      opponentChoosesPileToTrash?: boolean;
      /**
       * 公開元デッキ・残り札の行き先の**持ち主**（効果オーナー視点。省略時 'self'）。§6.4 O-2。
       * ⚠`thenAction` は自前で `owner` を持つが、`revealRemainder`／`restDest`／`split_top_bottom` の
       *   デッキ操作は resumeSearch が直接行う＝ここが無いと **常に効果オーナーのデッキ**を掘る。
       */
      deckOwner?: 'self' | 'opponent';
      /**
       * true = **対戦相手自身**がこの公開札を選ぶ（「対戦相手は…その中から…」）。§6.4 O-2。
       * ⚠`deckOwner` とは独立＝`deckOwner` は「誰のデッキか」、こちらは「誰がクリックするか」
       *   （続き411 の教訓＝`opponentResponds` は ctx の視点を反転しない）。
       */
      opponentResponds?: boolean;
      continuation?: EffectAction;
      selectionConstraint?: SelectionConstraint;
    }
  | {
      type: 'CHOOSE';
      options: Array<{ id: string; label: string; action: EffectAction; available: boolean; costColors?: string[]; coinCost?: number }>;
      count: number;
      continuation?: EffectAction;
      opponentResponds?: boolean; // true = 対戦相手が選択するインタラクション（例:「対戦相手は支払ってもよい」）
      /**
       * §6.4 離場置換の可否を被害側に問う CHOOSE（`INTERNAL_LEAVE_SUB_ASK`）。
       * ⚠**`opponentResponds` だけでは足りない**＝BattleScreen は `opponentResponds` の CHOOSE を
       *   `resumeOpponentPayOptional`（＝相手が「支払う」流れ）へ固定ルートしており、コストの無い
       *   問いをそこへ流すと「エナ不足」で即終了＝**無言で潰れる**。このフラグで素の `resumeChoose` へ分ける。
       */
      leaveSubstituteAsk?: boolean;
      /**
       * `leaveSubstituteAsk` と同じ理由の一般版（§6.4 O-3 続き498）＝**コストを伴わない**
       * 相手応答の CHOOSE（「対戦相手はカード名1つを宣言する」等）。
       * ⚠これが無いと `resumeOpponentPayOptional`（支払いフロー）へ流れて「エナ不足」で即終了＝無言で潰れる。
       */
      costlessOpponentChoice?: boolean;
      multiSelect?: boolean;       // true = count > 1 の複数選択UI
      upTo?: boolean;              // true = 「N個まで」選択可（0個も可）
      /**
       * 「**同じ選択肢を２回以上選んでもよい**」（§6.4 O-29・`WX17-003-E1`／`WX22-016-E1`）。
       * ⚠**engine 側（`resumeChoose`）は最初から `['c1','c1']` を受けられる**（id 配列を順に実行する）＝
       *   穴は **UI が `Set<string>` で持っていた**こと＝同じ選択肢は一度しか選べなかった。
       *   このフラグが立つと UI は**選択肢ごとの回数**（`Record<id, number>`）で持ち、合計が `count` に達するまで
       *   同じボタンを何度でも押せる。
       */
      allowRepeat?: boolean;
    }
  | {
      type: 'LOOK_AND_REORDER';
      cards: string[];
      canTrash: boolean;
      destLocation: 'deck' | 'life';
      destOwner: 'self' | 'opponent';
      destPosition: 'top' | 'bottom' | 'any' | 'first_top_rest_bottom' | 'split_top_bottom';
      private: boolean;       // true=自分だけ見る（見る）/ false=両者公開（公開する）
      revealTopAfterReorder?: boolean; // WX16-004: 非公開で戻した後、トップ1枚だけを公開
      /**
       * 🆕§5.3 `O-150`＝`LookAndReorderAction.reorder`（「順番を自由に決められる」か）**をここへ運ぶ**。
       *
       * 🔴**旧はこの口が無く、フラグが pending の境界で丸ごと落ちていた**＝UI（`EffectInteractionModal`）は
       *   ↑↓ を**常時**描き、engine（`resumeLookAndReorder`）はクライアントが返した並びを**無条件で信じて**いた。
       *   実測＝live の `LOOK_AND_REORDER` 151件のうち **105件が `reorder:false`**（「デッキの一番上を見る」等）＝
       *   **全部が並べ替え可能な過剰実行**だった。`O-144` で `remainder.reorder` を41効果へ届けても
       *   実機の挙動が変わらなかったのはこれが理由（分岐すべきは remainder ではなくこの1本）。
       * ⚠**省略＝並べ替え可**（既存の STUB 経路は自前で pending を組んでおり、意味は「見て並べ替える」で正しい）。
       */
      reorder?: boolean;
      shuffle?: boolean;
      /**
       * true = この並べ替えで `lastProcessedCards` を**上書きしない**（§5.3 `O-51`・2026-08-29）。
       * 🔴既定の `resumeLookAndReorder` は「見た札全部」を `lastProcessedCards` へ書く。
       *   「残りを好きな順番で置く」を**チェーンの途中**に挟むと、後段の
       *   `{$ref:'last_processed_count'}`（「この方法で**手札に加えた**カード1枚につき〜」）が
       *   **ピック数ではなく残り枚数**を読む＝実測 `WXDi-P03-061-E2` が 2→3 に化けた。
       * ⇒ 残りを片付けるだけの並べ替えでは、直前のピック結果をそのまま持ち越す。
       */
      keepLastProcessed?: boolean;
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
      // 手札以外からの配置。ソース除去後に中断する特殊配置経路が resume 側へ出自を渡す。
      fromNonHand?: boolean;
      continuation?: EffectAction;
      /** `SUMMON_RESONA_FROM_LRIG_DECK` 由来＝配置後に `last_summoned_resonas` へ記録する（一時レゾナの返却用）。 */
      recordSummonedResona?: boolean;
      // REVEAL_UNTIL_TO_FIELD（WX04-093 等）でゾーン選択を跨いで「これまで場に出したシグニ」を維持するための蓄積。
      // 指定時、resumeSelectSigniZone は配置後に lastProcessedCards=[...placedSoFar, cardNum] を設定する（【出】発火の追跡用）。
      placedSoFar?: string[];
      /**
       * true = **対戦相手自身**がゾーンを選ぶ。§6.4 O-2。
       * ⚠**既定は従来どおり効果オーナーが選ぶ**（`owner:'opponent'` の配置は live に多数あり、
       *   一括で相手応答へ倒すと既存効果の応答者が変わる）。「対戦相手は…場に出し」の系統だけが
       *   `opponentResponds` 付きの SEARCH からこのフラグを引き継ぐ。
       */
      opponentResponds?: boolean;
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
    }
  | {
      /**
       * `ALLOCATE_POWER`（§5.3 `O-140`・2026-08-29）＝**総量を選んだ対象へ `unit` 単位で割り振る**。
       * 「それらのパワーを合わせて－20000する。この効果では1000単位でしか数字を割り振ることができない。」
       * ⚠**合計は `total` ちょうど**（余らせない）。UI・CPU・resume の3者が同じ規約で検算する。
       */
      type: 'ALLOCATE_POWER';
      targets: string[];          // 割り振り先（すでに対象宣言済み）
      total: number;              // 割り振る総量（負＝マイナス）
      unit: number;               // 割り振り単位（原文は毎回 1000）
      owner: 'self' | 'opponent' | 'any'; // targets がどちら側の場にあるか（'any'＝カードごとに判定）
      untilOppTurnEnd?: boolean;  // true＝power_mods_until_opp_turn へ（省略＝temp_power_mods）
      continuation?: EffectAction;
    }
  | {
      type: 'REARRANGE_SIGNI';   // フィールド上のシグニを好きなように配置し直す（「対戦相手のすべてのシグニを配置し直す」WX04-041-E2）
      owner: 'self' | 'opponent';  // 並び替えるシグニの持ち主（効果オーナー視点）
      signiNums: string[];         // 並び替え対象のシグニ（各ゾーンのトップ instance id）
      optional: boolean;           // true=スキップ可（「配置し直してもよい」）
      /**
       * 🆕`'traps'`＝**【トラップ】**を好きなように配置し直す（§5.3 `O-59`・`WX17-062-E1`
       * 「あなたのすべての【トラップ】を好きなように配置し直す」）。
       * 🔑シグニ側の並べ替え対話と**盤面の器だけが違う**（`field.signi_traps` を置換する）ので、
       *   pending・UI・確定ハンドラをそのまま共有する。⚠`signiNums` には**トラップのカード番号**が入る。
       */
      mode?: 'rearrange' | 'swap' | 'swap_pair' | 'traps';
      swapSourceNum?: string;      // 場の交換元、またはデッキから場へ入る公開シグニ
      swapSourceLocation?: 'field' | 'deck' | 'energy' | 'trash';
      swapIfSameLevel?: boolean;
      suppressOnPlay?: boolean;
      continuation?: EffectAction;
    };

export interface PendingEffect {
  sourcePlayerId: string;   // 効果オーナーのプレイヤーID（effectExecutorのownerState用）
  respondPlayerId?: string; // UIに応答するプレイヤーID（省略時=sourcePlayerId。対戦相手が選ぶ場合は相手ID）
  sourceCardNum: string;
  effectId: string;
  interaction: PendingInteractionDef;
  triggeringCardNum?: string; // pause を跨いで「それ」参照を保持（resume の ExecCtx 再構築用）
  triggeringKeyword?: string; // pause を跨いで ON_KEYWORD_GAINED の「その能力」を保持（COPY_ABILITY 用・WXDi-P04-035）
  trapActivated?: boolean;    // pause を跨いで《トラップアイコン》発動イベントを保持（完了解決後に ON_TRAP_ACTIVATE を収集）
  trapSetOwners?: import('./effects').Owner[]; // pause を跨いで【トラップ】設置イベントを保持
  storedTargetCards?: string[]; // pause を跨いで STORE_LAST_PROCESSED_TARGETS の固定対象を保持（targetsStored の resume 用。WX16-033 等）
  leftFieldUnderCards?: string[]; // ON_LEAVE_FIELD 発火元の離場直前の下カード（対話pause越し参照用）
  spellPlacement?: 'trash' | 'lrig_trash'; // 使用中スペルの解決後配置。pause 中は未配置のまま保持する
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
  leftFieldUnderCards?: string[];              // ON_LEAVE_FIELD 発火元の離場直前の下カード
  triggeringKeyword?: string;                  // ON_KEYWORD_GAINED で得られたキーワード（COPY_ABILITY が「その能力」として参照・WXDi-P04-035）
  battleAttackerCardNum?: string;              // ON_SIGNI_BANISH_OPPONENT/_BATTLE の battleBanishEntries：バニッシュを行ったアタッカー自身のカード番号（triggeringCardNum は被バニッシュ相手用に既に使用中のため別軸。「そのアタックしているシグニ」参照用・WX17-032）
  banishedSigniPower?: number;                  // ON_SIGNI_BANISH_BATTLE の被バニッシュシグニのバニッシュ直前実効パワー
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
