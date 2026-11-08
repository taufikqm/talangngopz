# Arjuna Split Bill — berkas awal proyek

Isi map ini menutup bagian yang belum ada di PRD dan SRS. Salin seluruhnya ke
akar repositori baru, lalu mulai dari tiket T-01.

```
AGENTS.md                              baca dulu. Aturan yang mengikat agen
docs/
  ui-spec-tahap-1.md                   8 layar, keadaan, kriteria terima
  backlog-tahap-1.md                   15 tiket berurutan + Tahap 2
src/lib/
  uang.ts                              perhitungan uang. FINAL
  uang.test.ts                         21 uji, termasuk uji properti 1.000 kombinasi
  parser.ts                            penguraian tabel ChatGPT. FINAL
  parser.test.ts                       31 uji
  __fixtures__/chatgpt.ts              3 keluaran ChatGPT nyata, verbatim
  contracts.ts                         tipe Server Action dan Route Handler
supabase/
  migrations/0001_schema.sql           tabel, indeks, tampilan v_piutang
  migrations/0002_rls.sql              RLS + kebijakan
  migrations/0003_guards.sql           5 pemicu penjaga
  seed.sql                             12 anggota
```

## Status uji

52 uji hijau pada Vitest 3.2.4, Node 22.

```bash
pnpm add -D vitest typescript
pnpm vitest run
```

## Tiga hal yang paling mudah dirusak

**Pajak ganda.** Data dari ChatGPT hampir selalu sudah mengandung pajak.
Menjalankan alokasi di atasnya menambah tagihan tiap orang, dan invarian
`Σ = total` **tidak menangkapnya** karena datanya konsisten di level pasca-pajak.
Penjaganya hanya `selisih === 0` dari parser. Ada uji khusus untuk ini di
`parser.test.ts`, kasus "JEBAKAN PAJAK GANDA".

**Mengalikan `satuan`.** Saat memecah baris `qty > 1`, bagi `subtotal`.
`Rp32.000 ÷ 3` menghasilkan satuan tampilan `10.666`; dikalikan balik jadi
`31.998`, meleset Rp2 dari yang dibayar.

**RLS yang dikira jalan.** Migrasi berhasil tidak berarti kebijakannya benar.
T-03 memverifikasinya dengan dua akun, dan ulangi di produksi sebelum data
nyata masuk.

## Yang sengaja tidak ada

OCR, pemanggilan API model AI, otomasi antarmuka ChatGPT, akun untuk peserta,
payment gateway, obrolan di dalam aplikasi. Alasan tiap keputusan ada di PRD.
