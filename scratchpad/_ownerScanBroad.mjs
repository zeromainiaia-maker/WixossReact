// owner取り違えの広域スキャン（deck以外のゾーンにも一般化）。
// 原文が「対戦相手の<ゾーン>」なのに action owner:'self'（またはその逆）を検出。
import { readFileSync } from 'fs';
import Papa from 'papaparse';
const cards = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => 'CardData_Sheet' + (i + 1) + '.csv'), 'CardData_TK.csv']) {
  try { for (const r of Papa.parse(readFileSync('public/data/' + f, 'utf8'), { header: true }).data) if (r.CardNum) cards.set(r.CardNum, r); } catch {}
}
const m = new Map();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'])
  for (const [k, v] of Object.entries(JSON.parse(readFileSync('public/data/' + f, 'utf8')))) m.set(k, v);
function* walk(o) { if (!o || typeof o !== 'object') return; yield o; for (const v of Object.values(o)) if (v && typeof v === 'object') yield* walk(v); }

// ゾーン別: action の target.type と 原文キーワード
const ZONE = {
  ENERGY_CARD: 'エナ', HAND_CARD: '手札', TRASH_CARD: 'トラッシュ',
};
// 「相手の<ゾーン>」「あなた/自分の<ゾーン>」を原文で判定
const hits = { oppButSelf: [], selfButOpp: [] };
for (const [num, effs] of m) {
  const c = cards.get(num); const text = (c?.EffectText || '') + (c?.BurstText || '');
  for (const e of effs) for (const node of walk(e)) {
    // TRASH/BANISH/SEND_TO_ENERGY 等、owner付き target を持つ action
    const t = node.target;
    if (!t || typeof t.owner !== 'string' || !ZONE[t.type]) continue;
    const z = ZONE[t.type];
    // 原文にそのゾーンに対する明示 owner があるか（近傍語で判定）
    const oppRe = new RegExp(`対戦相手の(?:[^。]{0,6})?${z}`);
    const selfRe = new RegExp(`(?:あなた|自分)の(?:[^。]{0,6})?${z}`);
    const oppInText = oppRe.test(text);
    const selfInText = selfRe.test(text);
    // owner:self なのに原文は「相手の<zone>」だけ（自分の<zone>言及なし）
    if (t.owner === 'self' && oppInText && !selfInText) hits.oppButSelf.push(`${num} ${e.effectId} [${node.type}/${t.type}]`);
    // owner:opponent なのに原文は「自分の<zone>」だけ
    if (t.owner === 'opponent' && selfInText && !oppInText) hits.selfButOpp.push(`${num} ${e.effectId} [${node.type}/${t.type}]`);
  }
}
console.log('=== owner:self だが原文「対戦相手の<zone>」のみ（相手を触るべき）===', hits.oppButSelf.length);
hits.oppButSelf.forEach(h => console.log('  ' + h));
console.log('\n=== owner:opponent だが原文「あなたの<zone>」のみ（自分を触るべき）===', hits.selfButOpp.length);
hits.selfButOpp.forEach(h => console.log('  ' + h));
