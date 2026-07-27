export interface OptionalCostUiOption {
  id: string;
  costColors?: string[];
}

export function optionalCostOptions<T extends OptionalCostUiOption>(options: T[]): T[] {
  return options.filter(option => (option.costColors?.length ?? 0) > 0);
}

export function buildOptionalCostPayload(
  choiceId: string,
  selectedEnergyNums: string[],
): string[] {
  return [choiceId, ...selectedEnergyNums];
}
