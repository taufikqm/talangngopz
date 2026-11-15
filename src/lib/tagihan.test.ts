import { describe, it, expect } from 'vitest';
import type { RincianPorsi } from './dasbor';
import { porsiBelumBayar, teksTagihanAnggota, teksTagihanSemua } from './tagihan';

const porsi = (judul: string, tanggal: string, total: number, status: RincianPorsi['status'] = 'belum_bayar'): RincianPorsi => ({
  shareId: `s-${judul}`,
  judul,
  tanggal,
  total,
  status,
});

describe('porsiBelumBayar', () => {
  it('hanya belum_bayar: porsi menunggu, lunas, dan Rp0 tidak ditagih', () => {
    const r = porsiBelumBayar([
      porsi('Futsal', '2026-11-05', 20_000),
      porsi('Kopi', '2026-11-08', 15_000, 'menunggu_konfirmasi'),
      porsi('Bakso', '2026-11-09', 9_000, 'lunas'),
      porsi('Nol', '2026-11-09', 0),
    ]);
    expect(r.map((p) => p.judul)).toEqual(['Futsal']);
  });
});

describe('teksTagihanAnggota', () => {
  it('format persis: sapaan, baris bertanggal pendek, total, tautan', () => {
    expect(
      teksTagihanAnggota('Dika', [porsi('Futsal', '2026-11-05', 20_000), porsi('Kopi Kenangan', '2026-11-08', 15_000)], 'https://talangan.test/me/abc'),
    ).toBe(
      [
        'Halo Dika, ini tagihan talangan kamu:',
        '• Futsal (5 Nov): Rp20.000',
        '• Kopi Kenangan (8 Nov): Rp15.000',
        'Total: Rp35.000',
        'Cek dan bayar di: https://talangan.test/me/abc',
      ].join('\n'),
    );
  });

  it('total ribuan memakai titik, dan sama dengan jumlah baris yang tampil', () => {
    const t = teksTagihanAnggota('Citra', [porsi('A', '2026-01-02', 1_000_000), porsi('B', '2026-12-31', 234_567)], 'u');
    expect(t).toContain('Total: Rp1.234.567');
  });

  it('tanpa porsi melempar galat, bukan menghasilkan tagihan kosong', () => {
    expect(() => teksTagihanAnggota('Dika', [], 'u')).toThrow();
  });
});

describe('teksTagihanSemua', () => {
  it('nama dan nominal saja, tanpa tautan pribadi', () => {
    const t = teksTagihanSemua([
      { nama: 'Dika', total: 35_000 },
      { nama: 'Citra', total: 10_000 },
    ]);
    expect(t).toBe(['Tagihan talangan yang belum dibayar:', '• Dika: Rp35.000', '• Citra: Rp10.000', 'Total: Rp45.000'].join('\n'));
    expect(t).not.toMatch(/https?:|\/me\//);
  });

  it('tanpa penunggak melempar galat', () => {
    expect(() => teksTagihanSemua([])).toThrow();
  });
});
