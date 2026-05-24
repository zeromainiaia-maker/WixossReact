export type ViewMode = 'LOGIN' | 'START' | 'DECK_LIST' | 'DECK_EDITOR' | 'MATCHMAKING' | 'BATTLE' | 'CPU_BATTLE';

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
}

export interface Deck {
  id: string;
  name: string;
  mainDeck: string[];
  lrigDeck: string[];
  thumbnailCardNum?: string;
}

export interface Room {
  id: string;
  host_id: string;
  guest_id: string | null;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  passcode: string | null;
  host_deck_id: string | null;
  guest_deck_id: string | null;
  winner_id: string | null;
  created_at: string;
}

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
    check?: string | null;
    key_piece?: string | null;
    signi_charms?: (string | null)[]; // [zone0, zone1, zone2] チャームカードのCardNum or null
    signi_acce?:   (string | null)[]; // [zone0, zone1, zone2] アクセカードのCardNum or null
    signi_virus?:  number[];          // [zone0, zone1, zone2] ウィルス数（0 or 1）
    free_zone?:    string[];          // フリーゾーン（チアガール等を置く汎用ゾーン）
  };
  actions_done?: string[];    // このターンに使用済みのアクション（ターン開始時にリセット）
  blocked_actions?: string[]; // カード効果で封じられたアクション
  story_overrides?: Record<string, string>; // CardNum -> ゲーム中に変更されたStory（大本のCardDataは変えない）
  pending_crashed_cards?: string[]; // ダブルクラッシュ等で同時クラッシュしたが未処理のカード番号（バースト処理待ち）
  // 効果エンジン用：ターン終了時にクリア
  temp_power_mods?: Array<{ cardNum: string; delta: number }>;
  keyword_grants?: Record<string, string[]>; // CardNum → ['ランサー', ...]
  // 強制攻撃フラグ（このターン、このプレイヤーのシグニは可能ならばアタックしなければならない）
  must_attack_signi?: boolean;
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
  // スペル/アーツ効果でターン終了まで付与されたルリグの AUTO 能力
  lrig_granted_auto_effects?: import('./effects').CardEffect[];
  // このターン、対戦相手のシグニがバニッシュされる場合エナゾーンではなくトラッシュへ（BANISH_REDIRECT）
  banish_redirect?: boolean;
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
}

// ===== 効果エンジン インタラクション定義 =====

export type TargetScope =
  | 'self_field' | 'opp_field'
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
    }
  | {
      type: 'SEARCH';
      visibleCards: string[];     // デッキ公開カードのCardNum一覧
      maxPick: number;
      thenAction: EffectAction;   // ピックしたカードに対するアクション
      afterAction?: EffectAction; // 完了後のアクション（通常はSHUFFLE_DECK）
      continuation?: EffectAction;
    }
  | {
      type: 'CHOOSE';
      options: Array<{ id: string; label: string; action: EffectAction; available: boolean }>;
      count: number;
      continuation?: EffectAction;
    }
  | {
      type: 'LOOK_AND_REORDER';
      cards: string[];
      canTrash: boolean;
      destLocation: 'deck';
      destOwner: 'self' | 'opponent';
      destPosition: 'top' | 'bottom' | 'any';
      continuation?: EffectAction;
    }
  | {
      type: 'SELECT_ZONE';
      cardNum: string;          // 場に出すカードのCardNum（instance ID含む）
      owner: 'self' | 'opponent';
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
export const LRIG_TYPES = ['ルリグ', 'アーツ', 'キー', 'ピース','レゾナ','アシストルリグ'];

export const isLrigCard = (card: CardData) => LRIG_TYPES.includes(card.Type);
