/**
 * Batas laju jendela tetap, dalam memori per instans. Upaya terbaik: tiap instans
 * serverless menghitung sendiri, dan hitungan hilang saat instans berganti. Cukup
 * untuk meredam pengiriman berulang dari satu tautan, bukan pertahanan terhadap
 * penyerang yang tersebar.
 *
 * Kunci (token) hanya disimpan di Map dan tidak pernah dicatat ke log.
 */

export type Keputusan = { boleh: true } | { boleh: false; cobaLagiDetik: number };

type Jendela = { mulai: number; jumlah: number };

export function buatBatasLaju({
  maks,
  jendelaMs,
  kapasitas,
  sekarang = () => Date.now(),
}: {
  maks: number;
  jendelaMs: number;
  /** Batas jumlah kunci yang diingat, supaya token acak tidak membuat Map tumbuh tanpa batas. */
  kapasitas: number;
  sekarang?: () => number;
}) {
  const peta = new Map<string, Jendela>();

  function rapikan(kini: number) {
    for (const [kunci, j] of peta) if (kini - j.mulai >= jendelaMs) peta.delete(kunci);
    // Map menjaga urutan sisip, jadi entri pertama adalah yang tertua.
    while (peta.size >= kapasitas) {
      const tertua = peta.keys().next();
      if (tertua.done) break;
      peta.delete(tertua.value);
    }
  }

  return {
    periksa(kunci: string): Keputusan {
      const kini = sekarang();
      const j = peta.get(kunci);
      if (!j || kini - j.mulai >= jendelaMs) {
        if (j) peta.delete(kunci);
        if (peta.size >= kapasitas) rapikan(kini);
        peta.set(kunci, { mulai: kini, jumlah: 1 });
        return { boleh: true };
      }
      if (j.jumlah >= maks) {
        return { boleh: false, cobaLagiDetik: Math.max(1, Math.ceil((j.mulai + jendelaMs - kini) / 1000)) };
      }
      j.jumlah += 1;
      return { boleh: true };
    },
    get ukuran() {
      return peta.size;
    },
  };
}
