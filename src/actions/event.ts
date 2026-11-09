'use server';

import {
  gagal,
  sukses,
  type BuatEvent,
  type BuatEventKeluaran,
  type BuatEventMasukan,
  type Hasil,
  type SplitMode,
} from '@/lib/contracts';
import { idSah } from '@/lib/anggota';
import {
  PANJANG_JUDUL_MAKS,
  TOTAL_MAKS,
  barisItemManual,
  buangPorsiNol,
  porsiManual,
  porsiPerItem,
  porsiRata,
  tanggalSah,
  urutkanPeserta,
  type PesertaUrut,
} from '@/lib/event';
import { GalatEventYatim, simpanEvent } from '@/lib/event-db';
import { uraiKeUnit, type BarisItem, type Unit } from '@/lib/parser';
import { ambilPenalang, buatKlienServer } from '@/lib/supabase/server';
import { GalatInvarian, type Porsi } from '@/lib/uang';

const PESAN_INTERNAL = 'Event gagal disimpan. Data formulir masih ada, coba simpan lagi.';
const PESERTA_MAKS = 50;
const ITEM_MAKS = 100;
const QTY_MAKS = 50;

type Dasar = { judul: string; tanggal: string; total: number };
type Tervalidasi =
  | (Dasar & { mode: 'rata'; anggotaIds: string[] })
  | (Dasar & { mode: 'manual'; anggotaIds: string[]; nominal: Map<string, number> })
  | (Dasar & { mode: 'per_item'; anggotaIds: string[]; items: BarisItem[]; unit: Unit[] });

const bulatNonNegatif = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

function daftarIdSah(ids: readonly unknown[]): boolean {
  return ids.length <= PESERTA_MAKS && ids.every(idSah) && new Set(ids).size === ids.length;
}

/**
 * Validasi per mode. Setiap mode hanya menerima medan miliknya; nominal per orang
 * hanya ada di mode manual dan tetap divalidasi ulang di sini. Pajak tetap ditolak.
 */
function validasi(m: BuatEventMasukan): Tervalidasi | Hasil<never> {
  const mode: SplitMode | undefined = m.mode === 'rata' || m.mode === 'manual' || m.mode === 'per_item' ? m.mode : undefined;
  if (!mode) return gagal('validasi', 'Cara bagi tidak dikenal.', { mode: 'Pilih Rata, Manual, atau Per item' });
  if (m.pajak !== 0 || m.biayaLayanan !== 0 || m.diskon !== 0 || m.sudahTeralokasi !== false) {
    return gagal('validasi', 'Pajak, biaya layanan, dan diskon belum didukung.');
  }
  const asing =
    (mode !== 'rata' && m.pesertaIds !== undefined) ||
    (mode !== 'manual' && m.nominalManual !== undefined) ||
    (mode !== 'per_item' && (m.unit !== undefined || m.items !== undefined));
  if (asing) return gagal('validasi', 'Isian tidak sesuai dengan cara bagi yang dipilih.');

  const medan: Record<string, string> = {};
  const judul = typeof m.judul === 'string' ? m.judul.trim().replace(/\s+/g, ' ') : '';
  if (judul.length < 1 || judul.length > PANJANG_JUDUL_MAKS) {
    medan.judul = `Judul wajib diisi, maksimal ${PANJANG_JUDUL_MAKS} karakter.`;
  }
  if (!tanggalSah(m.tanggal)) medan.tanggal = 'Tanggal tidak valid.';
  if (!Number.isSafeInteger(m.subtotal) || m.subtotal <= 0 || m.subtotal > TOTAL_MAKS) {
    medan.total = 'Total harus angka rupiah bulat lebih dari 0.';
  }
  if (Object.keys(medan).length > 0) return gagal('validasi', 'Periksa lagi isian event.', medan);
  const dasar: Dasar = { judul, tanggal: m.tanggal, total: m.subtotal };

  if (mode === 'rata') {
    const ids = Array.isArray(m.pesertaIds) ? m.pesertaIds : [];
    if (ids.length === 0) return gagal('validasi', 'Periksa lagi isian event.', { peserta: 'Pilih minimal satu orang.' });
    if (!daftarIdSah(ids)) return gagal('validasi', 'Periksa lagi isian event.', { peserta: 'Daftar peserta tidak valid.' });
    return { ...dasar, mode, anggotaIds: ids };
  }

  if (mode === 'manual') {
    const masuk = m.nominalManual;
    if (typeof masuk !== 'object' || masuk === null || Array.isArray(masuk)) {
      return gagal('validasi', 'Isi nominal tiap orang.', { peserta: 'Pilih minimal satu orang.' });
    }
    const pasangan = Object.entries(masuk);
    if (pasangan.length === 0 || !daftarIdSah(pasangan.map(([id]) => id))) {
      return gagal('validasi', 'Periksa lagi isian event.', { peserta: 'Daftar peserta tidak valid.' });
    }
    if (!pasangan.every(([, n]) => bulatNonNegatif(n))) {
      return gagal('validasi', 'Nominal tiap orang harus angka rupiah bulat, tidak negatif.', { nominal: 'Nominal tidak valid.' });
    }
    // Peserta bernominal 0 tidak berutang apa pun, jadi tidak dibuatkan porsi.
    const nominal = new Map(pasangan.filter(([, n]) => n > 0));
    const jumlah = [...nominal.values()].reduce((a, b) => a + b, 0);
    if (jumlah !== dasar.total) {
      return gagal('tidak_seimbang', 'Jumlah nominal tiap orang belum sama dengan total.', { nominal: 'Selisih belum nol.' });
    }
    return { ...dasar, mode, anggotaIds: [...nominal.keys()], nominal };
  }

  // per_item
  const itemsMasuk = Array.isArray(m.items) ? m.items : [];
  if (itemsMasuk.length === 0 || itemsMasuk.length > ITEM_MAKS) {
    return gagal('validasi', 'Tambahkan minimal satu item.', { items: 'Belum ada item.' });
  }
  const items: BarisItem[] = [];
  for (const it of itemsMasuk) {
    const nama = typeof it?.nama === 'string' ? it.nama.trim().replace(/\s+/g, ' ') : '';
    const sah =
      nama.length >= 1 &&
      nama.length <= PANJANG_JUDUL_MAKS &&
      Number.isSafeInteger(it.qty) &&
      it.qty >= 1 &&
      it.qty <= QTY_MAKS &&
      bulatNonNegatif(it.subtotal) &&
      typeof it.gratis === 'boolean' &&
      (!it.gratis || it.subtotal === 0);
    if (!sah) return gagal('validasi', 'Ada item yang isiannya tidak valid.', { items: 'Periksa nama, qty, dan harga item.' });
    // Satuan dan penanda baris dari klien diabaikan; server membentuk ulang barisnya.
    items.push(barisItemManual(nama, it.qty, it.subtotal, it.gratis));
  }
  const jumlahItem = items.reduce((a, it) => a + it.subtotal, 0);
  if (jumlahItem !== dasar.total) {
    return gagal('tidak_seimbang', 'Jumlah harga item belum sama dengan total.', { items: 'Selisih belum nol.' });
  }

  // Unit diturunkan ulang di server; dari klien hanya daftar penanggung yang diambil.
  const unit = uraiKeUnit(items);
  const unitMasuk = Array.isArray(m.unit) ? m.unit : [];
  if (unitMasuk.length !== unit.length) {
    return gagal('validasi', 'Rincian unit tidak cocok dengan item.', { items: 'Muat ulang daftar item.' });
  }
  const semuaId = new Set<string>();
  for (let i = 0; i < unit.length; i++) {
    const u = unitMasuk[i];
    const cocok = u?.indukIndeks === unit[i].indukIndeks && u.ke === unit[i].ke && u.dari === unit[i].dari && u.subtotal === unit[i].subtotal;
    if (!cocok || !Array.isArray(u.penanggung) || !daftarIdSah(u.penanggung)) {
      return gagal('validasi', 'Rincian unit tidak cocok dengan item.', { items: 'Muat ulang daftar item.' });
    }
    unit[i] = { ...unit[i], penanggung: [...u.penanggung] };
    for (const id of u.penanggung) semuaId.add(id);
  }
  const belum = unit.filter((u) => u.subtotal > 0 && u.penanggung.length === 0).length;
  if (belum > 0) return gagal('validasi', `${belum} unit belum ditandai.`, { items: `${belum} unit belum ditandai.` });
  if (semuaId.size === 0 || semuaId.size > PESERTA_MAKS) {
    return gagal('validasi', 'Tandai minimal satu orang.', { items: 'Belum ada unit yang ditandai.' });
  }
  return { ...dasar, mode, anggotaIds: [...semuaId], items, unit };
}

function kodePostgres(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : 'tidak_dikenal';
}

function hitung(v: Tervalidasi, peserta: PesertaUrut[], memberPenalang: string): { porsi: Map<string, Porsi>; urut: PesertaUrut[] } {
  if (v.mode === 'per_item') {
    const nama = new Map(peserta.map((p) => [p.id, p.namaPanggilan]));
    const { porsi, urut } = porsiPerItem(v.unit, nama, memberPenalang);
    // Penanggung unit gratis saja tidak berutang apa pun; tidak dibuatkan porsi.
    return buangPorsiNol(porsi, urut);
  }
  const urut = urutkanPeserta(peserta, memberPenalang);
  if (v.mode === 'manual') return { porsi: porsiManual(v.nominal, v.total, urut), urut };
  // Total lebih kecil dari jumlah peserta menyisakan bagian Rp0; tidak dibuatkan porsi.
  return buangPorsiNol(porsiRata(v.total, urut), urut);
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
        .in('id', v.anggotaIds)
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
    if (peserta.data.length !== v.anggotaIds.length) {
      return gagal('validasi', 'Ada peserta yang tidak dikenal atau sudah nonaktif. Muat ulang halaman.', {
        peserta: 'Daftar peserta berubah',
      });
    }

    const memberPenalang = milikPenalang.data[0].id;
    const nama = new Map(peserta.data.map((p) => [p.id, p.nama_panggilan]));
    const { porsi, urut } = hitung(
      v,
      peserta.data.map((p) => ({ id: p.id, namaPanggilan: p.nama_panggilan })),
      memberPenalang,
    );
    const ikut = urut.some((p) => p.id === memberPenalang);

    const hasil = await simpanEvent(db, {
      payerId: penalang.id,
      judul: v.judul,
      tanggal: v.tanggal,
      total: v.total,
      mode: v.mode,
      pembulatanKe: urut[0].id,
      memberPenalang: ikut ? memberPenalang : null,
      porsi,
      items: v.mode === 'per_item' ? v.items : undefined,
      unit: v.mode === 'per_item' ? v.unit : undefined,
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
