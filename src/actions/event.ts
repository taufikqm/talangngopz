'use server';

import {
  gagal,
  sukses,
  type BuatEvent,
  type BuatEventKeluaran,
  type BuatEventMasukan,
  type Hasil,
} from '@/lib/contracts';
import { idSah } from '@/lib/anggota';
import { PANJANG_JUDUL_MAKS, TOTAL_MAKS, porsiRata, tanggalSah, urutkanPeserta } from '@/lib/event';
import { GalatEventYatim, simpanEvent } from '@/lib/event-db';
import { ambilPenalang, buatKlienServer } from '@/lib/supabase/server';
import { GalatInvarian } from '@/lib/uang';

const PESAN_INTERNAL = 'Event gagal disimpan. Data formulir masih ada, coba simpan lagi.';
const PESERTA_MAKS = 50;

type Tervalidasi = { judul: string; tanggal: string; total: number; pesertaIds: string[] };

/** Mode rata saja (T-06). Klien tidak boleh membawa nominal porsi dalam bentuk apa pun. */
function validasi(m: BuatEventMasukan): Tervalidasi | Hasil<never> {
  const medan: Record<string, string> = {};

  if (m.mode !== 'rata') {
    return gagal('validasi', 'Baru mode Rata yang tersedia.', { mode: 'Mode ini menyusul' });
  }
  if (m.pajak !== 0 || m.biayaLayanan !== 0 || m.diskon !== 0 || m.sudahTeralokasi !== false) {
    return gagal('validasi', 'Pajak, biaya layanan, dan diskon belum didukung.');
  }
  if (m.nominalManual !== undefined || m.unit !== undefined || m.items !== undefined) {
    return gagal('validasi', 'Mode Rata tidak menerima nominal per orang.');
  }

  const judul = typeof m.judul === 'string' ? m.judul.trim().replace(/\s+/g, ' ') : '';
  if (judul.length < 1 || judul.length > PANJANG_JUDUL_MAKS) {
    medan.judul = `Judul wajib diisi, maksimal ${PANJANG_JUDUL_MAKS} karakter.`;
  }
  if (!tanggalSah(m.tanggal)) medan.tanggal = 'Tanggal tidak valid.';
  if (!Number.isSafeInteger(m.subtotal) || m.subtotal <= 0 || m.subtotal > TOTAL_MAKS) {
    medan.total = 'Total harus angka rupiah bulat lebih dari 0.';
  }

  const ids = Array.isArray(m.pesertaIds) ? m.pesertaIds : [];
  if (ids.length === 0) medan.peserta = 'Pilih minimal satu orang.';
  else if (ids.length > PESERTA_MAKS || !ids.every(idSah) || new Set(ids).size !== ids.length) {
    medan.peserta = 'Daftar peserta tidak valid.';
  }

  if (Object.keys(medan).length > 0) return gagal('validasi', 'Periksa lagi isian event.', medan);
  return { judul, tanggal: m.tanggal, total: m.subtotal, pesertaIds: ids };
}

function kodePostgres(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : 'tidak_dikenal';
}

export const buatEvent: BuatEvent = async (m): Promise<Hasil<BuatEventKeluaran>> => {
  const v = validasi(m);
  if ('ok' in v) return v;

  const penalang = await ambilPenalang();
  if (!penalang) return gagal('tidak_berwenang', 'Sesi berakhir. Masuk lagi.');
  const db = await buatKlienServer();

  try {
    const [peserta, milikPenalang] = await Promise.all([
      db
        .from('members')
        .select('id, nama_panggilan')
        .in('id', v.pesertaIds)
        .eq('aktif', true)
        .returns<{ id: string; nama_panggilan: string }[]>(),
      db.from('members').select('id').eq('profile_id', penalang.id).limit(2).returns<{ id: string }[]>(),
    ]);
    if (peserta.error) throw peserta.error;
    if (milikPenalang.error) throw milikPenalang.error;

    if (milikPenalang.data.length === 0) {
      return gagal(
        'validasi',
        'Akunmu belum terhubung ke data anggota mana pun, jadi talangan belum bisa disimpan. Hubungkan dulu lewat kolom profile_id di tabel members.',
      );
    }
    if (milikPenalang.data.length > 1) {
      return gagal('validasi', 'Akunmu terhubung ke lebih dari satu anggota. Sisakan satu di kolom profile_id.');
    }
    if (peserta.data.length !== v.pesertaIds.length) {
      return gagal('validasi', 'Ada peserta yang tidak dikenal atau sudah nonaktif. Muat ulang halaman.', {
        peserta: 'Daftar peserta berubah',
      });
    }

    const memberPenalang = milikPenalang.data[0].id;
    const nama = new Map(peserta.data.map((p) => [p.id, p.nama_panggilan]));
    const urut = urutkanPeserta(
      peserta.data.map((p) => ({ id: p.id, namaPanggilan: p.nama_panggilan })),
      memberPenalang,
    );
    const porsi = porsiRata(v.total, urut);
    const ikut = urut.some((p) => p.id === memberPenalang);

    const hasil = await simpanEvent(db, {
      payerId: penalang.id,
      judul: v.judul,
      tanggal: v.tanggal,
      total: v.total,
      pembulatanKe: urut[0].id,
      memberPenalang: ikut ? memberPenalang : null,
      porsi,
    });

    // Tampilkan sesuai urutan penanggung sisa, sama dengan pratinjau.
    const posisi = new Map(urut.map((p, i) => [p.id, i]));
    return sukses({
      eventId: hasil.eventId,
      shareToken: hasil.shareToken,
      porsi: hasil.porsi
        .map((b) => ({
          shareId: b.id,
          memberId: b.member_id,
          namaPanggilan: nama.get(b.member_id) ?? '',
          total: b.total,
          status: b.status,
          claimedAt: b.claimed_at,
          settledAt: b.settled_at,
        }))
        .sort((a, b) => (posisi.get(a.memberId) ?? 0) - (posisi.get(b.memberId) ?? 0)),
    });
  } catch (e) {
    if (e instanceof GalatEventYatim) {
      console.error('buatEvent: EVENT YATIM, hapus manual', e.eventId, e.kodeAsal);
    } else if (e instanceof GalatInvarian) {
      console.error('buatEvent: invarian uang gagal', e.message);
    } else {
      console.error('buatEvent: galat basis data', kodePostgres(e));
    }
    return gagal('internal', PESAN_INTERNAL);
  }
};
