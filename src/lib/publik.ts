import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RekapEvent, RekapPribadi, ShareStatus, TujuanTransfer } from './contracts';
import { buatKlienService } from './supabase/service';

/**
 * Pemuat halaman peserta (/me, /bill). Memakai service_role, jadi RLS TIDAK berlaku:
 * token dicocokkan lebih dulu, lalu setiap kueri berikutnya dibatasi id hasil
 * pencocokan itu (AGENTS.md aturan 8). Hanya kolom yang tampil yang di-select.
 * Token tidak pernah ditulis ke log atau pesan galat.
 */

const FORMAT_TOKEN = /^[0-9a-f]{64}$/;
// Token berformat salah tetap menjalankan satu kueri yang sama dengan pengganti ini,
// supaya waktu tanggapnya tidak membedakannya dari token yang tidak dikenal.
const TOKEN_PENGGANTI = '0'.repeat(64);

export type JenisToken = 'me' | 'bill';

const KOLOM_TOKEN = {
  me: { tabel: 'members', kolom: 'access_token' },
  bill: { tabel: 'events', kolom: 'share_token' },
} as const;

/** Galat basis data tanpa menyebut token; hanya kodenya. */
export class GalatPemuat extends Error {
  constructor(readonly kode: string) {
    super(`Pemuat halaman peserta gagal (${kode})`);
    this.name = 'GalatPemuat';
  }
}

type HasilKueri<T> = { data: T | null; error: { code?: string } | null };

function bolehKosong<T>(hasil: HasilKueri<T>): T | null {
  if (hasil.error) throw new GalatPemuat(hasil.error.code ?? 'tidak_dikenal');
  return hasil.data;
}

function periksa<T>(hasil: HasilKueri<T>): T {
  const data = bolehKosong(hasil);
  if (data === null) throw new GalatPemuat('kosong');
  return data;
}

async function cocokkan(db: SupabaseClient, jenis: JenisToken, token: string): Promise<string | null> {
  const sah = FORMAT_TOKEN.test(token);
  const { tabel, kolom } = KOLOM_TOKEN[jenis];
  const baris = bolehKosong(
    await db
      .from(tabel)
      .select('id')
      .eq(kolom, sah ? token : TOKEN_PENGGANTI)
      .maybeSingle<{ id: string }>(),
  );
  return sah && baris ? baris.id : null;
}

/** id anggota pemegang token /me, atau null. Dipakai POST /api/claim. */
export async function memberDariToken(token: string): Promise<string | null> {
  return cocokkan(buatKlienService(), 'me', token);
}

/** Dipakai Proxy untuk mengembalikan 404 sungguhan sebelum halaman mulai di-stream. */
export async function tokenDikenal(jenis: JenisToken, token: string): Promise<boolean> {
  return (await cocokkan(buatKlienService(), jenis, token)) !== null;
}

type BarisPorsiPribadi = {
  id: string;
  total: number;
  status: ShareStatus;
  settled_at: string | null;
  events: { judul: string; tanggal: string; payer_id: string };
};

export async function rekapPribadi(token: string): Promise<RekapPribadi | null> {
  const db = buatKlienService();
  const memberId = await cocokkan(db, 'me', token);
  if (!memberId) return null;

  const anggota = periksa(
    await db.from('members').select('nama_panggilan').eq('id', memberId).single<{ nama_panggilan: string }>(),
  );
  const porsi = periksa(
    await db
      .from('shares')
      .select('id, total, status, settled_at, events!inner(judul, tanggal, payer_id)')
      .eq('member_id', memberId)
      .gt('total', 0)
      .returns<BarisPorsiPribadi[]>(),
  );

  const idPorsi = porsi.map((p) => p.id);
  const klaim =
    idPorsi.length === 0
      ? []
      : periksa(
          await db
            .from('payment_claim_shares')
            .select('share_id, payment_claims!inner(claimed_at)')
            .in('share_id', idPorsi)
            .eq('payment_claims.member_id', memberId)
            .eq('payment_claims.status', 'menunggu')
            .returns<{ share_id: string; payment_claims: { claimed_at: string } }[]>(),
        );
  const menunggu = new Map(klaim.map((k) => [k.share_id, k.payment_claims.claimed_at]));

  const idPenalang = [...new Set(porsi.map((p) => p.events.payer_id))];
  const penalang =
    idPenalang.length === 0
      ? []
      : periksa(
          await db
            .from('profiles')
            .select('id, nama, bank, no_rekening, qris_url')
            .in('id', idPenalang)
            .returns<{ id: string; nama: string; bank: string | null; no_rekening: string | null; qris_url: string | null }[]>(),
        );
  const tujuan: TujuanTransfer[] = penalang
    .map((p) => ({ penalangId: p.id, nama: p.nama, bank: p.bank, noRekening: p.no_rekening, qrisUrl: p.qris_url }))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

  const perEvent = porsi
    .map((p) => ({
      shareId: p.id,
      judul: p.events.judul,
      tanggal: p.events.tanggal,
      total: Number(p.total),
      status: p.status,
      penalangId: p.events.payer_id,
      menungguSejak: menunggu.get(p.id) ?? null,
      lunasPada: p.status === 'lunas' ? p.settled_at : null,
    }))
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.judul.localeCompare(b.judul, 'id'));

  return {
    namaPanggilan: anggota.nama_panggilan,
    totalUtang: perEvent.filter((p) => p.status !== 'lunas').reduce((a, p) => a + p.total, 0),
    tujuan,
    perEvent,
  };
}

export async function rekapEvent(token: string): Promise<RekapEvent | null> {
  const db = buatKlienService();
  const eventId = await cocokkan(db, 'bill', token);
  if (!eventId) return null;

  const ev = periksa(
    await db
      .from('events')
      .select('judul, tanggal, total, payer_id')
      .eq('id', eventId)
      .single<{ judul: string; tanggal: string; total: number; payer_id: string }>(),
  );
  const penalang = periksa(
    await db.from('profiles').select('nama').eq('id', ev.payer_id).single<{ nama: string }>(),
  );
  const porsi = periksa(
    await db
      .from('shares')
      .select('total, status, members!inner(nama_panggilan)')
      .eq('event_id', eventId)
      .gt('total', 0)
      .returns<{ total: number; status: ShareStatus; members: { nama_panggilan: string } }[]>(),
  );

  return {
    judul: ev.judul,
    tanggal: ev.tanggal,
    total: Number(ev.total),
    penalang: penalang.nama,
    peserta: porsi
      .map((p) => ({ nama: p.members.nama_panggilan, total: Number(p.total), status: p.status }))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id')),
  };
}
