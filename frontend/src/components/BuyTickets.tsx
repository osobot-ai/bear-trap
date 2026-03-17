"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useCapabilities, useSendCalls, useCallsStatus } from "wagmi/experimental";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits, encodeFunctionData } from "viem";
import { bearTrapAbi } from "@/lib/abi/bearTrap";
import { erc20Abi } from "@/lib/abi/erc20";
import {
  BEAR_TRAP_ADDRESS,
  OSO_TOKEN_ADDRESS,
  BASE_CHAIN_ID,
} from "@/lib/contracts";
import { useTicketPrice } from "@/lib/useTicketPrice";
import { TrapperError } from "./TrapperError";
import { useDemo } from "@/lib/demo-context";

export function BuyTickets() {
  const { address, isConnected, chain } = useAccount();
  const { isDemo, demoConfig } = useDemo();
  const { priceRaw, priceDisplay } = useTicketPrice();
  const queryClient = useQueryClient();
  const [ticketAmount, setTicketAmount] = useState("1");
  const [step, setStep] = useState<"approve" | "buy">("approve");
  const [batchStatus, setBatchStatus] = useState<"idle" | "pending" | "confirming" | "success" | "error">("idle");
  const [batchId, setBatchId] = useState<string | undefined>(undefined);
  const [txError, setTxError] = useState<string | null>(null);
  const [demoBuySuccess, setDemoBuySuccess] = useState(false);

  // Invalidate all contract read queries so both BuyTickets AND SubmitGuess get fresh data
  const invalidateContractQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["readContract"] });
  }, [queryClient]);

  // Detect EIP-5792 batch capabilities
  const { data: capabilities } = useCapabilities();
  const currentChainId = chain?.id;
  const chainIdHex = currentChainId ? (`0x${currentChainId.toString(16)}` as `0x${string}`) : undefined;
  const atomicStatus = chainIdHex
    ? (capabilities as Record<string, Record<string, { status?: string }>> | undefined)?.[chainIdHex]?.atomic?.status
    : undefined;
  const supportsBatch = atomicStatus === "supported" || atomicStatus === "ready";

  // Batched sendCalls hook
  const { sendCalls, isPending: isBatchPending } = useSendCalls();

  // Track batch tx confirmation via wallet_getCallsStatus
  const { data: callsStatus } = useCallsStatus({
    id: batchId as string,
    query: { enabled: !!batchId && batchStatus === "confirming", refetchInterval: 2000 },
  });

  // Read $OSO balance
  const { data: osoBalance } = useReadContract({
    address: OSO_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address },
  });

  // Read current allowance
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: OSO_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, BEAR_TRAP_ADDRESS] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address },
  });

  // Read ticket balance
  const { data: ticketBalance, refetch: refetchTickets } = useReadContract({
    address: BEAR_TRAP_ADDRESS,
    abi: bearTrapAbi,
    functionName: "tickets",
    args: address ? [address] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address },
  });

  const {
    data: approveHash,
    writeContract: approve,
    isPending: isApproving,
    error: approveError,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    data: buyHash,
    writeContract: buy,
    isPending: isBuying,
    error: buyError,
  } = useWriteContract();

  const { isLoading: isBuyConfirming, isSuccess: isBuyConfirmed } =
    useWaitForTransactionReceipt({ hash: buyHash });

  const parsedAmount = parseInt(ticketAmount) || 0;
  const totalCost = priceRaw * BigInt(parsedAmount);
  const hasEnoughBalance = osoBalance ? osoBalance >= totalCost : false;
  const canAffordOneTicket = osoBalance ? osoBalance >= priceRaw : false;

  const FLAUNCH_URL = "https://flaunch.gg/base/coin/0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e";
  const hasEnoughAllowance = currentAllowance ? currentAllowance >= totalCost : false;

  useEffect(() => {
    if (approveError) setTxError(approveError.message);
    if (buyError) setTxError(buyError.message);
  }, [approveError, buyError]);

  useEffect(() => {
    if (hasEnoughAllowance) {
      setStep("buy");
    } else {
      setStep("approve");
    }
  }, [hasEnoughAllowance]);

  // Refetch after successful approve
  useEffect(() => {
    if (isApproveConfirmed) {
      invalidateContractQueries();
    }
  }, [isApproveConfirmed, invalidateContractQueries]);

  // Refetch after successful buy (non-batch flow)
  useEffect(() => {
    if (isBuyConfirmed) {
      invalidateContractQueries();
    }
  }, [isBuyConfirmed, invalidateContractQueries]);

  // Refetch after batch tx confirms on-chain
  useEffect(() => {
    if (callsStatus?.status === "CONFIRMED") {
      setBatchStatus("success");
      setBatchId(undefined);
      invalidateContractQueries();
    }
  }, [callsStatus?.status, invalidateContractQueries]);

  function handleApprove() {
    if (!parsedAmount || parsedAmount <= 0) return;
    setTxError(null);
    approve({
      address: OSO_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [BEAR_TRAP_ADDRESS, totalCost],
      chainId: BASE_CHAIN_ID,
    });
  }

  function handleBuy() {
    if (!parsedAmount || parsedAmount <= 0) return;
    setTxError(null);
    buy({
      address: BEAR_TRAP_ADDRESS,
      abi: bearTrapAbi,
      functionName: "buyTickets",
      args: [BigInt(parsedAmount)],
      chainId: BASE_CHAIN_ID,
    });
  }

  function handleBatchBuy() {
    if (!parsedAmount || parsedAmount <= 0) return;
    setTxError(null);
    setBatchStatus("pending");

    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [BEAR_TRAP_ADDRESS, totalCost],
    });

    const buyData = encodeFunctionData({
      abi: bearTrapAbi,
      functionName: "buyTickets",
      args: [BigInt(parsedAmount)],
    });

    sendCalls(
      {
        calls: [
          {
            to: OSO_TOKEN_ADDRESS,
            data: approveData,
          },
          {
            to: BEAR_TRAP_ADDRESS,
            data: buyData,
          },
        ],
      },
      {
        onSuccess: (result) => {
          // sendCalls returns { id: string } or just a string depending on wagmi version
          const id = typeof result === "string" ? result : (result as { id?: string })?.id;
          setBatchId(id);
          setBatchStatus("confirming");
        },
        onError: (err) => {
          setBatchStatus("error");
          setTxError(err instanceof Error ? err.message : "Transaction failed");
        },
      },
    );
  }

  const isProcessing = isApproving || isApproveConfirming || isBuying || isBuyConfirming || isBatchPending || batchStatus === "pending" || batchStatus === "confirming";

  const displayConnected = isDemo ? demoConfig.wallet.isConnected : isConnected;

  const formattedBalance = isDemo
    ? Number(demoConfig.tickets.osoBalance).toLocaleString()
    : osoBalance
      ? parseFloat(formatUnits(osoBalance, 18)).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })
      : "0";

  const formattedTickets = isDemo
    ? demoConfig.tickets.balance.toString()
    : ticketBalance ? Number(ticketBalance).toString() : "0";

  function handleDemoBuy() {
    setDemoBuySuccess(false);
    setBatchStatus("pending");
    setTimeout(() => {
      setBatchStatus("idle");
      setDemoBuySuccess(true);
    }, 1000);
  }

  return (
    <section className="glass-panel noise-overlay rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="border-b border-trap-border/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-trap-amber/10 border border-trap-amber/20">
            <svg
              className="h-4 w-4 text-trap-amber"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg text-white">Buy Tickets</h3>
            <p className="text-xs text-trap-muted">
              {priceDisplay} $OSO per ticket
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Balances */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-trap-black/50 border border-trap-border/30 p-3">
            <p className="text-[10px] font-mono text-trap-muted uppercase tracking-wider mb-1">
              $OSO Balance
            </p>
            <p className="font-mono text-sm text-trap-text font-medium">
              {displayConnected ? formattedBalance : "--"}
            </p>
          </div>
          <div className="rounded-lg bg-trap-black/50 border border-trap-border/30 p-3">
            <p className="text-[10px] font-mono text-trap-muted uppercase tracking-wider mb-1">
              Your Tickets
            </p>
            <p className="font-mono text-sm text-trap-green font-medium">
              {displayConnected ? formattedTickets : "--"}
            </p>
          </div>
        </div>

        {/* Ticket input */}
        <div>
          <label className="block text-xs font-mono text-trap-muted mb-2 uppercase tracking-wider">
            Number of Tickets
          </label>
          <div className="relative">
            <input
              type="number"
              min="1"
              max="100"
              value={ticketAmount}
              onChange={(e) => setTicketAmount(e.target.value)}
              disabled={!displayConnected}
              className="w-full rounded-lg bg-trap-black/80 border border-trap-border px-4 py-3 min-h-12 font-mono text-base sm:text-sm text-trap-text placeholder-trap-muted/50 focus:outline-none focus:border-trap-green/50 focus:ring-1 focus:ring-trap-green/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              placeholder="1"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-trap-muted">
              tickets
            </div>
          </div>
          {parsedAmount > 0 && (
            <p className="mt-2 text-xs font-mono text-trap-muted">
              Total cost:{" "}
              <span className="text-trap-amber">
                {(parsedAmount * Number(priceRaw / BigInt(10 ** 18))).toLocaleString()} $OSO
              </span>
            </p>
          )}
        </div>

        {!displayConnected ? (
          <div className="rounded-lg border border-trap-border/30 bg-trap-black/30 p-4 text-center">
            <p className="text-xs text-trap-muted font-mono">
              Connect your wallet to buy tickets
            </p>
          </div>
        ) : !isDemo && !canAffordOneTicket && osoBalance !== undefined ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-trap-amber/30 bg-trap-amber/5 p-4 text-center">
              <p className="text-xs text-trap-muted font-mono mb-3">
                You need at least <span className="text-trap-amber">{priceDisplay} $OSO</span> to buy a ticket
              </p>
              <a
                href={FLAUNCH_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-trap-amber/10 border border-trap-amber/30 px-6 py-3 min-h-12 font-mono text-sm font-medium text-trap-amber hover:bg-trap-amber/20 hover:border-trap-amber/50 transition-all"
              >
                Get $OSO
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </div>
        ) : isDemo ? (
          <div className="space-y-3">
            <button
              onClick={handleDemoBuy}
              disabled={batchStatus === "pending" || parsedAmount <= 0}
              className="w-full rounded-lg bg-trap-green/10 border border-trap-green/30 px-4 py-3 min-h-12 font-mono text-sm font-medium text-trap-green hover:bg-trap-green/20 hover:border-trap-green/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-trap-green/10"
            >
              {batchStatus === "pending"
                ? "Confirming..."
                : `Buy ${parsedAmount} Ticket${parsedAmount !== 1 ? "s" : ""}`}
            </button>

            {demoBuySuccess && (
              <p className="text-xs font-mono text-trap-green text-center">
                Tickets purchased successfully.
              </p>
            )}
          </div>
        ) : supportsBatch ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono text-trap-muted">
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold bg-trap-gold/20 text-trap-gold border border-trap-gold/30">
                ⚡
              </span>
              <span className="text-trap-gold">One-click buy (batched)</span>
            </div>

            <button
              onClick={handleBatchBuy}
              disabled={isProcessing || parsedAmount <= 0 || !hasEnoughBalance}
              className="w-full rounded-lg bg-trap-gold/10 border border-trap-gold/30 px-4 py-3 min-h-12 font-mono text-sm font-medium text-trap-gold hover:bg-trap-gold/20 hover:border-trap-gold/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-trap-gold/10"
            >
              {isBatchPending || batchStatus === "pending" || batchStatus === "confirming"
                ? "Confirming..."
                : !hasEnoughBalance
                ? "Insufficient $OSO"
                : `Buy ${parsedAmount} Ticket${parsedAmount !== 1 ? "s" : ""}`}
            </button>

            {batchStatus === "success" && (
              <p className="text-xs font-mono text-trap-green text-center">
                Tickets purchased successfully.
              </p>
            )}
            {batchStatus === "error" && (
              <TrapperError
                type="transaction"
                message={txError || undefined}
                onRetry={() => {
                  setBatchStatus("idle");
                  setTxError(null);
                }}
              />
            )}
          </div>
        ) : (
          /* Fallback 2-step flow */
          <div className="space-y-3">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-xs font-mono text-trap-muted">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  step === "approve"
                    ? "bg-trap-green/20 text-trap-green border border-trap-green/30"
                    : "bg-trap-green text-trap-black"
                }`}
              >
                1
              </span>
              <span className={step === "approve" ? "text-trap-text" : "text-trap-green"}>
                Approve
              </span>
              <div className="h-px flex-1 bg-trap-border/50" />
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  step === "buy"
                    ? "bg-trap-green/20 text-trap-green border border-trap-green/30"
                    : "bg-trap-border/30 text-trap-muted"
                }`}
              >
                2
              </span>
              <span className={step === "buy" ? "text-trap-text" : "text-trap-muted"}>
                Buy
              </span>
            </div>

            {step === "approve" ? (
              <button
                onClick={handleApprove}
                disabled={isProcessing || parsedAmount <= 0 || !hasEnoughBalance}
                className="w-full rounded-lg bg-trap-amber/10 border border-trap-amber/30 px-4 py-3 min-h-12 font-mono text-sm font-medium text-trap-amber hover:bg-trap-amber/20 hover:border-trap-amber/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-trap-amber/10"
              >
                {isApproving
                  ? "Approving..."
                  : isApproveConfirming
                  ? "Confirming..."
                  : !hasEnoughBalance
                  ? "Insufficient $OSO"
                  : "Approve $OSO"}
              </button>
            ) : (
              <button
                onClick={handleBuy}
                disabled={isProcessing || parsedAmount <= 0}
                className="w-full rounded-lg bg-trap-green/10 border border-trap-green/30 px-4 py-3 min-h-12 font-mono text-sm font-medium text-trap-green hover:bg-trap-green/20 hover:border-trap-green/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-trap-green/10"
              >
                {isBuying
                  ? "Buying..."
                  : isBuyConfirming
                  ? "Confirming..."
                  : `Buy ${parsedAmount} Ticket${parsedAmount !== 1 ? "s" : ""}`}
              </button>
            )}

            {isBuyConfirmed && (
              <p className="text-xs font-mono text-trap-green text-center">
                Tickets purchased successfully.
              </p>
            )}

            {txError && !isBuyConfirmed && batchStatus !== "error" && (
              <TrapperError
                type="transaction"
                message={txError}
                onRetry={() => setTxError(null)}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
