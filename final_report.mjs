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
                    type: 'power_mismatch',
                    csvText: effectText,
                    detail: `CSV +${csvPower} vs JSON delta:${jsonPower}`,
                    severity: 'HIGH'
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
                type: 'owner_mismatch_wrong_direction',
                csvText: effectText,
                detail: `CSV targets "相手" (opponent) but JSON has owner:self`,
                severity: 'CRITICAL'
            });
        }
        if (hasSelfTarget && target.owner === 'opponent') {
            issues.push({
                cardId, cardName,
                type: 'owner_mismatch_wrong_direction',
                csvText: effectText,
                detail: `CSV targets "あなたの/自分の" (self) but JSON has owner:opponent`,
                severity: 'CRITICAL'
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
            type: 'timing_mismatch',
            csvText: effectText,
            detail: `CSV "【常】" (CONTINUOUS) but JSON effectType:${effectType}`,
            severity: 'CRITICAL'
        });
    }
    if (hasActivated && effectType !== 'ACTIVATED') {
        issues.push({
            cardId, cardName,
            type: 'timing_mismatch',
            csvText: effectText,
            detail: `CSV "【起】" (ACTIVATED) but JSON effectType:${effectType}`,
            severity: 'CRITICAL'
        });
    }
    if (hasAuto && effectType !== 'AUTO') {
        issues.push({
            cardId, cardName,
            type: 'timing_mismatch',
            csvText: effectText,
            detail: `CSV "【自】" (AUTO) but JSON effectType:${effectType}`,
            severity: 'CRITICAL'
        });
    }
}

// Output comprehensive report
const grouped = {};
for (const issue of issues) {
    if (!grouped[issue.type]) grouped[issue.type] = [];
    grouped[issue.type].push(issue);
}

console.log('================================================================================');
console.log('COMPREHENSIVE VALIDATION REPORT: effects_misc.json');
console.log('================================================================================\n');

console.log(`Validation Statistics:`);
console.log(`  Total cards in JSON: ${Object.keys(json).length}`);
console.log(`  Cards with issues: ${issues.length}`);
console.log(`  Pass rate: ${(((Object.keys(json).length - issues.length) / Object.keys(json).length) * 100).toFixed(1)}%\n`);

// Critical Issues
console.log('CRITICAL ISSUES (Game Logic Breaking):\n');

if (grouped['owner_mismatch_wrong_direction']) {
    const list = grouped['owner_mismatch_wrong_direction'];
    console.log(`[OWNER/TARGET MISMATCHES - ${list.length} cards]`);
    console.log('These cause targets to be applied to wrong player!\n');
    for (const issue of list) {
        console.log(`  ${issue.cardId} - ${issue.cardName}`);
        console.log(`    Problem: ${issue.detail}`);
        console.log(`    CSV: ${issue.csvText.substring(0, 100)}${issue.csvText.length > 100 ? '...' : ''}`);
    }
}

if (grouped['timing_mismatch']) {
    const list = grouped['timing_mismatch'];
    console.log(`\n[EFFECT TYPE/TIMING MISMATCHES - ${list.length} cards]`);
    console.log('These affect when effects trigger or how they\'re activated!\n');
    
    // Group by specific mismatch type
    const byMismatch = {};
    for (const issue of list) {
        const key = issue.detail;
        if (!byMismatch[key]) byMismatch[key] = [];
        byMismatch[key].push(issue);
    }
    
    for (const [desc, items] of Object.entries(byMismatch).slice(0, 15)) {
        console.log(`  ${desc} (${items.length} cards)`);
        for (const issue of items.slice(0, 3)) {
            console.log(`    - ${issue.cardId}: ${issue.cardName}`);
        }
        if (items.length > 3) console.log(`    ... and ${items.length - 3} more`);
    }
}

if (grouped['power_mismatch']) {
    const list = grouped['power_mismatch'];
    console.log(`\n[POWER VALUE MISMATCHES - ${list.length} cards]`);
    console.log('These affect card power calculations!\n');
    for (const issue of list) {
        console.log(`  ${issue.cardId}: ${issue.detail}`);
    }
}

console.log('\n\n================================================================================');
console.log('ISSUE BREAKDOWN BY SEVERITY');
console.log('================================================================================\n');

const bySeverity = {};
for (const issue of issues) {
    if (!bySeverity[issue.severity]) bySeverity[issue.severity] = [];
    bySeverity[issue.severity].push(issue);
}

for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
    if (bySeverity[severity]) {
        console.log(`${severity}: ${bySeverity[severity].length} issues`);
    }
}
