import type { Metadata, Viewport } from "next";
import { Cinzel, EB_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, KEYWORDS, SITE_NAME, SITE_URL } from "../lib/seo";

const inter = Inter({ subsets: ["latin", "latin-ext"] });
// Başlık/düğme: gravür havası. Metin: eski kitap hissi, uzun lore için okunaklı.
// next/font build sırasında sunucuya gömer (çalışma anında Google'a istek yok).
const cinzel = Cinzel({ subsets: ["latin", "latin-ext"], weight: ["400", "700"], variable: "--font-display" });
const garamond = EB_Garamond({ subsets: ["latin", "latin-ext"], variable: "--font-book" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  keywords: KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: "w0fly" }],
  creator: "w0fly",
  category: "games",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Velutan 3D Dünya Haritası" }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ["/og.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  // Tarayıcı eklentilerine karşı: Dark Reader siteye dokunmasın, Google Çeviri DOM'u değiştirmesin
  other: { "darkreader-lock": "", google: "notranslate" },
  ...(process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION
    ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  themeColor: "#0d1218",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" translate="no" className="notranslate">
      <body className={`${inter.className} ${cinzel.variable} ${garamond.variable}`}>
        {children}
        <div id="ui-portal" />
      </body>
    </html>
  );
}
