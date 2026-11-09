import Link from 'next/link';

// Penampung sampai dasbor piutang dibangun di T-10.
export default function Dasbor() {
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="text-2xl font-semibold">Dasbor</h1>
      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">Kamu sudah masuk sebagai penalang.</p>
      <Link href="/anggota" className="mt-4 inline-flex min-h-11 items-center font-medium underline underline-offset-4">
        Kelola anggota
      </Link>
    </main>
  );
}
