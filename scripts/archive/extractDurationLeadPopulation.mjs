// Opus タスク(A) 母集団抽出（精密版）：durational付与の先頭/文中「ターン終了時まで」で action内 duration が
// 落ち decompile の期間注記（（ターン終了時まで））が脱落するカードを機械抽出する。
//
// 精密化＝2条件の AND：
//  (1) 症状：decompile_sheet の 原文 count("ターン終了時まで") > 逆翻訳 count（現行 curated JSON で実際に脱落）
//  (2) 原因：その効果の action（再帰）に「action内 duration/until を持つ付与系型」があり、その値が
//      end-of-turn ではない（＝落ちている）。対象型＝GRANT_KEYWORD/GRANT_EFFECT/REMOVE_ABILITIES/
//      SET_BASE_LEVEL/LRIG_LIMIT_MODIFY（decompiler が action内 duration/until で「ターン終了時まで」を描画する型）。
//  POWER_MODIFY 等は duration を効果レベル or temp_mods 既定で持ち action内注記を描画しないため対象外（別カテゴリ・低優先）。
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/zerom/source/WixossReact';
const DOCS = path.join(ROOT, 'docs');
const PHRASE = 'ターン終了時まで';
const countOcc = (s) => s.split(PHRASE).length - 1;

// --- 1. decompile_sheet から 原文/逆翻訳 を取得（症状カウント用） ---
const blocks = new Map(); // cardId -> {origText, jsonText}
for (let i = 1; i <= 10; i++) {
  const raw = fs.readFileSync(path.join(DOCS, `decompile_sheet${i}.txt`), 'utf8');
  for (const part of raw.split(/^={20,}\s*$/m)) {
    const lines = part.split('\n');
    let idx = 0; while (idx < lines.length && lines[idx].trim() === '') idx++;
    const m = lines[idx]?.match(/^([A-Z0-9][A-Za-z0-9-]*)\s{2,}/);
    if (!m) continue;
    const origMk = part.indexOf('【原文 EffectText】');
    const jsonMk = part.indexOf('【JSON 逆翻訳】');
    if (origMk < 0 || jsonMk < 0) continue;
    blocks.set(m[1], { origText: part.slice(origMk, jsonMk), jsonText: part.slice(jsonMk) });
  }
}

// --- 2. effects JSON をロード（cardId -> effect[]） ---
const EFF_FILES = ['effects_misc.json','effects_WX.json','effects_WX24_26.json','effects_WXDi.json','effects_WXK.json'];
const effByCard = new Map();
for (const f of EFF_FILES) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', f), 'utf8'));
  for (const [cardId, effs] of Object.entries(j)) {
    if (!effByCard.has(cardId)) effByCard.set(cardId, []);
    effByCard.get(cardId).push(...effs);
  }
}

// action内 duration/until を持ち decompiler が「ターン終了時まで」を描画する付与系型
// 各型: フィールド名と「end-of-turn を表す正しい値」
const TARGET = {
  GRANT_KEYWORD:    { field: 'duration', ok: 'UNTIL_END_OF_TURN' },
  GRANT_EFFECT:     { field: 'duration', ok: 'UNTIL_END_OF_TURN' },
  REMOVE_ABILITIES: { field: 'until',    ok: 'UNTIL_END_OF_TURN' },
  SET_BASE_LEVEL:   { field: 'until',    ok: 'END_OF_TURN' },
  LRIG_LIMIT_MODIFY:{ field: 'until',    ok: 'END_OF_TURN' },
};

// action ツリーを再帰的に walk（SEQUENCE.steps / CHOOSE.options[].action|effect / CONDITIONAL.then,else / then / effect）
function* walkActions(a) {
  if (!a || typeof a !== 'object') return;
  yield a;
  for (const k of ['steps','then','else','effect','action']) {
    const v = a[k];
    if (Array.isArray(v)) { for (const x of v) yield* walkActions(x); }
    else if (v && typeof v === 'object') yield* walkActions(v);
  }
  if (Array.isArray(a.options)) for (const o of a.options) { yield* walkActions(o.action); yield* walkActions(o.effect); }
  if (Array.isArray(a.branches)) for (const b of a.branches) yield* walkActions(b.action ?? b.then ?? b);
}

// 効果ごとに「対象型で duration が落ちている action」を検出
function droppedGrantsInEffect(eff) {
  const found = [];
  for (const a of walkActions(eff.action)) {
    const spec = TARGET[a?.type];
    if (!spec) continue;
    const val = a[spec.field];
    const dropped = val === undefined || val === 'PERMANENT';
    if (dropped) found.push(a.type);
  }
  return found;
}

// --- 3. 交差抽出 ---
const rows = [];
for (const [cardId, effs] of effByCard.entries()) {
  const blk = blocks.get(cardId);
  if (!blk) continue;
  const co = countOcc(blk.origText), cj = countOcc(blk.jsonText);
  if (co <= cj) continue; // 症状なし（decompile は落としていない）
  const typesByEff = [];
  for (const eff of effs) {
    const d = droppedGrantsInEffect(eff);
    if (d.length) typesByEff.push(`${eff.effectId}[${[...new Set(d)].join(',')}${eff.parseStatus==='MANUAL'?';MANUAL':''}]`);
  }
  if (typesByEff.length === 0) continue; // 原因（付与系 duration 落ち）が無い＝別カテゴリ（POWER_MODIFY 等）
  rows.push({ cardId, drop: co - cj, co, cj, effs: typesByEff });
}

rows.sort((a,b) => a.cardId.localeCompare(b.cardId));

// 型ごと集計
const typeCount = {};
for (const r of rows) for (const e of r.effs) { const m = e.match(/\[([^\];]+)/); if (m) for (const t of m[1].split(',')) typeCount[t] = (typeCount[t]||0)+1; }
// MANUAL/AUTO 内訳（カード単位＝該当effectに1つでもMANUALがあれば MANUAL）
const manualCards = rows.filter(r => r.effs.some(e => e.includes(';MANUAL'))).length;
// drop 分布
const dropDist = {};
for (const r of rows) dropDist[r.drop] = (dropDist[r.drop]||0)+1;

const out = [];
out.push('# durational付与 先頭/文中「ターン終了時まで」action内duration脱落 母集団（精密・機械抽出）');
out.push('# 生成: tmp_extractDurationLead.mjs');
out.push('# 条件 = (症状) decompile 原文count>逆翻訳count  AND  (原因) 付与系action〔GRANT_KEYWORD/GRANT_EFFECT/REMOVE_ABILITIES/SET_BASE_LEVEL/LRIG_LIMIT_MODIFY〕のaction内 duration/until が end-of-turn でない');
out.push(`# 該当カード ${rows.length}（うち MANUAL効果を含む ${manualCards} / AUTO のみ ${rows.length-manualCards}）`);
out.push('# 型別（延べ・effect単位）: ' + Object.entries(typeCount).sort((a,b)=>b[1]-a[1]).map(([t,n])=>`${t}=${n}`).join(' / '));
out.push('# drop分布: ' + Object.entries(dropDist).sort((a,b)=>a[0]-b[0]).map(([d,n])=>`drop${d}=${n}`).join(' / '));
out.push('# 修正方針（次セッション用・engine非依存）＝decompiler が action内 duration を落としたカードで原文に「ターン終了時まで」があれば注記を復元する系（§5b）。');
out.push('#   ⚠一括置換禁止（続き59＝parser側で先頭duration一般復元を試すと curated=PERMANENT慣例と衝突し held 124→219 激増）。系統確立→各カードverify で。');
out.push('#   MANUAL効果はJSON手編集での duration 追記が素直（原文照合の上で）。AUTO効果は parser/decompiler 側の系統修正候補。');
out.push('');
out.push('cardId\tdrop(orig/dec)\t該当effect[脱落型;MANUAL]');
for (const r of rows) out.push(`${r.cardId}\t${r.drop}(${r.co}/${r.cj})\t${r.effs.join(' ')}`);

fs.writeFileSync(path.join(DOCS, '_duration_lead_population.txt'), out.join('\n'), 'utf8');
console.log(`該当カード ${rows.length}`);
console.log('型別:', Object.entries(typeCount).sort((a,b)=>b[1]-a[1]).map(([t,n])=>`${t}=${n}`).join(' / '));
console.log('→ docs/_duration_lead_population.txt');
