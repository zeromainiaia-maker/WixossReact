import { readFileSync } from 'fs';

const FILES = [
  'C:/Users/zerom/WixossReact/public/data/effects_WX.json',
  'C:/Users/zerom/WixossReact/public/data/effects_WXK.json',
  'C:/Users/zerom/WixossReact/public/data/effects_WX24_26.json',
  'C:/Users/zerom/WixossReact/public/data/effects_WXDi.json',
  'C:/Users/zerom/WixossReact/public/data/effects_misc.json',
];

const VALID_EFFECT_TYPES = new Set(['ACTIVATED','AUTO','CONTINUOUS','LIFE_BURST','TRAP_ICON','SONG_ICON']);
const VALID_TIMINGS = new Set([
  'MAIN','ATTACK','SPELL_CUTIN','ON_PLAY','ON_LIFE_BURST','ON_TRAP_ACTIVATE',
  'ON_SONG_ACTIVATE','ON_BANISH','ON_TRASH','ON_ATTACK_SIGNI','ON_ATTACK_LRIG',
  'ON_TURN_START','ON_TURN_END','ON_OPP_ARTS_USE','ON_REVEALED_FROM_HAND',
  'ON_ENERGY_FROM_TRASH','ON_BLOOD_CRYSTAL_ARMOR','ON_HEAVEN','ON_ACCE',
  // 追加タイミング（STUBで扱われているがAUTOに設定されることがある）
  'ON_OPPONENT_SIGNI_RETURNED_TO_HAND','ON_OPPONENT_PLAY_SIGNI',
  'ON_SIGNI_LEAVE_FIELD','ON_OWN_SIGNI_BANISHED','ON_OPPONENT_SIGNI_BANISHED',
  'ON_OPPONENT_DRAW','ON_OWN_DRAW',
]);
const VALID_DURATIONS = new Set(['INSTANT','UNTIL_END_OF_TURN','NEXT_TURN','PERMANENT']);
const VALID_OWNERS = new Set(['self','opponent','any']);
const VALID_CARD_LOCATIONS = new Set(['field','hand','deck','trash','lrig_deck','lrig_trash','energy','life_cloth']);

const bugs = [];
function bug(file, cardNum, path, issue, value, suggestion) {
  bugs.push({ file, cardNum, path, issue, value: String(value), suggestion: suggestion || '' });
}

// ===== アクション必須フィールド検証 =====
function checkAction(a, cardNum, file, path) {
  if (!a || typeof a !== 'object') return;
  const t = a.type;

  // owner フィールドの値チェック
  for (const key of ['owner','countOwner','lrigOwner','targetOwner']) {
    if (a[key] !== undefined && !VALID_OWNERS.has(a[key])) {
      bug(file, cardNum, `${path}.${key}`, 'INVALID_OWNER_VALUE', a[key], `should be 'self'/'opponent'/'any'`);
    }
  }

  // count が number でない場合
  if (t === 'DRAW' && typeof a.count !== 'number' && a.count !== undefined && typeof a.count !== 'object') {
    bug(file, cardNum, `${path}.count`, 'WRONG_TYPE', a.count, 'should be number or {$ref}');
  }
  if (t === 'ENERGY_CHARGE_FROM_DECK' && a.count !== undefined && typeof a.count !== 'number' && typeof a.count !== 'object') {
    bug(file, cardNum, `${path}.count`, 'WRONG_TYPE', a.count, 'should be number');
  }

  // 必須フィールド検証
  switch (t) {
    case 'DRAW':
      if (a.owner === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'owner', 'DRAW requires owner');
      if (a.count === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'count', 'DRAW requires count');
      break;
    case 'ENERGY_CHARGE_FROM_DECK':
      if (a.owner === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'owner', 'requires owner');
      if (a.count === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'count', 'requires count');
      break;
    case 'LIFE_CRASH':
      if (a.owner === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'owner', 'requires owner');
      if (a.count === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'count', 'requires count');
      if (a.triggerBurst === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'triggerBurst', 'requires triggerBurst:boolean');
      else if (typeof a.triggerBurst !== 'boolean') bug(file, cardNum, `${path}.triggerBurst`, 'WRONG_TYPE', a.triggerBurst, 'should be boolean');
      break;
    case 'SHUFFLE_DECK':
      if (a.owner === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'owner', 'requires owner');
      break;
    case 'BANISH':
    case 'BOUNCE':
    case 'DOWN':
    case 'UP':
    case 'FREEZE':
    case 'POWER_MODIFY':
    case 'POWER_SET':
    case 'TRASH':
    case 'ENERGY_CHARGE':
    case 'GRANT_KEYWORD':
    case 'NEGATE_ATTACK':
      if (a.target === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'target', `${t} requires target`);
      break;
    case 'GRANT_PROTECTION':
      // targetはACTIVATED/AUTOでは必須。CONTINUOUSではsubjectFilterを使うのでtarget省略可
      if (a.target === undefined && a.subjectFilter === undefined)
        bug(file, cardNum, path, 'MISSING_FIELD', 'target', 'GRANT_PROTECTION requires target or subjectFilter');
      break;
    case 'POWER_MODIFY':
      if (a.delta === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'delta', 'POWER_MODIFY requires delta');
      break;
    case 'POWER_SET':
      if (a.value === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'value', 'POWER_SET requires value');
      break;
    case 'GRANT_KEYWORD':
      if (a.keyword === undefined && a.keywords === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'keyword/keywords', 'GRANT_KEYWORD requires keyword or keywords');
      if (a.duration === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'duration', 'GRANT_KEYWORD requires duration');
      else if (!VALID_DURATIONS.has(a.duration)) bug(file, cardNum, `${path}.duration`, 'INVALID_DURATION', a.duration, 'check VALID_DURATIONS');
      break;
    case 'SEARCH':
      if (!a.from) bug(file, cardNum, path, 'MISSING_FIELD', 'from', 'SEARCH requires from');
      else {
        if (!a.from.location) bug(file, cardNum, `${path}.from`, 'MISSING_FIELD', 'location', '');
        else if (!VALID_CARD_LOCATIONS.has(a.from.location)) bug(file, cardNum, `${path}.from.location`, 'INVALID_LOCATION', a.from.location, '');
        if (!a.from.owner) bug(file, cardNum, `${path}.from`, 'MISSING_FIELD', 'owner', '');
      }
      if (!a.filter) bug(file, cardNum, path, 'MISSING_FIELD', 'filter', 'SEARCH requires filter');
      if (a.maxCount === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'maxCount', 'SEARCH requires maxCount');
      if (!a.then) bug(file, cardNum, path, 'MISSING_FIELD', 'then', 'SEARCH requires then');
      break;
    case 'SEQUENCE':
      if (!a.steps || a.steps.length === 0) bug(file, cardNum, path, 'EMPTY_SEQUENCE', '', 'SEQUENCE.steps is empty');
      break;
    case 'CHOOSE':
      if (a.choose_count === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'choose_count', '');
      if (a.from_count === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'from_count', '');
      if (!a.choices || a.choices.length === 0) bug(file, cardNum, path, 'MISSING_FIELD', 'choices', 'CHOOSE requires choices');
      if (a.choices && a.from_count !== undefined && a.choices.length !== a.from_count) {
        bug(file, cardNum, path, 'CHOOSE_COUNT_MISMATCH', `choices.length=${a.choices.length} from_count=${a.from_count}`, 'choices.length should equal from_count');
      }
      if (a.choices && a.choose_count !== undefined && a.choices.length < a.choose_count) {
        bug(file, cardNum, path, 'CHOOSE_COUNT_GT_CHOICES', `choose_count=${a.choose_count} > choices.length=${a.choices.length}`, 'choose_count must be <= choices.length');
      }
      break;
    case 'CONDITIONAL':
      if (!a.condition) bug(file, cardNum, path, 'MISSING_FIELD', 'condition', 'CONDITIONAL requires condition');
      if (!a.then) bug(file, cardNum, path, 'MISSING_FIELD', 'then', 'CONDITIONAL requires then');
      break;
    case 'GRANT_EFFECT':
      if (!a.target) bug(file, cardNum, path, 'MISSING_FIELD', 'target', 'GRANT_EFFECT requires target');
      if (!a.effect) bug(file, cardNum, path, 'MISSING_FIELD', 'effect', 'GRANT_EFFECT requires effect');
      if (!a.duration) bug(file, cardNum, path, 'MISSING_FIELD', 'duration', 'GRANT_EFFECT requires duration');
      else if (!VALID_DURATIONS.has(a.duration)) bug(file, cardNum, `${path}.duration`, 'INVALID_DURATION', a.duration, '');
      if (a.effect) {
        if (!a.effect.effectId) bug(file, cardNum, `${path}.effect`, 'MISSING_FIELD', 'effectId', '');
        if (!a.effect.effectType) bug(file, cardNum, `${path}.effect`, 'MISSING_FIELD', 'effectType', '');
        else if (!VALID_EFFECT_TYPES.has(a.effect.effectType)) bug(file, cardNum, `${path}.effect.effectType`, 'INVALID_EFFECT_TYPE', a.effect.effectType, '');
        if (!a.effect.action) bug(file, cardNum, `${path}.effect`, 'MISSING_FIELD', 'action', '');
        if (a.effect.duration === undefined) bug(file, cardNum, `${path}.effect`, 'MISSING_FIELD', 'duration', '');
        else if (!VALID_DURATIONS.has(a.effect.duration)) bug(file, cardNum, `${path}.effect.duration`, 'INVALID_DURATION', a.effect.duration, '');
        if (a.effect.timing) {
          a.effect.timing.forEach((tm, i) => {
            if (!VALID_TIMINGS.has(tm)) bug(file, cardNum, `${path}.effect.timing[${i}]`, 'INVALID_TIMING', tm, '');
          });
        }
      }
      break;
    case 'LOOK_AND_REORDER':
      if (!a.source) bug(file, cardNum, path, 'MISSING_FIELD', 'source', '');
      if (a.count === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'count', '');
      if (a.private === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'private', 'requires boolean');
      if (a.reorder === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'reorder', 'requires boolean');
      if (!a.destination) bug(file, cardNum, path, 'MISSING_FIELD', 'destination', '');
      break;
    case 'TRANSFER_TO_DECK':
      if (!a.source) bug(file, cardNum, path, 'MISSING_FIELD', 'source', '');
      if (a.shuffle === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'shuffle', 'requires boolean');
      break;
    case 'ADD_TO_LIFE':
      if (a.owner === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'owner', '');
      if (a.count === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'count', '');
      if (a.fromTop === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'fromTop', 'requires boolean');
      break;
    case 'BLOCK_ACTION':
      if (!a.target) bug(file, cardNum, path, 'MISSING_FIELD', 'target', '');
      if (!a.actionId) bug(file, cardNum, path, 'MISSING_FIELD', 'actionId', '');
      if (!a.until) bug(file, cardNum, path, 'MISSING_FIELD', 'until', '');
      break;
    case 'STORY_CHANGE':
      if (!a.target) bug(file, cardNum, path, 'MISSING_FIELD', 'target', '');
      if (!a.newStory) bug(file, cardNum, path, 'MISSING_FIELD', 'newStory', '');
      break;
    case 'REVEAL_AND_PICK':
      if (a.owner === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'owner', '');
      if (a.revealCount === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'revealCount', '');
      if (a.pickCount === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'pickCount', '');
      if (!a.then) bug(file, cardNum, path, 'MISSING_FIELD', 'then', '');
      break;
    case 'ADD_TO_HAND':
    case 'ADD_TO_ENERGY':
      if (a.owner === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'owner', '');
      break;
    case 'ADD_TO_FIELD':
      if (a.owner === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'owner', '');
      break;
    case 'STUB':
      if (!a.id) bug(file, cardNum, path, 'MISSING_FIELD', 'id', 'STUB requires id');
      break;
    case 'MILL':
      if (a.owner === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'owner', '');
      if (a.count === undefined) bug(file, cardNum, path, 'MISSING_FIELD', 'count', '');
      break;
  }

  // GRANT_KEYWORD の duration が top-level PERMANENT 以外でも CONTINUOUS なら OK だが
  // AUTO/ACTIVATED のGRANT_KEYWORDは duration を持つべき
  if (t === 'GRANT_KEYWORD' && a.duration && !VALID_DURATIONS.has(a.duration)) {
    bug(file, cardNum, `${path}.duration`, 'INVALID_DURATION', a.duration, '');
  }

  // 再帰
  if (a.steps) a.steps.forEach((s, i) => checkAction(s, cardNum, file, `${path}.steps[${i}]`));
  if (a.choices) a.choices.forEach((c, i) => checkAction(c.action, cardNum, file, `${path}.choices[${i}].action`));
  if (a.then) checkAction(a.then, cardNum, file, `${path}.then`);
  if (a.else) checkAction(a.else, cardNum, file, `${path}.else`);
  if (a.afterSearch) checkAction(a.afterSearch, cardNum, file, `${path}.afterSearch`);
  if (a.effect?.action) checkAction(a.effect.action, cardNum, file, `${path}.effect.action`);
  if (a.abilities) a.abilities.forEach((ab, i) => ab.action && checkAction(ab.action, cardNum, file, `${path}.abilities[${i}].action`));
}

// ===== CardEffect (top-level) 検証 =====
function checkEffect(eff, cardNum, file) {
  if (!eff.effectId) bug(file, cardNum, 'effectId', 'MISSING_FIELD', '', 'CardEffect requires effectId');
  if (!eff.effectType) bug(file, cardNum, 'effectType', 'MISSING_FIELD', '', 'CardEffect requires effectType');
  else if (!VALID_EFFECT_TYPES.has(eff.effectType)) bug(file, cardNum, 'effectType', 'INVALID_EFFECT_TYPE', eff.effectType, '');
  if (!eff.action) bug(file, cardNum, 'action', 'MISSING_FIELD', '', 'CardEffect requires action');
  if (eff.duration === undefined) bug(file, cardNum, 'duration', 'MISSING_FIELD', '', 'CardEffect requires duration');
  else if (!VALID_DURATIONS.has(eff.duration)) bug(file, cardNum, 'duration', 'INVALID_DURATION', eff.duration, '');

  // タイミング検証
  if (eff.timing) {
    eff.timing.forEach((tm, i) => {
      if (!VALID_TIMINGS.has(tm)) bug(file, cardNum, `timing[${i}]`, 'INVALID_TIMING', tm, '');
    });
  }

  // AUTO効果にtimingが必要
  if (eff.effectType === 'AUTO' && (!eff.timing || eff.timing.length === 0)) {
    bug(file, cardNum, 'timing', 'MISSING_FIELD', '', 'AUTO effect requires timing');
  }

  // action検証
  if (eff.action) checkAction(eff.action, cardNum, file, 'action');
}

// ===== メイン =====
for (const fpath of FILES) {
  const fname = fpath.split('/').pop();
  const data = JSON.parse(readFileSync(fpath, 'utf8'));
  for (const [cardNum, effects] of Object.entries(data)) {
    for (const eff of effects) checkEffect(eff, cardNum, fname);
  }
}

const seen = new Set();
const unique = [];
for (const b of bugs) {
  const key = `${b.file}|${b.cardNum}|${b.issue}|${b.value}|${b.path}`;
  if (!seen.has(key)) { seen.add(key); unique.push(b); }
}

const byIssue = {};
for (const b of unique) {
  byIssue[b.issue] = byIssue[b.issue] || [];
  byIssue[b.issue].push(b);
}
for (const [issue, items] of Object.entries(byIssue)) {
  console.log(`\n=== ${issue} (${items.length}件) ===`);
  for (const b of items) {
    const sug = b.suggestion ? ` → ${b.suggestion}` : '';
    console.log(`  [${b.cardNum}] ${b.file} path=${b.path} "${b.value}"${sug}`);
  }
}
console.log(`\nTotal: ${unique.length}`);
