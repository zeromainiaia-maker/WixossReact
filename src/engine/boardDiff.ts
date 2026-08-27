/**
 * boardDiff.ts — 盤面差分の検出/計数ヘルパ（pure 関数・Stage2 抽出）
 *
 * 効果解決の前後 PlayerState（before/after）を比較し、「何が起きたか」を検出する純粋関数群。
 * BattleScreen.tsx のクロージャだった detect/count 系を、依存のない pure 関数として抽出した。
 * いずれも (before, after) のみに依存し effectsMap/cardMap/React state を参照しない＝golden で直接検証できる。
 * 収集側（どのカードが反応するか）は triggerCollect.ts、本モジュールは「イベントの発生検出」を担う。
 */
import type { PlayerState } from '../types';
import type { TriggerOriginZone } from '../types/effects';
import { acceCardsAt, allAcceCards } from '../utils/acce';

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
 * 場に出たカードの直前の領域を、配置前 state から解決する。
 * 見つからない場合は undefined（生成トークン・不完全な before 等）を返す。由来限定 AUTO は
 * collector 側で undefined を不成立として扱い、由来不明を fail-open にしない。
 */
export function detectPlacedFromZone(
  before: PlayerState | null | undefined,
  cardNum: string,
  after?: PlayerState | null,
): TriggerOriginZone | undefined {
  // 🔴**盤面差分より記録を先に見る**（2026-08-27 B8 で実測）＝`execAddToField` は
  //   **ゾーン選択インタラクションの前に元の領域からカードを取り除く**ので、選択を挟む配置では
  //   `before` にもう移動元が残っていない。差分だけに頼ると由来が永久に unknown になり、
  //   fail-closed のせいで「トラッシュから出したのに【自】が発火しない」＝**過小へ裏返る**。
  const recorded = (after?.signi_placed_origin_this_turn ?? [])
    .find(e => e.startsWith(`${cardNum}:`))?.split(':').slice(1).join(':');
  if (recorded) return recorded as TriggerOriginZone;
  if (!before) return undefined;
  if (before.hand.includes(cardNum)) return 'hand';
  if (before.energy.includes(cardNum)) return 'energy';
  if (before.trash.includes(cardNum)) return 'trash';
  if (before.deck.includes(cardNum)) return 'deck';
  if (before.lrig_deck.includes(cardNum)) return 'lrig_deck';
  if (before.lrig_trash.includes(cardNum)) return 'lrig_trash';
  if (before.life_cloth.includes(cardNum)) return 'life_cloth';
  if ((before.excluded ?? []).includes(cardNum)) return 'excluded';

  for (const stack of before.field.signi) {
    if (!stack?.includes(cardNum)) continue;
    return stack.at(-1) === cardNum ? 'field' : 'under_signi';
  }
  const lrigStacks = [
    before.field.lrig,
    before.field.assist_lrig_l ?? [],
    before.field.assist_lrig_r ?? [],
  ];
  for (const stack of lrigStacks) {
    if (!stack.includes(cardNum)) continue;
    return stack.at(-1) === cardNum ? 'field' : 'under_signi';
  }
  const underCards = [
    ...(before.field.signi_charms ?? []).filter((n): n is string => !!n),
    ...(before.field.signi_facedown_attached ?? []).flatMap(xs => xs ?? []),
    ...(before.field.signi_acce ?? []).flatMap(xs => xs ?? []),
    ...(before.field.signi_soul ?? []).filter((n): n is string => !!n),
  ];
  if (underCards.includes(cardNum)) return 'under_signi';
  const fieldCards = [
    before.field.check,
    before.field.key_piece,
    ...(before.field.key_piece_extra ?? []),
    ...(before.field.free_zone ?? []),
    ...(before.field.beat_zone ?? []),
    ...(before.field.signi_traps ?? []),
    ...(before.field.signi_magic_boxes ?? []),
    ...(before.field.signi_seeds ?? []),
    ...(before.field.facedown_signi ?? []),
  ];
  if (fieldCards.includes(cardNum)) return 'field';
  return undefined;
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

/**
 * 裏向き（facedown_signi）から表向きにしてシグニになったカードを検出（WXDi-P10-034）。
 * 表向きにする前は facedown_signi に裏向き、後は同じ instanceId が signi に表向きで存在する。
 * 「裏向きを表向きにする」は開花と同じく「場に出た」扱いではないため detectPlacedSigni（ON_PLAY）から除外する。
 */
export function detectFacedownFlipped(before: PlayerState, after: PlayerState): string[] {
  const beforeFacedown = new Set<string>((before.field.facedown_signi ?? []).filter((c): c is string => !!c));
  const result: string[] = [];
  for (const stack of after.field.signi) {
    const top = stack?.at(-1);
    if (top && beforeFacedown.has(top)) result.push(top);
  }
  return result;
}

/**
 * 効果によって手札に移動（増加）したカードと移動元ゾーンを検出（ON_HAND_ADDED・続き207）。
 * 中央 diff（効果解決）からのみ呼ばれる前提＝検出された移動は効果起因（ドローフェイズの通常ドローは通らない）。
 * from: 'energy'|'field'|'deck'|'trash'|'other'（fromZones 限定＝「エナゾーンから」WXDi-P11-007/WX14-029/WD12-009 用）。
 */
export function detectHandAdded(before: PlayerState, after: PlayerState): { cardNum: string; from: 'energy' | 'field' | 'deck' | 'trash' | 'other' }[] {
  const beforeHand = new Set(before.hand);
  const beforeEnergy = new Set(before.energy);
  const beforeDeck = new Set(before.deck);
  const beforeTrash = new Set(before.trash);
  const beforeField = new Set<string>();
  for (const stack of before.field.signi) for (const cn of (stack ?? [])) beforeField.add(cn);
  const out: { cardNum: string; from: 'energy' | 'field' | 'deck' | 'trash' | 'other' }[] = [];
  for (const n of after.hand) {
    if (beforeHand.has(n)) continue;
    out.push({
      cardNum: n,
      from: beforeEnergy.has(n) ? 'energy' : beforeField.has(n) ? 'field'
        : beforeDeck.has(n) ? 'deck' : beforeTrash.has(n) ? 'trash' : 'other',
    });
  }
  return out;
}

/** エナゾーンから場に出たシグニを検出（ON_ENERGY_TO_FIELD・続き207・WXDi-P11-007-E1「か場に出たとき」枝）。detectPlacedSigni の移動元限定版。 */
export function detectPlacedFromEnergy(before: PlayerState, after: PlayerState): string[] {
  const beforeEnergy = new Set(before.energy);
  return detectPlacedSigni(before, after).filter(n => beforeEnergy.has(n));
}

/** ライフクロスに新たに加わったカードだけを検出（ON_LIFE_CLOTH_ADDED）。減少は返さない。 */
export function detectLifeClothAdded(before: PlayerState, after: PlayerState): string[] {
  const beforeLife = new Set(before.life_cloth);
  return after.life_cloth.filter(n => !beforeLife.has(n));
}

export type LifeClothMove = {
  cardNum: string;
  to: 'trash' | 'hand' | 'energy' | 'deck' | 'other';
};

/**
 * ライフクロスから他領域へ移動したカードを宛先付きで検出する。
 * カード番号は同名カードで重複し得るため Set ではなく multiset 差分を使う。
 */
export function detectLifeClothMoved(before: PlayerState, after: PlayerState): LifeClothMove[] {
  const counts = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const n of xs) m.set(n, (m.get(n) ?? 0) + 1);
    return m;
  };
  const lifeAfter = counts(after.life_cloth);
  const removed: string[] = [];
  for (const n of before.life_cloth) {
    const left = lifeAfter.get(n) ?? 0;
    if (left > 0) lifeAfter.set(n, left - 1);
    else removed.push(n);
  }
  const addedCounts = (beforeZone: string[], afterZone: string[]) => {
    const b = counts(beforeZone);
    const out = counts(afterZone);
    for (const [n, count] of b) out.set(n, Math.max(0, (out.get(n) ?? 0) - count));
    return out;
  };
  const destinations = [
    ['trash', addedCounts(before.trash, after.trash)],
    ['hand', addedCounts(before.hand, after.hand)],
    ['energy', addedCounts(before.energy, after.energy)],
    ['deck', addedCounts(before.deck, after.deck)],
  ] as const;
  return removed.map(cardNum => {
    for (const [to, added] of destinations) {
      const count = added.get(cardNum) ?? 0;
      if (count > 0) {
        added.set(cardNum, count - 1);
        return { cardNum, to };
      }
    }
    // 実戦のクラッシュは life→field.check なのでここでは other。
    // これにより「他の領域に移動」の WXK08-028-E1 はクラッシュでも発火する。
    // 後続の check→energy/trash では life が動かないため、この detector は空を返す。
    return { cardNum, to: 'other' };
  });
}

/** エナゾーンに新たに加わったカードだけを検出（ON_OPP_ENERGY_ADDED）。 */
export function detectEnergyAdded(before: PlayerState, after: PlayerState): string[] {
  const beforeEnergy = new Set(before.energy);
  return after.energy.filter(n => !beforeEnergy.has(n));
}

/** エナゾーンに新たに加わったカードと、その移動元ゾーンを検出する。 */
export function detectEnergyAddedWithSource(before: PlayerState, after: PlayerState): { cardNum: string; from: 'hand' | 'field' | 'deck' | 'trash' | 'other' }[] {
  const beforeEnergy = new Set(before.energy);
  const beforeHand = new Set(before.hand);
  const beforeDeck = new Set(before.deck);
  const beforeTrash = new Set(before.trash);
  const beforeField = new Set<string>();
  for (const stack of before.field.signi) for (const cn of (stack ?? [])) beforeField.add(cn);
  const out: { cardNum: string; from: 'hand' | 'field' | 'deck' | 'trash' | 'other' }[] = [];
  for (const n of after.energy) {
    if (beforeEnergy.has(n)) continue;
    out.push({
      cardNum: n,
      from: beforeHand.has(n) ? 'hand' : beforeField.has(n) ? 'field'
        : beforeDeck.has(n) ? 'deck' : beforeTrash.has(n) ? 'trash' : 'other',
    });
  }
  return out;
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
export function detectLeftFieldSigni(before: PlayerState, after: PlayerState): { cardNum: string; under: string[]; zoneIdx: number }[] {
  const afterFieldCards = new Set(after.field.signi.flatMap(z => z ?? []));
  const result: { cardNum: string; under: string[]; zoneIdx: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const beforeStack = before.field.signi[i] ?? [];
    const beforeTop = beforeStack.at(-1);
    if (!beforeTop) continue;
    if (!afterFieldCards.has(beforeTop)) {
      result.push({ cardNum: beforeTop, under: beforeStack.slice(0, -1), zoneIdx: i });
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

/**
 * トラッシュに**新しく置かれた**カードを検出（`ON_TRASH_CARD_ADDED`・§6.4 O-37(c)）。
 *
 * ⚠**移動元の領域を問わない**のが要点＝原文「対戦相手の効果1つによってあなたのトラッシュに
 *   カードが合計1枚以上置かれたとき」は手札・エナ・場・デッキ・ライフのどれからでも成立する。
 *   `detectDeckTrashed`／`detectHandTrashed`／`detectEnergyTrashed` は移動元を限定するので流用できない。
 * ⚠同名カードが複数あってもよいよう**多重集合の増加分**で数える（`detectUnderSigniTrashed` と同じ作法）。
 */
export function detectTrashAdded(before: PlayerState, after: PlayerState): string[] {
  const beforeCounts = new Map<string, number>();
  for (const n of before.trash) beforeCounts.set(n, (beforeCounts.get(n) ?? 0) + 1);
  const added: string[] = [];
  for (const n of after.trash) {
    const remaining = beforeCounts.get(n) ?? 0;
    if (remaining > 0) beforeCounts.set(n, remaining - 1);
    else added.push(n);
  }
  return added;
}

/** エナゾーン→トラッシュに移動したカードを検出（ON_TRASH「エナから」用）。 */
export function detectEnergyTrashed(before: PlayerState, after: PlayerState): string[] {
  const beforeEnergy = new Set(before.energy);
  const beforeTrash = new Set(before.trash);
  return after.trash.filter(n => beforeEnergy.has(n) && !beforeTrash.has(n));
}

/**
 * シグニの下→トラッシュに移動したカードを検出（ON_TRASH「シグニの下から」用）。
 * 各スタック末尾の場のシグニ本体は比較対象から外すため、ライズ等の本体入れ替えを
 * 下敷きの移動と誤認しない。また、本体が同じ差分で場を離れたゾーンの下敷きは
 * ルール処理でトラッシュへ置かれたものなので除外する。同名カードが複数ある場合も
 * 多重集合の減少数で扱う。
 */
export function detectUnderSigniTrashed(before: PlayerState, after: PlayerState): string[] {
  const counts = (nums: string[]): Map<string, number> => {
    const result = new Map<string, number>();
    for (const n of nums) result.set(n, (result.get(n) ?? 0) + 1);
    return result;
  };
  const underCards = (state: PlayerState): string[] =>
    state.field.signi.flatMap(stack => stack ? stack.slice(0, -1) : []);
  const beforeUnder = counts(underCards(before));
  const afterUnder = counts(underCards(after));
  // detectLeftFieldSigni と同じ判定を直接再利用し、場を離れた本体のゾーンに
  // 付いていた下敷き（removeFromField のルール処理落ち）を候補から除外する。
  const ruleProcessedUnder = counts(detectLeftFieldSigni(before, after).flatMap(x => x.under));
  const beforeTrash = counts(before.trash);
  const afterTrash = counts(after.trash);
  const result: string[] = [];
  for (const [cardNum, beforeCount] of beforeUnder) {
    const removedFromUnder = beforeCount - (afterUnder.get(cardNum) ?? 0);
    const removedByCostOrEffect = Math.max(
      0,
      removedFromUnder - Math.min(removedFromUnder, ruleProcessedUnder.get(cardNum) ?? 0),
    );
    const addedToTrash = (afterTrash.get(cardNum) ?? 0) - (beforeTrash.get(cardNum) ?? 0);
    const movedCount = Math.min(removedByCostOrEffect, addedToTrash);
    for (let i = 0; i < movedCount; i++) result.push(cardNum);
  }
  return result;
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

/**
 * 【マジックボックス】が表向きになった枚数を算出（ON_MAGIC_BOX_FLIPPED・§6.4 A群・WX24-P4-016）。
 *
 * ⚠**「MB ゾーンから消えた」だけでは数えない**＝行先が**トラッシュ**（`INTERNAL_OPEN_MB_DO`＝
 *   表向きにしてトラッシュ）か**場のシグニ**（`MAGIC_BOX_REVEAL`＝表向きにしてシグニにする）の
 *   どちらかであることを要求する。`MUGEN_Q_RESET_AND_FLIP` のような**盤面ごとゲーム除外**でも
 *   MB ゾーンは空になるので、これを見ないと「表向きになった」を誤検出する。
 * ⚠ゾーンの入れ替え（`permute`）では集合が変わらないので誤検出しない（`countCharmsToTrash` と同型）。
 */
export function countMagicBoxesFlipped(before: PlayerState, after: PlayerState): number {
  if (!before || !after) return 0;
  const beforeMBs = (before.field.signi_magic_boxes ?? []).filter((c): c is string => !!c);
  if (beforeMBs.length === 0) return 0;
  const afterMBs = new Set((after.field.signi_magic_boxes ?? []).filter((c): c is string => !!c));
  const afterTrash = new Set(after.trash ?? []);
  const afterSigni = new Set((after.field.signi ?? []).flatMap(stack => stack ?? []));
  let count = 0;
  for (const c of beforeMBs) {
    if (afterMBs.has(c)) continue;
    if (afterTrash.has(c) || afterSigni.has(c)) count++;
  }
  return count;
}

/**
 * 《コインアイコン》を得た枚数を算出（ON_COIN_GAINED＝既存 ON_COIN_PAID の逆方向）。
 * ⚠**上限5でクランプされた実増加**を返す（`coins` は上限5）＝「5枚持ちで得ても0枚」が正しい。
 * ⚠効果解決の中央 diff 専用。グロウ/アシストの獲得は**支払いと同じ差分に同居する**ため、
 *   各サイトで実増加を直接渡す（ここに通すと支払い分と相殺されて取りこぼす）。
 */
export function countCoinsGained(before: PlayerState, after: PlayerState): number {
  if (!before || !after) return 0;
  return Math.max(0, (after.coins ?? 0) - (before.coins ?? 0));
}

/** 場の【アクセ】（signi_acce）がトラッシュに置かれた枚数を算出（ON_ACCE_TO_TRASH）。countCharmsToTrash の【アクセ】版。 */
export function countAcceToTrash(before: PlayerState, after: PlayerState): number {
  if (!before || !after) return 0;
  const beforeAcce = allAcceCards(before.field);
  const afterAcce = new Set(allAcceCards(after.field));
  const afterTrash = new Set(after.trash ?? []);
  let count = 0;
  for (const c of beforeAcce) {
    if (!afterAcce.has(c) && afterTrash.has(c)) count++;
  }
  return count;
}

/**
 * この解決で新たに【ソウル】が付いたシグニを {hostNum, zoneIdx, soulNum} で返す（ON_SOUL_ATTACHED）。
 * signi_soul[z] が null/別カード → 非null に変わったゾーンを見る。
 * ⚠**そのゾーンのシグニ本体が前後で同一**の場合だけ拾う＝「ソウルが付いたまま別シグニに入れ替わった」
 *   （ライズ・場出し）を「付いた」と誤検出しない。
 */
export function detectSoulAttached(
  before: PlayerState, after: PlayerState,
): { hostNum: string; zoneIdx: number; soulNum: string }[] {
  if (!before || !after) return [];
  const bs = before.field.signi_soul ?? [];
  const as = after.field.signi_soul ?? [];
  const out: { hostNum: string; zoneIdx: number; soulNum: string }[] = [];
  const zones = after.field.signi?.length ?? 0;
  for (let z = 0; z < zones; z++) {
    const soulNum = as[z] ?? null;
    if (!soulNum || soulNum === (bs[z] ?? null)) continue;
    const hostNum = after.field.signi[z]?.at(-1);
    if (!hostNum || before.field.signi[z]?.at(-1) !== hostNum) continue;
    out.push({ hostNum, zoneIdx: z, soulNum });
  }
  return out;
}

/**
 * この解決で「カードが付いた」シグニを {hostNum, zoneIdx, count} で返す（ON_CARD_ATTACHED）。
 * 【チャーム】【アクセ】【ソウル】の3枠を横断し、ゾーンごとに新規付与された枚数を数える。
 * ⚠detectSoulAttached と同じく**本体が前後で同一のゾーンだけ**（入れ替わりを付与と誤検出しない）。
 */
export function detectCardAttached(
  before: PlayerState, after: PlayerState,
): { hostNum: string; zoneIdx: number; count: number }[] {
  if (!before || !after) return [];
  const slots = ['signi_charms', 'signi_acce', 'signi_soul'] as const;
  const out: { hostNum: string; zoneIdx: number; count: number }[] = [];
  const zones = after.field.signi?.length ?? 0;
  for (let z = 0; z < zones; z++) {
    const hostNum = after.field.signi[z]?.at(-1);
    if (!hostNum || before.field.signi[z]?.at(-1) !== hostNum) continue;
    let count = 0;
    for (const slot of slots) {
      if (slot === 'signi_acce') {
        const beforeSet = new Set(acceCardsAt(before.field, z));
        count += acceCardsAt(after.field, z).filter(cardNum => !beforeSet.has(cardNum)).length;
        continue;
      }
      const bv = (before.field[slot] ?? [])[z] ?? null;
      const av = (after.field[slot] ?? [])[z] ?? null;
      if (av && av !== bv) count++;
    }
    if (count > 0) out.push({ hostNum, zoneIdx: z, count });
  }
  return out;
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

/**
 * エナゾーンから出て行った枚数を算出（行き先を問わない＝「エナゾーンからカードN枚が他の領域に移動したとき」
 * ＝`triggerCondition.energyLeftToAnyZone`。WXDi-P06-038-E1）。
 * `countEnergyToTrash` の上位集合＝トラッシュ行きもここに含まれる。
 * ⚠同名カードが複数枚ある場合を取りこぼさないよう**多重集合の減少数**で数える（Set 差分だと
 *   「エナに同名2枚 → 1枚だけ移動」を0と誤読する）。
 */
export function countEnergyLeftZone(before: PlayerState, after: PlayerState): number {
  if (!before || !after) return 0;
  const counts = new Map<string, number>();
  for (const c of (after.energy ?? [])) counts.set(c, (counts.get(c) ?? 0) + 1);
  let count = 0;
  for (const c of (before.energy ?? [])) {
    const n = counts.get(c) ?? 0;
    if (n > 0) counts.set(c, n - 1);
    else count++;
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

/**
 * パワー減少を起こした効果元カード（temp_power_mods の新規負 delta の srcCardNum）を返す（ON_OPP_POWER_DECREASED
 * の発生源限定「あなたの＜X＞のシグニの効果によって」判定用・§3 タスク12(xxiv)）。
 * ⚠srcCardNum は全書き込み経路では埋まらない（POWER_MODIFY 本体は刻むが POWER_MODIFY_PER_* / STUB 系は刻まない）。
 * そこで **`fallbackSrc`＝中央 diff の `causeSourceCardNum`（いま解決中の効果の発生源カード）** を渡してもらい、
 * 未記録の1件はそこへ寄せる（減少はその効果の解決中に起きたので発生源はそのカード）。
 * それでも不明な1件は **空文字＝発生源不明** として**要素は残す**（§6.4 O-44）。
 * ⚠**1件でも未設定なら空配列**を返す旧仕様は廃止した＝呼び出し側の fail-open（不明なら発火）と組で
 * 「他3語彙は fail-closed・ここだけ fail-open」という規約の混在を生んでいたため（原文
 * 「あなたの＜毒牙＞のシグニの**効果によって**」＝原因の特定が意味の一部なので fail-closed が忠実）。
 */
export function detectPowerDecreaseSources(before: PlayerState, after: PlayerState, fallbackSrc?: string): string[] {
  if (!before || !after) return [];
  const beforeMods = before.temp_power_mods ?? [];
  const afterMods = after.temp_power_mods ?? [];
  const srcs: string[] = [];
  for (let i = beforeMods.length; i < afterMods.length; i++) {
    if (afterMods[i].delta >= 0) continue;
    srcs.push(afterMods[i].srcCardNum ?? fallbackSrc ?? '');   // '' ＝発生源不明（限定付き効果は非発火）
  }
  return srcs;
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

/** デッキ→トラッシュへ実際に移動したカードの instanceId 群。 */
export function detectMilledFromDeck(before: PlayerState, after: PlayerState): string[] {
  if (!before || !after) return [];
  const beforeDeck = new Set(before.deck);
  const beforeTrash = new Set(before.trash);
  return after.trash.filter(c => beforeDeck.has(c) && !beforeTrash.has(c));
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
 * **場（シグニゾーン）から**デッキへ移動した枚数（`ON_CARD_MOVED_TO_DECK` の由来限定）。
 *
 * §5.3 `O-116`（2026-08-27 Sheet1 B13）＝`WX05-019-E3`「対戦相手のシグニ１体が**場から**デッキに
 * 移動したとき」。従来の `triggerCondition` は `movedToDeckFromTrash` しか持たず、**「場から」も
 * 「シグニであること」も表せなかった**＝相手のデッキへ何が戻っても発火する過剰実行だった。
 * ⚠**シグニゾーンに居たカードは定義上シグニ**なので、この1本で由来とカード種別の両方を満たす。
 * ⚠`movedToDeckFromTrash` と**同じ形**（before のゾーンに居て after のデッキに居る）に揃えてある。
 */
export function countMovedToDeckFromField(before: PlayerState, after: PlayerState): number {
  if (!before || !after) return 0;
  const beforeDeck = new Set(before.deck);
  const beforeField = new Set(
    (before.field.signi ?? []).flatMap(stack => (stack ?? [])),
  );
  let n = 0;
  for (const c of after.deck) {
    if (beforeDeck.has(c)) continue;
    if (!beforeField.has(c)) continue;
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
      const target = KEYWORD_GAINED_TARGETS.find(name => kw === name || kw.startsWith(`${name}:`));
      if (!had.has(kw) && target) {
        out.push({ cardNum, keyword: target });
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

/**
 * 新たにダウン状態（signi_down false→true）になったシグニ番号を返す（ON_SIGNI_DOWN 用）。
 * 前後で同一シグニがゾーンに在中する場合のみ（「ダウン状態で場に出た」入場や入れ替わりは
 * 「ダウン状態になった」と区別＝placedDown 側の領分なので拾わない）。
 */
export function detectNewlyDowned(before: PlayerState, after: PlayerState): string[] {
  if (!before || !after) return [];
  const bd = before.field.signi_down ?? [];
  const ad = after.field.signi_down ?? [];
  const out: string[] = [];
  const zones = after.field.signi?.length ?? 0;
  for (let z = 0; z < zones; z++) {
    if (ad[z] === true && bd[z] !== true) {
      const num = after.field.signi[z]?.at(-1);
      if (num && before.field.signi[z]?.at(-1) === num) out.push(num);
    }
  }
  return out;
}

/**
 * 新たにアップ状態（signi_down true→false）になったシグニ番号＋センタールリグを返す（ON_SIGNI_BECOMES_UP 用）。
 * 同一シグニが在中する場合のみ（ダウンシグニが離れて空きゾーンになったケースを誤検出しない）。
 * lrigUpNum＝センタールリグが lrig_down true→false になった場合そのカード番号（WX20-051 の upIncludesLrig 用）。
 * ⚠アップフェイズの一斉アップは phase advance 経路＝本 detector を通らない（意図した近似＝効果によるアップのみ検出）。
 */
export function detectNewlyUpped(before: PlayerState, after: PlayerState): { nums: string[]; lrigUpNum: string | null } {
  if (!before || !after) return { nums: [], lrigUpNum: null };
  const bd = before.field.signi_down ?? [];
  const ad = after.field.signi_down ?? [];
  const nums: string[] = [];
  const zones = after.field.signi?.length ?? 0;
  for (let z = 0; z < zones; z++) {
    if (bd[z] === true && ad[z] !== true) {
      const num = after.field.signi[z]?.at(-1);
      if (num && before.field.signi[z]?.at(-1) === num) nums.push(num);
    }
  }
  const lrigTop = after.field.lrig.at(-1);
  const lrigUpNum = (before.field.lrig_down === true && after.field.lrig_down !== true
    && lrigTop && before.field.lrig.at(-1) === lrigTop) ? lrigTop : null;
  return { nums, lrigUpNum };
}
