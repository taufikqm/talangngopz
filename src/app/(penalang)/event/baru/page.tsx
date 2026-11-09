import type { Metadata } from 'next';
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-4">
      <h1 className="text-2xl font-semibold">Talangan baru</h1>
      {data ? (
        <FormulirEvent anggota={data.anggota} memberPenalang={data.memberPenalang} />
      ) : (
        <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
          Daftar anggota gagal dimuat. Muat ulang halaman sebentar lagi.
        </p>
      )}
    </main>
  );
}
