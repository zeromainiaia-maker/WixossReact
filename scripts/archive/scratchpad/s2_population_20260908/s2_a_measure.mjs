import {
  SRC, LIVE, LIVE_BY_CARD, cardOf, walkNodes, hasKey, hasType, raw, scan, report,
} from './tmp_s2_lib.mjs';

const C1_KNOWN = [
  'WX24-D5-05-E1', 'PR-305-E1', 'WXDi-P00-038-E1', 'WXDi-P14-031-E1',
  'WXDi-CP02-059-E1', 'WX24-P1-004-E1', 'WX24-P2-080-E1', 'WX25-P3-007-E1',
  'WX25-P3-032-E2', 'WX26-CP1-001-E1',
];
const C2_KNOWN = [
  'WXK11-036-E2', 'WXDi-P00-042-E1', 'WX24-P3-089-E1', 'WX24-P3-090-E1',
  'WX25-P1-101-E2', 'WX10-015-E1', 'WXDi-D07-013-E1', 'WXDi-P08-059-E2',
  'WX26-CP1-048-E2',
];
const C3_TOP_KNOWN = ['WXDi-P09-050-E1', 'WXDi-P10-047-E2'];
const C3_SHUFFLE_KNOWN = ['WX25-P2-066-E1', 'WX25-CP1-002-E1', 'WXDi-P10-033-E2'];

export const C1_RE = /(?:(?:(?:次の){1,2}(?:あなた|対戦相手)?の?|このターンの、?次の)[^。]{0,30}(?:フェイズ|ステップ)(?:開始時|終了時)(?:に|、)|そのバトル終了時(?:に|、)|このターン[、の]次に[^。]{0,60}(?:アタックしたとき|アタックによって[^。]{0,30}クラッシュされる場合)|このターン、[^。]{0,45}パワーが[０0]以下になったとき|このターン、それがアタックしたとき)/;
export const C2_RE = /(?:(?:トラッシュ|エナゾーン)に(?:置いて|捨てて)|【エナチャージ[０-９\d]+】をして|手札に加えて|(?:カードを[０-９\d]+枚)?引いて|(?:表向きにして|カードを)?公開して)もよい/;
export const C2_DECK_LIFE_TRASH_RE = /(?:(?:あなた|対戦相手)のデッキの(?:上から|一番下)[^。]{0,45}トラッシュに置いてもよい|(?:あなた|対戦相手)のデッキの一番上を見る。(?:あなたは)?(?:それ|そのカード)をトラッシュに置いてもよい|(?:あなた|対戦相手)のライフクロス(?:の一番上を見る。(?:あなたは)?(?:それ|そのカード)を|[０-９\d]+枚を)トラッシュに置いてもよい)/;
export const C2_OPP_ENERGY_RE = /対戦相手は【エナチャージ[０-９\d]+】をしてもよい/;
export const C3_TOP_RE = /一番上に(?:戻し|置き)[^。]{0,30}残り/;
export const C3_SHUFFLE_RE = /(?:残り|それら(?:のカード)?)[^。]{0,20}シャッフルして[^。]{0,30}一番下/;

const DELAY_TYPES = [
  'INSTALL_DELAYED_TRIGGER', 'DELAY_TO_NEXT_OPP_ATTACK_PHASE',
  'DELAY_TO_NEXT_OPP_TURN_END', 'DELAY_TO_NEXT_OWN_TURN_END',
];
const DELAY_STUB_RE = /(?:DELAY|NEXT_(?:OWN|OPP|ATTACK|TURN)|FACEDOWN.*(?:FLIP|RETURN)|LOOK_PLACE_FACEDOWN)/;

function stubIds(json) {
  const out = [];
  walkNodes(json, n => { if (n.type === 'STUB' && typeof n.id === 'string') out.push(n.id); });
  return [...new Set(out)];
}

function actionTypes(json) {
  const out = [];
  walkNodes(json, n => { if (typeof n.type === 'string') out.push(n.type); });
  return [...new Set(out)];
}

function hasDelayedReceptacle(json, id) {
  if (hasType(json, ...DELAY_TYPES)) return true;
  if (hasType(json, 'NEGATE_ATTACK', 'PREVENT_NEXT_DAMAGE', 'REPLACE_NEXT_DAMAGE_WITH_MILL')) return true;
  const serialized = raw(json);
  if (/"actionId":"NEGATE_NEXT_/.test(serialized)
    || /"delayUntil|"returnTiming":"NEXT_/.test(serialized)
    || serialized.includes('"PRDI035_PARADISE_COLOR"')) return true;
  let grantedAuto = false;
  walkNodes(json, n => {
    if (n !== json && n.effectType === 'AUTO' && Array.isArray(n.timing)
      && n.timing.some(t => /(?:ATTACK|PHASE|TURN|BATTLE)/.test(t))) grantedAuto = true;
  });
  if (grantedAuto) return true;
  if (stubIds(json).some(x => DELAY_STUB_RE.test(x))) return true;
  return (LIVE_BY_CARD[cardOf(id)] ?? []).some(e =>
    e.effectId !== id && e.effectType === 'AUTO' && Array.isArray(e.timing)
    && e.timing.some(t => /(?:PHASE|TURN|ATTACK|BATTLE)/.test(t))
    && raw(e).includes('sourceEffectId'));
}

function hasNoOpChoice(json) {
  let found = false;
  walkNodes(json, n => {
    if (n.type !== 'CHOOSE' || !Array.isArray(n.choices)) return;
    found ||= n.choices.some(c =>
      /(?:しない|ない|何もしない|スキップ)/.test(String(c?.label ?? ''))
      || c?.action?.type === 'NO_OP'
      || (c?.action?.type === 'STUB' && /(?:NO_?OP|SKIP)/.test(String(c.action.id ?? ''))));
  });
  const s = raw(json);
  return found || /"label":"[^"]*(?:しない|ない|何もしない|スキップ)[^"]*"/.test(s)
    || /"id":"[^"]*(?:NO_?OP|SKIP)[^"]*"/.test(s);
}

function hasOptionalStub(json) {
  return /"id":"[^"]*OPTIONAL[^"]*"/.test(raw(json));
}

function hasGeneralOptionalSignal(json) {
  const s = raw(json);
  return /"optional":true/.test(s)
    || /"upToCount":true/.test(s)
    || /"upTo":true/.test(s)
    || /"canTrash":true/.test(s)
    || /"selfTrashCost":true/.test(s)
    || /"useTimeCost":\{/.test(s)
    || hasNoOpChoice(json)
    || hasOptionalStub(json);
}

function hasRelevantTrashOptional(json) {
  let found = false;
  walkNodes(json, n => {
    if (n.type === 'MILL' && n.optional === true) found = true;
    if (n.type === 'TRASH' && n.optional === true
      && ['DECK_CARD', 'LIFE_CLOTH_CARD'].includes(n.target?.type)) found = true;
    if (n.type === 'SEQUENCE' && Array.isArray(n.steps)) {
      for (let i = 1; i < n.steps.length; i++) {
        const cur = n.steps[i];
        const relevant = cur?.type === 'MILL'
          || (cur?.type === 'TRASH' && ['DECK_CARD', 'LIFE_CLOTH_CARD'].includes(cur.target?.type));
        if (relevant && n.steps[i - 1]?.type === 'STUB'
          && /OPTIONAL/.test(String(n.steps[i - 1].id ?? ''))) found = true;
      }
    }
  });
  const s = raw(json);
  return found
    || /"type":"LIFE_CRASH_REPLACE"[^}]*"optional":true/.test(s)
    || /"canTrash":true/.test(s)
    || /"useTimeCost":\{/.test(s)
    || /"id":"OPTIONAL_COST","lifeTrash":/.test(s)
    || hasNoOpChoice(json)
    || (json.effectType === 'AUTO' && json.mandatory === false);
}

function containsOppEnergyCharge(node) {
  let found = false;
  walkNodes(node, n => {
    if (n.type === 'ENERGY_CHARGE_FROM_DECK' && n.owner === 'opponent') found = true;
  });
  return found;
}

function hasRelevantOppEnergyOptional(json) {
  let found = false;
  walkNodes(json, n => {
    if (n.type === 'ENERGY_CHARGE_FROM_DECK' && n.owner === 'opponent' && n.optional === true) found = true;
    if (n.type === 'CHOOSE' && Array.isArray(n.choices)
      && n.choices.some(c => containsOppEnergyCharge(c?.action))
      && n.choices.some(c => /(?:しない|何もしない|スキップ)/.test(String(c?.label ?? ''))
        || c?.action?.type === 'NO_OP'
        || (c?.action?.type === 'STUB' && /(?:NO_OP|SKIP)/.test(String(c.action.id ?? ''))))) found = true;
    if (n.type === 'SEQUENCE' && Array.isArray(n.steps)) {
      for (let i = 0; i < n.steps.length; i++) {
        if (!containsOppEnergyCharge(n.steps[i])) continue;
        const before = n.steps.slice(0, i);
        if (before.some(s => s?.type === 'STUB' && /OPTIONAL/.test(String(s.id ?? '')))) found = true;
      }
    }
  });
  return found || (json.effectType === 'AUTO' && json.mandatory === false);
}

function hasAnyOptionalReceptacle(json) {
  const s = raw(json);
  const specialized = [
    'DISRUPT_OPP_LRIG_UNDER_BY_TYPE', 'GROW_COST_SUBSTITUTE_TRASH_SIGNI',
    'ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI', 'DECLARE_COLOR_COND_ENERGY_TRASH',
    'DAMAGE_REPLACE_BY_COST', 'RISE_BANISH_SUBSTITUTE', 'ENERGY_SUBSTITUTE_TRASH_SIGNI',
    'COOKING_BANISH_SUBSTITUTE', 'GUARD_ALTERNATIVE_COST', 'OPEN_MAGIC_BOX',
    'GAIN_ABILITY_THIS_GAME', 'SONG_FRAGMENT', 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH',
    'CONDITIONAL_TRASH_UNDER_SIGNI', 'RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE',
  ];
  return hasGeneralOptionalSignal(json)
    || (json.effectType === 'AUTO' && json.mandatory === false)
    || hasType(json, 'OPTIONAL_ACTIVATE')
    || specialized.some(id => s.includes(`"${id}"`));
}

function c2Category(src) {
  if (C2_DECK_LIFE_TRASH_RE.test(src)) return 'deck_life_trash';
  if (C2_OPP_ENERGY_RE.test(src)) return 'opp_energy';
  return 'other';
}

function c2Ok(json, _id, src) {
  const category = c2Category(src);
  if (category === 'deck_life_trash') return hasRelevantTrashOptional(json);
  if (category === 'opp_energy') return hasRelevantOppEnergyOptional(json);
  return hasAnyOptionalReceptacle(json);
}

function hasTopRestBottom(json, _id, src) {
  const s = raw(json);
  return s.includes('"first_top_rest_bottom"')
    || (src.includes('好きな枚数') && s.includes('"split_top_bottom"'))
    || s.includes('"LOOK_TOP_ONE_RETURN_REST_BOTTOM"')
    || (/"then":"deck_top"/.test(s) && /"remainder":\{"location":"deck","position":"bottom"/.test(s));
}

function hasShuffleBottom(json) {
  const s = raw(json);
  if (s.includes('"CROSS_ZONE_TRIPLE_TARGET_TO_DECK_BOTTOM"')
    || s.includes('"deckBottomShuffled"')) return true;
  let found = false;
  walkNodes(json, n => {
    const bottom = n.position === 'bottom' || n.destPosition === 'bottom'
      || n.restDestination === 'deck_bottom_shuffled' || n.restDest === 'deck_bottom_shuffled';
    if (bottom && (n.shuffle === true || /_shuffled$/.test(String(n.restDestination ?? n.restDest ?? '')))) found = true;
  });
  return found;
}

function knownCheck(label, re, ids) {
  const matched = ids.filter(id => re.test(SRC[id] ?? ''));
  console.log(`KNOWN ${label}: ${matched.length}/${ids.length}; missed=${ids.filter(id => !matched.includes(id)).join(',') || '-'}`);
}

function printResult(label, re, r) {
  console.log(`\n=== ${label} ===`);
  console.log(`regex=${re}`);
  console.log(`total=${r.total} hit=${r.hit.length} miss=${r.miss.length} nojson=${r.nojson.length}`);
  if (!process.argv.includes('--quiet-list')) {
    console.log(`HIT=${r.hit.join(',') || '-'}`);
    console.log(`MISS=${r.miss.join(',') || '-'}`);
    console.log(`NOJSON=${r.nojson.join(',') || '-'}`);
  }
  const fromArg = process.argv.find(x => x.startsWith('--from='));
  const limitArg = process.argv.find(x => x.startsWith('--limit='));
  const from = fromArg ? Number(fromArg.split('=')[1]) : 0;
  const limit = limitArg ? Number(limitArg.split('=')[1]) : r.miss.length;
  const detailIds = process.argv.includes('--hits') ? r.hit : r.miss;
  for (const id of detailIds.slice(from, from + limit)) {
    const j = LIVE[id];
    console.log(`--- ${id} [${j?.parseStatus ?? '?'}] types=${actionTypes(j).join('|')} stubs=${stubIds(j).join('|') || '-'}`);
    console.log(`SRC ${SRC[id].replace(/\s+/g, ' ')}`);
    console.log(`JSON ${raw(j)}`);
    if (label === 'C1') console.log(`CARD ${raw(LIVE_BY_CARD[cardOf(id)])}`);
  }
}

const selected = new Set(process.argv.slice(2).filter(x => !x.startsWith('--')));
const wants = label => selected.size === 0 || selected.has(label);

knownCheck('C1', C1_RE, C1_KNOWN);
knownCheck('C2', C2_RE, C2_KNOWN);
knownCheck('C3-top', C3_TOP_RE, C3_TOP_KNOWN);
knownCheck('C3-shuffle', C3_SHUFFLE_RE, C3_SHUFFLE_KNOWN);

const c1 = scan(C1_RE, hasDelayedReceptacle);
const c2 = scan(C2_RE, c2Ok);
const c3top = scan(C3_TOP_RE, hasTopRestBottom);
const c3shuffle = scan(C3_SHUFFLE_RE, hasShuffleBottom);

const CLASSIFICATION = {
  C1: {
    A: ['PR-305-E1', 'WX24-D5-05-E1', 'WX24-P1-004-E1', 'WX24-P2-080-E1',
      'WX25-P3-032-E2', 'WXDi-CP02-059-E1', 'WXDi-P00-038-E1', 'WXDi-P14-031-E1'],
    B: [],
    C: [],
    M: ['WX25-P3-007-E1', 'WX26-CP1-001-E1'],
  },
  C2: {
    A: ['WX24-P3-089-E1', 'WX24-P3-090-E1', 'WX25-P1-101-E2', 'WXDi-P00-042-E1',
      'WXK11-036-E2', 'WXDi-D07-013-E1', 'WXDi-P06-011-E1', 'WXDi-P08-059-E2',
      'WXDi-P14-064-E1'],
    B: [],
    C: ['SPDi43-05-E2', 'WX09-032-E1', 'WX24-P4-046-E2', 'WX25-P1-071-E1',
      'WXDi-P05-038-E1', 'WXEX2-09-E1'],
    M: ['WX26-CP1-048-E2', 'WDK13-017-E1'],
  },
  C3: {
    A: ['WXDi-P09-050-E1', 'WXDi-P10-047-E2', 'WXDi-P05-035-E1',
      'WXDi-P10-033-E2', 'WXK09-067-E1'],
    B: [],
    C: [],
    M: ['WX25-CP1-002-E1', 'WX25-P2-066-E1', 'WXDi-D04-021-E1'],
  },
};

function assertAndPrintClassification(label, result, classes) {
  const classified = Object.values(classes).flat().sort();
  const misses = [...result.miss].sort();
  if (JSON.stringify(classified) !== JSON.stringify(misses)) {
    throw new Error(`${label}: classification does not partition MISS\nclassified=${classified}\nmiss=${misses}`);
  }
  console.log(`CLASS ${label}: A=${classes.A.length} B=${classes.B.length} C=${classes.C.length} M=${classes.M.length} A+B=${classes.A.length + classes.B.length}`);
  for (const key of ['A', 'B', 'C', 'M']) console.log(`  ${key}=${classes[key].join(',') || '-'}`);
}

assertAndPrintClassification('C1', c1, CLASSIFICATION.C1);
assertAndPrintClassification('C2', c2, CLASSIFICATION.C2);
assertAndPrintClassification('C3', {
  miss: [...new Set([...c3top.miss, ...c3shuffle.miss])],
}, CLASSIFICATION.C3);

if (process.argv.includes('--multi')) {
  for (const [id, src] of Object.entries(SRC)) {
    const matches = src.match(new RegExp(C2_RE.source, 'g')) ?? [];
    if (matches.length > 1) console.log(`MULTI ${id} ${matches.length} ${matches.join(' / ')} :: ${src.replace(/\s+/g, ' ')}`);
  }
}

if (wants('C1')) printResult('C1', C1_RE, c1);
for (const category of ['deck_life_trash', 'opp_energy', 'other']) {
  const ids = Object.keys(SRC).filter(id => C2_RE.test(SRC[id]) && c2Category(SRC[id]) === category);
  const r = {
    total: ids.length,
    hit: ids.filter(id => LIVE[id] && c2Ok(LIVE[id], id, SRC[id])),
    miss: ids.filter(id => LIVE[id] && !c2Ok(LIVE[id], id, SRC[id])),
    nojson: ids.filter(id => !LIVE[id]),
  };
  if (wants(`C2-${category}`)) printResult(`C2-${category}`, C2_RE, r);
}
if (wants('C3-top')) printResult('C3-top', C3_TOP_RE, c3top);
if (wants('C3-shuffle')) printResult('C3-shuffle', C3_SHUFFLE_RE, c3shuffle);

// Keep the shared helper exercised and the predicates easy to inspect from this one-off script.
if (process.argv.includes('--report')) {
  report('C1', C1_RE, c1);
  report('C2', C2_RE, c2);
}
