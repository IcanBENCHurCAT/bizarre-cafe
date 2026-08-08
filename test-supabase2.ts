import { supabase } from './src/supabase/client';

async function run() {
  const queryBuilder = supabase.from('rooms');
  // I will check the type of queryBuilder using a TS error
  const test: string = queryBuilder;
}
