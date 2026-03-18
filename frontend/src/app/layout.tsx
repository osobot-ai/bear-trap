import type { Metadata } from "next";
import { Providers } from "./providers";
import { SoundProvider } from "@/components/SoundController";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bear Trap -- ERC-7710 Puzzle Game",
  description:
    "Solve cryptographic puzzles with ZK proofs. Burn $OSO tokens to guess. Win the prize pool.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  metadataBase: new URL("https://beartrap.osoknows.com"),
  openGraph: {
    title: "Bear Trap -- The Trap Is Set",
    description:
      "Solve cryptographic puzzles with ZK proofs. Burn $OSO tokens to guess. Win the prize pool.",
    url: "https://beartrap.osoknows.com",
    images: [
      {
        url: "/og-image.jpg",
        width: 1280,
        height: 853,
        alt: "Bear Trap - The Trap Is Set",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bear Trap -- The Trap Is Set",
    description:
      "Solve cryptographic puzzles with ZK proofs. Burn $OSO tokens to guess. Win the prize pool.",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-trap-black text-trap-text antialiased">
        <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-[0.03] pointer-events-none" />
        <div className="relative z-10">
          <Providers>
            <SoundProvider>{children}</SoundProvider>
          </Providers>
        </div>
      </body>
    </html>
  );
}
