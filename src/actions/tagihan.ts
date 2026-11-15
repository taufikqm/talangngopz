'use server';

import { gagal, sukses, type BuatTeksTagihan } from '@/lib/contracts';
import { idSah, tautanPribadi } from '@/lib/anggota';
import { GalatDasbor, muatDasbor } from '@/lib/dasbor';
import { hariIni } from '@/lib/event';
import { porsiBelumBayar, teksTagihanAnggota, teksTagihanSemua } from '@/lib/tagihan';
import { ambilPenalang, buatKlienServer } from '@/lib/supabase/server';

/**
 * Teks tagihan. Tidak mengubah data. Sesi penalang (kunci anon), bukan service_role: daftar
 * penunggak datang dari muatDasbor yang dibatasi payer_id, jadi anggota yang tidak berutang
 * kepada penalang ini tidak bisa diminta tautannya. Isi teks, terutama token, tidak dicatat.
 */

const PESAN_INTERNAL = 'Terjadi kesalahan. Coba lagi sebentar lagi.';
const PESAN_TANPA_TAUTAN = 'Tautan belum bisa dibuat. Hubungi admin.';

function kode(e: unknown): string {
  if (e instanceof GalatDasbor) return e.kode;
  return typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : 'tidak_dikenal';
}

export const buatTeksTagihan: BuatTeksTagihan = async ({ memberId } = {}) => {
  const penalang = await ambilPenalang();
  if (!penalang) return gagal('tidak_berwenang', 'Masuk sebagai penalang dulu.');
  if (memberId !== undefined && !idSah(memberId)) return gagal('validasi', 'Anggota tidak sah.');

  try {
    const db = await buatKlienServer();
    const dasbor = await muatDasbor(db, penalang.id, hariIni());
    const penunggak = (dasbor.keadaan === 'piutang' ? dasbor.anggota : [])
      .map((a) => ({ ...a, tagihan: porsiBelumBayar(a.rincian) }))
      .filter((a) => a.tagihan.length > 0);

    if (memberId === undefined) {
      if (penunggak.length === 0) return gagal('tidak_ditemukan', 'Tidak ada tagihan yang belum dibayar.');
      return sukses({
        teks: teksTagihanSemua(
          penunggak
            .map((a) => ({ nama: a.nama, total: a.tagihan.reduce((s, p) => s + p.total, 0) }))
            .sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama, 'id')),
        ),
      });
    }

    const orang = penunggak.find((a) => a.memberId === memberId);
    if (!orang) return gagal('tidak_ditemukan', 'Anggota ini tidak punya tagihan yang belum dibayar.');
    if (!process.env.SITE_URL) {
      console.error('buatTeksTagihan: SITE_URL belum diisi');
      return gagal('internal', PESAN_TANPA_TAUTAN);
    }
    const token = await db.from('members').select('access_token').eq('id', memberId).maybeSingle<{ access_token: string }>();
    if (token.error) throw token.error;
    if (!token.data) return gagal('tidak_ditemukan', 'Anggota ini tidak punya tagihan yang belum dibayar.');
    return sukses({ teks: teksTagihanAnggota(orang.nama, orang.tagihan, tautanPribadi(token.data.access_token)) });
  } catch (e) {
    console.error('buatTeksTagihan: galat', kode(e));
    return gagal('internal', PESAN_INTERNAL);
  }
};
