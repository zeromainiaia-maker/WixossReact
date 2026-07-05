/**
 * fixWX24.mjs
 * effects_WX24_26.json の実装ミスを修正するスクリプト
 *
 * 修正種別:
 * A) CHOOSE欠落: 「以下の○つから選ぶ」テキストがあるのに CHOOSE がないカード
 * B) owner間違い: 自分を操作するはずが opponent / opponent を操作するはずが self
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(__dirname, '../public/data/effects_WX24_26.json');
const effects = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// ---- ヘルパー ----
function choose(count, from, ...choiceActions) {
  return {
    type: 'CHOOSE',
    choose_count: count,
    from_count: from,
    choices: choiceActions.map((action, i) => ({
      choiceId: `c${i}`,
      label: `選択肢${i + 1}`,
      action
    }))
  };
}
function choose1of2(a, b) { return choose(1, 2, a, b); }
function choose1of3(a, b, c) { return choose(1, 3, a, b, c); }
function choose2of3(a, b, c) { return choose(2, 3, a, b, c); }
function choose2of4(a, b, c, d) { return choose(2, 4, a, b, c, d); }
function seq(...steps) { return { type: 'SEQUENCE', steps }; }
function stub(id) { return { type: 'STUB', id }; }

// ============================================================
// WX24-P1-007 全力疾走
// 以下の3つから2つまで選ぶ。
// ①エナチャージ3
// ②エナから自シグニ3枚まで場に出す。次の相手ターン終了時まで自シグニ全体+5000
// ③次の自アタックフェイズ開始時、自シグニ1体にSランサー付与
// ============================================================
effects['WX24-P1-007'][0].action = choose(2, 3,
  { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 3 },
  seq(
    { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'ENERGY_CARD', owner: 'self', count: 3, upToCount: true, filter: { cardType: 'シグニ' } } },
    { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ' } }, delta: 5000, duration: 'UNTIL_OPPONENT_TURN_END' }
  ),
  { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' } }, keyword: 'Ｓランサー', duration: 'UNTIL_END_OF_TURN', delayed: 'NEXT_ATTACK_PHASE_START' }
);

// ============================================================
// WX24-P1-065 コードアート Sヨクセンキ
// 【自】アタックフェイズ開始時 以下の2つから1つを選ぶ。
// ①手札を1枚捨ててもよい。そうした場合、対戦相手は手札を1枚捨てる。
// ②手札からスペルを1枚捨ててもよい。そうした場合、対戦相手の手札を1枚見ないで選び捨てさせる。
// ============================================================
effects['WX24-P1-065'][0].action = choose1of2(
  seq(
    { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1, upToCount: false }, optional: true,
      then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } }
  ),
  seq(
    { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1, filter: { cardType: 'スペル' }, upToCount: false }, optional: true,
      then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, blind: true } } }
  )
);

// ============================================================
// WX24-P2-094 スラッシング・ミラクル
// 以下の2つから1つを選ぶ。
// ①対戦相手のシグニゾーン1つを指定。このターンそのゾーンのシグニパワー-3000
// ②自トラッシュから<迷宮>シグニ1枚を手札に加える。
// ============================================================
effects['WX24-P2-094'][0].action = choose1of2(
  { type: 'POWER_MODIFY', target: { type: 'SIGNI_ZONE', owner: 'opponent', count: 1 }, delta: -3000, duration: 'UNTIL_END_OF_TURN' },
  { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: '迷宮' } } }
);

// ============================================================
// WX24-P4-009 落葉帰根 — OWNER修正: BURSTのtargetが「対戦相手のシグニ」なのに owner:"self"
// EffectText: 対戦相手のシグニによってライフクロスがクラッシュされる場合、代わりにデッキ10枚をトラッシュ
// ============================================================
// BURST側のみowner修正（E1はすでに正しい想定なので確認の上修正）
if (effects['WX24-P4-009']) {
  const burst = effects['WX24-P4-009'].find(e => e.effectType === 'LIFE_BURST');
  if (burst && burst.action && burst.action.target && burst.action.target.owner === 'self') {
    burst.action.target.owner = 'opponent';
  }
}

// ============================================================
// WX25-P2-076 コードアート Yキソバキ
// 以下の2つから1つを選ぶ。
// ①相手エナ2枚以上の場合、自エナから<電機>1枚トラッシュ。そうした場合、相手は自エナから1枚トラッシュ
// ②覚醒状態で相手エナ3枚以上の場合、相手は自エナから2枚トラッシュ
// ============================================================
effects['WX25-P2-076'][0].action = choose1of2(
  seq(
    { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ', story: '電機' } }, optional: true,
      then: { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } } }
  ),
  { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 2 } }
);

// ============================================================
// WX25-P2-084 蒼将 オウキ
// 以下の2つから1つを選ぶ。
// ①場に他の<武勇>がある場合、相手シグニ2体まで凍結
// ②自エナから<武勇>1枚をトラッシュ。そうした場合、ターン終了時まで【アサシン（凍結状態のパワー3000以下のシグニ）】を得る
// ============================================================
effects['WX25-P2-084'][0].action = choose1of2(
  { type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: 2, upToCount: true, filter: { cardType: 'シグニ' } } },
  seq(
    { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ', story: '武勇' } }, optional: true,
      then: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { isSelf: true } }, keyword: 'アサシン', condition: '凍結状態のパワー3000以下のシグニ', duration: 'UNTIL_END_OF_TURN' } }
  )
);

// ============================================================
// WX25-P2-097 曲芸
// 以下の2つから1つを選ぶ。
// ①デッキ上3枚見て<遊具>1枚をエナゾーンに置き残りをデッキ下へ
// ②自エナから<遊具>シグニ1枚を場に出す
// ============================================================
effects['WX25-P2-097'][0].action = choose1of2(
  seq(
    { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 3, private: true, reorder: false,
      canMoveToEnergy: true, energyFilter: { cardType: 'シグニ', story: '遊具' },
      destination: { location: 'deck', owner: 'self', position: 'bottom' } }
  ),
  { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: '遊具' } } }
);

// ============================================================
// WX25-P3-082 紅天 セラフィム
// 以下の2つから1つを選ぶ。
// ①相手パワー12000以下シグニ1体を対象とし、《赤》《無》を支払ってもよい。そうした場合バニッシュ
// ②自<天使>シグニ2体までアップ
// ※ 現在 E1.action が BANISH owner:"self" という誤り → CHOOSE に修正
// ============================================================
effects['WX25-P3-082'][0].action = choose1of2(
  seq(
    { type: 'STUB', id: 'OPTIONAL_PAY_RED_AND_COLORLESS',
      cost: { energy: [{ color: '赤', count: 1 }, { color: '無', count: 1 }] },
      then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { max: 12000 } }, upToCount: false } } }
  ),
  { type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 2, upToCount: true, filter: { cardType: 'シグニ', story: '天使' } } }
);

// ============================================================
// WX25-P3-095 幻竜 プエルタ
// 以下の2つから1つを選ぶ。
// ①デッキ上を公開。<龍獣>なら【エナチャージ1】
// ②場に赤の<龍獣>がある場合、【エナチャージ1】
// ============================================================
effects['WX25-P3-095'][0].action = choose1of2(
  { type: 'REVEAL_AND_PICK', owner: 'self', revealCount: 1,
    filter: { cardType: 'シグニ', story: '龍獣' }, pickCount: 1,
    then: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
    remainder: { location: 'deck', position: 'top' } },
  { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 }
);

// ============================================================
// WX25-CP1-004 白亜の予告状
// 以下の4つから2つまで選ぶ。《リコレクト4+》代わりに3つまで。
// ①カード3枚引く
// ②相手ルリグ1体対象、手札から<ブルアカ>1枚捨ててもよい。そうした場合ダウン
// ③相手シグニ1体対象、手札から<ブルアカ>1枚捨ててもよい。そうした場合ダウン
// ④相手シグニ1体対象、手札4枚捨てる。そうした場合バニッシュ
// ============================================================
effects['WX25-CP1-004'][0].action = seq(
  { type: 'RECOLLECT_GATE', minArts: 4 },
  choose(2, 4,
    { type: 'DRAW', owner: 'self', count: 3 },
    seq(
      { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1, filter: { story: 'ブルアカ' } }, optional: true,
        then: { type: 'DOWN', target: { type: 'LRIG', owner: 'opponent', count: 1 } } }
    ),
    seq(
      { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1, filter: { story: 'ブルアカ' } }, optional: true,
        then: { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } } }
    ),
    seq(
      { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 4 }, optional: false,
        then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } } }
    )
  )
);

// ============================================================
// WX25-CP1-006 諸君、戦列を整えろ
// 以下の4つから2つまで選ぶ。《リコレクト4+》代わりに3つまで。
// ①エナチャージ3
// ②自エナから<ブルアカ>シグニ1枚を場に出す。【出】能力は発動しない
// ③このターン次に自分がルリグダメージを受ける場合代わりに受けない
// ④相手パワー10000以上シグニ1体、自エナから<ブルアカ>3枚トラッシュ。そうした場合バニッシュ
// ============================================================
effects['WX25-CP1-006'][0].action = seq(
  { type: 'RECOLLECT_GATE', minArts: 4 },
  choose(2, 4,
    { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 3 },
    seq(
      { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: 'ブルアカ' } } },
      { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' }
    ),
    { type: 'PREVENT_NEXT_DAMAGE', count: 1, damageType: 'LRIG' },
    seq(
      { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 3, filter: { story: 'ブルアカ' } }, optional: true,
        then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { min: 10000 } }, upToCount: false } } }
    )
  )
);

// ============================================================
// WX25-CP1-008 0068 オペラより愛をこめて！
// 以下の4つから2つまで選ぶ。《リコレクト4+》代わりに3つまで。
// ①デッキ5枚トラッシュ。<ブルアカ>カードがトラッシュされた場合、このターン次のダメージを受けない
// ②自トラッシュからシグニ1枚を手札に加える
// ③相手シグニ1体対象、このターン次にアタックしたとき相手トラッシュの<ブルアカ>1枚につき-2000
// ④相手シグニ1体対象、このターン終了時バニッシュ
// ============================================================
effects['WX25-CP1-008'][0].action = seq(
  { type: 'RECOLLECT_GATE', minArts: 4 },
  choose(2, 4,
    seq(
      { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 5 } },
      { type: 'CONDITIONAL', condition: { type: 'TRASHED_BLUEARCHIVE' },
        then: { type: 'PREVENT_NEXT_DAMAGE', count: 1 } }
    ),
    { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } },
    { type: 'STUB', id: 'POWER_MINUS_PER_BLUEARCHIVE_TRASH_ON_ATTACK' },
    { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, timing: 'END_OF_TURN' }
  )
);

// ============================================================
// WX25-CP1-026 隠されし遺産を求めて
// 以下の2つから1つを選ぶ。
// ①相手ルリグかシグニ1体、ターン終了時まで「アタックできない」
// ②相手ルリグとシグニ合計2体まで、自エナから<ブルアカ>2枚をトラッシュ。
//   そうした場合ターン終了時まで「アタックできない」
// ============================================================
effects['WX25-CP1-026'][0].action = choose1of2(
  { type: 'GRANT_KEYWORD', target: { type: 'ANY', owner: 'opponent', count: 1, filter: { isLrigOrSigni: true } }, keyword: 'アタックできない', duration: 'UNTIL_END_OF_TURN' },
  seq(
    { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 2, filter: { story: 'ブルアカ' } }, optional: true,
      then: { type: 'GRANT_KEYWORD', target: { type: 'ANY', owner: 'opponent', count: 2, upToCount: true, filter: { isLrigOrSigni: true } }, keyword: 'アタックできない', duration: 'UNTIL_END_OF_TURN' } }
  )
);

// ============================================================
// WX25-CP1-028 作戦準備
// 以下の2つから1つを選ぶ。
// ①相手ルリグかシグニ1体をダウン
// ②相手ルリグとシグニ合計2体まで対象、自エナから<ブルアカ>2枚トラッシュ。そうした場合ダウン
// ※ 現在の JSON は owner:"self" で DOWN を実行している → opponent に修正 + CHOOSE追加
// ============================================================
effects['WX25-CP1-028'][0].action = choose1of2(
  { type: 'DOWN', target: { type: 'ANY', owner: 'opponent', count: 1, filter: { isLrigOrSigni: true }, upToCount: false } },
  seq(
    { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 2, filter: { story: 'ブルアカ' } }, optional: true,
      then: { type: 'DOWN', target: { type: 'ANY', owner: 'opponent', count: 2, upToCount: true, filter: { isLrigOrSigni: true } } } }
  )
);

// ============================================================
// WX25-CP1-030 出張！百夜堂 海の家FC計画
// 以下の2つから1つを選ぶ。
// ①相手ルリグかシグニ1体、次にアタックしたときそのアタックを無効にする
// ②相手ルリグとシグニ合計2体まで対象、自エナから<ブルアカ>2枚トラッシュ。そうした場合それぞれ次アタック無効
// ============================================================
effects['WX25-CP1-030'][0].action = choose1of2(
  { type: 'NEGATE_ATTACK', target: { type: 'ANY', owner: 'opponent', count: 1, filter: { isLrigOrSigni: true }, upToCount: false } },
  seq(
    { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 2, filter: { story: 'ブルアカ' } }, optional: true,
      then: { type: 'NEGATE_ATTACK', target: { type: 'ANY', owner: 'opponent', count: 2, upToCount: true, filter: { isLrigOrSigni: true } } } }
  )
);

// ============================================================
// WX25-CP1-032 超無敵鉄甲「虎丸」降下!!!
// 以下の2つから1つを選ぶ。
// ①相手シグニ1体、ターン終了時まで「自:アタックしたとき、ターン終了時までパワー-20000」を得る
// ②相手シグニ2体まで、自エナから<ブルアカ>2枚トラッシュ。そうした場合同じ能力を得る
// ※ 現在の JSON は POWER_MODIFY owner:"self" という誤り → CHOOSE + GRANT_KEYWORD_EFFECT に修正
// ============================================================
effects['WX25-CP1-032'][0].action = choose1of2(
  { type: 'GRANT_TEMP_ABILITY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false },
    ability: { type: 'AUTO', trigger: 'ON_ATTACK_SIGNI', action: { type: 'POWER_MODIFY', target: { type: 'THIS_SIGNI' }, delta: -20000, duration: 'UNTIL_END_OF_TURN' } },
    duration: 'UNTIL_END_OF_TURN' },
  seq(
    { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 2, filter: { story: 'ブルアカ' } }, optional: true,
      then: { type: 'GRANT_TEMP_ABILITY', target: { type: 'SIGNI', owner: 'opponent', count: 2, upToCount: true, filter: { cardType: 'シグニ' } },
        ability: { type: 'AUTO', trigger: 'ON_ATTACK_SIGNI', action: { type: 'POWER_MODIFY', target: { type: 'THIS_SIGNI' }, delta: -20000, duration: 'UNTIL_END_OF_TURN' } },
        duration: 'UNTIL_END_OF_TURN' } }
  )
);

// ============================================================
// WX26-CP1-003 TRIAD FORCE
// 以下の3つから1つを選ぶ。《リコレクト4+》代わりに2つまで（上から順番に行う）
// ①センタールリグのレベル1につきカード1枚引くか、レベル1につきエナチャージ1
//   → さらに内部で2択 (DRAW or EC1) を選ぶ
// ②手札から<プリオケ>2枚捨ててもよい。そうした場合相手のライフクロス1枚クラッシュ
// ③次のアタックフェイズ開始時、自<プリオケ>シグニ1体に【アサシン】か【ダブルクラッシュ】を得る
// ============================================================
effects['WX26-CP1-003'][0].action = seq(
  { type: 'RECOLLECT_GATE', minArts: 4 },
  choose(1, 3,
    choose1of2(
      { type: 'DRAW', owner: 'self', count: 1, perLrigLevel: true },
      { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1, perLrigLevel: true }
    ),
    seq(
      { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 2, filter: { story: 'プリオケ' } }, optional: true,
        then: { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true } }
    ),
    { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', story: 'プリオケ' } },
      keyword: 'アサシン_OR_ダブルクラッシュ', duration: 'UNTIL_END_OF_TURN', delayed: 'NEXT_ATTACK_PHASE_START' }
  )
);

// ============================================================
// WX26-CP1-005 Super Higher Dreamer!!!
// 以下の3つから1つを選ぶ。《リコレクト4+》代わりに2つまで（上から順番に行う）
// ①カード5枚引き、手札2枚捨てる
// ②次のアタックフェイズ開始時、自<プリオケ>1体のレベル1につき相手は手札1枚捨てる
// ③次のアタックフェイズ開始時、自<プリオケ>1体に「アタックしたとき相手シグニ1体をデッキ下へ」
// ============================================================
effects['WX26-CP1-005'][0].action = seq(
  { type: 'RECOLLECT_GATE', minArts: 4 },
  choose1of3(
    seq(
      { type: 'DRAW', owner: 'self', count: 5 },
      { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 2 } }
    ),
    { type: 'STUB', id: 'OPPONENT_DISCARD_PER_PRIOCE_LEVEL', delayed: 'NEXT_ATTACK_PHASE_START' },
    { type: 'GRANT_TEMP_ABILITY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', story: 'プリオケ' } },
      ability: { type: 'AUTO', trigger: 'ON_ATTACK_SIGNI', action: { type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner: 'opponent', count: 1 }, shuffle: false, position: 'bottom' } },
      duration: 'UNTIL_END_OF_TURN', delayed: 'NEXT_ATTACK_PHASE_START' }
  )
);

// ============================================================
// WX26-CP1-007 TRINITY DIVINE
// 以下の3つから1つを選ぶ。《リコレクト4+》代わりに2つまで（上から順番に行う）
// ①自エナから<プリオケ>シグニ1枚まで場に出す。その後自<プリオケ>シグニ1体にSランサー付与
// ②自トラッシュから<プリオケ>カード3枚まで対象とし、エナゾーンに置く
// ③次の対戦相手のターンの間、ルリグによるダメージを受けない
// ============================================================
effects['WX26-CP1-007'][0].action = seq(
  { type: 'RECOLLECT_GATE', minArts: 4 },
  choose1of3(
    seq(
      { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true, filter: { cardType: 'シグニ', story: 'プリオケ' } } },
      { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', story: 'プリオケ' } }, keyword: 'Ｓランサー', duration: 'UNTIL_END_OF_TURN' }
    ),
    { type: 'TRANSFER_TO_ENERGY', source: { type: 'TRASH_CARD', owner: 'self', count: 3, upToCount: true, filter: { story: 'プリオケ' } } },
    { type: 'PREVENT_DAMAGE', owner: 'self', damageType: 'LRIG', duration: 'OPPONENT_NEXT_TURN' }
  )
);

// ============================================================
// WX26-CP1-009 ONENESS HARMONY
// 以下の3つから1つを選ぶ。《リコレクト4+》代わりに2つまで（上から順番に行う）
// ①自トラッシュから<プリオケ>カード2枚まで手札に加える
// ②相手シグニ1体、ターン終了時まで能力を失いパワー-30000
// ③次のアタックフェイズ開始時、自場の<プリオケ>1体につき相手デッキ上4枚トラッシュ
// ============================================================
effects['WX26-CP1-009'][0].action = seq(
  { type: 'RECOLLECT_GATE', minArts: 4 },
  choose1of3(
    { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 2, upToCount: true, filter: { story: 'プリオケ' } } },
    seq(
      { type: 'REMOVE_ABILITIES', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, until: 'UNTIL_END_OF_TURN' },
      { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, delta: -30000 }
    ),
    { type: 'STUB', id: 'TRASH_DECK_PER_PRIOCE_SIGNI_ON_FIELD', delayed: 'NEXT_ATTACK_PHASE_START' }
  )
);

// ============================================================
// WX26-CP1-019 ヴィオラ クロス ネージュ クレイモアスマッシャー
// 以下の2つから1つを選ぶ。
// ①相手パワー10000以下シグニ1体を手札に戻す。デッキ上5枚見て<プリオケ>1枚まで
//   エナ置き、白の<プリオケ>1枚まで手札に加え、残りをデッキ下へ
// ②相手シグニ1体、ターン終了時まで-10000。デッキ上5枚見て<プリオケ>1枚まで
//   エナ置き、黒の<プリオケ>1枚まで手札に加え、残りをデッキ下へ
// ============================================================
effects['WX26-CP1-019'][0].action = choose1of2(
  seq(
    { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { max: 10000 } }, upToCount: false }, optional: false },
    { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 5, private: true, reorder: true,
      canMoveToEnergy: true, energyFilter: { story: 'プリオケ' },
      canMoveToHand: true, handFilter: { story: 'プリオケ', color: '白' },
      destination: { location: 'deck', owner: 'self', position: 'bottom' } }
  ),
  seq(
    { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, delta: -10000, duration: 'UNTIL_END_OF_TURN' },
    { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 5, private: true, reorder: true,
      canMoveToEnergy: true, energyFilter: { story: 'プリオケ' },
      canMoveToHand: true, handFilter: { story: 'プリオケ', color: '黒' },
      destination: { location: 'deck', owner: 'self', position: 'bottom' } }
  )
);

// ============================================================
// WX26-CP1-023 エスコート ダイヤモンド
// 以下の2つから1つを選ぶ。
// ①場にシグニがない場合、手札から<プリオケ>シグニ1枚を場に出す（【出】能力は発動しない）
// ②場に<プリオケ>シグニがある場合、このターン相手ルリグによるダメージを受けない
// ============================================================
effects['WX26-CP1-023'][0].action = choose1of2(
  seq(
    { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'HAND_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: 'プリオケ' } } },
    { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' }
  ),
  { type: 'PREVENT_DAMAGE', owner: 'self', damageType: 'LRIG', duration: 'UNTIL_END_OF_TURN' }
);

// ============================================================
// WX25-CD1-06 出張！百夜堂 海の家FC計画 (CDバリアント)
// 以下の2つから1つを選ぶ。
// ①相手ルリグかシグニ1体、次アタックを無効
// ②相手ルリグとシグニ合計2体まで、自エナ<ブルアカ>2枚トラッシュ。そうした場合それぞれ次アタック無効
// ============================================================
effects['WX25-CD1-06'][0].action = choose1of2(
  { type: 'NEGATE_ATTACK', target: { type: 'ANY', owner: 'opponent', count: 1, filter: { isLrigOrSigni: true }, upToCount: false } },
  seq(
    { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 2, filter: { story: 'ブルアカ' } }, optional: true,
      then: { type: 'NEGATE_ATTACK', target: { type: 'ANY', owner: 'opponent', count: 2, upToCount: true, filter: { isLrigOrSigni: true } } } }
  )
);

// ---- 書き出し ----
fs.writeFileSync(dataPath, JSON.stringify(effects, null, 2), 'utf8');
console.log('effects_WX24_26.json を修正しました。');

// ---- 修正サマリー ----
console.log('\n修正カード一覧:');
console.log('  [CHOOSE追加] WX24-P1-007 全力疾走: POWER_MODIFY → choose2of3');
console.log('  [CHOOSE追加] WX24-P1-065 コードアートSヨクセンキ: 誤ったSEQUENCE → choose1of2');
console.log('  [CHOOSE追加] WX24-P2-094 スラッシング・ミラクル: POWER_MODIFY単体 → choose1of2');
console.log('  [CHOOSE追加] WX25-P2-076 コードアートYキソバキ: TRASH単体 → choose1of2');
console.log('  [CHOOSE追加] WX25-P2-084 蒼将オウキ: GRANT_KEYWORD単体 → choose1of2');
console.log('  [CHOOSE追加] WX25-P2-097 曲芸: TRANSFER_TO_DECK単体 → choose1of2');
console.log('  [CHOOSE追加+owner修正] WX25-P3-082 紅天セラフィム: BANISH owner=self → choose1of2 + opponent');
console.log('  [CHOOSE追加] WX25-P3-095 幻竜プエルタ: ENERGY_CHARGE単体 → choose1of2');
console.log('  [CHOOSE追加+owner修正] WX25-CP1-004 白亜の予告状: owner=selfのDOWN/BANISH → choose2of4+opponent');
console.log('  [CHOOSE追加+owner修正] WX25-CP1-006 諸君、戦列を整えろ: owner=selfのBANISH → choose2of4+opponent');
console.log('  [CHOOSE追加] WX25-CP1-008 0068オペラより愛をこめて！: 部分的SEQUENCE → choose2of4');
console.log('  [CHOOSE追加] WX25-CP1-026 隠されし遺産を求めて: BLOCK_ACTION単体 → choose1of2');
console.log('  [CHOOSE追加+owner修正] WX25-CP1-028 作戦準備: DOWN owner=self → choose1of2+opponent');
console.log('  [CHOOSE追加] WX25-CP1-030 出張！百夜堂: NEGATE_ATTACK単体 → choose1of2');
console.log('  [CHOOSE追加+owner修正] WX25-CP1-032 超無敵鉄甲「虎丸」: POWER_MODIFY owner=self → choose1of2+opponent');
console.log('  [CHOOSE追加] WX26-CP1-003 TRIAD FORCE: SEQUENCE → choose1of3(内部含む)');
console.log('  [CHOOSE追加] WX26-CP1-005 Super Higher Dreamer!!!: RECOLLECT_GATE単体 → choose1of3');
console.log('  [CHOOSE追加] WX26-CP1-007 TRINITY DIVINE: SEQUENCE → choose1of3');
console.log('  [CHOOSE追加] WX26-CP1-009 ONENESS HARMONY: RECOLLECT_GATE単体 → choose1of3');
console.log('  [CHOOSE追加] WX26-CP1-019 ヴィオラクロスネージュ: LOOK_AND_REORDER単体 → choose1of2');
console.log('  [CHOOSE追加] WX26-CP1-023 エスコートダイヤモンド: BLOCK_ACTION単体 → choose1of2');
console.log('  [CHOOSE追加] WX25-CD1-06 出張！百夜堂(CD): NEGATE_ATTACK単体 → choose1of2');
