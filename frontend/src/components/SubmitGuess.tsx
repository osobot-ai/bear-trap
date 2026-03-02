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
import { delegationManagerAbi } from "@/lib/abi/delegationManager";
import { BEAR_TRAP_ADDRESS, DELEGATION_MANAGER_ADDRESS, BASE_CHAIN_ID, BACKEND_URL, ACTIVE_ENV } from "@/lib/contracts";

const EXPLORER_URL = ACTIVE_ENV === "mainnet" ? "https://basescan.org" : "https://sepolia.basescan.org";

type SubmitStep =
  | "idle"
  | "proving"
  | "proof-ready"
  | "confirming"
  | "success"
  | "wrong"
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
  const [proofData, setProofData] = useState<ProveResult | null>(null);

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

  // Write: redeemDelegations on DelegationManager
  const {
    data: redeemHash,
    writeContract: redeemDelegations,
    isPending: isRedeeming,
    error: redeemError,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: redeemHash });

  const count = puzzleCount ? Number(puzzleCount) : 0;
  const tickets = ticketBalance ? Number(ticketBalance) : 0;
  const hasTickets = tickets > 0;

  // Step 1: Generate proof via API (which also burns the ticket)
  const handleSolvePuzzle = useCallback(async () => {
    if (!passphrase.trim() || !address) return;

    setStep("proving");
    setErrorMessage("");
    setProofData(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/prove`, {
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
        // Check if this was a wrong guess (ticket already consumed)
        if (data.error?.includes("Wrong guess")) {
          setErrorMessage(data.error);
          setStep("wrong");
          return;
        }
        throw new Error(data.error || "Proof generation failed");
      }

      const result = data as ProveResult;
      setProofData(result);
      setStep("proof-ready");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to generate proof"
      );
      setStep("error");
    }
  }, [passphrase, address, puzzleId]);

  // Step 2: Submit redeemDelegations with the proof
  const handleRedeemPrize = useCallback(() => {
    if (!proofData || !address) return;

    const seal = proofData.seal as Hex;
    const journal = proofData.journal as Hex;

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

    redeemDelegations({
      address: DELEGATION_MANAGER_ADDRESS,
      abi: delegationManagerAbi,
      functionName: "redeemDelegations",
      args: [permissionContexts, [defaultMode], [executionCallData]],
      chainId: BASE_CHAIN_ID,
    });

    setStep("confirming");
  }, [proofData, address, redeemDelegations]);

  // Reset flow
  const handleReset = useCallback(() => {
    setStep("idle");
    setPassphrase("");
    setErrorMessage("");
    setProofData(null);
  }, []);

  // Determine display state
  const displayError =
    errorMessage || (redeemError ? redeemError.message : "");

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
                    Enter the secret passphrase. A ZK proof will verify your
                    answer. Each attempt costs one ticket.
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

        {/* Step 2: Burning ticket & generating proof */}
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
                Burning ticket &amp; generating proof...
              </p>
              <p className="text-xs text-trap-muted mt-1">
                Your ticket has been consumed. Generating zero-knowledge proof...
                This may take 1-3 minutes.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Proof generated — submit to claim prize */}
        {step === "proof-ready" && (
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
                Proof Generated!
              </p>
              <p className="text-xs text-trap-muted mt-1">
                Submit the transaction to claim your prize.
              </p>
            </div>
            <button
              onClick={handleRedeemPrize}
              className="w-full rounded-lg bg-trap-green/10 border border-trap-green/30 px-4 py-3 font-mono text-sm font-medium text-trap-green hover:bg-trap-green/20 hover:border-trap-green/50 transition-all"
            >
              Claim Prize
            </button>
          </div>
        )}

        {/* Step 4: Confirming transaction */}
        {step === "confirming" && (
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
                {isRedeeming
                  ? "Waiting for wallet confirmation..."
                  : isConfirming
                  ? "Confirming transaction..."
                  : "Submitting proof on-chain..."}
              </p>
              <p className="text-xs text-trap-muted mt-1">
                {isConfirming && redeemHash
                  ? `Tx: ${redeemHash.slice(0, 10)}...${redeemHash.slice(-8)}`
                  : "Please confirm in your wallet"}
              </p>
            </div>
          </div>
        )}

        {/* Step 5: Success */}
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
                Puzzle Solved! Prize Claimed!
              </p>
              <p className="text-xs text-trap-muted mt-1">
                Congratulations! The delegation has been redeemed and the ETH
                prize is yours.
              </p>
            </div>
            {redeemHash && (
              <a
                href={`${EXPLORER_URL}/tx/${redeemHash}`}
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
              Solve Another Puzzle
            </button>
          </div>
        )}

        {/* Step 6: Wrong guess */}
        {step === "wrong" && (
          <div className="space-y-4">
            <div className="py-8 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-trap-red/10 border border-trap-red/20">
                <svg
                  className="h-6 w-6 text-trap-red"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <div>
                <p className="font-display text-lg text-trap-red">
                  Wrong Guess
                </p>
                <p className="text-xs text-trap-muted mt-1">
                  {errorMessage || "Your ticket was consumed. Try again with a different passphrase."}
                </p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="w-full rounded-lg bg-trap-dark border border-trap-border px-4 py-3 font-mono text-sm text-trap-muted hover:text-trap-text hover:border-trap-border transition-all"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Step 7: Generic error */}
        {(step === "error" || displayError) &&
          step !== "success" &&
          step !== "wrong" &&
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
