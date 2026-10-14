import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { site } from "@/site.config";

const fraunces = localFont({
  src: [
    { path: "../fonts/Fraunces-Variable.ttf", style: "normal" },
    { path: "../fonts/Fraunces-Italic-Variable.ttf", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
});

const poppins = localFont({
  src: [
    { path: "../fonts/Poppins-Regular.ttf", weight: "400" },
    { path: "../fonts/Poppins-Bold.ttf", weight: "700" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description:
    "Lamps with your symbol, your name or your photo glowing through a white wall. 3D printed in Luxembourg, ready in a few days.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${poppins.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
