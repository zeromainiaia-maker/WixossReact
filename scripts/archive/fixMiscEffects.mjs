import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(__dirname, '../public/data/effects_misc.json');

const effects = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// ---- ヘルパー ----
const EC1 = { type: 'ENERGY_CHARGE', target: { type: 'DECK_CARD', owner: 'self', count: 1 } };

function makeTrashSelfSigni(story) {
  return {
    type: 'TRASH',
    target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', story } }
  };
}

function makeChoose2(choice0Action, choice1Action) {
  return {
    type: 'CHOOSE',
    choose_count: 1,
    from_count: 2,
    choices: [
      { choiceId: 'c0', label: '選択肢1', action: choice0Action },
      { choiceId: 'c1', label: '選択肢2', action: choice1Action }
    ]
  };
}

function makeSeq(...steps) {
  return { type: 'SEQUENCE', steps };
}

// ---- 修正定義 ----

// WDK05-T20: ①自遊具トラッシュ→相手シグニバウンス or ②エナチャージ1
effects['WDK05-T20'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('遊具'),
    { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } }, optional: false }
  ),
  EC1
);

// WDK05-R20: ①自英知トラッシュ→凍結相手シグニバニッシュ or ②エナチャージ1
effects['WDK05-R20'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('英知'),
    { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', isFrozen: true }, upToCount: false } }
  ),
  EC1
);

// WDK06-R20: ①自アームトラッシュ→手札1捨てカード2枚引く or ②エナチャージ1
effects['WDK06-R20'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('アーム'),
    makeSeq(
      { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } },
      { type: 'DRAW', owner: 'self', count: 2 }
    )
  ),
  EC1
);

// WDK06-C20: ①自武勇トラッシュ→デッキ2枚トラッシュ→武勇をトラッシュから場へ or ②エナチャージ1
effects['WDK06-C20'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('武勇'),
    makeSeq(
      { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 2 } },
      { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: '武勇' } } }
    )
  ),
  EC1
);

// WDK07-E08: ①相手シグニダウン or ②Draw2 or ③スペル打消し+名前禁止
effects['WDK07-E08'][0].action = {
  type: 'CHOOSE',
  choose_count: 1,
  from_count: 3,
  choices: [
    {
      choiceId: 'c0',
      label: '相手シグニをダウン',
      action: { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } }
    },
    {
      choiceId: 'c1',
      label: 'カードを2枚引く',
      action: { type: 'DRAW', owner: 'self', count: 2 }
    },
    {
      choiceId: 'c2',
      label: 'スペル打消し+名前禁止',
      action: makeSeq(
        { type: 'STUB', id: 'NEGATE_SPELL_RETURN_TO_OPP_HAND' },
        { type: 'NAME_BAN', targetSelf: false, duration: 'TURN' }
      )
    }
  ]
};

// WDK07-E20: ①自調理トラッシュ→デッキからアクセ装着 or ②エナチャージ1
effects['WDK07-E20'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('調理'),
    { type: 'STUB', id: 'SEARCH_AND_ATTACH_ACCE', filter: { story: '調理' } }
  ),
  EC1
);

// WDK08-Y20: ①自水獣トラッシュ→そのパワー以下の相手シグニバニッシュ or ②エナチャージ1
effects['WDK08-Y20'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('水獣'),
    { type: 'STUB', id: 'BANISH_OPP_SIGNI_BY_TRASHED_POWER' }
  ),
  EC1
);

// WDK08-L20: ①自紅蓮トラッシュ→相手パワー12000以下バニッシュ or ②エナチャージ1
effects['WDK08-L20'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('紅蓮'),
    { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { max: 12000 } }, upToCount: false } }
  ),
  EC1
);

// WDK09-022: ①自迷宮トラッシュ→トラッシュから迷宮手札 or ②エナチャージ1
effects['WDK09-022'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('迷宮'),
    { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: '迷宮' } } }
  ),
  EC1
);

// WDK10-022: ①自龍獣トラッシュ→トラッシュから龍獣手札 or ②エナチャージ1
effects['WDK10-022'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('龍獣'),
    { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: '龍獣' } } }
  ),
  EC1
);

// WDK11-022: ①自英知トラッシュ→デッキから英知サーチ手札 or ②エナチャージ1
effects['WDK11-022'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('英知'),
    {
      type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ', story: '英知' }, maxCount: 1,
      then: { type: 'SEQUENCE', steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }] },
      afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' }
    }
  ),
  EC1
);

// WDK12-022: ①自微菌トラッシュ→エナゾーンからシグニ手札 or ②エナチャージ1
effects['WDK12-022'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('微菌'),
    { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: false } }
  ),
  EC1
);

// WDK14-022: ①自悪魔トラッシュ→手札1捨てカード2枚引く or ②エナチャージ1
effects['WDK14-022'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('悪魔'),
    makeSeq(
      { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } },
      { type: 'DRAW', owner: 'self', count: 2 }
    )
  ),
  EC1
);

// WDK15-022: ①自ウェポントラッシュ→トラッシュからウェポン手札 or ②エナチャージ1
effects['WDK15-022'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('ウェポン'),
    { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: 'ウェポン' } } }
  ),
  EC1
);

// WDK16-22: ①自電機トラッシュ→相手シグニバウンス or ②エナチャージ1
effects['WDK16-22'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('電機'),
    { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } }, optional: false }
  ),
  EC1
);

// WDK17-008: ①ルリグタイプ継承+ルリグデッキ戻し or ②相手シグニ2体まで-15000
effects['WDK17-008'][0].action = makeChoose2(
  makeSeq(
    { type: 'STUB', id: 'INHERIT_OPP_LRIG_TYPE' },
    { type: 'STUB', id: 'SOUL_OP' }
  ),
  {
    type: 'POWER_MODIFY',
    target: { type: 'SIGNI', owner: 'opponent', count: 2, upToCount: true, filter: { cardType: 'シグニ' } },
    delta: -15000,
    duration: 'UNTIL_END_OF_TURN'
  }
);

// WDK17-022: ①自美巧トラッシュ→トラッシュから美巧手札 or ②エナチャージ1
effects['WDK17-022'][0].action = makeChoose2(
  makeSeq(
    makeTrashSelfSigni('美巧'),
    { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: '美巧' } } }
  ),
  EC1
);

// SP27-014-E1: CONTINUOUS POWER_MODIFY owner:any → self(他の青シグニ全体)
// 「あなたの他の青のシグニのパワーを＋2000する」
effects['SP27-014'][0].action = {
  type: 'POWER_MODIFY',
  target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', color: '青', isOther: true } },
  delta: 2000
};

// SP27-014-E2: AUTO ON_TRASH CHOOSE(3択): ①Draw1 ②エナチャージ1 ③手札捨て→相手バニッシュ(任意)
// 「このシグニが対戦相手の効果によっていずれかの領域からトラッシュに置かれたとき」
effects['SP27-014'][1].action = {
  type: 'CHOOSE',
  choose_count: 1,
  from_count: 3,
  choices: [
    { choiceId: 'c0', label: 'カードを1枚引く', action: { type: 'DRAW', owner: 'self', count: 1 } },
    { choiceId: 'c1', label: 'エナチャージ1', action: EC1 },
    {
      choiceId: 'c2',
      label: '手札を捨てて相手シグニバニッシュ',
      action: makeSeq(
        { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1, optional: true } },
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } }
      )
    }
  ]
};

// PR-316: ①トラッシュから毒牙2枚まで手札 or ②手札全捨て→トラッシュから毒牙2枚まで場へ
effects['PR-316'][0].action = makeChoose2(
  { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 2, upToCount: true, filter: { cardType: 'シグニ', story: '毒牙' } } },
  makeSeq(
    { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL' } },
    { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'TRASH_CARD', owner: 'self', count: 2, upToCount: true, filter: { cardType: 'シグニ', story: '毒牙' } } }
  )
);

// ---- WDK09-011 修正 ----
// E1: TRASH(DECK_CARD, owner:self) → opponent (「対戦相手のデッキの一番上」)
effects['WDK09-011'][0].action.steps[1] = {
  type: 'TRASH',
  target: { type: 'DECK_CARD', owner: 'opponent', count: 1 }
};

// E2: GRANT_KEYWORD(ゲート, self) → 「【ゲート】があるシグニゾーンにある相手シグニをデッキ3番目に置く」
// 効果タイプは AUTO(ON_PLAY) でコスト青1が正しい
effects['WDK09-011'][1] = {
  effectId: 'WDK09-011-E2',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  cost: { energy: [{ color: '青', count: 1 }] },
  action: { type: 'STUB', id: 'OPP_SIGNI_TO_DECK_NTH', filter: { hasGate: true }, position: 3 },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL'
};

// ---- WDK11-007 修正 ----
// E1: BLOCK_ACTION(owner:any) × 2 → opponent + 2体目にCONDITIONAL(IS_OPPONENT_HAS_KEY)
effects['WDK11-007'][0].action = makeSeq(
  { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, actionId: 'ATTACK', until: 'END_OF_TURN' },
  {
    type: 'CONDITIONAL',
    condition: { type: 'HAS_KEY', owner: 'opponent' },
    then: { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, actionId: 'ATTACK', until: 'END_OF_TURN' }
  }
);

// ---- WDK08-Y07 修正 ----
// UNKNOWN(手札からシグニ公開) → REVEAL(hand,self,1,シグニ)
effects['WDK08-Y07'][0].action.steps[0] = {
  type: 'REVEAL',
  source: { type: 'HAND_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ' } }
};

// ---- WD23-017-EA 修正 ----
// UNKNOWN(カードを2枚引き手札1枚デッキ上) → DRAW(2) + TRANSFER_TO_DECK(hand,1,top)
effects['WD23-017-EA'][0].action.steps[0] = makeSeq(
  { type: 'DRAW', owner: 'self', count: 2 },
  { type: 'TRANSFER_TO_DECK', source: { type: 'HAND_CARD', owner: 'self', count: 1 }, position: 'top', shuffle: false }
);

// ---- parseStatus 更新 ----
const updatedCards = [
  'WDK05-T20','WDK05-R20','WDK06-R20','WDK06-C20','WDK07-E08','WDK07-E20',
  'WDK08-Y20','WDK08-L20','WDK09-022','WDK10-022','WDK11-022','WDK12-022',
  'WDK14-022','WDK15-022','WDK16-22','WDK17-008','WDK17-022',
  'SP27-014','PR-316','WDK09-011','WDK11-007','WDK08-Y07','WD23-017-EA'
];

for (const cardId of updatedCards) {
  for (const ef of (effects[cardId] || [])) {
    if (ef.parseStatus !== 'MANUAL') ef.parseStatus = 'MANUAL';
  }
}

fs.writeFileSync(dataPath, JSON.stringify(effects, null, 4), 'utf8');
console.log('修正完了:', updatedCards.length, 'カード');
