import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { envSupabasePublik, opsiCookieSesi } from './cookie';

/** Klien dengan sesi pengguna dan kunci anon. Seluruh kuerinya tunduk pada RLS. */
export async function buatKlienServer() {
  const toko = await cookies();
  const { url, kunciAnon } = envSupabasePublik();
  return createServerClient(url, kunciAnon, {
    cookies: {
      getAll: () => toko.getAll(),
      setAll: (daftar) => {
        try {
          for (const { name, value, options } of daftar) {
            toko.set(name, value, opsiCookieSesi(options));
          }
        } catch {
          // Server Component tidak boleh menulis cookie. Penyegaran sesi sudah
          // dikerjakan proxy sebelum halaman dirender, jadi aman diabaikan.
        }
      },
    },
  });
}

export type Penalang = { id: string; email: string; nama: string };

/**
 * Penalang yang sedang masuk, atau null.
 * Sesi Supabase saja tidak cukup: pengguna auth tanpa baris di profiles bukan penalang,
 * dan sesinya diakhiri.
 */
export async function ambilPenalang(): Promise<Penalang | null> {
  const db = await buatKlienServer();
  const { data: klaim } = await db.auth.getClaims();
  const uid = klaim?.claims.sub;
  if (!uid) return null;

  const { data: profil } = await db
    .from('profiles')
    .select('id, email, nama')
    .eq('id', uid)
    .maybeSingle<Penalang>();
  if (!profil) {
    await db.auth.signOut();
    return null;
  }
  return profil;
}
