import { supabase } from './src/supabase/client';

async function run() {
  const { data, error } = await supabase.from('rooms').insert({
    id: '123',
    name: 'test',
    created_by: 'me'
  } as any);
}
