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
const opJa = (op?: string) => ({ gte: '以上', lte: '以下', gt: 'より多く', lt: '未満', eq: '＝' } as Record<string, string>)[op ?? ''] ?? (op ?? '');
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
  if (f.cardClass) parts.push(`＜${[].concat(f.cardClass).join('・')}＞の`);
  if (f.story) parts.push(`＜${[].concat(f.story).join('・')}＞の`);
  if (f.cardName) parts.push(`《${f.cardName}》`);
  if (f.cardNames) parts.push(`《${f.cardNames.join('》《')}》のいずれか`);
  if (typeof f.level === 'number') parts.push(`レベル${f.level}の`);
  else if (f.level?.max != null) parts.push(`レベル${f.level.max}以下の`);
  else if (f.level?.min != null) parts.push(`レベル${f.level.min}以上の`);
  if (f.levelRange?.max != null) parts.push(`レベル${f.levelRange.max}以下の`);
  if (f.levelRange?.min != null) parts.push(`レベル${f.levelRange.min}以上の`);
  if (f.powerRange?.max != null) parts.push(`パワー${f.powerRange.max}以下の`);
  if (f.powerRange?.min != null) parts.push(`パワー${f.powerRange.min}以上の`);
  if (f.powerLteSelf) parts.push('このシグニのパワー以下の');
  if (f.powerLtSelf) parts.push('このシグニよりパワーの低い');
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
  return parts.join('');
}

function targetJa(t?: any, unit = 'シグニ'): string {
  if (!t) return '';
  const u = t.type === 'HAND_CARD' ? 'カード(手札)' : t.type === 'TRASH_CARD' ? 'カード(トラッシュ)'
    : t.type === 'ENERGY_CARD' ? 'カード(エナ)' : t.type === 'DECK_CARD' ? 'カード(デッキ)'
    : t.type === 'LRIG' ? 'ルリグ' : t.type === 'CENTER_LRIG_OR_SIGNI' ? 'センタールリグかシグニ'
    : t.type === 'PLAYER' ? '' : unit;
  const cnt = t.count === 'ALL' ? 'すべての' : '';
  const cntSuf = t.count === 'ALL' ? '' : `${t.count}${t.upToCount ? '体まで' : '体'}`;
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
  if (c.handDiscardSigni) parts.push(`手札から${c.handDiscardSigni.color ? '《' + c.handDiscardSigni.color + '》' : ''}シグニ${c.handDiscardSigni.count}枚を捨てる`);
  if (c.discardGroups) parts.push(c.discardGroups.map((g: any) => `手札から${filterJa(g.filter)}を${g.count}枚捨てる`).join('＋'));
  if (c.coin != null) parts.push(`コイン${c.coin}`);
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
    case 'LIFE_COUNT': return `${ownerJa(c.owner)}ライフが${numJa(c.value)}${opJa(c.operator)}`;
    case 'ENERGY_COUNT': return `${ownerJa(c.owner)}エナが${numJa(c.value)}${opJa(c.operator)}`;
    case 'LRIG_NAME_CONTAINS': return `${ownerJa(c.owner)}センタールリグ名が「${c.name}」を含む`;
    case 'LRIG_COLOR': return `${ownerJa(c.owner)}センタールリグが${c.color}`;
    case 'LRIG_LEVEL': return `${ownerJa(c.owner)}センタールリグがレベル${numJa(c.value)}${opJa(c.operator)}`;
    case 'FIELD_CLASS_COUNT': return `${ownerJa(c.owner)}場に＜${c.story}＞が${numJa(c.value)}体${opJa(c.operator)}`;
    case 'TRASH_HAS_CARD': return `${ownerJa(c.owner)}トラッシュに${filterJa(c.filter)}カードがある`;
    case 'HAS_CARD_IN_FIELD': return `${ownerJa(c.owner)}場に${filterJa(c.filter)}シグニがいる`;
    case 'PAID_ADDITIONAL_COST': return '（コストを支払った場合）';
    case 'CARDS_DRAWN_BY_EFFECT': return `このターン効果で${numJa(c.value)}枚${opJa(c.operator)}引いた`;
    default: return `[条件:${c.type}]`;
  }
}

function actionJa(a?: Action): string {
  if (!a) return '';
  switch (a.type) {
    case 'DRAW': return `${ownerJa(a.owner)}カードを${numJa(a.count)}枚引く`;
    case 'BANISH': return `${targetJa(a.target)}をバニッシュする${a.optional ? '（してもよい）' : ''}`;
    case 'BOUNCE': return `${targetJa(a.target)}を手札に戻す${a.optional ? '（してもよい）' : ''}`;
    case 'TRASH': {
      const u = a.target?.type === 'HAND_CARD' ? '手札' : a.target?.type === 'ENERGY_CARD' ? 'エナ' : '';
      if (a.target?.type === 'SIGNI') return `${targetJa(a.target)}をトラッシュに置く`;
      return `${ownerJa(a.target?.owner)}${u}を${a.target?.count === 'ALL' ? 'すべて' : a.target?.count + '枚'}トラッシュに置く${a.target?.thisCardOnly ? '（このカード）' : ''}`;
    }
    case 'POWER_MODIFY': return `${targetJa(a.target)}のパワーを${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta)}する${a.duration === 'UNTIL_OPP_TURN_END' ? '（次の相手ターン終了時まで）' : ''}`;
    case 'POWER_SET': return `${targetJa(a.target)}のパワーを${a.value}にする`;
    case 'POWER_MODIFY_PER_HAND_COUNT': return `${targetJa(a.target)}のパワーを手札1枚につき${a.delta >= 0 ? '＋' : '－'}${Math.abs(a.delta)}する`;
    case 'FREEZE': return `${targetJa(a.target)}を凍結する`;
    case 'DOWN': return `${targetJa(a.target)}をダウンする`;
    case 'UP': return `${targetJa(a.target)}をアップする`;
    case 'ENERGY_CHARGE': return `${ownerJa(a.owner)}デッキから${numJa(a.count)}枚エナチャージする`;
    case 'ENERGY_CHARGE_FROM_DECK': return `${ownerJa(a.owner)}デッキの上から${numJa(a.count)}枚をエナゾーンに置く`;
    case 'ADD_TO_LIFE': return `${ownerJa(a.owner)}デッキの${a.fromTop ? '一番上' : ''}から${numJa(a.count)}枚をライフクロスに加える`;
    case 'ADD_TO_FIELD': return a.source ? `${targetJa(a.source)}をコストを支払わずに場に出す` : '直前に選んだカードを場に出す';
    case 'BLOCK_ACTION': return `${ownerJa(a.target?.owner)}${a.target?.type === 'SIGNI' ? 'シグニ' : ''}は「${a.actionId}」ができない（${a.until ?? ''}）`;
    case 'LOOK_AND_REORDER': {
      const src = a.source?.owner === 'opponent' ? '対戦相手の' : 'あなたの';
      const loc = a.source?.location === 'hand' ? '手札' : 'デッキの上';
      const ops = [a.reorder ? '並べ替える' : '見る', a.canTrash ? '（不要札はトラッシュ可）' : ''].filter(Boolean).join('');
      return `${src}${loc}${a.count === 99 ? '' : numJa(a.count) + '枚'}を${ops}`;
    }
    case 'MILL': return `${ownerJa(a.owner)}デッキの上から${numJa(a.count)}枚トラッシュに置く`;
    case 'LIFE_CRASH': return `${ownerJa(a.owner)}ライフクロスを${numJa(a.count)}枚クラッシュする`;
    case 'TRANSFER_TO_HAND': return `${targetJa(a.source)}を手札に加える`;
    case 'TRANSFER_TO_DECK': return `${targetJa(a.source)}をデッキの${a.position === 'bottom' ? '一番下' : '上'}に置く`;
    case 'ADD_TO_HAND': return `${targetJa(a.target)}を手札に加える`;
    case 'SEARCH': return `${ownerJa(a.from?.owner)}デッキから${filterJa(a.filter)}カードを${a.maxCount ? a.maxCount + '枚まで' : ''}探して手札に加える${a.afterSearch ? '（その後シャッフル）' : ''}`;
    case 'GRANT_KEYWORD': return `${targetJa(a.target)}に【${a.keyword}】を与える`;
    case 'REMOVE_ABILITIES': return `${a.target?.thisCardOnly ? 'このシグニ' : targetJa(a.target)}は能力を失う${a.frontOfSelf ? '（正面）' : ''}`;
    case 'GRANT_PROTECTION': return `${a.target ? targetJa(a.target) : filterJa(a.subjectFilter) + 'シグニ'}は${ownerJa(a.sourceOwner)}効果によって${a.from?.join('・')}されない`;
    case 'GRANT_FIELD_SHADOW': return `${filterJa(a.filter)}${ownerJa(a.targetOwner)}シグニは【${a.keyword}】を得る`;
    case 'GRANT_FIELD_SIGNI_ABILITY': return `${ownerJa(a.targetOwner)}${filterJa(a.filter)}シグニは『${(a.abilities || []).map(effJa).join(' / ')}』を得る`;
    case 'SEQUENCE': return a.steps.map(actionJa).join('。そして');
    case 'CHOOSE': return `次から${a.choose_count}つ選ぶ【${(a.choices || []).map((c: any) => actionJa(c.action)).join(' / ')}】`;
    case 'CONDITIONAL': return `${condJa(a.condition)}なら、${actionJa(a.then)}`;
    case 'BANISH_SUBSTITUTE': {
      const sc = a.substituteCost ?? {};
      const cost = sc.discardSpell ? `手札からスペル${sc.discardSpell}枚を捨てる`
        : sc.trashStackSpell ? `このシグニの下からスペル${sc.trashStackSpell}枚をトラッシュする`
        : sc.powerReduction ? `このシグニのパワーを－${sc.powerReduction}する` : '';
      return `${targetJa(a.trigger)}がバニッシュされる場合、代わりに${cost}てもよい`;
    }
    case 'REVEAL_AND_PICK': return `${ownerJa(a.from?.owner)}デッキ${a.count ? '上' + numJa(a.count) + '枚' : ''}を公開し${filterJa(a.pickFilter)}カードを選び${a.pickTo === 'field' ? '場に出す' : a.pickTo === 'hand' ? '手札に加える' : '処理する'}（残りは戻す）`;
    case 'REARRANGE_SIGNI': return a.swap ? 'このシグニと対象シグニの位置を入れ替える' : `${targetJa(a.target)}を再配置する`;
    case 'NEGATE_ATTACK': return 'そのアタックを無効にする';
    case 'COUNTER_SPELL': return `スペル${a.maxCost != null ? '（コスト' + a.maxCost + '以下）' : ''}の効果を打ち消す`;
    case 'SHUFFLE_DECK': return `${ownerJa(a.owner)}デッキをシャッフルする`;
    case 'EQUALIZE_ENERGY': return 'エナゾーンの枚数を揃える';
    case 'FORCE_SIGNI_ATTACK': return `${ownerJa(a.target?.owner)}シグニは可能ならアタックする`;
    case 'COST_REDUCTION': return 'コストを軽減する';
    case 'GROW_FREE': return 'コストを支払わずにグロウする';
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
    case 'STUB': {
      const extra = `${a.banishSubstitute ? ' ' + JSON.stringify(a.banishSubstitute) : ''}${a.costColors ? ' コスト' + a.costColors.join('') : ''}`;
      // STUBS.md に説明があれば id ではなく説明文を表示（無ければ id にフォールバック）
      const desc = stubDescMap.get(a.id);
      return desc ? `[STUB:${desc}${extra}]` : `[STUB:${a.id}${extra}]`;
    }
    default: return `[アクション:${a.type}]`;
  }
}

const timingJa: Record<string, string> = {
  ON_PLAY: 'このシグニが場に出たとき', ON_ATTACK_SIGNI: 'このシグニがアタックしたとき',
  ON_BANISH: 'このシグニ（など）がバニッシュされたとき', ON_TRASH: 'このカードがトラッシュに置かれたとき',
  ON_TURN_START: 'ターン開始時', ON_TURN_END: 'ターン終了時',
  ON_ATTACK_PHASE_START: 'あなたのアタックフェイズ開始時', ON_LIFE_CRASHED: 'あなたのライフがクラッシュされたとき',
  ON_OPP_LIFE_CRASHED: '対戦相手のライフがクラッシュされたとき', ON_SIGNI_BATTLE: 'このシグニがバトルしたとき',
  ON_SIGNI_DAMAGE: 'このシグニが相手にダメージを与えたとき', ON_LEAVE_FIELD: 'このカードが場を離れたとき',
  MAIN: '（メイン起動）', ON_LIFE_BURST: '【ライフバースト】',
};

function effJa(e: Eff): string {
  const typeMark = e.effectType === 'AUTO' ? '【自】' : e.effectType === 'CONTINUOUS' ? '【常】'
    : e.effectType === 'ACTIVATED' ? '【起】' : e.effectType === 'LIFE_BURST' ? '【LB】' : `【${e.effectType}】`;
  const trig = (e.timing || []).map((t: string) => timingJa[t] ?? t).join('/');
  const scope = e.triggerScope && e.triggerScope !== 'self' ? `〔範囲:${e.triggerScope}〕` : '';
  const cond = e.condition ? `${condJa(e.condition)}場合、` : '';
  const actCond = e.activeCondition ? `《${condJa(e.activeCondition)}のかぎり》` : '';
  const cost = e.cost ? `〈${costJa(e.cost)}〉` : '';
  const limit = e.usageLimit && e.usageLimit !== 'unlimited' ? `《${e.usageLimit}》` : '';
  const body = actionJa(e.action);
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
