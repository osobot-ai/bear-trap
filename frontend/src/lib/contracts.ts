import { type Address } from "viem";

export const BASE_CHAIN_ID = 8453 as const;

export const BEAR_TRAP_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_BEAR_TRAP_ADDRESS as Address) ??
  "0x0000000000000000000000000000000000000000";

export const OSO_TOKEN_ADDRESS: Address =
  "0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e";

/**
 * Cost per ticket in $OSO (raw token units).
 * The BearTrap contract defines this as TICKET_PRICE.
 * 1000 OSO tokens per ticket (assuming 18 decimals).
 */
export const TICKET_PRICE_DISPLAY = "1,000";
export const TICKET_PRICE_RAW = BigInt("1000000000000000000000"); // 1000 * 1e18
