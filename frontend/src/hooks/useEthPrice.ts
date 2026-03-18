"use client";

import { useState, useEffect, useRef } from "react";

interface EthPriceResult {
  ethPrice: number | null;
  isLoading: boolean;
}

const CACHE_TTL_MS = 60_000; // 60 seconds

let cachedPrice: number | null = null;
let cachedAt = 0;

export function useEthPrice(): EthPriceResult {
  const [ethPrice, setEthPrice] = useState<number | null>(cachedPrice);
  const [isLoading, setIsLoading] = useState(cachedPrice === null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    const now = Date.now();

    // Use cache if fresh
    if (cachedPrice !== null && now - cachedAt < CACHE_TTL_MS) {
      setEthPrice(cachedPrice);
      setIsLoading(false);
      return;
    }

    // Prevent duplicate fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    async function fetchPrice() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
          { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const price = data?.ethereum?.usd ?? null;

        if (price !== null) {
          cachedPrice = price;
          cachedAt = Date.now();
        }

        setEthPrice(price);
      } catch {
        // Keep stale cache if available, otherwise null
        setEthPrice(cachedPrice);
      } finally {
        setIsLoading(false);
        fetchingRef.current = false;
      }
    }

    fetchPrice();
  }, []);

  return { ethPrice, isLoading };
}

export function formatUsd(ethAmount: string | null, ethPrice: number | null): string | null {
  if (!ethAmount || ethPrice === null) return null;
  const usd = parseFloat(ethAmount) * ethPrice;
  if (isNaN(usd) || usd === 0) return "$0.00";
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
