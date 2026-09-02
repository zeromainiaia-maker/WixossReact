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
  // 《コインアイコン》コスト（連続数=枚数。v0.261で38枚に cost:{coin:N} が付与済み）
  const coinCount = (costPart.match(/《コインアイコン》/g) ?? []).length;
  if (coinCount > 0) result.push({ color: 'コイン', count: coinCount });
  return result;
}

/** effects.jsonのコストを正規化（同じ色を合算。coinは「コイン」擬似色として含める） */
function normCost(cost: { energy?: { color: string; count: number }[]; coin?: number } | undefined): string {
  const entries = [...(cost?.energy ?? [])];
  if (cost?.coin) entries.push({ color: 'コイン', count: cost.coin });
  if (!entries.length) return '';
  const merged: Record<string, number> = {};
  for (const e of entries) merged[e.color] = (merged[e.color] ?? 0) + e.count;
  return Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([c, n]) => `${c}×${n}`).join(',');
}

/** テキストコストを正規化 */
function normTextCost(costs: { color: string; count: number }[]): string {
  if (!costs.length) return '';
  return [...costs].sort((a, b) => a.color.localeCompare(b.color))
    .map(e => `${e.color}×${e.count}`).join(',');
}

/**
 * 計器だけの「概念ラベル」＝ EffectAction の実型名ではない語。
 * ⚠ここに無い名前は実型名として扱われ、下の較正チェック（KNOWN_ACTION_TYPES）で検証される。
 * 2026-08-16（O-11）：`MOVE_TO_ENERGY` / `DISCARD` / `CRASH_LIFE` は型にも live JSON にも存在しない
 * 幻の型名だった。うち `MOVE_TO_ENERGY` は**実型名 `SEND_TO_ENERGY`（live 77件）が別名表に無かった**ため、
 * 「エナゾーンに置く」系の報告が丸ごと誤検出になっていた。
 */
const CONCEPT_LABELS = new Set<string>([
  'HAND_DISCARD', // 手札を捨てる＝実装は TRASH{target:HAND_CARD}。デッキミルの TRASH と区別するための概念名
]);

/** アクションタイプのキーワード照合 */
// aliases: テキストのキーワードが複数のJSONアクション名にマッピングされる場合
const ACTION_KEYWORDS: { pattern: RegExp; types: string[] }[] = [
  { pattern: /手札に戻す|バウンス/,                                    types: ['BOUNCE', 'TRANSFER_TO_HAND'] },
  // BANISH系: BANISH_REDIRECT（バニッシュ先変更）, CHARM_PROTECTION（バニッシュ代替チャーム）もエイリアス
  // BANISH_SUBSTITUTE（バニッシュ置換）/ REVEAL_UNTIL_BANISH_SAME_LEVEL（公開してバニッシュ）もエイリアス
  // 「バニッシュ以外で」（移動制限の除外句）はアクションではないため除外
  { pattern: /バニッシュ(?!無効|以外)/,                                types: ['BANISH', 'BANISH_REDIRECT', 'CHARM_PROTECTION', 'BANISH_SUBSTITUTE', 'REVEAL_UNTIL_BANISH_SAME_LEVEL'] },
  // DRAW系: MUTUAL_DISCARD_AND_DRAW（両者手札捨て+ドロー）もエイリアス
  // 枚数が盤面/レベル依存の DRAW_PER_* も「引く」の実装形（2026-08-16 O-11）
  { pattern: /カードを([１-９\d０-９]+枚)?引く|ドローする/,             types: ['DRAW', 'MUTUAL_DISCARD_AND_DRAW', 'DRAW_PER_FIELD_COUNT', 'DRAW_PER_LRIG_LEVEL', 'VARIABLE_DISCARD_AND_DRAW', 'DRAW_PHASE_REPLACEMENT', 'RESERVE_DRAW_PHASE_REPLACEMENT'] },
  // 「探している間」（SEARCH中の常時能力トリガー文）は除外
  { pattern: /デッキから.+探して(?!いる)/,                             types: ['SEARCH'] },
  // ⚠主力は SEND_TO_ENERGY（live 77件）。ENERGY_CHARGE_*_PER_* は枚数が盤面/レベル依存の同義形。
  { pattern: /エナゾーンに置く/,                                       types: ['SEND_TO_ENERGY', 'ENERGY_CHARGE', 'ENERGY_CHARGE_FROM_DECK', 'ADD_TO_ENERGY', 'TAKE_FROM_UNDER_SIGNI', 'ENERGY_CHARGE_PER_LRIG_LEVEL', 'ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT', 'ENERGY_CHARGE_BY_FIELD_COUNT', 'EQUALIZE_ENERGY'] },
  // 能動形のみ（「手札からトラッシュに移動していた」等のトリガー条件文を除外）
  // [^。]+で同一センテンス内のみマッチ（「手札から場に出す。ターン終了時トラッシュ」等の文またぎ誤検出を防ぐ）
  { pattern: /手札から[^。]+トラッシュに置|手札から[^。]+捨てる/,        types: ['HAND_DISCARD', 'TRASH', 'DISCARD_BOTH', 'MUTUAL_DISCARD_AND_DRAW', 'VARIABLE_DISCARD_AND_DRAW'] },
  // MILLパターン: 受動態「トラッシュに置かれた」はトリガー条件なので除外（能動態「置く」のみ）
  // [^。]+で同一センテンス内のみマッチ（別センテンスの「トラッシュに置く」の誤検出を防ぐ）
  // REVEAL_AND_PICK（デッキ上公開→選択→残りトラッシュ）もMILLエイリアス
  // 「ルリグデッキからルリグトラッシュに置く」はミルではないため除外
  { pattern: /(?<!ルリグ)デッキ(?:の上|から)[^。]+トラッシュに置く(?!の?[たとき])/,   types: ['MILL', 'TRASH', 'REVEAL_AND_PICK', 'LOOK_AND_REORDER', 'REPLACE_NEXT_DAMAGE_WITH_MILL'] },
  { pattern: /パワーを[＋+][０-９\d]+する|パワーが[０-９\d]+になる/,   types: ['POWER_MODIFY'] },
  // 「ダブルクラッシュ」「クロスクラッシュ」等のキーワード名は除外し、ライフをクラッシュする文脈のみ
  { pattern: /ライフクロスを.{0,6}クラッシュ|ライフを.{0,6}クラッシュ|クロスを.{0,6}クラッシュ/, types: ['LIFE_CRASH', 'LIFE_CRASH_REPLACE'] },
];

// テキストから期待アクション候補セットを返す（aliasを考慮）
function detectActionsFromText(text: string): { label: string; aliases: string[] }[] {
  const found: { label: string; aliases: string[] }[] = [];
  for (const { pattern, types } of ACTION_KEYWORDS) {
    if (pattern.test(text)) found.push({ label: types[0], aliases: types });
  }
  return found;
}

// 実装済みSTUB（docs/STUBS.md ✅）が期待アクションの同等物として機能する場合のマッピング。
// 「STUBがそのアクションを実際に実行する」と確認できたもののみ登録すること
// （ログのみ📝のSTUBを登録すると実欠落を隠蔽してしまう）。
const STUB_EQUIVALENTS: Record<string, string[]> = {
  // カードテキストの①②③④を実行時に解析しCHOOSE提示（DRAW/ミル/ダウン/凍結/バニッシュ/バウンス/エナ置き(BANISH近似)等を実装）
  CONDITIONAL_MULTI_CHOOSE_BY_CENTER: ['DRAW', 'MILL', 'TRASH', 'HAND_DISCARD', 'DOWN', 'FREEZE', 'BANISH', 'BOUNCE', 'POWER_MODIFY', 'SEND_TO_ENERGY'],
  // 手札がN枚になるまでドロー
  DRAW_UNTIL_HAND_SIZE: ['DRAW'],
  // ①②③④を実行時解析（DRAW/ミル/バニッシュ/バウンス/トラッシュ→デッキ+ライフエナ/全体パワー+等を実装）
  CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE: ['DRAW', 'MILL', 'BANISH', 'BOUNCE', 'SEND_TO_ENERGY', 'POWER_MODIFY'],
  // 直前エナチャージがクラス一致なら1ドロー
  DRAW_IF_CHARGED_CLASS: ['DRAW'],
  // 手札N枚超過分をエナゾーンへ
  HAND_EXCESS_TO_ENERGY: ['SEND_TO_ENERGY'],
  // デッキ上N枚公開→場に出す、残りはトラッシュ（restDest:'trash'）
  REVEAL_PICK_PLAY: ['MILL'],
  // 相手シグニ対象+手札1枚捨て（then未指定時はBANISH既定）
  TARGET_AND_DISCARD_HAND: ['HAND_DISCARD', 'TRASH', 'BANISH'],
  TRADE_BANISH_SELF_SIGNI: ['BANISH'],
  // エナゾーンへ置く系
  CHOOSE_HAND_OR_ENERGY: ['SEND_TO_ENERGY'],
  OPP_CHOOSE_OWN_SIGNI_TO_ENERGY: ['SEND_TO_ENERGY'],
  UNDER_SIGNI_TO_ENERGY: ['SEND_TO_ENERGY'],
  UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: ['SEND_TO_ENERGY'],
  CLASS_SIGNI_TO_ENERGY: ['SEND_TO_ENERGY'],
  PLACE_ACCE_SIGNI_TO_ENERGY: ['SEND_TO_ENERGY'],
  RESONANCE_COST_CARDS_TO_ENERGY: ['SEND_TO_ENERGY'],
  HAND_NONCOLORLESS_TO_ENERGY: ['SEND_TO_ENERGY'],
  NON_GUARD_DISCARD_TO_ENERGY: ['SEND_TO_ENERGY', 'HAND_DISCARD'],
  TRASH_CLASS_TO_HAND_OR_ENERGY: ['SEND_TO_ENERGY'],
  TRASHED_CARD_TO_HAND_OR_ENERGY: ['SEND_TO_ENERGY'],
  ENERGY_BY_LEVEL_SUM_LIMIT: ['SEND_TO_ENERGY'],
  DECK_TOP_CHECK_LEVEL_ENERGY: ['SEND_TO_ENERGY'],
  // デッキ上→トラッシュ（ミル）系
  DECK_TOP_DECLARED_NUM_TRASH: ['MILL'],
  DECK_MILL_UNTIL_CLASS: ['MILL'],
  // 手札捨て系
  OPTIONAL_DISCARD_CLASS_SIGNI: ['HAND_DISCARD'],
  ARTS_USE_DISCARD_COLOR_HAND: ['HAND_DISCARD'],
  DISCARD_OR_PENALTY: ['HAND_DISCARD'],
  OPP_CHOOSE_YOUR_HAND_DISCARD: ['HAND_DISCARD'],
  POWER_MOD_BY_DISCARD_COUNT_HIGH: ['HAND_DISCARD'],
  DRAW_DISCARD_COUNT_PLUS_N: ['DRAW', 'HAND_DISCARD'],
  COUNT_BASED_DRAW_OR_POWER: ['DRAW', 'HAND_DISCARD'],
  // ベット機構: BET_MECHANICが①②③④をchoiceTextParserで解析実行（バニッシュ/エナ置き/ドロー/ミル/クラッシュ/サーチ等）
  BET_MECHANIC: ['BANISH', 'SEND_TO_ENERGY', 'DRAW', 'MILL', 'BOUNCE', 'HAND_DISCARD', 'DOWN', 'FREEZE', 'SEARCH', 'ENERGY_CHARGE_FROM_DECK', 'LIFE_CRASH'],
  BET_CONDITION: ['BANISH', 'SEND_TO_ENERGY', 'DRAW', 'MILL', 'BOUNCE', 'HAND_DISCARD', 'DOWN', 'FREEZE'],
  // ①②③④をchoiceTextParserで解析実行
  CHOOSE_N_FROM_LIST: ['BANISH', 'DOWN', 'FREEZE', 'DRAW', 'MILL', 'BOUNCE', 'HAND_DISCARD', 'SEND_TO_ENERGY'],
  // ①バウンス（+手札捨て）②アタック不可③クラスサーチを実装
  CHOOSE_SAME_OPTION_TWICE: ['BOUNCE', 'SEARCH', 'HAND_DISCARD'],
  CHOOSE_SAME_OPTION_MULTIPLE: ['BOUNCE', 'SEARCH', 'HAND_DISCARD'],
  // ウィルス除去→①②③④をchoiceTextParserで解析実行（両者ミル/パワー修正/トラッシュ回収等）
  EXTRA_COST_REMOVE_VIRUS: ['MILL', 'POWER_MODIFY', 'TRANSFER_TO_HAND'],
  // デッキ上N枚公開→レベル合計×1000以下バニッシュ→公開分トラッシュ（本実装済み）
  REVEAL_TOP_BANISH_BY_LEVEL_SUM: ['BANISH', 'MILL'],
  // デッキ上N枚公開→選択→手札/エナ（then:'energy'対応済み）、残りはrestDest先へ
  REVEAL_PICK_HAND_SHUFFLE_BOTTOM: ['SEND_TO_ENERGY'],
  // デッキトップ公開→レベル別効果（Lv1:パワー+5000/Lv2:エナ/Lv3:ランサー/Lv4:ドロー/Lv5:バニッシュ、本実装済み）
  REVEAL_TOP_LEVEL_ROUTE: ['BANISH', 'DRAW', 'SEND_TO_ENERGY', 'POWER_MODIFY'],
  // 両プレイヤーのデッキ上N枚をトラッシュ（choiceTextParser生成STUB、本実装済み）
  INTERNAL_DECK_TRASH_BOTH: ['MILL'],
  // センタールリグのレベル1につき1ドロー/エナチャージ1（本実装済み）
  INTERNAL_DRAW_PER_CENTER_LEVEL: ['DRAW'],
  INTERNAL_CHARGE_PER_CENTER_LEVEL: ['SEND_TO_ENERGY'],
  // 手札すべて捨ててN枚引く（choiceTextParser生成STUB、本実装済み）
  INTERNAL_DISCARD_ALL_DRAW_N: ['DRAW', 'HAND_DISCARD'],
  // シグニの下に置かれたとき上のシグニにパワー+N（v0.284実装済み）
  BUFF_HOST_WHEN_PLACED_UNDER: ['POWER_MODIFY'],

  // ===== 2026-08-16（§6.4 O-11）追加＝ハンドラ本文を読んで実挙動を確認したもののみ =====
  // 支払ったエナの色ごとに SEARCH→REVEAL→ADD_TO_HAND→SHUFFLE を選択肢化（execStubPart3.ts:1586）
  COST_COLOR_SELECT: ['SEARCH'],
  // パワーが0以下なら deck[0] を hand へ（execStubPart1.ts:2092）
  DRAW_IF_POWER_ZERO_TEMP: ['DRAW'],
  // 両プレイヤーの deck→trash をN枚、名前ヒットで繰り返し（execStubPart2.ts:2723）
  MILL_EACH_REPEAT_ON_NAME: ['MILL', 'TRASH'],
  // turn_end_draw_count を予約。消費は BattleScreen.tsx:3656（人間）/ :11089（CPU）
  DRAW_AT_TURN_END: ['DRAW'],
  // turn_end_return_to_hand を予約。消費は screens/battle/turnEndHandReturn.ts
  RETURN_TO_HAND_AT_TURN_END: ['BOUNCE', 'TRANSFER_TO_HAND'],
  // 対象選択→デッキ下4枚ミル→レベル4種以上なら BANISH（effectExecutor.ts:8180）
  SELECT_OPP_SIGNI_FOR_BOTTOM_MILL: ['BANISH', 'MILL'],
  // 正面よりパワーが低いアタッカーを banishDestination でバニッシュ（execStubPart1.ts:1182）
  BANISH_ATTACKER_IF_WEAKER_THAN_FRONT: ['BANISH'],
  // ①全体パワー-1000 ②パワー4000以下バニッシュ ③2ドロー2捨て（execStubPart3.ts:3226）
  INTERNAL_KIYOHIME_CHOOSE: ['POWER_MODIFY', 'BANISH', 'DRAW', 'HAND_DISCARD', 'TRASH'],
  // 対象選択→「手札に戻す／トラッシュに置く」の二択（execStubPart3.ts:1426→INTERNAL_TOSFC_BOUNCE/_TRASH）
  TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE: ['BOUNCE', 'TRANSFER_TO_HAND', 'TRASH'],
  // 手札1枚を捨てさせ、宣言アイコンを持たなければ BANISH（execStubPart3.ts:2390→INTERNAL_DECLARED_ICON_RESOLVE）
  DECLARED_ICON_HAND_DISCARD_BANISH: ['BANISH', 'HAND_DISCARD', 'TRASH'],
  // 追加コストの有無で①②を切り替え、SEARCH→ADD_TO_HAND / トラッシュ回収を実行（execStubPart3.ts:2048）
  CONDITIONAL_ALTERNATE_EFFECT: ['SEARCH', 'ADD_TO_HAND', 'TRANSFER_TO_HAND'],
  // エナのトラッシュ枚数（レベル）に応じて BOUNCE（execStubPart1.ts:120）
  VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE: ['BOUNCE', 'TRASH'],
  // 裏向き設置→次の自メインで表向き選択。表にすると field_power_mods で +powerBonus、しなければ手札へ
  // （execStubPart2.ts:3548 → PLACE_FACEDOWN_SIGNI → RESOLVE_FACEDOWN_FLIP → FACEDOWN_FLIP_UP）
  LOOK_PLACE_FACEDOWN_DELAYED: ['POWER_MODIFY', 'ADD_TO_HAND', 'TRANSFER_TO_HAND'],
};

// ======= 計器の較正（2026-08-16・§6.4 O-11） =======
// ⚠**この計器の語彙が腐ると、過剰報告する計器は無いより悪い**（続き407/408 の教訓）。
// ACTION_KEYWORDS / STUB_EQUIVALENTS に書いた「アクション型名」が
// 実在するか（型宣言 `src/types/effects.ts` ∪ live JSON の実出現）を毎回突き合わせ、
// 実在しない名前＝**幻の型名**を起動時に赤で報告する。
// これを入れた理由：`MOVE_TO_ENERGY` が幻の型名だったせいで実型名 `SEND_TO_ENERGY`（live 77件）が
// 別名表から漏れ、「エナゾーンに置く」の報告が**全件誤検出**になっていた（O-11 で発見）。
const KNOWN_ACTION_TYPES: Set<string> = (() => {
  const s = new Set<string>();
  // (1) 型宣言側
  const typesSrc = path.resolve('src/types/effects.ts');
  if (fs.existsSync(typesSrc)) {
    for (const m of fs.readFileSync(typesSrc, 'utf8').matchAll(/\btype:\s*'([A-Z][A-Z_0-9]*)'/g)) s.add(m[1]);
  }
  // (2) live JSON の実出現（型宣言に無い旧型・手書き MANUAL も拾う）
  const walkTypes = (a: unknown): void => {
    if (Array.isArray(a)) { a.forEach(walkTypes); return; }
    if (!a || typeof a !== 'object') return;
    const o = a as Record<string, unknown>;
    if (typeof o.type === 'string') s.add(o.type);
    Object.values(o).forEach(walkTypes);
  };
  walkTypes(Object.values(effectsAll));
  return s;
})();

{
  const unknown = new Map<string, string[]>(); // 型名 → 参照元
  const note = (t: string, where: string) => {
    if (KNOWN_ACTION_TYPES.has(t) || CONCEPT_LABELS.has(t)) return;
    if (!unknown.has(t)) unknown.set(t, []);
    unknown.get(t)!.push(where);
  };
  ACTION_KEYWORDS.forEach(k => k.types.forEach(t => note(t, `ACTION_KEYWORDS ${k.pattern.source.slice(0, 20)}`)));
  for (const [stub, types] of Object.entries(STUB_EQUIVALENTS)) types.forEach(t => note(t, `STUB_EQUIVALENTS ${stub}`));
  if (unknown.size > 0) {
    console.log('🔴 計器の較正エラー＝実在しないアクション型名が照合表に混ざっている');
    console.log('   （型宣言 src/types/effects.ts にも live JSON にも無い。概念名なら CONCEPT_LABELS へ登録すること）');
    for (const [t, wheres] of unknown) console.log(`   - ${t}  ← ${[...new Set(wheres)].join(' / ')}`);
    console.log('');
  }
}

/**
 * 「行き先をパラメータに持つ」型から派生アクションを導く（2026-08-16・§6.4 O-11）。
 * ⚠`LOOK_PICK_CHAIN` / `REVEAL_AND_PICK` は**エナ置き・ミル・手札加え・場出しを型名では区別しない**
 * （行き先は `stages[].then` / `remainder.location` / `handOrEnergy` に入る）ので、
 * 型名だけ見る照合では原理的に当てられず、そのぶんが誤検出になっていた。
 * 派生分は `~` を付けて記録し、レポートでも「推定」と分かるようにする。
 */
const DEST_TO_ACTION: Record<string, string[]> = {
  energy: ['SEND_TO_ENERGY'],
  trash:  ['MILL', 'TRASH'],
  hand:   ['ADD_TO_HAND', 'TRANSFER_TO_HAND'],
  field:  ['ADD_TO_FIELD'],
  deck:   ['TRANSFER_TO_DECK'],
};

/**
 * 任意コスト STUB（`OPTIONAL_COST` 一族）が**実際に何を支払うか**はペイロードのキーで決まる
 * （`resolveOptionalCostSpec`＝`src/engine/execUtils.ts`）。id だけを STUB_EQUIVALENTS に登録すると
 * **ペイロードが空＝何も支払わない個体まで「実装済み」に見えてしまう**ので、キー単位で派生させる。
 * ⚠ここに無いキーは何も派生しない＝**ペイロードが空の `OPTIONAL_COST` は正しく穴として報告される**。
 */
const COST_KEY_TO_ACTION: Record<string, string[]> = {
  handDiscard:      ['HAND_DISCARD', 'TRASH'],
  handDiscardCountFromTargetLevel: ['HAND_DISCARD', 'TRASH'],
  handToEnergy:     ['SEND_TO_ENERGY'],
  selfToEnergy:     ['SEND_TO_ENERGY'],
  deckTrash:        ['MILL', 'TRASH'],
  life_crash:       ['LIFE_CRASH'],
  lifeToHand:       ['TRANSFER_TO_HAND'],
  energyTrash:      ['TRASH'],
  fieldTrash:       ['TRASH'],
  fieldTrashGroups: ['TRASH'],
  charmTrash:       ['TRASH'],
  lifeTrash:        ['TRASH'],
  fieldToLrigTrash: ['TRASH'],
  trashOwnKey:      ['TRASH'],
  fieldToDeckBottom: ['TRANSFER_TO_DECK'],
};

function collectActionsFromJson(effs: EffectDef[]): Set<string> {
  const found = new Set<string>();
  const addDest = (dest: unknown) => {
    if (typeof dest !== 'string') return;
    for (const a of DEST_TO_ACTION[dest] ?? []) found.add(`~${a}`);
  };
  function walk(action: Record<string, unknown>) {
    if (!action) return;
    if (action.type) found.add(action.type as string);
    if (action.type === 'STUB' && action.id) {
      found.add(`STUB:${action.id as string}`);
      // 任意コスト系はペイロードのキーが「実際に支払うもの」＝そこから派生させる
      for (const [k, acts] of Object.entries(COST_KEY_TO_ACTION)) {
        if (action[k]) acts.forEach(a => found.add(`~${a}`));
      }
      // `PICK_FROM_TRASHED_CARDS` も**行き先をペイロードに持つ**型（2026-08-17・§6.4 O-11）＝
      // id だけでは手札／エナ／場出しを区別できない。`trashedPick.dest` から派生させる。
      const tp = action.trashedPick as { dest?: string } | undefined;
      if (tp?.dest === 'hand_or_field') { addDest('hand'); addDest('field'); }
      else addDest(tp?.dest);
    }
    // 行き先パラメータ由来の派生アクション
    if (action.type === 'LOOK_PICK_CHAIN' || action.type === 'REVEAL_AND_PICK') {
      (action.stages as Record<string, unknown>[] | undefined)?.forEach(st => {
        addDest(st.then);
        if (st.handOrEnergy) { addDest('hand'); addDest('energy'); }
      });
      addDest((action.remainder as Record<string, unknown> | undefined)?.location);
      if (action.handOrEnergy) { addDest('hand'); addDest('energy'); }
      if (action.handOrField)  { addDest('hand'); addDest('field'); }
    }
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

  // 深い走査（2026-08-16・§6.4 O-11）：STUB のペイロードが**本体アクションそのもの**を持つ形
  // （`PER_OWN_LRIG_COLOR_SCALE.scaleAction` / `unpaidAction` / `additionalCostChoices[].action` 等）は
  // 上の walk の固定キー辿りでは届かない。照合が気にする型だけを allowlist して全体を舐める。
  // ⚠EffectTarget / Condition の `type`（SIGNI / HAND_CARD / IS_MY_TURN …）とは名前が衝突しない。
  const RELEVANT = new Set(ACTION_KEYWORDS.flatMap(k => k.types).filter(t => !CONCEPT_LABELS.has(t)));
  const deep = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(deep); return; }
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (typeof o.type === 'string' && RELEVANT.has(o.type)) found.add(`~${o.type}`);
    Object.values(o).forEach(deep);
  };
  effs.forEach(e => deep(e.action));
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

  const effsRaw = effectsAll[cardNum] ?? [];
  // 付与能力（レイヤー等のabilities）もタイミング/コスト/アクション照合の対象に含める
  const effs = effsRaw.flatMap(e => [e, ...collectNestedAbilityEffects(e.action)]);

  // ─── 1. カード自体がeffects.jsonに存在しない（効果テキストあり） ───
  // 【ガード】のみの説明文はゲームエンジン不要（キーワード処理済み）なので除外
  // 【常】：【マルチエナ】はBattleScreen.tsxで処理済みなので、それのみなら除外
  const isGuardOnly = effectText && effectText !== '-'
    && /^【ガード】/.test(effectText)
    && !effectText.includes('【出】')
    && !effectText.includes('【起】')
    && !effectText.includes('【自】')
    && !/【常】(?!：【マルチエナ】)/.test(effectText);
  // 注釈（…）のみのテキストはルール説明であり効果定義不要:
  // - デュアルエナ「白か赤１つとして支払える」→ Color列「白赤」でエンジンが支払い判定
  // - ナナシ其ノ零ノ禍のゲーム開始時コイン → Coin列でゲーム開始時に付与
  // - トークン（リミットアッパー/バリア等）→ エンジン側機構（docs/STUBS.md参照）
  const isReminderOnly =
    effectText !== '' && effectText !== '-'
    && effectText.replace(/（[^（）]*）/g, '').trim() === '';
  const isToken = row['Type']?.trim() === 'トークン';
  if (effs.length === 0 && effectText && effectText !== '-' && !isGuardOnly && !isReminderOnly && !isToken) {
    addIssue(cardNum, cardName, '定義なし', `効果テキストあり(${effectText.substring(0, 40)}...)だがeffects.jsonにエントリーなし`);
    continue;
  }
  if ((isGuardOnly || isReminderOnly || isToken) && effs.length === 0) continue; // ガード/注釈のみ・トークン → 正常

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
  // 「「〜」を得る」『〜を得る』のような付与効果引用文内の【】は実際の効果ではないので除去
  // ネストした引用（「【起】…「【常】…」を得る。」等）に対応するため固定点まで繰り返す
  const stripQuoted = (t: string) => {
    let prev = t;
    let cur = t.replace(/「[^「」]*」/g, '').replace(/『[^『』]*』/g, '');
    while (cur !== prev) {
      prev = cur;
      cur = cur.replace(/「[^「」]*」/g, '').replace(/『[^『』]*』/g, '');
    }
    return cur;
  };
  // 【グロウ】条件テキスト（グロウ条件として書かれた非効果部分）を除去
  const stripGrow = (t: string) => t.replace(/【グロウ】[^【]*/g, '');
  // 【常】：【マルチエナ】はBattleScreen.tsxのEffectTextフォールバックで処理済みなので除去
  const stripMultiEner = (t: string) => t.replace(/【常】：【マルチエナ】/g, '');
  // 能力の参照テキスト（「の【起】能力」「【起】能力の」「【常】と【自】と【起】の能力」等）を除去
  // 実効果のマーカーは「【起】コスト：効果」形式で直後に「能力」「と【」「の能力」が続くことはない
  const stripAbilityRef = (t: string) => t
    .replace(/【(起|出|自|常)】(?=(【(起|出|自|常)】)*能力)/g, '$1') // 「【出】【起】能力」等の連鎖にも対応
    .replace(/【(起|出|自|常)】(?=と【)/g, '$1')
    .replace(/【(起|出|自|常)】(?=の能力)/g, '$1');

  // 注釈（…）はルール説明であり、中の【出】【自】等のマーカーは実効果ではないので除去
  const stripParensTiming = (t: string) => {
    let prev = t;
    let cur = t.replace(/（[^（）]*）/g, '');
    while (cur !== prev) { prev = cur; cur = cur.replace(/（[^（）]*）/g, ''); }
    return cur;
  };
  const cleanEffectText = stripMultiEner(stripAbilityRef(stripGrow(stripQuoted(stripParensTiming(effectText)))));
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
    // ⚠**【常】の2形は CONTINUOUS を持たないのが正しい**（2026-08-10 続き408 の仕分けで判明）：
    //   (a)「…あるかぎり、（このシグニ）は「【自】…」を得る」だけの【常】＝parser が **AUTO + activeCondition へ
    //      平坦化**する引用付与。CONTINUOUS を別途作らない。
    //   (b) カードが【常】と印字していても本文が「〜したとき」＝triggered（`WX11-063`/`WX11-064`）。
    //   どちらも「定義なし」ではないので誤検出になる。`_checkAllEffects.mjs` と同じ除外を掛ける。
    if (marker === '【常】' && matchedEffs.length === 0) {
      const maskedCont = effectText.replace(/[「『][^」』]*[」』]/g,
        m => /【[常自起]】/.test(m) ? 'GRANT' : 'Q');
      const contSentences = maskedCont.split(/(?=【[常自起出]】)/).filter(x => x.startsWith('【常】'));
      const grantOnly = contSentences.length > 0
        && contSentences.every(sent => /を得る/.test(sent) && sent.includes('GRANT'));
      const triggered = contSentences.length > 0
        && contSentences.every(sent => /(したとき|されたとき|するたび)/.test(sent));
      if (grantOnly || triggered) continue;
    }
    if (matchedEffs.length === 0) {
      addIssue(cardNum, cardName, 'タイミング',
        `"${marker}"が${count}件あるがeffects.jsonに対応するエフェクト(type=${type}${timing ? `, timing=${timing}` : ''})がない`);
    }
  }

  // ─── 4. コスト照合（【起】と有コスト【出】） ───
  // 「」内の付与能力引用文を除去（引用された【起】コストとの誤照合対策）
  const effectBlocks = splitEffects(effectText.replace(/「[^「」]*」/g, ''));
  for (const block of effectBlocks) {
    const isActivated = block.startsWith('【起】');
    const isOnPlay    = block.startsWith('【出】');
    if (!isActivated && !isOnPlay) continue;

    // コスト部（：の前）が純粋なコスト表記（《…》×Ｎの並び）でなければ、
    // 効果文中に紛れた【起】等の誤分割ブロックとみなしてスキップ
    const costPart = block.replace(/【[^】]+】/, '').split('：')[0].split('。')[0];
    if (/[^《》×０-９\d\s、,]/.test(costPart.replace(/《[^《》]*》/g, ''))) continue;

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
    const jsonMatched = candidateEffs.some(e => normCost(e.cost) === textCostStr);
    if (!jsonMatched) {
      const jsonCosts = candidateEffs.map(e => normCost(e.cost) || 'なし').join(' / ');
      addIssue(cardNum, cardName, 'コスト',
        `テキスト:"${textCostStr}" ≠ JSON:"${jsonCosts}" (${isActivated ? '起' : '出'})`);
    }
  }

  // ─── 5. 主要アクション照合 ───
  // （）で囲まれたキーワード説明文を除去（ランサー説明の「クラッシュ」等の誤検出対策）
  // ネスト括弧対応（「（【ランサー（パワー5000以下のシグニ）】を持つ…）」等は内→外の順で繰り返し除去）
  const stripParens = (t: string) => {
    let prev = t;
    let cur = t.replace(/（[^（）]*）/g, '');
    while (cur !== prev) { prev = cur; cur = cur.replace(/（[^（）]*）/g, ''); }
    return cur;
  };
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
  // 受動態「手札からトラッシュに置かれた」「捨てられた」はトリガー条件なので除去（DISCARD誤検出対策）
  const stripDiscardCtx = (t: string) => t.replace(/手札から[^。]*?(?:置かれ|捨てられ)[^、。]*/g, '');
  // アンコールコスト宣言文（「アンコール－手札から…捨てる」等）は追加コストなので除去（DISCARD誤検出対策）
  const stripEncoreCost = (t: string) => t.replace(/アンコール－[^。（]*/g, '');
  // 「この（アーツ|スペル|カード）を使用する際、…捨てる／支払う」＝**使用コストの宣言節**であって効果本体ではない。
  // コストの徴収はアーツ使用の支払い funnel が行い、action 側は `ARTS_COST_REDUCTION_BY_EFFECT`＝
  // 「コストは支払い時点で計算済み」の no-op になる（`execStubPart1.ts:772`）＝ここを本体として数えると
  // 必ず「捨てるはずが JSON に無い」と鳴る誤検出になる（2026-08-16・§6.4 O-11）。⚠アンコールコストと同じ扱い。
  const stripUseCost = (t: string) => t.replace(/この(?:アーツ|スペル|カード)を使用する際、[^。]*。?/g, '');
  const effectBody = stripCostParts(stripCrashCtx(stripDiscardCtx(stripUseCost(stripEncoreCost(stripBanishCtx(stripQuoted(stripParens(effectText))))))));
  const burstBody  = stripParens(burstText);
  const textActions = detectActionsFromText(effectBody + ' ' + burstBody);
  const jsonActions = collectActionsFromJson(effs);

  for (const { label, aliases } of textActions) {
    // aliasのどれかがJSONに存在すればOK。実装済みSTUBの同等物（STUB_EQUIVALENTS）も照合
    const matched = aliases.some(a => jsonActions.has(a) || jsonActions.has(`~${a}`))
      || [...jsonActions].some(j => j.startsWith('STUB:')
        && (STUB_EQUIVALENTS[j.slice(5)] ?? []).some(t => aliases.includes(t)));
    if (!matched) {
      const hasStub = jsonActions.has('STUB');
      const severity = hasStub ? '[STUB代替?]' : '[要確認]';
      addIssue(cardNum, cardName, `アクション${severity}`,
        `テキストから"${label}"が期待されるがJSONに存在しない (JSONアクション: ${[...jsonActions].filter(a=>a!=='SEQUENCE'&&a!=='STUB'&&!a.startsWith('STUB:')&&!a.startsWith('~')).join(', ')||'なし'}${[...jsonActions].some(a=>a.startsWith('~'))?' / 派生: '+[...jsonActions].filter(a=>a.startsWith('~')).join(', '):''}${[...jsonActions].some(a=>a.startsWith('STUB:'))?' / STUB: '+[...jsonActions].filter(a=>a.startsWith('STUB:')).map(a=>a.slice(5)).join(', '):''})`);
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
// 注意: STUBアクションを含むカード数であり「未実装」を意味しない。実装状況はdocs/STUBS.mdを参照。
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
