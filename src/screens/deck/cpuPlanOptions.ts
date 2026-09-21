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
 * 「使いどころ」を指定できる札か＝**`planForbidsUse`／`planCardUse` を読む窓がある札だけ**
 * （`cpuArts`／`cpuSpell`／`cpuKeyPiece`／`cpuActivate`／`cpuLrigActivate`）。
 * ⚠【起】を持たないシグニは**どの窓からも「使われ」ない**（出すだけ）＝指定しても効かないので一覧に出さない。
 */
export const cpuPlanCanSetUse = (card: CardData | undefined): boolean =>
  cpuPlanIsArts(card) || cpuPlanIsSpell(card) || cpuPlanIsKeyOrPiece(card) || cpuPlanHasActivated(card);

/**
 * その札に出す「使いどころ」の選択肢。
 * 🔑**守り／攻めの窓を持つのはアーツだけ**（`pickCpuResponseArts`／`pickCpuOffensiveArts` の2窓）＝
 *   ほかの種別に出せるのは「使わない」だけ。
 * ⚠**カード未選択（`undefined`）では全部**＝まだ絞れないので選択肢を減らさない。
 */
export function cpuPlanUseModesFor(card: CardData | undefined | null): readonly CpuCardUse[] {
  if (!card) return CPU_CARD_USES;
  return cpuPlanIsArts(card) ? CPU_CARD_USES : ['never'];
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
