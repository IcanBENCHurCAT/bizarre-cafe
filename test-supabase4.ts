import type { Database } from './src/supabase/types/database.types';

type PublicTables = Database['public']['Tables'];
type RoomsTable = PublicTables['rooms'];

// Check if these are never
const row: RoomsTable['Row'] = 'string' as any;
const insert: RoomsTable['Insert'] = 'string' as any;
const update: RoomsTable['Update'] = 'string' as any;
