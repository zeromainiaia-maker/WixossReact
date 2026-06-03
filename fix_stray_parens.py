"""
テンプレートリテラル内の迷子な ) を修正するスクリプト。
パターン: `${expr})` や `text)` → `${expr}` や `text`
また ); の後に )); を補完する。
"""
import sys
import re

with open('src/engine/effectExecutor.ts', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
result = []
fixed = 0

for i, line in enumerate(lines):
    # テンプレートリテラル内の迷子な ) を検出・修正
    # パターン1: `...)`); → `...`));
    # パターン2: `...)`); の単一閉じ
    new_line = line

    # パターン: バッククォートで始まり ) で終わる部分を修正
    # `${...})` → `${...}`
    # ただし、テンプレートリテラル内の正当な ) (例: ${func()}) は保持
    # 簡単なヒューリスティック: テンプレートが }`) または text`) で終わる場合修正

    # `${expr})` の形を `${expr}` に
    # 具体的には: } に続く ) ` のパターン → } ` に変更
    if re.search(r'\$\{[^}]+\}\)`', new_line) or re.search(r'[^\$\{][^}]*\)`', new_line):
        # }`); → `)); のような変換
        # まず `...)`); → `...)` に
        # 実際: `)` の `)` だけを削除

        # テンプレートリテラルを探して内部の迷子な ) を処理
        def fix_template(m):
            inner = m.group(1)  # バッククォート内の内容
            # 内容の末尾の ) を除去（ただし ${...} の外側にあるもの）
            # シンプルに: 末尾の ) があれば除去
            if inner.endswith(')'):
                return '`' + inner[:-1] + '`'
            return m.group(0)

        # `...)`  パターンを修正
        new_line2 = re.sub(r'`([^`]*\))`', fix_template, new_line)
        if new_line2 != new_line:
            # さらに、閉じ括弧の数を調整
            # addLog(... `text`); → addLog(..., `text`);  正常
            # addLog(... `text`)  → addLog(..., `text`)); 2個必要
            # 元の `)` が関数の閉じ括弧だった場合の補完
            # ); を )); に変換（シンプルケース）
            if new_line2.rstrip().endswith('`);') and new_line.rstrip().endswith('`);'):
                pass  # already correct
            elif re.search(r'done\(addLog\(', new_line2) and new_line2.rstrip().endswith('`);'):
                # done(addLog(..., `text`);  → done(addLog(..., `text`));
                new_line2 = new_line2.rstrip()
                if new_line2.endswith('`);'):
                    new_line2 = new_line2[:-2] + '`));'
            new_line = new_line2
            result.append(new_line)
            fixed += 1
            sys.stdout.write(f'Fixed L{i+1}\n')
            continue

    result.append(new_line)

sys.stdout.write(f'Total: {fixed}\n')

with open('src/engine/effectExecutor.ts', 'w', encoding='utf-8', newline='\r\n') as f:
    f.write('\n'.join(result))
sys.stdout.write('Done\n')
