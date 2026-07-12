import fs from 'fs';
const effSrc = fs.readFileSync('src/types/effects.ts', 'utf8');
const types = [...effSrc.matchAll(/^\s*type:\s*'([A-Z_]+)';/gm)].map(m => m[1]);
const uniqTypes = [...new Set(types)];
const goldenSrc = fs.readFileSync('scripts/goldenTest.ts', 'utf8');
function isWordChar(ch) { return ch !== undefined && /[A-Za-z0-9_]/.test(ch); }
function hasWholeWord(hay, word) {
  let idx = 0;
  while (true) {
    const i = hay.indexOf(word, idx);
    if (i === -1) return false;
    const before = hay[i - 1];
    const after = hay[i + word.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    idx = i + 1;
  }
}
const uncovered = uniqTypes.filter(t => !hasWholeWord(goldenSrc, t));
console.log('total types:', uniqTypes.length);
console.log('uncovered (' + uncovered.length + '):');
console.log(uncovered.join('\n'));
