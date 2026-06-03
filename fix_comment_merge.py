"""
コメント行に実行コードが合流しているケースを検出・修正する。
// で始まる行に、スペース+コードキーワードが含まれている場合、改行を挿入する。
"""
import sys
import re

CODE_KEYWORDS = [b'      if ', b'      const ', b'      function ', b'      return ',
                 b'      for ', b'      let ', b'      var ', b'      while ',
                 b'    if ', b'    const ', b'    function ', b'    return ',
                 b'    for ', b'    let ', b'    var ']

with open('src/engine/effectExecutor.ts', 'rb') as f:
    raw = f.read()

lines = raw.split(b'\n')
result = []
fixed_count = 0

for i, line in enumerate(lines):
    # //コメント行かチェック
    stripped = line.lstrip()
    if not stripped.startswith(b'//'):
        result.append(line)
        continue

    # コメント行にコードキーワードが含まれているか確認
    found_kw_pos = -1
    found_kw = None
    for kw in CODE_KEYWORDS:
        pos = line.find(kw, 5)  # // の後から検索
        if pos > 0:
            if found_kw_pos < 0 or pos < found_kw_pos:
                found_kw_pos = pos
                found_kw = kw

    if found_kw_pos > 0:
        # コメント部分とコード部分に分割
        comment_part = line[:found_kw_pos].rstrip()
        code_part = line[found_kw_pos:]

        # CRがあれば保持
        if comment_part.endswith(b'\r'):
            comment_part = comment_part[:-1]

        result.append(comment_part + b'\r')
        result.append(code_part)
        fixed_count += 1
        sys.stdout.buffer.write(b'Fixed L' + str(i+1).encode() + b': split at "' + found_kw.strip() + b'"\n')
    else:
        result.append(line)

sys.stdout.buffer.write(b'Total fixed: ' + str(fixed_count).encode() + b'\n')

with open('src/engine/effectExecutor.ts', 'wb') as f:
    f.write(b'\n'.join(result))
sys.stdout.buffer.write(b'Done\n')
