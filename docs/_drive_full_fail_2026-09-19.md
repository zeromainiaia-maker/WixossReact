# 実機シナリオ 全件実行の既存 FAIL（2026-09-19）

全992本を1回の実行で回し（§4.4-120 の分離対策後）、2回とも FAIL かつ**分離対策前のハーネス（cf2289e51）でも FAIL** だったもの＝85本。
＝今回の変更とは無関係に、以前から全件実行で落ちていた（全件を回す運用が無く、見えていなかった）。
⚠`cpuAckWriteLostStillEnds` は決着でルームを消すシナリオ＝単独で回す（§4.4-115）ので除外。

> 🏁**2026-09-19＝A・B の17本＋C の64本を解消**（BUGFIXES 同日の項）。残り＝**C の4本**。
> ⚠**残数は「C 全68本を1回の実行で回し直した実測」**（推測ではない）＝解消済みの行はこのファイルから消してある。

## 🏁A 撤回済みの相打ち（O-47）前提＝シナリオが古い（12本・2026-09-19 解消）

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

## 🏁B 任意選択の辞退が「スキップ」だけになった（5c8ae247c）＝シナリオが古い（5本・2026-09-19 解消）

- targetDeclOpponentOnlyCandidates (6s)  — owner候補は正しいが0体確定ボタンを押せない（candidates=["WD01-012#4692","WD01-013#4693","WD01-014#4694"]）
- targetDeclUpToTwoAllowsZero (5s)  — 「決定 (0/2)」がenabledでなく0体確定できない
- targetDeclPowerCapUsesEffectivePower (16s)  — 実効パワー候補0の完走タイムアウト（mod=true postTargetChoose=false skipped=false candidates=null pEff=-）
- b34ZeroPickAllowedWhenUpTo (21s)  — 未完了（zoned=false confirm=null hField=[null,null,null] pEff=-）
- v227OptionalDownSkip (5s)  — 選択UIは出たが0体確定ボタンを押せない（候補=["WXDi-P16-078#39100"]）＝辞退できていない

## C 未分類（前提崩れ・未完了・観測できず）（残り **4本** / 元68本）

🏁**解消済み64本**（この節から削除済み）＝v64DamageReplaceByCostPaysAndLosesAbility / b60UnderCardsSurvive / b60UnderCardsTrashed / wxdip09053GrantUpToTwo / v14PermanentPlayerGrantSurvivesHumanEndNoDiscard / o56BurstAsCheckDoesNotEnterCheckZone / handDiscardSkipBlocksBody / handDiscardPayRunsBody / handDiscardOptionTwoDownsOpponentLrig / handDiscardOptionThreeDownsOpponentSigni / v45cPaySelfBanishRemovesOnlyFiltered / v45cSkipSelfBanishDoesNothing / o245CoinKeySetBlocked / v55CheckZoneFlipGrowsAndOnPlayFires / o71HandToCheckZone / v51LeaveSubstitutePaysAndSurvives / b41GrantKeywordTargetsOwnSigniOnly / b54EnergySelfReviveOnlySelf / v16NonEichiAbilityDoesNotUpWatcher / wx20re18DynamicLevelAttackBanish / v172BattleBanishDoesNotFire / v171BanishedSigniDoesNotLower / o297GateZoneBanishFires / o297OtherZoneGateSilent / handDiscardSkipBlocksBody / handDiscardPayRunsBody / handDiscardOptionTwoDownsOpponentLrig / handDiscardOptionThreeDownsOpponentSigni / freezetriggerUsageLimit / lrigGrowAnyOpp / lrigAttackStepStartUsageLimit / leaveFieldToHand / outsideDrawPhase / delayedAttackTrigger / installDelayedTriggerFire / installByEffectFreeze / craftEnergyCP02087 / lookReorderCanTrash / oppDrawOwnEffectOnly / mayuEncounterFreeGrow / wx22025SigniTrashUnavailable / spdi4302AvoidedNoChoose / wxex225SkipAutoTrashesTrigger / wx17040ConditionsFalseNoop / lrigDownCenterOnlyUnwired / lrigDownCenterOnlyPays / v11EffectDeployCountFlagBlocked / v11EffectDeployNoLimitControl / v11EffectDeployContinuousBlocked / v12GrantedEnergyChargeTwice / v12GrantedEnergyChargeThirdBlocked / fezoneDoubleCostSkip / fezoneDoubleCostPay / underCostFromThisOnly / v34EnergyMoveImmunityBlocksTrash / v34EnergyMoveImmunityAbsentTrashFires / v40DeclaredIconHandDiscardProtects / censusDistinctByNameMet / o146EnergyTopSkip / o145LifeTopTake / o145LifeTopSkip / v142FourChoices / v139PieceLimitSelfPlus2 / v139ReleaseLimitBothSides / o230GuardAltCollab / v167DeclaredColorTrashAll / v167DeclaredColorKeepsAll / o321PieceUsedGateFires

- v04TanabataLeaveFieldE3 (23s)  — E3の噛み合わせ未確認（field=[["WD02-010#6002","WXDi-P10-041#6003"],["WX21-057#6004"],null] hand=[] energy=[] trash=["WD02-010#6001"]）
- v13TrashActLrigDownTwo (44s)  — 完走タイムアウト（mechanism=true stackSeen=true sourceCount=1 trash=["WXDi-P04-042#7303"] field=[null,null,null] specific=センター→アシストLの順でdown=[true,true,false] pending=SELECT_TARGET stack=0）
- v17CoinPaymentDoesNotFire (58s)  — 効果獲得/支払い判定未完了（payment=true started=true host={"fieldSigni":[["WXDi-P15-069#8901"],["SP27-007#8902"],null],"signiDown":[false,false,false],"hand":[],"trash":[],"energy":["WD02-009#8903",
- b46KeyTrashOnlyControl (74s)  — 前提崩れ＝【起】を撃てていない（キーがルリグトラッシュへ行っていない）。labels=[] energy ["WX05-077#3","WX05-079#3","WD01-013#60"]→["WX05-077#3","WX05-079#3","WD01-013#60"] lrigTrash 0→0 trash=["WD05-012#9"]



## 観測メモ（2026-09-19・別件の follow-up）

- ⚠**`v57TeamConditionPieceNoUseButtonOutsideCutin` はいま判別力が怪しい**＝「【使用条件】【チーム】ピースは
  カットイン窓の外では『使用』ボタンが出ない」を見る負方向テストだが、**盤面のルリグがセンター1体だけ**なので
  §5.6 `C-7`（ピースは場にルリグ3体が要る・2026-09-17）以後は**チーム条件に関係なくボタンが出ない**。
  ⇒ 緑のままだが「窓の外だから出ない」ことを示していない可能性がある。**アシスト2体を置いた positive 側と対にして測り直す**こと（§4.4-3）。
  🔑同じ形の見落としを避けるため、**ピースを使うシナリオは `lrig_deck` にピースがあるのに `assist_lrig_*` を置いていないものを grep で洗う**
  （2026-09-19 の掃除ではこの1本だけが残った）。