import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Klien service_role. MELEWATI seluruh RLS: setiap kueri wajib membatasi barisnya
 * sendiri (AGENTS.md aturan 8). Jangan pernah mengembalikan klien atau kuncinya ke klien.
 */
export function buatKlienService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const kunci = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !kunci) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi');
  }
  return createClient(url, kunci, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
