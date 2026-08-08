import { createClient } from '@supabase/supabase-js';

type SimpleDatabase = {
  public: {
    Tables: {
      rooms: {
        Row: { id: string };
        Insert: { id?: string };
        Update: { id?: string };
        Relationships: [];
      };
    };
  };
};

const client = createClient<SimpleDatabase>('http', 'key');
client.from('rooms').insert({ id: '123' });
