"""Line 868 の壊れた regex を修正する"""
import sys

with open('src/engine/effectExecutor.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 868 (index 867) を置換
old = lines[867]
# 全角ASCII文字をマッチするregexに修正
new = '          const toHWTOSOC = (s: string) => s.replace(/[\\uFF01-\\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));\n'
lines[867] = new
sys.stdout.write('Replaced L868\n')

with open('src/engine/effectExecutor.ts', 'w', encoding='utf-8', newline='\r\n') as f:
    f.writelines(lines)
sys.stdout.write('Done\n')
