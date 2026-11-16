'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IkonAnggota, IkonBeranda, IkonEvent, IkonKlaim, IkonTambah } from '@/components/ikon';

const KELAS_TAB = 'flex min-h-14 flex-col items-center justify-center gap-0.5 text-tl-lencana font-bold';

function Tab({ href, aktif, label, ikon, catatanSr }: { href: string; aktif: boolean; label: string; ikon: ReactNode; catatanSr?: string }) {
  return (
    <Link
      href={href}
      aria-current={aktif ? 'page' : undefined}
      className={`${KELAS_TAB} ${aktif ? 'text-tl-aksi' : 'text-tl-teks-sekunder'}`}
    >
      {ikon}
      {label}
      {catatanSr && <span className="sr-only">, {catatanSr}</span>}
    </Link>
  );
}

/**
 * Menu tetap layar penalang, di dasar layar: Beranda, Klaim, tombol Talangan baru di tengah,
 * Event, Anggota (lima kolom, jadi tombol tengah tepat di tengah). Tombol tengah menggantikan "+ Talangan baru" penuh lebar di Beranda, jadi aksi utama
 * satu ketukan dari layar mana pun. Disembunyikan di /event/baru supaya bilah "Simpan" memakai
 * dasar layar sendirian. Label teks selalu tampil; lencana klaim berupa angka bertulisan.
 */
export function MenuUtama({ klaimMenunggu }: { klaimMenunggu: number | null }) {
  const jalur = usePathname();
  if (jalur === '/event/baru') return null;

  // Beranda hanya aktif di "/" persis: halaman di bawahnya (event, klaim) punya tab sendiri atau tidak ada.
  const aktif = (href: string) => (href === '/' ? jalur === '/' : jalur === href || jalur.startsWith(`${href}/`));
  const adaKlaim = klaimMenunggu !== null && klaimMenunggu > 0;

  return (
    <nav
      aria-label="Menu utama"
      className="sticky bottom-0 z-20 border-t border-tl-garis bg-tl-permukaan pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto grid w-full max-w-md grid-cols-5 items-end px-1">
        <Tab href="/" aktif={aktif('/')} label="Beranda" ikon={<IkonBeranda />} />
        <Tab
          href="/klaim"
          aktif={aktif('/klaim')}
          label="Klaim"
          catatanSr={adaKlaim ? `${klaimMenunggu} klaim menunggu konfirmasi` : undefined}
          ikon={
            <span className="relative">
              <IkonKlaim />
              {adaKlaim && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 -right-3 min-w-4 rounded-full bg-tl-menunggu px-1 text-center text-tl-lencana leading-4 font-bold text-tl-menunggu-teks"
                >
                  {klaimMenunggu > 99 ? '99+' : klaimMenunggu}
                </span>
              )}
            </span>
          }
        />
        <Link href="/event/baru" className="flex min-h-14 flex-col items-center justify-end gap-0.5 pb-2 text-tl-lencana font-bold text-tl-aksi">
          <span className="-mt-5 flex h-13 w-13 items-center justify-center rounded-full bg-tl-aksi text-white shadow-lg ring-4 ring-tl-permukaan">
            <IkonTambah />
          </span>
          <span>
            Baru<span className="sr-only"> talangan</span>
          </span>
        </Link>
        <Tab href="/event" aktif={aktif('/event')} label="Event" ikon={<IkonEvent />} />
        <Tab href="/anggota" aktif={aktif('/anggota')} label="Anggota" ikon={<IkonAnggota />} />
      </div>
    </nav>
  );
}
