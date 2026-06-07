import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OUROO // ARCADE CORE",
  description: "Endless entropy simulation. Harvest crystals, eradicate alien vectors, survive.",
  // Makes "Add to Home Screen" launch fullscreen with no browser chrome (iOS).
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "OUROO" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,   // games shouldn't pinch-zoom by accident
  viewportFit: "cover",  // draw under notches / rounded corners
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
