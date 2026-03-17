import { WalletButton } from "@/components/WalletButton";
import { ActivePuzzle } from "@/components/ActivePuzzle";
import { SoundToggle } from "@/components/SoundController";
import { DemoControlPanel } from "@/components/DemoControlPanel";
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
            <SoundToggle />
            <WalletButton />
          </div>
        </div>
      </header>

      <main>
        <ActivePuzzle />
      </main>

      <DemoControlPanel />

      {/* Footer */}
      <footer className="border-t border-trap-border/30 mt-12">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-trap-muted font-mono">
              Bear Trap Protocol -- Built with MetaMask Smart Accounts Kit
            </p>
            <div className="flex items-center gap-6">
              <a
                href="https://docs.metamask.io/smart-accounts-kit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-trap-muted hover:text-trap-green transition-colors font-mono"
              >
                Smart Accounts Kit
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
