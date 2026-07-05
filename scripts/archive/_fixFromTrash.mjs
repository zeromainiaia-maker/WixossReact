import { readFileSync, writeFileSync } from 'fs';
// VALUE timing flatten・「トラッシュから場に出たとき」（placedFromTrash 機構）。ON_PLAY any_ally＋triggerCondition.placedFromTrash。
const FILES={WX:'effects_WX.json',WXDi:'effects_WXDi.json',misc:'effects_misc.json'};
const data={}; for(const[k,fn]of Object.entries(FILES))data[k]=JSON.parse(readFileSync(`public/data/${fn}`,'utf-8'));
const find=(file,effId)=>data[file][effId.replace(/-E\d+.*$/,'')].find(e=>e.effectId===effId);
const ops=[
  ['WX','WX03-020-E2', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerCondition={placedFromTrash:true};}], // 自全+2000
  ['WX','WX12-023-E2', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerCondition={placedFromTrash:true};}], // 相手-7000
  ['WX','WX14-018-E2', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerCondition={placedFromTrash:true};}], // 相手-5000
  ['WXDi','WXDi-P07-047-E2', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerCondition={placedFromTrash:true,turnOwner:'self'};}], // 自ターン・相手-3000
  ['WXDi','WXDi-P09-080-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerCondition={placedFromTrash:true};e.action.target={type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}};}], // このシグニ+4000
  ['misc','WDK06-C11-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={cardType:'シグニ',story:'武勇'};e.triggerCondition={placedFromTrash:true};e.action.target={type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false};}], // 武勇をtarget→triggerFilter
];
for(const[file,effId,fn]of ops){const e=find(file,effId);if(!e){console.log(`MISS ${effId}`);continue;}fn(e);e.parseStatus='MANUAL';console.log(`FIXED ${effId}`);}
for(const[k,fn]of Object.entries(FILES)){const out=JSON.stringify(data[k]);JSON.parse(out);writeFileSync(`public/data/${fn}`,out);}
console.log('done');
