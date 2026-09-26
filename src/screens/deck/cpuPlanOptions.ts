import type { CardData } from '../../types';
import { CPU_CARD_USES, CPU_COMBO_USES, type CpuCardUse, type CpuComboUse } from '../battle/cpuDeckPlan';

/**
 * 🆕**CPU の作戦モーダルが「どの操作を出すか」を決める純関数**（2026-09-22・ユーザー指摘で新設）。
 *
 * 🔴**なぜ画面から出したか**＝旧モーダルは**効かない操作を全カードに出していた**（実測）＝
 *   ルリグやアーツの行に［キー］（エナ・手札・マリガンにしか効かない）、アーツに「出す」（`deploy` にしかならない）など。
 *   「指定したのに効かない」は**どの計器にも映らない**ので、**判定を純関数にして golden で全カードに当てる**
 *   （CLAUDE.md＝「`src/screens/` の純関数は golden から import できる＝判定ロジックは実機ではなく golden で網羅する」）。
 *
 * 🔑**ここの判定は engine 側の消費地点と1対1**＝下の各関数のコメントに「どこが読むか」を書く。
 *   engine 側の受け皿を動かしたら**ここも動かす**（動かさないと画面が嘘の選択肢を出す）。
 */

/** 場に「出す」札（`cpuPlanMoveStep` の `deploy`／`resona`／`rise` が拾う形）。 */
export const cpuPlanIsDeployable = (card: CardData | undefined): boolean => {
  const t = card?.Type ?? '';
  return t.startsWith('シグニ') || t.includes('レゾナ');
};

/** アーツ（守り／攻めの窓を持つ唯一の種別＝`cpuArts.listCpuArts` が `planCardUse` を読む）。 */
export const cpuPlanIsArts = (card: CardData | undefined): boolean => {
  const t = card?.Type ?? '';
  return t === 'アーツ' || t === 'アーツ/クラフト';
};

/** スペル（`cpuSpell.listCpuMainSpells` が `planForbidsUse` を読む）。 */
export const cpuPlanIsSpell = (card: CardData | undefined): boolean => (card?.Type ?? '').startsWith('スペル');

/** キー／ピース（`cpuKeyPiece.listCpuKeyPieces` が `planForbidsUse` を読む）。 */
export const cpuPlanIsKeyOrPiece = (card: CardData | undefined): boolean => {
  const t = card?.Type ?? '';
  return t === 'キー' || t.includes('ピース');
};

/**
 * 【起】を持つ札か。
 * 🔑**判定は live の効果表（`card.effects`）**＝原文の regex ではない（`App.tsx` が `effects_*.json` を載せている）。
 * ⚠効果表が載っていない経路（素の CSV だけを読むテスト）でだけ原文へ落ちる。
 */
export const cpuPlanHasActivated = (card: CardData | undefined): boolean => {
  if (!card) return false;
  if (card.effects) return card.effects.some(e => e.effectType === 'ACTIVATED');
  return (card.EffectText ?? '').includes('【起】');
};

/** 一覧の行に出すチップ。 */
export type CpuPlanChip = 'key' | 'priority' | 'prefer' | 'avoid';

/**
 * その札の行に出してよいチップ（🔴**効かない操作を出さない**）。
 * - `key`＝**メインデッキの札だけ**。`planKeepBonus`／`planKeepsInMulligan` が効くのは
 *   **エナチャージ・手札上限の捨て札・手札を捨てるコスト・サーチ・マリガン**＝どれも手札／山／エナの話で、
 *   ルリグデッキの札（ルリグ・アーツ・キー・ピース・レゾナ）は**そのどこにも行かない**。
 * - `priority`＝**出す札だけ**。`planUseBonus` が `priorityDeploy` を足すのは `use === 'deploy'` のときだけ。
 * - `prefer`/`avoid`＝**全部**（`planTargetBonus` は効果が選んだ対象すべてに掛かる＝場・手札・トラッシュ・エナ）。
 */
export function cpuPlanChipsFor(card: CardData | undefined, inMainDeck: boolean): readonly CpuPlanChip[] {
  const out: CpuPlanChip[] = [];
  if (inMainDeck) out.push('key');
  if (cpuPlanIsDeployable(card)) out.push('priority');
  out.push('prefer', 'avoid');
  return out;
}

/**
 * 🆕**その札をアタックフェイズのどの窓で使えるか**（2026-09-26 `S-37`・ユーザー判断＝「使いどころ」はアタックフェイズに使える札だけ）。
 * 🔑**窓は engine の提示判定と1対1**（判定を写経しない＝ここは「その窓に出うるか」の種別だけを見る）：
 * - アーツ（CSV `Timing` に「アタックフェイズ」）＝自分／相手の両方（`artsUseGate` の `ATTACK_ARTS`／`ATTACK_ARTS_OP`）。
 * - アシストルリグ（同）＝両方（`assistGrow.listAssistGrowCandidates`）。
 * - ピース（同）＝**自分のだけ**（`keyPieceUseGate` は自ターンだけ）。
 * - 《アタックフェイズアイコン》の【起】（`timing` に `ATTACK_ARTS`）＝**手札の【起】は両方**（`offFieldActivateTiming`）／
 *   場のシグニ・ルリグ・トラッシュ・エナの【起】は**自分のだけ**（`signiActivateGate`／`lrigActivateGate` は自ターンだけ）。
 * ⚠スペルは0枚（全シートの CSV `Timing` にアタックフェイズを持つスペルが無い＝メインフェイズとカットインだけ）。
 */
export function cpuPlanAttackWindows(card: CardData | undefined | null): { offense: boolean; defense: boolean } {
  const none = { offense: false, defense: false };
  if (!card) return none;
  const t = card.Type ?? '';
  const atk = (card.Timing ?? '').includes('アタックフェイズ');
  if ((cpuPlanIsArts(card) || t === 'アシストルリグ') && atk) return { offense: true, defense: true };
  // ⚠メインフェイズだけのアーツ・アシストルリグは窓なし（効果の `timing` を見て「攻め」だけにしない＝アーツの攻めは意味が違う）。
  if (cpuPlanIsArts(card) || t === 'アシストルリグ') return none;
  let offense = t.includes('ピース') && atk;
  let defense = false;
  for (const e of card.effects ?? []) {
    if (e.effectType !== 'ACTIVATED' || !(e.timing ?? []).some(x => x === 'ATTACK_ARTS' || x === 'ATTACK')) continue;
    offense = true;
    if (e.handActivated) defense = true;
  }
  return { offense, defense };
}

/**
 * 「使いどころ」を指定できる札か＝**アタックフェイズに使える札だけ**（🆕2026-09-26 `S-37`・`cpuPlanAttackWindows`）。
 * 🔴旧＝アーツ・スペル・キー／ピース・【起】持ち全部（スペルは「使わない」しか選べず死んでいた＝`S-37`）。
 *   ⚠狙い方の規則の「使うタイミング」は**狙い方を切り替えるだけ**（スペルを使うか否かは決めない）。
 */
export const cpuPlanCanSetUse = (card: CardData | undefined): boolean => {
  const w = cpuPlanAttackWindows(card);
  return w.offense || w.defense;
};

/**
 * その札に出す「使いどころ」の選択肢（🆕2026-09-26 `S-37`＝**その札が持つ窓だけ**）。
 * - 自分・相手の両方のアタックフェイズに使える札＝守り／攻め／両方／使わない。
 * - 自分のアタックフェイズだけ＝攻め／使わない（守りの窓が無い）。
 * ⚠**カード未選択（`undefined`）では全部**＝まだ絞れないので選択肢を減らさない。
 */
export function cpuPlanUseModesFor(card: CardData | undefined | null): readonly CpuCardUse[] {
  if (!card) return CPU_CARD_USES;
  const w = cpuPlanAttackWindows(card);
  if (w.defense) return CPU_CARD_USES;
  return w.offense ? ['offense', 'never'] : [];
}

/**
 * コンボの1手に選べる「使い方」＝**`cpuPlanMoveStep` が拾える形だけ**。
 * - アーツ → `arts` だけ（⚠**アーツの【起】は `activate` にならない**＝`activate` は
 *   場のシグニ／センタールリグ／場以外（トラッシュ・手札・エナ）の【起】だけ）。
 * - スペル → `spell` だけ。
 * - キー／ピース → **無し**（`cpuPlanMoveStep` が `piece` に `null` を返す＝加点が1点も乗らない）。
 * - シグニ／レゾナ → `deploy`（＋【起】を持つなら `activate`）／ルリグ → `activate`（持っていれば）。
 * ⚠**カード未選択（`undefined`）では全部**。
 */
export function cpuPlanComboUsesFor(card: CardData | undefined | null): readonly CpuComboUse[] {
  if (!card) return CPU_COMBO_USES;
  if (cpuPlanIsArts(card)) return ['arts'];
  if (cpuPlanIsSpell(card)) return ['spell'];
  if (cpuPlanIsKeyOrPiece(card)) return [];
  return CPU_COMBO_USES.filter(u =>
    (u === 'deploy' && cpuPlanIsDeployable(card)) || (u === 'activate' && cpuPlanHasActivated(card)));
}

/**
 * 🔴**`select` の値を選択肢の中へ丸める**（2026-09-22 に直した実バグの受け皿）。
 *
 * 旧モーダルは **カード未選択のとき選択肢が `['never']` だけなのに state は `'defense'`** だったので、
 * **画面は「使わない」と出しているのに［追加］すると `defense` が保存された**。
 * ⇒ **`value` は必ず `options` の中から選ぶ**（表示と保存を1つにする）。
 */
export function cpuPlanClampOption<T extends string>(value: T, options: readonly T[], fallback: T): T {
  return options.includes(value) ? value : (options[0] ?? fallback);
}

/** 効果の選択肢（`cpuPlanEffectOptions`）。 */
export interface CpuPlanEffectOption {
  effectId: string;
  /** 画面の表示（例＝`E2【起】：対戦相手のシグニ１体を…`）。 */
  label: string;
  /** 🆕2026-09-26 `S-36`＝**その効果の原文（全文）**＝E1／E2／ライフバーストの記号だけでは元の効果が分からない（ユーザー）。 */
  text: string;
}

/** 効果の種類の表示（【出】と【自】は `onPlayIcon` で分ける）。 */
function effectKindLabel(e: { effectType: string; onPlayIcon?: boolean; timing?: readonly string[] }): string {
  switch (e.effectType) {
    case 'ACTIVATED': return '【起】';
    case 'AUTO': return e.onPlayIcon ? '【出】' : '【自】';
    case 'CONTINUOUS': return '【常】';
    case 'LIFE_BURST': return 'ライフバースト';
    case 'TRAP_ICON': return 'トラップ';
    default: return e.effectType;
  }
}

/**
 * 🆕**その札の効果を1つずつ選ぶための選択肢**（2026-09-25 ユーザー要望「複数の効果を持つ札は効果ごとに区別する」
 * 「ライフバーストの効果の狙い先も設定したい」）。
 * 🔑**効果の単位は live の効果表の `effectId`**（`-E1` / `-E2` / `-BURST` …）＝engine が対話に載せる
 *   `PendingEffect.effectId` と同じ値なので、選んだ指定がそのまま当たる。
 * - `purpose: 'pick'`＝**その効果が選ぶ先**を決める用途＝【常】は選ばない（対象を選ばない）。
 * - `purpose: 'activate'`＝コンボの「【起】で使う」＝【起】だけ。
 * @param textOf 効果ごとの原文（省略すると種類だけ）。画面は `getAbilityBlockTexts` を渡す。
 */
export function cpuPlanEffectOptions(
  card: CardData | undefined, purpose: 'pick' | 'activate',
  textOf?: (card: CardData, effectId: string) => string | undefined,
): CpuPlanEffectOption[] {
  if (!card?.effects) return [];
  const prefix = `${card.CardNum}-`;
  return card.effects
    .filter(e => purpose === 'activate' ? e.effectType === 'ACTIVATED' : e.effectType !== 'CONTINUOUS')
    .map(e => {
      // ⚠ライフバーストは種類名だけ（`BURST` の記号は種類名と重なる）。
      const suffix = e.effectType === 'LIFE_BURST' ? ''
        : e.effectId.startsWith(prefix) ? e.effectId.slice(prefix.length) : e.effectId;
      const raw = e.effectType === 'LIFE_BURST' ? card.BurstText : textOf?.(card, e.effectId);
      const text = (raw ?? '').replace(/\s+/g, ' ').trim();
      const head = text.replace(/\s+/g, '').slice(0, 36);
      return { effectId: e.effectId, label: `${suffix}${effectKindLabel(e)}${head ? `：${head}` : ''}`, text };
    });
}
