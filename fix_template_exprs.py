"""
テンプレートリテラル内の ${expr} で $ が脱落しているケース ({expr}) を修正する。
"""
import sys
import re

with open('src/engine/effectExecutor.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# テンプレートリテラル内の {identifier} を ${identifier} に修正
# ただし、コード文脈での { は変更しない

# パターン: バッククォート内で {word で始まる（$が前にない場合）
# `...{ident...}...` → `...${ident...}...`

def fix_template_content(match):
    """バッククォートで囲まれたテンプレートリテラルを修正する"""
    full = match.group(0)
    # バッククォート内の内容を取得
    inner = full[1:-1]  # 最初と最後のバッククォートを除く

    # {word で始まる（前が $ でない）パターンを ${word に変換
    # ただし \\{ はスキップ
    def fix_expr(m):
        prev = m.string[m.start()-1] if m.start() > 0 else ''
        if prev == '$' or prev == '\\':
            return m.group(0)
        return '${' + m.group(1)

    fixed_inner = re.sub(r'\{([a-zA-Z_$][a-zA-Z0-9_.$?\[\]]*)', fix_expr, inner)
    if fixed_inner != inner:
        return '`' + fixed_inner + '`'
    return full

# テンプレートリテラルを全て処理（ネストなし前提の簡易版）
# バッククォートで囲まれた範囲を検索
new_content = re.sub(r'`[^`]*`', fix_template_content, content)

if new_content != content:
    diff_count = sum(1 for a, b in zip(content.split('\n'), new_content.split('\n')) if a != b)
    sys.stdout.write(f'Fixed lines: {diff_count}\n')
    with open('src/engine/effectExecutor.ts', 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(new_content)
    sys.stdout.write('Done\n')
else:
    sys.stdout.write('No changes needed\n')
