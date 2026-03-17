import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { bearTrapAbi } from "@/lib/abi/bearTrap";
import {
  BEAR_TRAP_ADDRESS,
  BASE_CHAIN_ID,
  TICKET_PRICE_RAW,
  TICKET_PRICE_DISPLAY,
} from "@/lib/contracts";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Reads ticket price from the BearTrap contract on-chain.
 * Falls back to hardcoded constants while loading so the UI never shows 0 or blank.
 */
export function useTicketPrice(): {
  priceRaw: bigint;
  priceDisplay: string;
  isLoading: boolean;
} {
  const { data, isLoading } = useReadContract({
    address: BEAR_TRAP_ADDRESS,
    abi: bearTrapAbi,
    functionName: "ticketPrice",
    chainId: BASE_CHAIN_ID,
    query: { staleTime: FIVE_MINUTES_MS },
  });

  const priceRaw: bigint = data ?? TICKET_PRICE_RAW;

  const priceDisplay: string = data
    ? parseFloat(formatUnits(data, 18)).toLocaleString()
    : TICKET_PRICE_DISPLAY;

  return { priceRaw, priceDisplay, isLoading };
}
