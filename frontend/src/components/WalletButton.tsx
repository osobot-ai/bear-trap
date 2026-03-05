"use client";

import { useAccount, useDisconnect } from "wagmi";
import { useWeb3AuthConnect } from "@web3auth/modal/react";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, loading } = useWeb3AuthConnect();
  const { disconnect } = useDisconnect();

  const truncatedAddress = address
    ? address.slice(0, 6) + "..." + address.slice(-4)
    : "";

  return (
    <button
      onClick={() => (isConnected ? disconnect() : connect())}
      disabled={loading}
      className={`
        relative group flex items-center gap-2.5 rounded-lg px-4 py-2.5
        font-mono text-sm font-medium transition-all duration-300
        ${
          isConnected
            ? "bg-trap-dark border border-trap-border hover:border-trap-red/40 text-trap-text"
            : "bg-trap-green/10 border border-trap-green/30 hover:bg-trap-green/20 hover:border-trap-green/50 text-trap-green"
        }
      `}
    >
      {isConnected ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-trap-green opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-trap-green" />
          </span>
          <span>{truncatedAddress}</span>
        </>
      ) : (
        <>
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M22 10H2" />
            <circle cx="17" cy="14" r="1.5" />
          </svg>
          <span>{loading ? "Connecting..." : "Connect Wallet"}</span>
        </>
      )}
      <div className="absolute inset-0 rounded-lg bg-trap-green/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </button>
  );
}
