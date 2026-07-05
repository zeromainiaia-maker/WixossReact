import fs from 'fs'; import { join } from 'path'; import Papa from 'papaparse';
import type { CardData, PlayerState } from '../src/types';
import { executeEffect, resumeSelectTarget, type ExecCtx, type ExecResult } from '../src/engine/effectExecutor';
const root=process.cwd(); const cardMap=new Map<string,CardData>();
for(const f of [...Array.from({length:11},(_,i)=>`CardData_Sheet${i+1}.csv`),'CardData_TK.csv']){const p=join(root,'public/data',f);if(!fs.existsSync(p))continue;for(const r of Papa.parse<Record<string,string>>(fs.readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}).data){const id=r.CardNum?.trim();if(id&&!cardMap.has(id))cardMap.set(id,r as unknown as CardData);}}
const pool=[...cardMap.values()].filter(c=>c.Type==='シグニ'&&+(c.Power||'0')>0).map(c=>c.CardNum);
const mk=(sig:string[]):PlayerState=>({deck:pool.slice(0,20),lrig_deck:[],hand:pool.slice(20,25),life_cloth:pool.slice(25,32),trash:pool.slice(32,35),lrig_trash:[],energy:sig,coins:3,bonds:[],field:{lrig:[],signi:[null,null,null],signi_traps:[null,null,null]}} as unknown as PlayerState);
const ctx={ownerState:mk(pool.slice(40,45)),otherState:mk(pool.slice(50,55)),cardMap,logs:[],sourceCardNum:pool[0],triggeringCardNum:pool[0],currentPhase:'MAIN'} as unknown as ExecCtx;
console.log('相手エナ before:', ctx.otherState.energy.length);
let r:ExecResult=executeEffect({effectId:'t',effectType:'AUTO',action:{type:'TRASH',target:{type:'ENERGY_CARD',owner:'opponent',count:1}},duration:'INSTANT',mandatory:true} as never, ctx);
let steps=0;
while(!r.done){steps++;if(steps>20)break;const p=(r as {pending:{type:string;[k:string]:unknown}}).pending;console.log('  pending:',p.type,'candidates=',JSON.stringify((p as Record<string,unknown>).candidates));const c={...ctx,ownerState:r.ownerState,otherState:r.otherState,logs:r.logs};if(p.type==='SELECT_TARGET'){const cands=(p as Record<string,unknown>).candidates as string[]||[];r=resumeSelectTarget(cands.slice(0,1),p as never,c);}else{console.log('  UNHANDLED pending',p.type);break;}}
console.log('相手エナ after:', r.otherState.energy.length,' logs:', r.logs.join('|'));
