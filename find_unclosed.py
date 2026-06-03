"""L913より前の未閉じテンプレートリテラルを探す"""
import sys

with open('src/engine/effectExecutor.ts', 'rb') as f:
    raw = f.read()

lines = raw.split(b'\n')
in_sq = False
in_dq = False
in_template = 0

for i, line in enumerate(lines[:912]):
    old_template = in_template
    j = 0
    while j < len(line):
        b = line[j]
        if not in_sq and not in_dq and j+1 < len(line) and b == 0x2F and line[j+1] == 0x2F:
            break
        if in_sq:
            if b == 0x5C and j+1 < len(line):
                j += 2; continue
            elif b == 0x27:
                in_sq = False
        elif in_dq:
            if b == 0x5C and j+1 < len(line):
                j += 2; continue
            elif b == 0x22:
                in_dq = False
        elif in_template > 0:
            if b == 96:
                in_template -= 1
        else:
            if b == 0x27:
                in_sq = True
            elif b == 0x22:
                in_dq = True
            elif b == 96:
                in_template += 1
        j += 1
    if in_template != old_template:
        sys.stdout.buffer.write(b'L' + str(i+1).encode() + b': template depth changed ' + str(old_template).encode() + b' -> ' + str(in_template).encode() + b'\n')

sys.stdout.buffer.write(b'Final: in_template=' + str(in_template).encode() + b'\n')
