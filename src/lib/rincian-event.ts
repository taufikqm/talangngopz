import type { SupabaseClient } from '@supabase/supabase-js';
import type { ShareStatus } from './contracts';
import { GalatMuat, muatKlaimMenunggu, waktuRiwayat, type KlaimTampil } from './klaim-penalang';
import type { Rupiah } from './uang';

/**
 * Rincian satu event untuk penalang (T-11). Klien bersesi penalang: RLS membatasi baris,
 * saringan payer_id hanya mempersempit kueri. Tanpa service_role.
 */

export type PorsiBaris = { shareId: string; nama: string; total: Rupiah; status: ShareStatus };

export type BarisRiwayat = { kunci: string; teks: string; waktu: string; alasan: string | null };

export type RincianEvent = {
  id: string;
  judul: string;
  tanggal: string;
  total: Rupiah;
  terkunci: boolean;
  porsi: PorsiBaris[];
  klaim: KlaimTampil[];
  riwayat: BarisRiwayat[];
};

export type BarisPeristiwa = {
  id: number;
  dari_status: ShareStatus | null;
  ke_status: ShareStatus;
  aktor: string;
  catatan: string | null;
  claim_id: string | null;
  created_at: string;
  shares: { members: { nama_panggilan: string } };
};

const LABEL_STATUS: Record<ShareStatus, string> = {
  belum_bayar: 'belum bayar',
  menunggu_konfirmasi: 'menunggu konfirmasi',
  lunas: 'lunas',
};

/**
 * Menyusun riwayat dari baris payment_events, terbaru dulu. Satu klaim berisi beberapa porsi
 * menghasilkan beberapa baris peristiwa dengan claim_id sama; dilebur jadi satu baris per
 * klaim dan keputusan. Masukan harus sudah urut dari yang terbaru.
 */
export function susunRiwayat(peristiwa: readonly BarisPeristiwa[], namaPenalang: string): BarisRiwayat[] {
  const kelompok = new Map<string, BarisPeristiwa>();
  for (const p of peristiwa) {
    const kunci = p.claim_id ? `${p.claim_id}|${p.aktor}|${p.ke_status}` : `tunggal-${p.id}`;
    if (!kelompok.has(kunci)) kelompok.set(kunci, p);
  }
  return [...kelompok].map(([kunci, p]) => {
    const anggota = p.shares.members.nama_panggilan;
    const waktu = waktuRiwayat(p.created_at);
    if (p.aktor === 'peserta' && p.ke_status === 'menunggu_konfirmasi') {
      return { kunci, teks: `${anggota} klaim bayar`, waktu, alasan: null };
    }
    if (p.aktor === 'penalang' && p.claim_id && p.ke_status === 'lunas') {
      return { kunci, teks: `${namaPenalang} konfirmasi klaim ${anggota}`, waktu, alasan: null };
    }
    if (p.aktor === 'penalang' && p.claim_id && p.ke_status === 'belum_bayar') {
      return { kunci, teks: `${namaPenalang} tolak klaim ${anggota}`, waktu, alasan: p.catatan };
    }
    if (p.aktor === 'penalang' && !p.claim_id && p.ke_status === 'lunas') {
      return { kunci, teks: `${namaPenalang} tandai lunas ${anggota} (tunai)`, waktu, alasan: null };
    }
    const pelaku = p.aktor === 'penalang' ? namaPenalang : p.aktor === 'peserta' ? anggota : 'Sistem';
    return { kunci, teks: `${pelaku} ubah status ${anggota} ke ${LABEL_STATUS[p.ke_status]}`, waktu, alasan: null };
  });
}

type BarisPorsiDb = { id: string; total: number; status: ShareStatus; members: { nama_panggilan: string } };

/** null bila event tidak ada atau bukan milik penalang ini (RLS tidak membedakan keduanya). */
export async function muatRincianEvent(
  db: SupabaseClient,
  penalang: { id: string; nama: string },
  eventId: string,
  hariIniTeks: string,
): Promise<RincianEvent | null> {
  const event = await db
    .from('events')
    .select('id, judul, tanggal, total, terkunci')
    .eq('id', eventId)
    .eq('payer_id', penalang.id)
    .maybeSingle<{ id: string; judul: string; tanggal: string; total: number; terkunci: boolean }>();
  if (event.error) throw new GalatMuat(event.error.code ?? 'tidak_dikenal');
  if (!event.data) return null;

  const [porsi, klaim, peristiwa] = await Promise.all([
    db.from('shares').select('id, total, status, members(nama_panggilan)').eq('event_id', eventId).returns<BarisPorsiDb[]>(),
    muatKlaimMenunggu(db, penalang.id, hariIniTeks, eventId),
    db
      .from('payment_events')
      .select('id, dari_status, ke_status, aktor, catatan, claim_id, created_at, shares!inner(event_id, members(nama_panggilan))')
      .eq('shares.event_id', eventId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .returns<BarisPeristiwa[]>(),
  ]);
  if (porsi.error) throw new GalatMuat(porsi.error.code ?? 'tidak_dikenal');
  if (peristiwa.error) throw new GalatMuat(peristiwa.error.code ?? 'tidak_dikenal');

  return {
    id: event.data.id,
    judul: event.data.judul,
    tanggal: event.data.tanggal,
    total: Number(event.data.total),
    terkunci: event.data.terkunci,
    porsi: porsi.data
      .map((p) => ({ shareId: p.id, nama: p.members.nama_panggilan, total: Number(p.total), status: p.status }))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id')),
    klaim,
    riwayat: susunRiwayat(peristiwa.data, penalang.nama),
  };
}
