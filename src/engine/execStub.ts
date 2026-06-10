import type { EffectAction, StubAction } from '../types/effects';
import type { ExecCtx, ExecResult } from './execUtils';
import { done, addLog } from './execUtils';
import { execStubPart1 } from './execStubPart1';
import { execStubPart2 } from './execStubPart2';
import { execStubPart3 } from './execStubPart3';

export function execStub(
  stub: StubAction,
  ctx: ExecCtx,
  exec: (action: EffectAction, ctx: ExecCtx) => ExecResult,
): ExecResult {
  return (
    execStubPart1(stub, ctx, exec) ??
    execStubPart2(stub, ctx, exec) ??
    execStubPart3(stub, ctx, exec) ??
    done(addLog(ctx, `[STUB: ${stub.id}]`))
  );
}
