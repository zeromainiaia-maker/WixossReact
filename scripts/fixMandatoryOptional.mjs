/**
 * fixMandatoryOptional.mjs
 * checkAllEffects.mjs の MANDATORY_SUSPICIOUS（CSV「してもよい」なのにJSONが強制実行）を修正する。
 *
 * 修正パターン:
 *  A. 任意コストステップ（DOWN/TRASH等）に target.upToCount=true（選択スキップ可能化）
 *     BANISH/BOUNCE は optional=true
 *  B. デッキトップ「場に出してもよい」の ADD_TO_FIELD を CHOOSE[出す|出さない] でラップ
 *     （WX01-057 の既存実装と同じ構造）
 *  C. トリガータイミング誤り（ON_PLAY → ON_TRASH / ON_LEAVE_FIELD）の修正
 *  D. 実装不能トリガー（ライフクロスクラッシュ時等）は STUB 化
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'));
const save = (f, j) => fs.writeFileSync(path.join(root, 'public/data', f), JSON.stringify(j), 'utf8');

const warnings = [];
const fixed = [];
const ok = (id, msg) => fixed.push(`${id}: ${msg}`);
const warn = (id, msg) => warnings.push(`${id}: ${msg}`);

const noop = () => ({ type: 'SEQUENCE', steps: [] });
const chooseWrap = (action, yesLabel, noLabel = '何もしない') => ({
  type: 'CHOOSE',
  choose_count: 1,
  choices: [
    { choiceId: 'yes', label: yesLabel, action },
    { choiceId: 'no', label: noLabel, action: noop() },
  ],
});

// SEQUENCE/CHOOSE/CONDITIONAL を再帰探索して type の最初のステップを返す
function findSteps(action, type, out = []) {
  if (!action) return out;
  if (action.type === type) out.push(action);
  if (action.steps) action.steps.forEach(s => findSteps(s, type, out));
  if (action.then) findSteps(action.then, type, out);
  if (action.else) findSteps(action.else, type, out);
  if (action.choices) action.choices.forEach(c => findSteps(c.action, type, out));
  return out;
}

// 任意コスト: target.upToCount = true を付ける
// 対象は AUTO/CONTINUOUS 効果のみ（LIFE_BURST/ACTIVATED の強制対象選択は変更しない）
// ownerFilter を指定すると target.owner が一致するステップのみ対象
function setUpToCount(j, cardId, type, expectCount = 1, ownerFilter = null) {
  const efList = j[cardId];
  if (!efList) return warn(cardId, 'カードなし');
  const steps = efList
    .filter(ef => ef.effectType === 'AUTO' || ef.effectType === 'CONTINUOUS')
    .flatMap(ef => findSteps(ef.action, type))
    .filter(st => !ownerFilter || st.target?.owner === ownerFilter);
  if (steps.length === 0) return warn(cardId, `${type} ステップなし (owner=${ownerFilter})`);
  let n = 0;
  for (const st of steps) {
    if (st.target && st.target.upToCount !== true) { st.target.upToCount = true; n++; }
  }
  if (n === 0) return warn(cardId, `${type} 全て upToCount 済み/target なし`);
  if (n !== expectCount) warn(cardId, `${type} upToCount を${n}箇所に設定（期待${expectCount}）`);
  ok(cardId, `${type}.target.upToCount=true ×${n}`);
}

// BANISH/BOUNCE: optional = true
function setOptional(j, cardId, type) {
  const efList = j[cardId];
  if (!efList) return warn(cardId, 'カードなし');
  const steps = efList.flatMap(ef => findSteps(ef.action, type));
  if (steps.length === 0) return warn(cardId, `${type} ステップなし`);
  for (const st of steps) st.optional = true;
  ok(cardId, `${type}.optional=true ×${steps.length}`);
}

// SEQUENCE 内の ADD_TO_FIELD（sourceなし=デッキトップ）を CHOOSE ラップ。
// condition が渡されたら CONDITIONAL(condition)[CHOOSE] に置き換える
function wrapDeckTopAddToField(j, cardId, label, condition = null) {
  const efList = j[cardId];
  if (!efList) return warn(cardId, 'カードなし');
  let n = 0;
  const wrapIn = (container, key) => {
    const a = container[key];
    if (!a) return;
    if (a.type === 'ADD_TO_FIELD' && !a.source) {
      const choose = chooseWrap(a, label, '場に出さない');
      container[key] = condition
        ? { type: 'CONDITIONAL', condition, then: choose }
        : choose;
      n++;
      return;
    }
    if (a.steps) a.steps.forEach((_, i) => wrapIn(a.steps, i));
    if (a.then) wrapIn(a, 'then');
    if (a.else) wrapIn(a, 'else');
    if (a.choices) a.choices.forEach(c => wrapIn(c, 'action'));
  };
  for (const ef of efList) wrapIn(ef, 'action');
  if (n === 0) return warn(cardId, 'デッキトップ ADD_TO_FIELD なし');
  ok(cardId, `ADD_TO_FIELD を CHOOSE ラップ ×${n}`);
}

// トラッシュ/エナsource の ADD_TO_FIELD: source.upToCount = true
function setAddToFieldSrcUpTo(j, cardId) {
  const efList = j[cardId];
  if (!efList) return warn(cardId, 'カードなし');
  const steps = efList
    .filter(ef => ef.effectType === 'AUTO' || ef.effectType === 'CONTINUOUS')
    .flatMap(ef => findSteps(ef.action, 'ADD_TO_FIELD')).filter(s => s.source);
  if (steps.length === 0) return warn(cardId, 'source付き ADD_TO_FIELD なし');
  for (const st of steps) st.source.upToCount = true;
  ok(cardId, `ADD_TO_FIELD.source.upToCount=true ×${steps.length}`);
}

// タイミング変更
function setTiming(j, cardId, effectIdx, timing) {
  const ef = j[cardId]?.[effectIdx];
  if (!ef) return warn(cardId, `effect[${effectIdx}] なし`);
  const before = JSON.stringify(ef.timing);
  ef.timing = timing;
  ok(cardId, `timing ${before} → ${JSON.stringify(timing)}`);
}

// source filter に cardName を追加（自己蘇生カード用）
function setSelfNameFilter(j, cardId, name) {
  const efList = j[cardId];
  if (!efList) return warn(cardId, 'カードなし');
  const steps = efList.flatMap(ef => findSteps(ef.action, 'ADD_TO_FIELD')).filter(s => s.source);
  if (steps.length === 0) return warn(cardId, 'source付き ADD_TO_FIELD なし');
  for (const st of steps) st.source.filter = { ...(st.source.filter ?? {}), cardName: name };
  ok(cardId, `source.filter.cardName="${name}"`);
}

// effect[i].action を STUB に置換（実装不能トリガー）
function stubEffect(j, cardId, effectIdx, stubId) {
  const ef = j[cardId]?.[effectIdx];
  if (!ef) return warn(cardId, `effect[${effectIdx}] なし`);
  ef.action = { type: 'STUB', id: stubId };
  ef.parseStatus = 'STUB';
  ok(cardId, `effect[${effectIdx}] を STUB(${stubId}) 化`);
}

// effect[i].action 全体を CHOOSE[発動する|しない] でラップ
function wrapEffectInChoose(j, cardId, effectIdx, label) {
  const ef = j[cardId]?.[effectIdx];
  if (!ef) return warn(cardId, `effect[${effectIdx}] なし`);
  if (ef.action?.type === 'CHOOSE' && ef.action.choices?.some(c => c.action?.type === 'SEQUENCE' && c.action.steps?.length === 0)) {
    return warn(cardId, `effect[${effectIdx}] は既に CHOOSE ラップ済み`);
  }
  ef.action = chooseWrap(ef.action, label, '発動しない');
  ok(cardId, `effect[${effectIdx}] を CHOOSE ラップ`);
}

// ATTACH_CHARM を CHOOSE ラップ
function wrapAttachCharm(j, cardId) {
  const efList = j[cardId];
  if (!efList) return warn(cardId, 'カードなし');
  let n = 0;
  const wrapIn = (container, key) => {
    const a = container[key];
    if (!a) return;
    if (a.type === 'ATTACH_CHARM') {
      container[key] = chooseWrap(a, '【チャーム】にする', 'しない');
      n++;
      return;
    }
    if (a.steps) a.steps.forEach((_, i) => wrapIn(a.steps, i));
    if (a.then) wrapIn(a, 'then');
    if (a.else) wrapIn(a, 'else');
    if (a.choices) a.choices.forEach(c => wrapIn(c, 'action'));
  };
  for (const ef of efList) wrapIn(ef, 'action');
  if (n === 0) return warn(cardId, 'ATTACH_CHARM なし');
  ok(cardId, `ATTACH_CHARM を CHOOSE ラップ ×${n}`);
}

// ============================================================
// effects_WX.json
// ============================================================
{
  const j = load('effects_WX.json');

  // ── Pattern A: 任意コストステップ ──
  setUpToCount(j, 'WX14-CB02', 'DOWN');      // アーム1体ダウンしてもよい→手札に戻す
  setUpToCount(j, 'WX20-067', 'DOWN');       // このシグニをダウンしてもよい→手札に戻す
  // WX17-028 ソラフレア: トラッシュから＜宇宙＞シグニ4枚をデッキに戻してもよい→ダブクラ
  // （元データは count:1・filterなし。「それぞれレベルの異なる」は近似不能のため枚数とフィルタのみ修正）
  {
    const steps = (j['WX17-028'] ?? []).flatMap(ef => findSteps(ef.action, 'TRANSFER_TO_DECK')).filter(s => s.source);
    if (steps.length === 1) {
      steps[0].source = { ...steps[0].source, count: 4, upToCount: true, filter: { cardType: 'シグニ', story: '宇宙' } };
      ok('WX17-028', 'TRANSFER_TO_DECK.source を count:4/upToCount/宇宙フィルタに修正');
    } else {
      warn('WX17-028', `TRANSFER_TO_DECK 構造想定外 (${steps.length}件)`);
    }
  }

  // ── Pattern B: デッキトップを場に出してもよい ──
  wrapDeckTopAddToField(j, 'WX01-036', 'デッキトップを場に出す', {
    type: 'AND',
    conditions: [
      { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', level: { max: 2 } } },
      { type: 'FIELD_COUNT', owner: 'self', operator: 'eq', value: 1 },
    ],
  });
  wrapDeckTopAddToField(j, 'WX01-059', 'デッキトップを場に出す', {
    type: 'AND',
    conditions: [
      { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', level: 1 } },
      { type: 'FIELD_COUNT', owner: 'self', operator: 'eq', value: 1 },
    ],
  });
  wrapDeckTopAddToField(j, 'WX10-007', 'デッキトップを場に出す',
    { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', story: '宇宙', level: { max: 3 } } });
  wrapDeckTopAddToField(j, 'WX10-021', 'デッキトップを場に出す',
    { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', story: '凶蟲', level: { max: 3 } } });
  wrapDeckTopAddToField(j, 'WX16-038', 'デッキトップを場に出す',
    { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', story: '武勇' } });

  // ── Pattern C: 自己蘇生（デッキ→トラッシュ時）。ON_PLAY 誤りを ON_TRASH に修正 ──
  setTiming(j, 'WX02-073', 0, ['ON_TRASH']);
  setSelfNameFilter(j, 'WX02-073', 'コードアンチ　テキサハンマ');
  setAddToFieldSrcUpTo(j, 'WX02-073');
  setTiming(j, 'WX10-092', 0, ['ON_TRASH']);
  setSelfNameFilter(j, 'WX10-092', 'コードアンチ　ハンマフェイク');
  setAddToFieldSrcUpTo(j, 'WX10-092');
  setTiming(j, 'WX15-036', 0, ['ON_TRASH']); // 手札からトラッシュ時（近似）
  setSelfNameFilter(j, 'WX15-036', '大幻蟲　§オタガメ§');
  setAddToFieldSrcUpTo(j, 'WX15-036');

  // ── Pattern C2: 「場を離れたとき」の ON_PLAY 誤りを ON_LEAVE_FIELD に修正 ──
  setTiming(j, 'WX08-078', 0, ['ON_LEAVE_FIELD']);
  setTiming(j, 'WX08-080', 0, ['ON_LEAVE_FIELD']);
  setTiming(j, 'WX11-035', 0, ['ON_LEAVE_FIELD']);
  setTiming(j, 'WX14-009', 1, ['ON_LEAVE_FIELD']); // E2:フレイスロが場を離れたとき
  setTiming(j, 'WX17-055', 0, ['ON_LEAVE_FIELD']);

  // ── ATTACH_CHARM してもよい ──
  wrapAttachCharm(j, 'WX04-052'); // 【出】デッキトップをチャームにしてもよい
  wrapAttachCharm(j, 'WX04-102');
  wrapAttachCharm(j, 'WX08-046');
  wrapAttachCharm(j, 'WX08-078');
  wrapAttachCharm(j, 'WX08-080');
  wrapAttachCharm(j, 'WX20-082');

  // ── Pattern D: 実装不能トリガー（ライフクロスがクラッシュされたとき）──
  stubEffect(j, 'WX11-026', 0, 'TRIGGER_OWN_LIFE_CRASHED_REVIVE'); // ヘスチア: ON_PLAYで自分ライフクラッシュしていた誤実装を除去
  setTiming(j, 'WX21-Re06', 0, ['ON_TURN_END']); // 既存タイミング維持
  setAddToFieldSrcUpTo(j, 'WX21-Re06'); // 出してもよい → スキップ可能化

  // ── その他 ──
  // WX16-070: レベルを＋1するか＋2してもよい
  {
    const ef = j['WX16-070']?.[0];
    const lm = ef ? findSteps(ef.action, 'LEVEL_MODIFY') : [];
    if (lm.length === 1 && ef.action.type === 'LEVEL_MODIFY') {
      const base = ef.action;
      ef.action = {
        type: 'CHOOSE',
        choose_count: 1,
        choices: [
          { choiceId: 'p1', label: 'レベル＋１', action: { ...base, delta: 1 } },
          { choiceId: 'p2', label: 'レベル＋２', action: { ...base, delta: 2 } },
          { choiceId: 'no', label: 'しない', action: noop() },
        ],
      };
      ok('WX16-070', 'LEVEL_MODIFY を CHOOSE(+1/+2/しない) 化');
    } else {
      warn('WX16-070', `LEVEL_MODIFY 構造想定外: ${JSON.stringify(ef?.action)?.substring(0, 200)}`);
    }
  }
  // WX21-065: 手札から2枚まで公開してもよい → REVEAL を CHOOSE ラップ
  {
    const ef = j['WX21-065']?.[0];
    if (ef && ef.action?.type === 'REVEAL') {
      ef.action = chooseWrap(ef.action, '手札から＜龍獣＞シグニを公開する', '公開しない');
      ok('WX21-065', 'REVEAL を CHOOSE ラップ');
    } else {
      warn('WX21-065', `REVEAL 構造想定外: ${JSON.stringify(ef?.action)?.substring(0, 200)}`);
    }
  }
  // WX14-026 スイカリン: 身代わりライフクラッシュ（置換効果）は未実装 → STUB 化
  stubEffect(j, 'WX14-026', 0, 'BANISH_SUBSTITUTE_LIFE_CRASH');
  // WX20-034-CB / WX20-039-CB: 手札から出してもよい（手札→場は ADD_TO_FIELD 未対応のため CHOOSE ゲートのみ）
  wrapEffectInChoose(j, 'WX20-034-CB', 0, '手札から＜遊具＞シグニを場に出す');
  wrapEffectInChoose(j, 'WX20-039-CB', 0, '手札から＜遊具＞シグニを場に出す');

  save('effects_WX.json', j);
}

// ============================================================
// effects_misc.json
// ============================================================
{
  const j = load('effects_misc.json');
  wrapDeckTopAddToField(j, 'WDK16-13', 'デッキトップを場に出す'); // 2箇所とも CHOOSE 化（条件はユーザー判断）
  save('effects_misc.json', j);
}

// ============================================================
// effects_WXK.json
// ============================================================
{
  const j = load('effects_WXK.json');
  wrapDeckTopAddToField(j, 'WXK08-033', 'デッキトップを場に出す');
  save('effects_WXK.json', j);
}

// ============================================================
// effects_WX24_26.json
// ============================================================
{
  const j = load('effects_WX24_26.json');

  setUpToCount(j, 'WX24-P1-069', 'DOWN');
  setUpToCount(j, 'WX24-P3-077', 'DOWN');
  setUpToCount(j, 'WX25-P1-055', 'DOWN');
  setUpToCount(j, 'WX25-P2-085', 'DOWN');
  setUpToCount(j, 'WX25-P3-074', 'DOWN');
  setUpToCount(j, 'WX25-P3-078', 'DOWN');
  setUpToCount(j, 'WX25-P3-089', 'DOWN');
  setUpToCount(j, 'WX25-CP1-062', 'DOWN');
  setUpToCount(j, 'WX25-CP1-082', 'DOWN');

  // WX25-P2-112: ルリグダウンは選択UIがないため効果全体を CHOOSE ゲート
  wrapEffectInChoose(j, 'WX25-P2-112', 0, 'アップ状態のルリグをダウンして発動する');

  // 自己蘇生 ON_PLAY 誤り → ON_TRASH
  setTiming(j, 'WX25-P1-099', 0, ['ON_TRASH']);
  setSelfNameFilter(j, 'WX25-P1-099', 'コードオールド　テキサハンマ');
  setAddToFieldSrcUpTo(j, 'WX25-P1-099');
  setTiming(j, 'WX25-P1-104', 0, ['ON_TRASH']);
  setSelfNameFilter(j, 'WX25-P1-104', 'コードオールド　ハンマフェイク');
  setAddToFieldSrcUpTo(j, 'WX25-P1-104');

  // 「場を離れたとき」ON_PLAY 誤り → ON_LEAVE_FIELD
  setTiming(j, 'WX24-P2-077', 0, ['ON_LEAVE_FIELD']);
  setTiming(j, 'WX24-P2-078', 0, ['ON_LEAVE_FIELD']);
  setTiming(j, 'WX24-P4-070', 0, ['ON_LEAVE_FIELD']);

  save('effects_WX24_26.json', j);
}

// ============================================================
// effects_WXDi.json
// ============================================================
{
  const j = load('effects_WXDi.json');

  setUpToCount(j, 'WXDi-P04-059', 'DOWN');
  setUpToCount(j, 'WXDi-P05-032', 'DOWN');
  setUpToCount(j, 'WXDi-P06-049', 'DOWN');
  setUpToCount(j, 'WXDi-P09-054', 'DOWN');
  setUpToCount(j, 'WXDi-P13-074', 'DOWN');
  setUpToCount(j, 'WXDi-P15-084', 'DOWN');
  setUpToCount(j, 'WXDi-P15-092', 'DOWN');
  setUpToCount(j, 'WXDi-P16-078', 'DOWN');
  setUpToCount(j, 'WXDi-CP01-040', 'DOWN');
  setUpToCount(j, 'WXDi-CP02-081', 'DOWN');
  // WXDi-CP02-075: 手札捨ててもよい + ダウンしてもよい の2段（相手に捨てさせる TRASH は強制のまま）
  setUpToCount(j, 'WXDi-CP02-075', 'TRASH', 1, 'self');
  setUpToCount(j, 'WXDi-CP02-075', 'DOWN');
  // WXDi-P06-011: 相手エナをトラッシュに置いてもよい
  setUpToCount(j, 'WXDi-P06-011', 'TRASH', 1, 'opponent');

  // WXDi-P10-045 そふぃ: 公開してもよい → 効果全体を CHOOSE ゲート
  wrapEffectInChoose(j, 'WXDi-P10-045', 0, '手札から＜プリパラ＞シグニを公開する');

  // WXDi-P11-078: ミル後、特定カードなら出してもよい → source 選択をスキップ可能化
  setAddToFieldSrcUpTo(j, 'WXDi-P11-078');

  // WXDi-P02-037 ダッキ:
  //  E1 はライフクラッシュ時トリガー未対応（ON_PLAY 誤発火）→ STUB 化
  //  E3 【出】ライフクロスをクラッシュしてもよい → CHOOSE ゲート
  stubEffect(j, 'WXDi-P02-037', 0, 'TRIGGER_OWN_LIFE_CRASHED_DRAW');
  wrapEffectInChoose(j, 'WXDi-P02-037', 2, 'ライフクロス１枚をクラッシュする');

  save('effects_WXDi.json', j);
}

// ============================================================
console.log('=== 修正完了 ===');
for (const f of fixed) console.log('  [OK] ' + f);
console.log(`\n=== 警告 (${warnings.length}件) ===`);
for (const w of warnings) console.log('  [WARN] ' + w);
