"""
effectExecutor.ts の追加修正:
- Line 196: コメントと実行コードが同一行に合流している問題を修正（改行を挿入）
"""
import sys

with open('src/engine/effectExecutor.ts', 'rb') as f:
    raw = f.read()

lines = raw.split(b'\n')

# Line 196 (index 195): コメント + 実行コードを分割
line196 = lines[195]
const_pos = line196.find(b'      const trashField')

if const_pos > 0:
    comment_part = line196[:const_pos].rstrip()
    code_part = line196[const_pos:]
    # コメント行のCRを除去して改行を挿入
    lines[195] = comment_part + b'\r'
    lines.insert(196, code_part)
    sys.stdout.buffer.write(b'Fixed L196: split comment and code\n')
else:
    sys.stdout.buffer.write(b'L196: const not found, skipping\n')

with open('src/engine/effectExecutor.ts', 'wb') as f:
    f.write(b'\n'.join(lines))
sys.stdout.buffer.write(b'Done\n')
