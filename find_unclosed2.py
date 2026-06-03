"""より正確なパーサーでL913より前の未閉じリテラルを探す"""
import sys

with open('src/engine/effectExecutor.ts', 'rb') as f:
    raw = f.read()

lines = raw.split(b'\n')

# スタックベースのパーサー
# スタック要素: 'sq' (single quote), 'dq' (double quote), 'tmpl' (template), 'expr' (${...})
stack = []

for i, line in enumerate(lines[:912]):
    old_depth = len(stack)
    j = 0
    while j < len(line):
        b = line[j]
        top = stack[-1] if stack else None

        # コメント（スタック外でのみ）
        if not stack and j+1 < len(line) and b == 0x2F and line[j+1] == 0x2F:
            break  # 行コメント
        # テンプレート内のコメントは ... ない

        if top == 'sq':
            if b == 0x5C and j+1 < len(line):
                j += 2; continue
            elif b == 0x27:
                stack.pop()
        elif top == 'dq':
            if b == 0x5C and j+1 < len(line):
                j += 2; continue
            elif b == 0x22:
                stack.pop()
        elif top == 'tmpl':
            if b == 0x5C and j+1 < len(line):
                j += 2; continue
            elif b == 96:  # closing backtick
                stack.pop()
            elif b == 0x24 and j+1 < len(line) and line[j+1] == 0x7B:  # ${
                stack.append('expr')
                j += 2; continue
        elif top == 'expr':
            # expr内: 通常のコードのように
            if b == 0x27:
                stack.append('sq')
            elif b == 0x22:
                stack.append('dq')
            elif b == 96:
                stack.append('tmpl')
            elif b == 0x7B:  # {  (nested object/block)
                stack.append('brace')
            elif b == 0x7D:  # }  closes expr or brace
                if top == 'expr':
                    stack.pop()
        elif top == 'brace':
            if b == 0x27:
                stack.append('sq')
            elif b == 0x22:
                stack.append('dq')
            elif b == 96:
                stack.append('tmpl')
            elif b == 0x7B:
                stack.append('brace')
            elif b == 0x7D:
                stack.pop()
        else:  # top is None (normal code)
            if b == 0x27:
                stack.append('sq')
            elif b == 0x22:
                stack.append('dq')
            elif b == 96:
                stack.append('tmpl')
            elif j+1 < len(line) and b == 0x2F and line[j+1] == 0x2F:
                break  # line comment

        j += 1

    if len(stack) != old_depth:
        sys.stdout.buffer.write(b'L' + str(i+1).encode() + b': stack depth ' + str(old_depth).encode() + b' -> ' + str(len(stack)).encode() + b' ' + str(stack[-3:]).encode() + b'\n')

    if len(stack) > 0 and i >= 890:
        sys.stdout.buffer.write(b'  L' + str(i+1).encode() + b' end: ' + str(stack[-3:]).encode() + b'\n')

sys.stdout.buffer.write(b'Final stack: ' + str(stack).encode() + b'\n')
