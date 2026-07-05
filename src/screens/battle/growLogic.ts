// 【グロウ】条件の抽出・評価・グロウ時追加効果。BattleScreen.tsx から Stage 0 で抽出。
import type { PlayerState, CardData } from '../../types';
import { toHalfWidth } from './battleUtils';


// アクション木（SEQUENCE/CONDITIONAL等のネスト）から GROW_FREE を再帰探索する。
export function findGrowFreeAction(action: unknown): import('../../types/effects').GrowFreeAction | null {
  if (!action || typeof action !== 'object') return null;
  const a = action as Record<string, unknown>;
  if (a.type === 'GROW_FREE') return a as unknown as import('../../types/effects').GrowFreeAction;
  for (const key of ['steps', 'then', 'else', 'action', 'choices'] as const) {
    const v = a[key];
    if (Array.isArray(v)) {
      for (const item of v) { const found = findGrowFreeAction(item); if (found) return found; }
    } else if (v) {
      const found = findGrowFreeAction(v); if (found) return found;
    }
  }
  return null;
}

// EffectText から【グロウ】条件テキストを抽出（次の【】の手前まで）
export function extractGrowCondition(effectText?: string): string | null {
  const m = effectText?.match(/【グロウ】([^【]*)/);
  return m ? m[1].trim() : null;
}

// 【グロウ】条件を評価する。認識できないテキスト（グロウ効果など）は true（条件なし）扱い
export function checkGrowCondition(
  cond: string | null,
  myState: PlayerState,
  currentLrig: CardData | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!cond) return true;

  const currentLrigName = currentLrig?.CardName;

  // ライフクロスが○枚以下
  let m = cond.match(/あなたのライフクロスが([０-９\d]+)枚以下/);
  if (m) return myState.life_cloth.length <= parseInt(toHalfWidth(m[1]));

  // ライフクロスが○枚である（PR-461等）
  m = cond.match(/あなたのライフクロスが([０-９\d]+)枚である/);
  if (m) return myState.life_cloth.length === parseInt(toHalfWidth(m[1]));

  // センタールリグがカード名に《X》を含む（CardClass が混在する遊月・肆などでも正確に判定）
  m = cond.match(/あなたのセンタールリグがカード名に《([^》]+)》を含む/);
  if (m) return !!(currentLrigName?.includes(m[1]));

  // トラッシュに○の色のカードが○枚以上ある
  m = cond.match(/あなたのトラッシュに([^\s]+?)のカードが([０-９\d]+)枚以上/);
  if (m) {
    const [, color, nStr] = m;
    const n = parseInt(toHalfWidth(nStr));
    const count = myState.trash.filter(num => cardMap.get(num)?.Color?.includes(color)).length;
    return count >= n;
  }

  // エナゾーンにあるカードが持つ色が○種類以上
  m = cond.match(/あなたのエナゾーンにあるカードが持つ色が([０-９\d]+)種類以上/);
  if (m) {
    const needed = parseInt(toHalfWidth(m[1]));
    const wixossColors = ['白', '赤', '青', '緑', '黒'];
    const colorSet = new Set<string>();
    for (const num of myState.energy) {
      const card = cardMap.get(num);
      for (const c of wixossColors) {
        if (card?.Color?.includes(c)) colorSet.add(c);
      }
    }
    return colorSet.size >= needed;
  }

  // ○かつ○のルリグ（グロウ元ルリグが指定された複数色を持つ必要がある）
  m = cond.match(/([白赤青緑黒])かつ([白赤青緑黒])のルリグ/);
  if (m) {
    const lrigColor = currentLrig?.Color ?? '';
    return lrigColor.includes(m[1]) && lrigColor.includes(m[2]);
  }

  // ルリグデッキから＜X＞か＜Y＞のルリグ（＜Z＞ではない）を1枚置く
  m = cond.match(/あなたのルリグデッキから(?:＜([^＞]+)＞ではない、)?＜([^＞]+)＞か＜([^＞]+)＞のルリグ１枚/);
  if (m) {
    const excludeRaw = m[1] ?? null;
    const class1 = m[2], class2 = m[3];
    const excludeClasses = excludeRaw ? excludeRaw.split(/[／/]/).map(c => c.trim()) : [];
    return myState.lrig_deck.some(id => {
      const card = cardMap.get(id);
      if (!card) return false;
      const classes = card.CardClass?.split(/[/／]/).map(c => c.trim()) ?? [];
      if (!classes.some(c => c === class1 || c === class2)) return false;
      if (excludeClasses.length > 0 && excludeClasses.every(ec => classes.includes(ec))) return false;
      return true;
    });
  }

  // ルリグデッキにある＜X＞のルリグN枚をゲームから除外する
  m = cond.match(/あなたのルリグデッキにある＜([^＞]+)＞のルリグ([０-９\d]+)枚をゲームから除外する/);
  if (m) {
    const targetClass = m[1];
    const required = parseInt(toHalfWidth(m[2]));
    const count = myState.lrig_deck.filter(id => {
      const card = cardMap.get(id);
      return card?.CardClass?.split(/[/／]/).map(c => c.trim()).some(c => c === targetClass) ?? false;
    }).length;
    return count >= required;
  }

  // 場にある《X》をセンタールリグの下に置く（現在のセンタールリグがXであることを確認）
  m = cond.match(/あなたの場にある《([^》]+)》をあなたのセンタールリグの下に置く/);
  if (m) {
    const targetName = m[1];
    // 現センタールリグトップまたはアシストルリグに対象カードがあるか確認
    const centerTop = myState.field.lrig.at(-1) ? cardMap.get(myState.field.lrig.at(-1)!) : undefined;
    if (centerTop?.CardName === targetName) return true;
    const assistCards = [
      ...(myState.field.assist_lrig_l ?? []),
      ...(myState.field.assist_lrig_r ?? []),
    ].map(id => cardMap.get(id));
    return assistCards.some(c => c?.CardName === targetName);
  }

  // 場にあるカード名に《X》か《Y》を含むキーをセンタールリグの下に置く
  m = cond.match(/あなたの場にあるカード名に《([^》]+)》か《([^》]+)》を含むキー/);
  if (m) {
    const name1 = m[1], name2 = m[2];
    const keyCard = myState.field.key_piece ? cardMap.get(myState.field.key_piece) : null;
    return !!(keyCard && (keyCard.CardName.includes(name1) || keyCard.CardName.includes(name2)));
  }

  // 認識できないパターン → 条件なし扱い（WXEX1-20の不正テキスト等）
  return true;
}

// グロウ時の追加効果を実行する（ルリグデッキから置く・除外する等）
export function applyGrowEffect(
  growCond: string | null,
  state: PlayerState,
  cardMap: Map<string, CardData>,
): { state: PlayerState; log: string | null } {
  if (!growCond) return { state, log: null };

  // ルリグデッキから＜X＞か＜Y＞のルリグ（＜Z＞ではない）をセンタールリグの下に置く
  let m = growCond.match(/あなたのルリグデッキから(?:＜([^＞]+)＞ではない、)?＜([^＞]+)＞か＜([^＞]+)＞のルリグ１枚(?:を公開し、それ)?をあなたのセンタールリグの下に置く/);
  if (m) {
    const excludeRaw = m[1] ?? null;
    const class1 = m[2], class2 = m[3];
    const excludeClasses = excludeRaw ? excludeRaw.split(/[／/]/).map(c => c.trim()) : [];
    const idx = state.lrig_deck.findIndex(id => {
      const card = cardMap.get(id);
      if (!card) return false;
      const classes = card.CardClass?.split(/[/／]/).map(c => c.trim()) ?? [];
      if (!classes.some(c => c === class1 || c === class2)) return false;
      if (excludeClasses.length > 0 && excludeClasses.every(ec => classes.includes(ec))) return false;
      return true;
    });
    if (idx < 0) return { state, log: null };
    const chosenId = state.lrig_deck[idx];
    const newLrigDeck = state.lrig_deck.filter((_, i) => i !== idx);
    const newLrig = [chosenId, ...state.field.lrig]; // 「下に置く」= スタックの最下部
    const cardName = cardMap.get(chosenId)?.CardName ?? chosenId;
    return {
      state: { ...state, lrig_deck: newLrigDeck, field: { ...state.field, lrig: newLrig } },
      log: `グロウ効果：${cardName}をセンタールリグの下に置いた`,
    };
  }

  // ルリグデッキにある＜X＞のルリグN枚をゲームから除外する
  m = growCond.match(/あなたのルリグデッキにある＜([^＞]+)＞のルリグ([０-９\d]+)枚をゲームから除外する/);
  if (m) {
    const targetClass = m[1];
    const required = parseInt(toHalfWidth(m[2]));
    const toRemove: number[] = [];
    state.lrig_deck.forEach((id, i) => {
      if (toRemove.length >= required) return;
      const card = cardMap.get(id);
      if (card?.CardClass?.split(/[/／]/).map(c => c.trim()).some(c => c === targetClass)) toRemove.push(i);
    });
    const removeSet = new Set(toRemove);
    const newLrigDeck = state.lrig_deck.filter((_, i) => !removeSet.has(i));
    return {
      state: { ...state, lrig_deck: newLrigDeck },
      log: `グロウ効果：＜${targetClass}＞のルリグ${toRemove.length}枚をゲームから除外した`,
    };
  }

  // 場にあるカード名に《X》か《Y》を含むキーをセンタールリグの下に置く
  m = growCond.match(/あなたの場にあるカード名に《([^》]+)》か《([^》]+)》を含むキー１枚をあなたのセンタールリグの下に置く/);
  if (m) {
    const name1 = m[1], name2 = m[2];
    const keyId = state.field.key_piece;
    if (!keyId) return { state, log: null };
    const keyCard = cardMap.get(keyId);
    if (!keyCard || (!keyCard.CardName.includes(name1) && !keyCard.CardName.includes(name2))) return { state, log: null };
    const newLrig = [keyId, ...state.field.lrig];
    return {
      state: { ...state, field: { ...state.field, lrig: newLrig, key_piece: null } },
      log: `グロウ効果：${keyCard.CardName}をセンタールリグの下に置いた`,
    };
  }

  // 場にある《X》をセンタールリグの下に置く（ユキ等：現センタールリグが対象のため追加処理不要）
  return { state, log: null };
}

// ルリグのグロウ互換性チェック: CardClass に共通する名前（"/"区切り、全角"／"もあり）が1つでもあれば true
export function lrigClassesCompatible(fromClass: string, toClass: string): boolean {
  const fromSet = new Set(fromClass.split(/[/／]/).map(s => s.trim()).filter(Boolean));
  return toClass.split(/[/／]/).map(s => s.trim()).some(c => fromSet.has(c));
}

// カードの Restriction チェック: "-" または空なら常に使用可。
// それ以外は「〇〇限定」形式で、現在ルリグの CardClass（"/"区切り）に含まれる名前が
// Restriction 文字列中に存在すれば使用可。
// 例: Restriction="タマ限定", lrigClass="タマ" → true
//     Restriction="タマ限定", lrigClass="タマ/イオナ" → true
//     Restriction="タマ限定", lrigClass="花代" → false
export function meetsRestriction(restriction: string, lrigClass: string, ignoreRestriction = false): boolean {
  if (ignoreRestriction || !restriction || restriction === '-') return true;
  return lrigClass.split(/[/／]/).map(s => s.trim()).some(cls => restriction.includes(cls));
}

