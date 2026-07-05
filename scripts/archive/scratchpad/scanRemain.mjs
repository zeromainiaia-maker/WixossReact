import { readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const root = 'C:/Users/zerom/WixossReact';
const textByNum = {};
for (let i = 1; i <= 10; i++) {
  try {
    const t = readFileSync(join(root, 'public/data', `CardData_Sheet${i}.csv`), 'utf-8').replace(/^﻿/, '');
    const p = Papa.parse(t, { header: true, skipEmptyLines: true });
    for (const r of p.data) if (r.CardNum) textByNum[r.CardNum.trim()] = r.EffectText || '';
  } catch {}
}
const files = ['effects_misc.json','effects_WX.json','effects_WX24_26.json','effects_WXDi.json','effects_WXK.json'];
const all = {};
for (const f of files) Object.assign(all, JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8')));

// decompile に生STUB(id露出) として残っている id 群
const ids = ['WHITE_SIGNI_ABILITY_PROTECT','USE_SPELL_FROM_TRASH','SIGNI_PROTECT_MOVE_EXCEPT_ENERGY','SIGNI_GRANT_CHOSEN_ABILITY','RESTRICT_CHARMED_SIGNI_ACTIVATED','RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE','REPLACE_LEAVE_FIELD_WITH_TRASH_UNDER','PLAY_SPELL_FROM_HAND_FREE','PLAY_SPELL_FROM_HAND','PLAY_EFFECT_TARGET_CLASS_CHANGE','GROW_FROM_LEVEL0','GROW_COST_SUBSTITUTE_TRASH_SIGNI','DYNAMIC_LEVEL_BY_ENERGY','COOKING_BANISH_SUBSTITUTE','CONDITIONAL_GROW_AND_KEY_DISABLE','BLACK_RISE_PLAY_STACK_FROM_TRASH','BANISH_SUBSTITUTE_RISE_STACK','BANISH_ATTACKER_IF_WEAKER_THAN_FRONT','ATTACK_COUNT_BY_POWER','ARTS_COST_REDUCTION_BY_COST_THRESHOLD','ARTS_COLORLESS_MUST_PAY_CENTER_COLOR','ALLOW_ATTACK_WHILE_DRIVE','ADJACENT_ZONE_ATTACK'];

// 各 id について action STUB として持つカードを集計
const byId = {};
for (const [num, effs] of Object.entries(all)) for (const e of effs) {
  const a = e.action;
  if (a?.type === 'STUB' && ids.includes(a.id)) {
    const ac = e.activeCondition ? (e.activeCondition.type + (e.activeCondition.owner ? ':' + e.activeCondition.owner : '')) : 'なし';
    (byId[a.id] ??= []).push({ num, eid: e.effectId, ac, etype: e.effectType });
  }
}

for (const id of ids) {
  const list = byId[id] || [];
  console.log(`\n■ ${id}  [actionカード数=${list.length}]`);
  for (const x of list) {
    const t = (textByNum[x.num] || '').replace(/\s+/g, ' ');
    console.log(`   ${x.num}/${x.eid} (${x.etype}, ac=${x.ac})`);
    console.log(`     原文: ${t.slice(0, 130)}`);
  }
}
