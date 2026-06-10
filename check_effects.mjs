import { readFileSync } from 'fs';

const files = [
  'C:/Users/zerom/WixossReact/public/data/effects_WX.json',
  'C:/Users/zerom/WixossReact/public/data/effects_WXK.json',
  'C:/Users/zerom/WixossReact/public/data/effects_WX24_26.json',
  'C:/Users/zerom/WixossReact/public/data/effects_WXDi.json',
  'C:/Users/zerom/WixossReact/public/data/effects_misc.json',
];

const VALID_ACTION_TYPES = new Set([
  'DRAW','BOUNCE','BANISH','POWER_MODIFY','POWER_SET','TRASH','ENERGY_CHARGE',
  'ENERGY_CHARGE_FROM_DECK','LIFE_CRASH','SHUFFLE_DECK','REVEAL','ADD_TO_HAND',
  'ADD_TO_ENERGY','TRANSFER_TO_HAND','ADD_TO_FIELD','ADD_TO_LIFE','FREEZE',
  'DOWN','UP','BLOCK_ACTION','STORY_CHANGE','GRANT_KEYWORD','SEARCH','SEQUENCE',
  'CHOOSE','CONDITIONAL','LOOK_AND_REORDER','TRANSFER_TO_DECK','COUNTER_SPELL',
  'COST_REDUCTION','GRANT_PROTECTION','ATTACH_CHARM','REVEAL_AND_PICK',
  'BANISH_REDIRECT','REARRANGE_SIGNI','GROW_FREE','REMOVE_ABILITIES',
  'PLAY_FREE','COST_INCREASE','POWER_MODIFY_PER_STACK','POWER_MODIFY_PER_FIELD',
  'POWER_MODIFY_PER_LEVEL_SUM','POWER_MODIFY_PER_LRIG_LEVEL','FORCE_END_TURN',
  'CHARM_PROTECTION','MUTUAL_DISCARD_AND_DRAW','POWER_MODIFY_BY_TARGET_LEVEL',
  'POWER_MULTIPLY','LEVEL_MODIFY','POWER_MODIFY_PER_CHARM','POWER_MODIFY_PER_ENERGY',
  'PREVENT_DAMAGE','EQUALIZE_ENERGY','VARIABLE_DISCARD_AND_DRAW','BANISH_SUBSTITUTE',
  'STACK_SPELL','COLOR_INHERIT','CONDITIONAL_DISCARD','ENERGY_CHARGE_BY_FIELD_COUNT',
  'LOOK_AT_DECK_AND_LIFE','GROW_COST_REDUCTION','NAME_BAN','PLAY_FREE_FROM_TRASH',
  'POWER_THRESHOLD_TRASH','POWER_FLIP','SELF_TRASH_PREVENT','COST_SUBSTITUTE',
  'POWER_MODIFY_PER_TRASHED_LEVEL','POWER_MODIFY_PER_DECK_COUNT',
  'POWER_MODIFY_PER_ENERGY_COLOR','POWER_MODIFY_PER_TRASH_COUNT',
  'POWER_MODIFY_PER_LIFE_COUNT','GAIN_COIN','DISCARD_BOTH','REMOVE_CHARM',
  'FORCE_SIGNI_ATTACK','GRANT_LRIG_ABILITY','PLACE_VIRUS','ATTACH_ACCE',
  'BLOOD_CRYSTAL_ARMOR','POWER_MODIFY_PER_VIRUS_COUNT','LRIG_LIMIT_MODIFY',
  'ADD_CRAFT_TO_LRIG_DECK','RECOLLECT_GATE','ALT_COST_OPP_TURN','BLOCK_CARD_USE',
  'DRAW_PER_FIELD_COUNT','AWAKEN_SIGNI','NEGATE_ATTACK','PLACE_UNDER_SIGNI',
  'PLACE_UNDER_SOURCE_SIGNI','PREVENT_NEXT_DAMAGE','TAKE_FROM_UNDER_SIGNI',
  'GRANT_EFFECT','GRANT_SIGNI_ABOVE_ABILITY','STUB','GAIN_BOND','MILL','UNKNOWN'
]);
// Condition型（action内 condition / effectのconditionに使われる）
const VALID_CONDITION_TYPES = new Set([
  'FIELD_COUNT','HAND_COUNT','LIFE_COUNT','ENERGY_COUNT','HAS_CARD_IN_FIELD',
  'TRASH_HAS_CARD','DECK_TOP_MATCHES','LRIG_LEVEL','LRIG_STORY','THIS_CARD_IN_LOCATION',
  'THIS_CARD_IN_CENTER_ZONE','THIS_CARD_IS_DOWN','THIS_CARD_IS_ARMORED',
  'SELF_POWER_GTE','LIFE_COMPARE_OPP','DURING_PHASE','AND','IS_MY_TURN',
  'IS_OPPONENT_TURN','PAID_ADDITIONAL_COST','BEAT_CONDITION','COND_STUB',
  'LAST_PROCESSED_LEVEL_SUM_EQ','OPPONENT_NOT_PAID','SELF_OPTIONAL_EFFECT_TAKEN','HAS_BOND'
]);
// ActiveCondition型（CardEffectのactiveConditionに使われる）
const VALID_ACTIVE_CONDITION_TYPES = new Set([
  'TURN_OWNER','HAS_CARD_IN_FIELD','COUNT_THRESHOLD','SELF_POWER_THRESHOLD',
  'HAND_DIFF','ENA_DIFF','LRIG_LEVEL','EICHI_LEVEL_SUM',
  'IS_SELF_ARMORED','IS_SELF_ACCED','IS_SELF_ACCE_CARD','IS_DRIVE_STATE',
  'HAS_BOND','SUBSCRIBER_COUNT','AND'
]);
const VALID_TARGET_TYPES = new Set([
  'SIGNI','LRIG','CENTER_LRIG_OR_SIGNI','HAND_CARD','DECK_CARD','TRASH_CARD',
  'LRIG_TRASH_CARD','ENERGY_CARD','LIFE_CLOTH_CARD','PLAYER'
]);
const VALID_TARGET_FIELDS = new Set(['type','owner','count','filter','upToCount','blind','actingPlayerSelects']);
const VALID_FILTER_FIELDS = new Set([
  'cardType','cardName','cardNames','excludeCardName','cardNum','color','level',
  'levelParity','levelRange','powerRange','story','hasGuard','isDown','isUp',
  'isFrozen','hasCharm','hasAcce','infected','isArmored'
]);
const VALID_DURATIONS = new Set(['INSTANT','UNTIL_END_OF_TURN','NEXT_TURN','PERMANENT']);

const bugs = [];

function walkAction(action, cardNum, file, path) {
  if (!action || typeof action !== 'object') return;
  if (action.type && !VALID_ACTION_TYPES.has(action.type)) {
    bugs.push({ file, cardNum, path, issue: 'INVALID_ACTION_TYPE', value: action.type });
  }
  for (const key of ['target','source','charm','to']) {
    if (action[key] && typeof action[key] === 'object' && action[key].type) {
      walkTarget(action[key], cardNum, file, `${path}.${key}`);
    }
  }
  if (action.condition) walkCondition(action.condition, cardNum, file, `${path}.condition`);
  if (action.steps) action.steps.forEach((s,i) => walkAction(s, cardNum, file, `${path}.steps[${i}]`));
  if (action.choices) action.choices.forEach((c,i) => {
    walkAction(c.action, cardNum, file, `${path}.choices[${i}].action`);
    if (c.condition) walkCondition(c.condition, cardNum, file, `${path}.choices[${i}].condition`);
  });
  if (action.then) walkAction(action.then, cardNum, file, `${path}.then`);
  if (action.else) walkAction(action.else, cardNum, file, `${path}.else`);
  if (action.afterSearch) walkAction(action.afterSearch, cardNum, file, `${path}.afterSearch`);
  if (action.effect && typeof action.effect === 'object') {
    walkAction(action.effect.action, cardNum, file, `${path}.effect.action`);
    if (action.effect.condition) walkCondition(action.effect.condition, cardNum, file, `${path}.effect.condition`);
    if (action.effect.activeCondition) walkActiveCondition(action.effect.activeCondition, cardNum, file, `${path}.effect.activeCondition`);
    if (action.effect.duration && !VALID_DURATIONS.has(action.effect.duration)) {
      bugs.push({ file, cardNum, path: `${path}.effect.duration`, issue: 'INVALID_DURATION', value: action.effect.duration });
    }
  }
  if (action.abilities) action.abilities.forEach((ab,i) => {
    if (ab.action) walkAction(ab.action, cardNum, file, `${path}.abilities[${i}].action`);
  });
}

function walkTarget(target, cardNum, file, path) {
  if (!target || typeof target !== 'object') return;
  if (target.type && !VALID_TARGET_TYPES.has(target.type)) {
    bugs.push({ file, cardNum, path, issue: 'INVALID_TARGET_TYPE', value: target.type });
  }
  for (const k of Object.keys(target)) {
    if (!VALID_TARGET_FIELDS.has(k)) {
      bugs.push({ file, cardNum, path: `${path}.${k}`, issue: 'INVALID_TARGET_FIELD', value: k });
    }
    if (k === 'filter') walkFilter(target.filter, cardNum, file, `${path}.filter`);
  }
}

function walkFilter(filter, cardNum, file, path) {
  if (!filter || typeof filter !== 'object') return;
  for (const k of Object.keys(filter)) {
    if (!VALID_FILTER_FIELDS.has(k)) {
      bugs.push({ file, cardNum, path: `${path}.${k}`, issue: 'INVALID_FILTER_FIELD', value: k });
    }
  }
}

function walkCondition(cond, cardNum, file, path) {
  if (!cond || typeof cond !== 'object') return;
  if (cond.type && !VALID_CONDITION_TYPES.has(cond.type)) {
    bugs.push({ file, cardNum, path, issue: 'INVALID_CONDITION_TYPE', value: cond.type });
  }
  if (cond.conditions) cond.conditions.forEach((c,i) => walkCondition(c, cardNum, file, `${path}.conditions[${i}]`));
  if (cond.filter) walkFilter(cond.filter, cardNum, file, `${path}.filter`);
}

function walkActiveCondition(cond, cardNum, file, path) {
  if (!cond || typeof cond !== 'object') return;
  if (cond.type && !VALID_ACTIVE_CONDITION_TYPES.has(cond.type)) {
    bugs.push({ file, cardNum, path, issue: 'INVALID_ACTIVE_CONDITION_TYPE', value: cond.type });
  }
  if (cond.conditions) cond.conditions.forEach((c,i) => walkActiveCondition(c, cardNum, file, `${path}.conditions[${i}]`));
  if (cond.filter) walkFilter(cond.filter, cardNum, file, `${path}.filter`);
}

for (const f of files) {
  const fname = f.split('/').pop();
  const data = JSON.parse(readFileSync(f, 'utf8'));
  for (const [cardNum, effects] of Object.entries(data)) {
    for (const eff of effects) {
      walkAction(eff.action, cardNum, fname, 'action');
      if (eff.condition) walkCondition(eff.condition, cardNum, fname, 'condition');
      if (eff.activeCondition) walkActiveCondition(eff.activeCondition, cardNum, fname, 'activeCondition');
      if (eff.duration && !VALID_DURATIONS.has(eff.duration)) {
        bugs.push({ file: fname, cardNum, path: 'duration', issue: 'INVALID_DURATION', value: eff.duration });
      }
    }
  }
}

const seen = new Set();
const unique = [];
for (const b of bugs) {
  const key = `${b.file}|${b.cardNum}|${b.issue}|${b.value}`;
  if (!seen.has(key)) { seen.add(key); unique.push(b); }
}

const byIssue = {};
for (const b of unique) {
  byIssue[b.issue] = byIssue[b.issue] || [];
  byIssue[b.issue].push(b);
}
for (const [issue, items] of Object.entries(byIssue)) {
  console.log(`\n=== ${issue} (${items.length}件) ===`);
  for (const b of items) console.log(`  ${b.file} [${b.cardNum}] path=${b.path} value="${b.value}"`);
}
console.log(`\nTotal unique bugs: ${unique.length}`);
