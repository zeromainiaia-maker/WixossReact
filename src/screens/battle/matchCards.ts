import type { CardData } from '../../types';

/**
 * 🆕2026-10-21＝**1戦で使うカードの集合**（両者の山に入っているカード＋そこから辿れるカード）。
 * CPU観戦（`SpectateScreen`）・自己対戦（`scripts/headlessSelfPlay.ts`／`scripts/selfPlayInvariants.ts`）が同じ1本を呼ぶ。
 *
 * 🔑絞るのは性能のため（効果表を全カード分組まない）。⚠**山に無いのに盤面へ出てくるカードを落とすと「未知のカード」になる**＝
 *   🔴旧＝山のカード＋トークン（`-TK`）だけだったので、《白熱する黒白》（`PR-Di017A`）が出す裏面《REV:アンコーリング》（`PR-Di017B`）が
 *   パワー0のシグニとしてすぐバニッシュされた（自己対戦の不変条件 `SHAPE`／`NEW` で発見）。
 * 足すもの＝①トークン（番号に `-TK`・種別「トークン」）②**ゲームの外から作られるクラフト**（種別に「クラフト」）
 *   ③**同じカード番号の A 面／B 面**（末尾 A ⇔ B）。
 */
export function cardsForMatch(all: readonly CardData[], usedNums: Iterable<string>): CardData[] {
  const used = new Set<string>();
  for (const n of usedNums) {
    const num = String(n).split('#')[0];
    used.add(num);
    const ab = num.match(/^(.*\d)([AB])$/);
    if (ab) used.add(ab[1] + (ab[2] === 'A' ? 'B' : 'A'));
  }
  return all.filter(c => used.has(c.CardNum) || /-TK/.test(c.CardNum)
    || (c.Type ?? '').includes('トークン') || (c.Type ?? '').includes('クラフト'));
}
