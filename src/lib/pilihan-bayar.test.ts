import { describe, it, expect } from 'vitest';
import { bolehDicentang, penalangTerpilih } from './pilihan-bayar';

const baris = [
  { shareId: 's1', status: 'belum_bayar' as const, penalangId: 'arjuna' },
  { shareId: 's2', status: 'belum_bayar' as const, penalangId: 'arjuna' },
  { shareId: 's3', status: 'belum_bayar' as const, penalangId: 'citra' },
  { shareId: 's4', status: 'menunggu_konfirmasi' as const, penalangId: 'arjuna' },
  { shareId: 's5', status: 'lunas' as const, penalangId: 'citra' },
];

describe('kunci kotak centang antar-penalang', () => {
  it('belum ada pilihan: semua porsi belum_bayar bisa dicentang, dari penalang mana pun', () => {
    const p = penalangTerpilih(baris, new Set());
    expect(p).toBeNull();
    expect(baris.map((b) => bolehDicentang(b, p))).toEqual([true, true, true, false, false]);
  });

  it('setelah memilih porsi Arjuna: porsi Citra terkunci, porsi Arjuna lain tetap bisa', () => {
    const p = penalangTerpilih(baris, new Set(['s1']));
    expect(p).toBe('arjuna');
    expect(baris.map((b) => bolehDicentang(b, p))).toEqual([true, true, false, false, false]);
  });

  it('setelah memilih porsi Citra: semua porsi Arjuna terkunci', () => {
    const p = penalangTerpilih(baris, new Set(['s3']));
    expect(p).toBe('citra');
    expect(baris.map((b) => bolehDicentang(b, p))).toEqual([false, false, true, false, false]);
  });

  it('porsi menunggu konfirmasi dan lunas tidak pernah bisa dicentang', () => {
    expect(bolehDicentang(baris[3], null)).toBe(false);
    expect(bolehDicentang(baris[4], 'citra')).toBe(false);
  });
});
