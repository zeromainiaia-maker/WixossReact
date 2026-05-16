import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';
import { parseCardEffects } from '../src/data/effectParser.js';
import type { CardData } from '../src/types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://dmxomxrdnwbojdypdtvu.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRteG9teHJkbndib2pkeXBkdHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTYyNDMsImV4cCI6MjA5Mzk5MjI0M30.-2CR96PNyoGgiLuf_h0M74pL4ENjIX_shG4lD0Dl8rg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// CSV列名 → DBスネークケース変換
function toDbRow(card: CardData) {
  const effects = parseCardEffects(card);
  return {
    card_num:    card.CardNum,
    card_name:   card.CardName,
    img_url:     card.ImgURL ?? '',
    type:        card.Type ?? '',
    card_class:  card.CardClass ?? '',
    color:       card.Color ?? '',
    level:       card.Level ?? '',
    grow_cost:   card.GrowCost ?? '',
    cost:        card.Cost ?? '',
    card_limit:  card.Limit ?? '',
    power:       card.Power ?? '',
    restriction: card.Restriction ?? '',
    team:        card.Team ?? '',
    timing:      card.Timing ?? '',
    guard:       card.Guard ?? '',
    coin:        card.Coin ?? '',
    story:       card.Story ?? '',
    life_burst:  card.LifeBurst ?? '',
    effect_text: card.EffectText ?? '',
    burst_text:  card.BurstText ?? '',
    effects:     effects,
  };
}

async function main() {
  const csvPath = join(__dirname, '../public/data/CardData_Sheet1.csv');
  const raw = readFileSync(csvPath, 'utf-8').replace(/^﻿/, ''); // BOM除去

  const parsed = Papa.parse<CardData>(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
    transform: v => v.trim(),
  });

  const cards = parsed.data.filter(c => c.CardNum);
  console.log(`読み込みカード数: ${cards.length}`);

  const rows = cards.map(toDbRow);

  // 効果パース統計
  const total   = rows.reduce((s, r) => s + (r.effects as unknown[]).length, 0);
  const unknown = rows.reduce((s, r) => s + (r.effects as {action:{type:string}}[]).filter(e => e.action?.type === 'UNKNOWN').length, 0);
  console.log(`効果総数: ${total}  UNKNOWN: ${unknown}  解析率: ${Math.round((total - unknown) / total * 100)}%`);

  // バッチupsert
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('cards').upsert(batch, { onConflict: 'card_num' });
    if (error) {
      console.error(`バッチ ${i}–${i + batch.length - 1} エラー:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`\r${inserted}/${rows.length} cards upserted...`);
  }
  console.log(`\n完了: ${inserted}枚をSupabaseにインポートしました`);
}

main().catch(e => { console.error(e); process.exit(1); });
