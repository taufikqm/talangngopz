import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShareStatus } from './contracts';
import { GalatMuat } from './klaim-penalang';
import type { Rupiah } from './uang';

/**
 * Daftar semua talangan milik penalang (layar Event). Klien bersesi penalang: RLS membatasi
 * baris, saringan payer_id hanya mempersempit kueri. Tanpa service_role, tanpa migrasi.
 */

export const BATAS_DAFTAR_EVENT = 50;

export type EventRingkas = {
  id: string;
  judul: string;
  tanggal: string;
  total: Rupiah;
  jumlahPorsi: number;
  jumlahLunas: number;
  /** Lunas bila semua porsi lunas; menunggu bila ada klaim menunggu; selain itu belum bayar. */
  status: ShareStatus;
};

export type BarisEvent = {
  id: string;
  judul: string;
  tanggal: string;
  total: number | string;
  shares: { status: ShareStatus; total: number | string }[];
};

/**
 * Porsi Rp0 tidak dihitung: tidak ada yang ditagih darinya, jadi tidak boleh menahan event
 * dari status lunas (sama dengan dasbor).
 */
export function ringkasEvent(e: BarisEvent): EventRingkas {
  const porsi = e.shares.filter((s) => Number(s.total) > 0);
  const jumlahLunas = porsi.filter((s) => s.status === 'lunas').length;
  const status: ShareStatus =
    jumlahLunas === porsi.length ? 'lunas' : porsi.some((s) => s.status === 'menunggu_konfirmasi') ? 'menunggu_konfirmasi' : 'belum_bayar';
  return { id: e.id, judul: e.judul, tanggal: e.tanggal, total: Number(e.total), jumlahPorsi: porsi.length, jumlahLunas, status };
}

export async function muatDaftarEvent(db: SupabaseClient, penalangId: string): Promise<EventRingkas[]> {
  const { data, error } = await db
    .from('events')
    .select('id, judul, tanggal, total, shares(status, total)')
    .eq('payer_id', penalangId)
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(BATAS_DAFTAR_EVENT)
    .returns<BarisEvent[]>();
  if (error) throw new GalatMuat(error.code ?? 'tidak_dikenal');
  return data.map(ringkasEvent);
}
