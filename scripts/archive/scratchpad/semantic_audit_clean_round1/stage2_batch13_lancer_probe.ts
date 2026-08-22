import { readFileSync } from 'fs';
import Papa from 'papaparse';
import type { CardData, PlayerState } from './src/types';
import { parseCardEffects } from './src/data/effectParser';
import { getSigniAttackKeywordState } from './src/screens/battle/signiAttackKeywords';

const cardMap = new Map<string, CardData>();
for (let i = 1; i <= 11; i++) {
  let txt: string; try { txt = readFileSync(`public/data/CardData_Sheet${i}.csv`, 'utf8'); } catch { break; }
  for (const r of Papa.parse<Record<string,string>>(txt.replace(/^﻿/,''), {header:true,skipEmptyLines:true}).data) {
    if (!r.CardNum) continue;
    const c = { ...r } as unknown as CardData;
    c.effects = parseCardEffects(c);
    cardMap.set(r.CardNum, c);
  }
}
const mk = (signi: (string|null)[]): PlayerState => ({
  deck: [], hand: [], trash: [], energy: [], life_cloth: [], lrig_trash: [], check_zone: [],
  field: { lrig: [], signi: signi.map(s => s ? [s] : null) as any, signi_charms: [null,null,null] },
} as unknown as PlayerState);

// 印字 or 付与で「ランサー」を持ちうる全シグニについて isLancer と lancerKeywords の整合を見る
let checked = 0, mismatch = 0;
const bad: string[] = [];
for (const [num, card] of cardMap) {
  if (card.Type !== 'シグニ') continue;
  const txt = `${card.EffectText ?? ''}${card.BurstText ?? ''}`;
  if (!/ランサー/.test(txt)) continue;
  const atk = mk([num, null, null]);
  const def = mk(['WX24-D4-15', null, null]);
  const st = getSigniAttackKeywordState(num, atk, def, cardMap, new Map());
  checked++;
  if (st.isLancer && st.lancerKeywords.length === 0) { mismatch++; if (bad.length < 20) bad.push(num); }
}
console.log(`印字ランサー候補 ${checked} 枚を検査 / isLancer=true なのに lancerKeywords が空: ${mismatch}`);
if (bad.length) console.log(bad.join(' '));

// 付与経路（keyword_grants）でも同じ整合を確認
const anySigni = [...cardMap.keys()].find(n => cardMap.get(n)!.Type === 'シグニ')!;
for (const kw of ['ランサー', 'ランサー:{"powerLte":5000}', 'ランサー:5000']) {
  const atk = { ...mk([anySigni, null, null]), keyword_grants: { [anySigni]: [kw] } } as PlayerState;
  const st = getSigniAttackKeywordState(anySigni, atk, mk([null,null,null]), cardMap, new Map());
  console.log(`grant=${kw.padEnd(30)} isLancer=${st.isLancer} lancerKeywords=${JSON.stringify(st.lancerKeywords)}`);
}
