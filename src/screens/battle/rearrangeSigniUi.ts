export function buildRearrangeSigniArrangement(
  newArrangement: string[] | null,
  mode: 'rearrange' | 'swap' | 'swap_pair' | 'traps' | undefined,
  currentSigni: Array<string[] | null>,
  /** 🆕`mode:'traps'`（§5.3 `O-59`）の現在のトラップ配置。skip 時の恒等配置に使う。 */
  currentTraps?: Array<string | null>,
): string[] {
  if (newArrangement !== null) return newArrangement;
  if (mode === 'swap' || mode === 'swap_pair') return [];
  // 🆕`traps`＝skip（現状維持）はトラップ枠の恒等配置。**シグニ側を返すとトラップが消える。**
  if (mode === 'traps') return [0, 1, 2].map(zi => currentTraps?.[zi] ?? '');
  return [0, 1, 2].map(zi => currentSigni[zi]?.at(-1) ?? '');
}
