// Uji T-09 terhadap Supabase nyata: tandaiLunasManual lewat RPC lunasi_tunai (0006).
// '@/lib/supabase/server' diganti klien bersesi akun uji C atau D yang sungguhan.
// Butuh migrasi 0006 terpasang.
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

const { tandaiLunasManual } = await import('./klaim');
const { POST } = await import('@/app/api/claim/route');
vi.spyOn(console, 'error').mockImplementation(() => {});

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`Variabel lingkungan ${nama} belum diisi`);
  return nilai;
}

const PENANDA = `uji-klaim-tunai-${Date.now()}`;
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
const eventDibuat: { db: SupabaseClient; id: string }[] = [];

async function buatEvent(nama: string, total: number) {
  const ev = await C.db.from('events').insert({ payer_id: C.uid, judul: `${PENANDA}-${nama}`, subtotal: total, total }).select('id').single();
  expect(ev.error).toBeNull();
  eventDibuat.push({ db: C.db, id: String(ev.data?.id) });
  const s = await C.db.from('shares').insert({ event_id: ev.data?.id, member_id: anggotaId, subtotal: total, total }).select('id').single();
  expect(s.error).toBeNull();
  porsi[nama] = String(s.data?.id);
}

async function status(id: string) {
  return (await C.db.from('shares').select('status, settled_at').eq('id', id).single()).data;
}

beforeAll(async () => {
  C = await masuk('C');
  D = await masuk('D');
  const { data, error } = await C.db.from('members').insert({ nama_panggilan: `${PENANDA}-anggota` }).select('id, access_token').single();
  expect(error).toBeNull();
  anggotaId = String(data?.id);
  token = String(data?.access_token);
  await buatEvent('tunai', 25_000);
  await buatEvent('diklaim', 10_000);
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

describe('tandaiLunasManual (lunasi_tunai)', () => {
  it('tanpa sesi penalang ditolak tidak_berwenang', async () => {
    aktif = null;
    expect(await tandaiLunasManual({ shareId: porsi.tunai })).toMatchObject({ ok: false, kode: 'tidak_berwenang' });
  });

  it('porsi milik event penalang lain: tidak_ditemukan, status tidak berubah', async () => {
    aktif = D;
    expect(await tandaiLunasManual({ shareId: porsi.tunai })).toMatchObject({ ok: false, kode: 'tidak_ditemukan' });
    expect((await status(porsi.tunai))?.status).toBe('belum_bayar');
  });

  it('porsi yang tidak ada: tidak_ditemukan', async () => {
    aktif = C;
    expect(await tandaiLunasManual({ shareId: '00000000-0000-4000-8000-000000000000' })).toMatchObject({ ok: false, kode: 'tidak_ditemukan' });
  });

  it('porsi yang sedang di klaim menunggu: konflik', async () => {
    const waktu = `${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19)}+07:00`;
    const r = await POST(
      new Request('http://localhost/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, shareIds: [porsi.diklaim], waktuTransfer: waktu, pengirim: 'BCA a.n. Uji' }),
      }),
    );
    expect(r.status).toBe(200);
    aktif = C;
    expect(await tandaiLunasManual({ shareId: porsi.diklaim })).toMatchObject({ ok: false, kode: 'konflik' });
    expect((await status(porsi.diklaim))?.status).toBe('menunggu_konfirmasi');
  });

  it('porsi belum_bayar jadi lunas; riwayat beraktor penalang, catatan "tunai", tanpa claim_id; event terkunci', async () => {
    aktif = C;
    expect(await tandaiLunasManual({ shareId: porsi.tunai })).toEqual({ ok: true, data: { shareId: porsi.tunai } });
    const s = await status(porsi.tunai);
    expect(s?.status).toBe('lunas');
    expect(s?.settled_at).toEqual(expect.any(String));

    const { data } = await C.db
      .from('payment_events')
      .select('dari_status, ke_status, aktor, aktor_id, catatan, claim_id')
      .eq('share_id', porsi.tunai);
    expect(data).toEqual([
      { dari_status: 'belum_bayar', ke_status: 'lunas', aktor: 'penalang', aktor_id: C.uid, catatan: 'tunai', claim_id: null },
    ]);
    const ev = await C.db.from('events').select('terkunci').eq('id', eventDibuat[0].id).single();
    expect(ev.data).toEqual({ terkunci: true });
  });

  it('porsi yang sudah lunas: konflik, tanpa riwayat kedua', async () => {
    aktif = C;
    expect(await tandaiLunasManual({ shareId: porsi.tunai })).toMatchObject({ ok: false, kode: 'konflik' });
    const { data } = await C.db.from('payment_events').select('id').eq('share_id', porsi.tunai);
    expect(data).toHaveLength(1);
  });

  it('shareId bukan UUID: validasi tanpa menyentuh basis data', async () => {
    aktif = C;
    expect(await tandaiLunasManual({ shareId: 'bukan-id' })).toMatchObject({ ok: false, kode: 'validasi' });
  });
});
