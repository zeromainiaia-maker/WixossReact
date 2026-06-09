/**
 * fixWXK.mjs
 * effects_WXK.json の実装ミスを修正する
 *
 * 修正内容:
 * 1. CHOOSE欠落: 「以下の○つから選ぶ」テキストがあるのにCHOOSEなし
 *    - WXK09-076 ＳＴＲＡＩＧＨＴ
 *    - WXK09-089 読取
 *    - WXK10-002 メンダコギロチン
 *    - WXK10-007 イレイザー・スマッシュ
 *    - WXK10-008 怒髪衝炎
 *    - WXK10-010 ドント・コール
 *    - WXK10-012 停空飛翔
 *    - WXK10-013 クリミナル・リタッチ
 *    - WXK11-003 ロック・ユアハート
 * 2. owner間違い: opponent対象なのにownerが間違い
 *    - WXK08-031 弩書　ザ・ロウ (E1効果が丸ごと欠落)
 *    - WXK08-052 爆書　グラング (POWER_MODIFY target owner: any -> opponent)
 *    - WXK09-060 楽隊の童話　コケコブ (E1効果が丸ごと欠落)
 *    - WXK10-040 羅原魔　デーモンコア (BANISH target owner: self -> opponent)
 * 3. SEQUENCE/効果欠落:
 *    - WXK11-049 羅植　ハルザクラ (E1が出現時ONPLAYになっているが実際はenergy charge on opponent bounce)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const effectsPath = path.join(root, 'public/data/effects_WXK.json');

const effects = JSON.parse(fs.readFileSync(effectsPath, 'utf8'));

let fixCount = 0;
const fixLog = [];

function fix(cardId, description, fn) {
  fn(effects[cardId]);
  fixCount++;
  fixLog.push({ cardId, description });
  console.log(`Fixed: ${cardId} - ${description}`);
}

// ============================================================
// 1. CHOOSE欠落修正
// ============================================================

// WXK09-076 ＳＴＲＡＩＧＨＴ
// 「以下の２つから１つを選ぶ。①あなたの＜天使＞のシグニ１体をトラッシュに置く。→相手が手札を１枚捨てる。②エナチャージ１」
// 現状: 1アクション（手札を捨てる）だけ→CHOOSE付きに修正
fix('WXK09-076', 'CHOOSE欠落修正: 2択選択肢を追加', (efList) => {
  efList[0].action = {
    type: 'CHOOSE',
    choose_count: 1,
    from_count: 2,
    choices: [
      {
        choiceId: 'c0',
        label: '①',
        action: {
          type: 'SEQUENCE',
          steps: [
            {
              type: 'TRASH',
              target: {
                type: 'SIGNI',
                owner: 'self',
                count: 1,
                filter: { cardType: 'シグニ', story: '天使' },
                upToCount: false
              }
            },
            {
              type: 'TRASH',
              target: {
                type: 'HAND_CARD',
                owner: 'opponent',
                count: 1
              }
            }
          ]
        }
      },
      {
        choiceId: 'c1',
        label: '②',
        action: {
          type: 'ENERGY_CHARGE_FROM_DECK',
          owner: 'self',
          count: 1
        }
      }
    ]
  };
});

// WXK09-089 読取
// 「以下の２つから１つ。①電機シグニをトラッシュ→そのシグニのパワー以下の相手シグニをバニッシュ。②エナチャージ１」
// 現状: 1アクション（BANISHのみ）→CHOOSE付きに修正
fix('WXK09-089', 'CHOOSE欠落修正: 2択選択肢を追加', (efList) => {
  efList[0].action = {
    type: 'CHOOSE',
    choose_count: 1,
    from_count: 2,
    choices: [
      {
        choiceId: 'c0',
        label: '①',
        action: {
          type: 'SEQUENCE',
          steps: [
            {
              type: 'TRASH',
              target: {
                type: 'SIGNI',
                owner: 'self',
                count: 1,
                filter: { cardType: 'シグニ', story: '電機' },
                upToCount: false
              }
            },
            {
              type: 'STUB',
              id: 'BANISH_BY_TRASHED_POWER',
              description: 'トラッシュに置いたシグニのパワー以下の対戦相手のシグニをバニッシュ'
            }
          ]
        }
      },
      {
        choiceId: 'c1',
        label: '②',
        action: {
          type: 'ENERGY_CHARGE_FROM_DECK',
          owner: 'self',
          count: 1
        }
      }
    ]
  };
});

// WXK10-002 メンダコギロチン
// 「以下の５つから２つまで選ぶ。
//  ①相手スペル使用不可
//  ②相手シグニ１体→能力を失う
//  ③相手トラッシュ3枚を除外
//  ④相手シグニ１体をトラッシュ（手札２枚捨てる）
//  ⑤デッキ2枚トラッシュ→自分トラッシュから白か黒シグニ2枚を手札に」
// 現状: SEQUENCE（手札2捨て+デッキ2トラッシュ+シグニ手札）だけ→CHOOSEに修正
fix('WXK10-002', 'CHOOSE欠落修正: 5択選択肢を追加', (efList) => {
  efList[0].action = {
    type: 'CHOOSE',
    choose_count: 2,
    from_count: 5,
    choices: [
      {
        choiceId: 'c0',
        label: '①',
        action: {
          type: 'STUB',
          id: 'BLOCK_OPP_SPELL_USE',
          description: 'このターン、対戦相手はスペルを使用できない'
        }
      },
      {
        choiceId: 'c1',
        label: '②',
        action: {
          type: 'STUB',
          id: 'LOSE_ABILITIES',
          description: '対戦相手のシグニ１体は能力を失う',
          target: { type: 'SIGNI', owner: 'opponent', count: 1 },
          until: 'END_OF_TURN'
        }
      },
      {
        choiceId: 'c2',
        label: '③',
        action: {
          type: 'EXILE',
          source: {
            type: 'TRASH_CARD',
            owner: 'opponent',
            count: 3,
            upToCount: true
          }
        }
      },
      {
        choiceId: 'c3',
        label: '④',
        action: {
          type: 'SEQUENCE',
          steps: [
            {
              type: 'TRASH',
              target: {
                type: 'SIGNI',
                owner: 'opponent',
                count: 1,
                filter: { cardType: 'シグニ' },
                upToCount: false
              }
            },
            {
              type: 'TRASH',
              target: {
                type: 'HAND_CARD',
                owner: 'self',
                count: 2
              }
            }
          ]
        }
      },
      {
        choiceId: 'c4',
        label: '⑤',
        action: {
          type: 'SEQUENCE',
          steps: [
            {
              type: 'TRASH',
              target: { type: 'DECK_CARD', owner: 'self', count: 2 }
            },
            {
              type: 'TRANSFER_TO_HAND',
              source: {
                type: 'TRASH_CARD',
                owner: 'self',
                count: 2,
                upToCount: true,
                filter: { cardType: 'シグニ', colorOneOf: ['白', '黒'] }
              }
            }
          ]
        }
      }
    ]
  };
});

// WXK10-007 イレイザー・スマッシュ (アンコール付きアーツ)
// 「以下の２つから１つ。①相手センタールリグを対象とし（相手ターンなら能力を失わせる）。②相手シグニ１体にアタックできない付与（オプション白コスト）」
// 現状: BLOCK_ACTION(any, ATTACK) 1つだけ
fix('WXK10-007', 'CHOOSE欠落修正: 2択選択肢を追加', (efList) => {
  efList[0].action = {
    type: 'CHOOSE',
    choose_count: 1,
    from_count: 2,
    choices: [
      {
        choiceId: 'c0',
        label: '①',
        action: {
          type: 'STUB',
          id: 'BLOCK_LRIG_ABILITIES_IF_OPP_TURN',
          description: '対戦相手のセンタールリグ：相手ターンなら能力を失い新たに得られない',
          target: { type: 'CENTER_LRIG', owner: 'opponent' },
          until: 'END_OF_TURN'
        }
      },
      {
        choiceId: 'c1',
        label: '②',
        action: {
          type: 'BLOCK_ACTION',
          target: { type: 'SIGNI', owner: 'opponent', count: 1 },
          actionId: 'ATTACK',
          until: 'END_OF_TURN',
          optionalCost: { color: '白', count: 1 }
        }
      }
    ]
  };
});

// WXK10-008 怒髪衝炎 (アンコール付きアーツ)
// 「以下の２つから１つ。①相手ターンなら相手エナのカードは色と能力を失う。②相手7000以下シグニをバニッシュ（オプション赤コスト）」
// 現状: BANISH(self) 1つだけ → CHOOSEに修正
fix('WXK10-008', 'CHOOSE欠落修正: 2択選択肢を追加', (efList) => {
  efList[0].action = {
    type: 'CHOOSE',
    choose_count: 1,
    from_count: 2,
    choices: [
      {
        choiceId: 'c0',
        label: '①',
        action: {
          type: 'STUB',
          id: 'ENERGY_LOSE_COLOR_ABILITY_IF_OPP_TURN',
          description: '相手ターンなら対戦相手のエナのカードは色と能力を失う',
          until: 'END_OF_TURN'
        }
      },
      {
        choiceId: 'c1',
        label: '②',
        action: {
          type: 'BANISH',
          target: {
            type: 'SIGNI',
            owner: 'opponent',
            count: 1,
            filter: { cardType: 'シグニ', powerRange: { max: 7000 } },
            upToCount: false
          },
          optionalCost: { color: '赤', count: 1 }
        }
      }
    ]
  };
});

// WXK10-010 ドント・コール (アンコール付きアーツ)
// 「以下の２つから１つ。①このターン対戦相手は自分効果でカードを引いたり手札に加えることができない。②対戦相手のシグニ１体をダウン（オプション青コスト）」
// 現状: DOWN(self) 1つだけ → CHOOSEに修正
fix('WXK10-010', 'CHOOSE欠落修正: 2択選択肢を追加', (efList) => {
  efList[0].action = {
    type: 'CHOOSE',
    choose_count: 1,
    from_count: 2,
    choices: [
      {
        choiceId: 'c0',
        label: '①',
        action: {
          type: 'STUB',
          id: 'BLOCK_OPP_DRAW_BY_EFFECT',
          description: 'このターン対戦相手は自分の効果によってカードを引いたり手札に加えることができない',
          until: 'END_OF_TURN'
        }
      },
      {
        choiceId: 'c1',
        label: '②',
        action: {
          type: 'DOWN',
          target: {
            type: 'SIGNI',
            owner: 'opponent',
            count: 1,
            filter: { cardType: 'シグニ' },
            upToCount: false
          },
          optionalCost: { color: '青', count: 1 }
        }
      }
    ]
  };
});

// WXK10-012 停空飛翔 (アンコール付きアーツ)
// 「以下の２つから１つ。①このターン対戦相手のセンタールリグとシグニはアップしない。②（緑オプション）このターン対戦相手のセンタールリグがアタックしたときそのアタックを無効にする」
// 現状: NEGATE_ATTACK(opponent) 1つだけ → CHOOSEに修正
fix('WXK10-012', 'CHOOSE欠落修正: 2択選択肢を追加', (efList) => {
  efList[0].action = {
    type: 'CHOOSE',
    choose_count: 1,
    from_count: 2,
    choices: [
      {
        choiceId: 'c0',
        label: '①',
        action: {
          type: 'STUB',
          id: 'BLOCK_OPP_UP_LRUG_SIGNI',
          description: 'このターン対戦相手のセンタールリグとシグニはアップしない',
          until: 'END_OF_TURN'
        }
      },
      {
        choiceId: 'c1',
        label: '②',
        action: {
          type: 'STUB',
          id: 'NEGATE_OPP_LRIG_ATTACK_ON_ATTACK',
          description: '（緑コスト任意）このターン対戦相手のルリグアタックを無効化',
          optionalCost: { color: '緑', count: 1 },
          until: 'END_OF_TURN'
        }
      }
    ]
  };
});

// WXK10-013 クリミナル・リタッチ (アンコール付きアーツ)
// 「以下の２つから１つ。①相手ターンなら相手は自分の効果でシグニを新たに場に出せない。②対戦相手のシグニ１体を対象としターン終了時まで－7000（黒コストオプション）」
// 現状: POWER_MODIFY(any, -7000) 1つだけ → CHOOSEに修正
fix('WXK10-013', 'CHOOSE欠落修正: 2択選択肢を追加', (efList) => {
  efList[0].action = {
    type: 'CHOOSE',
    choose_count: 1,
    from_count: 2,
    choices: [
      {
        choiceId: 'c0',
        label: '①',
        action: {
          type: 'STUB',
          id: 'BLOCK_OPP_PLAY_SIGNI_IF_OPP_TURN',
          description: '相手ターンなら相手は自分の効果でシグニを新たに場に出せない',
          until: 'END_OF_TURN'
        }
      },
      {
        choiceId: 'c1',
        label: '②',
        action: {
          type: 'POWER_MODIFY',
          target: {
            type: 'SIGNI',
            owner: 'opponent',
            count: 1,
            filter: { cardType: 'シグニ' },
            upToCount: false
          },
          delta: -7000,
          optionalCost: { color: '黒', count: 1 }
        }
      }
    ]
  };
});

// WXK11-003 ロック・ユアハート
// 「（対戦相手のターンのみ）以下の２つから１つ。①相手アーツとスペルのコストが+3。このアーツをルリグデッキへ戻す。②相手は自分のセンタールリグより低レベルのシグニでアタックできない」
// 現状: SEQUENCE(BLOCK_ACTION, TRANSFER_TO_DECK) → これは①の説明に合っているが②がない
fix('WXK11-003', 'CHOOSE欠落修正: 2択選択肢を追加', (efList) => {
  efList[0].action = {
    type: 'CHOOSE',
    choose_count: 1,
    from_count: 2,
    choices: [
      {
        choiceId: 'c0',
        label: '①',
        action: {
          type: 'SEQUENCE',
          steps: [
            {
              type: 'STUB',
              id: 'INCREASE_ARTS_SPELL_COST',
              description: 'このターン対戦相手のアーツとスペルの使用コストは《無》×3増える',
              owner: 'opponent',
              increase: 3,
              until: 'END_OF_TURN'
            },
            {
              type: 'TRANSFER_TO_DECK',
              source: {
                type: 'SELF_CARD',
                owner: 'self'
              },
              destination: 'lrigDeck',
              shuffle: false
            }
          ]
        }
      },
      {
        choiceId: 'c1',
        label: '②',
        action: {
          type: 'STUB',
          id: 'BLOCK_OPP_SIGNI_ATTACK_BY_LRIG_LEVEL',
          description: '相手は自分のセンタールリグより低いレベルのシグニでアタックできない',
          until: 'END_OF_TURN'
        }
      }
    ]
  };
});

// ============================================================
// 2. owner間違い修正
// ============================================================

// WXK08-031 弩書　ザ・ロウ
// E1効果（アタックフェイズ起動：下からカード1枚トラッシュ→相手シグニ1体のパワー-4000）が丸ごと欠落
// 現状: E2（手札回収）とBURSTだけ
fix('WXK08-031', 'E1効果欠落修正: 相手シグニのパワー-4000効果を追加', (efList) => {
  efList.unshift({
    effectId: 'WXK08-031-E1',
    effectType: 'ACTIVATED',
    timing: ['ATTACK'],
    cost: {
      fromUnder: { count: 1 }
    },
    action: {
      type: 'POWER_MODIFY',
      target: {
        type: 'SIGNI',
        owner: 'opponent',
        count: 1,
        filter: { cardType: 'シグニ' },
        upToCount: false
      },
      delta: -4000
    },
    duration: 'UNTIL_END_OF_TURN',
    mandatory: false,
    parseStatus: 'MANUAL'
  });
});

// WXK08-052 爆書　グラング
// 「このシグニがアタックしたとき対戦相手のシグニ１体を対象とし，下からカード1枚トラッシュ→パワー-3000」
// 現状: POWER_MODIFY target owner: "any" → "opponent"に修正
fix('WXK08-052', 'POWER_MODIFY target owner: any -> opponent修正', (efList) => {
  const steps = efList[0].action.steps;
  const cond = steps.find(s => s.type === 'CONDITIONAL');
  if (cond && cond.then && cond.then.target) {
    cond.then.target.owner = 'opponent';
  }
});

// WXK09-060 楽隊の童話　コケコブ
// E1効果（アタックフェイズ開始時：相手シグニ1体のパワーを下のカード1枚につき-4000）が欠落
// E2: 相手ターン場を離れたとき相手デッキ4枚トラッシュ（現状のE2はON_PLAYなので実は「出現時：ロバン下から2種類置く」が正しい）
// 現在の E2(ON_PLAY)=4枚トラッシュ、E3(ON_PLAY)=PLACE_UNDER は間違ったマッピング
// 正しくは:
//   E1: AUTO ON_ATTACK_PHASE_START → 相手シグニパワー(下のカード数×-4000)
//   E2: AUTO ON_LEAVE_FIELD(相手ターン) → 相手デッキ4枚トラッシュ
//   E3: AUTO ON_PLAY → 指定2枚を下に置く
fix('WXK09-060', 'E1効果欠落修正+E2タイミング修正', (efList) => {
  // 現在のE2はON_PLAY: 4枚トラッシュ→これは「相手ターン離れたとき」の効果なので修正
  const e2 = efList.find(e => e.effectId === 'WXK09-060-E2');
  if (e2) {
    e2.timing = ['ON_LEAVE_FIELD'];
    e2.activeCondition = { type: 'IS_OPP_TURN' };
  }
  // E3のON_PLAY はそのまま（出現時）
  // E1を先頭に追加
  efList.unshift({
    effectId: 'WXK09-060-E1',
    effectType: 'AUTO',
    timing: ['ATTACK'],
    action: {
      type: 'STUB',
      id: 'POWER_MOD_PER_UNDER_COUNT',
      description: 'アタックフェイズ開始時：対戦相手のシグニ1体のパワーを下のカード1枚につき-4000',
      target: { type: 'SIGNI', owner: 'opponent', count: 1 },
      deltaPerCard: -4000
    },
    duration: 'UNTIL_END_OF_TURN',
    mandatory: true,
    parseStatus: 'MANUAL'
  });
});

// WXK10-040 羅原魔　デーモンコア
// E2「このシグニがアタックしたとき、このシグニよりパワーの低い対戦相手のシグニ１体を対象とし、赤シグニ捨てる→バニッシュ」
// 現状: BANISH target owner: "self" → "opponent"に修正
fix('WXK10-040', 'E2 BANISH target owner: self -> opponent修正', (efList) => {
  const e2 = efList.find(e => e.effectId === 'WXK10-040-E2');
  if (!e2) return;
  function traverse(action) {
    if (!action) return;
    if (action.type === 'SEQUENCE') { action.steps.forEach(traverse); return; }
    if (action.type === 'CONDITIONAL') { traverse(action.then); traverse(action.else); return; }
    if (action.type === 'BANISH' && action.target?.owner === 'self') {
      action.target.owner = 'opponent';
      // Also fix filter - should match lower power than this signi
      action.target.filter = { cardType: 'シグニ', powerLessThanSelf: true };
    }
  }
  traverse(e2.action);
});

// WXK11-049 羅植　ハルザクラ
// 「自分の効果によって対戦相手のシグニ１体が場から手札に移動したとき、エナチャージ１をする」
// 現状: E1がON_PLAYでENERGY_CHARGE_FROM_DECK → トリガー条件が完全に間違い
// 正しくはON_OPPONENT_SIGNI_BOUNCE_BY_SELF_EFFECT系のトリガー
fix('WXK11-049', 'E1トリガー修正: ON_PLAY→相手シグニが場から手札に移動したとき', (efList) => {
  const e1 = efList.find(e => e.effectId === 'WXK11-049-E1');
  if (e1) {
    e1.timing = ['ON_OPPONENT_SIGNI_RETURNED_TO_HAND'];
    e1.activeCondition = { type: 'CAUSED_BY_SELF_EFFECT' };
    e1.effectType = 'AUTO';
    e1.action = {
      type: 'ENERGY_CHARGE_FROM_DECK',
      owner: 'self',
      count: 1
    };
    e1.parseStatus = 'MANUAL';
  }
});

// ============================================================
// 保存
// ============================================================
fs.writeFileSync(effectsPath, JSON.stringify(effects, null, 2), 'utf8');
console.log(`\n合計 ${fixCount} 件修正完了`);
console.log('\n修正一覧:');
fixLog.forEach(f => console.log(`  ${f.cardId}: ${f.description}`));
