// Uji T-09 terhadap Supabase nyata: POST /api/claim dipanggil langsung sebagai fungsi.
// Data uji dibuat lewat sesi akun uji C dan D (kunci anon + RLS). service_role hanya
// dipakai di dalam handler dan pemuat, seperti di produksi. Akun C dan D dipakai karena
// klaim meninggalkan payment_events sisip-saja yang tidak bisa dihapus.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

try {
  process.loadEnvFile('.env.local');
} catch {
  // Lingkungan CI boleh menyuntik variabel langsung tanpa berkas.
}

const { POST } = await import('./route');
const { rekapPribadi } = await import('@/lib/publik');
vi.spyOn(console, 'error').mockImplementation(() => {});

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`Variabel lingkungan ${nama} belum diisi`);
  return nilai;
}

const PENANDA = `uji-klaim-api-${Date.now()}`;
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
    if (error?.name !== 'AuthRetryableFetchError' || percobaan >= 3) {
      throw new Error(`Masuk sebagai ${label} gagal: ${error?.message}`);
    }
  }
}

let C: Sesi;
let D: Sesi;
const anggota: Record<'x' | 'y', { id: string; token: string }> = { x: { id: '', token: '' }, y: { id: '', token: '' } };
const porsi: Record<string, string> = {};
const eventDibuat: { db: SupabaseClient; id: string }[] = [];

async function buatEvent(s: Sesi, nama: string, isi: Partial<Record<'x' | 'y', number>>) {
  const total = Object.values(isi).reduce((a, b) => a + (b ?? 0), 0);
  const ev = await s.db
    .from('events')
    .insert({ payer_id: s.uid, judul: `${PENANDA}-${nama}`, subtotal: total, total })
    .select('id')
    .single();
  expect(ev.error).toBeNull();
  eventDibuat.push({ db: s.db, id: String(ev.data?.id) });
  const baris = await s.db
    .from('shares')
    .insert(
      Object.entries(isi).map(([k, t]) => ({ event_id: ev.data?.id, member_id: anggota[k as 'x' | 'y'].id, subtotal: t, total: t })),
    )
    .select('id, member_id');
  expect(baris.error).toBeNull();
  for (const r of baris.data ?? []) porsi[`${nama}:${r.member_id === anggota.x.id ? 'x' : 'y'}`] = String(r.id);
}

/** Jam Jakarta sekarang dalam ISO berzona, seperti yang dikirim formulir. */
function sekarangIso(): string {
  const t = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19);
  return `${t}+07:00`;
}

async function kirim(masukan: unknown) {
  const respons = await POST(
    new Request('http://localhost/api/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof masukan === 'string' ? masukan : JSON.stringify(masukan),
    }),
  );
  return { status: respons.status, header: respons.headers, isi: await respons.json() };
}

const klaim = (token: string, shareIds: string[], ubah: Record<string, unknown> = {}) =>
  kirim({ token, shareIds, waktuTransfer: sekarangIso(), pengirim: 'BCA a.n. Uji', ...ubah });

async function status(s: Sesi, ids: string[]) {
  const { data, error } = await s.db.from('shares').select('id, status').in('id', ids);
  expect(error).toBeNull();
  const per = new Map((data ?? []).map((r) => [String(r.id), String(r.status)]));
  return ids.map((id) => per.get(id));
}

beforeAll(async () => {
  C = await masuk('C');
  D = await masuk('D');
  const { data, error } = await C.db
    .from('members')
    .insert([{ nama_panggilan: `${PENANDA}-x` }, { nama_panggilan: `${PENANDA}-y` }])
    .select('id, nama_panggilan, access_token');
  expect(error).toBeNull();
  for (const r of data ?? []) {
    const k = r.nama_panggilan === `${PENANDA}-x` ? 'x' : 'y';
    anggota[k] = { id: String(r.id), token: String(r.access_token) };
  }
  await buatEvent(C, 'evA', { x: 12_000, y: 18_000 });
  await buatEvent(C, 'evB', { x: 7_000, y: 3_000 });
  await buatEvent(C, 'evC', { x: 4_000 });
  await buatEvent(D, 'evD', { x: 5_000 });
});

afterAll(async () => {
  if (!C) return;
  const galat: string[] = [];
  for (const { db, id } of eventDibuat) {
    const { error } = await db.from('events').delete().eq('id', id);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`events: ${error.code} ${error.message}`);
  }
  for (const { id } of Object.values(anggota).filter((a) => a.id)) {
    const { error } = await C.db.from('members').delete().eq('id', id);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`members: ${error.code} ${error.message}`);
  }
  await C.db.auth.signOut();
  await D?.db.auth.signOut();
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
});

describe('POST /api/claim', () => {
  it('klaim dua event dalam satu transfer: satu klaim, dua porsi menunggu_konfirmasi', async () => {
    const r = await klaim(anggota.x.token, [porsi['evA:x'], porsi['evB:x']]);
    expect(r.status).toBe(200);
    expect(r.isi).toMatchObject({ ok: true, data: { nominal: 12_000 + 7_000 } });
    expect(r.header.get('cache-control')).toBe('private, no-store');
    const claimId = r.isi.data.claimId as string;

    const isi = await C.db.from('payment_claim_shares').select('share_id').eq('claim_id', claimId);
    expect(isi.data?.map((x) => x.share_id).sort()).toEqual([porsi['evA:x'], porsi['evB:x']].sort());
    expect(await status(C, [porsi['evA:x'], porsi['evB:x']])).toEqual(['menunggu_konfirmasi', 'menunggu_konfirmasi']);

    const riwayat = await C.db.from('payment_events').select('dari_status, ke_status, aktor, aktor_id, claim_id').eq('claim_id', claimId);
    expect(riwayat.data).toHaveLength(2);
    for (const e of riwayat.data ?? []) {
      expect(e).toMatchObject({ dari_status: 'belum_bayar', ke_status: 'menunggu_konfirmasi', aktor: 'peserta', aktor_id: anggota.x.id });
    }
  });

  it('klaim ulang porsi yang sudah diklaim: 409, tanpa klaim atau riwayat kedua', async () => {
    const sebelum = await C.db.from('payment_events').select('id').eq('share_id', porsi['evA:x']);
    const r = await klaim(anggota.x.token, [porsi['evA:x']]);
    expect(r.status).toBe(409);
    expect(r.isi).toMatchObject({ ok: false, kode: 'konflik', pesan: 'Sebagian event sudah diklaim atau lunas. Halaman dimuat ulang.' });
    const isi = await C.db.from('payment_claim_shares').select('claim_id').eq('share_id', porsi['evA:x']);
    expect(isi.data).toHaveLength(1);
    const sesudah = await C.db.from('payment_events').select('id').eq('share_id', porsi['evA:x']);
    expect(sesudah.data).toEqual(sebelum.data);
  });

  it('porsi lunas: 409 (peserta hanya bisa dari belum_bayar)', async () => {
    const lunas = await C.db.from('shares').update({ status: 'lunas', settled_at: new Date().toISOString() }).eq('id', porsi['evB:y']);
    expect(lunas.error).toBeNull();
    const r = await klaim(anggota.y.token, [porsi['evB:y']]);
    expect(r.status).toBe(409);
    expect(await status(C, [porsi['evB:y']])).toEqual(['lunas']);
  });

  it('porsi milik anggota lain: 404 dengan isi sama persis seperti token tak dikenal', async () => {
    const lain = await klaim(anggota.x.token, [porsi['evA:y']]);
    const takDikenal = await klaim('f'.repeat(64), [porsi['evA:y']]);
    const formatSalah = await klaim('bukan-token', [porsi['evA:y']]);
    expect(lain.status).toBe(404);
    expect(takDikenal.status).toBe(404);
    expect(formatSalah.status).toBe(404);
    expect(lain.isi).toEqual(takDikenal.isi);
    expect(formatSalah.isi).toEqual(takDikenal.isi);
    expect(lain.isi).toEqual({ ok: false, kode: 'tidak_ditemukan', pesan: 'Tagihan ini tidak ditemukan. Minta tautan baru ke penalang.' });
    expect(await status(C, [porsi['evA:y']])).toEqual(['belum_bayar']);
  });

  it('klaim campuran dua penalang: 400, status tidak berubah', async () => {
    const r = await klaim(anggota.x.token, [porsi['evC:x'], porsi['evD:x']]);
    expect(r.status).toBe(400);
    expect(r.isi).toMatchObject({ ok: false, kode: 'validasi' });
    expect(await status(C, [porsi['evC:x']])).toEqual(['belum_bayar']);
    expect(await status(D, [porsi['evD:x']])).toEqual(['belum_bayar']);
  });

  it.each([
    ['shareIds kosong', { shareIds: [] }, 'shareIds'],
    ['shareIds berulang', { shareIds: ['x', 'x'] }, 'shareIds'],
    ['waktu lebih dari 10 menit ke depan', { waktuTransfer: new Date(Date.now() + 3_600_000).toISOString() }, 'waktuTransfer'],
    ['waktu tanpa zona', { waktuTransfer: '2026-11-09T14:20:00' }, 'waktuTransfer'],
    ['pengirim hanya spasi', { pengirim: '   ' }, 'pengirim'],
    ['pengirim terlalu panjang', { pengirim: 'a'.repeat(101) }, 'pengirim'],
  ])('masukan tidak sah (%s): 400 dengan galat per medan', async (_, ubah, medan) => {
    const shareIds = 'shareIds' in ubah ? (ubah.shareIds as string[]).map((s) => (s === 'x' ? porsi['evC:x'] : s)) : [porsi['evC:x']];
    const r = await klaim(anggota.x.token, shareIds, { ...ubah, shareIds });
    expect(r.status).toBe(400);
    expect(r.isi.medan).toHaveProperty(medan);
    expect(await status(C, [porsi['evC:x']])).toEqual(['belum_bayar']);
  });

  it('badan bukan JSON: 400', async () => {
    const r = await kirim('{bukan json');
    expect(r.status).toBe(400);
  });

  it('batas laju: permintaan ke-11 dalam semenit untuk token yang sama mendapat 429 dan Retry-After', async () => {
    const token = 'e'.repeat(64);
    for (let i = 0; i < 10; i++) expect((await klaim(token, [porsi['evC:x']])).status).toBe(404);
    const r = await klaim(token, [porsi['evC:x']]);
    expect(r.status).toBe(429);
    expect(r.isi).toMatchObject({ ok: false, kode: 'batas_laju' });
    expect(Number(r.header.get('retry-after'))).toBeGreaterThan(0);
    expect(Number(r.header.get('retry-after'))).toBeLessThanOrEqual(60);
    expect(JSON.stringify(r.isi)).not.toContain(token);
  });

  it('lencana klaim (celah T-08): rekapPribadi memuat menungguSejak untuk porsi yang diklaim', async () => {
    const r = await rekapPribadi(anggota.x.token);
    const per = new Map(r?.perEvent.map((p) => [p.shareId, p]));
    expect(per.get(porsi['evA:x'])).toMatchObject({ status: 'menunggu_konfirmasi' });
    expect(per.get(porsi['evA:x'])?.menungguSejak).toEqual(expect.any(String));
    expect(per.get(porsi['evB:x'])?.menungguSejak).toEqual(expect.any(String));
    expect(per.get(porsi['evC:x'])?.menungguSejak).toBeNull();
    // Total utang tetap menghitung yang menunggu konfirmasi.
    expect(r?.totalUtang).toBe(12_000 + 7_000 + 4_000 + 5_000);
  });
});
