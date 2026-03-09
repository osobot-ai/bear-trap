"use client";

import { useState, useEffect } from "react";
import { BACKEND_URL } from "@/lib/contracts";

interface Puzzle {
  id: number;
  clueURI: string;
  prizeEth: string;
  solved: boolean;
  winner: string;
  startsAt: string;
}

export function HallOfSolvers() {
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPuzzles = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/puzzles`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        setPuzzles(data);
      } catch (err) {
        console.error('Failed to fetch puzzles:', err);
        setError(err instanceof Error ? err.message : 'Failed to load puzzles');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPuzzles();
  }, []);

  const solvedPuzzles = puzzles.filter(puzzle => puzzle.solved);

  const truncateAddress = (address: string): string => {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatPrize = (prizeEth: string): string => {
    const num = parseFloat(prizeEth);
    if (num === 0) return "0";
    if (num < 0.001) return num.toFixed(6);
    if (num < 1) return num.toFixed(4);
    return num.toFixed(3);
  };

  return (
    <div className="glass-panel noise-overlay rounded-xl overflow-hidden">
      {/* Header */}
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
              <path d="M6 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2"/>
              <path d="M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4"/>
              <path d="M16 18v-2a4 4 0 0 0-8 0v2"/>
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg text-white">Hall of Solvers</h3>
            <p className="text-xs text-trap-muted">
              Those who escaped the trap
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-12 bg-trap-border/20 rounded-lg" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <div className="text-trap-red text-2xl mb-2">⚠</div>
            <p className="font-mono text-sm text-trap-red">Failed to load hall of solvers</p>
            <p className="font-mono text-xs text-trap-muted mt-2">{error}</p>
          </div>
        ) : solvedPuzzles.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-trap-muted text-3xl mb-4">👻</div>
            <p className="font-mono text-sm text-trap-muted">No solvers yet...</p>
            <p className="font-mono text-xs text-trap-muted/70 mt-2">
              Be the first to escape the trap
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {solvedPuzzles.map((puzzle, index) => (
              <div
                key={puzzle.id}
                className="flex items-center gap-4 p-4 rounded-lg bg-trap-black/30 border border-trap-green/20 hover:border-trap-green/40 transition-all"
              >
                {/* Rank */}
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-trap-green/10 border border-trap-green/30">
                  <span className="font-display text-sm font-bold text-trap-green">
                    {index + 1}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-trap-muted uppercase tracking-wider">
                      Puzzle #{puzzle.id}
                    </span>
                    <div className="h-1 w-1 rounded-full bg-trap-green/60" />
                    <span className="font-mono text-xs text-trap-green">
                      SOLVED
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-trap-text">
                      {truncateAddress(puzzle.winner)}
                    </span>
                    <div className="h-4 w-px bg-trap-border/50" />
                    <span className="font-mono text-sm text-trap-gold font-medium">
                      {formatPrize(puzzle.prizeEth)} ETH
                    </span>
                  </div>
                </div>

                {/* Trophy */}
                <div className="text-trap-gold">
                  <svg
                    className="w-6 h-6"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                    <path d="M4 22h16"/>
                    <path d="M10 14.66V17c0 .55.47.98.97 1.21C12.15 18.75 14 20 16 20s3.85-1.25 5.03-1.79c.5-.23.97-.66.97-1.21v-2.34"/>
                    <path d="M14 14.66V17c0 .55-.47.98-.97 1.21C11.85 18.75 10 20 8 20s-3.85-1.25-5.03-1.79C2.47 17.98 2 17.55 2 17v-2.34"/>
                    <circle cx="12" cy="9" r="5"/>
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}