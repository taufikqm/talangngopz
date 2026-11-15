// Uji T-12 terhadap Supabase nyata, sesi akun uji C dan D (kunci anon + RLS), tanpa service_role.
// '@/lib/supabase/server' diganti klien bersesi C atau D, jadi muatDasbor dan pembacaan token
// berjalan dengan auth.uid() penalang asli. Hanya porsi belum_bayar: tidak ada perubahan status,
// jadi tidak ada payment_events dan seluruh data uji bisa dihapus.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

try {
  process.loadEnvFile('.env.local');
} catch {
  // Lingkungan CI boleh menyuntik variabel langsung tanpa berkas.
}

type Sesi = { db: SupabaseClient; uid: string };
let aktif: Sesi | null = null;

vi.mock('@/lib/supabase/server', () => ({
  ambilPenalang: async () => (aktif ? { id: aktif.uid, email: '', nama: '' } : null),
  buatKlienServer: async () => {
    if (!aktif) throw new Error('tanpa sesi');
    return aktif.db;
  },
}));

const { buatTeksTagihan } = await import('./tagihan');
vi.spyOn(console, 'error').mockImplementation(() => {});

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`Variabel lingkungan ${nama} belum diisi`);
  return nilai;
}

const PENANDA = `uji-tagihan-${Date.now()}`;
const SITUS = 'https://talangan-uji.example';

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
const anggota: Record<string, { id: string; token: string }> = {};
const eventDibuat: { db: SupabaseClient; id: string }[] = [];
const situsAsli = process.env.SITE_URL;

async function buatEvent(s: Sesi, nama: string, tanggal: string, isi: Record<string, number>) {
  const total = Object.values(isi).reduce((a, b) => a + b, 0);
  const ev = await s.db.from('events').insert({ payer_id: s.uid, judul: `${PENANDA}-${nama}`, tanggal, subtotal: total, total }).select('id').single();
  expect(ev.error).toBeNull();
  eventDibuat.push({ db: s.db, id: String(ev.data?.id) });
  const baris = await s.db
    .from('shares')
    .insert(Object.entries(isi).map(([k, t]) => ({ event_id: ev.data?.id, member_id: anggota[k].id, subtotal: t, total: t })));
  expect(baris.error).toBeNull();
}

beforeAll(async () => {
  process.env.SITE_URL = SITUS;
  C = await masuk('C');
  D = await masuk('D');
  const { data, error } = await C.db
    .from('members')
    .insert(['budi', 'citra', 'nol', 'milikD'].map((k) => ({ nama_panggilan: `${PENANDA}-${k}` })))
    .select('id, nama_panggilan, access_token');
  expect(error).toBeNull();
  for (const r of data ?? []) anggota[String(r.nama_panggilan).slice(PENANDA.length + 1)] = { id: String(r.id), token: String(r.access_token) };
  await buatEvent(C, 'futsal', '2026-11-05', { budi: 20_000, citra: 10_000, nol: 0 });
  await buatEvent(C, 'kopi', '2026-11-08', { budi: 15_000 });
  await buatEvent(D, 'bakso', '2026-11-02', { milikD: 12_000 });
});

afterAll(async () => {
  aktif = null;
  if (situsAsli === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = situsAsli;
  if (!C) return;
  const galat: string[] = [];
  // Dihapus oleh pemiliknya: RLS menghapus 0 baris tanpa galat bila penalang lain yang mencoba.
  for (const { db, id } of eventDibuat) {
    const { error } = await db.from('events').delete().eq('id', id);
    if (error) galat.push(`events: ${error.code} ${error.message}`);
  }
  for (const { id } of Object.values(anggota)) {
    const { error } = await C.db.from('members').delete().eq('id', id);
    if (error) galat.push(`members: ${error.code} ${error.message}`);
  }
  await C.db.auth.signOut();
  await D?.db.auth.signOut();
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
});

describe('teks tagihan per anggota (sesi C)', () => {
  it('berisi nama, porsi belum bayar bertanggal, total, dan tautan pribadi anggota itu', async () => {
    aktif = C;
    const h = await buatTeksTagihan({ memberId: anggota.budi.id });
    aktif = null;
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.data.teks).toBe(
      [
        `Halo ${PENANDA}-budi, ini tagihan talangan kamu:`,
        `• ${PENANDA}-futsal (5 Nov): Rp20.000`,
        `• ${PENANDA}-kopi (8 Nov): Rp15.000`,
        'Total: Rp35.000',
        `Cek dan bayar di: ${SITUS}/me/${anggota.budi.token}`,
      ].join('\n'),
    );
    // Token milik orang lain tidak boleh ikut.
    expect(h.data.teks).not.toContain(anggota.citra.token);
  });

  it('anggota tanpa porsi belum bayar (hanya Rp0) dan anggota milik penalang lain: tidak ditemukan', async () => {
    aktif = C;
    const nol = await buatTeksTagihan({ memberId: anggota.nol.id });
    const milikD = await buatTeksTagihan({ memberId: anggota.milikD.id });
    const acak = await buatTeksTagihan({ memberId: crypto.randomUUID() });
    aktif = null;
    for (const h of [nol, milikD, acak]) {
      expect(h.ok).toBe(false);
      if (!h.ok) expect(h.kode).toBe('tidak_ditemukan');
    }
  });

  it('memberId bukan uuid: validasi; tanpa sesi: tidak berwenang', async () => {
    aktif = C;
    const rusak = await buatTeksTagihan({ memberId: 'bukan-uuid' });
    aktif = null;
    const tanpaSesi = await buatTeksTagihan({ memberId: anggota.budi.id });
    expect(!rusak.ok && rusak.kode).toBe('validasi');
    expect(!tanpaSesi.ok && tanpaSesi.kode).toBe('tidak_berwenang');
  });

  it('SITE_URL kosong: galat internal berpesan jelas, bukan teks tanpa tautan', async () => {
    delete process.env.SITE_URL;
    aktif = C;
    const h = await buatTeksTagihan({ memberId: anggota.budi.id });
    aktif = null;
    process.env.SITE_URL = SITUS;
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.kode).toBe('internal');
      expect(h.pesan).toBe('Tautan belum bisa dibuat. Hubungi admin.');
    }
  });
});

describe('teks tagihan semua penunggak', () => {
  it('nama dan nominal saja: tidak ada tautan atau token siapa pun; Rp0 dan milik penalang lain tidak ikut', async () => {
    aktif = C;
    const h = await buatTeksTagihan({});
    aktif = null;
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const t = h.data.teks;
    expect(t).toContain(`• ${PENANDA}-budi: Rp35.000`);
    expect(t).toContain(`• ${PENANDA}-citra: Rp10.000`);
    expect(t).not.toContain(`${PENANDA}-nol`);
    expect(t).not.toContain(`${PENANDA}-milikD`);
    expect(t).not.toMatch(/\/me\/|https?:/);
    for (const { token } of Object.values(anggota)) expect(t).not.toContain(token);
  });
});

describe('penalang D tidak mendapat data C', () => {
  it('per anggota C: tidak ditemukan, tidak ada token C yang keluar', async () => {
    aktif = D;
    const h = await buatTeksTagihan({ memberId: anggota.budi.id });
    aktif = null;
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.kode).toBe('tidak_ditemukan');
      expect(JSON.stringify(h)).not.toContain(anggota.budi.token);
    }
  });

  it('semua tagihan D hanya memuat anggota milik D', async () => {
    aktif = D;
    const h = await buatTeksTagihan({});
    aktif = null;
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.data.teks).toContain(`${PENANDA}-milikD`);
    for (const k of ['budi', 'citra', 'nol']) expect(h.data.teks).not.toContain(`${PENANDA}-${k}`);
    expect(h.data.teks).not.toContain(`${PENANDA}-futsal`);
  });
});
