// 要レビュー・キュー(docs/_behavior_queue.txt)の残を「action型＋対象/条件」で分類し、
// 段階2c で埋めるべき空振り要因を特定する。
import { readFileSync } from 'fs';
const eff = new Map();
for (const f of ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'])
  for (const [k,v] of Object.entries(JSON.parse(readFileSync('public/data/'+f,'utf8')))) eff.set(k,v);

const lines = readFileSync('docs/_behavior_queue.txt','utf8').split(/\r?\n/).filter(l => /^\S+\t\S+-/.test(l));
const byId = new Map();
for (const l of lines) { const [card, effId] = l.split('\t'); byId.set(effId, card); }

function firstAction(effObj) { return effObj?.action; }
function* walk(o){ if(!o||typeof o!=='object')return; yield o; for(const v of Object.values(o)) if(v&&typeof v==='object') yield* walk(v); }

const actionTypeTally = new Map();
const reasonTally = new Map();
const cond = (o)=>{ // 条件系の存在
  return !!(o.condition || o.activeCondition || o.triggerCondition);
};
for (const [effId, card] of byId) {
  const effs = eff.get(card) || [];
  const e = effs.find(x => x.effectId === effId);
  if (!e) { reasonTally.set('(no eff)', (reasonTally.get('(no eff)')||0)+1); continue; }
  const a = firstAction(e);
  const at = a?.type ?? '(none)';
  actionTypeTally.set(at, (actionTypeTally.get(at)||0)+1);
  // reason 推定
  let reason = 'other';
  const hasCond = cond(e) || [...walk(e)].some(n => n.condition);
  const targets = [...walk(e)].filter(n => n.target?.type).map(n=>n.target);
  const sources = [...walk(e)].filter(n => n.source?.type).map(n=>n.source);
  const tt = [...targets, ...sources];
  if (at === 'STUB' || [...walk(e)].some(n=>n.type==='STUB')) reason = 'STUB(未実装/no-op)';
  else if (hasCond) reason = '条件ゲート(場合/かぎり)';
  else if (tt.some(t => t.filter?.colorMatchesLrig || t.filter?.colorNotMatchesLrig)) reason = 'colorMatchesLrig';
  else if (tt.some(t => t.type === 'ENERGY_CARD')) reason = 'ENERGY_CARD対象';
  else if (tt.some(t => t.type === 'LRIG' || t.type==='CENTER_LRIG_OR_SIGNI')) reason = 'LRIG対象';
  else if (tt.some(t => t.type === 'SPELL' || t.type==='SPELL_CARD')) reason = 'SPELL対象';
  else if (at==='GRANT_KEYWORD'||at==='GRANT_ABILITY'||/GRANT/.test(at)) reason = '付与(差分見えず?)';
  else if (/BLOCK|LIMIT|PREVENT|RESTRICT/.test(at)) reason = '制限/防止(差分見えず?)';
  reasonTally.set(reason, (reasonTally.get(reason)||0)+1);
}
const show = (m,t)=>{ console.log(`\n=== ${t} ===`); [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([k,v])=>console.log(String(v).padStart(4),k)); };
show(reasonTally, `残${byId.size}の空振り要因（推定）`);
show(actionTypeTally, 'トップaction型');
