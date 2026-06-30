/**
 * boardDiff.ts — 盤面差分の検出/計数ヘルパ（pure 関数・Stage2 抽出）
 *
 * 効果解決の前後 PlayerState（before/after）を比較し、「何が起きたか」を検出する純粋関数群。
 * BattleScreen.tsx のクロージャだった detect/count 系を、依存のない pure 関数として抽出した。
 * いずれも (before, after) のみに依存し effectsMap/cardMap/React state を参照しない＝golden で直接検証できる。
 * 収集側（どのカードが反応するか）は triggerCollect.ts、本モジュールは「イベントの発生検出」を担う。
 */
import type { PlayerState } from '../types';

/** バニッシュされた（場→エナへ移動した）シグニ番号を検出。各ゾーン最前面の before→after 差分。 */
export function detectBanishedSigni(before: PlayerState, after: PlayerState): string[] {
  const result: string[] = [];
  for (let i = 0; i < 3; i++) {
    const beforeTop = (before.field.signi[i] ?? []).at(-1);
    const afterTop = (after.field.signi[i] ?? []).at(-1);
    if (!beforeTop || beforeTop === afterTop) continue;
    if (after.energy.includes(beforeTop)) result.push(beforeTop);
  }
  return result;
}

/**
 * 効果で新たに場に出たシグニ（各ゾーン最前面で、before のフィールドに存在しなかった instanceId）を検出。
 * 効果配置経路の any_ally ON_PLAY 発火（G144/G145/WX11-054「他のシグニが効果で場に出たとき」）用。
 */
export function detectPlacedSigni(before: PlayerState, after: PlayerState): string[] {
  const beforeOnField = new Set<string>();
  for (const stack of before.field.signi) for (const cn of (stack ?? [])) beforeOnField.add(cn);
  const result: string[] = [];
  for (const stack of after.field.signi) {
    const top = stack?.at(-1);
    if (top && !beforeOnField.has(top)) result.push(top);
  }
  return result;
}

/**
 * 【シード】から開花してシグニになったカードを検出（ON_BLOOMトリガー用）。
 * 開花前は signi_seeds に裏向き、開花後は同じ instanceId が signi に表向きで存在する。
 * ルール上「開花」は「場に出た」扱いではないため detectPlacedSigni（ON_PLAY）から除外する。
 */
export function detectBloomedSigni(before: PlayerState, after: PlayerState): string[] {
  const beforeSeeds = new Set<string>((before.field.signi_seeds ?? []).filter((c): c is string => !!c));
  const result: string[] = [];
  for (const stack of after.field.signi) {
    const top = stack?.at(-1);
    if (top && beforeSeeds.has(top)) result.push(top);
  }
  return result;
}

/** トラッシュ→エナゾーンに移動したカードを検出（ON_ENERGY_FROM_TRASHトリガー用）。 */
export function detectEnergyFromTrash(before: PlayerState, after: PlayerState): string[] {
  const newInEnergy = after.energy.filter(n => !before.energy.includes(n));
  return newInEnergy.filter(n => before.trash.includes(n));
}

/** 新たに血晶武装状態（signi_armor false→true）になったシグニ番号を検出。 */
export function detectNewlyArmored(before: PlayerState, after: PlayerState): string[] {
  const result: string[] = [];
  for (let i = 0; i < 3; i++) {
    const wasBefore = before.field.signi_armor?.[i] ?? false;
    const isAfter = after.field.signi_armor?.[i] ?? false;
    if (!wasBefore && isAfter) {
      const cardNum = after.field.signi[i]?.at(-1);
      if (cardNum) result.push(cardNum);
    }
  }
  return result;
}

/**
 * 場を離れたシグニを検出（ON_LEAVE_FIELDトリガー用。行き先は問わない）。
 * under = そのシグニの下にあったカード（ライズ素材等。フンババの動的フィルタ解決に使う）。
 */
export function detectLeftFieldSigni(before: PlayerState, after: PlayerState): { cardNum: string; under: string[] }[] {
  const afterFieldCards = new Set(after.field.signi.flatMap(z => z ?? []));
  const result: { cardNum: string; under: string[] }[] = [];
  for (let i = 0; i < 3; i++) {
    const beforeStack = before.field.signi[i] ?? [];
    const beforeTop = beforeStack.at(-1);
    if (!beforeTop) continue;
    if (!afterFieldCards.has(beforeTop)) {
      result.push({ cardNum: beforeTop, under: beforeStack.slice(0, -1) });
    }
  }
  return result;
}

/** フィールド→トラッシュに移動したシグニを検出（ON_TRASHトリガー用。エナ送りは除外）。 */
export function detectTrashedSigni(before: PlayerState, after: PlayerState): string[] {
  const result: string[] = [];
  for (let i = 0; i < 3; i++) {
    const beforeTop = (before.field.signi[i] ?? []).at(-1);
    const afterTop = (after.field.signi[i] ?? []).at(-1);
    if (!beforeTop || beforeTop === afterTop) continue;
    if (!after.energy.includes(beforeTop) && after.trash.includes(beforeTop)) result.push(beforeTop);
  }
  return result;
}

/** デッキ→トラッシュに移動したカードを検出（ON_TRASH「デッキから」用・WX02-073/WX13-038等）。 */
export function detectDeckTrashed(before: PlayerState, after: PlayerState): string[] {
  const beforeDeck = new Set(before.deck);
  const beforeTrash = new Set(before.trash);
  return after.trash.filter(n => beforeDeck.has(n) && !beforeTrash.has(n));
}

/** 手札→トラッシュに移動したカードを検出（ON_TRASH「手札から」用）。 */
export function detectHandTrashed(before: PlayerState, after: PlayerState): string[] {
  const beforeHand = new Set(before.hand);
  const beforeTrash = new Set(before.trash);
  return after.trash.filter(n => beforeHand.has(n) && !beforeTrash.has(n));
}

/** エナゾーン→トラッシュに移動したカードを検出（ON_TRASH「エナから」用）。 */
export function detectEnergyTrashed(before: PlayerState, after: PlayerState): string[] {
  const beforeEnergy = new Set(before.energy);
  const beforeTrash = new Set(before.trash);
  return after.trash.filter(n => beforeEnergy.has(n) && !beforeTrash.has(n));
}

/** 場の【チャーム】（signi_charms）がトラッシュに置かれた枚数を算出（ON_CHARM_TO_TRASH）。 */
export function countCharmsToTrash(before: PlayerState, after: PlayerState): number {
  if (!before || !after) return 0;
  const beforeCharms = (before.field.signi_charms ?? []).filter((c): c is string => !!c);
  const afterCharms = new Set((after.field.signi_charms ?? []).filter((c): c is string => !!c));
  const afterTrash = new Set(after.trash ?? []);
  let count = 0;
  for (const c of beforeCharms) {
    if (!afterCharms.has(c) && afterTrash.has(c)) count++;
  }
  return count;
}

/** エナゾーン→トラッシュ枚数を算出（ON_ENERGY_TO_TRASH。before.energy にあって after に無く after.trash 在中）。 */
export function countEnergyToTrash(before: PlayerState, after: PlayerState): number {
  if (!before || !after) return 0;
  const afterEnergy = new Set(after.energy ?? []);
  const afterTrash = new Set(after.trash ?? []);
  let count = 0;
  for (const c of (before.energy ?? [])) {
    if (!afterEnergy.has(c) && afterTrash.has(c)) count++;
  }
  return count;
}

/** リフレッシュ回数の差を算出（ON_REFRESH。refresh_count_this_turn の delta）。 */
export function countRefresh(before: PlayerState, after: PlayerState): number {
  if (!before || !after) return 0;
  return Math.max(0, (after.refresh_count_this_turn ?? 0) - (before.refresh_count_this_turn ?? 0));
}

/**
 * シグニのパワー減少量（temp_power_mods の新規負 delta 合計の絶対値）を算出（ON_OPP_POWER_DECREASED）。
 * temp_power_mods は execPowerModify が末尾に append するため、before.length 以降の新規エントリの負 delta を合算。
 */
export function detectPowerDecrease(before: PlayerState, after: PlayerState): number {
  if (!before || !after) return 0;
  const beforeMods = before.temp_power_mods ?? [];
  const afterMods = after.temp_power_mods ?? [];
  let dec = 0;
  for (let i = beforeMods.length; i < afterMods.length; i++) {
    if (afterMods[i].delta < 0) dec += -afterMods[i].delta;
  }
  return dec;
}

/** デッキ→トラッシュ枚数（ミル枚数）を算出。before.deck かつ after.trash かつ not before.trash。 */
export function countMilledFromDeck(before: PlayerState, after: PlayerState): number {
  if (!before || !after) return 0;
  const beforeDeck = new Set(before.deck);
  const beforeTrash = new Set(before.trash);
  let n = 0;
  for (const c of after.trash) {
    if (beforeDeck.has(c) && !beforeTrash.has(c)) n++;
  }
  return n;
}

/**
 * デッキに「新たに加わった」枚数（他領域→デッキ移動）を算出。after.deck かつ not before.deck。
 * fromTrashOnly=true のときは解決前トラッシュにあったカードのみ数える（WX09-020/WX22-014）。
 */
export function countMovedToDeck(before: PlayerState, after: PlayerState, fromTrashOnly: boolean): number {
  if (!before || !after) return 0;
  const beforeDeck = new Set(before.deck);
  const beforeTrash = new Set(before.trash);
  let n = 0;
  for (const c of after.deck) {
    if (beforeDeck.has(c)) continue;
    if (fromTrashOnly && !beforeTrash.has(c)) continue;
    n++;
  }
  return n;
}

/**
 * センタールリグの下（field.lrig スタックの top 以外）からカードが移動した枚数を算出（ON_LRIG_UNDER_MOVED）。
 * before の under（top 以外）のうち after の lrig スタックに存在しなくなった＝下から離脱したカードを数える。
 * ⚠ センタールリグのみ対象（アシストルリグ下は未対応）。
 */
export function countLrigUnderMoved(before: PlayerState, after: PlayerState): number {
  if (!before || !after) return 0;
  const beforeUnder = (before.field.lrig ?? []).slice(0, -1);
  if (beforeUnder.length === 0) return 0;
  const afterLrig = new Set(after.field.lrig ?? []);
  return beforeUnder.filter(c => !afterLrig.has(c)).length;
}

/** デッキがこの解決でシャッフルされたか（deck_shuffled_count の delta>0・ON_DECK_SHUFFLED）。⚠execShuffleDeck 経由のみ。 */
export function detectDeckShuffled(before: PlayerState, after: PlayerState): boolean {
  if (!before || !after) return false;
  return (after.deck_shuffled_count ?? 0) > (before.deck_shuffled_count ?? 0);
}

/** ON_KEYWORD_GAINED 対象キーワード（WXDi-P04-035「【アサシン】か【ランサー】か【ダブルクラッシュ】」）。 */
export const KEYWORD_GAINED_TARGETS = ['アサシン', 'ランサー', 'ダブルクラッシュ'] as const;

/**
 * この解決でシグニが新たに得た対象キーワード（KEYWORD_GAINED_TARGETS）を {cardNum, keyword} の配列で返す（ON_KEYWORD_GAINED）。
 * keyword_grants と keyword_grants_until_opp_turn の両方を before/after で比較し、新規付与分のみ抽出する。
 * 同一カードが複数キーワードを同時に得た場合は複数要素を返す。
 */
export function detectKeywordGained(before: PlayerState, after: PlayerState): { cardNum: string; keyword: string }[] {
  if (!before || !after) return [];
  const merge = (s: PlayerState): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const src of [s.keyword_grants ?? {}, s.keyword_grants_until_opp_turn ?? {}]) {
      for (const [id, kws] of Object.entries(src)) out[id] = [...(out[id] ?? []), ...(kws ?? [])];
    }
    return out;
  };
  const bef = merge(before), aft = merge(after);
  const out: { cardNum: string; keyword: string }[] = [];
  for (const [cardNum, kws] of Object.entries(aft)) {
    const had = new Set(bef[cardNum] ?? []);
    for (const kw of kws) {
      if (!had.has(kw) && (KEYWORD_GAINED_TARGETS as readonly string[]).includes(kw)) {
        out.push({ cardNum, keyword: kw });
      }
    }
  }
  return out;
}

/**
 * 新たに凍結状態（signi_frozen false→true）になったゾーンのシグニ番号を返す。
 * 解決後に同ゾーンに在中するシグニを対象（凍結のまま移動する稀ケースは未対応）。
 */
export function detectNewlyFrozen(before: PlayerState, after: PlayerState): string[] {
  if (!before || !after) return [];
  const bf = before.field.signi_frozen ?? [];
  const af = after.field.signi_frozen ?? [];
  const out: string[] = [];
  const zones = after.field.signi?.length ?? 0;
  for (let z = 0; z < zones; z++) {
    if (af[z] === true && bf[z] !== true) {
      const num = after.field.signi[z]?.at(-1);
      if (num) out.push(num);
    }
  }
  return out;
}
