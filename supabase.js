import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cxgfxiefczphquulwkat.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4Z2Z4aWVmY3pwaHF1dWx3a2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjY0MTcsImV4cCI6MjA5MTI0MjQxN30.kkRu0roFmNTFT9L7jD43v4NeIPqhv3V8yzUHT2iTCUM'

export const supabase = createClient(supabaseUrl, supabaseKey)