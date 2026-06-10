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

// ===== フィルターフィールドの修正 =====
function fixFilter(filter, cardNum) {
  if (!filter || typeof filter !== 'object') return filter;
  const f = { ...filter };

  if ('maxLevel' in f) { f.level = { ...(f.level ?? {}), max: f.maxLevel }; delete f.maxLevel; log(`${cardNum}: filter.maxLevel -> level.max`); }
  if ('minLevel' in f) { f.level = { ...(f.level ?? {}), min: f.minLevel }; delete f.minLevel; log(`${cardNum}: filter.minLevel -> level.min`); }
  if ('maxPower' in f) { f.powerRange = { ...(f.powerRange ?? {}), max: f.maxPower }; delete f.maxPower; log(`${cardNum}: filter.maxPower -> powerRange.max`); }
  if ('powerMax' in f) { f.powerRange = { ...(f.powerRange ?? {}), max: f.powerMax }; delete f.powerMax; log(`${cardNum}: filter.powerMax -> powerRange.max`); }
  if ('powerMin' in f) { f.powerRange = { ...(f.powerRange ?? {}), min: f.powerMin }; delete f.powerMin; log(`${cardNum}: filter.powerMin -> powerRange.min`); }
  if ('charm' in f) { f.hasCharm = f.charm; delete f.charm; log(`${cardNum}: filter.charm -> hasCharm`); }
  if ('nameContains' in f) { f.cardName = f.nameContains; delete f.nameContains; log(`${cardNum}: filter.nameContains -> cardName`); }
  if ('isRezona' in f) { f.cardType = 'レゾナ'; delete f.isRezona; log(`${cardNum}: filter.isRezona -> cardType:レゾナ`); }
  if ('hasGuardIcon' in f) { f.hasGuard = f.hasGuardIcon; delete f.hasGuardIcon; log(`${cardNum}: filter.hasGuardIcon -> hasGuard`); }
  if ('colorOneOf' in f) { f.color = f.colorOneOf; delete f.colorOneOf; log(`${cardNum}: filter.colorOneOf -> color`); }
  // 動的参照系・存在しない概念 → 削除
  for (const dead of ['matchCenterLrigColor','hasKeyword','sameLevelAsSelf','sameColorAsLrig','powerLessThanSelf','isSelf','self','isOther']) {
    if (dead in f) { delete f[dead]; log(`${cardNum}: filter.${dead} removed (no engine support)`); }
  }
  return f;
}

// ===== EffectTargetの修正 =====
function fixTarget(target, cardNum) {
  if (!target || typeof target !== 'object') return target;
  let t = { ...target };

  // 無効なtype
  if (t.type === 'CENTER_LRIG') { t.type = 'LRIG'; log(`${cardNum}: target.type CENTER_LRIG -> LRIG`); }
  if (t.type === 'SIGNI_ZONE')  { t.type = 'SIGNI'; log(`${cardNum}: target.type SIGNI_ZONE -> SIGNI`); }
  if (t.type === 'FIELD_SIGNI') { t.type = 'SIGNI'; log(`${cardNum}: target.type FIELD_SIGNI -> SIGNI`); }
  if (t.type === 'ANY') {
    // isLrigOrSigni filterがある場合はCENTER_LRIG_OR_SIGNIへ
    if (t.filter?.isLrigOrSigni) { t.type = 'CENTER_LRIG_OR_SIGNI'; delete t.filter.isLrigOrSigni; log(`${cardNum}: target.type ANY + isLrigOrSigni -> CENTER_LRIG_OR_SIGNI`); }
    else { t.type = 'CENTER_LRIG_OR_SIGNI'; log(`${cardNum}: target.type ANY -> CENTER_LRIG_OR_SIGNI`); }
  }

  // isCenter → EffectTarget.type = LRIG でフィルタ不要
  if (t.filter?.isCenter) {
    t.type = 'LRIG';
    const { isCenter, ...rest } = t.filter;
    t.filter = Object.keys(rest).length ? rest : undefined;
    log(`${cardNum}: filter.isCenter -> target.type:LRIG`);
  }
  // isLrigOrSigni残り
  if (t.filter?.isLrigOrSigni) {
    t.type = 'CENTER_LRIG_OR_SIGNI';
    const { isLrigOrSigni, ...rest } = t.filter;
    t.filter = Object.keys(rest).length ? rest : undefined;
    log(`${cardNum}: filter.isLrigOrSigni -> target.type:CENTER_LRIG_OR_SIGNI`);
  }

  // 無効なフィールド
  if ('isSelf' in t) { delete t.isSelf; log(`${cardNum}: target.isSelf removed`); }
  if ('selectedBy' in t) {
    t.actingPlayerSelects = (t.selectedBy !== 'opponent');
    delete t.selectedBy;
    log(`${cardNum}: target.selectedBy -> actingPlayerSelects`);
  }
  if ('optional' in t) { delete t.optional; log(`${cardNum}: target.optional removed`); }
  if ('optionalCost' in t) { delete t.optionalCost; log(`${cardNum}: target.optionalCost removed`); }

  // count 未定義なら 1 をセット
  if (t.count === undefined && t.type !== undefined) { t.count = 1; log(`${cardNum}: target.count missing -> 1`); }

  // filterを再帰修正
  if (t.filter) t.filter = fixFilter(t.filter, cardNum);

  return t;
}

// ===== Conditionの修正 =====
function fixCondition(cond, cardNum) {
  if (!cond || typeof cond !== 'object') return cond;
  switch (cond.type) {
    case 'OPPONENT_HAND_COUNT_GTE':
      log(`${cardNum}: OPPONENT_HAND_COUNT_GTE -> HAND_COUNT`);
      return { type: 'HAND_COUNT', owner: 'opponent', operator: 'gte', value: cond.count ?? cond.value ?? 0 };
    case 'OPPONENT_ENERGY_COUNT_GTE':
      log(`${cardNum}: OPPONENT_ENERGY_COUNT_GTE -> ENERGY_COUNT`);
      return { type: 'ENERGY_COUNT', owner: 'opponent', operator: 'gte', value: cond.count ?? cond.value ?? 0 };
    case 'OTHER_STORY_SIGNI_ON_FIELD':
      log(`${cardNum}: OTHER_STORY_SIGNI_ON_FIELD -> HAS_CARD_IN_FIELD`);
      return { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: cond.story ?? cond.raw } };
    case 'TURN_TRIGGER_FIRED':
    case 'LRIG_COLOR_AND_LEVEL':
    case 'TRASHED_BLUEARCHIVE':
    case 'HAND_LOST_THIS_TURN_BY_OPPONENT':
    case 'ENERGY_LOST_THIS_TURN_BY_OPPONENT':
    case 'REVEALED_AREA_HAS_NON_ANGEL_COLORED_SIGNI':
    case 'HAS_KEY':
      log(`${cardNum}: condition.${cond.type} -> COND_STUB`);
      return { type: 'COND_STUB', raw: cond.type };
    case 'AND':
      return { ...cond, conditions: cond.conditions.map(c => fixCondition(c, cardNum)) };
    default:
      return cond;
  }
}

// ===== ActiveConditionの修正 =====
function fixActiveCondition(cond, cardNum) {
  if (!cond || typeof cond !== 'object') return cond;
  switch (cond.type) {
    case 'OPPONENT_TURN':
    case 'IS_OPP_TURN':
      log(`${cardNum}: activeCondition.${cond.type} -> TURN_OWNER opponent`);
      return { type: 'TURN_OWNER', owner: 'opponent' };
    case 'IN_CENTER_ZONE':
      log(`${cardNum}: activeCondition.IN_CENTER_ZONE removed (always true for LRIG)`);
      return null; // 削除
    case 'LRIG_DECK_LE_1':
      log(`${cardNum}: activeCondition.LRIG_DECK_LE_1 -> COUNT_THRESHOLD`);
      return { type: 'COUNT_THRESHOLD', location: 'lrig_deck', owner: 'self', operator: 'lte', value: 1 };
    case 'AND':
      const fixed = cond.conditions.map(c => fixActiveCondition(c, cardNum)).filter(Boolean);
      return fixed.length === 1 ? fixed[0] : { ...cond, conditions: fixed };
    // KIZUNA_ACTIVE は呼び出し元で kizunaIcon: true に変換
    // CAUSED_BY_SELF_EFFECT, GROW_CONDITION_MET はエンジンがtrue返すのでそのまま
    default:
      return cond;
  }
}

// ===== Actionの再帰修正 =====
function fixAction(action, cardNum) {
  if (!action || typeof action !== 'object') return action;

  // 無効なアクションタイプ
  if (action.type === 'GRANT_ABILITY_TO_ALL_LRIGS') {
    log(`${cardNum}: action.GRANT_ABILITY_TO_ALL_LRIGS -> STUB`);
    return { type: 'STUB', id: 'GRANT_ABILITY_TO_ALL_LRIGS', grantedAbilities: action.grantedAbilities, target: fixTarget(action.target, cardNum) };
  }
  if (action.type === 'REMOVE_KEYWORD') {
    log(`${cardNum}: action.REMOVE_KEYWORD -> STUB`);
    return { type: 'STUB', id: 'REMOVE_KEYWORD', target: fixTarget(action.target, cardNum), keywords: action.keywords, preventGaining: action.preventGaining, duration: action.duration };
  }
  if (action.type === 'SELF_CARD') {
    log(`${cardNum}: source.type SELF_CARD action -> STUB`);
    return { type: 'STUB', id: 'SELF_CARD_SOURCE' };
  }

  let a = { ...action };

  // target / source / charm / to の修正
  for (const key of ['target','source','charm','to']) {
    if (a[key] && typeof a[key] === 'object') {
      if (a[key].type === 'SELF_CARD') {
        // sourceがSELF_CARDの場合は上位をSTUBにする必要があるが、ここでは削除
        delete a[key];
        log(`${cardNum}: ${key}.type SELF_CARD removed`);
      } else {
        a[key] = fixTarget(a[key], cardNum);
      }
    }
  }

  // POWER_MODIFY の duration フィールドを削除（PowerModifyActionに存在しない）
  if (a.type === 'POWER_MODIFY' && 'duration' in a) {
    delete a.duration;
    log(`${cardNum}: POWER_MODIFY.duration removed (not in interface)`);
  }

  // condition修正
  if (a.condition) a.condition = fixCondition(a.condition, cardNum);

  // 再帰
  if (a.steps) a.steps = a.steps.map(s => fixAction(s, cardNum));
  if (a.choices) a.choices = a.choices.map(c => ({ ...c, action: fixAction(c.action, cardNum), condition: c.condition ? fixCondition(c.condition, cardNum) : undefined }));
  if (a.then) a.then = fixAction(a.then, cardNum);
  if (a.else) a.else = fixAction(a.else, cardNum);
  if (a.afterSearch) a.afterSearch = fixAction(a.afterSearch, cardNum);
  if (a.effect && typeof a.effect === 'object') {
    a.effect = { ...a.effect, action: fixAction(a.effect.action, cardNum) };
    if (a.effect.condition) a.effect.condition = fixCondition(a.effect.condition, cardNum);
  }
  if (a.abilities) a.abilities = a.abilities.map(ab => ({ ...ab, action: ab.action ? fixAction(ab.action, cardNum) : ab.action }));

  return a;
}

// ===== メイン処理 =====
for (const [fname, fpath] of Object.entries(FILES)) {
  const data = JSON.parse(readFileSync(fpath, 'utf8'));
  let modified = false;

  for (const [cardNum, effects] of Object.entries(data)) {
    data[cardNum] = effects.map(eff => {
      let e = { ...eff };

      // duration修正
      if (e.duration === 'UNTIL_END_OF_OPPONENT_TURN') {
        e.duration = 'NEXT_TURN';
        log(`${cardNum}: duration UNTIL_END_OF_OPPONENT_TURN -> NEXT_TURN`);
      }

      // activeCondition修正
      if (e.activeCondition) {
        if (e.activeCondition.type === 'KIZUNA_ACTIVE') {
          e.kizunaIcon = true;
          delete e.activeCondition;
          log(`${cardNum}: activeCondition.KIZUNA_ACTIVE -> kizunaIcon:true`);
        } else {
          const fixed = fixActiveCondition(e.activeCondition, cardNum);
          if (fixed === null) delete e.activeCondition;
          else e.activeCondition = fixed;
        }
      }

      // condition修正
      if (e.condition) e.condition = fixCondition(e.condition, cardNum);

      // action修正
      if (e.action) e.action = fixAction(e.action, cardNum);

      return e;
    });
  }

  writeFileSync(fpath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n${fname} saved`);
}

console.log(`\nTotal fixes applied: ${fixCount}`);
