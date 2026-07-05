import { readFileSync, writeFileSync } from 'fs';
// VALUE timing flatten 修復・ライズクラスタ6効果。timing:ON_TURN_END → ON_RISE（新規配線・handleSummonSigni）。
// 「このシグニ/そのシグニ」＝ライズされたシグニ自身＝thisCardOnly。
const patch = {
  'effects_WX.json': {
    // 「このシグニがライズされたとき…そのシグニは「バニッシュされない」を得る」→ thisCardOnly・ターン終了時まで
    'WX16-037-E1': {effectId:'WX16-037-E1',effectType:'AUTO',timing:['ON_RISE'],action:{type:'GRANT_PROTECTION',target:{type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}},from:['BANISH'],sourceOwner:'opponent',duration:'UNTIL_END_OF_TURN'},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
    // 「このシグニがライズされたとき…そのシグニは【ダブルクラッシュ】」→ thisCardOnly
    'WX16-039-E1': {effectId:'WX16-039-E1',effectType:'AUTO',timing:['ON_RISE'],action:{type:'GRANT_KEYWORD',target:{type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}},keyword:'ダブルクラッシュ',duration:'UNTIL_END_OF_TURN'},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
    // 「このシグニがライズされたとき…あなたのすべてのシグニ+2000」→ self/ALL
    'WX17-054-E1': {effectId:'WX17-054-E1',effectType:'AUTO',timing:['ON_RISE'],action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'self',count:'ALL',filter:{cardType:'シグニ'}},delta:2000},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
    // 「このシグニがライズされたとき…そのシグニ+3000」→ thisCardOnly
    'WX20-056-E1': {effectId:'WX20-056-E1',effectType:'AUTO',timing:['ON_RISE'],action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}},delta:3000},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
    // 「このシグニが《オダノブ》を含むシグニにライズされたとき…そのシグニは「…」を得る」→ risedOntoNameContains:オダノブ（STUB維持）
    'WX20-056-E2': {effectId:'WX20-056-E2',effectType:'AUTO',timing:['ON_RISE'],triggerCondition:{risedOntoNameContains:'オダノブ'},action:{type:'STUB',id:'RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY'},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
  },
  'effects_misc.json': {
    // 「このシグニがライズされたとき…そのシグニ+3000」→ thisCardOnly
    'WD17-011-E1': {effectId:'WD17-011-E1',effectType:'AUTO',timing:['ON_RISE'],action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}},delta:3000},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
  },
};
for (const [fn, eff] of Object.entries(patch)) {
  const path = `public/data/${fn}`;
  const d = JSON.parse(readFileSync(path, 'utf-8'));
  for (const [effId, neweff] of Object.entries(eff)) {
    const card = effId.replace(/-E\d+.*$/, '');
    const i = d[card].findIndex(x => x.effectId === effId);
    if (i < 0) { console.log(`MISS ${effId}`); continue; }
    d[card][i] = neweff;
    console.log(`FIXED ${effId} -> ON_RISE`);
  }
  const out = JSON.stringify(d); JSON.parse(out); writeFileSync(path, out);
}
console.log('done');
