import fs from 'fs';
const bare = JSON.parse(fs.readFileSync('tmp_lii_bare.json','utf8'));
const precise = JSON.parse(fs.readFileSync('tmp_lii_precise.json','utf8'));
const changed = new Set(JSON.parse(fs.readFileSync('tmp_lii_changed.json','utf8')));
const files = fs.readdirSync('public/data').filter(f=>f.startsWith('effects_'));
const cur = {}; for (const f of files) Object.assign(cur, JSON.parse(fs.readFileSync('public/data/'+f,'utf8')));
const ownersOf = (c) => { const acc=[]; const walk=a=>{ if(!a||typeof a!=='object')return;
  for(const k of ['target','source']){ const t=a[k]; if(t&&t.type==='SIGNI') acc.push(`${a.type}{${t.owner}}`); }
  for(const v of Object.values(a)){ if(Array.isArray(v)) v.forEach(walk); else if(v&&typeof v==='object') walk(v); } };
  (cur[c]??[]).forEach(e=>walk(e.action)); return acc; };

const L = [];
L.push('# タスク12(lii) 修飾語なし「シグニN体を対象とし」＝owner:any 全数機械分類（2026-07-28 消化時点）');
L.push('# 生成: scripts/archive/bare_signi_owner_scan/ （tmp_lii_scan2.mjs → tmp_lii_precise.mts → 本レポート）');
L.push('#');
L.push('# 抽出条件＝対象句「シグニ(を)N体(まで)(を)対象とし」の**直前セグメント**（。、「」『』（）：区切り）に');
L.push('#   対戦相手／あなた／自分 が無いもの＝原文が所有者を限定していない対象。');
L.push('# 母集団: 対象句 3670 → OPP 3093 / SELF 474 / BARE 101（91カード）');
L.push('');
const byCls = {};
precise.forEach(r => (byCls[r.cls] = (byCls[r.cls]||0)+1));
L.push('## BARE 101句の内訳（単独パースで実際に生成される owner を隔離して判定）');
for (const [k,v] of Object.entries(byCls).sort((a,b)=>b[1]-a[1])) {
  const note = { 'FP:正面': '偽陽性＝「正面の」は専用機構 filter.frontOfSelf の領分（別タスク）',
    'FP:同文opp語': '偽陽性＝「対戦相手の、」が読点で分断されただけ',
    'NO_TARGET': '対象句がその文単独では SIGNI ターゲットを生まない（他規則が処理）',
    'OK:opponent': '既に opponent＝実害なし', 'OK:any': '既に any＝parser は正しい（engine 側の片側潰しは本タスクで解消）',
    'SELF': '★真の候補＝owner:self に落ちていた' }[k] ?? '';
  L.push(`  ${String(v).padStart(3)} ${k.padEnd(16)} ${note}`);
}
L.push('');
L.push('## 消化結果（parser 変更で self→any になったカード 27枚。構造差分ゼロ＝owner のみ）');
for (const c of [...changed].sort()) {
  const r = bare.find(x => x.num === c);
  L.push(`  ${c.padEnd(13)} ${ownersOf(c).join(',') || '-'}`);
  L.push(`      ${(r?.sentence ?? '(?)').slice(0,120)}`);
}
L.push('');
L.push('## 据置（本タスクの対象外・理由つき）');
L.push('  WX21-015 / WXK07-028  「＜空獣＞のシグニ1体を対象とし、それは『【常】：バニッシュされない』を得る」');
L.push('      ＝引用能力付与の別系統。GRANT_PROTECTION 規則の既定値 self は「このシグニは**対戦相手の効果によって**');
L.push('        バニッシュされない」形（26枚）の自己保護であり、helper に委ねると自己保護が相手への付与に反転する。');
L.push('  WX16-Re02 / WD17-009  curated が既に手修正で opponent＝実害なし（忠実には any だが機能差はほぼ無い）。');
L.push('  WX19-029              「アップするかダウンする」の2択が DOWN 単体に潰れる別バグ（owner とは独立）。');
L.push('  WX20-026-BURST        CENTER_LRIG_OR_SIGNI のルリグ選択肢が engine に無い（owner は any へ手修正済み）。');
fs.writeFileSync('docs/_bare_signi_triage.txt', L.join('\n'), 'utf8');
console.log('written', L.length, 'lines');
