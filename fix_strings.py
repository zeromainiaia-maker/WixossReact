"""
文字化けにより閉じシングルクォートが消えた文字列リテラルを修正する。
対象: 行内のシングルクォートが奇数個で、addLog/label等に使われているもの。
修正方法: )); の直前に ' を挿入する。
"""
import sys

with open('src/engine/effectExecutor.ts', 'rb') as f:
    raw = f.read()

lines = raw.split(b'\n')
fixed_count = 0
result = []

for i, line in enumerate(lines):
    sq_positions = [j for j, b in enumerate(line) if b == 0x27]
    sq_count = len(sq_positions)

    # シングルクォートが奇数個の行
    if sq_count % 2 == 1 and sq_count > 0:
        stripped = line.rstrip(b'\r\n')
        appended = line[len(stripped):]

        # ));  で終わる場合: '); に変換 (文字列 + 関数閉じ2個)
        if stripped.endswith(b'));'):
            fixed = stripped[:-3] + b"'));" + appended
            result.append(fixed)
            fixed_count += 1
            sys.stdout.buffer.write(b'Fixed L' + str(i+1).encode() + b' (->\')); )\n')
            continue
        # ); で終わる場合
        elif stripped.endswith(b');') and not stripped.endswith(b"');") and not stripped.endswith(b'`);'):
            # 最後のシングルクォートの位置の後から ); まで
            # ); の直前に ' を追加
            fixed = stripped[:-2] + b"');" + appended
            result.append(fixed)
            fixed_count += 1
            sys.stdout.buffer.write(b'Fixed L' + str(i+1).encode() + b' (->\'); )\n')
            continue
        # ), で終わる場合
        elif stripped.endswith(b'),') and b"'" not in stripped[-5:-2]:
            fixed = stripped[:-2] + b"')," + appended
            result.append(fixed)
            fixed_count += 1
            sys.stdout.buffer.write(b'Fixed L' + str(i+1).encode() + b' (->\'), )\n')
            continue
        else:
            sys.stdout.buffer.write(b'SKIP L' + str(i+1).encode() + b' sq=' + str(sq_count).encode() + b' ends=' + stripped[-20:] + b'\n')

    result.append(line)

sys.stdout.buffer.write(b'Total fixed: ' + str(fixed_count).encode() + b'\n')

with open('src/engine/effectExecutor.ts', 'wb') as f:
    f.write(b'\n'.join(result))
sys.stdout.buffer.write(b'Done\n')
