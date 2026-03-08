"use client";

import { useState, useEffect, useRef } from "react";
import { useSoundEngine } from "./SoundController";
import { CountdownTimer } from "./CountdownTimer";
import { ClueDisplay } from "./ClueDisplay";
import { IntentVisualizer } from "./IntentVisualizer";
import { PrizeDisplay } from "./PrizeDisplay";
import { TrapperMessage } from "./TrapperMessage";
import { HallOfSolvers } from "./HallOfSolvers";
import { BuyTickets } from "./BuyTickets";
import { SubmitGuess } from "./SubmitGuess";
import { BACKEND_URL } from "@/lib/contracts";

interface ActivePuzzleResponse {
  status: "countdown" | "live" | "completed";
  puzzle: {
    id: number;
    clueURI: string;
    prizeEth: string;
    solved: boolean;
    winner: string;
    startsAt: string;
  } | null;
  message: string;
}

export function ActivePuzzle() {
  const { playVoice, playSfx } = useSoundEngine();
  const hasPlayedTeaserRef = useRef(false);
  const [data, setData] = useState<ActivePuzzleResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActivePuzzle = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/puzzle/active`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const puzzleData = await response.json();
        setData(puzzleData);
      } catch (err) {
        console.error('Failed to fetch active puzzle:', err);
        setError(err instanceof Error ? err.message : 'Failed to load puzzle');
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchActivePuzzle();

    // Refresh every 30 seconds
    const interval = setInterval(fetchActivePuzzle, 30000);
    return () => clearInterval(interval);
  }, []);

  // Play teaser voiceover on first countdown state render
  const activeStatus = data?.status;
  useEffect(() => {
    if (activeStatus === "countdown" && !hasPlayedTeaserRef.current) {
      hasPlayedTeaserRef.current = true;
      // Delay slightly so user hears it after page loads
      const timer = setTimeout(() => playVoice("trapper-teaser"), 1500);
      return () => clearTimeout(timer);
    }
  }, [activeStatus, playVoice]);

  // Start ambient drone on live puzzle
  useEffect(() => {
    if (activeStatus === "live") {
      playSfx("trap_ambient");
    }
  }, [activeStatus, playSfx]);

  if (isLoading) {
    return (
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24">
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <div className="h-12 bg-trap-border/20 rounded-lg animate-pulse mx-auto max-w-md" />
              <div className="h-6 bg-trap-border/20 rounded-lg animate-pulse mx-auto max-w-sm" />
            </div>
            <div className="h-64 bg-trap-border/20 rounded-xl animate-pulse mx-auto max-w-2xl" />
          </div>
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24">
          <div className="text-center space-y-8">
            <div className="text-trap-red text-6xl mb-4">⚠</div>
            <h2 className="font-display text-3xl text-trap-red">
              The Trap Has Malfunctioned
            </h2>
            <p className="font-mono text-sm text-trap-muted max-w-lg mx-auto">
              {error || "Could not connect to the Bear Trap backend"}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { status, puzzle, message } = data;

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-trap-green/[0.02] to-transparent" />
      
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24">
        {/* Countdown State */}
        {status === "countdown" && puzzle && (
          <div className="max-w-4xl mx-auto space-y-12">
            {/* Hero Content */}
            <div className="text-center space-y-8">
              <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight text-white leading-[1.1]">
                The Next Puzzle
                <br />
                <span className="text-gradient-green">Approaches...</span>
              </h2>
              
              <CountdownTimer startsAt={puzzle.startsAt} />
            </div>

            {/* Prize and Message */}
            <div className="grid gap-8 lg:grid-cols-2">
              <PrizeDisplay prizeEth={puzzle.prizeEth} />
              <TrapperMessage message={message} />
            </div>
          </div>
        )}

        {/* Live State */}
        {status === "live" && puzzle && (
          <div className="space-y-12">
            {/* Hero Header */}
            <div className="text-center space-y-4">
              <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight text-white leading-[1.1]">
                Puzzle #{puzzle.id}
                <br />
                <span className="text-gradient-green">The Trap Is Set</span>
              </h2>
              <p className="text-lg text-trap-muted max-w-2xl mx-auto">
                Study the clue. Generate your proof. Escape the trap.
              </p>
            </div>

            {/* Main Content Grid */}
            <div className="grid gap-8 lg:grid-cols-3">
              {/* Left Column: Clue and Intent */}
              <div className="lg:col-span-2 space-y-8">
                <ClueDisplay clueURI={puzzle.clueURI} />
                <IntentVisualizer 
                  proofStatus="locked" 
                  prizeStatus="locked" 
                />
              </div>

              {/* Right Column: Actions and Prize */}
              <div className="space-y-8">
                <PrizeDisplay prizeEth={puzzle.prizeEth} />
                <BuyTickets />
                <SubmitGuess />
              </div>
            </div>
          </div>
        )}

        {/* Completed State */}
        {status === "completed" && puzzle && (
          <div className="max-w-4xl mx-auto space-y-12">
            {/* Victory Header */}
            <div className="text-center space-y-8">
              <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.1]">
                <span className="text-trap-red animate-glow-red">THE TRAP HAS BEEN</span>
                <br />
                <span className="text-trap-gold animate-glow-gold">SPRUNG!</span>
              </h2>
              
              {/* Winner Info */}
              {puzzle.winner && (
                <div className="glass-panel noise-overlay rounded-xl p-8 max-w-2xl mx-auto">
                  <div className="text-center space-y-4">
                    <div className="text-trap-gold text-4xl mb-4">👑</div>
                    <h3 className="font-display text-2xl text-trap-gold">
                      Puzzle #{puzzle.id} Solved
                    </h3>
                    <div className="space-y-2">
                      <p className="font-mono text-sm text-trap-muted uppercase tracking-wider">
                        Winner
                      </p>
                      <p className="font-mono text-lg text-trap-text break-all">
                        {puzzle.winner}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="font-mono text-sm text-trap-muted uppercase tracking-wider">
                        Prize Claimed
                      </p>
                      <p className="font-display text-3xl text-trap-gold font-bold">
                        {puzzle.prizeEth} ETH
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Message and Hall of Solvers */}
            <div className="grid gap-8 lg:grid-cols-2">
              <TrapperMessage message={message} />
              <HallOfSolvers />
            </div>
          </div>
        )}

        {/* No puzzle state */}
        {!puzzle && (
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight text-white leading-[1.1]">
              No Active Puzzle
            </h2>
            <TrapperMessage message={message} />
          </div>
        )}
      </div>
    </section>
  );
}