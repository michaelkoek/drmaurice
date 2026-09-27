import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DrMauriceCards",
    short_name: "DrMaurice",
    description: "Flashcards uit je colleges, met de nadruk op de lesdoelen.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f4",
    theme_color: "#1f5e8c",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
