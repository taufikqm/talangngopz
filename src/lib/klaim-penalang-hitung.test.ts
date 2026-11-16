import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hitungKlaimMenunggu } from './klaim-penalang';

function dbTiruan(hasil: { count: number | null; error: { code?: string } | null }) {
  const panggilan: [string, ...unknown[]][] = [];
  const k = {
    select: (...a: unknown[]) => (panggilan.push(['select', ...a]), k),
    eq: (...a: unknown[]) => (panggilan.push(['eq', ...a]), k),
    then: (selesai: (h: typeof hasil) => unknown) => Promise.resolve(hasil).then(selesai),
  };
  return { db: { from: (t: string) => (panggilan.push(['from', t]), k) } as unknown as SupabaseClient, panggilan };
}

describe('hitungKlaimMenunggu', () => {
  it('hanya menghitung (head), dibatasi payer_id dan status menunggu', async () => {
    const { db, panggilan } = dbTiruan({ count: 3, error: null });
    expect(await hitungKlaimMenunggu(db, 'penalang-1')).toBe(3);
    expect(panggilan).toEqual([
      ['from', 'payment_claims'],
      ['select', 'id', { count: 'exact', head: true }],
      ['eq', 'payer_id', 'penalang-1'],
      ['eq', 'status', 'menunggu'],
    ]);
  });

  it('count kosong dibaca 0', async () => {
    expect(await hitungKlaimMenunggu(dbTiruan({ count: null, error: null }).db, 'p')).toBe(0);
  });

  it('galat: null (menu tidak merusak halaman) dan hanya kode galat yang dicatat', async () => {
    const catat = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await hitungKlaimMenunggu(dbTiruan({ count: null, error: { code: '42501' } }).db, 'p')).toBeNull();
    expect(catat).toHaveBeenCalledWith('menu: gagal menghitung klaim menunggu', '42501');
    catat.mockRestore();
  });
});
