/**
 * Waktu transfer klaim. Formulir peserta hanya meminta jam (HH:MM) di zona sirkel
 * (+07:00, tanpa musim panas). Tanggalnya hari ini, kecuali jam itu lebih dari
 * 10 menit di depan sekarang: berarti transfer terjadi kemarin (misalnya transfer
 * 23:50, klaim dikirim 00:05).
 */

export const TOLERANSI_MASA_DEPAN_MS = 10 * 60 * 1000;
const OFFSET_JAKARTA_MS = 7 * 60 * 60 * 1000;
const POLA_JAM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** ISO 8601 bertanggal dan berzona, misalnya 2026-11-09T14:20:00+07:00. */
const POLA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** "14:20" menjadi "2026-11-09T14:20:00+07:00", atau null bila jam tidak sah. */
export function waktuTransferDariJam(jam: string, sekarang: Date = new Date()): string | null {
  const cocok = POLA_JAM.exec(jam);
  if (!cocok) return null;
  // Tanggal kalender Jakarta saat ini, dihitung dengan menggeser jam UTC.
  const kiniJakarta = new Date(sekarang.getTime() + OFFSET_JAKARTA_MS);
  const hari = Date.UTC(kiniJakarta.getUTCFullYear(), kiniJakarta.getUTCMonth(), kiniJakarta.getUTCDate());
  let instan = hari + (Number(cocok[1]) * 60 + Number(cocok[2])) * 60_000 - OFFSET_JAKARTA_MS;
  if (instan - sekarang.getTime() > TOLERANSI_MASA_DEPAN_MS) instan -= 24 * 60 * 60 * 1000;
  const tanggal = new Date(instan + OFFSET_JAKARTA_MS).toISOString().slice(0, 10);
  return `${tanggal}T${cocok[1]}:${cocok[2]}:00+07:00`;
}

/** Sah bila berformat ISO berzona, tanggalnya nyata, dan tidak lebih dari 10 menit ke depan. */
export function waktuTransferSah(nilai: unknown, sekarang: Date = new Date()): nilai is string {
  if (typeof nilai !== 'string' || !POLA_ISO.test(nilai)) return false;
  const t = Date.parse(nilai);
  if (Number.isNaN(t)) return false;
  // Date.parse menggulung tanggal mustahil (31 Feb); pastikan tanggal tertulis memang ada.
  const [th, bl, tg] = nilai.slice(0, 10).split('-').map(Number);
  const cek = new Date(Date.UTC(th, bl - 1, tg));
  if (cek.getUTCMonth() !== bl - 1 || cek.getUTCDate() !== tg) return false;
  return t - sekarang.getTime() <= TOLERANSI_MASA_DEPAN_MS;
}
