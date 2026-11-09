// Uji T-08 terhadap Supabase nyata: pemuat halaman peserta (/me, /bill).
// Data uji dibuat lewat sesi akun uji C (kunci anon + RLS), plus satu event milik D
// supaya ada dua penalang. service_role hanya dipakai di dalam fungsi pemuat.
// Akun C dan D dipakai karena perubahan status meninggalkan payment_events sisip-saja.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

try {
  process.loadEnvFile('.env.local');
} catch {
  // Lingkungan CI boleh menyuntik variabel langsung tanpa berkas.
}

const { rekapEvent, rekapPribadi, tokenDikenal } = await import('./publik');

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`Variabel lingkungan ${nama} belum diisi`);
  return nilai;
}

const PENANDA = `uji-klaim-publik-${Date.now()}`;
const WA = { x: '6281200000001', y: '6281200000002' };
const GALAT_BERSIH_WAJAR = new Set(['23514', '23503']);

type Sesi = { db: SupabaseClient; uid: string; email: string };

async function masuk(label: 'C' | 'D'): Promise<Sesi> {
  const db = createClient(wajib('NEXT_PUBLIC_SUPABASE_URL'), wajib('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = wajib(`TEST_${label}_EMAIL`);
  for (let percobaan = 1; ; percobaan++) {
    const { data, error } = await db.auth.signInWithPassword({ email, password: wajib(`TEST_${label}_PASSWORD`) });
    if (!error && data.user) return { db, uid: data.user.id, email };
    if (error?.name !== 'AuthRetryableFetchError' || percobaan >= 3) {
      throw new Error(`Masuk sebagai ${label} gagal: ${error?.message}`);
    }
  }
}

let C: Sesi;
let D: Sesi;
const anggota = { x: '', y: '' };
let tokenX = '';
const eventDibuat: { db: SupabaseClient; id: string }[] = [];
const porsi: Record<string, string> = {};
let tokenEvA = '';

async function buatEvent(s: Sesi, nama: string, isi: Record<string, number>) {
  const total = Object.values(isi).reduce((a, b) => a + b, 0);
  const ev = await s.db
    .from('events')
    .insert({ payer_id: s.uid, judul: `${PENANDA}-${nama}`, tanggal: '2026-11-09', subtotal: total, total })
    .select('id, share_token')
    .single();
  expect(ev.error).toBeNull();
  eventDibuat.push({ db: s.db, id: String(ev.data?.id) });
  const baris = await s.db
    .from('shares')
    .insert(Object.entries(isi).map(([member_id, t]) => ({ event_id: ev.data?.id, member_id, subtotal: t, total: t })))
    .select('id, member_id');
  expect(baris.error).toBeNull();
  for (const r of baris.data ?? []) porsi[`${nama}:${r.member_id === anggota.x ? 'x' : 'y'}`] = String(r.id);
  return String(ev.data?.share_token);
}

beforeAll(async () => {
  C = await masuk('C');
  D = await masuk('D');
  for (const s of [C, D]) {
    const { error } = await s.db.from('profiles').update({ bank: 'BCA', no_rekening: '1234567890' }).eq('id', s.uid);
    expect(error).toBeNull();
  }
  const { data, error } = await C.db
    .from('members')
    .insert([
      { nama_panggilan: `${PENANDA}-x`, whatsapp: WA.x },
      { nama_panggilan: `${PENANDA}-y`, whatsapp: WA.y },
    ])
    .select('id, nama_panggilan, access_token');
  expect(error).toBeNull();
  for (const r of data ?? []) {
    if (r.nama_panggilan === `${PENANDA}-x`) {
      anggota.x = String(r.id);
      tokenX = String(r.access_token);
    } else anggota.y = String(r.id);
  }
  tokenEvA = await buatEvent(C, 'evA', { [anggota.x]: 12_000, [anggota.y]: 18_000 });
  await buatEvent(C, 'evB', { [anggota.x]: 7_000, [anggota.y]: 3_000 });
  await buatEvent(D, 'evD', { [anggota.x]: 5_000 });
  // Porsi x di evB dilunasi penalang lewat sesinya sendiri.
  const lunas = await C.db.from('shares').update({ status: 'lunas', settled_at: '2026-11-09T07:20:00Z' }).eq('id', porsi['evB:x']);
  expect(lunas.error).toBeNull();
});

afterAll(async () => {
  if (!C) return;
  const galat: string[] = [];
  for (const { db, id } of eventDibuat) {
    const { error } = await db.from('events').delete().eq('id', id);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`events: ${error.code} ${error.message}`);
  }
  for (const id of [anggota.x, anggota.y].filter(Boolean)) {
    const { error } = await C.db.from('members').delete().eq('id', id);
    if (error && !GALAT_BERSIH_WAJAR.has(error.code)) galat.push(`members: ${error.code} ${error.message}`);
  }
  await C.db.auth.signOut();
  await D?.db.auth.signOut();
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
});

describe('rekapPribadi (/me)', () => {
  it('hanya porsi milik pemegang token; total utang tanpa yang lunas', async () => {
    const r = await rekapPribadi(tokenX);
    expect(r).not.toBeNull();
    expect(r?.namaPanggilan).toBe(`${PENANDA}-x`);
    expect(new Map(r?.perEvent.map((p) => [p.shareId, [p.total, p.status]]))).toEqual(
      new Map([
        [porsi['evA:x'], [12_000, 'belum_bayar']],
        [porsi['evB:x'], [7_000, 'lunas']],
        [porsi['evD:x'], [5_000, 'belum_bayar']],
      ]),
    );
    expect(r?.totalUtang).toBe(12_000 + 5_000);
    expect(r?.perEvent.find((p) => p.shareId === porsi['evB:x'])?.lunasPada).not.toBeNull();
    expect(r?.perEvent.every((p) => p.menungguSejak === null)).toBe(true);
  });

  it('tujuan transfer per penalang, tiap event menunjuk penalangnya', async () => {
    const r = await rekapPribadi(tokenX);
    expect(r?.tujuan.map((t) => [t.penalangId, t.noRekening]).sort()).toEqual(
      [[C.uid, '1234567890'], [D.uid, '1234567890']].sort(),
    );
    expect(r?.perEvent.find((p) => p.shareId === porsi['evD:x'])?.penalangId).toBe(D.uid);
    expect(r?.perEvent.find((p) => p.shareId === porsi['evA:x'])?.penalangId).toBe(C.uid);
  });

  it('muatan tidak memuat nominal, surel, WhatsApp, id, atau token anggota lain', async () => {
    const muatan = JSON.stringify(await rekapPribadi(tokenX));
    for (const terlarang of [
      C.email,
      D.email,
      WA.x,
      WA.y,
      anggota.y,
      porsi['evA:y'],
      porsi['evB:y'],
      '18000',
      `${PENANDA}-y`,
      tokenX,
    ]) {
      expect(muatan).not.toContain(terlarang);
    }
    expect(muatan).not.toMatch(/"(email|whatsapp|access_token|share_token)"/);
  });
});

describe('rekapEvent (/bill)', () => {
  it('semua peserta dengan nominal dan status', async () => {
    const r = await rekapEvent(tokenEvA);
    expect(r).toMatchObject({ judul: `${PENANDA}-evA`, total: 30_000 });
    expect(r?.peserta).toEqual([
      { nama: `${PENANDA}-x`, total: 12_000, status: 'belum_bayar' },
      { nama: `${PENANDA}-y`, total: 18_000, status: 'belum_bayar' },
    ]);
  });

  it('muatan tidak memuat surel atau WhatsApp siapa pun, maupun id dan token', async () => {
    const muatan = JSON.stringify(await rekapEvent(tokenEvA));
    for (const terlarang of [C.email, D.email, WA.x, WA.y, anggota.x, anggota.y, tokenEvA, tokenX]) {
      expect(muatan).not.toContain(terlarang);
    }
    expect(muatan).not.toMatch(/"(email|whatsapp|access_token|share_token|id)"/);
  });
});

describe('token tidak dikenal dan berformat salah', () => {
  const tidakDikenal = 'f'.repeat(64);

  it.each(['me', 'bill'] as const)('%s: semuanya null dan tidak dikenal', async (jenis) => {
    const muat = jenis === 'me' ? rekapPribadi : rekapEvent;
    // Dibentuk di sini karena tokenX baru terisi di beforeAll.
    const formatSalah = ['', 'abc', tokenX.slice(0, 63), tokenX.toUpperCase(), "' or 1=1 --", '../../etc/passwd', 'x'.repeat(5000)];
    for (const t of [tidakDikenal, ...formatSalah]) {
      expect(await muat(t)).toBeNull();
      expect(await tokenDikenal(jenis, t)).toBe(false);
    }
  });

  it('token yang dikenal memang dikenal', async () => {
    expect(await tokenDikenal('me', tokenX)).toBe(true);
    expect(await tokenDikenal('bill', tokenEvA)).toBe(true);
  });
});
