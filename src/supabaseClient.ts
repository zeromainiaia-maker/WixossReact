import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dmxomxrdnwbojdypdtvu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRteG9teHJkbndib2pkeXBkdHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MTYyNDMsImV4cCI6MjA5Mzk5MjI0M30.-2CR96PNyoGgiLuf_h0M74pL4ENjIX_shG4lD0Dl8rg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)