/**
 * §5.3 `O-356`（2026-09-13）＝**engine が実行時に原文 regex で決めていた値を、効果の payload として刻む**。
 *
 * 旧実装では次の STUB の意味を engine がカード原文から毎回読み直しており、逆翻訳も原文を貼っていた
 * （＝原文照合がその STUB で構造的に効かなかった）。ここで**engine が読んでいたのと同じ原文へ同じ regex**を
 * 当てて payload にし、engine は payload だけを読む。第314バッチでは、門別 miss の実測で残った
 * `INHERIT_UNDER_SIGNI_COLOR` の文型差と、明示指定された `LRIG_LIMIT_UP_AND_COLOR_GAIN` も同じ型へ移した。
 *   - `OPTIONAL_TRASH_ENERGY_CLASS` → `optionalEnergyTrash`（アビリティ原文＝`abilityBlockTextOf`）
 *   - `FIELD_ENERGY_SIGNI_GAIN_COLOR` → `gainColor` / `gainColorDissonaOnly` / `gainColorUnsupportedFilter`（カード原文）
 *   - `TREAT_AS_CLASS_ALL_ZONES` → `treatAsClass`（カード原文）
 *   - `PREVENT_SIGNI_ABILITY_LOSS_BY_OPP` → `protectColor`（カード原文）
 *   - `LRIG_LIMIT_UP_AND_COLOR_GAIN` → `lrigTypeGain`（追加タイプ・色・リミット増分）
 *   - `INHERIT_UNDER_SIGNI_COLOR` → `inheritUnderSigniColor`（下敷きシグニのクラス）
 *
 * 🔴**`parseCardEffects` の中から呼んではいけない**＝`abilityBlockTextOf` は未キャッシュのカードで
 *   `parseCardEffects` を呼ぶので、parser の末尾から呼ぶと再入して終わらない。
 *   ⇒ 呼ぶのは **parse が返った後**＝`scripts/buildEffectsJson.ts`（fresh へ）と `scripts/fillSourceTextPayloads.ts`（live へ）。
 */
import { abilityBlockTextOf } from './effectParser';
import type { CardData } from '../types';

const toHalfWidthDigits = (s: string) => s.replace(/[０-９]/g, c => String('０１２３４５６７８９'.indexOf(c)));

/** STUB id → この仕組みが刻む payload キー（刻み直す前に消す）。 */
export const SOURCE_TEXT_PAYLOAD_KEYS: Record<string, string[]> = {
  OPTIONAL_TRASH_ENERGY_CLASS: ['optionalEnergyTrash'],
  FIELD_ENERGY_SIGNI_GAIN_COLOR: ['gainColor', 'gainColorDissonaOnly', 'gainColorUnsupportedFilter'],
  TREAT_AS_CLASS_ALL_ZONES: ['treatAsClass'],
  PREVENT_SIGNI_ABILITY_LOSS_BY_OPP: ['protectColor'],
  LRIG_LIMIT_UP_AND_COLOR_GAIN: ['lrigTypeGain'],
  INHERIT_UNDER_SIGNI_COLOR: ['inheritUnderSigniColor'],
};

/** engine が旧実装で読んでいた原文・regex をそのまま当てて payload を作る。 */
export function sourceTextPayloadFor(stubId: string, card: CardData, effectId: string): Record<string, unknown> {
  const cardText = card.EffectText ?? '';
  if (stubId === 'OPTIONAL_TRASH_ENERGY_CLASS') {
    // 旧 `effectExecutor.ts`：`sourceAbilityText(cur)`＝`abilityBlockTextOf(card, sourceEffectId)`。
    const txt = abilityBlockTextOf(card, effectId);
    const trashClause = txt.match(/エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)([０-９\d]+)枚を?トラッシュ/);
    const classM = trashClause ?? txt.match(/エナゾーンから(?:あなたの)?(?:＜([^＞]+)＞の)?(?:シグニ|カード)/);
    return {
      optionalEnergyTrash: {
        ...(classM?.[1] ? { story: classM[1] } : {}),
        count: trashClause?.[2] ? parseInt(toHalfWidthDigits(trashClause[2]), 10) : 1,
        ...(/それを手札に加える/.test(txt) ? { toHand: true } : {}),
      },
    };
  }
  if (stubId === 'FIELD_ENERGY_SIGNI_GAIN_COLOR') {
    const colorM = cardText.match(/追加で([白赤青緑黒])を得る/);
    if (!colorM) return {};
    const dissona = /《ディソナアイコン》のシグニ/.test(cardText);
    return {
      gainColor: colorM[1],
      ...(dissona ? { gainColorDissonaOnly: true } : {}),
      ...(/《[^》]+》のシグニ/.test(cardText) && !dissona ? { gainColorUnsupportedFilter: true } : {}),
    };
  }
  if (stubId === 'TREAT_AS_CLASS_ALL_ZONES') {
    const m = /すべての領域で＜(.+?)＞として扱う/.exec(cardText);
    return m ? { treatAsClass: m[1] } : {};
  }
  if (stubId === 'PREVENT_SIGNI_ABILITY_LOSS_BY_OPP') {
    const m = cardText.match(/あなたの他の([^の]+?)のシグニは対戦相手の効果によって能力を失わない/);
    return m ? { protectColor: m[1] } : {};
  }
  if (stubId === 'LRIG_LIMIT_UP_AND_COLOR_GAIN') {
    const gainM = cardText.match(/追加で(?:([白赤青緑黒]+)と)?＜([^＞]+)＞を得る/);
    if (!gainM) return {};
    const limitM = cardText.match(/リミットは([０-９\d]+)増え/);
    return {
      lrigTypeGain: {
        types: [gainM[2]],
        ...(gainM[1] ? { colors: [...gainM[1]].filter(c => '白赤青緑黒'.includes(c)) } : {}),
        ...(limitM ? { limitDelta: parseInt(toHalfWidthDigits(limitM[1]), 10) } : {}),
      },
    };
  }
  if (stubId === 'INHERIT_UNDER_SIGNI_COLOR') {
    const m = cardText.match(/この(?:カード|シグニ)の下にある＜([^＞]+)＞のシグニが持つ色を得る/);
    return m ? { inheritUnderSigniColor: { story: m[1] } } : {};
  }
  return {};
}

function fillNode(node: unknown, card: CardData, effectId: string, stats?: Record<string, number>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) fillNode(x, card, effectId, stats); return; }
  const o = node as Record<string, unknown>;
  if (o.type === 'STUB' && typeof o.id === 'string' && SOURCE_TEXT_PAYLOAD_KEYS[o.id]) {
    for (const k of SOURCE_TEXT_PAYLOAD_KEYS[o.id]) delete o[k];
    Object.assign(o, sourceTextPayloadFor(o.id, card, effectId));
    if (stats) stats[o.id] = (stats[o.id] ?? 0) + 1;
  }
  for (const v of Object.values(o)) fillNode(v, card, effectId, stats);
}

/** カードの効果配列へ payload を刻む（破壊的・冪等）。effectId はトップレベル効果のもの＝engine の `sourceEffectId` と同じ。 */
export function fillSourceTextPayloads(card: CardData, effects: readonly { effectId: string }[], stats?: Record<string, number>): void {
  for (const e of effects) fillNode(e, card, e.effectId, stats);
}
