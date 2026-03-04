import { type Address } from "viem";

export const BASE_SEPOLIA_CHAIN_ID = 84532 as const;

// Chain-specific addresses
const DELEGATION_MANAGER_DEFAULT = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as Address;

export const CONTRACTS = {
  mainnet: {
    bearTrap: (process.env.NEXT_PUBLIC_BEAR_TRAP_ADDRESS ??
      "0x0000000000000000000000000000000000000000") as Address,
    delegationManager: (process.env.NEXT_PUBLIC_DELEGATION_MANAGER_ADDRESS ??
      DELEGATION_MANAGER_DEFAULT) as Address,
    osoToken: "0xc78fabc2cb5b9cf59e0af3da8e3bc46d47753a4e" as Address,
    chainId: 8453 as const,
  },
  testnet: {
    bearTrap: (process.env.NEXT_PUBLIC_BEAR_TRAP_ADDRESS ??
      "0x0000000000000000000000000000000000000000") as Address,
    delegationManager: (process.env.NEXT_PUBLIC_DELEGATION_MANAGER_ADDRESS ??
      DELEGATION_MANAGER_DEFAULT) as Address,
    osoToken: (process.env.NEXT_PUBLIC_OSO_TOKEN_ADDRESS ??
      "0x0000000000000000000000000000000000000000") as Address,
    chainId: 84532 as const,
  },
} as const;

export const ACTIVE_ENV = (process.env.NEXT_PUBLIC_ENVIRONMENT ||
  "testnet") as keyof typeof CONTRACTS;
export const ACTIVE_CONTRACTS = CONTRACTS[ACTIVE_ENV];

// Convenience re-exports matching the old API for backward compatibility
export const BASE_CHAIN_ID = ACTIVE_CONTRACTS.chainId;
export const BEAR_TRAP_ADDRESS = ACTIVE_CONTRACTS.bearTrap;
export const OSO_TOKEN_ADDRESS = ACTIVE_CONTRACTS.osoToken;
export const DELEGATION_MANAGER_ADDRESS = ACTIVE_CONTRACTS.delegationManager;

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
