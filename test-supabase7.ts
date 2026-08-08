import { SupabaseClient } from '@supabase/supabase-js';

// If I hover over SupabaseClient, what is the type of Schema?
// In TS, I can force an error to see the required structure:
const client = new SupabaseClient<{ public: { Tables: { rooms: {} } } }>('http://localhost', 'key');
