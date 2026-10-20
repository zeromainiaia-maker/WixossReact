/**
 * 🆕**被覆用のデッキ生成**（2026-10-20新設）＝**まだ対戦で発動していないカード**を優先して、
 * 自己対戦（`npm run selfplay:inv`）で回せるデッキを組む。
 *
 * 使い方：
 *   npx tsx scripts/synthDecks.ts [--covered a.jsonl,b.jsonl] [--max 60] [--out scratchpad-synth]
 *   → <out>/decks_synth.json を書く ⇒ `npm run selfplay:inv -- --deck-dir scratchpad-synth --cov-out <f.jsonl> --jobs 8`
 *   ⇒ `--covered` にその f.jsonl を足して作り直す（未発動が減らなくなったら止める）。
 *   `--report` は被覆だけを数えて出す（デッキは書かない）。
 *
 * 🔴**生成デッキは `selfplay:ab` に混ぜない**＝勝率の山ではない（読み先を `--deck-dir` で分けてある）。
 *
 * ■ **組み合わせを壊さない**（ユーザー指示 2026-10-20）＝未発動の札を「種」として入れたら、その相方も一緒に入れる。
 *   - **名前の参照**《X》（クロスの相手・「《X》がある場合」・名前を数える札）→ X を入れる（メインは2枚・ルリグデッキは1枚）
 *   - **同名を数える／自分の名前を参照する札** → 4枚
 *   - **クラスの参照**＜X＞（「あなたの＜X＞のシグニ」・レゾナの出現条件・【ライズ】の置き先・【アクセ】の装着先）→ X のシグニを8枚以上
 *   - **限定**（`Restriction`）は `meetsRestriction`（グロウ判定と同じ関数）で核のルリグに合わせる
 *   - **チーム**（ディーバ）＝3系統を同じ `Team` で揃え、ピースも同じチーム（またはチーム不問）だけ
 * ■ **回る山にする**＝Lv1〜3 のシグニを最低限（各 8/7/5 枚）確保・色はルリグの色＋無色・プールはディーバ／それ以外で揃える。
 * ⚠**組み合わせの抽出は原文の字面**（《》・＜＞）＝「条件がそろう可能性を作る」だけで、そろうとは限らない。
 */
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData } from '../src/types';
import { meetsRestriction } from '../src/screens/battle/growLogic';
import { isDivaCardNum } from '../src/utils/deckFormat';
import { deckLrigSetupProblem } from '../src/utils/deckLrigSetup';
import { cardCsvRelPaths } from './cardDataFiles.mjs';

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const OUT_DIR = arg('--out', 'scratchpad-synth');
const MAX_DECKS = Number(arg('--max', '60'));
const COVERED = arg('--covered', '').split(',').filter(Boolean);
const REPORT = argv.includes('--report');

// ── カード（再録・別絵柄は本体と同じ効果＝除く）──
const cards: CardData[] = [];
for (const f of cardCsvRelPaths()) {
  if (/_Variants\.csv$/.test(f)) continue;
  const p = join('public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) if (r.CardNum?.trim()) cards.push(r as unknown as CardData);
}
const cardMap = new Map(cards.map(c => [c.CardNum, c]));
const byName = new Map<string, CardData[]>();
for (const c of cards) { if (/-TK/.test(c.CardNum)) continue; (byName.get(c.CardName) ?? byName.set(c.CardName, []).get(c.CardName)!).push(c); }

// ── 効果 ID（live JSON）──
const effectIdsOf = new Map<string, { id: string; type: string }[]>();
for (const f of fs.readdirSync('public/data').filter(x => /^effects_.*\.json$/.test(x))) {
  const j = JSON.parse(fs.readFileSync(join('public/data', f), 'utf-8')) as Record<string, { effectId: string; effectType: string }[]>;
  for (const [num, effs] of Object.entries(j)) if (Array.isArray(effs)) effectIdsOf.set(num, effs.map(e => ({ id: e.effectId, type: e.effectType })));
}

// ── 被覆（これまでの自己対戦で発動した効果・場に出たカード）──
const covEffects = new Set<string>(), covField = new Set<string>();
for (const f of COVERED) for (const line of fs.readFileSync(f, 'utf-8').split(/\r?\n/).filter(Boolean)) {
  const r = JSON.parse(line) as { effects: string[]; field: string[] };
  r.effects.forEach(e => covEffects.add(e)); r.field.forEach(n => covField.add(n));
}
/** 被覆の判定＝効果のどれかがスタックに載った／【常】だけの札は場に出た。 */
const isCovered = (c: CardData): boolean => {
  const effs = effectIdsOf.get(c.CardNum) ?? [];
  if (effs.some(e => covEffects.has(e.id))) return true;
  return effs.length > 0 && effs.every(e => e.type === 'CONTINUOUS') && covField.has(c.CardNum);
};
const MAIN_TYPES = new Set(['シグニ', 'スペル']);
const LRIG_SIDE = new Set(['ルリグ', 'アシストルリグ', 'アーツ', 'ピース', 'キー', 'レゾナ', 'リレーピース']);
const hasEffect = (c: CardData) => (effectIdsOf.get(c.CardNum)?.length ?? 0) > 0;
const targets = cards.filter(c => !/-TK/.test(c.CardNum) && hasEffect(c) && (MAIN_TYPES.has(c.Type) || LRIG_SIDE.has(c.Type)));

if (REPORT || COVERED.length) {
  const cov = targets.filter(isCovered);
  const byType = new Map<string, [number, number]>();
  for (const c of targets) { const t = byType.get(c.Type) ?? [0, 0]; t[0]++; if (isCovered(c)) t[1]++; byType.set(c.Type, t); }
  const allEff = targets.flatMap(c => effectIdsOf.get(c.CardNum) ?? []).filter(e => e.type !== 'CONTINUOUS');
  console.log(`被覆（発動した札）: ${cov.length} / ${targets.length} 枚｜効果（【常】以外）${allEff.filter(e => covEffects.has(e.id)).length} / ${allEff.length}`);
  for (const [t, [a, b]] of [...byType].sort((x, y) => y[1][0] - x[1][0])) console.log(`  ${t}: ${b} / ${a}`);
  if (REPORT) process.exit(0);
}

// ── 字面の抽出 ──
const textOf = (c: CardData) => `${c.EffectText ?? ''}\n${c.BurstText ?? ''}`;
/** 名前で参照する札（「《X》以外」は相方ではないので除く）。 */
const nameRefs = (c: CardData): string[] => [...textOf(c).matchAll(/《([^》]+)》(?!以外)/g)].map(m => m[1]).filter(n => byName.has(n) && n !== c.CardName);
const countsOwnName = (c: CardData) => textOf(c).includes(`《${c.CardName}》`);
/** 参照しているクラス（＜X＞）。⚠＜＞はクラス以外（ルリグタイプ等）にも使われるが、シグニの CardClass に当たるものだけ残る。 */
const classRefs = (c: CardData): string[] => [...textOf(c).matchAll(/＜([^＞]+)＞/g)].map(m => m[1]);
/** シグニのクラス（小分類）＝「精武：トリック/精生：水獣」→ [トリック, 水獣]（原文の＜X＞が指すのはこちら）。 */
const classesOf = (c: CardData): string[] => (c.CardClass ?? '').split(/[/／]/).map(s => s.split(/[：:]/).pop()!.trim()).filter(Boolean);
const signiOfClass = (cls: string) => cards.filter(c => c.Type === 'シグニ' && (c.CardClass ?? '').includes(cls));
const colorsOf = (c: CardData) => [...(c.Color ?? '')].filter(ch => '白赤青緑黒'.includes(ch));
const lv = (c: CardData) => parseInt(c.Level ?? '', 10);
const poolOf = (c: CardData) => (isDivaCardNum(c.CardNum) ? 'diva' : 'legacy');

// ── 核＝ルリグの系統（同じクラス・同じプールの Lv0〜） ──
interface Line { cls: string; pool: string; cards: CardData[]; team: string; colors: Set<string> }
function buildLines(): Line[] {
  const groups = new Map<string, CardData[]>();
  for (const c of cards) {
    if (c.Type !== 'ルリグ' && c.Type !== 'アシストルリグ') continue;
    const key = `${poolOf(c)}|${c.CardClass}|${c.Type === 'アシストルリグ' || (c.Type === 'ルリグ' && lv(c) === 0) ? 'any' : 'center'}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }
  const out: Line[] = [];
  const all = cards.filter(c => c.Type === 'ルリグ' || c.Type === 'アシストルリグ');
  const lv0s = all.filter(c => c.Type === 'ルリグ' && lv(c) === 0);
  for (const z of lv0s) {
    const same = all.filter(c => c.CardClass === z.CardClass && poolOf(c) === poolOf(z) && c !== z);
    // センター系統（ルリグ Lv1〜）とアシスト系統（アシストルリグ Lv1〜）の2つを作る
    for (const kind of ['ルリグ', 'アシストルリグ'] as const) {
      const ups = same.filter(c => c.Type === kind && lv(c) >= 1);
      if (ups.length === 0) continue;
      const line = [z];
      for (let l = 1; l <= 5; l++) {
        const atL = ups.filter(c => lv(c) === l);
        if (atL.length === 0) break;
        // 未発動を優先・同じチームを優先
        atL.sort((a, b) => Number(isCovered(a)) - Number(isCovered(b)) || Number((b.Team ?? '-') === (z.Team ?? '-')) - Number((a.Team ?? '-') === (z.Team ?? '-')));
        line.push(atL[0]);
      }
      if (line.length < 2) continue;
      out.push({ cls: z.CardClass ?? '', pool: poolOf(z), cards: line, team: z.Team && z.Team !== '-' ? z.Team : '', colors: new Set(line.flatMap(colorsOf)) });
    }
  }
  return out;
}

const planned = new Set<string>();
/** 相方が入らない核で見送った回数（3回見送ったら相方なしでも入れる＝被覆を止めない）。 */
const deferred = new Map<string, number>();   // このパスで既にどこかのデッキに入れた未発動札
const want = (c: CardData) => !isCovered(c) && !planned.has(c.CardNum);

interface Core { center: Line; assists: Line[]; pool: string; classes: string[]; colors: Set<string>; team: string }
function coresOf(lines: Line[]): Core[] {
  const out: Core[] = [];
  const centers = lines.filter(l => l.cards.some(c => c.Type === 'ルリグ' && lv(c) >= 1));
  const assists = lines.filter(l => l.cards.some(c => c.Type === 'アシストルリグ'));
  for (const c of centers) {
    out.push({ center: c, assists: [], pool: c.pool, classes: [c.cls], colors: c.colors, team: c.team });
    // キーセレクション＝アシストルリグ2系統（センターと違うルリグタイプ）
    const as = assists.filter(a => a.pool === c.pool && a.cls !== c.cls);
    if (as.length >= 2) {
      const pick = [...as].sort((a, b) => b.cards.filter(want).length - a.cards.filter(want).length).slice(0, 2);
      if (pick[0].cls !== pick[1].cls) out.push({ center: c, assists: pick, pool: c.pool, classes: [c.cls, ...pick.map(p => p.cls)], colors: new Set([...c.colors, ...pick.flatMap(p => [...p.colors])]), team: c.team });
    }
    // ディーバ＝同じチームのルリグ3系統
    if (c.pool === 'diva' && c.team) {
      const mates = centers.filter(m => m !== c && m.team === c.team && m.cls !== c.cls);
      // ⚠仲間2人も**互いに違うルリグタイプ**（同じタイプの系統を2本入れるとルリグデッキに同じ札が重なる）
      const m2 = mates.find(m => m.cls !== mates[0]?.cls);
      if (mates.length >= 2 && m2) {
        const pick = [mates[0], m2];
        out.push({ center: c, assists: pick, pool: c.pool, classes: [c.cls, ...pick.map(p => p.cls)], colors: new Set([...c.colors, ...pick.flatMap(p => [...p.colors])]), team: c.team });
      }
    }
  }
  return out;
}

const restrictionOk = (c: CardData, core: Core) => core.classes.some(cls => meetsRestriction(c.Restriction ?? '-', cls));
const colorOk = (c: CardData, core: Core) => colorsOf(c).every(ch => core.colors.has(ch));
const poolOk = (c: CardData, core: Core) => poolOf(c) === core.pool;
const teamOk = (c: CardData, core: Core) => !c.Team || c.Team === '-' || c.Team === core.team;
const fitsMain = (c: CardData, core: Core) => MAIN_TYPES.has(c.Type) && poolOk(c, core) && colorOk(c, core) && restrictionOk(c, core);
const fitsLrigSide = (c: CardData, core: Core) => ['アーツ', 'ピース', 'キー', 'レゾナ'].includes(c.Type) && poolOk(c, core) && colorOk(c, core) && restrictionOk(c, core) && teamOk(c, core);

function buildDeck(core: Core, idx: number) {
  const lrigLines = [core.center, ...core.assists];
  const lrigDeck: string[] = [...new Set(lrigLines.flatMap(l => l.cards.map(c => c.CardNum)))];
  const lrigCap = lrigDeck.length + (core.assists.length ? 3 : 10 - lrigDeck.length);
  const main: string[] = [];
  const classDemand = new Map<string, number>();
  const count = (n: string) => main.filter(x => x === n).length;
  const addMain = (c: CardData, n: number) => { const k = Math.min(n, 4 - count(c.CardNum), 40 - main.length); for (let i = 0; i < k; i++) main.push(c.CardNum); return k > 0; };
  const demandFrom = (c: CardData) => { for (const cls of classRefs(c)) if (signiOfClass(cls).length) classDemand.set(cls, Math.max(classDemand.get(cls) ?? 0, 8)); };
  const seeds: string[] = [];
  /** 相方（名前の参照）を入れる。メイン側→2枚／ルリグ側→1枚。 */
  const addPartners = (c: CardData) => {
    for (const nm of nameRefs(c)) {
      const cand = (byName.get(nm) ?? []).filter(x => poolOf(x) === core.pool) ;
      const pick = cand.find(x => fitsMain(x, core)) ?? cand.find(x => fitsLrigSide(x, core));
      if (!pick) continue;
      if (MAIN_TYPES.has(pick.Type)) { if (addMain(pick, 2)) demandFrom(pick); }
      else if (lrigDeck.length < lrigCap && !lrigDeck.includes(pick.CardNum)) lrigDeck.push(pick.CardNum);
    }
  };
  /**
   * 🔑**相方がこの核に入れられるか**＝名前で参照する札は、相方が色・限定・プールの都合で入らない核では種にしない
   *   （入れても「《X》がある場合」が一度も成立しない＝試したことにならない）。ルリグの相方は核の系統に居るときだけ。
   */
  const lrigNames = new Set(lrigLines.flatMap(l => l.cards.map(c => c.CardName)));
  const partnersFit = (c: CardData): boolean => nameRefs(c).every(nm => {
    if (lrigNames.has(nm) || main.some(n => cardMap.get(n)?.CardName === nm) || lrigDeck.some(n => cardMap.get(n)?.CardName === nm)) return true;
    const cand = (byName.get(nm) ?? []).filter(x => poolOf(x) === core.pool);
    return cand.some(x => fitsMain(x, core) || fitsLrigSide(x, core));
  });
  const seedOk = (c: CardData): boolean => {
    if (partnersFit(c)) return true;
    const k = (deferred.get(c.CardNum) ?? 0) + 1; deferred.set(c.CardNum, k);
    return k > 3;
  };
  for (const l of lrigLines) for (const c of l.cards) { demandFrom(c); addPartners(c); }
  // ① ルリグデッキ側の種（アーツ・ピース・キー・レゾナ）
  for (const c of targets.filter(x => want(x) && fitsLrigSide(x, core))) {
    if (lrigDeck.length >= lrigCap) break;
    if (!seedOk(c)) continue;
    lrigDeck.push(c.CardNum); seeds.push(c.CardNum); planned.add(c.CardNum); demandFrom(c); addPartners(c);
  }
  // ② メイン側の種（未発動のシグニ・スペル）＝相方の枠を残して 24枚まで
  //   🔑**主題のクラス**を1つ決めて、そのクラスの札から先に入れる＝「＜X＞が N 体いれば」のような条件が成立しうる山にする。
  const themeCount = new Map<string, number>();
  for (const c of targets) if (c.Type === 'シグニ' && want(c) && fitsMain(c, core)) for (const cls of classesOf(c)) themeCount.set(cls, (themeCount.get(cls) ?? 0) + 1);
  const theme = [...themeCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  if (theme) classDemand.set(theme, Math.max(classDemand.get(theme) ?? 0, 14));
  const inTheme = (c: CardData) => c.Type === 'スペル' ? classRefs(c).includes(theme) : classesOf(c).includes(theme);
  const spells = () => main.filter(n => cardMap.get(n)?.Type === 'スペル').length;
  for (const c of targets.filter(x => want(x) && fitsMain(x, core)).sort((a, b) => Number(inTheme(b)) - Number(inTheme(a)))) {
    if (main.length >= 24) break;
    if (c.Type === 'スペル' && spells() >= 8) continue;
    if (!seedOk(c)) continue;
    if (!addMain(c, countsOwnName(c) ? 4 : 2)) continue;
    seeds.push(c.CardNum); planned.add(c.CardNum); demandFrom(c); addPartners(c);
  }
  // ③ 参照されたクラスのシグニ（条件をそろえる）
  for (const [cls, need] of classDemand) {
    let have = main.filter(n => classesOf(cardMap.get(n)!).includes(cls) || (cardMap.get(n)?.CardClass ?? '').includes(cls)).length;
    for (const c of signiOfClass(cls).filter(x => fitsMain(x, core) && lv(x) <= 3).sort((a, b) => Number(want(b)) - Number(want(a)) || lv(a) - lv(b))) {
      if (have >= need || main.length >= 34) break;
      if (!partnersFit(c)) continue;   // 埋め草にも同じ規則（相方が入らない札は選ばない）
      if (addMain(c, 2)) { addPartners(c); have = main.filter(n => (cardMap.get(n)?.CardClass ?? '').includes(cls)).length; if (want(c)) { planned.add(c.CardNum); seeds.push(c.CardNum); } }
    }
  }
  // ④ 回る山にする＝レベル帯の最低枚数 → 残りを未発動優先で埋める
  const lvCount = (l: number) => main.filter(n => cardMap.get(n)?.Type === 'シグニ' && lv(cardMap.get(n)!) === l).length;
  const fill = (pred: (c: CardData) => boolean, until: () => boolean) => {
    for (const c of cards.filter(x => x.Type === 'シグニ' && fitsMain(x, core) && pred(x)).sort((a, b) => Number(want(b)) - Number(want(a)) || Number(b.LifeBurst === '1') - Number(a.LifeBurst === '1'))) {
      if (until() || main.length >= 40) break;
      if (!partnersFit(c)) continue;
      if (addMain(c, 4)) { addPartners(c); if (want(c)) { planned.add(c.CardNum); seeds.push(c.CardNum); } }
    }
  };
  for (const [l, n] of [[1, 8], [2, 7], [3, 5]] as const) fill(c => lv(c) === l, () => lvCount(l) >= n);
  fill(c => lv(c) >= 1 && lv(c) <= 4, () => main.length >= 40);
  if (main.length < 40) return null;   // 色・限定が狭すぎて埋まらない核
  const roles = { centerLrig: core.center.cards[0].CardNum, assistLrigL: core.assists[0]?.cards[0].CardNum ?? null, assistLrigR: core.assists[1]?.cards[0].CardNum ?? null };
  if (deckLrigSetupProblem({ ...roles, lrigDeck }, cardMap)) return null;
  return {
    row: {
      name: `S${String(idx).padStart(3, '0')}_${core.classes.join('+')}_${theme}`, deck_kind: 'cpu',
      main_deck: main, lrig_deck: lrigDeck,
      center_lrig: roles.centerLrig, assist_lrig_l: roles.assistLrigL, assist_lrig_r: roles.assistLrigR,
    },
    seeds,
  };
}

// ── 貪欲＝未発動を一番多く入れられる核から ──
const lines = buildLines();
const coreUses = new Map<string, number>();
const coreKey = (c: Core) => [c.center, ...c.assists].map(l => l.cards[0].CardNum).join('+');
const rows: unknown[] = [];
let seedTotal = 0;
for (let i = 0; i < MAX_DECKS; i++) {
  const cores = coresOf(lines);
  let best: { core: Core; gain: number } | null = null;
  for (const core of cores) {
    const gain = targets.filter(x => want(x) && (fitsMain(x, core) || fitsLrigSide(x, core))).length
      + [core.center, ...core.assists].flatMap(l => l.cards).filter(want).length;
    const g = gain * Math.pow(0.6, coreUses.get(coreKey(core)) ?? 0);
    if (!best || g > best.gain) best = { core, gain: g };
  }
  if (!best || best.gain < 1) break;
  const before = new Set(planned);
  for (const l of [best.core.center, ...best.core.assists]) for (const c of l.cards) if (want(c)) planned.add(c.CardNum);
  const d = buildDeck(best.core, i);
  if (!d) {
    // 埋まらない核＝その系統を外してやり直す（入れたつもりの札は戻す）
    planned.clear(); before.forEach(n => planned.add(n));
    for (const l of [best.core.center, ...best.core.assists]) { const k = lines.indexOf(l); if (k >= 0) lines.splice(k, 1); }
    i--; continue;
  }
  rows.push(d.row); seedTotal += d.seeds.length;
  coreUses.set(coreKey(best.core), (coreUses.get(coreKey(best.core)) ?? 0) + 1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(join(OUT_DIR, 'decks_synth.json'), JSON.stringify(rows, null, 1), 'utf-8');
console.log(`生成 ${rows.length} デッキ｜未発動の種 ${seedTotal} 枚（＋ルリグ）｜未発動の残り ${targets.filter(want).length} / ${targets.filter(c => !isCovered(c)).length} 枚 → ${join(OUT_DIR, 'decks_synth.json')}`);
