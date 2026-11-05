import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      // тежките OCR файлове не се променят: браузърът ги пази и ги ползва и без връзка
      { source: "/ocr/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
    ];
  },
  // снимката + разпознатият текст при запазване на страница
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  /* config options here */
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
