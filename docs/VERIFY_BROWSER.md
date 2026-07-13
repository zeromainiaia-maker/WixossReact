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
node scripts/verifyBattleDrive.mjs           # build要否を自動判定→preview起動→ログイン→（ルーム再利用 or CPU戦セットアップ）→盤面注入→クリック列
node scripts/verifyBattleDrive.mjs <id...>   # 指定シナリオのみ（デバッグ時はこちら＝スクショ全保存）
```
- 前提：`verify-accounts.json`（claude1/claude2・gitignore済）、`.env.local`（VITE_SUPABASE_URL / ANON_KEY）、デッキ「VERIFY_DECK」（無ければ `scripts/verifySetupDeck.mjs`）。
- ライブ Supabase に rooms/battle_states を作成・削除する。
- スクショ＝`scratchpad-verify/<id>-*.png`、ログ各runは `scratchpad-verify/run*.log`。
- env スイッチ：`FRESH=1`（ルーム再利用せず新規作成）・`SKIP_BUILD=0/1`（build 強制/強制スキップ）・`SHOTS=1/0`（スクショ強制ON/OFF）。

## ⚡ 高速化＋シナリオ作成の型（2026-07-14・Fable 5）

Sonnet の実機検証 methodology メモ（続き112-113・「1試行15〜40秒＋毎回ビルドとセットアップ」が重い）への回答として driver インフラを改修。**既存シナリオのクリック列・判定は無改変**。

### 毎試行の固定費を削る（debug イテレーション ≈「login＋drive」だけに）
1. **build 自動スキップ**＝`dist/index.html` と `src/`・`public/`・設定類の mtime 比較で、無変更なら build（数十秒）を省略。シナリオ追加は `scripts/` のみの変更なので build は走らない。「古い dist を検証する罠」は mtime 判定で構造的に消えた＝旧手順の「必ず先に `npm run build`」は不要。
2. **PLAYING ルーム再利用**＝健全な既存ルーム（host/guest とも life≥4・deck≥10）が残っていればマッチング→じゃんけん→ルリグ選択→マリガン（30〜60秒）をスキップしてシナリオ注入へ直行。消耗ルームは自動破棄→新規作成（自己回復）。**不可解な FAIL はまず `FRESH=1` で再実行して切り分ける**（バッチ限定の状態汚染の切り分けにも使える）。
3. **バッチ実行はスクショ省略**＝引数なし全件回帰では `page.screenshot` を no-op 化（`-final` のみ保存）。明示指定シナリオは従来どおり全ステップ保存。
4. **所要秒の計測**＝結果行とサマリに `(NNs)` を出力＝重いシナリオの特定・改善効果の計測用。

### preflight 静的チェック（実行前0秒で定番FAILを警告）
ブラウザ起動前に CardData CSV（Level/Limit/Team/Restriction）を読み、spec だけで機械判定できる罠を `⚠ preflight[id]:` で警告する（実行は止めない。discard コスト用など召喚しない手札カードには当てはまらないことがある＝召喚シナリオでのみ効く警告）：
- handPrepend のシグニ Lv > センタールリグ Lv（召喚ボタンが出ない）／場Lv合計＋召喚Lv > Limit
- Team ≠ `-` でルリグの CardClass と不一致（Team は summon UI を実際にゲートする＝powerzero の教訓）
- Restriction「○○限定」でルリグ不一致の可能性
- `field.lrig` 未設定のまま handPrepend にシグニ（初期 Lv0 ルリグ＝召喚不可＝handDiscard の教訓）
- 空きシグニゾーン2以上（SELECT_SIGNI_ZONE「ゾーンN」クリックが要る＝craftTokenPlace の教訓）

### 新規シナリオ用ヘルパー（生ロケータ直書きの置き換え・既存シナリオは触らない）
| ヘルパー | 用途 | 封じる罠 |
|---|---|---|
| `H.clickBtn(name, {exact, nth})` | isEnabled 検査つきボタンクリック。失敗理由をログに出す | disabled の空押し／`.catch(()=>{})` の握りつぶしで「クリックした風」になる |
| `H.clickModalImage(alt)` | `img[alt=カード名]` を `.last()` で狙う | 常設手札ストリップの同名 img 誤クリック→キャンセル誘発（craftTokenPlace で5試行を溶かした罠） |
| `H.stdStep(labels?)` | 定石チェーン1手＝発動順序確定→pick-0（「決定(1/N)」ready時は押さない）→汎用確定 | シナリオ間コピペの差分バグ |

**新規シナリオの型**＝カード固有のクリック（召喚・アーツ・【起】等）だけを `if (!did)` チェーンに書き、`if (!did) did = await H.stdStep();` で締める。判定は `H.findLog`（実エンジンログ）か `H.queryState`（ground truth）で行う。

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
node scripts/verifyBattleDrive.mjs         # 既定シナリオを順に実行（build 要否は自動判定）
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

### ⚠ ON_ENERGY_TO_TRASH（R43・§7）で同型を確認＝2件連続で系統的懸念に格上げ（2026-07-09・続き58・Sonnet 5・同日第2件）
`energyToTrash`（WD15-014→WD15-015）を新設し実機検証した結果、**❌FAIL＝上記ON_OPP_POWER_DECREASEDと完全に同型の実バグを確認**（未修正）。同日2件連続で同根のバグが出たため、個別カード対応ではなく機構単位の懸念として扱う。

- 盤面：host に watcher WD15-015（幻竜 アメリカワニ・ON_ENERGY_TO_TRASH・「あなたの効果で対戦相手のエナがトラッシュに置かれたとき【ダブルクラッシュ】」）を配置、center lrig を WX04-002（遊月・四戎＝ユヅキ・WD15-014「ユヅキ限定」を満たす）。手札の WD15-014（【出】ON_PLAY・mandatory・コストなしで相手エナ1枚をトラッシュ）を召喚→SELECT_TARGETで相手エナ（WD01-013）を指定。
- **ground truth は正しい**＝`guest.trash` が0→1に増える＝TRASH自体はengine内で正しく適用されている。
- **しかしwatcherが一度も発火しない**＝`host.keywordGrants` は終始 `[]`。`effect_stack` は終始0のまま＝この解決も`resolveStackNext`を一切通らず`handleEffectInteraction`（SELECT_TARGET resume）だけで完結していた。
- **原因**＝`collectEnergyToTrashTriggers`（`src/engine/triggerCollect.ts:808`）も`collectPowerDecreaseTriggers`と同じく`BattleScreen.tsx:3717-3739`（中央diffブロック）にしか配線されておらず、resumeの5種inline collectorには入っていない。
- **🆕 系統的懸念**＝2件連続で同根と判明したため、`BattleScreen.tsx`中央diffブロック（3559-4150行付近）にある他のcollector（`collectMillTriggers`/`collectCharmToTrashTriggers`＝**R42と同一対象**/`collectRefreshTriggers`/`collectMoveToDeckTriggers`/`collectDrawTriggers`系/`collectAllyPlayOrOppDiscardTriggers`/`collectMaterialUsedOnSigniTriggers`/`collectOppArtsUseTriggers`系）も同型の抜けが無いか横断監査すべき（未実機検証・静的解析のみでの示唆）。
- **再現**：`node scripts/verifyBattleDrive.mjs energyToTrash`（既定 `order` からは除外済み）。
- **修正方針**（未着手・Opus担当＝PLAN.md §6.3参照）：`collectPowerDecreaseInline`と合わせて`collectEnergyToTrashInline`を追加。その後、系統的懸念リストの横断監査→影響ありなら一括是正。

### ✅ placedFront（R41）＋drawBySourceStory（R31）をPASSで確認＝resume経路取りこぼしの機構原因をコード読解で確定（2026-07-09・続き58・Sonnet 5・同日第3-4件）

上記2件のFAIL（R43/R46）に続き、`placedFront`（WD01-013→WXDi-P03-043）と`drawBySourceStory`（WX20-026自己完結）を追加検証したところ**両方ともPASS**。この違いを手がかりに`BattleScreen.tsx:3428`の`resolveStackNext`本体を実際に読んで、なぜ一部だけ穴があるのかを機構レベルで確定できた。

- **placedFront**：guest中央ゾーンに watcher WXDi-P03-043 を配置、host が自分の通常召喚（`handleSummonSigni`）で中央ゾーンへ召喚（正面はindex i↔2-iのミラー対応）。**PASS**＝召喚直後に`host.temp_power_mods`が`WD01-013#1:-3000`になる。
- **drawBySourceStory**：host に WX20-026（大幻蟲 §アノマリス§）を配置しATTACK_SIGNIへ注入。「アタック」→E1/E2（同一カードの2つのON_ATTACK_SIGNIトリガー）の発動順序確定モーダル→E2のDRAW実行→E3（ON_DRAW・drawBySourceStory:'凶蟲'）がSELECT_TARGETで発火。**PASS**＝ログに「大幻蟲　§アノマリス§ の【自】効果（ドロー時）」を確認。
- **🆕 機構原因の確定**＝`resolveStackNext`は`executeEffect`の戻り値`result.done`で分岐（3538行）。`done===true`の場合のみ3556-4150行のtrigger収集ブロックが走り、`done===false`（SELECT_TARGET/CHOOSEで中断）の場合は`pending_effect`を保存して即returnし収集ブロックは実行されない。**「watcher収集がこのdoneブランチにしかなく、かつ原因アクション自体がSELECT_TARGET/CHOOSEを要する」の2条件が揃うtrigger種別だけがこの穴の影響を受ける**＝R43/R46は該当（原因のPOWER_MODIFY/TRASHが単体対象選択を要する）、R41は`handleSummonSigni`がresolveStackNextを経由しない別経路のため無関係、R31は原因のDRAWが対象選択不要なため無関係。
- **副産物**＝①ON_PLAY/ON_BANISH/ON_ATTACK_SIGNI/ON_BLOOM共有ループの盤面ログ文言が「相手シグニアタック時」固定になる表示バグ（機能に影響なし）。②同一カードに2つのON_ATTACK_SIGNIトリガーがあると「発動順序を決めてください」モーダルが挟まる（driverのクリック列に`発動順序を確定`を追加して対応）。
- 両シナリオとも`order`配列に復帰済み。
- **今後の活用**＝この理論で影響範囲を機械的に絞り込める＝残る系統的懸念候補（`collectCharmToTrashTriggers`=R42・`collectRefreshTriggers`・`collectMoveToDeckTriggers`・`collectMillTriggers`・`collectAllyPlayOrOppDiscardTriggers`・`collectMaterialUsedOnSigniTriggers`・`collectOppArtsUseTriggers`系）は原因アクションがSELECT_TARGET/CHOOSEを要するか個別確認すれば影響有無が判定できる。

### ⚠ outsideDrawPhase（R39）で理論の反例＝精緻化（2026-07-09・続き58・Sonnet 5・同日第5件）

上記理論（「原因アクション自体が対象選択を要するか」）の検証として`outsideDrawPhase`（WXDi-D09-P19自己完結）を追加したところ、**❌FAIL＝理論の反例が出現**＝R31（drawBySourceStory）と**全く同じ`collectDrawTriggers`**なのに今回は無発火。

- **盤面**：host に WXDi-D09-P19（蒼天 アウドムラ）を配置しMAIN注入。「アタックフェイズへ」でON_ATTACK_PHASE_START発火→E2「【自】あなたのアタックフェイズ開始時：手札を1枚トラッシュに置く。そうした場合、カードを1枚引く」（`SEQUENCE[TRASH(手札1枚選択), CONDITIONAL→DRAW]`）が実行→E1「【自】ドローフェイズ以外であなたがカードを１枚引いたとき：全シグニ+1000」（`ON_DRAW`・`outsideDrawPhase:true`）が反応するはず。
- **結果＝FAIL**：`host.hand`は5→（一時4）→5と正常にTRASH+DRAWが完了した（ground truthは正しい）が、E1の`+1000`は一度も適用されなかった。
- **🆕 理論を精緻化**＝R31の原因アクション（単純DRAW）は対話不要でそのまま`done=true`。対してR39の原因アクション（`SEQUENCE`内にTRASHという対話ステップを含む）はSEQUENCE先頭のTRASHで一旦中断する。**つまり真の分岐条件は「原因アクション自体が対象選択を要するか」ではなく『そのstack entryの解決中に（SEQUENCE内のどのステップであれ）一度でも対話が挟まったか』**＝同一collectorでもカードのSEQUENCE構造次第で結果が変わる。
- `order`配列からは除外（FAIL）。
- **修正方針への示唆**＝この反例により、`collectFreezeInline`型の個別inline collector追加という対症療法はSEQUENCE構造次第で同じcollectorが再FAILしうる（本件が実例）ため不十分と判明＝根本修正（`result.done`に関わらず両経路から共通で呼べる収集関数への統合）を優先すべき。

### ✅ ON_LEAVE_FIELD leftToZone（R45③）をPASSで確認＝対話ありでも問題ない対照実験（2026-07-09・続き58・Sonnet 5・同日第6件）

`leaveFieldToHand`（WX21-057→WXK02-041）を追加検証したところ**PASS**。ON_LEAVE_FIELDは既に`resolveStackNext`中央diff（3616行）と`handleEffectInteraction`resume（4395行）の両方に配線済み（§6.3「対策済み9種」の1つ）のため、原因アクション（BOUNCE・SELECT_TARGET対話あり）に関わらず正常に発火することを確認した。watcher WXK02-041（讃の遊 オエカキボード）をzone0、原因カードWX21-057（小罠 ツララ）をsummon-zone-1へ配置しBOUNCE対象をpick-1（自分自身）に選択→ログ「讃の遊　オエカキボード の【自】効果（味方が場を離れたとき）」を確認。`order`配列に復帰済み。

### ✅ opp-draw（R40）をPASSで確認＝対戦相手が効果で引いたときの反応系watcherも問題なし（2026-07-09・続き60・Sonnet 5）

`oppDraw`（WXDi-P15-091→WX12-047）を新設し実機検証したところ**PASS**。host に watcher WXDi-P15-091（羅石　ラブラドライト・ON_DRAW・triggerScope:any_opp・《ターン1回》対戦相手が効果でカードを引いたとき自分も1枚引く）を配置、guest（CPU）に WX12-047（幻水　ヤリイカ・【自】このシグニがアタックしたとき条件なしでカードを1枚引く）を配置し、CPU自動アタック（`wd07012`と同型・クリック不要）で発火させた。

- **ground truth も watcher も両方確認**＝ログ「[相手] 幻水　ヤリイカ の【自】効果（シグニアタック時）」→「1枚ドロー」（guest自身の効果ドロー）→「[自分] 羅石　ラブラドライト の【自】効果（対戦相手ドロー時）」→「1枚ドロー」（host側watcherのドロー）。`hHand` が5→6に増加。2回連続PASSで安定。
- **機構的にR31(drawBySourceStory)と同型**＝原因アクション（WX12-047のDRAW）はSELECT_TARGET等の対話を要さないため`resolveStackNext`の`done`ブランチで`collectOppDrawTriggers`が正常収集される＝R43/R46/R39のresume経路取りこぼしの穴とは無関係（対話が挟まらないON_DRAW系はR31と同じく安全という理論をany_opp側でも追加確認）。
- **ハマりどころ**＝WX12-047の攻撃は host 側に前方ブロッカーが無かったため素通りしてライフクロスクラッシュが発生し、「ライフクロスクラッシュ」確認モーダル（バーストなし→「エナに送る」ボタン）が挟まった。このボタンをdriverのクリック候補に追加していないと、モーダルで停止したまま`resolveStackNext`（ON_DRAWの収集箇所）に到達せずFAILする（最初の試行はこれで無発火FAILだった）。`clickTextOrBtn`に`'エナに送る'`を追加して解消。
- `order`配列に追加済み（末尾）。

### ⚠ 手札捨て/トラッシュ flatten（R36）で resume経路取りこぼしの新規インスタンスを発見（2026-07-09・続き60・Sonnet 5・未修正・Opus引き継ぎ）

`handDiscard`（WDA-F02-17→WXK10-065）を新設し実機検証した結果、**❌FAIL＝続き58のresume経路取りこぼし理論の新規インスタンスを確認**（2回連続再現）。

- **盤面**：host の手札に WDA-F02-17（幻蟲 §アメンボ§・【自】ON_TRASH・triggerScope:self・fromZones:['hand']＝このカード自身が手札から捨てられたとき任意コスト《青》《黒》で相手シグニに-5000）と WXK10-065（小装 クワナゴウ・【出】「あなたは手札を1枚捨てる」）を配置。WXK10-065を召喚すると残る手札はWDA-F02-17のみ＝これを選ばせて捨てさせた。
- **ハマりどころ**＝host中央ルリグを未設定だと注入直後の**Lv0/Limit0初期ルリグ**のままになり「召喚」ボタン自体が出ない（`canFitSomewhere`が`1<=0`でfalse）。`'field.lrig':['WD01-001#1']`を明示設定して解消（カード側の問題ではなく盤面注入の不備だった）。
- **結果＝FAIL（ground truthは正しい）**：召喚→SELECT_TARGET（pick-0）→決定で`hHand`2→0・`hTrash`0→1と正しく解決したが、watcherが一度も発火しない（`gPowerMods`変化なし・`stack`終始0）。
- **原因**＝WXK10-065のTRASH HAND_CARDアクション自体が`selectOrInteract`（`execUtils.ts:1206`）経由でSELECT_TARGETを要求する（候補1件でも自動解決しない仕様）。対話ありのまま解決するため`resolveStackNext`の`done===false`分岐に落ち、`collectAnyZoneTrashSelfTriggers`（`triggerCollect.ts:312`・中央diffのみ配線・resume側にinline版なし）が呼ばれない＝R43/R46/R39と同型。
- **系統的懸念に追加**＝`collectDeckTrashSelfTriggers`（ON_TRASH self・fromZones:deck）も同型の疑いで未検証。
- `order`配列からは除外（FAIL・Opus修正待ち）。

### ✅ ON_REFRESH（R45②）をPASSで確認＝対話なしDRAW/no-op経由のリフレッシュも問題なし（2026-07-10・続き60・Sonnet 5）

`refreshTrigger`（WXDi-P04-043→WX15-073）を新設し実機検証したところ**PASS（3回連続）**。host に watcher WXDi-P04-043（幻竜姫 ドラゴンメイド・ON_REFRESH・triggerCondition:{refreshedOwner:'any'}・任意コスト《黒》で対戦相手シグニに-10000）を配置、host のデッキを**残り1枚**（trash1枚）にしてWX15-073（勝利の円卓 アルスラ・E1バニッシュ候補0件で即done・E2ドローがデッキ最後の1枚を引いてちょうど0枚化）を召喚して発火させた。

- **結果**：ログ「1枚ドロー」→「リフレッシュ（デッキを再構築）」→「幻竜姫　ドラゴンメイドの【自】効果（リフレッシュ時）」を3回連続確認。
- **機構的にR31/oppDrawと同型**＝`applyRefreshOnDone`（`BattleScreen.tsx:3506`）は`resolveStackNext`冒頭で`executeEffect`直後に呼ばれ、E1/E2とも対話不要で`done=true`のまま完結するため、リフレッシュ適用と直後の中央diff（`countRefresh`）が同一呼び出し内で完結し`collectRefreshTriggers`が正常収集される＝resume経路取りこぼしとは無関係。
- **⚠重要な罠（当初デッキ0枚で試して発覚）**＝デッキを最初から0枚にすると、E1（バニッシュ0件の即done）の時点で既に「デッキ0枚＋トラッシュ非空」が成立し1回目のリフレッシュが発火→続くE2解決後の2回目リフレッシュで「同ターン中2回目のリフレッシュは強制終了」ルール（`BattleScreen.tsx:3511`）が発動しターンが即終了、watcher収集の機会を失う（ログ「ターンが強制終了されました」で確認）。デッキを**残り1枚**にしてE2が引くまでリフレッシュを起こさない設計に変更して解消＝リフレッシュ関連の実機シナリオを組む際は「デッキを空にする」のではなく「ちょうど1回だけ0枚化させる」よう調整すること。
- **ハマりどころ**＝POWER_MODIFY対象選択（相手シグニ1体・候補1件）は選択操作なしで「決定 (1/1)」ボタンが最初からready表示される＝`pick-0`クリックだけでなく「決定」ボタンを直接押す分岐も必要。
- `order`配列に追加済み（末尾）。

### ✅ ON_CHARM_TO_TRASH（R42）をPASSで確認＝続き61のcollectBoardDiffTriggers統合が既にカバー済みだった（2026-07-11・続き64・Sonnet 5）

`charmToTrash`（WX19-023→WX16-Re05）を新設し実機検証したところ**PASS**。PLAN §7 で「続き61で統合ヘルパー配線済み＝実機検証可」だった項目＝追加修正なしで解消済みと確認できた。

- **盤面**：host に watcher WX16-Re05（幻蟲 ヘイケ・【自】ON_CHARM_TO_TRASH・triggerScope any・mandatory・チャームがトラッシュに置かれたとき対戦相手シグニ1体に-4000）とセンタールリグ WD01-001（タマ・WX19-023「タマ限定」を満たす）を配置。guest zone0 に WD05-009（P12000）＋`field.signi_charms`直接注入でチャーム、guest zone1 にバニッシュ対象外の WX01-053（P15000・Restriction無し）を配置（≤12000のバニッシュ候補を1件に固定）。手札の WX19-023（弩砲 チタイクウ・【出】《無》で対戦相手P12000以下を無条件バニッシュ）を召喚。
- **結果**：SELECT_TARGET（resume経路）でguest zone0(WD05-009)をバニッシュ→そのチャームがguest.trashへ（`gTrash`0→1）→同じresume解決内でwatcherが発火→2段目のSELECT_TARGETでguest zone1(WX01-053)へ-4000確定（`gPowerMods=WX01-053#1:-4000`）。
- **🔎 副次的な学び＝「バニッシュ＝トラッシュ行き」は誤解**＝`banishDestination`（`execUtils.ts:93`）のデフォルト分岐はバニッシュされたシグニ自身を**持ち主のエナゾーン**へ送る（`banish_redirect`系フラグがある場合のみトラッシュ/手札/デッキ下へリダイレクト＝Wixossのルール通り）。トラッシュに乗るのは外れた**チャーム/アクセ**（`removeFromField`の`extraTrash`）のみ＝`gTrash`が2ではなく1で正しい。
- **⚠シナリオ設計の罠**＝banish対象候補が2件以上あるとSELECT_TARGETピッカーのtestid順（pick-0/pick-1）が配列インデックス順と一致しない（表示のミラー処理の影響と推定・未解明）。当初guest zone1にもバニッシュ対象になりうるP3000カードを置いたところpick-0が意図と異なる方（チャームなし側）を選びFAILした＝**banish候補を意図的に1件に絞る**（対象外カードのpowerを条件外に設定）ことで表示順非依存の決定的シナリオになる。
- **⚠guest側盤面注入の稀な競合**＝原因未特定だがguestSetの`field.signi`注入が反映されないままクリックを始めるとFAILする（CPU側の初期化書き込みとの競合と推定）。クリック開始前に`queryState`で確認し、未反映なら`injectScenario`を再PATCHするリトライ（最大4回）で安定化。同様の設計が必要な他シナリオにも応用できる。
- `order`配列に追加済み（`banishbyeffect`の直後）。単体3回連続PASS。**残＝未検証**＝R42②（バトルバニッシュでhostが離脱したとき＝効果解決経路外の発火）。

### ✅ ON_EXCEED_COST 場シグニ（R44）をPASSで確認（2026-07-11・続き64・Sonnet 5）

`exceedCost`（WX11-004→WXDi-P06-078）を新設し実機検証したところ**PASS（3回連続・本番ビルド含む）**。

- **盤面**：host センターに WX11-004（コード・ピルルク　Λ・Restriction無し・【起】《ターン１回》エクシード１：カードを２枚引く＝MAIN専用の【起】が1つだけなのでボタンの取り違えが起きない）、下1枚に WD01-001（field.lrigを2要素にしてエクシード1を支払えるように）、host 場に watcher WXDi-P06-078（凶将　カラサワ・【自】《ターン1回》エクシードコスト支払い時対戦相手シグニ1体に任意コスト《黒》で-5000）を配置。
- **結果**：LRIGクリック→【起】エクシード１ボタン→「発動」（コスト自動控除）→**「効果の発動順序を決めてください」モーダルに「コード・ピルルク　Λ の【起】効果」と「凶将　カラサク【自】エクシードコスト支払い時」の2件が並ぶ**＝ON_EXCEED_COSTが正しく発火したことを確認（`executeLrigGranted`がエクシードで支払われたカードを検出し同じスタックへ両エントリを積む挙動＝`BattleScreen.tsx:9665`の実装通り）。「発動順序を確定」クリックで完了。
- **ハマりどころ**＝発動順序モーダルの「発動順序を確定」ボタンをdriverのクリック候補に含めていないと、モーダルで停止したまま検出できずFAILする（初回試行はこれで無発火FAILだった＝coinpaid/deckshuffle等の既存シナリオと同じ罠）。
- `order`配列に追加済み（`charmToTrash`の直後）。**残＝未検証**＝②対象選択CHOOSEで相手シグニ1体に-5000が実際に適用される（今回はスキップで完走）③カットインexceedでは未発火（近似）。

### ✅ ON_TARGETED①個別確認（WXDi-P02-043）をPASSで確認（2026-07-11・続き64・Sonnet 5）

`ontargeted2`（WD05-017→WXDi-P02-043）を新設し実機検証したところ**PASS**。PLAN §7 の ON_TARGETED① 残タスク「相手の効果で自分のシグニが対象に取られた各パターンの個別確認」のうち WXDi-P02-043（ドライ＝インフルＤ型）を検証した。

- **盤面**：`ontargeted`（WXDi-P03-067）と同一構成（host が黒×1コストのスペル WD05-017 ホール・ダークで対戦相手シグニ1体に-4000）で watcher のみ WXDi-P02-043（【自】《ターン1回》このシグニが対戦相手の能力/効果の対象になったとき、カードを1枚引き【エナチャージ1】をする＝mandatory・対象選択不要）に差し替え。
- **結果**：SELECT_TARGETでguestのwatcherを対象化→ON_TARGETED発火→DRAW+ENERGY_CHARGE_FROM_DECKでguest.hand 5→6を確認。
- **⚠軽微なタイミングフレーク**＝5回中4回PASS・1回はSELECT_TARGETピッカーが最後まで出現せずFAIL（stack=0のまま）。`ontargeted`と全く同じコードパス・同じスペルを使っているためengine側の問題ではなく、driver/環境側のクリックタイミング競合と判断（他の既存シナリオでも同種のバッチ限定状態汚染が既知＝下記運用メモ参照）。
- `order`配列に追加済み（`ontargeted`の直後）。**残＝未検証**＝残る3枚（WXDi-P11-040/WX25-P2-055/WXDi-D09-H14）の個別確認。

### ✅ ON_TARGETED残り3枚（WXDi-P11-040/WXDi-D09-H14/WX25-P2-055）を個別確認＝全PASS＋2件の実データ疑義を発見（2026-07-12・続き72・Sonnet 5）

`ontargeted3`/`ontargeted4`/`ontargeted5` を新設し、PLAN §7 の ON_TARGETED① 残タスク3枚をすべて検証した。3件とも**単体実行でPASS**（バッチ実行時は `ontargeted3` のみ既知の状態汚染でFAILしたが単体では安定再現）。`order`配列に3件とも追加済み（`ontargeted2`の直後）。

- **`ontargeted3`（WXDi-P11-040 大罠 パントマイム）**：【自】《相手ターン》《ターン1回》このシグニが対戦相手の能力/効果の対象になったとき、あなたの他のシグニ1体を対象とし【シャドウ】を得る。guest に watcher 1枚だけ配置（他allyなし）して検証したところ、SELECT_TARGET解決後 `guest.keyword_grants` に `WXDi-P11-040#1:シャドウ` が付与＝**watcher自身にシャドウが付与された**。原文は「あなたの**他の**シグニ」＝自分自身を除外するはずだが、`effects_WXDi.json` の `WXDi-P11-040-E2` action.target は `{"type":"SIGNI","owner":"self","count":1}` で excludeSelf 相当のフィルタが無い＝**parser/JSONでexcludeSelfが実装されていない疑い**（他にally候補がいない特殊な盤面でのみ顕在化＝実戦では通常他のシグニがいるため気付きにくい）。修正はせず観測結果のみ記録。
- **`ontargeted4`（WXDi-D09-H14 羅婚石 ダイヤブライド）**：【自】《ターン1回》あなたの赤のシグニ1体が対戦相手の能力/効果の対象になったとき、対戦相手は自分のエナから1枚選びトラッシュに置く（`triggerScope:any_ally`・`triggerFilter:{color:赤}`）。watcher（赤）単独配置で自己対象化により発火＝`host.trash` が0→1（host自身のエナ1枚がトラッシュ）で確認。**問題なし＝正しく機能**。
- **`ontargeted5`（WX25-P2-055 轟砲 パワードスーツ）**：【自】《ターン1回》このシグニが対戦相手の能力/効果の対象になったとき、ターン終了時までこのシグニは【常】能力を失う（原文は自己参照）。`effects_WX24_26.json` の `WX25-P2-055-E2` action.target.owner は `'opponent'`＝host側にも1枚だけ候補シグニ（`WD05-009#9`）を置いて観測したところ、SELECT_TARGET解決後 `host.abilities_removed` に `WD05-009#9` が追加＝**host（＝watcherの対戦相手）側が能力喪失した**。guest（watcher自身）側は変化なし。**JSONのowner:'opponent'通りに動いているが、原文の「このシグニは」という自己参照とは一致しない＝parser誤りの疑いが濃厚**（本来 `owner:'self'` であるべき）。修正はせず観測結果のみ記録。

**⚠上記2件（ontargeted3のexcludeSelf・ontargeted5のowner）は修正せずOpusタスク12（Sonnet発見バグの修正・常設受け口）へ登録**（PLAN §3・§7参照）。

### ✅ ON_LRIG_GROW②（相手のグロウでany_opp発火・WXDi-P13-047）をPASSで確認＋turnOwnerゲート未実装を発見（2026-07-12・続き73・Sonnet 5）

PLAN §7「ON_LRIG_GROW」残②「相手のグロウでany_oppが発火する経路」。`lrigGrowAnyOpp`（WXDi-P13-047）を新設し実機検証したところ**PASS（2回連続・単体／隣接シナリオとのバッチ実行でも確認）**。

- **盤面**：host に watcher WXDi-P13-047（幻獣神 LOVIT//ディソナ・【自】《ターン1回》ON_LRIG_GROW・triggerScope:any_opp・対戦相手のエナ1枚をトラッシュ）を配置。guest（CPU）は `cpugrow` と同型構成（center Lv2 ピルルク・Ｍ→grow先 Lv3 ピルルク・Ｇ・青エナ3枚＝グロウ支払い2枚＋トラッシュされる1枚）で `top:{active:'cpu', turn_phase:'GROW'}` に注入し、CPU自動グロウ（`cpuTurnAction`のGROW分岐）に任せた。
- **結果**：CPUがLv2→Lv3へ自然グロウした直後、host画面にSELECT_TARGETピッカー（`pick-0`）が出現＝host自身がwatcherの効果解決を担当することを確認→決定クリックで `guest.trash` が0→1（guestのエナ1枚がトラッシュ）。盤面ログ「[自分] 幻獣神　LOVIT//ディソナ の【自】効果（グロウ時）」で発火を確認。
- **🆕 turnOwnerゲート未実装を発見**＝原文「【自】《ターン１回》：**あなたのターンの間**、対戦相手のルリグがグロウしたとき…」に対し、`effects_WXDi.json` の `WXDi-P13-047-E2` には turnOwner系の `triggerCondition`/`activeCondition` が無い。本シナリオは `top.active:'cpu'`＝**guest（対戦相手）自身のターン中のグロウ**（＝原文条件を満たさないはずの盤面）だが、それでも発火した＝**「あなたのターンの間」ゲートが実装されておらず、相手が自分のターンで通常グロウするだけで毎回誤発火する過剰発火バグの疑い**（実戦では相手は基本的に自分のターンにしかグロウしないため、この効果は実際にはほぼ常に「不成立」であるべきだが、現状は常に成立してしまう）。
- **修正はせず観測結果のみ記録してOpusタスク12へ登録**（PLAN §3・§7参照）。`order`配列に追加済み（`cpugrowblocked`の直後）。

### ✅ ON_LRIG_GROW②のもう1枚（WXDi-P03-046・SELECT_TARGET経由）をPASSで確認＝resume経路取りこぼしバグには非該当（2026-07-12・続き73・Sonnet 5・同日第2件）

`lrigGrowAnyOppP03046`（WXDi-P03-046）を新設し実機検証したところ**PASS（2回連続）**。`lrigGrowAnyOpp`（WXDi-P13-047）と同じ any_opp 機構だが、こちらの action は `TRANSFER_TO_HAND(source:TRASH_CARD,owner:self,filter:{cardType:シグニ,color:黒})`＝SELECT_TARGETを要しうるアクションのため、R38/R43/R46/R39と同型の「resume経路取りこぼし」バグの有無を確認する目的で選んだ。

- **盤面**：host に watcher WXDi-P03-046（羅原姫 Ａｃ）と trash に黒シグニ1枚（WD05-009・候補を1件に固定）を配置。guest（CPU）は `cpugrow` と同型構成でGROWフェイズに注入し自動グロウさせた。
- **結果**：CPUがLv2→Lv3へグロウした直後、host画面にSELECT_TARGETピッカーが出現→決定クリックで`host.trash`が1→0・`host.hand`が5→6（黒シグニがトラッシュから手札へ）。盤面ログ「[自分] 羅原姫　Ａｃ の【自】効果（グロウ時）」で発火を確認。
- **🔎 R38/R43/R46/R39系統には非該当と判明**＝これらの既知バグは「原因アクション自体がSELECT_TARGET/CHOOSEを要し、かつ**watcherの収集がresolveStackNextの`done`ブランチにしかない**」場合に、`handleEffectInteraction`（resume経路）を通ると収集が漏れる、という構造だった。本カードでは**原因アクション（CPUの自動グロウ）は対話不要でそのまま完了**し、watcher自身の効果解決（TRANSFER_TO_HAND）は**独立した新規のSELECT_TARGET**としてhost画面に提示される＝「既存のresume interactionに割り込む」形ではないため、この種別のトリガーは影響を受けない。
- `order`配列に追加済み（`lrigGrowAnyOpp`の直後）。

### ⚠ ON_TARGETED③（usageLimit《ターン1回》）＝同一ターン内2回目の対象化で誤発火する実バグを発見（2026-07-12・続き74・Sonnet 5・未修正・Opus引き継ぎ・同日第2件）

PLAN §7「ON_TARGETED」残③「usageLimit《ターン1回》が複数対象でも1回」。`ontargetedUsageLimit`（`ontargeted2`と同じ watcher WXDi-P02-043を使用）を新設し、同一ターン内にWD05-017（黒×1・対戦相手シグニ-4000）を2回発動して同じwatcherを2回対象化した。

- **盤面**：host に WD05-017×2枚（`WD05-017#1`/`#2`）を手札用意（黒×1コスト×2回分のエナ4枚）。guest に watcher WXDi-P02-043（【自】《ターン1回》対象になったときドロー+エナチャージ・mandatory）を1枚のみ配置。
- **結果＝❌FAIL（2回連続再現）**＝1回目の対象化で`guest.hand`が5→6（正常発火）。**しかし2回目の対象化でも`guest.hand`が6→7に増加**＝once_per_turnガードが機能せず2回目も発火した。
- **コード読解で根本原因を確定**＝`collectTargetedTriggers`（`src/engine/triggerCollect.ts:41-89`）は75行目で `eff.usageLimit === 'once_per_turn' && watcherState.actions_done?.includes(eff.effectId)` を判定してはいるが、**発火した効果IDを`actions_done`へ書き戻す`usedOncePerTurnIds`を返り値に含んでいない**（`StackEntry[]`のみを返す）。他の同種コレクター（`collectKeywordGrantedTriggers`/`collectDeckShuffledTriggers`/`collectBanishTriggers`/`collectLrigUnderMovedTriggers`等）は全て`usedOncePerTurnIds`を返し、呼び出し元（`BattleScreen.tsx:2356-2430`付近）が `actions_done: [...(h.actions_done ?? []), ...xx.usedOncePerTurnIds]` の形で書き戻している。**ON_TARGETEDの呼び出し元（`BattleScreen.tsx:4093`）はこのパターンに倣っておらず、`targetedEntries`をスタックに積むだけで`actions_done`を更新していない**＝1回目の発火が記録として残らず、2回目の対象化で毎回ガードが素通りする。
- **影響**＝usageLimit《ターン1回》が明記されたON_TARGETED系カード全般（相手に何度対象を取られても毎ターン1回しか反応しないはずが、実際は毎回反応してしまう）。
- **修正はせず、根本原因まで特定した状態で観測結果を記録しOpusタスク12へ登録**（PLAN §3・§7参照）。**修正方針**＝`collectTargetedTriggers`の戻り値を`{entries, usedOncePerTurnIds}`形式へ拡張し、呼び出し元で他コレクターと同型の`actions_done`書き戻しを追加する。
- **再現**：`node scripts/verifyBattleDrive.mjs ontargetedUsageLimit`（`order`配列には追加せず＝FAIL）。詳細 BUGFIXES 最上部。

### ⚠ ON_CHARM_TO_TRASH（R42②・§7・WX16-Re05）＝バトルバニッシュ経路で未発火の実バグを発見（2026-07-12・続き74・Sonnet 5・未修正・Opus引き継ぎ）

PLAN §7「ON_CHARM_TO_TRASH」残②「バトルバニッシュでhostが離脱したとき（効果解決経路外＝未検出の可能性）」。既存の`charmToTrash`（PASS済み）は効果（WX19-023の無条件バニッシュ）経由のみを検証済みだったため、**戦闘（アタックの力比べ）でチャーム付きシグニが負けてバニッシュされる経路**を新たに検証した。

- **コード読解で事前に仮説を確認**＝バトル解決は`resolvePendingSigniBattleFor`（`BattleScreen.tsx:6344`）が担当し、独自のトリガーリスト（`banishEntries`/`battleBanishEntries`/`trashEntriesSA`等・同ファイル7176行）を構築する。一方 `collectCharmToTrashTriggers` は `collectBoardDiffTriggers` からのみ呼ばれ、その呼び出し元は `resolveStackNext`（効果スタック解決）と `handleEffectInteraction`（resume経路）の2箇所のみ＝**バトル解決経路には一切配線されていない**。
- **盤面**：host zone0（WD05-009・P12000・攻撃者）、host zone1（WX16-Re05・watcher・any scope・P5000）。guest zone1（WX01-053・P15000・watcherの-4000対象候補で唯一の残存シグニ）、guest zone2（WD01-013・P3000・チャーム付き・host zone0の正面＝アタック対象）。host zone0→guest zone2へ通常アタック。
- **結果＝ground truthは正しいが watcher が一度も発火しない（2回連続再現）**＝アタック後 `guest.fieldSigni[2]` からWD01-013が消滅（力比べでhost 12000≥guest 3000により敗北・バトルバニッシュ）、`guest.trash` が0→1（チャームがトラッシュへ＝`BattleScreen.tsx:6749`/`6825-6827`のバトル専用チャーム処理で正しく移動）。**しかし `guest.powerMods` は最後まで空のまま**＝watcher（WX16-Re05）のON_CHARM_TO_TRASHが一度も発火せず。
- **確定した原因**＝仮説どおり、`collectCharmToTrashTriggers` がバトルバニッシュ解決経路（`resolvePendingSigniBattleFor`）から一度も呼ばれていないため。効果によるバニッシュ（`charmToTrash`シナリオ）では発火するが、**通常の戦闘でチャームが手放されるケース（実戦で最も頻繁に起こりうる経路）ではON_CHARM_TO_TRASH系のカードが機能しない**という実害の大きいバグ。
- **修正方針（未着手・Opus担当）**＝`resolvePendingSigniBattleFor` のトリガー収集箇所（`BattleScreen.tsx:7176`付近の`allTriggers`組み立て）に `collectCharmToTrashTriggers` 呼び出しを追加する横展開で直る見込み（新規機構ではなく既存パターンの適用漏れ＝`collectFreezeInline`等と同系統の抜け）。
- **再現**：`node scripts/verifyBattleDrive.mjs charmToTrashBattle`（`order`配列には追加せず＝FAIL）。詳細 BUGFIXES 最上部。

### ⚠ R30（ON_PLAY any_opp・WXK10-022-E1）＝自然発火経路がparserバグでブロック中と判明（2026-07-11・続き64・Sonnet 5・未修正・Opus引き継ぎ）

R30（「あなたのターンの間、対戦相手のシグニ１体が場に出たとき」＝WXK10-022-E1）を実機検証しようとしたが、**カード全体を検索してもこのトリガーを自然に起こせるカードは1枚（WXEX2-50 大幻蟲エンマコロギ）しかなく、そのカードのJSONがparser誤生成でブロックされているため検証不能**と判明（シナリオ未作成）。

- WXEX2-50 の【起】《ターン１回》《黒×0》：原文「対戦相手のトラッシュからシグニ１枚を対象とし、それを**対戦相手の場に**出す。その後、あなたのトラッシュから…＜凶蟲＞のシグニ１枚を対象とし、それを場に出す。」＝1文目は明確に「対戦相手のトラッシュ→対戦相手の場」（あなたの効果で相手に本来出させたくないカードを押し付ける珍しい効果）。
- しかし `effects_WX.json`（`WXEX2-50-E3` step1）は `{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self",...}}`＝owner/source.owner ともに `self` になっている＝parser が「対戦相手の」を読み落として通常の「あなたの場に出す」パターンにフォールバックしたとみられる。
- **影響**＝この1枚の誤パースにより「あなたのターン中に相手シグニが場に出る」という珍しいイベントが**現在の実装済みカード全体で一度も起こり得ない**＝R30 watcher（WXK10-022-E1）は実戦でも発火機会がない。
- 修正方針（未着手・Opus担当）＝`parseSentencePart1.ts`（or 該当のADD_TO_FIELDパーサー規則）に「それを対戦相手の場に出す」の destination owner 判定を追加。修正後に WXEX2-50 を使った `verifyBattleDrive.mjs` シナリオを新設してR30を検証する。
- 詳細 BUGFIXES 最上部。

### ⚠ R45①（ON_ACCE_ATTACH host条件・WXK05-041）＝`execAttachAcce` fromHand経路の実装バグを発見（2026-07-11・続き64・Sonnet 5・未修正・Opus引き継ぎ）

`acceAttach`（WXK04-003デコレ→WXK05-041）を新設し実機検証した結果、**❌FAIL＝実装バグを確認**（未修正・2回連続再現）。

- **盤面**：host センターに WXK04-003（エルドラ　オーバークロック・【デコレ】キーワード持ち・Lv4/Limit11）、host 場に WXK05-026（コードオーダー　ＢＣＰＩＣ・＜調理＞Lv4・ACCE未装着）、host 手札に WXK05-041（コードイート　ミント・＜調理＞Lv1・watcher本体）を配置。LRIGクリック（`img`が`pointerEvents:none`のため`click({force:true})`が必要）→【起】ボタン（後述の表示バグで同文言が2件並ぶため末尾を選択）→「発動」→手札からACCEするシグニを選択（候補1件）→決定。
- **結果＝FAIL**：ここで `actions_done` に `WXK04-003-DECORE` が記録され完了扱いになるが、`field.signi_acce` は終始 `null` のまま＝ホストシグニ（WXK05-026）を選ぶはずの2段目SELECT_TARGETが一度も現れない。ON_ACCE_ATTACHは当然発火しない。
- **原因**＝`execAttachAcce`（`effectExecutor.ts:3774`）の `fromHand` 分岐は、1段目 `SELECT_TARGET`（`self_hand`スコープ）の `thenAction` に「まだ2段目のinteractionを要するフルのATTACH_ACCEアクション」を渡しているが、SELECT_TARGET解決側（`applyDirectAction`・`effectExecutor.ts:4141`→`case 'ATTACH_ACCE'`・`effectExecutor.ts:4889`）は「渡された`cardNum`＝ユーザーが選んだ候補＝**ホストシグニ**」という前提で実装されている。1段目で選ばれた候補は実際には「手札から選んだACCEカード自身」であり当然ホスト場に存在しないため`zoneIdx<0`となり即終了する。**`thenAction`に未完結のアクションを渡す設計がresume機構（1候補選択→即terminal実行）と根本的に噛み合っていない**。
- **背景**＝`manualEffects.ts`の既存コメントが「【デコレ】はparserが除去するためどのカードにも登録されておらずfromHandパスが死にコードだった」と明記していた箇所＝過去セッションでATTACH_ACCE(fromHand:true)を＜調理＞のエルドラ9枚に配線した。**今回が`fromHand`経路の初の実UI駆動**であり、その場で根本バグが露呈した。
- **副次的な発見（低優先）**＝WXK04-003は【起】能力を2つ持つ（コイン×1のE2＝ゲーム1回「サプライズ」／青×0のDECORE）が、`getMyLrigFieldActions`（`BattleScreen.tsx:9872`）のコストラベル組み立てが`eff.cost?.coin`を考慮しないため**E2のボタンラベルも「【起】コストなし」になり2つの【起】ボタンが同文言で区別不能**（driverは`nth(count-1)`で後方＝DECOREを選ぶ回避策で対応）。
- 修正方針（未着手・Opus担当）＝`fromHand`分岐を「1段目解決後に選択済みACCEカードを`ctx.lastProcessedCards`等へ積み、改めて`execAttachAcce`の非`fromHand`経路（2段目needsInteraction）を明示的に呼ぶ」形へ作り替える。
- **再現**：`node scripts/verifyBattleDrive.mjs acceAttach`（`order`配列には追加せず）。
- 詳細 BUGFIXES 最上部。

### ✅ R30（onPlayAnyOpp）＝多段SEQUENCE 途中ラウンドの盤面差分トリガー見逃しを修正・FAIL→PASS（2026-07-12・続き75・Opus 4.8・同日第2件）

続き70（Sonnet）が発見し「設計判断が要る」として引き継がれていた最後の1件。`handleEffectInteraction` の `!result.done` 分岐（SEQUENCE 途中ラウンド）が **ON_BANISH だけを特例収集**していたのを、done 分岐と同じ `collectBoardDiffTriggers`（統合収集）に置き換えた（詳細と設計判断の根拠は BUGFIXES 最上部）。

- **`onPlayAnyOpp` FAIL→PASS（2回連続）**＝`gAbilitiesRemoved=["WD01-010#1"]`。既定 `order` に追加。
- **⚠ 初回実行が「何もクリックできないまま空振り」することがある**＝ページ準備前のレースで【起】ボタンが出ておらず、盤面がまったく動かないまま26手を使い切る。**盤面が初期値のまま `did=なし` が続いていたら engine の問題ではなく driver 側のレース**を疑い、単体で再実行して切り分けること（本件は再実行で2回とも PASS）。
- **二重発火の回帰確認**＝盤面差分トリガーが絡む既存8シナリオ（`banishbyeffect`／`freezetrigger`／`powerzero`／`charmToTrash`／`wxk10068banish`／`oppPowerDecreased`／`energyToTrash`／`deployRestrict`）を実行し全PASS。⚠`deployRestrict` はこの**バッチ実行時のみ FAIL**（guest.signi=0 という注入が壊れた形）したが**単体では PASS**＝§3 Sonnetタスク3 に登録済みの既知のバッチ状態汚染であり本修正の回帰ではない（同タスクの再現例としても記録）。

### ✅ Sonnet が積んだ実機バグ5件を修正＝該当10シナリオ全PASS（2026-07-12・続き75・Opus 4.8・§3 Opusタスク12）

続き70〜74 で Sonnet が発見・観測のみ記録していた5件（Opusタスク12）を修正し、実機で PASS を確認した。修正内容の詳細は BUGFIXES 最上部。ここでは **driver（`verifyBattleDrive.mjs`）側の変更と、実機検証で得た知見**を残す。

- **✅ FAIL→PASS になった3シナリオ**＝`ontargetedUsageLimit`（《ターン1回》が2回目も発火→非発火に）・`charmToTrashBattle`（バトルバニッシュでチャームが手放されても未発火→発火）・`ontargeted3`（「他の」を無視して watcher 自身に【シャドウ】付与→他の味方に付与）。前2つは**既定 `order` に追加**した。
- **🔄 判定を反転した3シナリオ**＝Sonnet が作った時点では「バグのある挙動」を PASS と判定していたため、原文どおりの期待へ書き換えた：
  - `ontargeted5`（WX25-P2-055）＝「host（watcherの対戦相手）が能力喪失」でも PASS だったのを、**自己参照どおり watcher 自身が能力を失う**ことを要求する形へ（host 側が能力喪失したら FAIL＝owner 誤りの回帰ガード）。
  - `lrigGrowAnyOpp`（WXDi-P13-047）・`lrigGrowAnyOppP03046`（WXDi-P03-046）＝CPU が**自分のターン**にグロウしたときの発火を PASS としていたが、原文は「**あなたのターンの間**、対戦相手のルリグがグロウしたとき」＝この盤面では**非発火が正しい**。`lrigUnder` の 0→1 で「CPU が実際にグロウした（＝トリガー機会は発生した）」ことを確認したうえで非発火を PASS とする形へ。発火経路自体は golden（watcher のターン中に相手がグロウ）で担保する。
- **⚠ driver の落とし穴①＝`guestSet` の `actions_done` クリアが必須になった**：ON_TARGETED の usageLimit が**実際に効くようになった**（＝発火時に `actions_done` へ書き戻される）ため、watcher が guest 側のシナリオは注入時に `guestSet: { 'actions_done': [] }` を入れないと、**2回目以降の実行で watcher が非発火**になり FAIL する（従来は書き戻しが無く毎回発火していたので露見しなかった）。ON_TARGETED 系6シナリオに追加済み。同種の状態持ち越しは今後 usageLimit を直すたびに起こりうる。
- **⚠ driver の落とし穴②＝SELECT_TARGET ピッカーの並びは zone 順と一致しない**：`ontargeted3` で guest に2体（zone0=watcher／zone1=他の味方）置いたところ、スペル（ホール・ダーク）の対象選択で **`pick-0` が zone1 の「他の味方」を選んだ**。ON_TARGETED は `triggerScope:self`＝**watcher 自身が対象に取られないと発火しない**ため、pick-0 のままだとトリガーが積まれず「未発火」に見えて誤診する。`powerMods`（-4000 が誰に乗ったか）で対象を確認しながら **watcher 側の pick（実測 `pick-1`）を選ぶ**よう driver を修正した。**複数候補があるシナリオでは「意図した対象が実際に取れたか」を必ず盤面で確認すること**。

### 運用メモ
- 触ったら `npm run typecheck` ＋（engine/BattleScreen を変えたら）`npm run smoke/golden/fuzz`。実機 driver は `node scripts/verifyBattleDrive.mjs`（build 要否は mtime で自動判定＝2026-07-14 以降、先に手動 build する必要はない）。
- スクショは `scratchpad-verify/{シナリオid}-inj.png` / `-final.png` と各手 `{id}-{n}.png`。
- ⚠一括実行（引数なし）は末尾の一部シナリオでバッチ限定の状態汚染が起き得る＝FAILが出たら該当シナリオを単体（`node scripts/verifyBattleDrive.mjs <id>`）で再実行して切り分けること。
