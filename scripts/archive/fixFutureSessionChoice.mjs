// WX26-CP1-001 FUTURE SESSION:「以下の3つから1つを選ぶ（リコレクト4枚以上で2つまで）」を CHOOSE で再構築。
// 旧JSONは SEQUENCE[RECOLLECT_GATE, REVEAL_PICK] で②のみを常時実行し、①シグニバリア・③が欠落していた。
// 制約: choose_count は固定のため「リコレクト4枚以上で2つまで」の上昇は未対応（choose_count:1 固定）。
//       ②は「プリオケ1枚をエナゾーンへ」を省略した近似、③（次アタックフェイズの遅延能力付与）は未実装。
import fs from 'fs';

const file = 'public/data/effects_WX24_26.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const e1 = data['WX26-CP1-001'].find(e => e.effectId === 'WX26-CP1-001-E1');

e1.action = {
  type: 'CHOOSE',
  choose_count: 1,
  from_count: 3,
  choices: [
    { choiceId: 'c0', label: '①【シグニバリア】1つを得る',
      action: { type: 'STUB', id: 'GAIN_SIGNI_BARRIER' } },
    { choiceId: 'c1', label: '②デッキ上5枚から2枚を手札に',
      action: { type: 'STUB', id: 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM', revealPickParams: { pickCount: 2, restDest: 'deck_bottom', then: 'hand' } } },
    { choiceId: 'c2', label: '③次のアタックフェイズにプリオケへ能力付与（未実装）',
      action: { type: 'UNKNOWN', raw: '③次のあなたのアタックフェイズ開始時、プリオケのシグニにアタック時トラッシュ能力を付与（未実装）' } },
  ],
};

fs.writeFileSync(file, JSON.stringify(data), 'utf8');
console.log('done: WX26-CP1-001 FUTURE SESSION CHOOSE 再構築');
