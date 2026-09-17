import type { CardData } from '../types';
import { sharesLrigType } from './deckBuildLimits';

/**
 * 🆕**デッキ編成で決める「最初に場に出すルリグ」**（2026-09-17 ユーザー決定）。
 *
 * 🔑**なぜデッキ側に持つか**＝以前は対戦開始時（`LRIG_SELECT`）にセンター→アシスト左→右を毎回選んでいた。
 *   ⇒ **デッキ編成でセンター／アシスト左／アシスト右を指定**し、対戦開始時は選択画面を出さずにその通り置く。
 * 🔴**`R-47`（センターと同じルリグタイプのアシストは入れられない）はここでしか正しく判定できない**＝
 *   Lv0 のルリグは**アシストの系統も種別が「ルリグ」**（ウムル＝ノル／タウィル＝ノル …＝アシスト系タイプを持つ Lv0 が189枚）。
 *   「どの Lv0 がセンターか」を持たないと、ルリグデッキの「ルリグ」全部をセンター候補と見るしかなく、
 *   **普通の3ルリグデッキのアシスト（ウムル＝ドロー等）が入れられなかった**（第399バッチの実害）。
 *
 * ⚠**ルリグデッキの同名は1枚まで**（`LRIG_COPY_MAX`）なので、指定はカード番号で一意に決まる。
 * ⚠**アシストは0枚か2枚**（「センターのみ」も許す＝ユーザー決定）。左右は別々に指定する。
 */
export interface DeckLrigRoles {
  centerLrig?: string | null;
  assistLrigL?: string | null;
  assistLrigR?: string | null;
}

export type LrigRole = 'center' | 'assist_l' | 'assist_r';

const ROLE_KEY: Record<LrigRole, keyof DeckLrigRoles> = {
  center: 'centerLrig', assist_l: 'assistLrigL', assist_r: 'assistLrigR',
};

export const LRIG_ROLE_JA: Record<LrigRole, string> = {
  center: 'センター', assist_l: 'アシスト左', assist_r: 'アシスト右',
};

/** 最初に場に出せるルリグ＝レベル0の「ルリグ」（アシストの系統の Lv0 も種別は「ルリグ」）。 */
export const isStartingLrig = (card: CardData | undefined): boolean =>
  !!card && card.Type === 'ルリグ' && card.Level === '0';

/** このカードに割り当てられている役（無ければ null）。 */
export function lrigRoleOf(roles: DeckLrigRoles, cardNum: string): LrigRole | null {
  for (const role of Object.keys(ROLE_KEY) as LrigRole[]) {
    if (roles[ROLE_KEY[role]] === cardNum) return role;
  }
  return null;
}

/**
 * 役を割り当てる（`role=null` で外す）。**同じカードは1つの役にしか就かない**＝他の役に就いていたら外す。
 * 役に就いていたカードは押し出される（未設定に戻る）。
 */
export function assignLrigRole<T extends DeckLrigRoles>(deck: T, cardNum: string, role: LrigRole | null): T {
  const next: T = { ...deck };
  for (const r of Object.keys(ROLE_KEY) as LrigRole[]) {
    if (next[ROLE_KEY[r]] === cardNum) next[ROLE_KEY[r]] = null;
  }
  if (role) next[ROLE_KEY[role]] = cardNum;
  return next;
}

/** ルリグデッキから抜けたカードの役を外す（カードを抜いたときに必ず通す）。 */
export function pruneLrigRoles<T extends DeckLrigRoles & { lrigDeck: string[] }>(deck: T): T {
  const next: T = { ...deck };
  for (const r of Object.keys(ROLE_KEY) as LrigRole[]) {
    const num = next[ROLE_KEY[r]];
    if (num && !deck.lrigDeck.includes(num)) next[ROLE_KEY[r]] = null;
  }
  return next;
}

/**
 * センターとルリグタイプが重なる「アシスト側」の札があるか（`R-47`）。
 * アシスト側＝ルリグデッキの**アシストルリグ全部**＋**アシストに指定した Lv0**。センター未指定なら判定しない。
 */
export function lrigTypeClashWithCenter(
  deck: DeckLrigRoles & { lrigDeck: string[] },
  cardMap: Map<string, CardData>,
): boolean {
  const center = deck.centerLrig ? cardMap.get(deck.centerLrig) : undefined;
  if (!center) return false;
  const assistSide = [
    ...deck.lrigDeck.map(n => cardMap.get(n)).filter((c): c is CardData => c?.Type === 'アシストルリグ'),
    ...[deck.assistLrigL, deck.assistLrigR].map(n => (n ? cardMap.get(n) : undefined)).filter((c): c is CardData => !!c),
  ];
  return assistSide.some(c => sharesLrigType(c, center));
}

export type LrigRoleBlockReason = 'NOT_IN_DECK' | 'NOT_LV0' | 'LRIG_TYPE_CLASH';

export const LRIG_ROLE_BLOCK_JA: Record<LrigRoleBlockReason, string> = {
  NOT_IN_DECK: 'ルリグデッキに入っていない',
  NOT_LV0: 'レベル0のルリグだけを指定できる',
  LRIG_TYPE_CLASH: 'センターと同じルリグタイプのアシストは入れられない',
};

/** このカードをこの役に指定できるか（`null` なら指定できる）。判定は割り当て後の姿で行う。 */
export function lrigRoleBlockReason(
  deck: DeckLrigRoles & { lrigDeck: string[] },
  cardNum: string,
  role: LrigRole,
  cardMap: Map<string, CardData>,
): LrigRoleBlockReason | null {
  if (!deck.lrigDeck.includes(cardNum)) return 'NOT_IN_DECK';
  if (!isStartingLrig(cardMap.get(cardNum))) return 'NOT_LV0';
  if (lrigTypeClashWithCenter(assignLrigRole(deck, cardNum, role), cardMap)) return 'LRIG_TYPE_CLASH';
  return null;
}

export type DeckLrigSetupProblem = 'NO_CENTER' | 'ROLE_INVALID' | 'ASSIST_ONE_SIDED' | 'LRIG_TYPE_CLASH';

export const DECK_LRIG_SETUP_PROBLEM_JA: Record<DeckLrigSetupProblem, string> = {
  NO_CENTER: 'センタールリグが未設定',
  ROLE_INVALID: '指定したルリグがデッキに無いかレベル0ではない',
  ASSIST_ONE_SIDED: 'アシストは左右両方を指定するか、両方とも外す',
  LRIG_TYPE_CLASH: 'センターと同じルリグタイプのアシストが入っている',
};

/** 対戦に出せるルリグ設定か（`null` なら出せる）。マッチングの一覧と編成画面の表示が使う。 */
export function deckLrigSetupProblem(
  deck: DeckLrigRoles & { lrigDeck: string[] },
  cardMap: Map<string, CardData>,
): DeckLrigSetupProblem | null {
  if (!deck.centerLrig) return 'NO_CENTER';
  const assigned = [deck.centerLrig, deck.assistLrigL, deck.assistLrigR].filter((n): n is string => !!n);
  if (assigned.some(n => !deck.lrigDeck.includes(n) || !isStartingLrig(cardMap.get(n)))) return 'ROLE_INVALID';
  if (new Set(assigned).size !== assigned.length) return 'ROLE_INVALID';
  if (!!deck.assistLrigL !== !!deck.assistLrigR) return 'ASSIST_ONE_SIDED';
  if (lrigTypeClashWithCenter(deck, cardMap)) return 'LRIG_TYPE_CLASH';
  return null;
}

/**
 * 対戦開始時の配置＝デッキの指定をルリグデッキ内の添字へ解決する（人間も CPU も通る1本）。
 * @returns 指定が対戦に出せない形なら null
 */
export function resolveDeckLrigSetup(
  lrigDeck: string[],
  roles: DeckLrigRoles,
  cardMap: Map<string, CardData>,
): { centerIdx: number; assistIdx: [number, number] | null } | null {
  if (deckLrigSetupProblem({ ...roles, lrigDeck }, cardMap) !== null) return null;
  const idx = (n: string | null | undefined) => (n ? lrigDeck.indexOf(n) : -1);
  const centerIdx = idx(roles.centerLrig);
  const l = idx(roles.assistLrigL), r = idx(roles.assistLrigR);
  return { centerIdx, assistIdx: l >= 0 && r >= 0 ? [l, r] : null };
}

/** DB の行（`decks`）からルリグ指定を取り出す。 */
export const lrigRolesOfRow = (row: { center_lrig?: string | null; assist_lrig_l?: string | null; assist_lrig_r?: string | null }): DeckLrigRoles => ({
  centerLrig: row.center_lrig ?? null,
  assistLrigL: row.assist_lrig_l ?? null,
  assistLrigR: row.assist_lrig_r ?? null,
});
