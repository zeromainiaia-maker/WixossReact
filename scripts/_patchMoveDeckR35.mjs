import { readFileSync, writeFileSync } from 'fs';

function patch(file, id, effId, tc) {
  const path = `public/data/${file}`;
  const j = JSON.parse(readFileSync(path, 'utf-8'));
  const e = (j[id] ?? []).find(x => x.effectId === effId);
  if (!e) throw new Error(`no ${effId}`);
  e.timing = ['ON_CARD_MOVED_TO_DECK'];
  e.triggerScope = 'self';
  e.triggerCondition = { ...(e.triggerCondition ?? {}), ...tc };
  e.parseStatus = 'MANUAL';
  writeFileSync(path, JSON.stringify(j));
  console.log(`patched ${effId}`, JSON.stringify(tc));
}

// あなたのトラッシュから→自デッキ
patch('effects_WX.json', 'WX09-020', 'WX09-020-E1', { movedToDeckOwner: 'self', movedToDeckFromTrash: true, movedToDeckMinCount: 1 });
patch('effects_WX.json', 'WX22-014', 'WX22-014-E2', { movedToDeckOwner: 'self', movedToDeckFromTrash: true, movedToDeckMinCount: 4 });
// 対戦相手のカード→相手デッキ
patch('effects_WXK.json', 'WXK10-076', 'WXK10-076-E1', { movedToDeckOwner: 'opponent', movedToDeckMinCount: 1 });
patch('effects_misc.json', 'WDK09-013', 'WDK09-013-E1', { movedToDeckOwner: 'opponent', movedToDeckMinCount: 1 });
