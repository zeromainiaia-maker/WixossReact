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
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import type { CardData } from '../src/types';

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
  if (f.powerRange?.max != null) parts.push(`パワー${f.powerRange.max}以下の`);
  if (f.powerRange?.min != null) parts.push(`パワー${f.powerRange.min}以上の`);
  if (f.powerLteSelf) parts.push('このシグニのパワー以下の');
  if (f.powerLtSelf) parts.push('このシグニよりパワーの低い');
  if (f.powerLteLastProcessed) parts.push('直前に処理したシグニのパワー以下の');
  if (f.hasGuard) parts.push('《ガードアイコン》を持つ');
  if (f.hasIcon) parts.push(`《${f.hasIcon}アイコン》を持つ`);
  if (f.isDown) parts.push('ダウン状態の');
  if (f.isUp) parts.push('アップ状態の');
  if (f.isFrozen) parts.push('凍結状態の');
  if (f.hasCharm) parts.push('チャームのある');
  if (f.hasAcce) parts.push('アクセのある');
  if (f.infected) parts.push('感染状態の');
  if (f.colorMatchesLrig) parts.push('センタールリグと共通色の');
  if (f.colorNotMatchesLrig) parts.push('センタールリグと共通色でない');
  if (f.keyword) parts.push(`【${f.keyword}】を持つ`);
  return parts.join('');
}

function targetJa(t?: any, unit = 'シグニ'): string {
  if (!t) return '';
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
  } else u = unit; // SIGNI 等
  // パワー合計上限つき「好きな数」（「パワーの合計がN以下になるように好きな数」）
  if (t.totalPowerMax !== undefined) {
    return `${ownerJa(t.owner)}${filterJa(t.filter)}${u}をパワーの合計が${t.totalPowerMax}以下になるように好きな数`.trim();
  }
  const counter = loc ? '枚' : '体';
  // 動的数：直前にトラッシュした枚数（「トラッシュに置いたシグニ1体につき」）
  if (typeof t.count === 'object' && t.count?.$ref === 'last_processed_count') {
    return `トラッシュに置いたシグニ1${counter}につき${ownerJa(t.owner)}${filterJa(t.filter)}${u}1${counter}`.trim();
  }
  // 「好きな数」（count:'ALL' + upToCount）
  if (t.count === 'ALL' && t.upToCount) {
    return `${ownerJa(t.owner)}好きな数の${filterJa(t.filter)}${u}`.trim();
  }
  const cnt = t.count === 'ALL' ? 'すべての' : '';
  const cntSuf = t.count === 'ALL' ? '' : `${t.count}${t.upToCount ? counter + 'まで' : counter}`;
  const blind = t.blind ? '（見ないで）' : '';
  return `${ownerJa(t.owner)}${cnt}${filterJa(t.filter)}${u}${cntSuf ? cntSuf : ''}${blind}`.trim();
}

function costJa(c?: any): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.energy) parts.push(c.energy.map((e: any) => `《${e.color}×${e.count}》`).join(''));
  if (c.exceed != null) parts.push(`エクシード${c.exceed}`);
  if (c.down_self) parts.push('《ダウン》');
  if (c.discard != null) parts.push(`手札${c.discard}枚を捨てる`);
  if (c.handDiscardSigni) parts.push(`手札から${filterJa(c.handDiscardSigni)}シグニ${c.handDiscardSigni.count}枚を捨てる`);
  if (c.discardGroups) parts.push(c.discardGroups.map((g: any) => `手札から${filterJa(g.filter)}を${g.count}枚捨てる`).join('＋'));
  if (c.coin != null) parts.push(`コイン${c.coin}`);
  if (c.charmTrash != null) parts.push(`場の【チャーム】${c.charmTrash}枚をトラッシュ`);
  if (c.charmTrashVariable) parts.push('場の【チャーム】を好きな枚数トラッシュ');
  if (c.fieldTrash) parts.push(`場から${c.fieldTrash.excludeSelf ? '他の' : ''}${filterJa(c.fieldTrash.filter)}シグニ${c.fieldTrash.count}体をトラッシュ`);
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
    case 'ENERGY_COUNT': return `${ownerJa(c.owner)}エナが${numJa(c.value)}${opJa(c.operator)}`;
    case 'ENERGY_COUNT_FILTER': return `${ownerJa(c.owner)}エナゾーンに${c.distinctName ? '名前の異なる' : ''}${filterJa(c.filter)}カードが${numJa(c.value)}枚${opJa(c.operator)}`;
    case 'ENERGY_HAS_COLOR': return `${ownerJa(c.owner)}エナゾーンに${(c.colors || []).map((col: string) => `《${col}》のカード`).join('と')}がある`;
    case 'LRIG_NAME_CONTAINS': return `${ownerJa(c.owner)}センタールリグ名が「${c.name}」を含む`;
    case 'LRIG_COLOR': return `${ownerJa(c.owner)}センタールリグが${c.color}`;
    case 'LRIG_LEVEL': return `${ownerJa(c.owner)}センタールリグがレベル${numJa(c.value)}${opJa(c.operator)}`;
    case 'FIELD_CLASS_COUNT': return `${ownerJa(c.owner)}場に＜${c.story}＞が${numJa(c.value)}体${opJa(c.operator)}`;
    case 'TRASH_HAS_CARD': return `${ownerJa(c.owner)}トラッシュに${filterJa(c.filter)}カードがある`;
    case 'TRASH_COUNT': return `${ownerJa(c.owner)}トラッシュにカードが${numJa(c.value)}枚${opJa(c.operator)}`;
    case 'LAST_PROCESSED_HAS_BURST': return '直前のカードが【ライフバースト】を持つ';
    case 'HAS_CARD_IN_FIELD': return `${ownerJa(c.owner)}場に${c.excludeSelf ? '他の' : ''}${filterJa(c.filter)}シグニが${c.minCount && c.minCount > 1 ? numJa(c.minCount) + '体以上' : ''}いる`;
    case 'PAID_ADDITIONAL_COST': return '（コストを支払った場合）';
    case 'CARDS_DRAWN_BY_EFFECT': return `このターン効果で${numJa(c.value)}枚${opJa(c.operator)}引いた`;
    case 'IS_MY_TURN': return '自分のターンの間';
    case 'IS_OPPONENT_TURN': return '対戦相手のターンの間';
    case 'DECK_TOP_MATCHES': return `${ownerJa(c.owner)}デッキの一番上が${filterJa(c.filter)}カード`;
    case 'LRIG_STORY': return `${ownerJa(c.owner)}センタールリグが＜${c.story}＞`;
    case 'LRIG_LEVEL_EQ_OPP': return '自分と対戦相手のセンタールリグのレベルが同じ';
    case 'LRIG_TRASH_COUNT': return `ルリグトラッシュに${c.cardType ? c.cardType : ''}が${numJa(c.value)}枚${opJa(c.operator)}`;
    case 'SUBSCRIBER_COUNT': return `登録者数が${numJa(c.value)}万${opJa(c.operator)}`;
    case 'SELF_POWER_GTE': return `このシグニのパワーが${numJa(c.value)}以上`;
    case 'THIS_CARD_FROM_TRASH': return 'このシグニがトラッシュから場に出た';
    case 'FIELD_SIGNI_POWER_COUNT': return `${ownerJa(c.owner)}場にパワー${c.minPower}以上のシグニが${numJa(c.value)}体${opJa(c.operator)}`;
    case 'LIFE_COMPARE_OPP': return `自分のライフが対戦相手${opJa(c.operator)}`;
    case 'DURING_PHASE': return `${(c.phases || []).join('/')}フェイズの間`;
    case 'THIS_CARD_IN_LOCATION': return `このカードが${c.location}にある`;
    case 'THIS_CARD_IN_CENTER_ZONE': return 'このシグニが中央ゾーンにある';
    case 'THIS_CARD_IS_DOWN': return 'このシグニがダウンしている';
    case 'THIS_CARD_IS_ARMORED': return 'このシグニが血晶武装状態';
    case 'THIS_CARD_IS_AWAKENED': return 'このシグニが覚醒状態';
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
    case 'ENERGY_TRASH_COLOR_COUNT_GTE': return `この方法で指定色のカードが${numJa(c.value)}枚以上トラッシュに置かれた`;
    case 'BEAT_CONDITION': return `《ビート》[${c.condText ?? ''}]`;
    case 'COND_STUB': return `[条件STUB:${c.raw ?? ''}]`;
    // ── ActiveCondition（CONTINUOUS の activeCondition）系 ──
    case 'COUNT_THRESHOLD': {
      const loc = ({ hand: '手札', trash: 'トラッシュ', energy: 'エナ', deck: 'デッキ', life_cloth: 'ライフ', lrig_deck: 'ルリグデッキ', lrig_trash: 'ルリグトラッシュ' } as Record<string, string>)[c.location] ?? c.location;
      return `${ownerJa(c.owner)}${loc}が${numJa(c.value)}枚${opJa(c.operator)}`;
    }
    case 'SELF_POWER_THRESHOLD': return `このシグニのパワーが${numJa(c.value)}${opJa(c.operator)}`;
    // diff = 自分 − 相手（符号付き）。gte のみ使用＝「自分が相手よりN枚以上多い」（相手が多い場合は不成立）
    case 'HAND_DIFF': return `あなたの手札が対戦相手より${numJa(c.value)}枚${opJa(c.operator)}多い`;
    case 'ENA_DIFF': return `あなたのエナが対戦相手より${numJa(c.value)}枚${opJa(c.operator)}多い`;
    case 'EICHI_LEVEL_SUM': return `英知（＜英知＞シグニのレベル合計）が${numJa(c.value)}${opJa(c.operator)}`;
    case 'VIRUS_COUNT': return `${ownerJa(c.owner)}場の【ウィルス】が${numJa(c.value)}${opJa(c.operator)}`;
    case 'IS_SELF_ARMORED': return 'このシグニが血晶武装状態';
    case 'IS_SELF_ACCED': return 'このシグニに【アクセ】が付いている';
    case 'IS_SELF_ACCE_CARD': return 'このカードが【アクセ】として付いている';
    case 'IS_SELF_AWAKENED': return 'このシグニが覚醒状態';
    case 'IS_SELF_IN_CENTER_ZONE': return 'このシグニが中央ゾーンにある';
    default: return `[条件:${c.type}]`;
  }
}

function actionJa(a?: Action, effectType?: string): string {
  if (!a) return '';
  switch (a.type) {
    case 'DRAW': return `${ownerJa(a.owner)}カードを${numJa(a.count)}枚引く`;
    case 'DRAW_PER_FIELD_COUNT': return `${ownerJa(a.countOwner)}場の${filterJa(a.countFilter)}シグニ1体につきカードを${a.drawPerUnit}枚引く`;
    case 'ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT': return `${ownerJa(a.countOwner)}場の${filterJa(a.countFilter)}シグニ1体につきデッキの一番上のカードを${a.chargePerUnit}枚エナゾーンに置く`;
    case 'BANISH': return a.opponentSelects
      ? `対戦相手は自分の${filterJa(a.target?.filter)}シグニ${a.target?.count === 'ALL' ? 'すべて' : `${a.target?.count ?? 1}体`}を選んでバニッシュする`
      : `${targetJa(a.target)}をバニッシュする${a.optional ? '（してもよい）' : ''}`;
    case 'BOUNCE': return `${targetJa(a.target)}を手札に戻す${a.optional ? '（してもよい）' : ''}`;
    case 'TRASH': {
      const t = a.target;
      const u = t?.type === 'HAND_CARD' ? '手札' : t?.type === 'ENERGY_CARD' ? 'エナ' : t?.type === 'DECK_CARD' ? 'デッキの上からカード' : '';
      if (t?.type === 'SIGNI') return `${targetJa(t)}をトラッシュに置く${a.opponentSelects && t?.owner === 'opponent' ? '（相手が選ぶ）' : ''}`;
      // 手札/エナの「誰が選ぶか」を明示（見ないでランダム / 自分が見て選ぶ / 相手が選ぶ）
      const who = a.opponentSelects && t?.owner === 'opponent'
        ? '（相手が選ぶ）'
        : t?.type === 'HAND_CARD' && t?.owner === 'opponent'
        ? (t.blind ? '（見ないでランダム）' : t.actingPlayerSelects ? '（自分が見て選ぶ）' : '（相手が選ぶ）')
        : '';
      const cnt = t?.count === 'ALL' ? 'すべて' : `${t?.count}枚${t?.upToCount ? 'まで' : ''}`;
      return `${ownerJa(t?.owner)}${filterJa(t?.filter)}${u}を${cnt}トラッシュに置く${t?.thisCardOnly ? '（このカード）' : ''}${who}`;
    }
    case 'POWER_MODIFY': return `${a.targetsTriggerSource ? 'それ（トリガー元シグニ）' : targetJa(a.target)}のパワーを${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta)}する${a.duration === 'UNTIL_OPP_TURN_END' ? '（次の相手ターン終了時まで）' : ''}`;
    case 'POWER_SET': {
      // CONTINUOUS の POWER_SET で count≠ALL は engine 上「このシグニのみ」に解決される（effectEngine 参照）
      const thisOnly = effectType === 'CONTINUOUS' && a.target?.count !== 'ALL'
        && (a.target?.owner === 'self' || a.target?.owner === 'any');
      const tgt = thisOnly ? 'このシグニの基本パワー' : `${targetJa(a.target)}のパワー`;
      return `${tgt}を${a.value}にする`;
    }
    case 'POWER_MODIFY_PER_HAND_COUNT': return `${targetJa(a.target)}のパワーを手札1枚につき${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta)}する`;
    case 'FREEZE': return `${targetJa(a.target)}を${a.down ? 'ダウンして凍結する' : '凍結する'}`;  // down:true のときのみダウンも行う
    case 'DOWN': return `${targetJa(a.target)}をダウンする`;
    case 'UP': return `${targetJa(a.target)}をアップする`;
    case 'ENERGY_CHARGE': return `${ownerJa(a.owner)}デッキから${numJa(a.count)}枚エナチャージする`;
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
        return `このシグニをトラッシュから${a.asDown ? 'ダウン状態で' : ''}場に出す`;
      return a.source ? `${targetJa(a.source)}をコストを支払わずに場に出す` : (a.cardName ? `クラフト/トークンの《${a.cardName}》を場に出す` : '直前に選んだカードを場に出す');
    case 'BLOCK_ACTION':
      if (a.actionId === 'ON_PLAY_ABILITY') return 'その【出】能力は発動しない';
      return `${ownerJa(a.target?.owner)}${a.target?.type === 'SIGNI' ? 'シグニ' : ''}は「${a.actionId}」ができない（${a.until ?? ''}）`;
    case 'LOOK_AND_REORDER': {
      const src = a.source?.owner === 'opponent' ? '対戦相手の' : 'あなたの';
      const loc = a.source?.location === 'hand' ? '手札' : 'デッキの上';
      const ops = [a.reorder ? '並べ替える' : '見る', a.canTrash ? '（不要札はトラッシュ可）' : ''].filter(Boolean).join('');
      return `${src}${loc}${a.count === 99 ? '' : numJa(a.count) + '枚'}を${ops}`;
    }
    case 'MILL': return `${ownerJa(a.owner)}デッキの上から${numJa(a.count)}枚トラッシュに置く`;
    case 'LIFE_CRASH': return a.triggerBurst === false
      ? `${ownerJa(a.owner)}ライフクロスを${numJa(a.count)}枚トラッシュに置く（バースト不発）${a.conditional ? '（そうした場合）' : ''}`
      : `${ownerJa(a.owner)}ライフクロスを${numJa(a.count)}枚クラッシュする${a.conditional ? '（そうした場合）' : ''}`;
    case 'TRANSFER_TO_HAND': return `${targetJa(a.source)}を手札に加える`;
    case 'TRANSFER_TO_DECK': return a.shuffle
      ? `${targetJa(a.source)}をデッキに加えてシャッフルする`
      : `${targetJa(a.source)}をデッキの${a.position === 'bottom' ? '一番下' : '上'}に置く`;
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
      return `${targetJa(a.target)}に【${a.keyword}】を与える${durJa}`;
    }
    case 'REMOVE_ABILITIES': return `${a.target?.thisCardOnly ? 'このシグニ' : targetJa(a.target)}は能力を失う${a.frontOfSelf ? '（正面）' : ''}`;
    case 'GRANT_PROTECTION': {
      const subject = a.target ? targetJa(a.target) : filterJa(a.subjectFilter) + 'シグニ';
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
      const axisJa: Record<string, string> = { BANISH: 'バニッシュされ', BOUNCE: '手札に戻され', DOWN: 'ダウンし', FREEZE: '凍結され' };
      const axes = fromArr.map(f => axisJa[f] ?? (f + 'され'));
      return `${subject}は${ownerJa(a.sourceOwner)}効果によって${axes.join('・')}ない`;
    }
    case 'GRANT_FIELD_SHADOW': return `${filterJa(a.filter)}${ownerJa(a.targetOwner)}シグニは【${a.keyword}】を得る`;
    case 'GRANT_FIELD_SIGNI_ABILITY': return `${ownerJa(a.targetOwner)}${filterJa(a.filter)}シグニは『${(a.abilities || []).map(effJa).join(' / ')}』を得る`;
    case 'SEQUENCE': {
      if (!a.steps || a.steps.length === 0) return '何もしない';
      const parts = a.steps.map(actionJa) as string[];
      return parts.reduce((acc: string, part: string, i: number) => {
        if (i === 0) return part;
        // IS_MY_TURN の CONDITIONAL は「そうした場合」で始まるので「そして」は不要
        if (a.steps[i]?.condition?.type === 'IS_MY_TURN' || part.startsWith('そうした場合')) {
          return acc + '。' + part;
        }
        return acc + '。そして' + part;
      }, '');
    }
    case 'CHOOSE': return `次から${a.choose_count}つ選ぶ【${(a.choices || []).map((c: any) => actionJa(c.action)).join(' / ')}】`;
    case 'CONDITIONAL': {
      // IS_MY_TURN は「そうした場合」マーカーとして使われる
      if (a.condition?.type === 'IS_MY_TURN') {
        return `そうした場合、${actionJa(a.then)}`;
      }
      return `${condJa(a.condition)}なら、${actionJa(a.then)}`;
    }
    case 'BANISH_SUBSTITUTE': {
      const sc = a.substituteCost ?? {};
      const cost = sc.discardSpell ? `手札からスペル${sc.discardSpell}枚を捨てる`
        : sc.trashStackSpell ? `このシグニの下からスペル${sc.trashStackSpell}枚をトラッシュする`
        : sc.powerReduction ? `このシグニのパワーを－${sc.powerReduction}する` : '';
      return `${targetJa(a.trigger)}がバニッシュされる場合、代わりに${cost}てもよい`;
    }
    case 'REVEAL_AND_PICK': {
      const rapOwner = a.owner ?? a.from?.owner;
      const rapCnt = a.revealCount ?? a.count;
      const rapFilter = a.filter ?? a.pickFilter;
      const thenJa = a.then
        ? (a.then.type === 'ADD_TO_HAND' ? '手札に加える'
         : a.then.type === 'ADD_TO_FIELD' ? '場に出す'
         : actionJa(a.then))
        : (a.pickTo === 'field' ? '場に出す' : a.pickTo === 'hand' ? '手札に加える' : '処理する');
      const pickN = a.pickCount === 'ALL' ? 'すべて' : `${numJa(a.pickCount ?? 1)}枚`;
      const filterStr = rapFilter ? filterJa(rapFilter) + 'シグニ' : 'カード';
      // 残り（remainder）の行き先を反映
      const rem = a.remainder;
      const remJa = !rem ? ''
        : rem.location === 'trash' ? '、残りをトラッシュに置く'
        : rem.location === 'deck'
          ? (rem.position === 'bottom' ? '、残りをデッキの一番下に置く' : '、残りをデッキの上に戻す')
          : '、残りを戻す';
      return `${ownerJa(rapOwner)}デッキ${rapCnt ? '上' + numJa(rapCnt) + '枚' : ''}を公開し、その中から${filterStr}を${pickN}${thenJa}${remJa}`;
    }
    case 'REARRANGE_SIGNI': return a.swap ? 'このシグニと対象シグニの位置を入れ替える' : `${targetJa(a.target)}を再配置する`;
    case 'NEGATE_ATTACK': return 'そのアタックを無効にする';
    case 'COUNTER_SPELL': return `スペル${a.maxCost != null ? '（コスト' + a.maxCost + '以下）' : ''}の効果を打ち消す`;
    case 'SHUFFLE_DECK': return `${ownerJa(a.owner)}デッキをシャッフルする`;
    case 'EQUALIZE_ENERGY': return 'エナゾーンの枚数を揃える';
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
    case 'ATTACH_CHARM': return `${targetJa(a.target)}にチャームを付ける`;
    case 'REMOVE_CHARM': return `${ownerJa(a.targetOwner)}シグニのチャームを${a.count === 'ALL' ? 'すべて' : a.count}外す`;
    case 'CONDITIONAL_DISCARD': return `${condJa(a.condition)}なら、${actionJa(a.then)}`;
    case 'POWER_MODIFY_PER_TRASH_COUNT':
    case 'POWER_MODIFY_PER_LIFE_COUNT':
    case 'POWER_MODIFY_PER_STACK':
    case 'POWER_MODIFY_PER_LEVEL_SUM':
    case 'POWER_MODIFY_PER_LRIG_LEVEL':
    case 'POWER_MODIFY_PER_FIELD':
    case 'POWER_MODIFY_PER_ENERGY':
    case 'POWER_MODIFY_PER_CHARM':
    case 'POWER_MODIFY_PER_DECK_COUNT':
    case 'POWER_MODIFY_PER_ENERGY_COLOR':
    case 'POWER_MODIFY_PER_VIRUS_COUNT': {
      const per = a.type.replace('POWER_MODIFY_PER_', '');
      const d = a.deltaPerUnit ?? a.deltaPerLevel ?? a.deltaPerLife ?? a.delta ?? a.deltaPerColor ?? 0;
      return `${targetJa(a.target)}のパワーを${per}数に応じて${d >= 0 ? '＋' : '－'}${Math.abs(d)}ずつ変更する`;
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
      return `${ownerJa(a.targetOwner)}が使用する${a.targetCardType ?? 'カード'}のコストは${inc}増える`;
    }
    case 'PREVENT_DAMAGE': return 'ダメージを無効にする';
    case 'LEVEL_MODIFY': return `${targetJa(a.target)}のレベルを${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta ?? 0)}する`;
    case 'FORCE_END_TURN': return 'ターンを終了する';
    case 'POWER_MULTIPLY': return `${targetJa(a.target)}のパワーを${a.factor ?? ''}倍にする`;
    case 'POWER_FLIP': return `${targetJa(a.target)}のパワーの増減を反転する`;
    case 'POWER_MODIFY_BY_TARGET_LEVEL': return `${targetJa(a.target)}のパワーを対象のレベルに応じて変更する`;
    case 'POWER_MODIFY_PER_TRASHED_LEVEL': return `${targetJa(a.target)}のパワーをトラッシュしたシグニのレベル合計に応じて変更する`;
    case 'PLACE_UNDER_SIGNI': return `${targetJa(a.source)}をこのシグニの下に置く`;
    case 'TAKE_FROM_UNDER_SIGNI': return 'このシグニの下のカードを取る';
    case 'STACK_SPELL': return 'トラッシュからスペルをこのカードの下に置く';
    case 'REVEAL': return `${ownerJa(a.owner)}デッキの上を公開する`;
    case 'GRANT_LRIG_ABILITY': return `あなたのセンタールリグは『${(a.abilities || []).map(effJa).join(' / ') || a.rawText || ''}』を得る`;
    case 'UNKNOWN': return `【未実装/UNKNOWN：${a.text ?? a.raw ?? ''}】`;
    case 'STUB': {
      // 相手センタールリグ色による基本コスト軽減（支払い時 computeArtsEffectiveCost が適用＝実装済み）
      if (a.id === 'CONDITIONAL_CARD_COST_BY_OPP_LRIG') {
        return '相手センタールリグ色が条件を満たす場合は基本コストを軽減（支払い時に自動適用）';
      }
      if (a.id === 'FREE_GROW_NEXT_TURN') return '次のあなたのターンの間、あなたのグロウコストは《無×0》になる（実質フリーグロウ）';
      if (a.id === 'GROW_COST_ZERO') return 'あなたのグロウコストは《無×0》になる（実質フリーグロウ）';
      const burstExtra = a.id === 'GRANT_ALL_ZONE_LIFEBURST'
        ? `（全領域のカードに【ライフバースト】付与${a.burstAdditive ? '・既存バーストにも追加' : ''}${a.burstFilter ? '・対象' + filterJa(a.burstFilter) : ''}${a.burstAction ? '・効果=' + actionJa(a.burstAction) : ''}）`
        : '';
      const extra = `${burstExtra}${a.banishSubstitute ? ' ' + JSON.stringify(a.banishSubstitute) : ''}${a.costColors ? ' コスト' + a.costColors.join('') : ''}`;
      const allFieldLimitM = a.id.match(/^LIMIT_ALL_FIELD_(\d+)$/);
      if (allFieldLimitM) return `[STUB:すべてのプレイヤーはシグニを${allFieldLimitM[1]}体しか場に出せない（超過分はトラッシュ）${extra}]`;
      // STUBS.md に説明があれば id ではなく説明文を表示（無ければ id にフォールバック）
      const desc = stubDescMap.get(a.id);
      return desc ? `[STUB:${desc}${extra}]` : `[STUB:${a.id}${extra}]`;
    }
    default: return `[アクション:${a.type}]`;
  }
}

const timingJa: Record<string, string> = {
  ON_PLAY: 'このシグニが場に出たとき', ON_ATTACK_SIGNI: 'このシグニがアタックしたとき',
  ON_ATTACK_LRIG: 'このルリグがアタックしたとき',
  ON_BANISH: 'このシグニ（など）がバニッシュされたとき', ON_TRASH: 'このカードがトラッシュに置かれたとき',
  ON_TURN_START: 'ターン開始時', ON_TURN_END: 'ターン終了時',
  ON_ATTACK_PHASE_START: 'あなたのアタックフェイズ開始時', ON_LIFE_CRASHED: 'あなたのライフがクラッシュされたとき',
  ON_OPP_LIFE_CRASHED: '対戦相手のライフがクラッシュされたとき', ON_SIGNI_BATTLE: 'このシグニがバトルしたとき',
  ON_SIGNI_DAMAGE: 'このシグニが相手にダメージを与えたとき', ON_LEAVE_FIELD: 'このカードが場を離れたとき',
  ON_SPELL_USE: 'あなたがスペルを使用したとき', ON_GUARD: 'あなたがガードしたとき',
  MAIN: '（メイン起動）', ON_LIFE_BURST: '【ライフバースト】',
  ON_ENERGY_CHARGE: 'あなたのエナゾーンにカード1枚が置かれたとき', ON_POWER_THRESHOLD: 'このシグニのパワーが閾値以上になったとき',
  SPELL_CUTIN: 'スペルカットイン', ON_OPP_SIGNI_ATTACK_DIRECT: '対戦相手のシグニが正面が空の状態でアタックしたとき',
};

function effJa(e: Eff): string {
  const typeMark = e.effectType === 'AUTO' ? '【自】' : e.effectType === 'CONTINUOUS' ? '【常】'
    : e.effectType === 'ACTIVATED' ? '【起】' : e.effectType === 'LIFE_BURST' ? '【LB】' : `【${e.effectType}】`;
  // triggerScope（any_ally/any_opp/any）+ triggerFilter を主語に反映（「このシグニが」→「あなたの赤のシグニが」等）
  const subjFilter = e.triggerFilter ? filterJa(e.triggerFilter) : '';
  const scopeSubj = e.triggerScope === 'any_ally' ? `あなたの${subjFilter}`
    : e.triggerScope === 'any_opp' ? `対戦相手の${subjFilter}`
    : e.triggerScope === 'any' ? `いずれかの${subjFilter}`
    : null;
  const trig = (e.timing || []).map((t: string) => {
    let s = timingJa[t] ?? t;
    if (scopeSubj !== null && s.startsWith('このシグニ')) s = `${scopeSubj}シグニ${s.slice('このシグニ'.length)}`;
    // ON_SPELL_USE は triggerFilter.color を使用スペルの色として反映（「あなたが緑のスペルを使用したとき」）
    if (t === 'ON_SPELL_USE' && e.triggerFilter?.color) s = `あなたが${[].concat(e.triggerFilter.color).join('・')}のスペルを使用したとき`;
    return s;
  }).join('/');
  // 主語に反映できなかった scope のみマーカー表示
  const scope = (e.triggerScope && e.triggerScope !== 'self' && (scopeSubj === null || !(e.timing || []).some((t: string) => (timingJa[t] ?? '').startsWith('このシグニ')))) ? `〔範囲:${e.triggerScope}〕` : '';
  const cond = e.condition ? `${condJa(e.condition)}場合、` : '';
  // 「〜かぎり」：述語（い形容詞「い」/動詞「る」終わり）はそのまま、名詞終わりは「である」を補う
  const acJa = e.activeCondition ? condJa(e.activeCondition) : '';
  const actCond = e.activeCondition ? `《${acJa}${/[いる]$/.test(acJa) ? '' : 'である'}かぎり》` : '';
  const cost = e.cost ? `〈${costJa(e.cost)}〉` : '';
  const limit = e.usageLimit && e.usageLimit !== 'unlimited' ? `《${e.usageLimit}》` : '';
  const body = actionJa(e.action, e.effectType);
  return `${typeMark}${actCond}${trig ? trig + '：' : ''}${scope}${limit}${cost}${cond}${body}`;
}

// ── 対象カードの決定 ──
const args = process.argv.slice(2);
let targets: string[] = [];
if (args.includes('--manual')) {
  // manualEffects.ts に登場するカード番号を抽出
  const src = readFileSync(join(root, 'src/data/manualEffects.ts'), 'utf-8');
  targets = [...src.matchAll(/'([A-Z0-9]+-[A-Za-z0-9-]+)':\s*\[/g)].map(m => m[1]);
} else if (args[0] === '--sheet') {
  // CardData_Sheet<N>.csv の全カードを CSV 順で対象にする（引数長制限回避）
  const n = args[1] ?? '1';
  const p = join(root, 'public/data', `CardData_Sheet${n}.csv`);
  const text = readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  targets = data.map(r => r.CardNum?.trim()).filter((x): x is string => !!x);
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
  console.log('使い方: npx tsx scripts/decompileEffects.ts <CardNum...> | --manual | --grep <語>');
  process.exit(0);
}

// ── 出力 ──
for (const id of targets) {
  const card = cardMap.get(id);
  const effs = effectsMap.get(id);
  console.log('\n' + '='.repeat(78));
  console.log(`${id}  ${card?.CardName ?? '(名称不明)'}  [${card?.Type ?? '?'} ${card?.CardClass ?? ''}]`);
  console.log('-'.repeat(78));
  console.log('【原文 EffectText】');
  console.log('  ' + (card?.EffectText ?? '(なし)').replace(/。/g, '。\n  '));
  if (card?.BurstText && card.BurstText !== '-') {
    console.log('【原文 BurstText】');
    console.log('  ' + card.BurstText.replace(/。/g, '。\n  '));
  }
  console.log('\n【JSON 逆翻訳】');
  if (!effs) { console.log('  (effects.json に登録なし)'); continue; }
  for (const e of effs) console.log(`  ${e.effectId}: ${effJa(e)}`);
}
console.log('\n' + '='.repeat(78));
console.log(`${targets.length}枚を表示。逆翻訳は JSON 宣言の和文化（近似/STUBは明示）。原文との食い違いは要確認シグナル。`);
