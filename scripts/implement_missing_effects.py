import json, copy, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('C:/Users/zerom/WixossReact/public/data/effects.json', encoding='utf-8') as f:
    data = json.load(f)

def clone(template_id, new_id):
    src = data[template_id]
    result = []
    for eff in src:
        e = copy.deepcopy(eff)
        e['effectId'] = e['effectId'].replace(template_id, new_id)
        result.append(e)
    return result

# ===== Group1: 純コピー =====
copies = {
    'WD13-017':   'WX01-037',
    'WDA-F01-18': 'WX01-037',
    'PR-246':     'WX17-Re02',
    'PR-251':     'WX17-Re02',
    'WDA-F03-16': 'WX17-Re02',
    'PR-176':     'WX16-Re03',
    'PR-181':     'WX16-Re03',
    'WDA-F04-21': 'WX16-035',
    'PR-283':     'WX09-CB02',
    'WD13-013':   'WX02-021',
    'SP28-003':   'SP27-003',
    'SP37-003':   'SP26-002',
    'PR-313':     'PR-204',
    'PR-276':     'WX05-005',
}
for new_id, tmpl in copies.items():
    data[new_id] = clone(tmpl, new_id)
    print(f'copied {tmpl} -> {new_id}')

# ===== SP31-008: スピリット・サルベージ (excludeCardName追加) =====
sp31 = clone('WD13-009', 'SP31-008')
sp31[0]['action']['source']['filter']['excludeCardName'] = 'スピリット・サルベージ'
data['SP31-008'] = sp31
print('implemented SP31-008')

# ===== SP32-011: コードラブハート C・M・R =====
data['SP32-011'] = [
    {**copy.deepcopy(data['WX05-022'][0]), 'effectId': 'SP32-011-E1'},
    {
        'effectId': 'SP32-011-E2',
        'effectType': 'ACTIVATED',
        'timing': ['MAIN'],
        'cost': {'turn_limit': 1},
        'action': {
            'type': 'STUB',
            'id': 'DISCARD_ALL_BANISH_IF_2PLUS',
            'description': '手札をすべて捨て2枚以上捨てた場合対戦相手シグニ1体バニッシュ'
        },
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'MANUAL'
    },
    {
        'effectId': 'SP32-011-BURST',
        'effectType': 'LIFE_BURST',
        'timing': ['ON_LIFE_BURST'],
        'action': {
            'type': 'SEQUENCE',
            'steps': [
                {'type': 'DOWN',   'target': {'type': 'LRIG', 'owner': 'opponent', 'count': 1}},
                {'type': 'FREEZE', 'target': {'type': 'LRIG', 'owner': 'opponent', 'count': 1}}
            ]
        },
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'AUTO'
    }
]
print('implemented SP32-011')

# ===== SP32-003 / WDA-F04-13: 幻怪姫 スノークイーン =====
snow_queen = [
    {
        'effectId': 'SP32-003-E1',
        'effectType': 'AUTO',
        'timing': ['ON_LEAVE_FIELD'],
        'action': {
            'type': 'STUB',
            'id': 'PLAY_LOWER_POWER_FROM_HAND',
            'description': '手札からこのシグニよりパワーの低いシグニ1枚を場に出す'
        },
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'MANUAL'
    },
    {
        'effectId': 'SP32-003-E2',
        'effectType': 'AUTO',
        'timing': ['ON_PLAY'],
        'cost': {'discard_signi_story': {'story': '怪異', 'count': 2}},
        'action': {
            'type': 'BOUNCE',
            'target': {
                'type': 'SIGNI',
                'owner': 'opponent',
                'count': 1,
                'filter': {'cardType': 'シグニ'},
                'upToCount': False
            }
        },
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'AUTO'
    },
    {
        'effectId': 'SP32-003-E3',
        'effectType': 'ACTIVATED',
        'timing': ['MAIN'],
        'cost': {'energy': [{'color': '白', 'count': 1}, {'color': '白', 'count': 1}]},
        'action': {
            'type': 'TRANSFER_TO_HAND',
            'source': {
                'type': 'TRASH_CARD',
                'owner': 'self',
                'count': 1,
                'upToCount': False,
                'filter': {
                    'cardType': 'シグニ',
                    'story': '怪異',
                    'excludeCardName': '幻怪姫　スノークイーン'
                }
            }
        },
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'AUTO'
    },
    {
        'effectId': 'SP32-003-BURST',
        'effectType': 'LIFE_BURST',
        'timing': ['ON_LIFE_BURST'],
        'action': {
            'type': 'TRANSFER_TO_HAND',
            'source': {
                'type': 'TRASH_CARD',
                'owner': 'self',
                'count': 2,
                'upToCount': True,
                'filter': {'cardType': 'シグニ', 'story': '怪異'}
            }
        },
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'AUTO'
    }
]
data['SP32-003'] = snow_queen
wda_f04_13 = copy.deepcopy(snow_queen)
for e in wda_f04_13:
    e['effectId'] = e['effectId'].replace('SP32-003', 'WDA-F04-13')
data['WDA-F04-13'] = wda_f04_13
print('implemented SP32-003, WDA-F04-13')

# ===== WD11-011: 幻蟲 キアハ =====
data['WD11-011'] = [
    {
        'effectId': 'WD11-011-E1',
        'effectType': 'AUTO',
        'timing': ['ON_PLAY'],
        'cost': {'energy': [{'color': '黒', 'count': 1}]},
        'action': {
            'type': 'TRANSFER_TO_HAND',
            'source': {
                'type': 'TRASH_CARD',
                'owner': 'self',
                'count': 1,
                'upToCount': False,
                'filter': {
                    'cardType': 'シグニ',
                    'color': '黒',
                    'excludeCardName': '幻蟲　キアハ'
                }
            }
        },
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'AUTO'
    },
    {
        'effectId': 'WD11-011-BURST',
        'effectType': 'LIFE_BURST',
        'timing': ['ON_LIFE_BURST'],
        'action': {'type': 'DRAW', 'owner': 'self', 'count': 1},
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'AUTO'
    }
]
print('implemented WD11-011')

# ===== WDA-F02-10: レイラ=クレジット (キー) =====
data['WDA-F02-10'] = [
    {
        'effectId': 'WDA-F02-10-E1',
        'effectType': 'CONTINUOUS',
        'action': {
            'type': 'STUB',
            'id': 'KEY_DAMAGE_AND_CARD_PROTECTION',
            'description': '対戦相手効果によるダメージ無効、シグニゾーン以外カード保護'
        },
        'duration': 'PERMANENT',
        'mandatory': True,
        'parseStatus': 'MANUAL'
    }
]
print('implemented WDA-F02-10')

# ===== WDA-F05-11: 期之遊姫王 †ブラジャック† =====
data['WDA-F05-11'] = [
    {
        'effectId': 'WDA-F05-11-E1',
        'effectType': 'CONTINUOUS',
        'action': {
            'type': 'STUB',
            'id': 'BLOCK_PLAY_SIGNI_EXCEPT_HAND',
            'description': '対戦相手は自身の効果によって手札以外からシグニを場に出せない'
        },
        'duration': 'PERMANENT',
        'mandatory': True,
        'parseStatus': 'MANUAL'
    },
    {
        'effectId': 'WDA-F05-11-E2',
        'effectType': 'AUTO',
        'timing': ['ON_ATTACK_SIGNI'],
        'action': {
            'type': 'STUB',
            'id': 'BANISH_SELF_SIGNI_THEN_RECOVER',
            'description': '他シグニをすべてバニッシュし、同数のトラッシュLv4以下遊具シグニを場に出す'
        },
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'MANUAL'
    },
    {
        'effectId': 'WDA-F05-11-E3',
        'effectType': 'AUTO',
        'timing': ['ON_PLAY'],
        'action': {
            'type': 'ADD_TO_FIELD',
            'owner': 'self',
            'source': {
                'type': 'TRASH_CARD',
                'owner': 'self',
                'count': 1,
                'upToCount': False,
                'filter': {
                    'cardType': 'シグニ',
                    'level': {'max': 4},
                    'story': '遊具'
                }
            }
        },
        'duration': 'INSTANT',
        'mandatory': True,
        'parseStatus': 'AUTO'
    },
    {
        'effectId': 'WDA-F05-11-BURST',
        'effectType': 'LIFE_BURST',
        'timing': ['ON_LIFE_BURST'],
        'action': {
            'type': 'SEQUENCE',
            'steps': [
                {
                    'type': 'BANISH',
                    'target': {
                        'type': 'SIGNI',
                        'owner': 'opponent',
                        'count': 1,
                        'filter': {'cardType': 'シグニ'},
                        'upToCount': False
                    }
                },
                {
                    'type': 'STUB',
                    'id': 'RECOVER_SAME_LEVEL_YUGUU',
                    'description': 'バニッシュしたシグニと同レベルの遊具シグニをトラッシュから手札に加える'
                }
            ]
        },
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'MANUAL'
    }
]
print('implemented WDA-F05-11')

# ===== WDA-F05-16: 惨之遊 †ジョモカル† =====
data['WDA-F05-16'] = [
    {
        'effectId': 'WDA-F05-16-E1',
        'effectType': 'AUTO',
        'timing': ['ON_TRASH'],
        'action': {'type': 'DRAW', 'owner': 'self', 'count': 1},
        'duration': 'INSTANT',
        'mandatory': True,
        'parseStatus': 'AUTO'
    },
    {
        'effectId': 'WDA-F05-16-E2',
        'effectType': 'AUTO',
        'timing': ['ON_PLAY'],
        'cost': {'energy': [{'color': '黒', 'count': 1}]},
        'action': {
            'type': 'TRANSFER_TO_HAND',
            'source': {
                'type': 'TRASH_CARD',
                'owner': 'self',
                'count': 1,
                'upToCount': False,
                'filter': {
                    'cardType': 'シグニ',
                    'level': {'max': 3},
                    'story': '遊具',
                    'excludeCardName': '惨之遊　†ジョモカル†'
                }
            }
        },
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'AUTO'
    },
    {
        'effectId': 'WDA-F05-16-BURST',
        'effectType': 'LIFE_BURST',
        'timing': ['ON_LIFE_BURST'],
        'action': {'type': 'DRAW', 'owner': 'self', 'count': 1},
        'duration': 'INSTANT',
        'mandatory': False,
        'parseStatus': 'AUTO'
    }
]
print('implemented WDA-F05-16')

with open('C:/Users/zerom/WixossReact/public/data/effects.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print()
print('=== 書き込み完了: 22件実装 ===')
