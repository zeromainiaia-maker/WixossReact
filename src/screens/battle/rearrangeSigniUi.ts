export function buildRearrangeSigniArrangement(
  newArrangement: string[] | null,
  mode: 'rearrange' | 'swap' | undefined,
  currentSigni: Array<string[] | null>,
): string[] {
  if (newArrangement !== null) return newArrangement;
  if (mode === 'swap') return [];
  return [0, 1, 2].map(zi => currentSigni[zi]?.at(-1) ?? '');
}
