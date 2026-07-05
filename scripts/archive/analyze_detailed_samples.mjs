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
    const burstTextIndex = header.indexOf('BurstText');
    
    const cards = {};
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const parts = lines[i].split(',');
        if (parts.length > cardIdIndex) {
            const cardId = parts[cardIdIndex].trim();
            const cardName = parts[cardNameIndex]?.trim() || '';
            const effectText = parts[effectTextIndex]?.trim() || '';
            const burstText = parts[burstTextIndex]?.trim() || '';
            if (cardId) {
                cards[cardId] = { cardName, effectText, burstText };
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

// Sample specific issues
const sampleCards = [
    'WD01-009',  // Owner mismatch
    'WD01-008',  // Timing mismatch
    'WDK05-R01', // Timing mismatch
    'WDK05-T01', // Timing mismatch
];

console.log('DETAILED SAMPLE ANALYSIS\n');

for (const cardId of sampleCards) {
    const csvCard = allCards[cardId];
    const jsonCard = json[cardId];
    
    if (!csvCard || !jsonCard) {
        console.log(`${cardId}: Not found in CSV or JSON\n`);
        continue;
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`CARD: ${cardId} - ${csvCard.cardName}`);
    console.log('='.repeat(80));
    
    console.log(`\nCSV EFFECT TEXT:`);
    console.log(csvCard.effectText);
    
    console.log(`\nJSON STRUCTURE (First effect):`);
    const firstEffect = jsonCard[0];
    console.log(JSON.stringify(firstEffect, null, 2).substring(0, 1500));
    
    // Analyze
    console.log(`\nANALYSIS:`);
    
    // Check timing
    if (csvCard.effectText.includes('【常】')) {
        console.log(`- CSV: 【常】 (CONTINUOUS)`);
        console.log(`- JSON: ${firstEffect.effectType}`);
        if (firstEffect.effectType !== 'CONTINUOUS' && firstEffect.effectType !== 'AUTO') {
            console.log(`  ERROR: Timing type mismatch!`);
        }
    }
    if (csvCard.effectText.includes('【起】')) {
        console.log(`- CSV: 【起】 (ACTIVATED)`);
        console.log(`- JSON: ${firstEffect.effectType}`);
        if (firstEffect.effectType !== 'ACTIVATED') {
            console.log(`  ERROR: Should be ACTIVATED!`);
        }
    }
    if (csvCard.effectText.includes('【自】')) {
        console.log(`- CSV: 【自】 (AUTO)`);
        console.log(`- JSON: ${firstEffect.effectType}`);
        if (firstEffect.effectType !== 'AUTO') {
            console.log(`  ERROR: Should be AUTO!`);
        }
    }
    
    // Check owner
    if (firstEffect.action?.target) {
        const hasOpponent = csvCard.effectText.includes('相手');
        const hasSelf = csvCard.effectText.includes('あなたの') || csvCard.effectText.includes('自分の');
        const jsonOwner = firstEffect.action.target.owner;
        console.log(`- CSV target: ${hasOpponent ? '相手 (opponent)' : ''} ${hasSelf ? 'あなた/自分 (self)' : ''}`);
        console.log(`- JSON owner: ${jsonOwner}`);
        if ((hasOpponent && jsonOwner === 'self') || (hasSelf && jsonOwner === 'opponent')) {
            console.log(`  ERROR: Owner mismatch!`);
        }
    }
}
