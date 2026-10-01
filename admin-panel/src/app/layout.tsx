import type { Metadata } from "next";
import { Inter, Cinzel } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel" });

export const metadata: Metadata = {
  title: "Velutan Admin Panel",
  description: "Administrative interface for Velutan World Map",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={`${inter.variable} ${cinzel.variable} font-sans bg-[#050505] text-[#e0d8c3]`}>
        {children}
      </body>
    </html>
  );
}
