import type { Metadata } from 'next';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { ambilPenalang, buatKlienServer } from '@/lib/supabase/server';
import { FormulirEvent, type PesertaPilihan } from './formulir-event';

export const metadata: Metadata = { title: 'Talangan baru' };

async function muat(): Promise<{ anggota: PesertaPilihan[]; memberPenalang: string | null } | null> {
  try {
    const [penalang, db] = await Promise.all([ambilPenalang(), buatKlienServer()]);
    const { data, error } = await db
      .from('members')
      .select('id, nama_panggilan, profile_id')
      .eq('aktif', true)
      .order('nama_panggilan')
      .returns<{ id: string; nama_panggilan: string; profile_id: string | null }[]>();
    if (error) throw error;
    const milik = data.filter((m) => penalang && m.profile_id === penalang.id);
    return {
      anggota: data.map((m) => ({ id: m.id, namaPanggilan: m.nama_panggilan })),
      memberPenalang: milik.length === 1 ? milik[0].id : null,
    };
  } catch (e) {
    unstable_rethrow(e);
    const kode = typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : 'tidak_dikenal';
    console.error('halaman event baru: gagal memuat anggota', kode);
    return null;
  }
}

export default async function HalamanEventBaru() {
  const data = await muat();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-2">
      {/* Menu bawah disembunyikan di layar ini; jalan kembali lewat sini. */}
      <Link href="/" className="inline-flex min-h-11 items-center self-start text-tl-isi font-bold text-tl-aksi">
        ‹ Batal
      </Link>
      <h1 className="text-[24px] font-extrabold">Talangan baru</h1>
      {data ? (
        <FormulirEvent anggota={data.anggota} memberPenalang={data.memberPenalang} />
      ) : (
        <p role="alert" className="mt-4 text-tl-isi font-semibold text-tl-galat">
          Daftar anggota gagal dimuat. Muat ulang halaman sebentar lagi.
        </p>
      )}
    </main>
  );
}
