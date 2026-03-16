"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { BearTrapSVG } from "./BearTrapSVG";
import { useSoundEngine } from "@/components/SoundController";
import {
  useAccount,
  useReadContract,
  useSignMessage,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { encodeAbiParameters, parseEther, pad, type Hex } from "viem";
import {
  createExecution,
  ExecutionMode,
  contracts,
} from "@metamask/smart-accounts-kit";
import type { Delegation as SdkDelegation } from "@metamask/smart-accounts-kit";
import { bearTrapAbi } from "@/lib/abi/bearTrap";
import { BEAR_TRAP_ADDRESS, DELEGATION_MANAGER_ADDRESS, BASE_CHAIN_ID, BACKEND_URL, ACTIVE_ENV, ZKP_ENFORCER_ADDRESS } from "@/lib/contracts";
import { TrapperError } from "./TrapperError";
import { useDemo } from "@/lib/demo-context";
import { usePuzzleFlow } from "@/lib/puzzle-flow-context";

const EXPLORER_URL = ACTIVE_ENV === "mainnet" ? "https://basescan.org" : "https://sepolia.basescan.org";

type SubmitStep =
  | "idle"
  | "proving"
  | "proof-ready"
  | "confirming"
  | "success"
  | "wrong"
  | "error";

interface DelegationCaveat {
  enforcer: string;
  terms: string;
  args: string;
}

interface DelegationData {
  delegate: string;
  delegator: string;
  authority: string;
  caveats: DelegationCaveat[];
  salt: string;
  signature: string;
}

interface ProveResult {
  seal: string;
  journal: string;
  solverAddress: string;
  solutionHash: string;
  delegation: DelegationData | null;
  prizeEth: string | null;
}

interface ProveSubmittedResult {
  proofRequestId: number;
  status: string;
  message: string;
}

interface ProofStatusResult {
  status: string;
  message?: string;
  error?: string;
  seal?: string;
  journal?: string;
  solverAddress?: string;
  solutionHash?: string;
  delegation?: DelegationData | null;
  prizeEth?: string | null;
  puzzleId?: number;
}

function AnimatedCounter({ value }: { value: string }) {
  const [display, setDisplay] = useState(0);
  const target = parseFloat(value);
  useEffect(() => {
    const duration = 1500;
    const start = Date.now();
    let rafId: number;
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(target * eased);
      if (progress < 1) rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [target]);
  return <span>{display.toFixed(4)}</span>;
}

// ── Proof persistence helpers ───────────────────────────
// Keyed by puzzleId so stale proofs from old puzzles don't resurface.
const PROOF_STORAGE_KEY = "bear-trap-proof";

function saveProof(puzzleId: string, proof: ProveResult): void {
  try {
    localStorage.setItem(PROOF_STORAGE_KEY, JSON.stringify({ puzzleId, proof }));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}

function loadProof(puzzleId: string): ProveResult | null {
  try {
    const raw = localStorage.getItem(PROOF_STORAGE_KEY);
    if (!raw) return null;
    const { puzzleId: storedId, proof } = JSON.parse(raw);
    // Only restore if it's for the current puzzle
    if (String(storedId) !== String(puzzleId)) {
      localStorage.removeItem(PROOF_STORAGE_KEY);
      return null;
    }
    return proof as ProveResult;
  } catch {
    return null;
  }
}

function clearSavedProof(): void {
  try {
    localStorage.removeItem(PROOF_STORAGE_KEY);
  } catch {
    // non-fatal
  }
}

const stepTransition = { duration: 0.3 };
const stepInitial = { opacity: 0, y: 20 };
const stepAnimate = { opacity: 1, y: 0 };
const stepExit = { opacity: 0, y: -10 };

export function SubmitGuess() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { playSfx, playVoice, playMusic, stopMusic } = useSoundEngine();
  const { isDemo, demoState, demoConfig, setDemoState } = useDemo();
  const { setSolveStep } = usePuzzleFlow();
  const [puzzleId, setPuzzleId] = useState("0");
  const [passphrase, setPassphrase] = useState("");
  const [step, setStep] = useState<SubmitStep>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [proofData, setProofData] = useState<ProveResult | null>(null);
  const [provingMessage, setProvingMessage] = useState<string>("");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore saved proof from localStorage on mount / puzzleId change
  useEffect(() => {
    if (isDemo || !puzzleId || puzzleId === "0") return;
    const saved = loadProof(puzzleId);
    if (saved && !proofData) {
      setProofData(saved);
      setStep("proof-ready");
    }
  }, [puzzleId, isDemo]); // eslint-disable-line react-hooks/exhaustive-deps

  const demoStep = isDemo ? demoConfig.submitStep : step;
  const demoProofData = isDemo ? (demoConfig.proofData as ProveResult | null) : proofData;
  const demoAddress = isDemo ? demoConfig.wallet.address : address;
  const demoConnected = isDemo ? demoConfig.wallet.isConnected : isConnected;
  const demoTickets = isDemo ? demoConfig.tickets.balance : undefined;

  // Sync real-mode step to shared context so IntentVisualizer can react
  useEffect(() => {
    if (!isDemo) {
      setSolveStep(step);
    }
  }, [step, isDemo, setSolveStep]);

  const activeStep = isDemo ? demoConfig.submitStep : step;
  useEffect(() => {
    switch (activeStep) {
      case "proving":
        playSfx("ticket_burn");
        break;
      case "wrong":
        playSfx("wrong_guess");
        playVoice("trapper-wrong");
        break;
      case "proof-ready":
        playSfx("proof_ready");
        playVoice("trapper-proof-valid");
        break;
      case "success":
        stopMusic();
        playSfx("prize_claimed");
        playMusic("victory");
        setTimeout(() => playVoice("trapper-broken"), 300);
        break;
    }
  }, [activeStep, playSfx, playVoice, playMusic, stopMusic]);

  // Read puzzle count for the selector
  const { data: puzzleCount } = useReadContract({
    address: BEAR_TRAP_ADDRESS,
    abi: bearTrapAbi,
    functionName: "puzzleCount",
    chainId: BASE_CHAIN_ID,
  });

  // Read ticket balance
  const { data: ticketBalance, refetch: refetchTicketBalance } = useReadContract({
    address: BEAR_TRAP_ADDRESS,
    abi: bearTrapAbi,
    functionName: "tickets",
    args: address ? [address] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address },
  });

  const {
    data: redeemHash,
    sendTransaction: sendRedeemTx,
    isPending: isRedeeming,
    error: redeemError,
  } = useSendTransaction();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: redeemHash });

  // Sync transaction confirmation to shared context (step stays "confirming" but UI shows success)
  useEffect(() => {
    if (!isDemo && isConfirmed) {
      setSolveStep("success");
    }
  }, [isConfirmed, isDemo, setSolveStep]);

  const markSolvedCalled = useRef(false);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isConfirmed || markSolvedCalled.current || !redeemHash) return;
    markSolvedCalled.current = true;
    clearSavedProof();

    fetch(`${BACKEND_URL}/api/mark-solved`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        txHash: redeemHash,
      }),
    }).catch((err) => {
      console.warn("Failed to call mark-solved (prize was still claimed):", err);
    });
  }, [isConfirmed, redeemHash]);

  useEffect(() => {
    if (isConfirmed || step === "success" || (isDemo && demoState === "success")) {
      const end = Date.now() + 2000;
      const colors = ["#22c55e", "#FFD700", "#B7410E"];
      (function frame() {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors });
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    }
  }, [isConfirmed, step, isDemo, demoState]);

  const count = isDemo ? 4 : (puzzleCount ? Number(puzzleCount) : 0);
  const tickets = demoTickets ?? (ticketBalance ? Number(ticketBalance) : 0);
  const hasTickets = tickets > 0;

  const startPolling = useCallback((proofRequestId: number) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    const poll = async () => {
      try {
        const statusResponse = await fetch(
          `${BACKEND_URL}/api/prove/status/${proofRequestId}`
        );
        const statusData = (await statusResponse.json()) as ProofStatusResult;

        if (statusData.status === "pending") {
          setProvingMessage(statusData.message || "Submitting to prover network...");
        } else if (statusData.status === "unknown") {
          setProvingMessage("Proof request submitted, waiting for prover...");
        } else if (statusData.status === "locked") {
          setProvingMessage("A prover is generating your proof...");
        } else if (statusData.status === "fulfilled") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          const proof: ProveResult = {
            seal: statusData.seal!,
            journal: statusData.journal!,
            solverAddress: statusData.solverAddress!,
            solutionHash: statusData.solutionHash!,
            delegation: statusData.delegation ?? null,
            prizeEth: statusData.prizeEth ?? null,
          };
          setProofData(proof);
          saveProof(puzzleId, proof);
          setStep("proof-ready");
          refetchTicketBalance();
        } else if (statusData.status === "failed") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          const errMsg = statusData.error || "Proof generation failed";
          if (errMsg.includes("Wrong guess")) {
            setErrorMessage(errMsg);
            setStep("wrong");
          } else {
            setErrorMessage(`${errMsg} (Your ticket was consumed.)`);
            setStep("error");
          }
          refetchTicketBalance();
        } else if (statusData.status === "expired") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          setErrorMessage("Proof request expired. Your ticket was consumed.");
          setStep("error");
          refetchTicketBalance();
        }
      } catch {
        // Network error during polling — keep trying
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 10000);
  }, [refetchTicketBalance]);

  const handleDemoSolve = useCallback(() => {
    setDemoState("proving");
    setTimeout(() => setDemoState("proof-ready"), 1500);
  }, [setDemoState]);

  const handleDemoClaim = useCallback(() => {
    setDemoState("claiming");
    setTimeout(() => setDemoState("success"), 1000);
  }, [setDemoState]);

  const handleSolvePuzzle = useCallback(async () => {
    if (!passphrase.trim() || !address) return;

    setStep("proving");
    setErrorMessage("");
    setProofData(null);
    setProvingMessage("Burning ticket & submitting proof request...");

    try {
      const message = `Bear Trap: solve puzzle ${parseInt(puzzleId)} with ${passphrase.trim()}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch(`${BACKEND_URL}/api/prove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passphrase: passphrase.trim(),
          solverAddress: address,
          puzzleId: parseInt(puzzleId),
          signature,
        }),
      });

      const data = await response.json();

      // 409 Conflict = proof request already in progress, resume polling
      if (response.status === 409 && data.proofRequestId) {
        setProvingMessage("Resuming existing proof request...");
        startPolling(data.proofRequestId);
        return;
      }

      if (!response.ok) {
        const error = data.error || "Proof generation failed";

        if (error.includes("Wrong guess")) {
          setErrorMessage(error);
          setStep("wrong");
          refetchTicketBalance();
          return;
        }

        if (error.includes("no tickets") || error.includes("No tickets") || error.includes("Buy tickets")) {
          setErrorMessage("You don't have any tickets. Buy tickets first!");
          setStep("error");
          return;
        }
        if (error.includes("AlreadySolved") || error.includes("already been solved")) {
          setErrorMessage("This puzzle has already been solved by another player.");
          setStep("error");
          return;
        }
        if (error.includes("InvalidPuzzleId") || error.includes("Invalid puzzle")) {
          setErrorMessage("This puzzle doesn't exist. Please refresh the page.");
          setStep("error");
          return;
        }

        if (error.includes("Signature") || error.includes("signature")) {
          setErrorMessage("Wallet signature verification failed. Please try again.");
          setStep("error");
          return;
        }

        if (error.includes("Rate limit") || response.status === 429) {
          setErrorMessage("Too many attempts. Please wait a minute and try again.");
          setStep("error");
          return;
        }

        if (error.includes("Server misconfiguration") || response.status === 500) {
          setErrorMessage("Something went wrong on our end. Please try again later.");
          setStep("error");
          return;
        }

        if (data.ticketBurned) {
          setErrorMessage(`${error} (Your ticket was consumed.)`);
          setStep("error");
          refetchTicketBalance();
          return;
        }

        throw new Error(error);
      }

      const submitted = data as ProveSubmittedResult;
      refetchTicketBalance();
      startPolling(submitted.proofRequestId);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to generate proof"
      );
      setStep("error");
    }
  }, [passphrase, address, puzzleId, signMessageAsync, refetchTicketBalance, startPolling]);

  const handleRedeemPrize = useCallback(() => {
    if (!proofData || !address || !proofData.delegation) return;

    const seal = proofData.seal as Hex;
    const journal = proofData.journal as Hex;
    const delegation = proofData.delegation;

    const caveatArgs = encodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes" }],
      [seal, journal]
    );

    // Ensure salt is always a properly padded bytes32 hex string.
    // An odd-length hex like "0x1" causes RPC "Invalid params" errors.
    const rawSalt = delegation.salt.startsWith("0x")
      ? delegation.salt as Hex
      : ("0x" + BigInt(delegation.salt).toString(16).padStart(64, "0")) as Hex;
    const paddedSalt = pad(rawSalt, { size: 32 });

    const signedDelegation: SdkDelegation = {
      delegate: delegation.delegate as Hex,
      delegator: delegation.delegator as Hex,
      authority: delegation.authority as Hex,
      caveats: delegation.caveats.map((c: DelegationCaveat) => ({
        enforcer: c.enforcer as Hex,
        terms: (c.terms || "0x") as Hex,
        // Only the ZKPEnforcer caveat gets seal+journal as args.
        // Match by enforcer address instead of assuming index position.
        args: c.enforcer.toLowerCase() === ZKP_ENFORCER_ADDRESS.toLowerCase()
          ? caveatArgs
          : ("0x" as Hex),
      })),
      salt: paddedSalt,
      signature: delegation.signature as Hex,
    };

    const prizeWei = proofData.prizeEth
      ? parseEther(proofData.prizeEth)
      : BigInt(0);
    const execution = createExecution({
      target: address,
      value: prizeWei,
      callData: "0x" as Hex,
    });

    const redeemCalldata = contracts.DelegationManager.encode.redeemDelegations({
      delegations: [[signedDelegation]],
      modes: [ExecutionMode.SingleDefault],
      executions: [[execution]],
    });

    sendRedeemTx({
      to: DELEGATION_MANAGER_ADDRESS,
      data: redeemCalldata,
      chainId: BASE_CHAIN_ID,
    });

    setStep("confirming");
  }, [proofData, address, sendRedeemTx]);

  // Reset flow — if we have a valid proof, go back to proof-ready instead of wiping it
  const handleReset = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setErrorMessage("");
    setProvingMessage("");
    markSolvedCalled.current = false;

    if (proofData) {
      // Proof still valid — let user retry the redeem tx
      setStep("proof-ready");
    } else {
      // No proof — full reset
      setStep("idle");
      setPassphrase("");
      setProofData(null);
      clearSavedProof();
    }
  }, [proofData]);

  const displayStep = isDemo ? demoStep : step;
  const displayConnected = isDemo ? demoConnected : isConnected;
  const displayProofData = isDemo ? demoProofData : proofData;
  const displayConfirmed = isDemo ? demoState === "success" : isConfirmed;
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
        <AnimatePresence mode="wait">
          {displayStep === "idle" && (
            <motion.div
              key="idle"
              initial={stepInitial}
              animate={stepAnimate}
              exit={stepExit}
              transition={stepTransition}
              className="space-y-5"
            >
              <div>
                <label className="block text-xs font-mono text-trap-muted mb-2 uppercase tracking-wider">
                  Puzzle ID
                </label>
                <select
                  value={puzzleId}
                  onChange={(e) => setPuzzleId(e.target.value)}
                  disabled={!displayConnected || count === 0}
                  className="w-full rounded-lg bg-trap-black/80 border border-trap-border px-4 py-3 min-h-12 font-mono text-base sm:text-sm text-trap-text focus:outline-none focus:border-trap-green/50 focus:ring-1 focus:ring-trap-green/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed appearance-none"
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

              <div>
                <label className="block text-xs font-mono text-trap-muted mb-2 uppercase tracking-wider">
                  Secret Passphrase
                </label>
                <input
                  type="text"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  disabled={!displayConnected}
                  className="w-full rounded-lg bg-trap-black/80 border border-trap-border px-4 py-3 min-h-12 font-mono text-base sm:text-sm text-trap-text placeholder-trap-muted/50 focus:outline-none focus:border-trap-green/50 focus:ring-1 focus:ring-trap-green/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  placeholder="Enter the secret passphrase..."
                />
              </div>

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

              {!displayConnected ? (
                <div className="rounded-lg border border-trap-border/30 bg-trap-black/30 p-4 text-center">
                  <p className="text-xs text-trap-muted font-mono">
                    Connect your wallet to submit a guess
                  </p>
                </div>
              ) : (
                <button
                  disabled={
                    !isDemo && (!hasTickets || !passphrase.trim() || count === 0)
                  }
                  className="w-full rounded-lg bg-trap-green/10 border border-trap-green/30 px-4 py-3 min-h-12 font-mono text-sm font-medium text-trap-green hover:bg-trap-green/20 hover:border-trap-green/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-trap-green/10"
                  onClick={isDemo ? handleDemoSolve : handleSolvePuzzle}
                >
                  {!hasTickets
                    ? "No tickets -- buy tickets first"
                    : count === 0
                    ? "No puzzles available"
                    : "Solve Puzzle"}
                </button>
              )}

              {displayConnected && (
                <p className="text-center text-xs font-mono text-trap-muted">
                  You have{" "}
                  <span className="text-trap-green font-medium">{tickets}</span>{" "}
                  ticket{tickets !== 1 ? "s" : ""} remaining
                </p>
              )}
            </motion.div>
          )}

          {displayStep === "proving" && (
            <motion.div
              key="proving"
              initial={stepInitial}
              animate={stepAnimate}
              exit={stepExit}
              transition={stepTransition}
              className="py-8 text-center space-y-4"
            >
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
                  {provingMessage || "Burning ticket & generating proof..."}
                </p>
                <p className="text-xs text-trap-muted mt-1">
                  Your ticket has been consumed. Generating zero-knowledge proof...
                  This may take several minutes.
                </p>
              </div>
            </motion.div>
          )}

          {displayStep === "proof-ready" && (
            <motion.div
              key="proof-ready"
              initial={stepInitial}
              animate={stepAnimate}
              exit={stepExit}
              transition={stepTransition}
              className="py-8 text-center space-y-4"
            >
              <motion.div
                animate={{
                  boxShadow: [
                    "0 0 20px rgba(255,215,0,0.2)",
                    "0 0 40px rgba(255,215,0,0.4)",
                    "0 0 20px rgba(255,215,0,0.2)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="inline-flex rounded-full mx-auto"
              >
                <BearTrapSVG state="closed" size={48} />
              </motion.div>
              <div>
                <p className="font-display text-lg text-trap-green">
                  Proof Generated!
                </p>
                <p className="text-xs text-trap-muted mt-1">
                  Submit the transaction to claim your prize.
                </p>
              </div>
              <button
                onClick={isDemo ? handleDemoClaim : handleRedeemPrize}
                className="w-full rounded-lg bg-trap-green/10 border border-trap-green/30 px-4 py-3 min-h-12 font-mono text-sm font-medium text-trap-green hover:bg-trap-green/20 hover:border-trap-green/50 transition-all"
              >
                Claim Prize
              </button>
            </motion.div>
          )}

          {displayStep === "confirming" && (
            <motion.div
              key="confirming"
              initial={stepInitial}
              animate={stepAnimate}
              exit={stepExit}
              transition={stepTransition}
              className="py-8 text-center space-y-4"
            >
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
            </motion.div>
          )}

          {(displayConfirmed || displayStep === "success") && (
            <motion.div
              key="success"
              initial={stepInitial}
              animate={stepAnimate}
              exit={stepExit}
              transition={stepTransition}
              className="py-8 text-center space-y-4"
            >
              <div className="mx-auto">
                <BearTrapSVG state="opening" size={48} />
              </div>
              <div>
                <p className="font-display text-lg text-trap-green">
                  Puzzle Solved! Prize Claimed!
                </p>
                {displayProofData?.prizeEth && (
                  <p className="font-display text-2xl text-trap-gold mt-2">
                    <AnimatedCounter value={displayProofData.prizeEth} /> ETH
                  </p>
                )}
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
                className="w-full rounded-lg bg-trap-dark border border-trap-border px-4 py-3 min-h-12 font-mono text-sm text-trap-muted hover:text-trap-text hover:border-trap-border transition-all"
              >
                Solve Another Puzzle
              </button>
            </motion.div>
          )}

          {displayStep === "wrong" && (
            <motion.div
              key="wrong"
              initial={stepInitial}
              animate={{ ...stepAnimate, x: [0, -8, 8, -6, 6, -3, 3, 0] }}
              exit={stepExit}
              transition={stepTransition}
              className="space-y-4"
            >
              <motion.div
                animate={{ x: [0, -8, 8, -6, 6, -3, 3, 0] }}
                transition={{ duration: 0.5 }}
              >
                <div className="py-8 text-center space-y-4">
                  <div className="mx-auto">
                    <BearTrapSVG state="snapping" size={48} />
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
              </motion.div>
              <button
                onClick={handleReset}
                className="w-full rounded-lg bg-trap-dark border border-trap-border px-4 py-3 min-h-12 font-mono text-sm text-trap-muted hover:text-trap-text hover:border-trap-border transition-all"
              >
                Try Again
              </button>
            </motion.div>
          )}

          {(displayStep === "error" || displayError) &&
            displayStep !== "success" &&
            displayStep !== "wrong" &&
            !displayConfirmed && (
              <motion.div
                key="error"
                initial={stepInitial}
                animate={stepAnimate}
                exit={stepExit}
                transition={stepTransition}
                className="space-y-4"
              >
                <TrapperError
                  type={
                    displayError?.includes("proof") || displayError?.includes("Proof")
                      ? "proof"
                      : displayError?.includes("transaction") || displayError?.includes("Transaction") || displayError?.includes("rejected") || redeemError
                      ? "transaction"
                      : "generic"
                  }
                  message={displayError || undefined}
                  onRetry={handleReset}
                />
              </motion.div>
            )}
        </AnimatePresence>
      </div>
    </section>
  );
}
