import { readFileSync, writeFileSync } from 'fs';
const fn='public/data/effects_WXK.json';
const data=JSON.parse(readFileSync(fn,'utf-8'));
const arr=data['WXK10-022'];
const i=arr.findIndex((e:any)=>e.effectId==='WXK10-022-E1');
arr[i]={
  effectId:'WXK10-022-E1',
  effectType:'AUTO',
  timing:['ON_PLAY'],
  triggerScope:'any_opp',
  triggerCondition:{turnOwner:'self'},
  action:{type:'REMOVE_ABILITIES',target:{type:'SIGNI',owner:'opponent',count:1},targetsTriggerSource:true,until:'UNTIL_END_OF_TURN'},
  duration:'UNTIL_END_OF_TURN',
  mandatory:true,
  parseStatus:'MANUAL',
};
const out=JSON.stringify(data); JSON.parse(out); writeFileSync(fn,out);
console.log('fixed E1:', JSON.stringify(arr[i]));
