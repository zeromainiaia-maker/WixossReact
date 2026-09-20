import type { CardData } from '../../types';
import type { CardEffect } from '../../types/effects';
import { DEFAULT_CPU_POLICY, type CpuPolicy } from './cpuPolicy';

/**
 * 🆕**カードの強さ表**（§5.7 `S-1`・2026-09-17）＝CPU が「パワーだけ」でなく**効果の強さ**でカードを比べるための採点。
 *
 * ■ なぜ要るか＝旧 CPU はカードの価値を**パワーとレベル**でしか見ていなかった（`cpuBoardEval.ts`／`cpuInteraction.ts`）
 *   ＝パワー3000で【出】に除去を持つシグニを「弱い札」と扱い、召喚でも除去の対象でも後回しにしていた（ユーザー指摘）。
 *
 * ■ 方式＝**効果 JSON（構造化済み）だけを読む**。原文 regex は書かない（`census:costtext` の「UI 層で原文を読む」型を増やさない）。
 *   アクションの木を歩いて**特徴量**（除去の体数・ドロー枚数・エナ・サーチ・妨害・耐性・キーワード …）を数え、
 *   **パワー換算の点数**にする。重み（`WEIGHTS`）は手で決めた初期値＝§5.7 `S-4` で自己対戦により調整する対象。
 *
 * ■ 文脈（`context`）＝同じ効果でも「いつ効くか」で価値が変わる。
 *   - `deploy`（これから出す・手札の札）＝【出】は満額。
 *   - `field`（もう場にいる＝除去の対象として脅威を測る）＝【出】は済んでいるので小さく、【常】【起】アタック時は満額。
 *   - ライフバーストは両文脈とも小さく（ライフに入ったときしか効かない）。
 */
export type StrengthContext = 'deploy' | 'field';

export interface CardFeatures {
  /** 相手の場のカードを離す（バニッシュ・トラッシュ・バウンス・エナ送り・デッキ送り・除外）体数 */
  removal: number;
  /** 相手へのパワーマイナスの合計 */
  powerDown: number;
  /** 自分へのパワープラスの合計 */
  powerUp: number;
  draw: number;
  energy: number;
  /** 手札に加える（サーチ・回収） */
  search: number;
  /** 場に出す（リアニメイト・踏み倒し） */
  summon: number;
  /** ダウン・凍結・アタック無効・行動封じ・能力を失わせる */
  disrupt: number;
  /** 相手の手札を捨てさせる */
  handDisrupt: number;
  /** 耐性・ダメージ軽減・ライフ回復 */
  protection: number;
  /** 相手のライフクロスをクラッシュ */
  lifeCrash: number;
  coin: number;
  /** 攻撃系キーワード（ランサー・ダブルクラッシュ・アサシン・シャドウ …）の点数合計 */
  keyword: number;
  /** 上のどれにも当たらない効果（STUB 等）＝「何かある」ぶんの小点 */
  misc: number;
}

const emptyFeatures = (): CardFeatures => ({
  removal: 0, powerDown: 0, powerUp: 0, draw: 0, energy: 0, search: 0, summon: 0,
  disrupt: 0, handDisrupt: 0, protection: 0, lifeCrash: 0, coin: 0, keyword: 0, misc: 0,
});

/**
 * パワー換算の重み（1単位あたり）。`powerDown`/`powerUp` は値そのものに掛ける係数。
 * 🔴**実体は `cpuPolicy.DEFAULT_CPU_POLICY.strengthWeights`**（§5.7 `S-6` 第2段）＝**値をここに書かない**
 *   （2か所に書くと「画面と自己対戦で違う CPU が動く」＝`SPELL_GAIN_MIN` と同じ規律）。
 */
export const WEIGHTS: Record<keyof CardFeatures, number> = DEFAULT_CPU_POLICY.strengthWeights;

/**
 * キーワード1つの点数（`GRANT_KEYWORD` の `keyword` 実測上位）。
 * 🔴**実体は `cpuPolicy.DEFAULT_CPU_POLICY.keywordValues`**（§5.7 `S-6` 第2段）＝**値をここに書かない**。
 */
export const KEYWORD_VALUE: Readonly<Record<string, number>> = DEFAULT_CPU_POLICY.keywordValues;

const REMOVAL = new Set(['BANISH', 'TRASH', 'BOUNCE', 'SEND_TO_ENERGY', 'TRANSFER_TO_DECK', 'EXILE']);
const DISRUPT = new Set(['DOWN', 'FREEZE', 'NEGATE_ATTACK', 'BLOCK_ACTION', 'REMOVE_ABILITIES']);
const SEARCH = new Set(['SEARCH', 'REVEAL_AND_PICK', 'ADD_TO_HAND', 'TRANSFER_TO_HAND', 'LOOK_PICK_CHAIN']);
const ENERGY = new Set(['ENERGY_CHARGE', 'ENERGY_CHARGE_FROM_DECK', 'ADD_TO_ENERGY']);
const PROTECTION = new Set(['GRANT_PROTECTION', 'PREVENT_NEXT_DAMAGE', 'ADD_TO_LIFE']);
/** 木を歩くだけの入れ物（それ自体は点にしない）。 */
const CONTAINERS = new Set(['SEQUENCE', 'CONDITIONAL', 'CHOOSE']);

type Node = Record<string, unknown> & { type?: unknown };

const asNumber = (v: unknown, fallback: number): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v === 'ALL') return 2;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** 対象の持ち主（`target.owner` → `source.owner` → `owner` の順）。 */
function ownerOf(node: Node): string | undefined {
  const t = node.target as Node | undefined, s = node.source as Node | undefined;
  return (t?.owner ?? s?.owner ?? node.owner) as string | undefined;
}

/** 対象の置き場の種類（`SIGNI`／`HAND_CARD`／`DECK_CARD`／`TRASH_CARD` …）。 */
function zoneOf(node: Node): string | undefined {
  const t = node.target as Node | undefined, s = node.source as Node | undefined;
  return (t?.type ?? s?.type) as string | undefined;
}

/** 場のシグニ（またはセンタールリグかシグニ）を指す対象か。 */
const onField = (zone: string | undefined) => zone === 'SIGNI' || zone === 'CENTER_LRIG_OR_SIGNI';

function countOf(node: Node): number {
  const t = node.target as Node | undefined, s = node.source as Node | undefined;
  return asNumber(t?.count ?? s?.count ?? node.count, 1);
}

/** アクションの木を歩いて特徴量を足す。`mult`＝この枝の重み（「そうした場合」「以下から1つ」は割り引く）。 */
function walk(node: unknown, mult: number, f: CardFeatures, kw0: Readonly<Record<string, number>>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => walk(n, mult, f, kw0)); return; }
  const n = node as Node;
  const type = typeof n.type === 'string' ? n.type : '';
  const owner = ownerOf(n);
  const opp = owner === 'opponent';
  const self = !opp && owner !== 'any';
  const zone = zoneOf(n);
  // 🔴**除去は「場のシグニ」を対象にするときだけ**＝初版は `TRASH <DECK_CARD>`（デッキを削る）まで除去に数え、
  //   「デッキの上から3枚トラッシュ」のシグニが Lv1 の上位を独占した（2026-09-17 実測）。
  if (REMOVAL.has(type) && onField(zone) && (opp || owner === 'any')) f.removal += countOf(n) * mult * (opp ? 1 : 0.5);
  else if (type === 'TRASH' && opp && zone === 'HAND_CARD') f.handDisrupt += countOf(n) * mult;
  else if (type === 'TRASH' && opp && zone === 'ENERGY_CARD') f.disrupt += countOf(n) * mult * 0.6;
  else if (type === 'TRASH' && opp && zone === 'LIFE_CLOTH_CARD') f.lifeCrash += countOf(n) * mult;
  else if (type === 'POWER_MODIFY') {
    const d = Number(n.delta);
    if (Number.isFinite(d)) {
      if (d < 0 && opp) f.powerDown += -d * countOf(n) * mult;
      else if (d > 0 && self) f.powerUp += d * countOf(n) * mult;
    }
  } else if (type === 'DRAW' && self) f.draw += asNumber(n.count, 1) * mult;
  else if (ENERGY.has(type) && self) f.energy += countOf(n) * mult;
  else if (SEARCH.has(type) && self && zone !== 'SIGNI') f.search += countOf(n) * mult;
  else if (type === 'ADD_TO_FIELD' && self) f.summon += mult;
  else if (DISRUPT.has(type) && opp) f.disrupt += countOf(n) * mult;
  else if (PROTECTION.has(type) && self) f.protection += mult;
  else if (type === 'LIFE_CRASH' && opp) f.lifeCrash += asNumber(n.count, 1) * mult;
  else if (type === 'GAIN_COIN') f.coin += asNumber(n.count ?? n.value, 1) * mult;
  else if (type === 'GRANT_KEYWORD') {
    const kw = String(n.keyword ?? '');
    if (self && kw0[kw]) f.keyword += kw0[kw] * mult;
    else if (opp && kw === 'アタックできない') f.disrupt += countOf(n) * mult;
  } else if (type === 'STUB') f.misc += mult;

  // 子をたどる。「そうした場合」（CONDITIONAL.then）と「以下から1つ」（CHOOSE の各肢）は割り引く。
  for (const [key, child] of Object.entries(n)) {
    if (key === 'target' || key === 'source' || key === 'filter' || key === 'condition') continue;
    if (!child || typeof child !== 'object') continue;
    const childMult = type === 'CONDITIONAL' ? mult * 0.7
      : type === 'CHOOSE' ? mult * 0.6
        : mult;
    if (CONTAINERS.has(type) || key === 'steps' || key === 'then' || key === 'else' || key === 'options' || key === 'action' || key === 'thenAction') {
      walk(child, childMult, f, kw0);
    }
  }
}

/** 効果のタイミングによる重み（文脈ごと）。 */
function timingWeight(e: CardEffect, context: StrengthContext): number {
  const timing = e.timing ?? [];
  if (e.effectType === 'LIFE_BURST') return 0.25;
  if (e.effectType === 'CONTINUOUS') return 1;
  if (e.effectType === 'ACTIVATED') return 0.8;
  if (timing.includes('ON_PLAY')) return context === 'deploy' ? 1 : 0.2;
  if (timing.some(t => t.startsWith('ON_ATTACK'))) return 0.9;
  return 0.5;
}

/**
 * カードの効果の特徴量（文脈で重み付け済み）。
 * 🆕§5.7 `S-6` 第2段＝**キーワードの点数はポリシーから**（席ごとに違う値が来る＝A/B の口）。
 * ⚠**渡さなければ既定**＝実機の挙動は1ビットも変わらない。
 */
export function cardFeatures(effects: readonly CardEffect[], context: StrengthContext, policy?: CpuPolicy): CardFeatures {
  const f = emptyFeatures();
  const kw = policy?.keywordValues ?? KEYWORD_VALUE;
  for (const e of effects) walk(e.action, timingWeight(e, context), f, kw);
  return f;
}

/** 効果ぶんの点数（パワー換算）。🆕§5.7 `S-6` 第2段＝重みはポリシーから（省略時は既定）。 */
export function effectValueOf(effects: readonly CardEffect[], context: StrengthContext, policy?: CpuPolicy): number {
  const f = cardFeatures(effects, context, policy);
  const w = policy?.strengthWeights ?? WEIGHTS;
  return (Object.keys(f) as (keyof CardFeatures)[]).reduce((sum, k) => sum + f[k] * w[k], 0);
}

/**
 * カードの強さ＝**パワー（実効パワーが分かればそれ）＋効果の点数**。パワーを持たない札（スペル・アーツ）は効果の点数だけ。
 * @param power 実効パワー（場のシグニ）。省略時は印刷パワー。
 */
export function cardStrength(
  card: CardData | undefined, effects: readonly CardEffect[], context: StrengthContext, power?: number, policy?: CpuPolicy,
): number {
  const printed = card?.Power === '∞' ? 1e6 : (parseInt(card?.Power ?? '', 10) || 0);
  return (power ?? printed) + effectValueOf(effects, context, policy);
}
