import { type Address } from "viem";

export const BASE_CHAIN_ID = 8453 as const;

export const BEAR_TRAP_ADDRESS: Address =
  (process.env.NEXT_PUBLIC_BEAR_TRAP_ADDRESS as Address) ??
  "0x0000000000000000000000000000000000000000";

export const OSO_TOKEN_ADDRESS: Address =
  "0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e";

/** MetaMask Delegation Manager on Base */
export const DELEGATION_MANAGER_ADDRESS: Address =
  "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";

/**
 * Cost per ticket in $OSO (raw token units).
 * The BearTrap contract defines this as TICKET_PRICE.
 * 1000 OSO tokens per ticket (assuming 18 decimals).
 */
export const TICKET_PRICE_DISPLAY = "1,000";
export const TICKET_PRICE_RAW = BigInt("1000000000000000000000"); // 1000 * 1e18

/** Backend API URL (Rust axum server on Railway). */
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";
