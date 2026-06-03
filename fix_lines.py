"""特定行の修正"""
import sys

with open('src/engine/effectExecutor.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

fixes = {
    # L913
    912: "            return done(addLog(cur, `${reqClassOTEC || 'カード'}OPTIONAL_TRASH_ENERGY_CLASS`));\n",
    # L915
    914: "          const toHandOTEC = !!(txtOTEC.match(/それを手札に加える/) || conditional.then.type === 'TRANSFER_TO_HAND');\n",
}

for idx, new_line in fixes.items():
    sys.stdout.write(f'L{idx+1}: {repr(lines[idx][:60])} -> {repr(new_line[:60])}\n')
    lines[idx] = new_line

with open('src/engine/effectExecutor.ts', 'w', encoding='utf-8', newline='\r\n') as f:
    f.writelines(lines)
sys.stdout.write('Done\n')
