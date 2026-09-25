import type { PlayerState } from '../../types';
import { getCardNum } from '../../engine/execUtils';
import { DEFAULT_CPU_POLICY, type CpuPolicy, type PlanWeights } from './cpuPolicy';

/**
 * 🆕**CPU デッキの作戦データ**（§5.7 `S-2`・2026-09-17）＝デッキごとに「どの札が大事か・何を先に出すか・どのコンボを狙うか」を持たせる。
 *
 * ■ なぜ要るか（ユーザー指摘）＝「CPU の使うデッキによって強い行動が変わる」「複数のカードのコンボが強い」。
 *   `S-1` の強さ表はカード1枚ずつの採点なので、**デッキ固有の役割とカード同士の組み合わせ**は表せない。探索（`S-3`）なしで決まる部分をデータで持つ。
 *
 * ■ 中身（`decks.cpu_plan`・CPU デッキだけ）
 *   - `keyCards`＝キーカード：エナに置かない・捨てない・マリガンで戻さない・サーチで優先する。
 *   - `priorityCards`＝優先して出す札。
 *   - `combos`＝**順番に打つ手の列**（🆕§5.7 `S-14`）：1手ごとに**出す／【起】で使う／アーツで撃つ／スペルで使う**を持つ。
 *     後の手の札が手元にあれば前の手を先に打ち、前の手が済むまで後の手は温存し、前が済んだら後を最優先にする。
 *
 * ■ 使い方＝`S-1` の強さ（パワー換算）に**足し引きする点数**を返すだけ。可否の判定・実行には関わらない（§5.6.3）。
 *   カードはカード番号（instance の `#…` を外した番号）で持つ。
 */
/**
 * 🆕**コンボの1手の「使い方」**（§5.7 `S-14`・2026-09-21）。
 * 🔴**なぜ要るか（実測）**＝21デッキの作戦データを下書きしたら、**3件のコンボが「出す」では書けなかった**
 *   （`WD06` リュウグウの【起】でライフを入れ替える／`WD08` ウムル＝フィーラの【出】→ネビュラを**トラッシュから【起】**／
 *   `WD16` Ｆ・Ｍ・Ｓ の【起】でハンデス→Ｇ・Ｌ・Ｋ が出せる）。
 * ⚠**`activate` は「場・手札・トラッシュ・エナのどこから撃つか」を区別しない**＝どの窓でも「その札の【起】を使った」で1つ。
 */
export type CpuComboUse = 'deploy' | 'activate' | 'arts' | 'spell';

/** 選べる使い方（UI の並び順＝この順）。 */
export const CPU_COMBO_USES: readonly CpuComboUse[] = ['deploy', 'activate', 'arts', 'spell'];

/** 画面と逆引きの表示名。 */
export const CPU_COMBO_USE_LABELS: Readonly<Record<CpuComboUse, string>> = {
  deploy: '出す', activate: '【起】で使う', arts: 'アーツで撃つ', spell: 'スペルで使う',
};

/**
 * 🆕**その効果が「選ぶ」ときの選び方**（2026-09-25 ユーザー要望「コンボでカードの効果やその効果の選ぶ先まで決めたい」）。
 * - `opp`／`self`＝**相手の札を選ぶとき／自分の札を選ぶとき**の狙い方（🆕2026-09-26 `S-36`＝分けた。未指定＝規則へ落ちる）。
 * - `cards`＝**この札を優先して選ぶ**（対象・サーチ・公開から選ぶ、のどれにも効く＝`planTargetBonus`／`planKeepBonus` と同じ口）。
 *   ⚠**自分のデッキの札だけ**（`pruneCpuDeckPlan` がデッキ外を落とす）。
 * ⚠旧形 `{ mode }` は**両側へ同じ狙い方**として読む（`normalizeCpuDeckPlan`＝旧の意味＝得になる側の並び）。
 */
export interface CpuEffectPick {
  opp?: CpuSideTarget;
  self?: CpuSideTarget;
  cards?: string[];
}

/** コンボの1手。 */
export interface CpuComboStep {
  num: string;
  use: CpuComboUse;
  /**
   * 🆕**どの効果か**（2026-09-25）＝`-E1` / `-E2` / `-BURST` … の effectId。未指定＝その札のどの効果でも。
   * 🔑`activate` では**どの【起】を使うか**まで絞る（加点も「済んだ」の判定もその効果だけ）。
   *   `deploy`／`arts`／`spell` では `pick` を当てる効果を決めるだけ（出す・撃つこと自体は札単位）。
   */
  effectId?: string;
  /** 🆕この手の効果が選ぶときの選び方（未指定＝いつもどおり）。 */
  pick?: CpuEffectPick;
}

/**
 * コンボ＝**手の列**（2手に限らない）。
 * 🔴**旧形 `{ first, then }` も読める**（`normalizeCpuDeckPlan` が「出す → 出す」の2手へ変換する）＝
 *   既に入力済みの `decks.cpu_plan` を壊さない。
 */
export interface CpuDeckCombo {
  steps: CpuComboStep[];
}

/**
 * 🆕**効果の対象の狙い方**（§5.7 `S-32`・2026-09-21 ユーザー要望
 * 「相手のパワーの大きいもの」「パワーを下げることでバニッシュできるもの」「固有のカード指定」）。
 * - `strongest`＝**既定**。価値（パワー＋効果）が高い順＝`S-22` で入れた挙動そのまま。
 * - `killable`＝**その効果で場から離せる対象を先に**（パワーを下げて0以下にできる）。**相手の札だけ**。
 *   🔴**「離せる」が分かるのはパワーを下げる効果だけ**＝バニッシュ等は全部離せるので `strongest` と同じになる。
 * - `weakest`＝価値の低い順（⚠**自分の札を対象に取る効果**で「安いものを差し出す」向き）。
 * - 🆕`beatsFront`（2026-09-26 `S-36`）＝**効果の後、正面とのバトルに勝てるようになるものを先に**
 *   （自分の札＝強化して正面の相手シグニを上回る／相手の札＝弱めて正面の自分のシグニが上回れる）。
 *   🔑**バトルの勝ちは公式ルールどおり「パワー以上」**（`cpuAttackValueOf` と同じ）。
 *   ⚠**分かるのはパワーを増減・固定する効果だけ**（それ以外は `strongest` と同じ並び）。
 */
export type CpuTargetMode = 'strongest' | 'killable' | 'weakest' | 'beatsFront';

/** 選べる狙い方（UI の並び順）。 */
export const CPU_TARGET_MODES: readonly CpuTargetMode[] = ['strongest', 'killable', 'weakest', 'beatsFront'];

/** 画面と逆引きの表示名（側を問わない短い名前＝ログ・旧形の表示）。 */
export const CPU_TARGET_MODE_LABELS: Readonly<Record<CpuTargetMode, string>> = {
  strongest: 'パワー・効果が強いもの',
  killable: 'パワーを下げて落とせるものを優先',
  weakest: '弱いもの',
  beatsFront: '効果後に正面を上回るもの',
};

/** 🆕2026-09-26 `S-36`＝狙い方を当てる側（相手の札／自分の札）。 */
export type CpuTargetSide = 'opp' | 'self';

/**
 * 🆕**側ごとに選べる狙い方**（`S-36`）＝🔴**効かない選択肢を出さない**。
 * `killable`（パワーを0以下にする）は**相手の札だけ**＝自分の札に当てる意味が無い。
 */
export const CPU_TARGET_MODES_BY_SIDE: Readonly<Record<CpuTargetSide, readonly CpuTargetMode[]>> = {
  opp: ['strongest', 'killable', 'weakest', 'beatsFront'],
  self: ['strongest', 'weakest', 'beatsFront'],
};

/** 🆕側ごとの表示名（`S-36`）＝「正面」がどちらのシグニかを名前に書く。 */
export const CPU_TARGET_MODE_LABELS_BY_SIDE: Readonly<Record<CpuTargetSide, Readonly<Record<CpuTargetMode, string>>>> = {
  opp: {
    strongest: 'パワー・効果が強いもの',
    killable: 'パワーを下げて落とせるもの',
    weakest: '弱いもの',
    beatsFront: '効果後、正面の自分のシグニが上回れるもの',
  },
  self: {
    strongest: 'パワー・効果が強いもの',
    killable: 'パワーを下げて落とせるもの',
    weakest: '弱いもの',
    beatsFront: '効果後、正面の相手シグニを上回るもの',
  },
};

/** 🆕**片側の狙い方**（`S-36`）＝並びの主キー＋「アップ状態を優先」。 */
export interface CpuSideTarget {
  mode: CpuTargetMode;
  /** 🆕**アップ状態のシグニを先に**（ダウン状態のものは後回し）＝狙い方より先に効く。 */
  upFirst?: boolean;
}

/** 🆕**解決済みの狙い方**（両側）＝`pickCpuTargets` が候補の持ち主で使い分ける。 */
export interface CpuTargetSpec {
  opp: CpuSideTarget;
  self: CpuSideTarget;
}

export const DEFAULT_CPU_TARGET_SPEC: CpuTargetSpec = { opp: { mode: 'strongest' }, self: { mode: 'strongest' } };

/**
 * 🆕**狙い方を切り替える条件**（§5.7 `S-32` ②・2026-09-21／🆕2026-09-26 ユーザー要望で作り直し）。
 * 🔴旧＝閉じた4択（`always`／`myLife2OrLess`／`oppLife2OrLess`／`oppField3`）を1つだけ。
 * 🆕新＝**「どちらの・どの置き場が・何枚 以下／以上／ちょうど」の条件を複数**持ち、**全部（AND）／どれか（OR）**で組む。
 * 🔑**式は構造で持つ**（自由な文字列の式にしない）＝画面・保存・判定の3か所で解釈がずれない。判定は `cpuTargetCondHolds` の1本。
 * ⚠**見るのは公開情報だけ**（枚数）＝相手の手札の中身は見ない（カンニング）。
 * ⚠旧形の `when` は `normalizeCpuDeckPlan` が条件へ読み替える（挙動不変）。
 */
export type CpuCondSide = 'me' | 'opp';
export type CpuCondZone = 'life' | 'hand' | 'energy' | 'trash' | 'field'
  // 🆕2026-09-26＝**場の特殊状態の数**（その側の場で数える）。
  | 'virus' | 'infected' | 'frozen' | 'charm' | 'acce' | 'rise';
export type CpuCondCmp = 'le' | 'ge' | 'eq';
export type CpuCondCombine = 'and' | 'or';

export interface CpuTargetCond {
  side: CpuCondSide;
  zone: CpuCondZone;
  cmp: CpuCondCmp;
  /** 0〜99 の整数。 */
  n: number;
}

export const CPU_COND_SIDES: readonly CpuCondSide[] = ['me', 'opp'];
export const CPU_COND_ZONES: readonly CpuCondZone[] = [
  'life', 'hand', 'energy', 'trash', 'field', 'virus', 'infected', 'frozen', 'charm', 'acce', 'rise',
];
export const CPU_COND_CMPS: readonly CpuCondCmp[] = ['le', 'ge', 'eq'];
export const CPU_COND_COMBINES: readonly CpuCondCombine[] = ['and', 'or'];

export const CPU_COND_SIDE_LABELS: Readonly<Record<CpuCondSide, string>> = { me: '自分', opp: '相手' };
export const CPU_COND_ZONE_LABELS: Readonly<Record<CpuCondZone, string>> = {
  life: 'ライフ', hand: '手札', energy: 'エナ', trash: 'トラッシュ', field: '場のシグニ',
  virus: '場のウィルス', infected: '場の感染状態のシグニ', frozen: '場の凍結状態のシグニ',
  charm: '場のチャーム付きシグニ', acce: '場のアクセ付きシグニ', rise: '場のライズ（下にカードがある）シグニ',
};
export const CPU_COND_CMP_LABELS: Readonly<Record<CpuCondCmp, string>> = { le: '以下', ge: '以上', eq: 'ちょうど' };
export const CPU_COND_COMBINE_LABELS: Readonly<Record<CpuCondCombine, string>> = {
  and: 'すべて満たす（AND）', or: 'どれか1つ満たす（OR）',
};

/** 条件1つの表示（例「自分のライフが2枚以下」）。 */
export function cpuTargetCondLabel(c: CpuTargetCond): string {
  const unit = c.zone === 'life' || c.zone === 'hand' || c.zone === 'energy' || c.zone === 'trash' || c.zone === 'virus' ? '枚' : '体';
  return `${CPU_COND_SIDE_LABELS[c.side]}の${CPU_COND_ZONE_LABELS[c.zone]}が${c.n}${unit}${c.cmp === 'eq' ? '' : CPU_COND_CMP_LABELS[c.cmp]}`;
}

/** 規則の条件の表示（空＝「いつでも」）。 */
export function cpuTargetCondsLabel(conds: readonly CpuTargetCond[], combine: CpuCondCombine = 'and'): string {
  if (conds.length === 0) return 'いつでも';
  return conds.map(cpuTargetCondLabel).join(combine === 'or' ? ' または ' : ' かつ ');
}

/**
 * 盤面でその置き場の枚数（場のシグニは埋まっているゾーンの数）。
 * 🆕**特殊状態はシグニゾーン3つを見て数える**（読み方は engine のフィルタと同じ＝`matchesFilter` の `infected`／`hasCharm`／`hasAcce`／`isFrozen`／`hasUnderCards`）：
 * - `virus`＝ウィルスのあるゾーン（シグニがいなくても数える＝ウィルスはゾーンに置かれる）。
 * - `infected`＝ウィルスのあるゾーンにいるシグニ（ルール上の感染状態）。
 * - `rise`＝下にカードがあるシグニ（ライズで重ねたもの。⚠効果で下に置いたカードも数える）。
 */
function condCount(st: PlayerState, zone: CpuCondZone): number {
  const f = st.field;
  const occupied = (z: number) => (f.signi[z]?.length ?? 0) > 0;
  const zones = (pred: (z: number) => boolean) => [0, 1, 2].filter(pred).length;
  switch (zone) {
    case 'virus': return zones(z => (f.signi_virus?.[z] ?? 0) > 0);
    case 'infected': return zones(z => occupied(z) && (f.signi_virus?.[z] ?? 0) > 0);
    case 'frozen': return zones(z => occupied(z) && !!f.signi_frozen?.[z]);
    case 'charm': return zones(z => occupied(z) && !!f.signi_charms?.[z]);
    case 'acce': return zones(z => occupied(z) && (f.signi_acce?.[z]?.length ?? 0) > 0);
    case 'rise': return zones(z => (f.signi[z]?.length ?? 0) >= 2);
    case 'life': return st.life_cloth?.length ?? 0;
    case 'hand': return st.hand?.length ?? 0;
    case 'energy': return st.energy?.length ?? 0;
    case 'trash': return st.trash?.length ?? 0;
    case 'field': return st.field.signi.filter(z => (z?.length ?? 0) > 0).length;
  }
}

/** 🆕**条件の判定（1本）**＝空なら常に真。 */
export function cpuTargetCondHolds(
  conds: readonly CpuTargetCond[], combine: CpuCondCombine | undefined, me: PlayerState, opp: PlayerState,
): boolean {
  if (conds.length === 0) return true;
  const one = (c: CpuTargetCond) => {
    const v = condCount(c.side === 'me' ? me : opp, c.zone);
    return c.cmp === 'le' ? v <= c.n : c.cmp === 'ge' ? v >= c.n : v === c.n;
  };
  return combine === 'or' ? conds.some(one) : conds.every(one);
}

/** 旧形の `when`（閉じた4択）→ 条件。知らない値は「いつでも」。 */
const LEGACY_WHEN: Readonly<Record<string, CpuTargetCond[]>> = {
  always: [],
  myLife2OrLess: [{ side: 'me', zone: 'life', cmp: 'le', n: 2 }],
  oppLife2OrLess: [{ side: 'opp', zone: 'life', cmp: 'le', n: 2 }],
  oppField3: [{ side: 'opp', zone: 'field', cmp: 'ge', n: 3 }],
};

/** DB の値から条件を作る（⚠知っている値だけ・枚数は 0〜99 の整数へ丸める）。 */
function toCond(raw: unknown): CpuTargetCond | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!CPU_COND_SIDES.includes(r.side as CpuCondSide) || !CPU_COND_ZONES.includes(r.zone as CpuCondZone)
    || !CPU_COND_CMPS.includes(r.cmp as CpuCondCmp)) return null;
  const n = Number(r.n);
  if (!Number.isFinite(n)) return null;
  return { side: r.side as CpuCondSide, zone: r.zone as CpuCondZone, cmp: r.cmp as CpuCondCmp, n: Math.max(0, Math.min(99, Math.round(n))) };
}

/**
 * 🆕**狙い方の切り替え規則**（§5.7 `S-32` ②③）＝**上から順に、最初に当たった1つ**が狙い方を決める。
 * - `sourceCards` が空＝**どの効果でも**／指定あり＝**その札の効果のときだけ**（③ 効果ごとの指示）。
 * - `conds` が空でない＝**盤面の条件つき**（② 条件つき・🆕2026-09-26＝複数の条件を AND／OR で組める）。
 * - 🆕2026-09-26 `S-36`＝**相手の札・自分の札で別の狙い方**（`opp`／`self`）。片側だけ書いた規則は、
 *   **もう片側では当たらない扱い**＝下の規則へ落ちる（側ごとに独立に上から探す）。
 * 🆕2026-09-25＝**「どの効果でも・いつでも」も書ける**（削った「既定」の select の置き換え）＝正規化で**末尾へ回す**
 *   （上にあると下の規則が1つも当たらなくなる）。⚠**どれにも当たらなければ `strongest`**。
 */
export interface CpuTargetRule {
  sourceCards: string[];
  /**
   * 🆕**効果単位の指定**（2026-09-25 ユーザー要望「複数の効果を持つ札は効果ごとに区別する」・ライフバーストの狙い先）。
   * 空＝`sourceCards` の札の**どの効果でも**／指定あり＝**その効果のときだけ**（`-E2` / `-BURST` …）。
   */
  sourceEffectIds?: string[];
  /** 🆕2026-09-26＝盤面の条件（空＝いつでも）。 */
  conds: CpuTargetCond[];
  /** 🆕条件の組み方（未指定＝`and`）。⚠`or` のときだけ保存する。 */
  combine?: CpuCondCombine;
  /** 🆕相手の札を選ぶときの狙い方（未指定＝この規則は相手の札には当たらない）。 */
  opp?: CpuSideTarget;
  /** 🆕自分の札を選ぶときの狙い方（未指定＝この規則は自分の札には当たらない）。 */
  self?: CpuSideTarget;
}

/**
 * 🆕§5.7 `S-32`＝対象の狙い方（デッキごと）。
 * 🔴**2026-09-25 に3つ削った**（ユーザー判断「ほぼ意味をなしていない」）：
 *   ①**既定の狙い方**（`mode`）＝規則「どの効果でも・いつでも」と同じ意味の二重の入口
 *   ②**属性で狙う／避ける**（クラス・レベル・パワー帯）＝相手の山は分からず、効果ごとの規則で書くほうが正確
 *   ③**相手の札の名指し**＝相手の山は分からない（数千枚から1枚を当てにいく指定は当たらない）
 *   ⚠保存済みの①は `normalizeCpuDeckPlan` が**末尾の規則へ移す**（挙動を変えない）。②③は読み捨てる。
 */
export interface CpuTargetPlan {
  /** 固有のカード指定＝**優先して狙う**札（自分のデッキの札）。 */
  prefer: string[];
  /** 固有のカード指定＝**狙わない**札（自分の札を守る）。 */
  avoid: string[];
  /** 🆕§5.7 `S-32` ②③＝狙い方の切り替え規則（上から順・最初に当たった1つ）。 */
  rules?: CpuTargetRule[];
}

export const EMPTY_CPU_TARGET_PLAN: CpuTargetPlan = { prefer: [], avoid: [], rules: [] };

/**
 * 🆕**札の使いどころ**（§5.7 `S-31` ③・2026-09-21 ユーザー要望）。
 *
 * 🔴**なぜ要るか（実測）**＝CPU がアーツを使えるのは **`defensiveKindOf` が「守り」と分類できた札だけ**
 *   （無効化／除去／軽減の3分類）。ユーザー作21デッキのアーツ **76種のうち CPU が使うのは 24（31.6%）**で、
 *   **8デッキは1枚も使えない**。残り52種は「分類できない」＝ドロー・サーチ・強化・展開・手札破壊など
 *   **盤面評価が要るので v1 が意図的に見送った**もの。⇒ **機械が決められない分類を、作り手が書く。**
 *
 * - `defense`＝**守りで使う**（相手のアタックステップ＝応答窓）
 * - `offense`＝**攻めで使う**（自分のターン）
 * - `both`＝どちらでも
 * - `never`＝**使わない**（温存する／CPU が撃つと噛み合わない札）
 *
 * ⚠**`defense`/`offense` はアーツだけに効く**（窓が2つあるのはアーツだけ）。
 *   スペル・【起】・ピースに効くのは **`never` だけ**＝「この札は撃たない」。
 * ⚠**`never` は「使う」手だけを止める**（アーツ・スペル・【起】・ピース）＝**召喚（出す）は止めない**
 *   （出したくない札はデッキから抜けばよい＝盤面に出す手まで止めると「手札に抱えて手札上限で捨てる」だけになる）。
 */
export type CpuCardUse = 'defense' | 'offense' | 'both' | 'never';

/** 画面の選択肢の並び（`'auto'` は「既定」＝この表に**入れない**＝指定が無い状態）。 */
export const CPU_CARD_USES: readonly CpuCardUse[] = ['defense', 'offense', 'both', 'never'];

export const CPU_CARD_USE_LABELS: Readonly<Record<CpuCardUse, string>> = {
  defense: '守りで使う', offense: '攻めで使う', both: '守りでも攻めでも使う', never: '使わない',
};

/**
 * 🆕**エナゾーンにある札の扱い**（2026-09-26 ユーザー要望）＝CPU がエナでコストを払うとき、その札を**どの順で使うか**。
 * - `spend`＝**積極的にコストとして使う**（ほかのエナより先に払う）。
 * - `keep`＝**できるだけエナに温存する**（ほかのエナで払えるならそちらを使う）。🔴**使わないわけではない**＝
 *   それを払わないとコストが足りないときは払う（「払えない」にはしない）。
 * 🔑**読むのは `planEnaPayRank` の1本**＝支払いの選び手（`selectEnergyIndicesForCost`／召喚コスト／エナを落とすコスト／
 *   効果の任意コスト）はこの順位で並べるだけ。可否は変えない。
 * ⚠**メインデッキの札だけ**（エナに行くのはシグニとスペル）。
 */
export type CpuEnaUse = 'spend' | 'keep';

export const CPU_ENA_USES: readonly CpuEnaUse[] = ['spend', 'keep'];

export const CPU_ENA_USE_LABELS: Readonly<Record<CpuEnaUse, string>> = {
  spend: '積極的にコストとして使う', keep: 'できるだけエナに温存する（必要なら使う）',
};

export interface CpuDeckPlan {
  keyCards: string[];
  priorityCards: string[];
  combos: CpuDeckCombo[];
  /** 🆕§5.7 `S-32`＝効果の対象の狙い方。 */
  targeting: CpuTargetPlan;
  /** 🆕§5.7 `S-31` ③＝札ごとの使いどころ（カード番号 → 使いどころ。**指定が無い札は既定＝従来どおり**）。 */
  cardUse: Record<string, CpuCardUse>;
  /** 🆕2026-09-26＝エナゾーンにある札の扱い（カード番号 → 扱い。**指定が無い札は既定＝従来どおり**）。 */
  enaUse?: Record<string, CpuEnaUse>;
}

export const EMPTY_CPU_DECK_PLAN: CpuDeckPlan = {
  keyCards: [], priorityCards: [], combos: [], targeting: EMPTY_CPU_TARGET_PLAN, cardUse: {}, enaUse: {},
};

/**
 * 足し引きする点数（パワー換算）。`S-6` の自己対戦で調整する対象。
 * 🔴**実体は `cpuPolicy.DEFAULT_CPU_POLICY.planWeights`**（§5.7 `S-6` 第2段）＝**値をここに書かない**。
 */
export const PLAN_WEIGHTS: PlanWeights = DEFAULT_CPU_POLICY.planWeights;

/**
 * DB の1件をコンボへ（🆕新形 `{steps}` ／🔴旧形 `{first, then}` の両対応）。
 * ⚠**同じ手の重複と空の番号は落とす**（UI から壊れた値が来ても効かないだけにする）。
 */
function toCombo(c: Record<string, unknown>): CpuDeckCombo | null {
  if (Array.isArray(c.steps)) {
    const seen = new Set<string>();
    const steps: CpuComboStep[] = [];
    for (const raw of c.steps) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const num = String(r.num ?? '');
      const use = CPU_COMBO_USES.includes(r.use as CpuComboUse) ? (r.use as CpuComboUse) : 'deploy';
      const effectId = typeof r.effectId === 'string' && r.effectId ? r.effectId : undefined;
      const key = `${num}/${use}/${effectId ?? ''}`;
      if (!num || seen.has(key)) continue;
      seen.add(key);
      const pick = toEffectPick(r.pick);
      steps.push({ num, use, ...(effectId ? { effectId } : {}), ...(pick ? { pick } : {}) });
    }
    return steps.length > 0 ? { steps } : null;
  }
  // 🔴旧形＝「A を出す → B を出す」。
  const first = String(c.first ?? ''), then = String(c.then ?? '');
  if (!first || !then || first === then) return null;
  return { steps: [{ num: first, use: 'deploy' }, { num: then, use: 'deploy' }] };
}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))] : [];

/** DB の値から「選び方」を作る（⚠知っている値だけ＝空なら `undefined`）。 */
function toEffectPick(raw: unknown): CpuEffectPick | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  // ⚠旧形 `{ mode }`（2026-09-25）＝**両側へ同じ狙い方**（旧の意味＝得になる側の並び）。
  const legacy = toSideTarget(r.mode !== undefined ? { mode: r.mode } : undefined);
  const opp = toSideTarget(r.opp, 'opp') ?? legacy;
  const self = toSideTarget(r.self, 'self') ?? (legacy && CPU_TARGET_MODES_BY_SIDE.self.includes(legacy.mode) ? legacy : undefined);
  const cards = strList(r.cards);
  if (!opp && !self && cards.length === 0) return undefined;
  return { ...(opp ? { opp } : {}), ...(self ? { self } : {}), ...(cards.length ? { cards } : {}) };
}

/**
 * DB の値から片側の狙い方を作る（⚠知っている値だけ）。
 * `side` を渡すと**その側で選べない狙い方は落とす**（自分の札の `killable` など＝効かない指定を残さない）。
 */
function toSideTarget(raw: unknown, side?: CpuTargetSide): CpuSideTarget | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const allowed = side ? CPU_TARGET_MODES_BY_SIDE[side] : CPU_TARGET_MODES;
  if (!allowed.includes(r.mode as CpuTargetMode)) return undefined;
  return { mode: r.mode as CpuTargetMode, ...(r.upFirst === true ? { upFirst: true } : {}) };
}

/**
 * 規則の並びを整える＝**何も絞らない規則（どの効果でも・いつでも）は末尾へ1つだけ**
 * （上にあると下の規則が1つも当たらなくなる）。
 */
function orderRules(rules: readonly CpuTargetRule[]): CpuTargetRule[] {
  const catchAll = (r: CpuTargetRule) => r.sourceCards.length === 0 && r.conds.length === 0;
  const last = [...rules].reverse().find(catchAll);
  return [...rules.filter(r => !catchAll(r)), ...(last ? [last] : [])];
}

/** DB の値（形が崩れていても）を作戦データへ。 */
export function normalizeCpuDeckPlan(raw: unknown): CpuDeckPlan {
  if (!raw || typeof raw !== 'object') return EMPTY_CPU_DECK_PLAN;
  const r = raw as Record<string, unknown>;
  const combos = Array.isArray(r.combos)
    ? r.combos
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map(toCombo)
      .filter((c): c is CpuDeckCombo => !!c)
    : [];
  // 🆕§5.7 `S-32`＝対象の狙い方（⚠**無い／壊れていれば既定**＝保存済みの作戦を壊さない）。
  const t = (r.targeting && typeof r.targeting === 'object' ? r.targeting : {}) as Record<string, unknown>;
  const rules: CpuTargetRule[] = Array.isArray(t.rules)
    ? t.rules
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x): CpuTargetRule | null => {
        const eids = strList(x.sourceEffectIds);
        // ⚠旧形 `{ mode }`（〜2026-09-25）＝**両側へ同じ狙い方**（旧の意味＝得になる側の並び）。
        const legacy = CPU_TARGET_MODES.includes(x.mode as CpuTargetMode) ? { mode: x.mode as CpuTargetMode } : undefined;
        const opp = toSideTarget(x.opp, 'opp') ?? legacy;
        const self = toSideTarget(x.self, 'self')
          ?? (legacy && CPU_TARGET_MODES_BY_SIDE.self.includes(legacy.mode) ? legacy : undefined);
        // ⚠**どちらの側にも狙い方が無い規則は落とす**（何も変えない規則は、上にあると下の規則を隠すだけ）。
        if (!opp && !self) return null;
        // 🆕2026-09-26＝条件の列。⚠旧形 `when` は条件へ読み替える（挙動不変）。
        const conds = Array.isArray(x.conds)
          ? x.conds.map(toCond).filter((c): c is CpuTargetCond => !!c)
          : [...(LEGACY_WHEN[String(x.when ?? 'always')] ?? [])];
        const combine: CpuCondCombine = x.combine === 'or' && conds.length >= 2 ? 'or' : 'and';
        return {
          sourceCards: strList(x.sourceCards),
          ...(eids.length ? { sourceEffectIds: eids } : {}),
          conds, ...(combine === 'or' ? { combine } : {}),
          ...(opp ? { opp } : {}), ...(self ? { self } : {}),
        };
      })
      .filter((x): x is CpuTargetRule => !!x)
    : [];
  // 🔴**旧「既定の狙い方」は末尾の規則へ移す**（2026-09-25 に select を削った＝保存済みの挙動を変えない）。
  const legacyMode = CPU_TARGET_MODES.includes(t.mode as CpuTargetMode) ? (t.mode as CpuTargetMode) : 'strongest';
  if (legacyMode !== 'strongest') {
    rules.push({
      sourceCards: [], conds: [], opp: { mode: legacyMode },
      ...(CPU_TARGET_MODES_BY_SIDE.self.includes(legacyMode) ? { self: { mode: legacyMode } } : {}),
    });
  }
  const targeting: CpuTargetPlan = { prefer: strList(t.prefer), avoid: strList(t.avoid), rules: orderRules(rules) };
  return {
    keyCards: strList(r.keyCards), priorityCards: strList(r.priorityCards), combos, targeting,
    cardUse: toCardUseMap(r.cardUse),
    enaUse: toEnaUseMap(r.enaUse),
  };
}

/** DB の1件を「エナゾーンにある札の扱い」へ（⚠**知らない値は落とす**＝既定に戻る）。 */
function toEnaUseMap(raw: unknown): Record<string, CpuEnaUse> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, CpuEnaUse> = {};
  for (const [num, v] of Object.entries(raw as Record<string, unknown>)) {
    if (num && CPU_ENA_USES.includes(v as CpuEnaUse)) out[num] = v as CpuEnaUse;
  }
  return out;
}

/** DB の1件を「札ごとの使いどころ」へ（⚠**知らない値は落とす**＝既定に戻る）。 */
function toCardUseMap(raw: unknown): Record<string, CpuCardUse> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, CpuCardUse> = {};
  for (const [num, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!num) continue;
    if (CPU_CARD_USES.includes(v as CpuCardUse)) out[num] = v as CpuCardUse;
  }
  return out;
}

/** 手の「選び方」の札をデッキ内に絞る（空になったら `pick` ごと外す）。 */
function pruneStepPick(st: CpuComboStep, inDeck: ReadonlySet<string>): CpuComboStep {
  if (!st.pick) return st;
  const cards = (st.pick.cards ?? []).filter(n => inDeck.has(n));
  const pick: CpuEffectPick = {
    ...(st.pick.opp ? { opp: st.pick.opp } : {}), ...(st.pick.self ? { self: st.pick.self } : {}),
    ...(cards.length ? { cards } : {}),
  };
  const { pick: _drop, ...rest } = st;
  return Object.keys(pick).length > 0 ? { ...rest, pick } : rest;
}

/** デッキに無いカードを作戦から外す（編集で抜いたカードが残らないように）。 */
export function pruneCpuDeckPlan(plan: CpuDeckPlan, deckCardNums: readonly string[]): CpuDeckPlan {
  const inDeck = new Set(deckCardNums.map(getCardNum));
  const t = plan.targeting ?? EMPTY_CPU_TARGET_PLAN;
  return {
    keyCards: plan.keyCards.filter(n => inDeck.has(n)),
    priorityCards: plan.priorityCards.filter(n => inDeck.has(n)),
    combos: plan.combos
      .filter(c => c.steps.every(st => inDeck.has(st.num)))
      .map(c => ({ steps: c.steps.map(st => pruneStepPick(st, inDeck)) })),
    // 🆕2026-09-25＝**相手の札の名指しを削った**＝狙う／避けるも自分のデッキの札だけ（デッキ外は落とす）。
    //   規則の `sourceCards` も自分の札（効果を出す側）＝デッキから抜けたら規則ごと落とす（効果の指定だけ残すと
    //   「どの効果でも」に化けて意味が変わる）。
    targeting: {
      prefer: t.prefer.filter(n => inDeck.has(n)),
      avoid: t.avoid.filter(n => inDeck.has(n)),
      rules: orderRules((t.rules ?? []).filter(r => r.sourceCards.every(n => inDeck.has(n)))),
    },
    // 🆕§5.7 `S-31` ③＝**使いどころは自分の札にしか書けない**（`keyCards` と同じ側）＝デッキから抜けたら落とす。
    cardUse: Object.fromEntries(Object.entries(plan.cardUse ?? {}).filter(([n]) => inDeck.has(n))),
    enaUse: Object.fromEntries(Object.entries(plan.enaUse ?? {}).filter(([n]) => inDeck.has(n))),
  };
}

export const isEmptyCpuDeckPlan = (plan: CpuDeckPlan): boolean =>
  plan.keyCards.length === 0 && plan.priorityCards.length === 0 && plan.combos.length === 0
  && (plan.targeting?.prefer.length ?? 0) === 0 && (plan.targeting?.avoid.length ?? 0) === 0
  && (plan.targeting?.rules?.length ?? 0) === 0
  && Object.keys(plan.cardUse ?? {}).length === 0
  && Object.keys(plan.enaUse ?? {}).length === 0;

/** 狙い方を解決する文脈。 */
export interface CpuTargetResolveCtx {
  /** 効果を出した札（`PendingEffect.sourceCardNum`）。 */
  sourceCardNum?: string;
  /** 🆕その効果の `effectId`（`PendingEffect.effectId`）＝効果単位の規則・コンボの選び方に使う。 */
  effectId?: string;
  me: PlayerState;
  opp: PlayerState;
}

/**
 * 🆕**いまの狙い方（両側）**（§5.7 `S-32` ②③／🆕2026-09-26 `S-36`＝相手の札・自分の札を別々に）。
 * **側ごとに独立に**＝①コンボの手の選び方 → ②規則を上から見て**その側を書いた最初の1つ** → ③`strongest`。
 * 🔑**ここで解決する**（`pickCpuTargets` は解決済みの狙い方を受け取るだけ）＝
 *   対象選択の関数に盤面の条件判定を持ち込まない（`S-22` の形を壊さない）。
 * ⚠**見るのは公開情報だけ**＝ライフの枚数と場のシグニの数（相手の手札は見ない）。
 */
export function resolveCpuTargetSpec(plan: CpuDeckPlan, ctx: CpuTargetResolveCtx): CpuTargetSpec {
  const pick = planEffectPick(plan, ctx.sourceCardNum, ctx.effectId);
  return {
    opp: pick?.opp ?? resolveRuleSide(plan, ctx, 'opp') ?? DEFAULT_CPU_TARGET_SPEC.opp,
    self: pick?.self ?? resolveRuleSide(plan, ctx, 'self') ?? DEFAULT_CPU_TARGET_SPEC.self,
  };
}

/**
 * 旧 API（相手の札の狙い方だけ）。⚠**golden の較正用**＝画面・CPU は `resolveCpuTargetSpec` を使う
 * （旧形の規則は両側へ同じ狙い方として読むので、旧の意味では相手側と同じ）。
 */
export function resolveCpuTargetMode(plan: CpuDeckPlan, ctx: CpuTargetResolveCtx): CpuTargetMode {
  return resolveCpuTargetSpec(plan, ctx).opp.mode;
}

/** 規則を上から見て、**その側を書いた**最初に当たった1つ（無ければ `undefined`）。 */
function resolveRuleSide(plan: CpuDeckPlan, ctx: CpuTargetResolveCtx, side: CpuTargetSide): CpuSideTarget | undefined {
  const t = plan.targeting;
  if (!t) return undefined;
  const src = ctx.sourceCardNum ? getCardNum(ctx.sourceCardNum) : undefined;
  for (const r of t.rules ?? []) {
    const target = r[side];
    if (!target) continue;
    if (r.sourceCards.length > 0 && (!src || !r.sourceCards.includes(src))) continue;
    if ((r.sourceEffectIds?.length ?? 0) > 0 && (!ctx.effectId || !r.sourceEffectIds!.includes(ctx.effectId))) continue;
    if (!cpuTargetCondHolds(r.conds, r.combine, ctx.me, ctx.opp)) continue;
    return target;
  }
  return undefined;
}

/**
 * 🆕**その効果に当たるコンボの手の「選び方」**（2026-09-25）＝札が一致し、手が効果を名指ししていれば**その効果のときだけ**。
 * ⚠**最初に当たった手**（同じ札・同じ効果を2つのコンボに書いた場合は上のコンボが勝つ）。
 */
export function planEffectPick(
  plan: CpuDeckPlan | undefined, sourceCardNum: string | undefined, effectId: string | undefined,
): CpuEffectPick | undefined {
  if (!plan || !sourceCardNum) return undefined;
  const num = getCardNum(sourceCardNum);
  for (const c of plan.combos) {
    for (const st of c.steps) {
      if (!st.pick || st.num !== num) continue;
      if (st.effectId && st.effectId !== effectId) continue;
      return st.pick;
    }
  }
  return undefined;
}

/**
 * 🆕**固有のカード指定の加点**（§5.7 `S-32`）＝効果が対象・カードを選ぶときに使う。
 * 🆕2026-09-25＝狙う／避けるは**自分のデッキの札だけ**（相手の札の名指しは削った）。
 */
export function planTargetBonus(
  plan: CpuDeckPlan, id: string, policy?: CpuPolicy,
  /** 🆕2026-09-25＝いま解決中の効果に当たるコンボの手の「選び方」（`planEffectPick`）＝その札を優先して選ぶ。 */
  pick?: CpuEffectPick,
): number {
  const num = getCardNum(id);
  const W = policy?.planWeights ?? PLAN_WEIGHTS;
  const t = plan.targeting;
  let bonus = t ? (t.prefer.includes(num) ? W.targetPrefer : 0) + (t.avoid.includes(num) ? W.targetAvoid : 0) : 0;
  if (pick?.cards?.includes(num)) bonus += W.targetPrefer;
  return bonus;
}

/** 手元に残す価値の加点（エナチャージ・手札上限の捨て札・サーチで使う）。 */
/**
 * 🆕**その札の使いどころ**（§5.7 `S-31` ③）。指定が無ければ `undefined`＝**既定＝従来の挙動**。
 * 🔑**読むのはここ1本**＝アーツ・スペル・【起】・ピースの選び手は全部この関数を通す
 *   （`cardUse` を直接引くと「指定はしたのに効かない窓」が出る）。
 */
export function planCardUse(plan: CpuDeckPlan | undefined, cardNum: string): CpuCardUse | undefined {
  return plan?.cardUse?.[getCardNum(cardNum)];
}

/** 🆕**この札を CPU が「使う」ことを作戦データが禁じているか**（＝`never`）。 */
export function planForbidsUse(plan: CpuDeckPlan | undefined, cardNum: string): boolean {
  return planCardUse(plan, cardNum) === 'never';
}

/**
 * 🆕**その窓でこのアーツを「使え」と作戦データが指名しているか**（§5.7 `S-31` ③）。
 *
 * 🔑**指名された札は `defensiveKindOf` の分類を通らなくてよい**＝これが③の本体
 *   （分類できない52種＝ドロー・サーチ・強化・展開を、作り手の指定で使えるようにする）。
 * ⚠`never` はここで false＝**指名の反対**（`planForbidsUse` が先に候補から外す）。
 */
export function planArtsMarkedFor(
  plan: CpuDeckPlan | undefined, cardNum: string, window: 'defense' | 'offense',
): boolean {
  const use = planCardUse(plan, cardNum);
  return use === 'both' || use === window;
}

/**
 * 🆕2026-09-26＝**エナで払う順位**（小さいほど先に払う）＝`spend` -1／指定なし 0／`keep` +1。
 * ⚠instance ID（`#…`）でもカード番号でもよい。
 */
export function planEnaPayRank(plan: CpuDeckPlan | undefined, id: string): number {
  const u = plan?.enaUse?.[getCardNum(id)];
  return u === 'spend' ? -1 : u === 'keep' ? 1 : 0;
}

/** 作戦データにエナの扱いの指定が1つでもあるか（無ければ支払いの並びを1ビットも変えない）。 */
export const planHasEnaUse = (plan: CpuDeckPlan | undefined): boolean => Object.keys(plan?.enaUse ?? {}).length > 0;

export function planKeepBonus(plan: CpuDeckPlan, id: string, policy?: CpuPolicy): number {
  const num = getCardNum(id);
  const W = policy?.planWeights ?? PLAN_WEIGHTS;
  let bonus = 0;
  if (plan.keyCards.includes(num)) bonus += W.keyKeep;
  if (plan.combos.some(c => c.steps.some(st => st.num === num))) bonus += W.comboKeep;
  return bonus;
}

/** マリガンで戻さない札（キーカードとコンボのパーツ）。 */
export function planKeepsInMulligan(plan: CpuDeckPlan, id: string): boolean {
  const num = getCardNum(id);
  return plan.keyCards.includes(num) || plan.combos.some(c => c.steps.some(st => st.num === num));
}

/**
 * 🆕**加点を測るための盤面**（§5.7 `S-14`）＝「その手がもう済んだか」「その札がまだ手元にあるか」を見るのに要る。
 * ⚠**instance ID（`#…`）でもカード番号でもよい**（`getCardNum` で剥がす）。
 */
export interface CpuPlanBoardCtx {
  /** いまの手札。 */
  hand: readonly string[];
  /** いまの自分の場（シグニのトップ・ルリグ）。 */
  field: readonly string[];
  /**
   * 🆕**コンボがまだ動かせるか**の判定に使う置き場（手札・場・トラッシュ・エナ）。省略時は手札＋場。
   * 🔑**トラッシュを含めないとトラッシュ【起】のコンボが動かない**（`WD08` のネビュラ）。
   */
  available?: readonly string[];
  /** 🆕このターンに CPU が使った【起】の `effectId`（`cpu_activated_effect_ids_this_turn`）。 */
  activatedEffectIds?: readonly string[];
  /**
   * 🆕カード番号 → その札の効果の `effectId` 一覧。
   * 🔴**`effectId` からカード番号を正規表現で削り出さない**＝接尾辞は `-E1` だけでなく `-BURST` / `-TRAP` /
   *   `-RIDE` / `-DECORE` … と開いた集合で、**実測で 95件が外れた**（2026-09-21）。**引くのは効果表から。**
   */
  effectIdsOf?: (num: string) => readonly string[];
  /** 🆕使用済みのアーツ（ルリグトラッシュ）。 */
  lrigTrash?: readonly string[];
  /** 🆕使用済みのスペル（トラッシュ）。 */
  trash?: readonly string[];
}

/**
 * 🆕**その札をその使い方で「いま」使うことへの加点**（§5.7 `S-14`・2026-09-21）。
 *
 * - **優先して出す札**＝`deploy` のときだけ `priorityDeploy`。
 * - **コンボ**＝その手がコンボの何手目かで決まる：
 *   - **前の手が全部済んでいる** → 1手目なら `comboFirst`（⚠**後ろの手の札が手元にあるときだけ**）／2手目以降は `comboThenReady`。
 *   - **前の手が済んでいない** → `comboThenHold`（負＝温存する。⚠**その前の札が手元にあるときだけ**）。
 *   - **もう済んだ手**は加点しない。
 * 🔑**「済んだ」の判定は使い方ごと**＝`deploy`＝場にいる／`activate`＝このターンその札の【起】を使った／
 *   `arts`＝ルリグトラッシュにある／`spell`＝トラッシュにある。
 *   ⚠**`arts`／`spell` は「このターン使った」ではなく「使用済みの置き場にある」の近似**（ターンを跨いでも済み扱い）。
 */
export function planUseBonus(
  plan: CpuDeckPlan, cardNum: string, use: CpuComboUse, ctx: CpuPlanBoardCtx, policy?: CpuPolicy,
  /** 🆕2026-09-25＝その手の効果（`activate` のときだけ意味がある＝どの【起】か）。 */
  effectId?: string,
): number {
  const num = getCardNum(cardNum);
  const W = policy?.planWeights ?? PLAN_WEIGHTS;
  const nums = (xs: readonly string[] | undefined) => new Set((xs ?? []).map(getCardNum));
  const onField = nums(ctx.field);
  const avail = ctx.available ? nums(ctx.available) : new Set([...nums(ctx.hand), ...onField]);
  const lrigTrash = nums(ctx.lrigTrash), trash = nums(ctx.trash);
  const activated = new Set(ctx.activatedEffectIds ?? []);
  const done = (st: CpuComboStep): boolean => {
    switch (st.use) {
      case 'deploy': return onField.has(st.num);
      case 'activate': return st.effectId
        ? activated.has(st.effectId)
        : (ctx.effectIdsOf?.(st.num) ?? []).some(eid => activated.has(eid));
      case 'arts': return lrigTrash.has(st.num);
      case 'spell': return trash.has(st.num);
    }
  };
  let bonus = use === 'deploy' && plan.priorityCards.includes(num) ? W.priorityDeploy : 0;
  for (const c of plan.combos) {
    // 🆕**効果を名指しした【起】の手は、その効果の手でだけ当たる**（同じ札の別の【起】に加点しない）。
    const i = c.steps.findIndex(st => st.num === num && st.use === use
      && !(use === 'activate' && st.effectId && effectId && st.effectId !== effectId));
    if (i < 0 || done(c.steps[i])) continue;
    const prior = c.steps.slice(0, i);
    if (!prior.every(done)) {
      // まだ前の手が残っている＝温存する（⚠その前の札が手元にあるときだけ＝引けていないなら待たない）。
      if (prior.some(st => !done(st) && avail.has(st.num))) bonus += W.comboThenHold;
      continue;
    }
    if (i > 0) { bonus += W.comboThenReady; continue; }
    const later = c.steps.slice(1);
    if (later.length === 0 || later.some(st => avail.has(st.num))) bonus += W.comboFirst;
  }
  return bonus;
}

/**
 * 🆕**盤面から加点用の文脈を作る**（§5.7 `S-14`）＝呼び出し側で組み立て方を写経しない。
 * 🔑**`available` にトラッシュとエナを入れる**＝トラッシュ【起】・エナから出す札のコンボが「動かせる」と判定できる。
 * @param effectIdsOf カード番号 → `effectId` 一覧（`activate` の「済んだ」判定に要る。省略すると `activate` は常に未了）
 */
export function cpuPlanBoardCtx(
  st: PlayerState, effectIdsOf?: (num: string) => readonly string[],
): CpuPlanBoardCtx {
  const field = [...st.field.signi.map(stk => stk?.at(-1) ?? ''), ...st.field.lrig].filter(Boolean);
  return {
    hand: st.hand,
    field,
    available: [...st.hand, ...field, ...st.trash, ...st.energy],
    activatedEffectIds: st.cpu_activated_effect_ids_this_turn,
    effectIdsOf,
    lrigTrash: st.lrig_trash,
    trash: st.trash,
  };
}

/**
 * 場に出す（召喚する）ときの加点＝`planUseBonus` の `deploy` の口（**式は1本**）。
 * @param handIds いまの手札（instance ID）／@param fieldIds いまの自分の場（シグニのトップ・ルリグ）
 */
export function planDeployBonus(
  plan: CpuDeckPlan, id: string, handIds: readonly string[], fieldIds: readonly string[], policy?: CpuPolicy,
): number {
  return planUseBonus(plan, id, 'deploy', { hand: handIds, field: fieldIds }, policy);
}
