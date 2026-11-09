import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BuatEventMasukan } from '@/lib/contracts';

const UID = 'uid-penalang';
// 12 anggota; nama "Anggota 00".."Anggota 11" supaya urutan nama dapat ditebak.
const ID = Array.from({ length: 12 }, (_, i) => `${String(i + 10).repeat(4)}-0000-4000-8000-${String(i).padStart(12, '0')}`);
const NAMA: Record<string, string> = Object.fromEntries(ID.map((id, i) => [id, `Anggota ${String(i).padStart(2, '0')}`]));
const PENALANG = ID[5];

let milikPenalang: { id: string }[];

function kueriMembers() {
  const k = {
    _peserta: [] as string[],
    _profil: false,
    select: () => k,
    in: (_: string, ids: string[]) => ((k._peserta = ids), k),
    eq: (kolom: string) => ((k._profil = kolom === 'profile_id'), k),
    limit: () => k,
    returns: async () =>
      k._profil
        ? { data: milikPenalang, error: null }
        : { data: k._peserta.filter((id) => id in NAMA).map((id) => ({ id, nama_panggilan: NAMA[id] })), error: null },
  };
  return k;
}

vi.mock('@/lib/supabase/server', () => ({
  ambilPenalang: async () => ({ id: UID }),
  buatKlienServer: async () => ({ from: () => kueriMembers() }),
}));

const simpanEvent = vi.fn();
vi.mock('@/lib/event-db', async (asli) => ({
  ...(await asli<typeof import('@/lib/event-db')>()),
  simpanEvent: (...a: unknown[]) => simpanEvent(...a),
}));

const { buatEvent } = await import('./event');
vi.spyOn(console, 'error').mockImplementation(() => {});

function rata(subtotal: number, pesertaIds: string[]): BuatEventMasukan {
  return {
    judul: 'Nongki 9 Nov',
    tanggal: '2026-11-09',
    mode: 'rata',
    subtotal,
    pajak: 0,
    biayaLayanan: 0,
    diskon: 0,
    pesertaIds,
    sudahTeralokasi: false,
  };
}

beforeEach(() => {
  milikPenalang = [{ id: PENALANG }];
  simpanEvent.mockReset().mockImplementation(async (_db, r: { porsi: Map<string, { total: number }>; memberPenalang: string | null }) => ({
    eventId: 'ev-1',
    shareToken: 'tok',
    porsi: [...r.porsi].map(([memberId, p], i) => ({
      id: `s-${i}`,
      member_id: memberId,
      total: p.total,
      status: memberId === r.memberPenalang ? 'lunas' : 'belum_bayar',
      claimed_at: null,
      settled_at: null,
    })),
  }));
});

const rencana = () => simpanEvent.mock.calls[0][1] as { porsi: Map<string, { total: number }>; memberPenalang: string | null; pembulatanKe: string };
const porsiDisimpan = () => new Map([...rencana().porsi].map(([id, p]) => [id, p.total]));

describe('buatEvent mode rata: porsi Rp0 tidak dikirim ke simpanEvent', () => {
  it('total 5 untuk 12 peserta dengan penalang ikut: satu porsi milik penalang, lunas', async () => {
    const hasil = await buatEvent(rata(5, ID));
    expect(hasil.ok).toBe(true);
    expect(porsiDisimpan()).toEqual(new Map([[PENALANG, 5]]));
    expect(rencana()).toMatchObject({ memberPenalang: PENALANG, pembulatanKe: PENALANG });
    if (hasil.ok) expect(hasil.data.porsi.map((p) => p.status)).toEqual(['lunas']);
  });

  it('total 5 untuk 11 peserta tanpa penalang: Rp5 ke peserta pertama menurut nama, belum bayar', async () => {
    const tanpa = ID.filter((id) => id !== PENALANG);
    await buatEvent(rata(5, tanpa));
    expect(porsiDisimpan()).toEqual(new Map([[ID[0], 5]]));
    expect(rencana()).toMatchObject({ memberPenalang: null, pembulatanKe: ID[0] });
  });

  it('total 15 untuk 12 peserta: hanya porsi di atas 0, jumlah tetap 15', async () => {
    await buatEvent(rata(15, ID));
    const porsi = porsiDisimpan();
    expect([...porsi.values()].every((t) => t > 0)).toBe(true);
    expect([...porsi.values()].reduce((a, b) => a + b, 0)).toBe(15);
    // 15/12: dasar 1 per orang, sisa 3 ke penalang. Tidak ada bagian 0, semua 12 tersimpan.
    expect(porsi.size).toBe(12);
    expect(porsi.get(PENALANG)).toBe(4);
  });

  it('150.000 untuk 5 dan 100.000 untuk 3 tidak berubah', async () => {
    await buatEvent(rata(150_000, ID.slice(3, 8)));
    expect([...porsiDisimpan().values()]).toEqual([30_000, 30_000, 30_000, 30_000, 30_000]);
    simpanEvent.mockClear();
    await buatEvent(rata(100_000, [ID[0], ID[1], PENALANG]));
    expect(porsiDisimpan()).toEqual(new Map([[PENALANG, 33_334], [ID[0], 33_333], [ID[1], 33_333]]));
  });
});
