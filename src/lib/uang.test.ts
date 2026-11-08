import { describe, it, expect } from 'vitest';
import {
  bagiRata,
  uraiUnit,
  hitungPorsi,
  periksaManual,
  rupiah,
  GalatInvarian,
  type Rupiah,
} from './uang';

const peta = (o: Record<string, Rupiah>) => new Map(Object.entries(o));
const jumlahkan = (xs: Rupiah[]) => xs.reduce((a, b) => a + b, 0);

describe('bagiRata', () => {
  it('membagi habis', () => {
    expect(bagiRata(90_000, 3)).toEqual([30_000, 30_000, 30_000]);
  });

  // Kasus SRS 6.6 nomor 1
  it('membagi tidak habis, jumlah tetap pas', () => {
    const b = bagiRata(100_000, 3);
    expect(jumlahkan(b)).toBe(100_000);
    expect(b.toSorted((x, y) => x - y)).toEqual([33_333, 33_333, 33_334]);
  });

  it('satu peserta', () => {
    expect(bagiRata(50_000, 1)).toEqual([50_000]);
  });

  it('nol tetap nol', () => {
    expect(bagiRata(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it('menolak jumlah bagian nol', () => {
    expect(() => bagiRata(1_000, 0)).toThrow(RangeError);
  });
});

describe('uraiUnit', () => {
  // Kasus SRS 6.6 nomor 4
  it('item patungan berdua', () => {
    expect(uraiUnit(30_000, 2)).toEqual([15_000, 15_000]);
  });

  it('subtotal tidak habis dibagi qty, jumlah tetap pas', () => {
    const u = uraiUnit(32_000, 3);
    expect(jumlahkan(u)).toBe(32_000);
    expect(u).toEqual([10_668, 10_666, 10_666]);
  });

  // Inilah alasan AGENTS.md aturan 4: subtotal otoritatif, satuan hanya tampilan.
  it('membagi subtotal, bukan mengalikan satuan', () => {
    const subtotal = 32_000;
    const qty = 3;
    const satuanTampilan = Math.floor(subtotal / qty); // 10.666
    expect(satuanTampilan * qty).not.toBe(subtotal);   // 31.998, meleset Rp2
    expect(jumlahkan(uraiUnit(subtotal, qty))).toBe(subtotal);
  });
});

describe('hitungPorsi', () => {
  const dasar = { pajak: 0, biayaLayanan: 0, diskon: 0 };

  // Kasus SRS 6.6 nomor 2
  it('pajak dibagi proporsional, bukan rata', () => {
    const h = hitungPorsi({
      ...dasar,
      subtotalPeserta: peta({ a: 80_000, b: 20_000 }),
      subtotal: 100_000,
      pajak: 11_000,
      pembulatanKe: 'a',
    });
    expect(h.get('a')!.total).toBe(88_800);
    expect(h.get('b')!.total).toBe(22_200);
    expect(jumlahkan([...h.values()].map((p) => p.total))).toBe(111_000);
  });

  // Kasus SRS 6.6 nomor 3
  it('satu peserta menanggung semua', () => {
    const h = hitungPorsi({
      ...dasar,
      subtotalPeserta: peta({ a: 50_000 }),
      subtotal: 50_000,
      pembulatanKe: 'a',
    });
    expect(h.get('a')!.total).toBe(50_000);
  });

  // Kasus SRS 6.6 nomor 5
  it('subtotal nol tidak melempar galat pembagian nol', () => {
    const h = hitungPorsi({
      ...dasar,
      subtotalPeserta: peta({ a: 0, b: 0 }),
      subtotal: 0,
      pembulatanKe: 'a',
    });
    expect(jumlahkan([...h.values()].map((p) => p.total))).toBe(0);
  });

  it('sisa pembulatan jatuh ke peserta yang ditunjuk', () => {
    const h = hitungPorsi({
      ...dasar,
      subtotalPeserta: peta({ a: 33_333, b: 33_333, c: 33_334 }),
      subtotal: 100_000,
      pajak: 1,
      pembulatanKe: 'b',
    });
    expect(jumlahkan([...h.values()].map((p) => p.total))).toBe(100_001);
    expect(h.get('b')!.total).toBeGreaterThan(h.get('a')!.total);
  });

  it('menolak pembulatanKe yang bukan peserta', () => {
    expect(() =>
      hitungPorsi({
        ...dasar,
        subtotalPeserta: peta({ a: 10_000 }),
        subtotal: 10_000,
        pembulatanKe: 'z',
      }),
    ).toThrow(RangeError);
  });

  // AGENTS.md aturan 3. Ini penjaga satu-satunya terhadap pajak ganda.
  describe('sudahTeralokasi', () => {
    it('melewati alokasi dan mengabaikan pajak', () => {
      const h = hitungPorsi({
        subtotalPeserta: peta({ a: 16_500, b: 72_600, c: 28_600 }),
        subtotal: 117_700,
        pajak: 20_200,       // diabaikan
        biayaLayanan: 0,
        diskon: 0,
        pembulatanKe: 'a',
        sudahTeralokasi: true,
      });
      expect(jumlahkan([...h.values()].map((p) => p.total))).toBe(117_700);
      expect([...h.values()].every((p) => p.pajakPorsi === 0)).toBe(true);
    });

    it('tanpa penanda, pajak yang sama menghasilkan total berbeda', () => {
      const tanpa = hitungPorsi({
        subtotalPeserta: peta({ a: 16_500, b: 72_600, c: 28_600 }),
        subtotal: 117_700,
        pajak: 20_200,
        biayaLayanan: 0,
        diskon: 0,
        pembulatanKe: 'a',
      });
      // 137.900, bukan 117.700. Inilah pajak ganda bila penanda lupa dipasang.
      expect(jumlahkan([...tanpa.values()].map((p) => p.total))).toBe(137_900);
    });
  });

  // Uji properti: invarian harus bertahan pada kombinasi acak.
  it('invarian bertahan pada 1.000 kombinasi acak', () => {
    const acak = (maks: number) => Math.floor(Math.random() * maks);
    for (let i = 0; i < 1_000; i++) {
      const n = 1 + acak(12);
      const ids = Array.from({ length: n }, (_, k) => `p${k}`);
      const subs = ids.map(() => acak(500_000));
      const subtotal = jumlahkan(subs);
      const pajak = acak(50_000);
      const biayaLayanan = acak(20_000);
      const diskon = Math.min(acak(10_000), subtotal);

      const h = hitungPorsi({
        subtotalPeserta: new Map(ids.map((id, k) => [id, subs[k]])),
        subtotal,
        pajak,
        biayaLayanan,
        diskon,
        pembulatanKe: ids[acak(n)],
      });

      const total = jumlahkan([...h.values()].map((p) => p.total));
      expect(total).toBe(subtotal + pajak + biayaLayanan - diskon);
      expect([...h.values()].every((p) => Number.isInteger(p.total))).toBe(true);
    }
  });

  it('tidak pernah menghasilkan porsi negatif pada diskon wajar', () => {
    const h = hitungPorsi({
      subtotalPeserta: peta({ a: 10_000, b: 90_000 }),
      subtotal: 100_000,
      pajak: 0,
      biayaLayanan: 0,
      diskon: 50_000,
      pembulatanKe: 'b',
    });
    expect([...h.values()].every((p) => p.total >= 0)).toBe(true);
    expect(jumlahkan([...h.values()].map((p) => p.total))).toBe(50_000);
  });
});

describe('periksaManual', () => {
  // Kasus SRS 6.6 nomor 6
  it('mendeteksi input yang tidak seimbang', () => {
    expect(periksaManual(peta({ a: 40_000, b: 50_000 }), 100_000)).toBe(10_000);
  });

  it('nol bila seimbang', () => {
    expect(periksaManual(peta({ a: 40_000, b: 60_000 }), 100_000)).toBe(0);
  });
});

describe('rupiah', () => {
  it('memformat dengan titik ribuan', () => {
    expect(rupiah(1_234_567)).toBe('Rp1.234.567');
    expect(rupiah(0)).toBe('Rp0');
  });
});

describe('GalatInvarian', () => {
  it('membawa angka yang diharapkan dan yang didapat', () => {
    const g = new GalatInvarian(100, 99, 'uji');
    expect(g.diharapkan).toBe(100);
    expect(g.didapat).toBe(99);
  });
});
