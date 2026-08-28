# WixossReactClone — Claude Code 引き継ぎメモ

## プロジェクト概要
WixossカードゲームのReactクローン実装。

---

## 注意事項
- 🆕**作業は `docs/PLAN.md §2「作業の流れ」`に従う（2026-08-23 運用・Opus 単独／2026-08-29 に2レーン制へ改定）**：**Opus/Sonnet のモデル分担は廃止**。1巡＝**①取る（§5 の上から1件）→②母集団を実測→②'レーンを決める→③実装→④ゲート→⑤実機（要るときだけ）→⑥簿記**。**作業中に見つけた engine/parser バグはその場で直す**のが既定（先送りしてよいのは新機構が要るときだけ＝PLAN §5.3 へ `O-nn` で登録）。
- 🆕🔴**②' 実装レーンの選び方（2026-08-29 ユーザー決定・詳細は PLAN §2.0）＝先に「どちらで書くか」を決める。これを決めずに parser へ手を伸ばすのが「1効果1時間」の主因だった。**
  - **速い（既定）＝同型が2枚以下** → **`manualEffects.ts` に手書き**。検証は `build:effects` → **逆翻訳を目視** → `npm run golden -- --only "<名前>"` ＋ `npm run smoke`（**計 約5秒**）。**1件 5〜10分**。
  - **遅い（例外）＝同型が3枚以上／新しいアクション型・条件型を足す／`src/engine/` を触る／`src/screens/` を触る** → `effectParser.ts` ほか＋現行フル（`npm run gates`）。
  - **根拠（実測 2026-08-29）**＝`npm run census:clusters` の **高シグナル571効果 → 文型テンプレ501種＝1テンプレあたり1.14効果**。**parser に regex を1本足しても平均1.14効果しか直らない**＝「同型が一括で直る」という parser 優先の前提が尽きた。⚠**在庫が戻れば（新カードで同型が増えれば）遅いレーンへ戻す**。
  - 🔴**「移設だけ」の manual 化は禁止**＝parser の出力を中身そのままコピーしても**何も直らないうえ、`vocabCensus.ts` が STUB/MANUAL を高シグナルから免除するので計器から消える**（＋収穫マージが不可侵にして parser 改善が永久に届かない）。書くのは**「原文を読み直して正しい JSON を手で書く」**こと。
- 🆕🔴**機構 worklist（PLAN §5.3）は「上から」取らない（2026-08-29 ユーザー決定）**＝あの節は**登録順**で、規模が極端に偏っている（実測＝**上位2件で315効果／残り約30件を全部やっても合計およそ40効果**）。**取る順は PLAN §5.3 冒頭の「取る順」表**に従う。次は **`O-80`（36効果・リスク小・2バッチ）→ `O-51`（279効果・実装は約30行）**。
  - ⚠**登録票の「規模」列は実装量とは限らない**＝`O-51` の「L」は**ブラスト半径**（279効果すべてに対話が1つ増える）であって、実装は約30行・新型不要。`O-60` の「138ハンドラ」は**効果数ではない**（本命は miss 43ハンドラ＝76カード＝1バッチ平均1.8カード＝**後回しでよい**）。
- 🆕**1〜3枚の機構項目は「型」を足す前に3つ確かめる**（PLAN §5.3 の「1〜3枚の項目の取り方」）：
  - 🔑**まず受け皿を疑う**＝2026-08-29 の実測で**2件とも既に在った**（`O-123` の `useTimeCost.ts`／`WX14-049` の `forResonaCondition`＋`targetsTriggerSource`）。**原文の言い回しで `src/` と `scripts/goldenTest.ts` を grep する**（実装済みなら golden が張ってあることが多い）。
  - **アクション側は `STUB` ハンドラ1本で書く**＝`execStubPart*.ts` に **923本**の実績・**1本あたり平均17行**。`census:stubs` A群からも消える。
  - 🔴**条件側には STUB の道が無い**＝`COND_STUB` は `execUtils.ts:2413` が **`return true`＝無条件成立**。条件は**型＋`CONDITION_TYPES`＋`evalCondition`＋`checkActiveCondition`＋golden＋parser の6箇所**を必ず揃える。
- 🆕**④ゲートの回し方**＝**速いレーンは1件ごとに `golden -- --only` ＋ `smoke` だけ。`npm run gates` は10件たまってから1回。** ⚠`gates` 116秒のうち **golden が102秒（88%）**＝1件ごとに回すと golden を毎回払う。
- 🆕**⑤実機の要否は「触ったディレクトリ」で機械的に決める**（PLAN §2.2）：**`src/screens/` を触った回**と**新しい型・機構を足した回**は**実機まで必須**。**`src/data/` `src/engine/` `public/data/` だけの回は④まででよい**（実機不要）。判定した理由を BUGFIXES に1行書く。
- 🆕**⑥簿記は速いレーンなら10件まとめて1回**（BUGFIXES は**真因1行／影響枚数／検証コマンド／反転確認の有無**の約10行）。遅いレーン・機構変更のときだけ `/baton` フル。
- **CSV の順番を必ず維持する**（スクリプト内の `sorted` ロジックで対応済み）
- `scripts/addWX01.mjs` などのWEL化スクリプトは削除済み（WEL化は廃止）

## ディレクトリ規約（2026-07-05整理）
- `src/screens/battle/` — BattleScreen の分割先（純関数ヘルパー＋ `modals/` のモーダル部品。共有コンテキストは `modals/types.ts` の `BattleModalCtx`）。**BattleScreen の新規モーダル/ヘルパーはここに置く**（本体に足さない。分割の経緯と継続レシピは PLAN.md §4）。
- `scripts/` — **現役ツールのみ**（package.json の npm scripts・CI・docs の現行ワークフローから参照される約27本）。ここに one-off を溜めない。
- `scripts/archive/` — **適用済み one-off スクリプト・過去レポートの保管庫**（旧ルート散在分と旧 `scratchpad/` の中身＝`scripts/archive/scratchpad/`）。実行しない歴史記録。BUGFIXES.md 等の過去ログ内パスは移動先に更新済み。
- **使い捨ての調査・検証スクリプトは `tmp_*` 名で作業**（gitignore済み・`/scratchpad/` も廃止済みで無視される）。記録に残す価値があるものだけ、適用後に `scripts/archive/` へ移して BUGFIXES.md から参照する。
- **ルート直下にスクリプトやレポートを作らない**。置いてよいのは設定類（package.json / tsconfig* / vite / eslint / .env* 等）・`index.html`・`verify.html`（viteの追加エントリ）・`CLAUDE.md` / `README.md` のみ。

## 検証コマンド（共同開発者・必読）
実機（ブラウザ対戦）不要でヘッドレス回帰検証できる。**`npm install` 後すぐ動く**（tsx は devDependency）。詳細は `docs/PLAN.md §7`。
- `npm run gates` — **全ゲート一括**（typecheck 先行→golden/smoke/fuzz/census/census:stubs/manual-fields/lint を並列実行＝`scripts/runGates.mjs`）。engine/parser/decompiler を触ったらこれ1本でよい。**2026-07-12高速化：tsc incremental＋eslint --cache 導入で無変更時 約3秒・変更後も数秒**（キャッシュ消失時のみ約37秒。キャッシュ置き場は `node_modules/.tmp/`・`node_modules/.cache/eslint/`＝gitignore圏内）
- `npm run regen` — **decompileシート全10枚＋下流（genReviewRepr/groupSimilar/groupBySentence）を一括再生成（UTF-8直書き）**。旧手順の「⚠Bash の `>` で1枚ずつリダイレクト」は不要（PowerShell の `>` が UTF-16 を書いて下流を壊す事故を構造的に回避。下流3スクリプトには UTF-16 混入ガードもあり、混入時は即 exit 1）
- `npm run typecheck` — 型チェック（CIと同じ／必須）
- `npm run smoke` — 全効果10582件を自動実行し CRASH/HANG/INVARIANT 検出（現状 全0）
- `npm run golden` — DSLアクション型＋C1トリガー収集の結果を assert（**現状 2770/2770 PASS・全件 約89秒**）。🆕**2026-08-25＝テスト名フィルタを追加**＝`npm run golden -- --only "<部分文字列>"` で絞れる（**約1.5秒**・複数指定可＝OR・名前一覧は `npm run golden -- --list`・0件マッチは exit 1）。🔴**フィルタ実行の PASS/FAIL は全件実行と等価ではない**（`goldenTest.ts:155` の POOL カーソルがテスト間で共有される可変状態＝スキップすると後続テストが引くカードが変わり**両方向に化けうる**）＝**1巡を閉じる前に必ずフィルタなしで全件を回す**（PLAN §2.1 ④）。⚠`npm run gates`・CI は常に全件
- `npm run fuzz` — 乱択 自己対戦ファズ＝進化盤面で効果連鎖し相互作用/複製バグ検出（現状 全0・シード再現可）
- `npm run census` — 語彙センサス＝過剰効果/幻覚の両方向計器（高シグナル1872ベースライン・超過で exit 1）。消化は `npm run census:clusters`（文型クラスタ表）→parser規則→`npm run build:effects`→`node scripts/heldReview.mjs` 一括採用（手順は PLAN.md §5c・§4「次の一手」）
- **`npm run census:timing`** — **timing 語彙センサス（2026-07-12新設）＝「【自】なのに timing 判定が全て外れて `ON_PLAY`（＝場に出たとき）へフォールバックした効果」**を原文トリガー句でクラスタリング（`docs/_timing_census.txt`）。**engine に収集関数があるのに parser がその timing を生成していない穴**を炙り出す計器＝上位クラスタは parser に regex 1本足すだけで直ることが多い（PLAN §3 Opusタスク16）。ゲートではない（exit 0）
- **`npm run census:goldentypes`** — **golden 型カバレッジ（2026-08-10新設）＝「`EffectAction` union の型なのに goldenTest.ts に型名が1度も出ない型」**を live 出現数の多い順に列挙（`scripts/goldenTypeCoverage.ts`）。**現在 未カバー0**＝新しいアクション型を足したら golden を1件書くまでここに出続ける。ゲートではない（exit 0）
- 🆕**`npm run census:cards`** — **カード単位の進捗計器（2026-08-22新設）＝「全カード約7000枚のうちどれだけ出来ているか」への分解した回答**（`scripts/cardProgressCensus.mjs`）。母数（全6712／効果あり6031／バニラ681）→ 効果の `parseStatus` 内訳 → **懸念フラグ別のカード数**（census／意味照合の未消化 findings／held／partial）の3段で出す。⚠**単一の「完成度○%」は出さない**（§3 の原則＝件数メトリクスを完了指標にしない）。⚠**STUB を「未実装」と数えない**＝実装済みハンドラの表示名でもあり、数えると clean 率が 80.9%→52.2% に化ける（無言 no-op は `census:stubs` A群🔴 が別に測っており0件）。ゲートではない（exit 0）🆕**2026-08-27＝`--sheet` を追加**＝**1枚の CSV だけを母数にできる**（`npm run census:cards -- --sheet 1`／`--sheet 1 --list` で要対応カードを列挙）。**全6,666枚を分母にすると計器が新しい findings を生み続けて 0 に向かわない**ので、**1シートを分母に固定して単調減少するカウンタにする**のが狙い（Sheet1＝974枚・効果あり863枚）。⚠**シート帰属は先勝ち**（decompile/build と同じ規約）。⚠**「フラグ0＝正しい」ではない**（計器が見ていないだけ）＝シートを閉じるには残りへの検出パスが別途要る（出力にも毎回出る）。🔴**同日に計器自体のバグを1件直した**＝意味照合の残 OPEN を自前で数えており、`stage2_closed.txt` の `EFFECTID :: <quote>` 形（488件中332件）を**1件も見ていなかった**ため **未消化を 643→948・影響カードを 485→695 と過大報告**していた。⇒ 判定は **`scripts/archive/semanticAuditLedger.mjs` から import する1本だけ**に集約した（この修正で全体の clean 率が 83.2%→85.7% に動いたが、**前進ではなく計器の較正**）。🆕**`idset` フラグを追加**（§6.4 O-39＝id 集合ズレで parser 改善が届いていないカード）。
- **`npm run census:stubs`** — **STUB 仕分け（2026-08-10新設）＝逆翻訳の `[STUB:…]` を「表示だけの穴」と「実装の穴」に機械で仕分ける**（`scripts/censusStubs.ts`・明細 `docs/_census_stubs.txt`／`npx tsx scripts/censusStubs.ts --id <STUB_ID>` で1件の完全内訳）。**「STUB＝未実装」ではない**（実装済みハンドラの表示名でもある）ので、**実装軸4本＝ハンドラ／engine 別経路／ペイロードキー／カード番号**をすべて見る。**A＝実装の穴（engine のどこにも消費が無い＝真no-op）が本命の worklist**（PLAN §6.4）。⚠**生成側（parser/manualEffects）と型宣言（`src/types/`）は「消費」ではない**。⚠`scripts/genStubsMd.mjs` の「フォールバック」欄は軸が1本なので仕分けに使えない。**ゲートは2本**＝①**2026-08-11〜** A群の🔴側（engine に消費が無く `DEFERRED_` でもない STUB）②🆕**2026-08-18〜** C群（逆翻訳に生の英語 ID が出る STUB）。どちらも0が正で、**増えたら exit 1** で止まる（`npm run gates` にも同梱）。①は実装するなら消費地点を書き、保留するなら id を `DEFERRED_*` にして理由を PLAN §6.4 に書く。②は**ハンドラ直前に `// <ID>: 日本語の説明`** を書いて `node scripts/genStubsMd.mjs`（ハンドラを持たない宣言型は `scripts/decompileEffects.ts` の `miscStubMap` に足す）→ ⚠**`npm run regen` まで回す**（計器は逆翻訳シートの実出力を読む）
- **`npx tsx scripts/syncManualLive.ts [--dry] <CardNum> ...`** — **`manualEffects.ts` の手修正を live へ届ける同期ツール**（2026-08-17新設）。`build:effects` の収穫マージは `parseStatus` が `MANUAL`／`PARTIAL` の効果を**不可侵**にするので、**既存 id を書き直しても live に届かない**（新しい id の追加だけは通る）＝`docs/_partial_fresh.json` に回るだけ。3セッション連続で同じ手当てをしたので道具にした。⚠**実行後は必ず `npm run gates`**（live を直接書くのでゲートだけが安全網）
- 🆕**`manualEffects.ts` のトップレベル効果は `parseStatus:'MANUAL'` か `'PARTIAL'` のみ**（2026-08-22・§6.4 O-40・`npm run gates` の `manual-fields` がゲート化＝AUTO を書くと exit 1）。**理由**＝`mergeManualEffects` は **`parseStatus` を見ず effectId 一致で常に manual 側を勝たせる**ので、`AUTO` と書いた手書きコピーは「parser が出したもの」に見えたまま**parser の最新出力を永久に上書きし続ける**（live も AUTO と記録されるのでどの計器からも区別できない）。⚠**ネストした能力（`GRANT_*` の `abilities[]`）は対象外**（parser も生成するため）。直し方＝①parser 出力と実体同一なら**削除して parser に任せる**（`npx tsx scripts/censusManualDrift.ts` の「削除候補」節が実体同一を機械列挙） ②意図的な上書きなら**`MANUAL` へ刻印を直す**（内容は変えない）。
- 🆕**収穫マージは effectId で突き合わせる**（2026-08-22・§6.4 O-39）＝**id 集合が live と fresh でズレたカードは `docs/_idset_fresh.json` に出る**。旧実装は**添字**で突き合わせて1つズレたらカード丸ごと温存し、**そのカードの AUTO 効果への parser 改善が `_held_fresh` にも `_partial_fresh` にも出ないまま永久に凍っていた**（実測46カード）。⚠**parser を直したのに live が変わらないときは、まずこの3ファイル（`_held_fresh` / `_partial_fresh` / `_idset_fresh`）を見る**。
- 🆕**`npm run census:enginetext`** — **engine 全文 regex センサス（2026-08-26新設・§5.3 `O-60`）＝「engine が `EffectText`/`BurstText` を regex で読んで意味を決めている箇所」**を全数で3分類する（`scripts/censusEngineText.ts`・明細 `docs/_census_enginetext.txt`）。**A🔴 SELF_TEXT＝効果元自身の全文で意味を決める（本命の worklist）／B OTHER_CARD＝他カードの属性判定（正当寄り）／C COMMENT**。**この形は JSON を見ても何が起きるか分からず、逆翻訳・census・golden・smoke・fuzz が全部緑のまま意味が壊れる。** ⚠**優先度は miss で読む**＝ハンドラ内の regex を live の該当カード原文に当てて**1本も当たらない**もの＝**いま既定値へ落ちている**。⚠**miss=0 は「正しい」ではない**（たまたま当たっているだけ）。**1ハンドラの完全内訳は `npx tsx scripts/censusEngineText.ts --id <ハンドラ>`**（原文と regex の当たり外れを全部出す）。🔴**ゲート（ratchet）＝A群の行数が増えたら exit 1・減っても exit 1**（払い戻したら `BASELINE_SELF_TEXT` を実測値へ下げる）。`npm run gates` に同梱。
- 🆕**`npm run census:orphanmanual`** — **live 限定 MANUAL スタンプの計器**（2026-08-28新設・§5.3 `O-133`）＝**`public/data/effects_*.json` の `parseStatus` が MANUAL/PARTIAL なのに `manualEffects.ts` に定義が無い**効果を全数列挙する（`scripts/censusOrphanManual.ts`・明細 `docs/_census_orphan_manual.txt`）。🔴**収穫マージは live の MANUAL/PARTIAL を効果単位で不可侵にする**ので、出所の無いスタンプは**parser の改善を永久に受け取れず、`_held_fresh` / `_partial_fresh` / `_idset_fresh` の どのバケツにも出ない**（＝第4の死角）。⚠**`census:manualDrift` とは向きが逆**（あちらは「manual にあるのに live へ届かない」側）。**4分類**＝**A 解凍候補**（live と fresh が実体同一 かつ **MANUAL**）／**B 要レビュー**（実体が違う・**PARTIAL は実体同一でもここ**）／**C fresh 無し**（parser が出さない id ＝**`manualEffects.ts` へ移す**。解凍すると効果ごと消える）／🆕**D 生成元あり**（`fixLrigColorFilters.mjs` が build 後に**毎回生成し直す** id ＝**凍っていない**。C と混ぜると存在しない作業を作る）。⚠**`--id` はカンマ区切り／分類名で複数出せる**＝**1起動で全カードを parse する（約40秒）ので1件ずつ起動しない**。**A は `--unfreeze A` で機械的に解凍できる**（`parseStatus` だけを AUTO へ。分類は実行時に測り直すので stale なリストで事故らない）。⚠**`PARTIAL` を解凍しない**＝あれは「別軸がまだ忠実でない」という**意図的なレビュー印**（golden が assert している効果がある）。⚠解凍すると census の **MANUAL 免除が外れて高シグナルが増える**＝**退化ではなく可視化**（実体は1バイトも変わらないことを A/B で必ず確かめる）。ゲートではない（exit 0）が、**件数のラチェットは golden にある**（`BASELINE_ORPHAN_MANUAL`・増えても減っても FAIL）。
- **`npm run census:wiring`** — **被覆マトリクス（2026-08-07新設）＝「TargetFilter の語彙は型にも engine にも実装済みなのに、parser の一部のビルダーからだけ合成されていない」配線漏れ**を (語彙キー × アクション入口) で機械検出（`docs/_census_wiring.txt`）。**セルを取るときは `npx tsx scripts/censusWiring.ts --cell <キー>:<入口ラベル>`**。★印＝同じ入口に配線済みの効果がある＝穴が明確＝最優先。`has=0` の語彙は自動で別枠（＝機構未実装＝PLAN §6.3）。ゲートではない（exit 0）🆕**2026-08-22＝盤面状態フィルタ9語彙（`hasCharm`/`hasAcce`/`infected`/`isFrozen`/`isUp`/`isDown` ＋ 別型の `isSelfCharmed`/`isSelfAcced`/`acceHost`）を追加**（それまで**追跡対象外**だった＝「census:wiring が0件だから穴はない」と読んではいけない）。⚠**状態語は「対象フィルタ／効果元の自己条件／装着ホスト参照」の3用法に分岐する**ので名詞句修飾に限定しないと誤検出する。⚠**この計器は `has===0` の語彙を表から捨てる**＝正規表現を絞りすぎると穴ごと消える。
- **engine / BattleScreen / decompiler を触ったら（C・D・Stage2）上記 smoke・golden・fuzz を必ず回す**（数秒）。バグを golden に1件足してから直すと回帰を防げる。
- **CI（`.github/workflows/ci.yml`）が push/PR(master) で typecheck・lint・golden・smoke・fuzz を自動実行**＝回し忘れても素通りしない。ローカルで先に回して緑にしてから push する。

## ドキュメント配置ルール
- **メモ・ノート・引き継ぎ（HANDOFF）・調査記録などの .md は必ず `docs/` にまとめる**。プロジェクトルートに散らばせない。
- ルート直下に置いてよいのは定位置が規約で決まっているものだけ：`CLAUDE.md` / `README.md` / `.github/pull_request_template.md`
- 現状の `docs/` の主要ファイル：
  - **`PLAN.md` — 開発計画の唯一の正（旧 P1_PLAN.md/ROADMAP.md/TODO.md を2026-07-03に統合）。🆕**2026-08-23 に全面再編**＝フェーズ軸（旧 §5/§6/§7）を廃して **§5 の単一キュー**へ統合し、**§2「作業の流れ」**と **§4「教訓集」**を新設。cold start は **§1 現在地 → §2 作業の流れ → §5 作業キュー** の順に読む。§1 進捗サマリと §6 恒久指標は**直近1件だけ**を置く入れ替え式**
  - **`PLAN_PROGRESS.md` — PLAN §1 から追い出した過去のセッション要約の倉庫（新しい順）。作業ごとに PLAN §1 の旧要約をここの先頭へ移す**
  - **`PLAN_DETAIL.md` — PLAN から追い出した消化済みバッチ・完了項目の詳細台帳（2026-07-07新設）。🆕**2026-08-23 以降は「PLAN に1行サマリを残す」もやめた＝クローズした項目は PLAN から消し、全文はここと BUGFIXES.md が正**（PLAN を「生きている worklist」だけに保つ）**。🆕**2026-08-17 続き539＝消化済みが溜まったら「ID と日付だけの索引」まで削ってよい**（§6.4 の「■ 消化済み」節21本＝6395文字を「整理㉖」へ退避した実績）
  - 🆕**PLAN §5.3 と §5.1 の使い分け＝§5.3 は「機構・基盤の worklist（`O-nn`）」、§5.1 は「実機で確かめる worklist（`V-nn`）」。⚠実機で確かめるだけの項目を §5.3 に書かない**＝機構を実装したら**観測点は §5.1 へ `V-<次番号>` で足す**。これを守らずに §6.4 の1セルへ書き足し続けた結果、旧 `O-13` が**8185文字・30ブロック**に肥大して §7 と二重の置き場になっていた（→ `V-28`〜`V-58` へ移設して解消）
  - **`DESIGN.md` — 設計方針・開発ルール（まずこれを読む）**
  - **`BUGFIXES.md` — バグ修正記録（新しいものを上に追記）**
  - **`BEHAVIOR_AUDIT.md` — 挙動トレース監査（原文照合の主軸）。engine実行結果（盤面差分＋ログ）を原文と目視照合。LLM不使用・決定論**
  - `SEMANTIC_AUDIT.md` — （旧・主軸から外した）LLM意味比較。補完的発見器として継続利用（worklistは PLAN.md §5.2）
  - `STUBS.md` — 全STUBの一覧と実装状況（`node scripts/genStubsMd.mjs` で再生成。手編集しない）
  - `TokenCallers.md` — トークン↔呼び出し元の対応表
  - `effects-json-guide.md` — effects JSONの表現語彙・ガイド
  - 🆕**`CODEX_GUIDE.md` — Codex CLI へ実装を委譲するときに Claude が指示書を書く前に必ず読む運用ガイド**（2026-08-24 に 172KB→50KB へ整理）。§1 役割分担／§2 起動方法（症状別の落とし穴表）／§3 投入前の実測／§4 指示書テンプレ／**§5 実績のあるガードレール59本**（6群に分類・`§5-nn` は BUGFIXES.md 等から多数参照されるので**採番を変えない**）／§6 報告フォーマット／§7 検証チェックリスト／§8 Codex の傾向
  - 🆕**`CODEX_LOG.md` — CODEX_GUIDE.md から追い出した歴史記録の倉庫**（2026-08-24新設）。§A 過去バッチ実績64件／§B 起動法の変遷（失効した手順を含む）／§C ガードレール事故台帳の全文（`#` は §5-nn と対応）。**参照は「ガイド→ここ」の一方向**＝新しい知見はガイドへ書き、古くなった記録をここへ移す
- 引き継ぎ（HANDOFF）は廃止。残作業・設計判断は `PLAN.md`、修正記録は `BUGFIXES.md` に集約する。

## 定型ワークフローはスキルで（2026-07-07新設）
`.claude/skills/` に定型作業のスキルがある。**該当作業はスキルの手順・ガードレールに従う**（散文の記憶に頼らない）：
- `/census-batch` — census 文型バッチ1巡（PLAN §5.4）（clusters選定→parser規則→build:effects→heldReview採用→ゲート→簿記。必須ガードレール込み）
- `/audit-card <CardNum>` — BEHAVIOR_AUDIT 1カード監査1巡（目視照合→3分類仕分け→修正→ゲート→簿記）
- `/baton` — セッション終了時のバトン簿記（PLAN §1 進捗サマリの入れ替え・PLAN_PROGRESS.md への退避）
