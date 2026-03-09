import type { Metadata } from "next";
import { Providers } from "./providers";
import { SoundProvider } from "@/components/SoundController";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bear Trap -- ERC-7710 Puzzle Game",
  description:
    "Solve cryptographic puzzles with ZK proofs. Burn $OSO tokens to guess. Win the prize pool.",
  icons: {
    icon: "/favicon.ico",
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
