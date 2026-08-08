import type { Database } from './src/supabase/types/database.types';
import type { GenericSchema } from '@supabase/supabase-js/dist/module/lib/types';
// actually GenericSchema is probably exported from supabase-js somewhere else

import type { SupabaseClient } from '@supabase/supabase-js';

// The issue is whether Database satisfies the constraint for SupabaseClient.
type Client = SupabaseClient<Database>;
// Actually, createClient<Database> requires Database to match a structure.
