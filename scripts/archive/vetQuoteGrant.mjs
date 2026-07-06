// GRANT_EFFECT/GRANT_LRIG_ABILITY 収穫の機械品質検査（採用候補の選別）
// - 内側効果に STUB/UNKNOWN を含む → 除外
// - 内側 AUTO が ON_PLAY タイミングだが原文引用が「場に出たとき」でない（トリガー未対応フォールバック）→ 除外
// - 旧 curated が STUB（実装済みSTUBの置換＝別id化）→ 除外
// - 「このシグニ/このルリグ」内部参照で target が対象UI選択に化けている疑い → 目視列へ
import * as fs from 'fs';

const fresh = JSON.parse(fs.readFileSync('docs/_held_fresh.json', 'utf8'));
const cur = new Map();
for (const f of fs.readdirSync('public/data').filter(f => f.startsWith('effects_') && f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync('public/data/' + f, 'utf8'));
  for (const [id, effs] of Object.entries(j)) cur.set(id, effs);
}
const rawAll = new Map();
for (const f of fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv')).sort()) {
  for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
    const cols = line.split(',');
    const id = cols[0];
    if (!id || !/^[A-Z]/.test(id) || id === 'CardNum') continue;
    rawAll.set(id, (rawAll.get(id) ?? '') + cols.slice(18).join(','));
  }
}

// GRANT_EFFECT / GRANT_LRIG_ABILITY を含む fresh カードだけ検査
const targets = [];
for (const [id, effs] of Object.entries(fresh)) {
  const s = JSON.stringify(effs);
  if (s.includes('GRANT_EFFECT') || s.includes('GRANT_LRIG_ABILITY')) targets.push(id);
}

const verdicts = [];
for (const id of targets) {
  const effs = fresh[id];
  const flags = [];
  const walk = (a, path) => {
    if (!a || typeof a !== 'object') return;
    if (a.type === 'GRANT_EFFECT') {
      const e = a.effect;
      if (!e) { flags.push('GE:effect未展開(rawText温存)'); return; }
      const es = JSON.stringify(e);
      if (es.includes('"STUB"')) flags.push('GE:内側STUB');
      if (es.includes('"UNKNOWN"')) flags.push('GE:内側UNKNOWN');
      const raw = rawAll.get(id) ?? '';
      if (e.effectType === 'AUTO' && Array.isArray(e.timing) && e.timing[0] === 'ON_PLAY') {
        if (!/場に出たとき/.test(raw)) flags.push('GE:内側ON_PLAYフォールバック疑い');
      }
      // 引用内「このシグニを〜」の自己参照が thisCardOnly なし（任意選択UI化＝誤対象）
      if (/「[^」]*このシグニを(場から)?(バニッシュ|トラッシュ|手札に戻|デッキ)/.test(raw) && !es.includes('thisCardOnly'))
        flags.push('GE:内側このシグニ自己参照がthisCardOnly欠落');
      // 引用内トリガー主語が「対戦相手の…がアタックしたとき」等なのに内側に triggerScope が無い（主語ミス）
      const qm = raw.match(/「【自】：([^、「」]{0,40})(?:が)?アタックしたとき/);
      if (qm && !/^この(シグニ|ルリグ)/.test(qm[1]) && !es.includes('triggerScope'))
        flags.push('GE:内側アタックトリガー主語欠落(triggerScope無し)');
    }
    if (a.type === 'GRANT_LRIG_ABILITY') {
      // 多重引用（「Q1」と「Q2」）の分割失敗＝abilities が壊れる（WXEX2-03型）
      if (a.rawText && /」\s*(と|か)\s*「/.test(a.rawText)) flags.push('GLA:多重引用の分割不全');
      for (const sub of a.abilities ?? []) {
        const es = JSON.stringify(sub);
        if (es.includes('"STUB"')) flags.push('GLA:内側STUB');
        if (es.includes('"UNKNOWN"')) flags.push('GLA:内側UNKNOWN');
        if (sub.effectType === 'AUTO' && Array.isArray(sub.timing) && sub.timing[0] === 'ON_PLAY') {
          const raw = rawAll.get(id) ?? '';
          if (!/場に出たとき/.test(raw)) flags.push('GLA:内側ON_PLAYフォールバック疑い');
        }
        // 引用内トリガー主語が「この…」以外（あなたの/対戦相手の○○が…したとき）なのに sub に triggerScope が無い＝主語ミス/不発
        {
          const raw = rawAll.get(id) ?? '';
          const qm2 = raw.match(/「【自】(?:《[^》]+》)?：([^、「」]{0,40}?)(?:が)?(アタックしたとき|場に出たとき|捨てたとき|バニッシュされたとき)/);
          if (qm2 && !/^この(シグニ|ルリグ|キー)/.test(qm2[1]) && qm2[1] !== '' && !JSON.stringify(sub).includes('triggerScope'))
            flags.push('GLA:内側トリガー主語欠落(triggerScope無し)');
        }
      }
    }
    if (a.steps) a.steps.forEach((x, i) => walk(x, path + '.steps' + i));
    if (a.then) walk(a.then, path + '.then');
    if (a.else) walk(a.else, path + '.else');
    if (a.choices) a.choices.forEach((c, i) => walk(c.action, path + '.c' + i));
  };
  for (const e of effs) walk(e.action, e.effectId);
  // 旧 curated がトップレベル STUB（実装済みSTUB置換の禁止）
  const old = cur.get(id) ?? [];
  const oldStub = old.some(e => e.action?.type === 'STUB' && JSON.stringify(fresh[id]).includes('GRANT_EFFECT'));
  if (oldStub) flags.push('旧curated=STUB(置換禁止)');
  verdicts.push({ id, ok: flags.length === 0, flags: [...new Set(flags)] });
}

const ok = verdicts.filter(v => v.ok).map(v => v.id);
const ng = verdicts.filter(v => !v.ok);
console.log(`検査対象 ${verdicts.length} 枚 → クリーン ${ok.length} / 要目視・除外 ${ng.length}`);
console.log('\n--- クリーン（採用候補） ---');
console.log(ok.join(' '));
console.log('\n--- 除外/要目視 ---');
for (const v of ng) console.log(`${v.id}\t${v.flags.join(' ')}`);
