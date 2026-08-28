/**
 * public/data/CardData_Sheet*.csv を読み込み、
 * parseCardEffects で全カードの効果を解析して
 * public/data/effects.json として出力するスクリプト。
 *
 * 実行: npm run build:effects
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects, getSilentFallbackLog, enableSourceTextLog, getSourceTextLog } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── 非破壊再生成のための「手修正カード温存」──
// 既存 effects_*.json を読み、parseStatus が MANUAL/PARTIAL を含むカードは
// パーサー出力で上書きせずカード単位で丸ごと温存する（全効果 AUTO のカードのみ再生成）。
const EFFECT_FILES = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const PRESERVE_STATUSES = new Set(['MANUAL', 'PARTIAL']);
const existingEffects = new Map<string, any[]>();
for (const f of EFFECT_FILES) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  const j = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, any[]>;
  for (const [id, effs] of Object.entries(j)) existingEffects.set(id, effs);
}

// 値を「リーフパス→値」の平坦マップへ。配列は添字パスで表す。
// ⚠**値が `undefined` のキーは存在しないものとして扱う**（2026-08-22・§6.4 O-39 の作業中に発見）＝
//   live は JSON 由来なので `undefined` を持ち得ないが、parser 出力は `{ upToCount: undefined }` のような
//   明示 undefined を持つことがある。弾かないと **`isPureSuperset` が「fresh にだけ在るリーフ」を数えて
//   実体の変わらない差分を「純改善」として採用**し（`WXDi-P13-050-E1` はキー順だけが変わった）、
//   `equalIgnoringParseStatus` も同じ理由で偽の差分を報告する。`censusManualDrift.ts` は同じ罠を
//   初版で踏んでおり（223件の誤検出）、そこと同じ規約に揃える。
function leafMap(o: any, pre = '', out: Map<string, any> = new Map()): Map<string, any> {
  if (o === undefined) { return out; }
  if (Array.isArray(o)) {
    o.forEach((v, i) => leafMap(v, `${pre}[${i}]`, out));
  } else if (o && typeof o === 'object') {
    for (const k of Object.keys(o)) leafMap(o[k], `${pre}.${k}`, out);
  } else {
    out.set(pre, o); // リーフ（プリミティブ）
  }
  return out;
}
// fresh が existing の「完全上位集合」か：existing の全リーフを同値で保持し、かつ追加リーフがある。
// = 既存の情報を一切失わずに情報だけ増えている（証明可能に無損失な改善）。
function isPureSuperset(existing: any, fresh: any): boolean {
  const e = leafMap(existing), f = leafMap(fresh);
  for (const [path, val] of e) {
    if (!f.has(path)) return false;            // 既存パスが消えた＝損失
    if (JSON.stringify(f.get(path)) !== JSON.stringify(val)) return false; // 値が変わった＝損失/改変
  }
  return f.size > e.size;                       // 純粋に増えている
}

// 存在する Sheet*.csv を順番に読み込んで結合
const allRows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const csvPath = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(csvPath)) break;
  const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, ''); // BOM除去
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  console.log(`Sheet${i}: ${data.length}件`);
  allRows.push(...data);
}

// CardData_TK.csv（クラフトカード・トークン）も読み込む
const tkPath = join(root, 'public/data/CardData_TK.csv');
if (existsSync(tkPath)) {
  const tkText = readFileSync(tkPath, 'utf-8').replace(/^﻿/, '');
  const { data: tkData } = Papa.parse<Record<string, string>>(tkText, {
    header: true,
    skipEmptyLines: true,
  });
  console.log(`CardData_TK: ${tkData.length}件`);
  allRows.push(...tkData);
}

const rows = allRows;

console.log(`カード数: ${rows.length}`);

// 効果解析
// 語彙センサスの効果単位判定用に「effectId → 由来の原文ブロック」を収集する（続き109）
enableSourceTextLog();
const result: Record<string, ReturnType<typeof parseCardEffects>> = {};
const appearanceByCard = new Map<string, NonNullable<ReturnType<typeof parseCardEffects>[number]['appearanceCondition']>>();
let parsed = 0, unknown = 0;

for (const r of rows) {
  const card: CardData = {
    CardNum:     r.CardNum     ?? '',
    CardName:    r.CardName    ?? '',
    ImgURL:      r.ImgURL      ?? '',
    Type:        r.Type        ?? '',
    CardClass:   r.CardClass   ?? '',
    Color:       r.Color       ?? '',
    Level:       r.Level       ?? '',
    GrowCost:    r.GrowCost    ?? '',
    Cost:        r.Cost        ?? '',
    Limit:       r.Limit       ?? '',
    Power:       r.Power       ?? '',
    Restriction: r.Restriction ?? '',
    Team:        r.Team        ?? '',
    Timing:      r.Timing      ?? '',
    Guard:       r.Guard       ?? '',
    Coin:        r.Coin        ?? '',
    Story:       r.Story       ?? '',
    LifeBurst:   r.LifeBurst   ?? '',
    EffectText:  r.EffectText  ?? '',
    BurstText:   r.BurstText   ?? '',
    effects:     [],
  };

  const parsedEffects = parseCardEffects(card);
  const appearance = parsedEffects.find(e => e.appearanceCondition)?.appearanceCondition;
  if (appearance) appearanceByCard.set(card.CardNum, appearance);
  const effects = mergeManualEffects(card.CardNum, parsedEffects);
  if (effects.length === 0) continue;

  result[card.CardNum] = effects;
  parsed++;
  unknown += effects.filter(e => e.parseStatus === 'UNKNOWN').length;
}

// ── richness ガード付き収穫マージ ──
// カードごとに existing(現JSON) と fresh(パーサー出力) を比較し、
//   - 既存なし          → fresh 採用（新規カード）
//   - fresh なし/空      → existing 温存
//   - 同一              → 変化なし
//   - MANUAL/PARTIAL含む → existing 温存（手修正のハード保護）
//   - fresh が純粋上位集合 → fresh 採用（証明可能に無損失な改善のみ自動収穫）
//   - それ以外（損失/値変更/混在）→ existing 温存し、レポートに記録（人が後でレビュー）
const report: Record<string, string[]> = {
  adopted_new: [], adopted_gain: [], adopted_partial: [], adopted_manual_add: [], adopted_cost_scaling: [], preserved_manual: [],
  preserved_emptyFresh: [], preserved_held: [], preserved_metaOnly: [], preserved_idset: [],
};
// 【出現条件】は実効果ではなくカード単位メタデータ。richness ガードが MANUAL 効果を
// 温存したカードでも失わないよう、fresh から独立して最後に重ねる。
// parseStatus 以外が同一か（無言フォールバック刻印＝AUTO→PARTIAL のメタ差分だけで
// held キュー/parserWorklist を汚さないためのガード。2026-07-07）
// ⚠`JSON.stringify` 比較は**キー順に依存する**ため、parser が同じ値を**別の順**で組み立てた
//   だけ（`triggerScope`/`triggerFilter` を action の前に置く等）でも「差分あり」と誤判定し、
//   レビュー行列（`_partial_fresh` / `_held_fresh`）に**偽の採用待ち**を積んでいた（`WD14-011-E1`＝
//   実体は完全同一で刻印 AUTO/MANUAL とキー順だけが違った）。リーフパス集合で正規化して比較する。
const canonLeaves = (o: any): string => {
  const out: string[] = [];
  for (const [path, val] of leafMap(o)) {
    if (path === '.parseStatus' || path.endsWith('.parseStatus')) continue;
    out.push(`${path}=${JSON.stringify(val)}`);
  }
  return out.sort().join('\n');
};
const equalIgnoringParseStatus = (a: any, b: any) => canonLeaves(a) === canonLeaves(b);
const COST_SCALING_MARKERS = new Set(['ARTS_COST_REDUCTION_BY_EFFECT', 'SPELL_COST_REDUCTION_BY_TRASH_COUNT']);
const stripCostScalingMarker = (action: any): any => {
  if (!action || typeof action !== 'object') return action;
  if (action.type === 'STUB' && COST_SCALING_MARKERS.has(action.id)) return undefined;
  if (action.type !== 'SEQUENCE' || !Array.isArray(action.steps)) return action;
  return { ...action, steps: action.steps.map(stripCostScalingMarker).filter(Boolean) };
};
const allIds = new Set<string>([...existingEffects.keys(), ...Object.keys(result)]);
// held（温存＝要レビュー）カードの fresh 出力を保存＝scripts/heldReview.mjs のレビュー/採用の入力
const heldFresh: Record<string, ReturnType<typeof parseCardEffects>> = {};
// 混在カード（MANUAL/PARTIAL 同居）のうち、AUTO 効果に superset ではない差分が残るカードの fresh。
// ＝効果単位マージでは自動採用できない「値変更/構造変更」の**第2のレビュー待ち行列**（続き377i 新設）。
const partialFresh: Record<string, ReturnType<typeof parseCardEffects>> = {};
// id 集合がズレた混在カードの fresh（§6.4 O-39）。旧実装はここでカード丸ごと温存して**どの計器にも出さなかった**。
// ＝「live 固有の手書き効果がある」「parser が粗い重複効果を吐く」「id 命名が食い違う」の3系統が混ざるので、
// 自動採用はせず**人が読む索引**として出す（`docs/_idset_fresh.json`＋レポートの該当節）。
const idsetFresh: Record<string, ReturnType<typeof parseCardEffects>> = {};
for (const id of allIds) {
  let existing = existingEffects.get(id);
  const fresh = result[id];
  if (!existing) { report.adopted_new.push(id); continue; }              // fresh は既に result[id]
  if (!fresh || fresh.length === 0) { result[id] = existing as ReturnType<typeof parseCardEffects>; report.preserved_emptyFresh.push(id); continue; }
  // ── 手書き効果の**新規追加**だけは無条件に live へ落とす（続き424・§6.4）──
  // ⚠これが無いと **`manualEffects.ts` に効果を1本足しても live に永久に届かない**。
  //   下の richness ガードは「effectId の集合が変わるカードは丸ごと温存」なので、
  //   *既存 id への上書き*は届くのに *新しい id の追加*だけが黙って捨てられていた（第4の死角）。
  //   実測3件が長期間落ちていた＝`WXK04-003-DECORE`（【デコレ】そのもの）／`WXK04-042-E1b`
  //   （血晶武装で得る【自】）／`WXK05-030-MULTIENA`（【マルチエナ】）。
  // ⚠**MANUAL/PARTIAL の追加だけ**を採る。parser 由来（AUTO）の追加まで採ると、
  //   例えば `WD01-016` は既に MANUAL の `-MULTIENA` を持つのに parser の粗い `-E2`
  //   （`thisCardOnly` 無しの【マルチエナ】）が**二重に**載ってしまう。
  const exIdSet = new Set(existing.map(e => e?.effectId));
  const addedManual = fresh.filter(fr => !exIdSet.has(fr?.effectId) && PRESERVE_STATUSES.has(fr?.parseStatus));
  if (addedManual.length > 0) {
    const rest = [...existing];
    const withAdded: any[] = [];
    for (const fr of fresh) {                       // 並びは fresh 準拠（先頭に来る手書き効果もあるため）
      if (addedManual.includes(fr)) { withAdded.push(fr); continue; }
      const i = rest.findIndex(e => e?.effectId === fr?.effectId);
      if (i >= 0) withAdded.push(...rest.splice(i, 1));
    }
    withAdded.push(...rest);                        // fresh に無い既存効果は末尾に温存
    existing = withAdded;
    report.adopted_manual_add.push(id);
  }
  // An existing action remains authoritative, but a strict parser payload for the same
  // effectId can safely replace the no-op cost marker without re-adopting unrelated action
  // fields from the same parse. This is semantic-field inheritance, not card-specific force
  // adoption: every effect with a strict costScaling payload follows the same rule.
  const freshByEffectId = new Map(fresh.map(effect => [effect.effectId, effect]));
  let inheritedCostScaling = false;
  existing = existing.map(effect => {
    const freshEffect = freshByEffectId.get(effect?.effectId);
    const costScaling = freshEffect?.cost?.costScaling;
    if (!costScaling?.length) return effect;
    inheritedCostScaling = true;
    return {
      ...effect,
      cost: { ...(effect.cost ?? {}), costScaling },
      action: stripCostScalingMarker(effect.action),
    };
  });
  if (inheritedCostScaling) {
    report.adopted_cost_scaling.push(id);
    // costScaling だけを継承したあとにも action 差分が残る場合、それを黙って捨てない。
    // 自動採用はせず held へ出し、通常のレビュー契約で効果単位に確認してから採る。
    if (!equalIgnoringParseStatus(existing, fresh)) {
      heldFresh[id] = fresh;
      report.preserved_held.push(id);
    } else if (JSON.stringify(existing) !== JSON.stringify(fresh)) {
      report.preserved_metaOnly.push(id);
    }
    result[id] = existing as ReturnType<typeof parseCardEffects>;
    continue;
  }
  if (JSON.stringify(existing) === JSON.stringify(fresh)) { result[id] = existing as ReturnType<typeof parseCardEffects>; continue; } // 変化なし
  // parseStatus だけの差分（AUTO→PARTIAL 刻印等）＝実体は同一。existing 温存（held に落とさない）
  if (equalIgnoringParseStatus(existing, fresh)) { result[id] = existing as ReturnType<typeof parseCardEffects>; report.preserved_metaOnly.push(id); continue; }
  if (existing.some(e => PRESERVE_STATUSES.has(e?.parseStatus))) {
    // ⚠**カード単位ではなく効果単位で温存する**（続き377i）。
    //   従来は「カード内に MANUAL/PARTIAL が1つでもあれば**カード丸ごと**温存」だったため、
    //   **同じカードの AUTO 効果に対する parser 改善が永久に live へ届かなかった**（実測 584カードが
    //   このバケツに入っており、その中に「parser は直っているのに live は古い」効果が溜まっていた
    //   ＝続き377g/h で刈った stale live の**本体**）。
    //   効果単位に落としても安全性は変わらない＝①MANUAL/PARTIAL の効果は**絶対に触らない**
    //   ②残りの AUTO 効果も `isPureSuperset`（既存リーフを1つも失わない）を**個別に**通ったものだけ採る。
    //   🆕**2026-08-22（§6.4 `O-39`）＝「effectId の集合が変わるカードはカード丸ごと温存」をやめた**。
    //   旧実装は `exIds` と `frIds` を**添字で**突き合わせ、1つでもズレたら `continue` していたため、
    //   **そのカードの AUTO 効果は parser 改善を永久に受け取れず、しかも held にも `_partial_fresh` にも
    //   出ない**（＝計器も golden も緑のまま隠れる第5の死角。実測46カード）。内訳＝
    //   ①live `-E1b` ↔ fresh `-E2` の**id 命名違い**11 ②**live 固有の手書き効果**（`-TRAP`/`-E3P`/`-ACT`）15
    //   ③**fresh 側にだけ在る粗い重複**（【マルチエナ】札の `-E2`＝`thisCardOnly` 無し）20。
    //   ②③はカードとして正しい状態なのに、道連れで①の AUTO 効果まで凍っていた。
    //   ⇒ **突き合わせを添字から `effectId` へ変える**＝id が一致する効果だけを個別に判定し、
    //   **片側にしか無い id は触らない**（fresh 固有 id を勝手に足さない＝重複 `-E2` は載らない／
    //   live 固有 id は温存＝手書き効果を消さない）。安全性は変わらない＝MANUAL/PARTIAL は不可侵、
    //   AUTO も `isPureSuperset` を個別に通ったものだけ採る。
    //   ⚠**id 集合がズレたカードは `docs/_idset_fresh.json` に必ず出す**（黙って温存しないための計器）。
    const exIds = existing.map(e => e?.effectId);
    const frIds = fresh.map(e => e?.effectId);
    const freshById = new Map<string, ReturnType<typeof parseCardEffects>[number]>();
    for (const fr of fresh) if (fr?.effectId !== undefined && !freshById.has(fr.effectId)) freshById.set(fr.effectId, fr);
    const exIdSet2 = new Set(exIds);
    const onlyLive = exIds.filter(v => !freshById.has(v as string));
    const onlyFresh = frIds.filter(v => !exIdSet2.has(v));
    let gained = false;
    const merged = existing.map(ex => {
      const fr = freshById.get(ex?.effectId as string);
      if (PRESERVE_STATUSES.has(ex?.parseStatus)) return ex;   // 手修正は不可侵
      if (!fr || equalIgnoringParseStatus(ex, fr)) return ex;  // 実体同一（キー順/刻印差のみ）
      if (!isPureSuperset(ex, fr)) return ex;                  // 損失リスクのある差分は温存
      gained = true;
      return fr;
    });
    result[id] = merged as ReturnType<typeof parseCardEffects>;
    // 混在カードのうち「MANUAL/PARTIAL ではない効果に superset ではない差分が残っている」ものは、
    // held と同じく**人のレビュー待ち**。held キュー（_held_fresh.json）とは母集団が違うので別ファイルへ出す。
    const needsReview = existing.some(ex => {
      if (PRESERVE_STATUSES.has(ex?.parseStatus)) return false;
      const fr = freshById.get(ex?.effectId as string);
      return !!fr && !equalIgnoringParseStatus(ex, fr) && !isPureSuperset(ex, fr);
    });
    if (needsReview) partialFresh[id] = fresh;
    if (onlyLive.length || onlyFresh.length) {
      idsetFresh[id] = fresh;
      report.preserved_idset.push(`${id}（liveのみ=[${onlyLive.join(',')}] / freshのみ=[${onlyFresh.join(',')}]）`);
    }
    (gained ? report.adopted_partial : report.preserved_manual).push(id);
    continue;
  }
  if (isPureSuperset(existing, fresh)) { report.adopted_gain.push(id); continue; } // fresh をそのまま採用
  heldFresh[id] = fresh;
  result[id] = existing as ReturnType<typeof parseCardEffects>;          // 損失リスク→温存
  report.preserved_held.push(id);
}
for (const [id, appearance] of appearanceByCard) {
  const effects = result[id];
  if (!effects?.length) continue;
  result[id] = effects.map((effect, index) => {
    const { appearanceCondition: _old, ...rest } = effect;
    return index === 0 ? { ...rest, appearanceCondition: appearance } : rest;
  });
}
// WX24-P2-047 は held 側の「場に特定カードがある」条件を維持しつつ、
// fresh が復元した choice①の《無》《無》とターン持続だけを狭く採用する。
const wx24p2047 = result['WX24-P2-047']?.find(effect => effect.effectId === 'WX24-P2-047-E1');
const wx24p2047Choose = wx24p2047?.action?.steps?.find((step: any) => step.type === 'CHOOSE');
const wx24p2047Choice1 = wx24p2047Choose?.choices?.find((choice: any) => choice.choiceId === 'c0');
if (wx24p2047Choice1) {
  wx24p2047Choice1.action = {
    type: 'STUB', id: 'GUARD_EXTRA_COST_BY_OPP', count: 2, until: 'END_OF_TURN',
  };
}
writeFileSync(join(root, 'docs', '_held_fresh.json'), JSON.stringify(heldFresh), 'utf-8');
writeFileSync(join(root, 'docs', '_partial_fresh.json'), JSON.stringify(partialFresh), 'utf-8');
writeFileSync(join(root, 'docs', '_idset_fresh.json'), JSON.stringify(idsetFresh), 'utf-8');
console.log(`costScaling inheritance: ${report.adopted_cost_scaling.length}`);
console.log(`収穫マージ: 新規採用 ${report.adopted_new.length} / 純改善採用 ${report.adopted_gain.length} / 効果単位採用 ${report.adopted_partial.length} / 手書き効果の新規追加 ${report.adopted_manual_add.length} / 温存(手修正) ${report.preserved_manual.length} / 温存(要レビュー) ${report.preserved_held.length} / 温存(fresh空) ${report.preserved_emptyFresh.length} / 温存(parseStatusのみ差) ${report.preserved_metaOnly.length} / id集合ズレ(要レビュー) ${report.preserved_idset.length}`);
// レポート出力（採用・保留の全カードIDを残し、何も黙って変えない）
{
  const lines: string[] = [];
  lines.push('# build:effects 収穫マージ レポート', '', `生成: ${new Date().toISOString()}`, '');
  const section = (title: string, ids: string[]) => {
    lines.push(`## ${title}（${ids.length}）`, '');
    if (ids.length) lines.push(ids.sort().join(', '));
    lines.push('');
  };
  section('採用：新規パース可能カード', report.adopted_new);
  section('採用：純改善（無損失で情報増）', report.adopted_gain);
  section('採用：効果単位の純改善（同カードの MANUAL/PARTIAL は不可侵のまま AUTO 効果だけ収穫）', report.adopted_partial);
  section('採用：手書き効果の新規追加（manualEffects が足した effectId を live へ落とす）', report.adopted_manual_add);
  section('温存：手修正(MANUAL/PARTIAL)', report.preserved_manual);
  section('温存：要レビュー（再生成で損失/値変更/混在＝パーサー改善候補）', report.preserved_held);
  section('温存：パーサーが効果0（既存維持）', report.preserved_emptyFresh);
  section('温存：parseStatusのみ差（PARTIAL刻印＝実体同一）', report.preserved_metaOnly);
  section('要レビュー：effectId 集合が live と fresh でズレた混在カード（§6.4 O-39・fresh は docs/_idset_fresh.json）',
    report.preserved_idset);
  writeFileSync(join(root, 'docs', 'effects_merge_report.md'), lines.join('\n'), 'utf-8');
  console.log('レポート: docs/effects_merge_report.md');
}

// ── 無言フォールバック刻印の計器レポート（PLAN §5c 死角(d)・2026-07-07） ──
// parser が「条件/ステップを黙って落とす近似」をした効果の一覧。カテゴリ別件数が逓減計器。
{
  const log = getSilentFallbackLog();
  const byCat = new Map<string, number>();
  for (const e of log) for (const r of e.reasons) {
    const cat = r.split(':')[0];
    byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
  }
  const lines: string[] = [];
  lines.push('# 無言フォールバック刻印レポート（parseStatus PARTIAL 降格の理由明細）', '');
  // コミット対象レポートは同じ入力から同じ bytes を生成する（実行時刻で毎回 dirty にしない）。
  lines.push(`刻印効果 ${log.length}件`, '');
  lines.push('## カテゴリ別件数', '');
  for (const [cat, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) lines.push(`- ${cat}: ${n}`);
  lines.push('', '## 明細（effectId → 理由）', '');
  for (const e of [...log].sort((a, b) => a.effectId.localeCompare(b.effectId))) {
    lines.push(`${e.effectId}\t${e.reasons.join(' / ')}`);
  }
  lines.push('');
  writeFileSync(join(root, 'docs', '_partial_report.txt'), lines.join('\n'), 'utf-8');
  console.log(`無言フォールバック刻印: ${log.length}効果（明細 docs/_partial_report.txt）`);
}

// ── effectId → 原文ブロック 対応表（語彙センサスの効果単位判定の基盤・続き109）──
// 「原文のこの一節は、この効果のJSONで表現されているか」を効果単位で突き合わせるための対応表。
// カード単位判定（同カード別効果に語彙があれば合格）の死角(b)を消す。
// ⚠parser 由来の effectId のみ。curated 側が別の採番（-E1b / -MULTIENA / 手動追加で番号がずれた等）
//   を使っている効果は下の位置合わせで解決し、それでも残るものだけセンサス側がカード全文へ fallback。
{
  const src: Record<string, string> = Object.fromEntries([...getSourceTextLog()]);

  // ── curated effectId ↔ parser 原文ブロックの位置合わせ（2026-07-19 続き217）──
  // curated JSON は手修正で採番が parser とずれることがある（1ブロックを -E1/-E1b に分割・
  // -MULTIENA/-DECORE の意味的サフィックス・手動追加で以降の番号がシフト等）。ID が一致しないと
  // センサスがその効果を「カード全文」で判定してしまい、他ブロックの語彙で誤合格/誤不合格になる。
  // BURST は ID が一致するので別扱いにし、残りは「curated 順 × parser 解析順」で件数が一致する
  // ときだけ位置合わせする。さらにマーカー（【常】【自】【起】【出】＋絆）と effectType の
  // 整合を全ペアで検査し、1つでも矛盾したら そのカードは位置合わせしない（誤対応で計器を汚さない）。
  const isBurstId = (id: string) => /-BURST$/.test(id);
  const markerOf = (text: string): string | null => {
    const m = /^【(絆)?(常|自|起|出)】/.exec(text.trim());
    return m ? m[2] : null;
  };
  const kizunaOf = (text: string) => /^【絆(常|自|起|出)】/.test(text.trim());
  // マーカー → 許容される effectType（【出】は ON_PLAY の AUTO として出る）
  const MARKER_TYPES: Record<string, Set<string>> = {
    常: new Set(['CONTINUOUS']),
    自: new Set(['AUTO']),
    起: new Set(['ACTIVATED']),
    出: new Set(['AUTO']),
  };
  const freshByCard = new Map<string, Array<[string, string]>>();
  for (const [id, text] of getSourceTextLog()) {
    const card = id.replace(/-(BURST|MULTIENA|DECORE|E\d+[a-z]?)$/, '');
    if (!freshByCard.has(card)) freshByCard.set(card, []);
    freshByCard.get(card)!.push([id, text]);
  }
  const alignReport: string[] = [];
  let aligned = 0, rejected = 0, unresolved = 0;
  for (const [cardNum, effs] of Object.entries(result)) {
    if (!Array.isArray(effs)) continue;
    const curatedNb = effs.map(e => e?.effectId as string).filter(id => id && !isBurstId(id));
    if (curatedNb.every(id => src[id] !== undefined)) continue;   // 既に全解決
    const freshNb = (freshByCard.get(cardNum) ?? []).filter(([id]) => !isBurstId(id));
    if (curatedNb.length !== freshNb.length) {
      unresolved += curatedNb.filter(id => src[id] === undefined).length;
      alignReport.push(`SKIP(件数不一致) ${cardNum}: curated ${curatedNb.length} vs parser ${freshNb.length}`);
      continue;
    }
    // マーカー整合を全ペアで検査
    const byId = new Map(effs.map(e => [e?.effectId as string, e]));
    const bad: string[] = [];
    for (let i = 0; i < curatedNb.length; i++) {
      const eff = byId.get(curatedNb[i]) as Record<string, unknown>;
      const text = freshNb[i][1];
      const mk = markerOf(text);
      if (!mk) continue;                                          // マーカー無しブロックは検査対象外
      const et = eff?.effectType as string;
      if (et && !MARKER_TYPES[mk].has(et)) bad.push(`${curatedNb[i]}(${et}) vs ${mk}`);
      if (kizunaOf(text) !== !!eff?.kizunaIcon) bad.push(`${curatedNb[i]} kizuna不一致`);
    }
    if (bad.length > 0) {
      rejected++;
      unresolved += curatedNb.filter(id => src[id] === undefined).length;
      alignReport.push(`REJECT(マーカー不整合) ${cardNum}: ${bad.join(' / ')}`);
      continue;
    }
    // ⚠位置合わせが成立したカードは「位置」が正＝既存の ID 完全一致も上書きする。
    //   curated が途中に効果を挿した場合、以降の同名 ID は別ブロックを指しているため
    //   （例 WXK01-028: curated E1,E2,E2b,E3 ↔ parser E1,E2,E3,E4＝curated E3 の実体は parser E4）。
    for (let i = 0; i < curatedNb.length; i++) {
      const prev = src[curatedNb[i]];
      if (prev === freshNb[i][1]) continue;
      src[curatedNb[i]] = freshNb[i][1];
      aligned++;
      alignReport.push(`${prev === undefined ? 'ALIGN ' : 'REMAP '}${cardNum}: ${curatedNb[i]} ← ${freshNb[i][0]}「${freshNb[i][1].slice(0, 40)}」`);
    }
  }
  console.log(`原文ブロック位置合わせ: 解決 ${aligned}効果 / マーカー不整合で棄却 ${rejected}カード / 未解決 ${unresolved}効果`);
  writeFileSync(join(root, 'docs', '_srctext_align.txt'),
    ['# effectId ↔ 原文ブロック 位置合わせレポート（build:effects 生成）', '',
      `解決 ${aligned} / 棄却カード ${rejected} / 未解決 ${unresolved}`, '', ...alignReport.sort(), ''].join('\n'), 'utf-8');

  const sorted = Object.fromEntries(Object.entries(src).sort((a, b) => a[0].localeCompare(b[0])));
  writeFileSync(join(root, 'docs', '_effect_srctext.json'), JSON.stringify(sorted), 'utf-8');
  console.log(`原文ブロック対応表: ${Object.keys(sorted).length}効果（docs/_effect_srctext.json）`);
}

const total = Object.values(result).flat().length;
console.log(`効果あり: ${parsed}枚 / 合計${total}効果 / UNKNOWN: ${unknown}件`);

// JSON出力（5ファイルに分割）
const groups: Record<string, Record<string, ReturnType<typeof parseCardEffects>>> = {
  WXDi: {}, WX24_26: {}, WXK: {}, WX: {}, misc: {},
};
for (const [cardNum, effects] of Object.entries(result)) {
  if (/^WXDi/i.test(cardNum))         groups.WXDi[cardNum]    = effects;
  else if (/^WX2[4-6]/.test(cardNum)) groups.WX24_26[cardNum] = effects;
  else if (/^WXK/.test(cardNum))       groups.WXK[cardNum]     = effects;
  else if (/^WX(0[0-9]|1[0-9]|2[0-3]|EX)/.test(cardNum)) groups.WX[cardNum] = effects;
  else                                 groups.misc[cardNum]    = effects;
}
const fileMap: Record<string, string> = {
  WX:      'effects_WX.json',
  WXDi:    'effects_WXDi.json',
  WX24_26: 'effects_WX24_26.json',
  WXK:     'effects_WXK.json',
  misc:    'effects_misc.json',
};
for (const [key, fname] of Object.entries(fileMap)) {
  const outPath = join(root, 'public/data', fname);
  writeFileSync(outPath, JSON.stringify(groups[key]), 'utf-8');
  console.log(`出力: ${fname} (${Object.keys(groups[key]).length}件)`);
}
