# 実機シナリオ 全件実行の既存 FAIL（2026-09-19）

全992本を1回の実行で回し（§4.4-120 の分離対策後）、2回とも FAIL かつ**分離対策前のハーネス（cf2289e51）でも FAIL** だったもの＝85本。
＝今回の変更とは無関係に、以前から全件実行で落ちていた（全件を回す運用が無く、見えていなかった）。
⚠`cpuAckWriteLostStillEnds` は決着でルームを消すシナリオ＝単独で回す（§4.4-115）ので除外。

## A 撤回済みの相打ち（O-47）前提＝シナリオが古い（12本）

- o47AttackerLosesIsBanished (4s)  — 負け＝アタッカー(P3000)が場を離れた=false／エナゾーンへ=false／防御側(P15000)は残存=true（host場=[null,["WD01-013#4702"],null] guest場=[null,["WX01-053#4701"],null]）
- o47TieBanishesBoth (4s)  — 相打ち＝アタッカーが離場=false／防御側も離場=true（host場=[null,["WD01-013#4703"],null] guest場=[null,null,null]・host energy=[] guest energy=["WD01-013#4704"]）
- o49AttackerBanishRedirectToTrash (4s)  — WXK11-032と相打ち→アタッカーがトラッシュ=false／エナに混ざらない=true
- o49AttackerNoRedirectGoesToEnergy (4s)  — 置換なし→アタッカーがエナ=false／トラッシュに混ざらない=true
- o49AttackerRedirectRespectsLevelFilter (4s)  — L1アタッカー→トラッシュ=false／エナに混ざらない=true
- o49AttackerRedirectRejectsLevel2 (4s)  — L2アタッカー→エナ=false／トラッシュに混ざらない=true
- o49AttackerSelfExileReplacesLeave (4s)  — WXK05-024がトラッシュ（除外近似）=false／エナに混ざらない=true
- o58ArtemisAttackerBanish (4s)  — アルテミス残存=true／下1枚→トラッシュ=false／victimは移動しない=true
- o58GustavAttackerBanishOnce (4s)  — 1回目は場に残存=true／abilities_removedへ記録=false
- o58OpponentTurnOnlyDoesNotProtectAttacker (4s)  — バゲットは回避せず離場=false／エナへ=false／付属アクセは通常処理でトラッシュ=false
- b62AcceBanishDraws (21s)  — 前提崩れ＝アタッカーがバトルで失われていない（hZone0=["WD01-013#1"]）
- b62AcceBanishNoAcce (21s)  — 前提崩れ＝アタッカーがバトルで失われていない（hZone0=["WD01-013#1"]）

## B 任意選択の辞退が「スキップ」だけになった（5c8ae247c）＝シナリオが古い（5本）

- targetDeclOpponentOnlyCandidates (6s)  — owner候補は正しいが0体確定ボタンを押せない（candidates=["WD01-012#4692","WD01-013#4693","WD01-014#4694"]）
- targetDeclUpToTwoAllowsZero (5s)  — 「決定 (0/2)」がenabledでなく0体確定できない
- targetDeclPowerCapUsesEffectivePower (16s)  — 実効パワー候補0の完走タイムアウト（mod=true postTargetChoose=false skipped=false candidates=null pEff=-）
- b34ZeroPickAllowedWhenUpTo (21s)  — 未完了（zoned=false confirm=null hField=[null,null,null] pEff=-）
- v227OptionalDownSkip (5s)  — 選択UIは出たが0体確定ボタンを押せない（候補=["WXDi-P16-078#39100"]）＝辞退できていない

## C 未分類（前提崩れ・未完了・観測できず）（68本）

- freezetriggerUsageLimit (9s)  — 1回目のON_SIGNI_FROZENが未発火（gHand 0→0）＝usageLimit検証の前提が崩れた
- lrigGrowAnyOpp (19s)  — CPUグロウ自体が発生せず検証空振り（guest={"hand":0,"handCards":[],"trash":2,"trashCards":["WD03-013#1","WD03-013#2"],"energy":1,"energyCards":["WD03-013#3"],"energyPlacedThisTurn":[],"piecesUsedThisTurn":[],"arts
- lrigAttackStepStartUsageLimit (27s)  — 判定未確定（1回目発火=未確認・phase=ATTACK_LRIG gHand=0）
- leaveFieldToHand (22s)  — ON_LEAVE_FIELD(leftToZone:hand) 未確認（hPowerMods=- hField=[["WXK02-041#1"],["WX21-057#1"],null] pEff=-）
- outsideDrawPhase (21s)  — outsideDrawPhase 未確認（hPowerMods=- hHand=0（開始0） pEff=CHOOSE）
- delayedAttackTrigger (16s)  — 遅延トリガー発火 未確認（hand=4 energy=0 phase=MAIN）
- installDelayedTriggerFire (27s)  — 発火未確認（gHand=0（開始0）delayed=[] phase=ATTACK_SIGNI pEff=-）
- installByEffectFreeze (20s)  — 発火未確認（gFrozen=[false,false,false] gPowerMods=- hField=[["WXDi-P07-044#1"],null,["WD01-012#9"]] pEff=-）
- craftEnergyCP02087 (11s)  — ADD_TO_FIELD成功だが後続GRANT_KEYWORD(絆常)無発火（kwGrants=[]）＝continuation欠落バグ
- lookReorderCanTrash (21s)  — 未完了。場に出た赤=[] remainder(WD01-013#1)がトラッシュ=false deck=12→12 trash=0→0 field=[null,null,null]
- oppDrawOwnEffectOnly (16s)  — SPDi43-21のguestドロー自体が未発生＝検証空振り（hHand=0 gHand=0 phase=ATTACK_ARTS pEff=-）
- mayuEncounterFreeGrow (20s)  — 反転/無料グロウ未確認（hLrigTop=WD01-003#1 identity={} actionsDone=[] keyPiece=null pEff=-）
- wx22025SigniTrashUnavailable (21s)  — 未完了（sawDisabled=true）
- spdi4302AvoidedNoChoose (19s)  — 未完了（picked=false hHand=0 pEff=CHOOSE）
- wxex225SkipAutoTrashesTrigger (21s)  — 未完了（opened=true skipClicked=false hField=[null,["WD01-012#96"],["WD01-012#97"]] hTrash=["WD01-013#96"] pEff=-）
- wx17040ConditionsFalseNoop (21s)  — 未完了（gateChecked=true choose3=true confirmed=true pEff=SELECT_TARGET）
- lrigDownCenterOnlyUnwired (14s)  — 未完了（stackModalSeen=false abilityBtnSeen=false activated=false hHand=0 pEff=-）
- lrigDownCenterOnlyPays (18s)  — 未完了（abilityBtnSeen=false activated=false hHand=0 hLrigDown=false pEff=-）
- v11EffectDeployCountFlagBlocked (16s)  — フラグ版配置制限を確定できず（hField=[["WD01-012#6101"],["WD01-012#6102"],null] hTrash=["WD01-013#6103"] logTail=[] pEff=- stack=0）
- v11EffectDeployNoLimitControl (16s)  — 対照の効果配置成功を確定できず（before=[["WD01-012#6111"],["WD01-012#6112"],null] hField=[["WD01-012#6111"],["WD01-012#6112"],null] hTrash=["WD01-013#6113"] logTail=[]）
- v11EffectDeployContinuousBlocked (16s)  — CONT版配置制限を確定できず（hField=[["WD01-012#6121"],["WD01-012#6122"],null] gField=[["WX07-006#6126"],null,null] hTrash=["WD01-013#6123"] logTail=[]）
- v12GrantedEnergyChargeTwice (15s)  — 1回目のエナチャージ後、約5秒待ってもルリグがアップしない（energy=1 lrigDown=true）
- v12GrantedEnergyChargeThirdBlocked (14s)  — 1回目（正方向）のエナチャージで約5秒待ってもアップしない（energy=1 lrigDown=true）
- fezoneDoubleCostSkip (14s)  — skip対照未完了（skipped=false hE=1 hH=2 gField=[["WD01-013#133"],null,null]）
- fezoneDoubleCostPay (23s)  — 複合pay未完了（hE=1 hH=2 gField=[["WD01-013#123"],null,null] bottom=WD01-013#125 pEff=SELECT_TARGET）
- handDiscardSkipBlocksBody (23s)  — skip完走タイムアウト（prompted=false branch=false guard=false/false target=false/false hHand=["WD01-017#4811","WD01-013#4812","WD01-014#4813"] gField=[["WD01-013#4815"],null,null] pEff=SELECT_TA
- handDiscardPayRunsBody (23s)  — pay完走タイムアウト（prompted=false branch=false guard=false/false target=false/false hHand=["WD01-017#4811","WD01-013#4812","WD01-014#4813"] gField=[["WD01-013#4815"],null,null] pEff=SELECT_TARGET
- handDiscardOptionTwoDownsOpponentLrig (31s)  — 選択肢2完走タイムアウト（arts=true/true/3/true choose=true/true/true cost=false/false/false/false target=false/false hE=0 hDown=false/[false,false,false] gDown=false/[false,false,false]
- handDiscardOptionThreeDownsOpponentSigni (31s)  — 選択肢3完走タイムアウト（arts=true/true/3/true choose=true/true/true cost=false/false/false/false target=false/false hE=0 hDown=false/[false,false,false] gDown=false/[false,false,fal
- underCostFromThisOnly (28s)  — fromThis完走タイムアウト（prompted=false paid=false cost=false/false target=false/false hField=[["WD01-017#4911","WXK08-052#4913"],["WD02-010#4912","WD01-013#4914"],null] gPower=[] gLife=7 pEff=SELE
- v04TanabataLeaveFieldE3 (23s)  — E3の噛み合わせ未確認（field=[["WD02-010#6002","WXDi-P10-041#6003"],["WX21-057#6004"],null] hand=[] energy=[] trash=["WD02-010#6001"]）
- v13TrashActLrigDownTwo (44s)  — 完走タイムアウト（mechanism=true stackSeen=true sourceCount=1 trash=["WXDi-P04-042#7303"] field=[null,null,null] specific=センター→アシストLの順でdown=[true,true,false] pending=SELECT_TARGET stack=0）
- v14PermanentPlayerGrantSurvivesHumanEndNoDiscard (24s)  — player付与の成立前提を観測できず（action=false grants=[] lrigTrash=[] logs=[]）
- v17CoinPaymentDoesNotFire (58s)  — 効果獲得/支払い判定未完了（payment=true started=true host={"fieldSigni":[["WXDi-P15-069#8901"],["SP27-007#8902"],null],"signiDown":[false,false,false],"hand":[],"trash":[],"energy":["WD02-009#8903",
- v64DamageReplaceByCostPaysAndLosesAbility (17s)  — ダメージ置換タイムアウト（hLife=7 hHand=["WD01-013#900"] lrigGranted=undefined phase=ATTACK_SIGNI）
- v34EnergyMoveImmunityBlocksTrash (5s)  — guest.energy 1→2（期待不変＝保護で不発）
- v34EnergyMoveImmunityAbsentTrashFires (5s)  — guest.energy 1→1（期待-1＝奪われた）
- v51LeaveSubstitutePaysAndSurvives (11s)  — survived=true（期待true） / paid=false（期待true＝支払いログ確認） / hField=[["WX25-P2-059#9992"],null,null]
- v55CheckZoneFlipGrowsAndOnPlayFires (6s)  — grew=false（期待true＝WXDi-P16-001Bへグロウ） / sawOnPlayLog=false（期待true＝【出】発火） / lrigTop=WD01-001#9960
- wxdip09053GrantUpToTwo (26s)  — 付与未確認（candidates=["WD01-013#1","WD01-013#2"] shadowLogCount=0 pEff=-）
- wx20re18DynamicLevelAttackBanish (20s)  — バニッシュ未確認（attacked=false gField=[null,null,["WX01-053#1"]] pEff=-）
- v40DeclaredIconHandDiscardProtects (10s)  — 捨てた札の色=白・宣言="小剣　ククリを捨てた（宣言《緑》）"（declared=緑）・対象banished=true（期待=true）・gField=[null,null,null]（整合=true）
- v45cPaySelfBanishRemovesOnlyFiltered (17s)  — 未完了（pay=true attacked=true selfPaid=false declined=false pEff=SELECT_TARGET）
- v45cSkipSelfBanishDoesNothing (17s)  — 未完了（pay=false attacked=true selfPaid=false declined=false pEff=SELECT_TARGET）
- v16NonEichiAbilityDoesNotUpWatcher (18s)  — 未完了（attacked=true abilityLog=true down=[true,true,false] logs=["[自分] 凶魔　アオヒゲ の【自】効果（シグニアタック時）"]）
- b54EnergySelfReviveOnlySelf (25s)  — 未完了（cast=true victim=true cands=["WD14-012#3802"] picked=true ena=["WD01-010#3811","WD01-013#3812","WD14-012#3802"] field=[null,null,null] pEff=SELECT_TARGET）
- o56BurstAsCheckDoesNotEnterCheckZone (24s)  — 未完了（attacked=true hand=0 check=- trash=[]）
- b41GrantKeywordTargetsOwnSigniOnly (20s)  — 到達できず（energyPicked=false paid=false sawPicker=false picked=false pEff=SELECT_TARGET candidates=["WX25-P3-059#54111","WD01-013#54112"] grants=[]）
- b60UnderCardsSurvive (20s)  — 未完了＝この STUB に到達しない（logTail=["小悪の象徴　コオニを召喚","[自分] 舞踏の童話　グラシュ の【自】効果（他のシグニ召喚時）","このシグニを小悪の象徴　コオニの【アクセ】にしますか？"]）
- b60UnderCardsTrashed (18s)  — 対照が未完了（stack=["WD01-013#91","WD01-014#91","WXDi-CP02-054#1"] logTail=["[自分] 天童アリス の【自】効果（シグニアタック時）"]）
- b46KeyTrashOnlyControl (74s)  — 前提崩れ＝【起】を撃てていない（キーがルリグトラッシュへ行っていない）。labels=[] energy ["WX05-077#3","WX05-079#3","WD01-013#60"]→["WX05-077#3","WX05-079#3","WD01-013#60"] lrigTrash 0→0 trash=["WD05-012#9"]
- censusDistinctByNameMet (9s)  — 🔴5種類あるのにパワーが変わらない（powerMods=[]）
- o146EnergyTopSkip (4s)  — 選ばなかったのにエナが減った（1）。候補UI=true 候補=["pick-0:小剣　ククリ"] energy=1 deckTop=WD01-013#9601 free=["WX24-P1-TK2A#1"]
- o145LifeTopTake (20s)  — 🔴二択が出ないまま解決した＝任意の移動そのものが実装されていない（旧挙動）。二択UI=false 選択=false life=["WD01-013#9701","WD01-013#9702"] deck=4 shuffled=0
- o145LifeTopSkip (19s)  — 🔴二択が出ないまま解決した＝任意の移動そのものが実装されていない（旧挙動）。二択UI=false 選択=false life=["WD01-013#9701","WD01-013#9702"] deck=4 shuffled=0
- o71HandToCheckZone (9s)  — 手札へ戻っていない（guestHand=4 checkRest=[] guestTrash=[]）
- o245CoinKeySetBlocked (4s)  — 前提崩れ＝キーの「キーにセット」に到達できない（キーにセット,ピースを使用 action が3秒以内に描画されない）
- v142FourChoices (6s)  — 🔴「4つまで選ぶ」になっていない（提示={"single":false,"multi":null,"optCost":false}）
- v139PieceLimitSelfPlus2 (2s)  — 🔴自分のリミット修整が＋2でない。自分 mod=0/pending=0｜相手 mod=0/pending=0
- v139ReleaseLimitBothSides (2s)  — 🔴自分のリミット＋1が乗っていない（self=0）＝旧の「相手側が一致したら自分側を飛ばす」構造。自分 mod=0｜相手 mod=0/pending=-2
- o297GateZoneBanishFires (18s)  — バトルバニッシュ自体が未確認＝観測不能（hostField=[["WXDi-P16-074#9400"],["WD01-013#9402"],null] guestHand=2）
- o297OtherZoneGateSilent (18s)  — バトルバニッシュ自体が未確認＝観測不能（hostField=[["WXDi-P16-074#9400"],["WD01-013#9402"],null] guestHand=2）
- o230GuardAltCollab (1s)  — 🔴代替コスト「コラボライバー1人とコラボ」が出ない（旧＝明示 defer／payload が読めていない）。ボタン=["サーバント Ｏガードに使う（トラッシュへ）","ガードしない（ライフクロスクラッシュ）","↺","終了"]
- v167DeclaredColorTrashAll (5s)  — 🔴残枚数が期待と違う（期待 1枚）。宣言=緑 相手エナ ["WD01-013#1","WD03-013#1","WX04-080#1"] → []（3枚 → 0枚）lrigTop=WXEX1-07#1
- v167DeclaredColorKeepsAll (5s)  — 🔴残枚数が期待と違う（期待 3枚）。宣言=赤 相手エナ ["WD01-013#1","WX04-060#1","WD09-014#1"] → []（3枚 → 0枚）lrigTop=WXEX1-07#1
- v172BattleBanishDoesNotFire (30s)  — 決着せず（hostField=[["WD21-017#1"],["WX15-046#1"],null] watcherGone=false placed=false attacked=true logs=["[あなた] シグニアタックフェイズ","羅星　≡センヤ≡（2000）vs 甲冑　ローメイル（13000）","羅星　≡センヤ≡はパワーが足りず、両方のシグニが
- v171BanishedSigniDoesNotLower (95s)  — 決着せず（hostField=[["WX18-056#1"],["WD05-014#1"],null] attacked=false sacGone=false logs=["[あなた] シグニアタックフェイズ","堕落の砲女　サキュ（1000）vs 甲冑　ローメイル（13000）","堕落の砲女　サキュはパワーが足りず、両方のシグニが残る"]）
- o321PieceUsedGateFires (13s)  — 🔴ピースを使ったのに履歴が立たない（pieces=[]）

