#!/usr/bin/env python3
"""Fix all issues from the module split."""
import re

# ── 1. Update parserUtils.ts: add missing functions ──────────────────────────
with open('src/data/effectParser.ts', encoding='utf-8') as f:
    original_parser = f.read()

# We need the original effectParser.ts content to extract the missing functions.
# They were in the original at specific line ranges.
# Let me read from the original content preserved in our git history...
# Actually, we need: extractCostColors (already in parserUtils), parseEnergyCosts, toHalf/FW_DIGIT/stripRuleParens

# These functions remain in effectParser.ts (imported from parserUtils won't find them)
# Let me check the current parserUtils.ts
with open('src/data/parserUtils.ts', encoding='utf-8') as f:
    putils = f.read()

print("parserUtils.ts has:")
for fn in ['extractCostColors','makeRevealPickStub','toHalf','stripRuleParens',
           'parseNum','parseSignedNum','parsePowerFilter','parseEnergyCosts']:
    print(f"  {fn}: {'YES' if fn in putils else 'NO'}")

# We need to add to parserUtils.ts:
# - parseEnergyCosts (from effectParser.ts)
# - toHalf is already there but needs to be exported
# - stripRuleParens needs to be exported

# Check what's exported
print("\nExported from parserUtils.ts:")
for m in re.findall(r'export (?:function|const) (\w+)', putils):
    print(f"  {m}")
