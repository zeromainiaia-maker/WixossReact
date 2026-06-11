/**
 * verifyEffects.ts
 * CSVの効果テキストと effects.json の定義を照合して不一致をレポートする。
 *
 * 使い方: npx tsx scripts/verifyEffects.ts [--sheet Sheet1] [--card WX01-001]
 */

import fs from 'fs';
import path from 'path';

// ======= CLI引数 =======
const args = process.argv.slice(2);
const sheetArg = args[includes(args, '--sheet') ? args.indexOf('--sheet') + 1 : -1] ?? 'Sheet1';
const cardFilter = args[includes(args, '--card') ? args.indexOf('--card') + 1 : -1] ?? null;
function includes(arr: string[], v: string) { return arr.includes(v); }

// ======= 読み込み =======
const CSV_PATH = path.resolve('public/data', `CardData_${sheetArg}.csv`);
if (!fs.existsSync(CSV_PATH)) { console.error(`CSV not found: ${CSV_PATH}`); process.exit(1); }

const EFFECT_FILES = [
  'effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json',
  'effects_WXK.json', 'effects_misc.json',
];
const effectsAll: Record<string, EffectDef[]> = {};
for (const fname of EFFECT_FILES) {
  const p = path.resolve('public/data', fname);
  if (!fs.existsSync(p)) { console.error(`${fname} not found`); process.exit(1); }
  Object.assign(effectsAll, JSON.parse(fs.readFileSync(p, 'utf8')));
}

const csvRaw = fs.readFileSync(CSV_PATH, 'utf8').replace(/^﻿/, '');

// ======= 型定義（簡易） =======
interface EffectDef {
  effectId: string;
  effectType: string;
  timing?: string[];
  cost?: { energy?: { color: string; count: number }[]; exceed?: number; discard?: number };
  action: Record<string, unknown>;
  parseStatus?: string;
  mandatory?: boolean;
}

// ======= CSVパース（ヘッダー対応） =======
function parseCsv(raw: string) {
  const lines = raw.split('\n').filter(l => l.trim());
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cols[i] ?? ''; });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === ',' && !inQuote) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur);
  return result;
}

const rows = parseCsv(csvRaw);

// ======= ヘルパー =======

/** 効果テキストから各効果ブロックを分割 */
function splitEffects(text: string): string[] {
  if (!text || text === '-') return [];
  // 【】で始まる効果ブロックを分割
  const blocks: string[] = [];
  const re = /【[常出起自ガ起出ドライブ][^】]*】/g;
  let m: RegExpExecArray | null;
  const starts: number[] = [];
  while ((m = re.exec(text)) !== null) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    blocks.push(text.slice(starts[i], end).trim());
  }
  if (blocks.length === 0 && text.trim()) blocks.push(text.trim());
  return blocks;
}

/** テキストからコストを抽出: 【起/出】コスト部分（：の前） */
function extractCostFromText(effectBlock: string): { color: string; count: number }[] {
  // 【起】《白》×２《赤》：... または 【出】《白》：... の形
  const costPart = effectBlock.replace(/【[^】]+】/, '').split('：')[0].split('。')[0];
  const result: { color: string; count: number }[] = [];
  const re = /《(白|赤|青|緑|黒|無)》(?:×([０-９\d]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(costPart)) !== null) {
    const color = m[1];
    const cnt   = m[2] ? parseInt(m[2].replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xFF10))) : 1;
    const existing = result.find(e => e.color === color);
    if (existing) existing.count += cnt;
    else result.push({ color, count: cnt });
  }
  return result;
}

/** effects.jsonのコストを正規化（同じ色を合算） */
function normCost(energy: { color: string; count: number }[] | undefined): string {
  if (!energy?.length) return '';
  const merged: Record<string, number> = {};
  for (const e of energy) merged[e.color] = (merged[e.color] ?? 0) + e.count;
  return Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([c, n]) => `${c}×${n}`).join(',');
}

/** テキストコストを正規化 */
function normTextCost(costs: { color: string; count: number }[]): string {
  if (!costs.length) return '';
  return [...costs].sort((a, b) => a.color.localeCompare(b.color))
    .map(e => `${e.color}×${e.count}`).join(',');
}

/** アクションタイプのキーワード照合 */
// aliases: テキストのキーワードが複数のJSONアクション名にマッピングされる場合
const ACTION_KEYWORDS: { pattern: RegExp; types: string[] }[] = [
  { pattern: /手札に戻す|バウンス/,                                    types: ['BOUNCE'] },
  // BANISH系: BANISH_REDIRECT（バニッシュ先変更）, CHARM_PROTECTION（バニッシュ代替チャーム）もエイリアス
  { pattern: /バニッシュ(?!無効)/,                                     types: ['BANISH', 'BANISH_REDIRECT', 'CHARM_PROTECTION'] },
  // DRAW系: MUTUAL_DISCARD_AND_DRAW（両者手札捨て+ドロー）もエイリアス
  { pattern: /カードを([１-９\d０-９]+枚)?引く|ドローする/,             types: ['DRAW', 'MUTUAL_DISCARD_AND_DRAW'] },
  { pattern: /デッキから.+探して/,                                     types: ['SEARCH'] },
  { pattern: /エナゾーンに置く/,                                       types: ['MOVE_TO_ENERGY', 'ENERGY_CHARGE', 'ENERGY_CHARGE_FROM_DECK'] },
  { pattern: /手札から.+トラッシュ|手札から.+捨てる/,                  types: ['DISCARD', 'TRASH'] },
  // MILLパターン: 受動態「トラッシュに置かれた」はトリガー条件なので除外（能動態「置く」のみ）
  // [^。]+で同一センテンス内のみマッチ（別センテンスの「トラッシュに置く」の誤検出を防ぐ）
  // REVEAL_AND_PICK（デッキ上公開→選択→残りトラッシュ）もMILLエイリアス
  { pattern: /デッキ(?:の上|から)[^。]+トラッシュに置く(?!の?[たとき])/,   types: ['MILL', 'TRASH', 'REVEAL_AND_PICK', 'LOOK_AND_REORDER'] },
  { pattern: /パワーを[＋+][０-９\d]+する|パワーが[０-９\d]+になる/,   types: ['POWER_MODIFY'] },
  // 「ダブルクラッシュ」「クロスクラッシュ」等のキーワード名は除外し、ライフをクラッシュする文脈のみ
  { pattern: /ライフクロスを.{0,6}クラッシュ|ライフを.{0,6}クラッシュ|クロスを.{0,6}クラッシュ/, types: ['LIFE_CRASH', 'CRASH_LIFE'] },
];

// テキストから期待アクション候補セットを返す（aliasを考慮）
function detectActionsFromText(text: string): { label: string; aliases: string[] }[] {
  const found: { label: string; aliases: string[] }[] = [];
  for (const { pattern, types } of ACTION_KEYWORDS) {
    if (pattern.test(text)) found.push({ label: types[0], aliases: types });
  }
  return found;
}

function collectActionsFromJson(effs: EffectDef[]): Set<string> {
  const found = new Set<string>();
  function walk(action: Record<string, unknown>) {
    if (!action) return;
    if (action.type) found.add(action.type as string);
    if (action.steps) (action.steps as Record<string, unknown>[]).forEach(walk);
    if (action.then) walk(action.then as Record<string, unknown>);
    if (action.else) walk(action.else as Record<string, unknown>);
    if (action.thenAction) walk(action.thenAction as Record<string, unknown>);
    // CHOOSE/CHOOSE_N_FROM_LIST の選択肢内部を再帰探索 (options or choices)
    if (action.options) (action.options as { action?: Record<string, unknown> }[])
      .forEach(o => { if (o.action) walk(o.action); });
    if (action.choices) (action.choices as { action?: Record<string, unknown> }[])
      .forEach(o => { if (o.action) walk(o.action); });
    // GRANT_FIELD_SIGNI_ABILITY / GRANT_SIGNI_ABOVE_ABILITY の付与能力内部を再帰探索
    if (action.abilities) (action.abilities as { action?: Record<string, unknown> }[])
      .forEach(a => { if (a.action) walk(a.action); });
  }
  effs.forEach(e => walk(e.action));
  return found;
}

/** action内にネストされた付与能力（abilities）のCardEffectを再帰収集 */
function collectNestedAbilityEffects(action: Record<string, unknown> | undefined): EffectDef[] {
  if (!action) return [];
  const out: EffectDef[] = [];
  if (action.abilities) {
    for (const ab of action.abilities as EffectDef[]) {
      out.push(ab, ...collectNestedAbilityEffects(ab.action));
    }
  }
  if (action.steps) (action.steps as Record<string, unknown>[]).forEach(s => out.push(...collectNestedAbilityEffects(s)));
  if (action.then) out.push(...collectNestedAbilityEffects(action.then as Record<string, unknown>));
  if (action.else) out.push(...collectNestedAbilityEffects(action.else as Record<string, unknown>));
  return out;
}

// ======= 照合ロジック =======

interface Issue {
  cardNum: string;
  cardName: string;
  category: string;
  detail: string;
}

const issues: Issue[] = [];
const stubCards: { cardNum: string; cardName: string; stubIds: string[]; text: string }[] = [];

function addIssue(cardNum: string, cardName: string, category: string, detail: string) {
  issues.push({ cardNum, cardName, category, detail });
}

function collectStubIds(action: Record<string, unknown>): string[] {
  if (!action) return [];
  const ids: string[] = [];
  if (action.type === 'STUB') ids.push((action.id as string) ?? 'UNKNOWN');
  if (action.steps) (action.steps as Record<string, unknown>[]).forEach(s => ids.push(...collectStubIds(s)));
  if (action.then) ids.push(...collectStubIds(action.then as Record<string, unknown>));
  if (action.thenAction) ids.push(...collectStubIds(action.thenAction as Record<string, unknown>));
  return ids;
}

for (const row of rows) {
  const cardNum  = row['CardNum']?.trim();
  const cardName = row['CardName']?.trim();
  const effectText = row['EffectText']?.trim() ?? '';
  const burstText  = row['BurstText']?.trim()  ?? '';
  const lifeBurst  = row['LifeBurst']?.trim()  ?? '0';

  if (!cardNum || !cardName) continue;
  if (cardFilter && cardNum !== cardFilter) continue;

  const effs = effectsAll[cardNum] ?? [];

  // ─── 1. カード自体がeffects.jsonに存在しない（効果テキストあり） ───
  // 【ガード】のみの説明文はゲームエンジン不要（キーワード処理済み）なので除外
  // 【常】：【マルチエナ】はBattleScreen.tsxで処理済みなので、それのみなら除外
  const isGuardOnly = effectText && effectText !== '-'
    && /^【ガード】/.test(effectText)
    && !effectText.includes('【出】')
    && !effectText.includes('【起】')
    && !effectText.includes('【自】')
    && !/【常】(?!：【マルチエナ】)/.test(effectText);
  if (effs.length === 0 && effectText && effectText !== '-' && !isGuardOnly) {
    addIssue(cardNum, cardName, '定義なし', `効果テキストあり(${effectText.substring(0, 40)}...)だがeffects.jsonにエントリーなし`);
    continue;
  }
  if (isGuardOnly && effs.length === 0) continue; // ガードのみ → 正常

  // ─── 2. ライフバースト照合 ───
  const hasBurstDef = effs.some(e => e.effectType === 'LIFE_BURST');
  const hasBurstText = lifeBurst === '1' || (burstText && burstText !== '-');
  if (hasBurstText && !hasBurstDef) {
    addIssue(cardNum, cardName, 'LIFE_BURST', `BurstText="${burstText}"があるがLIFE_BURSTエフェクトなし`);
  }
  if (!hasBurstText && hasBurstDef) {
    addIssue(cardNum, cardName, 'LIFE_BURST', 'BurstTextなしなのにLIFE_BURSTエフェクトが存在');
  }

  // ─── 3. タイミング照合 ───
  // 「「〜」を得る」のような付与効果引用文内の【】は実際の効果ではないので除去
  const stripQuoted = (t: string) => t.replace(/「[^「」]*」/g, '');
  // 【グロウ】条件テキスト（グロウ条件として書かれた非効果部分）を除去
  const stripGrow = (t: string) => t.replace(/【グロウ】[^【]*/g, '');
  // 【常】：【マルチエナ】はBattleScreen.tsxのEffectTextフォールバックで処理済みなので除去
  const stripMultiEner = (t: string) => t.replace(/【常】：【マルチエナ】/g, '');
  // 「の【起】能力」「【起】能力を」等の補足説明（能力の参照テキスト）を除去
  // 「の【出】能力」「【出】能力は」等の補足説明を除去
  const stripAbilityRef = (t: string) => t
    .replace(/の【起】能力/g, 'の起能力')
    .replace(/【起】能力を/g, '起能力を')
    .replace(/の【出】能力/g, 'の出能力')
    .replace(/【出】能力は/g, '出能力は');

  const cleanEffectText = stripMultiEner(stripAbilityRef(stripGrow(stripQuoted(effectText))));
  const timingChecks = [
    { marker: '【常】',   type: 'CONTINUOUS',  timing: null         },
    { marker: '【出】',   type: 'AUTO',         timing: 'ON_PLAY'    },
    { marker: '【自】',   type: 'AUTO',         timing: null         }, // timingは種類様々
    { marker: '【起】',   type: 'ACTIVATED',    timing: null         },
    { marker: '【ドライブ】', type: 'AUTO',     timing: 'ON_PLAY'    },
  ] as const;

  for (const { marker, type, timing } of timingChecks) {
    const count = (cleanEffectText.match(new RegExp(marker.replace('[', '\\[').replace(']','\\]').replace('【','【').replace('】','】'), 'g')) ?? []).length;
    if (count === 0) continue;
    const matchedEffs = effs.filter(e => {
      if (e.effectType !== type) return false;
      if (timing && !(e.timing ?? []).includes(timing)) return false;
      return true;
    });
    if (matchedEffs.length === 0) {
      addIssue(cardNum, cardName, 'タイミング',
        `"${marker}"が${count}件あるがeffects.jsonに対応するエフェクト(type=${type}${timing ? `, timing=${timing}` : ''})がない`);
    }
  }

  // ─── 4. コスト照合（【起】と有コスト【出】） ───
  const effectBlocks = splitEffects(effectText);
  for (const block of effectBlocks) {
    const isActivated = block.startsWith('【起】');
    const isOnPlay    = block.startsWith('【出】');
    if (!isActivated && !isOnPlay) continue;

    const textCosts = extractCostFromText(block);
    if (textCosts.length === 0) continue; // コストなし

    // 対応するエフェクトを探す
    const targetType = isActivated ? 'ACTIVATED' : 'AUTO';
    const candidateEffs = effs.filter(e => {
      if (e.effectType !== targetType) return false;
      if (isOnPlay && !(e.timing ?? []).includes('ON_PLAY')) return false;
      return true;
    });

    if (candidateEffs.length === 0) continue; // タイミング不一致は上で報告済み

    const textCostStr = normTextCost(textCosts);
    const jsonMatched = candidateEffs.some(e => normCost(e.cost?.energy) === textCostStr);
    if (!jsonMatched) {
      const jsonCosts = candidateEffs.map(e => normCost(e.cost?.energy) || 'なし').join(' / ');
      addIssue(cardNum, cardName, 'コスト',
        `テキスト:"${textCostStr}" ≠ JSON:"${jsonCosts}" (${isActivated ? '起' : '出'})`);
    }
  }

  // ─── 5. 主要アクション照合 ───
  // （）で囲まれたキーワード説明文を除去（ランサー説明の「クラッシュ」等の誤検出対策）
  const stripParens = (t: string) => t.replace(/（[^（）]*）/g, '');
  // 各効果ブロックのコスト部分（【起/出/自】...：の前）を除去して効果部分のみを残す
  const stripCostParts = (t: string) => t.replace(/【[^】]+】[^：。]*：/g, '');
  // 「」内の付与能力引用文を除去（「【自】：ライフクロスをクラッシュしたとき...」等の誤検出対策）
  // 受動態バニッシュ（「バニッシュされたとき」等のトリガー条件・「バニッシュされない」保護）を除去
  // 能動態バニッシュ過去形・進行形（「バニッシュしたとき」「バニッシュしていた場合」等）を除去
  // ただし「をバニッシュし、」（能動的BANISHアクション）は除去しない
  const stripBanishCtx = (t: string) => t
    .replace(/バニッシュされ(?:る|た|て|ない|ず)[^、。]*/g, '')
    .replace(/バニッシュし(?:た|て|ていた|ている|ても)[^、。]*/g, '');
  // 「クラッシュしたとき」はライフクラッシュのトリガー条件なので除去（LIFE_CRASH誤検出対策）
  const stripCrashCtx = (t: string) => t.replace(/クラッシュしたとき[^、。]*/g, '');
  const effectBody = stripCostParts(stripCrashCtx(stripBanishCtx(stripQuoted(stripParens(effectText)))));
  const burstBody  = stripParens(burstText);
  const textActions = detectActionsFromText(effectBody + ' ' + burstBody);
  const jsonActions = collectActionsFromJson(effs);

  for (const { label, aliases } of textActions) {
    // aliasのどれかがJSONに存在すればOK
    const matched = aliases.some(a => jsonActions.has(a));
    if (!matched) {
      const hasStub = jsonActions.has('STUB');
      const severity = hasStub ? '[STUB代替?]' : '[要確認]';
      addIssue(cardNum, cardName, `アクション${severity}`,
        `テキストから"${label}"が期待されるがJSONに存在しない (JSONアクション: ${[...jsonActions].filter(a=>a!=='SEQUENCE').join(', ')||'なし'})`);
    }
  }

  // ─── 6. STUBリスト収集 ───
  const allStubIds: string[] = [];
  for (const e of effs) allStubIds.push(...collectStubIds(e.action));
  if (allStubIds.length > 0) {
    stubCards.push({
      cardNum, cardName,
      stubIds: [...new Set(allStubIds)],
      text: effectText.substring(0, 80),
    });
  }
}

// ======= レポート出力 =======

const categories = [...new Set(issues.map(i => i.category))].sort();

console.log('='.repeat(70));
console.log(`  WixossReact 効果照合レポート — ${sheetArg}`);
console.log(`  対象: ${rows.length}カード  issues: ${issues.length}件  STUBアクション含有: ${stubCards.length}件`);
console.log('='.repeat(70));

if (issues.length === 0) {
  console.log('\n✅ 不一致なし');
} else {
  for (const cat of categories) {
    const catIssues = issues.filter(i => i.category === cat);
    console.log(`\n## ${cat}  (${catIssues.length}件)\n`);
    for (const iss of catIssues) {
      console.log(`  ${iss.cardNum}  ${iss.cardName}`);
      console.log(`    → ${iss.detail}`);
    }
  }
}

// STUBリスト（--stubs フラグがある場合のみ詳細表示）
// 注意: STUBアクションを含むカード数であり「未実装」を意味しない。実装状況はSTUBS.mdを参照。
const showStubs = args.includes('--stubs');
console.log(`\n${'='.repeat(70)}`);
console.log(`STUBアクション参照カード数: ${stubCards.length}件${showStubs ? '' : '  (詳細: --stubs オプション)'}`);
if (showStubs) {
  console.log();
  for (const s of stubCards) {
    console.log(`  ${s.cardNum}  ${s.cardName}  [${s.stubIds.join(', ')}]`);
    console.log(`    ${s.text}`);
  }
}

console.log(`\n${'='.repeat(70)}`);

// ──カテゴリ別サマリー
if (issues.length > 0) {
  console.log('\nサマリー:');
  for (const cat of categories) {
    console.log(`  ${cat}: ${issues.filter(i=>i.category===cat).length}件`);
  }
}
