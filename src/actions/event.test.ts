import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BuatEventMasukan } from '@/lib/contracts';

const UID = 'uid-arjuna';
const M = {
  arjuna: '11111111-1111-4111-8111-111111111111',
  budi: '22222222-2222-4222-8222-222222222222',
  citra: '33333333-3333-4333-8333-333333333333',
};
const NAMA: Record<string, string> = { [M.arjuna]: 'Arjuna', [M.budi]: 'Budi', [M.citra]: 'Citra' };

let penalang: { id: string } | null;
let anggotaAktif: string[];
let milikPenalang: { id: string }[];

/** Kueri members: `.in(...)` untuk peserta, `.eq('profile_id', ...)` untuk anggota penalang. */
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
        : {
            data: k._peserta.filter((id) => anggotaAktif.includes(id)).map((id) => ({ id, nama_panggilan: NAMA[id] })),
            error: null,
          },
  };
  return k;
}

vi.mock('@/lib/supabase/server', () => ({
  ambilPenalang: async () => penalang,
  buatKlienServer: async () => ({ from: () => kueriMembers() }),
}));

const simpanEvent = vi.fn();
vi.mock('@/lib/event-db', async (asli) => ({
  ...(await asli<typeof import('@/lib/event-db')>()),
  simpanEvent: (...a: unknown[]) => simpanEvent(...a),
}));

const { buatEvent } = await import('./event');
const { GalatEventYatim } = await import('@/lib/event-db');
vi.spyOn(console, 'error').mockImplementation(() => {});

function masukan(ubah: Partial<BuatEventMasukan> = {}): BuatEventMasukan {
  return {
    judul: 'Nongki 9 Nov',
    tanggal: '2026-11-09',
    mode: 'rata',
    subtotal: 100_000,
    pajak: 0,
    biayaLayanan: 0,
    diskon: 0,
    pesertaIds: [M.budi, M.citra, M.arjuna],
    sudahTeralokasi: false,
    ...ubah,
  };
}

beforeEach(() => {
  penalang = { id: UID };
  anggotaAktif = [M.arjuna, M.budi, M.citra];
  milikPenalang = [{ id: M.arjuna }];
  simpanEvent.mockReset().mockImplementation(async (_db, r: { porsi: Map<string, { total: number }>; memberPenalang: string | null }) => ({
    eventId: 'ev-1',
    shareToken: 'tok',
    porsi: [...r.porsi].map(([memberId, p], i) => ({
      id: `s-${i}`,
      member_id: memberId,
      total: p.total,
      status: memberId === r.memberPenalang ? 'lunas' : 'belum_bayar',
      claimed_at: null,
      settled_at: memberId === r.memberPenalang ? '2026-11-09T10:00:00Z' : null,
    })),
  }));
});

describe('buatEvent', () => {
  it('porsi dihitung server; sisa pembulatan ke penalang; porsi penalang lunas', async () => {
    const hasil = await buatEvent(masukan());
    expect(hasil.ok).toBe(true);
    const [, rencana] = simpanEvent.mock.calls[0];
    expect(rencana).toMatchObject({ payerId: UID, total: 100_000, pembulatanKe: M.arjuna, memberPenalang: M.arjuna });
    expect([...rencana.porsi].map(([id, p]: [string, { total: number }]) => [NAMA[id], p.total])).toEqual([
      ['Arjuna', 33_334],
      ['Budi', 33_333],
      ['Citra', 33_333],
    ]);
    if (hasil.ok) {
      expect(hasil.data.porsi.map((x) => [x.namaPanggilan, x.total, x.status])).toEqual([
        ['Arjuna', 33_334, 'lunas'],
        ['Budi', 33_333, 'belum_bayar'],
        ['Citra', 33_333, 'belum_bayar'],
      ]);
    }
  });

  it('penalang tidak dicentang: sisa ke peserta pertama menurut nama, tanpa porsi lunas', async () => {
    await buatEvent(masukan({ pesertaIds: [M.citra, M.budi] , subtotal: 100_001 }));
    const [, rencana] = simpanEvent.mock.calls[0];
    expect(rencana.pembulatanKe).toBe(M.budi);
    expect(rencana.memberPenalang).toBeNull();
    expect(rencana.porsi.get(M.budi).total).toBe(50_001);
  });

  it.each([
    ['pajak', { pajak: 1_000 }],
    ['biaya layanan', { biayaLayanan: 500 }],
    ['diskon', { diskon: 500 }],
    ['sudahTeralokasi', { sudahTeralokasi: true }],
    ['mode manual', { mode: 'manual' as const }],
    ['nominal porsi dari klien', { nominalManual: { [M.budi]: 1 } }],
    ['total pecahan', { subtotal: 1000.5 }],
    ['total nol', { subtotal: 0 }],
    ['peserta ganda', { pesertaIds: [M.budi, M.budi] }],
    ['peserta kosong', { pesertaIds: [] }],
    ['tanggal tidak ada', { tanggal: '2026-02-30' }],
    ['judul kosong', { judul: '   ' }],
  ])('menolak %s sebagai validasi tanpa menyimpan', async (_, ubah) => {
    const hasil = await buatEvent(masukan(ubah));
    expect(hasil).toMatchObject({ ok: false, kode: 'validasi' });
    expect(simpanEvent).not.toHaveBeenCalled();
  });

  it('penalang tanpa profile_id di members ditolak dengan pesan jelas', async () => {
    milikPenalang = [];
    const hasil = await buatEvent(masukan());
    expect(hasil).toMatchObject({ ok: false, kode: 'validasi', pesan: expect.stringContaining('profile_id') });
    expect(simpanEvent).not.toHaveBeenCalled();
  });

  it('peserta nonaktif atau tak dikenal ditolak', async () => {
    anggotaAktif = [M.arjuna, M.budi];
    expect(await buatEvent(masukan())).toMatchObject({ ok: false, kode: 'validasi' });
  });

  it('tanpa sesi ditolak', async () => {
    penalang = null;
    expect(await buatEvent(masukan())).toMatchObject({ ok: false, kode: 'tidak_berwenang' });
  });

  it('event yatim menjadi galat internal dan dicatat dengan id event', async () => {
    simpanEvent.mockRejectedValue(new GalatEventYatim('ev-yatim', '23503'));
    const hasil = await buatEvent(masukan());
    expect(hasil).toMatchObject({ ok: false, kode: 'internal' });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain('ev-yatim');
  });
});
