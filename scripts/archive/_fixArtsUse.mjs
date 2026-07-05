import { readFileSync, writeFileSync } from 'fs';
// VALUE timing flatten 修復・アーツ使用クラスタ5枚。timing:ON_TURN_END → ON_ARTS_USE（新規配線・collectArtsUseTriggers）。
const patch = {
  'effects_WXK.json': {
    // 「あなたがアーツを使用したとき…あなたのすべての＜怪異＞シグニ+2000」→ self/ALL/怪異
    'WXK01-059-E2': {effectId:'WXK01-059-E2',effectType:'AUTO',timing:['ON_ARTS_USE'],action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'self',count:'ALL',filter:{cardType:'シグニ',story:'怪異'}},delta:2000},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
    // 「あなたがアーツを使用したとき、シグニ1体を対象とし+5000」→ any/1（無指定）
    'WXK05-042-E1': {effectId:'WXK05-042-E1',effectType:'AUTO',timing:['ON_ARTS_USE'],action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'any',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:5000},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
    // 「あなたがアーツを使用したとき、シグニ1体を対象とし+2000」→ any/1（usageLimit無）
    'WXK10-046-E1': {effectId:'WXK10-046-E1',effectType:'AUTO',timing:['ON_ARTS_USE'],action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'any',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:2000},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
  },
  'effects_misc.json': {
    // 「あなたがアーツを使用したとき…あなたのすべての＜怪異＞シグニに【ランサー】」→ self/ALL/怪異
    'WDK03-011-E1': {effectId:'WDK03-011-E1',effectType:'AUTO',timing:['ON_ARTS_USE'],action:{type:'GRANT_KEYWORD',target:{type:'SIGNI',owner:'self',count:'ALL',filter:{cardType:'シグニ',story:'怪異'}},keyword:'ランサー',duration:'UNTIL_END_OF_TURN'},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
    // 「あなたがアーツを使用したとき…このシグニに【ランサー】」→ self/1/thisCardOnly
    'WDK03-017-E1': {effectId:'WDK03-017-E1',effectType:'AUTO',timing:['ON_ARTS_USE'],action:{type:'GRANT_KEYWORD',target:{type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}},keyword:'ランサー',duration:'UNTIL_END_OF_TURN'},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
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
    console.log(`FIXED ${effId} -> ON_ARTS_USE`);
  }
  const out = JSON.stringify(d); JSON.parse(out); writeFileSync(path, out);
}
console.log('done');
