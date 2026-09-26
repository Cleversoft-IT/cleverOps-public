import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { offerLabel } from "@/lib/skills";

// DM Sans variabile (asse wght, sottoinsieme latin) servita da file locale: il build non
// scarica nulla da Google Fonts. File e licenza OFL in src/fonts/ (vedi DMSans-OFL.txt).
const dmSans = localFont({
  src: "../fonts/dm-sans-latin-wght-normal.woff2",
  weight: "100 1000",
  style: "normal",
  display: "swap",
  variable: "--font-dm-sans",
});

const title = `cleverOps — ${offerLabel} per Claude Code e Codex`;

export const metadata: Metadata = {
  title,
  description:
    "Le skill, i tool e l'installer che il team Cleversoft usa ogni giorno con Claude Code e Codex. Comandi copia-incolla.",
  metadataBase: new URL("https://cleverops.cleversoft.it"),
  openGraph: {
    title,
    description:
      "Skill, toolbelt e installer per Claude Code e Codex, open source da Cleversoft IT.",
    locale: "it_IT",
    type: "website",
  },
};

// Tema senza flash: applica .dark prima del paint.
const themeScript = `
(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${dmSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
