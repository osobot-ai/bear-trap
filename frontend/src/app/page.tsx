import { WalletButton } from "@/components/WalletButton";
import { PuzzleList } from "@/components/PuzzleList";
import { BuyTickets } from "@/components/BuyTickets";
import { SubmitGuess } from "@/components/SubmitGuess";
import { Leaderboard } from "@/components/Leaderboard";
import { ACTIVE_ENV } from "@/lib/contracts";

const NETWORK_LABEL = ACTIVE_ENV === "mainnet" ? "Base Mainnet" : "Base Sepolia";
const EXPLORER_URL = ACTIVE_ENV === "mainnet" ? "https://basescan.org" : "https://sepolia.basescan.org";
export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-trap-border/50 bg-trap-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-trap-green/10 border border-trap-green/20">
              <span className="font-display text-xl text-trap-green">B</span>
              <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-trap-green animate-pulse-slow" />
            </div>
            <div>
              <h1 className="font-display text-xl tracking-tight text-trap-text">
                Bear Trap
              </h1>
              <p className="text-xs font-mono text-trap-muted tracking-wider uppercase">
                ERC-7710 Puzzle Game
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 rounded-full bg-trap-dark border border-trap-border px-3 py-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-trap-green animate-pulse-slow" />
              <span className="text-xs font-mono text-trap-muted">
                {NETWORK_LABEL}
              </span>
            </div>
            <WalletButton />
          </div>
        </div>
      </header>

      {/* Hero section */}
      <section className="relative overflow-hidden border-b border-trap-border/30">
        <div className="absolute inset-0 bg-gradient-to-b from-trap-green/[0.02] to-transparent" />
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="font-mono text-xs tracking-[0.3em] uppercase text-trap-green mb-4 animate-fade-in">
              Cryptographic Puzzle Game
            </p>
            <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight text-white leading-[1.1] animate-fade-in stagger-1">
              Solve the puzzle.
              <br />
              <span className="text-gradient-green">Claim the bounty.</span>
            </h2>
            <p className="mt-6 text-lg text-trap-muted leading-relaxed max-w-lg animate-fade-in stagger-2">
              Burn $OSO tokens to buy guess tickets. Submit your answer and
              generate a ZK proof via Boundless. First correct solver wins the
              entire prize pool.
            </p>
            <div className="mt-8 flex flex-wrap gap-6 text-sm animate-fade-in stagger-3">
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-trap-green" />
                <span className="text-trap-muted">ZK-verified guesses</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-trap-green" />
                <span className="text-trap-muted">Onchain delegation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-trap-green" />
                <span className="text-trap-muted">Base L2</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-12 lg:grid-cols-3">
          {/* Left column: Puzzles */}
          <div className="lg:col-span-2 space-y-8">
            <PuzzleList />
          </div>

          {/* Right column: Actions */}
          <div className="space-y-8">
            <BuyTickets />
            <SubmitGuess />
          </div>
        </div>

        {/* Leaderboard */}
        <div className="mt-16">
          <Leaderboard />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-trap-border/30 mt-12">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-trap-muted font-mono">
              Bear Trap Protocol -- Built on Base
            </p>
            <div className="flex items-center gap-6">
              <a
                href={EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-trap-muted hover:text-trap-green transition-colors font-mono"
              >
                Basescan
              </a>
              <a
                href="https://docs.boundless.network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-trap-muted hover:text-trap-green transition-colors font-mono"
              >
                Boundless Docs
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
