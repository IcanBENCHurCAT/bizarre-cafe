import type { Database } from './src/supabase/types/database.types';

// Let's create a Supabase client manually to see the error.
import { createClient } from '@supabase/supabase-js';

const client = createClient<Database>('http://localhost', 'key');

// Why does this infer never?
const q = client.from('rooms');
const test: string = q;
