# ルール規則台帳（§5.6 `C-9`）

> **目的**＝カード効果ではなく**ルール処理**（バトル／ダメージ／フェイズ／ゾーン移動の行き先）を、公式ルールの1文ずつに対応づけて棚卸しする。
> 🔴**この層には計器が1つも無い**（census／golden の大半／意味照合は全部 `EffectText` 由来）。実際 `O-47`（相打ち）は3週間どの計器にも映らず、ユーザーが遊んで見つけた。
> ⇒ **規則を1つずつ純関数へ出して golden で固定する**。`BattleScreen.tsx` に規則を直書きしない。

## 0. 出典（一次資料）

| 略号 | 資料 | 備考 |
|---|---|---|
| **EN** | [English Rule Guide -Glossary- ver.1.0.0](https://www.takaratomy.co.jp/products/en.wixoss/rules/rule.pdf)（2021-10-04 更新・2021-11-06 施行） | 🔑**ディーヴァ期（センター＋アシスト2体）の現行ルール**。日本語の用語集と食い違うときはこちらを優先する |
| **JP-nnn** | [ルール用語集](https://www.takaratomy.co.jp/products/wixoss/library/rule/rule_word.html)（`word_001`〜`word_125`） | ⚠**旧期の記述が残る**（ガードステップの位置・ルリグ1体前提など）。レゾナ／キー／ライズ／ルール処理の細則はこちらにしか無い |
| **DIVA** | [初心者向けプレイマット ver.DIVA](https://www.takaratomy.co.jp/products/wixoss/pdf/beginner_playsheet01.pdf) | フェイズ順の図 |

⚠**総合ルール（comprehensive rules）の公開 PDF は見つからなかった**（2026-09-17 時点）。上の3つで足りない細則は**推測で決めない**＝§3 へ「要判断」で出す（LESSONS「ルール解釈を実装の見た目から決めて golden で固めない」）。

## 1. 凡例

| 記号 | 意味 |
|---|---|
| ✅ | **純関数＋golden で固定済み**（React の外にあり、規則が変わると golden が落ちる） |
| 👀 | 実装を読んで**公式ルールと一致**を確認した（golden 無し＝退化しても気づけない。純関数化の候補） |
| 🔴→✅ | 棚卸しで**不一致を見つけて直した** |
| ⚠ | **未確認**または疑いあり（次に取る） |
| ❓ | ルールの読みが資料だけで決まらない（ユーザー判断） |

## 2. 台帳

### 2.1 バトル・ダメージ

| ID | 規則（出典） | 実装 | 状態 |
|---|---|---|---|
| R-01 | パワーが**以上**なら防御側をバニッシュ／**未満**なら両方残る。アタッカーはバトルで落ちない（EN Battle／JP-051） | `battleOutcome.ts` `battleOutcome` | ✅（第388バッチ・`O-47` 撤回・`V-239`） |
| R-02 | 【ランサー】【Sランサー】は**バニッシュが他の行動に置き換わったら**クラッシュしない（EN Lancer／JP-063・113） | `battleOutcome.ts` `lancerCrushTriggers` ＋ `BattleScreen` の `defenderResolution` | 🔴→✅（**2026-09-17**＝置換11分岐のどれを通っても割っていた・`c9lancerreplaced`） |
| R-03 | 【ランサー】のクラッシュは**ダメージではない**＝ライフ0でも勝たない／【Sランサー】はライフ0ならダメージ（JP-063・113） | `BattleScreen` シグニアタック解決（`ランサー：ライフなし（効果消滅）`） | 👀 |
| R-04 | 【ランサー】＋【ダブルクラッシュ】でバトルに勝っても割るのは1枚（EN Double Crush／JP-042） | ランサー分岐とライフアタック分岐が別＝DC はライフアタック側にしか無い | 👀 |
| R-05 | ダメージ＝ライフがあればクラッシュ／**無ければ敗北**（EN Damage／JP-077） | `BattleScreen` ライフアタック（`相手のライフなし → 相手の敗北`） | 👀 |
| R-06 | 【ダブル／トリプルクラッシュ】は2／3枚。**残り1枚なら1枚割るだけで勝たない**。複数得ても枚数は据え置き。トリプル優先（EN Double Crush／JP-042・117） | シグニ＝`crashCount`（`V-232`）／ルリグ＝`lrigCrash.ts` `getLrigAttackCrashState` | 🔴→✅（**2026-09-17**＝ルリグの【トリプルクラッシュ】だけ `keyword_grants` しか見ておらず、**次の相手ターン終了時までの付与・CONTINUOUS 付与を読み落として1枚しか割らなかった**（`crash_cause` も「ダブルクラッシュ」に化けて限定札が外れる）。判定を純関数1本にして解決と CPU の見積りで共有・`V-252`＝`c9lrigtriplecrush`） |
| R-07 | 【アサシン】＝正面を無視してダメージ・バトルしない（EN Assassin／JP-073） | `getSigniAttackKeywordState` → `effectivelyEmpty` | 👀 |
| R-08 | ガードは**ルリグのアタックだけ**を1回防ぐ。【ダブルクラッシュ】も1枚で全部防ぐ（EN Guard／JP-012・042） | `guard.ts` `guardableHandIndices` ＋ `BattleScreen.performGuardResponse` | 👀（2026-09-17 確認＝入口が `my.field.lrig_attacked` 限定でシグニアタックには出ない／ガード枝は `lrig_attacked:false` にするだけでクラッシュ処理へ落ちないので**枚数に関係なく全部防ぐ**） |
| R-09 | クラッシュ → チェックゾーン → ライフバースト（任意）→ **エナゾーン**。複数は被クラッシュ側が順番を選ぶ（EN Crush・Life Burst／JP-061・062） | `crashOneLife` → `LifeBurstCheckModal` → `performLifeBurstResponse` | 👀（2026-09-17 確認＝`field.check` へ置く→解決の最後に `energy: [...my.energy, cardNum]`／順番は `performLifeBurstResponse(targetCardNum)` で被クラッシュ側が指定できる＝`pending_crashed_cards` から任意の1枚を先に処理する） |

### 2.2 ターン・フェイズ

| ID | 規則（出典） | 実装 | 状態 |
|---|---|---|---|
| R-20 | **アップを受けるのは次にターンを行うプレイヤー**。凍結中はアップせず、そのアップフェイズの終わりに凍結が解ける（EN Up phase・Freeze／JP-006・046） | `upPhase.ts` `applyUpPhaseToField` / `upPhaseRecipient` | 🔴→✅（**2026-09-17**＝追加ターン／相手スキップで**相手をアップ**していた＝3経路とも同じ誤り・`c9extraturnup`） |
| R-21 | ドローは2枚・**先攻1ターン目は1枚**（EN Draw phase・Play first） | `BattleScreen` `drawCount` | 👀 |
| R-22 | 1枚目でデッキ0 → リフレッシュ → **2枚目は引かない**（EN Draw phase・Refresh） | `battleUtils.drawCards` | 👀 |
| R-23 | **先攻1ターン目はアタックフェイズをスキップ**（EN Attack phase） | `attackStepPhase.ts` `resolveNextPhaseAfterMain`（人間の `doPhaseAdvance` と CPU のメインフェイズの出口が共通） | 🔴→✅（2026-09-17＝**CPU だけメインフェイズごと飛ばしていた**＝先攻1ターン目に CPU がシグニを出さなかった。golden `§5.6 C-9 R-23`／実機 `V-266`） |
| R-24 | エナフェイズ＝手札1枚か場のシグニ1体を1回だけ（EN Ener phase） | `actions_done` の `ENERGY` | 👀 |
| R-25 | グロウ＝**1ターン1回・レベルちょうど+1・ルリグタイプ共通**・グロウ条件（EN Grow） | `growLogic.listGrowCandidates` / `canGrowNow` | 👀 |
| R-26 | エンドフェイズ＝①ターン終了時の効果 ②手札7枚以上なら6枚まで捨てる ③「このターン」終了（EN End phase） | `doPhaseAdvance` END 分岐 | 👀（順序のみ） |
| R-27 | 「このターンを終了する」（強制終了）でも、**予約済みの追加ターン／相手のスキップは効く**はず | `turnScopedState.applyForcedTurnEnd` → `resolveTurnHandover`（通常のターン終了3経路と同じ判定） | 🔴→✅（**2026-09-17 ユーザー裁定＝「追加ターンを得た状態で強制終了を食らった場合、追加ターンを開始する」**。旧は `resolveTurnHandover` を見ず**常に交代**＝追加ターンが消えて相手のターンになっていた。アップを受けるのも `upPhaseRecipient` と同じ読み。`V-261`） |
| R-28 | 1ターン中に**ターンプレイヤーの2回目のリフレッシュ**ならそのターンを終了（EN Refresh） | `refreshTurnEnd.ts` `refreshForcesTurnEnd`（消費＝スタック解決＋`BattleScreen` のルール処理 funnel） | 🔴→✅（**2026-09-17**＝**数えるのは全経路が通る `applyRefreshState` 1本で正しかった**が、**ターンを終了する側が効果スタックの解決経路1本にしか無かった**＝スペル解決・選択の再開・ドローフェイズのリフレッシュでは終わらなかった（無限ループを止められない）。`V-253`／反転 `V-254`） |
| R-29 | マリガン＝初手5枚から任意枚数を1回だけ（EN Mulligan） | `lrigSetup.ts`（初手5枚）→ `mulligan.ts` `applyMulligan`（人間・CPU 共通）→ `*_mulligan_done` | 👀（2026-09-17 確認＝戻す枚数は任意（0〜5）・戻してからシャッフルして同数を引く・完了フラグで1回だけ・その後デッキ上7枚をライフクロス） |

### 2.3 ゾーン移動の行き先・ルール処理

| ID | 規則（出典） | 実装 | 状態 |
|---|---|---|---|
| R-40 | **バニッシュ → エナゾーン**（JP-052） | バトル＝`BattleScreen`／効果＝`banishDestination` | 👀 |
| R-41 | シグニが**場を離れたら**、下のカード・【チャーム】・【アクセ】はトラッシュ（【ソウル】はルリグトラッシュ）。**場を離れていなければ動かない**（JP-094・097） | `leaveFieldZone.ts` `clearZoneOnSigniLeave`（リムーブ／`reduceFieldSigniToLimit`）＋バトルのバニッシュ・ライズ畳みのインライン2本 | 🔴→✅（**2026-09-17①**＝ライズ置換の分岐だけ、**残った**シグニの【チャーム】【アクセ】をトラッシュし、ダウン・凍結をリセットし、「バニッシュされたとき／場を離れたとき」を発火させていた。**2026-09-17②**＝逆に**リムーブは後始末を1つもしていなかった**＝【チャーム】【アクセ】【ソウル】が浮いたまま残り（カードが消える）、ダウン・凍結も残って**次にそのゾーンへ置いたシグニがいきなりダウン**していた・`V-255`） |
| R-42 | リフレッシュ＝トラッシュをデッキへ → **ライフ1枚をトラッシュへ**（エナではない）。トラッシュ0なら行わない（EN Refresh／JP-064） | `refresh.applyRefreshState` | 👀 |
| R-43 | パワー0以下 → バニッシュ（ルール処理・EN Power／Rule-based action 1） | `collectPowerZeroBanishCandidates` → `checkAndBanishPowerZero`（`useEffect` の常時チェック＋バトル解決前の先取り） | 👀（2026-09-17 確認＝ターンプレイヤーのクライアントが盤面が動くたび回す。⚠バニッシュ耐性・保護・行き先置換も見ている） |
| R-44 | レベル超過／リミット超過 → **A（レベル超過）→B（直前に変化）→C の順に1体ずつ選んで**トラッシュ（EN Rule-based action 2） | `limitExcess.ts` `planLimitExcess`／`LimitExcessModal`（持ち主が1体ずつ選ぶ）／`pickLimitExcessZone`（CPU）／funnel は `BattleScreen` の `checkLimitExcessRule` | 🔴→✅（**2026-09-17**＝**リミット超過**のルール処理がそもそも無く、配置ゲートを通ったあとにリミットが下がっても場が減らなかった。行き先は `R-45`／`R-41` の funnel を通す。`V-256`／反転 `V-257`。⚠**B（直前に変化）は追跡していない**＝持ち主に選ばせる。⚠**A（レベル超過）は測るだけで落とさない**＝`R-48` の ❓） |
| R-45 | **レゾナ**がルリグデッキ・ルリグトラッシュ・シグニゾーン以外へ行くなら**ルリグデッキへ戻る**（JP-085・094） | 行き先＝`engine/resonaZone.ts` `resonaLeaveDestination`（バニッシュ4経路＋リミット超過）／**それ以外の離場は `enforceResonaZoneRule` を engine の終端 `done()` で掛ける** | 🔴→✅（**2026-09-17①**＝規則がどこにも無く、**レゾナ46枚のうち41枚がバニッシュでエナゾーンへ行っていた**（相手にエナを献上＋`lrig_deck` へ戻らず二度と出せない）。**2026-09-17② ユーザー裁定＝「ルリグトラッシュに行くと明示されている場合以外、レゾナが場を離れるときは必ずルリグデッキに戻る。手札やトラッシュには行かない」**＝バウンス／トラッシュ／デッキ送りも同じ。🔑**行き先ごとに直さない**＝`removeFromField` の呼び出し**約70箇所**に散るので `done()` で正す（`lrig_deck`／`lrig_trash`／`excluded` は走査しない）。`V-251`／`V-264`） |
| R-45b | **`シグニ/レゾナクラフト`（live 10枚）が場を離れる先** | `resonaZone.ts` `resonaLeaveDestination` が `'exile'` を返す（消費5＝効果 `banishDestination`／バトル2／パワー0以下／リミット超過）＋`done()` の `enforceResonaZoneRule` | 🔴→✅（**2026-09-17 ユーザー裁定＝クラフトは場を離れると「ゲームから取り除かれる」**＝`excluded` へ。⚠ルリグデッキへ戻すと**同じクラフトを何度でも出し直せる**側に倒れる。⚠**クラフト判定をレゾナ判定より先に置く**（`シグニ/レゾナクラフト` は「レゾナ」を含む）） |
| R-46 | **キー**がルリグデッキ・ルリグトラッシュ・ルリグゾーン以外へ行くならルリグトラッシュへ（JP-094） | `keyZone.ts` `removeKeyToLrigTrash`（消費4＝アーツのキー代替／アンコール／キー【起】コスト／シグニ【起】のキー代替） | 🔴→✅（**2026-09-17**＝行き先は合っていたが**どの枠のキーかを見分けていなかった**＝4写経のうち3つが `key_piece` 決め打ち。増設枠（`key_piece_extra`）のキーを使うと**メイン枠のキーが消滅**し、1箇所は `key_piece_extra: []` と全消しして**増設枠のキーがどこにも行かずに消えた**） |
| R-47 | 同じルリグタイプのルリグが複数場にあるなら〜（EN Rule-based action 5）⇒ 🔑**2026-09-17 ユーザー裁定＝これは「構築の制限」**＝**センタールリグと同じルリグタイプのアシストルリグは入れられない** | `utils/deckBuildLimits.ts` `deckAddBlockReason`（`LRIG_TYPE_CLASH`）＋ `utils/deckLrigSetup.ts` `lrigRoleBlockReason`（🆕同日＝**センターはデッキ編成で指定した Lv0**。初版は「ルリグ」全部をセンター扱いして普通の3ルリグデッキを組めなくしていた） | 🔴→✅（**場のルール処理は実装しない**＝同じルリグタイプが場に複数並ぶ状態は**構築で作れない**。⚠**両方向で止める**（アシスト追加は `deckAddBlockReason`／センター・アシストの指定は `lrigRoleBlockReason`）／⚠**アシスト同士の同タイプは止めない**（裁定の範囲外）／⚠複合タイプ（`花代/ユヅキ`）は**1つでも重なれば**同タイプ。`V-262`。⚠**既存の保存済みデッキは遡って弾かない**＝追加時の判定だけ。🏁**2026-09-17 ユーザー裁定で保存済みデッキを全消去して決着**＝対戦開始時の検証は足さない（検証用 `VERIFY_DECK*` は残置）） |
| R-48 | シグニのレベルは**センタールリグのレベル以下**・合計は**リミット以下**（EN Level・Limit） | 合計＝`R-44`／レベルは**配置ゲート**（`levelOk`／`SigniSummonZoneModal`／`ResonaSummonModal`／CPU／🆕**効果の場出し＝`engine/placeLevelGate.signiPlaceableByLevel` を `deployLimitBlockReason` の `LEVEL_OVER` が呼ぶ**＝engine の配置3経路と CPU も通る）＋**変動したときだけ**ルール処理（`planLimitExcess` の `levelOverZones`） | 🔴→✅＋⚠（**2026-09-17 ユーザー裁定＝「基本は配置制限。シグニのレベル変動で超過した場合はそのシグニがトラッシュに送られる」**＝`実効レベル > センターのレベル` かつ `実効レベル > 印字レベル` のときだけ落とす。`V-259`／反転 `V-260`（`WX20-Re18`＝エナ5枚につき+1）。🆕**2026-09-17 追加裁定＝ルリグ側のレベル低下で超過した場合も落とす**（`SP38-005`「対戦相手のルリグ1体…レベルを－1する」）＝実効レベルは `applyTimedBaseLevelOverrides`（**両者の store** を読む）を通し、**印字レベルは base の CardNum キー**から引く（instance キーは上書き後の値。`V-263`）。🆕**2026-09-18 バグ報告＝「場に出す」効果（`ADD_TO_FIELD` 663効果/599カード）が配置ゲートを1つも通っていなかった**＝UI の対象選択で決定を塞いだ（`V-279`／反転 `V-280`）。🏁**同日 `O-534` で engine まで通した**＝`deployLimitBlockReason` の `LEVEL_OVER`（配置3経路が通る funnel）＋`needsInteraction` が対象選択に付ける `unplaceableCards`（UI・CPU はこの印を読む）。`V-281`／反転 `V-282`） |
| R-49 | 場のシグニのトラッシュ置き＝**メインフェイズに1回**、1〜3体を同時に（EN Main phase・Remove） | `BattleScreen` 「リムーブ」ボタン → `RemoveZoneModal` → `handleRemove`（`actions_done: 'REMOVE'`） | 👀（2026-09-17 確認＝メインフェイズのみ・`REMOVE` 済なら出ない・3ゾーンを同時に選べる・スタックごとトラッシュ。⚠**ゾーンの後始末が抜けていた分は `R-41` で直した**） |
| R-50 | ピースは使用後**ゲームから除外**／スペルはトラッシュ／チェックゾーンに残ったカードはターン終了時トラッシュ（EN PIECE・Check Zone） | ピース＝`performKeyPiece`（**ルリグトラッシュ**へ）／スペル＝`finalizeUsedCardPlacement`（トラッシュ）／チェックゾーン＝`clearTurnEndScopedState` の `check_rest`（§5.3 `O-143`） | 👀（**2026-09-17 ユーザー裁定＝ピースは使用後「ルリグトラッシュ」**＝いまの実装が正。台帳の「ゲームから除外」は誤記なので、この行の規則文はルリグトラッシュと読む。後半2つ＝スペル／チェックゾーンの残りも一致を確認済み） |
| R-51 | 色コストは**無色エナで払えない**／無色コストはどの色でも払える（EN Colorless） | `costs.ts` `costColorMatches`（＋支払い割り当ては色指定スロットを先に埋める） | 👀（2026-09-17 確認＝`costColor === '無'` なら無条件 true／色指定スロットは `cardColor.includes(w)` なので無色カードは当たらない。⚠マルチエナ・`energy_color_substitutes`・追加色は別軸で通る） |
| R-52 | 同時に発動したトリガーは**ターンプレイヤーの分を全部**処理してから非ターンプレイヤー（EN Triggered ability） | `effectStack.ts` `initStack` / `pushToStack` → `buildQueue` | 🔴→✅（**2026-09-17**＝初回の整列（`initStack`）は正しかったが、**解決中に足すトリガー（`pushToStack`）が呼び出し側の配列順のまま繋がれていた**＝ライフバースト解決は「被クラッシュ側（＝非ターンプレイヤー）→ クラッシュした側（＝ターンプレイヤー）」の順に渡しており、**非ターンプレイヤーの効果が先に解決しうる**盤面だった） |
| R-54 | **〈ルリグ〉限定は「センタールリグ」だけを参照する**（アシストのルリグタイプは見ない） | `growLogic.meetsRestriction` ＋ クラスの作り手は全地点が `field.lrig.at(-1)`（`effectiveLrigClass`） | 👀（**2026-09-17 ユーザー裁定**＝実装と一致。5ファイル10地点を確認し、限定判定の近傍に `assist_lrig` が現れないことを golden `§5.6 C-9 R-54` で固定） |
| R-53 | **ピースはあなたの場にルリグが３体いると使用できる**（ピースに印刷された注釈）。緩和＝「３体いなくても使用できる」（`WXDi-P16-TK01`） | `keyPieceUseGate.ts` `pieceLrigCountOk`（提示・実行・CPU・カットイン候補が共有） | 🔴→✅（**2026-09-17**＝どこにも実装が無くセンター1体でも使えた・`c7cpupieceonelrig`） |

## 3. 別枠（カード効果側で見つかったもの）

| 項目 | 内容 | 置き場 |
|---|---|---|
| ~~ライズ置換の枚数と任意性~~ | 🏁**2026-09-17 クローズ**（`O-531`）＝STUB に `count`／`optional` を足し、**宣言元がルリグの札**（`WX16-002-E1`＝旧実装では一度も発火しない恒久 no-op）も拾うようにした。任意版は身代わり funnel の選択肢（`trash_under`）へ | BUGFIXES.md（`V-258`） |

## 4. 進め方（次の人へ）

1. ⚠ の行を**上から**取る。1行＝①出典の文を読む ②実装を読む ③食い違えば直す ④**純関数へ出して golden を1本**（`BattleScreen` の中に規則を残さない）。
2. 🔑**写経を探す**＝R-20 は**同じ規則が4箇所に写経され、3箇所とも同じ誤り**だった。規則の実装箇所は `grep` で**全部**数えてから直す。
3. 🔑**置換分岐は「既定＝何も起きなかった」側に倒す**＝R-02 は `defenderResolution` の既定を `'replaced'` にした（分岐を足して書き忘れても「割らない」側）。
4. ❓は**直さずにユーザーへ出す**（golden は読みを固定するので、誤った読みを入れると正しい修正を止める側に回る）。
