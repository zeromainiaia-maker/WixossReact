/**
 * 🆕**遊ぶための CPU デッキを組む**（2026-10-21・ユーザー要望「CPU デッキがたくさんあると楽しい」）。
 *
 * 使い方：
 *   npx tsx scripts/buildCpuDecks.ts [--format diva|legacy|both] [--out scratchpad-cpudecks] [--only <ルリグタイプ>]
 *   → <out>/decks_cpu.json を書く ⇒ 自己対戦で止まらないか確かめる（`npm run selfplay:inv -- --deck-dir <out>`）
 *   ⇒ `node scripts/importDecks.mjs --from <out>/decks_cpu.json --kinds cpu --to claude1 --apply`
 *
 * ■ 組み方（ユーザー指示）＝**ルリグ（ルリグタイプ）ごとに1つ、軸のカードを1枚決めて、それを中心に組む**。
 *   ディーバとレガシーは分ける（デッキのフォーマットを明示し、名前の先頭にも書く）。
 *   - **ルリグ**＝その系統の Lv0 から最上位まで、色をそろえて1枚ずつ。ディーバは同じチームのアシストルリグを2系統
 *     （チームが無ければ色の合う系統）。
 *   - **軸**＝そのルリグの**限定カード**を最優先に、色の合う高レベルのシグニ・スペルから1枚（4枚入れる）。
 *     軸のクラスを主題にし、軸が名前で参照する相方（2枚）・参照するクラス（8体以上）も入れる。
 *   - **残り**＝レベル帯（Lv1/2/3 を約10枚ずつ）をそろえ、主題のクラス → 強さ（`cardStrength`）の順に埋める。ライフバーストは20枚まで。
 *   - **ルリグデッキの残り**＝アーツ（限定が合うもの優先）。ディーバはチームのピースも1枚。
 * 🔴**`selfplay:ab` の山ではない**（強さの測定に混ぜない）。⚠**強いデッキではない**＝遊ぶための形のそろった山。
 */
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData } from '../src/types';
import type { CardEffect } from '../src/types/effects';
import { meetsRestriction } from '../src/screens/battle/growLogic';
import { cardStrength } from '../src/screens/battle/cpuCardStrength';
import { defensiveKindOf, cpuCanPayArtsWithEnergyOnly } from '../src/screens/battle/cpuArts';
import { cardPoolsOf } from '../src/utils/deckFormat';
import { buildVariantNumIndex } from '../src/utils/cardSearch';
import { deckLrigSetupProblem } from '../src/utils/deckLrigSetup';
import { LB_MAX, LRIG_MAX, isExtraLrigCard, isTeamPieceCard } from '../src/utils/deckBuildLimits';
import { cardCsvRelPaths } from './cardDataFiles.mjs';

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const OUT_DIR = arg('--out', 'scratchpad-cpudecks');
const FORMATS = arg('--format', 'both') === 'both' ? ['diva', 'legacy'] : [arg('--format', 'both')];
const ONLY = arg('--only', '');
/** 🆕ルリグ1つにつき軸を変えた候補をいくつ組むか（戦わせて強いものを採用する＝`scripts/pickCpuDecks.ts`）。 */
const CANDIDATES = Number(arg('--candidates', '1'));

// ── カード（再録・別絵柄・トークンは除く）──
const cards: CardData[] = [];
const variantCards: CardData[] = [];
for (const f of cardCsvRelPaths()) {
  if (/_TK\.csv$/.test(f)) continue;
  if (/_Variants\.csv$/.test(f)) {
    const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(join('public/data', f), 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
    for (const r of data) if (r.CardNum?.trim()) variantCards.push(r as unknown as CardData);
    continue;
  }
  const p = join('public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) if (r.CardNum?.trim()) cards.push(r as unknown as CardData);
}
const effectsOf = new Map<string, CardEffect[]>();
for (const f of fs.readdirSync('public/data').filter(x => /^effects_.*\.json$/.test(x))) {
  for (const [num, effs] of Object.entries(JSON.parse(fs.readFileSync(join('public/data', f), 'utf-8')))) effectsOf.set(num, effs as CardEffect[]);
}
for (const c of cards) (c as { effects?: CardEffect[] }).effects = effectsOf.get(c.CardNum) ?? [];
const cardMap = new Map(cards.map(c => [c.CardNum, c]));
const byName = new Map<string, CardData[]>();
for (const c of cards) (byName.get(c.CardName) ?? byName.set(c.CardName, []).get(c.CardName)!).push(c);

const lv = (c: CardData) => parseInt(c.Level ?? '', 10);
// 🔴**プールは再録も見る**（`utils/deckFormat.ts`）＝本体がレガシー番号でもディーバ期の再録がある札（タマ・ピルルク等の
//   センタールリグ群）はディーバで使える。本体の番号だけで見るとディーバの主要ルリグ20系統が組めなかった。
const variantIndex = buildVariantNumIndex(variantCards);
const inPool = (c: CardData, pool: string) => cardPoolsOf(c, variantIndex)[pool as 'diva' | 'legacy'];
const colorsOf = (c: CardData) => [...(c.Color ?? '')].filter(ch => '白赤青緑黒'.includes(ch));
const textOf = (c: CardData) => `${c.EffectText ?? ''}\n${c.BurstText ?? ''}`;
/** 言葉ごとの出現カード数（全カード）＝主題の仕組みの言葉が「全体では珍しい」かを測る。 */
const globalDf = new Map<string, number>();
for (const c of cards) for (const t of new Set([...`${c.EffectText ?? ''}
${c.BurstText ?? ''}`.matchAll(/【[^】]+】|[ァ-ヶー]{3,}|[一-龥]{1,3}状態/g)].map(m => m[0]))) globalDf.set(t, (globalDf.get(t) ?? 0) + 1);
const classesOf = (c: CardData) => (c.CardClass ?? '').split(/[/／]/).map(s => s.split(/[：:]/).pop()!.trim()).filter(Boolean);
const classRefs = (c: CardData) => [...textOf(c).matchAll(/＜([^＞]+)＞/g)].map(m => m[1]);
const nameRefs = (c: CardData) => [...textOf(c).matchAll(/《([^》]+)》(?!以外)/g)].map(m => m[1]).filter(n => byName.has(n) && n !== c.CardName);
const strengthRaw = (c: CardData) => cardStrength(c, effectsOf.get(c.CardNum) ?? [], 'deploy');
/**
 * 🆕2026-10-23 `--kb`＝**カード知識ベース（`src/data/cardKnowledge.json`＝Claude が1枚ずつ効果を読んで書いた解説・相性・評価値）で選ぶ**
 *   （ユーザー指示「カードの説明書をもとに CPU 用デッキを作る」）。
 *   強さ＝評価値 `v`（パワー換算）／相性＝`syn`（name:／class:／mech:）で、ルリグ・軸・入れた札とつながる札を先に入れる。
 */
const KB = argv.includes('--kb');
interface Kb { s: string; role?: string[]; when?: string; syn?: string[]; v?: number }
const kb: Record<string, Kb> = KB ? JSON.parse(fs.readFileSync('src/data/cardKnowledge.json', 'utf-8')) : {};
const strength = (c: CardData) => (KB && typeof kb[c.CardNum]?.v === 'number' ? kb[c.CardNum].v! : strengthRaw(c));
const synOf = (c: CardData, kind: string) => (kb[c.CardNum]?.syn ?? []).filter(s => s.startsWith(`${kind}:`)).map(s => s.slice(kind.length + 1));
/** デッキの文脈（ルリグ・軸・入れた札）の名前・クラス・仕組みの集合。 */
interface KbCtx { names: Set<string>; wantNames: Set<string>; classes: Set<string>; mechs: Set<string> }
function kbCtxOf(cs: CardData[]): KbCtx {
  const ctx: KbCtx = { names: new Set(), wantNames: new Set(), classes: new Set(), mechs: new Set() };
  for (const c of cs) {
    ctx.names.add(c.CardName);
    for (const n of synOf(c, 'name')) ctx.wantNames.add(n);
    for (const cl of synOf(c, 'class')) ctx.classes.add(cl);
    for (const m of synOf(c, 'mech')) ctx.mechs.add(m);
  }
  return ctx;
}
/** 札 c が文脈とどれだけつながるか（名前で呼び合う 3／仕組みが同じ 2（2つまで）／クラス 1）。 */
function kbSyn(c: CardData, ctx: KbCtx): number {
  let s = 0;
  if (ctx.wantNames.has(c.CardName)) s += 3;
  if (synOf(c, 'name').some(n => ctx.names.has(n))) s += 3;
  s += 2 * Math.min(2, synOf(c, 'mech').filter(m => ctx.mechs.has(m)).length);
  if (classesOf(c).some(cl => ctx.classes.has(cl)) || synOf(c, 'class').some(cl => ctx.classes.has(cl))) s += 1;
  return s;
}
const kbHand = (c: CardData) => (kb[c.CardNum]?.role ?? []).some(r => r === 'ドロー' || r === 'サーチ' || r === '回収');
/**
 * 手札を増やす札か（ドロー・デッキ/トラッシュから手札へ）。
 * 🔑実測（ミュウ vs ナナシテスト用）＝生成デッキは終盤にエナが14〜17枚余ったまま手札が尽き、シグニを1ターン1体しか出せていなかった。
 *   基準デッキは【出】のドローや回収で手札を保っている＝主題・仕組みが同点なら手札を増やす札を先に入れる。
 */
const HAND_GAIN = /"type":"(DRAW|ADD_TO_HAND|TRANSFER_TO_HAND|SEARCH|REVEAL_AND_PICK|LOOK_PICK_CHAIN)"/;
const handGain = (c: CardData) => HAND_GAIN.test(JSON.stringify(effectsOf.get(c.CardNum) ?? []));
const hasLB = (c: CardData) => c.LifeBurst === '1' || !!(c.BurstText && c.BurstText !== '-');
const toAscii = (t: string) => t.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
const coinNeed = (c: CardData) => [...toAscii(c.Cost ?? '').matchAll(/《コイン(?:アイコン)?》×([0-9]+)/g)].reduce((t, m) => t + Number(m[1]), 0);
const MAIN_TYPES = new Set(['シグニ', 'スペル']);
/** 主題の仕組みの言葉から外す、どのカードにも出てくる語。 */
const GENERIC_TERMS = new Set(['【出】', '【自】', '【常】', '【起】', '【ガード】', '【マルチエナ】', '【ライフバースト】', '【エナチャージ１】', '【エナチャージ２】',
  'ターン', 'シグニ', 'ルリグ', 'パワー', 'トラッシュ', 'エナゾーン', 'ライフクロス', 'センタールリグ', 'アタック', 'バニッシュ', 'スペル', 'アーツ', 'カード', 'デッキ', 'シャッフル', 'ダウン状態', 'アップ状態', 'シグニゾーン', 'アタックフェイズ', 'メインフェイズ', 'クラス', 'レベル', 'コスト', 'ダメージ', 'ゲーム']);
/** 🆕2026-10-21＝【ガード】を持つシグニ（サーバント等）。⚠旧版は強さ順で枠を埋めていたので1枚も入らなかった（ユーザー指摘「サーバントが入っていなくて弱い」）。 */
const isGuard = (c: CardData) => c.Guard === '1';
/** ガードの枚数（実戦のデッキはおおむね8枚＝ユーザーの基準デッキ「ナナシテスト用」も8枚）。 */
const GUARDS = Number(arg('--guards', '8'));
/**
 * 🆕2026-10-21＝**レガシーはルリグデッキにキーを1枚入れる**（ユーザーの基準デッキ「ナナシテスト用」は《いっしょにあーや！》でルリグのアタックを何度も無効にしていた）。
 * 🔑キーの色は問わない（コストはコイン＝エナの色を要求するキーだけ色を見る）。CPU は【起】を使いこなせないので、
 *   **持っているだけで働く（【常】【自】だけの）キー**を先にする。`--keys N`＝キーを変えた候補をいくつ組むか。
 */
const KEY_VARIANTS = Number(arg('--keys', '1'));

interface Line { type: string; cards: CardData[]; colors: Set<string>; team: string }
/** ルリグタイプ1つの系統（Lv0 → 最上位）。`kind`＝センター（ルリグ）／アシスト（アシストルリグ）。 */
function lineOf(type: string, pool: string, kind: 'ルリグ' | 'アシストルリグ'): Line | null {
  const same = cards.filter(c => c.CardClass === type && inPool(c, pool));
  const lv0s = same.filter(c => c.Type === 'ルリグ' && lv(c) === 0);
  if (lv0s.length === 0) return null;
  const ups = same.filter(c => c.Type === kind && lv(c) >= 1);
  if (ups.length === 0) return null;
  const colorCount = new Map<string, number>();
  for (const c of ups) for (const ch of colorsOf(c)) colorCount.set(ch, (colorCount.get(ch) ?? 0) + 1);
  // 🆕2026-10-21＝**レガシーは色を1つに決め、グロウコストをその色（と無色）で払えるルリグだけで系統を組む**。
  //   ⚠旧＝レベルごとに「一番多い色を持つか」で並べるだけだった＝タウィルの Lv1〜3 に赤青緑の《リワト》が入り、グロウに緑・青のエナが要るのに
  //   メインデッキは赤＝グロウできずに止まって10戦全敗だった。⇒ 色ごとに系統を組んでみて、一番高いレベルまで届く色を採る（同じなら多い色）。
  const build = (main: string | undefined) => {
    const growColorsOk = (c: CardData) => pool !== 'legacy' || [...(c.GrowCost ?? '').matchAll(/《([白赤青緑黒])》×([０-９0-9]+)/g)]
      .every(m => m[1] === main || toAscii(m[2]) === '0');
    // Lv0 はその色か無色（旧＝最初に見つかった Lv0＝サシェに《ＲｉＲｉ》が入った）
    const lv0 = [...lv0s].sort((a, b) => Number(colorsOf(b).includes(main ?? '')) - Number(colorsOf(a).includes(main ?? ''))
      || Number(colorsOf(b).length === 0) - Number(colorsOf(a).length === 0))[0];
    const line = [lv0];
    for (let l = 1; l <= 5; l++) {
      const atL = ups.filter(c => lv(c) === l && growColorsOk(c) && (pool !== 'legacy' || colorsOf(c).includes(main ?? '')));
      if (atL.length === 0) break;
      atL.sort((a, b) => Number(colorsOf(b).includes(main ?? '')) - Number(colorsOf(a).includes(main ?? ''))
        || Number((b.Team ?? '-') === (lv0.Team ?? '-')) - Number((a.Team ?? '-') === (lv0.Team ?? '-'))
        // 🆕2026-10-21＝コインを持つルリグを先に（レガシーはコインでキーを出す＝旧版は90デッキ中54がコイン不足でコイン不要のキーしか選べなかった）
        || (parseInt(b.Coin ?? '', 10) || 0) - (parseInt(a.Coin ?? '', 10) || 0));
      line.push(atL[0]);
    }
    return line;
  };
  const colorsByCount = [...colorCount].sort((a, b) => b[1] - a[1]).map(([ch]) => ch);
  const tries = pool === 'legacy' ? colorsByCount : colorsByCount.slice(0, 1);
  let main = tries[0];
  let line = build(main);
  for (const ch of tries.slice(1)) {
    const l = build(ch);
    if (lv(l.at(-1)!) > lv(line.at(-1)!)) { line = l; main = ch; }
  }
  if (line.length < 2) return null;
  const lv0 = line[0];
  return { type, cards: line, colors: pool === 'legacy' && main ? new Set([main]) : new Set(line.flatMap(colorsOf)), team: lv0.Team && lv0.Team !== '-' ? lv0.Team : '' };
}

interface Core { pool: string; center: Line; assists: Line[]; classes: string[]; colors: Set<string>; team: string }
function coreOf(type: string, pool: string): Core | null {
  const center = lineOf(type, pool, 'ルリグ');
  if (!center || !center.cards.some(c => lv(c) >= 3)) return null;
  const assists: Line[] = [];
  if (pool === 'diva') {
    const types = [...new Set(cards.filter(c => c.Type === 'アシストルリグ' && inPool(c, pool)).map(c => c.CardClass ?? ''))].filter(t => t && t !== type);
    const all = types.map(t => lineOf(t, pool, 'アシストルリグ')).filter((l): l is Line => !!l)
      .filter(l => !l.type.split(/[/／]/).some(t => type.split(/[/／]/).includes(t)));
    const mates = center.team ? all.filter(l => l.team === center.team) : [];
    const sameColor = (l: Line) => [...l.colors].some(ch => center.colors.has(ch));
    const pickFrom = [...mates, ...all.filter(l => !mates.includes(l) && sameColor(l))];
    for (const l of pickFrom) {
      if (assists.length >= 2) break;
      if (assists.some(a => a.type === l.type)) continue;
      assists.push(l);
    }
    if (assists.length < 2) return null;
  }
  // ⚠3系統でルリグデッキの上限（10）を超えるときは、センターの最上位レベルを外す（Lv3 は残す）。
  //   例＝ディーバのタマ（センター Lv0〜4 の5枚＋アシスト3枚×2＝11枚）。
  while (center.cards.length + assists.reduce((t, a) => t + a.cards.length, 0) > LRIG_MAX && lv(center.cards.at(-1)!) > 3) center.cards.pop();
  if (center.cards.length + assists.reduce((t, a) => t + a.cards.length, 0) > LRIG_MAX) return null;
  const lines = [center, ...assists];
  return {
    pool, center, assists, classes: lines.map(l => l.type),
    colors: new Set(lines.flatMap(l => [...l.colors])),
    team: assists.length === 2 && assists.every(a => a.team && a.team === center.team) ? center.team : '',
  };
}

/**
 * 🆕2026-10-21＝**構築済みデッキ（WD／WDK／WDA）の札**＝メーカーがそのルリグ用に仕組みをそろえて作った札。
 *   🔑基準デッキ「ナナシテスト用」の中身の大半は WD19（ナナシの構築済み）の札だった。手作りの規則（クラス・仕組みの言葉）では届かなかった。
 *   そのルリグタイプの Lv0〜のルリグを含む構築済みのセットを探し、そこのシグニ・スペルを優先する（色・限定は `fitsMain` で絞る）。
 */
const setOf = (num: string) => num.split('-').slice(0, /^WXDi|^WX2[4-9]/.test(num) ? 2 : 1).join('-');
const starterSetsOf = (type: string) => new Set(cards.filter(c => c.Type === 'ルリグ' && c.CardClass === type && /^WD(K|A)?\d|^WDA/.test(setOf(c.CardNum))).map(c => setOf(c.CardNum)));
const coreCoins = (core: Core) => [core.center, ...core.assists].flatMap(l => l.cards).reduce((t, c) => t + (parseInt(c.Coin ?? '', 10) || 0), 0);
const restrictionOk = (c: CardData, core: Core) => core.classes.some(cls => meetsRestriction(c.Restriction ?? '-', cls));
/** そのルリグの**限定カード**（「タマ限定」など）か＝軸の第一候補。 */
const restrictedTo = (c: CardData, core: Core) => !!c.Restriction && c.Restriction !== '-' && meetsRestriction(c.Restriction, core.center.type);
const colorOk = (c: CardData, core: Core) => colorsOf(c).every(ch => core.colors.has(ch));
const fitsMain = (c: CardData, core: Core) => MAIN_TYPES.has(c.Type) && inPool(c, core.pool) && colorOk(c, core) && restrictionOk(c, core) && coinNeed(c) <= coreCoins(core);
const fitsLrigSide = (c: CardData, core: Core) => ['アーツ', 'ピース'].includes(c.Type) && inPool(c, core.pool) && colorOk(c, core)
  && restrictionOk(c, core) && coinNeed(c) <= coreCoins(core)
  && (!c.Team || c.Team === '-' || c.Team === core.team)
  && (!isTeamPieceCard(c) || !!core.team);

/**
 * CPU が実際に撃つアーツか＝無効化 3／除去 2／軽減 1／それ以外 0（`cpuArts.ts` の分類と同じ）。
 * 🔑CPU は**この3分類のアーツしか使わない**＝それ以外を入れるとルリグデッキの枠が死に札になる。
 * ⚠エナ以外のコストを必ず払う札は CPU が撃てないので 0。
 */
const ARTS_USE: Record<string, number> = { negate: 3, removal: 2, prevent: 1 };
function artsUse(c: CardData): number {
  if (c.Type !== 'アーツ') return 0;
  const effs = ((c as { effects?: CardEffect[] }).effects ?? []);
  if (!cpuCanPayArtsWithEnergyOnly(effs)) return 0;
  let best = 0;
  for (const e of effs) if (e.effectType === 'ACTIVATED') { const k = defensiveKindOf(e.action); if (k) best = Math.max(best, ARTS_USE[k]); }
  return best;
}
/** 使うのに要るエナの枚数（《白×0》のような軽減前の表記どおり）。 */
const energyCost = (c: CardData) => [...(c.Cost ?? '').matchAll(/《[^》]+》×([0-9０-９]+)/g)]
  .reduce((s, m) => s + Number(m[1].replace(/[０-９]/g, d => String(d.charCodeAt(0) - 0xFF10))), 0);

/** 軸に使った回数（カード名）＝別のデッキでは別の軸を選ぶ。 */
const axisUsed = new Map<string, number>();
const keyCostOk = (c: CardData, core: Core) => [...(c.Cost ?? '').matchAll(/《([白赤青緑黒])》/g)].every(m => core.colors.has(m[1]));
/** そのデッキで使えるキーを良さそうな順に（ルリグの名前を持つキー → 持っているだけで働くキー → 強さ）。 */
function keysFor(core: Core, fit: (c: CardData) => number = () => 0): CardData[] {
  if (core.pool !== 'legacy') return [];
  const passive = (c: CardData) => !/【起】/.test(c.EffectText ?? '') || /センタールリグは以下の能力を得る。【自】/.test(c.EffectText ?? '');
  const sameColor = (c: CardData) => colorsOf(c).length > 0 && colorsOf(c).every(ch => core.center.colors.has(ch));
  return cards.filter(c => c.Type === 'キー' && inPool(c, core.pool) && restrictionOk(c, core) && keyCostOk(c, core) && coinNeed(c) <= coreCoins(core)
      && !/場に出すことができない|場に出せない/.test(c.EffectText ?? ''))
    // 🔑ユーザー指示（2026-10-21）「キーは100種類くらいある＝デッキに合ったキーを使ってほしい」＝同じキーを全デッキに配らない。
    //   ルリグの名前のキー → デッキと同じ色のキー → 持っているだけで働くキー → 強さ。候補を `--keys N` 本ずつ作って戦わせて選ぶ。
    //   🔑ユーザー指摘（同日）「名前が同じキーはそんなに相性が良くないかも」＝ルリグ名は見ない。**デッキの中身との噛み合い**（`fit`）を先にする。
    .sort((a, b) => fit(b) - fit(a) || Number(sameColor(b)) - Number(sameColor(a))
      || Number(passive(b)) - Number(passive(a)) || strength(b) - strength(a));
}
function buildDeck(core: Core, rank = 0, keyRank = 0, fixedAxis?: CardData) {
  const lrigLines = [core.center, ...core.assists];
  const lrigDeck: string[] = lrigLines.flatMap(l => l.cards.map(c => c.CardNum));
  const main: string[] = [];
  const count = (n: string) => main.filter(x => x === n).length;
  const lbCount = () => main.filter(n => hasLB(cardMap.get(n)!)).length;
  const addMain = (c: CardData, n: number) => {
    let k = Math.min(n, 4 - count(c.CardNum), 40 - main.length);
    if (hasLB(c)) k = Math.min(k, LB_MAX - lbCount());
    for (let i = 0; i < k; i++) main.push(c.CardNum);
    return k > 0;
  };
  // ── 軸 ──
  // 🔑軸は「そのルリグの限定カード」か「センタールリグの色を持つカード」だけ（無色の汎用札が全デッキの軸になるのを防ぐ）。
  //   別のデッキで軸にした札は後回し（デッキごとに違う軸にする）。
  const centerColor = (c: CardData) => colorsOf(c).some(ch => core.center.colors.has(ch));
  // 🆕2026-10-21＝軸のシグニはレベル4まで（試合は7〜9ターンで決着する＝Lv5 のシグニはほぼ場に出ない。ナナシで Lv5 軸 0勝 → Lv4 軸 2勝/10）。
  const AXIS_MAX_LV = Number(arg('--axis-max-lv', '4'));
  const axisCands = cards.filter(c => fitsMain(c, core) && (c.Type === 'スペル' || (lv(c) >= 3 && lv(c) <= AXIS_MAX_LV)) && (effectsOf.get(c.CardNum)?.length ?? 0) > 0
    && (restrictedTo(c, core) || centerColor(c)));
  const lrigCtx = kbCtxOf(lrigLines.flatMap(l => l.cards));
  axisCands.sort((a, b) => Number(restrictedTo(b, core)) - Number(restrictedTo(a, core))
    || (KB ? kbSyn(b, lrigCtx) - kbSyn(a, lrigCtx) : 0)
    || (axisUsed.get(a.CardName) ?? 0) - (axisUsed.get(b.CardName) ?? 0)
    || (b.Type === 'シグニ' ? lv(b) : 3) - (a.Type === 'シグニ' ? lv(a) : 3)
    || strength(b) - strength(a));
  // ⚠キーだけを変えた候補は軸を固定する（使用回数で並びが変わるため）。
  const axis = fixedAxis ?? axisCands[rank];
  if (!axis) return null;
  addMain(axis, 4);
  if (!fixedAxis) axisUsed.set(axis.CardName, (axisUsed.get(axis.CardName) ?? 0) + 1);
  const classDemand = new Map<string, number>();
  const demandFrom = (c: CardData) => { for (const cls of classRefs(c)) if (cards.some(x => x.Type === 'シグニ' && classesOf(x).includes(cls))) classDemand.set(cls, Math.max(classDemand.get(cls) ?? 0, 8)); };
  const addPartners = (c: CardData) => {
    for (const nm of nameRefs(c)) {
      const cand = (byName.get(nm) ?? []).filter(x => inPool(x, core.pool));
      const m = cand.find(x => fitsMain(x, core));
      if (m) { if (addMain(m, 2)) demandFrom(m); continue; }
      const l = cand.find(x => fitsLrigSide(x, core));
      // ⚠ルリグデッキに空きがあるときだけ（ディーバは3系統でほぼ埋まる＝足すと11枚で組めなくなる）
      const lrigRoom = isExtraLrigCard(l ?? ({} as CardData)) ? lrigDeck.filter(n => isExtraLrigCard(cardMap.get(n)!)).length < 2
        : lrigDeck.filter(n => !isExtraLrigCard(cardMap.get(n)!)).length < LRIG_MAX;
      if (l && lrigRoom && !lrigDeck.includes(l.CardNum)) lrigDeck.push(l.CardNum);
    }
  };
  demandFrom(axis); addPartners(axis);
  // 主題のクラス＝軸のクラス（スペルなら参照しているクラス）のうち、組める枚数が一番多いもの
  const themeCands = axis.Type === 'シグニ' ? classesOf(axis) : classRefs(axis);
  const fitCount = (cls: string) => cards.filter(x => x.Type === 'シグニ' && fitsMain(x, core) && classesOf(x).includes(cls)).length;
  const theme = [...themeCands].sort((a, b) => fitCount(b) - fitCount(a))[0] ?? '';
  if (theme) classDemand.set(theme, Math.max(classDemand.get(theme) ?? 0, 16));
  const inTheme = (c: CardData) => !!theme && classesOf(c).includes(theme);
  // ── ガード（8枚）＝レベル1とレベル2から1種類ずつ×4枚（基準デッキと同じ形）→ 足りなければ他のレベル。主題のクラス → センターの色 → 強さの順 ──
  //   ⚠Lv4 のサーバント（Q3/Q4）は序盤に場に出せず手札で腐る＝後回し。
  const guardCount = () => main.filter(n => isGuard(cardMap.get(n)!)).length;
  const guardPool = cards.filter(x => x.Type === 'シグニ' && isGuard(x) && fitsMain(x, core) && lv(x) >= 1)
    .sort((a, b) => Number(inTheme(b)) - Number(inTheme(a)) || Number(centerColor(b)) - Number(centerColor(a)) || strength(b) - strength(a));
  for (const l of [1, 2]) {
    const g = guardPool.find(x => lv(x) === l && count(x.CardNum) === 0);
    if (g && guardCount() < GUARDS) addMain(g, Math.min(4, GUARDS - guardCount()));
  }
  for (const g of [...guardPool].sort((a, b) => lv(a) - lv(b))) {
    if (guardCount() >= GUARDS) break;
    addMain(g, Math.min(4, GUARDS - guardCount()));
  }
  // ── 主題の仕組み（2026-10-21）＝主題のクラスの札に多く出てきて、全体では珍しい言葉（【ウィルス】・感染状態 など）。それを使う札を優先する ──
  //   🔑基準デッキ（ナナシテスト用）は「ウィルスを置く札」と「感染状態を弱める札」で固めてあり、クラスだけそろえた山は10戦全敗だった。
  const tokensOf = (c: CardData) => new Set([...textOf(c).matchAll(/【[^】]+】|[ァ-ヶー]{3,}|[一-龥]{1,3}状態/g)].map(m => m[0])
    .filter(t => !GENERIC_TERMS.has(t)));
  const themePool = cards.filter(x => x.Type === 'シグニ' && fitsMain(x, core) && inTheme(x));
  const themeDf = new Map<string, number>();
  for (const c of themePool) for (const t of tokensOf(c)) themeDf.set(t, (themeDf.get(t) ?? 0) + 1);
  const mechTerms = new Set([...themeDf].filter(([t, n]) => themePool.length > 0 && n / themePool.length >= 0.15 && n >= 3
    && n / themePool.length >= 4 * ((globalDf.get(t) ?? 0) / cards.length)).map(([t]) => t));
  const starterSets = starterSetsOf(core.center.type);
  const fromStarter = (c: CardData) => starterSets.has(setOf(c.CardNum));
  const synergy = (c: CardData) => Math.min(2, [...tokensOf(c)].filter(t => mechTerms.has(t)).length);
  // ── レベル帯の枠（Lv1/2/3 を10枚ずつ・Lv4 以上は軸を含めて6枚・スペル4枚まで）の中で、主題 → 参照されたクラス → 強さの順に埋める ──
  //   ⚠旧＝主題のクラスを強さ順で先に埋めていた＝高レベルの札ばかり入り、Lv3 が1枚・Lv4 以上が16枚の山になった。
  const lvOf = (n: string) => { const c = cardMap.get(n)!; return c.Type === 'スペル' ? -1 : Math.min(lv(c), 4); };
  const slotCount = (l: number) => main.filter(n => lvOf(n) === l).length;
  //   🆕ガードもレベルの枠に数える（サーバントは Lv1〜2）＝Lv1/Lv2 の枠を広げてある。
  //   🆕2026-10-21＝基準デッキの形＝Lv1 12・Lv2 12（各4枚はガード）・Lv3 8・Lv4 以上 4（軸）・スペル 4。**どの札も4枚**（種類を絞って安定させる）。
  const SLOTS: [number, number][] = [[1, 12], [2, 12], [3, 8], [4, 4], [-1, 4]];
  let ctx = kbCtxOf([]);
  const wanted = (c: CardData) => KB
    ? kbSyn(c, ctx) * 3 + (fromStarter(c) ? 2 : 0) + (kbHand(c) ? 2 : 0) + (inTheme(c) ? 2 : 0) + strength(c) / 3000
    : (fromStarter(c) ? 3 : 0) + synergy(c) * 3 + (handGain(c) ? 3 : 0) + (inTheme(c) ? 2 : 0) + ([...classDemand.keys()].some(cls => classesOf(c).includes(cls)) ? 1 : 0);
  const refreshCtx = () => { ctx = kbCtxOf([...lrigLines.flatMap(l => l.cards), ...new Set(main)].map(n => typeof n === 'string' ? cardMap.get(n)! : n)); };
  for (const [l, cap] of SLOTS) {
    refreshCtx();
    for (const c of cards.filter(x => fitsMain(x, core) && (l === -1 ? x.Type === 'スペル' : x.Type === 'シグニ' && Math.min(lv(x), 4) === l && lv(x) >= 1))
      .sort((a, b) => wanted(b) - wanted(a) || strength(b) - strength(a))) {
      if (slotCount(l) >= cap || main.length >= 40) break;
      if (isGuard(c) && guardCount() >= GUARDS) continue;
      if (addMain(c, Math.min(4, cap - slotCount(l)))) addPartners(c);
    }
  }
  // 足りなければ（色・限定が狭い）どのレベルでも埋める
  refreshCtx();
  for (const c of cards.filter(x => fitsMain(x, core) && x.Type === 'シグニ' && lv(x) >= 1 && lv(x) <= 3).sort((a, b) => wanted(b) - wanted(a) || strength(b) - strength(a))) {
    if (main.length >= 40) break;
    if (isGuard(c) && guardCount() >= GUARDS) continue;
    addMain(c, 4);
  }
  if (main.length < 40) return null;
  const mech = [...mechTerms];
  // ── キー（レガシー）──
  // キーとデッキの噛み合い＝キーの文に、主題のクラス・仕組みの言葉・デッキの札のクラスが出てくる数。
  //   ⚠ガード（サーバント＝＜精元＞）のクラスは数えない＝全デッキにあるので、＜精元＞を参照するキーが全デッキで1位になった。
  const deckClasses = new Set(main.filter(n => !isGuard(cardMap.get(n)!)).flatMap(n => classesOf(cardMap.get(n)!)).filter(cls => cls !== '精元'));
  const keyFit = (k: CardData) => (theme && textOf(k).includes(`＜${theme}＞`) ? 2 : 0)
    + [...mechTerms].filter(t => textOf(k).includes(t)).length * 2
    + classRefs(k).filter(cls => deckClasses.has(cls)).length
    + (KB ? kbSyn(k, kbCtxOf([...lrigLines.flatMap(l => l.cards), ...new Set(main.map(n => cardMap.get(n)!))])) : 0);
  const keys = keysFor(core, keyFit);
  const key = keys[keyRank];
  if (keys.length > 0 && !key) return null;
  if (key) lrigDeck.push(key.CardNum);
  // ── ルリグデッキの残り（アーツ・ピース）──
  const nonExtra = () => lrigDeck.filter(n => !isExtraLrigCard(cardMap.get(n)!)).length;
  const extra = () => lrigDeck.filter(n => isExtraLrigCard(cardMap.get(n)!)).length;
  const lrigSide = cards.filter(c => fitsLrigSide(c, core) && !lrigDeck.includes(c.CardNum))
    .sort((a, b) => artsUse(b) - artsUse(a) || Number(restrictedTo(b, core)) - Number(restrictedTo(a, core))
      || (KB ? strength(b) - strength(a) : 0)
      || energyCost(a) - energyCost(b) || strength(b) - strength(a));
  const usedNames = new Set(lrigDeck.map(n => cardMap.get(n)!.CardName));
  for (const c of lrigSide) {
    if (usedNames.has(c.CardName)) continue;
    if (isExtraLrigCard(c)) {
      if (extra() >= 2 || (isTeamPieceCard(c) && lrigDeck.some(n => isTeamPieceCard(cardMap.get(n)!)))) continue;
    } else if (nonExtra() >= LRIG_MAX) continue;
    lrigDeck.push(c.CardNum); usedNames.add(c.CardName);
  }
  if (nonExtra() > LRIG_MAX) return null;
  const roles = { centerLrig: core.center.cards[0].CardNum, assistLrigL: core.assists[0]?.cards[0].CardNum ?? null, assistLrigR: core.assists[1]?.cards[0].CardNum ?? null };
  if (deckLrigSetupProblem({ ...roles, lrigDeck }, cardMap)) return null;
  const formatJa = core.pool === 'diva' ? 'ディーバ' : 'レガシー';
  return {
    name: `${formatJa}／${core.center.type}／${axis.CardName}軸${key && keyRank > 0 ? `／${key.CardName}` : ''}`, _rank: rank, _key: key?.CardName ?? null, _lrigType: core.center.type, deck_kind: 'cpu', deck_format: core.pool,
    main_deck: main, lrig_deck: lrigDeck,
    center_lrig: roles.centerLrig, assist_lrig_l: roles.assistLrigL, assist_lrig_r: roles.assistLrigR,
    thumbnail_card_num: core.center.cards.at(-1)!.CardNum,
    _axis: axis.CardNum, _theme: theme, _lb: lbCount(), _guards: guardCount(), _mech: mech,
  };
}

const rows: ReturnType<typeof buildDeck>[] = [];
const failed: string[] = [];
for (const pool of FORMATS) {
  const types = [...new Set(cards.filter(c => c.Type === 'ルリグ' && inPool(c, pool) && lv(c) === 0).map(c => c.CardClass ?? ''))].filter(Boolean);
  for (const t of types) {
    if (ONLY && t !== ONLY) continue;
    const core = coreOf(t, pool);
    if (!core) continue;   // Lv3 以上まで育たない系統（デモ・トークン的なルリグ）
    let any = false;
    const seenAxis = new Set<string>();
    let axes = 0;
    for (let rank = 0; rank < CANDIDATES + 3 && axes < CANDIDATES; rank++) {
      let gotAxis = false;
      let axisCard: CardData | undefined;
      for (let k = 0; k < KEY_VARIANTS; k++) {
        const d = buildDeck(core, rank, k, axisCard);
        if (d && !axisCard) axisCard = cardMap.get(d._axis);
        if (!d || seenAxis.has(d.name)) continue;
        seenAxis.add(d.name); rows.push(d); any = true; gotAxis = true;
      }
      if (gotAxis) axes++;
    }
    if (!any) failed.push(`${pool}/${t}`);
  }
}
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(join(OUT_DIR, 'decks_cpu.json'), JSON.stringify(rows, null, 1), 'utf-8');
console.log(`組めた ${rows.length} デッキ（ディーバ ${rows.filter(r => r!.deck_format === 'diva').length} ／ レガシー ${rows.filter(r => r!.deck_format === 'legacy').length}）→ ${join(OUT_DIR, 'decks_cpu.json')}`);
if (failed.length) console.log(`組めなかった ${failed.length}: ${failed.join(' ')}`);
