"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { bearTrapAbi } from "@/lib/abi/bearTrap";
import { BEAR_TRAP_ADDRESS, BASE_CHAIN_ID } from "@/lib/contracts";

export function SubmitGuess() {
  const { address, isConnected } = useAccount();
  const [puzzleId, setPuzzleId] = useState("1");
  const [passphrase, setPassphrase] = useState("");

  // Read puzzle count for the selector
  const { data: puzzleCount } = useReadContract({
    address: BEAR_TRAP_ADDRESS,
    abi: bearTrapAbi,
    functionName: "puzzleCount",
    chainId: BASE_CHAIN_ID,
  });

  // Read ticket balance
  const { data: ticketBalance } = useReadContract({
    address: BEAR_TRAP_ADDRESS,
    abi: bearTrapAbi,
    functionName: "tickets",
    args: address ? [address] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address },
  });

  const count = puzzleCount ? Number(puzzleCount) : 0;
  const tickets = ticketBalance ? Number(ticketBalance) : 0;
  const hasTickets = tickets > 0;

  return (
    <section className="glass-panel noise-overlay rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="border-b border-trap-border/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-trap-green/10 border border-trap-green/20">
            <svg
              className="h-4 w-4 text-trap-green"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg text-white">Submit Guess</h3>
            <p className="text-xs text-trap-muted">
              ZK-verified via Boundless
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Puzzle selector */}
        <div>
          <label className="block text-xs font-mono text-trap-muted mb-2 uppercase tracking-wider">
            Puzzle ID
          </label>
          <select
            value={puzzleId}
            onChange={(e) => setPuzzleId(e.target.value)}
            disabled={!isConnected || count === 0}
            className="w-full rounded-lg bg-trap-black/80 border border-trap-border px-4 py-3 font-mono text-sm text-trap-text focus:outline-none focus:border-trap-green/50 focus:ring-1 focus:ring-trap-green/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed appearance-none"
          >
            {count === 0 ? (
              <option value="">No puzzles available</option>
            ) : (
              Array.from({ length: count }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Puzzle #{i + 1}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Passphrase input */}
        <div>
          <label className="block text-xs font-mono text-trap-muted mb-2 uppercase tracking-wider">
            Your Guess (Passphrase)
          </label>
          <input
            type="text"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            disabled={!isConnected}
            className="w-full rounded-lg bg-trap-black/80 border border-trap-border px-4 py-3 font-mono text-sm text-trap-text placeholder-trap-muted/50 focus:outline-none focus:border-trap-green/50 focus:ring-1 focus:ring-trap-green/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            placeholder="Enter the secret passphrase..."
          />
        </div>

        {/* Info callout */}
        <div className="rounded-lg border border-trap-border/30 bg-trap-black/30 p-4">
          <div className="flex gap-3">
            <svg
              className="h-4 w-4 text-trap-muted shrink-0 mt-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div className="text-xs text-trap-muted leading-relaxed">
              <p>
                Your guess is hashed locally and sent to the Boundless proving
                network. A RISC Zero ZK proof is generated off-chain, then the
                verified result is submitted on-chain. This process may take a
                few minutes.
              </p>
            </div>
          </div>
        </div>

        {/* Submit button */}
        {!isConnected ? (
          <div className="rounded-lg border border-trap-border/30 bg-trap-black/30 p-4 text-center">
            <p className="text-xs text-trap-muted font-mono">
              Connect your wallet to submit a guess
            </p>
          </div>
        ) : (
          <button
            disabled={!hasTickets || !passphrase.trim() || count === 0}
            className="w-full rounded-lg bg-trap-green/10 border border-trap-green/30 px-4 py-3 font-mono text-sm font-medium text-trap-green hover:bg-trap-green/20 hover:border-trap-green/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-trap-green/10"
            onClick={() => {
              // In production, this would:
              // 1. Hash the passphrase locally
              // 2. Send to the Boundless proof generation backend
              // 3. Wait for the ZK proof to be generated
              // 4. Submit the proof on-chain via submitGuess()
              alert(
                "Proof generation requires the Boundless backend service. " +
                "In production, this connects to the ZK proof pipeline."
              );
            }}
          >
            {!hasTickets
              ? "No tickets -- buy tickets first"
              : count === 0
              ? "No puzzles available"
              : "Generate ZK Proof & Submit"}
          </button>
        )}

        {isConnected && (
          <p className="text-center text-xs font-mono text-trap-muted">
            You have{" "}
            <span className="text-trap-green font-medium">{tickets}</span>{" "}
            ticket{tickets !== 1 ? "s" : ""} remaining
          </p>
        )}
      </div>
    </section>
  );
}
