/**
 * Ikon menu, digambar sendiri (garis 2 px, kotak 24) supaya tidak menambah dependensi.
 * Dekoratif: arti selalu datang dari label teks di sebelahnya, maka aria-hidden.
 */
import type { ReactNode } from 'react';

type Props = { className?: string };

function Dasar({ className, children }: Props & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Rumah: Beranda. */
export function IkonBeranda({ className }: Props) {
  return (
    <Dasar className={className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </Dasar>
  );
}

/** Kotak masuk bertanda centang: klaim yang menunggu keputusan. */
export function IkonKlaim({ className }: Props) {
  return (
    <Dasar className={className}>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" />
      <path d="m9.5 9.5 2 2 3.5-3.5" />
    </Dasar>
  );
}

/** Dua orang: Anggota. */
export function IkonAnggota({ className }: Props) {
  return (
    <Dasar className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.2A6.5 6.5 0 0 1 21.5 20" />
    </Dasar>
  );
}

/** Tanda plus: Talangan baru. */
export function IkonTambah({ className }: Props) {
  return (
    <Dasar className={className}>
      <path d="M12 5v14M5 12h14" />
    </Dasar>
  );
}
