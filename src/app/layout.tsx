import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strow Ops",
  description: "Café operations and billing — Strow",
  applicationName: "Strow Ops",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Prevent zoom on barista PIN keypad inputs
  maximumScale: 1,
  userScalable: false,
  themeColor: "#fafaf7",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
