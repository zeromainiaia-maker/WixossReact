import type { CardEffect } from '../types/effects';

// CardNum をキーに効果定義を登録する
// 効果のないカードはこのマップに含めない（undefined = 効果なし）
const cardEffects: Record<string, CardEffect[]> = {

  'WD01-009': [
    {
      effectId: 'WD01-009-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'TURN_OWNER', owner: 'opponent' },
      action: {
        type: 'POWER_MODIFY',
        target: { type: 'SIGNI', owner: 'self', count: 'ALL' },
        delta: 1000,
      },
      duration: 'PERMANENT',
    },
    {
      effectId: 'WD01-009-E2',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      mandatory: false,
      action: {
        type: 'BOUNCE',
        target: { type: 'SIGNI', owner: 'opponent', count: 1 },
      },
      duration: 'INSTANT',
    },
  ],

  'WD01-011': [
    {
      effectId: 'WD01-011-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      mandatory: false,
      cost: { energy: [{ color: '白', count: 1 }] },
      action: {
        type: 'SEARCH',
        from: { location: 'deck', owner: 'self' },
        filter: { cardName: '甲冑　ローメイル' },
        maxCount: 1,
        then: {
          type: 'SEQUENCE',
          steps: [
            { type: 'REVEAL' },
            { type: 'ADD_TO_HAND', owner: 'self' },
          ],
        },
        afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' },
      },
      usageLimit: 'once_per_trigger',
      duration: 'INSTANT',
    },
    {
      effectId: 'WD01-011-E2',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      mandatory: false,
      action: { type: 'DRAW', owner: 'self', count: 1 },
      duration: 'INSTANT',
    },
  ],

  'WD01-014': [
    {
      effectId: 'WD01-014-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      mandatory: true,
      action: {
        type: 'LOOK_AND_REORDER',
        source: { location: 'deck', owner: 'self' },
        count: 3,
        private: true,
        reorder: true,
        destination: { location: 'deck', owner: 'self', position: 'top' },
      },
      duration: 'INSTANT',
    },
  ],

};

export default cardEffects;
