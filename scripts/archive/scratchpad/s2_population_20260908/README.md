# S-2（真バグ集団の母集団 grep 実測）2026-09-08

**作業単位**＝ユーザー指示「すべての新バグ集団に S-2 を行う。codex-work と codex を使うこと」。
**PLAN §5.0 の S-2**＝triage で真バグと確定した「系統」について、**原文の言い回し × live JSON の受け皿の有無**で
母集団を全数実測する工程。**実装は0行**（`src/` `public/` 無変更）。

## 中身

| ファイル | 何か |
|---|---|
| `REPORT_A.md` | バッチA（`CODEX_HOME=/c/Users/zerom/.codex-work`）＝**C1 遅延誘発／C2 任意→強制／C3 デッキ上下・シャッフル** |
| `REPORT_B.md` | バッチB（既定 `~/.codex`）＝**C4 ライド重複／C5 色フィルタ／C6 グロウ公開＋機構 `O-289`〜`O-292`**。末尾に **Opus による裏取りと訂正3件** |
| `s2_lib.mjs` | **共通ローダ**（`docs/_effect_srctext.json` × `public/data/effects_*.json` の `scan(regex, predicate)`）＝**codex へ先に渡した道具** |
| `s2_a_measure.mjs` / `s2_b_*.mjs` | 各バッチの測定スクリプト（`node s2_a_measure.mjs --only C2-opp_energy` のように再実行できる。⚠**リポジトリ直下にコピーして `./s2_lib.mjs` を import する形で走らせる**） |

## 結論＝**登録 18効果 → 実測 38効果**

数字と内訳は [../../../docs/BUGFIXES.md](../../../docs/BUGFIXES.md) の 2026-09-08「S-2 全数実測」節、
worklist への反映は [../../../docs/PLAN.md](../../../docs/PLAN.md) §5.0 の系統表と §5.3 索引 G。

🔴**`O-289` は機構不要と確定**（受け皿 `taken_choice_keys` が実在）＝索引 G から §5.0 へ降ろした。
🔴**codex の除外判定を1件訂正**（C5 の `WXK11-052-E1`/`WXK11-077-E1`）＝FP 側は必ず engine の行を人が開く。
🔁**私（Opus）の実測も2件誤っていた**＝MISS は判定ではない（受け皿の別名・親ノードの正準形を見る）。
