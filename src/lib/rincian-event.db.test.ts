// Uji T-11 terhadap Supabase nyata, sesi akun uji C dan D (kunci anon + RLS), tanpa service_role.
// Aksi penalang memakai '@/lib/supabase/server' yang diganti klien bersesi C atau D, jadi
// putuskan_klaim dan lunasi_tunai berjalan dengan auth.uid() penalang asli. Klaim dibuat lewat
// POST /api/claim. Event yang pernah berubah status tidak bisa dihapus (riwayat sisip-saja),
// jadi sebagian data berpenanda uji-rincian-event-... tetap tinggal di akun C.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
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

const { konfirmasiKlaim, tolakKlaim, tandaiLunasManual } = await import('@/actions/klaim');
const { muatRincianEvent } = await import('./rincian-event');
const { hitungKlaimMenunggu, muatKlaimMenunggu, teksKlaim } = await import('./klaim-penalang');
const { muatDasbor } = await import('./dasbor');
const { hariIni } = await import('./event');
const { POST } = await import('@/app/api/claim/route');
vi.spyOn(console, 'error').mockImplementation(() => {});

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`Variabel lingkungan ${nama} belum diisi`);
  return nilai;
}

const PENANDA = `uji-rincian-event-${Date.now()}`;
const GALAT_BERSIH_WAJAR = new Set(['23514', '23503']);

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
const event: Record<string, string> = {};
const porsi: Record<string, string> = {};
const eventDibuat: string[] = [];
const PENALANG_C = { id: '', nama: 'Penalang C' };

async function buatEvent(nama: string, isi: Record<string, number>) {
  const total = Object.values(isi).reduce((a, b) => a + b, 0);
  const ev = await C.db.from('events').insert({ payer_id: C.uid, judul: `${PENANDA}-${nama}`, tanggal: '2026-11-05', subtotal: total, total }).select('id').single();
  expect(ev.error).toBeNull();
  event[nama] = String(ev.data?.id);
  eventDibuat.push(event[nama]);
  const baris = await C.db
    .from('shares')
    .insert(Object.entries(isi).map(([k, t]) => ({ event_id: ev.data?.id, member_id: anggota[k].id, subtotal: t, total: t })))
    .select('id, member_id');
  expect(baris.error).toBeNull();
  for (const r of baris.data ?? []) {
    const k = Object.keys(anggota).find((x) => anggota[x].id === r.member_id) ?? '?';
    porsi[`${nama}:${k}`] = String(r.id);
  }
}

async function klaimLewatApi(kunciAnggota: string, shareIds: string[]): Promise<string> {
  const waktu = `${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19)}+07:00`;
  const respons = await POST(
    new Request('http://localhost/api/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: anggota[kunciAnggota].token, shareIds, waktuTransfer: waktu, pengirim: 'BCA a.n. Uji' }),
    }),
  );
  const isi = await respons.json();
  expect(isi.ok).toBe(true);
  return isi.data.claimId as string;
}

const statusPorsi = async (id: string) => (await C.db.from('shares').select('status').eq('id', id).single()).data?.status;
const statusKlaim = async (id: string) => (await C.db.from('payment_claims').select('status').eq('id', id).single()).data?.status;

let klaim1 = '';

beforeAll(async () => {
  C = await masuk('C');
  D = await masuk('D');
  PENALANG_C.id = C.uid;
  const { data, error } = await C.db
    .from('members')
    .insert(['budi', 'citra'].map((k) => ({ nama_panggilan: `${PENANDA}-${k}` })))
    .select('id, nama_panggilan, access_token');
  expect(error).toBeNull();
  for (const r of data ?? []) anggota[String(r.nama_panggilan).slice(PENANDA.length + 1)] = { id: String(r.id), token: String(r.access_token) };
  await buatEvent('futsal', { budi: 20_000, citra: 10_000 });
  await buatEvent('kopi', { budi: 15_000 });
  klaim1 = await klaimLewatApi('budi', [porsi['futsal:budi'], porsi['kopi:budi']]);
});

afterAll(async () => {
  aktif = null;
  if (!C) return;
  const galat: string[] = [];
  for (const id of eventDibuat) {
    const { error } = await C.db.from('events').delete().eq('id', id);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`events: ${error.code} ${error.message}`);
  }
  for (const { id } of Object.values(anggota)) {
    const { error } = await C.db.from('members').delete().eq('id', id);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`members: ${error.code} ${error.message}`);
  }
  await C.db.auth.signOut();
  await D?.db.auth.signOut();
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
});

describe('penalang C melihat rincian dan klaim miliknya', () => {
  it('rincian event: porsi urut nama, klaim lintas event tampil dengan semua event isinya', async () => {
    const r = await muatRincianEvent(C.db, PENALANG_C, event.futsal, hariIni());
    if (!r) throw new Error('rincian null');
    expect(r.judul).toBe(`${PENANDA}-futsal`);
    expect(r.terkunci).toBe(false);
    expect(r.porsi.map((p) => [p.nama, p.total, p.status])).toEqual([
      [`${PENANDA}-budi`, 20_000, 'menunggu_konfirmasi'],
      [`${PENANDA}-citra`, 10_000, 'belum_bayar'],
    ]);
    expect(r.klaim).toHaveLength(1);
    expect(r.klaim[0]).toMatchObject({ id: klaim1, nominal: 35_000, pengirim: 'BCA a.n. Uji' });
    expect(r.klaim[0].untuk).toEqual([`${PENANDA}-futsal`, `${PENANDA}-kopi`]);
    expect(teksKlaim(r.klaim[0])).toBe(
      `${PENANDA}-budi · Rp35.000 · ${r.klaim[0].waktu} · BCA a.n. Uji · untuk ${PENANDA}-futsal, ${PENANDA}-kopi`,
    );
    // Klaim yang sama tampil juga di event kedua: keputusannya berlaku untuk seluruh klaim.
    const kopi = await muatRincianEvent(C.db, PENALANG_C, event.kopi, hariIni());
    expect(kopi?.klaim.map((k) => k.id)).toEqual([klaim1]);
    expect(r.riwayat.map((x) => x.teks)).toEqual([`${PENANDA}-budi klaim bayar`]);
  });

  it('daftar klaim menunggu (dasbor dan /klaim) memuat klaim itu; dasbor membawa id event untuk tautan', async () => {
    const semua = await muatKlaimMenunggu(C.db, C.uid, hariIni());
    expect(semua.map((k) => k.id)).toContain(klaim1);
    const d = await muatDasbor(C.db, C.uid, hariIni());
    if (d.keadaan !== 'piutang') throw new Error(`keadaan ${d.keadaan}`);
    const budi = d.anggota.find((a) => a.memberId === anggota.budi.id);
    expect(budi?.rincian.map((x) => x.eventId).sort()).toEqual([event.futsal, event.kopi].sort());
  });

  it('lencana menu: hitungKlaimMenunggu sama dengan daftar klaim menunggu milik C', async () => {
    const semua = await muatKlaimMenunggu(C.db, C.uid, hariIni());
    expect(semua.length).toBeGreaterThan(0);
    expect(await hitungKlaimMenunggu(C.db, C.uid)).toBe(semua.length);
  });
});

describe('penalang D tidak bisa melihat atau memutuskan klaim C', () => {
  it('rincian event C: null, juga bila D memalsukan id penalang C', async () => {
    expect(await muatRincianEvent(D.db, { id: D.uid, nama: 'Penalang D' }, event.futsal, hariIni())).toBeNull();
    expect(await muatRincianEvent(D.db, PENALANG_C, event.futsal, hariIni())).toBeNull();
  });

  it('daftar klaim D tidak memuat klaim C: tanpa saringan, per event, dan dengan payer_id palsu', async () => {
    expect((await muatKlaimMenunggu(D.db, D.uid, hariIni())).map((k) => k.id)).not.toContain(klaim1);
    expect(await muatKlaimMenunggu(D.db, D.uid, hariIni(), event.futsal)).toEqual([]);
    expect(await muatKlaimMenunggu(D.db, C.uid, hariIni())).toEqual([]);
    expect(await muatKlaimMenunggu(D.db, C.uid, hariIni(), event.futsal)).toEqual([]);
  });

  it('lencana menu D tidak menghitung klaim C, juga dengan payer_id palsu', async () => {
    expect(await hitungKlaimMenunggu(D.db, C.uid)).toBe(0);
    expect(await hitungKlaimMenunggu(D.db, D.uid)).toBe((await muatKlaimMenunggu(D.db, D.uid, hariIni())).length);
  });

  it('D tidak bisa konfirmasi, tolak, atau melunasi tunai: 404 dan tidak ada yang berubah', async () => {
    aktif = D;
    const a = await konfirmasiKlaim({ claimId: klaim1 });
    const b = await tolakKlaim({ claimId: klaim1, alasan: 'iseng' });
    const c = await tandaiLunasManual({ shareId: porsi['futsal:citra'] });
    aktif = null;
    for (const h of [a, b, c]) {
      expect(h.ok).toBe(false);
      if (!h.ok) expect(h.kode).toBe('tidak_ditemukan');
    }
    expect(await statusKlaim(klaim1)).toBe('menunggu');
    expect(await statusPorsi(porsi['futsal:budi'])).toBe('menunggu_konfirmasi');
    expect(await statusPorsi(porsi['kopi:budi'])).toBe('menunggu_konfirmasi');
    expect(await statusPorsi(porsi['futsal:citra'])).toBe('belum_bayar');
  });
});

describe('keputusan penalang C tampil di rincian dan riwayat', () => {
  it('tolak tanpa alasan ditolak; tolak beralasan mengembalikan porsi dan alasannya tampil di riwayat', async () => {
    aktif = C;
    const kosong = await tolakKlaim({ claimId: klaim1, alasan: '   ' });
    expect(kosong.ok).toBe(false);
    if (!kosong.ok) expect(kosong.kode).toBe('validasi');
    expect(await statusKlaim(klaim1)).toBe('menunggu');

    expect((await tolakKlaim({ claimId: klaim1, alasan: 'transfernya tidak masuk' })).ok).toBe(true);
    aktif = null;

    const r = await muatRincianEvent(C.db, PENALANG_C, event.futsal, hariIni());
    expect(r?.klaim).toEqual([]);
    expect(r?.porsi.find((p) => p.nama.endsWith('budi'))?.status).toBe('belum_bayar');
    expect(r?.riwayat.map((x) => x.teks)).toEqual([`Penalang C tolak klaim ${PENANDA}-budi`, `${PENANDA}-budi klaim bayar`]);
    expect(r?.riwayat[0].alasan).toBe('transfernya tidak masuk');
    expect(r?.terkunci).toBe(false);
  });

  it('klaim ulang lalu konfirmasi: porsi lunas, event terkunci, klaim kedua tidak mengubah riwayat lama', async () => {
    const klaim2 = await klaimLewatApi('budi', [porsi['futsal:budi'], porsi['kopi:budi']]);
    aktif = C;
    expect((await konfirmasiKlaim({ claimId: klaim2 })).ok).toBe(true);
    // Klaim yang sudah diputuskan: 409, bukan keputusan kedua.
    const ulang = await konfirmasiKlaim({ claimId: klaim2 });
    aktif = null;
    expect(ulang.ok).toBe(false);
    if (!ulang.ok) expect(ulang.kode).toBe('konflik');

    const r = await muatRincianEvent(C.db, PENALANG_C, event.futsal, hariIni());
    expect(r?.klaim).toEqual([]);
    expect(r?.terkunci).toBe(true);
    expect(r?.porsi.find((p) => p.nama.endsWith('budi'))?.status).toBe('lunas');
    expect(r?.riwayat.map((x) => x.teks)).toEqual([
      `Penalang C konfirmasi klaim ${PENANDA}-budi`,
      `${PENANDA}-budi klaim bayar`,
      `Penalang C tolak klaim ${PENANDA}-budi`,
      `${PENANDA}-budi klaim bayar`,
    ]);
  });

  it('pelunasan tunai: porsi lunas dan riwayat menyebut tunai; porsi yang sudah lunas 409', async () => {
    aktif = C;
    const h = await tandaiLunasManual({ shareId: porsi['futsal:citra'] });
    const ulang = await tandaiLunasManual({ shareId: porsi['futsal:citra'] });
    aktif = null;
    expect(h.ok).toBe(true);
    expect(ulang.ok).toBe(false);
    if (!ulang.ok) expect(ulang.kode).toBe('konflik');
    const r = await muatRincianEvent(C.db, PENALANG_C, event.futsal, hariIni());
    expect(r?.riwayat[0].teks).toBe(`Penalang C tandai lunas ${PENANDA}-citra (tunai)`);
  });
});
