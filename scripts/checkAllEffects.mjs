/**
 * checkAllEffects.mjs
 * 全 effects JSON ファイルを対象に実装ミスを多角的に検出する
 *
 * 検出項目:
 *  1. effectType不一致 (【常】→CONTINUOUS, 【起】→ACTIVATED, 【自】→AUTO)
 *  2. LIFE_BURST整合性 (CSVのLifeBurst列 vs JSON の LIFE_BURST エフェクト)
 *  3. DRAW枚数不一致 (CSV「カードをN枚引く」vs JSON DRAW.count)
 *  4. MILL枚数不一致 (CSV「デッキ上からN枚トラッシュ」vs JSON MILL.count)
 *  5. パワー値不一致 (CSV「±N000」vs JSON POWER_MODIFY.delta)
 *  6. 強制/任意不一致 (CSV「してもよい」の有無 vs JSON mandatory)
 *  7. BOUNCE先不一致 (CSV「手札に戻す」vs JSON BOUNCE.destination)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// ─── CSV読み込み ──────────────────────────────────────────────
function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"' && inQ) inQ = false;
    else if (c === '"') inQ = true;
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

function loadCSV(filename) {
  const lines = fs.readFileSync(path.join(root, 'public/data', filename), 'utf8').split('\n');
  const h = splitCSVLine(lines[0]);
  const get = (row, col) => row[h.indexOf(col)] || '';
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const row = splitCSVLine(lines[i]);
    const id = get(row, 'CardNum');
    if (!id) continue;
    map[id] = {
      name:      get(row, 'CardName'),
      eff:       get(row, 'EffectText'),
      burst:     get(row, 'BurstText'),
      lifeBurst: get(row, 'LifeBurst'), // '1' or '0' or ''
    };
  }
  return map;
}

// ─── effects JSON と CSV のファイルマッピング ──────────────────
const FILES = [
  {
    json: 'effects_misc.json',
    csvs: ['CardData_Sheet5.csv', 'CardData_Sheet6.csv', 'CardData_Variants.csv'],
  },
  {
    json: 'effects_WX.json',
    csvs: ['CardData_Sheet1.csv', 'CardData_Sheet2.csv'],
  },
  {
    json: 'effects_WX24_26.json',
    csvs: ['CardData_Sheet9.csv', 'CardData_Sheet10.csv'],
  },
  {
    json: 'effects_WXDi.json',
    csvs: ['CardData_Sheet7.csv', 'CardData_Sheet8.csv'],
  },
  {
    json: 'effects_WXK.json',
    csvs: ['CardData_Sheet4.csv'],
  },
];

// ─── ユーティリティ ────────────────────────────────────────────
// 漢数字→数値
function kanjiToNum(s) {
  const map = { '０':0,'１':1,'２':2,'３':3,'４':4,'５':5,'６':6,'７':7,'８':8,'９':9 };
  return s.replace(/[０-９]/g, c => map[c]);
}

// アクションを再帰的にフラット化（CHOOSE内部も含む）
function flatActions(a) {
  if (!a) return [];
  if (a.type === 'SEQUENCE') return (a.steps || []).flatMap(flatActions);
  if (a.type === 'CONDITIONAL') return [...flatActions(a.then), ...flatActions(a.else)];
  if (a.type === 'CHOOSE') return (a.choices || []).flatMap(c => flatActions(c.action));
  if (a.type === 'CHOOSE_N_FROM_LIST') return (a.choices || []).flatMap(c => flatActions(c.action));
  return [a];
}

// JSON全体からアクションタイプ一覧を取得（STUBは除く）
function getAllActionTypes(efList) {
  return efList.flatMap(ef => flatActions(ef.action).map(a => a.type));
}

// 全エフェクトのmandatoryをリスト化
function getMandatoryList(efList) {
  return efList.flatMap(ef => {
    const acts = flatActions(ef.action);
    return acts.map(a => ({ mandatory: ef.mandatory, type: a.type }));
  });
}

// ─── 検出ロジック ──────────────────────────────────────────────
const issues = [];

function report(file, cardId, name, checkType, detail, csvSnippet) {
  issues.push({ file, cardId, name, checkType, detail, csvSnippet: csvSnippet?.substring(0, 100) });
}

for (const { json, csvs } of FILES) {
  const csv = {};
  for (const f of csvs) Object.assign(csv, loadCSV(f));
  const effects = JSON.parse(fs.readFileSync(path.join(root, 'public/data', json), 'utf8'));

  for (const [cardId, efList] of Object.entries(effects)) {
    const c = csv[cardId];
    if (!c) continue;
    const eff = c.eff;
    const burst = c.burst;
    const fullText = (eff + ' ' + burst).trim();
    if (!fullText) continue;

    const name = c.name;
    const jsonTypes = efList.map(ef => ef.effectType);
    const allActs = efList.flatMap(ef => flatActions(ef.action));
    const hasStub = allActs.some(a => a.type === 'STUB');
    const hasUnknown = allActs.some(a => a.type === 'UNKNOWN');

    // ── 1. effectType不一致 ──────────────────────────────────
    // 「効果付与」パターン（「『【自】〜』を得る」「『【常】〜』を得る」）は除外
    // 括弧内の説明文も除外
    const effNoGrant = eff
      .replace(/「【[常自起]】[^」]*」/g, '')   // 「【常】〜」 形式の付与効果
      .replace(/（[^）]*）/g, '');              // （）内の説明文
    const burstNoGrant = burst
      .replace(/「【[常自起]】[^」]*」/g, '')
      .replace(/（[^）]*）/g, '');
    const effStripped = effNoGrant + ' ' + burstNoGrant;

    // 【常】がCSVにあるのにJSONにCONTINUOUSがない
    // ただし「ガード」「マルチエナ」のみの【常】は除外（通常LIFE_BURSTとして実装）
    if (/【常】/.test(effStripped) && !jsonTypes.includes('CONTINUOUS') && !hasStub) {
      const isGuardOrMultiEnaOnly = /【常】：【(マルチエナ|ガード)】/.test(eff) && (eff.match(/【常】/g)||[]).length === 1;
      if (!isGuardOrMultiEnaOnly) {
        report(json, cardId, name, 'EFFECT_TYPE_MISSING_CONTINUOUS',
          `CSV【常】あり、JSONにCONTINUOUSなし (types:${jsonTypes.join(',')})`, eff);
      }
    }
    // 【起】がCSVにあるのにJSONにACTIVATEDがない
    if (/【起】/.test(effStripped) && !jsonTypes.includes('ACTIVATED') && !hasStub) {
      report(json, cardId, name, 'EFFECT_TYPE_MISSING_ACTIVATED',
        `CSV【起】あり、JSONにACTIVATEDなし (types:${jsonTypes.join(',')})`, eff);
    }
    // 【自】がCSVにあるのにJSONにAUTOがない
    if (/【自】/.test(effStripped) && !jsonTypes.includes('AUTO') && !hasStub && !hasUnknown) {
      report(json, cardId, name, 'EFFECT_TYPE_MISSING_AUTO',
        `CSV【自】あり、JSONにAUTOなし (types:${jsonTypes.join(',')})`, eff);
    }

    // ── 2. LIFE_BURST整合性 ──────────────────────────────────
    const csvHasBurst = c.lifeBurst === '1';
    const jsonHasBurst = efList.some(ef => ef.effectType === 'LIFE_BURST');
    if (csvHasBurst && !jsonHasBurst) {
      report(json, cardId, name, 'LIFE_BURST_MISSING',
        `CSVにLifeBurst=1だがJSONにLIFE_BURSTなし`, burst || eff);
    }
    if (!csvHasBurst && jsonHasBurst) {
      report(json, cardId, name, 'LIFE_BURST_EXTRA',
        `CSVにLifeBurst=0だがJSONにLIFE_BURSTあり`, eff);
    }

    // ── 3. DRAW枚数不一致 ──────────────────────────────────────
    // 「カードをN枚引く」パターン（自分が引く場合）
    const drawMatches = [...fullText.matchAll(/カードを([０-９\d]+)枚引く/g)];
    if (drawMatches.length > 0 && !hasStub && !hasUnknown) {
      const csvDrawCounts = drawMatches
        .map(m => parseInt(kanjiToNum(m[1])))
        .filter(n => !isNaN(n));
      const jsonDrawActs = allActs.filter(a => a.type === 'DRAW' && a.owner === 'self');
      if (jsonDrawActs.length > 0) {
        const jsonDrawCounts = jsonDrawActs.map(a => a.count);
        // CSVの最大ドロー数がJSONに存在するか確認
        const csvMax = Math.max(...csvDrawCounts);
        const jsonMax = Math.max(...jsonDrawCounts);
        if (csvMax !== jsonMax && csvDrawCounts.length === 1) {
          report(json, cardId, name, 'DRAW_COUNT_MISMATCH',
            `CSV「${csvMax}枚引く」、JSONのDRAW最大=${jsonMax}`, fullText);
        }
      }
    }

    // ── 4. MILL枚数不一致 ──────────────────────────────────────
    // 「デッキの上からカードをN枚トラッシュに置く」
    const millMatches = [...fullText.matchAll(/デッキの?上からカードを([０-９\d]+)枚トラッシュ/g)];
    if (millMatches.length > 0 && !hasStub && !hasUnknown) {
      const csvMillCounts = millMatches
        .map(m => parseInt(kanjiToNum(m[1])))
        .filter(n => !isNaN(n));
      const jsonMillActs = allActs.filter(a => a.type === 'MILL');
      if (jsonMillActs.length > 0 && csvMillCounts.length === 1) {
        const csvMill = csvMillCounts[0];
        const jsonMill = jsonMillActs[0].count;
        if (csvMill !== jsonMill) {
          report(json, cardId, name, 'MILL_COUNT_MISMATCH',
            `CSV「${csvMill}枚トラッシュ」、JSONのMILL=${jsonMill}`, fullText);
        }
      }
    }

    // ── 5. パワー値不一致 ──────────────────────────────────────
    // CSV「パワーを±N000」とJSON POWER_MODIFY.deltaを比較
    const powerMatches = [...fullText.matchAll(/パワーを([＋\+－\-])([０-９\d,，]+)/g)];
    if (powerMatches.length > 0 && !hasStub && !hasUnknown) {
      const csvPowerVals = powerMatches.map(m => {
        const sign = (m[1] === '＋' || m[1] === '+') ? 1 : -1;
        const num = parseInt(kanjiToNum(m[2]).replace(/[,，]/g, ''));
        return sign * num;
      }).filter(n => !isNaN(n));
      const jsonPowerActs = allActs.filter(a => a.type === 'POWER_MODIFY');
      for (const pa of jsonPowerActs) {
        if (pa.delta !== undefined && !csvPowerVals.includes(pa.delta)) {
          report(json, cardId, name, 'POWER_VALUE_MISMATCH',
            `JSONのdelta=${pa.delta}、CSV値=[${csvPowerVals.join(',')}]`, fullText);
        }
      }
    }

    // ── 6. 強制/任意不一致 ──────────────────────────────────
    // 「してもよい」がCSVにある → そのエフェクトは mandatory:false であるべき
    // 括弧内の説明文・「効果付与」内の「してもよい」は除外
    const effForOptCheck = eff
      .replace(/（[^）]*）/g, '')           // 括弧説明除外
      .replace(/「[^」]*してもよい[^」]*」/g, ''); // 付与効果内除外
    const hasOptional = /してもよい/.test(effForOptCheck);
    if (hasOptional && !hasStub && !hasUnknown) {
      // ACTIVATED以外かつコストなしのAUTOで全mandatory:trueは疑わしい
      const nonActivatedEffects = efList.filter(ef =>
        ef.effectType !== 'ACTIVATED' && ef.effectType !== 'LIFE_BURST'
      );
      const allMandatory = nonActivatedEffects.length > 0 &&
        nonActivatedEffects.every(ef => ef.mandatory === true);
      if (allMandatory) {
        report(json, cardId, name, 'MANDATORY_SUSPICIOUS',
          `CSV「してもよい」あり、AUTO/CONTINUOUSエフェクトが全て mandatory:true`, eff);
      }
    }
    // 「してもよい」がないのにACTIVATED以外でmandatory:false
    // （ACTIVATEDは任意使用が基本なので除外）
    if (!hasOptional && !hasStub && !hasUnknown) {
      const nonActivatedNonBurst = efList.filter(ef =>
        ef.effectType !== 'ACTIVATED' && ef.effectType !== 'LIFE_BURST'
      );
      const allOptional = nonActivatedNonBurst.length > 0 &&
        nonActivatedNonBurst.every(ef => ef.mandatory === false);
      if (allOptional) {
        report(json, cardId, name, 'OPTIONAL_SUSPICIOUS',
          `CSV「してもよい」なし、AUTO/CONTINUOUSエフェクトが全て mandatory:false`, eff);
      }
    }

    // ── 7. BOUNCE先不一致 ──────────────────────────────────────
    // CSV「手札に戻す」があるのにBOUNCE destination が deck など
    if (/手札に戻す/.test(fullText) && !hasStub && !hasUnknown) {
      const jsonBounceActs = allActs.filter(a => a.type === 'BOUNCE');
      for (const ba of jsonBounceActs) {
        if (ba.destination && ba.destination !== 'hand') {
          report(json, cardId, name, 'BOUNCE_DEST_MISMATCH',
            `CSV「手札に戻す」、JSONのdestination=${ba.destination}`, fullText);
        }
      }
    }
    // CSV「デッキに戻す」があるのにBOUNCE destination が hand など
    if (/デッキに戻す/.test(fullText) && !hasStub && !hasUnknown) {
      const jsonBounceActs = allActs.filter(a => a.type === 'BOUNCE');
      for (const ba of jsonBounceActs) {
        if (ba.destination && ba.destination !== 'deck') {
          report(json, cardId, name, 'BOUNCE_DEST_MISMATCH',
            `CSV「デッキに戻す」、JSONのdestination=${ba.destination}`, fullText);
        }
      }
    }
  }
}

// ─── 結果出力 ──────────────────────────────────────────────────
console.log(`\n=== 検出結果: ${issues.length}件 ===\n`);

const byCheck = {};
for (const iss of issues) {
  byCheck[iss.checkType] = byCheck[iss.checkType] || [];
  byCheck[iss.checkType].push(iss);
}

for (const [checkType, list] of Object.entries(byCheck)) {
  console.log(`\n─── ${checkType} (${list.length}件) ───`);
  for (const iss of list) {
    console.log(`  [${iss.file}] ${iss.cardId} ${iss.name}`);
    console.log(`    ${iss.detail}`);
    if (iss.csvSnippet) console.log(`    CSV: ${iss.csvSnippet}`);
  }
}

// ファイル別サマリー
console.log('\n\n=== ファイル別サマリー ===');
const byFile = {};
for (const iss of issues) {
  byFile[iss.file] = (byFile[iss.file] || 0) + 1;
}
for (const [f, cnt] of Object.entries(byFile)) {
  console.log(`  ${f}: ${cnt}件`);
}
console.log(`  合計: ${issues.length}件`);
