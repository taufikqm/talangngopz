import type { SupabaseClient } from '@supabase/supabase-js';
import type { SplitMode } from './contracts';
import type { BarisItem, Unit } from './parser';
import type { Porsi, Rupiah } from './uang';

export type RencanaEvent = {
  payerId: string;
  judul: string;
  tanggal: string;
  total: Rupiah;
  /** Bawaan 'rata'. */
  mode?: SplitMode;
  pembulatanKe: string;
  /** Anggota milik penalang; porsinya disimpan langsung lunas. null bila penalang tidak ikut. */
  memberPenalang: string | null;
  porsi: ReadonlyMap<string, Porsi>;
  /** Hanya mode per_item: baris asal beserta unit yang sudah ditandai. */
  items?: readonly BarisItem[];
  unit?: readonly Unit[];
};

/**
 * Satu baris bill_items per item asal, dengan penanggung = gabungan penanggung semua
 * unitnya. Rincian siapa menanggung unit ke berapa SENGAJA tidak disimpan (skema
 * menyimpan penanggung per baris); shares yang otoritatif untuk utang tiap orang.
 */
export function barisBillItems(eventId: string, items: readonly BarisItem[], unit: readonly Unit[]) {
  return items.map((item, i) => {
    const penanggung = [...new Set(unit.filter((u) => u.indukIndeks === i).flatMap((u) => u.penanggung))];
    return {
      event_id: eventId,
      nama: item.nama,
      harga: item.satuan,
      subtotal: item.subtotal,
      qty: item.qty,
      gratis: item.gratis,
      penanggung,
    };
  });
}

export type BarisPorsiTersimpan = {
  id: string;
  member_id: string;
  total: Rupiah;
  status: 'belum_bayar' | 'menunggu_konfirmasi' | 'lunas';
  claimed_at: string | null;
  settled_at: string | null;
};

export type EventTersimpan = { eventId: string; shareToken: string; porsi: BarisPorsiTersimpan[] };

/**
 * Event sudah tersisip tetapi porsinya gagal, DAN penghapusan kompensasi juga gagal.
 * Event itu yatim: tanpa porsi. Pemicu invarian tidak menangkapnya karena hanya
 * berjalan pada shares; perlu dihapus manual. eventId sengaja dibawa agar bisa dicari.
 */
export class GalatEventYatim extends Error {
  constructor(
    readonly eventId: string,
    readonly kodeAsal: string,
  ) {
    super(`Event ${eventId} tersimpan tanpa porsi`);
    this.name = 'GalatEventYatim';
  }
}

function kode(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : 'tidak_dikenal';
}

/**
 * Menyisipkan event lalu seluruh porsinya dalam SATU pernyataan insert, sehingga
 * pemicu invarian (deferrable) memeriksa jumlah lengkap di akhir pernyataan itu.
 * Mode per_item lalu menyisipkan bill_items sebagai rujukan.
 *
 * Bukan satu transaksi: supabase-js tidak bisa membungkus beberapa insert. Bila insert
 * porsi atau item gagal, event dihapus lagi lewat sesi yang sama (RLS event_milik_sendiri
 * mengizinkan pemilik menghapus). Celah tersisa: bila penghapusan itu pun gagal,
 * event yatim tertinggal dan GalatEventYatim dilempar. Atomisitas penuh butuh
 * fungsi RPC di migrasi tersendiri.
 */
export async function simpanEvent(db: SupabaseClient, r: RencanaEvent): Promise<EventTersimpan> {
  const ev = await db
    .from('events')
    .insert({
      payer_id: r.payerId,
      judul: r.judul,
      tanggal: r.tanggal,
      subtotal: r.total,
      pajak: 0,
      biaya_layanan: 0,
      diskon: 0,
      total: r.total,
      mode: r.mode ?? 'rata',
      pembulatan_ke: r.pembulatanKe,
      sudah_teralokasi: false,
    })
    .select('id, share_token')
    .single<{ id: string; share_token: string }>();
  if (ev.error) throw ev.error;
  const eventId = ev.data.id;

  const sekarang = new Date().toISOString();
  const baris = [...r.porsi].map(([memberId, p]) => {
    const lunas = memberId === r.memberPenalang;
    return {
      event_id: eventId,
      member_id: memberId,
      subtotal: p.subtotal,
      pajak_porsi: p.pajakPorsi,
      total: p.total,
      status: lunas ? 'lunas' : 'belum_bayar',
      settled_at: lunas ? sekarang : null,
    };
  });

  const porsi = await db
    .from('shares')
    .insert(baris)
    .select('id, member_id, total, status, claimed_at, settled_at')
    .returns<BarisPorsiTersimpan[]>();
  const galat = porsi.error ?? (await simpanItem(db, eventId, r));
  if (galat) {
    // Cascade ikut menghapus shares dan bill_items yang sempat tersisip.
    const hapus = await db.from('events').delete().eq('id', eventId).select('id');
    if (hapus.error || hapus.data.length !== 1) {
      throw new GalatEventYatim(eventId, kode(galat));
    }
    throw galat;
  }
  return { eventId, shareToken: ev.data.share_token, porsi: porsi.data ?? [] };
}

async function simpanItem(db: SupabaseClient, eventId: string, r: RencanaEvent) {
  if (!r.items || r.items.length === 0) return null;
  const { error } = await db.from('bill_items').insert(barisBillItems(eventId, r.items, r.unit ?? []));
  return error;
}
