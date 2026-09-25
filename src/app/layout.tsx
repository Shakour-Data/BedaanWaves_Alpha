import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { QueryProvider } from "@/components/bedaan/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BedaanWaves — NASDAQ ML Scoring Engine",
  description:
    "NASDAQ-exclusive, per-symbol ML-learned hierarchical scoring & ranking engine. 6 dimensions · 44 sub-dimensions · 135 aspects · 173 sub-aspects · 865+ indicators. TradingView-integrated UI.",
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
  keywords: [
    "BedaanWaves",
    "NASDAQ",
    "stock scoring",
    "machine learning",
    "quantitative finance",
    "per-symbol coefficients",
    "TradingView",
  ],
  authors: [{ name: "BedaanWaves" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
