'use client';

import { useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import type { BuatEventMasukan, PorsiRingkas, SplitMode } from '@/lib/contracts';
import { TOTAL_MAKS, barisItemManual, hariIni, judulBawaan, ringkasManual, ringkasPerItem, teksPratinjau, teksSelisih, urutkanPeserta } from '@/lib/event';
import { uraiKeUnit, type BarisItem } from '@/lib/parser';
import { rupiah } from '@/lib/uang';
import { buatEvent } from '@/actions/event';
import { pratinjauImpor } from '@/actions/impor';
import { CONTOH_TABEL } from '@/lib/impor';
import { LencanaStatus } from '@/components/lencana-status';

export type PesertaPilihan = { id: string; namaPanggilan: string };

const MODE: { nilai: SplitMode; label: string }[] = [
  { nilai: 'rata', label: 'Rata' },
  { nilai: 'manual', label: 'Manual' },
  { nilai: 'per_item', label: 'Per item' },
];

const DIGIT_MAKS = String(TOTAL_MAKS).length;
// Gaya Beranda (docs/gaya-visual.md): semua warna dan ukuran dari token tl-* di globals.css.
const KELAS_MEDAN = 'min-h-12 w-full rounded-tl-tombol border-[1.5px] border-tl-garis-medan bg-tl-permukaan px-3 text-[16px] text-tl-teks';
const KELAS_KOTAK_ANGKA = 'flex items-center rounded-tl-tombol border-[1.5px] border-tl-garis-medan bg-tl-permukaan px-2';
const KELAS_GALAT = 'text-tl-label font-semibold text-tl-galat';
const KELAS_LABEL = 'text-tl-label font-bold uppercase tracking-[0.4px] text-tl-teks-redup';
const KELAS_PETUNJUK = 'text-tl-isi text-tl-teks-sekunder';
const KELAS_KARTU = 'rounded-tl-kartu border border-tl-garis bg-tl-permukaan';
const KELAS_SPANDUK = 'rounded-tl-kartu bg-tl-perhatian p-3 text-tl-isi font-semibold text-tl-perhatian-teks';
const KELAS_TAUTAN = 'font-bold text-tl-aksi underline underline-offset-4';
const KELAS_TOMBOL_UTAMA =
  'min-h-12 rounded-tl-tombol bg-tl-aksi px-4 text-[16px] font-bold text-white disabled:bg-tl-nonaktif disabled:text-tl-teks-redup';
const KELAS_TOMBOL_SEKUNDER =
  'min-h-12 rounded-tl-tombol border-[1.5px] border-tl-aksi bg-tl-permukaan px-4 text-[16px] font-bold text-tl-aksi disabled:border-tl-garis-medan disabled:text-tl-teks-redup';

/** Hanya digit, tanpa nol di depan, dibatasi panjangnya. Nilai tetap bilangan bulat rupiah. */
const keDigit = (s: string) => s.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, DIGIT_MAKS);
const keAngka = (digit: string) => (digit === '' ? 0 : Number(digit));
const tampilDigit = (digit: string) => (digit === '' ? '' : Number(digit).toLocaleString('id-ID'));

/** `valid`: dari parser saat impor, lalu dihitung ulang (habis dibagi qty) setiap kali harga disunting. */
type ItemIsian = { kunci: number; nama: string; qty: number; subtotal: number; valid: boolean };

/** Hasil impor yang tidak bisa diturunkan lagi dari daftar item yang sudah disunting. */
type Impor = { cocokQty: boolean; jumlahAwal: number; totalTercetak: number | null };

function Lencana({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-tl-label font-bold ${
        ok ? 'bg-tl-lunas text-tl-lunas-teks' : 'border-[1.5px] border-tl-galat bg-tl-permukaan text-tl-galat'
      }`}
    >
      {children}
    </span>
  );
}

function KancingNama({ aktif, label, onClick }: { aktif: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={aktif}
      onClick={onClick}
      className={`min-h-11 rounded-full border-[1.5px] px-4 text-tl-nama font-semibold ${
        aktif ? 'border-tl-aksi bg-tl-aksi text-white' : 'border-tl-garis-medan bg-tl-permukaan text-tl-teks'
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
  const [bukaTempel, setBukaTempel] = useState(false);
  const [teksTempel, setTeksTempel] = useState('');
  const [galatTempel, setGalatTempel] = useState<string | null>(null);
  const [impor, setImpor] = useState<Impor | null>(null);
  const [sedangUrai, mulaiUrai] = useTransition();
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
  const jumlahItem = items.reduce((a, it) => a + it.subtotal, 0);
  const jumlahQty = items.reduce((a, it) => a + it.qty, 0);
  const barisBermasalah = items.filter((it) => !it.valid).length;
  // Positif: ada biaya yang belum masuk ke harga item. Negatif: item melebihi total.
  const belumMasuk = total - jumlahItem;
  // Cek jumlah item hanya bermakna selama daftar belum ada yang dihapus.
  const tampilCekQty = impor !== null && items.length === impor.jumlahAwal;

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
    const subtotal = keAngka(isianItem.digit);
    setItems((lama) => [...lama, { kunci: kunciItem.current, nama, qty, subtotal, valid: subtotal % qty === 0 }]);
    setIsianItem({ nama: '', qty: '1', digit: '' });
  }

  function ubahItem(kunci: number, ubah: { nama?: string; digit?: string }) {
    setItems((lama) =>
      lama.map((it) => {
        if (it.kunci !== kunci) return it;
        if (ubah.digit === undefined) return { ...it, nama: ubah.nama ?? it.nama };
        const subtotal = keAngka(ubah.digit);
        return { ...it, nama: ubah.nama ?? it.nama, subtotal, valid: subtotal % it.qty === 0 };
      }),
    );
  }

  function uraiTabel() {
    setGalatTempel(null);
    mulaiUrai(async () => {
      try {
        const hasil = await pratinjauImpor({ teks: teksTempel });
        if (!hasil.ok) return setGalatTempel(hasil.pesan);
        const d = hasil.data;
        const jumlah = d.items.reduce((a, it) => a + it.subtotal, 0);
        // Baris total yang sel angkanya kosong terbaca 0; itu bukan total sungguhan.
        const total = d.total !== null && d.total > 0 ? d.total : jumlah;
        setItems(
          d.items.map((it) => {
            kunciItem.current += 1;
            return { kunci: kunciItem.current, nama: it.nama, qty: it.qty, subtotal: it.subtotal, valid: it.valid };
          }),
        );
        setPenanggung({});
        setDigitTotal(total > 0 ? String(total) : '');
        setImpor({ cocokQty: d.cocokQty, jumlahAwal: d.items.length, totalTercetak: d.total !== null && d.total > 0 ? d.total : null });
        setBukaTempel(false);
        setTeksTempel('');
      } catch {
        setGalatTempel('Tabel gagal dibaca. Coba lagi sebentar lagi.');
      }
    });
  }

  function isiManualSaja() {
    setBukaTempel(false);
    setGalatTempel(null);
    setTeksTempel('');
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
    setImpor(null);
    setBukaTempel(false);
    setTeksTempel('');
    setGalatTempel(null);
  }

  if (tersimpan) {
    const jumlah = tersimpan.porsi.reduce((a, p) => a + p.total, 0);
    return (
      <section aria-live="polite" className="mt-4 flex flex-col gap-4">
        <p className="rounded-tl-kartu bg-tl-lunas p-3 text-tl-isi text-tl-lunas-teks">
          <strong>{tersimpan.judul}</strong> tersimpan. Total {rupiah(jumlah)} untuk {tersimpan.porsi.length} orang.
        </p>
        <ul className={`flex flex-col divide-y divide-tl-garis-halus ${KELAS_KARTU}`}>
          {tersimpan.porsi.map((p) => (
            <li key={p.shareId} className="flex items-center justify-between gap-2 px-4 py-3">
              <span className="truncate text-tl-nama font-bold">{p.namaPanggilan}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-tl-nominal font-bold tabular-nums">{rupiah(p.total)}</span>
                <LencanaStatus status={p.status} />
              </span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Link href="/" className={`flex flex-1 items-center justify-center ${KELAS_TOMBOL_SEKUNDER}`}>
            Ke dasbor
          </Link>
          <button type="button" onClick={buatLagi} className={`flex-1 ${KELAS_TOMBOL_UTAMA}`}>
            Talangan lain
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={simpan} className="mt-4 flex flex-1 flex-col gap-5">
      {!memberPenalang && (
        <p role="alert" className={KELAS_SPANDUK}>
          Akunmu belum terhubung ke data anggota, jadi talangan belum bisa disimpan. Isi kolom profile_id milikmu di tabel members.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="judul" className={KELAS_LABEL}>Judul</label>
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
            <label htmlFor="tanggal" className={KELAS_LABEL}>Tanggal</label>
            <input id="tanggal" type="date" value={tanggal} onChange={(e) => gantiTanggal(e.target.value)} className={KELAS_MEDAN} />
          </>
        ) : (
          <button type="button" onClick={() => setUbahTanggal(true)} className="flex min-h-11 items-center gap-2 self-start text-tl-isi">
            <span className="text-tl-teks-sekunder">Tanggal: {tanggal === hariIni() ? 'hari ini' : tanggal}</span>
            <span className={KELAS_TAUTAN}>Ubah</span>
          </button>
        )}
        {galat?.medan.tanggal && <p className={KELAS_GALAT}>{galat.medan.tanggal}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="total" className={KELAS_LABEL}>Total dibayar</label>
        <div className={`${KELAS_KOTAK_ANGKA} px-3`}>
          <span className="text-[22px] font-extrabold text-tl-teks-redup">Rp</span>
          <input
            id="total"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={tampilDigit(digitTotal)}
            onChange={(e) => setDigitTotal(keDigit(e.target.value))}
            placeholder="0"
            aria-invalid={galat?.medan.total ? true : undefined}
            className="min-h-16 w-full bg-transparent px-2 text-right text-[32px] font-extrabold tabular-nums text-tl-teks outline-none"
          />
        </div>
        {galat?.medan.total && <p className={KELAS_GALAT}>{galat.medan.total}</p>}
      </div>

      <fieldset className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <legend className={KELAS_LABEL}>Siapa yang ikut</legend>
          <button type="button" onClick={pilihSemua} disabled={anggota.length === 0} className={`min-h-11 px-2 text-tl-label ${KELAS_TAUTAN} disabled:text-tl-teks-redup`}>
            {semuaTerpilih ? 'Batal pilih semua' : 'Pilih semua'}
          </button>
        </div>
        {anggota.length === 0 ? (
          <p className={KELAS_PETUNJUK}>
            Belum ada anggota aktif. <Link href="/anggota" className={KELAS_TAUTAN}>Tambah anggota</Link>
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
        <span id="label-cara-bagi" className={KELAS_LABEL}>Cara bagi</span>
        <div role="tablist" aria-labelledby="label-cara-bagi" className="grid grid-cols-3 gap-1 rounded-tl-tombol bg-tl-belum p-1">
          {MODE.map((m) => (
            <button
              key={m.nilai}
              type="button"
              role="tab"
              aria-selected={mode === m.nilai}
              onClick={() => setMode(m.nilai)}
              className={`min-h-11 rounded-[9px] text-tl-isi font-bold ${mode === m.nilai ? 'bg-tl-permukaan text-tl-aksi shadow-sm' : 'text-tl-teks-sekunder'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'manual' && (
          <div role="tabpanel" className="flex flex-col gap-2">
            {urut.length === 0 && <p className={KELAS_PETUNJUK}>Pilih dulu siapa yang ikut.</p>}
            {urut.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <label htmlFor={`nominal-${p.id}`} className="min-w-0 flex-1 truncate text-tl-nama font-semibold">{label(p.id)}</label>
                <div className={`w-40 ${KELAS_KOTAK_ANGKA}`}>
                  <span className="text-tl-label font-semibold text-tl-teks-redup">Rp</span>
                  <input
                    id={`nominal-${p.id}`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={tampilDigit(digitManual[p.id] ?? '')}
                    onChange={(e) => setDigitManual((lama) => ({ ...lama, [p.id]: keDigit(e.target.value) }))}
                    placeholder="0"
                    className="min-h-11 w-full bg-transparent px-1 text-right text-[16px] tabular-nums text-tl-teks outline-none"
                  />
                </div>
              </div>
            ))}
            {urut.length > 0 && (
              <p aria-live="polite" className={`text-right text-tl-isi font-bold ${selisihManual === 'Pas' ? 'text-tl-lunas-teks' : 'text-tl-lama'}`}>
                {selisihManual}
              </p>
            )}
          </div>
        )}

        {mode === 'per_item' && (
          <div role="tabpanel" className="flex flex-col gap-3">
            {!bukaTempel ? (
              <button
                type="button"
                onClick={() => setBukaTempel(true)}
                className={`self-start ${KELAS_TOMBOL_SEKUNDER}`}
              >
                Tempel dari ChatGPT
              </button>
            ) : (
              <div className={`flex flex-col gap-2 p-3 ${KELAS_KARTU}`}>
                <label htmlFor="tempel-teks" className={KELAS_LABEL}>Tempel jawaban ChatGPT</label>
                <textarea
                  id="tempel-teks"
                  rows={8}
                  value={teksTempel}
                  onChange={(e) => setTeksTempel(e.target.value)}
                  aria-invalid={galatTempel ? true : undefined}
                  aria-describedby={galatTempel ? 'galat-tempel' : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  className={`${KELAS_MEDAN} py-2 font-mono text-[14px]`}
                />
                {items.length > 0 && <p className="text-tl-label text-tl-teks-redup">Item yang sudah ada akan diganti.</p>}
                {galatTempel && (
                  <div id="galat-tempel" role="alert" className="flex flex-col gap-2">
                    <p className={KELAS_GALAT}>{galatTempel}</p>
                    <p className="text-tl-label text-tl-teks-redup">Contoh format yang terbaca:</p>
                    <pre className="overflow-x-auto rounded-tl-tombol bg-tl-belum p-2 text-[11px] text-tl-teks">{CONTOH_TABEL}</pre>
                    <button type="button" onClick={isiManualSaja} className={`self-start ${KELAS_TOMBOL_SEKUNDER}`}>
                      Isi manual saja
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={uraiTabel}
                    disabled={sedangUrai || teksTempel.trim() === ''}
                    className={`flex-1 ${KELAS_TOMBOL_UTAMA}`}
                  >
                    {sedangUrai ? 'Membaca…' : 'Urai tabel'}
                  </button>
                  <button type="button" onClick={isiManualSaja} className={KELAS_TOMBOL_SEKUNDER}>
                    Batal
                  </button>
                </div>
              </div>
            )}

            {impor && items.length > 0 && (
              <div className="flex flex-col gap-2">
                <div aria-live="polite" role="group" aria-label="Pemeriksaan tabel" className="flex flex-wrap gap-2">
                  <Lencana ok={barisBermasalah === 0}>Baris {barisBermasalah === 0 ? '✓' : '✗'}</Lencana>
                  <Lencana ok={belumMasuk === 0}>
                    Total {belumMasuk === 0 ? '✓' : '✗'} {rupiah(total)}
                  </Lencana>
                  {tampilCekQty && (
                    <Lencana ok={impor.cocokQty}>
                      Jumlah item {impor.cocokQty ? '✓' : '✗'} {jumlahQty}
                    </Lencana>
                  )}
                </div>
                {barisBermasalah > 0 && <p className={KELAS_GALAT}>Ada {barisBermasalah} baris yang hitungannya tidak cocok.</p>}
                {tampilCekQty && !impor.cocokQty && (
                  <p className={KELAS_GALAT}>Jumlah item di tabel tidak sama dengan yang terbaca ({jumlahQty}).</p>
                )}
                {belumMasuk > 0 && (
                  <p role="status" className={KELAS_SPANDUK}>
                    {total === impor.totalTercetak ? 'Total tercetak' : 'Total dibayar'} {rupiah(total)}, jumlah item {rupiah(jumlahItem)}. Ada {rupiah(belumMasuk)} yang belum masuk ke harga item.
                    Ubah angka item sampai jumlahnya cocok, atau tambah item &quot;Pajak&quot; lalu tandai siapa yang menanggung.
                  </p>
                )}
                {belumMasuk < 0 && (
                  <p role="status" className={KELAS_SPANDUK}>
                    Jumlah item lebih {rupiah(-belumMasuk)} dari total dibayar. Periksa angka item atau total dibayar.
                  </p>
                )}
              </div>
            )}

            {items.map((it) => (
              <div key={it.kunci} className={`flex flex-col gap-2 p-3 ${KELAS_KARTU}`}>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Nama item ${it.nama}`}
                    value={it.nama}
                    maxLength={80}
                    onChange={(e) => ubahItem(it.kunci, { nama: e.target.value })}
                    className={`${KELAS_MEDAN} min-w-0 flex-1 font-bold`}
                  />
                  <span className="shrink-0 text-tl-isi font-bold text-tl-teks-sekunder">× {it.qty}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-40 ${KELAS_KOTAK_ANGKA}`}>
                    <span className="text-tl-label font-semibold text-tl-teks-redup">Rp</span>
                    <input
                      aria-label={`Harga baris ${it.nama}`}
                      inputMode="numeric"
                      autoComplete="off"
                      value={tampilDigit(it.subtotal === 0 ? '' : String(it.subtotal))}
                      onChange={(e) => ubahItem(it.kunci, { digit: keDigit(e.target.value) })}
                      placeholder="0 = gratis"
                      className="min-h-11 w-full bg-transparent px-1 text-right text-[16px] tabular-nums text-tl-teks outline-none"
                    />
                  </div>
                  {it.subtotal === 0 && (
                    <span className="rounded-full bg-tl-lunas px-2 py-0.5 text-tl-lencana font-bold text-tl-lunas-teks">Gratis</span>
                  )}
                  <button type="button" onClick={() => hapusItem(it.kunci)} aria-label={`Hapus ${it.nama}`} className="ml-auto min-h-11 min-w-11 rounded-tl-tombol text-tl-label font-bold text-tl-galat underline underline-offset-4">
                    Hapus
                  </button>
                </div>
                {unit
                  .filter((u) => items[u.indukIndeks]?.kunci === it.kunci)
                  .map((u) => (
                    <div key={u.kunci} className="flex flex-col gap-1 border-t border-tl-garis-halus pt-2">
                      <div className="flex items-center justify-between text-tl-isi">
                        <span>
                          {u.nama}
                          {u.dari > 1 ? ` (${u.ke}/${u.dari})` : ''}
                        </span>
                        <span className="flex items-center gap-2">
                          {u.subtotal > 0 && u.penanggung.length === 0 && <span className="font-bold text-tl-lama">Belum ditandai</span>}
                          <span className="font-bold tabular-nums">{rupiah(u.subtotal)}</span>
                        </span>
                      </div>
                      {urut.length === 0 ? (
                        <p className="text-tl-label text-tl-teks-redup">Pilih dulu siapa yang ikut.</p>
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

            <div className="flex flex-col gap-2 rounded-tl-kartu border-[1.5px] border-dashed border-tl-garis-medan p-3">
              <div className="flex gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor="item-nama" className={KELAS_LABEL}>Nama item</label>
                  <input id="item-nama" value={isianItem.nama} maxLength={80} onChange={(e) => setIsianItem((s) => ({ ...s, nama: e.target.value }))} className={KELAS_MEDAN} />
                </div>
                <div className="flex w-16 flex-col gap-1">
                  <label htmlFor="item-qty" className={KELAS_LABEL}>Qty</label>
                  <input id="item-qty" inputMode="numeric" value={isianItem.qty} onChange={(e) => setIsianItem((s) => ({ ...s, qty: e.target.value.replace(/\D/g, '').slice(0, 2) }))} className={`${KELAS_MEDAN} text-right`} />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor="item-harga" className={KELAS_LABEL}>Harga baris (semua qty)</label>
                  <input
                    id="item-harga"
                    inputMode="numeric"
                    value={tampilDigit(isianItem.digit)}
                    onChange={(e) => setIsianItem((s) => ({ ...s, digit: keDigit(e.target.value) }))}
                    placeholder="0 = gratis"
                    className={`${KELAS_MEDAN} text-right tabular-nums`}
                  />
                </div>
                <button type="button" onClick={tambahItem} className={KELAS_TOMBOL_SEKUNDER}>
                  Tambah item
                </button>
              </div>
              {galatItem && <p className={KELAS_GALAT}>{galatItem}</p>}
            </div>
            {items.length > 0 && !impor && (
              <p aria-live="polite" className={`text-right text-tl-isi font-bold ${selisihItem === 'Pas' ? 'text-tl-lunas-teks' : 'text-tl-lama'}`}>
                Jumlah item: {selisihItem === 'Pas' ? 'Pas dengan total' : `${selisihItem} dari total`}
              </p>
            )}
          </div>
        )}
        {galat?.medan.nominal && <p className={KELAS_GALAT}>{galat.medan.nominal}</p>}
        {galat?.medan.items && <p className={KELAS_GALAT}>{galat.medan.items}</p>}
      </div>

      <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 border-t border-tl-garis bg-tl-latar px-5 pt-3 pb-4">
        <p aria-live="polite" className="text-center text-tl-nama font-bold tabular-nums">{pratinjau}</p>
        <button
          type="submit"
          disabled={sedangSimpan || !siap}
          className={`min-h-13 w-full ${KELAS_TOMBOL_UTAMA}`}
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
