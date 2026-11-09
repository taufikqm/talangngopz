// Uji T-09 terhadap Supabase nyata: aksi konfirmasiKlaim dan tolakKlaim.
// '@/lib/supabase/server' diganti klien supabase-js bersesi akun uji C atau D yang
// sungguhan (kunci anon), jadi putuskan_klaim berjalan dengan auth.uid() penalang asli.
// Klaim dibuat lewat POST /api/claim, bukan service_role di uji.
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

const { konfirmasiKlaim, tolakKlaim } = await import('./klaim');
const { POST } = await import('@/app/api/claim/route');
vi.spyOn(console, 'error').mockImplementation(() => {});

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`Variabel lingkungan ${nama} belum diisi`);
  return nilai;
}

const PENANDA = `uji-klaim-aksi-${Date.now()}`;
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
    if (error?.name !== 'AuthRetryableFetchError' || percobaan >= 3) {
      throw new Error(`Masuk sebagai ${label} gagal: ${error?.message}`);
    }
  }
}

let C: Sesi;
let D: Sesi;
let anggotaId = '';
let token = '';
const porsi: Record<string, string> = {};
const eventDibuat: { db: SupabaseClient; id: string; judul: string }[] = [];

async function buatEvent(nama: string, total: number) {
  const judul = `${PENANDA}-${nama}`;
  const ev = await C.db.from('events').insert({ payer_id: C.uid, judul, subtotal: total, total }).select('id').single();
  expect(ev.error).toBeNull();
  eventDibuat.push({ db: C.db, id: String(ev.data?.id), judul });
  const s = await C.db
    .from('shares')
    .insert({ event_id: ev.data?.id, member_id: anggotaId, subtotal: total, total })
    .select('id')
    .single();
  expect(s.error).toBeNull();
  porsi[nama] = String(s.data?.id);
}

async function klaimLewatApi(shareIds: string[]): Promise<string> {
  const waktu = `${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19)}+07:00`;
  const respons = await POST(
    new Request('http://localhost/api/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, shareIds, waktuTransfer: waktu, pengirim: 'BCA a.n. Uji' }),
    }),
  );
  const isi = await respons.json();
  expect(isi.ok).toBe(true);
  return isi.data.claimId as string;
}

async function status(ids: string[]) {
  const { data } = await C.db.from('shares').select('id, status').in('id', ids);
  const per = new Map((data ?? []).map((r) => [String(r.id), String(r.status)]));
  return ids.map((id) => per.get(id));
}

const klaimDb = async (id: string) =>
  (await C.db.from('payment_claims').select('status, alasan_tolak, decided_by').eq('id', id).single()).data;

beforeAll(async () => {
  C = await masuk('C');
  D = await masuk('D');
  const { data, error } = await C.db
    .from('members')
    .insert({ nama_panggilan: `${PENANDA}-anggota` })
    .select('id, access_token')
    .single();
  expect(error).toBeNull();
  anggotaId = String(data?.id);
  token = String(data?.access_token);
  await buatEvent('futsal', 20_000);
  await buatEvent('kopi', 15_000);
  await buatEvent('bakso', 12_000);
});

afterAll(async () => {
  aktif = null;
  if (!C) return;
  const galat: string[] = [];
  for (const { db, id } of eventDibuat) {
    const { error } = await db.from('events').delete().eq('id', id);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`events: ${error.code} ${error.message}`);
  }
  if (anggotaId) {
    const { error } = await C.db.from('members').delete().eq('id', anggotaId);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`members: ${error.code} ${error.message}`);
  }
  await C.db.auth.signOut();
  await D?.db.auth.signOut();
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
});

describe('konfirmasiKlaim', () => {
  let klaimDua = '';

  it('tanpa sesi penalang ditolak tidak_berwenang', async () => {
    klaimDua = await klaimLewatApi([porsi.futsal, porsi.kopi]);
    aktif = null;
    expect(await konfirmasiKlaim({ claimId: klaimDua })).toMatchObject({ ok: false, kode: 'tidak_berwenang' });
  });

  it('oleh penalang lain: tidak_ditemukan, klaim tetap menunggu', async () => {
    aktif = D;
    expect(await konfirmasiKlaim({ claimId: klaimDua })).toMatchObject({ ok: false, kode: 'tidak_ditemukan' });
    expect((await klaimDb(klaimDua))?.status).toBe('menunggu');
  });

  it('satu ketukan membuat semua porsi di klaim lunas, riwayat beraktor penalang dan ber-claim_id, event terkunci', async () => {
    aktif = C;
    expect(await konfirmasiKlaim({ claimId: klaimDua })).toEqual({ ok: true, data: { claimId: klaimDua } });
    expect(await status([porsi.futsal, porsi.kopi])).toEqual(['lunas', 'lunas']);
    expect(await klaimDb(klaimDua)).toMatchObject({ status: 'dikonfirmasi', decided_by: C.uid });

    const { data } = await C.db
      .from('payment_events')
      .select('share_id, ke_status, aktor, aktor_id, claim_id')
      .eq('claim_id', klaimDua)
      .eq('ke_status', 'lunas');
    expect(data?.map((e) => e.share_id).sort()).toEqual([porsi.futsal, porsi.kopi].sort());
    for (const e of data ?? []) expect(e).toMatchObject({ aktor: 'penalang', aktor_id: C.uid, claim_id: klaimDua });

    const ev = await C.db.from('events').select('terkunci').in('judul', [`${PENANDA}-futsal`, `${PENANDA}-kopi`]);
    expect(ev.data?.map((e) => e.terkunci)).toEqual([true, true]);
  });

  it('klaim yang sudah diputuskan: konflik', async () => {
    aktif = C;
    expect(await konfirmasiKlaim({ claimId: klaimDua })).toMatchObject({ ok: false, kode: 'konflik' });
  });

  it('claimId bukan UUID: validasi tanpa menyentuh basis data', async () => {
    aktif = C;
    expect(await konfirmasiKlaim({ claimId: 'bukan-id' })).toMatchObject({ ok: false, kode: 'validasi' });
  });
});

describe('tolakKlaim', () => {
  let klaimTolak = '';

  it.each([['kosong', ''], ['hanya spasi', '   '], ['terlalu panjang', 'a'.repeat(201)]])(
    'alasan %s ditolak validasi; klaim tetap menunggu',
    async (_, alasan) => {
      aktif = C;
      if (!klaimTolak) klaimTolak = await klaimLewatApi([porsi.bakso]);
      expect(await tolakKlaim({ claimId: klaimTolak, alasan })).toMatchObject({ ok: false, kode: 'validasi' });
      expect((await klaimDb(klaimTolak))?.status).toBe('menunggu');
    },
  );

  it('oleh penalang lain: tidak_ditemukan', async () => {
    aktif = D;
    expect(await tolakKlaim({ claimId: klaimTolak, alasan: 'bukan milikku' })).toMatchObject({ ok: false, kode: 'tidak_ditemukan' });
  });

  it('tolak mengembalikan semua porsi ke belum_bayar dan menyimpan alasannya', async () => {
    aktif = C;
    expect(await tolakKlaim({ claimId: klaimTolak, alasan: '  Belum masuk di mutasi  ' })).toEqual({ ok: true, data: { claimId: klaimTolak } });
    expect(await status([porsi.bakso])).toEqual(['belum_bayar']);
    expect(await klaimDb(klaimTolak)).toMatchObject({ status: 'ditolak', alasan_tolak: 'Belum masuk di mutasi' });

    const { data } = await C.db
      .from('payment_events')
      .select('dari_status, ke_status, aktor, aktor_id, catatan, claim_id')
      .eq('claim_id', klaimTolak)
      .eq('ke_status', 'belum_bayar');
    expect(data).toEqual([
      { dari_status: 'menunggu_konfirmasi', ke_status: 'belum_bayar', aktor: 'penalang', aktor_id: C.uid, catatan: 'Belum masuk di mutasi', claim_id: klaimTolak },
    ]);
  });
});
