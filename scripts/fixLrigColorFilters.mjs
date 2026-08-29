/**
 * センタールリグの色を参照するカードのフィルタを修正するスクリプト
 *
 * colorMatchesLrig: true  → 自分のセンタールリグと共通色を持つ
 * colorNotMatchesLrig: true → 自分のセンタールリグと共通色を持たない
 */

import fs from 'fs';

// --- 設定 ---
// カード番号 → {effectId, path[]} のマッピング
// path は JSON の中のフィルタへのパス（配列インデックスや 'steps','choices' など）
// 修正タイプ:
//   'matchesLrig'    → colorMatchesLrig: true を追加
//   'notMatchesLrig' → colorNotMatchesLrig: true を追加

const FIXES = [
  // WXDi-P07-052-E1: timing 配列の OR 拡張は harvest の純改善判定で温存されるため外科採用。
  { file: 'effects_WXDi', card: 'WXDi-P07-052', eid: 'WXDi-P07-052-E1', type: 'lifeCrashOrTrash',
    locate: e => e },
  // WD23-023-E-E1: カード全体に既存手修正があり harvest merge が fresh timing を温存するため、
  // 対象effectIdの timing/条件だけを durable に採用する。
  { file: 'effects_misc', card: 'WD23-023-E', eid: 'WD23-023-E-E1', type: 'lifeMovedAnyTrash',
    locate: e => e },
  // ── effects_WX.json ──────────────────────────────────────────────────────
  // WX04-026-E1: TRANSFER_TO_HAND > TRASH_CARD.filter
  { file: 'effects_WX', card: 'WX04-026', eid: 'WX04-026-E1', type: 'matchesLrig',
    locate: e => e.action?.source?.filter },

  // WX06-015-E1: TRANSFER_TO_HAND > TRASH_CARD.filter (スペル)
  { file: 'effects_WX', card: 'WX06-015', eid: 'WX06-015-E1', type: 'matchesLrig',
    locate: e => e.action?.source?.filter },

  // WX15-029-E1: SEQUENCE.steps[0] = TRANSFER_TO_HAND > TRASH_CARD.filter
  { file: 'effects_WX', card: 'WX15-029', eid: 'WX15-029-E1', type: 'matchesLrig',
    locate: e => e.action?.steps?.[0]?.source?.filter },

  // WX17-Re14-E1: CHOOSE.choices[1].action.steps[1].source.filter
  { file: 'effects_WX', card: 'WX17-Re14', eid: 'WX17-Re14-E1', type: 'matchesLrig',
    locate: e => e.action?.choices?.[1]?.action?.steps?.[1]?.source?.filter },

  // WX19-004-E1: SEQUENCE.steps[1].choices[1].action.source.filter (ADD_TO_FIELD)
  { file: 'effects_WX', card: 'WX19-004', eid: 'WX19-004-E1', type: 'matchesLrig',
    locate: e => e.action?.steps?.[1]?.choices?.[1]?.action?.source?.filter },

  // WX20-020-E1: SEQUENCE.steps[0].choices[3].action.source.filter (ADD_TO_FIELD)
  { file: 'effects_WX', card: 'WX20-020', eid: 'WX20-020-E1', type: 'matchesLrig',
    locate: e => e.action?.steps?.[0]?.choices?.[3]?.action?.source?.filter },

  // WX20-047-CB-E1: TRANSFER_TO_HAND > TRASH_CARD.filter
  { file: 'effects_WX', card: 'WX20-047-CB', eid: 'WX20-047-CB-E1', type: 'matchesLrig',
    locate: e => e.action?.source?.filter },

  // WX21-035-E1: SEQUENCE.steps[2].choices[0].action.target
  // "相手エナゾーンのセンタールリグと共通色を持たないカード1枚をトラッシュ"
  { file: 'effects_WX', card: 'WX21-035', eid: 'WX21-035-E1', type: 'notMatchesLrig',
    locate: e => e.action?.steps?.[2]?.choices?.[0]?.action?.target },

  // ── effects_WXK.json ─────────────────────────────────────────────────────
  // WXK02-029-E1: CHOOSE.choices[1].action.steps[0].source.filter
  { file: 'effects_WXK', card: 'WXK02-029', eid: 'WXK02-029-E1', type: 'matchesLrig',
    locate: e => e.action?.choices?.[1]?.action?.steps?.[0]?.source?.filter },

  // ── effects_misc.json ────────────────────────────────────────────────────
  // WDK01-010-E1: SEQUENCE.steps[0].source.filter (up to 3 signi)
  { file: 'effects_misc', card: 'WDK01-010', eid: 'WDK01-010-E1', type: 'matchesLrig',
    locate: e => e.action?.steps?.[0]?.source?.filter },

  // WDK06-C09-E2: TRANSFER_TO_HAND > TRASH_CARD.filter
  { file: 'effects_misc', card: 'WDK06-C09', eid: 'WDK06-C09-E2', type: 'matchesLrig',
    locate: e => e.action?.source?.filter },

  // WDK13-009-E1: SEARCH.filter
  { file: 'effects_misc', card: 'WDK13-009', eid: 'WDK13-009-E1', type: 'matchesLrig',
    locate: e => e.action },

  // SP27-016-E1: CHOOSE.choices[0].action.filter (SEARCH, empty filter)
  { file: 'effects_misc', card: 'SP27-016', eid: 'SP27-016-E1', type: 'matchesLrig',
    locate: e => e.action?.choices?.[0]?.action },
  // 同カード②: シグニ/センタールリグの共有1回アタック無効化。
  { file: 'effects_misc', card: 'SP27-016', eid: 'SP27-016-E1', type: 'negateNthAttack',
    locate: e => e.action?.choices?.[1]?.action },

  // PR-457-E2: SEARCH.filter
  { file: 'effects_misc', card: 'PR-457', eid: 'PR-457-E2', type: 'matchesLrig',
    locate: e => e.action },
  // タスク12(xxix)(2): PRESERVEカードへ parser の手札捨てコスト改善を外科反映。
  { file: 'effects_misc', card: 'PR-457', eid: 'PR-457-E1', type: 'discardAnyOne',
    locate: e => e },
  { file: 'effects_misc', card: 'WD23-024-E', eid: 'WD23-024-E-E1', type: 'discardLifeBurstOne',
    locate: e => e },
  { file: 'effects_WX', card: 'WX16-045', eid: 'WX16-045-E1', type: 'discardAcceSigniOne',
    locate: e => e },
  // タスク12(lv) 差し戻し: 「してもよい」は内側の ADD_TO_FIELD.optional だけに掛かる。
  // LOOK_AND_REORDER は強制なので、効果ヘッダの二重任意指定を除去する。
  { file: 'effects_WX', card: 'WX10-007', eid: 'WX10-007-E1', type: 'mandatoryOnPlay',
    locate: e => e },
  { file: 'effects_WX', card: 'WX10-021', eid: 'WX10-021-E1', type: 'mandatoryOnPlay',
    locate: e => e },
  // タスク12(lv) 続き: 【出】自体の2択は強制。任意なのはchoice②内の《白》《無》支払いだけ。
  { file: 'effects_WXDi', card: 'WXDi-P15-034', eid: 'WXDi-P15-034-E1', type: 'mandatoryOnPlay',
    locate: e => e },
  // 同居E3がMANUALのためカード単位PRESERVEされる。差分ドローだけをeffectIdで外科反映。
  { file: 'effects_WX24_26', card: 'WX24-P4-014', eid: 'WX24-P4-014-E2', type: 'untilHandFour',
    locate: e => e },

  // PR-K064-E1: CHOOSE.choices[0].action.filter (SEARCH)
  { file: 'effects_misc', card: 'PR-K064', eid: 'PR-K064-E1', type: 'matchesLrig',
    locate: e => e.action?.choices?.[0]?.action },

  // PLAN §6.3 続き20: 既存MANUAL STUBへ engine 解決用の構造化パラメータを追加。
  { file: 'effects_WX24_26', card: 'WX25-CP1-040', eid: 'WX25-CP1-040-E1b', type: 'variableEnergyTrashLevelBounce',
    locate: e => e.action },

  // PLAN §6.3「続き20の近似・STUBテール」:
  // build:effects 後も維持する個別 MANUAL 修正。
  { file: 'effects_WXK', card: 'WXK04-015', eid: 'WXK04-015-E1b', type: 'trashKeyCost',
    locate: e => e },
  { file: 'effects_WX', card: 'WX14-028', eid: 'WX14-028-E1', type: 'searchColorExcludeGreen',
    locate: e => e },
  { file: 'effects_WX', card: 'WX14-028', eid: 'WX14-028-BURST', type: 'searchDistinctColors',
    locate: e => e },
  // タスク12(cix): MANUAL カードは harvest merge がカード単位で温存するため、manualEffects.ts に足した
  //   DOWN(LRIG) の `filter.isUp`（＝センター固定ではなくアシストも含む＝payLrigDownCost 経路へ乗せる判別子）を
  //   effectId アンカーで外科反映する。
  { file: 'effects_WX24_26', card: 'WX25-P2-112', eid: 'WX25-P2-112-E1', type: 'lrigDownIsUp',
    locate: e => e.action?.then?.steps?.[0]?.target },

  // タスク12(xciii): WX11-021 は MANUAL 温存カードなので harvest merge が【チェイン】の
  //   COST_REDUCTION ステップを取り込めない。effectId アンカーで先頭ステップとして外科反映する
  //   （原文＝【チェイン】《緑》《白》）。
  { file: 'effects_WX', card: 'WX11-021', eid: 'WX11-021-E1', type: 'chainArtsCostReduction',
    params: { reduction: [{ color: '緑', count: 1 }, { color: '白', count: 1 }] },
    locate: e => e },

];

const DIR = 'public/data';
const sourceText = JSON.parse(fs.readFileSync('docs/_effect_srctext.json', 'utf8'));
const REAL_COST_SYNTAX = /(?:支払|捨て|トラッシュに置|手札に加え|場から|下に置|ダウンする|取り除|ゲームから除外|デッキ(?:の一番下)?に置|クラッシュ|【ビート】にする|エナゾーンに置)/;

function applyFix(obj, type, params) {
  if (type === 'chainArtsCostReduction') {
    // 効果の action 先頭へ「次に使うアーツのコストを軽減」を差し込む（既に入っていれば何もしない＝冪等）。
    const step = { type: 'COST_REDUCTION', targetCardType: 'アーツ', reduction: params.reduction, duration: 'UNTIL_END_OF_TURN' };
    const already = JSON.stringify(obj.action ?? {}).includes('"targetCardType":"アーツ"');
    if (already) return false;
    obj.action = obj.action?.type === 'SEQUENCE'
      ? { ...obj.action, steps: [step, ...obj.action.steps] }
      : { type: 'SEQUENCE', steps: [step, obj.action] };
    return true;
  }
  if (type === 'lifeCrashOrTrash') {
    obj.timing = ['ON_LIFE_CRASHED', 'ON_LIFE_CLOTH_MOVED'];
    delete obj.triggerScope; // self は既定値。fresh の冗長出力を除き curated の安定差分を保つ。
    obj.triggerCondition = { ...(obj.triggerCondition ?? {}), lifeMovedTo: ['trash'] };
    return true;
  }
  if (type === 'lifeMovedAnyTrash') {
    obj.timing = ['ON_LIFE_CLOTH_MOVED'];
    obj.triggerCondition = { ...(obj.triggerCondition ?? {}), lifeMovedOwner: 'any', lifeMovedTo: ['trash'] };
    return true;
  }
  if (!obj) return false;
  if (type === 'discardAnyOne') {
    obj.cost = { discard: 1 };
    delete obj.costUnparsed;
    return true;
  }
  if (type === 'discardLifeBurstOne') {
    obj.cost = { discard: 1, discardFilter: { cardType: 'カード', hasLifeBurst: true } };
    delete obj.costUnparsed;
    return true;
  }
  if (type === 'discardAcceSigniOne') {
    obj.cost = { discard: 1, discardFilter: { cardType: 'シグニ', hasIcon: 'アクセ' } };
    delete obj.costUnparsed;
    return true;
  }
  if (type === 'lrigDownIsUp') {
    obj.filter = { ...(obj.filter ?? {}), isUp: true };
    return true;
  }
  if (type === 'mandatoryOnPlay') {
    obj.mandatory = true;
    return true;
  }
  if (type === 'untilHandFour') {
    obj.action = { type: 'DRAW', owner: 'self', count: 0, untilHandCount: 4 };
    return true;
  }
  if (type === 'trashKeyCost') {
    obj.cost = { ...(obj.cost ?? {}), trash_key: true };
    obj.parseStatus = 'MANUAL';
    return true;
  }
  if (type === 'searchColorExcludeGreen') {
    obj.action.filter = { ...(obj.action.filter ?? {}), colorExclude: '緑' };
    obj.parseStatus = 'MANUAL';
    return true;
  }
  if (type === 'searchDistinctColors') {
    obj.action.selectionConstraint = { sharedColor: 'none' };
    obj.parseStatus = 'MANUAL';
    return true;
  }
  if (type === 'negateNthAttack') {
    obj.negateNthAttack = { count: 1, signi: true, lrig: true };
    return true;
  }
  if (type === 'powerPlusBanishedPower') {
    obj.powerPlusBanishedPower = {
      target: { type: 'SIGNI', owner: 'self', count: 1, filter: { color: '白' } },
      duration: 'UNTIL_OPP_TURN_END',
    };
    return true;
  }
  if (type === 'variableEnergyTrashLevelBounce') {
    obj.variableEnergyTrashLevelBounce = { story: 'ブルアカ', maxCount: 3 };
    return true;
  }
  // SEARCH / ADD_TO_FIELD actions: filter is action-level property
  if (obj.type === 'SEARCH' || obj.type === 'ADD_TO_FIELD') {
    if (!obj.filter) obj.filter = {};
    if (type === 'matchesLrig') obj.filter.colorMatchesLrig = true;
    else obj.filter.colorNotMatchesLrig = true;
    return true;
  }
  // ENERGY_CARD / SIGNI target (TRASH target for WX21-035)
  if (obj.type === 'ENERGY_CARD' || obj.type === 'SIGNI') {
    if (!obj.filter) obj.filter = {};
    if (type === 'matchesLrig') obj.filter.colorMatchesLrig = true;
    else obj.filter.colorNotMatchesLrig = true;
    return true;
  }
  // Otherwise obj IS the filter
  if (type === 'matchesLrig') obj.colorMatchesLrig = true;
  else obj.colorNotMatchesLrig = true;
  return true;
}

let totalFixed = 0;

for (const fix of FIXES) {
  const path = `${DIR}/${fix.file}.json`;
  const db = JSON.parse(fs.readFileSync(path, 'utf-8'));
  const effects = db[fix.card];
  if (!effects) { console.warn(`[SKIP] ${fix.card} not in ${fix.file}`); continue; }
  const effect = effects.find(e => e.effectId === fix.eid);
  if (!effect) { console.warn(`[SKIP] ${fix.eid} not found in ${fix.card}`); continue; }
  const target = fix.locate(effect);
  if (!target) { console.warn(`[SKIP] locate() returned null for ${fix.eid}`); continue; }
  const ok = applyFix(target, fix.type, fix.params);
  if (ok) {
    console.log(`[FIX] ${fix.eid} → ${fix.type}`);
    totalFixed++;
  }
  fs.writeFileSync(path, JSON.stringify(db), 'utf-8');
}

// 旧 curated/PRESERVE JSON に残った costUnparsed 偽陽性を再較正する。
// 原文ブロック先頭のコロン前に実コスト動詞が無い（《ターン1回》等だけ）場合に限り印を外す。
for (const file of ['effects_WX', 'effects_WXDi', 'effects_WX24_26', 'effects_WXK', 'effects_misc']) {
  const path = `${DIR}/${file}.json`;
  const db = JSON.parse(fs.readFileSync(path, 'utf-8'));
  for (const effects of Object.values(db)) {
    for (const effect of effects) {
      if (!effect.costUnparsed) continue;
      const header = sourceText[effect.effectId]?.match(/^【(?:自|出|起)】([^：:]*?)[：:]/)?.[1];
      if (header !== undefined && !REAL_COST_SYNTAX.test(header)) delete effect.costUnparsed;
    }
  }
  fs.writeFileSync(path, JSON.stringify(db), 'utf-8');
}

console.log(`\n合計 ${totalFixed} 件修正完了`);
