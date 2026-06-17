# トークンカード（CardData_TK.csv）と呼び出し元・実装状況メモ

`public/data/CardData_TK.csv` に収録されているトークン／クラフト／レゾナ／グロウ先カードと、
それを「生成・呼び出す」本体カードの対応表。実装状況は engine（`src/engine`）と effects JSON
（`public/data/effects_*.json`）を 2026-06-17 時点で調査した結果。

凡例：✅=実装済 / ⚠️=部分的・要確認 / ❌=未実装

## 1. クラフト系アーツ／スペル／ピース（ルリグデッキに加えるタイプ）

| トークン | 呼び出し元 | 生成機構 | 状況 |
|---|---|---|---|
| WXK01-TK-01A 棘々迷路 | WXK01-042 幻怪姫 イバラヒメ | `ADD_CRAFT_TO_LRIG_DECK` | ✅ |
| WXK03-TK-01B 落華流粋 | WXK03-002 カーニバル †MAIS† | `ADD_CRAFT_TO_LRIG_DECK`(名前解決) | ✅ 生成確認。本体E1のCHOOSE(4/最大2)を `CONDITIONAL_MULTI_CHOOSE_BY_CENTER` 単体に修正（余分なアサシン付与/手札2捨ての二重実行を除去）。WXK03-002【出】declare→ZEROも修正(下記) |
| WXK09-TK-01A 改造素材 | WXK09-015〜020 コード・ピルルク各種, WXK09-047/048/049/077/084, WXK10-050 ほか コードアート群 | `ADD_CRAFT_TO_LRIG_DECK` | ✅ |
| WXDi-P16-TK01 インビンシブル・ストーリー | WXDi-P16-009 ガブリエラ / -010 アザエラ / -011 ミカエラ | `ADD_CRAFT_TO_LRIG_DECK`（stub） | ✅ |
| WXDi-P14-TK01〜05 フェゾーネマジック5種 | WXDi-P14-006 遊月・燦, -007 アロス・ピルルク kl, -008 アン＝サード, -009 ウリス, -071 アキノ | フェゾーネ機構（commit a50c4319 で実装） | ✅ |
| WX25-P1-TK1〜6 ダーク系（バウンダリー/背闇之陣/アナライズ/闇気揚々/アウト/ヤミノザンシ） | うらら系ルリグの「ダークアーツ」機構（個別名指しでなく汎用生成） | クラフトアーツ生成 | ⚠️ 名指し呼び出し元なし。TK6 ヤミノザンシのみ WX25-P1-034 ヤミノ＝Ⅲ が `CRAFT_TO_LRIG_DECK` で生成 |

## 2. レゾナ／レゾナクラフト（出現条件で場に出すタイプ）

呼び出し元は `ADD_CARD_TO_LRIG_DECK_HIDDEN` でレゾナをルリグデッキに加え、出現条件を満たして場に出す。

| トークン | 呼び出し元 | 状況 |
|---|---|---|
| WXDi-P11-TK01/02 サタン・フルムーン | WXDi-P11-013 サシェ・クラフト | ✅ |
| WXDi-P11-TK03/04 メリゴラン・アスレ | WXDi-P11-019 アイヤイ★クラフト | ✅ |
| WXDi-P11-TK05/06 アラクネ・パイダ・オウグソク | WXDi-P11-025 ミュウ＝クラフト | ✅ |
| WX25-P2-TK03/04 ウィクロンジャービークル・ロボ | WX25-P2-017 ララ・ルー"Craft" | ✅ |
| WX25-P2-TK05/06 ニヴルヘイム・ユミル | WX25-P2-021 ソウイ＝クラフト | ✅ |

## 3. シグニトークン（効果で場に出すタイプ）

| トークン | 呼び出し元 | 生成機構 | 状況 |
|---|---|---|---|
| WX25-CP1-TK1A 雷ちゃん | WX25-CP1-066 白石ウタハ | `ADD_TO_FIELD` cardName | ✅ E1にcardName明示・常時ロード・execAddToFieldで解決 |
| WX24-P3-TK1A ママ勇者 | WX24-P3-018 ちより 第三章 | `ADD_TO_FIELD` cardName | ✅ E2にcardName明示 |
| WXDi-CP02-TK01A ペロロ人形 | WXDi-CP02-028 阿慈谷ヒフミ[助けて、ペロロ様！] | `ADD_TO_FIELD` cardName | ✅ E1にcardName明示 |
| WXDi-CP02-TK02A 雨雲号 | WXDi-CP02-041 奥空アヤネ(水着) | `ADD_TO_FIELD` cardName | ✅ E1にcardName明示 |
| WXDi-CP02-TK03B クルセイダーちゃん | WXDi-CP02-029 阿慈谷ヒフミ(水着) | `ADD_TO_FIELD` cardName | ✅ E1にcardName明示 |

## 4. 下に置くクラフト（レイヤー）

| トークン | 呼び出し元 | 生成機構 | 状況 |
|---|---|---|---|
| WX25-CP1-TK2A 給食推進車両 | WX25-CP1-083 鰐渕アカリ(正月) | `PLACE_CARD_UNDER_SIGNI` | ✅ |
| WXDi-CP02-TK03A 虎丸 | WXDi-CP02-061 棗イロハ | `PLACE_CARD_UNDER_SIGNI` | ✅ |

## 5. アクセクラフト

| トークン | 呼び出し元 | 生成機構 | 状況 |
|---|---|---|---|
| WXDi-P09-TK01A/02A/03A コードイート ケチャチャ/セアブラマシマシ/オンタマ | WXDi-P09-007 メル＝チアーズ | `ADD_CARD_TO_LRIG_DECK` + `ACCE_FROM_HAND` | ✅ |

## 6. 純トークン（盤外の印・状態）

| トークン | 呼び出し元 | 生成機構 | 状況 |
|---|---|---|---|
| WX24-D1-TK1 リミットアッパー | WX24 各種エンハンス(P1-031 ほか計13枚), 至る果てへ等 | `PLACE_LIMIT_UPPER` + リミット計算側。`limit_upper_token`(boolean)が正データ。盤面はアシスト左の枠にトークンカード表示(BoardComponents) | ✅ |
| WX24-P1-TK2A ルリグバリア | WX24-P1-001 セイクリッド・フォース ほか多数（純白の防壁等） | `GAIN_LRIG_BARRIER` → フリーゾーンにトークン設置、ルリグアタックで消費 | ✅ 付与配線済 |
| WX26-CP1-TK01 シグニバリア | WX26-CP1-001 FUTURE SESSION ほか多数 | `GAIN_SIGNI_BARRIER` → フリーゾーンにトークン設置、シグニ攻撃時 `crashOneLife` で消費 | ✅ 実装済 |
| WX25-P3-TK03 みこみこ親衛隊 | WX25-P3-023 さんさんおせおせ ほか | `GRANT_KEYWORD` + ON_TURN_END実体 | ✅ `WX25-P3-TK03-E1`(ON_TURN_END:手札1捨て→`REMOVE_MIKO_KEYWORD`)を`collectTurnTriggers`のKEYWORD_TOKEN_MAP経由で実行 |
| WXDi-P05-TK01A ハスターリク | WXDi-P05-016 ウムル＝トレ | `HASTARLIQ` stub | ✅ |

## 7. グロウ先・変身先（厳密にはトークンでない、TK.csv に同居）

| カード | 元カード | 状況 |
|---|---|---|
| WXDi-P13-003B 未知の巫女 マユ | WXDi-P13-003A 未知の邂逅 | グロウ/変身機構 |
| WXDi-P13-004B UNKNOWN-CODE-RU- | WXDi-P13-004A UNKNOWN | 同上 |
| WXDi-P16-001B 扉の俯瞰者 ウトゥルス | WXDi-P16-001A NEXT GATE | 同上 |
| WXDi-P11-010B 夢限 -A- | 夢限 -Q-（グロウ） | グロウ機構 |
| PR-Di017B REV:アンコーリング | PR-Di017A 白熱する黒白 | 領域移動で姿が変わる |

## 8. 名指し呼び出し元が検出できなかったトークン

| トークン | 備考 |
|---|---|
| WXDi-P07-TK01-A サーバント ZERO | ✅ `*_SERVANT_ZERO`系stub（`ALL_OPP_SIGNI_SERVANT_ZERO`/`SIGNI_SERVANT_ZERO`/`DECLARED_NAME_TO_SERVANT_ZERO`）が cardNum を直接指定して変換（名前一致不要）。WXK03-002【出】も `DECLARED_NAME_TO_SERVANT_ZERO value:'field'` で場限定変換に修正済み |

---

## バリア実装メモ（2026-06-17 実装）

両バリアの **付与経路** を共通方式で配線した。

- **保持: 数値カウンタではなく `field.free_zone` にトークンカードとして設置**（ルリグバリア=`WX24-P1-TK2A`、
  シグニバリア=`WX26-CP1-TK01`）。ヘルパーは `execUtils.ts`（`LRIG_BARRIER_CARD`/`SIGNI_BARRIER_CARD`/
  `countBarrierTokens`/`addBarrierTokens`/`removeOneBarrierToken`）。盤面のフリーゾーンにカードとして表示される。
- 付与: `GAIN_SIGNI_BARRIER`/`GAIN_LRIG_BARRIER` stub（`execStubPart3.ts`、`count` 任意対応）が
  フリーゾーンにトークンを push。
- 消費: シグニ攻撃のライフクラッシュ中核 `crashOneLife`（`BattleScreen.tsx`）冒頭でシグニバリアトークンを
  1枚除外（`prevent_next_damage` より優先）。ルリグバリアはルリグアタック解決時にトークンを1枚除外。
- 付与配線（`scripts/fixBarrierGrants.mjs`）: パーサが `GRANT_KEYWORD(keyword:"○バリア")` という
  プレースホルダにしていた10件を `GAIN_*_BARRIER` stub に置換（WXDi-P16-003 は `count:2`）。
  付与が落ちていた4枚（WXDi-P12-001 / WXDi-CP02-001 / WX25-P3-001 / WXDi-P14-001選択肢①）に GAIN step を追加。

### CHOOSE 再構築で対応済み（scripts/fixSacredForceChoice.mjs / fixFutureSessionChoice.mjs）

- **WX24-P1-001 セイクリッド・フォース** … 単一 `REVEAL_PICK` に潰れていたのを `CHOOSE(choose_count:2, from_count:3)` に再構築。①GAIN_LRIG_BARRIER / ②BOUNCE / ③REVEAL_PICK。
  ※「2つ**まで**」の up-to は CHOOSE に表現力がなく choose_count:2 固定で近似。
- **WX26-CP1-001 FUTURE SESSION** … `CHOOSE(choose_count:1, from_count:3)` に再構築。①GAIN_SIGNI_BARRIER / ②REVEAL_PICK(近似) / ③UNKNOWN(未実装)。
  ※リコレクト4枚以上で「2つまで」に上昇する点は未対応（choose_count 固定）。②のプリオケ→エナと③の遅延能力付与は未実装。

### 専用 stub / 付与能力実体化で対応済み

- **WX25-P3-050 エビディバ!!!!!**（`scripts/fixEvdivaPerLrig.mjs` / stub `EVDIVA_PER_LRIG_COLOR`）…
  場の色別ルリグ数ぶんに実行。白=ルリグバリア / 青=ドロー3 / 緑=エナチャージ3 / 黒=相手ミル10 を決定的に実装。
  ※赤（合計12000以下バニッシュ）は対象選択が必要なため未実装ログのみ。
- **WXDi-P15-003 ひらけ！ゲート！**（`scripts/fixOpenGateGrant.mjs`）…
  `GRANT_LRIG_ABILITY.abilities` を実体化。センタールリグに『【起】エクシード4：シグニバリア』『【起】エクシード4：ドロー4』を付与（`lrig_granted_auto_effects` 経由で起動可能）。
- **PR-Di035 OPEN DREAM LAND!**（`scripts/fixOpenDreamLand.mjs` / stub `PRDI035_PARADISE_COLOR`）…
  ＜プリパラ＞が共通色を持ちレベル3種類以上ある色の効果を実行（白=両バリア / 赤=相手ライフ1トラッシュ / 青=ドロー3+相手手札3捨て / 緑=相手シグニ全てエナへ / 黒=相手ミル20）。
  ※本来「次のあなたのアタックフェイズ開始時」の遅延判定だが遅延トリガー機構がなく即時で近似。青の相手手札捨ては先頭3枚で近似。
- **WX25-P2-001 スター・ダスト** … 既存の `game_guard_barrier_act` 特殊経路で対応済み（変更不要）。

### 検証

- `scripts/_verifyBarrier.ts`（`npx tsx scripts/_verifyBarrier.ts`）でエンジンレベルの自動検証（12項目全パス）。
  バリアヘルパー / `GAIN_*_BARRIER` / `EVDIVA_PER_LRIG_COLOR` / `PRDI035_PARADISE_COLOR` を確認。
- `npm run typecheck` / `npm run build` 通過。実機（Supabaseマルチプレイ対戦UI）での目視確認は未実施。

### リミットアッパー表示（2026-06-17）

- `limit_upper_token`(boolean)を正データとして維持。盤面では**アシスト左の枠**にトークンカード（WX24-D1-TK1）を表示
  （`BoardComponents.tsx` の `assistLSlot`。リミットアッパー有効時はアシストルリグ不在＝アシスト左が空）。
- `battleCardNums` に `WX24-D1-TK1` を常時ロード追加（画像解決のため）。

### 既知の近似・未対応（再掲・2026-06-17 更新）

- ~~CHOOSE の「N つまで(up to)」と、リコレクト枚数で choose_count が増える挙動~~ → v0.327 で実装済み（`upTo`/`recollect`）。
- ~~FUTURE SESSION ②（プリオケ1枚をエナへ送る2段階ピック）~~ → **実装済み**。
  `REVEAL_PICK_HAND_SHUFFLE_BOTTOM` の `secondPick` 経由で、手札ピック後に残りから
  ＜プリオケ＞(CardClass 一致) を1枚までエナへ送り、残りをデッキ下へ（`REVEAL_SECOND_PICK_ENERGY` stub）。
  検証: `scripts/_verifyFutureSession2.ts`（22項目パス）。
- ~~エビディバ赤 / PR-Di035 遅延タイミング / FUTURE SESSION ③（遅延能力付与）~~ → v0.327 で実装済み。
- **PR-Di035 青の相手手札捨て**は依然「先頭3枚固定」で近似（本来は相手が選ぶ）。対人戦で要改善。

## その他のTODO
- ~~みこみこ親衛隊のターン終了時 手札捨て→除去~~ → 実装済み（`WX25-P3-TK03-E1` ON_TURN_END +
  `REMOVE_MIKO_KEYWORD` stub、`collectTurnTriggers` の KEYWORD_TOKEN_MAP 経由）。
- ~~シグニトークン（雷ちゃん/ママ勇者/ペロロ人形/雨雲号/クルセイダーちゃん）の `ADD_TO_FIELD` 名指し解決~~
  → effects JSON で `cardName` 明示・`battleCardNums` に常時ロード済み。`execAddToField` のゲーム外生成経路で解決。
- ~~サーバント ZERO（全角ＺＥＲＯ）の名前一致~~ → `*_SERVANT_ZERO` 各 stub が cardNum `WXDi-P07-TK01-A` を直接指定で解決済み。
- ダーク系（WX25-P1-TK1〜6）はうらら系の汎用「ダークアーツ」生成機構経由（WX25-P1-034 E2 の CHOOSE で配線済み）。
