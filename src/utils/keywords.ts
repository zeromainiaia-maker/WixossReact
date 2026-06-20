import type { CardData, PlayerState } from '../types';

/**
 * シグニがキーワード能力を持つかチェックする。
 * - card.effects の CONTINUOUS GRANT_KEYWORD（先天的 / 恒久付与）
 * - keywordGrants[cardNum]（ターン内の動的付与）
 * の両方を確認する。
 * 「シャドウ」はスコープ付き表現（例: "シャドウ:level_lte:2"）を許容するため、
 * 完全一致だけでなく `keyword + ':'` のプレフィックス一致も見る。
 */
export function hasKeyword(
  cardNum: string,
  keyword: string,
  cardMap: Map<string, CardData>,
  keywordGrants?: Record<string, string[]>,
  bonds?: string[], // 絆アイコン効果チェック用（プレイヤーが絆獲得済みのカード名一覧）
  extraGrants?: Record<string, string[]>, // UNTIL_OPP_TURN_END で付与されたキーワード
): boolean {
  const card = cardMap.get(cardNum);
  const matches = (kw: string) => kw === keyword || kw.startsWith(keyword + ':');
  if (card?.effects?.some(e => {
    if (e.effectType !== 'CONTINUOUS') return false;
    if (e.action.type !== 'GRANT_KEYWORD') return false;
    if (!matches((e.action as { keyword: string }).keyword)) return false;
    if (e.activeCondition) return false; // 条件付き付与は呼び出し元で checkActiveCondition により動的評価
    if (e.kizunaIcon) {
      if (!bonds) return false;
      if (!bonds.includes(card?.CardName ?? '')) return false;
    }
    return true;
  })) return true;
  if (keywordGrants?.[cardNum]?.some(matches)) return true;
  return extraGrants?.[cardNum]?.some(matches) ?? false;
}

/**
 * シグニがシャドウを持つかチェックする（hasKeyword の糖衣構文）。
 */
export function hasShadow(
  cardNum: string,
  cardMap: Map<string, CardData>,
  keywordGrants?: Record<string, string[]>,
  bonds?: string[],
  extraGrants?: Record<string, string[]>,
): boolean {
  return hasKeyword(cardNum, 'シャドウ', cardMap, keywordGrants, bonds, extraGrants);
}

// ===== シャドウのスコープ（対象限定）=====
// 「【シャドウ（条件）】」の括弧内条件。条件省略時（'シャドウ'単体）は無条件（常に保護）。
// keyword文字列は "シャドウ:" + JSON.stringify(scope) で符号化する（hasKeyword側はプレフィックス一致で検出）。
export interface ShadowScope {
  levelLte?: number;          // レベルX以下
  levelGte?: number;          // レベルX以上
  levelEq?: number;           // レベルX
  powerLte?: number;          // パワーX以下
  powerEq?: number;           // パワーがちょうどX（宣言した数字と同じパワー等）
  color?: string;             // 特定の色
  cardType?: 'シグニ' | 'スペル'; // 特定のカードタイプ（他条件とのAND）
  declaredColor?: true;       // 保護対象のコントローラーが宣言した色と一致
  selfColor?: true;           // 保護対象自身の色と一致
  selfPowerLte?: true;        // 保護対象自身のパワー以下
  selfPowerHalfLte?: true;    // 保護対象自身のパワーの半分以下
  underSigniLevelEq?: true;   // 保護対象の下にあるシグニと同じレベル
  lrigTrashArtsColor?: true;  // 保護対象コントローラーのルリグトラッシュにあるアーツが持つ色と一致
  artsCostLte?: number;       // 発生源がアーツでコスト合計がX以下
  // ===== 動的スコープマーカー（GRANT時にのみ使用、keyword_grantsへの保存前に解決済みになる） =====
  downerLrigLevel?: true;      // 同一SEQUENCE内でダウンしたルリグのレベルと等しいシグニ（WX24-P1-040）
  declaredNumberPowerEq?: true; // 同一SEQUENCE内で宣言した数字と等しいパワーのシグニ（SPDi43-27）
}

const SHADOW_PREFIX = 'シャドウ:';

/** ShadowScopeをkeyword_grants/GrantKeywordAction.keyword用の文字列に符号化する */
export function encodeShadowKeyword(scope: ShadowScope | null): string {
  if (!scope || Object.keys(scope).length === 0) return 'シャドウ';
  return SHADOW_PREFIX + JSON.stringify(scope);
}

/** keyword文字列（"シャドウ" or "シャドウ:{...}"）からShadowScopeを復元する。シャドウでなければnull、無条件ならundefinedスコープ（{}）を返す */
export function decodeShadowKeyword(kw: string): ShadowScope | null {
  if (kw === 'シャドウ') return {};
  if (!kw.startsWith(SHADOW_PREFIX)) return null;
  try {
    return JSON.parse(kw.slice(SHADOW_PREFIX.length)) as ShadowScope;
  } catch {
    return {};
  }
}

/**
 * 「【シャドウ（X）】」の括弧内テキスト X を ShadowScope に変換する。
 * 未対応の表現（例:「このシグニの【出】能力で指定した色」）は null を返す（無条件シャドウにフォールバック）。
 */
export function parseShadowScopeText(inner: string): ShadowScope | null {
  const s = inner.trim();
  const half = (x: string) => x.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  let m: RegExpMatchArray | null;
  // レベル（以下／以上／ちょうど）
  if ((m = s.match(/^レベル([０-９\d]+)以下/))) return { levelLte: parseInt(half(m[1]), 10) };
  if ((m = s.match(/^レベル([０-９\d]+)以上/))) return { levelGte: parseInt(half(m[1]), 10) };
  if ((m = s.match(/^レベル([０-９\d]+)/)))     return { levelEq:  parseInt(half(m[1]), 10) };
  // パワー（自分基準を先に判定）
  if (/^パワーがこのシグニのパワーの半分以下/.test(s)) return { selfPowerHalfLte: true, cardType: 'シグニ' };
  if (/^このシグニのパワー以下/.test(s))               return { selfPowerLte: true };
  if ((m = s.match(/^パワー([０-９\d]+)以下/)))         return { powerLte: parseInt(half(m[1]), 10) };
  // カードタイプ単独
  if (s === 'シグニ') return { cardType: 'シグニ' };
  if (s === 'スペル') return { cardType: 'スペル' };
  // アーツコスト
  if ((m = s.match(/^コストの合計が([０-９\d]+)以下のアーツ/))) return { artsCostLte: parseInt(half(m[1]), 10) };
  // 色系
  if (/^(宣言された色|宣言した色)/.test(s)) return s.includes('シグニ') ? { declaredColor: true, cardType: 'シグニ' } : { declaredColor: true };
  if (/^このシグニが持つ色/.test(s))                       return { selfColor: true };
  if (/^あなたのルリグトラッシュにあるアーツが持つ色/.test(s)) return { lrigTrashArtsColor: true };
  if ((m = s.match(/^([白赤青緑黒])$/)))                    return { color: m[1] };
  // 動的スコープ（同一SEQUENCE内で解決されるマーカー）
  if (/^この方法でダウンしたルリグと同じレベル/.test(s))   return { downerLrigLevel: true };
  if (/^この方法で宣言した数字と同じパワー/.test(s))       return { declaredNumberPowerEq: true };
  if (/^このシグニの下にあるシグニと同じレベル/.test(s))   return { underSigniLevelEq: true };
  return null;
}

/**
 * 効果テキスト中の「【シャドウ（X）】」を「【シャドウ:{json}】」へ符号化する。
 * stripRuleParens で括弧内テキストが除去される前に呼ぶことで、スコープ条件が失われないようにする。
 * 未対応スコープは無条件シャドウ「【シャドウ】」に縮退させる。
 */
export function encodeShadowScopesInText(text: string): string {
  return text.replace(/【シャドウ（([^）]*)）】/g, (_full, inner: string) => {
    const scope = parseShadowScopeText(inner);
    return `【${encodeShadowKeyword(scope)}】`;
  });
}

/**
 * cardNumが持つすべてのシャドウのスコープを集める（CONTINUOUS静的付与＋動的keywordGrants＋extraGrants）。
 * activeCondition付きの静的付与は呼び出し元で別途 checkActiveCondition により判定すること（このリストには含めない）。
 */
export function getShadowScopes(
  cardNum: string,
  cardMap: Map<string, CardData>,
  keywordGrants?: Record<string, string[]>,
  bonds?: string[],
  extraGrants?: Record<string, string[]>,
): ShadowScope[] {
  const card = cardMap.get(cardNum);
  const scopes: ShadowScope[] = [];
  card?.effects?.forEach(e => {
    if (e.effectType !== 'CONTINUOUS' || e.action.type !== 'GRANT_KEYWORD') return;
    const kw = (e.action as { keyword: string }).keyword;
    const scope = decodeShadowKeyword(kw);
    if (scope === null) return;
    if (e.activeCondition) return; // 呼び出し元でcheckActiveCondition評価
    if (e.kizunaIcon && !bonds?.includes(card?.CardName ?? '')) return;
    scopes.push(scope);
  });
  for (const kw of keywordGrants?.[cardNum] ?? []) {
    const scope = decodeShadowKeyword(kw);
    if (scope) scopes.push(scope);
  }
  for (const kw of extraGrants?.[cardNum] ?? []) {
    const scope = decodeShadowKeyword(kw);
    if (scope) scopes.push(scope);
  }
  return scopes;
}

/**
 * protectedCardNum（ownerState の場のシグニ）が、同じ場の他カードの CONTINUOUS GRANT_FIELD_SHADOW
 * 宣言によって得るシャドウのスコープを集める（場全体への継続シャドウ付与）。
 * getShadowScopes は各カード自身の effects しか読まないため、場全体付与はこの経路で補う。
 * 現状フィルタは inGateZone（own_gate_zones）のみ対応。activeCondition 付き宣言は未対応（保護しない）。
 */
export function getFieldGrantedShadowScopes(
  protectedCardNum: string,
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
): ShadowScope[] {
  const scopes: ShadowScope[] = [];
  const baseNum = (n: string) => n.includes('#') ? n.slice(0, n.indexOf('#')) : n;
  const signi = ownerState.field.signi;
  const zi = signi.findIndex(stack => stack?.at(-1) === protectedCardNum);
  if (zi < 0) return scopes;
  for (let z = 0; z < signi.length; z++) {
    const top = signi[z]?.at(-1);
    if (!top) continue;
    const card = cardMap.get(top) ?? cardMap.get(baseNum(top));
    card?.effects?.forEach(e => {
      if (e.effectType !== 'CONTINUOUS' || e.action.type !== 'GRANT_FIELD_SHADOW') return;
      if (e.activeCondition) return; // activeCondition 付きは未対応（呼び出し元で評価していない）
      const a = e.action as { keyword: string; filter?: { inGateZone?: boolean; cardType?: string }; targetOwner?: string };
      if (a.targetOwner === 'opponent') return; // 自場付与のみ対応
      if (a.filter?.inGateZone !== undefined) {
        const inGate = (ownerState.own_gate_zones ?? []).includes(zi);
        if (a.filter.inGateZone !== inGate) return;
      }
      const scope = decodeShadowKeyword(a.keyword);
      if (scope) scopes.push(scope);
    });
  }
  return scopes;
}

/**
 * 効果の発生源カード（sourceCard）がShadowScopeの条件を満たすか（＝保護されて対象にできないか）を判定する。
 * scopeが{}（条件キー無し）の場合は無条件で常に保護する。
 * protectedOwnerState: シャドウ保持カードのコントローラーのPlayerState（宣言色・ルリグトラッシュ・場の参照に使用）
 */
export function evaluateShadowScope(
  scope: ShadowScope,
  sourceCard: CardData | undefined,
  protectedCardNum: string,
  protectedOwnerState: PlayerState,
  cardMap: Map<string, CardData>,
): boolean {
  const keys = Object.keys(scope) as (keyof ShadowScope)[];
  if (keys.length === 0) return true; // 無条件シャドウ
  if (!sourceCard) return false; // 発生源不明なら保護しない（安全側のフォールバック）
  const srcLevel = parseInt(sourceCard.Level ?? '', 10);
  const srcPower = sourceCard.Power === '∞' ? Infinity : parseInt(sourceCard.Power ?? '', 10);

  if (scope.cardType !== undefined && sourceCard.Type !== scope.cardType) return false;
  if (scope.levelLte !== undefined && !(srcLevel <= scope.levelLte)) return false;
  if (scope.levelGte !== undefined && !(srcLevel >= scope.levelGte)) return false;
  if (scope.levelEq !== undefined && srcLevel !== scope.levelEq) return false;
  if (scope.powerLte !== undefined && !(srcPower <= scope.powerLte)) return false;
  if (scope.powerEq !== undefined && srcPower !== scope.powerEq) return false;
  if (scope.color !== undefined && !(sourceCard.Color?.includes(scope.color) ?? false)) return false;
  if (scope.declaredColor) {
    const dc = protectedOwnerState.declared_color;
    if (!dc || !(sourceCard.Color?.includes(dc) ?? false)) return false;
  }
  if (scope.selfColor) {
    const protectedCard = cardMap.get(protectedCardNum);
    const pc = protectedCard?.Color ?? '';
    if (!pc || !(sourceCard.Color?.split('').some(c => pc.includes(c)) ?? false)) return false;
  }
  if (scope.selfPowerLte) {
    const protectedCard = cardMap.get(protectedCardNum);
    const pp = protectedCard?.Power === '∞' ? Infinity : parseInt(protectedCard?.Power ?? '', 10);
    if (isNaN(srcPower) || isNaN(pp) || !(srcPower <= pp)) return false;
  }
  if (scope.selfPowerHalfLte) {
    const protectedCard = cardMap.get(protectedCardNum);
    const pp = protectedCard?.Power === '∞' ? Infinity : parseInt(protectedCard?.Power ?? '', 10);
    if (isNaN(srcPower) || isNaN(pp) || !(srcPower <= pp / 2)) return false;
  }
  if (scope.underSigniLevelEq) {
    const zoneIdx = protectedOwnerState.field.signi.findIndex(stack => stack?.at(-1) === protectedCardNum);
    const stack = zoneIdx >= 0 ? protectedOwnerState.field.signi[zoneIdx] : undefined;
    const underNum = stack && stack.length > 1 ? stack[stack.length - 2] : undefined;
    const underLevel = underNum ? parseInt(cardMap.get(underNum)?.Level ?? '', 10) : NaN;
    if (isNaN(underLevel) || srcLevel !== underLevel) return false;
  }
  if (scope.lrigTrashArtsColor) {
    const artsColors = (protectedOwnerState.lrig_trash ?? [])
      .map(n => cardMap.get(n))
      .filter(c => c?.Type === 'アーツ')
      .flatMap(c => (c?.Color ?? '').split(''));
    if (artsColors.length === 0 || !(sourceCard.Color?.split('').some(c => artsColors.includes(c)) ?? false)) return false;
  }
  if (scope.artsCostLte !== undefined) {
    if (sourceCard.Type !== 'アーツ') return false;
    const costTotal = (sourceCard.Cost ?? '').match(/×([０-９\d]+)/g)
      ?.reduce((sum, m) => sum + parseInt(m.replace(/[×０-９]/g, c => (c === '×' ? '' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0))), 10), 0) ?? 0;
    if (!(costTotal <= scope.artsCostLte)) return false;
  }
  return true;
}

/**
 * シグニがシャドウ(ルリグ)を持つかチェックする。
 * 「ルリグの効果によっては対象にされない」キーワード。
 */
export function hasShadowLrig(
  cardNum: string,
  cardMap: Map<string, CardData>,
  keywordGrants?: Record<string, string[]>,
  extraGrants?: Record<string, string[]>,
): boolean {
  return hasKeyword(cardNum, 'シャドウ（ルリグ）', cardMap, keywordGrants, undefined, extraGrants);
}

/**
 * シグニがバニッシュ耐性（バニッシュされない）を持つかチェックする。
 * effects.json 未登録カードは EffectText の直接検索でフォールバックする。
 */
export function hasBanishResist(
  cardNum: string,
  cardMap: Map<string, CardData>,
  keywordGrants?: Record<string, string[]>,
  extraGrants?: Record<string, string[]>,
): boolean {
  if (hasKeyword(cardNum, 'バニッシュされない', cardMap, keywordGrants, undefined, extraGrants)) return true;
  // effects.json 未登録カード用フォールバック（『』内の引用テキストは除外：条件付き付与の誤検知防止）
  const card = cardMap.get(cardNum);
  const text = (card?.EffectText ?? '').replace(/『[^』]*』/g, '');
  return text.includes('バニッシュされない');
}
