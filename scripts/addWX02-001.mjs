import { readFileSync, writeFileSync } from 'fs';
const json = JSON.parse(readFileSync('./public/data/wel/Sheet1.json', 'utf8'));
const csv = readFileSync('./public/data/CardData_Sheet1.csv', 'utf8');

const newEntries = {
  'WX02-001': [
    {
      "effectType": "AUTO",
      "trigger": ["on_play"],
      "cost": { "energy": ["白"] },
      "action": {
        "search": {
          "filter": { "type": "signi" },
          "dest": "hand",
          "count": 1,
          "reveal": true
        }
      }
    },
    {
      "effectType": "ACTIVATED",
      "cost": { "energy": ["白", "赤"] },
      "action": {
        "banish": {
          "owner": "opp",
          "count": 1,
          "filter": { "power_lte": 7000 }
        }
      }
    },
    {
      "effectType": "ACTIVATED",
      "cost": { "energy": ["白", "緑", "無"] },
      "action": {
        "banish": {
          "owner": "opp",
          "count": 1,
          "filter": { "power_gte": 10000 }
        }
      }
    }
  ],
};

const dupes = Object.keys(newEntries).filter(k => json[k]);
if (dupes.length) console.log('WARNING duplicates:', dupes);
Object.assign(json, newEntries);

const csvOrder = csv.split('\n').slice(1).map(l => l.split(',')[0]).filter(Boolean);
const sorted = {};
for (const key of csvOrder) { if (json[key] !== undefined) sorted[key] = json[key]; }
for (const key of Object.keys(json)) { if (sorted[key] === undefined) sorted[key] = json[key]; }

writeFileSync('./public/data/wel/Sheet1.json', JSON.stringify(sorted, null, 2), 'utf8');
console.log('完了:', Object.keys(newEntries).length, '枚 / 合計:', Object.keys(sorted).filter(k=>k!=='_parseError').length);
