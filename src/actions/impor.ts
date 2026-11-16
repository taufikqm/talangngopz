'use server';

import { gagal, type PratinjauImpor } from '@/lib/contracts';
import { pratinjauDariTeks } from '@/lib/impor';
import { ambilPenalang } from '@/lib/supabase/server';

/**
 * Pratinjau impor tabel ChatGPT. Tidak menyimpan apa pun dan tidak mencatat teksnya ke log:
 * isinya masukan bebas yang bisa memuat data pribadi.
 */
export const pratinjauImpor: PratinjauImpor = async ({ teks }) => {
  const penalang = await ambilPenalang();
  if (!penalang) return gagal('tidak_berwenang', 'Sesi berakhir. Masuk lagi.');
  try {
    return pratinjauDariTeks(teks);
  } catch {
    console.error('pratinjauImpor: galat tak terduga');
    return gagal('internal', 'Tabel gagal dibaca. Coba lagi sebentar lagi.');
  }
};
