import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BuatEventMasukan } from '@/lib/contracts';
import { barisItemManual } from '@/lib/event';
import { uraiKeUnit, type Unit } from '@/lib/parser';

const UID = 'uid-arjuna';
const M = {
  arjuna: '11111111-1111-4111-8111-111111111111',
  budi: '22222222-2222-4222-8222-222222222222',
  citra: '33333333-3333-4333-8333-333333333333',
};
const NAMA: Record<string, string> = { [M.arjuna]: 'Arjuna', [M.budi]: 'Budi', [M.citra]: 'Citra' };

let anggotaAktif: string[];

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
        ? { data: [{ id: M.arjuna }], error: null }
        : {
            data: k._peserta.filter((id) => anggotaAktif.includes(id)).map((id) => ({ id, nama_panggilan: NAMA[id] })),
            error: null,
          },
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

const dasar = { judul: 'Nongki 9 Nov', tanggal: '2026-11-09', pajak: 0, biayaLayanan: 0, diskon: 0, sudahTeralokasi: false };

function manual(nominalManual: Record<string, number>, subtotal = 100_000): BuatEventMasukan {
  return { ...dasar, mode: 'manual', subtotal, nominalManual };
}

function perItem(unit: Unit[], items = [barisItemManual('Es Teh', 1, 10_000), barisItemManual('Nasi', 3, 15_000)], subtotal = 25_000): BuatEventMasukan {
  return { ...dasar, mode: 'per_item', subtotal, items, unit };
}

function unitTertanda(): Unit[] {
  const unit = uraiKeUnit([barisItemManual('Es Teh', 1, 10_000), barisItemManual('Nasi', 3, 15_000)]);
  unit[0].penanggung = [M.citra, M.budi, M.arjuna];
  unit[1].penanggung = [M.arjuna];
  unit[2].penanggung = [M.budi];
  unit[3].penanggung = [M.citra];
  return unit;
}

beforeEach(() => {
  anggotaAktif = [M.arjuna, M.budi, M.citra];
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

const porsiDisimpan = () => {
  const [, r] = simpanEvent.mock.calls[0];
  return new Map([...(r.porsi as Map<string, { total: number }>)].map(([id, p]) => [NAMA[id], p.total]));
};

describe('buatEvent mode manual', () => {
  it('nominal valid disimpan apa adanya; penalang lunas', async () => {
    const hasil = await buatEvent(manual({ [M.arjuna]: 20_000, [M.budi]: 50_000, [M.citra]: 30_000 }));
    expect(hasil.ok).toBe(true);
    expect(porsiDisimpan()).toEqual(new Map([['Arjuna', 20_000], ['Budi', 50_000], ['Citra', 30_000]]));
    expect(simpanEvent.mock.calls[0][1]).toMatchObject({ mode: 'manual', memberPenalang: M.arjuna, pembulatanKe: M.arjuna });
  });

  it('jumlah tidak sama dengan total ditolak tidak_seimbang', async () => {
    expect(await buatEvent(manual({ [M.budi]: 40_000, [M.citra]: 50_000 }))).toMatchObject({ ok: false, kode: 'tidak_seimbang' });
    expect(simpanEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['pecahan', { [M.budi]: 50_000.5, [M.citra]: 49_999.5 }],
    ['negatif', { [M.budi]: 110_000, [M.citra]: -10_000 }],
    ['id bukan UUID', { 'bukan-id': 100_000 }],
  ])('nominal %s ditolak validasi', async (_, nominal) => {
    expect(await buatEvent(manual(nominal))).toMatchObject({ ok: false, kode: 'validasi' });
    expect(simpanEvent).not.toHaveBeenCalled();
  });

  it('peserta bernominal 0 tidak dibuatkan porsi', async () => {
    await buatEvent(manual({ [M.arjuna]: 0, [M.budi]: 100_000 }));
    expect(porsiDisimpan()).toEqual(new Map([['Budi', 100_000]]));
    expect(simpanEvent.mock.calls[0][1].memberPenalang).toBeNull();
  });

  it('pajak tetap ditolak, dan medan mode lain tidak diterima', async () => {
    expect(await buatEvent({ ...manual({ [M.budi]: 100_000 }), pajak: 1 })).toMatchObject({ kode: 'validasi' });
    expect(await buatEvent({ ...manual({ [M.budi]: 100_000 }), pesertaIds: [M.budi] })).toMatchObject({ kode: 'validasi' });
    expect(await buatEvent({ ...manual({ [M.budi]: 100_000 }), items: [] })).toMatchObject({ kode: 'validasi' });
  });
});

describe('buatEvent mode per item', () => {
  it('porsi dihitung server dari unit yang ditandai; sisa unit ke penalang', async () => {
    const hasil = await buatEvent(perItem(unitTertanda()));
    expect(hasil.ok).toBe(true);
    // Es Teh 10.000/3 -> Arjuna 3.334, Budi 3.333, Citra 3.333. Nasi 15.000 qty 3 -> 5.000 per unit.
    expect(porsiDisimpan()).toEqual(new Map([['Arjuna', 8_334], ['Budi', 8_333], ['Citra', 8_333]]));
    const r = simpanEvent.mock.calls[0][1];
    expect(r).toMatchObject({ mode: 'per_item', pembulatanKe: M.arjuna, memberPenalang: M.arjuna });
    expect(r.items).toHaveLength(2);
    expect(r.unit).toHaveLength(4);
  });

  it('nominal unit palsu dari klien ditolak', async () => {
    const unit = unitTertanda();
    unit[0] = { ...unit[0], subtotal: 1 };
    expect(await buatEvent(perItem(unit))).toMatchObject({ ok: false, kode: 'validasi' });
    expect(simpanEvent).not.toHaveBeenCalled();
  });

  it('satuan dari klien diabaikan; server membentuk ulang baris item', async () => {
    const items = [{ ...barisItemManual('Es Teh', 1, 10_000), satuan: 999_999 }, barisItemManual('Nasi', 3, 15_000)];
    await buatEvent(perItem(unitTertanda(), items));
    expect(simpanEvent.mock.calls[0][1].items[0].satuan).toBe(10_000);
  });

  it('unit belum ditandai ditolak dengan jumlahnya', async () => {
    const unit = unitTertanda();
    unit[3].penanggung = [];
    expect(await buatEvent(perItem(unit))).toMatchObject({ ok: false, kode: 'validasi', pesan: '1 unit belum ditandai.' });
  });

  it('jumlah item tidak sama dengan total ditolak tidak_seimbang', async () => {
    expect(await buatEvent(perItem(unitTertanda(), undefined, 30_000))).toMatchObject({ ok: false, kode: 'tidak_seimbang' });
  });

  it('penanggung nonaktif ditolak', async () => {
    anggotaAktif = [M.arjuna, M.budi];
    expect(await buatEvent(perItem(unitTertanda()))).toMatchObject({ ok: false, kode: 'validasi' });
  });

  it('item gratis harus Rp0', async () => {
    const items = [barisItemManual('Es Teh', 1, 10_000), { ...barisItemManual('Nasi', 3, 15_000), gratis: true }];
    expect(await buatEvent(perItem(unitTertanda(), items))).toMatchObject({ ok: false, kode: 'validasi' });
  });
});
