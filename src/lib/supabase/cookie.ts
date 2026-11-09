import type { CookieOptions } from '@supabase/ssr';

/** Sesi penalang bertahan 30 hari sejak penyegaran token terakhir. */
export const UMUR_SESI_DETIK = 60 * 60 * 24 * 30;

/**
 * Opsi akhir untuk setiap cookie sesi Supabase.
 *
 * @supabase/ssr menimpa `cookieOptions.maxAge` dengan 400 hari, jadi batas 30 hari
 * hanya bisa ditegakkan di sini, saat cookie benar-benar ditulis.
 * httpOnly aman karena seluruh akses Supabase berjalan di server; tidak ada klien peramban.
 */
export function opsiCookieSesi(asli: CookieOptions): CookieOptions {
  return {
    ...asli,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // maxAge 0 berarti penghapusan cookie (keluar); jangan diubah jadi 30 hari.
    maxAge: asli.maxAge === 0 ? 0 : UMUR_SESI_DETIK,
  };
}

export function envSupabasePublik(): { url: string; kunciAnon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const kunciAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !kunciAnon) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL atau NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi');
  }
  return { url, kunciAnon };
}
