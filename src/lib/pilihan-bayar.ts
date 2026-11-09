import type { ShareStatus } from './contracts';

type BarisPilihan = { shareId: string; status: ShareStatus; penalangId: string };

/**
 * Penalang yang menjadi tujuan transfer: penalang porsi pertama yang dicentang.
 * Satu transfer menuju satu rekening, jadi pilihan lain dikunci ke penalang ini.
 */
export function penalangTerpilih(baris: readonly BarisPilihan[], terpilih: ReadonlySet<string>): string | null {
  return baris.find((b) => terpilih.has(b.shareId))?.penalangId ?? null;
}

/** Hanya porsi belum_bayar milik penalang yang sama (atau belum ada pilihan) yang bisa dicentang. */
export function bolehDicentang(b: BarisPilihan, penalangDipilih: string | null): boolean {
  return b.status === 'belum_bayar' && (penalangDipilih === null || b.penalangId === penalangDipilih);
}
