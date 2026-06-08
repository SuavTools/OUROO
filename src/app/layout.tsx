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

// iOS only shows a launch splash if a startup image matches the device's exact
// resolution + orientation. These cover the common modern iPhones (portrait).
const startupImage = [
  { url: "/splash/splash-1290x2796.png", media: "(device-width:430px) and (device-height:932px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" },
  { url: "/splash/splash-1284x2778.png", media: "(device-width:428px) and (device-height:926px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" },
  { url: "/splash/splash-1179x2556.png", media: "(device-width:393px) and (device-height:852px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" },
  { url: "/splash/splash-1170x2532.png", media: "(device-width:390px) and (device-height:844px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" },
  { url: "/splash/splash-1242x2688.png", media: "(device-width:414px) and (device-height:896px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" },
  { url: "/splash/splash-1125x2436.png", media: "(device-width:375px) and (device-height:812px) and (-webkit-device-pixel-ratio:3) and (orientation:portrait)" },
  { url: "/splash/splash-828x1792.png",  media: "(device-width:414px) and (device-height:896px) and (-webkit-device-pixel-ratio:2) and (orientation:portrait)" },
  { url: "/splash/splash-750x1334.png",  media: "(device-width:375px) and (device-height:667px) and (-webkit-device-pixel-ratio:2) and (orientation:portrait)" },
];

export const metadata: Metadata = {
  title: "SUAV",
  description: "SUAV — official site. Latest music, live dates, and OUROO: the arcade.",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Makes "Add to Home Screen" launch fullscreen with no browser chrome (iOS).
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "OUROO", startupImage },
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
