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
    <nav aria-label="Menu utama" className="mx-auto flex w-full max-w-md px-3">
      {MENU.map(({ href, label }) => {
        // Beranda hanya aktif di "/" persis: halaman di bawahnya (event, klaim) punya tab sendiri atau tidak ada.
        const aktif = href === '/' ? jalur === '/' : jalur === href || jalur.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={aktif ? 'page' : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-[3px] px-2 text-tl-nama ${
              aktif ? 'border-tl-aksi font-extrabold text-tl-aksi' : 'border-transparent font-semibold text-tl-teks-sekunder'
            }`}
          >
            {label}
            {href === '/klaim' && klaimMenunggu !== null && klaimMenunggu > 0 && (
              <span className="rounded-full bg-tl-menunggu px-1.5 text-tl-lencana font-bold text-tl-menunggu-teks">
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
