# バグ修正記録 (BUGFIXES)

## 2026-08-31（続き754）：§5.1 実機返済 7 → 6 件（`V-101` クローズ）＋ **手札捨て台帳の真バグを10箇所修正**

ユーザー指示「実機検証を続ける」の1巡。**`V-101`①②③ を実機5シナリオ（すべて両方向）で返済**し、
その過程で**「このターン手札から捨てた」台帳の書き漏れ**という真バグを見つけて直した。
gates 全緑（typecheck / **golden 3119→3121（+2本）・0 FAIL** / smoke 全0 / fuzz 全0 / census 12 /
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。

### ■ 🔴真因（症状ではなく）＝`turn_hand_discarded_cards` を書く支払い地点が3種類あった

`HAND_DISCARDED_THIS_TURN{filter}`（`effectEngine.ts:871` / `:1363` ／ `execUtils.ts:2336`）は
**枚数カウンタではなく実体リスト（`turn_hand_discarded_cards`）を絞って数える**。
ところがコストで手札を捨てる地点は10箇所あり、実装が**3種類に割れていた**：

| 支払い地点 | 旧 `turn_hand_discarded_count` | 旧 `turn_hand_discarded_cards` |
|---|---|---|
| アーツ使用（`performArts`） | ✅ | ✅ |
| スペル使用・**ルリグデッキから** | ✅ | ✅ |
| スペル使用・**手札から** | ✅ | 🔴**無し** |
| シグニ【出】コスト（`executeSigniOnPlayCost`） | 🔴無し | 🔴無し |
| シグニ【起】／ルリグ【起】／キー【起】／アシスト【起】／トラッシュ【起】／ガードシグニ捨て | 🔴無し | 🔴無し |

⇒ **その経路で捨てた turn は条件が永久に false**（無言 no-op）。
とくにスペルの2枝は**同じ関数の中で片方だけ実体を落としていた**ので、
「ルリグデッキから使うと効くのに手札から使うと効かない」という再現しにくい形になっていた。

**実機での再現**＝`WXDi-CP02-055`（猫塚ヒビキ）は1枚で両側を持つ：
E3【出】が手札から＜ブルアカ＞2枚を捨て、E2【自】アタック時がその履歴を読む。
修正前は **`捨て履歴=[] 捨て枚数=0`**（＝【出】のコストで2枚捨てた直後）で、アタックしても相手の手札は減らなかった。

### ■ 直し方＝**唯一の入口**を作って10箇所から呼ぶ

`src/screens/battle/costs.ts` に `handDiscardHistoryRecord(prev, discarded)` を新設し、
**枚数と実体を必ず同時に**積むようにした。既に両方書いていたアーツ／スペル(ルリグデッキ)枝も
この関数へ寄せて、**書き方が分岐する余地を消した**。

⚠**「捨てる」以外を渡さない**＝`handToEnergy`（エナへ）／`handToUnder`（このシグニの下へ）／
`energyTrash`（エナから）は手札を捨てていないので台帳に載せない。各呼び出し地点でコメントを添えた。
⚠**ターン終了時のルール処理（手札上限超過）は通していない**＝あの捨ては `turn_*` がリセットされる
境界と同じ地点で起きるので、載せると寿命が1ティックの値になる（意図的な除外・ヘルパーの JSDoc に明記）。

### ■ golden（+2本）＝**片方だけ書く形を機械で禁止**

- `V-101② handDiscardHistoryRecord: 枚数と実体を必ず同時に積む` … 空配列で何も動かない／初回／追記の3段に加え、
  **不変条件「枚数 === 実体の長さ」**を全状態で assert（旧バグはここが 2 対 0 に割れていた）。
- `V-101② HAND_DISCARDED_THIS_TURN は実体を絞って数える` … ＜ブルアカ＞／非ブルアカ／空 の3方向を `evalCondition` で実走。

### ■ `V-101` の実機5シナリオ（すべて両方向・全 PASS）

| シナリオ | カード | 見たもの |
|---|---|---|
| `censusAcceFromEnergy` | `WX22-Re02` | 段1（`targetScope:'self_energy'`）の候補が＜調理＞《アクセアイコン》の**1件だけ**／選ぶとエナから消えて【アクセ】へ |
| `censusHandDiscardedBuruakaFires` | `WXDi-CP02-055` | 【出】コストで＜ブルアカ＞2枚を捨てる → アタック時に相手の手札 2→1 |
| `censusHandDiscardedOtherClassNoop` | 同上 | 対照＝捨てたのが＜ブルアカ＞でなければ発動しない（手札 2→2） |
| `censusDelayedPlacedByEffectFires` | `WXDi-P09-010` | 効果（【起】トラッシュから場に出す）で配置 → 遅延トリガー発火で相手に －8000 |
| `censusDelayedPlacedBySummonNoop` | 同上 | 対照＝手札からの通常召喚では発火しない（`placedByEffect` の弁別） |

■**`ATTACH_ACCE.fromEnergy` と `placedByEffect` は engine 側が正しかった**＝実機で炙って両方向とも期待どおり。
実装の穴が出たのは②だけで、**そこは engine ではなく UI の支払い地点**だった（＝golden/smoke/fuzz が届かない層）。

### ■ 実機ドライバで踏んだ罠（次の人が同じ時間を払わないために）

1. 🔴**`H.clickTextOrBtn` は `isEnabled` を検査しない。**
   disabled の「発動」を毎ティック押して `'btn:発動'` を返し続け、**30ティック空振りしても「押せている」ように見える**。
   ⇒ **可否のあるボタンは `H.clickBtn(name, {exact:true})`**（あちらは isEnabled を見る）。ドライバ自身のコメントが
   「disabled のまま押して『クリックした風だが進まない』」を2大罠として警告しているのに、その罠に落ちた。
2. 🔴**ルリグ【起】のボタン名は効果本文ではなく支払い要約**＝実測で `【起】エナ2` と `【起】コストなし` の2件だけ。
   「効果によって」「トラッシュから」といった本文で選び分けようとすると**1つも押せない**。
3. 🔴**`SELECT_SIGNI_ZONE`（効果で場に出すときの配置先）は `ゾーンN` ボタン**で、通常召喚の `summon-zone-N`（testid）
   とは**別の窓**。片方だけ書くと `pEff=SELECT_SIGNI_ZONE` で止まる。
4. 🔴**対象選択（`pick-0`）は「決定」より先に置く。** 逆順だと毎ティック「決定 (0/1)」を押しに行って pick へ到達せず、
   `pEff=SELECT_TARGET` のまま空回りする。
5. **解決待ちの窓が開いている間はルリグ/カードを触らない**（裏でカード詳細が開いて操作を食う）。
6. **ルリグ【起】のコストUIに testid は無い**＝エナ札は `<img alt={CardName}>` を包む div の onClick なので
   **カード名で掴む**。モーダル外の同名カードはオーバーレイに覆われて click が通らないので、
   `force` を付けずに順に試し、通ったものだけを支払いとして数える。

### ■ 再現手段

```
node scripts/verifyBattleDrive.mjs censusAcceFromEnergy censusHandDiscardedBuruakaFires \
  censusHandDiscardedOtherClassNoop censusDelayedPlacedByEffectFires censusDelayedPlacedBySummonNoop
npm run golden -- --only "V-101②"
npm run gates
```

## 2026-08-31（続き753）：§5.1 実機返済を 10 → 7 件（`V-93` / `V-95` / `V-102` をクローズ）

ユーザー指示「§5.1【最優先】実機未検証の返済」の1巡。**`src/` は1バイトも触っていない**＝変更は
`scripts/verifyBattleDrive.mjs`（ドライバのフレーク修正＋観測点1つ＋新規シナリオ3本）と docs のみ。
gates 全緑（typecheck / golden 3119・0 FAIL / smoke 全0 / fuzz 全0 / census 12 / census-stubs A🔴0・C0 /
manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。

### ■ `V-93`＝**engine のバグではなく、実機ドライバのフレークだった**

`wx17040ConditionsTrueExecuteAll` / `wx17040ConditionsFalseNoop`（`WX17-040-E1`＝「以下の3つから3つまで選ぶ」）。
**単独 → 単独 → 連続2本の計4回すべて PASS**（9秒／6秒）。live JSON も逆翻訳も原文と一致したままで、
engine・parser には手を入れていない。

**真因**＝ドライバが**「クリックしたこと」を進行条件にしていた**こと。

```js
await c1.click().catch(() => {});
await c2.click().catch(() => {});
await c3.click().catch(() => {});
did = 'click:選択肢1+2+3'; picked = true;   // ← 押せたかを一度も測っていない
```

`multiSelect` の CHOOSE は1クリックごとに React が再描画する（`EffectInteractionModal.tsx:640` の
`selectedMultiChoiceIds` が更新され、選択済みのラベルが `選択肢N` → `✓ 選択肢N` に変わる）。
続けて押すと直後の locator が **detach 済みの要素を掴んで throw** しうるが、`.catch(() => {})` が
それを握り潰すので、**2つしか選ばれていないまま `picked = true` になって「決定」へ進む**。
`upTo` の確定ボタンは常に enabled なので**そのまま確定できてしまい**、後段の観測（バニッシュ／エナチャージ）
だけが空振りする＝**実行ごとに停止段階が変わる**という記録どおりの症状になる。

**直し方**＝選択済みラベル `✓ 選択肢N` を進行条件にした。1つずつ押して ✓ が付いたことを確かめ、
**3つ揃うまで `picked` を立てない**（`FalseNoop` の③も同じく ✓ 確認へ）。揃わなければ次ティックで押し直す。

🔑**教訓＝実機ドライバでは「押した」ではなく「盤面/DOM が変わった」を進行条件にする。**
`.catch(() => {})` を置いた行は**必ず次の行で「効いたか」を測る**。黙って半端な状態で先へ進むのが最悪の形で、
これは engine のバグと見分けが付かない赤を出し続ける。

### ■ `V-95`＝**書いてあったシナリオを回すだけ**（`HAS_TRAP_IN_FIELD`）

`node scripts/verifyBattleDrive.mjs censusHasTrapInField` → **PASS（9秒）**。
手札 2→1（トラップ無しは不発）→ トラップを `patchPlayerState` で設置してもう1枚召喚 → DRAW で1 の反転確認。
PLAN に書かれていた「Playwright Chromium 未導入／外部認証で timeout」は**既に古い記述**だった（続き747 で解消済み）。

🔑**「ドライバは書いてあるが未実走」の在庫は実装より圧倒的に安い。§5.1 に来たらまず全部回す。**

### ■ `V-102`＝新規シナリオ3本（4方向すべて PASS）

| シナリオ | カード | 見たもの |
|---|---|---|
| `censusSelfCrashToTrashRefill` | `WD06-009` | 自ライフのクラッシュ置換（トラッシュ＋デッキ上を補填）と**回数制**の反転 |
| `censusSideAttackLancerFires` | `WXEX2-71` | 正面以外へアタック→そのシグニが【ランサー】を得る→相手ライフ−1 |
| `censusSideAttackLancerFrontNoop` | `WXEX2-71` | 対照＝正面へアタックすると付かない |

③（`ON_ACCE` のトリガー元）は続き748 で返済済みなので含めていない。

**なぜ実機でしか見えないか**＝
- `SELF_CRASH_TO_TRASH_AND_REFILL` は engine（`execStubPart3.ts:989`）が**カウンタを積むだけ**で、
  置換そのものは `BattleScreen.performLifeBurstResponse`（`BattleScreen.tsx:12644` 付近）の**1点にしかない**。
  golden / smoke / fuzz はこの経路を1行も通らない。
- `triggerCondition.attackedNotFront` は `triggerCollect.ts:4280` で **fail-closed**＝`sideAttack` を渡さない
  収集経路では永久に発火しない。渡しているのは `BattleScreen.tsx:8942` の
  `collectFieldTriggers('ON_ATTACK_SIGNI', …, { sideAttack: isSideAttack })` **1箇所だけ**。

**観測結果**（`censusSelfCrashToTrashRefill`）：
- 対照（残0）＝割った札 `WD01-013#9323` は**エナへ**・life 3→2・deck 3のまま。
- 置換あり（残1）＝**同じ操作**で割った札 `#9322` が**トラッシュへ**・デッキ上 `#9331` がライフ末尾へ・deck 3→2・残回数 1→0。

**観測結果**（`censusSideAttackLancer*`）：
- 側面（host zone0 → opp zone1）＝`keyword_grants` が `側面アタック` → `側面アタック/ランサー` になり、
  バトルバニッシュで**相手ライフ 3→2**（付与が読まれていることまで確認）。
- 正面（host zone0 → opp zone2）＝**付かず**、バニッシュしても相手ライフは 3 のまま。

### ■ シナリオを書くときに踏んだ罠（次の人が同じ時間を払わないために）

1. 🔴**盤面注入で「召喚ボタンが出ない」ときは、まずルリグ限定を疑う。**
   `getMyHandCardActions`（`BattleScreen.tsx:8298`）が `meetsRestriction(cardData.Restriction, lrigClass)` を見るので、
   **エルドラ限定の `WD06-009` は あや のルリグ（`WX22-009`）では召喚できない**。
   症状は「**盤面注入は成功しているのに操作が1手も始まらない**」＝30ティック空振り。
   ⇒ ルリグを `WD06-001`（エルドラ Lv4・Limit11）へ替えて解決。
2. 🔴**回数制の置換は「同じ札・同じ操作で1ビットだけ反転」して測る。**
   チェックゾーンは**クリック待ちで止まる**ので、そこで `self_crash_to_trash_and_refill` を 1→0 に patch してから
   同じ「エナに送る」を押せば、**経路を1本も変えずに**対照が取れる。
   ⚠**別カードで反転しようとしない**＝素の自ライフクラッシュはたいてい `triggerBurst:false` で、
   あれは `execLifeCrash` の else 枝で**直接トラッシュへ**行く（チェックゾーンを通らない別経路）＝比較にならない。
   ⚠**ルリグ限定が違うカードも使えない**（1と同じ理由）。
3. 🔴**patch のあとを固定 sleep で済ませない。**
   realtime 反映前にボタンを押すと**対照のつもりで置換つきを踏み、「置換が無条件に乗っている」と赤を誤報する**（初版がこれ）。
   ⇒ **patch した値を `queryState` で観測してから**次へ進む（最大12回・500ms ポーリング）。
4. **手札モーダルを「1回開けば開いたまま」と仮定しない。**
   毎ティック「召喚ボタンが見えているか」を測り、見えていなければ手札札を押し直す（`censusAcceSelfPlayGate` と同型）。

### ■ 追加した観測点

`queryState` の `sideOf` に **`selfCrashRefill`**（`self_crash_to_trash_and_refill`）を追加。
置換は回数制なので、「2回目に乗らない」を盤面差分だけで言うと**「そもそも1回目も乗っていない」と区別が付かない**＝
カウンタ自体を観測点にした。

### ■ 直していない粗（挙動バグではないので §5.3 には登録しない）

チェックゾーンのボタンは置換が乗っていても **「エナに送る」のまま**（実際はトラッシュ＋ライフ補填）。
**ラベルを変えると 158 シナリオがアクセシブル名でこのボタンを掴んでいる**ので触っていない。
直すなら「ラベル変更＋ドライバ側の名前を一斉に追随」を1巡で通すこと。

### ■ 再現手段

```
node scripts/verifyBattleDrive.mjs wx17040ConditionsTrueExecuteAll wx17040ConditionsFalseNoop
node scripts/verifyBattleDrive.mjs censusHasTrapInField
node scripts/verifyBattleDrive.mjs censusSelfCrashToTrashRefill
node scripts/verifyBattleDrive.mjs censusSideAttackLancerFires
node scripts/verifyBattleDrive.mjs censusSideAttackLancerFrontNoop
```
