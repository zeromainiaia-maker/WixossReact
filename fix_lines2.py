# -*- coding: utf-8 -*-
"""特定行の修正 - UTF-8バイト直接使用"""
import sys

with open('src/engine/effectExecutor.ts', 'rb') as f:
    lines = f.read().split(b'\n')

# L913 (index 912)
lines[912] = b"            return done(addLog(cur, `${reqClassOTEC || '\xe3\x82\xab\xe3\x83\xbc\xe3\x83\x89'}OPTIONAL_TRASH_ENERGY_CLASS`));\r"
# L915 (index 914)
lines[914] = b"          const toHandOTEC = !!(txtOTEC.match(/\xe3\x81\x9d\xe3\x82\x8c\xe3\x82\x92\xe6\x89\x8b\xe6\x9c\xad\xe3\x81\xab\xe5\x8a\xa0\xe3\x81\x88\xe3\x82\x8b/) || conditional.then.type === 'TRANSFER_TO_HAND');\r"

sys.stdout.buffer.write(b'Fixed L913 and L915\n')

with open('src/engine/effectExecutor.ts', 'wb') as f:
    f.write(b'\n'.join(lines))
sys.stdout.buffer.write(b'Done\n')
