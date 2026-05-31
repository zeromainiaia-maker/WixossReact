import re

with open('src/data/effectParser.ts', encoding='utf-8') as f:
    content = f.read()

# Remove the import blocks to check usage in the rest of the file
content_no_imports = re.sub(r'import type \{[^}]+\} from [^;]+;', '', content, flags=re.DOTALL)
content_no_imports = re.sub(r'import \{[^}]+\} from [^;]+;', '', content_no_imports, flags=re.DOTALL)

types = [
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

used = [t for t in types if re.search(r'\b' + re.escape(t) + r'\b', content_no_imports)]
unused = [t for t in types if t not in used]
print("USED:")
for t in used: print(f"  {t}")
print()
print("UNUSED:")
for t in unused: print(f"  {t}")
