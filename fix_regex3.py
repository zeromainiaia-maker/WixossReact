"""Lines 904,905のregexを修正する"""
import sys

with open('src/engine/effectExecutor.ts', 'rb') as f:
    lines = f.read().split(b'\n')

# L904 (index 903): 全角ASCII変換regex
lines[903] = b"          const toHWOTEC = (s: string) => s.replace(/[\\uFF01-\\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));\r"

# L905 (index 904): カードクラスを抽出するregex - 简化版
# 元は "エナゾーンから(?:あなたの)?(?:《([^《》]+)》)?(?:シグニ|カード)" など
lines[904] = b"          const classMOTEC = txtOTEC.match(/\xe3\x82\xa8\xe3\x83\x8a\xe3\x82\xbe\xe3\x83\xbc\xe3\x83\xb3\xe3\x81\x8b\xe3\x82\x89\xe3\x81\x82(?:\xe3\x81\xaa\xe3\x81\x9f\xe3\x81\xae)?(?:\xe3\x80\x8a([^\xe3\x80\x8a\xe3\x80\x8b]+)\xe3\x80\x8b)?/);\r"

sys.stdout.buffer.write(b'Fixed L904 and L905\n')

with open('src/engine/effectExecutor.ts', 'wb') as f:
    f.write(b'\n'.join(lines))
sys.stdout.buffer.write(b'Done\n')
