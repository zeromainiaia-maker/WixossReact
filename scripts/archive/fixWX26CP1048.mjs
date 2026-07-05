/**
 * fixWX26CP1048.mjs
 * WX26-CP1-048 プリンセス・ジール(テイクミーハイヤー) の実装誤りを修正。
 *  E1: 「すべてのシグニが＜プリオケ＞の場合、相手のパワー8000以下のシグニ1体をバニッシュ」が
 *      JSONでは「相手の＜プリオケ＞シグニ全部をバニッシュ」になっていた
 *      （全シグニ＝プリオケ条件は HAS_CARD_IN_FIELD で近似）
 *  E2: 「相手は【エナチャージ1】をしてもよい」が「自分が強制エナチャージ」になっていた。
 *      出現手段条件（プリオケの効果で場に出ていた場合）は実行時判定不能のため CHOOSE ゲート。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'public/data/effects_WX24_26.json');
const j = JSON.parse(fs.readFileSync(file, 'utf8'));

const efs = j['WX26-CP1-048'];

// E1
efs[0].action = {
  type: 'CONDITIONAL',
  condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: 'プリオケ' } },
  then: {
    type: 'BANISH',
    target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { max: 8000 } }, upToCount: false },
  },
};

// E2
efs[1].action = {
  type: 'CHOOSE',
  choose_count: 1,
  choices: [
    {
      choiceId: 'yes',
      label: '＜プリオケ＞のシグニの効果で場に出た（相手エナ1枚をトラッシュ）',
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } },
          // 「センタールリグと共通する色なら相手はエナチャージしてもよい」は
          // 相手側の任意判断が未対応のため、強制エナチャージで近似
          { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'opponent', count: 1 },
        ],
      },
    },
    { choiceId: 'no', label: '効果で出ていない（何もしない）', action: { type: 'SEQUENCE', steps: [] } },
  ],
};

fs.writeFileSync(file, JSON.stringify(j), 'utf8');
console.log('WX26-CP1-048 修正完了');
