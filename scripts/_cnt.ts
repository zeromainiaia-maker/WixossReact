import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const pats:[string,RegExp][]=[
  ['ルリグ下移動', /ルリグ[^。]{0,8}下からカード[^。]{0,6}移動したとき/],
  ['相手アーツ効果受け', /対戦相手のアーツの効果を受けたとき/],
  ['デッキシャッフル', /デッキがシャッフルされたとき/],
  ['ルリグアタックステップ開始', /ルリグアタックステップ開始時/],
  ['改造素材使用', /《改造素材》が使用されたとき|《改造素材》[０-９\d]*枚?を?使用したとき/],
  ['キーワード取得', /(【アサシン】|【ランサー】|【ダブルクラッシュ】)[^。]{0,30}を得たとき/],
  ['コイン支払', /《コイン[^》]*》を[^。]{0,6}支払ったとき/],
  ['ウェポン効果バニッシュ', /効果によって対戦相手のシグニ[^。]{0,4}をバニッシュしたとき/],
];
for(const [name,re] of pats){ const hits=rows.filter(r=>re.test(r.EffectText??'')).map(r=>r.CardNum); console.log(`${hits.length}\t${name}\t${hits.join(', ')}`); }
