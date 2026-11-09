import type { ShareStatus } from '@/lib/contracts';
import { ZONA_WAKTU } from '@/lib/event';

export const LABEL_STATUS: Record<ShareStatus, string> = {
  belum_bayar: 'Belum bayar',
  menunggu_konfirmasi: 'Menunggu konfirmasi',
  lunas: 'Lunas',
};

export const KELAS_STATUS: Record<ShareStatus, string> = {
  belum_bayar: 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50',
  menunggu_konfirmasi: 'bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-amber-50',
  lunas: 'bg-green-200 text-green-950 dark:bg-green-800 dark:text-green-50',
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
