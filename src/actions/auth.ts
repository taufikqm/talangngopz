'use server';

import { gagal, sukses, type Hasil, type Keluar, type Masuk } from '@/lib/contracts';
import { buatKlienServer } from '@/lib/supabase/server';

// Satu pesan untuk semua kegagalan masuk: pesan yang berbeda akan membocorkan
// surel mana yang terdaftar sebagai penalang.
const PESAN_GAGAL_MASUK = 'Surel atau password salah.';
const PESAN_INTERNAL = 'Terjadi kesalahan. Coba lagi sebentar lagi.';

// Risiko yang diterima: signInWithPassword dipanggil dari server, jadi batas laju
// Supabase Auth dihitung per IP server, bukan per penyerang. Tebakan password massal
// bisa ikut mengunci penalang sementara. Ditinjau ulang saat rilis (T-15).
export const masuk: Masuk = async ({ email, password }): Promise<Hasil<null>> => {
  const surel = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const sandi = typeof password === 'string' ? password : '';
  if (!surel || !sandi || surel.length > 254 || sandi.length > 256) {
    return gagal('tidak_berwenang', PESAN_GAGAL_MASUK);
  }

  try {
    const db = await buatKlienServer();
    const { data, error } = await db.auth.signInWithPassword({ email: surel, password: sandi });
    if (error || !data.user) {
      console.error('masuk: ditolak auth', error?.code ?? error?.status ?? 'tanpa pengguna');
      return gagal('tidak_berwenang', PESAN_GAGAL_MASUK);
    }

    // Akun auth tanpa baris di profiles bukan penalang.
    const { data: profil, error: galatProfil } = await db
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle();
    if (galatProfil) throw galatProfil;
    if (!profil) {
      await db.auth.signOut();
      return gagal('tidak_berwenang', PESAN_GAGAL_MASUK);
    }
    return sukses(null);
  } catch (e) {
    console.error('masuk: galat internal', e instanceof Error ? e.message : 'tidak dikenal');
    return gagal('internal', PESAN_INTERNAL);
  }
};

export const keluar: Keluar = async (): Promise<Hasil<null>> => {
  try {
    const db = await buatKlienServer();
    const { error } = await db.auth.signOut();
    if (error) throw error;
    return sukses(null);
  } catch (e) {
    console.error('keluar: galat internal', e instanceof Error ? e.message : 'tidak dikenal');
    return gagal('internal', PESAN_INTERNAL);
  }
};
