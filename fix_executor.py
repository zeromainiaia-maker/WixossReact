"""
effectExecutor.ts の閉じバッククォートが消えている行を一括修正するスクリプト。
バッククォートが奇数個の行で、行末が ); または ), の場合、直前にバッククォートを挿入する。
"""

with open('src/engine/effectExecutor.ts', 'rb') as f:
    raw = f.read()

bt = 96  # backtick 0x60
lines = raw.split(b'\n')
fixed_count = 0
result_lines = []

for i, line in enumerate(lines):
    bt_count = line.count(bytes([bt]))
    if bt_count % 2 == 1:
        stripped = line.rstrip(b'\r\n')
        appended = line[len(stripped):]  # CR/LF部分
        if stripped.endswith(b');'):
            fixed_line = stripped[:-2] + bytes([bt]) + b');' + appended
            result_lines.append(fixed_line)
            fixed_count += 1
            print(f'Fixed L{i+1}: ...{stripped[-40:].decode("utf-8", errors="replace")}')
            continue
        elif stripped.endswith(b'),'):
            fixed_line = stripped[:-2] + bytes([bt]) + b'),' + appended
            result_lines.append(fixed_line)
            fixed_count += 1
            print(f'Fixed L{i+1}: ...{stripped[-40:].decode("utf-8", errors="replace")}')
            continue
        else:
            print(f'SKIP L{i+1} (bt={bt_count}, ends={stripped[-10:]}): needs manual check')
    result_lines.append(line)

print(f'\n合計修正: {fixed_count}行')

with open('src/engine/effectExecutor.ts', 'wb') as f:
    f.write(b'\n'.join(result_lines))
print('書き込み完了')
