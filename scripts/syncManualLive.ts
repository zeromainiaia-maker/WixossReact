/**
 * syncManualLive.ts — **`manualEffects.ts` の手修正を live（effects_*.json）へ届ける**ための同期ツール。
 *
 * ## なぜ要るか
 * `build:effects` の収穫マージは **`parseStatus` が `MANUAL`／`PARTIAL` の効果を不可侵**として扱う
 * （`PRESERVE_STATUSES`）。これは「人が直したものを parser が壊さない」ための保護だが、
 * **人が `manualEffects.ts` の既存 id を書き直したとき**も同じ保護が効いて live に届かない
 * （新しい id の追加だけは `adopted_manual_add` で通る）。
 * その結果、直したはずの効果が `docs/_partial_fresh.json` へ回るだけで live は古いまま残る。
 *
 * 実際に3セッション連続で踏んだ（`WX20-069`／`WXDi-P07-010`／`WX22-016`）ので専用ツールにした。
 *
 * ## 使い方
 *   npx tsx scripts/syncManualLive.ts <CardNum> [<CardNum> ...]   # 同期する
 *   npx tsx scripts/syncManualLive.ts --dry <CardNum> ...          # 差分だけ表示（書き込まない）
 *   npx tsx scripts/syncManualLive.ts --condition-only <CardNum>:<EffectId> ...
 *     # fresh/manual 合成結果のトップレベル condition だけを既存 live effect へ同期する
 *   npx tsx scripts/syncManualLive.ts --effect <CardNum>:<EffectId> ...
 *     # 🆕**その effectId の1件だけ**を同期する（他の効果は live のまま触らない・§5.3 `O-220`・2026-09-02）
 *     # 🔴**カード単位の同期が使えない場合の逃げ道**＝同じカードの別効果について
 *     #   **live のほうが新しい**ことがある（parser が後から粗い STUB へ退化した等）。
 *     #   カード丸ごと書くとその改善を巻き戻すので、直した効果だけを届ける。
 *     #   ⚠id 集合は変わらない（既存 id にしか書かない）＝`--allow-idset-change` は不要。
 *
 * ## 規約
 * - **カード単位**で `mergeManualEffects(parseCardEffects(row))` の結果をそのまま live へ書く
 *   ＝parser の最新結果＋手修正の合成。`parseStatus` は生成側の値をそのまま残す。
 * - `appearanceCondition`（出現条件＝カード単位メタ）は既存 live の値を引き継ぐ
 *   （`build:effects` がカード単位で付け直すフィールドなので、ここで落とすと次回の差分になる）。
 * - ⚠**実行後は必ず `npm run gates`**（live を直接書くのでゲートだけが安全網）。
 * - 🔴**id 集合が変わるカードは書かずにスキップする**（2026-08-29 続き718）＝カード単位で丸ごと書くので、
 *   **live にしか無い effectId は消え**、**manual の古い shadow が parser の新しい id と二重になる**と
 *   **同じ能力が2回発動する**。⚠**どちらも `npm run gates` では1つも赤くならない**（id 集合を見る計器が無い）。
 *   意図してやるときだけ `--allow-idset-change`。
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EFFECT_FILES = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const conditionOnly = args.includes('--condition-only');
const effectOnly = args.includes('--effect');
const specs = args.filter(a => !a.startsWith('--'));
const ids = (conditionOnly || effectOnly) ? [...new Set(specs.map(s => s.split(':', 1)[0]))] : specs;
if (ids.length === 0) {
  console.error('使い方: npx tsx scripts/syncManualLive.ts [--dry] <CardNum> [<CardNum> ...]');
  process.exit(1);
}

// CSV 行を集める（先勝ち＝decompile/build と同じ規約）
const rows = new Map<string, Record<string, string>>();
for (const f of [...Array.from({ length: 10 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(p, 'utf-8').replace(/^﻿/, ''), {
    header: true, skipEmptyLines: true,
  });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !rows.has(id)) rows.set(id, r); }
}

let changed = 0;
let skipped = 0;
for (const id of ids) {
  const row = rows.get(id);
  if (!row) { console.error(`  ✗ ${id}: CSV に無い`); continue; }
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const fresh = mergeManualEffects(id, parseCardEffects({ ...(row as any), effects: [] }));
  let found = false;
  for (const f of EFFECT_FILES) {
    const p = join(root, 'public/data', f);
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const j = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, any[]>;
    if (!j[id]) continue;
    found = true;
    const appearance = j[id][0]?.appearanceCondition;
    let next = fresh.map((e, i) => (i === 0 && appearance ? { ...e, appearanceCondition: appearance } : e));
    if (effectOnly) {
      // 🆕**指定した effectId だけを差し替える**（§5.3 `O-220`・2026-09-02）。
      //   ⚠**live に無い id は無視する**＝id 集合を増やさない（上のガードと同じ思想）。
      const wanted = new Set(specs.filter(sp => sp.startsWith(`${id}:`)).map(sp => sp.slice(id.length + 1)));
      const missing = [...wanted].filter(w => !fresh.some(e => e.effectId === w));
      if (missing.length) throw new Error(`${id}: 合成結果に ${missing.join(',')} が無い`);
      next = j[id].map(existing => {
        if (!wanted.has(existing.effectId)) return existing;
        const generated = fresh.find(e => e.effectId === existing.effectId)!;
        // `appearanceCondition` はカード単位メタなので既存を引き継ぐ（カード単位同期と同じ規約）。
        return existing.appearanceCondition ? { ...generated, appearanceCondition: existing.appearanceCondition } : generated;
      });
    }
    if (conditionOnly) {
      next = j[id].map(existing => {
        const spec = specs.find(s => s.startsWith(`${id}:`));
        if (!spec || existing.effectId !== spec.slice(id.length + 1)) return existing;
        const generated = fresh.find(e => e.effectId === existing.effectId);
        if (!generated?.condition) throw new Error(`${spec}: fresh/manual 合成結果に condition が無い`);
        return { ...existing, condition: generated.condition };
      });
    }
    // 🔴**id 集合が変わるカードは書かない**（2026-08-29 続き718・§5.3 `O-144` で踏んだ）。
    //   このツールは `mergeManualEffects(parseCardEffects(row))` を**カード単位で丸ごと**書くので、
    //   **live にしか無い effectId（手で足した live 限定の能力）は消える**し、
    //   **manual の古い shadow が parser の新しい id と二重になる**と**同じ能力が2回発動する**。
    //   実測＝`WX24-P2-049` は `-E1b`（【自】バトルでバニッシュしたとき…パワー＋）が**丸ごと消え**、
    //   `WXDi-P13-050` は 【出】が **E2 と E1b の二重**になった。
    //   ⚠**どちらも `npm run gates` では1つも赤くならない**（golden も census も id 集合を見ていない）。
    //   ⇒ **fail-closed で止める**（意図してやるときだけ `--allow-idset-change`）。
    if (!conditionOnly && !effectOnly && !args.includes('--allow-idset-change')) {
      const liveIds = (j[id] ?? []).map((e: { effectId?: string }) => e.effectId).filter(Boolean) as string[];
      const nextIds = next.map((e: { effectId?: string }) => e.effectId).filter(Boolean) as string[];
      const lost = liveIds.filter(x => !nextIds.includes(x));
      const added = nextIds.filter(x => !liveIds.includes(x));
      if (lost.length || added.length) {
        console.error(`  ✗ ${id}: **id 集合が変わるのでスキップした**（消える=[${lost.join(',')}] 増える=[${added.join(',')}]）`);
        console.error(`     ⇒ manual の shadow と live/parser の id を先に揃えること（それでも書くなら --allow-idset-change）。`);
        skipped++;
        break;
      }
    }
    if (JSON.stringify(j[id]) === JSON.stringify(next)) { console.log(`  = ${id}: 差分なし（${f}）`); break; }
    console.log(`  ~ ${id}（${f}）`);
    console.log(`      OLD ${JSON.stringify(j[id]).slice(0, 240)}`);
    console.log(`      NEW ${JSON.stringify(next).slice(0, 240)}`);
    if (!dryRun) {
      j[id] = next;
      // 🔴**ミニファイ1行で書き戻す**（`buildEffectsJson.ts:477` と同じ形＝リポジトリ規約・CODEX_GUIDE §5-9）。
      //   2026-08-29 続き711 で発覚＝ここが `JSON.stringify(j, null, 2)` で **pretty-print** していたため、
      //   続き710 が `syncManualLive` を回した `effects_WX.json` だけが**1行 → 117,992行**に化け、
      //   次の `npm run build:effects` が元へ戻すときに**118,496行の削除**という巨大 diff を生んだ。
      //   ⚠**中身は同じなので計器にもゲートにも一切映らない**（見えるのは commit の diff だけ）。
      writeFileSync(p, JSON.stringify(j), 'utf-8');
      changed++;
    }
    break;
  }
  if (!found) console.error(`  ✗ ${id}: effects_*.json に無い`);
}
console.log(dryRun ? '(--dry: 書き込みなし)' : `${changed}枚を同期。⚠ npm run gates を回すこと。`);
if (skipped > 0) {
  console.error(`🔴 ${skipped}枚を id 集合の変化でスキップした（上の ✗ 行）。**放置せず manual 側を直すか §5.3 へ登録すること。**`);
  process.exitCode = 1;
}
