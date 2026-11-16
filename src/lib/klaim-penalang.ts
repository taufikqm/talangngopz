import type { SupabaseClient } from '@supabase/supabase-js';
import { hariIni, ZONA_WAKTU } from './event';
import { rupiah, type Rupiah } from './uang';

/**
 * Klaim yang menunggu keputusan penalang (T-11). Pemuat menerima klien bersesi penalang:
 * RLS yang membatasi barisnya, saringan payer_id hanya mempersempit kueri. Tanpa service_role.
 */

/** Galat basis data tanpa isi baris; hanya kodenya yang boleh dicatat. */
export class GalatMuat extends Error {
  constructor(readonly kode: string) {
    super(`Gagal memuat data (${kode})`);
    this.name = 'GalatMuat';
  }
}

export type KlaimTampil = {
  id: string;
  anggota: string;
  nominal: Rupiah;
  /** Sudah berformat: "14:20" bila hari ini, selain itu "8 Nov 14:20". */
  waktu: string;
  pengirim: string;
  /** Judul event isi klaim, dari yang tertua. */
  untuk: string[];
};

function bagianWaktu(iso: string): { tanggal: string; jam: string } {
  const bagian = new Intl.DateTimeFormat('id-ID', {
    timeZone: ZONA_WAKTU,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const ambil = (jenis: Intl.DateTimeFormatPartTypes) => bagian.find((b) => b.type === jenis)?.value ?? '';
  // formatToParts, bukan format(): id-ID memisahkan jam dan menit dengan titik.
  return { tanggal: `${ambil('day')} ${ambil('month').replace('.', '')}`, jam: `${ambil('hour')}:${ambil('minute')}` };
}

/** Jam saja bila hari ini; hari lain memakai tanggal supaya "14:20" tidak ambigu. */
export function waktuKlaim(iso: string, hariIniTeks: string): string {
  const { tanggal, jam } = bagianWaktu(iso);
  return hariIni(new Date(iso)) === hariIniTeks ? jam : `${tanggal} ${jam}`;
}

export function waktuRiwayat(iso: string): string {
  const { tanggal, jam } = bagianWaktu(iso);
  return `${tanggal} ${jam}`;
}

/** "Dika · Rp235.000 · 14:20 · BCA a.n. Dika · untuk Futsal, Kopi Kenangan" */
export function teksKlaim(k: KlaimTampil): string {
  return `${k.anggota} · ${rupiah(k.nominal)} · ${k.waktu} · ${k.pengirim} · untuk ${k.untuk.join(', ')}`;
}

type BarisKlaim = {
  id: string;
  nominal: number;
  waktu_transfer: string;
  pengirim: string;
  members: { nama_panggilan: string };
  payment_claim_shares: { shares: { events: { judul: string; tanggal: string } } }[];
};

/**
 * Klaim berstatus menunggu, dari yang paling lama diklaim. Dengan eventId, hanya klaim yang
 * memuat porsi event itu; klaim lintas event tetap menampilkan seluruh event isinya.
 */
export async function muatKlaimMenunggu(
  db: SupabaseClient,
  penalangId: string,
  hariIniTeks: string,
  eventId?: string,
): Promise<KlaimTampil[]> {
  let idKlaim: string[] | null = null;
  if (eventId) {
    const { data, error } = await db
      .from('payment_claim_shares')
      .select('claim_id, shares!inner(event_id)')
      .eq('shares.event_id', eventId)
      .returns<{ claim_id: string }[]>();
    if (error) throw new GalatMuat(error.code ?? 'tidak_dikenal');
    idKlaim = data.map((d) => d.claim_id);
    if (idKlaim.length === 0) return [];
  }

  const kueri = db
    .from('payment_claims')
    .select('id, nominal, waktu_transfer, pengirim, members(nama_panggilan), payment_claim_shares(shares(events(judul, tanggal)))')
    .eq('payer_id', penalangId)
    .eq('status', 'menunggu')
    .order('claimed_at', { ascending: true })
    .order('id');
  const { data, error } = await (idKlaim ? kueri.in('id', idKlaim) : kueri).returns<BarisKlaim[]>();
  if (error) throw new GalatMuat(error.code ?? 'tidak_dikenal');

  return data.map((k) => ({
    id: k.id,
    anggota: k.members.nama_panggilan,
    nominal: Number(k.nominal),
    waktu: waktuKlaim(k.waktu_transfer, hariIniTeks),
    pengirim: k.pengirim,
    untuk: k.payment_claim_shares
      .map((s) => s.shares.events)
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.judul.localeCompare(b.judul, 'id'))
      .map((e) => e.judul),
  }));
}

/**
 * Jumlah klaim menunggu untuk lencana menu. null bila gagal: menu tidak boleh merusak
 * halaman yang sedang dibuka hanya karena angka lencananya tidak terbaca.
 */
export async function hitungKlaimMenunggu(db: SupabaseClient, penalangId: string): Promise<number | null> {
  const { count, error } = await db
    .from('payment_claims')
    .select('id', { count: 'exact', head: true })
    .eq('payer_id', penalangId)
    .eq('status', 'menunggu');
  if (error) {
    console.error('menu: gagal menghitung klaim menunggu', error.code ?? 'tidak_dikenal');
    return null;
  }
  return count ?? 0;
}
