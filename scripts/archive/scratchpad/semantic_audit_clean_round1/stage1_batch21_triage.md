# 意味照合監査 clean群 round1 段1 第21バッチ triage（軸 `filter.状態`）

対象は `stage1_batch21.txt` の20 findings / 20 effectId。分類のみを行い、実装・既存ファイル編集は行っていない。

## 1. サマリ

### action型別

| action型 | findings | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| (live無) | 1 | 1 | 0 | 1 | 0 |
| ADD_TO_LIFE | 1 | 1 | 0 | 0 | 0 |
| BANISH | 2 | 2 | 0 | 0 | 0 |
| CHOOSE(CHOOSE/BANISH/SIGNI) | 1 | 1 | 0 | 0 | 0 |
| DOWN | 1 | 1 | 0 | 1 | 0 |
| ENERGY_CHARGE_FROM_DECK | 1 | 1 | 0 | 0 | 0 |
| GRANT_KEYWORD | 2 | 2 | 0 | 1 | 0 |
| GRANT_PROTECTION | 1 | 1 | 0 | 0 | 0 |
| POWER_MODIFY | 4 | 4 | 0 | 1 | 0 |
| REVEAL_AND_PICK | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(DOWN) | 2 | 2 | 0 | 0 | 0 |
| SEQUENCE(FREEZE) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(POWER_MODIFY) | 1 | 1 | 0 | 1 | 0 |
| TRANSFER_TO_DECK | 1 | 1 | 0 | 0 | 0 |
| **計** | **20** | **20** | **0** | **5** | **0** |

`機構待ち`は真バグの内数（S001/S006/S009/S013/S019）。

### 状態語の用法別（排他的な主分類）

| 用法 | findings | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| ①対象フィルタ | 4 | 4 | 0 | 0 | 0 |
| ②効果元の自己条件 | 3 | 3 | 0 | 1 | 0 |
| ③装着ホスト参照 | 0 | 0 | 0 | 0 | 0 |
| ④レゾナ限定（cardType） | 6 | 6 | 0 | 1 | 0 |
| ⑤置換効果 | 2 | 2 | 0 | 1 | 0 |
| ⑥その他 | 5 | 5 | 0 | 2 | 0 |
| **計** | **20** | **20** | **0** | **5** | **0** |

## 2. finding 全20件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠（1行ごとに固有） | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WXK05-053-E1-G | live無 | 真バグ＋機構待ち | 用法⑥。同じzoneの未開花シードは`field.signi_seeds[zi]`に在るが、Condition/ActiveConditionにはゲート専用`SAME_ZONE_HAS_GATE`しかなく、付与AUTO能力の攻撃時ECをシード有無で止めるlive効果自体がない。 | 無し。`evalCondition`/`checkActiveCondition`にsource zone→`signi_seeds`を読む兄弟条件が必要 | `ON_BLOOM`と`SEED_BLOOM(_OPTIONAL)`は開花イベント/処理であり、「同じzoneに未開花シードが在る」条件ではない。 | 同じシグニゾーンに【シード】がある場合 |
| S002 | WXDi-P04-026-E1 | AUTO | 真バグ | 用法①。liveは`fromTop:true`でdeck topをlifeへ移す一方、原文のsourceはself trash、候補は`hasLifeBurst:false`のカード1枚であり、移動元と候補集合がともに反転している。 | `execAddToLife`（`fromTrash`）＋`movableTrashCandidates`/SEARCH経路の`matchesFilter(hasLifeBurst)` | `fromTop:true`にtrash参照の暗黙変換はない。`hasLifeBurst`は`matchesFilter`が`LifeBurst==='1'`を判定する既存filterなので機構待ちでもない。 | トラッシュから【ライフバースト】を持たないカード１枚 |
| S003 | WXEX1-48-E2 | AUTO | 真バグ | 用法⑥。原文はself fieldの`isDown:true`が**ちょうど1体**という盤面条件だが、liveはBANISHするopponent target自身へ`isDown:true`を置き、主語・向き・exact countの三点が違う。 | `evalCondition(HAS_CARD_IN_FIELD)`ではgteになるため、exactは`FIELD_COUNT`相当の状態filter付き比較consumerが必要か段2で正準化確認 | 対象filterの`isDown`は選択候補を絞るだけで、自分盤面のダウン体数を数えない。`ALL_SELF_SIGNI_DOWN`も「全て」でexact 1ではない。 | あなたの場にあるダウン状態のシグニが１体の場合 |
| S004 | WX10-066-E1 | AUTO | 真バグ | 用法④。liveの`filter.cardType:'シグニ'`はレゾナも含む広い集合で、原文はopponentの`cardType:'レゾナ'`1体だけをBANISH対象にする。 | `execBanish`→`fieldCandidates`→`execUtils.matchesFilter`（レゾナ→シグニだけを緩和し、逆方向は厳密） | `cardType:'シグニ'`をレゾナ限定と読む慣例はない。`excludeResona`は非レゾナ限定で向きが逆。 | 対戦相手のレゾナ１体 |
| S005 | WX10-066-BURST | AUTO | 真バグ | 用法④。choice c1だけがpower filter無しの`cardType:'シグニ'`で、LB選択肢②のレゾナ限定が消え、通常シグニまで選べる。 | `execChoose`→`execBanish`→`fieldCandidates`/`matchesFilter(cardType)` | choice labelや同カードE1からfilterを継承する処理はなく、各choice actionは独立して消費される。 | ②対戦相手のレゾナ１体 |
| S006 | WXEX2-28-E1 | AUTO | 真バグ＋機構待ち | 用法⑤。liveはopponentのアップ状態ウェポンを任意DOWNする通常actionだが、原文はselfウェポンが**相手効果で離場する直前**に、アップ状態の効果元自身をDOWNして離場を取り消す置換宣言である。 | 離場funnel側の置換収集が必要。現`effectExecutor`の`EFFECT_LEAVE_REPLACE_BANISH`横取りフックは別destination、`BATTLE_LEAVE_REPLACE_WITH_DOWN`はacknowledged stub | `DAMAGE_REPLACE_BY_COST`はlife damage置換。通常`DOWN.optional`は離場を横取りせず、対象ownerをselfへ直しても別効果のまま。 | 代わりにアップ状態のこのシグニをダウンしてもよい |
| S007 | WXK07-048-E1 | AUTO | 真バグ | 用法②。バニッシュ後に解決する自己条件で、liveにはopponent turn条件だけがあり、効果元が離場直前にcharm付きだったことを保持・評価する条件が欠落する。 | `collectBanishTriggers`系の離脱前state filter/trigger payloadと`evalCondition(THIS_CARD_IS_CHARMED)`の適用地点を段2で選定 | 対象用`hasCharm`をEC actionへ置く意味はない。現在場だけを見る`THIS_CARD_IS_CHARMED`を離場後に素置きすると恒久falseになるため、離脱前snapshotを無視できない。 | このシグニに【チャーム】が付いていた場合 |
| S008 | WXEX2-05-E1 | AUTO | 真バグ | 用法④。liveはowner:anyの宇宙シグニ1体へ永続アサシンだが、原文はselfの宇宙**レゾナ全体**への継続付与で、owner・cardType・countが全て広狭逆転している。 | `collectFieldGrantedKeywords`/継続keyword収集→`fieldCandidates`/`matchesFilter(cardType:'レゾナ',story:'宇宙')` | CONTINUOUS単体targetのhost自動適用は効果元1体へ寄るだけで、selfの宇宙レゾナ全体を導かない。 | あなたの＜宇宙＞のレゾナは【アサシン】を得る |
| S009 | WXK05-052-E1 | AUTO | 真バグ＋機構待ち | 用法⑥。liveはself SIGNI 1体へシードを永続付与する別効果で、原文のopponent 0〜2体への次ターンattack禁止も、効果元と同じzoneのシード存在条件も一つも保持しない。 | attack可否keyword consumerに届くGRANT系＋source zone→`field.signi_seeds[zi]`を読む新Condition/ActiveCondition | `keyword:'シード'`は未開花シード盤面状態の検査ではない。PLAN §3 task13も「体数だけ広げると誤りを増幅」と明記。 | このシグニと同じシグニゾーンに【シード】がある場合、次のターンの間、それらは…アタックできない |
| S010 | WX20-081-E1 | AUTO | 真バグ | 用法④。liveはself SIGNI 1体だけを守り、原文のselfレゾナ全体に対するopponent effect由来BANISH耐性を表すcardType/count filterがない。 | `execGrantProtection`/継続保護collector→`matchesFilter(cardType:'レゾナ')` | `target.type:SIGNI`もcount1も「あなたのレゾナは」という全体宣言へ自動拡張されない。`sourceOwner:'opponent'`は原因限定だけを担う。 | あなたのレゾナは対戦相手の効果によってバニッシュされない |
| S011 | WXK04-049-E2 | AUTO | 真バグ | 用法①。liveはselfの全SIGNIへ+2000し、対象名詞句「アクセが付いているあなたのシグニ」の既存filter `hasAcce:true`が欠落して未アクセも強化する。 | `calcFieldPowers`→`fieldCandidates`/`matchesStateFilter(hasAcce)`（`hasAcceAt`） | 用法②`IS_SELF_ACCED`は効果元1体の条件、用法③`acceHost`はこのカードがアクセである時のhost参照で、いずれも対象集合①とは違う。 | 【アクセ】が付いているあなたのシグニ |
| S012 | WXDi-P07-056-E1 | AUTO | 真バグ | 用法②。liveはopponent turn中なら効果元へ常時+4000だが、原文はさらに効果元自身がアップ状態の間だけであり、`activeCondition:AND[TURN_OWNER opponent,IS_SELF_UP]`相当が欠落する。 | `checkActiveCondition(IS_SELF_UP)`→`calcFieldPowers`（source zoneの`signi_down`を反転評価） | target側`thisCardOnly:true`は対象同定のみ。用法①`filter.isUp`へ置く案も継続自己条件の正準形`IS_SELF_UP`と役割が違う。 | このシグニがアップ状態であるかぎり |
| S013 | WX25-P2-052-E2 | AUTO | 真バグ＋機構待ち | 用法④。liveは自己power+10000だけで、次のopponent turn endまで「効果で参照するときだけレゾナでもある」という一時的な追加cardType identityを一切記録しない。 | 無し。対象候補生成の全`matchesFilter(cardType)`経路が期間付きtype overrideを参照するplayer state台帳と期限更新が必要 | `cardType:'レゾナ'`は選ぶ側の静的filterで、元カードのTypeを一時追加しない。`targetsTriggerSource`も「そのレゾナ」の照応でありidentity変更ではない。 | レゾナとしても扱う |
| S014 | WX05-019-E2 | AUTO | 真バグ | 用法⑥。liveは自己へ恒常+3000だが、原文はopponent fieldの`noAbilities:true` SIGNIが**2体以上**の間だけで、active conditionが丸ごとない。 | `checkActiveCondition(HAS_CARD_IN_FIELD{owner:opponent,minCount:2,filter:{cardType:'シグニ',noAbilities:true}})`→`calcFieldPowers` | `noAbilities`は印字効果なしに加えholderの`abilities_removed`も見る既存consumer。count省略や対象filterでは2体以上条件を補わない。 | 対戦相手の場に能力を持たないシグニが２体以上あるかぎり |
| S015 | WX13-052-E1 | AUTO | 真バグ | 用法⑥。liveは公開した遊具を確認して自己BANISH optionalで終了し、成功後にその公開instanceをself fieldへ`asDown:true`で置く後段が存在しない。 | `execRevealAndPick`のthen結果→`ADD_TO_FIELD{targetsLastProcessed/参照保持,asDown:true}`相当。配置時のDOWNは`execAddToField`が消費 | `REVEAL_AND_PICK.then`はBANISHだけを実行し、公開札を暗黙配置しない。`asDown`はAddToField/PlaceSigniOnFieldに実装済みなので状態語自体は機構待ちでない。 | この効果で公開したシグニをダウン状態で場に出す |
| S016 | WX08-053-E1 | AUTO | 真バグ | 用法④。第1stepはselfのアップSIGNIなら何でもDOWNできるが、原文はselfのアップ状態**レゾナ**1体であり`cardType:'レゾナ'`だけが欠落する。 | `execDown`→`fieldCandidates`→`matchesFilter(cardType:'レゾナ')`＋`matchesStateFilter(isUp)` | `isUp:true`は向きだけ正しく、シグニ包含規則はレゾナ限定を意味しない。後段のdid-it gate有無も第1対象種別を直さない。 | 対象のあなたのアップ状態のレゾナ１体 |
| S017 | WX14-CB02-E2 | AUTO | 真バグ | 用法①。任意DOWN対象のstory/isUpは正しいがownerがopponentへ反転し、自分のアップ状態アームを支払う原文に対して相手盤面をダウンする。 | `execDown`→`fieldCandidates(owner:self,filter:{story:'アーム',isUp:true})` | ON_ATTACKの相手targetや後段BOUNCEのownerは前段cost様DOWNへ継承されない。`optional:true`もownerを直さない。 | あなたのアップ状態の＜アーム＞のシグニ１体をダウンしてもよい |
| S018 | WXK02-052-E1 | AUTO | 真バグ | 用法⑤。liveは選んだ相手を必ずFREEZEして必ずDRAWするため、選択時点で既凍結ならDRAWへ**置換**し未凍結ならFREEZEだけという排他的分岐を失う。 | `SELECT_TARGET_ONLY`→`STORE_LAST_PROCESSED_TARGETS`→`CONDITIONAL{LAST_PROCESSED_MATCHES{isFrozen},then:DRAW,else:FREEZE targetsStored}` | FREEZE後に`LAST_PROCESSED_MATCHES{isFrozen}`を見ると常に真になる。既存WX09-Re01の対象先選択・状態snapshot正準形ならengine追加は不要。 | すでにそれが凍結状態である場合、代わりにカードを１枚引く |
| S019 | WX15-038-E2 | AUTO | 真バグ＋機構待ち | 用法②。liveは自己+3000とSIGNI効果耐性を無条件適用する一方、原文は効果元に付いたアクセの中にカード名《コードイート　テキソス》がある間だけで、既存自己アクセ条件は枚数しか見ない。 | 無し。`ActiveCondition`（必要ならConditionにも兄弟）へnamed-acce条件を追加し、`checkActiveCondition`でsource zoneの`acceCardsAt`をcardName照合 | `IS_SELF_ACCED`/`THIS_CARD_IS_ACCED`は`acceCardsAt(...).length`だけで、別名アクセでも成立する。用法③`acceHost`はアクセカード側からhostを参照する逆向き。 | このシグニが《コードイート　テキソス》にアクセされているかぎり |
| S020 | WX19-022-E1 | AUTO | 真バグ | 用法①。live sourceはopponent SIGNI全般で、原文の選択対象を`noAbilities:true`に狭めるfilterが欠落し能力持ちもdeck bottomへ送れる。 | `execTransferToDeck`→`fieldCandidates`/`hasNoAbility`（holderの`abilities_removed`も統合） | 「能力を持たない」はカードデータだけでなく盤面の能力喪失も含む既存filter。ON_PLAYや白costから暗黙付与される条件ではない。 | 能力を持たない対戦相手のシグニ１体 |

## 3. 用法別の所見

- **①対象フィルタ（S002/S011/S017/S020）**：4件とも候補集合の誤り。S011/S020は既存状態filter、S017はowner反転、S002はsource＋`hasLifeBurst:false`で、状態語engineの新設は不要。
- **②効果元の自己条件（S007/S012/S019）**：S012は既存`IS_SELF_UP`、S007は離脱後解決なので離脱前snapshotを使う必要がある。S019だけは「アクセ有無」でなく**特定名アクセ**で、既存`IS_SELF_ACCED`より狭い新語彙が必要。
- **③装着ホスト参照**：0件。S019を`acceHost`へ寄せない。あれは装着カード自身がhostを強化する用法で、今回の「hostに特定アクセが付く」は②。
- **④レゾナ限定（S004/S005/S008/S010/S013/S016）**：S004/S005/S008/S010/S016は`cardType:'レゾナ'`の既存厳密consumerで届く同一組。S013だけは対象filterでなく、効果元カードの一時的type追加なので別機構。
- **⑤置換効果（S006/S018）**：S018は既存SELECT/STORE/`LAST_PROCESSED_MATCHES{isFrozen}`の対象状態置換。S006は場離れfunnelそのものを横取りするため、通常SEQUENCEでは届かず§6.4 M2の離場置換と同じ組。
- **⑥その他（S001/S003/S009/S014/S015）**：S001/S009は同じ「sourceと同じzoneの未開花シード」条件。S014は既存`noAbilities+minCount:2`、S015は既存`asDown`、S003は対象修飾ではなくself盤面のdown exact countである。

同一機構の組は、レゾナ限定5件（S004/S005/S008/S010/S016）、同zoneシード2件（S001/S009）、能力なし2件（S014/S020）、自己状態条件3件（S007/S012/S019。ただしS019のみ語彙追加）、状態付き配置S015、対象状態置換S018、離場置換S006である。

## 4. 機構待ちの一覧

| 登録単位 / findings | 不足語彙・機構・配線 |
|---|---|
| sourceと同じzoneの未開花シード条件 / S001,S009 | `SAME_ZONE_HAS_SEED`相当をActiveCondition/Conditionへ追加し、`checkActiveCondition`/`evalCondition`で`sourceCardNum`のzone indexから`ownerState.field.signi_seeds[zi]`を読む。`SAME_ZONE_HAS_GATE`の兄弟だが、`ON_BLOOM`/`SEED_BLOOM`とは別。PLAN task13の`WXK05-052-E1`既登録と同一で二重登録しない。 |
| 相手効果離場を自己DOWNで置換 / S006 | 場離れ共通funnelで被害側CONTINUOUS宣言を収集し、victimがselfウェポン・sourceがopponent effect・宣言hostがupを満たす時にhost DOWNを選び移動を取消す。**第12バッチ§4／PLAN §6.4 M2「離場置換」と同一機構**として二重登録しない。`DAMAGE_REPLACE_BY_COST`とは別。 |
| 期間付き「効果参照時はレゾナでもある」 / S013 | player stateへcardNum＋expiryの追加type台帳、`execPowerModify`後の付与、全対象候補の`matchesFilter(cardType:'レゾナ')`でのtype override参照、opponent turn end期限消費。静的`cardType`/`excludeResona`とは別。 |
| 特定カード名のアクセが効果元に付く条件 / S019 | `IS_SELF_ACCED_BY{cardName}`相当（Condition兄弟が必要なら同時追加）と`checkActiveCondition`/`evalCondition`からsource zoneの`acceCardsAt`→`cardMap.CardName`照合。既存`IS_SELF_ACCED`は枚数だけ、`acceHost`は逆向き。 |

機構待ちは**5 findings / 4登録単位**。盤面状態9語彙そのものを機構待ちにしたものは0件で、S001/S009はシードzone、S006は離場funnel、S013は一時type identity、S019はnamed attachmentという別軸である。

## 5. 偽陽性の件数についての自己評価

偽陽性は **0/20（0%）**。Claudeの予測「状態語彙は計器上ほぼ配線済みなので機構待ちは少なく出る」は、機構待ちが5/20（25%）なので前回67%より大幅に低く、**軸差の方向として当たった**。しかも9状態語彙の未配線を理由にした機構待ちは0件で、4登録単位はいずれも別概念だった。

一方、偽陽性が0件なのは予測対象と別である。20件はいずれもliveのowner/filter/condition/action構造が原文へ戻るconsumer慣例を持たず、特にレゾナ5件は`matchesFilter`の非対称規則、S018は既存の対象状態置換正準形を開いても指摘がそのまま成立した。数合わせで真バグに残したものはない。

## 6. 条件以外で見つけた原文との食い違い

**5 effect・9項目**。

- S008 `WXEX2-05-E1`：レゾナ限定以外にownerが`any`（原文self）かつcount1（原文全体）。
- S009 `WXK05-052-E1`：シード条件以外に対象がself1（原文opponent2体まで）、keywordがシード（原文attack禁止）、durationがPERMANENT（原文next turn）という別効果化。
- S010 `WX20-081-E1`：レゾナ限定以外にcount1（原文全体）。
- S015 `WX13-052-E1`：down状態指定だけでなく、公開札を場へ出す移動action全体が欠落。
- S018 `WXK02-052-E1`：凍結済み分岐だけでなく「代わりに」がSEQUENCE化され、未凍結時にもDRAWする過剰処理。

## 7. ゲート・差分・成果物確認

`npm run gates`は全緑（実測16.9秒）。

- typecheck PASS
- golden **2337 PASS / 0 FAIL**
- smoke **10693効果 / OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**（200ゲーム、8000手）
- census **773 / baseline 773**
- census:stubs **A群🔴0 / C群0**
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git status --short`は作業前からのtracked M 2本 `scripts/archive/semanticAuditLedger.mjs` / `scripts/archive/semanticAuditMkBatchSingles.mjs`を維持し、`??`は既存の第8〜第20成果物、今回入力`stage1_batch21.txt`/`_index.md`、および新規の本報告書だけ。今回新たに変更した既存trackedファイルは0。

`git diff --stat`は計器2本だけ（`semanticAuditLedger.mjs | 13 ++++++++++---`、`semanticAuditMkBatchSingles.mjs | 7 ++++++-`、計 **2 files changed, 16 insertions(+), 4 deletions(-)**）。いずれも作業前からの差分で触れていない。

報告書はUTF-8で先頭20行・末尾20行を再読し、分類行 **20**、根拠列 **20/20ユニーク（100%）**を機械測定した。最終`wc -c`相当（`Get-Item.Length`）は **22352 bytes**。

## 8. ガードレール2・3・4・6・7で当初の見立てから変えた件

- S002（ガードレール2/6）：`ADD_TO_LIFE.fromTrash`直行にはfilter fieldが無く機構待ちを疑ったが、SEARCH/選択thenと`hasLifeBurst` consumerを組み合わせる既存表現が可能なので真バグのみとした。
- S007（ガードレール4）：`THIS_CARD_IS_CHARMED`が既存なので単純parser修正と見たが、ON_BANISH解決時はsourceが既に場を離れて現在場consumerがfalseになる。離脱前snapshot/trigger filterを使う必要があると修正したが、既存collector語彙の正準化余地を残し機構待ちには数えなかった。
- S011（ガードレール4/6）：`hasAcce`、`IS_SELF_ACCED`、`acceHost`の隣接3語彙を開き、対象名詞句なので①`hasAcce`だけが正しいと確定した。
- S013（ガードレール3/6）：`cardType:'レゾナ'`と`targetsTriggerSource`の存在から既存で届く可能性を外した。前者はfilter側、後者は照応だけで、効果元identityの期間付き追加を消費しないため機構待ちへ変更。
- S015（ガードレール2/6）：`asDown`は宣言だけでなく`execAddToField`/配置interactionが消費するため、down状態語彙自体の機構待ちを外した。
- S018（ガードレール2/3）：`isFrozen`条件をFREEZE後に置くと常に成立する見立てから、既存WX09-Re01のSELECT→STORE→`LAST_PROCESSED_MATCHES`正準形を確認しengine追加不要へ変更。
- S019（ガードレール3/4/6）：`IS_SELF_ACCED`で足りる見立てを撤回。同consumerはアクセ枚数しか見ずカード名を照合しないため、9語彙とは別のnamed-acce条件として機構待ちにした。
- 先回りメモCH〜CLとの事実上の食い違いは0件。特にCIの`cardType:'レゾナ'`厳密判定、CKの開花と同zone条件の別物、CLの離場置換=M2を実コード/PLANで確認した。
