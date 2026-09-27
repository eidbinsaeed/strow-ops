import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { OfflineQueueRunner } from "@/components/OfflineQueueRunner";

export const metadata: Metadata = {
  title: "Strow Ops",
  description: "Cafe operations and billing - Strow",
  applicationName: "Strow Ops",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Strow Ops",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#E8EAED",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <ServiceWorkerRegistrar />
        <OfflineQueueRunner />
        {children}
      </body>
    </html>
  );
}
