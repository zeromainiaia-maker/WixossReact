// WX24-P1-001 セイクリッド・フォース:「以下の3つから2つまで選ぶ」を CHOOSE で再構築。
// 旧JSONは選択肢③(REVEAL_PICK)のみで①ルリグバリア・②バウンスが欠落していた。
// （CHOOSE に「〜まで(up to)」フラグはないため choose_count:2 = 3択から2つで近似）
import fs from 'fs';

const file = 'public/data/effects_WX24_26.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const effs = data['WX24-P1-001'];
const e1 = effs.find(e => e.effectId === 'WX24-P1-001-E1');

e1.action = {
  type: 'CHOOSE',
  choose_count: 2,
  from_count: 3,
  choices: [
    { choiceId: 'c0', label: '①【ルリグバリア】1つを得る',
      action: { type: 'STUB', id: 'GAIN_LRIG_BARRIER' } },
    { choiceId: 'c1', label: '②対戦相手のシグニ1体を手札に戻す',
      action: { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } } },
    { choiceId: 'c2', label: '③デッキ上7枚から2枚を手札に',
      action: { type: 'STUB', id: 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM', revealPickParams: { pickCount: 2, restDest: 'deck_bottom', then: 'hand' } } },
  ],
};

fs.writeFileSync(file, JSON.stringify(data), 'utf8');
console.log('done: WX24-P1-001 セイクリッド・フォース CHOOSE 再構築');
