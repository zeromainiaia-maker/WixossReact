#!/usr/bin/env python3
"""Update effectExecutor.ts and effectParser.ts after splitting."""
import re

# ── effectExecutor.ts ────────────────────────────────────────────────────────
with open('src/engine/effectExecutor.ts', encoding='utf-8') as f:
    exec_lines = f.readlines()

NEW_EXEC_HEADER = """\
import type { PlayerState, CardData, PendingInteractionDef, TargetScope } from '../types';
import { parseCardEffects } from '../data/effectParser';
import type {
  CardEffect,
  EffectAction,
  TargetFilter,
  Owner,
  NumberOrRef,
  Condition,
  DrawAction,
  BanishAction,
  BounceAction,
  PowerModifyAction,
  PowerSetAction,
  TrashAction,
  EnergyChargeAction,
  EnergyChargeFromDeckAction,
  LifeCrashAction,
  ShuffleDeckAction,
  TransferToHandAction,
  AddToFieldAction,
  AddToLifeAction,
  FreezeAction,
  DownAction,
  UpAction,
  BlockActionAction,
  StoryChangeAction,
  GrantKeywordAction,
  SearchAction,
  SequenceAction,
  ChooseAction,
  ConditionalAction,
  LookAndReorderAction,
  TransferToDeckAction,
  GrantProtectionAction,
  AttachCharmAction,
  RevealAndPickAction,
  PlayFreeAction,
  CostIncreaseAction,
  PowerModifyPerFieldAction,
  PowerModifyPerLrigLevelAction,
  CharmProtectionAction,
  MutualDiscardAndDrawAction,
  RemoveAbilitiesAction,
  GainCoinAction,
  DiscardBothAction,
  RemoveCharmAction,
  ForceSigniAttackAction,
  PowerModifyPerTrashCountAction,
  PowerModifyPerLifeCountAction,
  PlaceVirusAction,
  AttachAcceAction,
  BloodCrystalArmorAction,
  GrantLrigAbilityAction,
  StubAction,
} from '../types/effects';
import type { ExecCtx, ExecResult } from './execUtils';
import {
  done, addLog, needsInteraction, ownerState, setOwnerState, shuffle, resolveNum,
  matchesFilter, getCardNum, removeFromField, fieldCandidates, handCandidates,
  trashCandidates, energyCandidates, evalCondition, selectOrInteract, canPayOptionalCost,
} from './execUtils';
export type { ExecCtx, ExecResult };
export { matchesFilter, getCardNum, removeFromField };
import { execStub } from './execStub';

"""

# exec* functions: lines 448-1978 (0-indexed 447-1977)
exec_fns = exec_lines[447:1978]

# executeAction: lines 1979-2073 (0-indexed 1978-2072), STUB case replaced
exec_switch_start = exec_lines[1978:2073]

STUB_REPLACEMENT = "    case 'STUB': return execStub(action as StubAction, ctx, executeAction);\n"

# After STUB case: lines 8915-end (0-indexed 8914-end)
# Line 8915: "    case 'UNKNOWN':..."
exec_switch_end = exec_lines[8914:]

new_exec = NEW_EXEC_HEADER
new_exec += ''.join(exec_fns)
new_exec += ''.join(exec_switch_start)
new_exec += STUB_REPLACEMENT
new_exec += ''.join(exec_switch_end)

with open('src/engine/effectExecutor.ts', 'w', encoding='utf-8') as f:
    f.write(new_exec)
print(f"  effectExecutor.ts: {len(new_exec.splitlines())} lines")

# ── effectParser.ts ──────────────────────────────────────────────────────────
with open('src/data/effectParser.ts', encoding='utf-8') as f:
    parser_lines = f.readlines()

# New header: original imports + new imports from parserUtils + sentenceParts
NEW_PARSER_HEADER = """\
import type { CardData } from '../types';
import { mergeManualEffects } from './manualEffects';
import type {
  CardEffect,
  EffectType,
  EffectTiming,
  EffectCost,
  EnergyCost,
  EffectAction,
  EffectTarget,
  EffectDuration,
  ActiveCondition,
  TargetFilter,
  Owner,
  CompareOp,
  SequenceAction,
  ChooseAction,
  UnknownAction,
  TransferToDeckAction,
  CounterSpellAction,
  CostReductionAction,
  GrantProtectionAction,
  GrantKeywordAction,
  AttachCharmAction,
  RevealAndPickAction,
  BanishRedirectAction,
  RearrangeSigniAction,
  GrowFreeAction,
  RemoveAbilitiesAction,
  PlayFreeAction,
  CostIncreaseAction,
  PowerModifyPerStackAction,
  PowerModifyPerFieldAction,
  PowerModifyPerLevelSumAction,
  CharmProtectionAction,
  MutualDiscardAndDrawAction,
  BlockActionAction,
  EnergyChargeAction,
  PowerModifyByTargetLevelAction,
  PowerMultiplyAction,
  LevelModifyAction,
  PowerModifyPerCharmAction,
  PowerModifyPerEnergyAction,
  PreventDamageAction,
  EqualizeEnergyAction,
  VariableDiscardAndDrawAction,
  BanishSubstituteAction,
  StackSpellAction,
  ColorInheritAction,
  ConditionalDiscardAction,
  EnergyChargeByFieldCountAction,
  LookAtDeckAndLifeAction,
  GrowCostReductionAction,
  NameBanAction,
  PlayFreeFromTrashAction,
  PowerThresholdTrashAction,
  PowerFlipAction,
  SelfTrashPreventAction,
  CostSubstituteAction,
  PowerModifyPerTrashedLevelAction,
  RemoveCharmAction,
  ForceSigniAttackAction,
  GrantLrigAbilityAction,
  PowerModifyPerTrashCountAction,
  PowerModifyPerLifeCountAction,
  PowerModifyPerLrigLevelAction,
  PlaceVirusAction,
  AttachAcceAction,
  BloodCrystalArmorAction,
  PowerModifyPerVirusCountAction,
  LrigLimitModifyAction,
  FreezeAction,
  LookAndReorderAction,
  AddCraftToLrigDeckAction,
  DrawPerFieldCountAction,
  AwakenSigniAction,
  NegateAttackAction,
  PlaceUnderSigniAction,
  PreventNextDamageAction,
  TakeFromUnderSigniAction,
  StubAction,
  PowerModifyAction,
  BanishAction,
  BounceAction,
  DownAction,
  Condition,
} from '../types/effects';
import {
  parseNum, parseSignedNum, parseSigniTarget,
  parsePowerFilter, parseLevelFilter, parseColorFilter,
  parseCardTypeFilter, parseStoryFilter, makeRevealPickStub, extractCostColors,
} from './parserUtils';
import { parseSentencePart1 } from './parsers/parseSentencePart1';
import { parseSentencePart2 } from './parsers/parseSentencePart2';
import { parseSentencePart3 } from './parsers/parseSentencePart3';
import { parseSentencePart4 } from './parsers/parseSentencePart4';

"""

# Keep utility functions that are NOT in parserUtils.ts:
# extractCostColors (88-104): now in parserUtils, REMOVE
# makeRevealPickStub (106-126): now in parserUtils, REMOVE
# FW_DIGIT, toHalf, stripRuleParens (128-146): now in parserUtils, REMOVE
# parseUseCondition, extractUseCondition (148-287): KEEP
# parseNum, parseSignedNum (288-297): now in parserUtils, REMOVE
# parseEnergyCosts, parseCost (299-340): KEEP
# parseArtsTiming (342-350): KEEP
# parsePowerFilter etc (352-415): now in parserUtils, REMOVE
# parseActiveCondition (417-634): KEEP
# parseSingleSentence (636-8238): REPLACE with slim version
# splitSentences onward (8239-end): KEEP

# Lines to keep from parser:
# 147-287: parseUseCondition, extractUseCondition
# 299-340: parseEnergyCosts, parseCost
# 342-350: parseArtsTiming
# 417-635: parseActiveCondition
# 8239-end: splitSentences and beyond

# parseSingleSentence replacement
PARSE_SINGLE = """\
function parseSingleSentence(text: string): EffectAction {
  // タイミング・期間プレフィックスを除去（既にparseBlockで処理済み）
  const t = text.trim().replace(/。$/, '')
    .replace(/^ターン終了時まで、/, '')
    .replace(/^あなたのターン終了時、/, '')
    .replace(/^あなたのターン開始時、/, '')
    .replace(/^ターン終了時、/, '')
    .replace(/^このシグニがアタックしたとき、/, '')
    .replace(/^このシグニがバニッシュされたとき、/, '')
    .replace(/^バニッシュされたとき、/, '')
    .replace(/^パワー[０-９\\d]+以下のこのシグニがバニッシュされたとき、/, '')
    .replace(/^[^、。「」]{2,60}バニッシュされたとき、/, '')
    .replace(/^[^、。「」]{2,60}トラッシュに置かれたとき、/, '')
    .replace(/^[^、。「」]{2,60}場を離れ?たとき、/, '')
    .replace(/^このカードがエクシードのコストとしてルリグトラッシュに置かれたとき、/, '')
    .replace(/^対戦相手がアーツを使用したとき、/, '')
    .replace(/^あなたの[^、「」]{2,30}が場に出たとき、/, '')
    .replace(/^[^、。「」]{2,60}ライズされたとき、/, '')
    .replace(/^[^、。「」]{2,60}アタックしたとき、/, '');

  return (
    parseSentencePart1(t) ??
    parseSentencePart2(t) ??
    parseSentencePart3(t) ??
    parseSentencePart4(t) ??
    { type: 'UNKNOWN', raw: t } as UnknownAction
  );
}

"""

keep_sections = (
    parser_lines[147:288]   # parseUseCondition, extractUseCondition
    + parser_lines[299:341]  # parseEnergyCosts, parseCost
    + parser_lines[342:351]  # parseArtsTiming
    + parser_lines[417:636]  # parseActiveCondition
)

after_parseSingle = parser_lines[8239:]  # splitSentences onward

new_parser = NEW_PARSER_HEADER
new_parser += ''.join(keep_sections)
new_parser += '\n'
new_parser += PARSE_SINGLE
new_parser += ''.join(after_parseSingle)

with open('src/data/effectParser.ts', 'w', encoding='utf-8') as f:
    f.write(new_parser)
print(f"  effectParser.ts: {len(new_parser.splitlines())} lines")

print("Update complete! Run: npx tsc --noEmit to check for errors")
