'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MENU = [
  { href: '/', label: 'Beranda' },
  { href: '/klaim', label: 'Klaim' },
  { href: '/anggota', label: 'Anggota' },
] as const;

/**
 * Menu tetap layar penalang. Di atas, bukan di bawah, karena bagian bawah sudah dipakai
 * tombol "+ Talangan baru" dan "Simpan". Lencana klaim berupa angka bertulisan, bukan hanya warna.
 */
export function MenuUtama({ klaimMenunggu }: { klaimMenunggu: number | null }) {
  const jalur = usePathname();
  return (
    <nav aria-label="Menu utama" className="mx-auto flex w-full max-w-md px-2">
      {MENU.map(({ href, label }) => {
        // Beranda hanya aktif di "/" persis: halaman di bawahnya (event, klaim) punya tab sendiri atau tidak ada.
        const aktif = href === '/' ? jalur === '/' : jalur === href || jalur.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={aktif ? 'page' : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 text-base ${
              aktif ? 'border-current font-bold' : 'border-transparent font-medium text-zinc-700 dark:text-zinc-300'
            }`}
          >
            {label}
            {href === '/klaim' && klaimMenunggu !== null && klaimMenunggu > 0 && (
              <span className="rounded-full bg-amber-200 px-1.5 text-xs font-bold text-amber-950 dark:bg-amber-800 dark:text-amber-50">
                {klaimMenunggu}
                <span className="sr-only"> menunggu konfirmasi</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
