"""Lines 904,905のregexをASCIIエスケープで修正"""
import sys

with open('src/engine/effectExecutor.ts', 'rb') as f:
    lines = f.read().split(b'\n')

# L904 (index 903): 全角ASCII変換regex
lines[903] = b"          const toHWOTEC = (s: string) => s.replace(/[\\uFF01-\\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));\r"

# L905 (index 904): カードクラス抽出 - Unicode escapeのみ使用
# 元: エナゾーンから(?:あなたの)?(?:《([^《》]+)》)?
# エ=エ ナ=ナ ゾ=ゾ ー=ー ン=ン か=か ら=ら あ=あ な=な た=た の=の
# 《=《 》=》
lines[904] = b"          const classMOTEC = txtOTEC.match(/\\u30A8\\u30CA\\u30BE\\u30FC\\u30F3\\u304B\\u3089(?:\\u3042\\u306A\\u305F\\u306E)?(?:\\u300A([^\\u300A\\u300B]+)\\u300B)?/);\r"

sys.stdout.buffer.write(b'Fixed L904 and L905\n')

with open('src/engine/effectExecutor.ts', 'wb') as f:
    f.write(b'\n'.join(lines))
sys.stdout.buffer.write(b'Done\n')
