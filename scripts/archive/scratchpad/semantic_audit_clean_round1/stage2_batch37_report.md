# 段2 第37バッチ報告：ライフクロスをクラッシュした主体／原因の限定

実施日: 2026-08-23  
基準HEAD: `2cf9a5072`  
方針: findings側のOPEN 8件を入口にし、CSV全文の同文型を1効果ずつ原文照合した。commit / push、`docs/PLAN.md`、`docs/PLAN_PROGRESS.md` の更新は行っていない。

## 1. 母集団の数え直し

`CardData_Sheet1.csv`～`CardData_Sheet10.csv` と `CardData_TK.csv` を直接走査した。全6712行／6712カードを読み、`CardData_Sheet8.csv` の先頭BOMを検出して除去してから、効果ブロック単位で「ライフクロス」＋「クラッシュした／された（とき｜場合）」を抽出した。

| 下位形 | 効果ブロック数 |
|---|---:|
| あなたのシグニ | 10 |
| このシグニ | 39 |
| このルリグ | 1 |
| 【ランサー】によって | 3 |
| 無指定・受動形・その他 | 19 |
| 合計 | 72 |

基準HEADで既に正しく表現済みだった4効果を引いた。

- `triggerScope:'any_ally'`＋`triggerFilter`: 1（`WXDi-P14-087-E1`）
- `ON_SIGNI_CRASHED_LIFE_TOTAL`: 1（`WX05-020-E1`）
- 遅延 `crasherFilter`: 1（`WX25-CP1-069-E1`）
- `OPP_LIFE_CRASH_EVENT_GTE`: 1（`WX16-Re07-E1`）

したがって機械的な差引後は68ブロック。ただし、ここには自分のライフがクラッシュされた受動形、引用能力を含む外側効果、MANUAL/held、別の状態限定が必要な文も含まれる。findings側の今回の母集団は8件で、A/B群6件を閉じ、C群2件はOPENのまま据置した。CSV同文型のlive AUTOを個別照合した結果、findings対象6件＋同規則26件＝論理効果32件を採用した（付与能力の親コンテナ2件は重複計上しない）。

## 2. 実装と配線

新しいaction型やCardEffectフィールドは追加せず、既存の `triggerScope` / `triggerFilter` / `TargetFilter.thisCardOnly` を使った。

- 「あなたの〈filter〉のシグニ」: `triggerScope:'any_ally'`＋実クラッシュ源へ掛ける`triggerFilter`
- 「このシグニ／ルリグ」: `triggerScope:'self'`＋`triggerFilter:{thisCardOnly:true}`。`thisCardOnly` が自己同一性を明示し、同じCardNumの別instanceは一致しない。
- scope省略、および既存の`triggerScope:'self'`単独: 従来挙動を維持する。HEADに既にあった `WX04-094-E1-GRANT` / `WX25-P2-009-E1` を原因一致へ読み替えない。

配線した関数／実機箇所は次の全て。

1. `parseAllyLifeCrashSubject` / `parseBlock`（`src/data/effectParser.ts`）— 原文主語からscope/filterを生成。
2. `oppLifeCrashSourceMatches`（`src/engine/triggerCollect.ts`）— instance一致と実クラッシュ源filterを共通評価。
3. `collectOppLifeCrashedTriggers`（同）— headless collectorから共通predicateを消費。
4. `battleOppLifeCrashSourceMatches`（`src/screens/battle/lifeCrashTriggers.ts`）— 実機用の純関数として同じpredicateへ委譲。
5. `BattleScreen` の `oppCrashSources` ループ（`src/screens/BattleScreen.tsx`）— 実機経路から上記関数を消費。
6. `effJa`（`scripts/decompileEffects.ts`）— scope/filterを原文主語として逆翻訳。

`crashSourceCardNum` が無い旧イベントは互換のため従来どおり通す。通常のcheck-zone funnelはsource instanceを渡すため、実イベントでは限定が評価される。既存ブロック非退化は機械差分で確認し、`scripts/goldenTest.ts` はimport追加と末尾の第37バッチ6テスト追加以外の既存test本文を変更していない。collector / BattleScreenも従来の重複4行を同じpredicate呼び出しへ置換した箇所以外は不変。

## 3. per-effect採用表

「前」は全て `ON_OPP_LIFE_CRASHED` だがクラッシュ主体を表すscope/filterなし。「後A」は `any_ally + cardType:'シグニ'`（必要ならstory付き）、「後B」は `self + thisCardOnly:true`。`-G` は親CONTINUOUS内の実際の付与AUTOで、親コンテナの直列化差分は別効果として数えていない。

| effectId | 原文の該当句 | 修正前JSON要点 | 修正後JSON要点 | 逆翻訳全体 |
|---|---|---|---|---|
| `PR-206-E1` | このルリグが | 主体なし | 後B | 一致 |
| `PR-K078-E1` | このシグニが | 主体なし | 後B | 不一致① |
| `WX03-031-E1` | あなたのシグニが | 主体なし | 後A | 一致 |
| `WX05-027-E1` | このシグニが | 主体なし | 後B | 一致 |
| `WX10-028-E2` | このシグニが | 主体なし | 後B | 不一致② |
| `WX11-028-E1` | あなたの＜ウェポン＞のシグニが | 主体なし | 後A＋`story:'ウェポン'` | 一致 |
| `WX12-022-E3` | このシグニが | 主体なし | 後B | 不一致③ |
| `WX12-028-E1-G` | このシグニが | 主体なし | 後B | 一致 |
| `WX15-033-E1` | このシグニが | 主体なし | 後B | 不一致④ |
| `WX15-054-E1-G` | このシグニが | 主体なし | 後B | 一致 |
| `WX16-030-E2` | このシグニが | 主体なし | 後B | 一致 |
| `WX18-030-E2` | このシグニが | 主体なし | 後B | 不一致⑤ |
| `WX18-032-E1` | このシグニが | 主体なし | 後B | 一致 |
| `WX18-090-E1` | このシグニが | 主体なし | 後B | 一致 |
| `WX24-D2-15-E1` | このシグニが | 主体なし | 後B | 一致 |
| `WX24-P4-104-E1` | このシグニが | 主体なし | 後B | 一致 |
| `WX25-CP1-075-E2` | このシグニが | 主体なし | 後B | 一致 |
| `WX25-CP1-079-E2` | このシグニが | 主体なし | 後B | 一致 |
| `WXDi-CP02-059-E1` | このシグニが | 主体なし | 後B | 不一致⑥ |
| `WXDi-CP02-086-E2` | このシグニが | 主体なし | 後B | 一致 |
| `WXDi-CP02-089-E2` | このシグニが | 主体なし | 後B | 一致 |
| `WXDi-CP02-090-E2` | このシグニが | 主体なし | 後B | 一致 |
| `WXDi-P12-046-E1` | このシグニが | 主体なし | 後B | 一致 |
| `WXDi-P12-047-E2` | このシグニが | 主体なし | 後B | 一致 |
| `WXDi-P16-068-E1` | このシグニが | 主体なし | 後B | 一致 |
| `WXDi-P16-082-E1` | このシグニが | 主体なし | 後B | 不一致⑦ |
| `WXK01-037-E1` | あなたのシグニ1体が | 主体なし | 後A | 不一致⑧ |
| `WXK04-028-E3` | このシグニが | 主体なし | 後B | 不一致③ |
| `WXK05-022-E2` | このシグニが | 主体なし | 後B | 一致 |
| `WXK11-031-E1` | このシグニが | 主体なし | 後B | 一致 |
| `WXK11-045-E1` | このシグニが | 主体なし | 後B | 一致 |
| `WXK11-076-E1` | あなたのシグニが | 主体なし | 後A | 一致 |

逆翻訳の不一致は今回の主体限定以外の既存軸であり、今回追加した主語部分は全32効果で原文と一致する。

1. `PR-K078-E1`: レベル2以下filterと残りの好きな順番が逆翻訳にない。
2. `WX10-028-E2`: 対象がレゾナではなく「あなたのシグニ1体」へ広がっている。
3. `WX12-022-E3` / `WXK04-028-E3`: 「対戦相手にダメージ」をライフクラッシュとして近似している。
4. `WX15-033-E1`: デッキから必ず1枚ではなく「1枚まで」と逆翻訳される。
5. `WX18-030-E2`: 場にライズアイコン持ちがある条件が逆翻訳にない。
6. `WXDi-CP02-059-E1`: 次のルリグアタックステップ開始時ではなく即時クラッシュに見える。
7. `WXDi-P16-082-E1`: 原文にない`TRADE` STUBが併記される。
8. `WXK01-037-E1`: 「その（クラッシュした）シグニ」ではなく任意の自分シグニをバニッシュする表現。

## 4. 据置／非採用

### C群：ランサー原因

`WX07-042-E1` と `WX19-071-E1` は据置。同文型の `WX19-028-E1` も変更していない。check-zoneへ運ばれるのはクラッシュ源instanceまでで、クラッシュ原因が【ランサー】か通常アタックか効果かを示す値がない。原因フィールドだけparserへ足すと実行時に無視される死フラグになるため、今回はcause funnel・複数枚クラッシュの対応配列・全writer/consumerを拡張しなかった。goldenで、causeフィールドを生成しないことと現状の既知過剰発火を固定し、将来funnel実装時に反転させる契約にした。

### 表現できない修飾／温存カード

- `WX13-019-E1`「レゾナではないあなたのシグニ」および `WXK10-063-E1`「ドライブ状態のシグニ」は、source filterに必要な状態判定を今回のpredicateが受け取らないため広い`any_ally`へ近似せず据置。
- MANUAL、held、PARTIAL/idsetはliveへ強制同期していない。今回の対象8件は全てAUTOでliveへ到達済み。

## 5. golden

追加したテスト名は次の6本。

1. `段2 第37バッチ parser契約: A/B群6効果はクラッシュ主体をscope/filterへ載せる`
2. `段2 第37バッチ engine両方向: any_allyは実クラッシュ源のSIGNI/＜ウェポン＞条件で発火を分ける`
3. `段2 第37バッチ engine両方向: 明示selfはwatcher自身のinstanceだけ発火する`
4. `段2 第37バッチ 二重経路契約: engine collectorとBattleScreenは同じsource predicateを使う`
5. `段2 第37バッチ 既存self非退化契約: source個体マーカーのないscope:selfは従来どおり原因を限定しない`
6. `段2 第37バッチ C群据置契約: ランサー原因を運ばない間は死フラグを生成しない`

A群はSIGNI／ルリグ、＜ウェポン＞／非＜ウェポン＞の正負対照、B群はwatcher自身／別カードに加えて同じCardNumの別instanceの正負対照を固定した。同じ盤面・watcher・クラッシュ源をengine collectorと`battleOppLifeCrashSourceMatches`へ渡し、成立／不成立と両経路の結果一致を直接assertした。BattleScreenの実機ループがその検証済み関数を呼ぶことも固定した。

## 6. held / partial / idset

集合の増減はない。

| 生成物 | before | after | added / removed |
|---|---:|---:|---|
| `_held_fresh.json` | 83 | 83 | 0 / 0 |
| `_partial_fresh.json` | 15 | 15 | 0 / 0 |
| `_idset_fresh.json` | 46 | 46 | 0 / 0 |

fresh内容だけが同規則で変わった温存候補を原文照合した。

- held: `WX25-CP1-080-E2`（self）、`WX25-P3-085-sub-E1`（self、親`E1`にも直列化差分）、`WXDi-CP02-050-sub-E1`（あなたのシグニ、親`E1`にも直列化差分）、`WXDi-CP02-054-E3`（self）。主語追加自体は原文どおりだが、カードの他軸heldを解かずlive非採用。
- partial/idset: `WX20-038-E3`（self）。主語追加自体は原文どおりだが、同カードの別効果がPARTIAL/idset温存なのでlive非採用。

## 7. 条件外の不一致

per-effect表の不一致①～⑧を自主申告する。今回のfindingで指摘されたクラッシュ主体は6件すべて解消しているが、これら別軸は閉じていない。`WX13-019-E1` を開発途中に広いany_allyへしてしまう候補差分も検出し、文頭アンカーと未解釈修飾ガードを追加してliveをHEADへ戻した。

## 8. ゲート before / after

| 計器 | before (`2cf9a5072`) | after |
|---|---:|---:|
| golden | 2612 PASS / 0 FAIL | 2618 PASS / 0 FAIL |
| census | 622 / BASELINE_HIGH 622 | 621 / BASELINE_HIGH 621 |
| smoke | 10693、異常0、SKIP 0 | 10693、異常0、SKIP 0 |
| fuzz | 全0 | 全0 |
| `groupSimilar --all` 同型★ | 0 | 0 |
| census:stubs | A群0 / C群0 | A群0 / C群0 |
| manual-fields | 0 | 0 |
| lint | 0 errors / 261 warnings | 0 errors / 261 warnings |
| held / partial / idset | 83 / 15 / 46 | 83 / 15 / 46 |

`npm run regen` と `npm run gates` を実行し、全緑。census純減1は `WX11-028-E1` の＜ウェポン＞filter復元で、`scripts/vocabCensus.ts` のbaselineを実数621へ更新した（PLANは編集禁止のため未更新）。

台帳はfindingsのquoteを実データで照合し、対象6 effectIdはいずれもfindingが1本だけで今回その全軸を直したためID-only形式で閉じた。段2消化は286→292、残OPENは819→813。C群2件は記載せずOPENを維持した。

## 9. エンコーディング検査

最終 `git diff --name-only` 全ファイルをHEADとバイト／文字比較し、新規 `U+FFFD` 0、3文字以上連続`?` 0、先頭BOM新規0を確認した。`CardData_Sheet8.csv` の既存BOMは母集団走査時に除去して読んだだけで、CSV自体は変更していない。報告書はUTF-8・BOMなし。
