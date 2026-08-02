import type { Metadata } from "next";
import { Manrope, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant-garamond",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "Signipedia",
    template: "%s | Signipedia",
  },
  description: "Enciclopedia interactiva de símbolos y signos del mundo.",
  applicationName: "Signipedia",
  keywords: ["símbolos", "signos", "enciclopedia", "iconografía", "heráldica", "runas"],
  openGraph: {
    title: "Signipedia",
    description: "Enciclopedia interactiva de símbolos y signos del mundo.",
    type: "website",
    locale: "es_ES",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${manrope.variable} ${cormorantGaramond.variable}`}>{children}</body>
    </html>
  );
}