import fs from 'fs';
import path from 'path';

const dataDir = "C:\\Users\\zerom\\WixossReact\\public\\data";

// Parse CSV
function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const header = lines[0].split(',');
    
    const cardIdIndex = header.indexOf('CardNum');
    const cardNameIndex = header.indexOf('CardName');
    const effectTextIndex = header.indexOf('EffectText');
    
    const cards = {};
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const parts = lines[i].split(',');
        if (parts.length > cardIdIndex) {
            const cardId = parts[cardIdIndex].trim();
            const cardName = parts[cardNameIndex]?.trim() || '';
            const effectText = parts[effectTextIndex]?.trim() || '';
            if (cardId) {
                cards[cardId] = { cardName, effectText };
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
        const cards = parseCSV(filepath);
        allCards = { ...allCards, ...cards };
    }
}

// Load JSON
const jsonPath = path.join(dataDir, 'effects_misc.json');
const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Analyze mismatches
const issues = [];

for (const [cardId, effects] of Object.entries(json)) {
    const csvCard = allCards[cardId];
    if (!csvCard) continue;
    
    const { cardName, effectText } = csvCard;
    if (!effectText || effectText === '-') continue;
    
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
                    cardId, cardName,
                    type: 'POWER_MISMATCH',
                    csvEffect: effectText,
                    problem: `CSV +${csvPower} vs JSON delta:${jsonPower}`,
                    severity: 3
                });
            }
        }
    }
    
    // 2. Owner/target mismatches
    const hasOpponentTarget = effectText.includes('相手');
    const hasSelfTarget = effectText.includes('あなたの') || effectText.includes('自分の');
    
    if (effects[0]?.action?.target) {
        const target = effects[0].action.target;
        if (hasOpponentTarget && target.owner === 'self') {
            issues.push({
                cardId, cardName,
                type: 'OWNER_MISMATCH',
                csvEffect: effectText,
                problem: `CSV targets "相手" but JSON owner:self`,
                severity: 1
            });
        }
        if (hasSelfTarget && target.owner === 'opponent') {
            issues.push({
                cardId, cardName,
                type: 'OWNER_MISMATCH',
                csvEffect: effectText,
                problem: `CSV targets "自分/あなた" but JSON owner:opponent`,
                severity: 1
            });
        }
    }
    
    // 3. Timing mismatches
    const hasConstant = effectText.includes('【常】');
    const hasActivated = effectText.includes('【起】');
    const hasAuto = effectText.includes('【自】');
    
    const effectType = effects[0]?.effectType;
    
    if (hasConstant && effectType !== 'CONTINUOUS' && effectType !== 'AUTO') {
        issues.push({
            cardId, cardName,
            type: 'TIMING_MISMATCH',
            csvEffect: effectText,
            problem: `CSV "【常】" but JSON effectType:${effectType}`,
            severity: 1
        });
    }
    if (hasActivated && effectType !== 'ACTIVATED') {
        issues.push({
            cardId, cardName,
            type: 'TIMING_MISMATCH',
            csvEffect: effectText,
            problem: `CSV "【起】" but JSON effectType:${effectType}`,
            severity: 1
        });
    }
    if (hasAuto && effectType !== 'AUTO') {
        issues.push({
            cardId, cardName,
            type: 'TIMING_MISMATCH',
            csvEffect: effectText,
            problem: `CSV "【自】" but JSON effectType:${effectType}`,
            severity: 1
        });
    }
}

// Sort by severity and type
issues.sort((a, b) => a.severity - b.severity || a.cardId.localeCompare(b.cardId));

// Print as TAB-separated for easy parsing
console.log('CardID\tCardName\tIssueType\tProblem\tCSVEffectText');
for (const issue of issues) {
    const csvText = issue.csvEffect.substring(0, 80).replace(/\t/g, ' ').replace(/\n/g, ' ');
    console.log(`${issue.cardId}\t${issue.cardName}\t${issue.type}\t${issue.problem}\t${csvText}`);
}

console.log(`\n\n=== SUMMARY ===`);
console.log(`Total Issues: ${issues.length}`);
console.log(`Critical Issues: ${issues.filter(i => i.severity <= 1).length}`);
console.log(`High Issues: ${issues.filter(i => i.severity === 2).length}`);
console.log(`Medium Issues: ${issues.filter(i => i.severity === 3).length}`);

const byType = {};
for (const issue of issues) {
    if (!byType[issue.type]) byType[issue.type] = 0;
    byType[issue.type]++;
}
console.log(`\nBy Type:`);
for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
}
