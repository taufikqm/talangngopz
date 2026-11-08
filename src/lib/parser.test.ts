import { describe, it, expect } from 'vitest';
import {
  uraikanTabel,
  uraiKeUnit,
  subtotalPerAnggota,
  angka,
  GalatUrai,
  BATAS_PANJANG,
} from './parser';
import { hitungPorsi } from './uang';
import {
  SAMPEL_CHICKEN_RICE_BOWL,
  SAMPEL_NASI_BAKAR,
  SAMPEL_INDOMIE,
  SAMPEL_BUKAN_TABEL,
} from './__fixtures__/chatgpt';

describe('angka', () => {
  it('membuang titik ribuan, Rp, dan tanda tebal', () => {
    expect(angka('Rp15.983')).toBe(15_983);
    expect(angka('Rp 15,983')).toBe(15_983);
    expect(angka('**Rp66.200**')).toBe(66_200);
    expect(angka('Rp202.000\\')).toBe(202_000);
  });

  it('membaca teks gratis sebagai nol, bukan gagal', () => {
    expect(angka('Gratis (bonus)')).toBe(0);
    expect(angka('bonus')).toBe(0);
    expect(angka('FREE')).toBe(0);
  });

  it('sel kosong jadi nol', () => {
    expect(angka('')).toBe(0);
    expect(angka()).toBe(0);
  });

  it('mengambil angka dari sel bercampur teks', () => {
    expect(angka('12 item')).toBe(12);
  });
});

describe('sampel 1 — Chicken Rice Bowl', () => {
  const h = uraikanTabel(SAMPEL_CHICKEN_RICE_BOWL);

  it('membaca 5 item', () => {
    expect(h.items).toHaveLength(5);
  });

  it('membaca harga teralokasi apa adanya', () => {
    expect(h.items[0]).toMatchObject({
      nama: 'Chicken Rice Bowl',
      qty: 2,
      satuan: 15_983,
      subtotal: 31_966,
      diturunkan: false,
      valid: true,
    });
  });

  it('menandai item gratis tanpa gagal urai', () => {
    expect(h.items[3]).toMatchObject({
      nama: 'Mix Dimsum (3 pcs)',
      subtotal: 0,
      gratis: true,
      valid: true,
    });
  });

  it('membaca total dari baris bertanda tebal dengan sel qty kosong', () => {
    expect(h.total).toBe(66_200);
    expect(h.cocokTotal).toBe(true);
  });

  it('seluruh baris lolos cek aritmetika', () => {
    expect(h.items.every((i) => i.valid)).toBe(true);
  });

  it('harga sudah teralokasi', () => {
    expect(h.selisih).toBe(0);
    expect(h.sudahTeralokasi).toBe(true);
  });

  it('cocokQty longgar saat baris total tidak mencantumkan jumlah item', () => {
    expect(h.cocokQty).toBe(true);
  });
});

describe('sampel 2 — Nasi Bakar Riau', () => {
  const h = uraikanTabel(SAMPEL_NASI_BAKAR);

  it('membaca 6 item walaupun hanya ada 3 kolom', () => {
    expect(h.items).toHaveLength(6);
  });

  it('mengenali kolom bernama "Total" sebagai subtotal', () => {
    expect(h.items[0].subtotal).toBe(15_000);
  });

  it('menurunkan harga satuan dari subtotal dibagi qty', () => {
    expect(h.items[1]).toMatchObject({
      nama: 'Nasi Bakar Ayam Geprek',
      qty: 2,
      subtotal: 50_000,
      satuan: 25_000,
      diturunkan: true,
      valid: true,
    });
    // Cocok dengan daftar "Rincian per pcs" yang ChatGPT tulis sendiri.
    expect(h.items[5]).toMatchObject({ nama: 'Air Mineral', qty: 4, satuan: 8_000 });
  });

  it('BERHENTI di baris total dan tidak menelan prose sesudahnya', () => {
    // Tanpa break, baris "Grand total: Rp199.000" akan menimpa total jadi 0,
    // dan baris "- Nasi Bakar Original: Rp15.000" jadi item hantu.
    expect(h.total).toBe(199_000);
    expect(h.items).toHaveLength(6);
    expect(h.items.some((i) => i.nama.startsWith('-'))).toBe(false);
    expect(h.items.some((i) => /Rincian|Catatan/i.test(i.nama))).toBe(false);
  });

  it('memakai sel "12 item" pada baris total sebagai cek ketiga', () => {
    expect(h.cocokQty).toBe(true);
    expect(h.items.reduce((a, b) => a + b.qty, 0)).toBe(12);
  });

  it('tidak ada pajak, selisih tetap nol', () => {
    expect(h.selisih).toBe(0);
    expect(h.cocokTotal).toBe(true);
  });
});

describe('sampel 3 — Indomie dengan pajak 10 persen', () => {
  const h = uraikanTabel(SAMPEL_INDOMIE);

  it('mengenali header "Harga/pcs" dan "Total + Pajak"', () => {
    expect(h.items).toHaveLength(6);
    expect(h.items[1]).toMatchObject({
      nama: 'Banglades(h)',
      qty: 3,
      satuan: 24_200,
      subtotal: 72_600,
      diturunkan: false,
      valid: true,
    });
  });

  it('mengabaikan ringkasan pra-tabel dan judul markdown', () => {
    expect(h.items.some((i) => /Subtotal|Pajak|Rincian/i.test(i.nama))).toBe(false);
  });

  it('membaca total walaupun sel harga pada baris total kosong', () => {
    expect(h.total).toBe(222_200);
    expect(h.cocokTotal).toBe(true);
    expect(h.cocokQty).toBe(true);
  });

  // Inti dari fikstur ini.
  it('JEBAKAN PAJAK GANDA: menandai harga sudah teralokasi', () => {
    expect(h.selisih).toBe(0);
    expect(h.sudahTeralokasi).toBe(true);
  });

  it('alokasi ulang akan melipatgandakan pajak bila penanda diabaikan', () => {
    const subtotalPeserta = new Map(h.items.map((i, k) => [`p${k}`, i.subtotal]));
    const subtotal = h.items.reduce((a, b) => a + b.subtotal, 0);

    const benar = hitungPorsi({
      subtotalPeserta,
      subtotal,
      pajak: 20_200, // angka dari prose; harus diabaikan
      biayaLayanan: 0,
      diskon: 0,
      pembulatanKe: 'p0',
      sudahTeralokasi: h.sudahTeralokasi,
    });
    const salah = hitungPorsi({
      subtotalPeserta,
      subtotal,
      pajak: 20_200,
      biayaLayanan: 0,
      diskon: 0,
      pembulatanKe: 'p0',
    });

    const jml = (m: Map<string, { total: number }>) =>
      [...m.values()].reduce((a, p) => a + p.total, 0);

    expect(jml(benar)).toBe(222_200);
    expect(jml(salah)).toBe(242_400); // kelebihan Rp20.200
  });
});

describe('penolakan', () => {
  it('menolak teks tanpa tabel dengan pesan yang bisa dibaca', () => {
    expect(() => uraikanTabel(SAMPEL_BUKAN_TABEL)).toThrow(GalatUrai);
    try {
      uraikanTabel(SAMPEL_BUKAN_TABEL);
    } catch (e) {
      expect((e as GalatUrai).kode).toBe('tabel_tidak_dikenali');
    }
  });

  it('menolak masukan melebihi batas panjang', () => {
    expect(() => uraikanTabel('x'.repeat(BATAS_PANJANG + 1))).toThrow(
      /terlalu panjang/i,
    );
  });

  it('tidak pernah menjalankan isi tempelan sebagai kode', () => {
    // Penguraian murni manipulasi string. Teks berbahaya hanya jadi nama item
    // atau ditolak, tidak pernah dieksekusi.
    const jahat = `
| Menu | Qty | Total |
| --- | --- | --- |
| <img src=x onerror=alert(1)> | 1 | Rp1.000 |
| Total | 1 | Rp1.000 |
`.trim();
    const h = uraikanTabel(jahat);
    expect(h.items[0].nama).toBe('<img src=x onerror=alert(1)>');
    expect(h.items[0].subtotal).toBe(1_000);
  });
});

describe('uraiKeUnit', () => {
  it('memecah sampel 3 menjadi 13 unit', () => {
    const h = uraikanTabel(SAMPEL_INDOMIE);
    const unit = uraiKeUnit(h.items);
    expect(unit).toHaveLength(13);
    expect(unit.reduce((a, u) => a + u.subtotal, 0)).toBe(222_200);
  });

  it('tiap unit Nasi Putih bernilai sepertiga barisnya', () => {
    const h = uraikanTabel(SAMPEL_INDOMIE);
    const unit = uraiKeUnit(h.items).filter((u) => u.nama === 'Nasi Putih');
    expect(unit.map((u) => u.subtotal)).toEqual([5_500, 5_500, 5_500]);
    expect(unit[0]).toMatchObject({ ke: 1, dari: 3 });
  });

  it('membagi subtotal, bukan mengalikan satuan, saat tidak habis dibagi', () => {
    const h = uraikanTabel(
      `
| Menu | Qty | Total |
| --- | --- | --- |
| Es Teh | 3 | Rp32.000 |
| Total | 3 | Rp32.000 |
`.trim(),
    );
    const unit = uraiKeUnit(h.items);
    expect(unit.map((u) => u.subtotal)).toEqual([10_668, 10_666, 10_666]);
    expect(unit.reduce((a, u) => a + u.subtotal, 0)).toBe(32_000);
    // satuan tampilan 10.666; dikalikan balik meleset Rp2 dari total
    expect(h.items[0].satuan * 3).toBe(31_998);
    expect(h.items[0].valid).toBe(false); // ditandai merah di layar koreksi
  });
});

describe('subtotalPerAnggota', () => {
  it('menjumlahkan unit yang sudah ditandai, total tetap pas', () => {
    const h = uraikanTabel(SAMPEL_INDOMIE);
    const unit = uraiKeUnit(h.items);
    const orang = ['dika', 'rizky', 'arjuna'];
    unit.forEach((u, k) => (u.penanggung = [orang[k % 3]]));

    const per = subtotalPerAnggota(unit);
    expect([...per.values()].reduce((a, b) => a + b, 0)).toBe(222_200);
  });

  it('membagi unit patungan rata di antara penanggungnya', () => {
    const h = uraikanTabel(SAMPEL_INDOMIE);
    const unit = uraiKeUnit(h.items).slice(0, 1); // Indomie Rp16.500
    unit[0].penanggung = ['a', 'b'];
    const per = subtotalPerAnggota(unit);
    expect(per.get('a')).toBe(8_250);
    expect(per.get('b')).toBe(8_250);
  });

  it('menolak bila masih ada unit tanpa penanggung', () => {
    const h = uraikanTabel(SAMPEL_INDOMIE);
    expect(() => subtotalPerAnggota(uraiKeUnit(h.items))).toThrow(RangeError);
  });
});
