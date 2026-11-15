import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Halaman peserta bertoken: tidak disinggahkan, tidak diindeks, tidak membocorkan
  // URL bertoken lewat Referer. Proxy memasang header yang sama untuk respons 404-nya.
  async headers() {
    const header = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "X-Robots-Tag", value: "noindex" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    return [
      { source: "/me/:path*", headers: header },
      { source: "/bill/:path*", headers: header },
      // Peramban sudah membatasi sw.js ke 24 jam, tetapi no-cache membuat pembaruan langsung terlihat.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
