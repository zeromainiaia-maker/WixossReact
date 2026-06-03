"""L912までの文字列/テンプレートバランスをチェック"""
import sys

with open('src/engine/effectExecutor.ts', 'rb') as f:
    raw = f.read()

lines = raw.split(b'\n')
in_sq = False
in_dq = False
in_template = 0

for i, line in enumerate(lines[:912]):
    j = 0
    while j < len(line):
        b = line[j]
        # コメント
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
            pass
        else:
            if b == 0x27:
                in_sq = True
            elif b == 0x22:
                in_dq = True
            elif b == 96:
                in_template += 1
        j += 1

sys.stdout.buffer.write(b'After L912: in_sq=' + str(in_sq).encode() + b' in_dq=' + str(in_dq).encode() + b' in_template=' + str(in_template).encode() + b'\n')
if in_sq:
    sys.stdout.buffer.write(b'WARNING: unclosed single quote before L913!\n')
if in_template > 0:
    sys.stdout.buffer.write(b'WARNING: unclosed template literal before L913! depth=' + str(in_template).encode() + b'\n')
