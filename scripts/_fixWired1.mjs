import { readFileSync, writeFileSync } from 'fs';
// VALUE timing flatten 修復・配線済みクラスタ（ON_EXCEED_COST/ON_ACCE/ON_ACCE_ATTACH/ON_HAND_DISCARDED）9枚。
// 多くは timing 差し替えのみ。action は維持し、明確な誤りのみ surgical 是正。
const FILES = {WX:'effects_WX.json',WXDi:'effects_WXDi.json',WX24_26:'effects_WX24_26.json',WXK:'effects_WXK.json',misc:'effects_misc.json'};
const data={}; for(const [k,fn] of Object.entries(FILES)) data[k]=JSON.parse(readFileSync(`public/data/${fn}`,'utf-8'));
const findEff=(file,effId)=>{const card=effId.replace(/-E\d+.*$/,'');return data[file][card].find(e=>e.effectId===effId);};
// [file, effId, mutator]
const ops=[
  // ON_EXCEED_COST（このカードがエクシードコストとしてルリグトラッシュに置かれたとき）
  ['WX','WX11-014-E1', e=>{e.timing=['ON_EXCEED_COST'];}],
  ['WXDi','WXDi-P04-025-E2', e=>{e.timing=['ON_EXCEED_COST'];}],
  // ON_ACCE_ATTACH（ルリグ）/ON_ACCE（シグニ）：あなたのシグニにアクセが付いたとき
  ['WXK','WXK04-003-E1', e=>{e.timing=['ON_ACCE_ATTACH'];}], // ルリグ
  ['WXK','WXK05-064-E1', e=>{e.timing=['ON_ACCE'];}],        // シグニ
  // ON_HAND_DISCARDED（手札を捨てたとき）
  ['WXDi','WXDi-P10-058-E1', e=>{e.timing=['ON_HAND_DISCARDED'];e.triggerFilter={story:'プリパラ'};e.action.target={type:'SIGNI',owner:'self',count:1,filter:{cardType:'シグニ',story:'プリパラ'}};}], // 自プリパラ1体+2000
  ['WX24_26','WX24-P1-059-E1', e=>{e.timing=['ON_HAND_DISCARDED'];e.action.target={type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}};}], // このシグニ+4000
  ['WX24_26','WX24-P1-084-E1', e=>{e.timing=['ON_HAND_DISCARDED'];e.triggerFilter={story:'宝石'};e.action.target={type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false};}], // 宝石をtarget→triggerFilterへ
  ['WXK','WXK01-082-E1', e=>{e.timing=['ON_HAND_DISCARDED'];}], // 相手-4000・ターン2回
  ['WXK','WXK11-054-E1', e=>{e.timing=['ON_HAND_DISCARDED'];e.action.target={type:'SIGNI',owner:'self',count:'ALL',filter:{cardType:'シグニ',color:'赤'}};}], // 自全赤+2000
];
for(const [file,effId,fn] of ops){
  const e=findEff(file,effId);
  if(!e){console.log(`MISS ${effId}`);continue;}
  fn(e); e.parseStatus='MANUAL';
  console.log(`FIXED ${effId} -> ${e.timing.join(',')}`);
}
for(const [k,fn] of Object.entries(FILES)){const out=JSON.stringify(data[k]);JSON.parse(out);writeFileSync(`public/data/${fn}`,out);}
console.log('done');
