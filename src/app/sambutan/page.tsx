import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Talangan',
  robots: { index: false, follow: false },
};

/**
 * Yang dilihat siapa pun yang membuka alamat utama tanpa sesi penalang (proxy menayangkannya di "/").
 * Peserta tidak punya akun, jadi satu-satunya petunjuk untuk mereka adalah kalimat di bawah tombol.
 * Sengaja tidak mendaftarkan service worker di sini: peserta tidak pernah memakainya.
 */
export default function HalamanSambutan() {
  return (
    <div className="flex flex-1 flex-col bg-tl-latar font-jakarta text-tl-teks">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-5 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] font-extrabold leading-tight">Talangan</h1>
          <p className="text-tl-isi text-tl-teks-sekunder">Pencatat talangan untuk sirkel kamu.</p>
        </div>
        <Link
          href="/login"
          className="flex min-h-12 items-center justify-center rounded-tl-tombol bg-tl-aksi px-4 text-[16px] font-bold text-white"
        >
          Masuk sebagai penalang
        </Link>
        <p className="text-tl-label text-tl-teks-redup">Peserta: buka tautan tagihan dari penalang kamu.</p>
      </main>
    </div>
  );
}
