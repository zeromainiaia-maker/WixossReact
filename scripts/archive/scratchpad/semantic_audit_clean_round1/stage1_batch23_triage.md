# 意味照合監査 clean群 round1 段1 第23バッチ triage

## 1. サマリ

| action型 | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|
| (live無) | 6 | 2 | 2 | 0 |
| BANISH | 2 | 0 | 0 | 0 |
| BLOCK_ACTION | 3 | 0 | 0 | 0 |
| BOUNCE | 2 | 0 | 0 | 0 |
| CHOOSE(CHOOSE/SEARCH/SEQUENCE) | 1 | 0 | 0 | 0 |
| CONDITIONAL | 3 | 0 | 0 | 0 |
| DRAW | 1 | 0 | 0 | 0 |
| ENERGY_CHARGE_FROM_DECK | 2 | 0 | 0 | 0 |
| GRANT_EFFECT | 0 | 1 | 0 | 0 |
| GRANT_FIELD_SIGNI_ABILITY | 1 | 0 | 0 | 0 |
| GRANT_KEYWORD | 2 | 0 | 0 | 0 |
| GRANT_LRIG_ABILITY | 1 | 0 | 0 | 0 |
| GRANT_PROTECTION | 1 | 0 | 0 | 0 |
| LIFE_CRASH | 1 | 0 | 0 | 0 |
| LOOK_AND_REORDER | 2 | 0 | 2 | 0 |
| LRIG_LIMIT_MODIFY | 2 | 0 | 1 | 0 |
| POWER_MODIFY | 7 | 0 | 0 | 0 |
| POWER_SET | 2 | 0 | 0 | 0 |
| PREVENT_NEXT_DAMAGE | 1 | 0 | 1 | 0 |
| REVEAL_AND_PICK | 1 | 0 | 0 | 0 |
| **計** | **41** | **3** | **6** | **0** |

※機構待ちは真バグの内数。finding単位で6件、登録単位で5件。

## 2. finding 全44件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠 | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WDK01-001 | effectなし | 真バグ | `RIDE_ON` consumerは在るが、このカードは注釈なしの`【ライド】`直後が【出】で、狭い本文regexからproducerが生成されない。 | `parseSentencePart2.ts:565-568`→`execStubPart2.ts:4806-4825` | prefix除去は召喚時のライドを自動実行せず、EffectText直読み経路もない。 | 【ライド】【出】《赤》 |
| S002 | WDK01-002 | effectなし | 真バグ | 赤×0・ターン1回・非ドライブ時という標準注釈を持つが、prefix除去後は「センタールリグ…乗ってもよい」regexへ本文が届かない。 | `stripKeywordPrefixes`→`RIDE_ON`→`lrig_riding_signi` | グロウ確定処理は`RIDE_ON`をカード固有に注入しない。 | コストが《赤×0》…１ターンに一度…ドライブ状態でない場合 |
| S003 | WDK01-003 | effectなし | 真バグ | ＜乗機＞1体へ乗る注釈はS002同型でも、出現時の赤コスト＋1ドローとは独立したライドACTIVATEDが生成されていない。 | `parseSentencePart2`／`INTERNAL_RIDE_ON_APPLY` | `drive_became_just` watcherは状態変化後の発火だけで、乗る入口にはならない。 | 対象のあなたの＜乗機＞のシグニ１体に乗る |
| S004 | WDK01-004 | effectなし | 真バグ | 手札1枚捨ててコインを得る【出】だけが後続能力であり、ターン終了時まで乗る別能力を補うlive entryがない。 | `RIDE_ON`／`clearTurnEndScopedState` | `lrig_riding_signi`のturn-end clearは寿命consumerであってライドproducerではない。 | ターン終了時まで、このルリグは…乗る |
| S005 | WX15-002-sub-E1 | AUTO | 真バグ＋機構待ち | 宣言外れ時の帰結は期間型`PREVENT_DAMAGE`へ落ちるが、`EffectDuration`に当該アタック終了までの値がなくターン中の後続ダメージも防ぐ。 | `DECLARE_DECK_TOP_ICON`→damage shield | `BLOCK_ACTION.END_OF_ATTACK`はガード等のaction禁止用で、damage shieldの寿命には読まれない。 | そのアタックであなたはダメージを受けない |
| S006 | WX16-024-LAYER-E1 | AUTO | 真バグ＋機構待ち | 保護対象自身のpower filterでは「効果元である相手シグニが15000以上」を判定できず、主語が対象へ誤付着している。 | `collectEffectImmuneSigni`／効果適用funnel | `sourceOwner`は相手由来までしか絞らず、source cardの実効power下限を表さない。 | 対戦相手のパワー15000以上のシグニの効果を受けない |
| S007 | WXDi-D09-H13 | effectなし | 偽陽性 | `getRiseFilter`がEffectTextから赤SIGNI1体を抽出し、召喚可否とstack mergeで強制することを第7バッチH004で実コード確認済み。 | `getRiseFilter`／`matchesRiseFilter`／召喚stack処理 | 該当なし。 | あなたの赤のシグニ１体の上に置く |
| S008 | WXDi-P07-067 | effectなし | 偽陽性 | このカードも単体field RiseのEffectText直読み対象で、赤の最前面SIGNI以外には登場できない。 | `getRiseFilter`／Signi play gate | 該当なし。 | この条件を満たさなければ場に出せない |
| S009 | WX15-097-E1 | AUTO | 真バグ | `cost.energyTrash.filter.hasIcon:'アクセ'`を支払候補へ適用できるのに、live costはdown_selfしか持たない。 | `canPayEffectCost`／energy cost modal／`matchesFilter:852-861` | `hasAcce`はホスト状態、`hasIcon:'アクセ'`は支払カード本文を読むため前者で代用しない。 | エナゾーンから《アクセアイコン》を持つカード１枚をトラッシュに置く |
| S010 | WXDi-P03-019-E1 | AUTO | 真バグ | `costUnparsed:true`のままなので、場の全SIGNI・手札全札・エナ全札を失う発動コストなしで相手全体BANISHを解決できる。 | `canPayEffectCost`／cost payment funnel | `costUnparsed`は警告標識であり支払いを実行する慣例ではない。 | すべてのシグニを場からトラッシュに置き、手札とエナゾーンにあるすべてのカードを |
| S011 | SP38-008-E1 | AUTO | 真バグ | CONTINUOUS collectorは場にいる間毎回評価するため`until:END_OF_TURN`を付ける必要がなく、live期限が原文より短い。 | `calcContinuousBlockedActions:2811-2824` | effect自体の`duration:PERMANENT`はaction内untilを上書きしない。 | あなたのグロウフェイズをスキップする |
| S012 | WX04-016-E1 | AUTO | 真バグ | センタールリグのGROW blockを継続収集する配線が在る一方、live actionは各ターン末失効値を宣言している。 | `scanLrigBlocks`／grow button gate | 次ターンにCONTINUOUSを再実行するという暗黙再登録はない。 | 【常】：あなたのグロウフェイズをスキップする |
| S013 | WXDi-P11-TK02-E2 | AUTO | 真バグ | 相手1体へのATTACK禁止では合計1回制限にならないが、既存`LIMIT_OPP_SIGNI_ATTACKS_ONCE`は`signi_attack_once_limit`を立て共通gateが攻撃済み台帳を見る。 | `execStubPart3.ts:788-793`→`signiAttackGate.ts:163` | 第12バッチ時点の「回数台帳なし」は現在の実コードと不一致で、機構待ち登録を外した。 | シグニで合計一度しかアタックできない |
| S014 | WX10-060-E1 | AUTO | 真バグ | `matchesFilter`はEffectText中の`【クロス`を`hasIcon:'クロス'`で判定するがlive filterにその既存キーがない。 | `execBounce`→`matchesFilter:852-861` | cardType SIGNIだけからクロス状態・クロスiconは推定されない。 | 《クロスアイコン》を持つ対戦相手のシグニ１体 |
| S015 | WX13-062-E1 | AUTO | 真バグ | `HAS_CARD_IN_FIELD{owner:self,filter:{cardName:'弓'},minCount:3}`を評価可能だがactiveConditionが丸ごと欠落している。 | `checkActiveCondition(HAS_CARD_IN_FIELD)`→`execBounce` | 対象のlevel≤2 filterは自場の弓3体条件を兼ねない。 | あなたの場にカード名に《弓》を含むシグニが３体ある場合 |
| S016 | WX09-Re18-E1 | AUTO | 真バグ | SEARCH consumerはfilterを直接候補へ掛けるため、`powerRange.min:10000`なしの現状は低powerも選べる。 | `execSearch`／`matchesFilter(powerRange)` | CHOOSEのchoice labelや後段REVEALは検索powerを補完しない。 | パワー10000以上のシグニ１枚 |
| S017 | WDK16-06S-E1 | AUTO | 真バグ | subscriber条件しかなく、先行するセンターLRIG名《凛》存在条件がANDされていない。 | `evalCondition(AND/HAS_CARD_IN_FIELD)`→`execConditional` | `SUBSCRIBER_COUNT`のelseは名前条件不成立時に能力全体を止めない。 | カード名に《凛》を含むセンタールリグがいる場合 |
| S018 | WX14-057-E1 | AUTO | 真バグ | liveは条件成立後にBANISH対象UIを開き、原文の条件判定前に固定した対象を保持しない。 | `SELECT_TARGET_ONLY`／stored targets→`execConditional` | did-it gateは処理成功履歴であり事前対象の同一性を保存しない。 | 対戦相手の…シグニ１体を対象とし、…場合、それを |
| S019 | WXK05-046-E1 | AUTO | 真バグ | `POWER_MODIFY_PER_TRASH_COUNT.countFilter`をconsumerが読むのにliveにイゾウ名filterがなく全trash枚数を乗算する。 | `execPowerModifyPerTrashCount` | target filterは減算対象を絞る軸で、count集合のCardName限定にはならない。 | 《幕末の人斬り　イゾウ》１枚につき－1000 |
| S020 | WXDi-P06-033-E1 | AUTO | 真バグ | `LIFE_COMPARE_OPP{operator:'eq'}`が既存だが、ON_ATTACK_PHASE_STARTのliveにconditionがない。 | `evalCondition(LIFE_COMPARE_OPP)`→trigger execution | triggerScope:selfは発火所有者だけを示し双方life同数を検査しない。 | あなたと対戦相手のライフクロスの枚数が同じ場合 |
| S021 | WXDi-P07-058-E1 | AUTO | 真バグ | timing空配列に加え、登場した自SIGNIが【出】能力を持つかというtrigger filterもなく任意時点の発火候補にならない。 | `collectPlayTriggers`／card effect presence filter | once_per_turnは回数だけを制限し登場能力の種類を限定しない。 | 【出】能力を持つあなたのシグニ１体が場に出たとき |
| S022 | WX10-035-E1 | AUTO | 真バグ | 使用時即時ENERGY_CHARGEで、期間中の味方ON_ATTACK_SIGNIごとに発火する遅延能力が設置されない。 | `INSTALL_DELAYED_TRIGGER`／attack collector | spellの`timing:['MAIN']`は設置可能時間であって後続attack timingではない。 | このターン、あなたのシグニ１体がアタックしたとき |
| S023 | WX25-P3-085-E1 | AUTO | 偽陽性 | `triggerCondition.discardCostSourceStory:'微菌'`をcollectorが支払い能力hostのCardClassと照合しており、【出】【起】コスト由来に限定される。 | `triggerCollect.ts:3453-3467` | 該当なし。 | ＜微菌＞のシグニの【出】【起】能力のコストとして |
| S024 | WDK16-06T-E1 | AUTO | 真バグ | thisCardOnly付与は正しいが、センターLRIG名《美兎》条件なしで常時granted abilityへ入る。 | `collectFieldSigniAbility`／`checkActiveCondition` | 内側subscriber条件は外側の付与可否を代行しない。 | カード名に《美兎》を含むセンタールリグがいるかぎり |
| S025 | WXK01-001-E1 | AUTO | 真バグ | owner:any count1へのkeyword付与は自分の`isDrive:true`全体でなく、同時に必要な+3000 actionも存在しない。 | `matchesStateFilter(isDrive)`／`calcFieldPowers`／keyword collector | CONTINUOUS source自己適用は「ドライブ状態の全SIGNI」を自動展開しない。 | あなたのドライブ状態のシグニのパワーを＋3000し、それらは |
| S026 | WXDi-P06-038-E2 | AUTO | 真バグ | shadow付与だけで、同じthisCardOnly対象への+2000を実行するPOWER_MODIFY stepがない。 | `execSequence`→`execPowerModify`／`execGrantKeyword` | keyword文字列はpower bonusを内包しない。 | このシグニのパワーを＋2000し |
| S027 | WXDi-P09-036-E1 | AUTO | 真バグ | timingはSIGNI/LRIG双方を集めるがmatchAction targetがSIGNIなので、LRIG attack時に候補が空になり無効化されない。 | `REVEAL_BOTH_DECK_TOPS`→`execNegateAttack:6261-6273` | triggerScope:any_oppは攻撃者ownerを揃えるだけでtarget.typeをLRIGへ変換しない。 | 対戦相手のシグニかルリグ１体がアタックしたとき |
| S028 | WX14-CB02-E1 | AUTO | 真バグ | protection対象filterに`cardName:'燦'`がなく、自SIGNI1体選択の別能力になっている。 | `execGrantProtection`／protection collector | subjectOwner:selfは所有者だけを限定し名称を補わない。 | あなたの《燦》はバニッシュされない |
| S029 | WX08-024-E2 | AUTO | 真バグ | live LIFE_CRASHはopponent1枚だけで、自分側1枚を同一解決中にcrashするstepがない。 | `execLifeCrash`／`SEQUENCE` | owner:opponentから対称処理を暗黙追加する慣例はない。 | あなたと対戦相手のライフクロス１枚をクラッシュする |
| S030 | SPDi01-133-E1 | AUTO | 真バグ＋機構待ち | destination bottom一択なので、3枚中exact1をdeck topへ分配する選択枠がない。 | `execLookAndReorder`／resume LOOK interaction | reorder:trueは同一destination内の順序だけでtop/bottom quotaを分けない。 | カード１枚をデッキの一番上に戻し |
| S031 | SPDi01-133-E1 | AUTO | 真バグ＋機構待ち | UIのcanTrashは任意集合であり、exact1必須trashを強制できない。 | `EffectInteractionModal:761-794`／`resumeLookAndReorder` | canTrash:trueを「必ず1枚」の慣例とは読めない。 | その中からカード１枚をトラッシュに置き |
| S032 | WXK11-013-E3 | AUTO | 真バグ | owner:self一本しかなく、相手センターLRIGのlimitを減らすCONTINUOUS宣言がない。 | `collectLrigLimitMods`／`lrigLimit.ts:40-80` | 「センタールリグ」無主語をselfに固定する慣例は注記の双方影響と衝突する。 | センタールリグのリミットは１減る（お互い…） |
| S033 | WX16-Re19-E2 | AUTO | 真バグ＋機構待ち | `LRIG_LIMIT_MODIFY.until`はEND_OF_TURN/NEXT_TURN/PERMANENTのみで、次の相手MAIN開始・終了に同期する寿命がない。 | `lrigLimit.ts`／phase transition | NEXT_TURNはメイン以外の次ターン位相にも効くため近似不可。 | 次の対戦相手のメインフェイズの間 |
| S034 | WX25-CP1-066-E2 | AUTO | 真バグ | target owner:anyかつname filterなしで相手や別名も+4000できる。 | `execPowerModify`→`fieldCandidates` | cost trash_selfは効果元を捨てるだけで強化対象を《雷ちゃん》へ縛らない。 | あなたの《雷ちゃん》１体 |
| S035 | WX25-P1-111-E1 | AUTO | 真バグ | liveは相手怪異へ即時-8000する別効果で、自分怪異へ二能力から1つを付与するCHOOSE/GRANT_EFFECT構造がない。 | `execChoose`／`execGrantEffect` | LBの-15000や引用内-8000を通常効果へ昇格する慣例はない。 | あなたの＜怪異＞のシグニ１体を対象とし…か…を得る |
| S036 | WX09-034-E2 | AUTO | 真バグ | trashのパルテノ/パルべック存在activeConditionなしで恒常+5000となる。 | `TRASH_HAS_CARD`／`calcFieldPowers` | duration PERMANENTは「条件があるかぎり」を自動再評価しない。 | あなたのトラッシュにカード名に《パルテノ》か《パルべック》 |
| S037 | WX09-034-E1 | AUTO | 真バグ | fieldの二名称OR条件がなく、該当SIGNI不在でも自己+5000が計算される。 | `HAS_CARD_IN_FIELD`／continuous power scan | thisCardOnlyは強化先だけを固定し条件sourceを表さない。 | あなたの場にカード名に《パルテノ》か《パルべック》 |
| S038 | WXDi-CP02-100-E1 | AUTO | 真バグ | costUnparsedのためself trashからブルアカ1枚をdeck bottomへ戻す支払いなしで+2000できる。 | effect cost payment／`TRANSFER_TO_DECK`相当 | action duration UNTIL_OPP_TURN_ENDは支払成立を保証しない。 | トラッシュから＜ブルアカ＞のカード１枚をデッキの一番下に置く |
| S039 | WXDi-P12-064-E1 | AUTO | 真バグ | collectorはアタッカーをtriggeringCardNumへ渡すが、live target owner:anyには`targetsTriggerSource`等がなく任意1体を再選択する。 | attack collector→`execPowerModify:targetsTriggerSource` | triggerFilter.isDisonaは発火元を絞るだけでaction targetへ同一性を伝播しない。 | そのシグニのパワーを＋5000する |
| S040 | WX21-045-E2 | AUTO | 真バグ | 手札1捨てと相手deck top3 trashの2 stepがなく、virus cost後すぐpowerだけを下げる。 | `execSequence`／`execTrash`／`execPowerModify` | removeOppVirus:3の支払履歴は相手手札・deck操作を内包しない。 | 対戦相手は手札を１枚捨て…デッキの上からカードを３枚トラッシュに置き |
| S041 | WX14-058-E1 | AUTO | 真バグ | level≥3かつCardNameフレイスロの自場存在条件なしで基本power10000が常時適用される。 | `HAS_CARD_IN_FIELD`→continuous `POWER_SET` | POWER_SETのsource自己適用は条件sourceまで自動抽出しない。 | レベル３以上のカード名に《フレイスロ》を含むシグニがあるかぎり |
| S042 | WX06-CB02-E1 | AUTO | 真バグ | `HAND_COUNT{owner:opponent,eq:0}`が既存なのにactiveConditionがなく、相手手札ありでも基本powerが10000になる。 | `checkActiveCondition(HAND_COUNT)`→`POWER_SET` collector | CONTINUOUSであることは手札0条件の暗黙評価を意味しない。 | 対戦相手の手札が０枚であるかぎり |
| S043 | WX25-P3-051-E1 | AUTO | 真バグ＋機構待ち | PREVENT_NEXT_DAMAGE count1は発生源・powerを見ず消費されるが、原文はターン中の該当相手SIGNI由来を全回防ぐ。 | damage funnel／`PREVENT_DAMAGE` state | 既存PREVENT_DAMAGE.scopeはALL/LRIGだけでSIGNI source power≤15000を表せない。 | このターン…パワー15000以下のシグニによってダメージを受けない |
| S044 | WXDi-P10-063-E1 | AUTO | 真バグ | REVEAL_AND_PICK終了後にcheck zoneのこのspellを自分の指定名SIGNI下へ任意移動する後段がない。 | spell resolution check-zone cleanup／`PLACE_UNDER_SIGNI` | remainder deck-top指定は見た残り札だけを扱い、使用spell自身には作用しない。 | このスペルをチェックゾーンから…《コードオーダー　エルドラ//メモリア》１体の下に置いてもよい |

## 3. 所見

### 【ライド】機構の現状カバレッジ

- **実装が在る部分**: `STUB:RIDE_ON`は自場の＜乗機＞を候補化し、未ドライブ時だけ任意選択して`lrig_riding_signi`と`drive_became_just`を更新する。ルリグattack gateはドライブ中を禁止し、turn-end clearも在る。`ON_SIGNI_BECOMES_DRIVE` watcherも結果を収集する。
- **生成が在る部分**: sentence parserは「センタールリグ…＜乗機＞のシグニ…乗ってもよい」という通常の効果本文を`RIDE_ON`へする。
- **欠落部分**: カード先頭のルールkeyword `【ライド】`は`stripKeywordPrefixes`が意図的に剥がすが、その前後に召喚/グロウ経路から`RIDE_ON`を注入するproducerがない。今回4枚はいずれもここで落ちる。
- **構造制約**: 4枚とも「赤×0・ターン1回・非ドライブ時・自分の乗機1体・ターン終了まで」という同一基礎能力。S001だけ注釈本文が省略されているため、本文regex拡張だけでは救えず、Card keyword認識を召喚後のACTIVATED能力生成へ結ぶ必要がある。
- **段2のまとめ方**: 第15バッチの【ライズ】【ハーモニー】と同じ「parserが出現/ルールkeywordを剥がし、別の召喚系consumerへ渡すべき」層なので、producer設計は1バッチにまとめられる。ただしconsumerはRise placement、Harmony payment、Ride activated state遷移で別物のため実装・goldenは3サブ機構に分けるべき。

今回、先回りメモCWは現行コードと食い違った。第12バッチ時点ではアタック回数台帳が無かったが、現在は`signi_attack_once_limit`、`attacked_signi_ids`、共通`signiAttackGate`、`LIMIT_OPP_SIGNI_ATTACKS_ONCE` consumerが揃っている。S013は機構待ちではなくproducer/action選択の真バグである。

## 4. 機構待ち一覧

| 登録単位 / findings | 不足語彙・機構・配線 |
|---|---|
| attack単位damage shield / S005 | damage preventionに現在のattack instanceへ束縛する寿命を追加し、attack終了funnelでのみ失効させる。`BLOCK_ACTION.END_OF_ATTACK`とはconsumerを分ける。 |
| 効果元power条件付きprotection / S006 | protection collectorが効果適用直前のsource card instanceと実効powerを受け、`sourceFilter.powerRange.min`相当を評価する配線。第8/9/16バッチの「条件が対象へ誤付着」ファミリ。 |
| LOOK exact partition / S030,S031 | **第11バッチ§4 SPK01-08-E1と同一機構**。LOOK集合をtrash exact1 / deck-top exact1 / remainder bottomへ分配し、確定時にquotaを強制するUI・resume配線。二重登録しない。 |
| 次の相手MAIN限定limit / S033 | LRIG limit modifierを次の相手MAIN開始でactive化し、そのMAIN終了で消すphase-scoped 2-slot stateと`collectLrigLimitMods`配線。 |
| source power限定・期間中damage shield / S043 | **第13バッチ§4 WXDi-P03-077-BURSTのsource限定PREVENT_DAMAGEと同一基盤**。source owner=opponent、type=SIGNI、effective power≤15000をdamage funnelで毎回照合し、ターン末まで非消費で保持する。 |

## 5. 偽陽性の件数についての自己評価

事前予測は、混成小粒群かつlive無6件を含むため偽陽性2〜5件（約5〜11%）だった。実測は3/44＝6.8%。内訳はEffectText直読みRise 2件と、triggerConditionをcollectorが消費済みの捨てコスト原因1件。特にlive無を即断せずS007/S008を第7バッチのconsumer確認へ戻し、S023は型宣言で止めずcollector行まで開いたため、想定帯の下側ながら説明可能な値である。

## 6. 条件以外で見つけた原文との食い違い

2件。

- S025 `WXK01-001-E1`: findingのowner/drive限定に加え、同じ常時能力のpower＋3000も欠落。
- S035 `WX25-P1-111-E1`: findingの選択主体だけでなく、能力付与が直接power－8000へ変質し、対象ownerもself→opponent、通常効果のdurationもターン終了まで→INSTANTへ崩れている。

## 7. ゲート・差分・成果物確認

`npm run gates`は全緑（実測）:

- typecheck PASS
- golden **2337 / FAIL 0**
- smoke **10693効果、OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**
- census **773 / baseline 773**
- census:stubs 無言no-op **0**（A群🔴0 / C群0）
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git status --short`は作業開始前からのM 2本（`scripts/archive/semanticAuditLedger.mjs`、`scripts/archive/semanticAuditMkBatchSingles.mjs`）と既存の第8〜22バッチ未追跡成果物、入力`stage1_batch23.txt`／索引、今回の`stage1_batch23_triage.md`。今回新たに変更したtracked fileは0、作成したのは本報告書1本だけ。

`git diff --stat`は既存の計器2本だけで **2 files changed, 27 insertions(+), 6 deletions(-)**。本作業では両計器に触れていない。

分類表は **44行 / 根拠44種類（unique 44、100%）**。UTF-8の先頭20行・末尾20行を読み返し済み。最終`wc -c`相当（PowerShell `Get-Item.Length`）は **24,614 bytes**。

## 8. ガードレール2・3・4・7で当初の見立てから変えた件

- S001〜S004: live無だけなら機構待ち候補だったが、`RIDE_ON`、状態更新、watcher、attack禁止、turn-end clearまで在るため、既存consumerへ届かない真バグへ変更。
- S007/S008: JSON欠落から真バグに見えるが、EffectText直読みRise consumerを確認して偽陽性を維持（再登場分）。
- S013: 先回りメモと第12バッチ§4に従えば機構待ちだったが、隣接stubと現行gateを開くと合計1回制限が実装済みだったため、真バグのみへ変更。
- S023: 原文の【出】【起】限定が表面JSONに専用fieldとして見えにくいが、`discardCostSourceStory`を`collectHandDiscardTriggers`が実消費するため真バグ候補から偽陽性へ変更。
- S027: timing配列にSIGNI/LRIG双方があるため偽陽性候補だったが、帰結consumerがtarget.type SIGNIを候補化しLRIG attackでは空振りするため真バグへ変更。
- S030/S031: `reorder:true/canTrash:true`で表せる候補を外し、UIが任意trashかつ単一destinationしか扱わないため、第11バッチ既登録のexact partition機構待ちへ変更。
