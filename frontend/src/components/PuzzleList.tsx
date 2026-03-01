"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { bearTrapAbi } from "@/lib/abi/bearTrap";
import { BEAR_TRAP_ADDRESS, BASE_CHAIN_ID } from "@/lib/contracts";
import { PuzzleCard } from "./PuzzleCard";
import { type Address } from "viem";

export function PuzzleList() {
  const {
    data: puzzleCount,
    isLoading: isCountLoading,
    isError: isCountError,
  } = useReadContract({
    address: BEAR_TRAP_ADDRESS,
    abi: bearTrapAbi,
    functionName: "puzzleCount",
    chainId: BASE_CHAIN_ID,
  });

  const count = puzzleCount ? Number(puzzleCount) : 0;

  // puzzles are 0-indexed: 0, 1, 2, ...
  const puzzleContracts = Array.from({ length: count }, (_, i) => ({
    address: BEAR_TRAP_ADDRESS,
    abi: bearTrapAbi,
    functionName: "puzzles" as const,
    args: [BigInt(i)] as const,
    chainId: BASE_CHAIN_ID,
  }));

  const {
    data: puzzlesData,
    isLoading: isPuzzlesLoading,
  } = useReadContracts({
    contracts: puzzleContracts,
    query: {
      enabled: count > 0,
    },
  });

  const isLoading = isCountLoading || isPuzzlesLoading;

  return (
    <section>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl text-white">Active Puzzles</h2>
          <p className="mt-1 text-sm text-trap-muted">
            {count > 0
              ? `${count} puzzle${count !== 1 ? "s" : ""} deployed`
              : "Waiting for puzzles to be created"}
          </p>
        </div>
        {count > 0 && (
          <span className="font-mono text-xs text-trap-muted bg-trap-dark border border-trap-border rounded-full px-3 py-1.5">
            {count} total
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="glass-panel rounded-xl p-6 animate-pulse"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-trap-border/30" />
                <div className="space-y-2">
                  <div className="h-3 w-16 rounded bg-trap-border/30" />
                  <div className="h-3 w-20 rounded bg-trap-border/30" />
                </div>
              </div>
              <div className="h-20 rounded-lg bg-trap-border/20 mb-4" />
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-trap-border/20" />
                <div className="h-3 w-3/4 rounded bg-trap-border/20" />
              </div>
            </div>
          ))}
        </div>
      ) : isCountError ? (
        <div className="glass-panel rounded-xl p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-trap-red/10 border border-trap-red/20">
            <svg
              className="h-5 w-5 text-trap-red"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-sm text-trap-muted">
            Unable to read contract. Check that the Bear Trap contract is
            deployed and the address is configured.
          </p>
        </div>
      ) : count === 0 ? (
        <div className="glass-panel rounded-xl p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-trap-green/5 border border-trap-green/10">
            <svg
              className="h-7 w-7 text-trap-green/40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <p className="font-display text-lg text-trap-text mb-2">
            No puzzles yet
          </p>
          <p className="text-sm text-trap-muted max-w-sm mx-auto">
            When puzzles are created on the Bear Trap contract, they will appear
            here. Each puzzle has a prize pool and a cryptographic clue.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {puzzlesData?.map((result, index) => {
            if (result.status !== "success" || !result.result) return null;

            // puzzles() returns: (bytes32 solutionHash, uint256 prizeAmount, address winner, bool solved, string clueURI)
            const puzzle = result.result as unknown as [
              `0x${string}`, // solutionHash
              bigint,        // prizeAmount
              Address,       // winner
              boolean,       // solved
              string         // clueURI
            ];

            return (
              <PuzzleCard
                key={index}
                puzzleId={index}
                prize={puzzle[1]}
                clueURI={puzzle[4]}
                solved={puzzle[3]}
                winner={puzzle[2]}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
