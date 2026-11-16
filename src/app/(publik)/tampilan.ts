import type { ShareStatus } from '@/lib/contracts';
import { ZONA_WAKTU } from '@/lib/event';

export const LABEL_STATUS: Record<ShareStatus, string> = {
  belum_bayar: 'Belum bayar',
  menunggu_konfirmasi: 'Menunggu konfirmasi',
  lunas: 'Lunas',
};

// Warna status sama dengan LencanaStatus di Beranda (token tl-* di globals.css).
export const KELAS_STATUS: Record<ShareStatus, string> = {
  belum_bayar: 'bg-tl-belum text-tl-belum-teks',
  menunggu_konfirmasi: 'bg-tl-menunggu text-tl-menunggu-teks',
  lunas: 'bg-tl-lunas text-tl-lunas-teks',
};

/** "9 Nov 2026" dari kolom date (YYYY-MM-DD). */
export function tampilTanggal(tanggal: string): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${tanggal}T00:00:00Z`))
    .replace('.', '');
}

/** "14:20" di zona sirkel, dari timestamptz. Zona eksplisit agar server dan peramban sama. */
export function tampilJam(waktu: string): string {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA_WAKTU })
    .format(new Date(waktu))
    .replace('.', ':');
}

/** "9 Nov 2026" di zona sirkel, dari timestamptz. */
export function tampilTanggalWaktu(waktu: string): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONA_WAKTU })
    .format(new Date(waktu))
    .replace('.', '');
}
