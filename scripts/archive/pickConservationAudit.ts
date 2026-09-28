// 公開／探す → 選んだカードを動かす 全効果の保存則検査（2026-09-29・バグ報告 393a4ab0 の同型調査）。実行: npx tsx scripts/archive/pickConservationAudit.ts（リポジトリ直下で）
import fs from 'fs'; import { join } from 'path'; import Papa from 'papaparse';
import * as X from '../../src/engine/effectExecutor';
import { matchesFilter, canAddToSelection, satisfiesSelectionConstraint } from '../../src/engine/execUtils';
import type { CardEffect } from '../../src/types/effects';

const cardMap = new Map<string, any>();
for (const f of fs.readdirSync('public/data').filter(f => f.endsWith('.csv'))) {
  const { data } = Papa.parse<any>(fs.readFileSync(join('public/data', f), 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r); }
}
const effectsMap = new Map<string, CardEffect[]>();
for (const f of fs.readdirSync('public/data').filter(f => f.startsWith('effects'))) {
  const j = JSON.parse(fs.readFileSync(join('public/data', f), 'utf-8'));
  for (const [id, e] of Object.entries(j)) effectsMap.set(id, e as CardEffect[]);
}
const inst = new Proxy(cardMap, { get(t, p) { if (p === 'get') return (k: string) => t.get(k.split('#')[0]); const v = (t as any)[p]; return typeof v === 'function' ? v.bind(t) : v; } });
const signis = [...cardMap.values()].filter(c => c.CardType === 'シグニ').map(c => c.CardNum);
const byClass = new Map<string, string[]>();
for (const c of cardMap.values()) if (c.CardType === 'シグニ') { const k = (c.CardClass ?? '').split('：').pop(); (byClass.get(k) ?? byClass.set(k, []).get(k)!).push(c.CardNum); }

let seq = 0; const I = (n: string) => `${n}#p${++seq}`;
let seed = 1; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

let matchPool: string[] = [];
const allCards = [...cardMap.values()];
function findFilters(n: any, out: any[] = []): any[] { if (!n || typeof n !== 'object') return out; if (Array.isArray(n)) { n.forEach(x => findFilters(x, out)); return out; }
  if (PICK_TYPES_G.has(n.type) && n.filter) out.push(n.filter); for (const k in n) findFilters(n[k], out); return out; }
const PICK_TYPES_G = new Set(['REVEAL_AND_PICK', 'SEARCH']);
function mkDeck(src: string, n: number): string[] {
  const cls = (cardMap.get(src)?.CardClass ?? '').split('：').pop();
  const same = matchPool.length ? matchPool : (byClass.get(cls) ?? []);
  return Array.from({ length: n }, (_, i) => I((matchPool.length ? i % 4 !== 3 : i % 2 === 0) && same.length ? pick(same) : pick(signis)));
}
function st(src: string, isSelf: boolean): any {
  return {
    deck: mkDeck(src, 30), lrig_deck: [], hand: mkDeck(src, 5), life_cloth: mkDeck(src, 5), trash: mkDeck(src, 12), lrig_trash: [],
    energy: mkDeck(src, 8), coins: 3, bonds: [], excluded: [],
    field: { lrig: [], signi: isSelf ? [[`${src}#src`], [I(pick(signis))], null] : [[I(pick(signis))], [I(pick(signis))], [I(pick(signis))]],
      signi_down: [false, false, false], signi_frozen: [false, false, false], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], signi_traps: [null, null, null] },
  };
}
const where = (s: any, o: any, id: string): string[] => {
  const out: string[] = [];
  const scan = (side: string, x: any, path: string) => {
    if (x == null) return;
    if (typeof x === 'string') { if (x === id) out.push(`${side}.${path}`); return; }
    if (Array.isArray(x)) { x.forEach(v => scan(side, v, path)); return; }
    if (typeof x === 'object') for (const k of Object.keys(x)) {
      if (['actions_done', 'keyword_grants', 'story_overrides', 'energy_placements', 'publiclyRevealedCards', 'turn_end_field_trash_targets', 'temp_power_mods', 'power_mods_until_opp_turn', 'power_mods'].includes(k)) continue;
      if (/_this_turn|_history|_log|last_|_names|_ids$|marks?$|instances$/.test(k)) continue;
      scan(side, x[k], path ? `${path}.${k}` : k);
    }
  };
  scan('自', s, ''); scan('相', o, '');
  return out;
};

const PICK_TYPES = new Set(['REVEAL_AND_PICK', 'SEARCH']);
const hasPick = (n: any): boolean => !!n && typeof n === 'object' && (PICK_TYPES.has(n.type) || Object.values(n).some(hasPick));
const findings: string[] = []; let covered = 0, total = 0;
const hitIds = new Set<string>();

for (const [card, effs] of effectsMap) {
  for (const eff of effs) {
    if (!hasPick(eff.action)) continue;
    total++;
    const fs0 = findFilters(eff.action);
    matchPool = [];
    if (fs0.length) { try { matchPool = allCards.filter(c => fs0.some(f => { try { return matchesFilter(c, f); } catch { return false; } })).map(c => c.CardNum); } catch { matchPool = []; } }
    for (let trial = 0; trial < 6; trial++) {
      seed = trial * 7919 + card.length * 31 + total;
      const ctx: any = { ownerState: st(card, true), otherState: st(card, false), cardMap: inst, effectsMap, logs: [], sourceCardNum: `${card}#src`, triggeringCardNum: `${card}#src`, currentPhase: 'MAIN' };
      let r: any; try { r = X.executeEffect(eff, ctx); } catch { break; }
      let steps = 0; let hit = false;
      while (!r.done && steps++ < 30) {
        const p = r.pending; const c = { ...ctx, ownerState: r.ownerState, otherState: r.otherState, logs: r.logs, lastProcessedCards: r.lastProcessedCards, storedTargetCards: r.storedTargetCards ?? ctx.storedTargetCards };
        try {
          if (p.type === 'SEARCH') {
            const vis: string[] = p.visibleCards ?? [];
            const n = Math.min(p.maxPick ?? 1, vis.length);
            // UI と同じ選び方＝選択制約（レベルの異なる／名前の異なる 等）を守って1枚ずつ足す
            const picked: string[] = [];
            for (const v of vis) {
              if (picked.length >= n) break;
              if (p.selectionConstraint && !canAddToSelection(picked, v, p.selectionConstraint, inst)) continue;
              picked.push(v);
            }
            if (p.selectionConstraint && !satisfiesSelectionConstraint(picked, p.selectionConstraint, inst)) { r = X.resumeSearch([], p, c); continue; }
            const beforeLoc = new Map(picked.map((id: string) => [id, where(c.ownerState, c.otherState, id).join(',')]));
            const logsBefore = c.logs.length;
            r = X.resumeSearch(picked, p, c);
            if (picked.length > 0) {
              hit = true; hitIds.add(eff.effectId);
              // 対話で止まったら後段で動く可能性があるので、完了時だけ判定する
              const settle = () => {};
              settle();
              if (r.done) for (const id of picked) {
                const now = where(r.ownerState, r.otherState, id);
                const then = p.thenAction?.type;
                const bad = now.length !== 1 ? `件数=${now.length}（${now.join(',') || '消滅'}）`
                  : now[0] === beforeLoc.get(id) && !['TRANSFER_TO_DECK', 'POWER_MODIFY', 'GRANT_KEYWORD', 'REMOVE_ABILITIES', 'REARRANGE_SIGNI', 'BANISH'].includes(then) ? `動いていない（${now[0]}）` : '';
                if (bad) findings.push(`${eff.effectId}\tthen=${then}/${p.thenAction?.source?.type ?? ''}\t${bad}\tlog=${r.logs.slice(logsBefore).join(' / ')}`);
              }
            }
          } else if (p.type === 'CHOOSE') {
            const o = p.options.find((x: any) => x.available !== false) ?? p.options[0];
            r = p.multiSelect ? X.resumeChoose([o.id], p, c) : X.resumeChoose(o.id, p, c);
          } else if (p.type === 'SELECT_TARGET') r = X.resumeSelectTarget(p.candidates.slice(0, Math.min(p.count ?? 1, p.candidates.length)), p, c);
          else if (p.type === 'LOOK_AND_REORDER') r = X.resumeLookAndReorder(p.cards ?? [], [], p, c);
          else if (p.type === 'REVEAL_CARDS') r = X.resumeRevealCards(p, c);
          else if (p.type === 'SELECT_ZONE') r = X.resumeSelectZone(0, p, c);
          else if (p.type === 'SELECT_SIGNI_ZONE') r = X.resumeSelectSigniZone(2, p, c);
          else if (p.type === 'SELECT_VIRUS_ZONE') r = X.resumeSelectVirusZone(0, p, c);
          else break;
        } catch { break; }
      }
      if (hit) { covered++; break; }
    }
  }
}
console.log(`対象効果 ${total} / 選択まで到達 ${covered}`);
const uniq = [...new Set(findings)];
console.log(`食い違い ${uniq.length}件（効果 ${new Set(uniq.map(l => l.split('\t')[0])).size}）`);
uniq.forEach(l => console.log(l.slice(0, 300)));
