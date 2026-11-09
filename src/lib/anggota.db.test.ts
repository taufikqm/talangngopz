// Uji T-05 terhadap Supabase nyata lewat sesi penalang uji A (kunci anon + RLS), bukan
// service_role. Membuktikan tautan lama mati di tingkat basis data dan foreign key
// menolak penghapusan anggota berporsi. Butuh kredensial di .env.local.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { gantiTokenAkses, hapusAnggotaDb, sisipAnggota, ubahAnggota, daftarAnggota } from './anggota';

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

const PENANDA = `uji-anggota-${Date.now()}`;
let db: SupabaseClient;
let uid = '';
const anggotaDibuat: string[] = [];
let eventId = '';

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
  if (eventId) {
    const { error } = await db.from('events').delete().eq('id', eventId);
    if (error) galat.push(`events: ${error.message}`);
  }
  for (const id of anggotaDibuat) {
    const { error } = await db.from('members').delete().eq('id', id);
    if (error) galat.push(`members: ${error.message}`);
  }
  await db.auth.signOut();
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
});

async function buatAnggota(akhiran: string) {
  const a = await sisipAnggota(db, { namaPanggilan: `${PENANDA}-${akhiran}`, whatsapp: '6281234567890' });
  anggotaDibuat.push(a.id);
  return a;
}

async function tokenSekarang(id: string): Promise<string> {
  const { data, error } = await db.from('members').select('access_token').eq('id', id).single();
  expect(error).toBeNull();
  return String(data?.access_token);
}

describe('cabut token lewat sesi penalang', () => {
  it('token lama tidak ada lagi di tabel; token baru berformat default kolom', async () => {
    const a = await buatAnggota('cabut');
    const lama = await tokenSekarang(a.id);
    expect(lama).toMatch(/^[0-9a-f]{64}$/);

    const baru = await gantiTokenAkses(db, a.id);
    expect(baru).toMatch(/^[0-9a-f]{64}$/);
    expect(baru).not.toBe(lama);
    expect(await tokenSekarang(a.id)).toBe(baru);

    // anggota_baca memperlihatkan SEMUA anggota ke penalang, jadi 0 baris di sini
    // berarti token lama benar-benar hilang dari tabel, bukan sekadar tersembunyi RLS.
    const { data, error } = await db.from('members').select('id').eq('access_token', lama);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('anggota yang tidak ada mengembalikan null', async () => {
    expect(await gantiTokenAkses(db, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

describe('hapus dan nonaktifkan lewat sesi penalang', () => {
  it('anggota berporsi ditolak foreign key 23503 dan tetap ada', async () => {
    const a = await buatAnggota('berporsi');
    const ev = await db
      .from('events')
      .insert({ payer_id: uid, judul: PENANDA, subtotal: 10_000, total: 10_000 })
      .select('id')
      .single();
    expect(ev.error).toBeNull();
    eventId = String(ev.data?.id);
    const porsi = await db
      .from('shares')
      .insert({ event_id: eventId, member_id: a.id, subtotal: 10_000, total: 10_000 });
    expect(porsi.error).toBeNull();

    const daftar = await daftarAnggota(db);
    expect(daftar.find((x) => x.id === a.id)?.punyaPorsi).toBe(true);

    await expect(hapusAnggotaDb(db, a.id)).rejects.toMatchObject({ code: '23503' });
    expect(await tokenSekarang(a.id)).toMatch(/^[0-9a-f]{64}$/);

    const nonaktif = await ubahAnggota(db, a.id, { namaPanggilan: a.namaPanggilan, aktif: false });
    expect(nonaktif).toMatchObject({ aktif: false, whatsapp: '6281234567890' });
  });

  it('anggota tanpa porsi terhapus', async () => {
    const a = await buatAnggota('tanpa-porsi');
    expect(await hapusAnggotaDb(db, a.id)).toBe(true);
    const { data } = await db.from('members').select('id').eq('id', a.id);
    expect(data).toEqual([]);
  });
});
