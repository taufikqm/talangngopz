import type { Metadata } from 'next';
import { DaftarSw } from '../daftar-sw';
import { FormulirMasuk } from './formulir-masuk';

export const metadata: Metadata = {
  title: 'Masuk',
  robots: { index: false, follow: false },
};

export default function HalamanMasuk() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-extrabold leading-tight">Masuk</h1>
        <p className="text-tl-isi text-tl-teks-sekunder">Khusus penalang.</p>
      </div>
      <FormulirMasuk />
      <DaftarSw />
    </main>
  );
}
