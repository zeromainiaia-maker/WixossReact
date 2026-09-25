import type { CardData, PlayerState } from '../../types';
import { countBarrierTokens, getCardNum, LRIG_BARRIER_CARD, SIGNI_BARRIER_CARD } from '../../engine/execUtils';
import { hasKeyword } from '../../utils/keywords';

/**
 * 🆕**作戦データの「使うタイミング」で数える特殊状態の一覧**（2026-09-26 ユーザー要望・一覧はユーザー確認済み）。
 *
 * ■ なぜ一覧か（ユーザー判断）＝「自分由来か相手由来か」で分けるのではなく、**状態を網羅的に並べて
 *   「自分／相手 × 場・エナ・手札・トラッシュ × 何枚以上／以下」を作り手が選ぶ**。
 * ■ 4つの群（画面の見出しと同じ）
 *   - `fieldState`＝場のシグニの状態（場でしか成り立たない）
 *   - `attached`＝シグニ・ゾーンに付く／置かれるもの（場）
 *   - `keyword`＝カードが持つキーワード能力（場・エナ・手札・トラッシュのどこでも数える）
 *   - `player`＝プレイヤー・ルリグ側の状態（置き場を選ばない）
 * 🔑**判定はここ1本**（`countCardsInState`）＝画面・保存・判定で読み方がずれないように、選択肢もこの表から作る。
 * ⚠**見るのは公開情報だけ**＝相手の手札の状態は数えない（`statePlacesFor` が選択肢に出さず、保存済みの値も
 *   `cpuDeckPlan.toCond` の正規化で落とす）。
 */
export type CpuStateGroup = 'fieldState' | 'attached' | 'keyword' | 'player';

/** 数える置き場（`player` 群は置き場を持たない）。 */
export type CpuStatePlace = 'field' | 'energy' | 'hand' | 'trash';

export const CPU_STATE_PLACES: readonly CpuStatePlace[] = ['field', 'energy', 'hand', 'trash'];
export const CPU_STATE_PLACE_LABELS: Readonly<Record<CpuStatePlace, string>> = {
  field: '場', energy: 'エナ', hand: '手札', trash: 'トラッシュ',
};

export const CPU_STATE_GROUP_LABELS: Readonly<Record<CpuStateGroup, string>> = {
  fieldState: '場のシグニの状態', attached: '付く／置かれるもの（場）', keyword: 'キーワード能力', player: 'プレイヤー・ルリグ',
};

interface StateDef {
  key: string;
  label: string;
  group: CpuStateGroup;
  /** `keyword` 群だけ＝照合するキーワード名（原文の【】の中身）。 */
  keyword?: string;
}

const S = (group: CpuStateGroup, key: string, label: string, keyword?: string): StateDef => ({ key, label, group, keyword });

/** 🔑**並び＝画面の並び**。キーを変えると保存済みの作戦が読めなくなる（知らないキーは正規化で落ちる）。 */
export const CPU_STATE_DEFS: readonly StateDef[] = [
  // ── A. 場のシグニの状態 ──
  S('fieldState', 'up', 'アップ状態'),
  S('fieldState', 'down', 'ダウン状態'),
  S('fieldState', 'frozen', '凍結状態'),
  S('fieldState', 'infected', '感染状態'),
  S('fieldState', 'awakened', '覚醒状態'),
  S('fieldState', 'drive', 'ドライブ状態'),
  S('fieldState', 'cross', 'クロス状態'),
  S('fieldState', 'armor', '血晶武装状態'),
  S('fieldState', 'puppet', '傀儡状態'),
  S('fieldState', 'heaven', 'ヘブン済み'),
  S('fieldState', 'facedown', '裏向きのシグニゾーンのカード'),
  S('fieldState', 'noAbilities', '能力を失っている'),
  S('fieldState', 'gateZone', 'ゲートと同じゾーン'),
  // ── B. 付く／置かれるもの ──
  S('attached', 'virus', 'ウィルス'),
  S('attached', 'charm', 'チャーム付き'),
  S('attached', 'acce', 'アクセ付き'),
  S('attached', 'soul', 'ソウル付き'),
  S('attached', 'rise', 'ライズ（下にカードがある）'),
  S('attached', 'trap', 'トラップ（設置）'),
  S('attached', 'seed', 'シード（設置）'),
  S('attached', 'magicBox', 'マジックボックス（設置）'),
  S('attached', 'chokkin', '貯菌カウンター'),
  S('attached', 'facedownAttached', '裏向きで付けられたカード'),
  S('attached', 'beat', 'ビートゾーンのカード'),
  // ── C. キーワード能力 ──
  S('keyword', 'kwLancer', '【ランサー】', 'ランサー'),
  S('keyword', 'kwSLancer', '【Ｓランサー】', 'Ｓランサー'),
  S('keyword', 'kwAssassin', '【アサシン】', 'アサシン'),
  S('keyword', 'kwShadow', '【シャドウ】', 'シャドウ'),
  S('keyword', 'kwDoubleCrush', '【ダブルクラッシュ】', 'ダブルクラッシュ'),
  S('keyword', 'kwTripleCrush', '【トリプルクラッシュ】', 'トリプルクラッシュ'),
  S('keyword', 'kwShoot', '【シュート】', 'シュート'),
  S('keyword', 'kwGuard', '【ガード】', 'ガード'),
  S('keyword', 'kwMultiEna', '【マルチエナ】', 'マルチエナ'),
  S('keyword', 'kwLifeBurst', 'ライフバースト', 'ライフバースト'),
  S('keyword', 'kwCharm', '【チャーム】を持つ', 'チャーム'),
  S('keyword', 'kwAcce', '【アクセ】を持つ', 'アクセ'),
  S('keyword', 'kwRise', '【ライズ】を持つ', 'ライズ'),
  S('keyword', 'kwTrap', '【トラップ】を持つ', 'トラップ'),
  S('keyword', 'kwSeed', '【シード】を持つ', 'シード'),
  S('keyword', 'kwMagicBox', '【マジックボックス】を持つ', 'マジックボックス'),
  S('keyword', 'kwDecore', '【デコレ】', 'デコレ'),
  S('keyword', 'kwHarmony', '【ハーモニー】', 'ハーモニー'),
  S('keyword', 'kwRide', '【ライド】', 'ライド'),
  S('keyword', 'kwChain', '【チェイン】', 'チェイン'),
  S('keyword', 'kwEichi', '【英知】', '英知'),
  S('keyword', 'kwConvert', '【コンバート】', 'コンバート'),
  S('keyword', 'kwLimitUpper', '【リミットアッパー】', 'リミットアッパー'),
  S('keyword', 'kwAssist', '【アシスト】', 'アシスト'),
  S('keyword', 'kwGrow', '【グロウ】', 'グロウ'),
  // ── D. プレイヤー・ルリグ ──
  S('player', 'lrigBarrier', 'ルリグバリア'),
  S('player', 'signiBarrier', 'シグニバリア'),
  S('player', 'coin', 'コイン'),
  S('player', 'lrigFrozen', '凍結状態のルリグ'),
  S('player', 'lrigDown', 'ダウン状態のルリグ'),
];

const DEF_BY_KEY = new Map(CPU_STATE_DEFS.map(d => [d.key, d]));
export const CPU_STATE_KEYS: readonly string[] = CPU_STATE_DEFS.map(d => d.key);

export const cpuStateDef = (key: string): StateDef | undefined => DEF_BY_KEY.get(key);

/**
 * その状態を**どの置き場で数えられるか**（画面の選択肢・正規化の両方がこれを読む）。
 * 🔴**相手の手札は見えない**＝`opp` には `hand` を出さない。`player` 群は置き場を持たない（空配列）。
 */
export function statePlacesFor(key: string, side: 'me' | 'opp'): readonly CpuStatePlace[] {
  const def = DEF_BY_KEY.get(key);
  if (!def || def.group === 'player') return [];
  if (def.group !== 'keyword') return ['field'];
  return side === 'opp' ? ['field', 'energy', 'trash'] : CPU_STATE_PLACES;
}

/** 単位（体＝場のシグニ／枚＝それ以外）。 */
export function stateUnit(key: string, place: CpuStatePlace | undefined): string {
  const def = DEF_BY_KEY.get(key);
  if (!def) return '枚';
  if (def.group === 'player') return key === 'lrigFrozen' || key === 'lrigDown' ? '体' : '枚';
  if (def.group === 'fieldState' || key === 'charm' || key === 'acce' || key === 'soul' || key === 'rise') return '体';
  return place === 'field' && def.group === 'keyword' ? '体' : '枚';
}

/**
 * **印刷されたカードがそのキーワードを持つか**（エナ・手札・トラッシュ＝付与は無い）。
 * 🔑戦闘のキーワードは engine の照合口（`hasKeyword`＝綴りズレ・条件つき付与の除外まで同じ）。
 *   それ以外（【チャーム】【ライズ】…を持つ札）は原文の【】で照合する（「ランサー」が「Ｓランサー」に当たらないよう【の直後から見る）。
 */
function printedHasKeyword(num: string, def: StateDef, cardMap: Map<string, CardData>): boolean {
  const card = cardMap.get(getCardNum(num));
  if (!card || !def.keyword) return false;
  if (def.key === 'kwGuard') return card.Guard === '1';
  if (def.key === 'kwLifeBurst') return card.LifeBurst === '1';
  if (hasKeyword(getCardNum(num), def.keyword, cardMap)) return true;
  const text = `${card.EffectText ?? ''}\n${card.BurstText ?? ''}`;
  return new RegExp(`【${def.keyword}[】（(＝]`).test(text);
}

/**
 * 🆕**その置き場で、その状態のカードが何枚（何体）あるか**。
 * ⚠`fieldState`／`attached` は `place` を見ない（場だけ）。`player` 群は置き場を持たない。
 */
export function countCardsInState(
  st: PlayerState, key: string, place: CpuStatePlace | undefined, cardMap: Map<string, CardData> | undefined,
): number {
  const def = DEF_BY_KEY.get(key);
  if (!def) return 0;
  const f = st.field;
  const top = (z: number) => f.signi[z]?.at(-1);
  const zones = (pred: (z: number) => boolean) => [0, 1, 2].filter(pred).length;
  const withSigni = (pred: (z: number, id: string) => boolean) => zones(z => { const id = top(z); return !!id && pred(z, id); });
  switch (key) {
    case 'up': return withSigni(z => !f.signi_down?.[z]);
    case 'down': return withSigni(z => !!f.signi_down?.[z]);
    case 'frozen': return withSigni(z => !!f.signi_frozen?.[z]);
    case 'infected': return withSigni(z => (f.signi_virus?.[z] ?? 0) > 0);
    case 'awakened': return withSigni((_, id) => (st.awakened_signi ?? []).includes(id));
    case 'drive': return withSigni((_, id) => (st.lrig_riding_signi ?? []).includes(id));
    case 'cross': return withSigni(z => !!f.cross_state?.[z]);
    case 'armor': return withSigni(z => !!f.signi_armor?.[z]);
    case 'puppet': return withSigni((_, id) => (f.puppet_signi ?? []).includes(id));
    case 'heaven': return withSigni(z => !!f.heaven_state?.[z]);
    case 'facedown': return zones(z => !!f.facedown_signi?.[z]);
    case 'noAbilities': return withSigni((_, id) => (st.abilities_removed ?? []).includes(id));
    case 'gateZone': return withSigni(z => (st.own_gate_zones ?? []).includes(z));
    // ⚠ウィルス・トラップ・シード・マジックボックスは**ゾーンに置かれる**＝シグニがいなくても数える。
    case 'virus': return zones(z => (f.signi_virus?.[z] ?? 0) > 0);
    case 'charm': return withSigni(z => !!f.signi_charms?.[z]);
    case 'acce': return withSigni(z => (f.signi_acce?.[z]?.length ?? 0) > 0);
    case 'soul': return withSigni(z => !!f.signi_soul?.[z]);
    case 'rise': return zones(z => (f.signi[z]?.length ?? 0) >= 2);
    case 'trap': return zones(z => !!f.signi_traps?.[z]);
    case 'seed': return zones(z => !!f.signi_seeds?.[z]);
    case 'magicBox': return zones(z => !!f.signi_magic_boxes?.[z]);
    case 'chokkin': return [0, 1, 2].reduce((sum, z) => sum + (f.signi_chokkin?.[z] ?? 0), 0);
    case 'facedownAttached': return [0, 1, 2].reduce((sum, z) => sum + (f.signi_facedown_attached?.[z]?.length ?? 0), 0);
    case 'beat': return f.beat_zone?.length ?? 0;
    case 'lrigBarrier': return countBarrierTokens(f.free_zone, LRIG_BARRIER_CARD);
    case 'signiBarrier': return countBarrierTokens(f.free_zone, SIGNI_BARRIER_CARD);
    case 'coin': return st.coins ?? 0;
    case 'lrigFrozen': return [f.lrig_frozen, f.assist_lrig_l_frozen, f.assist_lrig_r_frozen].filter(Boolean).length;
    case 'lrigDown': return [f.lrig_down, f.assist_lrig_l_down, f.assist_lrig_r_down].filter(Boolean).length;
  }
  // ── キーワード能力 ──
  if (!cardMap) return 0;
  if (place === 'field') {
    // 🔑場は**付与・失った能力まで**見る（engine と同じ照合口）。
    return withSigni((_, id) => {
      const num = getCardNum(id);
      if (def.key === 'kwGuard' || def.key === 'kwLifeBurst') return printedHasKeyword(id, def, cardMap) && !(st.abilities_removed ?? []).includes(id);
      if (hasKeyword(id, def.keyword!, cardMap, st.keyword_grants, undefined, st.keyword_grants_until_opp_turn,
        undefined, st.abilities_removed, st.keyword_abilities_removed)) return true;
      return !(st.abilities_removed ?? []).includes(id) && printedHasKeyword(num, def, cardMap);
    });
  }
  const pile = place === 'energy' ? st.energy : place === 'hand' ? st.hand : place === 'trash' ? st.trash : [];
  return (pile ?? []).filter(id => printedHasKeyword(id, def, cardMap)).length;
}
