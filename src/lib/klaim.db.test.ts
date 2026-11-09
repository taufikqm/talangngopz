// Uji T-07b terhadap Supabase nyata: fungsi buat_klaim dan putuskan_klaim (0004).
// Memakai akun uji C dan D, bukan A dan B: data klaim meninggalkan payment_events yang
// sisip-saja, jadi event dan porsinya tidak pernah bisa dihapus. Uji RLS lama untuk A dan B
// mengandaikan akun itu hanya memuat datanya sendiri.
//
// service_role hanya dipakai untuk rpc('buat_klaim'), jalur yang sama dengan T-09.
// Semua pemeriksaan lain memakai kunci anon dan sesi penalang.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

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

const URL_SUPABASE = wajib('NEXT_PUBLIC_SUPABASE_URL');
const PENANDA = `uji-klaim-${Date.now()}`;
const WAKTU = '2026-11-09T07:20:00Z';

// Galat yang memang diharapkan saat membersihkan: event berklaim terkunci oleh riwayat
// sisip-saja (23514), anggota berporsi terkunci oleh foreign key (23503).
const GALAT_BERSIH_WAJAR = new Set(['23514', '23503']);

type Sesi = { db: SupabaseClient; uid: string };

async function masuk(label: 'C' | 'D'): Promise<Sesi> {
  const db = createClient(URL_SUPABASE, wajib('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let percobaan = 1; ; percobaan++) {
    const { data, error } = await db.auth.signInWithPassword({
      email: wajib(`TEST_${label}_EMAIL`),
      password: wajib(`TEST_${label}_PASSWORD`),
    });
    if (!error && data.user) return { db, uid: data.user.id };
    if (error?.name !== 'AuthRetryableFetchError' || percobaan >= 3) {
      throw new Error(`Masuk sebagai ${label} gagal: ${error?.message}`);
    }
  }
}

let C: Sesi;
let D: Sesi;
let peserta: SupabaseClient;
const anggotaDibuat: string[] = [];
const eventDibuat: { db: SupabaseClient; id: string }[] = [];

/** Event dengan porsi { member_id: total }. Semua porsi disisipkan dalam satu pernyataan. */
async function buatEvent(s: Sesi, akhiran: string, porsi: Record<string, number>): Promise<Record<string, string>> {
  const total = Object.values(porsi).reduce((a, b) => a + b, 0);
  const ev = await s.db
    .from('events')
    .insert({ payer_id: s.uid, judul: `${PENANDA}-${akhiran}`, subtotal: total, total })
    .select('id')
    .single();
  expect(ev.error).toBeNull();
  const eventId = String(ev.data?.id);
  eventDibuat.push({ db: s.db, id: eventId });
  const baris = await s.db
    .from('shares')
    .insert(Object.entries(porsi).map(([member_id, t]) => ({ event_id: eventId, member_id, subtotal: t, total: t })))
    .select('id, member_id');
  expect(baris.error).toBeNull();
  return Object.fromEntries((baris.data ?? []).map((r) => [String(r.member_id), String(r.id)]));
}

const buatKlaim = (member: string, shares: string[]) =>
  peserta.rpc('buat_klaim', { p_member: member, p_shares: shares, p_waktu: WAKTU, p_pengirim: 'BCA a.n. Uji' });

const putuskan = (s: Sesi, klaim: string, keputusan: string, alasan: string | null) =>
  s.db.rpc('putuskan_klaim', { p_claim: klaim, p_keputusan: keputusan, p_alasan: alasan });

async function statusPorsi(s: Sesi, ids: string[]): Promise<string[]> {
  const { data, error } = await s.db.from('shares').select('id, status').in('id', ids);
  expect(error).toBeNull();
  const per = new Map((data ?? []).map((r) => [String(r.id), String(r.status)]));
  return ids.map((id) => per.get(id) ?? 'hilang');
}

async function statusKlaim(s: Sesi, id: string) {
  const { data, error } = await s.db.from('payment_claims').select('status, nominal, alasan_tolak').eq('id', id).single();
  expect(error).toBeNull();
  return data;
}

// Porsi uji. m1 dan m2 anggota; ev1 dan ev2 milik C, ev3 milik D.
let m1 = '';
let m2 = '';
let p1: Record<string, string>;
let p2: Record<string, string>;
let p3: Record<string, string>;
let klaimDua = '';
let klaimTolak = '';

beforeAll(async () => {
  C = await masuk('C');
  D = await masuk('D');
  expect(C.uid).not.toBe(D.uid);
  peserta = createClient(URL_SUPABASE, wajib('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await C.db
    .from('members')
    .insert([{ nama_panggilan: `${PENANDA}-m1` }, { nama_panggilan: `${PENANDA}-m2` }])
    .select('id, nama_panggilan');
  expect(error).toBeNull();
  const id = new Map((data ?? []).map((r) => [String(r.nama_panggilan), String(r.id)]));
  m1 = id.get(`${PENANDA}-m1`) ?? '';
  m2 = id.get(`${PENANDA}-m2`) ?? '';
  anggotaDibuat.push(m1, m2);

  p1 = await buatEvent(C, 'ev1', { [m1]: 12_000, [m2]: 18_000 });
  p2 = await buatEvent(C, 'ev2', { [m1]: 7_000, [m2]: 3_000 });
  p3 = await buatEvent(D, 'ev3', { [m2]: 5_000 });
});

afterAll(async () => {
  if (!C) return;
  const galat: string[] = [];
  for (const { db, id } of eventDibuat) {
    const { error } = await db.from('events').delete().eq('id', id);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`events: ${error.code} ${error.message}`);
  }
  for (const id of anggotaDibuat) {
    const { error } = await C.db.from('members').delete().eq('id', id);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`members: ${error.code} ${error.message}`);
  }
  await C?.db.auth.signOut();
  await D?.db.auth.signOut();
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
});

describe('hak eksekusi buat_klaim', () => {
  it.each(['C', 'D'] as const)('sesi penalang %s (kunci anon) ditolak dengan galat izin', async (label) => {
    const s = label === 'C' ? C : D;
    const { data, error } = await s.db.rpc('buat_klaim', {
      p_member: m1,
      p_shares: [p1[m1]],
      p_waktu: WAKTU,
      p_pengirim: 'BCA a.n. Uji',
    });
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
    expect(await statusPorsi(C, [p1[m1]])).toEqual(['belum_bayar']);
  });
});

describe('buat_klaim', () => {
  it('klaim dua porsi dengan total X menghasilkan nominal = X', async () => {
    const { data, error } = await buatKlaim(m1, [p1[m1], p2[m1]]);
    expect(error).toBeNull();
    klaimDua = String(data);
    expect(await statusKlaim(C, klaimDua)).toEqual({ status: 'menunggu', nominal: 12_000 + 7_000, alasan_tolak: null });
    expect(await statusPorsi(C, [p1[m1], p2[m1]])).toEqual(['menunggu_konfirmasi', 'menunggu_konfirmasi']);
  });

  it('porsi yang sudah ada di klaim menunggu ditolak, tanpa klaim kedua', async () => {
    const { data, error } = await buatKlaim(m1, [p1[m1]]);
    expect(data).toBeNull();
    expect(error?.code).toBe('55000');
    const isi = await C.db.from('payment_claim_shares').select('claim_id').eq('share_id', p1[m1]);
    expect(isi.error).toBeNull();
    expect(isi.data).toEqual([{ claim_id: klaimDua }]);
  });

  it('porsi milik anggota lain ditolak', async () => {
    const { data, error } = await buatKlaim(m1, [p1[m2]]);
    expect(data).toBeNull();
    expect(error?.code).toBe('P0002');
    expect(await statusPorsi(C, [p1[m2]])).toEqual(['belum_bayar']);
  });

  it('klaim campuran dua penalang ditolak', async () => {
    const { data, error } = await buatKlaim(m2, [p2[m2], p3[m2]]);
    expect(data).toBeNull();
    expect(error?.code).toBe('22023');
    expect(await statusPorsi(C, [p2[m2]])).toEqual(['belum_bayar']);
    expect(await statusPorsi(D, [p3[m2]])).toEqual(['belum_bayar']);
  });
});

describe('putuskan_klaim', () => {
  it('oleh penalang lain ditolak; klaim tetap menunggu', async () => {
    const { error } = await putuskan(D, klaimDua, 'konfirmasi', null);
    expect(error?.code).toBe('P0002');
    expect((await statusKlaim(C, klaimDua))?.status).toBe('menunggu');
    expect(await statusPorsi(C, [p1[m1], p2[m1]])).toEqual(['menunggu_konfirmasi', 'menunggu_konfirmasi']);
  });

  it('tolak tanpa alasan ditolak', async () => {
    const { data, error } = await buatKlaim(m2, [p2[m2]]);
    expect(error).toBeNull();
    klaimTolak = String(data);
    for (const alasan of [null, '', '   ']) {
      const hasil = await putuskan(C, klaimTolak, 'tolak', alasan);
      expect(hasil.error?.code).toBe('22023');
    }
    expect((await statusKlaim(C, klaimTolak))?.status).toBe('menunggu');
  });

  it('tolak beralasan: porsi kembali belum_bayar, alasan tersimpan, porsi boleh diklaim lagi', async () => {
    expect((await putuskan(C, klaimTolak, 'tolak', 'Belum masuk di mutasi')).error).toBeNull();
    expect(await statusKlaim(C, klaimTolak)).toMatchObject({ status: 'ditolak', alasan_tolak: 'Belum masuk di mutasi' });
    expect(await statusPorsi(C, [p2[m2]])).toEqual(['belum_bayar']);

    const ulang = await buatKlaim(m2, [p2[m2]]);
    expect(ulang.error).toBeNull();
    expect(ulang.data).not.toBe(klaimTolak);
  });

  it('konfirmasi klaim berisi 2 porsi membuat 2 baris riwayat dengan claim_id sama dan aktor benar', async () => {
    expect((await putuskan(C, klaimDua, 'konfirmasi', null)).error).toBeNull();
    expect(await statusPorsi(C, [p1[m1], p2[m1]])).toEqual(['lunas', 'lunas']);
    expect((await statusKlaim(C, klaimDua))?.status).toBe('dikonfirmasi');

    const { data, error } = await C.db
      .from('payment_events')
      .select('share_id, dari_status, ke_status, aktor, aktor_id, claim_id')
      .eq('claim_id', klaimDua);
    expect(error).toBeNull();
    const urut = (r: { share_id: string }[]) => [...r].sort((a, b) => a.share_id.localeCompare(b.share_id));

    const lunas = urut((data ?? []).filter((r) => r.ke_status === 'lunas'));
    expect(lunas).toHaveLength(2);
    expect(lunas.map((r) => r.share_id)).toEqual([p1[m1], p2[m1]].sort());
    for (const r of lunas) {
      expect(r).toMatchObject({ dari_status: 'menunggu_konfirmasi', aktor: 'penalang', aktor_id: C.uid, claim_id: klaimDua });
    }
    // Klaim yang dibuat peserta juga tercatat dengan aktor peserta dan claim_id yang sama.
    const diklaim = (data ?? []).filter((r) => r.ke_status === 'menunggu_konfirmasi');
    expect(diklaim).toHaveLength(2);
    for (const r of diklaim) expect(r).toMatchObject({ dari_status: 'belum_bayar', aktor: 'peserta', aktor_id: m1 });

    // Pelunasan pertama mengunci event (pemicu 0003).
    const ev = await C.db.from('events').select('terkunci').eq('judul', `${PENANDA}-ev1`).single();
    expect(ev.data).toEqual({ terkunci: true });
  });

  it('klaim yang sudah diputuskan tidak bisa diputuskan lagi', async () => {
    expect((await putuskan(C, klaimDua, 'tolak', 'coba lagi')).error?.code).toBe('55000');
    expect(await statusPorsi(C, [p1[m1], p2[m1]])).toEqual(['lunas', 'lunas']);
  });
});
