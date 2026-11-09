import { describe, it, expect } from 'vitest';
import { waktuTransferDariJam, waktuTransferSah } from './waktu-transfer';

// Jam dinding Jakarta (+07:00) diubah ke instan UTC.
const jakarta = (iso: string) => new Date(`${iso}+07:00`);

describe('waktuTransferDariJam', () => {
  it('jam yang sama dengan sekarang memakai tanggal hari ini', () => {
    expect(waktuTransferDariJam('14:20', jakarta('2026-11-09T14:20:30'))).toBe('2026-11-09T14:20:00+07:00');
  });

  it('lewat tengah malam: transfer 23:50, kirim 00:05 memakai tanggal kemarin', () => {
    expect(waktuTransferDariJam('23:50', jakarta('2026-11-10T00:05:00'))).toBe('2026-11-09T23:50:00+07:00');
  });

  it('lewat tengah malam di pergantian bulan dan tahun', () => {
    expect(waktuTransferDariJam('23:58', jakarta('2027-01-01T00:02:00'))).toBe('2026-12-31T23:58:00+07:00');
  });

  it('tepat 10 menit ke depan masih hari ini; lebih dari itu menjadi kemarin', () => {
    expect(waktuTransferDariJam('14:30', jakarta('2026-11-09T14:20:00'))).toBe('2026-11-09T14:30:00+07:00');
    expect(waktuTransferDariJam('14:31', jakarta('2026-11-09T14:20:00'))).toBe('2026-11-08T14:31:00+07:00');
  });

  it('hasilnya selalu lolos waktuTransferSah pada saat yang sama', () => {
    for (const [jamIsi, kini] of [['23:50', '2026-11-10T00:05:00'], ['00:00', '2026-11-09T23:59:00'], ['07:00', '2026-11-09T07:00:00']]) {
      const sekarang = jakarta(kini);
      expect(waktuTransferSah(waktuTransferDariJam(jamIsi, sekarang), sekarang)).toBe(true);
    }
  });

  it.each(['', '24:00', '9:5', '14:60', 'jam dua', '14:20:00'])('jam tidak sah "%s" menghasilkan null', (j) => {
    expect(waktuTransferDariJam(j, jakarta('2026-11-09T14:20:00'))).toBeNull();
  });
});

describe('waktuTransferSah (server)', () => {
  const kini = jakarta('2026-11-09T14:20:00');

  it('menerima ISO berzona sampai 10 menit ke depan', () => {
    expect(waktuTransferSah('2026-11-09T14:20:00+07:00', kini)).toBe(true);
    expect(waktuTransferSah('2026-11-09T07:30:00Z', kini)).toBe(true);
    expect(waktuTransferSah('2026-11-09T14:30:00+07:00', kini)).toBe(true);
  });

  it('menolak lebih dari 10 menit ke depan', () => {
    expect(waktuTransferSah('2026-11-09T14:30:01+07:00', kini)).toBe(false);
  });

  it.each([
    ['tanpa zona', '2026-11-09T14:20:00'],
    ['tanggal mustahil', '2026-02-31T10:00:00+07:00'],
    ['bukan teks', 1_762_672_800_000],
    ['kosong', ''],
    ['format lain', '09/11/2026 14:20'],
  ])('menolak %s', (_, nilai) => {
    expect(waktuTransferSah(nilai, kini)).toBe(false);
  });
});
