/**
 * applyDynamicFilters.mjs
 * fixRemaining10Mandatory.mjs で近似実装にしていた動的参照を正式対応に置き換える。
 *
 *  - WX11-035 極鎚ミョルニル: 手札フィルタに levelBelowLeftCard
 *    （「そのシグニより低いレベルを持つシグニ」）
 *  - WX14-009 炎・花代・伍: 手札フィルタに levelBelowLeftCard
 *    （「そのシグニより低いレベルを持つ《フレイスロ》シグニ」）
 *  - WX17-055 混成の怪物フンババ: トラッシュフィルタに underLeftCard
 *    （「このシグニの下にあった《ライズアイコン》を持たないシグニ」）
 *
 * マーカーは BattleScreen の resolveLeaveFieldDynamicFilters がトリガー収集時に
 * 具体値（level:{max:N-1} / cardNames:[...]）へ解決する。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'));
const save = (f, j) => fs.writeFileSync(path.join(root, 'public/data', f), JSON.stringify(j), 'utf8');

const j = load('effects_WX.json');

// WX11-035 ミョルニル: 手札から「離れたシグニより低いレベル」のシグニ
{
  const filter = j['WX11-035'][0].action.source.filter;
  filter.levelBelowLeftCard = true;
  console.log('[OK] WX11-035:', JSON.stringify(j['WX11-035'][0].action.source));
}

// WX14-009 花代・伍 E2: 手札から「離れたシグニより低いレベル」のフレイスロシグニ
{
  const filter = j['WX14-009'][1].action.source.filter;
  filter.levelBelowLeftCard = true;
  console.log('[OK] WX14-009:', JSON.stringify(j['WX14-009'][1].action.source));
}

// WX17-055 フンババ: トラッシュから「このシグニの下にあった」非ライズシグニ
{
  const addStep = j['WX17-055'][0].action.steps.find(s => s.type === 'ADD_TO_FIELD');
  addStep.source.filter.underLeftCard = true;
  console.log('[OK] WX17-055:', JSON.stringify(addStep.source));
}

save('effects_WX.json', j);
console.log('=== 完了 ===');
