import { Plus_Jakarta_Sans } from 'next/font/google';

/**
 * Font gaya visual (docs/gaya-visual.md). Hanya mendefinisikan variabel CSS; layar baru
 * memakainya lewat kelas `font-jakarta` dari token di globals.css.
 */
export const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});
