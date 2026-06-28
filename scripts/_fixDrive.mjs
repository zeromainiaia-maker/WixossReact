import { readFileSync, writeFileSync } from 'fs';
// VALUE timing flatten 修復・ドライブクラスタ3枚。timing:ON_TURN_END → ON_SIGNI_BECOMES_DRIVE。
// 収集は BattleScreen:5977 collectDriveBecameTriggers（field signi 走査・scope self/any_ally/any）。3枚とも乗機シグニ。
const patch = {
  'effects_WX.json': {
    // 「あなたのシグニ1体がドライブ状態になったとき、あなたの＜乗機＞シグニ1体に【アサシン】」→ any_ally・target story:乗機
    'WXEX1-37-E2': {effectId:'WXEX1-37-E2',effectType:'AUTO',timing:['ON_SIGNI_BECOMES_DRIVE'],triggerScope:'any_ally',action:{type:'GRANT_KEYWORD',target:{type:'SIGNI',owner:'self',count:1,filter:{cardType:'シグニ',story:'乗機'}},keyword:'アサシン',duration:'UNTIL_END_OF_TURN'},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
  },
  'effects_WXK.json': {
    // 「あなたのシグニ1体がドライブ状態になったとき、あなたのすべての＜乗機＞シグニ+2000」→ any_ally・count:ALL
    'WXK01-047-E2': {effectId:'WXK01-047-E2',effectType:'AUTO',timing:['ON_SIGNI_BECOMES_DRIVE'],triggerScope:'any_ally',action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'self',count:'ALL',filter:{cardType:'シグニ',story:'乗機'}},delta:2000},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
    // 「このシグニがドライブ状態になったとき、あなたの＜乗機＞シグニ1体に【ダブルクラッシュ】」→ self・target story:乗機
    'WXK03-061-E1': {effectId:'WXK03-061-E1',effectType:'AUTO',timing:['ON_SIGNI_BECOMES_DRIVE'],action:{type:'GRANT_KEYWORD',target:{type:'SIGNI',owner:'self',count:1,filter:{cardType:'シグニ',story:'乗機'}},keyword:'ダブルクラッシュ',duration:'UNTIL_END_OF_TURN'},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
  },
};
for (const [fn, eff] of Object.entries(patch)) {
  const path = `public/data/${fn}`;
  const d = JSON.parse(readFileSync(path, 'utf-8'));
  for (const [effId, neweff] of Object.entries(eff)) {
    const card = effId.replace(/-E\d+.*$/, '');
    const arr = d[card];
    const i = arr.findIndex(x => x.effectId === effId);
    if (i < 0) { console.log(`MISS ${effId}`); continue; }
    arr[i] = neweff;
    console.log(`FIXED ${effId} -> ON_SIGNI_BECOMES_DRIVE`);
  }
  const out = JSON.stringify(d); JSON.parse(out); writeFileSync(path, out);
}
console.log('done');
