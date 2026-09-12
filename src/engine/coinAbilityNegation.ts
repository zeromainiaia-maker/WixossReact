/**
 * coinAbilityNegation.ts — 「**このターンの前のターンに発動した**コイン技を無効にする」
 * （2026-09-12・§5.3 `O-333`・`WX16-002-E4`／`-E4b`）。
 *
 * 🔴**なぜ「書き込み地点に印を付ける」形にしなかったのか**＝登録票の当初案は
 *   「相手ターンを跨ぐ state キー全部に `srcEffectId` を足し、消費側が弾く」だった。実測すると
 *   **跨ぐストアは6種で、そのうち3種は `boolean` / `string[]` / `Record<string,string[]>`＝印を置く場所が無い**うえ、
 *   ターン境界（`clearTurnEndScopedState` → `activateTurnStartScopedState`）で
 *   **`'USE_ARTS:NEXT_TURN'` → `'USE_ARTS'`／`field_grants_next_turn` → `field_grants_active` と名前が変わる**ので、
 *   印を打っても境界で stale になる（境界処理側も書き換える横断作業になる）。
 * 🔑**採った形＝「無効にする能力の宣言（JSON）から、その能力が作った宣言を引き算する」。**
 *   書き込み地点は**1バイトも触らない**。無効化する側だけが、相手の効果の `action` 木を読んで
 *   「この能力が置いたはずのもの」を全ストアから落とす。
 * ⚠**照合は値でやる**（`delta` 一致・`keyword` 一致・`zones` 一致）＝
 *   **境界でキー名が変わっても値は変わらない**ので、active 側と `_next_turn` 側の両方を同じ規則で掃ける。
 * ⚠**同じ値の別エントリを1件だけ落とす**（`delta` 一致は先頭1件）＝
 *   無関係な効果が同じ値を置いていても**取り消す総量は1能力ぶん**に収まる。
 *
 * ⚠🔴**取り消せないもの（原理的な限界・実測で確定）**
 * - **盤面が動いた帰結**（カードの移動・バニッシュ・ドロー）＝もう起きたことは戻せない。
 *   実測 11効果のうち `WDK17-001-E2`（トラッシュから人形を奪って場に出す）がこれに当たる。
 * - **ゲーム中ずっと続く宣言**（`GAIN_LRIG_TYPE{turns:'GAME'}`）＝原文は「ターン終了時まで」無効なので、
 *   落として戻す2段が要る。**この1件のために2段を作らない**（落としたら戻らない＝過剰になるので**対象外にする**）。
 * - **発動したターンで消える帰結**（`duration:'UNTIL_END_OF_TURN'` 等）＝
 *   無効化する側のターンにはもう残っていない＝**引き算しても何も起きないのが正しい**。
 */
import type { PlayerState } from '../types';
import type { CardEffect, Owner } from '../types/effects';

/** コイン技＝《コイン》を使用コストとして払う能力（ベット／アンコール／グロウコストは含まない）。 */
export function isCoinAbility(effect: CardEffect): boolean {
  return (effect.cost?.coin ?? 0) > 0;
}

/**
 * 台帳（`coin_abilities_used_this_turn`）へ積む1エントリ。**引き算指示まで畳んで持つ。**
 *
 * 🔴🔑**`effectId` だけを持って、無効化するときに `effectsMap` から宣言を引き直す形にしてはいけない。**
 *   `ctx.effectsMap` は **`ExecCtx` の optional で、BattleScreen のどの生成地点でも代入されていない**
 *   （`fillDeployCaps` のコメントが「スタック解決の1経路でしか代入されない」と明記している＝続き296 の罠）。
 *   ⇒ 引き直す形にすると **engine の golden は緑なのに実機では丸ごと効かない dead flag** になる。
 *   実装中に一度この形で書いて踏んだので、**台帳に指示を畳む形**へ寄せた。
 * 🔑**発動時に畳むほうが忠実でもある**＝そのとき実際に走った宣言から作るので、
 *   あとから live JSON が変わっても台帳の内容は動かない。
 * ⚠**Supabase の `battle_states` に載る**＝JSON 直列化できる形だけを入れる（関数・Map・Set を入れない）。
 */
export interface CoinAbilityLedgerEntry {
  effectId: string;
  removals: CoinNegationRemoval[];
}

/**
 * コイン技1件を台帳エントリへ畳む。コイン技でなければ `null`。
 * ⚠**引き算指示が空でもエントリは作る**＝「前のターンにコイン技を発動したか」の判定に使うので、
 *   取り消せる宣言が無い能力（盤面が動くだけの能力）も台帳には残す。
 */
export function coinAbilityLedgerEntry(effect: CardEffect): CoinAbilityLedgerEntry | null {
  if (!isCoinAbility(effect)) return null;
  return { effectId: effect.effectId, removals: collectCoinNegationRemovals(effect) };
}

/**
 * 台帳へ足す形（**0件か1件の配列**）。`...coinLedger(effect)` で spread できるので、
 * 呼び出し側に「コイン技かどうか」の判定を写経させない。
 */
export function coinLedger(effect: CardEffect): CoinAbilityLedgerEntry[] {
  const entry = coinAbilityLedgerEntry(effect);
  return entry ? [entry] : [];
}

/**
 * 1つの能力が置いた宣言の「引き算指示」。`side` は**発動者から見た**所有者。
 * ⚠`'any'` は解決できない（誰の場に置いたかが実行時に決まる）＝**両側を掃く**。
 */
export interface CoinNegationRemoval {
  side: Owner | 'any';
  /** boolean フラグ（active 名。`_next_turn` 版も一緒に落とす）。 */
  flags?: Array<'must_attack_signi' | 'must_attack_infected_only'>;
  /** `blocked_actions` のエントリ（接尾辞なしの素の値。`:NEXT_TURN` 付きも落とす）。 */
  blockedActions?: string[];
  /** パワー修整（`delta` 一致のエントリを1件ずつ落とす）。 */
  powerModDeltas?: number[];
  /** キーワード付与（per-signi の付与と場レベル grant の両方から落とす）。 */
  keywords?: string[];
  /** 対戦相手効果によるゾーン移動免疫（`zones` が一致する窓を落とす）。 */
  oppMoveImmunityZones?: string[][];
  /** ダメージ防止の窓（`scope` が一致する窓を落とす）。 */
  preventDamageScopes?: string[];
}

/** `blocked_actions` は `'<id>'` と `'<id>:NEXT_TURN'` の2綴りで同じものを指す。 */
const BLOCK_SUFFIXES = ['', ':NEXT_TURN'] as const;

const POWER_MOD_STORES = ['temp_power_mods', 'power_mods_until_opp_turn', 'power_mods_until_next_own_turn'] as const;
const KEYWORD_STORES = ['keyword_grants', 'keyword_grants_until_opp_turn'] as const;
const FIELD_GRANT_STORES = ['field_grants_active', 'field_grants_next_turn', 'field_grants_next_opp_turn'] as const;

function collectStubIds(node: unknown, acc: string[] = []): string[] {
  if (Array.isArray(node)) { node.forEach(n => collectStubIds(n, acc)); return acc; }
  if (!node || typeof node !== 'object') return acc;
  const o = node as Record<string, unknown>;
  if (o.type === 'STUB' && typeof o.id === 'string') acc.push(o.id);
  for (const v of Object.values(o)) if (v && typeof v === 'object') collectStubIds(v, acc);
  return acc;
}

/** 効果の `action` 木から「相手ターンを跨いで残る宣言」の引き算指示を集める。 */
export function collectCoinNegationRemovals(effect: CardEffect): CoinNegationRemoval[] {
  const out: CoinNegationRemoval[] = [];
  const ownerOf = (o: unknown): Owner | 'any' =>
    (o === 'opponent' || o === 'self' || o === 'any') ? o : 'self';
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    const a = node as Record<string, unknown> & { type?: string };
    switch (a.type) {
      case 'BLOCK_ACTION': {
        // 「次のターンの間、〜できない」だけが対象（このターン限定は発動ターンで消える）。
        if (a.until === 'NEXT_TURN' && typeof a.actionId === 'string') {
          const tgt = a.target as { owner?: unknown } | undefined;
          out.push({ side: ownerOf(tgt?.owner), blockedActions: [a.actionId] });
        }
        break;
      }
      case 'FORCE_SIGNI_ATTACK': {
        if (a.duration === 'NEXT_TURN') {
          out.push({ side: ownerOf(a.targetOwner), flags: ['must_attack_signi', 'must_attack_infected_only'] });
        }
        break;
      }
      case 'POWER_MODIFY': {
        // 跨ぐのは長期ストアへ行く2種だけ（`temp_power_mods` は発動ターンで消える）。
        if ((a.duration === 'UNTIL_OPP_TURN_END' || a.duration === 'UNTIL_NEXT_OWN_TURN_END')
            && typeof a.delta === 'number') {
          const tgt = a.target as { owner?: unknown } | undefined;
          out.push({ side: ownerOf(tgt?.owner), powerModDeltas: [a.delta] });
        }
        break;
      }
      case 'GRANT_KEYWORD': {
        if ((a.duration === 'UNTIL_OPP_TURN_END' || a.duration === 'NEXT_TURN') && typeof a.keyword === 'string') {
          const tgt = a.target as { owner?: unknown } | undefined;
          // ⚠`NEXT_TURN` は `reserveFieldGrant` 経由＝置き場は `nextTurnOwner` で決まる
          //   （`'opponent'`＝相手の場／`'next'`＝次のターンのプレイヤー＝実行時決定）。
          //   どちらも解決できないので**両側を掃く**（値照合なので取り過ぎない）。
          const side: Owner | 'any' = a.duration === 'NEXT_TURN' ? 'any' : ownerOf(tgt?.owner);
          out.push({ side, keywords: [a.keyword] });
        }
        break;
      }
      case 'ZONE_MOVE_IMMUNITY': {
        // `turns >= 2`＝「このターンと次のターンの間」＝跨ぐ。
        if (typeof a.turns === 'number' && a.turns >= 2 && Array.isArray(a.zones)) {
          out.push({ side: ownerOf(a.owner), oppMoveImmunityZones: [a.zones as string[]] });
        }
        break;
      }
      case 'PREVENT_DAMAGE': {
        if (a.until === 'NEXT_TURN' || a.untilNextMainPhase === true) {
          const scope = typeof a.scope === 'string' ? a.scope : (a.until === 'NEXT_TURN' ? 'LRIG' : 'ALL');
          out.push({ side: ownerOf(a.owner), preventDamageScopes: [scope] });
        }
        break;
      }
      default: break;
    }
    for (const v of Object.values(a)) if (v && typeof v === 'object') visit(v);
  };
  visit(effect.action);
  // STUB は id ごとに宣言が違う＝**汎用の木歩きでは読めない**ので、跨ぐものだけを名指しで足す。
  // ⚠**名指しにしない STUB は対象外**（fail-closed＝取り消し過ぎない）。
  const stubIds = new Set(collectStubIds(effect.action));
  if (stubIds.has('BLOCK_OPP_ARTS_SPELL_ACT_NEXT_TURN')) {
    out.push({ side: 'opponent', blockedActions: ['USE_ARTS', 'USE_SPELL', 'USE_ACT'] });
  }
  if (stubIds.has('BLOCK_OPP_SPELL_ACT_NEXT_TURN')) {
    out.push({ side: 'opponent', blockedActions: ['USE_SPELL', 'USE_ACT'] });
  }
  return out;
}

/** 配列から「値が一致する先頭1件」だけを落とす（同じ値の別エントリを巻き込まない）。 */
function dropFirst<T>(arr: readonly T[] | undefined, match: (v: T) => boolean): T[] | undefined {
  if (!arr?.length) return arr as T[] | undefined;
  const i = arr.findIndex(match);
  if (i < 0) return arr as T[];
  const next = [...arr];
  next.splice(i, 1);
  return next;
}

/** 1件の引き算指示を1人の state へ当てる。 */
function applyRemovalToState(state: PlayerState, r: CoinNegationRemoval): PlayerState {
  let s = state;
  for (const flag of r.flags ?? []) {
    const nextKey = `${flag}_next_turn` as 'must_attack_signi_next_turn' | 'must_attack_infected_only_next_turn';
    if (s[flag]) s = { ...s, [flag]: undefined };
    if (s[nextKey]) s = { ...s, [nextKey]: undefined };
  }
  if (r.blockedActions?.length) {
    const drop = new Set(r.blockedActions.flatMap(id => BLOCK_SUFFIXES.map(sfx => `${id}${sfx}`)));
    const before = s.blocked_actions ?? [];
    const next = before.filter(x => !drop.has(x));
    if (next.length !== before.length) {
      s = { ...s, blocked_actions: next.length > 0 ? next : undefined };
    }
  }
  for (const delta of r.powerModDeltas ?? []) {
    for (const key of POWER_MOD_STORES) {
      const cur = s[key];
      const next = dropFirst(cur, m => m.delta === delta);
      if (next !== cur) { s = { ...s, [key]: next?.length ? next : undefined }; break; }
    }
  }
  for (const keyword of r.keywords ?? []) {
    for (const key of KEYWORD_STORES) {
      const cur = s[key];
      if (!cur) continue;
      let hit = false;
      const next: Record<string, string[]> = {};
      for (const [cardNum, kws] of Object.entries(cur)) {
        const kept = kws.filter(k => k !== keyword);
        if (kept.length !== kws.length) hit = true;
        if (kept.length > 0) next[cardNum] = kept;
      }
      if (hit) s = { ...s, [key]: Object.keys(next).length > 0 ? next : undefined };
    }
    for (const key of FIELD_GRANT_STORES) {
      const cur = s[key];
      const next = dropFirst(cur, g => g.kind === 'keyword' && g.keyword === keyword);
      if (next !== cur) { s = { ...s, [key]: next?.length ? next : undefined }; break; }
    }
  }
  for (const zones of r.oppMoveImmunityZones ?? []) {
    const want = [...zones].sort().join(',');
    const cur = s.opp_move_immunity;
    const next = dropFirst(cur, w => [...w.zones].sort().join(',') === want);
    if (next !== cur) s = { ...s, opp_move_immunity: next?.length ? next : undefined };
  }
  for (const scope of r.preventDamageScopes ?? []) {
    const cur = s.prevent_damage_windows;
    const next = dropFirst(cur, w => w.scope === scope);
    if (next !== cur) s = { ...s, prevent_damage_windows: next?.length ? next : undefined };
  }
  return s;
}

/**
 * 1つのコイン技を無効にする＝その能力が置いた宣言を両者の state から引き算する。
 * @param removals 台帳エントリの引き算指示（`coinAbilityLedgerEntry` が発動時に畳んだもの）
 * @param activator 能力を発動した側の state
 * @param victim その対戦相手の state
 */
export function negateCoinAbility(
  removals: readonly CoinNegationRemoval[],
  activator: PlayerState,
  victim: PlayerState,
): { activator: PlayerState; victim: PlayerState; removed: number } {
  let a = activator;
  let v = victim;
  let removed = 0;
  for (const r of removals) {
    const sides: Array<'self' | 'opponent'> = r.side === 'any' ? ['self', 'opponent'] : [r.side];
    for (const side of sides) {
      if (side === 'self') {
        const next = applyRemovalToState(a, r);
        if (next !== a) { a = next; removed++; }
      } else {
        const next = applyRemovalToState(v, r);
        if (next !== v) { v = next; removed++; }
      }
    }
  }
  return { activator: a, victim: v, removed };
}
