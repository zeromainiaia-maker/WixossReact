export function buildRearrangeSigniArrangement(
  newArrangement: string[] | null,
  mode: 'rearrange' | 'swap' | 'swap_pair' | undefined,
  currentSigni: Array<string[] | null>,
): string[] {
  if (newArrangement !== null) return newArrangement;
  if (mode === 'swap' || mode === 'swap_pair') return [];
  return [0, 1, 2].map(zi => currentSigni[zi]?.at(-1) ?? '');
}
