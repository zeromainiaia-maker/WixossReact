import fs from 'fs';
const fresh = JSON.parse(fs.readFileSync('docs/_held_fresh.json', 'utf8'));
for (const id of process.argv.slice(2)) {
  console.log('='.repeat(60));
  console.log('###', id);
  console.log(JSON.stringify(fresh[id], null, 1).slice(0, 5000));
}
