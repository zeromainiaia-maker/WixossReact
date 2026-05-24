# -*- coding: utf-8 -*-
import json

with open('C:/Users/zerom/WixossReact/public/data/effects.json', encoding='utf-8') as f:
    data = json.load(f)

def deck_top_cond(filt):
    return {'type': 'DECK_TOP_MATCHES', 'owner': 'self', 'filter': filt}

def fix_steps(steps, new_cond, extra=None):
    for s in steps:
        if s.get('type') == 'CONDITIONAL' and s.get('condition', {}).get('type') == 'IS_MY_TURN':
            s['condition'] = new_cond
            if extra:
                extra(s.get('then', {}))

SIGNI = 'シグニ'   # シグニ
UCHU = '宇宙'          # 宇宙
BLUEAKA = 'ブルアカ'  # ブルアカ

# WX19-024: lv=4 signi -> BANISH opponent
for eff in data['WX19-024']:
    if eff['effectId'] == 'WX19-024-E2':
        fix_steps(eff['action']['steps'], deck_top_cond({'cardType': SIGNI, 'level': 4}))
        eff['parseStatus'] = 'MANUAL'

# WXDi-P01-059: lv=1 -> (UNKNOWN) + BANISH (owner=self->opponent fix)
def fix_banish(then):
    if then.get('type') == 'BANISH':
        t = then.get('target', {})
        if t.get('owner') == 'self':
            t['owner'] = 'opponent'
for eff in data.get('WXDi-P01-059', []):
    if eff['effectId'] == 'WXDi-P01-059-E1':
        fix_steps(eff['action']['steps'], deck_top_cond({'cardType': SIGNI, 'level': 1}), fix_banish)
        eff['parseStatus'] = 'MANUAL'

# WXDi-P01-074: lv=1 -> energy to hand
for eff in data.get('WXDi-P01-074', []):
    if eff['effectId'] == 'WXDi-P01-074-E1':
        fix_steps(eff['action']['steps'], deck_top_cond({'cardType': SIGNI, 'level': 1}))
        eff['parseStatus'] = 'MANUAL'

# WXDi-P01-082: lv=1 -> trash to hand
for eff in data.get('WXDi-P01-082', []):
    if eff['effectId'] == 'WXDi-P01-082-E1':
        fix_steps(eff['action']['steps'], deck_top_cond({'cardType': SIGNI, 'level': 1}))
        eff['parseStatus'] = 'MANUAL'

# WXDi-P15-089: lv=1 -> trash opponent energy
for eff in data.get('WXDi-P15-089', []):
    if eff['effectId'] == 'WXDi-P15-089-E1':
        fix_steps(eff['action']['steps'], deck_top_cond({'cardType': SIGNI, 'level': 1}))
        eff['parseStatus'] = 'MANUAL'

# WXDi-CP02-063: story=ブルアカ -> power+4000 own ブルアカ signi
def fix_power_blueaka(then):
    if then.get('type') == 'POWER_MODIFY':
        t = then.get('target', {})
        t['owner'] = 'self'
        t['filter'] = {'story': BLUEAKA}
for eff in data.get('WXDi-CP02-063', []):
    if eff['effectId'] == 'WXDi-CP02-063-E1':
        fix_steps(eff['action']['steps'], deck_top_cond({'story': BLUEAKA}), fix_power_blueaka)
        eff['parseStatus'] = 'MANUAL'

# WX24-P3-047: 宇宙 signi -> BOUNCE opponent lv<=2 (owner=self->opponent)
def fix_bounce_opp_lv2(then):
    if then.get('type') == 'BOUNCE':
        t = then.get('target', {})
        if t.get('owner') == 'self':
            t['owner'] = 'opponent'
            t['filter'] = {'cardType': SIGNI, 'level': {'max': 2}}
for eff in data.get('WX24-P3-047', []):
    if eff['effectId'] == 'WX24-P3-047-E2':
        fix_steps(eff['action']['steps'], deck_top_cond({'cardType': SIGNI, 'story': UCHU}), fix_bounce_opp_lv2)
        eff['parseStatus'] = 'MANUAL'

# WX24-P3-059: lv=1 -> power+4000 own 宇宙 signi x2
def fix_power_space(then):
    if then.get('type') == 'POWER_MODIFY':
        t = then.get('target', {})
        t['owner'] = 'self'
        t['count'] = 2
        t['upToCount'] = True
        t['filter'] = {'story': UCHU}
for eff in data.get('WX24-P3-059', []):
    if eff['effectId'] == 'WX24-P3-059-E1':
        fix_steps(eff['action']['steps'], deck_top_cond({'cardType': SIGNI, 'level': 1}), fix_power_space)
        eff['parseStatus'] = 'MANUAL'

# WX24-P3-062: lv=1 -> BOUNCE opponent lv=1 signi (owner=self->opponent)
def fix_bounce_opp_lv1(then):
    if then.get('type') == 'BOUNCE':
        t = then.get('target', {})
        if t.get('owner') == 'self':
            t['owner'] = 'opponent'
            t['filter'] = {'cardType': SIGNI, 'level': 1}
for eff in data.get('WX24-P3-062', []):
    if eff['effectId'] == 'WX24-P3-062-E1':
        fix_steps(eff['action']['steps'], deck_top_cond({'cardType': SIGNI, 'level': 1}), fix_bounce_opp_lv1)
        eff['parseStatus'] = 'MANUAL'

# WX25-CP1-054: story=ブルアカ -> TRASH opponent signi + remove misplaced TRANSFER_TO_HAND
for eff in data.get('WX25-CP1-054', []):
    if eff['effectId'] == 'WX25-CP1-054-E1':
        fix_steps(eff['action']['steps'], deck_top_cond({'story': BLUEAKA}))
        eff['action']['steps'] = [
            s for s in eff['action']['steps']
            if not (s.get('type') == 'TRANSFER_TO_HAND' and s.get('source', {}).get('type') == 'TRASH_CARD')
        ]
        eff['parseStatus'] = 'MANUAL'

with open('C:/Users/zerom/WixossReact/public/data/effects.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Done')
