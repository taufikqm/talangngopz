/**
 * Keluaran ChatGPT nyata dari riwayat Arjuna, disalin apa adanya.
 *
 * Ini bukan contoh karangan. Tiap fikstur pernah mematahkan parser di tempat
 * yang berbeda, dan itulah alasan bentuknya dipertahankan huruf demi huruf.
 * Jangan dirapikan, jangan diseragamkan.
 *
 * Saat parser gagal pada keluaran baru, tambahkan fikstur baru di sini
 * beserta catatan apa yang dipatahkannya, lalu baru tambal polanya.
 */

/**
 * Sampel 1 — Chicken Rice Bowl.
 *
 * Yang diuji:
 *   - 4 kolom, harga satuan tersedia
 *   - harga sudah teralokasi (desimal ganjil: 15.983, 20.408, 4.424, 9.402)
 *   - item gratis dengan teks "Gratis (bonus)" di kolom harga
 *   - baris total bertanda tebal dengan sel qty kosong
 */
export const SAMPEL_CHICKEN_RICE_BOWL = `
| Menu | Jumlah | Harga per porsi | Subtotal |
| --- | --- | --- | --- |
| Chicken Rice Bowl | 2 | Rp15.983 | Rp31.966 |
| Beef Yakiniku | 1 | Rp20.408 | Rp20.408 |
| Extra Nasi | 1 | Rp4.424 | Rp4.424 |
| Mix Dimsum (3 pcs) | 1 | Gratis (bonus) | Rp0 |
| Lumpia (3 pcs) | 1 | Rp9.402 | Rp9.402 |
| **Total bayar** | | | **Rp66.200** |
`.trim();

/**
 * Sampel 2 — Nasi Bakar Riau.
 *
 * Yang diuji:
 *   - hanya 3 kolom; kolom harga satuan TIDAK ADA, harus diturunkan
 *   - header kolom bernama "Total", bukan "Subtotal"
 *   - prose sebelum tabel
 *   - PROSE SESUDAH TABEL, termasuk baris "Grand total: Rp199.000" yang akan
 *     menimpa total bila parser tidak berhenti di baris total
 *   - sel qty pada baris total berisi "12 item", bukan angka telanjang
 */
export const SAMPEL_NASI_BAKAR = `
Ini rincian bill Nasi Bakar Riau ya. 😊

Di struk tertulis subtotal = grand total Rp199.000, jadi tidak ada tambahan pajak yang tercantum.

| Menu                          | Qty     | Total     |
| ----------------------------- | ------- | --------- |
| Nasi Bakar Original           | 1       | Rp15.000  |
| Nasi Bakar Ayam Geprek        | 2       | Rp50.000  |
| Nasi Bakar Tongkol Kecombrang | 2       | Rp60.000  |
| Telur Barendo Sambal Hijau    | 2       | Rp30.000  |
| Teh Manis Jumbo               | 1       | Rp12.000  |
| Air Mineral                   | 4       | Rp32.000  |
| Total                         | 12 item | Rp199.000 |

Rincian per pcs:

- Nasi Bakar Original: Rp15.000
- Nasi Bakar Ayam Geprek: Rp25.000
- Nasi Bakar Tongkol Kecombrang: Rp30.000
- Telur Barendo Sambal Hijau: Rp15.000
- Teh Manis Jumbo: Rp12.000
- Air Mineral: Rp8.000

Grand total: Rp199.000

Catatan: Tidak ada nominal pajak terpisah di struk, jadi angka di atas mengikuti total yang dibayarkan.
`.trim();

/**
 * Sampel 3 — Indomie, dengan pajak 10 persen.
 *
 * Yang diuji:
 *   - JEBAKAN PAJAK GANDA: prose di atas tabel menyebut "Pajak 10%: Rp20.200",
 *     tetapi harga di tabel SUDAH mengandung pajak. Σ item = grand total,
 *     sehingga selisih = 0 dan alokasi tidak boleh dijalankan.
 *     Invarian Σ = total TIDAK menangkap kesalahan ini: tabelnya konsisten
 *     di level pasca-pajak.
 *   - header kolom "Harga/pcs" dan "Total + Pajak"
 *   - ringkasan pra-tabel dengan garis miring terbalik penanda ganti baris
 *   - judul markdown di antara prose dan tabel
 *   - sel kosong di kolom harga pada baris total
 *   - empat dari enam baris ber-qty lebih dari satu
 */
export const SAMPEL_INDOMIE = `
Ini rincian per item setelah ditambahkan pajak pemerintah 10% ya!

Subtotal: Rp202.000\\
Pajak 10%: Rp20.200\\


Grand Total Rp222.200

### Rincian harga sudah termasuk pajak

| Menu                        | Qty | Harga/pcs | Total + Pajak |
| --------------------------- | --- | --------- | ------------- |
| Indomie Rebus Soto + rwit   | 1   | Rp16.500  | Rp16.500      |
| Banglades(h)                | 3   | Rp24.200  | Rp72.600      |
| Nasi Goreng Singapore       | 1   | Rp28.600  | Rp28.600      |
| Nasi Putih                  | 3   | Rp5.500   | Rp16.500      |
| Badak Sarsaparilla Original | 3   | Rp22.000  | Rp66.000      |
| Air Mineral                 | 2   | Rp11.000  | Rp22.000      |
| Total                       | 13  |           | Rp222.200     |

Harga per orang/item setelah pajak:

- Indomie Rebus Soto: Rp16.500
- Banglades(h): Rp24.200/pcs
- Nasi Goreng Singapore: Rp28.600
- Nasi Putih: Rp5.500/pcs
- Badak Sarsaparilla: Rp22.000/pcs
- Air Mineral: Rp11.000/pcs

Pajak sudah dibagi secara proporsional ke masing-masing menu, jadi totalnya pas Rp222.200.
`.trim();

/** Teks tanpa tabel sama sekali. Harus ditolak dengan pesan yang jelas. */
export const SAMPEL_BUKAN_TABEL = `
Halo! Boleh kirim foto struknya dulu ya, supaya saya bisa bantu hitung
pembagiannya. Kalau sudah ada, saya rincikan per orang.
`.trim();
