/**
 * fixAddedEffects.mjs
 * addMissingEffects.ts で追加した33枚のうち、パーサー出力に誤りがあるものを修正。
 * あわせて WX06-006 のパワー値・条件分岐バグを修正。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'));
const save = (f, j) => fs.writeFileSync(path.join(root, 'public/data', f), JSON.stringify(j), 'utf8');

// ─── effects_WXK.json ───
{
  const j = load('effects_WXK.json');

  // WXK01-048 オートバイ: 「パワー1000以下の」フィルタが欠落していた
  j['WXK01-048'][0].action.target.filter.powerRange = { max: 1000 };

  // WXK01-074 タクシー: 【ドライブ常】ダブクラが欠落し、【自】が誤って常時+5000になっていた
  j['WXK01-074'] = [
    {
      effectId: 'WXK01-074-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'IS_DRIVE_STATE' },
      action: {
        type: 'GRANT_KEYWORD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        keyword: 'ダブルクラッシュ',
        duration: 'PERMANENT',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
    {
      // 「ドライブ状態になったとき」専用タイミングがないため、
      // アタックフェイズ開始時+IS_DRIVE_STATE で近似
      effectId: 'WXK01-074-E2',
      effectType: 'AUTO',
      timing: ['ATTACK'],
      activeCondition: { type: 'IS_DRIVE_STATE' },
      action: {
        type: 'POWER_MODIFY',
        target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' }, upToCount: false },
        delta: 5000,
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'PARTIAL',
    },
  ];

  save('effects_WXK.json', j);
  console.log('effects_WXK.json: WXK01-048, WXK01-074 修正');
}

// ─── effects_WX.json ───
{
  const j = load('effects_WX.json');

  // WX17-035 ピグシイ E1: 「このシグニの正面のシグニ」は相手シグニ（正面指定は近似）
  j['WX17-035'][0].action.target.owner = 'opponent';

  // WX18-061 クロカン: コスト（下からカード1枚トラッシュ・ターン1回）と
  // 「エナゾーンに置くかカードを１枚引く」の二択が欠落していた
  j['WX18-061'] = [
    {
      effectId: 'WX18-061-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      usageLimit: 'once_per_turn',
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'trash', count: 1, upToCount: false, fromThis: true },
          {
            type: 'CHOOSE',
            choose_count: 1,
            from_count: 2,
            choices: [
              { choiceId: 'c0', label: 'デッキの一番上をエナゾーンに置く', action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 } },
              { choiceId: 'c1', label: 'カードを１枚引く', action: { type: 'DRAW', owner: 'self', count: 1 } },
            ],
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ];

  // WX06-006 アンシエント・ゲート: 2つ目のdeltaが-15000（正:-12000）かつ
  // 「代わりに」の置換効果がSEQUENCE（両方実行）になっていた
  j['WX06-006'][0].action = {
    type: 'CONDITIONAL',
    condition: {
      type: 'AND',
      conditions: [
        { type: 'LIFE_COUNT', owner: 'self', operator: 'lte', value: 2 },
        { type: 'COND_STUB', raw: 'あなたのセンタールリグが黒' },
      ],
    },
    then: {
      type: 'POWER_MODIFY',
      target: { type: 'SIGNI', owner: 'opponent', count: 2, filter: { cardType: 'シグニ' }, upToCount: true },
      delta: -12000,
    },
    else: {
      type: 'POWER_MODIFY',
      target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false },
      delta: -12000,
    },
  };

  save('effects_WX.json', j);
  console.log('effects_WX.json: WX17-035, WX18-061, WX06-006 修正');
}

// ─── effects_WXDi.json ───
{
  const j = load('effects_WXDi.json');

  // WXDi-P02-046 ファラリス: トリガーは「バトルで相手シグニをバニッシュしたとき」、
  // 削るのは対戦相手のデッキ（owner:selfになっていた）
  j['WXDi-P02-046'][0].timing = ['ON_SIGNI_BANISH_BATTLE'];
  j['WXDi-P02-046'][0].action.target.owner = 'opponent';

  // WXDi-P03-085 ルカ: 「パワー3000以下」フィルタが欠落していた
  // （「黒ではない」の色除外フィルタはスキーマ未対応のため近似）
  j['WXDi-P03-085'][0].action.target.filter.powerRange = { max: 3000 };

  // WXDi-P16-048 ゼウシアス 選択肢2: バニッシュ対象が自分・パワー8000以下欠落
  {
    const seq = j['WXDi-P16-048'][0].action.choices[1].action;
    seq.steps = [
      seq.steps[0], // TRASH 手札1枚
      {
        type: 'BANISH',
        target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { max: 8000 } }, upToCount: false },
      },
    ];
  }

  // WXDi-P16-092 トルネンブラ: 【常】色喪失効果が欠落していた（エンジンにSTUB実装あり）
  if (!j['WXDi-P16-092'].some(e => e.effectId === 'WXDi-P16-092-E2')) {
    j['WXDi-P16-092'].push({
      effectId: 'WXDi-P16-092-E2',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'LOSE_COLOR_ALL_ZONES' },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    });
  }

  save('effects_WXDi.json', j);
  console.log('effects_WXDi.json: WXDi-P02-046, WXDi-P03-085, WXDi-P16-048, WXDi-P16-092 修正');
}

// ─── effects_WX24_26.json ───
{
  const j = load('effects_WX24_26.json');

  // WX25-P3-036 真・遊月・参:
  //  【自】に「＜龍獣＞のシグニがある場合」条件が欠落、
  //  相手ライフクラッシュのバースト不発(triggerBurst:false)が未反映、
  //  【起】《ゲーム１回》バーニングが丸ごと欠落していた
  j['WX25-P3-036'] = [
    {
      effectId: 'WX25-P3-036-E1',
      effectType: 'AUTO',
      timing: ['ATTACK'],
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: '龍獣' } },
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          {
            choiceId: 'c0',
            label: '自分のライフを１枚クラッシュし、相手のライフを１枚クラッシュ（バースト不発）',
            action: {
              type: 'SEQUENCE',
              steps: [
                { type: 'LIFE_CRASH', owner: 'self', count: 1, triggerBurst: true },
                { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: false },
              ],
            },
          },
          { choiceId: 'c1', label: '【エナチャージ１】', action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 } },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WX25-P3-036-E2',
      effectType: 'ACTIVATED',
      timing: ['MAIN', 'ATTACK'],
      usageLimit: 'once_per_game',
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'STUB', id: 'COST_LRIG_DECK_ARTS_TO_LRIG_TRASH' },
          { type: 'SHUFFLE_DECK', owner: 'self' },
          { type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: true },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'PARTIAL',
    },
  ];

  save('effects_WX24_26.json', j);
  console.log('effects_WX24_26.json: WX25-P3-036 修正');
}

console.log('完了');
