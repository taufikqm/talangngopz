import { describe, it, expect } from 'vitest';
import { CONTOH_TABEL, pratinjauDariTeks } from './impor';
import { ITEM_MAKS, QTY_MAKS } from './event';
import { BATAS_PANJANG } from './parser';
import { SAMPEL_BUKAN_TABEL, SAMPEL_CHICKEN_RICE_BOWL, SAMPEL_INDOMIE } from './__fixtures__/chatgpt';

function data(teks: unknown) {
  const h = pratinjauDariTeks(teks);
  if (!h.ok) throw new Error(`ditolak: ${h.pesan}`);
  return h.data;
}

function galat(teks: unknown) {
  const h = pratinjauDariTeks(teks);
  if (h.ok) throw new Error('seharusnya ditolak');
  return h;
}

describe('pratinjauDariTeks: tabel nyata', () => {
  it('Indomie: 6 item, 13 unit, total tercetak, harga final (selisih 0)', () => {
    const d = data(SAMPEL_INDOMIE);
    expect(d.items).toHaveLength(6);
    expect(d.unit).toHaveLength(13);
    expect(d.total).toBe(222_200);
    expect(d.selisih).toBe(0);
    expect(d.sudahTeralokasi).toBe(true);
    expect(d.cocokTotal).toBe(true);
    expect(d.cocokQty).toBe(true);
    expect(d.unit.reduce((a, u) => a + u.subtotal, 0)).toBe(222_200);
    expect(d.namaTidakCocok).toEqual([]);
  });

  it('Chicken Rice Bowl: item gratis tetap ada dengan nominal 0', () => {
    const d = data(SAMPEL_CHICKEN_RICE_BOWL);
    expect(d.items).toHaveLength(5);
    expect(d.items[3]).toMatchObject({ gratis: true, subtotal: 0 });
    expect(d.total).toBe(66_200);
  });

  it('contoh format di layar benar-benar terbaca', () => {
    const d = data(CONTOH_TABEL);
    expect(d.items.map((i) => [i.nama, i.qty, i.subtotal])).toEqual([
      ['Nasi Putih', 2, 10_000],
      ['Es Teh', 1, 4_000],
    ]);
    expect(d.total).toBe(14_000);
    expect(d.selisih).toBe(0);
  });

  it('total tercetak lebih besar dari jumlah item: selisih positif, apa adanya, tanpa alokasi', () => {
    const d = data(`| Menu | Qty | Subtotal |
| Nasi | 1 | Rp10.000 |
| Total | | Rp12.000 |`);
    expect(d.selisih).toBe(2_000);
    expect(d.sudahTeralokasi).toBe(false);
    expect(d.cocokTotal).toBe(false);
    expect(d.items[0].subtotal).toBe(10_000);
  });
});

describe('pratinjauDariTeks: penolakan', () => {
  it('kosong, spasi saja, atau bukan string: validasi', () => {
    for (const t of ['', '   \n ', undefined, null, 42, { teks: 'x' }]) {
      const h = galat(t);
      expect(h.kode).toBe('validasi');
      expect(h.pesan).toBe('Tempel dulu jawaban ChatGPT yang berisi tabel.');
    }
  });

  it('bukan tabel: pesan tabel tidak dikenali', () => {
    const h = galat(SAMPEL_BUKAN_TABEL);
    expect(h.kode).toBe('validasi');
    expect(h.pesan).toBe('Tabel tidak dikenali. Pastikan ada kolom nama item dan harga.');
  });

  it('tabel tanpa baris item: pesan tabel kosong', () => {
    const h = galat('| Menu | Qty | Subtotal |\n| --- | --- | --- |');
    expect(h.pesan).toBe('Tidak ada baris item yang terbaca.');
  });

  it('melebihi batas panjang: pesan memuat batasnya', () => {
    const h = galat('x'.repeat(BATAS_PANJANG + 1));
    expect(h.pesan).toBe('Teks terlalu panjang, maksimal 100.000 karakter.');
  });

  it('qty raksasa ditolak sebelum diuraikan ke unit (tidak membuat miliaran unit)', () => {
    const h = galat(`| Menu | Qty | Subtotal |\n| Nasi | 1000000000 | Rp10.000 |\n| Total | | Rp10.000 |`);
    expect(h.pesan).toBe(`Jumlah "Nasi" lebih dari ${QTY_MAKS}.`);
  });

  it('deretan digit sangat panjang (Infinity) ditolak, bukan menghasilkan selisih NaN', () => {
    const h = galat(`| Menu | Qty | Subtotal |\n| Nasi | 1 | ${'9'.repeat(400)} |\n| Total | | Rp10.000 |`);
    expect(h.pesan).toBe('Ada angka yang terlalu besar.');
  });

  it('jumlah item melebihi batas simpan: ditolak di pratinjau, bukan baru saat simpan', () => {
    const baris = Array.from({ length: ITEM_MAKS + 1 }, (_, i) => `| Item ${i} | 1 | Rp1.000 |`).join('\n');
    const h = galat(`| Menu | Qty | Subtotal |\n${baris}`);
    expect(h.pesan).toBe(`Terlalu banyak item, maksimal ${ITEM_MAKS}.`);
  });

  it('total jauh di atas batas: ditolak', () => {
    const h = galat(`| Menu | Qty | Subtotal |\n| Nasi | 1 | Rp10.000 |\n| Total | | Rp99.999.999.999 |`);
    expect(h.pesan).toBe('Ada angka yang terlalu besar.');
  });
});

describe('pratinjauDariTeks: masukan tidak tepercaya', () => {
  it('nama item berisi markup tetap teks biasa dan dipotong ke 80 karakter', () => {
    const d = data(`| Menu | Qty | Subtotal |\n| <img src=x onerror=alert(1)>${'a'.repeat(100)} | 1 | Rp1.000 |\n| Total | | Rp1.000 |`);
    expect(d.items[0].nama.startsWith('<img src=x onerror=alert(1)>')).toBe(true);
    expect(d.items[0].nama).toHaveLength(80);
  });
});
