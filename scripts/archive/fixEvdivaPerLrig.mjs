// WX25-P3-050 エビディバ!!!!!: 「場の色別ルリグ1体につき各効果」を専用 stub に再構築。
// 旧JSONは各色効果を1回ずつ無条件に並べた SEQUENCE で、ルリグ数スケールも色判定もなかった。
// EVDIVA_PER_LRIG_COLOR が白(ルリグバリア)/青(ドロー3)/緑(エナチャージ3)/黒(相手ミル10)を
// ルリグ色数ぶん実行する（赤=対象選択バニッシュは未実装ログ）。使用条件プレースホルダは保持。
import fs from 'fs';

const file = 'public/data/effects_WX24_26.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const e1 = data['WX25-P3-050'].find(e => e.effectId === 'WX25-P3-050-E1');
const useCondStep = e1.action.steps.find(s => s.type === 'GRANT_KEYWORD' && s.keyword === '使用条件');

e1.action = {
  type: 'SEQUENCE',
  steps: [
    ...(useCondStep ? [useCondStep] : []),
    { type: 'STUB', id: 'EVDIVA_PER_LRIG_COLOR' },
  ],
};

fs.writeFileSync(file, JSON.stringify(data), 'utf8');
console.log('done: WX25-P3-050 エビディバ EVDIVA_PER_LRIG_COLOR 再構築');
