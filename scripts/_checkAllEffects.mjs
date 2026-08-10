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
  const lines = fs.readFileSync(path.join(root, 'public/data', filename), 'utf8').replace(/^﻿/, '').replace(/\r/g, '').split('\n');
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
  // 付与能力（abilities）の内部はexpandEffects側で展開されるためここでは展開しない
  return [a];
}

// エフェクトリストを付与能力（abilities内のCardEffect）込みで展開
function expandEffects(efList) {
  const out = [];
  for (const ef of efList) {
    out.push(ef);
    const collectAbilities = (a) => {
      if (!a) return;
      if (a.abilities) for (const ab of a.abilities) { out.push(ab); collectAbilities(ab.action); }
      if (a.steps) a.steps.forEach(collectAbilities);
      if (a.then) collectAbilities(a.then);
      if (a.else) collectAbilities(a.else);
    };
    collectAbilities(ef.action);
  }
  return out;
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
// 既知の未対応を含むため件数ゲート（0件維持）の対象外とする警告。検出結果とは別枠で出力する
const warnings = [];

function report(file, cardId, name, checkType, detail, csvSnippet) {
  issues.push({ file, cardId, name, checkType, detail, csvSnippet: csvSnippet?.substring(0, 100) });
}

function warn(file, cardId, name, checkType, detail) {
  warnings.push({ file, cardId, name, checkType, detail });
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
    const efListExpanded = expandEffects(efList);
    const jsonTypes = efListExpanded.map(ef => ef.effectType);
    const allActs = efListExpanded.flatMap(ef => flatActions(ef.action));
    const hasStub = allActs.some(a => a.type === 'STUB');
    const hasUnknown = allActs.some(a => a.type === 'UNKNOWN');

    // ── 1. effectType不一致 ──────────────────────────────────
    // 「効果付与」パターン（「『【自】〜』を得る」「『【常】〜』を得る」）は除外
    // 括弧内の説明文も除外
    // 「【自】能力」「【出】【起】能力」のような能力種別への言及は宣言ではないため除去
    const stripMentions = (s) => s.replace(/【[常自起出]】(?=(?:【[常自起出]】)*能力)/g, '');
    const effNoGrant = stripMentions(eff)
      .replace(/「【[常自起]】[^」]*」/g, '')   // 「【常】〜」 形式の付与効果
      .replace(/『[^』]*』/g, '')               // 『【自】〜』 形式の付与効果（チーム系アーツ等）
      .replace(/（[^）]*）/g, '');              // （）内の説明文
    const burstNoGrant = stripMentions(burst)
      .replace(/「【[常自起]】[^」]*」/g, '')
      .replace(/『[^』]*』/g, '')
      .replace(/（[^）]*）/g, '');
    const effStripped = effNoGrant + ' ' + burstNoGrant;

    // 【常】がCSVにあるのにJSONにCONTINUOUSがない
    // ただし「ガード」「マルチエナ」のみの【常】は除外（通常LIFE_BURSTとして実装）
    if (/【常】/.test(effStripped) && !jsonTypes.includes('CONTINUOUS') && !hasStub) {
      const isGuardOrMultiEnaOnly = /【常】：【(マルチエナ|ガード)】/.test(eff) && (eff.match(/【常】/g)||[]).length === 1;
      // ⚠**「…あるかぎり、（このシグニ）は「【自】…」を得る」だけの【常】は CONTINUOUS を持たないのが正しい**。
      //   この形は parser が **AUTO + activeCondition へ平坦化**するのが本プロジェクトの表現（引用付与の展開）で、
      //   CONTINUOUS を別途作らない。旧実装は 15件中12件をこれで誤検出していた（2026-08-10 仕分け）。
      // ⚠引用（「」『』）の中にも【自】等が入るので、**先に引用をマスクしてから**【常】文へ分割する
      //   （マスクしないと `[^【]*` が引用内の【自】で切れて文を取り違える）。
      const masked = eff.replace(/[「『][^」』]*[」』]/g,
        m => /【[常自起]】/.test(m) ? 'GRANT' : 'Q');
      // ⚠**能力マーカー（【常】【自】【起】【出】）だけで区切る**＝`[^【]*` で切ると
      //   文中の【ゲート】【エナチャージ】等のキーワードで文が途切れて誤判定する。
      const contSentences = masked.split(/(?=【[常自起出]】)/).filter(x => x.startsWith('【常】'));
      const grantOnlyCont = contSentences.length > 0
        && contSentences.every(sent => /を得る/.test(sent) && sent.includes('GRANT'));
      // ⚠**カードが【常】と印字していても本文が「〜したとき」なら triggered**（WX11-063/064）。
      //   AUTO + activeCondition が正しい表現なので CONTINUOUS を要求しない。
      const triggeredCont = contSentences.length > 0
        && contSentences.every(sent => /(したとき|されたとき|するたび)/.test(sent));
      if (!isGuardOrMultiEnaOnly && !grantOnlyCont && !triggeredCont) {
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
    const drawMatches = [...fullText.matchAll(/カードを([０-９\d]+)枚引[くき]/g)];
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
        // ⚠**`count:0` + `countPerLastProcessed` は「この方法で処理した枚数につき1枚」の可変ミル**＝
        //   固定枚数と比較してはいけない（WXDi-P11-077 を誤検出していた）。
        const isVariableMill = jsonMillActs.some(a =>
          Object.keys(a).some(k => /^count(?!$)/.test(k) && a[k] === true || /^count(Per|Is)/.test(k)));
        if (csvMill !== jsonMill && !isVariableMill) {
          report(json, cardId, name, 'MILL_COUNT_MISMATCH',
            `CSV「${csvMill}枚トラッシュ」、JSONのMILL=${jsonMill}`, fullText);
        }
      }
    }

    // ── 5. パワー値不一致 ──────────────────────────────────────
    // CSV「パワーを±N000」とJSON POWER_MODIFY.deltaを比較
    // 「パワーを**それぞれ**－15000する」のような副詞挟みも拾う（WX06-006 を取りこぼしていた）。
    const powerMatches = [...fullText.matchAll(/パワー[をは](?:それぞれ|さらに|合計で)?([＋\+－\-])([０-９\d,，]+)/g)];
    if (powerMatches.length > 0 && !hasStub && !hasUnknown) {
      const csvPowerVals = powerMatches.map(m => {
        const sign = (m[1] === '＋' || m[1] === '+') ? 1 : -1;
        const num = parseInt(kanjiToNum(m[2]).replace(/[,，]/g, ''));
        return sign * num;
      }).filter(n => !isNaN(n));
      const jsonPowerActs = allActs.filter(a => a.type === 'POWER_MODIFY');
      // ⚠**「代わりに」は加算分解で表現する**のが本プロジェクトの表現＝「－5000。…代わりに－8000」は
      //   `-5000` ＋（条件成立時に）`-3000` の2ステップになる。**差分値も正当な delta** として許容する
      //   （旧実装は素の値としか比較せず、6件すべてを誤検出していた。2026-08-10 仕分け）。
      // ⚠**対象を選ぶだけの `delta:0` ステップ**（後続 `targetsLastProcessed` が本体）も正当（WX25-P2-068/070）。
      const allowedDeltas = new Set(csvPowerVals);
      allowedDeltas.add(0);
      for (const a of csvPowerVals) for (const b of csvPowerVals) if (a !== b) allowedDeltas.add(a - b);
      for (const pa of jsonPowerActs) {
        if (pa.delta !== undefined && !allowedDeltas.has(pa.delta)) {
          report(json, cardId, name, 'POWER_VALUE_MISMATCH',
            `JSONのdelta=${pa.delta}、CSV値=[${csvPowerVals.join(',')}]（差分・0も許容済み）`, fullText);
        }
      }
    }

    // ── 6. 強制/任意不一致 ──────────────────────────────────
    // 「してもよい」がCSVにある → 実行時に辞退可能な表現があるべき
    // 任意性は effect.mandatory:false のほか、アクションレベルでも表現される:
    //   optional:true / target.upToCount / source.upToCount / CHOOSE のノーオプ選択肢 /
    //   SEARCH・REVEAL_AND_PICK（0枚選択可） / STUB（手動解決）
    // 括弧内の説明文・「効果付与」内・【起】能力内（ACTIVATEDは任意使用）の「してもよい」は除外
    const effForOptCheck = eff
      .replace(/（[^）]*）/g, '')           // 括弧説明除外
      .replace(/「[^」]*してもよい[^」]*」/g, '') // 付与効果内除外
      .replace(/『[^』]*』/g, '')           // 『〜』付与効果内除外
      .replace(/【起】.*?(?=【(?:出|自|常|起)】|$)/gs, ''); // 起動能力内除外（次の能力マーカーまで）
    // ⚠**「してもよい」だけを見てはいけない**＝「引いてもよい」「クラッシュしてもよい」「置いてもよい」など
    //   連用形＋「てもよい」が実データの多数派で、旧実装はこれを任意と認識せず
    //   `OPTIONAL_SUSPICIOUS` を誤検出していた（WX02-003/WX18-059）。
    // ⚠**主語が「対戦相手は」の「〜てもよい」は自分の効果の任意性ではない**（WX26-CP1-048）＝除外する。
    const effForOptCheck2 = effForOptCheck.replace(/対戦相手は[^。]*?てもよい/g, '');
    const hasOptional = /[てで]もよい/.test(effForOptCheck2);
    // アクション木に辞退可能な表現があるか
    const actionIsSkippable = (a) => {
      if (!a || typeof a !== 'object') return false;
      if (a.optional === true) return true;
      if (a.target?.upToCount === true) return true;
      if (a.source?.upToCount === true) return true;
      if (a.type === 'SEARCH' || a.type === 'REVEAL_AND_PICK' || a.type === 'STUB' || a.type === 'UNKNOWN') return true;
      // CHOOSE{upTo:true}＝「N つまで選ぶ」＝0個選択できる＝辞退可能（WX16-070）
      if (a.type === 'CHOOSE' && a.upTo === true) return true;
      // LOOK_PICK_CHAIN＝「見た中からN枚まで…してもよい」＝各 stage の pick は 0 可（WX15-049/WX15-082）
      if (a.type === 'LOOK_PICK_CHAIN' || a.type === 'LOOK_AND_REORDER') return true;
      // PLAY_FREE系は使用確認UI、REARRANGEは配置をユーザーが決める（現状維持も選べる）ため辞退可能扱い
      if (a.type === 'PLAY_FREE' || a.type === 'PLAY_FREE_FROM_TRASH' || a.type === 'REARRANGE_SIGNI') return true;
      if (a.type === 'CHOOSE' && (a.choices ?? []).some(c =>
        c.action?.type === 'SEQUENCE' && (c.action.steps ?? []).length === 0)) return true;
      // ⚠**付与能力の中身まで潜る**（2026-08-10 続き417）＝従来は steps/then/else/choices しか見ておらず、
      //   `GRANT_*_ABILITY.abilities[].action` や `GRANT_EFFECT.effect.action` の内側にある辞退可能表現を
      //   見落として**誤検出**していた（`WX17-077` の `CHOOSE{upTo}`／`WX21-052` の `BANISH{upToCount}`）。
      //   「原文の『てもよい』が引用能力の中にある」カードなので、その中身を見るのが正しい。
      const children = [
        ...(a.steps ?? []), a.then, a.else, a.thenAction, a.burstAction,
        ...((a.choices ?? []).map(c => c.action)),
        ...((a.abilities ?? []).map(ab => ab?.action)),
        a.effect?.action ?? a.effect,
      ];
      return children.some(actionIsSkippable);
    };
    if (hasOptional && !hasStub && !hasUnknown) {
      const nonActivatedEffects = efList.filter(ef =>
        ef.effectType !== 'ACTIVATED' && ef.effectType !== 'LIFE_BURST'
      );
      const allMandatory = nonActivatedEffects.length > 0 &&
        nonActivatedEffects.every(ef => ef.mandatory === true);
      const anySkippable = nonActivatedEffects.some(ef => actionIsSkippable(ef.action));
      if (allMandatory && !anySkippable) {
        report(json, cardId, name, 'MANDATORY_SUSPICIOUS',
          `CSV「してもよい」あり、AUTO/CONTINUOUSエフェクトに辞退可能な表現なし`, eff);
      }
    }
    // 「してもよい」がないのにACTIVATED以外でmandatory:false
    // （ACTIVATEDは任意使用が基本なので除外）
    // 除外: 全効果が 【出】(ON_PLAY) + コスト付き → コストを支払わないことを選べるため mandatory:false は正しい
    if (!hasOptional && !hasStub && !hasUnknown) {
      // TRAP_ICON/SONG_ICON は発動が任意（発動してもよい）なので mandatory:false は正しい → 除外
      const nonActivatedNonBurst = efList.filter(ef =>
        ef.effectType !== 'ACTIVATED' && ef.effectType !== 'LIFE_BURST' &&
        ef.effectType !== 'TRAP_ICON' && ef.effectType !== 'SONG_ICON'
      );
      const allOptional = nonActivatedNonBurst.length > 0 &&
        nonActivatedNonBurst.every(ef => ef.mandatory === false);
      if (allOptional) {
        // 【出】コスト付き効果は「コストを支払わず発動しないことを選べる」ため mandatory:false は正しい
        // → 全AUTO効果がON_PLAY(【出】) AND CSVに 【出】コストパターン(「【出】...：」)があれば除外
        // コスト内に【ビート】【チャーム】【ウィルス】等の【】を含む場合も対応（[^：\n]+で許容）
        const allOnPlay = nonActivatedNonBurst.every(ef =>
          ef.effectType === 'AUTO' &&
          Array.isArray(ef.timing) && ef.timing.every(t => t === 'ON_PLAY')
        );
        const hasOnPlayCost = /【出】[^：\n]+：/.test(eff);
        if (!(allOnPlay && hasOnPlayCost)) {
          report(json, cardId, name, 'OPTIONAL_SUSPICIOUS',
            `CSV「してもよい」なし、AUTO/CONTINUOUSエフェクトが全て mandatory:false`, eff);
        }
      }
    }

    // ── 6b. 無発火の任意【出】検出（v0.261コインコスト系統バグと同型）──────
    // mandatory:false かつ cost なしの AUTO/ON_PLAY(triggerScope self) は、エンジンの収集フィルタ
    // （mandatoryOnPlay: mandatory!==false / costOnPlay: mandatory:false+costあり）の両方から漏れて
    // 一切発火しない。テキスト上はコストがある（【出】...：）のにJSONで未表現のケースが大半。
    // 既知の未表現コスト（自己犠牲・英知・ルリグデッキ等）が多数残っているため警告枠で出力する。
    for (const ef of efList) {
      if (ef.effectType !== 'AUTO') continue;
      if (!Array.isArray(ef.timing) || !ef.timing.includes('ON_PLAY')) continue;
      if (ef.triggerScope && ef.triggerScope !== 'self') continue;
      if (ef.mandatory !== false) continue;
      if (ef.cost && Object.keys(ef.cost).length > 0) continue;
      warn(json, cardId, name, 'ONPLAY_DEAD_OPTIONAL',
        `${ef.effectId}: mandatory:false+costなしのON_PLAYは発火しない（costの表現追加かmandatory見直しが必要）`);
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

// 警告（0件維持ゲートの対象外。既知の未表現コスト等の棚卸し用）
// 詳細表示は --warnings 付きで実行
if (warnings.length > 0) {
  const byWarnType = {};
  for (const w of warnings) byWarnType[w.checkType] = (byWarnType[w.checkType] || 0) + 1;
  console.log(`\n=== 警告（参考・ゲート対象外）: ${warnings.length}件 ===`);
  for (const [t, cnt] of Object.entries(byWarnType)) console.log(`  ${t}: ${cnt}件`);
  if (process.argv.includes('--warnings')) {
    for (const w of warnings) console.log(`  [${w.file}] ${w.cardId} ${w.name}: ${w.detail}`);
  }
}
