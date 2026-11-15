import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { envSupabasePublik } from '@/lib/supabase/cookie';

/**
 * GET /api/cron/keepalive. Dipanggil Vercel Cron (lihat vercel.json), yang otomatis mengirim
 * "Authorization: Bearer $CRON_SECRET". Tujuannya satu kueri ringan per hari supaya proyek
 * Supabase gratis tidak dihentikan karena tidak aktif.
 *
 * Memakai kunci anon, bukan service_role: yang dibutuhkan hanya aktivitas, bukan data, dan
 * rute yang terbuka ke internet tidak boleh memegang kunci yang melewati RLS. RLS membuat
 * hitungan ini 0 tanpa galat; permintaan API dan kuerinya tetap berjalan.
 */

const HEADER = { 'Cache-Control': 'private, no-store' };

function cocok(diberikan: string | null, rahasia: string): boolean {
  if (!diberikan) return false;
  const a = Buffer.from(diberikan);
  const b = Buffer.from(`Bearer ${rahasia}`);
  // timingSafeEqual melempar bila panjangnya beda, jadi panjang dibandingkan lebih dulu.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia) {
    // Tanpa ini "Bearer undefined" atau "Bearer " akan lolos. Catat supaya salah konfigurasi terlihat.
    console.error('keepalive: CRON_SECRET belum diisi');
    return NextResponse.json({ ok: false, pesan: 'Tidak diizinkan.' }, { status: 401, headers: HEADER });
  }
  if (!cocok(request.headers.get('authorization'), rahasia)) {
    return NextResponse.json({ ok: false, pesan: 'Tidak diizinkan.' }, { status: 401, headers: HEADER });
  }

  try {
    const { url, kunciAnon } = envSupabasePublik();
    const db = createClient(url, kunciAnon, { auth: { persistSession: false, autoRefreshToken: false } });
    // Batas waktu: kueri yang menggantung tidak boleh menahan fungsi sampai dihentikan Vercel.
    const { error } = await db
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .abortSignal(AbortSignal.timeout(10_000));
    if (error) throw error;
  } catch (e) {
    const kode = typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : 'tidak_dikenal';
    console.error('keepalive: kueri gagal', kode);
    return NextResponse.json({ ok: false, pesan: 'Terjadi kesalahan.' }, { status: 500, headers: HEADER });
  }
  return NextResponse.json({ ok: true }, { headers: HEADER });
}
