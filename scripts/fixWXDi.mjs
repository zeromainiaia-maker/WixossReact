/**
 * fixWXDi.mjs — effects_WXDi.json の実装ミス修正スクリプト
 *
 * 修正カテゴリ:
 * A) CHOOSE欠落 — テキストに「以下の○つから選ぶ」があるのに CHOOSE 構造がないカード
 *    WXDi-P02-005, WXDi-P05-003, WXDi-P05-077, WXDi-P06-003, WXDi-P07-002, WXDi-P07-049
 *
 * B) owner間違い / 実装ミス
 *    WXDi-D02-16T, WXDi-D06-017, WXDi-P00-002, WXDi-P02-042,
 *    WXDi-P02-049, WXDi-P04-036, WXDi-P04-078, WXDi-P05-071,
 *    WXDi-P07-090
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const jsonPath = path.join(root, 'public/data/effects_WXDi.json');

const effects = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// ==============================
// A) CHOOSE欠落カードの修正
// ==============================

// WXDi-P02-005 ゼノ・クラスタ
// テキスト：以下の２つから１つを選ぶ。
// ①カードを１枚引く。（条件付きで３枚）
// ②【エナチャージ１】をする。（条件付きでエナチャージ３）
// 現在: SEQUENCE(DRAW3, ENERGY_CHARGE3) → 修正: CHOOSE(DRAW 1/3, ENERGY_CHARGE 1/3)
effects['WXDi-P02-005'] = [
  {
    "effectId": "WXDi-P02-005-E1",
    "effectType": "ACTIVATED",
    "timing": ["ATTACK"],
    "cost": {
      "energy": [{ "color": "無", "count": 0 }]
    },
    "action": {
      "type": "CHOOSE",
      "choose_count": 1,
      "from_count": 2,
      "choices": [
        {
          "choiceId": "c0",
          "label": "選択肢1",
          "action": {
            "type": "CONDITIONAL",
            "condition": {
              "type": "HAND_LOST_THIS_TURN_BY_OPPONENT",
              "count": 1
            },
            "then": {
              "type": "DRAW",
              "owner": "self",
              "count": 3
            },
            "else": {
              "type": "DRAW",
              "owner": "self",
              "count": 1
            }
          }
        },
        {
          "choiceId": "c1",
          "label": "選択肢2",
          "action": {
            "type": "CONDITIONAL",
            "condition": {
              "type": "ENERGY_LOST_THIS_TURN_BY_OPPONENT",
              "count": 1
            },
            "then": {
              "type": "ENERGY_CHARGE_FROM_DECK",
              "owner": "self",
              "count": 3
            },
            "else": {
              "type": "ENERGY_CHARGE_FROM_DECK",
              "owner": "self",
              "count": 1
            }
          }
        }
      ]
    },
    "duration": "INSTANT",
    "mandatory": false,
    "parseStatus": "MANUAL"
  }
];

// WXDi-P05-003 M.G.D.
// テキスト：以下の２つから１つを選ぶ。
// ①対戦相手のルリグ１体を対象とし、コスト支払い計3回でアタック無効
// ②カードを１枚引く。
// 現在: NEGATE_ATTACK(opponent signi) → 修正: CHOOSE
effects['WXDi-P05-003'] = [
  {
    "effectId": "WXDi-P05-003-E1",
    "effectType": "ACTIVATED",
    "timing": ["MAIN", "ATTACK"],
    "cost": {
      "energy": [{ "color": "無", "count": 0 }]
    },
    "action": {
      "type": "CHOOSE",
      "choose_count": 1,
      "from_count": 2,
      "choices": [
        {
          "choiceId": "c0",
          "label": "選択肢1",
          "action": {
            "type": "STUB",
            "id": "NEGATE_LRIG_ATTACK_CONDITIONAL_COST",
            "description": "対戦相手のルリグ１体を対象とし、エナかトラッシュかを3回選ばせ、そうした場合このターンアタックを無効にする"
          }
        },
        {
          "choiceId": "c1",
          "label": "選択肢2",
          "action": {
            "type": "DRAW",
            "owner": "self",
            "count": 1
          }
        }
      ]
    },
    "duration": "INSTANT",
    "mandatory": false,
    "parseStatus": "MANUAL"
  }
];

// WXDi-P05-077 照地
// テキスト：以下の２つから１つを選ぶ。
// ①対戦相手のパワー8000以上のシグニ１体を対象とし、コスト支払い（エナ天使+手札天使）でバニッシュ
// ②あなたのエナゾーンから《翠天姫　ガイア》１枚を手札に加える
// 現在: BANISH(self) → 修正: CHOOSE
effects['WXDi-P05-077'] = [
  {
    "effectId": "WXDi-P05-077-E1",
    "effectType": "ACTIVATED",
    "timing": ["MAIN"],
    "cost": {
      "energy": [{ "color": "緑", "count": 0 }]
    },
    "action": {
      "type": "CHOOSE",
      "choose_count": 1,
      "from_count": 2,
      "choices": [
        {
          "choiceId": "c0",
          "label": "選択肢1",
          "action": {
            "type": "BANISH",
            "target": {
              "type": "SIGNI",
              "owner": "opponent",
              "count": 1,
              "filter": {
                "cardType": "シグニ",
                "powerRange": { "min": 8000 }
              },
              "upToCount": false,
              "optionalCost": {
                "energy": [{ "story": "天使", "cardType": "シグニ", "count": 1 }],
                "hand": [{ "story": "天使", "cardType": "シグニ", "count": 1 }]
              }
            }
          }
        },
        {
          "choiceId": "c1",
          "label": "選択肢2",
          "action": {
            "type": "TRANSFER_TO_HAND",
            "source": {
              "type": "ENERGY_CARD",
              "owner": "self",
              "count": 1,
              "upToCount": false,
              "filter": {
                "cardName": "翠天姫　ガイア"
              }
            }
          }
        }
      ]
    },
    "duration": "INSTANT",
    "mandatory": false,
    "parseStatus": "MANUAL"
  },
  {
    "effectId": "WXDi-P05-077-BURST",
    "effectType": "LIFE_BURST",
    "timing": ["ON_LIFE_BURST"],
    "action": {
      "type": "BANISH",
      "target": {
        "type": "SIGNI",
        "owner": "opponent",
        "count": 1,
        "filter": {
          "cardType": "シグニ",
          "level": { "min": 2 }
        },
        "upToCount": false
      }
    },
    "duration": "INSTANT",
    "mandatory": false,
    "parseStatus": "AUTO"
  }
];

// WXDi-P06-003 マイアズマ・ラビリンス
// テキスト：【ドリームチーム】条件付き、以下の４つからセンタールリグのレベル１につき１つまで選ぶ
// ①対戦相手のシグニ1体パワー－12000
// ②トラッシュからシグニ1枚場に出す
// ③トラッシュからシグニ1枚手札に加える
// ④各プレイヤーはカードを1枚引く
// 現在: GRANT_KEYWORD(self) → 修正: CHOOSE(4択)
effects['WXDi-P06-003'] = [
  {
    "effectId": "WXDi-P06-003-E1",
    "effectType": "ACTIVATED",
    "timing": ["MAIN"],
    "cost": {
      "energy": [
        { "color": "黒", "count": 1 },
        { "color": "無", "count": 2 }
      ]
    },
    "action": {
      "type": "CHOOSE",
      "choose_count": "LEVEL_OF_CENTER_LRIG",
      "from_count": 4,
      "choices": [
        {
          "choiceId": "c0",
          "label": "選択肢1",
          "action": {
            "type": "POWER_MODIFY",
            "target": {
              "type": "SIGNI",
              "owner": "opponent",
              "count": 1,
              "filter": { "cardType": "シグニ" },
              "upToCount": false
            },
            "delta": -12000
          }
        },
        {
          "choiceId": "c1",
          "label": "選択肢2",
          "action": {
            "type": "ADD_TO_FIELD",
            "owner": "self",
            "source": {
              "type": "TRASH_CARD",
              "owner": "self",
              "count": 1,
              "upToCount": false,
              "filter": { "cardType": "シグニ" }
            }
          }
        },
        {
          "choiceId": "c2",
          "label": "選択肢3",
          "action": {
            "type": "TRANSFER_TO_HAND",
            "source": {
              "type": "TRASH_CARD",
              "owner": "self",
              "count": 1,
              "upToCount": false,
              "filter": { "cardType": "シグニ" }
            }
          }
        },
        {
          "choiceId": "c3",
          "label": "選択肢4",
          "action": {
            "type": "SEQUENCE",
            "steps": [
              { "type": "DRAW", "owner": "self", "count": 1 },
              { "type": "DRAW", "owner": "opponent", "count": 1 }
            ]
          }
        }
      ]
    },
    "duration": "INSTANT",
    "mandatory": false,
    "parseStatus": "MANUAL"
  }
];

// WXDi-P07-002 ENERGY DOOR
// テキスト：【ドリームチーム】条件付き、以下の４つからセンタールリグのレベル１につき１つまで選ぶ
// ①トラッシュから《ガードアイコン》なしカード2枚までエナに置く
// ②カードを2枚引く
// ③対戦相手のレベル3以上のシグニ1体バニッシュ
// ④次の対戦相手ターン、対戦相手〔stub: 何らかの制限〕
// 現在: GRANT_KEYWORD(self) → 修正: CHOOSE(4択)
effects['WXDi-P07-002'] = [
  {
    "effectId": "WXDi-P07-002-E1",
    "effectType": "ACTIVATED",
    "timing": ["MAIN"],
    "cost": {
      "energy": [
        { "color": "緑", "count": 1 },
        { "color": "無", "count": 2 }
      ]
    },
    "action": {
      "type": "CHOOSE",
      "choose_count": "LEVEL_OF_CENTER_LRIG",
      "from_count": 4,
      "choices": [
        {
          "choiceId": "c0",
          "label": "選択肢1",
          "action": {
            "type": "ENERGY_CHARGE",
            "target": {
              "type": "TRASH_CARD",
              "owner": "self",
              "count": 2,
              "upToCount": true,
              "filter": { "hasGuardIcon": false }
            }
          }
        },
        {
          "choiceId": "c1",
          "label": "選択肢2",
          "action": {
            "type": "DRAW",
            "owner": "self",
            "count": 2
          }
        },
        {
          "choiceId": "c2",
          "label": "選択肢3",
          "action": {
            "type": "BANISH",
            "target": {
              "type": "SIGNI",
              "owner": "opponent",
              "count": 1,
              "filter": {
                "cardType": "シグニ",
                "level": { "min": 3 }
              },
              "upToCount": false
            }
          }
        },
        {
          "choiceId": "c3",
          "label": "選択肢4",
          "action": {
            "type": "STUB",
            "id": "RESTRICT_OPPONENT_NEXT_TURN",
            "description": "次の対戦相手のターンの間、対戦相手に特定の制限を与える"
          }
        }
      ]
    },
    "duration": "INSTANT",
    "mandatory": false,
    "parseStatus": "MANUAL"
  }
];

// WXDi-P07-049 透天姫　リワト//メモリア
// テキスト：【自】アタックフェイズ開始時、以下の３つから１つを選ぶ
// ①カードを1枚引くか【エナチャージ１】をする
// ②対戦相手のレベル1のシグニ1体バニッシュ
// ③対戦相手のシグニ1体に《無》《無》《無》支払いで手札に戻す
// 現在: E1=BOUNCE(self, mandatory)、E2=TRASH(self signi) → 修正: CHOOSE(3択)
// 【出】：公開領域に天使じゃない色付きシグニがある場合、場からトラッシュ
effects['WXDi-P07-049'] = [
  {
    "effectId": "WXDi-P07-049-E1",
    "effectType": "AUTO",
    "timing": ["ATTACK"],
    "action": {
      "type": "CHOOSE",
      "choose_count": 1,
      "from_count": 3,
      "choices": [
        {
          "choiceId": "c0",
          "label": "選択肢1",
          "action": {
            "type": "STUB",
            "id": "DRAW_OR_ENERGY_CHARGE",
            "description": "カードを1枚引くか【エナチャージ１】をする"
          }
        },
        {
          "choiceId": "c1",
          "label": "選択肢2",
          "action": {
            "type": "BANISH",
            "target": {
              "type": "SIGNI",
              "owner": "opponent",
              "count": 1,
              "filter": {
                "cardType": "シグニ",
                "level": { "max": 1 }
              },
              "upToCount": false
            }
          }
        },
        {
          "choiceId": "c2",
          "label": "選択肢3",
          "action": {
            "type": "BOUNCE",
            "target": {
              "type": "SIGNI",
              "owner": "opponent",
              "count": 1,
              "filter": { "cardType": "シグニ" },
              "upToCount": false
            },
            "optional": true,
            "optionalCost": {
              "energy": [{ "color": "無", "count": 3 }]
            }
          }
        }
      ]
    },
    "duration": "INSTANT",
    "mandatory": true,
    "parseStatus": "MANUAL"
  },
  {
    "effectId": "WXDi-P07-049-E2",
    "effectType": "AUTO",
    "timing": ["ON_PLAY"],
    "action": {
      "type": "CONDITIONAL",
      "condition": {
        "type": "REVEALED_AREA_HAS_NON_ANGEL_COLORED_SIGNI"
      },
      "then": {
        "type": "TRASH",
        "target": {
          "type": "SIGNI",
          "owner": "self",
          "count": 1,
          "filter": {
            "self": true
          }
        }
      }
    },
    "duration": "INSTANT",
    "mandatory": true,
    "parseStatus": "MANUAL"
  }
];

// ==============================
// B) owner間違い / 実装ミスの修正
// ==============================

// WXDi-D02-16T 【センター】とこ　レベル３
// テキスト：【チーム起】ターン1回 バーチャルシグニ1体をトラッシュに→対戦相手のシグニ1体パワー-3000
// 現在: E2のみ（TRANSFER_TO_HAND from trash） → 修正: E1にチーム起効果(missing)を追加
effects['WXDi-D02-16T'] = [
  {
    "effectId": "WXDi-D02-16T-E1",
    "effectType": "ACTIVATED",
    "timing": ["MAIN"],
    "cost": {
      "hand": [{ "story": "バーチャル", "cardType": "シグニ", "from": "field", "count": 1 }]
    },
    "action": {
      "type": "POWER_MODIFY",
      "target": {
        "type": "SIGNI",
        "owner": "opponent",
        "count": 1,
        "filter": { "cardType": "シグニ" },
        "upToCount": false
      },
      "delta": -3000
    },
    "duration": "UNTIL_END_OF_TURN",
    "mandatory": false,
    "parseStatus": "MANUAL"
  },
  {
    "effectId": "WXDi-D02-16T-E2",
    "effectType": "AUTO",
    "timing": ["ON_PLAY"],
    "action": {
      "type": "TRANSFER_TO_HAND",
      "source": {
        "type": "TRASH_CARD",
        "owner": "self",
        "count": 2,
        "upToCount": true,
        "filter": {
          "cardType": "シグニ",
          "story": "バーチャル"
        }
      }
    },
    "duration": "INSTANT",
    "mandatory": true,
    "parseStatus": "AUTO"
  }
];

// WXDi-D06-017 凶魔　アンナ・ミラージュ
// テキスト：【出】《無》：対戦相手のシグニ1体パワー-8000、ライフバースト：トラッシュからシグニ1枚手札に
// 現在: BURSTのみ(TRANSFER_TO_HAND from self trash)、出効果なし
// 修正: E1(出効果)を追加、BURST内容は正しいが effectId追加
effects['WXDi-D06-017'] = [
  {
    "effectId": "WXDi-D06-017-E1",
    "effectType": "AUTO",
    "timing": ["ON_PLAY"],
    "cost": {
      "energy": [{ "color": "無", "count": 1 }]
    },
    "action": {
      "type": "POWER_MODIFY",
      "target": {
        "type": "SIGNI",
        "owner": "opponent",
        "count": 1,
        "filter": { "cardType": "シグニ" },
        "upToCount": false
      },
      "delta": -8000
    },
    "duration": "UNTIL_END_OF_TURN",
    "mandatory": false,
    "parseStatus": "MANUAL"
  },
  {
    "effectId": "WXDi-D06-017-BURST",
    "effectType": "LIFE_BURST",
    "timing": ["ON_LIFE_BURST"],
    "action": {
      "type": "TRANSFER_TO_HAND",
      "source": {
        "type": "TRASH_CARD",
        "owner": "self",
        "count": 1,
        "upToCount": false,
        "filter": { "cardType": "シグニ" }
      }
    },
    "duration": "INSTANT",
    "mandatory": false,
    "parseStatus": "AUTO"
  }
];

// WXDi-P00-002 カウンター・アルケミー
// テキスト：対戦相手のシグニ1体を対象とし、アサシン・ランサー・ダブルクラッシュを失い、新たに得られない
// 現在: GRANT_KEYWORD(self) → 修正: target owner=opponent
effects['WXDi-P00-002'] = [
  {
    "effectId": "WXDi-P00-002-E1",
    "effectType": "ACTIVATED",
    "timing": ["MAIN", "ATTACK"],
    "cost": {
      "energy": [{ "color": "無", "count": 2 }]
    },
    "action": {
      "type": "REMOVE_KEYWORD",
      "target": {
        "type": "SIGNI",
        "owner": "opponent",
        "count": 1,
        "filter": { "cardType": "シグニ" },
        "upToCount": false
      },
      "keywords": ["アサシン", "ランサー", "ダブルクラッシュ"],
      "preventGaining": true,
      "duration": "UNTIL_END_OF_TURN"
    },
    "duration": "UNTIL_END_OF_TURN",
    "mandatory": false,
    "parseStatus": "MANUAL"
  }
];

// WXDi-P02-042 羅原姫　ＺｒＯ２
// テキスト：【自】アタック時、対戦相手のシグニ1体を対象とし、《無》支払いでパワー-3000（条件付きで-8000）
// 【出】《青》：カードを1枚引くか、対戦相手の手札1枚見ないで選び捨てさせる
// 現在: E2のみ(DRAW) → 修正: E1追加(ON_ATTACK with POWER_MODIFY to opponent)
effects['WXDi-P02-042'] = [
  {
    "effectId": "WXDi-P02-042-E1",
    "effectType": "AUTO",
    "timing": ["ON_ATTACK_SIGNI"],
    "action": {
      "type": "POWER_MODIFY",
      "target": {
        "type": "SIGNI",
        "owner": "opponent",
        "count": 1,
        "filter": { "cardType": "シグニ" },
        "upToCount": false
      },
      "delta": -3000,
      "optional": true,
      "optionalCost": {
        "energy": [{ "color": "無", "count": 1 }]
      },
      "conditionalUpgrade": {
        "condition": "OPPONENT_DISCARDED_2_OR_MORE_THIS_TURN",
        "delta": -8000
      }
    },
    "duration": "UNTIL_END_OF_TURN",
    "mandatory": false,
    "parseStatus": "MANUAL"
  },
  {
    "effectId": "WXDi-P02-042-E2",
    "effectType": "AUTO",
    "timing": ["ON_PLAY"],
    "cost": {
      "energy": [{ "color": "青", "count": 1 }]
    },
    "action": {
      "type": "STUB",
      "id": "DRAW_OR_DISCARD_OPPONENT",
      "description": "カードを１枚引くか、対戦相手の手札を１枚見ないで選び、捨てさせる"
    },
    "duration": "INSTANT",
    "mandatory": false,
    "parseStatus": "MANUAL"
  }
];

// WXDi-P02-049 コードメイズ　トトリサ
// テキスト：【自】ターン1回：対戦相手のシグニ1体が場からトラッシュに置かれたとき、エナチャージ1
// 現在: timing=ON_TRASH (自分のシグニ) → 修正: timing=ON_SIGNI_BANISHED_OPPONENT
effects['WXDi-P02-049'] = [
  {
    "effectId": "WXDi-P02-049-E1",
    "effectType": "AUTO",
    "timing": ["ON_OPPONENT_SIGNI_TRASHED"],
    "action": {
      "type": "ENERGY_CHARGE_FROM_DECK",
      "owner": "self",
      "count": 1
    },
    "duration": "INSTANT",
    "mandatory": true,
    "parseStatus": "MANUAL"
  }
];

// WXDi-P04-036 蒼将姫　コロンブス
// テキスト：【自】アタックフェイズ開始時、アップ状態の場合、対戦相手のシグニ1体を対象とし、手札3枚捨てるとバニッシュ
// 現在: SEQUENCE(TRASH hand 3, CONDITIONAL BANISH(self)) → 修正: target opponent
effects['WXDi-P04-036'][0].action.steps[1].then.target.owner = 'opponent';

// WXDi-P04-078 コードイート　シーザー
// テキスト：【自】ターン2回：対戦相手のシグニ1体が場に出たとき、エナチャージ1
// 現在: timing=ON_PLAY (自分のシグニ) → 修正: timing=ON_OPPONENT_SIGNI_PLAY
effects['WXDi-P04-078'] = [
  {
    "effectId": "WXDi-P04-078-E1",
    "effectType": "AUTO",
    "timing": ["ON_OPPONENT_SIGNI_PLAY"],
    "action": {
      "type": "ENERGY_CHARGE_FROM_DECK",
      "owner": "self",
      "count": 1
    },
    "duration": "INSTANT",
    "mandatory": true,
    "parseStatus": "MANUAL"
  }
];

// WXDi-P05-071 コードメイズ　トチョー
// テキスト：【出】対戦相手のシグニ2体を対象とし、それらの場所を入れ替える
// 現在: E2 REARRANGE_SIGNI target=any → 修正: target opponent count=2
effects['WXDi-P05-071'][1].action.target = {
  "type": "SIGNI",
  "owner": "opponent",
  "count": 2,
  "upToCount": false
};

// WXDi-P07-090 凶天　タナトス
// テキスト：【出】《黒》：対戦相手のシグニ1体を対象とし、トラッシュから天使3枚デッキに加えてシャッフル、それのパワー-5000
// 現在: SEQUENCE(TRANSFER_TO_DECK, CONDITIONAL(POWER_MODIFY target=any)) → 修正: target opponent
effects['WXDi-P07-090'][0].action.steps[1].then.target.owner = 'opponent';

// ==============================
// 書き込み
// ==============================
fs.writeFileSync(jsonPath, JSON.stringify(effects, null, 2) + '\n', 'utf8');
console.log('effects_WXDi.json 修正完了');

// 修正サマリー表示
const fixes = [
  ['WXDi-P02-005', 'ゼノ・クラスタ', 'CHOOSE欠落: SEQUENCE→CHOOSE(2択)に修正'],
  ['WXDi-P05-003', 'M.G.D.', 'CHOOSE欠落: NEGATE_ATTACK→CHOOSE(2択)に修正'],
  ['WXDi-P05-077', '照地', 'CHOOSE欠落: BANISH(self)→CHOOSE(2択)に修正、opponent targetを正しく設定'],
  ['WXDi-P06-003', 'マイアズマ・ラビリンス', 'CHOOSE欠落: GRANT_KEYWORD→CHOOSE(4択)に完全再実装'],
  ['WXDi-P07-002', 'ENERGY DOOR', 'CHOOSE欠落: GRANT_KEYWORD→CHOOSE(4択)に完全再実装'],
  ['WXDi-P07-049', '透天姫　リワト//メモリア', 'CHOOSE欠落+owner: BOUNCE(self)→CHOOSE(3択)+opponent target修正'],
  ['WXDi-D02-16T', '【センター】とこ　レベル３', 'owner: チーム起効果(POWER_MODIFY opponent)が欠落→追加'],
  ['WXDi-D06-017', '凶魔　アンナ・ミラージュ', 'owner: 出効果(POWER_MODIFY opponent -8000)が欠落→追加'],
  ['WXDi-P00-002', 'カウンター・アルケミー', 'owner: GRANT_KEYWORD target self→opponent に修正'],
  ['WXDi-P02-042', '羅原姫　ＺｒＯ２', 'owner: ON_ATTACK効果(POWER_MODIFY opponent)が欠落→追加'],
  ['WXDi-P02-049', 'コードメイズ　トトリサ', 'owner: timing ON_TRASH→ON_OPPONENT_SIGNI_TRASHED に修正'],
  ['WXDi-P04-036', '蒼将姫　コロンブス', 'owner: BANISH target self→opponent に修正'],
  ['WXDi-P04-078', 'コードイート　シーザー', 'owner: timing ON_PLAY→ON_OPPONENT_SIGNI_PLAY に修正'],
  ['WXDi-P05-071', 'コードメイズ　トチョー', 'owner: REARRANGE target any→opponent count=2 に修正'],
  ['WXDi-P07-090', '凶天　タナトス', 'owner: POWER_MODIFY target any→opponent に修正'],
];

console.log('\n=== 修正カード一覧 (' + fixes.length + '件) ===');
fixes.forEach(([id, name, desc]) => {
  console.log(`  ${id} ${name}\n    ${desc}`);
});
