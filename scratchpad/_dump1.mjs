import fs from 'fs';
const j = JSON.parse(fs.readFileSync('public/data/effects_WXDi.json', 'utf8'));
const id = process.argv[2] || 'WXDi-P06-004';
const keys = Array.isArray(j) ? null : Object.keys(j).slice(0, 5);
console.log('top keys:', keys);
const c = Array.isArray(j) ? j.find(c => c.cardNum === id) : j[id];
console.log(JSON.stringify(c, null, 1).slice(0, 4000));
