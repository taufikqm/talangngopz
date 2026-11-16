import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { jakarta } from "./fonts";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Talangan",
  description: "Pencatat talangan sirkel",
  // iOS tidak membaca ikon dari manifest; apple-touch-icon dan appleWebApp membuat
  // "Tambah ke Layar Utama" membuka layar penuh dengan ikon yang benar.
  icons: { apple: "/ikon/180" },
  appleWebApp: { capable: true, title: "Talangan", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0B5C4D",
  // Agar env(safe-area-inset-bottom) terisi di iOS: menu bawah tidak tertutup garis home.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistMono.variable} ${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
