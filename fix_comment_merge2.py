"""
コメント行にコードが合流しているケースを、より広い条件で検出・修正する。
前回より短いインデントのコードキーワードも含める。
"""
import sys
import re

# スペース数を問わないキーワードパターン
CODE_PATTERNS = [
    rb'\s+if\s*\(',
    rb'\s+const\s+\w',
    rb'\s+function\s+\w',
    rb'\s+return\s+',
    rb'\s+for\s*\(',
    rb'\s+let\s+\w',
    rb'\s+var\s+\w',
    rb'\s+while\s*\(',
]

with open('src/engine/effectExecutor.ts', 'rb') as f:
    raw = f.read()

lines = raw.split(b'\n')
result = []
fixed_count = 0

for i, line in enumerate(lines):
    stripped = line.lstrip()
    if not stripped.startswith(b'//'):
        result.append(line)
        continue

    # コメント行でコードが含まれているか確認
    comment_end = len(line) - len(stripped) + 2  # //の終わり位置
    rest_of_line = line[comment_end:]

    found_kw_pos = -1
    for pattern in CODE_PATTERNS:
        m = re.search(pattern, rest_of_line)
        if m:
            pos = comment_end + m.start()
            if found_kw_pos < 0 or pos < found_kw_pos:
                found_kw_pos = pos

    if found_kw_pos > 0:
        comment_part = line[:found_kw_pos].rstrip()
        code_part = line[found_kw_pos:]
        if comment_part.endswith(b'\r'):
            comment_part = comment_part[:-1]
        result.append(comment_part + b'\r')
        result.append(code_part)
        fixed_count += 1
        sys.stdout.buffer.write(b'Fixed L' + str(i+1).encode() + b'\n')
    else:
        result.append(line)

sys.stdout.buffer.write(b'Total: ' + str(fixed_count).encode() + b'\n')

with open('src/engine/effectExecutor.ts', 'wb') as f:
    f.write(b'\n'.join(result))
sys.stdout.buffer.write(b'Done\n')
