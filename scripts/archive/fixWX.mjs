/**
 * fixWX.mjs - effects_WX.json の実装ミスを修正するスクリプト
 *
 * 修正対象カード（CHOOSE欠落）：
 * 1. WX10-023 ブラック・コフィン - 2択なのにCHOOSEなし（choice②のみ実装）
 * 2. WX14-011 炎得火失 - 2択なのにCHOOSEなし（choice②の一部のみ実装）
 * 3. WX17-020 エニー・チョイス - 3択なのにCHOOSEなし
 * 4. WX20-021 バイ・ザ・ウェイ - 3択2つ選ぶなのにCHOOSEなし
 * 5. WX21-020 プライマル・サーガ - 3択なのにDRAWのみ
 * 6. WX17-Re04 快演 - 2択なのにCHOOSEなし
 * 7. WX16-Re01 スター・フェスティバル - 2択なのにCHOOSEなし
 * 8. WX16-Re10 キャッチ・リリース - 2択なのにCHOOSEなし
 * 9. WX12-Re13 龍炎の昇拳 - 2択なのにCHOOSEなし
 * 10. WX12-Re21 トーチュン・ウィップ - 2択なのにCHOOSEなし
 * 11. WX14-037 進撃の炎軍 - 2択なのにCHOOSEなし
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const filePath = path.join(root, 'public/data/effects_WX.json');

const effects = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// =====================================================================
// 修正1: WX10-023 ブラック・コフィン
// 以下の２つから１つを選ぶ。
// ①あなたのトラッシュからセンタールリグと同色のシグニ１枚を手札に加える
// ②対戦相手のトラッシュのスペル１枚を除外しゲーム中使用禁止にする
// =====================================================================
effects['WX10-023'] = [
  {
    effectId: 'WX10-023-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN', 'SPELL_CUTIN'],
    cost: {
      energy: [{ color: '黒', count: 1 }]
    },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 2,
      choices: [
        {
          choiceId: 'c0',
          label: '①トラッシュから同色シグニを手札に加える',
          action: {
            type: 'TRANSFER_TO_HAND',
            source: {
              type: 'TRASH_CARD',
              owner: 'self',
              count: 1,
              upToCount: false,
              filter: {
                cardType: 'シグニ',
                matchCenterLrigColor: true
              }
            }
          }
        },
        {
          choiceId: 'c1',
          label: '②対戦相手のトラッシュのスペルを除外し使用禁止',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'EXILE',
                source: {
                  type: 'TRASH_CARD',
                  owner: 'opponent',
                  count: 1,
                  filter: { cardType: 'スペル' }
                }
              },
              {
                type: 'NAME_BAN',
                targetSelf: false,
                duration: 'GAME'
              }
            ]
          }
        }
      ]
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL'
  }
];

// =====================================================================
// 修正2: WX14-011 炎得火失
// 以下の２つから１つを選ぶ。
// ①カードを４枚引く。その後、対戦相手はあなたの手札を２枚見ないで選び、あなたはそれらをゲームから除外する
// ②対戦相手のシグニ１体をバニッシュ。対戦相手はカード1枚引き、デッキ1番上をエナゾーンに置く
// =====================================================================
effects['WX14-011'] = [
  {
    effectId: 'WX14-011-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN', 'ATTACK'],
    cost: {
      energy: [{ color: '赤', count: 1 }]
    },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 2,
      choices: [
        {
          choiceId: 'c0',
          label: '①カード4枚引き→相手が手札2枚選び除外',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'DRAW',
                owner: 'self',
                count: 4
              },
              {
                type: 'EXILE',
                source: {
                  type: 'HAND_CARD',
                  owner: 'self',
                  count: 2,
                  upToCount: false,
                  selectedBy: 'opponent'
                }
              }
            ]
          }
        },
        {
          choiceId: 'c1',
          label: '②対戦相手のシグニ1体バニッシュ（相手は1ドロー＋エナ1）',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'opponent',
                  count: 1,
                  filter: { cardType: 'シグニ' },
                  upToCount: false
                }
              },
              {
                type: 'DRAW',
                owner: 'opponent',
                count: 1
              },
              {
                type: 'ENERGY_CHARGE_FROM_DECK',
                owner: 'opponent',
                count: 1
              }
            ]
          }
        }
      ]
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL'
  }
];

// =====================================================================
// 修正3: WX17-020 エニー・チョイス
// 以下の３つから１つを選ぶ。
// ①カードを２枚引き、手札を１枚捨てる
// ②対戦相手のシグニ１体をダウン。手札を１枚捨てる
// ③対戦相手のセンタールリグを凍結。手札を１枚捨てる
// =====================================================================
effects['WX17-020'] = [
  {
    effectId: 'WX17-020-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN', 'ATTACK'],
    cost: {
      energy: [{ color: '青', count: 1 }]
    },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 3,
      choices: [
        {
          choiceId: 'c0',
          label: '①2ドロー→手札1枚捨て',
          action: {
            type: 'SEQUENCE',
            steps: [
              { type: 'DRAW', owner: 'self', count: 2 },
              {
                type: 'TRASH',
                target: {
                  type: 'HAND_CARD',
                  owner: 'self',
                  count: 1
                }
              }
            ]
          }
        },
        {
          choiceId: 'c1',
          label: '②対戦相手のシグニ1体をダウン→手札1枚捨て',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'DOWN',
                target: {
                  type: 'SIGNI',
                  owner: 'opponent',
                  count: 1,
                  filter: { cardType: 'シグニ' }
                }
              },
              {
                type: 'TRASH',
                target: {
                  type: 'HAND_CARD',
                  owner: 'self',
                  count: 1
                }
              }
            ]
          }
        },
        {
          choiceId: 'c2',
          label: '③対戦相手のセンタールリグを凍結→手札1枚捨て',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'FREEZE',
                target: {
                  type: 'LRIG',
                  owner: 'opponent',
                  count: 1,
                  filter: { isCenter: true }
                }
              },
              {
                type: 'TRASH',
                target: {
                  type: 'HAND_CARD',
                  owner: 'self',
                  count: 1
                }
              }
            ]
          }
        }
      ]
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL'
  }
];

// =====================================================================
// 修正4: WX20-021 バイ・ザ・ウェイ
// 対戦相手のターンにしか使用できない。以下の３つから２つまで選ぶ。
// ①対戦相手の手札が７枚以上ある場合、手札を４枚捨てさせる
// ②対戦相手のエナが10枚以上ある場合、エナ5枚をトラッシュに
// ③デッキの一番上をエナゾーンに
// =====================================================================
effects['WX20-021'] = [
  {
    effectId: 'WX20-021-E1',
    effectType: 'ACTIVATED',
    timing: ['ATTACK'],
    cost: {
      energy: [{ color: '無', count: 0 }]
    },
    action: {
      type: 'CHOOSE',
      choose_count: 2,
      from_count: 3,
      choices: [
        {
          choiceId: 'c0',
          label: '①手札7枚以上の場合、相手の手札4枚捨て',
          action: {
            type: 'CONDITIONAL',
            condition: {
              type: 'OPPONENT_HAND_COUNT_GTE',
              count: 7
            },
            then: {
              type: 'TRASH',
              target: {
                type: 'HAND_CARD',
                owner: 'opponent',
                count: 4,
                selectedBy: 'self'
              }
            }
          }
        },
        {
          choiceId: 'c1',
          label: '②エナ10枚以上の場合、相手のエナ5枚をトラッシュに',
          action: {
            type: 'CONDITIONAL',
            condition: {
              type: 'OPPONENT_ENERGY_COUNT_GTE',
              count: 10
            },
            then: {
              type: 'TRASH',
              target: {
                type: 'ENERGY_CARD',
                owner: 'opponent',
                count: 5,
                selectedBy: 'opponent'
              }
            }
          }
        },
        {
          choiceId: 'c2',
          label: '③デッキの一番上をエナゾーンに置く',
          action: {
            type: 'ENERGY_CHARGE_FROM_DECK',
            owner: 'self',
            count: 1
          }
        }
      ]
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL'
  }
];

// =====================================================================
// 修正5: WX21-020 プライマル・サーガ
// 以下の３つから１つを選ぶ。
// ①デッキ上からカードを６枚エナゾーンに置く
// ②対戦相手のシグニ1体バニッシュ＋1体ダウン＋1ドロー
// ③自分の天使シグニ1体に+5000/ランサー/ダブルクラッシュ
// =====================================================================
effects['WX21-020'] = [
  {
    effectId: 'WX21-020-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN', 'ATTACK'],
    cost: {
      energy: [
        { color: '赤', count: 1 },
        { color: '青', count: 1 },
        { color: '緑', count: 1 }
      ]
    },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 3,
      choices: [
        {
          choiceId: 'c0',
          label: '①デッキ上6枚をエナゾーンに',
          action: {
            type: 'ENERGY_CHARGE_FROM_DECK',
            owner: 'self',
            count: 6
          }
        },
        {
          choiceId: 'c1',
          label: '②対戦相手のシグニ1体バニッシュ＋1体ダウン＋1ドロー',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'opponent',
                  count: 1,
                  filter: { cardType: 'シグニ' }
                }
              },
              {
                type: 'DOWN',
                target: {
                  type: 'SIGNI',
                  owner: 'opponent',
                  count: 1,
                  filter: { cardType: 'シグニ' }
                }
              },
              { type: 'DRAW', owner: 'self', count: 1 }
            ]
          }
        },
        {
          choiceId: 'c2',
          label: '③天使シグニ1体に+5000/ランサー/ダブルクラッシュ',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'POWER_MODIFY',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ', story: '天使' }
                },
                delta: 5000,
                duration: 'UNTIL_END_OF_TURN'
              },
              {
                type: 'GRANT_KEYWORD',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ', story: '天使' }
                },
                keyword: 'ランサー',
                duration: 'UNTIL_END_OF_TURN'
              },
              {
                type: 'GRANT_KEYWORD',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ', story: '天使' }
                },
                keyword: 'ダブルクラッシュ',
                duration: 'UNTIL_END_OF_TURN'
              }
            ]
          }
        }
      ]
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL'
  }
];

// =====================================================================
// 修正6: WX17-Re04 快演
// 以下の２つから１つを選ぶ。
// ①自分のシグニ1体をバニッシュ→デッキから遊具シグニを探してエナゾーンに
// ②自分のシグニ1体をバニッシュ→エナゾーンから遊具シグニを手札に
// =====================================================================
effects['WX17-Re04'] = [
  {
    effectId: 'WX17-Re04-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    cost: {
      energy: [{ color: '緑', count: 0 }]
    },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 2,
      choices: [
        {
          choiceId: 'c0',
          label: '①自シグニ1体バニッシュ→デッキから遊具をエナゾーンに',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ' }
                }
              },
              {
                type: 'SEARCH',
                from: { location: 'deck', owner: 'self' },
                filter: { cardType: 'シグニ', story: '遊具' },
                maxCount: 1,
                then: {
                  type: 'ENERGY_CHARGE',
                  owner: 'self'
                },
                afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' }
              }
            ]
          }
        },
        {
          choiceId: 'c1',
          label: '②自シグニ1体バニッシュ→エナゾーンから遊具を手札に',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ' }
                }
              },
              {
                type: 'TRANSFER_TO_HAND',
                source: {
                  type: 'ENERGY_CARD',
                  owner: 'self',
                  count: 1,
                  upToCount: false,
                  filter: { cardType: 'シグニ', story: '遊具' }
                }
              }
            ]
          }
        }
      ]
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL'
  }
];

// =====================================================================
// 修正7: WX16-Re01 スター・フェスティバル
// 以下の２つから１つを選ぶ。
// ①レゾナではないシグニ1体バニッシュ→デッキから宇宙シグニ1枚を手札に
// ②レゾナ1体バニッシュ→対戦相手のレベル3以下シグニ1体を手札に戻す
// =====================================================================
effects['WX16-Re01'] = [
  {
    effectId: 'WX16-Re01-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    cost: {
      energy: [{ color: '白', count: 0 }]
    },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 2,
      choices: [
        {
          choiceId: 'c0',
          label: '①非レゾナ1体バニッシュ→デッキから宇宙シグニを手札に',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ', isRezona: false }
                }
              },
              {
                type: 'SEARCH',
                from: { location: 'deck', owner: 'self' },
                filter: { cardType: 'シグニ', story: '宇宙' },
                maxCount: 1,
                then: {
                  type: 'SEQUENCE',
                  steps: [
                    { type: 'REVEAL' },
                    { type: 'ADD_TO_HAND', owner: 'self' }
                  ]
                },
                afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' }
              }
            ]
          }
        },
        {
          choiceId: 'c1',
          label: '②レゾナ1体バニッシュ→相手のLv3以下シグニを手札に戻す',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ', isRezona: true }
                }
              },
              {
                type: 'BOUNCE',
                target: {
                  type: 'SIGNI',
                  owner: 'opponent',
                  count: 1,
                  upToCount: false,
                  filter: { cardType: 'シグニ', level: { max: 3 } }
                },
                optional: false
              }
            ]
          }
        }
      ]
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL'
  }
];

// =====================================================================
// 修正8: WX16-Re10 キャッチ・リリース
// 以下の２つから１つを選ぶ。
// ①非レゾナ1体バニッシュ→トラッシュから凶蟲シグニを手札に
// ②レゾナ1体バニッシュ→対戦相手のシグニ1体パワーを-10000
// =====================================================================
effects['WX16-Re10'] = [
  {
    effectId: 'WX16-Re10-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    cost: {
      energy: [{ color: '黒', count: 0 }]
    },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 2,
      choices: [
        {
          choiceId: 'c0',
          label: '①非レゾナ1体バニッシュ→トラッシュから凶蟲シグニを手札に',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ', isRezona: false }
                }
              },
              {
                type: 'TRANSFER_TO_HAND',
                source: {
                  type: 'TRASH_CARD',
                  owner: 'self',
                  count: 1,
                  upToCount: false,
                  filter: { cardType: 'シグニ', story: '凶蟲' }
                }
              }
            ]
          }
        },
        {
          choiceId: 'c1',
          label: '②レゾナ1体バニッシュ→対戦相手のシグニ1体-10000',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ', isRezona: true }
                }
              },
              {
                type: 'POWER_MODIFY',
                target: {
                  type: 'SIGNI',
                  owner: 'opponent',
                  count: 1,
                  filter: { cardType: 'シグニ' },
                  upToCount: false
                },
                delta: -10000,
                duration: 'UNTIL_END_OF_TURN'
              }
            ]
          }
        }
      ]
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL'
  }
];

// =====================================================================
// 修正9: WX12-Re13 龍炎の昇拳
// 以下の２つから１つを選ぶ。
// ①自シグニ1体バニッシュ→パワー8000以下のシグニ1体をバニッシュ
// ②自シグニ1体バニッシュ→対戦相手のエナのマルチエナカード1枚をトラッシュへ
// =====================================================================
effects['WX12-Re13'] = [
  {
    effectId: 'WX12-Re13-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    cost: {
      energy: [{ color: '赤', count: 0 }]
    },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 2,
      choices: [
        {
          choiceId: 'c0',
          label: '①自シグニ1体バニッシュ→パワー8000以下のシグニ1体バニッシュ',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ' }
                }
              },
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'any',
                  count: 1,
                  filter: { cardType: 'シグニ', powerRange: { max: 8000 } },
                  upToCount: false
                }
              }
            ]
          }
        },
        {
          choiceId: 'c1',
          label: '②自シグニ1体バニッシュ→相手のエナのマルチエナカード1枚をトラッシュへ',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ' }
                }
              },
              {
                type: 'TRASH',
                target: {
                  type: 'ENERGY_CARD',
                  owner: 'opponent',
                  count: 1,
                  filter: { hasKeyword: 'マルチエナ' }
                }
              }
            ]
          }
        }
      ]
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL'
  }
];

// =====================================================================
// 修正10: WX12-Re21 トーチュン・ウィップ
// 以下の２つから１つを選ぶ。
// ①白のシグニ1体バニッシュ→デッキから白のシグニを手札に加え、シャッフル
// ②黒のシグニ1体バニッシュ→対戦相手のシグニ1体のパワーを-7000
// =====================================================================
effects['WX12-Re21'] = [
  {
    effectId: 'WX12-Re21-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    cost: {
      energy: [{ color: '黒', count: 0 }]
    },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 2,
      choices: [
        {
          choiceId: 'c0',
          label: '①白シグニ1体バニッシュ→デッキから白シグニを手札に',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ', color: '白' }
                }
              },
              {
                type: 'SEARCH',
                from: { location: 'deck', owner: 'self' },
                filter: { cardType: 'シグニ', color: '白' },
                maxCount: 1,
                then: {
                  type: 'SEQUENCE',
                  steps: [
                    { type: 'REVEAL' },
                    { type: 'ADD_TO_HAND', owner: 'self' }
                  ]
                },
                afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' }
              }
            ]
          }
        },
        {
          choiceId: 'c1',
          label: '②黒シグニ1体バニッシュ→対戦相手のシグニ1体-7000',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ', color: '黒' }
                }
              },
              {
                type: 'POWER_MODIFY',
                target: {
                  type: 'SIGNI',
                  owner: 'opponent',
                  count: 1,
                  filter: { cardType: 'シグニ' },
                  upToCount: false
                },
                delta: -7000,
                duration: 'UNTIL_END_OF_TURN'
              }
            ]
          }
        }
      ]
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL'
  }
];

// =====================================================================
// 修正11: WX14-037 進撃の炎軍
// 以下の２つから１つを選ぶ。
// ①フレイスロシグニ1体バニッシュ→対戦相手のパワー7000以下シグニ1体バニッシュ
// ②フレイスロシグニ1体バニッシュ→デッキ上3枚公開→フレイスロ1枚を手札に、残りをデッキ下
// =====================================================================
effects['WX14-037'] = [
  {
    effectId: 'WX14-037-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    cost: {
      energy: [{ color: '赤', count: 0 }]
    },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 2,
      choices: [
        {
          choiceId: 'c0',
          label: '①フレイスロ1体バニッシュ→相手のパワー7000以下1体バニッシュ',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ', nameContains: 'フレイスロ' }
                }
              },
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'opponent',
                  count: 1,
                  filter: { cardType: 'シグニ', powerRange: { max: 7000 } },
                  upToCount: false
                }
              }
            ]
          }
        },
        {
          choiceId: 'c1',
          label: '②フレイスロ1体バニッシュ→デッキ上3枚公開→フレイスロ手札、残りデッキ下',
          action: {
            type: 'SEQUENCE',
            steps: [
              {
                type: 'BANISH',
                target: {
                  type: 'SIGNI',
                  owner: 'self',
                  count: 1,
                  filter: { cardType: 'シグニ', nameContains: 'フレイスロ' }
                }
              },
              {
                type: 'LOOK_AND_REORDER',
                source: { location: 'deck', owner: 'self' },
                count: 3,
                private: false,
                reorder: true,
                canTrash: false,
                destination: {
                  location: 'deck',
                  owner: 'self',
                  position: 'bottom'
                },
                pickToHand: {
                  filter: { nameContains: 'フレイスロ' },
                  maxCount: 1
                }
              }
            ]
          }
        }
      ]
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL'
  }
];

// =====================================================================
// 書き込み
// =====================================================================
fs.writeFileSync(filePath, JSON.stringify(effects, null, 4), 'utf8');
console.log('effects_WX.json を更新しました。');
console.log('修正したカード:');
const fixed = [
  'WX10-023 ブラック・コフィン',
  'WX14-011 炎得火失',
  'WX17-020 エニー・チョイス',
  'WX20-021 バイ・ザ・ウェイ',
  'WX21-020 プライマル・サーガ',
  'WX17-Re04 快演',
  'WX16-Re01 スター・フェスティバル',
  'WX16-Re10 キャッチ・リリース',
  'WX12-Re13 龍炎の昇拳',
  'WX12-Re21 トーチュン・ウィップ',
  'WX14-037 進撃の炎軍',
];
fixed.forEach((f, i) => console.log(`  ${i+1}. ${f}`));
