// 要レビュー・キュー(261)を「真no-opバグ候補」の高シグナル順に選別する。
// 高シグナル＝原文に無条件の動作動詞があり、逆翻訳にSTUB露出が無く、条件語(場合/かぎり/ある場合)が無い
// のに盤面が動かない＝欠落no-opバグの最有力。
import { readFileSync } from 'fs';
import Papa from 'papaparse';

const cards = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  try { for (const r of Papa.parse(readFileSync('public/data/' + f, 'utf8'), { header: true }).data) if (r.CardNum) cards.set(r.CardNum, r); } catch {}
}
const eff = new Map();
for (const f of ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'])
  for (const [k,v] of Object.entries(JSON.parse(readFileSync('public/data/'+f,'utf8')))) eff.set(k,v);
// 逆翻訳
const dec = new Map();
for (let s=1;s<=10;s++){ try{ for(const line of readFileSync(`docs/decompile_sheet${s}.txt`,'utf8').split(/\r?\n/)){ const m=line.match(/^\s{2,}([A-Za-z0-9-]+-(?:E\d+|BURST|SONG|G|[A-Z]+)):\s*(.*)$/); if(m)dec.set(m[1],m[2]); } }catch{} }

const q = readFileSync('docs/_behavior_queue.txt','utf8').split(/\r?\n/).filter(l=>/^\S+\t\S+-/.test(l));
const VERB = /(バニッシュ|トラッシュに置|手札に加え|エナゾーンに置|エナチャージ|カードを[０-９\d一二三四五六七八九]+枚?引|ダウンする|凍結する|バウンス|手札に戻|デッキの一番下|場に出|回収|捨てさせ|奪|パワーを[＋+\-－])/;
const COND = /(場合|かぎり|ある限り|以上ある|以下である|３体|いるかぎり)/;

const rows = [];
for (const l of q) {
  const [card, effId] = l.split('\t');
  const c = cards.get(card);
  const text = (c?.EffectText||'') + (c?.BurstText&&c.BurstText!=='-'?' '+c.BurstText:'');
  const d = dec.get(effId) || '';
  const stubOut = /\[STUB:/.test(d) || /[A-Z]{4,}/.test(d.replace(/\b(LB|BURST|MAIN|ATTACK|AUTO)\b/g,''));
  const hasVerb = VERB.test(text);
  const hasCond = COND.test(text);
  // 逆翻訳が空(該当なし)＝CONTINUOUS等はスキップ
  const score = (hasVerb?2:0) + (!stubOut?1:0) + (!hasCond?1:0);
  rows.push({ card, effId, hasVerb, hasCond, stubOut, score, text: text.slice(0,72).replace(/\s+/g,' '), d: d.slice(0,60) });
}
// 高シグナル: verb && !stub && !cond
const hi = rows.filter(r=>r.hasVerb && !r.stubOut && !r.hasCond);
console.log(`# 高シグナル no-opバグ候補（動作動詞あり×STUB露出なし×条件なし×無変化）: ${hi.length} / ${rows.length}\n`);
for (const r of hi.slice(0,60)) console.log(`${r.card}\t${r.effId}\t原:${r.text}`);
console.log(`\n# （全${hi.length}件。残りは STUB未実装(${rows.filter(r=>r.stubOut).length}) / 条件ゲート(${rows.filter(r=>r.hasCond).length}) / 動詞なし(${rows.filter(r=>!r.hasVerb).length})）`);
