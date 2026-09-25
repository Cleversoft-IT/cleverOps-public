import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "cleverOps — skill, agent e tool per Claude Code e Codex",
  description:
    "Le skill, i tool e l'installer che il team Cleversoft usa ogni giorno con Claude Code e Codex. Comandi copia-incolla.",
  metadataBase: new URL("https://cleverops.cleversoft.it"),
  openGraph: {
    title: "cleverOps — skill, agent e tool per Claude Code e Codex",
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
