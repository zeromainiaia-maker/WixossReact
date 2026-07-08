/**
 * decompileEffects.ts
 * effects_*.json の構造化効果を「日本語の自然言語っぽい文」へ逆翻訳し、
 * CardData CSV の原文（EffectText/BurstText）と並べて表示する検証補助ツール。
 *
 * 目的: パーサー/手修正の結果が原文と食い違っていないかを目視レビューしやすくする。
 *   - 逆翻訳は「JSONが宣言している内容」を素直に和文化したもの（近似・STUBはそのまま明示）。
 *   - 一致＝正しさの保証ではないが、不一致は要確認のシグナルになる。
 *
 * 使い方:
 *   npx tsx scripts/decompileEffects.ts WX12-024 WX20-055      # 指定カード
 *   npx tsx scripts/decompileEffects.ts --manual               # manualEffects 登録カードのみ
 *   npx tsx scripts/decompileEffects.ts --grep ゲート          # 原文に語を含むカード
 *   npx tsx scripts/decompileEffects.ts --sheets               # 全シートを docs/decompile_sheet<N>.txt へ直接書き出し
 *     （UTF-8 でファイル直書き＝シェルの > を使わない。PowerShell の > が UTF-16 を書いて
 *       下流の genReviewRepr/groupSimilar/groupBySentence を壊す事故を構造的に防ぐ。
 *       下流までまとめて回すなら npm run regen）
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import type { CardData } from '../src/types';
import { mergeManualEffects, MANUAL_EFFECTS } from '../src/data/manualEffects';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Eff = any;
type Action = any;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── データ読み込み ──
const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const effectsMap = new Map<string, Eff[]>();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const j = JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8'));
  for (const [id, effs] of Object.entries(j)) effectsMap.set(id, effs as Eff[]);
}
// manualEffects をマージ（runtime の buildEffectsMap と同じ effects を逆翻訳に反映する）
{
  const ids = new Set<string>([...effectsMap.keys(), ...Object.keys(MANUAL_EFFECTS)]);
  for (const id of ids) {
    const merged = mergeManualEffects(id, (effectsMap.get(id) ?? []) as never[]);
    if (merged.length > 0) effectsMap.set(id, merged as Eff[]);
  }
}

// ── STUBS.md から STUB id → 説明 マップを構築（逆翻訳で id ではなく説明文を出すため）──
const stubDescMap = new Map<string, string>();
{
  const p = join(root, 'docs/STUBS.md');
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf-8').split('\n')) {
      // 表の行: | `STUB_ID` | 件数 | カード数 | 代表カード | 説明 |
      const m = line.match(/^\|\s*`([^`]+)`\s*\|[^|]*\|[^|]*\|[^|]*\|(.*)\|\s*$/);
      if (!m) continue;
      const id = m[1].trim();
      const desc = m[2].trim();
      if (id && desc) stubDescMap.set(id, desc);
    }
  }
}

// ── 部品の和文化 ──
// 現在和文化中のカードの原文（STUB等で原文からパラメータを補完する用。出力ループでカードごとに設定）
let currentCardText = '';
const ownerJa = (o?: string) => o === 'opponent' ? '対戦相手の' : o === 'self' ? 'あなたの' : '';
const opJa = (op?: string) => ({ gte: '以上', lte: '以下', gt: 'より多く', lt: '未満', eq: 'である', neq: 'ではない' } as Record<string, string>)[op ?? ''] ?? (op ?? '');
const numJa = (n: any) => typeof n === 'object' ? '[参照値]' : String(n);

function filterJa(f?: any): string {
  if (!f) return '';
  const parts: string[] = [];
  if (f.thisCardOnly) parts.push('このシグニ自身');
  if (f.excludeSelf) parts.push('他の');
  if (f.frontOfSelf) parts.push('このシグニの正面の');
  if (f.frontOfGateZone) parts.push('【ゲート】の正面の');
  if (f.inGateZone) parts.push('同じゾーンに【ゲート】がある');
  if (f.centerZoneOnly) parts.push('中央ゾーンの');
  if (f.eachDistinctLevel) parts.push('それぞれレベルの異なる');
  if (f.color) parts.push(`《${[].concat(f.color).join('・')}》の`);
  if (f.colorExclude) parts.push(`《${[].concat(f.colorExclude).join('・')}》以外の`);
  if (f.cardClass) parts.push(`＜${[].concat(f.cardClass).join('・')}＞の`);
  if (f.cardClassExclude) parts.push(`＜${[].concat(f.cardClassExclude).join('・')}＞ではない`);
  if (f.story) parts.push(`＜${[].concat(f.story).join('・')}＞の`);
  if (f.cardName) parts.push(`《${f.cardName}》`);
  if (f.excludeCardName) parts.push(`《${f.excludeCardName}》以外の`);
  if (f.cardNames) parts.push(`《${f.cardNames.join('》《')}》のいずれか`);
  if (typeof f.level === 'number') parts.push(`レベル${f.level}の`);
  else if (f.level?.max != null) parts.push(`レベル${f.level.max}以下の`);
  else if (f.level?.min != null) parts.push(`レベル${f.level.min}以上の`);
  if (f.levelEqualsVar === 'field_trash_level') parts.push('この方法でトラッシュしたシグニと同じレベルの');
  else if (f.levelEqualsVar === 'charm_trash_count') parts.push('トラッシュしたチャーム枚数と同じレベルの');
  if (f.levelEqDiscardLevelSum) parts.push('捨てたカードのレベル合計と同じレベルの');
  if (f.levelRange?.max != null) parts.push(`レベル${f.levelRange.max}以下の`);
  if (f.levelRange?.min != null) parts.push(`レベル${f.levelRange.min}以上の`);
  if (f.powerLteRevealedSigniLevelSum != null) parts.push(`パワーが「この方法で公開したシグニのレベルの合計×${f.powerLteRevealedSigniLevelSum}」以下の`);
  if (f.powerRange?.max != null) parts.push(`パワー${f.powerRange.max}以下の`);
  if (f.powerRange?.min != null) parts.push(`パワー${f.powerRange.min}以上の`);
  if (f.costMin != null && f.costMax != null && f.costMin === f.costMax) parts.push(`コストの合計が${f.costMax}の`);
  else {
    if (f.costMax != null) parts.push(`コストの合計が${f.costMax}以下の`);
    if (f.costMin != null) parts.push(`コストの合計が${f.costMin}以上の`);
  }
  if (f.powerLteSelf) parts.push('このシグニのパワー以下の');
  if (f.powerLtSelf) parts.push('このシグニよりパワーの低い');
  if (f.powerGtSelf) parts.push('このシグニよりパワーの高い');
  if (f.levelLtSelf) parts.push('このシグニより低いレベルを持つ');
  if (f.levelGtSelf) parts.push('このシグニよりレベルの高い');
  if (f.powerLtAnyAlly) parts.push('あなたのいずれかのシグニよりパワーの低い');
  if (f.powerLtPrinted) parts.push('表記されているパワーよりパワーの低い');
  if (f.powerGtPrinted) parts.push('表記されているパワーよりパワーの高い');
  if (f.powerLtTrigger) parts.push('そのシグニよりパワーの低い');
  if (f.levelLtTrigger) parts.push('そのシグニより低いレベルを持つ');
  if (f.levelGtTrigger) parts.push('そのシグニより高いレベルを持つ');
  if (f.levelLtOppLrig) parts.push('対戦相手のセンタールリグより低いレベルを持つ');
  if (f.superlative) parts.push(`最も${f.superlative.key === 'level' ? 'レベル' : 'パワー'}の${f.superlative.dir === 'max' ? '高い' : '低い'}`);
  if (f.powerLteLastProcessed) parts.push('直前に処理したシグニのパワー以下の');
  if (f.powerLtLastProcessed) parts.push('（その後）そのシグニよりパワーの低い');
  if (f.levelLteLastProcessed) parts.push('この方法で処理したシグニのレベル以下の');
  if (f.levelLtLastProcessed) parts.push('（その後）そのシグニより低いレベルを持つ');
  if (f.levelEqLastProcessed) parts.push('この方法で【ビート】にしたシグニと同じレベルの');
  if (f.levelLteDiscardSigni) parts.push('この方法で捨てたシグニのレベル以下の');
  if (f.hasGuard) parts.push('《ガードアイコン》を持つ');
  if (f.noGuard) parts.push('《ガードアイコン》を持たない');
  if (f.hasRiseIcon) parts.push('《ライズアイコン》を持つ');
  if (f.hasCrossIcon) parts.push('《クロスアイコン》を持つ');
  if (f.eachDistinctColor) parts.push('それぞれ共通する色を持たず');
  if (f.nonColorless) parts.push('無色ではない');
  if (f.isDisona) parts.push('《ディソナアイコン》を持つ');
  if (f.levelParity) parts.push(f.levelParity === 'odd' ? 'レベルが奇数の' : 'レベルが偶数の');
  if (f.commonClass) parts.push('共通するクラスを持つ');
  if (f.hasIcon) parts.push(`《${f.hasIcon}アイコン》を持つ`);
  if (f.isDown) parts.push('ダウン状態の');
  if (f.isUp) parts.push('アップ状態の');
  if (f.isFrozen) parts.push('凍結状態の');
  if (f.isAwakened) parts.push('覚醒状態の');
  if (f.crossState) parts.push('クロス状態の');
  if (f.hasCharm) parts.push('チャームのある');
  if (f.hasAcce) parts.push('アクセのある');
  if (f.infected) parts.push('感染状態の');
  if (f.colorMatchesLrig) parts.push('センタールリグと共通色の');
  if (f.colorNotMatchesLrig) parts.push('センタールリグと共通色でない');
  if (f.keyword) parts.push(`${[].concat(f.keyword).map((k: string) => `【${k}】`).join('か')}を持つ`);
  return parts.join('');
}

function targetJa(t?: any, unit = 'シグニ', exSelf = false): string {
  if (!t) return '';
  // excludeSelf は filter の外（target 直下・action 直下）にも置かれるため、ここで filter にマージして「他の」を出す
  if ((exSelf || t.excludeSelf) && !t.filter?.excludeSelf) t = { ...t, filter: { ...(t.filter || {}), excludeSelf: true } };
  // isTriggerSource: トリガー元（「アタックしたそのシグニ」等）→ 主語省略で「その〜」
  if (t.filter?.isTriggerSource) {
    const lvMax = t.filter.levelRange?.max ?? (typeof t.filter.level === 'object' ? t.filter.level?.max : undefined);
    return lvMax !== undefined ? `そのレベル${lvMax}以下の${unit}` : `その${unit}`;
  }
  // thisCardOnly: このシグニ自身に限定 → 主語・数詞を省略して「このシグニ」
  if (t.filter?.thisCardOnly) {
    return 'このシグニ';
  }
  // owner='any': count='ALL' は「すべてのシグニ」（両者・主語省略）、単体選択は「自分または対戦相手の」（どちらも選べる）
  const own = t.owner === 'any' ? (t.count === 'ALL' ? '' : '自分または対戦相手の') : ownerJa(t.owner);
  // 領域カード（手札/トラッシュ/エナ/デッキ等）はフィルタの cardType を名詞に反映（無ければ「カード」）
  const loc = t.type === 'HAND_CARD' ? '(手札)' : t.type === 'TRASH_CARD' ? '(トラッシュ)'
    : t.type === 'ENERGY_CARD' ? '(エナ)' : t.type === 'DECK_CARD' ? '(デッキ)'
    : t.type === 'LRIG_TRASH_CARD' ? '(ルリグトラッシュ)' : t.type === 'LIFE_CLOTH_CARD' ? '(ライフ)' : '';
  let u: string;
  if (t.type === 'LRIG') u = 'ルリグ';
  else if (t.type === 'CENTER_LRIG_OR_SIGNI') u = 'センタールリグかシグニ';
  else if (t.type === 'PLAYER') u = '';
  else if (loc) {
    const ct = t.filter?.cardType;
    u = (ct ? ([] as string[]).concat(ct).join('か') : 'カード') + loc;
  } else if (t.filter?.isResona || t.filter?.cardType === 'レゾナ') u = 'レゾナ';
  else u = unit; // SIGNI 等
  // パワー合計上限つき「好きな数」（「パワーの合計がN以下になるように好きな数」）
  if (t.totalPowerMax !== undefined) {
    return `${own}${filterJa(t.filter)}${u}をパワーの合計が${t.totalPowerMax}以下になるように好きな数`.trim();
  }
  // レベル合計上限つき「M体まで」（「レベルの合計がN以下になるようにM体まで」）
  if (t.totalLevelMax !== undefined) {
    const mPick = typeof t.count === 'number' ? `${t.count}体まで` : '好きな数';
    return `${own}${filterJa(t.filter)}${u}をレベルの合計が${t.totalLevelMax}以下になるように${mPick}`.trim();
  }
  const counter = loc ? '枚' : '体';
  // 動的数：直前にトラッシュした枚数（「トラッシュに置いたシグニ1体につき」）
  if (typeof t.count === 'object' && t.count?.$ref === 'last_processed_count') {
    return `トラッシュに置いたシグニ1${counter}につき${own}${filterJa(t.filter)}${u}1${counter}`.trim();
  }
  // 「好きな数」（count:'ALL' + upToCount）
  if (t.count === 'ALL' && t.upToCount) {
    return `${own}好きな数の${filterJa(t.filter)}${u}`.trim();
  }
  const cnt = t.count === 'ALL' ? 'すべての' : '';
  const cntSuf = t.count === 'ALL' ? '' : `${t.count}${t.upToCount ? counter + 'まで' : counter}`;
  const blind = t.blind ? '（見ないで）' : '';
  return `${own}${cnt}${filterJa(t.filter)}${u}${cntSuf ? cntSuf : ''}${blind}`.trim();
}

function costJa(c?: any): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.energy) parts.push(c.energy.map((e: any) => `《${e.color}×${e.count}》`).join(''));
  if (c.exceed != null) parts.push(`エクシード${c.exceed}`);
  if (c.down_self) parts.push('《ダウン》');
  if (c.trash_self) parts.push('このシグニを場からトラッシュに置く');
  if (c.discard != null) parts.push(c.discardFilter ? `手札から${filterJa(c.discardFilter)}カード${c.discard}枚を捨てる` : `手札${c.discard}枚を捨てる`);
  if (c.handDiscardSigni) parts.push(`手札から${filterJa(c.handDiscardSigni)}シグニ${c.handDiscardSigni.count}枚を捨てる`);
  if (c.handToEnergy) parts.push(`手札から${filterJa(c.handToEnergy.filter)}シグニ${c.handToEnergy.count}枚をエナゾーンに置く`);
  if (c.handToUnderSelf) parts.push(`手札から${filterJa(c.handToUnderSelf.filter)}カード${c.handToUnderSelf.count}枚をこのシグニの下に置く`);
  if (c.discardGroups) parts.push(c.discardGroups.map((g: any) => `手札から${filterJa(g.filter)}を${g.count}枚捨てる`).join('＋'));
  if (c.coin != null) parts.push(`コイン${c.coin}`);
  if (c.beat_signi != null) parts.push(`シグニ${c.beat_signi}体を【ビート】にする`);
  if (c.beat_signi_from_trash) parts.push(`トラッシュから${filterJa(c.beat_signi_from_trash.filter)}シグニ${c.beat_signi_from_trash.count}枚を【ビート】にする`);
  if (c.energyTrash) parts.push(`エナゾーンから${filterJa(c.energyTrash.filter)}カード${c.energyTrash.count}枚をトラッシュに置く`);
  if (c.charmTrash != null) parts.push(`場の【チャーム】${c.charmTrash}枚をトラッシュ`);
  if (c.charmTrashVariable) parts.push('場の【チャーム】を好きな枚数トラッシュ');
  if (c.fieldTrash) parts.push(`場から${c.fieldTrash.excludeSelf ? '他の' : ''}${filterJa(c.fieldTrash.filter)}シグニ${c.fieldTrash.count}体をトラッシュ`);
  if (c.fieldTrashGroups) parts.push(`場から${c.fieldTrashGroups.map((g: any) => `${filterJa(g.filter)}シグニ${g.count}体`).join('と')}をトラッシュ`);
  if (c.fieldDown) parts.push(`場の${filterJa(c.fieldDown.filter)}シグニ${c.fieldDown.count}体をダウン`);
  if (c.trashArtsFromLrigDeck) parts.push(`ルリグデッキから${c.trashArtsFromLrigDeck.color ? c.trashArtsFromLrigDeck.color + 'の' : ''}アーツ${c.trashArtsFromLrigDeck.count}枚をルリグトラッシュに置く`);
  if (parts.length === 0) return `コスト:${JSON.stringify(c)}`;
  return parts.join('＋');
}

function condJa(c?: any): string {
  if (!c) return '';
  switch (c.type) {
    case 'AND': return c.conditions.map(condJa).join('かつ');
    case 'SAME_ZONE_HAS_GATE': return '同じシグニゾーンに【ゲート】がある';
    case 'FIELD_HAS_GATE': return `${ownerJa(c.owner)}場に【ゲート】がある`;
    case 'TURN_OWNER': return c.owner === 'opponent' ? '対戦相手のターンの間' : '自分のターンの間';
    case 'FIELD_COUNT': return `${ownerJa(c.owner)}場のシグニが${numJa(c.value)}体${opJa(c.operator)}`;
    case 'HAND_COUNT': return `${ownerJa(c.owner)}手札が${numJa(c.value)}枚${opJa(c.operator)}`;
    case 'HAND_COUNT_FILTER': return `${ownerJa(c.owner)}手札に${c.distinctName ? '名前の異なる' : ''}${filterJa(c.filter)}カードが${numJa(c.value)}枚${opJa(c.operator)}`;
    case 'LIFE_COUNT': return `${ownerJa(c.owner)}ライフが${numJa(c.value)}${opJa(c.operator)}`;
    case 'LIFE_CRASHED_THIS_TURN': return `このターンに${ownerJa(c.owner)}ライフが${numJa(c.value)}枚${opJa(c.operator)}クラッシュされていた場合`;
    case 'ENERGY_COUNT': return `${ownerJa(c.owner)}エナが${numJa(c.value)}${opJa(c.operator)}`;
    case 'ENERGY_COUNT_FILTER': return `${ownerJa(c.owner)}エナゾーンに${c.distinctName ? '名前の異なる' : ''}${filterJa(c.filter)}${typeof c.filter?.cardType === 'string' ? c.filter.cardType : 'カード'}が${numJa(c.value)}枚${opJa(c.operator)}ある`;
    case 'ENERGY_HAS_COLOR': return `${ownerJa(c.owner)}エナゾーンに${(c.colors || []).map((col: string) => `《${col}》のカード`).join('と')}がある`;
    case 'LRIG_NAME_CONTAINS': return `${ownerJa(c.owner)}センタールリグ名が「${c.name}」を含む`;
    case 'LRIG_COLOR': return `${ownerJa(c.owner)}センタールリグが${c.color}`;
    case 'LRIG_LEVEL': return `${ownerJa(c.owner)}センタールリグがレベル${numJa(c.value)}${opJa(c.operator)}`;
    case 'FIELD_CLASS_COUNT': return `${ownerJa(c.owner)}場に＜${c.story}＞が${numJa(c.value)}体${opJa(c.operator)}`;
    case 'LRIG_TEAM_COUNT': return `${ownerJa(c.owner)}場に＜${c.team}＞のルリグが${numJa(c.value)}体${opJa(c.operator)}`;
    case 'TRASH_HAS_CARD':
      // 「トラッシュにカード名に《X》を含むカードがある」（WX20-065）
      if (c.filter?.cardName)
        return `${ownerJa(c.owner)}トラッシュにカード名に《${c.filter.cardName}》を含む${c.filter?.cardType ?? 'カード'}が${c.minCount && c.minCount > 1 ? numJa(c.minCount) + '枚以上' : ''}ある`;
      return `${ownerJa(c.owner)}トラッシュに${filterJa(c.filter)}${c.filter?.cardType ?? 'カード'}が${c.minCount && c.minCount > 1 ? numJa(c.minCount) + '枚以上' : ''}ある`;
    case 'SIGNI_RETURNED_TO_HAND_THIS_TURN': return 'このターンにシグニが場から手札に戻っていた';
    case 'ARTS_USED_THIS_TURN': return 'このターンにあなたがアーツを使用していた';
    case 'TRASH_COUNT': return `${ownerJa(c.owner)}トラッシュにカードが${numJa(c.value)}枚${opJa(c.operator)}`;
    case 'LAST_PROCESSED_HAS_BURST': return '直前のカードが【ライフバースト】を持つ';
    case 'LAST_PROCESSED_HAS_TYPE': return `この方法でトラッシュに置いたカードの中に${c.cardType}がある`;
    case 'LAST_PROCESSED_SHARE_COLOR': return 'それらがそれぞれ共通する色を持つ';
    case 'HAS_CARD_IN_FIELD':
      // 「場に《X》がいる」（X はルリグ名等の特定カード名）＝名前のみのフィルタは「シグニ」を付けない
      if (c.filter?.cardName && !c.filter?.cardType && !c.filter?.story && !c.filter?.color)
        return `${ownerJa(c.owner)}場に《${c.filter.cardName}》がいる`;
      // 「場にレベルN以上のルリグがいる」（ルリグゾーン走査・WX24-P4-061/068）
      if (c.filter?.cardType === 'ルリグ')
        return `${ownerJa(c.owner)}場に${filterJa(c.filter)}ルリグがいる`;
      // 「場にカード名に《X》を含むシグニがいる」（WX20-076）
      if (c.filter?.cardName && c.filter?.cardType === 'シグニ')
        return `${ownerJa(c.owner)}場にカード名に《${c.filter.cardName}》を含むシグニがいる`;
      return `${ownerJa(c.owner)}場に${c.excludeSelf ? '他の' : ''}${c.distinctNames ? 'それぞれ名前の異なる' : ''}${filterJa(c.filter)}${(c.filter?.isResona || c.filter?.cardType === 'レゾナ') ? 'レゾナ' : 'シグニ'}が${c.minCount && c.minCount > 1 ? numJa(c.minCount) + '体以上' : ''}いる`;
    case 'ENERGY_HAS_CARD': return `${ownerJa(c.owner)}エナゾーンに${filterJa(c.filter)}シグニが${c.minCount && c.minCount > 1 ? numJa(c.minCount) + '枚以上' : ''}ある`;
    case 'PAID_ADDITIONAL_COST': return '（コストを支払った場合）';
    case 'CARDS_DRAWN_BY_EFFECT': return `このターン効果で${numJa(c.value)}枚${opJa(c.operator)}引いた`;
    case 'IS_MY_TURN': return '自分のターンの間';
    case 'IS_OPPONENT_TURN': return '対戦相手のターンの間';
    case 'IS_BETTING': return c.minCoins != null ? `あなたが《コイン》${c.minCoins}枚以上ベットしていた` : 'あなたがベットしていた';
    case 'DECK_TOP_MATCHES': return `${ownerJa(c.owner)}デッキの一番上が${filterJa(c.filter)}${typeof c.filter?.cardType === 'string' ? c.filter.cardType : 'カード'}`;
    case 'DECK_TOP_SHARES_COLOR_WITH_LRIG': return `${ownerJa(c.owner)}場にそのカードと共通する色を持つルリグがいる`;
    case 'FIELD_SIGNI_ALL_DISTINCT_CLASS': return `${ownerJa(c.owner)}場にあるすべてのシグニがそれぞれ共通するクラスを持たない`;
    case 'LAST_PROCESSED_COUNT_GTE': return `この方法でカードを${numJa(c.value)}枚以上手札に加えた`;
    case 'LRIG_STORY': return `${ownerJa(c.owner)}センタールリグが＜${c.story}＞`;
    case 'LRIG_LEVEL_EQ_OPP': return '自分と対戦相手のセンタールリグのレベルが同じ';
    case 'LRIG_TRASH_COUNT': return `ルリグトラッシュに${c.cardType ?? 'カード'}が${numJa(c.value)}枚${opJa(c.operator)}`;
    case 'SUBSCRIBER_COUNT': return `登録者数が${numJa(c.value)}万${opJa(c.operator)}`;
    case 'SELF_POWER_GTE': return `このシグニのパワーが${numJa(c.value)}以上`;
    case 'THIS_CARD_FROM_TRASH': return 'このシグニがトラッシュから場に出た';
    case 'FIELD_SIGNI_POWER_COUNT': return `${ownerJa(c.owner)}場にパワー${c.minPower}以上のシグニが${numJa(c.value)}体${opJa(c.operator)}`;
    case 'LIFE_COMPARE_OPP': return `自分のライフが対戦相手${opJa(c.operator)}`;
    case 'DURING_PHASE': {
      const phaseJaMap: Record<string, string> = { MAIN: 'メイン', ATTACK_SIGNI_OP: '対戦相手のアタック', ATTACK: 'アタック' };
      return `${(c.phases || []).map((p: string) => phaseJaMap[p] ?? p).join('/')}フェイズの間`;
    }
    case 'THIS_CARD_IN_LOCATION': return `このカードが${c.location}にある`;
    case 'THIS_CARD_IN_CENTER_ZONE': return 'このシグニが中央ゾーンにある';
    case 'THIS_CARD_IS_DOWN': return 'このシグニがダウンしている';
    case 'THIS_CARD_IS_UP': return 'このシグニがアップ状態';
    case 'CENTER_LRIG_IS_UP': return 'あなたのセンタールリグがアップ状態';
    case 'THIS_CARD_IS_ARMORED': return 'このシグニが血晶武装状態';
    case 'THIS_CARD_IS_AWAKENED': return 'このシグニが覚醒状態';
    case 'ALL_FIELD_SIGNI_MATCH': {
      const cls = c.filter?.isDisona ? '《ディソナアイコン》'
        : c.filter?.story ? `＜${c.filter.story}＞`
        : c.filter?.cardName ? `《${c.filter.cardName}》`
        : filterJa(c.filter);
      return `${ownerJa(c.owner)}場にあるすべてのシグニが${cls}`;
    }
    case 'THIS_CARD_IS_ACCED': return 'このシグニに【アクセ】が付いている';
    case 'THIS_CARD_HAS_UNDER': return 'このシグニの下にカードがある';
    case 'IS_DRIVE_STATE': return 'このシグニがドライブ状態';
    case 'TURN_HAND_DISCARD_GTE': return `このターン手札を${numJa(c.value)}枚以上捨てている`;
    case 'ACTIVATED_DISCARD_COUNT_GTE': return `直前の起動コストで${numJa(c.value)}枚以上捨てた`;
    case 'OPP_LIFE_CRASH_EVENT_GTE': return `相手ライフを同時に${numJa(c.value)}枚以上クラッシュした`;
    case 'HAS_BOND': return `${c.cardName ? '「' + c.cardName + '」' : 'このカード'}との絆を獲得している`;
    case 'OPPONENT_NOT_PAID': return '対戦相手が任意コストを支払わなかった';
    case 'SELF_OPTIONAL_EFFECT_TAKEN': return '自分が任意効果を実行した';
    case 'NOT_PLAYED_NON_DISSONA_SPELL_THIS_TURN': return 'このターン《ディソナ》以外のスペルを使用していない';
    case 'LAST_PROCESSED_LEVEL_SUM_EQ': return `直前に処理したシグニのレベル合計が${numJa(c.value)}`;
    case 'TRASHED_DISTINCT_LEVELS_GTE': return `この方法でそれぞれレベルの異なるシグニが${numJa(c.count)}体トラッシュに置かれた`;
    case 'TRASHED_STORY_COUNT_GTE': return `この方法で${numJa(c.count)}体の＜${c.story}＞のシグニがトラッシュに置かれた`;
    case 'LAST_PROCESSED_POWER_GTE': return `直前に選んだシグニのパワー${c.addDelta ? `（+${c.addDelta}後）` : ''}が${numJa(c.value)}以上`;
    case 'LAST_PROCESSED_MATCHES': return `それが${filterJa(c.filter)}${c.filter?.isResona ? 'レゾナ' : (c.filter?.cardType ?? 'カード') === 'シグニ' ? 'シグニ' : (c.filter?.cardType ?? 'カード')}${c.minCount && c.minCount > 1 ? numJa(c.minCount) + '枚以上' : ''}`;
    case 'ENERGY_TRASH_COLOR_COUNT_GTE': return `この方法で指定色のカードが${numJa(c.value)}枚以上トラッシュに置かれた`;
    case 'BEAT_CONDITION': return `あなたの【ビート】が${c.condText ?? ''}`;
    case 'COND_STUB': return `[条件STUB:${c.raw ?? ''}]`;
    // ── ActiveCondition（CONTINUOUS の activeCondition）系 ──
    case 'COUNT_THRESHOLD': {
      const loc = ({ hand: '手札', trash: 'トラッシュ', energy: 'エナ', deck: 'デッキ', life_cloth: 'ライフ', lrig_deck: 'ルリグデッキ', lrig_trash: 'ルリグトラッシュ' } as Record<string, string>)[c.location] ?? c.location;
      return c.color
        ? `${ownerJa(c.owner)}${loc}に${c.color}のカードが${numJa(c.value)}枚${opJa(c.operator)}`
        : `${ownerJa(c.owner)}${loc}が${numJa(c.value)}枚${opJa(c.operator)}`;
    }
    case 'SELF_POWER_THRESHOLD': return `このシグニのパワーが${numJa(c.value)}${opJa(c.operator)}`;
    case 'ENERGY_COLOR_TYPES': return `${ownerJa(c.owner)}エナゾーンにあるカードが持つ色が${numJa(c.value)}種類${opJa(c.operator)}`;
    // diff = 自分 − 相手（符号付き）。gte のみ使用＝「自分が相手よりN枚以上多い」（相手が多い場合は不成立）
    case 'HAND_DIFF': return `あなたの手札が対戦相手より${numJa(c.value)}枚${opJa(c.operator)}多い`;
    case 'ENA_DIFF': return `あなたのエナが対戦相手より${numJa(c.value)}枚${opJa(c.operator)}多い`;
    case 'EICHI_LEVEL_SUM': return `英知（＜英知＞シグニのレベル合計）が${numJa(c.value)}${opJa(c.operator)}`;
    case 'VIRUS_COUNT': return `${ownerJa(c.owner)}場の【ウィルス】が${numJa(c.value)}${opJa(c.operator)}`;
    case 'SELF_HAS_KEYWORD': return `このシグニが【${c.keyword}】を持っている`;
    case 'IS_SELF_ARMORED': return 'このシグニが血晶武装状態';
    case 'IS_SELF_ACCED': return 'このシグニに【アクセ】が付いている';
    case 'IS_SELF_ACCE_CARD': return 'このカードが【アクセ】として付いている';
    case 'IS_SELF_CHARMED': return 'このシグニに【チャーム】が付いている';
    case 'IS_SELF_AWAKENED': return 'このシグニが覚醒状態';
    case 'IS_SELF_IN_CENTER_ZONE': return 'このシグニが中央ゾーンにある';
    default: return `[条件:${c.type}]`;
  }
}

function actionJa(a?: Action, effectType?: string): string {
  if (!a) return '';
  switch (a.type) {
    case 'DRAW': return a.untilHandCount !== undefined
      ? `${ownerJa(a.owner)}手札が${a.untilHandCount}枚より少ない場合、その差の分だけカードを引く`
      : `${ownerJa(a.owner)}カードを${numJa(a.count)}枚引く`;
    case 'GAIN_COIN': return `${ownerJa(a.owner)}コインを${numJa(a.count ?? 1)}枚得る`;
    case 'DRAW_PER_FIELD_COUNT': return `${ownerJa(a.countOwner)}場の${filterJa(a.countFilter)}シグニ1体につきカードを${a.drawPerUnit}枚引く`;
    case 'ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT': return `${ownerJa(a.countOwner)}場の${filterJa(a.countFilter)}シグニ1体につきデッキの一番上のカードを${a.chargePerUnit}枚エナゾーンに置く`;
    case 'BANISH': return a.opponentSelects
      ? `対戦相手は自分の${filterJa(a.target?.filter)}シグニ${a.target?.count === 'ALL' ? 'すべて' : `${a.target?.count ?? 1}体`}を選んでバニッシュする`
      : `${targetJa(a.target)}をバニッシュする${a.optional ? '（してもよい）' : ''}`;
    case 'BOUNCE': return `${targetJa(a.target)}を手札に戻す${a.optional ? '（してもよい）' : ''}${a.opponentSelects && a.target?.owner === 'opponent' ? '（相手が選ぶ）' : ''}`;
    case 'SEND_TO_ENERGY': return `${targetJa(a.target)}をエナゾーンに置く${a.optional ? '（してもよい）' : ''}`;
    // ATTACH_ACCE: シグニを別シグニの【アクセ】にする。fromHand=手札から（デコレ）／省略時=エナゾーンから（アクセクラフト）
    case 'ATTACH_ACCE': {
      const srcJaAA = a.fromHand ? '手札' : 'エナゾーン';
      const acceFilJaAA = a.signiFilter ? filterJa(a.signiFilter) : '';
      const hostFilJaAA = a.targetFilter ? filterJa(a.targetFilter) : '';
      return `${srcJaAA}から${acceFilJaAA}シグニ1枚を、あなたの場の${hostFilJaAA}シグニ1体の【アクセ】にする`;
    }
    // BLOOD_CRYSTAL_ARMOR: シグニ1体を血晶武装する（指定領域から同名カードをそのシグニの下に置き血晶武装状態にする）
    case 'BLOOD_CRYSTAL_ARMOR': {
      const zoneJaBCA: Record<string, string> = { hand: '手札', trash: 'トラッシュ', deck: 'デッキ', energy: 'エナゾーン' };
      const srcBCA = (Array.isArray(a.source) ? a.source : [a.source]).map((s: string) => zoneJaBCA[s] ?? s).filter(Boolean).join('／') || '手札';
      const tgtBCA = a.target ? targetJa(a.target, 'シグニ') : 'あなたのシグニ1体';
      return `${tgtBCA}を血晶武装［${srcBCA}］する（${srcBCA}からそれと同名のカード${a.count ?? 1}枚をそのシグニの下に置き、血晶武装状態にする）`;
    }
    case 'TRASH': {
      const t = a.target;
      const u = t?.type === 'HAND_CARD' ? '手札' : t?.type === 'ENERGY_CARD' ? 'エナ' : t?.type === 'DECK_CARD' ? 'デッキの上からカード' : '';
      if (t?.type === 'SIGNI') return `${targetJa(t)}をトラッシュに置く${a.opponentSelects && t?.owner === 'opponent' ? '（相手が選ぶ）' : ''}`;
      // 手札/エナの「誰が選ぶか」を明示（見ないでランダム / 自分が見て選ぶ / 相手が選ぶ）。
      // count:'ALL'（すべて捨てる）は選択の余地がないため明示しない。
      const who = t?.count === 'ALL'
        ? ''
        : a.opponentSelects && t?.owner === 'opponent'
        ? '（相手が選ぶ）'
        : t?.type === 'HAND_CARD' && t?.owner === 'opponent'
        ? (t.blind ? '（見ないでランダム）' : t.actingPlayerSelects ? '（自分が見て選ぶ）' : '（相手が選ぶ）')
        : '';
      const cnt = t?.count === 'ALL' ? 'すべて' : `${t?.count}枚${t?.upToCount ? 'まで' : ''}`;
      return `${ownerJa(t?.owner)}${filterJa(t?.filter)}${u}を${cnt}トラッシュに置く${t?.thisCardOnly ? '（このカード）' : ''}${who}${a.optional ? '（してもよい）' : ''}`;
    }
    case 'POWER_MODIFY': {
      const pmSubj = a.targetsTriggerSource ? 'それ（トリガー元シグニ）' : a.targetsLastProcessed ? 'それ' : a.target?.filter?.acceHost ? 'これにアクセされているシグニ' : a.target?.filter?.thisCardOnly ? 'このシグニ' : targetJa(a.target, 'シグニ', a.excludeSelf);
      if (a.deltaFromOppPowerDecrease) return `${pmSubj}のパワーを減った値と同じだけ＋する`;
      return `${pmSubj}のパワーを${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta)}する${a.duration === 'UNTIL_OPP_TURN_END' ? '（次の相手ターン終了時まで）' : ''}`;
    }
    case 'POWER_SET': {
      // CONTINUOUS の POWER_SET で count≠ALL は engine 上「このシグニのみ」に解決される（effectEngine 参照）
      const thisOnly = effectType === 'CONTINUOUS' && a.target?.count !== 'ALL'
        && (a.target?.owner === 'self' || a.target?.owner === 'any');
      const tgt = thisOnly ? 'このシグニの基本パワー' : `${targetJa(a.target)}のパワー`;
      return `${tgt}を${a.value}にする`;
    }
    case 'POWER_MODIFY_PER_HAND_COUNT': {
      const dHand = a.deltaPerCard ?? a.delta ?? 0;
      return `${targetJa(a.target)}のパワーを${ownerJa(a.handOwner)}手札1枚につき${dHand >= 0 ? '＋' : '－'}${Math.abs(dHand)}する`;
    }
    case 'FREEZE': return `${targetJa(a.target)}を${a.down ? 'ダウンして凍結する' : '凍結する'}`;  // down:true のときのみダウンも行う
    case 'DOWN': return `${targetJa(a.target)}をダウンする${a.optional ? '（してもよい）' : ''}`;
    case 'PREVENT_NEXT_DAMAGE': return a.damageSource
      ? `このターン、次にあなたが${a.damageSource === 'lrig' ? 'ルリグ' : 'シグニ'}によってダメージを受ける場合、代わりにダメージを受けない`
      : `このターン、次の${a.count ?? 1}回のダメージを受けない`;
    case 'REPLACE_NEXT_DAMAGE_WITH_MILL':
      return `このターン、次にあなたが${a.damageSource ? (a.damageSource === 'lrig' ? 'ルリグ' : 'シグニ') + 'によって' : ''}ダメージを受ける場合、代わりにあなたのデッキの上からカードを${a.millCount}枚トラッシュに置く`;
    case 'EXILE': return `${targetJa(a.target)}をゲームから除外する`;
    case 'UP': return `${a.targetsTriggerSource ? 'それ（トリガー元シグニ）' : targetJa(a.target)}をアップする`;
    case 'ENERGY_CHARGE': {
      // target 形式（デッキ/トラッシュ/手札/場のカードをエナゾーンへ）。全カードが target 形式
      if (a.target?.type === 'DECK_CARD') return `${ownerJa(a.target.owner)}デッキの上から${numJa(a.target.count)}枚をエナゾーンに置く`;
      if (a.target) return `${targetJa(a.target)}を対象とし、それらをエナゾーンに置く`;
      return `${ownerJa(a.owner)}デッキから${numJa(a.count)}枚エナチャージする`;
    }
    case 'ENERGY_CHARGE_FROM_DECK': return `${ownerJa(a.owner)}デッキの上から${numJa(a.count)}枚をエナゾーンに置く`;
    case 'ADD_TO_LIFE': {
      if (typeof a.count === 'object' && a.count?.$ref === 'last_processed_count') {
        return `トラッシュに置いたシグニ1体につき${ownerJa(a.owner)}デッキの一番上から1枚をライフクロスに加える`;
      }
      return a.fromHand ? `手札を${numJa(a.count)}枚選んでライフクロスに加える` : `${ownerJa(a.owner)}デッキの${a.fromTop ? '一番上' : ''}から${numJa(a.count)}枚をライフクロスに加える`;
    }
    case 'ADD_TO_FIELD':
      // 「このシグニをトラッシュから場に出す」自己蘇生（thisCardOnly source）
      if (a.source?.filter?.thisCardOnly && a.source?.type === 'TRASH_CARD')
        return `このシグニをトラッシュから${a.asDown ? 'ダウン状態で' : ''}場に出す${a.optional ? '（してもよい）' : ''}`;
      return a.source ? `${targetJa(a.source)}をコストを支払わず${a.asDown ? 'ダウン状態で' : 'に'}場に出す${a.optional ? '（してもよい）' : ''}` : (a.cardName ? `クラフト/トークンの《${a.cardName}》を場に出す` : '直前に選んだカードを場に出す');
    case 'BLOCK_ACTION': {
      if (a.actionId === 'ON_PLAY_ABILITY') return 'その【出】能力は発動しない';
      if (a.actionId === 'FORCE_PLACE_FRONT') return '対戦相手がシグニを配置する場合、可能ならばこのシグニの正面に配置しなければならない';
      const ownerWord = a.target?.owner === 'opponent' ? '対戦相手' : a.target?.owner === 'self' ? 'あなた' : '';
      const untilPre = a.until === 'END_OF_TURN' ? 'このターン、' : a.until === 'NEXT_TURN' ? '次のターンの間、' : '';
      // 完成文型（主語/肯定否定が特殊＝テンプレートを使わず直接返す）。許可系（〜できる）含む。
      const fullMap: Record<string, string> = {
        IGNORE_LRIG_TYPE: `${ownerWord}はレベル５のシグニの限定条件を無視して場に出すことができる`,
        ACCE_LIMIT_2: 'このシグニには２枚まで【アクセ】を付けることができる',
        ACCE_LIMIT_99: 'このシグニには好きな枚数の【アクセ】を付けることができる',
        ENERGY_PHASE: `${ownerWord}は自分のエナフェイズをスキップする`,
        SET_LEVEL_1: `${untilPre}対象のシグニの基本レベルを１にする`,
        NEGATE_NEXT_SIGNI_ATTACK: `${untilPre}次に対戦相手のシグニがアタックしたとき、そのアタックを無効にする`,
      };
      if (fullMap[a.actionId]) return fullMap[a.actionId];
      // 制限文型（主語＝owner±シグニ、述語＝「〜できない」）
      const predMap: Record<string, string> = {
        ATTACK: 'アタックできない',
        GUARD: 'ガードできない',
        GROW: 'グロウできない',
        USE_SPELL: 'スペルを使用できない',
        USE_ARTS: 'アーツを使用できない',
        ARTS_AND_SPELL: 'アーツとスペルを使用できない',
        USE_ARTS_EXCEPT_OPP_TURN: '対戦相手のターン以外でアーツを使用できない',
        SIGNI_ACTIVATED_ABILITY: '場にあるシグニの【起】能力を使用できない',
        GUARD_MAX_LV2: 'レベル２以下のシグニで【ガード】ができない',
        GUARD_MAX_LV1: 'レベル１以下のシグニで【ガード】ができない',
        DRAW_LIMIT_1: 'ドローフェイズにカードを１枚しか引くことができない',
        DRAW_OUTSIDE_DRAW_PHASE: '自分のターンの間、グロウフェイズとドローフェイズ以外でカードを引いたり手札に加えることができない',
        ARTS_LIMIT_1: '各ターンに一度しかアーツを使用できない',
        USE_SPELL_COST_0: 'コストの合計が０のスペルを使用できない',
        PLAY_SIGNI_POWER_12000_OR_MORE: '手札からパワー12000以上のシグニを場に出せない',
        PLAY_SIGNI_NOT_FROM_HAND: '自身の効果によって手札以外からシグニを場に出せない',
        SIGNI_ATTACK_STEP: 'シグニでアタックできない',
        SIGNI_ATTACK_PHASE: 'シグニでアタックできない',
        LRIG_ATTACK_STEP: 'ルリグでアタックできない',
        SELF_SIGNI_TRASH: 'カードの効果を除き、自分でシグニを場からトラッシュに置けない（リムーブできない）',
        DRAW: 'カードを引けない',
        ENERGY: 'エナチャージできない',
        USE_ACT: '【起】能力を使用できない',
        SIGNI_ATTACK: 'シグニでアタックできない',
      };
      const pred = predMap[a.actionId] ?? `「${a.actionId}」を行えない`;
      const subj = a.target?.type === 'SIGNI'
        ? `${ownerWord ? ownerWord + 'の' : ''}シグニ`
        : (ownerWord || 'すべてのプレイヤー');
      return `${untilPre}${subj}は${pred}`;
    }
    case 'LOOK_AND_REORDER': {
      const src = a.source?.owner === 'opponent' ? '対戦相手の' : 'あなたの';
      const loc = a.source?.location === 'hand' ? '手札' : 'デッキの上';
      const cntJa = a.count === 99 ? '' : numJa(a.count) + '枚';
      if (a.destination?.position === 'split_top_bottom') {
        return `${src}${loc}${cntJa}を見て、好きな枚数を好きな順番でデッキの一番上に置き、残りを好きな順番でデッキの一番下に置く`;
      }
      // destination（行き先）を原文どおり描画する。reorder＝「好きな順番で〜に置く/戻す」。
      const dest = a.destination;
      const destJa = dest?.location === 'deck'
        ? (dest.position === 'bottom' ? '好きな順番でデッキの一番下に置く'
         : dest.position === 'top' ? '好きな順番でデッキの一番上に戻す'
         : '好きな順番でデッキに戻す')
        : dest?.location === 'life_cloth' ? '好きな順番でライフクロスの上に置く'
        : '';
      // canTrash＝「不要なカードをトラッシュに置き、残りを〜」（trashして残りを行き先へ）。
      if (a.reorder && destJa) {
        const trashJa = a.canTrash ? 'その中から不要なカードをトラッシュに置き、残りを' : '';
        return `${src}${loc}から${cntJa}を見て、${trashJa}${destJa}`;
      }
      // reorder無し／行き先不明＝見るだけ（canTrash は補助注記）
      return `${src}${loc}${cntJa}を見る${a.canTrash ? '（不要札はトラッシュに置いてもよい）' : ''}`;
    }
    case 'MILL':
      if (a.countIsLastProcessedLevelSum) return `この方法で場に出たシグニのレベル1につき${ownerJa(a.owner)}デッキの上からカードを1枚トラッシュに置く`;
      return `${ownerJa(a.owner)}デッキの上から${numJa(a.count)}枚トラッシュに置く`;
    case 'LIFE_CRASH': return a.triggerBurst === false
      ? `${ownerJa(a.owner)}ライフクロスを${numJa(a.count)}枚トラッシュに置く（バースト不発）${a.conditional ? '（そうした場合）' : ''}`
      : `${ownerJa(a.owner)}ライフクロスを${numJa(a.count)}枚クラッシュする${a.conditional ? '（そうした場合）' : ''}`;
    case 'TRANSFER_TO_HAND': return `${targetJa(a.source)}を手札に加える`;
    case 'TRANSFER_TO_DECK':
      if (a.destination === 'lrig_deck') return `${targetJa(a.source)}をルリグデッキに戻す`;
      return a.shuffle
        ? `${targetJa(a.source)}をデッキに加えてシャッフルする`
        : `${targetJa(a.source)}をデッキの${a.position === 'bottom' ? '一番下' : '上'}に置く`;
    case 'ADD_CRAFT_TO_LRIG_DECK':
      return `${ownerJa(a.owner)}ルリグデッキに《${a.cardName}》${numJa(a.count)}枚を加える`;
    case 'PLACE_LRIGS_UNDER_CENTER':
      return `${ownerJa(a.owner)}ルリグトラッシュからすべてのルリグをこのカードの下に置く`;
    case 'ADD_TO_HAND': return `${targetJa(a.target)}を手札に加える`;
    case 'SEARCH': {
      // cardType フィルタを名詞に反映（「カード」だとスペルも引けるように誤読されるため）
      const ct = a.filter?.cardType;
      const noun = ct ? ([] as string[]).concat(ct).join('か') : 'カード';
      // then（SEQUENCE）に REVEAL/ADD_TO_HAND があれば「公開し手札に加える」を反映
      const thenSteps = a.then?.type === 'SEQUENCE' ? (a.then.steps ?? []) : (a.then ? [a.then] : []);
      const reveal = thenSteps.some((s: any) => s?.type === 'REVEAL') ? '公開し' : '';
      const dest = thenSteps.some((s: any) => s?.type === 'ADD_TO_HAND') ? '手札に加える'
        : thenSteps.some((s: any) => s?.type === 'ADD_TO_FIELD') ? '場に出す'
        : thenSteps.some((s: any) => s?.type === 'TRASH') ? 'トラッシュに置く'
        : thenSteps.some((s: any) => s?.type === 'ADD_TO_ENERGY' || s?.type === 'ENERGY_CHARGE') ? 'エナゾーンに置く'
        : '処理する';
      const maxJa = typeof a.maxCount === 'object'
        ? (a.maxCount?.$ref === 'last_processed_count' ? 'この方法でバニッシュ／トラッシュした数と同じ枚数の' : '')
        : (a.maxCount ? a.maxCount + '枚まで' : '');
      return `${ownerJa(a.from?.owner)}デッキから${maxJa}${filterJa(a.filter)}${noun}を探して${reveal}${dest}${a.afterSearch ? '（その後シャッフル）' : ''}`;
    }
    case 'GRANT_KEYWORD': {
      const durJa = a.duration === 'UNTIL_END_OF_TURN' ? '（ターン終了時まで）'
        : a.duration === 'NEXT_TURN' ? '（次のあなたのターンの間）'
        : a.duration === 'UNTIL_OPP_TURN_END' ? '（次の相手ターン終了時まで）' : '';
      // ランサー:N → 「ランサー（パワーN以下のシグニ）」（hasKeyword は 'ランサー:' プレフィックスで検出）
      const kw = typeof a.keyword === 'string' && a.keyword.startsWith('ランサー:')
        ? `ランサー（パワー${a.keyword.slice('ランサー:'.length)}以下のシグニ）` : a.keyword;
      // thisCardOnly: このシグニ自身が持つキーワード（「このシグニは【X】を持つ」）
      if (a.target?.filter?.thisCardOnly) return `このシグニは【${kw}】を持つ${durJa}`;
      // targetsLastProcessed:「それ」= 直前に選択/処理したシグニへ付与
      if (a.targetsLastProcessed) return `それは【${kw}】を得る${durJa}`;
      // targetsTriggerSource:「それ（トリガー元シグニ）」へ付与
      if (a.targetsTriggerSource) return `それ（トリガー元シグニ）は【${kw}】を得る${durJa}`;
      return `${targetJa(a.target)}に【${kw}】を与える${durJa}`;
    }
    case 'GRANT_EFFECT': {
      const durJaGE = a.duration === 'UNTIL_END_OF_TURN' ? '（ターン終了時まで）'
        : a.duration === 'NEXT_TURN' ? '（次のあなたのターンの間）'
        : a.duration === 'UNTIL_OPP_TURN_END' ? '（次の相手ターン終了時まで）' : '';
      const subjGE = a.targetsLastProcessed ? 'それ'
        : a.target?.filter?.thisCardOnly ? 'このシグニ'
        : targetJa(a.target);
      const bodyGE = a.effect ? effJa(a.effect) : (a.rawText ?? '');
      return `${subjGE}は『${bodyGE}』を得る${durJaGE}`;
    }
    case 'REVEAL_DECK_TOP': return `${ownerJa(a.owner)}デッキの上からカードを${numJa(a.count)}枚公開する`;
    case 'TRASH_REVEALED': return '公開したカードをトラッシュに置く';
    case 'INSTALL_DELAYED_TRIGGER': {
      // 「このターン、…したとき、…」遅延条件トリガーの設置（B3）
      // ON_REFRESH（WX11-024）：「対戦相手が次にリフレッシュをした場合、その後で…」
      if (a.trigger?.timing === 'ON_REFRESH') {
        const whoIDT = a.trigger?.refreshedOwner === 'opponent' ? '対戦相手'
          : a.trigger?.refreshedOwner === 'self' ? 'あなた' : 'いずれかのプレイヤー';
        const effIDT = a.effect?.type === 'FORCE_END_TURN' ? 'このターンを終了する' : actionJa(a.effect);
        return `このターン、${whoIDT}が次にリフレッシュをした場合、その後で${effIDT}`;
      }
      const cf = a.trigger?.crasherFilter;
      const subjIDT = cf
        ? `あなたの${cf.color ? [].concat(cf.color).join('・') + 'の' : ''}${cf.story ? '＜' + [].concat(cf.story).join('・') + '＞の' : ''}${cf.cardClass ? '＜' + [].concat(cf.cardClass).join('・') + '＞の' : ''}シグニが`
        : '';
      const trigJaIDT = a.trigger?.timing === 'ON_OPP_LIFE_CRASHED'
        ? '対戦相手のライフクロス1枚をクラッシュしたとき'
        : (timingJa[a.trigger?.timing] ?? a.trigger?.timing ?? '');
      return `このターン、${subjIDT}${trigJaIDT}、${actionJa(a.effect)}`;
    }
    case 'REMOVE_ABILITIES': return `${a.target?.thisCardOnly ? 'このシグニ' : targetJa(a.target)}は能力を失い、新たに得られない${a.frontOfSelf ? '（正面）' : ''}${a.until === 'UNTIL_END_OF_TURN' ? '（ターン終了時まで）' : ''}`;
    case 'GRANT_PROTECTION': {
      // CONTINUOUS の self/any count≠ALL（filter/subjectFilterなし）は engine 上「このシグニのみ」に解決される
      const protThisOnly = effectType === 'CONTINUOUS' && !a.subjectFilter && a.target
        && a.target.count !== 'ALL' && !a.target.filter
        && (a.target.owner === 'self' || a.target.owner === 'any');
      const subject = protThisOnly ? 'このシグニ'
        : a.target ? targetJa(a.target) : filterJa(a.subjectFilter) + 'シグニ';
      if (a.fromAll && a.exceptSource) {
        const exceptOwner = ownerJa(a.exceptSource.sourceOwner);
        return `${subject}は${exceptOwner}${a.exceptSource.sourceType}以外からの効果を受けない`;
      }
      const fromArr: string[] = a.from ?? [];
      const srcTypes = ['ルリグ', 'シグニ', 'スペル', 'アーツ'];
      const srcTokens = fromArr.filter(f => srcTypes.includes(f));
      // ソース種別（ルリグ/シグニ等）の効果耐性 →「対戦相手の、ルリグとシグニの効果を受けない」
      if (srcTokens.length > 0) {
        return `${subject}は${ownerJa(a.sourceOwner)}、${srcTokens.join('と')}の効果を受けない`;
      }
      if (fromArr.includes('any')) {
        return `${subject}は${ownerJa(a.sourceOwner)}効果を受けない`;
      }
      // 軸トークン（BANISH/BOUNCE/DOWN）→「対戦相手の効果によってバニッシュされない」等
      // bySourceType 指定時は発生源種別を明示（「対戦相手のシグニの効果によってバニッシュされない」）
      const axisJa: Record<string, string> = { BANISH: 'バニッシュされ', BOUNCE: '手札に戻され', DOWN: 'ダウンし', FREEZE: '凍結され', POWER_MODIFY: 'パワーを増減され' };
      const axes = fromArr.filter(f => axisJa[f] !== undefined || !srcTypes.includes(f)).map(f => axisJa[f] ?? (f + 'され'));
      const srcQ = a.bySourceType ? `${a.bySourceType}の` : '';
      return `${subject}は${ownerJa(a.sourceOwner)}${srcQ}効果によって${axes.join('・')}ない`;
    }
    case 'GRANT_FIELD_SHADOW': return `${filterJa(a.filter)}${ownerJa(a.targetOwner)}シグニは【${a.keyword}】を得る`;
    case 'GRANT_FIELD_SIGNI_ABILITY': return a.thisCardOnly
      ? `このシグニは『${(a.abilities || []).map(effJa).join(' / ')}』を得る`
      : `${ownerJa(a.targetOwner)}${filterJa(a.filter)}シグニは『${(a.abilities || []).map(effJa).join(' / ')}』を得る`;
    case 'GRANT_SOUL_HOST_ABILITY': return `このカードが【ソウル】として付いている${filterJa(a.filter)}シグニは『${(a.abilities || []).map(effJa).join(' / ')}』を得る`;
    case 'SEQUENCE': {
      if (!a.steps || a.steps.length === 0) return '何もしない';
      // DO_THREE_THINGS が先頭のSEQUENCEは、その1STUBが原文「N つを行う。①②③」全体を表現し、
      // 後続 step は parser の冗長な再パース（②③の consequence を重複描画）なので先頭のみ描画する。
      if (a.steps[0]?.type === 'STUB' && a.steps[0]?.id === 'DO_THREE_THINGS') {
        return actionJa(a.steps[0]);
      }
      // 空文字ステップ（engine が no-op スキップする説明テキスト系STUB等）は結合から除外する。
      const pairs = a.steps.map((s: any) => ({ step: s, part: actionJa(s) as string })).filter((p: any) => p.part !== '');
      if (pairs.length === 0) return '何もしない';
      return pairs.reduce((acc: string, { step, part }: any, i: number) => {
        if (i === 0) return part;
        // IS_MY_TURN の CONDITIONAL は「そうした場合」で始まるので「そして」は不要
        if (step?.condition?.type === 'IS_MY_TURN' || part.startsWith('そうした場合')) {
          return acc + '。' + part;
        }
        return acc + '。そして' + part;
      }, '');
    }
    case 'CHOOSE': {
      // 原文「以下の[N]つから[M]つ（まで）を選ぶ。①…②…」に合わせる（N=from_count）。区切りは規約の「 / 」。
      const chOpts = (a.choices || []).map((c: any) => actionJa(c.action)).filter((s: string) => s !== '');
      const totalCh = a.from_count ?? (a.choices?.length ?? chOpts.length);
      const cntCh = a.upTo ? `${numJa(a.choose_count)}つまで選ぶ` : `${numJa(a.choose_count)}つを選ぶ`;
      return `以下の${numJa(totalCh)}つから${cntCh}【${chOpts.join(' / ')}】`;
    }
    case 'CONDITIONAL': {
      // IS_MY_TURN は「そうした場合」マーカーとして使われる
      if (a.condition?.type === 'IS_MY_TURN') {
        return `そうした場合、${actionJa(a.then)}`;
      }
      return `${condJa(a.condition)}なら、${actionJa(a.then)}${a.else ? `、そうでなければ${actionJa(a.else)}` : ''}`;
    }
    case 'BANISH_SUBSTITUTE': {
      const sc = a.substituteCost ?? {};
      // cost は「て形」で終える（「トラッシュに置いて」等）→ 末尾に「もよい」を付ける
      const cost = sc.discardSpell ? `手札からスペルを${sc.discardSpell}枚捨てて`
        : sc.trashStackSpell ? `このシグニの下からスペル${sc.trashStackSpell}枚をトラッシュに置いて`
        : sc.powerReduction ? `このシグニのパワーを－${sc.powerReduction}して` : '';
      return `${targetJa(a.trigger)}がバニッシュされる場合、代わりに${cost}もよい`;
    }
    case 'LOOK_PICK_CHAIN': {
      const destVerb = (t: string) => t === 'hand' ? '手札に加え' : t === 'energy' ? 'エナゾーンに置き' : t === 'field' ? '場に出し' : t === 'beat' ? '【ビート】にし' : 'トラッシュに置き';
      const stageJa = (s: any) => `${s.sharesClassWithPrev ? 'そのシグニと共通するクラスを持つ' : ''}${filterJa(s.filter)}${s.pickNoun ?? 'シグニ'}を${numJa(s.pickCount)}枚まで${destVerb(s.then)}`;
      const remJa = a.remainder?.location === 'trash' ? '残りをトラッシュに置く'
        : a.remainder?.position === 'top' ? '残りをデッキの上に戻す'
        : '残りを好きな順番でデッキの一番下に置く';
      return `${ownerJa(a.owner)}デッキの上からカードを${numJa(a.revealCount)}枚見る。その中から${(a.stages || []).map(stageJa).join('、')}、${remJa}`;
    }
    case 'REVEAL_AND_PICK': {
      const rapOwner = a.owner ?? a.from?.owner;
      const rapCnt = a.revealCount ?? a.count;
      const rapFilter = a.filter ?? a.pickFilter;
      const pickN = a.pickCount === 'ALL' ? 'すべて' : `${numJa(a.pickCount ?? 1)}枚${a.pickUpTo ? 'まで' : ''}`;
      const filterStr = rapFilter ? filterJa(rapFilter) + (a.pickNoun ?? 'シグニ') : 'カード';
      const revealJa = `${ownerJa(rapOwner)}デッキ${rapCnt ? '上' + numJa(rapCnt) + '枚' : ''}を公開し`;
      // 残り（remainder）の行き先
      const rem = a.remainder;
      const remJa = !rem ? ''
        : rem.location === 'trash' ? '、残りをトラッシュに置く'
        : rem.location === 'deck'
          ? (rem.position === 'bottom' ? '、残りをデッキの一番下に置く' : '、残りをデッキの上に戻す')
          : '、残りを戻す';
      // 配置系（公開カードを手札/場/エナ/トラッシュ等へ）＝「その中から[filter]を[pickN][動詞]」
      const placeVerb =
        a.handOrField ? '手札に加えるか場に出す'
        : (a.then?.type === 'ADD_TO_HAND' || a.then?.type === 'TRANSFER_TO_HAND') ? '手札に加える'
        : a.then?.type === 'ADD_TO_FIELD' ? '場に出す'
        : a.then?.type === 'ADD_TO_ENERGY' ? 'エナゾーンに置く'
        : a.then?.type === 'TRASH' ? 'トラッシュに置く'
        : a.then?.type === 'BANISH' ? 'バニッシュする'
        : !a.then ? (a.pickTo === 'field' ? '場に出す' : a.pickTo === 'hand' ? '手札に加える' : null)
        : null;
      if (placeVerb) return `${revealJa}、その中から${filterStr}を${pickN}${placeVerb}${remJa}`;
      // 別効果系（公開カードが条件）＝「それが[filter]の場合、[then]」。1枚公開時は残り句を省く（原文も省く）。
      if (a.then) {
        const condRem = (rapCnt && rapCnt > 1) ? remJa : '';
        return `${revealJa}、それが${filterStr}の場合、${actionJa(a.then)}${condRem}`;
      }
      return `${revealJa}、その中から${filterStr}を${pickN}処理する${remJa}`;
    }
    case 'REARRANGE_SIGNI': return a.swap ? `${targetJa(a.target)}とこのシグニの場所を入れ替える${a.optional ? '（してもよい）' : ''}` : `${targetJa(a.target)}を好きなように配置し直す${a.optional ? '（してもよい）' : ''}`;
    case 'CHARM_PROTECTION':
      return `あなたの${filterJa(a.signiFilter)}シグニ1体がバニッシュされる場合、代わりにそのシグニに付いている【チャーム】1枚をトラッシュに置いて${a.optional ? 'もよい' : '置く'}`;
    case 'ATTACH_CHARM': {
      // TRASH_CARD + thisCardOnly:「このカードを【チャーム】にする」（効果元自身。WX04-102）
      const thisCardCharm = a.charm?.type === 'TRASH_CARD' && a.charm.filter?.thisCardOnly;
      const charmJa = thisCardCharm ? 'このカード'
        : a.charm?.type === 'DECK_CARD' ? `${ownerJa(a.charm?.owner)}デッキの一番上のカード`
        : a.charm?.type === 'TRASH_CARD' ? `${ownerJa(a.charm?.owner)}トラッシュから${filterJa(a.charm.filter)}カード1枚`
        : a.charm?.type === 'HAND_CARD' ? `${ownerJa(a.charm?.owner)}手札から${filterJa(a.charm.filter)}カード1枚`
        : `${ownerJa(a.charm?.owner)}カード`;
      const toJa = a.to?.filter?.thisCardOnly ? 'このシグニ' : `${ownerJa(a.to?.owner)}${filterJa(a.to?.filter)}シグニ1体`;
      return `${charmJa}を${toJa}の【チャーム】にする${a.optional ? '（してもよい）' : ''}`;
    }
    case 'SET_BASE_LEVEL': {
      const thisOnlySBL = a.target?.count !== 'ALL' && (a.target?.owner === 'self' || !a.target?.owner);
      return `${a.until === 'END_OF_TURN' ? 'ターン終了時まで、' : ''}${thisOnlySBL ? 'このシグニ' : targetJa(a.target)}の基本レベルを${a.value}にする`;
    }
    case 'REVEAL_UNTIL_TO_HAND': {
      const restJa = a.restDest === 'trash' ? '残りをトラッシュに置く'
        : a.restDest === 'deck_bottom_shuffled' ? '公開した他のカードをシャッフルしてデッキの一番下に置く'
        : '公開した他のカードをデッキの一番下に置く';
      return `${ownerJa(a.owner)}デッキを上から${a.revealClass ? `＜${a.revealClass}＞の` : ''}シグニがめくれるまで公開し、そのシグニを手札に加える。そして${restJa}`;
    }
    case 'REVEAL_UNTIL_TO_FIELD':
      return `${ownerJa(a.owner)}デッキを上から${a.revealClass ? `＜${a.revealClass}＞の` : ''}シグニがめくれるまで公開し、そのシグニを場に出し、残りをトラッシュに置く（場に出せないシグニはトラッシュへ）。これを${a.repeat}回繰り返す`;
    case 'NEGATE_ATTACK': return `${a.target?.type === 'CENTER_LRIG_OR_SIGNI' ? `${ownerJa(a.target.owner)}ルリグかシグニ${a.target.count}体を対象とし、このターンそれがアタックしたとき` : 'そのアタックがあったとき'}${a.escapeDiscard ? `、${a.target?.owner === 'opponent' ? '対戦相手' : 'あなた'}が手札を${a.escapeDiscard}枚捨てないかぎり` : ''}そのアタックを無効にする`;
    case 'COUNTER_SPELL': return `スペル${a.maxCost != null ? '（コスト' + a.maxCost + '以下）' : ''}の効果を打ち消す`;
    case 'SHUFFLE_DECK': return `${ownerJa(a.owner)}デッキをシャッフルする`;
    case 'EQUALIZE_ENERGY': return `${a.owner ? ownerJa(a.owner) : '各プレイヤーの'}エナゾーンのカードが${a.targetCount}枚になるようにトラッシュに置く`;
    case 'FORCE_SIGNI_ATTACK': return `${ownerJa(a.target?.owner)}シグニは可能ならアタックする`;
    case 'COST_REDUCTION': {
      const red = Array.isArray(a.reduction) && a.reduction.length > 0
        ? a.reduction.map((e: any) => `《${e.color}×${e.count}》`).join('')
        : 'コスト';
      const costKind = a.isGrowCost ? 'グロウコスト' : 'コスト';
      const tgt = `${a.color ? a.color + 'の' : ''}${a.targetCardType ?? 'カード'}`;
      return `あなたが使用する${tgt}の${costKind}は${red}減る`;
    }
    case 'GROW_FREE': return a.levelFilter === 'same'
      ? 'あなたのセンタールリグと同じレベルのルリグ1枚をルリグデッキからグロウコストを支払わずグロウする'
      : 'コストを支払わずにグロウする';
    case 'MUTUAL_DISCARD_AND_DRAW': return a.drawMax
      ? 'あなたと対戦相手は手札をすべて捨て、捨てられた枚数のうち最も大きい数に等しい枚数を双方が引く'
      : 'あなたと対戦相手は手札をすべて捨てる';
    case 'MOVE_TO_ENERGY':
    case 'TRANSFER_TO_ENERGY': return `${targetJa(a.source ?? a.target)}をエナゾーンに置く`;
    case 'REMOVE_CHARM': return `${ownerJa(a.targetOwner)}シグニのチャームを${a.count === 'ALL' ? 'すべて' : a.count}外す`;
    case 'CONDITIONAL_DISCARD': return `${condJa(a.condition)}なら、${actionJa(a.then)}`;
    case 'POWER_MODIFY_PER_TRASH_COUNT': {
      // 「対象のパワーを〈trashOwner〉のトラッシュにある〈countFilter〉シグニ〈unitSize〉枚につき±Nする」
      const d = a.deltaPerUnit ?? 0;
      const unit = a.unitSize ?? 1;
      const cf = filterJa(a.countFilter);
      const who = a.trashOwner === 'both' ? '各プレイヤーの' : ownerJa(a.trashOwner);
      // 数える対象は countFilter.cardType で決まる（cardType 無し＝「カード」／スペル等はその語）
      const ct = a.countFilter?.cardType;
      const noun = ct == null ? 'カード' : ([] as string[]).concat(ct).join('か');
      const per = a.countByVariety ? `${noun}の種類${unit > 1 ? `${unit}` : '1'}つ` : `${noun}${unit > 1 ? `${unit}` : '1'}枚`;
      return `${targetJa(a.target, 'シグニ', a.excludeSelf)}のパワーを${who}トラッシュにある${cf}${per}につき${d >= 0 ? '＋' : '－'}${Math.abs(d)}する`;
    }
    case 'POWER_MODIFY_PER_LIFE_COUNT': {
      const d = a.deltaPerLife ?? a.deltaPerUnit ?? 0;
      return `${targetJa(a.target, 'シグニ')}のパワーを${ownerJa(a.lifeOwner)}ライフクロス1枚につき${d >= 0 ? '＋' : '－'}${Math.abs(d)}する`;
    }
    case 'POWER_MODIFY_PER_STACK': {
      const d = a.deltaPerCard ?? a.deltaPerUnit ?? 0;
      return `${targetJa(a.target, 'シグニ')}のパワーをこのシグニの下にあるカード1枚につき${d >= 0 ? '＋' : '－'}${Math.abs(d)}する`;
    }
    case 'POWER_MODIFY_PER_FIELD': {
      // 「対象のパワーを〈countOwner〉の場の〈countFilter〉シグニ1体につき±Nする」
      const d = a.deltaPerUnit ?? a.delta ?? 0;
      const cf = filterJa(a.countFilter);
      return `${targetJa(a.target, 'シグニ', a.excludeSelf)}のパワーを${ownerJa(a.countOwner)}場の${cf}シグニ1体につき${d >= 0 ? '＋' : '－'}${Math.abs(d)}する`;
    }
    case 'POWER_MODIFY_PER_LEVEL_SUM': {
      // 「対象のパワーを〈countOwner〉の場の〈countFilter〉シグニのレベル1につき±Nする」
      // excludeSelf は対象（target）ではなくカウント対象（場の他シグニ）にかかる → countFilter 側に「他の」を出す
      // CONTINUOUS は engine 上「このシグニのみ」に解決される（effectEngine 参照）
      const d = a.deltaPerLevel ?? 0;
      const cf = filterJa({ ...a.countFilter, excludeSelf: a.excludeSelf || a.countFilter?.excludeSelf });
      const thisOnly = effectType === 'CONTINUOUS' && a.target?.count !== 'ALL'
        && (a.target?.owner === 'self' || a.target?.owner === 'any');
      const tgt = thisOnly ? 'このシグニ' : targetJa(a.target, 'シグニ');
      return `${tgt}のパワーを${ownerJa(a.countOwner)}場の${cf}シグニのレベル1につき${d >= 0 ? '＋' : '－'}${Math.abs(d)}する`;
    }
    case 'POWER_MODIFY_PER_LRIG_LEVEL':
    case 'POWER_MODIFY_PER_ENERGY':
    case 'POWER_MODIFY_PER_CHARM':
    case 'POWER_MODIFY_PER_DECK_COUNT':
    case 'POWER_MODIFY_PER_ENERGY_COLOR':
    case 'POWER_MODIFY_PER_VIRUS_COUNT': {
      const perJaMap: Record<string, string> = {
        POWER_MODIFY_PER_LRIG_LEVEL: 'センタールリグのレベル',
        POWER_MODIFY_PER_ENERGY: 'エナゾーンのカード枚数',
        POWER_MODIFY_PER_CHARM: '【チャーム】の枚数',
        POWER_MODIFY_PER_DECK_COUNT: 'デッキの枚数',
        POWER_MODIFY_PER_ENERGY_COLOR: 'エナゾーンの色の種類数',
        POWER_MODIFY_PER_VIRUS_COUNT: '【ウィルス】の数',
      };
      // POWER_MODIFY_PER_CHARM で「この方法でトラッシュに置いた」変種は原文どおりに描く
      const per = (a.type === 'POWER_MODIFY_PER_CHARM' && a.sourceLocation === 'trashed_this_effect')
        ? 'この方法でトラッシュに置いた【チャーム】の枚数'
        : (perJaMap[a.type] ?? a.type.replace('POWER_MODIFY_PER_', '') + '数');
      const d = a.deltaPerUnit ?? a.deltaPerLevel ?? a.deltaPerLife ?? a.deltaPerCharm ?? a.deltaPerCard ?? a.deltaPerVirus ?? a.delta ?? a.deltaPerColor ?? 0;
      // count!=='ALL' かつ self/any =「このシグニ」（常時自己強化）
      const thisOnlyPC = a.target?.count !== 'ALL' && (a.target?.owner === 'self' || a.target?.owner === 'any');
      const tgtPC = thisOnlyPC ? 'このシグニ' : targetJa(a.target);
      return `${tgtPC}のパワーを${per}に応じて${d >= 0 ? '＋' : '－'}${Math.abs(d)}ずつ変更する`;
    }
    case 'PLAY_FREE': {
      const srcLoc: Record<string, string> = {
        lrig_deck: 'ルリグデッキ', hand: '手札',
        opp_hand: '対戦相手の手札', opp_trash: '対戦相手のトラッシュ',
      };
      const from = typeof a.source === 'string' ? (srcLoc[a.source] ?? a.source) : targetJa(a.source ?? a.target);
      const noun = a.filter?.cardType ? ([] as string[]).concat(a.filter.cardType).join('か') : 'カード';
      const timingClause = a.useTimingIncludes ? `使用タイミングに《${a.useTimingIncludes}アイコン》を含む` : '';
      const costLim = a.costThreshold != null ? `コストの合計が${a.costThreshold}以下の` : '';
      const restr = a.ignoreRestrictions ? '（限定条件を無視して）' : '';
      return `${from}から${timingClause}${costLim}${filterJa(a.filter)}${noun}1枚を${restr}コストを支払わずに使用する`;
    }
    case 'PLAY_FREE_FROM_TRASH': return 'トラッシュからコストを支払わずに場に出す';
    case 'BANISH_REDIRECT': return '対戦相手のシグニのバニッシュ先をトラッシュに変更する';
    case 'COST_INCREASE': {
      const inc = Array.isArray(a.amount) && a.amount.length > 0
        ? a.amount.map((e: any) => `《${e.color}×${e.count}》`).join('')
        : 'コスト';
      const when = a.duration === 'NEXT_OPP_TURN' ? '次の対戦相手のターンの間、' : '';
      return `${when}${ownerJa(a.targetOwner)}が使用する${a.targetCardType ?? 'カード'}のコストは${inc}増える`;
    }
    case 'PREVENT_DAMAGE': return 'ダメージを無効にする';
    case 'LEVEL_MODIFY': return `${targetJa(a.target)}のレベルを${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta ?? 0)}する`;
    case 'FORCE_END_TURN': return 'ターンを終了する';
    case 'POWER_MULTIPLY': return `${targetJa(a.target)}のパワーを${a.factor ?? ''}倍にする`;
    case 'POWER_FLIP': return `${targetJa(a.target)}のパワーの増減を反転する`;
    case 'POWER_MODIFY_BY_TARGET_LEVEL': {
      const dTL = a.deltaPerLevel ?? 0;
      return `${targetJa(a.target)}のパワーをそれのレベル1につき${dTL >= 0 ? '＋' : '－'}${Math.abs(dTL)}する`;
    }
    case 'POWER_MODIFY_PER_TRASHED_LEVEL': {
      const dTr = a.deltaPerLevel ?? 0;
      return `${targetJa(a.target)}のパワーをこの方法でトラッシュに置いたシグニのレベル1につき${dTr >= 0 ? '＋' : '－'}${Math.abs(dTr)}する`;
    }
    case 'PLACE_UNDER_SIGNI': {
      // source は文字列の領域指定（deck_top/trash/energy/hand）＋ count ＋ 任意 filter
      const puLoc: Record<string, string> = { deck_top: 'あなたのデッキの上から', trash: 'あなたのトラッシュから', energy: 'あなたのエナゾーンから', hand: 'あなたの手札から' };
      const puFrom = puLoc[a.source] ?? `${a.source}から`;
      const puNoun = a.filter?.cardType && !Array.isArray(a.filter.cardType) ? a.filter.cardType : 'カード';
      const puCnt = a.count != null ? `${a.count}枚${a.upToCount ? 'まで' : ''}` : '';
      return `${puFrom}${a.filter ? filterJa(a.filter) : ''}${puNoun}を${puCnt}このシグニの下に置く`;
    }
    case 'TAKE_FROM_UNDER_SIGNI': return 'このシグニの下のカードを取る';
    case 'STACK_SPELL': return 'トラッシュからスペルをこのカードの下に置く';
    case 'REVEAL':
      if (a.source?.type === 'HAND_CARD') return `${ownerJa(a.source.owner)}手札から${filterJa(a.source.filter)}シグニ${a.source.count ?? 1}枚を公開する`;
      return `${ownerJa(a.owner)}デッキの上を公開する`;
    case 'GRANT_LRIG_ABILITY': return `${a.permanent ? 'このゲームの間、' : ''}あなたのセンタールリグは『${(a.abilities || []).map(effJa).join(' / ') || a.rawText || ''}』を得る`;
    case 'AWAKEN_SIGNI': return 'このシグニを覚醒状態にする';
    case 'GAIN_BOND': return a.source === 'declared'
      ? 'あなたのデッキからカード1枚を選び、そのカード名との絆を獲得する'
      : '直前に見つけたカード名との絆を獲得する';
    case 'GROW_COST_REDUCTION': return `あなたの次のグロウコストを${costJa({ energy: a.reduction })}減らす`;
    case 'LRIG_LIMIT_MODIFY': {
      const untilLLM = a.until === 'END_OF_TURN' ? '（ターン終了時まで）' : a.until === 'NEXT_TURN' ? '（次のターンの間）' : '';
      return `${ownerJa(a.owner)}センタールリグのリミットを${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta)}する${untilLLM}`;
    }
    case 'DISCARD_BOTH': return `あなたと対戦相手はそれぞれ手札を${a.count}枚捨てる`;
    case 'RECOLLECT_GATE': return `（リコレクト：ルリグトラッシュのアーツが${a.minArts}枚以上ある場合のみ以下を行う）`;
    case 'GRANT_ACCE_HOST_ABILITY': {
      const hostGAH = a.filter ? filterJa(a.filter) : '';
      const absGAH = (a.abilities || []).map(effJa).join(' / ');
      return `これに【アクセ】されている${hostGAH}シグニは『${absGAH}』を得る${a.byChoice ? '（装着時に1つ選ぶ）' : ''}`;
    }
    case 'PLACE_VIRUS': {
      const zonesPV = a.zoneCount === 'ALL' ? 'すべてのシグニゾーン' : `${a.zoneCount}つのシグニゾーン${a.upToZoneCount ? 'まで' : ''}`;
      if (a.fillToTotal !== undefined) return `${ownerJa(a.targetOwner)}場の【ウィルス】の合計が${a.fillToTotal}つになるように【ウィルス】を置く`;
      const pwPV = a.powerDeltaOnZone !== undefined ? `（そのゾーンのシグニのパワーを${a.powerDeltaOnZone >= 0 ? '＋' : '－'}${Math.abs(a.powerDeltaOnZone)}）` : '';
      return `${ownerJa(a.targetOwner)}${zonesPV}に【ウィルス】を${a.virusCount > 1 ? `${a.virusCount}つずつ` : ''}置く${pwPV}`;
    }
    case 'POWER_MODIFY_BY_SOURCE': return `${targetJa(a.target)}のパワーを効果元の${a.basis === 'level' ? 'レベル' : 'パワー'}×${a.multiplier}だけ変更する`;
    case 'LOOK_AT_DECK_AND_LIFE': return `${ownerJa(a.targetOwner)}デッキの上${a.mode === 'both' ? 'とライフクロスの上' : 'かライフクロスの上'}を見る`;
    case 'GRANT_SIGNI_ABOVE_ABILITY': return `このカードの上の${filterJa(a.filter)}シグニは『${(a.abilities || []).map(effJa).join(' / ')}』を得る`;
    case 'NAME_BAN': return `このゲームの間、${a.targetSelf ? 'あなた' : '対戦相手'}は同名のカードを使用できない`;
    case 'BLOCK_CARD_USE': return `このターン、対戦相手は《${a.cardName}》を使用できない`;
    case 'COST_SUBSTITUTE': return `${costJa({ energy: a.originalCost })}のコストを${costJa(a.substituteCost)}で支払って${a.optional ? 'もよい' : '支払う'}`;
    case 'VARIABLE_DISCARD_AND_DRAW': return `${ownerJa(a.owner)}手札を好きな枚数捨て、その枚数${a.drawBonus ? `＋${a.drawBonus}枚` : '分'}カードを引く`;
    case 'SELF_TRASH_PREVENT': return 'あなたは自分の効果ではこのシグニをトラッシュに置けない';
    case 'REVEAL_UNTIL_BANISH_SAME_LEVEL': return `＜${a.revealClass}＞のシグニがめくれるまでデッキの上を公開し、それと同じレベルの${ownerJa(a.banishOwner)}シグニ1体をバニッシュする（公開したカードはデッキの一番下に置く）`;
    case 'ENERGY_CHARGE_BY_FIELD_COUNT': return `${ownerJa(a.owner)}場のシグニの数${a.bonus ? `＋${a.bonus}` : ''}枚をデッキの上からエナゾーンに置く`;
    case 'COLOR_INHERIT': return `${ownerJa(a.owner)}エナゾーンのカードの色を、このシグニの色として追加で得る`;
    case 'FORCE_FRONT_SIGNI_ATTACK': return 'このシグニの正面のシグニは、可能ならアタックしなければならない';
    case 'UNKNOWN': return `【未実装/UNKNOWN：${a.text ?? a.raw ?? ''}】`;
    case 'STUB': {
      // 相手センタールリグ色による基本コスト軽減（支払い時 computeArtsEffectiveCost が適用＝実装済み）
      if (a.id === 'CONDITIONAL_CARD_COST_BY_OPP_LRIG') {
        return '相手センタールリグ色が条件を満たす場合は基本コストを軽減（支払い時に自動適用）';
      }
      if (a.id === 'PREVENT_DAMAGE_FROM_OPP_EFFECTS') return 'あなたは対戦相手の効果によってダメージを受けない';
      // アーツ/スペルの使用コスト改変句（ARTS_COST_REDUCTION_BY_EFFECT/BY_CENTER_LRIG）。
      // 軽減/増加量は支払い時に computeArtsEffectiveCost が原文 EffectText を再パースして算出する
      // ため JSON には数値が無い。逆翻訳は原文の「…使用コストは…減る/増える/になる」文を復元する。
      if (a.id === 'ARTS_COST_REDUCTION_BY_EFFECT' || a.id === 'ARTS_COST_REDUCTION_BY_CENTER_LRIG' || a.id === 'CONDITIONAL_ARTS_COST') {
        const costSents = currentCardText.split('。')
          .map(s => s.trim())
          .filter(s => /使用コスト/.test(s) && /(減る|減り|増える|増え[、]|になる)/.test(s));
        if (costSents.length > 0) return costSents.join('。');
        // 抽出不能（コスト色無視/エナコスト代替/グロウコスト/ライフ枚数条件等の別記述）は従来マーカーにフォールバック
      }
      // A2残4枚の誤パース是正で導入（虚偽の付与STUBの置換・原文を正直に表す）
      if (a.id === 'PLAY_MILLED_SIGNI_DELAYED_TRASH') return 'この方法でトラッシュに置かれたそのシグニを場に出す（ターン終了時、そのシグニを場からトラッシュに置く）';
      if (a.id === 'UNDER_CARD_AS_ENERGY_COST') return 'あなたのアタックフェイズの間、このシグニの下のカードをエナゾーンにあるかのようにトラッシュに置いてエナコストを支払える（この方法で1ターンに3つまで）';
      if (a.id === 'FLIP_SELF_FACE_DOWN_UP') return 'このシグニを裏向きにし、表向きにする';
      // N回目までアタック自動無効化（WX10-018/WX17-006/SP27-016）＝engine は原文の「一度目か二度目」等を
      // 実行時に読み取る（execStubPart3）。逆翻訳は原文の該当文をそのまま抽出して描画。
      if (a.id === 'NEGATE_NTH_ATTACK') {
        const nm = currentCardText.match(/この(?:ターン|ゲーム)[^。]*?度目[^。]*?アタックを無効にする/);
        if (nm) return nm[0];
      }
      // ガード喪失条件（WX12-025/034/036）＝ルリグ名がカードごとに異なるため原文から該当文を抽出
      if (a.id === 'GUARD_LOSS_UNLESS_LRIG') {
        const gl = currentCardText.match(/あなたのセンタールリグが＜[^＞]+＞でないかぎり、手札にあるこのシグニは【ガード】を失う/);
        if (gl) return gl[0];
      }
      // 付与引用（「…」の能力を得る）＝原文から引用能力を抽出して描画（テキスト検出型）。
      // 本物の付与カード（原文に「【自/常/起/出】…」を得る がある）は引用能力を表示、誤パース等で引用が無い場合は従来フォールバック。
      if (a.id === 'GRANT_QUOTED_AUTO_ABILITY' || a.id === 'GRANT_QUOTED_ABILITY') {
        const gm = currentCardText.match(/(ターン終了時まで、|このゲームの間、|次の対戦相手のターン終了時まで、)?(この(?:ルリグ|シグニ)|これ[^「『。]{0,20}?|あなたの[^「『。]{0,20}?)は[「『]([\s\S]+?)[」』]を得る/);
        if (gm && /【(?:自|常|起|出)/.test(gm[3])) {
          const dur = gm[1] ?? '';
          const subj = gm[2];
          const inner = gm[3].replace(/\s+/g, '');
          return `${dur}${subj}は「${inner}」を得る`;
        }
        // 後置型「…は（以下の能力を）得る。『…』」（引用が「得る」の後）
        const gm2 = currentCardText.match(/(それ|この(?:ルリグ|シグニ)|あなたの[^「『。]{0,30}?)は[^「『。]{0,12}以下の能力を得る。?(?:（[^）]*）)?\s*[「『]([\s\S]+?)[」』]/);
        if (gm2 && /【(?:自|常|起|出)/.test(gm2[2])) {
          const inner = gm2[2].replace(/\s+/g, '');
          return `${gm2[1]}は以下の能力を得る「${inner}」`;
        }
        // 引用が見つからない（誤パース／引用無し）＝従来フォールバック
        return '[STUB:引用された能力を付与する（原文参照）]';
      }
      if (a.id === 'GRANT_ABILITY_INNER_TEXT') return 'このカードに記載された継続能力を付与する（テキスト検出型。原文参照）';
      if (a.id === 'GUARD_EXTRA_COST_BY_OPP' || a.id === 'OPP_GUARD_COST_COLORLESS') return '対戦相手が【ガード】する際に追加コスト（無色エナ）を要求する';
      if (a.id === 'LEVEL_REFERENCE_OVERRIDE' || a.id === 'LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT') return 'レベル参照を上書きする（テキスト記載のレベルとして扱う）';
      if (a.id === 'POWER_MOD_BY_HAND_COUNT') return '手札N枚につき対戦相手のシグニのパワーを±する（テキスト記載の値）';
      if (a.id === 'DOUBLE_POWER_MINUS' || a.id === 'POWER_MOD_PER_OPPONENT_FIELD') return '対戦相手の場のシグニ数に応じてパワーを±する／パワーをN倍にする（テキスト記載）';
      if (a.id === 'BANISH_TO_LRIG_TRASH_INSTEAD') return 'このカードがバニッシュされる場合、代わりにルリグトラッシュに置く';
      if (a.id === 'DECLARE_COLOR') return '色（白/赤/青/緑/黒）を1つ宣言する';
      if (a.id === 'REPLACE_NEXT_OPP_REFRESH_MILL_LRIG') return '次に対戦相手が行うリフレッシュを「トラッシュをすべてデッキに加えてシャッフルし、ルリグデッキからカード1枚をルリグトラッシュに置く」に置き換える';
      if (a.id === 'TRASH_SIGNI_TO_BEAT') return 'トラッシュからシグニを【ビート】にする';
      if (a.id === 'INTERNAL_MOVE_TO_BEAT') return '直前に選んだシグニを【ビート】にする';
      if (a.id === 'TRASH_ALL_SIGNI_AND_KEY') return '対象プレイヤーのシグニすべてとキーをトラッシュ／ルリグトラッシュに置く';
      if (a.id === 'SPELL_COST_REDUCTION_BY_TRASH_COUNT' || a.id === 'SPECIFIC_CARD_COST_REDUCE') return 'トラッシュ枚数等に応じてスペル／特定カードの使用コストを軽減する';
      if (a.id === 'SIGNI_CANT_BOUNCE_FROM_FIELD') return 'このシグニは場から手札に戻らない';
      if (a.id === 'SUPPRESS_GAIN_ABILITY') return 'このターン、あなたのシグニは新たに能力を得られない';
      if (a.id === 'PREVENT_SIGNI_ABILITY_LOSS_BY_OPP') {
        // 保護対象の色（白/赤など）はカードで異なる＝原文から抽出して一致させる。
        const cm = currentCardText.match(/あなたの他の(?:(?:白|赤|青|緑|黒|無色)の)?シグニは対戦相手の効果によって能力を失わない/);
        return cm ? cm[0] : 'あなたの他のシグニは対戦相手の効果によって能力を失わない';
      }
      if (a.id === 'PREVENT_POWER_MINUS_BY_OPP') return '対戦相手の効果によって、このシグニのパワーは－（マイナス）されない';
      if (a.id === 'NEGATE_ATTACK_ON_TRIGGER') return 'そのアタックを無効にしてもよい';
      if (a.id === 'CHOOSE_SAME_OPTION_TWICE' || a.id === 'CHOOSE_SAME_OPTION_MULTIPLE') return '同じ選択肢を複数回選ぶ';
      if (a.id === 'INHERIT_OPP_LRIG_TYPE') return '対戦相手のセンタールリグのルリグタイプを得る';
      if (a.id === 'MULTI_ZONE_ATTACK') return '複数のシグニゾーンに対してアタックできる（アタック範囲の特殊ルール）';
      if (a.id === 'SET_ACCE_CHOICE') return '【アクセ】装着時に付与する能力を1つ選ぶ';
      if (a.id === 'GRANT_LEAVE_PLACE_PENDING') return 'シグニが場を離れたときに発動する配置能力を付与する（機構未実装・近似）';
      if (a.id === 'PLACE_LIMIT_UPPER') return 'あなたのルリグゾーンに【リミットアッパー】1つを置く';
      if (a.id === 'STEAL_OPP_TRASH_PUPPET') {
        const pp = (a as { puppetParams?: { count?: number; optional?: boolean; levelLteTrigger?: boolean } }).puppetParams;
        if (pp) {
          const n = pp.count ?? 1;
          const lvl = pp.levelLteTrigger ? 'そのシグニのレベル以下の' : '';
          const opt = pp.optional ? '出してもよい' : '出す';
          return `対戦相手のトラッシュから${lvl}シグニ${n}枚を対象とし、それを傀儡状態であなたの場に${opt}（離場時は持ち主のトラッシュへ）`;
        }
        return '対戦相手のトラッシュからシグニを傀儡状態であなたの場に出す（ベット時2枚／非ベット1枚。離場時は持ち主のトラッシュへ）';
      }
      if (a.id === 'DISRUPT_OPP_LRIG_UNDER_BY_TYPE') return '対戦相手のセンタールリグの下のカードを最大2枚、あなたのルリグデッキから同じルリグタイプのルリグ2枚をルリグトラッシュに置いてもよい。そうした場合、それらをルリグトラッシュに置く';
      if (a.id === 'GRANT_UNTAP_ON_ATTACK_TO_TEAM_LRIG') return 'あなたの＜さんばか＞のルリグ1体に「【自】《ターン1回》：このルリグがアタックしたとき、このルリグをアップする」を付与する（ターン終了時まで）※ルリグ対象grant未配線';
      if (a.id === 'FREE_GROW_NEXT_TURN') return '次のあなたのターンの間、あなたのグロウコストは《無×0》になる（実質フリーグロウ）';
      if (a.id === 'GROW_COST_ZERO') return 'あなたのグロウコストは《無×0》になる（実質フリーグロウ）';
      if (a.id === 'POWER_DOUBLE_ALL') return 'ターン終了時まで、あなたのすべてのシグニのパワーを2倍にする';
      if (a.id === 'BANISH_REDIRECT_POWER0_TRASH') return 'このターン、パワーが0以下のシグニがバニッシュされる場合、エナゾーンの代わりにトラッシュに置かれる';
      if (a.id === 'DOUBLE_POWER_MINUS_THIS_TURN') return 'このターン、あなたのシグニの効果で対戦相手のシグニのパワーが－される場合、代わりに2倍－される';
      // DISCARD_OR_PENALTY: 原文から「＜クラス＞/種別のカードを1枚捨てないかぎり手札をN枚捨てる」を復元
      if (a.id === 'DISCARD_OR_PENALTY') {
        const toHWdop = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const clsM = currentCardText.match(/手札から[<＜]([^>＞]+)[>＞]のシグニを１枚捨てないかぎり/);
        const typeM = !clsM ? currentCardText.match(/手札から(スペル|シグニ|アーツ)を１枚捨てないかぎり/) : null;
        const penM = currentCardText.match(/かぎり手札を([２-９\d]+)枚捨てる/);
        const n = penM ? parseInt(toHWdop(penM[1])) : 2;
        const subj = clsM ? `手札から＜${clsM[1]}＞のシグニを1枚` : typeM ? `手札から${typeM[1]}を1枚` : '手札から指定カードを1枚';
        return `あなたは${subj}捨てないかぎり手札を${n}枚捨てる`;
      }
      // OPTIONAL_COST 系: 「《色》を支払ってもよい」（effectExecutor が直後の CONDITIONAL(IS_MY_TURN) と結合して
      // 「支払う→効果発動 / スキップ」を生成する標準パターン。後続の「そうした場合、…」が効果本体）
      // OPTIONAL_TRASH_ENERGY_CLASS: エナゾーンから＜X＞のシグニN枚をトラッシュに置く任意コスト。
      // クラス/枚数はJSONに無く EffectText から解釈する（engine と同じ）ので原文から復元する。
      if (a.id === 'OPTIONAL_TRASH_ENERGY_CLASS') {
        // 「エナゾーンから＜X＞の(シグニ|カード)N枚をトラッシュ」句を優先マッチ（同カード内の別記述＝
        // 「エナから＜X＞のシグニ1枚を選び場に出す」等を誤マッチしないため。WX25-CP1-006 の②誤マッチ修正）。
        // 取れなければ従来の緩いマッチにフォールバック。種別(シグニ/カード)も原文どおり反映する。
        const m = currentCardText.match(/エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(シグニ|カード)([０-９\d]+)枚を?トラッシュ/)
          || currentCardText.match(/エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(シグニ|カード)([０-９\d]+)枚/);
        const cls = m?.[1] ? `＜${m[1]}＞の` : '';
        const kind = m?.[2] || 'シグニ';
        const n = m?.[3] ? numJa(parseInt(m[3].replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)))) : '1';
        return `あなたのエナゾーンから${cls}${kind}${n}枚をトラッシュに置いてもよい`;
      }
      // OPTIONAL_TRASH_SELF: 「このシグニを場からトラッシュに置いてもよい」（任意の自己犠牲。兄弟 CONDITIONAL が「そうした場合」）。
      if (a.id === 'OPTIONAL_TRASH_SELF') return 'このシグニを場からトラッシュに置いてもよい';
      // GRANT_TO_PLACED_SIGNI: 「この方法で場に出たシグニは…を得る」（value に原文を保持）。
      if (a.id === 'GRANT_TO_PLACED_SIGNI') return a.value ?? 'この方法で場に出たシグニは能力を得る';
      // CONDITIONAL_MULTI_CHOOSE_BY_CENTER（系）: 「以下のNつからMつ選ぶ①②③④」を実行時パースで実装する
      // STUB。decompiler は JSON に選択肢を持たないため、原文の選択肢をそのまま反映する（＝engine 挙動と一致）。
      if (a.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER' || a.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE') {
        const pm = currentCardText.match(/以下の([０-９\d]+)つから([０-９\d]+)つ(まで)?選ぶ/);
        const totalN = pm ? pm[1] : '';
        const pick = pm ? pm[2] : '1';
        const made = pm && pm[3] ? 'まで' : '';
        const enh = currentCardText.match(/代わりに([０-９\d]+)つ(?:まで)?選ぶ/);
        const segs = [...currentCardText.matchAll(/[①-⑨]([^①-⑨]*)/g)]
          .map(x => x[1].replace(/\s+/g, ' ').trim().replace(/(?:。|\s|-)+$/, ''));
        if (segs.length >= 2) return `以下の${totalN || segs.length}つから${pick}つ${made}${enh ? `（条件達成で${enh[1]}つまで）` : ''}選ぶ【${segs.join(' / ')}】`;
      }
      // OPTIONAL_DISCARD_HAND_CLASS: 手札から＜X＞のシグニN枚を任意で捨てる（クラス/枚数は EffectText から復元）
      if (a.id === 'OPTIONAL_DISCARD_HAND_CLASS') {
        const m = currentCardText.match(/手札から(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)を?([０-９\d]+)枚/);
        const cls = m?.[1] ? `＜${m[1]}＞の` : '';
        const n = m?.[2] ? numJa(parseInt(m[2].replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)))) : '1';
        return `あなたの手札から${cls}シグニ${n}枚を捨ててもよい`;
      }
      if (a.id === 'OPTIONAL_COST' || a.id === 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST') {
        // costText（エナ色以外の任意コスト句）が明示されていれば原文どおり描画（A3）
        if (a.costText) return a.costText;
        // コストスロットは「青|黒」（青か黒のいずれか）形式を許容 → 「《青》か《黒》」
        const costJaOC = (a.costColors ?? []).map((c: string) => c.split('|').map((x: string) => `《${x}》`).join('か')).join('')
          + (a.coinCost ? `《コイン》×${a.coinCost}` : '');
        return `${costJaOC || 'コスト'}を支払ってもよい`;
      }
      const burstExtra = a.id === 'GRANT_ALL_ZONE_LIFEBURST'
        ? `（全領域のカードに【ライフバースト】付与${a.burstAdditive ? '・既存バーストにも追加' : ''}${a.burstFilter ? '・対象' + filterJa(a.burstFilter) : ''}${a.burstAction ? '・効果=' + actionJa(a.burstAction) : ''}）`
        : '';
      const extra = `${burstExtra}${a.banishSubstitute ? ' ' + JSON.stringify(a.banishSubstitute) : ''}${a.costColors ? ' コスト' + a.costColors.join('') : ''}`;
      const allFieldLimitM = a.id.match(/^LIMIT_ALL_FIELD_(\d+)$/);
      if (allFieldLimitM) return `[STUB:すべてのプレイヤーはシグニを${allFieldLimitM[1]}体しか場に出せない（超過分はトラッシュ）${extra}]`;
      // COPY_LRIG_TRASH_ACTIVATED / INHERIT_LRIG_TRASH_ABILITIES: ルリグトラッシュのルリグの【起】能力を継承（BattleScreen のルリグメニューで実装済み）
      if (a.id === 'COPY_LRIG_TRASH_ACTIVATED' || a.id === 'INHERIT_LRIG_TRASH_ABILITIES') {
        return 'このルリグはあなたのルリグトラッシュにあるルリグの【起】能力を持つ';
      }
      // CHANGE_ALL_SIGNI_COLOR_TO_BLACK / FORCE_COLOR_BLACK: エナゾーン以外のシグニは黒になる（effectEngine collectFieldSigniExtraColors で実装済み）
      if (a.id === 'CHANGE_ALL_SIGNI_COLOR_TO_BLACK' || a.id === 'FORCE_COLOR_BLACK') {
        return 'エナゾーン以外の領域にあるシグニは黒になる';
      }
      // IGNORE_LRIG_RESTRICTION_ARTS: あなたが使用するアーツとスペルの限定条件は無視される（BattleScreen meetsRestriction で実装済み）
      if (a.id === 'IGNORE_LRIG_RESTRICTION_ARTS') {
        return 'あなたが使用するアーツとスペルの限定条件は無視される';
      }
      // LRIG_UNDER_TO_TRASH: センタールリグの下からN枚をルリグトラッシュへ（エクシード相当のゲート。置けない場合は以降スキップ）
      if (a.id === 'LRIG_UNDER_TO_TRASH') {
        return `あなたのセンタールリグの下からカード${a.value ?? '?'}枚をルリグトラッシュに置く（置けた場合のみ次へ）`;
      }
      // GAIN_SUBSCRIBER_COUNT: 登録者数をN万人得る（valueに万人の数値）
      if (a.id === 'GAIN_SUBSCRIBER_COUNT') {
        return a.value != null ? `登録者数を${a.value}万人得る` : '登録者数を得る';
      }
      // ADD_CARD_TO_LRIG_DECK_HIDDEN: 公開した候補レゾナのどちらか1枚を裏向きでルリグデッキへ（G039）
      if (a.id === 'ADD_CARD_TO_LRIG_DECK_HIDDEN') {
        return '原文の候補レゾナのどちらか1枚を裏向きでルリグデッキに加える（ゲーム外から生成）';
      }
      // DECLARE_NUMBER: 数字宣言（CHOOSE UIで1〜5を選択。declared_guard_restrict_level に保存＝実装済み）
      if (a.id === 'DRAW_AT_TURN_END') return `このターン終了時、あなたのカードを${a.value ?? 1}枚引く（このシグニが場になくても引く）`;
      if (a.id === 'DECLARE_NUMBER') return '数字1つを宣言する';
      // DECK_TOP_CHECK_LEVEL_HAND: デッキトップ公開→宣言レベルのシグニなら手札へ（execStubPart2 で実装済み）
      if (a.id === 'DECK_TOP_CHECK_LEVEL_HAND') {
        return 'あなたのデッキの一番上を公開し、それが宣言した数字と同じレベルを持つシグニである場合、それを手札に加える';
      }
      // 【トラップ】設置/操作 STUB群（B1）。engine は signi_traps ゾーン＋execStubPart2 で実装済み。
      // decompiler を原文の【トラップ】語彙で描画（原文クラスタ抽出＋canonicalフォールバック）。
      if (a.id === 'PLACE_TRAP_FROM_REVEALED') {
        const m = currentCardText.match(/その中から[^。]*?【トラップ】として[^。]*?設置[^。]*?(?:よい|する)/);
        return m ? m[0] : 'その中からカードを【トラップ】としてあなたのシグニゾーンに設置する';
      }
      if (a.id === 'PLACE_TRAP_OPTIONAL' || a.id === 'SET_HAND_CARD_AS_TRAP') {
        const m = currentCardText.match(/(?:あなたは)?(?:その(?:カード)?か、?)?(?:あなたの)?(?:手札|デッキの一番上)[^。]*?【トラップ】として[^。]*?設置[^。]*?(?:よい|する)/);
        return m ? m[0] : 'あなたの手札から1枚を【トラップ】としてあなたのシグニゾーンに設置してもよい';
      }
      if (a.id === 'ACTIVATE_TRAP' || a.id === 'ACTIVATE_TRAP_IN_FIELD') {
        const m = currentCardText.match(/あなたの【トラップ】[^。]*?表向きに[^。]*?(?:発動[^。]*?(?:させる|する)|シグニにする)/);
        return m ? m[0] : 'あなたの【トラップ】1つを対象とし、それを表向きにし《トラップアイコン》を発動させる';
      }
      if (a.id === 'TRAP_TO_HAND') {
        const m = currentCardText.match(/あなたの【トラップ】[^。]*?手札に(?:加える|戻す)[^。]*/);
        return m ? m[0] : 'あなたの【トラップ】を手札に加える';
      }
      if (a.id === 'SET_OPP_SIGNI_AS_TRAP') {
        const m = currentCardText.match(/対戦相手のシグニ[^。]*?【トラップ】として[^。]*?設置[^。]*?(?:よい|する)/);
        return m ? m[0] : '対戦相手のシグニ1体を対象とし、それを【トラップ】としてそのシグニゾーンに設置する';
      }
      if (a.id === 'TRAP_TO_SIGNI_IF_ZONE_EMPTY') {
        const m = currentCardText.match(/この【トラップ】[^。]*?シグニがない場合[^。]*?シグニにする/);
        return m ? m[0] : 'この【トラップ】と同じシグニゾーンにシグニがない場合、この【トラップ】を表向きにしてシグニにする';
      }
      if (a.id === 'TRAP_OP' || a.id === 'TRAP_OPERATION') {
        // テキスト駆動（設置/トラッシュ/手札の複合）。原文の【トラップ】設置を含む文を抽出（多段は近似）。
        const m = currentCardText.match(/[^。]*【トラップ】として[^。]*?設置[^。]*?(?:。|$)/);
        return m ? m[0].replace(/。$/, '') + '（【トラップ】操作）' : '【トラップ】を操作する（設置／トラッシュ／手札。原文参照）';
      }
      // engine が no-op スキップする説明テキスト系STUB（execStubPart1.ts と同一）は逆翻訳でも描画しない（空文字）。
      // SEQUENCE/CHOOSE 結合側で空文字ステップを除外する。
      if (a.id === 'RULE_REMINDER_TEXT' || a.id === 'USE_CONDITION_TEXT' || a.id === 'UNLIMITED_KEYS') return '';
      // 敗北/ルリグダメージ防止系STUB（engine実装済み＝prevent_defeat/prevent_lrig_damage フラグ）を原文の意味文で描画。
      // 生STUB（id露出）や `[STUB:〜フラグ]` を逆翻訳語彙に置換（条件・限定は周辺の activeCondition/CHOOSE 側で描画）。
      const preventDmgMap: Record<string, string> = {
        PREVENT_DEFEAT: 'このターン、あなたはゲームに敗北しない',
        PREVENT_DEFEAT_THIS_TURN: 'このターン、あなたはゲームに敗北しない',
        PREVENT_DEFEAT_UNTIL_NEXT_TURN: '次の対戦相手のターン終了時まで、あなたはゲームに敗北しない',
        PREVENT_LRIG_DAMAGE: 'あなたは対戦相手のルリグによってダメージを受けない',
        PREVENT_LRIG_DAMAGE_THIS_TURN: 'このターン、あなたは対戦相手のルリグによってダメージを受けない',
        PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN: '次のターンの間、あなたは対戦相手のルリグによってダメージを受けない',
        PREVENT_LOW_LEVEL_LRIG_DAMAGE: 'あなたは対戦相手のレベル２以下のルリグによってダメージを受けない',
        PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP: '対戦相手の効果によって、あなたはダメージを受けず、あなたのライフクロスは他の領域に移動しない',
      };
      if (preventDmgMap[a.id]) return preventDmgMap[a.id];
      // 保護系STUB（対戦相手の効果によって〜されない・engine実装済み）の原文意味文。条件/duration は周辺の activeCondition 側で描画。
      const preventProtectMap: Record<string, string> = {
        PREVENT_ABILITY_CHANGE_BY_OPP: 'あなたの＜古代兵器＞のシグニは対戦相手の効果によって、能力を失わず新たに能力を得られない',
        PREVENT_ABILITY_GAIN_BY_OPP: 'このシグニは対戦相手の効果によって新たに能力を得られない',
        PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP: 'あなたの他のシグニのパワーは対戦相手の効果によって－（マイナス）されない',
        PREVENT_BOUNCE_AND_DOWN_BY_OPP: 'このシグニは対戦相手の効果によって、手札に戻らずダウンしない',
        PREVENT_INFECTED_SIGNI_ACTIVATE: '対戦相手は感染状態のシグニの【起】能力を使用できない',
        PREVENT_LIFE_REFRESH_TRASH: 'あなたのライフクロスはリフレッシュによってトラッシュに移動しない',
        PREVENT_NON_FIELD_MOVE_BY_OPP: '場以外のあなたの領域にあるカードは、クラッシュ以外の対戦相手の効果によって他の領域に移動しない',
        PREVENT_OPP_POWER_PLUS: '対戦相手の【常】能力の効果によって、シグニのパワーは＋（プラス）されない',
        PREVENT_OPP_SIGNI_ABILITY_GAIN: '対戦相手のシグニは、対戦相手の効果によって新たに能力を得られない',
        PREVENT_SELF_MOVE_BY_OPP: 'このシグニは対戦相手の効果によって場から他の領域に移動しない',
        PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH: '対戦相手の効果はバニッシュ以外でこのシグニを場から移動させない',
        PREVENT_SIGNI_DOWN_BY_OPP: 'このターン、あなたのシグニは対戦相手の効果によってダウンしない',
        PREVENT_SIGNI_DOWN_BY_OPP_ALL: 'あなたの他のシグニは対戦相手の効果によってダウンしない',
        PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH: 'あなたのアタックフェイズの間、対戦相手の効果はバニッシュ以外であなたの＜宇宙＞のシグニを場から移動させない',
        PREVENT_OWN_ARTS_USE: 'このターン、あなたはアーツを使用できない',
        PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN: '次の対戦相手のターンの間、あなたが最初にダメージを受ける場合、代わりにダメージを受けない',
      };
      if (preventProtectMap[a.id]) return preventProtectMap[a.id];
      // 行動制限系STUB（CONTINUOUS「対戦相手は〜できない」・engine認識済み）の原文意味文。
      // 「あなた/対戦相手のターンの間」は activeCondition(TURN_OWNER) が別途前置描画するので本体のみ。
      const blockContinuousMap: Record<string, string> = {
        BLOCK_ALL_OPP_ACTIVATE_ABILITY: '対戦相手はすべての領域にあるシグニの【起】能力を使用できない',
        BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT: '対戦相手は自分のシグニの効果によってシグニを新たに場に出せない',
        BLOCK_OPP_DECK_TO_ENERGY: '対戦相手は自分の効果によってカードをデッキからエナゾーンに移動できない',
        BLOCK_COLORLESS_PLAY: 'あなたは無色のシグニを場に出せず、無色のスペルを使用できない',
        BLOCK_FRONT_SIGNI_ATTACK: '対戦相手は《無》を支払わないかぎり、このシグニの正面にあるシグニでアタックできない',
        BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT: '対戦相手はコストの合計が場にある【チャーム】の数以下のスペルを使用できない',
        BLOCK_NON_WHITE_SPELL: 'すべてのプレイヤーは白ではないスペルを使用できない',
        BLOCK_OPP_ENCORE_AND_BET: '対戦相手はアンコールとベットをできない',
      };
      if (blockContinuousMap[a.id]) return blockContinuousMap[a.id];
      // 能力/色 継承系STUB（CONTINUOUS・activeCondition なし・engine実装済み）の原文意味文。各1枚＝原文の該当文を丸写し。
      const grantUnderMap: Record<string, string> = {
        GRANT_UNDER_LRIG_ACTIVATE_ABILITY: 'このルリグはこのカードの下にあるルリグの【起】能力を持つ',
        GRANT_UNDER_LRIG_AUTO_ABILITY: 'このルリグはこのカードの下にあるルリグの【自】能力を持つ',
        GRANT_UNDER_SIGNI_ALL_ABILITIES: 'このシグニはこのカードの下にある《荒ぶる海洋 §ポセイドナ§》以外の＜天使＞のシグニの【常】と【自】と【起】の能力と、限定条件を得る',
        GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE: 'あなたのアタックフェイズの間、このシグニはこのカードの下にあるレベル３以下の黒の＜ウェポン＞のシグニの【自】能力を得る',
        GRANT_UNDER_SIGNI_CONSTANT_ABILITY: 'このシグニはこのカードの下にあるシグニの【常】の【英知】能力を得る',
        INHERIT_UNDER_SIGNI_COLOR: 'このシグニはこのカードの下にある＜天使＞のシグニが持つ色を得る',
        GAIN_LRIG_COLOR: 'このシグニはあなたの場にいるルリグが持つ色を得る',
        GAIN_ADDITIONAL_LRIG_TYPE: 'あなたのセンタールリグが＜タウィル＞か＜ウムル＞であるかぎり、それは追加で＜タウィル/ウムル＞を得る',
      };
      if (grantUnderMap[a.id]) return grantUnderMap[a.id];
      // 色変化系STUB（CONTINUOUS・activeCondition なし・engine実装済み・action STUB は各1枚）の原文意味文。
      const colorChangeMap: Record<string, string> = {
        CARDS_OUTSIDE_ENERGY_BECOME_WHITE: 'エナゾーン以外の領域にあるカードは白になる',
        ENERGY_NON_COLORLESS_ALL_COLORS: 'あなたのエナゾーンにある無色ではないカードはすべての色を持つ',
        CENTER_LRIG_COLOR_CHANGE_BLACK: 'あなたのセンタールリグは黒になる',
      };
      if (colorChangeMap[a.id]) return colorChangeMap[a.id];
      // カード名コピー系（COPY_LRIG_NAME_ABILITY・WX24-P4-011〜025/WX25-P3-028）＝
      // 「このルリグはルリグトラッシュにあるレベルNの＜X＞と同じカード名としても扱い、そのルリグの【自】能力を得る」。
      // ＜X＞のクラス・レベルはカードごとに異なるため currentCardText から原文文を抽出。
      if (a.id === 'COPY_LRIG_NAME_ABILITY') {
        const m = currentCardText.match(/このルリグはあなたのルリグトラッシュにある[^。]*?と同じカード名としても扱い[^。]*?能力を得る/);
        if (m) return m[0];
      }
      // シグニゾーン指定（DESIGNATE_SIGNI_ZONE・engine実装済み）＝「（シグニのない）（対戦相手の）シグニゾーン１つを指定する」。
      // 「シグニのない」「対戦相手の」前置はカードごとに異なるため currentCardText から抽出。
      if (a.id === 'DESIGNATE_SIGNI_ZONE') {
        const m = currentCardText.match(/(?:シグニのない)?(?:対戦相手の)?シグニゾーン[０-９\d]*つを指定する/);
        if (m) return m[0];
      }
      // レゾナ場出し（SUMMON_RESONA_FROM_LRIG_DECK・engine実装済み）＝
      // 「あなたのルリグデッキから（…の）レゾナ（N枚）を（その）出現条件を無視して場に出す」。
      // レゾナの条件（レベル/色/クラス/枚数）はカードごとに異なるため currentCardText から抽出。
      if (a.id === 'SUMMON_RESONA_FROM_LRIG_DECK') {
        const m = currentCardText.match(/あなたのルリグデッキから[^。：]*?レゾナ[^。：]*?出現条件を無視して場に出す/);
        if (m) return m[0];
      }
      // 歌のカケラ使用（SONG_FRAGMENT・engine実装済み）＝コスト句は別途描画され、本体は
      // 「このルリグ/シグニはそのカードの【歌のカケラ】を使用する」。currentCardText から抽出。
      if (a.id === 'SONG_FRAGMENT') {
        const m = currentCardText.match(/この(?:ルリグ|シグニ)はそのカードの【歌のカケラ】を使用する/);
        if (m) return m[0];
        return 'このルリグはそのカードの【歌のカケラ】を使用する';
      }
      // アップシグニをダウン（DOWN_UP_SIGNI_AND_CHOOSE・engine実装済み）＝コスト軽減素材として
      // 「あなたのアップ状態の＜クラス＞（か＜クラス＞）/色のシグニを好きな数/N体までダウンしてもよい」。
      // クラス/色/枚数はカードごとに異なるため currentCardText から抽出。
      if (a.id === 'DOWN_UP_SIGNI_AND_CHOOSE') {
        const m = currentCardText.match(/(?:あなたの)?アップ状態の[^。]*?のシグニを[^。]*?ダウン(?:してもよい|する)/);
        if (m) return m[0];
        return 'あなたのアップ状態のシグニを好きな数ダウンしてもよい';
      }
      // ターン終了時トラッシュ（TRASH_AT_TURN_END・engine実装済み）＝この方法で場に出したシグニを
      // 「ターン終了時、それ（ら）を場からトラッシュに置く」。単複はカードごとに異なるため currentCardText から抽出。
      if (a.id === 'TRASH_AT_TURN_END') {
        const m = currentCardText.match(/ターン終了時、それ[らも]?を(?:場から)?トラッシュに置く/);
        if (m) return m[0];
        return 'ターン終了時、それを場からトラッシュに置く';
      }
      // 色選択（CHOOSE_COLOR_FROM_LIST・engine実装済み）＝「エナゾーンにあるカードが持つ色から最大N色まで選ぶ」
      // または「白、赤、青、黒からNつを選ぶ」。表現がカードごとに異なるため currentCardText から抽出。
      if (a.id === 'CHOOSE_COLOR_FROM_LIST') {
        const m = currentCardText.match(/(?:あなたの)?エナゾーン[^。]*?色から[^。]*?選ぶ|[白赤青緑黒](?:、[白赤青緑黒])+から[^。]*?選ぶ/);
        if (m) return m[0];
        return '色を選ぶ';
      }
      // クラフトをルリグデッキへ（CRAFT_TO_LRIG_DECK/ADD_CRAFT_TO_LRIG_DECK・engine実装済み）＝
      // 「クラフトの《X》N枚をルリグデッキに加える」または「クラフトからN種類を…公開しルリグデッキに加える」。
      // クラフト名/枚数はカードごとに異なるため currentCardText から抽出。
      if (a.id === 'CRAFT_TO_LRIG_DECK' || a.id === 'ADD_CRAFT_TO_LRIG_DECK') {
        const m = currentCardText.match(/クラフト(?:の《[^》]*》|から)[^。]*?ルリグデッキに加える/);
        if (m) return m[0];
        return 'クラフトをルリグデッキに加える';
      }
      // サーバントZERO化（*_SERVANT_ZERO 系4id・engine実装済み）＝
      // 「（ターン終了時まで、）対戦相手の（すべての）シグニ（N体）を《サーバント ＺＥＲＯ》にする」。
      // 対象数/範囲/語順がカードごとに異なるため currentCardText から抽出（ベットコスト前置は除外）。
      if (a.id === 'SIGNI_SERVANT_ZERO' || a.id === 'MAKE_SERVANT_ZERO' ||
          a.id === 'MAKE_MULTI_SERVANT_ZERO' || a.id === 'ALL_OPP_SIGNI_SERVANT_ZERO') {
        const m = currentCardText.match(/(?:ターン終了時まで、)?対戦相手の(?:すべての)?シグニ[^。]*?《サーバント[　\s]*ＺＥＲＯ》にする/);
        if (m) return m[0];
        return 'ターン終了時まで、対戦相手のシグニを《サーバント　ＺＥＲＯ》にする';
      }
      // シード開花（SEED_BLOOM/SEED_BLOOM_OPTIONAL・engine実装済み）＝「（あなたの）【シード】（N枚/好きな枚数）を（対象とし）開花する」。
      // 対象数/語順がカードごとに異なるため currentCardText から【シード】を含む開花クレーズを抽出（コスト句 : はまたがない）。
      if (a.id === 'SEED_BLOOM' || a.id === 'SEED_BLOOM_OPTIONAL') {
        const m = currentCardText.match(/(?:あなたの)?[^。：]*【シード】[^。：]*?開花する/);
        if (m) return m[0];
        return 'あなたの【シード】を開花する';
      }
      // 公開からシード設置（PLACE_SEED_FROM_REVEALED・engine実装済み）＝LOOK/シャッフルは別描画され、
      // 本体は「その中からカードN枚を【シード】としてあなたのシグニゾーンに出す（してもよい）」。currentCardText から抽出。
      if (a.id === 'PLACE_SEED_FROM_REVEALED') {
        const m = currentCardText.match(/その中から[^。]*?【シード】として[^。]*?出(?:してもよい|す)/);
        if (m) return m[0];
        return 'その中からカードを【シード】としてあなたのシグニゾーンに出す';
      }
      // バリア獲得（GAIN_LRIG_BARRIER・engine実装済み）＝「【ルリグバリア】/【シグニバリア】N つを得る」。
      // バリア種別/個数がカードごとに異なるため currentCardText から抽出。
      if (a.id === 'GAIN_LRIG_BARRIER' || a.id === 'GAIN_SIGNI_BARRIER') {
        const m = currentCardText.match(/【(?:ルリグ|シグニ)バリア】[０-９\d]*つを得る/);
        if (m) return m[0];
        return a.id === 'GAIN_SIGNI_BARRIER' ? '【シグニバリア】１つを得る' : '【ルリグバリア】１つを得る';
      }
      // 全領域で色を失う（LOSE_COLOR_ALL_ZONES・CONTINUOUS・engine実装済み）＝
      // 「（あなたの場に＜X＞のルリグがN体いないかぎり、）このカードはすべての領域で色を失う」。
      // 条件は 【常】に前置描画されないため条件ごと currentCardText から抽出。
      if (a.id === 'LOSE_COLOR_ALL_ZONES') {
        const m = currentCardText.match(/(?:あなたの場に[^。]*?いないかぎり、)?このカードはすべての領域で色を失う/);
        if (m) return m[0];
        return 'このカードはすべての領域で色を失う';
      }
      // マジックボックスを開く（OPEN_MAGIC_BOX・engine実装済み）＝後続のバニッシュ等は別描画、本体は
      // 「（このシグニと同じシグニゾーンにある）【マジックボックス】N つを表向きにしトラッシュに置く（いてもよい）」。currentCardText から抽出。
      if (a.id === 'OPEN_MAGIC_BOX') {
        const m = currentCardText.match(/(?:このシグニと同じシグニゾーンにある)?【マジックボックス】[^。]*?表向きにしトラッシュに置(?:いてもよい|く)/);
        if (m) return m[0];
        return '【マジックボックス】１つを表向きにしトラッシュに置く';
      }
      // 相手トラッシュから使用（CAST_FROM_OPP_TRASH・engine実装済み）＝
      // 「対戦相手の（ルリグ）トラッシュから（アーツ/スペル）N枚を対象とし、…使用する（してもよい）」。
      // 使用先/条件はカードごとに異なるため currentCardText から抽出。非マッチ（別構造カード）は
      // フォールスルーして従来表示のまま（誤文を入れない）。
      if (a.id === 'CAST_FROM_OPP_TRASH') {
        const m = currentCardText.match(/対戦相手の(?:ルリグ)?トラッシュから[^。]*?使用(?:してもよい|する)/);
        if (m) return m[0];
      }
      // アクセにする（ACCE_FROM_HAND・engine実装済み）＝原文の表現は多様（エナ/手札/トラッシュ由来・
      // 対象数可変）だが共通末尾「…の【アクセ】にする」の文を currentCardText から抽出（1文＝1ACCE・句は。で区切られ
      // LOOK等の別アクションと重複しない）。非マッチはフォールスルーして従来表示のまま（誤文を入れない）。
      if (a.id === 'ACCE_FROM_HAND' || a.id === 'MULTI_ACCE_FROM_HAND') {
        const m = currentCardText.match(/[^。]*?の【アクセ】にする/);
        if (m) return m[0].replace(/^【[^】]*】[^：。]*：/, '');
      }
      // 複数処理をまとめて行う（DO_THREE_THINGS・engine実装済み＝原文の①②③④を動的パースして実行）＝
      // 「（以下の）N つを行う。①…②…③…（④…）」全体を currentCardText から抽出（。を跨ぐので末尾まで）。
      // BurstText の "-" 連結は末尾 replace で除去。SEQUENCE 先頭に来る場合は SEQUENCE 側で本STUBのみ描画。
      if (a.id === 'DO_THREE_THINGS') {
        const m = currentCardText.match(/以下の[０-９\d一二三四]+つを行う[\s\S]*/);
        if (m) return m[0].replace(/\s*-\s*$/, '').trim();
      }
      // 手札上限増加（HAND_SIZE_INCREASE・engine実装済み）＝「あなたの手札の枚数の上限はN増える。（X枚からY枚になる）」。
      if (a.id === 'HAND_SIZE_INCREASE') {
        const m = currentCardText.match(/あなたの手札の枚数の上限は[０-９\d]*増える(?:。（[０-９\d]+枚から[０-９\d]+枚になる）)?/);
        if (m) return m[0];
      }
      // 相手手札上限減少（REDUCE_OPP_HAND_LIMIT・engine実装済み）＝「対戦相手の手札の上限はN減る」。
      if (a.id === 'REDUCE_OPP_HAND_LIMIT') {
        const m = currentCardText.match(/対戦相手の手札の上限は[０-９\d]*減る/);
        if (m) return m[0];
      }
      // 追加ターン（GAIN_EXTRA_TURN・engine実装済み）＝「（あなた/対戦相手）はこのターンの次に、追加のNターンを得る」。
      if (a.id === 'GAIN_EXTRA_TURN') {
        const m = currentCardText.match(/(?:あなた|対戦相手)は?このターンの次に、追加の[０-９\d]*ターンを得る/);
        if (m) return m[0];
      }
      // 数字宣言してミル（DECLARE_NUMBER/DECLARE_NUMBER_RANGE・engine実装済み）＝
      // 「X～Yの数字１つを宣言する。（あなた/対戦相手の）デッキの上から（カードを）宣言した数字に等しい枚数…トラッシュに置く」。
      if (a.id === 'DECLARE_NUMBER' || a.id === 'DECLARE_NUMBER_RANGE') {
        const m = currentCardText.match(/[０-９\d]+～[０-９\d]+の数字１つを宣言する。[^。]*?宣言した数字に等しい枚数[^。]*?トラッシュに置く/);
        if (m) return m[0];
      }
      // シグニゾーンを消す（REMOVE_SIGNI_ZONE・engine実装済み）＝「（ターン終了時まで、）対戦相手のシグニゾーンN つを消す」。
      if (a.id === 'REMOVE_SIGNI_ZONE') {
        const m = currentCardText.match(/(?:ターン終了時まで、)?対戦相手のシグニゾーン[０-９\d]*つを消す/);
        if (m) return m[0];
      }
      // 効果の適用上限（EFFECT_LIMIT・engine実装済み・パワー修正等の注記）＝「この効果はN枚までしか適用されない」。
      if (a.id === 'EFFECT_LIMIT') {
        const m = currentCardText.match(/この効果は[０-９\d]+枚までしか適用されない/);
        if (m) return m[0];
      }
      // 2倍マイナス（DOUBLE_OWN_POWER_MINUS・engine実装済み）＝「（対象とし、）このターン、あなたの効果によってそれのパワーが－（マイナス）される場合、代わりに２倍－（マイナス）される」。
      if (a.id === 'DOUBLE_OWN_POWER_MINUS') {
        const m = currentCardText.match(/(?:対戦相手のシグニ[０-９\d]*体を対象とし、)?このターン、あなたの効果によってそれのパワーが－（マイナス）される場合、代わりに２倍－（マイナス）される/);
        if (m) return m[0];
      }
      // クラス変更（CLASS_CHANGE・engine実装済み）＝「シグニN体を対象とし、ターン終了時まで、それはクラスを失い、＜X＞を得る」。
      // fallback＝「ターン終了時まで、…（すべての…シグニ／それ）はクラスを失い、（＜X＞／宣言されたクラス）を得る」。
      if (a.id === 'CLASS_CHANGE') {
        const m = currentCardText.match(/シグニ[０-９\d]*体を対象とし、ターン終了時まで、それはクラスを失い、＜[^＞]+＞を得る/)
          ?? currentCardText.match(/ターン終了時まで、[^。]*?クラスを失い、(?:＜[^＞]+＞|宣言されたクラス)を得る/);
        if (m) return m[0];
      }
      // 場依存の使用コスト減（CONDITIONAL_COST_REDUCTION_BY_FIELD・engine実装済み）＝「あなたの場に…がある場合、このスペルの使用コストは…減る」。
      if (a.id === 'CONDITIONAL_COST_REDUCTION_BY_FIELD') {
        const m = currentCardText.match(/あなたの場に[^。]*?使用コストは[^。]*?減る/);
        if (m) return m[0];
      }
      // 全領域ライフバースト付与（GRANT_ALL_ZONE_LIFEBURST・engine実装済み）＝「あなたのすべての領域にある（…の）カードは【ライフバースト】…を持つ」。
      if (a.id === 'GRANT_ALL_ZONE_LIFEBURST') {
        const m = currentCardText.match(/あなたのすべての領域にある[^。]*?【ライフバースト】[^。]*?を持つ/);
        if (m) return m[0];
      }
      // アタッカー正面へ配置（MOVE_TO_ATTACKER_FRONT・engine実装済み）＝「（正面にシグニがない場合、）このシグニをアタックした（その）シグニの正面に配置してもよい」。
      if (a.id === 'MOVE_TO_ATTACKER_FRONT') {
        const m = currentCardText.match(/(?:[^。]*?正面にシグニがない場合、)?このシグニをアタックした(?:その)?シグニの正面に配置してもよい/);
        if (m) return m[0];
      }
      // コラボライバー（COLLAB・engine実装済み）＝【常】は「【ガード】する際…コラボしてもよい」（ガード代替）、
      // それ以外は「コラボライバーN人を呼ぶ」。同一カードに両方あるため effectType で分岐。
      if (a.id === 'COLLAB') {
        if (effectType === 'CONTINUOUS') {
          const mc = currentCardText.match(/あなたが【ガード】する際、[^。]*?コラボしてもよい/);
          if (mc) return mc[0];
        }
        const m = currentCardText.match(/コラボライバー[０-９\d一二三四]*人を呼ぶ/);
        if (m) return m[0];
      }
      // スペルを無償・限定無視で使用（PLAY_SPELL_FREE_IGNORE_RESTRICTION・engine実装済み）＝
      // 「（あなたの手札/対戦相手のトラッシュ/いずれかのプレイヤーのトラッシュ）から…スペル…コストを支払わずに限定条件を無視して使用する」。
      if (a.id === 'PLAY_SPELL_FREE_IGNORE_RESTRICTION') {
        const m = currentCardText.match(/(?:あなたの手札|対戦相手のトラッシュ|いずれかのプレイヤーのトラッシュ)から[^。]*?スペル[^。]*?限定条件を無視して使用する/);
        if (m) return m[0];
      }
      // 相手が選んで実行（OPP_*・standalone型・engine実装済み）＝「対戦相手は以下のN つから１つを選び、（あなた/対戦相手）はそれを行う。①…②…」。
      // 次の効果マーカー【 の手前まで抽出。宣言当てゲーム型（別構造）は非マッチでフォールスルー。
      if (a.id === 'OPP_DECLARE_CHOICE' || a.id === 'OPP_CHOOSE_EFFECT' || a.id === 'OPP_CHOOSES_FOR_YOU') {
        const m = currentCardText.match(/対戦相手は以下の[０-９\d一二三四]+つから[０-９\d一二]つを選び[^【]*/);
        if (m) return m[0].replace(/\s*-\s*$/, '').trim();
      }
      // 効果を繰り返す（REPEAT_EFFECT・engine実装済み）＝「あなたはこの効果をあとN回まで繰り返してもよい（。（合計で最大M回まで行える）」。
      if (a.id === 'REPEAT_EFFECT') {
        const m = currentCardText.match(/あなたはこの効果をあと[０-９\d]+回まで繰り返してもよい(?:。（[^）]*）)?/);
        if (m) return m[0];
      }
      // チャームなければ自トラッシュ（SELF_TRASH_IF_NO_OPP_CHARM・engine実装済み）＝「対戦相手の場に【チャーム】がない場合、このシグニをトラッシュに置く」。
      if (a.id === 'SELF_TRASH_IF_NO_OPP_CHARM') {
        const m = currentCardText.match(/対戦相手の場に【チャーム】がない場合、このシグニをトラッシュに置く/);
        if (m) return m[0];
      }
      // アクセをエナへ（ACCE_TO_ENERGY/PLACE_ACCE_SIGNI_TO_ENERGY・engine実装済み）＝「あなたの手札から《アクセアイコン》を持つシグニをN枚までエナゾーンに置く」。
      if (a.id === 'ACCE_TO_ENERGY' || a.id === 'PLACE_ACCE_SIGNI_TO_ENERGY') {
        const m = currentCardText.match(/あなたの手札から《アクセアイコン》を持つシグニを[０-９\d]*枚まで(?:あなたの)?エナゾーンに置く/);
        if (m) return m[0];
      }
      // 捨てた枚数+Nドロー（DRAW_DISCARD_COUNT_PLUS_N・engine実装済み）＝「この方法でカードをN枚以上捨てた場合、捨てた枚数にMを加えた枚数のカードを引く」。
      if (a.id === 'DRAW_DISCARD_COUNT_PLUS_N') {
        const m = currentCardText.match(/この方法でカードを[０-９\d]*枚以上捨てた場合、捨てた枚数に[０-９\d]*を加えた枚数のカードを引く/);
        if (m) return m[0];
      }
      // ライド（CENTER_LRIG_RIDES_ON_SIGNI・engine実装済み）＝「【ライド】（ターン終了時まで、このルリグは…に乗る。…ドライブ状態のルリグはアタックできない）」。
      if (a.id === 'CENTER_LRIG_RIDES_ON_SIGNI') {
        const m = currentCardText.match(/【ライド】（[\s\S]*?アタックできない）/);
        if (m) return m[0];
      }
      // 手札をシグニの下に（HAND_CARDS_UNDER_SIGNI・engine実装済み）＝「あなたの手札からカードをN枚までこのシグニの下に置く」。
      if (a.id === 'HAND_CARDS_UNDER_SIGNI') {
        const m = currentCardText.match(/あなたの手札からカードを[０-９\d]*枚まで(?:この)?シグニの下に置く/);
        if (m) return m[0];
      }
      // クラス宣言（DECLARE_CLASS・engine実装済み）＝「クラスN つを宣言する」（後続の探索は別描画）。
      if (a.id === 'DECLARE_CLASS') {
        const m = currentCardText.match(/クラス[０-９\d一]*つを宣言する/);
        if (m) return m[0];
      }
      // ゲート設置（PLACE_OWN_GATE・engine実装済み）＝「あなたのシグニゾーンN つに【ゲート】M つを置く」。
      if (a.id === 'PLACE_OWN_GATE') {
        const m = currentCardText.match(/あなたのシグニゾーン[０-９\d]*つに【ゲート】[０-９\d]*つを置く/);
        if (m) return m[0];
      }
      // デッキトップ公開しアタッカー配置（REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI・engine実装済み）。
      if (a.id === 'REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI') {
        const m = currentCardText.match(/あなたのデッキの一番上を公開する。それがシグニの場合、それをアタックしているシグニとしてダウン状態で場に出す/);
        if (m) return m[0];
      }
      // 対象を自身へ強制（FORCE_TARGET_SELF・engine実装済み）＝「（対戦相手のターンの間、）対戦相手は、…対象を選ぶ際、可能ならばこのシグニを対象とする」。
      if (a.id === 'FORCE_TARGET_SELF') {
        const m = currentCardText.match(/(?:対戦相手のターンの間、)?対戦相手は、[^。]*?対象を選ぶ際、可能ならばこのシグニを対象とする/);
        if (m) return m[0];
      }
      // 手札1枚選ぶ（CHOOSE_HAND_CARD・engine実装済み）＝「あなたの手札をN枚選ぶ」（後続の宣言当ては別描画）。
      if (a.id === 'CHOOSE_HAND_CARD') {
        const m = currentCardText.match(/あなたの手札を[０-９\d一]*枚選ぶ/);
        if (m) return m[0];
      }
      // 相手マルチエナ剥奪（REMOVE_OPP_MULTI_ENA/_ONLY・engine実装済み）＝「対戦相手のエナゾーンにあるカードは【マルチエナ】を失う（い、新たに得られない）」。
      if (a.id === 'REMOVE_OPP_MULTI_ENA' || a.id === 'REMOVE_OPP_MULTI_ENA_ONLY') {
        const m = currentCardText.match(/対戦相手のエナゾーンにあるカードは【マルチエナ】を失(?:い、新たに得られない|う)/);
        if (m) return m[0];
      }
      // 相手手札を見て選び公開（REVEAL_OPP_HAND_CARD・engine実装済み）＝「対戦相手の手札をN枚見ないで選び、（対戦相手はそのカードを公開する/公開させる）」。
      if (a.id === 'REVEAL_OPP_HAND_CARD') {
        const m = currentCardText.match(/対戦相手の手札を[０-９\d一]*枚見ないで選び、(?:対戦相手はそのカードを公開する|公開させる)/);
        if (m) return m[0];
      }
      // レイヤー能力付与（LAYER_ABILITY_COPY・engine実装済み）＝「【レイヤー】あなたの＜X＞のシグニは《レイヤーアイコン》の能力を得る」。
      if (a.id === 'LAYER_ABILITY_COPY') {
        const m = currentCardText.match(/【レイヤー】あなたの[^。]*?シグニは《レイヤーアイコン》の能力を得る/);
        if (m) return m[0];
      }
      // ルリグがシグニから降りる（CENTER_LRIG_DISMOUNT・engine実装済み）＝「あなたのセンタールリグN体を対象とし、それはすべてのシグニから降りてもよい」。
      if (a.id === 'CENTER_LRIG_DISMOUNT') {
        const m = currentCardText.match(/あなたのセンタールリグ[０-９\d一]*体を対象とし、それはすべてのシグニから降りてもよい/);
        if (m) return m[0];
      }
      // 相手アタック回数制限（LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE・engine実装済み）
      // ＝「（このターン、／次のあなたのターンまで、）対戦相手は…しかアタックできない」を原文抽出（3カードで語順・範囲が異なるため currentCardText 由来）。
      if (a.id === 'LIMIT_OPP_SIGNI_ATTACKS_ONCE' || a.id === 'OPP_SIGNI_ONE_ATTACK_TOTAL' || a.id === 'LIMIT_OPP_ATTACK_ONCE') {
        const m = currentCardText.match(/(?:このターン、|次のあなたのターンまで、)?対戦相手[^。]*?しかアタックできない/);
        if (m) return m[0];
      }
      // 相手が公開する系（OPP_REVEAL_HAND_AND_LRIG_DECK / OPP_REVEAL_LRIG_DECK / OPP_REVEAL_TOP_AND_HAND・engine実装済み）
      // ＝3枚で公開元（手札＋ルリグデッキ／ルリグデッキ／デッキトップ＋手札）が異なるため currentCardText から原文抽出。
      if (a.id === 'OPP_REVEAL_HAND_AND_LRIG_DECK' || a.id === 'OPP_REVEAL_LRIG_DECK' || a.id === 'OPP_REVEAL_TOP_AND_HAND') {
        const m = currentCardText.match(/対戦相手は[^。]*公開する。(?:（[^）]*）)?/);
        if (m) return m[0];
      }
      // ライフバースト二度発動（LIFE_BURST_DOUBLE）＝「（このターン、）（次に）あなたのライフバーストが発動する場合、代わりにそのライフバーストは二度発動する」を原文抽出。
      if (a.id === 'LIFE_BURST_DOUBLE') {
        const m = currentCardText.match(/このターン、(?:次に)?あなたのライフバーストが発動する場合、代わりにそのライフバーストは二度発動する/);
        if (m) return m[0];
      }
      // ルリグが乗機シグニに乗る（RIDE_ON）＝「ターン終了時まで、…センタールリグ…は…＜乗機＞のシグニ…に乗ってもよい」を原文抽出。
      if (a.id === 'RIDE_ON') {
        const m = currentCardText.match(/ターン終了時まで、[^。]*?センタールリグ[^。]*?乗ってもよい/);
        if (m) return m[0];
      }
      // 相手ドロー制限（OPP_DRAW_LIMIT）＝「（次の対戦相手の／その）ドローフェイズの間…対戦相手はカードを合計N枚までしか引けない」を原文抽出。
      if (a.id === 'OPP_DRAW_LIMIT') {
        const m = currentCardText.match(/(?:次の対戦相手の|その)?(?:ターンの)?ドローフェイズの間[に、]?対戦相手はカードを合計[０-９\d一二三]+枚までしか引けない/);
        if (m) return m[0];
      }
      // トラッシュしたカードからピック（PICK_FROM_TRASHED_CARDS）＝「この方法でトラッシュに置かれたカードの中から…対象とし、それ(ら)を手札に加える(か場に出す)」を原文抽出。
      if (a.id === 'PICK_FROM_TRASHED_CARDS') {
        const m = currentCardText.match(/この方法でトラッシュに置かれたカードの中から[^。]*?対象とし、それら?を手札に加える(?:か場に出す)?/);
        if (m) return m[0];
      }
      // 場出し制限（DEPLOY_RESTRICT）＝「…新たに(場に)出せない(。（補足）)」をカード別に原文抽出（先頭の【】：は timing 側で描画済のため除外）。
      if (a.id === 'DEPLOY_RESTRICT') {
        const m = currentCardText.match(/[^。：]*新たに[^。]*出せない(?:。（[^）]*）)?/);
        if (m) return m[0];
      }
      // 相手シグニのアタックパワー制限（OPP_SIGNI_ATTACK_POWER_RESTRICT）＝「このターン、対戦相手はパワーがN以下のシグニでアタックできない」を原文抽出。
      if (a.id === 'OPP_SIGNI_ATTACK_POWER_RESTRICT') {
        const m = currentCardText.match(/このターン、対戦相手はパワーが[０-９\d]+以下のシグニでアタックできない/);
        if (m) return m[0];
      }
      // コイン使用先制限（COIN_USE_RESTRICTION）＝「このゲームの間、あなたは《コインアイコン》をスペルとシグニにしか支払えない」を原文抽出。
      if (a.id === 'COIN_USE_RESTRICTION') {
        const m = currentCardText.match(/このゲームの間、あなたは《コインアイコン》をスペルとシグニにしか支払えない/);
        if (m) return m[0];
      }
      // 相手が色を宣言（OPP_DECLARE_COLOR）＝「対戦相手は色N つを宣言する」を原文抽出（宣言色によるトラッシュ処理は後続の別効果側で描画）。
      if (a.id === 'OPP_DECLARE_COLOR') {
        const m = currentCardText.match(/対戦相手は色[０-９\d一]つを宣言する/);
        if (m) return m[0];
      }
      // 自シグニの下にカードを置く（HAND_CARDS_UNDER_SIGNI / PLACE_SIGNI_UNDER_SELF_OPT）＝カード別（手札から／場のシグニ）に「…をこのシグニの下に置いてもよい」を原文抽出。
      if (a.id === 'HAND_CARDS_UNDER_SIGNI' || a.id === 'PLACE_SIGNI_UNDER_SELF_OPT') {
        const m = currentCardText.match(/あなたの[^。]*?をこのシグニの下に置いてもよい(?:。（[^）]*）)?/);
        if (m) return m[0];
      }
      // 相手メインフェイズのリミット減（OPP_MAIN_PHASE_LIMIT_DOWN）＝「次の対戦相手のメインフェイズの間、対戦相手のセンタールリグのリミットを－Nする」を原文抽出。
      if (a.id === 'OPP_MAIN_PHASE_LIMIT_DOWN') {
        const m = currentCardText.match(/次の対戦相手のメインフェイズの間、対戦相手のセンタールリグのリミットを－[０-９\d一二三]+する/);
        if (m) return m[0];
      }
      // 相手シグニのアタックにコスト（OPP_SIGNI_ATTACK_COST）＝「ターン終了時まで、対戦相手のすべてのシグニは「【常】：あなたが《無》…を支払わないかぎりアタックできない。」を得る」を原文抽出。
      if (a.id === 'OPP_SIGNI_ATTACK_COST') {
        const m = currentCardText.match(/ターン終了時まで、対戦相手のすべてのシグニは「【常】：あなたが《無》(?:《無》)*を支払わないかぎりアタックできない。」を得る/);
        if (m) return m[0];
      }
      // 対象シグニのパワーを基本パワーにコピー（COPY_TARGET_POWER）＝「シグニN体を対象とし、（次の対戦相手の）ターン終了時まで、このシグニの基本パワーはそれのパワーと同じ値になる」を原文抽出。
      if (a.id === 'COPY_TARGET_POWER') {
        const m = currentCardText.match(/シグニ[０-９\d一]体を対象とし、(?:次の対戦相手の)?ターン終了時まで、このシグニの基本パワーはそれのパワーと同じ値になる/);
        if (m) return m[0];
      }
      // 場・エナのシグニが色を追加取得（FIELD_ENERGY_SIGNI_GAIN_COLOR・CONTINUOUS）＝「あなたの、場とエナゾーンにある…シグニは追加で…を得る」を原文抽出。
      if (a.id === 'FIELD_ENERGY_SIGNI_GAIN_COLOR') {
        const m = currentCardText.match(/あなたの、場とエナゾーンにある[^。]*?シグニは追加で[^。]*?を得る/);
        if (m) return m[0];
      }
      // 次の相手アップフェイズにアップさせない（UPKEEP_OR_NO_UP）＝「次の対戦相手のアップフェイズに、対戦相手が…支払わないかぎり、対戦相手のセンタールリグはアップしない」を原文抽出。
      if (a.id === 'UPKEEP_OR_NO_UP') {
        const m = currentCardText.match(/次の対戦相手のアップフェイズに、対戦相手が[^。]*?支払わないかぎり、対戦相手のセンタールリグはアップしない/);
        if (m) return m[0];
      }
      // 能力なしならトラッシュ（ABILITY_CHECK_ELSE_TRASH）＝「それが能力を持たない場合、代わりにそれをトラッシュに置く」を原文抽出。
      if (a.id === 'ABILITY_CHECK_ELSE_TRASH') {
        const m = currentCardText.match(/それが能力を持たない場合、代わりにそれをトラッシュに置く/);
        if (m) return m[0];
      }
      // ダウンしたシグニのパワーを加算（POWER_COPY_FROM_DOWNED）＝「ターン終了時まで、このシグニのパワーをこの方法でダウンしたシグニのパワーと同じだけ＋（プラス）する」を原文抽出。
      if (a.id === 'POWER_COPY_FROM_DOWNED') {
        const m = currentCardText.match(/ターン終了時まで、このシグニのパワーをこの方法でダウンしたシグニのパワーと同じだけ＋（プラス）する/);
        if (m) return m[0];
      }
      // トラッシュからアクセ付与（ACCE_FROM_TRASH）＝「あなたのトラッシュから…を対象とし、それをこのシグニの【アクセ】にする」を原文抽出。
      if (a.id === 'ACCE_FROM_TRASH' || a.id === 'NAMED_SIGNI_ACCE_FROM_TRASH') {
        const m = currentCardText.match(/あなたのトラッシュから[^。]*?を対象とし、それをこのシグニの【アクセ】にする/);
        if (m) return m[0];
      }
      // シグニをトラッシュのシグニと同名化（COPY_SIGNI）＝「ターン終了時まで、対象のあなたのシグニN体はあなたのトラッシュにある対象のシグニN枚と同じカードになる」を原文抽出。
      if (a.id === 'COPY_SIGNI') {
        const m = currentCardText.match(/ターン終了時まで、対象のあなたのシグニ[０-９\d一]体はあなたのトラッシュにある対象のシグニ[０-９\d一]枚と同じカードになる/);
        if (m) return m[0];
      }
      // マジックボックス設置（PLACE_MAGIC_BOX）＝「そのカードを【マジックボックス】としてあなたのシグニゾーンに設置してもよい(。（補足）)」を原文抽出。
      if (a.id === 'PLACE_MAGIC_BOX') {
        const m = currentCardText.match(/そのカードを【マジックボックス】としてあなたのシグニゾーンに設置してもよい(?:。（[^）]*）)?/);
        if (m) return m[0];
      }
      // 引用能力付与（GRANT_QUOTED_ACTIVATE_ABILITY＝引用【起】／SIGNI_GRANT_QUOTED_CONSTANT_ABILITY＝引用【常】）
      // ＝「…は「【起】/【常】：…」を得る(。（補足）)」を原文抽出。主語は直近の。／：以降、引用内は「」を得る の最初の閉じまで。
      if (a.id === 'GRANT_QUOTED_ACTIVATE_ABILITY' || a.id === 'SIGNI_GRANT_QUOTED_CONSTANT_ABILITY') {
        const m = currentCardText.match(/[^。：]*?は「[\s\S]+?」を得る(?:。（[^）]*）)?/);
        if (m) return m[0];
      }
      // その他の単発 STUB（engine実装/認識済み・action STUB は各1枚）の原文意味文。
      // activeCondition(TURN_OWNER/英知 等)を持つものは条件が別途前置描画されるため本体のみ。
      const miscStubMap: Record<string, string> = {
        WHITE_SIGNI_ABILITY_PROTECT: 'あなたの白のシグニは対戦相手の効果によって能力を失わない',
        SIGNI_PROTECT_MOVE_EXCEPT_ENERGY: 'このシグニは対戦相手の効果によって場からエナゾーン以外の領域に移動しない',
        RESTRICT_CHARMED_SIGNI_ACTIVATED: '対戦相手は【チャーム】が付いているシグニの【起】能力を使用できない',
        RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE: 'あなたの＜宇宙＞のレゾナ１体が対戦相手の効果によって場を離れる場合、代わりにこのシグニを場からトラッシュに置いてもよい',
        REPLACE_LEAVE_FIELD_WITH_TRASH_UNDER: '下にカードが１枚以上あるこのシグニが対戦相手の効果によって場を離れる場合、代わりにこのシグニの下からすべてのカードをトラッシュに置いてもよい',
        PLAY_EFFECT_TARGET_CLASS_CHANGE: 'このシグニの【出】能力で指定された領域にある対戦相手のシグニであるカードはクラスと色を失い、＜精元＞を得る',
        GROW_FROM_LEVEL0: 'レベル０のルリグからこのルリグにグロウできる',
        GROW_COST_SUBSTITUTE_TRASH_SIGNI: '《天啓の天恵 アン=フォース》のグロウコストとして《白》を支払う際、代わりにあなたのエナゾーンから＜美巧＞のシグニ１枚をトラッシュに置いてもよい',
        DYNAMIC_LEVEL_BY_ENERGY: 'このシグニのレベルはあなたのエナゾーンにあるカード５枚につき＋１され、このシグニのパワーはこのシグニのレベル１につき＋3000される',
        COOKING_BANISH_SUBSTITUTE: 'あなたの＜調理＞のシグニ１体がバニッシュされる場合、代わりにそのシグニに付いている【アクセ】１枚をトラッシュに置いてもよい',
        BANISH_SUBSTITUTE_RISE_STACK: 'このシグニがバニッシュされる場合、代わりにこのシグニの下からカード１枚をトラッシュに置く',
        ATTACK_COUNT_BY_POWER: '各ターン、このシグニは自身のパワー10000につき一度までしかアタックできない',
        ARTS_COST_REDUCTION_BY_COST_THRESHOLD: 'あなたがコストの合計が３以上のアーツを使用する場合、それの使用コストは《緑×1》減る',
        ALLOW_ATTACK_WHILE_DRIVE: 'このルリグはドライブ状態でもアタックできる',
        ADJACENT_ZONE_ATTACK: 'このシグニが正面にアタックする場合、このシグニは正面に加えてその隣のシグニゾーン１つにアタックしてもよい',
        ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI: 'あなたが《白》を支払う際、代わりにあなたのエナゾーンから＜美巧＞のシグニ１枚をトラッシュに置いてもよい',
        ENERGY_SUBSTITUTE_TRASH_KEY: 'あなたがエナコストを支払う際、このキーを場からルリグトラッシュに置くことで好きな色のエナ２つを支払える',
        PLAY_SPELL_FROM_HAND: 'あなたの手札からコストの合計が２～４の青か黒のスペル１枚を、そのコストを支払って使用する',
        PLAY_SPELL_FROM_HAND_FREE: 'あなたの手札からコストの合計が１以下の赤のスペル１枚をコストを支払わずに使用してもよい',
        USE_SPELL_FROM_TRASH: '対戦相手のトラッシュからスペル１枚を対象とし、それを使用する',
        ARTS_COLORLESS_MUST_PAY_CENTER_COLOR: 'このアーツの使用コストに含まれる《無》コストは、あなたのセンタールリグが持つ色でしか支払えない',
        BLACK_RISE_PLAY_STACK_FROM_TRASH: 'あなたのトラッシュからシグニ１枚を対象とし、それをそのシグニの下に置く',
        SIGNI_GRANT_CHOSEN_ABILITY: '以下の２つから１つを選ぶ。表記されているパワーよりパワーの高いあなたの＜電機＞のシグニ１体を対象とし、ターン終了時まで、それは選んだ能力を得る。①「【常】：対戦相手の効果によってダウンしない。」②「【常】：対戦相手の効果によって手札に戻らない。」',
        BANISH_ATTACKER_IF_WEAKER_THAN_FRONT: 'そのシグニのパワーがそのシグニの正面のシグニのパワーより低い場合、アタックしたそのシグニをバニッシュする',
        CONDITIONAL_GROW_AND_KEY_DISABLE: 'あなたのセンタールリグが対戦相手のセンタールリグのレベル以下の場合、あなたのセンタールリグはグロウする。ターン終了時まで、あなたのすべてのキーは能力を失う。（グロウコストは支払う）',
        INTERNAL_ARTS_RECYCLE_EXECUTE: '追加でこのカードをルリグデッキに戻す',
        LRIG_GRANT_MILL_PER_PREVENTED_DAMAGE: 'ターン終了時まで、このルリグは「【自】：ターン終了時、あなたのデッキの上からカードを５枚トラッシュに置く。」を得る（※engine未実装＝防御成功イベント待ち）',
      };
      if (miscStubMap[a.id]) return miscStubMap[a.id];
      // STUBS.md に説明があれば id ではなく説明文を表示（無ければ id にフォールバック）
      // 説明文中の実装フロー注記（例:（SELECT→INTERNAL））は原文語彙でないため除去。
      const desc = stubDescMap.get(a.id)?.replace(/（[A-Z][A-Z0-9_]*(?:→[A-Z][A-Z0-9_]*)+）/g, '').trim();
      return desc ? `[STUB:${desc}${extra}]` : `[STUB:${a.id}${extra}]`;
    }
    default: return `[アクション:${a.type}]`;
  }
}

const timingJa: Record<string, string> = {
  ON_PLAY: 'このシグニが場に出たとき', ON_ATTACK_SIGNI: 'このシグニがアタックしたとき',
  ON_ATTACK_LRIG: 'このルリグがアタックしたとき',
  ON_ACCE: 'このシグニに【アクセ】が付いたとき',
  ON_SELF_REVEAL_FROM_HAND: 'あなたが自分の効果によって手札からカードを公開したとき',
  ON_BANISH: 'このシグニがバニッシュされたとき', ON_TRASH: 'このカードがトラッシュに置かれたとき',
  ON_SIGNI_BANISH_OPPONENT: 'このシグニが対戦相手のシグニをバニッシュしたとき',
  ON_SIGNI_BANISH_BATTLE: 'このシグニがバトルで対戦相手のシグニをバニッシュしたとき',
  ON_TURN_START: 'ターン開始時', ON_TURN_END: 'ターン終了時',
  ON_ATTACK_PHASE_START: 'あなたのアタックフェイズ開始時', ON_LIFE_CRASHED: 'あなたのライフがクラッシュされたとき',
  ON_MAIN_PHASE_START: 'あなたのメインフェイズ開始時',
  ON_OPP_LIFE_CRASHED: '対戦相手のライフがクラッシュされたとき', ON_SIGNI_BATTLE: 'このシグニがバトルしたとき',
  ON_SIGNI_DAMAGE: 'このシグニが相手にダメージを与えたとき', ON_LEAVE_FIELD: 'このカードが場を離れたとき',
  ON_HEAVEN: 'ヘブンヘブン（すべてのクロスシグニがダウン状態でアタックしたとき）',
  ON_SPELL_USE: 'あなたがスペルを使用したとき', ON_GUARD: 'あなたがガードしたとき',
  ON_ARTS_USE: 'あなたがアーツを使用したとき',
  ON_RISE: 'このシグニがライズされたとき',
  MAIN: '（メイン起動）', ATTACK: '（アタックフェイズ起動）', ATTACK_ARTS: '（アタックフェイズ起動）', ON_LIFE_BURST: '【ライフバースト】',
  ON_DRAW: 'あなたがカードを引いたとき',
  ON_ENERGY_CHARGE: 'あなたのエナゾーンにカード1枚が置かれたとき', ON_POWER_THRESHOLD: 'このシグニのパワーが閾値以上になったとき',
  SPELL_CUTIN: 'スペルカットイン', ON_OPP_SIGNI_ATTACK_DIRECT: '対戦相手のシグニが正面が空の状態でアタックしたとき',
  ON_FRONT_SIGNI_ATTACK: 'このシグニの正面のシグニがアタックしたとき',
  ON_ZONE_MOVED: 'このシグニが効果によって他のシグニゾーンに移動したとき',
  ON_SIGNI_BECOMES_DRIVE: 'このシグニがドライブ状態になったとき',
  ON_BECOME_BEAT: 'このカードが【ビート】になったとき',
  ON_HAND_DISCARDED: 'ガードステップ以外であなたが手札を捨てたとき',
  ON_DISCARDED_AS_COST: 'このカードがシグニ能力のコストとして手札から捨てられたとき',
  ON_EXCEED_COST: 'このカードがエクシードのコストとしてルリグトラッシュに置かれたとき',
  ON_OPP_VIRUS_PLACED: '対戦相手の場に【ウィルス】が置かれたとき',
  ON_OPP_VIRUS_REMOVED: '対戦相手の場から【ウィルス】が取り除かれたとき',
  ON_OPP_VIRUS_CHANGED: '対戦相手の場に【ウィルス】が置かれるか取り除かれたとき',
  ON_ACCE_ATTACH: 'あなたのシグニ１体に【アクセ】が付いたとき',
  ON_CARD_MILLED_FROM_DECK: 'あなたか対戦相手のデッキからカードが1枚以上トラッシュに置かれたとき',
  ON_CARD_MOVED_TO_DECK: 'あなたか対戦相手のカードが効果によって1枚以上デッキに移動したとき',
  ON_SIGNI_POWER_ZERO_OR_LESS: 'シグニのパワーが0以下になったとき',
  ON_SIGNI_FROZEN: 'シグニが凍結状態になったとき',
  ON_TARGETED: 'このシグニが対戦相手の能力か効果の対象になったとき',
  ON_DECK_SHUFFLED: 'あなたのデッキがシャッフルされたとき',
  ON_KEYWORD_GAINED: 'あなたの他のシグニが【アサシン】か【ランサー】か【ダブルクラッシュ】を得たとき',
  ON_LRIG_UNDER_MOVED: 'あなたのルリグの下からカード１枚が移動したとき',
  ON_LRIG_ATTACK_STEP_START: 'あなたのルリグアタックステップ開始時',
  ON_OPP_ARTS_USE: 'あなたのシグニが対戦相手のアーツの効果を受けたとき',
  ON_LRIG_GROW: 'あなたのルリグがグロウしたとき',
  ON_COIN_PAID: 'あなたが《コイン》を１枚以上支払ったとき',
  ON_MATERIAL_USED: 'このシグニに《改造素材》が使用されたとき',
  ON_SIGNI_BANISH_OPPONENT_BY_EFFECT: 'このシグニが効果によって対戦相手のシグニ１体をバニッシュしたとき',
  ON_ALLY_PLAY_OR_OPP_HAND_DISCARD: 'あなたの他のシグニ１体が場に出るか、あなたの効果によって対戦相手が手札を１枚捨てたとき',
  ON_BLOOM: 'このシグニが開花したとき',
  ON_REVEALED_FROM_HAND: 'このカードがあなたの効果によって手札から公開されたとき',
  ON_ENERGY_FROM_TRASH: 'このカードがトラッシュからエナゾーンに置かれたとき',
  ON_BLOOD_CRYSTAL_ARMOR: 'あなたのシグニが血晶武装状態になったとき',
  // 【トラップアイコン】【歌のカケラ】はアイコン（effectType）側で表示するため、timing ラベルは空にする。
  ON_TRAP_ACTIVATE: '',
  ON_SONG_ACTIVATE: '',
};

// engine 未配線のトリガー（JSON/逆翻訳は揃っているがゲームでは発火しない）。
// 逆翻訳末尾に【※engine未配線】を付与し、偽陰性（健全に見えて未実装）を防ぐ。配線したら除去する。docs/TODO.md に記録。
// C1（2026-06-29）で配線済＝除外：ON_TARGETED（handleEffectInteraction→collectTargetedTriggers）・ON_LRIG_GROW（executeGrow/CPU→collectLrigGrowTriggers・センターグロウのみ）・ON_COIN_PAID（グロウ/起動/キー/出/アーツの各支払サイト→collectCoinPaidTriggers・スペルベットは未配線）・ON_LRIG_ATTACK_STEP_START（doPhaseAdvance ATTACK_SIGNI→ATTACK_LRIG→collectTurnTriggers・人間ターンのみ）。
// ON_KEYWORD_GAINED は WXDi-P04-035 用に COPY_ABILITY 実装＋配線済（2026-06-30）＝engineUnwiredTimings から除外（残り0）。
const engineUnwiredTimings = new Set<string>([]);

function effJa(e: Eff): string {
  // crossOnly（【クロス常】【クロス出】【クロス起】【クロス自】）: マーカーに「クロス」を冠する。
  // クロス条件文（「《X》の左」等）は effects JSON に無いため card の EffectText から補う。
  const crossPrefix = e.crossOnly ? 'クロス' : '';
  const kizunaPrefix = e.kizunaIcon ? '絆' : ''; // 【絆常】【絆自】【絆起】【絆出】
  const mk = `${kizunaPrefix}${crossPrefix}`;
  const specialType: Record<string, string> = { TRAP_ICON: '【トラップアイコン】', SONG_ICON: '【歌のカケラ】' };
  const typeMark = e.effectType === 'AUTO' ? `【${mk}自】` : e.effectType === 'CONTINUOUS' ? `【${mk}常】`
    : e.effectType === 'ACTIVATED' ? `【${mk}起】` : e.effectType === 'LIFE_BURST' ? '【LB】'
    : (specialType[e.effectType] ?? `【${e.effectType}】`);
  const crossCondText = e.crossOnly ? (currentCardText.match(/《クロスアイコン》([^【]+)/)?.[1]?.trim() ?? '') : '';
  const crossCond = crossCondText ? `${crossCondText}に置かれているかぎり ` : '';
  // triggerScope（any_ally/any_opp/any）+ triggerFilter を主語に反映（「このシグニが」→「あなたの赤のシグニが」等）
  const subjFilter = e.triggerFilter ? filterJa(e.triggerFilter) : '';
  const scopeSubj = e.triggerScope === 'any_ally' ? `あなたの${subjFilter}`
    : e.triggerScope === 'any_opp' ? `対戦相手の${subjFilter}`
    : e.triggerScope === 'any' ? `いずれかの${subjFilter}`
    : null;
  // トリガー主語の名詞（triggerFilter.cardType がレゾナ等ならその名詞。既定はシグニ。G148）
  const scopeNoun = e.triggerFilter?.cardType && !Array.isArray(e.triggerFilter.cardType) ? e.triggerFilter.cardType : 'シグニ';
  const trig = (e.timing || []).map((t: string) => {
    let s = timingJa[t] ?? t;
    if (scopeSubj !== null && s.startsWith('このシグニ')) s = `${scopeSubj}${scopeNoun}${s.slice('このシグニ'.length)}`;
    // ON_TRASH/ON_LEAVE_FIELD 等「このカード」始まりも scope 主語に置換（any_opp→「対戦相手のシグニが…」）
    else if (scopeSubj !== null && s.startsWith('このカード')) s = `${scopeSubj}${scopeNoun}${s.slice('このカード'.length)}`;
    // ON_LEAVE_FIELD の leftToZone:'hand'（「シグニ１体が場から手札に戻ったとき」WXK02-041）
    if (t === 'ON_LEAVE_FIELD' && e.triggerCondition?.leftToZone === 'hand') s = 'シグニ１体が場から手札に戻ったとき';
    // ON_MAIN_PHASE_START の triggerScope:any_opp（「対戦相手のメインフェイズ開始時」WXDi-P00-034）
    if (t === 'ON_MAIN_PHASE_START' && e.triggerScope === 'any_opp') s = '対戦相手のメインフェイズ開始時';
    // ON_TURN_END/ON_TURN_START の triggerScope:any_opp（「対戦相手のターン終了/開始時」WX11-032/WX20-073 等）
    if ((t === 'ON_TURN_END' || t === 'ON_TURN_START') && e.triggerScope === 'any_opp') s = `対戦相手の${s}`;
    // ON_LRIG_GROW の主語（triggerScope/excludeSelf）を反映（any_opp＝対戦相手／excludeSelf＝他の）
    if (t === 'ON_LRIG_GROW') {
      s = e.triggerScope === 'any_opp' ? '対戦相手のルリグがグロウしたとき'
        : `あなたの${e.triggerFilter?.excludeSelf ? '他の' : ''}ルリグがグロウしたとき`;
    }
    // ON_MATERIAL_USED の主語を反映（materialUsedByPlayer＝あなたが使用／any_ally＝他のシグニに／既定＝このシグニに）
    if (t === 'ON_MATERIAL_USED') {
      s = e.triggerCondition?.materialUsedByPlayer ? 'あなたが《改造素材》を使用したとき'
        : e.triggerScope === 'any_ally' ? `あなたの${e.triggerFilter?.excludeSelf ? '他の' : ''}シグニ１体に《改造素材》が使用されたとき`
        : 'このシグニに《改造素材》が使用されたとき';
    }
    // ON_ALLY_PLAY_OR_OPP_HAND_DISCARD（複合ORトリガー WXDi-P11-064）：triggerFilter（他の＜天使＞の）を主語に反映
    if (t === 'ON_ALLY_PLAY_OR_OPP_HAND_DISCARD') {
      s = `あなたの${e.triggerFilter ? filterJa(e.triggerFilter) : ''}シグニ１体が場に出るか、あなたの効果によって対戦相手が手札を１枚捨てたとき`;
    }
    // ON_SPELL_USE は triggerFilter.color を使用スペルの色として反映（「あなたが緑のスペルを使用したとき」）
    if (t === 'ON_SPELL_USE' && e.triggerFilter?.color) s = `あなたが${[].concat(e.triggerFilter.color).join('・')}のスペルを使用したとき`;
    // ON_TRASH の発生源限定（fromZones）を反映（「このカードが手札かデッキからトラッシュに置かれたとき」）
    if (t === 'ON_TRASH' && e.triggerCondition?.fromZones) {
      const zoneJa: Record<string, string> = { hand: '手札', deck: 'デッキ', energy: 'エナ', field: '場' };
      const zones = e.triggerCondition.fromZones.map((z: string) => zoneJa[z] ?? z).join('か');
      s = s.replace('トラッシュに置かれたとき', `${zones}からトラッシュに置かれたとき`);
    }
    // ON_TRASH の「レゾナの出現条件のために」限定を反映
    if (t === 'ON_TRASH' && e.triggerCondition?.forResonaCondition) {
      s = 'レゾナの出現条件のために' + s.replace('トラッシュに置かれたとき', '場からトラッシュに置かれたとき');
    }
    // ON_TRASH の「効果によって」限定を反映（バトル・ルール処理では発火しない。G177）
    if (t === 'ON_TRASH' && e.triggerCondition?.byEffect) {
      s = s.includes('場からトラッシュに置かれたとき')
        ? s.replace('場からトラッシュに置かれたとき', '効果によって場からトラッシュに置かれたとき')
        : s.replace('トラッシュに置かれたとき', '効果によって場からトラッシュに置かれたとき');
    }
    // ON_TRASH の「コストか効果によって場から」限定を反映（バトル・ルール処理では発火しない。G204）
    if (t === 'ON_TRASH' && e.triggerCondition?.fromFieldByCostOrEffect) {
      s = 'このシグニがコストか効果によって場からトラッシュに置かれたとき';
    }
    // ON_PLAY の「効果によって」限定を反映（手札からの通常召喚では発火しない）
    if (t === 'ON_PLAY' && e.triggerCondition?.bySigniEffect) {
      s = s.replace('場に出たとき', 'シグニの効果によって場に出たとき');
    } else if (t === 'ON_PLAY' && e.triggerCondition?.byEffect) {
      s = s.replace('場に出たとき', '効果によって場に出たとき');
    }
    // ON_PLAY の「ダウン状態で」限定（G144「あなたのシグニがダウン状態で場に出たとき」）
    if (t === 'ON_PLAY' && e.triggerCondition?.placedDown) {
      s = s.replace('場に出たとき', 'ダウン状態で場に出たとき');
    }
    // ON_PLAY の「傀儡状態で」限定（WDK17-001「あなたの傀儡状態のシグニ１体が場に出たとき」）
    if (t === 'ON_PLAY' && e.triggerCondition?.placedPuppet) {
      s = s.replace('シグニが場に出たとき', '傀儡状態のシグニが場に出たとき');
    }
    // ON_PLAY の「トラッシュから」限定（「シグニがトラッシュから場に出たとき」）
    if (t === 'ON_PLAY' && e.triggerCondition?.placedFromTrash) {
      const subj = (e.triggerScope === 'any_ally' || e.triggerScope === 'any')
        ? `あなたの${e.triggerFilter ? filterJa(e.triggerFilter) : ''}シグニ１体` : 'このシグニ';
      s = `${subj}がトラッシュから場に出たとき`;
    }
    // ON_DRAW の「あなたの場の＜story＞シグニの効果で」限定（WX20-026-E3）。ドローフェイズの通常ドローでは発火しない。
    if (t === 'ON_DRAW' && e.triggerCondition?.drawBySourceStory) {
      s = `あなたの場にある＜${e.triggerCondition.drawBySourceStory}＞のシグニの効果であなたがカードを１枚引いたとき`;
    }
    // ON_DRAW の「ドローフェイズ以外で引いたとき」限定（WXDi-D09-P19/WXDi-P05-062）
    if (t === 'ON_DRAW' && e.triggerCondition?.outsideDrawPhase) {
      s = 'ドローフェイズ以外であなたがカードを１枚引いたとき';
    }
    // ON_DRAW triggerScope:any_opp（対戦相手が引いたとき）＋位相/効果限定（WXDi-P04-038/WXDi-P15-091/WD22-029-G/PR-423）
    if (t === 'ON_DRAW' && e.triggerScope === 'any_opp') {
      const pr = e.triggerCondition?.drawPhaseRestriction;
      const phasePrefix = pr === 'main_attack' ? 'メインフェイズかアタックフェイズの間、'
        : pr === 'opp_attack' ? '対戦相手のアタックフェイズの間、' : '';
      const byEffect = e.triggerCondition?.drawByEffect ? '効果によって' : '';
      s = `${phasePrefix}対戦相手が${byEffect}カードを１枚引いたとき`;
    }
    // ON_RISE の「カード名に〜を含むシグニにライズされたとき」限定（WX20-056-E2）
    if (t === 'ON_RISE' && e.triggerCondition?.risedOntoNameContains) {
      s = `このシグニがカード名に《${e.triggerCondition.risedOntoNameContains}》を含むシグニにライズされたとき`;
    }
    // ON_PLAY placedFront（WXDi-P03-043「対戦相手のシグニ１体がこのシグニの正面に配置されたとき」）
    if (t === 'ON_PLAY' && e.triggerCondition?.placedFront) {
      s = '対戦相手のシグニ１体がこのシグニの正面に配置されたとき';
    }
    // ON_EXCEED_COST「あなたがエクシードのコストを支払ったとき」変種（WXDi-P06-078）
    if (t === 'ON_EXCEED_COST' && e.triggerCondition?.exceedCostPaidByPlayer) {
      s = 'あなたがエクシードのコストを支払ったとき';
    }
    // ON_ACCE_ATTACH の host レベル条件（WXK05-041「レベル4以上のシグニに付いたとき」）
    if (t === 'ON_ACCE_ATTACH' && e.triggerCondition?.accedHostMinLevel) {
      s = `このカードが【アクセ】としてレベル${e.triggerCondition.accedHostMinLevel}以上のシグニに付いたとき`;
    }
    // ON_PLAY の triggerFilter（クロス/ライズアイコン）を主語に反映（「あなたの《クロスアイコン》を持つシグニが場に出たとき」）
    if (t === 'ON_PLAY' && (e.triggerScope === 'any_ally' || e.triggerScope === 'any') && (e.triggerFilter?.hasCrossIcon || e.triggerFilter?.hasRiseIcon)) {
      const icon = e.triggerFilter.hasCrossIcon ? 'クロスアイコン' : 'ライズアイコン';
      s = `あなたの《${icon}》を持つシグニ１体が場に出たとき`;
    }
    // ON_CARD_MILLED_FROM_DECK の発生源デッキ・枚数限定（milledDeckOwner/milledMinCount）
    if (t === 'ON_CARD_MILLED_FROM_DECK') {
      const mo = e.triggerCondition?.milledDeckOwner ?? 'any';
      const mc = e.triggerCondition?.milledMinCount ?? 1;
      const who = mo === 'self' ? 'あなたの' : mo === 'opponent' ? '対戦相手の' : 'いずれかのプレイヤーの';
      s = `${who}デッキからカードが${mc}枚以上トラッシュに置かれたとき`;
    }
    // ON_CARD_MOVED_TO_DECK の宛先デッキ・枚数・発生源限定（movedToDeckOwner/MinCount/FromTrash）
    if (t === 'ON_CARD_MOVED_TO_DECK') {
      const vo = e.triggerCondition?.movedToDeckOwner ?? 'any';
      const vc = e.triggerCondition?.movedToDeckMinCount ?? 1;
      const fromTrash = e.triggerCondition?.movedToDeckFromTrash ?? false;
      if (vo === 'self' && fromTrash) s = `あなたのトラッシュからカードが${vc}枚以上デッキに移動したとき`;
      else if (vo === 'opponent') s = `対戦相手のカードが${vc}枚以上デッキに移動したとき`;
      else if (vo === 'self') s = `あなたのカードが${vc}枚以上デッキに移動したとき`;
      else s = `いずれかのプレイヤーのカードが${vc}枚以上デッキに移動したとき`;
    }
    // ON_SIGNI_POWER_ZERO_OR_LESS の triggerScope を主語に反映（any_opp=対戦相手/any_ally=あなた/self=このシグニ）
    if (t === 'ON_SIGNI_POWER_ZERO_OR_LESS') {
      const sc = e.triggerScope ?? 'any';
      const who = sc === 'any_opp' ? '対戦相手のシグニ' : sc === 'any_ally' ? 'あなたのシグニ' : sc === 'self' ? 'このシグニ' : 'シグニ';
      s = `${who}のパワーが0以下になったとき`;
    }
    // ON_OPP_POWER_DECREASED（毒牙・相手パワー減少時）（WX13-036/WXEX2-52）
    if (t === 'ON_OPP_POWER_DECREASED') {
      s = 'あなたの効果によって対戦相手のシグニのパワーが減ったとき';
    }
    // ON_REFRESH（リフレッシュ時）の refreshedOwner を主語に反映（WXDi-P04-043）
    if (t === 'ON_REFRESH') {
      const ro = e.triggerCondition?.refreshedOwner ?? 'any';
      const who = ro === 'self' ? 'あなた' : ro === 'opponent' ? '対戦相手' : 'いずれかのプレイヤー';
      s = `${who}がリフレッシュしたとき`;
    }
    // ON_ENERGY_TO_TRASH（エナゾーン→トラッシュ）の energyTrashedOwner を主語に反映（WD15-015）
    if (t === 'ON_ENERGY_TO_TRASH') {
      const eo = e.triggerCondition?.energyTrashedOwner ?? 'any';
      const who = eo === 'self' ? 'あなたの' : eo === 'opponent' ? '対戦相手の' : 'いずれかのプレイヤーの';
      s = `あなたの効果によって${who}エナゾーンからカードが１枚トラッシュに置かれたとき`;
    }
    // ON_CHARM_TO_TRASH（【チャーム】が場→トラッシュ）の triggerScope を主語に反映
    if (t === 'ON_CHARM_TO_TRASH') {
      const sc = e.triggerScope ?? 'any';
      const who = sc === 'any_ally' ? 'あなたの' : sc === 'any_opp' ? '対戦相手の' : '';
      s = `${who}【チャーム】１枚が場からいずれかのトラッシュに置かれたとき`;
    }
    // ON_SIGNI_FROZEN の triggerScope を主語に反映（any_opp=対戦相手/any_ally=あなた）
    if (t === 'ON_SIGNI_FROZEN') {
      const sc = e.triggerScope ?? 'any_opp';
      const who = sc === 'any_opp' ? '対戦相手のシグニ' : sc === 'any_ally' ? 'あなたのシグニ' : sc === 'self' ? 'このシグニ' : 'シグニ';
      s = `${who}が凍結状態になったとき`;
    }
    // ON_HAND_DISCARDED の triggerFilter（捨て札のクラス限定）を反映（「手札から＜宝石＞のシグニを捨てたとき」）
    if (t === 'ON_HAND_DISCARDED' && e.triggerFilter && (e.triggerFilter.story || e.triggerFilter.cardClass)) {
      const cls = e.triggerFilter.story ?? e.triggerFilter.cardClass;
      const clsStr = Array.isArray(cls) ? cls.join('か') : cls;
      s = `あなたが手札から＜${clsStr}＞のカードを捨てたとき`;
    }
    // ON_HAND_DISCARDED の triggerScope:'any'（「いずれかのプレイヤーが」WXK09-038）を主語に反映
    if (t === 'ON_HAND_DISCARDED' && e.triggerScope === 'any') {
      s = s.replace('あなたが手札を捨てたとき', 'いずれかのプレイヤーが手札を捨てたとき');
    }
    return s;
  }).join('/');
  // 主語に反映できなかった scope のみマーカー表示
  const scope = (e.triggerScope && e.triggerScope !== 'self' && !(e.timing || []).includes('ON_HAND_DISCARDED') && !(e.timing || []).includes('ON_SIGNI_POWER_ZERO_OR_LESS') && !(e.timing || []).includes('ON_SIGNI_FROZEN') && !(e.timing || []).includes('ON_CHARM_TO_TRASH') && !(e.timing || []).includes('ON_DRAW') && !(e.timing || []).includes('ON_MAIN_PHASE_START') && !(e.timing || []).includes('ON_TURN_END') && !(e.timing || []).includes('ON_TURN_START') && !(e.timing || []).includes('ON_LRIG_GROW') && (scopeSubj === null || !(e.timing || []).some((t: string) => { const tj = timingJa[t] ?? ''; return tj.startsWith('このシグニ') || tj.startsWith('このカード'); }))) ? `〔範囲:${e.triggerScope}〕` : '';
  // 「〜の間」（ターン条件）は「場合、」を付けず「、」のみ。それ以外は「〜場合、」
  const condStr = e.condition ? condJa(e.condition) : '';
  const cond = condStr ? (condStr.endsWith('間') ? `${condStr}、` : `${condStr}${/(状態|以上|以下|枚)$/.test(condStr) ? 'の' : ''}場合、`) : '';
  // 「〜かぎり」：述語（い形容詞「い」/動詞「る」終わり）はそのまま、名詞終わりは「である」を補う
  const acJa = e.activeCondition ? condJa(e.activeCondition) : '';
  const actCond = e.activeCondition ? `《${acJa}${/[いる]$/.test(acJa) ? '' : 'である'}かぎり》` : '';
  const cost = e.cost ? `〈${costJa(e.cost)}〉` : '';
  const limit = e.usageLimit && e.usageLimit !== 'unlimited' ? `《${e.usageLimit}》` : '';
  // 《自分ターン》/《相手ターン》: AUTO のターン限定発火マーカー（triggerCondition.turnOwner）
  const turnMark = e.triggerCondition?.turnOwner
    ? (e.triggerCondition.turnOwner === 'self' ? '《自分ターン》' : '《相手ターン》') : '';
  const body = actionJa(e.action, e.effectType);
  // ON_MATERIAL_USED は改造素材機構（Step1-3b）で全変種配線済＝engineUnwiredTimings から除外済。
  const unwired = (e.timing || []).some((t: string) => engineUnwiredTimings.has(t)) ? '【※engine未配線】' : '';
  return `${crossCond}${typeMark}${turnMark}${actCond}${trig ? trig + '：' : ''}${scope}${limit}${cost}${cond}${body}${unwired}`;
}

// ── 対象カードの決定 ──
// CardData_Sheet<N>.csv の全カードを CSV 順で対象にする（引数長制限回避）
function sheetTargets(n: string): string[] {
  const p = join(root, 'public/data', `CardData_Sheet${n}.csv`);
  const text = readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return data.map(r => r.CardNum?.trim()).filter((x): x is string => !!x);
}

const args = process.argv.slice(2);

// --sheets: 全シートを docs/decompile_sheet<N>.txt へ UTF-8 直書き（シェルのリダイレクト不要）
if (args[0] === '--sheets') {
  const nums = readdirSync(join(root, 'public/data'))
    .map(f => f.match(/^CardData_Sheet(\d+)\.csv$/)?.[1])
    .filter((x): x is string => !!x)
    .sort((a, b) => Number(a) - Number(b));
  for (const n of nums) {
    const t = sheetTargets(n);
    writeFileSync(join(root, 'docs', `decompile_sheet${n}.txt`), renderCards(t), 'utf-8');
    console.log(`docs/decompile_sheet${n}.txt … ${t.length}枚`);
  }
  console.log(`全${nums.length}シート再生成（UTF-8直書き）。下流は npm run regen が一括で回す。`);
  process.exit(0);
}

let targets: string[] = [];
if (args.includes('--manual')) {
  // manualEffects.ts に登場するカード番号を抽出
  const src = readFileSync(join(root, 'src/data/manualEffects.ts'), 'utf-8');
  targets = [...src.matchAll(/'([A-Z0-9]+-[A-Za-z0-9-]+)':\s*\[/g)].map(m => m[1]);
} else if (args[0] === '--sheet') {
  targets = sheetTargets(args[1] ?? '1');
} else if (args[0] === '--file') {
  // 改行/空白区切りのカード番号ファイル
  targets = readFileSync(args[1], 'utf-8').split(/\s+/).map(s => s.trim()).filter(Boolean);
} else if (args[0] === '--grep') {
  const kw = args[1] ?? '';
  for (const [id, c] of cardMap) {
    if (((c.EffectText ?? '') + (c.BurstText ?? '')).includes(kw) && effectsMap.has(id)) targets.push(id);
  }
} else {
  targets = args;
}
if (targets.length === 0) {
  console.log('使い方: npx tsx scripts/decompileEffects.ts <CardNum...> | --manual | --grep <語> | --sheet <N> | --sheets | --file <path>');
  process.exit(0);
}

// ── 出力（stdout 出力と --sheets のファイル直書きで共用。1 push = 旧 console.log 1行） ──
function renderCards(ids: string[]): string {
  const out: string[] = [];
  for (const id of ids) {
    const card = cardMap.get(id);
    const effs = effectsMap.get(id);
    out.push('\n' + '='.repeat(78));
    out.push(`${id}  ${card?.CardName ?? '(名称不明)'}  [${card?.Type ?? '?'} ${card?.CardClass ?? ''}]`);
    out.push('-'.repeat(78));
    out.push('【原文 EffectText】');
    out.push('  ' + (card?.EffectText ?? '(なし)').replace(/。/g, '。\n  '));
    if (card?.BurstText && card.BurstText !== '-') {
      out.push('【原文 BurstText】');
      out.push('  ' + card.BurstText.replace(/。/g, '。\n  '));
    }
    out.push('\n【JSON 逆翻訳】');
    if (!effs) { out.push('  (effects.json に登録なし)'); continue; }
    currentCardText = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
    // グロウ条件（EffectText の【グロウ】〜【 を runtime checkGrowCondition が評価。JSON効果には含まれないため別途表示）
    const growCondM = (card?.EffectText ?? '').match(/【グロウ】([^【]*)/);
    if (growCondM && growCondM[1].trim()) {
      out.push(`  【グロウ条件】${growCondM[1].trim()}（runtime checkGrowCondition で評価）`);
    }
    for (const e of effs) out.push(`  ${e.effectId}: ${effJa(e)}`);
  }
  out.push('\n' + '='.repeat(78));
  out.push(`${ids.length}枚を表示。逆翻訳は JSON 宣言の和文化（近似/STUBは明示）。原文との食い違いは要確認シグナル。`);
  return out.join('\n') + '\n';
}

process.stdout.write(renderCards(targets));
