// Uji T-07 terhadap Supabase nyata lewat sesi penalang uji A (kunci anon + RLS).
// Membuktikan bill_items diterima skema/RLS, cascade bekerja, dan penyimpanan sah
// mode manual dan per item tidak ditolak pemicu invarian. Butuh kredensial di .env.local.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { barisItemManual, porsiManual, porsiPerItem, urutkanPeserta } from './event';
import { simpanEvent } from './event-db';
import { uraiKeUnit } from './parser';

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

const PENANDA = `uji-mode-${Date.now()}`;
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

/** Anggota uji bernama urut (…-0, …-1, …) supaya urutan nama dapat ditebak. */
async function buatAnggota(n: number): Promise<{ ids: string[]; nama: Map<string, string> }> {
  const { data, error } = await db
    .from('members')
    .insert(Array.from({ length: n }, (_, i) => ({ nama_panggilan: `${PENANDA}-${i}`, whatsapp: null, aktif: true })))
    .select('id, nama_panggilan');
  expect(error).toBeNull();
  const baris = (data ?? []).map((r) => ({ id: String(r.id), nama: String(r.nama_panggilan) }));
  baris.sort((a, b) => a.nama.localeCompare(b.nama));
  anggotaDibuat.push(...baris.map((b) => b.id));
  return { ids: baris.map((b) => b.id), nama: new Map(baris.map((b) => [b.id, b.nama])) };
}

async function porsiTersimpan(eventId: string) {
  const { data, error } = await db.from('shares').select('member_id, total, status').eq('event_id', eventId);
  expect(error).toBeNull();
  return data ?? [];
}

const jumlah = (baris: { total: unknown }[]) => baris.reduce((a, x) => a + Number(x.total), 0);

describe('dasar perilaku basis data untuk bill_items', () => {
  it('insert bill_items dengan penanggung gabungan diterima; hapus event ikut menghapusnya', async () => {
    const { ids: [a, b] } = await buatAnggota(2);
    const ev = await db
      .from('events')
      .insert({ payer_id: uid, judul: `${PENANDA}-item`, subtotal: 30_000, total: 30_000, mode: 'per_item' })
      .select('id')
      .single();
    expect(ev.error).toBeNull();
    const eventId = String(ev.data?.id);
    eventDibuat.push(eventId);

    const porsi = await db.from('shares').insert([
      { event_id: eventId, member_id: a, subtotal: 15_000, total: 15_000 },
      { event_id: eventId, member_id: b, subtotal: 15_000, total: 15_000 },
    ]);
    expect(porsi.error).toBeNull();

    const item = await db
      .from('bill_items')
      .insert({ event_id: eventId, nama: 'Nasi Putih', harga: 10_000, subtotal: 30_000, qty: 3, gratis: false, penanggung: [a, b] })
      .select('id, penanggung, qty, subtotal')
      .single();
    expect(item.error).toBeNull();
    expect(item.data).toMatchObject({ penanggung: [a, b], qty: 3, subtotal: 30_000 });

    // bill_items.event_id adalah foreign key: tanpa on delete cascade, penghapusan
    // event yang masih dirujuk akan ditolak 23503. Berhasil berarti cascade terjadi.
    // (Select sesudahnya saja tidak cukup: RLS menyembunyikan item yatim.)
    const hapus = await db.from('events').delete().eq('id', eventId).select('id');
    expect(hapus.error).toBeNull();
    expect(hapus.data).toHaveLength(1);
    eventDibuat.splice(eventDibuat.indexOf(eventId), 1);

    const sisa = await db.from('bill_items').select('id').eq('id', String(item.data?.id));
    expect(sisa.error).toBeNull();
    expect(sisa.data).toEqual([]);
  });
});

describe('simpanEvent mode manual: pemicu invarian tidak menolak penyimpanan yang sah', () => {
  it('nominal 50.000 + 30.000 + 20.000 untuk total 100.000 tersimpan, jumlah pas', async () => {
    const { ids, nama } = await buatAnggota(3);
    const urut = urutkanPeserta(ids.map((id) => ({ id, namaPanggilan: nama.get(id) ?? '' })), ids[1]);
    const nominal = new Map([[ids[0], 50_000], [ids[1], 30_000], [ids[2], 20_000]]);
    const hasil = await simpanEvent(db, {
      payerId: uid,
      judul: `${PENANDA}-manual`,
      tanggal: '2026-11-09',
      total: 100_000,
      mode: 'manual',
      pembulatanKe: urut[0].id,
      memberPenalang: ids[1],
      porsi: porsiManual(nominal, 100_000, urut),
    });
    eventDibuat.push(hasil.eventId);

    const porsi = await porsiTersimpan(hasil.eventId);
    expect(jumlah(porsi)).toBe(100_000);
    expect(new Map(porsi.map((p) => [p.member_id, [Number(p.total), p.status]]))).toEqual(
      new Map([
        [ids[0], [50_000, 'belum_bayar']],
        [ids[1], [30_000, 'lunas']],
        [ids[2], [20_000, 'belum_bayar']],
      ]),
    );
    const { data: ev } = await db.from('events').select('mode, terkunci').eq('id', hasil.eventId).single();
    expect(ev).toEqual({ mode: 'manual', terkunci: false });
  });
});

describe('simpanEvent mode per item: pemicu invarian tidak menolak penyimpanan yang sah', () => {
  it('item tidak habis dibagi dan qty > 1 tersimpan dengan jumlah pas; bill_items satu baris per item', async () => {
    const { ids, nama } = await buatAnggota(3);
    const [penalang, b, c] = ids;
    const items = [barisItemManual('Es Teh', 1, 10_000), barisItemManual('Nasi Putih', 3, 20_000)];
    const unit = uraiKeUnit(items);
    unit[0].penanggung = [c, b, penalang]; // 10.000 untuk 3 orang
    unit[1].penanggung = [penalang];
    unit[2].penanggung = [b];
    unit[3].penanggung = [c, b];

    const { porsi, urut } = porsiPerItem(unit, nama, penalang);
    const hasil = await simpanEvent(db, {
      payerId: uid,
      judul: `${PENANDA}-peritem`,
      tanggal: '2026-11-09',
      total: 30_000,
      mode: 'per_item',
      pembulatanKe: urut[0].id,
      memberPenalang: penalang,
      porsi,
      items,
      unit,
    });
    eventDibuat.push(hasil.eventId);

    const tersimpan = await porsiTersimpan(hasil.eventId);
    expect(jumlah(tersimpan)).toBe(30_000);
    const per = new Map(tersimpan.map((p) => [p.member_id, Number(p.total)]));
    // Es Teh 10.000/3: penalang 3.334 (sisa), b dan c 3.333.
    // Nasi 20.000 qty 3 diurai jadi 6.668, 6.666, 6.666; unit ketiga dibagi b dan c 3.333.
    expect(per.get(penalang)).toBe(3_334 + 6_668);
    expect(per.get(b)).toBe(3_333 + 6_666 + 3_333);
    expect(per.get(c)).toBe(3_333 + 3_333);

    const { data: item, error } = await db
      .from('bill_items')
      .select('nama, qty, subtotal, penanggung')
      .eq('event_id', hasil.eventId)
      .order('nama');
    expect(error).toBeNull();
    expect(item?.map((x) => [x.nama, x.qty, Number(x.subtotal), [...x.penanggung].sort()])).toEqual([
      ['Es Teh', 1, 10_000, [penalang, b, c].sort()],
      ['Nasi Putih', 3, 20_000, [penalang, b, c].sort()],
    ]);
  });

  it('kompensasi: gagal insert bill_items menghapus event beserta porsinya', async () => {
    const { ids, nama } = await buatAnggota(1);
    const items = [barisItemManual('Kopi', 1, 15_000)];
    const unit = uraiKeUnit(items);
    unit[0].penanggung = [ids[0]];
    const { porsi, urut } = porsiPerItem(unit, nama, ids[0]);
    const judul = `${PENANDA}-kompensasi-item`;

    // Nama item null melanggar not null pada bill_items.nama, setelah porsi tersisip.
    const rusak = [{ ...items[0], nama: null as unknown as string }];
    await expect(
      simpanEvent(db, {
        payerId: uid,
        judul,
        tanggal: '2026-11-09',
        total: 15_000,
        mode: 'per_item',
        pembulatanKe: urut[0].id,
        memberPenalang: ids[0],
        porsi,
        items: rusak,
        unit,
      }),
    ).rejects.toMatchObject({ code: '23502' });

    const { data, error } = await db.from('events').select('id').eq('judul', judul);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
