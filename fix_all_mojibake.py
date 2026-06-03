"""
effectExecutor.tsの文字化け文字列を修正する包括的スクリプト。
ログメッセージ内の文字化け（非ASCII + 構造的問題）を修正する。

アプローチ：
1. ファイル全体を文字単位でパースし、string/template literalの境界を追跡
2. 問題のある文字列（mojibake + 未閉じ）を修正
"""
import sys
import re

with open('src/engine/effectExecutor.ts', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

original_len = len(content)

# 戦略: 文字化けを含む文字列リテラルを空文字列に置換
# パターン1: 単一引用符文字列でmojibake
# パターン2: テンプレートリテラルでmojibake

# mojibake判定: 非ASCII文字 (code point > 0x7F) が含まれるもの
# ただし、通常のカタカナ/ひらがな/漢字 (>= U+3000) は問題ない場合もある
# 問題なのは:
# - U+7E00-U+7FFF (繝系 CJK)
# - U+EF00-U+EFFF (半角片仮名系)
# - U+FF00-U+FFFF
# - など

# 方針: 文字列リテラル内のすべての非ASCII文字を取り除く
# これにより:
# - 文字化けテキストが除去される
# - ${...} 式は保持される
# - 文字列の閉じ記号の問題も解決

# まず単純なアプローチ: 文字化けパターンを持つ行を修正

lines = content.split('\n')
fixed_lines = []
fix_count = 0

for i, line in enumerate(lines):
    # ASCII文字のみの行はそのまま
    if all(ord(c) < 0x80 or c in '\r\n' for c in line):
        fixed_lines.append(line)
        continue

    # 非ASCII文字を含む行 - string/template literalを処理
    new_line = []
    in_string_sq = False    # 単引用符文字列内
    in_string_dq = False    # 二重引用符文字列内
    in_template = False     # テンプレートリテラル内
    in_line_comment = False # //コメント内
    in_expr = 0             # ${}内のネスト深度

    j = 0
    while j < len(line):
        c = line[j]
        co = ord(c)

        # コメント開始
        if not in_string_sq and not in_string_dq and not in_template and j + 1 < len(line) and line[j:j+2] == '//':
            # コメント残りを除去して終了 (ただしCRLFは保持)
            # コメント行でのmojibakeは除去
            rest = line[j:]
            # mojibakeのないコメント部分のみを保持
            clean_rest = '//' + ''.join(c for c in rest[2:] if ord(c) < 0x80 or c in ' \t\r')
            new_line.append(clean_rest)
            break

        # 文字列/テンプレート外
        if not in_string_sq and not in_string_dq and not in_template:
            if c == "'":
                in_string_sq = True
                new_line.append(c)
                j += 1
                continue
            elif c == '"':
                in_string_dq = True
                new_line.append(c)
                j += 1
                continue
            elif c == '`':
                in_template = True
                new_line.append(c)
                j += 1
                continue
            else:
                new_line.append(c)
                j += 1
                continue

        # 単引用符文字列内
        if in_string_sq:
            if c == '\\' and j + 1 < len(line):
                new_line.append(c)
                new_line.append(line[j+1])
                j += 2
                continue
            elif c == "'":
                in_string_sq = False
                new_line.append(c)
                j += 1
                continue
            elif co >= 0x80:
                # mojibake: 除去
                j += 1
                continue
            else:
                new_line.append(c)
                j += 1
                continue

        # 二重引用符文字列内
        if in_string_dq:
            if c == '\\' and j + 1 < len(line):
                new_line.append(c)
                new_line.append(line[j+1])
                j += 2
                continue
            elif c == '"':
                in_string_dq = False
                new_line.append(c)
                j += 1
                continue
            elif co >= 0x80:
                # mojibake: 除去
                j += 1
                continue
            else:
                new_line.append(c)
                j += 1
                continue

        # テンプレートリテラル内
        if in_template:
            if in_expr > 0:
                # ${...} 式内
                if c == '{':
                    in_expr += 1
                    new_line.append(c)
                    j += 1
                    continue
                elif c == '}':
                    in_expr -= 1
                    new_line.append(c)
                    j += 1
                    continue
                else:
                    new_line.append(c)
                    j += 1
                    continue
            else:
                # テンプレート本体
                if c == '\\' and j + 1 < len(line):
                    new_line.append(c)
                    new_line.append(line[j+1])
                    j += 2
                    continue
                elif c == '`':
                    in_template = False
                    new_line.append(c)
                    j += 1
                    continue
                elif c == '$' and j + 1 < len(line) and line[j+1] == '{':
                    in_expr = 1
                    new_line.append('${')
                    j += 2
                    continue
                elif co >= 0x80:
                    # mojibake: 除去
                    j += 1
                    continue
                else:
                    new_line.append(c)
                    j += 1
                    continue

        j += 1

    # 未閉じの文字列を閉じる
    if in_string_sq:
        new_line.append("'")
        fix_count += 1
    elif in_string_dq:
        new_line.append('"')
        fix_count += 1
    elif in_template and in_expr == 0:
        new_line.append('`')
        fix_count += 1

    new_line_str = ''.join(new_line)
    if new_line_str != line:
        fixed_lines.append(new_line_str)
        fix_count += 1
    else:
        fixed_lines.append(line)

result = '\n'.join(fixed_lines)

with open('src/engine/effectExecutor.ts', 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(result)

sys.stdout.write(f'Total lines processed: {len(lines)}\n')
sys.stdout.write(f'Fixes applied: {fix_count}\n')
sys.stdout.write('Done\n')
