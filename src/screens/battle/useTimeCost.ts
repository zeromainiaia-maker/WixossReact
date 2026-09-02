// 「この{スペル|アーツ}を使用する際、…してもよい。そうした場合、使用コストは《X》**減る**」＝
// **使用時（支払い時）の任意支払いによるコスト軽減**（タスク12(lxxxv)）。
//
// ⚠タスク12(lxxxi) の「使用コストは《X》に**なる**」＝**置換**（`computeCostReplacement`）とは別物。
//   あちらは色構成ごと差し替わるが、こちらは**印刷コストから差し引く**（`removeNColorFromCost` の反復）。
//
// ⚠**支払いは使用時に済ませる**＝効果解決中に同じ支払いを行う先頭ステップは parser 側で落とす
//   （`stripUseTimeCostPaymentStep`）。engine の該当 STUB（`OPTIONAL_DISCARD_CLASS_SIGNI` /
//   `ARTS_USE_DISCARD_LRIG_DECK` / `DOWN_UP_SIGNI_AND_CHOOSE` ほか）は**実装済みで実際に払わせる**ので、
//   落とさないと「使用時に払い、解決中にもう一度払わされ、しかも軽減は一度も効かない」ことになる。
import type { CardData, PlayerState } from '../../types';
import type { CardEffect, UseTimeCostSpecJson } from '../../types/effects';
import { getCardNum } from '../../engine/effectExecutor';
import { removeFromField } from '../../engine/execUtils';
import { removeNColorFromCost } from './costs';

/**
 * 支払い元ゾーン。`signi_trash` 以外は**平坦なリスト**か `signi_down` フラグだけを触る。
 * `signi_trash` だけは場からシグニを外す＝下のカード/チャーム/アクセ/ソウルの後始末（`removeFromField`）と
 * **離場トリガーの発火**（呼び出し側が中央 diff で拾う）が要る＝タスク12(lxxxix)。
 */
export type UseCostSource = UseTimeCostSpecJson['source'];

/** 支払い候補の絞り込み（指定されたものだけを AND で見る）。 */
export type UseCostFilter = UseTimeCostSpecJson['filter'];

/**
 * 実行時の spec＝JSON 表現（`UseTimeCostSpecJson`）の `max` を数値へ解いたもの。
 * 🔴**`'ANY'`（原文「好きな数／好きな枚数」）は `Infinity`**＝候補数が上限。
 */
export interface UseTimeCostSpec extends Omit<UseTimeCostSpecJson, 'max'> {
  max: number;
}

/**
 * 使用時の任意支払いによるコスト軽減＝**JSON payload だけを読む**（`EffectCost.useTimeCost`）。
 *
 * 🆕**2026-09-02（§5.3 `O-86` 第5バッチ）＝ここに在った `parseUseTimeCostReduction(effectText)` を撤去した**
 *   （81カード・規則6本）。読み取りは `src/data/keywordCosts.ts` の `parseUseTimeCostReductionText` へ移し、
 *   `buildEffectsJson.ts` が**収穫マージの後から**カードの先頭効果へ重ねる。
 * 🔴従来は **`artsUseGate` / `ArtsModal` / `SpellCastModal` / `BattleScreen`（2箇所）** が
 *   支払いのたびに `card.EffectText` を読み直しており、**支払いUI・可否ゲート・実際の支払いが
 *   別々に原文を再解釈していた**（規則を1本直すと5箇所ぶん挙動が動く形）。
 * ⚠**`'ANY'` を `Infinity` へ戻すのはここ1箇所**＝素通しすると `Math.min(spec.max, available)` が
 *   NaN になり、選択がまったく成立しない。
 */
export function resolveUseTimeCost(
  cardNum: string,
  effectsMap: Map<string, CardEffect[]>,
): UseTimeCostSpec | null {
  for (const effect of effectsMap.get(getCardNum(cardNum)) ?? []) {
    const spec = effect.cost?.useTimeCost;
    if (spec) return { ...spec, max: spec.max === 'ANY' ? Infinity : spec.max };
  }
  return null;
}

/** カード1枚が支払い候補の条件を満たすか。 */
export function matchesUseCostFilter(cardNum: string, f: UseCostFilter, cardMap: Map<string, CardData>): boolean {
  const c = cardMap.get(cardNum) ?? cardMap.get(getCardNum(cardNum));
  if (!c) return false;
  if (f.cardType && c.Type !== f.cardType) return false;
  if (f.color && !(c.Color ?? '').includes(f.color)) return false;
  if (f.story && !f.story.some(s => (c.CardClass ?? '').includes(s))) return false;
  if (f.hasGuard && c.Guard !== '1') return false;
  if (f.minPower !== undefined && (parseInt(c.Power ?? '0') || 0) < f.minPower) return false;
  if (f.maxLevel !== undefined && (parseInt(c.Level ?? '0') || 0) > f.maxLevel) return false;
  return true;
}

/** 支払い候補1件（`key` は選択の同一性・`cardNum` は表示と照合に使う）。 */
export interface UseCostCandidate {
  key: string;
  cardNum: string;
}

/**
 * 現在の盤面から支払い候補を列挙する。
 * ⚠**使用するカード自身は手札から除く**（`selfHandIdx`）＝スペルは自分を捨てて自分を安くできない。
 */
export function useTimeCostCandidates(
  spec: UseTimeCostSpec,
  my: PlayerState,
  cardMap: Map<string, CardData>,
  selfHandIdx?: number,
): UseCostCandidate[] {
  switch (spec.source) {
    case 'hand':
      return my.hand
        .map((cn, i) => ({ key: `h:${i}`, cardNum: cn, i }))
        .filter(c => c.i !== selfHandIdx && matchesUseCostFilter(c.cardNum, spec.filter, cardMap))
        .map(({ key, cardNum }) => ({ key, cardNum }));
    case 'signi_down':
      return [0, 1, 2].flatMap(zi => {
        const top = my.field.signi[zi]?.at(-1);
        if (!top) return [];
        if (my.field.signi_down?.[zi]) return [];   // 既にダウン＝ダウンできない
        if (!matchesUseCostFilter(top, spec.filter, cardMap)) return [];
        return [{ key: `z:${zi}`, cardNum: top }];
      });
    case 'signi_trash':
      // ダウンと違い**アップ/ダウンを問わない**（原文が「アップ状態の」と言っていない）。
      return [0, 1, 2].flatMap(zi => {
        const top = my.field.signi[zi]?.at(-1);
        if (!top) return [];
        if (!matchesUseCostFilter(top, spec.filter, cardMap)) return [];
        return [{ key: `z:${zi}`, cardNum: top }];
      });
    case 'lrig_deck_arts':
      return my.lrig_deck
        .map((cn, i) => ({ key: `l:${i}`, cardNum: cn }))
        .filter(c => matchesUseCostFilter(c.cardNum, spec.filter, cardMap));
    case 'life_cloth':
      // ライフクロスは裏向き＝どれを選んでも同じ。UI では枚数だけを問う。
      return my.life_cloth.map((cn, i) => ({ key: `c:${i}`, cardNum: cn }));
    case 'key':
      return [
        ...(my.field.key_piece ? [{ key: 'k:0', cardNum: my.field.key_piece }] : []),
        ...(my.field.key_piece_extra ?? []).map((cn, i) => ({ key: `k:${i + 1}`, cardNum: cn })),
      ];
  }
}

/**
 * 支払った枚数ぶんの軽減を印刷コストへ適用する。
 * 固定形（`perUnit:false`）は**ちょうど `max` 枚**払ったときだけ1回効く（半端な支払いでは軽減しない）。
 */
export function applyUseTimeCostReduction(cost: string, spec: UseTimeCostSpec, paidCount: number): string {
  const times = spec.perUnit ? paidCount : (paidCount >= spec.max ? 1 : 0);
  if (times <= 0) return cost;
  let result = cost;
  for (const r of spec.reduction) result = removeNColorFromCost(result, r.color, r.count * times);
  return result;
}

/** 選択が支払いとして成立するか（0枚＝支払わない、も成立＝軽減なしで使える）。 */
export function useTimeCostSelectionValid(spec: UseTimeCostSpec, selected: Set<string>, available: number): boolean {
  if (selected.size === 0) return true;
  if (selected.size > Math.min(spec.max, available)) return false;
  // 固定形は「ちょうど max 枚」以外の中途半端な選択を認めない（払っても軽減されない選択を防ぐ）。
  return spec.perUnit || selected.size === spec.max;
}

/**
 * 選んだ支払いを実際に盤面へ適用する。戻り値の `state` は支払い後の自分の状態。
 * ⚠**呼び出し側は `applyUseTimeCostReduction` で計算したコストを払わせること**（ここではエナを触らない）。
 */
export function payUseTimeCost(
  my: PlayerState,
  spec: UseTimeCostSpec,
  selected: Set<string>,
  cardMap: Map<string, CardData>,
): { state: PlayerState; paidCount: number; label: string } {
  const idxOf = (prefix: string) => [...selected]
    .filter(k => k.startsWith(prefix))
    .map(k => parseInt(k.slice(prefix.length)))
    .filter(n => Number.isInteger(n));
  const nameOf = (cn: string) => cardMap.get(getCardNum(cn))?.CardName ?? cn;
  if (selected.size === 0) return { state: my, paidCount: 0, label: '' };

  switch (spec.source) {
    case 'hand': {
      const idx = new Set(idxOf('h:'));
      const moved = my.hand.filter((_, i) => idx.has(i));
      return {
        state: {
          ...my,
          hand: my.hand.filter((_, i) => !idx.has(i)),
          trash: [...my.trash, ...moved],
          turn_hand_discarded_count: (my.turn_hand_discarded_count ?? 0) + moved.length,
          turn_hand_discarded_cards: [...(my.turn_hand_discarded_cards ?? []), ...moved],
        },
        paidCount: moved.length,
        label: `手札から${moved.map(nameOf).join('・')}を捨てて使用コストを軽減`,
      };
    }
    case 'signi_down': {
      const zones = new Set(idxOf('z:'));
      const downed = [...zones].map(zi => my.field.signi[zi]?.at(-1)).filter((v): v is string => !!v);
      return {
        state: {
          ...my,
          field: {
            ...my.field,
            signi_down: [0, 1, 2].map(zi => zones.has(zi) ? true : (my.field.signi_down?.[zi] ?? false)),
          },
        },
        paidCount: zones.size,
        label: `${downed.map(nameOf).join('・')}をダウンして使用コストを軽減`,
      };
    }
    case 'signi_trash': {
      // ⚠場から外すのは `removeFromField` に任せる＝下のカード/チャーム/アクセ（→トラッシュ）と
      //   ソウル（→ルリグトラッシュ）、ダウン/凍結/血晶武装フラグの後始末が全部そこにある。
      //   離場・トラッシュのトリガーは呼び出し側（BattleScreen の中央 diff）が拾う。
      // ⚠`removeFromField` は**カード名（インスタンスID）でゾーンを引く**＝同じ文字列が2ゾーンに
      //   居ると先頭ゾーンしか外れない。場の要素は `assignInstanceIds` の `CardNum#n` で一意なので
      //   成り立つ前提（この不変条件が崩れると2体払いが壊れる）。
      const zones = idxOf('z:');
      let st = my;
      const moved: string[] = [];
      for (const zi of zones) {
        const top = my.field.signi[zi]?.at(-1);
        if (!top) continue;
        moved.push(top);
        st = removeFromField(top, st);
        st = { ...st, trash: [...st.trash, top] };
      }
      return {
        state: st,
        paidCount: moved.length,
        label: `${moved.map(nameOf).join('・')}を場からトラッシュに置いて使用コストを軽減`,
      };
    }
    case 'lrig_deck_arts': {
      const idx = new Set(idxOf('l:'));
      const moved = my.lrig_deck.filter((_, i) => idx.has(i));
      return {
        state: {
          ...my,
          lrig_deck: my.lrig_deck.filter((_, i) => !idx.has(i)),
          lrig_trash: [...my.lrig_trash, ...moved],
        },
        paidCount: moved.length,
        label: `ルリグデッキから${moved.map(nameOf).join('・')}をルリグトラッシュに置いて使用コストを軽減`,
      };
    }
    case 'life_cloth': {
      const idx = new Set(idxOf('c:'));
      const moved = my.life_cloth.filter((_, i) => idx.has(i));
      return {
        state: {
          ...my,
          life_cloth: my.life_cloth.filter((_, i) => !idx.has(i)),
          trash: [...my.trash, ...moved],
        },
        paidCount: moved.length,
        label: `ライフクロス${moved.length}枚をトラッシュに置いて使用コストを軽減`,
      };
    }
    case 'key': {
      const slots = new Set(idxOf('k:'));
      const extra = my.field.key_piece_extra ?? [];
      const moved = [
        ...(slots.has(0) && my.field.key_piece ? [my.field.key_piece] : []),
        ...extra.filter((_, i) => slots.has(i + 1)),
      ];
      return {
        state: {
          ...my,
          field: {
            ...my.field,
            key_piece: slots.has(0) ? null : my.field.key_piece,
            key_piece_extra: extra.filter((_, i) => !slots.has(i + 1)),
          },
          lrig_trash: [...my.lrig_trash, ...moved],
        },
        paidCount: moved.length,
        label: `${moved.map(nameOf).join('・')}をルリグトラッシュに置いて使用コストを軽減`,
      };
    }
  }
}
