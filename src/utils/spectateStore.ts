/**
 * 🆕**CPU観戦の記録の置き場**（2026-09-22）＝リロードしても観戦中の試合へ戻れるようにする。
 *
 * ■ なぜ IndexedDB か＝記録は1試合で数MB（1手ごとの盤面の行）あり `sessionStorage`（約5MB）に収まらない。
 *   IndexedDB の構造化複製は**同じオブジェクトを1回だけ書く**ので、手ごとに共有している盤面の部分木は膨らまない。
 * ⚠**保存は1件だけ**（最後に計算した試合）。失敗しても観戦は続ける（復帰できないだけ）＝呼び出し側で握りつぶしてよい。
 * ⚠「観戦画面にいる」印は `sessionStorage`（タブを閉じたら消える）＝別タブ・次回起動で勝手に観戦へ飛ばない。
 */
const DB_NAME = 'wixoss-spectate';
const STORE = 'recordings';
const KEY = 'last';

/** 観戦画面にいる（リロードで観戦へ戻す）印。 */
export const SPECTATE_ACTIVE_KEY = 'spectate.active';
/** 再生中の手の位置（リロードでそこから再開）。 */
export const SPECTATE_FRAME_KEY = 'spectate.frame';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSpectateRecording(value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadSpectateRecording<T>(): Promise<T | null> {
  const db = await openDb();
  const v = await new Promise<T | null>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return v;
}

export async function clearSpectateRecording(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
