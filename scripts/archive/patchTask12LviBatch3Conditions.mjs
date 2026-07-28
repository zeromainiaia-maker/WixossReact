// Applied 2026-07-28 for task12(lvi) batch 3.
// Surgical curated-JSON correction only; do not replace this with build:effects.
import fs from 'node:fs';

const patches = [
  {
    file: 'public/data/effects_WXK.json',
    effectId: 'WXK01-020-E1',
    before: { type: 'HAND_COUNT', owner: 'self', operator: 'eq', value: 1 },
    after: { type: 'HAND_COUNT', owner: 'self', operator: 'lte', value: 1 },
  },
  {
    file: 'public/data/effects_WXK.json',
    effectId: 'WXK07-001-E1',
    before: { type: 'LRIG_LEVEL', owner: 'self', operator: 'gte', value: 4 },
    after: {
      type: 'OR',
      conditions: [
        { type: 'LRIG_NAME_CONTAINS', owner: 'self', name: '花代' },
        { type: 'LRIG_LEVEL', owner: 'self', operator: 'gte', value: 4 },
      ],
    },
  },
  {
    file: 'public/data/effects_misc.json',
    effectId: 'WDK01-009-E1',
    before: { type: 'COND_STUB', raw: 'あなたのセンタールリグが赤の' },
    after: { type: 'LRIG_COLOR', owner: 'self', color: '赤' },
  },
  {
    file: 'public/data/effects_misc.json',
    effectId: 'WDK06-C06-E1',
    before: { type: 'COND_STUB', raw: 'あなたのトラッシュにカードが２０枚以上ある' },
    after: { type: 'TRASH_COUNT', owner: 'self', operator: 'gte', value: 20 },
  },
];

const stable = value => JSON.stringify(value);
const byFile = Map.groupBy(patches, patch => patch.file);

for (const [file, filePatches] of byFile) {
  const originalText = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(originalText);
  const effects = Object.values(data).flat();

  for (const patch of filePatches) {
    const matches = effects.filter(effect => effect.effectId === patch.effectId);
    if (matches.length !== 1) {
      throw new Error(`${patch.effectId}: expected exactly one match, got ${matches.length}`);
    }
    const [effect] = matches;
    if (stable(effect.condition) !== stable(patch.before)) {
      throw new Error(`${patch.effectId}: old condition did not match: ${stable(effect.condition)}`);
    }
    effect.condition = patch.after;
  }

  const updatedText = JSON.stringify(data);
  const verify = JSON.parse(updatedText);
  const original = JSON.parse(originalText);
  const changed = [];
  for (const [cardNum, updatedEffects] of Object.entries(verify)) {
    updatedEffects.forEach((effect, index) => {
      const oldEffect = original[cardNum][index];
      if (stable(effect) !== stable(oldEffect)) {
        const oldWithoutCondition = { ...oldEffect };
        const newWithoutCondition = { ...effect };
        delete oldWithoutCondition.condition;
        delete newWithoutCondition.condition;
        if (stable(oldWithoutCondition) !== stable(newWithoutCondition)) {
          throw new Error(`${effect.effectId}: a field other than condition changed`);
        }
        changed.push(effect.effectId);
      }
    });
  }
  const expected = filePatches.map(patch => patch.effectId);
  if (stable(changed) !== stable(expected)) {
    throw new Error(`${file}: changed IDs ${stable(changed)} != expected ${stable(expected)}`);
  }
  fs.writeFileSync(file, updatedText);
  console.log(`${file}: patched ${changed.join(', ')}`);
}
