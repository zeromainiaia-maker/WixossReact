#!/usr/bin/env python3
import re, os

with open('src/engine/effectExecutor.ts', encoding='utf-8') as f:
    exec_lines = f.readlines()
with open('src/data/effectParser.ts', encoding='utf-8') as f:
    parser_lines = f.readlines()

def find_types(text, types):
    return [t for t in types if re.search(r'\b' + re.escape(t) + r'\b', text)]

# ── 1. execUtils.ts ──────────────────────────────────────────────────────────
UTILS_HEADER = (
    "import type { PlayerState, CardData, PendingInteractionDef, TargetScope } from '../types';\n"
    "import { hasShadow } from '../utils/keywords';\n"
    "import { checkBeatCondition } from './effectEngine';\n"
    "import type {\n"
    "  EffectAction,\n"
    "  TargetFilter,\n"
    "  Owner,\n"
    "  NumberOrRef,\n"
    "  Condition,\n"
    "} from '../types/effects';\n\n"
)
body = exec_lines[58:447]
text = UTILS_HEADER + ''.join(body)
fns = ['shuffle','resolveNum','ownerState','setOwnerState','addLog','canPayOptionalCost',
       'done','needsInteraction','fieldCandidates','handCandidates','trashCandidates',
       'energyCandidates','evalCondition','selectOrInteract']
for fn in fns:
    text = re.sub(r'^function ' + fn + r'\b', 'export function ' + fn, text, flags=re.MULTILINE)

with open('src/engine/execUtils.ts', 'w', encoding='utf-8') as f:
    f.write(text)
print(f"  execUtils.ts: {len(text.splitlines())} lines")

# ── 2. execStub.ts ──────────────────────────────────────────────────────────
stub_body = exec_lines[2074:8913]
for i, ln in enumerate(stub_body):
    if 'const stub = action as' in ln:
        stub_body.pop(i)
        break

stub_text = ''.join(stub_body)
stub_text = re.sub(r"import\('\.\./types/effects'\)\.", '', stub_text)
stub_text = re.sub(r"import\('\.\./types'\)\.", '', stub_text)
stub_text = re.sub(r'\bexecuteAction\(', 'exec(', stub_text)

# Dedent 4 spaces (was inside switch 'case STUB:')
lines_d = []
for ln in stub_text.split('\n'):
    if ln.startswith('    '):
        lines_d.append(ln[4:])
    else:
        lines_d.append(ln)
stub_text = '\n'.join(lines_d)

ALL_EFFECTS = [
    'EffectAction','StubAction','TargetFilter','Owner','DrawAction','BanishAction','BounceAction',
    'PowerModifyAction','PowerSetAction','TrashAction','EnergyChargeAction','EnergyChargeFromDeckAction',
    'LifeCrashAction','ShuffleDeckAction','TransferToHandAction','AddToFieldAction','AddToLifeAction',
    'FreezeAction','DownAction','UpAction','BlockActionAction','StoryChangeAction','GrantKeywordAction',
    'SearchAction','SequenceAction','ChooseAction','ConditionalAction','LookAndReorderAction',
    'TransferToDeckAction','GrantProtectionAction','AttachCharmAction','RevealAndPickAction',
    'PlayFreeAction','CostIncreaseAction','PowerModifyPerFieldAction','PowerModifyPerLrigLevelAction',
    'CharmProtectionAction','MutualDiscardAndDrawAction','RemoveAbilitiesAction','GainCoinAction',
    'DiscardBothAction','RemoveCharmAction','ForceSigniAttackAction','PowerModifyPerTrashCountAction',
    'PowerModifyPerLifeCountAction','PlaceVirusAction','AttachAcceAction','BloodCrystalArmorAction',
    'GrantLrigAbilityAction','AddToEnergyAction','AddToHandAction','PlaceUnderSourceSigniAction',
    'BlockCardUseAction','PreventNextDamageAction','LrigLimitModifyAction','AddCraftToLrigDeckAction',
    'DrawPerFieldCountAction','NegateAttackAction','PlaceUnderSigniAction','TakeFromUnderSigniAction',
    'AwakenSigniAction','NumberOrRef','Condition',
]
used_e = find_types(stub_text, ALL_EFFECTS)
has_ts = bool(re.search(r'\bTargetScope\b', stub_text))

types_block = ',\n  '.join(used_e)
ts_import = ', TargetScope' if has_ts else ''

STUB_HEADER = (
    "import type { PlayerState, CardData" + ts_import + " } from '../types';\n"
    "import type {\n"
    "  " + types_block + ",\n"
    "} from '../types/effects';\n"
    "import type { ExecCtx, ExecResult } from './execUtils';\n"
    "import {\n"
    "  done, addLog, needsInteraction, ownerState, setOwnerState,\n"
    "  removeFromField, getCardNum, fieldCandidates, selectOrInteract, shuffle,\n"
    "} from './execUtils';\n\n"
    "export function execStub(\n"
    "  stub: StubAction,\n"
    "  ctx: ExecCtx,\n"
    "  exec: (action: EffectAction, ctx: ExecCtx) => ExecResult,\n"
    "): ExecResult {\n"
)

with open('src/engine/execStub.ts', 'w', encoding='utf-8') as f:
    f.write(STUB_HEADER)
    f.write(stub_text)
    f.write('}\n')
print(f"  execStub.ts: {len(STUB_HEADER.splitlines()) + len(stub_text.splitlines())} lines")

# ── 3. parserUtils.ts ───────────────────────────────────────────────────────
os.makedirs('src/data/parsers', exist_ok=True)

util_parts = (
    parser_lines[88:127]
    + parser_lines[128:146]
    + parser_lines[288:298]
    + parser_lines[353:416]
)
util_text = ''.join(util_parts)

fns2 = ['extractCostColors','makeRevealPickStub','toHalf','stripRuleParens',
        'parseNum','parseSignedNum','parsePowerFilter','parseLevelFilter',
        'parseColorFilter','parseCardTypeFilter','parseStoryFilter','parseSigniTarget']
for fn in fns2:
    util_text = re.sub(r'^function ' + fn + r'\b', 'export function ' + fn, util_text, flags=re.MULTILINE)

UTIL_HEADER = "import type { Owner, EffectTarget, TargetFilter, StubAction } from '../types/effects';\n\n"
util_text = UTIL_HEADER + util_text

with open('src/data/parserUtils.ts', 'w', encoding='utf-8') as f:
    f.write(util_text)
print(f"  parserUtils.ts: {len(util_text.splitlines())} lines")

# ── 4. sentencePart1-4.ts ───────────────────────────────────────────────────
ALL_PARSER_TYPES = [
    'CardEffect','EffectType','EffectTiming','EffectCost','EnergyCost',
    'EffectAction','EffectTarget','EffectDuration','ActiveCondition',
    'TargetFilter','Owner','CompareOp','SequenceAction','ChooseAction',
    'UnknownAction','TransferToDeckAction','CounterSpellAction','CostReductionAction',
    'GrantProtectionAction','GrantKeywordAction','AttachCharmAction','RevealAndPickAction',
    'BanishRedirectAction','RearrangeSigniAction','GrowFreeAction','RemoveAbilitiesAction',
    'PlayFreeAction','CostIncreaseAction','PowerModifyPerStackAction','PowerModifyPerFieldAction',
    'PowerModifyPerLevelSumAction','CharmProtectionAction','MutualDiscardAndDrawAction',
    'BlockActionAction','EnergyChargeAction','PowerModifyByTargetLevelAction','PowerMultiplyAction',
    'LevelModifyAction','PowerModifyPerCharmAction','PowerModifyPerEnergyAction',
    'PreventDamageAction','EqualizeEnergyAction','VariableDiscardAndDrawAction',
    'BanishSubstituteAction','StackSpellAction','ColorInheritAction','ConditionalDiscardAction',
    'EnergyChargeByFieldCountAction','LookAtDeckAndLifeAction','GrowCostReductionAction',
    'NameBanAction','PlayFreeFromTrashAction','PowerThresholdTrashAction','PowerFlipAction',
    'SelfTrashPreventAction','CostSubstituteAction','PowerModifyPerTrashedLevelAction',
    'RemoveCharmAction','ForceSigniAttackAction','GrantLrigAbilityAction',
    'PowerModifyPerTrashCountAction','PowerModifyPerLifeCountAction','PowerModifyPerLrigLevelAction',
    'PlaceVirusAction','AttachAcceAction','BloodCrystalArmorAction','PowerModifyPerVirusCountAction',
    'LrigLimitModifyAction','FreezeAction','LookAndReorderAction','AddCraftToLrigDeckAction',
    'DrawPerFieldCountAction','AwakenSigniAction','NegateAttackAction','PlaceUnderSigniAction',
    'PreventNextDamageAction','TakeFromUnderSigniAction','StubAction','PowerModifyAction',
    'BanishAction','BounceAction','DownAction','Condition',
]

sections = [
    (656, 2452, 'parseSentencePart1'),
    (2452, 4354, 'parseSentencePart2'),
    (4354, 6251, 'parseSentencePart3'),
    (6251, 8237, 'parseSentencePart4'),
]

for start, end, name in sections:
    body_text = ''.join(parser_lines[start:end])
    used = find_types(body_text, ALL_PARSER_TYPES)
    used_no_ea = [t for t in used if t != 'EffectAction']
    type_imports = ',\n  '.join(['EffectAction'] + used_no_ea) if used_no_ea else 'EffectAction'

    PART_HEADER = (
        "import type {\n"
        "  " + type_imports + ",\n"
        "} from '../../types/effects';\n"
        "import {\n"
        "  parseNum, parseSignedNum, parseSigniTarget,\n"
        "  parsePowerFilter, parseLevelFilter, parseColorFilter,\n"
        "  parseCardTypeFilter, parseStoryFilter, makeRevealPickStub,\n"
        "} from '../parserUtils';\n\n"
        "export function " + name + "(t: string): EffectAction | null {\n"
    )

    if name == 'parseSentencePart4':
        body_text = re.sub(
            r"  return \{ type: 'UNKNOWN', raw: t \};",
            "  return null;",
            body_text
        )

    content = PART_HEADER + body_text + '  return null;\n}\n'
    with open(f'src/data/parsers/{name}.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  {name}.ts: {len(content.splitlines())} lines, types: {len(used)}")

print("Split complete!")
