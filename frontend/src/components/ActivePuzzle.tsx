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
import { ActivePuzzleSkeleton } from "./Skeleton";
import { TrapperError } from "./TrapperError";
import { useDemo } from "@/lib/demo-context";

/**
 * Matches the backend `ActivePuzzleResponse` struct (flat shape).
 * The backend serializes with `#[serde(rename_all = "camelCase")]`.
 */
interface ActivePuzzleData {
  id: number;
  clueURI: string;
  prizeEth: string | null;
  solved: boolean;
  winner: string | null;
  startsAt: string | null;
  status: "countdown" | "live" | "completed";
  delegation: Record<string, unknown> | null;
}

function getTrapperMessage(status: string): string {
  switch (status) {
    case "countdown":
      return "Something is coming. The trap is being set...";
    case "completed":
      return "The Trapper will return...";
    case "live":
    default:
      return "The ETH is trapped. Can you free it?";
  }
}

export function ActivePuzzle() {
  const { playVoice, playSfx, playMusic } = useSoundEngine();
  const { isDemo, demoState, demoConfig } = useDemo();
  const hasPlayedTeaserRef = useRef(false);
  const [data, setData] = useState<ActivePuzzleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo) return;

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

    fetchActivePuzzle();

    const interval = setInterval(fetchActivePuzzle, 30000);
    return () => clearInterval(interval);
  }, [isDemo]);

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

  // Start ambient drone + background music on live puzzle
  useEffect(() => {
    if (activeStatus === "live") {
      playSfx("trap_ambient");
      playMusic("ambient");
    }
  }, [activeStatus, playSfx, playMusic]);

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    fetch(`${BACKEND_URL}/api/puzzle/active`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((puzzleData) => setData(puzzleData))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load puzzle");
      })
      .finally(() => setIsLoading(false));
  };

  if (isDemo && demoState === "loading") {
    return (
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16 lg:py-24">
          <ActivePuzzleSkeleton />
        </div>
      </section>
    );
  }

  if (isDemo && demoState === "error") {
    return (
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-16 lg:py-24">
          <TrapperError
            type="network"
            message="Could not connect to the Bear Trap backend"
            onRetry={() => {}}
          />
        </div>
      </section>
    );
  }

  const activeData = isDemo ? (demoConfig.puzzleData as ActivePuzzleData) : data;

  if (!isDemo && isLoading) {
    return (
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16 lg:py-24">
          <ActivePuzzleSkeleton />
        </div>
      </section>
    );
  }

  if (!isDemo && (error || !activeData)) {
    return (
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-16 lg:py-24">
          <TrapperError
            type="network"
            message={error || "Could not connect to the Bear Trap backend"}
            onRetry={handleRetry}
          />
        </div>
      </section>
    );
  }

  if (!activeData) return null;

  const { status } = activeData;
  const message = getTrapperMessage(status);

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-trap-green/[0.02] to-transparent" />
      
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16 lg:py-24">
        {/* Countdown State */}
        {status === "countdown" && (
          <div className="max-w-4xl mx-auto space-y-12">
            <div className="text-center space-y-8">
              <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight text-white leading-[1.1]">
                The Next Puzzle
                <br />
                <span className="text-gradient-green">Approaches...</span>
              </h2>
              
              {activeData.startsAt && <CountdownTimer startsAt={activeData.startsAt} />}
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              <PrizeDisplay prizeEth={activeData.prizeEth} />
              <TrapperMessage message={message} />
            </div>
          </div>
        )}

        {/* Live State */}
        {status === "live" && (
          <div className="space-y-12">
            <div className="text-center space-y-4">
              <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight text-white leading-[1.1]">
                Puzzle #{activeData.id}
                <br />
                <span className="text-gradient-green">The Trap Is Set</span>
              </h2>
              <p className="text-lg text-trap-muted max-w-2xl mx-auto">
                Study the clue. Generate your proof. Escape the trap.
              </p>
            </div>

            <div className="grid gap-6 sm:gap-8 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6 sm:space-y-8">
                <ClueDisplay clueURI={activeData.clueURI} />
                <IntentVisualizer 
                  proofStatus={isDemo ? demoConfig.intentProps.proofStatus : "locked"} 
                  prizeStatus={isDemo ? demoConfig.intentProps.prizeStatus : "locked"} 
                />
              </div>

              <div className="space-y-6 sm:space-y-8">
                <PrizeDisplay prizeEth={activeData.prizeEth} />
                <BuyTickets />
                <SubmitGuess />
              </div>
            </div>
          </div>
        )}

        {/* Completed State */}
        {status === "completed" && (
          <div className="max-w-4xl mx-auto space-y-12">
            <div className="text-center space-y-8">
              <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.1]">
                <span className="text-trap-red glow-red">THE TRAP HAS BEEN</span>
                <br />
                <span className="text-trap-gold glow-gold">SPRUNG!</span>
              </h2>
              
              {activeData.winner && (
                <div className="glass-panel noise-overlay rounded-xl p-8 max-w-2xl mx-auto">
                  <div className="text-center space-y-4">
                    <div className="text-trap-gold text-4xl mb-4">👑</div>
                    <h3 className="font-display text-2xl text-trap-gold">
                      Puzzle #{activeData.id} Solved
                    </h3>
                    <div className="space-y-2">
                      <p className="font-mono text-sm text-trap-muted uppercase tracking-wider">
                        Winner
                      </p>
                      <p className="font-mono text-lg text-trap-text break-all">
                        {activeData.winner}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="font-mono text-sm text-trap-muted uppercase tracking-wider">
                        Prize Claimed
                      </p>
                      <p className="font-display text-3xl text-trap-gold font-bold">
                        {activeData.prizeEth ?? "0"} ETH
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              <TrapperMessage message={message} />
              <HallOfSolvers />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}