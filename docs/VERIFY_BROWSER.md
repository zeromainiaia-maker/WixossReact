# ブラウザ実機検証ハーネス（verify:browser）

`/verify`（実行時GUI観測）を**認証・Supabase 不要**でヘッドレス代替するための仕組み。
engine（`executeEffect`/`resume*`）＋トリガー収集配線（`triggerCollect`）を**実ブラウザ（Chromium）で**実盤面シナリオに対して駆動し、結果を可視化＋スクショ保存する。

## 使い方
```bash
npm run verify:browser   # dev起動→/verify.html を Chromium で開く→結果取得＋スクショ。exit 0=全PASS
```
- スクショ＝`scratchpad-verify/verify-harness.png`（gitignore 済み）。
- 手動で見る場合は `npm run dev` 後にブラウザで `http://localhost:5173/verify.html`。

## 構成
- `verify.html`（ルート・vite の追加エントリ）＋`src/verify/main.ts`（データfetch→盤面構築→engine駆動→DOM描画）。
- `scripts/verifyBrowser.mjs`（Playwright ドライバ：dev起動・遷移・`window.__verifyResults` 取得・スクショ・終了コード）。
- 盤面ビルダー/オートパイロットは `scripts/goldenTest.ts` を踏襲（同じ run ループ）。

## カバー範囲と限界
- ✅ **カバー**＝engine 実行＋pure なトリガー収集（`collectFieldTriggers` 等）を**ブラウザ runtime** で。BANISH シナリオは収集配線（アタック→any_opp 拾い上げ）も実行。
- ❌ **非カバー**＝`BattleScreen.tsx` の React state 密結合部（`doPhaseAdvance`・pending UI 解決ループ・CPU/realtime 同期）。ここは**ログイン（Supabase 認証）必須**でゲートされており、完全な実機検証には別途以下が要る：
  1. **検証専用 Supabase アカウント**（email/password を env に）＝ゲスト/匿名ログイン無しのため。
  2. **盤面注入フック**（`BattleScreen` に dev 限定で初期 PlayerState を流し込む口）＝特定盤面への決定的到達のため。
  3. 本ドライバ（Playwright）をログイン→CPU戦→注入→効果発火→スクショへ拡張。

現状ハーネスは上記 1・2 が無くても回せる範囲（engine＋収集配線）を実ブラウザで観測する。フル BattleScreen 検証は 1・2 整備後の follow-up。

## シナリオ（現状3件＝今セッション実装分）
1. `SIGNI_GRANT_CHOSEN_ABILITY`（WXK09-050）＝CHOOSE2択でバフ済み＜電機＞にダウン保護付与。
2. `BANISH_ATTACKER_IF_WEAKER_THAN_FRONT`（WD07-012）＝収集配線込み・正面より低パワーのアタッカーをバニッシュ。
3. `CONDITIONAL_GROW_AND_KEY_DISABLE`（WXK02-029）＝条件付きグロウ＋全キー能力喪失。

新シナリオは `src/verify/main.ts` の `scenario*()` を足すだけ（golden と同じ盤面ビルダー）。

---

# フル BattleScreen 実機 driver（verifyBattleDrive.mjs）

上記ハーネスの「非カバー」だった React state 密結合部（実ログイン→CPU戦→盤面注入→効果を**実 UI クリックで発火**→観測）を駆動する別ドライバ。`scripts/verifyBattleDrive.mjs`。**前掲の限界 1・2・3 はすべて達成済み。**

## 実行
```bash
npm run build                      # vite preview は dist/ 配信なので必ず先にビルド
node scripts/verifyBattleDrive.mjs # preview起動→claude1ログイン→CPU戦→PLAYING到達→盤面注入→召喚クリック列→スクショ
```
- 前提：`verify-accounts.json`（claude1/claude2・gitignore済）、`.env.local`（VITE_SUPABASE_URL / ANON_KEY）、デッキ「VERIFY_DECK」（無ければ `scripts/verifySetupDeck.mjs`）。
- ライブ Supabase に rooms/battle_states を作成・削除する（起動時に自分の残ルームを掃除）。数分かかる。
- スクショ＝`scratchpad-verify/inj-play-*.png` / `inj-99-final.png`、ログ各runは `scratchpad-verify/run*.log`。

## 仕組み
1. `startDev()`＝`npm run preview` を spawn（**dev の StrictMode 二重実行で gotoMatchmaking が消える問題を回避**するため本番ビルド配信）。
2. ログイン→オンライン対戦→VERIFY_DECK選択→CPU対戦→じゃんけん→ルリグ選択→マリガン→**PLAYING 到達**。
3. **盤面注入**＝`page.evaluate` で host_state を直接 PATCH（REST・ユーザートークン＝RLS下）。lrig / signi / temp_power_mods / hand / active_user_id / turn_phase を上書き。
4. **召喚クリック列**（下記）を `data-testid` ＋ role=button で安定駆動。

## ✅ 召喚クリック列の安定自動化＝完了（2026-06-30）
**WXK09-050 を実 UI で召喚→【出】CHOOSE①→＜電機＞シグニに「ダウンしない」付与まで完走**。盤面ログ「コードアート Ｒ・Ｍ・Ｎは対戦相手の効果によってダウンしない（ターン終了時まで）」で付与確認。**ピクセル座標依存は全廃。**

実機で確定したクリック列（run7）:
```
フェイズ進行 btn:メインフェイズへ → 手札 tid:my-hand-card-0 → btn:召喚
→ tid:summon-zone-1 → btn:対戦相手の効果によってダウンしない(CHOOSE①)
→ pick:pick-0(対象) → btn:決定 → ✓付与成功を盤面ログで確認→break
```

### 追加した安定セレクタ（React側・通常表示に影響なし）
| testid | 場所 | 注意 |
|---|---|---|
| `my/op-hand-card-{i}` | `BoardComponents.tsx` HandCards | faceDownで自他を区別（相手の裏向き手札も同コンポ＝同testid衝突を回避） |
| `summon-zone-{zi}` | `BattleScreen.tsx` 召喚ゾーン選択ボタン | 占有ゾーンは `disabled`→driverは `isEnabled` で飛ばす（disabled click はタイムアウトする） |
| `pick-{candIdx}` | `BattleScreen.tsx` SELECT_TARGET ピッカー候補 | 選択可能候補のみ付与 |
| `my/op-signi-zone-{rawIdx}` | `BoardComponents.tsx` PlayerField | 盤面シグニ直接クリック用（今回のSELECT_TARGETはピッカー経由なので未使用だが汎用） |

### driver の肝（ハマりどころ）
1. **注入直後はグロウフェイズに戻る競合**（ターン遷移のリアルタイム処理が turn_phase:MAIN を上書き）。→ 手札を開く前に「メインフェイズへ」を最大5回試して **MAIN に確定**させる。
2. **「召喚」はボタン限定で取る**（`getByText('召喚')` だとゾーン選択見出し「**召喚**先のゾーンを選択」に誤マッチして無限ループ）。`getByRole('button',{name:'召喚',exact:true})`。
3. **CHOOSE選択肢もボタン限定**（盤面ログ「…ダウンしない（ターン終了時まで）」への誤マッチ防止）。
4. **ルリグ リミット**：Lv2ルリグ(Limit4)＋既存Lv4シグニ では Lv2召喚が `4+2=6 > 4` で**召喚ボタンが出ない**。注入ルリグを **Lv3 WXK09-018(Limit6)** にして解決（効果対象の＜電機＞WD03-009 Lv4 は power>5000 が必要なので残す）。

## ✅ C2 実機検証 完全クローズ（2026-06-30）
**[[project_effects_verification]] の C2 実機検証を3効果すべて実 UI 発火→観測で完了。** driver は**シナリオ切替式に一般化済み**。

### driver の使い方（一般化後）
```bash
npm run build                              # vite preview は dist/ 配信なので必ず先にビルド
node scripts/verifyBattleDrive.mjs         # 既定の3シナリオを順に実行（wxk09050→wxk02029→wd07012）
node scripts/verifyBattleDrive.mjs wd07012 # 指定シナリオのみ
```
ログイン→PLAYING 到達は**一度だけ**行い、同一 PLAYING ルームへ「盤面注入＋クリック列」をシナリオ単位で適用する。各シナリオは `scenarios` テーブルの `{ title, spec, drive }`：
- `spec.hostSet`/`guestSet`＝ドットパス→値で host_state/guest_state にマージ（例 `'field.signi':[['WD07-012#1'],...]`）。
- `spec.top.active`＝`'host'`（自分ターン）/`'cpu'`（CPUターン＝相手アタック誘発用）。`spec.top.turn_phase` で注入後フェイズ。
- `drive(page, H)`＝クリック列＋観測。`H.findLog(re)` で**実エンジンログ**（CHOOSE選択肢ラベルではなく）を assert する。新シナリオはここに1件足すだけ。

### 検証した効果（生STUB 3＋C1 timing 横展開）
1. `wxk09050`（WXK09-050）＝【出】CHOOSE①でバフ済み＜電機＞に「ダウンしない」付与。ログ「ダウンしない（ターン終了時まで）」。
2. `wxk02029`（WXK02-029 ビカム・ユー）＝アーツをルリグデッキから使用→CHOOSE①＝条件付きグロウ＋全キー能力喪失。ログ「グロウ条件成立（自Lv2≤相手Lv3）→…にグロウ…すべてのキーは能力を失う」。
3. `wd07012`（WD07-012 ヴィマナ）＝CPUターン・ATTACK_SIGNI を注入し**CPUに自動アタックさせ**、自場の WD07-012【自】ON_ATTACK_SIGNI(any_opp) でアタッカーをバニッシュ。ログ「小剣 ククリをバニッシュ（正面より低パワー）」。
4. `lriggrow`（WXDi-P03-039 幻獣神 コッコ・ルピコ）＝**C1 timing `ON_LRIG_GROW` の実機検証**。`free_grow_this_turn` でグロウコスト0化→通常グロウUI（グロウ→グロウ先）→`executeGrow`→`collectLrigGrowTriggers` が watcher を発火→OPTIONAL_COST《無》を払って相手シグニをバニッシュ。ログ「小剣 ククリをバニッシュ」。
5. `coinpaid`（WXDi-P15-069 コードライド レイラ//THE DOOR）＝**C1 timing `ON_COIN_PAID` の実機検証**。コイン支払いの最簡経路＝コインGrowCostのグロウ（WX17-001 Lv4 カーニバル→WXK03-002 Lv5・GrowCost《コイン》×1）。`executeGrow` の `growCoinPaidEntries`→`collectCoinPaidTriggers` が watcher を発火→（発動順序確定→対象選択）→自身パワー+2000。ログ「パワー+2000」。
6. `deckshuffle`（PR-470A 現実からの逃避 タマ）＝**C1 timing `ON_DECK_SHUFFLED` の実機検証**。シャッフル源＝**シグニ【出】**（WX12-Re20 ベルフェーゴ＝デッキから＜悪魔＞を探してトラッシュ→デッキをシャッフル）を召喚で発火。`resolveStackNext` 中央 diff（`deck_shuffled_count` before/after）→`collectDeckShuffledTriggers`→watcher 自身+5000。ログ「パワー+5000」。**＝C1 配線の C2 横展開は3 timing で確立**。
   - **🔎 知見＝シャッフル源で発火が分かれる**：シグニ【出】（**スタック解決経路**）＝発火する。一方 **スペル（SEARCHER）経路＝発火しない**（カットイン応答待ちを挟んで解決し watcher が +5000 されなかった）。中央 diff はスタック解決のシャッフルは捉えるが**スペル解決経路のシャッフルを観測できていない**＝engine 実機配線の要調査点（collector は golden 緑）。

> グロウ系シナリオの肝＝**フェイズドリフト対策**：注入後の数秒で `turn_phase` が GROW→MAIN に流れ「グロウ」ボタン（`turn_phase==='GROW'` 限定表示）が消えるレースがある。`H.openGrow(candidateRe)` が **GROW フェイズを再 PATCH しながらグロウ→グロウ先候補クリックを最大5回リトライ**して安定化する（`H.repatchTop` でトップレベル列を再注入）。

### ✅ ON_DECK_SHUFFLED のシャッフル源依存＝スペル経路も実 UI 確認完了（2026-07-07再実行）
`deckshuffle` は**シグニ【出】源（WX12-Re20 ベルフェーゴ）では PASS**＝既定スイートで検証済み（スタック解決経路＝中央 diff `resolveStackNext`/`BattleScreen.tsx:4767` を通る）。**スペル源（SEARCHER WX02-060）はカットイン解決経路（`handleCutinPass`）/ pending 効果 resume（`handleEffectInteraction`）で解決され、これらは中央 diff を通らないため ON_DECK_SHUFFLED が未発火**だった。

**投入した修正**＝`collectDeckShuffleInline`（共有ヘルパー）を新設し、`handleCutinPass` と `handleEffectInteraction` の done 分岐に ON_DECK_SHUFFLED 検出を追加（既存の ON_PLAY/ON_BANISH 検出と同型・`bs.host_state` vs after の deck_shuffled_count 比較）。
- **engine 層は検証済**＝診断スクリプト（`_diagShuffle.ts`・実行後削除）で SEARCHER の afterSearch が deck_shuffled_count を 0→1 にし、`detectDeckShuffled`=true、`collectDeckShuffledTriggers` が PR-470A を返すことを確認。
- **回帰緑**＝修正投入後に typecheck・golden 95・smoke 全0・fuzz 全0（診断ログ追加前の状態で確認済。診断ログは撤去済＝同一状態）。
- **✅スペル経路の実 UI 確認も完了（2026-07-07・Sonnet follow-up 実行）**＝`node scripts/verifyBattleDrive.mjs deckshufflespell` 再実行で **PASS**（ログ「スペル経路 ON_DECK_SHUFFLED 発火→PR-470A#1 に +5000 反映確認（temp_power_mods・shuffled=1）」）。SEARCHER 発動→ピッカー選択→対象決定の経路で `handleEffectInteraction` 側の検出が機能することを確認。前回の非決定性（診断ログ非表示）は再発せず、`order` 配列（既定実行対象）に含まれる現状のままで安定 PASS。follow-up クローズ。

### このセッションで足した安定セレクタ（通常表示に影響なし）
| testid | 場所 | 用途 |
|---|---|---|
| `my-lrig-dk` | `BoardComponents.tsx` Stat（自分のルリグDKバッジ） | ルリグデッキ ZoneCardModal を開く（相手の同名バッジは非クリックなので testid で自分側を確定） |
| `zone-card-{i}` | `BoardComponents.tsx` ZoneCardModal | ゾーン一覧（ルリグデッキ等）内のカードを開く＝アーツ「使用」へ |
| `optcost-energy-{i}` / `optcost-pay` / `optcost-skip` | `BattleScreen.tsx` OPTIONAL_COST モーダル | 任意コスト（CHOOSE pay/skip）のエナ選択・支払う・スキップ。グロウ等で発火する任意コスト【自】の駆動に汎用 |
| `spellcost-energy-{i}` | `BattleScreen.tsx` スペルコスト選択モーダル | スペル発動（`pendingSpellCast`）のエナ選択。「発動する」は exact 一致で取る（CardModal の「発動」と区別） |

> グロウは `free_grow_this_turn:true` を注入するとコスト0化でき、`btn:グロウ`→グロウ先（カード名で取得）の2クリックで `executeGrow` に到達できる（コイン/エナ選択を回避）。コスト系トリガー（ON_LRIG_GROW/ON_COIN_PAID 等）の C2 検証に有用。

### 併せて直した潜在バグ（盤面直接注入のロード漏れ）
`BattleScreen.tsx` の `battleCardNums` が `field.signi`/`check`/`key_piece`/`charms` 等を **instanceId（`CardNum#N`）のまま** Set に入れていたため、base CardNum でフィルタする `battleCardMap` に載らなかった（通常は deck/hand 経由で base が載るので顕在化しなかったが、**デッキ外カードを盤面へ直接注入すると未ロード→パワー0扱いでバニッシュ**された）。これらを `getCardNum` で base 化して登録するよう修正。効果生成シグニのロードも確実になる。回帰：typecheck/golden 95/golden 0FAIL・smoke 全0・fuzz 全0。

### ✅ ON_SIGNI_POWER_ZERO_OR_LESS（R37・§7）の実機検証を追加（2026-07-07・続き39・Sonnet 5）
`powerzero`（WD11-013→WX21-067）を新設。ホスト場の WX21-067（アイン＝テトロド・【自】《ターン1回》対戦相手のシグニのパワーが0以下になったとき1枚ドロー）を待機させ、WD11-013（【出】・mandatory・コストなし・対戦相手シグニ1体を-1000）を召喚→SELECT_TARGETでpower1000の相手シグニ（WX01-083）を指定→-1000到達→クライアント側の `checkAndBanishPowerZero`（useEffect常時監視）がバニッシュ＋`collectPowerZeroTriggers` を発火。**単体実行でPASS**（盤面ログに「1枚ドロー／[自分] アイン＝テトロドの【自】効果（パワー0以下時）」と明記＝R37の①「相手シグニ0化で発火」を実機確認）。

**⚠試行錯誤の教訓（カード選定）**＝(1) 最初に候補にした WD22-037-UG（死之遊魔 †ルーレット†・-12000）は「シグニの効果によってこのシグニが場に出た場合」限定の裏面UG型カードで、**通常召喚ボタン自体がUIに出ない**（手動召喚不可の特殊カード種別）。(2) 次点候補 WD11-013 も「ミュウ限定」（Team制限）で、センタールリグがミュウでないと同様に召喚ボタンが出ないと判明＝**Team制限は実際に summon UI をゲートする**（従来「デッキ構築時の制約のみで実戦には影響しない」という想定は誤りだった＝センタールリグをミュウの WX08-004 に変更して解決）。今後 verifyBattleDrive 用にカードを選ぶ際は、Team欄が「-」の無制限カードを優先するか、制限に合わせたLrigを注入すること。

**⚠バッチ実行時のみのFAILを観測**＝13シナリオ一括実行では `lrigundermoved`・`keywordgained`・`powerzero` の3件がFAIL（banishbyeffect以降の「自分ターン系」末尾に連鎖）。個別再実行（`node scripts/verifyBattleDrive.mjs lrigundermoved keywordgained` および `powerzero` 単体）では**全てPASS**＝3件とも実装は正しく、**既存コードに既に注釈されていた「バッチ実行時のみの状態汚染」**（`game_logs` クリアだけでは防げないclient側の残留モーダル/state）が今回さらに後続シナリオへ連鎖することを確認。根本修正は別途follow-up（driver側のテスト分離強化が必要・カード/engineのバグではない）。

### ✅ ON_SIGNI_FROZEN（R38・§7）resume経路取りこぼしを修正・実機PASS（2026-07-07・続き41・Opus 4.8）
続き40（下記）で発見した R38 実バグを修正。`handleEffectInteraction` の pendingEntries ブロックに、既存の resume-経路取りこぼし対策 inline collector（`collectDeckShuffleInline`／`collectBanishOppByEffectInline`／`collectLrigUnderMovedInline`／`collectKeywordGainedInline`）と同型の **`collectFreezeInline`** を追加配線（`detectNewlyFrozen`→`collectFreezeTriggers`→once_per_turn の `actions_done` 反映）。`node scripts/verifyBattleDrive.mjs freezetrigger` が **PASS**（`freeze=true watcher=true`・`guest.signiFrozen=[true,false,false]`・「羅菌 プランクトンの【自】効果（凍結時）」→「小剣 ククリのパワー-1000」を実UIで確認）。golden 151/0・smoke 全0・fuzz 全0・typecheck 緑。driver 側の pass 条件も凍結の ground-truth（`guest.signiFrozen`）+watcher ログへ変更し `order` に復帰。以下は発見時の記録（続き40）。

### ⚠ ON_SIGNI_FROZEN（R38・§7）の実機検証で resume 経路の取りこぼしを発見（2026-07-07・続き40・Sonnet 5）
`freezetrigger`（WX01-081→WXDi-P04-065）を新設し実機検証した結果、**❌FAIL＝実バグを確認**（→続き41で修正済み・上記）。

- 盤面：host に watcher WXDi-P04-065（羅菌 プランクトン・ON_SIGNI_FROZEN・any_opp・targetsTriggerSource で凍結された相手シグニに-1000）を配置、center lrig を WD03-003（コード・ピルルク・Ｍ＝WX01-081「ピルルク限定」を満たす）に設定。手札の WX01-081（コードアート Ｔ・Ｖ・【出】ON_PLAY・mandatory・コストなしで相手シグニ1体を凍結）を召喚→SELECT_TARGETで相手シグニ（WD01-013）を指定。
- **ground truth は正しい**＝`guest.field.signi_frozen` が `[true,false,false]` に変化＝FREEZE自体はengine内で正しく適用されている。
- **しかしwatcherが一度も発火しない**＝盤面ログに「羅菌 プランクトンの【自】効果（凍結時）」が一切出ない。`effect_stack` は終始0のまま＝この解決は`resolveStackNext`（中央diffの置き場所）を一切通らず、`handleEffectInteraction`（SELECT_TARGET resume）だけで完結していた。
- **原因**＝`collectFreezeTriggers`/`detectNewlyFrozen`の呼び出しは`BattleScreen.tsx:3798`（`resolveStackNext`内の中央diffブロック）の1箇所のみ。同ブロックにある他の収集（mill/refresh/energy-to-trash等）と同じ場所にしかない。一方`handleEffectInteraction`（4386-4408行）には`collectDeckShuffleInline`／`collectBanishOppByEffectInline`／`collectLrigUnderMovedInline`／`collectKeywordGainedInline`という「resume 経路の取りこぼし対策」inline collectorが既に4つ実装されているが、**ON_SIGNI_FROZEN用だけこのリストに入っていない**＝機構修正の抜け。
- **影響範囲**＝FREEZE を付与するカードの大半はSELECT_TARGETで単体対象を選ぶ形（ALL対象などの例外を除く）＝resume経路を通るのが通常ケース。つまりWX08-039/WXEX2-02/WXDi-P04-065のwatcherは実戦でもほぼ発火しないと推定される。
- **再現**：`node scripts/verifyBattleDrive.mjs freezetrigger`（既定 `order` からは除外済み＝既存スイートの全緑を壊さないため。修正後に単体実行で再検証してから戻す）。
- **修正方針**（未着手・Opus担当＝PLAN.md §6.3参照）：`collectKeywordGainedInline`等と同型の`collectFreezeInline`を`handleEffectInteraction`に追加するだけの横展開で直る見込み（新規機構ではなく既存パターンの適用漏れ）。

### ⚠ ON_OPP_POWER_DECREASED（R46・§7）の実機検証で resume 経路の取りこぼしを発見（2026-07-09・続き58・Sonnet 5）
`oppPowerDecreased`（WD11-013→WX13-036）を新設し実機検証した結果、**❌FAIL＝実バグを確認**（ON_SIGNI_FROZEN・R38・続き40と同型・未修正）。

- 盤面：host に watcher WX13-036（フィア＝パトラ・ON_OPP_POWER_DECREASED・`deltaFromOppPowerDecrease`＝相手パワーが減った値と同じだけ自身+）を配置、center lrig を WX08-004（ミュウ＝WD11-013「ミュウ限定」を満たす・`powerzero`シナリオと同構成）。手札の WD11-013（【出】ON_PLAY・mandatory・コストなしで相手シグニ1体に-1000）を召喚→SELECT_TARGETで相手シグニ（WX01-083）を指定。
- **ground truth は正しい**＝`guest.temp_power_mods` が `WX01-083#1:-1000` になる＝POWER_MODIFY自体はengine内で正しく適用されている。
- **しかしwatcherが一度も発火しない**＝`host.temp_power_mods` は終始 `[]`。`effect_stack` は終始0のまま＝この解決は`resolveStackNext`（中央diffの置き場所）を一切通らず、`handleEffectInteraction`（SELECT_TARGET resume）だけで完結していた。
- **原因**＝`collectPowerDecreaseTriggers`（`src/engine/triggerCollect.ts:900`）の呼び出しは`BattleScreen.tsx:3765-3789`（`resolveStackNext`内の中央diffブロック）の1箇所のみ。一方`handleEffectInteraction`（4384-4436行）には`collectDeckShuffleInline`／`collectBanishOppByEffectInline`／`collectLrigUnderMovedInline`／`collectKeywordGainedInline`／`collectFreezeInline`という「resume 経路の取りこぼし対策」inline collectorが既に5つ実装されているが、**ON_OPP_POWER_DECREASED用だけこのリストに入っていない**＝R38と同じ機構修正の抜け。
- **影響範囲**＝WD11-013のように単体対象へのPOWER_MODIFYはSELECT_TARGETで完結しresume経路を通るのが通常ケース＝WX13-036/WXEX2-52のwatcherは実戦でもほぼ発火しないと推定される。
- **再現**：`node scripts/verifyBattleDrive.mjs oppPowerDecreased`（既定 `order` からは除外済み＝既存スイートの全緑を壊さないため。修正後に単体実行で再検証してから戻す）。
- **修正方針**（未着手・Opus担当＝PLAN.md §6.3参照）：`collectFreezeInline`等と同型の`collectPowerDecreaseInline`を`handleEffectInteraction`に追加するだけの横展開で直る見込み（新規機構ではなく既存パターンの適用漏れ）。

### 運用メモ
- 触ったら `npm run typecheck` ＋（engine/BattleScreen を変えたら）`npm run smoke/golden/fuzz`。実機 driver は `npm run build` してから `node scripts/verifyBattleDrive.mjs`。
- スクショは `scratchpad-verify/{シナリオid}-inj.png` / `-final.png` と各手 `{id}-{n}.png`。
- ⚠一括実行（引数なし）は末尾の一部シナリオでバッチ限定の状態汚染が起き得る＝FAILが出たら該当シナリオを単体（`node scripts/verifyBattleDrive.mjs <id>`）で再実行して切り分けること。
