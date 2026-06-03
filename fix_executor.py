import sys

with open('src/engine/effectExecutor.ts', 'rb') as f:
    raw = f.read()

bt = 96
lines = raw.split(b'\n')
fixed_count = 0
result_lines = []

for i, line in enumerate(lines):
    bt_count = line.count(bytes([bt]))
    if bt_count % 2 == 1:
        stripped = line.rstrip(b'\r\n')
        appended = line[len(stripped):]
        if stripped.endswith(b');'):
            fixed_line = stripped[:-2] + bytes([bt]) + b');' + appended
            result_lines.append(fixed_line)
            fixed_count += 1
            sys.stdout.buffer.write(b'Fixed L' + str(i+1).encode() + b'\n')
            continue
        elif stripped.endswith(b'),'):
            fixed_line = stripped[:-2] + bytes([bt]) + b'),' + appended
            result_lines.append(fixed_line)
            fixed_count += 1
            sys.stdout.buffer.write(b'Fixed L' + str(i+1).encode() + b'\n')
            continue
        else:
            sys.stdout.buffer.write(b'SKIP L' + str(i+1).encode() + b' ends=' + stripped[-10:] + b'\n')
    result_lines.append(line)

sys.stdout.buffer.write(b'Total fixed: ' + str(fixed_count).encode() + b'\n')

with open('src/engine/effectExecutor.ts', 'wb') as f:
    f.write(b'\n'.join(result_lines))
sys.stdout.buffer.write(b'Done\n')
