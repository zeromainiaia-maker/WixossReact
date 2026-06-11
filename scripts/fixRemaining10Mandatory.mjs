/**
 * fixRemaining10Mandatory.mjs
 * checkAllEffects.mjs の MANDATORY_SUSPICIOUS 残り10件を修正する。
 *
 * 修正方針:
 *  - 「場を離れたとき手札から出してもよい」系 → ON_LEAVE_FIELD/ON_BANISH +
 *    ADD_TO_FIELD(source: HAND_CARD) + mandatory:false
 *  - 味方シグニの離脱を見るカード（ミョルニル/花代・伍）→ triggerScope:'any_ally' + triggerFilter
 *  - 「ダウン状態で場に出す」→ ADD_TO_FIELD.asDown:true
 *  - 「対戦相手のターンの間」→ condition: IS_OPPONENT_TURN
 *  - ユキ//メモリア（裏向き設置+遅延公開）は実装不能のため STUB 化
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'));
const save = (f, j) => fs.writeFileSync(path.join(root, 'public/data', f), JSON.stringify(j), 'utf8');

const fixed = [];
const ok = (id, msg) => { fixed.push(`${id}: ${msg}`); };

const handSource = (filter) => ({
  type: 'HAND_CARD', owner: 'self', count: 1, upToCount: false, filter,
});

// ============================================================
// effects_WX.json
// ============================================================
{
  const j = load('effects_WX.json');

  // WX11-035 極鎚ミョルニル:
  // 【自】あなたの＜アーム＞のシグニ１体が場を離れたとき、手札からそのシグニより低いレベルのシグニ１枚を場に出してもよい
  // ※「より低いレベル」の動的比較は未対応（プレイヤー選択に委ねる近似）
  {
    const e = j['WX11-035'][0];
    e.triggerScope = 'any_ally';
    e.triggerFilter = { cardType: 'シグニ', story: 'アーム' };
    e.action = {
      type: 'ADD_TO_FIELD', owner: 'self',
      source: handSource({ cardType: 'シグニ' }),
    };
    e.mandatory = false;
    ok('WX11-035', 'any_ally(アーム) ON_LEAVE_FIELD + 手札からADD_TO_FIELD(任意)');
  }

  // WX14-009 炎・花代・伍 E2:
  // 【自】《フレイスロ》を含むシグニ１体が場を離れたとき、手札からより低いレベルの《フレイスロ》シグニをダウン状態で出してもよい
  {
    const e = j['WX14-009'][1];
    e.timing = ['ON_LEAVE_FIELD'];
    e.triggerScope = 'any_ally';
    e.triggerFilter = { cardType: 'シグニ', cardName: 'フレイスロ' };
    e.action = {
      type: 'ADD_TO_FIELD', owner: 'self', asDown: true,
      source: handSource({ cardType: 'シグニ', cardName: 'フレイスロ' }),
    };
    e.mandatory = false;
    ok('WX14-009', 'any_ally(フレイスロ) + 手札からダウン状態でADD_TO_FIELD(任意)');
  }

  // WX17-055 混成の怪物フンババ:
  // 【自】相手ターン中このシグニが場を離れたとき、トラッシュから（下にあった非ライズの）シグニを出してもよい
  // ※「下にあった」の追跡は未対応（トラッシュのシグニから選ぶ近似）
  {
    const e = j['WX17-055'][0];
    e.condition = { type: 'IS_OPPONENT_TURN' };
    e.mandatory = false;
    ok('WX17-055', 'IS_OPPONENT_TURN条件 + mandatory:false');
  }

  save('effects_WX.json', j);
}

// ============================================================
// effects_WX24_26.json
// ============================================================
{
  const j = load('effects_WX24_26.json');

  // ミズフウセン/ミズデッポウ/ビニールプール:
  // 【自】（アタックフェイズの間）このシグニが場を離れたとき、
  // 手札からレベル１＜遊具＞シグニをダウン状態で出してもよい。【出】は発動しない
  // 誤実装（場のシグニをDOWN）→ 手札からダウン状態でADD_TO_FIELDに修正
  for (const id of ['WX24-P2-077', 'WX24-P2-078', 'WX24-P4-070']) {
    const e = j[id][0];
    const blockStep = e.action.steps.find(s => s.type === 'BLOCK_ACTION');
    e.action = {
      type: 'SEQUENCE',
      steps: [
        {
          type: 'ADD_TO_FIELD', owner: 'self', asDown: true,
          source: handSource({ cardType: 'シグニ', level: 1, story: '遊具' }),
        },
        ...(blockStep ? [blockStep] : []),
      ],
    };
    e.mandatory = false;
    ok(id, '手札からLv1遊具をダウン状態でADD_TO_FIELD(任意) + 出能力封印');
  }

  save('effects_WX24_26.json', j);
}

// ============================================================
// effects_WXDi.json
// ============================================================
{
  const j = load('effects_WXDi.json');

  // WXDi-P03-071 羅石ラピスラズリ:
  // 【自】相手ターン中バニッシュされたとき、手札から赤＜宝石＞シグニを出してもよい。【出】は発動しない
  {
    const e = j['WXDi-P03-071'][0];
    e.condition = { type: 'IS_OPPONENT_TURN' };
    const addStep = e.action.steps.find(s => s.type === 'ADD_TO_FIELD');
    addStep.source = handSource({ cardType: 'シグニ', color: '赤', story: '宝石' });
    e.mandatory = false;
    ok('WXDi-P03-071', 'IS_OPPONENT_TURN + 手札から赤宝石ADD_TO_FIELD(任意)');
  }

  // WXDi-P10-034 羅植姫ユキ//メモリア:
  // デッキ4枚見て1枚裏向きでシグニゾーンに置き、次のメイン開始時に表向きにしてもよい
  // → 裏向き設置・遅延公開はエンジン未対応のため STUB 化（手動解決）
  {
    const e = j['WXDi-P10-034'][0];
    e.action = {
      type: 'SEQUENCE',
      steps: [
        e.action, // 既存のLOOK_AND_REORDER（デッキ4枚確認）は活かす
        { type: 'STUB', id: 'WXDI_P10_034_FACEDOWN_SIGNI_SET' },
      ],
    };
    ok('WXDi-P10-034', 'LOOK_AND_REORDER + 裏向き設置部分をSTUB化');
  }

  save('effects_WXDi.json', j);
}

// ============================================================
// effects_WXK.json
// ============================================================
{
  const j = load('effects_WXK.json');

  // WXK08-059 コードＶＬ轟京子:
  // 【自】相手ターン中バニッシュされたとき、手札からレベル１＜電機＞シグニを出してもよい
  {
    const e = j['WXK08-059'][0];
    e.condition = { type: 'IS_OPPONENT_TURN' };
    e.action = {
      type: 'ADD_TO_FIELD', owner: 'self',
      source: handSource({ cardType: 'シグニ', level: 1, story: '電機' }),
    };
    e.mandatory = false;
    ok('WXK08-059', 'IS_OPPONENT_TURN + 手札からLv1電機ADD_TO_FIELD(任意)');
  }

  // WXK11-066 幻水オタガメ E2:
  // 【自】効果によって手札から公開されたとき、手札から《幻水　オタガメ》１枚を場に出してもよい
  {
    const e = j['WXK11-066'][1];
    e.action = {
      type: 'ADD_TO_FIELD', owner: 'self',
      source: handSource({ cardType: 'シグニ', cardName: '幻水　オタガメ' }),
    };
    e.mandatory = false;
    ok('WXK11-066', '手札から《幻水　オタガメ》ADD_TO_FIELD(任意)');
  }

  save('effects_WXK.json', j);
}

// ============================================================
console.log('=== 修正完了 ===');
for (const f of fixed) console.log('  [OK] ' + f);
