/**
 * ピース応答の永続化順序を固定する。
 * 完了フラグは、支払いと応答効果のスタック投入が終わり、最新盤面を読み直した後だけ立てる。
 */
export const PIECE_CUTIN_COMMIT_ORDER = ['payment', 'effects', 'fetch_latest', 'complete'] as const;

export async function completePieceCutinResponseAfterEffects<T>({
  commitPayment,
  queueEffects,
  fetchLatest,
  markComplete,
}: {
  commitPayment: () => Promise<void>;
  queueEffects: () => Promise<void>;
  fetchLatest: () => Promise<T | null>;
  markComplete: (latest: T) => Promise<void>;
}): Promise<boolean> {
  let latest: T | null = null;
  for (const step of PIECE_CUTIN_COMMIT_ORDER) {
    if (step === 'payment') await commitPayment();
    else if (step === 'effects') await queueEffects();
    else if (step === 'fetch_latest') latest = await fetchLatest();
    else {
      if (latest === null) return false;
      await markComplete(latest);
    }
  }
  return true;
}
