// verify-accounts.json の読み手を1本に集約する（§5.6.5・2026-09-20）。
//
// 🔴🔑**なぜ funnel が要るか（2026-09-20 に自分で作った事故）**＝
//   ユーザー本人のアカウント（`カルカドール`＝実戦的な CPU デッキの置き場）をこのファイルへ足した瞬間、
//   **`verifySetupDeck.mjs` が `for (const acc of accounts)` で全アカウントを回していたため、
//   ユーザーの本番アカウントに `VERIFY_DECK` / `VERIFY_DECK_MECH` を勝手に作る**状態になっていた。
//   さらに `verifyFullMatch.mjs` は `accounts[0]` / `accounts[1]` の**並び順に依存**しており、
//   新しいアカウントを先頭に足すと**別人の席で対戦テストが走る**。
//   ⇒ **「ハーネスが書き込んでよいアカウント」と「見るだけのアカウント」を型で分ける。**
//
// 規約:
//   - `harness: false` を付けたアカウントは**ハーネスの対象外**（読むだけ）。既定（未指定）は従来どおりハーネス用。
//   - **書き込みを伴うスクリプトは必ず `harnessAccounts()` を使う**（`accounts()` を直接回さない）。
//   - 明示指定（`--user <名前>`）で読むだけの用途は `findAccount()` を使う＝全件から探してよい。
import { readFileSync } from 'node:fs';

const PATH = 'verify-accounts.json';

/** 全アカウント（読み取り用途のみ）。 */
export function allAccounts() {
  try { return JSON.parse(readFileSync(PATH, 'utf-8')).accounts; }
  catch {
    console.error(`${PATH} がありません（.gitignore 圏内＝クローンには付いてきません）。ユーザーに再共有してもらってください。`);
    process.exit(1);
  }
}

/**
 * 🔴**ハーネスが書き込んでよいアカウントだけ**（`harness: false` を除く）。
 * 通し対戦・シナリオ注入・デッキ作成など、**DB を変えるスクリプトは必ずこれを使う**。
 */
export function harnessAccounts() {
  const list = allAccounts().filter(a => a.harness !== false);
  if (list.length === 0) {
    console.error(`${PATH} にハーネス用アカウントがありません（全件に harness:false が付いています）。`);
    process.exit(1);
  }
  return list;
}

/** 名前で1件（見つからなければ null）。⚠**書き込み用途では使わない**（`harness:false` も引けてしまう）。 */
export function findAccount(username) {
  return allAccounts().find(a => a.username === username) ?? null;
}
