import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BATAS_DAFTAR_EVENT, muatDaftarEvent, ringkasEvent, type BarisEvent } from './daftar-event';
import { GalatMuat } from './klaim-penalang';

const event = (shares: BarisEvent['shares']): BarisEvent => ({ id: 'e1', judul: 'Futsal', tanggal: '2026-11-05', total: '45000', shares });

describe('ringkasEvent', () => {
  it('semua porsi lunas: lunas, dihitung sebagai angka', () => {
    const r = ringkasEvent(event([{ status: 'lunas', total: 20_000 }, { status: 'lunas', total: '25000' }]));
    expect(r).toEqual({ id: 'e1', judul: 'Futsal', tanggal: '2026-11-05', total: 45_000, jumlahPorsi: 2, jumlahLunas: 2, status: 'lunas' });
  });

  it('ada klaim menunggu: menunggu konfirmasi, walau ada yang belum bayar', () => {
    const r = ringkasEvent(event([
      { status: 'lunas', total: 10_000 },
      { status: 'menunggu_konfirmasi', total: 10_000 },
      { status: 'belum_bayar', total: 25_000 },
    ]));
    expect(r).toMatchObject({ jumlahPorsi: 3, jumlahLunas: 1, status: 'menunggu_konfirmasi' });
  });

  it('hanya lunas dan belum bayar: belum bayar', () => {
    expect(ringkasEvent(event([{ status: 'lunas', total: 5_000 }, { status: 'belum_bayar', total: 40_000 }])).status).toBe('belum_bayar');
  });

  it('porsi Rp0 tidak dihitung dan tidak menahan status lunas', () => {
    const r = ringkasEvent(event([{ status: 'lunas', total: 45_000 }, { status: 'belum_bayar', total: 0 }]));
    expect(r).toMatchObject({ jumlahPorsi: 1, jumlahLunas: 1, status: 'lunas' });
  });
});

function dbTiruan(hasil: { data: BarisEvent[] | null; error: { code?: string } | null }) {
  const panggilan: [string, ...unknown[]][] = [];
  const k = {
    select: (...a: unknown[]) => (panggilan.push(['select', ...a]), k),
    eq: (...a: unknown[]) => (panggilan.push(['eq', ...a]), k),
    order: (...a: unknown[]) => (panggilan.push(['order', ...a]), k),
    limit: (...a: unknown[]) => (panggilan.push(['limit', ...a]), k),
    returns: () => Promise.resolve(hasil),
  };
  return { db: { from: (t: string) => (panggilan.push(['from', t]), k) } as unknown as SupabaseClient, panggilan };
}

describe('muatDaftarEvent', () => {
  it('dibatasi payer_id, terbaru dulu (tanggal lalu waktu dibuat), maksimal 50', async () => {
    const { db, panggilan } = dbTiruan({ data: [event([{ status: 'lunas', total: 1_000 }])], error: null });
    const hasil = await muatDaftarEvent(db, 'penalang-1');
    expect(hasil).toHaveLength(1);
    expect(panggilan.filter(([n]) => n !== 'select')).toEqual([
      ['from', 'events'],
      ['eq', 'payer_id', 'penalang-1'],
      ['order', 'tanggal', { ascending: false }],
      ['order', 'created_at', { ascending: false }],
      ['limit', BATAS_DAFTAR_EVENT],
    ]);
  });

  it('galat basis data: GalatMuat berkode, bukan data kosong yang menyesatkan', async () => {
    const { db } = dbTiruan({ data: null, error: { code: '42501' } });
    await expect(muatDaftarEvent(db, 'p')).rejects.toMatchObject({ kode: '42501' });
    await expect(muatDaftarEvent(db, 'p')).rejects.toBeInstanceOf(GalatMuat);
  });
});

vi.restoreAllMocks();
