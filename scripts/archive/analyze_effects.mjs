import fs from 'fs';
import path from 'path';

const dataDir = "C:\\Users\\zerom\\WixossReact\\public\\data";

// Parse CSV
function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const header = lines[0].split(',');
    
    const cardIdIndex = header.indexOf('CardNum');
    const effectTextIndex = header.indexOf('EffectText');
    const burstTextIndex = header.indexOf('BurstText');
    
    const cards = {};
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const parts = lines[i].split(',');
        if (parts.length > cardIdIndex) {
            const cardId = parts[cardIdIndex].trim();
            const effectText = parts[effectTextIndex]?.trim() || '';
            const burstText = parts[burstTextIndex]?.trim() || '';
            if (cardId) {
                cards[cardId] = { effectText, burstText };
            }
        }
    }
    return cards;
}

// Load all CSVs
const csvFiles = [
    'CardData_Sheet1.csv',
    'CardData_Sheet5.csv',
    'CardData_Sheet6.csv',
    'CardData_Variants.csv'
];

let allCards = {};
for (const file of csvFiles) {
    const filepath = path.join(dataDir, file);
    if (fs.existsSync(filepath)) {
        console.log(`Parsing ${file}...`);
        const cards = parseCSV(filepath);
        allCards = { ...allCards, ...cards };
    }
}

// Load JSON
const jsonPath = path.join(dataDir, 'effects_misc.json');
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log(`\nLoaded ${Object.keys(allCards).length} cards from CSV`);
console.log(`Loaded ${Object.keys(json).length} cards from JSON\n`);

// Analyze mismatches
const issues = [];

for (const [cardId, effects] of Object.entries(json)) {
    const csvCard = allCards[cardId];
    if (!csvCard) {
        continue;
    }
    
    const { effectText, burstText } = csvCard;
    if (!effectText || effectText === '-') {
        continue;
    }
    
    // Check for obvious mismatches
    // 1. Power value mismatches
    const powerMatch = effectText.match(/＋(\d+)/);
    if (powerMatch) {
        const csvPower = parseInt(powerMatch[1]);
        const jsonEffect = effects[0];
        if (jsonEffect && jsonEffect.action?.type === 'POWER_MODIFY') {
            const jsonPower = jsonEffect.action?.delta;
            if (jsonPower && jsonPower !== csvPower) {
                issues.push({
                    cardId,
                    problem: `Power mismatch: CSV +${csvPower} vs JSON delta:${jsonPower}`,
                    type: 'power_mismatch',
                    csvEffectText: effectText,
                    jsonDelta: jsonPower,
                    csvPower: csvPower
                });
            }
        }
    }
    
    // 2. Owner/target mismatches
    if (effectText.includes('相手の') && effects[0]?.action?.target?.owner === 'self') {
        issues.push({
            cardId,
            problem: `Owner mismatch: CSV "相手の" (opponent) but JSON owner:self`,
            type: 'owner_mismatch',
            csvEffectText: effectText
        });
    }
    if ((effectText.includes('自分の') || effectText.includes('あなたの')) && effects[0]?.action?.target?.owner === 'opponent') {
        issues.push({
            cardId,
            problem: `Owner mismatch: CSV "自分の/あなたの" (self) but JSON owner:opponent`,
            type: 'owner_mismatch',
            csvEffectText: effectText
        });
    }
    
    // 3. Timing mismatches
    if (effectText.includes('【常】') && effects[0]?.effectType !== 'CONTINUOUS' && effects[0]?.effectType !== 'AUTO') {
        issues.push({
            cardId,
            problem: `EffectType mismatch: CSV "【常】" (continuous) but JSON effectType:${effects[0].effectType}`,
            type: 'timing_mismatch',
            csvEffectText: effectText,
            jsonEffectType: effects[0].effectType
        });
    }
    if (effectText.includes('【起】') && effects[0]?.effectType !== 'ACTIVATED') {
        issues.push({
            cardId,
            problem: `EffectType mismatch: CSV "【起】" (activated) but JSON effectType:${effects[0].effectType}`,
            type: 'timing_mismatch',
            csvEffectText: effectText,
            jsonEffectType: effects[0].effectType
        });
    }
    if (effectText.includes('【自】') && effects[0]?.effectType !== 'AUTO') {
        issues.push({
            cardId,
            problem: `EffectType mismatch: CSV "【自】" (auto) but JSON effectType:${effects[0].effectType}`,
            type: 'timing_mismatch',
            csvEffectText: effectText,
            jsonEffectType: effects[0].effectType
        });
    }
}

// Output results
console.log(`Found ${issues.length} potential issues:\n`);

const grouped = {};
for (const issue of issues) {
    const prob = issue.type;
    if (!grouped[prob]) grouped[prob] = [];
    grouped[prob].push(issue);
}

for (const [type, list] of Object.entries(grouped).sort()) {
    console.log(`\n=== ${type} (${list.length} instances) ===`);
    for (const issue of list.slice(0, 25)) {
        console.log(`${issue.cardId}`);
        console.log(`  ${issue.problem}`);
        if (issue.csvEffectText) console.log(`  CSV: ${issue.csvEffectText.substring(0, 100)}`);
    }
    if (list.length > 25) console.log(`... and ${list.length - 25} more`);
}
