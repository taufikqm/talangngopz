'use client';

import { useMemo, useRef, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import type { BuatEventMasukan, PorsiRingkas, ShareStatus, SplitMode } from '@/lib/contracts';
import { TOTAL_MAKS, barisItemManual, hariIni, judulBawaan, ringkasManual, ringkasPerItem, teksPratinjau, teksSelisih, urutkanPeserta } from '@/lib/event';
import { uraiKeUnit, type BarisItem } from '@/lib/parser';
import { rupiah } from '@/lib/uang';
import { buatEvent } from '@/actions/event';

export type PesertaPilihan = { id: string; namaPanggilan: string };

const LABEL_STATUS: Record<ShareStatus, string> = {
  belum_bayar: 'Belum bayar',
  menunggu_konfirmasi: 'Menunggu konfirmasi',
  lunas: 'Lunas',
};

const KELAS_STATUS: Record<ShareStatus, string> = {
  belum_bayar: 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50',
  menunggu_konfirmasi: 'bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-amber-50',
  lunas: 'bg-green-200 text-green-950 dark:bg-green-800 dark:text-green-50',
};

const MODE: { nilai: SplitMode; label: string }[] = [
  { nilai: 'rata', label: 'Rata' },
  { nilai: 'manual', label: 'Manual' },
  { nilai: 'per_item', label: 'Per item' },
];

const DIGIT_MAKS = String(TOTAL_MAKS).length;
const KELAS_MEDAN =
  'min-h-11 w-full rounded-lg border border-zinc-400 bg-white px-3 text-base dark:border-zinc-600 dark:bg-zinc-900';
const KELAS_GALAT = 'text-sm text-red-700 dark:text-red-400';

/** Hanya digit, tanpa nol di depan, dibatasi panjangnya. Nilai tetap bilangan bulat rupiah. */
const keDigit = (s: string) => s.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, DIGIT_MAKS);
const keAngka = (digit: string) => (digit === '' ? 0 : Number(digit));
const tampilDigit = (digit: string) => (digit === '' ? '' : Number(digit).toLocaleString('id-ID'));

type ItemIsian = { kunci: number; nama: string; qty: number; subtotal: number };

function KancingNama({ aktif, label, onClick }: { aktif: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={aktif}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-base ${
        aktif
          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900'
          : 'border-zinc-400 bg-white text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50'
      }`}
    >
      {aktif ? '✓ ' : ''}
      {label}
    </button>
  );
}

export function FormulirEvent({ anggota, memberPenalang }: { anggota: PesertaPilihan[]; memberPenalang: string | null }) {
  const [tanggal, setTanggal] = useState(() => hariIni());
  const [ubahTanggal, setUbahTanggal] = useState(false);
  const [judul, setJudul] = useState(() => judulBawaan(hariIni()));
  const [judulDisunting, setJudulDisunting] = useState(false);
  const [digitTotal, setDigitTotal] = useState('');
  const [terpilih, setTerpilih] = useState<Set<string>>(() => new Set(memberPenalang ? [memberPenalang] : []));
  const [mode, setMode] = useState<SplitMode>('rata');
  const [digitManual, setDigitManual] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ItemIsian[]>([]);
  const [penanggung, setPenanggung] = useState<Record<string, string[]>>({});
  const [isianItem, setIsianItem] = useState({ nama: '', qty: '1', digit: '' });
  const [galatItem, setGalatItem] = useState<string | null>(null);
  const kunciItem = useRef(0);
  const [galat, setGalat] = useState<{ pesan: string; medan: Record<string, string> } | null>(null);
  const [tersimpan, setTersimpan] = useState<{ judul: string; porsi: PorsiRingkas[] } | null>(null);
  const [sedangSimpan, mulaiSimpan] = useTransition();

  const total = keAngka(digitTotal);
  const namaPanggilan = useMemo(() => new Map(anggota.map((a) => [a.id, a.namaPanggilan])), [anggota]);
  const urut = useMemo(
    () => urutkanPeserta(anggota.filter((a) => terpilih.has(a.id)), memberPenalang),
    [anggota, terpilih, memberPenalang],
  );
  const semuaTerpilih = anggota.length > 0 && terpilih.size === anggota.length;
  const label = (id: string) => `${namaPanggilan.get(id) ?? ''}${id === memberPenalang ? ' (kamu)' : ''}`;

  // Manual: nominal hanya untuk peserta yang sedang dicentang.
  const nominalManual = useMemo(() => new Map(urut.map((p) => [p.id, keAngka(digitManual[p.id] ?? '')])), [urut, digitManual]);
  const selisihManual = teksSelisih(nominalManual, total);

  // Per item: unit langsung terurai begitu item ditambahkan, bukan setelah diklik.
  const barisItem: BarisItem[] = useMemo(
    () => items.map((it) => barisItemManual(it.nama, it.qty, it.subtotal, it.subtotal === 0)),
    [items],
  );
  const unit = useMemo(
    () =>
      uraiKeUnit(barisItem).map((u) => {
        const kunci = `${items[u.indukIndeks].kunci}:${u.ke}`;
        return { ...u, kunci, penanggung: (penanggung[kunci] ?? []).filter((id) => terpilih.has(id)) };
      }),
    [barisItem, items, penanggung, terpilih],
  );
  const selisihItem = teksSelisih(new Map(items.map((it) => [String(it.kunci), it.subtotal])), total);

  const { pratinjau, siap } =
    mode === 'rata'
      ? { pratinjau: teksPratinjau(total, urut, memberPenalang), siap: true }
      : mode === 'manual'
        ? ringkasManual(nominalManual, total)
        : ringkasPerItem(unit, items.map((it) => it.subtotal), total);

  function gantiTanggal(nilai: string) {
    setTanggal(nilai);
    if (!judulDisunting && nilai) setJudul(judulBawaan(nilai));
  }

  function ubahPeserta(id: string) {
    setTerpilih((lama) => {
      const baru = new Set(lama);
      if (baru.has(id)) baru.delete(id);
      else baru.add(id);
      return baru;
    });
  }

  function pilihSemua() {
    setTerpilih(semuaTerpilih ? new Set(memberPenalang ? [memberPenalang] : []) : new Set(anggota.map((a) => a.id)));
  }

  function tambahItem() {
    const nama = isianItem.nama.trim();
    const qty = Number(isianItem.qty);
    if (!nama) return setGalatItem('Nama item wajib diisi.');
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) return setGalatItem('Qty 1 sampai 50.');
    setGalatItem(null);
    kunciItem.current += 1;
    setItems((lama) => [...lama, { kunci: kunciItem.current, nama, qty, subtotal: keAngka(isianItem.digit) }]);
    setIsianItem({ nama: '', qty: '1', digit: '' });
  }

  function hapusItem(kunci: number) {
    setItems((lama) => lama.filter((it) => it.kunci !== kunci));
    setPenanggung((lama) => Object.fromEntries(Object.entries(lama).filter(([k]) => !k.startsWith(`${kunci}:`))));
  }

  function tandaiUnit(kunci: string, id: string) {
    setPenanggung((lama) => {
      const sekarang = (lama[kunci] ?? []).filter((x) => terpilih.has(x));
      return { ...lama, [kunci]: sekarang.includes(id) ? sekarang.filter((x) => x !== id) : [...sekarang, id] };
    });
  }

  function payload(): BuatEventMasukan {
    // Hanya data mentah yang dikirim. Porsi akhir selalu dihitung ulang di server.
    const dasar = { judul, tanggal, subtotal: total, pajak: 0, biayaLayanan: 0, diskon: 0, sudahTeralokasi: false };
    if (mode === 'manual') return { ...dasar, mode, nominalManual: Object.fromEntries(nominalManual) };
    if (mode === 'per_item') {
      return { ...dasar, mode, items: barisItem, unit: unit.map((u) => ({ indukIndeks: u.indukIndeks, nama: u.nama, ke: u.ke, dari: u.dari, subtotal: u.subtotal, gratis: u.gratis, penanggung: u.penanggung })) };
    }
    return { ...dasar, mode, pesertaIds: urut.map((p) => p.id) };
  }

  function simpan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!siap) return;
    mulaiSimpan(async () => {
      const hasil = await buatEvent(payload());
      if (hasil.ok) {
        setGalat(null);
        setTersimpan({ judul, porsi: hasil.data.porsi });
      } else {
        setGalat({ pesan: hasil.pesan, medan: hasil.medan ?? {} });
      }
    });
  }

  function buatLagi() {
    const hari = hariIni();
    setTersimpan(null);
    setTanggal(hari);
    setUbahTanggal(false);
    setJudul(judulBawaan(hari));
    setJudulDisunting(false);
    setDigitTotal('');
    setTerpilih(new Set(memberPenalang ? [memberPenalang] : []));
    setDigitManual({});
    setItems([]);
    setPenanggung({});
  }

  if (tersimpan) {
    const jumlah = tersimpan.porsi.reduce((a, p) => a + p.total, 0);
    return (
      <section aria-live="polite" className="mt-4 flex flex-col gap-4">
        <p className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-950 dark:border-green-800 dark:bg-green-950 dark:text-green-50">
          <strong>{tersimpan.judul}</strong> tersimpan. Total {rupiah(jumlah)} untuk {tersimpan.porsi.length} orang.
        </p>
        <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {tersimpan.porsi.map((p) => (
            <li key={p.shareId} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate">{p.namaPanggilan}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums">{rupiah(p.total)}</span>
                <span className={`rounded px-1.5 text-xs ${KELAS_STATUS[p.status]}`}>{LABEL_STATUS[p.status]}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Link href="/" className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-zinc-400 px-4 font-medium dark:border-zinc-600">
            Ke dasbor
          </Link>
          <button type="button" onClick={buatLagi} className="min-h-11 flex-1 rounded-lg bg-zinc-900 px-4 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
            Talangan lain
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={simpan} className="mt-4 flex flex-1 flex-col gap-5">
      {!memberPenalang && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
          Akunmu belum terhubung ke data anggota, jadi talangan belum bisa disimpan. Isi kolom profile_id milikmu di tabel members.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="judul" className="text-sm font-medium">Judul</label>
        <input
          id="judul"
          value={judul}
          onChange={(e) => {
            setJudul(e.target.value);
            setJudulDisunting(true);
          }}
          maxLength={80}
          aria-invalid={galat?.medan.judul ? true : undefined}
          className={KELAS_MEDAN}
        />
        {galat?.medan.judul && <p className={KELAS_GALAT}>{galat.medan.judul}</p>}
      </div>

      <div className="flex flex-col gap-1">
        {ubahTanggal ? (
          <>
            <label htmlFor="tanggal" className="text-sm font-medium">Tanggal</label>
            <input id="tanggal" type="date" value={tanggal} onChange={(e) => gantiTanggal(e.target.value)} className={KELAS_MEDAN} />
          </>
        ) : (
          <button type="button" onClick={() => setUbahTanggal(true)} className="flex min-h-11 items-center gap-2 self-start text-sm">
            <span className="text-zinc-700 dark:text-zinc-300">Tanggal: {tanggal === hariIni() ? 'hari ini' : tanggal}</span>
            <span className="font-medium underline underline-offset-4">Ubah</span>
          </button>
        )}
        {galat?.medan.tanggal && <p className={KELAS_GALAT}>{galat.medan.tanggal}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="total" className="text-sm font-medium">Total dibayar</label>
        <div className="flex items-center rounded-lg border border-zinc-400 bg-white px-3 dark:border-zinc-600 dark:bg-zinc-900">
          <span className="text-2xl font-semibold text-zinc-700 dark:text-zinc-300">Rp</span>
          <input
            id="total"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={tampilDigit(digitTotal)}
            onChange={(e) => setDigitTotal(keDigit(e.target.value))}
            placeholder="0"
            aria-invalid={galat?.medan.total ? true : undefined}
            className="min-h-16 w-full bg-transparent px-2 text-right text-3xl font-semibold tabular-nums outline-none"
          />
        </div>
        {galat?.medan.total && <p className={KELAS_GALAT}>{galat.medan.total}</p>}
      </div>

      <fieldset className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium">Siapa yang ikut</legend>
          <button type="button" onClick={pilihSemua} disabled={anggota.length === 0} className="min-h-11 px-2 text-sm font-medium underline underline-offset-4">
            {semuaTerpilih ? 'Batal pilih semua' : 'Pilih semua'}
          </button>
        </div>
        {anggota.length === 0 ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Belum ada anggota aktif. <Link href="/anggota" className="font-medium underline underline-offset-4">Tambah anggota</Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {anggota.map((a) => (
              <KancingNama key={a.id} aktif={terpilih.has(a.id)} label={label(a.id)} onClick={() => ubahPeserta(a.id)} />
            ))}
          </div>
        )}
        {galat?.medan.peserta && <p className={KELAS_GALAT}>{galat.medan.peserta}</p>}
      </fieldset>

      <div className="flex flex-col gap-3">
        <span id="label-cara-bagi" className="text-sm font-medium">Cara bagi</span>
        <div role="tablist" aria-labelledby="label-cara-bagi" className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {MODE.map((m) => (
            <button
              key={m.nilai}
              type="button"
              role="tab"
              aria-selected={mode === m.nilai}
              onClick={() => setMode(m.nilai)}
              className={`min-h-11 rounded-md text-sm font-medium ${mode === m.nilai ? 'bg-white shadow-sm dark:bg-zinc-900' : 'text-zinc-700 dark:text-zinc-300'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'manual' && (
          <div role="tabpanel" className="flex flex-col gap-2">
            {urut.length === 0 && <p className="text-sm text-zinc-700 dark:text-zinc-300">Pilih dulu siapa yang ikut.</p>}
            {urut.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <label htmlFor={`nominal-${p.id}`} className="min-w-0 flex-1 truncate">{label(p.id)}</label>
                <div className="flex w-40 items-center rounded-lg border border-zinc-400 bg-white px-2 dark:border-zinc-600 dark:bg-zinc-900">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">Rp</span>
                  <input
                    id={`nominal-${p.id}`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={tampilDigit(digitManual[p.id] ?? '')}
                    onChange={(e) => setDigitManual((lama) => ({ ...lama, [p.id]: keDigit(e.target.value) }))}
                    placeholder="0"
                    className="min-h-11 w-full bg-transparent px-1 text-right tabular-nums outline-none"
                  />
                </div>
              </div>
            ))}
            {urut.length > 0 && (
              <p aria-live="polite" className={`text-right text-sm font-medium ${selisihManual === 'Pas' ? 'text-green-800 dark:text-green-300' : 'text-amber-800 dark:text-amber-300'}`}>
                {selisihManual}
              </p>
            )}
          </div>
        )}

        {mode === 'per_item' && (
          <div role="tabpanel" className="flex flex-col gap-3">
            {items.map((it) => (
              <div key={it.kunci} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {it.nama} × {it.qty}
                  </span>
                  {it.subtotal === 0 && (
                    <span className="rounded bg-green-200 px-1.5 text-xs text-green-950 dark:bg-green-800 dark:text-green-50">Gratis</span>
                  )}
                  <span className="tabular-nums">{rupiah(it.subtotal)}</span>
                  <button type="button" onClick={() => hapusItem(it.kunci)} aria-label={`Hapus ${it.nama}`} className="min-h-11 min-w-11 rounded-lg text-sm underline underline-offset-4">
                    Hapus
                  </button>
                </div>
                {unit
                  .filter((u) => items[u.indukIndeks]?.kunci === it.kunci)
                  .map((u) => (
                    <div key={u.kunci} className="flex flex-col gap-1 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                      <div className="flex items-center justify-between text-sm">
                        <span>
                          {u.nama}
                          {u.dari > 1 ? ` (${u.ke}/${u.dari})` : ''}
                        </span>
                        <span className="flex items-center gap-2">
                          {u.subtotal > 0 && u.penanggung.length === 0 && <span className="text-amber-800 dark:text-amber-300">Belum ditandai</span>}
                          <span className="tabular-nums">{rupiah(u.subtotal)}</span>
                        </span>
                      </div>
                      {urut.length === 0 ? (
                        <p className="text-xs text-zinc-700 dark:text-zinc-300">Pilih dulu siapa yang ikut.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {urut.map((p) => (
                            <KancingNama key={p.id} aktif={u.penanggung.includes(p.id)} label={label(p.id)} onClick={() => tandaiUnit(u.kunci, p.id)} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ))}

            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-400 p-2 dark:border-zinc-600">
              <div className="flex gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor="item-nama" className="text-xs font-medium">Nama item</label>
                  <input id="item-nama" value={isianItem.nama} maxLength={80} onChange={(e) => setIsianItem((s) => ({ ...s, nama: e.target.value }))} className={KELAS_MEDAN} />
                </div>
                <div className="flex w-16 flex-col gap-1">
                  <label htmlFor="item-qty" className="text-xs font-medium">Qty</label>
                  <input id="item-qty" inputMode="numeric" value={isianItem.qty} onChange={(e) => setIsianItem((s) => ({ ...s, qty: e.target.value.replace(/\D/g, '').slice(0, 2) }))} className={`${KELAS_MEDAN} text-right`} />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor="item-harga" className="text-xs font-medium">Harga baris (semua qty)</label>
                  <input
                    id="item-harga"
                    inputMode="numeric"
                    value={tampilDigit(isianItem.digit)}
                    onChange={(e) => setIsianItem((s) => ({ ...s, digit: keDigit(e.target.value) }))}
                    placeholder="0 = gratis"
                    className={`${KELAS_MEDAN} text-right tabular-nums`}
                  />
                </div>
                <button type="button" onClick={tambahItem} className="min-h-11 rounded-lg border border-zinc-900 px-4 font-medium dark:border-zinc-50">
                  Tambah item
                </button>
              </div>
              {galatItem && <p className={KELAS_GALAT}>{galatItem}</p>}
            </div>
            {items.length > 0 && (
              <p aria-live="polite" className={`text-right text-sm font-medium ${selisihItem === 'Pas' ? 'text-green-800 dark:text-green-300' : 'text-amber-800 dark:text-amber-300'}`}>
                Jumlah item: {selisihItem === 'Pas' ? 'Pas dengan total' : `${selisihItem} dari total`}
              </p>
            )}
          </div>
        )}
        {galat?.medan.nominal && <p className={KELAS_GALAT}>{galat.medan.nominal}</p>}
        {galat?.medan.items && <p className={KELAS_GALAT}>{galat.medan.items}</p>}
      </div>

      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 border-t border-zinc-200 bg-white px-4 pt-3 pb-4 dark:border-zinc-800 dark:bg-black">
        <p aria-live="polite" className="text-center text-base font-medium tabular-nums">{pratinjau}</p>
        <button
          type="submit"
          disabled={sedangSimpan || !siap}
          className="min-h-12 w-full rounded-lg bg-zinc-900 px-4 text-base font-semibold text-white disabled:bg-zinc-500 dark:bg-zinc-50 dark:text-zinc-900 dark:disabled:bg-zinc-400"
        >
          {sedangSimpan ? 'Menyimpan…' : 'Simpan'}
        </button>
        {galat && (
          <p role="alert" className={KELAS_GALAT}>
            {galat.pesan}
          </p>
        )}
      </div>
    </form>
  );
}
