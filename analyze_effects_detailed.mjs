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
    
    // 2. Owner/target mismatches (checking for "相手の" vs "自分の/あなたの" mismatch)
    const hasOpponentTarget = effectText.includes('相手');
    const hasSelfTarget = effectText.includes('あなたの') || effectText.includes('自分の');
    
    if (effects[0]?.action?.target) {
        const target = effects[0].action.target;
        if (hasOpponentTarget && target.owner === 'self') {
            issues.push({
                cardId,
                problem: `Owner mismatch: CSV targets opponent but JSON owner:self`,
                type: 'owner_mismatch',
                csvEffectText: effectText,
                expectedOwner: 'opponent',
                actualOwner: 'self'
            });
        }
        if (hasSelfTarget && target.owner === 'opponent') {
            issues.push({
                cardId,
                problem: `Owner mismatch: CSV targets self/あなた but JSON owner:opponent`,
                type: 'owner_mismatch',
                csvEffectText: effectText,
                expectedOwner: 'self',
                actualOwner: 'opponent'
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
            cardId,
            problem: `EffectType mismatch: CSV "【常】" but JSON effectType:${effectType}`,
            type: 'timing_mismatch',
            csvEffectText: effectText,
            expectedType: 'CONTINUOUS or AUTO',
            actualType: effectType
        });
    }
    if (hasActivated && effectType !== 'ACTIVATED') {
        issues.push({
            cardId,
            problem: `EffectType mismatch: CSV "【起】" but JSON effectType:${effectType}`,
            type: 'timing_mismatch',
            csvEffectText: effectText,
            expectedType: 'ACTIVATED',
            actualType: effectType
        });
    }
    if (hasAuto && effectType !== 'AUTO') {
        issues.push({
            cardId,
            problem: `EffectType mismatch: CSV "【自】" but JSON effectType:${effectType}`,
            type: 'timing_mismatch',
            csvEffectText: effectText,
            expectedType: 'AUTO',
            actualType: effectType
        });
    }
}

// Output detailed results
const grouped = {};
for (const issue of issues) {
    const prob = issue.type;
    if (!grouped[prob]) grouped[prob] = [];
    grouped[prob].push(issue);
}

console.log('============================================');
console.log('EFFECTS_MISC.JSON VALIDATION REPORT');
console.log('============================================\n');

console.log(`Total issues found: ${issues.length}`);
console.log(`Total JSON cards: ${Object.keys(json).length}`);
console.log(`Coverage: ${(((Object.keys(json).length - issues.length) / Object.keys(json).length) * 100).toFixed(1)}% pass rate\n`);

// Owner mismatches - most critical
if (grouped['owner_mismatch']) {
    const list = grouped['owner_mismatch'];
    console.log(`\n[${'CRITICAL'}] Owner/Target Mismatches: ${list.length} cards`);
    console.log('  These affect game logic for attack/defense targets!\n');
    for (const issue of list.slice(0, 30)) {
        console.log(`  ${issue.cardId}`);
        console.log(`    Expected: ${issue.expectedOwner}, Got: ${issue.actualOwner}`);
        console.log(`    CSV: ${issue.csvEffectText.substring(0, 120)}`);
        if (issue.csvEffectText.length > 120) console.log('      ...');
    }
    if (list.length > 30) console.log(`  ... and ${list.length - 30} more owner mismatches`);
}

// Timing mismatches
if (grouped['timing_mismatch']) {
    const list = grouped['timing_mismatch'];
    console.log(`\n[${'CRITICAL'}] EffectType/Timing Mismatches: ${list.length} cards`);
    console.log('  These affect when effects can be used!\n');
    const byType = {};
    for (const issue of list) {
        const key = `${issue.expectedType} vs ${issue.actualType}`;
        if (!byType[key]) byType[key] = [];
        byType[key].push(issue);
    }
    for (const [desc, items] of Object.entries(byType)) {
        console.log(`  ${desc}: ${items.length} cards`);
        for (const issue of items.slice(0, 5)) {
            console.log(`    ${issue.cardId}`);
        }
        if (items.length > 5) console.log(`    ... and ${items.length - 5} more`);
    }
}

// Power mismatches
if (grouped['power_mismatch']) {
    const list = grouped['power_mismatch'];
    console.log(`\n[${'HIGH'}] Power Value Mismatches: ${list.length} cards`);
    for (const issue of list) {
        console.log(`  ${issue.cardId}`);
        console.log(`    Expected: +${issue.csvPower}, Got: ${issue.jsonDelta}`);
        console.log(`    CSV: ${issue.csvEffectText.substring(0, 100)}`);
    }
}

console.log('\n============================================');
console.log('SUMMARY');
console.log('============================================');
for (const [type, list] of Object.entries(grouped).sort()) {
    console.log(`${type}: ${list.length} issues`);
}
