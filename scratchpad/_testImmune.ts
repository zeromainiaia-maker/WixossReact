import fs from 'fs'; import { join } from 'path'; import Papa from 'papaparse';
import type { CardData, PlayerState } from '../src/types';
import type { CardEffect } from '../src/types/effects';
import { collectEffectImmuneSigni } from '../src/engine/effectEngine';
const root=process.cwd(); const cardMap=new Map<string,CardData>();
for(const f of [...Array.from({length:11},(_,i)=>`CardData_Sheet${i+1}.csv`),'CardData_TK.csv']){const p=join(root,'public/data',f);if(!fs.existsSync(p))continue;for(const r of Papa.parse<Record<string,string>>(fs.readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}).data){const id=r.CardNum?.trim();if(id&&!cardMap.has(id))cardMap.set(id,r as unknown as CardData);}}
const em=new Map<string,CardEffect[]>();
for(const f of ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'])for(const[k,v]of Object.entries(JSON.parse(fs.readFileSync(join(root,'public/data',f),'utf-8'))))em.set(k,v as CardEffect[]);
function mkState(sig:string):PlayerState{return{deck:[],lrig_deck:[],hand:[],life_cloth:[],trash:[],lrig_trash:[],energy:[],coins:3,bonds:[],field:{lrig:[],signi:[[sig],null,null],signi_traps:[null,null,null]}} as unknown as PlayerState;}
// アーツ源 / ルリグ源 で immune になるか
const tests: [string,string][] = [['WX08-017','アーツ'],['WX09-017','アーツ'],['WX12-018','アーツ'],['WX18-034','ルリグ'],['WXK08-038','ルリグ'],['WX15-031','スペル']];
for(const [id,src] of tests){
  const st=mkState(id); const o=mkState('WX01-001');
  const imm=collectEffectImmuneSigni(st,o,cardMap,em,false,src);
  console.log(id,'(source='+src+')  immune=',imm.has(id));
}
