"use client";

import { useAccount } from "wagmi";

/**
 * Leaderboard displays recent guess events from the BearTrap contract.
 *
 * In production, this would use useContractEvents or an indexer (e.g., The Graph)
 * to fetch GuessSubmitted and PuzzleSolved events. For now, it shows the
 * structure with an empty state since there are no events to read until the
 * contract is deployed and active.
 */

interface LeaderboardEntry {
  address: string;
  puzzleId: number;
  correct: boolean;
  timestamp: string;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Leaderboard() {
  const { address } = useAccount();

  // In production, this would be populated from on-chain events:
  // const { data: events } = useContractEvents({
  //   address: BEAR_TRAP_ADDRESS,
  //   abi: bearTrapAbi,
  //   eventName: 'GuessSubmitted',
  // });
  const entries: LeaderboardEntry[] = [];

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl text-white">
            Recent Activity
          </h2>
          <p className="mt-1 text-sm text-trap-muted">
            Guess attempts and puzzle solutions
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-trap-dark border border-trap-border px-3 py-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-trap-green animate-pulse-slow" />
          <span className="text-xs font-mono text-trap-muted">Live</span>
        </div>
      </div>

      <div className="glass-panel noise-overlay rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-4 gap-4 border-b border-trap-border/50 px-6 py-3">
          <span className="text-[10px] font-mono text-trap-muted uppercase tracking-wider">
            Player
          </span>
          <span className="text-[10px] font-mono text-trap-muted uppercase tracking-wider">
            Puzzle
          </span>
          <span className="text-[10px] font-mono text-trap-muted uppercase tracking-wider">
            Result
          </span>
          <span className="text-[10px] font-mono text-trap-muted uppercase tracking-wider text-right">
            Time
          </span>
        </div>

        {/* Table body */}
        {entries.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-trap-border/10 border border-trap-border/20">
              <svg
                className="h-5 w-5 text-trap-muted/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <p className="text-sm text-trap-muted font-mono">
              No activity yet
            </p>
            <p className="text-xs text-trap-muted/60 mt-1">
              Guess events will appear here when players submit proofs
            </p>
          </div>
        ) : (
          <div className="divide-y divide-trap-border/20">
            {entries.map((entry, index) => {
              const isCurrentUser =
                address &&
                entry.address.toLowerCase() === address.toLowerCase();

              return (
                <div
                  key={index}
                  className={`
                    grid grid-cols-4 gap-4 px-6 py-4 transition-colors
                    ${isCurrentUser ? "bg-trap-green/[0.03]" : "hover:bg-trap-dark/50"}
                  `}
                >
                  <div className="flex items-center gap-2">
                    {isCurrentUser && (
                      <div className="h-1.5 w-1.5 rounded-full bg-trap-green" />
                    )}
                    <span className="font-mono text-xs text-trap-text">
                      {truncateAddress(entry.address)}
                    </span>
                  </div>

                  <span className="font-mono text-xs text-trap-text">
                    #{entry.puzzleId}
                  </span>

                  <span
                    className={`font-mono text-xs font-medium ${
                      entry.correct ? "text-trap-green" : "text-trap-red"
                    }`}
                  >
                    {entry.correct ? "Solved" : "Wrong"}
                  </span>

                  <span className="font-mono text-xs text-trap-muted text-right">
                    {entry.timestamp}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
