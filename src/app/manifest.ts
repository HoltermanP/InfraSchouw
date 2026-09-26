import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "InfraSchouw",
    short_name: "InfraSchouw",
    description: "Schouwen vastleggen in het veld — ook offline — met AI-ondersteund schouwverslag.",
    start_url: "/veld",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0a",
    theme_color: "#0f4c81",
    lang: "nl",
    categories: ["business", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nieuwe schouw", url: "/veld?nieuw=1" },
      { name: "Bril-modus", url: "/veld/bril" },
    ],
  };
}
