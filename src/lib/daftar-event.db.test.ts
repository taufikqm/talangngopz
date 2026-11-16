// Uji layar Event terhadap Supabase nyata, sesi akun uji C dan D (kunci anon + RLS), tanpa service_role.
// Hanya porsi belum_bayar: tidak ada perubahan status, jadi tidak ada payment_events dan seluruh
// data uji bisa dihapus. Tanggal uji 2099 supaya masuk 50 event terbaru walau akun uji punya ratusan event sisa.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { muatDaftarEvent } from './daftar-event';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

try {
  process.loadEnvFile('.env.local');
} catch {
  // Lingkungan CI boleh menyuntik variabel langsung tanpa berkas.
}

type Sesi = { db: SupabaseClient; uid: string };

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`Variabel lingkungan ${nama} belum diisi`);
  return nilai;
}

const PENANDA = `uji-daftar-event-${Date.now()}`;

async function masuk(label: 'C' | 'D'): Promise<Sesi> {
  const db = createClient(wajib('NEXT_PUBLIC_SUPABASE_URL'), wajib('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let percobaan = 1; ; percobaan++) {
    const { data, error } = await db.auth.signInWithPassword({
      email: wajib(`TEST_${label}_EMAIL`),
      password: wajib(`TEST_${label}_PASSWORD`),
    });
    if (!error && data.user) return { db, uid: data.user.id };
    if (percobaan >= 3) throw new Error(`Masuk sebagai ${label} gagal: ${error?.message}`);
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

let C: Sesi;
let D: Sesi;
const anggota: Record<string, string> = {};
const eventDibuat: { db: SupabaseClient; id: string }[] = [];
const idEvent: Record<string, string> = {};

async function buatEvent(s: Sesi, nama: string, tanggal: string, isi: Record<string, number>) {
  const total = Object.values(isi).reduce((a, b) => a + b, 0);
  const ev = await s.db.from('events').insert({ payer_id: s.uid, judul: `${PENANDA}-${nama}`, tanggal, subtotal: total, total }).select('id').single();
  expect(ev.error).toBeNull();
  const id = String(ev.data?.id);
  eventDibuat.push({ db: s.db, id });
  idEvent[nama] = id;
  const baris = await s.db.from('shares').insert(Object.entries(isi).map(([k, t]) => ({ event_id: id, member_id: anggota[k], subtotal: t, total: t })));
  expect(baris.error).toBeNull();
}

beforeAll(async () => {
  C = await masuk('C');
  D = await masuk('D');
  const { data, error } = await C.db
    .from('members')
    .insert(['budi', 'citra', 'milikD'].map((k) => ({ nama_panggilan: `${PENANDA}-${k}` })))
    .select('id, nama_panggilan');
  expect(error).toBeNull();
  for (const r of data ?? []) anggota[String(r.nama_panggilan).slice(PENANDA.length + 1)] = String(r.id);
  await buatEvent(C, 'lama', '2099-01-01', { budi: 20_000, citra: 10_000 });
  await buatEvent(C, 'baru', '2099-01-02', { budi: 15_000 });
  await buatEvent(D, 'bakso', '2099-01-01', { milikD: 12_000 });
});

afterAll(async () => {
  if (!C) return;
  const galat: string[] = [];
  // Dihapus oleh pemiliknya: RLS menghapus 0 baris tanpa galat bila penalang lain yang mencoba.
  for (const { db, id } of eventDibuat) {
    const { error } = await db.from('events').delete().eq('id', id);
    if (error) galat.push(`events: ${error.code} ${error.message}`);
  }
  for (const id of Object.values(anggota)) {
    const { error } = await C.db.from('members').delete().eq('id', id);
    if (error) galat.push(`members: ${error.code} ${error.message}`);
  }
  await C.db.auth.signOut();
  await D?.db.auth.signOut();
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
});

describe('daftar event penalang C', () => {
  it('memuat event miliknya, terbaru dulu, dengan hitungan porsi dan status', async () => {
    const daftar = await muatDaftarEvent(C.db, C.uid);
    const milikUji = daftar.filter((e) => e.judul.startsWith(PENANDA));
    expect(milikUji.map((e) => e.id)).toEqual([idEvent.baru, idEvent.lama]);
    expect(milikUji[0]).toMatchObject({ total: 15_000, jumlahPorsi: 1, jumlahLunas: 0, status: 'belum_bayar' });
    expect(milikUji[1]).toMatchObject({ total: 30_000, jumlahPorsi: 2, jumlahLunas: 0, status: 'belum_bayar' });
  });

  it('tidak memuat event penalang D', async () => {
    const daftar = await muatDaftarEvent(C.db, C.uid);
    expect(daftar.map((e) => e.id)).not.toContain(idEvent.bakso);
  });
});

describe('penalang D tidak mendapat event C', () => {
  it('daftar D memuat event D saja', async () => {
    const daftar = await muatDaftarEvent(D.db, D.uid);
    expect(daftar.map((e) => e.id)).toContain(idEvent.bakso);
    expect(daftar.map((e) => e.id)).not.toContain(idEvent.baru);
    expect(daftar.map((e) => e.id)).not.toContain(idEvent.lama);
  });

  it('D memalsukan payer_id C: kosong', async () => {
    expect(await muatDaftarEvent(D.db, C.uid)).toEqual([]);
  });
});
