# clean群 round1 段1 batch13 triage — 軸 `filter.level`

判定日: 2026-08-22。対象は `stage1_batch13.txt` の37 findings / 37 effectId。原文、live JSON、型宣言だけでなく各 action/condition の consumer を照合した。全件を真バグと判定し、うち17件は既存語彙だけでは原文どおりに表現できないため「真バグ＋機構待ち」とした。機構待ちは真バグ・機構待ち双方へ計上する。

## 1. サマリ

| action型 | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|
| ADD_TO_FIELD | 1 | 0 | 0 | 0 |
| BANISH | 4 | 0 | 1 | 0 |
| BLOCK_ACTION | 1 | 0 | 1 | 0 |
| CHOOSE(CHOOSE/SEQUENCE/ADD_TO_FIELD) | 1 | 0 | 0 | 0 |
| CHOOSE(CHOOSE/TRASH/ENERGY_CARD) | 1 | 0 | 0 | 0 |
| DOWN | 1 | 0 | 0 | 0 |
| DRAW | 3 | 0 | 2 | 0 |
| ENERGY_CHARGE_FROM_DECK | 1 | 0 | 1 | 0 |
| GRANT_LRIG_ABILITY | 2 | 0 | 2 | 0 |
| GRANT_PROTECTION | 1 | 0 | 0 | 0 |
| LEVEL_MODIFY | 1 | 0 | 0 | 0 |
| POWER_MODIFY | 8 | 0 | 4 | 0 |
| POWER_SET | 1 | 0 | 0 | 0 |
| REVEAL_AND_PICK | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/DRAW/TRASH) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/ENERGY_CHARGE_FROM_DECK/DRAW) | 1 | 0 | 1 | 0 |
| SEQUENCE(SEQUENCE/ENERGY_CHARGE_FROM_DECK/PREVENT_NEXT_DAMAGE) | 1 | 0 | 1 | 0 |
| SEQUENCE(SEQUENCE/POWER_MODIFY/SIGNI) | 1 | 0 | 1 | 0 |
| SEQUENCE(SEQUENCE/TRANSFER_TO_DECK/TRASH_CARD) | 1 | 0 | 1 | 0 |
| SEQUENCE(SEQUENCE/TRASH/DECK_CARD) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/TRASH/ENERGY_CARD) | 1 | 0 | 1 | 0 |
| TRANSFER_TO_DECK | 1 | 0 | 0 | 0 |
| TRANSFER_TO_HAND | 1 | 0 | 1 | 0 |
| TRASH | 1 | 0 | 0 | 0 |
| **計** | **37** | **0** | **17** | **0** |

原因内訳:

| 原因 | 件数 | finding |
|---|---:|---|
| ① `level` / `levelRange` 等の単純脱落 | 11 | S001, S002, S011, S016, S017, S018, S020, S025, S026, S035, S037 |
| ② 動的レベル語彙・参照基準の取り違え | 17 | S006, S007, S008, S012, S013, S014, S015, S019, S021, S022, S023, S024, S029, S030, S033, S034, S036 |
| ③ 選択集合のレベル総和制約 | 4 | S003, S004, S009, S032 |
| ④ ゾーン別の各レベル充足条件 | 3 | S005, S010, S031 |
| ⑤ その他 | 2 | S027（行き先選択肢）, S028（条件付き置換） |

## 2. finding 全37件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠（1行ごとに固有） | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WXDi-P16-085-E1 | AUTO | 真バグ | live cost は `trash_self:true` のみで、手札のレベル1シグニを捨てる支払いが存在しない。 | `canPayCost` / `payCost` の `handDiscardSigni{level:1,count:1}` | `trash_self` は場の能力元を置く支払いだけで手札支払いを兼ねない。 | 手札からレベル１のシグニを１枚捨て |
| S002 | WXK03-078-E1 | AUTO | 真バグ | BANISH filter は `cardType` だけで、奇数レベルの相手シグニ以外も候補になる。 | `execBanish` → `resolveDynamicFilter` → `matchesFilter` (`execUtils.ts:778-782`) | 実装済み `levelParity:'odd'` を生成すべきで、機構待ちではない。 | レベルが奇数の |
| S003 | WXDi-P00-012-E1 | AUTO | 真バグ＋機構待ち | live は1体固定で、任意複数のレベル合計を相手センタールリグの実レベル以下に拘束しない。 | `execBanish` の複数選択 (`effectExecutor.ts:1200-1208`) と選択UI | `levelLtOppLrig` は各候補を「相手センターより低い」にするだけ、`LAST_PROCESSED_MATCHES.levelLteCenterLrig` は処理後集合限定で総和を拘束しない。 | レベルの合計が対戦相手のセンタールリグのレベル以下になるように好きな数 |
| S004 | WX11-033-BURST | AUTO | 真バグ | live は無制限1体だが、現行 `target.totalLevelMax:3` と `count:'ALL',upToCount:true` なら固定上限の任意複数選択を既存consumerが検査できる。 | `execBanish` (`effectExecutor.ts:1200-1208`) / pending確定 (`:8190-8198`) | `levelRange.max:3` は各カード上限で総和上限ではない。一方 `totalLevelMax` が実装済みなので機構待ちは外した。 | レベルの合計が３以下になるように好きな数 |
| S005 | WXK05-035-E2 | AUTO | 真バグ | live は対象を相手レベル3に誤限定し、能力元の下にレベル1・2・3が各1枚ある条件を全て落としている。 | `evalCondition` の `AND` + `THIS_CARD_HAS_UNDER{filter:{level:N}}` / `execBanish` | `ENERGY_EACH_LEVEL_FILTER_GTE` はエナ専用だが、本件は既存 `THIS_CARD_HAS_UNDER` 3条件のANDで表せる。 | このシグニの下にレベル１、レベル２、レベル３のシグニがある場合 |
| S006 | WXDi-P01-039-E1 | AUTO | 真バグ＋機構待ち | `BLOCK_ACTION{SET_LEVEL_1}` は自分シグニ1体・期限END_OF_TURNで、デッキ/トラッシュの元レベル2・3全札を常時レベル1扱いにしない。 | 非場カード参照の cardMap override funnel（`applyDeclaredZoneClassOverride`近傍） | `levelRange:{min:2,max:3}` は対象抽出だけ、`collectDeckTrashLevel1Nums` は各カード自身のSTUBを読む方式で場の能力元から全対象へ宣言できない。 | デッキとトラッシュにあるレベル３とレベル２のシグニの基本レベルは１ |
| S007 | WXDi-P14-004-E1 | AUTO | 真バグ | choice②は固定 `ENERGY_CHARGE_FROM_DECK count:2` で、センタールリグのレベル×2にならない。 | `execEnergyChargePerLrigLevel` (`effectExecutor.ts:6330`) | `countFromZone` はゾーン枚数用だが、既存 `ENERGY_CHARGE_PER_LRIG_LEVEL{chargePerLevel:2}` が基準・倍率とも一致する。 | センタールリグのレベル１につき【エナチャージ２】 |
| S008 | WXDi-P10-036-E1 | AUTO | 真バグ | live `choose_count:1` は自場のレベル1シグニ数を数えず、0体でも1回、複数体でも1回しか選ばせない。 | `execChoose.countChoose` (`effectExecutor.ts:4942-4945`) → `resolveCountRef` | `countFromZone{zone:'field',filter:{cardType:'シグニ',level:1}}` は既存で `execChoose` が `resolveCountRef` を呼ぶため機構待ちではない。 | 場にあるレベル１のシグニ１体につき１つ選ぶ |
| S009 | WXDi-P08-034-E2 | AUTO | 真バグ | 2体までのDOWNにレベル合計4上限がなく、候補2体の合計が5以上でも選べる。 | `execDown` → `selectOrInteract` の `totalLevelMax` 配線 | `levelRange.max:4` は各体しか縛らないが、静的 `totalLevelMax:4` と候補レベル辞書は既存なので機構待ちを外した。 | レベルの合計が４以下になるように対戦相手のシグニを２体まで |
| S010 | WXK07-087-E2 | AUTO | 真バグ＋機構待ち | DRAWは無条件で、両者の場を合わせた集合にレベル1・2・3・4が各1体以上あるかを調べる条件型がない。 | `evalCondition` に field両陣営を束ねる各レベル充足分岐を追加 | `ENERGY_EACH_LEVEL_FILTER_GTE` はself/opponent片側のエナ専用、`HAS_CARD_IN_FIELD` のownerは両者合算集合を作らない。 | 場にレベル１、レベル２、レベル３、レベル４のシグニがある場合 |
| S011 | WXDi-P07-040-E1 | AUTO | 真バグ | ON_ATTACK_PHASE_STARTのDRAWに、自場レベル1シグニ存在条件が1つもない。 | `evalCondition(HAS_CARD_IN_FIELD{owner:'self',filter:{level:1}})` | `levelExact`相当は `filter.level:1` で既に照合でき、トリガーscopeは盤面存在条件を暗黙補完しない。 | あなたの場にレベル１のシグニがある場合 |
| S012 | WXK07-053-E1 | AUTO | 真バグ＋機構待ち | liveは自場と相手場のシグニ実効レベル合計が等しいかを比較せず常に1枚引く。 | `evalCondition` に両field signi level-sum比較を追加し `calcSigniLevels` を渡す | `LRIG_LEVEL_EQ_OPP` はセンタールリグ同士、`levelEqLastProcessedLevelSum` は対象filterの直前処理集合基準で場同士を比較できない。 | あなたの場にあるシグニのレベルの合計が対戦相手の場にあるシグニのレベルの合計と同じ |
| S013 | WXDi-P04-039-E2 | AUTO | 真バグ＋機構待ち | ON_PLAYのエナチャージは自場3ルリグのレベル合計が奇数かを評価していない。 | `evalCondition` に field LRIG level-sum parity 条件を追加 | `levelParity` はカードfilterの単体レベル、`LRIG_LEVEL` はセンター1体の閾値で3体合計の奇偶にならない。 | 場にいるルリグのレベルの合計が奇数の場合 |
| S014 | WXDi-D06-011-E1 | AUTO | 真バグ＋機構待ち | GRANT_LRIG_ABILITYは対象を選ばずself側ストアへ付与するため、レベル3のセンター/アシスト1体という対象同定を保持できない。 | `executeAction` の `GRANT_LRIG_ABILITY` (`effectExecutor.ts:7384`) と付与能力collector | `LRIG_LEVEL{owner:self,value:3}` はセンター条件で対象選択ではない。第8バッチ§4 `WXDi-P00-026-E1 / S031` の任意LRIG候補化と同一基盤。 | あなたのレベル３のルリグ１体を対象とし |
| S015 | WXDi-D05-011-E1 | AUTO | 真バグ＋機構待ち | 付与先は暗黙のプレイヤー側ストアで、場のレベル3ルリグ1体を選ぶtarget/filterが型にも実行経路にもない。 | `GRANT_LRIG_ABILITY` target選択 → `collectLrigGrantedEffects` | `levelRange:{min:3,max:3}` はSIGNI等のTargetFilterでは使えても現行GrantLrigAbilityActionにtargetがない。第8バッチ§4 S031へ統合。 | レベル３のルリグ１体を対象 |
| S016 | WXDi-P01-039-E2 | AUTO | 真バグ | CONTINUOUS保護targetにlevel filterがなく、自分のレベル2以上のシグニまで相手効果BANISHから守る。 | protection collectorのtarget filter / `matchesFilter` | `filter.level:1` は既存の静的フィルタで足り、`levelLtSelf`等の動的比較は不要。 | あなたのレベル１のシグニはバニッシュされない |
| S017 | WXK07-053-E2 | AUTO | 真バグ | LEVEL_MODIFY targetはowner:any・filterなしで、レベル1と能力元自身も候補になる。 | `execLevelModify` (`effectExecutor.ts:1490`) | `levelRange.min:2` と `excludeSelf:true` は既存consumerが読むため、`levelGtSelf`（能力元との大小比較）は基準違い。 | レベル２以上の他のシグニ１体 |
| S018 | WXDi-P03-049-E1 | AUTO | 真バグ | activeConditionは相手ターンだけで、self energyにレベル1シグニが存在する条件が脱落している。 | `checkActiveCondition(AND/ENERGY_HAS_CARD)` | `ENERGY_HAS_CARD{filter:{cardType:'シグニ',level:1}}` が実装済みで、`levelEqLastProcessedCount`の履歴参照は不要。 | エナゾーンにレベル１のシグニがあるかぎり |
| S019 | WXK07-104-E1 | AUTO | 真バグ | 条件なしで相手全シグニを-4000し、原文の「自場全員が偶数」かつ相手1体を両方破る。 | `evalCondition(ALL_FIELD_SIGNI_MATCH)` / `execPowerModify` | `ALL_FIELD_SIGNI_MATCH{filter:{levelParity:'even'}}` は空盤面falseも含め実装済みで、単体 `levelParity` を対象側へ置く形ではない。 | あなたの場にあるすべてのシグニのレベルが偶数の場合 |
| S020 | WXDi-P03-066-E1 | AUTO | 真バグ | 常時+4000にself trashのレベル1シグニ2枚以上というactiveConditionがない。 | `checkActiveCondition(TRASH_HAS_CARD{minCount:2})` | `filter.level:1` と `minCount:2` の既存条件で表せ、`levelEqDiscardLevelSum`のコスト履歴とは無関係。 | トラッシュにレベル１のシグニが２枚以上あるかぎり |
| S021 | WXDi-P13-076-E1 | AUTO | 真バグ＋機構待ち | +5000が自場ルリグ合計レベル3に限定されず恒常適用される。 | `checkActiveCondition` に field LRIG level-sum eq 条件と実効レベル集計を追加 | `EICHI_LEVEL_SUM` は場の英知計算、`LRIG_LEVEL` はセンタートップ1体だけで3ルリグ合計を表さない。 | 場にいるルリグのレベルの合計が３であるかぎり |
| S022 | WXK07-088-E1 | AUTO | 真バグ＋機構待ち | -3000は自場シグニの実効レベル合計5を確認せず発火する。 | `evalCondition` の self field SIGNI level-sum eq | `LAST_PROCESSED_LEVEL_SUM` は直前処理カードだけ、`POWER_MODIFY_PER_LEVEL_SUM` は合計比例delta actionで条件ゲートではない。 | 場にあるシグニのレベルの合計が５の場合 |
| S023 | WXDi-P13-076-E2 | AUTO | 真バグ＋機構待ち | +7000側にも自場ルリグ3体のレベル合計7という常在ゲートがない。 | `checkActiveCondition` の field LRIG level-sum eq（S021と同一機構） | `levelEqualsVar` はコスト由来変数との単体一致、`LRIG_LEVEL` はセンター単体なので合計7を代用できない。 | 場にいるルリグのレベルの合計が７であるかぎり |
| S024 | WDK13-015-E1 | AUTO | 真バグ＋機構待ち | ON_ATTACK_SIGNIの-3000は両者field signiのレベル合計を比較せず無条件に実行される。 | `evalCondition` の field SIGNI level-sum lte comparison（S012と同一基盤） | `levelLtOppLrig` は候補単体対相手センター、`LRIG_LEVEL_CMP_OPP` はルリグ同士で主語が異なる。 | 自分の場のシグニのレベルの合計が対戦相手以下の場合 |
| S025 | WDK13-014-E2 | AUTO | 真バグ | liveはowner:any・filterなしで、自分シグニやレベル3以外へ-7000できる。 | `execPowerModify` → `fieldCandidatesByOwner` / `matchesFilter` | `owner:'opponent',filter:{level:3}` の既存表現で足り、`levelRange`の動的解決は不要。 | 対戦相手のレベル３のシグニ１体 |
| S026 | WXK01-066-E1 | AUTO | 真バグ | POWER_SET対象にレベル上限がなく、相手レベル4以上も基本パワー2000にできる。 | `execPowerSet` (`effectExecutor.ts:1677`) / `matchesFilter` | `levelRange.max:3`（またはlevel `{max:3}`）を既存targetへ足せばよく、`levelLtOppLrig`は基準違い。 | 対戦相手のレベル３以下のシグニ１体 |
| S027 | WX18-070-E1 | AUTO | 真バグ | filterのレベル4判定は正しいが、成功時destinationがエナ固定で手札との二択がない。 | `execRevealAndPick` / pending確定の `handOrEnergy` (`effectExecutor.ts:8522-`) | `REVEAL_AND_PICK.handOrEnergy:true` が実装済みで、公開filterの `level:4` は既に正しい。 | エナゾーンに置くか手札に加える |
| S028 | WXDi-P13-005-E1 | AUTO | 真バグ | 手札捨て後にレベル1 BANISHと無制限BANISHを連続実行し、ディソナ時の「代わりに」を二重実行へ崩している。 | `execSequence` + `evalCondition(LAST_PROCESSED_MATCHES{isDisona})` | TRASHが`lastProcessedCards`を残し、`isDisona`も実装済みなのでCONDITIONALのthen/elseで択一にできる。 | この効果によって捨てたカードが《ディソナアイコン》の場合、代わりに |
| S029 | WXK05-065-E1 | AUTO | 真バグ＋機構待ち | ON_ACCE collectorはホスト番号しかentryへ渡さず、直前に付いたアクセカードのレベルを見ないままエナチャージとドローを両方行う。 | `checkAndFireOnAcceTriggersForOwner` (`BattleScreen.tsx:12710-12749`) からattached cardをconditionへ配線 | `accedHostMinLevel/MaxLevel` はアクセカード自身のON_ACCE_ATTACHでホストを測る逆向き語彙、`levelLtTrigger`もtriggeringCardNum未設定の現経路では使えない。 | それがレベル２以下の【アクセ】の場合…レベル３以上の場合 |
| S030 | WXDi-P03-077-BURST | AUTO | 真バグ＋機構待ち | `PREVENT_NEXT_DAMAGE count:1` は発生源無限定の1回だけで、ターン中すべての相手レベル3以下SIGNI由来ダメージを止めない。 | `PREVENT_DAMAGE`予約とdamage funnelにSIGNI source level filterを追加 | `PREVENT_NEXT_DAMAGE.sourceLevelLtLastProcessed` は直前カード未満かつ回数制、`PREVENT_DAMAGE.scope` はALL/LRIGだけでSIGNIレベル上限を持たない。 | このターン、対戦相手のレベル３以下のシグニによってダメージを受けない |
| S031 | WXK05-035-E1 | AUTO | 真バグ＋機構待ち | CONTINUOUSの+2000とルリグ効果耐性が、能力元の下にレベル4シグニ3枚がなくても常時成立する。 | `checkActiveCondition` の under filter count条件を両CONTINUOUS consumerへ配線 | `THIS_CARD_HAS_UNDER{filter:{level:4}}` は存在1枚しか表せず、`ENERGY_EACH_LEVEL_FILTER_GTE` はエナ専用でunderのminCount 3にならない。 | このシグニの下にレベル４のシグニが３枚あるかぎり |
| S032 | WXK10-066-E2 | AUTO | 真バグ＋機構待ち | trashから選ぶ2枚にレベル合計ちょうど5の制約がなく、さらにpower8000上限を古代兵器側へ誤配置している。 | `execTransferToDeck` → `selectOrInteract` / 選択確定時のexact total-level検査 | `totalLevelMax:5` は合計4以下も許すため「ちょうど5」と非同値。第11バッチ§4 `WX13-030-BURST / S002` の総和SelectionConstraintと同一基盤のlevel版（eq要件）として二重登録しない。 | レベルの合計が５になるように＜古代兵器＞のシグニ２枚 |
| S033 | WXK10-085-E1 | AUTO | 真バグ | level合計4の-2000だけCONDITIONALだが、続くエナチャージは合計6を判定せず常時実行される。 | `evalCondition(LAST_PROCESSED_LEVEL_SUM{operator:'eq',value:6})` | 同じlive内でvalue4の既存consumerを使用済みであり、別の動的filterや新機構は不要。 | レベルの合計が６の場合、【エナチャージ１】 |
| S034 | WXK11-004-E1 | AUTO | 真バグ＋機構待ち | 相手energyをALL trashし自分energyを1枚trashするliveは、相手energyを自分センターlevel枚まで選ぶ処理になっていない。 | `execTrash` のcountを解く `resolveCountRef` にcenter LRIG level producerを追加 | `countFromZone` はカード枚数、`ENERGY_CHARGE_PER_LRIG_LEVEL` は自分deck→energy専用でTRASH target countへ流用できない。 | センタールリグのレベル１につき対戦相手のエナゾーンにあるカードを１枚まで |
| S035 | WXK07-082-E1 | AUTO | 真バグ | live sourceはレベル4だけで、無色カードもデッキトップへ選べる。 | `execTransferToDeck` / `matchesFilter(nonColorless)` | `nonColorless:true` は `execUtils.ts:840` で実装済み。`level:4` は既に存在し動的語彙は不要。 | 無色ではないレベル４のシグニ１枚 |
| S036 | WXDi-P04-039-E1 | AUTO | 真バグ＋機構待ち | energy→handは自場ルリグ合計レベルの偶数判定なしに毎アタックフェイズ開始時実行される。 | `evalCondition` の field LRIG level-sum parity（S013と同一機構） | 単体 `levelParity:'even'` はカード候補を絞る語彙、`LRIG_LEVEL` はセンター1体だけで3ルリグ合計の偶奇を測れない。 | 場にいるルリグのレベルの合計が偶数の場合 |
| S037 | WXDi-CP01-002-E1 | AUTO | 真バグ | ACTIVATED effectに条件自体がなく、センタールリグがレベル2以下でも相手deckをtrashする。 | `evalCondition(LRIG_LEVEL{owner:'self',operator:'gte',value:3})` | 既存 `LRIG_LEVEL` はセンタートップを評価するため、`levelGtSelf`等のSIGNI相対filterは不要。 | センタールリグがレベル３以上の場合 |

## 3. 原因分類ごとの所見

- **①単純脱落（11件）**: S002の奇数は `levelParity`、S017の「2以上・他」は `levelRange.min`＋`excludeSelf`、S018/S020はzone条件、S035は`nonColorless`まで既存consumerがある。「レベル系だから機構待ち」にはしなかった。
- **②動的語彙（17件）**: 既存で閉じるS007/S008/S019/S033と、参照集合が既存語彙と異なる13件を分離した。後者はルリグ合計、両fieldシグニ合計、直前に付いたアクセ、ダメージsource、center levelをaction countへ渡す配線など、基準がそれぞれ異なる。
- **③総和制約（4件）**: S004/S009は現行 `totalLevelMax` で閉じる。S003は上限が相手センタールリグ由来の動的値、S032は上限でなく合計eqなので機構待ち。先回りメモAKの「総和制約なし」は現行実装と食い違った。
- **④各レベル充足（3件）**: S005は`THIS_CARD_HAS_UNDER`を3条件ANDすれば既存語彙で表現可能。S010は両field合算、S031はunderの同一level3枚という別の集合演算なので機構待ち。
- **⑤その他（2件）**: S027は`handOrEnergy`、S028はTRASHのlastProcessed＋`isDisona`条件のthen/elseで既存機構に乗る。

## 4. 機構待ち一覧

| effectId / finding | 不足語彙・機構・配線 |
|---|---|
| WXDi-P00-012-E1 / S003 | BANISH複数選択の`totalLevelMax`を相手センタールリグlevelから動的解決するproducer。`LAST_PROCESSED_MATCHES.levelLteCenterLrig`は後段判定なので流用不可。第11バッチ§4 `WX13-030-BURST / S002`（power総和）と同一基盤のlevel版で、動的上限要件だけ追加し二重登録しない。 |
| WXDi-P01-039-E1 / S006 | 場の能力元が宣言する「self deck+trashの元level 2/3 SIGNIをbase level 1扱い」の継続override。非場カードを読むSEARCH/cost/filter全consumerへ統一cardMap viewを渡す。 |
| WXK07-087-E2 / S010 | self/opponent両fieldを単一集合にし、levels `[1,2,3,4]` が各1体以上あるかを判定するcondition。`ENERGY_EACH_LEVEL_FILTER_GTE`のzone/owner一般化先。 |
| WXK07-053-E1 / S012、WDK13-015-E1 / S024 | 両者field SIGNIの実効level合計をeq/lte比較するCondition。`calcSigniLevels`を`evalCondition`へ渡し、表記levelだけで集計しない。 |
| WXDi-P04-039-E2 / S013、WXDi-P13-076-E1 / S021、WXDi-P13-076-E2 / S023、WXDi-P04-039-E1 / S036 | self fieldのcenter＋assist L/R LRIG実効level合計をeqまたはparity比較するCondition。単体`LRIG_LEVEL`とは別基準。 |
| WXDi-D06-011-E1 / S014、WXDi-D05-011-E1 / S015 | レベルfilter付きでcenter/assist LRIGから1体を選び、付与能力をそのinstanceへ関連付ける機構。**第8バッチ§4 `WXDi-P00-026-E1 / S031` と同一基盤**として二重登録しない。 |
| WXK07-088-E1 / S022 | self field SIGNIの実効level合計を数値eq比較するCondition。S012/S024のfield level-sum集計基盤を片側数値比較consumerへ流用する。 |
| WXK05-065-E1 / S029 | ON_ACCE発火時に「直前に付いたアクセcardNum」をstack entryへ載せ、level≤2 / ≥3の分岐条件が読む配線。`accedHostMin/MaxLevel`とは主語が逆。 |
| WXDi-P03-077-BURST / S030 | 期間中無制限の`PREVENT_DAMAGE`にsource SIGNI・source owner opponent・source level≤3を持たせ、damage funnelで消費せず毎回照合する。 |
| WXK05-035-E1 / S031 | `THIS_CARD_HAS_UNDER`のfilter一致枚数 `minCount:3` 版を`checkActiveCondition`へ配線。`ENERGY_EACH_LEVEL_FILTER_GTE`のzone一般化候補。 |
| WXK10-066-E2 / S032 | SelectionConstraintにlevel合計eqを追加し、`satisfiesSelectionConstraint`と選択UIへ配線。**第11バッチ§4 `WX13-030-BURST / S002`（power総和）と同一基盤のlevel版**で、eq比較要件のみ追加し二重登録しない。 |
| WXK11-004-E1 / S034 | `resolveCountRef`へself center LRIG level producerを追加し、`execTrash`のtarget countへ配線。既存`ENERGY_CHARGE_PER_LRIG_LEVEL`のlevel取得を共通化できる。 |

## 5. 偽陽性件数についての自己評価

事前予測は**偽陽性0〜2件（0〜5.4%）**だった。理由は、レベル語彙が豊富な軸では「慣例で既に意味が入っている」より「使える既存語彙をJSONが生成していない」型が多いと見たためである。実測は **0/37＝0%** で予測帯内の下端だった。

通算は第1〜12バッチの既報値（findings 728、偽陽性199）へ今回37/0を加え、**199/765＝26.0%**。第11バッチ **23.9%**、第12バッチ **5.0%** よりも今回の0%は低い。これは分類を真バグ側へ寄せた結果ではなく、S004/S009で実装済み`totalLevelMax`を発見しても、live JSONがそのフィールドを使っていないため偽陽性にはならなかったこと、S002/S027/S033なども同様に既存consumer不使用が実害だったことによる。

## 6. 条件以外で見つけた原文との食い違い

**8 effect・12項目**。

- `WXK05-035-E2` (S005): 対象を任意の相手シグニ1体ではなくレベル3に誤限定。
- `WXDi-P01-039-E1` (S006): 原文は永続の基本レベル扱いだがliveは`until:END_OF_TURN`。
- `WXDi-D05-011-E1` (S015): 付与能力を行う回数「対戦相手センタールリグのレベルと同じ回数」が欠落。
- `WXK07-053-E2` (S017): レベル条件に加え「他の」＝能力元自身除外も欠落。
- `WXK07-104-E1` (S019): 相手シグニ1体でなく`count:'ALL'`へ過剰拡大。
- `WDK13-014-E2` (S025): target ownerがopponentでなくany。
- `WXK10-066-E2` (S032): 原文の相手power8000以下対象条件をtrashの古代兵器filterへ誤配置し、後段BANISH targetからpower上限が脱落。
- `WXK11-004-E1` (S034): 相手energyは「1枚まで×level」なのにALL強制、移動先はゲーム外なのにTRASH、相手の全SIGNI除外が丸ごと欠落し、原文にない自分energy1枚TRASHを追加（4項目）。
- `WXK07-082-E1` (S035): 「【ライフバースト】を持たず」のfilterも欠落。

## 7. ゲート・差分・成果物確認

`npm run gates` 全緑（報告書作成前の実測）:

- typecheck PASS
- golden **2337 / FAIL 0**
- smoke **10693効果、OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**
- census **773 / baseline 773**
- census:stubs **A🔴0 / C0**
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`parseStatus`を明細のlive行から読み切れなかった3件は、行長で切れた **S007 `WXDi-P14-004-E1`、S014 `WXDi-D06-011-E1`、S015 `WXDi-D05-011-E1`**。`public/data/effects_WXDi.json` の実liveを直接読み、**3件とも `AUTO`** と確認した。したがって全37件がAUTO、MANUAL/PARTIALは0件。

`git status --short` の実測は、作業前からのM 2本
`scripts/archive/semanticAuditLedger.mjs` / `scripts/archive/semanticAuditMkBatchSingles.mjs` と、既存の未追跡batch8〜13成果物に、本報告書 `stage1_batch13_triage.md` が加わった状態。指定された計器2本には触れていない。

`git diff --stat` は計器2本だけで、`semanticAuditLedger.mjs | 7 +++++--`、`semanticAuditMkBatchSingles.mjs | 5 ++++-`、計 **2 files changed, 9 insertions(+), 3 deletions(-)**。今回によるtracked差分は0。

報告書はUTF-8、先頭20行・末尾20行を読み返し済み。最終 `wc -c` 相当（PowerShell `Get-Item.Length`）は **29,522 bytes**。

## 8. ガードレール2・3・5・6で当初見立てから変えた件

- **S003/S004/S009/S032**: 先回りメモAKは`SelectionConstraint`に総和制約がない点では現行コードと一致する一方、「総和制約はengineに無い」は現行実装と食い違った。`EffectTarget.totalLevelMax`、`execBanish:1200-1208`、pending確定`:8190-8198`に**静的レベル合計上限が実装済み**。このためS004/S009を機構待ち候補から真バグのみへ変更し、S003（動的上限）とS032（eq）だけを機構待ちに残した。
- **S005**: `ENERGY_EACH_LEVEL_FILTER_GTE`のunder版が必要と見たが、各levelを別々の`THIS_CARD_HAS_UNDER`にしてANDできるため機構待ちを外した。
- **S007**: `countFromZone`ではセンターlevel値を数えられないが、action専用の`ENERGY_CHARGE_PER_LRIG_LEVEL`がconsumer込みで存在したため機構待ちを外した。
- **S008**: `CHOOSE.choose_count`が固定numberに見えたが、`countChoose`が`resolveCountRef`を呼び、field level1枚数を既存`countFromZone`で渡せるため機構待ちを外した。
- **S014/S015**: `GRANT_LRIG_ABILITY`型にtargetがなくconsumerがプレイヤー側ストアへ積むだけと確認し、単なるlevel filter脱落から第8バッチ§4 S031と同一基盤の機構待ちへ変更した。
- **S019**: 「全シグニ偶数」の専用条件が必要と見たが、`ALL_FIELD_SIGNI_MATCH`と実装済み`levelParity`の組合せで表せるため機構待ちを外した。
- **S029**: `levelLtTrigger`の流用を検討したが、ON_ACCE collectorは`triggeringCardNum`に付いたアクセを載せておらず、最も近い`accedHostMin/MaxLevel`は主語がホスト側なので新配線が必要と確定した。
- **S030**: `PREVENT_DAMAGE`で回数無制限期間は表せるがscopeがALL/LRIGのみ、`PREVENT_NEXT_DAMAGE.sourceLevelLtLastProcessed`は1回消費かつ基準カード依存だったため機構待ちに変更した。
- **先回りメモAL〜AP**: AL (`LAST_PROCESSED_MATCHES.levelLteCenterLrig`)、AM (`levelParity`)、ANの動的filter群、AO (`countFromZone.per`)、AP (`ENERGY_EACH_LEVEL_FILTER_GTE`) は宣言とconsumerを開いて確認し、AK以外に実測食い違いはなかった。
