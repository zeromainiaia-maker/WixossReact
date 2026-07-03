/**
 * GRANT_LRIG_ABILITY abilities:[] の curated ノードに対し、parser（parseCardEffects）の
 * 展開結果から abilities を抽出して提示する（--write で JSON にパッチ）。
 */
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData } from '../src/types';
import type { CardEffect, EffectAction, GrantLrigAbilityAction } from '../src/types/effects';
import { parseCardEffects } from '../src/data/effectParser';

const root = process.cwd();
const WRITE = process.argv.includes('--write');

const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}

// 書き込み対象: クリーン展開の 10 ノード。
// 除外→MANUAL化: WX15-016-E1（条件をIS_MY_TURN誤約＝相手ターントリガーで恒久false）・WD21-009-E1（多段閾値平坦化＝無条件ガード封じ/トリクラ付与の過剰発火）・
//   PR-204-E1（支払いゲート脱落＝毎アタック無償ルリグアップ）・PR-238-E1（枚数比例ミル平坦化）
const targets: Record<string, string[]> = {
  'effects_WX.json': ['WX19-014-E1'],
  'effects_WXDi.json': ['WXDi-P06-004-E1', 'WXDi-P06-005-E1', 'WXDi-P07-003-E1', 'WXDi-P07-004-E1', 'WXDi-P07-005-E1', 'WXDi-P15-001-E1'],
  'effects_misc.json': ['PR-257-E1', 'PR-258-E1', 'PR-317-E1'],
};
const manualize: Record<string, string[]> = {
  'effects_WX.json': ['WX15-016-E1'],
  'effects_misc.json': ['WD21-009-E1', 'PR-204-E1', 'PR-238-E1'],
};

const collectGLA = (a: EffectAction | undefined, out: GrantLrigAbilityAction[]) => {
  if (!a || typeof a !== 'object') return;
  if (a.type === 'GRANT_LRIG_ABILITY') out.push(a as GrantLrigAbilityAction);
  for (const v of Object.values(a)) {
    if (Array.isArray(v)) v.forEach(x => collectGLA(x as EffectAction, out));
    else if (v && typeof v === 'object') collectGLA(v as EffectAction, out);
  }
};

for (const [file, effIds] of Object.entries(targets)) {
  const p = join(root, 'public/data', file);
  const rawFile = fs.readFileSync(p, 'utf-8');
  const eol = rawFile.endsWith('\n') ? '\n' : '';
  const j = JSON.parse(rawFile) as Record<string, CardEffect[]>;
  let patched = 0;
  for (const effId of effIds) {
    const cardNum = effId.replace(/-E\d+$/, '');
    const card = cardMap.get(cardNum);
    if (!card) { console.log(`✗ ${effId}: card not found`); continue; }
    const parsed = parseCardEffects({ ...card });
    // parser 出力から abilities 展開済み GLA ノードを収集
    const parserGLAs: GrantLrigAbilityAction[] = [];
    for (const pe of parsed) collectGLA(pe.action, parserGLAs);
    const withAb = parserGLAs.filter(g => g.abilities && g.abilities.length > 0);
    // curated 側の空ノード
    const curEffs = j[cardNum] ?? [];
    const cur = curEffs.find(e => e.effectId === effId);
    if (!cur) { console.log(`✗ ${effId}: curated effect not found`); continue; }
    const curGLAs: GrantLrigAbilityAction[] = [];
    collectGLA(cur.action, curGLAs);
    const empty = curGLAs.filter(g => (!g.abilities || g.abilities.length === 0) && !/^[。、\s]*$/.test((g.rawText ?? '')));
    console.log(`\n══ ${effId} ══ parser GLA(展開済): ${withAb.length} / curated 空: ${empty.length}`);
    if (withAb.length === 0) { console.log(`  → parser も展開できず（サブパース不能）`); continue; }
    for (const g of withAb) {
      console.log(`  parser abilities (${g.abilities.length}):`);
      for (const ab of g.abilities) {
        console.log(`   - [${ab.effectType}${ab.timing ? '/' + ab.timing.join(',') : ''}] status=${ab.parseStatus} action=${ab.action?.type}${ab.action?.type === 'SEQUENCE' ? '(' + (ab.action as { steps: EffectAction[] }).steps.map(s => s.type).join(',') + ')' : ''}`);
      }
    }
    if (WRITE && empty.length === 1 && withAb.length === 1) {
      empty[0].abilities = withAb[0].abilities;
      patched++;
      console.log(`  ✔ patched`);
    } else if (WRITE) {
      console.log(`  ⚠ skip（対応が1:1でない）`);
    }
  }
  if (WRITE && patched > 0) {
    fs.writeFileSync(p, JSON.stringify(j) + eol, 'utf-8');
    console.log(`\n→ ${file} に ${patched} 件書き込み`);
  }
}
