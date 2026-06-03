"""Line 847 の壊れた regex を修正する"""
import sys

with open('src/engine/effectExecutor.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 847 (index 846) を置換
old = lines[846]
new = '          const nameM = txtOHRN.match(/《([^《》]+)》を公開/);\n'
lines[846] = new
sys.stdout.write('Replaced L847\n')

with open('src/engine/effectExecutor.ts', 'w', encoding='utf-8', newline='\r\n') as f:
    f.writelines(lines)
sys.stdout.write('Done\n')
