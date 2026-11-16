// Jalur impor T-16 dari ujung ke ujung dengan basis data tiruan: tempelan ChatGPT -> pratinjauImpor
// -> muatan yang dibentuk formulir -> buatEvent. Yang dibuktikan: tabel dengan selisih 0 tersimpan
// persis sebesar total tercetak (tanpa alokasi ulang), dan yang selisihnya bukan 0 tidak bisa disimpan.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BuatEventMasukan } from '@/lib/contracts';
import { barisItemManual } from '@/lib/event';
import { uraiKeUnit } from '@/lib/parser';
import { SAMPEL_INDOMIE } from '@/lib/__fixtures__/chatgpt';

const M = {
  arjuna: '11111111-1111-4111-8111-111111111111',
  budi: '22222222-2222-4222-8222-222222222222',
  citra: '33333333-3333-4333-8333-333333333333',
};
const NAMA: Record<string, string> = { [M.arjuna]: 'Arjuna', [M.budi]: 'Budi', [M.citra]: 'Citra' };

let sesi: { id: string } | null;

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
        : { data: k._peserta.map((id) => ({ id, nama_panggilan: NAMA[id] })), error: null },
  };
  return k;
}

vi.mock('@/lib/supabase/server', () => ({
  ambilPenalang: async () => sesi,
  buatKlienServer: async () => ({ from: () => kueriMembers() }),
}));

const simpanEvent = vi.fn();
vi.mock('@/lib/event-db', async (asli) => ({
  ...(await asli<typeof import('@/lib/event-db')>()),
  simpanEvent: (...a: unknown[]) => simpanEvent(...a),
}));

const { pratinjauImpor } = await import('./impor');
const { buatEvent } = await import('./event');
vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  sesi = { id: 'uid-arjuna' };
  simpanEvent.mockReset().mockImplementation(async (_db, r: { porsi: Map<string, { total: number }>; memberPenalang: string | null }) => ({
    eventId: 'ev-1',
    shareToken: 'tok',
    porsi: [...r.porsi].map(([memberId, p], i) => ({ id: `s-${i}`, member_id: memberId, total: p.total, status: 'belum_bayar', claimed_at: null, settled_at: null })),
  }));
});

/** Meniru FormulirEvent.payload(): item disunting menjadi baris manual, unit ditandai bergiliran. */
function muatanDariPratinjau(d: { items: { nama: string; qty: number; subtotal: number }[]; total: number | null }): BuatEventMasukan {
  const barisItem = d.items.map((it) => barisItemManual(it.nama, it.qty, it.subtotal, it.subtotal === 0));
  const orang = [M.arjuna, M.budi, M.citra];
  const unit = uraiKeUnit(barisItem).map((u, i) => ({ ...u, penanggung: u.subtotal > 0 ? [orang[i % 3]] : [] }));
  const total = d.total ?? d.items.reduce((a, it) => a + it.subtotal, 0);
  return { judul: 'Indomie', tanggal: '2026-11-09', mode: 'per_item', subtotal: total, pajak: 0, biayaLayanan: 0, diskon: 0, sudahTeralokasi: false, items: barisItem, unit };
}

describe('pratinjauImpor', () => {
  it('tanpa sesi: tidak berwenang, dan teks tidak diurai', async () => {
    sesi = null;
    expect(await pratinjauImpor({ teks: SAMPEL_INDOMIE })).toMatchObject({ ok: false, kode: 'tidak_berwenang' });
  });

  it('dengan sesi: hasil sesuai kontrak', async () => {
    const h = await pratinjauImpor({ teks: SAMPEL_INDOMIE });
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.data).toMatchObject({ total: 222_200, selisih: 0, sudahTeralokasi: true, namaTidakCocok: [] });
  });

  it('teks bukan tabel: galat validasi berpesan jelas, tanpa melempar', async () => {
    expect(await pratinjauImpor({ teks: 'halo, ini bukan tabel' })).toMatchObject({ ok: false, kode: 'validasi' });
  });
});

describe('impor sampai simpan', () => {
  it('Indomie (selisih 0): tersimpan tepat Rp222.200, tanpa pajak dihitung dua kali', async () => {
    const h = await pratinjauImpor({ teks: SAMPEL_INDOMIE });
    if (!h.ok) throw new Error(h.pesan);
    const hasil = await buatEvent(muatanDariPratinjau(h.data));
    expect(hasil.ok).toBe(true);
    const [, r] = simpanEvent.mock.calls[0];
    const porsi = r.porsi as Map<string, { total: number; subtotal: number }>;
    expect([...porsi.values()].reduce((a, p) => a + p.total, 0)).toBe(222_200);
    expect([...porsi.values()].reduce((a, p) => a + p.subtotal, 0)).toBe(222_200);
    expect(r).toMatchObject({ mode: 'per_item', total: 222_200 });
    expect(r.items).toHaveLength(6);
  });

  it('total dibayar lebih besar dari jumlah item (selisih bukan 0): ditolak, tidak ada yang disimpan', async () => {
    const h = await pratinjauImpor({ teks: `| Menu | Qty | Subtotal |\n| Nasi | 1 | Rp10.000 |\n| Total | | Rp12.000 |` });
    if (!h.ok) throw new Error(h.pesan);
    const hasil = await buatEvent(muatanDariPratinjau(h.data));
    expect(hasil).toMatchObject({ ok: false, kode: 'tidak_seimbang' });
    expect(simpanEvent).not.toHaveBeenCalled();
  });
});
