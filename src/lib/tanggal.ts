/** "9 Nov 2026" dari kolom date (YYYY-MM-DD). */
export function tampilTanggal(tanggal: string): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${tanggal}T00:00:00Z`))
    .replace('.', '');
}
