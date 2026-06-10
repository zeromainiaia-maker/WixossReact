import { parseSentencePart1 } from './src/data/parsers/parseSentencePart1.ts';
const txt = '対戦相手のシグニ１体を対象とし、ターン終了時まで、それのパワーをこの方法でトラッシュに置いた【チャーム】１枚につき－7000する。';
const r = parseSentencePart1(txt);
console.log(JSON.stringify(r, null, 2));
