import { describe, it, expect, vi } from 'vitest';
import { createSupabaseClient, createServerSupabaseClient, supabase, supabaseAdmin } from '../src/supabase/client';

describe('Supabase Client Factories', () => {
  it('createSupabaseClient should return the anon client', () => {
    const client = createSupabaseClient();
    expect(client).toBe(supabase);
  });

  it('createServerSupabaseClient should return the admin client', () => {
    const client = createServerSupabaseClient();
    expect(client).toBe(supabaseAdmin);
  });
});
