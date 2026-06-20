import type { CardEffect, SequenceAction, ChooseAction, GrantLrigAbilityAction } from '../types/effects';

/**
 * パーサーで自動解析できないカード固有の効果定義。
 * buildEffectsMap および buildEffectsJson で自動解析結果にマージされる。
 * - 同じ effectId が存在する場合はここの定義で上書き
 * - 存在しない effectId は末尾に追加
 */
export const MANUAL_EFFECTS: Record<string, CardEffect[]> = {

  // WX01-025 サルベージ（アーツ）
  // あなたのトラッシュからあなたのセンタールリグと共通する色を持つシグニ１枚を対象とし、それを手札に加える。
  'WX01-025': [
    {
      effectId: 'WX01-025-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '無', count: 1 }] },
      action: {
        type: 'TRANSFER_TO_HAND',
        source: {
          type: 'TRASH_CARD',
          owner: 'self',
          count: 1,
          upToCount: false,
          filter: { cardType: 'シグニ', colorMatchesLrig: true },
        },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX11-026 聖火の祭壇　ヘスチア（自己復活）
  // 【自】：あなたのライフクロス１枚がクラッシュされたとき、このシグニをあなたのトラッシュから場に出してもよい。
  // E1 を ON_PLAY の誤パース（LIFE_CRASH self）から ON_LIFE_CRASHED の自己復活へ修正。
  // トラッシュにあるこのカード自身がトリガー源になるため、collectSelfEventTriggers がトラッシュも走査する。
  // 自己復活アクションは ADD_TO_FIELD source:TRASH_CARD（cardName一致＝同名は機能等価）。upToCount で「してもよい」を表現。
  'WX11-026': [
    {
      effectId: 'WX11-026-E1',
      effectType: 'AUTO',
      timing: ['ON_LIFE_CRASHED'],
      triggerScope: 'self',
      action: {
        type: 'ADD_TO_FIELD',
        owner: 'self',
        source: {
          type: 'TRASH_CARD',
          owner: 'self',
          count: 1,
          upToCount: true,
          filter: { cardType: 'シグニ', cardName: '聖火の祭壇　ヘスチア' },
        },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX16-Re07 轟砲　ウルバン（相手ライフ2枚以上クラッシュで自身アップ）
  // 【自】《ターン１回》：【ダブルクラッシュ】によって対戦相手のライフクロスが２枚以上クラッシュされたとき、このシグニをアップする。
  // E1 を ON_PLAY の誤パース（UP）から ON_OPP_LIFE_CRASHED（相手ライフクラッシュ時）へ修正。
  // ダブルクラッシュ＝同時2枚以上クラッシュは OPP_LIFE_CRASH_EVENT_GTE(2) で判定（performLifeBurstResponse 収集時に評価）。
  'WX16-Re07': [
    {
      effectId: 'WX16-Re07-E1',
      effectType: 'AUTO',
      timing: ['ON_OPP_LIFE_CRASHED'],
      usageLimit: 'once_per_turn',
      condition: { type: 'OPP_LIFE_CRASH_EVENT_GTE', value: 2 },
      action: {
        type: 'UP',
        target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX25-P1-004 条炎反射（アーツ・カウンタークラッシュ）
  // このターン、次に対戦相手のルリグによってあなたのライフクロス１枚がクラッシュされたとき、対戦相手のライフクロス１枚をクラッシュする。
  // E1 を「即時2枚クラッシュ」の誤パースから SET_NEXT_LIFE_CRASH_COUNTER（防御カウンター設定）へ修正。
  // 発生源限定（相手ルリグによって）とブースト時2枚クラッシュは近似で省略（perTrigger=1固定）。
  'WX25-P1-004': [
    {
      effectId: 'WX25-P1-004-E1',
      effectType: 'ACTIVATED',
      timing: ['ATTACK'],
      cost: { energy: [{ color: '赤', count: 0 }] },
      action: { type: 'STUB', id: 'SET_NEXT_LIFE_CRASH_COUNTER', value: 1 },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P12-030 レイラ・ザ・クラック（アシストルリグ・カウンタークラッシュ）
  // 【出】：ターン終了時まで、このルリグは「【自】《ターン１回》：対戦相手のシグニによってあなたのライフクロス１枚が
  //   クラッシュされたとき、対戦相手のライフクロス１枚をクラッシュする。」を得る。
  // E1 を「即時クラッシュ」の誤パースから SET_NEXT_LIFE_CRASH_COUNTER へ修正。発生源限定（相手シグニ）は近似で省略。
  // E2（《赤》《無》の別【出】）は別能力のためパーサー生成のまま維持。
  'WXDi-P12-030': [
    {
      effectId: 'WXDi-P12-030-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: { type: 'STUB', id: 'SET_NEXT_LIFE_CRASH_COUNTER', value: 1 },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX25-CP1-065 風倉モエ（相手シグニへ即時-2000＋同じ対象へクラッシュ時-2000を付与）
  // 【自】：あなたのアタックフェイズ開始時、対戦相手のシグニ１体を対象とし、手札から＜ブルアカ＞のカードを１枚捨ててもよい。
  //   そうした場合、ターン終了時まで、それのパワーを－2000する。このターン、対戦相手のライフクロス１枚がクラッシュされたとき、
  //   ターン終了時まで、それのパワーを－2000する。
  // 鍵: 即時-2000 と「クラッシュ時-2000」を同一の選択対象へ適用する必要がある（「それ」＝同じ対象）。
  // STUB TARGET_AND_DISCARD_HAND（対象選択→直後 CONDITIONAL(IS_MY_TURN).then を選択対象へ applyDirectAction で適用→手札1枚捨て）を利用し、
  //   then を SEQUENCE[POWER_MODIFY -2000, GRANT_EFFECT(ON_LIFE_CRASHED→POWER_MODIFY thisCardOnly -2000)] にする。
  // 付与先＝相手シグニ。相手（＝付与先コントローラー）のライフがクラッシュされると、その付与 ON_LIFE_CRASHED が
  //   collectSelfEventTriggers（相手フィールド走査）で発火し、付与先自身が-2000（thisCardOnly）。クラッシュごとにスタック（usageLimitなし）。
  // 近似: 捨てる対象の＜ブルアカ＞限定・「捨ててもよい」の任意性・「そうした場合」ゲートは TARGET_AND_DISCARD_HAND の仕様上
  //   「手札を1枚（任意カード）強制で捨て対象選択」に簡略化（既存STUB踏襲）。E2【絆自】は絆条件未対応のため非実装。
  'WX25-CP1-065': [
    {
      effectId: 'WX25-CP1-065-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' },
          {
            type: 'CONDITIONAL',
            condition: { type: 'IS_MY_TURN' },
            then: {
              type: 'SEQUENCE',
              steps: [
                {
                  type: 'POWER_MODIFY',
                  target: { type: 'SIGNI', owner: 'opponent', count: 1 },
                  delta: -2000,
                },
                {
                  type: 'GRANT_EFFECT',
                  target: { type: 'SIGNI', owner: 'opponent', count: 1 },
                  duration: 'UNTIL_END_OF_TURN',
                  effect: {
                    effectId: 'WX25-CP1-065-E1-CRASH',
                    effectType: 'AUTO',
                    timing: ['ON_LIFE_CRASHED'],
                    action: {
                      type: 'POWER_MODIFY',
                      target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
                      delta: -2000,
                    },
                    duration: 'UNTIL_END_OF_TURN',
                    mandatory: true,
                    parseStatus: 'MANUAL',
                  },
                },
              ],
            },
          },
        ],
      } as SequenceAction,
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX25-CP1-075 姫木メル（相手シグニへ ON_LIFE_CRASHED デバフを付与）
  // 【自】：あなたのアタックフェイズ開始時、あなたの場に他の＜ブルアカ＞のシグニがある場合、対戦相手のシグニ１体を対象とし、
  //   ターン終了時まで、それは「【自】《ターン１回》：このシグニがシグニ１体とバトルしたか、あなたのライフクロス１枚が
  //   クラッシュされたとき、ターン終了時まで、このシグニのパワーを－2000する。」を得る。
  // E1 を「即時-2000＋エナチャージ」の誤パースから GRANT_EFFECT（相手シグニへデバフ能力を付与）へ修正。
  // 付与期間「ターン終了時まで」は既存 granted_effects のクリアと一致。付与能力は ON_LIFE_CRASHED で発火し
  //   付与先（相手）のライフがクラッシュされたとき自身のパワー-2000（thisCardOnly）。
  // 付与能力は2つの契機（このシグニがバトルした=ON_SIGNI_BATTLE / 付与先コントローラーのライフがクラッシュ=ON_LIFE_CRASHED）で
  //   発火し、《ターン1回》（同一effectIdでusageLimit共有）で自身パワー-2000。
  // E2（【絆自】：このシグニが相手ライフをクラッシュしたときエナチャージ）はパーサー生成のまま維持。
  'WX25-CP1-075': [
    {
      effectId: 'WX25-CP1-075-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', cardClass: 'ブルアカ' }, excludeSelf: true },
      action: {
        type: 'GRANT_EFFECT',
        target: { type: 'SIGNI', owner: 'opponent', count: 1 },
        duration: 'UNTIL_END_OF_TURN',
        effect: {
          effectId: 'WX25-CP1-075-GRANT',
          effectType: 'AUTO',
          timing: ['ON_SIGNI_BATTLE', 'ON_LIFE_CRASHED'],
          usageLimit: 'once_per_turn',
          action: {
            type: 'POWER_MODIFY',
            target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
            delta: -2000,
          },
          duration: 'UNTIL_END_OF_TURN',
          mandatory: true,
          parseStatus: 'MANUAL',
        },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-CP02-084 大野ツクヨ（次の相手ターン終了まで自己強化＋ON_LIFE_CRASHED付与）
  // 【起】《ダウン》：次の対戦相手のターン終了時まで、このシグニのパワーを＋4000し、このシグニは
  //   「【自】《ターン１回》：あなたのライフクロス１枚がクラッシュされたとき、あなたのデッキの一番上を公開する。
  //   そのカードが＜ブルアカ＞の場合、【エナチャージ１】をする。」を得る。
  // E1 を「即時エナチャージ＋+4000」の誤パースから、UNTIL_OPP_TURN_END の自己強化＋付与へ修正。
  // パワー+4000は power_mods_until_opp_turn、付与能力は granted_effects_until_opp_turn に保存（次の相手ターン終了時にクリア）。
  // E2【絆常】（CONTINUOUS +4000）はパーサー生成のまま維持。
  'WXDi-CP02-084': [
    {
      effectId: 'WXDi-CP02-084-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { down_self: true },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'POWER_MODIFY',
            target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
            delta: 4000,
            duration: 'UNTIL_OPP_TURN_END',
          },
          {
            type: 'GRANT_EFFECT',
            target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
            duration: 'UNTIL_OPP_TURN_END',
            effect: {
              effectId: 'WXDi-CP02-084-GRANT',
              effectType: 'AUTO',
              timing: ['ON_LIFE_CRASHED'],
              usageLimit: 'once_per_turn',
              action: {
                type: 'CONDITIONAL',
                condition: { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardClass: 'ブルアカ' } },
                then: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
              },
              duration: 'INSTANT',
              mandatory: true,
              parseStatus: 'MANUAL',
            },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P16-039 アザエラ「逆転の炎」（アシストルリグ・自己付与＋両者クラッシュ時ドロー/チャージ）
  // 【出】：対戦相手のパワー10000以下のシグニ１体をバニッシュする。（E1＝パーサー生成が正しいので維持）
  // 【出】：次の対戦相手のターン終了時まで、このルリグは「【自】《ターン２回》：あなたか対戦相手のライフクロス１枚が
  //   クラッシュされたとき、カードを１枚引くか【エナチャージ１】をする。」を得る。
  // E2 を「即時エナチャージ」の誤パースから GRANT_EFFECT（このアシストルリグ自身へ UNTIL_OPP_TURN_END で付与）へ修正。
  // 付与能力は timing [ON_LIFE_CRASHED（自ライフ）, ON_OPP_LIFE_CRASHED（相手ライフ）]＋twice_per_turn。
  // 付与先＝アシストルリグ instanceId（execGrantEffect の thisCardOnly をアシストゾーンにも対応）。
  // 自ライフクラッシュ時は collectSelfEventTriggers が nonSigniSources（assist_lrig 含む）で収集、
  //   相手ライフクラッシュ時は performLifeBurstResponse の oppCrashSources（assist_lrig 含む）で収集する。
  'WXDi-P16-039': [
    {
      effectId: 'WXDi-P16-039-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'GRANT_EFFECT',
        target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
        duration: 'UNTIL_OPP_TURN_END',
        effect: {
          effectId: 'WXDi-P16-039-GRANT',
          effectType: 'AUTO',
          timing: ['ON_LIFE_CRASHED', 'ON_OPP_LIFE_CRASHED'],
          usageLimit: 'twice_per_turn',
          action: {
            type: 'CHOOSE',
            choose_count: 1,
            from_count: 2,
            choices: [
              { choiceId: 'c0', label: 'カードを1枚引く', action: { type: 'DRAW', owner: 'self', count: 1 } },
              { choiceId: 'c1', label: 'エナチャージ1', action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 } },
            ],
          } as ChooseAction,
          duration: 'INSTANT',
          mandatory: true,
          parseStatus: 'MANUAL',
        },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P06-007 閃光へ飛翔　レイ（ルリグ・効果2枚ドロー条件＋ルリグ付与クラッシュ時）
  // 【自】：あなたのアタックフェイズ開始時、このターンにあなたが効果によってカードを２枚以上引いていた場合、
  //   青のシグニ１体を対象とし、手札を３枚捨ててもよい。そうした場合、ターン終了時まで、それは【アサシン】を得る。
  // 【出】：カードを１枚引き【エナチャージ１】をする。
  // 【起】《ゲーム１回》《青×0》：ターン終了時まで、このルリグは「【自】《ターン２回》：対戦相手のライフクロス１枚が
  //   クラッシュされたとき、カードを１枚引くか、対戦相手は手札を１枚捨てる。」を得る。
  // E1: 条件 CARDS_DRAWN_BY_EFFECT(self,gte,2) を CONDITIONAL でラップ（lrigブランチは eff.condition を評価しないため）。
  //   「捨ててもよい」は CHOOSE（捨てる/捨てない）、捨てる選択肢は HAND_COUNT>=3 でゲート。
  // E2: DRAW1＋エナチャージ1（DRAW 欠落を補完）。
  // E3: GRANT_EFFECT（thisCardOnly＝センタールリグ自身へ UNTIL_END_OF_TURN）で ON_OPP_LIFE_CRASHED twice_per_turn の
  //   CHOOSE（自ドロー / 相手ディスカード）を付与。collectは performLifeBurstResponse の oppCrashSources(lrig含む)で拾う。
  'WXDi-P06-007': [
    {
      effectId: 'WXDi-P06-007-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      action: {
        type: 'CONDITIONAL',
        condition: { type: 'CARDS_DRAWN_BY_EFFECT', owner: 'self', operator: 'gte', value: 2 },
        then: {
          type: 'CHOOSE',
          choose_count: 1,
          from_count: 2,
          choices: [
            {
              choiceId: 'c0',
              label: '手札3枚を捨てて青のシグニ1体に【アサシン】を付与',
              condition: { type: 'HAND_COUNT', owner: 'self', operator: 'gte', value: 3 },
              action: {
                type: 'SEQUENCE',
                steps: [
                  { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 3 } },
                  {
                    type: 'GRANT_KEYWORD',
                    target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', color: '青' }, upToCount: false },
                    keyword: 'アサシン',
                    duration: 'UNTIL_END_OF_TURN',
                  },
                ],
              },
            },
            { choiceId: 'c1', label: '何もしない', action: { type: 'SEQUENCE', steps: [] } },
          ],
        } as ChooseAction,
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P06-007-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'DRAW', owner: 'self', count: 1 },
          { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P06-007-E3',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '青', count: 0 }] },
      usageLimit: 'once_per_game',
      action: {
        type: 'GRANT_EFFECT',
        target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
        duration: 'UNTIL_END_OF_TURN',
        effect: {
          effectId: 'WXDi-P06-007-E3-GRANT',
          effectType: 'AUTO',
          timing: ['ON_OPP_LIFE_CRASHED'],
          usageLimit: 'twice_per_turn',
          action: {
            type: 'CHOOSE',
            choose_count: 1,
            from_count: 2,
            choices: [
              { choiceId: 'c0', label: 'カードを1枚引く', action: { type: 'DRAW', owner: 'self', count: 1 } },
              { choiceId: 'c1', label: '対戦相手は手札を1枚捨てる', action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } },
            ],
          } as ChooseAction,
          duration: 'INSTANT',
          mandatory: true,
          parseStatus: 'MANUAL',
        },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WDK17-009 愛憎の果てに　ハイティ・鍵（キー・自ライフクラッシュ時3択）
  // 【自】《ターン１回》：対戦相手のアタックフェイズの間、あなたのライフクロスがクラッシュされたとき、以下の３つから１つを選ぶ。
  //   ①カードを１枚引く。②対戦相手のダウン状態のシグニ１体を対象とし、それをバニッシュする。
  //   ③あなたのセンタールリグが＜アルフォウ＞であなたのライフクロスが１枚以下の場合、対戦相手のライフクロス１枚をクラッシュする。
  // E1 を ON_PLAY の CHOOSE 誤パースから ON_LIFE_CRASHED（自ライフクラッシュ時）へ修正。キーは collectSelfEventTriggers が走査する（v0.362）。
  // 選択肢③は AND[LRIG_NAME_CONTAINS アルフォウ, LIFE_COUNT self lte 1] の condition で選択可否をゲート（execChoose の available）。
  // 「対戦相手のアタックフェイズの間」は近似で省略（自ライフクラッシュはほぼ相手アタック中に発生）。
  // E2（【起】このキーをルリグトラッシュ：対戦相手が自分のシグニ/エナを対象…）は対戦相手選択の複雑効果のためパーサー生成のまま維持。
  'WDK17-009': [
    {
      effectId: 'WDK17-009-E1',
      effectType: 'AUTO',
      timing: ['ON_LIFE_CRASHED'],
      triggerScope: 'self',
      usageLimit: 'once_per_turn',
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 3,
        choices: [
          {
            choiceId: 'c0',
            label: 'カードを1枚引く',
            action: { type: 'DRAW', owner: 'self', count: 1 },
          },
          {
            choiceId: 'c1',
            label: '対戦相手のダウン状態のシグニ1体をバニッシュ',
            action: {
              type: 'BANISH',
              target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', isDown: true }, upToCount: false },
            },
          },
          {
            choiceId: 'c2',
            label: '対戦相手のライフクロス1枚をクラッシュ',
            condition: {
              type: 'AND',
              conditions: [
                { type: 'LRIG_NAME_CONTAINS', owner: 'self', name: 'アルフォウ' },
                { type: 'LIFE_COUNT', owner: 'self', operator: 'lte', value: 1 },
              ],
            },
            action: { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true },
          },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX15-064 羅菌　キョウギュ（起動）
  // 【起】《ダウン》：対戦相手の感染状態のシグニ１体を対象とし、それと同じゾーンの【ウィルス】１つを取り除き、
  //   ターン終了時まで、それのパワーを－7000する。パワーが0以下になった場合、1枚引く。
  'WX15-064': [
    {
      effectId: 'WX15-064-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { down_self: true },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'POWER_MODIFY',
            target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', infected: true }, upToCount: false },
            delta: -7000,
          },
          { type: 'STUB', id: 'REMOVE_VIRUS_TARGET_ZONE' },
          { type: 'STUB', id: 'DRAW_IF_POWER_ZERO_TEMP' },
        ],
      } as SequenceAction,
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX05-020 幻水　シャチ（AUTO E2）
  // 【自】《ターン１回》：あなたの＜鉱石＞か＜宝石＞のシグニ１体が対戦相手のアーツの効果を受けたとき、
  //   対戦相手にダメージを与える。（近似: 相手がアーツを使用したとき、フィールドに該当シグニがいれば発動）
  'WX05-020': [
    {
      effectId: 'WX05-020-E2',
      effectType: 'AUTO',
      timing: ['ON_OPP_ARTS_USE'],
      triggerScope: 'self',
      activeCondition: {
        type: 'HAS_CARD_IN_FIELD',
        owner: 'self',
        filter: { cardType: 'シグニ', story: ['鉱石', '宝石'] },
      },
      action: { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX06-019 幻水　シロナクジ
  // 【常】あなたの他の＜水獣＞のシグニ1体が対戦相手の効果によって場を離れる場合、
  //   代わりにターン終了時まで、このシグニのパワーを－6000してもよい。
  'WX06-019': [
    {
      effectId: 'WX06-019-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'BANISH_SUBSTITUTE',
        trigger: { type: 'SIGNI', owner: 'self', count: 1, filter: { story: '水獣' } },
        substituteCost: { powerReduction: 6000 },
        optional: true,
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX06-022 大槍　トライデ
  // 【常】センタールリグが白かつ中央ゾーン在籍かぎり、基本パワーは10000になり、
  //   「対戦相手の効果によってバニッシュされない」を得る。（条件はPARTIAL）
  'WX06-022': [
    {
      effectId: 'WX06-022-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'POWER_SET', target: { type: 'SIGNI', owner: 'self', count: 1 }, value: 10000 },
          {
            type: 'GRANT_PROTECTION',
            target: { type: 'SIGNI', owner: 'self', count: 1 },
            from: ['シグニ', 'アーツ', 'スペル', 'ルリグ'],
            sourceOwner: 'opponent',
            duration: 'PERMANENT',
          },
        ],
      } as SequenceAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX06-033 反復する独自性　グリッド
  // 【出】このターン、あなたの効果によってデッキ上から公開する場合、代わりに1枚多く公開してもよい。
  //   （既存型では表現不可のためUNKNOWNアクション＋MANUALステータス）
  'WX06-033': [
    {
      effectId: 'WX06-033-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: { type: 'STUB', id: 'GRID_REVEAL_PLUS' },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX08-035 弩砲　トーピード（E1のみ）
  // 【常】あなたの場にある《クロスアイコン》を持つシグニ1体につき＋2000される。
  //   （アイコンフィルタ未対応のためPARTIAL：全シグニ1体ごと+2000で近似）
  'WX08-035': [
    {
      effectId: 'WX08-035-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: 2000,
        countFilter: { cardType: 'シグニ' },
        countOwner: 'self',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX09-CB02 終末の回旋　チェロン（E1のみ）
  // 【常】あなたの《クロスアイコン》を持つ＜美巧＞のシグニは対戦相手の効果によってバニッシュされない。
  //   （アイコンフィルタ未対応のためPARTIAL：美巧全体に保護で近似）
  'WX09-CB02': [
    {
      effectId: 'WX09-CB02-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_PROTECTION',
        target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { story: '美巧' } },
        from: ['シグニ', 'アーツ', 'スペル', 'ルリグ'],
        sourceOwner: 'opponent',
        duration: 'PERMANENT',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX10-018 暴風警報（スペル）
  // このターン、対戦相手のシグニかセンタールリグがアタックしたとき、
  //   1度目か2度目の場合、そのアタックを無効にする。（PARTIAL：全アタック防止で近似）
  'WX10-018': [
    {
      effectId: 'WX10-018-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 2 }] },
      action: { type: 'PREVENT_DAMAGE', owner: 'self', until: 'UNTIL_END_OF_TURN' },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX10-053 集結する守護（スペル）
  // コストはサーバントシグニ1体につき《無×2》減る（PARTIAL近似）。
  // ①トラッシュからサーバントシグニを2枚まで手札に。②サーバント全シグニ+5000+ランサー。
  'WX10-053': [
    {
      effectId: 'WX10-053-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '無', count: 7 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'COST_REDUCTION',
            targetCardType: 'スペル',
            reduction: [{ color: '無', count: 2 }],
            duration: 'PERMANENT',
          },
          {
            type: 'CHOOSE',
            choose_count: 1,
            from_count: 2,
            choices: [
              {
                choiceId: 'c0',
                label: '①サーバントを手札へ',
                action: {
                  type: 'TRANSFER_TO_HAND',
                  source: { type: 'TRASH_CARD', owner: 'self', count: 2, upToCount: true },
                },
              },
              {
                choiceId: 'c1',
                label: '②全サーバント+5000+ランサー',
                action: {
                  type: 'SEQUENCE',
                  steps: [
                    { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL' }, delta: 5000 },
                    { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 'ALL' }, keyword: 'ランサー', duration: 'UNTIL_END_OF_TURN' },
                  ],
                } as SequenceAction,
              },
            ],
          } as ChooseAction,
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX11-024 リフレッシュ・エンド（スペル）
  // このターン、対戦相手が次にリフレッシュした場合、その後でこのターンを終了する。
  //   （PARTIAL：リフレッシュ条件を省略しFORCE_END_TURNで近似）
  'WX11-024': [
    {
      effectId: 'WX11-024-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '無', count: 1 }] },
      action: { type: 'FORCE_END_TURN' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX05-016 ジャッジメント・クロス（アーツ）
  // 全5色コストで使用 → このターンを強制終了する
  'WX05-016': [
    {
      effectId: 'WX05-016-E1',
      effectType: 'ACTIVATED',
      timing: ['SPELL_CUTIN'],
      cost: {
        energy: [
          { color: '白', count: 1 },
          { color: '赤', count: 1 },
          { color: '青', count: 1 },
          { color: '緑', count: 1 },
          { color: '黒', count: 1 },
        ],
      },
      action: { type: 'FORCE_END_TURN' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX01-028 アーク・オーラ（スペル、コスト《白》×5、タマ限定）
  // ターン終了時まで、あなたのセンタールリグは
  // 「【自】：このルリグがアタックしたとき、あなたのシグニ１体を場からトラッシュに置いてもよい。
  //   そうした場合、このルリグをアップする。」を得る。
  'WX01-028': [
    {
      effectId: 'WX01-028-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '白', count: 5 }] },
      action: {
        type: 'GRANT_LRIG_ABILITY',
        abilities: [
          {
            effectId: 'WX01-028-AUTO',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_LRIG'],
            action: {
              type: 'CHOOSE',
              choose_count: 1,
              from_count: 2,
              choices: [
                {
                  choiceId: 'trash_and_up',
                  label: 'シグニ１体をトラッシュしてルリグをアップ',
                  action: {
                    type: 'SEQUENCE',
                    steps: [
                      { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } },
                      { type: 'UP', target: { type: 'LRIG', owner: 'self', count: 1 } },
                    ],
                  } as SequenceAction,
                },
                {
                  choiceId: 'skip',
                  label: 'トラッシュしない',
                  action: { type: 'SEQUENCE', steps: [] } as SequenceAction,
                },
              ],
            } as ChooseAction,
            duration: 'INSTANT',
            mandatory: false,
            parseStatus: 'AUTO',
          },
        ] as CardEffect[],
        rawText: 'このルリグがアタックしたとき、シグニ１体をトラッシュしてもよい。そうした場合、このルリグをアップする。',
      } as GrantLrigAbilityAction,
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX01-057 出弓　セフィラム
  // 【出】：あなたのデッキの一番上を見る。
  //         それがLv.2以下のシグニで自分の場に他のシグニがない場合、それを場に出してもよい。
  'WX01-057': [
    {
      effectId: 'WX01-057-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'LOOK_AND_REORDER',
            source: { location: 'deck', owner: 'self' },
            count: 1,
            private: true,
            reorder: false,
            destination: { location: 'deck', owner: 'self', position: 'top' },
          },
          {
            // 条件：デッキトップがLv.2以下のシグニ かつ 自分の場に他のシグニがない（自身のみ=1体）
            type: 'CONDITIONAL',
            condition: {
              type: 'AND',
              conditions: [
                { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', level: { max: 2 } } },
                { type: 'FIELD_COUNT', owner: 'self', operator: 'eq', value: 1 },
              ],
            },
            then: {
              type: 'CHOOSE',
              choose_count: 1,
              choices: [
                {
                  choiceId: 'yes',
                  label: 'デッキトップを場に出す',
                  action: { type: 'ADD_TO_FIELD', owner: 'self' },
                },
                {
                  choiceId: 'no',
                  label: '場に出さない',
                  action: { type: 'SEQUENCE', steps: [] },
                },
              ],
            } as ChooseAction,
          },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WX01-057-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: { type: 'DRAW', owner: 'self', count: 1 },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WXK04-060 羅植 ガウラ: ON_BANISH は「対戦相手のターンの間」のみ
  // パーサーが activeCondition を解析できないため手動で設定
  'WXK04-060': [
    {
      effectId: 'WXK04-060-E1',
      effectType: 'AUTO',
      timing: ['ON_BANISH'],
      activeCondition: { type: 'TURN_OWNER', owner: 'opponent' },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'LOOK_AND_REORDER',
            source: { location: 'deck', owner: 'self' },
            count: 1,
            private: true,
            reorder: false,
            destination: { location: 'deck', owner: 'self', position: 'top' },
          } as import('../types/effects').LookAndReorderAction,
          { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as import('../types/effects').StubAction,
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WXK09-TK-01A 改造素材（アーツ/クラフト）
  // このターン改造素材使用不可 + 電機シグニ対象に①+4000 ②起動能力付与 ③自動能力付与 から1つ選択
  'WXK09-TK-01A': [
    {
      effectId: 'WXK09-TK-01A-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 0 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'BLOCK_CARD_USE', cardName: '改造素材' },
          { type: 'STUB', id: 'DO_THREE_THINGS' },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WXDi-P11-TK01 白羅星姫　サタン（レゾナクラフト）
  // 【常】あなたのターンの間、対戦相手はシグニを２体までしか場に出すことができない
  'WXDi-P11-TK01': [
    {
      effectId: 'WXDi-P11-TK01-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'TURN_OWNER', owner: 'self' },
      action: { type: 'STUB', id: 'OPP_ZONE_PLACEMENT_RESTRICT' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // PR-Di017A 白熱する黒白（スペル）
  // カードを2枚引く。ライフクロスが1枚以下の場合、チェックゾーンのカードを裏返して場に出す（REV）
  'PR-Di017A': [
    {
      effectId: 'PR-Di017A-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '無', count: 2 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'DRAW', owner: 'self', count: 2 },
          { type: 'STUB', id: 'PLACE_REV_SIGNI', value: 'PR-Di017B' },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // PR-Di017B REV:アンコーリング（シグニ）
  // 【自】アタックフェイズ開始時、対戦相手のシグニ1体を対象とし、手札を3枚捨ててもよい→トラッシュ
  'PR-Di017B': [
    {
      effectId: 'PR-Di017B-E1',
      effectType: 'AUTO',
      timing: ['ATTACK'],
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'STUB', id: 'TARGET_ONLY' },
          {
            type: 'STUB', id: 'OPTIONAL_COST',
            costColors: [],
            costText: '手札を３枚捨てる',
          },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WXDi-P14-TK04 フェゾーネマジック・深緑（スペル/クラフト）
  // 【エナチャージ１】をする。その後、あなたのエナゾーンからシグニを１枚まで対象とし、それを場に出す
  'WXDi-P14-TK04': [
    {
      effectId: 'WXDi-P14-TK04-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 0 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
          { type: 'STUB', id: 'SUMMON_FROM_ENERGY' },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WXDi-P09-TK03A コードイート　オンタマ（アクセクラフト）
  // 『【常】：これにアクセされているシグニが場を離れる場合、代わりにこれをゲームから除外してもよい。そうした場合、そのシグニをダウンする。』
  'WXDi-P09-TK03A': [
    {
      effectId: 'WXDi-P09-TK03A-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'ACCE_BANISH_SUBSTITUTE' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX25-P2-TK05 蒼穹将姫　ニヴルヘイム（シグニ/レゾナクラフト）
  // 【常】：対戦相手はドローフェイズの間にカードを合計１枚までしか引けない。
  // 【自】：このシグニが場を離れたとき、カードを２枚引くか、対戦相手は手札を２枚捨てる。
  'WX25-P2-TK05': [
    {
      effectId: 'WX25-P2-TK05-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'OPP_DRAW_LIMIT_PER_TURN' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WX25-P2-TK05-E2',
      effectType: 'AUTO',
      timing: ['ON_BANISH'],
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          {
            choiceId: 'draw2',
            label: 'カードを２枚引く',
            action: { type: 'DRAW', owner: 'self', count: 2 } as import('../types/effects').DrawAction,
          },
          {
            choiceId: 'opp_discard2',
            label: '対戦相手は手札を２枚捨てる',
            action: {
              type: 'TRASH',
              target: { type: 'HAND_CARD', owner: 'opponent', count: 2 },
            } as import('../types/effects').TrashAction,
          },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX08-005 エナゾーン以外の領域にあるカードは白になる（CONTINUOUS）
  'WX08-005': [
    {
      effectId: 'WX08-005-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'CARDS_OUTSIDE_ENERGY_BECOME_WHITE' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX08-006 対戦相手は【チャーム】が付いているシグニの【起】能力を使用できない（CONTINUOUS）
  'WX08-006': [
    {
      effectId: 'WX08-006-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'RESTRICT_CHARMED_SIGNI_ACTIVATED' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX08-029 （クロス時）あなたのエナゾーンからカード１枚を手札に加えてもよい（AUTO / ON_HEAVEN）
  'WX08-029': [
    {
      effectId: 'WX08-029-E3',
      effectType: 'AUTO',
      timing: ['ON_HEAVEN'],
      action: {
        type: 'TRANSFER_TO_HAND',
        source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
      crossOnly: true,
    },
  ],

  // WX10-006 このシグニがアタックしたとき、あなたのエナゾーンからカード１枚を手札に加えてもよい（AUTO / ON_ATTACK_SIGNI）
  'WX10-006': [
    {
      effectId: 'WX10-006-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      action: {
        type: 'TRANSFER_TO_HAND',
        source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX14-017 あなたのエナゾーンにある無色ではないカードはすべての色を持つ（CONTINUOUS）
  'WX14-017': [
    {
      effectId: 'WX14-017-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'ENERGY_NON_COLORLESS_ALL_COLORS' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WXEX1-26 対戦相手のセンタールリグの基本リミットは５になる（CONTINUOUS）
  'WXEX1-26': [
    {
      effectId: 'WXEX1-26-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'OPP_CENTER_LRIG_LIMIT_SET_5' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WXDi-CP02-TK01A ペロロ人形（シグニ/クラフト）
  // 【常】：対戦相手のシグニが正面にアタックする場合、代わりにこのシグニのあるシグニゾーンにアタックする。
  // 【常】：アップ状態のこのシグニがバトルか対戦相手の効果によって場を離れる場合、代わりにこのシグニをダウンしてもよい。
  // 【自】：対戦相手のターン終了時、このシグニをゲームから除外する。
  'WXDi-CP02-TK01A': [
    {
      effectId: 'WXDi-CP02-TK01A-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'REDIRECT_ATTACK_TO_SELF_ZONE' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WXDi-CP02-TK01A-E2',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BATTLE_LEAVE_REPLACE_WITH_DOWN' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WXDi-CP02-TK01A-E3',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      activeCondition: { type: 'TURN_OWNER', owner: 'opponent' },
      action: { type: 'STUB', id: 'REMOVE_SELF_SIGNI_FROM_GAME' } as import('../types/effects').StubAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX08-022 【起】手札を１枚捨てる。そうした場合、あなたのデッキの上からカードを２枚エナゾーンに置く。
  // 「手札を捨てる」はコスト扱いにして、手札がない場合は起動不可にする
  'WX08-022': [
    {
      effectId: 'WX08-022-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { discard: 1 },
      action: {
        type: 'ENERGY_CHARGE_FROM_DECK',
        owner: 'self',
        count: 2,
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX19-045 羅菌　ポレン（起動）
  // 【起】《アタックフェイズ》手札からこのカードを捨てる：
  //   相手の場のウィルス合計が2つになるように相手のシグニゾーンにウィルスを置く。＜ナナシ＞限定。
  // PLACE_VIRUS の fillToTotal:2 で「合計が2個になるよう不足分を配置先選択して置く」。
  // 旧 STUB PLACE_VIRUS_TO_2（空きゾーン自動配置）から、配置先をプレイヤーが選べる正式アクションへ。
  'WX19-045': [
    {
      effectId: 'WX19-045-E1',
      effectType: 'ACTIVATED',
      timing: ['ATTACK_ARTS'],
      condition: { type: 'LRIG_STORY', owner: 'self', story: 'ナナシ' },
      cost: { discardSelfFromHand: true },
      action: { type: 'PLACE_VIRUS', targetOwner: 'opponent', zoneCount: 2, virusCount: 1, fillToTotal: 2 },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
      handActivated: true,
    },
  ],

  // WX22-016 グレイブ・ディガー（ベット―好きな枚数）
  // ベットのコイン1枚につき2択（①コスト減 ②効果1回繰り返し）。パーサーは多択ベットを
  // BET_MECHANIC stub 化するため、CHOOSE 構造を保持するマニュアル上書き。
  'WX22-016': [
    {
      effectId: 'WX22-016-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN', 'ATTACK'],
      cost: { energy: [{ color: '黒', count: 6 }] },
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          {
            choiceId: 'c0',
            label: '選択肢1',
            action: { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' },
          },
          {
            choiceId: 'c1',
            label: '選択肢2',
            action: {
              type: 'SEQUENCE',
              steps: [
                { type: 'STUB', id: 'REPEAT_EFFECT' },
                {
                  type: 'TRANSFER_TO_HAND',
                  source: {
                    type: 'TRASH_CARD',
                    owner: 'self',
                    count: 1,
                    upToCount: false,
                    filter: { cardType: 'シグニ' },
                  },
                },
              ],
            },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WD21-007 自由自罪（ベット―《コイン》《コイン》）
  // 5択から1つ選び対象シグニに付与、ベット時もう1回。パーサーは多択ベットを
  // BET_MECHANIC stub 化するため、GRANT_QUOTED_AUTO_ABILITY stub を保持する上書き。
  'WD21-007': [
    {
      effectId: 'WD21-007-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN', 'ATTACK', 'SPELL_CUTIN'],
      cost: { energy: [{ color: '赤', count: 2 }] },
      action: { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WD19-018 ラブリー・バイオ（スペル）
  // 以下の２つから１つを選ぶ。
  // ①自分の＜微菌＞のシグニ１体をバニッシュ → 相手シグニゾーン１つにウィルスを置く
  // ②自分の＜微菌＞のシグニ１体をバニッシュ → 相手シグニ１体のパワーを－7000（ターン終了時まで）
  'WD19-018': [
    {
      effectId: 'WD19-018-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '黒', count: 0 }] },
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          {
            choiceId: 'c0',
            label: '①自分の＜微菌＞シグニをバニッシュ→ウィルス',
            action: {
              type: 'SEQUENCE',
              steps: [
                {
                  type: 'BANISH',
                  target: {
                    type: 'SIGNI',
                    owner: 'self',
                    count: 1,
                    filter: { cardType: 'シグニ', cardClass: '微菌' },
                    upToCount: false,
                  },
                },
                {
                  type: 'PLACE_VIRUS',
                  targetOwner: 'opponent',
                  zoneCount: 1,
                  virusCount: 1,
                },
              ],
            },
          },
          {
            choiceId: 'c1',
            label: '②自分の＜微菌＞シグニをバニッシュ→相手シグニ－7000',
            action: {
              type: 'SEQUENCE',
              steps: [
                {
                  type: 'BANISH',
                  target: {
                    type: 'SIGNI',
                    owner: 'self',
                    count: 1,
                    filter: { cardType: 'シグニ', cardClass: '微菌' },
                    upToCount: false,
                  },
                },
                {
                  type: 'POWER_MODIFY',
                  target: {
                    type: 'SIGNI',
                    owner: 'opponent',
                    count: 1,
                    filter: { cardType: 'シグニ' },
                    upToCount: false,
                  },
                  delta: -7000,
                },
              ],
            },
          },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // ===== F-2: 引用付与トリガー能力のフラット化誤解析の修正（CONTINUOUS TRASH → 条件付き/付与トリガー） =====

  // WX06-029 コードアート　Ｏ・Ｓ・Ｓ
  // 【常】：あなたのセンタールリグが青で、このシグニが中央のシグニゾーンにあるかぎり、
  //         このシグニは「【自】：このシグニがアタックしたとき、対戦相手は手札を１枚捨てる。」を得る。
  // 旧パース＝CONTINUOUS TRASH HAND_CARD（calcContinuousSigniMutations を通らず no-op）。
  // 「〜であるかぎり『【自】アタック時…』を得る」型は condition 付き AUTO ON_ATTACK_SIGNI として表現
  //（BattleScreen の ON_ATTACK_SIGNI 収集が evalUseCondition で発動条件を評価する既存パターン）。
  'WX06-029': [
    {
      effectId: 'WX06-029-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: {
        type: 'AND',
        conditions: [
          { type: 'LRIG_COLOR', owner: 'self', color: '青' },
          { type: 'THIS_CARD_IN_CENTER_ZONE' },
        ],
      },
      action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P04-082 凶将　ブルータス
  // 【常】：このシグニは中央のシグニゾーンにあるかぎり、
  //         「【自】：このシグニがアタックしたとき、あなたか対戦相手のデッキの上からカードを４枚トラッシュに置く。」を得る。
  // 旧パース＝CONTINUOUS TRASH DECK_CARD self（no-op）。中央条件付き AUTO ON_ATTACK_SIGNI＋CHOOSE（自/相手デッキ）。
  'WXDi-P04-082': [
    {
      effectId: 'WXDi-P04-082-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: { type: 'THIS_CARD_IN_CENTER_ZONE' },
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          { choiceId: 'self_deck', label: 'あなたのデッキの上から４枚をトラッシュ', action: { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 4 } } },
          { choiceId: 'opp_deck', label: '対戦相手のデッキの上から４枚をトラッシュ', action: { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'opponent', count: 4 } } },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P15-098 凶将　アオトラ
  // 【常】：あなたの黒のシグニは「【自】：このシグニがアタックしたとき、対戦相手のデッキの一番上のカードをトラッシュに置く。」を得る。
  // 旧パース＝CONTINUOUS TRASH DECK_CARD self（owner も誤り・no-op）。
  // 自分の黒シグニ全体への付与＝GRANT_FIELD_SIGNI_ABILITY（collectGrantedFromLayer が augMap へ合成）。
  // 付与能力は ON_ATTACK_SIGNI で相手デッキ上1枚をトラッシュ（mill）。BURST はパーサー生成を維持。
  'WXDi-P15-098': [
    {
      effectId: 'WXDi-P15-098-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_FIELD_SIGNI_ABILITY',
        filter: { cardType: 'シグニ', color: '黒' },
        abilities: [
          {
            effectId: 'WXDi-P15-098-E1-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_SIGNI'],
            triggerScope: 'self',
            action: { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'opponent', count: 1 } },
            duration: 'INSTANT',
            mandatory: true,
            parseStatus: 'MANUAL',
          },
        ],
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX12-018 真天使の未来　ガブリエルト
  // 【常】このシグニは対戦相手の、アーツ以外の効果を受けない。（E1: GRANT_PROTECTION、パーサー生成を維持）
  // 【常】あなたのルリグトラッシュにアーツが４枚以上あるかぎり、このシグニは
  //   「【自】このシグニがアタックしたとき、あなたの場に＜天使＞のシグニが３体ある場合、対戦相手のすべてのシグニをトラッシュに置く。」を得る。
  // 旧 E2 パース＝CONTINUOUS TRASH SIGNI opponent ALL（no-op）。条件付き AUTO ON_ATTACK_SIGNI に修正。
  // E1（protection）と BURST は override しないため JSON のパーサー生成が残る。
  'WX12-018': [
    {
      effectId: 'WX12-018-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: {
        type: 'AND',
        conditions: [
          { type: 'LRIG_TRASH_COUNT', cardType: 'アーツ', operator: 'gte', value: 4 },
          { type: 'FIELD_CLASS_COUNT', owner: 'self', story: '天使', operator: 'gte', value: 3 },
        ],
      },
      action: { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P09-058 幻獣　LOVIT//メモリア
  // 【常】このシグニは覚醒状態であるかぎり、「【自】あなたのターン終了時、対戦相手のエナゾーンから
  //   対戦相手のセンタールリグと共通する色を持たないカード１枚を対象とし、それをトラッシュに置く。」を得る。
  // 【自】このシグニがバトルによって対戦相手のシグニ１体をバニッシュしたとき、このシグニは覚醒する。
  // 旧パース＝E1: CONTINUOUS TRASH ENERGY（no-op）、E2: ON_PLAY AWAKEN（召喚時覚醒の誤パース）。
  // E1 を「覚醒中」condition 付き AUTO ON_TURN_END に修正。相手エナの「相手センターと共通しない色」は
  //   energy 対象で colorNotMatchesLrig が対象オーナー（相手）のルリグ基準で colorExclude へ解決される（execExecutor）。
  // E2 を ON_SIGNI_BATTLE→AWAKEN_SIGNI に修正（バトル成立時に発火。「バニッシュした」勝利限定は専用情報がなく近似）。
  'WXDi-P09-058': [
    {
      effectId: 'WXDi-P09-058-E1',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      triggerScope: 'self',
      condition: { type: 'THIS_CARD_IS_AWAKENED' },
      action: {
        type: 'TRASH',
        target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1, filter: { colorNotMatchesLrig: true } },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P09-058-E2',
      effectType: 'AUTO',
      timing: ['ON_SIGNI_BATTLE'],
      triggerScope: 'self',
      action: { type: 'AWAKEN_SIGNI' },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P15-060 幻竜　遊月//THE DOOR
  // 【常】このカードの上にある＜解放派＞のシグニは「【自】あなたのアタックフェイズ開始時、
  //   対戦相手のエナゾーンから対戦相手のセンタールリグと共通する色を持たないカード１枚を対象とし、それをトラッシュに置く。」を得る。
  // 旧 E2 パース＝CONTINUOUS TRASH ENERGY（no-op）。上シグニ付与＝GRANT_SIGNI_ABOVE_ABILITY（collectGrantedFromUnderSigni PatternB）。
  // E1（下にカードがあるかぎり+4000）と BURST はパーサー生成を維持。
  'WXDi-P15-060': [
    {
      effectId: 'WXDi-P15-060-E2',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_SIGNI_ABOVE_ABILITY',
        filter: { cardType: 'シグニ', story: '解放派' },
        abilities: [
          {
            effectId: 'WXDi-P15-060-E2-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_PHASE_START'],
            triggerScope: 'self',
            action: {
              type: 'TRASH',
              target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1, filter: { colorNotMatchesLrig: true } },
            },
            duration: 'INSTANT',
            mandatory: true,
            parseStatus: 'MANUAL',
          },
        ],
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P15-064 幻蟲　アロス・ピルルク//THE DOOR
  // 【常】このカードの上にある＜解放派＞のシグニは「【自】あなたのアタックフェイズ開始時、手札を１枚捨ててもよい。
  //   そうした場合、対戦相手の手札を１枚見ないで選び、捨てさせる。」を得る。
  // 旧 E2 パース＝CONTINUOUS TRASH HAND opponent blind（no-op）。上シグニ付与＝GRANT_SIGNI_ABOVE_ABILITY。
  // 付与能力は ON_ATTACK_PHASE_START の「手札1枚捨て→相手手札を見ないで1枚捨てさせる(blind)」。
  // 「捨ててもよい」の任意性は SEQUENCE＋CONDITIONAL(IS_MY_TURN) で近似（同カード E1 の生成パターンに合わせる）。
  'WXDi-P15-064': [
    {
      effectId: 'WXDi-P15-064-E2',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_SIGNI_ABOVE_ABILITY',
        filter: { cardType: 'シグニ', story: '解放派' },
        abilities: [
          {
            effectId: 'WXDi-P15-064-E2-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_PHASE_START'],
            triggerScope: 'self',
            action: {
              type: 'SEQUENCE',
              steps: [
                { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } },
                { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, blind: true } } },
              ],
            } as SequenceAction,
            duration: 'INSTANT',
            mandatory: true,
            parseStatus: 'MANUAL',
          },
        ],
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P02-068 蒼将　ヒジカタ
  // 【常】このターンに手札を２枚以上捨てていたかぎり、このシグニは
  //   「【自】このシグニがバトルによって対戦相手のシグニをバニッシュしたとき、対戦相手の手札を１枚見ないで選び、捨てさせる。」を得る。
  // 旧 E2 パース＝CONTINUOUS TRASH HAND opponent blind（no-op）。
  // condition 付き AUTO ON_SIGNI_BATTLE に修正（ON_SIGNI_BATTLE 収集に condition 評価を追加済み）。
  // 「バトルによってバニッシュした」勝利限定はバッチ2の P09-058 と同じくバトル成立時で近似。
  // E1（このターンに手札1枚以上捨てた→+3000）はパーサー生成を維持（条件欠落は別の軽微な未対応）。
  'WXDi-P02-068': [
    {
      effectId: 'WXDi-P02-068-E2',
      effectType: 'AUTO',
      timing: ['ON_SIGNI_BATTLE'],
      triggerScope: 'self',
      condition: { type: 'TURN_HAND_DISCARD_GTE', value: 2 },
      action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, blind: true } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P05-032 大装　ゲイヴォルグ
  // 【常】あなたのセンタールリグは「【自】《ターン１回》：このルリグがアタックしたとき、対戦相手のシグニ１体を対象とし、それをトラッシュに置く。」を得る。
  // 旧 E1 パース＝CONTINUOUS TRASH SIGNI opponent（no-op）。CONTINUOUS GRANT_LRIG_ABILITY でセンタールリグへ
  //   ON_ATTACK_LRIG 能力を付与（collectLrigGrantedEffects→ON_ATTACK_LRIG 収集に配線済み）。
  // E2（アタックフェイズ開始時に白シグニ1体ダウン→ドロー）はパーサー生成を維持。
  'WXDi-P05-032': [
    {
      effectId: 'WXDi-P05-032-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_LRIG_ABILITY',
        rawText: 'あなたのセンタールリグは「【自】《ターン１回》：このルリグがアタックしたとき、対戦相手のシグニ１体を対象とし、それをトラッシュに置く。」を得る。',
        abilities: [
          {
            effectId: 'WXDi-P05-032-E1-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_LRIG'],
            triggerScope: 'self',
            usageLimit: 'once_per_turn',
            action: { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
            duration: 'INSTANT',
            mandatory: true,
            parseStatus: 'MANUAL',
          },
        ],
      } as GrantLrigAbilityAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX17-036 幻怪　ブラウニー
  // 【常】：あなたのすべての領域にある＜怪異＞のシグニであるカードは
  //   【ライフバースト】「対戦相手のシグニ１体を対象とし、それをトラッシュに置く。」を持つ。
  // 旧パース＝CONTINUOUS TRASH SIGNI opponent（no-op）。全領域へのバースト付与は既存 STUB GRANT_ALL_ZONE_LIFEBURST
  //   を burstFilter（＜怪異＞シグニ限定）＋burstAction（相手シグニ1体トラッシュ）対応に拡張して実装（WD14-001 は既定値で不変）。
  'WX17-036': [
    {
      effectId: 'WX17-036-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'STUB',
        id: 'GRANT_ALL_ZONE_LIFEBURST',
        burstFilter: { cardType: 'シグニ', story: '怪異' },
        burstAction: { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK04-048 コードイート　アイスケーキ
  // E1【常】このシグニは【アクセ】が付いているかぎり、「【自】このシグニがアタックしたとき、
  //    《青》を支払ってもよい。そうした場合、対戦相手は手札を１枚捨てる。」を得る。
  // E2【常】これにアクセされているレベル３以上のシグニは「【自】このシグニがアタックしたとき、対戦相手は手札を１枚捨てる。」を得る。
  // 旧パース＝E1/E2 とも CONTINUOUS TRASH HAND opponent（no-op）。BURST はパーサー生成を維持。
  // E1: アクセ付き条件付き AUTO ON_ATTACK_SIGNI＋任意《青》コスト（OPTIONAL_COST→PAID_ADDITIONAL_COST ゲート）。
  // E2: GRANT_ACCE_HOST_ABILITY（ホスト＝レベル3以上）で ON_ATTACK_SIGNI の相手手札捨てを付与。
  'WXK04-048': [
    {
      effectId: 'WXK04-048-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: { type: 'THIS_CARD_IS_ACCED' },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['青'] },
          { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' }, then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXK04-048-E2',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_ACCE_HOST_ABILITY',
        filter: { cardType: 'シグニ', levelRange: { min: 3 } },
        abilities: [
          {
            effectId: 'WXK04-048-E2-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_SIGNI'],
            triggerScope: 'self',
            action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
            duration: 'INSTANT',
            mandatory: true,
            parseStatus: 'MANUAL',
          },
        ],
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX21-054 幻竜　ディノス
  // 【常】対戦相手のエナゾーンにカードが５枚以上あるかぎり、このシグニは
  //   「【自】：このシグニが対戦相手にダメージを与えたとき、対戦相手のエナゾーンからカード１枚を対象とし、それをトラッシュに置く。」を得る。
  // 旧 E1 パース＝CONTINUOUS TRASH ENERGY（no-op）。新 timing ON_SIGNI_DAMAGE（正面空きでライフをクラッシュした時）
  //   ＋condition ENERGY_COUNT(opp,gte,5) の AUTO に修正。E2（手札公開 or 自己トラッシュ）と BURST は維持。
  'WX21-054': [
    {
      effectId: 'WX21-054-E1',
      effectType: 'AUTO',
      timing: ['ON_SIGNI_DAMAGE'],
      triggerScope: 'self',
      condition: { type: 'ENERGY_COUNT', owner: 'opponent', operator: 'gte', value: 5 },
      action: { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

};

/**
 * 自動解析結果とマニュアル効果をマージする。
 * - manualEffects 内の effectId が一致するものは上書き
 * - 一致しない effectId は末尾に追加
 */
export function mergeManualEffects(
  cardNum: string,
  parsed: CardEffect[],
): CardEffect[] {
  const manuals = MANUAL_EFFECTS[cardNum];
  if (!manuals || manuals.length === 0) return parsed;

  const manualMap = new Map(manuals.map(e => [e.effectId, e]));
  const merged = parsed.map(e => manualMap.has(e.effectId) ? manualMap.get(e.effectId)! : e);
  for (const m of manuals) {
    if (!merged.some(e => e.effectId === m.effectId)) merged.push(m);
  }
  return merged;
}
