import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "DrMauriceCards",
  description: "Flashcards uit je colleges, met de nadruk op de lesdoelen.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "DrMauriceCards", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#111419" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="min-h-dvh font-sans text-[15px] leading-relaxed antialiased">{children}</body>
    </html>
  );
}
