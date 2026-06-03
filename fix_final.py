"""
最終修正: テンプレートリテラル内の迷子な ( ) を除去し、
関数呼び出しの括弧バランスを修正する。
"""
import sys
import re

with open('src/engine/effectExecutor.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

result = []
fixed = 0

for i, line in enumerate(lines):
    new_line = list(line)
    changed = False

    # テンプレートリテラルを解析して、リテラルテキスト部分の () を除去
    in_template = False
    in_expr = 0
    in_sq = False
    in_dq = False
    j = 0
    output = []

    while j < len(line):
        c = line[j]

        if not in_template and not in_sq and not in_dq:
            if c == '`':
                in_template = True
                output.append(c)
                j += 1
                continue
            elif c == "'":
                in_sq = True
                output.append(c)
                j += 1
                continue
            elif c == '"':
                in_dq = True
                output.append(c)
                j += 1
                continue
            output.append(c)
            j += 1
            continue

        if in_sq:
            if c == '\\' and j + 1 < len(line):
                output.append(c)
                output.append(line[j+1])
                j += 2
                continue
            elif c == "'":
                in_sq = False
            output.append(c)
            j += 1
            continue

        if in_dq:
            if c == '\\' and j + 1 < len(line):
                output.append(c)
                output.append(line[j+1])
                j += 2
                continue
            elif c == '"':
                in_dq = False
            output.append(c)
            j += 1
            continue

        if in_template:
            if in_expr > 0:
                if c == '{':
                    in_expr += 1
                elif c == '}':
                    in_expr -= 1
                output.append(c)
                j += 1
                continue
            else:
                # テンプレートリテラルのテキスト部分
                if c == '`':
                    in_template = False
                    output.append(c)
                    j += 1
                    continue
                elif c == '$' and j + 1 < len(line) and line[j+1] == '{':
                    in_expr = 1
                    output.append('${')
                    j += 2
                    continue
                elif c in '()':
                    # 迷子な括弧を除去
                    j += 1
                    changed = True
                    continue
                output.append(c)
                j += 1
                continue

        j += 1

    new_line_str = ''.join(output)

    # さらに: done(addLog(..., `text`); → done(addLog(..., `text`));
    # パターン: done( ... , `text`);\n の場合、);\n を ));\n に
    if changed or new_line_str != line:
        # 括弧のバランスをチェック
        open_count = new_line_str.count('(')
        close_count = new_line_str.count(')')
        # テンプレート内は既に除去済みなので、
        # addLog系: done(addLog(xxx, `text`);  では ( が2個多くなる
        # ただし実際の行は多様なので単純チェックのみ
        result.append(new_line_str)
        fixed += 1
    else:
        result.append(line)

# 関数呼び出しの欠けた ) を修正
# パターン: done(addLog(... `text`); → done(addLog(... `text`));
final_result = []
for line in result:
    # done(addLog(..., `text`); のパターン（末尾が `); の行）
    # done( と addLog( が開いていて、`); で閉じている場合 `)); に
    stripped = line.rstrip('\r\n')
    ending = line[len(stripped):]

    if stripped.endswith('`);') and 'done(addLog(' in stripped:
        # done(addLog( の括弧が閉じていないか確認
        # done(addLog(... を含む行で `); で終わる場合は `)); に変換
        new_stripped = stripped[:-2] + '`));'
        final_result.append(new_stripped + ending)
        fixed += 1
    elif stripped.endswith('`),') and 'addLog(' in stripped:
        # similar for , ending
        new_stripped = stripped[:-2] + '`),'
        final_result.append(new_stripped + ending)
    else:
        final_result.append(line)

sys.stdout.write(f'Fixed: {fixed} lines\n')

with open('src/engine/effectExecutor.ts', 'w', encoding='utf-8', newline='\r\n') as f:
    f.writelines(final_result)
sys.stdout.write('Done\n')
