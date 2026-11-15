import type { ShareStatus } from '@/lib/contracts';

const LENCANA: Record<ShareStatus, { label: string; kelas: string }> = {
  belum_bayar: { label: 'Belum bayar', kelas: 'bg-tl-belum text-tl-belum-teks' },
  menunggu_konfirmasi: { label: 'Menunggu konfirmasi', kelas: 'bg-tl-menunggu text-tl-menunggu-teks' },
  lunas: { label: 'Lunas', kelas: 'bg-tl-lunas text-tl-lunas-teks' },
};

/** Status selalu berlabel teks; warna hanya penguat (docs/gaya-visual.md). */
export function LencanaStatus({ status }: { status: ShareStatus }) {
  const { label, kelas } = LENCANA[status];
  return <span className={`rounded-full px-2.5 py-0.5 text-tl-lencana font-bold ${kelas}`}>{label}</span>;
}
