import { readFileSync, writeFileSync } from 'fs';
import { parseCardEffects } from './src/data/effectParser';
type Row = { num: string; name: string; field: string; seg: string; sentence: string; sentHasSelf: boolean; sentHasOpp: boolean };
const bare: Row[] = JSON.parse(readFileSync('tmp_lii_bare.json', 'utf8'));

function walk(a: any, acc: { type: string; owner: string }[]) {
  if (!a || typeof a !== 'object') return;
  for (const key of ['target', 'source']) {
    const t = a[key];
    if (t && t.type === 'SIGNI') acc.push({ type: a.type === 'STUB' ? `STUB:${a.id}` : a.type, owner: t.owner });
  }
  for (const v of Object.values(a)) {
    if (Array.isArray(v)) v.forEach(x => walk(x, acc));
    else if (v && typeof v === 'object') walk(v, acc);
  }
}
// 文だけを単独パースして、その句が生む owner を隔離して読む
function ownersOfSentence(sentence: string): { type: string; owner: string }[] {
  const body = sentence.replace(/^.*?[:：]/, '').trim() || sentence;
  const effs = parseCardEffects({ CardNum: 'TMP', CardName: 't', Type: 'シグニ', EffectText: `【出】：${body}。` } as never);
  const acc: { type: string; owner: string }[] = [];
  effs.forEach(e => walk(e.action, acc));
  return acc;
}

const FRONT = /正面/;
const rows = bare.map(r => {
  const owners = ownersOfSentence(r.sentence);
  const cls = FRONT.test(r.seg) || FRONT.test(r.sentence.slice(0, r.sentence.indexOf('対象とし'))) ? 'FP:正面'
    : r.sentHasOpp ? 'FP:同文opp語'
    : owners.length === 0 ? 'NO_TARGET'
    : owners.every(o => o.owner === 'opponent') ? 'OK:opponent'
    : owners.some(o => o.owner === 'any') ? 'OK:any'
    : 'SELF';
  return { ...r, owners, cls };
});
const byCls: Record<string, number> = {};
rows.forEach(r => byCls[r.cls] = (byCls[r.cls] || 0) + 1);
console.log(byCls);
console.log('\n--- SELF（真の候補）のアクション型分布 ---');
const t: Record<string, number> = {};
rows.filter(r => r.cls === 'SELF').forEach(r => r.owners.filter(o => o.owner === 'self').forEach(o => t[o.type] = (t[o.type] || 0) + 1));
Object.entries(t).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(String(v).padStart(3), k));
writeFileSync('tmp_lii_precise.json', JSON.stringify(rows), 'utf8');
