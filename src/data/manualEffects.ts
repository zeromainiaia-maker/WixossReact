import type { CardEffect, SequenceAction, ChooseAction, GrantLrigAbilityAction } from '../types/effects';

/**
 * 繝代・繧ｵ繝ｼ縺ｧ閾ｪ蜍戊ｧ｣譫舌〒縺阪↑縺・き繝ｼ繝牙崋譛峨・蜉ｹ譫懷ｮ夂ｾｩ縲・
 * buildEffectsMap 縺翫ｈ縺ｳ buildEffectsJson 縺ｧ閾ｪ蜍戊ｧ｣譫千ｵ先棡縺ｫ繝槭・繧ｸ縺輔ｌ繧九・
 * - 蜷後§ effectId 縺悟ｭ伜惠縺吶ｋ蝣ｴ蜷医・縺薙％縺ｮ螳夂ｾｩ縺ｧ荳頑嶌縺・
 * - 蟄伜惠縺励↑縺・effectId 縺ｯ譛ｫ蟆ｾ縺ｫ霑ｽ蜉
 */
export const MANUAL_EFFECTS: Record<string, CardEffect[]> = {

  // WX04-101 蟷ｻ豌ｴ縲螟ｧ繧ｦ繝翫ぐ・郁ｵｷ蜍包ｼ・
  // 縲占ｵｷ縲代％縺ｮ繧ｷ繧ｰ繝九ｒ蝣ｴ縺九ｉ繝医Λ繝・す繝･縺ｫ鄂ｮ縺擾ｼ夂嶌謇九す繧ｰ繝具ｼ台ｽ薙・繝代Ρ繝ｼ繧定・繝ｫ繝ｪ繧ｰlvﾃ・1000・医ち繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ・・
  'WX04-101': [
    {
      effectId: 'WX04-101-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { banish_self: true },
      action: {
        type: 'POWER_MODIFY_PER_LRIG_LEVEL',
        target: { type: 'SIGNI', owner: 'opponent', count: 1 },
        deltaPerLevel: -1000,
        lrigOwner: 'self',
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX05-020 蟷ｻ豌ｴ縲繧ｷ繝｣繝・ｼ・UTO E2・・
  // 縲占・縲代翫ち繝ｼ繝ｳ・大屓縲具ｼ壹≠縺ｪ縺溘・・憺桶遏ｳ・槭°・懷ｮ晉浹・槭・繧ｷ繧ｰ繝具ｼ台ｽ薙′蟇ｾ謌ｦ逶ｸ謇九・繧｢繝ｼ繝・・蜉ｹ譫懊ｒ蜿励￠縺溘→縺阪・
  //   蟇ｾ謌ｦ逶ｸ謇九↓繝繝｡繝ｼ繧ｸ繧剃ｸ弱∴繧九ゑｼ郁ｿ台ｼｼ: 逶ｸ謇九′繧｢繝ｼ繝・ｒ菴ｿ逕ｨ縺励◆縺ｨ縺阪√ヵ繧｣繝ｼ繝ｫ繝峨↓隧ｲ蠖薙す繧ｰ繝九′縺・ｌ縺ｰ逋ｺ蜍包ｼ・
  'WX05-020': [
    {
      effectId: 'WX05-020-E2',
      effectType: 'AUTO',
      timing: ['ON_OPP_ARTS_USE'],
      triggerScope: 'self',
      activeCondition: {
        type: 'HAS_CARD_IN_FIELD',
        owner: 'self',
        filter: { cardType: '繧ｷ繧ｰ繝・, story: ['驩ｱ遏ｳ', '螳晉浹'] },
      },
      action: { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX06-019 蟷ｻ豌ｴ縲繧ｷ繝ｭ繝翫け繧ｸ
  // 縲仙ｸｸ縲代≠縺ｪ縺溘・莉悶・・懈ｰｴ迯｣・槭・繧ｷ繧ｰ繝・菴薙′蟇ｾ謌ｦ逶ｸ謇九・蜉ｹ譫懊↓繧医▲縺ｦ蝣ｴ繧帝屬繧後ｋ蝣ｴ蜷医・
  //   莉｣繧上ｊ縺ｫ繧ｿ繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ縲√％縺ｮ繧ｷ繧ｰ繝九・繝代Ρ繝ｼ繧抵ｼ・000縺励※繧ゅｈ縺・・
  'WX06-019': [
    {
      effectId: 'WX06-019-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'BANISH_SUBSTITUTE',
        trigger: { type: 'SIGNI', owner: 'self', count: 1, filter: { story: '豌ｴ迯｣' } },
        substituteCost: { powerReduction: 6000 },
        optional: true,
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX06-022 螟ｧ讒阪繝医Λ繧､繝・
  // 縲仙ｸｸ縲代そ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺檎區縺九▽荳ｭ螟ｮ繧ｾ繝ｼ繝ｳ蝨ｨ邀阪°縺弱ｊ縲∝渕譛ｬ繝代Ρ繝ｼ縺ｯ10000縺ｫ縺ｪ繧翫・
  //   縲悟ｯｾ謌ｦ逶ｸ謇九・蜉ｹ譫懊↓繧医▲縺ｦ繝舌ル繝・す繝･縺輔ｌ縺ｪ縺・阪ｒ蠕励ｋ縲ゑｼ域擅莉ｶ縺ｯPARTIAL・・
  'WX06-022': [
    {
      effectId: 'WX06-022-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'POWER_SET', target: { type: 'SIGNI', owner: 'self', count: 1 }, value: 10000 },
          {
            type: 'GRANT_PROTECTION',
            target: { type: 'SIGNI', owner: 'self', count: 1 },
            from: ['繧ｷ繧ｰ繝・, '繧｢繝ｼ繝・, '繧ｹ繝壹Ν', '繝ｫ繝ｪ繧ｰ'],
            sourceOwner: 'opponent',
            duration: 'PERMANENT',
          },
        ],
      } as SequenceAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX06-033 蜿榊ｾｩ縺吶ｋ迢ｬ閾ｪ諤ｧ縲繧ｰ繝ｪ繝・ラ
  // 縲仙・縲代％縺ｮ繧ｿ繝ｼ繝ｳ縲√≠縺ｪ縺溘・蜉ｹ譫懊↓繧医▲縺ｦ繝・ャ繧ｭ荳翫°繧牙・髢九☆繧句ｴ蜷医∽ｻ｣繧上ｊ縺ｫ1譫壼､壹￥蜈ｬ髢九＠縺ｦ繧ゅｈ縺・・
  //   ・域里蟄伜梛縺ｧ縺ｯ陦ｨ迴ｾ荳榊庄縺ｮ縺溘ａUNKNOWN繧｢繧ｯ繧ｷ繝ｧ繝ｳ・貴ANUAL繧ｹ繝・・繧ｿ繧ｹ・・
  'WX06-033': [
    {
      effectId: 'WX06-033-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: { type: 'STUB', id: 'GRID_REVEAL_PLUS' },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX08-035 蠑ｩ遐ｲ縲繝医・繝斐・繝会ｼ・1縺ｮ縺ｿ・・
  // 縲仙ｸｸ縲代≠縺ｪ縺溘・蝣ｴ縺ｫ縺ゅｋ縲翫け繝ｭ繧ｹ繧｢繧､繧ｳ繝ｳ縲九ｒ謖√▽繧ｷ繧ｰ繝・菴薙↓縺､縺搾ｼ・000縺輔ｌ繧九・
  //   ・医い繧､繧ｳ繝ｳ繝輔ぅ繝ｫ繧ｿ譛ｪ蟇ｾ蠢懊・縺溘ａPARTIAL・壼・繧ｷ繧ｰ繝・菴薙＃縺ｨ+2000縺ｧ霑台ｼｼ・・
  'WX08-035': [
    {
      effectId: 'WX08-035-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: 2000,
        countFilter: { cardType: '繧ｷ繧ｰ繝・ },
        countOwner: 'self',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX09-CB02 邨よ忰縺ｮ蝗樊雷縲繝√ぉ繝ｭ繝ｳ・・1縺ｮ縺ｿ・・
  // 縲仙ｸｸ縲代≠縺ｪ縺溘・縲翫け繝ｭ繧ｹ繧｢繧､繧ｳ繝ｳ縲九ｒ謖√▽・懃ｾ主ｷｧ・槭・繧ｷ繧ｰ繝九・蟇ｾ謌ｦ逶ｸ謇九・蜉ｹ譫懊↓繧医▲縺ｦ繝舌ル繝・す繝･縺輔ｌ縺ｪ縺・・
  //   ・医い繧､繧ｳ繝ｳ繝輔ぅ繝ｫ繧ｿ譛ｪ蟇ｾ蠢懊・縺溘ａPARTIAL・夂ｾ主ｷｧ蜈ｨ菴薙↓菫晁ｭｷ縺ｧ霑台ｼｼ・・
  'WX09-CB02': [
    {
      effectId: 'WX09-CB02-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_PROTECTION',
        target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { story: '鄒主ｷｧ' } },
        from: ['繧ｷ繧ｰ繝・, '繧｢繝ｼ繝・, '繧ｹ繝壹Ν', '繝ｫ繝ｪ繧ｰ'],
        sourceOwner: 'opponent',
        duration: 'PERMANENT',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX10-018 證ｴ鬚ｨ隴ｦ蝣ｱ・医せ繝壹Ν・・
  // 縺薙・繧ｿ繝ｼ繝ｳ縲∝ｯｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝九°繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺後い繧ｿ繝・け縺励◆縺ｨ縺阪・
  //   1蠎ｦ逶ｮ縺・蠎ｦ逶ｮ縺ｮ蝣ｴ蜷医√◎縺ｮ繧｢繧ｿ繝・け繧堤┌蜉ｹ縺ｫ縺吶ｋ縲ゑｼ・ARTIAL・壼・繧｢繧ｿ繝・け髦ｲ豁｢縺ｧ霑台ｼｼ・・
  'WX10-018': [
    {
      effectId: 'WX10-018-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      action: { type: 'PREVENT_DAMAGE', owner: 'self', until: 'UNTIL_END_OF_TURN' },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX10-053 髮・ｵ舌☆繧句ｮ郁ｭｷ・医せ繝壹Ν・・
  // 繧ｳ繧ｹ繝医・繧ｵ繝ｼ繝舌Φ繝医す繧ｰ繝・菴薙↓縺､縺阪顔┌ﾃ・縲区ｸ帙ｋ・・ARTIAL霑台ｼｼ・峨・
  // 竭繝医Λ繝・す繝･縺九ｉ繧ｵ繝ｼ繝舌Φ繝医す繧ｰ繝九ｒ2譫壹∪縺ｧ謇区惆縺ｫ縲や贈繧ｵ繝ｼ繝舌Φ繝亥・繧ｷ繧ｰ繝・5000+繝ｩ繝ｳ繧ｵ繝ｼ縲・
  'WX10-053': [
    {
      effectId: 'WX10-053-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '辟｡', count: 7 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'COST_REDUCTION',
            targetCardType: '繧ｹ繝壹Ν',
            reduction: [{ color: '辟｡', count: 2 }],
            duration: 'PERMANENT',
          },
          {
            type: 'CHOOSE',
            choose_count: 1,
            from_count: 2,
            choices: [
              {
                choiceId: 'c0',
                label: '竭繧ｵ繝ｼ繝舌Φ繝医ｒ謇区惆縺ｸ',
                action: {
                  type: 'TRANSFER_TO_HAND',
                  source: { type: 'TRASH_CARD', owner: 'self', count: 2, upToCount: true },
                },
              },
              {
                choiceId: 'c1',
                label: '竭｡蜈ｨ繧ｵ繝ｼ繝舌Φ繝・5000+繝ｩ繝ｳ繧ｵ繝ｼ',
                action: {
                  type: 'SEQUENCE',
                  steps: [
                    { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL' }, delta: 5000 },
                    { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 'ALL' }, keyword: '繝ｩ繝ｳ繧ｵ繝ｼ', duration: 'UNTIL_END_OF_TURN' },
                  ],
                } as SequenceAction,
              },
            ],
          } as ChooseAction,
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX11-024 繝ｪ繝輔Ξ繝・す繝･繝ｻ繧ｨ繝ｳ繝会ｼ医せ繝壹Ν・・
  // 縺薙・繧ｿ繝ｼ繝ｳ縲∝ｯｾ謌ｦ逶ｸ謇九′谺｡縺ｫ繝ｪ繝輔Ξ繝・す繝･縺励◆蝣ｴ蜷医√◎縺ｮ蠕後〒縺薙・繧ｿ繝ｼ繝ｳ繧堤ｵゆｺ・☆繧九・
  //   ・・ARTIAL・壹Μ繝輔Ξ繝・す繝･譚｡莉ｶ繧堤怐逡･縺友ORCE_END_TURN縺ｧ霑台ｼｼ・・
  'WX11-024': [
    {
      effectId: 'WX11-024-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      action: { type: 'FORCE_END_TURN' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX05-016 繧ｸ繝｣繝・ず繝｡繝ｳ繝医・繧ｯ繝ｭ繧ｹ・医い繝ｼ繝・ｼ・
  // 蜈ｨ5濶ｲ繧ｳ繧ｹ繝医〒菴ｿ逕ｨ 竊・縺薙・繧ｿ繝ｼ繝ｳ繧貞ｼｷ蛻ｶ邨ゆｺ・☆繧・
  'WX05-016': [
    {
      effectId: 'WX05-016-E1',
      effectType: 'ACTIVATED',
      timing: ['SPELL_CUTIN'],
      cost: {
        energy: [
          { color: '逋ｽ', count: 1 },
          { color: '襍､', count: 1 },
          { color: '髱・, count: 1 },
          { color: '邱・, count: 1 },
          { color: '鮟・, count: 1 },
        ],
      },
      action: { type: 'FORCE_END_TURN' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX01-028 繧｢繝ｼ繧ｯ繝ｻ繧ｪ繝ｼ繝ｩ・医せ繝壹Ν縲√さ繧ｹ繝医顔區縲凝・縲√ち繝樣剞螳夲ｼ・
  // 繧ｿ繝ｼ繝ｳ邨ゆｺ・凾縺ｾ縺ｧ縲√≠縺ｪ縺溘・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｯ
  // 縲後占・縲托ｼ壹％縺ｮ繝ｫ繝ｪ繧ｰ縺後い繧ｿ繝・け縺励◆縺ｨ縺阪√≠縺ｪ縺溘・繧ｷ繧ｰ繝具ｼ台ｽ薙ｒ蝣ｴ縺九ｉ繝医Λ繝・す繝･縺ｫ鄂ｮ縺・※繧ゅｈ縺・・
  //   縺昴≧縺励◆蝣ｴ蜷医√％縺ｮ繝ｫ繝ｪ繧ｰ繧偵い繝・・縺吶ｋ縲ゅ阪ｒ蠕励ｋ縲・
  'WX01-028': [
    {
      effectId: 'WX01-028-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '逋ｽ', count: 5 }] },
      action: {
        type: 'GRANT_LRIG_ABILITY',
        abilities: [
          {
            effectId: 'WX01-028-AUTO',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_LRIG'],
            action: {
              type: 'CHOOSE',
              choose_count: 1,
              from_count: 2,
              choices: [
                {
                  choiceId: 'trash_and_up',
                  label: '繧ｷ繧ｰ繝具ｼ台ｽ薙ｒ繝医Λ繝・す繝･縺励※繝ｫ繝ｪ繧ｰ繧偵い繝・・',
                  action: {
                    type: 'SEQUENCE',
                    steps: [
                      { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } },
                      { type: 'UP', target: { type: 'LRIG', owner: 'self', count: 1 } },
                    ],
                  } as SequenceAction,
                },
                {
                  choiceId: 'skip',
                  label: '繝医Λ繝・す繝･縺励↑縺・,
                  action: { type: 'SEQUENCE', steps: [] } as SequenceAction,
                },
              ],
            } as ChooseAction,
            duration: 'INSTANT',
            mandatory: false,
            parseStatus: 'AUTO',
          },
        ] as CardEffect[],
        rawText: '縺薙・繝ｫ繝ｪ繧ｰ縺後い繧ｿ繝・け縺励◆縺ｨ縺阪√す繧ｰ繝具ｼ台ｽ薙ｒ繝医Λ繝・す繝･縺励※繧ゅｈ縺・ゅ◎縺・＠縺溷ｴ蜷医√％縺ｮ繝ｫ繝ｪ繧ｰ繧偵い繝・・縺吶ｋ縲・,
      } as GrantLrigAbilityAction,
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX01-057 蜃ｺ蠑薙繧ｻ繝輔ぅ繝ｩ繝
  // 縲仙・縲托ｼ壹≠縺ｪ縺溘・繝・ャ繧ｭ縺ｮ荳逡ｪ荳翫ｒ隕九ｋ縲・
  //         縺昴ｌ縺鍬v.2莉･荳九・繧ｷ繧ｰ繝九〒閾ｪ蛻・・蝣ｴ縺ｫ莉悶・繧ｷ繧ｰ繝九′縺ｪ縺・ｴ蜷医√◎繧後ｒ蝣ｴ縺ｫ蜃ｺ縺励※繧ゅｈ縺・・
  'WX01-057': [
    {
      effectId: 'WX01-057-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'LOOK_AND_REORDER',
            source: { location: 'deck', owner: 'self' },
            count: 1,
            private: true,
            reorder: false,
            destination: { location: 'deck', owner: 'self', position: 'top' },
          },
          {
            // 譚｡莉ｶ・壹ョ繝・く繝医ャ繝励′Lv.2莉･荳九・繧ｷ繧ｰ繝・縺九▽ 閾ｪ蛻・・蝣ｴ縺ｫ莉悶・繧ｷ繧ｰ繝九′縺ｪ縺・ｼ郁・霄ｫ縺ｮ縺ｿ=1菴難ｼ・
            type: 'CONDITIONAL',
            condition: {
              type: 'AND',
              conditions: [
                { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: '繧ｷ繧ｰ繝・, level: { max: 2 } } },
                { type: 'FIELD_COUNT', owner: 'self', operator: 'eq', value: 1 },
              ],
            },
            then: {
              type: 'CHOOSE',
              choose_count: 1,
              choices: [
                {
                  choiceId: 'yes',
                  label: '繝・ャ繧ｭ繝医ャ繝励ｒ蝣ｴ縺ｫ蜃ｺ縺・,
                  action: { type: 'ADD_TO_FIELD', owner: 'self' },
                },
                {
                  choiceId: 'no',
                  label: '蝣ｴ縺ｫ蜃ｺ縺輔↑縺・,
                  action: { type: 'SEQUENCE', steps: [] },
                },
              ],
            } as ChooseAction,
          },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WX01-057-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: { type: 'DRAW', owner: 'self', count: 1 },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WXK04-060 鄒・､・繧ｬ繧ｦ繝ｩ: ON_BANISH 縺ｯ縲悟ｯｾ謌ｦ逶ｸ謇九・繧ｿ繝ｼ繝ｳ縺ｮ髢薙阪・縺ｿ
  // 繝代・繧ｵ繝ｼ縺・activeCondition 繧定ｧ｣譫舌〒縺阪↑縺・◆繧∵焔蜍輔〒險ｭ螳・
  'WXK04-060': [
    {
      effectId: 'WXK04-060-E1',
      effectType: 'AUTO',
      timing: ['ON_BANISH'],
      activeCondition: { type: 'TURN_OWNER', owner: 'opponent' },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'LOOK_AND_REORDER',
            source: { location: 'deck', owner: 'self' },
            count: 1,
            private: true,
            reorder: false,
            destination: { location: 'deck', owner: 'self', position: 'top' },
          } as import('../types/effects').LookAndReorderAction,
          { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as import('../types/effects').StubAction,
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WXK09-TK-01A 謾ｹ騾邏譚撰ｼ医い繝ｼ繝・繧ｯ繝ｩ繝輔ヨ・・
  // 縺薙・繧ｿ繝ｼ繝ｳ謾ｹ騾邏譚蝉ｽｿ逕ｨ荳榊庄 + 髮ｻ讖溘す繧ｰ繝句ｯｾ雎｡縺ｫ竭+4000 竭｡襍ｷ蜍戊・蜉帑ｻ倅ｸ・竭｢閾ｪ蜍戊・蜉帑ｻ倅ｸ・縺九ｉ1縺､驕ｸ謚・
  'WXK09-TK-01A': [
    {
      effectId: 'WXK09-TK-01A-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '邱・, count: 0 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'BLOCK_CARD_USE', cardName: '謾ｹ騾邏譚・ },
          { type: 'STUB', id: 'DO_THREE_THINGS' },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WXDi-P11-TK01 逋ｽ鄒・弌蟋ｫ縲繧ｵ繧ｿ繝ｳ・医Ξ繧ｾ繝翫け繝ｩ繝輔ヨ・・
  // 縲仙ｸｸ縲代≠縺ｪ縺溘・繧ｿ繝ｼ繝ｳ縺ｮ髢薙∝ｯｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝九ｒ・剃ｽ薙∪縺ｧ縺励°蝣ｴ縺ｫ蜃ｺ縺吶％縺ｨ縺後〒縺阪↑縺・
  'WXDi-P11-TK01': [
    {
      effectId: 'WXDi-P11-TK01-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'TURN_OWNER', owner: 'self' },
      action: { type: 'STUB', id: 'OPP_ZONE_PLACEMENT_RESTRICT' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // PR-Di017A 逋ｽ辭ｱ縺吶ｋ鮟堤區・医せ繝壹Ν・・
  // 繧ｫ繝ｼ繝峨ｒ2譫壼ｼ輔￥縲ゅΛ繧､繝輔け繝ｭ繧ｹ縺・譫壻ｻ･荳九・蝣ｴ蜷医√メ繧ｧ繝・け繧ｾ繝ｼ繝ｳ縺ｮ繧ｫ繝ｼ繝峨ｒ陬剰ｿ斐＠縺ｦ蝣ｴ縺ｫ蜃ｺ縺呻ｼ・EV・・
  'PR-Di017A': [
    {
      effectId: 'PR-Di017A-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '辟｡', count: 2 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'DRAW', owner: 'self', count: 2 },
          { type: 'STUB', id: 'PLACE_REV_SIGNI', value: 'PR-Di017B' },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // PR-Di017B REV:繧｢繝ｳ繧ｳ繝ｼ繝ｪ繝ｳ繧ｰ・医す繧ｰ繝具ｼ・
  // 縲占・縲代い繧ｿ繝・け繝輔ぉ繧､繧ｺ髢句ｧ区凾縲∝ｯｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝・菴薙ｒ蟇ｾ雎｡縺ｨ縺励∵焔譛ｭ繧・譫壽昏縺ｦ縺ｦ繧ゅｈ縺・・繝医Λ繝・す繝･
  'PR-Di017B': [
    {
      effectId: 'PR-Di017B-E1',
      effectType: 'AUTO',
      timing: ['ATTACK'],
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'STUB', id: 'TARGET_ONLY' },
          {
            type: 'STUB', id: 'OPTIONAL_COST',
            costColors: [],
            costText: '謇区惆繧抵ｼ捺椢謐ｨ縺ｦ繧・,
          },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WXDi-P14-TK04 繝輔ぉ繧ｾ繝ｼ繝阪・繧ｸ繝・け繝ｻ豺ｱ邱托ｼ医せ繝壹Ν/繧ｯ繝ｩ繝輔ヨ・・
  // 縲舌お繝翫メ繝｣繝ｼ繧ｸ・代代ｒ縺吶ｋ縲ゅ◎縺ｮ蠕後√≠縺ｪ縺溘・繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ繧ｷ繧ｰ繝九ｒ・第椢縺ｾ縺ｧ蟇ｾ雎｡縺ｨ縺励√◎繧後ｒ蝣ｴ縺ｫ蜃ｺ縺・
  'WXDi-P14-TK04': [
    {
      effectId: 'WXDi-P14-TK04-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '邱・, count: 0 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
          { type: 'STUB', id: 'SUMMON_FROM_ENERGY' },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WXDi-P09-TK03A 繧ｳ繝ｼ繝峨う繝ｼ繝医繧ｪ繝ｳ繧ｿ繝橸ｼ医い繧ｯ繧ｻ繧ｯ繝ｩ繝輔ヨ・・
  // 縲弱仙ｸｸ縲托ｼ壹％繧後↓繧｢繧ｯ繧ｻ縺輔ｌ縺ｦ縺・ｋ繧ｷ繧ｰ繝九′蝣ｴ繧帝屬繧後ｋ蝣ｴ蜷医∽ｻ｣繧上ｊ縺ｫ縺薙ｌ繧偵ご繝ｼ繝縺九ｉ髯､螟悶＠縺ｦ繧ゅｈ縺・ゅ◎縺・＠縺溷ｴ蜷医√◎縺ｮ繧ｷ繧ｰ繝九ｒ繝繧ｦ繝ｳ縺吶ｋ縲ゅ・
  'WXDi-P09-TK03A': [
    {
      effectId: 'WXDi-P09-TK03A-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'ACCE_BANISH_SUBSTITUTE' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX25-P2-TK05 闥ｼ遨ｹ蟆・ｧｫ縲繝九Χ繝ｫ繝倥う繝・医す繧ｰ繝・繝ｬ繧ｾ繝翫け繝ｩ繝輔ヨ・・
  // 縲仙ｸｸ縲托ｼ壼ｯｾ謌ｦ逶ｸ謇九・繝峨Ο繝ｼ繝輔ぉ繧､繧ｺ縺ｮ髢薙↓繧ｫ繝ｼ繝峨ｒ蜷郁ｨ茨ｼ第椢縺ｾ縺ｧ縺励°蠑輔￠縺ｪ縺・・
  // 縲占・縲托ｼ壹％縺ｮ繧ｷ繧ｰ繝九′蝣ｴ繧帝屬繧後◆縺ｨ縺阪√き繝ｼ繝峨ｒ・呈椢蠑輔￥縺九∝ｯｾ謌ｦ逶ｸ謇九・謇区惆繧抵ｼ呈椢謐ｨ縺ｦ繧九・
  'WX25-P2-TK05': [
    {
      effectId: 'WX25-P2-TK05-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'OPP_DRAW_LIMIT_PER_TURN' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WX25-P2-TK05-E2',
      effectType: 'AUTO',
      timing: ['ON_BANISH'],
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          {
            choiceId: 'draw2',
            label: '繧ｫ繝ｼ繝峨ｒ・呈椢蠑輔￥',
            action: { type: 'DRAW', owner: 'self', count: 2 } as import('../types/effects').DrawAction,
          },
          {
            choiceId: 'opp_discard2',
            label: '蟇ｾ謌ｦ逶ｸ謇九・謇区惆繧抵ｼ呈椢謐ｨ縺ｦ繧・,
            action: {
              type: 'TRASH',
              target: { type: 'HAND_CARD', owner: 'opponent', count: 2 },
            } as import('../types/effects').TrashAction,
          },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX08-005 繧ｨ繝翫だ繝ｼ繝ｳ莉･螟悶・鬆伜沺縺ｫ縺ゅｋ繧ｫ繝ｼ繝峨・逋ｽ縺ｫ縺ｪ繧具ｼ・ONTINUOUS・・
  'WX08-005': [
    {
      effectId: 'WX08-005-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'CARDS_OUTSIDE_ENERGY_BECOME_WHITE' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX08-006 蟇ｾ謌ｦ逶ｸ謇九・縲舌メ繝｣繝ｼ繝縲代′莉倥＞縺ｦ縺・ｋ繧ｷ繧ｰ繝九・縲占ｵｷ縲題・蜉帙ｒ菴ｿ逕ｨ縺ｧ縺阪↑縺・ｼ・ONTINUOUS・・
  'WX08-006': [
    {
      effectId: 'WX08-006-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'RESTRICT_CHARMED_SIGNI_ACTIVATED' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX08-029 ・医け繝ｭ繧ｹ譎ゑｼ峨≠縺ｪ縺溘・繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ繧ｫ繝ｼ繝会ｼ第椢繧呈焔譛ｭ縺ｫ蜉縺医※繧ゅｈ縺・ｼ・UTO / ON_HEAVEN・・
  'WX08-029': [
    {
      effectId: 'WX08-029-E3',
      effectType: 'AUTO',
      timing: ['ON_HEAVEN'],
      action: {
        type: 'TRANSFER_TO_HAND',
        source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
      crossOnly: true,
    },
  ],

  // WX10-006 縺薙・繧ｷ繧ｰ繝九′繧｢繧ｿ繝・け縺励◆縺ｨ縺阪√≠縺ｪ縺溘・繧ｨ繝翫だ繝ｼ繝ｳ縺九ｉ繧ｫ繝ｼ繝会ｼ第椢繧呈焔譛ｭ縺ｫ蜉縺医※繧ゅｈ縺・ｼ・UTO / ON_ATTACK_SIGNI・・
  'WX10-006': [
    {
      effectId: 'WX10-006-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      action: {
        type: 'TRANSFER_TO_HAND',
        source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX10-008 縺薙・繧ｷ繧ｰ繝九′繝舌ル繝・す繝･縺輔ｌ繧句ｴ蜷医√Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ謌ｻ繧倶ｻ｣繧上ｊ縺ｫ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺九ｌ繧具ｼ・ONTINUOUS・・
  'WX10-008': [
    {
      effectId: 'WX10-008-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BANISH_TO_LRIG_TRASH_INSTEAD' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX10-020 縺薙・繧ｷ繧ｰ繝九′繝舌ル繝・す繝･縺輔ｌ繧句ｴ蜷医√Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ謌ｻ繧倶ｻ｣繧上ｊ縺ｫ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺九ｌ繧具ｼ・ONTINUOUS・・
  'WX10-020': [
    {
      effectId: 'WX10-020-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BANISH_TO_LRIG_TRASH_INSTEAD' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX10-024 縺薙・繧ｷ繧ｰ繝九′繝舌ル繝・す繝･縺輔ｌ繧句ｴ蜷医√Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ謌ｻ繧倶ｻ｣繧上ｊ縺ｫ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺九ｌ繧具ｼ・ONTINUOUS・・
  'WX10-024': [
    {
      effectId: 'WX10-024-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BANISH_TO_LRIG_TRASH_INSTEAD' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX11-013 縺薙・繧ｷ繧ｰ繝九′繝舌ル繝・す繝･縺輔ｌ繧句ｴ蜷医√Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ謌ｻ繧倶ｻ｣繧上ｊ縺ｫ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺九ｌ繧具ｼ・ONTINUOUS・・
  'WX11-013': [
    {
      effectId: 'WX11-013-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BANISH_TO_LRIG_TRASH_INSTEAD' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX13-028 縺薙・繧ｷ繧ｰ繝九′繝舌ル繝・す繝･縺輔ｌ繧句ｴ蜷医√Ν繝ｪ繧ｰ繝・ャ繧ｭ縺ｫ謌ｻ繧倶ｻ｣繧上ｊ縺ｫ繝ｫ繝ｪ繧ｰ繝医Λ繝・す繝･縺ｫ鄂ｮ縺九ｌ繧具ｼ・ONTINUOUS・・
  'WX13-028': [
    {
      effectId: 'WX13-028-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BANISH_TO_LRIG_TRASH_INSTEAD' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX14-017 縺ゅ↑縺溘・繧ｨ繝翫だ繝ｼ繝ｳ縺ｫ縺ゅｋ辟｡濶ｲ縺ｧ縺ｯ縺ｪ縺・き繝ｼ繝峨・縺吶∋縺ｦ縺ｮ濶ｲ繧呈戟縺､・・ONTINUOUS・・
  'WX14-017': [
    {
      effectId: 'WX14-017-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'ENERGY_NON_COLORLESS_ALL_COLORS' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WXEX1-26 蟇ｾ謌ｦ逶ｸ謇九・繧ｻ繝ｳ繧ｿ繝ｼ繝ｫ繝ｪ繧ｰ縺ｮ蝓ｺ譛ｬ繝ｪ繝溘ャ繝医・・輔↓縺ｪ繧具ｼ・ONTINUOUS・・
  'WXEX1-26': [
    {
      effectId: 'WXEX1-26-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'OPP_CENTER_LRIG_LIMIT_SET_5' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WXDi-CP02-TK01A 繝壹Ο繝ｭ莠ｺ蠖｢・医す繧ｰ繝・繧ｯ繝ｩ繝輔ヨ・・
  // 縲仙ｸｸ縲托ｼ壼ｯｾ謌ｦ逶ｸ謇九・繧ｷ繧ｰ繝九′豁｣髱｢縺ｫ繧｢繧ｿ繝・け縺吶ｋ蝣ｴ蜷医∽ｻ｣繧上ｊ縺ｫ縺薙・繧ｷ繧ｰ繝九・縺ゅｋ繧ｷ繧ｰ繝九だ繝ｼ繝ｳ縺ｫ繧｢繧ｿ繝・け縺吶ｋ縲・
  // 縲仙ｸｸ縲托ｼ壹い繝・・迥ｶ諷九・縺薙・繧ｷ繧ｰ繝九′繝舌ヨ繝ｫ縺句ｯｾ謌ｦ逶ｸ謇九・蜉ｹ譫懊↓繧医▲縺ｦ蝣ｴ繧帝屬繧後ｋ蝣ｴ蜷医∽ｻ｣繧上ｊ縺ｫ縺薙・繧ｷ繧ｰ繝九ｒ繝繧ｦ繝ｳ縺励※繧ゅｈ縺・・
  // 縲占・縲托ｼ壼ｯｾ謌ｦ逶ｸ謇九・繧ｿ繝ｼ繝ｳ邨ゆｺ・凾縲√％縺ｮ繧ｷ繧ｰ繝九ｒ繧ｲ繝ｼ繝縺九ｉ髯､螟悶☆繧九・
  'WXDi-CP02-TK01A': [
    {
      effectId: 'WXDi-CP02-TK01A-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'REDIRECT_ATTACK_TO_SELF_ZONE' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WXDi-CP02-TK01A-E2',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BATTLE_LEAVE_REPLACE_WITH_DOWN' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WXDi-CP02-TK01A-E3',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      activeCondition: { type: 'TURN_OWNER', owner: 'opponent' },
      action: { type: 'STUB', id: 'REMOVE_SELF_SIGNI_FROM_GAME' } as import('../types/effects').StubAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

};

/**
 * 閾ｪ蜍戊ｧ｣譫千ｵ先棡縺ｨ繝槭ル繝･繧｢繝ｫ蜉ｹ譫懊ｒ繝槭・繧ｸ縺吶ｋ縲・
 * - manualEffects 蜀・・ effectId 縺御ｸ閾ｴ縺吶ｋ繧ゅ・縺ｯ荳頑嶌縺・
 * - 荳閾ｴ縺励↑縺・effectId 縺ｯ譛ｫ蟆ｾ縺ｫ霑ｽ蜉
 */
export function mergeManualEffects(
  cardNum: string,
  parsed: CardEffect[],
): CardEffect[] {
  const manuals = MANUAL_EFFECTS[cardNum];
  if (!manuals || manuals.length === 0) return parsed;

  const manualMap = new Map(manuals.map(e => [e.effectId, e]));
  const merged = parsed.map(e => manualMap.has(e.effectId) ? manualMap.get(e.effectId)! : e);
  for (const m of manuals) {
    if (!merged.some(e => e.effectId === m.effectId)) merged.push(m);
  }
  return merged;
}

