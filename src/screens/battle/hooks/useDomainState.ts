// Stage2 共通ヘルパー：ドメイン state 束を1つの useReducer に載せ、useState 互換の
// per-field セッター（Dispatch<SetStateAction<T>>・identity 安定）と、複数フィールドを
// 1 dispatch で更新する patch（semantic action の部品）を提供する。
// 挙動は useState と同一（関数アップデータ対応・Object.is 同値ベイルアウト）。
// ⚠ フィールド値そのものが関数である state には使えない（SetStateAction の関数判定と衝突するため）。
import { useCallback, useMemo, useReducer } from 'react';
import type { Dispatch, SetStateAction } from 'react';

type FieldAction<S> = { [K in keyof S]: { field: K; value: SetStateAction<S[K]> } }[keyof S];
type PatchAction<S> = { patch: Partial<S> };
export type DomainSetters<S> = { [K in keyof S]-?: Dispatch<SetStateAction<S[K]>> };

function apply<S extends object, K extends keyof S>(state: S, field: K, value: SetStateAction<S[K]>): S {
  const prev = state[field];
  const next = typeof value === 'function' ? (value as (p: S[K]) => S[K])(prev) : value;
  if (Object.is(prev, next)) return state;
  return { ...state, [field]: next };
}

function applyPatch<S extends object>(state: S, patch: Partial<S>): S {
  const keys = Object.keys(patch) as (keyof S)[];
  if (keys.every((k) => Object.is(state[k], patch[k]))) return state;
  return { ...state, ...patch };
}

export function useDomainState<S extends object>(
  initial: S,
): [S, DomainSetters<S>, (patch: Partial<S>) => void] {
  const [state, dispatch] = useReducer(
    (s: S, a: FieldAction<S> | PatchAction<S>) => ('patch' in a ? applyPatch(s, a.patch) : apply(s, a.field, a.value)),
    initial,
  );
  // dispatch は React が identity を保証。セッター束も初回に一度だけ組み立てる。
  const setters = useMemo(() => {
    const out = {} as DomainSetters<S>;
    for (const k of Object.keys(initial) as (keyof S)[]) {
      out[k] = ((value: SetStateAction<S[typeof k]>) => dispatch({ field: k, value })) as DomainSetters<S>[typeof k];
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const patch = useCallback((p: Partial<S>) => dispatch({ patch: p }), []);
  return [state, setters, patch];
}
