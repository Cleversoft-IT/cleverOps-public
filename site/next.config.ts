import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Cartella del sito: radice del workspace per Turbopack. Esplicita perché alla radice del
// repo c'è il lockfile dell'installer e Next, trovando più lockfile, sceglierebbe quella.
const siteRoot = path.dirname(fileURLToPath(import.meta.url));

// Sito statico: `next build` esporta HTML/CSS/JS in out/, servito da Cloudflare Pages.
// I dati del catalogo vengono generati prima del build da scripts/generate-skills.mjs
// (legge ../cleverops.json e ../skills), quindi a runtime non serve alcun server.
const nextConfig: NextConfig = {
  output: "export",
  // /come-funziona → out/come-funziona/index.html: navigabile su qualunque hosting statico.
  trailingSlash: true,
  turbopack: {
    root: siteRoot,
  },
};

export default nextConfig;
