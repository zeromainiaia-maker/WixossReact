/**
 * デッキの内訳（2026-10-23 ユーザー要望＝デッキ編成の「デッキ内容」に統計を出す）。
 *
 * 🔑画面（`DeckEditorScreen` の「内訳」タブ）から呼ぶ純関数＝golden で固定する。
 * - ガードは対戦の判定と同じ `Guard === '1'`（`screens/battle/guard.ts` の `canCardGuard` の入口）。
 * - ライフバーストは `LifeBurst === '1'`（「デッキ内容」タブの [LB有：LB無] と同じ）。
 * - 色は「赤青緑」のような多色を1色ずつ数える＝合計がデッキ枚数を超えてよい。
 * - クラスは `engine/cardClasses.ts` の `signiClassesOf`（下位だけ＝R-58）。
 */
import type { CardData } from '../types';
import { signiClassesOf } from '../engine/cardClasses';

export const STAT_COLORS = ['白', '赤', '青', '緑', '黒', '無'] as const;

export interface MainDeckStats {
  total: number;
  signi: number;
  spell: number;
  other: number;
  /** シグニのレベル別（キー＝'0'〜'5'）。 */
  signiLevels: Record<string, number>;
  colors: Record<string, number>;
  guard: number;
  lifeBurst: number;
  /** シグニのクラス（多い順・同数は名前順）。 */
  classes: [string, number][];
}

export interface LrigDeckStats {
  total: number;
  /** ルリグのレベル別（センター・アシストを合わせて）。 */
  lrigLevels: Record<string, number>;
  byType: [string, number][];
}

const baseNum = (n: string) => String(n).split('#')[0];

export function mainDeckStats(nums: readonly string[], cardMap: ReadonlyMap<string, CardData>): MainDeckStats {
  const s: MainDeckStats = { total: 0, signi: 0, spell: 0, other: 0, signiLevels: {}, colors: {}, guard: 0, lifeBurst: 0, classes: [] };
  const cls = new Map<string, number>();
  for (const n of nums) {
    const c = cardMap.get(baseNum(n));
    s.total++;
    if (!c) { s.other++; continue; }
    const type = c.Type ?? '';
    if (type.includes('シグニ')) {
      s.signi++;
      if (/^\d+$/.test(c.Level ?? '')) s.signiLevels[c.Level] = (s.signiLevels[c.Level] ?? 0) + 1;
      for (const k of signiClassesOf(c.CardClass)) cls.set(k, (cls.get(k) ?? 0) + 1);
    } else if (type.includes('スペル')) s.spell++;
    else s.other++;
    for (const col of STAT_COLORS) if ((c.Color ?? '').includes(col)) s.colors[col] = (s.colors[col] ?? 0) + 1;
    if (c.Guard === '1') s.guard++;
    if (c.LifeBurst === '1') s.lifeBurst++;
  }
  s.classes = [...cls].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return s;
}

export function lrigDeckStats(nums: readonly string[], cardMap: ReadonlyMap<string, CardData>): LrigDeckStats {
  const s: LrigDeckStats = { total: 0, lrigLevels: {}, byType: [] };
  const types = new Map<string, number>();
  for (const n of nums) {
    const c = cardMap.get(baseNum(n));
    s.total++;
    const type = c?.Type ?? '不明';
    types.set(type, (types.get(type) ?? 0) + 1);
    if (c && /ルリグ/.test(type) && /^\d+$/.test(c.Level ?? '')) s.lrigLevels[c.Level] = (s.lrigLevels[c.Level] ?? 0) + 1;
  }
  s.byType = [...types].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return s;
}
