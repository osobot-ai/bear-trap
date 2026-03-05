"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Web3AuthProvider } from "@web3auth/modal/react";
import { WagmiProvider } from "@web3auth/modal/react/wagmi";
import { web3AuthContextConfig } from "@/lib/web3authConfig";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useState, useEffect, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-trap-black">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🐻</div>
          <p className="text-trap-muted text-sm font-mono">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Web3AuthProvider config={web3AuthContextConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
        </WagmiProvider>
      </QueryClientProvider>
    </Web3AuthProvider>
  );
}
