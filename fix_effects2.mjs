import { readFileSync, writeFileSync } from 'fs';

const FILES = {
  'effects_WX.json':      'C:/Users/zerom/WixossReact/public/data/effects_WX.json',
  'effects_WXK.json':     'C:/Users/zerom/WixossReact/public/data/effects_WXK.json',
  'effects_WX24_26.json': 'C:/Users/zerom/WixossReact/public/data/effects_WX24_26.json',
  'effects_WXDi.json':    'C:/Users/zerom/WixossReact/public/data/effects_WXDi.json',
  'effects_misc.json':    'C:/Users/zerom/WixossReact/public/data/effects_misc.json',
};

let fixCount = 0;
function log(msg) { console.log(msg); fixCount++; }

function fixAction(a, cardNum) {
  if (!a || typeof a !== 'object') return a;

  // 1. STUB.stubId → STUB.id
  if (a.type === 'STUB' && a.stubId !== undefined && a.id === undefined) {
    const { stubId, ...rest } = a;
    log(`${cardNum}: STUB.stubId="${stubId}" -> id`);
    a = { ...rest, id: stubId };
  }

  // 2. ENERGY_CHARGE + owner (no target) → ADD_TO_ENERGY
  if (a.type === 'ENERGY_CHARGE' && a.owner !== undefined && a.target === undefined) {
    log(`${cardNum}: ENERGY_CHARGE+owner → ADD_TO_ENERGY`);
    const { type, ...rest } = a;
    a = { type: 'ADD_TO_ENERGY', ...rest };
  }

  // 3. ADD_TO_HAND + source (no owner) → TRANSFER_TO_HAND
  if (a.type === 'ADD_TO_HAND' && a.source !== undefined && a.owner === undefined) {
    log(`${cardNum}: ADD_TO_HAND+source → TRANSFER_TO_HAND`);
    const { type, ...rest } = a;
    a = { type: 'TRANSFER_TO_HAND', ...rest };
  }

  // 4. BLOCK_ACTION missing until → 'END_OF_TURN'
  if (a.type === 'BLOCK_ACTION' && a.until === undefined) {
    log(`${cardNum}: BLOCK_ACTION missing until → END_OF_TURN`);
    a = { ...a, until: 'END_OF_TURN' };
  }

  // 5. SEQUENCE with empty steps → STUB NO_ACTION
  if (a.type === 'SEQUENCE' && Array.isArray(a.steps) && a.steps.length === 0) {
    log(`${cardNum}: empty SEQUENCE → STUB NO_ACTION`);
    return { type: 'STUB', id: 'NO_ACTION' };
  }

  // 6. CHOOSE missing from_count → set from choices.length
  if (a.type === 'CHOOSE' && a.from_count === undefined && Array.isArray(a.choices)) {
    log(`${cardNum}: CHOOSE missing from_count → ${a.choices.length}`);
    a = { ...a, from_count: a.choices.length };
  }

  // 7. TRAP timing → SPELL_CUTIN (ACTIVATEDなのにTRAPはSPELL_CUTINが最も近い)
  // ※ timingはCardEffectレベルで修正するのでここでは不要

  // 再帰
  if (a.steps) a = { ...a, steps: a.steps.map(s => fixAction(s, cardNum)) };
  if (a.choices) a = { ...a, choices: a.choices.map(c => ({ ...c, action: fixAction(c.action, cardNum) })) };
  if (a.then) a = { ...a, then: fixAction(a.then, cardNum) };
  if (a.else) a = { ...a, else: fixAction(a.else, cardNum) };
  if (a.afterSearch) a = { ...a, afterSearch: fixAction(a.afterSearch, cardNum) };
  if (a.effect?.action) a = { ...a, effect: { ...a.effect, action: fixAction(a.effect.action, cardNum) } };
  if (a.abilities) a = { ...a, abilities: a.abilities.map(ab => ({ ...ab, action: ab.action ? fixAction(ab.action, cardNum) : ab.action })) };

  return a;
}

for (const [fname, fpath] of Object.entries(FILES)) {
  const data = JSON.parse(readFileSync(fpath, 'utf8'));

  for (const [cardNum, effects] of Object.entries(data)) {
    data[cardNum] = effects.map(eff => {
      let e = { ...eff };

      // TRAP timing → SPELL_CUTIN (ACTIVATED効果でTRAPはSPELL_CUTINが適切)
      if (e.timing?.includes('TRAP')) {
        e.timing = e.timing.map(t => t === 'TRAP' ? 'SPELL_CUTIN' : t);
        log(`${cardNum}: timing TRAP -> SPELL_CUTIN`);
      }

      if (e.action) e.action = fixAction(e.action, cardNum);
      return e;
    });
  }

  writeFileSync(fpath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`${fname} saved`);
}

console.log(`\nTotal fixes: ${fixCount}`);
