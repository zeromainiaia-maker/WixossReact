import json

with open('C:/Users/zerom/WixossReact/public/data/effects.json', encoding='utf-8') as f:
    data = json.load(f)

def deck_top_cond(filt):
    return {'type': 'DECK_TOP_MATCHES', 'owner': 'self', 'filter': filt}

def fix_is_my_turn_steps(steps, cond_filter, extra_fixes=None):
    for i, s in enumerate(steps):
        if s.get('type') == 'CONDITIONAL' and s.get('condition', {}).get('type') == 'IS_MY_TURN':
            steps[i]['condition'] = deck_top_cond(cond_filter)
            if extra_fixes:
                extra_fixes(steps[i].get('then', {}))

# WX19-024: lv=4 signi -> BANISH opponent
for eff in data['WX19-024']:
    if eff['effectId'] == 'WX19-024-E2':
        fix_is_my_turn_steps(eff['action']['steps'], {'cardType': 'signi', 'level': 4})
        eff['parseStatus'] = 'MANUAL'

# WXDi-P01-059: lv=1 -> BANISH (target owner self->opponent)
def fix_banish_owner(then):
    if then.get('type') == 'BANISH':
        tgt = then.get('target', {})
        if tgt.get('owner') == 'self':
            tgt['owner'] = 'opponent'

for eff in data.get('WXDi-P01-059', []):
    if eff['effectId'] == 'WXDi-P01-059-E1':
        fix_is_my_turn_steps(eff['action']['steps'], {'cardType': 'signi', 'level': 1}, fix_banish_owner)
        eff['parseStatus'] = 'MANUAL'

# WXDi-P01-074: lv=1 -> energy to hand
for eff in data.get('WXDi-P01-074', []):
    if eff['effectId'] == 'WXDi-P01-074-E1':
        fix_is_my_turn_steps(eff['action']['steps'], {'cardType': 'signi', 'level': 1})
        eff['parseStatus'] = 'MANUAL'

# WXDi-P01-082: lv=1 -> trash to hand
for eff in data.get('WXDi-P01-082', []):
    if eff['effectId'] == 'WXDi-P01-082-E1':
        fix_is_my_turn_steps(eff['action']['steps'], {'cardType': 'signi', 'level': 1})
        eff['parseStatus'] = 'MANUAL'

# WXDi-P15-089: lv=1 -> trash opponent energy
for eff in data.get('WXDi-P15-089', []):
    if eff['effectId'] == 'WXDi-P15-089-E1':
        fix_is_my_turn_steps(eff['action']['steps'], {'cardType': 'signi', 'level': 1})
        eff['parseStatus'] = 'MANUAL'

# WXDi-CP02-063: story=blueaka -> power+4000 own blueaka signi
def fix_power_blueaka(then):
    if then.get('type') == 'POWER_MODIFY':
        tgt = then.get('target', {})
        tgt['owner'] = 'self'
        tgt['filter'] = {'story': 'blueaka'}

for eff in data.get('WXDi-CP02-063', []):
    if eff['effectId'] == 'WXDi-CP02-063-E1':
        fix_is_my_turn_steps(eff['action']['steps'], {'story': 'blueaka'}, fix_power_blueaka)
        eff['parseStatus'] = 'MANUAL'

# WX24-P3-047: story=space signi -> BOUNCE opponent lv<=2 signi
def fix_bounce_opponent_lv2(then):
    if then.get('type') == 'BOUNCE':
        tgt = then.get('target', {})
        if tgt.get('owner') == 'self':
            tgt['owner'] = 'opponent'
            tgt['filter'] = {'cardType': 'signi', 'level': {'max': 2}}

for eff in data.get('WX24-P3-047', []):
    if eff['effectId'] == 'WX24-P3-047-E2':
        fix_is_my_turn_steps(eff['action']['steps'], {'cardType': 'signi', 'story': 'space'}, fix_bounce_opponent_lv2)
        eff['parseStatus'] = 'MANUAL'

# WX24-P3-059: lv=1 -> power+4000 own space signi x2
def fix_power_space(then):
    if then.get('type') == 'POWER_MODIFY':
        tgt = then.get('target', {})
        tgt['owner'] = 'self'
        tgt['count'] = 2
        tgt['upToCount'] = True
        tgt['filter'] = {'story': 'space'}

for eff in data.get('WX24-P3-059', []):
    if eff['effectId'] == 'WX24-P3-059-E1':
        fix_is_my_turn_steps(eff['action']['steps'], {'cardType': 'signi', 'level': 1}, fix_power_space)
        eff['parseStatus'] = 'MANUAL'

# WX24-P3-062: lv=1 -> BOUNCE opponent lv=1 signi
def fix_bounce_opponent_lv1(then):
    if then.get('type') == 'BOUNCE':
        tgt = then.get('target', {})
        if tgt.get('owner') == 'self':
            tgt['owner'] = 'opponent'
            tgt['filter'] = {'cardType': 'signi', 'level': 1}

for eff in data.get('WX24-P3-062', []):
    if eff['effectId'] == 'WX24-P3-062-E1':
        fix_is_my_turn_steps(eff['action']['steps'], {'cardType': 'signi', 'level': 1}, fix_bounce_opponent_lv1)
        eff['parseStatus'] = 'MANUAL'

# WX25-CP1-054: story=blueaka -> TRASH opponent signi (remove misplaced TRANSFER_TO_HAND)
for eff in data.get('WX25-CP1-054', []):
    if eff['effectId'] == 'WX25-CP1-054-E1':
        fix_is_my_turn_steps(eff['action']['steps'], {'story': 'blueaka'})
        eff['action']['steps'] = [
            s for s in eff['action']['steps']
            if not (s.get('type') == 'TRANSFER_TO_HAND' and s.get('source', {}).get('type') == 'TRASH_CARD')
        ]
        eff['parseStatus'] = 'MANUAL'

with open('C:/Users/zerom/WixossReact/public/data/effects.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Done')
