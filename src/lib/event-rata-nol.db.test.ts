// Uji T-07a terhadap Supabase nyata lewat sesi penalang uji A (kunci anon + RLS).
// Membuktikan penyimpanan mode rata yang membuang bagian Rp0 tidak ditolak pemicu
// invarian. Butuh kredensial di .env.local.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buangPorsiNol, porsiRata, urutkanPeserta } from './event';
import { simpanEvent } from './event-db';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

try {
  process.loadEnvFile('.env.local');
} catch {
  // Lingkungan CI boleh menyuntik variabel langsung tanpa berkas.
}

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`Variabel lingkungan ${nama} belum diisi`);
  return nilai;
}

const PENANDA = `uji-rata-nol-${Date.now()}`;
let db: SupabaseClient;
let uid = '';
const anggotaDibuat: string[] = [];
const eventDibuat: string[] = [];

beforeAll(async () => {
  db = createClient(wajib('NEXT_PUBLIC_SUPABASE_URL'), wajib('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let percobaan = 1; ; percobaan++) {
    const { data, error } = await db.auth.signInWithPassword({
      email: wajib('TEST_A_EMAIL'),
      password: wajib('TEST_A_PASSWORD'),
    });
    if (!error && data.user) {
      uid = data.user.id;
      break;
    }
    if (error?.name !== 'AuthRetryableFetchError' || percobaan >= 3) {
      throw new Error(`Masuk sebagai A gagal: ${error?.message}`);
    }
  }
});

afterAll(async () => {
  const galat: string[] = [];
  for (const id of eventDibuat) {
    const { error } = await db.from('events').delete().eq('id', id);
    if (error) galat.push(`events: ${error.message}`);
  }
  for (const id of anggotaDibuat) {
    const { error } = await db.from('members').delete().eq('id', id);
    if (error) galat.push(`members: ${error.message}`);
  }
  await db.auth.signOut();
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
});

async function buatAnggota(n: number) {
  const { data, error } = await db
    .from('members')
    .insert(Array.from({ length: n }, (_, i) => ({ nama_panggilan: `${PENANDA}-${String(i).padStart(2, '0')}`, whatsapp: null, aktif: true })))
    .select('id, nama_panggilan');
  expect(error).toBeNull();
  const baris = (data ?? []).map((r) => ({ id: String(r.id), namaPanggilan: String(r.nama_panggilan) }));
  anggotaDibuat.push(...baris.map((b) => b.id));
  return baris;
}

describe('simpanEvent mode rata dengan peserta bernominal 0', () => {
  it.each([
    ['penalang ikut', true],
    ['penalang tidak ikut', false],
  ])('total 5 untuk 12 peserta (%s): tidak ditolak pemicu, hanya porsi di atas 0, jumlah 5', async (_, ikut) => {
    const peserta = await buatAnggota(12);
    const memberPenalang = ikut ? peserta[7].id : null;
    const urut = urutkanPeserta(peserta, memberPenalang);
    const { porsi, urut: tersisa } = buangPorsiNol(porsiRata(5, urut), urut);

    const hasil = await simpanEvent(db, {
      payerId: uid,
      judul: `${PENANDA}-${ikut ? 'ikut' : 'tidak'}`,
      tanggal: '2026-11-09',
      total: 5,
      mode: 'rata',
      pembulatanKe: tersisa[0].id,
      memberPenalang: tersisa.some((p) => p.id === memberPenalang) ? memberPenalang : null,
      porsi,
    });
    eventDibuat.push(hasil.eventId);

    const { data, error } = await db.from('shares').select('member_id, total, status').eq('event_id', hasil.eventId);
    expect(error).toBeNull();
    expect(data?.map((x) => [x.member_id, Number(x.total), x.status])).toEqual([
      [urut[0].id, 5, ikut ? 'lunas' : 'belum_bayar'],
    ]);
    const { data: ev } = await db.from('events').select('total, terkunci').eq('id', hasil.eventId).single();
    expect(ev).toEqual({ total: 5, terkunci: false });
  });
});
