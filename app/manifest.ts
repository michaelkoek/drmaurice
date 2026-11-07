import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DrMauriceCards",
    short_name: "DrMaurice",
    description: "Flashcards uit je colleges, met de nadruk op de lesdoelen.",
    lang: "nl",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6f4",
    theme_color: "#1f5e8c",
    categories: ["education", "medical"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    // long-press on the app icon (Android, desktop)
    shortcuts: [
      { name: "Nieuwe toets", url: "/examen/nieuw", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Instellingen", url: "/instellingen", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
