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
const classesOf = (c: CardData) => (c.CardClass ?? '').split(/[/／]/).map(s => s.split(/[：:]/).pop()!.trim()).filter(Boolean);
const classRefs = (c: CardData) => [...textOf(c).matchAll(/＜([^＞]+)＞/g)].map(m => m[1]);
const nameRefs = (c: CardData) => [...textOf(c).matchAll(/《([^》]+)》(?!以外)/g)].map(m => m[1]).filter(n => byName.has(n) && n !== c.CardName);
const strength = (c: CardData) => cardStrength(c, effectsOf.get(c.CardNum) ?? [], 'deploy');
const hasLB = (c: CardData) => c.LifeBurst === '1' || !!(c.BurstText && c.BurstText !== '-');
const toAscii = (t: string) => t.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
const coinNeed = (c: CardData) => [...toAscii(c.Cost ?? '').matchAll(/《コイン(?:アイコン)?》×([0-9]+)/g)].reduce((t, m) => t + Number(m[1]), 0);
const MAIN_TYPES = new Set(['シグニ', 'スペル']);

interface Line { type: string; cards: CardData[]; colors: Set<string>; team: string }
/** ルリグタイプ1つの系統（Lv0 → 最上位）。`kind`＝センター（ルリグ）／アシスト（アシストルリグ）。 */
function lineOf(type: string, pool: string, kind: 'ルリグ' | 'アシストルリグ'): Line | null {
  const same = cards.filter(c => c.CardClass === type && inPool(c, pool));
  const lv0 = same.find(c => c.Type === 'ルリグ' && lv(c) === 0);
  if (!lv0) return null;
  const ups = same.filter(c => c.Type === kind && lv(c) >= 1);
  if (ups.length === 0) return null;
  // 色＝その系統で一番多い色（Lv0 は無色のことが多い）
  const colorCount = new Map<string, number>();
  for (const c of ups) for (const ch of colorsOf(c)) colorCount.set(ch, (colorCount.get(ch) ?? 0) + 1);
  const main = [...colorCount].sort((a, b) => b[1] - a[1])[0]?.[0];
  const line = [lv0];
  for (let l = 1; l <= 5; l++) {
    const atL = ups.filter(c => lv(c) === l);
    if (atL.length === 0) break;
    atL.sort((a, b) => Number(colorsOf(b).includes(main ?? '')) - Number(colorsOf(a).includes(main ?? ''))
      || Number((b.Team ?? '-') === (lv0.Team ?? '-')) - Number((a.Team ?? '-') === (lv0.Team ?? '-')));
    line.push(atL[0]);
  }
  if (line.length < 2) return null;
  return { type, cards: line, colors: new Set(line.flatMap(colorsOf)), team: lv0.Team && lv0.Team !== '-' ? lv0.Team : '' };
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

/** 軸に使った回数（カード名）＝別のデッキでは別の軸を選ぶ。 */
const axisUsed = new Map<string, number>();
function buildDeck(core: Core, rank = 0) {
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
  const axisCands = cards.filter(c => fitsMain(c, core) && (c.Type === 'スペル' || lv(c) >= 3) && (effectsOf.get(c.CardNum)?.length ?? 0) > 0
    && (restrictedTo(c, core) || centerColor(c)));
  axisCands.sort((a, b) => Number(restrictedTo(b, core)) - Number(restrictedTo(a, core))
    || (axisUsed.get(a.CardName) ?? 0) - (axisUsed.get(b.CardName) ?? 0)
    || (b.Type === 'シグニ' ? lv(b) : 3) - (a.Type === 'シグニ' ? lv(a) : 3)
    || strength(b) - strength(a));
  const axis = axisCands[rank];
  if (!axis) return null;
  addMain(axis, 4);
  axisUsed.set(axis.CardName, (axisUsed.get(axis.CardName) ?? 0) + 1);
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
  // ── レベル帯の枠（Lv1/2/3 を10枚ずつ・Lv4 以上は軸を含めて6枚・スペル4枚まで）の中で、主題 → 参照されたクラス → 強さの順に埋める ──
  //   ⚠旧＝主題のクラスを強さ順で先に埋めていた＝高レベルの札ばかり入り、Lv3 が1枚・Lv4 以上が16枚の山になった。
  const lvOf = (n: string) => { const c = cardMap.get(n)!; return c.Type === 'スペル' ? -1 : Math.min(lv(c), 4); };
  const slotCount = (l: number) => main.filter(n => lvOf(n) === l).length;
  const SLOTS: [number, number][] = [[1, 10], [2, 10], [3, 10], [4, 6], [-1, 4]];
  const wanted = (c: CardData) => (inTheme(c) ? 2 : 0) + ([...classDemand.keys()].some(cls => classesOf(c).includes(cls)) ? 1 : 0);
  for (const [l, cap] of SLOTS) {
    for (const c of cards.filter(x => fitsMain(x, core) && (l === -1 ? x.Type === 'スペル' : x.Type === 'シグニ' && Math.min(lv(x), 4) === l && lv(x) >= 1))
      .sort((a, b) => wanted(b) - wanted(a) || strength(b) - strength(a))) {
      if (slotCount(l) >= cap || main.length >= 40) break;
      if (addMain(c, Math.min(l >= 3 || l === -1 ? 2 : 3, cap - slotCount(l)))) addPartners(c);
    }
  }
  // 足りなければ（色・限定が狭い）どのレベルでも埋める
  for (const c of cards.filter(x => fitsMain(x, core) && x.Type === 'シグニ' && lv(x) >= 1 && lv(x) <= 3).sort((a, b) => wanted(b) - wanted(a) || strength(b) - strength(a))) {
    if (main.length >= 40) break;
    addMain(c, 3);
  }
  if (main.length < 40) return null;
  // ── ルリグデッキの残り（アーツ・ピース）──
  const nonExtra = () => lrigDeck.filter(n => !isExtraLrigCard(cardMap.get(n)!)).length;
  const extra = () => lrigDeck.filter(n => isExtraLrigCard(cardMap.get(n)!)).length;
  const lrigSide = cards.filter(c => fitsLrigSide(c, core) && !lrigDeck.includes(c.CardNum))
    .sort((a, b) => Number(restrictedTo(b, core)) - Number(restrictedTo(a, core)) || strength(b) - strength(a));
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
    name: `${formatJa}／${core.center.type}／${axis.CardName}軸`, _rank: rank, _lrigType: core.center.type, deck_kind: 'cpu', deck_format: core.pool,
    main_deck: main, lrig_deck: lrigDeck,
    center_lrig: roles.centerLrig, assist_lrig_l: roles.assistLrigL, assist_lrig_r: roles.assistLrigR,
    thumbnail_card_num: core.center.cards.at(-1)!.CardNum,
    _axis: axis.CardNum, _theme: theme, _lb: lbCount(),
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
    for (let rank = 0; rank < CANDIDATES + 3 && seenAxis.size < CANDIDATES; rank++) {
      const d = buildDeck(core, rank);
      if (!d || seenAxis.has(d.name)) continue;
      seenAxis.add(d.name); rows.push(d); any = true;
    }
    if (!any) failed.push(`${pool}/${t}`);
  }
}
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(join(OUT_DIR, 'decks_cpu.json'), JSON.stringify(rows, null, 1), 'utf-8');
console.log(`組めた ${rows.length} デッキ（ディーバ ${rows.filter(r => r!.deck_format === 'diva').length} ／ レガシー ${rows.filter(r => r!.deck_format === 'legacy').length}）→ ${join(OUT_DIR, 'decks_cpu.json')}`);
if (failed.length) console.log(`組めなかった ${failed.length}: ${failed.join(' ')}`);
