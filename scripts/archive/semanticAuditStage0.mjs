/** 段0: clean群round1 findings の機械前処理（クラスタ化＋既知偽陽性/既消化系統の仕分け） */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DIR = 'scripts/archive/scratchpad/semantic_audit_clean_round1';
const F = readFileSync(join(DIR, 'findings.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

// live effects
const effFiles = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const byCard = new Map();
for (const f of effFiles) {
  const p = join('public/data', f);
  if (!existsSync(p)) continue;
  for (const [k, v] of Object.entries(JSON.parse(readFileSync(p, 'utf8')))) byCard.set(k, v);
}
const effJson = new Map();
for (const [num, arr] of byCard) for (const e of arr ?? []) if (e.effectId) effJson.set(e.effectId, e);

const GATED = new Set(['BANISH','BOUNCE','DOWN','FREEZE','TRANSFER_TO_DECK','TRANSFER_TO_HAND','SEND_TO_ENERGY','LIFE_CRASH','EXILE','TRASH']);
const OPT_STUB = new Set(['OPTIONAL_COST','TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST','OPTIONAL_TRASH_ENERGY_CLASS']);
function walkImt(n, out) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach((x) => walkImt(x, out)); return; }
  if (n.type === 'SEQUENCE' && Array.isArray(n.steps)) {
    for (let i = 0; i < n.steps.length; i++) {
      const s = n.steps[i];
      if (s?.type === 'CONDITIONAL' && s.condition?.type === 'IS_MY_TURN') {
        const p = i > 0 ? n.steps[i - 1] : null;
        // ⚠engine の did-it ゲートは else 無し CONDITIONAL を**アンラップ**して then を gateStep にする
        //   （effectExecutor.ts:4832 タスク12(lxiii)）。ここを再現しないと偽陽性を取りこぼす。
        out.push(p && p.type === 'CONDITIONAL' && !p.else ? p.then : p);
      }
    }
  }
  for (const v of Object.values(n)) walkImt(v, out);
}
/** engine の did-it ゲート（effectExecutor.ts:3804 DID_IT_GATED_TYPES / :4866）で完全に覆われているか */
const allDidItGated = (e) => {
  const out = []; walkImt(e?.action, out);
  if (!out.length) return false;
  return out.every((p) => p && ((p.type === 'STUB' && OPT_STUB.has(p.id)) || GATED.has(p.type)));
};

const strOf = (f) => {
  const e = effJson.get(f.effectId) ?? (byCard.get(f.cardNum) ? { all: byCard.get(f.cardNum) } : null);
  return e ? JSON.stringify(e) : '';
};

// --- 仕分け ---
const tag = new Map(); // finding -> tag
for (const f of F) {
  const s = strOf(f);
  const c = f.claim, q = f.quote ?? '';
  let t = 'OPEN';
  if (/INSTANT/.test(c)) {
    // 既知偽陽性ファミリ: duration未設定の POWER_MODIFY は engine が temp_power_mods に入れる
    t = /パワー|POWER/.test(c) ? 'FP_DURATION_POWER' : 'REVIEW_DURATION_OTHER';
  } else if (/そうした場合|この方法で|この効果で/.test(q) && /lastProcessed|LAST_PROCESSED/i.test(s)) {
    t = 'STALE_C_SOUSHITA';
  } else if ((/ターン/.test(c) || /そうした場合|この方法で|この効果で|してもよい/.test(q + c))
             && effJson.get(f.effectId) && allDidItGated(effJson.get(f.effectId))) {
    // 「そうした場合」の慣例エンコード CONDITIONAL{IS_MY_TURN} は engine の did-it ゲートが空振りを止める
    // （effectParser.ts:1661 §9-9 / effectExecutor.ts:4859 タスク12(xxix)③）。LLM は常時真と誤読する。
    t = 'FP_DIDIT_GATE';
  } else if (/upTo|まで/.test(q + c) && /"upToCount":true/.test(s)) {
    t = 'STALE_UPTO';
  }
  tag.set(f, t);
}

const norm = (q) => (q ?? '').replace(/[「」『』]/g, '').replace(/\s+/g, '').trim();

const open = F.filter((f) => tag.get(f) === 'OPEN');
const clusters = new Map();
for (const f of open) {
  const k = norm(f.quote);
  if (!k) continue;
  if (!clusters.has(k)) clusters.set(k, []);
  clusters.get(k).push(f);
}
const sorted = [...clusters.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
const multi = sorted.filter(([, v]) => v.length >= 2);
const single = sorted.filter(([, v]) => v.length === 1);

// --- 出力 ---
const counts = {};
for (const t of tag.values()) counts[t] = (counts[t] ?? 0) + 1;
const sev = (arr) => { const s = { HIGH: 0, MED: 0, LOW: 0 }; for (const f of arr) s[f.severity]++; return s; };

let out = '';
out += '=== 段0 機械前処理サマリ（clean群 round1 / 全1444件）===\n';
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) out += `  ${k.padEnd(24)} ${String(v).padStart(5)}件\n`;
out += `\nOPEN ${open.length}件 = クラスタ(2件以上) ${multi.length}個/${multi.reduce((a, [, v]) => a + v.length, 0)}件 + 単発 ${single.length}件\n`;
out += `OPEN severity: ${JSON.stringify(sev(open))}\n`;
out += `OPEN カード数: ${new Set(open.map((f) => f.cardNum)).size}\n\n`;

const fmt = (list, title) => {
  let s = `\n=== ${title} ===\n\n`;
  let i = 0;
  for (const [k, v] of list) {
    i++;
    const cards = [...new Set(v.map((f) => f.cardNum))];
    const types = [...new Set(v.map((f) => f.type))].join(',');
    const sv = sev(v);
    s += `#C${String(i).padStart(3, '0')} [${v.length}件 H${sv.HIGH}/M${sv.MED}/L${sv.LOW}] 「${k}」  type: ${types}\n`;
    s += `  cards(${cards.length}): ${cards.slice(0, 12).join(', ')}${cards.length > 12 ? ' …' : ''}\n`;
    const ex = [...new Set(v.map((f) => f.claim))].slice(0, 2);
    for (const e of ex) s += `  claim例: ${e}\n`;
    s += '\n';
  }
  return s;
};
out += fmt(multi, `quote完全一致クラスタ（OPEN・2件以上）＝${multi.length}個`);

writeFileSync(join(DIR, 'clusters_stage0.txt'), out, 'utf8');
writeFileSync(join(DIR, 'clusters_stage0.json'), JSON.stringify({
  counts,
  open: open.length,
  clusters: multi.map(([k, v], i) => ({
    id: `C${String(i + 1).padStart(3, '0')}`, quote: k, n: v.length,
    sev: sev(v), types: [...new Set(v.map((f) => f.type))],
    cards: [...new Set(v.map((f) => f.cardNum))],
    findings: v.map((f) => ({ cardNum: f.cardNum, effectId: f.effectId, severity: f.severity, type: f.type, claim: f.claim })),
  })),
  singles: single.map(([k, v]) => ({ quote: k, ...v[0] })),
  excluded: Object.fromEntries(['FP_DURATION_POWER', 'FP_DIDIT_GATE', 'REVIEW_DURATION_OTHER', 'STALE_C_SOUSHITA', 'STALE_UPTO'].map((t) => [t, F.filter((f) => tag.get(f) === t).map((f) => ({ cardNum: f.cardNum, effectId: f.effectId, severity: f.severity, quote: f.quote, claim: f.claim }))])),
}, null, 1), 'utf8');

console.log(out.slice(0, 4000));
