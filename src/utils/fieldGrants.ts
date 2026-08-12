import type { FieldGrant } from '../types';

/** 旧 string[] キーワードストアを統一 FieldGrant へ読み替える（保存途中の対戦を壊さない）。 */
export function normalizeFieldGrants(
  grants?: readonly FieldGrant[],
  legacyKeywords?: readonly string[],
): FieldGrant[] {
  return [
    ...(grants ?? []),
    ...(legacyKeywords ?? []).map((keyword): FieldGrant => ({ kind: 'keyword', keyword })),
  ];
}

export function optionalFieldGrants(grants: FieldGrant[]): FieldGrant[] | undefined {
  return grants.length > 0 ? grants : undefined;
}
