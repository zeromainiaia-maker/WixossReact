"""テンプレートリテラルの対応をチェックして問題箇所を特定"""
import sys

with open('src/engine/effectExecutor.ts', 'rb') as f:
    raw = f.read()

bt = 96  # backtick
dollar = 36  # $
content = raw

# 簡易的にテンプレートリテラルの対応をチェック
# 複数行テンプレートは除外して単純にバッククォートの奇数行を探す
lines = content.split(b'\n')

# 行ごとのバッククォート数をトラッキング
odd_lines = []
for i, line in enumerate(lines):
    bt_count = line.count(bytes([bt]))
    if bt_count % 2 == 1:
        odd_lines.append((i+1, bt_count, line.rstrip()))

sys.stdout.buffer.write(b'Odd-backtick lines: ' + str(len(odd_lines)).encode() + b'\n')
for lineno, count, line in odd_lines[:30]:
    sys.stdout.buffer.write(b'L' + str(lineno).encode() + b' (bt=' + str(count).encode() + b'): ' + line[-50:] + b'\n')
