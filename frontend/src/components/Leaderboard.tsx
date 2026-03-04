"use client";

import { useState, useEffect } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { bearTrapAbi } from "@/lib/abi/bearTrap";
import { BEAR_TRAP_ADDRESS, BASE_CHAIN_ID, ACTIVE_ENV } from "@/lib/contracts";

const EXPLORER_URL = ACTIVE_ENV === "mainnet" ? "https://basescan.org" : "https://sepolia.basescan.org";

interface LeaderboardEntry {
  address: string;
  puzzleId: number;
  correct: boolean;
  blockNumber: bigint;
  transactionHash: string;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Leaderboard() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch historical PuzzleSolved and TicketUsed events
  useEffect(() => {
    if (!publicClient) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchEvents() {
      try {
        // Fetch both event types in parallel
        const [solvedLogs, ticketUsedLogs] = await Promise.all([
          publicClient!.getLogs({
            address: BEAR_TRAP_ADDRESS,
            event: {
              type: "event",
              name: "PuzzleSolved",
              inputs: [
                {
                  name: "puzzleId",
                  type: "uint256",
                  indexed: true,
                },
                {
                  name: "winner",
                  type: "address",
                  indexed: true,
                },
              ],
            },
            fromBlock: "earliest",
            toBlock: "latest",
          }),
          publicClient!.getLogs({
            address: BEAR_TRAP_ADDRESS,
            event: {
              type: "event",
              name: "TicketUsed",
              inputs: [
                {
                  name: "puzzleId",
                  type: "uint256",
                  indexed: true,
                },
                {
                  name: "user",
                  type: "address",
                  indexed: true,
                },
                {
                  name: "remainingTickets",
                  type: "uint256",
                  indexed: false,
                },
              ],
            },
            fromBlock: "earliest",
            toBlock: "latest",
          }),
        ]);

        if (cancelled) return;

        const solvedEntries: LeaderboardEntry[] = solvedLogs.map((log) => ({
          address: (log.args.winner as string) ?? "0x",
          puzzleId: Number(log.args.puzzleId ?? 0),
          correct: true,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
        }));

        const ticketUsedEntries: LeaderboardEntry[] = ticketUsedLogs.map((log) => ({
          address: (log.args.user as string) ?? "0x",
          puzzleId: Number(log.args.puzzleId ?? 0),
          correct: false,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
        }));

        // Combine and sort by block number descending (newest first)
        // TicketUsed entries that also have a matching PuzzleSolved are guess attempts;
        // we mark TicketUsed as "Attempt" and PuzzleSolved as "Solved"
        const all = [...solvedEntries, ...ticketUsedEntries].sort(
          (a, b) => Number(b.blockNumber - a.blockNumber)
        );

        setEntries(all);
      } catch {
        // Contract might not be deployed yet — silently handle
        setEntries([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchEvents();

    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl text-white">
            Recent Activity
          </h2>
          <p className="mt-1 text-sm text-trap-muted">
            Ticket usage and puzzle solutions
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
            Tx
          </span>
        </div>

        {/* Table body */}
        {isLoading ? (
          <div className="px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-trap-border/10 border border-trap-border/20 animate-pulse">
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
              Loading events...
            </p>
          </div>
        ) : entries.length === 0 ? (
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
                  key={`${entry.transactionHash}-${index}`}
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
                    {entry.correct ? "Solved" : "Attempt"}
                  </span>

                  <div className="text-right">
                    <a
                      href={`${EXPLORER_URL}/tx/${entry.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-trap-muted hover:text-trap-green transition-colors"
                    >
                      {entry.transactionHash.slice(0, 8)}...
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
