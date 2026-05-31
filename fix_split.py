#!/usr/bin/env python3
"""Fix all issues from the module split."""
import re

# ── Helper ────────────────────────────────────────────────────────────────────
def find_types(text, types):
    return [t for t in types if re.search(r'\b' + re.escape(t) + r'\b', text)]

ALL_EFFECTS_TYPES = [
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
    # additional types used inline
    'RecollectGateAction','AddToHandAction','CardLocation','AltCostOppTurnAction',
    'ConditionalAction','BlockCardUseAction','AddToEnergyAction','PlaceUnderSourceSigniAction',
    'NumberOrRef','TriggerScope','EffectTrigger','EffectScope',
]

# ── 1. Fix parserUtils.ts: add parseEnergyCosts ──────────────────────────────
with open('src/data/effectParser.ts', encoding='utf-8') as f:
    parser_content = f.read()
    parser_lines = parser_content.split('\n')

# Find parseEnergyCosts in effectParser.ts
pe_start = pe_end = -1
for i, ln in enumerate(parser_lines):
    if 'const ENERGY_COLORS' in ln and pe_start < 0:
        pe_start = i
    if pe_start >= 0 and i > pe_start and ln.startswith('}') and 'parseEnergyCosts' in '\n'.join(parser_lines[pe_start:i+1]):
        pe_end = i + 1
        break

if pe_start >= 0 and pe_end > 0:
    energy_code = '\n'.join(parser_lines[pe_start:pe_end])
    # Make it exported
    energy_code = energy_code.replace('function parseEnergyCosts', 'export function parseEnergyCosts')

    with open('src/data/parserUtils.ts', encoding='utf-8') as f:
        putils = f.read()

    # Add after the last export
    putils += '\n' + energy_code + '\n'

    with open('src/data/parserUtils.ts', 'w', encoding='utf-8') as f:
        f.write(putils)
    print(f"  Added parseEnergyCosts to parserUtils.ts")
else:
    print("  WARNING: Could not find parseEnergyCosts")

# ── 2. Fix parseSentencePart1-4.ts ──────────────────────────────────────────
parts = ['parseSentencePart1', 'parseSentencePart2', 'parseSentencePart3', 'parseSentencePart4']

for name in parts:
    path = f'src/data/parsers/{name}.ts'
    with open(path, encoding='utf-8') as f:
        content = f.read()

    # 2a. Remove inline import prefixes (both paths)
    content = re.sub(r"import\('\.\./types/effects'\)\.", '', content)
    content = re.sub(r"import\('\.\.\/\.\.\/types/effects'\)\.", '', content)
    content = re.sub(r"import\('\.\./types'\)\.", '', content)
    content = re.sub(r"import\('\.\.\/types'\)\.", '', content)

    # 2b. Replace parseSingleSentence calls with a chain
    # parseSingleSentence(x) -> (parseSentencePart1(x) ?? parseSentencePart2(x) ?? { type: 'STUB', id: 'UNKNOWN_NESTED' } as EffectAction)
    if 'parseSingleSentence' in content:
        content = content.replace(
            'parseSingleSentence(m[1].trim())',
            "(parseSentencePart1(m[1].trim()) ?? parseSentencePart2(m[1].trim()) ?? { type: 'STUB', id: 'UNKNOWN_NESTED' } as EffectAction)"
        )
        content = content.replace(
            'parseSingleSentence(bodyM[1])',
            "(parseSentencePart1(bodyM[1]) ?? parseSentencePart2(bodyM[1]) ?? { type: 'STUB', id: 'UNKNOWN_NESTED' } as EffectAction)"
        )
        # Add imports for part1/2 in part3/4
        if name in ('parseSentencePart3', 'parseSentencePart4'):
            content = content.replace(
                "} from '../parserUtils';\n",
                "} from '../parserUtils';\nimport { parseSentencePart1 } from './parseSentencePart1';\nimport { parseSentencePart2 } from './parseSentencePart2';\n"
            )

    # 2c. Determine all types actually used now (after inline removal)
    # Strip the import block to check usage elsewhere
    body = re.sub(r'^import type \{[^}]+\};', '', content, flags=re.DOTALL|re.MULTILINE)
    body = re.sub(r'^import \{[^}]+\};', '', body, flags=re.DOTALL|re.MULTILINE)
    body = re.sub(r'^import type [^;]+;', '', body, flags=re.DOTALL|re.MULTILINE)
    body = re.sub(r'^import [^;]+;', '', body, flags=re.DOTALL|re.MULTILINE)

    used_types = find_types(body, ALL_EFFECTS_TYPES)
    used_types_no_ea = [t for t in used_types if t != 'EffectAction']
    type_imports = ',\n  '.join(['EffectAction'] + used_types_no_ea) if used_types_no_ea else 'EffectAction'

    # Determine parserUtils functions needed
    utils_fns = ['parseNum', 'parseSignedNum', 'parseSigniTarget', 'parsePowerFilter',
                 'parseLevelFilter', 'parseColorFilter', 'parseCardTypeFilter',
                 'parseStoryFilter', 'makeRevealPickStub', 'parseEnergyCosts',
                 'extractCostColors', 'toHalf']
    used_utils = [fn for fn in utils_fns if re.search(r'\b' + fn + r'\b', body)]
    utils_import = ', '.join(used_utils) if used_utils else 'parseNum'

    # 2d. Rebuild the header
    # Find end of current import section
    # Remove old imports
    content_body = re.sub(
        r'^(?:import type \{[^}]+\};|import \{[^}]+\};|import type [^;]+;|import [^;]+;)\n*',
        '', content, flags=re.DOTALL|re.MULTILINE
    )
    # Trim leading whitespace/newlines
    content_body = content_body.lstrip('\n')

    # Check if 'export function' is still there
    if f'export function {name}' not in content_body:
        print(f"  WARNING: {name} function not found after import removal!")
        continue

    new_header = (
        "import type {\n"
        "  " + type_imports + ",\n"
        "} from '../../types/effects';\n"
        "import {\n"
        "  " + utils_import + ",\n"
        "} from '../parserUtils';\n"
    )

    # Add parseSentencePart1/2 import if needed
    if name in ('parseSentencePart3', 'parseSentencePart4') and 'parseSentencePart1' in content_body:
        new_header += "import { parseSentencePart1 } from './parseSentencePart1';\n"
        new_header += "import { parseSentencePart2 } from './parseSentencePart2';\n"

    new_header += '\n'

    new_content = new_header + content_body

    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"  Fixed {name}.ts: types={len(used_types)}, utils={len(used_utils)}")

# ── 3. Fix effectParser.ts: remove unused imports ────────────────────────────
with open('src/data/effectParser.ts', encoding='utf-8') as f:
    ep = f.read()

# Get body without imports to determine usage
ep_body = re.sub(r'^import type \{[^}]+\};', '', ep, flags=re.DOTALL|re.MULTILINE)
ep_body = re.sub(r'^import \{[^}]+\};', '', ep_body, flags=re.DOTALL|re.MULTILINE)
ep_body = re.sub(r'^import type [^;]+;', '', ep_body, flags=re.DOTALL|re.MULTILINE)
ep_body = re.sub(r'^import [^;]+;', '', ep_body, flags=re.DOTALL|re.MULTILINE)

used_ep_types = find_types(ep_body, ALL_EFFECTS_TYPES)

# Also check what utils are used from effectParser perspective
utils_fns_ep = ['parseNum', 'parseSignedNum', 'parseSigniTarget', 'parsePowerFilter',
                'parseLevelFilter', 'parseColorFilter', 'parseCardTypeFilter',
                'parseStoryFilter', 'makeRevealPickStub', 'parseEnergyCosts',
                'extractCostColors', 'toHalf', 'stripRuleParens']
used_ep_utils = [fn for fn in utils_fns_ep if re.search(r'\b' + fn + r'\b', ep_body)]

print(f"\n  effectParser.ts used types: {', '.join(used_ep_types[:10])}...")
print(f"  effectParser.ts used utils: {', '.join(used_ep_utils)}")

used_types_no_ea_ep = [t for t in used_ep_types if t != 'EffectAction']
type_imports_ep = ',\n  '.join(['EffectAction'] + used_types_no_ea_ep) if used_types_no_ea_ep else 'EffectAction'
utils_import_ep = ', '.join(used_ep_utils) if used_ep_utils else 'parseNum'

# Check if parseSentencePart imports are needed
has_parts = 'parseSentencePart1' in ep

NEW_EP_HEADER = (
    "import type { CardData } from '../types';\n"
    "import { mergeManualEffects } from './manualEffects';\n"
    "import type {\n"
    "  " + type_imports_ep + ",\n"
    "} from '../types/effects';\n"
    "import {\n"
    "  " + utils_import_ep + ",\n"
    "} from './parserUtils';\n"
)

if has_parts:
    NEW_EP_HEADER += (
        "import { parseSentencePart1 } from './parsers/parseSentencePart1';\n"
        "import { parseSentencePart2 } from './parsers/parseSentencePart2';\n"
        "import { parseSentencePart3 } from './parsers/parseSentencePart3';\n"
        "import { parseSentencePart4 } from './parsers/parseSentencePart4';\n"
    )

NEW_EP_HEADER += '\n'

# Remove old import block from ep
ep_body_stripped = ep_body.lstrip('\n')
new_ep = NEW_EP_HEADER + ep_body_stripped

with open('src/data/effectParser.ts', 'w', encoding='utf-8') as f:
    f.write(new_ep)
print(f"  Updated effectParser.ts: {len(new_ep.splitlines())} lines")

# ── 4. Fix effectExecutor.ts: remove unused imports ──────────────────────────
with open('src/engine/effectExecutor.ts', encoding='utf-8') as f:
    ee = f.read()

ee_body = re.sub(r'^import type \{[^}]+\};', '', ee, flags=re.DOTALL|re.MULTILINE)
ee_body = re.sub(r'^import \{[^}]+\};', '', ee_body, flags=re.DOTALL|re.MULTILINE)
ee_body = re.sub(r'^import type [^;]+;', '', ee_body, flags=re.DOTALL|re.MULTILINE)
ee_body = re.sub(r'^import [^;]+;', '', ee_body, flags=re.DOTALL|re.MULTILINE)
ee_body = re.sub(r'^export type \{[^}]+\};', '', ee_body, flags=re.DOTALL|re.MULTILINE)
ee_body = re.sub(r'^export \{[^}]+\};', '', ee_body, flags=re.DOTALL|re.MULTILINE)

ALL_EXEC_TYPES = [
    'CardEffect','EffectAction','TargetFilter','Owner','NumberOrRef','Condition',
    'DrawAction','BanishAction','BounceAction','PowerModifyAction','PowerSetAction',
    'TrashAction','EnergyChargeAction','EnergyChargeFromDeckAction','LifeCrashAction',
    'ShuffleDeckAction','TransferToHandAction','AddToFieldAction','AddToLifeAction',
    'FreezeAction','DownAction','UpAction','BlockActionAction','StoryChangeAction',
    'GrantKeywordAction','SearchAction','SequenceAction','ChooseAction','ConditionalAction',
    'LookAndReorderAction','TransferToDeckAction','GrantProtectionAction','AttachCharmAction',
    'RevealAndPickAction','PlayFreeAction','CostIncreaseAction','PowerModifyPerFieldAction',
    'PowerModifyPerLrigLevelAction','CharmProtectionAction','MutualDiscardAndDrawAction',
    'RemoveAbilitiesAction','GainCoinAction','DiscardBothAction','RemoveCharmAction',
    'ForceSigniAttackAction','PowerModifyPerTrashCountAction','PowerModifyPerLifeCountAction',
    'PlaceVirusAction','AttachAcceAction','BloodCrystalArmorAction','GrantLrigAbilityAction',
    'StubAction',
]
ALL_TYPES_IMPORTS = ['PlayerState','CardData','PendingInteractionDef','TargetScope']

used_ee_effects = find_types(ee_body, ALL_EXEC_TYPES)
used_ee_types = find_types(ee_body, ALL_TYPES_IMPORTS)
uses_parse = 'parseCardEffects' in ee_body

print(f"\n  effectExecutor.ts used effects types: {len(used_ee_effects)}")
print(f"  effectExecutor.ts used types imports: {used_ee_types}")
print(f"  effectExecutor.ts uses parseCardEffects: {uses_parse}")

types_block_ee = ',\n  '.join(used_ee_effects)
types_from_types = ', '.join(used_ee_types)

NEW_EE_HEADER = (
    f"import type {{ {types_from_types} }} from '../types';\n"
)
if uses_parse:
    NEW_EE_HEADER += "import { parseCardEffects } from '../data/effectParser';\n"
NEW_EE_HEADER += (
    "import type {\n"
    "  " + types_block_ee + ",\n"
    "} from '../types/effects';\n"
    "import type { ExecCtx, ExecResult } from './execUtils';\n"
    "import {\n"
    "  done, addLog, needsInteraction, ownerState, setOwnerState, shuffle, resolveNum,\n"
    "  matchesFilter, getCardNum, removeFromField, fieldCandidates, handCandidates,\n"
    "  trashCandidates, energyCandidates, evalCondition, selectOrInteract, canPayOptionalCost,\n"
    "  evalUseCondition,\n"
    "} from './execUtils';\n"
    "export type { ExecCtx, ExecResult };\n"
    "export { matchesFilter, getCardNum, removeFromField, evalUseCondition };\n"
    "import { execStub } from './execStub';\n"
    "\n"
)

ee_body_stripped = ee_body.lstrip('\n')
new_ee = NEW_EE_HEADER + ee_body_stripped

with open('src/engine/effectExecutor.ts', 'w', encoding='utf-8') as f:
    f.write(new_ee)
print(f"  Updated effectExecutor.ts: {len(new_ee.splitlines())} lines")

# ── 5. Fix execStub.ts: add missing imports ──────────────────────────────────
with open('src/engine/execStub.ts', encoding='utf-8') as f:
    es = f.read()

es_body = re.sub(r'^import type \{[^}]+\};', '', es, flags=re.DOTALL|re.MULTILINE)
es_body = re.sub(r'^import \{[^}]+\};', '', es_body, flags=re.DOTALL|re.MULTILINE)
es_body = re.sub(r'^import type [^;]+;', '', es_body, flags=re.DOTALL|re.MULTILINE)

ALL_STUB_TYPES = [
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
ALL_TYPES_FOR_STUB = ['PlayerState','CardData','PendingInteractionDef','TargetScope']

used_stub_effects = find_types(es_body, ALL_STUB_TYPES)
used_stub_types = find_types(es_body, ALL_TYPES_FOR_STUB)
uses_parse_es = 'parseCardEffects' in es_body

print(f"\n  execStub.ts used effects types: {len(used_stub_effects)}")
print(f"  execStub.ts used types imports: {used_stub_types}")
print(f"  execStub.ts uses parseCardEffects: {uses_parse_es}")

types_block_es = ',\n  '.join(used_stub_effects)
types_from_types_es = ', '.join(used_stub_types)

NEW_ES_HEADER = (
    f"import type {{ {types_from_types_es} }} from '../types';\n"
)
if uses_parse_es:
    NEW_ES_HEADER += "import { parseCardEffects } from '../data/effectParser';\n"
NEW_ES_HEADER += (
    "import type {\n"
    "  " + types_block_es + ",\n"
    "} from '../types/effects';\n"
    "import type { ExecCtx, ExecResult } from './execUtils';\n"
    "import {\n"
    "  done, addLog, needsInteraction, ownerState, setOwnerState,\n"
    "  removeFromField, getCardNum, fieldCandidates, selectOrInteract, shuffle,\n"
    "} from './execUtils';\n"
    "\n"
)

es_body_stripped = es_body.lstrip('\n')
new_es = NEW_ES_HEADER + es_body_stripped

with open('src/engine/execStub.ts', 'w', encoding='utf-8') as f:
    f.write(new_es)
print(f"  Updated execStub.ts: {len(new_es.splitlines())} lines")

print("\nFix complete! Run: npx tsc -b --noEmit")
