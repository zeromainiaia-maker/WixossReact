// PR-Di035 OPEN DREAM LAND!: 色条件分岐を専用 stub に再構築。
// 旧JSONはトラッシュ回収後、全色の効果(barrier/life/banish/mill...)を無条件にフラット実行する
// 壊れた SEQUENCE だった。即時の TRANSFER_TO_HAND は残し、その後の色分岐を
// PRDI035_PARADISE_COLOR stub に置換する（遅延タイミングと赤バニッシュは近似/未実装）。
import fs from 'fs';

const file = 'public/data/effects_misc.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const e1 = data['PR-Di035'].find(e => e.effectId === 'PR-Di035-E1');
const transferStep = e1.action.steps.find(s => s.type === 'TRANSFER_TO_HAND');

e1.action = {
  type: 'SEQUENCE',
  steps: [
    ...(transferStep ? [transferStep] : []),
    { type: 'STUB', id: 'PRDI035_PARADISE_COLOR' },
  ],
};

fs.writeFileSync(file, JSON.stringify(data), 'utf8');
console.log('done: PR-Di035 OPEN DREAM LAND! 色分岐 stub 再構築');
