import type { Metadata, Viewport } from "next";
import { Golos_Text, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const ui = Golos_Text({
  variable: "--font-ui",
  subsets: ["cyrillic", "latin"],
  display: "swap",
});

const read = Source_Serif_4({
  variable: "--font-read",
  subsets: ["cyrillic", "latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Подчертано", template: "%s · Подчертано" },
  description: "Подчертаваш непознатите думи. Те стават твоят речник и ги научаваш с редовно повторение.",
  applicationName: "Подчертано",
  appleWebApp: { capable: true, title: "Подчертано", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg" className={`${ui.variable} ${read.variable}`}>
      <body>{children}</body>
    </html>
  );
}
