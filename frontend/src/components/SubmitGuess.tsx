"use client";

import { useState, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { encodeAbiParameters, type Hex } from "viem";
import { bearTrapAbi } from "@/lib/abi/bearTrap";
import { BEAR_TRAP_ADDRESS, BASE_CHAIN_ID } from "@/lib/contracts";

type SubmitStep =
  | "idle"
  | "proving"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

interface ProveResult {
  seal: string;
  journal: string;
  solverAddress: string;
  solutionHash: string;
}

export function SubmitGuess() {
  const { address, isConnected } = useAccount();
  const [puzzleId, setPuzzleId] = useState("0");
  const [passphrase, setPassphrase] = useState("");
  const [step, setStep] = useState<SubmitStep>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

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

  // Write: submitGuess
  const {
    data: submitHash,
    writeContract: submitGuess,
    isPending: isSubmitting,
    error: submitError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: submitHash });

  const count = puzzleCount ? Number(puzzleCount) : 0;
  const tickets = ticketBalance ? Number(ticketBalance) : 0;
  const hasTickets = tickets > 0;

  // Main flow: generate proof via API then submit on-chain
  const handleSolvePuzzle = useCallback(async () => {
    if (!passphrase.trim() || !address) return;

    setStep("proving");
    setErrorMessage("");

    try {
      // Step 1: Call the /api/prove endpoint to generate a ZK proof
      const response = await fetch("/api/prove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passphrase: passphrase.trim(),
          solverAddress: address,
          puzzleId: parseInt(puzzleId),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Proof generation failed");
      }

      const proofResult = data as ProveResult;

      // Step 2: Auto-construct the delegation redemption transaction
      setStep("submitting");

      const seal = proofResult.seal as Hex;
      const journal = proofResult.journal as Hex;

      // Construct ZKPEnforcer caveat args: abi.encode(bytes seal, bytes journal)
      const caveatArgs = encodeAbiParameters(
        [{ type: "bytes" }, { type: "bytes" }],
        [seal, journal]
      );

      // Build permissionContexts with the caveat args
      const permissionContexts: Hex[] = [caveatArgs];

      // ModeCode for single default execution (bytes32 of zeros)
      const defaultMode =
        "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

      // Execution calldata: ETH transfer to solver
      const executionCallData = encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
        [address, BigInt(0), "0x" as Hex]
      );

      submitGuess({
        address: BEAR_TRAP_ADDRESS,
        abi: bearTrapAbi,
        functionName: "submitGuess",
        args: [
          BigInt(puzzleId),
          permissionContexts,
          [defaultMode],
          [executionCallData],
        ],
        chainId: BASE_CHAIN_ID,
      });

      setStep("confirming");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to generate proof"
      );
      setStep("error");
    }
  }, [passphrase, address, puzzleId, submitGuess]);

  // Reset flow
  const handleReset = useCallback(() => {
    setStep("idle");
    setPassphrase("");
    setErrorMessage("");
  }, []);

  // Determine display state
  const displayError =
    errorMessage || (submitError ? submitError.message : "");

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
            <h3 className="font-display text-lg text-white">Solve Puzzle</h3>
            <p className="text-xs text-trap-muted">
              ZK-verified via Boundless
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Step 1: Puzzle selector + passphrase (idle) */}
        {step === "idle" && (
          <>
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
                    <option key={i} value={i}>
                      Puzzle #{i}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Passphrase input */}
            <div>
              <label className="block text-xs font-mono text-trap-muted mb-2 uppercase tracking-wider">
                Secret Passphrase
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
                    Enter the secret passphrase. A zero-knowledge proof will be
                    generated to verify your answer without revealing it
                    on-chain.
                  </p>
                </div>
              </div>
            </div>

            {/* Solve button */}
            {!isConnected ? (
              <div className="rounded-lg border border-trap-border/30 bg-trap-black/30 p-4 text-center">
                <p className="text-xs text-trap-muted font-mono">
                  Connect your wallet to submit a guess
                </p>
              </div>
            ) : (
              <button
                disabled={
                  !hasTickets || !passphrase.trim() || count === 0
                }
                className="w-full rounded-lg bg-trap-green/10 border border-trap-green/30 px-4 py-3 font-mono text-sm font-medium text-trap-green hover:bg-trap-green/20 hover:border-trap-green/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-trap-green/10"
                onClick={handleSolvePuzzle}
              >
                {!hasTickets
                  ? "No tickets -- buy tickets first"
                  : count === 0
                  ? "No puzzles available"
                  : "Solve Puzzle"}
              </button>
            )}
          </>
        )}

        {/* Step 2: Generating proof */}
        {step === "proving" && (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-trap-green/10 border border-trap-green/20 animate-pulse-slow">
              <svg
                className="h-5 w-5 text-trap-green animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
            <div>
              <p className="font-mono text-sm text-trap-text">
                Generating ZK proof...
              </p>
              <p className="text-xs text-trap-muted mt-1">
                This may take 1-3 minutes. The Boundless network is generating
                a zero-knowledge proof of your answer.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Submitting / Confirming */}
        {(step === "submitting" || step === "confirming") && (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-trap-green/10 border border-trap-green/20 animate-pulse-slow">
              <svg
                className="h-5 w-5 text-trap-green animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
            <div>
              <p className="font-mono text-sm text-trap-text">
                {isSubmitting
                  ? "Waiting for wallet confirmation..."
                  : isConfirming
                  ? "Confirming transaction..."
                  : "Submitting proof on-chain..."}
              </p>
              <p className="text-xs text-trap-muted mt-1">
                {isConfirming && submitHash
                  ? `Tx: ${submitHash.slice(0, 10)}...${submitHash.slice(-8)}`
                  : "Please confirm in your wallet"}
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {(isConfirmed || step === "success") && (
          <div className="py-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-trap-green/10 border border-trap-green/20">
              <svg
                className="h-6 w-6 text-trap-green"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="font-display text-lg text-trap-green">
                Guess Submitted!
              </p>
              <p className="text-xs text-trap-muted mt-1">
                Check the leaderboard below for the result. If your proof was
                valid, the puzzle is solved and the prize is yours!
              </p>
            </div>
            {submitHash && (
              <a
                href={`https://basescan.org/tx/${submitHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs font-mono text-trap-green hover:text-trap-green-dim transition-colors underline decoration-trap-green/30 underline-offset-2"
              >
                View on Basescan
              </a>
            )}
            <button
              onClick={handleReset}
              className="w-full rounded-lg bg-trap-dark border border-trap-border px-4 py-3 font-mono text-sm text-trap-muted hover:text-trap-text hover:border-trap-border transition-all"
            >
              Submit Another Guess
            </button>
          </div>
        )}

        {/* Error state */}
        {(step === "error" || displayError) &&
          step !== "success" &&
          !isConfirmed && (
            <div className="space-y-4">
              <div className="rounded-lg border border-trap-red/20 bg-trap-red/5 p-4">
                <p className="text-xs font-mono text-trap-red mb-1 uppercase tracking-wider">
                  Error
                </p>
                <p className="text-xs text-trap-muted break-all">
                  {displayError || "An unknown error occurred"}
                </p>
              </div>
              <button
                onClick={handleReset}
                className="w-full rounded-lg bg-trap-dark border border-trap-border px-4 py-3 font-mono text-sm text-trap-muted hover:text-trap-text hover:border-trap-border transition-all"
              >
                Try Again
              </button>
            </div>
          )}

        {/* Ticket count */}
        {isConnected && step === "idle" && (
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
