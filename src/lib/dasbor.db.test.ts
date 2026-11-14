// Uji T-10 terhadap Supabase nyata: dasbor piutang lewat sesi penalang (kunci anon + RLS).
// Akun uji C dan D. Klaim dibuat lewat POST /api/claim, bukan service_role di uji.
// Klaim dan perubahan status meninggalkan payment_events sisip-saja, jadi sebagian data
// uji berpenanda uji-klaim-dasbor-... tetap tinggal di akun C.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

try {
  process.loadEnvFile('.env.local');
} catch {
  // Lingkungan CI boleh menyuntik variabel langsung tanpa berkas.
}

const { muatDasbor } = await import('./dasbor');
const { POST } = await import('@/app/api/claim/route');

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`Variabel lingkungan ${nama} belum diisi`);
  return nilai;
}

const PENANDA = `uji-klaim-dasbor-${Date.now()}`;
const HARI_INI = '2026-11-10';
const GALAT_BERSIH_WAJAR = new Set(['23514', '23503']);

type Sesi = { db: SupabaseClient; uid: string };

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
const porsi: Record<string, string> = {};
const eventDibuat: { db: SupabaseClient; id: string }[] = [];
const eventMassal: string[] = [];

async function buatEvent(s: Sesi, nama: string, tanggal: string, isi: Record<string, number>) {
  const total = Object.values(isi).reduce((a, b) => a + b, 0);
  const ev = await s.db.from('events').insert({ payer_id: s.uid, judul: `${PENANDA}-${nama}`, tanggal, subtotal: total, total }).select('id').single();
  expect(ev.error).toBeNull();
  eventDibuat.push({ db: s.db, id: String(ev.data?.id) });
  const baris = await s.db
    .from('shares')
    .insert(Object.entries(isi).map(([k, t]) => ({ event_id: ev.data?.id, member_id: anggota[k].id, subtotal: t, total: t })))
    .select('id, member_id');
  expect(baris.error).toBeNull();
  for (const r of baris.data ?? []) {
    const k = Object.keys(anggota).find((x) => anggota[x].id === r.member_id) ?? '?';
    porsi[`${nama}:${k}`] = String(r.id);
  }
}

const jumlahKlaimMenunggu = async (s: Sesi) =>
  (await s.db.from('payment_claims').select('id', { count: 'exact', head: true }).eq('payer_id', s.uid).eq('status', 'menunggu')).count ?? 0;

beforeAll(async () => {
  C = await masuk('C');
  D = await masuk('D');
  const { data, error } = await C.db
    .from('members')
    .insert(['budi', 'citra', 'lunas', 'milikD'].map((k) => ({ nama_panggilan: `${PENANDA}-${k}` })))
    .select('id, nama_panggilan, access_token');
  expect(error).toBeNull();
  for (const r of data ?? []) anggota[String(r.nama_panggilan).slice(PENANDA.length + 1)] = { id: String(r.id), token: String(r.access_token) };

  await buatEvent(C, 'futsal', '2026-10-20', { budi: 20_000, citra: 10_000, lunas: 5_000 });
  await buatEvent(C, 'kopi', '2026-11-08', { budi: 15_000 });
  // Porsi Rp0 milik budi pada event yang tetap berutang bagi citra: tidak boleh menambah jumlah event budi.
  await buatEvent(C, 'nol', '2026-11-02', { budi: 0, citra: 10_000 });
  await buatEvent(D, 'bakso', '2026-11-01', { milikD: 12_000 });
  // Porsi "lunas" dilunasi penalang C lewat sesinya: anggota itu tidak boleh muncul di dasbor.
  expect((await C.db.from('shares').update({ status: 'lunas', settled_at: new Date().toISOString() }).eq('id', porsi['futsal:lunas'])).error).toBeNull();
});

afterAll(async () => {
  if (!C) return;
  const galat: string[] = [];
  for (const { db, id } of eventDibuat) {
    const { error } = await db.from('events').delete().eq('id', id);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`events: ${error.code} ${error.message}`);
  }
  if (eventMassal.length > 0) {
    const { error } = await C.db.from('events').delete().in('id', eventMassal);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`events massal: ${error.code} ${error.message}`);
  }
  for (const { id } of Object.values(anggota)) {
    const { error } = await C.db.from('members').delete().eq('id', id);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`members: ${error.code} ${error.message}`);
  }
  await C.db.auth.signOut();
  await D?.db.auth.signOut();
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
});

describe('RLS v_piutang dan dasbor', () => {
  it.each([
    ['C', 'D'],
    ['D', 'C'],
  ] as const)('%s menjalankan select * pada v_piutang tanpa saringan: tidak ada baris milik %s', async (saya, lawan) => {
    const s = saya === 'C' ? C : D;
    const l = lawan === 'C' ? C : D;
    const { data, error } = await s.db.from('v_piutang').select('*');
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((r) => r.payer_id === s.uid)).toBe(true);
    expect(data?.some((r) => r.payer_id === l.uid)).toBe(false);
  });

  it('dasbor C tidak memuat piutang D, juga bila C memalsukan id penalang D', async () => {
    const milikSendiri = JSON.stringify(await muatDasbor(C.db, C.uid, HARI_INI));
    expect(milikSendiri).not.toContain(anggota.milikD.id);
    expect(milikSendiri).not.toContain(porsi['bakso:milikD']);

    const dipalsukan = await muatDasbor(C.db, D.uid, HARI_INI);
    expect(dipalsukan.keadaan).toBe('kosong');
    expect(JSON.stringify(dipalsukan)).not.toContain(anggota.milikD.id);
  });

  it('anggota yang lunas semua dan porsi Rp0 tidak tampil; umur dari tanggal event tertua', async () => {
    const d = await muatDasbor(C.db, C.uid, HARI_INI);
    if (d.keadaan !== 'piutang') throw new Error(`keadaan ${d.keadaan}`);
    expect(d.anggota.every((a) => a.total > 0)).toBe(true);
    expect(d.anggota.some((a) => a.memberId === anggota.lunas.id)).toBe(false);
    const budi = d.anggota.find((a) => a.memberId === anggota.budi.id);
    expect(budi).toMatchObject({ total: 35_000, jumlahEvent: 2, umurHari: 21 });
    expect(budi?.rincian.map((r) => r.shareId)).toEqual([porsi['futsal:budi'], porsi['kopi:budi']]);
  });

  it('dimuat di bawah 1,5 detik dengan 500 baris shares', async () => {
    // Anggota khusus, supaya total anggota uji lain tidak berubah.
    const kunci = ['massal1', 'massal2', 'massal3', 'massal4'];
    const baru = await C.db
      .from('members')
      .insert(kunci.map((k) => ({ nama_panggilan: `${PENANDA}-${k}` })))
      .select('id, nama_panggilan, access_token');
    expect(baru.error).toBeNull();
    for (const r of baru.data ?? []) anggota[String(r.nama_panggilan).slice(PENANDA.length + 1)] = { id: String(r.id), token: String(r.access_token) };
    const jumlahEvent = 125;
    const ev = await C.db
      .from('events')
      .insert(Array.from({ length: jumlahEvent }, (_, i) => ({ payer_id: C.uid, judul: `${PENANDA}-massal-${i}`, tanggal: '2026-11-03', subtotal: 40_000, total: 40_000 })))
      .select('id');
    expect(ev.error).toBeNull();
    for (const r of ev.data ?? []) eventMassal.push(String(r.id));
    const baris = await C.db
      .from('shares')
      .insert(eventMassal.flatMap((id) => kunci.map((k) => ({ event_id: id, member_id: anggota[k].id, subtotal: 10_000, total: 10_000 }))))
      .select('id');
    expect(baris.error).toBeNull();
    expect(baris.data?.length).toBe(jumlahEvent * kunci.length);

    const mulai = performance.now();
    const d = await muatDasbor(C.db, C.uid, HARI_INI);
    const durasi = performance.now() - mulai;
    expect(d.keadaan).toBe('piutang');
    expect(durasi).toBeLessThan(1_500);
  });

  it('kartu kuning menghitung klaim, bukan porsi: satu klaim berisi dua porsi menambah 1', async () => {
    const sebelum = (await muatDasbor(C.db, C.uid, HARI_INI)).klaimMenunggu;
    expect(sebelum).toBe(await jumlahKlaimMenunggu(C));
    const waktu = `${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19)}+07:00`;
    const r = await POST(
      new Request('http://localhost/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: anggota.budi.token, shareIds: [porsi['futsal:budi'], porsi['kopi:budi']], waktuTransfer: waktu, pengirim: 'BCA a.n. Budi' }),
      }),
    );
    expect(r.status).toBe(200);
    const sesudah = await muatDasbor(C.db, C.uid, HARI_INI);
    expect(sesudah.klaimMenunggu).toBe(sebelum + 1);
    // Porsi yang diklaim masih piutang (menunggu konfirmasi), bukan lunas.
    if (sesudah.keadaan !== 'piutang') throw new Error('harus piutang');
    expect(sesudah.anggota.find((a) => a.memberId === anggota.budi.id)).toMatchObject({ total: 35_000, menunggu: 35_000 });
  });
});
