import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShareStatus } from './contracts';
import type { Rupiah } from './uang';

/**
 * Dasbor piutang penalang (T-10). Pemuat menerima klien bersesi penalang: RLS yang
 * membatasi barisnya, saringan payer_id hanya mempersempit kueri. Tanpa service_role.
 */

export const BATAS_UMUR_LAMA = 14;

export type RincianPorsi = { shareId: string; judul: string; tanggal: string; total: Rupiah; status: ShareStatus };

export type BarisPiutang = {
  memberId: string;
  nama: string;
  belumBayar: Rupiah;
  menunggu: Rupiah;
  total: Rupiah;
  jumlahEvent: number;
  umurHari: number;
  rincian: RincianPorsi[];
};

export type Dasbor =
  | { keadaan: 'kosong'; klaimMenunggu: number }
  | { keadaan: 'lunas'; klaimMenunggu: number }
  | { keadaan: 'piutang'; klaimMenunggu: number; totalPiutang: Rupiah; anggota: BarisPiutang[] };

/** Selisih tanggal kalender (YYYY-MM-DD), bukan kelipatan 24 jam dari jam tertentu. */
export function selisihHari(dari: string, sampai: string): number {
  const ms = Date.UTC(+sampai.slice(0, 4), +sampai.slice(5, 7) - 1, +sampai.slice(8, 10)) -
    Date.UTC(+dari.slice(0, 4), +dari.slice(5, 7) - 1, +dari.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

/** "3 hari", atau "sudah 15 hari" bila lebih dari 14 hari. */
export function labelUmur(hari: number): { teks: string; lama: boolean } {
  const lama = hari > BATAS_UMUR_LAMA;
  return { teks: lama ? `sudah ${hari} hari` : `${hari} hari`, lama };
}

type BarisView = { member_id: string; nama_panggilan: string; belum_bayar: number; menunggu: number; jumlah_event: number };
type BarisPorsi = {
  id: string;
  member_id: string;
  total: number;
  status: ShareStatus;
  events: { judul: string; tanggal: string };
};

/**
 * Menyusun dasbor dari hasil kueri. Murni, agar urutan, umur, dan keadaan bisa diuji.
 * Umur memakai events.tanggal tertua di antara porsi yang belum lunas, terhadap hariIni
 * (zona Asia/Jakarta). Kolom v_piutang.umur_tertua_hari tidak dipakai: ia memakai
 * current_date basis data yang berzona UTC.
 */
export function susunDasbor(
  view: readonly BarisView[],
  porsi: readonly BarisPorsi[],
  klaimMenunggu: number,
  jumlahEventPenalang: number,
  hariIni: string,
): Dasbor {
  // Saring porsi Rp0 dan anggota yang sudah lunas semua.
  const berutang = view.filter((v) => Number(v.belum_bayar) + Number(v.menunggu) > 0);
  if (berutang.length === 0) return { keadaan: jumlahEventPenalang === 0 ? 'kosong' : 'lunas', klaimMenunggu };

  const perAnggota = new Map<string, RincianPorsi[]>();
  for (const p of porsi) {
    if (p.status === 'lunas' || Number(p.total) <= 0) continue;
    const daftar = perAnggota.get(p.member_id) ?? [];
    daftar.push({ shareId: p.id, judul: p.events.judul, tanggal: p.events.tanggal, total: Number(p.total), status: p.status });
    perAnggota.set(p.member_id, daftar);
  }

  const anggota = berutang
    .map((v) => {
      const rincian = (perAnggota.get(v.member_id) ?? []).sort(
        (a, b) => a.tanggal.localeCompare(b.tanggal) || a.judul.localeCompare(b.judul, 'id'),
      );
      const tertua = rincian[0]?.tanggal ?? hariIni;
      return {
        memberId: v.member_id,
        nama: v.nama_panggilan,
        belumBayar: Number(v.belum_bayar),
        menunggu: Number(v.menunggu),
        total: Number(v.belum_bayar) + Number(v.menunggu),
        // Dari rincian, bukan v_piutang.jumlah_event: view itu masih menghitung porsi Rp0.
        jumlahEvent: rincian.length,
        umurHari: Math.max(0, selisihHari(tertua, hariIni)),
        rincian,
      };
    })
    .sort((a, b) => b.total - a.total || b.umurHari - a.umurHari || a.nama.localeCompare(b.nama, 'id'));

  return {
    keadaan: 'piutang',
    klaimMenunggu,
    totalPiutang: anggota.reduce((a, b) => a + b.total, 0),
    anggota,
  };
}

/** Galat basis data tanpa isi baris; hanya kodenya yang boleh dicatat. */
export class GalatDasbor extends Error {
  constructor(readonly kode: string) {
    super(`Dasbor gagal dimuat (${kode})`);
    this.name = 'GalatDasbor';
  }
}

export async function muatDasbor(db: SupabaseClient, penalangId: string, hariIni: string): Promise<Dasbor> {
  const [view, klaim, event, porsi] = await Promise.all([
    db
      .from('v_piutang')
      .select('member_id, nama_panggilan, belum_bayar, menunggu, jumlah_event')
      .eq('payer_id', penalangId)
      .or('belum_bayar.gt.0,menunggu.gt.0')
      .returns<BarisView[]>(),
    db.from('payment_claims').select('id', { count: 'exact', head: true }).eq('payer_id', penalangId).eq('status', 'menunggu'),
    db.from('events').select('id', { count: 'exact', head: true }).eq('payer_id', penalangId),
    db
      .from('shares')
      .select('id, member_id, total, status, events!inner(judul, tanggal)')
      .eq('events.payer_id', penalangId)
      .neq('status', 'lunas')
      .gt('total', 0)
      .returns<BarisPorsi[]>(),
  ]);
  for (const h of [view, klaim, event, porsi]) {
    if (h.error) throw new GalatDasbor(h.error.code ?? 'tidak_dikenal');
  }
  return susunDasbor(view.data ?? [], porsi.data ?? [], klaim.count ?? 0, event.count ?? 0, hariIni);
}
