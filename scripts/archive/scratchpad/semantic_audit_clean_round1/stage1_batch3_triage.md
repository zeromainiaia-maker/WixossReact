# 意味照合監査 clean群 round1 段1・第3バッチ triage

対象: D001–D040、107 findings / 101カード。実装・既存ファイル変更なし。真バグかつ機構待ちは両方に計上する。

## 1. サマリ表

| cluster | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|
| D001 | 4 | 0 | 0 | 0 |
| D002 | 3 | 0 | 0 | 0 |
| D003 | 3 | 0 | 0 | 0 |
| D004 | 3 | 0 | 3 | 0 |
| D005 | 3 | 0 | 0 | 0 |
| D006 | 3 | 0 | 3 | 0 |
| D007 | 3 | 0 | 0 | 0 |
| D008 | 3 | 0 | 0 | 0 |
| D009 | 3 | 0 | 0 | 0 |
| D010 | 3 | 0 | 0 | 0 |
| D011 | 3 | 0 | 0 | 0 |
| D012 | 3 | 0 | 3 | 0 |
| D013 | 3 | 0 | 3 | 0 |
| D014 | 3 | 0 | 3 | 0 |
| D015 | 3 | 0 | 0 | 0 |
| D016 | 3 | 0 | 3 | 0 |
| D017 | 3 | 0 | 3 | 0 |
| D018 | 3 | 0 | 0 | 0 |
| D019 | 3 | 0 | 0 | 0 |
| D020 | 3 | 0 | 0 | 0 |
| D021 | 3 | 0 | 0 | 0 |
| D022 | 3 | 0 | 0 | 0 |
| D023 | 3 | 0 | 0 | 0 |
| D024 | 3 | 0 | 0 | 0 |
| D025 | 3 | 0 | 3 | 0 |
| D026 | 3 | 0 | 0 | 0 |
| D027 | 2 | 0 | 0 | 0 |
| D028 | 2 | 0 | 0 | 0 |
| D029 | 2 | 0 | 0 | 0 |
| D030 | 2 | 0 | 2 | 0 |
| D031 | 2 | 0 | 0 | 0 |
| D032 | 2 | 0 | 2 | 0 |
| D033 | 2 | 0 | 0 | 0 |
| D034 | 2 | 0 | 0 | 0 |
| D035 | 2 | 0 | 0 | 0 |
| D036 | 2 | 0 | 0 | 0 |
| D037 | 2 | 0 | 0 | 0 |
| D038 | 2 | 0 | 0 | 0 |
| D039 | 2 | 0 | 0 | 0 |
| D040 | 2 | 0 | 0 | 0 |
| **計** | **107** | **0** | **28** | **0** |

脚注: 機構待ち28件は全件「真バグ かつ 機構待ち」で、真バグにも重複計上した。

## 2. finding 全107件の分類表

| effectId | parseStatus | 分類 | 根拠／直す場所 | consumer | 原文の該当句 |
|---|---|---|---|---|---|
| WX16-Re09-E1 | AUTO | 真バグ | D001: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | GRANT_*→effectEngine の activeCondition/付与効果収集（相手ターン条件の付与内包表現が必要） | 対戦相手のターンの間 |
| WXDi-P01-049-E1 | AUTO | 真バグ | D001: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | GRANT_*→effectEngine の activeCondition/付与効果収集（相手ターン条件の付与内包表現が必要） | 対戦相手のターンの間 |
| WXDi-P07-009-E1 | AUTO | 真バグ | D001: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | GRANT_*→effectEngine の activeCondition/付与効果収集（相手ターン条件の付与内包表現が必要） | 対戦相手のターンの間 |
| WXDi-P09-053-E1 | AUTO | 真バグ | D001: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | GRANT_*→effectEngine の activeCondition/付与効果収集（相手ターン条件の付与内包表現が必要） | 対戦相手のターンの間 |
| WX18-060-E1 | AUTO | 真バグ | D002: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execSearch / matchesFilter（TargetFilter.keyword相当。現状【レイヤー】専用filterなし） | 【レイヤー】を持つシグニ |
| WXEX1-05-E1 | AUTO | 真バグ | D002: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execSearch / matchesFilter（TargetFilter.keyword相当。現状【レイヤー】専用filterなし） | 【レイヤー】を持つシグニ |
| WXEX1-05-E2 | AUTO | 真バグ | D002: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execSearch / matchesFilter（TargetFilter.keyword相当。現状【レイヤー】専用filterなし） | 【レイヤー】を持つシグニ |
| WX10-041-E1 | AUTO | 真バグ | D003: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execRevealAndPick / execSearch / TRANSFER_TO_DECK executor（クラス別2枠選択） | ＜アーム＞のシグニ１枚と |
| WXEX1-01-E3 | AUTO | 真バグ | D003: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execRevealAndPick / execSearch / TRANSFER_TO_DECK executor（クラス別2枠選択） | ＜アーム＞のシグニ１枚と |
| WXEX1-53-E2 | AUTO | 真バグ | D003: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execRevealAndPick / execSearch / TRANSFER_TO_DECK executor（クラス別2枠選択） | ＜アーム＞のシグニ１枚と |
| WX21-053-E1 | AUTO | 真バグ＋機構待ち | D004: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。公開イベントcollectorへ cause source の owner・cardType・class を渡して評価する配線が必要 | ＜龍獣＞のシグニの効果によって |
| WX21-064-E1 | AUTO | 真バグ＋機構待ち | D004: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。公開イベントcollectorへ cause source の owner・cardType・class を渡して評価する配線が必要 | ＜龍獣＞のシグニの効果によって |
| WX22-036-E1 | AUTO | 真バグ＋機構待ち | D004: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。公開イベントcollectorへ cause source の owner・cardType・class を渡して評価する配線が必要 | ＜龍獣＞のシグニの効果によって |
| WX24-P3-077-E1 | AUTO | 真バグ | D005: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execDown→resolveTarget / matchesFilter（thisCardOnly） | アップ状態のこのシグニ |
| WX25-CP1-066-E3 | AUTO | 真バグ | D005: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execDown→resolveTarget / matchesFilter（thisCardOnly） | アップ状態のこのシグニ |
| WXDi-CP02-081-E2 | AUTO | 真バグ | D005: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execDown→resolveTarget / matchesFilter（thisCardOnly） | アップ状態のこのシグニ |
| WX16-034-LAYER-E1 | AUTO | 真バグ＋機構待ち | D006: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。GRANT_PROTECTION/効果耐性判定へ原因ARTSの総コストを渡す配線が必要 | コストの合計が１以下 |
| WX21-040-E2 | AUTO | 真バグ＋機構待ち | D006: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。GRANT_PROTECTION/効果耐性判定へ原因ARTSの総コストを渡す配線が必要 | コストの合計が１以下 |
| WXK09-047-E1 | AUTO | 真バグ＋機構待ち | D006: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。GRANT_PROTECTION/効果耐性判定へ原因ARTSの総コストを渡す配線が必要 | コストの合計が１以下 |
| WX05-045-E1 | AUTO | 真バグ | D007: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | INSTALL_DELAYED_TRIGGER→collectTurnEndTriggers / executeAction | このターン終了時 |
| WXDi-P07-071-E1 | AUTO | 真バグ | D007: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | INSTALL_DELAYED_TRIGGER→collectTurnEndTriggers / executeAction | このターン終了時 |
| WXK01-035-E1-G | AUTO | 真バグ | D007: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | INSTALL_DELAYED_TRIGGER→collectTurnEndTriggers / executeAction | このターン終了時 |
| WXK02-067-E1 | AUTO | 真バグ | D008: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | checkActiveCondition→ZONE_MOVED_THIS_TURN（owner:any） | シグニが場から手札に |
| WXK02-069-E1 | AUTO | 真バグ | D008: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | checkActiveCondition→ZONE_MOVED_THIS_TURN（owner:any） | シグニが場から手札に |
| WXK02-072-E1 | AUTO | 真バグ | D008: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | checkActiveCondition→ZONE_MOVED_THIS_TURN（owner:any） | シグニが場から手札に |
| WX24-P3-037-E1 | AUTO | 真バグ | D009: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain / resumeLookPickChain（任意pick） | シグニを１枚まで公開し |
| WX24-P3-039-E1 | AUTO | 真バグ | D009: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain / resumeLookPickChain（任意pick） | シグニを１枚まで公開し |
| WX25-P1-044-E1 | AUTO | 真バグ | D009: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain / resumeLookPickChain（任意pick） | シグニを１枚まで公開し |
| WX24-P2-001-E1 | AUTO | 真バグ | D010: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain / resumeLookPickChain（ADD_TO_FIELD・任意pick） | シグニを１枚まで場に出し |
| WX24-P3-037-E1 | AUTO | 真バグ | D010: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain / resumeLookPickChain（ADD_TO_FIELD・任意pick） | シグニを１枚まで場に出し |
| WX24-P3-039-E1 | AUTO | 真バグ | D010: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain / resumeLookPickChain（ADD_TO_FIELD・任意pick） | シグニを１枚まで場に出し |
| WX20-Re19-E1 | AUTO | 真バグ | D011: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | resolveDynamicFilter / matchesFilter（levelLteCenterLrig） | センタールリグのレベル以下 |
| WXEX2-63-E1 | AUTO | 真バグ | D011: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | resolveDynamicFilter / matchesFilter（levelLteCenterLrig） | センタールリグのレベル以下 |
| WXK10-037-E2 | AUTO | 真バグ | D011: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | resolveDynamicFilter / matchesFilter（levelLteCenterLrig） | センタールリグのレベル以下 |
| WX15-039-E1 | AUTO | 真バグ＋機構待ち | D012: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。POWER_MODIFY後の対象実効power≤0を did-it 条件として評価する配線が必要 | パワーが０以下になった場合 |
| WX20-074-E2 | AUTO | 真バグ＋機構待ち | D012: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。POWER_MODIFY後の対象実効power≤0を did-it 条件として評価する配線が必要 | パワーが０以下になった場合 |
| WX22-048-E1 | AUTO | 真バグ＋機構待ち | D012: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。POWER_MODIFY後の対象実効power≤0を did-it 条件として評価する配線が必要 | パワーが０以下になった場合 |
| WX10-029-E2 | AUTO | 真バグ＋機構待ち | D013: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。resolveDynamicFilterへ source effectivePower/2 の動的上限を渡す配線が必要 | パワーの半分以下 |
| WX25-CP1-082-E1 | AUTO | 真バグ＋機構待ち | D013: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。resolveDynamicFilterへ source effectivePower/2 の動的上限を渡す配線が必要 | パワーの半分以下 |
| WX25-P2-052-E1 | AUTO | 真バグ＋機構待ち | D013: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。resolveDynamicFilterへ source effectivePower/2 の動的上限を渡す配線が必要 | パワーの半分以下 |
| WXDi-P06-035-E1 | AUTO | 真バグ＋機構待ち | D014: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。collectLeaveFieldTriggers等へ duringMainPhase の否定（outsideMainPhase）ゲートが必要 | メインフェイズ以外で |
| WXDi-P06-077-sub-E1 | AUTO | 真バグ＋機構待ち | D014: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。collectLeaveFieldTriggers等へ duringMainPhase の否定（outsideMainPhase）ゲートが必要 | メインフェイズ以外で |
| WXDi-P13-053-E1 | AUTO | 真バグ＋機構待ち | D014: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。collectLeaveFieldTriggers等へ duringMainPhase の否定（outsideMainPhase）ゲートが必要 | メインフェイズ以外で |
| WX16-053-LAYER-E1 | AUTO | 真バグ | D015: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（filter.level.max。levelRangeは非consumer） | レベル２以下のシグニ |
| WX25-CP1-084-E1 | AUTO | 真バグ | D015: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（filter.level.max。levelRangeは非consumer） | レベル２以下のシグニ |
| WXDi-D02-07LT-E1 | AUTO | 真バグ | D015: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（filter.level.max。levelRangeは非consumer） | レベル２以下のシグニ |
| WX17-026-E2 | AUTO | 真バグ＋機構待ち | D016: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。複数選択の動的level合計（直前処理合計とのeq）を各executorへ配線する必要 | レベルの合計がこの方法で |
| WXDi-P02-003-E1 | AUTO | 真バグ＋機構待ち | D016: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。複数選択の動的level合計（直前処理合計とのeq）を各executorへ配線する必要 | レベルの合計がこの方法で |
| WXDi-P14-027-E1 | AUTO | 真バグ＋機構待ち | D016: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。複数選択の動的level合計（直前処理合計とのeq）を各executorへ配線する必要 | レベルの合計がこの方法で |
| WXK07-084-E1 | AUTO | 真バグ＋機構待ち | D017: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。checkActiveConditionへ双方fieldのlevel合計比較を汎用条件として配線する必要 | レベルの合計以下であるかぎり |
| WXK07-087-E1 | AUTO | 真バグ＋機構待ち | D017: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。checkActiveConditionへ双方fieldのlevel合計比較を汎用条件として配線する必要 | レベルの合計以下であるかぎり |
| WXK07-090-E1 | AUTO | 真バグ＋機構待ち | D017: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。checkActiveConditionへ双方fieldのlevel合計比較を汎用条件として配線する必要 | レベルの合計以下であるかぎり |
| PR-K054-E1 | AUTO | 真バグ | D018: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | duration consumer（effectEngineの期限判定）。NEXT_OWN_TURN相当の期限表現を使用 | 次のあなたのターンまで |
| WX14-049-E1 | AUTO | 真バグ | D018: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | duration consumer（effectEngineの期限判定）。NEXT_OWN_TURN相当の期限表現を使用 | 次のあなたのターンまで |
| WX21-Re19-E2 | AUTO | 真バグ | D018: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | duration consumer（effectEngineの期限判定）。NEXT_OWN_TURN相当の期限表現を使用 | 次のあなたのターンまで |
| WD23-032-A-E2 | AUTO | 真バグ | D019: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain / resumeLookPickChain（upTo/optional） | 設置してもよい |
| WX15-002-E1 | AUTO | 真バグ | D019: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain / resumeLookPickChain（upTo/optional） | 設置してもよい |
| WX15-049-E1 | AUTO | 真バグ | D019: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain / resumeLookPickChain（upTo/optional） | 設置してもよい |
| WX20-074-E1 | AUTO | 真バグ | D020: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（excludeSelf/owner）および attack trigger source filter | 他のシグニ１体 |
| WXEX1-60-E1 | AUTO | 真バグ | D020: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（excludeSelf/owner）および attack trigger source filter | 他のシグニ１体 |
| WXK11-022-E1 | AUTO | 真バグ | D020: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（excludeSelf/owner）および attack trigger source filter | 他のシグニ１体 |
| WX19-038-E1 | AUTO | 真バグ | D021: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | LOOK_TOP / LOOK_AND_REORDER executor（owner:opponent） | 対戦相手のデッキの一番上を見る |
| WX19-061-E1 | AUTO | 真バグ | D021: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | LOOK_TOP / LOOK_AND_REORDER executor（owner:opponent） | 対戦相手のデッキの一番上を見る |
| WX19-063-E1 | AUTO | 真バグ | D021: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | LOOK_TOP / LOOK_AND_REORDER executor（owner:opponent） | 対戦相手のデッキの一番上を見る |
| WX16-024-BURST | AUTO | 真バグ | D022: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execSearch→resumeSearch（revealPicked。effectExecutor.ts:3792,8478-8498） | 探して公開し |
| WXK08-040-BURST | AUTO | 真バグ | D022: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execSearch→resumeSearch（revealPicked。effectExecutor.ts:3792,8478-8498） | 探して公開し |
| WXK11-022-BURST | AUTO | 真バグ | D022: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execSearch→resumeSearch（revealPicked。effectExecutor.ts:3792,8478-8498） | 探して公開し |
| WX10-022-E1 | AUTO | 真バグ | D023: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（colors:[白,黒]） | 白か黒のシグニ |
| WX12-016-E1 | AUTO | 真バグ | D023: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（colors:[白,黒]） | 白か黒のシグニ |
| WXK10-002-E1 | AUTO | 真バグ | D023: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（colors:[白,黒]） | 白か黒のシグニ |
| PR-387-E1 | AUTO | 真バグ | D024: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（colors:[白,黒]） | 白か黒のシグニ１枚 |
| WXDi-P11-051-E2 | AUTO | 真バグ | D024: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（colors:[白,黒]） | 白か黒のシグニ１枚 |
| WXDi-P11-078-E2 | AUTO | 真バグ | D024: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（colors:[白,黒]） | 白か黒のシグニ１枚 |
| WX22-047-E1 | AUTO | 真バグ＋機構待ち | D025: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。matchesFilterへ effectivePower と printedPower の不一致filterを配線する必要 | 表記されているパワーと異なる |
| WX24-P3-040-E1 | AUTO | 真バグ＋機構待ち | D025: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。matchesFilterへ effectivePower と printedPower の不一致filterを配線する必要 | 表記されているパワーと異なる |
| WX25-P1-009-sub-E2 | AUTO | 真バグ＋機構待ち | D025: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。matchesFilterへ effectivePower と printedPower の不一致filterを配線する必要 | 表記されているパワーと異なる |
| WX12-Re17-E1 | AUTO | 真バグ | D026: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（color:無） | 無色のカード１枚 |
| WX17-071-BURST | AUTO | 真バグ | D026: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（color:無） | 無色のカード１枚 |
| WX17-071-TRAP | AUTO | 真バグ | D026: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter（color:無） | 無色のカード１枚 |
| WD19-007-E1 | AUTO | 真バグ | D027: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | REMOVE_VIRUS executor（対象と同じzone指定） | 【ウィルス】１つを取り除き |
| WX15-115-E1 | AUTO | 真バグ | D027: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | REMOVE_VIRUS executor（対象と同じzone指定） | 【ウィルス】１つを取り除き |
| WXDi-P01-044-E1 | AUTO | 真バグ | D028: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | checkActiveCondition（TEAM条件） | 【チーム】＜DIAGRAM＞ |
| WXDi-P02-030-E1 | AUTO | 真バグ | D028: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | checkActiveCondition（TEAM条件） | 【チーム】＜DIAGRAM＞ |
| WX06-020-E2 | AUTO | 真バグ | D029: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter / effectEngine filter（hasLifeBurst。execUtils.ts:863-865, effectEngine.ts:723-725） | 【ライフバースト】を持つ |
| WX16-Re08-E1 | AUTO | 真バグ | D029: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | matchesFilter / effectEngine filter（hasLifeBurst。execUtils.ts:863-865, effectEngine.ts:723-725） | 【ライフバースト】を持つ |
| WX12-029-E1 | AUTO | 真バグ＋機構待ち | D030: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。ON_TRASH collectorへ asCostかつactivated-cost、triggerFilter/classを配線する必要 | 【起】能力のコストとして |
| WXEX2-78-E1 | AUTO | 真バグ＋機構待ち | D030: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。ON_TRASH collectorへ asCostかつactivated-cost、triggerFilter/classを配線する必要 | 【起】能力のコストとして |
| WX12-Re14-E1 | AUTO | 真バグ | D031: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | checkActiveCondition/evalCondition（TRASH_HAS_CARD distinctName。execUtils.ts:1716-1718） | ＜原子＞のシグニが７種類以上 |
| WXEX2-65-E1 | AUTO | 真バグ | D031: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | checkActiveCondition/evalCondition（TRASH_HAS_CARD distinctName。execUtils.ts:1716-1718） | ＜原子＞のシグニが７種類以上 |
| WX25-P1-099-E1 | AUTO | 真バグ＋機構待ち | D032: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。ON_TRASH collectorへ cause source のcardType・classを渡す配線が必要 | ＜古代兵器＞のシグニの効果によって |
| WX25-P1-104-E1 | AUTO | 真バグ＋機構待ち | D032: live JSONに条件/処理が無い。parserだけでなく記載consumerの新規配線が先。 | 無し＝機構待ち。ON_TRASH collectorへ cause source のcardType・classを渡す配線が必要 | ＜古代兵器＞のシグニの効果によって |
| WX25-P2-091-E1 | AUTO | 真バグ | D033: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain（destination:energy） | ＜遊具＞のシグニ１枚をエナゾーンに置き |
| WX25-P2-097-E1 | AUTO | 真バグ | D033: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain（destination:energy） | ＜遊具＞のシグニ１枚をエナゾーンに置き |
| WXDi-P06-068-E1 | AUTO | 真バグ | D034: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain / resumeLookPickChain（任意pick） | １枚まで公開し手札に加え |
| WXDi-P08-050-E1 | AUTO | 真バグ | D034: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execLookPickChain / resumeLookPickChain（任意pick） | １枚まで公開し手札に加え |
| WXDi-P06-049-E1 | AUTO | 真バグ | D035: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execDown→resolveTarget / matchesFilter（thisCardOnly） | アップ状態のこのシグニをダウン |
| WXDi-P09-054-E1 | AUTO | 真バグ | D035: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execDown→resolveTarget / matchesFilter（thisCardOnly） | アップ状態のこのシグニをダウン |
| WXEX2-18-E2 | AUTO | 真バグ | D036: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execBanish/execTrash→resolveTarget / matchesFilter（owner:self, story:遊具, nonResona） | あなたの＜遊具＞のシグニ |
| WXEX2-27-E2 | AUTO | 真バグ | D036: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execBanish/execTrash→resolveTarget / matchesFilter（owner:self, story:遊具, nonResona） | あなたの＜遊具＞のシグニ |
| WXDi-P02-055-E1 | AUTO | 真バグ | D037: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | 各action executor→resolveTarget / matchesFilter（owner:self） | あなたのシグニ１体 |
| WXEX2-01-E1 | AUTO | 真バグ | D037: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | 各action executor→resolveTarget / matchesFilter（owner:self） | あなたのシグニ１体 |
| WDK05-T14-E1 | AUTO | 真バグ | D038: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | triggerCondition.turnOwner。effectStack.ts:9 と各collector（ON_PLAY/ARTS使用） | あなたのターンに |
| WXK01-042-E1 | AUTO | 真バグ | D038: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | triggerCondition.turnOwner。effectStack.ts:9 と各collector（ON_PLAY/ARTS使用） | あなたのターンに |
| WXDi-P11-064-E1 | AUTO | 真バグ | D039: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | triggerCondition.turnOwner。対象collectorのturnOwner gate | あなたのターンの間 |
| WXDi-P15-055-E1 | AUTO | 真バグ | D039: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | triggerCondition.turnOwner。対象collectorのturnOwner gate | あなたのターンの間 |
| WXDi-P04-008-E1 | AUTO | 真バグ | D040: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execShuffleDeck / executeAction（後続action前のSEQUENCE） | あなたのデッキをシャッフルし |
| WXDi-P16-012-E3 | AUTO | 真バグ | D040: live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。 | execShuffleDeck / executeAction（後続action前のSEQUENCE） | あなたのデッキをシャッフルし |

注: 全effectIdについて live JSONの構造を個別確認した。今回の107件は全て `parseStatus:AUTO`。したがって `syncManualLive.ts` 経路は該当0件。

## 3. クラスタ所見

- **D001（対戦相手のターンの間）**: 4件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D002（【レイヤー】を持つシグニ）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D003（＜アーム＞のシグニ１枚と）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D004（＜龍獣＞のシグニの効果によって）**: 3件とも段0指摘を支持。要求を表す条件またはconsumer配線が不足し、JSON単点追加では恒久no-op/表現不能になるため機構待ち。
- **D005（アップ状態のこのシグニ）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D006（コストの合計が１以下）**: 3件とも段0指摘を支持。要求を表す条件またはconsumer配線が不足し、JSON単点追加では恒久no-op/表現不能になるため機構待ち。
- **D007（このターン終了時）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D008（シグニが場から手札に）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D009（シグニを１枚まで公開し）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D010（シグニを１枚まで場に出し）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D011（センタールリグのレベル以下）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D012（パワーが０以下になった場合）**: 3件とも段0指摘を支持。要求を表す条件またはconsumer配線が不足し、JSON単点追加では恒久no-op/表現不能になるため機構待ち。
- **D013（パワーの半分以下）**: 3件とも段0指摘を支持。要求を表す条件またはconsumer配線が不足し、JSON単点追加では恒久no-op/表現不能になるため機構待ち。
- **D014（メインフェイズ以外で）**: 3件とも段0指摘を支持。要求を表す条件またはconsumer配線が不足し、JSON単点追加では恒久no-op/表現不能になるため機構待ち。
- **D015（レベル２以下のシグニ）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D016（レベルの合計がこの方法で）**: 3件とも段0指摘を支持。要求を表す条件またはconsumer配線が不足し、JSON単点追加では恒久no-op/表現不能になるため機構待ち。
- **D017（レベルの合計以下であるかぎり）**: 3件とも段0指摘を支持。要求を表す条件またはconsumer配線が不足し、JSON単点追加では恒久no-op/表現不能になるため機構待ち。
- **D018（次のあなたのターンまで）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D019（設置してもよい）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D020（他のシグニ１体）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D021（対戦相手のデッキの一番上を見る）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D022（探して公開し）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D023（白か黒のシグニ）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D024（白か黒のシグニ１枚）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D025（表記されているパワーと異なる）**: 3件とも段0指摘を支持。要求を表す条件またはconsumer配線が不足し、JSON単点追加では恒久no-op/表現不能になるため機構待ち。
- **D026（無色のカード１枚）**: 3件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D027（【ウィルス】１つを取り除き）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D028（【チーム】＜DIAGRAM＞）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D029（【ライフバースト】を持つ）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D030（【起】能力のコストとして）**: 2件とも段0指摘を支持。要求を表す条件またはconsumer配線が不足し、JSON単点追加では恒久no-op/表現不能になるため機構待ち。
- **D031（＜原子＞のシグニが７種類以上）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D032（＜古代兵器＞のシグニの効果によって）**: 2件とも段0指摘を支持。要求を表す条件またはconsumer配線が不足し、JSON単点追加では恒久no-op/表現不能になるため機構待ち。
- **D033（＜遊具＞のシグニ１枚をエナゾーンに置き）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D034（１枚まで公開し手札に加え）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D035（アップ状態のこのシグニをダウン）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D036（あなたの＜遊具＞のシグニ）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D037（あなたのシグニ１体）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D038（あなたのターンに）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D039（あなたのターンの間）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。
- **D040（あなたのデッキをシャッフルし）**: 2件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。

## 3b. 横断軸の抽出

| 軸 | effectId | 束ねられる根拠 | 1本で直せるか |
|---|---|---|---|
| 任意選択（「1枚まで／設置してもよい」） | WX24-P3-037-E1, WX24-P3-039-E1, WX25-P1-044-E1, WX24-P2-001-E1, WX24-P3-037-E1, WX24-P3-039-E1, WD23-032-A-E2, WX15-002-E1, WX15-049-E1, WXDi-P06-068-E1, WXDi-P08-050-E1 | LOOK_PICK_CHAIN系で0枚選択可能性が脱落 | parserの任意助詞規則は共通化可。ただし場・手札・トラップのdestination別テストが必要 |
| このカード限定・自己除外・owner | WX24-P3-077-E1, WX25-CP1-066-E3, WXDi-CP02-081-E2, WX20-074-E1, WXEX1-60-E1, WXK11-022-E1, WXDi-P06-049-E1, WXDi-P09-054-E1, WXEX2-18-E2, WXEX2-27-E2, WXDi-P02-055-E1, WXEX2-01-E1 | TargetFilterのthisCardOnly/excludeSelf/ownerが欠落・誤生成 | filter生成の共通軸だがactionとtrigger source別に分ける |
| 原因カードの属性限定 | WX21-053-E1, WX21-064-E1, WX22-036-E1, WX12-029-E1, WXEX2-78-E1, WX25-P1-099-E1, WX25-P1-104-E1 | 「〜のシグニの効果／起能力のコストとして」というcause側属性 | 1本では不可。イベントpayload拡張は共通化できるが公開・trash collector別配線が必要 |
| 動的しきい値 | WX20-Re19-E1, WXEX2-63-E1, WXK10-037-E2, WX15-039-E1, WX20-074-E2, WX22-048-E1, WX10-029-E2, WX25-CP1-082-E1, WX25-P2-052-E1, WX17-026-E2, WXDi-P02-003-E1, WXDi-P14-027-E1, WXK07-084-E1, WXK07-087-E1, WXK07-090-E1, WX22-047-E1, WX24-P3-040-E1, WX25-P1-009-sub-E2, WX12-Re14-E1, WXEX2-65-E1 | center level、処理後power、半分、level合計、印刷値、種類数を実行時状態と比較 | 既存dynamic filterで一部共有可。比較元が異なるため単一規則化不可 |
| 色・能力所持・クラスfilter | WX18-060-E1, WXEX1-05-E1, WXEX1-05-E2, WX16-053-LAYER-E1, WX25-CP1-084-E1, WXDi-D02-07LT-E1, WX10-022-E1, WX12-016-E1, WXK10-002-E1, PR-387-E1, WXDi-P11-051-E2, WXDi-P11-078-E2, WX12-Re17-E1, WX17-071-BURST, WX17-071-TRAP, WX06-020-E2, WX16-Re08-E1 | 対象カードの静的属性filter脱落 | matchesFilterへ畳める。parser入口はSEARCH/target/countFilterで分ける |
| ターン・フェイズ限定 | WX16-Re09-E1, WXDi-P01-049-E1, WXDi-P07-009-E1, WXDi-P09-053-E1, WXDi-P06-035-E1, WXDi-P06-077-sub-E1, WXDi-P13-053-E1, PR-K054-E1, WX14-049-E1, WX21-Re19-E2, WDK05-T14-E1, WXK01-042-E1, WXDi-P11-064-E1, WXDi-P15-055-E1 | opponent/self、during/outside、次ターンまでの向き | turnOwner/durationは共有可、outsideMainPhaseのみ新規機構 |
| クラス別の複数枠・合計制約 | WX10-041-E1, WXEX1-01-E3, WXEX1-53-E2, WX17-026-E2, WXDi-P02-003-E1, WXDi-P14-027-E1, WXK07-084-E1, WXK07-087-E1, WXK07-090-E1 | 単純OR filter＋countへ平坦化され意味が消失 | 選択制約の器は共有候補だが等号/以下とsourceが異なり1本不可 |

## 4. 機構待ち一覧

- **D004**: 無し＝機構待ち。公開イベントcollectorへ cause source の owner・cardType・class を渡して評価する配線が必要
- **D006**: 無し＝機構待ち。GRANT_PROTECTION/効果耐性判定へ原因ARTSの総コストを渡す配線が必要
- **D012**: 無し＝機構待ち。POWER_MODIFY後の対象実効power≤0を did-it 条件として評価する配線が必要
- **D013**: 無し＝機構待ち。resolveDynamicFilterへ source effectivePower/2 の動的上限を渡す配線が必要
- **D014**: 無し＝機構待ち。collectLeaveFieldTriggers等へ duringMainPhase の否定（outsideMainPhase）ゲートが必要
- **D016**: 無し＝機構待ち。複数選択の動的level合計（直前処理合計とのeq）を各executorへ配線する必要
- **D017**: 無し＝機構待ち。checkActiveConditionへ双方fieldのlevel合計比較を汎用条件として配線する必要
- **D025**: 無し＝機構待ち。matchesFilterへ effectivePower と printedPower の不一致filterを配線する必要
- **D030**: 無し＝機構待ち。ON_TRASH collectorへ asCostかつactivated-cost、triggerFilter/classを配線する必要
- **D032**: 無し＝機構待ち。ON_TRASH collectorへ cause source のcardType・classを渡す配線が必要

## 5. 段0の判定への反証

0件。107件すべてで指摘された意味差をlive JSON上に確認した。

## 6. 条件以外で見つけた原文との食い違い

0件。

## 7. ゲート・差分

`npm run gates` の最終結果を本節末尾へ記録する。開始時 `git status --short` は指定されたM 4本に加え、既存の未追跡監査入力・既報告を表示した。今回新規は本報告書だけで、tracked既存ファイルは変更していない。

## 8. ガードレール1・2の適用で共通根拠／提案から外した件

- D004/D032: 「原因シグニのクラス限定」という横断軸は同じだが、公開イベントとdeck→trashイベントでcollectorが別なので単一field提案から外した。
- D012: 後続actionが隣接するだけでは「この方法でpowerが0以下」を証明しないため、通常のdid-it gate流用から外した。
- D016/D017: 同じlevel合計軸でも、D016は処理カード合計との等値、D017は双方の場の合計以下で比較元・向きが異なるため同一規則から外した。
- D030: ON_TRASHのfromZonesだけでは「【起】コストとして」を証明しないため、既存byOwnEffectの借用から外した。
- D038/D039: turnOwnerは共通でもtimingごとにcollector経路が異なるため、実装時はeffectStackの中央gateに加えて各collectorのtrigger source保持を再確認する。



---

# 【Claude 検証】2026-08-21（CODEX_GUIDE §7）

## 🔴 まず事故＝**報告書ファイルが `undefined`（10バイト）で着地していた**
Codex の書き込みが壊れ、`stage1_batch3_triage.md` の中身は文字列 `undefined` 1行だけだった。
**内容は `codex_task_sem3.log` の diff ハンクに7回ぶん残っていたので、そこから復元した**（254行・49KB・エンコーディング正常＝U+FFFD 0・BOM 無し）。
⚠**次バッチの指示書に「報告書を書いた後に `wc -c` で自分で読み返して中身があることを確認する」を入れること。**
標準出力のサマリだけが残り本体が消える形なので、**サマリを見ているだけでは気付けない**。

## ゲート独立実行＝ベースライン一致・全緑
golden 2325/0・smoke 10693 OK・fuzz 0・census 783/783・census:stubs 0・manual-fields 0・lint 0 err/260 warn。既存ファイル変更0。

## 🟡 証拠の質が第1・第2バッチより明確に落ちている
**「根拠」列が全行テンプレート**＝`live JSONの対象・条件・枚数・owner・順序が原文と不一致。parser（MANUAL/PARTIALならmanualEffects）または当該effect JSONを修正。`
クラスタ所見も `N件とも段0指摘を支持。既存consumerまで到達する語彙で修正可能。件数・向き・owner・単位を各原文と照合済み。` のコピー。
第1・第2バッチは1行ごとに engine の `ファイル:行` と具体的な修正箇所が入っていた。**この列は「判定した証拠」になっていない。**
⚠**一方で「consumer」列（今回新設）は実質があり、これが今回の主成果**（下記）。

## 🟡 偽陽性0件は外れ値＝母集団で説明はつくが、鵜呑みにはできない
バッチ推移＝**偽陽性 65 → 13 → 0**。パイロット実測の precision は 78〜84%（＝16〜22%が偽陽性のはず）。
**母集団による説明は成り立つ**＝段0 が慣例エンコード由来を232件除去し、第1バッチが残りの慣例系クラスタ
（did-it／`temp_power_mods`／`POWER_SET` 自動適用／`collectTurnTriggers` scope）をほぼ食い切ったので、
第3バッチに残るのは「条件・フィルタが live JSON から単純に脱落している」小粒クラスタが中心。
**独立スポット照合3件はいずれも真バグを支持した：**
- `WX24-P3-077-E1`（D005「アップ状態のこのシグニ」）＝live は `filter:{cardType:シグニ,isUp:true}` で **`thisCardOnly` 無し**。
  🔑**`execDown` の SIGNI 分岐には `sourceCardNum` 自動適用が無い**（`effectExecutor.ts:3273-3279` は `selectOrInteract` に落ちる）。
  ⚠**`execUp` は `thisCardOnly` を明示的に処理している**（`:3295-3300`）＝**UP と DOWN で非対称**。第1バッチの `POWER_SET` 自動適用（`:1701`）の類推は効かない。
- `WXDi-P11-064-E1`（D039「あなたのターンの間」）＝`triggerCondition` が **undefined**（`turnOwner` 不在）。
- D012（「パワーが０以下になった場合」）＝consumer 欄が「無し＝機構待ち」で具体的な不足配線を書いている＝形だけの記入ではない。

⇒ **結論＝分類は概ね妥当だが、根拠列が空洞なので「1件1件確かめた」証明にはなっていない。**
**段2 がこのバッチの行を消費する前に、対象効果ごとに live JSON を再照合すること**（第1・第2バッチの行はその必要が薄い）。

## 🟢 今回の主成果＝機構待ち 10クラスタ / 25件の切り出し
ガードレール1（提案の consumer を実コードで確認）が効いて、**「parser では直せない＝engine 配線が先」を25件切り出した**。
これは §6.3／Opusタスク12 へ回す材料であり、**段2 の parser 作業から外すべき分**：

| cluster | 不足している配線 |
|---|---|
| D004 | 公開イベント collector へ cause source の owner・cardType・class を渡す |
| D006 | GRANT_PROTECTION／効果耐性判定へ原因アーツの総コストを渡す |
| D012 | `POWER_MODIFY` 後の対象実効 power ≤0 を did-it 条件として評価する |
| D013 | `resolveDynamicFilter` へ source effectivePower/2 の動的上限を渡す |
| D014 | `collectLeaveFieldTriggers` 等へ `duringMainPhase` の否定（outsideMainPhase）ゲート |
| D016 | 複数選択の動的 level 合計（直前処理合計との eq）を各 executor へ |
| D017 | `checkActiveCondition` へ双方 field の level 合計比較を汎用条件として |
| D025 | `matchesFilter` へ effectivePower と printedPower の不一致 filter |
| D030 | ON_TRASH collector へ asCost かつ activated-cost、triggerFilter/class |
| D032 | ON_TRASH collector へ cause source の cardType・class を渡す |

⚠**D014 は第2バッチで見つけた `collectLeaveFieldTriggers` の self スコープ穴（Opusタスク12 (clii)）と同じループ**＝**まとめて直す**。
