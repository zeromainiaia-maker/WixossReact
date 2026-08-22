# §6.2 段2 第23バッチ報告 — 「あなたの（すべての）＜クラス＞のシグニは…されない」

## 結論

指定4効果を採用し、`GRANT_PROTECTION.target{count:1}` を既存の `subjectFilter` / `subjectOwner:'self'` へ正規化した。全カード生パースの変化集合は指定4効果だけで outlier 0。`WX15-010-E1` は「次にバニッシュされる場合」を1回だけ消費する `GRANT_PROTECTION` 語彙が存在しないため、集合・クラスだけを足して無制限耐性を3体へ拡大する退化を避け、丸ごと据え置いた。

parser だけの変更では群Aが no-op になることを実コードで確認したため、既存 `field_grants_active` と `granted_effects` を使って期間つき `subjectFilter` を実行可能にした。新しい型・新しい state フィールドは作っていない。最終 `npm run gates` は全緑（golden 2448 / FAIL 0）。

## 1. 触ったファイルと各1行の理由

| ファイル | 理由 |
|---|---|
| `src/data/parsers/parseSentencePart1.ts` | 「バニッシュされない」分岐にクラス集合の `subjectFilter` 枝と、一回耐性・対象指定形の除外ガードを追加。 |
| `src/engine/effectExecutor.ts` | AUTO/ACTIVATED の `subjectFilter` を no-op にせず、既存の場レベル／付与効果ストアへ載せる。 |
| `src/engine/effectEngine.ts` | BANISH collector にルリグ発生源、期間 field grant、`excludeSelf`、by-source field grant を配線。完全効果耐性 collector に期間 field grant を配線。 |
| `scripts/goldenTest.ts` | 採用4効果の一致2体／不一致／追加条件、C1据置、既存期間subjectFilterの後続シグニ適用をE2E固定。第21バッチ harness も集合形を扱うよう更新。 |
| `public/data/effects_WX.json` | `heldReview --adopt` で指定4カードの fresh を採用。変化した実効果は4 effectIdだけ。 |
| `docs/decompile_sheet1.txt` | `WX08-018-E1` の逆翻訳を再生成。 |
| `docs/decompile_sheet2.txt` | `WX21-Re07-E1` の逆翻訳を再生成。 |
| `docs/decompile_sheet3.txt` | `WX22-Re04-E2` / `WXEX1-01-E2` の逆翻訳を再生成。兄弟効果は不変。 |
| `docs/_vocab_census.txt` | クラス語彙の対応済み効果を再集計（全体の高シグナル702は据え置き）。 |
| `docs/_census_stubs.txt` | engine 行番号を含むSTUB索引をゲートで再生成。件数不変。 |
| `docs/BUGFIXES.md` | 第23バッチの一次記録を先頭へ追記。 |
| `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_batch23_report.md` | 本報告書。 |

## 2. 調査結果 — ガードレール2 (a)(b)(c)

### (a) `from:['BANISH'] + subjectFilter` をBANISH collectorは読むか

**読む。ただし着手時は2つ穴があった。**

- `collectBanishEffectProtectedSigni` は `from` に `BANISH` / `any` があることを確認した後、`subjectFilter` 一致シグニを `matchesFilter` で集合へ追加する（`src/engine/effectEngine.ts:4919,4957-4961`）。今回 `excludeSelf` も同じ地点で明示評価した。
- 同関数は着手時に発生源を `state.field.signi` だけから列挙しており、ルリグ能力 `WXEX1-01-E2` は構造が正しくても読まれなかった。シグニ＋センタールリグを `sourceNums` にする配線を追加した（`src/engine/effectEngine.ts:4937-4941`）。
- `collectBanishBySourceProtectedSigni` も `from:['BANISH']` と source type / level を確認後、`subjectFilter` 集合を読む（`src/engine/effectEngine.ts:5012,5051-5069`）。同じくルリグ発生源と `excludeSelf` を補った。
- 一時付与の `PROTECTION_BY_SOURCE:*` も、従来の `keyword_grants` に加えて active field grant を読む（`src/engine/effectEngine.ts:5103`）。今回の4効果は `bySourceType` を持たないが、同じ subject 配線を片側だけにしないため対で接続した。

### (b) `UNTIL_END_OF_TURN` の一時付与でも `subjectFilter` は honor されるか

**着手時はされなかった。parserだけ直すと群Aは完全no-opになった。engine配線後は honor される。**

- 着手時の `execGrantProtection` は `!target && subjectFilter` を「CONTINUOUS用宣言」としてログだけ出して終了していた。つまり `WX08-018-E1` / `WX21-Re07-E1 c1` を subjectFilter 化すると保護が全消滅する状態だった。
- 修正後の `execGrantProtection`（`src/engine/effectExecutor.ts:5418`）は、通常の集合付与を既存 `applyActiveFieldGrant`（同 `:98`）へ渡し、`field_grants_active` に `FieldGrant{kind:'keyword', keyword:'PROTECTION:…', filter:subjectFilter}` を積む（同 `:5441`）。`FieldGrant` は active 中に filter を毎回評価し後続シグニにも効き、ターン終了時に既存 funnel が消す（`src/types/index.ts:330-333`、`src/screens/battle/turnScopedState.ts:117`）。
- `excludeSelf` を含む `WX22-Re04-E2 c2` は field grant だけでは発生源identityを保持できないため、既存 `granted_effects` に発生源シグニ自身が得た CONTINUOUS `GRANT_PROTECTION` として格納する（`src/engine/effectExecutor.ts:5426-5437`）。これにより後から場へ出た＜英知＞も保護しつつ、collector の `sourceNum` で自身を除外できる。
- BANISH側は `field_grants_active` の保護キーワードを `collectBanishEffectProtectedSigni` が読む（`src/engine/effectEngine.ts:4975-4988`）。完全効果耐性側も `collectEffectImmuneSigni` が同ストアを読む（同 `:5435`）。
- golden は実liveの action を実行してから collector と BANISH を通す。したがって「JSONがそれらしい」だけでなく、置換後に本当に守られることを確認した。

### (c) `subjectOwner` 省略時の既定は self か、無条件受理か

**既定は self。無条件受理ではない。ただし消費地点ごとの暗黙さを避けるため、今回の生成JSONでは全4効果に `subjectOwner:'self'` を明示した。**

- 型コメントが省略時 self を契約化している（`src/types/effects.ts:1711`）。
- 期間付与の実行地点は `a.subjectOwner ?? 'self'` を使う（`src/engine/effectExecutor.ts:5426,5441,5450`）。
- `collectEffectImmuneSigni` は `opponent` のときだけ相手stateへ切り替え、それ以外（省略を含む）は自stateを使う（`src/engine/effectEngine.ts:5385`）。
- BANISH / by-source collector は保護対象側として渡された `state.field.signi` を走査する（同 `:4958,5066`）ため、省略は実質self。省略を「両者無条件」としては扱わない。

## 3. 採用した効果の全件

JSON欄は live の該当 leaf（既存の外側 condition / CHOOSE は併記）である。`from` / `sourceOwner` / `duration` は旧liveから不変。

| effectId | 原文の該当節 | 生成JSON | 逆翻訳文全体 | 一致 |
|---|---|---|---|---|
| `WX08-018-E1` | ターン終了時まで、あなたのすべての＜美巧＞のシグニは「【常】：バニッシュされない。」を得る。 | `{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","story":"美巧"},"subjectOwner":"self","from":["BANISH"],"sourceOwner":"any","duration":"UNTIL_END_OF_TURN"}` | 【起】（アタックフェイズ起動）/スペルカットイン：〈《緑×1》〉あなたの場にクロス状態のシグニがいる場合、あなたの＜美巧＞のシグニは効果によってバニッシュされない | **Yes**。クラスと全体性を復元し、既存のコスト・使用条件・全原因効果耐性を維持。 |
| `WX21-Re07-E1` `choices[1]` (`c1`) | ②対戦相手のターンの場合、ターン終了時まで、あなたのすべての＜天使＞のシグニは「【常】：バニッシュされない。」を得る。 | `condition:{"type":"TURN_OWNER","owner":"opponent"}; action:{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","story":"天使"},"subjectOwner":"self","from":["BANISH"],"sourceOwner":"any","duration":"UNTIL_END_OF_TURN"}` | 【起】（メイン起動）/（アタックフェイズ起動）：〈《白×0》〉以下の2つから1つを選ぶ【あなたのデッキから10枚まで＜天使＞のシグニを探してトラッシュに置く（その後シャッフル） / 対戦相手のターンの場合、あなたの＜天使＞のシグニは効果によってバニッシュされない】 | **Yes**。天使全体と相手ターン条件を両方保持。自分ターンは選択肢 `available:false` をE2E固定。 |
| `WXEX1-01-E2` | 【常】：対戦相手のターンの間、あなたの＜アーム＞のシグニは対戦相手の効果によってバニッシュされない。 | `activeCondition:{"type":"TURN_OWNER","owner":"opponent"}; action:{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","story":"アーム"},"subjectOwner":"self","from":["BANISH"],"sourceOwner":"opponent","duration":"PERMANENT"}` | 【常】《対戦相手のターンの間》あなたの＜アーム＞のシグニは対戦相手の効果によってバニッシュされない | **Yes**。ルリグ発生源からアーム全体を保護し、相手効果・相手ターン限定を維持。 |
| `WX22-Re04-E2` `choices[2]` (`c2`) | ③「【常】：あなたの他の＜英知＞のシグニは対戦相手の効果によってバニッシュされない。」 | `{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","story":"英知","excludeSelf":true},"subjectOwner":"self","from":["BANISH"],"sourceOwner":"opponent","duration":"PERMANENT"}` | 【自】このシグニが場に出たとき：以下の3つから1つを選ぶ【[STUB:引用された能力を付与する（原文参照）] / [STUB:引用された能力を付与する（原文参照）] / あなたの他の＜英知＞のシグニは対戦相手の効果によってバニッシュされない】 | **Yes**。英知集合と `excludeSelf` を同時に保持。得たCONTINUOUS能力なので後続の英知にも動的に適用。 |

### E2E証拠

- `WX08-018-E1`：美巧2体が双方生存、非美巧はBANISH。
- `WX21-Re07-E1 c1`：天使2体が双方生存、非天使はBANISH。自分ターンはc1不可、相手ターンは可。
- `WXEX1-01-E2`：相手ターンはアーム2体が双方生存、非アームはBANISH。自分ターンは保護集合0。
- `WX22-Re04-E2 c2`：他の英知2体を保護、効果元自身は非保護。盤面を入れ替えた後も英知だけを動的保護し、非英知と自身はBANISH。

物理盤面は3シグニゾーンなので、B2だけ「効果元＋他の英知2体」と「効果元＋英知＋非英知」の2つの合法盤面で①②③を固定した。他3効果は一致2体＋不一致1体を同一盤面で固定した。

## 4. 見送った効果の全件＋理由

| effectId | 判断 | 理由 | golden |
|---|---|---|---|
| `WX15-010-E1` | **丸ごと据置** | 原文は各＜武勇＞が「次に」バニッシュされる1回だけを置換する耐性。`GrantProtectionAction`（`src/types/effects.ts:1706-1724`）に once / consumable フィールドはなく、`execGrantProtection` とBANISH collectorにも消費処理がない。既存の `once` は `InstallDelayedTrigger`（同 `:1511`）やライフクラッシュ置換（`src/types/index.ts:1128`）の別機構、`PREVENT_NEXT_DAMAGE`（`src/engine/execStubPart1.ts:418`）もプレイヤーダメージ専用。story/allだけ足すと「武勇3体がターン中何度でも保護」へ過剰拡張するため採用しない。 | `subjectFilter` 不在、`target.count:1` 維持、BANISH leaf維持を負の契約として固定。 |

見送り後の逆翻訳全文：`【起】（アタックフェイズ起動）：〈《赤×1》〉あなたのシグニ1体は効果によってバニッシュされない`。一回性を表せていない既存近似であり完全一致とは申告しないが、今回story/allだけを足して誤りを増幅しない。

## 5. 条件以外で見つけた原文との食い違い

**1効果（必要engine配線で同時に是正）。** `WX05-014-E1` は既に live が `subjectFilter:{story:'美巧'}` を持ち、原文注釈も「このアーツの処理後に場に出たシグニにも影響」と明記するが、着手時の `execGrantProtection` は subjectFilter-only をログだけの no-op にしていた。今回の `field_grants_active` 配線で、発動後に場へ出た美巧2体にシグニ／スペル効果耐性が付き、非美巧には付かないことを専用goldenで固定した。live JSON／生パースの差分はない。

ほかの条件外食い違いは0件。

## 6. ゲート数値（before → after）

| 計器 | before | after |
|---|---:|---:|
| `npm run golden` | PASS 2442 / FAIL 0 | **PASS 2448 / FAIL 0** |
| `npm run census` | 高シグナル 702 / baseline 702 | **702 / 702**（全体不変。クラス計器内は60→58） |
| `npm run smoke` | 10693効果、CRASH/HANG/INVARIANT/SKIP 全0 | **10693効果、全0** |
| `npm run fuzz` | 全0 | **seed 12648430、8000手、CRASH/HANG/INVARIANT/EXPLOSION 0、SKIP 0** |
| `npm run census:stubs` | A群🔴0 / C群0 | **A群🔴0 / C群0**（Aの5件は全て明示DEFERRED） |
| `npm run check:manual-fields` | field loss 0 / parseStatus違反0 | **0 / 0** |
| lint | 0 errors / 261 warnings | **0 errors / 261 warnings** |
| `node scripts/groupSimilar.mjs --all` | 同型★0 | **同型★0** |
| held / partial / idset | 88 / 15 / 46 | **88 / 15 / 46** |
| `censusManualDrift` 削除候補 | 86 | **86** |

最後に `npm run gates` を再実行し、全項目PASSを確認した。

## 7. 生パース diff の変化集合（effectId単位）と outlier

修正前に全6712行を `parseCardEffects` した4,373,497 bytesのsnapshotを取り、修正後snapshotと effectId 単位で機械比較した。

変化集合は次の**4効果だけ**：

1. `WX08-018-E1` — `target{SIGNI,self,count:1}` → `subjectFilter{cardType:シグニ,story:美巧} + subjectOwner:self`
2. `WX21-Re07-E1` `c1` — 同 → `story:天使 + subjectOwner:self`
3. `WXEX1-01-E2` — 同 → `story:アーム + subjectOwner:self`
4. `WX22-Re04-E2` `c2` — `target.filter.excludeSelf` → `subjectFilter{story:英知,excludeSelf:true} + subjectOwner:self`

`from` / `sourceOwner` / `bySourceType` / `duration` / 外側conditionは全4効果で不変。`WX22-Re04-E1` / BURST、`WXEX1-01-E1` / E3 など兄弟効果も不変。`WX15-010-E1`、レイヤー形、アクセ形、`N体を対象とし`形は変化なし。

**outlier: 0効果。** live JSONの変化集合も同じ4 effectIdだけ。engine配線で挙動が有効化された既存 `WX05-014-E1` はJSON／生パース差分ではないため、この集合には含めない。

## 8. held / partial / idset の増減、増分照合、lint warning

- 初回 `build:effects`：held **88→92**、partial **15**、idset **46**。増分4カードは上記4 effectIdと1対1で、CSV原文・fresh JSON・live JSONを各1件ずつ照合した。
- `WX08-018`：E1だけ変化。美巧集合なので採用。
- `WX21-Re07`：E1 c1だけ変化。天使集合＋既存相手ターン条件維持なので採用。
- `WXEX1-01`：E2だけ変化。E1/E3不変、アーム集合なので採用。
- `WX22-Re04`：E2 c2だけ変化。E1/BURST不変、英知＋excludeSelf維持なので採用。
- `node scripts/heldReview.mjs --adopt WX08-018,WX21-Re07,WX22-Re04,WXEX1-01` で採用後、再buildして held **92→88**。数値を戻すためではなく4増分を個別採用した結果である。
- 最終 partial **15**、idset **46**。増分0。
- lint warning **261→261**、増減0。errors 0。

## 9. やらなかったことの申告

- `WX15-031` / `WX16-024` / `WX16-034` / `WX16-053` の【レイヤー】形は1文字も変更していない。
- `WX15-102` / `WX15-105` の【アクセ】ホスト形は変更していない。
- `WX21-015` / `WXK07-028` 等の「N体を対象とし、それは能力を得る」形は変更していない。文型ガードも追加した。
- 既に `subjectFilter` を持つCONTINUOUS live JSONは変更していない。必要な一時付与engine配線だけを一般化した。
- `GrantProtectionAction` や `PlayerState` に新型・新フィールドを追加していない。
- `from` / `sourceOwner` / `bySourceType` / `duration` の決定ロジックは変更していない。第21バッチの `sourceOwner:'any'` と rule非拡張を維持した。
- `manualEffects.ts` は変更していない。トップレベルMANUAL/PARTIALの写しも作っていない。
- `buildEffectsJson.ts` にforce-adoptやカード固有リストを追加していない。採用は `heldReview --adopt` だけ。
- カード番号・具体クラス名・閾値をparser regex／engine分岐へ埋め込んでいない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` / `stage2_closed.txt` は編集していない。
- commit / push はしていない。

