// Uji T-06 terhadap Supabase nyata lewat sesi penalang uji A (kunci anon + RLS).
// Membuktikan perilaku pemicu 0003 dan v_piutang yang diandalkan buatEvent.
// Butuh kredensial di .env.local.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { porsiRata, urutkanPeserta } from './event';
import { simpanEvent } from './event-db';

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

const PENANDA = `uji-event-${Date.now()}`;
let db: SupabaseClient;
let uid = '';
const anggotaDibuat: string[] = [];
const eventDibuat: string[] = [];

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
  for (const id of eventDibuat) {
    const { error } = await db.from('events').delete().eq('id', id);
    if (error) galat.push(`events: ${error.message}`);
  }
  for (const id of anggotaDibuat) {
    const { error } = await db.from('members').delete().eq('id', id);
    if (error) galat.push(`members: ${error.message}`);
  }
  await db.auth.signOut();
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
});

async function buatAnggota(n: number): Promise<string[]> {
  const { data, error } = await db
    .from('members')
    .insert(Array.from({ length: n }, (_, i) => ({ nama_panggilan: `${PENANDA}-${i}`, whatsapp: null, aktif: true })))
    .select('id');
  expect(error).toBeNull();
  const ids = (data ?? []).map((r) => String(r.id));
  anggotaDibuat.push(...ids);
  return ids;
}

describe('dasar perilaku basis data untuk porsi penalang', () => {
  it('insert porsi berstatus lunas tidak ditolak pemicu, tidak mengunci event, tanpa riwayat', async () => {
    const [penalang, teman] = await buatAnggota(2);
    const ev = await db
      .from('events')
      .insert({ payer_id: uid, judul: `${PENANDA}-lunas`, subtotal: 60_000, total: 60_000 })
      .select('id')
      .single();
    expect(ev.error).toBeNull();
    const eventId = String(ev.data?.id);
    eventDibuat.push(eventId);

    const porsi = await db
      .from('shares')
      .insert([
        { event_id: eventId, member_id: penalang, subtotal: 30_000, total: 30_000, status: 'lunas', settled_at: new Date().toISOString() },
        { event_id: eventId, member_id: teman, subtotal: 30_000, total: 30_000, status: 'belum_bayar', settled_at: null },
      ])
      .select('id');
    expect(porsi.error).toBeNull();
    const shareIds = (porsi.data ?? []).map((r) => String(r.id));
    expect(shareIds).toHaveLength(2);

    const { data: event, error: galatEvent } = await db.from('events').select('terkunci').eq('id', eventId).single();
    expect(galatEvent).toBeNull();
    expect(event).toEqual({ terkunci: false });

    const riwayat = await db.from('payment_events').select('id').in('share_id', shareIds);
    expect(riwayat.error).toBeNull();
    expect(riwayat.data).toEqual([]);

    // Bukti (b): porsi lunas tidak dihitung sebagai piutang.
    const piutang = await db
      .from('v_piutang')
      .select('member_id, belum_bayar, menunggu, jumlah_event')
      .in('member_id', [penalang, teman]);
    expect(piutang.error).toBeNull();
    const per = new Map((piutang.data ?? []).map((r) => [String(r.member_id), r]));
    expect(per.get(penalang)).toMatchObject({ belum_bayar: 0, menunggu: 0, jumlah_event: 0 });
    expect(per.get(teman)).toMatchObject({ belum_bayar: 30_000, menunggu: 0, jumlah_event: 1 });
  });
});

async function rencana(total: number, ids: string[], judul: string) {
  const urut = urutkanPeserta(ids.map((id, i) => ({ id, namaPanggilan: `${PENANDA}-${i}` })), ids[0]);
  return {
    payerId: uid,
    judul: `${PENANDA}-${judul}`,
    tanggal: '2026-11-09',
    total,
    pembulatanKe: urut[0].id,
    memberPenalang: ids[0],
    porsi: porsiRata(total, urut),
  };
}

async function porsiTersimpan(eventId: string) {
  const { data, error } = await db.from('shares').select('member_id, total, status').eq('event_id', eventId);
  expect(error).toBeNull();
  return data ?? [];
}

describe('simpanEvent: pemicu invarian tidak menolak penyimpanan yang sah', () => {
  it('total 150.000 untuk 5 peserta tersimpan sebagai 5 porsi 30.000, jumlah pas', async () => {
    const ids = await buatAnggota(5);
    const hasil = await simpanEvent(db, await rencana(150_000, ids, 'lima'));
    eventDibuat.push(hasil.eventId);

    const porsi = await porsiTersimpan(hasil.eventId);
    expect(porsi.map((x) => x.total)).toEqual([30_000, 30_000, 30_000, 30_000, 30_000]);
    expect(porsi.reduce((a, x) => a + Number(x.total), 0)).toBe(150_000);
    expect(porsi.find((x) => x.member_id === ids[0])?.status).toBe('lunas');
    expect(porsi.filter((x) => x.status === 'belum_bayar')).toHaveLength(4);

    const { data: ev } = await db.from('events').select('total, terkunci, mode').eq('id', hasil.eventId).single();
    expect(ev).toEqual({ total: 150_000, terkunci: false, mode: 'rata' });
  });

  it('total 100.000 untuk 3 peserta tersimpan dengan jumlah pas 100.000', async () => {
    const ids = await buatAnggota(3);
    const hasil = await simpanEvent(db, await rencana(100_000, ids, 'tiga'));
    eventDibuat.push(hasil.eventId);

    const porsi = await porsiTersimpan(hasil.eventId);
    expect(porsi.reduce((a, x) => a + Number(x.total), 0)).toBe(100_000);
    expect(porsi.find((x) => x.member_id === ids[0])?.total).toBe(33_334);
  });
});

describe('simpanEvent: kompensasi saat insert porsi gagal', () => {
  it('event yang baru dibuat dihapus lagi lewat sesi yang sama', async () => {
    const [nyata] = await buatAnggota(1);
    const hantu = '00000000-0000-4000-8000-000000000000';
    const r = await rencana(20_000, [nyata, hantu], 'kompensasi');

    // Anggota hantu melanggar foreign key shares.member_id, jadi insert porsi gagal.
    await expect(simpanEvent(db, r)).rejects.toMatchObject({ code: '23503' });

    const { data, error } = await db.from('events').select('id').eq('judul', r.judul);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
