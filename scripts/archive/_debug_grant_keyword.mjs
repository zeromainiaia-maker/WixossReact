import { parseSentencePart1 } from '../src/data/parsers/parseSentencePart1.ts';
import { parseSentencePart2 } from '../src/data/parsers/parseSentencePart2.ts';
import { parseSentencePart3 } from '../src/data/parsers/parseSentencePart3.ts';
import { parseSentencePart4 } from '../src/data/parsers/parseSentencePart4.ts';

const texts = [
  '次の対戦相手のターンの間、あなたのシグニは【シャドウ】を得る',
  'あなたのシグニは【シャドウ】を得る',
  'このシグニがアタックしたとき、ターン終了時まで、対戦相手の感染状態のすべてのシグニのパワーを－5000する',
  '対戦相手の感染状態のすべてのシグニのパワーを－5000する',
];

for (const t of texts) {
  console.log('\n>>> TEXT:', t);
  const r1 = parseSentencePart1(t);
  if (r1) { console.log('  Part1:', JSON.stringify(r1)); continue; }
  const r2 = parseSentencePart2(t);
  if (r2) { console.log('  Part2:', JSON.stringify(r2)); continue; }
  const r3 = parseSentencePart3(t);
  if (r3) { console.log('  Part3:', JSON.stringify(r3)); continue; }
  const r4 = parseSentencePart4(t);
  if (r4) { console.log('  Part4:', JSON.stringify(r4)); continue; }
  console.log('  UNKNOWN');
}
