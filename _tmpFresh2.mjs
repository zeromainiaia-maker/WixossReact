import fs from 'fs';
const fresh = JSON.parse(fs.readFileSync('docs/_held_fresh.json', 'utf8'));
for (const id of process.argv.slice(2)) {
  console.log('###', id);
  console.log(JSON.stringify(fresh[id]).slice(0, 1200));
}
