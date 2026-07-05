import { readFileSync, writeFileSync } from 'fs';
// VALUE timing flatten・「場に出たとき」Group A（既存 collectFieldTriggers ON_PLAY any_ally/any_opp＋標準 triggerFilter で配線可）。
const FILES={WX:'effects_WX.json',WXDi:'effects_WXDi.json',WXK:'effects_WXK.json'};
const data={}; for(const[k,fn]of Object.entries(FILES))data[k]=JSON.parse(readFileSync(`public/data/${fn}`,'utf-8'));
const find=(file,effId)=>data[file][effId.replace(/-E\d+.*$/,'')].find(e=>e.effectId===effId);
const ops=[
  // レゾナが場に出たとき（any_ally＋cardType:レゾナ）
  ['WX','WX08-004-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={cardType:'レゾナ'};e.triggerCondition={turnOwner:'self'};}],
  ['WX','WX08-031-E2', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={cardType:'レゾナ'};}],
  ['WX','WXEX1-04-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={cardType:'レゾナ'};e.triggerCondition={turnOwner:'self'};}],
  // 他の＜アーム＞シグニが場に出たとき（any_ally＋story:アーム）
  ['WXDi','WXDi-P03-086-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={cardType:'シグニ',story:'アーム'};}],
  // レベルが偶数のあなたのシグニが場に出たとき（any_ally＋levelParity:even）
  ['WXK','WXK03-028-E2', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={cardType:'シグニ',levelParity:'even'};}],
  // 対戦相手のシグニが効果によって場に出たとき（any_opp＋byEffect）。そのシグニの能力を失わせる＝targetsTriggerSource。
  ['WX','WXEX2-29-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_opp';e.triggerCondition={byEffect:true};e.action={type:'REMOVE_ABILITIES',target:{type:'SIGNI',owner:'opponent',count:1},targetsTriggerSource:true,until:'UNTIL_END_OF_TURN'};}],
];
for(const[file,effId,fn]of ops){const e=find(file,effId);if(!e){console.log(`MISS ${effId}`);continue;}fn(e);e.parseStatus='MANUAL';console.log(`FIXED ${effId} -> ON_PLAY/${e.triggerScope}`);}
for(const[k,fn]of Object.entries(FILES)){const out=JSON.stringify(data[k]);JSON.parse(out);writeFileSync(`public/data/${fn}`,out);}
console.log('done');
